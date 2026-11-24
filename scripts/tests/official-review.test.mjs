// مراجعة عقد 0036 الجزء S1 (الجداول والتقارير الرسمية) وإصلاحاتها: فحوص R1–R8 تفشل كلّها على دمج 0036 (cfe9710) وتمرّ بإصلاحها، وفحوص M تمرّ على
// cfe9710 وتفشل على الطفرات التي عبرت المراجعة (mutate.mjs). الشاشات الحقيقية (تقرير الوجبة، والتقرير اليوميّ، وصفحة القاعة) بـreact-dom/client الحقيقي
// على DOM صغير (dom.mjs)، وقراءات repo بدائل تمرّ بمحلّلاتها الحقيقية على عيّنات العقد (hall-sheet.hand.json وreports-contract.json
// وhalls-history-0031.json)، وhtml-to-image بديلٌ يسجّل النسخة التي تُصوَّر. وقواعد official.css وأسلوب الصفحة تُقرأ بمحلّل صغير: قاعدةً قاعدة بسياقها (الشاشة
// أو @media print أو غيرهما)، فلا تمرّ خاصيّة غائبة لأنّ نصّها في قاعدة أخرى (-webkit-print-color-adjust يحوي print-color-adjust، وقاعدة الصورة بعد كتلة
// الطباعة).
// R1 شبكة البيانات على الشاشة بعرضها هي (عمودٌ 9.5rem على الأقلّ، وأكثرها --ofc-cols)، وعلى الورق وفي الصورة --ofc-cols ثابتاً، والتاريخ والوقت والرقم في
//    Num سطرٌ واحد («طُبع في» يومه ووقته كلٌّ في Num، و«أُغلقت يوم» تاريخها). أنّ لا رمز ينكسر بعرض 768–844 والشريط الجانبيّ مفتوح وبـ125٪ مقيسٌ
//    بـChromium (info-grid.cjs في مجلّد الإصلاح)، لا هنا (لا تخطيط في dom.mjs).
// R2 جداول التقرير على الشاشة في إطار DataTable بحدّ 70dvh يثبت فيه رأسها (لا قاعدة شاشة ترفع الحدّ)؛ وعلى الورق وفي الصورة بلا حدّ ولا تمرير.
// R3 شريط الجدول الرسميّ عنوانٌ لقارئ الشاشة (role="heading" بمستواه: 2 لتقرير الوجبة وورقة القاعة وجدول اليوم، و3 في «منذ أن بدأنا»)، وcaption باقٍ.
// R4 صفحة القاعة: العنوان «قاعة 7»، و«هلاكات قاعة (7)» شريط الجدول وحده مرّةً واحدة.
// R5 أزرار التقرير 44 نقطة: «أرسلها» و«نزّلها» بعد رفض المشاركة، وتنقّل التقرير اليوميّ بين الأيّام.
// R6 صفحة القاعة عريضةٌ بكلّ حالها (فارغة، وأثناء القراءة، والانتقال من ورقة إلى قاعة فارغة بلا لحظة ضيّقة).
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Comment, descendants, Element, fire, installDom, serialize, settle, Text } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = (name) => JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', name), 'utf8'));
const SHEET = FIX('hall-sheet.hand.json').hall_sheet.broiler;
const DAY = FIX('reports-contract.json').halls_day;
const HISTORY = FIX('halls-history-0031.json').halls_history;
const CSS_FILE = path.join(ROOT, 'src', 'components', 'ui', 'official.css');
const REAL_FLOCKS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'flocks.ts'));
const REAL_SHEET = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'hallSheet.ts'));
const REAL_REPORTS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'hallReports.ts'));
const STUBS = {
  flocks: `export * from ${REAL_FLOCKS}; import { parseOverview as __parseOverview } from ${REAL_FLOCKS};
    export const loadOverviewJson = (...a) => globalThis.__rv.call('flocks_overview', a);
    export const loadOverview = async () => __parseOverview(await globalThis.__rv.call('flocks_overview', []));
    export const flockDayTransport = { currentUserId: async () => 'u-rv', send: async () => ({ kind: 'saved', version: 9 }), lookup: async () => null };`,
  hallSheet: `export * from ${REAL_SHEET}; import { parseHallSheet as __sheet } from ${REAL_SHEET};
    export const loadHallSheet = async (id) => __sheet(await globalThis.__rv.call('hall_sheet', [id]));
    export const sendFlockFeed = () => new Promise(() => {});
    export const voidSheetFeed = () => new Promise(() => {});
    export const decideFlockReject = async () => undefined;`,
  hallReports: `export * from ${REAL_REPORTS}; import { parseHallsDay as __day, parseHallsHistory as __history } from ${REAL_REPORTS};
    export const loadHallsDay = async (on) => __day(await globalThis.__rv.call('halls_day', [on]));
    export const loadHallsHistory = async (month) => __history(await globalThis.__rv.call('halls_history', [month]));`,
  session: 'export const useSession = () => globalThis.__rv.session; export const sessionStore = { get: () => globalThis.__rv?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__rv.toasts.push(spec); }; export function Toaster() { return null; }',
  image: 'export const toBlob = (node, options) => globalThis.__rv.toBlob(node, options);',
  FlockCard: 'export default function FlockCard() { return null; }',
  hallsChunk: `import FlockPage, { HallPage } from './src/pages/farm/FlockPage.tsx';
    const nothing = () => null;
    export const loadHalls = () => Promise.resolve({ HallPage, FlockPage, FlockCard: nothing, Reminders: nothing, FlockEditDialog: nothing });`,
};

