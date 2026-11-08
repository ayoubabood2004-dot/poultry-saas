// مراجعة 0017 الأولى (scratchpad/simple/review/triage.md): إصلاحات القاعدة بفحص يفشل على الالتزام bd3b51e ويمرّ بعدها.
// • M2: ملفّ المادّة وبطاقاتها بمبلغ الفاتورة الحاليّ بعد تصحيح السعر (مرآة item_purchases في 0013): السطر المصحَّح بمبلغه الجديد وسعر وحدته
//   = مبلغه ÷ كميته وcorrected، والمجموع والمتوسّط وآخر سعر منه؛ وverify_purchases على المكتوب (الثوابت صفر بعد كلّ ملف).
// • M3: المادّة التي تتابع الانتهاء والأفراخ تُشترى بالنداء نفسه (p_expiry_on وp_born_at أخيرين بافتراض فارغ) بقواعد سطر الاستلام: الانتهاء
//   إلزاميّ لمن تتابعه وممنوع لغيرها ولا منتهٍ يوم الشراء إلّا للمدير (expired.release)، ووقت الفقس إلزاميّ للأفراخ وممنوع لغيرها ولا بعد الآن؛
//   والتلميحات تسمّي حقلَي النافذة؛ والدفعة تحمل التاريخين؛ والإعادة بالمعرّف تقارنهما؛ وitem_file.item.tracks_expiry؛ والتوقيع القديم غائب.
// • L1: item_file.can_record = purchase.record ومخزن يستلم المادّة بنطاق القارئ ودفتره بنطاقه؛ وitems_overview يبقى علم الدور.
// • L2: سعر البيع الحاليّ يتبع أحدث شراء مسعَّر بتاريخه ثمّ وقت ترحيله (المؤرَّخ قبل الأحدث لا يكتب فوقه).
// • L6: الإعادة بالمرجع نفسه أو بمعرّف الاستلام نفسه بعد إلغاء الشراء: id_conflict «أُلغي» لا «حُفظ».
// وكلّ قاعدة جديدة بطفرة تكسرها فيفشل فحصها (آخر الملف).
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { postedUse, postRevalue } from './return-kit.mjs';

const TODAY = '2026-11-06';
const GO_LIVE = '2026-10-20';
const id = (n) => `b1720000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477099720${String(n).padStart(2, '0')}`;
const RP = 'select public.record_purchase($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) as v';
// بلا التاريخين (النداء القديم بإثني عشر معاملاً، يصل التوقيع الجديد بافتراضَيه): أقسام M2 وL1 وL2 وL6 تُجرى به، فتفشل على bd3b51e بسلوكها لا بالتوقيع.
const RP12 = 'select public.record_purchase($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) as v';
const SIG = 'public.record_purchase(uuid, uuid, uuid, uuid, uuid, date, numeric, numeric, numeric, text, uuid, uuid, date, timestamptz)';
const FN = { record: SIG, file: 'public.item_file(uuid)', overview: 'public.items_overview()' };

