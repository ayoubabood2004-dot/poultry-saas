// حزمة بوستغريس الحقيقية (FOUNDATION، «الحرّاس والفحوص»): بوستغريس 17 مؤقّت من embedded-postgres
// (بلا تنصيب بالنظام)، بقالب Supabase المقيس على الإنتاج (bootstrap.sql)، والهجرات تنطبق مرّتين
// بدور postgres (مو خارق، مثل الإنتاج)، وبعدها كل supabase/tests/*.test.mjs. البيانات بمجلّد مؤقّت ينمسح.
// node supabase/tests/run.mjs [اسم…] ← يشغّل هذول الفحوص بس.
// --digest ← بعد الهجرات يطبع ملخّص الكتالوج (snapshot.mjs) حتى ينقارن بالإنتاج، و--elements=قسم ← عناصر قسم بـmd5،
// و--upto=0001 ← الهجرات لحد هالرقم بس (الإنتاج على إصدار أقدم من المستودع).
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHarness } from '../../scripts/tests/harness.mjs';
import { DIGEST_SQL, elementsSql, snapshot, snapshotDiff } from './snapshot.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(DIR, '..', 'migrations');

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

const userClaims = (userId) => ({ sub: userId, role: 'authenticated' });

// طريق الطلب مثل PostgREST: authenticator يدخل بحدوده (lock_timeout وstatement_timeout 8s)، وبعد set role تنطبق حدود
// الدور (statement_timeout: anon 3s وauthenticated 8s). من pg_db_role_setting، المنسوخ من الإنتاج بـbootstrap.sql، ويُقرأ
// قبل set role (الحدود محلّية للمعاملة، فترتيبها ويّا set role ما يأثّر).
async function applyRequestLimits(query, role) {
  if (!['anon', 'authenticated', 'service_role'].includes(role)) return;
  const { rows } = await query(
    `select split_part(c, '=', 1) as name, split_part(c, '=', 2) as value
     from pg_db_role_setting s cross join unnest(s.setconfig) with ordinality as x(c, n)
     where s.setdatabase = 0 and s.setrole in ('authenticator'::regrole, $1::regrole)
       and split_part(c, '=', 1) in ('statement_timeout', 'lock_timeout')
     order by s.setrole = $1::regrole, x.n`,
    [role],
  );
  for (const { name, value } of rows) await query('select set_config($1, $2, true)', [name, value]);
}

/**
 * عميل بهويّة: كل استعلام بمعاملة تنتهي بتراجع (الفحص ما يسيب أثر)، بدور authenticated أو anon
 * ومطالبات JWT مثل PostgREST بالضبط (request.jwt.claims)، فـauth.uid() وRLS يشتغلون مثل الإنتاج.
 * connect: اتصال جديد بنفس القاعدة، لفحوص التزامن (جلستان بنفس اللحظة).
 */
export function makeDb(client, connect) {
  // commit: السيناريو يكمل بمستخدم ثاني بعده (المالك يضيف العامل، والعامل يفحص). بلاه كل شي يرجع.
  async function inRole(role, claims, fn, { commit = false } = {}) {
    await client.query('begin');
    let ok = false;
    try {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims ?? {})]);
      await applyRequestLimits((text, params) => client.query(text, params), role);
      await client.query(`set local role ${role}`);
      const result = await fn((text, params) => client.query(text, params));
      ok = true;
      return result;
    } finally {
      await client.query(ok && commit ? 'commit' : 'rollback');
    }
  }

  /**
   * جلسة مستقلّة بمعاملة مفتوحة كمستخدم داخل، تبقى لحد commit أو rollback. run(sql) يرجّع وعداً ما ينتظر،
   * وsettle(وعد) يستنّى لحد ما ينتهي الاستعلام أو ينحبس على قفل (pg_stat_activity)، ويكول أيّهما.
   */
  async function session(userId) {
    const other = connect();
    await other.connect();
    const pid = (await other.query('select pg_backend_pid() as pid')).rows[0].pid;
    await other.query('begin');
    await other.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(userClaims(userId))]);
    await applyRequestLimits((text, params) => other.query(text, params), 'authenticated');
    await other.query('set local role authenticated');
    let open = true;
    // مرّة وحدة: بعد commit أو rollback الجلسة انسدّت، والنداء الثاني (finally بالفحص) ما يسوّي شي.
    const end = async (verb) => {
      if (!open) return;
      open = false;
      try {
        await other.query(verb);
      } finally {
        await other.end();
      }
    };
    return {
      pid,
      /** الاستعلام بالجلسة؛ الوعد يرجع { ok, rows } أو { ok: false, error } بدل ما يرمي. */
      run: (text, params) =>
        other.query(text, params).then(
          (result) => ({ ok: true, rows: result.rows }),
          (error) => ({ ok: false, error: error.message }),
        ),
      commit: () => end('commit'),
      rollback: () => end('rollback'),
    };
  }

  async function settle(promise, pid, timeoutMs = 5000) {
    let done = false;
    promise.then(() => {
      done = true;
    });
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (done) return 'finished';
      const row = (await client.query('select wait_event_type from pg_stat_activity where pid = $1', [pid])).rows[0];
      if (row?.wait_event_type === 'Lock') return 'blocked';
      await delay(20);
    }
    throw new Error(`الجلسة ${pid} ما انتهت ولا انحبست على قفل خلال ${timeoutMs}ms`);
  }

  return {
    /** استعلام بالهويّة الإدارية (supabase_admin) للتجهيز: يبقى أثره لحد نهاية الحزمة. */
    admin: (text, params) => client.query(text, params),
    /** كمستخدم داخل: sub = userId والدور authenticated. يرجع إلا ويّا { commit: true }. */
    asUser: (userId, fn, options) => inRole('authenticated', userClaims(userId), fn, options),
    /** بلا دخول: مفتاح anon. */
    asAnon: (fn) => inRole('anon', { role: 'anon' }, fn),
    /** صاحب الهجرات (postgres، مو خارق)، ويّا مطالبات مستخدم إذا انطى (لدوالّ private بهويّته). */
    asOwner: (fn, userId) => inRole('postgres', userId ? userClaims(userId) : {}, fn),
    /** بمفتاح الخادم (service_role): يتجاوز RLS مثل الإنتاج. */
    asService: (fn) => inRole('service_role', { role: 'service_role' }, fn),
    session,
    settle,
  };
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

