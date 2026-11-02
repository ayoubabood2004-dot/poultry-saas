-- rollback_0014 — تراجع 0014_sell_price_item_ledger (سعر البيع والربح المتوقّع، وقائمة مواد المخزن كلّها، ودفتر المادّة
-- بالبيان؛ مشغّل التراجع بالحزمة FOUNDATION ٨٢٠، ٨٧٦). يرجّع أجسام stock_on_hand (كما في 0007) وitem_moves_qty (كما في
-- 0011) وstores_overview وitem_purchases (كما في 0013) حرفاً بحرف (md5 نفسه بالكتالوج)، ويُسقط جدول item_prices ودالّته
-- set_item_sell_price وprivate.stock_doc_memo.
-- **طريق رفض (الكتلة أدناه):** إسقاط item_prices يمسح قائمة أسعار البيع كلّها، وهي بيانات كتبها المالك بيده ولا تُستخرج من
-- مكان آخر. فالملف يرفض نفسه إن كان بالجدول صفّ واحد، إلى أن تُصدَّر القائمة وتُحفظ خارج القاعدة:
--   select item_id, sell_price from public.item_prices order by item_id;
-- ثمّ تُشغَّل بـ  set local rollback_0014.prices_exported = 'yes'  بنفس المعاملة.
-- سجلّ التدقيق يبقى كما هو (صفوف item_prices المحذوفة مسجّلة فيه بمشغّل audit_row، فالقائمة تُقرأ منه أيضاً).

set lock_timeout = '5s';

-- ٠) طريق الرفض: لا تُمسح أسعار البيع بلا تصدير.
do $$
declare
  v_rows bigint;
begin
  select count(*) into v_rows from public.item_prices;
  if v_rows > 0 and coalesce(current_setting('rollback_0014.prices_exported', true), '') <> 'yes' then
    raise exception 'prices_not_exported'
      using hint = format('بجدول أسعار البيع %s صفّاً، والتراجع يمسحها. صدّرها أوّلاً (select item_id, sell_price from public.item_prices) ثمّ شغّل: set local rollback_0014.prices_exported = ''yes''.', v_rows);
  end if;
end
$$;

-- ١) قائمة مواد المخزن كما في 0007 حرفاً بحرف (بلا التصنيف والباركود والمال، وبلا المواد برصيد صفر):
create or replace function public.stock_on_hand(p_warehouse uuid, p_after jsonb, p_limit int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 200);
  w public.warehouses;
  v_division text;
  v_after_name text;
  v_after_id uuid;
  v_rows jsonb;
  v_total bigint;
