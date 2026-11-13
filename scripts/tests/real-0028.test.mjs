// تكامل 0028 بأجوبة القاعدة الحقيقية (درس 2026-11-02: الشاشات لا تلمس قاعدة حقيقية، فجواب القاعدة الحقيقي يمرّ بمحلّل الشاشات الحقيقي محزوماً
// بـesbuild، لا بنسخة منه ولا بجواب مكتوب باليد). العيّنات: fixtures/birds-0028.json (supabase/tests/birds.test وclose.test بـBIRDS_SAMPLES_OUT=1)
// وfixtures/reports-0027.json (reports.test بـREPORTS_SAMPLES_OUT=1، على شجرة 0028).
// K كلّ عيّنة لها محلّلها الحقيقي ولا يرمي (لا عيّنة بلا محلّل).
// A المحلّل لا يسأل عن مفتاح لم يرسله الخادم إلّا الغائب قناعاً أو حالةً (money وstores، وأفعال التذكرة في نموذج الفاتورة، وsite في الخيارات بلا حقل)،
//   وكلّ مفتاح بالاسم نفسه في الشاشة يُقرأ بقيمته: النصّ والعدد والمنطقيّ كما هي، والعشريّ بمرتبته بلا ضياع، والغائب null لا صفر.
// R المفاتيح التي تسمّيها الشاشة بغير اسمها: التنزيل، وحصّة الفوج من الإيراد، وقيمة سطر الإغلاق، والحقل في الخيارات، وأيّام التقرير الكامل (المباع وصافيه
//   وفرق العدّ يوماً بيوم).
// M المرآة = الخادم: صافي كلّ قاعة ومعدّلها ومجاميع كلّ تذكرة (القبّان وميزان الأقفاص)، والوزن المحسوب والمبلغ والحصص لكلّ فاتورة.
// P صفحات القاعات بأجوبة القاعدة: التقرير الكامل (عمود فرق العدّ وعمود المباع في الأيّام، ومخزن العلف المنقول)، والتقرير اليوميّ (المباع والتذاكر
//   بلا فاتورة وفرق العدّ، والعلف المنقول على القاعة الفارغة)، وبطاقة الفوج، والتذكرة بوزنات ميزان الأقفاص، وقائمة التذاكر، ونموذج الإغلاق.
import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { descendants, installDom, settle } from './dom.mjs';
import { all, body, byAction, click, clone, dialog, memoryStorage, ROOT, sessionOf, tableRows, withAttr, within } from './halls-0028-kit.mjs';

const FIXTURES = path.join(ROOT, 'scripts', 'tests', 'fixtures');
const read = (name) => (existsSync(path.join(FIXTURES, name)) ? JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8')) : null);
const MANAGER = sessionOf('manager');

const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const STUBS = {
  session: 'export const useSession = () => globalThis.__h8.session; export const sessionStore = { get: () => globalThis.__h8?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__h8.toasts.push(spec); }; export function Toaster() { return null; }',
};
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__h8.rpc(fn, args);
export const send = async () => { throw new Error('real-0028: no direct table access'); };
export const classifyPostgrest = (error) => new RejectedError(error.code ?? 'x', error.hint ?? null);
export const explained = async (error) => error;
export const updatedRows = () => { throw new ZeroRowsError(); };
export const written = async () => { throw new Error('real-0028: no direct writes'); };
export const withStatus = (value) => value;
export const authed = async () => ({ userId: globalThis.__h8?.session?.workspace?.userId ?? null, db: null });
export const unknownConstraint = () => '';`;

async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route } from 'react-router-dom';",
    "export { default as HallsRoutes, FlockCard } from './src/pages/halls/HallsRoutes.tsx';",
    "export * as tickets from './src/lib/repo/weighTickets.ts';",
    "export * as close from './src/lib/repo/flockClose.ts';",
    "export * as halls from './src/lib/repo/halls.ts';",
    "export * as days from './src/lib/repo/hallReports.ts';",
    "export * as birds from './src/lib/repo/birdSales.ts';",
    "export * as flocks from './src/lib/repo/flocks.ts';",
    "export * as statement from './src/lib/repo/statement.ts';",
    "export * as money from './src/lib/repo/money.ts';",
    "export { ticketNets, billedKg, saleTotal, revenueSplit } from './src/domain/weighTicket.ts';",
    "export { signedCount } from './src/pages/halls/ticketParts.tsx';",
    "export { fmtDay, fmtInt } from './src/lib/format.ts';",
  ].join('\n');
  const result = await build({
    stdin: { contents: entry, resolveDir: ROOT, loader: 'tsx' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    jsx: 'automatic',
    logLevel: 'silent',
    loader: { '.css': 'empty' },
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'real-0028-stubs',
        setup(b) {
          b.onResolve({ filter: /\/lib\/session$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'r28-stub' }));
          b.onLoad({ filter: /.*/, namespace: 'r28-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
          b.onResolve({ filter: /^\.\/core$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('src/lib/repo/') ? { path: 'core', namespace: 'r28-core' } : undefined));
          b.onLoad({ filter: /.*/, namespace: 'r28-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(`${result.outputFiles[0].text}\n// real-0028 bundle\n`).toString('base64')}`);
}

