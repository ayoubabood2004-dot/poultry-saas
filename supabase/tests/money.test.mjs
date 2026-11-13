// «المال بين يديك» (0024؛ كلمة المالك 2026-11-10 وأجوبته: دينار فقط، وبلا آجال، والاستحقاق، والدفتر من أوّل يوم؛ docs/plans/accounting.md §8.1):
// خلاصة المال (money_overview)، وحركة الأموال ويومية الصندوق (money_moves)، وقائمة الذمم بالأعمار (debts_overview)، والكشف الاحترافي
// بتفصيل المستندات وتوزيعاتها (party_statement_v2)، والسندات (voucher_detail وtransfer_detail)، وخلاصة الشهر التشغيلية (month_summary)،
// والنقد في بطاقة الرئيسية، وأمين المخزن يضيف الزبون (#58)؛ كلّ رقم يقارَن بحساب مستقلّ من الجداول نفسها، والنطاق بمحاسب محصور،
// والثوابت صفر ثمّ كلّ ثابت يمسك خرقه وحده، وطفرات تكسر كلّ قاعدة فيفشل فحصها.
// العيّنات الحقيقية لفحوص الشاشات: MONEY_SAMPLES_DIR=scripts/tests/fixtures node supabase/tests/run.mjs money ← money-a.json وmoney-b.json.
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { postedReceipt } from './receipt-kit.mjs';
import { postedReturn } from './return-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/**
 * محلّلات الشاشات الحقيقية لأجوبة 0024 (درس 2026-11-02): المصدر نفسه محزوماً بـesbuild، لا نسخة منه؛ والجلسة والإشعار بديلان
 * لا يُستعملان هنا (كما في mill3.test).
 */
