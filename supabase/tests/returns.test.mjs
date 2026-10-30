// مرتجع المورّد وتصحيح سعر الاستلام (WP7، 0010؛ FOUNDATION ١٤١، ٣٣٤–٣٣٧، ٤٧٦، ٥٥١–٥٥٣، ٥٩٤؛ E5 وE15 وE16 وE47 وE51 وE55). الأرقام
// من مثال FOUNDATION (C2 وS2: 5,000 كغم بـ2,350,000 و1,000 كغم بـ900,000، ونقل 65,000 بالوزن ← C2 بـ2,404,166.67): المرتجع من C2
// السليمة بقاعدة قيمة السحب والمقبول قيد للمورّد والفرق «فرق مرتجع»؛ والتصحيح بعد سحب 2,120 كغم (1,019,366.67): حصّة المتبقّي على
// الدفعة ومراياها، والباقي «فرق سعر شراء»، وقيد المورّد −الفرق؛ والإلغاءات ترجّع كل شي بالفلس. كل نداء بدور authenticated حقيقي.
import { balance, call, shown, uid, verifyLedger, LEDGER_ZERO } from './ledger-kit.mjs';
import { postedReceipt, receiptLots, voidReceipt } from './receipt-kit.mjs';
import { creditReturn, postReturn, postRevalue, postedReturn, postedUse, previewReturn, previewRevalue, returnDraft, voidReturn, voidRevalue, voidUse } from './return-kit.mjs';
import { draftWriteLock, race, sameRefRace } from './shared.mjs';
import { STOCK_ZERO, lotsOf, makeStockOrg, postedTransfer, verifyStock, voidTransfer } from './stock-kit.mjs';

