-- 0001_core — الأساس اللي كل وحدة تقف عليه (FOUNDATION «خطّة البناء» 0، و«نموذج البيانات» ٢٣٧–٢٦٢، و٤٣٨–٤٤٧، و٥١٤–٥٤٤).
-- المشكلة: Supabase يفتح كل جدول ودالّة جديدة لـanon وauthenticated (bootstrap.sql مقيس على الإنتاج)، وماكو منشأة ولا
--   عضو ولا وحدة ولا دفتر. هنا: المنشآت والأعضاء ونطاقهم بالوحدة، الوحدات الست ودفاترها السبعة لكل منشأة، auth_org()
--   وmy_workspace()، can_see_* وin_scope_division وcan(action) مرآة src/domain/permissions.ts، قفل الفترة وحدّ الرجوع
--   ٧ أيام (القرار 9)، سجلّ التدقيق، rpc_refs، وسحب الصلاحيات الافتراضية وقائمة سماح صريحة.
-- قرارات المالك (DECISIONS 2026-10-25): الدخول برقم الهاتف وكلمة سرّ، المشترك يسجّل وينشئ منشأته (create_my_org)،
--   وإضافة الموظفين وأدوارهم للمالك بس. الاشتراكات مؤجّلة: ماكو بوّابة اشتراك هنا.
-- تراجع: الجداول جديدة وفارغة؛ التراجع حذفها ويّا دوالّها والمخطّط private بمحرّر SQL بكلمة المالك (أداة Supabase
--   تحبس drop). ماكو ملف rollback لأن الهجرة مو ثقيلة: ما تلمس بيانات موجودة.
-- تنعاد بأمان: if not exists، create or replace، وكتل do تفحص الكتالوج قبل السياسات والقيود.

set lock_timeout = '5s';

-- ─── الصلاحيات الافتراضية: قبل أي إنشاء، لأنها تأثّر على اللي ينشأ بعدها بس ────────────────────────────────
-- بلا «in schema»: السحب من PUBLIC لمخطّط وحده ما يسوّي شي (FOUNDATION ٥١٧).
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
-- الجداول والتسلسلات: Supabase ينطي anon وauthenticated كلشي (حتى TRUNCATE اللي يتجاوز RLS). نسحب الكل، وكل جدول
-- ينطي authenticated القراءة بس إذا إله سياسة قراءة، والكتابة من الدوالّ بس (FOUNDATION ٤٣٨).
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

-- المساعدات بمخطّط private ما ينكشف لـPostgREST (FOUNDATION ٥١٦، ٨٥٩).
create schema if not exists private authorization postgres;
revoke all on schema private from public, anon, authenticated;

-- ─── المنشآت والأعضاء ─────────────────────────────────────────────────────────────────────────────────────────
-- المنشأة نفسها، بلا org_id. الاشتراك (plan/plan_until) مؤجّل بكلمة المالك.
create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

-- العضو: مستخدم بمنشأة بدور. عضوية فعّالة وحدة لكل مستخدم (DECISIONS 2026-10-25)، فـauth_org() تعرف منشأته بلا اختيار.
-- org_id بلا افتراض هنا: auth_org() تقرأ هذا الجدول، فتنشأ بعده وتصير افتراضه تحت.
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  user_id uuid not null references auth.users (id),
  role text not null check (role in ('owner', 'manager', 'storekeeper', 'mill_operator', 'hatchery_operator', 'hall_worker', 'accountant', 'viewer')),
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  phone text check (phone ~ '^9647[0-9]{9}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (org_id, id),
  unique (org_id, user_id)
);
create unique index if not exists members_one_active_per_user on public.members (user_id) where archived_at is null;
create index if not exists members_user_id on public.members (user_id);

-- ─── الهويّة: كلها definer تقرأ members (مو الجدول المحمي، فما يصير 42P17)، والسياسات تناديها (select …) ─────────
create or replace function private.my_role() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select m.role from public.members m where m.user_id = auth.uid() and m.archived_at is null
$$;

-- منشأة المستخدم الداخل: افتراض org_id بكل جدول مستأجر، والسياسات تناديها (select public.auth_org()) مو عارية.
create or replace function public.auth_org() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select m.org_id from public.members m where m.user_id = auth.uid() and m.archived_at is null
$$;

alter table public.members alter column org_id set default public.auth_org();

