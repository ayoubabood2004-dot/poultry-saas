// 0006 بدور authenticated حقيقي (خطّة المرحلة 1 WP3، book-check FOUNDATION ٨٦٣): كل دالّة تكتب نوعها بإشارته المكتوبة، والعكسي
// بالإشارة المعاكسة وبنفس النوع؛ والرفض برموزه (المبلغ والدفتر والصندوق والتاريخ ويوم التشغيل والسبب والرصيد والإلغاء والأرشيف)؛
// وافتتاح واحد فعّال يتعاد بعد إلغائه (E20)؛ والصناديق (Q10: افتتاح ونقل وإلغاؤهما)؛ وفحص الفصل (FOUNDATION ٧٠٣–٧٠٥): «لنا»
// و«علينا» لكل دفتر بلا تصافٍ، والدفتر الغلط يغيّر الدفترين والمجموع نفسه؛ وكشف أبو علي بمثال FOUNDATION ٧٠٢؛ والنطاق بالدفاتر
// (E49: القيود والتوزيعات وسجلّ التدقيق والجدول والملخّص والرئيسية)؛ و«حتى اليوم» بيوم الخادم؛ وصندوق سطر القبض بالكشف؛ وقواعد
// الجهات (الأمين مورّداً بس، والمطبَّع ومفتاح الهاتف، والتوائم بالهاتف)؛ والبحث بالاسم غير البحث بالهاتف؛ وأجوبة الخادم الحقيقية
// بمحلّلات الواجهة. كل منع ويّاه ضابط إيجابي، واليوم ثابت (setToday) حتى التواريخ ما تتبع ساعة الجهاز.
import { loadSrc } from '../../scripts/tests/load-src.mjs';
import { balance, call, loadRepoParsers, makeOrg, shown, uid } from './ledger-kit.mjs';