begin
  if p_warehouse is null or not public.in_scope_wh(p_warehouse) then
    raise exception 'out_of_scope' using hint = 'هذا المخزن خارج نطاقك أو غير موجود في منشأتك.';
  end if;
  select * into w from public.warehouses where org_id = v_org and id = p_warehouse;
  select x.kind into v_division from public.divisions x where x.org_id = v_org and x.id = w.division_id;
  v_after_name := p_after ->> 'name';
  v_after_id := nullif(p_after ->> 'id', '')::uuid;
  with lots as (
    select l.item_id,
      coalesce(sum(l.qty_left) filter (where not l.expired), 0) as available,
      coalesce(sum(l.qty_left) filter (where l.expired), 0) as expired,
      coalesce(sum(l.qty_left) filter (where l.tracks and not l.expired and l.expiry_on is not null and l.expiry_on <= v_today + 30), 0) as near_expiry,
      min(l.born_at) filter (where l.chick) as oldest_born,
      coalesce(sum(l.qty_left) filter (where l.chick and l.born_at is not null and l.born_at <= now() - interval '48 hours'), 0) as old_chicks
    from (
      -- المنتهي وقريب الانتهاء لمادّة تتابع الانتهاء بس (مثل item_lots_qty وhome_summary)، والعمر بالساعات للأفراخ بس (E24).
      select x.item_id, x.qty_left, x.expiry_on, x.born_at, i.tracks_expiry as tracks, i.kind = 'chick' as chick,
        private.lot_expired(i.tracks_expiry, x.expiry_on, v_today) as expired
      from public.stock_lots x join public.items i on i.org_id = x.org_id and i.id = x.item_id
      where x.org_id = v_org and x.warehouse_id = w.id and x.qty_left > 0
    ) as l
    group by l.item_id
  ), shown as (
    select i.id, i.name, i.name_norm, i.kind, i.base_unit, i.tracks_expiry, i.min_qty, i.archived_at,
      coalesce(t.available, 0) as available, coalesce(t.expired, 0) as expired, coalesce(t.near_expiry, 0) as near_expiry,
      t.oldest_born, coalesce(t.old_chicks, 0) as old_chicks,
      i.min_qty is not null and w.kind = any (private.receiving_kinds(i.kind)) and coalesce((
        select sum(x.qty_left) from public.stock_lots x join public.warehouses y on y.org_id = x.org_id and y.id = x.warehouse_id
        where x.org_id = v_org and x.item_id = i.id and x.qty_left > 0 and y.kind = any (private.receiving_kinds(i.kind))
          and not private.lot_expired(i.tracks_expiry, x.expiry_on, v_today)
      ), 0) < i.min_qty as below_min
    from public.items i left join lots t on t.item_id = i.id
    where i.org_id = v_org
      and (t.item_id is not null or (i.min_qty is not null and i.archived_at is null and w.kind = any (private.receiving_kinds(i.kind))))
  ), paged as (
    select s.* from shown s
    where v_after_id is null or s.name_norm collate "C" > v_after_name collate "C" or (s.name_norm = v_after_name and s.id > v_after_id)
    order by s.name_norm collate "C", s.id
    limit v_limit + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('item_id', p.id, 'name', p.name, 'kind', p.kind, 'base_unit', p.base_unit,
      'tracks_expiry', p.tracks_expiry, 'min_qty', p.min_qty::text, 'archived', p.archived_at is not null,
      'available', p.available::text, 'expired', p.expired::text, 'near_expiry', p.near_expiry::text, 'below_min', p.below_min,
      'oldest_born_at', p.oldest_born,
      'chick_age_hours', case when p.oldest_born is not null then div(extract(epoch from (now() - p.oldest_born))::numeric, 3600)::text end, -- date-ok: عمر الفرخ ساعات بين لحظتين (E24)، مو يوماً
      'old_chicks', p.old_chicks::text, 'cursor', jsonb_build_object('name', p.name_norm, 'id', p.id))
      order by p.name_norm collate "C", p.id), '[]'::jsonb),
    case when v_after_id is null then (select count(*) from shown) end
  into v_rows, v_total
  from paged p;
  return jsonb_build_object(
    'warehouse', jsonb_build_object('id', w.id, 'name', w.name, 'kind', w.kind, 'division_id', w.division_id, 'division_kind', v_division,
      'archived', w.archived_at is not null,
      'has_balance', exists (select 1 from public.stock_balances b where b.org_id = v_org and b.warehouse_id = w.id and b.qty <> 0)),
    'as_of', now(), 'today', v_today,
    'rows', (select coalesce(jsonb_agg(r - 'cursor' order by n), '[]'::jsonb) from jsonb_array_elements(v_rows) with ordinality as x(r, n) where n <= v_limit),
    'next', case when jsonb_array_length(v_rows) > v_limit then v_rows -> (v_limit - 1) -> 'cursor' end,
    'total', v_total);
end
$$;

-- ٢) دفتر المادة كما في 0011 حرفاً بحرف (بلا البيان وبلا قيمة الحركة):
create or replace function public.item_moves_qty(p_item uuid, p_warehouse uuid, p_after_seq bigint, p_limit int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 200);
  v_cost boolean := public.can_see_cost();
  v_rows jsonb;
  v_total bigint;
begin
  if p_warehouse is null or not public.in_scope_wh(p_warehouse) then
    raise exception 'out_of_scope' using hint = 'هذا المخزن خارج نطاقك أو غير موجود في منشأتك.';
  end if;
  with mv as (
    select m.*, row_number() over (order by m.seq) as n,
      sum(m.qty) over (order by m.seq rows between unbounded preceding and current row) as running,
      exists (select 1 from public.stock_moves r where r.org_id = m.org_id and r.reverses_move_id = m.id) as reversed
    from public.stock_moves m
    where m.org_id = v_org and m.item_id = p_item and m.warehouse_id = p_warehouse and (v_cost or m.doc_kind <> 'receipt_revalue')
  ), paged as (
    select * from mv where mv.n > coalesce(p_after_seq, 0) order by mv.n limit v_limit + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('move_id', p.id, 'seq', p.n::text, 'moved_on', p.moved_on, 'doc_kind', p.doc_kind,
      'doc_id', p.doc_id, 'doc', private.stock_doc_label(p.doc_kind, p.doc_id), 'qty', p.qty::text, 'running', p.running::text,
      'lot_id', p.lot_id, 'reverses_move_id', p.reverses_move_id, 'reversed', p.reversed) order by p.n), '[]'::jsonb),
    case when p_after_seq is null then (select count(*) from mv) end
  into v_rows, v_total
  from paged p;
  return jsonb_build_object(
    'rows', (select coalesce(jsonb_agg(r order by n), '[]'::jsonb) from jsonb_array_elements(v_rows) with ordinality as x(r, n) where n <= v_limit),
    'next', case when jsonb_array_length(v_rows) > v_limit then v_rows -> (v_limit - 1) ->> 'seq' end,
    'total', v_total);
