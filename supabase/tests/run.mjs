// حزمة بوستغريس الحقيقية (FOUNDATION، «الحرّاس والفحوص»): بوستغريس 17 مؤقّت من embedded-postgres
// (بلا تنصيب بالنظام)، بقالب Supabase المقيس على الإنتاج (bootstrap.sql)، والهجرات تنطبق مرّتين
// بدور postgres (مو خارق، مثل الإنتاج)، وبعدها كل supabase/tests/*.test.mjs. البيانات بمجلّد مؤقّت ينمسح.
// node supabase/tests/run.mjs [اسم…] ← يشغّل هذول الفحوص بس.
// --digest ← بعد الهجرات يطبع ملخّص الكتالوج (snapshot.mjs) حتى ينقارن بالإنتاج، و--elements=قسم ← عناصر قسم بـmd5،
// و--upto=0001 ← الهجرات لحد هالرقم بس (الإنتاج على إصدار أقدم من المستودع).
// المرحلة 1 (الخطّة WP0): كل public.verify_* ينكشف من pg_proc وينفّذ بمفتاح الخادم بعد الهجرتين وبعد كل ملف فحص وبالآخر،
// وأي صفّ غير صفر يفشّل؛ وصورة الكتالوج بالآخر = صورته بعد الهجرات؛ ومشغّل التراجع (rollback.mjs)؛ وسجلّ التغطية (كل دالّة
// بقائمة السماح × الأدوار الثمانية). وكل أداة منها تثبت إنها تقدر تفشل بضابط قبل ما ينصدّق نجاحها.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHarness } from '../../scripts/tests/harness.mjs';
import { coverageGaps, makeDb, ROLES } from './db.mjs';
import { applySql, blockingShortfall, declaredRollback, heavyChanges, rollbackBlockedCase, rollbackCase, rollbackDeclarationProblems, verifyAll, zeroRollbacksProblem } from './rollback.mjs';
import { BLOCKING_REQUIRED, BLOCKING_SEEDS, seedThroughRpcs } from './seed.mjs';
import { DIGEST_SQL, elementsSql, snapshot, snapshotDiff } from './snapshot.mjs';

export { makeDb } from './db.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(DIR, '..', 'migrations');
const ALLOWLIST = JSON.parse(readFileSync(path.join(DIR, 'allowlist.json'), 'utf8'));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** الهجرات بترتيبها (0001_…)، بلا ملفات التراجع rollback_NNNN. */
export function migrationFiles() {
  // ماكو مجلّد هجرات = صفر هجرات؛ migration-guard هو اللي يفشل على مسح فارغ.
  if (!existsSync(MIGRATIONS)) return [];
  return readdirSync(MIGRATIONS)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
}

async function inRollback(client, fn) {
  await client.query('begin');
  try {
    return await fn();
  } finally {
    await client.query('rollback');
  }
}

/** قبل الهجرات: القالب يفتح الجديد من postgres مثل الإنتاج، وإلا «الجديد ينشأ مسدوداً» بعدها ما يثبت شي. */
async function assertTemplateOpen(client) {
  const open = await inRollback(client, async () => {
    await client.query('set local role postgres');
    await client.query('create table public.probe_template (id int)');
    await client.query('create function public.probe_template_fn() returns int language sql as $$ select 1 $$');
    return (await client.query(`select
      has_table_privilege('anon', 'public.probe_template', 'insert') as anon_insert,
      has_table_privilege('authenticated', 'public.probe_template', 'truncate') as auth_truncate,
      has_function_privilege('anon', 'public.probe_template_fn()', 'execute') as anon_execute`)).rows[0];
  });
  if (!open.anon_insert || !open.auth_truncate || !open.anon_execute) {
    throw new Error(`القالب ما يطابق الإنتاج: افتراض postgres مسدود قبل الهجرات (${JSON.stringify(open)})`);
  }
}

async function applyMigrations(client, migrations, pass) {
  for (const { name, text } of migrations) await applySql(client, text, `الهجرة ${name} بالمرّة ${pass}`);
}

const BOOTSTRAP = readFileSync(path.join(DIR, 'bootstrap.sql'), 'utf8');
const PER_DATABASE = BOOTSTRAP.slice(BOOTSTRAP.indexOf('-- ─── لكل قاعدة ───'));

