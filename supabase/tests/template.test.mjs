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

  // الامتيازات الافتراضية المقيسة: جدول ودالّة جديدة تنفتح لـanon وauthenticated. الحزمة تشغّل هذا الفحص بعد الهجرات،
  // واللي سحبته 0001 افتراض postgres بس (catalog.test يثبت إن الجديد منه ينشأ مسدوداً)؛ افتراض supabase_admin
  // باقي مثل الإنتاج، فهنا يثبت إن القالب نفسه مفتوح.
  await db.admin('begin');
  let defaults;
  try {
    await db.admin('create table public.probe_defaults (id int)');
    await db.admin('create function public.probe_defaults_fn() returns int language sql as $$ select 1 $$');
    defaults = (
      await db.admin(`select
        has_table_privilege('anon', 'public.probe_defaults', 'insert') as anon_insert,
        has_table_privilege('authenticated', 'public.probe_defaults', 'delete') as auth_delete,
        has_function_privilege('anon', 'public.probe_defaults_fn()', 'execute') as anon_execute`)
    ).rows[0];
  } finally {
    await db.admin('rollback');
  }
  t.same(defaults, { anon_insert: true, auth_delete: true, anon_execute: true }, 'القالب مفتوح افتراضياً مثل الإنتاج');
  const measured = await db.admin(
    "select pg_get_userbyid(defaclrole) as owner, defaclobjtype as type from pg_default_acl where defaclnamespace = 'public'::regnamespace and defaclacl::text like '%anon=%' order by 1, 2",
  );
  t.ok(measured.rows.some((row) => row.owner === 'supabase_admin'), 'افتراض supabase_admin المقيس موجود بالقالب');

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

  // فرق مقصود عن الإنتاج: الحزمة بلغة C، والإنتاج ICU ‏en-US (مقيس 2026-10-25، datcollate en_US.UTF-8). فشفرة الخادم ما
  // تعتمد على اللغة: قوائم حروف صريحة بالهاتف (مسح BMP بـparity)، وCOLLATE "C" بكل ترتيب نصّي يطلع للشاشة.
  const locale = (await db.admin('select datcollate, datctype from pg_database where datname = current_database()')).rows[0];
  t.same(locale, { datcollate: 'C', datctype: 'C' }, 'الحزمة بلغة C (غير الإنتاج عمداً؛ الشفرة ما تعتمد على أيّهما)');

  // المنطقة الزمنية مثل الإنتاج (UTC، مقيس 2026-10-25)، مو منطقة الجهاز: على جهاز ببغداد كانت الحزمة تشتغل بتوقيت
  // بغداد، فدالّة تستعمل current_date تعبر هنا وتغلط بالإنتاج ثلاث ساعات كل ليلة.
  t.eq((await db.admin("select current_setting('TimeZone') as tz")).rows[0].tz, 'UTC', 'منطقة الحزمة الزمنية UTC مثل الإنتاج');
  // ولا دور بمنطقة زمنية خاصّة (الإنتاج مقيس 2026-10-25: ماكو)؛ لو انضافت لـauthenticator تنطبق على كل طلب.
  const zonedRoles = (await db.admin("select r.rolname from pg_db_role_setting s join pg_roles r on r.oid = s.setrole cross join unnest(s.setconfig) as c where lower(split_part(c, '=', 1)) = 'timezone'")).rows;
  t.same(zonedRoles, [], 'ولا دور بمنطقة زمنية خاصّة مثل الإنتاج');

  // حدود طريق الطلب مثل PostgREST: lock_timeout مال authenticator، وstatement_timeout مال الدور نفسه.
  const limits = (q) => q("select current_setting('statement_timeout') as statement, current_setting('lock_timeout') as lock");
  t.same((await db.asAnon(limits)).rows[0], { statement: '3s', lock: '8s' }, 'حدود anon بالطلب: 3s للاستعلام و8s للقفل');
  t.same((await db.asUser(USER, limits)).rows[0], { statement: '8s', lock: '8s' }, 'حدود authenticated بالطلب: 8s و8s');
  t.same((await db.asService(limits)).rows[0], { statement: '8s', lock: '8s' }, 'حدود service_role بالطلب: حدود authenticator');

  // auth.users مثل الإنتاج: postgres عليه كل الامتيازات والقراءة بحقّ المنح (ar*wdDxtm)، والتأكيد محسوب.
  const users = (await db.admin("select relacl::text as acl, (select attgenerated::text from pg_attribute where attrelid = 'auth.users'::regclass and attname = 'confirmed_at') as gen from pg_class where oid = 'auth.users'::regclass")).rows[0];
  t.ok(users.acl.includes('postgres=ar*wdDxtm/supabase_auth_admin') && users.gen === 's', `auth.users مثل الإنتاج (${users.acl})`);
}