async function screens() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route } from 'react-router-dom';",
    "export { default as FarmRoutes } from './src/pages/farm/FarmRoutes.tsx';",
    "export { default as ReportPage } from './src/pages/halls/ReportPage.tsx';",
    "export { default as DailyPage } from './src/pages/halls/DailyPage.tsx';",
    "export { wideStore } from './src/lib/wide.ts';",
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
        name: 'review-stubs',
        setup(b) {
          b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/flocks$|\/lib\/repo\/hallSheet$|\/lib\/repo\/hallReports$|\/Toast$|\/lib\/hallsChunk$|\/halls\/FlockCard$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'rv-stub' }));
          b.onResolve({ filter: /^html-to-image$/ }, () => ({ path: 'image', namespace: 'rv-stub' }));
          b.onLoad({ filter: /.*/, namespace: 'rv-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

// ── قواعد CSS بسياقها ────────────────────────────────────────────────────────────────────────────────────────────
/** يقسم عند الفاصل خارج الأقواس والأقواس المربّعة (محدِّدٌ مثل :has(a, b) أو قيمةٌ مثل repeat(2, 1fr) لا تنقسم). */
function splitTop(text, separator) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    else if (c === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * قواعد ورقة CSS: [{ media, selectors, decls }]، media null للشاشة كلّها ونصّ @media بلا الكلمة لغيرها («print»، «(min-width: 640px)»)؛ والمحدِّد بمسافات
 * مطويّة، والتصريح [الخاصيّة، القيمة] بترتيبه. التعليقات تُشال أوّلاً، و@page وغيرها من القواعد الخاصّة تُترك.
 */
function cssRules(text) {
  const source = text.replace(/\/\*[\s\S]*?\*\//gu, '');
  const out = [];
  const walk = (body, media) => {
    let at = 0;
    while (at < body.length) {
      const open = body.indexOf('{', at);
      if (open < 0) break;
      const prelude = body.slice(at, open).trim();
      let depth = 1;
      let end = open + 1;
      for (; end < body.length && depth > 0; end += 1) {
        if (body[end] === '{') depth += 1;
        else if (body[end] === '}') depth -= 1;
      }
      const inner = body.slice(open + 1, end - 1);
      if (prelude.startsWith('@media')) walk(inner, prelude.slice('@media'.length).trim());
      else if (!prelude.startsWith('@')) {
        const decls = splitTop(inner, ';').map((decl) => {
          const colon = decl.indexOf(':');
          return [decl.slice(0, colon).trim(), decl.slice(colon + 1).trim()];
        });
        out.push({ media, selectors: splitTop(prelude, ',').map((selector) => selector.replace(/\s+/gu, ' ')), decls });
      }
      at = end;
    }
  };
  walk(source, null);
  return out;
}

/** آخر قيمة للخاصيّة على المحدِّد بعينه (لا محدِّداً يحويه) في السياق media، أو null. */
function valueOf(rules, selector, property, media = null) {
  let value = null;
  for (const rule of rules) {
    if (rule.media !== media || !rule.selectors.includes(selector)) continue;
    for (const [name, v] of rule.decls) if (name === property) value = v;
  }
  return value;
}

// ── أدوات الشاشة ─────────────────────────────────────────────────────────────────────────────────────────────────
const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name, root = body()) => descendants(root).filter((n) => n.getAttribute('data-action') === name);
const classOf = (node) => node?.getAttribute('class') ?? '';
const words = (node) => classOf(node).split(/\s+/u).filter(Boolean);
const clone = (value) => JSON.parse(JSON.stringify(value));
/** ما يُخفى عن قارئ الشاشة: هو أو أحد آبائه aria-hidden. */
const hiddenFromReaders = (node) => {
  for (let n = node; n && n.nodeType === 1; n = n.parentNode) if (n.getAttribute('aria-hidden') === 'true') return true;
  return false;
};
/** ما يُرى على الشاشة: لا sr-only ولا hidden في الطريق إلى الجذر. */
const visible = (node) => {
  for (let n = node; n && n.nodeType === 1; n = n.parentNode) if (words(n).includes('sr-only') || words(n).includes('hidden')) return false;
  return true;
};
/** مستوى العنوان كما يسمعه قارئ الشاشة: h1–h6 برقمه، وrole="heading" بـaria-level؛ وغيرهما null. */
const headingLevel = (node) => {
  if (/^h[1-6]$/u.test(node.localName)) return Number(node.localName.slice(1));
  if (node.getAttribute('role') === 'heading') return Number(node.getAttribute('aria-level') ?? '2');
  return null;
};
/** [النصّ، المستوى] لكلّ شريط جدول رسميّ تحت root (والمستوى null حين يخفى عن قارئ الشاشة أو لا يكون عنواناً). */
const bandsOf = (root = body()) =>
  descendants(root)
    .filter((n) => words(n).includes('ofc-band'))
    .map((n) => [n.textContent, hiddenFromReaders(n) ? null : headingLevel(n)]);
/** بلا h-9 (36 نقطة) وبـh-11 أو أكبر (44 نقطة فأكثر). */
const tall = (node) => Boolean(node) && !words(node).includes('h-9') && words(node).some((cls) => /^(?:h|min-h)-(?:11|12|13|14)$/u.test(cls));
/** نصوص bdi في قيمة مربّع البيانات key. */
const infoBdi = (key) => {
  const box = all().find((n) => n.getAttribute('data-info') === key);
  const dd = box ? descendants(box).find((n) => n.localName === 'dd') : null;
  return dd ? [descendants(dd).filter((n) => n.localName === 'bdi').map((n) => n.textContent), dd.textContent] : null;
};
const beforeprintListeners = () => globalThis.window._listeners.filter((listener) => listener.type === 'beforeprint').length;

export default async function (t) {
  const css = cssRules(readFileSync(CSS_FILE, 'utf8'));

  // ── R1 (CSS): شبكة البيانات بعرضها على الشاشة، و--ofc-cols ثابتاً على الورق وفي الصورة، والتاريخ سطرٌ واحد ───────────────────────────────
  {
    const screen = valueOf(css, '.ofc-info', 'grid-template-columns') ?? '';
    const auto = /^repeat\(auto-fit, minmax\(max\((\d+(?:\.\d+)?)rem, calc\(100% \/ var\(--ofc-cols, 4\) - 1px\)\), 1fr\)\)$/u.exec(screen);
    const mediaRules = css.filter((rule) => rule.media !== null && rule.media !== 'print' && rule.selectors.includes('.ofc-info') && rule.decls.some(([name]) => name === 'grid-template-columns'));
    const fixed = 'repeat(var(--ofc-cols, 4), minmax(0, 1fr))';
    t.same(
      [
        auto !== null,
        // أعرض تاريخ بخطّ القيمة 6.1rem (مقيس بـChromium: «44/44/4444» 6.09، و«03/12/2026» 5.65) وحشوة القيمة 1.25rem.
        auto !== null && Number(auto[1]) >= 7.5,
        mediaRules.map((rule) => rule.media),
        valueOf(css, '.ofc-info', 'grid-template-columns', 'print'),
        valueOf(css, '[data-capture] .ofc-info', 'grid-template-columns'),
        valueOf(css, '.ofc-info bdi', 'white-space'),
      ],
      [true, true, [], fixed, fixed, 'nowrap'],
      `R1 شبكة البيانات على الشاشة بعرضها هي (auto-fit بعمود ≥ 7.5rem وأكثرها --ofc-cols؛ هنا «${screen}»)، بلا عدد أعمدة بعرض الجهاز، و--ofc-cols ثابتاً على الورق وفي الصورة، وNum في القيمة سطرٌ واحد`,
    );
  }

  // ── R2 (CSS): على الشاشة لا شيء يرفع حدّ إطار الجدول (وعلى الورق وفي الصورة بلا حدّ: M22 أدناه) ─────────────────────────────────────────
  {
    const lifts = css.filter(
      (rule) =>
        rule.media !== 'print' &&
        rule.selectors.some((selector) => selector.endsWith('.ofc-frame') && !selector.startsWith('[data-capture]')) &&
        rule.decls.some(([name]) => name === 'max-height' || name === 'overflow' || name === 'overflow-y'),
    );
    t.same(
      lifts.map((rule) => [rule.media, rule.selectors.join(', ')]),
      [],
      'R2 لا قاعدة شاشة ترفع حدّ إطار الجدول الرسميّ (max-h-[70dvh] من DataTable): رأس الجدول ثابتٌ فيه وأنت تمرّ على آخر الوجبة (على cfe9710: «.ofc-paper .ofc-frame { max-height: none }»)',
    );
  }

  // ── M: قواعد official.css التي عبرت طفراتها (M1 M2 M9 M11 M12 M13 M14 M15 M18 M22) ──────────────────────────────────────────
  {
    const coloured = ['.ofc-band', '.ofc-grid > thead > tr > th', '.ofc-grid > tfoot > tr > *', '.ofc-info dt', '.ofc-bar', '.ofc-subbar'];
    t.same(
      coloured.map((selector) => [selector, valueOf(css, selector, 'print-color-adjust'), valueOf(css, selector, '-webkit-print-color-adjust')]),
      coloured.map((selector) => [selector, 'exact', 'exact']),
      'M1/M2 كلّ خلفية ملوّنة تُطبع بلونها بالخاصيّتين: print-color-adjust (فايرفوكس وسفاري الحديث) و-webkit-print-color-adjust (كروم)، كلٌّ في قاعدته',
    );
    const reset = ['background', 'border', 'border-radius', 'padding', 'box-shadow'];
    t.same(
      [reset.map((name) => valueOf(css, '.ofc-paper', name, 'print')), reset.map((name) => valueOf(css, '[data-capture] .ofc-paper', name))],
      [['none', '0', '0', '0', 'none'], ['none', '0', '0', '0', 'none']],
      'M9/M15 الورقة على الورق وفي الصورة بلا إطار ولا حاشية ولا ظلّ ولا خلفية (الصفحة نفسها ورقة)',
    );
    t.same(
      ['.ofc-grid > tbody > tr', '.ofc-info > div', '.ofc-foot'].map((selector) => valueOf(css, selector, 'break-inside', 'print')),
      ['avoid', 'avoid', 'avoid'],
      'M11 على الورق: الصفّ ومربّع البيانات والتذييل بتوقيعاته لا ينقسم بين صفحتين',
    );
    t.same(
      [
        valueOf(css, '.ofc-band', 'background'),
        valueOf(css, '.ofc-band', 'color'),
        valueOf(css, '.ofc-grid > thead > tr > th', 'background'),
        valueOf(css, '.ofc-grid > thead > tr > th', 'color'),
        valueOf(css, '.ofc-grid > tfoot > tr > *', 'background'),
        valueOf(css, '.ofc-grid > tfoot > tr > *', 'font-weight'),
        valueOf(css, '.ofc-sign', 'font-weight'),
      ],
      ['rgb(var(--ofc-band))', 'rgb(var(--ofc-on-band))', 'rgb(var(--ofc-head))', 'rgb(var(--ofc-head-ink))', 'rgb(var(--ofc-total))', '600', '600'],
      'M12/M13/M14/M18 شريط الجدول بلونه ونصّه الأبيض، ورأس الجدول بخلفية العلامة الفاتحة ونصّه، والمجاميع غامقة على خلفيتها، وسطرا التوقيع غامقان',
    );
    t.same(
      [
        [valueOf(css, '.ofc-frame', 'max-height', 'print'), valueOf(css, '.ofc-frame', 'overflow', 'print')],
        [valueOf(css, '[data-capture] .ofc-frame', 'max-height'), valueOf(css, '[data-capture] .ofc-frame', 'overflow')],
      ],
      [['none', 'visible'], ['none', 'visible']],
      'M22 على الورق (في كتلة @media print نفسها، لا قاعدة الصورة بعدها) وفي الصورة الجدول كلّه بلا حدّ ارتفاع ولا تمرير',
    );
  }

  const restore = installDom();
  const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const setNavigator = (value) => Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
  // ما لا يحمله dom.mjs ويحتاجه التصوير (نسخة الصفحة) والتنزيل (نقر الرابط).
  const cloneOf = function cloneNode(deep) {
    if (this.nodeType === 3) return this.ownerDocument.createTextNode(this.nodeValue);
    if (this.nodeType === 8) return this.ownerDocument.createComment(this.nodeValue);
    const copy = this.ownerDocument.createElement(this.localName);
    for (const [key, value] of this._attrs) copy._attrs.set(key, value);
    if (deep) for (const child of this.childNodes) copy.appendChild(child.cloneNode(true));
    return copy;
  };
  const saved = { element: Element.prototype.cloneNode, text: Text.prototype.cloneNode, comment: Comment.prototype.cloneNode, click: Element.prototype.click };
  Element.prototype.cloneNode = cloneOf;
  Text.prototype.cloneNode = cloneOf;
  Comment.prototype.cloneNode = cloneOf;
  Element.prototype.click = function recordClick() {};
  globalThis.window.print = () => {};
  const RealDate = Date;
  let root = null;
  let m = null;
  const unmount = async () => {
    if (!root) return;
    const mounted = root;
    root = null;
    m.flushSync(() => mounted.unmount());
    body().textContent = '';
    globalThis.document.documentElement.removeAttribute('class');
    await settle();
  };
  const step = async (label, fn) => {
    try {
      await fn();
    } catch (error) {
      t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
    }
    await unmount();
    globalThis.Date = RealDate;
  };
  try {
    m = await screens();
    const ws = { userId: 'u-rv', orgId: 'org-rv', orgName: 'مزرعة المراجعة', memberId: 'm-rv', displayName: 'علي', phone: null, role: 'owner', scopes: [], divisions: ['broiler', 'layer'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1 };
    const summary = {
      id: SHEET.flock.id, kind: 'broiler', breed: null, status: 'active', version: 3, placed_on: SHEET.flock.placed_on, placed_count: SHEET.flock.placed_count, age_days_at_placement: 0,
      age_days: 20, days_since_placement: 21, dead_total: 30, culled_total: 2, live: 3968, live_start_today: 3972, mortality_pct: '0.64', feed_kg_total: '0.000', feed_days: 0, feed_span_days: 20,
      last_weight: null, fcr: null, today: null, eggs_today: null, hdep_today: null, rejects_pending: 0,
    };
    const overview = {
      today: SHEET.today,
      sites: [
        {
          id: 's-rv', name: SHEET.flock.site_name, division_id: 'd-rv', kind: 'broiler', can_manage: true,
          halls: [
            { id: 'h-rv-6', name: '6', capacity: 6000, version: 1, flock: null },
            { id: SHEET.flock.hall_id, name: SHEET.flock.hall_name, capacity: 6000, version: 1, flock: summary },
            { id: 'h-rv-8', name: '8', capacity: 6000, version: 1, flock: null },
          ],
        },
      ],
    };
    const closedSheet = clone(SHEET);
    closedSheet.flock.status = 'closed';
    closedSheet.flock.closed_on = '2026-12-01';
    /** answers: بدائل لأجوبة القراءات (دالّة تعيد الجواب، أو 'pending' لقراءة لا تنتهي). */
    const fresh = ({ share, answers = {} } = {}) => {
      const captures = [];
      globalThis.__rv = {
        session: { status: 'ready', workspace: ws, offline: false },
        toasts: [],
        call(name) {
          const base = { hall_sheet: () => clone(SHEET), flocks_overview: () => clone(overview), halls_day: () => clone(DAY), halls_history: () => clone(HISTORY) };
          const answer = answers[name] ?? base[name];
          return answer && answer !== 'pending' ? Promise.resolve(answer()) : new Promise(() => {});
        },
        async toBlob(node, options) {
          captures.push({ node, options, html: serialize(node) });
          return new Blob(['png'], { type: 'image/png' });
        },
      };
      setNavigator({ onLine: true, userAgent: 'node', canShare: () => true, share: share ?? (async () => {}) });
      return { captures };
    };
    const mount = async (url, element) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, element)));
      await settle(60);
      await settle(60);
    };
    const reportRoutes = () =>
      m.h(m.Routes, null, m.h(m.Route, { path: '/halls/report/:flockId', element: m.h(m.ReportPage) }), m.h(m.Route, { path: '/halls/day', element: m.h(m.DailyPage) }));
    const farmRoutes = () => m.h(m.Routes, null, m.h(m.Route, { path: '/broiler/*', element: m.h(m.FarmRoutes, { kind: 'broiler' }) }));
    // «أرسل صورة» والمتصفّح يرفض فتح المشاركة (الضغطة «قديمة»): تظهر «الصورة جاهزة» بـ«أرسلها» و«نزّلها».
    const blocked = async () => {
      const error = new Error('not allowed');
      error.name = 'NotAllowedError';
      throw error;
    };
    // ساعة الجهاز ثابتة («طُبع في» من new Date) وتتقدّم بين خطوة وأخرى.
    let clock = new RealDate(2026, 11, 3, 9, 5).getTime();
    class FixedDate extends RealDate {
      constructor(...args) {
        if (args.length) super(...args);
        else super(clock);
      }
      static now() {
        return clock;
      }
    }

    await step('R1a', async () => {
      globalThis.Date = FixedDate;
      clock = new RealDate(2026, 11, 3, 9, 5).getTime();
      fresh();
      await mount(`/halls/report/${SHEET.flock.id}`, reportRoutes());
      const open = ['placed_on', 'placed', 'age', 'report_day', 'printed', 'state'].map(infoBdi);
      await unmount();
      fresh({ answers: { hall_sheet: () => clone(closedSheet) } });
      await mount(`/halls/report/${SHEET.flock.id}`, reportRoutes());
      t.same(
        [...open, infoBdi('state')],
        [
          [['13/11/2026'], '13/11/2026'],
          [['5,000'], '5,000'],
          [['20'], '20'],
          [['03/12/2026'], '03/12/2026'],
          [['03/12/2026', '09:05'], '03/12/2026 الساعة 09:05'],
          [[], 'قائمة'],
          [['01/12/2026'], 'أُغلقت يوم 01/12/2026'],
        ],
        'R1 تقرير الوجبة: كلّ تاريخ ورقم ووقت في مربّعات البيانات داخل Num (سطرٌ واحد لا ينكسر)، و«طُبع في» يومه ووقته كلٌّ في Num بنصّه نفسه، و«أُغلقت يوم» تاريخها (على cfe9710: «طُبع في» و«أُغلقت يوم» نصٌّ ينكسر داخل التاريخ)',
      );
    });

    await step('R1b', async () => {
      globalThis.Date = FixedDate;
      clock = new RealDate(2026, 11, 3, 9, 5).getTime();
      fresh();
      await mount('/halls/day?on=2026-11-12', reportRoutes());
      t.same(
        ['day', 'sites', 'halls', 'report_day', 'printed'].map(infoBdi),
        [
          [['12/11/2026'], '12/11/2026'],
          [['2'], '2'],
          [['5'], '5'],
          [['12/11/2026'], '12/11/2026'],
          [['03/12/2026', '09:05'], '03/12/2026 الساعة 09:05'],
        ],
        'R1 التقرير اليوميّ: التواريخ والأعداد في Num، و«طُبع في» يومه ووقته كلٌّ في Num (على cfe9710: «24/11/2026» و«الساعة» و«07:10» انكسرت بعرض 768 و125٪)',
      );
    });

    await step('R2', async () => {
      fresh();
      await mount(`/halls/report/${SHEET.flock.id}`, reportRoutes());
      const frames = ['batch-summary', 'batch-days'].map((name) => {
        const table = byAction(name)[0] ? descendants(byAction(name)[0]).find((n) => n.localName === 'table') : null;
        const frame = table?.parentNode ?? null;
        const th = table ? descendants(table).find((n) => n.localName === 'th') : null;
        return [words(frame).filter((cls) => ['ofc-frame', 'max-h-[70dvh]', 'overflow-auto'].includes(cls)), words(th).filter((cls) => cls === 'sticky' || cls === 'top-0')];
      });
      t.same(
        frames,
        [
          [['ofc-frame', 'max-h-[70dvh]', 'overflow-auto'], ['sticky', 'top-0']],
          [['ofc-frame', 'max-h-[70dvh]', 'overflow-auto'], ['sticky', 'top-0']],
        ],
        'R2 جدولا تقرير الوجبة في إطارٍ بحدّ 70dvh يُمرَّر، ورأسهما sticky top-0 فيه (لا تلغيه official.css على الشاشة)',
      );
    });

    await step('R3a', async () => {
      fresh();
      await mount(`/halls/report/${SHEET.flock.id}`, reportRoutes());
      const captions = all().filter((n) => n.localName === 'caption').map((n) => [n.textContent, words(n).includes('sr-only')]);
      t.same(
        [bandsOf(), captions],
        [
          [['خلاصة الوجبة', 2], ['أيام الوجبة', 2]],
          [['خلاصة الوجبة', true], ['أيام الوجبة', true]],
        ],
        'R3 تقرير الوجبة: شريطا الجدولين («خلاصة الوجبة» و«أيام الوجبة») عنوانان من المستوى الثاني لقارئ الشاشة كما كانا h2 قبل 0036، وcaption كلٍّ باقٍ (على cfe9710: aria-hidden وحده)',
      );
    });

    await step('R3b', async () => {
      fresh();
      await mount('/halls/day?on=2026-11-12', reportRoutes());
      const kinds = byAction('hist-kind');
      t.same(
        [
          bandsOf(byAction('day-report')[0] ?? body()),
          kinds.map((section) => [descendants(section).filter((n) => words(n).includes('ofc-bar')).map((n) => headingLevel(n)), bandsOf(section).map(([, level]) => level)]),
        ],
        [[['القاعات — 12/11/2026', 2]], [[[2], [3, 3]], [[2], [3, 3]]]],
        'R3 التقرير اليوميّ: شريط جدول اليوم عنوانٌ من المستوى الثاني، وفي كلّ نوعٍ من «منذ أن بدأنا» (شريطه h2) شريطا «أيّام الشهر» و«الأشهر من البداية» من المستوى الثالث كما كانا h3 (على cfe9710: صفر عنوان)',
      );
    });

    await step('R4', async () => {
      fresh();
      await mount(`/broiler/hall/${SHEET.flock.hall_id}`, farmRoutes());
      const band = 'هلاكات قاعة (7)';
      // كلّ نصٍّ مرئيّ يحمل «هلاكات قاعة (7)» (caption الجدول sr-only ليس منها).
      const texts = [];
      const walk = (node) => {
        for (const child of node.childNodes) {
          if (child.nodeType === 3 && child.nodeValue.includes(band) && visible(child.parentNode)) texts.push(child.parentNode);
          if (child.nodeType === 1) walk(child);
        }
      };
      walk(body());
      const h1 = all().filter((n) => n.localName === 'h1');
      t.same(
        [h1.map((n) => [n.getAttribute('data-action'), n.textContent]), bandsOf().map(([text]) => text), texts.map((n) => (words(n).includes('ofc-band') ? 'band' : n.localName))],
        [[['sheet-title', 'قاعة 7']], [band], ['band']],
        'R4 صفحة القاعة: عنوانها اسم القاعة «قاعة 7» (h1)، و«هلاكات قاعة (7)» شريط الجدول وحده مرّةً واحدة على الشاشة (أُصلح في دمج 0036)',
      );
      t.same(bandsOf(), [[band, 2]], 'R3 ورقة القاعة: شريطها «هلاكات قاعة (7)» عنوانٌ من المستوى الثاني تحت عنوان الصفحة (على cfe9710: aria-hidden وحده)');
    });

    await step('R5a', async () => {
      fresh({ share: blocked });
      await mount(`/halls/report/${SHEET.flock.id}`, reportRoutes());
      fire(byAction('batch-image')[0], 'click', { button: 0 });
      await settle(80);
      const ready = ['batch-send-ready', 'batch-download-ready'].map((name) => byAction(name)[0] ?? null);
      t.same(
        ready.map((node) => [node ? node.textContent : null, tall(node)]),
        [['أرسلها', true], ['نزّلها', true]],
        'R5 تقرير الوجبة: «أرسلها» و«نزّلها» (الصورة جاهزة بعد رفض المشاركة) بارتفاع 44 نقطة كأفعال التقرير (على cfe9710: h-9 = 36)',
      );
    });

    await step('R5b', async () => {
      fresh({ share: blocked });
      await mount('/halls/day?on=2026-11-12', reportRoutes());
      fire(byAction('send-image')[0], 'click', { button: 0 });
      await settle(80);
      const names = ['day-prev', 'day-pick', 'day-next', 'day-today', 'send-ready', 'download-ready'];
      t.same(
        names.map((name) => [name, byAction(name).length, tall(byAction(name)[0] ?? null)]),
        names.map((name) => [name, 1, true]),
        'R5 التقرير اليوميّ: التنقّل بين الأيّام و«أرسلها» و«نزّلها» بارتفاع 44 نقطة كـ«أرسل صورة» و«اطبع» (على cfe9710: h-9 = 36)',
      );
    });

    await step('R6a', async () => {
      fresh();
      await mount('/broiler/hall/h-rv-8', farmRoutes());
      t.same(
        [byAction('hall-empty').length, m.wideStore.get()],
        [1, 1],
        'R6 صفحة القاعة بلا فوج عريضةٌ كصفحة القاعة بفوج: وإلّا قفز العرض بين القاعات بالسابقة والتالية (1600 ← 1152 بعرض 1920؛ على cfe9710: العدّاد صفر)',
      );
    });

    await step('R6b', async () => {
      fresh({ answers: { flocks_overview: 'pending' } });
      await mount(`/broiler/hall/${SHEET.flock.hall_id}`, farmRoutes());
      t.same([byAction('hall-sheet').length, m.wideStore.get()], [0, 1], 'R6 صفحة القاعة عريضةٌ أثناء قراءة الحقول أيضاً، قبل أن تُعرف القاعة (على cfe9710: العدّاد صفر)');
    });

    await step('R6c', async () => {
      fresh();
      await mount(`/broiler/hall/${SHEET.flock.hall_id}`, farmRoutes());
      const seen = [m.wideStore.get()];
      const stop = m.wideStore.subscribe(() => seen.push(m.wideStore.get()));
      try {
        fire(byAction('hall-next')[0], 'click', { button: 0 });
        await settle(60);
      } finally {
        stop();
      }
      t.same(
        [byAction('hall-empty').length, Math.min(...seen) > 0, m.wideStore.get()],
        [1, true, 1],
        `R6 من ورقة «قاعة 7» إلى «قاعة 8» الفارغة بـ«التالية»: الصفحة عريضةٌ في كلّ لحظة (العدّاد ${seen.join(' ← ')}؛ على cfe9710 يهبط صفراً فتضيق)`,
      );
    });

    // ── M: ما عبرته الطفرات في الشاشات (M5 M7 M8 M16) ────────────────────────────────────────────────────────────
    await step('M5', async () => {
      const before = beforeprintListeners();
      fresh();
      await mount(`/halls/report/${SHEET.flock.id}`, reportRoutes());
      const mounted = beforeprintListeners();
      await unmount();
      t.same([before, mounted, beforeprintListeners()], [0, 1, 0], 'M5 مستمع beforeprint («طُبع في» قبل الطباعة) يُزال حين تُغادر الصفحة: لا يبقى يكتب في صفحة أُزيلت');
    });

    await step('M7', async () => {
      fresh();
      await mount(`/halls/report/${SHEET.flock.id}`, reportRoutes());
      t.same(
        byAction('report-head').map((n) => [n.localName, byAction('batch-paper')[0]?.contains(n) ?? false]),
        [['header', true]],
        'M7 رأس التقرير <header> داخل الورقة (عنوان الورقة وبياناتها مَعلمٌ لقارئ الشاشة)',
      );
    });

    await step('M8', async () => {
      globalThis.Date = FixedDate;
      clock = new RealDate(2026, 11, 3, 9, 5).getTime();
      const { captures } = fresh();
      await mount(`/halls/report/${SHEET.flock.id}`, reportRoutes());
      const shown = byAction('report-printed')[0]?.textContent ?? null;
      clock = new RealDate(2026, 11, 3, 16, 2).getTime();
      fire(byAction('batch-image')[0], 'click', { button: 0 });
      await settle(80);
      const capture = captures[0] ?? null;
      const info = capture ? descendants(capture.node).find((n) => n.getAttribute('data-info') === 'printed') : null;
      t.same(
        [shown, captures.length, capture?.html.includes('طُبع في 03/12/2026 الساعة 16:02') ?? false, info ? descendants(info).find((n) => n.localName === 'dd')?.textContent : null],
        ['طُبع في 03/12/2026 الساعة 09:05', 1, true, '03/12/2026 الساعة 16:02'],
        'M8 «أرسل صورة» في تقرير الوجبة يكتب «طُبع في» لحظة الصورة قبل أن تُنسخ الصفحة (التذييل ومربّع البيانات معاً)، لا لحظة فتح الصفحة',
      );
    });

    await step('M16', async () => {
      fresh();
      await mount(`/halls/report/${SHEET.flock.id}`, reportRoutes());
      const style = descendants(byAction('batch-report')[0] ?? body()).find((n) => n.localName === 'style');
      const rules = cssRules(style?.textContent ?? '');
      t.same(
        [valueOf(rules, '[data-capture] table', 'font-size'), valueOf(rules, '[data-action="batch-report"] table', 'font-size', 'print')],
        ['12px', '11px'],
        'M16 صورة تقرير الوجبة بخطّ جداول 12 نقطة (تُقرأ على الهاتف بتكبيرها)، والورقة المطبوعة 11',
      );
    });
  } finally {
    await unmount();
    globalThis.Date = RealDate;
    delete globalThis.__rv;
    Element.prototype.cloneNode = saved.element;
    Text.prototype.cloneNode = saved.text;
    Comment.prototype.cloneNode = saved.comment;
    Element.prototype.click = saved.click;
    if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator);
    else delete globalThis.navigator;
    restore();
  }
}