const norm = (value) => {
  if (value === null || value === undefined) return value;
  const text = String(value);
  return text.includes('.') ? text.replace(/0+$/u, '').replace(/\.$/u, '') : text;
};

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const G = await makeOrg(db, {
    name: 'مزرعة إصلاحات الشراء',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['storekeeper', 'storekeeper', ['feed_mill']],
      ['accountant', 'accountant'],
      ['millOperator', 'mill_operator', ['feed_mill']],
      ['hallWorker', 'hall_worker', ['broiler']],
      ['keeperRaw', 'storekeeper', ['feed_mill']],
    ],
  });
  const { users: U, divisions: D, org } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  for (const kind of Object.keys(D)) await one(U.owner, 'select public.set_division_go_live($1, $2)', [D[kind], GO_LIVE]);
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  await one(U.owner, "select public.set_member_scopes_v2($1, '{}', '{}', array[$2]::uuid[])", [G.members.keeperRaw, W.raw]);
  const item = (name, kind, unit, tracks = false) => one(U.owner, 'insert into public.items (name, kind, base_unit, tracks_expiry) values ($1, $2, $3, $4) returning id', [name, kind, unit, tracks]);
  const I = {
    corn: await item('ذرة الإصلاح', 'raw', 'kg'),
    soy: await item('صويا الإصلاح', 'raw', 'kg'),
    vaccine: await item('لقاح الإصلاح', 'vaccine', 'pc', true),
    chicks: await item('أفراخ الإصلاح', 'chick', 'pc'),
    eggs: await item('بيض الإصلاح', 'table_egg', 'pc'),
  };
  const supplier = await one(U.accountant, "insert into public.parties (name, is_supplier) values ('مورّد الإصلاح', true) returning id");
  // صندوق واحد في المنشأة: قائمة الصناديق في ملفّ المادّة (L1) تُقرأ منه.
  await one(U.accountant, "insert into public.cash_accounts (name, kind) values ('صندوق الإصلاح', 'cash') returning id");
  const upkeep = await one(U.accountant, "insert into public.expense_categories (name) values ('علف التجربة') returning id");
  const given = (o, key, fallback) => (o[key] === undefined ? fallback() : o[key]);
  const args = (o) => [given(o, 'ref', uid), given(o, 'receipt', uid), given(o, 'line', uid), o.item, o.party ?? supplier, o.on ?? TODAY, o.qty, o.price,
    o.sell ?? null, o.payment ?? 'credit', o.box ?? null, o.wh ?? null, o.expiry ?? null, o.born ?? null];
  const rp = (user, o) => call(db, user, RP12, args(o).slice(0, 12));
  const rp14 = (user, o) => call(db, user, RP, args(o));
  const shownOf = (r) => (r.ok ? 'ok' : r.code);
  const file = async (user, itemId) => (await call(db, user, 'select public.item_file($1) as v', [itemId])).value;
  const overview = async (user) => (await call(db, user, 'select public.items_overview() as v')).value;
  const pastMoment = new Date(Date.now() - 3600 * 1000).toISOString();
  const futureMoment = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

  // ── M2: تصحيح السعر بعد الشراء يظهر في الملفّ والبطاقات كما في سجلّ الشراء (item_purchases) ──────────────────────────────
  // 1,000 كغم × 450 = 450,000، يُصرف منها 100 كغم، ثمّ يصحّح المدير الفاتورة إلى 500,000 ← سعر الوحدة 500.00 والسطر corrected. وشراء ثانٍ بعده
  // 100 كغم × 460 = 46,000 بلا تصحيح. المجموع 546,000 لـ1,100 كغم ← المتوسّط 496.3636… ← 496.36، وآخر سعر 460 (الأحدث).
  const m2 = { line: uid() };
  const bought = await rp(U.storekeeper, { ...m2, item: I.corn, qty: 1000, price: 450, sell: 500 });
  await postedUse(db, U.storekeeper, { wh: W.raw, category: upkeep, on: TODAY, item: I.corn, qty: 100 });
  const revalued = await postRevalue(db, U.manager, m2.line, 500000);
  const second = await rp(U.storekeeper, { item: I.corn, qty: 100, price: 460 });
  t.same([bought.ok, revalued.ok, second.ok], [true, true, true], `M2: شراء ثمّ صرف ثمّ تصحيح ثمّ شراء ثانٍ (${revalued.code ?? ''} ${revalued.hint ?? ''})`);
  const cornFile = await file(U.manager, I.corn);
  t.same(cornFile.purchases.map((row) => [norm(row.qty), norm(row.money.unit_price), norm(row.money.line_total), row.money.corrected]),
    [['100', '460', '46000', false], ['1000', '500', '500000', true]],
    'M2: السطر المصحَّح بمبلغه الجديد 500,000 وسعر وحدته 500.00 وcorrected، والسطر الآخر بسعره كما كُتب وcorrected false');
  t.same([norm(cornFile.money.purchased_value), cornFile.money.avg_unit_price, norm(cornFile.money.last_unit_price)], ['546000', '496.36', '460'],
    'M2: مجموع المشترى 546,000 بالمبلغ المصحَّح، ومتوسّطه 496.36، وآخر سعر 460');
  const ledger = (await call(db, U.manager, 'select public.item_purchases($1, null, null, 50) as v', [I.corn])).value;
  t.same(cornFile.purchases.map((row) => [row.line_id, norm(row.money.line_total), row.money.corrected]),
    ledger.rows.map((row) => [row.line_id, norm(row.money.invoice_total), row.money.corrected]),
    'M2: الملفّ = سجلّ الشراء (item_purchases) بمبلغ الفاتورة الحاليّ وعلم التصحيح لكلّ سطر');
  const cornCard = (await overview(U.manager)).items.find((row) => row.id === I.corn);
  t.eq(cornCard?.money?.avg_unit_price, '496.36', 'M2: بطاقة المادّة بالمتوسّط المصحَّح نفسه');
  const masked = await file(U.millOperator, I.corn);
  t.same([JSON.stringify(masked).includes('corrected'), masked.purchases.length], [false, 2], 'M2: علم التصحيح داخل money فيُشال لمشغّل المعمل مع المال');

  // ── M3: الانتهاء ووقت الفقس بالنداء نفسه ─────────────────────────────────────────────────────────────────────────
  const sig = (await db.admin("select count(*)::int as n, max(pronargs)::int as args, max(pronargdefaults)::int as defaults, (select p.proargnames from pg_proc p where p.proname = 'record_purchase' and p.pronamespace = 'public'::regnamespace limit 1) as names from pg_proc where proname = 'record_purchase' and pronamespace = 'public'::regnamespace")).rows[0];
  t.same([sig.n, sig.args, sig.defaults, sig.names?.slice(-2)], [1, 14, 2, ['p_expiry_on', 'p_born_at']], 'M3: توقيع واحد بأربعة عشر معاملاً، والأخيران p_expiry_on وp_born_at بافتراض فارغ (القديم غائب)');
  const vax = { receipt: uid(), line: uid(), ref: uid() };
  const vaxOk = await rp14(U.owner, { ...vax, item: I.vaccine, qty: 10, price: 5000, expiry: '2027-06-30' });
  const vaxLot = vaxOk.ok ? (await db.admin("select expiry_on::text as expiry from public.stock_lots where source_line_id = $1 and origin_lot_id is null", [vax.line])).rows[0] : null;
  t.same([shownOf(vaxOk), vaxLot?.expiry], ['ok', '2027-06-30'], `M3: لقاح يتابع الانتهاء يُشترى بتاريخه، ودفعته تحمله (${vaxOk.hint ?? ''})`);
  const chick = { line: uid() };
  const chickOk = await rp14(U.manager, { ...chick, item: I.chicks, qty: 500, price: 600, born: pastMoment });
  const chickLot = chickOk.ok ? (await db.admin("select born_at from public.stock_lots where source_line_id = $1 and origin_lot_id is null", [chick.line])).rows[0] : null;
  t.same([shownOf(chickOk), chickLot?.born_at?.toISOString?.()], ['ok', pastMoment], `M3: أفراخ تُشترى بوقت فقسها، ودفعتها تحمله (${chickOk.hint ?? ''})`);
  const M3_REFUSALS = [
    ['لقاح بلا تاريخ انتهاء', U.owner, { item: I.vaccine, qty: 10, price: 5000 }, 'expiry_required', '«تاريخ الانتهاء»'],
    ['ذرة بتاريخ انتهاء', U.manager, { item: I.corn, qty: 1, price: 1, expiry: '2027-01-01' }, 'expiry_not_tracked', '«تاريخ الانتهاء»'],
    ['لقاح منتهٍ يوم الشراء (المحاسب)', U.accountant, { item: I.vaccine, qty: 10, price: 5000, expiry: '2026-11-01' }, 'expired_on_receipt', '«تاريخ الانتهاء»'],
    ['أفراخ بلا وقت فقس', U.manager, { item: I.chicks, qty: 500, price: 600 }, 'born_at_required', '«وقت الفقس»'],
    ['ذرة بوقت فقس', U.manager, { item: I.corn, qty: 1, price: 1, born: pastMoment }, 'born_at_not_chick', '«وقت الفقس»'],
    ['أفراخ بوقت فقس بعد الآن', U.manager, { item: I.chicks, qty: 500, price: 600, born: futureMoment }, 'born_at_future', '«وقت الفقس»'],
  ];
  const m3Answers = [];
  for (const [, user, o] of M3_REFUSALS) m3Answers.push(await rp14(user, o));
  t.same(m3Answers.map((a) => [shownOf(a), a.ok ? null : a.hint.includes(M3_REFUSALS[m3Answers.indexOf(a)][4])]), M3_REFUSALS.map((row) => [row[3], true]),
    'M3: قواعد سطر الاستلام بأسمائها، والتلميح يسمّي حقل النافذة («تاريخ الانتهاء» أو «وقت الفقس») لا صفحة الاستلام');
  const managerExpired = await rp14(U.manager, { item: I.vaccine, qty: 1, price: 5000, expiry: '2026-11-01' });
  t.eq(shownOf(managerExpired), 'ok', 'M3: المدير (expired.release) يشتري المنتهي كما في ورقة الاستلام');
  const vaxRetry = await rp14(U.owner, { ...vax, ref: uid(), item: I.vaccine, qty: 10, price: 5000, expiry: '2027-06-30' });
  const vaxOther = await rp14(U.owner, { ...vax, ref: uid(), item: I.vaccine, qty: 10, price: 5000, expiry: '2027-07-01' });
  t.same([vaxRetry.ok && vaxRetry.value.id === vax.receipt, shownOf(vaxOther)], [true, 'id_conflict'], 'M3: الإعادة بالمعرّف بالتاريخ نفسه = حُفظ، وبتاريخ آخر id_conflict');
  t.same([(await file(U.owner, I.vaccine))?.item?.tracks_expiry, (await file(U.owner, I.corn))?.item?.tracks_expiry], [true, false], 'M3: item_file.item.tracks_expiry للنافذة');

  // ── L1: «سجّل شراء» لمن يقبل شراؤه فعلاً ───────────────────────────────────────────────────────────────────────
  const canRecord = async (user, itemId) => (await file(user, itemId))?.can_record;
  const flags = [
    await canRecord(U.storekeeper, I.corn), await canRecord(U.keeperRaw, I.corn), await canRecord(U.manager, I.eggs), await canRecord(U.hallWorker, I.corn),
    (await file(U.keeperRaw, I.corn))?.cash_accounts, (await overview(U.keeperRaw))?.can_record, await canRecord(U.manager, I.chicks),
  ];
  t.same(flags, [true, false, false, false, [], true, true],
    'L1: الأمين بنطاق المعمل يسجّل، والأمين بالمخزن وحده لا (الدفتر خارج نطاقه) ولا صناديق له، وبيض المائدة لا يُشترى، وعامل القاعة لا؛ والبطاقات بعلم الدور');
  const proof = await rp(U.keeperRaw, { item: I.corn, qty: 1, price: 1 });
  t.eq(shownOf(proof), 'out_of_scope', 'L1: الشراء نفسه يرفض الأمين بالمخزن وحده (العلم = ما يشترطه الشراء)');

  // ── L2: سعر البيع يتبع أحدث شراء مسعَّر بتاريخه ثمّ وقت ترحيله ───────────────────────────────────────────────────────────
  const soyPrice = async () => (await db.admin('select sell_price::text as v from public.item_prices where item_id = $1', [I.soy])).rows[0]?.v ?? null;
  const steps = [];
  for (const o of [
    { qty: 100, price: 600, sell: 700 },
    { qty: 100, price: 550, sell: 650, on: '2026-11-02' },
    { qty: 100, price: 610, sell: 720 },
    { qty: 100, price: 540, on: '2026-11-03' },
  ]) {
    const answer = await rp(U.storekeeper, { item: I.soy, ...o });
    steps.push([shownOf(answer), await soyPrice()]);
  }
  t.same(steps, [['ok', '700'], ['ok', '700'], ['ok', '720'], ['ok', '720']],
    'L2: اليوم 700، ثمّ شراء مؤرَّخ 2026-11-02 بـ650 لا يكتب فوقه، ثمّ شراء اليوم بعده بـ720 يكتب، وشراء مؤرَّخ بلا سعر لا يمسّ');
  t.eq(norm((await file(U.manager, I.soy)).money.sell_price), '720', 'L2: سعر البيع في الملفّ = سعر أحدث شراء مسعَّر');

  // ── L6: الإعادة بعد الإلغاء ─────────────────────────────────────────────────────────────────────────────────────
  const l6 = { ref: uid(), receipt: uid(), line: uid() };
  const saved = await rp(U.storekeeper, { ...l6, item: I.corn, qty: 5, price: 450 });
  const voided = await call(db, U.manager, "select public.void_receipt($1, 'شراء مكرّر', gen_random_uuid()) ->> 'status' as v", [l6.receipt]);
  const replay = await rp(U.storekeeper, { ...l6, item: I.corn, qty: 5, price: 450 });
  const byId = await rp(U.storekeeper, { ...l6, ref: uid(), item: I.corn, qty: 5, price: 450 });
  t.same([saved.ok, voided.value, shownOf(replay), replay.hint?.includes('أُلغي'), shownOf(byId), byId.hint?.includes('أُلغي')], [true, 'void', 'id_conflict', true, 'id_conflict', true],
    'L6: بعد الإلغاء، الإعادة بالمرجع نفسه وبالمعرّف نفسه id_conflict «أُلغي» لا «حُفظ»');

  // ── الطفرات: كلّ قاعدة جديدة يفشل فحصها بلا شرطها ────────────────────────────────────────────────────────────────
  const recordAs = (user, o) => async ({ attempt }) => attempt(user, async (q) => (await q(RP, args(o))).rows[0].v);
  const code = (expected, hint) => (r) => !r.ok && r.code === expected && (!hint || r.hint.includes(hint));
  const okWith = (pick, value) => (r) => r.ok && pick(r.value) === value;
  const off = (anchor) => [anchor, anchor.replace(/^( *if ).*( then\n)$/su, '$1false$2')];
  const CASES = [
    { name: 'M2 الملفّ: مبلغ السطر المصحَّح', fns: [[FN.file, [['coalesce(rv.new_total, la.line_total, 0) as line_total', 'coalesce(la.line_total, 0) as line_total']]]],
      run: async ({ attempt }) => attempt(U.manager, async (q) => (await q('select public.item_file($1) as v', [I.corn])).rows[0].v.money.purchased_value), expect: okWith(norm, '546000') },
    { name: 'M2 الملفّ: سعر وحدة السطر المصحَّح', fns: [[FN.file, [['when rv.new_total is not null then private._mul_div_round(1, rv.new_total, l.qty_in, 2)', 'when false then private._mul_div_round(1, rv.new_total, l.qty_in, 2)']]]],
      run: async ({ attempt }) => attempt(U.manager, async (q) => (await q('select public.item_file($1) as v', [I.corn])).rows[0].v.purchases[1].money.unit_price), expect: okWith(norm, '500') },
    { name: 'M2 البطاقات: المبلغ المصحَّح', fns: [[FN.overview, [['coalesce(rv.new_total, la.line_total, 0) as value,', 'coalesce(la.line_total, 0) as value,']]]],
      run: async ({ attempt }) => attempt(U.manager, async (q) => (await q('select public.items_overview() as v')).rows[0].v.items.find((row) => row.id === I.corn).money.avg_unit_price), expect: okWith((v) => v, '496.36') },
    { name: 'M3 expiry_required', fns: [[FN.record, [off('  if i.tracks_expiry and p_expiry_on is null then\n')]]], run: recordAs(U.owner, M3_REFUSALS[0][2]), expect: code('expiry_required', '«تاريخ الانتهاء»') },
    { name: 'M3 expiry_not_tracked', fns: [[FN.record, [off('  if not i.tracks_expiry and p_expiry_on is not null then\n')]]], run: recordAs(U.manager, M3_REFUSALS[1][2]), expect: code('expiry_not_tracked', '«تاريخ الانتهاء»') },
    { name: 'M3 expired_on_receipt', fns: [[FN.record, [off("  if private.lot_expired(i.tracks_expiry, p_expiry_on, p_received_on) and not public.can('expired.release') then\n")]]], run: recordAs(U.accountant, M3_REFUSALS[2][2]), expect: code('expired_on_receipt', '«تاريخ الانتهاء»') },
    { name: 'M3 born_at_required', fns: [[FN.record, [off("  if i.kind = 'chick' and p_born_at is null then\n")]]], run: recordAs(U.manager, M3_REFUSALS[3][2]), expect: code('born_at_required', '«وقت الفقس»') },
    { name: 'M3 born_at_not_chick', fns: [[FN.record, [off("  if i.kind <> 'chick' and p_born_at is not null then\n")]]], run: recordAs(U.manager, M3_REFUSALS[4][2]), expect: code('born_at_not_chick', '«وقت الفقس»') },
    { name: 'M3 born_at_future', fns: [[FN.record, [off('  if p_born_at > now() then\n')]]], run: recordAs(U.manager, M3_REFUSALS[5][2]), expect: code('born_at_future', '«وقت الفقس»') },
    { name: 'M3 السطر يحمل التاريخين', fns: [[FN.record, [['  values (p_line_id, v_org, p_receipt_id, i.id, p_qty, p_expiry_on, p_born_at);', '  values (p_line_id, v_org, p_receipt_id, i.id, p_qty, null, null);']]]],
      run: recordAs(U.owner, { item: I.vaccine, qty: 3, price: 5000, expiry: '2027-06-30' }), expect: okWith((v) => v?.payment, 'credit') },
    { name: 'M3 الإعادة بالمعرّف تقارن التاريخين', fns: [[FN.record, [['          and x.expiry_on is not distinct from p_expiry_on and x.born_at is not distinct from p_born_at\n', '']]]],
      run: recordAs(U.owner, { ...vax, ref: uid(), item: I.vaccine, qty: 10, price: 5000, expiry: '2027-07-01' }), expect: code('id_conflict') },
    { name: 'L1 العلم بشرط المخزن', fns: [[FN.file, [["'can_record', v_can_buy,", "'can_record', v_record,"]]]],
      run: async ({ attempt }) => attempt(U.keeperRaw, async (q) => (await q('select public.item_file($1) as v', [I.corn])).rows[0].v.can_record), expect: okWith((v) => v, false) },
    { name: 'L1 العلم بنطاق الدفتر', fns: [[FN.file, [['\n      and public.in_scope_book(case when x.kind = any (private.receiving_kinds(i.kind)) then private.receipt_book(x.id) end));', ');']]]],
      run: async ({ attempt }) => attempt(U.keeperRaw, async (q) => (await q('select public.item_file($1) as v', [I.corn])).rows[0].v.can_record), expect: okWith((v) => v, false) },
    { name: 'L2 الأحدث يغلب', fns: [[FN.record, [['  if p_sell_price is not null and not exists (', '  if p_sell_price is not null and true or not exists (']]]],
      run: async ({ attempt }) => attempt(U.manager, async (q) => {
        await q(RP, args({ item: I.soy, qty: 10, price: 500, sell: 600, on: '2026-11-01' }));
        return (await q('select sell_price::text as v from public.item_prices where item_id = $1', [I.soy])).rows[0].v;
      }),
      expect: okWith((v) => v, '720') },
    { name: 'L6 الإعادة بالمرجع بعد الإلغاء', fns: [[FN.record, [off("    if exists (select 1 from public.receipts x where x.org_id = v_org and x.id = p_receipt_id and x.status = 'void') then\n")]]],
      run: recordAs(U.storekeeper, { ...l6, item: I.corn, qty: 5, price: 450 }), expect: code('id_conflict', 'أُلغي') },
  ];
  const outcomes = [];
  for (const c of CASES) {
    const realOutcome = await mutant(db, U.manager, [], c.run);
    const broken = await mutant(db, U.manager, c.fns, c.run);
    outcomes.push({ name: c.name, real: c.expect(realOutcome), caught: !c.expect(broken), realOutcome, broken });
  }
  const show = (o) => (o.ok ? `ok:${JSON.stringify(o.value)?.slice(0, 60)}` : `${o.code} (${o.hint.slice(0, 50)})`);
  t.same(outcomes.filter((o) => !o.real).map((o) => `${o.name}: ${show(o.realOutcome)}`), [], `طفرات الإصلاحات (${CASES.length}): كلّ حالة على الشفرة الحقيقية بنتيجتها`);
  t.same(outcomes.filter((o) => !o.caught).map((o) => `${o.name}: ${show(o.broken)}`), [], `طفرات الإصلاحات: ${outcomes.filter((o) => o.caught).length} من ${CASES.length} مُسكت`);
  if (process.env.PURCHASE_FIXES_MUTATIONS_OUT) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(process.env.PURCHASE_FIXES_MUTATIONS_OUT, `${JSON.stringify(outcomes.map((o) => ({ name: o.name, real: o.real, caught: o.caught, mutant: show(o.broken) })), null, 2)}\n`);
  }
}
