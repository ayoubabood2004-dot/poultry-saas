// فحوص الكتالوج (FOUNDATION «الحرّاس والفحوص»: db-guard وgrants-check وwrite-lock-check، وكل قاعدة نصّية وراها فحص
// بالكتالوج ٨٣٧). تقرأ اللي انشأ فعلاً بعد الهجرات مرّتين، مو نصّ الهجرات. كل قاعدة تشتغل على قائمة غير فارغة
// («فحص على صفر قيم ليس نجاحاً»)، والاستثناءات بأسمائها هنا بسببها.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ALLOWLIST = JSON.parse(readFileSync(path.join(DIR, 'allowlist.json'), 'utf8'));
// تصنيف الجداول (الخطّة §2.10): الكتالوج ينقارن بيه بالضبط، والحرّاس يشتقّون منه.
const CLASSES = JSON.parse(readFileSync(path.join(DIR, 'classes.json'), 'utf8'));

// استثناءات مسمّاة: rpc_refs ما تنقرا من الواجهة (بلا سياسة، FOUNDATION ٢٥٠)، والسجلّ ما يدقّق نفسه، وrpc_refs
// ما تنسجّل نتائجها بالسجلّ (بيها نتائج بكلف). والجداول العامّة (global، بلا org_id مثل units) برّا التدقيق والأعمدة
// المشتركة: مشغّل التدقيق ياخذ المنشأة من الصفّ، وهي ثابتة بمشغّلات reject_change (E37).
const NO_POLICY = new Set(['rpc_refs']);
const NO_AUDIT = new Set(['audit_log', 'rpc_refs', ...CLASSES.global]);
const SCHEMAS = ['public', 'private'];
const sorted = (list) => [...list].sort();
const PRIVILEGES = ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'];

const COLUMN_PRIVILEGES = ['select', 'insert', 'update', 'references'];

/**
 * امتيازات أدوار بكل جدول public: على الجدول كلّه (whole) أو على أعمدة (cols). منح العمود (grant update (name) …) ما يبين
 * بـhas_table_privilege (يقرا صلاحية الجدول بس)، فالمسح ويّا has_any_column_privilege وhas_column_privilege (المراجعة العدائية).
 */
export async function grantedPrivileges(q, roles) {
  return (await q(`
    select c.relname as name, r.role, p.privilege,
      has_table_privilege(r.role, c.oid, p.privilege) as whole,
      case when p.privilege = any ($2::text[]) then array(
        select a.attname::text from pg_attribute a
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and has_column_privilege(r.role, c.oid, a.attnum, p.privilege)
        order by 1) else '{}'::text[] end as cols
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join unnest($3::text[]) as r(role)
    cross join unnest($1::text[]) as p(privilege)
    where n.nspname = 'public' and c.relkind = 'r'
      and (has_table_privilege(r.role, c.oid, p.privilege)
        or case when p.privilege = any ($2::text[]) then has_any_column_privilege(r.role, c.oid, p.privilege) else false end)
    order by 1, 2, 3`, [PRIVILEGES, COLUMN_PRIVILEGES, roles])).rows;
}

const ORG_PREDICATE = /\borg_id = \( ?select auth_org\(\) as auth_org\)|\( ?select auth_org\(\) as auth_org\) = org_id\b/u;

/**
 * تعبير السياسة كما يطبعه بوستغريس، بحروف صغيرة وبلا اقتباس ولا اسم الجدول قبل أعمدته وبفراغ واحد. اسم الجدول بعد «'» جزء من
 * نصّ مو بادئة عمود: فعل expense_categories.manage بجدول expense_categories كان ينقلب can('manage') (0005).
 */
function normalisePolicy(expression, table) {
  return String(expression ?? '')
    .toLowerCase()
    .replaceAll('"', '')
    .replace(new RegExp(`(?<!')\\b(?:public\\.)?${table}\\.`, 'gu'), '')
    .replace(/\s+/gu, ' ');
}

/**
 * شروط سياسة الكتابة (§2.5، الخطّة WP2 «Policies»): بكل بند يحكم الأمر (WITH CHECK للإدخال، وUSING وWITH CHECK للتعديل)
 * org_id = (select auth_org()) وcan('<الفعل>')، وstatus = 'draft' لرأس المسوّدة، ودالّة النطاق على عمود الصفّ إذا الملف
 * يسمّيها؛ وبلا OR (الشروط كلها سوا). بلا المنشأة بـWITH CHECK ينقل صفّاً لمنشأة ثانية، وبلا USING يعدّل صفوف كل المنشآت.
 */