async function screens() {
  const STUBS = {
    session: 'export const useSession = () => ({ status: "loading" }); export const sessionStore = { get: () => ({ status: "loading" }) };',
    Toast: 'export const toast = () => {}; export function Toaster() { return null; }',
  };
  const result = await build({
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
    jsx: 'automatic',
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
    stdin: {
      contents: [
        "export { parseMoneyOverview, parseMoneyMoves, parseMonthSummary } from './src/lib/repo/money.ts';",
        "export { parseDebtsOverview } from './src/lib/repo/debts.ts';",
        "export { parsePartyStatement, parseVoucher, parseTransfer, parseSaleDoc } from './src/lib/repo/statement.ts';",
        "export { parseCashStatement } from './src/lib/repo/cash.ts';",
        "export { parseHomeSummary } from './src/lib/repo/home.ts';",
      ].join('\n'),
      resolveDir: ROOT,
      loader: 'tsx',
    },
    plugins: [
      {
        name: 'money-stubs',
        setup(b) {
          b.onResolve({ filter: /\/lib\/session$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'money-stub' }));
          b.onLoad({ filter: /.*/, namespace: 'money-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
/** فلس من نصّ دينار بمرتبتين ("12500.5" ← 1250050n). */
const filsText = (text) => {
  const negative = String(text).startsWith('-');
  const [whole, frac = ''] = String(text).replace('-', '').split('.');
  const v = BigInt(whole) * 100n + BigInt((frac + '00').slice(0, 2));
  return negative ? -v : v;
};

const TODAY = '2026-11-10';
const id = (n) => `d2400000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477099990${String(n).padStart(2, '0')}`;
const day = (offset) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
/** نصّ رقميّ بلا أصفار عشرية زائدة («12500.00» ← «12500»)، وnull كما هو. */
const norm = (value) => {
  if (value === null || value === undefined) return value;
  const text = String(value);
  return text.includes('.') ? text.replace(/0+$/u, '').replace(/\.$/u, '') : text;
};
const num = (value) => Number(value);

const SQL = {
  overview: 'select public.money_overview() as v',
  moves: 'select public.money_moves($1, $2, $3, $4, $5, $6::jsonb, $7) as v',
  debts: 'select public.debts_overview($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9) as v',
  statement: 'select public.party_statement_v2($1, $2, $3, $4) as v',
  voucher: 'select public.voucher_detail($1) as v',
  transfer: 'select public.transfer_detail($1) as v',
  month: 'select public.month_summary($1) as v',
  home: 'select public.home_summary() as v',
  verify: 'select check_name, violations::int as v from public.verify_money()',
};
const FN = {
  open: 'private.open_entries(uuid)',
  moves: 'public.money_moves(date, date, uuid, text, uuid, jsonb, integer)',
  debts: 'public.debts_overview(text, uuid, uuid, text, text, numeric, boolean, jsonb, integer)',
  alloc: 'private.entry_allocations(uuid)',
  detail: 'private.entry_detail(uuid)',
  overview: 'public.money_overview()',
  statement: 'public.party_statement_v2(uuid, uuid, date, date)',
  transfer: 'public.transfer_detail(uuid)',
};
const MONEY_ZERO = {
  // 0028: bird_sale_detail_total (فاتورة الطيور = قيدها) بترتيب الثابت؛ ضابطه في birds.test، فهذا الملف بلا فاتورة طيور.
  open_both_sides: 0, purchase_detail_total: 0, sale_detail_total: 0, bird_sale_detail_total: 0, return_detail_total: 0, charge_entry_total: 0, voucher_numbers: 0,
  money_formulas: 0,
};

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const G = await makeOrg(db, {
    name: 'منشأة المال',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['accountant', 'accountant'],
      ['storekeeper', 'storekeeper', ['feed_mill']],
      ['viewer', 'viewer', ['feed_mill']],
      ['accountantGeneral', 'accountant', ['general']],
      ['accountantBroiler', 'accountant', ['broiler']],
    ],
  });
  const { users: U, org, books: BK, divisions: DV } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const read = (user, sql, params) => call(db, user, sql, params, { commit: false });
  const value = async (user, sql, params) => {
    const result = await read(user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const at = (offset, fn) => db.setToday(day(offset), fn);
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  const item = (name, kind, unit) => one(U.owner, 'insert into public.items (name, kind, base_unit) values ($1, $2, $3) returning id', [name, kind, unit]);
  const I = { corn: await item('ذرة صفراء', 'raw', 'kg'), soy: await item('كسبة صويا', 'raw', 'kg'), fuel: await item('كاز', 'fuel', 'L'), starter: await item('علف بادئ', 'feed', 'kg') };
  const party = (name, tel, customer, supplier) =>
    one(U.owner, 'insert into public.parties (name, phone, is_customer, is_supplier) values ($1, $2, $3, $4) returning id', [name, tel, customer, supplier]);
  const P = {
    S1: await party('مورّد الذرة', '07701234567', false, true),
    S2: await party('ناقل البصرة', null, false, true),
    C1: await party('زبون الدجاج', '07809876543', true, false),
    C2: await party('زبون قديم', null, true, false),
    M: await party('جهة مزدوجة', null, true, true),
  };
  const box = (name, kind) => one(U.owner, 'insert into public.cash_accounts (name, kind) values ($1, $2) returning id', [name, kind]);
  const B = { B1: await box('الصندوق الرئيسي', 'cash'), B2: await box('مصرف الرافدين', 'bank'), B3: await box('محفظة قديمة', 'wallet'), B4: await box('صندوق السيّارة', 'cash') };
  await db.admin('update public.cash_accounts set archived_at = now() where id = $1', [B.B3]);
  const category = (name) => one(U.owner, 'insert into public.expense_categories (name) values ($1) returning id', [name]);
  const CAT = { power: await category('كهرباء'), repair: await category('صيانة'), car: await category('وقود السيّارة') };

  // ── السيناريو: أربعة أشهر من الحركة ────────────────────────────────────────────────────────────────────────────────────────
  const D = {};
  await at(-120, async () => {
    await one(U.owner, 'select public.record_cash_opening(gen_random_uuid(), $1, 5000000, $2, gen_random_uuid())', [B.B1, day(-120)]);
    await one(U.owner, 'select public.record_opening_balance(gen_random_uuid(), $1, $2, 300000, $3, gen_random_uuid())', [P.C2, BK.feed_mill, day(-120)]);
  });
  await at(-60, () => one(U.accountant, 'select public.record_party_payment(gen_random_uuid(), $1, $2, 100000, $3, $4, gen_random_uuid())', [P.C2, BK.feed_mill, B.B1, day(-60)]));
  await at(-45, async () => {
    await one(U.owner, 'select public.record_cash_opening(gen_random_uuid(), $1, 1000000, $2, gen_random_uuid())', [B.B2, day(-45)]);
    await one(U.owner, 'select public.record_opening_balance(gen_random_uuid(), $1, $2, 80000, $3, gen_random_uuid())', [P.M, BK.general, day(-45)]);
    await one(U.owner, 'select public.record_opening_balance(gen_random_uuid(), $1, $2, -60000, $3, gen_random_uuid())', [P.M, BK.feed_mill, day(-45)]);
  });
  D.R1 = await at(-40, () =>
    postedReceipt(db, {
      keeper: U.storekeeper,
      pricer: U.owner,
      wh: W.raw,
      party: P.S1,
      on: day(-40),
      lines: [{ item: I.corn, qty: '2000' }, { item: I.soy, qty: '500' }],
      totals: [900000, 600000],
      discount: 20000,
      paid: 500000,
      box: B.B1,
      charges: [
        { label: 'نقل', amount: 30000, by: 'mass', payee: P.S2 },
        { label: 'تحميل', amount: 10000, by: 'value', box: B.B1 },
      ],
    }),
  );
  D.PY1 = await at(-20, () =>
    one(U.accountant, "select (public.pay_party(gen_random_uuid(), $1, $2, 300000, $3, $4, gen_random_uuid())) ->> 'id'", [P.S1, BK.feed_mill, B.B1, day(-20)]),
  );
  D.RT1 = await at(-10, () =>
    postedReturn(db, { keeper: U.storekeeper, pricer: U.owner, receipt: D.R1.id, on: day(-10), lines: [{ receiptLine: D.R1.lines[0], qty: '100' }], credits: [45000] }),
  );
  D.fuelLine = uid();
  D.fuelReceipt = uid();
  await at(-10, () =>
    one(U.owner, "select public.record_purchase(gen_random_uuid(), $1, $2, $3, $4, $5, 100, null, null, 'credit', null, $6)", [
      D.fuelReceipt, D.fuelLine, I.fuel, P.S1, day(-10), W.general,
    ]),
  );
  D.sale1 = uid();
  await at(-5, async () => {
    await one(U.owner, 'select public.price_purchase(gen_random_uuid(), $1, 1500, null)', [D.fuelLine]);
    await one(U.owner, "select public.record_sale(gen_random_uuid(), $1, gen_random_uuid(), $2, $3, 100, 1000, $4, 'cash', $5, $6)", [D.sale1, P.C1, I.corn, day(-5), B.B1, W.raw]);
  });
  D.sale2 = uid();
  await at(-3, () => one(U.owner, "select public.record_sale(gen_random_uuid(), $1, gen_random_uuid(), $2, $3, 100, 2000, $4, 'credit', null, $5)", [D.sale2, P.C1, I.soy, day(-3), W.raw]));
  // دفعة إنتاج في المعمل (قبل يومين) وصرف علف منها لفوج في حقل اللحم (أمس): لأرقام «الإنتاج» و«الصرف للأفواج» في خلاصة الشهر.
  D.recipe = { id: uid(), version: uid() };
  D.batch = uid();
  await at(-2, async () => {
    const lines = JSON.stringify([{ item_id: I.corn, qty: '600.000', unit: 'kg' }, { item_id: I.soy, qty: '400.000', unit: 'kg' }]);
    await one(U.owner, "select public.create_recipe($1, $2, 'علف بادئ', $3, '1000.000', $4::jsonb, '[]'::jsonb, true) as v", [D.recipe.id, D.recipe.version, I.starter, lines]);
    await one(U.owner, 'select public.create_production($1, $2, 1000, $3, $4, $5) as v', [D.batch, D.recipe.version, W.raw, W.feed, day(-2)]);
    const preview = await one(U.owner, 'select public.preview_production($1) as v', [D.batch]);
    await one(U.owner, 'select public.post_production($1, $2, $3, $4) as v', [D.batch, preview.version, preview.plan_token, uid()]);
  });
  await at(-1, async () => {
    const farm = await one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل الدواجن', 'farm') returning id", [DV.broiler]);
    const hall = await one(U.owner, "insert into public.halls (site_id, name) values ($1, 'قاعة 1') returning id", [farm]);
    D.flock = (await one(U.owner, 'select public.open_flock($1, $2, 5000, 0, null, $3) as v', [hall, day(-1), uid()])).flock_id;
    await one(U.owner, 'select public.record_flock_issue($1, $2, $3, $4, $5, 200, $6, null) as v', [uid(), uid(), uid(), D.flock, I.starter, day(-1)]);
  });
  D.RC1 = await at(-1, () =>
    one(U.accountant, "select (public.record_party_payment(gen_random_uuid(), $1, $2, 150000, $3, $4, gen_random_uuid())) ->> 'id'", [P.C1, BK.feed_mill, B.B1, day(-1)]),
  );
  D.RC2 = await one(U.accountant, "select (public.record_party_payment(gen_random_uuid(), $1, $2, 20000, $3, $4, gen_random_uuid())) ->> 'id'", [P.C1, BK.feed_mill, B.B1, TODAY]);
  await one(U.manager, "select public.void_party_payment($1, 'قبض مكرّر', gen_random_uuid())", [D.RC2]);
  D.RC2rev = await one(U.owner, 'select id from public.party_entries where reverses_entry_id = $1', [D.RC2]);
  const expense = (cat, amount, source, account, partyId, book, note) =>
    one(U.owner, 'select public.record_expense(gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, null, null, null, $9, $10, gen_random_uuid())', [
      cat, DV.general, amount, TODAY, source, account, partyId, book, note, '2026-11-01',
    ]);
  await expense(CAT.power, 75000, 'cash', B.B1, null, null, 'فاتورة تشرين الثاني');
  await expense(CAT.repair, 40000, 'credit', null, P.S2, BK.general, null);
  await expense(CAT.car, 5000, 'cash', B.B4, null, null, null);
  D.T1 = uid();
  D.T2 = uid();
  await one(U.accountant, "select public.transfer_cash($1, $2, $3, 250000, $4, 'إيداع في المصرف', gen_random_uuid())", [D.T1, B.B1, B.B2, TODAY]);
  await one(U.accountant, 'select public.transfer_cash($1, $2, $3, 50000, $4, null, gen_random_uuid())', [D.T2, B.B2, B.B1, TODAY]);
  await one(U.manager, "select public.void_cash_move($1, 'تحويل خاطئ', gen_random_uuid())", [D.T2]);
  await at(1, () => one(U.owner, 'select public.record_opening_balance(gen_random_uuid(), $1, $2, 10000, $3, gen_random_uuid())', [P.C1, BK.feed_mill, day(1)]));
  D.T1in = await one(U.owner, 'select id from public.cash_moves where doc_id = $1 and id <> $1 and reverses_move_id is null', [D.T1]);
  const entryOf = async (sql, params) => one(U.owner, sql, params);
  D.R1purchase = await entryOf("select id from public.party_entries where doc_id = $1 and kind = 'purchase' and party_id = $2", [D.R1.id, P.S1]);
  D.R1payout = await entryOf("select id from public.party_entries where doc_id = $1 and kind = 'payout'", [D.R1.id]);
  D.R1no = await entryOf('select doc_no from public.receipts where id = $1', [D.R1.id]);
  D.sale2no = await entryOf('select doc_no from public.sales_invoices where id = $1', [D.sale2]);

  // ── ثوابت المال صفر بعد السيناريو ────────────────────────────────────────────────────────────────────────────────────────
  const verify = async (q) => Object.fromEntries((await q(SQL.verify)).rows.map((r) => [r.check_name, r.v]));
  t.same(await db.asService(verify), MONEY_ZERO, 'verify_money صفر بعد أربعة أشهر من الشراء والبيع والمرتجع والتسعير والقبض والدفع والإلغاء');

  // ── أ. «خلاصة المال» ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const sumBy = async (sql, params) => Object.fromEntries((await db.admin(sql, params)).rows.map((r) => [r.k, norm(r.v)]));
  const boxBalance = await sumBy('select account_id as k, sum(amount) as v from public.cash_moves where org_id = $1 group by account_id', [org]);
  const O = await value(U.owner, SQL.overview);
  t.same(
    [norm(O.cash.total), O.cash.boxes.map((b) => [b.account_id, norm(b.balance)])],
    [String(Object.values(boxBalance).reduce((s, v) => s + num(v), 0)), [[B.B1, boxBalance[B.B1]], [B.B4, boxBalance[B.B4]], [B.B2, boxBalance[B.B2]]]],
    'أ1 النقد = مجموع حركات الصناديق، وكلّ صندوق برصيده (بالاسم)، والمؤرشف بلا رصيد مخفيّ',
  );
  t.same([boxBalance[B.B1], boxBalance[B.B2], boxBalance[B.B4]], ['4215000', '1250000', '-5000'], 'أ1 الأرصدة كما حُسبت باليد: 4,215,000 و1,250,000 و−5,000');
  t.same([norm(O.debts.receivable), norm(O.debts.payable), norm(O.debts.net)], ['330000', '915000', '-585000'], 'أ2 لنا 330,000 وعلينا 915,000 والصافي −585,000');
  const divSum = (key) => O.debts.divisions.reduce((s, d) => s + num(d[key]), 0);
  t.same([divSum('receivable'), divSum('payable')], [330000, 915000], 'أ2 الأقسام مجموعها = المشروع');
  const cls = Object.fromEntries(O.day.classes.map((c) => [c.class, [norm(c.inflow), norm(c.outflow), c.count]]));
  t.same(cls, { customer_receipt: ['20000', '20000', 2], expense: ['0', '80000', 2], transfer: ['350000', '350000', 6] }, 'أ3 اليوم بأصنافه: القبض وإلغاؤه، والمصروفان، والتحويلان وإلغاء أحدهما');
  t.same([norm(O.day.inflow), norm(O.day.outflow)], ['20000', '100000'], 'أ3 داخل اليوم وخارجه بلا التحويل بين الصناديق');
  t.same(O.day.classes.map((c) => c.class), ['customer_receipt', 'expense', 'transfer'], 'أ3 الأصناف بالترتيب الثابت');
  const salesCost = norm((await db.admin("select sum(c.cost) as v from public.sales_line_costs c join public.sales_invoices s on s.id = c.sale_id where s.org_id = $1 and s.sold_on >= '2026-11-01'", [org])).rows[0].v);
  t.same(
    [O.month.sales.count, norm(O.month.sales.revenue), norm(O.month.sales.cost), norm(O.month.sales.gross)],
    [2, '300000', salesCost, String(300000 - num(salesCost))],
    'أ4 مبيعات الشهر وكلفتها وربحها الإجمالي',
  );
  t.same([O.month.purchases.count, norm(O.month.purchases.total), norm(O.month.purchases.cash), norm(O.month.purchases.credit)], [1, '150000', '0', '150000'], 'أ4 مشتريات الشهر: شراء من الشهر الماضي بلا سعر سُعّر هذا الشهر بـ150,000 بالدين (العدد يعدّه، فلا «صفر مشتريات بـ150,000»)');
  t.same(
    [norm(O.month.expenses.total), O.month.expenses.categories.map((c) => [c.name, norm(c.amount)])],
    ['120000', [['كهرباء', '75000'], ['صيانة', '40000'], ['وقود السيّارة', '5000']]],
    'أ4 مصاريف الشهر بفئاتها من الأكبر',
  );
  t.same([norm(O.month.cash.inflow), norm(O.month.cash.outflow), norm(O.month.cash.net)], ['270000', '100000', '170000'], 'أ4 صافي نقد الشهر بلا التحويل والافتتاح');
  t.same(
    [O.top_receivable.map((r) => [r.party_id, norm(r.amount), r.oldest]), O.top_payable.map((r) => [r.party_id, norm(r.amount)])],
    [
      [[P.C2, '200000', day(-120)], [P.M, '80000', day(-45)], [P.C1, '50000', day(-3)]],
      [[P.S1, '785000'], [P.S2, '70000'], [P.M, '60000']],
    ],
    'أ5 أكبر من لنا وأكبر من علينا بأقدم قيد مفتوح، والجهة المزدوجة في القائمتين (الدفاتر لا تُقاصّ)',
  );
  t.same(
    [O.alerts.negative_boxes.map((b) => [b.account_id, norm(b.balance)]), [O.alerts.old_receivable.parties, norm(O.alerts.old_receivable.amount)],
      [O.alerts.old_payable.parties, norm(O.alerts.old_payable.amount)]],
    [[[B.B4, '-5000']], [1, '200000'], [0, '0']],
    'أ6 التنبيهات: صندوق بالسالب، ودين لنا عمره فوق 90 يوماً',
  );
  const OG = await value(U.accountantGeneral, SQL.overview);
  t.same(
    [norm(OG.debts.receivable), norm(OG.debts.payable), OG.debts.books.visible < OG.debts.books.total, norm(OG.cash.total), OG.top_receivable.map((r) => r.party_id)],
    ['80000', '190000', true, norm(O.cash.total), [P.M]],
    'أ7 المحاسب المحصور بالعامّة: ذمم دفاتر نطاقه وحدها، والنقد للمنشأة كلّها',
  );
  for (const who of ['storekeeper', 'viewer']) t.eq((await read(U[who], SQL.overview)).code, 'forbidden', `أ8 ${who}: الخلاصة ممنوعة`);
  t.eq(norm((await value(U.owner, SQL.home)).accounts.cash_total), norm(O.cash.total), 'أ9 بطاقة الرئيسية: النقد كلّه = خلاصة المال');

  // ── ب. «حركة الأموال» ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const moves = (user, from, to, account, klass, partyId, after, limit) => value(user, SQL.moves, [from, to, account, klass, partyId, after ? JSON.stringify(after) : null, limit]);
  const all = await moves(U.owner, '2026-11-01', TODAY, null, null, null, null, 500);
  const novCount = Number((await db.admin("select count(*) as n from public.cash_moves where org_id = $1 and on_date between '2026-11-01' and $2", [org, TODAY])).rows[0].n);
  const chain = (page, opening) => {
    let running = num(opening);
    for (const row of page.rows) {
      running += num(row.inflow) - num(row.outflow);
      if (num(row.balance) !== running) return `${row.move_id}: ${row.balance} ≠ ${running}`;
    }
    return 'ok';
  };
  t.same(
    [all.rows.length, all.totals.count, all.running, chain(all, all.opening), norm(all.closing)],
    [novCount, novCount, true, 'ok', String(num(all.opening) + num(all.totals.inflow) - num(all.totals.outflow))],
    'ب1 كلّ حركات الشهر بكلّ الصناديق، والرصيد الجاري سلسلة صحيحة من الافتتاح إلى الختام',
  );
  const lastOfDay = Object.fromEntries(all.rows.map((r) => [r.on_date, norm(r.balance)]));
  t.ok(all.days.every((d) => norm(d.closing) === lastOfDay[d.on_date]), 'ب1 ختام كلّ يوم = رصيد آخر حركة فيه');
  const pages = [];
  let after = null;
  let guard = 0;
  do {
    const page = await moves(U.owner, '2026-11-01', TODAY, null, null, null, after, 4);
    pages.push(page);
    after = page.next;
    guard += 1;
  } while (after && guard < 20);
  t.same(
    [pages.flatMap((p) => p.rows.map((r) => [r.move_id, norm(r.balance)])), pages.every((p) => p.totals.count === novCount)],
    [all.rows.map((r) => [r.move_id, norm(r.balance)]), true],
    `ب2 الصفحات (${pages.length}) بالمؤشّر = القائمة كلّها بلا تكرار، والرصيد على المدّة كلّها لا على الصفحة`,
  );
  const boxMoves = await moves(U.owner, day(-40), TODAY, B.B1, null, null, null, 500);
  const cashStatement = await value(U.owner, 'select public.report_cash_statement($1, $2, $3) as v', [B.B1, day(-40), TODAY]);
  t.same(
    [boxMoves.rows.map((r) => [r.move_id, norm(r.balance)]), norm(boxMoves.closing), boxMoves.account.id],
    [cashStatement.lines.map((l) => [l.move_id, norm(l.balance)]), norm(cashStatement.closing), B.B1],
    'ب3 صندوق واحد بترتيب كشف الصندوق وأرصدته وختامه نفسها',
  );
  t.same(
    cashStatement.lines.filter((l) => l.voucher_id !== null).map((l) => [l.kind, l.voucher_id]),
    boxMoves.rows.filter((r) => r.voucher === 'entry').map((r) => [r.kind, r.voucher_id]),
    'ب3 كشف الصندوق يسمّي سند كلّ قبض ودفع (وللإلغاء السند الأصليّ) كحركة الأموال، وغيرهما بلا سند',
  );
  t.ok(cashStatement.lines.some((l) => l.voucher_id === D.RC2 && l.reverses !== null), 'ب3 شرط: إلغاء القبض في كشف الصندوق يفتح سند القبض الأصليّ');
  t.same(cashStatement.lines.filter((l) => l.kind === 'receipt_charge').map((l) => [l.doc_no, l.doc_id]), [[D.R1no, D.R1.id]], 'ب3 أجرة الشراء النقدية في كشف الصندوق برقم شرائها (مراجعة الشاشات L4)');
  const dayBook = await moves(U.owner, TODAY, TODAY, B.B1, null, null, null, 500);
  t.same(
    [norm(dayBook.opening), norm(dayBook.closing), dayBook.days.length, norm(dayBook.days[0].closing)],
    [norm(String(num(boxBalance[B.B1]) - dayBook.rows.reduce((s, r) => s + num(r.inflow) - num(r.outflow), 0))), boxBalance[B.B1], 1, boxBalance[B.B1]],
    'ب3 يومية الصندوق: رصيد أوّل اليوم + الداخل − الخارج = رصيد آخره',
  );
  const receipts = await moves(U.owner, day(-120), TODAY, null, 'customer_receipt', null, null, 500);
  t.same(
    [receipts.running, receipts.opening, receipts.closing, receipts.rows.every((r) => r.balance === null && r.class === 'customer_receipt'), receipts.rows.length],
    [false, null, null, true, 4],
    'ب4 بصنف واحد: لا رصيد جارٍ (القائمة جزء من الصندوق)، والصفوف من صنفها وحده',
  );
  const ofC1 = await moves(U.owner, day(-120), TODAY, null, null, P.C1, null, 500);
  t.ok(ofC1.rows.length === 4 && ofC1.rows.every((r) => r.party_id === P.C1 && r.party_name === 'زبون الدجاج'), 'ب4 بجهة: حركاتها وحدها (البيع النقدي والقبضان وإلغاء أحدهما)');
  const rowOf = (page, pred) => page.rows.filter(pred);
  const rc2Rows = rowOf(all, (r) => r.entry_id === D.RC2 || r.entry_id === D.RC2rev);
  const tRows = rowOf(all, (r) => r.class === 'transfer');
  t.same(
    [rc2Rows.map((r) => [r.voucher, r.voucher_id, r.reversed || r.reverses !== null]), tRows.map((r) => [r.voucher, r.voucher_id])],
    [[['entry', D.RC2, true], ['entry', D.RC2, true]], tRows.map((r) => ['transfer', [D.T1, D.T2].includes(r.doc_id) ? r.doc_id : 'x'])],
    'ب5 القبض الملغى وإلغاؤه يفتحان سند القبض الأصليّ، وساقا كلّ تحويل تفتحان سند التحويل',
  );
  t.same(
    [rowOf(all, (r) => r.move_id === D.T1)[0]?.counter_account, rowOf(all, (r) => r.move_id === D.T1in)[0]?.counter_account,
      rowOf(all, (r) => r.class === 'expense').map((r) => r.category).sort()],
    ['مصرف الرافدين', 'الصندوق الرئيسي', ['كهرباء', 'وقود السيّارة']],
    'ب5 الصندوق المقابل لكلّ ساق تحويل، وفئة كلّ مصروف',
  );
  const oct = await moves(U.owner, day(-45), day(-35), null, null, null, null, 500);
  t.same(
    rowOf(oct, (r) => r.class === 'purchase_charge' || r.class === 'cash_purchase').map((r) => [r.class, r.doc_no, r.doc_id]),
    [['purchase_charge', D.R1no, D.R1.id], ['cash_purchase', D.R1no, D.R1.id]].sort((a, b) => (a[0] < b[0] ? 1 : -1)),
    'ب5 أجرة الشراء النقدية والمدفوع عند الشراء برقم الشراء نفسه',
  );
  const errs = [
    [U.owner, ['2026-11-01', TODAY, null, 'gift', null, null, 10], 'class_unknown'],
    [U.owner, ['2026-11-01', TODAY, uid(), null, null, null, 10], 'cash_account_not_found'],
    [U.owner, [TODAY, '2026-11-01', null, null, null, null, 10], 'period_required'],
    [U.owner, ['2026-11-01', TODAY, null, null, uid(), null, 10], 'party_not_found'],
    [U.owner, ['2026-11-01', TODAY, null, null, null, JSON.stringify({ on_date: TODAY }), 10], 'cursor_invalid'],
    [U.storekeeper, ['2026-11-01', TODAY, null, null, null, null, 10], 'forbidden'],
  ];
  const moveCodes = [];
  for (const [user, args] of errs) moveCodes.push((await read(user, SQL.moves, args)).code);
  t.same(moveCodes, errs.map((e) => e[2]), 'ب6 كلّ رفض بسببه');

  // ── ج. «قائمة الذمم» ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const debts = (user, side, opts = {}) =>
    value(user, SQL.debts, [side, opts.division ?? null, opts.book ?? null, opts.search ?? null, opts.sort ?? 'amount', opts.min ?? null, opts.over90 ?? false,
      opts.after ? JSON.stringify(opts.after) : null, opts.limit ?? 50]);
  const agingSum = (a) => num(a.d0_30) + num(a.d31_60) + num(a.d61_90) + num(a.d91_plus);
  const R = await debts(U.owner, 'receivable');
  t.same(
    [R.rows.map((r) => [r.party_id, norm(r.amount)]), norm(R.totals.amount), R.totals.parties, norm(R.totals.amount) === norm(O.debts.receivable)],
    [[[P.C2, '200000'], [P.M, '80000'], [P.C1, '50000']], '330000', 3, true],
    'ج1 لنا: من الأكبر، والمجموع = «لنا» في الخلاصة',
  );
  t.ok(R.rows.every((r) => agingSum(r.aging) === num(r.amount)) && agingSum(R.totals.aging) === num(R.totals.amount), 'ج1 فئات أعمار كلّ جهة مجموعها رصيدها، وفئات القائمة مجموعها مجموعها');
  t.same(
    R.rows.map((r) => [norm(r.aging.d0_30), norm(r.aging.d31_60), norm(r.aging.d61_90), norm(r.aging.d91_plus), r.age_days]),
    [['0', '0', '0', '200000', 120], ['0', '80000', '0', '0', 45], ['50000', '0', '0', '0', 3]],
    'ج1 الأعمار من تاريخ المستند: افتتاح قبل 120 يوماً، وافتتاح قبل 45، وبيع بالدين قبل 3',
  );
  const Pay = await debts(U.owner, 'payable');
  t.same(
    [Pay.rows.map((r) => [r.party_id, norm(r.amount)]), Pay.rows[0].cells.map((c) => [c.book_id, norm(c.closing)]).sort(), norm(Pay.totals.amount)],
    [[[P.S1, '785000'], [P.S2, '70000'], [P.M, '60000']], [[BK.feed_mill, '-635000'], [BK.general, '-150000']].sort(), norm(O.debts.payable)],
    'ج2 علينا: المورّد بدفتريه (لكلّ دفتر رصيده)، والمجموع = «علينا» في الخلاصة',
  );
  t.same(
    [(await debts(U.owner, 'receivable', { sort: 'age' })).rows.map((r) => r.party_id), (await debts(U.owner, 'receivable', { sort: 'name' })).rows.map((r) => r.name)],
    [[P.C2, P.M, P.C1], ['جهة مزدوجة', 'زبون الدجاج', 'زبون قديم']],
    'ج3 الترتيب بالعمر (الأقدم أوّلاً) وبالاسم',
  );
  const ids = async (side, opts) => (await debts(U.owner, side, opts)).rows.map((r) => [r.party_id, norm(r.amount)]);
  t.same(
    [
      await ids('payable', { division: DV.general }),
      await ids('receivable', { book: BK.feed_mill }),
      await ids('receivable', { min: '100000' }),
      await ids('receivable', { over90: true }),
      await ids('receivable', { search: 'زبون' }),
      await ids('receivable', { search: '0780987' }),
    ],
    [
      [[P.S1, '150000'], [P.S2, '40000']],
      [[P.C2, '200000'], [P.C1, '50000']],
      [[P.C2, '200000']],
      [[P.C2, '200000']],
      [[P.C2, '200000'], [P.C1, '50000']],
      [[P.C1, '50000']],
    ],
    'ج4 الفلاتر: القسم، والدفتر، والحدّ الأدنى، وما فوق 90 يوماً، والبحث بالاسم وبأرقام الهاتف',
  );
  const debtPages = [];
  let cursor = null;
  for (let i = 0; i < 6; i += 1) {
    const page = await debts(U.owner, 'receivable', { limit: 1, after: cursor, sort: 'age' });
    debtPages.push(page);
    cursor = page.next;
    if (!cursor) break;
  }
  t.same(
    [debtPages.flatMap((p) => p.rows.map((r) => r.party_id)), debtPages.every((p) => norm(p.totals.amount) === '330000')],
    [[P.C2, P.M, P.C1], true],
    'ج5 الصفحات بالمؤشّر بلا تكرار، والمجموع للقائمة كلّها في كلّ صفحة',
  );
  const c1 = R.rows.find((r) => r.party_id === P.C1);
  t.same([c1.last_settlement.entry_id, norm(c1.last_settlement.amount), c1.last_move.on_date], [D.RC1, '150000', TODAY], 'ج6 آخر تسديد حيّ (لا الملغى)، وآخر حركة اليوم');
  t.same(
    [(await debts(U.accountantGeneral, 'receivable')).rows.map((r) => r.party_id), await (async () => (await debts(U.accountantGeneral, 'payable')).rows.map((r) => [r.party_id, norm(r.amount)]))()],
    [[P.M], [[P.S1, '150000'], [P.S2, '40000']]],
    'ج7 المحاصَر بالعامّة يرى ذمم دفترها وحده',
  );
  const debtErr = async (user, args) => (await read(user, SQL.debts, args)).code;
  t.same(
    [
      await debtErr(U.owner, ['both', null, null, null, 'amount', null, false, null, 10]),
      await debtErr(U.owner, ['receivable', null, null, null, 'size', null, false, null, 10]),
      await debtErr(U.owner, ['receivable', null, null, null, 'amount', null, false, JSON.stringify({ amount: '1' }), 10]),
      await debtErr(U.owner, ['receivable', null, null, null, 'amount', null, false, JSON.stringify({ id: uid(), name: 'x' }), 10]),
      await debtErr(U.accountantGeneral, ['receivable', null, BK.feed_mill, null, 'amount', null, false, null, 10]),
      await debtErr(U.storekeeper, ['receivable', null, null, null, 'amount', null, false, null, 10]),
    ],
    ['side_unknown', 'sort_unknown', 'cursor_invalid', 'cursor_invalid', 'out_of_scope', 'forbidden'],
    'ج8 كلّ رفض بسببه',
  );

  // ── د. كشف الحساب الاحترافي ──────────────────────────────────────────────────────────────────────────────────────────────
  const statement = (user, partyId, book, from, to) => value(user, SQL.statement, [partyId, book, from, to]);
  const S1 = await statement(U.owner, P.S1, null, day(-45), TODAY);
  const mill = S1.books.find((b) => b.book_id === BK.feed_mill);
  const general = S1.books.find((b) => b.book_id === BK.general);
  t.same(
    [S1.books.map((b) => b.book_id), S1.org.name, mill.lines.map((l) => [l.kind, norm(l.debit), norm(l.credit)]), norm(mill.closing)],
    [[BK.feed_mill, BK.general], 'منشأة المال',
      [['purchase', '0', '1480000'], ['payout', '500000', '0'], ['payout', '300000', '0'], ['supplier_return', '45000', '0']], '-635000'],
    'د1 كشف المورّد: دفتراه، وسطوره بتاريخها، وختامه',
  );
  t.ok(mill.lines.every((l, i) => num(l.balance) === num(mill.brought_forward) + mill.lines.slice(0, i + 1).reduce((s, x) => s + num(x.debit) - num(x.credit), 0))
    && num(mill.closing) === num(mill.brought_forward) + num(mill.total_debit) - num(mill.total_credit), 'د1 الرصيد الجاري والختام = السابق + عليه − له');
  const purchase = mill.lines[0].detail;
  t.same(
    [purchase.type, purchase.doc_no, purchase.lines.map((l) => [l.item_name, norm(l.qty), l.unit_label, norm(l.unit_price), norm(l.amount)]),
      norm(purchase.discount), purchase.charges.map((c) => [c.label, norm(c.amount), c.paid]), norm(purchase.net), norm(purchase.paid_now), purchase.account?.id],
    ['purchase', D.R1no, [['ذرة صفراء', '2000', mill.lines[0].detail.lines[0].unit_label, '450', '900000'], ['كسبة صويا', '500', mill.lines[0].detail.lines[1].unit_label, '1200', '600000']],
      '20000', [['نقل', '30000', 'party'], ['تحميل', '10000', 'cash']], '1480000', '500000', B.B1],
    'د2 تفصيل الشراء: الموادّ بكمياتها وأسعارها، والخصم، والأجور (لجهة ونقداً)، والصافي، والمدفوع عند الشراء',
  );
  t.eq(norm(purchase.net), norm(mill.lines[0].credit), 'د2 صافي الموادّ بعد الخصم = مبلغ القيد في الكشف');
  t.same(
    [mill.lines[1].detail, mill.lines[1].allocations.map((a) => [a.entry_id, norm(a.amount)]),
      [mill.lines[2].voucher_id, mill.lines[2].account?.id, mill.lines[2].allocations.map((a) => [a.doc_no, norm(a.amount)]), norm(mill.lines[2].unallocated)]],
    [{ type: 'purchase_payment', doc_id: D.R1.id, doc_no: D.R1no, account: { id: B.B1, name: 'الصندوق الرئيسي' } }, [[D.R1purchase, '500000']],
      [D.PY1, B.B1, [[D.R1no, '300000']], '0']],
    'د3 المدفوع عند الشراء يسدّد شراءه، وسند الدفع يسمّي صندوقه وما سدّده',
  );
  const ret = mill.lines[3].detail;
  t.same([ret.type, ret.receipt_doc_no, ret.lines.map((l) => [l.item_name, norm(l.qty), l.base_unit, norm(l.amount)]), norm(ret.total)],
    ['supplier_return', D.R1no, [['ذرة صفراء', '100', 'kg', '45000']], '45000'], 'د3 تفصيل المرتجع بشرائه وموادّه');
  t.same(
    [mill.open_items.map((o) => [o.entry_id, norm(o.amount), norm(o.settled), norm(o.remaining), o.age_days, o.side]), mill.aging.side, norm(mill.aging.d31_60)],
    [[[D.R1purchase, '1480000', '845000', '635000', 40, 'credit']], 'credit', '635000'],
    'د4 المفتوح اليوم بالمبلغ والمسدَّد والمتبقّي والعمر، والأعمار بجهة الرصيد',
  );
  const pricing = general.lines[0].detail;
  t.same([pricing.type, pricing.pricing, pricing.item_name, norm(pricing.qty), norm(pricing.unit_price), norm(pricing.new_total), norm(general.closing)],
    ['revaluation', true, 'كاز', '100', '1500', '150000', '-150000'], 'د4 تسعير الشراء الذي سُجّل بلا سعر بمادّته وكميته وسعره');
  const later = await statement(U.owner, P.S1, BK.feed_mill, day(-15), TODAY);
  t.same([later.books.length, norm(later.books[0].brought_forward), later.books[0].lines.map((l) => l.kind), norm(later.books[0].closing)],
    [1, '-680000', ['supplier_return'], '-635000'], 'د5 «رصيد سابق» = ختام ما قبل المدّة، والختام نفسه');
  const C1 = await statement(U.owner, P.C1, null, day(-45), TODAY);
  const cl = C1.books[0].lines;
  t.same(
    cl.map((l) => [l.kind, l.detail?.type ?? null, l.voucher_id, l.reversed, l.reverses]),
    [['invoice', 'sale', null, false, null], ['payment', 'sale_payment', null, false, null], ['invoice', 'sale', null, false, null],
      ['payment', null, D.RC1, false, null], ['payment', null, D.RC2, true, null], ['payment', null, D.RC2, false, D.RC2]],
    'د6 كشف الزبون: البيع النقديّ وقبضه، والبيع بالدين، والقبض، والقبض الملغى وإلغاؤه (يفتحان سنده الأصليّ)',
  );
  t.same(
    [cl[0].detail.lines.map((l) => [l.item_name, norm(l.qty), l.base_unit, norm(l.unit_price), norm(l.amount)]), norm(cl[0].detail.total) === norm(cl[0].debit),
      cl[3].allocations.map((a) => [a.doc_no, norm(a.amount)]), cl[4].allocations, cl[5].allocations],
    [[['ذرة صفراء', '100', 'kg', '1000', '100000']], true, [[D.sale2no, '150000']], [], []],
    'د6 موادّ البيع = مبلغ قيده، والقبض يسمّي فاتورته، والملغى وإلغاؤه بلا توزيع (لا «سدّد» نفسه)',
  );
  const S2 = await statement(U.owner, P.S2, null, day(-45), TODAY);
  const s2lines = S2.books.flatMap((b) => b.lines);
  t.same(
    s2lines.map((l) => [l.detail?.type, l.detail?.label ?? l.detail?.category, norm(l.credit)]),
    [['purchase_charge', 'نقل', '30000'], ['expense', 'صيانة', '40000']],
    'د7 أجرة النقل على الناقل بشرائها، وفاتورة الصيانة بفئتها',
  );
  const SG = await statement(U.accountantGeneral, P.S1, null, day(-45), TODAY);
  t.same([SG.books.map((b) => b.book_id), (await read(U.accountantGeneral, SQL.statement, [P.S1, BK.feed_mill, day(-45), TODAY])).code], [[BK.general], 'out_of_scope'],
    'د8 المحاصَر: دفتر نطاقه وحده، ودفتر غيره out_of_scope');
  t.same(
    [(await read(U.owner, SQL.statement, [uid(), null, day(-45), TODAY])).code, (await read(U.owner, SQL.statement, [P.S1, null, TODAY, day(-45)])).code,
      (await read(U.storekeeper, SQL.statement, [P.S1, null, day(-45), TODAY])).code],
    ['party_not_found', 'period_required', 'forbidden'], 'د9 كلّ رفض بسببه');

  // ── هـ. السندات ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const V1 = await value(U.owner, SQL.voucher, [D.RC1]);
  t.same(
    [V1.type, /^RC-2026-\d{4,}$/u.test(V1.doc_no), norm(V1.amount), V1.account.id, V1.allocations.map((a) => [a.doc_no, a.doc_kind, a.doc_id, norm(a.amount)]),
      norm(V1.unallocated), V1.void, V1.party.id, V1.posted_by, V1.org.name],
    ['receipt', true, '150000', B.B1, [[D.sale2no, 'sale', D.sale2, '150000']], '0', null, P.C1, 'accountant', 'منشأة المال'],
    'هـ1 سند القبض: رقمه ومبلغه وصندوقه وما سدّده، ومن سجّله',
  );
  const V2 = await value(U.owner, SQL.voucher, [D.PY1]);
  t.same([V2.type, V2.allocations.map((a) => [a.doc_no, norm(a.amount)])], ['payment', [[D.R1no, '300000']]], 'هـ2 سند الصرف وما سدّده');
  const V3 = await value(U.owner, SQL.voucher, [D.RC2]);
  const V3r = await value(U.owner, SQL.voucher, [D.RC2rev]);
  t.same([[V3.void?.on_date, V3.void?.reason, V3.void?.by], V3.allocations, norm(V3.unallocated), V3r.entry_id], [[TODAY, 'قبض مكرّر', 'manager'], [], '0', D.RC2],
    'هـ3 السند الملغى بتاريخ إلغائه وسببه ومن ألغاه، ومن قيد الإلغاء يفتح الأصليّ');
  t.same(
    [(await read(U.owner, SQL.voucher, [D.R1purchase])).code, (await read(U.owner, SQL.voucher, [uid()])).code,
      (await read(U.accountantGeneral, SQL.voucher, [D.RC1])).code, (await read(U.storekeeper, SQL.voucher, [D.RC1])).code],
    ['not_a_voucher', 'entry_not_found', 'out_of_scope', 'forbidden'], 'هـ4 كلّ رفض بسببه');
  const T1 = await value(U.owner, SQL.transfer, [D.T1]);
  const T2 = await value(U.owner, SQL.transfer, [D.T2]);
  t.same(
    [T1.from.id, T1.to.id, norm(T1.amount), T1.note, T1.void, T2.void?.reason, (await read(U.owner, SQL.transfer, [D.T1in])).code, (await read(U.owner, SQL.transfer, [uid()])).code],
    [B.B1, B.B2, '250000', 'إيداع في المصرف', null, 'تحويل خاطئ', 'transfer_not_found', 'transfer_not_found'],
    'هـ5 سند التحويل من صندوق إلى صندوق، والملغى بسببه، وبمعرّف الساق الداخلة أو مجهول: transfer_not_found',
  );

  // ── و. «خلاصة الشهر التشغيلية» ───────────────────────────────────────────────────────────────────────────────────────────
  const Nov = await value(U.owner, SQL.month, [TODAY]);
  const Oct = await value(U.owner, SQL.month, [day(-40)]);
  const divOf = (m, kind) => m.divisions.find((d) => d.kind === kind);
  t.same(
    [Nov.month, Nov.to, Nov.project.sales.count, norm(Nov.project.sales.revenue), norm(Nov.project.purchases.total), norm(Nov.project.expenses.total),
      [norm(Nov.cash.inflow), norm(Nov.cash.outflow), norm(Nov.cash.net)]],
    ['2026-11-01', TODAY, 2, '300000', '150000', '120000', ['270000', '100000', '170000']],
    'و1 الشهر الحاليّ للمشروع حتى اليوم (مثل الخلاصة)',
  );
  t.same(
    [norm(divOf(Nov, 'feed_mill').sales.revenue), norm(divOf(Nov, 'general').purchases.total), norm(divOf(Nov, 'general').expenses.total),
      [Oct.project.purchases.count, norm(Oct.project.purchases.total), norm(Oct.project.purchases.cash), norm(Oct.project.purchases.credit)],
      norm(divOf(Oct, 'feed_mill').purchases.total)],
    ['300000', '150000', '120000', [2, '1520000', '510000', '1010000'], '1520000'],
    'و2 كلّ قسم بأرقامه، وشراء الشهر الماضي = الموادّ − الخصم + الأجور، نقداً المدفوع والأجرة النقدية',
  );
  const sumDiv = (m, pick) => m.divisions.reduce((s, d) => s + num(pick(d) ?? 0), 0);
  t.same(
    [sumDiv(Nov, (d) => d.sales.revenue), sumDiv(Nov, (d) => d.purchases.total), sumDiv(Nov, (d) => d.expenses.total)],
    [num(Nov.project.sales.revenue), num(Nov.project.purchases.total), num(Nov.project.expenses.total)],
    'و3 الأقسام مجموعها = المشروع',
  );
  t.same([(await read(U.owner, SQL.month, ['2026-12-01'])).code, (await read(U.storekeeper, SQL.month, [TODAY])).code], ['month_required', 'forbidden'], 'و4 الشهر القادم وغير المحاسب مرفوضان');
  const batchCost = norm((await db.admin('select total_value as v from public.production_values where batch_id = $1', [D.batch])).rows[0].v);
  const issueCost = norm((await db.admin("select sum(amount) as v from public.flock_costs where doc_kind = 'flock_issue' and flock_id = $1", [D.flock])).rows[0].v);
  const NovB = await value(U.accountantBroiler, SQL.month, [TODAY]);
  t.same(
    [[Nov.project.production?.batches, norm(Nov.project.production?.output_kg), norm(Nov.project.production?.cost)], divOf(Nov, 'feed_mill').feed_issue,
      [Nov.project.feed_issue?.issues, norm(Nov.project.feed_issue?.cost)], [divOf(Nov, 'broiler')?.feed_issue?.issues, norm(divOf(Nov, 'broiler')?.feed_issue?.cost)],
      divOf(Nov, 'general').production, [NovB.divisions.map((d) => d.kind), NovB.project.feed_issue?.issues, NovB.project.production]],
    [[1, '1000', batchCost], null, [1, issueCost], [1, issueCost], null, [['broiler'], 1, null]],
    'و5 الإنتاج بكلفته في قسم المعمل، والصرف للفوج بكلفته في قسم الحقل (ومحاسب الحقل يراه بنطاق قسمه لا بمخزن المعمل)',
  );

  // ── ز. أمين المخزن يضيف الزبون (جواب المالك 2026-11-08، #58) ─────────────────────────────────────────────────────────────
  const insertParty = (user, customer, supplier) =>
    call(db, user, 'insert into public.parties (name, is_customer, is_supplier) values ($1, $2, $3) returning id', [`جهة ${uid().slice(0, 6)}`, customer, supplier], { commit: false });
  t.same(
    [(await insertParty(U.storekeeper, true, false)).ok, (await insertParty(U.storekeeper, false, true)).ok, (await insertParty(U.storekeeper, false, false)).code,
      (await insertParty(U.manager, false, false)).ok],
    [true, true, 'forbidden', true],
    'ز1 الأمين يضيف زبوناً أو مورّداً، ولا يضيف جهة بلا صفة؛ والمدير كما كان',
  );

  // ── ح. كلّ ثابت يمسك خرقه وحده (معاملة ترجع) ─────────────────────────────────────────────────────────────────────────────
  const BREAKS = {
    open_both_sides: [`insert into public.party_entries (org_id, party_id, book_id, kind, amount, on_date) values ('${org}', '${P.C1}', '${BK.feed_mill}', 'adjustment', -7, '${TODAY}')`],
    purchase_detail_total: ['alter table public.receipt_line_amounts disable trigger user', `update public.receipt_line_amounts set line_total = line_total + 1 where line_id = '${D.R1.lines[0]}'`],
    sale_detail_total: ['alter table public.sales_lines disable trigger user', `update public.sales_lines set line_total = line_total + 1 where sale_id = '${D.sale2}'`],
    return_detail_total: ['alter table public.supplier_return_line_amounts disable trigger user', `update public.supplier_return_line_amounts set credit_amount = credit_amount + 1 where doc_id = '${D.RT1.id}'`],
    charge_entry_total: ['alter table public.receipt_charges disable trigger user', `update public.receipt_charges set amount = amount + 1 where doc_id = '${D.R1.id}' and payee_party_id is not null`],
    voucher_numbers: ['alter table public.party_entries disable trigger user', `update public.party_entries set doc_no = null where id = '${D.RC1}'`],
  };
  for (const [check, statements] of Object.entries(BREAKS)) {
    const broken = await db.asOwner(async (q) => {
      for (const sql of statements) await q(sql);
      return verify(q);
    });
    // قيد مفتوح «له» بجانب «عليه» يكسر أعمار القائمة أيضاً (فئاتها ≠ رصيدها)، فيمسكه money_formulas معه.
    const also = check === 'open_both_sides' ? { money_formulas: 1 } : {};
    t.same(broken, { ...MONEY_ZERO, [check]: 1, ...also }, `ح ضابط: verify_money يمسك ${check}${check === 'open_both_sides' ? ' (وmoney_formulas بفئات الأعمار)' : ' وحده'}`);
  }
  // money_formulas: خلاصة لا تطابق الصفوف الخام (النقد +1)، وأعمار تعدّ المسدَّد، كلّ واحدة بطفرة في معاملة ترجع.
  const formulas = async (fns) =>
    mutant(db, U.owner, fns, async ({ attempt }) => {
      const result = await attempt(U.owner, async (oq) => (await oq("select violations::int as v from public.verify_money() where check_name = 'money_formulas'")).rows[0].v, 'postgres');
      return result.ok ? result.value : result.code;
    });
  // العدد لكلّ منشأة في القاعدة كلّها (ملفّات أخرى في الحزمة لها منشآتها)، فالضابط ≥ 1 لكلّ طفرة.
  t.same(
    [await formulas([[FN.overview, [["'total', coalesce(sum(x.balance), 0)::text", "'total', (coalesce(sum(x.balance), 0) + 1)::text"]]]]) >= 1,
      await formulas([[FN.open, [['select abs(e.amount) - coalesce((', 'select abs(e.amount) + 0 * coalesce((']]]]) >= 1],
    [true, true],
    'ح ضابط: money_formulas يمسك نقداً لا يطابق الحركات، وأعماراً لا تطابق الرصيد',
  );

  // ── ط. طفرات تكسر كلّ قاعدة فيفشل فحصها ────────────────────────────────────────────────────────────────────────────────
  const probe = (fns, user, sql, params, judge) =>
    mutant(db, user, fns, async ({ attempt }) => {
      const result = await attempt(user, async (oq) => (await oq(sql, params)).rows[0].v);
      return result.ok ? judge(result.value) : `رفض ${result.code}`;
    });
  const MUTANTS = [
    ['ط1 المتبقّي بلا طرح التوزيع: الأعمار تعدّ المسدَّد', [[FN.open, [['select abs(e.amount) - coalesce((', 'select abs(e.amount) + 0 * coalesce((']]]], U.owner, SQL.debts,
      ['receivable', null, null, null, 'amount', null, false, null, 50], (v) => v.rows.every((r) => agingSum(r.aging) === num(r.amount))],
    ['ط2 الرصيد الجاري بترتيب غير ترتيب الصفوف', [[FN.moves, [['sum(b.amount) over (order by b.on_date, b.k2, b.k3, b.seq', 'sum(b.amount) over (order by b.on_date, b.seq']]]], U.owner, SQL.moves,
      ['2026-11-01', TODAY, null, null, null, null, 500], (v) => chain(v, v.opening) === 'ok'],
    ['ط3 الذمم تقاصّ الدفاتر', [[FN.debts, [['sum(greatest(v_sign * c.closing, 0)) as amount', 'greatest(v_sign * sum(c.closing), 0) as amount']]]], U.owner, SQL.debts,
      ['receivable', null, null, null, 'amount', null, false, null, 50], (v) => norm(v.rows.find((r) => r.party_id === P.M)?.amount) === '80000'],
    ['ط4 التوزيع يسمّي قيد الإلغاء', [[FN.alloc, [['where o.reverses_entry_id is distinct from x.id and x.reverses_entry_id is distinct from o.id', 'where true']]]], U.owner, SQL.voucher,
      [D.RC2], (v) => v.allocations.length === 0],
    ['ط5 صافي الشراء بلا الخصم', [[FN.detail, [["'net', (t.lines_total - coalesce(ra.discount, 0))::text", "'net', t.lines_total::text"]]]], U.owner, SQL.statement,
      [P.S1, BK.feed_mill, day(-45), TODAY], (v) => norm(v.books[0].lines[0].detail.net) === norm(v.books[0].lines[0].credit)],
    ['ط6 داخل اليوم يعدّ التحويل بين الصناديق', [[FN.overview, [["'inflow', coalesce((select sum(g.inflow) from g where g.class not in ('transfer', 'opening')), 0)::text", "'inflow', coalesce((select sum(g.inflow) from g), 0)::text"]]]],
      U.owner, SQL.overview, [], (v) => norm(v.day.inflow) === '20000'],
    ['ط7 الذمم بلا نطاق الدفاتر', [[FN.debts, [['    select b.id from public.ledger_books b\n    where b.org_id = v_org and b.archived_at is null and public.in_scope_book(b.id)', '    select b.id from public.ledger_books b\n    where b.org_id = v_org and b.archived_at is null']]]],
      U.accountantGeneral, SQL.debts, ['receivable', null, null, null, 'amount', null, false, null, 50], (v) => v.rows.every((r) => r.party_id === P.M)],
    ['ط8 سطر إلغاء القبض يفتح نفسه لا سنده', [[FN.statement, [['coalesce(l.reverses_entry_id, l.id)', 'l.id']]]], U.owner, SQL.statement,
      [P.C1, null, day(-45), TODAY], (v) => v.books[0].lines.filter((l) => l.kind === 'payment' && l.detail === null).every((l) => [D.RC1, D.RC2].includes(l.voucher_id))],
    ['ط9 حركة إلغاء القبض تفتح قيدها لا السند', [[FN.moves, [['coalesce(s.entry_reverses, s.party_entry_id)', 's.party_entry_id']]]], U.owner, SQL.moves,
      ['2026-11-01', TODAY, null, 'customer_receipt', null, null, 500], (v) => v.rows.filter((r) => r.on_date === TODAY).every((r) => r.voucher_id === D.RC2)],
    ['ط11 الصرف للأفواج بنطاق مخزن المعمل لا قسم الفوج', [['private.money_flock_issue(date, date, uuid)', [['public.in_scope_division(f.division_id)', 'public.in_scope_wh(f.warehouse_id)']]]],
      U.accountantBroiler, SQL.month, [TODAY], (v) => v.project.feed_issue?.issues === 1],
    ['ط10 سند التحويل بمعرّف الساق الداخلة', [[FN.transfer, [["kind = 'transfer' and doc_kind = 'cash_transfer' and doc_id = p_id and reverses_move_id is null", "kind = 'transfer' and doc_kind = 'cash_transfer' and reverses_move_id is null"]]]],
      U.owner, SQL.transfer, [D.T1in], () => false],
  ];
  const caught = [];
  for (const [name, fns, user, sql, params, judge] of MUTANTS) {
    const verdict = await probe(fns, user, sql, params, judge);
    caught.push(verdict === true ? `${name}: عبر` : 'ok');
  }
  t.same(caught, MUTANTS.map(() => 'ok'), `ط كلّ طفرة (${MUTANTS.length}) يفشل فحصها`);

  // ── ك. التكامل: كلّ جواب حيّ يمرّ بمحلّل شاشته الحقيقيّ، وأرقامه = أرقام الخادم ──────────────────────────────────────────
  const m = await screens();
  const parse = (name, fn, value) => {
    try {
      return fn(value);
    } catch (error) {
      return { failed: `${name}: ${error.message}` };
    }
  };
  const failedOf = (...parsed) => parsed.filter((p) => p && p.failed).map((p) => p.failed);
  const pO = parse('money_overview', m.parseMoneyOverview, O);
  const pAll = parse('money_moves', m.parseMoneyMoves, all);
  const pRc = parse('money_moves class', m.parseMoneyMoves, receipts);
  const pNov = parse('month_summary', m.parseMonthSummary, Nov);
  const pR = parse('debts receivable', m.parseDebtsOverview, R);
  const pPay = parse('debts payable', m.parseDebtsOverview, Pay);
  const pS1 = parse('statement supplier', m.parsePartyStatement, S1);
  const pC1 = parse('statement customer', m.parsePartyStatement, C1);
  const pS2 = parse('statement payee', m.parsePartyStatement, S2);
  const pV = [V1, V2, V3].map((v, i) => parse(`voucher ${i}`, m.parseVoucher, v));
  const pT = [T1, T2].map((v, i) => parse(`transfer ${i}`, m.parseTransfer, v));
  const pSale = parse('sale_detail', m.parseSaleDoc, await value(U.owner, 'select public.sale_detail($1) as v', [D.sale2]));
  const pCash = parse('report_cash_statement', m.parseCashStatement, cashStatement);
  const pHome = parse('home_summary', m.parseHomeSummary, await value(U.owner, SQL.home));
  t.same(failedOf(pO, pAll, pRc, pNov, pR, pPay, pS1, pC1, pS2, ...pV, ...pT, pSale, pCash, pHome), [], 'ك1 كلّ جواب حيّ لقرّاء 0024 (وكشف الصندوق والرئيسية والبيع) يمرّ بمحلّل شاشته الحقيقيّ');
  t.same(
    [pO.cash?.total, pO.debts?.receivable, pO.debts?.payable, pAll.rows?.length, pAll.running, pRc.running, pR.rows?.length, pR.totals?.amount, pPay.totals?.amount],
    [filsText(O.cash.total), filsText(O.debts.receivable), filsText(O.debts.payable), all.rows.length, true, false, R.rows.length, filsText(R.totals.amount), filsText(Pay.totals.amount)],
    'ك2 الأرقام بعد المحلّل = أرقام الخادم (النقد والذمم والحركة والقوائم)',
  );
  t.same(
    [pS1.books?.map((b) => b.lines.length), pC1.books?.[0]?.lines.map((l) => l.detail?.type ?? null), pS2.books?.flatMap((b) => b.lines.map((l) => l.detail?.type ?? null)),
      pV.map((v) => v.type), pT.map((v) => v.void === null), pCash.lines?.filter((l) => l.voucherId !== null).length, pHome.accounts?.cashTotal],
    [S1.books.map((b) => b.lines.length), C1.books[0].lines.map((l) => l.detail?.type ?? null), S2.books.flatMap((b) => b.lines.map((l) => l.detail?.type ?? null)),
      ['receipt', 'payment', 'receipt'], [true, false], cashStatement.lines.filter((l) => l.voucher_id !== null).length, filsText(O.cash.total)],
    'ك3 الكشوف بسطورها وتفاصيلها، والسندات وإلغاؤها، وسند كشف الصندوق، ونقد الرئيسية: كما أرسلها الخادم',
  );

  // ── ي. العيّنات الحقيقية لفحوص الشاشات (MONEY_SAMPLES_DIR) ──────────────────────────────────────────────────────────────
  if (process.env.MONEY_SAMPLES_DIR) {
    const dir = process.env.MONEY_SAMPLES_DIR;
    const page1 = await moves(U.owner, '2026-11-01', TODAY, null, null, null, null, 6);
    const a = {
      generated_by: `supabase/tests/money.test.mjs (embedded Postgres 17، اليوم المثبَّت ${TODAY})`,
      money_overview: O,
      money_moves: {
        all: page1,
        box: boxMoves,
        box_day: dayBook,
        filtered: await moves(U.owner, day(-120), TODAY, null, 'customer_receipt', null, null, 100),
        page2: await moves(U.owner, '2026-11-01', TODAY, null, null, null, page1.next, 6),
      },
      month_summary: Nov,
      home_summary: await value(U.owner, SQL.home),
      cash_statement: cashStatement,
    };
    const b = {
      generated_by: a.generated_by,
      debts_overview: { receivable: R, payable: Pay },
      // مدّة سابقة (تنتهي قبل اليوم، فالتسديدات بعدها لا تُذكر) ومدّة برصيد سابق غير صفر، لفحوص الشاشات (مراجعة الشاشات H1).
      party_statement_v2: { supplier: S1, customer: C1, supplier_past: await statement(U.owner, P.S1, null, day(-45), '2026-10-15'), supplier_since: later },
      voucher_detail: { receipt: V1, payment: V2, void: V3 },
      transfer_detail: { live: T1 },
      sale_detail: await value(U.owner, 'select public.sale_detail($1) as v', [D.sale2]),
    };
    writeFileSync(path.join(dir, 'money-a.json'), `${JSON.stringify(a, null, 2)}\n`);
    writeFileSync(path.join(dir, 'money-b.json'), `${JSON.stringify(b, null, 2)}\n`);
    t.ok(true, `ي العيّنات كُتبت في ${dir}`);
  }
}
