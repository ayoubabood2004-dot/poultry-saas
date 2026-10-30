// الجرد (WP5، 0008؛ FOUNDATION ٥٥٥؛ القاعدة 17؛ E25، E41، E42، E45، E48، E53، E55): الأرقام «مشتقّة» من البذور بالافتتاح (الخطّة
// WP5). الذرة C1 بـ4,000 كغم وC2 بـ5,000 كغم: نقص 100 كغم يسحب من الأقدم (45,000.00 «فرق جرد») وزيادة 10 كغم تُقاس بأحدث دفعة
// بالمنشأة كلها (أيّ مخزن، والمعكوس افتتاحها مستثنى)؛ والتعادل بين الجذر ومرآته للجذر؛ وبلا دفعة قياس كلفة المدير بأربع مراتب؛
// والأفراخ بوقت فقس؛ والمنتهي يُجرد لحاله (E41) ونقصه من المنتهي بس؛ ودورة المراجعة (E53): التسليم يجمّد العدّ، ومستند ترحّل
// بعده يرفض الترحيل (count_stale) لحد «أعد الحساب»، و«أعِد للعدّ» يرجّعه مسوّدة، و«أغلِق دون ترحيل» يطويه؛ والإلغاء يرجّع كل شي
// للفلس، ودفعة زيادة انسحب منها lot_consumed؛ والكلف لأدوار الكلفة بس. كل نداء بدور authenticated حقيقي.
import { LEDGER_ZERO, call, outcome, shown, uid, verifyLedger } from './ledger-kit.mjs';
import { draftWriteLock, sameRefRace } from './shared.mjs';
import { STOCK_ZERO, balanceOf, lotsOf, makeStockOrg, postedOpening, postedTransfer, verifyStock, voidOpening, voidTransfer } from './stock-kit.mjs';

