// قواعد 0006 اللي ما كان يمسكها فحص (اختبار الطفرات لـWP3: كل فحص هنا يفشل على طفرة نجت من book وledger وledger-locks
// وproperty والكتالوج والمصفوفة). أربعة أقسام:
// ١. ضوابط بمعاملات ترجع: كل قيد check وفريد ومفتاح أجنبي مركّب، وكل مشغّل عكس وتوزيع، يرفض صفّه بالضبط (وضابط إيجابي).
// ٢. قواعد الدوالّ بدور authenticated حقيقي: الأرشيف بالرصيد السالب والمعاد، وترتيب القيد والحركة، والنسخة، والتدقيق،
//    وبصمة المرجع لكل دالّة، والإخفاء بالإعادة، والتواريخ على حدودها، والمعرّف المولود بالجهاز، والتوزيع بقيد المستند
//    والتاريخ والترتيب وإعادة التوزيع، وحركات الصندوق ونقلها وإلغائها، والمعاينة، والتقارير على حدود المدّة والفلتر والصفحات.
// ٣. سباقات بجلستين: صفّ الوحدة قبل أوّل ترحيل، وترتيب الأقفال للافتتاح والتسوية والنقل، وقفل الفترة للافتتاح والصندوق والنقل.
// ٤. فروع verify_ledger اللي ما كان إلها كسر.
import { call, canon, LEDGER_ZERO, makeOrg, outcome, remainders, shown, uid, verifyLedger } from './ledger-kit.mjs';

