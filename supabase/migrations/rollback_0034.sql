-- rollback_0034 — تراجع «الكلّ مثل المالك بكلّ شيء» (0034_everyone_owner؛ مشغّل التراجع بالحزمة FOUNDATION ٨٢٠، ٨٧٦): يرجّع الدوالّ العشر
--   بأجسامها السابقة حرفاً بحرف (md5 نفسه بالكتالوج): private.role_can كما في 0022، وpublic.can_see_cost وpublic.can_see_accounts وpublic.can_see_sales
--   وprivate.require كما في 0001، وpublic.in_scope_division كما في 0002، وpublic.in_scope_site وpublic.in_scope_wh وprivate.scope_touches_division كما
--   في 0005، وpublic.production_form كما في 0025 (تلميحها وحده تغيّر). بلا طريق رفض: 0034 لم تغيّر جدولاً ولا عموداً ولا قيداً، وما كُتب بعدها صحيح بقواعد ما قبلها؛ يعود فقط من لا يملك فعلاً ممنوعاً منه،
--   ويعود النطاق (member_scopes) يحدّ ما يراه العضو.
-- تنعاد بأمان: create or replace وحده.

set lock_timeout = '5s';

-- جسم 0022 (0022_day_balance.sql)
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
  -- «ملاحظة الرصيد اليومي» (0022، كلمة المالك 2026-11-09): لمن يعمل في المخازن — الأمين ومشغّلا المعمل والمفقس (والمدير كلّها، والمالك).
  return case p_role
    when 'manager' then true
    when 'accountant' then p_action in ('receipt.amounts', 'costs.load', 'production.post', 'sale.post', 'payment.post', 'sale_return.post', 'expense.post', 'accounts.view',
      'parties.manage', 'party.create', 'cash_accounts.manage', 'expense_categories.manage', 'purchase.record',
      'sale.record')
    when 'storekeeper' then p_action in ('receipt.draft', 'transfer.post', 'issue.post', 'count.enter', 'stock_use.post', 'party.create', 'purchase.record', 'sale.record') or p_action = 'stock_note.write'
    when 'mill_operator' then p_action in ('production.draft', 'stock_note.write') or (p_action = 'production.post' and coalesce(p_costs_confirmed, false))
    when 'hatchery_operator' then p_action in ('hatch.operate', 'stock_note.write')
    when 'hall_worker' then p_action in ('flock_day.save', 'weigh_ticket.draft')
    else false
  end;
end
$$;

-- جسم 0001 (0001_core.sql)
create or replace function public.can_see_cost() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(private.my_role() in ('owner', 'manager', 'accountant'), false)
$$;

-- جسم 0001 (0001_core.sql)
create or replace function public.can_see_accounts() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(private.my_role() in ('owner', 'manager', 'accountant'), false)
$$;

-- جسم 0001 (0001_core.sql)
create or replace function public.can_see_sales() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(private.my_role() not in ('hall_worker', 'hatchery_operator', 'mill_operator'), false)
$$;

-- جسم 0002 (0002_account_checks.sql)
create or replace function public.in_scope_division(p_division uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select case
      when m.role = 'owner' then true
      when not exists (
        select 1 from public.member_scopes s where s.org_id = m.org_id and s.member_id = m.id and s.archived_at is null
      ) then m.role in ('manager', 'accountant')
      else exists (
        select 1 from public.member_scopes s
        where s.org_id = m.org_id and s.member_id = m.id and s.archived_at is null and s.division_id = p_division
      )
    end
    from public.members m
    where m.user_id = auth.uid() and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
      and exists (select 1 from public.divisions d where d.org_id = m.org_id and d.id = p_division)
  ), false)
$$;