end
$$;

-- ٣) بطاقات المخازن كما في 0013 حرفاً بحرف (بلا قيمة البيع والربح المتوقع):
create or replace function public.stores_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
begin
  -- بلا منشأة لا أرقام: بطاقات فارغة (مثل home_summary)، لا رفض.
  if v_org is null then
    return jsonb_build_object('today', v_today, 'can_manage', false, 'can_create_item', false, 'rows', '[]'::jsonb, 'sites', '[]'::jsonb);
  end if;
  perform private.require('read');
  return private.mask(jsonb_build_object(
    'today', v_today,
    'can_manage', public.can('stores.manage'),
    'can_create_item', public.can('item.create'),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id, 'name', w.name, 'kind', w.kind,
        'site_id', s.id, 'site_name', s.name, 'site_kind', s.kind,
        'division_id', d.id, 'division_kind', d.kind,
        'items_count', (select count(distinct l.item_id) from public.stock_lots l
          where l.org_id = v_org and l.warehouse_id = w.id and l.qty_left > 0),
        'below_minimum', (
          select count(*) from public.items i
          where i.org_id = v_org and i.archived_at is null and i.min_qty is not null
            and w.kind = any (private.receiving_kinds(i.kind))
            and coalesce((
              select sum(x.qty_left) from public.stock_lots x join public.warehouses y on y.org_id = x.org_id and y.id = x.warehouse_id
              where x.org_id = v_org and x.item_id = i.id and x.qty_left > 0 and y.kind = any (private.receiving_kinds(i.kind))
                and not private.lot_expired(i.tracks_expiry, x.expiry_on, v_today)
            ), 0) < i.min_qty),
        'near_expiry', (
          select count(distinct l.item_id) from public.stock_lots l join public.items i on i.org_id = l.org_id and i.id = l.item_id
          where l.org_id = v_org and l.warehouse_id = w.id and l.qty_left > 0 and i.tracks_expiry
            and l.expiry_on >= v_today and l.expiry_on <= v_today + 30),
        'expired', (
          select count(distinct l.item_id) from public.stock_lots l join public.items i on i.org_id = l.org_id and i.id = l.item_id
          where l.org_id = v_org and l.warehouse_id = w.id and l.qty_left > 0
            and private.lot_expired(i.tracks_expiry, l.expiry_on, v_today)),
        'money', jsonb_build_object('stock_value', round(coalesce((
          select sum(l.value_left) from public.stock_lots l join public.items i on i.org_id = l.org_id and i.id = l.item_id
          where l.org_id = v_org and l.warehouse_id = w.id and l.qty_left > 0
            and not private.lot_expired(i.tracks_expiry, l.expiry_on, v_today)), 0), 2)::text))
        order by d.kind collate "C", w.name collate "C", w.id)
      from public.warehouses w
      join public.sites s on s.org_id = w.org_id and s.id = w.site_id
      join public.divisions d on d.org_id = w.org_id and d.id = w.division_id
      where w.org_id = v_org and w.archived_at is null and public.in_scope_wh(w.id)
    ), '[]'::jsonb),
    'sites', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind, 'division_id', d.id, 'division_kind', d.kind)
        order by d.kind collate "C", s.name collate "C", s.id)
      from public.sites s join public.divisions d on d.org_id = s.org_id and d.id = s.division_id
      where s.org_id = v_org and s.archived_at is null and d.archived_at is null and public.in_scope_site(s.id)
    ), '[]'::jsonb)));
end
$$;

-- ٤) سجلّ الشراء كما في 0013 حرفاً بحرف (بلا سعر البيع على المادّة):
create or replace function public.item_purchases(p_item uuid, p_warehouse uuid, p_after jsonb, p_limit int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 200);
  i public.items;
  w public.warehouses;
  v_after_on date := nullif(p_after ->> 'received_on', '')::date;
  v_after_seq bigint := nullif(p_after ->> 'seq', '')::bigint;
  v_after_id uuid := nullif(p_after ->> 'id', '')::uuid;
  v_rows jsonb;
  v_total bigint;