/** نصّ عشريّ من الخادم ← عدد صحيح بمرتبة ثابتة (يرمي إن ضاع رقم). */
export function scaledOf(text, scale) {
  if (text === null || text === undefined) return null;
  const value = String(text);
  const negative = value.startsWith('-');
  const [whole, frac = ''] = (negative ? value.slice(1) : value).split('.');
  if (frac.replace(/0+$/u, '').length > scale) throw new RangeError(`${value} بأكثر من ${scale} مراتب`);
  const units = BigInt(whole + frac.slice(0, scale).padEnd(scale, '0'));
  return negative ? -units : units;
}
const milli = (text) => scaledOf(text, 3);
const fils = (text) => scaledOf(text, 2);

/** وكيل يسجّل كلّ مفتاح سأل عنه المحلّل: الموجود، والغائب (لم يرسله الخادم). */
export function recorder(value) {
  const missing = new Set();
  const wrap = (node, at) => {
    if (node === null || typeof node !== 'object') return node;
    return new Proxy(node, {
      get(target, key, receiver) {
        const out = Reflect.get(target, key, receiver);
        if (typeof key === 'symbol') return out;
        if (Array.isArray(target)) return /^\d+$/u.test(key) ? wrap(out, `${at}[]`) : out;
        if (typeof Object.prototype[key] === 'function' && !Object.hasOwn(target, key)) return out;
        if (!Object.hasOwn(target, key)) missing.add(`${at}.${key}`);
        return wrap(out, `${at}.${key}`);
      },
      has(target, key) {
        if (typeof key === 'string' && !Array.isArray(target) && !Object.hasOwn(target, key)) missing.add(`${at}.${key}`);
        return Reflect.has(target, key);
      },
    });
  };
  return { proxy: wrap(value, ''), missing };
}

/**
 * الغائب المقبول: القناع (money)، ومخازن الإرجاع لسطر منقول معلَّق وحده (stores)، وأفعال التذكرة في نموذج الفاتورة (العقد §5.4)، وsite في الخيارات بلا حقل.
 * ومفاتيح أجوبة المالك 2026-11-13 (مراجعة 0028 O4: الفاتورة المتأخّرة بتاريخ اليوم، والطيور بيوم التذكرة، والمقبوض يوم الإصدار) قبل أن تعيد القاعدة
 * العيّنات بها: invoice_on وlate وpaid_on في النموذج والقائمة، وinvoice_late في التذكرة وقائمتها، وon وticket_on وpaid_on في الفاتورة؛ غيابها = سلوك اليوم
 * (الفاتورة والمقبوض بيوم التذكرة)، ويُقرأ بقيمته حين يرسله الخادم (فحص A بالاسم نفسه).
 */
const OPTIONAL = [
  /(^|\.)money$/u,
  /(^|\.)stores$/u,
  /^\.then$/u,
  /^\.ticket\.can$/u,
  /^\.site$/u,
  /(^|\.)(invoice_on|late|paid_on|ticket_on|invoice_late)$/u,
  /^(\.sale)?\.on$/u,
];