const TODAY = '2026-10-30';
const id = (n) => `d4000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477091000${String(n).padStart(2, '0')}`;
const sid = (n) => `d1100000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sphone = (n) => `96477091100${String(n).padStart(2, '0')}`;

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const ledger = await loadSrc('src/domain/ledger.ts');
  const L = await makeOrg(db, {
    name: 'مزرعة الدفاتر',
    id,
    phone,
    roles: [['owner', 'owner'], ['manager', 'manager'], ['accountant', 'accountant'], ['millAccountant', 'accountant', ['feed_mill']], ['storekeeper', 'storekeeper'], ['viewer', 'viewer']],
  });
  const { users: U, books: B, divisions: D } = L;
  const as = (user, sql, params) => call(db, user, sql, params);
  const asM = (sql, params) => as(U.manager, sql, params);
  const one = async (sql, params) => (await db.admin(sql, params)).rows[0];

  // ── التجهيز: أيام التشغيل (المعمل والعامة 30/09، المفقس 24/09، الأدوية 28/10، واللحم والبيض بلا يوم)، والجهات والصناديق ─────
  for (const [kind, day] of [['feed_mill', '2026-09-30'], ['hatchery', '2026-09-24'], ['general', '2026-09-30'], ['medicine', '2026-10-28']]) {
    t.eq(shown(await asM('select public.set_division_go_live($1, $2)', [D[kind], day])), 'ok', `يوم تشغيل ${kind} ${day}`);
  }
  const party = async (name, flags = 'is_customer') => (await asM(`insert into public.parties (name, ${flags}) values ($1, true) returning id`, [name])).value;
  const P = await party('أبو علي');
  const Q = await party('مورّد الحبوب', 'is_supplier');
  const Z = await party('جهة للأرشيف');
  const E = await party('جهة الفحص');
  const box = async (name, kind = 'cash') => (await asM('insert into public.cash_accounts (name, kind) values ($1, $2) returning id', [name, kind])).value;
  const BOX = await box('الصندوق');
  const BANK = await box('المصرف', 'bank');
  const SPARE = await box('صندوق للأرشيف');

  const entry = (entryId) => one('select kind, amount::text as amount, doc_no, reverses_entry_id, on_date::text as on_date from public.party_entries where id = $1', [entryId]);
  const opening = (p, book, amount, day = '2026-09-30', user = U.manager) => as(user, 'select public.record_opening_balance($1, $2, $3, $4, $5, $6)', [uid(), p, book, amount, day, uid()]);
  const pay = (fn, p, book, amount, account = BOX, day = TODAY, user = U.manager) => as(user, `select public.${fn}($1, $2, $3, $4, $5, $6, $7)`, [uid(), p, book, amount, account, day, uid()]);
  const adjust = (p, book, direction, amount, reason = 'فرق حساب', day = TODAY) => asM('select public.record_party_adjustment($1, $2, $3, $4, $5, $6, $7, $8)', [uid(), p, book, direction, amount, day, reason, uid()]);
  const forgive = (p, book, amount, reason = 'خصم', day = TODAY) => asM('select public.forgive_debt($1, $2, $3, $4, $5, $6, $7)', [uid(), p, book, amount, day, reason, uid()]);
  const voidPayment = (entryId, reason = 'خطأ') => asM('select public.void_party_payment($1, $2, $3)', [entryId, reason, uid()]);
  const voidEntry = (entryId, reason = 'خطأ') => asM('select public.void_party_entry($1, $2, $3)', [entryId, reason, uid()]);

  // ── book-check: كل دالّة بنوعها وإشارتها، والعكسي بنفس النوع وبالإشارة المعاكسة (FOUNDATION ٣١٣) ─────────────────────────
  const written = {};
  written.openingDebit = await opening(P, B.feed_mill, '500000');
  written.openingCredit = await opening(Q, B.feed_mill, '-200000');
  written.payment = await pay('record_party_payment', P, B.feed_mill, '100000');
  written.payout = await pay('pay_party', Q, B.feed_mill, '50000');
  written.debit = await adjust(P, B.feed_mill, 'debit', '1000');
  written.credit = await adjust(Q, B.feed_mill, 'credit', '2000');
  written.forgiveDebit = await forgive(P, B.feed_mill, '1000');
  written.forgiveCredit = await forgive(Q, B.feed_mill, '2000');
  t.same(Object.fromEntries(Object.entries(written).map(([k, r]) => [k, shown(r)])), Object.fromEntries(Object.keys(written).map((k) => [k, 'ok'])), 'كل دالّة ترحيل نجحت (ضابط إيجابي)');
  const kinds = {};
  for (const [key, result] of Object.entries(written)) {
    const row = await entry(result.value.id);
    kinds[key] = [row.kind, row.amount];
  }
  t.same(
    kinds,
    {
      openingDebit: ['opening', '500000'],
      openingCredit: ['opening', '-200000'],
      payment: ['payment', '-100000'],
      payout: ['payout', '50000'],
      debit: ['adjustment', '1000'],
      credit: ['adjustment', '-2000'],
      forgiveDebit: ['forgiveness', '-1000'],
      forgiveCredit: ['forgiveness', '2000'],
    },
    'كل دالّة بنوعها وإشارتها: الافتتاح والتسوية حسب الحالة، القبض سالب والدفع موجب، والإعفاء بعكس إشارة الرصيد',
  );
  t.same([written.payment.value.doc_no, written.payout.value.doc_no], ['RC-2026-0001', 'PY-2026-0001'], 'القبض برقم RC والدفع برقم PY، كل واحد بتسلسله');
  const moves = await db.admin('select m.kind, m.amount::text as amount, m.account_id = $3 as box from public.cash_moves m where m.party_entry_id = any (array[$1, $2]::uuid[]) order by m.seq', [written.payment.value.id, written.payout.value.id, BOX]);
  t.same(moves.rows, [{ kind: 'party_payment', amount: '100000', box: true }, { kind: 'party_payout', amount: '-50000', box: true }], 'القبض حركة داخلة والدفع حركة خارجة بنفس الصندوق والمبلغ');
  const voids = {
    payment: await voidPayment(written.payment.value.id),
    payout: await voidPayment(written.payout.value.id),
    debit: await voidEntry(written.debit.value.id),
    forgiveCredit: await voidEntry(written.forgiveCredit.value.id),
    openingDebit: await voidEntry(written.openingDebit.value.id),
  };
  const reversed = {};
  for (const [key, result] of Object.entries(voids)) {
    if (!result.ok) {
      reversed[key] = result.code;
      continue;
    }
    const row = await entry(result.value.id);
    const original = await entry(written[key].value.id);
    reversed[key] = [row.kind === original.kind, row.amount === String(-Number(original.amount)), row.reverses_entry_id === written[key].value.id, row.on_date];
  }
  t.same(reversed, Object.fromEntries(Object.keys(voids).map((k) => [k, [true, true, true, TODAY]])), 'كل إلغاء: قيد عكسي بنفس النوع وبالإشارة المعاكسة وبمرجع أصله، بيوم الإلغاء');
  const backMoves = await db.admin(
    `select o.kind, r.amount::text as amount, r.reverses_move_id = o.id as pairs from public.cash_moves o join public.cash_moves r on r.reverses_move_id = o.id
     where o.party_entry_id = any (array[$1, $2]::uuid[]) order by o.seq`,
    [written.payment.value.id, written.payout.value.id],
  );
  t.same(backMoves.rows, [{ kind: 'party_payment', amount: '-100000', pairs: true }, { kind: 'party_payout', amount: '50000', pairs: true }], 'إلغاء القبض والدفع يعكس حركة الصندوق مرّة وحدة');

  // ── افتتاح واحد فعّال لكل (جهة، دفتر)، ويتعاد بعد إلغائه (E20) ───────────────────────────────────────────────────
  t.eq(shown(await opening(Q, B.feed_mill, '-1000')), 'opening_exists', 'افتتاح ثانٍ فعّال لنفس الجهة والدفتر يرفض');
  t.eq(shown(await opening(P, B.feed_mill, '450000')), 'ok', 'بعد إلغاء الافتتاح ينسجّل افتتاح جديد (المعكوس ما يمنع)');
  t.eq(shown(await opening(P, B.chicks, '7000', '2026-09-24')), 'ok', 'ضابط: افتتاح نفس الجهة بدفتر ثاني ينسجّل');

  // ── الرصيد السابق أوّلاً (E8، القاعدة 27): بنفس اليوم، الافتتاح المسجّل بعد قيد عادي ياخذ القبض قبله ─────────────────────
  const E8 = await party('جهة الافتتاح المتأخّر');
  const early = await asM('select public.record_party_adjustment($1, $2, $3, $4, $5, $6, $7, $8)', [uid(), E8, B.medicine, 'debit', '3000', '2026-10-28', 'فاتورة يوم التشغيل', uid()]);
  const lateOpening = await opening(E8, B.medicine, '2000', '2026-10-28');
  const settled = await pay('record_party_payment', E8, B.medicine, '2500');
  t.same([shown(early), shown(lateOpening), shown(settled)], ['ok', 'ok', 'ok'], 'ضابط: قيد يوم التشغيل ثم افتتاح بنفس اليوم ثم قبض');
  t.same(
    settled.value.money.allocations.map((a) => [a.entry_id, a.amount]),
    [[lateOpening.value.id, '2000'], [early.value.id, '500']],
    'القبض للافتتاح أوّلاً (2,000) ثم للأقدم (500)، حتى لو الافتتاح انسجّل بعد قيد بنفس يومه',
  );

  // ── الإلغاء يعيد توزيع ما انفكّ (القاعدة 27): إلغاء قبض قديم يحرّر الفاتورة، وتسوية «له» مفتوحة بعده تسدّها، فما يبقى «عليه»
  //    و«له» مفتوحين سوا بنفس الدفتر (verify_ledger الفحص 10) ─────────────────────────────────────────────────────────
  const RF = await party('جهة إعادة التوزيع');
  const invoice = await adjust(RF, B.feed_mill, 'debit', '100');
  const oldPay = await pay('record_party_payment', RF, B.feed_mill, '60');
  const credit = await adjust(RF, B.feed_mill, 'credit', '100');
  t.same([shown(invoice), shown(oldPay), shown(credit)], ['ok', 'ok', 'ok'], 'ضابط: فاتورة 100 ثم قبض 60 ثم تسوية «له» 100');
  t.eq(shown(await voidPayment(oldPay.value.id)), 'ok', 'إلغاء القبض القديم (مو الأحدث)');
  const flows = (await db.admin(
    `select e.id, (abs(e.amount) - coalesce((select sum(a.amount) from public.party_allocations a where (e.amount > 0 and a.debit_entry_id = e.id) or (e.amount < 0 and a.credit_entry_id = e.id)), 0))::text as remaining
     from public.party_entries e where e.id = any ($1::uuid[])`,
    [[invoice.value.id, credit.value.id]],
  )).rows;
  t.same(Object.fromEntries(flows.map((r) => [r.id === invoice.value.id ? 'invoice' : 'credit', r.remaining])), { invoice: '0', credit: '0' }, 'بعد الإلغاء الفاتورة المتحرّرة (60) تتوزّع على التسوية المفتوحة: الاثنين مسدودين');
  t.eq(await balance(db, RF, B.feed_mill), '0', 'والرصيد صفر');

  // ── رفض المعطيات برموزها (FOUNDATION ٥٨٦–٥٩١)، وكل واحد ويّاه ضابطه الناجح فوك ─────────────────────────────────
  const codes = {
    halfDinar: shown(await pay('record_party_payment', E, B.feed_mill, '0.5')),
    zeroPayment: shown(await pay('record_party_payment', E, B.feed_mill, '0')),
    negativePayment: shown(await pay('pay_party', E, B.feed_mill, '-5')),
    nanPayment: shown(await pay('record_party_payment', E, B.feed_mill, 'NaN')),
    zeroOpening: shown(await opening(E, B.general, '0')),
    halfOpening: shown(await opening(E, B.general, '10.5')),
    noBook: shown(await pay('record_party_payment', E, null, '1000')),
    noAccount: shown(await pay('record_party_payment', E, B.feed_mill, '1000', null)),
    noParty: shown(await pay('record_party_payment', null, B.feed_mill, '1000')),
    future: shown(await pay('record_party_payment', E, B.feed_mill, '1000', BOX, '2026-10-31')),
    tooOld: shown(await pay('record_party_payment', E, B.feed_mill, '1000', BOX, '2026-10-22')),
    beforeGoLive: shown(await pay('record_party_payment', E, B.medicine, '1000', BOX, '2026-10-27')),
    noGoLive: shown(await pay('record_party_payment', E, B.broiler, '1000')),
    openingAfterGoLive: shown(await opening(E, B.feed_mill, '1000', '2026-10-01')),
    openingNoGoLive: shown(await opening(E, B.layer, '1000', '2026-09-30')),
    direction: shown(await adjust(E, B.feed_mill, 'up', '1000')),
    reason: shown(await adjust(E, B.feed_mill, 'debit', '1000', '   ')),
    balanceZero: shown(await forgive(E, B.feed_mill, '1000')),
    exceeds: shown(await forgive(P, B.chicks, '7001')),
    notPayment: shown(await voidPayment(written.openingCredit.value.id)),
    notVoidable: shown(await voidEntry(written.payment.value.id)),
    twice: shown(await voidEntry(written.debit.value.id)),
    voidReversal: shown(await voidEntry(voids.debit.value.id)),
    voidReason: shown(await voidEntry(written.credit.value.id, '')),
    missing: shown(await voidEntry(uid())),
  };
  t.same(
    codes,
    {
      halfDinar: 'amount_not_whole_dinar',
      zeroPayment: 'amount_not_positive',
      negativePayment: 'amount_not_positive',
      nanPayment: 'amount_required',
      zeroOpening: 'amount_zero',
      halfOpening: 'amount_not_whole_dinar',
      noBook: 'book_required',
      noAccount: 'cash_account_required',
      noParty: 'party_required',
      future: 'date_in_future',
      tooOld: 'date_too_old',
      beforeGoLive: 'before_go_live',
      noGoLive: 'no_go_live',
      openingAfterGoLive: 'after_go_live',
      openingNoGoLive: 'no_go_live',
      direction: 'direction_required',
      reason: 'reason_required',
      balanceZero: 'balance_zero',
      exceeds: 'exceeds_balance',
      notPayment: 'not_a_payment',
      notVoidable: 'entry_not_voidable',
      twice: 'already_reversed',
      voidReversal: 'entry_not_voidable',
      voidReason: 'reason_required',
      missing: 'entry_not_found',
    },
    'رفض المعطيات برموزها: نصف دينار، صفر، سالب، NaN، بلا دفتر أو صندوق أو جهة، التاريخ (مستقبل، أقدم من 7 أيام، قبل التشغيل، بلا يوم تشغيل، الافتتاح بعده)، الاتّجاه، السبب، الرصيد، والإلغاء',
  );
  const sevenDays = await pay('record_party_payment', E, B.feed_mill, '1000', BOX, '2026-10-23');
  t.eq(shown(sevenDays), 'ok', 'ضابط: الرجوع 7 أيام بالضبط مقبول');
  t.eq(shown(await opening(E, B.general, '1000', '2026-08-31')), 'ok', 'ضابط: الافتتاح قبل يوم التشغيل بشهر مقبول (مستثنى من حدّ الأيام السبعة)');
  t.eq(shown(await forgive(P, B.chicks, '7000')), 'ok', 'ضابط: إعفاء الرصيد كلّه مقبول');
  t.eq(await balance(db, P, B.chicks), '0', 'وبعده رصيد الدفتر صفر');
  const hint = (await pay('record_party_payment', E, null, '1000')).hint;
  t.ok(hint.includes('اختر الدفتر'), `تلميح بلا دفتر يكول «اختر الدفتر» (${hint})`);

  // ── الأرشيف (Q2): جهة بيها رصيد ما تتؤرشف؛ المؤرشفة ترفض الدين الجديد وتقبل القبض والدفع ──────────────────────────────
  t.eq(shown(await asM("update public.parties set archived_at = 'now' where id = $1", [P])), 'archived_in_use', 'جهة بيها رصيد بأي دفتر ما تتؤرشف');
  t.eq(shown(await asM("update public.parties set archived_at = 'now' where id = $1", [Z])), 'ok', 'ضابط: جهة بلا رصيد تتؤرشف');
  t.eq(shown(await adjust(Z, B.feed_mill, 'debit', '1000')), 'party_archived', 'المؤرشفة ترفض تسوية جديدة');
  t.eq(shown(await opening(Z, B.feed_mill, '1000')), 'party_archived', 'وترفض افتتاحاً جديداً');
  t.eq(shown(await pay('record_party_payment', Z, B.feed_mill, '1000')), 'ok', 'وتقبل القبض (E43، Q2)');

  // ── الصناديق (Q10): افتتاح بيوم أقدم تشغيل أو قبله وواحد فعّال، والنقل وجهان، والإلغاء من مستنده، والأرشيف بلا رصيد ─────────
  const cashOpening = (account, amount, day) => asM('select public.record_cash_opening($1, $2, $3, $4, $5)', [uid(), account, amount, day, uid()]);
  const transfer = (from, to, amount, note = null) => asM('select public.transfer_cash($1, $2, $3, $4, $5, $6, $7)', [uid(), from, to, amount, TODAY, note, uid()]);
  const voidMove = (moveId, reason = 'خطأ') => asM('select public.void_cash_move($1, $2, $3)', [moveId, reason, uid()]);
  const opened = await cashOpening(BOX, '1000000', '2026-09-24');
  const moved = await transfer(BOX, BANK, '300000', 'إيداع');
  t.same([shown(opened), shown(moved)], ['ok', 'ok'], 'ضابط: افتتاح الصندوق بيوم أقدم تشغيل والنقل ينسجّلان');
  const cash = {
    afterGoLive: shown(await cashOpening(BANK, '1000', '2026-09-25')),
    again: shown(await cashOpening(BOX, '1000', '2026-09-20')),
    zero: shown(await cashOpening(BANK, '0', '2026-09-20')),
    same: shown(await transfer(BOX, BOX, '1000')),
    noTarget: shown(await transfer(BOX, null, '1000')),
    fromSource: shown(await voidMove((await one('select id from public.cash_moves where party_entry_id = $1', [sevenDays.value.id])).id)),
  };
  t.same(cash, { afterGoLive: 'after_go_live', again: 'opening_exists', zero: 'amount_zero', same: 'same_account', noTarget: 'cash_account_required', fromSource: 'void_from_source' }, 'رفض الصناديق برموزها');
  const legs = await db.admin('select account_id = $2 as from_box, amount::text as amount from public.cash_moves where doc_kind = $3 and doc_id = $1 order by amount', [moved.value.id, BOX, 'cash_transfer']);
  t.same(legs.rows, [{ from_box: true, amount: '-300000' }, { from_box: false, amount: '300000' }], 'النقل وجهان متعاكسان بنفس المستند');
  t.eq(shown(await voidMove(moved.value.moves[1])), 'ok', 'إلغاء النقل من أيّ وجه');
  t.eq((await one('select count(*)::int as n from public.cash_moves where doc_id = $1 and reverses_move_id is not null', [moved.value.id])).n, 2, 'إلغاء النقل يعكس الوجهين');
  t.eq(shown(await voidMove(moved.value.id)), 'already_reversed', 'والنقل الملغى ما ينلغى مرّة ثانية');
  t.eq(shown(await voidMove(opened.value.id)), 'ok', 'إلغاء افتتاح الصندوق');
  t.eq(shown(await cashOpening(BOX, '900000', '2026-09-24')), 'ok', 'وبعده افتتاح جديد للصندوق');
  t.eq(shown(await asM("update public.cash_accounts set archived_at = 'now' where id = $1", [BOX])), 'archived_in_use', 'صندوق بيه رصيد ما يتؤرشف (E35)');
  t.eq(shown(await asM("update public.cash_accounts set archived_at = 'now' where id = $1", [SPARE])), 'ok', 'ضابط: صندوق بلا رصيد يتؤرشف');
  t.eq(shown(await pay('record_party_payment', E, B.feed_mill, '1000', SPARE)), 'cash_account_archived', 'الصندوق المؤرشف يرفض حركة جديدة');
  t.eq(shown(await transfer(BOX, SPARE, '1000')), 'cash_account_archived', 'والنقل إليه يرفض');

  // ── كشف أبو علي (FOUNDATION ٧٠٢): رصيد جارٍ لكل دفتر، وآخر سطر = رقم الدفتر = مجموع قيوده؛ والدفتر الغلط (٧٠٣) ───────────
  const S = await makeOrg(db, { name: 'مزرعة الفصل', id: sid, phone: sphone, roles: [['owner', 'owner'], ['manager', 'manager']] });
  const asS = (sql, params) => call(db, S.users.manager, sql, params);
  for (const [kind, day] of [['feed_mill', '2026-09-30'], ['hatchery', '2026-09-24']]) await asS('select public.set_division_go_live($1, $2)', [S.divisions[kind], day]);
  const sParty = async (name) => (await asS("insert into public.parties (name, is_customer) values ($1, true) returning id", [name])).value;
  const sBox = (await asS("insert into public.cash_accounts (name, kind) values ('الصندوق', 'cash') returning id")).value;
  const sAdjust = (p, book, direction, amount) => asS('select public.record_party_adjustment($1, $2, $3, $4, $5, $6, $7, $8)', [uid(), p, book, direction, amount, TODAY, 'فاتورة', uid()]);
  const sPay = (p, book, amount) => asS('select public.record_party_payment($1, $2, $3, $4, $5, $6, $7)', [uid(), p, book, amount, sBox, TODAY, uid()]);
  const sOpening = (p, book, amount, day = '2026-09-30') => asS('select public.record_opening_balance($1, $2, $3, $4, $5, $6)', [uid(), p, book, amount, day, uid()]);
  const abuAli = async (name, wrongBook) => {
    const p = await sParty(name);
    await sOpening(p, S.books.feed_mill, '500000');
    await sAdjust(p, S.books.feed_mill, 'debit', '3960000');
    await sPay(p, S.books.feed_mill, '1000000');
    await sPay(p, wrongBook ? S.books.chicks : S.books.feed_mill, '2000000');
    await sAdjust(p, S.books.chicks, 'debit', '9750000');
    await sPay(p, S.books.chicks, '1000000');
    return p;
  };
  const right = await abuAli('أبو علي', false);
  const statement = (await call(db, S.users.manager, 'select public.report_party_statement($1, null, $2, $3)', [right, '2026-01-01', TODAY])).value;
  const running = Object.fromEntries(statement.books.map((b) => [b.code === 'main' ? 'mill' : b.code, b.lines.map((l) => l.balance)]));
  t.same(running, { mill: ['500000', '4460000', '3460000', '1460000'], chicks: ['9750000', '8750000'] }, 'كشف أبو علي: المعمل 500,000 ← 4,460,000 ← 3,460,000 ← 1,460,000، والأفراخ 9,750,000 ← 8,750,000');
  t.same(statement.books.map((b) => [b.closing, b.lines.at(-1).balance]), statement.books.map((b) => [b.lines.at(-1).balance, b.closing]), 'آخر سطر بكل دفتر = رصيد الدفتر');
  // runBooks بالواجهة على نفس السطور: نفس الأرصدة الجارية بالفلس.
  const asEntries = statement.books.flatMap((b) => b.lines.map((l) => ({ bookId: b.book_id, date: l.on_date, doc: l.doc_no ?? '', memo: l.kind, debit: BigInt(l.debit) * 100n, credit: BigInt(l.credit) * 100n })));
  const ran = ledger.runBooks(asEntries);
  t.same(
    statement.books.map((b) => ran.get(b.book_id).lines.map((line) => line.balance)),
    statement.books.map((b) => b.lines.map((l) => BigInt(l.balance) * 100n)),
    'runBooks بالواجهة = الرصيد الجاري من القاعدة لكل دفتر',
  );
  const wrong = await abuAli('أبو علي الثاني', true);
  const books = async (p) => ({ mill: await balance(db, p, S.books.feed_mill), chicks: await balance(db, p, S.books.chicks) });
  const [good, bad] = [await books(right), await books(wrong)];
  t.same([good, bad], [{ mill: '1460000', chicks: '8750000' }, { mill: '3460000', chicks: '6750000' }], 'الدفتر الغلط: المعمل 3,460,000 والأفراخ 6,750,000 بدل 1,460,000 و8,750,000');
  t.eq(Number(good.mill) + Number(good.chicks), Number(bad.mill) + Number(bad.chicks), 'والمجموع نفسه (10,210,000): المجموع وحده ما يمسك الغلط، والفحص يقارن كل دفتر برقمه');

  // ── فحص الفصل (FOUNDATION ٧٠٥) بمنشأة لحالها: لنا وعلينا لكل دفتر بلا تصافٍ بين دفترين ─────────────────────────────────
  const F = await makeOrg(db, { name: 'مزرعة الفصل الثانية', id: (n) => sid(20 + n), phone: (n) => sphone(20 + n), roles: [['owner', 'owner'], ['manager', 'manager']] });
  const asF = (sql, params) => call(db, F.users.manager, sql, params);
  for (const [kind, day] of [['feed_mill', '2026-09-30'], ['hatchery', '2026-09-24']]) await asF('select public.set_division_go_live($1, $2)', [F.divisions[kind], day]);
  const fParty = async (name) => (await asF("insert into public.parties (name, is_customer) values ($1, true) returning id", [name])).value;
  const fAdjust = (p, book, direction, amount) => asF('select public.record_party_adjustment($1, $2, $3, $4, $5, $6, $7, $8)', [uid(), p, book, direction, amount, TODAY, 'قيد', uid()]);
  const X = await fParty('جهة الدفترين');
  await fAdjust(X, F.books.feed_mill, 'debit', '1000000');
  await fAdjust(X, F.books.chicks, 'credit', '600000');
  const summary = async () => (await call(db, F.users.manager, 'select public.report_accounts_summary($1, $2)', ['2026-01-01', TODAY])).value;
  const sides = (s) => ({
    ...Object.fromEntries(s.divisions.filter((d) => d.receivable !== '0' || d.payable !== '0').map((d) => [d.kind, [d.receivable, d.payable]])),
    project: [s.project.receivable, s.project.payable],
  });
  t.same(sides(await summary()), { feed_mill: ['1000000', '0'], hatchery: ['0', '600000'], project: ['1000000', '600000'] }, 'المعمل «لنا» 1,000,000 والمفقس «علينا» 600,000، والمشروع 1,000,000 / 600,000 مو 400,000 / 0');
  const xRow = (await call(db, F.users.manager, "select public.report_party_balances($1, $2, null, true, 'balance', null, null, 50)", ['2026-01-01', TODAY])).value.rows.find((r) => r.party_id === X);
  t.eq(xRow.total, '400000', 'وعمود المجموع للجهة (للعرض) «عليه 400,000»');
  const Y = await fParty('جهة دفتري المفقس');
  await fAdjust(Y, F.books.chicks, 'debit', '300000');
  await fAdjust(Y, F.books.hatching_eggs, 'credit', '100000');
  const both = await summary();
  t.same(sides(both), { feed_mill: ['1000000', '0'], hatchery: ['300000', '700000'], project: ['1300000', '700000'] }, 'وبين دفتري المفقس نفسه: لنا 300,000 وعلينا 700,000 بلا تصافٍ');
  // مرآة الواجهة accountsTotals على أرصدة (جهة، دفتر) الخام = التقرير.
  const raw = (await db.admin('select b.division_id, sum(e.amount)::text as balance from public.party_entries e join public.ledger_books b on b.id = e.book_id where e.org_id = $1 group by e.party_id, e.book_id, b.division_id', [F.org])).rows;
  const totals = ledger.accountsTotals(raw.map((r) => ({ divisionId: r.division_id, balance: BigInt(r.balance) })));
  t.same([totals.project.receivable, totals.project.payable], [BigInt(both.project.receivable), BigInt(both.project.payable)], 'accountsTotals بالواجهة = report_accounts_summary');

  // ── النطاق بالدفاتر (E49): محاسب محصور بالمعمل يقرأ ويرحّل بدفتر المعمل بس، ومجموعه «N من المجموع» ─────────────────────
  const scoped = (sql, params) => call(db, U.millAccountant, sql, params);
  const seenBooks = (await scoped('select public.report_party_statement($1, null, $2, $3)', [P, '2026-01-01', TODAY])).value.books.map((b) => b.book_id);
  t.same(seenBooks, [B.feed_mill], 'المحاسب المحصور: كشف الجهة بدفتر المعمل بس (الأفراخ برّا نطاقه)');
  const scopedSummary = (await scoped('select public.report_accounts_summary($1, $2)', ['2026-01-01', TODAY])).value;
  t.same([scopedSummary.books.visible, scopedSummary.books.total], [1, 7], 'ملخّص المحصور: دفتر واحد من سبعة (الشاشة تكتب «N من المجموع»)');
  const fullSummary = (await call(db, U.accountant, 'select public.report_accounts_summary($1, $2)', ['2026-01-01', TODAY])).value;
  t.same([fullSummary.books.visible, fullSummary.books.total], [7, 7], 'ضابط: محاسب بلا صفوف نطاق يرى الدفاتر السبعة');
  const seenRows = (await scoped('select count(*) filter (where book_id <> $1)::int as v from public.party_entries', [B.feed_mill])).value;
  t.eq(seenRows, 0, 'القيود المقروءة مباشرةً بدفتر المعمل بس (سياسة القراءة بالنطاق)');
  t.ok((await scoped('select count(*)::int as v from public.party_entries')).value > 0, 'ضابط: المحصور يقرأ قيود دفتره');
  t.eq(shown(await pay('record_party_payment', E, B.feed_mill, '1000', BOX, TODAY, U.millAccountant)), 'ok', 'المحصور يرحّل بدفتر المعمل');
  t.eq(shown(await pay('record_party_payment', E, B.chicks, '1000', BOX, TODAY, U.millAccountant)), 'out_of_scope', 'وبدفتر الأفراخ out_of_scope');
  t.eq(shown(await scoped('select public.report_party_statement($1, $2, $3, $4)', [P, B.chicks, '2026-01-01', TODAY])), 'out_of_scope', 'وكشف دفتر برّا نطاقه out_of_scope');
  // التوزيعات بنفس النطاق: المحصور يقرأ توزيعات دفتر المعمل بس، والضابط بلا نطاق يقرأ توزيعات دفاتر ثانية (إعفاء الأفراخ وقبض الأدوية).
  const allocationsOutside = async (user) => (await call(db, user, 'select count(*) filter (where book_id <> $1)::int as v from public.party_allocations', [B.feed_mill])).value;
  t.same(
    [await allocationsOutside(U.millAccountant), (await scoped('select count(*)::int as v from public.party_allocations')).value > 0, (await allocationsOutside(U.accountant)) > 0],
    [0, true, true],
    'التوزيعات المقروءة مباشرةً بدفتر المعمل بس للمحصور (وضابطاه: يقرأ توزيعات دفتره، والمحاسب بلا نطاق يقرأ غيرها)',
  );
  const scopedBalances = (await scoped("select public.report_party_balances($1, $2, null, false, 'name', null, null, 200)", ['2026-01-01', TODAY])).value;
  t.same(
    [scopedBalances.books.map((b) => b.book_id), [...new Set(scopedBalances.rows.flatMap((r) => r.cells.map((c) => c.book_id)))]],
    [[B.feed_mill], [B.feed_mill]],
    'جدول الجهات للمحصور: عمود دفتر المعمل وحده، وخانات الصفوف منه بس',
  );
  // سجلّ التدقيق يحمل صفوف القيود والتوزيعات كاملة (دفترها ومبلغها): المحصور ما يقرأ منها إلا دفاتر نطاقه.
  const auditSides = (user) =>
    db.asUser(user, async (q) => (await q(
      "select count(*) filter (where (coalesce(new, old) ->> 'book_id')::uuid <> $1)::int as outside, count(*) filter (where (coalesce(new, old) ->> 'book_id')::uuid = $1)::int as inside from public.audit_log where table_name in ('party_entries', 'party_allocations')",
      [B.feed_mill],
    )).rows[0]);
  const [scopedAudit, fullAudit] = [await auditSides(U.millAccountant), await auditSides(U.accountant)];
  t.same([scopedAudit.outside, scopedAudit.inside > 0, fullAudit.outside > 0], [0, true, true], `سجلّ التدقيق للمحصور: صفوف قيود دفتر المعمل وتوزيعاته بس (${JSON.stringify(scopedAudit)})، والمحاسب بلا نطاق يقرأ الكل (${JSON.stringify(fullAudit)})`);
  // ملخّص الحسابات والرئيسية للمحصور: وحدات نطاقه بس (مو «0 / 0» لوحدة برّاه)، وعدد الدفاتر الظاهرة من المجموع على البطاقة.
  t.same(scopedSummary.divisions.map((d) => d.kind), ['feed_mill'], 'ملخّص المحصور: وحدة المعمل وحدها، مو بقية الوحدات بأصفار');
  t.eq(fullSummary.divisions.length, 6, 'ضابط: المحاسب بلا نطاق يرى الوحدات الستّ');
  const scopedHome = (await scoped('select public.home_summary()')).value.accounts;
  const fullHome = (await call(db, U.accountant, 'select public.home_summary()')).value.accounts;
  t.same([scopedHome?.books?.visible, scopedHome?.books?.total, fullHome?.books?.visible, fullHome?.books?.total], [1, 7, 7, 7], 'بطاقة الحسابات بالرئيسية تعرف إن أرقام المحصور جزئية (دفتر من سبعة)، وللمحاسب بلا نطاق السبعة');

  // ── «حتى اليوم» من الخادم: التقارير بلا p_to تحسب بيوم الخادم (app_today)، فالصفحة المفتوحة من أمس تشوف قبض اليوم وإلغاءه ──
  const untilToday = {
    summary: (await call(db, U.accountant, 'select public.report_accounts_summary($1, null)', ['2026-01-01'])).value,
    balances: (await call(db, U.accountant, "select public.report_party_balances($1, null, null, true, 'balance', null, null, 200)", ['2026-01-01'])).value,
    cash: (await call(db, U.accountant, 'select public.report_cash_balances($1, null)', ['2026-01-01'])).value,
  };
  t.same([untilToday.summary?.to, untilToday.cash?.to], [TODAY, TODAY], 'بلا p_to: المدّة لحد يوم الخادم');
  t.same(
    [untilToday.summary?.project, untilToday.balances?.rows?.length, untilToday.cash?.total],
    [
      (await call(db, U.accountant, 'select public.report_accounts_summary($1, $2)', ['2026-01-01', TODAY])).value.project,
      (await call(db, U.accountant, "select public.report_party_balances($1, $2, null, true, 'balance', null, null, 200)", ['2026-01-01', TODAY])).value.rows.length,
      (await call(db, U.accountant, 'select public.report_cash_balances($1, $2)', ['2026-01-01', TODAY])).value.total,
    ],
    'وأرقامها نفس أرقام p_to = اليوم',
  );

  // ── كشف الجهة: سطر القبض أو الدفع يسمّي صندوقه (تأكيد الإلغاء يقول من أيّ صندوق تُعكس الحركة) ─────────────────────────
  const eLines = (await call(db, U.accountant, 'select public.report_party_statement($1, $2, $3, $4)', [E, B.feed_mill, '2026-01-01', TODAY])).value.books[0].lines;
  t.same(
    [...new Set(eLines.filter((l) => l.kind === 'payment' && !l.reverses).map((l) => l.account))],
    ['الصندوق'],
    'سطور القبض بالكشف باسم صندوقها',
  );
  t.ok(eLines.filter((l) => l.kind !== 'payment' && l.kind !== 'payout').every((l) => l.account === null), 'وسطور غير القبض والدفع بلا صندوق');

  // ── الجهات (Q1، E34، Q2): الأمين يضيف مورّداً بس؛ الاسم المطبَّع ومفتاح الهاتف بالإضافة والتعديل؛ والتوائم بالهاتف المطبَّع ─────
  const normalize = await loadSrc('src/domain/normalize.ts');
  const phones = await loadSrc('src/domain/phone.ts');
  const keeper = (sql) => as(U.storekeeper, sql, []);
  t.same(
    {
      customer: shown(await keeper("insert into public.parties (name, is_customer) values ('زبون الأمين', true) returning id")),
      neither: shown(await keeper("insert into public.parties (name) values ('جهة بلا صفة') returning id")),
      both: shown(await keeper("insert into public.parties (name, is_customer, is_supplier) values ('زبون ومورّد', true, true) returning id")),
      supplier: shown(await keeper("insert into public.parties (name, is_supplier) values ('مورّد الأمين', true) returning id")),
    },
    { customer: 'forbidden', neither: 'forbidden', both: 'forbidden', supplier: 'ok' },
    'الأمين يضيف مورّداً بس: زبوناً أو جهة بلا صفة أو زبوناً ومورّداً forbidden (وضابطه: المورّد ينضاف)',
  );
  const keysOf = (partyId) => one('select name_norm, phone, phone_key from public.parties where id = $1', [partyId]);
  const renamed = (await asM("insert into public.parties (name, phone, is_customer) values ('مزرعة  التعديل', '0770 333 4455', true) returning id")).value;
  t.same(await keysOf(renamed), { name_norm: normalize.searchable('مزرعة  التعديل'), phone: '0770 333 4455', phone_key: phones.phoneKey('0770 333 4455') }, 'الإضافة: الاسم المطبَّع ومفتاح الهاتف من الخادم');
  await asM("update public.parties set name = 'مزرعةُ الأمانة', phone = '+964 771 444 5566' where id = $1", [renamed]);
  t.same(await keysOf(renamed), { name_norm: normalize.searchable('مزرعةُ الأمانة'), phone: '+964 771 444 5566', phone_key: phones.phoneKey('+964 771 444 5566') }, 'التعديل: الاسم المطبَّع ومفتاح الهاتف ينعادان');
  await asM("update public.parties set phone = '  ' where id = $1", [renamed]);
  t.same(await keysOf(renamed), { name_norm: normalize.searchable('مزرعةُ الأمانة'), phone: null, phone_key: null }, 'هاتف فراغات = بلا هاتف وبلا مفتاح');
  const twinIds = {
    active: (await asM("insert into public.parties (name, phone, is_customer) values ('مزرعة الأمل', '0770 111 2233', true) returning id")).value,
    archived: (await asM("insert into public.parties (name, phone, is_supplier) values ('مخزن الرافدين', '07701112233', true) returning id")).value,
    sameName: (await asM("insert into public.parties (name, is_customer) values ('مزرعه الامل', true) returning id")).value,
  };
  await asM("update public.parties set archived_at = 'now' where id = $1", [twinIds.archived]);
  const twins = async (name, number) => (await as(U.accountant, 'select public.find_party_twins($1, $2)', [name, number])).value.map((x) => [x.id, x.archived, x.same_name, x.same_phone]);
  t.same(await twins(null, '+964 770 111 2233'), [[twinIds.active, false, false, true], [twinIds.archived, true, false, true]], 'التوائم بالهاتف المطبَّع: «+964 770 111 2233» يلكى «0770 111 2233» و«07701112233»، والمؤرشفة آخراً بعلامتها');
  const byId = (rows) => [...rows].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  t.same(byId(await twins('مزرعة الأمل', null)), byId([[twinIds.active, false, true, false], [twinIds.sameName, false, true, false]]), 'وبالاسم المطبَّع على الطرفين (الهمزة والتاء المربوطة)، بلا هاتف ما يلكى بالهاتف');
  t.same((await twins('مزرعة الأمل', '0770 111 2233')).map(([pid, , sameName, samePhone]) => [pid === twinIds.active, sameName, samePhone]).find(([isActive]) => isActive), [true, true, true], 'نفس الاسم ونفس الهاتف: العلامتان سوا');

  // ── البحث بجدول الجهات: الأرقام بالاسم ما تطابق الهواتف (FOUNDATION ٧٨٨: بحث بالاسم وبحث بالهاتف) ───────────────────────
  const numbered = (await asM("insert into public.parties (name, is_customer) values ('مزرعة 2', true) returning id")).value;
  const found = async (text) => (await call(db, U.accountant, "select public.report_party_balances($1, $2, null, false, 'name', $3, null, 200)", ['2026-01-01', TODAY, normalize.searchable(text)])).value.rows.map((r) => r.party_id);
  t.same(await found('مزرعة 2'), [numbered], 'اسم بيه رقم: الاسم بس، مو كل جهة بهاتفها «2»');
  const byPhone = await found('0770 111');
  t.ok(byPhone.includes(twinIds.active) && byPhone.includes(twinIds.archived) && !byPhone.includes(numbered), 'البحث بالهاتف يلكى الهواتف المطابقة');
  t.same(await found('+964 770 111'), byPhone, 'والهاتف بالمفتاح الدولي نفس النتيجة');

  // ── شكل الخادم الحقيقي يمرّ من محلّلات الواجهة (parseHomeSummary وparseAccountsSummary وparsePartyBalances وparseStatement
  //    وparseCashBalances وparseCashStatement): تغيير شكل الجواب بالقاعدة يفشل هنا، مو بشاشة كل مستخدم ──────────────────────
  const parsers = await loadRepoParsers();
  const wire = {
    home: (await call(db, U.millAccountant, 'select public.home_summary()')).value,
    summary: scopedSummary,
    balances: scopedBalances,
    statement: (await call(db, U.accountant, 'select public.report_party_statement($1, null, $2, $3)', [P, '2026-01-01', TODAY])).value,
    cash: (await call(db, U.accountant, 'select public.report_cash_balances($1, $2)', ['2026-01-01', TODAY])).value,
    cashStatement: (await call(db, U.accountant, 'select public.report_cash_statement($1, $2, $3)', [BOX, '2026-01-01', TODAY])).value,
  };
  const parsed = {
    home: parsers.parseHomeSummary(wire.home),
    summary: parsers.parseAccountsSummary(wire.summary),
    balances: parsers.parsePartyBalances(wire.balances),
    statement: parsers.parseStatement(wire.statement),
    cash: parsers.parseCashBalances(wire.cash),
    cashStatement: parsers.parseCashStatement(wire.cashStatement),
  };
  t.same(
    [parsed.home.accounts.receivable, parsed.home.accounts.visibleBooks, parsed.home.accounts.totalBooks, parsed.summary.visibleBooks, parsed.balances.rows.length, parsed.statement.books.length, parsed.cash.accounts.length, parsed.cashStatement.lines.length > 0],
    [BigInt(wire.home.accounts.receivable) * 100n, 1, 7, 1, wire.balances.rows.length, wire.statement.books.length, wire.cash.accounts.length, true],
    'أجوبة الخادم الحقيقية تنقرا بمحلّلات الواجهة بلا رمي (الرئيسية والملخّص والجدول والكشف والصناديق)',
  );

  // ── الفترة المقفولة بالترحيل وبالإلغاء (آخر الملف: القفل يبقى) ──────────────────────────────────────────────────────
  t.eq(shown(await asM('select public.set_period_lock($1)', ['2026-10-24'])), 'ok', 'المدير يقفل لحد 24/10');
  t.eq(shown(await pay('record_party_payment', E, B.feed_mill, '1000', BOX, '2026-10-24')), 'period_locked', 'قبض بتاريخ مقفول يرفض');
  t.eq(shown(await pay('record_party_payment', E, B.feed_mill, '1000', BOX, '2026-10-25')), 'ok', 'ضابط: بعد القفل بيوم ينسجّل');
  t.eq(shown(await opening(E, B.hatching_eggs, '1000', '2026-09-24')), 'period_locked', 'الافتتاح بتاريخ مقفول يرفض حتى لو قبل التشغيل');
  t.eq(shown(await asM('select public.set_period_lock($1)', ['2026-10-29'])), 'ok', 'القفل لحد أمس');
  const lockedVoid = await db.setToday('2026-10-29', () => voidPayment(sevenDays.value.id));
  t.eq(shown(lockedVoid), 'period_locked', 'الإلغاء بيوم مقفول يرفض (الإلغاء بتاريخ يومه)');
  t.eq(shown(await voidPayment(sevenDays.value.id)), 'ok', 'ضابط: بيوم مو مقفول الإلغاء يمرّ والأصل يبقى بيومه المقفول');
}
