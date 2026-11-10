// شاشات «المال بين يديك» (عقد 0024 §4.1 و§4.2 و§4.7 و§4.8 و§5 و§6 A؛ خطّة المحاسبة §8.1 1-أ و1-ب و1-و و1-ز و§9.3 و§9.9): react-dom/client الحقيقي
// على DOM صغير (dom.mjs) يشغّل مسارات الحسابات الحقيقية (AccountsRoutes: خلاصة المال وحركة الأموال ويومية الصندوق وخلاصة الشهر وصفحة الجهات والصناديق
// وكشف الصندوق) وrepo/money الحقيقي (المحلّل وبناء النداء) على core بديل يسجّل كلّ نداء ويجيب بأجوبة القاعدة من fixtures/money-a.json (عيّنات القاعدة
// الحقيقية بمفاتيح العقد §6). القيم المنتظرة تُحسب هنا من العيّنات لا من نصوص بخطّ اليد، فتُستبدل العيّنات بغيرها بالمفاتيح نفسها وتبقى الحالات صحيحة؛
// وشروط العيّنات تُفحص أوّلاً باسمها، والفروع التي تخلو منها العيّنات (صندوق مؤرشف برصيد، وكلفة محجوبة، ويوم فارغ، ونطاق محصور) تُبنى من نسخة منها.
// والرئيسية (بطاقة الحسابات وزرّا الدفع والقبض) بحزمة ثانية بلا DOM مثل ui.test.
// الحالات: P المحلّلات؛ H الخلاصة (البطاقات بترتيب الهاتف وروابطها، والسالب، والذمم بأقسامها، واليوم بلا التحويل في المجموع، والشهر وأشرطته، وأكبر خمسة،
// والتنبيهات، والروابط بالدور، والرفض)؛ M حركة الأموال (النداء بالفلاتر، والأعمدة، ومجموع كلّ يوم مكتمل، والرصيد مع الجريان وحده، و«حمّل المزيد» بالمؤشّر
// بلا تكرار، وروابط كلّ صفّ §5، والعكس بعلامته)؛ D يومية الصندوق (أوّل اليوم + الوارد − الصادر = آخره، والسهمان، والطباعة بعنوانها، والتوقيع، واليوم
// الفارغ)؛ S خلاصة الشهر (الجملة، والكتل بالمشروع والأقسام، والإنتاج والصرف، والكلفة المحجوبة، والسهمان)؛ C الصناديق («يومية اليوم») وكشف الصندوق (رابط
// كلّ رقم)؛ R نقل المسارات (/accounts الخلاصة، و/accounts/parties صفحة الجهات)؛ X بطاقة الرئيسية.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const F = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'money-a.json'), 'utf8'));
// عيّنات السند وفاتورة البيع (money-b) لفتحهما من حركة الأموال ويومية الصندوق والرجوع منهما (مراجعة 0024 M4).
const B = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'money-b.json'), 'utf8'));
const O = F.money_overview;
const MM = F.money_moves;
const MS = F.month_summary;
const HS = F.home_summary;
const clone = (value) => JSON.parse(JSON.stringify(value));
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const DEFINE = { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' };

// الجلسة بديلة لكلّ مستورِد، وcore بديل لملفّات repo وحدها: call يسجّله globalThis.__money.rpc، والملفّ الحقيقي يبني الطلب ويقرأ الجواب.
const SESSION_STUB = 'export const useSession = () => globalThis.__money.session;';
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__money.rpc(fn, args);
export const send = async () => { throw new Error('send_not_expected'); };
export const classifyPostgrest = (error) => new RejectedError(error.code ?? 'x', error.hint ?? null);
export const explained = async (error) => error;
export const updatedRows = () => { throw new ZeroRowsError(); };
export const authed = async () => ({ db: null });
export const unknownConstraint = () => '';`;
const stubs = {
  name: 'money-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$/ }, () => ({ path: 'session', namespace: 'money-stub' }));
    b.onResolve({ filter: /^\.\/core$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('src/lib/repo/') ? { path: 'core', namespace: 'money-stub' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'money-stub' }, (args) => ({ contents: args.path === 'core' ? CORE : SESSION_STUB, resolveDir: ROOT, loader: 'js' }));
  },
};

async function bundle(lines, plugins) {
  const result = await build({
    stdin: { contents: lines.join('\n'), resolveDir: ROOT, loader: 'tsx' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    jsx: 'automatic',
    logLevel: 'silent',
    loader: { '.css': 'empty' },
    define: DEFINE,
    plugins,
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

// ── أدوات DOM ──────────────────────────────────────────────────────────────────────────────────────────────────
const body = () => globalThis.document.body;
const byAction = (name, scope = body()) => (scope ? descendants(scope).filter((n) => n.getAttribute('data-action') === name) : []);
const first = (name, scope) => byAction(name, scope)[0] ?? null;
const text = (node = body()) => node?.textContent ?? '';
const classOf = (node) => node?.getAttribute('class') ?? '';
const hrefOf = (node) => node?.getAttribute('href') ?? null;
const links = (scope) => (scope ? descendants(scope).filter((n) => n.localName === 'a') : []);
const click = async (node, init = {}) => {
  if (node) fire(node, 'click', { button: 0, ...init });
  await settle();
  await settle();
};
const choose = async (select, value) => {
  select.value = value;
  fire(select, 'change');
  await settle();
  await settle();
};
/** أوّل جدول داخل العقدة: رؤوس الأعمدة وصفوف الجسم والتذييل (عناصر tr). */
const tableOf = (scope) => {
  const table = scope ? descendants(scope).find((n) => n.localName === 'table') : null;
  if (!table) return { headers: [], body: [], foot: [] };
  const rows = (tag) => (descendants(table).find((n) => n.localName === tag)?.children ?? []).filter((n) => n.localName === 'tr');
  return { headers: descendants(table).filter((n) => n.localName === 'th' && n.getAttribute('scope') === 'col').map((n) => n.textContent), body: rows('tbody'), foot: rows('tfoot') };
};
const cells = (tr) => tr.children.map((c) => c.textContent);

// ── حساب مستقلّ عن الشاشة ─────────────────────────────────────────────────────────────────────────────────────
/** نصّ عشريّ ← عدد صحيح بالمقياس (المال 2، والكمية 3)؛ الأصفار الزائدة بعد الفاصلة لا تغيّر القيمة («757000.00»). */
const scaled = (value, scale) => {
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const units = BigInt(`${whole}${fraction.padEnd(scale, '0').slice(0, scale)}`);
  return negative ? -units : units;
};
const fils = (value) => scaled(value, 2);
const milli = (value) => scaled(value, 3);
const decimalsOf = (values) => (values.some((value) => value % 100n !== 0n) ? 2 : 0);
const fmtDay = (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
const addDays = (day, by) => {
  const [y, mo, d] = day.split('-').map(Number);
  const at = new Date(Date.UTC(y, mo - 1, d + by));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}-${String(at.getUTCDate()).padStart(2, '0')}`;
};
const shiftMonth = (month, by) => {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
};
const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
// أسماء الأصناف (العقد §5)، و«الرصيد عند البداية» بقاموس المالك بدل «رصيد افتتاحي».
const LABEL = {
  customer_receipt: 'قبض من زبائن',
  cash_sale: 'بيع نقدي',
  supplier_payment: 'دفع لمورّدين',
  cash_purchase: 'شراء نقدي',
  purchase_charge: 'أجور الشراء',
  expense: 'مصاريف',
  transfer: 'نقل بين الصناديق',
  opening: 'الرصيد عند البداية',
  other: 'أخرى',
};
const OUTSIDE = new Set(['transfer', 'opening']);
/** رابط رقم الحركة (§5) من صفّها الخام: السند أوّلاً، ثمّ المستند. */
const expectedHref = (row) => {
  if (row.voucher === 'entry') return `/accounts/voucher/${row.voucher_id}`;
  if (row.voucher === 'transfer') return `/accounts/transfer/${row.voucher_id}`;
  if (row.doc_kind === 'receipt') return `/inventory/receipts/${row.doc_id}`;
  if (row.doc_kind === 'sale') return `/sales/${row.doc_id}`;
  if (row.doc_kind === 'supplier_return') return `/inventory/supplier-returns/${row.doc_id}`;
  if (row.doc_kind === 'cash_transfer') return `/accounts/transfer/${row.doc_id}`;
  return null;
};
/**
 * البيان المنتظر من الصفّ الخام: السند أو الفاتورة، وفئة المصروف، والصندوق الآخر بوجه التحويل الأصلي، واسم الأجرة، ثمّ الملاحظة، والإلغاء بعلامته.
 * withClass: بلا عمود النوع (يومية الصندوق) يسبق المصروفَ والتحويل والأجرةَ اسمُ صنفها.
 */
