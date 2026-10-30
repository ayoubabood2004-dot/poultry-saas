// الاستلام (WP6، 0009؛ FOUNDATION ٢٨٤–٢٨٦، ٣٢٨–٣٣٤، ٤٧٢–٤٧٣، ٤٩٣–٤٩٥، ٥٥٠–٥٥١؛ DECISIONS Q2 وQ5 وQ7 وQ8 وQ9؛ E10 وE17–E19 وE43
// وE44 وE46): الدفتر من نوع المخزن (القاعدة 36)، والمخزن المستلم، وتوزيع الخصم والتحميلات بأكبر الباقي بالفلس، ولقطة الكثافة،
// والمبالغ بالدينار الصحيح، والتوزيع بالقاعدة 27، وتصحيح المدفوع الغلط، والمسوّدات، والإلغاء، والثوابت ومسابيرها. الأرقام من مثال
// FOUNDATION (C2 وS2: 5,000 كغم بـ2,350,000 و1,000 كغم بـ900,000، ونقل 65,000 بالوزن ← 54,166.67 و10,833.33). كل نداء بدور
// authenticated حقيقي.
import { LEDGER_ZERO, balance, call, remainders, shown, uid, verifyLedger } from './ledger-kit.mjs';
import { postReceipt, postedReceipt, previewReceipt, priceReceipt, receiptDraft, receiptLots, voidReceipt } from './receipt-kit.mjs';
import { draftWriteLock, race, sameRefRace } from './shared.mjs';
import { STOCK_ZERO, makeStockOrg, postedTransfer, verifyStock } from './stock-kit.mjs';

const TODAY = '2026-10-30';
const GO_LIVE = '2026-10-20';
const id = (n) => `5f000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477098700${String(n).padStart(2, '0')}`;

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
  await zoneSweep(t, db);
}

