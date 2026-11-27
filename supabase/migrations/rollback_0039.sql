-- rollback_0039 — تراجع «ترتيب الموادّ وألوان الرصيد» (0039_store_order_colors): يرجّع public.day_balance_sections كما في 0035 وpublic.items_overview
--   كما في 0020 حرفاً بحرف (المنح باقٍ: create or replace لا يغيّره)، ويُسقط الدوالّ الجديدة والجداول الثلاثة.
-- **طريق رفض**: ترتيب محفوظ لقسم (بموادّ)، أو صفّ لون أو حدّ لمادّة (ولو مُسح لونها: الصفّ يبقى بنسخته)، أو إعدادات ألوان، يوقف التراجع بصوت بلا
--   أن يغيّر شيئاً (إسقاط الجداول يضيعها). وما بعد الكتلة يكمل على كلّ بيانات (يُسقطها)، فضابط المشغّل يرى التراجع يكمل بلاها.
-- تنعاد بأمان: drop if exists، وcreate or replace.

set lock_timeout = '5s';

lock table public.store_orders, public.item_marks, public.store_color_settings in access exclusive mode;

-- ٠) طريق الرفض.
do $$
declare
  v_orders bigint;
  v_marks bigint;
  v_settings bigint;
begin
  select count(*) into v_orders from public.store_orders where cardinality(item_ids) > 0;
  select count(*) into v_marks from public.item_marks;
  select count(*) into v_settings from public.store_color_settings;
  if v_orders + v_marks + v_settings > 0 then
    raise exception 'rollback_blocked' using hint = format('يوجد %s ترتيب قسم و%s لون أو حدّ لمادّة و%s إعدادات ألوان، والتراجع يمسحها. لا تراجع لـ0039 بعد استعمالها.',
      v_orders, v_marks, v_settings);
  end if;
end
$$;

-- ١) الدوالّ الجديدة.
drop function if exists public.store_section_items(text);
drop function if exists public.set_store_order(text, uuid[], uuid[]);
drop function if exists public.set_item_color(uuid, text, int);
drop function if exists public.set_item_low(uuid, numeric, int);
drop function if exists public.set_store_colors(boolean, text, text, int);
drop function if exists public.item_mark(uuid);

