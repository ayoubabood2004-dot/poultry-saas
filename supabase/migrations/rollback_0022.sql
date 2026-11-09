-- rollback_0022 — تراجع 0022_day_balance («الرصيد اليومي»؛ مشغّل التراجع بالحزمة FOUNDATION ٨٢٠، ٨٧٦). يُسقط day_balance وitem_move_stores
-- وset_day_note وset_category_items وprivate.category_members وprivate.note_text وجدول stock_day_notes (ومحفّزه) وعدّاد نسخه وعمود
-- item_categories.item_order، ويرجّع أجسام private.actions وprivate.role_can وprivate.item_uses كما في 0020 وpublic.item_moves_qty كما في 0014
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
drop function if exists public.item_move_stores(uuid);
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
