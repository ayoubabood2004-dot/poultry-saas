-- rollback_0022 — تراجع 0022_day_balance («الرصيد اليومي»؛ مشغّل التراجع بالحزمة FOUNDATION ٨٢٠، ٨٧٦). يُسقط day_balance
-- وset_day_note وset_category_items وprivate.category_members وprivate.note_text وجدول stock_day_notes (ومحفّزه) وعدّاد نسخه وعمود
-- item_categories.item_order، ويرجّع أجسام private.actions وprivate.role_can وprivate.item_uses وpublic.item_file كما في 0020 وpublic.item_moves_qty كما في 0014
-- حرفاً بحرف (md5 نفسه بالكتالوج)، فيسقط فعل stock_note.write معها ويعود رصيد الدفتر الجاري بترتيب الترحيل.
-- **طريق رفض (الكتلة الأولى أدناه):** إسقاط الجدول يمسح ملاحظات الأيام، ولا تُستخرج من مكان آخر؛ فالملف يرفض نفسه إن كان فيه صفّ. ترتيب موادّ
-- التصنيفات يسقط مع عموده (ترتيب عرض، والتصنيف نفسه باقٍ لكلّ مادّة).
-- تنعاد بأمان: drop if exists، وcreate or replace، وفحص وجود الجدول قبل عدّه.

set lock_timeout = '5s';

-- ٠) طريق الرفض: لا تُمسح ملاحظات الأيام. الجدول يُقفل قبل العدّ ولحدّ نهاية المعاملة (درس WP4): ملاحظة تُكتب بلحظة التراجع تنتظر أو تُعدّ.
do $$
declare
  v_notes bigint;
begin
  if to_regclass('public.stock_day_notes') is null then
    return;
  end if;
  execute 'lock table public.stock_day_notes in access exclusive mode';
  execute 'select count(*) from public.stock_day_notes' into v_notes;
  if v_notes > 0 then
    raise exception 'rollback_blocked' using hint = format('توجد %s ملاحظة يومية في «الرصيد اليومي»، والتراجع يمسحها. انسخها أوّلاً أو اترك الهجرة.', v_notes);
  end if;
end
$$;

-- ١) الدوالّ الجديدة، ثمّ الجدول (قيده يستعمل private.note_text) وعدّاده، ثمّ المساعدان والعمود:
drop function if exists public.set_category_items(uuid, uuid[], uuid[]);
drop function if exists public.set_day_note(uuid, date, text, bigint);
drop function if exists public.day_balance(uuid, date, uuid);
drop table if exists public.stock_day_notes;
drop sequence if exists private.stock_day_note_versions;
drop function if exists private.category_members(uuid);
drop function if exists private.note_text(text);
alter table public.item_categories drop column if exists item_order;

-- ٢) الأجسام كما في 0020 و0014:
create or replace function private.actions() returns text[]
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select array[
    'receipt.draft', 'transfer.post', 'issue.post', 'count.enter', 'stock_use.post',
    'receipt.amounts', 'costs.load', 'sale.post', 'payment.post', 'sale_return.post', 'expense.post', 'accounts.view',
    'production.draft', 'production.post',
    'hatch.operate',
    'flock_day.save', 'weigh_ticket.draft',
    'recipe.activate', 'count.approve', 'flock.manage', 'flock.transfer', 'hatch.zero_saleable', 'expired.destroy',
    'expired.release', 'void', 'receipt.revalue', 'party.adjust', 'opening.post', 'period.lock',
    'party.offset', 'members.manage', 'period.unlock',
    'stores.manage', 'parties.manage', 'party.create', 'cash_accounts.manage', 'expense_categories.manage',
    'item.create',
    'purchase.record',
    'sale.record',
    'read'
  ]
$$;

