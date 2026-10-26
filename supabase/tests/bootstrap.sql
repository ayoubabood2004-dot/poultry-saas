-- قالب Supabase للحزمة: مقيس على مشروع الإنتاج نفسه (poultry-saas، فرانكفورت، بوستغريس 17.11)
-- بقراءة pg_roles وpg_auth_members وpg_default_acl وصلاحيات المخطّطات وauth.uid() يوم 2026-10-24.
-- القالب ينقاس على صلاحيات الإنتاج مو على ما يسهّل الفحص (FOUNDATION، حزمة بوستغريس ١): بالذات
-- الامتيازات الافتراضية تنطي anon وauthenticated كل شي بكل جدول ودالّة جديدة، والهجرات لازم تسحبها.
-- ينفّذه supabase_admin (المستخدم الخارق، مثل الإنتاج)، والهجرات بعده تنفّذها postgres (مو خارق).

-- الأدوار بخصائصها المقيسة.
create role anon nologin inherit;
create role authenticated nologin inherit;
create role service_role nologin inherit bypassrls;
create role authenticator login noinherit;
create role postgres login inherit createrole bypassrls;
create role supabase_auth_admin login noinherit createrole;
grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres;

alter role anon set statement_timeout = '3s';
alter role authenticated set statement_timeout = '8s';
alter role authenticator set statement_timeout = '8s';
alter role authenticator set lock_timeout = '8s';
alter role postgres set search_path = "$user", public, extensions;

-- ─── لكل قاعدة ─── (فوكه للعنقود كلّه مرّة وحدة؛ مشغّل التراجع يعيد من هنا بكل قاعدة جديدة، rollback.mjs)
-- القاعدة ملك postgres: pg_database_owner عليها UC بـpublic، فالهجرات تنشئ بيها.
do $$ begin execute format('alter database %I owner to postgres', current_database()); end $$;
grant usage on schema public to postgres, anon, authenticated, service_role;

-- المخطّطات بصلاحياتها المقيسة.
create schema extensions authorization postgres;
grant usage on schema extensions to anon, authenticated, service_role;
create extension if not exists pgcrypto schema extensions;
create extension if not exists "uuid-ossp" schema extensions;

create schema auth authorization supabase_admin;
grant usage on schema auth to anon, authenticated, service_role, postgres;
grant usage, create on schema auth to supabase_auth_admin;

-- auth.users بالأعمدة اللي ينبني عليها شي أو اللي تفرّق بين الحسابات (الإنتاج بيه أكثر)، بتعريفاتها بالإنتاج حرفياً
-- (مقيس 2026-10-25 بعد رفع 0001): التأكيد والحظر وSSO والمجهول، والبريد فريد لغير SSO، والهاتف فريد.
create table auth.users (
  id uuid primary key,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  phone text default null::character varying,
  email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz,
  confirmed_at timestamptz generated always as (least(email_confirmed_at, phone_confirmed_at)) stored,
  banned_until timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz,
  deleted_at timestamptz,
  is_sso_user boolean not null default false,
  is_anonymous boolean not null default false,
  constraint users_phone_key unique (phone)
);
create unique index users_email_partial_key on auth.users (email) where (is_sso_user = false);
-- ملك supabase_auth_admin، وpostgres عليه كل الامتيازات والقراءة بحقّ المنح (postgres=ar*wdDxtm بالإنتاج؛ القياس
-- الأوّل كتب SELECT وTRIGGER وREFERENCES بس، والتحقّق بعد الرفع صحّحه)، وauthenticated ما يقرأه.
alter table auth.users owner to supabase_auth_admin;
grant select on auth.users to postgres with grant option;
grant insert, update, delete, truncate, references, trigger, maintain on auth.users to postgres;

-- نفس تعريفات الإنتاج حرفياً.
create or replace function auth.uid() returns uuid language sql stable as $$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text language sql stable as $$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;

grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role, postgres;

-- الامتيازات الافتراضية المقيسة: كل جدول ودالّة وتسلسل جديد بـpublic ينفتح لـanon وauthenticated. بنفس ترتيب الإنتاج
-- وبنفس صفّ postgres لنفسه (مقيس 2026-10-25 بعد رفع 0001: ملخّص الكتالوج بالطرفين واحد، snapshot.mjs).
alter default privileges for role postgres in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant execute on functions to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant usage, select, update on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant execute on functions to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant usage, select, update on sequences to postgres, anon, authenticated, service_role;