async function scenario(t, db) {
  const S = await makeStockOrg(db, { name: 'مزرعة الاستلام', id, phone, goLive: GO_LIVE });
  const { users: U, W, I, books: B } = S;
  // الأمين بنطاق كل مخازن الاستلام (المواد الأوّلية والعلف والأدوية والعامّ وبيض التفقيس والأفراخ).
  await S.one(U.owner, "select public.set_member_scopes_v2($1, '{}', '{}', $2::uuid[])", [S.members.storekeeper, [W.raw, W.feed, W.medicine, W.general, W.general2, W.hatching_egg, W.chick]]);
  const item = (name, kind, unit, extra = {}) =>
    S.one(U.owner, 'insert into public.items (name, kind, base_unit, density_kg_per_l, piece_mass_kg, tracks_expiry) values ($1, $2, $3, $4, $5, $6) returning id', [
      name, kind, unit, extra.density ?? null, extra.pieceMass ?? null, extra.tracksExpiry ?? false,
    ]);
  const soy = await item('كسبة صويا 46٪', 'raw', 'kg');
  const oil = await item('زيت نباتي', 'raw', 'L', { density: 0.92 });
  const bags = await item('أكياس فارغة 50 كغم', 'packaging', 'pc', { pieceMass: 0.2 });
  const kerosene = await item('كاز أبيض', 'fuel', 'L');
  const generator = await item('مولّدة', 'equipment', 'pc');
  const hatchEggs = await item('بيض تفقيس', 'hatching_egg', 'pc');
  const party = (name) => S.one(U.accountant, 'insert into public.parties (name, is_supplier) values ($1, true) returning id', [name]);
  const grain = await party('مورّد الحبوب');
  const carrier = await party('الناقل');
  const cashSupplier = await party('مورّد نقدي');
  const feedSupplier = await party('مورّد الأعلاف');
  const box = await S.one(U.accountant, "insert into public.cash_accounts (name, kind) values ('الصندوق', 'cash') returning id");
  const boxBalance = async () => (await db.admin('select coalesce(sum(amount), 0)::text as v from public.cash_moves where account_id = $1', [box])).rows[0].v;
  const keeper = U.storekeeper;
  const pricer = U.accountant;
  const post = async (doc, user = pricer) => postReceipt(db, user, doc.id, await versionOf(doc.id));
  const versionOf = async (docId) => (await db.admin('select version from public.receipts where id = $1', [docId])).rows[0].version;
  const entriesOf = async (docId) =>
    (await db.admin("select party_id, book_id, kind, amount::text as amount, doc_no from public.party_entries where doc_kind = 'receipt' and doc_id = $1 and reverses_entry_id is null order by seq, kind", [docId])).rows;

  // ── الدفتر من نوع المخزن (القاعدة 36، book-check): استلام بكل نوع مخزن يستلم يكتب قيد المورّد بدفتره ─────────────────────
  const routes = [
    ['المواد الأوّلية', W.raw, { item: I.corn, qty: 100 }, B.feed_mill],
    ['العلف', W.feed, { item: I.feed, qty: 100 }, B.feed_mill],
    ['الأدوية', W.medicine, { item: I.vaccine, qty: 10, expiry: '2027-06-30' }, B.medicine],
    ['العامّ', W.general, { item: kerosene, qty: 100 }, B.general],
    ['بيض التفقيس', W.hatching_egg, { item: hatchEggs, qty: 300 }, B.hatching_eggs],
    ['الأفراخ', W.chick, { item: I.chicks, qty: 100, bornAt: '2026-10-29T08:00:00+03:00' }, B.chicks],
  ];
  const routed = [];
  for (const [label, wh, line, book] of routes) {
    const doc = await postedReceipt(db, { keeper, pricer, wh, party: grain, on: TODAY, lines: [line], totals: [10000] });
    const stamped = (await db.admin('select book_id, doc_no from public.receipts where id = $1', [doc.id])).rows[0];
    routed.push([label, stamped.book_id === book, (await entriesOf(doc.id)).map((e) => [e.book_id === book, e.amount, e.doc_no === stamped.doc_no])]);
  }
  t.same(
    routed,
    routes.map(([label]) => [label, true, [[true, '-10000', true]]]),
    'القاعدة 36: كل نوع مخزن يستلم بدفتره (المعمل والأدوية والعامّة وبيض التفقيس والأفراخ)، وقيد المورّد بدفتر المستند ورقمه',
  );
  const refused = async (wh) => shown(await call(db, U.manager, 'insert into public.receipts (party_id, warehouse_id, received_on) values ($1, $2, $3) returning id', [grain, wh, TODAY]));
  t.same([await refused(W.farm1), await refused(W.table_egg)], ['wrong_receiving_store', 'wrong_receiving_store'], 'مخزن الحقل ومخزن بيض المائدة ما يستلمان من مورّد');

  // ── المخزن المستلم (division-check، FOUNDATION ٢٨٤–٢٨٦): الكاز من مورّد للمخزن العامّ بس، والمولّدة ما تُخزَّن بالمواد الأوّلية ──────
  const rawDraft = await receiptDraft(db, keeper, { wh: W.raw, party: grain, on: TODAY, lines: [{ item: I.corn, qty: 10 }] });
  const lineInto = async (itemId) => shown(await call(db, keeper, 'insert into public.receipt_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 1) returning id', [rawDraft.id, itemId]));
  t.same([await lineInto(kerosene), await lineInto(generator), await lineInto(bags)], ['wrong_receiving_store', 'item_kind_mismatch', 'ok'], 'الكاز بمخزن المعمل يرفض من المورّد، والمولّدة ما تُخزَّن بيه، والأكياس تُستلم بيه');

  // ── التحميلات (القاعدة 11، E17، Q8) ────────────────────────────────────────────────────────────────────────────
  const r3Lines = [{ item: I.corn, qty: 5000 }, { item: soy, qty: 1000 }];
  const r3 = await postedReceipt(db, {
    keeper, pricer, wh: W.raw, party: grain, on: TODAY, lines: r3Lines, totals: [2350000, 900000],
    charges: [{ label: 'نقل', amount: 65000, by: 'mass', payee: carrier }],
  });
  t.same(await receiptLots(db, r3.id), [['5000', '2404166.67'], ['1000', '910833.33']], 'R3 بالوزن: نقل 65,000 ← 54,166.67 و10,833.33، وC2 = 2,404,166.67 وS2 = 910,833.33');
  t.same(
    (await entriesOf(r3.id)).map((e) => [e.party_id === grain ? 'المورّد' : 'الناقل', e.book_id === B.feed_mill, e.kind, e.amount]).sort(),
    [['المورّد', true, 'purchase', '-3250000'], ['الناقل', true, 'purchase', '-65000']],
    'R3: قيد المورّد −3,250,000 وقيد الناقل −65,000 بدفتر المعمل',
  );
  const byValue = await postedReceipt(db, {
    keeper, pricer, wh: W.raw, party: grain, on: TODAY, lines: r3Lines, totals: [2350000, 900000],
    charges: [{ label: 'نقل', amount: 65000, by: 'value', payee: carrier }],
  });
  t.same(await receiptLots(db, byValue.id), [['5000', '2397000'], ['1000', '918000']], 'ضابط بالقيمة: 47,000 و18,000 (الوزن مبلغ السطر كما بالفاتورة، Q8)');
  const both = await postedReceipt(db, {
    keeper, pricer, wh: W.raw, party: grain, on: TODAY, lines: r3Lines, totals: [2350000, 900000],
    charges: [{ label: 'نقل', amount: 65000, by: 'mass', payee: carrier }, { label: 'تحميل وتنزيل', amount: 30000, by: 'value', box }],
  });
  const shares = (await db.admin('select trim_scale(discount_share)::text as d, trim_scale(charge_share)::text as c from public.receipt_line_amounts a join public.receipt_lines x on x.id = a.line_id where a.doc_id = $1 order by x.line_no', [both.id])).rows;
  t.same(
    [shares.map((r) => r.c), await receiptLots(db, both.id)],
    [['75858.98', '19141.02'], [['5000', '2425858.98'], ['1000', '919141.02']]],
    'تحميلان (وزن وقيمة) يتجمّعون بالضبط: 54,166.67 + 21,692.31 و10,833.33 + 8,307.69 = 95,000.00',
  );
  const limited = await postedReceipt(db, {
    keeper, pricer, wh: W.raw, party: grain, on: TODAY,
    lines: [{ item: I.corn, qty: 1000 }, { item: soy, qty: 1000 }, { item: bags, qty: 500 }], totals: [450000, 900000, 250000],
    charges: [{ label: 'نقل المواد', amount: 10000, by: 'mass', box, lines: [0, 1] }],
  });
  t.same(await receiptLots(db, limited.id), [['1000', '455000'], ['1000', '905000'], ['500', '250000']], 'تحميل مقصور بـset_charge_lines على سطرين يتوزّع عليهما بس (الأكياس بلا حصّة)');

  // الغاز بلا وزن قطعة: «بالوزن» يرفض no_mass بالمعاينة والترحيل، وبالقيمة يمرّ.
  const gasDoc = await receiptDraft(db, keeper, { wh: W.general, party: grain, on: TODAY, lines: [{ item: I.gas, qty: 100 }, { item: kerosene, qty: 500 }] });
  await priceReceipt(db, pricer, gasDoc, { totals: [700000, 375000], charges: [{ label: 'نقل', amount: 10000, by: 'mass', box }] });
  const gasSeen = await previewReceipt(db, pricer, gasDoc.id);
  t.same([gasSeen.value.ready, gasSeen.value.problems.map((p) => p.code), shown(await post(gasDoc))], [false, ['no_mass'], 'no_mass'], 'الغاز بلا وزن: التوزيع بالوزن no_mass بالمعاينة والترحيل');
  t.ok(/الغاز|غاز/u.test(gasSeen.value.problems[0].hint) && /بالقيمة/u.test(gasSeen.value.problems[0].hint), `تلميح no_mass يسمّي المادّة ويقترح القيمة (${gasSeen.value.problems[0].hint})`);
  await S.one(pricer, "update public.receipt_charges set allocate_by = 'value' where doc_id = $1 returning id", [gasDoc.id]);
  t.eq(shown(await post(gasDoc)), 'ok', 'نفس التحميل بالقيمة يترحّل');

  // تحميل بلا جهة ولا صندوق، أو بالاثنين ← charge_payee_required (E17).
  const chargeOn = async (doc, payee, account) =>
    shown(await call(db, pricer, "insert into public.receipt_charges (doc_id, label, amount, allocate_by, payee_party_id, cash_account_id) values ($1, 'نقل', 1000, 'value', $2, $3) returning id", [doc, payee, account]));
  t.same([await chargeOn(rawDraft.id, null, null), await chargeOn(rawDraft.id, carrier, box), await chargeOn(rawDraft.id, carrier, null)], ['charge_payee_required', 'charge_payee_required', 'ok'], 'التحميل لجهة أو من صندوق، واحد بالضبط (E17)');

  // ── المبالغ (Q7، Q9) ─────────────────────────────────────────────────────────────────────────────────────────
  const amountsDoc = await receiptDraft(db, keeper, { wh: W.raw, party: grain, on: TODAY, lines: [{ item: I.corn, qty: 100 }] });
  t.same(
    [
      shown(await call(db, pricer, 'insert into public.receipt_line_amounts (line_id, line_total) values ($1, 100.5) returning id', [amountsDoc.lines[0]])),
      shown(await call(db, pricer, 'insert into public.receipt_amounts (doc_id, discount) values ($1, 0.5) returning id', [amountsDoc.id])),
    ],
    ['amount_not_whole_dinar', 'amount_not_whole_dinar'],
    'مبلغ السطر وخصم الفاتورة بالدينار الصحيح (Q7)',
  );
  await priceReceipt(db, pricer, amountsDoc, { totals: [{ total: 0 }] });
  t.same([(await previewReceipt(db, pricer, amountsDoc.id)).value.problems.map((p) => p.code), shown(await post(amountsDoc))], [['value_required'], 'value_required'], 'مبلغ صفر بلا سبب يرفض value_required (Q9)');
  await S.one(pricer, "update public.receipt_line_amounts set zero_reason = 'هدية من المورّد' where line_id = $1 returning id", [amountsDoc.lines[0]]);
  await S.one(pricer, 'insert into public.receipt_amounts (doc_id, discount) values ($1, 1) returning id', [amountsDoc.id]);
  t.eq(shown(await post(amountsDoc)), 'discount_exceeds_total', 'الخصم أكبر من مجموع السطور ← discount_exceeds_total');
  await S.one(pricer, 'update public.receipt_amounts set discount = 0, paid_now = 1 where doc_id = $1 returning id', [amountsDoc.id]);
  t.eq(shown(await post(amountsDoc)), 'paid_exceeds_total', 'المدفوع أكبر من الصافي ← paid_exceeds_total');
  await S.one(pricer, 'update public.receipt_line_amounts set line_total = 5000 where line_id = $1 returning id', [amountsDoc.lines[0]]);
  t.eq(shown(await post(amountsDoc)), 'cash_account_required', 'مدفوع بلا صندوق ← cash_account_required');
  await S.one(pricer, 'update public.receipt_amounts set paid_now = 0 where doc_id = $1 returning id', [amountsDoc.id]);
  t.eq(shown(await post(amountsDoc)), 'ok', 'ضابط: نفس المسوّدة بلا مدفوع تترحّل');

  // ── لقطة الكثافة (E46): تعديل المادّة بعد المعاينة ما يغيّر الترحيل ولا يرفضه، وإعادة حفظ السطر تحدّثها ويّا النسخة ─────────────
  const snapLines = [{ item: oil, qty: 1000 }, { item: I.corn, qty: 1080 }];
  const snapCharge = [{ label: 'نقل', amount: 20000, by: 'mass', box }];
  const snap = await receiptDraft(db, keeper, { wh: W.raw, party: grain, on: TODAY, lines: snapLines });
  await priceReceipt(db, pricer, snap, { totals: [2300000, 486000], charges: snapCharge });
  const massOf = async (docId) => (await previewReceipt(db, pricer, docId)).value.money.lines.map((l) => String(Number(l.mass_kg)));
  t.same(await massOf(snap.id), ['920', '1080'], 'المعاينة: الزيت 1,000 لتر × 0.92 = 920 كغم');
  const snapVersion = await versionOf(snap.id);
  await S.one(U.manager, 'update public.items set density_kg_per_l = 0.95 where id = $1 returning id', [oil]);
  t.same([shown(await postReceipt(db, pricer, snap.id, snapVersion)), await receiptLots(db, snap.id)], ['ok', [['1000', '2309200'], ['1080', '496800']]], 'الكثافة تغيّرت بعد المعاينة: الترحيل بلقطة السطر (9,200 و10,800) وبلا stale_draft');
  const resaved = await receiptDraft(db, keeper, { wh: W.raw, party: grain, on: TODAY, lines: snapLines });
  await priceReceipt(db, pricer, resaved, { totals: [2300000, 486000], charges: snapCharge });
  const before = await versionOf(resaved.id);
  await S.one(U.manager, 'update public.items set density_kg_per_l = 0.9 where id = $1 returning id', [oil]);
  await S.one(keeper, 'update public.receipt_lines set qty_in_unit = qty_in_unit where id = $1 returning id', [resaved.lines[0]]);
  t.same([await massOf(resaved.id), shown(await postReceipt(db, pricer, resaved.id, before))], [['900', '1080'], 'stale_draft'], 'إعادة حفظ السطر تحدّث اللقطة (0.9) وتزيد النسخة فيرفض الترحيل القديم stale_draft');

  // ── التوزيع بالقاعدة 27: سلفة «عليه 200,000» ثم استلام 3,250,000 بمدفوع 1,000,000 ← «له 2,050,000» بلا متبقّيين معاكسين ─────
  const advance = await call(db, pricer, 'select public.pay_party($1, $2, $3, 200000, $4, $5, $6)', [uid(), feedSupplier, B.feed_mill, box, TODAY, uid()]);
  t.ok(advance.ok, `سلفة المورّد 200,000 بدفتر المعمل (${advance.code ?? ''})`);
  const credit = await postedReceipt(db, { keeper, pricer, wh: W.raw, party: feedSupplier, on: TODAY, lines: r3Lines, totals: [2350000, 900000], paid: 1000000, box });
  t.same(
    [await balance(db, feedSupplier, B.feed_mill), (await remainders(db, feedSupplier, B.feed_mill)).map((r) => [r.kind, r.amount, r.remaining])],
    ['-2050000', [['payout', '200000', '0'], ['purchase', '-3250000', '2050000'], ['payout', '1000000', '0']]],
    'المدفوع يروح لاستلامه أوّلاً، والسلفة تقابل الباقي، والمورّد «له 2,050,000» (القاعدة 27)',
  );
  const paidPair = (await db.admin(
    "select a.amount::text as amount from public.party_allocations a join public.party_entries p on p.id = a.debit_entry_id where p.kind = 'payout' and p.doc_kind = 'receipt' and p.doc_id = $1",
    [credit.id],
  )).rows.map((r) => r.amount);
  t.same(paidPair, ['1000000'], 'دفعة الاستلام موزّعة على قيد استلامها هو');

  // ── المدفوع الغلط (E44): 1,000,000 بدل 100,000 ← إلغاء دفعته وتسديد صحيح، والاستلام يبقى مرحَّلاً ────────────────────────────
  const boxBefore = await boxBalance();
  const wrongPaid = await postedReceipt(db, { keeper, pricer, wh: W.raw, party: cashSupplier, on: TODAY, lines: r3Lines, totals: [2350000, 900000], paid: 1000000, box });
  const payout = (await db.admin("select id from public.party_entries where doc_kind = 'receipt' and doc_id = $1 and kind = 'payout'", [wrongPaid.id])).rows[0].id;
  const voidPay = await call(db, U.manager, 'select public.void_party_payment($1, $2, $3)', [payout, 'المدفوع كان 100,000', uid()]);
  const repay = await call(db, pricer, 'select public.pay_party($1, $2, $3, 100000, $4, $5, $6)', [uid(), cashSupplier, B.feed_mill, box, TODAY, uid()]);
  t.same(
    [voidPay.ok, repay.ok, (await db.admin('select status from public.receipts where id = $1', [wrongPaid.id])).rows[0].status, await balance(db, cashSupplier, B.feed_mill), BigInt(await boxBalance()) - BigInt(boxBefore)],
    [true, true, 'posted', '-3150000', -100000n],
    'E44: دفعة الاستلام تُلغى بـvoid_party_payment والصحيح بـpay_party، والصندوق والمورّد كأن المدفوع 100,000',
  );

  // ── المسوّدات ────────────────────────────────────────────────────────────────────────────────────────────────
  const stale = await receiptDraft(db, keeper, { wh: W.raw, party: grain, on: TODAY, lines: [{ item: I.corn, qty: 10 }] });
  await priceReceipt(db, pricer, stale, { totals: [4500] });
  const seenVersion = (await previewReceipt(db, pricer, stale.id)).value.version;
  await S.one(pricer, 'update public.receipt_line_amounts set line_total = 4600 where line_id = $1 returning id', [stale.lines[0]]);
  t.eq(shown(await postReceipt(db, pricer, stale.id, seenVersion)), 'stale_draft', 'مبلغ تعدّل بعد المعاينة ← stale_draft');
  // الأمين يحذف سطراً مسعَّراً عليه اختيار تحميل (مبلغه واختياره يروحون ويّاه)، والمحاسب يحذف التحميل؛ والعكس ممنوع.
  const pruned = await receiptDraft(db, keeper, { wh: W.raw, party: grain, on: TODAY, lines: [{ item: I.corn, qty: 10 }, { item: soy, qty: 10 }] });
  await priceReceipt(db, pricer, pruned, { totals: [4500, 9000], charges: [{ label: 'نقل', amount: 1000, by: 'mass', box, lines: [0] }] });
  const charge = (await db.admin('select id from public.receipt_charges where doc_id = $1', [pruned.id])).rows[0].id;
  const sideRows = async () =>
    (await db.admin('select (select count(*) from public.receipt_line_amounts where doc_id = $1)::int as amounts, (select count(*) from public.receipt_charge_lines where doc_id = $1)::int as picks, (select count(*) from public.receipt_charges where doc_id = $1)::int as charges', [pruned.id])).rows[0];
  t.same(
    [
      shown(await call(db, pricer, "select public.delete_draft_line('receipt', $1, $2)", [pruned.lines[0], await versionOf(pruned.id)])),
      shown(await call(db, keeper, 'select public.delete_receipt_charge($1, $2)', [charge, await versionOf(pruned.id)])),
    ],
    ['forbidden', 'forbidden'],
    'المحاسب ما يحذف سطر المسوّدة، والأمين ما يحذف التحميل',
  );
  const deleted = await call(db, keeper, "select public.delete_draft_line('receipt', $1, $2) ->> 'deleted'", [pruned.lines[0], await versionOf(pruned.id)]);
  t.same([deleted.value, await sideRows()], ['true', { amounts: 1, picks: 0, charges: 1 }], 'الأمين يحذف سطراً مسعَّراً: مبلغه واختيار تحميله يروحون ويّاه (مبالغ ما يشوفها)');
  const orphan = await previewReceipt(db, pricer, pruned.id);
  t.same([orphan.value.problems.map((p) => p.code), shown(await post(pruned))], [['charge_lines_required'], 'charge_lines_required'], 'تحميل انحذف سطره المختار الوحيد ما يتوسّع لكل السطور: charge_lines_required');
  const removed = await call(db, pricer, "select public.delete_receipt_charge($1, $2) ->> 'deleted'", [charge, await versionOf(pruned.id)]);
  const again = await call(db, pricer, "select public.delete_receipt_charge($1, $2) ->> 'deleted'", [charge, await versionOf(pruned.id)]);
  t.same([removed.value, again.value, await sideRows(), shown(await post(pruned))], ['true', 'false', { amounts: 1, picks: 0, charges: 0 }, 'ok'], 'المحاسب يحذف التحميل (والإعادة deleted: false)، والمسوّدة تترحّل');
  await draftWriteLock(t, db, {
    name: 'الاستلام',
    user: U.manager,
    draft: async () => {
      const doc = await receiptDraft(db, U.manager, { wh: W.raw, party: grain, on: TODAY, lines: [{ item: I.corn, qty: 10 }] });
      await priceReceipt(db, U.manager, doc, { totals: [4500] });
      return { id: doc.id, version: await versionOf(doc.id), lineId: doc.lines[0] };
    },
    posted: async () => {
      const doc = await postedReceipt(db, { keeper: U.manager, pricer: U.manager, wh: W.raw, party: grain, on: TODAY, lines: [{ item: I.corn, qty: 10 }], totals: [4500] });
      return { id: doc.id, lineId: doc.lines[0] };
    },
    insertHeader: (status) => ({ sql: 'insert into public.receipts (party_id, warehouse_id, received_on, status) values ($1, $2, $3, $4)', params: [grain, W.raw, TODAY, status] }),
    setStatus: (doc, status) => ({ sql: 'update public.receipts set status = $2 where id = $1', params: [doc.id, status] }),
    editLine: (doc) => ({ sql: 'update public.receipt_lines set qty_in_unit = qty_in_unit + 1 where id = $1', params: [doc.lineId] }),
    editAmount: (doc) => ({ sql: 'update public.receipt_line_amounts set line_total = line_total + 1 where line_id = $1', params: [doc.lineId] }),
  });

  // ── المنتهي يوم الاستلام (Q5): يرفض للمحاسب، ويمرّ بترحيل المدير ويّا تحذير المعاينة ─────────────────────────────────────
  const expired = await receiptDraft(db, keeper, { wh: W.medicine, party: grain, on: TODAY, lines: [{ item: I.vaccine, qty: 6, expiry: '2026-10-25' }] });
  await priceReceipt(db, pricer, expired, { totals: [6000] });
  const managerSeen = await previewReceipt(db, U.manager, expired.id);
  t.same(
    [shown(await post(expired)), managerSeen.value.lines[0].warning?.code, managerSeen.value.ready, shown(await post(expired, U.manager))],
    ['expired_on_receipt', 'expired_on_receipt', true, 'ok'],
    'المنتهي يوم الاستلام: المحاسب يُرفض expired_on_receipt، والمدير يرى التحذير ويرحّله',
  );

  // ── الإلغاء ─────────────────────────────────────────────────────────────────────────────────────────────────
  const boxStart = await boxBalance();
  const stockOf = async () => (await db.admin('select trim_scale(qty)::text as q, trim_scale(value)::text as v from public.stock_balances where item_id = $1 and warehouse_id = $2', [kerosene, W.general])).rows[0];
  const stockStart = await stockOf();
  const full = await postedReceipt(db, {
    keeper, pricer, wh: W.general, party: cashSupplier, on: TODAY, lines: [{ item: kerosene, qty: 500 }], totals: [375000], paid: 100000, box,
    charges: [{ label: 'نقل', amount: 5000, by: 'value', payee: carrier }, { label: 'تنزيل', amount: 2000, by: 'value', box }],
  });
  const cashBefore = await balance(db, cashSupplier, B.general);
  const carrierBefore = await balance(db, carrier, B.general);
  const voided = await voidReceipt(db, U.manager, full.id);
  const voidedRows = (await db.admin("select amount::text as amount, source, cash_move_id is not null as linked, on_date::text as on_date from public.expenses where doc_kind = 'receipt' and doc_id = $1", [full.id])).rows;
  t.same(
    [
      voided.ok,
      await stockOf(),
      BigInt(await balance(db, cashSupplier, B.general)) - BigInt(cashBefore),
      BigInt(await balance(db, carrier, B.general)) - BigInt(carrierBefore),
      BigInt(await boxBalance()) - BigInt(boxStart),
      voidedRows,
    ],
    [true, stockStart, 375000n, 5000n, -102000n, [{ amount: '2000', source: 'adjustment', linked: true, on_date: TODAY }]],
    'الإلغاء: المخزون كما كان بالفلس، والمورّد «عليه» المدفوع (من −275,000 لـ+100,000)، والناقل صفر، والصندوق ما يرجع، وتحميل الصندوق «استلام ملغى» واحد بمبلغه',
  );
  t.same([shown(await voidReceipt(db, U.manager, full.id)), shown(await voidReceipt(db, pricer, r3.id))], ['already_void', 'forbidden'], 'الملغى ما ينلغى مرّتين، والمحاسب ما يلغي');
  // دفعة استلام انسحب منها بالتحويل ← lot_consumed يسمّي TR.
  const petrol = await item('بنزين', 'fuel', 'L');
  const moved = await postedReceipt(db, { keeper, pricer, wh: W.general, party: grain, on: TODAY, lines: [{ item: petrol, qty: 100 }], totals: [75000] });
  const transfer = await postedTransfer(db, keeper, W.general, W.general2, TODAY, [{ item: petrol, qty: 40 }]);
  const consumed = await voidReceipt(db, U.manager, moved.id);
  t.same([consumed.code, consumed.hint.includes(transfer.result.doc_no)], ['lot_consumed', true], `إلغاء استلام انسحب منه ← lot_consumed يسمّي ${transfer.result.doc_no}`);
  // مورّد انؤرشف برصيد صفر بعد استلام نقدي: الإلغاء يمرّ (E43) ويصير «عليه» المدفوع.
  const archivedSupplier = await party('مورّد مؤرشف');
  const cashDoc = await postedReceipt(db, { keeper, pricer, wh: W.general, party: archivedSupplier, on: TODAY, lines: [{ item: kerosene, qty: 10 }], totals: [7500], paid: 7500, box });
  await S.one(pricer, 'update public.parties set archived_at = now() where id = $1 returning id', [archivedSupplier]);
  t.same([shown(await voidReceipt(db, U.manager, cashDoc.id)), await balance(db, archivedSupplier, B.general)], ['ok', '7500'], 'الإلغاء بعد أرشفة المورّد برصيد صفر يمرّ (E43) ويبقى المدفوع «عليه»');
  const archivedDraft = await receiptDraft(db, keeper, { wh: W.general, party: grain, on: TODAY, lines: [{ item: kerosene, qty: 1 }] });
  await S.one(keeper, 'update public.receipts set party_id = $2 where id = $1 returning id', [archivedDraft.id, archivedSupplier]);
  await priceReceipt(db, pricer, archivedDraft, { totals: [750] });
  t.eq(shown(await post(archivedDraft)), 'party_archived', 'المورّد المؤرشف ما يُستلم منه (Q2)');

  // ── الهويّة الحيّة: حساب موقوف أو محذوف بتوكن صالح ما يرحّل ولا يدفع ─────────────────────────────────────────────────
  const liveDoc = await receiptDraft(db, keeper, { wh: W.raw, party: grain, on: TODAY, lines: [{ item: I.corn, qty: 10 }] });
  await priceReceipt(db, pricer, liveDoc, { totals: [4500] });
  const dead = {};
  for (const [label, change] of [['banned', "banned_until = now() + interval '1 day'"], ['deleted', 'deleted_at = now()']]) {
    await db.admin(`update auth.users set ${change} where id = $1`, [pricer]);
    try {
      dead[label] = [shown(await post(liveDoc)), shown(await call(db, pricer, 'select public.pay_party($1, $2, $3, 1000, $4, $5, $6)', [uid(), grain, B.feed_mill, box, TODAY, uid()]))];
    } finally {
      await db.admin('update auth.users set banned_until = null, deleted_at = null where id = $1', [pricer]);
    }
  }
  t.same(dead, { banned: ['forbidden', 'forbidden'], deleted: ['forbidden', 'forbidden'] }, 'محاسب موقوف أو محذوف بتوكن صالح ما يرحّل الاستلام ولا يدفع');
  t.eq(shown(await post(liveDoc)), 'ok', 'ضابط: نفس المحاسب حيّاً يرحّل');

  // ── تسرّب الكلفة: الأمين يقرأ صفر صفوف من جداول المال، ومعاينته بلا money ──────────────────────────────────────────────
  const leak = await db.asUser(keeper, async (q) => {
    const out = {};
    for (const table of ['receipt_amounts', 'receipt_line_amounts', 'receipt_charges', 'receipt_charge_lines', 'receipt_charge_shares']) {
      out[table] = (await q(`select count(*)::int as n from public.${table}`)).rows[0].n;
    }
    out.preview = JSON.stringify((await q('select public.preview_receipt($1) as p', [r3.id])).rows[0].p).includes('"money"');
    out.lines = (await q('select count(*)::int as n from public.receipt_lines')).rows[0].n > 0;
    return out;
  });
  t.same(
    leak,
    { receipt_amounts: 0, receipt_line_amounts: 0, receipt_charges: 0, receipt_charge_lines: 0, receipt_charge_shares: 0, preview: false, lines: true },
    'الأمين: صفر صفوف من مبالغ الاستلام وتحميلاته وحصصها، ومعاينته بلا money، ويقرأ السطور (ضابط)',
  );

  // ── الأداء: استلام بـ200 سطر يترحّل بأقلّ من 8 ثوانٍ ────────────────────────────────────────────────────────────
  const big = await receiptDraft(db, keeper, { wh: W.raw, party: grain, on: TODAY, lines: Array.from({ length: 200 }, () => ({ item: I.corn, qty: 10 })) });
  await priceReceipt(db, pricer, big, { totals: Array(200).fill(4501), discount: 777, charges: [{ label: 'نقل', amount: 9999, by: 'mass', payee: carrier }] });
  const started = Date.now();
  const bigPosted = await post(big);
  const elapsed = Date.now() - started;
  t.ok(bigPosted.ok && elapsed < 8000, `200 سطر ترحّلت (${shown(bigPosted)}) بـ${elapsed} ملّي ثانية (< 8,000)`);

  // ── السباقات (§2.3، D6): إلغاء استلام ودفع لنفس المورّد بنفس اللحظة (C8)، واستلامان ينشئان أوّل صفّ رصيد لنفس (المادّة، المخزن)
  //    (C10)، ونفس المرجع مرّتين (sameRefRace) ─────────────────────────────────────────────────────────────────────────
  const POST = 'select public.post_receipt($1, $2, gen_random_uuid()) as result';
  const raced = await postedReceipt(db, { keeper, pricer, wh: W.raw, party: feedSupplier, on: TODAY, lines: [{ item: I.corn, qty: 100 }], totals: [45000] });
  const c8 = await race(
    db,
    { user: U.manager, sql: "select public.void_receipt($1, 'استلام مكرّر', gen_random_uuid())", params: [raced.id] },
    { user: pricer, sql: 'select public.pay_party($1, $2, $3, 1000, $4, $5, gen_random_uuid())', params: [uid(), feedSupplier, B.feed_mill, box, TODAY] },
  );
  t.same([c8.first, c8.state, c8.second], ['ok', 'blocked', 'ok'], 'C8: الدفع للمورّد ينام على قفل جهته لحد ما الإلغاء يثبت، والاثنان ينجحان');
  const fresh = await item('ذرة بيضاء', 'raw', 'kg');
  const firstRow = [];
  for (const qty of [10, 20]) {
    const doc = await receiptDraft(db, keeper, { wh: W.raw, party: grain, on: TODAY, lines: [{ item: fresh, qty }] });
    firstRow.push({ id: doc.id, version: await priceReceipt(db, pricer, doc, { totals: [qty * 100] }) });
  }
  const c10 = await race(db, { user: pricer, sql: POST, params: [firstRow[0].id, firstRow[0].version] }, { user: U.manager, sql: POST, params: [firstRow[1].id, firstRow[1].version] });
  const rowsAt = (await db.admin('select count(*)::int as n, trim_scale(sum(qty))::text as q from public.stock_balances where item_id = $1 and warehouse_id = $2', [fresh, W.raw])).rows[0];
  t.same([c10.first, c10.state, c10.second, rowsAt], ['ok', 'blocked', 'ok', { n: 1, q: '30' }], 'C10: الثاني ينام على إنشاء صفّ الرصيد ثم يكمل، وصفّ واحد بـ30 كغم');
  await sameRefRace(t, db, {
    name: 'الاستلام',
    user: pricer,
    draft: async () => {
      const doc = await receiptDraft(db, keeper, { wh: W.raw, party: grain, on: TODAY, lines: [{ item: I.corn, qty: 5 }] });
      return { id: doc.id, version: await priceReceipt(db, pricer, doc, { totals: [2250] }) };
    },
    post: (docId, version, ref) => ({ sql: 'select public.post_receipt($1, $2, $3) as result', params: [docId, version, ref] }),
    postings: async (docId) => (await db.admin("select count(*)::int as count, count(distinct doc_no)::int as numbers from public.receipts where id = $1 and status = 'posted'", [docId])).rows[0],
  });

  // ── مراجعة WP6 (كل حالة كانت تمرّ قبل إصلاحها) ─────────────────────────────────────────────────────────────────────
  // لقطة وحدة الأساس: «5 طنّ» انكتبت والمادّة كغم، ثم صارت لتراً ← المعاينة تقول والترحيل يرفض (كان يخلق 5,000 لتر).
  const solvent = await item('مذيب صناعي', 'raw', 'kg');
  const unitDoc = await receiptDraft(db, keeper, { wh: W.raw, party: grain, on: TODAY, lines: [{ item: solvent, qty: 5, code: 't' }] });
  await priceReceipt(db, pricer, unitDoc, { totals: [100000] });
  const unitVersion = await versionOf(unitDoc.id);
  await S.one(U.owner, "update public.items set base_unit = 'L' where id = $1 returning id", [solvent]);
  const unitSeen = (await previewReceipt(db, pricer, unitDoc.id)).value;
  t.same(
    [unitSeen.lines[0].problem?.code, unitSeen.ready, shown(await postReceipt(db, pricer, unitDoc.id, unitVersion)), await receiptLots(db, unitDoc.id)],
    ['base_unit_changed', false, 'base_unit_changed', []],
    'وحدة الأساس تغيّرت بعد السطر: المعاينة base_unit_changed والترحيل يرفض بلا دفعة',
  );
  // وحدة شراء خاصّة بمورّد، والأمين غيّر مورّد الرأس بعدها ← المعاينة والترحيل unit_mismatch (كان يمرّ بوحدة مورّد ثاني).
  const sack = await S.one(U.manager, 'insert into public.item_units (item_id, label, factor_to_base, for_purchase, party_id) values ($1, $2, 25, true, $3) returning id', [soy, 'كيس الحبوب 25 كغم', grain]);
  const sackDoc = await receiptDraft(db, keeper, { wh: W.raw, party: grain, on: TODAY, lines: [{ item: soy, qty: 4, unit: sack }] });
  await S.one(keeper, 'update public.receipts set party_id = $2 where id = $1 returning id', [sackDoc.id, feedSupplier]);
  await priceReceipt(db, pricer, sackDoc, { totals: [50000] });
  t.same(
    [(await previewReceipt(db, pricer, sackDoc.id)).value.lines[0].problem?.code, shown(await post(sackDoc))],
    ['unit_mismatch', 'unit_mismatch'],
    'وحدة مورّد الحبوب بعد تغيير المورّد: unit_mismatch بالمعاينة والترحيل',
  );
  // المعاينة تقول ما يرفضه الترحيل بالأرشيف: ناقل التحميل وصندوق المدفوع (كانت ready والترحيل يرفض).
  const lateCarrier = await party('ناقل انؤرشف');
  const lateBox = await S.one(U.accountant, "insert into public.cash_accounts (name, kind) values ('صندوق انؤرشف', 'cash') returning id");
  const archDoc = await receiptDraft(db, keeper, { wh: W.raw, party: grain, on: TODAY, lines: [{ item: I.corn, qty: 10 }] });
  await priceReceipt(db, pricer, archDoc, { totals: [4500], paid: 1000, box: lateBox, charges: [{ label: 'نقل', amount: 100, by: 'mass', payee: lateCarrier }] });
  await S.one(pricer, 'update public.parties set archived_at = now() where id = $1 returning id', [lateCarrier]);
  await S.one(pricer, 'update public.cash_accounts set archived_at = now() where id = $1 returning id', [lateBox]);
  const archSeen = (await previewReceipt(db, pricer, archDoc.id)).value;
  t.same(
    [archSeen.ready, archSeen.problems.map((x) => x.code).sort(), shown(await post(archDoc))],
    [false, ['cash_account_archived', 'party_archived'], 'cash_account_archived'],
    'المعاينة: الناقل والصندوق المؤرشفان مشكلتان، والترحيل يرفض',
  );
  // الإلغاء يعيد فحص جهاته بعد قفل المستند: إلغاء ينتظر قفل المورّد، والمسوّدة تغيّر ناقلها وتترحّل بجلسة ماسكة القفل ← stale_draft
  // (كان يكمل ويكتب قيد الناقل الجديد بلا قفله).
  const raceSupplier = await party('مورّد سباق الإلغاء');
  const firstCarrier = await party('ناقل أوّل');
  const secondCarrier = await party('ناقل ثانٍ');
  const partyRaced = await receiptDraft(db, keeper, { wh: W.raw, party: raceSupplier, on: TODAY, lines: [{ item: I.corn, qty: 10 }] });
  await priceReceipt(db, pricer, partyRaced, { totals: [4500], charges: [{ label: 'نقل', amount: 100, by: 'mass', payee: firstCarrier }] });
  const holder = await db.session(pricer);
  const voider = await db.session(U.manager);
  let voidRace;
  try {
    await holder.run('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`party:${raceSupplier}`]);
    const pending = voider.run('select public.void_receipt($1, $2, $3)', [partyRaced.id, 'سباق الإلغاء', uid()]);
    const state = await db.settle(pending, voider.pid);
    await S.one(pricer, 'update public.receipt_charges set payee_party_id = $2 where doc_id = $1 returning id', [partyRaced.id, secondCarrier]);
    const postedNow = await holder.run('select public.post_receipt($1, $2, $3)', [partyRaced.id, await versionOf(partyRaced.id), uid()]);
    await holder.commit();
    const outcome = await pending;
    await voider.rollback();
    voidRace = [state, postedNow.ok, outcome.ok ? 'ok' : outcome.error];
  } finally {
    await holder.rollback();
    await voider.rollback();
  }
  t.same(voidRace, ['blocked', true, 'stale_draft'], 'إلغاء انتظر والناقل تغيّر وترحّل: stale_draft');
  t.eq(shown(await voidReceipt(db, U.manager, partyRaced.id)), 'ok', 'والإلغاء من جديد يمرّ بجهاته الحالية');

  // ── الثوابت ومسابيرها (كل مسبار يكسر قيمة مخزونة وحدة بمعاملة ترجع) ─────────────────────────────────────────────────────
  t.same(await db.asService(verifyStock), STOCK_ZERO, 'verify_stock صفر بعد الاستلامات والتحميلات والإلغاءات');
  t.same(await db.asService(verifyLedger), LEDGER_ZERO, 'verify_ledger صفر (أرقام PU بلا فجوة، ومصادر حركتي الاستلام)');
  // الحارس يرفض تعديل مبالغ مستند مرحَّل لأي دور (حتى صاحب الجدول)، فمسبار الخصم يطفّيه بنفس المعاملة اللي ترجع.
  const probe = async (sql, params, guard = null) => db.asOwner(async (q) => {
    if (guard) await q(`alter table public.${guard[0]} disable trigger ${guard[1]}`);
    await q(sql, params);
    return verifyStock(q);
  }, U.owner);
  const lineOf = async (docId, n) => (await db.admin('select id from public.receipt_lines where doc_id = $1 order by line_no limit 1 offset $2', [docId, n])).rows[0].id;
  const probes = {
    receipt_discount: await probe('update public.receipt_amounts set discount = discount + 1 where doc_id = $1', [big.id], ['receipt_amounts', 'receipt_amounts_guard']),
    receipt_charge_shares: await probe('update public.receipt_charge_shares set share = share + 0.01 where line_id = $1', [await lineOf(r3.id, 1)]),
    receipt_lot_values: await probe("update public.stock_lots set value_in = value_in + 0.01, value_left = value_left + 0.01 where source_kind = 'receipt' and source_line_id = $1", [await lineOf(r3.id, 0)]),
    receipt_entries: await probe('update public.receipt_charges set party_entry_id = null where doc_id = $1', [r3.id]),
  };
  t.same(
    Object.fromEntries(Object.entries(probes).map(([name, got]) => [name, got[name] > 0])),
    { receipt_discount: true, receipt_charge_shares: true, receipt_lot_values: true, receipt_entries: true },
    `مسابير الفحوص 14–17 (الخطّة 10–13): كل واحد يمسك قيمته المكسورة (${JSON.stringify(Object.fromEntries(Object.entries(probes).map(([n, g]) => [n, g[n]])))})`,
  );
  // مصروف «استلام ملغى» ما يشير لحركة تحميل بنفس الاستلام (نسخة من مصروف الإلغاء بلا حركة) ← receipt_entries (كان صفراً).
  const stray = await probe(
    "insert into public.expenses select (jsonb_populate_record(null::public.expenses, to_jsonb(e) || jsonb_build_object('id', gen_random_uuid(), 'cash_move_id', null))).* from public.expenses e where e.doc_kind = 'receipt' and e.doc_id = $1",
    [full.id],
    ['expenses', 'expenses_check'],
  );
  t.ok(stray.receipt_entries > 0, `مسبار: مصروف «استلام ملغى» بلا حركة تحميله يمسكه receipt_entries (${stray.receipt_entries})`);
  const gap = await db.asOwner(async (q) => {
    await q("update public.doc_counters set last_no = last_no + 1 where org_id = $1 and kind = 'PU'", [S.org]);
    return verifyLedger(q);
  }, U.owner);
  t.same(gap, { ...LEDGER_ZERO, doc_numbers: 1 }, 'ضابط: عدّاد PU بفجوة يقلب doc_numbers وحده');
}

/**
 * منطقة الجلسة ما تغيّر يوم المستند (GT-18، نمط stock.test): الترحيل يحكم بـapp_today (يوم بغداد) بأي منطقة، فاستلام بتاريخ قبل
 * 8 أيام يرفض date_too_old وقبل 7 يمرّ، بنفس النتيجة بالمناطق الأربع، بيوم الخادم الحقيقي.
 */
async function zoneSweep(t, db) {
  const goLive = (await db.admin('select (public.app_today() - 30)::text as d')).rows[0].d;
  const Z = await makeStockOrg(db, {
    name: 'مزرعة مناطق الاستلام',
    id: (n) => `5f100000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    phone: (n) => `96477098800${String(n).padStart(2, '0')}`,
    goLive,
  });
  const supplier = await Z.one(Z.users.accountant, "insert into public.parties (name, is_supplier) values ('مورّد المناطق', true) returning id");
  const dayBack = async (n) => (await db.admin('select (public.app_today() - $1::int)::text as d', [n])).rows[0].d;
  const draftOn = async (on) => {
    const doc = await receiptDraft(db, Z.users.manager, { wh: Z.W.raw, party: supplier, on, lines: [{ item: Z.I.corn, qty: 10 }] });
    return { id: doc.id, version: await priceReceipt(db, Z.users.manager, doc, { totals: [4500] }) };
  };
  const drafts = { old: await draftOn(await dayBack(8)), edge: await draftOn(await dayBack(7)) };
  const zones = {};
  for (const zone of ['UTC', 'Etc/GMT+12', 'Pacific/Kiritimati', 'Asia/Baghdad']) {
    zones[zone] = await db.asUser(Z.users.manager, async (q) => {
      await q(`set local timezone = '${zone}'`);
      const codes = async (docId) => (await q('select public.preview_receipt($1) as p', [docId])).rows[0].p.problems.map((p) => p.code);
      const post = async (doc) => {
        await q('savepoint z');
        try {
          await q('select public.post_receipt($1, $2, gen_random_uuid())', [doc.id, doc.version]);
          return 'ok';
        } catch (error) {
          return error.message;
        } finally {
          await q('rollback to savepoint z');
        }
      };
      return [await codes(drafts.old.id), await codes(drafts.edge.id), await post(drafts.old), await post(drafts.edge)];
    });
  }
  const expected = [['date_too_old'], [], 'date_too_old', 'ok'];
  t.same(zones, Object.fromEntries(Object.keys(zones).map((zone) => [zone, expected])), 'GT-18: معاينة الاستلام وترحيله بنفس الحكم بالمناطق الأربع (قبل 8 أيام يرفض، وقبل 7 يمرّ)');
}