create or replace function private.role_can(p_role text, p_action text, p_costs_confirmed boolean default false) returns boolean
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
begin
  if p_action is null or not (p_action = any (private.actions())) then
    raise exception 'unknown_action' using hint = case
      when p_action is null then 'لم يُحدَّد الإجراء.'
      else format('الإجراء «%s» غير معروف.', p_action)
    end;
  end if;
  if p_role is null then return false; end if;
  if p_role = 'owner' then return true; end if;
  if p_action in ('party.offset', 'members.manage', 'period.unlock') then return false; end if;
  if p_action = 'read' then return true; end if;
  -- «يضيف مادّة» (قرار المالك 2026-11-02): أمين المخزن يضيف مادّة ووحدتها، ومن يملك إدارة المخازن يملكها أيضاً (المالك والمدير).
  -- القاعدة مكتوبة مرّة واحدة هنا، فلا تتفرّق إذا تغيّر جدول الأدوار؛ والتعديل والأرشفة تبقى stores.manage.
  if p_action = 'item.create' then
    return p_role = 'storekeeper' or private.role_can(p_role, 'stores.manage', p_costs_confirmed);
  end if;
  -- «يسجّل الشراء» (قرار المالك 2026-11-06): الكمية والسعر معاً ويُحفظ فوراً، للمحاسب والأمين (والمدير بكلّ الأفعال، والمالك كلّها).
  -- «يبيع» (قرار المالك 2026-11-08، 0020): لأدوار «يسجّل الشراء» نفسها.
  return case p_role
    when 'manager' then true
    when 'accountant' then p_action in ('receipt.amounts', 'costs.load', 'production.post', 'sale.post', 'payment.post', 'sale_return.post', 'expense.post', 'accounts.view',
      'parties.manage', 'party.create', 'cash_accounts.manage', 'expense_categories.manage', 'purchase.record',
      'sale.record')
    when 'storekeeper' then p_action in ('receipt.draft', 'transfer.post', 'issue.post', 'count.enter', 'stock_use.post', 'party.create', 'purchase.record', 'sale.record')
    when 'mill_operator' then p_action = 'production.draft' or (p_action = 'production.post' and coalesce(p_costs_confirmed, false))
    when 'hatchery_operator' then p_action = 'hatch.operate'
    when 'hall_worker' then p_action in ('flock_day.save', 'weigh_ticket.draft')
    else false
  end;
end
$$;

