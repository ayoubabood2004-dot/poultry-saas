-- 0002_account_checks — حساب الدخول لازم يكون حساباً حقيقياً يقدر يدخل (بعد رفع 0001 والتحقّق بالإنتاج، 2026-10-25).
-- المشكلة (التحقّق بالإنتاج، 5 محقّقين): (1) private.account_phone كان يطبّع اسم البريد، فـ«07…@phone.login» و«00964…»
--   و«٠٧…» تُعدّ نفس الرقم: حساب بشكل ثانٍ يخلّي دعوة الموظف الحقيقي phone_ambiguous، أو توصل الدعوة لغيره. (2) الحساب
--   المحذوف والموقوف والمجهول وغير المؤكَّد ينلكى بالرقم ويندعى. (3) private.require_signed_in يصدّق أي sub بالتوكن:
--   مستخدم مو موجود يطلع خطأ 23503 خام، والمحذوف أو المجهول ينشئ منشأة. (4) unknown_action لفعل فارغ تلميحه «».
-- هنا: الرقم من الشكل الموحّد بس (9647XXXXXXXXX بعمود phone، أو «9647XXXXXXXXX@phone.login» حرفياً مثل loginEmail
--   بـsrc/domain/phone.ts)، والحساب «حيّ» إذا موجود وغير محذوف ومؤكَّد وغير موقوف وغير مجهول (private.account_live)،
--   والبحث بالرقم وrequire_signed_in والهويّة (my_role وauth_org وin_scope_division، فالسياسات وcan() وكل دالّة إدارة)
--   وkeep_an_owner يعدّون الحيّ بس: توكن حساب انحظر أو انحذف ما يقرأ ولا يدير حتى لو بعده صالح (المراجعة العدائية لـ0002).
-- تراجع: 0001 فيها التعريفات السابقة للدوالّ التسع؛ التراجع create or replace بنصّها من 0001 بكلمة المالك،
--   وaccount_live تبقى بلا استعمال. ماكو بيانات تتغيّر ولا توقيع ينضاف للواجهة (قائمة السماح نفسها).
-- تنعاد بأمان: create or replace بس.

set lock_timeout = '5s';

-- الحساب يقدر يدخل فعلاً: موجود، غير محذوف، مؤكَّد (confirmed_at محسوب من تأكيد البريد أو الهاتف)، غير موقوف حالياً،
-- وغير مجهول (الدخول المجهول مسدود بالإعدادات، وهذا يسدّه حتى لو انفتح).
create or replace function private.account_live(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from auth.users u
    where u.id = p_user and u.deleted_at is null and u.confirmed_at is not null and not u.is_anonymous
      and (u.banned_until is null or u.banned_until <= now())
  )
$$;

-- الرقم من الشكل الموحّد بس: عمود phone بشكل Supabase (9647XXXXXXXXX)، أو البريد «9647XXXXXXXXX@phone.login» حرفياً
-- (GoTrue يصغّر كل بريد، فالمطابقة حرفية مثل البحث بالفهرس تحت).
-- أي شكل ثاني (07…، +964…، 00964…، أرقام شرقية، نطاق ثاني) ما يُعدّ رقماً، فما يزاحم الحساب الموحّد ولا يستلم دعوته.
create or replace function private.account_phone(p_phone text, p_email text) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case
    when p_phone ~ '^9647[0-9]{9}$' then p_phone
    when split_part(p_email, '@', 1) ~ '^9647[0-9]{9}$'
      and p_email = split_part(p_email, '@', 1) || '@' || private.phone_login_domain()
      then split_part(p_email, '@', 1)
  end
$$;

-- حساب حيّ واحد بالرقم، أو phone_ambiguous إذا حسابان حيّان بنفس الرقم (عمود الهاتف وبريد الدخول، مثلاً).
create or replace function private.user_id_for_phone(p_phone text) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ids uuid[];
begin
  -- بالفهرسين (users_phone_key وusers_email_partial_key اللي شرطه not is_sso_user)، مو مسح كل الحسابات لكل دعوة.
  select array_agg(u.id order by u.created_at, u.id) into v_ids from auth.users u
  where (u.phone = p_phone or (u.email = p_phone || '@' || private.phone_login_domain() and not u.is_sso_user))
    and private.account_phone(u.phone, u.email) = p_phone and private.account_live(u.id);
  if coalesce(cardinality(v_ids), 0) > 1 then
    raise exception 'phone_ambiguous' using hint = 'يوجد أكثر من حساب بهذا الرقم. تواصل مع الدعم لتوحيدها.';
  end if;
  return v_ids[1];
end
$$;

-- التوكن وحده ما يكفي: صاحبه لازم حساب حيّ الحين (المحذوف أو الموقوف يبقى توكنه صالحاً لحد ما ينتهي).
create or replace function private.require_signed_in() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using hint = 'سجّل الدخول أولاً.';
  end if;
  if not private.account_live(v_uid) then
    raise exception 'not_signed_in' using hint = 'هذا الحساب غير متاح (محذوف أو موقوف أو غير مؤكَّد). سجّل الدخول بحساب آخر.';
  end if;
  return v_uid;
end
$$;

-- نفس جدول 0001، والفرق تلميح الفعل الفارغ بس.
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

-- ─── الهويّة على الحساب الحيّ: نفس تعريفات 0001 ويّا account_live، فالسياسات وcan() وprivate.require() ترثها ──────
create or replace function private.my_role() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select m.role from public.members m
  where m.user_id = auth.uid() and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
$$;

create or replace function public.auth_org() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select m.org_id from public.members m
  where m.user_id = auth.uid() and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
$$;

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

-- آخر مالك حيّ: مالك حسابه موقوف أو محذوف ما يُعدّ «مالكاً آخر»، فالمنشأة ما تبقى بيد حساب ما يقدر يدخل.
create or replace function private.keep_an_owner(p_member public.members) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_others int;
begin
  if p_member.role <> 'owner' or p_member.accepted_at is null then return; end if;
  perform 1 from public.members
  where org_id = p_member.org_id and role = 'owner' and archived_at is null and accepted_at is not null
  for update;
  select count(*) into v_others from public.members
  where org_id = p_member.org_id and role = 'owner' and archived_at is null and accepted_at is not null and id <> p_member.id
    and private.account_live(user_id);
  if v_others = 0 then
    raise exception 'last_owner' using hint = 'هذا آخر مالك للمنشأة. أضف مالكاً آخر وانتظر قبوله أولاً.';
  end if;
end
$$;