const camel = (key) => key.replace(/_([a-z0-9])/gu, (_, c) => c.toUpperCase());
const NUMERIC = /^-?\d+(\.\d+)?$/u;
/** المقابلة بالاسم نفسه (snake ← camel): كلّ ما يقابله في جواب المحلّل يساويه بقيمته؛ والمسمّى بغير اسمه لا يُقارن هنا (R يقارنه). */
export function disagreements(raw, parsed, at = '', out = []) {
  if (parsed === undefined) return out;
  if (raw === null) {
    if (parsed !== null && !(Array.isArray(parsed) && parsed.length === 0)) out.push(`${at}: الخادم null والشاشة ${typeof parsed === 'bigint' ? `${parsed}n` : JSON.stringify(parsed)}`);
    return out;
  }
  if (Array.isArray(raw)) {
    if (!Array.isArray(parsed)) out.push(`${at}: قائمة والشاشة ${typeof parsed}`);
    else if (raw.length !== parsed.length) out.push(`${at}: ${raw.length} عنصراً والشاشة ${parsed.length}`);
    else raw.forEach((item, i) => disagreements(item, parsed[i], `${at}[${i}]`, out));
    return out;
  }
  if (typeof raw === 'object') {
    if (typeof parsed !== 'object' || parsed === null) out.push(`${at}: كائن والشاشة ${String(parsed)}`);
    else for (const [key, value] of Object.entries(raw)) disagreements(value, parsed[camel(key)], `${at}.${key}`, out);
    return out;
  }
  if (typeof parsed === 'bigint' && (typeof raw === 'number' || (typeof raw === 'string' && NUMERIC.test(raw)))) {
    const text = String(raw);
    const [, frac = ''] = text.replace('-', '').split('.');
    const fits = [0, 1, 2, 3, 4].some((scale) => frac.replace(/0+$/u, '').length <= scale && scaledOf(text, scale) === parsed);
    if (!fits) out.push(`${at}: ${text} والشاشة ${parsed}n`);
    return out;
  }
  if (raw !== parsed) out.push(`${at}: ${JSON.stringify(raw)} والشاشة ${typeof parsed === 'bigint' ? `${parsed}n` : JSON.stringify(parsed)}`);
  return out;
}

/** كلّ كائن في الشجرة يحقّق الشرط، بمساره. */
function collect(node, test, at = '', out = []) {
  if (node === null || typeof node !== 'object') return out;
  if (!Array.isArray(node) && test(node)) out.push([at, node]);
  for (const [key, value] of Object.entries(node)) collect(value, test, Array.isArray(node) ? `${at}[${key}]` : `${at}.${key}`, out);
  return out;
}

