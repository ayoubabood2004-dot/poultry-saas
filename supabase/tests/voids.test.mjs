// خيارات الإلغاء (0011، قرارات المالك 2026-10-31): بطاقة المادّة بلا تصحيح السعر لغير أدوار الكلفة، والإلغاء بعد جرد معتمد
// (count_superseded يسمّي الجرد CT والمادّة والمخزن، لكل دالّة إلغاء والتحويل بطرفيه، والتصحيح بكمية صفر ما يتأثّر)، والنسخة للتصحيح
// من مستند ملغى للأنواع الستّة (الحقول حقلاً حقلاً، والمبالغ لأدوار الكلفة بس، وskipped، والإعادة بنفس المعرّف والمرجع، والصلاحية
// والنطاق، والأصل غير الملغى). الأرقام باليد: كاز بـ750 للتر (10 لترات بـ7,500)، وتصحيح 75,000 ← 80,000 بعد صرف 20 من 100 لتر ←
// حصّة 4,000.00 (80 × 5,000 ÷ 100)، ونسخة الاستلام بخصم 5,000 على 375,000 (1,000.00 و4,000.00 بالقيمة) وتحميل 10,000 على السطر الثاني
// بس. كل نداء بدور authenticated حقيقي. والمراجعة: الورقة المحذوفة قبل حفظها ما تنسخ (R-DB-1، not_posted، ولو تغيّرت وحدة أساس
// مادّتها)، والرفض ما يسمّي جرد مخزن برّا النطاق (R-DB-2)، ورمزا المال داخل money (R-DB-3)، والاستلام المنسوخ يحمل أصله (FE-2).
import { call, canon, shown, uid } from './ledger-kit.mjs';
import { postReceipt, postedReceipt, previewReceipt, priceReceipt, receiptDraft, receiptLots, voidReceipt } from './receipt-kit.mjs';
import { creditReturn, postReturn, postRevalue, postedReturn, postedUse, returnDraft, voidReturn, voidRevalue, voidUse } from './return-kit.mjs';
import { race } from './shared.mjs';
import { lotsOf, makeStockOrg, openingDraft, postOpening, postTransfer, postedOpening, postedTransfer, transferDraft, voidOpening, voidTransfer } from './stock-kit.mjs';

const TODAY = '2026-10-30';
const GO_LIVE = '2026-10-20';
const id = (n) => `d8100000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477081100${String(n).padStart(2, '0')}`;

export default async function (t, db) {
  await oldCopy(t, db);
  await db.setToday(TODAY, () => scenario(t, db));
}

/**
 * نصف الخادم من المراجعة FE-1 (كان مدعوماً، والفحص يثبّته): استلام يوم 20/10 يُلغى يوم 30/10 (الإلغاء بأي عمر)، ونسخته بتاريخه فمراجعتها
 * date_too_old؛ وتعديل تاريخ الورقة بالكتابة المباشرة (حارس الرأس يسمحه، والشاشة صار بيها حقل) يزيله. منشأة لحالها ببادئة غير.
 */