-- ─── الوحدات الست ودفاترها ────────────────────────────────────────────────────────────────────────────────────
-- الست تبين لكل منشأة (DECISIONS: ماكو تفعيل لكل منشأة). الاسم للطباعة؛ الشاشة تعرض الاسم من t() حسب kind.
create table if not exists public.divisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  kind text not null check (kind in ('feed_mill', 'broiler', 'layer', 'hatchery', 'medicine', 'general')),
  name text not null check (length(btrim(name)) between 1 and 80),
  go_live_on date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (org_id, id),
  unique (org_id, kind)
);

-- دفتر لكل وحدة (main)، والمفقس دفتران (chicks وhatching_eggs) بلا main: سبعة لكل منشأة (FOUNDATION ٢٦١، book-check).
create table if not exists public.ledger_books (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  division_id uuid not null,
  code text not null check (code in ('main', 'chicks', 'hatching_eggs')),
  name text not null check (length(btrim(name)) between 1 and 80),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (org_id, id),
  unique (org_id, division_id, code),
  foreign key (org_id, division_id) references public.divisions (org_id, id)
);

-- نطاق العضو بالوحدة (المرحلة 0: «نطاق المستخدم بالوحدة»). site/warehouse/hall تنضاف ويّا جداولها بهجرة إضافية.
-- بلا صفوف: المالك كل المنشأة دائماً، والمدير والمحاسب كل المنشأة، وغيرهم ولا شي (مرآة inScope بـpermissions.ts).
create table if not exists public.member_scopes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  member_id uuid not null,
  division_id uuid not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (org_id, id),
  unique (org_id, member_id, division_id),
  foreign key (org_id, member_id) references public.members (org_id, id),
  foreign key (org_id, division_id) references public.divisions (org_id, id)
);
create index if not exists member_scopes_division on public.member_scopes (org_id, division_id);

-- قفل الفترة: صفّ واحد لكل منشأة، وكل تاريخ <= locked_through مقفول (FOUNDATION ٢٤٦، ٥٢١).
create table if not exists public.period_locks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  locked_through date not null,
  locked_by uuid,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id)
);

-- مراجع العمليات (client_ref): نفس المرجع مرّتين = نتيجة وحدة، ونفس المرجع بمعطيات ثانية = ref_reused (FOUNDATION ٥١٩).
-- الواجهة ما تقراه (RLS بلا سياسة)، والدوالّ بس تكتبه. بروتوكوله ويّا أوّل دالّة ترحيل بالمرحلة 1.
create table if not exists public.rpc_refs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  fn text not null,
  client_ref uuid not null,
  args_hash text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (org_id, id),
  unique (org_id, fn, client_ref)
);

-- سجلّ التدقيق: «منو ومتى» للثانية بكل جدول (FOUNDATION ٢٥١، ٧٩٧). يكتبه المشغّل definer بس، وما يتعدّل ولا ينحذف،
-- وقراءته لأدوار الكلفة بس (سياسة مقيِّدة، FOUNDATION ٤٤٣).
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  table_name text not null,
  row_id uuid not null,
  op text not null check (op in ('insert', 'update', 'delete')),
  old jsonb,
  new jsonb,
  actor uuid,
  at timestamptz not null default now()
);
create index if not exists audit_log_org_at on public.audit_log (org_id, at);

-- ─── صلاحيات الأدوار: مرآة src/domain/permissions.ts (DECISIONS «جدول الصلاحيات») ───────────────────────────────
create or replace function public.can_see_cost() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(private.my_role() in ('owner', 'manager', 'accountant'), false)
$$;

create or replace function public.can_see_accounts() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(private.my_role() in ('owner', 'manager', 'accountant'), false)
$$;

-- المبيعات والجهات ممنوعة عن عامل القاعة ومشغّلَي المفقس والمعمل؛ الأمين والمشاهد يقرونها.
create or replace function public.can_see_sales() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(private.my_role() not in ('hall_worker', 'hatchery_operator', 'mill_operator'), false)
$$;

-- الوحدة ضمن نطاق المستخدم: بمنشأته، والمالك كلها، وبلا صفوف نطاق المدير والمحاسب كلها وغيرهم ولا وحدة.
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
    where m.user_id = auth.uid() and m.archived_at is null
      and exists (select 1 from public.divisions d where d.org_id = m.org_id and d.id = p_division)
  ), false)
