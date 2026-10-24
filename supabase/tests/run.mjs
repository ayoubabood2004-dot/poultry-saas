// حزمة بوستغريس الحقيقية (FOUNDATION، «الحرّاس والفحوص»): بوستغريس 17 مؤقّت من embedded-postgres
// (بلا تنصيب بالنظام)، بقالب Supabase المقيس على الإنتاج (bootstrap.sql)، والهجرات تنطبق مرّتين
// بدور postgres (مو خارق، مثل الإنتاج)، وبعدها كل supabase/tests/*.test.mjs. البيانات بمجلّد مؤقّت ينمسح.
// node supabase/tests/run.mjs [اسم…] ← يشغّل هذول الفحوص بس.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
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

/**
 * عميل بهويّة: كل استعلام بمعاملة تنتهي بتراجع (الفحص ما يسيب أثر)، بدور authenticated أو anon
 * ومطالبات JWT مثل PostgREST بالضبط (request.jwt.claims)، فـauth.uid() وRLS يشتغلون مثل الإنتاج.
 */
export function makeDb(client) {
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
  const user = (userId) => ({ sub: userId, role: 'authenticated' });
  return {
    /** استعلام بالهويّة الإدارية (supabase_admin) للتجهيز: يبقى أثره لحد نهاية الحزمة. */
    admin: (text, params) => client.query(text, params),
    /** كمستخدم داخل: sub = userId والدور authenticated. يرجع إلا ويّا { commit: true }. */
    asUser: (userId, fn, options) => inRole('authenticated', user(userId), fn, options),
    /** بلا دخول: مفتاح anon. */
    asAnon: (fn) => inRole('anon', { role: 'anon' }, fn),
    /** صاحب الهجرات (postgres، مو خارق)، ويّا مطالبات مستخدم إذا انطى (لدوالّ private بهويّته). */
    asOwner: (fn, userId) => inRole('postgres', userId ? user(userId) : {}, fn),
  };
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
    client = server.getPgClient('postgres', '127.0.0.1');
    await client.connect();
    await client.query(readFileSync(path.join(DIR, 'bootstrap.sql'), 'utf8'));

    const files = migrationFiles();
    // مرّتين: الهجرة اللي ما تنعاد بأمان تكسر أوّل إعادة نشر.
    await applyMigrations(client, files, 1);
    await applyMigrations(client, files, 2);
    console.log(`✓ القالب و${files.length} هجرة انطبقت مرّتين`);

    const db = makeDb(client);
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