async function applyMigrations(client, files, pass) {
  for (const name of files) {
    const sql = readFileSync(path.join(MIGRATIONS, name), 'utf8');
    await client.query('begin');
    try {
      await client.query('set local role postgres');
      await client.query(sql);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw new Error(`الهجرة ${name} فشلت بالمرّة ${pass}: ${error.message}`, { cause: error });
    }
  }
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
  try {
    await server.initialise();
    await server.start();
    const connect = () => server.getPgClient('postgres', '127.0.0.1');
    client = connect();
    await client.connect();
    await client.query(readFileSync(path.join(DIR, 'bootstrap.sql'), 'utf8'));
    await assertTemplateOpen(client);

    const files = migrationFiles().filter((name) => !upto || name.slice(0, 4) <= upto);
    // مرّتين: الهجرة اللي ما تنعاد بأمان تكسر أوّل إعادة نشر، والمرّة الثانية لازم ما تغيّر الكتالوج.
    await applyMigrations(client, files, 1);
    const first = await snapshot(client);
    await applyMigrations(client, files, 2);
    const drift = snapshotDiff(first, await snapshot(client));
    if (drift.length) throw new Error(`المرّة الثانية غيّرت الكتالوج:\n    ${drift.slice(0, 10).join('\n    ')}`);
    // الصورة نفسها تمسك كل نوع تغيير: كل ضابط بمعاملة ترجع لازم يبين (المراجعة العدائية لـ0002: كانت تعبر
    // تعطيل مشغّل، وSTRICT، وافتراض معامل، ومنح عمود، وFORCE RLS، وNULL مقابل '{}').
    const PROBES = [
      'alter function public.app_today() set statement_timeout = 1000',
      'alter table public.audit_log disable trigger audit_log_append_only',
      'alter function private.account_phone(text, text) strict',
      'alter function public.can_see_cost() parallel safe',
      'grant select (id) on public.orgs to anon',
      'alter table public.orgs force row level security',
      'alter table public.orgs owner to service_role',
      // افتراض المعامل وحده (نفس الجسم): p_costs_confirmed default true يقلب مشغّل المعمل.
      "do $$ begin execute replace(pg_get_functiondef('private.role_can(text, text, boolean)'::regprocedure), 'DEFAULT false', 'DEFAULT true'); end $$",
    ];
    const blind = [];
    for (const probe of PROBES) {
      const probeDrift = await inRollback(client, async () => {
        await client.query(probe);
        return snapshotDiff(first, await snapshot(client));
      });
      if (probeDrift.length === 0) blind.push(probe);
    }
    if (blind.length) throw new Error(`صورة الكتالوج ما مسكت ${blind.length} ضابط — المقارنة ما تنصدّق:\n    ${blind.join('\n    ')}`);
    console.log(`✓ القالب مفتوح قبل الهجرات مثل الإنتاج، و${files.length} هجرة انطبقت مرّتين بلا فرق بالكتالوج، والصورة مسكت ${PROBES.length} ضوابط تغيير`);

    if (flags.includes('--digest') || elements) {
      const rows = (await client.query(elements ? elementsSql(elements) : DIGEST_SQL)).rows;
      console.log(JSON.stringify(rows, null, 1));
      return;
    }

    const db = makeDb(client, connect);
    for (const file of readdirSync(DIR)
      .filter((name) => name.endsWith('.test.mjs'))
      .filter((name) => only.length === 0 || only.includes(name.replace('.test.mjs', '')))
      .sort()) {
      const { t, result } = createHarness();
      let crashed = null;
      try {
        const module = await import(pathToFileURL(path.join(DIR, file)).href);
        await module.default(t, db);
      } catch (error) {
        crashed = error;
      }
      const { passed, failures } = result();
      const label = file.replace('.test.mjs', '');
      if (crashed || failures.length > 0 || passed === 0) {
        failed += 1;
        console.log(`✗ ${label}: ${passed} ناجح، ${failures.length} فاشل${passed === 0 && !crashed && failures.length === 0 ? ' — صفر فحوص' : ''}`);
        for (const failure of failures) console.log(`    ${failure}`);
        if (crashed) console.log(`    رمى: ${crashed.stack ?? crashed}`);
      } else {
        console.log(`✓ ${label}: ${passed} فحص`);
      }
    }
  } catch (error) {
    failed += 1;
    console.log(`✗ الحزمة: ${error.message}`);
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