/** ضوابط صورة الكتالوج: كل تغيير بمعاملة ترجع لازم يبين (المراجعة العدائية لـ0002 والخطّة GT-25). */
async function snapshotProbes(client) {
  // قيد check يتغيّر: round(x, n) ← n+1 إذا موجود (من 0004)، وإلا القيد ويّا «and (1 = 1)».
  const check = (await client.query(`
    select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as def from pg_constraint
    where contype = 'c' and connamespace = 'public'::regnamespace
    order by (pg_get_constraintdef(oid) like '%round(%') desc, conname limit 1`)).rows[0];
  const rounded = /round\((.+?), (\d+)\)/u.exec(check.def);
  const changed = rounded
    ? check.def.replace(rounded[0], `round(${rounded[1]}, ${Number(rounded[2]) + 1})`)
    : `CHECK (${check.def.slice('CHECK '.length)} AND (1 = 1))`;
  return [
    'alter function public.app_today() set statement_timeout = 1000',
    'alter table public.audit_log disable trigger audit_log_append_only',
    'alter function private.account_phone(text, text) strict',
    'alter function public.can_see_cost() parallel safe',
    'grant select (id) on public.orgs to anon',
    'alter table public.orgs force row level security',
    'alter table public.orgs owner to service_role',
    // افتراض المعامل وحده (نفس الجسم): p_costs_confirmed default true يقلب مشغّل المعمل.
    "do $$ begin execute replace(pg_get_functiondef('private.role_can(text, text, boolean)'::regprocedure), 'DEFAULT false', 'DEFAULT true'); end $$",
    // المرحلة 1: سياسة مقيِّدة تنشال، وقيد check يتغيّر، ومهلة قفل دالّة تتغيّر.
    'drop policy audit_log_cost_only on public.audit_log',
    `alter table ${check.tbl} drop constraint ${check.conname}, add constraint ${check.conname} ${changed}`,
    "alter function public.set_period_lock(date) set lock_timeout = '6s'",
  ];
}

