// تزامن المخزون بجلستين حقيقيتين (الخطّة WP4، D6، FOUNDATION ٨٧٣، ٨٨٦؛ درس 2026-10-25: كل ضمان قفل يثبته فحص بجلستين):
// C1 سحبان بنفس اللحظة من دفعة 100 (60 و60): واحد يرحّل والثاني insufficient_stock والدفعة 40؛ C9 سطر ينعدّل من جلسة ثانية
// بعد المعاينة ← stale_draft؛ C10 أوّل ترحيلين لنفس (المادّة، المخزن) ← صفّ رصيد واحد؛ C13 تحويلان متعاكسان (A→B بـX وY وB→A
// بـY وX) بلا قفل متبادل؛ C5 أرقام TR متتالية؛ C14 sameRefRace للتحويل والافتتاح (ترحيل واحد ورقم واحد، ونفس المرجع بنسخة ثانية
// ref_reused، والمرحَّل بمرجع جديد not_draft). ومن مراجعة WP4 الثانية: تاريخ ينعدّل والترحيل ينتظر قفل المستند ← stale_draft (مو
// ترحيل بتاريخ ما انفحص)؛ تحويلان بلا رصيد مشترك بمرايا جذورها متقاطعة بلا 40P01 (الدفعات for no key update)؛ حذف سطر وتعديله
// بلا 40P01 (السطر قبل رأسه)؛ وملفات التراجع تقفل جداولها قبل ما تعدّ المستندات. وWP5: صرف وتحويل بـ3,000 كغم بنفس اللحظة من
// دفعة ذرة 4,000 كغم ← واحد يرحّل والثاني insufficient_stock والدفعة 1,000 كغم بـ450,000.00 (D6)؛ وتحويل يترحّل والجرد ينتظر
// قفل الرصيد ← count_stale (C11، E53) مو نقص محسوب على رصيد قديم. ومراجعة WP5: دوالّ الجرد تقفل سطوره وكلفه قبل رأسه (C15، بلا
// 40P01 ويّا تعديل العادّ أو كلفة المدير)، والترحيل بزيادة ينتظر عدّاد الترتيب قبل ما يقرا دفعة القياس (C16، E45)، حتى بمنشأة
// بلا دفعات وأوّل افتتاح لسه ما ثبت (C17). والمراجعة الثالثة: كلفة جديدة تقفل السطر قبل الرأس فما تتعاكس ويّا حذف ينتظر (C15)، وجرد
// أقدم ينتظر الأحدث على الرصيد ثم count_superseded (C19)، والجرد بنقص بس ما ياخذ عدّاد الترتيب (C20). والرابعة: إلغاء جرد أقدم
// وترحيل أحدث انحسب على تسويته سوا بالاتّجاهين (C21).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { race, sameRefRace } from './shared.mjs';
import { lotsOf, makeStockOrg, openingDraft, postedOpening, transferDraft } from './stock-kit.mjs';

const TODAY = '2026-10-30';
const GO_LIVE = '2026-10-20';
const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const id = (n) => `d7200000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477097200${String(n).padStart(2, '0')}`;

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

/**
 * ترتيب الأقفال بجلسة بديلة (قالب ledger-locks وledger-rules): البديلة (صاحب الجداول) تمسك first، وa (وb) ينطلقون وينحبسون،
 * وبعدها البديلة تطلب last: «finished» = ولا وحد منهم ماسكه وهو منحبس. بالترتيب الغلط البديلة تنحبس عليه وهو عليها (40P01):
 * الضحيّة يرجع خطأه ويرجع كلّه، وبعده البديلة تكمل («late» أو خطؤها). a.role postgres لضابط يقفل مباشرةً، وa.before أوامر قبل.
 * lockLast أمر الطلب الأخير إذا غير الأوّل (صفّ السطر ثم رأسه، مثل حارس السطر).
 */
async function lockOrderRace(db, { holder, first, last, lock, lockLast, a, b }) {
  const hold = await db.session(holder, { role: 'postgres' });
  const opened = [];
  const out = {};
  try {
    await hold.run("set local lock_timeout = '10s'");
    out.held = (await hold.run(lock, first)).ok;
    const pending = [];
    for (const [key, spec] of [['a', a], ['b', b]]) {
      if (!spec) continue;
      const session = await db.session(spec.user, { role: spec.role ?? 'authenticated' });
      opened.push(session);
      if (spec.role === 'postgres') await session.run("set local lock_timeout = '10s'");
      for (const [sql, params] of spec.before ?? []) await session.run(sql, params);
      const promise = session.run(spec.sql, spec.params);
      out[key] = await db.settle(promise, session.pid);
      pending.push([key, session, promise]);
    }
    const lastPending = hold.run(lockLast ?? lock, last);
    out.last = await db.settle(lastPending, hold.pid);
    if (out.last === 'finished') await hold.commit();
    for (const [key, session, promise] of pending) {
      const result = await promise;
      out[`${key}2`] = result.ok ? 'ok' : result.error;
      if (result.ok) await session.commit();
      else await session.rollback();
    }
    if (out.last !== 'finished') {
      const result = await lastPending;
      out.last = result.ok ? 'late' : result.error;
    }
    return out;
  } finally {
    for (const session of opened) await session.rollback();
    await hold.rollback();
  }
}

/** المحرِّر يعدّل الرأس ويبقى مفتوحاً، والمرحِّل ينطلق وينحبس على قفل المستند، والمحرِّر يثبّت، والمرحِّل يكمل (ويثبّت إذا نجح). */
async function editWhilePosting(db, { editor, editSql, editParams, poster, postSql, postParams }) {
  const ed = await db.session(editor);
  const po = await db.session(poster);
  try {
    const edit = await ed.run(editSql, editParams);
    const pending = po.run(postSql, postParams);
    const state = await db.settle(pending, po.pid);
    await ed.commit();
    const post = await pending;
    if (post.ok) await po.commit();
    return { edit: edit.ok ? 'ok' : edit.error, state, post: post.ok ? 'ok' : post.error };
  } finally {
    await ed.rollback();
    await po.rollback();
  }
}