const TODAY = '2026-10-30';
const GO_LIVE = '2026-10-20';
const id = (n) => `e7000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477096500${String(n).padStart(2, '0')}`;

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const S = await makeStockOrg(db, { name: 'مزرعة المرتجع', id, phone, goLive: GO_LIVE });
  const { users: U, W, books: B, divisions: D } = S;
  await S.one(U.owner, "select public.set_member_scopes_v2($1, '{}', '{}', $2::uuid[])", [S.members.storekeeper, [W.raw, W.general]]);
  const rawSite = (await db.admin('select site_id from public.warehouses where id = $1', [W.raw])).rows[0].site_id;
  W.raw2 = await S.one(U.owner, "insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن مواد ثانٍ', 'raw') returning id", [D.feed_mill, rawSite]);
  const rawItem = (name) => S.one(U.owner, "insert into public.items (name, kind, base_unit) values ($1, 'raw', 'kg') returning id", [name]);
  const party = (name) => S.one(U.accountant, 'insert into public.parties (name, is_supplier) values ($1, true) returning id', [name]);
  const grain = await party('مورّد الحبوب');
  const carrier = await party('الناقل');
  const category = await S.one(U.manager, "insert into public.expense_categories (name) values ('صيانة') returning id");
  const keeper = U.storekeeper;
  const pricer = U.accountant;
  const manager = U.manager;
  const book = B.feed_mill;
  const c2s2 = async (corn, soy) =>
    postedReceipt(db, {
      keeper, pricer, wh: W.raw, party: grain, on: TODAY,
      lines: [{ item: corn, qty: 5000 }, { item: soy, qty: 1000 }], totals: [2350000, 900000],
      charges: [{ label: 'نقل', amount: 65000, by: 'mass', payee: carrier }],
    });
  const lots = async (item, wh = W.raw) => (await lotsOf(db, item, wh)).map((l) => [l.qty_left, l.value_left, l.qty_in, l.value_in]);
  const expenses = async (kind, docId) =>
    (await db.admin('select trim_scale(amount)::text as a from public.expenses where doc_kind = $1 and doc_id = $2 order by created_at, reverses_id nulls first', [kind, docId])).rows.map((r) => r.a);
  const verifyAll = async (label) => {
    t.same(await db.asService(verifyStock), STOCK_ZERO, `verify_stock صفر: ${label}`);
    t.same(await db.asService(verifyLedger), LEDGER_ZERO, `verify_ledger صفر: ${label}`);
  };

  // ── المرتجع (المشتق): 1,000 كغم من C2 السليمة ← 480,833.33، والمقبول 470,000 قيد للمورّد، والفرق 10,833.33 «فرق مرتجع» ─────────
  const cornA = await rawItem('ذرة المرتجع');
  const soyA = await rawItem('صويا المرتجع');
  const rA = await c2s2(cornA, soyA);
  t.same(await receiptLots(db, rA.id), [['5000', '2404166.67'], ['1000', '910833.33']], 'C2 وS2 كما بمثال FOUNDATION');
  const bookStart = BigInt(await balance(db, grain, book));
  const retA = await returnDraft(db, keeper, { receipt: rA.id, on: TODAY, lines: [{ receiptLine: rA.lines[0], qty: 1000 }] });
  const keeperSeen = (await previewReturn(db, keeper, retA.id)).value;
  t.same([keeperSeen.money ?? null, keeperSeen.ready, keeperSeen.lines[0].whole_balance, keeperSeen.lines[0].lot_qty_left], [null, false, false, '5000.000'], 'معاينة الأمين: كميات بلا مال، وغير جاهزة');
  t.same([shown(await postReturn(db, keeper, retA.id, retA.version)), shown(await call(db, keeper, 'insert into public.supplier_return_line_amounts (line_id, credit_amount) values ($1, 470000)', [retA.lines[0]]))],
    ['forbidden', 'forbidden'], 'الأمين ما يرحّل المرتجع ولا يكتب المقبول (E47)');
  const notCredited = (await previewReturn(db, pricer, retA.id)).value;
  t.same([notCredited.ready, notCredited.problems.map((p) => p.code), shown(await postReturn(db, pricer, retA.id, retA.version))], [false, ['credit_required'], 'credit_required'], 'بلا مقبول: credit_required بالمعاينة والترحيل');
  t.eq(shown(await call(db, pricer, 'insert into public.supplier_return_line_amounts (line_id, credit_amount) values ($1, 470000.5)', [retA.lines[0]])), 'credit_not_whole_dinar', 'المقبول بالدينار الصحيح');
  const retAVersion = await creditReturn(db, pricer, retA, [470000]);
  const seen = (await previewReturn(db, pricer, retA.id)).value;
  t.same([seen.ready, seen.money.lines[0].value, seen.money.lines[0].credit, seen.money.lines[0].diff], [true, '480833.33', '470000', '10833.33'], 'معاينة الكلفة: قيمة السحب 480,833.33 والمقبول 470,000 والفرق 10,833.33');
  const postedA = await postReturn(db, pricer, retA.id, retAVersion);
  t.same(
    [postedA.ok && postedA.value.doc_no, BigInt(await balance(db, grain, book)) - bookStart, await expenses('supplier_return', retA.id), (await lots(cornA))[0]],
    ['RT-2026-0001', 470000n, ['10833.33'], ['4000', '1923333.34', '5000', '2404166.67']],
    'RT-2026-0001: المورّد «له 2,780,000» (+470,000)، و«فرق مرتجع» 10,833.33، وC2 بـ4,000 كغم و1,923,333.34',
  );
  t.eq(BigInt(await balance(db, grain, book)), bookStart + 470000n, 'دفتر المورّد: −3,250,000 + 470,000');
  await verifyAll('بعد المرتجع');
  // إلغاء الاستلام يرفض والمرتجع مرحَّل، ويسمّيه.
  const blocked = await voidReceipt(db, manager, rA.id);
  t.same([blocked.code, blocked.hint?.includes('RT-2026-0001')], ['has_supplier_returns', true], 'void_receipt يرفض has_supplier_returns ويسمّي RT');
  // أكثر من المتبقّي يرفض ويسمّي المستند اللي سحب: تحويل 3,500 كغم من C2.
  const moved = await postedTransfer(db, manager, W.raw, W.raw2, TODAY, [{ item: cornA, qty: 3500 }]);
  const tooMuch = await returnDraft(db, keeper, { receipt: rA.id, on: TODAY, lines: [{ receiptLine: rA.lines[0], qty: 1000 }] });
  const tooMuchVersion = await creditReturn(db, pricer, tooMuch, [400000]);
  const shortSeen = (await previewReturn(db, pricer, tooMuch.id)).value;
  const shortPost = await postReturn(db, pricer, tooMuch.id, tooMuchVersion);
  t.same(
    [shortSeen.ready, shortSeen.lines[0].problem?.code, shortSeen.lines[0].problem?.hint.includes(moved.result.doc_no), shortPost.code, shortPost.hint?.includes(moved.result.doc_no)],
    [false, 'insufficient_stock', true, 'insufficient_stock', true],
    `أكثر من المتبقّي (500 كغم): insufficient_stock يسمّي ${moved.result.doc_no} بالمعاينة والترحيل`,
  );
  // إلغاء المرتجع بعد سحب لاحق من دفعته يرفض (FOUNDATION ٥٥٣ حرفياً)، وبعد إلغاء التحويل يمرّ ويرجّع كل شي بالفلس.
  const consumed = await voidReturn(db, manager, retA.id);
  t.same([consumed.code, consumed.hint?.includes(moved.result.doc_no)], ['lot_consumed', true], 'إلغاء المرتجع بعد تحويل من دفعته: lot_consumed يسمّي التحويل');
  t.eq(shown(await voidTransfer(db, manager, moved.id)), 'ok', 'التحويل ينلغى أوّلاً');
  t.same([shown(await voidReturn(db, pricer, retA.id)), shown(await voidReturn(db, manager, retA.id)), shown(await voidReturn(db, manager, retA.id))], ['forbidden', 'ok', 'already_void'], 'الإلغاء للمدير، ومرّة وحدة');
  t.same(
    [(await lots(cornA))[0], BigInt(await balance(db, grain, book)) - bookStart, await expenses('supplier_return', retA.id)],
    [['5000', '2404166.67', '5000', '2404166.67'], 0n, ['10833.33', '-10833.33']],
    'بعد الإلغاء: C2 كما استُلمت بالفلس، والمورّد كما كان، و«فرق مرتجع» بصفّ عكسي',
  );
  t.eq(shown(await call(db, keeper, "select public.discard_draft('supplier_return', $1, $2)", [tooMuch.id, tooMuchVersion])), 'ok', 'الأمين يطوي مسوّدة المرتجع');
  t.eq(shown(await voidReceipt(db, manager, rA.id)), 'ok', 'والاستلام ينلغى بعد إلغاء مرتجعه');
  await verifyAll('بعد السلسلة كلها');
  // المقبول صفر: بلا قيد، والفرق كلّه مصروف؛ والمنتهي يُرجَع (المرتجع برّا قاعدة الانتهاء).
  const cornZ = await rawItem('ذرة بلا مقبول');
  const rZ = await postedReceipt(db, { keeper, pricer, wh: W.raw, party: grain, on: TODAY, lines: [{ item: cornZ, qty: 100 }], totals: [50000] });
  const zero = await postedReturn(db, { keeper, pricer, receipt: rZ.id, on: TODAY, lines: [{ receiptLine: rZ.lines[0], qty: 100 }], credits: [0] });
  t.same(
    [(await db.admin("select count(*)::int as n from public.party_entries where doc_kind = 'supplier_return' and doc_id = $1", [zero.id])).rows[0].n, await expenses('supplier_return', zero.id), (await lots(cornZ))[0]],
    [0, ['50000'], ['0', '0', '100', '50000']],
    'مقبول صفر: بلا قيد للمورّد، و«فرق مرتجع» = كل قيمة الدفعة، والدفعة تخلص بقيمتها بالضبط (كل المتبقّي)',
  );
  // الرأس من الاستلام: مورّده ومخزنه ودفتره منسوخة، ومن استلام مو مرحَّل يرفض؛ والسطر من استلامه بس.
  const draftReceipt = (await call(db, keeper, "insert into public.receipts (party_id, warehouse_id, received_on) values ($1, $2, $3) returning id", [grain, W.raw, TODAY])).value;
  t.eq(shown(await call(db, keeper, 'insert into public.supplier_returns (receipt_id, returned_on) values ($1, $2)', [draftReceipt, TODAY])), 'receipt_not_posted', 'مرتجع من مسوّدة استلام: receipt_not_posted');
  const header = (await db.admin('select party_id, warehouse_id, book_id from public.supplier_returns where id = $1', [zero.id])).rows[0];
  t.same([header.party_id, header.warehouse_id, header.book_id], [grain, W.raw, book], 'المورّد والمخزن والدفتر منسوخة من الاستلام');
  const foreign = await returnDraft(db, keeper, { receipt: rZ.id, on: TODAY, lines: [] });
  t.eq(shown(await call(db, keeper, 'insert into public.supplier_return_lines (doc_id, receipt_line_id, qty_base) values ($1, $2, 1)', [foreign.id, rA.lines[0]])), 'line_not_found', 'سطر من استلام ثاني: line_not_found');
  const partyWrite = await call(db, keeper, 'update public.supplier_returns set party_id = $2 where id = $1', [foreign.id, carrier]);
  t.same([partyWrite.code?.startsWith('42501'), shown(await postReturn(db, pricer, foreign.id, foreign.version))], [true, 'return_empty'], 'المورّد ما ينكتب مباشرةً، والمرتجع بلا سطور return_empty');
  // استلام بتاريخ اليوم ومرتجع بتاريخ قبله (ضمن الأيام السبعة): return_before_receipt بالمعاينة والترحيل.
  t.eq(shown(await call(db, keeper, "update public.supplier_returns set returned_on = '2026-10-25' where id = $1", [foreign.id])), 'ok', 'التاريخ حرّ بالمسوّدة');
  await call(db, keeper, 'insert into public.supplier_return_lines (doc_id, receipt_line_id, qty_base) values ($1, $2, 1)', [foreign.id, rZ.lines[0]]);
  const earlyVersion = await creditReturn(db, pricer, { id: foreign.id, lines: [(await db.admin('select id from public.supplier_return_lines where doc_id = $1', [foreign.id])).rows[0].id] }, [10]);
  t.same(
    [(await previewReturn(db, pricer, foreign.id)).value.problems.map((p) => p.code), shown(await postReturn(db, pricer, foreign.id, earlyVersion))],
    [['return_before_receipt'], 'return_before_receipt'],
    'مرتجع بتاريخ قبل استلامه: return_before_receipt',
  );

  // ── التصحيح (المشتق): بعد سحب 2,120 كغم يبقى بـC2 2,880 كغم بـ1,384,800.00؛ والجديد 2,400,000 (+50,000) ← حصّة 28,800.00 ─────
  const cornB = await rawItem('ذرة التصحيح');
  const soyB = await rawItem('صويا التصحيح');
  const rB = await c2s2(cornB, soyB);
  const lineB = rB.lines[0];
  t.eq(shown(await postRevalue(db, manager, lineB, 2400000)), 'not_drawn', 'قبل أي سحب: not_drawn (يلغي الاستلام ويعيده)');
  const use1 = await postedUse(db, manager, { wh: W.raw, category, on: TODAY, item: cornB, qty: 2120 });
  t.same((await lots(cornB))[0], ['2880', '1384800', '5000', '2404166.67'], 'بعد سحب 2,120 كغم (1,019,366.67): 2,880 كغم بـ1,384,800.00');
  t.same(
    [shown(await postRevalue(db, manager, lineB, 2350000)), shown(await postRevalue(db, manager, lineB, -5)), shown(await postRevalue(db, manager, lineB, 2400000.5)),
      shown(await postRevalue(db, manager, lineB, 2400000, ' ')), shown(await postRevalue(db, pricer, lineB, 2400000))],
    ['same_total', 'negative_total', 'amount_not_whole_dinar', 'reason_required', 'forbidden'],
    'نفس المبلغ same_total، والسالب، والكسر، وبلا سبب، والمحاسب forbidden',
  );
  const bookB = BigInt(await balance(db, grain, book));
  const plan = (await previewRevalue(db, manager, lineB, 2400000)).value;
  t.same(
    [plan.ready, plan.current_total, plan.diff, plan.lot_share, plan.expense_amount, plan.supplier_adjustment, plan.family.map((f) => f.share)],
    [true, '2350000', '50000', '28800.00', '21200.00', '-50000', ['28800.00']],
    'المعاينة: الفرق 50,000، وحصّة الدفعة 28,800.00، و«فرق سعر شراء» 21,200.00، وقيد المورّد −50,000',
  );
  // FOUNDATION ٥٢٠: سحب بين المعاينة والترحيل يغيّر القسمة، فالبصمة القديمة stale_preview والجديدة تمرّ.
  const extraUse = await postedUse(db, manager, { wh: W.raw, category, on: TODAY, item: cornB, qty: 20 });
  t.same([shown(await postRevalue(db, manager, lineB, 2400000, 'فاتورة', uid(), plan.plan)), shown(await postRevalue(db, manager, lineB, 2400000, 'فاتورة', uid(), 'بصمة مزوّرة'))],
    ['stale_preview', 'stale_preview'], 'معاينة قبل سحب جديد (أو بصمة مزوّرة): stale_preview');
  t.eq(shown(await voidUse(db, manager, extraUse.id)), 'ok', 'السحب الجديد ينلغى فترجع القسمة كما انعاينت');
  const rev1 = await postRevalue(db, manager, lineB, 2400000, 'فاتورة مصحّحة من المورّد', uid(), plan.plan);
  t.same(
    [rev1.ok, (await lots(cornB))[0], BigInt(await balance(db, grain, book)) - bookB, await expenses('receipt_revalue', rev1.value?.id)],
    [true, ['2880', '1413600', '5000', '2432966.67'], -50000n, ['21200']],
    'بعد التصحيح: C2 متبقّيها 1,413,600.00 وداخلها 2,432,966.67، والمورّد −50,000، و«فرق سعر شراء» 21,200',
  );
  await verifyAll('بعد التصحيح');
  // الإلغاء بعد سحب لاحق يرفض ويسمّيه؛ وبعد إلغاء السحب يرجّع كل شي بالفلس.
  const use2 = await postedUse(db, manager, { wh: W.raw, category, on: TODAY, item: cornB, qty: 100 });
  const late = await voidRevalue(db, manager, rev1.value.id);
  t.same([late.code, late.hint?.includes(use2.docNo)], ['lot_consumed', true], `إلغاء التصحيح بعد سحب لاحق: lot_consumed يسمّي ${use2.docNo}`);
  t.eq(shown(await voidUse(db, manager, use2.id)), 'ok', 'الصرف اللاحق ينلغى أوّلاً');
  t.same([shown(await voidRevalue(db, manager, rev1.value.id)), (await lots(cornB))[0], BigInt(await balance(db, grain, book)) - bookB, await expenses('receipt_revalue', rev1.value.id)],
    ['ok', ['2880', '1384800', '5000', '2404166.67'], 0n, ['21200', '-21200']], 'إلغاء التصحيح: الدفعة والمورّد كما كانا بالفلس، والمصروف بصفّ عكسي');
  // مرآة: 1,000 من 2,880 كغم بمخزن ثاني ← الحصص 18,800.00 (الجذر) و10,000.00 (المرآة)؛ وسعر أوطأ بعده يمشي طريق النزول.
  const mirrorMove = await postedTransfer(db, manager, W.raw, W.raw2, TODAY, [{ item: cornB, qty: 1000 }]);
  const withMirror = (await previewRevalue(db, manager, lineB, 2400000)).value;
  t.same([withMirror.family.map((f) => [f.qty_left, f.share]), withMirror.lot_share], [[['1880.000', '18800.00'], ['1000.000', '10000.00']], '28800.00'], 'الحصص على الجذر والمرآة: 18,800.00 و10,000.00');
  const rev2 = await postRevalue(db, manager, lineB, 2400000);
  const mirrorAfter = (await lots(cornB, W.raw2))[0];
  t.same([rev2.ok, mirrorAfter.slice(0, 2)], [true, ['1000', '490833.33']], 'المرآة: 480,833.33 + 10,000.00');
  const rev3 = await postRevalue(db, manager, lineB, 2300000);
  t.same(
    [rev3.ok && rev3.value.diff, rev3.ok && rev3.value.lot_share, rev3.ok && rev3.value.expense_amount, (await lots(cornB))[0].slice(0, 2), (await lots(cornB, W.raw2))[0].slice(0, 2)],
    ['-100000', '-57600.00', '-42400.00', ['1880', '885166.67'], ['1000', '470833.33']],
    'سعر أوطأ (−100,000 عن التصحيح الحالي): حصّة −57,600.00 (−37,600 و−20,000)، ومصروف −42,400.00',
  );
  const newer = await voidRevalue(db, manager, rev2.value.id);
  t.eq(newer.code, 'newer_revaluation', 'إلغاء تصحيح قبل الأحدث: newer_revaluation');
  t.same([shown(await voidRevalue(db, manager, rev3.value.id)), shown(await voidRevalue(db, manager, rev2.value.id))], ['ok', 'ok'], 'الأحدث أوّلاً ثم الأقدم');
  t.same([(await lots(cornB))[0].slice(0, 2), (await lots(cornB, W.raw2))[0].slice(0, 2), BigInt(await balance(db, grain, book)) - bookB], [['1880', '903966.67'], ['1000', '480833.33'], 0n], 'بعد الإلغاءين: الجذر (903,966.67 بعد تحويل 480,833.33) والمرآة كما كانا بالفلس');
  // void_receipt يسمّي التصحيح المرحَّل.
  const rev4 = await postRevalue(db, manager, lineB, 2360000);
  const named = await voidReceipt(db, manager, rB.id);
  t.same([named.code, named.hint?.includes('ذرة التصحيح')], ['has_revaluation', true], 'void_receipt يرفض has_revaluation ويسمّي المادّة');
  t.eq(shown(await voidRevalue(db, manager, rev4.value.id)), 'ok', 'إلغاء التصحيح الرابع');
  t.same([shown(await voidTransfer(db, manager, mirrorMove.id)), shown(await voidUse(db, manager, use1.id)), shown(await voidReceipt(db, manager, rB.id))], ['ok', 'ok', 'ok'],
    'السلسلة تنفكّ من آخرها: التحويل ثم الصرف ثم الاستلام');
  await verifyAll('بعد سلسلة التصحيح');

  // العائلة كلها انسحبت (فحص الخصائص v5): حصّة صفر والفرق كلّه «فرق سعر شراء» (كان يرمي mul_div_domain).
  const cornE = await rawItem('ذرة انصرفت كلها');
  const rE = await postedReceipt(db, { keeper, pricer, wh: W.raw, party: grain, on: TODAY, lines: [{ item: cornE, qty: 100 }], totals: [50000] });
  await postedUse(db, manager, { wh: W.raw, category, on: TODAY, item: cornE, qty: 100 });
  const emptied = await postRevalue(db, manager, rE.lines[0], 56000);
  t.same([emptied.ok && emptied.value.lot_share, emptied.ok && emptied.value.expense_amount, emptied.ok && (await expenses('receipt_revalue', emptied.value.id))],
    ['0', '6000', ['6000']], 'عائلة انسحبت كلها: حصّة 0 والفرق 6,000 كلّه «فرق سعر شراء»');
  // ── E51: خصم الرأس ما ينعاد توزيعه؛ التصحيح يحرّك عائلة سطره بس، وقيد المورّد −الفرق بالضبط؛ والقيمة السالبة ترفض ─────────────
  const cornX = await rawItem('ذرة الخصم');
  const cornY = await rawItem('ذرة الخصم الثانية');
  const rX = await postedReceipt(db, { keeper, pricer, wh: W.raw, party: grain, on: TODAY, lines: [{ item: cornX, qty: 1000 }, { item: cornY, qty: 1000 }], totals: [100000, 100000], discount: 20000 });
  await postedUse(db, manager, { wh: W.raw, category, on: TODAY, item: cornX, qty: 500 });
  const shares = async () => (await db.admin('select trim_scale(discount_share)::text as d from public.receipt_line_amounts where doc_id = $1 order by line_id', [rX.id])).rows.map((r) => r.d);
  const sharesBefore = await shares();
  const bookX = BigInt(await balance(db, grain, book));
  const revX = await postRevalue(db, manager, rX.lines[0], 120000);
  t.same(
    [revX.ok && revX.value.lot_share, (await lots(cornX))[0].slice(0, 2), (await lots(cornY))[0], await shares(), BigInt(await balance(db, grain, book)) - bookX],
    ['10000.00', ['500', '55000'], ['1000', '90000', '1000', '90000'], sharesBefore, -20000n],
    'E51: حصّة 10,000 على عائلة السطر بس، والسطر الثاني وحصص الخصم كما هي، والمورّد −20,000 بالضبط',
  );
  const negative = await postRevalue(db, manager, rX.lines[0], 1000);
  t.same([negative.code, (await previewRevalue(db, manager, rX.lines[0], 1000)).value.problems.map((p) => p.code)], ['negative_value', ['negative_value']], 'حصّة تجعل المتبقّي سالباً: negative_value بالمعاينة والترحيل');

  // ── السباقات والمراجع (§2.3، D6) ─────────────────────────────────────────────────────────────────────────────────
  // C12: تصحيح بفرق نازل كبير يسابق سحباً من نفس الدفعة: ما تصير قيمة سالبة أبداً (التصحيح يقرا الدفعة بعد قفلها).
  const cornR = await rawItem('ذرة السباق');
  const rR = await postedReceipt(db, { keeper, pricer, wh: W.raw, party: grain, on: TODAY, lines: [{ item: cornR, qty: 1000 }], totals: [100000], discount: 0 });
  await postedUse(db, manager, { wh: W.raw, category, on: TODAY, item: cornR, qty: 100 });
  const raceUse = await db.asUser(manager, async (q) => {
    const docId = (await q('insert into public.stock_uses (warehouse_id, category_id, used_on) values ($1, $2, $3) returning id', [W.raw, category, TODAY])).rows[0].id;
    await q('insert into public.stock_use_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 899)', [docId, cornR]);
    return docId;
  }, { commit: true });
  const raced = await race(
    db,
    { user: manager, sql: "select public.post_stock_use($1, (select version from public.stock_uses where id = $1), public.preview_stock_use($1) ->> 'plan', gen_random_uuid())", params: [raceUse] },
    { user: manager, sql: "select public.post_receipt_revalue($1, 0, public.preview_receipt_revalue($1, 0) ->> 'plan', 'سعر خاطئ', gen_random_uuid())", params: [rR.lines[0]] },
  );
  const minLeft = (await db.admin('select min(value_left)::text as v from public.stock_lots where item_id = $1', [cornR])).rows[0].v;
  t.same([raced.first, raced.state, raced.second, Number(minLeft) >= 0], ['ok', 'blocked', 'stale_preview', true], 'C12: التصحيح انتظر السحب، وقسمته اللي انحسبت قبله ما تنرحّل (stale_preview)، وماكو قيمة سالبة');
  await verifyAll('بعد السباق');
  // نفس المرجع من جلستين: ترحيل واحد للمرتجع، وتصحيح واحد.
  const cornS = await rawItem('ذرة المرجع');
  const rS = await postedReceipt(db, { keeper, pricer, wh: W.raw, party: grain, on: TODAY, lines: [{ item: cornS, qty: 1000 }], totals: [100000] });
  await sameRefRace(t, db, {
    name: 'المرتجع',
    user: pricer,
    draft: async () => {
      const doc = await returnDraft(db, keeper, { receipt: rS.id, on: TODAY, lines: [{ receiptLine: rS.lines[0], qty: 10 }] });
      return { id: doc.id, version: await creditReturn(db, pricer, doc, [900]) };
    },
    post: (docId, version, ref) => ({ sql: "select public.post_supplier_return($1, $2, public.preview_supplier_return($1) ->> 'plan', $3) as result", params: [docId, version, ref] }),
    postings: async (docId) => (await db.admin("select count(*)::int as count, count(distinct doc_no)::int as numbers from public.supplier_returns where id = $1 and status = 'posted'", [docId])).rows[0],
  });
  const sameRef = uid();
  await postedUse(db, manager, { wh: W.raw, category, on: TODAY, item: cornS, qty: 50 });
  const samePlan = (await previewRevalue(db, manager, rS.lines[0], 110000)).value.plan;
  const twice = await race(
    db,
    { user: manager, sql: "select public.post_receipt_revalue($1, 110000, $2, 'فاتورة', $3) ->> 'id' as id", params: [rS.lines[0], samePlan, sameRef] },
    { user: manager, sql: "select public.post_receipt_revalue($1, 110000, $2, 'فاتورة', $3) ->> 'id' as id", params: [rS.lines[0], samePlan, sameRef] },
  );
  const corrections = (await db.admin('select count(*)::int as n from public.receipt_revaluations where receipt_line_id = $1', [rS.lines[0]])).rows[0].n;
  t.same([twice.first, twice.second, twice.rows[0], corrections], ['ok', 'ok', twice.rows[1], 1], 'نفس مرجع التصحيح من جلستين: تصحيح واحد ونفس النتيجة');
  // قفل المسوّدة: المرتجع المرحَّل ما يتعدّل مباشرةً (الرأس والسطر والمقبول).
  await draftWriteLock(t, db, {
    name: 'المرتجع',
    user: manager,
    draft: async () => {
      const doc = await returnDraft(db, manager, { receipt: rS.id, on: TODAY, lines: [{ receiptLine: rS.lines[0], qty: 1 }] });
      const version = await creditReturn(db, manager, doc, [90]);
      return { id: doc.id, version, lineId: doc.lines[0] };
    },
    posted: async () => {
      const doc = await postedReturn(db, { keeper: manager, pricer: manager, receipt: rS.id, on: TODAY, lines: [{ receiptLine: rS.lines[0], qty: 1 }], credits: [90] });
      return { id: doc.id, lineId: doc.lines[0] };
    },
    insertHeader: (status) => ({ sql: 'insert into public.supplier_returns (receipt_id, returned_on, status) values ($1, $2, $3)', params: [rS.id, TODAY, status] }),
    setStatus: (doc, status) => ({ sql: 'update public.supplier_returns set status = $2 where id = $1', params: [doc.id, status] }),
    editLine: (doc) => ({ sql: 'update public.supplier_return_lines set qty_base = qty_base + 1 where id = $1', params: [doc.lineId] }),
    editAmount: (doc) => ({ sql: 'update public.supplier_return_line_amounts set credit_amount = credit_amount + 1 where line_id = $1', params: [doc.lineId] }),
  });

  // ── مراجعة WP7 (#4): الترحيل ببصمة المعاينة: تصحيح سعر أو سحب بعد المعاينة يغيّر قيمة المُرجَع ← stale_preview، والجديدة تنرحّل ──
  const cornF = await rawItem('ذرة بصمة المرتجع');
  const rF = await postedReceipt(db, { keeper, pricer, wh: W.raw, party: grain, on: TODAY, lines: [{ item: cornF, qty: 1000 }], totals: [100000] });
  await postedUse(db, manager, { wh: W.raw, category, on: TODAY, item: cornF, qty: 500 });
  const retF = await returnDraft(db, keeper, { receipt: rF.id, on: TODAY, lines: [{ receiptLine: rF.lines[0], qty: 100 }] });
  const versionF = await creditReturn(db, pricer, retF, [9000]);
  const seenF = (await previewReturn(db, pricer, retF.id)).value;
  t.same(await postRevalue(db, manager, rF.lines[0], 150000).then(shown), 'ok', 'تصحيح سعر على الدفعة بعد معاينة المرتجع');
  const staleF = await postReturn(db, pricer, retF.id, versionF, uid(), seenF.plan);
  const freshF = (await previewReturn(db, pricer, retF.id)).value;
  const postedF = await postReturn(db, pricer, retF.id, versionF, uid(), freshF.plan);
  t.same(
    [seenF.money.lines[0].value, shown(staleF), freshF.money.lines[0].value, shown(postedF), postedF.value?.money?.value_total, await expenses('supplier_return', retF.id)],
    ['10000.00', 'stale_preview', '15000.00', 'ok', '15000.00', ['6000']],
    '#4: المعاينة 10,000.00 والتصحيح بعدها ← stale_preview، والمعاينة الجديدة 15,000.00 تنرحّل و«فرق مرتجع» 6,000 اللي انشاف',
  );

  // ── مراجعة WP7 (عالية 1): تسوية التصحيح ما تُلغى من الكشف (كانت تعلّق التصحيح والاستلام للأبد)؛ ودفع الاستلام يبقى يُلغى لحاله (E44) ──
  const revEntry = (await db.admin("select id from public.party_entries where kind = 'adjustment' and doc_kind = 'receipt_revalue' and doc_id = (select id from public.receipt_revaluations where receipt_line_id = $1 and status = 'posted')", [rF.lines[0]])).rows[0].id;
  const fromStatement = await call(db, manager, 'select public.void_party_entry($1, $2, $3)', [revEntry, 'إلغاء من الكشف', uid()]);
  t.same([shown(fromStatement), fromStatement.hint?.includes('تصحيح سعر PU-')], ['entry_not_voidable', true], 'عالية 1: تسوية التصحيح تُلغى من مستندها بس، والرفض يسمّيه');

  // ── مراجعة WP7 (متوسّطة 2): مرآة عليها حصّة تصحيح: إلغاء التحويل يسمّي التصحيح (كان قيد value_left بلا تلميح)، وبعد إلغائه يمرّ ────
  const cornM = await rawItem('ذرة المرآة المصحّحة');
  const rM = await postedReceipt(db, { keeper, pricer, wh: W.raw, party: grain, on: TODAY, lines: [{ item: cornM, qty: 1000 }], totals: [100000] });
  await postedUse(db, manager, { wh: W.raw, category, on: TODAY, item: cornM, qty: 400 });
  const movedM = await postedTransfer(db, manager, W.raw, W.raw2, TODAY, [{ item: cornM, qty: 300 }]);
  const revM = await postRevalue(db, manager, rM.lines[0], 110000);
  const blockedM = await voidTransfer(db, manager, movedM.id);
  t.same(
    [shown(blockedM), blockedM.hint?.includes('تصحيح سعر PU-'), shown(await voidRevalue(db, manager, revM.value.id)), shown(await voidTransfer(db, manager, movedM.id))],
    ['lot_consumed', true, 'ok', 'ok'],
    'متوسّطة 2: إلغاء التحويل يسمّي تصحيح المرآة، وبعد إلغاء التصحيح يمرّ',
  );

  // ── مراجعة WP7 (متوسّطة 3): نطاق الدفتر (E49) بالدوالّ الأربع وقبل توابع إلغاء الاستلام: مدير بمخزن الأدوية بس وبلا دفترها ──────────
  const scoped = U.scopedManager;
  const rMed = await postedReceipt(db, { keeper: U.owner, pricer: U.owner, wh: W.medicine, party: grain, on: TODAY, lines: [{ item: S.I.vaccine, qty: 10, expiry: '2027-06-30' }], totals: [50000] });
  await postedUse(db, U.owner, { wh: W.medicine, category, on: TODAY, item: S.I.vaccine, qty: 4 });
  const retMed = await returnDraft(db, U.owner, { receipt: rMed.id, on: TODAY, lines: [{ receiptLine: rMed.lines[0], qty: 2 }] });
  const versionMed = await creditReturn(db, U.owner, retMed, [9000]);
  const scopedPost = await postReturn(db, scoped, retMed.id, versionMed);
  t.same(shown(await postReturn(db, U.owner, retMed.id, versionMed)), 'ok', 'المالك يرحّل مرتجع الأدوية');
  const scopedRevalue = await postRevalue(db, scoped, rMed.lines[0], 60000);
  const revMed = await postRevalue(db, U.owner, rMed.lines[0], 60000);
  t.same(
    [shown(scopedPost), shown(await voidReturn(db, scoped, retMed.id)), shown(scopedRevalue), shown(revMed), shown(await voidRevalue(db, scoped, revMed.value.id)), shown(await voidReceipt(db, scoped, rMed.id))],
    ['out_of_scope', 'out_of_scope', 'out_of_scope', 'ok', 'out_of_scope', 'out_of_scope'],
    'متوسّطة 3: ترحيل المرتجع وإلغاؤه والتصحيح وإلغاؤه وإلغاء الاستلام خارج نطاق الدفتر out_of_scope (مو has_supplier_returns)',
  );
  // ودفعة مرآة بمخزن خارج النطاق: التصحيح يرفض ومعاينته بلا قيمها.
  const cornO = await rawItem('ذرة مرآة خارج النطاق');
  const rO = await postedReceipt(db, { keeper, pricer, wh: W.raw, party: grain, on: TODAY, lines: [{ item: cornO, qty: 100 }], totals: [10000] });
  await postedTransfer(db, manager, W.raw, W.raw2, TODAY, [{ item: cornO, qty: 50 }]);
  await S.one(U.owner, "select public.set_member_scopes_v2($1, '{}', '{}', $2::uuid[])", [S.members.scopedManager, [W.medicine, W.raw]]);
  const outPreview = (await previewRevalue(db, scoped, rO.lines[0], 12000)).value;
  t.same([outPreview?.problems?.[0]?.code, outPreview?.family ?? null, outPreview?.ready], ['out_of_scope', null, false], 'متوسّطة 3: دفعة مرآة خارج النطاق ← out_of_scope ومعاينة بلا عائلة');
  await S.one(U.owner, "select public.set_member_scopes_v2($1, '{}', '{}', array[$2]::uuid[])", [S.members.scopedManager, W.medicine]);

  // ── مراجعة WP7 (متوسّطة 5): التحويل العكسي ينشئ مرآة ولا يعيد الجذر؛ التلميح يقول ألغِ التحويل (كان «أعِد المحوَّل») ─────────────
  const cornBack = await rawItem('ذرة ذهاب وإياب');
  const rBack = await postedReceipt(db, { keeper, pricer, wh: W.raw, party: grain, on: TODAY, lines: [{ item: cornBack, qty: 100 }], totals: [10000] });
  await postedTransfer(db, manager, W.raw, W.raw2, TODAY, [{ item: cornBack, qty: 100 }]);
  await postedTransfer(db, manager, W.raw2, W.raw, TODAY, [{ item: cornBack, qty: 100 }]);
  const retBack = await returnDraft(db, keeper, { receipt: rBack.id, on: TODAY, lines: [{ receiptLine: rBack.lines[0], qty: 10 }] });
  const shortBack = (await previewReturn(db, pricer, retBack.id)).value.lines[0].problem;
  t.same([shortBack?.code, shortBack?.hint?.includes('بإلغاء تحويله'), shortBack?.hint?.includes('أعِد المحوَّل')], ['insufficient_stock', true, false], 'متوسّطة 5: النقص بعد تحويل عكسي يقول ألغِ التحويل');

  // ── مراجعة WP7 (واطئة 6): مورّد مؤرشف: معاينة التصحيح تقول party_archived بدل «جاهز» والترحيل يرفض ─────────────────────────────
  const box = await S.one(U.accountant, "insert into public.cash_accounts (name, kind) values ('صندوق المرتجع', 'cash') returning id");
  const gone = await party('مورّد يتؤرشف');
  const cornG = await rawItem('ذرة مورّد مؤرشف');
  const rG = await postedReceipt(db, { keeper, pricer, wh: W.raw, party: gone, on: TODAY, lines: [{ item: cornG, qty: 1000 }], totals: [100000], paid: 100000, box });
  await postedUse(db, manager, { wh: W.raw, category, on: TODAY, item: cornG, qty: 400 });
  await S.one(U.accountant, 'update public.parties set archived_at = now() where id = $1 returning id', [gone]);
  const archivedPreview = (await previewRevalue(db, manager, rG.lines[0], 90000)).value;
  t.same([archivedPreview.problems.map((x) => x.code), archivedPreview.ready, shown(await postRevalue(db, manager, rG.lines[0], 90000))], [['party_archived'], false, 'party_archived'], 'واطئة 6: المعاينة تسمّي المورّد المؤرشف، والترحيل يرفض نفس الرمز');

  // ── مراجعة WP7 (واطئة 7): رأس التصحيح وسطره من نفس الاستلام بالمفتاح، ورقم RT بسنة تاريخه بـverify_ledger ─────────────────────────
  const anyRevaluation = (await db.admin("select id from public.receipt_revaluations where receipt_line_id = $1 order by rev_no limit 1", [rF.lines[0]])).rows[0].id;
  const rehomed = await db.asOwner(async (q) => {
    await q('alter table public.receipt_revaluations disable trigger user');
    return q('update public.receipt_revaluations set receipt_id = $2 where id = $1', [anyRevaluation, rM.id]).then(() => 'ok', (error) => error.code);
  }, U.owner);
  const misnumbered = await db.asOwner(async (q) => {
    await q('alter table public.supplier_returns disable trigger user');
    await q("update public.supplier_returns set returned_on = '2025-12-31' where id = $1", [retF.id]);
    return (await verifyLedger(q)).doc_numbers;
  }, U.owner);
  t.same([rehomed, misnumbered], ['23503', 1], 'واطئة 7: تصحيح على سطر من استلام آخر يرفضه المفتاح، ومرتجع رقمه RT بسنة غير سنة تاريخه يعدّه doc_numbers');

  // ── مراجعة WP8 (عالية): سحب قبل تصحيح سعر حيّ ما يُعكس قبل إلغاء التصحيح (كان يرجّع البضاعة بقيمة ما قبله: 5,000 كغم بـ2,900,000
  //    والمصحَّح 3,000,000)، والسحب بعده يُعكس؛ والمرتجع الكامل قبل التصحيح نفس الشي ───────────────────────────────────────────
  const cornDrawn = await rawItem('ذرة سحب قبل التصحيح');
  const rDrawn = await postedReceipt(db, { keeper, pricer, wh: W.raw, party: grain, on: TODAY, lines: [{ item: cornDrawn, qty: 5000 }], totals: [2500000] });
  const useBeforeRevalue = await postedUse(db, manager, { wh: W.raw, category, on: TODAY, item: cornDrawn, qty: 1000 });
  const revAfterUse = await postRevalue(db, manager, rDrawn.lines[0], 3000000);
  const useAfterRevalue = await postedUse(db, manager, { wh: W.raw, category, on: TODAY, item: cornDrawn, qty: 500 });
  const blockedEarlyUse = await voidUse(db, manager, useBeforeRevalue.id);
  t.same(
    [shown(revAfterUse), shown(blockedEarlyUse), blockedEarlyUse.hint?.includes('تصحيح سعر PU-'), shown(await voidUse(db, manager, useAfterRevalue.id))],
    ['ok', 'lot_consumed', true, 'ok'],
    'عالية (WP8): الصرف قبل التصحيح ما يُلغى قبله ويسمّيه، والصرف بعده يُلغى',
  );
  t.same(
    [shown(await voidRevalue(db, manager, revAfterUse.value.id)), shown(await voidUse(db, manager, useBeforeRevalue.id)), (await lots(cornDrawn))[0]],
    ['ok', 'ok', ['5000', '2500000', '5000', '2500000']],
    'عالية (WP8): بعد إلغاء التصحيح يُلغى الصرف، والدفعة كما استُلمت بالفلس',
  );
  const cornReturned = await rawItem('ذرة مرتجع ثم تصحيح');
  const rReturned = await postedReceipt(db, { keeper, pricer, wh: W.raw, party: grain, on: TODAY, lines: [{ item: cornReturned, qty: 1000 }], totals: [100000] });
  const retWhole = await postedReturn(db, { keeper, pricer, receipt: rReturned.id, on: TODAY, lines: [{ receiptLine: rReturned.lines[0], qty: 1000 }], credits: [100000] });
  const revAfterReturn = await postRevalue(db, manager, rReturned.lines[0], 120000);
  const blockedWholeReturn = await voidReturn(db, manager, retWhole.id);
  t.same(
    [shown(revAfterReturn), shown(blockedWholeReturn), blockedWholeReturn.hint?.includes('تصحيح سعر PU-'), shown(await voidRevalue(db, manager, revAfterReturn.value.id)), shown(await voidReturn(db, manager, retWhole.id))],
    ['ok', 'lot_consumed', true, 'ok', 'ok'],
    'عالية (WP8): المرتجع الكامل قبل التصحيح ما يُلغى قبله (كان يرجّع 1,000 كغم بالسعر القديم والفرق كلّه مصروف)، وبعد إلغائه يُلغى',
  );

  // ── مراجعة WP8 (متوسّطة): إلغاء التصحيح بنطاق كل مخازن عائلته: مدير بوحدة العامّة ما يلغي حصّة مرآة بمخزن حقل (كان يمرّ) ─────────
  const fuelField = await S.one(U.owner, "insert into public.items (name, kind, base_unit) values ('كاز تصحيح الحقل', 'fuel', 'L') returning id");
  const rFuelField = await postedReceipt(db, { keeper, pricer, wh: W.general, party: grain, on: TODAY, lines: [{ item: fuelField, qty: 1000 }], totals: [1000000] });
  await postedTransfer(db, manager, W.general, W.farm1, TODAY, [{ item: fuelField, qty: 400 }]);
  await postedUse(db, manager, { wh: W.general, category, on: TODAY, item: fuelField, qty: 100 });
  const revFuelField = await postRevalue(db, U.owner, rFuelField.lines[0], 1200000);
  await S.one(U.owner, "select public.set_member_scopes_v2($1, array[$2]::uuid[], '{}', '{}')", [S.members.scopedManager, D.general]);
  const divisionScopedVoid = await voidRevalue(db, U.scopedManager, revFuelField.value.id);
  await S.one(U.owner, "select public.set_member_scopes_v2($1, '{}', '{}', array[$2]::uuid[])", [S.members.scopedManager, W.medicine]);
  t.same(
    [shown(revFuelField), shown(divisionScopedVoid), divisionScopedVoid.hint?.includes('مخزن حقل 1'), shown(await voidRevalue(db, U.owner, revFuelField.value.id))],
    ['ok', 'out_of_scope', true, 'ok'],
    'متوسّطة (WP8): مدير بوحدة ما يلغي تصحيحاً مسّ مرآة بمخزن وحدة ثانية، والمالك يلغيه',
  );

  // ── مراجعة WP8 (واطئة): الإلغاء من الكشف خارج نطاق الدفتر out_of_scope قبل ما يسمّي نوع القيد ────────────────────────────────
  const purchaseEntryF = (await db.admin("select id from public.party_entries where kind = 'purchase' and doc_kind = 'receipt' and doc_id = $1", [rF.id])).rows[0].id;
  t.same(
    [shown(await call(db, U.scopedManager, 'select public.void_party_entry($1, $2, $3)', [revEntry, 'خارج النطاق', uid()])), shown(await call(db, U.scopedManager, 'select public.void_party_payment($1, $2, $3)', [purchaseEntryF, 'خارج النطاق', uid()]))],
    ['out_of_scope', 'out_of_scope'],
    'واطئة (WP8): قيد بدفتر خارج النطاق يُرفض out_of_scope (كان entry_not_voidable وnot_a_payment يكشفان نوعه)',
  );
  await verifyAll('نهاية الحزمة');
}
