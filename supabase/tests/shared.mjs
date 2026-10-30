// فحوص مشتركة لكل نوع مستند (الخطّة WP0 ٦): كل حزمة تسجّل نوعها هنا وتاخذ نفس البراهين، مو كل وحدة تكتب نسختها.
// - sameRefRace (FOUNDATION ٨٧٣، ٨٨٦): جلستان ترحّلان نفس المستند بنفس المرجع بنفس اللحظة ← ترحيل واحد ورقم واحد ونتيجتان
//   متطابقتان (الثانية نامت على فهرس rpc_refs لحد ما الأولى حسمت)؛ ونفس المرجع بنسخة ثانية ← ref_reused؛ والمرحَّل بمرجع
//   جديد ← not_draft.
// - draftWriteLock (FOUNDATION ٥٢٦): بدور authenticated: إدخال رأس «posted»، وقلب مسوّدة لـposted، وتعديل سطر (وصفّ مبلغ إذا
//   النوع بيه) لمستند مرحَّل ← كلها ترفض برفض المسوّدة نفسه: سياسة RLS (42501 «row-level security») أو حارس برمزه
//   (not_draft، frozen_column، append_only)، أو صفر صفوف لصفّ موجود فعلاً (صاحب الجدول بلا RLS يوصله). وكل أمر ويّاه ضابط
//   بنفس شكله على المسوّدة ينجح: إدخال رأس draft، وحالة المسوّدة draft كما هي، وتعديل سطرها ومبلغها. المراجعة العدائية:
//   «يرفض» كان أي خطأ، فجدول أو عمود بالغلط، أو NOT NULL ناقص، أو معرّف فارغ (where id = null) يعبر بلا ما يشتغل حارس.
//
// النوع (kind): { name, user, draft(), post(id, version, ref) → { sql, params }, postings(id) → { count, numbers },
//   posted() → { id, lineId }, insertHeader(status) و setStatus(doc, status) و editLine(doc) و editAmount?(doc) → { sql, params } }.
// draft() يرجّع { id, version, lineId } مثبَّتاً (المسوّدة تنكتب بدوالّ النوع أو سياساته الحقيقية).
import { randomUUID } from 'node:crypto';

/**
 * سباق جلستين (درس 2026-10-25: كل ضمان قفل يثبته فحص بجلستين): الأولى تنفّذ وتبقى مفتوحة، والثانية تنطلق (تنحبس أو تخلص)، والأولى
 * تثبّت (أو ترجع بـfirst.rollback)، والثانية تكمل وتثبّت إذا نجحت. الدور authenticated إلا role (postgres لصاحب الجداول).
 */
export async function race(db, first, second) {
  const one = await db.session(first.user, { role: first.role ?? 'authenticated' });
  const two = await db.session(second.user, { role: second.role ?? 'authenticated' });
  try {
    if (first.role === 'postgres') await one.run("set local lock_timeout = '10s'");
    const a = await one.run(first.sql, first.params);
    const pending = two.run(second.sql, second.params);
    const state = await db.settle(pending, two.pid);
    if (first.rollback) await one.rollback();
    else await one.commit();
    const b = await pending;
    await two.commit();
    return { first: a.ok ? 'ok' : a.error, state, second: b.ok ? 'ok' : b.error, rows: [a.rows, b.rows] };
  } finally {
    await one.rollback();
    await two.rollback();
  }
}

/** 'ok' (صفّ واحد أو أكثر)، 'zero_rows'، أو رسالة الخطأ. بمعاملة ترجع. */
async function attempt(db, user, { sql, params }) {
  const outcome = await tryStatement((fn) => db.asUser(user, fn), { sql, params });
  return outcome.kind === 'error' ? outcome.message : outcome.kind;
}

/** نتيجة أمر بمعاملة ترجع: { kind: 'ok' | 'zero_rows' } أو { kind: 'error', code, message }. run(fn) = db.asUser أو asOwner. */
async function tryStatement(run, { sql, params }) {
  try {
    const result = await run((q) => q(sql, params));
    return { kind: result.rowCount > 0 ? 'ok' : 'zero_rows' };
  } catch (error) {
    return { kind: 'error', code: error.code ?? '', message: error.message };
  }
}

const GUARD_CODES = new Set(['not_draft', 'frozen_column', 'append_only']);