/** الماسك يقفل صفّاً، والأوّل والثاني ينطلقون وينحبسون، والماسك يثبّت؛ اللي يخلص أوّلاً يرجع (يحرّر عدّاد الرقم) والثاني يكمل. */
async function threeWay(db, { holderUser, holdSql, holdParams, first, second }) {
  const hold = await db.session(holderUser, { role: 'postgres' });
  const s1 = await db.session(first.user);
  const s2 = await db.session(second.user);
  const out = {};
  try {
    await hold.run("set local lock_timeout = '20s'");
    out.held = (await hold.run(holdSql, holdParams)).ok;
    const p1 = s1.run(first.sql, first.params);
    out.first = await db.settle(p1, s1.pid);
    const p2 = s2.run(second.sql, second.params);
    out.second = await db.settle(p2, s2.pid);
    await hold.commit();
    const [key, result] = await Promise.race([p1.then((r) => ['first', r]), p2.then((r) => ['second', r])]);
    out[`${key}2`] = result.ok ? 'ok' : result.error;
    await (key === 'first' ? s1 : s2).rollback();
    const rest = key === 'first' ? ['second', await p2] : ['first', await p1];
    out[`${rest[0]}2`] = rest[1].ok ? 'ok' : rest[1].error;
    return out;
  } finally {
    await s1.rollback();
    await s2.rollback();
    await hold.rollback();
  }
}

async function postTransferNow(db, user, from, to, day, itemId, qty) {
  const draft = await transferDraft(db, user, from, to, day, [{ item: itemId, qty }]);
  const done = await db.session(user);
  try {
    const result = await done.run("select public.post_transfer($1, $2, public.preview_transfer($1) ->> 'plan', gen_random_uuid()) as result", [draft.id, draft.version]);
    if (!result.ok) throw new Error(`postTransferNow: ${result.error}`);
    await done.commit();
  } finally {
    await done.rollback();
  }
}

const POST = 'select public.post_transfer($1, $2, public.preview_transfer($1) ->> \'plan\', gen_random_uuid()) as result';