const TODAY = '2026-10-30';
const D2 = '2026-10-28';
const D3 = '2026-10-27';
const id = (n) => `d6000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477095000${String(n).padStart(2, '0')}`;
const orgIds = (prefix, phonePrefix) => ({ id: (n) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`, phone: (n) => `${phonePrefix}${String(n).padStart(2, '0')}` });

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
    return { first: a.ok ? 'ok' : a.error, state, second: b.ok ? 'ok' : b.error };
  } finally {
    await one.rollback();
    await two.rollback();
  }
}

/**
 * مستند يقفل الجهة ثم صفّ الوحدة (بديله: قفل الجهة الاستشاري ثم set_division_go_live) ضدّ ترحيل لنفس الجهة بوحدة ما رحّلت:
 * بالترتيب الصحيح (§2.3) الترحيل ينتظر الجهة وهو ما ماسك صفّ الوحدة، فالاثنين يكملون؛ بالمعكوس قفل متبادل 40P01.
 */
async function lockOrder(db, { standIn, poster, party, division, day, sql, params }) {
  const holder = await db.session(standIn);
  const posting = await db.session(poster);
  try {
    const held = await holder.run("select pg_advisory_xact_lock(hashtextextended('party:' || $1::text, 0))", [party]);
    const pending = posting.run(sql, params);
    const state = await db.settle(pending, posting.pid);
    const moved = await holder.run('select public.set_division_go_live($1, $2::date)', [division, day]);
    await holder.commit();
    const posted = await pending;
    await posting.commit();
    return { held: held.ok, state, division: moved.ok ? 'ok' : moved.error, posted: posted.ok ? 'ok' : posted.error };
  } finally {
    await holder.rollback();
    await posting.rollback();
  }
}

async function scenario(t, db) {
  const R = await makeOrg(db, {
    name: 'مزرعة القواعد',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['manager2', 'manager'],
      ['accountant', 'accountant'],
      ['millManager', 'manager', ['feed_mill']],
      ['storekeeper', 'storekeeper'],
    ],
  });
  const { users: U, books: B, divisions: D, org: ORG } = R;
  const as = (user, sql, params) => call(db, user, sql, params);
  const asM = (sql, params) => as(U.manager, sql, params);
  const one = async (sql, params) => (await db.admin(sql, params)).rows[0];
  const rows = async (sql, params) => (await db.admin(sql, params)).rows;
  // المعمل والعامة 30/09، والمفقس 24/09 (أقدم تشغيل)، والأدوية بالمستقبل 05/11، واللحم والبيض بلا يوم؛ والفترة مقفولة لحد 20/09.
  for (const [kind, day] of [['feed_mill', '2026-09-30'], ['hatchery', '2026-09-24'], ['general', '2026-09-30'], ['medicine', '2026-11-05']]) {
    t.eq(shown(await asM('select public.set_division_go_live($1, $2)', [D[kind], day])), 'ok', `يوم تشغيل ${kind} ${day}`);
  }
  t.eq(shown(await asM('select public.set_period_lock($1)', ['2026-09-20'])), 'ok', 'الفترة مقفولة لحد 20/09');
  const party = async (name) => (await asM('insert into public.parties (name, is_customer) values ($1, true) returning id', [name])).value;
  const box = async (name) => (await asM("insert into public.cash_accounts (name, kind) values ($1, 'cash') returning id", [name])).value;
  const BOX = await box('صندوق القواعد');
  const BANK = await box('مصرف القواعد');
  const opening = (p, book, amount, day, user = U.manager) => as(user, 'select public.record_opening_balance($1, $2, $3, $4, $5, $6)', [uid(), p, book, amount, day, uid()]);
  const pay = (fn, p, book, amount, account = BOX, day = TODAY, user = U.manager) => as(user, `select public.${fn}($1, $2, $3, $4, $5, $6, $7)`, [uid(), p, book, amount, account, day, uid()]);
  const adjust = (p, book, direction, amount, day = TODAY, reason = 'فرق حساب', user = U.manager) =>
    as(user, 'select public.record_party_adjustment($1, $2, $3, $4, $5, $6, $7, $8)', [uid(), p, book, direction, amount, day, reason, uid()]);
  const forgive = (p, book, amount, reason = 'خصم') => asM('select public.forgive_debt($1, $2, $3, $4, $5, $6, $7)', [uid(), p, book, amount, TODAY, reason, uid()]);
  const voidPayment = (entryId, reason = 'خطأ', user = U.manager) => as(user, 'select public.void_party_payment($1, $2, $3)', [entryId, reason, uid()]);
  const voidEntry = (entryId, reason = 'خطأ', user = U.manager) => as(user, 'select public.void_party_entry($1, $2, $3)', [entryId, reason, uid()]);
  const cashOpening = (account, amount, day, moveId = uid()) => asM('select public.record_cash_opening($1, $2, $3, $4, $5)', [moveId, account, amount, day, uid()]);
  const transfer = (from, to, amount, day = TODAY, note = null) => asM('select public.transfer_cash($1, $2, $3, $4, $5, $6, $7)', [uid(), from, to, amount, day, note, uid()]);
  const voidMove = (moveId, reason = 'خطأ') => asM('select public.void_cash_move($1, $2, $3)', [moveId, reason, uid()]);
  const archive = (table, rowId) => asM(`update public.${table} set archived_at = 'now' where id = $1`, [rowId]);

  // ═══ ١. الضوابط: كل صفّ بمعاملة ترجع، بهويّة المالك (auth_org)، والرمز بالضبط ═════════════════════════════════════════
  const P0 = await party('جهة الضوابط');
  const BOX0 = await box('صندوق الضوابط');
  const BOX1 = await box('صندوق الضوابط الثاني');
  const norm = (code) => (code.startsWith('unique:') ? 'unique' : code.startsWith('23503:') ? 'fk' : code);
  const tools = (q) => ({
    q,
    entry: async (kind, amount, extra = {}) =>
      (await q(
        'insert into public.party_entries (org_id, party_id, book_id, kind, amount, on_date, reverses_entry_id, doc_kind, doc_id, doc_no, reason, seq) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0) returning id',
        [ORG, extra.party ?? P0, extra.book ?? B.general, kind, amount, extra.onDate ?? TODAY, extra.reverses ?? null, extra.docKind ?? null, extra.docId ?? null, extra.docNo ?? null, extra.reason ?? null],
      )).rows[0].id,
    alloc: async (debit, credit, amount, extra = {}) =>
      (await q('insert into public.party_allocations (org_id, party_id, book_id, debit_entry_id, credit_entry_id, amount, reverses_allocation_id) values ($1, $2, $3, $4, $5, $6, $7) returning id', [ORG, P0, extra.book ?? B.general, debit, credit, amount, extra.reverses ?? null])).rows[0].id,
    move: async (kind, amount, extra = {}) =>
      (await q(
        'insert into public.cash_moves (org_id, account_id, amount, kind, doc_kind, doc_id, party_entry_id, on_date, reverses_move_id, note, seq) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0) returning id',
        [ORG, extra.box ?? BOX0, amount, kind, extra.docKind ?? null, extra.docId ?? null, extra.entry ?? null, extra.onDate ?? TODAY, extra.reverses ?? null, extra.note ?? null],
      )).rows[0].id,
  });
  const probe = async (statements) => {
    try {
      await db.asOwner((q) => statements(tools(q)), U.owner);
      return 'ok';
    } catch (error) {
      return norm(outcome(error));
    }
  };
  const doc = uid();
  const CASES = {
    // الجهات والصناديق والعدّاد.
    'ضابط: اسم جهة 120 حرفاً': ['ok', ({ q }) => q("insert into public.parties (org_id, name, is_customer) values ($1, $2, true)", [ORG, 'ج'.repeat(120)])],
    'اسم جهة 121 حرفاً': ['check:parties_name_check', ({ q }) => q("insert into public.parties (org_id, name, is_customer) values ($1, $2, true)", [ORG, 'ج'.repeat(121)])],
    'اسم جهة تطويل فقط': ['check:parties_name_norm_check', ({ q }) => q("insert into public.parties (org_id, name, is_customer) values ($1, 'ـــ', true)", [ORG])],
    'هاتف جهة 41 حرفاً': ['check:parties_phone_check', ({ q }) => q("insert into public.parties (org_id, name, phone, is_customer) values ($1, 'جهة الهاتف الطويل', $2, true)", [ORG, '1'.repeat(41)])],
    'اسم صندوق 81 حرفاً': ['check:cash_accounts_name_check', ({ q }) => q("insert into public.cash_accounts (org_id, name, kind) values ($1, $2, 'cash')", [ORG, 'ص'.repeat(81)])],
    'ضابط: عدّاد OF': ['ok', ({ q }) => q("insert into public.doc_counters (org_id, kind, year, last_no) values ($1, 'OF', 2026, 1)", [ORG])],
    'عدّاد بنوع مجهول': ['check:doc_counters_kind_check', ({ q }) => q("insert into public.doc_counters (org_id, kind, year, last_no) values ($1, 'EX', 2026, 1)", [ORG])],
    'عدّاد بسنة 1999': ['check:doc_counters_year_check', ({ q }) => q("insert into public.doc_counters (org_id, kind, year, last_no) values ($1, 'OF', 1999, 1)", [ORG])],
    'عدّاد بآخر رقم صفر': ['check:doc_counters_last_no_check', ({ q }) => q("insert into public.doc_counters (org_id, kind, year, last_no) values ($1, 'OF', 2026, 0)", [ORG])],
    // القيود.
    'ضابط: قيد مقاصّة موجب': ['ok', ({ entry }) => entry('offset', 100)],
    'قيد بمبلغ صفر': ['check:party_entries_amount_check', ({ entry }) => entry('adjustment', 0)],
    'قيد بنصف دينار': ['check:party_entries_amount_check', ({ entry }) => entry('adjustment', '100.5')],
    'قيد بنوع مجهول': ['check:party_entries_kind_check', ({ entry }) => entry('gift', 100)],
    'مرتجع مورّد أصلي سالب': ['check:party_entries_sign_check', ({ entry }) => entry('supplier_return', -100)],
    'مرتجع أصلي موجب': ['check:party_entries_sign_check', ({ entry }) => entry('return', 100)],
    'نوع مستند بلا معرّفه': ['check:party_entries_doc_check', ({ entry }) => entry('adjustment', 100, { docKind: 'receipt' })],
    'نوع مستند بحرف كبير': ['check:party_entries_doc_kind_check', ({ entry }) => entry('adjustment', 100, { docKind: 'Receipt', docId: uid() })],
    'رقم مستند بخانة وحدة': ['check:party_entries_doc_no_check', ({ entry }) => entry('adjustment', 100, { docNo: 'RC-2026-1' })],
    'سبب فراغات': ['check:party_entries_reason_check', ({ entry }) => entry('adjustment', 100, { reason: '   ' })],
    'ترتيبان متساويان بدفتر الجهة': ['unique', async ({ q, entry }) => {
      await q('alter table public.party_entries disable trigger party_entries_seq');
      await entry('adjustment', 100);
      await entry('adjustment', 200);
    }],
    'عكسان لقيد واحد': ['unique', async ({ entry }) => {
      const a = await entry('adjustment', 100);
      await entry('adjustment', -100, { reverses: a });
      await entry('adjustment', -100, { reverses: a });
    }],
    'عكس بدفتر غير دفتر أصله': ['fk', async ({ entry }) => {
      const a = await entry('adjustment', 100);
      await entry('adjustment', -100, { reverses: a, book: B.feed_mill });
    }],
    // التوزيع.
    'توزيع بمبلغ صفر': ['check:party_allocations_amount_check', async ({ entry, alloc }) => alloc(await entry('adjustment', 100), await entry('adjustment', -100), 0)],
    'توزيع بنصف دينار': ['check:party_allocations_amount_check', async ({ entry, alloc }) => alloc(await entry('adjustment', 100), await entry('adjustment', -100), '0.5')],
    'توزيع أصلي سالب': ['check:party_allocations_sign_check', async ({ entry, alloc }) => alloc(await entry('adjustment', 100), await entry('adjustment', -100), -50)],
    'فكّان لتوزيع واحد': ['unique', async ({ entry, alloc }) => {
      const [d, c] = [await entry('adjustment', 100), await entry('adjustment', -100)];
      const x = await alloc(d, c, 50);
      await alloc(d, c, -50, { reverses: x });
      await alloc(d, c, -50, { reverses: x });
    }],
    'توزيع قيده المدين بدفتر ثاني': ['fk', async ({ entry, alloc }) => alloc(await entry('adjustment', 100, { book: B.feed_mill }), await entry('adjustment', -100), 50)],
    'توزيع قيده الدائن بدفتر ثاني': ['fk', async ({ entry, alloc }) => alloc(await entry('adjustment', 100), await entry('adjustment', -100, { book: B.feed_mill }), 50)],
    // حركات الصناديق.
    'حركة بمبلغ صفر': ['check:cash_moves_amount_check', ({ move }) => move('opening', 0)],
    'حركة بنصف دينار': ['check:cash_moves_amount_check', ({ move }) => move('opening', '10.5')],
    'حركة بنوع مجهول': ['check:cash_moves_kind_check', ({ move }) => move('loan', 100)],
    'قبض أصلي صادر': ['check:cash_moves_sign_check', async ({ entry, move }) => move('party_payment', -100, { entry: await entry('payment', -100, { docKind: 'receipt', docId: uid() }) })],
    'مصروف أصلي وارد': ['check:cash_moves_sign_check', ({ move }) => move('expense', 100)],
    'حركة بنوع مستند بلا معرّفه': ['check:cash_moves_doc_check', ({ move }) => move('opening', 100, { docKind: 'cash_transfer' })],
    'حركة بنوع مستند بحرف كبير': ['check:cash_moves_doc_kind_check', ({ move }) => move('opening', 100, { docKind: 'Cash_transfer', docId: uid() })],
    'قبض بلا قيده': ['check:cash_moves_entry_check', ({ move }) => move('party_payment', 100)],
    'دفعة استلام بلا قيدها': ['check:cash_moves_entry_check', ({ move }) => move('receipt_paid', -100)],
    'ملاحظة فراغات': ['check:cash_moves_note_check', ({ move }) => move('opening', 100, { note: '   ' })],
    'ترتيبان متساويان بالصندوق': ['unique', async ({ q, move }) => {
      await q('alter table public.cash_moves disable trigger cash_moves_seq');
      await move('opening', 100);
      await move('opening', 200);
    }],
    'عكسان لحركة واحدة': ['unique', async ({ move }) => {
      const o = await move('opening', 100);
      await move('opening', -100, { reverses: o });
      await move('opening', -100, { reverses: o });
    }],
    // وحدة تعبئة المورّد بجهة موجودة.
    'ضابط: وحدة تعبئة لجهة موجودة': ['ok', async ({ q }) => {
      const item = (await q("insert into public.items (org_id, name, kind, base_unit) values ($1, 'ذرة الضوابط', 'raw', 'kg') returning id", [ORG])).rows[0].id;
      await q("insert into public.item_units (org_id, item_id, party_id, label, factor_to_base) values ($1, $2, $3, 'كيس المورّد 48 كغم', 48)", [ORG, item, P0]);
    }],
    'وحدة تعبئة لجهة مو موجودة': ['fk', async ({ q }) => {
      const item = (await q("insert into public.items (org_id, name, kind, base_unit) values ($1, 'ذرة الضوابط', 'raw', 'kg') returning id", [ORG])).rows[0].id;
      await q("insert into public.item_units (org_id, item_id, party_id, label, factor_to_base) values ($1, $2, $3, 'كيس المورّد 48 كغم', 48)", [ORG, item, uid()]);
    }],
    // مشغّل العكس: بنوع أصله وبمبلغه المعاكس، ولا عكس لعكس.
    'عكس بنوع ثاني': ['reversal_mismatch', async ({ entry }) => entry('opening', -100, { reverses: await entry('adjustment', 100) })],
    'عكس بنصف المبلغ': ['reversal_mismatch', async ({ entry }) => entry('adjustment', -50, { reverses: await entry('adjustment', 100) })],
    'عكس لقيد عكسي': ['reversal_mismatch', async ({ entry }) => {
      const r = await entry('adjustment', -100, { reverses: await entry('adjustment', 100) });
      await entry('adjustment', 100, { reverses: r });
    }],
    // مشغّل التوزيع: مدين موجب ودائن سالب، والفكّ بنفس قيديه وبمبلغه المعاكس، ولا فكّ لفكّ.
    'توزيع مدينه سالب': ['allocation_sides', async ({ entry, alloc }) => alloc(await entry('adjustment', -100), await entry('adjustment', -100), 50)],
    'توزيع دائنه موجب': ['allocation_sides', async ({ entry, alloc }) => alloc(await entry('adjustment', 100), await entry('adjustment', 100), 50)],
    'فكّ بمدين ثاني': ['reversal_mismatch', async ({ entry, alloc }) => {
      const [d, c, other] = [await entry('adjustment', 100), await entry('adjustment', -100), await entry('adjustment', 100)];
      await alloc(other, c, -50, { reverses: await alloc(d, c, 50) });
    }],
    'فكّ بدائن ثاني': ['reversal_mismatch', async ({ entry, alloc }) => {
      const [d, c, other] = [await entry('adjustment', 100), await entry('adjustment', -100), await entry('adjustment', -100)];
      await alloc(d, other, -50, { reverses: await alloc(d, c, 50) });
    }],
    'فكّ بغير المبلغ': ['reversal_mismatch', async ({ entry, alloc }) => {
      const [d, c] = [await entry('adjustment', 100), await entry('adjustment', -100)];
      await alloc(d, c, -40, { reverses: await alloc(d, c, 50) });
    }],
    'فكّ لفكّ': ['reversal_mismatch', async ({ entry, alloc }) => {
      const [d, c] = [await entry('adjustment', 100), await entry('adjustment', -100)];
      const back = await alloc(d, c, -50, { reverses: await alloc(d, c, 50) });
      await alloc(d, c, 50, { reverses: back });
    }],
    // مشغّل حركة الصندوق العكسية.
    'حركة عكسية بصندوق ثاني': ['reversal_mismatch', async ({ move }) => move('opening', -100, { box: BOX1, reverses: await move('opening', 100) })],
    // بلا مستند على الوجهين، حتى النوع وحده هو الفرق.
    'حركة عكسية بنوع ثاني': ['reversal_mismatch', async ({ move }) => move('transfer', -100, { reverses: await move('opening', 100) })],
    'حركة عكسية بغير المبلغ': ['reversal_mismatch', async ({ move }) => move('opening', -50, { reverses: await move('opening', 100) })],
    'عكس لحركة عكسية': ['reversal_mismatch', async ({ move }) => {
      const back = await move('opening', -100, { reverses: await move('opening', 100) });
      await move('opening', 100, { reverses: back });
    }],
    'حركة عكسية بنوع مستند ثاني': ['reversal_mismatch', async ({ move }) => move('transfer', -100, { docKind: 'other_doc', docId: doc, reverses: await move('transfer', 100, { docKind: 'cash_transfer', docId: doc }) })],
    'حركة عكسية بمستند ثاني': ['reversal_mismatch', async ({ move }) => move('transfer', -100, { docKind: 'cash_transfer', docId: uid(), reverses: await move('transfer', 100, { docKind: 'cash_transfer', docId: doc }) })],
    'حركة القبض العكسية بقيد الأصل': ['reversal_mismatch', async ({ entry, move }) => {
      const paid = await entry('payment', -100, { docKind: 'receipt', docId: uid() });
      const m = await move('party_payment', 100, { entry: paid });
      await entry('payment', 100, { docKind: 'receipt', docId: uid(), reverses: paid });
      await move('party_payment', -100, { entry: paid, reverses: m });
    }],
    'ضابط: حركة القبض العكسية بقيدها العكسي': ['ok', async ({ entry, move }) => {
      const paid = await entry('payment', -100, { docKind: 'receipt', docId: uid() });
      const m = await move('party_payment', 100, { entry: paid });
      const back = await entry('payment', 100, { reverses: paid });
      await move('party_payment', -100, { entry: back, reverses: m });
    }],
  };
  const got = {};
  for (const [label, [, statements]] of Object.entries(CASES)) got[label] = await probe(statements);
  // قاعدة الأمين (مورّد بس) لمستخدم داخل؛ كتابة الخادم (بلا مستخدم: ترحيل بيانات أو أداة إدارية) ما تنحصر بيها.
  try {
    await db.asService((q) => q("insert into public.parties (org_id, name, is_customer) values ($1, 'زبون من الخادم', true)", [ORG]));
    got['زبون يضيفه الخادم (بلا مستخدم)'] = 'ok';
  } catch (error) {
    got['زبون يضيفه الخادم (بلا مستخدم)'] = norm(outcome(error));
  }
  CASES['زبون يضيفه الخادم (بلا مستخدم)'] = ['ok'];
  // TRUNCATE ممنوع على مفتاح الخادم بجداول 0006 كلها: الدفاتر بمشغّل الأمر، والجهات والصناديق والعدّاد بالامتياز بس (ما إلها
  // مشغّل TRUNCATE، والعدّاد ما يشير له مفتاح أجنبي فمسحه كان يمرّ ويصفّر الترقيم).
  try {
    await db.asService((q) => q('truncate public.doc_counters'));
    got['مفتاح الخادم يمسح العدّاد'] = 'ok';
  } catch (error) {
    got['مفتاح الخادم يمسح العدّاد'] = error.code;
  }
  CASES['مفتاح الخادم يمسح العدّاد'] = ['42501'];
  const truncatable = (await rows("select t from unnest(array['parties', 'cash_accounts', 'doc_counters', 'party_entries', 'party_allocations', 'cash_moves']) as t where has_table_privilege('service_role', 'public.' || t, 'truncate')")).map((r) => r.t);
  got['جداول 0006 بامتياز TRUNCATE لمفتاح الخادم'] = truncatable.join('، ') || 'ولا جدول';
  CASES['جداول 0006 بامتياز TRUNCATE لمفتاح الخادم'] = ['ولا جدول'];
  t.same(got, Object.fromEntries(Object.entries(CASES).map(([label, [expected]]) => [label, expected])), `كل قيد وفريد ومفتاح مركّب ومشغّل يرفض صفّه برمزه، والضوابط تمرّ (${Object.keys(CASES).length} حالة)`);

  // ═══ ٢. قواعد الدوالّ ═════════════════════════════════════════════════════════════════════════════════════════
  // ── الأرشيف (Q2، E35، E43): الرصيد «له» يمنع أرشفة الجهة؛ الصندوق السالب ما يتؤرشف؛ والمؤرشف وعليه رصيد (بعد إلغاء) يتعدّل ─
  const Pc = await party('جهة لها رصيد');
  t.eq(shown(await adjust(Pc, B.general, 'credit', '1000')), 'ok', 'ضابط: تسوية «له» 1,000');
  const Pz = await party('جهة بلا رصيد');
  t.same([shown(await archive('parties', Pc)), shown(await archive('parties', Pz))], ['archived_in_use', 'ok'], 'جهة «له» عليها رصيد ما تتؤرشف (مو «عليه» بس)، والصفر يتؤرشف');
  const firstPosted = (await one("select first_posted_at::text as at from public.divisions where id = $1", [D.general])).at;
  const Pa = await party('جهة أُرشفت ثم أُلغي تسديدها');
  t.eq(shown(await opening(Pa, B.general, '100000', '2026-09-30')), 'ok', 'ضابط: افتتاح 100,000');
  const settle = await pay('record_party_payment', Pa, B.general, '100000');
  t.same([shown(settle), shown(await archive('parties', Pa)), shown(await voidPayment(settle.value.id))], ['ok', 'ok', 'ok'], 'ضابط: سُدّدت وأُرشفت وأُلغي تسديدها');
  t.eq(shown(await asM("update public.parties set name = 'جهة أُرشفت ثم أُلغي تسديدها (معدّلة)' where id = $1", [Pa])), 'ok', 'جهة مؤرشفة وعليها رصيد تتعدّل (فحص الرصيد بلحظة الأرشفة بس)');
  const Pq = await party('جهة الصندوق المؤرشف');
  const Bx = await box('صندوق يُؤرشف ثم يُلغى قبضه');
  const inbound = await pay('record_party_payment', Pq, B.general, '1000', Bx);
  t.same([shown(inbound), shown(await pay('pay_party', Pq, B.general, '1000', Bx)), shown(await archive('cash_accounts', Bx)), shown(await voidPayment(inbound.value.id))], ['ok', 'ok', 'ok', 'ok'], 'ضابط: الصندوق صفر فأُرشف، وأُلغي قبضه');
  t.eq(shown(await asM("update public.cash_accounts set name = 'صندوق مؤرشف معدّل' where id = $1", [Bx])), 'ok', 'صندوق مؤرشف وعليه رصيد (بعد إلغاء) يتعدّل');
  const By = await box('صندوق سالب');
  t.eq(shown(await pay('pay_party', Pq, B.general, '500', By)), 'ok', 'ضابط: دفع 500 من صندوق فارغ (السالب مسموح، Q10)');
  t.eq(shown(await archive('cash_accounts', By)), 'archived_in_use', 'صندوق بالسالب ما يتؤرشف (مو الموجب بس)');

  // ── ترتيب القيد داخل (الجهة، الدفتر) والحركة داخل صندوقها: كل دفتر وصندوق يبدي من 1 ──────────────────────────────────
  const Ps = await party('جهة دفترين');
  t.same([shown(await opening(Ps, B.chicks, '2000', '2026-09-24')), shown(await opening(Ps, B.feed_mill, '1000', '2026-09-30'))], ['ok', 'ok'], 'ضابط: افتتاحان بدفترين');
  t.same((await rows('select seq::int as seq from public.party_entries where party_id = $1 order by on_date', [Ps])).map((r) => r.seq), [1, 1], 'أوّل قيد بكل دفتر رقمه 1 (الترتيب داخل الدفتر، مو داخل الجهة)');
  const [Q1, Q2] = [await box('صندوق الترتيب الأوّل'), await box('صندوق الترتيب الثاني')];
  t.same([shown(await cashOpening(Q1, '1000', '2026-09-22')), shown(await cashOpening(Q2, '1000', '2026-09-22')), shown(await transfer(Q1, Q2, '100'))], ['ok', 'ok', 'ok'], 'ضابط: افتتاحا صندوقين ونقل بينهما');
  const seqOf = async (account) => (await rows('select seq::int as seq from public.cash_moves where account_id = $1 order by seq', [account])).map((r) => r.seq);
  t.same([await seqOf(Q1), await seqOf(Q2)], [[1, 2], [1, 2]], 'حركات كل صندوق 1، 2 بصندوقها (مو تسلسل المنشأة)');
  t.eq(shown(await asM("update public.cash_accounts set name = 'صندوق الترتيب الثاني (مصرف)' where id = $1", [Q2])), 'ok', 'ضابط: تسمية صندوق');
  t.eq((await one('select version from public.cash_accounts where id = $1', [Q2])).version, 2, 'تعديل الصندوق يزيد نسخته (master_write)');
  const audited = Object.fromEntries((await rows("select table_name, count(*)::int as n from public.audit_log where org_id = $1 and table_name in ('cash_moves', 'doc_counters') group by 1", [ORG])).map((r) => [r.table_name, r.n > 0]));
  t.same(audited, { cash_moves: true, doc_counters: true }, 'حركات الصناديق والعدّاد بسجلّ التدقيق');

  // ── نطاق الدفتر: دفتر مجهول أو بمنشأة ثانية برّا النطاق ─────────────────────────────────────────────────────────
  const O2 = await makeOrg(db, { name: 'منشأة القواعد الثانية', ...orgIds('d6100000', '96477095100'), roles: [['owner', 'owner'], ['manager', 'manager']] });
  const otherParty = (await call(db, O2.users.manager, "insert into public.parties (name, is_customer) values ('جهة المنشأة الثانية', true) returning id")).value;
  const scopeOf = async (book) => (await as(U.accountant, 'select public.in_scope_book($1)', [book])).value;
  t.same([await scopeOf(uid()), await scopeOf(O2.books.general), await scopeOf(B.general)], [false, false, true], 'in_scope_book: دفتر مجهول أو بمنشأة ثانية خارج النطاق (وضابطه دفتر المنشأة)');

  // ═══ المرجع (§2.2) ═══════════════════════════════════════════════════════════════════════════════════════════
  const refRound = (user) =>
    db.asOwner(async (q) => {
      const ref = uid();
      const claim = async () => (await q('select private.ref_claim($1, $2, $3::jsonb) as v', ['probe_mask', ref, '{"a":1}'])).rows[0].v;
      const first = await claim();
      const stored = (await q('select private.ref_store($1, $2, $3::jsonb) as v', ['probe_mask', ref, JSON.stringify({ id: 'x', money: { amount: '5' } })])).rows[0].v;
      return { first, stored, replay: await claim() };
    }, user);
  t.eq(canon(await refRound(U.storekeeper)), canon({ first: null, stored: { id: 'x' }, replay: { id: 'x' } }), 'المال مخفي لمن ما يرى الكلف بأوّل جواب وبالإعادة (ref_store وref_claim)');
  t.eq(canon(await refRound(U.accountant)), canon({ first: null, stored: { id: 'x', money: { amount: '5' } }, replay: { id: 'x', money: { amount: '5' } } }), 'ضابط: المحاسب يشوفه بالاثنين');
  const Pr = await party('جهة المرجع');
  t.eq(shown(await asM('select public.record_party_payment($1, $2, $3, $4, $5, $6, $7)', [uid(), Pr, B.general, '1000', BOX, TODAY, null])), 'ref_required', 'بلا مرجع: ref_required');
  // بصمة المرجع بكل دالّة: نفس المرجع والمعرّف بمعطى واحد غيره = ref_reused (مو النتيجة المحفوظة للمعطى الأوّل).
  const reuse = async (sql, first, change) => {
    const a = await asM(sql, first);
    const b = await asM(sql, first.map((value, i) => (i in change ? change[i] : value)));
    return `${shown(a)}/${shown(b)}`;
  };
  const Q3 = await box('صندوق المرجع');
  const refPay = uid();
  const refAdjust = uid();
  const refTransfer = uid();
  const hashes = {
    opening: await reuse('select public.record_opening_balance($1, $2, $3, $4, $5, $6)', [uid(), Pr, B.general, '1000', '2026-09-30', uid()], { 3: '2000' }),
    payment: await reuse('select public.record_party_payment($1, $2, $3, $4, $5, $6, $7)', [refPay, Pr, B.general, '5000', BOX, TODAY, uid()], { 4: BANK }),
    adjustment: await reuse('select public.record_party_adjustment($1, $2, $3, $4, $5, $6, $7, $8)', [refAdjust, Pr, B.general, 'debit', '700', TODAY, 'فرق', uid()], { 3: 'credit' }),
    forgive: await reuse('select public.forgive_debt($1, $2, $3, $4, $5, $6, $7)', [uid(), Pr, B.general, '100', TODAY, 'خصم', uid()], { 3: '200' }),
    voidPayment: await reuse('select public.void_party_payment($1, $2, $3)', [refPay, 'قبض مكرّر', uid()], { 1: 'قبض خاطئ' }),
    voidEntry: await reuse('select public.void_party_entry($1, $2, $3)', [refAdjust, 'تسوية خاطئة', uid()], { 1: 'تسوية مكرّرة' }),
    cashOpening: await reuse('select public.record_cash_opening($1, $2, $3, $4, $5)', [uid(), Q3, '1000', '2026-09-22', uid()], { 2: '2000' }),
    transfer: await reuse('select public.transfer_cash($1, $2, $3, $4, $5, $6, $7)', [refTransfer, BOX, BANK, '100', TODAY, null, uid()], { 2: Q3 }),
    voidMove: await reuse('select public.void_cash_move($1, $2, $3)', [refTransfer, 'نقل خاطئ', uid()], { 1: 'نقل مكرّر' }),
  };
  t.same(hashes, Object.fromEntries(Object.keys(hashes).map((key) => [key, 'ok/ref_reused'])), 'كل دالّة: نفس المرجع بمعطى غيره (المبلغ، الصندوق، الاتّجاه، السبب، الصندوق الثاني) = ref_reused');

  // ── المعطيات: دفتر وجهة من منشأة ثانية، والسبب، والمعرّف المولود بالجهاز ─────────────────────────────────────────────
  const Pi = await party('جهة المعطيات');
  const firstPay = await pay('record_party_payment', Pi, B.general, '1000');
  const q3Opening = (await one("select id from public.cash_moves where account_id = $1 and kind = 'opening'", [Q3])).id;
  const inputs = {
    otherBook: shown(await pay('record_party_payment', Pi, O2.books.general, '1000')),
    otherParty: shown(await pay('record_party_payment', otherParty, B.general, '1000')),
    longReason: shown(await adjust(Pi, B.general, 'debit', '1000', TODAY, 'س'.repeat(501))),
    negativeAdjust: shown(await adjust(Pi, B.general, 'debit', '-1000')),
    negativeForgive: shown(await forgive(Pi, B.general, '-1000')),
    entryId: shown(await asM('select public.record_party_payment($1, $2, $3, $4, $5, $6, $7)', [firstPay.value.id, Pi, B.general, '1000', BOX, TODAY, uid()])),
    moveId: shown(await asM('select public.record_party_payment($1, $2, $3, $4, $5, $6, $7)', [q3Opening, Pi, B.general, '1000', BOX, TODAY, uid()])),
    noId: shown(await asM('select public.record_party_payment($1, $2, $3, $4, $5, $6, $7)', [null, Pi, B.general, '1000', BOX, TODAY, uid()])),
  };
  t.same(
    inputs,
    { otherBook: 'book_not_found', otherParty: 'party_not_found', longReason: 'reason_required', negativeAdjust: 'amount_not_positive', negativeForgive: 'amount_not_positive', entryId: 'id_reused', moveId: 'id_reused', noId: 'id_required' },
    'دفتر أو جهة منشأة ثانية «غير موجود»، وسبب 501 حرف، وتسوية وإعفاء بالسالب، ومعرّف قيد أو حركة مستعمل، وبلا معرّف',
  );
  const trimmed = await adjust(Pi, B.general, 'debit', '1000', TODAY, '  فرق التقريب  ');
  t.eq((await one('select reason from public.party_entries where id = $1', [trimmed.value.id])).reason, 'فرق التقريب', 'سبب التسوية بقيدها مقصوص الأطراف');

  // ── التواريخ: افتتاح بالمستقبل (يوم تشغيل بالمستقبل)، وبيوم القفل، وبلا تاريخ؛ والصندوق كذلك ─────────────────────────────
  const Pd8 = await party('جهة التواريخ');
  const Q5 = await box('صندوق التواريخ');
  const dates = {
    openingFuture: shown(await opening(Pd8, B.medicine, '1000', '2026-11-02')),
    openingLockDay: shown(await opening(Pd8, B.general, '1000', '2026-09-20')),
    openingNoDate: shown(await opening(Pd8, B.general, '1000', null)),
    openingAfterLock: shown(await opening(Pd8, B.general, '1000', '2026-09-21')),
    cashLockDay: shown(await cashOpening(Q5, '1000', '2026-09-20')),
    cashNoDate: shown(await cashOpening(Q5, '1000', null)),
    cashAfterLock: shown(await cashOpening(Q5, '1000', '2026-09-21')),
  };
  t.same(
    dates,
    { openingFuture: 'date_in_future', openingLockDay: 'period_locked', openingNoDate: 'date_required', openingAfterLock: 'ok', cashLockDay: 'period_locked', cashNoDate: 'date_required', cashAfterLock: 'ok' },
    'الافتتاح: بالمستقبل حتى لو قبل يوم التشغيل، وبيوم القفل نفسه، وبلا تاريخ يرفض؛ وبعد القفل بيوم يمرّ (والصندوق نفسه)',
  );
  const Z = await box('صندوق مؤرشف بلا رصيد');
  const Q6 = await box('صندوق سالب الافتتاح');
  const Q7 = await box('صندوق المعرّف');
  const q7Id = uid();
  const q7 = await cashOpening(Q7, '1000', '2026-09-22', q7Id);
  t.same(
    [shown(await archive('cash_accounts', Z)), shown(await cashOpening(Z, '1000', '2026-09-22')), shown(await cashOpening(Q6, '-50000', '2026-09-22')), q7.value?.id === q7Id, Boolean(await one('select 1 as x from public.cash_moves where id = $1', [q7Id]))],
    ['ok', 'cash_account_archived', 'ok', true, true],
    'افتتاح صندوق مؤرشف يرفض، والسالب يمرّ (Q10)، والحركة بالمعرّف المولود بالجهاز',
  );
  const o2Box = (await call(db, O2.users.manager, "insert into public.cash_accounts (name, kind) values ('صندوق المنشأة الثانية', 'cash') returning id")).value;
  const o2Opening = (day) => call(db, O2.users.manager, 'select public.record_cash_opening($1, $2, $3, $4, $5)', [uid(), o2Box, '1000', day, uid()]);
  const noGoLive = shown(await o2Opening('2026-09-22'));
  t.eq(shown(await call(db, O2.users.manager, 'select public.set_division_go_live($1, $2)', [O2.divisions.medicine, '2026-11-05'])), 'ok', 'ضابط: يوم تشغيل الأدوية بالمستقبل بالمنشأة الثانية');
  t.same([noGoLive, shown(await o2Opening('2026-11-02'))], ['no_go_live', 'date_in_future'], 'افتتاح الصندوق بلا يوم تشغيل لأيّ وحدة يرفض، وبالمستقبل يرفض حتى قبل أقدم يوم تشغيل');

  // ── محرّك التوزيع (القاعدة 27) ───────────────────────────────────────────────────────────────────────────────
  // قيد المستند نفسه أوّلاً (p_first، WP6 يمرّره): الخطّة على قيدين «عليه» بنفس الدفتر.
  const Pf = await party('جهة قيد المستند');
  const older = await adjust(Pf, B.general, 'debit', '100', D2);
  const newer = await adjust(Pf, B.general, 'debit', '100');
  const plan = (first) =>
    db.asOwner(async (q) => (await q('select entry_id, amount::text as amount from private.allocation_plan($1, $2, $3, null, $4)', [Pf, B.general, -150, first])).rows.map((r) => [r.entry_id, r.amount]), U.owner);
  t.same([await plan(newer.value.id), await plan(null)], [[[newer.value.id, '100'], [older.value.id, '50']], [[older.value.id, '100'], [newer.value.id, '50']]], 'قيد المستند (p_first) قبل الأقدم، وبلاه الأقدم أوّلاً');
  // الأقدم بالتاريخ مو بالإدخال، ونفس اليوم بالترتيب.
  const Pd = await party('جهة الأقدم تاريخاً');
  const todayFirst = await adjust(Pd, B.general, 'debit', '100');
  const dated = await adjust(Pd, B.general, 'debit', '100', D3);
  const PdPay = await pay('record_party_payment', Pd, B.general, '100');
  const Psd = await party('جهة نفس اليوم');
  const sameA = await adjust(Psd, B.general, 'debit', '100');
  await adjust(Psd, B.general, 'debit', '100');
  const sameDay = await pay('record_party_payment', Psd, B.general, '100');
  t.same(
    [PdPay.value.money.allocations.map((a) => a.entry_id), sameDay.value.money.allocations.map((a) => a.entry_id)],
    [[dated.value.id], [sameA.value.id]],
    'القبض يسدّ الأقدم تاريخاً حتى لو انسجّل بعد، وبنفس اليوم الأسبق ترتيباً',
  );
  // إعادة التوزيع بعد الإلغاء: الأقدم أوّلاً، والقيد العكسي بسبب الإلغاء.
  const Pre = await party('جهة إعادة التوزيع بالترتيب');
  const A = await adjust(Pre, B.general, 'debit', '100', D3);
  const Bd = await adjust(Pre, B.general, 'debit', '100');
  const both = await pay('record_party_payment', Pre, B.general, '200');
  const C = await adjust(Pre, B.general, 'credit', '50');
  const unpaid = await voidPayment(both.value.id, 'سبب الإلغاء');
  t.same([shown(A), shown(Bd), shown(both), shown(C), shown(unpaid)], ['ok', 'ok', 'ok', 'ok', 'ok'], 'ضابط: قيدان «عليه» وقبض يسدّهما وتسوية «له» مفتوحة ثم إلغاء القبض');
  const left = Object.fromEntries((await remainders(db, Pre, B.general)).map((r) => [r.id, r.remaining]));
  t.same([left[A.value.id], left[Bd.value.id], left[C.value.id]], ['50', '100', '0'], 'بعد الإلغاء: «له» المفتوحة تسدّ الأقدم (50 من 100) والأحدث يبقى كاملاً');
  t.eq((await one('select reason from public.party_entries where id = $1', [unpaid.value.id])).reason, 'سبب الإلغاء', 'القيد العكسي يحمل سبب الإلغاء');

  // ── القبض وإلغاؤه: نتيجته تسمّي حركته ومبلغها، والحركة بتاريخ القبض، والعكسية بيوم الإلغاء، والعكس ما ينلغى ─────────────────
  const Pm = await party('جهة حركة القبض');
  const received = await pay('record_party_payment', Pm, B.general, '1000', BOX, D2);
  const receivedMove = await one('select id, on_date::text as on_date from public.cash_moves where party_entry_id = $1', [received.value.id]);
  t.same([received.value.cash_move_id, received.value.money.cash, receivedMove.on_date], [receivedMove.id, '1000', D2], 'نتيجة القبض: معرّف حركته ومبلغها، والحركة بتاريخ القبض');
  const unreceived = await voidPayment(received.value.id);
  const backMove = await one('select on_date::text as on_date from public.cash_moves where reverses_move_id = $1', [receivedMove.id]);
  t.same([shown(unreceived), backMove?.on_date, shown(await voidPayment(unreceived.value.id))], ['ok', TODAY, 'not_a_payment'], 'الحركة العكسية بيوم الإلغاء، والقيد العكسي ما ينلغى كقبض');
  // إلغاء القبض يقفل الجهة (§2.3): دفع لنفس الجهة من صندوق ثاني بنفس اللحظة ينتظره (مو يتوزّع على قبض ينلغى، توزيع زايد).
  const Pl = await party('جهة إلغاء ودفع بصندوقين');
  const toVoid = await pay('record_party_payment', Pl, B.general, '1000');
  t.same(
    await race(db, { user: U.manager, sql: 'select public.void_party_payment($1, $2, $3)', params: [toVoid.value.id, 'قبض خاطئ', uid()] }, { user: U.manager2, sql: 'select public.pay_party($1, $2, $3, $4, $5, $6, $7)', params: [uid(), Pl, B.general, '400', BANK, TODAY, uid()] }),
    { first: 'ok', state: 'blocked', second: 'ok' },
    'إلغاء قبض ودفع لنفس الجهة بصندوق ثاني بنفس اللحظة: الدفع ينتظر قفل الجهة',
  );
  t.same((await remainders(db, Pl, B.general)).map((r) => [r.kind, r.amount, r.remaining]), [['payment', '-1000', '0'], ['payment', '1000', '0'], ['payout', '400', '400']], 'والدفع بعده ما يتوزّع على القبض الملغى');
  const orphan = await probe(async ({ q, entry }) => {
    const lone = await entry('payment', -100, { docKind: 'receipt', docId: uid() });
    await q('select public.void_party_payment($1, $2, $3)', [lone, 'خطأ', uid()]);
  });
  t.eq(orphan, 'cash_move_missing', 'قبض بلا حركة صندوقه: cash_move_missing، مو رفض غامض');
  // المدير المحصور بالمعمل ما يلغي من دفتر برّا نطاقه (E49).
  const Pk = await party('جهة النطاق');
  const chicksPay = await pay('record_party_payment', Pk, B.chicks, '1000');
  const chicksAdjust = await adjust(Pk, B.chicks, 'debit', '500');
  const millPay = await pay('record_party_payment', Pk, B.feed_mill, '1000');
  t.same(
    [shown(await voidPayment(chicksPay.value.id, 'خطأ', U.millManager)), shown(await voidEntry(chicksAdjust.value.id, 'خطأ', U.millManager)), shown(await voidPayment(millPay.value.id, 'خطأ', U.millManager))],
    ['out_of_scope', 'out_of_scope', 'ok'],
    'المدير المحصور بالمعمل: إلغاء قبض أو قيد بدفتر الأفراخ out_of_scope، وبدفتر المعمل يمرّ',
  );
  // الإعفاء برصيد دفتره وحده.
  const Pb = await party('جهة دفترين بإشارتين');
  t.same([shown(await adjust(Pb, B.feed_mill, 'debit', '1000')), shown(await adjust(Pb, B.chicks, 'credit', '5000'))], ['ok', 'ok'], 'ضابط: «عليه» 1,000 بالمعمل و«له» 5,000 بالأفراخ');
  t.eq(shown(await forgive(Pb, B.feed_mill, '2000')), 'exceeds_balance', 'الإعفاء بالمعمل لا يزيد على رصيد المعمل (1,000)، مو صافي الدفترين');

  // ── النقل وإلغاؤه ───────────────────────────────────────────────────────────────────────────────────────────
  const noted = await transfer(BOX, BANK, '100', TODAY, 'إيداع يومي');
  t.same((await rows("select note from public.cash_moves where doc_id = $1 order by amount", [noted.value.id])).map((r) => r.note), ['إيداع يومي', 'إيداع يومي'], 'ملاحظة النقل على وجهيه');
  t.same([shown(await transfer(BOX, BANK, '100', TODAY, 'ن'.repeat(501))), shown(await transfer(BOX, BANK, '100', '2026-10-31'))], ['note_too_long', 'date_in_future'], 'ملاحظة 501 حرف، والنقل بالمستقبل، يرفضان');
  const T1 = await transfer(BOX, BANK, '100');
  const T2 = await transfer(BOX, BANK, '200');
  const undone = await voidMove(T1.value.id);
  t.same([shown(undone), shown(await voidMove(undone.value.reversals[0]))], ['ok', 'void_from_source'], 'ضابط: إلغاء نقل، والحركة العكسية نفسها ما تنلغى');
  t.eq((await one('select count(*)::int as n from public.cash_moves r join public.cash_moves o on o.id = r.reverses_move_id where o.doc_id = $1', [T2.value.id])).n, 0, 'إلغاء نقل ما يمسّ نقلاً ثانياً');
  const Z2 = await box('صندوق يستلم نقلاً ثم يُؤرشف');
  const Pz2 = await party('جهة صندوق النقل');
  const T3 = await transfer(BOX, Z2, '100');
  t.same([shown(T3), shown(await pay('pay_party', Pz2, B.general, '100', Z2)), shown(await archive('cash_accounts', Z2)), shown(await voidMove(T3.value.id))], ['ok', 'ok', 'ok', 'ok'], 'إلغاء نقل لصندوق انؤرشف بعده بلا رصيد يمرّ (E43)');
  const T4 = await transfer(BOX, BANK, '100', D2);
  t.eq(shown(await voidMove(T4.value.id, 'نقل مكرّر')), 'ok', 'ضابط: إلغاء نقل بتاريخ سابق');
  t.same(await rows("select on_date::text as on_date, note from public.cash_moves where reverses_move_id is not null and doc_id = $1 order by amount", [T4.value.id]), [{ on_date: TODAY, note: 'نقل مكرّر' }, { on_date: TODAY, note: 'نقل مكرّر' }], 'الحركتان العكسيتان بيوم الإلغاء وبسببه');
  // قفل ترتيب الصناديق (§2.3): النقل من الأعلى للأدنى يقفل الأدنى أوّلاً، فيده فارغة لمّا ينتظر (بلا 40P01 ويّا قافل للأعلى).
  const [low, high] = [await box('صندوق القفل الأوّل'), await box('صندوق القفل الثاني')].sort();
  const standIn = await db.session(U.manager2);
  const mover = await db.session(U.manager);
  let boxOrder;
  try {
    const held = await standIn.run('select id from public.cash_accounts where id = $1 for update', [low]);
    const moving = mover.run('select public.transfer_cash($1, $2, $3, $4, $5, $6, $7)', [uid(), high, low, '100', TODAY, null, uid()]);
    const state = await db.settle(moving, mover.pid);
    const second = await standIn.run('select id from public.cash_accounts where id = $1 for update', [high]);
    await standIn.commit();
    const moved = await moving;
    await mover.commit();
    boxOrder = { held: held.ok, state, second: second.ok ? 'ok' : second.error, moved: moved.ok ? 'ok' : moved.error };
  } finally {
    await standIn.rollback();
    await mover.rollback();
  }
  t.same(boxOrder, { held: true, state: 'blocked', second: 'ok', moved: 'ok' }, 'النقل يقفل الصندوقين بترتيب المعرّف: قافل للأعلى يمرّ والنقل ينتظر، بلا 40P01');

  // ── المعاينة ─────────────────────────────────────────────────────────────────────────────────────────────────
  const preview = (user, p, book, kind, amount) => as(user, 'select public.preview_party_allocation($1, $2, $3, $4)', [p, book, kind, amount]);
  const forgiven = await preview(U.manager, Pb, B.feed_mill, 'forgiveness', '500');
  t.same(
    [shown(await preview(U.accountant, Pb, B.feed_mill, 'adjustment', '500')), shown(await preview(U.accountant, Pb, B.feed_mill, 'opening', '500')), shown(await preview(U.manager, Pb, B.feed_mill, 'adjustment', '500'))],
    ['forbidden', 'forbidden', 'ok'],
    'معاينة التسوية والافتتاح للمدير مو للمحاسب (party.adjust وopening.post)',
  );
  const fm = forgiven.value?.money;
  t.same([fm?.amount, fm?.balance_before, fm?.balance_after], ['-500', '1000', '500'], 'معاينة الإعفاء: بعكس رصيد الدفتر (1,000 بالمعمل، مو صافي الدفترين) والرصيد بعدها');
  t.same([shown(await preview(U.manager, Pb, B.feed_mill, 'forgiveness', '-500')), shown(await preview(U.manager, Pz, B.general, 'forgiveness', '500'))], ['amount_not_positive', 'balance_zero'], 'معاينة إعفاء بالسالب أو برصيد صفر ترفض');
  const open = (await preview(U.manager, Pre, B.general, 'payment', '10')).value.money.open;
  t.same(open.map((e) => [e.entry_id, e.remaining]), [[A.value.id, '50'], [Bd.value.id, '100']], 'المعاينة تعرض القيود المفتوحة بس (المسدود والعكسي برّاها)');

  // ── التقارير ────────────────────────────────────────────────────────────────────────────────────────────────
  const backwards = ['2026-10-30', '2026-10-01'];
  t.same(
    [
      shown(await as(U.accountant, 'select public.report_accounts_summary($1, $2)', backwards)),
      shown(await as(U.accountant, "select public.report_party_balances($1, $2, null, true, 'balance', null, null, 50)", backwards)),
      shown(await as(U.accountant, 'select public.report_party_statement($1, null, $2, $3)', [Pa, ...backwards])),
      shown(await as(U.accountant, 'select public.report_cash_balances($1, $2)', backwards)),
      shown(await as(U.accountant, 'select public.report_cash_statement($1, $2, $3)', [BOX, ...backwards])),
      shown(await as(U.accountant, 'select public.report_party_statement($1, null, $2, $3)', [uid(), '2026-01-01', TODAY])),
      shown(await as(U.accountant, 'select public.report_cash_statement($1, $2, $3)', [uid(), '2026-01-01', TODAY])),
      shown(await as(U.accountant, "select public.report_party_balances($1, $2, null, true, 'weird', null, null, 50)", ['2026-01-01', TODAY])),
    ],
    ['period_required', 'period_required', 'period_required', 'period_required', 'period_required', 'party_not_found', 'cash_account_not_found', 'sort_unknown'],
    'المدّة المعكوسة بكل تقرير، والجهة والصندوق المجهولان، والترتيب المجهول',
  );
  // الملخّص = المعادلة من الصفوف الخام: «لنا» و«علينا» لكل دفتر، وعدد الجهات غير الصفرية لكل وحدة وللمشروع، والجهات غير المؤرشفة،
  // بتاريخ p_to (اليوم ويوم سابق). الصفوف الخام مرتّبة بالدفتر مثل book_totals (order by book_id): group by بلا order by يطلع بترتيب
  // الخطّة ومعرّفات الدفاتر عشوائية، فـ«لكل دفتر» انكسر بالحزمة الكاملة بترتيب المفاتيح بس والقيم نفسها (0011، درس WP7).
  for (const to of [TODAY, D3]) {
    const summary = (await as(U.accountant, 'select public.report_accounts_summary($1, $2)', ['2026-01-01', to])).value;
    const raw = await rows(
      'select e.party_id, e.book_id, b.division_id, sum(e.amount) as balance from public.party_entries e join public.ledger_books b on b.id = e.book_id where e.org_id = $1 and e.on_date <= $2 group by 1, 2, 3 order by 2, 1',
      [ORG, to],
    );
    const nonzero = raw.filter((r) => Number(r.balance) !== 0);
    const byBook = {};
    for (const r of raw) {
      const cell = (byBook[r.book_id] ??= { receivable: 0, payable: 0 });
      cell[Number(r.balance) > 0 ? 'receivable' : 'payable'] += Math.abs(Number(r.balance));
    }
    const expectedDivisions = Object.fromEntries(summary.divisions.map((d) => [d.division_id, new Set(nonzero.filter((r) => r.division_id === d.division_id).map((r) => r.party_id)).size]));
    const partiesAll = (await one('select count(*)::int as n from public.parties where org_id = $1 and archived_at is null', [ORG])).n;
    t.same(
      {
        divisions: Object.fromEntries(summary.divisions.map((d) => [d.division_id, d.parties_nonzero])),
        project: [summary.project.parties_nonzero, summary.project.parties_all, summary.project.receivable],
        books: Object.fromEntries(summary.book_totals.map((b) => [b.book_id, [Number(b.receivable), Number(b.payable)]])),
      },
      {
        divisions: expectedDivisions,
        project: [new Set(nonzero.map((r) => r.party_id)).size, partiesAll, String(Object.values(byBook).reduce((sum, b) => sum + b.receivable, 0))],
        books: Object.fromEntries(Object.entries(byBook).map(([book, b]) => [book, [b.receivable, b.payable]])),
      },
      `ملخّص الحسابات بتاريخ ${to} = الصفوف الخام: الجهات غير الصفرية لكل وحدة وللمشروع، والجهات غير المؤرشفة، و«لنا»/«علينا» لكل دفتر`,
    );
  }
  // فلتر الوحدة: أعمدة دفاترها وخاناتها بس.
  const millOnly = (await as(U.accountant, "select public.report_party_balances($1, $2, $3, false, 'name', null, null, 200)", ['2026-01-01', TODAY, D.feed_mill])).value;
  t.same([[...new Set(millOnly.books.map((b) => b.book_id))], [...new Set(millOnly.rows.flatMap((r) => r.cells.map((c) => c.book_id)))]], [[B.feed_mill], [B.feed_mill]], 'فلتر المعمل: عمود دفتر المعمل وحده وخاناته');
  // خانة الجهة على حدود المدّة: المدوَّر قبل p_from، والحركة داخلها، والرصيد بتاريخ p_to، وأقدم مفتوح، والافتتاح الملغى برّا.
  const Pw = await party('جهة النافذة');
  t.same([shown(await adjust(Pw, B.general, 'debit', '1000', D3)), shown(await pay('record_party_payment', Pw, B.general, '300'))], ['ok', 'ok'], 'ضابط: «عليه» 1,000 يوم 27/10 وقبض 300 اليوم');
  const cellOf = async (p, from, to, book = B.general) => {
    const page = (await as(U.accountant, "select public.report_party_balances($1, $2, null, false, 'name', $3, null, 200)", [from, to, null])).value;
    return page.rows.find((r) => r.party_id === p)?.cells.find((c) => c.book_id === book);
  };
  const cellA = await cellOf(Pw, D3, '2026-10-29');
  const cellB = await cellOf(Pw, D2, TODAY);
  t.same([[cellA.opening, cellA.debit, cellA.credit, cellA.closing], [cellB.opening, cellB.debit, cellB.credit, cellB.closing]], [['0', '1000', '0', '1000'], ['1000', '0', '300', '700']], 'خانة الجهة: المدوَّر قبل p_from، والحركة داخل المدّة، والرصيد بتاريخ p_to');
  const Po = await party('جهة أقدم مفتوح');
  t.same([shown(await adjust(Po, B.general, 'debit', '100', '2026-10-26')), shown(await pay('record_party_payment', Po, B.general, '100')), shown(await adjust(Po, B.general, 'debit', '50', D2))], ['ok', 'ok', 'ok'], 'ضابط: قيد قديم مسدود وقيد أحدث مفتوح');
  t.eq((await cellOf(Po, '2026-01-01', TODAY)).oldest, D2, 'أقدم قيد مفتوح، مو أقدم قيد');
  const Pv = await party('جهة افتتاح ملغى');
  const voided = await opening(Pv, B.general, '1000', '2026-09-30');
  t.same([shown(voided), shown(await voidEntry(voided.value.id))], ['ok', 'ok'], 'ضابط: افتتاح ثم إلغاؤه');
  t.eq((await cellOf(Pv, '2026-01-01', TODAY)).opening_entry_id, null, 'الافتتاح الملغى مو «الافتتاح الفعّال» بالخانة');
  // الترتيب بالأكبر = Σ |رصيد كل دفتر|، والجهة بدفترين متعاكسين صافيهما صفر «غير صفرية»، والبحث يحتوي الاسم.
  const W = { a: await party('وزن أ'), b: await party('وزن ب'), c: await party('وزن ج') };
  for (const [p, book, direction, amount] of [[W.a, B.feed_mill, 'debit', '1000'], [W.a, B.chicks, 'credit', '900'], [W.b, B.general, 'debit', '500'], [W.c, B.feed_mill, 'debit', '1000'], [W.c, B.chicks, 'credit', '1000']]) {
    t.eq(shown(await adjust(p, book, direction, amount)), 'ok', 'ضابط: قيد وزن');
  }
  const weighed = (await as(U.accountant, "select public.report_party_balances($1, $2, null, true, 'balance', $3, null, 50)", ['2026-01-01', TODAY, 'وزن'])).value.rows.map((r) => r.party_id);
  t.same(weighed, [W.c, W.a, W.b], 'الأكبر رصيداً بمجموع |دفاتره| (2,000 ثم 1,900 ثم 500)، والصافي صفر يبقى بغير الصفرية، والبحث «وزن» يلكى الثلاثة');
  // الصفحات: كل ترتيب وكل فلتر، بصفحتين صفّين، = القائمة الكاملة بالضبط بلا تكرار ولا نقص، والعدد الكلّي من الفلتر.
  const paging = {};
  for (const sort of ['balance', 'oldest', 'name']) {
    for (const nonzero of [true, false]) {
      const fullPage = (await as(U.accountant, 'select public.report_party_balances($1, $2, null, $3, $4, null, null, 200)', ['2026-01-01', TODAY, nonzero, sort])).value;
      const seen = [];
      let after = null;
      let total = null;
      for (let guard = 0; guard < 100; guard += 1) {
        const page = (await as(U.accountant, 'select public.report_party_balances($1, $2, null, $3, $4, null, $5, 2)', ['2026-01-01', TODAY, nonzero, sort, after])).value;
        if (guard === 0) total = page.total;
        seen.push(...page.rows.map((r) => r.party_id));
        if (!page.next) break;
        after = page.next;
      }
      const full = fullPage.rows.map((r) => r.party_id);
      paging[`${sort}/${nonzero}`] = JSON.stringify(seen) === JSON.stringify(full) && total === full.length && fullPage.total === full.length && full.length > 4 ? 'ok' : { seen: seen.length, full: full.length, total };
    }
  }
  t.same(paging, Object.fromEntries(Object.keys(paging).map((key) => [key, 'ok'])), 'الصفحات بكل ترتيب وفلتر = القائمة الكاملة بترتيبها، والعدد الكلّي عدد الفلتر');
  // كشف الجهة على حدود المدّة، وبترتيب (التاريخ، الترتيب).
  const statementOf = async (p, from) => (await as(U.accountant, 'select public.report_party_statement($1, $2, $3, $4)', [p, B.general, from, TODAY])).value.books[0];
  const [wide, narrow] = [await statementOf(Pw, D3), await statementOf(Pw, D2)];
  t.same(
    [[wide.brought_forward, wide.total_debit, wide.closing, wide.lines.map((l) => l.balance)], [narrow.brought_forward, narrow.total_debit, narrow.total_credit, narrow.closing, narrow.lines.map((l) => l.balance)]],
    [['0', '1000', '700', ['1000', '700']], ['1000', '0', '300', '700', ['700']]],
    'الكشف: المدوَّر قبل p_from، والمجاميع داخل المدّة، والرصيد الجاري يبدي من المدوَّر',
  );
  const ordered = await statementOf(Pd, '2026-01-01');
  t.same([ordered.lines.map((l) => l.entry_id), ordered.lines.map((l) => l.balance)], [[dated.value.id, todayFirst.value.id, PdPay.value.id], ['100', '200', '100']], 'سطور الكشف ورصيدها الجاري بترتيب (التاريخ، الترتيب)، مو ترتيب الإدخال');
  // الصناديق على حدود المدّة، والمجموع، و«له افتتاح» بعد إلغائه، والكشف.
  const Qc = await box('صندوق الحدود');
  const Pcash = await party('جهة الصندوق');
  const cashSteps = [
    await cashOpening(Qc, '1000', '2026-09-22'),
    await pay('record_party_payment', Pcash, B.general, '200', Qc, D3),
    await pay('pay_party', Pcash, B.general, '50', Qc),
    await pay('record_party_payment', Pcash, B.general, '30', Qc, '2026-10-26'),
  ];
  t.same(cashSteps.map(shown), ['ok', 'ok', 'ok', 'ok'], 'ضابط: افتتاح وقبض 27/10 ودفع اليوم وقبض 26/10 (انسجّل آخراً)');
  const boxIn = async (from, to) => {
    const report = (await as(U.accountant, 'select public.report_cash_balances($1, $2)', [from, to])).value;
    const row = report.accounts.find((a) => a.account_id === Qc);
    return { row: [row.opening, row.inflow, row.outflow, row.closing], total: report.total.closing === String(report.accounts.reduce((sum, a) => sum + Number(a.closing), 0)) };
  };
  t.same([await boxIn(D3, '2026-10-29'), await boxIn(D2, TODAY)], [{ row: ['1030', '200', '0', '1230'], total: true }, { row: ['1230', '0', '50', '1180'], total: true }], 'رصيد الصندوق: المدوَّر قبل p_from، والوارد والصادر موجبان داخل المدّة، والرصيد بتاريخ p_to، والمجموع = مجموع الصناديق');
  const Qv = await box('صندوق افتتاح ملغى');
  const qvOpening = await cashOpening(Qv, '1000', '2026-09-22');
  t.eq(shown(await voidMove(qvOpening.value.id)), 'ok', 'ضابط: إلغاء افتتاح صندوق');
  const flags = (await as(U.accountant, 'select public.report_cash_balances($1, $2)', ['2026-01-01', TODAY])).value.accounts;
  t.same([flags.find((a) => a.account_id === Qv).has_opening, flags.find((a) => a.account_id === Qc).has_opening], [false, true], 'الافتتاح الملغى مو «له افتتاح»');
  const cashStatement = async (from) => (await as(U.accountant, 'select public.report_cash_statement($1, $2, $3)', [Qc, from, TODAY])).value;
  const recent = await cashStatement(D3);
  t.same(
    [recent.brought_forward, recent.total_in, recent.total_out, recent.closing, recent.lines.map((l) => l.balance), recent.lines[0].party, /^RC-2026-\d{4}$/u.test(recent.lines[0].doc_no ?? '')],
    ['1030', '200', '50', '1180', ['1230', '1180'], 'جهة الصندوق', true],
    'كشف الصندوق: المدوَّر قبل p_from، والوارد والصادر، والرصيد الجاري من المدوَّر، وسطر القبض باسم جهته ورقمه',
  );
  t.same((await cashStatement('2026-09-01')).lines.map((l) => l.balance), ['1000', '1030', '1230', '1180'], 'الرصيد الجاري للصندوق بترتيب (التاريخ، الترتيب)، مو ترتيب الإدخال');
  // الرئيسية: الصناديق بالسالب بس (الصفر مو سالب)، و«لنا» بلا تصافٍ = الملخّص.
  const Zb = await box('صندوق صفر');
  t.same([shown(await cashOpening(Zb, '100', '2026-09-22')), shown(await pay('pay_party', Pcash, B.general, '100', Zb))], ['ok', 'ok'], 'ضابط: صندوق صار صفراً');
  const home = (await as(U.accountant, 'select public.home_summary()')).value.accounts;
  const negatives = (await one('select count(*)::int as n from (select account_id from public.cash_moves where org_id = $1 group by 1 having sum(amount) < 0) as x', [ORG])).n;
  const project = (await as(U.accountant, 'select public.report_accounts_summary($1, $2)', ['2026-01-01', TODAY])).value.project;
  t.same([home.negative_boxes, home.receivable, home.payable], [negatives, project.receivable, project.payable], 'الرئيسية: عدد الصناديق السالبة (الصفر برّا)، و«لنا» و«علينا» = الملخّص بلا تصافٍ');

  // ── سنة رقم المستند سنة تاريخه، والرقم يكبر بعد 9999 ─────────────────────────────────────────────────────────
  const Py = await party('جهة آخر السنة');
  const lateYear = await db.setToday('2027-01-03', () => pay('record_party_payment', Py, B.general, '1000', BOX, '2026-12-30'));
  t.ok(/^RC-2026-\d{4}$/u.test(lateYear.value?.doc_no ?? ''), `قبض بتاريخ 30/12/2026 يوم 03/01/2027 رقمه بسنة 2026 (${lateYear.value?.doc_no ?? shown(lateYear)})`);

  // ═══ ٣. السباقات بجلستين، بمنشأة لحالها (الوحدات بلا ترحيل، وقفل الفترة يتقدّم) ═════════════════════════════════════
  const O3 = await makeOrg(db, { name: 'منشأة سباقات القواعد', ...orgIds('d6200000', '96477095200'), roles: [['owner', 'owner'], ['manager', 'manager'], ['manager2', 'manager']] });
  const asO3 = (sql, params) => call(db, O3.users.manager, sql, params);
  for (const kind of ['general', 'broiler', 'layer']) await asO3('select public.set_division_go_live($1, $2)', [O3.divisions[kind], '2026-10-25']);
  const o3Party = async (name) => (await asO3('insert into public.parties (name, is_customer) values ($1, true) returning id', [name])).value;
  const Bg = (await asO3("insert into public.cash_accounts (name, kind) values ('صندوق السباقات', 'cash') returning id")).value;
  const Pg = await o3Party('جهة يوم التشغيل');
  t.same(
    await race(db, { user: O3.users.manager2, sql: 'select public.set_division_go_live($1, $2::date)', params: [O3.divisions.general, D2] }, { user: O3.users.manager, sql: 'select public.record_party_payment($1, $2, $3, $4, $5, $6, $7)', params: [uid(), Pg, O3.books.general, '1000', Bg, '2026-10-26', uid()] }),
    { first: 'ok', state: 'blocked', second: 'before_go_live' },
    'أوّل ترحيل بالوحدة ينتظر صفّها: يوم التشغيل اللي ينتقل بنفس اللحظة لـ28/10 يرفض قبضاً بتاريخ 26/10',
  );
  const Pg2 = await o3Party('جهة ترتيب الافتتاح');
  t.same(
    await lockOrder(db, { standIn: O3.users.manager2, poster: O3.users.manager, party: Pg2, division: O3.divisions.broiler, day: '2026-10-25', sql: 'select public.record_opening_balance($1, $2, $3, $4, $5, $6)', params: [uid(), Pg2, O3.books.broiler, '1000', '2026-10-25', uid()] }),
    { held: true, state: 'blocked', division: 'ok', posted: 'ok' },
    'الافتتاح يقفل الجهة قبل صفّ الوحدة (§2.3): بلا 40P01 ضدّ مستند يقفل الجهة ثم الوحدة',
  );
  const Pg3 = await o3Party('جهة ترتيب التسوية');
  t.same(
    await lockOrder(db, { standIn: O3.users.manager2, poster: O3.users.manager, party: Pg3, division: O3.divisions.layer, day: '2026-10-25', sql: 'select public.record_party_adjustment($1, $2, $3, $4, $5, $6, $7, $8)', params: [uid(), Pg3, O3.books.layer, 'debit', '1000', TODAY, 'فاتورة', uid()] }),
    { held: true, state: 'blocked', division: 'ok', posted: 'ok' },
    'التسوية تقفل الجهة قبل صفّ الوحدة (§2.3)',
  );
  // الرقم بعد 9999 خمس خانات (ضابط بمعاملة ترجع: العدّاد عند 9999).
  const wide10000 = await db.asOwner(async (q) => {
    await q("insert into public.doc_counters (org_id, kind, year, last_no) values ($1, 'PY', 2026, 9999)", [O3.org]);
    return (await q("select public.pay_party($1, $2, $3, $4, $5, $6, $7) ->> 'doc_no' as v", [uid(), Pg, O3.books.general, '1000', Bg, TODAY, uid()])).rows[0].v;
  }, O3.users.owner);
  t.eq(wide10000, 'PY-2026-10000', 'بعد PY-2026-9999 يجي PY-2026-10000 (مو يتقصّ لأربع خانات)');
  // قفل الفترة ضدّ افتتاح الجهة وافتتاح الصندوق والنقل بنفس اللحظة: كل واحد ينام على القفل ثم period_locked.
  const O4 = await makeOrg(db, { name: 'منشأة قفل القواعد', ...orgIds('d6300000', '96477095300'), roles: [['owner', 'owner'], ['manager', 'manager'], ['manager2', 'manager']] });
  const asO4 = (sql, params) => call(db, O4.users.manager2, sql, params);
  await asO4('select public.set_division_go_live($1, $2)', [O4.divisions.general, '2026-09-30']);
  const Pp = (await asO4("insert into public.parties (name, is_customer) values ('جهة القفل', true) returning id")).value;
  const Bp = (await asO4("insert into public.cash_accounts (name, kind) values ('صندوق القفل', 'cash') returning id")).value;
  const Bp2 = (await asO4("insert into public.cash_accounts (name, kind) values ('صندوق القفل الثاني', 'cash') returning id")).value;
  const lockRace = (day, sql, params) => race(db, { user: O4.users.manager, sql: 'select public.set_period_lock($1)', params: [day] }, { user: O4.users.manager2, sql, params });
  t.same(
    {
      opening: await lockRace('2026-09-20', 'select public.record_opening_balance($1, $2, $3, $4, $5, $6)', [uid(), Pp, O4.books.general, '1000', '2026-09-20', uid()]),
      cashOpening: await lockRace('2026-09-22', 'select public.record_cash_opening($1, $2, $3, $4, $5)', [uid(), Bp, '1000', '2026-09-22', uid()]),
      transfer: await lockRace('2026-10-25', 'select public.transfer_cash($1, $2, $3, $4, $5, $6, $7)', [uid(), Bp, Bp2, '100', '2026-10-25', null, uid()]),
    },
    Object.fromEntries(['opening', 'cashOpening', 'transfer'].map((key) => [key, { first: 'ok', state: 'blocked', second: 'period_locked' }])),
    'قفل الفترة بنفس اللحظة: افتتاح الجهة وافتتاح الصندوق والنقل بيومه ينامون على القفل ثم period_locked',
  );

  // ═══ ٤. فروع verify_ledger (ضوابط بمعاملات ترجع، بمنشأة هالملف) ═══════════════════════════════════════════════════
  const breakProbe = async (statements) => {
    try {
      return await db.asOwner(async (q) => {
        await statements(tools(q));
        return verifyLedger(q);
      }, U.owner);
    } catch (error) {
      return `رمى: ${error.message}`;
    }
  };
  const expectOnly = (label, broken, expected) => {
    const many = Object.entries(expected).filter(([, v]) => v === 'many').map(([k]) => k);
    if (!many.length) return t.same(broken, { ...LEDGER_ZERO, ...expected }, label);
    const fixed = Object.fromEntries(Object.entries(typeof broken === 'string' ? {} : broken).filter(([k]) => !many.includes(k)));
    t.ok(typeof broken !== 'string' && many.every((k) => broken[k] > 0) && JSON.stringify(fixed) === JSON.stringify(Object.fromEntries(Object.entries({ ...LEDGER_ZERO, ...expected }).filter(([k]) => !many.includes(k)))), `${label} (${JSON.stringify(broken)})`);
  };
  const dropChecks = async (q, table, pattern) => {
    for (const { conname } of (await q("select conname from pg_constraint where conrelid = $1::regclass and conname ~ $2", [`public.${table}`, pattern])).rows) {
      await q(`alter table public.${table} drop constraint ${conname}`);
    }
  };
  const payment2025 = async (entry, move, docNo) => move('party_payment', 100, { entry: await entry('payment', -100, { docNo, onDate: '2025-12-30' }), onDate: '2025-12-30' });
  const BRANCHES = [
    // المتبقّي فوك |المبلغ|: فكّ أكبر من توزيعه (مشغّل التوزيع مطفي) يرجّع للقيدين أكثر من مبلغهما.
    ['entry_remaining_range: متبقٍّ فوك المبلغ', { entry_remaining_range: 2, allocation_pairs: 1, allocation_completeness: 1 }, async ({ q, entry, alloc }) => {
      await q('alter table public.party_allocations disable trigger party_allocations_check');
      const [d, c] = [await entry('adjustment', 100), await entry('adjustment', -100)];
      await alloc(d, c, -80, { reverses: await alloc(d, c, 50) });
    }],
    // العكسي بغير مبلغ أصله، والزوج متوزّع بمبلغ الأصل كاملاً: فرع المبلغ وحده يمسكه بفحص الأزواج.
    ['reversal_pairs: عكسي بنصف المبلغ', { entry_remaining_range: 1, reversal_pairs: 1 }, async ({ q, entry, alloc }) => {
      await q('alter table public.party_entries disable trigger party_entries_check');
      const a = await entry('adjustment', 100);
      await alloc(a, await entry('adjustment', -50, { reverses: a }), 100);
    }],
    // العكسي بمبلغه الصحيح بس الزوج مو مغلق (متوزّع 60 من 100).
    ['reversal_pairs: زوج غير مغلق', { reversal_pairs: 1, allocation_completeness: 1 }, async ({ entry, alloc }) => {
      const a = await entry('adjustment', 100);
      await alloc(a, await entry('adjustment', -100, { reverses: a }), 60);
    }],
    // الحركة العكسية (مشغّلها مطفي): بصندوق غير صندوق أصلها، وبمستند غير مستنده، وبقيد غير القيد العكسي لقيده.
    ['cash_move_reversals: عكسية بصندوق ثاني', { cash_move_reversals: 1 }, async ({ q, move }) => {
      await q('alter table public.cash_moves disable trigger cash_moves_check');
      await move('opening', -100, { box: BOX1, reverses: await move('opening', 100) });
    }],
    ['cash_move_reversals: عكسية بمستند', { cash_move_reversals: 1, cash_move_sources: 1 }, async ({ q, move }) => {
      await q('alter table public.cash_moves disable trigger cash_moves_check');
      await move('opening', -100, { docKind: 'cash_transfer', docId: uid(), reverses: await move('opening', 100) });
    }],
    ['cash_move_reversals: عكسية بقيد الأصل', { payment_cash_moves: 1, cash_move_sources: 1, cash_move_reversals: 1 }, async ({ q, entry, alloc, move }) => {
      await q('alter table public.cash_moves disable trigger cash_moves_check');
      const paid = await entry('payment', -100, { docKind: 'receipt', docId: uid() });
      const m = await move('party_payment', 100, { entry: paid });
      const back = await entry('payment', 100, { docKind: 'receipt', docId: uid(), reverses: paid });
      await alloc(back, paid, 100);
      await move('party_payment', -100, { entry: paid, reverses: m });
    }],
    // وجها النقل بصندوقين مختلفين بس مجموعهما مو صفر.
    ['cash_transfer_legs: وجهان مجموعهما غير صفر', { cash_transfer_legs: 1 }, async ({ move }) => {
      await move('transfer', -100, { docKind: 'cash_transfer', docId: doc });
      await move('transfer', 50, { docKind: 'cash_transfer', docId: doc, box: BOX1 });
    }],
    ['allocation_pairs: توزيع بدفتر غير دفتر قيديه', { allocation_pairs: 1, allocation_completeness: 1 }, async ({ q, entry, alloc }) => {
      for (const { conname } of (await q("select conname from pg_constraint where conrelid = 'public.party_allocations'::regclass and contype = 'f' and pg_get_constraintdef(oid) like '%book_id%'")).rows) {
        await q(`alter table public.party_allocations drop constraint ${conname}`);
      }
      await alloc(await entry('adjustment', 100), await entry('adjustment', -100), 100, { book: B.feed_mill });
    }],
    ['whole_dinar: حركة صندوق بكسر', { whole_dinar: 1 }, async ({ q, move }) => {
      await dropChecks(q, 'cash_moves', '^cash_moves_amount_check$');
      await move('opening', '100.5');
    }],
    ['whole_dinar: توزيع بكسر', { whole_dinar: 1, allocation_completeness: 1 }, async ({ q, entry, alloc }) => {
      await dropChecks(q, 'party_allocations', '^party_allocations_amount_check$');
      await alloc(await entry('adjustment', 100), await entry('adjustment', -100), '50.5');
    }],
    ['kind_sign: شراء أصلي موجب', { kind_sign: 1 }, async ({ q, entry }) => {
      await dropChecks(q, 'party_entries', '^party_entries_sign_check$');
      await entry('purchase', 100);
    }],
    ['kind_sign: نوع مجهول', { kind_sign: 1 }, async ({ q, entry }) => {
      await dropChecks(q, 'party_entries', '^party_entries_kind_check$');
      await entry('gift', 100);
    }],
    ['doc_numbers: رقم صفر', { doc_numbers: 1 }, async ({ q, entry, move }) => {
      await q("insert into public.doc_counters (org_id, kind, year, last_no) values ($1, 'RC', 2025, 2)", [ORG]);
      await payment2025(entry, move, 'RC-2025-0000');
      await payment2025(entry, move, 'RC-2025-0002');
    }],
    ['doc_numbers: رقم مكرّر', { doc_numbers: 1 }, async ({ q, entry, move }) => {
      await q("insert into public.doc_counters (org_id, kind, year, last_no) values ($1, 'RC', 2025, 2)", [ORG]);
      await payment2025(entry, move, 'RC-2025-0001');
      await payment2025(entry, move, 'RC-2025-0001');
      await payment2025(entry, move, 'RC-2025-0002');
    }],
    ['doc_numbers: رقم بلا عدّاد', { doc_numbers: 1 }, async ({ entry, move }) => {
      await payment2025(entry, move, 'RC-2025-0001');
    }],
    ['ضابط: أرقام 2025 سليمة بعدّادها', {}, async ({ q, entry, move }) => {
      await q("insert into public.doc_counters (org_id, kind, year, last_no) values ($1, 'RC', 2025, 2)", [ORG]);
      await payment2025(entry, move, 'RC-2025-0001');
      await payment2025(entry, move, 'RC-2025-0002');
    }],
    ['report_formulas: تقرير يرمي', { report_formulas: 'many' }, async ({ q }) => {
      await q("create or replace function public.report_accounts_summary(p_from date, p_to date) returns jsonb language plpgsql stable set search_path = public, pg_temp as $$ begin raise exception 'boom'; end $$");
    }],
  ];
  for (const [label, expected, statements] of BRANCHES) expectOnly(`ضابط فرع: ${label}`, await breakProbe(statements), expected);
  const claims = await db.asService(async (q) => {
    const before = (await q("select current_setting('request.jwt.claims', true) as v")).rows[0].v;
    await q('select * from public.verify_ledger()');
    return [before, (await q("select current_setting('request.jwt.claims', true) as v")).rows[0].v];
  });
  t.eq(claims[1], claims[0], 'verify_ledger يرجّع هويّة المتّصل كما كانت (مو هويّة آخر مالك استعارها)');

  // ── آخر الملف (القفل يبقى): الإلغاء بيوم مقفول يرفض لقيد التسوية ولحركة الصندوق؛ وأوّل ترحيل بقي ختم الوحدة ──────────────
  const lastAdjust = await adjust(Pi, B.general, 'debit', '100');
  const lastTransfer = await transfer(BOX, BANK, '100');
  t.eq(shown(await asM('select public.set_period_lock($1)', ['2026-10-29'])), 'ok', 'القفل لحد أمس');
  const lockedVoids = await db.setToday('2026-10-29', async () => [shown(await voidEntry(lastAdjust.value.id)), shown(await voidMove(lastTransfer.value.id))]);
  t.same(lockedVoids, ['period_locked', 'period_locked'], 'إلغاء التسوية والنقل بيوم مقفول يرفض (الإلغاء بتاريخ يومه)');
  t.eq((await one('select first_posted_at::text as at from public.divisions where id = $1', [D.general])).at, firstPosted, 'ختم أوّل ترحيل بالوحدة ما يتغيّر بالترحيلات بعده');
}