const expectedMemo = (row, withClass = false) => {
  const counter = typeof row.counter_account === 'string' ? row.counter_account : (row.counter_account?.name ?? null);
  const incoming = row.reverses ? fils(row.outflow) > 0n : fils(row.inflow) > 0n;
  const bare = {
    customer_receipt: 'سند قبض',
    supplier_payment: 'سند صرف',
    cash_sale: 'بيع نقداً',
    cash_purchase: 'دفع عند الشراء',
    purchase_charge: row.note ?? 'أجور الشراء',
    expense: row.category ?? 'مصروف',
    transfer: counter ? (incoming ? `من «${counter}»` : `إلى «${counter}»`) : 'نقل بين الصناديق',
    opening: 'الرصيد عند البداية',
    other: 'أخرى',
  }[row.class];
  const what = withClass && ['expense', 'transfer', 'purchase_charge'].includes(row.class) ? `${LABEL[row.class]}: ${bare}` : bare;
  const note = row.class === 'purchase_charge' ? null : row.note;
  let memo = note ? `${what} — ${note}` : what;
  if (row.reverses) memo = `إلغاء: ${memo}`;
  // «(أُلغي لاحقاً)» مذكّراً كما في الكشف: البيان يبدأ بمذكّر («سند قبض»، «نقل»)، مراجعة 0024 L8.
  if (row.reversed) memo = `${memo} (أُلغي لاحقاً)`;
  return memo;
};
/** صفوف الجدول المنتظرة: الحركات بترتيبها، وبعد آخر حركة من كلّ يوم اكتملت حركاته المحمّلة صفّ مجموعه. */
const expectedLines = (rows, days) => {
  const loaded = new Map();
  for (const row of rows) loaded.set(row.on_date, (loaded.get(row.on_date) ?? 0) + 1);
  const dayOf = new Map(days.map((day) => [day.on_date, day]));
  const out = [];
  rows.forEach((row, index) => {
    out.push({ move: row });
    if (rows[index + 1]?.on_date === row.on_date) return;
    const day = dayOf.get(row.on_date);
    if (day && loaded.get(row.on_date) >= day.count) out.push({ day });
  });
  return out;
};
const ALL_ROWS = [...MM.all.rows, ...MM.page2.rows, ...MM.box.rows, ...MM.box_day.rows, ...MM.filtered.rows];

