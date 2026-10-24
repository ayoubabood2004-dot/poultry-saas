// فحوص الكتالوج (FOUNDATION «الحرّاس والفحوص»: db-guard وgrants-check وwrite-lock-check، وكل قاعدة نصّية وراها فحص
// بالكتالوج ٨٣٧). تقرأ اللي انشأ فعلاً بعد الهجرات مرّتين، مو نصّ الهجرات. كل قاعدة تشتغل على قائمة غير فارغة
// («فحص على صفر قيم ليس نجاحاً»)، والاستثناءات بأسمائها هنا بسببها.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ALLOWLIST = JSON.parse(readFileSync(path.join(DIR, 'allowlist.json'), 'utf8'));

// استثناءات مسمّاة: rpc_refs ما تنقرا من الواجهة (بلا سياسة، FOUNDATION ٢٥٠)، والسجلّ ما يدقّق نفسه، وrpc_refs
// ما تنسجّل نتائجها بالسجلّ (بيها نتائج بكلف).
const NO_POLICY = new Set(['rpc_refs']);
const NO_AUDIT = new Set(['audit_log', 'rpc_refs']);
const SCHEMAS = ['public', 'private'];

export default async function (t, db) {
  const q = db.admin;
  const tables = (await q("select c.relname as name, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1")).rows;
  t.ok(tables.length >= 8, `جداول public انقرت (${tables.length})`);

  // RLS + سياسة + مشغّل تدقيق بكل جدول (db-guard ٨٤٤).
  const policies = (await q("select tablename, policyname, permissive, cmd, roles::text[] as roles, qual, with_check from pg_policies where schemaname = 'public'")).rows;
  const audited = new Set(
    (await q("select c.relname from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_proc p on p.oid = g.tgfoid join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'audit_row' and not g.tgisinternal")).rows.map((r) => r.relname),
  );
  t.same(tables.filter((tb) => !tb.rls).map((tb) => tb.name), [], 'RLS مفعّل بكل جدول');
  t.same(tables.filter((tb) => !NO_POLICY.has(tb.name) && !policies.some((p) => p.tablename === tb.name)).map((tb) => tb.name), [], 'سياسة بكل جدول (عدا المسمّاة)');
  t.same(tables.filter((tb) => !NO_AUDIT.has(tb.name) && !audited.has(tb.name)).map((tb) => tb.name), [], 'مشغّل تدقيق بكل جدول (عدا المسمّاة)');
  t.same(policies.filter((p) => p.cmd !== 'SELECT').map((p) => `${p.policyname} (${p.cmd})`), [], 'ماكو سياسة كتابة: كل السياسات SELECT');
  t.same(policies.filter((p) => p.roles.join() !== 'authenticated').map((p) => p.policyname), [], 'كل سياسة لـauthenticated بس');

  // auth_org() بالسياسة دائماً (select …) حتى تنحسب مرّة وحدة مو لكل صفّ (db-guard ٨٤٤).
  const exprs = policies.flatMap((p) => [p.qual, p.with_check].filter(Boolean));
  t.ok(exprs.some((e) => /auth_org\(\)/.test(e)), 'السياسات تنادي auth_org() (الفحص مو على صفر)');
  const bare = exprs.filter((e) => /auth_org\(\)/.test(e.replace(/\(\s*select\s+auth_org\(\)\s+as\s+auth_org\s*\)/gi, '')));
  t.same(bare, [], 'ماكو auth_org() عارية بسياسة');

  // كل مفتاح أجنبي بفهرس أعمدته الأولى نفس أعمدته وبنفس الترتيب (db-guard ٨٤٤).
  const fks = (await q(`
    select c.conname, c.conrelid::regclass::text as tbl, c.conkey::int[] as cols,
      exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indpred is null
          and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey
      ) as indexed
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f' and n.nspname = 'public'`)).rows;
  t.ok(fks.length >= 8, `مفاتيح أجنبية انقرت (${fks.length})`);
  t.same(fks.filter((fk) => !fk.indexed).map((fk) => `${fk.tbl}.${fk.conname}`), [], 'فهرس كامل لكل مفتاح أجنبي');

  // كل مفتاح أجنبي بين جدولين مستأجرين مركّب ويّا org_id (tenant-fk-check ٨٦٢).
  const tenantFks = (await q(`
    select c.conname, c.conrelid::regclass::text as tbl, c.confrelid::regclass::text as ref,
      (select array_agg(a.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(attnum, ord)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)::text[] as cols
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f' and n.nspname = 'public'
      and exists (select 1 from pg_attribute a where a.attrelid = c.confrelid and a.attname = 'org_id' and not a.attisdropped)`)).rows;
  t.ok(tenantFks.length >= 3, `مفاتيح بين جداول مستأجرة (${tenantFks.length})`);
  t.same(tenantFks.filter((fk) => fk.cols[0] !== 'org_id').map((fk) => `${fk.tbl}→${fk.ref}`), [], 'كل مفتاح بين مستأجرين يبدأ بـorg_id');

  // ماكو فهرس مكرّر (db-guard ٨٤٤): نفس الجدول ونفس الأعمدة ونفس الشرط.
  const dupes = (await q(`
    select indrelid::regclass::text as tbl, indkey::text as cols, count(*)::int as n
    from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public'
    group by indrelid, indkey, coalesce(pg_get_expr(indpred, indrelid), '') having count(*) > 1`)).rows;
  t.same(dupes, [], 'ماكو فهرس مكرّر');

  // ماكو numeric(p,s) (FOUNDATION ٨٠٨): المال والكمية numeric بلا دقّة + check.
  const typed = (await q("select table_name, column_name from information_schema.columns where table_schema = 'public' and data_type = 'numeric' and numeric_precision is not null")).rows;
  t.same(typed, [], 'ماكو numeric(p,s)');

  // الدوالّ: definer بمسار ثابت، وماكو معامل org_id، وتوقيع واحد لكل اسم (FOUNDATION ٥١٦، ٨١٠، ٨٥٩).
  const procs = (await q(`
    select n.nspname as schema, p.proname as name, oidvectortypes(p.proargtypes) as args, p.prosecdef as definer,
      p.proconfig as config, coalesce(p.proargnames, '{}') as argnames, p.prokind as kind,
      has_function_privilege('anon', p.oid, 'execute') as anon,
      has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
      has_function_privilege('service_role', p.oid, 'execute') as service
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = any ($1)`, [SCHEMAS])).rows;
  const sig = (p) => `${p.schema}.${p.name}(${p.args})`;
  t.ok(procs.filter((p) => p.definer).length >= 10, `دوالّ definer انقرت (${procs.filter((p) => p.definer).length})`);
  t.same(procs.filter((p) => p.definer && !(p.config ?? []).some((c) => c.startsWith('search_path='))).map(sig), [], 'كل definer بمسار ثابت');
  t.same(procs.filter((p) => p.argnames.some((a) => /(^|_)org(_id)?$/.test(a))).map(sig), [], 'ماكو دالّة تاخذ المنشأة معاملاً');
  const names = {};
  for (const p of procs) names[`${p.schema}.${p.name}`] = (names[`${p.schema}.${p.name}`] ?? 0) + 1;
  t.same(Object.entries(names).filter(([, n]) => n > 1).map(([name]) => name), [], 'توقيع واحد لكل اسم دالّة');

  // قائمة السماح بالضبط (grants-check ٨٥٩): لا ناقص ولا زايد، وanon ولا شي.
  const executable = (role) => procs.filter((p) => p[role]).map(sig).sort();
  t.same(executable('anon'), [...ALLOWLIST.anon].sort(), 'anon ينفّذ قائمته بالضبط (فارغة)');
  t.same(executable('authenticated'), [...ALLOWLIST.authenticated].sort(), 'authenticated ينفّذ قائمة السماح بالضبط');
  for (const fn of ALLOWLIST.service_role_only) {
    const p = procs.find((x) => sig(x) === fn);
    t.ok(p && p.service && !p.authenticated && !p.anon, `${fn} لـservice_role بس`);
  }
  t.same(
    procs.filter((p) => p.schema === 'private' && (p.anon || p.authenticated)).map(sig),
    [],
    'مساعدات private مو مكشوفة',
  );
  const privateUsage = (await q("select has_schema_privilege('authenticated', 'private', 'usage') as auth, has_schema_privilege('anon', 'private', 'usage') as anon")).rows[0];
  t.same(privateUsage, { auth: false, anon: false }, 'المخطّط private بلا usage للواجهة');

  // الكتابة من الدوالّ بس (write-lock-check ٨٦٠): كل امتياز بكل جدول لكل دور، مو عيّنة. authenticated يقرأ بس (rpc_refs
  // ولا هذا)، anon ولا شي، وservice_role يبقى إداري بلا TRUNCATE، وبلا تعديل أو حذف بالسجلّ.
  const PRIVILEGES = ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'];
  const granted = (await q(`
    select c.relname as name, r.role, p.privilege
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join unnest(array['anon', 'authenticated', 'service_role']) as r(role)
    cross join unnest($1::text[]) as p(privilege)
    where n.nspname = 'public' and c.relkind = 'r' and has_table_privilege(r.role, c.oid, p.privilege)`, [PRIVILEGES])).rows;
  const has = (role, filter) => granted.filter((g) => g.role === role && filter(g)).map((g) => `${g.name}.${g.privilege}`).sort();
  t.same(has('anon', () => true), [], 'anon بلا أي امتياز بأي جدول');
  t.same(has('authenticated', (g) => g.privilege !== 'select'), [], 'authenticated ما يكتب ولا يمسح ولا يربط مباشرةً بأي جدول');
  t.same(has('authenticated', (g) => g.privilege === 'select'), tables.map((tb) => `${tb.name}.select`).filter((x) => x !== 'rpc_refs.select').sort(), 'authenticated يقرأ كل جدول بسياسته، عدا rpc_refs');
  t.same(has('service_role', (g) => g.privilege === 'truncate'), [], 'service_role بلا TRUNCATE بأي جدول');
  t.same(has('service_role', (g) => g.name === 'audit_log' && ['update', 'delete'].includes(g.privilege)), [], 'service_role ما يعدّل السجلّ ولا يحذف منه');
  t.ok(has('service_role', (g) => g.privilege === 'select').length === tables.length, 'ضابط: service_role يقرأ كل جدول (الفحص يشوف امتيازاته)');

  // مشغّلات التدقيق: بعد كل إدخال وتعديل وحذف لكل صفّ (tgtype: ROW 1، BEFORE 2، INSERT 4، DELETE 8، UPDATE 16،
  // TRUNCATE 32). السجلّ نفسه: قبل التعديل والحذف لكل صفّ، وقبل TRUNCATE للأمر كله.
  const triggers = (await q(`
    select c.relname as tbl, g.tgname as name, p.proname as fn, g.tgtype::int as type, g.tgenabled as enabled
    from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = g.tgfoid
    where n.nspname = 'public' and not g.tgisinternal`)).rows;
  t.same(triggers.filter((g) => g.enabled !== 'O').map((g) => g.name), [], 'كل المشغّلات مفعّلة');
  t.same(triggers.filter((g) => g.fn === 'audit_row' && g.type !== 1 + 4 + 8 + 16).map((g) => `${g.name}=${g.type}`), [], 'التدقيق بعد الإدخال والتعديل والحذف لكل صفّ');
  t.same(
    triggers.filter((g) => g.tbl === 'audit_log' && g.fn === 'reject_change').map((g) => g.type).sort((a, b) => a - b),
    [1 + 2 + 8 + 16, 2 + 32],
    'السجلّ يرفض التعديل والحذف لكل صفّ وTRUNCATE للأمر',
  );

  // الأعمدة المشتركة (FOUNDATION ٢٤٠): كل جدول مستأجر بـid وorg_id بافتراض auth_org() وcreated_at وcreated_by وunique (org_id, id).
  // استثناءات مسمّاة: orgs بلا org_id (هي المنشأة)، وaudit_log (المنشأة من الصفّ المدقَّق، وactor/at، وما يصير هدف مفتاح).
  const columns = (await q(`
    select c.relname as tbl, a.attname as col, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as notnull,
      pg_get_expr(d.adbin, d.adrelid) as def
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped`)).rows;
  const col = (tbl, name) => columns.find((x) => x.tbl === tbl && x.col === name);
  const COMMON = {
    id: (x) => x.type === 'uuid' && x.notnull && x.def === 'gen_random_uuid()',
    org_id: (x) => x.type === 'uuid' && x.notnull && x.def === 'auth_org()',
    created_at: (x) => x.type === 'timestamp with time zone' && x.notnull && x.def === 'now()',
    created_by: (x) => x.type === 'uuid' && x.def === 'auth.uid()',
  };
  const uniques = (await q("select conrelid::regclass::text as tbl, pg_get_constraintdef(oid) as def from pg_constraint where contype = 'u' and connamespace = 'public'::regnamespace")).rows;
  const commonTables = tables.map((tb) => tb.name).filter((name) => !['orgs', 'audit_log'].includes(name));
  t.ok(commonTables.length >= 6, `جداول بالأعمدة المشتركة (${commonTables.length})`);
  const missing = [];
  for (const tbl of commonTables) {
    for (const [name, okay] of Object.entries(COMMON)) if (!col(tbl, name) || !okay(col(tbl, name))) missing.push(`${tbl}.${name}`);
    if (!uniques.some((u) => u.tbl === tbl && u.def === 'UNIQUE (org_id, id)')) missing.push(`${tbl}: unique (org_id, id)`);
  }
  for (const name of ['id', 'created_at', 'created_by']) if (!COMMON[name](col('orgs', name))) missing.push(`orgs.${name}`);
  t.same(missing, [], 'الأعمدة المشتركة بكل جدول مستأجر (عدا المسمّاة)');
  const scopeIndex = (await q("select pg_get_indexdef(indexrelid) as def from pg_index where indexrelid = 'public.member_scopes_member_division'::regclass")).rows[0]?.def ?? '';
  t.ok(/UNIQUE INDEX .* \(org_id, member_id, division_id\) WHERE \(division_id IS NOT NULL\)/.test(scopeIndex), `نطاق (عضو، وحدة) فريد إذا الوحدة موجودة (${scopeIndex})`);

  // ماكو مفتاح يمسح أو يفرّغ بالتسلسل (لا حذف لسطر)، والعضو ما ينحذف حسابه من Auth (restrict صريح).
  const deletes = (await q(`
    select c.conrelid::regclass::text as tbl, c.conname, c.confrelid::regclass::text as ref, c.confdeltype as on_delete
    from pg_constraint c where c.contype = 'f' and c.connamespace = 'public'::regnamespace`)).rows;
  t.same(deletes.filter((fk) => !['a', 'r'].includes(fk.on_delete)).map((fk) => `${fk.tbl}.${fk.conname}`), [], 'ماكو on delete cascade أو set null');
  t.same(deletes.filter((fk) => fk.ref === 'auth.users').map((fk) => [fk.tbl, fk.on_delete]), [['members', 'r']], 'members→auth.users بـon delete restrict');

  // الافتراضي للجاي: جدول ودالّة جديدة من postgres تنشأ مسدودة، مو مفتوحة مثل قالب Supabase.
  const future = await db.asOwner(async (oq) => {
    await oq('create table public.probe_future (id int)');
    await oq('create function public.probe_future_fn() returns int language sql as $$ select 1 $$');
    return (await oq(`select
      has_table_privilege('anon', 'public.probe_future', 'select') as anon_select,
      has_table_privilege('authenticated', 'public.probe_future', 'insert') as auth_insert,
      has_function_privilege('authenticated', 'public.probe_future_fn()', 'execute') as auth_execute,
      has_function_privilege('anon', 'public.probe_future_fn()', 'execute') as anon_execute`)).rows[0];
  });
  t.same(future, { anon_select: false, auth_insert: false, auth_execute: false, anon_execute: false }, 'الجديد ينشأ مسدوداً (الافتراضي انسحب)');

  // ماكو view بـpublic: الـview يتجاوز RLS إلا ويّا security_invoker (FOUNDATION ما يذكرها؛ القاعدة مانعة).
  const views = (await q("select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('v', 'm') and not coalesce(c.reloptions @> array['security_invoker=true'], false)")).rows;
  t.same(views, [], 'ماكو view يتجاوز RLS');
}