const TODAY = '2026-10-30';
const GO_LIVE = '2026-10-20';
const id = (n) => `5c000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477098200${String(n).padStart(2, '0')}`;

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const S = await makeStockOrg(db, { name: 'مزرعة الجرد', id, phone, goLive: GO_LIVE });
  const { users: U, W, I, divisions: D } = S;
  await S.one(U.owner, "select public.set_member_scopes_v2($1, '{}', '{}', array[$2, $3, $4]::uuid[])", [S.members.storekeeper, W.general, W.raw, W.medicine]);
  const rawSite = (await db.admin('select site_id from public.warehouses where id = $1', [W.raw])).rows[0].site_id;
  const raw2 = await S.one(U.owner, "insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن مواد أولية ثانٍ', 'raw') returning id", [D.feed_mill, rawSite]);
  const item = (label, kind, unit) => S.one(U.owner, 'insert into public.items (name, kind, base_unit) values ($1, $2, $3) returning id', [label, kind, unit]);
  const brakeOil = await item('زيت فرامل', 'fuel', 'L');
  const generator = await item('مولّدة صغيرة', 'equipment', 'pc');
  const countDiff = (await db.admin("select id from public.expense_categories where org_id = $1 and system_code = 'count_diff'", [S.org])).rows[0].id;

  // البذور (مشتقّة): الذرة C1 4,000 كغم بـ1,800,000.00 وC2 5,000 كغم بـ2,404,166.67 (سطر لاحق ← fifo_seq أكبر)، وكاز أويل 100 لتر
  // بـ75,000.00، وغاز 10 قناني، وأفراخ 1,000 بـ500,000.00، واللقاح منتهٍ (6 بـ6,000.00 انتهت 25/10) وصالح (10 بـ20,000.00).
  await postedOpening(db, U.manager, W.raw, GO_LIVE, [
    { item: I.corn, qty: 4000, value: 1800000 },
    { item: I.corn, qty: 5000, value: 2404166.67 },
  ]);
  await postedOpening(db, U.manager, W.general, GO_LIVE, [
    { item: I.diesel, qty: 100, value: 75000 },
    { item: I.gas, qty: 10, value: 100000 },
    { item: brakeOil, qty: 3, value: 10 },
  ]);
  await postedOpening(db, U.manager, W.chick, GO_LIVE, [{ item: I.chicks, qty: 1000, value: 500000, bornAt: '2026-10-20T02:00:00Z' }]);
  await postedOpening(db, U.manager, W.medicine, GO_LIVE, [
    { item: I.vaccine, qty: 6, value: 6000, expiry: '2026-10-25' },
    { item: I.vaccine, qty: 10, value: 20000, expiry: '2027-06-30' },
  ]);
  const corn = await lotsOf(db, I.corn, W.raw);
  const [C1, C2] = corn.map((l) => l.id);

  /** مسوّدة جرد بكتابة مباشرة: lines = [{ item, qty, expired?, gainExpiry?, gainExpiredExpiry?, bornAt? }]. */
  const countDraft = (user, wh, lines, countedOn = TODAY) =>
    db.asUser(
      user,
      async (q) => {
        const docId = (await q('insert into public.stock_counts (warehouse_id, counted_on) values ($1, $2) returning id', [wh, countedOn])).rows[0].id;
        const ids = [];
        for (const line of lines) {
          ids.push((await q(
            'insert into public.stock_count_lines (doc_id, item_id, counted_qty, counted_expired_qty, gain_expiry_on, gain_expired_expiry_on, gain_born_at) values ($1, $2, $3, $4, $5, $6, $7) returning id',
            [docId, line.item, line.qty, line.expired ?? null, line.gainExpiry ?? null, line.gainExpiredExpiry ?? null, line.bornAt ?? null],
          )).rows[0].id);
        }
        return { id: docId, lines: ids };
      },
      { commit: true },
    );
  const versionOf = async (docId) => (await db.admin('select version from public.stock_counts where id = $1', [docId])).rows[0].version;
  const statusOf = async (docId) => (await db.admin('select status, doc_no from public.stock_counts where id = $1', [docId])).rows[0];
  const submit = async (user, doc) => call(db, user, 'select public.submit_count($1, $2, $3)', [doc.id, await versionOf(doc.id), uid()]);
  const writeReason = (user, lineId, text) => call(db, user, 'update public.stock_count_lines set reason = $2, reason_diff = diff, reason_expired_diff = expired_diff where id = $1 returning reason', [lineId, text]);
  const editLine = (user, lineId, column, value) => call(db, user, `update public.stock_count_lines set ${column} = $2 where id = $1 returning id`, [lineId, value]);
  const preview = (user, docId) => call(db, user, 'select public.preview_count($1)', [docId]);
  const post = async (user, docId, plan, ref = uid()) => call(db, user, 'select public.post_count($1, $2, $3, $4)', [docId, await versionOf(docId), plan, ref]);
  const postNow = async (user, docId, ref = uid()) =>
    call(db, user, "select public.post_count($1, $2, public.preview_count($1) ->> 'plan', $3)", [docId, await versionOf(docId), ref]);
  const refresh = async (user, docId) => call(db, user, 'select public.refresh_count($1, $2, $3)', [docId, await versionOf(docId), uid()]);
  const giveBack = async (user, docId, why) => call(db, user, 'select public.return_count($1, $2, $3, $4)', [docId, await versionOf(docId), why, uid()]);
  const voidCount = (user, docId, why = 'جرد خاطئ') => call(db, user, 'select public.void_count($1, $2, $3)', [docId, why, uid()]);
  const expensesOf = async (docId) =>
    (await db.admin("select amount::text as amount, category_id, division_id, source, on_date::text as on_date, (reverses_id is not null) as reversal from public.expenses where doc_kind = 'count' and doc_id = $1 order by created_at, id", [docId])).rows;
  const costRows = async (docId) =>
    (await db.admin('select line_id, trim_scale(gain_unit_cost)::text as gain_unit_cost, gain_value::text as gain_value, shortage_value::text as shortage_value from public.stock_count_line_costs where doc_id = $1 order by line_id', [docId])).rows;
  /** جرد مسلَّم بسبب لكل سطر بفرق (العادّ يسلّم، والمدير يكتب السبب): يرجّع المستند. */
  const submitted = async (wh, lines, { counter = U.storekeeper, why = 'فرق بالعدّ' } = {}) => {
    const doc = await countDraft(counter, wh, lines);
    const sent = await submit(counter, doc);
    if (!sent.ok) throw new Error(`جرد ما تسلّم: ${sent.code} ${sent.hint}`);
    for (const lineId of doc.lines) {
      const diff = (await db.admin('select diff, expired_diff from public.stock_count_lines where id = $1', [lineId])).rows[0];
      if (Number(diff.diff) !== 0 || Number(diff.expired_diff ?? 0) !== 0) await writeReason(U.manager, lineId, why);
    }
    return doc;
  };

  // ── الزيادة (القاعدة 17، E45): دفعة القياس أحدث دفعة بالمنشأة كلها، حتى بمخزن ثاني، والمعكوس افتتاحها مستثنى ───────────────
  const later = await postedOpening(db, U.manager, raw2, GO_LIVE, [{ item: I.corn, qty: 100, value: 50000 }]);
  const C3 = (await lotsOf(db, I.corn, raw2))[0].id;
  const gainDoc = await countDraft(U.storekeeper, W.raw, [{ item: I.corn, qty: 9010 }]);
  const gainSent = await submit(U.storekeeper, gainDoc);
  t.same([shown(gainSent), Object.keys(gainSent.value ?? {}).sort()], ['ok', ['id', 'kind', 'status', 'version']], 'الأمين يسلّم الجرد، والنتيجة بلا كميات الدفتر (عدّ أعمى، E25)');
  t.same(
    [shown(await postNow(U.manager, gainDoc.id)), (await preview(U.manager, gainDoc.id)).value.lines[0].problem?.code],
    ['reason_required', 'reason_required'],
    'الفرق بلا سبب: المعاينة تقوله والترحيل reason_required',
  );
  await writeReason(U.manager, gainDoc.lines[0], 'كيس مفتوح ما انحسب');
  const seenC3 = (await preview(U.manager, gainDoc.id)).value;
  const lineC3 = seenC3.lines[0];
  t.same(
    [lineC3.system_qty, lineC3.diff, lineC3.reference_lot_id, lineC3.gain_source, lineC3.money.gain_value, seenC3.ready],
    ['9000.000', '10.000', C3, 'lot', '5000.00', true],
    'الزيادة 10 كغم تُقاس بأحدث دفعة بالمنشأة (C3 بمخزن ثاني، 100 كغم بـ50,000.00): 5,000.00',
  );
  t.eq(shown(await voidOpening(db, U.manager, later.id)), 'ok', 'إلغاء افتتاح C3 بعد المعاينة');
  t.eq(shown(await post(U.manager, gainDoc.id, seenC3.plan)), 'stale_preview', 'دفعة القياس تغيّرت بعد المعاينة: stale_preview (قيمة الزيادة ما عادت 5,000.00)');
  const seenC2 = (await preview(U.manager, gainDoc.id)).value;
  t.same([seenC2.lines[0].reference_lot_id, seenC2.lines[0].money.gain_value], [C2, '4808.33'], 'بعد إلغاء افتتاحها C3 مستثناة: القياس بـC2 ← 10 × 2,404,166.67 ÷ 5,000 = 4,808.33');
  const gainPosted = await post(U.manager, gainDoc.id, seenC2.plan);
  const gainLot = (await lotsOf(db, I.corn, W.raw)).find((l) => l.source_kind === 'count_gain');
  t.same(
    [shown(gainPosted), gainPosted.value?.doc_no, gainPosted.value?.money?.gain_total, gainLot && [gainLot.qty_in, gainLot.value_in, gainLot.received_on], await expensesOf(gainDoc.id), await balanceOf(db, I.corn, W.raw)],
    ['ok', 'CT-2026-0001', '4808.33', ['10', '4808.33', TODAY], [], { qty: '9010', value: '4208975' }],
    'ترحيل الزيادة: CT-2026-0001، ودفعة count_gain بـ10 كغم و4,808.33 بيوم الجرد، وبلا مصروف (E11)، والرصيد 9,010 كغم بـ4,208,975.00',
  );
  t.same(await costRows(gainDoc.id), [{ line_id: gainDoc.lines[0], gain_unit_cost: null, gain_value: '4808.33', shortage_value: '0' }], 'قيمتا السطر بكلفته (E55): الزيادة 4,808.33 والنقص صفر');

  // ── النقص (مشتقّ): 100 كغم من الأقدم C1 ← 45,000.00 «فرق جرد» بوحدة المخزن ────────────────────────────────────────────
  const beforeShort = [await lotsOf(db, I.corn, W.raw), await balanceOf(db, I.corn, W.raw)];
  const shortDoc = await submitted(W.raw, [{ item: I.corn, qty: 8910 }]);
  const shortSeen = (await preview(U.manager, shortDoc.id)).value;
  const shortPosted = await postNow(U.manager, shortDoc.id);
  const feedMill = D.feed_mill;
  t.same(
    [shortSeen.lines[0].draws.map((d) => [d.lot_id, d.qty, d.money.value]), shown(shortPosted), shortPosted.value?.doc_no, await expensesOf(shortDoc.id)],
    [[[C1, '100.000', '45000.00']], 'ok', 'CT-2026-0002', [{ amount: '45000.00', category_id: countDiff, division_id: feedMill, source: 'stock', on_date: TODAY, reversal: false }]],
    'نقص 100 كغم: المعاينة تسحب من C1 (45,000.00)، والترحيل CT-2026-0002 ومصروف «فرق جرد» 45,000.00 بمصدر stock بوحدة المصنع',
  );
  t.same((await lotsOf(db, I.corn, W.raw)).find((l) => l.id === C1).qty_left, '3900', 'C1 بعد النقص 3,900 كغم');
  // الإلغاء يرجّع كل شي للفلس: الدفعات والرصيد، و«فرق جرد» بصفّ عكسي.
  const voidedShort = await voidCount(U.manager, shortDoc.id);
  t.same(
    [shown(voidedShort), [await lotsOf(db, I.corn, W.raw), await balanceOf(db, I.corn, W.raw)], (await expensesOf(shortDoc.id)).map((e) => [e.amount, e.reversal])],
    ['ok', beforeShort, [['45000.00', false], ['-45000.00', true]]],
    'إلغاء جرد النقص: الدفعات والرصيد مثل قبله بالفلس، و«فرق جرد» بصفّ عكسي',
  );
  t.same(
    [shown(await voidCount(U.manager, shortDoc.id)), shown(await voidCount(U.storekeeper, gainDoc.id)), (await statusOf(shortDoc.id)).status],
    ['already_void', 'forbidden', 'void'],
    'الإلغاء مرّة ثانية already_void، والأمين ما يلغي (forbidden)',
  );

  // ── التعادل (E45): الجذر ومرآته بنفس fifo_seq ← الجذر أوّلاً ──────────────────────────────────────────────────────────
  // زيت فرامل 3 لترات بـ10.00 (الجذر)، وتحويل لترين للمخزن العامّ الثاني (مرآة بـ6.67). زيادة لتر: بالجذر 3.33، وبالمرآة كانت 3.34.
  await postedTransfer(db, U.manager, W.general, W.general2, TODAY, [{ item: brakeOil, qty: 2 }]);
  const [root] = await lotsOf(db, brakeOil, W.general);
  const [mirror] = await lotsOf(db, brakeOil, W.general2);
  const tieDoc = await submitted(W.general, [{ item: brakeOil, qty: 2 }]);
  const tieSeen = (await preview(U.manager, tieDoc.id)).value.lines[0];
  t.same(
    [mirror.fifo_seq === root.fifo_seq, mirror.origin_lot_id, mirror.value_in, tieSeen.reference_lot_id, tieSeen.money.gain_value],
    [true, root.id, '6.67', root.id, '3.33'],
    'زيادة لتر زيت فرامل: الجذر والمرآة بنفس الترتيب، والقياس بالجذر (10.00 ÷ 3 = 3.33) مو المرآة (6.67 ÷ 2 = 3.34)',
  );
  t.eq(shown(await postNow(U.manager, tieDoc.id)), 'ok', 'ترحيل زيادة التعادل');

  // ── بلا دفعة قياس (E48): كلفة وحدة المدير بأربع مراتب، والكلفة لأدوار الكلفة وبفعل المراجعة بس ─────────────────────────────
  const manualDoc = await submitted(W.general, [{ item: generator, qty: 2 }], { why: 'مولّدة ما مسجّلة' });
  const manualLine = manualDoc.lines[0];
  const noCost = (await preview(U.manager, manualDoc.id)).value.lines[0];
  const costInsert = (user, value) => call(db, user, 'insert into public.stock_count_line_costs (line_id, gain_unit_cost) values ($1, $2) returning line_id', [manualLine, value]);
  t.same(
    [noCost.problem?.code, noCost.gain_source, shown(await postNow(U.manager, manualDoc.id))],
    ['gain_cost_required', null, 'gain_cost_required'],
    'مادّة بلا أي دفعة سابقة: المعاينة والترحيل gain_cost_required',
  );
  t.same(
    [shown(await costInsert(U.storekeeper, 1234.5678)), shown(await costInsert(U.accountant, 1234.5678)), shown(await costInsert(U.manager, 1234.56789))],
    ['forbidden', 'forbidden', 'check:stock_count_line_costs_gain_unit_cost_check'],
    'كلفة الوحدة: الأمين والمحاسب forbidden (count.approve)، وخمس مراتب يرفضها قيد العمود بلا تقريب صامت',
  );
  t.eq(shown(await costInsert(U.manager, 1234.5678)), 'ok', 'المدير يكتب كلفة الوحدة 1,234.5678');
  const withCost = (await preview(U.manager, manualDoc.id)).value.lines[0];
  t.same([withCost.gain_source, withCost.money.gain_unit_cost, withCost.money.gain_value], ['manual', '1234.5678', '2469.14'], 'زيادة قطعتين بكلفة المدير: 2 × 1,234.5678 = 2,469.14 (القاعدة 13)');
  const manualPosted = await postNow(U.manager, manualDoc.id);
  t.same(
    [shown(manualPosted), await costRows(manualDoc.id), await balanceOf(db, generator, W.general)],
    ['ok', [{ line_id: manualLine, gain_unit_cost: '1234.5678', gain_value: '2469.14', shortage_value: '0' }], { qty: '2', value: '2469.14' }],
    'الترحيل بكلفة المدير: صفّ الكلفة بقيمة الزيادة، والرصيد قطعتان بـ2,469.14',
  );
  const costSeen = async (user) => (await db.asUser(user, (q) => q('select count(*)::int as n from public.stock_count_line_costs where doc_id = $1', [manualDoc.id]))).rows[0].n;
  t.same([await costSeen(U.manager), await costSeen(U.accountant), await costSeen(U.storekeeper), await costSeen(U.viewer)], [1, 1, 0, 0], 'صفوف كلفة الجرد لأدوار الكلفة بس (المدير والمحاسب)');
  // دفعة زيادة انسحب منها: الإلغاء lot_consumed يسمّي المستند، وبعد إلغاء الصرف يمرّ.
  const maintenance = await S.one(U.accountant, "insert into public.expense_categories (name) values ('صيانة') returning id");
  const use = await db.asUser(
    U.manager,
    async (q) => {
      const docId = (await q('insert into public.stock_uses (warehouse_id, category_id, used_on) values ($1, $2, $3) returning id', [W.general, maintenance, TODAY])).rows[0].id;
      await q('insert into public.stock_use_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 1)', [docId, generator]);
      return docId;
    },
    { commit: true },
  );
  const usePosted = await call(db, U.manager, "select public.post_stock_use($1, (select version from public.stock_uses where id = $1), public.preview_stock_use($1) ->> 'plan', $2)", [use, uid()]);
  const consumed = await voidCount(U.manager, manualDoc.id);
  t.same([shown(usePosted), shown(consumed), consumed.hint.includes(usePosted.value?.doc_no)], ['ok', 'lot_consumed', true], `إلغاء جرد انسحب من دفعة زيادته: lot_consumed يسمّي ${usePosted.value?.doc_no}`);
  await call(db, U.manager, "select public.void_stock_use($1, 'صرف للفحص', $2)", [use, uid()]);
  t.same([shown(await voidCount(U.manager, manualDoc.id)), await balanceOf(db, generator, W.general)], ['ok', { qty: '0', value: '0' }], 'بعد إلغاء الصرف يمرّ إلغاء الجرد والرصيد صفر');

  // ── الأفراخ (E42): زيادة بلا وقت فقس ترفض بالتسليم، ودفعتها بوقت الفقس المكتوب ───────────────────────────────────────────
  const chickDoc = await countDraft(U.hatcheryKeeper, W.chick, [{ item: I.chicks, qty: 1010 }]);
  t.eq(shown(await submit(U.hatcheryKeeper, chickDoc)), 'born_at_required', 'زيادة أفراخ بلا وقت فقس: born_at_required بالتسليم');
  t.eq(shown(await editLine(U.hatcheryKeeper, chickDoc.lines[0], 'gain_born_at', '2026-10-29T04:30:00Z')), 'ok', 'أمين المفقس يكتب وقت فقس الزيادة');
  t.eq(shown(await submit(U.hatcheryKeeper, chickDoc)), 'ok', 'التسليم بوقت الفقس');
  await writeReason(U.manager, chickDoc.lines[0], 'فقس متأخّر');
  const chickPosted = await postNow(U.manager, chickDoc.id);
  const chickGain = (await db.admin("select trim_scale(qty_in)::text as qty, value_in::text as value, born_at from public.stock_lots where source_kind = 'count_gain' and source_id = $1", [chickDoc.id])).rows;
  t.same(
    [shown(chickPosted), chickGain.map((l) => [l.qty, l.value, l.born_at.toISOString()])],
    ['ok', [['10', '5000.00', '2026-10-29T04:30:00.000Z']]],
    'زيادة 10 أفراخ بدفعة القياس (500,000.00 ÷ 1,000 × 10 = 5,000.00) ووقت فقسها المكتوب',
  );

  // ── المنتهي (E41): يُجرد لحاله، والمطابق بلا تسوية، ونقصه من المنتهي بس، وزيادته بتاريخ قبل يوم الجرد ───────────────────────
  const vials = await lotsOf(db, I.vaccine, W.medicine);
  const expiredLot = vials.find((l) => l.expiry_on === '2026-10-25').id;
  const validLot = vials.find((l) => l.expiry_on === '2027-06-30').id;
  const exact = await submitted(W.medicine, [{ item: I.vaccine, qty: 10, expired: 6 }]);
  const exactSeen = (await preview(U.manager, exact.id)).value.lines[0];
  const exactPosted = await postNow(U.manager, exact.id);
  t.same(
    [[exactSeen.system_qty, exactSeen.system_expired_qty, exactSeen.diff, exactSeen.expired_diff, exactSeen.problem], shown(exactPosted), await expensesOf(exact.id)],
    [['10.000', '6.000', '0.000', '0.000', null], 'ok', []],
    'لقاح 10 صالح و6 منتهٍ كما بالدفتر: بلا فرق ولا سبب ولا تسوية',
  );
  const expShort = await submitted(W.medicine, [{ item: I.vaccine, qty: 10, expired: 4 }]);
  const expShortSeen = (await preview(U.manager, expShort.id)).value.lines[0];
  const expShortPosted = await postNow(U.manager, expShort.id);
  const lotsNow = await lotsOf(db, I.vaccine, W.medicine);
  t.same(
    [expShortSeen.draws, expShortSeen.expired_draws.map((d) => [d.lot_id, d.qty, d.money.value]), shown(expShortPosted), (await expensesOf(expShort.id)).map((e) => e.amount),
      lotsNow.find((l) => l.id === expiredLot).qty_left, lotsNow.find((l) => l.id === validLot).qty_left],
    [[], [[expiredLot, '2.000', '2000.00']], 'ok', ['2000.00'], '4', '10'],
    'منتهٍ 4 من 6: النقص (2) يُسحب من الدفعة المنتهية بس (2,000.00 «فرق جرد») والصالحة 10 كما هي',
  );
  const expGain = await countDraft(U.storekeeper, W.medicine, [{ item: I.vaccine, qty: 10, expired: 5 }]);
  t.eq(shown(await submit(U.storekeeper, expGain)), 'expiry_required', 'زيادة منتهية بلا تاريخ انتهاء: expiry_required');
  await editLine(U.storekeeper, expGain.lines[0], 'gain_expired_expiry_on', '2027-01-01');
  t.eq(shown(await submit(U.storekeeper, expGain)), 'gain_expiry_mismatch', 'زيادة «منتهية» بتاريخ بعد يوم الجرد: gain_expiry_mismatch');
  await editLine(U.storekeeper, expGain.lines[0], 'counted_qty', 11);
  await editLine(U.storekeeper, expGain.lines[0], 'gain_expired_expiry_on', '2026-10-01');
  await editLine(U.storekeeper, expGain.lines[0], 'gain_expiry_on', '2026-10-29');
  t.eq(shown(await submit(U.storekeeper, expGain)), 'gain_expiry_mismatch', 'زيادة «صالحة» بتاريخ قبل يوم الجرد: gain_expiry_mismatch');
  await editLine(U.storekeeper, expGain.lines[0], 'gain_expiry_on', '2027-03-31');
  t.eq(shown(await submit(U.storekeeper, expGain)), 'ok', 'التسليم بتاريخين يناسبان حالتيهما');
  await writeReason(U.manager, expGain.lines[0], 'عبوات بالثلاجة');
  t.eq(shown(await postNow(U.manager, expGain.id)), 'ok', 'ترحيل الزيادتين');
  const gains = (await db.admin("select expiry_on::text as expiry_on, trim_scale(qty_in)::text as qty, value_in::text as value from public.stock_lots where source_kind = 'count_gain' and source_id = $1 order by expiry_on", [expGain.id])).rows;
  t.same(gains, [{ expiry_on: '2026-10-01', qty: '1', value: '2000.00' }, { expiry_on: '2027-03-31', qty: '1', value: '2000.00' }], 'دفعتا زيادة: المنتهية (2026-10-01) والصالحة (2027-03-31)، كل وحدة بـ2,000.00 من دفعة القياس');

  // ── المسوّدة: مشاكل السطر برموزها بالتسليم وبحارس السطر ─────────────────────────────────────────────────────────────
  const lineError = async (user, wh, line) => countDraft(user, wh, [line]).then(() => 'ok', outcome);
  const problemAt = async (user, wh, line) => shown(await submit(user, await countDraft(user, wh, [line])));
  t.same(
    [
      await lineError(U.storekeeper, W.general, { item: I.diesel, qty: 1, expired: 1 }),
      await problemAt(U.storekeeper, W.general, { item: I.vaccine, qty: 1 }),
      await problemAt(U.manager, W.table_egg, { item: I.eggs, qty: 30 }),
      await problemAt(U.storekeeper, W.general, { item: generator, qty: 1.5 }),
      await problemAt(U.storekeeper, W.general, { item: I.diesel, qty: 100, gainExpiry: '2027-01-01' }),
      await problemAt(U.storekeeper, W.general, { item: I.diesel, qty: 100, bornAt: '2026-10-29T04:30:00Z' }),
      await lineError(U.storekeeper, W.chick, { item: I.chicks, qty: 1 }),
      await lineError(U.viewer, W.general, { item: I.diesel, qty: 1 }),
    ],
    ['expiry_not_tracked', 'item_kind_mismatch', 'egg_flock_required', 'pieces_not_whole', 'expiry_not_tracked', 'born_at_not_chick', 'rls', 'rls'],
    'منتهٍ لمادّة ما تتابعه يرفضه حارس السطر، والأهلية وبيض المائدة والقطع وتاريخ الانتهاء ووقت الفقس برموزها بالتسليم، وبرّا النطاق وبلا فعل RLS',
  );

  // ── دورة المراجعة (E53) ───────────────────────────────────────────────────────────────────────────────────────────
  const review = await countDraft(U.storekeeper, W.general, [{ item: I.diesel, qty: 98 }]);
  t.same(
    [shown(await giveBack(U.manager, review.id, 'مبكّر')), shown(await postNow(U.manager, review.id)), shown(await refresh(U.manager, review.id))],
    ['not_submitted', 'not_submitted', 'not_submitted'],
    'المسوّدة قبل التسليم: «أعِد للعدّ» والترحيل وإعادة الحساب not_submitted',
  );
  t.eq(shown(await submit(U.storekeeper, review)), 'ok', 'الأمين يسلّم الجرد (كاز أويل 98 من 100)');
  const extra = await db.asUser(U.storekeeper, (q) => q('insert into public.stock_count_lines (doc_id, item_id, counted_qty) values ($1, $2, 1)', [review.id, I.gas])).then(() => 'ok', outcome);
  t.same(
    [
      shown(await editLine(U.storekeeper, review.lines[0], 'counted_qty', 99)),
      extra,
      await db.asUser(U.storekeeper, (q) => q("update public.stock_counts set status = 'draft', counted_on = counted_on where id = $1", [review.id])).then((r) => r.rowCount, outcome),
      shown(await writeReason(U.storekeeper, review.lines[0], 'الأمين')),
      shown(await postNow(U.storekeeper, review.id)),
      shown(await refresh(U.storekeeper, review.id)),
    ],
    ['not_draft', 'not_draft', 0, 'not_draft', 'forbidden', 'forbidden'],
    'المسلَّم مجمّد للأمين: تعديل العدّ وإضافة سطر وكتابة السبب not_draft، والرأس ما يتعدّل، والترحيل وإعادة الحساب للمدير',
  );
  t.same(
    [shown(await editLine(U.manager, review.lines[0], 'counted_qty', 99)), shown(await writeReason(U.manager, review.lines[0], '  تبخّر  '))],
    ['not_draft', 'ok'],
    'المدير بالمراجعة يكتب سبب الفرق بس (والعدّ not_draft)',
  );
  t.eq((await db.admin('select reason from public.stock_count_lines where id = $1', [review.lines[0]])).rows[0].reason, 'تبخّر', 'السبب ينحفظ بلا فراغات الطرفين');
  const moved = await postedTransfer(db, U.manager, W.general, W.general2, TODAY, [{ item: I.diesel, qty: 10 }]);
  const staleSeen = (await preview(U.manager, review.id)).value;
  const stalePost = await post(U.manager, review.id, staleSeen.plan);
  t.same(
    [staleSeen.stale, staleSeen.ready, shown(stalePost), stalePost.hint.includes('كاز أويل')],
    [true, false, 'count_stale', true],
    `تحويل ترحّل بعد التسليم: المعاينة «تغيّر الرصيد» والترحيل count_stale (${stalePost.hint})`,
  );
  const refreshed = await refresh(U.manager, review.id);
  const docNo = (await db.admin('select doc_no from public.transfers where id = $1', [moved.id])).rows[0].doc_no;
  const refreshedLine = refreshed.value?.lines?.[0];
  t.same(
    [shown(refreshed), refreshedLine?.old?.diff, refreshedLine?.new?.diff, refreshedLine?.docs?.map((d) => [d.doc_kind, d.label, Number(d.qty)])],
    ['ok', '-2.000', '8.000', [['transfer', docNo, -10]]],
    'إعادة الحساب: الفرق القديم −2 والجديد +8، والمستند اللي ترحّل بعد اللقطة باسمه وكميته',
  );
  // ختم السبب (مراجعة WP5): «تبخّر» انكتب على نقص 2، والفرق صار +8 بإعادة الحساب: الترحيل يطلب تأكيد السبب. والختم يبقى بـ«أعِد
  // للعدّ»، فإعادة العدّ للنقص نفسه (−2) بعدها تترحّل بالسبب نفسه.
  // وإعادة حساب ثانية بنفس الأرقام ما تكتب السطر، فما تختم السبب بدل المدير.
  t.eq(shown(await refresh(U.manager, review.id)), 'ok', 'إعادة حساب ثانية بنفس الأرقام');
  const restamped = (await preview(U.manager, review.id)).value.lines[0];
  const unconfirmed = await postNow(U.manager, review.id);
  t.same(
    [restamped.reason_stale, restamped.problem?.code, shown(unconfirmed), unconfirmed.hint.includes('بعد كتابة سببه')],
    [true, 'reason_required', 'reason_required', true],
    'السبب مكتوب على فرق −2 والفرق صار +8: المعاينة «تغيّر الفرق» والترحيل reason_required لحد ما يتأكّد السبب',
  );
  t.same(
    [shown(await giveBack(U.storekeeper, review.id, 'الأمين')), shown(await giveBack(U.manager, review.id, '  '))],
    ['forbidden', 'reason_required'],
    '«أعِد للعدّ» للمدير وبسبب',
  );
  t.eq(shown(await giveBack(U.manager, review.id, 'تحويل بعد العدّ؛ أعد العدّ')), 'ok', 'المدير يعيد الجرد للعدّ');
  const backRow = (await db.admin('select status, snapshot_at, return_reason from public.stock_counts where id = $1', [review.id])).rows[0];
  const backLine = (await db.admin('select system_qty, diff, reason from public.stock_count_lines where id = $1', [review.lines[0]])).rows[0];
  t.same(
    [backRow.status, backRow.snapshot_at, backRow.return_reason, backLine.system_qty, backLine.diff, backLine.reason],
    ['draft', null, 'تحويل بعد العدّ؛ أعد العدّ', null, null, 'تبخّر'],
    'الجرد المعاد مسوّدة بسببه، واللقطة انمسحت، وسبب المدير باقٍ',
  );
  t.eq(shown(await editLine(U.storekeeper, review.lines[0], 'counted_qty', 88)), 'ok', 'الأمين يعيد العدّ (88)');
  t.eq(shown(await submit(U.storekeeper, review)), 'ok', 'ويسلّمه من جديد');
  const reviewPosted = await postNow(U.manager, review.id);
  t.same(
    [shown(reviewPosted), (await expensesOf(review.id)).map((e) => e.amount), await balanceOf(db, I.diesel, W.general)],
    ['ok', ['1500.00'], { qty: '88', value: '66000' }],
    'الترحيل بعد إعادة العدّ: نقص لترين من 90 بـ67,500.00 ← 1,500.00، والرصيد 88 لتراً',
  );
  // «أغلِق دون ترحيل»: المسلَّم يطويه المدير بس.
  const closeMe = await submitted(W.general, [{ item: I.gas, qty: 10 }]);
  t.same(
    [
      shown(await call(db, U.storekeeper, "select public.discard_draft('count', $1, $2) ->> 'status'", [closeMe.id, await versionOf(closeMe.id)])),
      shown(await call(db, U.manager, "select public.discard_draft('count', $1, $2) ->> 'status'", [closeMe.id, await versionOf(closeMe.id)])),
      await statusOf(closeMe.id),
    ],
    ['forbidden', 'ok', { status: 'void', doc_no: null }],
    '«أغلِق دون ترحيل»: الأمين forbidden، والمدير يطوي المسلَّم بلا رقم',
  );
  // حذف سطر بكلفته: المدير كتب الكلفة وأعاد الجرد، والأمين يحذف السطر (والكلفة قبله).
  const priced = await submitted(W.general, [{ item: generator, qty: 1 }], { why: 'قطعة' });
  await call(db, U.manager, 'insert into public.stock_count_line_costs (line_id, gain_unit_cost) values ($1, 50) returning line_id', [priced.lines[0]]);
  await giveBack(U.manager, priced.id, 'احذف المولّدة');
  const deleted = await call(db, U.storekeeper, "select public.delete_draft_line('count', $1, $2) ->> 'deleted'", [priced.lines[0], await versionOf(priced.id)]);
  t.same([deleted.value, await costRows(priced.id)], ['true', []], 'الأمين يحذف سطراً كتب له المدير كلفة: السطر وكلفته راحا');

  // ── مراجعة WP5: رصيد يوم الجرد (مو المتبقّي الآن)، وتأكيد السبب، والمادّة مرّة وحدة، والمرحَّل ما ينكتب بنفس القيم، واسم مصدر
  //    دفعة الزيادة ──────────────────────────────────────────────────────────────────────────────────────────────────
  // كيروسين 50 لتراً من 20/10 (5,000.00)، وتحويل 20 لتراً بتاريخ اليوم قبل التسليم: جرد بتاريخ 27/10 رصيده 50 (المتبقّي الآن 30
  // كان يطلّع زيادة 14 ما صارت).
  const kero = await item('كيروسين التاريخ', 'fuel', 'L');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: kero, qty: 50, value: 5000 }]);
  await postedTransfer(db, U.manager, W.general, W.general2, TODAY, [{ item: kero, qty: 20 }]);
  const dated = await countDraft(U.storekeeper, W.general, [{ item: kero, qty: 44 }], '2026-10-27');
  t.eq(shown(await submit(U.storekeeper, dated)), 'ok', 'جرد بتاريخ 27/10 يتسلّم');
  const datedLine = async () => (await db.admin('select system_qty::text as system_qty, diff::text as diff from public.stock_count_lines where id = $1', [dated.lines[0]])).rows[0];
  t.same(await datedLine(), { system_qty: '50.000', diff: '-6.000' }, 'رصيد يوم الجرد 50 (تحويل اليوم بعده ما ينحسب)، والفرق −6');
  await writeReason(U.manager, dated.lines[0], 'لتر مسكوب');
  // بعد التسليم: تحويل بتاريخ اليوم (بعد يوم الجرد) ما يغيّر رصيده، وتحويل بتاريخ 26/10 يغيّره ويسمّيه «أعد الحساب».
  await postedTransfer(db, U.manager, W.general, W.general2, TODAY, [{ item: kero, qty: 3 }]);
  const afterLater = (await preview(U.manager, dated.id)).value;
  const backdated = await postedTransfer(db, U.manager, W.general, W.general2, '2026-10-26', [{ item: kero, qty: 5 }]);
  const backdatedNo = (await db.admin('select doc_no from public.transfers where id = $1', [backdated.id])).rows[0].doc_no;
  const afterBackdated = (await preview(U.manager, dated.id)).value;
  const datedRefresh = await refresh(U.manager, dated.id);
  t.same(
    [afterLater.stale, afterBackdated.stale, shown(datedRefresh), datedRefresh.value?.lines?.[0]?.docs?.map((d) => [d.label, Number(d.qty)]), await datedLine()],
    [false, true, 'ok', [[backdatedNo, -5]], { system_qty: '45.000', diff: '-1.000' }],
    'تحويل بعد يوم الجرد ما يقلبه، وتحويل بتاريخ قبله يقلبه؛ «أعد الحساب» يسمّي القبلي بس، والفرق صار −1',
  );
  // تأكيد السبب: نفس النصّ يختمه بالفرق الجديد، فالترحيل يمرّ؛ ونقص لتر من 22 لتراً بـ2,200.00 ← 100.00.
  const stillStale = await postNow(U.manager, dated.id);
  await writeReason(U.manager, dated.lines[0], 'لتر مسكوب');
  const confirmed = (await preview(U.manager, dated.id)).value.lines[0];
  const datedPosted = await postNow(U.manager, dated.id);
  t.same(
    [shown(stillStale), confirmed.reason_stale, confirmed.problem, shown(datedPosted), (await expensesOf(dated.id)).map((e) => [e.amount, e.on_date]), await balanceOf(db, kero, W.general)],
    ['reason_required', false, null, 'ok', [['100.00', '2026-10-27']], { qty: '21', value: '2100' }],
    'السبب على فرق قديم reason_required، وكتابته من جديد تؤكّده، والترحيل ينقص لتراً بيوم الجرد (100.00) والرصيد 21 لتراً',
  );

  // المادّة مرّة وحدة بالجرد: سطر ثاني بنفس المادّة item_already_counted (كان 23505 خاماً)، وإعادة إرسال نفس السطر (نفس المعرّف،
  // جهاز ضاع جوابه) 23505 على مفتاح الصفّ بس، فالجهاز يعرف إنه انكتب.
  const once = await countDraft(U.storekeeper, W.general, [{ item: I.gas, qty: 1 }]);
  const insertLine = (lineId, itemId, qty) =>
    db
      .asUser(U.storekeeper, (q) => q('insert into public.stock_count_lines (id, doc_id, item_id, counted_qty) values ($1, $2, $3, $4)', [lineId, once.id, itemId, qty]), { commit: true })
      .then(() => 'ok', outcome);
  const retried = uid();
  t.same(
    [
      await countDraft(U.storekeeper, W.general, [{ item: I.gas, qty: 1 }, { item: I.gas, qty: 2 }]).then(() => 'ok', outcome),
      await insertLine(retried, I.diesel, 5),
      await insertLine(retried, I.diesel, 6),
      await insertLine(uid(), I.diesel, 7),
    ],
    ['item_already_counted', 'ok', 'unique:stock_count_lines_pkey', 'item_already_counted'],
    'المادّة مرّتين بالجرد item_already_counted؛ ونفس السطر مرّة ثانية (نفس المعرّف) 23505 على مفتاح الصفّ',
  );

  // جرد مرحَّل: تعديل بنفس القيم (السطر والكلفة) not_draft، مو «انكتب» بصمت (العودة المبكّرة كانت لأيّ تعديل ما غيّر اللقطة).
  t.same(
    [
      shown(await editLine(U.manager, gainDoc.lines[0], 'counted_qty', 9010)),
      shown(await call(db, U.manager, 'update public.stock_count_line_costs set gain_unit_cost = gain_unit_cost where line_id = $1 returning line_id', [gainDoc.lines[0]])),
    ],
    ['not_draft', 'not_draft'],
    'جرد مرحَّل: تعديل السطر أو الكلفة بنفس القيم not_draft',
  );

  // دفعة زيادة الجرد مصدرها رقم الجرد بقائمة الدفعات (كانت «count_gain» خاماً).
  const gainRow = (await call(db, U.manager, 'select public.item_lots_qty($1, $2, null, 50)', [I.corn, W.raw])).value.rows.find((l) => l.source_kind === 'count_gain');
  t.eq(gainRow?.source, (await statusOf(gainDoc.id)).doc_no, 'دفعة زيادة الجرد بقائمة الدفعات: مصدرها رقم الجرد');

  // ── المراجعة الثانية لـWP5 ────────────────────────────────────────────────────────────────────────────────────────
  // جرد أقدم بعد جرد أحدث مرحَّل لنفس المادّة: الأحدث (29/10) سوّى الرصيد، وحركاته بعد يوم الأقدم (27/10) فرصيد يومه ما تغيّر، فكان
  // الأقدم يترحّل بلا «تغيّر الرصيد» ويطبّق نقص 6 لترات مرّة ثانية (38 بالدفتر و44 على الرفّ).
  const twice = await item('كاز الجردين', 'fuel', 'L');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: twice, qty: 50, value: 5000 }]);
  const olderCount = await countDraft(U.storekeeper, W.general, [{ item: twice, qty: 44 }], '2026-10-27');
  await submit(U.storekeeper, olderCount);
  await writeReason(U.manager, olderCount.lines[0], 'تسرّب');
  const newerCount = await countDraft(U.storekeeper, W.general, [{ item: twice, qty: 44 }], '2026-10-29');
  await submit(U.storekeeper, newerCount);
  await writeReason(U.manager, newerCount.lines[0], 'تسرّب');
  t.eq(shown(await postNow(U.manager, newerCount.id)), 'ok', 'الجرد الأحدث (29/10) يترحّل بنقص 6 لترات');
  const newerNo = (await statusOf(newerCount.id)).doc_no;
  const supersededSeen = (await preview(U.manager, olderCount.id)).value;
  const supersededPost = await postNow(U.manager, olderCount.id);
  t.same(
    [supersededSeen.lines[0].problem?.code, supersededSeen.ready, shown(supersededPost), supersededPost.hint?.includes(newerNo), await balanceOf(db, twice, W.general)],
    ['count_superseded', false, 'count_superseded', true, { qty: '44', value: '4400' }],
    `جرد 27/10 بعد ترحيل جرد 29/10 لنفس المادّة: المعاينة والترحيل count_superseded يسمّيان ${newerNo}، والرصيد 44 لتراً (النقص مرّة وحدة)`,
  );

  // تقسيم الصالح والمنتهي بيوم الجرد (مو اليوم): دفعة تنتهي 28/10 صالحة بجرد 27/10 ولو انتهت اليوم.
  const drops = await S.one(U.owner, "insert into public.items (name, kind, base_unit, tracks_expiry) values ('قطرة الجرد', 'medicine', 'pc', true) returning id");
  await postedOpening(db, U.manager, W.medicine, GO_LIVE, [{ item: drops, qty: 5, value: 500, expiry: '2026-10-28' }]);
  const dropsCount = await countDraft(U.storekeeper, W.medicine, [{ item: drops, qty: 5, expired: 0 }], '2026-10-27');
  t.eq(shown(await submit(U.storekeeper, dropsCount)), 'ok', 'جرد القطرة بتاريخ 27/10 يتسلّم');
  t.same(
    (await db.admin('select system_qty::text as valid, system_expired_qty::text as expired, diff::text as d, expired_diff::text as xd from public.stock_count_lines where id = $1', [dropsCount.lines[0]])).rows[0],
    { valid: '5.000', expired: '0.000', d: '0.000', xd: '0.000' },
    'دفعة تنتهي 28/10 بجرد 27/10: صالحة 5 ومنتهية صفر (بيوم الجرد، مو اليوم 30/10)',
  );

  // فرق المنتهي وحده تغيّر بعد كتابة السبب: صرف دفعة منتهية مسمّاة بتاريخ يوم الجرد بعد التسليم (المدير، Q5).
  const serum = await S.one(U.owner, "insert into public.items (name, kind, base_unit, tracks_expiry) values ('مصل الجرد', 'medicine', 'pc', true) returning id");
  await postedOpening(db, U.manager, W.medicine, GO_LIVE, [{ item: serum, qty: 6, value: 600, expiry: '2026-10-24' }, { item: serum, qty: 4, value: 400, expiry: '2027-01-01' }]);
  const serumCount = await countDraft(U.storekeeper, W.medicine, [{ item: serum, qty: 4, expired: 4 }], '2026-10-27');
  await submit(U.storekeeper, serumCount);
  t.eq(shown(await writeReason(U.manager, serumCount.lines[0], 'كسر')), 'ok', 'سبب نقص المنتهي (−2)');
  const spoilage = await S.one(U.accountant, "insert into public.expense_categories (name) values ('تلف الجرد') returning id");
  const expiredSerum = (await lotsOf(db, serum, W.medicine)).find((l) => l.expiry_on === '2026-10-24').id;
  await db.asUser(
    U.manager,
    async (q) => {
      const use = (await q('insert into public.stock_uses (warehouse_id, category_id, used_on) values ($1, $2, $3) returning id', [W.medicine, spoilage, '2026-10-27'])).rows[0].id;
      await q('insert into public.stock_use_lines (doc_id, item_id, qty_in_unit, lot_id) values ($1, $2, 1, $3)', [use, serum, expiredSerum]);
      await q("select public.post_stock_use($1, (select version from public.stock_uses where id = $1), public.preview_stock_use($1) ->> 'plan', gen_random_uuid())", [use]);
    },
    { commit: true },
  );
  t.eq(shown(await refresh(U.manager, serumCount.id)), 'ok', 'إعادة حساب جرد المصل');
  const serumSeen = (await preview(U.manager, serumCount.id)).value.lines[0];
  t.same(
    [serumSeen.diff, serumSeen.expired_diff, serumSeen.reason_stale, shown(await postNow(U.manager, serumCount.id))],
    ['0.000', '-1.000', true, 'reason_required'],
    'فرق المنتهي وحده تغيّر (−2 ← −1) بعد كتابة السبب: المعاينة «السبب على فرق قديم» والترحيل reason_required',
  );

  // إلغاء مستند بتاريخ قبل يوم الجرد بعد اللقطة: «أعد الحساب» يسمّيه (عكسيته بتاريخ اليوم وأصلها بيوم 26/10).
  const voidable = await item('كاز الإلغاء', 'fuel', 'L');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: voidable, qty: 20, value: 2000 }]);
  const early = await postedTransfer(db, U.manager, W.general, W.general2, '2026-10-26', [{ item: voidable, qty: 4 }]);
  const earlyNo = (await db.admin('select doc_no from public.transfers where id = $1', [early.id])).rows[0].doc_no;
  const voidedCount = await countDraft(U.storekeeper, W.general, [{ item: voidable, qty: 16 }], '2026-10-27');
  await submit(U.storekeeper, voidedCount);
  t.eq(shown(await voidTransfer(db, U.manager, early.id)), 'ok', `إلغاء ${earlyNo} بعد التسليم`);
  const voidRefresh = await refresh(U.manager, voidedCount.id);
  t.same(
    [shown(voidRefresh), voidRefresh.value?.lines?.[0]?.docs?.map((d) => [d.label, Number(d.qty)]), voidRefresh.value?.lines?.[0]?.new?.diff],
    ['ok', [[earlyNo, 4]], '-4.000'],
    'إلغاء تحويل بتاريخ 26/10 بعد لقطة جرد 27/10: «أعد الحساب» يسمّيه (+4) والفرق صار −4',
  );

  // السبب على الفرق اللي شافه المدير: الشاشة ترسل الفرقين، وفرق غير الحالي (أو بلاهما) stale_draft؛ وبالمسوّدة ما ينكتبان.
  const stamped = await item('كاز الختم', 'fuel', 'L');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: stamped, qty: 10, value: 1000 }]);
  const stampCount = await countDraft(U.storekeeper, W.general, [{ item: stamped, qty: 9 }]);
  const draftStamp = await call(db, U.storekeeper, 'update public.stock_count_lines set reason_diff = 1 where id = $1 returning id', [stampCount.lines[0]]);
  await submit(U.storekeeper, stampCount);
  const reasonAt = (sql) => call(db, U.manager, `update public.stock_count_lines set ${sql} where id = $1 returning id`, [stampCount.lines[0]]);
  t.same(
    [
      shown(draftStamp),
      shown(await reasonAt("reason = 'كسر', reason_diff = diff - 1, reason_expired_diff = expired_diff")),
      shown(await reasonAt("reason = 'كسر'")),
      shown(await writeReason(U.manager, stampCount.lines[0], 'كسر')),
      shown(await reasonAt("reason = null, reason_diff = null, reason_expired_diff = null")),
    ],
    ['frozen_column', 'stale_draft', 'stale_draft', 'ok', 'ok'],
    'السبب بفرق غير الحالي أو بلا فرق stale_draft، وبالفرق الحالي يمرّ، ومسحه يمسح الختم؛ والختم بالمسوّدة frozen_column',
  );

  // ── مرجع واحد (D6) وقفل المسوّدة المرحَّلة (FOUNDATION ٥٢٦) ─────────────────────────────────────────────────────────
  await sameRefRace(t, db, {
    name: 'الجرد',
    user: U.manager,
    draft: async () => {
      const doc = await submitted(W.general, [{ item: I.gas, qty: 10 }]);
      return { id: doc.id, version: await versionOf(doc.id) };
    },
    post: (docId, version, ref) => ({ sql: "select public.post_count($1, $2, public.preview_count($1) ->> 'plan', $3) as result", params: [docId, version, ref] }),
    postings: async (docId) => (await db.admin("select count(*)::int as count, count(distinct doc_no)::int as numbers from public.stock_counts where id = $1 and status = 'approved'", [docId])).rows[0],
  });
  const as = (status) => (status === 'posted' ? 'approved' : status);
  await draftWriteLock(t, db, {
    name: 'الجرد',
    user: U.storekeeper,
    draft: async () => {
      const doc = await countDraft(U.storekeeper, W.general, [{ item: I.gas, qty: 10 }]);
      return { id: doc.id, version: await versionOf(doc.id), lineId: doc.lines[0] };
    },
    posted: async () => {
      const doc = await submitted(W.general, [{ item: I.gas, qty: 10 }]);
      const result = await postNow(U.manager, doc.id);
      if (!result.ok) throw new Error(`جرد ما انرحّل: ${result.code}`);
      return { id: doc.id, lineId: doc.lines[0] };
    },
    insertHeader: (status) => ({ sql: 'insert into public.stock_counts (warehouse_id, counted_on, status) values ($1, $2, $3)', params: [W.general, TODAY, as(status)] }),
    setStatus: (doc, status) => ({ sql: 'update public.stock_counts set status = $2 where id = $1', params: [doc.id, as(status)] }),
    editLine: (doc) => ({ sql: 'update public.stock_count_lines set counted_qty = counted_qty + 1 where id = $1', params: [doc.lineId] }),
  });

  // ── الثوابت ─────────────────────────────────────────────────────────────────────────────────────────────────────
  t.same(await db.asService(verifyStock), STOCK_ZERO, 'verify_stock صفر بعد الجرد والإلغاء');
  t.same(await db.asService(verifyLedger), LEDGER_ZERO, 'verify_ledger صفر (أرقام CT بلا فجوة)');
  const gap = await db.asOwner(async (q) => {
    await q("update public.doc_counters set last_no = last_no + 1 where org_id = $1 and kind = 'CT'", [S.org]);
    return verifyLedger(q);
  }, U.owner);
  t.same(gap, { ...LEDGER_ZERO, doc_numbers: 1 }, 'ضابط: عدّاد CT بفجوة يقلب doc_numbers وحده');
}

