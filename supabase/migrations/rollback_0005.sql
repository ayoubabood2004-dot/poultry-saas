-- rollback_0005 — تراجع 0005_scopes_stores_items (خطّة المرحلة 1 WP2، مشغّل التراجع بالحزمة FOUNDATION ٨٢٠، ٨٧٦).
-- يرجّع أجسام create_my_org وmy_workspace وprivate.actions (0001) وprivate.role_can (0002) حرفاً بحرف (md5 نفسه بالكتالوج)،
-- ويشيل اللي انضاف بـ0005: الجداول السبعة وبذورها، وعمودي النطاق بالموقع والمخزن وقيده، وعمود first_posted_at، والدوالّ الجديدة
-- (add_member_v2 ويّاها).
-- نطاق موظف بموقع أو مخزن ما ينحذف أبداً: التراجع يرفض بصوت ويرجع كلّه (المعاملة وحدة)، والمالك يقرّر شنو يسوّي بيه.
-- سجلّ التدقيق يبقى كما هو (صفوف الجداول المشالة بيه تاريخ، مو مفتاح أجنبي).

set lock_timeout = '5s';

-- الجدول يتقفل قبل العدّ ولحد نهاية المعاملة (مراجعة WP4 على rollback_0007): نطاق بموقع أو مخزن ينكتب بعد العدّ كان ينحذف.
lock table public.member_scopes in access exclusive mode;

do $$
declare
  v_rows bigint;
begin
  select count(*) into v_rows from public.member_scopes where site_id is not null or warehouse_id is not null;
  if v_rows > 0 then
    raise exception 'rollback_blocked' using hint = format('يوجد %s من صفوف نطاق الموظفين بموقع أو مخزن، والتراجع لا يحذفها. غيّر نطاق هؤلاء الموظفين إلى وحدات أوّلاً ثم أعد التراجع.', v_rows);
  end if;
end
$$;

drop function if exists public.verify_stores();
drop function if exists public.find_item_twins(text, text[]);
drop function if exists public.set_division_go_live(uuid, date);
drop function if exists public.set_member_scopes_v2(uuid, uuid[], uuid[], uuid[]);
drop function if exists public.add_member_v2(text, text, text, uuid[], uuid[], uuid[]);

