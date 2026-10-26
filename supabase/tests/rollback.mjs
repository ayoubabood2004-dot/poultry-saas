// مشغّل التراجع (FOUNDATION ٨٢٠، ٨٧٦؛ الخطّة WP0 ٣): «التراجع الورقي كذب مرّتين». سطر «تراجع:» بكل هجرة يسمّي
// rollback_NNNN.sql أو يكول «إضافية فقط»، والحزمة تصدّقه بالكتالوج نفسه: الهجرة ثقيلة إذا غيّرت شي كان موجوداً قبلها
// (عمود أو قيد أو مشغّل أو سياسة بجدول قديم، أو جسم دالّة قديمة أو صلاحيتها، أو أزالت شي)، وإعادة كتابة دوالّ verify_*
// للقراءة بس ما تنحسب. الثقيلة لازم إلها ملف تراجع، وكل ملف ينفحص بقاعدة جديدة: الهجرات لحد قبلها، ثم هي، ثم بذرة من
// الدوالّ الحقيقية، ثم ملف التراجع ← الكتالوج = اللي قبل الهجرة بالضبط، ثم الهجرة مرّة ثانية ← الكتالوج = اللي بعدها
// بالضبط، وكل verify_* صفر. (الخطّة تكول «كل الهجرات»؛ تراجع هجرة قبل الأخيرة فوك هجرات بعدها ما إله معنى، فالقاعدة
// تقف عندها.) 0001–0003 انطبقت بالإنتاج قبل هالقاعدة وتراجعها ورقي كما كتبته: معفيّة بالاسم.
import { snapshot, snapshotDiff } from './snapshot.mjs';

export const LEGACY_THROUGH = 3;
// من WP2 (0005) كل حزمة بيها هجرة ثقيلة: صفر ملف تراجع جرى = فحص على صفر حالات، مو نجاح (FOUNDATION ٨٣٦).
export const ROLLBACKS_REQUIRED_FROM = 5;

/** آخر هجرة برقمها وكم ملف تراجع جرى: رسالة الفشل إذا من 0005 وصفر ملف، وإلا null. */
export function zeroRollbacksProblem(latest, ran) {
  return latest >= ROLLBACKS_REQUIRED_FROM && ran === 0 ? `آخر هجرة ${latest} وصفر ملف تراجع جرى — فحص على صفر حالات مو نجاح` : null;
}

/** سطر «تراجع:» من رأس الهجرة: { kind: 'legacy' | 'file' | 'additive' | 'missing', file? }. */
export function declaredRollback(name, text) {
  const number = Number(name.slice(0, 4));
  if (number <= LEGACY_THROUGH) return { kind: 'legacy' };
  const header = [];
  for (const raw of text.replace(/^\u{FEFF}/u, '').split(/\r?\n/u)) {
    const line = raw.trim();
    if (line === '') continue;
    if (!line.startsWith('--')) break;
    header.push(line);
  }
  const line = header.find((entry) => entry.includes('تراجع:')) ?? '';
  const named = /\brollback_(\d{4})\.sql\b/u.exec(line);
  if (named) return { kind: 'file', file: named[0], number: Number(named[1]) };
  if (/تراجع:\s*إضافية فقط/u.test(line)) return { kind: 'additive' };
  return { kind: 'missing' };
}

/**
 * مشاكل سطر «تراجع:» بالكتالوج نفسه، لهجرة وحدة (المشغّل وضابطه ينادونها هي، فكسرها يبين بالضابط): سطر ناقص، و«إضافية
 * فقط» وهي غيّرت الموجود (changes من heavyChanges). ملف التراجع المسمّى يجري برّا.
 */
export function rollbackDeclarationProblems(name, declared, changes) {
  if (declared.kind === 'missing') return [`${name}: سطر «تراجع:» ما يسمّي ملفاً ولا يكول «إضافية فقط»`];
  if (declared.kind === 'additive' && changes.length) return [`${name}: «إضافية فقط» وهي غيّرت الموجود (${changes.length}): ${changes.slice(0, 4).join(' | ')}`];
  return [];
}

const tableKey = (ns, name) => `${ns}.${name}`;

/**
 * شنو غيّرت الهجرة من الموجود قبلها: كل عنصر كان بالصورة وراح (تغيّر أو انشال)، عدا دوالّ verify_*، وكل عنصر انضاف
 * لجدول كان موجوداً (عمود، قيد، مشغّل، سياسة). الفهرس الجديد على جدول قديم إضافة (ينشال بلا أثر).
 */
