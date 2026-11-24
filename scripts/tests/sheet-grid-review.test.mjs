// المراجعة العدائية لجدول ورقة القاعة في وضع التعديل (عقد 0036 S2: SheetGrid.tsx وgridLogic.ts وuseSheetCells/CellSheet في FlockPage.tsx وsheetGrid.css وقناة
// النوافذ في outbox/uploader.ts). فحوص المراجع (فرع review-0036-grid، 1185e7d) مكيَّفة للشفرة الحالية، وكلّ فحص R يفشل على cfe9710 وينجح بعد إصلاحه؛
// والأسطر «ضابط» تنجح قبله وبعده وتثبت أنّ المشهد حدث. والحامل كـsheet-grid.test: صفحة القاعة الحقيقية (FarmRoutes) بـreact-dom/client على DOM صغير
// (dom.mjs)، والطابور الحقيقي (saveRound وuploadRounds) على fake-indexeddb، والمحلّلات الحقيقية على العيّنة اليدوية؛ وما لا يُرى إلّا بالمتصفّح (التركيز
// الحقيقي، والطباعة، والألوان المفروضة) يُقاس بـChromium (scratchpad fix-0036-grid). وفحوص M تقتل الطفرات التي عبرت المراجعة (mutations.txt وmutations2.txt).
// R1 «تراجع» و«أعِد» وهو يكتب: لا يأخذان التركيز، و«تراجع» يلغي ما كُتب و«أعِد» لا يفعل شيئاً. R2 المحرّر تعديلٌ لم يُحفظ، والخروج من الصفحة وإخفاؤها يحفظان.
// R3 التحديد والمحرّر بيوم الخانة لا برقم صفّها. R4 النقرتان داخل المحرّر لا تعيدانه. R5 لمسة داخل المحرّر لا تحفظ ولا تفتح الورقة. R6 التركيز لا يخرج
// من المحرّر بنقرة على خانة، ويعود إليه. R7 علامات وضع التعديل لا تُطبع. R8 رفعٌ من نافذة أخرى يصل هذه النافذة. R9 Ctrl+D وCtrl+Enter بتأكيد اللصق.
// R10 أطراف النطاق ظاهرة، وفي الألوان المفروضة. R11 التصحيح إلى القيمة المحفوظة والرفع قبله في الطريق يُكتب. R12 Alt مع أيّ مفتاح للمتصفّح. R13 ما تحفظه
// ورقة الخانة (اللمس) في التراجع.
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, Element, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'hall-sheet.hand.json'), 'utf8'));
const read = (...parts) => {
  try {
    return readFileSync(path.join(ROOT, ...parts), 'utf8');
  } catch {
    return '';
  }
};
const CSS = read('src', 'pages', 'farm', 'sheetGrid.css');
const TOKENS = read('src', 'styles', 'tokens.css');
const REAL_FLOCKS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'flocks.ts'));
const REAL_SHEET = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'hallSheet.ts'));
const STUBS = {
  flocks: `export * from ${REAL_FLOCKS}; import { parseOverview as __parseOverview } from ${REAL_FLOCKS};
    export const loadOverviewJson = (...a) => globalThis.__sr.call('loadOverviewJson', a);
    export const loadOverview = async () => __parseOverview(await globalThis.__sr.call('loadOverviewJson', []));
    export const recordFlockWeight = (...a) => globalThis.__sr.call('record_flock_weight', a);
    export const flockDayTransport = { currentUserId: async () => globalThis.__sr.userId, send: (op) => globalThis.__sr.send(op), lookup: async () => null };`,
  hallSheet: `export * from ${REAL_SHEET}; import { parseHallSheet as __sheet, parseFeedSent as __sent } from ${REAL_SHEET};
    export const loadHallSheet = async (id) => __sheet(await globalThis.__sr.call('hall_sheet', [id]));
    export const sendFlockFeed = async (request) => __sent(await globalThis.__sr.call('send_flock_feed', [request]));
    export const voidSheetFeed = (...a) => globalThis.__sr.call('void_flock_issue', a);
    export const decideFlockReject = async (...a) => globalThis.__sr.call('decide_flock_reject', a);`,
  session: 'export const useSession = () => globalThis.__sr.session;',
  Toast: 'export const toast = (spec) => { globalThis.__sr.toasts.push(spec); }; export function Toaster() { return null; }',
  FlockCard: 'export default function FlockCard() { return null; }',
  hallsChunk: `import FlockPage, { HallPage } from './src/pages/farm/FlockPage.tsx';
    const nothing = () => null;
    export const loadHalls = () => Promise.resolve({ HallPage, FlockPage, FlockCard: nothing, Reminders: nothing, FlockEditDialog: nothing });`,
};

