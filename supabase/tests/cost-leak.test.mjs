// المال لكلّ عضو (FOUNDATION ٤٤١–٤٤٧، ٨٦١؛ الخطّة §2.8، WP4، R6؛ ثمّ «الكلّ مثل المالك بكلّ شيء»، كلمة المالك 2026-11-21، 0034):
// كانت الأدوار بلا كلفة تقرأ صفر صفوف من الدفعات والحركات والأرصدة وسطور الافتتاح والمصاريف والسجلّ، وأجوبتها بلا money. بعد 0034
// كلّ عضو فعّال يرى ما يراه المالك حرفاً: الجداول بصفوفها، وقرّاء القيم، وmoney في المعاينة والترحيل وإعادته بنفس المرجع، ونسخة
// الاستلام بمبالغها، وسجلّ الشراء وبطاقات المخازن وسعر البيع، ولقطة الإغلاق والفاتورة؛ وصفوف النطاق القديمة (مدير محصور بالأدوية،
// ومحاسب بوحدتها) لا تحجب شيئاً. وقراءات الكميات وحدها بلا money (item_lots_qty)، والتلميح بكميات بلا قيم، كما كانا. وما يبقى مخفيّاً:
// من ليس عضواً لا يرى صفّاً (role-matrix وcore)، وR-DB-3: من نزل دوره يبقى يرى المال (الإعادة بالمرجع بجواب من يسأل الآن).
import { call, uid } from './ledger-kit.mjs';
import { postedReceipt } from './receipt-kit.mjs';
import { makeStockOrg, postedOpening, postedTransfer, transferDraft } from './stock-kit.mjs';

const TODAY = '2026-10-30';
const GO_LIVE = '2026-10-20';
const id = (n) => `d7300000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477097300${String(n).padStart(2, '0')}`;

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

/** أي مفتاح money أو value بأي عمق (القيم كلها داخل money بالعقد، §2.2؛ وvalue بلا money تسريب هم). total بالصفحات عدد صفوف. */
function moneyKeys(value, path = '') {
  if (Array.isArray(value)) return value.flatMap((v, i) => moneyKeys(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, v]) => [...(/^(money|value|value_left|value_in)$/u.test(key) ? [`${path}.${key}`] : []), ...moneyKeys(v, `${path}.${key}`)]);
  }
  return [];
}