async function scenario(t, db) {
  const S = await makeStockOrg(db, { name: 'مزرعة التزامن', id, phone, goLive: GO_LIVE });
  const { users: U, W } = S;
  const item = (label) => S.one(U.owner, "insert into public.items (name, kind, base_unit) values ($1, 'fuel', 'L') returning id", [label]);

  // ── C1 (D6): دفعة 100 وسحبان 60 بنفس اللحظة من جلستين ─────────────────────────────────────────────────────────
  const X = await item('كاز السباق');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: X, qty: 100, value: 75000 }]);
  const a = await transferDraft(db, U.storekeeper, W.general, W.raw, TODAY, [{ item: X, qty: 60 }]);
  const b = await transferDraft(db, U.manager, W.general, W.farm1, TODAY, [{ item: X, qty: 60 }]);
  const c1 = await race(db, { user: U.storekeeper, sql: POST, params: [a.id, a.version] }, { user: U.manager, sql: POST, params: [b.id, b.version] });
  t.same([c1.first, c1.state, c1.second], ['ok', 'blocked', 'insufficient_stock'], 'C1: الأوّل يرحّل، والثاني ينام على رصيد المادّة ثم insufficient_stock');
  t.same((await lotsOf(db, X, W.general)).map((l) => [l.qty_left, l.value_left]), [['40', '30000']], 'C1: الدفعة 40 لتراً بقيمتها، ما نزلت تحت الصفر');

  // ── C9 (R8): سطر ينعدّل من جلسة ثانية بعد المعاينة ← stale_draft ──────────────────────────────────────────────────
  const c9 = await transferDraft(db, U.storekeeper, W.general, W.raw, TODAY, [{ item: X, qty: 10 }]);
  const previewed = (await db.asUser(U.storekeeper, (q) => q('select public.preview_transfer($1) as p', [c9.id]))).rows[0].p.version;
  await db.asUser(U.manager, (q) => q('update public.transfer_lines set qty_in_unit = 20 where doc_id = $1', [c9.id]), { commit: true });
  const stale = await db.asUser(U.storekeeper, (q) => q(POST, [c9.id, previewed])).then(() => 'ok', (error) => error.message);
  t.same([previewed, stale], [c9.version, 'stale_draft'], 'C9: المعاينة بنسخة، وتعديل سطر من جلسة ثانية بعدها ← stale_draft');

  // ── C10: أوّل ترحيلين لنفس (المادّة، المخزن الوجهة) بنفس اللحظة ← صفّ رصيد واحد ────────────────────────────────────
  const Y = await item('كاز الوجهة');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: Y, qty: 50, value: 37500 }]);
  await postedOpening(db, U.manager, W.general2, GO_LIVE, [{ item: Y, qty: 50, value: 37500 }]);
  const fromGeneral = await transferDraft(db, U.manager, W.general, W.farm2, TODAY, [{ item: Y, qty: 10 }]);
  const fromGeneral2 = await transferDraft(db, U.manager, W.general2, W.farm2, TODAY, [{ item: Y, qty: 10 }]);
  const c10 = await race(db, { user: U.manager, sql: POST, params: [fromGeneral.id, fromGeneral.version] }, { user: U.owner, sql: POST, params: [fromGeneral2.id, fromGeneral2.version] });
  const rowsAt = (await db.admin('select count(*)::int as n, trim_scale(sum(qty))::text as q from public.stock_balances where item_id = $1 and warehouse_id = $2', [Y, W.farm2])).rows[0];
  t.same([c10.first, c10.state, c10.second, rowsAt], ['ok', 'blocked', 'ok', { n: 1, q: '20' }], 'C10: الثاني ينام على إنشاء صفّ الرصيد ثم يكمل، وصفّ واحد بـ20 لتراً');

  // ── C13 (R4): تحويلان متعاكسان بمادّتين بنفس اللحظة بلا قفل متبادل ─────────────────────────────────────────────────
  const P = await item('مادّة أ');
  const Q = await item('مادّة ب');
  // بصمة المعاينة (stale_preview): كل تحويل يعاين قبل ما ينحبس، فمرآة الثاني ما لازم تدخل خطّة الأوّل. الحقل الثاني يفتتح أوّلاً
  // (دفعاته أقدم ترتيباً، فمرايا التحويل الأوّل تنسحب بعدها)، والتحويل الأوّل بتاريخ أمس (مرايا الثاني مستلمة اليوم، فمو مؤهّلة له).
  await postedOpening(db, U.manager, W.farm2, GO_LIVE, [{ item: P, qty: 100, value: 1000 }, { item: Q, qty: 100, value: 1000 }]);
  await postedOpening(db, U.manager, W.farm1, GO_LIVE, [{ item: P, qty: 100, value: 1000 }, { item: Q, qty: 100, value: 1000 }]);
  // جلسة بديلة تمسك صفّ الرصيد الأوّل بترتيب (المادّة، المخزن)، فالتحويلان ينحبسان نصّ الطريق وهم ماسكين اللي قفلوه قبله؛ وبعدها
  // البديلة تطلب الصفّ الأخير: إذا أيّ تحويل قفل بترتيب ثاني (معكوس، أو بترتيب سطوره) يكون ماسكه، فتنحبس البديلة عليه وهو عليها
  // (40P01). بالترتيب الصحيح يدهم فارغة من الأرصدة، فالبديلة تاخذه فوراً والاثنين يكملون. والضابط: نفس الطريقة بقفلين معكوسين
  // مباشرةً تطلع 40P01، فالفحص يقدر يفشل.
  const forward = await transferDraft(db, U.manager, W.farm1, W.farm2, '2026-10-29', [{ item: P, qty: 5 }, { item: Q, qty: 5 }]);
  const backward = await transferDraft(db, U.owner, W.farm2, W.farm1, TODAY, [{ item: Q, qty: 7 }, { item: P, qty: 7 }]);
  const [lowItem, highItem] = [P, Q].sort();
  const [lowStore, highStore] = [W.farm1, W.farm2].sort();
  const LOCK = 'select 1 from public.stock_balances where item_id = $1 and warehouse_id = $2 for update';
  const c13 = await lockOrderRace(db, {
    holder: U.scopedManager,
    first: [lowItem, lowStore],
    last: [highItem, highStore],
    lock: LOCK,
    a: { user: U.manager, sql: POST, params: [forward.id, forward.version] },
    b: { user: U.owner, sql: POST, params: [backward.id, backward.version] },
  });
  t.same(c13, { held: true, a: 'blocked', b: 'blocked', last: 'finished', a2: 'ok', b2: 'ok' }, 'C13: التحويلان المتعاكسان ينتظران الصفّ الأوّل وأيديهم فارغة، والبديلة تاخذ الأخير فوراً، والاثنين يكملون بلا 40P01');
  const control = await lockOrderRace(db, {
    holder: U.scopedManager,
    first: [lowItem, lowStore],
    last: [highItem, highStore],
    lock: LOCK,
    a: { user: U.owner, role: 'postgres', before: [[LOCK, [highItem, highStore]]], sql: LOCK, params: [lowItem, lowStore] },
  });
  t.ok(control.held && control.a === 'blocked' && control.last !== 'finished' && /deadlock/u.test(`${control.last} ${control.a2}`), `ضابط: قفل معكوس (الأخير ثم الأوّل) ضدّ البديلة يطلع 40P01، فالفحص يقدر يفشل (${JSON.stringify(control)})`);

  // ── C5: أرقام TR متتالية لتحويلين بنفس اللحظة (العدّاد آخر قفل) ─────────────────────────────────────────────────
  const R1 = await item('مادّة ج');
  const R2 = await item('مادّة د');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: R1, qty: 10, value: 100 }]);
  await postedOpening(db, U.manager, W.general2, GO_LIVE, [{ item: R2, qty: 10, value: 100 }]);
  const n1 = await transferDraft(db, U.manager, W.general, W.raw, TODAY, [{ item: R1, qty: 1 }]);
  const n2 = await transferDraft(db, U.owner, W.general2, W.raw, TODAY, [{ item: R2, qty: 1 }]);
  const c5 = await race(db, { user: U.manager, sql: POST, params: [n1.id, n1.version] }, { user: U.owner, sql: POST, params: [n2.id, n2.version] });
  const numbers = c5.rows.map((rows) => Number(rows[0].result.doc_no.split('-')[2]));
  t.same([c5.first, c5.second, numbers[1] - numbers[0]], ['ok', 'ok', 1], `C5: رقمان متتاليان (${numbers.join(' ثم ')})`);

  // ── C14 (D6): sameRefRace للتحويل والافتتاح ─────────────────────────────────────────────────────────────────
  const Z = await item('كاز المرجع');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: Z, qty: 100, value: 75000 }]);
  await sameRefRace(t, db, {
    name: 'التحويل',
    user: U.storekeeper,
    draft: async () => transferDraft(db, U.storekeeper, W.general, W.raw, TODAY, [{ item: Z, qty: 3 }]),
    post: (docId, version, ref) => ({ sql: 'select public.post_transfer($1, $2, public.preview_transfer($1) ->> \'plan\', $3) as result', params: [docId, version, ref] }),
    postings: async (docId) => (await db.admin("select count(*)::int as count, count(distinct doc_no)::int as numbers from public.transfers where id = $1 and status = 'posted'", [docId])).rows[0],
  });
  let fresh = 0;
  await sameRefRace(t, db, {
    name: 'الافتتاح',
    user: U.manager,
    draft: async () => {
      fresh += 1;
      return openingDraft(db, U.manager, W.general2, GO_LIVE, [{ item: await item(`افتتاح المرجع ${fresh}`), qty: 5, value: 500 }]);
    },
    post: (docId, version, ref) => ({ sql: 'select public.post_opening_stock($1, $2, $3) as result', params: [docId, version, ref] }),
    // الافتتاح بلا رقم (E12): «رقم واحد» هنا لحظة ترحيل وحدة لحركاته.
    postings: async (docId) =>
      (await db.admin("select (select count(*)::int from public.opening_docs where id = $1 and status = 'posted') as count, (select count(distinct created_at)::int from public.stock_moves where doc_id = $1) as numbers", [docId])).rows[0],
  });

  // ── التاريخ ينفحص بعد قفل المستند (مراجعة WP4 الثانية): الترحيل قرا التاريخ قبل القفل وفحصه، وتعديل التاريخ ثبت وهو ينتظر القفل
  // بنسخة معروفة سلفاً (+1)، فترحّل بتاريخ ما انفحص. هسه نفس النسخة بتاريخ غير اللي انفحص ← stale_draft والمسوّدة تبقى.
  const XO = await item('افتتاح التاريخ');
  const op = await openingDraft(db, U.manager, W.general, GO_LIVE, [{ item: XO, qty: 10, value: 1000 }]);
  const dateRaceOpening = await editWhilePosting(db, {
    editor: U.manager,
    editSql: "update public.opening_docs set on_date = '2026-10-29' where id = $1",
    editParams: [op.id],
    poster: U.manager,
    postSql: 'select public.post_opening_stock($1, $2, gen_random_uuid()) as result',
    postParams: [op.id, op.version + 1],
  });
  const opRow = (await db.admin('select status from public.opening_docs where id = $1', [op.id])).rows[0];
  t.same([dateRaceOpening.edit, dateRaceOpening.state, dateRaceOpening.post, opRow.status], ['ok', 'blocked', 'stale_draft', 'draft'], 'افتتاح انعدّل تاريخه لبعد يوم التشغيل والترحيل ينتظر: stale_draft، والمسوّدة باقية بلا دفعة');
  const XT = await item('تحويل التاريخ');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: XT, qty: 100, value: 10000 }]);
  const future = await transferDraft(db, U.storekeeper, W.general, W.raw, '2026-10-28', [{ item: XT, qty: 5 }]);
  const dateRaceTransfer = await editWhilePosting(db, {
    editor: U.storekeeper,
    editSql: "update public.transfers set moved_on = '2026-11-05' where id = $1",
    editParams: [future.id],
    poster: U.storekeeper,
    postSql: "select public.post_transfer($1, $2, public.preview_transfer($1) ->> 'plan', gen_random_uuid()) as result",
    postParams: [future.id, future.version + 1],
  });
  const futureRow = (await db.admin('select status, doc_no from public.transfers where id = $1', [future.id])).rows[0];
  t.same([dateRaceTransfer.state, dateRaceTransfer.post, futureRow.status, futureRow.doc_no], ['blocked', 'stale_draft', 'draft', null], 'تحويل انعدّل تاريخه للمستقبل والترحيل ينتظر: stale_draft بلا رقم ولا مرايا مستلمة بالمستقبل');

  // ── مرايا جذورها متقاطعة (مراجعة WP4 الثانية): المخزن العام فيه R1 (جذر) وM2 (جذره R2)، والعام الثاني فيه M1 (جذره R1) وR2. تحويل
  // من الثاني يسحب M1 ثم R2، وتحويل من الأوّل يسحب R1 ثم M2، بلا رصيد مشترك. مرآة M1 تأخذ key share على R1 (المفتاح الأجنبي
  // origin_lot_id)، وكان السحب يقفل R1 بـfor update فيتعارضان: 40P01. هسه for no key update، والاثنين يرحّلون.
  const X3 = await item('جذور متقاطعة');
  const o1 = await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: X3, qty: 100, value: 1000 }]);
  await postedOpening(db, U.manager, W.general2, GO_LIVE, [{ item: X3, qty: 100, value: 1000 }]);
  const R1lot = o1.result.lots[0].lot_id;
  await postTransferNow(db, U.manager, W.general, W.general2, TODAY, X3, 30);
  await postTransferNow(db, U.manager, W.general2, W.general, '2026-10-29', X3, 30);
  const fromSecond = await transferDraft(db, U.manager, W.general2, W.raw, TODAY, [{ item: X3, qty: 50 }]);
  const fromFirst = await transferDraft(db, U.owner, W.general, W.farm1, TODAY, [{ item: X3, qty: 90 }]);
  const crossed = await threeWay(db, {
    holderUser: U.scopedManager,
    holdSql: 'select 1 from public.stock_lots where id = $1 for update',
    holdParams: [R1lot],
    first: { user: U.owner, sql: POST, params: [fromFirst.id, fromFirst.version] },
    second: { user: U.manager, sql: POST, params: [fromSecond.id, fromSecond.version] },
  });
  t.same([crossed.held, crossed.first, crossed.second, crossed.first2, crossed.second2], [true, 'blocked', 'blocked', 'ok', 'ok'], 'تحويلان بمرايا جذورها متقاطعة وبلا رصيد مشترك: ينتظران R1 ثم يرحّلان بلا 40P01');

  // ── حذف سطر المسوّدة وتعديله المباشر بنفس اللحظة (مراجعة WP4 الثانية): التعديل يقفل السطر ثم مشغّله الرأس، والحذف كان يقفل الرأس
  // ثم السطر: 40P01. هسه الحذف يقفل السطر أوّلاً.
  const lineDraft = await transferDraft(db, U.storekeeper, W.general, W.raw, TODAY, [{ item: XT, qty: 1 }, { item: XT, qty: 2 }]);
  const lineRace = await threeWay(db, {
    holderUser: U.scopedManager,
    holdSql: 'select 1 from public.transfers where id = $1 for update',
    holdParams: [lineDraft.id],
    first: { user: U.storekeeper, sql: "select public.delete_draft_line('transfer', $1, $2) as result", params: [lineDraft.lines[0], lineDraft.version] },
    second: { user: U.manager, sql: 'update public.transfer_lines set qty_in_unit = 3 where id = $1', params: [lineDraft.lines[0]] },
  });
  t.same([lineRace.held, lineRace.first, lineRace.second, lineRace.first2, lineRace.second2], [true, 'blocked', 'blocked', 'ok', 'ok'], 'حذف سطر وتعديله بنفس اللحظة: الاثنان ينتظران ويكملان بلا 40P01');

  // ── D6 (WP5): صرف وتحويل بـ3,000 كغم بنفس اللحظة من دفعة ذرة 4,000 كغم بـ1,800,000.00 ─────────────────────────────────
  const rawSite = (await db.admin('select site_id from public.warehouses where id = $1', [W.raw])).rows[0].site_id;
  const raw2 = await S.one(U.owner, "insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن مواد أولية ثانٍ', 'raw') returning id", [S.divisions.feed_mill, rawSite]);
  const corn = S.I.corn;
  await postedOpening(db, U.manager, W.raw, GO_LIVE, [{ item: corn, qty: 4000, value: 1800000 }]);
  const upkeep = await S.one(U.accountant, "insert into public.expense_categories (name) values ('صيانة السباق') returning id");
  const useDoc = await db.asUser(
    U.manager,
    async (q) => {
      const docId = (await q('insert into public.stock_uses (warehouse_id, category_id, used_on) values ($1, $2, $3) returning id', [W.raw, upkeep, TODAY])).rows[0].id;
      await q('insert into public.stock_use_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 3000)', [docId, corn]);
      return (await q('select id, version from public.stock_uses where id = $1', [docId])).rows[0];
    },
    { commit: true },
  );
  const cornMove = await transferDraft(db, U.owner, W.raw, raw2, TODAY, [{ item: corn, qty: 3000 }]);
  const d6 = await race(
    db,
    { user: U.manager, sql: "select public.post_stock_use($1, $2, public.preview_stock_use($1) ->> 'plan', gen_random_uuid()) as result", params: [useDoc.id, useDoc.version] },
    { user: U.owner, sql: POST, params: [cornMove.id, cornMove.version] },
  );
  const useExpense = (await db.admin("select amount::text as amount from public.expenses where doc_kind = 'stock_use' and doc_id = $1", [useDoc.id])).rows;
  t.same(
    [d6.first, d6.state, d6.second, (await lotsOf(db, corn, W.raw)).map((l) => [l.qty_left, l.value_left]), useExpense, (await lotsOf(db, corn, raw2)).length],
    ['ok', 'blocked', 'insufficient_stock', [['1000', '450000']], [{ amount: '1350000.00' }], 0],
    'D6: الصرف يرحّل (مصروف 1,350,000.00) والتحويل ينام على رصيد الذرة ثم insufficient_stock، والدفعة 1,000 كغم بـ450,000.00 بلا مرآة',
  );

  // ── C11 (E53): تحويل يترحّل والجرد ينتظر قفل الرصيد ← count_stale ─────────────────────────────────────────────────
  const XC = await item('كاز الجرد');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: XC, qty: 40, value: 30000 }]);
  const counted = await db.asUser(
    U.storekeeper,
    async (q) => {
      const docId = (await q('insert into public.stock_counts (warehouse_id, counted_on) values ($1, $2) returning id', [W.general, TODAY])).rows[0].id;
      await q('insert into public.stock_count_lines (doc_id, item_id, counted_qty) values ($1, $2, 39)', [docId, XC]);
      return docId;
    },
    { commit: true },
  );
  const versionOf = async (docId) => (await db.admin('select version from public.stock_counts where id = $1', [docId])).rows[0].version;
  await S.one(U.storekeeper, 'select public.submit_count($1, $2, gen_random_uuid())', [counted, await versionOf(counted)]);
  const countLine = (await db.admin('select id from public.stock_count_lines where doc_id = $1', [counted])).rows[0].id;
  await S.one(U.manager, "update public.stock_count_lines set reason = 'لتر ناقص', reason_diff = diff, reason_expired_diff = expired_diff where id = $1 returning id", [countLine]);
  const xMove = await transferDraft(db, U.storekeeper, W.general, W.raw, TODAY, [{ item: XC, qty: 5 }]);
  const c11 = await race(
    db,
    { user: U.storekeeper, sql: POST, params: [xMove.id, xMove.version] },
    { user: U.manager, sql: "select public.post_count($1, $2, public.preview_count($1) ->> 'plan', gen_random_uuid()) as result", params: [counted, await versionOf(counted)] },
  );
  const countRow = (await db.admin('select status, doc_no from public.stock_counts where id = $1', [counted])).rows[0];
  t.same(
    [c11.first, c11.state, c11.second, countRow, (await lotsOf(db, XC, W.general)).map((l) => l.qty_left)],
    ['ok', 'blocked', 'count_stale', { status: 'submitted', doc_no: null }, ['35']],
    'C11: التحويل يرحّل والجرد ينام على رصيد المادّة ثم count_stale؛ الجرد يبقى مسلَّماً بلا رقم ولا نقص على الرصيد القديم',
  );

  // ── C15 (مراجعة WP5): سطور الجرد وكلفها قبل رأسه ─────────────────────────────────────────────────────────────────
  // البديلة تمسك صفّ السطر (أو الكلفة) مثل تعديل العادّ (أو كلفة المدير)، وبعدها تطلب الرأس مثل حارسهما: دوالّ الجرد تقفل السطور
  // والكلف قبل الرأس فتنتظر وأيديها فارغة، والبديلة تاخذ الرأس فوراً. بالترتيب القديم (الرأس ثم السطور) الدالّة ماسكة الرأس ← 40P01.
  const XL = await item('كاز الأقفال');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: XL, qty: 40, value: 4000 }]);
  const lockedCount = async (stage) => {
    const docId = await db.asUser(
      U.storekeeper,
      async (q) => {
        const doc = (await q('insert into public.stock_counts (warehouse_id, counted_on) values ($1, $2) returning id', [W.general, TODAY])).rows[0].id;
        await q('insert into public.stock_count_lines (doc_id, item_id, counted_qty) values ($1, $2, 39)', [doc, XL]);
        return doc;
      },
      { commit: true },
    );
    const lineId = (await db.admin('select id from public.stock_count_lines where doc_id = $1', [docId])).rows[0].id;
    if (stage !== 'draft') {
      await S.one(U.storekeeper, 'select public.submit_count($1, $2, gen_random_uuid())', [docId, await versionOf(docId)]);
      await S.one(U.manager, "update public.stock_count_lines set reason = 'لتر ناقص', reason_diff = diff, reason_expired_diff = expired_diff where id = $1 returning id", [lineId]);
      await S.one(U.manager, 'insert into public.stock_count_line_costs (line_id, gain_unit_cost) values ($1, 100) returning line_id', [lineId]);
    }
    if (stage === 'returned') await S.one(U.manager, "select public.return_count($1, $2, 'أعد العدّ', gen_random_uuid())", [docId, await versionOf(docId)]);
    return { docId, lineId, version: await versionOf(docId) };
  };
  const LINE = 'select 1 from public.stock_count_lines where id = $1 for no key update';
  const COST = 'select 1 from public.stock_count_line_costs where line_id = $1 for no key update';
  const HEADER = 'select 1 from public.stock_counts where id = $1 for update';
  const c15 = {};
  for (const [name, stage, lock, call] of [
    ['submit_count', 'draft', LINE, (c) => ({ user: U.storekeeper, sql: 'select public.submit_count($1, $2, gen_random_uuid()) as result', params: [c.docId, c.version] })],
    ['refresh_count', 'submitted', LINE, (c) => ({ user: U.manager, sql: 'select public.refresh_count($1, $2, gen_random_uuid()) as result', params: [c.docId, c.version] })],
    ['return_count', 'submitted', LINE, (c) => ({ user: U.manager, sql: "select public.return_count($1, $2, 'أعد العدّ', gen_random_uuid()) as result", params: [c.docId, c.version] })],
    ['post_count', 'submitted', COST, (c) => ({ user: U.manager, sql: "select public.post_count($1, $2, public.preview_count($1) ->> 'plan', gen_random_uuid()) as result", params: [c.docId, c.version] })],
    // حذف سطر بكلفته (المراجعة الثانية): الكلفة قبل الرأس، مثل حارسها.
    ['delete_draft_line', 'returned', COST, (c) => ({ user: U.storekeeper, sql: "select public.delete_draft_line('count', $1, $2) as result", params: [c.lineId, c.version] })],
  ]) {
    const c = await lockedCount(stage);
    const out = await lockOrderRace(db, { holder: U.scopedManager, first: [c.lineId], last: [c.docId], lock, lockLast: HEADER, a: call(c) });
    c15[name] = [out.held, out.a, out.last, out.a2];
  }
  t.same(
    c15,
    Object.fromEntries(['submit_count', 'refresh_count', 'return_count', 'post_count', 'delete_draft_line'].map((name) => [name, [true, 'blocked', 'finished', 'ok']])),
    'C15: التسليم وإعادة الحساب و«أعِد للعدّ» والترحيل وحذف السطر ينتظرون السطر (أو الكلفة) وأيديهم فارغة من الرأس، والبديلة تاخذ الرأس فوراً، والكل يكمل بلا 40P01',
  );
  // كلفة جديدة وحذف سطر ينتظر (المراجعة الثالثة): الحذف يقفل السطر for update ثم الرأس، والحارس كان يقفل الرأس قبل ما فحص المفتاح
  // الأجنبي يقفل السطر for key share ← 40P01. هسه الحارس يقفل السطر قبل الرأس، فالكلفة تنتظر وإيدها فارغة.
  const costCount = await lockedCount('draft');
  await S.one(U.storekeeper, 'select public.submit_count($1, $2, gen_random_uuid())', [costCount.docId, costCount.version]);
  const costRace = await lockOrderRace(db, {
    holder: U.scopedManager,
    first: [costCount.lineId],
    last: [costCount.docId],
    lock: 'select 1 from public.stock_count_lines where id = $1 for update',
    lockLast: HEADER,
    a: { user: U.manager, sql: 'insert into public.stock_count_line_costs (line_id, gain_unit_cost) values ($1, 100) returning line_id', params: [costCount.lineId] },
  });
  t.same(
    [costRace.held, costRace.a, costRace.last, costRace.a2],
    [true, 'blocked', 'finished', 'ok'],
    'C15: كلفة جديدة والسطر مقفول for update (مثل الحذف): تنتظر السطر وإيدها فارغة من الرأس، والبديلة تاخذ الرأس فوراً، والكلفة تنكتب بلا 40P01',
  );

  // ── C16 (مراجعة WP5، E45): الجرد بزيادة يقفل عدّاد الترتيب قبل ما يقرا دفعة القياس ───────────────────────────────────────
  // كان يقرا القياس (100.00 للتر) ثم ينتظر العدّاد بـnew_lot ويرحّل، ودفعة الزيادة رقمها بعد افتتاح ترحّل وهو ينتظر وما انقاس بيه.
  const XG = await item('كاز القياس');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: XG, qty: 10, value: 1000 }]);
  const gainDoc = await db.asUser(
    U.storekeeper,
    async (q) => {
      const doc = (await q('insert into public.stock_counts (warehouse_id, counted_on) values ($1, $2) returning id', [W.general, TODAY])).rows[0].id;
      await q('insert into public.stock_count_lines (doc_id, item_id, counted_qty) values ($1, $2, 12)', [doc, XG]);
      return doc;
    },
    { commit: true },
  );
  await S.one(U.storekeeper, 'select public.submit_count($1, $2, gen_random_uuid())', [gainDoc, await versionOf(gainDoc)]);
  await S.one(U.manager, "update public.stock_count_lines set reason = 'لتران زيادة', reason_diff = diff, reason_expired_diff = expired_diff where doc_id = $1 returning id", [gainDoc]);
  // البديلة (بهويّة المدير) تمسك صفّ العدّاد قفلاً بس (بلا تعديل)، والجرد ينطلق وينحبس، والبديلة ترحّل افتتاحاً بمخزن ثاني (300.00
  // للتر) وتثبّت. القفل قبل القراءة: الجرد ينتظر العدّاد ثم يقرا الافتتاح ← stale_preview. بلاه يقرا القياس القديم وينحبس بـnew_lot.
  const newer = await openingDraft(db, U.manager, W.general2, GO_LIVE, [{ item: XG, qty: 10, value: 3000 }]);
  const counterHolder = await db.session(U.manager, { role: 'postgres' });
  const poster = await db.session(U.manager);
  const c16 = {};
  try {
    await counterHolder.run("set local lock_timeout = '10s'");
    c16.held = (await counterHolder.run('select 1 from private.stock_fifo_counters where org_id = $1 for update', [S.org])).ok;
    const pending = poster.run("select public.post_count($1, $2, public.preview_count($1) ->> 'plan', gen_random_uuid()) as result", [gainDoc, await versionOf(gainDoc)]);
    c16.state = await db.settle(pending, poster.pid);
    const opened = await counterHolder.run('select public.post_opening_stock($1, $2, gen_random_uuid()) as result', [newer.id, newer.version]);
    c16.opened = opened.ok ? 'ok' : opened.error;
    await counterHolder.commit();
    const posted = await pending;
    c16.posted = posted.ok ? 'ok' : posted.error;
    if (posted.ok) await poster.commit();
  } finally {
    await poster.rollback();
    await counterHolder.rollback();
  }
  const regained = (await S.one(U.manager, 'select public.preview_count($1)', [gainDoc])).lines[0].money.gain_value;
  t.same(
    [c16.held, c16.state, c16.opened, c16.posted, regained],
    [true, 'blocked', 'ok', 'stale_preview', '600.00'],
    'C16: الجرد بزيادة ينتظر عدّاد الترتيب قبل دفعة القياس، فافتتاح ترحّل وهو ينتظر يقلبه stale_preview، والمعاينة الجديدة تقيس بالافتتاح (2 × 300.00 = 600.00)',
  );

  // ── C17: منشأة بلا دفعات، وأوّل افتتاح (ماسك صفّ العدّاد الجديد) والجرد بزيادة بكلفة المدير سوا ─────────────────────────────
  // صفّ العدّاد يولد بصفر قبل قفله، فالجرد ينتظر الافتتاح ثم stale_preview؛ بلاه ما يلكى صفّاً يقفله، فيقيس بكلفة المدير ودفعة الزيادة
  // رقمها بعد دفعة كان لازم ينقاس بيها.
  const F = await makeStockOrg(db, { name: 'مزرعة أوّل دفعة', id: (n) => id(60 + n), phone: (n) => phone(60 + n), goLive: GO_LIVE });
  const FZ = await F.one(F.users.owner, "insert into public.items (name, kind, base_unit) values ('كاز أوّل دفعة', 'fuel', 'L') returning id");
  const firstCount = await db.asUser(
    F.users.storekeeper,
    async (q) => {
      const doc = (await q('insert into public.stock_counts (warehouse_id, counted_on) values ($1, $2) returning id', [F.W.general, TODAY])).rows[0].id;
      const line = (await q('insert into public.stock_count_lines (doc_id, item_id, counted_qty) values ($1, $2, 5) returning id', [doc, FZ])).rows[0].id;
      return { doc, line };
    },
    { commit: true },
  );
  await F.one(F.users.storekeeper, 'select public.submit_count($1, $2, gen_random_uuid())', [firstCount.doc, await versionOf(firstCount.doc)]);
  await F.one(F.users.manager, "update public.stock_count_lines set reason = 'وُجدت', reason_diff = diff, reason_expired_diff = expired_diff where id = $1 returning id", [firstCount.line]);
  await F.one(F.users.manager, 'insert into public.stock_count_line_costs (line_id, gain_unit_cost) values ($1, 100) returning line_id', [firstCount.line]);
  // الافتتاح بوحدة ثانية (حقل اللحم): أوّل ترحيل بكل وحدة يقفل صفّها (division_for_post)، فبنفس الوحدة ينتظر الجرد الوحدة مو العدّاد.
  const firstOpening = await openingDraft(db, F.users.manager, F.W.farm1, GO_LIVE, [{ item: FZ, qty: 10, value: 3000 }]);
  const c17 = await race(
    db,
    { user: F.users.manager, sql: 'select public.post_opening_stock($1, $2, gen_random_uuid()) as result', params: [firstOpening.id, firstOpening.version] },
    { user: F.users.manager, sql: "select public.post_count($1, $2, public.preview_count($1) ->> 'plan', gen_random_uuid()) as result", params: [firstCount.doc, await versionOf(firstCount.doc)] },
  );
  const firstSeen = (await F.one(F.users.manager, 'select public.preview_count($1)', [firstCount.doc])).lines[0];
  t.same(
    [c17.first, c17.state, c17.second, firstSeen.gain_source, firstSeen.money.gain_value],
    ['ok', 'blocked', 'stale_preview', 'lot', '1500.00'],
    'C17: أوّل افتتاح بالمنشأة والجرد بزيادة سوا: الجرد ينتظر صفّ العدّاد ثم stale_preview، والقياس صار بالافتتاح (5 × 300.00)',
  );

  // ── C18 (مراجعة WP5 الثانية): تحويل بدأ قبل «أعد الحساب» وثبت بعده يتسمّى بإعادة الحساب التالية ─────────────────────────
  // «أعد الحساب» ما يقفل الأرصدة، فتحويل ما ثبت ما يشوفه؛ وcreated_at بداية معاملة التحويل (قبل اللقطة) فكان ما يتسمّى أبداً. الترتيب
  // (seq) يولد تحت قفل الرصيد بترتيب الكتابة.
  const XR = await item('كاز اللقطة');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: XR, qty: 30, value: 3000 }]);
  const raceCount = await db.asUser(
    U.storekeeper,
    async (q) => {
      const doc = (await q('insert into public.stock_counts (warehouse_id, counted_on) values ($1, $2) returning id', [W.general, TODAY])).rows[0].id;
      await q('insert into public.stock_count_lines (doc_id, item_id, counted_qty) values ($1, $2, 30)', [doc, XR]);
      return doc;
    },
    { commit: true },
  );
  await S.one(U.storekeeper, 'select public.submit_count($1, $2, gen_random_uuid())', [raceCount, await versionOf(raceCount)]);
  const slow = await transferDraft(db, U.storekeeper, W.general, W.raw, TODAY, [{ item: XR, qty: 2 }]);
  const mover = await db.session(U.storekeeper);
  const c18 = {};
  try {
    c18.moved = (await mover.run(POST, [slow.id, slow.version])).ok;
    c18.first = (await S.one(U.manager, 'select public.refresh_count($1, $2, gen_random_uuid())', [raceCount, await versionOf(raceCount)])).lines[0].docs.length;
    await mover.commit();
    const second = (await S.one(U.manager, 'select public.refresh_count($1, $2, gen_random_uuid())', [raceCount, await versionOf(raceCount)])).lines[0];
    c18.second = second.docs.map((d) => [d.label, Number(d.qty)]);
    c18.diff = second.new.diff;
  } finally {
    await mover.rollback();
  }
  const slowNo = (await db.admin('select doc_no from public.transfers where id = $1', [slow.id])).rows[0].doc_no;
  t.same(c18, { moved: true, first: 0, second: [[slowNo, -2]], diff: '2.000' }, `C18: إعادة الحساب وتحويل ما ثبت ما يسمّيه، وبعد ما ثبت إعادة الحساب التالية تسمّي ${slowNo} (−2) والفرق +2`);

  // ── C19 (المراجعة الثالثة لـWP5): جرد أقدم يترحّل والأحدث (نفس المادّة والمخزن) ماسك الرصيد ← count_superseded بعد ما يثبت ─────
  // فحص «جرد أحدث مرحَّل» بعد قفل الأرصدة: قبلها يقرا الأحدث «مسلَّماً» وينحبس على الرصيد، وبعد ما يثبت الأحدث رصيد يوم الأقدم ما
  // تغيّر (حركات الأحدث بيومه) فكان النقص يترحّل مرّتين (38 بالدفتر و44 على الرفّ).
  const XS = await item('كاز الجردين المتزامنين');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: XS, qty: 50, value: 5000 }]);
  const submittedCount = async (itemId, day, counted) => {
    const doc = await db.asUser(
      U.storekeeper,
      async (q) => {
        const docId = (await q('insert into public.stock_counts (warehouse_id, counted_on) values ($1, $2) returning id', [W.general, day])).rows[0].id;
        await q('insert into public.stock_count_lines (doc_id, item_id, counted_qty) values ($1, $2, $3)', [docId, itemId, counted]);
        return docId;
      },
      { commit: true },
    );
    await S.one(U.storekeeper, 'select public.submit_count($1, $2, gen_random_uuid())', [doc, await versionOf(doc)]);
    await S.one(U.manager, "update public.stock_count_lines set reason = 'تسرّب', reason_diff = diff, reason_expired_diff = expired_diff where doc_id = $1 returning id", [doc]);
    return doc;
  };
  const POST_COUNT = "select public.post_count($1, $2, public.preview_count($1) ->> 'plan', gen_random_uuid()) as result";
  const olderXS = await submittedCount(XS, '2026-10-27', 44);
  const newerXS = await submittedCount(XS, '2026-10-29', 44);
  const c19 = await race(
    db,
    { user: U.manager, sql: POST_COUNT, params: [newerXS, await versionOf(newerXS)] },
    { user: U.manager, sql: POST_COUNT, params: [olderXS, await versionOf(olderXS)] },
  );
  const xsLeft = (await db.admin('select trim_scale(qty)::text as qty from public.stock_balances where item_id = $1 and warehouse_id = $2', [XS, W.general])).rows[0].qty;
  t.same(
    [c19.first, c19.state, c19.second, xsLeft],
    ['ok', 'blocked', 'count_superseded', '44'],
    'C19: جرد 29/10 يترحّل وجرد 27/10 ينتظر الرصيد، وبعد ما يثبت الأحدث count_superseded، والرصيد 44 (النقص مرّة وحدة)',
  );

  // ── C20 (المراجعة الثالثة): جرد بنقص بس ما ياخذ عدّاد الترتيب (يتقفل عند أوّل زيادة)، فما ينتظر افتتاحاً أو استلاماً ماسكه ──────
  const XN = await item('كاز النقص وحده');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: XN, qty: 10, value: 1000 }]);
  const shortOnly = await submittedCount(XN, TODAY, 9);
  const counterHeld = await db.session(U.manager, { role: 'postgres' });
  const shortPoster = await db.session(U.manager);
  const c20 = {};
  try {
    await counterHeld.run("set local lock_timeout = '10s'");
    c20.held = (await counterHeld.run('select 1 from private.stock_fifo_counters where org_id = $1 for update', [S.org])).ok;
    const pending = shortPoster.run(POST_COUNT, [shortOnly, await versionOf(shortOnly)]);
    c20.state = await db.settle(pending, shortPoster.pid);
    await counterHeld.rollback();
    const posted = await pending;
    c20.posted = posted.ok ? 'ok' : posted.error;
    if (posted.ok) await shortPoster.commit();
  } finally {
    await shortPoster.rollback();
    await counterHeld.rollback();
  }
  t.same(c20, { held: true, state: 'finished', posted: 'ok' }, 'C20: جرد بنقص بس يترحّل والعدّاد بيد جلسة ثانية (بلا انتظار)');

  // ── C21 (المراجعة الرابعة): إلغاء جرد أقدم وترحيل جرد أحدث انحسب على تسويته بنفس اللحظة ─────────────────────────────────
  // فحص «جرد أحدث» بالإلغاء بعد قفل الأرصدة: قبلها يقرا الأحدث «مسلَّماً» وينتظر، فيعكس الأقدم والأحدث المرحَّل يقول 44 والدفتر 50.
  // وبالعكس: الإلغاء أوّلاً، فالترحيل ينتظره ثم «تغيّر الرصيد».
  const VOID_COUNT = "select public.void_count($1, 'جرد خاطئ', gen_random_uuid()) as result";
  const chainOf = async (label) => {
    const itemId = await item(label);
    await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: itemId, qty: 50, value: 5000 }]);
    const older = await submittedCount(itemId, '2026-10-27', 44);
    await S.one(U.manager, POST_COUNT, [older, await versionOf(older)]);
    const newer = await submittedCount(itemId, '2026-10-29', 44);
    return { itemId, older, newer };
  };
  const leftOf = async (itemId) => (await db.admin('select trim_scale(qty)::text as qty from public.stock_balances where item_id = $1 and warehouse_id = $2', [itemId, W.general])).rows[0].qty;
  const postFirst = await chainOf('كاز الإلغاء والترحيل');
  const c21 = await race(db, { user: U.manager, sql: POST_COUNT, params: [postFirst.newer, await versionOf(postFirst.newer)] }, { user: U.manager, sql: VOID_COUNT, params: [postFirst.older] });
  const voidFirst = await chainOf('كاز الترحيل والإلغاء');
  const c21b = await race(db, { user: U.manager, sql: VOID_COUNT, params: [voidFirst.older] }, { user: U.manager, sql: POST_COUNT, params: [voidFirst.newer, await versionOf(voidFirst.newer)] });
  t.same(
    [[c21.first, c21.state, c21.second, await leftOf(postFirst.itemId)], [c21b.first, c21b.state, c21b.second, await leftOf(voidFirst.itemId)]],
    [['ok', 'blocked', 'count_superseded', '44'], ['ok', 'blocked', 'count_stale', '50']],
    'C21: الأحدث يترحّل والإلغاء ينتظر ثم count_superseded (الرصيد 44)؛ والإلغاء أوّلاً والترحيل ينتظر ثم count_stale (الرصيد 50)',
  );

  // ── ملفات التراجع تقفل جداولها قبل ما تعدّ (مراجعة WP4 الثانية): بلا قفل، مستند ينكتب بعد العدّ وقبل الحذف ينحذف ويّا جداوله.
  for (const name of ['rollback_0005.sql', 'rollback_0006.sql', 'rollback_0007.sql', 'rollback_0008.sql']) {
    const text = readFileSync(path.join(MIGRATIONS, name), 'utf8');
    t.ok(text.indexOf('lock table') > 0 && text.indexOf('lock table') < text.indexOf('rollback_blocked'), `${name}: «lock table» قبل عدّ «rollback_blocked»`);
  }
  const rollback7 = readFileSync(path.join(MIGRATIONS, 'rollback_0007.sql'), 'utf8');
  const lockStatement = rollback7.slice(rollback7.indexOf('lock table'), rollback7.indexOf(';', rollback7.indexOf('lock table')) + 1);
  const holder = await db.session(U.owner, { role: 'postgres' });
  const writer = await db.session(U.manager);
  try {
    await holder.run("set local lock_timeout = '5s'");
    const locked = await holder.run(lockStatement);
    const insert = writer.run('insert into public.opening_docs (warehouse_id, on_date) values ($1, $2) returning id', [W.general, GO_LIVE]);
    const state = await db.settle(insert, writer.pid);
    await holder.rollback();
    const inserted = await insert;
    t.same([locked.ok, state, inserted.ok], [true, 'blocked', true], 'قفل rollback_0007 يحبس مسوّدة جديدة لحد ما تخلص معاملته (والكتابة تكمل بعد ما يرجع)');
  } finally {
    await writer.rollback();
    await holder.rollback();
  }

  // ── فترة مقفلة (آخر شي: تقفل المنشأة): تحويل انعدّل تاريخه لداخل الفترة المقفلة والترحيل ينتظر ← stale_draft.
  const locked = await transferDraft(db, U.storekeeper, W.general, W.raw, '2026-10-28', [{ item: XT, qty: 1 }]);
  await S.one(U.owner, 'select public.set_period_lock($1)', ['2026-10-25']);
  const lockedRace = await editWhilePosting(db, {
    editor: U.storekeeper,
    editSql: "update public.transfers set moved_on = '2026-10-24' where id = $1",
    editParams: [locked.id],
    poster: U.storekeeper,
    postSql: "select public.post_transfer($1, $2, public.preview_transfer($1) ->> 'plan', gen_random_uuid()) as result",
    postParams: [locked.id, locked.version + 1],
  });
  t.same([lockedRace.state, lockedRace.post], ['blocked', 'stale_draft'], 'تحويل انعدّل تاريخه لداخل الفترة المقفلة والترحيل ينتظر: stale_draft');
}