export function heavyChanges(before, after) {
  const tables = (before.relations ?? []).filter((r) => ['r', 'p'].includes(r[2]));
  const names = new Set(tables.map((r) => r[1]));
  const qualified = new Set(tables.map((r) => tableKey(r[0], r[1])));
  const regclass = new Set(tables.map((r) => (r[0] === 'public' ? r[1] : tableKey(r[0], r[1]))));
  const reasons = [];
  for (const section of Object.keys(before)) {
    const kept = new Set((after[section] ?? []).map((x) => JSON.stringify(x)));
    for (const element of before[section] ?? []) {
      if (kept.has(JSON.stringify(element))) continue;
      if (section === 'functions' && String(element[1]).startsWith('verify_')) continue;
      reasons.push(`${section}: ${section === 'functions' ? `${element[0]}.${element[1]}(${element[2]})` : JSON.stringify(element).slice(0, 120)} تغيّر أو انشال`);
    }
  }
  const old = new Set();
  for (const section of Object.keys(before)) for (const element of before[section] ?? []) old.add(`${section}:${JSON.stringify(element)}`);
  const added = (section) => (after[section] ?? []).filter((element) => !old.has(`${section}:${JSON.stringify(element)}`));
  for (const element of added('columns')) if (names.has(element[0])) reasons.push(`عمود ${element[0]}.${element[1]} انضاف لجدول قديم`);
  for (const element of added('constraints')) if (regclass.has(element[0])) reasons.push(`قيد ${element[1]} انضاف لجدول قديم ${element[0]}`);
  for (const element of added('policies')) if (names.has(element[0])) reasons.push(`سياسة ${element[1]} انضافت لجدول قديم ${element[0]}`);
  for (const element of added('triggers')) {
    const on = /\bON\s+(\S+)/u.exec(element[0])?.[1];
    if (on && qualified.has(on)) reasons.push(`مشغّل انضاف لجدول قديم ${on}`);
  }
  return reasons;
}

/** هجرة بدور postgres (مو خارق، مثل الإنتاج) بمعاملة وحدة تثبت أو ترجع. */
export async function applySql(client, sql, label) {
  await client.query('begin');
  try {
    await client.query('set local role postgres');
    await client.query(sql);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw new Error(`${label} فشل: ${error.message}`, { cause: error });
  }
}

/**
 * كل verify_* بـpublic بمفتاح الخادم: الأسماء والمخالفات. كل صفّ violations غير الصفر مخالفة، وNULL هم (NULL <> 0 مو صحّ،
 * فـ«where violations <> 0» كان يشيل الصفّ: sum فارغ يخبّي فرقاً)، ودالّة بلا صفوف ما فحصت شي (FOUNDATION ٨٣٦).
 */
export async function verifyAll(db) {
  return db.asService(async (q) => {
    const fns = (await q("select p.proname as name from pg_proc p where p.pronamespace = 'public'::regnamespace and left(p.proname, 7) = 'verify_' order by 1")).rows.map((r) => r.name);
    const bad = [];
    for (const fn of fns) {
      const rows = (await q(`select check_name, violations::text as violations from public.${fn}()`)).rows;
      if (rows.length === 0) bad.push(`${fn}: صفر صفوف — فحص على صفر قيم مو نجاح`);
      for (const row of rows) {
        if (row.violations !== '0') bad.push(`${fn}.${row.check_name} = ${row.violations ?? 'NULL'}`);
      }
    }
    if (fns.length === 0) bad.push('ماكو ولا دالّة verify_* — فحص على صفر دوالّ مو نجاح');
    return { fns, bad };
  });
}

/**
 * حالة تراجع وحدة بقاعدة جديدة. migrations: الهجرات لحد الهجرة المفحوصة وياها (آخر وحدة)، و{ fresh } يرجّع عميلاً بقاعدة
 * فارغة جاهزة بالقالب ومعه makeDb، وseed(db) يزرع من الدوالّ الحقيقية. يرجّع المخالفات (فارغة = التراجع صادق).
 */
export async function rollbackCase({ fresh, migrations, rollbackSql, seed }) {
  const target = migrations.at(-1);
  const problems = [];
  const { client, db, close } = await fresh();
  try {
    for (const migration of migrations.slice(0, -1)) await applySql(client, migration.text, migration.name);
    const before = await snapshot(client);
    await applySql(client, target.text, target.name);
    const after = await snapshot(client);
    await seed(db);
    await applySql(client, rollbackSql, `تراجع ${target.name}`);
    const undone = snapshotDiff(before, await snapshot(client));
    if (undone.length) problems.push(`بعد التراجع الكتالوج مو مثل قبل ${target.name} (${undone.length} فرق): ${undone.slice(0, 5).join(' | ')}`);
    await applySql(client, target.text, `${target.name} بعد التراجع`);
    const redone = snapshotDiff(after, await snapshot(client));
    if (redone.length) problems.push(`إعادة ${target.name} بعد التراجع ما رجّعت كتالوجها (${redone.length} فرق): ${redone.slice(0, 5).join(' | ')}`);
    const { bad } = await verifyAll(db);
    if (bad.length) problems.push(`الثوابت بعد التراجع والإعادة: ${bad.join('، ')}`);
  } catch (error) {
    problems.push(error.message);
  } finally {
    await close();
  }
  return problems;
}