async function scenario(t, db) {
  const S = await makeStockOrg(db, { name: 'مزرعة الإخفاء', id, phone, goLive: GO_LIVE });
  const { users: U, W, I } = S;
  await S.one(U.owner, "select public.set_member_scopes_v2($1, '{}', '{}', array[$2]::uuid[])", [S.members.viewer, W.general]);
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: I.diesel, qty: 1000, value: '800000.00' }]);
  await postedOpening(db, U.manager, W.medicine, GO_LIVE, [{ item: I.vaccine, qty: 30, value: 600000, expiry: '2027-06-30' }]);
  await postedTransfer(db, U.storekeeper, W.general, W.raw, TODAY, [{ item: I.diesel, qty: 100 }]);

  // ── الجداول: كلّ دور يقرأ صفوف المالك نفسها من الدفعات والحركات والأرصدة وسطور الافتتاح والسجلّ ──────────────────────────
  const NO_COST = { storekeeper: U.storekeeper, viewer: U.viewer, millOperator: U.millOperator, hallWorker: U.hallWorker, hatcheryKeeper: U.hatcheryKeeper };
  const TABLES = ['stock_lots', 'stock_moves', 'stock_balances', 'opening_lines', 'audit_log'];
  const tableCounts = (user) =>
    db.asUser(user, async (q) => {
      const out = {};
      for (const table of TABLES) out[table] = (await q(`select count(*)::int as n from public.${table}`)).rows[0].n;
      return out;
    });
  const ownerCounts = await tableCounts(U.owner);
  t.ok(ownerCounts.stock_lots >= 3 && ownerCounts.audit_log > 0, `ضابط: المالك يقرأ الدفعات (${ownerCounts.stock_lots}) والسجلّ (${ownerCounts.audit_log})`);
  const counts = {};
  for (const [role, user] of Object.entries(NO_COST)) counts[role] = await tableCounts(user);
  t.same(counts, Object.fromEntries(Object.keys(NO_COST).map((role) => [role, ownerCounts])), 'كلّ دور يقرأ الدفعات والحركات والأرصدة وسطور الافتتاح والسجلّ كالمالك');
  const headerCounts = (user) => db.asUser(user, async (q) => [(await q('select count(*)::int as n from public.opening_docs')).rows[0].n, (await q('select count(*)::int as n from public.transfers')).rows[0].n]);
  t.same(await headerCounts(U.storekeeper), [2, 1], 'الأمين (بنطاق العامّ) يقرأ رأسي افتتاح العامّ والأدوية وتحويله');

  // ── قراءات الكميات بلا money لأي دور، والقيم forbidden لغير الحسابات ──────────────────────────────────────────
  // 0014 نقل stock_on_hand وitem_moves_qty من هنا لمجموعة القناع تحت: صار فيهما money لأدوار الكلفة (private.mask)،
  // مثل item_purchases. وitem_lots_qty يبقى بلا مال أبداً (قيمه بدالّة مستقلّة: item_lots_value).
  const QTY = [
    ['item_lots_qty', 'select public.item_lots_qty($1, $2, null, 50) as v', [I.diesel, W.general]],
  ];
  const leaks = [];
  for (const user of [U.owner, U.manager, U.accountant, U.storekeeper, U.viewer]) {
    for (const [fn, sql, params] of QTY) {
      const result = await call(db, user, sql, params);
      if (!result.ok) leaks.push(`${fn}: ${result.code}`);
      else leaks.push(...moneyKeys(result.value).map((key) => `${fn}${key}`));
    }
  }
  t.same(leaks, [], 'item_lots_qty بلا money ولا قيمة لكل دور');
  const VALUE = [
    ['stock_values', 'select public.stock_values($1, null, 50)', [W.general]],
    ['stock_value_totals', 'select public.stock_value_totals($1)', [W.general]],
    ['item_lots_value', 'select public.item_lots_value($1, $2, null, 50)', [I.diesel, W.general]],
  ];
  const valueCodes = {};
  for (const [role, user] of Object.entries({ ...NO_COST, manager: U.manager, accountant: U.accountant })) {
    valueCodes[role] = [];
    for (const [, sql, params] of VALUE) {
      const result = await call(db, user, sql, params);
      valueCodes[role].push(result.ok ? 'ok' : result.code);
    }
  }
  t.same(
    valueCodes,
    Object.fromEntries([...Object.keys(NO_COST), 'manager', 'accountant'].map((role) => [role, ['ok', 'ok', 'ok']])),
    'stock_values وstock_value_totals وitem_lots_value: كلّ دور يقرأ',
  );

  // ── معاينة الأمين وترحيله وإعادته بنفس المرجع بمالها (كالمدير) ──────────────────────────────────────────────────────
  const draft = await transferDraft(db, U.storekeeper, W.general, W.raw, TODAY, [{ item: I.diesel, qty: 50 }]);
  const preview = (await call(db, U.storekeeper, 'select public.preview_transfer($1)', [draft.id])).value;
  const ref = uid();
  const posted = (await call(db, U.storekeeper, 'select public.post_transfer($1, $2, public.preview_transfer($1) ->> \'plan\', $3)', [draft.id, draft.version, ref])).value;
  const replay = (await call(db, U.storekeeper, 'select public.post_transfer($1, $2, public.preview_transfer($1) ->> \'plan\', $3)', [draft.id, draft.version, ref])).value;
  t.same([preview.lines[0].money.value, moneyKeys(posted).includes('.money'), moneyKeys(replay)], ['40000.00', true, moneyKeys(posted)], 'معاينة الأمين بقيمتها (50 لتراً بـ40,000.00)، وترحيله وإعادته بنفس المرجع بـmoney');
  t.same(replay, posted, 'الإعادة بنفس المرجع نفس النتيجة');
  const managerPreview = (await call(db, U.manager, 'select public.preview_transfer($1)', [(await transferDraft(db, U.manager, W.general, W.raw, TODAY, [{ item: I.diesel, qty: 10 }])).id])).value;
  t.eq(managerPreview.lines[0].money.value, '8000.00', 'ضابط: معاينة المدير بقيمتها (10 لترات بـ8,000.00)');

  // ── التلميح بكميات بلا قيم ───────────────────────────────────────────────────────────────────────────────
  const short = await call(db, U.storekeeper, 'select public.post_transfer($1, $2, public.preview_transfer($1) ->> \'plan\', gen_random_uuid())', Object.values(await transferDraft(db, U.storekeeper, W.general, W.raw, TODAY, [{ item: I.diesel, qty: 5000 }])).slice(0, 2));
  t.ok(!short.ok && short.code === 'insufficient_stock' && /850 لتراً/u.test(short.hint), `رفض النقص يسمّي الكمية (${short.hint})`);
  t.same(['800', '800,000', '680,000', '680000'].filter((value) => short.hint.includes(value)), [], 'ولا قيمة بالتلميح');

  // ── WP5: الصرف والجرد للأمين بمالهما، والمصاريف وكلف الجرد لكلّ دور ─────────────────────────────────────────────────
  const upkeep = await S.one(U.accountant, "insert into public.expense_categories (name) values ('صيانة') returning id");
  const useDraft = (user, wh, item, qty) =>
    db.asUser(
      user,
      async (q) => {
        const docId = (await q('insert into public.stock_uses (warehouse_id, category_id, used_on) values ($1, $2, $3) returning id', [wh, upkeep, TODAY])).rows[0].id;
        await q('insert into public.stock_use_lines (doc_id, item_id, qty_in_unit) values ($1, $2, $3)', [docId, item, qty]);
        return (await q('select id, version from public.stock_uses where id = $1', [docId])).rows[0];
      },
      { commit: true },
    );
  const POST_USE = "select public.post_stock_use($1, $2, public.preview_stock_use($1) ->> 'plan', $3)";
  const use = await useDraft(U.storekeeper, W.general, I.diesel, 20);
  const usePreview = (await call(db, U.storekeeper, 'select public.preview_stock_use($1)', [use.id])).value;
  const useRef = uid();
  const usePosted = (await call(db, U.storekeeper, POST_USE, [use.id, use.version, useRef])).value;
  const useReplay = (await call(db, U.storekeeper, POST_USE, [use.id, use.version, useRef])).value;
  t.same([usePreview.money.total, moneyKeys(usePosted).includes('.money'), moneyKeys(useReplay)], ['16000.00', true, moneyKeys(usePosted)], 'معاينة صرف الأمين بقيمتها (20 لتراً بـ16,000.00)، وترحيله وإعادته بنفس المرجع بـmoney');
  t.same(useReplay, usePosted, 'إعادة الصرف بنفس المرجع نفس النتيجة');
  const managerUse = (await call(db, U.manager, 'select public.preview_stock_use($1)', [(await useDraft(U.manager, W.general, I.diesel, 10)).id])).value;
  t.eq(managerUse.money.total, '8000.00', 'ضابط: معاينة صرف المدير بقيمتها (10 لترات بـ8,000.00)');
  const tooMuch = await useDraft(U.storekeeper, W.general, I.diesel, 5000);
  const useShort = await call(db, U.storekeeper, POST_USE, [tooMuch.id, tooMuch.version, uid()]);
  t.ok(!useShort.ok && useShort.code === 'insufficient_stock' && /830 لتراً/u.test(useShort.hint) && !/664/u.test(useShort.hint), `رفض نقص الصرف بالكمية بلا قيمة (${useShort.hint})`);
  // جرد بنقص لتر (800.00 «فرق جرد»): الأمين يسلّم بلا كميات الدفتر، ويعاين ويصل للترحيل كالمدير (يرفضه بلا سبب الفرق).
  const count = await db.asUser(
    U.storekeeper,
    async (q) => {
      const docId = (await q('insert into public.stock_counts (warehouse_id, counted_on) values ($1, $2) returning id', [W.general, TODAY])).rows[0].id;
      const lineId = (await q('insert into public.stock_count_lines (doc_id, item_id, counted_qty) values ($1, $2, 829) returning id', [docId, I.diesel])).rows[0].id;
      return { id: docId, lineId };
    },
    { commit: true },
  );
  const countVersion = async () => (await db.admin('select version from public.stock_counts where id = $1', [count.id])).rows[0].version;
  const sent = await call(db, U.storekeeper, 'select public.submit_count($1, $2, gen_random_uuid())', [count.id, await countVersion()]);
  t.same(
    [sent.ok && Object.keys(sent.value).sort(), (await call(db, U.storekeeper, 'select public.preview_count($1)', [count.id])).code,
      (await call(db, U.storekeeper, "select public.post_count($1, $2, 'x', gen_random_uuid())", [count.id, await countVersion()])).code],
    [['id', 'kind', 'status', 'version'], undefined, 'reason_required'],
    'تسليم الأمين بلا كميات الدفتر ولا قيم، ويعاين الجرد، وترحيله يصل لقاعدة السبب (reason_required) كالمدير',
  );
  await S.one(U.manager, "update public.stock_count_lines set reason = 'لتر ناقص', reason_diff = diff, reason_expired_diff = expired_diff where id = $1 returning id", [count.lineId]);
  const countPosted = await call(db, U.manager, "select public.post_count($1, $2, public.preview_count($1) ->> 'plan', gen_random_uuid())", [count.id, await countVersion()]);
  t.same([countPosted.ok, countPosted.value?.money?.shortage_total], [true, '800.00'], 'ضابط: المدير يرحّل الجرد بقيمته (نقص لتر بـ800.00)');
  await useDraft(U.manager, W.medicine, I.vaccine, 1).then((doc) => call(db, U.manager, POST_USE, [doc.id, doc.version, uid()]));
  const WP5_TABLES = ['expenses', 'stock_count_line_costs'];
  const wp5Counts = {};
  for (const [role, user] of Object.entries(NO_COST)) {
    wp5Counts[role] = await db.asUser(user, async (q) => {
      const out = {};
      for (const table of WP5_TABLES) out[table] = (await q(`select count(*)::int as n from public.${table}`)).rows[0].n;
      return out;
    });
    const report = await call(db, user, "select public.report_expenses('2026-10-01', null, null, null, 50)");
    wp5Counts[role].report = report.ok ? 'ok' : report.code;
  }
  t.same(
    wp5Counts,
    Object.fromEntries(Object.keys(NO_COST).map((role) => [role, { expenses: 3, stock_count_line_costs: 1, report: 'ok' }])),
    'كلّ دور يقرأ المصاريف الثلاثة (صرفان وجرد) وصفّ كلفة الجرد وتقرير المصاريف',
  );
  const managerWp5 = await db.asUser(U.manager, async (q) => [(await q('select count(*)::int as n from public.expenses')).rows[0].n, (await q('select count(*)::int as n from public.stock_count_line_costs')).rows[0].n]);
  t.same(managerWp5, [3, 1], 'ضابط: المدير يقرأ المصاريف الثلاثة (صرفان وجرد) وصفّ كلفة الجرد');
  const home = (await call(db, U.storekeeper, 'select public.home_summary()')).value;
  t.same(moneyKeys(home), moneyKeys((await call(db, U.manager, 'select public.home_summary()')).value), 'الواجهة الرئيسية للأمين بمفاتيح المدير نفسها');
  // صفوف النطاق القديمة لا تحجب (0034): المدير بصفّ مخزن الأدوية والمحاسب بصفّ وحدتها يقرآن مصاريف كلّ الوحدات وسجلّ تدقيقها كالمدير.
  const medicineDivision = (await db.admin('select division_id from public.warehouses where id = $1', [W.medicine])).rows[0].division_id;
  await S.one(U.owner, "select public.set_member_scopes_v2($1, array[$2]::uuid[], '{}', '{}')", [S.members.accountant, medicineDivision]);
  const expensesSeen = (user) => db.asUser(user, async (q) => ({
    rows: (await q('select distinct division_id from public.expenses')).rows.map((r) => r.division_id),
    audit: (await q("select distinct (coalesce(new, old) ->> 'division_id') as d from public.audit_log where table_name = 'expenses'")).rows.map((r) => r.d),
  }));
  const allExpenses = await expensesSeen(U.manager);
  t.ok(allExpenses.rows.length >= 2 && allExpenses.rows.includes(medicineDivision), `ضابط: المدير يقرأ مصاريف ${allExpenses.rows.length} وحدات منها الأدوية`);
  const sorted = (seen) => ({ rows: [...seen.rows].sort(), audit: [...seen.audit].sort() });
  t.same(
    [sorted(await expensesSeen(U.scopedManager)), sorted(await expensesSeen(U.accountant))],
    [sorted(allExpenses), sorted(allExpenses)],
    'المدير بصفّ مخزن الأدوية والمحاسب بصفّ وحدتها: مصاريف كلّ الوحدات وسجلّ تدقيقها',
  );

  // ── المدير بصفّ مخزن الأدوية: الدفعات وسجلّ التدقيق لكلّ المخازن (0034) ─────────────────────────────────────────────
  const scoped = await db.asUser(U.scopedManager, async (q) => ({
    lots: (await q('select distinct warehouse_id from public.stock_lots')).rows.map((r) => r.warehouse_id),
    audit: (await q("select distinct (coalesce(new, old) ->> 'warehouse_id') as w from public.audit_log where table_name in ('stock_lots', 'stock_moves', 'stock_balances', 'opening_lines')")).rows.map((r) => r.w),
  }));
  t.ok(scoped.lots.length >= 3 && scoped.lots.includes(W.general) && scoped.audit.includes(W.general), `المدير بصفّ الأدوية: دفعات ${scoped.lots.length} مخازن وسجلّ تدقيقها، منها العامّ`);
  const full = await db.asUser(U.manager, async (q) => (await q("select count(distinct (coalesce(new, old) ->> 'warehouse_id'))::int as n from public.audit_log where table_name in ('stock_lots', 'stock_moves', 'stock_balances', 'opening_lines')")).rows[0].n);
  t.ok(full >= 3, `ضابط: المدير بلا نطاق يقرأ سجلّ كل المخازن (${full})`);
  // كل جدول قراءته بسياسة in_scope_wh (من الكتالوج فجدول جديد يدخل وحده) سجلّ تدقيقه بالنطاق مثله، والنطاق المنشأة كلّها (0034):
  // سطور التدقيق برّا مخزن الأدوية تطلع لصاحب صفّ الأدوية كما تطلع للمدير بلا نطاق.
  const scopedTables = (await db.admin("select distinct tablename from pg_policies where schemaname = 'public' and cmd = 'SELECT' and qual like '%in_scope_wh%' order by 1")).rows.map((r) => r.tablename);
  t.ok(
    ['opening_docs', 'opening_lines', 'stock_lots', 'transfer_lines', 'transfers', 'stock_uses', 'stock_use_lines', 'stock_counts', 'stock_count_lines', 'stock_count_line_costs'].every((table) => scopedTables.includes(table)),
    `الجداول المحصورة بالمخزن من الكتالوج (${scopedTables.join('، ')})`,
  );
  const auditOf = (user) => db.asUser(user, async (q) => (await q('select table_name, coalesce(new, old) as r from public.audit_log where table_name = any ($1)', [scopedTables])).rows);
  const stores = (r) => [r.warehouse_id, r.from_warehouse_id, r.to_warehouse_id].filter(Boolean);
  const scopedAudit = await auditOf(U.scopedManager);
  t.eq(scopedAudit.length, (await auditOf(U.manager)).length, 'المدير بصفّ الأدوية: سطور تدقيق الجداول بالنطاق كلّها كالمدير بلا نطاق');
  t.ok(scopedAudit.some(({ r }) => !stores(r).includes(W.medicine)), 'ومنها سطور برّا مخزن الأدوية');
  t.ok(scopedAudit.some(({ table_name: table }) => table === 'opening_docs'), 'ضابط: المحصور يقرأ تدقيق رأس افتتاح مخزنه');
  const fullAudit = await auditOf(U.manager);
  t.ok(
    ['transfers', 'transfer_lines', 'opening_docs', 'stock_uses', 'stock_use_lines', 'stock_counts', 'stock_count_lines', 'stock_count_line_costs'].every((table) => fullAudit.some(({ table_name: name, r }) => name === table && !stores(r).includes(W.medicine))),
    'ضابط: المدير بلا نطاق يقرأ تدقيق التحويل والصرف والجرد وسطورها ورأس الافتتاح بكل المخازن',
  );
  t.ok(['stock_uses', 'stock_use_lines'].every((table) => scopedAudit.some(({ table_name: name }) => name === table)), 'ضابط: المحصور يقرأ تدقيق صرف مخزنه');

  // ── 0011: نسخة الأمين للتصحيح من استلام ملغى (10 لترات بـ8,000، خصم 500، مدفوع 1,000 وتحميل 300 من الصندوق) كنسخة المدير:
  // صفوف المبالغ تُنسخ، والجواب وإعادته بنفس المرجع يسمّيان المدفوع وتحميل الصندوق داخل money (0034) ─────────────────────────
  const supplier = await S.one(U.accountant, "insert into public.parties (name, is_supplier) values ('مورّد الإخفاء', true) returning id");
  const leakBox = await S.one(U.accountant, "insert into public.cash_accounts (name, kind) values ('صندوق الإخفاء', 'cash') returning id");
  const priced = await postedReceipt(db, {
    keeper: U.storekeeper, pricer: U.manager, wh: W.general, party: supplier, on: TODAY, lines: [{ item: I.diesel, qty: 10 }], totals: [8000],
    discount: 500, paid: 1000, box: leakBox, charges: [{ label: 'نقل', amount: 300, by: 'value', box: leakBox }],
  });
  await S.one(U.manager, "select public.void_receipt($1, 'نسخة الإخفاء', gen_random_uuid()) ->> 'status'", [priced.id]);
  const COPY = 'select public.copy_doc_to_draft($1, $2, $3, $4)';
  const copyId = uid();
  const copyRef = uid();
  const copied = (await call(db, U.storekeeper, COPY, ['receipt', priced.id, copyId, copyRef])).value;
  const again = (await call(db, U.storekeeper, COPY, ['receipt', priced.id, copyId, copyRef])).value;
  const copiedMoney = (await db.admin(
    'select (select count(*) from public.receipt_line_amounts where doc_id = $1) + (select count(*) from public.receipt_amounts where doc_id = $1) + (select count(*) from public.receipt_charges where doc_id = $1) as n',
    [copyId],
  )).rows[0].n;
  t.same([moneyKeys(copied), moneyKeys(again), copied?.skipped, copied?.money, Number(copiedMoney)], [['.money'], ['.money'], [], { skipped: ['paid_now', 'box_charge'] }, 2], 'نسخة الأمين من استلام ملغى بصفوف مبالغها، وجوابها وإعادته يسمّيان المدفوع وتحميل الصندوق داخل money');
  t.same(again, copied, 'إعادة نسخة الأمين بنفس المرجع نفس الجواب');
  const managerId = uid();
  const managerRef = uid();
  const managerCopy = (await call(db, U.manager, COPY, ['receipt', priced.id, managerId, managerRef])).value;
  t.same([managerCopy?.skipped, managerCopy?.money, moneyKeys(managerCopy)], [[], { skipped: ['paid_now', 'box_charge'] }, ['.money']], 'ضابط: نسخة المدير تسمّي المدفوع وتحميل الصندوق داخل money (رمزان بلا مبلغ)');
  // R-DB-3: المدير ينزل أميناً (المالك) بعد النسخة، ويعيد بنفس المرجع (ref_claim قبل أي فحص دور أو نطاق): القناع بالإعادة بجواب من يسأل
  // الآن (private.mask)، والأمين يرى المال منذ 0034، فالجواب كجوابه الأوّل؛ وبعدها يرجع مديراً.
  await S.one(U.owner, 'select public.set_member_role($1, $2)::text', [S.members.manager, 'storekeeper']);
  const demoted = await call(db, U.manager, COPY, ['receipt', priced.id, managerId, managerRef]);
  const cost = (await call(db, U.manager, 'select public.can_see_cost()')).value;
  await S.one(U.owner, 'select public.set_member_role($1, $2)::text', [S.members.manager, 'manager']);
  t.same(
    [cost, demoted.ok, demoted.value?.id, JSON.stringify(demoted.value ?? null).includes('paid_now'), JSON.stringify(demoted.value ?? null).includes('box_charge'), moneyKeys(demoted.value)],
    [true, true, managerId, true, true, ['.money']],
    'R-DB-3: إعادة النسخة بنفس المرجع بعد ما نزل المدير أميناً: نفس الورقة بـpaid_now وbox_charge داخل money (الأمين يرى المال)',
  );

  // ── 0013: سجلّ شراء المادّة وبطاقات المخازن بـmoney لكلّ دور (private.mask لا يحجب عضواً منذ 0034) ─────────────────────
  // استلام مرحَّل 20 لتراً من «مورّد الإخفاء» بفاتورة 17,000 وخصم 1,000 وتحميل 500 بالقيمة من الصندوق: السطر واحد فحصّته كلّ
  // المبلغ، فقيمة الدفعة = 17,000 − 1,000 + 500 = 16,500.00 وسعر الوحدة 16,500 ÷ 20 = 825.00. والأمين والمشاهد يرون مفاتيح المدير نفسها.
  await postedReceipt(db, {
    keeper: U.storekeeper, pricer: U.manager, wh: W.general, party: supplier, on: TODAY,
    lines: [{ item: I.diesel, qty: 20 }], totals: [17000], discount: 1000,
    charges: [{ label: 'نقل الإخفاء', amount: 500, by: 'value', box: leakBox }],
  });
  const STORES = [
    ['item_purchases', 'select public.item_purchases($1, $2, null, 50)', [I.diesel, W.general]],
    ['item_purchases(كل المخازن)', 'select public.item_purchases($1, null, null, 50)', [I.diesel]],
    ['stores_overview', 'select public.stores_overview()', []],
    // 0014: قائمة المخزن ودفتر المادّة صار فيهما money (قيمة المتاح وسعر البيع وقيمة الحركة)، فالقناع عليهما هم.
    ['stock_on_hand', 'select public.stock_on_hand($1, null, 50)', [W.general]],
    ['item_moves_qty', 'select public.item_moves_qty($1, $2, null, 50)', [I.diesel, W.general]],
  ];
  const storeKeys = {};
  for (const [role, user] of Object.entries({ manager: U.manager, storekeeper: U.storekeeper, viewer: U.viewer })) {
    storeKeys[role] = [];
    for (const [fn, sql, params] of STORES) {
      const result = await call(db, user, sql, params);
      if (!result.ok) storeKeys[role].push(`${fn}: ${result.code}`);
      else storeKeys[role].push(...moneyKeys(result.value).map((key) => `${fn}${key}`));
    }
  }
  t.ok(storeKeys.manager.length > 5, `ضابط: المدير يرى money في ${storeKeys.manager.length} موضعاً`);
  t.same([storeKeys.storekeeper, storeKeys.viewer], [storeKeys.manager, storeKeys.manager], 'الأمين والمشاهد: مفاتيح money نفسها في item_purchases وstores_overview وstock_on_hand وitem_moves_qty');
  const managerBuy = (await call(db, U.manager, 'select public.item_purchases($1, $2, null, 50)', [I.diesel, W.general])).value;
  const keeperBuy = (await call(db, U.storekeeper, 'select public.item_purchases($1, $2, null, 50)', [I.diesel, W.general])).value;
  const managerCards = (await call(db, U.manager, 'select public.stores_overview()')).value;
  const keeperCards = (await call(db, U.storekeeper, 'select public.stores_overview()')).value;
  t.same(
    [managerBuy.rows.length, managerBuy.rows[0].money.invoice_total, managerBuy.rows[0].money.landed_value, managerBuy.rows[0].money.unit_cost,
      keeperBuy.rows.length, keeperBuy.rows[0].party_name === managerBuy.rows[0].party_name, keeperBuy.rows[0].qty_in === managerBuy.rows[0].qty_in,
      managerCards.rows.find((r) => r.id === W.general).money.stock_value !== undefined,
      keeperCards.rows.find((r) => r.id === W.general).items_count === managerCards.rows.find((r) => r.id === W.general).items_count],
    [1, '17000', '16500.00', '825.00', 1, true, true, true, true],
    'المدير يرى الفاتورة والقيمة المحمّلة وسعر الوحدة وقيمة المخزن، والأمين يرى نفس الصفوف ومورّدها وكميتها وأعداد بطاقته',
  );

  // ── 0014: سعر البيع والربح المتوقّع لكلّ دور (0034)، والبيان للكلّ ─────────────────────────────────────────────────
  // الأمين يقرأ سعر البيع من الجدول ومن القارئين ويكتبه (بمعاملة ترجع هنا)، والبيان نفسه للطرفين.
  await db.asUser(U.manager, (q) => q('select public.set_item_sell_price($1, 2000, null)', [I.diesel]), { commit: true });
  const keeperPrice = await call(db, U.storekeeper, 'select count(*)::int as v from public.item_prices', []);
  const managerPrice = await call(db, U.manager, 'select count(*)::int as v from public.item_prices', []);
  const keeperWrite = await call(db, U.storekeeper, 'select public.set_item_sell_price($1, 3000, 2000)', [I.diesel], { commit: false });
  const keeperBoard = (await call(db, U.storekeeper, 'select public.stock_on_hand($1, null, 50)', [W.general])).value;
  const managerBoard = (await call(db, U.manager, 'select public.stock_on_hand($1, null, 50)', [W.general])).value;
  const keeperLedger = (await call(db, U.storekeeper, 'select public.item_moves_qty($1, $2, null, 50)', [I.diesel, W.general])).value;
  const managerLedger = (await call(db, U.manager, 'select public.item_moves_qty($1, $2, null, 50)', [I.diesel, W.general])).value;
  const dieselRow = (board) => board.rows.find((r) => r.item_id === I.diesel);
  t.same(
    [keeperPrice.value, keeperWrite.ok, dieselRow(keeperBoard).money, dieselRow(managerBoard).money.sell_price,
      keeperBoard.money, managerBoard.money.sale_value !== undefined, keeperLedger.rows[0].memo === managerLedger.rows[0].memo, keeperLedger.rows[0].money],
    [managerPrice.value, true, dieselRow(managerBoard).money, '2000', managerBoard.money, true, true, managerLedger.rows[0].money],
    'سعر البيع: الأمين يرى صفّه ويكتبه، وقائمته ودفتره بمال المدير نفسه (السعر وقيمة البيع وقيمة الحركة)، والبيان نفسه للطرفين',
  );

  // ── 0028: لقطة الإغلاق والفاتورة والتذكرة والعدد لكلّ دور (0034) ───────────────────────────────────────────────────────
  // فوج في «حقل الأمل» (1,000 طير قبل ثلاثة أيّام) صُرف له 10 كغم «علف بادئ» من «مخزن حقل 1»، وتذكرة بمئة طير فوترت بالدين لـ«تاجر الإخفاء»، ثمّ
  // أُغلقت الدورة اليوم بفرق العدّ وإرجاع 4 كغم إلى المخزن. عامل القاعة والأمين والمشاهد والمحاسب (بصفوف نطاق قديمة) يقرؤون ما يقرؤه المالك.
  const farmSite = (await db.admin("select id from public.sites where org_id = $1 and name = 'حقل الأمل'", [S.org])).rows[0].id;
  await postedOpening(db, U.manager, W.farm1, GO_LIVE, [{ item: I.feed, qty: 100, value: '60000.00' }]);
  const leakHall = await S.one(U.owner, "insert into public.halls (site_id, name) values ($1, 'قاعة الإخفاء') returning id", [farmSite]);
  const leakFlock = await S.one(U.manager, "select public.open_flock($1, '2026-10-27', 1000, 0, null, gen_random_uuid()) ->> 'flock_id'", [leakHall]);
  await S.one(U.manager, 'select public.record_flock_issue(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), $1, $2, 10, $3, $4)', [leakFlock, I.feed, TODAY, W.farm1]);
  const leakTicket = id(900);
  await S.one(U.manager, 'select public.save_weigh_ticket($1, null, $2::jsonb)', [leakTicket, JSON.stringify({ site_id: farmSite, on_date: TODAY, method: 'scale',
    empty_kg: '7000', empty_with_crates: false, crate_kg: '6', stops: [{ id: id(901), hall_id: leakHall, birds: 100, crates: 10, gross_kg: '7300', weighings: [] }] })]);
  await S.one(U.manager, 'select public.finish_weigh_ticket(gen_random_uuid(), $1, 1)', [leakTicket]);
  const leakTrader = await S.one(U.owner, "insert into public.parties (name, is_customer) values ('تاجر الإخفاء', true) returning id");
  const leakSale = await S.one(U.manager, "select public.record_bird_sale(gen_random_uuid(), gen_random_uuid(), $1, 2, $2, 2750, 0, 0, null, null) ->> 'id'", [leakTicket, leakTrader]);
  await S.one(U.manager, `select public.close_flock(gen_random_uuid(), gen_random_uuid(), $1, $2, 900, 100, jsonb_build_array(jsonb_build_object('item_id', $3::uuid, 'qty', '10')),
    'بيعت خارج النظام', jsonb_build_array(jsonb_build_object('item_id', $3::uuid, 'qty', '4', 'action', 'return', 'warehouse_id', $4::uuid)), null,
    public.flock_close_form($1) ->> 'plan')::text`, [leakFlock, TODAY, I.feed, W.farm1]);
  const BIRD_ROLES = { hallWorker: U.hallWorker, storekeeper: U.storekeeper, viewer: U.viewer, accountant: U.accountant, owner: U.owner, manager: U.manager };
  const birdRows = {};
  for (const [role, user] of Object.entries(BIRD_ROLES)) {
    birdRows[role] = await db.asUser(user, async (q) => {
      const n = async (table) => (await q(`select count(*)::int as n from public.${table}`)).rows[0].n;
      return { values: await n('flock_close_values'), sales: await n('bird_sales'), sources: await n('bird_sale_sources'), tickets: await n('weigh_tickets'),
        stops: await n('weigh_ticket_stops'), counts: await n('flock_counts'), closes: await n('flock_closes') };
    });
  }
  const outside = { values: 0, sales: 0, sources: 0, tickets: 0, stops: 0, counts: 0, closes: 0 };
  const inside = { values: 1, sales: 1, sources: 1, tickets: 1, stops: 1, counts: 2, closes: 1 };
  t.same(birdRows, Object.fromEntries(Object.keys(BIRD_ROLES).map((role) => [role, inside])), 'لقطة الإغلاق والفاتورة وإيرادها والتذكرة والعدد والإغلاق لكلّ دور كالمالك');
  t.ok(Object.values(outside).every((n) => n === 0), 'ضابط: الصفر شكل «لا يرى شيئاً» (لمن ليس عضواً، role-matrix)');
  const workerForm = await call(db, U.hallWorker, 'select public.flock_close_form($1)', [leakFlock]);
  const workerReport = await call(db, U.hallWorker, 'select public.flock_cycle_report($1)', [leakFlock]);
  const workerTicket = await call(db, U.hallWorker, 'select public.weigh_ticket($1)', [leakTicket]);
  const workerTickets = await call(db, U.hallWorker, "select public.weigh_tickets('2026-10-01', '2026-10-31', 'all')");
  const workerSale = await call(db, U.hallWorker, 'select public.bird_sale_detail($1)', [leakSale]);
  const workerSales = await call(db, U.hallWorker, 'select public.flock_sales($1)', [leakFlock]);
  const managerForm = (await call(db, U.manager, 'select public.flock_close_form($1)', [leakFlock])).value;
  const managerReport = (await call(db, U.manager, 'select public.flock_cycle_report($1)', [leakFlock])).value;
  const managerTickets = (await call(db, U.manager, "select public.weigh_tickets('2026-10-01', '2026-10-31', 'all')")).value;
  t.same(
    [moneyKeys(workerForm.value), moneyKeys(workerReport.value), moneyKeys(workerTicket.value), workerTickets.value.rows[0].sale?.id, workerSale.ok, JSON.stringify(workerSales.value) === JSON.stringify((await call(db, U.manager, 'select public.flock_sales($1)', [leakFlock])).value),
      workerReport.value.close?.status, workerTickets.value.rows[0].ticket_no === managerTickets.rows[0].ticket_no,
      moneyKeys(managerForm).length > 0, moneyKeys(managerReport).length > 0, managerTickets.rows[0].sale?.id === leakSale],
    [moneyKeys(managerForm), moneyKeys(managerReport), moneyKeys((await call(db, U.manager, 'select public.weigh_ticket($1)', [leakTicket])).value), leakSale, true, true, 'closed', true, true, true, true],
    'عامل القاعة: شاشة الإغلاق وتقرير الدورة المغلقة والتذكرة بمال المدير نفسه، وقائمة التذاكر بفاتورتها، وتفصيل الفاتورة وبطاقة البيع بمالهما',
  );
}