-- ٢) القارئان كما في 0035 و0020.
create or replace function public.day_balance_sections(p_on date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_on date := coalesce(p_on, public.app_today());
  v_sections jsonb;
begin
  perform private.require('read');
  if not isfinite(v_on) then
    raise exception 'date_required' using hint = 'اختر يوماً من التقويم.';
  end if;
  if v_on > v_today then
    raise exception 'day_in_future' using hint = format('يوم %s لم يأتِ بعد؛ الرصيد يُعرض حتى اليوم %s.', to_char(v_on, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY'));
  end if;
  with stores as (
    select y.id, y.kind from public.warehouses y where y.org_id = v_org and public.in_scope_wh(y.id)
  ), picked as (
    select i.id, i.name, i.name_norm, i.kind, i.base_unit, i.category_id,
      case when i.kind in ('raw', 'additive') then 'feed_materials' when i.kind = 'feed' then 'feed' else 'other' end as section
    from public.items i
    where i.org_id = v_org and i.archived_at is null and exists (select 1 from stores s where private.item_admissible(s.kind, i.kind))
  ), bal as (
    select m.item_id, sum(m.qty) as qty from public.stock_moves m
    where m.org_id = v_org and m.moved_on <= v_on and m.item_id in (select p.id from picked p) and m.warehouse_id in (select s.id from stores s)
    group by m.item_id
  ), listed as (
    select p.section, p.id, p.name_norm, c.id as category_id, c.name as category_name, array_position(c.item_order, p.id) as pos,
      jsonb_build_object('item_id', p.id, 'name', p.name, 'kind', p.kind, 'base_unit', p.base_unit, 'qty', round(coalesce(b.qty, 0), 3)::text,
        'note', case when n.id is null then null else jsonb_build_object('text', n.note, 'version', n.version) end,
        'category', case when c.id is null then null else jsonb_build_object('id', c.id, 'name', c.name) end) as j
    from picked p
    left join bal b on b.item_id = p.id
    left join public.item_categories c on c.org_id = v_org and c.id = p.category_id and c.archived_at is null
    left join public.stock_day_notes n on n.org_id = v_org and n.item_id = p.id and n.on_date = v_on
  )
  select jsonb_agg(jsonb_build_object('key', k.key, 'rows', coalesce((select jsonb_agg(r.j order by r.category_id is null, r.category_name collate "C",
        r.category_id, r.pos nulls last, r.name_norm collate "C", r.id) from listed r where r.section = k.key), '[]'::jsonb)) order by k.n)
  into v_sections
  from (values (1, 'feed_materials'), (2, 'feed'), (3, 'other')) as k(n, key);
  return jsonb_build_object('today', v_today, 'on', v_on, 'can_note', public.can('stock_note.write'), 'sections', v_sections);
end
$$;

create or replace function public.items_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_record boolean;
  v_result jsonb;
begin
  perform private.require('read');
  v_record := public.can('purchase.record');
  with hand as (
    select s.item_id, sum(s.qty) as qty from public.stock_balances s
    where s.org_id = v_org and public.in_scope_wh(s.warehouse_id)
    group by s.item_id
  ), lines as (
    select l.item_id, l.qty_in, r.received_on, coalesce(rv.new_total, la.line_total, 0) as value,
      (pp.id is not null and pp.unit_price is null and rv.new_total is null) as unpriced
    from public.stock_lots l
    join public.receipts r on r.org_id = l.org_id and r.id = l.source_id
    left join public.receipt_line_amounts la on la.org_id = l.org_id and la.line_id = l.source_line_id
    left join public.purchase_prices pp on pp.org_id = l.org_id and pp.line_id = l.source_line_id
    left join lateral (
      select v.new_total from public.receipt_revaluations v
      where v.org_id = l.org_id and v.receipt_line_id = l.source_line_id and v.status = 'posted' order by v.rev_no desc limit 1
    ) as rv on true
    where l.org_id = v_org and l.source_kind = 'receipt' and l.origin_lot_id is null and r.status = 'posted' and public.in_scope_wh(l.warehouse_id)
  ), buys as (
    select x.item_id, sum(x.qty_in) as qty, coalesce(sum(x.qty_in) filter (where not x.unpriced), 0) as priced_qty, sum(x.value) as value,
      max(x.received_on) as last_on, (count(*) filter (where x.unpriced))::int as unpriced
    from lines x group by x.item_id
  )
  select jsonb_build_object('today', public.app_today(), 'can_record', v_record, 'can_add_item', public.can('item.create'),
    'items', coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'kind', i.kind, 'base_unit', i.base_unit,
      'on_hand_qty', coalesce(h.qty, 0)::text, 'purchased_qty', coalesce(u.qty, 0)::text, 'last_purchase_on', u.last_on,
      'unpriced_count', coalesce(u.unpriced, 0),
      'money', jsonb_build_object('sell_price', s.sell_price::text,
        'avg_unit_price', case when u.priced_qty > 0 then private._mul_div_round(1, u.value, u.priced_qty, 2)::text end))
      order by i.name_norm collate "C", i.id), '[]'::jsonb))
  into v_result
  from public.items i
  left join hand h on h.item_id = i.id
  left join buys u on u.item_id = i.id
  left join public.item_prices s on s.org_id = i.org_id and s.item_id = i.id
  where i.org_id = v_org and i.archived_at is null;
  if v_record then
    return v_result;
  end if;
  return private.mask(v_result);
end
$$;

-- ٣) المساعدات والجداول.
drop function if exists private.item_mark_json(public.item_marks);
drop function if exists private.store_colors_json();
drop function if exists private.section_items(text);
drop table if exists public.store_orders;
drop table if exists public.item_marks;
drop table if exists public.store_color_settings;
drop function if exists private.stock_state(numeric, numeric);
drop function if exists private.uuids_unique(uuid[]);
drop function if exists private.mark_colors();
drop function if exists private.store_section(text);