$$;

-- الأفعال وحدها، بنفس أسماء ACTIONS بـpermissions.ts. فعل مو بالقائمة يرمي حتى غلط إملائي ما يصير «ممنوع» بصمت.
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
    'party.offset', 'members.manage',
    'read'
  ]
$$;

-- الجدول نفسه: المالك كلشي؛ party.offset وmembers.manage للمالك بس؛ المدير كل الباقي؛ والأدوار التشغيلية أفعالها.
create or replace function private.role_can(p_role text, p_action text, p_costs_confirmed boolean default false) returns boolean
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
begin
  if p_action is null or not (p_action = any (private.actions())) then
    raise exception 'unknown_action' using hint = format('الإجراء «%s» غير معروف.', p_action);
  end if;
  if p_role is null then return false; end if;
  if p_role = 'owner' then return true; end if;
  if p_action in ('party.offset', 'members.manage') then return false; end if;
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

-- مرآة can() بالشاشة. مشغّل المعمل يرحّل دفعة الإنتاج بس بعد ختم الكلف (FOUNDATION ٥٣٥).
create or replace function public.can(p_action text, p_costs_confirmed boolean default false) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select private.role_can(private.my_role(), p_action, p_costs_confirmed)
$$;

create or replace function private.require(p_action text) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.can(p_action) then
    raise exception 'forbidden' using hint = 'لا تملك صلاحية هذا الإجراء.';
  end if;
end
$$;

-- ─── اليوم والتاريخ ────────────────────────────────────────────────────────────────────────────────────────────
-- «اليوم» بالخادم يوم بغداد (FOUNDATION ٤٩٧). الحزمة بس تبدّلها بيوم ثابت؛ الإنتاج ما عنده طريق يغيّرها.
create or replace function public.app_today() returns date
language sql stable set search_path = pg_catalog, pg_temp as $$
  select (now() at time zone 'Asia/Baghdad')::date
$$;

-- قاعدة تاريخ المستند المشتركة (FOUNDATION ٥٢١، القرار 9: الرجوع ٧ أيام): المستقبل مرفوض، الأقدم من ٧ أيام مرفوض،
-- والفترة المقفولة مرفوضة. دوالّ الترحيل بالمراحل الجاية تناديها بأوّل سطورها.
create or replace function private.check_doc_date(p_date date) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_today date := public.app_today();
  v_lock date;
