// تقرير العليقة (0023 «ترتيب معمل العلف»؛ عقد scratchpad/mill3/contract-0023.md، B2 وA4؛ كلمة المالك 2026-11-10: «تقرير كامل داخل هذا العلف
// جدول كالندر… مربعات الاشهر… بحركة سينمائية يكبر المربع… واكو الوان… وطباعة تقارير… بهذا الشهر وبهذا اليوم»): react-dom/client الحقيقي على DOM
// صغير (dom.mjs) يشغّل صفحة التقرير الحقيقية (ReportPage) وrepo/millReport الحقيقي (المحلّل وبناء النداء) على core بديل يسجّل كلّ نداء ويجيب بأجوبة
// القاعدة من fixtures/mill3-0023.json (mill_report.year/month/day/empty وrefusals.<code> بمفاتيح العقد): القيم المنتظرة تُحسب هنا من العيّنات لا من
// نصوص بخطّ اليد، فتُستبدل بعيّنات القاعدة الحقيقية بالمفاتيح نفسها وتبقى الحالات صحيحة؛ وشروط العيّنات تُفحص أوّلاً باسمها. والحركة تُفحص بمستطيلات
// وWeb Animations بديلة على عناصر DOM الصغير (getBoundingClientRect وanimate وscrollIntoView وwindow.scrollTo تسجّل ما طُلب منها).
// الحالات: P المحلّل بكلّ عيّنة وصرامته؛ Y السنة (النداء بمدّتها، والبلاطات الاثنتا عشرة بأسماء الأشهر وناتجها ودفعاتها، والدرجات والدليل، والشبكة
// عمودان ثمّ ثلاثة، والمستقبل معطّل، والسهمان، والافتراض السنة الحالية بيوم الخادم)؛ Z الحركة (بطاقة الشهر تبدأ من مستطيل البلاطة وتعود إلى مكانها في
// 450 ملّي ثانية، وما حولها يظهر تدريجياً، والتقويم ملوّن من قراءة السنة قبل وصول قراءة الشهر)؛ M الشهر (الأسبوع من السبت، وإزاحة أوّل يوم، والأيام
// الملوّنة بالطنّ، واليوم الحاليّ، والمستقبل) وتقريره (العنوان والمدّة والملخّص والجدولان بمجاميعهما، وما يُطبع وما لا يُطبع، والطباعة بعنوانها)؛ B
// الرجوع إلى السنة يصغّر البطاقة إلى بلاطتها بالزرّ وبرجوع المتصفّح؛ R تقليل الحركة: لا حركة؛ D اليوم (النداء بيومه، والبطاقة تكبر من خليّته، والرجوع
// يصغّرها إليها)؛ E الشهر الفارغ؛ F الفشل بـ«أعد المحاولة»، والرفض بتلميحه وطريقه، والسنة الفاشلة بلا بلاطات (الفاشل ليس فارغاً).
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, Element, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const F = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'mill3-0023.json'), 'utf8'));
const S = F.mill_report;
const clone = (value) => JSON.parse(JSON.stringify(value));
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));