/** رفض المسوّدة نفسه: سياسة RLS، أو حارس الرأس أو السطر أو الدفتر برمزه. غيرها (42P01، 42703، 23502…) أمر غلط مو رفض. */
function draftRejection(outcome) {
  if (outcome.kind !== 'error') return false;
  return (outcome.code === '42501' && /row-level security/u.test(outcome.message)) || (outcome.code === 'P0001' && GUARD_CODES.has(outcome.message));
}

const shown = (outcome) => (outcome.kind === 'error' ? `${outcome.code} ${outcome.message}` : outcome.kind);

export async function sameRefRace(t, db, kind) {
  const doc = await kind.draft();
  const ref = randomUUID();
  const call = kind.post(doc.id, doc.version, ref);
  const first = await db.session(kind.user);
  const second = await db.session(kind.user);
  let firstState;
  let secondState;
  let one;
  let two;
  try {
    const p1 = first.run(call.sql, call.params);
    firstState = await db.settle(p1, first.pid);
    if (firstState !== 'finished') {
      // الأولى محبوسة على قفل غريب: ماكو سباق نفحصه، والانتظار يعلّق الحزمة.
      t.eq(firstState, 'finished', `${kind.name}: الجلسة الأولى رحّلت بلا انتظار`);
      return;
    }
    const p2 = second.run(call.sql, call.params);
    secondState = await db.settle(p2, second.pid);
    one = await p1;
    await first.commit();
    two = await p2;
    await second.commit();
  } finally {
    await first.rollback();
    await second.rollback();
  }
  t.eq(firstState, 'finished', `${kind.name}: الجلسة الأولى رحّلت (بلا تثبيت بعد)`);
  t.eq(secondState, 'blocked', `${kind.name}: الثانية بنفس المرجع نامت لحد ما الأولى حسمت`);
  t.ok(one?.ok && two?.ok, `${kind.name}: الجلستان رجعتا بلا خطأ (${one?.error ?? ''} ${two?.error ?? ''})`);
  t.same(two?.rows, one?.rows, `${kind.name}: نفس المرجع مرّتين = نفس النتيجة بالضبط`);
  t.same(await kind.postings(doc.id), { count: 1, numbers: 1 }, `${kind.name}: ترحيل واحد ورقم واحد`);
  const reused = kind.post(doc.id, doc.version + 1, ref);
  t.eq(await attempt(db, kind.user, reused), 'ref_reused', `${kind.name}: نفس المرجع بنسخة ثانية ← ref_reused`);
  const replay = kind.post(doc.id, doc.version, randomUUID());
  t.eq(await attempt(db, kind.user, replay), 'not_draft', `${kind.name}: المرحَّل بمرجع جديد ← not_draft`);
}

export async function draftWriteLock(t, db, kind) {
  const posted = await kind.posted();
  const draft = await kind.draft();
  const asUser = (fn) => db.asUser(kind.user, fn);
  // صاحب الجدول (postgres) يتجاوز RLS، وحارس الرأس (current_user = authenticated) ما يشتغل له: يوصل الصفّ إذا موجود.
  const asOwner = (fn) => db.asOwner(fn, kind.user);
  // [البند، الأمر اللي لازم يرفض، ضابطه بنفس الشكل على المسوّدة]
  const tries = [
    ['إدخال رأس posted', kind.insertHeader('posted'), kind.insertHeader('draft')],
    ['قلب مسوّدة لـposted', kind.setStatus(draft, 'posted'), kind.setStatus(draft, 'draft')],
    ['تعديل سطر مستند مرحَّل', kind.editLine(posted), kind.editLine(draft)],
    ...(kind.editAmount ? [['تعديل مبلغ مستند مرحَّل', kind.editAmount(posted), kind.editAmount(draft)]] : []),
  ];
  for (const [label, rejected, control] of tries) {
    const outcome = await tryStatement(asUser, rejected);
    let refused = draftRejection(outcome);
    if (outcome.kind === 'zero_rows') {
      // صفر صفوف رفض بس إذا الصفّ موجود: صاحب الجدول يلقاه (أو يرفضه حارس السطر نفسه)؛ معرّف فارغ صفر عنده هم.
      const reach = await tryStatement(asOwner, rejected);
      refused = reach.kind === 'ok' || draftRejection(reach);
    }
    t.ok(refused, `${kind.name}: ${label} يرفض برفض المسوّدة (${shown(outcome)})`);
    const positive = await tryStatement(asUser, control);
    t.eq(shown(positive), 'ok', `${kind.name}: ضابط «${label}»: نفس الأمر على المسوّدة ينجح`);
  }
}