-- الأجسام كما انكتبت آخر مرّة قبل 0005.
create or replace function public.create_my_org(p_org_name text, p_display_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_signed_in();
  v_org_name text := private.check_name(p_org_name, 120, 'اسم المنشأة');
  v_display text := private.check_name(p_display_name, 80, 'اسمك');
  v_existing record;
  v_org uuid;
  v_div uuid;
  k record;
begin
  -- نفس مفتاح قبول الدعوة: نداءان بنفس اللحظة لنفس المستخدم يترتّبون، والثاني يلكى العضوية.
  perform pg_advisory_xact_lock(hashtextextended('membership:' || v_uid::text, 0));
  select m.role, o.name, o.created_by into v_existing
  from public.members m join public.orgs o on o.id = m.org_id
  where m.user_id = v_uid and m.archived_at is null and m.accepted_at is not null;
  if found then
    if v_existing.role = 'owner' and v_existing.created_by = v_uid and v_existing.name = v_org_name then
      return public.my_workspace();
    end if;
    raise exception 'already_member' using hint = format('أنت عضو في منشأة «%s» بالفعل؛ حدّث الشاشة لفتحها. لا يمكن أن تكون عضواً في منشأتين معاً.', v_existing.name);
  end if;
  insert into public.orgs (name, created_by) values (v_org_name, v_uid) returning id into v_org;
  insert into public.members (org_id, user_id, role, display_name, phone, accepted_at)
  values (v_org, v_uid, 'owner', v_display, private.user_phone(v_uid), now());
  for k in
    select * from (values
      (1, 'feed_mill', 'معمل العلف'),
      (2, 'broiler', 'حقول اللحم'),
      (3, 'layer', 'حقول البيض'),
      (4, 'hatchery', 'المفقس'),
      (5, 'medicine', 'مخزن الأدوية'),
      (6, 'general', 'المخازن العامة')
    ) as t(ord, kind, name) order by ord
  loop
    insert into public.divisions (org_id, kind, name) values (v_org, k.kind, k.name) returning id into v_div;
    if k.kind = 'hatchery' then
      insert into public.ledger_books (org_id, division_id, code, name)
      values (v_org, v_div, 'chicks', 'دفتر الأفراخ'), (v_org, v_div, 'hatching_eggs', 'دفتر بيض التفقيس');
    else
      insert into public.ledger_books (org_id, division_id, code, name) values (v_org, v_div, 'main', 'دفتر ' || k.name);
    end if;
  end loop;
  return public.my_workspace();
end
$$;

create or replace function public.my_workspace() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_signed_in();
  m public.members;
  v_org_name text;
  v_invites jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'member_id', i.id, 'org_name', o.name, 'role', i.role, 'display_name', i.display_name, 'invited_at', i.created_at
    ) order by i.created_at), '[]'::jsonb)
  into v_invites
  from public.members i join public.orgs o on o.id = i.org_id
  where i.user_id = v_uid and i.accepted_at is null and i.archived_at is null;

  select * into m from public.members where user_id = v_uid and archived_at is null and accepted_at is not null;
  if m.id is null then
    return jsonb_build_object('user_id', v_uid, 'org_id', null, 'phone', private.user_phone(v_uid),
      'invites', v_invites, 'confirmed_at', now());
  end if;
  select o.name into v_org_name from public.orgs o where o.id = m.org_id;
  return jsonb_build_object(
    'user_id', v_uid,
    'org_id', m.org_id,
    'org_name', v_org_name,
    'member_id', m.id,
    'display_name', m.display_name,
    'phone', m.phone,
    'role', m.role,
    'scopes', coalesce((
      select jsonb_agg(jsonb_build_object('division_id', s.division_id) order by s.created_at)
      from public.member_scopes s where s.org_id = m.org_id and s.member_id = m.id and s.archived_at is null
    ), '[]'::jsonb),
    'divisions', coalesce((
      select jsonb_agg(d.kind order by d.kind collate "C")
      from public.divisions d where d.org_id = m.org_id and d.archived_at is null and public.in_scope_division(d.id)
    ), '[]'::jsonb),
    'can_see_cost', public.can_see_cost(),
    'can_see_accounts', public.can_see_accounts(),
    'can_see_sales', public.can_see_sales(),
    'invites', v_invites,
    'subscription', 'unknown',
    'confirmed_at', now()
  );
end
$$;

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
    when 'accountant' then p_action in ('receipt.amounts', 'costs.load', 'production.post', 'sale.post', 'payment.post', 'sale_return.post', 'expense.post', 'accounts.view')
    when 'storekeeper' then p_action in ('receipt.draft', 'transfer.post', 'issue.post', 'count.enter', 'stock_use.post')
    when 'mill_operator' then p_action = 'production.draft' or (p_action = 'production.post' and coalesce(p_costs_confirmed, false))
    when 'hatchery_operator' then p_action = 'hatch.operate'
    when 'hall_worker' then p_action in ('flock_day.save', 'weigh_ticket.draft')
    else false
  end;
end
$$;

drop function if exists private.seed_org_defaults();
drop function if exists private.apply_scopes_v2(uuid, uuid[], uuid[], uuid[]);
drop function if exists private.check_sites(uuid[]);
drop function if exists private.check_warehouses(uuid[]);
drop function if exists private.scope_touches_division(uuid);

alter table public.member_scopes drop constraint if exists member_scopes_one_target;
alter table public.member_scopes drop column if exists site_id;
alter table public.member_scopes drop column if exists warehouse_id;

drop table if exists public.item_units;
drop table if exists public.items;
drop table if exists public.item_categories;
drop table if exists public.pack_types;
drop table if exists public.expense_categories;
drop table if exists public.warehouses;
drop table if exists public.sites;
-- دوالّ النطاق بعد الجداول: سياسات المواقع والمخازن تعتمد عليها.
drop function if exists public.in_scope_wh(uuid);
drop function if exists public.in_scope_site(uuid);

drop function if exists private.master_write();
drop function if exists private.sites_check();
drop function if exists private.warehouses_check();
drop function if exists private.items_normalize();
drop function if exists private.item_units_check();
drop function if exists private.expense_categories_check();
drop function if exists private.site_kind_for(text);
drop function if exists private.warehouse_kind_allowed(text, text);

alter table public.divisions drop column if exists first_posted_at;