begin
  perform private.require('read');
  if p_warehouse is not null and not public.in_scope_wh(p_warehouse) then
    raise exception 'out_of_scope' using hint = 'هذا المخزن خارج نطاقك أو غير موجود في منشأتك.';
  end if;
  select * into i from public.items where org_id = v_org and id = p_item;
  if i.id is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if p_warehouse is not null then
    select * into w from public.warehouses where org_id = v_org and id = p_warehouse;
  end if;
  with buys as (
    select l.id as lot_id, l.received_on, l.fifo_seq, l.qty_in, l.qty_left, l.value_in, l.expiry_on, l.supplier_lot_no,
      l.warehouse_id, y.name as warehouse_name,
      r.id as doc_id, r.doc_no, r.party_id, t.name as party_name,
      x.id as line_id, x.qty_in_unit, x.unit_label, x.unit_code, x.factor, x.base_unit,
      -- مبلغ الفاتورة الحالي للسطر = مبلغ أحدث تصحيح حيّ، وإلّا المبلغ المكتوب (مرآة private.revalue_plan.current_total):
      -- التصحيح لا يكتب فوق receipt_line_amounts، بل يزيد قيمة الدفعة بحصّة ويترك الفرق مصروفاً.
      coalesce((select v.new_total from public.receipt_revaluations v
        where v.org_id = l.org_id and v.receipt_line_id = x.id and v.status = 'posted' order by v.rev_no desc limit 1), a.line_total) as invoice_total,
      exists (select 1 from public.receipt_revaluations v
        where v.org_id = l.org_id and v.receipt_line_id = x.id and v.status = 'posted') as corrected
    from public.stock_lots l
    join public.receipts r on r.org_id = l.org_id and r.id = l.source_id
    join public.receipt_lines x on x.org_id = l.org_id and x.id = l.source_line_id
    join public.parties t on t.org_id = r.org_id and t.id = r.party_id
    join public.warehouses y on y.org_id = l.org_id and y.id = l.warehouse_id
    left join public.receipt_line_amounts a on a.org_id = x.org_id and a.line_id = x.id
    where l.org_id = v_org and l.item_id = i.id and l.source_kind = 'receipt' and l.origin_lot_id is null and r.status = 'posted'
      and (p_warehouse is null or l.warehouse_id = p_warehouse) and public.in_scope_wh(l.warehouse_id)
  ), paged as (
    select * from buys b
    where v_after_id is null or b.received_on < v_after_on
      or (b.received_on = v_after_on and (b.fifo_seq < v_after_seq or (b.fifo_seq = v_after_seq and b.lot_id < v_after_id)))
    order by b.received_on desc, b.fifo_seq desc, b.lot_id desc
    limit v_limit + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('lot_id', p.lot_id, 'received_on', p.received_on, 'doc_id', p.doc_id, 'doc_no', p.doc_no,
      'party_id', p.party_id, 'party_name', p.party_name, 'warehouse_id', p.warehouse_id, 'warehouse_name', p.warehouse_name,
      'line_id', p.line_id, 'qty_in', p.qty_in::text, 'qty_left', p.qty_left::text, 'qty_in_unit', p.qty_in_unit::text,
      'unit_label', p.unit_label, 'unit_code', p.unit_code, 'factor', p.factor::text, 'base_unit', p.base_unit,
      'supplier_lot_no', p.supplier_lot_no, 'expiry_on', p.expiry_on,
      -- المراتب مستقرّة للشاشة (round بمرتبتين): value_left وvalue_in تأتي بمرتبتين أو بلا مراتب بحسب وجود خصم أو تحميل، والقيمة نفسها.
      'money', jsonb_build_object('invoice_total', p.invoice_total::text, 'landed_value', round(p.value_in, 2)::text,
        'unit_cost', private._mul_div_round2(1, p.value_in, p.qty_in)::text, 'corrected', p.corrected),
      'cursor', jsonb_build_object('received_on', p.received_on, 'seq', p.fifo_seq::text, 'id', p.lot_id))
      order by p.received_on desc, p.fifo_seq desc, p.lot_id desc), '[]'::jsonb),
    case when v_after_id is null then (select count(*) from buys) end
  into v_rows, v_total
  from paged p;
  return private.mask(jsonb_build_object(
    'item', jsonb_build_object('id', i.id, 'name', i.name, 'kind', i.kind, 'base_unit', i.base_unit, 'tracks_expiry', i.tracks_expiry,
      'min_qty', i.min_qty::text, 'archived', i.archived_at is not null),
    'warehouse', case when w.id is not null then jsonb_build_object('id', w.id, 'name', w.name, 'kind', w.kind) end,
    'today', public.app_today(),
    'rows', (select coalesce(jsonb_agg(r - 'cursor' order by n), '[]'::jsonb) from jsonb_array_elements(v_rows) with ordinality as x(r, n) where n <= v_limit),
    'next', case when jsonb_array_length(v_rows) > v_limit then v_rows -> (v_limit - 1) -> 'cursor' end,
    'total', v_total));
end
$$;

-- ٥) سعر البيع: الدالّة ثمّ الجدول (الجدول يُسقط بعد دالّته، فلا تبقى دالّة تشير إلى جدول غائب):
drop function if exists public.set_item_sell_price(uuid, numeric, numeric);
drop table if exists public.item_prices;

-- ٦) بيان الحركة:
drop function if exists private.stock_doc_memo(text, uuid, uuid);

-- ٧) قيمة البيع لكمّية:
drop function if exists private.sale_value(numeric, numeric);
