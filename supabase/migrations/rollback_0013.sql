-- rollback_0013 — تراجع 0013_item_purchases_stores (سجلّ شراء المادّة وبطاقات المخازن وصلاحية «يضيف مادّة»؛ مشغّل التراجع
-- بالحزمة FOUNDATION ٨٢٠، ٨٧٦). يرجّع جسمَي private.actions وprivate.role_can كما كُتبا في 0005 حرفاً بحرف (md5 نفسه
-- بالكتالوج، فيختفي الفعل item.create)، وسياستَي الإدراج items_insert وitem_units_insert بفعل stores.manage بنفس نصّ 0005،
-- ويُسقط القارئين item_purchases وstores_overview.
-- لا بيانات تُحذف، ولا بيانات تعتمد على ما أضافته 0013: الهجرة لم تنشئ جدولاً ولا عموداً، والصلاحية شفرة لا صفوف، فالمادّة
-- التي أضافها أمين المخزن تبقى مادّة عادية بجدولها بعد التراجع (يضيفها المدير من بعدها). ولهذا ليس في هذا الملف كتلة رفض:
-- لا بذرة تجعل التراجع يخسر شيئاً. سجلّ التدقيق يبقى كما هو.

set lock_timeout = '5s';

-- ١) الأفعال وجدول الأدوار كما في 0005 حرفاً بحرف (الفعل item.create يختفي معهما):
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
  return case p_role
    when 'manager' then true
    when 'accountant' then p_action in ('receipt.amounts', 'costs.load', 'production.post', 'sale.post', 'payment.post', 'sale_return.post', 'expense.post', 'accounts.view',
      'parties.manage', 'party.create', 'cash_accounts.manage', 'expense_categories.manage')
    when 'storekeeper' then p_action in ('receipt.draft', 'transfer.post', 'issue.post', 'count.enter', 'stock_use.post', 'party.create')
    when 'mill_operator' then p_action = 'production.draft' or (p_action = 'production.post' and coalesce(p_costs_confirmed, false))
    when 'hatchery_operator' then p_action = 'hatch.operate'
    when 'hall_worker' then p_action in ('flock_day.save', 'weigh_ticket.draft')
    else false
  end;
end
$$;

-- ٢) سياستا الإدراج بفعل stores.manage، بنفس النصّ الذي أنشأته 0005 (المواد للمنشأة كلّها، فلا نطاق بالسياسة):
do $$
declare
  t text;
  v_rule constant text := 'org_id = (select public.auth_org()) and (select public.can(''stores.manage''))';
begin
  foreach t in array array['items', 'item_units'] loop
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', t || '_insert', t, v_rule);
  end loop;
end
$$;

-- ٣) القارئان:
drop function if exists public.item_purchases(uuid, uuid, jsonb, integer);
drop function if exists public.stores_overview();