-- جسم 0005 (0005_scopes_stores_items.sql)
create or replace function public.in_scope_site(p_site uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select case
      when m.role = 'owner' then true
      when not exists (
        select 1 from public.member_scopes s where s.org_id = m.org_id and s.member_id = m.id and s.archived_at is null
      ) then m.role in ('manager', 'accountant')
      else exists (
        select 1 from public.member_scopes s
        where s.org_id = m.org_id and s.member_id = m.id and s.archived_at is null
          and (s.site_id = x.id or s.division_id = x.division_id)
      )
    end
    from public.members m
    join public.sites x on x.org_id = m.org_id and x.id = p_site
    where m.user_id = auth.uid() and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
  ), false)
$$;

-- جسم 0005 (0005_scopes_stores_items.sql)
create or replace function public.in_scope_wh(p_warehouse uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select case
      when m.role = 'owner' then true
      when not exists (
        select 1 from public.member_scopes s where s.org_id = m.org_id and s.member_id = m.id and s.archived_at is null
      ) then m.role in ('manager', 'accountant')
      else exists (
        select 1 from public.member_scopes s
        where s.org_id = m.org_id and s.member_id = m.id and s.archived_at is null
          and (s.warehouse_id = w.id or s.site_id = w.site_id or s.division_id = w.division_id)
      )
    end
    from public.members m
    join public.warehouses w on w.org_id = m.org_id and w.id = p_warehouse
    where m.user_id = auth.uid() and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
  ), false)
$$;

-- جسم 0005 (0005_scopes_stores_items.sql)
create or replace function private.scope_touches_division(p_division uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select case
      when m.role = 'owner' then true
      when not exists (
        select 1 from public.member_scopes s where s.org_id = m.org_id and s.member_id = m.id and s.archived_at is null
      ) then m.role in ('manager', 'accountant')
      else exists (
        select 1 from public.member_scopes s
        where s.org_id = m.org_id and s.member_id = m.id and s.archived_at is null
          and (s.division_id = p_division
            or exists (select 1 from public.sites x where x.org_id = s.org_id and x.id = s.site_id and x.division_id = p_division)
            or exists (select 1 from public.warehouses w where w.org_id = s.org_id and w.id = s.warehouse_id and w.division_id = p_division))
      )
    end
    from public.members m
    where m.user_id = auth.uid() and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
      and exists (select 1 from public.divisions d where d.org_id = m.org_id and d.id = p_division)
  ), false)
$$;

-- جسم 0001 (0001_core.sql)
create or replace function private.require(p_action text) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.can(p_action) then
    raise exception 'forbidden' using hint = case p_action
      when 'members.manage' then 'إضافة الموظفين وتعديل أدوارهم ونطاقهم لمالك المنشأة فقط.'
      when 'period.lock' then 'قفل الفترة للمدير أو مالك المنشأة فقط.'
      when 'period.unlock' then 'فتح فترة مقفلة لمالك المنشأة فقط. اطلب منه ذلك إن كان الفتح ضرورياً.'
      else 'لا تملك صلاحية هذا الإجراء. اطلب من مالك المنشأة تغيير دورك إن كنت تحتاج إليه.'
    end;
  end if;
end
$$;