async function oldCopy(t, db) {
  const oldId = (n) => `d8110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const oldPhone = (n) => `96477081200${String(n).padStart(2, '0')}`;
  let S;
  let receipt;
  await db.setToday('2026-10-20', async () => {
    S = await makeStockOrg(db, { name: 'مزرعة النسخة القديمة', id: oldId, phone: oldPhone, goLive: '2026-10-10' });
    const supplier = await S.one(S.users.accountant, "insert into public.parties (name, is_supplier) values ('مورّد قديم', true) returning id");
    const item = await S.one(S.users.owner, "insert into public.items (name, kind, base_unit) values ('كاز قديم', 'fuel', 'L') returning id");
    receipt = await postedReceipt(db, { keeper: S.users.storekeeper, pricer: S.users.accountant, wh: S.W.general, party: supplier, on: '2026-10-20', lines: [{ item, qty: 10 }], totals: [7500] });
  });
  await db.setToday(TODAY, async () => {
    const voided = await voidReceipt(db, S.users.manager, receipt.id);
    const newId = uid();
    const copied = await call(db, S.users.manager, 'select public.copy_doc_to_draft($1, $2, $3, $4)', ['receipt', receipt.id, newId, uid()]);
    const day = async () => (await db.admin('select received_on::text as d from public.receipts where id = $1', [newId])).rows[0]?.d ?? null;
    const tooOld = async () => {
      const preview = await previewReceipt(db, S.users.manager, newId);
      return preview.ok ? preview.value.problems.some((p) => p.code === 'date_too_old') : `refused:${preview.code}`;
    };
    const before = [voided.ok, copied.ok, await day(), await tooOld()];
    const fixed = await call(db, S.users.storekeeper, 'update public.receipts set received_on = $2 where id = $1 returning received_on::text', [newId, TODAY]);
    t.same(
      [before, fixed.ok, await day(), await tooOld()],
      [[true, true, '2026-10-20', true], true, TODAY, false],
      'FE-1 (الخادم): الإلغاء بعد 10 أيام يمرّ، والنسخة بتاريخ الأصل 20/10 ومراجعتها date_too_old؛ وتعديل تاريخ الورقة مباشرة يزيله',
    );
  });
}

/** أي مفتاح money أو قيمة بأي عمق (العقد: ولا مبلغ برّا money، والنسخة بلا money أصلاً). */
function moneyKeys(value, path = '') {
  if (Array.isArray(value)) return value.flatMap((v, i) => moneyKeys(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, v]) => [...(/^(money|value|amount|line_total|discount|paid_now|credit_amount)$/u.test(key) ? [`${path}.${key}`] : []), ...moneyKeys(v, `${path}.${key}`)]);
  }
  return [];
}

/** جواب jsonb بمفاتيح مرتّبة (jsonb يرتّبها بالطول ثم بالحروف)، فالمقارنة بالمعنى مو بترتيب الكتابة. */
const answer = (value) => (value && typeof value === 'object' ? JSON.parse(canon(value)) : value);

async function scenario(t, db) {
  const S = await makeStockOrg(db, { name: 'مزرعة الإلغاء', id, phone, goLive: GO_LIVE });
  const { users: U, W, I } = S;
  // المشاهد بنطاق المخزن العامّ (يقرأ بطاقة المادّة)، والأمين بنطاقه من makeStockOrg.
  await S.one(U.owner, "select public.set_member_scopes_v2($1, '{}', '{}', array[$2]::uuid[])", [S.members.viewer, W.general]);
  const fuel = (name) => S.one(U.owner, "insert into public.items (name, kind, base_unit) values ($1, 'fuel', 'L') returning id", [name]);
  const supplier = await S.one(U.accountant, "insert into public.parties (name, is_supplier) values ('مورّد الكاز', true) returning id");
  const carrier = await S.one(U.accountant, "insert into public.parties (name, is_supplier) values ('ناقل الكاز', true) returning id");
  const box = await S.one(U.accountant, "insert into public.cash_accounts (name, kind) values ('صندوق الإلغاء', 'cash') returning id");
  const upkeep = await S.one(U.accountant, "insert into public.expense_categories (name) values ('صيانة') returning id");
  const system = Object.fromEntries((await db.admin('select system_code, id from public.expense_categories where org_id = $1 and system_code is not null', [S.org])).rows.map((r) => [r.system_code, r.id]));
  const nameOf = async (wh) => (await db.admin('select name from public.warehouses where id = $1', [wh])).rows[0].name;
  const generalName = await nameOf(W.general);
  const general2Name = await nameOf(W.general2);
  const medicineName = await nameOf(W.medicine);
  const keeper = U.storekeeper;
  const pricer = U.accountant;
  const manager = U.manager;
  const fuelReceipt = (item, on, qty = 10, total = 7500) => postedReceipt(db, { keeper, pricer, wh: W.general, party: supplier, on, lines: [{ item, qty }], totals: [total] });
  const copy = (user, kind, docId, newId = uid(), ref = uid()) => call(db, user, 'select public.copy_doc_to_draft($1, $2, $3, $4)', [kind, docId, newId, ref]);
  /** جرد مرحَّل (المدير): lines = [{ item, counted, expired? }]، وسبب لكل فرق. يرجّع { id, docNo }. */
  const postedCount = async (wh, day, lines) => {
    const doc = await db.asUser(
      manager,
      async (q) => {
        const docId = (await q('insert into public.stock_counts (warehouse_id, counted_on) values ($1, $2) returning id', [wh, day])).rows[0].id;
        for (const line of lines) await q('insert into public.stock_count_lines (doc_id, item_id, counted_qty, counted_expired_qty) values ($1, $2, $3, $4)', [docId, line.item, line.counted, line.expired ?? null]);
        return docId;
      },
      { commit: true },
    );
    const version = async () => (await db.admin('select version from public.stock_counts where id = $1', [doc])).rows[0].version;
    const sent = await call(db, manager, 'select public.submit_count($1, $2, $3)', [doc, await version(), uid()]);
    if (!sent.ok) throw new Error(`جرد ما انسلّم: ${sent.code} ${sent.hint}`);
    await call(db, manager, "update public.stock_count_lines set reason = 'فرق الفحص', reason_diff = diff, reason_expired_diff = expired_diff where doc_id = $1 and (diff <> 0 or coalesce(expired_diff, 0) <> 0)", [doc]);
    const result = await call(db, manager, "select public.post_count($1, $2, public.preview_count($1) ->> 'plan', $3)", [doc, await version(), uid()]);
    if (!result.ok) throw new Error(`جرد ما انحفظ: ${result.code} ${result.hint}`);
    return { id: doc, docNo: result.value.doc_no };
  };
  const voidCount = (docId) => call(db, manager, 'select public.void_count($1, $2, $3)', [docId, 'جرد للفحص', uid()]);
  /** رفض count_superseded بتلميحه: [الرمز، الجرد، المادّة، المخزن، اليوم، «ألغِ الجرد أوّلاً»]. */
  const refusal = (result, docNo, item, store, day) => [
    result.code,
    result.hint?.includes(docNo),
    result.hint?.includes(`«${item}»`),
    result.hint?.includes(`«${store}»`),
    result.hint?.includes(day),
    result.hint?.includes('ألغِ الجرد أوّلاً'),
  ];
  const REFUSED = ['count_superseded', true, true, true, true, true];

  // ── بطاقة المادّة (قرار المالك 3): 100 لتر بـ75,000، صرف 20، تصحيح لـ80,000 ثم إلغاؤه، صرف 10 ─────────────────────────────
  const cardFuel = await fuel('كاز البطاقة');
  const card = await fuelReceipt(cardFuel, TODAY, 100, 75000);
  await postedUse(db, keeper, { wh: W.general, category: upkeep, on: TODAY, item: cardFuel, qty: 20 });
  const revalue = await postRevalue(db, manager, card.lines[0], 80000);
  t.same([revalue.ok, revalue.value?.lot_share, revalue.value?.expense_amount], [true, '4000.00', '1000.00'], 'تصحيح 75,000 ← 80,000 بعد صرف 20 من 100: حصّة الدفعة 4,000.00 (80 × 5,000 ÷ 100) و«فرق سعر شراء» 1,000.00');
  t.eq(shown(await voidRevalue(db, manager, revalue.value.id)), 'ok', 'التصحيح ينلغى (حركة عكسية بكمية صفر)');
  await postedUse(db, keeper, { wh: W.general, category: upkeep, on: TODAY, item: cardFuel, qty: 10 });
  const cardOf = async (user, after = null, limit = 50) => (await call(db, user, 'select public.item_moves_qty($1, $2, $3, $4)', [cardFuel, W.general, after, limit])).value;
  const rowsOf = (page) => page.rows.map((r) => [r.seq, r.doc_kind, Number(r.qty), Number(r.running)]);
  const FULL = [['1', 'receipt', 100, 100], ['2', 'stock_use', -20, 80], ['3', 'receipt_revalue', 0, 80], ['4', 'receipt_revalue', 0, 80], ['5', 'stock_use', -10, 70]];
  const PLAIN = [['1', 'receipt', 100, 100], ['2', 'stock_use', -20, 80], ['3', 'stock_use', -10, 70]];
  const cards = {};
  for (const [role, user] of Object.entries({ owner: U.owner, manager, accountant: U.accountant, storekeeper: keeper, viewer: U.viewer })) {
    const page = await cardOf(user);
    cards[role] = [rowsOf(page), page.total, page.next];
  }
  t.same(
    cards,
    { owner: [FULL, 5, null], manager: [FULL, 5, null], accountant: [FULL, 5, null], storekeeper: [PLAIN, 3, null], viewer: [PLAIN, 3, null] },
    'بطاقة المادّة: التصحيح وعكسه لأدوار الكلفة بس؛ الأمين والمشاهد 3 صفوف بترتيب 1–3 بلا فجوة، والرصيد الجاري هو هو (100، 80، 70)',
  );
  const plainLabels = (await cardOf(keeper)).rows.map((r) => r.doc);
  t.same(plainLabels.filter((label) => label.includes('تصحيح')), [], 'ولا اسم «تصحيح سعر» ببطاقة الأمين');
  const ownerLast = (await cardOf(U.owner)).rows[4];
  const keeperLast = (await cardOf(keeper)).rows[2];
  t.same([keeperLast.move_id, keeperLast.seq, ownerLast.seq], [ownerLast.move_id, '3', '5'], 'الصرف الأخير نفس الحركة: ترتيبه 3 للأمين و5 للمالك');
  const keeperPages = [await cardOf(keeper, null, 2), await cardOf(keeper, '2', 2)];
  const ownerPages = [await cardOf(U.owner, null, 2), await cardOf(U.owner, '2', 2), await cardOf(U.owner, '4', 2)];
  t.same(
    [keeperPages.map((p) => [p.rows.map((r) => r.seq), p.next, p.total]), ownerPages.map((p) => [p.rows.map((r) => r.seq), p.next, p.total])],
    [[[['1', '2'], '2', 3], [['3'], null, null]], [[['1', '2'], '2', 5], [['3', '4'], '4', null], [['5'], null, null]]],
    'الصفحات بالترتيب الظاهر: الأمين صفحتان (1–2 ثم 3)، والمالك ثلاث (1–2، 3–4، 5)، والعدد بأوّل صفحة بس',
  );

  // ── الإلغاء بعد جرد معتمد (قرار المالك 2) ───────────────────────────────────────────────────────────────────────
  // الاستلام: جرد قبل يومه (صفر = صفر، لقطته بعد الاستلام) ما يمنع، وجردان بعده يمنعان والأحدث يتسمّى أوّلاً، والمسلَّم ما يمنع.
  const fuelA = await fuel('كاز الجرد أ');
  const rA = await fuelReceipt(fuelA, '2026-10-28');
  const early = await postedCount(W.general, '2026-10-27', [{ item: fuelA, counted: 0 }]);
  const mid = await postedCount(W.general, '2026-10-29', [{ item: fuelA, counted: 10 }]);
  const late = await postedCount(W.general, TODAY, [{ item: fuelA, counted: 10 }]);
  t.same([early.docNo, mid.docNo, late.docNo], ['CT-2026-0001', 'CT-2026-0002', 'CT-2026-0003'], 'ثلاثة جرود مرحَّلة لكاز الجرد أ');
  t.same(refusal(await voidReceipt(db, manager, rA.id), late.docNo, 'كاز الجرد أ', generalName, '30/10/2026'), REFUSED, 'إلغاء الاستلام بعد جردين: count_superseded يسمّي الأحدث CT-2026-0003 والمادّة والمخزن واليوم');
  t.eq(shown(await voidCount(late.id)), 'ok', 'الجرد الأحدث ينلغى');
  t.same(refusal(await voidReceipt(db, manager, rA.id), mid.docNo, 'كاز الجرد أ', generalName, '29/10/2026'), REFUSED, 'وبعده يتسمّى CT-2026-0002 (29/10/2026)');
  t.eq(shown(await voidCount(mid.id)), 'ok', 'والثاني ينلغى');
  const pending = await db.asUser(
    keeper,
    async (q) => {
      const docId = (await q('insert into public.stock_counts (warehouse_id, counted_on) values ($1, $2) returning id', [W.general, TODAY])).rows[0].id;
      await q('insert into public.stock_count_lines (doc_id, item_id, counted_qty) values ($1, $2, 10)', [docId, fuelA]);
      await q('select public.submit_count($1, (select version from public.stock_counts where id = $1), gen_random_uuid())', [docId]);
      return (await q('select status from public.stock_counts where id = $1', [docId])).rows[0].status;
    },
    { commit: true },
  );
  t.same([pending, shown(await voidReceipt(db, manager, rA.id))], ['submitted', 'ok'], 'جرد مسلَّم (غير مرحَّل) وجرد قبل يوم الاستلام ما يمنعان: الاستلام ينلغى');

  // المرتجع: 2 لتر من 10 (1,500.00 = المقبول)، وجرد بعده.
  const fuelB = await fuel('كاز الجرد ب');
  const rB = await fuelReceipt(fuelB, '2026-10-28');
  const retB = await postedReturn(db, { keeper, pricer, receipt: rB.id, on: '2026-10-28', lines: [{ receiptLine: rB.lines[0], qty: 2 }], credits: [1500] });
  const ctB = await postedCount(W.general, TODAY, [{ item: fuelB, counted: 8 }]);
  t.same(refusal(await voidReturn(db, manager, retB.id), 'CT-2026-0004', 'كاز الجرد ب', generalName, '30/10/2026'), REFUSED, 'إلغاء المرتجع بعد جرد: count_superseded يسمّي CT-2026-0004');
  t.same([shown(await voidCount(ctB.id)), shown(await voidReturn(db, manager, retB.id))], ['ok', 'ok'], 'الجرد ينلغى ثم المرتجع');

  // التحويل بطرفيه: 4 لترات من العامّ للعامّ الثاني يوم 28؛ جرد المرسِل يوم 29 يمنع، ثم جرد المستلم يوم 30 يمنع.
  const fuelC = await fuel('كاز الجرد ج');
  await fuelReceipt(fuelC, '2026-10-27');
  const trC = await postedTransfer(db, keeper, W.general, W.general2, '2026-10-28', [{ item: fuelC, qty: 4 }]);
  const source = await postedCount(W.general, '2026-10-29', [{ item: fuelC, counted: 6 }]);
  t.same(refusal(await voidTransfer(db, manager, trC.id), 'CT-2026-0005', 'كاز الجرد ج', generalName, '29/10/2026'), REFUSED, 'إلغاء التحويل بعد جرد المرسِل: count_superseded يسمّي CT-2026-0005 والعامّ');
  t.eq(shown(await voidCount(source.id)), 'ok', 'جرد المرسِل ينلغى');
  const target = await postedCount(W.general2, TODAY, [{ item: fuelC, counted: 4 }]);
  t.same(refusal(await voidTransfer(db, manager, trC.id), 'CT-2026-0006', 'كاز الجرد ج', general2Name, '30/10/2026'), REFUSED, 'وبعد جرد المستلم: count_superseded يسمّي CT-2026-0006 والعامّ الثاني');
  t.same([shown(await voidCount(target.id)), shown(await voidTransfer(db, manager, trC.id))], ['ok', 'ok'], 'جرد المستلم ينلغى ثم التحويل');

  // الصرف: 3 لترات يوم 28 ثم جرد بنفس اليوم يقرّه (يمنع)، وصرف ثاني بنفس اليوم بعد حفظ الجرد ما أقرّه (ينلغى).
  const fuelD = await fuel('كاز الجرد د');
  await fuelReceipt(fuelD, '2026-10-27');
  const useD = await postedUse(db, keeper, { wh: W.general, category: upkeep, on: '2026-10-28', item: fuelD, qty: 3 });
  const ctD = await postedCount(W.general, '2026-10-28', [{ item: fuelD, counted: 7 }]);
  t.same(refusal(await voidUse(db, manager, useD.id), 'CT-2026-0007', 'كاز الجرد د', generalName, '28/10/2026'), REFUSED, 'إلغاء الصرف بعد جرد بيومه: count_superseded يسمّي CT-2026-0007');
  const useD2 = await postedUse(db, keeper, { wh: W.general, category: upkeep, on: '2026-10-28', item: fuelD, qty: 2 });
  t.eq(shown(await voidUse(db, manager, useD2.id)), 'ok', 'صرف بنفس اليوم انحفظ بعد الجرد ما أقرّه الجرد: ينلغى');
  t.same([shown(await voidCount(ctD.id)), shown(await voidUse(db, manager, useD.id))], ['ok', 'ok'], 'الجرد ينلغى ثم الصرف الأوّل');

  // الإتلاف: لقاح منتهٍ (6 عبوات بـ6,000 انتهت 25/10)، إتلاف عبوتين (2,000.00)، وجرد الأدوية بعده (المنتهي 4 = الدفتر).
  await postedOpening(db, manager, W.medicine, GO_LIVE, [{ item: I.vaccine, qty: 6, value: 6000, expiry: '2026-10-25' }]);
  const expiredLot = (await lotsOf(db, I.vaccine, W.medicine))[0].id;
  const destroy = await db.asUser(
    manager,
    async (q) => {
      const docId = (await q('insert into public.stock_uses (warehouse_id, category_id, used_on) values ($1, $2, $3) returning id', [W.medicine, system.expired_destroy, TODAY])).rows[0].id;
      await q('insert into public.stock_use_lines (doc_id, item_id, qty_in_unit, lot_id) values ($1, $2, 2, $3)', [docId, I.vaccine, expiredLot]);
      return docId;
    },
    { commit: true },
  );
  const destroyed = await call(db, manager, "select public.post_stock_use($1, (select version from public.stock_uses where id = $1), public.preview_stock_use($1) ->> 'plan', $2)", [destroy, uid()]);
  t.same([shown(destroyed), destroyed.value?.destroy, destroyed.value?.money?.total], ['ok', true, '2000.00'], 'إتلاف عبوتين منتهيتين: 2,000.00');
  const ctV = await postedCount(W.medicine, TODAY, [{ item: I.vaccine, counted: 0, expired: 4 }]);
  t.same(refusal(await voidUse(db, manager, destroy), 'CT-2026-0008', 'لقاح نيوكاسل', medicineName, '30/10/2026'), REFUSED, 'إلغاء الإتلاف بعد جرد الأدوية: count_superseded يسمّي CT-2026-0008');
  t.same([shown(await voidCount(ctV.id)), shown(await voidUse(db, manager, destroy))], ['ok', 'ok'], 'الجرد ينلغى ثم الإتلاف');

  // الافتتاح: 5 لترات بـ4,000 بالعامّ الثاني، وجرد يوم 29.
  const fuelE = await fuel('كاز الجرد هـ');
  const opE = await postedOpening(db, manager, W.general2, GO_LIVE, [{ item: fuelE, qty: 5, value: 4000 }]);
  const ctE = await postedCount(W.general2, '2026-10-29', [{ item: fuelE, counted: 5 }]);
  t.same(refusal(await voidOpening(db, manager, opE.id), 'CT-2026-0009', 'كاز الجرد هـ', general2Name, '29/10/2026'), REFUSED, 'إلغاء الافتتاح بعد جرد: count_superseded يسمّي CT-2026-0009');
  t.same([shown(await voidCount(ctE.id)), shown(await voidOpening(db, manager, opE.id))], ['ok', 'ok'], 'الجرد ينلغى ثم الافتتاح');

  // تصحيح السعر (كمية صفر) ما يتأثّر: 10 لترات بـ7,500، صرف 2 (1,500.00)، تصحيح لـ8,000 (حصّة 400.00)، وجرد بعده يقرّه بلقطته.
  const fuelF = await fuel('كاز الجرد و');
  const rF = await fuelReceipt(fuelF, '2026-10-28');
  await postedUse(db, keeper, { wh: W.general, category: upkeep, on: '2026-10-28', item: fuelF, qty: 2 });
  const revF = await postRevalue(db, manager, rF.lines[0], 8000);
  t.same([revF.ok, revF.value?.lot_share, revF.value?.expense_amount], [true, '400.00', '100.00'], 'تصحيح 7,500 ← 8,000 بعد صرف 2 من 10: حصّة 400.00 والباقي 100.00');
  const ctF = await postedCount(W.general, TODAY, [{ item: fuelF, counted: 8 }]);
  t.same([ctF.docNo, shown(await voidRevalue(db, manager, revF.value.id))], ['CT-2026-0010', 'ok'], 'إلغاء تصحيح السعر (كمية صفر) بعد جرد CT-2026-0010 يمرّ');

  // ── النسخة للتصحيح (قرار المالك 1) ──────────────────────────────────────────────────────────────────────────────
  // الاستلام: سطران (100 لتر بـ75,000 بدفعة مورّد LOT-7، وبرميلان 200 لتر بـ300,000)، خصم 5,000، مدفوع 50,000 من الصندوق، نقل
  // 10,000 بالقيمة على الناقل للسطر الثاني بس، وتحميل 2,000 بالوزن من الصندوق.
  const fuelR1 = await fuel('كاز النسخة');
  const fuelR2 = await fuel('زيت النسخة');
  const barrel = await S.one(U.owner, "insert into public.item_units (item_id, label, factor_to_base, for_purchase) values ($1, 'برميل 200 لتر', 200, true) returning id", [fuelR2]);
  const rDoc = await receiptDraft(db, keeper, { wh: W.general, party: supplier, on: '2026-10-29', lines: [{ item: fuelR1, qty: 100, lotNo: 'LOT-7' }, { item: fuelR2, qty: 2, unit: barrel }] });
  await S.one(keeper, "update public.receipts set note = 'فاتورة 77' where id = $1 returning id", [rDoc.id]);
  const rVersion = await priceReceipt(db, pricer, { ...rDoc }, {
    totals: [75000, 300000], discount: 5000, paid: 50000, box,
    charges: [{ label: 'نقل', amount: 10000, by: 'value', payee: carrier, lines: [1] }, { label: 'تحميل', amount: 2000, by: 'value', box }],
  });
  const rPosted = await postReceipt(db, pricer, rDoc.id, rVersion);
  t.same([shown(rPosted), rPosted.value?.doc_no], ['ok', 'PU-2026-0007'], 'الاستلام الأصل PU-2026-0007');
  t.eq(shown(await copy(manager, 'receipt', rDoc.id)), 'not_void', 'نسخة من مستند مرحَّل غير ملغى: not_void');
  t.eq(shown(await voidReceipt(db, manager, rDoc.id)), 'ok', 'الاستلام ينلغى');
  const head = async (table, docId, columns) => (await db.admin(`select ${columns} from public.${table} where id = $1`, [docId])).rows[0];
  const RECEIPT_HEAD = 'party_id, warehouse_id, book_id, received_on::text as received_on, note';
  const receiptLinesOf = async (docId) =>
    (await db.admin(
      `select item_id, item_unit_id, unit_code, unit_label, trim_scale(qty_in_unit)::text as qty_in_unit, trim_scale(factor)::text as factor,
         trim_scale(qty_base)::text as qty_base, base_unit, expiry_on::text as expiry_on, born_at, supplier_lot_no
       from public.receipt_lines where doc_id = $1 order by line_no`,
      [docId],
    )).rows;
  const receiptMoney = async (docId) => ({
    lines: (await db.admin('select l.line_no, trim_scale(a.line_total)::text as total, a.zero_reason, a.discount_share, a.charge_share from public.receipt_line_amounts a join public.receipt_lines l on l.id = a.line_id where a.doc_id = $1 order by l.line_no', [docId])).rows.map((r) => [r.line_no, r.total, r.zero_reason, r.discount_share, r.charge_share]),
    head: (await db.admin('select trim_scale(discount)::text as discount, trim_scale(paid_now)::text as paid, cash_account_id from public.receipt_amounts where doc_id = $1', [docId])).rows.map((r) => [r.discount, r.paid, r.cash_account_id]),
    charges: (await db.admin('select charge_no, label, trim_scale(amount)::text as amount, allocate_by, payee_party_id, cash_account_id, all_lines, party_entry_id from public.receipt_charges where doc_id = $1 order by charge_no', [docId])).rows.map((r) => Object.values(r)),
    picked: (await db.admin('select l.line_no from public.receipt_charge_lines s join public.receipt_lines l on l.id = s.line_id where s.doc_id = $1 order by l.line_no', [docId])).rows.map((r) => r.line_no),
  });
  const sourceLines = await receiptLinesOf(rDoc.id);
  t.same(sourceLines.map((l) => [l.unit_label, l.qty_in_unit, l.factor, l.qty_base, l.supplier_lot_no]), [['L', '100', '1', '100', 'LOT-7'], ['برميل 200 لتر', '2', '200', '400', null]], 'سطرا الأصل: 100 لتر بـLOT-7، وبرميلان = 400 لتر');
  // المدير (أدوار الكلفة): الرأس والسطور والمبالغ، بلا المدفوع وصندوقه ولا تحميل الصندوق.
  const rNew = uid();
  const rRef = uid();
  const rCopy = await copy(manager, 'receipt', rDoc.id, rNew, rRef);
  t.same(answer(rCopy.value), answer({ id: rNew, doc_kind: 'receipt', source_id: rDoc.id, status: 'draft', version: 7, lines: 2, skipped: [], money: { skipped: ['paid_now', 'box_charge'] } }),
    'نسخة المدير: ورقة بمعرّف الجهاز، نسختها 7 (رأس + سطران + مبلغاهما + الخصم + التحميل)، ورمزا المدفوع وتحميل الصندوق داخل money (R-DB-3)');
  t.same(
    [await head('receipts', rNew, RECEIPT_HEAD), await head('receipts', rNew, 'status, doc_no, posted_at, client_ref, created_by, copied_from'), await receiptLinesOf(rNew)],
    [await head('receipts', rDoc.id, RECEIPT_HEAD), { status: 'draft', doc_no: null, posted_at: null, client_ref: null, created_by: manager, copied_from: rDoc.id }, sourceLines],
    'رأس النسخة وسطورها = الأصل حقلاً حقلاً (المورّد والمخزن والدفتر والتاريخ والملاحظة؛ المادّة والوحدة والمعامل والكمية ودفعة المورّد)، وورقة غير محفوظة تحمل أصلها (copied_from، FE-2)',
  );
  t.same(
    await receiptMoney(rNew),
    { lines: [[1, '75000', null, null, null], [2, '300000', null, null, null]], head: [['5000', '0', null]], charges: [[1, 'نقل', '10000', 'value', carrier, null, false, null]], picked: [2] },
    'مبالغ النسخة: السطران 75,000 و300,000، والخصم 5,000 بلا مدفوع ولا صندوق، ونقل الناقل 10,000 للسطر الثاني بس، وبلا تحميل الصندوق',
  );
  t.same([moneyKeys(rCopy.value), rCopy.value?.money], [['.money'], { skipped: ['paid_now', 'box_charge'] }], 'جواب النسخة بلا أي مبلغ: money بيه رمزان بس');
  // أصل النسخة يكتبه الخادم بس (FE-2): الأمين ما يدخله بورقة جديدة (منحة الإدخال بلاه) ولا يغيّره بالنسخة (منحة التعديل وحارس الرأس).
  t.same(
    [
      shown(await call(db, keeper, 'insert into public.receipts (party_id, warehouse_id, received_on, copied_from) values ($1, $2, $3, $4) returning id', [supplier, W.general, TODAY, rDoc.id])),
      shown(await call(db, keeper, 'update public.receipts set copied_from = null where id = $1 returning id', [rNew])),
    ],
    ['42501:permission denied for table receipts', '42501:permission denied for table receipts'],
    'copied_from بلا منحة إدخال ولا تعديل للواجهة: الأمين ممنوع بالحالتين (42501)',
  );
  // الإعادة: نفس المرجع ونفس المعرّف ← نفس الجواب؛ نفس المعرّف بمرجع جديد ← نفس الجواب؛ ولا ورقة ثانية.
  const replay = await copy(manager, 'receipt', rDoc.id, rNew, rRef);
  const retry = await copy(manager, 'receipt', rDoc.id, rNew, uid());
  t.same([replay.value, retry.value], [rCopy.value, rCopy.value], 'نفس المرجع، ونفس معرّف الجهاز بمرجع جديد: نفس الجواب بالضبط');
  t.same(
    [(await db.admin('select count(*)::int as n from public.receipts where id = $1', [rNew])).rows[0].n, (await db.admin('select count(*)::int as n from public.receipt_lines where doc_id = $1', [rNew])).rows[0].n],
    [1, 2],
    'ولا ورقة ثانية ولا سطر ثالث',
  );
  t.same(
    [
      shown(await copy(manager, 'receipt', rDoc.id, uid(), rRef)),
      shown(await copy(manager, 'receipt', rDoc.id, rDoc.id)),
      shown(await copy(U.owner, 'receipt', rDoc.id, rNew)),
      shown(await call(db, manager, 'select public.copy_doc_to_draft($1, $2, null, $3)', ['receipt', rDoc.id, uid()])),
      shown(await call(db, manager, 'select public.copy_doc_to_draft($1, $2, $3, null)', ['receipt', rDoc.id, uid()])),
    ],
    ['ref_reused', 'id_reused', 'id_reused', 'id_required', 'ref_required'],
    'نفس المرجع بمعرّف ثاني ref_reused، ومعرّف مستند موجود id_reused، ومعرّف نسخة المدير بيد المالك id_reused، وبلا معرّف id_required، وبلا مرجع ref_required',
  );
  t.same(
    [shown(await copy(pricer, 'receipt', rDoc.id)), shown(await copy(U.viewer, 'receipt', rDoc.id)), shown(await copy(U.scopedManager, 'receipt', rDoc.id)),
      shown(await copy(manager, 'receipt', uid())), shown(await copy(manager, 'sale', rDoc.id))],
    ['forbidden', 'forbidden', 'out_of_scope', 'doc_not_found', 'doc_kind_unknown'],
    'المحاسب (بلا receipt.draft) والمشاهد forbidden، والمدير المحصور بالأدوية out_of_scope، ومستند مو موجود doc_not_found، ونوع مو معروف doc_kind_unknown',
  );
  t.ok((await copy(U.scopedManager, 'receipt', rDoc.id)).hint?.includes(`«${generalName}»`), 'رفض النطاق يسمّي المخزن (فحص الدالّة نفسها قبل حرّاس السطور)');
  // النسخة تُحفظ نهائياً برقم جديد: الصافي 370,000 للمورّد والنقل 10,000 للناقل بلا دفع، والدفعتان بالخصم بالقيمة والنقل للثاني.
  const rCopyPosted = await postReceipt(db, pricer, rNew, 7);
  t.same(
    [shown(rCopyPosted), rCopyPosted.value?.doc_no, await receiptLots(db, rNew),
      (await db.admin("select e.party_id, e.kind, trim_scale(e.amount)::text as amount from public.party_entries e where e.doc_kind = 'receipt' and e.doc_id = $1 order by e.amount", [rNew])).rows.map((r) => [r.party_id, r.kind, r.amount])],
    ['ok', 'PU-2026-0008', [['100', '74000'], ['400', '306000']], [[supplier, 'purchase', '-370000'], [carrier, 'purchase', '-10000']]],
    'النسخة PU-2026-0008: الدفعتان 74,000.00 و306,000.00 (خصم 1,000 و4,000 بالقيمة، والنقل للثاني)، والمورّد −370,000 والناقل −10,000 بلا دفع',
  );
  // الأمين (بلا كلفة) بعد ما صار البرميل 180 لتراً: كميات بس، والسطر الثاني بوحدة الأساس وبنفس الـ400 لتر.
  await S.one(U.owner, 'update public.item_units set factor_to_base = 180 where id = $1 returning id', [barrel]);
  const kNew = uid();
  const kRef = uid();
  const kCopy = await copy(keeper, 'receipt', rDoc.id, kNew, kRef);
  t.same(answer(kCopy.value), answer({ id: kNew, doc_kind: 'receipt', source_id: rDoc.id, status: 'draft', version: 3, lines: 2, skipped: ['amounts', 'unit_changed'] }),
    'نسخة الأمين: كميات بس (amounts) والبرميل تغيّر معامله (unit_changed)، ونسختها 3، وبلا رمزي المال');
  t.same(
    (await receiptLinesOf(kNew)).map((l) => [l.item_unit_id, l.unit_code, l.unit_label, l.qty_in_unit, l.factor, l.qty_base, l.supplier_lot_no]),
    [[null, null, 'L', '100', '1', '100', 'LOT-7'], [null, null, 'L', '400', '1', '400', null]],
    'السطر الثاني بوحدة الأساس بنفس الكمية (400 لتر)، والأوّل كما هو',
  );
  t.same([await receiptMoney(kNew), moneyKeys(kCopy.value)], [{ lines: [], head: [], charges: [], picked: [] }, []], 'نسخة الأمين بلا أي صفّ مبلغ ولا خصم ولا تحميل، وجوابها بلا مبلغ');
  t.same((await copy(keeper, 'receipt', rDoc.id, kNew, kRef)).value, kCopy.value, 'إعادة الأمين بنفس المرجع نفس جوابه المخفي');

  // المرتجع: 3 لترات من 10 بمقبول 2,000.
  const fuelS = await fuel('كاز مرتجع النسخة');
  const rS = await fuelReceipt(fuelS, '2026-10-29');
  const retS = await returnDraft(db, keeper, { receipt: rS.id, on: '2026-10-29', lines: [{ receiptLine: rS.lines[0], qty: 3 }] });
  await S.one(keeper, "update public.supplier_returns set note = 'مرتجع تالف' where id = $1 returning id", [retS.id]);
  const retSVersion = await creditReturn(db, pricer, retS, [2000]);
  t.same([shown(await postReturn(db, pricer, retS.id, retSVersion)), shown(await voidReturn(db, manager, retS.id))], ['ok', 'ok'], 'المرتجع (3 لترات بـ2,250.00 ومقبول 2,000) يُحفظ نهائياً ثم ينلغى');
  const RETURN_HEAD = 'receipt_id, party_id, warehouse_id, book_id, returned_on::text as returned_on, note';
  const returnLinesOf = async (docId) => (await db.admin('select line_no, receipt_line_id, item_id, lot_id, trim_scale(qty_base)::text as qty_base from public.supplier_return_lines where doc_id = $1 order by line_no', [docId])).rows;
  const creditsOf = async (docId) => (await db.admin('select trim_scale(credit_amount)::text as credit from public.supplier_return_line_amounts where doc_id = $1', [docId])).rows.map((r) => r.credit);
  const sNew = uid();
  const sCopy = await copy(manager, 'supplier_return', retS.id, sNew);
  t.same(
    [answer(sCopy.value), await head('supplier_returns', sNew, RETURN_HEAD), await returnLinesOf(sNew), await creditsOf(sNew)],
    [answer({ id: sNew, doc_kind: 'supplier_return', source_id: retS.id, status: 'draft', version: 3, lines: 1, skipped: [], money: { skipped: [] } }), await head('supplier_returns', retS.id, RETURN_HEAD), await returnLinesOf(retS.id), ['2000']],
    'نسخة المرتجع للمدير: الاستلام والمورّد والمخزن والدفتر والتاريخ والملاحظة، وسطر الاستلام ودفعته والكمية 3، والمقبول 2,000',
  );
  const sKeeper = await copy(keeper, 'supplier_return', retS.id);
  t.same([sKeeper.value?.skipped, sKeeper.value?.version, await creditsOf(sKeeper.value?.id), moneyKeys(sKeeper.value)], [['amounts'], 2, [], []], 'نسخة الأمين: الكمية بلا المقبول (amounts)');
  t.same([shown(await voidReceipt(db, manager, rS.id)), shown(await copy(keeper, 'supplier_return', retS.id))], ['ok', 'receipt_not_posted'], 'بعد إلغاء الاستلام: نسخة مرتجعه receipt_not_posted');

  // التحويل: 3 جركنات 20 لتراً (60) و500 مل (0.5 لتر) من العامّ للعامّ الثاني.
  const fuelT = await fuel('كاز تحويل النسخة');
  const jerryT = await S.one(U.owner, "insert into public.item_units (item_id, label, factor_to_base) values ($1, 'جركن 20 لتر', 20) returning id", [fuelT]);
  await fuelReceipt(fuelT, '2026-10-27', 100, 75000);
  const trT = await transferDraft(db, keeper, W.general, W.general2, '2026-10-29', [{ item: fuelT, qty: 3, unit: jerryT }, { item: fuelT, qty: 500, code: 'mL' }]);
  await S.one(keeper, "update public.transfers set note = 'نقل للعامّ الثاني' where id = $1 returning id", [trT.id]);
  trT.version = (await db.admin('select version from public.transfers where id = $1', [trT.id])).rows[0].version;
  t.same([shown(await postTransfer(db, keeper, trT)), shown(await voidTransfer(db, manager, trT.id))], ['ok', 'ok'], 'التحويل يُحفظ نهائياً ثم ينلغى');
  const TRANSFER_HEAD = 'from_warehouse_id, to_warehouse_id, moved_on::text as moved_on, note';
  const unitLinesOf = async (table, docId, extra = '') =>
    (await db.admin(`select item_id, item_unit_id, unit_code, unit_label, trim_scale(qty_in_unit)::text as qty_in_unit, trim_scale(factor)::text as factor, trim_scale(qty_base)::text as qty_base${extra} from public.${table} where doc_id = $1 order by line_no`, [docId])).rows;
  const tNew = uid();
  const tCopy = await copy(keeper, 'transfer', trT.id, tNew);
  t.same(
    [answer(tCopy.value), await head('transfers', tNew, TRANSFER_HEAD), await unitLinesOf('transfer_lines', tNew)],
    [
      answer({ id: tNew, doc_kind: 'transfer', source_id: trT.id, status: 'draft', version: 3, lines: 2, skipped: [] }),
      await head('transfers', trT.id, TRANSFER_HEAD),
      [
        { item_id: fuelT, item_unit_id: jerryT, unit_code: null, unit_label: 'جركن 20 لتر', qty_in_unit: '3', factor: '20', qty_base: '60' },
        { item_id: fuelT, item_unit_id: null, unit_code: 'mL', unit_label: 'mL', qty_in_unit: '500', factor: '0.001', qty_base: '0.5' },
      ],
    ],
    'نسخة التحويل للأمين: المخزنان والتاريخ والملاحظة، والجركن 3 × 20 = 60 لتراً و500 مل = 0.5 لتر كما بالأصل',
  );
  t.same(await unitLinesOf('transfer_lines', trT.id), await unitLinesOf('transfer_lines', tNew), 'سطور النسخة = سطور الأصل حقلاً حقلاً');
  // سباق جلستين بنفس معرّف الجهاز ومرجعين: الثانية تنتظر الأولى (قفل المعرّف) ثم ترجع جوابها نفسه، وورقة وحدة (بلا القفل 23505 خام).
  const raceId = uid();
  const COPY_SQL = 'select public.copy_doc_to_draft($1, $2, $3, $4) as v';
  const raced = await race(db, { user: keeper, sql: COPY_SQL, params: ['transfer', trT.id, raceId, uid()] }, { user: keeper, sql: COPY_SQL, params: ['transfer', trT.id, raceId, uid()] });
  t.same(
    [raced.first, raced.state, raced.second, canon(raced.rows[1]?.[0]?.v), (await db.admin('select count(*)::int as n from public.transfers where id = $1', [raceId])).rows[0].n],
    ['ok', 'blocked', 'ok', canon(raced.rows[0]?.[0]?.v), 1],
    'نسختان بنفس معرّف الجهاز بنفس اللحظة: الثانية تنتظر ثم ترجع جواب الأولى، وورقة وحدة',
  );
  t.same(
    [shown(await copy(pricer, 'transfer', trT.id)), shown(await copy(U.viewer, 'transfer', trT.id)), shown(await copy(U.scopedManager, 'transfer', trT.id)),
      shown(await copy(keeper, 'receipt', trT.id))],
    ['forbidden', 'forbidden', 'out_of_scope', 'doc_not_found'],
    'التحويل: المحاسب والمشاهد forbidden، والمحصور بالأدوية out_of_scope (المرسِل العامّ)، ومعرّف تحويل بنوع استلام doc_not_found',
  );
  const live = await transferDraft(db, keeper, W.general, W.general2, TODAY, [{ item: fuelT, qty: 1 }]);
  t.eq(shown(await copy(keeper, 'transfer', live.id)), 'not_void', 'ورقة غير محفوظة (مسوّدة حيّة): not_void');
  const discardedCopy = async () => {
    const got = await copy(keeper, 'transfer', live.id);
    return [shown(got), got.hint?.includes('حُذفت قبل حفظها نهائياً')];
  };
  t.same([shown(await call(db, keeper, "select public.discard_draft('transfer', $1, $2)", [live.id, live.version])), await discardedCopy()], ['ok', ['not_posted', true]], 'الورقة المحذوفة قبل حفظها (void بلا حفظ نهائي) ما تنسخ: not_posted بتلميحه (R-DB-1)');
  // ورقة محذوفة بلا سطور: ماكو حارس سطر يفحص النطاق، فالدالّة نفسها ترفض المحصور برّا المخزن المرسِل (قبل not_posted).
  const empty = await transferDraft(db, keeper, W.general, W.general2, TODAY, []);
  await S.one(keeper, "select public.discard_draft('transfer', $1, $2) ->> 'status'", [empty.id, empty.version]);
  t.same([shown(await copy(U.scopedManager, 'transfer', empty.id)), shown(await copy(keeper, 'transfer', empty.id))], ['out_of_scope', 'not_posted'], 'ورقة محذوفة بلا سطور: المحصور بالأدوية out_of_scope (فحص الدالّة نفسها)، والأمين not_posted');
  // R-DB-1 بالضبط: ورقة استلام لمادّة جديدة (100 لتر) وورقة جرد (7 لترات) حُذفتا قبل حفظهما، فالمادّة بلا حركات ووحدة أساسها تتغيّر
  // (لتر ← كيلو، مسموح بلا حركات): النسخة كانت تنقل الكمية للوحدة الجديدة بصمت (100 كيلو و7 كيلو)؛ هسه not_posted ولا ورقة جديدة.
  const reunited = async (label, kind, write) => {
    const item = await fuel(label);
    const docId = await db.asUser(keeper, (q) => write(q, item), { commit: true });
    const table = kind === 'receipt' ? 'receipts' : 'stock_counts';
    await S.one(keeper, `select public.discard_draft($1, $2, (select version from public.${table} where id = $2)) ->> 'status'`, [kind, docId]);
    await S.one(U.owner, "update public.items set base_unit = 'kg' where id = $1 returning id", [item]);
    const newId = uid();
    const got = await copy(keeper, kind, docId, newId);
    return [shown(got), (await db.admin(`select count(*)::int as n from public.${table} where id = $1`, [newId])).rows[0].n];
  };
  t.same(
    [
      await reunited('كاز وحدة الاستلام', 'receipt', async (q, item) => {
        const docId = (await q('insert into public.receipts (party_id, warehouse_id, received_on) values ($1, $2, $3) returning id', [supplier, W.general, TODAY])).rows[0].id;
        await q('insert into public.receipt_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 100)', [docId, item]);
        return docId;
      }),
      await reunited('كاز وحدة الجرد', 'count', async (q, item) => {
        const docId = (await q('insert into public.stock_counts (warehouse_id, counted_on) values ($1, $2) returning id', [W.general, TODAY])).rows[0].id;
        await q('insert into public.stock_count_lines (doc_id, item_id, counted_qty) values ($1, $2, 7)', [docId, item]);
        return docId;
      }),
    ],
    [['not_posted', 0], ['not_posted', 0]],
    'R-DB-1: ورقة استلام وورقة جرد محذوفتان قبل حفظهما لمادّة تغيّرت وحدة أساسها (لتر ← كيلو): not_posted بلا ورقة، مو 100 كيلو و7 كيلو بصمت',
  );

  // الصرف: جركنان 20 لتراً (40) و5 لترات، بتصنيف «صيانة».
  const fuelU = await fuel('كاز صرف النسخة');
  const jerryU = await S.one(U.owner, "insert into public.item_units (item_id, label, factor_to_base) values ($1, 'جركن 20 لتر', 20) returning id", [fuelU]);
  await fuelReceipt(fuelU, '2026-10-27', 100, 75000);
  const use = await db.asUser(
    keeper,
    async (q) => {
      const docId = (await q("insert into public.stock_uses (warehouse_id, category_id, used_on, note) values ($1, $2, '2026-10-29', 'صيانة المولّد') returning id", [W.general, upkeep])).rows[0].id;
      await q('insert into public.stock_use_lines (doc_id, item_id, qty_in_unit, item_unit_id) values ($1, $2, 2, $3)', [docId, fuelU, jerryU]);
      await q('insert into public.stock_use_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 5)', [docId, fuelU]);
      return docId;
    },
    { commit: true },
  );
  t.eq(shown(await call(db, keeper, "select public.post_stock_use($1, (select version from public.stock_uses where id = $1), public.preview_stock_use($1) ->> 'plan', $2)", [use, uid()])), 'ok', 'الصرف يُحفظ نهائياً');
  t.eq(shown(await voidUse(db, manager, use)), 'ok', 'الصرف ينلغى');
  const USE_HEAD = 'warehouse_id, category_id, used_on::text as used_on, note';
  const uNew = uid();
  const uCopy = await copy(keeper, 'stock_use', use, uNew);
  t.same(
    [answer(uCopy.value), await head('stock_uses', uNew, USE_HEAD), await unitLinesOf('stock_use_lines', uNew, ', lot_id')],
    [
      answer({ id: uNew, doc_kind: 'stock_use', source_id: use, status: 'draft', version: 3, lines: 2, skipped: [] }),
      await head('stock_uses', use, USE_HEAD),
      await unitLinesOf('stock_use_lines', use, ', lot_id'),
    ],
    'نسخة الصرف للأمين: المخزن والتصنيف والتاريخ والملاحظة، والجركنان (40 لتراً) و5 لترات كما بالأصل',
  );
  const dCopy = await copy(manager, 'stock_use', destroy);
  t.same(
    [dCopy.value?.skipped, (await head('stock_uses', dCopy.value?.id, 'category_id')).category_id, (await unitLinesOf('stock_use_lines', dCopy.value?.id, ', lot_id')).map((l) => [l.qty_base, l.lot_id])],
    [['approval'], system.expired_destroy, [['2', expiredLot]]],
    'نسخة الإتلاف للمدير: بتصنيف الإتلاف ودفعته المنتهية، وskipped الموافقة (الحفظ النهائي يحتاج المدير من جديد)',
  );
  t.eq(shown(await copy(pricer, 'stock_use', use)), 'forbidden', 'المحاسب ما ينسخ الصرف (stock_use.post)');

  // الجرد: كاز 1 معدود 9 من 10 (نقص لتر بـ750.00 وسببه) وكاز 2 معدود 10، ثم الإلغاء.
  const fuelK1 = await fuel('كاز جرد النسخة 1');
  const fuelK2 = await fuel('كاز جرد النسخة 2');
  await postedReceipt(db, { keeper, pricer, wh: W.general, party: supplier, on: '2026-10-27', lines: [{ item: fuelK1, qty: 10 }, { item: fuelK2, qty: 10 }], totals: [7500, 7500] });
  const countDoc = await db.asUser(
    keeper,
    async (q) => {
      const docId = (await q("insert into public.stock_counts (warehouse_id, counted_on, note) values ($1, $2, 'جرد نهاية الشهر') returning id", [W.general, TODAY])).rows[0].id;
      await q('insert into public.stock_count_lines (doc_id, item_id, counted_qty) values ($1, $2, 9), ($1, $3, 10)', [docId, fuelK1, fuelK2]);
      await q('select public.submit_count($1, (select version from public.stock_counts where id = $1), gen_random_uuid())', [docId]);
      return docId;
    },
    { commit: true },
  );
  await call(db, manager, "update public.stock_count_lines set reason = 'تسرّب', reason_diff = diff, reason_expired_diff = expired_diff where doc_id = $1 and diff <> 0", [countDoc]);
  const countPosted = await call(db, manager, "select public.post_count($1, (select version from public.stock_counts where id = $1), public.preview_count($1) ->> 'plan', $2)", [countDoc, uid()]);
  t.same([shown(countPosted), countPosted.value?.doc_no, countPosted.value?.money?.shortage_total], ['ok', 'CT-2026-0011', '750.00'], 'الجرد CT-2026-0011 بنقص لتر بـ750.00');
  t.eq(shown(await voidCount(countDoc)), 'ok', 'الجرد ينلغى');
  const COUNT_HEAD = 'warehouse_id, counted_on::text as counted_on, note';
  const countLinesOf = async (docId) =>
    (await db.admin(
      `select item_id, trim_scale(counted_qty)::text as counted_qty, counted_expired_qty, gain_expiry_on, gain_expired_expiry_on, gain_born_at,
         system_qty, diff, reason, reason_diff, snapshot_seq from public.stock_count_lines where doc_id = $1 order by line_no`,
      [docId],
    )).rows;
  const cNew = uid();
  const cCopy = await copy(keeper, 'count', countDoc, cNew);
  const blank = { counted_expired_qty: null, gain_expiry_on: null, gain_expired_expiry_on: null, gain_born_at: null, system_qty: null, diff: null, reason: null, reason_diff: null, snapshot_seq: null };
  t.same(
    [answer(cCopy.value), await head('stock_counts', cNew, COUNT_HEAD), await head('stock_counts', cNew, 'status, submitted_at, doc_no'), await countLinesOf(cNew),
      (await db.admin('select count(*)::int as n from public.stock_count_line_costs where doc_id = $1', [cNew])).rows[0].n],
    [
      answer({ id: cNew, doc_kind: 'count', source_id: countDoc, status: 'draft', version: 3, lines: 2, skipped: ['approval'] }),
      await head('stock_counts', countDoc, COUNT_HEAD),
      { status: 'draft', submitted_at: null, doc_no: null },
      [{ item_id: fuelK1, counted_qty: '9', ...blank }, { item_id: fuelK2, counted_qty: '10', ...blank }],
      0,
    ],
    'نسخة الجرد للأمين: المخزن واليوم والملاحظة والمعدود (9 و10) بلا لقطة الدفتر ولا سبب المدير ولا كلفته (approval)، وورقة للعدّ',
  );
  t.same((await countLinesOf(countDoc)).map((l) => [l.item_id, l.counted_qty]), [[fuelK1, '9'], [fuelK2, '10']], 'ضابط: المعدود نفسه بالأصل');
  // موافقة الجرد: جرد محفوظ بلا فرق (CT-2026-0003 الملغى، بلا سبب ولا كلفة) approval؛ والجرد اللي ما انحفظ نهائياً ما ينسخ أبداً
  // (R-DB-1): مسلَّم بسبب المدير ثم أُغلق، ومسلَّم بكلفة زيادة ثم أُغلق، وورقة عدّ حُذفت قبل التسليم: not_posted.
  const reviewed = async (counted, review) => {
    const docId = await db.asUser(
      keeper,
      async (q) => {
        const doc = (await q('insert into public.stock_counts (warehouse_id, counted_on) values ($1, $2) returning id', [W.general, TODAY])).rows[0].id;
        await q('insert into public.stock_count_lines (doc_id, item_id, counted_qty) values ($1, $2, $3)', [doc, fuelK2, counted]);
        await q('select public.submit_count($1, (select version from public.stock_counts where id = $1), gen_random_uuid())', [doc]);
        return doc;
      },
      { commit: true },
    );
    await S.one(manager, review, [docId]);
    await S.one(manager, "select public.discard_draft('count', $1, (select version from public.stock_counts where id = $1)) ->> 'status'", [docId]);
    return docId;
  };
  const withReason = await reviewed(9, "update public.stock_count_lines set reason = 'نقص', reason_diff = diff, reason_expired_diff = expired_diff where doc_id = $1 returning id");
  const withCost = await reviewed(12, 'insert into public.stock_count_line_costs (line_id, gain_unit_cost) select id, 800 from public.stock_count_lines where doc_id = $1 returning id');
  const bareCount = await db.asUser(
    keeper,
    async (q) => {
      const doc = (await q('insert into public.stock_counts (warehouse_id, counted_on) values ($1, $2) returning id', [W.general, TODAY])).rows[0].id;
      await q('insert into public.stock_count_lines (doc_id, item_id, counted_qty) values ($1, $2, 10)', [doc, fuelK2]);
      return doc;
    },
    { commit: true },
  );
  await S.one(keeper, "select public.discard_draft('count', $1, (select version from public.stock_counts where id = $1)) ->> 'status'", [bareCount]);
  t.same(
    [(await copy(keeper, 'count', late.id)).value?.skipped, shown(await copy(keeper, 'count', withReason)), shown(await copy(keeper, 'count', withCost)),
      shown(await copy(keeper, 'count', bareCount))],
    [['approval'], 'not_posted', 'not_posted', 'not_posted'],
    'approval لجرد محفوظ بلا فرق؛ والمسلَّم بسبب المدير أو بكلفة زيادة ثم المُغلق، وورقة العدّ المحذوفة: not_posted (ما انحفظت نهائياً)',
  );

  // الافتتاح: 20 لتراً بـ15,000، و5 قناني غاز بقيمة صفر وسببها، بالعامّ الثاني.
  const fuelO = await fuel('كاز افتتاح النسخة');
  const gasO = await S.one(U.owner, "insert into public.items (name, kind, base_unit) values ('غاز افتتاح النسخة', 'fuel', 'pc') returning id");
  const opO = await openingDraft(db, manager, W.general2, GO_LIVE, [{ item: fuelO, qty: 20, value: 15000 }, { item: gasO, qty: 5, value: 0, zeroReason: 'هدية من المورّد' }]);
  await S.one(manager, "update public.opening_docs set note = 'رصيد البداية' where id = $1 returning id", [opO.id]);
  opO.version = (await db.admin('select version from public.opening_docs where id = $1', [opO.id])).rows[0].version;
  t.same(
    [shown(await postOpening(db, manager, opO)), shown(await copy(manager, 'opening', opO.id)), shown(await voidOpening(db, manager, opO.id))],
    ['ok', 'not_void', 'ok'],
    'الافتتاح يُحفظ نهائياً (ونسخته وهو محفوظ not_void)، ثم ينلغى',
  );
  const OPENING_HEAD = 'warehouse_id, on_date::text as on_date, note';
  const openingLinesOf = async (docId) =>
    (await db.admin('select item_id, trim_scale(qty_base)::text as qty_base, trim_scale(value)::text as value, zero_reason, expiry_on, born_at from public.opening_lines where doc_id = $1 order by line_no', [docId])).rows;
  const oNew = uid();
  const oCopy = await copy(manager, 'opening', opO.id, oNew);
  t.same(
    [answer(oCopy.value), await head('opening_docs', oNew, OPENING_HEAD), await openingLinesOf(oNew)],
    [
      answer({ id: oNew, doc_kind: 'opening', source_id: opO.id, status: 'draft', version: 3, lines: 2, skipped: [], money: { skipped: [] } }),
      await head('opening_docs', opO.id, OPENING_HEAD),
      [
        { item_id: fuelO, qty_base: '20', value: '15000', zero_reason: null, expiry_on: null, born_at: null },
        { item_id: gasO, qty_base: '5', value: '0', zero_reason: 'هدية من المورّد', expiry_on: null, born_at: null },
      ],
    ],
    'نسخة الافتتاح للمدير: المخزن واليوم والملاحظة، والسطران بقيمتيهما وسبب الصفر',
  );
  t.same([shown(await copy(keeper, 'opening', opO.id)), shown(await copy(pricer, 'opening', opO.id))], ['forbidden', 'forbidden'], 'الأمين والمحاسب ما ينسخون الافتتاح (opening.post)');
  const oPosted = await call(db, manager, 'select public.post_opening_stock($1, $2, $3)', [oNew, 3, uid()]);
  t.same([shown(oPosted), (await lotsOf(db, fuelO, W.general2)).map((l) => [l.qty_left, l.value_left])], ['ok', [['0', '0'], ['20', '15000']]], 'نسخة الافتتاح تُحفظ نهائياً: دفعة جديدة 20 لتراً بـ15,000 والأصل ملغى بصفر');
  t.same(canon(await head('opening_docs', opO.id, 'status')), canon({ status: 'void' }), 'والأصل يبقى ظاهراً «ملغى» (لا حذف)');

  // ── R-DB-2: رفض الإلغاء ما يسمّي جرداً بمخزن برّا نطاق الداخل ────────────────────────────────────────────────────────
  // المدير المحصور صار بنطاق العامّ وحده (آخر الفحص، فما يأثّر على ما فوك)؛ تحويل 4 لترات من العامّ للعامّ الثاني يوم 28، وجرد العامّ
  // الثاني اليوم (المدير بلا نطاق). void_transfer يفحص نطاق المرسِل بس ويعكس طرف المستلِم: المحصور ما يقرأ الجرد ولا يلغيه، فالرفض
  // count_superseded بلا رقمه ولا يومه ولا مخزنه؛ والمدير بلا نطاق يشوف نفس الجرد برقمه (الفرعان).
  await S.one(U.owner, "select public.set_member_scopes_v2($1, '{}', '{}', array[$2]::uuid[])", [S.members.scopedManager, W.general]);
  const fuelP = await fuel('كاز النطاق');
  await fuelReceipt(fuelP, '2026-10-27');
  const trP = await postedTransfer(db, keeper, W.general, W.general2, '2026-10-28', [{ item: fuelP, qty: 4 }]);
  const ctP = await postedCount(W.general2, TODAY, [{ item: fuelP, counted: 4 }]);
  const unseen = await call(db, U.scopedManager, 'select count(*)::int from public.stock_counts where id = $1', [ctP.id]);
  const scoped = await voidTransfer(db, U.scopedManager, trP.id);
  t.same(
    [unseen.value, shown(scoped), scoped.hint?.includes('«كاز النطاق»'), scoped.hint?.includes('خارج نطاقك'), scoped.hint?.includes(ctP.docNo), scoped.hint?.includes('30/10/2026'), scoped.hint?.includes(general2Name)],
    [0, 'count_superseded', true, true, false, false, false],
    'R-DB-2: المحصور بالمرسِل يلغي تحويلاً جُرد مستلِمه: count_superseded يسمّي المادّة و«خارج نطاقك»، بلا رقم الجرد ولا يومه ولا مخزنه',
  );
  t.same(refusal(await voidTransfer(db, manager, trP.id), ctP.docNo, 'كاز النطاق', general2Name, '30/10/2026'), REFUSED, 'ضابط R-DB-2: المدير بلا نطاق يشوف نفس الرفض برقم الجرد ومخزنه ويومه');
}
