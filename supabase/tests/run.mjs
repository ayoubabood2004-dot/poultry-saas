// حزمة بوستغريس الحقيقية (FOUNDATION، «الحرّاس والفحوص»): بوستغريس 17 مؤقّت من embedded-postgres
// (بلا تنصيب بالنظام)، بقالب Supabase المقيس على الإنتاج (bootstrap.sql)، والهجرات تنطبق مرّتين
// بدور postgres (مو خارق، مثل الإنتاج)، وبعدها كل supabase/tests/*.test.mjs. البيانات بمجلّد مؤقّت ينمسح.
// node supabase/tests/run.mjs [اسم…] ← يشغّل هذول الفحوص بس.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHarness } from '../../scripts/tests/harness.mjs';

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

// صورة الكتالوج اللي تصنعه الهجرات: الجداول وأعمدتها وقيودها وفهارسها وسياساتها ومشغّلاتها، والدوالّ بنصّها
// وإعداداتها، والصلاحيات (الجداول والدوالّ والمخطّطات والافتراضية). بالأسماء والتعريفات، بلا oid.
const SNAPSHOT_SQL = `
with ns as (select oid, nspname from pg_namespace where nspname in ('public', 'private'))
select jsonb_build_object(
  'relations', (select jsonb_agg(jsonb_build_array(ns.nspname, c.relname, c.relkind, c.relrowsecurity, c.relacl::text, c.reloptions::text) order by 1)
    from pg_class c join ns on ns.oid = c.relnamespace),
  'columns', (select jsonb_agg(jsonb_build_array(c.relname, a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid)) order by 1)
    from pg_attribute a join pg_class c on c.oid = a.attrelid join ns on ns.oid = c.relnamespace
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attnum > 0 and not a.attisdropped),
  'constraints', (select jsonb_agg(jsonb_build_array(c.conrelid::regclass::text, c.conname, pg_get_constraintdef(c.oid)) order by 1)
    from pg_constraint c join ns on ns.oid = c.connamespace),
  'indexes', (select jsonb_agg(pg_get_indexdef(i.indexrelid) order by 1)
    from pg_index i join pg_class c on c.oid = i.indrelid join ns on ns.oid = c.relnamespace),
  'policies', (select jsonb_agg(jsonb_build_array(tablename, policyname, permissive, roles::text, cmd, qual, with_check) order by 1)
    from pg_policies where schemaname in ('public', 'private')),
  'triggers', (select jsonb_agg(pg_get_triggerdef(g.oid) order by 1)
    from pg_trigger g join pg_class c on c.oid = g.tgrelid join ns on ns.oid = c.relnamespace where not g.tgisinternal),
  'functions', (select jsonb_agg(jsonb_build_array(ns.nspname, p.proname, oidvectortypes(p.proargtypes), md5(p.prosrc), p.prosecdef, p.provolatile, p.proconfig::text, p.proacl::text) order by 1)
    from pg_proc p join ns on ns.oid = p.pronamespace),
  'schemas', (select jsonb_agg(jsonb_build_array(nspname, nspacl::text) order by 1) from pg_namespace where nspname in ('public', 'private')),
  'default_acl', (select jsonb_agg(jsonb_build_array(pg_get_userbyid(defaclrole), coalesce(n.nspname, ''), defaclobjtype, defaclacl::text) order by 1)
    from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace)
) as snapshot`;

async function snapshot(client) {
  return (await client.query(SNAPSHOT_SQL)).rows[0].snapshot;
}

/** الفروق بين صورتين، قسماً قسماً: كل عنصر بوحدة وما بالثانية. */
export function snapshotDiff(before, after) {
  const out = [];
  for (const section of Object.keys({ ...before, ...after })) {
    const a = new Set((before[section] ?? []).map((x) => JSON.stringify(x)));
    const b = new Set((after[section] ?? []).map((x) => JSON.stringify(x)));
    for (const x of a) if (!b.has(x)) out.push(`${section} −${x}`);
    for (const x of b) if (!a.has(x)) out.push(`${section} +${x}`);
  }
  return out;
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

  const only = process.argv.slice(2);
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

    const files = migrationFiles();
    // مرّتين: الهجرة اللي ما تنعاد بأمان تكسر أوّل إعادة نشر، والمرّة الثانية لازم ما تغيّر الكتالوج.
    await applyMigrations(client, files, 1);
    const first = await snapshot(client);
    await applyMigrations(client, files, 2);
    const drift = snapshotDiff(first, await snapshot(client));
    if (drift.length) throw new Error(`المرّة الثانية غيّرت الكتالوج:\n    ${drift.slice(0, 10).join('\n    ')}`);
    // الصورة نفسها تمسك التغيير: تعديل صغير بمعاملة ترجع لازم يبين.
    const probeDrift = await inRollback(client, async () => {
      await client.query('set local role postgres');
      await client.query('alter function public.app_today() set statement_timeout = 1000');
      return snapshotDiff(first, await snapshot(client));
    });
    if (probeDrift.length === 0) throw new Error('صورة الكتالوج ما مسكت تعديل الضابط: مقارنة المرّتين ما تنصدّق');
    console.log(`✓ القالب مفتوح قبل الهجرات مثل الإنتاج، و${files.length} هجرة انطبقت مرّتين بلا فرق بالكتالوج`);

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