-- جسم 0025 (0025_mill_materials_only.sql)
create or replace function public.production_form(p_recipe uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  r public.recipes;
  cur public.recipe_versions;
  v_bare boolean;
  v_last uuid;
  v_wo uuid;
begin
  perform private.require('production.draft');
  if not exists (select 1 from public.warehouses w where w.org_id = v_org and w.kind = 'raw' and w.archived_at is null and public.in_scope_wh(w.id)) then
    raise exception 'forbidden' using hint = 'مخازن موادّ المعمل خارج نطاقك، فلا تُنتج منها. اطلب من مالك المنشأة تعديل نطاقك.';
  end if;
  select * into r from public.recipes where org_id = v_org and id = p_recipe;
  if r.id is null then
    raise exception 'recipe_not_found' using hint = 'هذه الخلطة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  select * into cur from public.recipe_versions where org_id = v_org and recipe_id = r.id and status = 'active';
  v_bare := cur.id is not null and not exists (select 1 from public.recipe_lines l where l.org_id = v_org and l.version_id = cur.id and l.qty is not null);
  -- آخر دفعة مرحَّلة للخلطة بأيّ نسخة، ممّا يقرؤه المنتج (أحد طرفيها بنطاقه، كسياسة قراءة الدفعة)، بتعريف لوحة المعمل نفسه.
  v_last := private.last_posted_batch(r.id);
  v_wo := private.feed_balance_wh();
  return jsonb_build_object(
    'today', public.app_today(),
    'recipe', jsonb_build_object('id', r.id, 'name', r.name, 'archived', r.archived_at is not null,
      'output_item', (select jsonb_build_object('id', i.id, 'name', i.name, 'tracks_expiry', i.tracks_expiry) from public.items i where i.org_id = v_org and i.id = r.output_item_id)),
    'active', case when cur.id is null then null else jsonb_build_object('id', cur.id, 'version_no', cur.version_no, 'materials_only', v_bare) end,
    'materials', case when cur.id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
        'line_no', l.line_no, 'item_id', l.item_id, 'name', i.name, 'kind', i.kind, 'base_unit', i.base_unit,
        'density', case when i.base_unit = 'L' then round(i.density_kg_per_l, 4)::text end, 'archived', i.archived_at is not null,
        'in_basis', i.kind not in ('fuel', 'packaging'), 'scale_step', i.scale_step::text,
        'default_qty', coalesce(q.last_qty, q.recipe_qty)::text,
        'default_source', case when q.last_qty is not null then 'last' when q.recipe_qty is not null then 'recipe' end)
        order by l.line_no)
      from public.recipe_lines l
      join public.items i on i.org_id = l.org_id and i.id = l.item_id
      cross join lateral (select
        (select sum(coalesce(p.actual_qty_base, p.planned_qty_base)) from public.production_inputs p
          where p.org_id = l.org_id and p.batch_id = v_last and p.item_id = l.item_id and p.base_unit = i.base_unit) as last_qty,
        case when v_bare or l.qty is null then null
          when l.unit = i.base_unit then l.qty
          when l.unit = 'kg' and i.base_unit = 'L' and coalesce(l.density_kg_per_l, i.density_kg_per_l) > 0
            then private.kg_to_liters(l.qty, coalesce(l.density_kg_per_l, i.density_kg_per_l))
          when l.unit = 'L' and i.base_unit = 'kg' and l.density_kg_per_l > 0 then private.liters_to_kg(l.qty, l.density_kg_per_l)
        end as recipe_qty) as q
      where l.org_id = v_org and l.version_id = cur.id), '[]'::jsonb) end,
    'last', (select jsonb_build_object('id', b.id, 'doc_no', b.doc_no, 'produced_on', b.produced_on, 'output_kg', b.output_qty_kg::text,
        'input_mass_kg', b.input_mass_kg::text,
        'extra_items', coalesce((select jsonb_agg(jsonb_build_object('item_id', p.item_id, 'name', i.name) order by p.line_no)
          from public.production_inputs p join public.items i on i.org_id = p.org_id and i.id = p.item_id
          where p.org_id = b.org_id and p.batch_id = b.id and i.archived_at is null
            and not exists (select 1 from public.recipe_lines l where l.org_id = p.org_id and l.version_id = cur.id and l.item_id = p.item_id)), '[]'::jsonb))
      from public.production_batches b where b.org_id = v_org and b.id = v_last),
    'stores', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name) order by w.name collate "C", w.id)
      from public.warehouses w where w.org_id = v_org and w.kind = 'raw' and w.archived_at is null and public.in_scope_wh(w.id)), '[]'::jsonb),
    'output_store', (select jsonb_build_object('id', w.id, 'name', w.name) from public.warehouses w where w.org_id = v_org and w.id = v_wo),
    'can_edit_recipe', public.can('recipe.activate'),
    'draft_exists', exists (select 1 from public.recipe_versions x where x.org_id = v_org and x.recipe_id = r.id and x.status = 'draft'));
end
$$;
