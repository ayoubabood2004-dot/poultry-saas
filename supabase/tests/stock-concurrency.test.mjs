// تزامن المخزون بجلستين حقيقيتين (الخطّة WP4، D6، FOUNDATION ٨٧٣، ٨٨٦؛ درس 2026-10-25: كل ضمان قفل يثبته فحص بجلستين):
// C1 سحبان بنفس اللحظة من دفعة 100 (60 و60): واحد يرحّل والثاني insufficient_stock والدفعة 40؛ C9 سطر ينعدّل من جلسة ثانية
// بعد المعاينة ← stale_draft؛ C10 أوّل ترحيلين لنفس (المادّة، المخزن) ← صفّ رصيد واحد؛ C13 تحويلان متعاكسان (A→B بـX وY وB→A
// بـY وX) بلا قفل متبادل؛ C5 أرقام TR متتالية؛ C14 sameRefRace للتحويل والافتتاح (ترحيل واحد ورقم واحد، ونفس المرجع بنسخة ثانية
// ref_reused، والمرحَّل بمرجع جديد not_draft).
import { sameRefRace } from './shared.mjs';
import { lotsOf, makeStockOrg, openingDraft, postedOpening, transferDraft } from './stock-kit.mjs';

const TODAY = '2026-10-30';
const GO_LIVE = '2026-10-20';
const id = (n) => `d7200000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477097200${String(n).padStart(2, '0')}`;

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

/** الأولى تنفّذ وتبقى مفتوحة، والثانية تنطلق وتنحبس، والأولى تثبّت، والثانية تكمل وتثبّت إذا نجحت. */
async function race(db, first, second) {
  const one = await db.session(first.user);
  const two = await db.session(second.user);
  try {
    const a = await one.run(first.sql, first.params);
    const pending = two.run(second.sql, second.params);
    const state = await db.settle(pending, two.pid);
    await one.commit();
    const b = await pending;
    await two.commit();
    return { first: a.ok ? 'ok' : a.error, state, second: b.ok ? 'ok' : b.error, rows: [a.rows, b.rows] };
  } finally {
    await one.rollback();
    await two.rollback();
  }
}

/**
 * ترتيب الأقفال بجلسة بديلة (قالب ledger-locks وledger-rules): البديلة (صاحب الجداول) تمسك first، وa (وb) ينطلقون وينحبسون،
 * وبعدها البديلة تطلب last: «finished» = ولا وحد منهم ماسكه وهو منحبس. بالترتيب الغلط البديلة تنحبس عليه وهو عليها (40P01):
 * الضحيّة يرجع خطأه ويرجع كلّه، وبعده البديلة تكمل («late» أو خطؤها). a.role postgres لضابط يقفل مباشرةً، وa.before أوامر قبل.
 */
async function lockOrderRace(db, { holder, first, last, lock, a, b }) {
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
    const lastPending = hold.run(lock, last);
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

const POST = 'select public.post_transfer($1, $2, gen_random_uuid()) as result';

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
  await postedOpening(db, U.manager, W.farm1, GO_LIVE, [{ item: P, qty: 100, value: 1000 }, { item: Q, qty: 100, value: 1000 }]);
  await postedOpening(db, U.manager, W.farm2, GO_LIVE, [{ item: P, qty: 100, value: 1000 }, { item: Q, qty: 100, value: 1000 }]);
  // جلسة بديلة تمسك صفّ الرصيد الأوّل بترتيب (المادّة، المخزن)، فالتحويلان ينحبسان نصّ الطريق وهم ماسكين اللي قفلوه قبله؛ وبعدها
  // البديلة تطلب الصفّ الأخير: إذا أيّ تحويل قفل بترتيب ثاني (معكوس، أو بترتيب سطوره) يكون ماسكه، فتنحبس البديلة عليه وهو عليها
  // (40P01). بالترتيب الصحيح يدهم فارغة من الأرصدة، فالبديلة تاخذه فوراً والاثنين يكملون. والضابط: نفس الطريقة بقفلين معكوسين
  // مباشرةً تطلع 40P01، فالفحص يقدر يفشل.
  const forward = await transferDraft(db, U.manager, W.farm1, W.farm2, TODAY, [{ item: P, qty: 5 }, { item: Q, qty: 5 }]);
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
    post: (docId, version, ref) => ({ sql: 'select public.post_transfer($1, $2, $3) as result', params: [docId, version, ref] }),
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
}