export default async function (t) {
  // ── الرئيسية بحزمة لحالها قبل DOM الفحص (مثل ui.test): بطاقة الحسابات بسطر «النقد»، وزرّا الدفع والقبض إلى صفحة الجهات ──
  try {
    const h = await bundle(
      [
        "export { cardSpecs, DivisionCard, homeActions } from './src/pages/home/HomePage.tsx';",
        "export { parseHomeSummary } from './src/lib/repo/home.ts';",
        "export { fmtMoney } from './src/lib/format.ts';",
        "export { renderToStaticMarkup } from 'react-dom/server.browser';",
        "export { createElement as h } from 'react';",
        "export { MemoryRouter } from 'react-router-dom';",
      ],
      [],
    );
    const accounts = HS.accounts;
    t.ok(accounts && typeof accounts.cash_total === 'string', 'شرط home_summary: بطاقة الحسابات بـcash_total');
    const parsed = h.parseHomeSummary(clone(HS));
    t.eq(parsed.accounts?.cashTotal, fils(accounts.cash_total), 'X1 المحلّل: cash_total بالفلس');
    const card = h.cardSpecs(parsed).find((spec) => spec.key === 'accounts');
    const cash = h.fmtMoney(fils(accounts.cash_total), 0);
    t.same([card?.to, card?.metrics[0]?.label, card?.metrics[0]?.value], ['/accounts', 'النقد', cash], 'X2 بطاقة الحسابات تفتح «خلاصة المال» وأوّل أرقامها النقد كلّه (يظهر على الهاتف)');
    const html = h.renderToStaticMarkup(h.h(h.MemoryRouter, null, h.h(h.DivisionCard, { spec: card })));
    t.ok(html.includes('href="/accounts"') && html.includes(`النقد</dt><dd dir="ltr" class="text-end text-lg font-semibold tabular-nums">${cash}</dd>`), 'X3 البطاقة المرسومة: «النقد» برقمه LTR');
    const older = clone(HS);
    delete older.accounts.cash_total;
    const olderCard = h.cardSpecs(h.parseHomeSummary(older)).find((spec) => spec.key === 'accounts');
    t.same(olderCard?.metrics.map((metric) => metric.label).includes('النقد'), false, 'X4 خادم أقدم بلا cash_total: بلا سطر «النقد» (لا «—» ولا صفر)');
    t.throws(() => h.parseHomeSummary({ ...clone(HS), accounts: { ...clone(accounts), cash_total: 5 } }), 'X5 cash_total رقماً لا نصّاً يرمي', /home_shape:cash_total/);
    const actions = new Map(h.homeActions(null).map((action) => [action.key, action.to]));
    t.same([actions.get('payout'), actions.get('payment')], ['/accounts/parties?new=payout', '/accounts/parties?new=payment'], 'X6 زرّا «دفعت لجهة» و«قبضت من جهة» يفتحان نافذتيهما في صفحة الجهات (انتقلت من /accounts)');
  } catch (error) {
    t.ok(false, `X: رمى ${error?.stack ?? error}`);
  }

  const restoreDom = installDom();
  // ساعة الجهاز بيوم العيّنات: «اليوم» والشهر الحالي والسهمان منه.
  const TODAY = O.today;
  const RealDate = globalThis.Date;
  class DeviceDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(`${TODAY}T09:00:00`);
      else super(...args);
    }
    static now() {
      return new RealDate(`${TODAY}T09:00:00`).getTime();
    }
  }
  globalThis.Date = DeviceDate;
  let root = null;
  try {
    const m = await bundle(
      [
        "export { createElement as h } from 'react';",
        "export { createRoot } from 'react-dom/client';",
        "export { flushSync } from 'react-dom';",
        "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
        "export { default as AccountsRoutes } from './src/pages/accounts/AccountsRoutes.tsx';",
        "export { default as SaleDocPage } from './src/pages/sales/SaleDocPage.tsx';",
        "export { parseMoneyOverview, parseMoneyMoves, parseMonthSummary, MONEY_CLASSES } from './src/lib/repo/money.ts';",
        "export { fmtMoney, fmtQty, fmtInt } from './src/lib/format.ts';",
        "export { moveHref } from './src/pages/accounts/money/shared.tsx';",
        "export { RejectedError } from './src/lib/errors.ts';",
      ],
      [stubs],
    );
    const h = m.h;
    const fmt = (value, decimals = decimalsOf([value])) => m.fmtMoney(value, decimals);
    let where = null;
    function Probe() {
      where = m.useLocation();
      return null;
    }

    // ── النداءات والجلسة ──
    let calls = [];
    let handlers = {};
    const session = (role) => ({ status: 'ready', workspace: { userId: 'u-1', orgId: 'org-1', orgName: 'مشروع الدواجن', role, canSeeAccounts: true, divisions: [], scopes: [] } });
    const cashBalances = (overview = O) => ({
      to: overview.today,
      accounts: overview.cash.boxes.map((box) => ({ account_id: box.account_id, name: box.name, kind: box.kind, archived: box.archived, version: 1, has_opening: true, opening: '0', inflow: '0', outflow: '0', closing: box.balance })),
      total: { opening: '0', inflow: '0', outflow: '0', closing: overview.cash.total },
    });
    const cashStatement = (moves) => ({
      account: { ...moves.account, version: 1 },
      from: moves.from,
      to: moves.to,
      brought_forward: moves.opening,
      total_in: moves.totals.inflow,
      total_out: moves.totals.outflow,
      closing: moves.closing,
      lines: moves.rows.map((row) => ({
        move_id: row.move_id,
        on_date: row.on_date,
        seq: row.seq,
        kind: row.kind,
        doc_kind: row.doc_kind,
        doc_id: row.doc_id,
        doc_no: row.doc_no,
        party: row.party_name,
        note: row.note,
        reverses: row.reverses,
        reversed: row.reversed,
        inflow: row.inflow,
        outflow: row.outflow,
        balance: row.balance,
      })),
    });
    // الصفحة الثانية تبدأ بآخر صفّ من الأولى مكرّراً: «حمّل المزيد» يُسقطه بمعرّفه.
    const page2 = () => ({ ...clone(MM.page2), rows: [clone(MM.all.rows.at(-1)), ...clone(MM.page2.rows)] });
    const movesFor = (args) => {
      if (args.p_after) return page2();
      if (args.p_class || args.p_party) return clone(MM.filtered);
      if (args.p_account && args.p_from === args.p_to) return clone(MM.box_day);
      if (args.p_account) return clone(MM.box);
      return clone(MM.all);
    };
    const DEFAULTS = {
      money_overview: () => clone(O),
      money_moves: movesFor,
      month_summary: () => clone(MS),
      report_cash_balances: () => cashBalances(),
      // كشف الصندوق الحقيقيّ للصندوق والمدّة نفسيهما (عيّنة القاعدة، ومعه voucher_id منذ 0024)؛ والمحوَّل من الحركة لعيّنة أقدم بلاه.
      report_cash_statement: () => F.cash_statement ?? cashStatement(MM.box),
    };
    const fresh = (overrides = {}, role = 'manager') => {
      calls = [];
      handlers = { ...DEFAULTS, ...overrides };
      globalThis.__money = {
        session: session(role),
        rpc(fn, args) {
          calls.push([fn, args]);
          const handler = handlers[fn];
          if (!handler) return new Promise(() => {});
          return Promise.resolve().then(() => handler(args));
        },
      };
    };
    const callsOf = (fn) => calls.filter(([name]) => name === fn).map(([, args]) => args);
    /** sales: ومسار فاتورة البيع (/sales/:id) بجانب الحسابات، لفتحها من حركة الأموال والرجوع منها. */
    const mount = async (url, sales = false) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      const routes = [h(m.Route, { key: 'accounts', path: '/accounts/*', element: h(m.AccountsRoutes) }), ...(sales ? [h(m.Route, { key: 'sales', path: '/sales/:id', element: h(m.SaleDocPage) })] : [])];
      m.flushSync(() => root.render(h(m.MemoryRouter, { initialEntries: [url] }, h(Probe), h(m.Routes, null, ...routes))));
      await settle();
      await settle();
    };
    const unmount = async () => {
      if (!root) return;
      const mounted = root;
      root = null;
      m.flushSync(() => mounted.unmount());
      body().textContent = '';
      await settle();
    };
    const step = async (name, fn) => {
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${name}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
    };

    // ── شروط العيّنات ──────────────────────────────────────────────────────────────────────────────────────────
    t.same(
      [MM.all.running, MM.box.running, MM.box_day.running, MM.filtered.running, MM.all.account, MM.filtered.account === null, Boolean(MM.box.account), Boolean(MM.box_day.account)],
      [true, true, true, false, null, true, true, true],
      'شرط money_moves: all وbox وbox_day بالرصيد الجاري، وfiltered بلاه؛ والصندوق في box وbox_day وحدهما',
    );
    t.ok(MM.all.next !== null && MM.page2.next === null && MM.page2.rows.length > 0, 'شرط page2: صفحة بعد all بمؤشّرها، وهي الأخيرة');
    t.ok(MM.box_day.from === MM.box_day.to && MM.box_day.rows.length > 0, 'شرط box_day: يوم واحد لصندوق واحد بحركات');
    t.eq(new Set(MM.filtered.rows.map((row) => row.class)).size, 1, 'شرط filtered: فلتر صنف واحد');
    const firstDayCounts = new Map();
    for (const row of MM.all.rows) firstDayCounts.set(row.on_date, (firstDayCounts.get(row.on_date) ?? 0) + 1);
    t.ok(MM.all.days.some((day) => firstDayCounts.get(day.on_date) < day.count), 'شرط all: يوم يكمل في الصفحة الثانية (مجموعه لا يُعرض قبل اكتماله)');
    t.ok(
      ['entry', 'transfer'].every((voucher) => ALL_ROWS.some((row) => row.voucher === voucher)) &&
        ['receipt', 'sale', 'expense'].every((kind) => ALL_ROWS.some((row) => row.doc_kind === kind)) &&
        ALL_ROWS.some((row) => row.reverses) &&
        ALL_ROWS.some((row) => row.reversed && !row.reverses),
      'شرط الصفوف: سند قبض أو صرف، وتحويل، وشراء، وبيع، ومصروف، وعكس، وملغاة لاحقاً',
    );
    t.ok(O.cash.boxes.some((box) => fils(box.balance) < 0n) && O.alerts.negative_boxes.length > 0, 'شرط money_overview: صندوق بالسالب وتنبيهه');
    t.ok(O.day.classes.some((row) => OUTSIDE.has(row.class)) && O.day.classes.some((row) => !OUTSIDE.has(row.class)), 'شرط day: تحويل اليوم (خارج المجموع) وصنف داخله');
    const counted = O.day.classes.filter((row) => !OUTSIDE.has(row.class));
    t.same(
      [counted.reduce((sum, row) => sum + fils(row.inflow), 0n), counted.reduce((sum, row) => sum + fils(row.outflow), 0n)],
      [fils(O.day.inflow), fils(O.day.outflow)],
      'شرط day (العقد §7): ما دخل وما خرج = مجموع الأصناف بلا التحويل والرصيد عند البداية',
    );
    t.same(
      [MS.project.production !== null, MS.project.feed_issue !== null, MS.divisions.some((d) => d.production), MS.divisions.some((d) => d.feed_issue), MS.project.sales.cost !== null],
      [true, true, true, true, true],
      'شرط month_summary: الإنتاج وصرف العلف في المشروع وفي قسم، والكلفة ظاهرة',
    );
    const D = MM.box_day;
    t.eq(fils(D.opening) + fils(D.totals.inflow) - fils(D.totals.outflow), fils(D.closing), 'شرط box_day: أوّل اليوم + الوارد − الصادر = آخره');

    t.ok(
      ALL_ROWS.some((row) => row.class === 'expense' && row.note) &&
        ALL_ROWS.some((row) => row.class === 'transfer' && row.reverses) &&
        ALL_ROWS.some((row) => row.class === 'transfer' && !row.reverses && fils(row.outflow) > 0n) &&
        ALL_ROWS.some((row) => row.class === 'purchase_charge' && row.note),
      'شرط البيان: مصروف بملاحظة، وتحويل خارج، وعكس تحويل، وأجرة شراء باسمها',
    );

    // ── P المحلّلات ─────────────────────────────────────────────────────────────────────────────────────────────
    await step('P', async () => {
      const overview = m.parseMoneyOverview(clone(O));
      t.same(
        [overview.today, overview.monthFrom, overview.cash.total, overview.cash.boxes.map((box) => [box.accountId, box.balance, box.archived]), overview.debts.net, overview.debts.divisions.length],
        [O.today, O.month_from, fils(O.cash.total), O.cash.boxes.map((box) => [box.account_id, fils(box.balance), box.archived]), fils(O.debts.net), O.debts.divisions.length],
        'P1 money_overview: اليوم والنقد بصناديقه والذمم بالفلس',
      );
      t.same(
        [overview.day.classes.map((row) => row.cls), overview.month.sales.cost, overview.month.expenses.categories.map((c) => c.amount), overview.topReceivable.map((p) => p.oldest), overview.alerts.oldReceivable.parties],
        [O.day.classes.map((row) => row.class), fils(O.month.sales.cost), O.month.expenses.categories.map((c) => fils(c.amount)), O.top_receivable.map((p) => p.oldest), O.alerts.old_receivable.parties],
        'P2 الأصناف والكلفة والفئات والأقدم والتنبيهات',
      );
      const blind = clone(O);
      blind.month.sales.cost = null;
      blind.month.sales.gross = null;
      t.same([m.parseMoneyOverview(blind).month.sales.cost, m.parseMoneyOverview(blind).month.sales.gross], [null, null], 'P3 الكلفة المحجوبة null');
      const missing = clone(O);
      delete missing.month.sales.cost;
      t.throws(() => m.parseMoneyOverview(missing), 'P4 مفتاح الكلفة غائباً (لا null) خطأ شكل', /ledger_shape:cost/);
      const unknown = clone(O);
      unknown.day.classes[0].class = 'loan';
      t.throws(() => m.parseMoneyOverview(unknown), 'P5 صنف خارج العقد §5 يرمي', /ledger_shape:class/);
      const moneyText = clone(O);
      moneyText.cash.total = 5;
      t.throws(() => m.parseMoneyOverview(moneyText), 'P6 المال رقماً لا نصّاً يرمي', /ledger_shape:total/);
      for (const [name, sample] of Object.entries(MM)) {
        const parsed = m.parseMoneyMoves(clone(sample));
        t.same(
          [parsed.rows.length, parsed.running, parsed.opening, parsed.closing, parsed.rows.every((row) => (row.balance === null) === !sample.running), parsed.next === null, parsed.account?.id ?? null],
          [sample.rows.length, sample.running, sample.opening === null ? null : fils(sample.opening), sample.closing === null ? null : fils(sample.closing), true, sample.next === null, sample.account?.id ?? null],
          `P7 money_moves.${name}: الصفوف والجريان والرصيدان والمؤشّر والصندوق`,
        );
      }
      const transfer = ALL_ROWS.find((row) => row.class === 'transfer' && row.counter_account);
      const [asText] = m.parseMoneyMoves({ ...clone(MM.page2), rows: [clone(transfer)] }).rows;
      const [asObject] = m.parseMoneyMoves({ ...clone(MM.page2), rows: [{ ...clone(transfer), counter_account: { id: 'acc-1', name: 'صندوق آخر' } }] }).rows;
      t.same([asText.counterAccount, asObject.counterAccount], [{ id: null, name: typeof transfer.counter_account === 'string' ? transfer.counter_account : transfer.counter_account.name }, { id: 'acc-1', name: 'صندوق آخر' }], 'P8 الصندوق الآخر نصّاً أو {id, name}');
      t.throws(() => m.parseMoneyMoves({ ...clone(MM.all), rows: [{ ...clone(MM.all.rows[0]), voucher: 'cheque' }] }), 'P9 سند بنوع غير entry/transfer يرمي', /ledger_shape:voucher/);
      t.same(
        [
          m.moveHref({ voucher: 'transfer', voucherId: 'v-1', docKind: null, docId: null }),
          m.moveHref({ voucher: 'entry', voucherId: 'v-2', docKind: null, docId: null }),
          m.moveHref({ voucher: null, voucherId: null, docKind: 'expense', docId: 'x-1' }),
        ],
        ['/accounts/transfer/v-1', '/accounts/voucher/v-2', null],
        'P11 الرابط من السند أوّلاً (العقد §5)، والمصروف بلا رابط',
      );
      const summary = m.parseMonthSummary(clone(MS));
      const milled = MS.divisions.find((d) => d.production);
      const parsedMilled = summary.divisions.find((d) => d.divisionId === milled.division_id);
      t.same(
        [summary.month, summary.divisions.length, parsedMilled.production.outputKg, parsedMilled.production.cost, summary.project.feedIssue.cost, summary.cash.net],
        [MS.month, MS.divisions.length, milli(milled.production.output_kg), fils(milled.production.cost), fils(MS.project.feed_issue.cost), fils(MS.cash.net)],
        'P10 month_summary: الأقسام والإنتاج بالكيلو وكلفته والصرف والنقد («1000.000» و«757000.00» بقيمتهما)',
      );
    });

    // ── H خلاصة المال ──────────────────────────────────────────────────────────────────────────────────────────
    await step('H', async () => {
      fresh();
      await mount('/accounts');
      t.same(callsOf('money_overview'), [undefined], 'H1 نداء واحد لـmoney_overview بلا معاملات');
      t.same(
        descendants(body()).filter((n) => n.localName === 'section' && (n.getAttribute('data-action') ?? '').startsWith('hub-')).map((n) => n.getAttribute('data-action')),
        ['hub-cash', 'hub-debts', 'hub-today', 'hub-month', 'hub-top-receivable', 'hub-top-payable', 'hub-alerts'],
        'H2 البطاقات بترتيب الهاتف (§9.9): النقد، الذمم، اليوم، الشهر، أكبر خمسة بكلّ طرف، التنبيهات',
      );
      // النقد
      t.eq(text(first('hub-cash-total')), fmt(fils(O.cash.total)), 'H3 مجموع النقد من الخادم');
      const boxes = byAction('hub-box');
      t.same(boxes.map(hrefOf), O.cash.boxes.map((box) => `/accounts/cash/${box.account_id}`), 'H4 كلّ صندوق يفتح كشفه، بترتيب الخادم');
      O.cash.boxes.forEach((box, index) => {
        const negative = fils(box.balance) < 0n;
        const link = boxes[index];
        t.ok(text(link).includes(box.name) && text(link).includes(fmt(fils(box.balance))), `H5 «${box.name}» برصيده`);
        t.same(
          [link?.getAttribute('data-negative') === 'true', descendants(link).some((n) => classOf(n).includes('text-danger-700')), text(link).includes('سالب')],
          [negative, negative, negative],
          `H6 «${box.name}»: السالب بلون التنبيه وكلمته، وغيره بلاهما`,
        );
      });
      // الذمم
      const receivable = first('hub-receivable');
      const payable = first('hub-payable');
      t.same([hrefOf(receivable), hrefOf(payable)], ['/accounts/debts?side=receivable', '/accounts/debts?side=payable'], 'H7 «لنا» و«علينا» تفتحان قائمة الذمم بطرفها');
      t.ok(text(receivable?.parentNode?.parentNode).includes(fmt(fils(O.debts.receivable))) && text(payable?.parentNode?.parentNode).includes(fmt(fils(O.debts.payable))), 'H8 «لنا» و«علينا» بأرقام الخادم');
      const net = fils(O.debts.net);
      t.eq(text(first('hub-net')), net === 0n ? '—' : `${net > 0n ? 'لنا' : 'علينا'}${fmt(net < 0n ? -net : net)}`, 'H9 الصافي بكلمته «لنا» أو «علينا» والرقم بلا إشارة');
      const divisions = byAction('hub-division');
      t.eq(divisions.length, O.debts.divisions.length, 'H10 سطر لكلّ قسم (يُطوى)');
      t.same(
        divisions.map((item) => links(item).map(hrefOf)),
        O.debts.divisions.map((d) => [`/accounts/debts?side=receivable&division=${d.division_id}`, `/accounts/debts?side=payable&division=${d.division_id}`]),
        'H11 رقما كلّ قسم يفتحان قائمة الذمم بطرفها وقسمها',
      );
      t.ok(!text().includes('الأرقام من حسابات نطاقك'), 'H12 بلا نطاق محصور: بلا جملة النطاق');
      // اليوم: الأصناف بلا التحويل والرصيد عند البداية، والمجموع من الخادم، والخارجة بسطرها
      const today = tableOf(first('hub-today'));
      t.same(today.headers, ['النوع', 'دخل', 'خرج'], 'H13 جدول اليوم: النوع | دخل | خرج');
      const dayDecimals = decimalsOf([fils(O.day.inflow), fils(O.day.outflow), ...counted.flatMap((row) => [fils(row.inflow), fils(row.outflow)])]);
      const side = (value) => (fils(value) === 0n ? '' : fmt(fils(value), dayDecimals));
      t.same(today.body.map(cells), counted.map((row) => [LABEL[row.class], side(row.inflow), side(row.outflow)]), 'H14 سطر لكلّ صنف داخل المجموع بترتيب العقد، والصفر فارغ');
      t.same(today.foot.map(cells), [['المجموع', fmt(fils(O.day.inflow), dayDecimals), fmt(fils(O.day.outflow), dayDecimals)]], 'H15 مجموع اليوم من الخادم (بلا التحويل، العقد §7)');
      const outside = O.day.classes.filter((row) => OUTSIDE.has(row.class));
      t.same(
        byAction('hub-today-outside').map((n) => text(n)),
        outside.map((row) => `${LABEL[row.class]} خارج المجموع: دخل ${fmt(fils(row.inflow))}، وخرج ${fmt(fils(row.outflow))}.`),
        'H16 التحويل بين الصناديق بسطر تحت الجدول «خارج المجموع»',
      );
      t.eq(hrefOf(first('hub-today-moves')), `/accounts/moves?from=${O.today}&to=${O.today}`, 'H17 «حركات اليوم» تفتح حركة الأموال بيوم الخادم');
      // الشهر
      const { sales, purchases, expenses, cash } = O.month;
      const salesText = text(first('hub-sales'));
      t.ok(salesText.includes(fmt(fils(sales.revenue))) && salesText.includes(`(${m.fmtInt(sales.count)})`), 'H18 المبيعات بإيرادها وعددها');
      t.ok(salesText.includes(`كلفتها${fmt(fils(sales.cost))}`) && text(first('hub-gross')).includes(fmt(fils(sales.gross))), 'H19 الكلفة والربح الإجمالي لمن يراهما');
      const purchasesText = text(first('hub-purchases'));
      t.ok(
        purchasesText.includes(fmt(fils(purchases.total))) && purchasesText.includes(`نقداً${fmt(fils(purchases.cash))}`) && purchasesText.includes(`بالدين${fmt(fils(purchases.credit))}`),
        'H20 المشتريات بمجموعها ونقداً وبالدين',
      );
      const categories = byAction('hub-expense');
      t.same(
        categories.map((item) => text(item)),
        expenses.categories.map((c) => `${c.name}${fmt(fils(c.amount))}`),
        'H21 المصاريف بفئاتها ومبالغها',
      );
      const total = fils(expenses.total);
      t.same(
        categories.map((item) => descendants(item).filter((n) => n.localName === 'span' && n.style.flexGrow !== undefined).map((n) => String(n.style.flexGrow))),
        expenses.categories.map((c) => [String(fils(c.amount)), String(total - fils(c.amount))]),
        'H22 شريط كلّ فئة بحصّتها من مجموع المصاريف (أين ذهب المال)',
      );
      t.ok(text(first('hub-expenses')).includes(fmt(total)), 'H23 مجموع المصاريف');
      t.eq(text(first('hub-net-flow')), fmt(fils(cash.net)), 'H24 صافي التدفّق النقدي');
      t.eq(hrefOf(first('hub-month-summary')), `/accounts/month?m=${O.month_from.slice(0, 7)}`, 'H25 «خلاصة الشهر كاملة» بشهر الخلاصة');
      // أكبر خمسة
      for (const [action, rows] of [
        ['hub-top-receivable', O.top_receivable],
        ['hub-top-payable', O.top_payable],
      ]) {
        const items = byAction('hub-top-party', first(action));
        t.same(items.map(hrefOf), rows.map((p) => `/accounts/parties/${p.party_id}?back=/accounts`), `H26 ${action}: كلّ جهة تفتح كشفها بترتيب الخادم (والرجوع منه إلى الخلاصة)`);
        t.ok(
          rows.every((p, index) => text(items[index]).includes(p.name) && text(items[index]).includes(fmt(fils(p.amount))) && (!p.oldest || text(items[index]).includes(fmtDay(p.oldest)))),
          `H27 ${action}: الاسم والمبلغ وأقدم دين`,
        );
      }
      // التنبيهات
      t.same(byAction('hub-alert-box').map(hrefOf), O.alerts.negative_boxes.map((box) => `/accounts/cash/${box.account_id}`), 'H28 كلّ صندوق بالسالب بتنبيه يفتح كشفه');
      for (const [sideName, old] of [
        ['receivable', O.alerts.old_receivable],
        ['payable', O.alerts.old_payable],
      ]) {
        const alert = first(`hub-alert-${sideName}`);
        t.same(
          [Boolean(alert), alert ? hrefOf(alert) : null, alert ? text(alert).includes(fmt(fils(old.amount))) : null],
          old.parties > 0 ? [true, `/accounts/debts?side=${sideName}&over90=1`, true] : [false, null, null],
          `H29 دين ${sideName} فوق 90 يوماً: تنبيه بمبلغه يفتح القائمة بفلتر 90 يوماً، وبلا جهة بلا تنبيه`,
        );
      }
      // الروابط للمدير
      t.same(
        links(descendants(body()).find((n) => n.localName === 'nav' && n.getAttribute('aria-label') === 'صفحات الحسابات')).map(hrefOf),
        ['/accounts/parties?new=payment', '/accounts/parties?new=payout', '/accounts/expenses?new=1', '/accounts/moves', '/accounts/cash', '/accounts/expenses', '/accounts/parties', '/accounts/openings', '/accounts/month'],
        'H30 روابط الحسابات للمدير: القبض والدفع والمصروف ثمّ حركة الأموال والصناديق والمصاريف وكلّ الجهات والأرصدة عند البداية وخلاصة الشهر',
      );
    });

    await step('H-variants', async () => {
      // صندوق مؤرشف برصيد، ونطاق محصور، وكلفة محجوبة، وبلا تنبيهات
      const variant = clone(O);
      variant.cash.boxes.push({ ...clone(O.cash.boxes[0]), account_id: 'arch-box', name: 'صندوق قديم', archived: true, balance: '100000' });
      variant.debts.books = { visible: 1, total: 7 };
      variant.month.sales.cost = null;
      variant.month.sales.gross = null;
      variant.alerts = { negative_boxes: [], old_receivable: { parties: 0, amount: '0' }, old_payable: { parties: 0, amount: '0' } };
      fresh({ money_overview: () => clone(variant) }, 'accountant');
      await mount('/accounts');
      t.ok(byAction('hub-box').some((n) => hrefOf(n) === '/accounts/cash/arch-box' && text(n).includes('صندوق قديم (مؤرشف وعليه رصيد)')), 'H31 المؤرشف برصيد بعلامته');
      t.ok(text(first('hub-debts')).includes('الأرقام من حسابات نطاقك: 1 من 7'), 'H32 القارئ المحصور يعرف أنّ الذمم من حسابات نطاقه');
      t.same([text(first('hub-sales')).includes('كلفتها'), first('hub-gross')], [false, null], 'H33 الكلفة محجوبة: بلا كلفة ولا ربح');
      t.ok(text(first('hub-alerts')).includes('لا تنبيهات') && first('hub-alert-receivable') === null, 'H34 بلا تنبيه: «لا تنبيهات»');
      const hrefs = links(descendants(body()).find((n) => n.localName === 'nav' && n.getAttribute('aria-label') === 'صفحات الحسابات')).map(hrefOf);
      t.same([hrefs.includes('/accounts/openings'), hrefs.includes('/accounts/parties?new=payment')], [false, true], 'H35 المحاسب: بلا الأرصدة عند البداية، وله القبض والدفع');
      await unmount();
      const old = clone(O);
      old.alerts.old_receivable = { parties: 2, amount: '250000' };
      old.alerts.old_payable = { parties: 1, amount: '70000' };
      fresh({ money_overview: () => clone(old) }, 'viewer');
      await mount('/accounts');
      t.same([hrefOf(first('hub-alert-receivable')), hrefOf(first('hub-alert-payable'))], ['/accounts/debts?side=receivable&over90=1', '/accounts/debts?side=payable&over90=1'], 'H36 الطرفان فوق 90 يوماً: تنبيهان');
      const viewerHrefs = links(descendants(body()).find((n) => n.localName === 'nav' && n.getAttribute('aria-label') === 'صفحات الحسابات')).map(hrefOf);
      t.ok(!viewerHrefs.some((href) => href.includes('?new=')), 'H37 المشاهد: بلا أزرار تسجيل');
      await unmount();
      fresh({ money_overview: () => Promise.reject(new m.RejectedError('forbidden', 'الحسابات للمالك والمدير والمحاسب فقط.')) });
      await mount('/accounts');
      t.ok(text().includes('تعذّر تحميل خلاصة المال') && text().includes('الحسابات للمالك والمدير والمحاسب فقط.') && first('hub-cash') === null, 'H38 الرفض بتلميحه، بلا بطاقات');
    });

    // ── M حركة الأموال ─────────────────────────────────────────────────────────────────────────────────────────
    /** يقارن جدول الحركة بالصفوف المنتظرة صفّاً صفّاً: النصوص والروابط وعلامتا الإلغاء. */
    /** here: الصفحة بفلاترها كما في الرابط؛ كلّ رابط إلى سند أو مستند أو كشف جهة يحمل الرجوع إليها (مراجعة 0024 M4). */
    const checkMoves = (label, running, rows, days, here) => {
      const backed = (href) => (href ? `${href}?back=${encodeURIComponent(here)}` : null);
      const table = tableOf(body());
      const headers = ['التاريخ', 'رقم السند', 'الصندوق', 'النوع', 'الجهة', 'البيان', 'وارد', 'صادر', ...(running ? ['الرصيد'] : [])];
      t.same(table.headers, headers, `${label}: الأعمدة${running ? ' بالرصيد' : ' بلا الرصيد'}`);
      const lines = expectedLines(rows, days);
      t.eq(table.body.length, lines.length, `${label}: ${rows.length} حركة و${lines.length - rows.length} مجموع يوم`);
      const values = lines.flatMap((line) => (line.move ? [line.move.inflow, line.move.outflow, line.move.balance] : [line.day.inflow, line.day.outflow, line.day.closing])).filter((v) => v !== null);
      const decimals = decimalsOf(values.map(fils));
      const money = (value) => fmt(fils(value), decimals);
      let ok = 0;
      lines.forEach((line, index) => {
        const tr = table.body[index];
        const got = tr ? cells(tr) : [];
        if (line.day) {
          const want = [fmtDay(line.day.on_date), '', '', '', '', 'مجموع اليوم', money(line.day.inflow), money(line.day.outflow), ...(running ? [money(line.day.closing)] : [])];
          if (JSON.stringify(got) === JSON.stringify(want)) ok += 1;
          else t.same(got, want, `${label}: مجموع يوم ${line.day.on_date}`);
          return;
        }
        const row = line.move;
        const href = backed(expectedHref(row));
        const docLink = descendants(tr.children[1]).find((n) => n.localName === 'a') ?? null;
        const want = [
          fmtDay(row.on_date),
          row.doc_no ?? (href ? 'سند النقل' : ''),
          row.account_name,
          `${LABEL[row.class]}${row.reverses ? 'إلغاء' : row.reversed ? 'أُلغي' : ''}`,
          row.party_name ?? '',
          expectedMemo(row),
          fils(row.inflow) === 0n ? '' : money(row.inflow),
          fils(row.outflow) === 0n ? '' : money(row.outflow),
          ...(running ? [money(row.balance)] : []),
        ];
        const wantLinks = [href, `/accounts/cash/${row.account_id}`, row.party_id ? backed(`/accounts/parties/${row.party_id}`) : null];
        const gotLinks = [hrefOf(docLink), hrefOf(descendants(tr.children[2]).find((n) => n.localName === 'a')), hrefOf(descendants(tr.children[4]).find((n) => n.localName === 'a'))];
        const marks = [Boolean(first('move-reversal', tr)), Boolean(first('move-reversed', tr))];
        if (JSON.stringify([got, gotLinks, marks]) === JSON.stringify([want, wantLinks, [Boolean(row.reverses), Boolean(row.reversed && !row.reverses)]])) ok += 1;
        else t.same([got, gotLinks, marks], [want, wantLinks, [Boolean(row.reverses), Boolean(row.reversed && !row.reverses)]], `${label}: صفّ ${row.move_id}`);
      });
      t.eq(ok, lines.length, `${label}: كلّ صفّ بنصوصه وروابطه (§5) وعلامتي الإلغاء`);
      return { decimals, money };
    };

    await step('M', async () => {
      fresh();
      await mount('/accounts/moves');
      t.same(
        callsOf('money_moves'),
        [{ p_from: `${TODAY.slice(0, 7)}-01`, p_to: null, p_account: null, p_class: null, p_party: null, p_after: null, p_limit: 100 }],
        'M1 المدّة الافتراضية من أوّل الشهر إلى يوم الخادم، بلا فلاتر، وحدّ الصفحة 100',
      );
      const all = MM.all;
      const { money } = checkMoves('M2 all', true, all.rows, all.days, '/accounts/moves');
      const foot = tableOf(body()).foot.map(cells);
      t.same(foot, [['مجموع المدّة', money(all.totals.inflow), money(all.totals.outflow), money(all.closing)]], 'M3 مجموع المدّة كلّها من الخادم (لا مجموع الصفحة) ورصيد آخرها');
      t.same(
        ['opening', 'in', 'out', 'closing'].map((key) => text(first(`moves-${key}`))),
        [`الرصيد في أوّل المدّة${money(all.opening)}`, `وارد${money(all.totals.inflow)}`, `صادر${money(all.totals.outflow)}`, `الرصيد في آخر المدّة${money(all.closing)}`],
        'M4 أرقام المدّة فوق الجدول',
      );
      t.eq(text(first('moves-count')), `${m.fmtInt(all.rows.length)} من المجموع ${m.fmtInt(all.totals.count)}`, 'M5 «N من المجموع» من الخادم');
      // «حمّل المزيد» بالمؤشّر المبهم كما هو، والصفحة تُضاف بلا تكرار
      await click(first('more-moves'));
      const second = callsOf('money_moves')[1];
      t.same(second, { p_from: `${TODAY.slice(0, 7)}-01`, p_to: null, p_account: null, p_class: null, p_party: null, p_after: all.next, p_limit: 100 }, 'M6 الصفحة التالية بمؤشّر الخادم نفسه وبالفلاتر نفسها');
      const days = new Map([...all.days, ...MM.page2.days].map((day) => [day.on_date, day]));
      const merged = [...all.rows, ...MM.page2.rows];
      checkMoves('M7 بعد «حمّل المزيد»', true, merged, [...days.values()], '/accounts/moves');
      t.same([text(first('moves-count')), first('more-moves')], [`${m.fmtInt(merged.length)} من المجموع ${m.fmtInt(all.totals.count)}`, null], 'M9 المكرّر بمعرّف الحركة سقط، ولا «حمّل المزيد» بعد آخر صفحة');
    });

    await step('M-filters', async () => {
      const cls = MM.filtered.rows[0].class;
      fresh();
      await mount(`/accounts/moves?class=${cls}`);
      t.same(callsOf('money_moves')[0], { p_from: `${TODAY.slice(0, 7)}-01`, p_to: null, p_account: null, p_class: cls, p_party: null, p_after: null, p_limit: 100 }, 'M10 فلتر الصنف من الرابط');
      const { money } = checkMoves('M11 filtered', false, MM.filtered.rows, MM.filtered.days, `/accounts/moves?class=${cls}`);
      t.same(tableOf(body()).foot.map(cells), [['مجموع المدّة', money(MM.filtered.totals.inflow), money(MM.filtered.totals.outflow)]], 'M12 بلا رصيد جارٍ: المجموع بلا عمود الرصيد');
      t.same([first('moves-opening'), first('moves-closing'), text().includes('لا رصيد جارياً مع فلتر النوع أو الجهة')], [null, null, true], 'M13 بلا رصيد أوّل المدّة وآخرها، ويقول لماذا');
      await unmount();
      // الصندوق والمدّة من الرابط (رابط كشف الصندوق)، ثمّ تغيير الصنف من القائمة
      const box = MM.box;
      fresh();
      await mount(`/accounts/moves?account=${box.account.id}&from=${box.from}&to=${box.to}`);
      t.same(callsOf('money_moves')[0], { p_from: box.from, p_to: box.to, p_account: box.account.id, p_class: null, p_party: null, p_after: null, p_limit: 100 }, 'M14 الصندوق والمدّة من الرابط');
      checkMoves('M15 box', true, box.rows, box.days, `/accounts/moves?account=${box.account.id}&from=${box.from}&to=${box.to}`);
      const classSelect = first('filter-class');
      await choose(classSelect, cls);
      t.same(callsOf('money_moves').at(-1), { p_from: box.from, p_to: box.to, p_account: box.account.id, p_class: cls, p_party: null, p_after: null, p_limit: 100 }, 'M16 اختيار الصنف يعيد القراءة بالفلاتر كلّها');
      t.eq(new URLSearchParams(where?.search ?? '').get('class'), cls, 'M17 والفلتر في الرابط');
      await choose(first('filter-box'), '');
      t.eq(callsOf('money_moves').at(-1)?.p_account, null, 'M18 «كلّ الصناديق» يشيل فلتر الصندوق');
      await unmount();
      // الجهة من الرابط: اسمها من صفوف الجواب، و«كلّ الجهات» يشيلها
      const party = MM.filtered.rows.find((row) => row.party_id);
      fresh();
      await mount(`/accounts/moves?party=${party.party_id}`);
      t.eq(callsOf('money_moves')[0]?.p_party, party.party_id, 'M19 فلتر الجهة من الرابط');
      t.ok(text(first('filter-party-chosen')).includes(`الجهة: ${party.party_name}`), 'M20 اسم الجهة المختارة من صفوفها');
      await click(first('filter-party-clear'));
      t.eq(callsOf('money_moves').at(-1)?.p_party, null, 'M21 «كلّ الجهات» يشيل فلتر الجهة');
      await unmount();
      fresh({ money_moves: () => Promise.reject(new m.RejectedError('cursor_invalid', 'مؤشّر الصفحة غير صالح. حدّث الصفحة.')) });
      await mount('/accounts/moves');
      t.ok(text().includes('تعذّر تحميل حركة الأموال') && text().includes('مؤشّر الصفحة غير صالح.'), 'M22 رفض الخادم بتلميحه');
    });

    // ── D يومية الصندوق ────────────────────────────────────────────────────────────────────────────────────────
    await step('D', async () => {
      const printed = [];
      globalThis.window.print = () => printed.push(globalThis.document.title);
      globalThis.document.title = 'نظام الدواجن';
      fresh();
      await mount(`/accounts/cash/${D.account.id}/day?on=${D.from}`);
      t.same(callsOf('money_moves'), [{ p_from: D.from, p_to: D.from, p_account: D.account.id, p_class: null, p_party: null, p_after: null, p_limit: 500 }], 'D1 نداء واحد: اليوم واليوم والصندوق، وحدّ 500');
      const values = [D.opening, D.closing, D.totals.inflow, D.totals.outflow, ...D.rows.flatMap((row) => [row.inflow, row.outflow, row.balance])].map(fils);
      const decimals = decimalsOf(values);
      const money = (value) => fmt(fils(value), decimals);
      t.same(
        ['opening', 'in', 'out', 'closing'].map((key) => text(first(`cashday-${key}`))),
        [`رصيد أوّل اليوم${money(D.opening)}`, `وارد${money(D.totals.inflow)}`, `صادر${money(D.totals.outflow)}`, `رصيد آخر اليوم${money(D.closing)}`],
        'D2 رصيد أوّل اليوم والوارد والصادر ورصيد آخره (أوّله + الوارد − الصادر = آخره)',
      );
      const table = tableOf(body());
      t.same(table.headers, ['رقم السند', 'الجهة', 'البيان', 'وارد', 'صادر', 'الرصيد'], 'D3 أعمدة اليومية (§9.3)');
      t.same(cells(table.body[0]), ['', '', 'رصيد أوّل اليوم', '', '', money(D.opening)], 'D4 أوّل سطر رصيد أوّل اليوم');
      t.same(
        table.body.slice(1).map((tr) => [cells(tr), hrefOf(descendants(tr.children[0]).find((n) => n.localName === 'a')), hrefOf(descendants(tr.children[1]).find((n) => n.localName === 'a'))]),
        D.rows.map((row) => [
          [row.doc_no ?? (expectedHref(row) ? 'سند النقل' : ''), row.party_name ?? '', expectedMemo(row, true), fils(row.inflow) === 0n ? '' : money(row.inflow), fils(row.outflow) === 0n ? '' : money(row.outflow), money(row.balance)],
          expectedHref(row) && `${expectedHref(row)}?back=${encodeURIComponent(`/accounts/cash/${D.account.id}/day?on=${D.from}`)}`,
          row.party_id ? `/accounts/parties/${row.party_id}?back=${encodeURIComponent(`/accounts/cash/${D.account.id}/day?on=${D.from}`)}` : null,
        ]),
        'D5 كلّ حركة برقمها (رابط سندها أو مستندها) وجهتها وبيانها ورصيدها',
      );
      const classed = D.rows.map((row, index) => [row, index]).filter(([row]) => row.class === 'expense' || row.class === 'transfer');
      t.ok(classed.length > 0 && classed.every(([row, index]) => cells(table.body[index + 1])[2].includes(`${LABEL[row.class]}: `)), 'D6 بلا عمود النوع: المصروف والتحويل يسبقهما اسم صنفهما');
      t.same(table.foot.map(cells), [['مجموع اليوم', money(D.totals.inflow), money(D.totals.outflow), money(D.closing)]], 'D7 مجموع اليوم ورصيد آخره');
      t.eq(hrefOf(first('cash-day-previous')), `/accounts/cash/${D.account.id}/day?on=${addDays(D.from, -1)}`, 'D8 اليوم السابق');
      t.eq(hrefOf(first('cash-day-next')), D.from >= TODAY ? null : `/accounts/cash/${D.account.id}/day?on=${addDays(D.from, 1)}`, 'D9 اليوم التالي، ولا يوم تالٍ بعد اليوم');
      const signatures = text(first('signatures'));
      t.ok(signatures.includes('أمين الصندوق') && signatures.includes('المحاسب'), 'D10 سطرا التوقيع: أمين الصندوق والمحاسب');
      t.ok(descendants(body()).some((n) => n.hasAttribute('data-print-area') && descendants(n).includes(first('signatures')) && descendants(n).some((x) => x.localName === 'table')), 'D11 اليومية والتوقيع داخل منطقة الطباعة');
      await click(first('print-cash-day'));
      t.same(printed, [`يومية الصندوق — ${D.account.name} — ${fmtDay(D.from)}`], 'D12 الطباعة بعنوان «يومية الصندوق — الصندوق — اليوم»');
      fire(globalThis.window, 'afterprint');
      t.eq(globalThis.document.title, 'نظام الدواجن', 'D13 العنوان يعود بعد الطباعة');
      await unmount();
      // يوم قبل اليوم: «اليوم التالي» يظهر، والنداء بيومه
      const earlier = addDays(TODAY, -3);
      fresh();
      await mount(`/accounts/cash/${D.account.id}/day?on=${earlier}`);
      t.same([callsOf('money_moves')[0]?.p_from, callsOf('money_moves')[0]?.p_to, hrefOf(first('cash-day-next'))], [earlier, earlier, `/accounts/cash/${D.account.id}/day?on=${addDays(earlier, 1)}`], 'D14 يوم سابق: النداء بيومه و«اليوم التالي»');
      await unmount();
      // بلا ?on: يوم الجهاز
      fresh();
      await mount(`/accounts/cash/${D.account.id}/day`);
      t.eq(callsOf('money_moves')[0]?.p_from, TODAY, 'D15 بلا يوم في الرابط: اليوم');
      await unmount();
      // يوم بلا حركة: رصيد أوّله = آخره، والجدول بسطر البداية وحده
      const empty = { ...clone(D), rows: [], days: [], totals: { inflow: '0', outflow: '0', count: 0 }, closing: D.opening };
      fresh({ money_moves: () => clone(empty) });
      await mount(`/accounts/cash/${D.account.id}/day?on=${D.from}`);
      const emptyTable = tableOf(body());
      t.same(
        [text().includes('لا حركة في هذا الصندوق في هذا اليوم.'), emptyTable.body.length, emptyTable.foot.map(cells)],
        [true, 1, [['مجموع اليوم', fmt(0n, decimalsOf([fils(D.opening)])), fmt(0n, decimalsOf([fils(D.opening)])), fmt(fils(D.opening), decimalsOf([fils(D.opening)]))]]],
        'D16 يوم فارغ: يقول ذلك، وآخره = أوّله',
      );
    });

    // ── S خلاصة الشهر ──────────────────────────────────────────────────────────────────────────────────────────
    /** سطور الكتلة المنتظرة من العيّنة (البند | العدد | المبلغ). */
    const blockExpect = (block) => {
      const amounts = [];
      const lines = [];
      const add = (label, count, amount) => {
        lines.push([label, count === null ? '' : m.fmtInt(count), amount]);
        if (amount !== null) amounts.push(fils(amount));
      };
      const { sales, purchases, expenses, production, feed_issue: feed } = block;
      add('المبيعات (الإيراد)', sales.count, sales.revenue);
      if (sales.cost !== null) add('كلفة المبيعات', null, sales.cost);
      if (sales.gross !== null) add('الربح الإجمالي', null, sales.gross);
      add('المشتريات', purchases.count, purchases.total);
      add('منها نقداً', null, purchases.cash);
      add('منها بالدين', null, purchases.credit);
      add('المصاريف', null, expenses.total);
      for (const category of expenses.categories) add(category.name, null, category.amount);
      if (production) add(`إنتاج المعمل: ${m.fmtQty(milli(production.output_kg), 'kg').main}`, production.batches, production.cost);
      if (feed) add('صرف العلف للأفواج', feed.issues, feed.cost);
      const decimals = decimalsOf(amounts);
      return lines.map(([label, count, amount]) => [label, count, amount === null ? '—' : fmt(fils(amount), decimals)]);
    };
    const emptyDivision = (d) =>
      d.sales.count === 0 && fils(d.sales.revenue) === 0n && d.purchases.count === 0 && fils(d.purchases.total) === 0n && fils(d.expenses.total) === 0n && d.expenses.categories.length === 0 && !d.production && !d.feed_issue;

    await step('S', async () => {
      const month = MS.month.slice(0, 7);
      const printed = [];
      globalThis.window.print = () => printed.push(globalThis.document.title);
      t.ok(MS.divisions.some(emptyDivision) && MS.divisions.some((d) => !emptyDivision(d)), 'شرط month_summary: قسم بلا حركة وقسم بحركة');
      fresh();
      await mount(`/accounts/month?m=${month}`);
      t.same(callsOf('month_summary'), [{ p_month: `${month}-01` }], 'S1 نداء واحد بأوّل الشهر');
      t.eq(text(first('monthsum-disclaimer')), 'خلاصة تشغيلية، لا قائمة دخل محاسبية.', 'S2 رأسها يقول إنّها خلاصة تشغيلية لا قائمة دخل');
      t.ok(text().includes(`خلاصة ${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`) && text().includes(`من ${fmtDay(MS.from)} إلى ${fmtDay(MS.to)}`), 'S3 العنوان باسم الشهر وسنته، والمدّة من الخادم');
      t.same(tableOf(first('monthsum-project')).body.map(cells), blockExpect(MS.project), 'S4 المشروع: المبيعات وكلفتها وربحها، والمشتريات نقداً وبالدين، والمصاريف بفئاتها، والإنتاج وكلفته، وصرف العلف');
      const sections = byAction('monthsum-division');
      t.same(sections.map((n) => n.getAttribute('data-division')), MS.divisions.map((d) => d.division_id), 'S5 كتلة لكلّ قسم بترتيب الخادم');
      MS.divisions.forEach((division, index) => {
        const section = sections[index];
        if (emptyDivision(division)) t.same([text(section).includes('لا بيع ولا شراء ولا مصروف هذا الشهر.'), tableOf(section).body.length], [true, 0], `S6 ${division.kind} بلا حركة: سطر بدل جدول أصفار`);
        else t.same(tableOf(section).body.map(cells), blockExpect(division), `S7 ${division.kind}: بنوده بأرقامه`);
      });
      const cashDecimals = decimalsOf([MS.cash.inflow, MS.cash.outflow, MS.cash.net].map(fils));
      t.same(
        ['in', 'out', 'net'].map((key) => text(first(`monthsum-cash-${key}`))),
        [`دخل نقداً${fmt(fils(MS.cash.inflow), cashDecimals)}`, `خرج نقداً${fmt(fils(MS.cash.outflow), cashDecimals)}`, `صافي التدفّق النقدي${fmt(fils(MS.cash.net), cashDecimals)}`],
        'S8 النقد في المنشأة كلّها: الداخل والخارج والصافي',
      );
      t.eq(hrefOf(first('month-previous')), `/accounts/month?m=${shiftMonth(month, -1)}`, 'S9 الشهر السابق');
      t.eq(hrefOf(first('month-next')), month >= TODAY.slice(0, 7) ? null : `/accounts/month?m=${shiftMonth(month, 1)}`, 'S10 الشهر التالي، ولا شهر بعد الشهر الحالي');
      await click(first('print-month'));
      t.same(printed, [`خلاصة ${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`], 'S11 الطباعة بعنوان الخلاصة وشهرها');
      t.ok(descendants(body()).some((n) => n.hasAttribute('data-print-area') && descendants(n).includes(first('monthsum-project'))), 'S12 الكتل داخل منطقة الطباعة');
      await unmount();
      // شهر سابق: «الشهر التالي» يظهر؛ وبلا ?m الشهر الحالي
      const previous = shiftMonth(TODAY.slice(0, 7), -1);
      fresh();
      await mount(`/accounts/month?m=${previous}`);
      t.same([callsOf('month_summary')[0]?.p_month, hrefOf(first('month-next'))], [`${previous}-01`, `/accounts/month?m=${TODAY.slice(0, 7)}`], 'S13 شهر سابق: النداء بأوّله و«الشهر التالي»');
      await unmount();
      fresh();
      await mount('/accounts/month');
      t.eq(callsOf('month_summary')[0]?.p_month, `${TODAY.slice(0, 7)}-01`, 'S14 بلا شهر في الرابط: الشهر الحالي');
      await unmount();
      // الكلفة محجوبة: بلا كلفة المبيعات ولا الربح، والإنتاج والصرف بلا مبلغ
      const blind = clone(MS);
      for (const block of [blind.project, ...blind.divisions]) {
        block.sales.cost = null;
        block.sales.gross = null;
        if (block.production) block.production.cost = null;
        if (block.feed_issue) block.feed_issue.cost = null;
      }
      fresh({ month_summary: () => clone(blind) });
      await mount(`/accounts/month?m=${month}`);
      const blindRows = tableOf(first('monthsum-project')).body.map(cells);
      t.same(blindRows, blockExpect(blind.project), 'S15 الكلفة محجوبة: السطور بلا الكلفة والربح، والإنتاج والصرف «—»');
      t.ok(!blindRows.some(([label]) => label === 'كلفة المبيعات' || label === 'الربح الإجمالي') && blindRows.some((row) => row[0].startsWith('إنتاج المعمل') && row[2] === '—'), 'S16 لا كلفة ولا ربح ولا مبلغ إنتاج لمن لا يرى الكلفة');
    });

    // ── C الصناديق وكشف الصندوق ────────────────────────────────────────────────────────────────────────────────
    await step('C', async () => {
      fresh();
      await mount('/accounts/cash');
      t.same(byAction('cash-day').map(hrefOf), O.cash.boxes.map((box) => `/accounts/cash/${box.account_id}/day`), 'C1 «يومية اليوم» لكلّ صندوق');
      t.same(byAction('cash-day').map((n) => text(n)), O.cash.boxes.map(() => 'يومية اليوم'), 'C2 باسمها');
      await unmount();
      const box = MM.box;
      fresh();
      await mount(`/accounts/cash/${box.account.id}`);
      const ledger = tableOf(body());
      const offset = fils(box.opening) === 0n ? 0 : 1;
      const want = box.rows.map((row) => {
        if ((row.kind === 'party_payment' || row.kind === 'party_payout') && !row.doc_kind) return `/accounts/voucher/${row.voucher_id}`;
        if (row.doc_kind === 'receipt') return `/inventory/receipts/${row.doc_id}`;
        if (row.doc_kind === 'sale') return `/sales/${row.doc_id}`;
        if (row.doc_kind === 'cash_transfer') return `/accounts/transfer/${row.doc_id}`;
        return null;
      });
      const got = box.rows.map((_, index) => hrefOf(first('ledger-doc', ledger.body[index + offset])));
      const boxBack = (href) => (href ? `${href}?back=${encodeURIComponent(`/accounts/cash/${box.account.id}`)}` : null);
      t.same(got, want.map(boxBack), 'C3 كشف الصندوق: رقم البيع والشراء وأجوره والتحويل إلى مستنده، والقبض والدفع إلى سندهما (voucher_id، وللإلغاء السند الأصليّ)، والمصروف بلا رابط؛ وكلّ رابط يرجع إلى كشف الصندوق (M4)');
      // L4: أجرة الشراء النقدية برقم الشراء نفسه (doc_no من الخادم منذ 0024) ورابط استلامه، لا «السند».
      const charges = (F.cash_statement?.lines ?? []).map((line, index) => [line, index]).filter(([line]) => line.kind === 'receipt_charge');
      t.ok(
        charges.length > 0 && charges.every(([line, index]) => text(first('ledger-doc', ledger.body[index + offset])) === line.doc_no && hrefOf(first('ledger-doc', ledger.body[index + offset])) === boxBack(`/inventory/receipts/${line.doc_id}`)),
        'L4 أجرة الشراء النقدية في كشف الصندوق برقم الشراء ورابط استلامه',
      );
      t.ok(!byAction('ledger-doc').some((n) => text(n) === 'السند' && (hrefOf(n) ?? '').startsWith('/inventory/receipts/')), 'L4 ولا «السند» على رابط استلام');
      t.ok(want.some((href) => href?.startsWith('/accounts/voucher/')) && want.some((href) => href?.startsWith('/inventory/receipts/')) && want.some((href) => href === null), 'شرط box: قبض أو دفع وشراء ومصروف');
      await unmount();
      // خادم أقدم بلا voucher_id: رقم القبض يفتح حركة الصندوق بيومه، وفيها رابط السند.
      fresh({ report_cash_statement: () => cashStatement(MM.box) });
      await mount(`/accounts/cash/${box.account.id}`);
      const oldLedger = tableOf(body());
      const viaMoves = box.rows.findIndex((row) => (row.kind === 'party_payment' || row.kind === 'party_payout') && !row.doc_kind);
      await click(first('ledger-doc', oldLedger.body[viaMoves + offset]));
      t.same(
        [where?.pathname, callsOf('money_moves').at(-1)],
        ['/accounts/moves', { p_from: box.rows[viaMoves].on_date, p_to: box.rows[viaMoves].on_date, p_account: box.account.id, p_class: null, p_party: null, p_after: null, p_limit: 100 }],
        'C4 رقم القبض يفتح حركة الصندوق بيومه، وفيها رابط السند',
      );
    });

    // ── مراجعة 0024 (الشاشات): كلّ إصلاح بفحص يفشل على الشفرة قبله ─────────────────────────────────────────────────────
    // M4: السند والفاتورة المفتوحان من حركة الأموال ويومية الصندوق يرجعان إليهما بفلاترهما (REV-4، REV-15).
    await step('M4 back to where it was opened', async () => {
      const url = `/accounts/moves?account=${MM.box.account.id}&from=${MM.box.from}&to=${MM.box.to}`;
      fresh({ voucher_detail: () => clone(B.voucher_detail.receipt) });
      await mount(url);
      t.eq(new URLSearchParams(hrefOf(first('move-party'))?.split('?')[1] ?? '').get('back'), url, 'M4 كشف الجهة من حركة الأموال يرجع إليها بفلاترها (REV-15)');
      await click(byAction('move-doc').find((n) => (hrefOf(n) ?? '').startsWith('/accounts/voucher/')));
      t.same([where?.pathname.startsWith('/accounts/voucher/'), hrefOf(first('back'))], [true, url], 'M4 «رجوع» السند المفتوح من حركة الأموال إليها بفلاترها (REV-4a)');
      await click(first('back'));
      t.same([`${where?.pathname}${where?.search}`, callsOf('money_moves').at(-1)?.p_account], [url, MM.box.account.id], 'M4 والرجوع يفتح حركة الأموال بفلاترها');
      await unmount();
      fresh({ sale_detail: () => clone(B.sale_detail) });
      await mount(url, true);
      await click(byAction('move-doc').find((n) => (hrefOf(n) ?? '').startsWith('/sales/')));
      t.same([where?.pathname.startsWith('/sales/'), hrefOf(first('back'))], [true, url], 'M4 «رجوع» فاتورة البيع المفتوحة من حركة الأموال إليها (REV-4b)');
      await unmount();
      const dayUrl = `/accounts/cash/${D.account.id}/day?on=${D.from}`;
      fresh({ voucher_detail: () => clone(B.voucher_detail.void) });
      await mount(dayUrl);
      await click(byAction('move-doc').find((n) => (hrefOf(n) ?? '').startsWith('/accounts/voucher/')));
      t.eq(hrefOf(first('back')), dayUrl, 'M4 «رجوع» السند المفتوح من يومية الصندوق إليها بيومها (REV-4c)');
    });

    // MUT-2: تغيير فلتر و«حمّل المزيد» في الطريق: صفحة الفلتر القديم لا تُلحق بجدول الفلتر الجديد.
    await step('MUT-2 filter change while loading more', async () => {
      let release = () => {};
      const pending = new Promise((resolve) => {
        release = resolve;
      });
      fresh({ money_moves: (args) => (args.p_after ? pending.then(() => page2()) : movesFor(args)) });
      await mount('/accounts/moves');
      await click(first('more-moves'));
      const cls = MM.filtered.rows[0].class;
      await choose(first('filter-class'), cls);
      release();
      await click(null);
      await click(null);
      const moves = tableOf(body()).body.filter((tr) => !cells(tr).includes('مجموع اليوم'));
      t.same([moves.length, text(first('moves-count'))], [MM.filtered.rows.length, `${m.fmtInt(MM.filtered.rows.length)} من المجموع ${m.fmtInt(MM.filtered.totals.count)}`], 'MUT-2 صفحة طُلبت بالفلتر القديم لا تُلحق بعد تغييره');
    });

    // MUT-4 وMUT-5: كلفة المبيع بفلوس (نسخة بكلفة «1234.56»): الخلاصة وخلاصة الشهر تعرضانها بمراتبها، لا تسقطان.
    await step('MUT-4/5 cost with fils', async () => {
      const hub = clone(O);
      hub.month.sales.cost = '1234.56';
      fresh({ money_overview: () => clone(hub) });
      await mount('/accounts');
      t.ok(text(first('hub-sales')).includes(`كلفتها${fmt(fils('1234.56'))}`) && fmt(fils('1234.56')) === '1,234.56', `MUT-4 كلفة المبيعات بفلوسها في الخلاصة: «${text(first('hub-sales'))}»`);
      await unmount();
      const month = clone(MS);
      month.project.sales.cost = '1234.56';
      fresh({ month_summary: () => clone(month) });
      await mount(`/accounts/month?m=${MS.month.slice(0, 7)}`);
      const rows = tableOf(first('monthsum-project')).body.map(cells);
      t.same(rows, blockExpect(month.project), 'MUT-5 كتلة المشروع بمرتبتين للعمود كلّه حين في كلفتها فلوس');
      t.ok(rows.some(([label, , amount]) => label === 'كلفة المبيعات' && amount === '1,234.56'), 'MUT-5 والكلفة «1,234.56»');
    });

    // L1 وL8: خلاصة الشهر لا تنقسم كتلها وبطاقة النقد بين صفحتين، والأقسام بأسمائها الكاملة كما في الكشف والسندات.
    await step('L1/L8 month summary', async () => {
      fresh();
      await mount(`/accounts/month?m=${MS.month.slice(0, 7)}`);
      t.ok([first('monthsum-project'), ...byAction('monthsum-division'), first('monthsum-cash')].every((n) => n?.hasAttribute('data-keep')), 'L1 كلّ كتلة وبطاقة النقد data-keep (لا تنقسم بالطباعة)');
      const FULL = { feed_mill: 'معمل العلف', broiler: 'حقول اللحم', layer: 'حقول البيض', hatchery: 'المفقس', medicine: 'مخزن الأدوية', general: 'المخازن العامة' };
      t.same(
        byAction('monthsum-division').map((section) => text(descendants(section).find((n) => n.localName === 'h2'))),
        MS.divisions.map((division) => FULL[division.kind]),
        'L8 الأقسام بأسمائها الكاملة («معمل العلف» لا «المعمل»)',
      );
    });


    // ── R نقل المسارات ─────────────────────────────────────────────────────────────────────────────────────────
    await step('R', async () => {
      fresh();
      await mount('/accounts');
      t.same([callsOf('money_overview').length, callsOf('report_accounts_summary').length, Boolean(first('hub-cash'))], [1, 0, true], 'R1 /accounts: «خلاصة المال»');
      await unmount();
      fresh();
      await mount('/accounts/parties');
      const title = descendants(body()).find((n) => n.localName === 'h1');
      t.same(
        [callsOf('money_overview').length, callsOf('report_accounts_summary').length, text(title), hrefOf(first('open-hub')), Boolean(first('open-cash'))],
        [0, 1, 'الجهات', '/accounts', true],
        'R2 /accounts/parties: صفحة الجهات كما كانت (ملخّصها وجدولها وروابطها)، وبرابط إلى الخلاصة',
      );
      await unmount();
      for (const [url, fn] of [
        ['/accounts/moves', 'money_moves'],
        ['/accounts/month', 'month_summary'],
        [`/accounts/cash/${D.account.id}/day`, 'money_moves'],
      ]) {
        fresh();
        await mount(url);
        t.eq(callsOf(fn).length, 1, `R3 ${url} ← ${fn}`);
        await unmount();
      }
      // الشاشات على الهاتف: كلّ جدول داخل غلافه القابل للتمرير، والصفحة نفسها لا تُفرض أعرض من الشاشة (min-w-0 للصفحة وللبطاقات).
      for (const url of ['/accounts', '/accounts/moves', `/accounts/cash/${D.account.id}/day?on=${D.from}`, `/accounts/month?m=${MS.month.slice(0, 7)}`]) {
        fresh();
        await mount(url);
        const tables = descendants(body()).filter((n) => n.localName === 'table');
        const wrapped = tables.every((table) => classOf(table.parentNode).split(/\s+/).includes('overflow-auto'));
        const fixedWidth = descendants(body()).filter((n) => /(^|\s)(w|min-w)-\[(?!0)/.test(classOf(n)));
        t.same([tables.length > 0, wrapped, fixedWidth.length], [true, true, 0], `R4 ${url}: الجداول تتمرّر داخل غلافها، ولا عرض ثابت`);
        await unmount();
      }
    });
  } catch (error) {
    t.ok(false, `money-screens: رمى ${error?.stack ?? error}`);
  } finally {
    if (root) {
      try {
        root.unmount();
      } catch {
        // already gone
      }
    }
    globalThis.Date = RealDate;
    delete globalThis.__money;
    restoreDom();
  }
}