create or replace function private.item_uses(p_item uuid) returns text[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  r record;
  v_found boolean;
  v_label text;
  v_uses text[] := '{}';
begin
  for r in
    select cl.relname as tbl, format('%I.%I', ns.nspname, cl.relname) as qualified,
      (select a.attname from unnest(c.conkey, c.confkey) as k(col, ref)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.col
        join pg_attribute b on b.attrelid = c.confrelid and b.attnum = k.ref where b.attname = 'id') as id_col,
      (select a.attname from unnest(c.conkey, c.confkey) as k(col, ref)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.col
        join pg_attribute b on b.attrelid = c.confrelid and b.attnum = k.ref where b.attname = 'org_id') as org_col
    from pg_constraint c join pg_class cl on cl.oid = c.conrelid join pg_namespace ns on ns.oid = cl.relnamespace
    where c.contype = 'f' and c.confrelid = 'public.items'::regclass and cl.relname not in ('item_units', 'item_prices')
    order by cl.relname, c.conname
  loop
    continue when r.id_col is null;
    execute format('select exists (select 1 from %s x where %s x.%I = $2)', r.qualified,
      case when r.org_col is null then '' else format('x.%I = $1 and', r.org_col) end, r.id_col) into v_found using v_org, p_item;
    continue when not coalesce(v_found, false);
    v_label := case r.tbl
      when 'receipt_lines' then 'لها مشتريات'
      when 'purchase_prices' then 'لها مشتريات'
      when 'stock_lots' then 'لها حركات مخزون'
      when 'stock_moves' then 'لها حركات مخزون'
      when 'stock_balances' then 'لها حركات مخزون'
      when 'opening_lines' then 'في رصيد افتتاحي'
      when 'transfer_lines' then 'في نقل بين المخازن'
      when 'stock_use_lines' then 'في صرف'
      when 'stock_count_lines' then 'في جرد'
      when 'supplier_return_lines' then 'في مرتجع إلى مورّد'
      when 'recipes' then 'ناتج خلطة'
      when 'recipe_lines' then 'في خلطة'
      when 'production_batches' then 'في دفعة إنتاج'
      when 'production_inputs' then 'في دفعة إنتاج'
      when 'flock_issue_lines' then 'في صرف لقاعة'
      when 'stock_conversions' then 'في تحويل مادّة'
      when 'sales_lines' then 'لها مبيعات'
      else 'في مستند آخر'
    end;
    if not (v_label = any (v_uses)) then
      v_uses := v_uses || v_label;
    end if;
  end loop;
  return v_uses;
end
$$;

create or replace function public.item_file(p_item uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  i public.items;
  v_on_hand numeric;
  v_count int;
  v_qty numeric;
  v_priced_qty numeric;
  v_value numeric;
  v_last numeric;
  v_unpriced int;
  v_can_price boolean;
  v_rows jsonb;
  v_sell numeric;
  v_record boolean;
  v_can_buy boolean;
  v_live boolean;
  v_can_sell boolean;
  v_uses text[];
  v_stores jsonb;
  v_result jsonb;
begin
  perform private.require('read');
  select * into i from public.items x where x.org_id = v_org and x.id = p_item;
  if i.id is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  v_record := public.can('purchase.record');
  -- الدفتر بـCASE بعد نوع المخزن: receipt_book يرفض مخزناً لا يستلم، وترتيب شروط WHERE غير مضمون.
  v_can_buy := v_record and i.archived_at is null and exists (
    select 1 from public.warehouses x
    where x.org_id = v_org and x.archived_at is null and x.kind = any (private.receiving_kinds(i.kind)) and public.in_scope_wh(x.id)
      and public.in_scope_book(case when x.kind = any (private.receiving_kinds(i.kind)) then private.receipt_book(x.id) end));
  select coalesce(sum(s.qty), 0) into v_on_hand from public.stock_balances s
  where s.org_id = v_org and s.item_id = i.id and public.in_scope_wh(s.warehouse_id);
  with buys as (
    select x.id as line_id, r.id as doc_id, r.doc_no, r.received_on, r.posted_at, r.party_id, t.name as party_name, y.name as warehouse_name,
      r.book_id, l.id as lot_id, l.qty_in,
      (pp.id is not null and pp.unit_price is null and rv.new_total is null) as unpriced,
      coalesce(rv.new_total, la.line_total, 0) as line_total, rv.new_total is not null and rv.unit_price is null as corrected,
      case when pp.id is not null and pp.unit_price is null and rv.new_total is null then null
        when rv.unit_price is not null then rv.unit_price
        when rv.new_total is not null then private._mul_div_round(1, rv.new_total, l.qty_in, 2)
        else coalesce(pp.unit_price, private._mul_div_round(1, coalesce(la.line_total, 0), l.qty_in, 2)) end as unit_price,
      pp.sell_price,
      case when coalesce(a.paid_now, 0) > 0 and coalesce(a.paid_now, 0) >= coalesce(la.line_total, 0) then 'cash' else 'credit' end as payment
    from public.stock_lots l
    join public.receipts r on r.org_id = l.org_id and r.id = l.source_id
    join public.receipt_lines x on x.org_id = l.org_id and x.id = l.source_line_id
    join public.parties t on t.org_id = r.org_id and t.id = r.party_id
    join public.warehouses y on y.org_id = l.org_id and y.id = l.warehouse_id
    left join public.receipt_line_amounts la on la.org_id = x.org_id and la.line_id = x.id
    left join public.receipt_amounts a on a.org_id = r.org_id and a.doc_id = r.id
    left join public.purchase_prices pp on pp.org_id = x.org_id and pp.line_id = x.id
    left join lateral (
      select v.new_total, v.unit_price from public.receipt_revaluations v
      where v.org_id = x.org_id and v.receipt_line_id = x.id and v.status = 'posted' order by v.rev_no desc limit 1
    ) as rv on true
    where l.org_id = v_org and l.item_id = i.id and l.source_kind = 'receipt' and l.origin_lot_id is null and r.status = 'posted'
      and public.in_scope_wh(l.warehouse_id)
  ), ordered as (
    select b.*, row_number() over (order by b.received_on desc, b.posted_at desc, b.line_id desc) as n,
      -- «أكمل السعر» بالقاعدة التي يفرضها التسعير (revalue_plan): الدفتر بنطاقه، وكلّ مخزن فيه من الشراء متبقٍّ بنطاقه (مراجعة 0020 L2).
      v_record and b.unpriced and public.in_scope_book(b.book_id) and not exists (
        select 1 from public.stock_lots f where f.org_id = v_org and (f.id = b.lot_id or f.origin_lot_id = b.lot_id) and f.qty_left > 0
          and not public.in_scope_wh(f.warehouse_id)) as can_price from buys b
  )
  select count(*)::int, coalesce(sum(o.qty_in), 0), coalesce(sum(o.qty_in) filter (where not o.unpriced), 0), coalesce(sum(o.line_total), 0),
    (array_agg(o.unit_price order by o.n) filter (where not o.unpriced))[1], (count(*) filter (where o.unpriced))::int, coalesce(bool_or(o.can_price), false),
    coalesce(jsonb_agg(jsonb_build_object('line_id', o.line_id, 'doc_id', o.doc_id, 'doc_no', o.doc_no, 'received_on', o.received_on,
      'party_id', o.party_id, 'party_name', o.party_name, 'warehouse_name', o.warehouse_name, 'qty', o.qty_in::text, 'payment', o.payment,
      'priced', not o.unpriced, 'can_price', o.can_price,
      'money', jsonb_build_object('unit_price', o.unit_price::text, 'line_total', o.line_total::text, 'sell_price', o.sell_price::text,
        'corrected', o.corrected))
      order by o.n) filter (where o.n <= 200), '[]'::jsonb)
  into v_count, v_qty, v_priced_qty, v_value, v_last, v_unpriced, v_can_price, v_rows
  from ordered o;
  select s.sell_price into v_sell from public.item_prices s where s.org_id = v_org and s.item_id = i.id;
  v_live := i.archived_at is null and v_on_hand > 0;
  v_uses := private.item_uses(i.id);
  -- يبيع: مادّة فعّالة في مخزن بنطاقه فيه منها رصيد، ودفتر وحدة ذلك المخزن بنطاقه (قيد الجهة يُكتب فيه، book_for_post).
  v_can_sell := public.can('sale.record') and i.archived_at is null and i.kind not in ('hatching_egg', 'chick', 'table_egg') and exists (
    select 1 from public.stock_balances b join public.warehouses w on w.org_id = b.org_id and w.id = b.warehouse_id
    join public.ledger_books k on k.org_id = w.org_id and k.division_id = w.division_id and k.code = 'main'
    where b.org_id = v_org and b.item_id = i.id and b.qty > 0 and w.archived_at is null and public.in_scope_wh(w.id) and public.in_scope_book(k.id));
  select coalesce(jsonb_agg(jsonb_build_object('warehouse_id', w.id, 'name', w.name, 'kind', w.kind, 'qty', b.qty::text,
      'available', q.available::text, 'expired', q.expired::text)
    order by w.name collate "C", w.id), '[]'::jsonb)
  into v_stores
  from public.stock_balances b
  join public.warehouses w on w.org_id = b.org_id and w.id = b.warehouse_id
  cross join lateral private.stock_at(i.id, w.id, v_today) as q
  where b.org_id = v_org and b.item_id = i.id and b.qty <> 0 and public.in_scope_wh(w.id);
  v_result := jsonb_build_object('today', v_today, 'can_record', v_can_buy, 'can_edit', public.can('stores.manage'),
    'can_delete', public.can('stores.manage') and cardinality(v_uses) = 0, 'uses', to_jsonb(v_uses),
    'can_convert', public.can('stock_use.post') and v_live and i.kind not in ('hatching_egg', 'chick', 'table_egg'),
    'can_transfer', public.can('transfer.post') and v_live and (select count(*) from public.warehouses w
      where w.org_id = v_org and w.archived_at is null and private.item_admissible(w.kind, i.kind)) > 1,
    'can_sell', v_can_sell,
    'can_price', v_can_price, 'unpriced_count', v_unpriced,
    'item', jsonb_build_object('id', i.id, 'name', i.name, 'kind', i.kind, 'base_unit', i.base_unit, 'version', i.version,
      'density_kg_per_l', i.density_kg_per_l::text, 'archived', i.archived_at is not null, 'tracks_expiry', i.tracks_expiry),
    'on_hand_qty', v_on_hand::text, 'purchased_qty', v_qty::text, 'purchases_count', v_count, 'stores', v_stores,
    'transfer_targets', (select coalesce(jsonb_agg(jsonb_build_object('warehouse_id', w.id, 'name', w.name, 'kind', w.kind)
        order by w.name collate "C", w.id), '[]'::jsonb)
      from public.warehouses w where w.org_id = v_org and w.archived_at is null and private.item_admissible(w.kind, i.kind)),
    'money', jsonb_build_object('purchased_value', v_value::text,
      'avg_unit_price', case when v_priced_qty > 0 then private._mul_div_round(1, v_value, v_priced_qty, 2)::text end,
      'sell_price', v_sell::text, 'last_unit_price', v_last::text),
    'purchases', v_rows, 'more', v_count > 200,
    -- الصناديق الفعّالة لنافذتي «سجّل شراء» و«بِع» (الأمين لا يقرأ جدولها): لمن يسجّل شراء هذه المادّة أو بيعها وحده.
    'cash_accounts', case when v_can_buy or v_can_sell then (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name collate "C", c.id), '[]'::jsonb)
      from public.cash_accounts c where c.org_id = v_org and c.archived_at is null) else '[]'::jsonb end);
  if v_record then
    return v_result;
  end if;
  return private.mask(v_result);