const SESSION_STUB = 'export const useSession = () => globalThis.__rep.session; export const sessionStore = { get: () => globalThis.__rep?.session ?? { status: "loading" } };';
const stubs = {
  name: 'report-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$/ }, () => ({ path: 'session', namespace: 'report-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'report-stub' }, () => ({ contents: SESSION_STUB, resolveDir: ROOT, loader: 'js' }));
  },
};
// core بديل لملفّات repo وحدها: call يسجّله globalThis.__rep.rpc، والملفّ الحقيقي يبني الطلب ويقرأ الجواب. لا قراءة مباشرة لجدول في التقرير.
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__rep.rpc(fn, args);
export const send = async () => { throw new Error('send_not_expected'); };
export const classifyPostgrest = (error) => new RejectedError(error.code ?? 'x', error.hint ?? null);
export const explained = async (error) => error;
export const updatedRows = () => { throw new ZeroRowsError(); };
export const authed = async () => ({ db: null });
export const unknownConstraint = () => '';`;
const coreStub = {
  name: 'core-stub',
  setup(b) {
    b.onResolve({ filter: /^\.\/core$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('src/lib/repo/') ? { path: 'core', namespace: 'core-stub' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'core-stub' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
  },
};

async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';",
    "export { default as ReportPage } from './src/pages/mill/ReportPage.tsx';",
    "export { parseMillReport } from './src/lib/repo/millReport.ts';",
    "export { RowShapeError } from './src/lib/repo/inventory.ts';",
    "export { RejectedError } from './src/lib/errors.ts';",
    "export { columnDecimals, fmtInt, fmtMilli, fmtMoney, fmtPercent, fmtQty, fmtQtyCell } from './src/lib/format.ts';",
    "export { batchesText, levelOf, shiftMonth, dayParam } from './src/pages/mill/report/calendar.ts';",
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
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
    plugins: [stubs, coreStub],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

// ── أدوات DOM ──────────────────────────────────────────────────────────────────────────────────────────────────
const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name, scope = body()) => descendants(scope).filter((n) => n.getAttribute('data-action') === name);
const first = (name, scope) => byAction(name, scope)[0] ?? null;
const text = () => body().textContent;
const textOf = (name) => first(name)?.textContent ?? null;
const classOf = (node) => node?.getAttribute('class') ?? '';
const disabled = (node) => Boolean(node?.hasAttribute('disabled'));
const click = async (node) => {
  if (node) fire(node, 'click');
  await settle();
};
/** هل للعقدة أو لأحد آبائها الصنف. */
const underClass = (node, cls) => {
  for (let n = node; n && n.nodeType === 1; n = n.parentNode) if (classOf(n).split(/\s+/).includes(cls)) return true;
  return false;
};
const tile = (month) => byAction('month-tile').find((n) => n.getAttribute('data-month') === month) ?? null;
const cell = (day) => byAction('day-cell').find((n) => n.getAttribute('data-day') === day) ?? null;
/** جدول داخل غلاف باسمه: رؤوس الأعمدة وصفوف الجسم وصفوف التذييل نصوصاً. */
const tableIn = (action) => {
  const scope = first(action);
  const nodes = scope ? descendants(scope) : [];
  const rows = (tag) => {
    const section = nodes.find((n) => n.localName === tag);
    return section ? section.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((c) => c.textContent)) : [];
  };
  return { headers: nodes.filter((n) => n.localName === 'th' && n.getAttribute('scope') === 'col').map((n) => n.textContent), body: rows('tbody'), foot: rows('tfoot') };
};

// ── حساب مستقلّ عن الشاشة ─────────────────────────────────────────────────────────────────────────────────────
/** نصّ عشريّ بمراتب ← عدد صحيح بالمقياس (الكمية 3، والمال 2). */
const scaledOf = (value, scale) => {
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const units = BigInt(`${whole}${fraction.padEnd(scale, '0')}`);
  return negative ? -units : units;
};
const milli = (value) => scaledOf(value, 3);
const fils = (value) => scaledOf(value, 2);
const roundHalf = (n, d) => {
  const q = n / d;
  const r = n % d;
  return 2n * (r < 0n ? -r : r) >= d ? q + (n < 0n ? -1n : 1n) : q;
};
const level = (value, max) => {
  if (value <= 0n || max <= 0n) return 0;
  const step = (value * 4n + max - 1n) / max;
  return Number(step > 4n ? 4n : step < 1n ? 1n : step);
};
const ALPHA = { 1: '0.16', 2: '0.3', 3: '0.45', 4: '0.6' };
const tint = (lvl) => (lvl === 0 ? '' : `rgb(var(--ring) / ${ALPHA[lvl]})`);
const RING = 'inset 0 0 0 2px rgb(var(--ring))';
const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
const WEEK = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const WEEK_SHORT = ['سبت', 'أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'];
const UNIT = { kg: 'كغم', L: 'لتر', pc: 'قطعة' };
const ymd = (day) => day.split('-').map(Number);
const weekIndex = (day) => {
  const [y, m, d] = ymd(day);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 1) % 7;
};
const daysIn = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const pad = (n) => String(n).padStart(2, '0');
const fmtDay = (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
const monthLabel = (month) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
const dayLabel = (day) => `${WEEK[weekIndex(day)]} ${fmtDay(day)}`;
const batchesWord = (n) => (n === 0 ? 'لا دفعات' : n === 1 ? 'دفعة واحدة' : n === 2 ? 'دفعتان' : n % 100 >= 3 && n % 100 <= 10 ? `${n} دفعات` : `${n} دفعة`);
const monthsOfDays = (days) => {
  const months = new Map();
  for (const entry of days) {
    const month = entry.day.slice(0, 7);
    const sum = months.get(month) ?? { batches: 0, kg: 0n };
    months.set(month, { batches: sum.batches + entry.batches, kg: sum.kg + milli(entry.output_kg) });
  }
  return months;
};

// ── مستطيلات وحركة بديلة ───────────────────────────────────────────────────────────────────────────────────────
// البلاطة بموضعها في شبكة 3 أعمدة، وخليّة اليوم بموضعها في أسبوعها: مستطيل لكلّ عنصر، فالحركة تُفحص بمستطيل العنصر نفسه لا بغيره.
const CARD = { left: 24, top: 180, width: 576, height: 520 };
const DAY_CARD = { left: 24, top: 180, width: 576, height: 96 };
function rectOf(node) {
  const action = node.getAttribute('data-action');
  if (action === 'month-tile') {
    const index = Number(node.getAttribute('data-month').slice(5, 7)) - 1;
    return { left: 24 + (index % 3) * 236, top: 260 + Math.floor(index / 3) * 140, width: 220, height: 124 };
  }
  if (action === 'day-cell') {
    const day = node.getAttribute('data-day');
    const at = weekIndex(`${day.slice(0, 8)}01`) + Number(day.slice(8, 10)) - 1;
    return { left: 600 - (at % 7) * 80, top: 300 + Math.floor(at / 7) * 80, width: 76, height: 76 };
  }
  if (action === 'month-card') return CARD;
  if (action === 'day-card') return DAY_CARD;
  return { left: 0, top: 0, width: 0, height: 0 };
}
const flipFrames = (from, to, lift) => {
  const head = { transformOrigin: 'top left', translate: `${from.left - to.left}px ${from.top - to.top}px`, scale: `${from.width / to.width} ${from.height / to.height}`, opacity: 0.6 };
  const tail = { transformOrigin: 'top left', translate: '0px 0px', scale: '1 1', opacity: 1 };
  return lift ? [{ ...head, zIndex: '2' }, { ...tail, zIndex: '2' }] : [head, tail];
};
const ZOOM = { duration: 450, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
const FADE = { duration: 300, delay: 120, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' };

export default async function (t) {
  const restoreDom = installDom();
  // ساعة الجهاز قبل يوم الخادم بسنة: «اليوم» والسنة الحالية من الخادم لا من الجهاز (new Date() بلا معامل وحده يتبدّل).
  const RealDate = globalThis.Date;
  const DEVICE_DAY = `${Number(S.year.today.slice(0, 4)) - 1}-06-15`;
  class DeviceDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(`${DEVICE_DAY}T09:00:00`);
      else super(...args);
    }
  }
  globalThis.Date = DeviceDate;
  const proto = Element.prototype;
  const saved = ['getBoundingClientRect', 'animate', 'scrollIntoView'].map((name) => [name, Object.getOwnPropertyDescriptor(proto, name)]);
  let root = null;
  try {
    const m = await bundle();
    const h = m.h;
    let where = null;
    let navigate = null;
    function Probe() {
      where = m.useLocation();
      navigate = m.useNavigate();
      return null;
    }
    // ── حال الفحص: النداءات والحركات والتمرير والطباعة ──
    let rpcCalls = [];
    let animations = [];
    let scrolls = [];
    let intoView = [];
    let reduced = false;
    proto.getBoundingClientRect = function () {
      const r = rectOf(this);
      return { ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height };
    };
    proto.animate = function (keyframes, options) {
      animations.push({ node: this, keyframes, options });
      return { finished: Promise.resolve(), cancel() {} };
    };
    proto.scrollIntoView = function (options) {
      intoView.push([this, options]);
    };
    globalThis.window.scrollTo = (...args) => scrolls.push(args);
    globalThis.window.matchMedia = (query) => ({ matches: reduced && query.includes('prefers-reduced-motion: reduce'), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });

    const RID = S.year.recipe?.id ?? '6f1d2c3b-4a59-4e1f-9c2a-7b8d9e0f1a21';
    const Y = S.year.from.slice(0, 4);
    const M = S.month.from.slice(0, 7);
    const D = S.day.from;
    const TODAY = S.year.today;
    const EMPTY_MONTH = S.empty.from.slice(0, 7);
    const ORG = 'مشروع الدواجن العراقي';
    const SESSION = { status: 'ready', workspace: { userId: 'u-1', orgId: 'org-1', orgName: ORG, role: 'mill_operator', scopes: [] } };

    /** جواب mill_report بمدّة الطلب: العيّنة التي مدّتها هي، وإلّا العيّنة الفارغة بمدّة الطلب (لا إنتاج فيها). */
    const sampleFor = (args) => {
      const found = Object.values(S).find((sample) => sample.from === args.p_from && sample.to === args.p_to);
      return found ? clone(found) : { ...clone(S.empty), from: args.p_from, to: args.p_to };
    };
    const fresh = (rpc = {}) => {
      rpcCalls = [];
      animations = [];
      scrolls = [];
      intoView = [];
      reduced = false;
      globalThis.__rep = {
        session: SESSION,
        rpc(fn, args) {
          rpcCalls.push([fn, args]);
          const handler = rpc[fn] ?? (fn === 'mill_report' ? async (a) => sampleFor(a) : null);
          if (!handler) return new Promise(() => {});
          return Promise.resolve().then(() => handler(args, rpcCalls.filter(([name]) => name === fn).length));
        },
      };
    };
    const reports = () => rpcCalls.filter(([fn]) => fn === 'mill_report').map(([, args]) => args);
    const range = (from, to) => ({ p_recipe: RID, p_from: from, p_to: to });
    const yearRange = (year) => range(`${year}-01-01`, `${year}-12-31`);
    const monthRange = (month) => range(`${month}-01`, `${month}-${pad(daysIn(month))}`);
    const search = () => Object.fromEntries(new URLSearchParams(where?.search ?? ''));
    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      m.flushSync(() =>
        root.render(h(m.MemoryRouter, { initialEntries: [url] }, h(Probe), h(m.Routes, null, h(m.Route, { path: '/mill/recipe/:id/report', element: h(m.ReportPage) })))),
      );
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
    const page = (query) => `/mill/recipe/${RID}/report${query ? `?${query}` : ''}`;
    const motionOf = (action) => animations.filter((entry) => entry.node.getAttribute('data-action') === action);
    const zoomsOf = (action) => motionOf(action).filter((entry) => entry.keyframes.length === 2 && 'scale' in entry.keyframes[0]);
    const fadesOf = (action) => motionOf(action).filter((entry) => entry.keyframes[0].opacity === 0 && !('scale' in entry.keyframes[0]));

    // ── شروط العيّنات ──────────────────────────────────────────────────────────────────────────────────────────
    const yearMonths = monthsOfDays(S.year.days);
    const yearLevels = new Set([...yearMonths.values()].map((sum) => level(sum.kg, [...yearMonths.values()].reduce((max, s) => (s.kg > max ? s.kg : max), 0n))));
    t.same(
      [S.year.from, S.year.to, TODAY.slice(0, 4) === Y, yearMonths.size >= 2, yearLevels.size >= 2, yearMonths.has(M), M <= TODAY.slice(0, 7), Boolean(S.year.recipe)],
      [`${Y}-01-01`, `${Y}-12-31`, true, true, true, true, true, true],
      'شرط year: سنة كاملة هي سنة اليوم، بشهرين فيهما إنتاج فأكثر وبدرجتين، وفيها شهر العيّنة الشهرية، وبعليقة',
    );
    t.same(
      [S.month.from, S.month.to, S.month.days.length >= 1, S.month.days.some((entry) => entry.day === D), S.month.batches.length >= 2, S.month.materials.length >= 2],
      [`${M}-01`, `${M}-${pad(daysIn(M))}`, true, true, true, true],
      'شرط month: شهر كامل بيوم إنتاج فأكثر منها يوم العيّنة اليومية، وبدفعتين ومادّتين فأكثر',
    );
    t.same([S.day.from, S.day.to, S.day.batches.length >= 1, D <= TODAY], [D, D, true, true], 'شرط day: يوم واحد بدفعة فأكثر، ليس بعد اليوم');
    for (const [name, sample] of Object.entries(S)) {
      const inBasis = sample.materials.reduce((sum, x) => sum + (x.in_basis && x.mass_kg !== null ? milli(x.mass_kg) : 0n), 0n);
      t.eq(inBasis, milli(sample.totals.mass_kg), `شرط ${name}: كتلة الدفعات = مجموع كتلة ما داخل الخلطة من المواد (الوقود والتعبئة خارجها)`);
    }
    t.same(
      [S.empty.days.length, S.empty.batches.length, S.empty.materials.length, S.empty.totals.batches, EMPTY_MONTH <= TODAY.slice(0, 7), S.empty.from === `${EMPTY_MONTH}-01`],
      [0, 0, 0, 0, true, true],
      'شرط empty: شهر مضى بلا إنتاج',
    );
    t.same(
      ['range_too_long', 'bad_range', 'date_required'].map((code) => [F.refusals?.[code]?.code, Boolean(F.refusals?.[code]?.hint)]),
      [['range_too_long', true], ['bad_range', true], ['date_required', true]],
      'شرط refusals: رفوض المدّة الثلاثة بتلميحها',
    );
    // مجموع كلّ عيّنة من سطورها (العقد: الأيام والدفعات والمجاميع من القاعدة نفسها).
    for (const [name, sample] of Object.entries(S)) {
      const output = sample.batches.reduce((sum, batch) => sum + milli(batch.output_kg), 0n);
      const days = sample.days.reduce((sum, entry) => sum + milli(entry.output_kg), 0n);
      t.same([sample.totals.batches, milli(sample.totals.output_kg), days], [sample.batches.length, output, output], `شرط ${name}: المجاميع = الدفعات = الأيام`);
    }

    // ── P: المحلّل الحقيقي ────────────────────────────────────────────────────────────────────────────────────────
    for (const [name, sample] of Object.entries(S)) {
      const parsed = m.parseMillReport(clone(sample));
      t.same(
        [parsed.today, parsed.from, parsed.to, parsed.recipe && [parsed.recipe.id, parsed.recipe.name, parsed.recipe.outputItemName]],
        [sample.today, sample.from, sample.to, sample.recipe && [sample.recipe.id, sample.recipe.name, sample.recipe.output_item_name]],
        `P ${name}: اليوم والمدّة والعليقة`,
      );
      t.same(
        parsed.days.map((entry) => [entry.day, entry.batches, entry.outputKg]),
        sample.days.map((entry) => [entry.day, entry.batches, milli(entry.output_kg)]),
        `P ${name}: الأيام بالكمية بالآلاف`,
      );
      t.same(
        parsed.batches.map((b) => [b.id, b.docNo, b.producedOn, b.recipeName, b.outputItemName, b.outputKg, b.massKg, b.shrinkKg, b.note, b.inputWarehouseName, b.outputWarehouseName, b.money]),
        sample.batches.map((b) => [
          b.id, b.doc_no, b.produced_on, b.recipe_name, b.output_item_name, milli(b.output_kg), milli(b.mass_kg), milli(b.shrink_kg), b.note, b.input_warehouse_name, b.output_warehouse_name,
          { materialsValue: fils(b.money.materials_value), extraValue: fils(b.money.extra_value), totalValue: fils(b.money.total_value), costPerKg: b.money.cost_per_kg === null ? null : fils(b.money.cost_per_kg) },
        ]),
        `P ${name}: الدفعات بالكمية والمال (المال غير محجوب)`,
      );
      t.same(
        parsed.materials.map((x) => [x.itemId, x.name, x.baseUnit, x.qty, x.massKg, x.inBasis, x.value]),
        sample.materials.map((x) => [x.item_id, x.name, x.base_unit, milli(x.qty), x.mass_kg === null ? null : milli(x.mass_kg), x.in_basis, fils(x.value)]),
        `P ${name}: المواد بالكمية والكتلة الفعلية وin_basis والقيمة`,
      );
      const totals = sample.totals;
      t.same(
        parsed.totals,
        {
          batches: totals.batches, outputKg: milli(totals.output_kg), massKg: milli(totals.mass_kg), materialsValue: fils(totals.materials_value),
          extraValue: fils(totals.extra_value), totalValue: fils(totals.total_value), costPerKg: totals.cost_per_kg === null ? null : fils(totals.cost_per_kg),
        },
        `P ${name}: المجاميع`,
      );
    }
    {
      const base = clone(S.month);
      const batch0 = base.batches[0];
      const material0 = base.materials[0];
      const bad = (patch) => () => m.parseMillReport({ ...clone(base), ...patch });
      const badBatch = (patch) => bad({ batches: [{ ...clone(batch0), ...patch }] });
      const withoutKey = (object, key) => Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));
      t.throws(badBatch({ money: undefined }), 'P صرامة: دفعة بلا مال (المال غير محجوب في هذا التقرير)');
      t.throws(badBatch({ money: { ...batch0.money, total_value: null } }), 'P صرامة: كلفة دفعة null');
      t.throws(() => m.parseMillReport({ ...clone(base), batches: [withoutKey(batch0, 'note')] }), 'P صرامة: مفتاح الملاحظة غائب (null بقصد لا غياب)');
      t.throws(badBatch({ output_kg: '1000.0001' }), 'P صرامة: كمية بأربع مراتب');
      t.throws(badBatch({ produced_on: '2026-13-01' }), 'P صرامة: يوم غير موجود');
      t.throws(badBatch({ doc_no: null }), 'P صرامة: دفعة مرحَّلة بلا رقم');
      t.throws(bad({ days: [{ day: D, batches: 0, output_kg: '0.000' }] }), 'P صرامة: يوم بلا دفعة في أيام الإنتاج');
      t.throws(bad({ days: [{ day: D, batches: 1.5, output_kg: '1.000' }] }), 'P صرامة: عدد دفعات غير صحيح');
      t.throws(bad({ materials: [{ ...clone(material0), base_unit: 'ton' }] }), 'P صرامة: وحدة غير معروفة');
      t.throws(() => m.parseMillReport({ ...clone(base), materials: [withoutKey(material0, 'mass_kg')] }), 'P صرامة: مفتاح الكتلة غائب');
      t.throws(() => m.parseMillReport({ ...clone(base), materials: [withoutKey(material0, 'in_basis')] }), 'P صرامة: in_basis غائب');
      t.throws(bad({ materials: [{ ...clone(material0), in_basis: 'true' }] }), 'P صرامة: in_basis نصّ لا منطقيّ');
      t.throws(bad({ totals: withoutKey(base.totals, 'cost_per_kg') }), 'P صرامة: مفتاح كلفة الكيلو غائب من المجاميع');
      t.throws(bad({ totals: { ...base.totals, batches: -1 } }), 'P صرامة: عدد دفعات سالب');
      t.throws(() => m.parseMillReport(withoutKey(base, 'recipe')), 'P صرامة: مفتاح العليقة غائب');
      t.throws(bad({ today: '10/11/2026' }), 'P صرامة: يوم بغير شكله');
      const nullable = m.parseMillReport({ ...clone(base), recipe: null, batches: [{ ...clone(batch0), note: null, money: { ...batch0.money, cost_per_kg: null } }], materials: [{ ...clone(material0), mass_kg: null }], totals: { ...base.totals, cost_per_kg: null } });
      t.same([nullable.recipe, nullable.batches[0].note, nullable.batches[0].money.costPerKg, nullable.materials[0].massKg, nullable.totals.costPerKg], [null, null, null, null, null], 'P الخانات التي تأتي null بقصد تُقرأ null');
      let shape = null;
      try {
        badBatch({ output_kg: null })();
      } catch (error) {
        shape = error;
      }
      t.ok(shape instanceof m.RowShapeError, 'P الخطأ RowShapeError (خطأ شكل، لا تقرير يُعرض خطأً)');
      // صيغ عدد الدفعات بالفصحى، والدرجات على حدودها.
      t.same([0, 1, 2, 3, 10, 11, 99, 100, 103, 111].map((n) => m.batchesText(n)), [0, 1, 2, 3, 10, 11, 99, 100, 103, 111].map(batchesWord), 'P «دفعة واحدة» و«دفعتان» و«3 دفعات» و«11 دفعة» و«100 دفعة»');
      t.same([[0n, 8n], [1n, 8n], [2n, 8n], [3n, 8n], [4n, 8n], [6n, 8n], [7n, 8n], [8n, 8n], [5n, 0n]].map(([v, max]) => m.levelOf(v, max)), [0, 1, 1, 2, 2, 3, 4, 4, 0], 'P الدرجة ربعٌ ربعٌ من الأكبر (والأكبر 4، وبلا إنتاج 0)');
      t.same([m.shiftMonth('2026-01', -1), m.shiftMonth('2026-12', 1), m.dayParam('2026-02-30'), m.dayParam('2028-02-29')], ['2025-12', '2027-01', null, '2028-02-29'], 'P الشهر قبله وبعده عبر السنة، و30 شباط ليس يوماً');
    }

    // ── Y: السنة ──────────────────────────────────────────────────────────────────────────────────────────────────
    const yearMax = [...yearMonths.values()].reduce((max, sum) => (sum.kg > max ? sum.kg : max), 0n);
    const nowMonth = TODAY.slice(0, 7);
    await step('Y', async () => {
      fresh();
      await mount(page(`year=${Y}`));
      t.same(reports(), [yearRange(Y)], 'Y: mill_report بالعليقة ومن أوّل السنة إلى آخرها (نداء واحد)');
      t.same([textOf('report-title'), textOf('report-output'), textOf('year-label')], [`تقرير إنتاج «${S.year.recipe.name}»`, `المادّة المنتَجة: ${S.year.recipe.output_item_name}`, `سنة ${Y}`], 'Y: العنوان باسم العليقة وناتجها وسنة العرض');
      const tiles = byAction('month-tile');
      t.same(tiles.map((n) => n.getAttribute('data-month')), MONTHS.map((_, i) => `${Y}-${pad(i + 1)}`), 'Y: اثنتا عشرة بلاطة بالترتيب');
      t.same(tiles.map((n) => first('tile-name', n)?.textContent), MONTHS, 'Y: اسم كلّ شهر كما يُكتب في العراق');
      const grid = first('year-grid');
      t.ok(classOf(grid).split(' ').includes('grid-cols-2') && classOf(grid).split(' ').includes('sm:grid-cols-3'), 'Y: عمودان بالهاتف (6 صفوف) وثلاثة من sm (4 صفوف)');
      for (const node of tiles) {
        const month = node.getAttribute('data-month');
        const sum = yearMonths.get(month);
        const lvl = sum ? level(sum.kg, yearMax) : 0;
        const label = month > nowMonth ? 'مستقبل' : sum ? 'إنتاج' : 'فارغ';
        t.same(
          [Number(node.getAttribute('data-level')), node.style.backgroundColor ?? '', classOf(node).split(' ').includes('bg-surface-2')],
          [lvl, tint(lvl), !sum],
          `Y: لون ${month} (${label}) بدرجته من أكبر شهر، والفارغ بلون السطح المحايد`,
        );
        if (sum) {
          t.same(
            [first('tile-qty', node)?.textContent, first('tile-batches', node)?.textContent, first('tile-empty', node)],
            [m.fmtQty(sum.kg, 'kg').main, batchesWord(sum.batches), null],
            `Y: ${month}: الناتج والدفعات`,
          );
        } else {
          t.same([first('tile-qty', node), first('tile-empty', node)?.textContent], [null, 'لا إنتاج'], `Y: ${month}: «لا إنتاج»`);
        }
        t.same([disabled(node), node.getAttribute('aria-current'), node.style.boxShadow ?? ''], [month > nowMonth, month === nowMonth ? 'date' : null, month === nowMonth ? RING : ''], `Y: ${month}: المستقبل لا يُفتح، والشهر الحاليّ بإطار`);
      }
      t.ok(tile(nowMonth)?.textContent.includes('هذا الشهر'), 'Y: «هذا الشهر» على بلاطة الشهر الحاليّ');
      const swatches = byAction('legend-swatch');
      t.same(
        swatches.map((n) => [n.getAttribute('data-level'), n.style.backgroundColor ?? '']),
        [['0', ''], ['1', tint(1)], ['2', tint(2)], ['3', tint(3)], ['4', tint(4)]],
        'Y: الدليل: «بلا إنتاج» بلون السطح ثمّ الدرجات الأربع',
      );
      t.ok(classOf(swatches[0]).includes('bg-surface-2') && ['بلا إنتاج', 'أقلّ', 'أكثر'].every((word) => textOf('legend').includes(word)), 'Y: «بلا إنتاج» و«أقلّ» و«أكثر»');
      t.eq(textOf('year-total'), `مجموع السنة: ${m.fmtQty(milli(S.year.totals.output_kg), 'kg').main} — ${batchesWord(S.year.totals.batches)}`, 'Y: مجموع السنة من مجاميع القاعدة');
      t.ok(underClass(first('year-view'), 'print:hidden') && underClass(first('back-recipe'), 'print:hidden'), 'Y: التقويم والرجوع لا يُطبعان');
      t.same([disabled(first('year-next')), disabled(first('year-prev'))], [true, false], 'Y: لا سنة بعد السنة الحالية');
      await click(first('year-prev'));
      const prev = String(Number(Y) - 1);
      t.same([search(), reports().at(-1), textOf('year-label'), disabled(first('year-next'))], [{ year: prev }, yearRange(prev), `سنة ${prev}`, false], 'Y: «السنة السابقة» بمدّتها، والتالية تعود');
      t.same([byAction('tile-empty').length, textOf('year-total')], [12, 'لا إنتاج في هذه السنة.'], 'Y: سنة بلا إنتاج: «لا إنتاج» على كلّ بلاطة');
      await click(first('year-next'));
      t.same([search(), reports().length], [{ year: Y }, 3], 'Y: «السنة التالية» تعود إلى سنة اليوم');
      t.eq(animations.length, 0, 'Y: لا حركة بين سنة وسنة');
    });
    await step('Y-default', async () => {
      fresh();
      await mount(page(''));
      // بلا ?year: سنة الجهاز أوّلاً (ساعة الجهاز هنا قبل سنة الخادم بسنة)، ثمّ سنة الخادم من جوابه: لا سنة بعد السنة الحالية بالخادم.
      t.same(
        [reports(), textOf('year-label'), search(), disabled(first('year-next')), tile(TODAY.slice(0, 7))?.getAttribute('aria-current')],
        [[yearRange(DEVICE_DAY.slice(0, 4)), yearRange(TODAY.slice(0, 4))], `سنة ${TODAY.slice(0, 4)}`, {}, true, 'date'],
        'Y: بلا سنة في الرابط: سنة الجهاز ثمّ السنة الحالية بيوم الخادم، وشهره الحاليّ',
      );
    });

    // ── Z: الحركة إلى الشهر ───────────────────────────────────────────────────────────────────────────────────
    await step('Z', async () => {
      let answerMonth = null;
      fresh({
        mill_report: (args) => {
          if (args.p_from === S.month.from) return new Promise((resolve) => (answerMonth = () => resolve(clone(S.month))));
          return sampleFor(args);
        },
      });
      await mount(page(`year=${Y}`));
      scrolls = [];
      const from = rectOf(tile(M));
      await click(tile(M));
      t.same([search(), reports().at(-1)], [{ month: M }, monthRange(M)], 'Z: الضغط على البلاطة يفتح شهرها بقراءة مدّته');
      const zooms = zoomsOf('month-card');
      t.same(zooms.map((entry) => entry.keyframes), [flipFrames(from, CARD, false)], 'Z: بطاقة الشهر تبدأ من مستطيل البلاطة (إزاحة وتكبير من الزاوية) وتعود إلى مكانها');
      t.same(zooms.map((entry) => entry.options), [ZOOM], 'Z: 450 ملّي ثانية بتباطؤ في آخرها');
      t.same([fadesOf('month-bar').map((e) => e.options), fadesOf('month-rest').map((e) => e.options)], [[FADE], [FADE]], 'Z: الشريط والتقرير يظهران تدريجياً بعد بدء الحركة');
      t.same(scrolls, [[0, 0]], 'Z: العرض الجديد من أعلى الصفحة (البلاطة قد تكون في آخر الشبكة)');
      // قبل وصول قراءة الشهر: التقويم ملوّن من قراءة السنة، والتقرير «جارٍ الفتح…».
      const monthDays = S.year.days.filter((entry) => entry.day.startsWith(`${M}-`));
      const monthMax = monthDays.reduce((max, entry) => (milli(entry.output_kg) > max ? milli(entry.output_kg) : max), 0n);
      t.same(
        byAction('day-cell').filter((n) => n.getAttribute('data-level') !== '0').map((n) => [n.getAttribute('data-day'), Number(n.getAttribute('data-level'))]),
        monthDays.map((entry) => [entry.day, level(milli(entry.output_kg), monthMax)]),
        'Z: أيام الإنتاج ملوّنة من قراءة السنة قبل أن تصل قراءة الشهر',
      );
      t.same([first('report-loading')?.textContent, byAction('report').length], ['جارٍ الفتح…', 0], 'Z: والتقرير «جارٍ الفتح…»');
      answerMonth();
      await settle();
      t.same([byAction('report').length, byAction('report-loading').length, zoomsOf('month-card').length], [1, 0, 1], 'Z: وصلت قراءة الشهر فظهر تقريره بلا حركة ثانية');
    });

    // ── M: الشهر وتقريره ──────────────────────────────────────────────────────────────────────────────────────
    await step('M', async () => {
      fresh();
      globalThis.document.title = 'نظام الدواجن';
      await mount(page(`month=${M}`));
      t.same(reports(), [monthRange(M)], 'M: mill_report بمدّة الشهر وحده');
      t.same([animations.length, scrolls.length], [0, 0], 'M: الفتح من الرابط بلا حركة ولا تمرير');
      t.same(byAction('weekday').map((n) => n.textContent), WEEK.map((word, i) => `${WEEK_SHORT[i]}${word}`), 'M: الأسبوع من السبت (المختصر للهاتف والكامل من sm)');
      t.same(byAction('weekday').map((n) => descendants(n).map((c) => classOf(c))), WEEK.map(() => ['sm:hidden', 'sr-only sm:not-sr-only']), 'M: المختصر يختفي من sm والكامل للقارئ الصوتي بالهاتف');
      t.eq(byAction('day-blank').length, weekIndex(`${M}-01`), `M: ${weekIndex(`${M}-01`)} خانات قبل أوّل يوم (السبت أوّل الأسبوع)`);
      t.same(byAction('day-cell').map((n) => n.getAttribute('data-day')), Array.from({ length: daysIn(M) }, (_, i) => `${M}-${pad(i + 1)}`), 'M: كلّ أيام الشهر بالترتيب');
      const monthMax = S.month.days.reduce((max, entry) => (milli(entry.output_kg) > max ? milli(entry.output_kg) : max), 0n);
      const produced = new Map(S.month.days.map((entry) => [entry.day, entry]));
      for (const node of byAction('day-cell')) {
        const day = node.getAttribute('data-day');
        const entry = produced.get(day);
        const lvl = entry ? level(milli(entry.output_kg), monthMax) : 0;
        t.same(
          [node.localName, Number(node.getAttribute('data-level')), node.style.backgroundColor ?? '', first('day-tons', node)?.textContent ?? null, node.getAttribute('aria-current'), node.style.boxShadow ?? ''],
          [entry && day <= TODAY ? 'button' : 'div', lvl, tint(lvl), entry ? m.fmtMilli(roundHalf(milli(entry.output_kg), 1000n)) : null, day === TODAY ? 'date' : null, day === TODAY ? RING : ''],
          `M: ${day}: ${entry ? 'زرّ ملوّن بدرجته وطنّه' : 'بلا إنتاج ولا زرّ'}${day === TODAY ? '، واليوم الحاليّ بإطار' : ''}`,
        );
        if (day > TODAY) t.ok(classOf(node).includes('text-ink-subtle'), `M: ${day} في المستقبل باهت`);
        if (entry) t.eq(node.getAttribute('aria-label'), `${dayLabel(day)}: ${m.fmtQty(milli(entry.output_kg), 'kg').main}، ${batchesWord(entry.batches)}`, `M: ${day}: الوصف للقارئ الصوتي`);
      }
      t.ok(textOf('legend').includes('الرقم العريض في يوم الإنتاج ناتجه بالطنّ.'), 'M: الدليل يقول ما الرقم العريض ووحدته');
      t.ok(
        S.month.days.every((entry) => classOf(first('day-tons', cell(entry.day))).includes('font-semibold') && classOf(descendants(cell(entry.day))[0]).includes('text-2xs')),
        'M: في يوم الإنتاج الطنّ عريض ورقم اليوم صغير',
      );
      const monthKg = S.month.days.reduce((sum, entry) => sum + milli(entry.output_kg), 0n);
      const monthBatches = S.month.days.reduce((sum, entry) => sum + entry.batches, 0);
      t.same([textOf('month-title'), textOf('month-total')], [monthLabel(M), `${m.fmtQty(monthKg, 'kg').main} — ${batchesWord(monthBatches)}`], 'M: عنوان البطاقة الشهر وسنته ومجموعه');
      // التقرير.
      const totals = S.month.totals;
      const title = `تقرير إنتاج «${S.month.recipe.name}»`;
      const period = `${monthLabel(M)}: من ${fmtDay(S.month.from)} إلى ${fmtDay(S.month.to)}`;
      t.same([textOf('report-title'), textOf('report-period'), textOf('report-org'), textOf('report-prepared')], [title, period, ORG, `أُعدّ بتاريخ ${fmtDay(TODAY)}`], 'M: عنوان التقرير ومدّته واسم المنشأة وتاريخ إعداده');
      t.same(
        [classOf(first('report-org')).split(' ').filter((c) => c === 'hidden' || c === 'print:block'), classOf(first('report-prepared')).split(' ').filter((c) => c === 'hidden' || c === 'print:block')],
        [['hidden', 'print:block'], ['hidden', 'print:block']],
        'M: اسم المنشأة وتاريخ الإعداد للطباعة وحدها',
      );
      const waste = S.month.batches.reduce((sum, batch) => sum + milli(batch.shrink_kg), 0n);
      const qty = (value) => m.fmtQty(value, 'kg').main;
      const money = (value) => `${m.fmtMoney(value)} دينار`;
      t.same(
        ['stat-batches', 'stat-output', 'stat-mass', 'stat-waste', 'stat-cost', 'stat-per-kg'].map((name) => [descendants(first(name)).find((n) => n.localName === 'dt')?.textContent, descendants(first(name)).find((n) => n.localName === 'dd')?.textContent]),
        [
          ['الدفعات', m.fmtInt(totals.batches)],
          ['الناتج', qty(milli(totals.output_kg))],
          ['كتلة المواد', qty(milli(totals.mass_kg))],
          ['الهدر', `${qty(waste)} (${m.fmtPercent(waste, milli(totals.mass_kg))}٪)`],
          ['الكلفة الكلّية', money(fils(totals.total_value))],
          ['كلفة الكيلو', totals.cost_per_kg === null ? '—' : money(fils(totals.cost_per_kg))],
        ],
        'M: ستّ بطاقات: الدفعات والناتج والكتلة والهدر (بنسبته) والكلفة الكلّية وكلفة الكيلو — والمال مفتوح لمشغّل المعمل',
      );
      const batchTable = tableIn('report-batches');
      t.same(batchTable.headers, ['التاريخ', 'رقم الدفعة', 'الناتج (كغم)', 'كتلة المواد (كغم)', 'الهدر (كغم)', 'الكلفة (دينار)', 'كلفة الكيلو (دينار)', 'ملاحظة'], 'M: أعمدة جدول الدفعات');
      const decimals = (values) => m.columnDecimals(values, 3);
      const out = decimals([...S.month.batches.map((b) => milli(b.output_kg)), milli(totals.output_kg)]);
      const mass = decimals([...S.month.batches.map((b) => milli(b.mass_kg)), milli(totals.mass_kg)]);
      const shrink = decimals([...S.month.batches.map((b) => milli(b.shrink_kg)), waste]);
      t.same(
        batchTable.body,
        S.month.batches.map((b) => [
          fmtDay(b.produced_on), b.doc_no, m.fmtQtyCell(milli(b.output_kg), out), m.fmtQtyCell(milli(b.mass_kg), mass), m.fmtQtyCell(milli(b.shrink_kg), shrink),
          m.fmtMoney(fils(b.money.total_value)), b.money.cost_per_kg === null ? '—' : m.fmtMoney(fils(b.money.cost_per_kg)), b.note ?? '—',
        ]),
        'M: صفّ لكلّ دفعة بترتيب القاعدة، والكميات بمراتب العمود',
      );
      t.same(
        batchTable.foot,
        [['المجموع', m.fmtQtyCell(milli(totals.output_kg), out), m.fmtQtyCell(milli(totals.mass_kg), mass), m.fmtQtyCell(waste, shrink), m.fmtMoney(fils(totals.total_value)), totals.cost_per_kg === null ? '—' : m.fmtMoney(fils(totals.cost_per_kg)), '']],
        'M: صفّ المجموع: الناتج والكتلة من المجاميع، والهدر مجموع خلاياه، والكلفة وكلفة الكيلو',
      );
      t.same(byAction('open-batch').map((n) => n.getAttribute('href')), S.month.batches.map((b) => `/mill/batch/${b.id}`), 'M: رقم الدفعة رابط بطاقتها');
      const materialTable = tableIn('report-materials');
      t.same(materialTable.headers, ['المادّة', 'الكمية', 'الوحدة', 'القيمة (دينار)', 'الحصّة من الكتلة'], 'M: أعمدة جدول المواد');
      const qtyDecimals = decimals(S.month.materials.map((x) => milli(x.qty)));
      const massKg = milli(totals.mass_kg);
      const share = (value) => `${m.fmtPercent(value, massKg)}٪`;
      t.same(
        materialTable.body,
        S.month.materials.map((x) => [x.name, m.fmtQtyCell(milli(x.qty), qtyDecimals), UNIT[x.base_unit], m.fmtMoney(fils(x.value)), !x.in_basis ? 'خارج الكتلة' : x.mass_kg === null ? '—' : share(milli(x.mass_kg))]),
        'M: صفّ لكلّ مادّة بترتيب القاعدة (الكتلة تنازلياً)، ووحدتها، وحصّتها من كتلة الدفعات («خارج الكتلة» للوقود والتعبئة)',
      );
      const known = S.month.materials.reduce((sum, x) => sum + (x.in_basis && x.mass_kg !== null ? milli(x.mass_kg) : 0n), 0n);
      const extra = fils(totals.extra_value);
      t.same(
        materialTable.foot,
        [['المجموع', m.fmtMoney(fils(totals.materials_value)), share(known)], ...(extra !== 0n ? [['تكاليف التشغيل', m.fmtMoney(extra), ''], ['الكلفة الكلّية', m.fmtMoney(fils(totals.total_value)), '']] : [])],
        'M: المجموع: قيمة كلّ المواد وحصّة ما داخل الكتلة، ثمّ تكاليف التشغيل والكلفة الكلّية',
      );
      if (S.month.materials.some((x) => !x.in_basis)) t.ok(materialTable.body.some((row) => row[4] === 'خارج الكتلة'), 'M: «خارج الكتلة» في حصّة الوقود والتعبئة');
      // الطباعة: التقرير وحده.
      const report = first('report');
      t.ok(
        [first('back-recipe'), first('month-bar'), first('month-card'), first('print-report')].every((node) => underClass(node, 'print:hidden')),
        'M: الرجوع والأسهم وبطاقة التقويم وزرّ الطباعة لا تُطبع',
      );
      t.ok(
        [first('report-title'), report, first('report-summary'), ...descendants(report).filter((n) => n.localName === 'table')].every((node) => node && !underClass(node, 'print:hidden')),
        'M: العنوان والملخّص والجدولان تُطبع',
      );
      t.ok(['report-batches', 'report-materials'].every((name) => classOf(first(name)).includes('print:[&>div]:max-h-none') && classOf(first(name)).includes('print:[&>div]:overflow-visible')), 'M: والجدولان بكلّ صفوفهما بلا حدّ ارتفاع');
      const style = all().find((n) => n.localName === 'style')?.textContent ?? '';
      t.ok(
        ['@page { size: A4;', '@media print', '[data-action="report"] tfoot { display: table-row-group; }', 'white-space: normal', 'break-inside: avoid', 'break-after: avoid'].every((rule) => style.includes(rule)),
        'M: الطباعة على A4: الجداول تلتفّ داخل الورقة، والمجاميع لا تتكرّر أسفل كلّ صفحة، ولا ينقسم صفّ ولا عنوان قسم عن جدوله',
      );
      let printed = [];
      globalThis.window.print = () => printed.push(globalThis.document.title);
      try {
        t.eq(textOf('print-report'), 'اطبع أو احفظ PDF', 'M: الزرّ باسمه');
        await click(first('print-report'));
        t.same(printed, [`${title} — ${period}`], 'M: window.print وعنوان الصفحة أثناءها عنوان التقرير ومدّته (اسم ملفّ PDF)');
        fire(globalThis.window, 'afterprint');
        t.eq(globalThis.document.title, 'نظام الدواجن', 'M: ويعود العنوان بعد الطباعة');
      } finally {
        delete globalThis.window.print;
      }
      t.ok(['back-year', 'month-prev', 'month-next'].every((name) => first(name)), 'M: «سنة» والشهر السابق والتالي');
      t.eq(disabled(first('month-next')), m.shiftMonth(M, 1) > nowMonth, 'M: لا شهر بعد الشهر الحالي');
      await click(first('month-prev'));
      t.same([search(), reports().at(-1)], [{ month: m.shiftMonth(M, -1) }, monthRange(m.shiftMonth(M, -1))], 'M: «الشهر السابق» بمدّته');
      t.eq(animations.length, 0, 'M: لا حركة بين شهر وشهر');
    });

    // ── B: الرجوع إلى السنة ───────────────────────────────────────────────────────────────────────────────────
    for (const how of ['button', 'history']) {
      await step(`B-${how}`, async () => {
        let answerYear = null;
        fresh({
          mill_report: (args, n) => (n === 3 ? new Promise((resolve) => (answerYear = () => resolve(sampleFor(args)))) : sampleFor(args)),
        });
        await mount(page(`year=${Y}`));
        await click(tile(M));
        animations = [];
        scrolls = [];
        intoView = [];
        if (how === 'button') {
          t.eq(textOf('back-year'), `سنة ${Y}`, 'B: زرّ الرجوع إلى السنة باسمها');
          await click(first('back-year'));
        } else {
          m.flushSync(() => navigate(-1));
          await settle();
        }
        t.same([search(), reports().map((args) => args.p_from)], [{ year: Y }, [S.year.from, S.month.from, S.year.from]], `B (${how}): السنة من جديد بقراءتها`);
        const target = tile(M);
        t.same(zoomsOf('month-tile').map((entry) => [entry.node.getAttribute('data-month'), entry.keyframes, entry.options]), [[M, flipFrames(CARD, rectOf(target), true), ZOOM]], `B (${how}): بلاطة الشهر تصغر من مستطيل بطاقته إلى مكانها، فوق أخواتها`);
        t.same(fadesOf('month-tile').map((entry) => entry.node.getAttribute('data-month')).sort(), MONTHS.map((_, i) => `${Y}-${pad(i + 1)}`).filter((month) => month !== M), `B (${how}): وبقيّة البلاطات تظهر تدريجياً`);
        t.same([fadesOf('year-head').length, scrolls, intoView.map(([node, options]) => [node.getAttribute('data-month'), options])], [1, [[0, 0]], [[M, { block: 'nearest' }]]], `B (${how}): والرأس، وأعلى الصفحة ثمّ البلاطة في الشاشة`);
        // القراءة الجديدة لم تصل بعد: البلاطات من القراءة السابقة، فالبلاطة التي تصغر بلونها وناتجها.
        const sum = yearMonths.get(M);
        t.same(
          [Number(target?.getAttribute('data-level')), first('tile-qty', target)?.textContent, textOf('year-total') === 'جارٍ الفتح…'],
          [level(sum.kg, yearMax), m.fmtQty(sum.kg, 'kg').main, false],
          `B (${how}): السنة مرسومة من قراءتها السابقة حتّى تصل الجديدة`,
        );
        answerYear();
        await settle();
        t.eq(Number(tile(M)?.getAttribute('data-level')), level(sum.kg, yearMax), `B (${how}): ثمّ القراءة الجديدة`);
      });
    }

    // ── R: تقليل الحركة ───────────────────────────────────────────────────────────────────────────────────────
    await step('R', async () => {
      fresh();
      reduced = true;
      await mount(page(`year=${Y}`));
      await click(tile(M));
      await click(first('back-year'));
      await click(tile(M));
      await click(cell(D));
      await click(first('back-month'));
      t.same([search(), animations.length, scrolls.length], [{ month: M }, 0, 5], 'R: من طلب تقليل الحركة: تتبدّل العروض بلا أيّ حركة (والتمرير إلى الأعلى باقٍ)');
    });

    // ── D: اليوم ──────────────────────────────────────────────────────────────────────────────────────────────────
    await step('D', async () => {
      fresh();
      await mount(page(`month=${M}`));
      t.eq(cell(D)?.localName, 'button', 'D: يوم الإنتاج زرّ');
      const from = rectOf(cell(D));
      await click(cell(D));
      t.same([search(), reports().at(-1)], [{ day: D }, range(D, D)], 'D: الضغط على اليوم يفتح تقريره بمدّة يوم واحد');
      t.same(zoomsOf('day-card').map((entry) => [entry.keyframes, entry.options]), [[flipFrames(from, DAY_CARD, false), ZOOM]], 'D: بطاقة اليوم تكبر من خليّته');
      t.same([fadesOf('day-bar').length, fadesOf('day-rest').length], [1, 1], 'D: وما حولها يظهر تدريجياً');
      const dayEntry = S.day.days.find((entry) => entry.day === D);
      t.same(
        [textOf('day-title'), textOf('day-total'), textOf('report-period'), textOf('back-month')],
        [dayLabel(D), `${m.fmtQty(milli(dayEntry.output_kg), 'kg').main} — ${batchesWord(dayEntry.batches)}`, dayLabel(D), `رجوع إلى ${monthLabel(M)}`],
        'D: اليوم باسمه وتاريخه وناتجه، والتقرير بمدّته',
      );
      t.same(tableIn('report-batches').body.map((row) => row[1]), S.day.batches.map((b) => b.doc_no), 'D: دفعات اليوم وحده');
      t.same(tableIn('report-materials').body.map((row) => row[0]), S.day.materials.map((x) => x.name), 'D: وموادّه');
      t.ok(underClass(first('day-card'), 'print:hidden') && underClass(first('day-bar'), 'print:hidden') && !underClass(first('report'), 'print:hidden'), 'D: البطاقة والرجوع لا يُطبعان، والتقرير يُطبع');
      animations = [];
      await click(first('back-month'));
      t.same(search(), { month: M }, 'D: الرجوع إلى الشهر');
      t.same(zoomsOf('day-cell').map((entry) => [entry.node.getAttribute('data-day'), entry.keyframes]), [[D, flipFrames(DAY_CARD, rectOf(cell(D)), true)]], 'D: خليّة اليوم تصغر من بطاقته إلى مكانها');
    });

    // ── E: شهر فارغ ───────────────────────────────────────────────────────────────────────────────────────────
    await step('E', async () => {
      fresh();
      await mount(page(`month=${EMPTY_MONTH}`));
      t.same(reports(), [monthRange(EMPTY_MONTH)], 'E: قراءة الشهر');
      t.same(
        [byAction('report').length, text().includes('لا إنتاج في هذا الشهر'), all().some((n) => n.localName === 'table'), disabled(first('print-report')), byAction('day-cell').filter((n) => n.localName === 'button').length, textOf('month-total')],
        [1, true, false, true, 0, 'لا إنتاج'],
        'E: «لا إنتاج في هذا الشهر» بلا جداول ولا طباعة، ولا يوم يُفتح',
      );
      t.ok(byAction('day-cell').every((n) => (n.style.backgroundColor ?? '') === ''), 'E: كلّ الأيام بلون السطح');
    });

    // ── عيّنات معدّلة لقاعدتين لا تبلغهما كلّ عيّنة حقيقية ──────────────────────────────────────────────────────────
    await step('M-future', async () => {
      // يوم إنتاج بعد يوم الخادم (اليوم قبل أوّل يوم إنتاج في الشهر): لا يُفتح ويبقى باهتاً.
      const [y, mo, d] = ymd(S.month.days[0].day);
      const at = new Date(Date.UTC(y, mo - 1, d - 1));
      const before = `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
      fresh({ mill_report: (args) => ({ ...sampleFor(args), today: before }) });
      await mount(page(`month=${M}`));
      const days = S.month.days.map((entry) => entry.day);
      t.same(days.map((day) => [cell(day)?.localName, classOf(cell(day)).includes('text-ink-subtle')]), days.map(() => ['div', true]), 'M: يوم إنتاج بعد يوم الخادم لا يُفتح ويبقى باهتاً');
    });
    await step('M-outside', async () => {
      // مادّة in_basis = false: «خارج الكتلة» في حصّتها، ولا تدخل حصّة المجموع (والمقام كتلة الدفعات من المجاميع).
      const flipped = clone(S.month);
      flipped.materials[0].in_basis = false;
      fresh({ mill_report: (args) => (args.p_from === S.month.from ? clone(flipped) : sampleFor(args)) });
      await mount(page(`month=${M}`));
      const massKg = milli(flipped.totals.mass_kg);
      const inside = flipped.materials.reduce((sum, x) => sum + (x.in_basis && x.mass_kg !== null ? milli(x.mass_kg) : 0n), 0n);
      const table = tableIn('report-materials');
      t.same([table.body[0]?.[4], table.foot[0]?.[2]], ['خارج الكتلة', `${m.fmtPercent(inside, massKg)}٪`], 'M: «خارج الكتلة» ولا حصّة لها في المجموع');
    });

    // ── F: الفشل والرفض ───────────────────────────────────────────────────────────────────────────────────────
    await step('F-retry', async () => {
      fresh({
        mill_report: (args, n) => {
          if (n === 1) throw new Error('network down');
          return sampleFor(args);
        },
      });
      await mount(page(`month=${M}`));
      t.same([text().includes('تعذّر تحميل تقرير الإنتاج'), byAction('report').length, Boolean(first('retry'))], [true, 0, true], 'F: فشل القراءة «تعذّر تحميل تقرير الإنتاج» بلا تقرير');
      await click(first('retry'));
      t.same([reports().length, byAction('report').length, text().includes('تعذّر تحميل')], [2, 1, false], 'F: «أعد المحاولة» يقرأ من جديد فيظهر التقرير');
    });
    await step('F-refusal', async () => {
      const refusal = F.refusals.range_too_long;
      fresh({
        mill_report: (args) => {
          if (args.p_from === S.month.from) throw new m.RejectedError(refusal.code, refusal.hint);
          return sampleFor(args);
        },
      });
      await mount(page(`month=${M}`));
      t.same([text().includes(refusal.hint), byAction('report').length, first('report-reset')?.textContent], [true, 0, 'اعرض السنة الحالية'], 'F: الرفض بتلميح الخادم كما هو، وطريق إلى السنة الحالية');
      await click(first('report-reset'));
      t.same([search(), reports().at(-1), byAction('month-tile').length], [{}, yearRange(TODAY.slice(0, 4)), 12], 'F: «اعرض السنة الحالية» يعيد التقويم');
    });
    await step('F-year', async () => {
      fresh({
        mill_report: () => {
          throw new Error('network down');
        },
      });
      await mount(page(`year=${Y}`));
      t.same([byAction('month-tile').length, byAction('legend').length, text().includes('تعذّر تحميل تقرير الإنتاج')], [0, 0, true], 'F: سنة فشلت قراءتها بلا بلاطات «فارغة» ولا دليل (الفاشل ليس فارغاً)');
    });
  } finally {
    if (root) {
      const mounted = root;
      root = null;
      m_unmount(mounted);
    }
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(proto, name, descriptor);
      else delete proto[name];
    }
    delete globalThis.__rep;
    globalThis.Date = RealDate;
    restoreDom();
  }
}

/** فكّ آمن عند رمي غير متوقّع قبل step (لا يُترك جذر مركّب لفحوص بعده). */
function m_unmount(mounted) {
  try {
    mounted.unmount();
  } catch {
    // يُتجاهل: الجذر لم يكتمل تركيبه.
  }
}