const BUILD = {
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  jsx: 'automatic',
  logLevel: 'silent',
  loader: { '.css': 'empty' },
  define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
};
const load = async (result) => import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

async function screens() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';",
    "export { default as FarmRoutes } from './src/pages/farm/FarmRoutes.tsx';",
    "export { onlineStore } from './src/lib/online.ts';",
    "export { openOutbox, pendingOps } from './src/lib/outbox/index.ts';",
    "export { isWindowDirty } from './src/lib/pwa/dirty.ts';",
  ].join('\n');
  const result = await build({
    ...BUILD,
    stdin: { contents: entry, resolveDir: ROOT, loader: 'tsx' },
    plugins: [
      {
        name: 'review-stubs',
        setup(b) {
          b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/flocks$|\/lib\/repo\/hallSheet$|\/Toast$|\/lib\/hallsChunk$|\/halls\/FlockCard$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'review-stub' }));
          b.onLoad({ filter: /.*/, namespace: 'review-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return load(result);
}

/** نافذة أخرى على الجهاز نفسه: الطابور (IndexedDB) نفسه، ورافعها ومخزنها وقناتها وحدات غير وحدات الصفحة (حزمة ثانية). */
async function otherWindow() {
  return load(await build({ ...BUILD, stdin: { contents: "export { uploadQueue } from './src/lib/outbox/index.ts';", resolveDir: ROOT, loader: 'ts' } }));
}

/** قواعد CSS بمحدِّدها وجسمها وما يحيط بها من قواعد @ (بالأقواس وحدها: الملف بلا نصوص فيها أقواس). */
function cssRules(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//gu, '');
  const rules = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '{') {
      stack.push({ prelude: text.slice(start, i).trim(), body: i + 1 });
      start = i + 1;
    } else if (text[i] === '}') {
      const open = stack.pop();
      if (open && !open.prelude.startsWith('@')) rules.push({ selector: open.prelude.replace(/\s+/gu, ' '), body: text.slice(open.body, i).trim(), media: stack.map((entry) => entry.prelude) });
      start = i + 1;
    }
  }
  return rules;
}

/** رموز tokens.css لكلّ سمة: :root، و.dark، و.clarity، و.dark.clarity فوق ما قبلها. */
function tokens(css) {
  const block = (selector) => {
    const at = css.indexOf(`${selector} {`);
    if (at < 0) return {};
    const body = css.slice(at, css.indexOf('}', at));
    return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*([0-9]+) ([0-9]+) ([0-9]+);/gu)].map((m) => [m[1], [Number(m[2]), Number(m[3]), Number(m[4])]]));
  };
  const light = block(':root');
  const dark = { ...light, ...block('.dark') };
  return { light, dark, clarity: { ...light, ...block('.clarity') }, 'dark+clarity': { ...dark, ...block('.dark.clarity') } };
}
const luminance = ([r, g, b]) => {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const over = (fg, alpha, bg) => [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha));

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name, root = body()) => descendants(root).filter((n) => n.getAttribute('data-action') === name);
const textOf = (name, root = body()) => byAction(name, root)[0]?.textContent ?? null;
const clone = (value) => JSON.parse(JSON.stringify(value));
const dialogs = () => all().filter((n) => n.getAttribute('role') === 'dialog');
const tableBy = (caption) => all().find((n) => n.localName === 'table' && n.children.some((c) => c.localName === 'caption' && c.textContent === caption)) ?? null;
const section = (table, name) => table?.children.find((c) => c.localName === name) ?? null;
const bodyRows = (table) => (section(table, 'tbody')?.children ?? []).filter((c) => c.localName === 'tr');
const cells = (tr) => (tr?.children ?? []).filter((c) => c.localName === 'td' || c.localName === 'th').map((c) => c.textContent);
const td = (row, col) => all().find((n) => n.localName === 'td' && n.getAttribute('data-cell') === `${row}:${col}`) ?? null;
const cursorAt = () => all().find((n) => n.getAttribute('data-cursor') === 'true')?.getAttribute('data-cell') ?? null;
const focused = () => globalThis.document.activeElement;
const input = () => byAction('grid-input')[0] ?? null;
const click = async (node, rounds = 60) => {
  if (node) fire(node, 'click', { button: 0, detail: 1 });
  await settle(rounds);
};
const press = async (key, mods = {}, rounds = 30) => {
  fire(focused() ?? body(), 'keydown', { key, code: mods.code, shiftKey: Boolean(mods.shift), ctrlKey: Boolean(mods.ctrl), metaKey: false, altKey: Boolean(mods.alt) });
  await settle(rounds);
};
const typeIn = async (text) => {
  const field = input();
  if (field) {
    field.value = text;
    fire(field, 'input');
  }
  await settle(10);
};
/** الفأرة تنزل على عنصر كالمتصفّح: ينقل التركيز إليه ما لم يُمنع mousedown (فيطلق focusout على المركَّز قبله). يرجّع: هل مُنع. */
const mouseDownOn = async (node, init = {}) => {
  const before = focused();
  const event = fire(node, 'mousedown', { button: 0, ...init });
  if (!event.defaultPrevented && before && before !== node) {
    globalThis.document.activeElement = node;
    fire(before, 'focusout', { relatedTarget: node });
  }
  await settle(20);
  return event.defaultPrevented;
};
const paste = async (text) => {
  await press('v', { ctrl: true });
  fire(focused() ?? body(), 'paste', { clipboardData: { getData: (type) => (type === 'text/plain' ? text : '') } });
  await settle(30);
};
const pencil = async () => click(byAction('sheet-pencil')[0] ?? null, 30);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function (t) {
  const restore = installDom();
  const savedRect = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect');
  const savedClient = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
  Element.prototype.getBoundingClientRect = function rect() {
    if (this.localName === 'tr') {
      const rows = (this.parentNode?.children ?? []).filter((c) => c.localName === 'tr');
      return { top: 40 + rows.indexOf(this) * 40, height: 40 };
    }
    if (this.localName === 'td') return { top: 0, height: 40 };
    return { top: 0, height: 400 };
  };
  Object.defineProperty(Element.prototype, 'clientHeight', { get: () => 400, configurable: true });
  Object.defineProperty(Element.prototype, 'scrollTop', { value: 0, writable: true, configurable: true });
  Element.prototype.scrollIntoView = function into() {};
  Object.defineProperty(Element.prototype, 'isConnected', {
    get() {
      for (let n = this; n; n = n.parentNode) if (n === globalThis.document) return true;
      return false;
    },
    configurable: true,
  });
  try {
    // ── المنطق الصافي (gridLogic.ts) ────────────────────────────────────────────────────────────────────────────────
    const L = await load(await build({ ...BUILD, stdin: { contents: "export * from './src/pages/farm/gridLogic.ts';", resolveDir: ROOT, loader: 'ts' } }));
    const shape = { rows: 46, cols: 6, stops: [2, 3, 4, 5], opener: 4, rtl: true, page: 8, empty: () => false };
    const s = (row, col) => L.at({ row, col });
    {
      const kinds = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Home', 'End', 'PageDown', 'Enter', 'Tab', 'F2', 'Delete', 'z', '7'].map((key) => L.gridKey(s(20, 2), { key, altKey: true }, shape).kind);
      const inEditor = ['ArrowLeft', 'Enter', 'Escape', 'Tab'].map((key) => L.editKey(s(20, 2), { key, altKey: true }, 'enter', shape).kind);
      t.same([kinds, inEditor], [Array(12).fill('pass'), Array(4).fill('pass')], 'R12 Alt مع أيّ مفتاح للمتصفّح (Alt+← وAlt+→ رجوعٌ وتقدّم): لا يحرّك التحديد ولا يحفظ المحرّر');
    }

    // ── الأنماط (sheetGrid.css) ──────────────────────────────────────────────────────────────────────────────────────
    {
      const rules = cssRules(CSS);
      const screenOnly = (rule) => rule.media.some((media) => /^@media\s+screen\b/u.test(media));
      const printed = (rule) => rule.media.some((media) => /^@media\s+print\b/u.test(media));
      const marks = rules.filter((rule) => /data-cursor|data-copied|aria-selected|data-edge|th\[data-sel\]|data-rowsel|data-locked/u.test(rule.selector) && /outline|box-shadow|background|color|font-weight|--sg-/u.test(rule.body));
      t.same(
        [marks.length >= 10, marks.filter((rule) => !screenOnly(rule)).map((rule) => rule.selector)],
        [true, []],
        'R7 علامات وضع التعديل كلّها للشاشة وحدها (إطار الخانة النشطة والمنسوخ، وصبغة النطاق وأطرافه، والرأس والصفّ المحدّدان، والخانة المقفولة): لا شيء منها على الورق',
      );
      t.ok(
        rules.some((rule) => printed(rule) && /\.sg-input/u.test(rule.selector) && /display:\s*none/u.test(rule.body)) && rules.some((rule) => printed(rule) && /\.sg-ghost/u.test(rule.selector) && /visibility:\s*visible/u.test(rule.body)),
        'R7 المحرّر المفتوح يُطبع بقيمة خانته المحفوظة لا بما كُتب ولم يُحفظ',
      );
      t.ok(rules.some((rule) => printed(rule) && rule.selector.includes('.sg-tools') && rule.selector.includes('.sg-bar') && /display:\s*none/u.test(rule.body)), 'M53 الطباعة بلا القلم وبلا شريط وضع التعديل');
      t.ok(rules.some((rule) => rule.selector === ".sg-on td[aria-selected='true']" && /background-color:\s*rgb\(var\(--ring\) \/ 0\.1\d\)/u.test(rule.body)), 'M54 النطاق المحدّد مصبوغ بلون العلامة');
      t.ok(rules.some((rule) => rule.selector === '.sg-on td[data-locked]' && /color:\s*rgb\(var\(--ink-subtle\)\)/u.test(rule.body) && /background-color:\s*rgb\(var\(--surface-2\)\)/u.test(rule.body)), 'M55 الخانة التي لا تُكتب أخفت (نصّ خافت على سطح ثانٍ)');
      // أطراف النطاق: ظلّ داخليّ بلون العلامة لكلّ طرف، و≥ 3:1 على ما جاوره في السمات الأربع (السطح الأبيض، وصفّ اليوم، والصبغة داخل النطاق).
      const edge = rules.find((rule) => rule.selector === '.sg-on td[data-edge]' && screenOnly(rule));
      const sides = ['top', 'bottom', 'first', 'last'].map((side) => rules.some((rule) => rule.selector.includes(`data-edge~='${side}'`) && /--sg-[a-z]+:\s*[2-9]px/u.test(rule.body)));
      const themes = tokens(TOKENS);
      const ratios = Object.entries(themes).map(([name, theme]) => {
        const ring = theme.ring;
        const plain = theme['surface-1'];
        const today = theme['surface-3'];
        const tint = over(ring, 0.12, plain);
        return [name, Math.min(contrast(ring, plain), contrast(ring, today), contrast(ring, tint)) >= 3];
      });
      t.same(
        [Boolean(edge) && (edge?.body.match(/inset [^\n]*rgb\(var\(--ring\)\)/gu) ?? []).length === 4, sides, ratios],
        [true, [true, true, true, true], [['light', true], ['dark', true], ['clarity', true], ['dark+clarity', true]]],
        'R10 أطراف النطاق خطّ بلون العلامة (ظلّ داخليّ 2 نقطة لكلّ طرف) ≥ 3:1 على ما جاوره في الفاتح والداكن و«وضوح»، لا الصبغة وحدها (1.2:1)',
      );
      t.ok(
        /@media \(forced-colors: active\)/u.test(CSS) && rules.some((rule) => rule.media.some((media) => /forced-colors:\s*active/u.test(media)) && rule.selector.includes("aria-selected='true'") && /background-color:\s*Highlight/u.test(rule.body) && /color:\s*HighlightText/u.test(rule.body)),
        'R10 في الألوان المفروضة (التباين العالي في ويندوز) النطاق بلونَي التحديد في النظام (Highlight) لا بصبغة تمحوها',
      );
    }

    // ── الحامل ─────────────────────────────────────────────────────────────────────────────────────────────────────
    const m = await screens();
    const BROILER = FIX.hall_sheet.broiler;
    const TODAY = BROILER.today;
    const dayOf = (row) => BROILER.days[row].on;
    const ws = (role, userId) => ({
      userId, orgId: 'org-sgr', orgName: 'مزرعة', memberId: 'mm-sgr', displayName: 'علي', phone: null, role, scopes: [], divisions: ['broiler', 'layer'],
      canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1,
    });
    const summaryOf = (sheet) => ({
      id: sheet.flock.id, kind: sheet.flock.kind, breed: null, status: sheet.flock.status, version: 3, placed_on: sheet.flock.placed_on, placed_count: sheet.flock.placed_count,
      age_days_at_placement: sheet.flock.age0, age_days: 20, days_since_placement: 21, dead_total: 30, culled_total: 2, live: 3968, live_start_today: 3972, mortality_pct: '0.64',
      feed_kg_total: '0.000', feed_days: 0, feed_span_days: 20, last_weight: null, fcr: null, today: null, eggs_today: null, hdep_today: null, rejects_pending: 0,
    });
    const overviewOf = (sheet) => ({
      today: sheet.today,
      sites: [
        {
          id: 's-1', name: sheet.flock.site_name, division_id: 'd-1', kind: sheet.flock.kind, can_manage: true,
          halls: [{ id: sheet.flock.hall_id, name: sheet.flock.hall_name, capacity: 6000, version: 1, flock: summaryOf(sheet) }],
        },
      ],
    });
    let root = null;
    let userSeq = 0;
    const nav = { go: null };
    function NavHook() {
      nav.go = m.useNavigate();
      return null;
    }
    const fresh = (handlers, { send } = {}) => {
      const sent = [];
      userSeq += 1;
      const userId = `u-sgr-${userSeq}`;
      globalThis.__sr = {
        session: { status: 'ready', workspace: ws('hall_worker', userId), offline: false },
        userId,
        toasts: [],
        call(name, args) {
          const handler = handlers[name];
          if (!handler) return new Promise(() => {});
          try {
            return Promise.resolve(handler(...args));
          } catch (error) {
            return Promise.reject(error);
          }
        },
        async send(op) {
          sent.push(op);
          return send ? send(op) : { kind: 'saved', version: 99 };
        },
      };
      return { sent, userId };
    };
    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      m.flushSync(() =>
        root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(NavHook), m.h(m.Routes, null, m.h(m.Route, { path: '/broiler/*', element: m.h(m.FarmRoutes, { kind: 'broiler' }) })))),
      );
      await settle(90);
    };
    const unmount = async () => {
      if (!root) return;
      m.flushSync(() => root.unmount());
      body().textContent = '';
      globalThis.document.activeElement = null;
      await settle();
      root = null;
    };
    const step = async (label, fn) => {
      m.onlineStore.set(true);
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
      m.onlineStore.set(true);
    };
    const setup = (sheet = BROILER, extra = {}) => ({ loadOverviewJson: () => overviewOf(sheet), hall_sheet: () => clone(sheet), ...extra });
    const slowRereads = (sheet = BROILER) => {
      let reads = 0;
      return () => (reads++ === 0 ? clone(sheet) : new Promise(() => {}));
    };
    const open = async (sheet = BROILER, extra = {}, options = {}) => {
      const ctx = fresh(setup(sheet, extra), options);
      await mount(`/broiler/hall/${sheet.flock.hall_id}`);
      return ctx;
    };
    const moveTo = async (row, col) => {
      const [r, c] = (cursorAt() ?? '0:0').split(':').map(Number);
      for (let i = r; i < row; i += 1) await press('ArrowDown', {}, 5);
      for (let i = r; i > row; i -= 1) await press('ArrowUp', {}, 5);
      for (let i = c; i < col; i += 1) await press('ArrowLeft', {}, 5);
      for (let i = c; i > col; i -= 1) await press('ArrowRight', {}, 5);
      await settle(10);
    };
    const ops = (sent) => sent.map((op) => [op.fn, op.day, op.payload, op.baseVersion]);
    const stampOf = (userId) => ({ userId, orgId: 'org-sgr', displayName: 'علي' });
    /** الورقة بيوم زائد في أوّلها (التسكين أُزيح يوماً إلى الوراء من جهاز آخر): كلّ يوم في الصفّ الذي بعد صفّه. */
    const earlier = () => {
      const shifted = clone(BROILER);
      const extra = clone(shifted.days[0]);
      shifted.days[0].carry_in_kg = null;
      Object.assign(extra, { on: '2026-11-12', age: 0, day_no: 1, dead: 0, culled: 0, day_version: null, gas: null, gas_version: null, feed_kg: null, feed: [], carry_in_kg: null, live_end: 5000 });
      shifted.flock.placed_on = '2026-11-12';
      shifted.days = [extra, ...shifted.days.map((day) => ({ ...day, age: day.age + 1, day_no: day.day_no + 1 }))];
      return shifted;
    };
    /** قراءة الورقة الأولى كما هي، والثانية (بعد أوّل رفع) تصل حين يُقال لها. */
    const secondRead = (next) => {
      let reads = 0;
      let land = null;
      const later = new Promise((resolve) => {
        land = resolve;
      });
      return { handler: () => (reads++ === 0 ? clone(BROILER) : later.then(() => clone(next))), land: () => land(), reads: () => reads };
    };

    // ── R1: «تراجع» و«أعِد» وخانةٌ تُكتب ─────────────────────────────────────────────────────────────────────────────
    await step('R1', async () => {
      let release = null;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      let version = 1;
      const { sent } = await open(BROILER, { hall_sheet: slowRereads() }, {
        send: async (op) => {
          if (op.fn === 'save_flock_day' && op.payload.dead === 7) await held;
          version += 1;
          return { kind: 'saved', version };
        },
      });
      await pencil();
      // B: غاز 02/12 من 1 إلى 3، محفوظ (التراجع: [B]).
      await moveTo(19, 3);
      await press('3');
      await press('Enter', {}, 160);
      // A: هلاكات اليوم، يكتب 7… ثمّ الفأرة على «تراجع».
      await moveTo(20, 2);
      await press('7');
      const typing = input()?.value;
      const undo = byAction('grid-undo')[0];
      const kept = await mouseDownOn(undo);
      await click(undo, 60);
      release();
      await settle(200);
      const gas = ops(sent).filter(([fn]) => fn === 'set_flock_gas');
      t.same([typing, gas[0]], ['7', ['set_flock_gas', dayOf(19), { cylinders: 3 }, 1]], 'R1 ضابط: B (غاز 02/12 من 1 إلى 3) حُفظ، ثمّ 7 يُكتب في هلاكات اليوم');
      t.same(
        [kept, gas.length, sent.filter((op) => op.payload.dead === 7).length, input()?.value ?? null, td(20, 2)?.textContent, textOf('grid-message')],
        [true, 1, 0, null, '4', 'أُلغي ما كُتب في الخانة.'],
        'R1 «تراجع» والخانة تُكتب لا يأخذ التركيز، ويلغي ما كُتب فيها (كإكسل) فلا يُحفظ 7، ولا يمسّ التعديل قبله (B)',
      );
    });

    await step('R1 أعِد', async () => {
      let version = 1;
      const { sent } = await open(BROILER, { hall_sheet: slowRereads() }, { send: async () => ({ kind: 'saved', version: ++version }) });
      await pencil();
      await moveTo(19, 3);
      await press('3');
      await press('Enter', {}, 160);
      await press('ArrowUp');
      await press('z', { ctrl: true }, 160);
      await moveTo(20, 2);
      await press('5');
      const redo = byAction('grid-redo')[0];
      const kept = await mouseDownOn(redo);
      await click(redo, 60);
      await settle(160);
      t.same(
        [kept, ops(sent).map(([fn, , payload]) => [fn, payload.cylinders ?? payload.dead]), input()?.value ?? null],
        [true, [['set_flock_gas', 3], ['set_flock_gas', 1]], '5'],
        'R1 «أعِد» والخانة تُكتب لا يفعل شيئاً: 5 باقٍ في محرّره ولم يُكتب، والغاز الذي تُراجع عنه لا يُعاد',
      );
    });

    // ── R3: التحديد والمحرّر بيوم الخانة ─────────────────────────────────────────────────────────────────────────────
    await step('R3', async () => {
      const read = secondRead(earlier());
      const { sent } = await open(BROILER, { hall_sheet: read.handler }, { send: async () => ({ kind: 'saved', version: 2 }) });
      await pencil();
      // تعديلٌ يُرفع فيطلب قراءة الورقة من جديد (useUploadMark)، والقراءة في الطريق.
      await moveTo(19, 3);
      await press('3');
      await press('Enter', {}, 160);
      await moveTo(20, 2);
      const selected = focused()?.getAttribute('aria-label');
      read.land();
      await settle(160);
      await press('5');
      await press('Enter', {}, 160);
      t.same([selected, read.reads() >= 2], ['الهلاكات، يوم 03/12/2026: 4', true], 'R3 ضابط: هلاكات اليوم (03/12) محدّدة ومركَّزة، ثمّ تصل القراءة الجديدة بصفوف مزاحة');
      t.same(ops(sent).at(-1)?.slice(0, 3), ['save_flock_day', TODAY, { dead: 5, culled: null }], 'R3 5 على خانة 03/12 المحدّدة يُكتب ليوم 03/12 (لا لليوم الذي صار في رقم صفّها)');
    });

    await step('R3 المحرّر', async () => {
      const read = secondRead(earlier());
      const { sent } = await open(BROILER, { hall_sheet: read.handler }, { send: async () => ({ kind: 'saved', version: 2 }) });
      await pencil();
      await moveTo(19, 3);
      await press('3');
      await press('Enter', {}, 160);
      await moveTo(20, 2);
      await press('5');
      read.land();
      await settle(160);
      const still = input()?.getAttribute('aria-label') ?? null;
      await press('Enter', {}, 160);
      t.same([still, ops(sent).at(-1)?.slice(0, 3)], ['الهلاكات يوم 03/12/2026', ['save_flock_day', TODAY, { dead: 5, culled: null }]], 'R3 المحرّر المفتوح يبقى على يومه حين تزيح القراءة الصفوف، وEnter يكتب ليومه');
    });

    await step('R3 يوم اختفى', async () => {
      const later = clone(BROILER);
      later.days = later.days.slice(1).map((day) => ({ ...day, age: day.age - 1, day_no: day.day_no - 1 }));
      later.flock.placed_on = later.days[0].on;
      const read = secondRead(later);
      const { sent } = await open(BROILER, { hall_sheet: read.handler }, { send: async () => ({ kind: 'saved', version: 2 }) });
      await pencil();
      await moveTo(19, 3);
      await press('3');
      await press('Enter', {}, 160);
      await press('Home', { ctrl: true });
      await moveTo(0, 5);
      await press('ت');
      await typeIn('تهوية');
      read.land();
      await settle(160);
      const message = textOf('grid-message');
      await press('Enter', {}, 120);
      t.same(
        [input()?.value ?? null, message, sent.length],
        [null, 'لم يعد يوم 13/11/2026 في الورقة (قُرئت من جديد)، فأُلغي ما كُتب فيه ولم يُحفظ.', 1],
        'R3 يومٌ اختفى من الورقة والمحرّر مفتوح عليه (التسكين أُزيح إلى الأمام): يُلغى ما كُتب ويُقال لماذا، ولا يُكتب في يوم آخر',
      );
    });

    // ── R4: النقرتان داخل المحرّر ────────────────────────────────────────────────────────────────────────────────────
    await step('R4', async () => {
      const { sent } = await open();
      await pencil();
      await press('1');
      await typeIn('12');
      const field = input();
      for (const detail of [1, 2]) {
        fire(field, 'pointerdown', { pointerType: 'mouse', button: 0, buttons: 1, detail });
        fire(field, 'click', { button: 0, detail });
      }
      fire(field, 'dblclick', { button: 0, detail: 2 });
      await settle(20);
      const after = input()?.value;
      await press('Enter', {}, 120);
      t.same([after, ops(sent)], ['12', [['save_flock_day', TODAY, { dead: 12, culled: null }, 1]]], 'R4 نقرتان داخل المحرّر (لتحديد نصّه) تبقيان 12 كما كُتب، وEnter يحفظ 12');
    });

    // ── R5: لمسة داخل المحرّر ────────────────────────────────────────────────────────────────────────────────────────
    await step('R5', async () => {
      const { sent } = await open();
      await pencil();
      await press('1');
      const field = input();
      fire(field, 'pointerdown', { pointerType: 'touch', button: 0, buttons: 1 });
      fire(field, 'click', { button: 0, detail: 1 });
      await settle(120);
      t.same([ops(sent), dialogs().length, input()?.value ?? null], [[], 0, '1'], 'R5 لمسة إصبع أو قلم داخل الخانة التي تُكتب لا تحفظ نصف ما كُتب ولا تفتح ورقتها السفلية');
    });

    // ── R6: التركيز لا يخرج من المحرّر بنقرة على خانة ───────────────────────────────────────────────────────────────
    await step('R6', async () => {
      const { sent } = await open();
      await pencil();
      await press('5');
      fire(td(20, 2), 'pointerdown', { pointerType: 'mouse', button: 0, buttons: 1 });
      const padding = fire(td(20, 2), 'mousedown', { button: 0 }).defaultPrevented;
      fire(td(19, 2), 'pointerdown', { pointerType: 'mouse', button: 2, buttons: 2 });
      const right = fire(td(19, 2), 'mousedown', { button: 2 }).defaultPrevented;
      // التركيز انتقل إلى خانة في الجدول على كلّ حال (إطار أو نقرة لم تُمنع): يعود إلى المحرّر.
      const cell = td(19, 2);
      globalThis.document.activeElement = cell;
      fire(input(), 'focusout', { relatedTarget: cell });
      await wait(5);
      await settle(10);
      const back = focused() === input();
      // ورقمٌ ضُغط والتركيز ما زال على الخانة: يصل المحرّر (يعود إليه التركيز قبل أن يكتبه المتصفّح).
      globalThis.document.activeElement = cell;
      await press('3');
      t.same(
        [padding, right, back, focused() === input(), input()?.value ?? null, sent.length],
        [true, true, true, true, '5', 0],
        'R6 النقر على حاشية الخانة التي تُكتب وبالزرّ الأيمن على خانة أخرى لا يأخذ التركيز من المحرّر، والتركيز الذي انتقل يعود إليه، والرقم التالي يصله؛ لا شيء يُكتب ولا يضيع',
      );
    });

    // ── R8: رفعٌ من نافذة أخرى ───────────────────────────────────────────────────────────────────────────────────────
    await step('R8', async () => {
      const server = { version: 1 };
      const answer = (op) => {
        if (op.fn !== 'save_flock_day') return { kind: 'saved', version: 1 };
        if ((op.baseVersion ?? 0) !== server.version) return { kind: 'stale_day', server: null };
        server.version += 1;
        return { kind: 'saved', version: server.version };
      };
      const { sent, userId } = await open(BROILER, { hall_sheet: slowRereads() }, { send: async (op) => answer(op) });
      await pencil();
      m.onlineStore.set(false);
      await settle();
      await press('7');
      await press('Enter', {}, 160);
      // النافذة الأخرى (الجهاز نفسه والطابور نفسه) يعود اتصالها أوّلاً فترفع كلّ شيء برافعها.
      const other = await otherWindow();
      const results = await other.uploadQueue(stampOf(userId), async () => ({ currentUserId: async () => userId, send: async (op) => answer(op), lookup: async () => null }));
      m.onlineStore.set(true);
      await wait(5);
      await settle(60);
      const pending = td(20, 2)?.textContent ?? null;
      await moveTo(20, 5);
      await press('ت');
      await typeIn('تهوية');
      await press('Enter', {}, 200);
      t.same([results.map((entry) => entry.result.kind), sent.length], [['saved'], 1], 'R8 ضابط: النافذة الأخرى رفعت هلاكات اليوم (نسخة صفّه في الخادم 2)');
      t.same(
        [pending, ops(sent).at(-1)?.slice(0, 4)],
        ['7', ['save_flock_day', TODAY, { note: 'تهوية' }, 2]],
        'R8 رفع النافذة الأخرى يصل هذه النافذة: الخانة بلا «بانتظار الرفع»، والتعديل التالي لليوم نفسه بنسخة صفّه 2 (لا 1 فيُردّ stale_day)',
      );
    });

    // ── R11: التصحيح إلى القيمة المحفوظة والرفع قبله في الطريق ────────────────────────────────────────────────────────
    const heldSeven = () => {
      let release = null;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      let version = 1;
      return {
        release: () => release(),
        send: async (op) => {
          if (op.payload.dead === 7) await held;
          version += 1;
          return { kind: 'saved', version };
        },
      };
    };
    await step('R11', async () => {
      const gate = heldSeven();
      const { sent } = await open(BROILER, { hall_sheet: slowRereads() }, { send: gate.send });
      await pencil();
      await press('7');
      await press('Enter', {}, 60);
      await press('ArrowUp');
      const shown = td(20, 2)?.textContent ?? null;
      await press('4');
      await press('Enter', {}, 60);
      gate.release();
      await settle(200);
      t.ok(shown?.startsWith('7'), `R11 ضابط: 7 معروضة (ورفعها في الطريق) حين يعود ليصحّحها (${shown})`);
      t.same(ops(sent).map(([fn, day, payload]) => [fn, day, payload.dead]), [['save_flock_day', TODAY, 7], ['save_flock_day', TODAY, 4]], 'R11 تصحيح 7 إلى 4 (المحفوظة) ورفع 7 في الطريق يُكتب 4 بعده، لا يُعدّ «بلا تغيير» بلقطة الرسم');
    });

    await step('R11 اللصق', async () => {
      const gate = heldSeven();
      const { sent } = await open(BROILER, { hall_sheet: slowRereads() }, { send: gate.send });
      await pencil();
      await press('7');
      await press('Enter', {}, 60);
      await press('ArrowUp');
      await paste('4');
      const rows = bodyRows(tableBy('الصق في الجدول')).map(cells);
      await click(byAction('grid-batch-go')[0], 60);
      gate.release();
      await settle(200);
      t.same(
        [rows, ops(sent).map(([fn, day, payload]) => [fn, day, payload.dead])],
        [[['03/12/2026', 'الهلاكات', '7', '4', 'يُكتب']], [['save_flock_day', TODAY, 7], ['save_flock_day', TODAY, 4]]],
        'R11 ولصق 4 على 7 المعروضة (ورفعها في الطريق) «يُكتب» بما تعرضه الخانة، ويُكتب بعدها',
      );
    });

    // ── R12: Alt مع أيّ مفتاح في الشاشة ────────────────────────────────────────────────────────────────────────────
    await step('R12', async () => {
      await open();
      await pencil();
      const before = cursorAt();
      const events = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'Home', 'End', 'PageDown'].map((key) => fire(focused(), 'keydown', { key, altKey: true }));
      await settle(30);
      t.same([events.map((event) => event.defaultPrevented), cursorAt()], [Array(6).fill(false), before], 'R12 Alt+← وAlt+→ (وكلّ مفتاح مع Alt) تمرّ إلى المتصفّح: لا تُمنع ولا تحرّك الخانة النشطة');
    });
  } finally {
    if (savedRect) Object.defineProperty(Element.prototype, 'getBoundingClientRect', savedRect);
    else delete Element.prototype.getBoundingClientRect;
    if (savedClient) Object.defineProperty(Element.prototype, 'clientHeight', savedClient);
    else delete Element.prototype.clientHeight;
    delete Element.prototype.scrollTop;
    delete Element.prototype.scrollIntoView;
    delete Element.prototype.isConnected;
    delete globalThis.__sr;
    restore();
  }
}