function policyPredicateProblems(policy, entry) {
  const problems = [];
  const clauses =
    policy.cmd === 'INSERT'
      ? [['WITH CHECK', policy.with_check]]
      : [['USING', policy.qual], ['WITH CHECK', policy.with_check ?? policy.qual]]; // بلا WITH CHECK ينطبق USING نفسه
  for (const [label, raw] of clauses) {
    const expression = normalisePolicy(raw, policy.tablename);
    const missing = [];
    if (!ORG_PREDICATE.test(expression)) missing.push('org_id = (select auth_org())');
    if (!expression.includes(`can('${entry.action}'`)) missing.push(`(select can('${entry.action}'))`);
    if (entry.draft && !/\bstatus = 'draft'/u.test(expression)) missing.push("status = 'draft'");
    // النطاق: دالّة واحدة للأمرين، أو لكل أمر دالّته ({ insert, update }: المواقع والمخازن، 0005).
    const scope = typeof entry.scope === 'string' ? entry.scope : entry.scope?.[policy.cmd.toLowerCase()];
    if (scope && !expression.includes(scope.toLowerCase())) missing.push(scope);
    if (/\bor\b/u.test(expression.replace(/'(?:[^']|'')*'/gu, "''"))) problems.push(`سياسة ${policy.policyname} (${policy.cmd}): ${label} بيها OR — شروط الكتابة كلها تنطبق سوا`);
    else if (missing.length) problems.push(`سياسة ${policy.policyname} (${policy.cmd}): ${label} بلا ${missing.join(' و')}`);
  }
  return problems;
}

/**
 * الكتابة المباشرة بالضبط حسب classes.json (E52، FOUNDATION ٤٣٨): سياسة الكتابة بجداول directWrite بس وبأفعالها وشروطها،
 * وامتياز INSERT/UPDATE لـauthenticated = الملف (على الجدول كلّه، أو على أعمدة columns.<فعل> بالضبط إذا الملف يسمّيها)،
 * وDELETE وTRUNCATE وREFERENCES وTRIGGER ولا جدول ولا عمود. q يقرأ الكتالوج كما هو بمعاملته (فالضابط يضيف سياسة أو منحاً
 * بمعاملة ترجع ويشوف الفحص يفشل)، وclasses للضوابط بس.
 */
export async function writeProblems(q, classes = CLASSES) {
  const problems = [];
  const policies = (await q("select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname = 'public'")).rows;
  for (const p of policies.filter((x) => x.cmd !== 'SELECT')) {
    const entry = classes.directWrite[p.tablename];
    if (!entry) problems.push(`سياسة كتابة ${p.policyname} (${p.cmd}) بجدول مو directWrite: ${p.tablename}`);
    else if (!entry.privileges.includes(p.cmd.toLowerCase())) problems.push(`سياسة ${p.policyname} (${p.cmd}) مو من امتيازات ${p.tablename}: ${entry.privileges.join()}`);
    else problems.push(...policyPredicateProblems(p, entry));
  }
  const granted = await grantedPrivileges(q, ['authenticated']);
  for (const g of granted) {
    const name = g.privilege.toUpperCase();
    const on = g.whole ? '' : ` على الأعمدة ${g.cols.join('، ')}`;
    if (['delete', 'truncate', 'references', 'trigger'].includes(g.privilege)) problems.push(`authenticated عنده ${name}${on} على ${g.name} (E52)`);
    if (!['insert', 'update'].includes(g.privilege)) continue;
    const entry = classes.directWrite[g.name];
    if (!(entry?.privileges ?? []).includes(g.privilege)) {
      problems.push(`authenticated عنده ${name}${on} على ${g.name} وهو مو بامتيازاته بـclasses.json`);
      continue;
    }
    const columns = entry.columns?.[g.privilege];
    if (columns && (g.whole || sorted(g.cols).join() !== sorted(columns).join())) {
      problems.push(`${g.name}: ${name} لازم على الأعمدة ${columns.join('، ')} بس، والممنوح ${g.whole ? 'الجدول كلّه' : g.cols.join('، ')}`);
    } else if (!columns && !g.whole) {
      problems.push(`${g.name}: ${name} على الأعمدة ${g.cols.join('، ')} وclasses.json ما يسمّيها (columns.${g.privilege})`);
    }
  }
  const tables = new Set((await q("select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'")).rows.map((r) => r.relname));
  for (const [table, entry] of Object.entries(classes.directWrite)) {
    for (const privilege of entry.privileges) {
      if (!granted.some((g) => g.name === table && g.privilege === privilege)) problems.push(`${table}: ${privilege.toUpperCase()} بـclasses.json وما ممنوح`);
      if (!policies.some((p) => p.tablename === table && p.cmd === privilege.toUpperCase())) problems.push(`${table}: ${privilege.toUpperCase()} بلا سياسة كتابة`);
    }
    if (!tables.has(table)) problems.push(`${table}: directWrite وماكو جدول بهالاسم`);
  }
  return problems;
}

/**
 * كل عمود numeric بـpublic بقيد check فيه abs(x) < 'Infinity' وx = round(x, n) (§2.7). NaN و±Infinity أعداد numeric صالحة
 * ببوستغريس (والنصّ العشري من الشبكة ينقرا numeric، E3)، وNaN أكبر من كل عدد ويساوي نفسه: يعبر «x > 0 and x = round(x, n)»
 * ويقلب أي رصيد يجمعه NaN.
 */
export async function numericProblems(q) {
  const columns = (await q(`
    select c.relname as tbl, a.attname as col from pg_attribute a join pg_class c on c.oid = a.attrelid
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped and a.atttypid = 'numeric'::regtype
    order by 1, 2`)).rows;
  const checks = (await q("select c.relname as tbl, pg_get_constraintdef(k.oid) as def from pg_constraint k join pg_class c on c.oid = k.conrelid where k.contype = 'c' and k.connamespace = 'public'::regnamespace")).rows;
  const problems = [];
  for (const { tbl, col } of columns) {
    const defs = checks.filter((k) => k.tbl === tbl).map((k) => k.def);
    if (!defs.some((def) => new RegExp(`abs\\(${col}\\) < 'Infinity'(?:::numeric)?`).test(def))) problems.push(`${tbl}.${col}: بلا check (abs(${col}) < 'Infinity')`);
    if (!defs.some((def) => new RegExp(`\\b${col} = round\\(${col}, \\d+\\)`).test(def))) problems.push(`${tbl}.${col}: بلا check (${col} = round(${col}, n))`);
  }
  return { columns: columns.length, problems };
}

/** الجداول بسياسة قراءة مقيِّدة (RESTRICTIVE، SELECT) تنادي fn() (الخطّة §2.8): الوسم بـclasses.json لازم يساويها. */
export function restrictedTables(policies, fn) {
  const call = new RegExp(`\\b${fn}\\(\\)`);
  return sorted(new Set(policies.filter((p) => p.permissive === 'RESTRICTIVE' && p.cmd === 'SELECT' && call.test(p.qual ?? '')).map((p) => p.tablename)));
}

/** سياسة تقرأ جدولها (FROM أو JOIN على نفس الجدول بتعبيرها) ترجع 42P17 على كل طلب (FOUNDATION ٨٠٠). */
export function selfReferencing(policies) {
  return policies
    .filter((p) => {
      const table = p.tablename.replace(/[.*+?^${}()|[\]\\]/g, '');
      const pattern = new RegExp(`\\b(?:from|join)\\s+(?:"?public"?\\.)?"?${table}"?(?![a-z0-9_])`, 'i');
      return [p.qual, p.with_check].some((expr) => expr && pattern.test(expr));
    })
    .map((p) => `${p.tablename}.${p.policyname}`);
}

export default async function (t, db) {
  const q = db.admin;
  const tables = (await q("select c.relname as name, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1")).rows;
  t.ok(tables.length >= 8, `جداول public انقرت (${tables.length})`);
  const tableNames = tables.map((tb) => tb.name);

  // ── classes.json بالضبط: كل جدول بصنف كتابة واحد، والوسوم من جداول موجودة، والمحجوز مو موجود ───────────────────
  const writeClasses = [...CLASSES.functionOnly, ...Object.keys(CLASSES.directWrite)];
  t.same(sorted(writeClasses), sorted(tableNames), `classes.json: كل جدول public بصنف كتابة (functionOnly أو directWrite)، ولا زايد (${tableNames.length})`);
  t.same(writeClasses.filter((name, i) => writeClasses.indexOf(name) !== i), [], 'classes.json: ماكو جدول بصنفين');
  for (const tag of ['appendOnly', 'costRestricted', 'accountsRestricted', 'salesRestricted', 'global']) {
    t.same(CLASSES[tag].filter((name) => !tableNames.includes(name)), [], `classes.json: كل ${tag} جدول موجود`);
  }
  t.same(CLASSES.appendOnly.filter((name) => !CLASSES.functionOnly.includes(name)), [], 'classes.json: الدفتر الثابت (appendOnly) ما يكتبه إلا دالّة');
  const reserved = [...CLASSES.reserved.functionOnly, ...CLASSES.reserved.money];
  t.same(reserved.filter((name) => tableNames.includes(name)), [], 'classes.json: جدول انخلق لازم ينتقل من reserved لصنفه');

  // RLS + سياسة + مشغّل تدقيق بكل جدول (db-guard ٨٤٤).
  const policies = (await q("select tablename, policyname, permissive, cmd, roles::text[] as roles, qual, with_check from pg_policies where schemaname = 'public'")).rows;
  const audited = new Set(
    (await q("select c.relname from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_proc p on p.oid = g.tgfoid join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'audit_row' and not g.tgisinternal")).rows.map((r) => r.relname),
  );
  t.same(tables.filter((tb) => !tb.rls).map((tb) => tb.name), [], 'RLS مفعّل بكل جدول');
  t.same(tables.filter((tb) => !NO_POLICY.has(tb.name) && !policies.some((p) => p.tablename === tb.name)).map((tb) => tb.name), [], 'سياسة بكل جدول (عدا المسمّاة)');
  t.same(tables.filter((tb) => !NO_AUDIT.has(tb.name) && !audited.has(tb.name)).map((tb) => tb.name), [], 'مشغّل تدقيق بكل جدول (عدا المسمّاة والعامّة)');
  t.same(policies.filter((p) => p.roles.join() !== 'authenticated').map((p) => p.policyname), [], 'كل سياسة لـauthenticated بس');

  // سياسات الكتابة والامتيازات بالضبط حسب directWrite، ويّا ضابطين: سياسة كتابة ومنح INSERT بجدول functionOnly يفشّلونه.
  t.same(await writeProblems(q), [], `الكتابة المباشرة = directWrite بالضبط (${Object.keys(CLASSES.directWrite).length} جدول)، وبلا DELETE/TRUNCATE/REFERENCES/TRIGGER`);
  const policyProbe = await db.asOwner(async (oq) => {
    await oq('create policy probe_write on public.orgs for update to authenticated using (true)');
    return writeProblems(oq);
  });
  t.eq(policyProbe.length, 1, `ضابط: سياسة كتابة بجدول functionOnly تفشّل الفحص (${policyProbe.join(' | ')})`);
  const grantProbe = await db.asOwner(async (oq) => {
    await oq('grant insert on public.divisions to authenticated');
    return writeProblems(oq);
  });
  t.eq(grantProbe.length, 1, `ضابط: منح INSERT بجدول functionOnly يفشّل الفحص (${grantProbe.join(' | ')})`);

  // المراجعة العدائية: منح على أعمدة (has_table_privilege ما يشوفه)، كل ضابط مخالفة وحدة بالضبط.
  const probeWrites = async (statements, classes = CLASSES) =>
    db.asOwner(async (oq) => {
      for (const statement of statements) await oq(statement);
      return writeProblems(oq, classes);
    });
  for (const [label, statement] of [
    ['UPDATE على عمود', 'grant update (name) on public.divisions to authenticated'],
    ['REFERENCES على عمود', 'grant references (id) on public.orgs to authenticated'],
    ['INSERT على أعمدة', 'grant insert (id, org_id, name) on public.divisions to authenticated'],
    // طفرات الاختبار: كل امتياز ممنوع (E52) على الجدول كلّه لحاله.
    ['DELETE على الجدول', 'grant delete on public.divisions to authenticated'],
    ['TRUNCATE على الجدول', 'grant truncate on public.divisions to authenticated'],
    ['TRIGGER على الجدول', 'grant trigger on public.divisions to authenticated'],
    ['REFERENCES على الجدول', 'grant references on public.orgs to authenticated'],
  ]) {
    const found = await probeWrites([statement]);
    t.eq(found.length, 1, `ضابط: ${label} بجدول functionOnly يفشّل الفحص (${found.join(' | ')})`);
  }

  // سياسة الكتابة نفسها (§2.5): المنشأة وcan() بكل بند يحكم الأمر (USING للتعديل، وWITH CHECK للإدخال والتعديل)، بلا OR؛
  // والمسوّدة والنطاق إذا الملف يسمّيهم. directWrite مصنوع لـdivisions بالضابط بس.
  const GOOD = "org_id = (select auth_org()) and (select can('stores.manage'))";
  // directWrite المصنوع يضاف للحقيقي (من 0005 بيه جداول البيانات الأساسية)، مو يحلّ محلّه.
  const asDirect = (entry) => ({ ...CLASSES, directWrite: { ...CLASSES.directWrite, divisions: { privileges: ['update'], action: 'stores.manage', ...entry } } });
  const updatePolicy = (using, check) => `create policy probe_update on public.divisions for update to authenticated using (${using})${check === null ? '' : ` with check (${check})`}`;
  for (const [label, statements, entry, expected] of [
    ['سليمة', ['grant update on public.divisions to authenticated', updatePolicy(GOOD, GOOD)], {}, 0],
    ['سليمة بلا WITH CHECK (USING ينطبق عليه)', ['grant update on public.divisions to authenticated', updatePolicy(GOOD, null)], {}, 0],
    ['with check (true)', ['grant update on public.divisions to authenticated', updatePolicy(GOOD, 'true')], {}, 1],
    ['WITH CHECK بلا المنشأة (ينقل صفّاً لمنشأة ثانية)', ['grant update on public.divisions to authenticated', updatePolicy(GOOD, "(select can('stores.manage'))")], {}, 1],
    ['USING بلا المنشأة (يعدّل صفوف كل المنشآت)', ['grant update on public.divisions to authenticated', updatePolicy("(select can('stores.manage'))", GOOD)], {}, 1],
    ['can() بـUSING بس', ['grant update on public.divisions to authenticated', updatePolicy(GOOD, 'org_id = (select auth_org())')], {}, 1],
    ['OR يفتح الشرط', ['grant update on public.divisions to authenticated', updatePolicy(GOOD, `(${GOOD}) or true`)], {}, 1],
    ['إدخال with check (true)', ['grant insert on public.divisions to authenticated', 'create policy probe_insert on public.divisions for insert to authenticated with check (true)'], { privileges: ['insert'] }, 1],
    ['أعمدة مسمّاة وممنوحة بالضبط', ['grant update (name) on public.divisions to authenticated', updatePolicy(GOOD, GOOD)], { columns: { update: ['name'] } }, 0],
    ['أعمدة مسمّاة والمنح للجدول كلّه', ['grant update on public.divisions to authenticated', updatePolicy(GOOD, GOOD)], { columns: { update: ['name'] } }, 1],
    // طفرات الاختبار: أعمدة ممنوحة غير المسمّاة، ومنح أعمدة وclasses.json ما يسمّيها، وسياسة بلا منح، ومنح بلا سياسة.
    ['أعمدة ممنوحة غير المسمّاة', ['grant update (archived_at) on public.divisions to authenticated', updatePolicy(GOOD, GOOD)], { columns: { update: ['name'] } }, 1],
    ['منح أعمدة وclasses.json ما يسمّيها', ['grant update (name) on public.divisions to authenticated', updatePolicy(GOOD, GOOD)], {}, 1],
    ['سياسة بلا منح', [updatePolicy(GOOD, GOOD)], {}, 1],
    ['منح بلا سياسة', ['grant update on public.divisions to authenticated'], {}, 1],
  ]) {
    const found = await probeWrites(statements, asDirect(entry));
    t.eq(found.length, expected, `ضابط سياسة الكتابة: ${label} ← ${expected} (${found.join(' | ')})`);
  }
  // جدول directWrite مو موجود: ما ممنوح، وبلا سياسة، وماكو جدول بهالاسم (ثلاث مخالفات، كل وحدة باسمها).
  const ghost = await probeWrites([], { ...CLASSES, directWrite: { ...CLASSES.directWrite, probe_ghost: { privileges: ['insert'], action: 'stores.manage' } } });
  t.eq(ghost.length, 3, `ضابط: directWrite لجدول مو موجود (${ghost.join(' | ')})`);
  // رأس مسوّدة (draft) بعمود مخزن (scope): status = 'draft' ودالّة النطاق على عمود الصفّ نفسه، كل نقص مرّة وحدة.
  const draftTable = [
    "create table public.probe_docs (id uuid primary key default gen_random_uuid(), org_id uuid not null default public.auth_org(), status text not null default 'draft', warehouse_id uuid)",
    'alter table public.probe_docs enable row level security',
    'grant insert on public.probe_docs to authenticated',
  ];
  const draftEntry = { ...CLASSES, directWrite: { ...CLASSES.directWrite, probe_docs: { privileges: ['insert'], action: 'transfer.post', draft: true, scope: 'in_scope_wh(warehouse_id)' } } };
  const draftPolicy = (parts) => `create policy probe_docs_insert on public.probe_docs for insert to authenticated with check (${parts.join(' and ')})`;
  const all = ['org_id = (select auth_org())', "status = 'draft'", '(select public.in_scope_wh(warehouse_id))', "(select can('transfer.post'))"];
  for (const [label, parts, expected] of [
    ['رأس سليم', all, 0],
    ["بلا status = 'draft'", all.filter((p) => !p.startsWith('status')), 1],
    ['بلا دالّة النطاق', all.filter((p) => !p.includes('in_scope_wh')), 1],
  ]) {
    const found = await probeWrites([...draftTable, draftPolicy(parts)], draftEntry);
    t.eq(found.length, expected, `ضابط رأس المسوّدة: ${label} ← ${expected} (${found.join(' | ')})`);
  }

  // 0005: اسم الجدول داخل نصّ الفعل (expense_categories.manage) يبقى، وبادئة العمود (expense_categories.org_id) تنشال.
  const literalAction = "((expense_categories.org_id = ( SELECT auth_org() AS auth_org)) AND ( SELECT can('expense_categories.manage'::text, false) AS can))";
  t.same(policyPredicateProblems({ tablename: 'expense_categories', policyname: 'p', cmd: 'INSERT', with_check: literalAction }, { action: 'expense_categories.manage' }), [], 'ضابط: اسم الجدول بنصّ الفعل يبقى وبادئة العمود تنشال');
  t.eq(policyPredicateProblems({ tablename: 'expense_categories', policyname: 'p', cmd: 'INSERT', with_check: literalAction.replace("'expense_categories.manage'", "'stores.manage'") }, { action: 'expense_categories.manage' }).length, 1, 'ضابط: فعل ثاني بنفس الشكل ينمسك');
  // النطاق لكل أمر (المواقع: الإدخال بوحدة الصفّ، والتعديل بالموقع نفسه): دالّة الإدخال بسياسة التعديل ما تكفي، بكل بند.
  const siteScope = { action: 'stores.manage', scope: { insert: 'in_scope_division(division_id)', update: 'in_scope_site(id)' } };
  const siteInsert = "((sites.org_id = ( SELECT auth_org() AS auth_org)) AND ( SELECT can('stores.manage'::text, false) AS can) AND ( SELECT in_scope_division(sites.division_id) AS in_scope_division))";
  t.same(policyPredicateProblems({ tablename: 'sites', policyname: 'p', cmd: 'INSERT', with_check: siteInsert }, siteScope), [], 'ضابط: سياسة إدخال بدالّة نطاق الإدخال تعبر');
  t.eq(policyPredicateProblems({ tablename: 'sites', policyname: 'p', cmd: 'UPDATE', qual: siteInsert, with_check: siteInsert }, siteScope).length, 2, 'ضابط: سياسة تعديل بدالّة الإدخال تنمسك بـUSING وWITH CHECK');

  // ماكو سياسة تقرأ جدولها (FOUNDATION ٨٠٠)، ويّا ضابط بسياسة تقرأ جدولها.
  t.same(selfReferencing(policies), [], `ماكو سياسة تقرأ جدولها (${policies.length} سياسة)`);
  const selfProbe = await db.asOwner(async (oq) => {
    await oq('create policy probe_self on public.orgs for select to authenticated using (exists (select 1 from public.orgs o where o.id = orgs.id))');
    return selfReferencing((await oq("select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public'")).rows);
  });
  t.same(selfProbe, ['orgs.probe_self'], 'ضابط: سياسة تقرأ جدولها تنمسك');

  // السياسات المقيِّدة بالضبط حسب الوسوم: الكلفة والحسابات والمبيعات (الخطّة §2.8).
  for (const [tag, fn] of [['costRestricted', 'can_see_cost'], ['accountsRestricted', 'can_see_accounts'], ['salesRestricted', 'can_see_sales']]) {
    t.same(restrictedTables(policies, fn), sorted(CLASSES[tag]), `${tag} = الجداول بسياسة ${fn}() المقيِّدة`);
  }
  // ضابط (طفرة الاختبار): سياسة متساهلة أو لأمر غير القراءة بنفس الدالّة ما تنحسب تقييداً، والمقيِّدة للقراءة تنحسب.
  t.same(
    restrictedTables(
      [
        { tablename: 'a', permissive: 'PERMISSIVE', cmd: 'SELECT', qual: '( SELECT can_see_cost() AS can_see_cost)' },
        { tablename: 'b', permissive: 'RESTRICTIVE', cmd: 'UPDATE', qual: '( SELECT can_see_cost() AS can_see_cost)' },
        { tablename: 'c', permissive: 'RESTRICTIVE', cmd: 'SELECT', qual: '( SELECT can_see_cost() AS can_see_cost)' },
        { tablename: 'd', permissive: 'RESTRICTIVE', cmd: 'SELECT', qual: '( SELECT can_see_sales() AS can_see_sales)' },
      ],
      'can_see_cost',
    ),
    ['c'],
    'ضابط: التقييد = سياسة RESTRICTIVE للقراءة بالدالّة نفسها بس',
  );
  // السجلّ يحمل قيود الجهات والصناديق تحت سياسة الكلفة: آمن بس ما دام الدالّتان نفس الأدوار (الخطّة §2.8).
  const sameBody = "select (select prosrc from pg_proc where oid = 'public.can_see_cost()'::regprocedure) = (select prosrc from pg_proc where oid = 'public.can_see_accounts()'::regprocedure) as same";
  t.eq((await q(sameBody)).rows[0].same, true, 'can_see_cost وcan_see_accounts بنفس الجسم (السجلّ تحت سياسة الكلفة)');
  t.eq(
    await db.asOwner(async (oq) => {
      await oq("create or replace function public.can_see_accounts() returns boolean language sql stable security definer set search_path = public, pg_temp as $$ select coalesce(private.my_role() in ('owner', 'manager'), false) $$");
      return (await oq(sameBody)).rows[0].same;
    }),
    false,
    'ضابط: فصل الدالّتين يفشّل الفحص',
  );

  // العامّة (global): بلا org_id بالضبط، وorgs هي المنشأة نفسها.
  const withoutOrg = (await q("select c.relname as name from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped) order by 1")).rows.map((r) => r.name);
  t.same(withoutOrg, sorted(['orgs', ...CLASSES.global]), 'الجداول بلا org_id = orgs والعامّة (global) بس');

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
    where c.contype = 'f' and n.nspname in ('public', 'private')`)).rows;
  t.ok(fks.length >= 8, `مفاتيح أجنبية انقرت (${fks.length})`);
  t.same(fks.filter((fk) => !fk.indexed).map((fk) => `${fk.tbl}.${fk.conname}`), [], 'فهرس كامل لكل مفتاح أجنبي');

  // كل مفتاح أجنبي بين جدولين مستأجرين مركّب ويّا org_id (tenant-fk-check ٨٦٢).
  const tenantFks = (await q(`
    select c.conname, c.conrelid::regclass::text as tbl, c.confrelid::regclass::text as ref,
      (select array_agg(a.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(attnum, ord)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)::text[] as cols
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f' and n.nspname in ('public', 'private')
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
  // قالب العمود (§2.7): abs(x) < 'Infinity' وx = round(x, n) بكل عمود numeric، ويّا ضابط بعمود بلا الحدّ.
  const numeric = await numericProblems(q);
  t.ok(numeric.columns >= 1, `أعمدة numeric بـpublic انقرت (${numeric.columns})`);
  t.same(numeric.problems, [], "كل عمود numeric بقيد abs(x) < 'Infinity' وx = round(x, n)");
  const numericProbe = await db.asOwner(async (oq) => {
    await oq('alter table public.units add column probe_q numeric constraint units_probe_q_check check (probe_q = round(probe_q, 3))');
    return numericProblems(oq);
  });
  t.same(numericProbe.problems.filter((p) => p.startsWith('units.probe_q')), ["units.probe_q: بلا check (abs(probe_q) < 'Infinity')"], 'ضابط: عمود numeric بلا الحدّ ينمسك');
  const roundProbe = await db.asOwner(async (oq) => {
    await oq("alter table public.units add column probe_r numeric constraint units_probe_r_check check (abs(probe_r) < 'Infinity')");
    return numericProblems(oq);
  });
  const roundMissing = roundProbe.problems.filter((p) => p.startsWith('units.probe_r'));
  t.ok(roundMissing.length === 1 && roundMissing[0].includes('probe_r = round(probe_r, n)'), `ضابط: عمود numeric بلا التقريب ينمسك (${roundMissing.join(' | ')})`);

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

  // الكتابة من الدوالّ بس (write-lock-check ٨٦٠): كل امتياز بكل جدول لكل دور، مو عيّنة. كتابة authenticated بالضبط حسب
  // directWrite (writeProblems فوك)، وقراءته كل جدول (rpc_refs ولا هذا)، anon ولا شي، وservice_role يبقى إداري بلا TRUNCATE،
  // وبلا تعديل أو حذف بالسجلّ.
  const granted = await grantedPrivileges(q, ['anon', 'authenticated', 'service_role']);
  const has = (role, filter) => granted.filter((g) => g.role === role && filter(g)).map((g) => `${g.name}.${g.privilege}`).sort();
  t.same(has('anon', () => true), [], 'anon بلا أي امتياز بأي جدول');
  t.same(has('authenticated', (g) => g.privilege === 'select'), tables.map((tb) => `${tb.name}.select`).filter((x) => x !== 'rpc_refs.select').sort(), 'authenticated يقرأ كل جدول بسياسته، عدا rpc_refs');
  t.same(has('service_role', (g) => g.privilege === 'truncate'), [], 'service_role بلا TRUNCATE بأي جدول');
  t.same(has('service_role', (g) => g.name === 'audit_log' && ['update', 'delete'].includes(g.privilege)), [], 'service_role ما يعدّل السجلّ ولا يحذف منه');
  t.ok(has('service_role', (g) => g.privilege === 'select').length === tables.length, 'ضابط: service_role يقرأ كل جدول (الفحص يشوف امتيازاته)');
  const anonColumn = await db.asOwner(async (oq) => {
    await oq('grant select (id) on public.orgs to anon');
    return (await grantedPrivileges(oq, ['anon'])).map((g) => `${g.name}.${g.privilege}`);
  });
  t.same(anonColumn, ['orgs.select'], 'ضابط: منح عمود لـanon يبين بالمسح (has_table_privilege ما يشوفه)');

  // مشغّلات التدقيق: بعد كل إدخال وتعديل وحذف لكل صفّ (tgtype: ROW 1، BEFORE 2، INSERT 4، DELETE 8، UPDATE 16،
  // TRUNCATE 32). السجلّ نفسه: قبل التعديل والحذف لكل صفّ، وقبل TRUNCATE للأمر كله.
  const triggers = (await q(`
    select c.relname as tbl, g.tgname as name, p.proname as fn, g.tgtype::int as type, g.tgenabled as enabled
    from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = g.tgfoid
    where n.nspname = 'public' and not g.tgisinternal`)).rows;
  t.same(triggers.filter((g) => g.enabled !== 'O').map((g) => g.name), [], 'كل المشغّلات مفعّلة');
  t.same(triggers.filter((g) => g.fn === 'audit_row' && g.type !== 1 + 4 + 8 + 16).map((g) => `${g.name}=${g.type}`), [], 'التدقيق بعد الإدخال والتعديل والحذف لكل صفّ');
  // الدفاتر الثابتة (appendOnly بـclasses.json، الخطّة §2.6): reject_change قبل التعديل والحذف لكل صفّ، وقبل TRUNCATE للأمر.
  t.ok(CLASSES.appendOnly.length >= 1, `دفاتر ثابتة بـclasses.json (${CLASSES.appendOnly.join('، ')})`);
  for (const tbl of CLASSES.appendOnly) {
    t.same(
      triggers.filter((g) => g.tbl === tbl && g.fn === 'reject_change').map((g) => g.type).sort((a, b) => a - b),
      [1 + 2 + 8 + 16, 2 + 32],
      `${tbl} يرفض التعديل والحذف لكل صفّ وTRUNCATE للأمر`,
    );
  }
  t.same(sorted(new Set(triggers.filter((g) => g.fn === 'reject_change').map((g) => g.tbl))), sorted(CLASSES.appendOnly), 'الجداول بمشغّلات reject_change = appendOnly بالضبط');

  // الأعمدة المشتركة (FOUNDATION ٢٤٠): كل جدول مستأجر بـid وorg_id بافتراض auth_org() وcreated_at وcreated_by وunique (org_id, id).
  // استثناءات مسمّاة: orgs بلا org_id (هي المنشأة)، وaudit_log (المنشأة من الصفّ المدقَّق، وactor/at، وما يصير هدف مفتاح)،
  // والعامّة (global، بلا org_id).
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
  const commonTables = tables.map((tb) => tb.name).filter((name) => !['orgs', 'audit_log', ...CLASSES.global].includes(name));
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
    from pg_constraint c where c.contype = 'f' and c.connamespace in ('public'::regnamespace, 'private'::regnamespace)`)).rows;
  t.same(deletes.filter((fk) => !['a', 'r'].includes(fk.on_delete)).map((fk) => `${fk.tbl}.${fk.conname}`), [], 'ماكو on delete cascade أو set null');
  t.same(deletes.filter((fk) => fk.ref === 'auth.users').map((fk) => [fk.tbl, fk.on_delete]).sort(), [['members', 'r'], ['private.invite_blocks', 'r']], 'كل مفتاح لـauth.users بـon delete restrict (الأعضاء والحظر)');

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
  // جداول private (أسرار الدعوة والحظر): RLS مفعّل، والواجهة ما تقراها ولا تكتبها، وanon ولا شي.
  const privateTables = (await q("select c.relname as name, c.relrowsecurity as rls, has_table_privilege('authenticated', c.oid, 'select, insert, update, delete') as auth_any, has_table_privilege('anon', c.oid, 'select, insert, update, delete') as anon_any from pg_class c where c.relnamespace = 'private'::regnamespace and c.relkind = 'r' order by 1")).rows;
  t.ok(privateTables.length >= 2, `جداول private انقرت (${privateTables.map((r) => r.name).join('، ')})`);
  t.same(privateTables.filter((r) => !r.rls || r.auth_any || r.anon_any).map((r) => r.name), [], 'جداول private: RLS، وبلا وصول للواجهة');

  const views = (await q("select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('v', 'm') and not coalesce(c.reloptions @> array['security_invoker=true'], false)")).rows;
  t.same(views, [], 'ماكو view يتجاوز RLS');

  // كل نداء call('دالّة', { p_… }) بـsrc/lib/repo يسمّي دالّة موجودة ومعاملات بتوقيعها: PostgREST يطابق الدالّة بأسماء
  // معاملاتها، فاسم غلط (p_site بدل p_sites) يطلع «ما لكيت الدالّة» بالإنتاج بس، وفحوص الشاشات بدائل ما تشوفه (اختبار الطفرات
  // WP2). ويّا ضابط: معامل بغير اسمه ينمسك.
  const repoDir = path.join(DIR, '..', '..', 'src', 'lib', 'repo');
  const repoCalls = readdirSync(repoDir)
    .filter((name) => name.endsWith('.ts'))
    .flatMap((name) =>
      [...readFileSync(path.join(repoDir, name), 'utf8').matchAll(/\bcall(?:<[^>]*>)?\(\s*'([a-z0-9_]+)'\s*(?:,\s*\{([^}]*)\})?/gu)].map((match) => ({
        file: name,
        fn: match[1],
        keys: [...(match[2] ?? '').matchAll(/\b(p_[a-z0-9_]+)\s*:/gu)].map((key) => key[1]),
      })),
    );
  const signatures = new Map((await q("select p.proname, coalesce(p.proargnames, '{}') as args from pg_proc p where p.pronamespace = 'public'::regnamespace")).rows.map((r) => [r.proname, r.args]));
  const paramProblems = (calls) =>
    calls.flatMap((c) => (signatures.has(c.fn) ? c.keys.filter((key) => !signatures.get(c.fn).includes(key)).map((key) => `${c.file}: ${c.fn}(${key})`) : [`${c.file}: ${c.fn} مو دالّة بالقاعدة`]));
  t.ok(repoCalls.some((c) => c.fn === 'add_member_v2' && c.keys.length === 6) && repoCalls.length >= 10, `نداءات repo انقرت (${repoCalls.length})`);
  t.same(paramProblems(repoCalls), [], `كل نداء بـrepo لدالّة موجودة ومعاملاته بتوقيعها (${repoCalls.length} نداء)`);
  t.same(paramProblems([{ file: 'probe.ts', fn: 'add_member_v2', keys: ['p_site'] }, { file: 'probe.ts', fn: 'no_such_fn', keys: [] }]), ['probe.ts: add_member_v2(p_site)', 'probe.ts: no_such_fn مو دالّة بالقاعدة'], 'ضابط: معامل بغير اسمه ودالّة مو موجودة ينمسكان');
}