begin
  if p_date is null then
    raise exception 'date_required' using hint = 'اكتب تاريخ المستند.';
  end if;
  if p_date > v_today then
    raise exception 'date_in_future' using hint = format('تاريخ المستند %s بعد اليوم %s. سجّله بتاريخ اليوم أو قبله.',
      to_char(p_date, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY'));
  end if;
  if p_date < v_today - 7 then
    raise exception 'date_too_old' using hint = format('لا يُقبل تاريخ أقدم من 7 أيام؛ أقدم تاريخ مسموح %s.',
      to_char(v_today - 7, 'DD/MM/YYYY'));
  end if;
  select l.locked_through into v_lock from public.period_locks l where l.org_id = public.auth_org();
  if v_lock is not null and p_date <= v_lock then
    raise exception 'period_locked' using hint = format('الفترة مقفلة حتى %s، فلا يُسجَّل مستند بتاريخ %s.',
      to_char(v_lock, 'DD/MM/YYYY'), to_char(p_date, 'DD/MM/YYYY'));
  end if;
end
$$;

-- ─── رقم الهاتف: مرآة src/domain/phone.ts حرفاً بحرف (الحزمة تقارنهم) ────────────────────────────────────────────
create or replace function private.normalize_phone(p_input text) returns text
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare
  d text;
begin
  if p_input is null then return null; end if;
  -- الأرقام الشرقية والفارسية غربية، و«٫» نقطة و«٬» فاصلة (مثل toWesternDigits).
  d := translate(btrim(p_input), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹٫٬', '01234567890123456789.,');
  d := regexp_replace(d, '[[:space:]().-]', '', 'g');
  if left(d, 1) = '+' then d := substr(d, 2);
  elsif left(d, 2) = '00' then d := substr(d, 3);
  end if;
  if d !~ '^[0-9]+$' then return null; end if;
  if left(d, 3) = '964' then d := substr(d, 4); end if;
  if left(d, 1) = '0' then d := substr(d, 2); end if;
  if d ~ '^7[0-9]{9}$' then return '964' || d; end if;
  return null;
end
$$;

-- الدخول برقم الهاتف وكلمة سرّ (DECISIONS 2026-10-25): الرقم بعمود phone إذا مزوّد الهاتف شغّال، أو كاسم بريد
-- «الرقم@phone.login» إذا الدخول بالبريد بلا SMS. الحالتين تنقرا هنا، فالواجهة تختار بلا ما تتغيّر القاعدة.
create or replace function private.phone_login_domain() returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select 'phone.login'
$$;

create or replace function private.user_phone(p_user uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select private.normalize_phone(coalesce(nullif(u.phone, ''), split_part(u.email, '@', 1)))
  from auth.users u where u.id = p_user
$$;

create or replace function private.user_id_for_phone(p_phone text) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select u.id from auth.users u
  where u.deleted_at is null
    and (u.phone = p_phone or lower(u.email) = p_phone || '@' || private.phone_login_domain())
  order by u.created_at
  limit 1
$$;

-- ─── المشغّلات ────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row uuid;
  v_org uuid;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  v_row := coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid);
  -- المنشأة من الصفّ نفسه مو من auth_org(): تحت service_role وبالهجرات auth_org() فارغة.
  v_org := case when tg_table_name = 'orgs' then v_row
                else coalesce((v_new ->> 'org_id')::uuid, (v_old ->> 'org_id')::uuid) end;
  insert into public.audit_log (org_id, table_name, row_id, op, old, new, actor, at)
  values (v_org, tg_table_name, v_row, lower(tg_op), v_old, v_new, auth.uid(), now());
  return null;
end
$$;

create or replace function private.reject_change() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  raise exception 'append_only' using hint = format('سجلّ %s لا يُعدَّل ولا يُحذف.', tg_table_name);
end
$$;

-- رمز الدفتر يطابق نوع وحدته: المفقس chicks وhatching_eggs، والباقي main.
create or replace function private.check_book_code() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_kind text;
begin
  select d.kind into v_kind from public.divisions d where d.org_id = new.org_id and d.id = new.division_id;
  if (v_kind = 'hatchery') <> (new.code in ('chicks', 'hatching_eggs')) then
    raise exception 'book_code_mismatch' using hint = format('الدفتر «%s» لا يناسب الوحدة «%s».', new.code, v_kind);
  end if;
  return new;
end
$$;

create or replace trigger ledger_books_code before insert or update on public.ledger_books
  for each row execute function private.check_book_code();
create or replace trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function private.reject_change();

create or replace trigger audit_orgs after insert or update or delete on public.orgs
  for each row execute function private.audit_row();
create or replace trigger audit_members after insert or update or delete on public.members
  for each row execute function private.audit_row();
create or replace trigger audit_divisions after insert or update or delete on public.divisions
  for each row execute function private.audit_row();
create or replace trigger audit_ledger_books after insert or update or delete on public.ledger_books
  for each row execute function private.audit_row();
create or replace trigger audit_member_scopes after insert or update or delete on public.member_scopes
  for each row execute function private.audit_row();
create or replace trigger audit_period_locks after insert or update or delete on public.period_locks
  for each row execute function private.audit_row();

-- ─── RLS: كل سياسة شرط ملكية على أعمدة الصفّ نفسه، والدوالّ داخلها (select …)، وماكو سياسة كتابة ──────────────────
alter table public.orgs enable row level security;
alter table public.members enable row level security;
alter table public.divisions enable row level security;
alter table public.ledger_books enable row level security;
alter table public.member_scopes enable row level security;
alter table public.period_locks enable row level security;
alter table public.rpc_refs enable row level security;
alter table public.audit_log enable row level security;

do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('orgs', 'orgs_read', 'id = (select public.auth_org())'),
      ('members', 'members_read', 'org_id = (select public.auth_org())'),
      ('divisions', 'divisions_read', 'org_id = (select public.auth_org())'),
      ('ledger_books', 'ledger_books_read', 'org_id = (select public.auth_org())'),
      ('member_scopes', 'member_scopes_read', 'org_id = (select public.auth_org())'),
      ('period_locks', 'period_locks_read', 'org_id = (select public.auth_org())'),
      ('audit_log', 'audit_log_read', 'org_id = (select public.auth_org())')
    ) as t(tbl, name, cond)
  loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.name) then
      execute format('create policy %I on public.%I for select to authenticated using (%s)', p.name, p.tbl, p.cond);
    end if;
  end loop;
  -- السجلّ على قائمة الكلف: سياسة مقيِّدة فوك سياسة المنشأة (المقيِّدة لحالها ما تنطي شي).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'audit_log_cost_only') then
    create policy audit_log_cost_only on public.audit_log as restrictive for select to authenticated
      using ((select public.can_see_cost()));
  end if;