async function main() {
  // الإطار يثبت أوّل إنه يقدر يفشل: «فحص على صفر قيم ليس نجاحاً».
  const probe = createHarness();
  probe.t.eq(1, 2, 'probe');
  if (probe.result().failures.length !== 1) {
    console.log('✗ إطار الفحص ما يكدر يفشل — نتائجه ما تنصدّق');
    process.exit(1);
  }

  const flags = process.argv.slice(2).filter((arg) => arg.startsWith('--'));
  const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const full = only.length === 0;
  const elements = flags.find((arg) => arg.startsWith('--elements='))?.slice('--elements='.length);
  const upto = flags.find((arg) => arg.startsWith('--upto='))?.slice('--upto='.length);
  const port = await freePort();
  const dataDir = mkdtempSync(path.join(tmpdir(), 'poultry-pg-'));
  const errors = [];
  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: 'supabase_admin',
    password: 'harness-only',
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    // TimeZone مثل الإنتاج (UTC)، مو منطقة الجهاز (template.test يثبتها).
    postgresFlags: ['-c', 'TimeZone=UTC'],
    onLog: () => {},
    onError: (message) => errors.push(String(message)),
  });

  let failed = 0;
  let client = null;
  const started = Date.now();
  const fail = (line, details = []) => {
    failed += 1;
    console.log(`✗ ${line}`);
    for (const detail of details) console.log(`    ${detail}`);
  };
  try {
    await server.initialise();
    await server.start();
    const connect = (database = 'postgres') => server.getPgClient(database, '127.0.0.1');
    client = connect();
    await client.connect();
    await client.query(BOOTSTRAP);
    await assertTemplateOpen(client);

    const migrations = migrationFiles()
      .filter((name) => !upto || name.slice(0, 4) <= upto)
      .map((name) => ({ name, text: readFileSync(path.join(MIGRATIONS, name), 'utf8') }));
    // المرّة الأولى هجرة هجرة ويّا صورة قبلها وبعدها: شنو غيّرت من الموجود (heavyChanges)، حتى سطر «تراجع:» ينصدّق بالكتالوج.
    const heavy = new Map();
    let current = await snapshot(client);
    for (const migration of migrations) {
      await applySql(client, migration.text, `الهجرة ${migration.name} بالمرّة 1`);
      const next = await snapshot(client);
      heavy.set(migration.name, heavyChanges(current, next));
      current = next;
    }
    const first = current;
    // مرّتين: الهجرة اللي ما تنعاد بأمان تكسر أوّل إعادة نشر، والمرّة الثانية لازم ما تغيّر الكتالوج.
    await applyMigrations(client, migrations, 2);
    const drift = snapshotDiff(first, await snapshot(client));
    if (drift.length) throw new Error(`المرّة الثانية غيّرت الكتالوج:\n    ${drift.slice(0, 10).join('\n    ')}`);
    // الصورة نفسها تمسك كل نوع تغيير: كل ضابط بمعاملة ترجع لازم يبين (المراجعة العدائية لـ0002: كانت تعبر
    // تعطيل مشغّل، وSTRICT، وافتراض معامل، ومنح عمود، وFORCE RLS، وNULL مقابل '{}').
    const PROBES = await snapshotProbes(client);
    const blind = [];
    for (const change of PROBES) {
      const probeDrift = await inRollback(client, async () => {
        await client.query(change);
        return snapshotDiff(first, await snapshot(client));
      });
      if (probeDrift.length === 0) blind.push(change);
    }
    if (blind.length) throw new Error(`صورة الكتالوج ما مسكت ${blind.length} ضابط — المقارنة ما تنصدّق:\n    ${blind.join('\n    ')}`);
    console.log(`✓ القالب مفتوح قبل الهجرات مثل الإنتاج، و${migrations.length} هجرة انطبقت مرّتين بلا فرق بالكتالوج، والصورة مسكت ${PROBES.length} ضوابط تغيير`);

    if (flags.includes('--digest') || elements) {
      const rows = (await client.query(elements ? elementsSql(elements) : DIGEST_SQL)).rows;
      console.log(JSON.stringify(rows, null, 1));
      return;
    }

    const db = makeDb(client, connect);
    const migrated = await verifyAll(db);
    if (migrated.bad.length) fail(`الثوابت بعد الهجرتين: ${migrated.bad.length} مخالفة`, migrated.bad);
    else console.log(`✓ الثوابت بعد الهجرتين: ${migrated.fns.join('، ')} صفر`);

    // ملف فحص واحد ثم الثوابت كلها: ملف يثبّت خرقاً يفشل هو، مو الملف اللي بعده.
    const runFile = async (label, run) => {
      const { t, result } = createHarness();
      let crashed = null;
      try {
        await run(t);
      } catch (error) {
        crashed = error;
      }
      const { passed, failures } = result();
      let verify;
      try {
        verify = await verifyAll(db);
      } catch (error) {
        verify = { bad: [`الثوابت رمت: ${error.message}`] };
      }
      const ok = !crashed && failures.length === 0 && passed > 0 && verify.bad.length === 0;
      const lines = [...failures, ...verify.bad.map((bad) => `ثابت بعد الملف: ${bad}`), ...(crashed ? [`رمى: ${crashed.stack ?? crashed}`] : [])];
      const head = ok
        ? `✓ ${label}: ${passed} فحص`
        : `✗ ${label}: ${passed} ناجح، ${failures.length} فاشل${verify.bad.length ? `، ${verify.bad.length} ثابت غير صفر` : ''}${passed === 0 && !crashed && failures.length === 0 ? ' — صفر فحوص' : ''}`;
      return { ok, head, lines, verify };
    };

    for (const file of readdirSync(DIR)
      .filter((name) => name.endsWith('.test.mjs'))
      .filter((name) => full || only.includes(name.replace('.test.mjs', '')))
      .sort()) {
      const outcome = await runFile(file.replace('.test.mjs', ''), async (t) => {
        const module = await import(pathToFileURL(path.join(DIR, file)).href);
        await module.default(t, db);
      });
      if (outcome.ok) console.log(outcome.head);
      else fail(outcome.head.slice(2), outcome.lines);
    }

    // ضابط خطوة الثوابت: خرق مثبَّت بمنشأة تجربة لازم يفشّل الملف اللي ثبّته، وبعد التصليح ترجع صفر.
    const probeUser = '80000000-0000-4000-8000-000000000001';
    await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())', [probeUser, '9647707000001']);
    await db.asUser(probeUser, (q) => q("select public.create_my_org('منشأة ضابط الثوابت', 'الحزمة')"), { commit: true });
    const probeOrg = (await db.admin('select org_id from public.members where user_id = $1', [probeUser])).rows[0].org_id;
    const violated = await runFile('ضابط الثوابت', async (t) => {
      await db.admin("update public.divisions set archived_at = now() where org_id = $1 and kind = 'medicine'", [probeOrg]);
      t.ok(true, 'الخرق انكتب');
    });
    await db.admin("update public.divisions set archived_at = null where org_id = $1 and kind = 'medicine'", [probeOrg]);
    const restored = await verifyAll(db);
    if (violated.ok || !violated.verify.bad.some((bad) => bad.includes('divisions_per_org')) || restored.bad.length) {
      fail('ضابط الثوابت: خرق مثبَّت بملف فحص ما فشّل خطوة الثوابت بعده (أو ما رجعت صفراً بعد التصليح)', [...violated.lines, ...restored.bad]);
    } else {
      console.log(`✓ ضابط الثوابت: خرق مثبَّت فشّل ملفه (${violated.verify.bad.join('، ')})، وبعد التصليح صفر`);
    }

    if (full) {
      // ── مشغّل التراجع ────────────────────────────────────────────────────────────────────────────────
      let scratch = 0;
      const fresh = async () => {
        scratch += 1;
        const name = `rollback_case_${scratch}`;
        await client.query(`drop database if exists ${name} with (force)`);
        await client.query(`create database ${name} owner postgres`);
        const other = connect(name);
        await other.connect();
        await other.query(PER_DATABASE);
        return {
          client: other,
          db: makeDb(other, () => connect(name)),
          close: async () => {
            await other.end().catch(() => {}); /* swallow-ok: الإغلاق بعد فشل الحالة */
            await client.query(`drop database if exists ${name} with (force)`);
          },
        };
      };
      const rollbackProblems = [];
      let ran = 0;
      let blockedRan = 0;
      const blockedBy = new Map();
      let blockedRefused = 0;
      for (const [index, migration] of migrations.entries()) {
        const declared = declaredRollback(migration.name, migration.text);
        const changes = heavy.get(migration.name) ?? [];
        if (declared.kind === 'legacy') continue;
        rollbackProblems.push(...rollbackDeclarationProblems(migration.name, declared, changes));
        if (declared.kind !== 'file') continue;
        const file = path.join(MIGRATIONS, declared.file);
        if (!existsSync(file)) {
          rollbackProblems.push(`${migration.name}: يسمّي ${declared.file} وما موجود`);
          continue;
        }
        ran += 1;
        const rollbackSql = readFileSync(file, 'utf8');
        const problems = await rollbackCase({ fresh, migrations: migrations.slice(0, index + 1), rollbackSql, seed: seedThroughRpcs });
        rollbackProblems.push(...problems.map((problem) => `${declared.file}: ${problem}`));
        // الطريق الثاني (WP2): كل بذرة يلزم التراجع يرفضها بصوت وما يغيّر شي، وضابطاها: نفس الملف بلا كتلة الرفض يكمل، ونفس
        // الملف بلا فرع الحالة من شرط الرفض (mutate) يكمل هو هم، فكل فرع من الشرط إله حالة تحتاجه (طفرة فرع ما تعبر بصمت).
        for (const blocking of [].concat(BLOCKING_SEEDS[declared.number] ?? [])) {
          blockedRan += 1;
          blockedBy.set(declared.number, (blockedBy.get(declared.number) ?? 0) + 1);
          const label = `${declared.file} (طريق الرفض: ${blocking.name})`;
          const blockedCase = (sql) => rollbackBlockedCase({ fresh, migrations: migrations.slice(0, index + 1), rollbackSql: sql, ...blocking });
          // الحالة الحقيقية بدليل إيجابي: الرفض الصادق ينعدّ، وبالآخر العدد = عدد الحالات (حالة ما انفحصت ما تعبر بصمت).
          const real = await blockedCase(rollbackSql);
          if (real.length) rollbackProblems.push(...real.map((problem) => `${label}: ${problem}`));
          else blockedRefused += 1;
          const unguarded = rollbackSql.replace(/\ndo \$\$[\s\S]*?\n\$\$;\n/u, '\n');
          const control = unguarded === rollbackSql ? ['ما لكيت كتلة الرفض'] : await blockedCase(unguarded);
          if (!control.some((problem) => problem.includes('كمل'))) rollbackProblems.push(`${label}: ضابط طريق الرفض ما فشل بلا كتلة الرفض (${control.join(' | ')})`);
          const mutated = blocking.mutate ? blocking.mutate(rollbackSql) : rollbackSql;
          const branch = mutated === rollbackSql ? ['ما لكيت فرع الحالة بشرط الرفض'] : await blockedCase(mutated);
          if (!branch.some((problem) => problem.includes('كمل'))) rollbackProblems.push(`${label}: ضابط فرع الشرط ما فشل بلا فرعه (${branch.join(' | ')})`);
        }
        // ضوابط فحوص طريق الرفض نفسها (اختبار الطفرات WP2)، مرّة لكل ملف تراجع بحالات رفض: تراجع يرفض برمز ثاني، ويثبّت قبل
        // رفضه جدولاً ومادّة (commit بنصّ الملف)، وبذرته تكسر ثابتاً؛ وبذرة ما زرعت شي. كل فحص يمسك كسره باسمه.
        const sample = [].concat(BLOCKING_SEEDS[declared.number] ?? [])[0];
        if (sample) {
          const probeCase = (over) => rollbackBlockedCase({ fresh, migrations: migrations.slice(0, index + 1), rollbackSql, ...sample, ...over });
          const leaky = "create table public.probe_blocked_drift (id int);\ninsert into public.items (org_id, name, kind, base_unit) select id, 'ضابط طريق الرفض', 'raw', 'kg' from public.orgs;\ncommit;\n";
          const broken = await probeCase({
            code: 'probe_code',
            rollbackSql: leaky + rollbackSql,
            seed: async (seedDb) => {
              await sample.seed(seedDb);
              await seedDb.admin("update public.divisions set archived_at = now() where kind = 'medicine'");
            },
          });
          const empty = await probeCase({ data: "select '0/1' as v" });
          const blind = [
            [broken, 'والمتوقّع probe_code'],
            [broken, 'غيّر الكتالوج'],
            [broken, 'غيّر البيانات'],
            [broken, 'الثوابت بعد التراجع المرفوض'],
            [empty, 'ما زرعت شي'],
          ].filter(([problems, text]) => !problems.some((problem) => problem.includes(text)));
          if (blind.length) rollbackProblems.push(`${declared.file}: ضوابط طريق الرفض ما مسكت ${blind.map(([, text]) => `«${text}»`).join('، ')} (${[...broken, ...empty].join(' | ')})`);
        }
      }
      // كل ملف تراجع بحالات رفضه كلها: 0005 نطاق بموقع ونطاق بمخزن؛ 0006 قيد جهة وحركة صندوق ووحدة تعبئة لمورّد؛ 0007 مسوّدة افتتاح
      // ومسوّدة تحويل؛ 0008 مصروف نقدي ومسوّدة صرف ومسوّدة جرد (كل وحدة توقفه).
      rollbackProblems.push(...blockingShortfall(BLOCKING_REQUIRED, migrations.map((m) => Number(m.name.slice(0, 4))), blockedBy));
      if (blockedRefused !== blockedRan) rollbackProblems.push(`طريق الرفض: ${blockedRefused} من ${blockedRan} حالة رفضها التراجع بصدق`);
      // ضابط من الهجرات الحقيقية: 0002 بدّلت أجسام تسع دوالّ بالإنتاج، فالكشف لازم يسمّيها ثقيلة (القديمة معفيّة من الملف بس).
      const legacyHeavy = migrations.filter((m) => declaredRollback(m.name, m.text).kind === 'legacy' && (heavy.get(m.name) ?? []).length).map((m) => m.name.slice(0, 4));
      if (migrations.some((m) => m.name.startsWith('0002_')) && !legacyHeavy.includes('0002')) rollbackProblems.push('الكشف ما سمّى 0002 ثقيلة وهي بدّلت أجسام دوالّ قديمة');
      const latest = Number(migrations.at(-1)?.name.slice(0, 4) ?? 0);
      const zero = zeroRollbacksProblem(latest, ran);
      if (zero) rollbackProblems.push(zero);

      // ضابط المشغّل: هجرة مصنوعة تغيّر جدولاً قديماً ودالّة قديمة وتكول «إضافية فقط». الكشف يسمّيها ثقيلة، وفحص سطر «تراجع:»
      // نفسه (اللي يمرّ بيه كل هجرة فوك) يرفض «إضافية فقط» عليها، والتراجع الصادق يعبر، والناقص يفشل برسالة الكتالوج بالضبط.
      const original = (await client.query("select pg_get_functiondef('public.app_today()'::regprocedure) as def")).rows[0].def;
      const fake = {
        name: `${String(latest + 1).padStart(4, '0')}_probe.sql`,
        text: [
          `-- ${String(latest + 1).padStart(4, '0')}_probe — ضابط مشغّل التراجع`,
          '-- تراجع: إضافية فقط',
          "set lock_timeout = '5s';",
          'alter table public.orgs add column if not exists probe_note text;',
          "create or replace function public.app_today() returns date language sql stable set search_path = pg_catalog, pg_temp as $$ select (now() at time zone 'Asia/Baghdad')::date + 0 $$;",
        ].join('\n'),
      };
      const probeMigrations = [...migrations, fake];
      const honest = await rollbackCase({ fresh, migrations: probeMigrations, rollbackSql: `alter table public.orgs drop column probe_note;\n${original};`, seed: seedThroughRpcs });
      const forgetful = await rollbackCase({ fresh, migrations: probeMigrations, rollbackSql: 'alter table public.orgs drop column probe_note;', seed: seedThroughRpcs });
      // ضابطا الخطوتين الباقيتين (طفرات الاختبار): هجرة تتبع البيانات (تنشئ دالّة بقاعدة فارغة بس)، فإعادتها بعد البذرة ما
      // ترجّع كتالوجها؛ وتراجع صادق بالكتالوج يخرّب البذرة (يؤرشف وحدة)، فالثوابت بعده تفشل. والاثنين يفشلون بس ويّا البذرة.
      const dataBound = {
        name: fake.name,
        text: [
          `-- ${fake.name.slice(0, 4)}_probe — ضابط إعادة الهجرة بعد التراجع`,
          '-- تراجع: إضافية فقط',
          "set lock_timeout = '5s';",
          "do $$ begin if not exists (select 1 from public.orgs) then execute 'create function public.probe_fresh() returns int language sql as $f$ select 1 $f$'; end if; end $$;",
        ].join('\n'),
      };
      const redo = await rollbackCase({ fresh, migrations: [...migrations, dataBound], rollbackSql: 'drop function if exists public.probe_fresh();', seed: seedThroughRpcs });
      const breaker = await rollbackCase({
        fresh,
        migrations: probeMigrations,
        rollbackSql: `alter table public.orgs drop column probe_note;\n${original};\nupdate public.divisions set archived_at = now() where kind = 'medicine';`,
        seed: seedThroughRpcs,
      });
      const { client: probeClient, close: closeProbe } = await fresh();
      let detected = [];
      try {
        for (const migration of migrations) await applySql(probeClient, migration.text, migration.name);
        const before = await snapshot(probeClient);
        await applySql(probeClient, fake.text, fake.name);
        detected = heavyChanges(before, await snapshot(probeClient));
      } finally {
        await closeProbe();
      }
      const declaredProblems = rollbackDeclarationProblems(fake.name, declaredRollback(fake.name, fake.text), detected);
      const probeOk =
        honest.length === 0 &&
        forgetful.length === 1 &&
        forgetful[0].startsWith(`بعد التراجع الكتالوج مو مثل قبل ${fake.name}`) &&
        redo.length === 1 &&
        redo[0].startsWith(`إعادة ${fake.name} بعد التراجع`) &&
        breaker.length === 1 &&
        breaker[0].startsWith('الثوابت بعد التراجع والإعادة') &&
        breaker[0].includes('divisions_per_org') &&
        detected.some((reason) => reason.includes('probe_note')) &&
        detected.some((reason) => reason.includes('app_today')) &&
        declaredProblems.length === 1 &&
        declaredProblems[0].startsWith(`${fake.name}: «إضافية فقط» وهي غيّرت الموجود`);
      if (!probeOk) {
        rollbackProblems.push(`ضابط المشغّل ما اشتغل: الصادق ${JSON.stringify(honest)}، الناقص ${JSON.stringify(forgetful)}، الإعادة ${JSON.stringify(redo)}، مخرّب البذرة ${JSON.stringify(breaker)}، الكشف ${JSON.stringify(detected)}، سطر «تراجع:» ${JSON.stringify(declaredProblems)}`);
      }
      if (rollbackProblems.length) fail(`مشغّل التراجع: ${rollbackProblems.length} مشكلة`, rollbackProblems);
      else {
        const heavyCount = migrations.filter((m) => declaredRollback(m.name, m.text).kind !== 'legacy' && (heavy.get(m.name) ?? []).length).length;
        console.log(`✓ مشغّل التراجع: جرى ${ran} ملف تراجع وطريق الرفض بـ${blockedRan} حالة رفضها التراجع كلّها بصدق، وضوابطه مسكت الرمز الثاني والكتالوج والبيانات والبذرة الفارغة والثوابت (${heavyCount} هجرة ثقيلة بعد 0003؛ والقديمة معفيّة بالاسم والكشف يسمّي منها ${legacyHeavy.join(' و') || 'ولا وحدة'} ثقيلة)، والضابط: الكشف سمّى الهجرة المصنوعة ثقيلة، و«إضافية فقط» عليها انرفض، والتراجع الصادق عبر والناقص فشل، والهجرة اللي تتبع البيانات فشلت بإعادتها، والتراجع اللي يخرّب البذرة فشل بالثوابت`);
      }

      // ── سجلّ التغطية: كل دالّة بقائمة السماح نادتها الأدوار الثمانية كلها بدور authenticated ───────────────────
      const gaps = coverageGaps(ALLOWLIST.authenticated, db.coverage);
      if (gaps.length) fail(`سجلّ التغطية: ${gaps.length} (دالّة × دور) ما انسجّل نداؤها`, gaps.slice(0, 40));
      else console.log(`✓ سجلّ التغطية: ${ALLOWLIST.authenticated.length} دالّة × ${ROLES.length} أدوار، كل خانة انسجّل نداؤها بدور authenticated`);
    } else {
      console.log('· مشغّل التراجع وسجلّ التغطية للحزمة كاملة بس (بلا أسماء ملفات)');
    }

    // ── نهاية الحزمة: الثوابت، وصورة الكتالوج = اللي بعد الهجرات (ومنها app_today() بجسم الهجرة) ───────────────────
    const ending = await verifyAll(db);
    if (ending.bad.length) fail(`الثوابت بنهاية الحزمة: ${ending.bad.length} مخالفة`, ending.bad);
    const last = await snapshot(client);
    const today = (s) => (s.functions ?? []).filter((f) => f[0] === 'public' && f[1] === 'app_today').map((f) => JSON.stringify(f));
    if (JSON.stringify(today(last)) !== JSON.stringify(today(first))) fail('app_today() بنهاية الحزمة مو بجسم الهجرة (setToday ما رجّعه؟)', today(last));
    const leftover = snapshotDiff(first, last);
    if (leftover.length) fail(`صورة الكتالوج بنهاية الحزمة غير اللي بعد الهجرات (${leftover.length} فرق)`, leftover.slice(0, 10));
    if (!ending.bad.length && !leftover.length) console.log(`✓ نهاية الحزمة: الثوابت صفر، وصورة الكتالوج نفس اللي بعد الهجرات`);
  } catch (error) {
    fail(`الحزمة: ${error.message}`);
    if (errors.length) console.log(`    بوستغريس: ${errors.slice(-5).join(' | ')}`);
  } finally {
    await client?.end().catch(() => {}); /* swallow-ok: الإغلاق بعد فشل الاتصال */
    await server.stop().catch(() => {}); /* swallow-ok: الإيقاف بعد فشل الإقلاع */
    rmSync(dataDir, { recursive: true, force: true });
  }
  console.log(`(${((Date.now() - started) / 1000).toFixed(1)} ثانية)`);
  if (failed > 0) {
    console.log(`\n${failed} فشل بحزمة بوستغريس.`);
    process.exit(1);
  }
}

await main();