export default async function (t) {
  const B = read('birds-0028.json');
  const REPORTS = read('reports-0027.json');
  t.ok(B !== null, 'عيّنات القاعدة الحقيقية موجودة (birds-0028.json)');
  t.ok(REPORTS !== null, 'عيّنات القاعدة الحقيقية موجودة (reports-0027.json)');
  if (!B || !REPORTS) return;

  const restore = installDom();
  const saved = { session: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'), local: Object.getOwnPropertyDescriptor(globalThis, 'localStorage') };
  Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage().api, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage().api, configurable: true, writable: true });
  let root = null;
  let m = null;
  try {
    m = await bundle();
    const answer = (sample) => async () => clone(sample);
    const viaRpc = (run) => async (proxy) => {
      globalThis.__h8 = { session: MANAGER, toasts: [], rpc: async () => proxy };
      return run();
    };

    // المحلّل الحقيقي لكلّ عيّنة بأطول بادئة من اسمها، وما يقابل جوابَ الخادم في جوابه (التقرير الكامل يجمع الأيّام والمؤشّرات تحت cycle).
    const PARSERS = {
      save_weigh_ticket: (v) => m.tickets.parseSaveResult(v),
      finish_weigh_ticket: (v) => m.tickets.parseWeighTicket(v),
      weigh_ticket_options: (v) => m.tickets.parseTicketOptions(v),
      weigh_tickets: (v) => m.tickets.parseTicketList(v),
      weigh_ticket: (v) => m.tickets.parseWeighTicket(v),
      record_bird_sale: (v) => m.birds.parseBirdSale(v),
      void_bird_sale: (v) => m.birds.parseVoidedBirdSale(v),
      bird_sale_form: (v) => m.birds.parseBirdSaleForm(v),
      bird_sale_detail: (v) => m.birds.parseBirdSaleDetail(v),
      sales_overview: viaRpc(() => m.birds.loadSales('2026-11-01', '2026-11-12')),
      sales_report: viaRpc(() => m.birds.loadSalesReport('2026-11-01', '2026-11-12', 'party')),
      party_statement_v2: (v) => m.statement.parsePartyStatement(v),
      money_overview: (v) => m.money.parseMoneyOverview(v),
      flock_sales: (v) => m.close.parseFlockSales(v),
      flock_detail: (v) => m.flocks.parseDetail(v),
      flock_cycles: (v) => m.days.parseFlockCycles(v),
      flock_cycle_report: (v) => m.halls.parseCycleReport(v),
      halls_day: (v) => m.days.parseHallsDay(v),
      close_flock: (v) => m.close.parseCloseResult(v),
      flock_close_form: (v) => m.close.parseCloseForm(v),
      flock_month: (v) => m.halls.parseFlockMonth(v),
      flock_feed: (v) => m.flocks.parseFlockFeed(v),
      record_flock_count_adjust: viaRpc(() => m.close.recordCountAdjust({ clientRef: 'r', id: 'i', flockId: 'f', on: '2026-11-12', birds: 1, reason: 'س', expectedLive: 1 })),
      open_flock: viaRpc(() => m.flocks.openFlock({ hallId: 'h', placedOn: '2026-11-12', placedCount: 1, ageDays: 0, breed: 'س' }, 'r')),
      return_hall_carry: viaRpc(() => m.close.returnHallCarry('r', 'i', 'l', 'w')),
      reopen_flock: viaRpc(() => m.close.reopenFlock('c', 'س', 'r')),
    };
    const PREFIXES = Object.keys(PARSERS).sort((a, b) => b.length - a.length);
    const prefixOf = (key) => PREFIXES.find((prefix) => key === prefix || key.startsWith(`${prefix}_`)) ?? null;
    const view = (prefix, parsed) => (prefix === 'flock_cycle_report' && parsed?.cycle ? { ...parsed, ...parsed.cycle } : parsed);

    // ── K وA: كلّ عيّنة بمحلّلها الحقيقي، ولا مفتاح غائب يُسأل عنه، وكلّ مفتاح بالاسم نفسه بقيمته ──────────────────────────────────────
    const keys = Object.keys(B).filter((key) => key !== '_note');
    const refusals = keys.filter((key) => key.startsWith('refusal_'));
    const answers = keys.filter((key) => !key.startsWith('refusal_'));
    t.same(answers.filter((key) => prefixOf(key) === null), [], 'K كلّ عيّنة في birds-0028.json لها محلّلها الحقيقي');
    t.same(
      refusals.filter((key) => typeof B[key]?.code !== 'string' || typeof B[key]?.hint !== 'string' || !/[\u{600}-\u{6FF}]/u.test(B[key].hint)),
      [],
      'K كلّ رفض في العيّنات برمزه وجملته العربية (الشاشات تعرض hint الخادم كما هو)',
    );
    const parsedOf = {};
    for (const key of answers) {
      const prefix = prefixOf(key);
      if (!prefix) continue;
      const { proxy, missing } = recorder(clone(B[key]));
      let parsed = null;
      let error = null;
      try {
        parsed = await PARSERS[prefix](proxy);
      } catch (problem) {
        error = problem?.field ?? problem?.message ?? String(problem);
      }
      parsedOf[key] = parsed;
      t.eq(error, null, `K ${key}: المحلّل الحقيقي (${prefix}) بلا خطأ شكل`);
      t.same([...missing].filter((at) => !OPTIONAL.some((re) => re.test(at.replace(/\[\]/gu, '')))).sort(), [], `A ${key}: المحلّل لا يسأل عن مفتاح لم يرسله الخادم`);
      if (parsed && typeof parsed === 'object') t.same(disagreements(B[key], view(prefix, parsed)), [], `A ${key}: كلّ مفتاح بالاسم نفسه بقيمته ومرتبته، والغائب null لا صفر`);
    }

    // ── R: المفاتيح المسمّاة بغير اسمها ─────────────────────────────────────────────────────────────────────────────────────────
    {
      const sales = [
        ['record_bird_sale_paid', B.record_bird_sale_paid, parsedOf.record_bird_sale_paid],
        ['bird_sale_detail', B.bird_sale_detail, parsedOf.bird_sale_detail],
        ['bird_sale_detail_void', B.bird_sale_detail_void, parsedOf.bird_sale_detail_void],
        ['bird_sale_form_invoiced.sale', B.bird_sale_form_invoiced.sale, parsedOf.bird_sale_form_invoiced?.sale],
      ];
      t.same(
        sales.map(([name, , parsed]) => [name, parsed?.deduction, parsed?.sources?.map((s) => s.revenue)]),
        sales.map(([name, raw]) => [name, scaledOf(raw.deduction_pct, 2), raw.sources.map((s) => (s.money ? fils(s.money.revenue) : null))]),
        'R الفاتورة: نسبة التنزيل (deduction_pct) بمرتبتين، وحصّة كلّ فوج (money.revenue) بالفلس',
      );
      const rows = B.sales_overview.birds.rows;
      t.same(parsedOf.sales_overview?.birds?.rows?.map((row) => row.deduction), rows.map((row) => scaledOf(row.deduction_pct, 2)), 'R قائمة الطيور في المبيعات: نسبة التنزيل لكلّ فاتورة');
      const details = B.party_statement_v2.books.flatMap((book) => book.lines).map((line) => line.detail).filter((detail) => detail?.type === 'bird_sale');
      const parsedDetails = parsedOf.party_statement_v2.books.flatMap((book) => book.lines).map((line) => line.detail).filter((detail) => detail?.type === 'bird_sale');
      t.same([details.length > 0, parsedDetails.map((d) => d.deduction)], [true, details.map((d) => scaledOf(d.deduction_pct, 2))], 'R الكشف: تفصيل فاتورة الطيور بنسبة تنزيلها');
      t.same(parsedOf.weigh_ticket_options_site?.site?.id, B.weigh_ticket_options_site.site.site_id, 'R الخيارات: الحقل من site_id');
      const closes = Object.keys(B).filter((key) => key.startsWith('close_flock'));
      t.same(
        closes.map((key) => parsedOf[key].lines.map((line) => line.value)),
        closes.map((key) => B[key].lines.map((line) => (line.money ? fils(line.money.value) : null))),
        'R نتيجة الإغلاق: قيمة كلّ سطر (money.value) بالفلس لأدوار الكلفة',
      );
      const forms = Object.keys(B).filter((key) => key.startsWith('flock_close_form'));
      t.same(
        forms.map((key) => parsedOf[key].items.map((item) => item.poolValue)),
        forms.map((key) => B[key].items.map((item) => (item.money ? fils(item.money.pool_value) : null))),
        'R نموذج الإغلاق: قيمة ما نزل لكلّ مادّة (money.pool_value) لأدوار الكلفة وحدها',
      );
    }
    // أيّام التقرير الكامل بمفاتيح الخادم (sold وsold_net_kg وcount_diff)، في عيّنات 0028 وعيّنات 0027 على شجرة 0028؛ وفي العيّنات يوم بفرق عدّ سالب ويوم بمباع.
    {
      const reports = [
        ...Object.keys(B).filter((key) => key.startsWith('flock_cycle_report')).map((key) => [key, B[key]]),
        ...Object.keys(REPORTS).filter((key) => key.startsWith('flock_cycle_report')).map((key) => [`reports-0027 ${key}`, REPORTS[key]]),
      ];
      const parsedDays = reports.map(([, sample]) => m.halls.parseCycleReport(clone(sample)).cycle.days.map((day) => [day.on, day.sold, day.soldKg, day.adjust]));
      t.same(parsedDays, reports.map(([, sample]) => sample.days.map((day) => [day.on, day.sold, milli(day.sold_net_kg), day.count_diff])), 'R أيّام التقرير الكامل: المباع وصافيه وفرق العدّ يوماً بيوم كما أرسلها الخادم');
      const all0028 = reports.flatMap(([, sample]) => sample.days);
      t.same([all0028.some((day) => day.count_diff < 0), all0028.some((day) => day.count_diff > 0 || day.sold > 0)], [true, true], 'R في العيّنات يوم بفرق عدّ ويوم بمباع (لا تمرّ المقارنة على أصفار وحدها)');
    }

    // ── M: المرآة = الخادم ─────────────────────────────────────────────────────────────────────────────────────────────────────
    {
      const tickets = collect(B, (node) => (node.method === 'scale' || node.method === 'crates') && Array.isArray(node.stops));
      const mirrored = tickets.map(([, ticket]) => {
        const nets = m.ticketNets({
          method: ticket.method,
          emptyKg: milli(ticket.empty_kg),
          emptyWithCrates: ticket.empty_with_crates === true,
          crateKg: milli(ticket.crate_kg),
          stops: ticket.stops.map((s) => ({ birds: s.birds, crates: s.crates, grossKg: milli(s.gross_kg), weighings: (s.weighings ?? []).map((x) => ({ crates: x.crates, grossKg: milli(x.gross_kg) })) })),
        });
        return [nets.stops.map((s) => [s.netKg, s.avgKg, s.cratesKg]), [nets.birds, nets.crates, nets.netKg, nets.avgKg]];
      });
      t.same(
        mirrored,
        tickets.map(([, ticket]) => [ticket.stops.map((s) => [milli(s.net_kg), milli(s.avg_kg), milli(s.crates_kg)]), [ticket.birds, ticket.crates, milli(ticket.net_kg), milli(ticket.avg_kg)]]),
        `M المرآة = الخادم في ${tickets.length} تذكرة: صافي كلّ قاعة ومعدّلها ووزن أقفاصها، ومجاميع التذكرة`,
      );
      t.same([tickets.some(([, x]) => x.method === 'crates'), tickets.some(([, x]) => x.method === 'scale' && x.empty_with_crates === false), tickets.some(([, x]) => x.empty_with_crates === true)], [true, true, true], 'M بين التذاكر ميزان أقفاص وقبّان بفارغ بلا أقفاص ومعها');
      const invoices = collect(B, (node) => 'billed_kg' in node && 'deduction_pct' in node && 'net_kg' in node);
      const priceOf = (node) => fils(node.money ? node.money.unit_price : node.unit_price);
      const totalOf = (node) => fils(node.money ? node.money.total : node.total);
      t.same(
        invoices.map(([, x]) => [m.billedKg(milli(x.net_kg), scaledOf(x.deduction_pct, 2)), m.saleTotal(milli(x.billed_kg), priceOf(x))]),
        invoices.map(([, x]) => [milli(x.billed_kg), totalOf(x)]),
        `M المرآة = الخادم في ${invoices.length} فاتورة (النتيجة والتفصيل والنموذج والقائمة والكشف): الوزن المحسوب والمبلغ`,
      );
      const split = invoices.filter(([, x]) => Array.isArray(x.sources) && x.sources.every((s) => s.money));
      t.same(
        split.map(([, x]) => m.revenueSplit(totalOf(x), x.sources.map((s) => milli(s.net_kg)))),
        split.map(([, x]) => x.sources.map((s) => fils(s.money.revenue))),
        `M حصص الأفواج من ${split.length} فاتورة بصافي قاعاتها (أكبر الباقي) = الخادم`,
      );
      t.ok(split.some(([, x]) => x.sources.length > 1), 'M فاتورة بقاعتين على الأقلّ (القسمة بأكبر الباقي تُختبر لا تُفترض)');
    }

    // ── P: صفحات القاعات بأجوبة القاعدة ────────────────────────────────────────────────────────────────────────────────────────
    const fresh = (rpcs) => {
      globalThis.__h8 = {
        session: MANAGER,
        toasts: [],
        location: null,
        rpc(fn, args) {
          const handler = rpcs[fn];
          return handler ? Promise.resolve().then(() => handler(args)) : new Promise(() => {});
        },
      };
    };
    const mount = async (url, element = null) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      const tree = element ?? m.h(m.Routes, null, m.h(m.Route, { path: '/halls/*', element: m.h(m.HallsRoutes) }), m.h(m.Route, { path: '*', element: null }));
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, tree)));
      await settle(40);
    };
    const unmount = async () => {
      if (!root) return;
      const mounted = root;
      root = null;
      m.flushSync(() => mounted.unmount());
      body().textContent = '';
      await settle();
    };
    const step = async (label, fn) => {
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
    };
    const tableOf = (caption) => all().find((n) => n.localName === 'table' && descendants(n).some((c) => c.localName === 'caption' && c.textContent === caption)) ?? null;
    const headersOf = (caption) => (tableOf(caption) ? descendants(tableOf(caption)).filter((n) => n.localName === 'th' && n.getAttribute('scope') === 'col').map((n) => n.textContent) : null);
    /** خلية عمود بعنوانه في صفّ يومٍ من جدول الأيّام (أو null بلا العمود). */
    const dayCell = (on, header) => {
      const heads = headersOf('أيّام الدورة') ?? [];
      const column = heads.indexOf(header);
      const row = (tableRows('أيّام الدورة') ?? []).find((cells) => cells[0] === m.fmtDay(on));
      return column < 0 || !row ? null : row[column];
    };

    await step('P1 التقرير الكامل: عمود فرق العدّ يوم الإغلاق', async () => {
      const seen = [];
      for (const sample of [B.flock_cycle_report_count_diff, REPORTS.flock_cycle_report_closed]) {
        fresh({ flock_cycle_report: answer(sample) });
        await mount(`/halls/report/${sample.flock.id}`);
        const day = sample.days.find((d) => d.count_diff !== 0);
        seen.push([dayCell(day.on, 'فرق العدّ'), m.signedCount(day.count_diff)]);
        await unmount();
      }
      t.same(seen.map(([cell]) => cell), seen.map(([, expected]) => expected), 'P1 جدول الأيّام بعمود «فرق العدّ» وقيمة الخادم يوم الإغلاق (−30 في 0028 و−993 في عيّنة 0027 المغلقة)');
    });

    await step('P2 التقرير الكامل: المباع يوم البيع ومخزن العلف المنقول المعلَّق', async () => {
      const sample = B.flock_cycle_report_closed;
      fresh({ flock_cycle_report: answer(sample) });
      await mount(`/halls/report/${sample.flock.id}`);
      const sold = sample.days.find((d) => d.sold > 0);
      const pending = sample.close.lines.find((line) => line.carry_status === 'pending');
      const before = [dayCell(sold.on, 'المباع'), byAction('rep-close').length, byAction('carry-return').length];
      await click(byAction('carry-return')[0]);
      const options = within(dialog(), 'carry-return-store').flatMap((select) => descendants(select)).filter((n) => n.localName === 'option' && n.getAttribute('value') !== '');
      t.same(
        [...before, options.map((n) => [n.getAttribute('value'), n.textContent])],
        [m.fmtInt(sold.sold), 1, 1, pending.stores.map((store) => [store.warehouse_id, store.name])],
        'P2 عمود «المباع» يوم البيع بعدد الخادم، وقسم الإغلاق، و«أرجعه إلى مخزن» بمخازن الخادم للسطر المنقول المعلَّق',
      );
    });

    await step('P3 التقرير اليوميّ: المباع والتذاكر بلا فاتورة وفرق العدّ والمنقول', async () => {
      const problems = [];
      let checked = 0;
      for (const sample of [B.halls_day_close, B.halls_day_sold, B.halls_day_carry, B.halls_day_carry_in]) {
        fresh({ halls_day: answer(sample) });
        await mount(`/halls/day?on=${sample.on}`);
        for (const hall of sample.sites.flatMap((site) => site.halls)) {
          const card = withAttr('day-hall', 'data-hall', hall.hall_id);
          const f = hall.flock;
          if (f) {
            const textIs = within(card, 'day-sales')[0]?.textContent ?? null;
            const parts = [f.sold ? m.fmtInt(f.sold) : null, f.ticketed ? m.fmtInt(f.ticketed) : null, f.count_diff ? m.signedCount(f.count_diff) : null].filter(Boolean);
            if (parts.length === 0 ? textIs !== null : !parts.every((part) => textIs?.includes(part))) problems.push(`${sample.on} ${hall.hall_name}: ${textIs} ← ${parts.join(' ')}`);
            checked += parts.length ? 1 : 0;
          } else {
            const carry = within(card, 'day-carry')[0]?.textContent ?? null;
            if (hall.carry.length ? !hall.carry.every((line) => carry?.includes(line.name)) : carry !== null) problems.push(`${sample.on} ${hall.hall_name}: ${carry}`);
            checked += hall.carry.length ? 1 : 0;
          }
        }
        await unmount();
      }
      t.same(problems, [], 'P3 بطاقة كلّ قاعة: المباع والتذاكر بلا فاتورة وفرق العدّ بأرقام الخادم، والقاعة الفارغة بعلفها المنقول');
      t.ok(checked >= 10, `P3 قاعات بمباع أو تذاكر أو فرق عدّ أو منقول في العيّنات (${checked})`);
    });

    await step('P4 بطاقة الفوج المغلق', async () => {
      const sample = B.flock_sales_closed;
      fresh({ flock_sales: answer(sample) });
      await mount('/broiler/flock/x', m.h(m.FlockCard, { flock: { id: sample.flock_id, kind: sample.kind, siteId: 's', hallId: 'h', hallName: 'قاعة', siteName: 'حقل', status: sample.status } }));
      t.same([byAction('card-sold')[0]?.textContent?.includes(m.fmtInt(sample.sold_birds)), byAction('card-closed').length], [true, 1], 'P4 بطاقة الفوج المغلق: المباع بعدد الخادم وجملة الإغلاق');
    });

    await step('P5 التذكرة بوزنات ميزان الأقفاص، وقائمة التذاكر', async () => {
      const sample = B.weigh_ticket_crates;
      fresh({ weigh_ticket: answer(sample) });
      await mount(`/halls/ticket/${sample.id}`);
      const weighings = tableRows('وزنات ميزان الأقفاص');
      const stops = tableRows('قاعات التذكرة');
      t.same([weighings?.length, stops?.length, byAction('ticket-paper').length], [sample.stops[0].weighings.length, sample.stops.length, 1], 'P5 ورقة التذكرة المكتملة بميزان الأقفاص: سطر لكلّ وزنة وقاعة');
      await unmount();
      const list = B.weigh_tickets_all;
      fresh({ weigh_tickets: answer(list) });
      await mount('/halls/tickets');
      t.eq(tableRows('تذاكر الوزن')?.length, list.rows.length, 'P5 قائمة التذاكر: صفّ لكلّ تذكرة من الخادم');
    });

    await step('P7 تذكرة أُلغيت فاتورتها: الفاتورة الملغاة لا تُعرض فاتورتَها', async () => {
      // الخادم يرسل آخر فاتورة للتذكرة بحالتها (العقد §5.1: sale {id, doc_no, status})؛ وبعد إلغائها تعود التذكرة «بانتظار الفاتورة».
      const ticket = B.weigh_ticket_done;
      fresh({ weigh_ticket: answer(ticket) });
      await mount(`/halls/ticket/${ticket.id}`);
      const seen = [byAction('ticket-status')[0]?.textContent ?? null, byAction('ticket-sale')[0]?.textContent ?? null, byAction('ticket-invoice').length];
      await unmount();
      const list = B.weigh_tickets_all;
      fresh({ weigh_tickets: answer(list) });
      await mount('/halls/tickets');
      const cells = byAction('tickets-sale').map((n) => n.textContent);
      t.same(
        [ticket.sale?.status, ticket.invoiced, seen, cells],
        ['void', false, ['بانتظار الفاتورة', `الفاتورة الملغاة ${ticket.sale.doc_no}`, 1], list.rows.filter((row) => row.sale).map((row) => (row.sale.status === 'void' ? `${row.sale.doc_no} (ملغاة)` : row.sale.doc_no))],
        'P7 التذكرة بفاتورة ملغاة: «بانتظار الفاتورة» بلا رقم الملغاة، ورابطها «الفاتورة الملغاة …» مع «أصدر الفاتورة»؛ وفي القائمة الملغاة بعلامتها',
      );
    });

    await step('P6 نموذج الإغلاق', async () => {
      const sample = B.flock_close_form;
      fresh({ flock_close_form: answer(sample) });
      await mount(`/halls/close/${sample.flock.id}`);
      const rows = tableRows('ما نزل للقاعة وباقيه') ?? [];
      t.same(rows.map((cells) => cells[0]), sample.items.map((item) => item.name), 'P6 نموذج الإغلاق: سطر لكلّ مادّة نزلت للقاعة باسمها من الخادم');
      await unmount();
      const pending = B.flock_close_form_pending;
      fresh({ flock_close_form: answer(pending) });
      await mount(`/halls/close/${pending.flock.id}`);
      t.same([byAction('close-pending').length, byAction('close-pending-ticket').length], [1, pending.pending_tickets.length], 'P6 تذاكر بلا فاتورة تمنع الإغلاق: تنبيه بكلّ تذكرة من الخادم');
    });
  } finally {
    if (root) {
      try {
        m?.flushSync(() => root.unmount());
      } catch {
        // swallow-ok: التنظيف بعد فحص رمى
      }
    }
    for (const [name, descriptor] of [['sessionStorage', saved.session], ['localStorage', saved.local]]) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    delete globalThis.__h8;
    restore();
  }
}
