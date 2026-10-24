// القالب نفسه يطابق ما انقاس من الإنتاج (bootstrap.sql). إذا انحرف، كل فحص RLS بعده يفحص قاعدة غير قاعدتنا:
// بالذات الامتيازات الافتراضية المفتوحة، اللي الهجرات لازم تسحبها وفحوصها تثبت إنها انسحبت.
const USER = '11111111-1111-4111-8111-111111111111';

export default async function (t, db) {
  const [version] = (await db.admin('show server_version_num')).rows;
  t.ok(Number(version.server_version_num) >= 170000 && Number(version.server_version_num) < 180000, `بوستغريس 17 مثل الإنتاج (${version.server_version_num})`);

  // auth.uid() وauth.role() من مطالبات PostgREST بالضبط.
  const asUser = await db.asUser(USER, (q) => q('select auth.uid() as uid, auth.role() as role, current_user as who'));
  t.same(asUser.rows[0], { uid: USER, role: 'authenticated', who: 'authenticated' }, 'المستخدم الداخل: auth.uid() والدور');
  const asAnon = await db.asAnon((q) => q('select auth.uid() as uid, current_user as who'));
  t.same(asAnon.rows[0], { uid: null, who: 'anon' }, 'بلا دخول: auth.uid() فارغ');

  // صاحب الهجرات مو خارق، ويتجاوز RLS، مثل postgres بالإنتاج.
  const roles = await db.admin(
    "select rolname, rolsuper, rolbypassrls from pg_roles where rolname in ('postgres', 'authenticated', 'anon', 'service_role') order by rolname",
  );
  t.same(
    roles.rows,
    [
      { rolname: 'anon', rolsuper: false, rolbypassrls: false },
      { rolname: 'authenticated', rolsuper: false, rolbypassrls: false },
      { rolname: 'postgres', rolsuper: false, rolbypassrls: true },
      { rolname: 'service_role', rolsuper: false, rolbypassrls: true },
    ],
    'خصائص الأدوار المقيسة',
  );

  // الامتيازات الافتراضية المقيسة: جدول ودالّة جديدة من postgres تنفتح لـanon وauthenticated.
  // هذا اللي تسحبه الهجرات (قائمة سماح)، وفحوصها لازم تثبت العكس على جداولها.
  const defaults = await db.asOwner(async (q) => {
    await q('create table public.probe_defaults (id int)');
    await q('create function public.probe_defaults_fn() returns int language sql as $$ select 1 $$');
    return (
      await q(`select
        has_table_privilege('anon', 'public.probe_defaults', 'insert') as anon_insert,
        has_table_privilege('authenticated', 'public.probe_defaults', 'delete') as auth_delete,
        has_function_privilege('anon', 'public.probe_defaults_fn()', 'execute') as anon_execute`)
    ).rows[0];
  });
  t.same(defaults, { anon_insert: true, auth_delete: true, anon_execute: true }, 'الافتراضي مفتوح مثل الإنتاج (والهجرات تسحبه)');

  // pgcrypto بمخطّط extensions، وحدود الوقت للأدوار.
  const crypto = await db.asUser(USER, (q) => q('select length(extensions.gen_random_bytes(8)) as n'));
  t.eq(crypto.rows[0].n, 8, 'pgcrypto بمخطّط extensions');
  const timeouts = await db.admin(
    "select rolname, rolconfig from pg_roles where rolname in ('anon', 'authenticated') order by rolname",
  );
  t.same(
    timeouts.rows.map((row) => [row.rolname, row.rolconfig]),
    [
      ['anon', ['statement_timeout=3s']],
      ['authenticated', ['statement_timeout=8s']],
    ],
    'حدود وقت الاستعلام المقيسة',
  );
}