end
$$;

-- ─── مساعدات الإدارة ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.require_signed_in() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using hint = 'سجّل الدخول أولاً.';
  end if;
  return v_uid;
end
$$;

create or replace function private.check_name(p_value text, p_max int, p_label text) returns text
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
begin
  if p_value is null or length(btrim(p_value)) not between 1 and p_max then
    raise exception 'invalid_name' using hint = format('اكتب %s (من حرف واحد إلى %s حرفاً).', p_label, p_max);
  end if;
  return btrim(p_value);
end
$$;

create or replace function private.check_role(p_role text) returns text
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
begin
  if p_role is null or p_role not in ('owner', 'manager', 'storekeeper', 'mill_operator', 'hatchery_operator', 'hall_worker', 'accountant', 'viewer') then
    raise exception 'invalid_role' using hint = 'اختر دوراً من الأدوار الثمانية.';
  end if;
  return p_role;
end
$$;

-- العضو بمنشأة الداخل، مقفول للتعديل؛ غيره member_not_found حتى لو موجود بمنشأة ثانية.
create or replace function private.org_member(p_member uuid) returns public.members
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  m public.members;
begin
  select * into m from public.members where org_id = public.auth_org() and id = p_member and archived_at is null for update;
  if m.id is null then
    raise exception 'member_not_found' using hint = 'لا يوجد هذا العضو في منشأتك.';
  end if;
  return m;
end
$$;

-- آخر مالك فعّال ما ينزل ولا ينشال (FOUNDATION ٤٣٨). القفل على صفوف المالكين يرتّب نداءين بنفس اللحظة.
create or replace function private.keep_an_owner(p_member public.members) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_others int;
begin
  if p_member.role <> 'owner' then return; end if;
  perform 1 from public.members where org_id = p_member.org_id and role = 'owner' and archived_at is null for update;
  select count(*) into v_others from public.members
  where org_id = p_member.org_id and role = 'owner' and archived_at is null and id <> p_member.id;
  if v_others = 0 then
    raise exception 'last_owner' using hint = 'هذا آخر مالك للمنشأة. أضف مالكاً آخر أولاً.';
  end if;
end
$$;

-- يستبدل نطاق العضو بقائمة وحدات: الجديدة تنضاف (أو ترجع من الأرشيف)، واللي طلعت تنأرشف. ماكو حذف.
create or replace function private.apply_scopes(p_member uuid, p_divisions uuid[]) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_list uuid[] := coalesce(p_divisions, '{}'::uuid[]);
  v_div uuid;
begin
  if exists (select 1 from unnest(v_list) as x(id) where not exists (select 1 from public.divisions d where d.org_id = v_org and d.id = x.id)) then
    raise exception 'division_not_found' using hint = 'إحدى الوحدات المختارة غير موجودة في منشأتك.';
  end if;
  foreach v_div in array v_list loop
    insert into public.member_scopes (org_id, member_id, division_id) values (v_org, p_member, v_div)
    on conflict (org_id, member_id, division_id) do update set archived_at = null where public.member_scopes.archived_at is not null;
  end loop;
  update public.member_scopes set archived_at = now()
  where org_id = v_org and member_id = p_member and archived_at is null and not (division_id = any (v_list));
end
$$;

-- ─── واجهات المستخدم (قائمة السماح تحت) ───────────────────────────────────────────────────────────────────────
-- الخادم يأكّد «بأي منشأة أنا» (FOUNDATION ٢٠٠، ٢١٧). بلا منشأة: org_id فارغ ورقم الهاتف حتى ينطيه للمالك.
create or replace function public.my_workspace() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_signed_in();
  m public.members;
  v_org_name text;