end
$$;

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
      sum(m.value) over (order by m.seq rows between unbounded preceding and current row) as running_value,
      exists (select 1 from public.stock_moves r where r.org_id = m.org_id and r.reverses_move_id = m.id) as reversed
    from public.stock_moves m
    where m.org_id = v_org and m.item_id = p_item and m.warehouse_id = p_warehouse and (v_cost or m.doc_kind <> 'receipt_revalue')
  ), paged as (
    select * from mv where mv.n > coalesce(p_after_seq, 0) order by mv.n limit v_limit + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('move_id', p.id, 'seq', p.n::text, 'moved_on', p.moved_on, 'doc_kind', p.doc_kind,
      'doc_id', p.doc_id, 'doc', private.stock_doc_label(p.doc_kind, p.doc_id),
      'memo', private.stock_doc_memo(p.doc_kind, p.doc_id, p_warehouse),
      'qty', p.qty::text, 'running', p.running::text,
      'lot_id', p.lot_id, 'reverses_move_id', p.reverses_move_id, 'reversed', p.reversed,
      'money', jsonb_build_object('value', round(p.value, 2)::text, 'running_value', round(p.running_value, 2)::text)) order by p.n), '[]'::jsonb),
    case when p_after_seq is null then (select count(*) from mv) end
  into v_rows, v_total
  from paged p;
  return private.mask(jsonb_build_object(
    'rows', (select coalesce(jsonb_agg(r order by n), '[]'::jsonb) from jsonb_array_elements(v_rows) with ordinality as x(r, n) where n <= v_limit),
    'next', case when jsonb_array_length(v_rows) > v_limit then v_rows -> (v_limit - 1) ->> 'seq' end,
    'total', v_total));
end
$$;
