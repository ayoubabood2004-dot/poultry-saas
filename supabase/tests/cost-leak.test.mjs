// إخفاء الكلف بالمخزون (FOUNDATION ٤٤١–٤٤٧، ٨٦١؛ الخطّة §2.8، WP4، R6): الأدوار بلا كلفة تقرأ صفر صفوف من الدفعات والحركات
// والأرصدة وسطور الافتتاح (حتى والمخزن بنطاقها)، وقراءات الكميات بلا money ولا قيمة لأي دور، وقراءات القيم ترفض forbidden لغير
// أدوار الحسابات، ومعاينة الأمين وترحيله وإعادته بنفس المرجع بلا money، والتلميح بكميات بلا قيم؛ وسجلّ التدقيق والجداول للمدير
// المحصور بمخزن: صفوف مخزنه بس (audit_log_stock_scope). وWP5: المصاريف وكلف الجرد صفر صفوف لغير أدوار الكلفة، ومعاينة الصرف
// وترحيله وإعادته وتسليم الجرد بلا money للأمين، والمراجعة والتقرير forbidden له، والمحصور بمخزن يقرأ مصاريف وحدته بس (وسجلّها).
import { call, uid } from './ledger-kit.mjs';
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

  // ── الجداول: صفر صفوف لكل دور بلا كلفة، والمخزن بنطاقه (الأمين والمشاهد بنطاق العامّ) ──────────────────────────────
  const NO_COST = { storekeeper: U.storekeeper, viewer: U.viewer, millOperator: U.millOperator, hallWorker: U.hallWorker, hatcheryKeeper: U.hatcheryKeeper };
  const TABLES = ['stock_lots', 'stock_moves', 'stock_balances', 'opening_lines', 'audit_log'];
  const counts = {};
  for (const [role, user] of Object.entries(NO_COST)) {
    counts[role] = await db.asUser(user, async (q) => {
      const out = {};
      for (const table of TABLES) out[table] = (await q(`select count(*)::int as n from public.${table}`)).rows[0].n;
      return out;
    });
  }
  t.same(counts, Object.fromEntries(Object.keys(NO_COST).map((role) => [role, Object.fromEntries(TABLES.map((table) => [table, 0]))])), 'بلا كلفة: صفر صفوف من الدفعات والحركات والأرصدة وسطور الافتتاح والسجلّ');
  const managerSees = await db.asUser(U.manager, async (q) => (await q('select count(*)::int as n from public.stock_lots')).rows[0].n);
  t.ok(managerSees >= 3, `ضابط: المدير يقرأ الدفعات (${managerSees})`);
  const headers = await db.asUser(U.storekeeper, async (q) => [(await q('select count(*)::int as n from public.opening_docs')).rows[0].n, (await q('select count(*)::int as n from public.transfers')).rows[0].n]);
  t.same(headers, [1, 1], 'الأمين يقرأ رأس افتتاح مخزنه وتحويله (بلا قيم)، مو الأدوية');

  // ── قراءات الكميات بلا money لأي دور، والقيم forbidden لغير الحسابات ──────────────────────────────────────────
  const QTY = [
    ['stock_on_hand', 'select public.stock_on_hand($1, null, 50) as v', [W.general]],
    ['item_lots_qty', 'select public.item_lots_qty($1, $2, null, 50) as v', [I.diesel, W.general]],
    ['item_moves_qty', 'select public.item_moves_qty($1, $2, null, 50) as v', [I.diesel, W.general]],
  ];
  const leaks = [];
  for (const user of [U.owner, U.manager, U.accountant, U.storekeeper, U.viewer]) {
    for (const [fn, sql, params] of QTY) {
      const result = await call(db, user, sql, params);
      if (!result.ok) leaks.push(`${fn}: ${result.code}`);
      else leaks.push(...moneyKeys(result.value).map((key) => `${fn}${key}`));
    }
  }
  t.same(leaks, [], 'stock_on_hand وitem_lots_qty وitem_moves_qty بلا money ولا قيمة لكل دور');
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
    { ...Object.fromEntries(Object.keys(NO_COST).map((role) => [role, ['forbidden', 'forbidden', 'forbidden']])), manager: ['ok', 'ok', 'ok'], accountant: ['ok', 'ok', 'ok'] },
    'stock_values وstock_value_totals وitem_lots_value: forbidden لكل دور بلا كلفة، وأدوار الحسابات تقرأ',
  );

  // ── معاينة الأمين وترحيله وإعادته بنفس المرجع بلا money ────────────────────────────────────────────────────────
  const draft = await transferDraft(db, U.storekeeper, W.general, W.raw, TODAY, [{ item: I.diesel, qty: 50 }]);
  const preview = (await call(db, U.storekeeper, 'select public.preview_transfer($1)', [draft.id])).value;
  const ref = uid();
  const posted = (await call(db, U.storekeeper, 'select public.post_transfer($1, $2, public.preview_transfer($1) ->> \'plan\', $3)', [draft.id, draft.version, ref])).value;
  const replay = (await call(db, U.storekeeper, 'select public.post_transfer($1, $2, public.preview_transfer($1) ->> \'plan\', $3)', [draft.id, draft.version, ref])).value;
  t.same([moneyKeys(preview), moneyKeys(posted), moneyKeys(replay)], [[], [], []], 'معاينة الأمين وترحيله وإعادته بنفس المرجع: ولا مفتاح money');
  t.same(replay, posted, 'الإعادة بنفس المرجع نفس النتيجة المخفية');
  const managerPreview = (await call(db, U.manager, 'select public.preview_transfer($1)', [(await transferDraft(db, U.manager, W.general, W.raw, TODAY, [{ item: I.diesel, qty: 10 }])).id])).value;
  t.eq(managerPreview.lines[0].money.value, '8000.00', 'ضابط: معاينة المدير بقيمتها (10 لترات بـ8,000.00)');

  // ── التلميح بكميات بلا قيم ───────────────────────────────────────────────────────────────────────────────
  const short = await call(db, U.storekeeper, 'select public.post_transfer($1, $2, public.preview_transfer($1) ->> \'plan\', gen_random_uuid())', Object.values(await transferDraft(db, U.storekeeper, W.general, W.raw, TODAY, [{ item: I.diesel, qty: 5000 }])).slice(0, 2));
  t.ok(!short.ok && short.code === 'insufficient_stock' && /850 لتراً/u.test(short.hint), `رفض النقص يسمّي الكمية (${short.hint})`);
  t.same(['800', '800,000', '680,000', '680000'].filter((value) => short.hint.includes(value)), [], 'ولا قيمة بالتلميح');

  // ── WP5: الصرف والجرد للأمين بلا money، والمصاريف وكلف الجرد لأدوار الكلفة بس ───────────────────────────────────────
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
  t.same([moneyKeys(usePreview), moneyKeys(usePosted), moneyKeys(useReplay)], [[], [], []], 'معاينة الصرف للأمين وترحيله وإعادته بنفس المرجع: ولا مفتاح money');
  t.same(useReplay, usePosted, 'إعادة الصرف بنفس المرجع نفس النتيجة المخفية');
  const managerUse = (await call(db, U.manager, 'select public.preview_stock_use($1)', [(await useDraft(U.manager, W.general, I.diesel, 10)).id])).value;
  t.eq(managerUse.money.total, '8000.00', 'ضابط: معاينة صرف المدير بقيمتها (10 لترات بـ8,000.00)');
  const tooMuch = await useDraft(U.storekeeper, W.general, I.diesel, 5000);
  const useShort = await call(db, U.storekeeper, POST_USE, [tooMuch.id, tooMuch.version, uid()]);
  t.ok(!useShort.ok && useShort.code === 'insufficient_stock' && /830 لتراً/u.test(useShort.hint) && !/664/u.test(useShort.hint), `رفض نقص الصرف بالكمية بلا قيمة (${useShort.hint})`);
  // جرد بنقص لتر (800.00 «فرق جرد»): الأمين يسلّم بلا كميات الدفتر، والمراجعة له forbidden.
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
    [['id', 'kind', 'status', 'version'], 'forbidden', 'forbidden'],
    'تسليم الأمين بلا كميات الدفتر ولا قيم، ومعاينة الجرد وترحيله forbidden له',
  );
  await S.one(U.manager, "update public.stock_count_lines set reason = 'لتر ناقص' where id = $1 returning id", [count.lineId]);
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
    wp5Counts[role].report = (await call(db, user, "select public.report_expenses('2026-10-01', null, null, null, 50)")).code;
  }
  t.same(
    wp5Counts,
    Object.fromEntries(Object.keys(NO_COST).map((role) => [role, { expenses: 0, stock_count_line_costs: 0, report: 'forbidden' }])),
    'بلا كلفة: صفر صفوف من المصاريف وكلف الجرد (والأمين بنطاق مخزنها)، وتقرير المصاريف forbidden',
  );
  const managerWp5 = await db.asUser(U.manager, async (q) => [(await q('select count(*)::int as n from public.expenses')).rows[0].n, (await q('select count(*)::int as n from public.stock_count_line_costs')).rows[0].n]);
  t.same(managerWp5, [3, 1], 'ضابط: المدير يقرأ المصاريف الثلاثة (صرفان وجرد) وصفّ كلفة الجرد');
  const home = (await call(db, U.storekeeper, 'select public.home_summary()')).value;
  t.same(moneyKeys(home), [], 'الواجهة الرئيسية للأمين بلا money');
  // المحصور بمخزن الأدوية ما يقرأ مصاريف (E40: in_scope_division بمعناه، والمصروف بيانات وحدة)، والمحاسب المحصور بوحدة الأدوية
  // يقرأ مصاريفها بس وسجلّ تدقيقها.
  const medicineDivision = (await db.admin('select division_id from public.warehouses where id = $1', [W.medicine])).rows[0].division_id;
  await S.one(U.owner, "select public.set_member_scopes_v2($1, array[$2]::uuid[], '{}', '{}')", [S.members.accountant, medicineDivision]);
  const expensesSeen = (user) => db.asUser(user, async (q) => ({
    rows: (await q('select distinct division_id from public.expenses')).rows.map((r) => r.division_id),
    audit: (await q("select distinct (coalesce(new, old) ->> 'division_id') as d from public.audit_log where table_name = 'expenses'")).rows.map((r) => r.d),
  }));
  t.same(
    [await expensesSeen(U.scopedManager), await expensesSeen(U.accountant)],
    [{ rows: [], audit: [] }, { rows: [medicineDivision], audit: [medicineDivision] }],
    'المدير المحصور بمخزن الأدوية بلا مصاريف (E40)، والمحاسب المحصور بوحدة الأدوية مصاريفها وسجلّ تدقيقها بس',
  );

  // ── المدير المحصور بمخزن الأدوية: الدفعات وسجلّ التدقيق لمخزنه بس (E49 للمخزون) ─────────────────────────────────
  const scoped = await db.asUser(U.scopedManager, async (q) => ({
    lots: (await q('select distinct warehouse_id from public.stock_lots')).rows.map((r) => r.warehouse_id),
    audit: (await q("select distinct (coalesce(new, old) ->> 'warehouse_id') as w from public.audit_log where table_name in ('stock_lots', 'stock_moves', 'stock_balances', 'opening_lines')")).rows.map((r) => r.w),
  }));
  t.same(scoped, { lots: [W.medicine], audit: [W.medicine] }, 'المدير المحصور بالأدوية: دفعاتها وسجلّ تدقيقها بس');
  const full = await db.asUser(U.manager, async (q) => (await q("select count(distinct (coalesce(new, old) ->> 'warehouse_id'))::int as n from public.audit_log where table_name in ('stock_lots', 'stock_moves', 'stock_balances', 'opening_lines')")).rows[0].n);
  t.ok(full >= 3, `ضابط: المدير بلا نطاق يقرأ سجلّ كل المخازن (${full})`);
  // كل جدول قراءته محصورة بالمخزن (سياسة select بـin_scope_wh، من الكتالوج فجدول جديد يدخل وحده) سجلّ تدقيقه محصور مثله: سطر
  // التدقيق يحمل الصفّ كلّه (E49)، فرأس الافتتاح والتحويل وسطره (المخزنان والتاريخ والرقم والكمية) ما يطلعون للمحصور برّا نطاقه.
  const scopedTables = (await db.admin("select distinct tablename from pg_policies where schemaname = 'public' and cmd = 'SELECT' and qual like '%in_scope_wh%' order by 1")).rows.map((r) => r.tablename);
  t.ok(
    ['opening_docs', 'opening_lines', 'stock_lots', 'transfer_lines', 'transfers', 'stock_uses', 'stock_use_lines', 'stock_counts', 'stock_count_lines', 'stock_count_line_costs'].every((table) => scopedTables.includes(table)),
    `الجداول المحصورة بالمخزن من الكتالوج (${scopedTables.join('، ')})`,
  );
  const auditOf = (user) => db.asUser(user, async (q) => (await q('select table_name, coalesce(new, old) as r from public.audit_log where table_name = any ($1)', [scopedTables])).rows);
  const stores = (r) => [r.warehouse_id, r.from_warehouse_id, r.to_warehouse_id].filter(Boolean);
  const scopedAudit = await auditOf(U.scopedManager);
  t.same(
    [...new Set(scopedAudit.filter(({ r }) => !stores(r).includes(W.medicine)).map(({ table_name: table }) => table))],
    [],
    'المدير المحصور بالأدوية: ولا سطر تدقيق لجدول محصور برّا مخزنه (رأس الافتتاح والتحويل وسطره هم)',
  );
  t.ok(scopedAudit.some(({ table_name: table }) => table === 'opening_docs'), 'ضابط: المحصور يقرأ تدقيق رأس افتتاح مخزنه');
  const fullAudit = await auditOf(U.manager);
  t.ok(
    ['transfers', 'transfer_lines', 'opening_docs', 'stock_uses', 'stock_use_lines', 'stock_counts', 'stock_count_lines', 'stock_count_line_costs'].every((table) => fullAudit.some(({ table_name: name, r }) => name === table && !stores(r).includes(W.medicine))),
    'ضابط: المدير بلا نطاق يقرأ تدقيق التحويل والصرف والجرد وسطورها ورأس الافتتاح بكل المخازن',
  );
  t.ok(['stock_uses', 'stock_use_lines'].every((table) => scopedAudit.some(({ table_name: name }) => name === table)), 'ضابط: المحصور يقرأ تدقيق صرف مخزنه');
}