begin
  select * into m from public.members where user_id = v_uid and archived_at is null;
  if m.id is null then
    return jsonb_build_object('user_id', v_uid, 'org_id', null, 'phone', private.user_phone(v_uid), 'confirmed_at', now());
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
      select jsonb_agg(d.kind order by d.kind)
      from public.divisions d where d.org_id = m.org_id and d.archived_at is null and public.in_scope_division(d.id)
    ), '[]'::jsonb),
    'can_see_cost', public.can_see_cost(),
    'can_see_accounts', public.can_see_accounts(),
    'can_see_sales', public.can_see_sales(),
    'subscription', 'unknown',
    'confirmed_at', now()
  );
end
$$;

-- المشترك الجديد ينشئ منشأته ويصير مالكها (DECISIONS 2026-10-25)، ويّا الوحدات الست ودفاترها السبعة بمعاملة وحدة.
-- بس للي ما عنده عضوية فعّالة: الموظف ينتظر المالك يضيفه.
create or replace function public.create_my_org(p_org_name text, p_display_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_signed_in();
  v_org_name text := private.check_name(p_org_name, 120, 'اسم المنشأة');
  v_display text := private.check_name(p_display_name, 80, 'اسمك');
  v_org uuid;
  v_div uuid;
  k record;
begin
  -- نداءان بنفس اللحظة لنفس المستخدم: الثاني ينتظر ويلكى العضوية.
  perform pg_advisory_xact_lock(hashtextextended('create_my_org:' || v_uid::text, 0));
  if exists (select 1 from public.members where user_id = v_uid and archived_at is null) then
    raise exception 'already_member' using hint = 'أنت عضو في منشأة. لإنشاء منشأة أخرى يجب أن تُؤرشَف عضويتك الحالية أولاً.';
  end if;
  insert into public.orgs (name, created_by) values (v_org_name, v_uid) returning id into v_org;
  insert into public.members (org_id, user_id, role, display_name, phone)
  values (v_org, v_uid, 'owner', v_display, private.user_phone(v_uid));
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

-- المالك يضيف موظفاً برقم هاتفه (سجّل حسابه قبل)، بدوره ونطاقه. عضو مؤرشف بنفس المنشأة يرجع بنفس المعرّف.
create or replace function public.add_member(p_phone text, p_role text, p_display_name text, p_divisions uuid[] default '{}') returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_phone text := private.normalize_phone(p_phone);
  v_role text;
  v_display text;
  v_user uuid;
  v_member uuid;
begin
  perform private.require('members.manage');
  v_role := private.check_role(p_role);
  v_display := private.check_name(p_display_name, 80, 'اسم الموظف');
  if v_phone is null then
    raise exception 'invalid_phone' using hint = 'اكتب رقم موبايل عراقياً صحيحاً، مثل 07701234567.';
  end if;
  v_user := private.user_id_for_phone(v_phone);
  if v_user is null then
    raise exception 'user_not_found' using hint = 'لا يوجد حساب بهذا الرقم. اطلب من الموظف أن يسجّل في التطبيق برقمه أولاً، ثم أضفه.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('membership:' || v_user::text, 0));
  if exists (select 1 from public.members where user_id = v_user and archived_at is null and org_id = v_org) then
    raise exception 'already_in_org' using hint = 'هذا الموظف عضو في منشأتك.';
  end if;
  if exists (select 1 from public.members where user_id = v_user and archived_at is null) then
    raise exception 'already_member' using hint = 'صاحب هذا الرقم عضو في منشأة أخرى.';
  end if;
  insert into public.members (org_id, user_id, role, display_name, phone)
  values (v_org, v_user, v_role, v_display, v_phone)
  on conflict (org_id, user_id) do update
    set role = excluded.role, display_name = excluded.display_name, phone = excluded.phone, archived_at = null
  returning id into v_member;
  perform private.apply_scopes(v_member, p_divisions);
  return v_member;
end
$$;

create or replace function public.set_member_role(p_member uuid, p_role text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  m public.members;
  v_role text;
begin
  perform private.require('members.manage');
  v_role := private.check_role(p_role);
  m := private.org_member(p_member);
  if v_role <> 'owner' then perform private.keep_an_owner(m); end if;
  update public.members set role = v_role where org_id = m.org_id and id = m.id;
end
$$;

create or replace function public.set_member_scopes(p_member uuid, p_divisions uuid[]) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  m public.members;
begin
  perform private.require('members.manage');
  m := private.org_member(p_member);
  perform private.apply_scopes(m.id, p_divisions);
end
$$;

-- أرشفة مو حذف: العضو يرجع بنفس المعرّف بـadd_member.
create or replace function public.archive_member(p_member uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  m public.members;
begin
  perform private.require('members.manage');
  m := private.org_member(p_member);
  perform private.keep_an_owner(m);
  update public.member_scopes set archived_at = now() where org_id = m.org_id and member_id = m.id and archived_at is null;
  update public.members set archived_at = now() where org_id = m.org_id and id = m.id;
end
$$;

-- قفل الفترة: المدير والمالك (period.lock). الرجوع بالقفل للخلف يفتح فترة مقفلة: المالك بس.
create or replace function public.set_period_lock(p_locked_through date) returns date
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_current date;
begin
  perform private.require('period.lock');
  if p_locked_through is null or p_locked_through >= public.app_today() then
    raise exception 'lock_in_future' using hint = 'يُقفل ما قبل اليوم فقط.';
  end if;
  select l.locked_through into v_current from public.period_locks l where l.org_id = v_org for update;
  if v_current is not null and p_locked_through < v_current and private.my_role() <> 'owner' then
    raise exception 'owner_only_unlock' using hint = format('فتح فترة مقفلة (إرجاع القفل من %s إلى %s) للمالك فقط.',
      to_char(v_current, 'DD/MM/YYYY'), to_char(p_locked_through, 'DD/MM/YYYY'));
  end if;
  insert into public.period_locks (org_id, locked_through, locked_by) values (v_org, p_locked_through, auth.uid())
  on conflict (org_id) do update set locked_through = excluded.locked_through, locked_by = excluded.locked_by, updated_at = now();
  return p_locked_through;
end
$$;

-- ─── الثوابت: صفر مخالفة بالحزمة وبالإنتاج بعد كل هجرة (FOUNDATION ٤٢٧، ٨٧٠). لـservice_role بس ────────────────
create or replace function public.verify_core() returns table (check_name text, violations bigint)
language sql stable set search_path = public, pg_temp as $$
  select 'divisions_per_org', count(*) from public.orgs o
  where (select count(*) from public.divisions d where d.org_id = o.id and d.archived_at is null) <> 6
  union all
  select 'books_per_org', count(*) from public.orgs o
  where (select count(*) from public.ledger_books b where b.org_id = o.id and b.archived_at is null) <> 7
  union all
  select 'book_codes', count(*) from public.ledger_books b
  join public.divisions d on d.org_id = b.org_id and d.id = b.division_id
  where b.archived_at is null and (d.kind = 'hatchery') <> (b.code in ('chicks', 'hatching_eggs'))
  union all
  select 'orgs_without_owner', count(*) from public.orgs o
  where not exists (select 1 from public.members m where m.org_id = o.id and m.role = 'owner' and m.archived_at is null)
  union all
  select 'scopes_of_archived_members', count(*) from public.member_scopes s
  join public.members m on m.org_id = s.org_id and m.id = s.member_id
  where s.archived_at is null and m.archived_at is not null
$$;

-- ─── الصلاحيات: الجداول للقراءة بسياساتها، والكتابة من الدوالّ بس؛ anon ولا شي ──────────────────────────────────
revoke all on table public.orgs, public.members, public.divisions, public.ledger_books, public.member_scopes,
  public.period_locks, public.rpc_refs, public.audit_log from anon, authenticated;
grant select on table public.orgs, public.members, public.divisions, public.ledger_books, public.member_scopes,
  public.period_locks, public.audit_log to authenticated;

-- قائمة السماح لـauthenticated (نسختها بـsupabase/tests/allowlist.json، والحزمة تثبت التطابق بالضبط).
grant execute on function
  public.auth_org(),
  public.can_see_cost(),
  public.can_see_accounts(),
  public.can_see_sales(),
  public.in_scope_division(uuid),
  public.can(text, boolean),
  public.app_today(),
  public.my_workspace(),
  public.create_my_org(text, text),
  public.add_member(text, text, text, uuid[]),
  public.set_member_role(uuid, text),
  public.set_member_scopes(uuid, uuid[]),
  public.archive_member(uuid),
  public.set_period_lock(date)
to authenticated;

grant execute on function public.verify_core() to service_role;
