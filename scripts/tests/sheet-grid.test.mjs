// ورقة القاعة مقفولة وفوقها قلم، وبعده جدول كإكسل (عقد 0036 الجزء S2؛ كلمة المالك 2026-11-24: «يكون مقفول… بس اكو شعار قلم مال تعديل فوك الجدول… اريد
// الجدول يكون التحكم بي مثل جداول الاكسل… حتى الي يستخدم انظمة اكسل ما يحس بالفرق»؛ وجوابه: خانة العلف في وضع التعديل تفتح نافذة العلف). الشاشة الحقيقية
// (FarmRoutes بصفحة القاعة) بـreact-dom/client الحقيقي على DOM صغير (dom.mjs)، والطابور الحقيقي (saveRound وuploadRounds) على fake-indexeddb، والمحلّل
// الحقيقي (parseHallSheet) على العيّنة اليدوية وعيّنات القاعدة الحقيقية (fixtures/hall-sheet-0035.json)؛ ومنطق الجدول الصافي (gridLogic.ts) وحده.
// كلّ حالة تفشل على 94f1503 (لا قلم ولا وضع تعديل ولا شبكة ولا gridLogic).
// G0 المنطق الصافي: الأسهم بموضعها (rtl وltr)، وTab بالأعمدة التي تُكتب ويلتفّ، وEnter بعد سلسلة Tab إلى عمودها، وCtrl مع سهم كإكسل، وPageUp/Down، والنطاق،
//    ونصّ إكسل ذهاباً وإياباً، والعدد بفاصلة الآلاف في مكانها، وأين يقع اللصق (وقيمة واحدة تملأ النطاق).
// G1 مقفولة: لا زرّ في خانة ولا شبكة، ولمسة الخانة لا تفتح شيئاً، والقلم 44 نقطة؛ ولا قلم لوجبة مغلقة.
// G2 القلم: شريط «وضع التعديل» بدليل المفاتيح و«انتهيت»، والشبكة بخانتها النشطة (اليوم، الهلاكات) والتركيز عليها ومُمرَّرة إليها، ورأس العمود والصفّ مظلّلان.
// G3 الأسهم بموضعها على الشاشة (← إلى العمود التالي في rtl، وبالعكس في ltr). G4 Enter وShift+Enter وTab وShift+Tab (وEnter بعد Tab إلى عمود البدء).
// G5 الكتابة تستبدل القيمة، والرقم العربيّ، وF2 يبقيها، وEsc يلغي. G6 الحفظ بالعملية الصحيحة ونسختها، وتعديلان على يوم واحد بالترتيب بلا stale_day، وبلا
//    نت «بانتظار الرفع»، والمردود في خانته. G7 الحدود في الخانة كورقة الخانة. G8 خانة العلف تفتح نافذته ولا يُصرف شيء بضغطة. G9 Delete وBackspace (والهلاكات
//    بتأكيد يسمّي اليوم). G10 Home/End وCtrl+Home/End وPageUp/Down وCtrl مع سهم وShift والكلّ وEsc. G11 النسخ بنصّ إكسل. G12 اللصق بتأكيد يسمّي كلّ يوم وقيمته
//    ولا يُكتب شيء قبله. G13 التراجع والإعادة. G14 إمكانية الوصول. G15 الفأرة. G16 اللمس. G17 عيّنات القاعدة الحقيقية.
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, Element, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'hall-sheet.hand.json'), 'utf8'));
const REAL = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'hall-sheet-0035.json'), 'utf8'));
// أنماط الجدول كما تُنشر (sheetGrid.css): قواعدها التي يُعتمد عليها تُفحص بنصّها.
const CSS = (() => {
  try {
    return readFileSync(path.join(ROOT, 'src', 'pages', 'farm', 'sheetGrid.css'), 'utf8');
  } catch {
    return '';
  }
})();
/** بصمة نصّ DataTable العاديّ (بلا grid) كما كان على 94f1503: الجدول كما هو حرفاً حين لا شبكة. */
const PLAIN_MARKUP_SHA256 = '32875185c24ed3cac0e0ce0a223668e4bc563db8ab37c6f051e532f4494f6956';
const REAL_FLOCKS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'flocks.ts'));
const REAL_SHEET = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'hallSheet.ts'));
const STUBS = {
  flocks: `export * from ${REAL_FLOCKS}; import { parseOverview as __parseOverview } from ${REAL_FLOCKS};
    export const loadOverviewJson = (...a) => globalThis.__sg.call('loadOverviewJson', a);
    export const loadOverview = async () => __parseOverview(await globalThis.__sg.call('loadOverviewJson', []));
    export const recordFlockWeight = (...a) => globalThis.__sg.call('record_flock_weight', a);
    export const flockDayTransport = { currentUserId: async () => globalThis.__sg.userId, send: (op) => globalThis.__sg.send(op), lookup: async () => null };`,
  hallSheet: `export * from ${REAL_SHEET}; import { parseHallSheet as __sheet, parseFeedSent as __sent } from ${REAL_SHEET};
    export const loadHallSheet = async (id) => __sheet(await globalThis.__sg.call('hall_sheet', [id]));
    export const sendFlockFeed = async (request) => __sent(await globalThis.__sg.call('send_flock_feed', [request]));
    export const voidSheetFeed = (...a) => globalThis.__sg.call('void_flock_issue', a);
    export const decideFlockReject = async (...a) => globalThis.__sg.call('decide_flock_reject', a);`,
  session: 'export const useSession = () => globalThis.__sg.session;',
  Toast: 'export const toast = (spec) => { globalThis.__sg.toasts.push(spec); }; export function Toaster() { return null; }',
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
    "export { MemoryRouter, Routes, Route } from 'react-router-dom';",
    "export { default as FarmRoutes } from './src/pages/farm/FarmRoutes.tsx';",
    "export { onlineStore } from './src/lib/online.ts';",
    "export { openOutbox, pendingOps, reviewEntries } from './src/lib/outbox/index.ts';",
  ].join('\n');
  const result = await build({
    ...BUILD,
    stdin: { contents: entry, resolveDir: ROOT, loader: 'tsx' },
    plugins: [
      {
        name: 'grid-stubs',
        setup(b) {
          b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/flocks$|\/lib\/repo\/hallSheet$|\/Toast$|\/lib\/hallsChunk$|\/halls\/FlockCard$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'grid-stub' }));
          b.onLoad({ filter: /.*/, namespace: 'grid-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return load(result);
}

/** منطق الجدول الصافي وحده؛ null حين لا وحدة (قبل 0036). */
async function logicModule() {
  try {
    return await load(await build({ ...BUILD, stdin: { contents: "export * from './src/pages/farm/gridLogic.ts';", resolveDir: ROOT, loader: 'ts' } }));
  } catch {
    return null;
  }
}

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name, root = body()) => descendants(root).filter((n) => n.getAttribute('data-action') === name);
const textOf = (name, root = body()) => byAction(name, root)[0]?.textContent ?? null;
const clone = (value) => JSON.parse(JSON.stringify(value));
const tableBy = (caption) => all().find((n) => n.localName === 'table' && n.children.some((c) => c.localName === 'caption' && c.textContent === caption)) ?? null;
const section = (table, name) => table?.children.find((c) => c.localName === name) ?? null;
const bodyRows = (table) => (section(table, 'tbody')?.children ?? []).filter((c) => c.localName === 'tr');
const cells = (tr) => (tr?.children ?? []).filter((c) => c.localName === 'td' || c.localName === 'th').map((c) => c.textContent);
const dialogTitled = (start) => all().find((n) => n.getAttribute('role') === 'dialog' && descendants(n).some((c) => c.localName === 'h2' && c.textContent.startsWith(start))) ?? null;
const dialogs = () => all().filter((n) => n.getAttribute('role') === 'dialog');
const ancestor = (node, test) => {
  for (let n = node?.parentNode ?? null; n; n = n.parentNode) if (test(n)) return n;
  return null;
};
const classOf = (node) => node?.getAttribute('class') ?? '';
const td = (row, col) => all().find((n) => n.localName === 'td' && n.getAttribute('data-cell') === `${row}:${col}`) ?? null;
const cursorAt = () => all().find((n) => n.getAttribute('data-cursor') === 'true')?.getAttribute('data-cell') ?? null;
const focused = () => globalThis.document.activeElement;
const focusedCell = () => focused()?.getAttribute?.('data-cell') ?? null;
const input = () => byAction('grid-input')[0] ?? null;
const selected = () => all().filter((n) => n.localName === 'td' && n.getAttribute('aria-selected') === 'true').map((n) => n.getAttribute('data-cell'));
const click = async (node, rounds = 60) => {
  if (node) fire(node, 'click', { button: 0, detail: 1 });
  await settle(rounds);
};
/** مفتاح على العنصر المركَّز (كالمتصفّح)، ويصعد إلى window. */
const press = async (key, mods = {}, rounds = 30) => {
  fire(focused() ?? body(), 'keydown', { key, code: mods.code, shiftKey: Boolean(mods.shift), ctrlKey: Boolean(mods.ctrl), metaKey: false, altKey: false });
  await settle(rounds);
};
/** نصّ المحرّر كما لو كُتب فيه. */
const typeIn = async (text) => {
  const field = input();
  if (field) {
    field.value = text;
    fire(field, 'input');
  }
  await settle(10);
};
const tap = async (node, rounds = 60) => {
  if (node) {
    fire(node, 'pointerdown', { pointerType: 'touch', button: 0, buttons: 1 });
    fire(node, 'click', { button: 0, detail: 1 });
  }
  await settle(rounds);
};
const mouseDown = async (node, mods = {}, rounds = 20) => {
  if (node) fire(node, 'pointerdown', { pointerType: 'mouse', button: 0, buttons: 1, shiftKey: Boolean(mods.shift) });
  await settle(rounds);
};
const pencil = async () => click(byAction('sheet-pencil')[0] ?? null, 30);

export default async function (t) {
  const restore = installDom();
  const savedRect = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect');
  const savedClient = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
  const scrolled = [];
  // صفّ 40 نقطة، والإطار 400: صفحة واحدة = 400 ÷ 40 − 2 = 8 صفوف.
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
  Element.prototype.scrollIntoView = function into() {
    scrolled.push(this.getAttribute('data-cell'));
  };
  // كالمتصفّح: النافذة حين تُغلق تعيد التركيز إلى ما فتحها إن بقي في الصفحة (focus.ts يسأل isConnected).
  Object.defineProperty(Element.prototype, 'isConnected', {
    get() {
      for (let n = this; n; n = n.parentNode) if (n === globalThis.document) return true;
      return false;
    },
    configurable: true,
  });
  const navigatorClipboard = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard');
  try {
    // ── G0: المنطق الصافي ─────────────────────────────────────────────────────────────────────────────────────────
    const L = await logicModule();
    t.ok(L !== null, 'G0 منطق الجدول كإكسل في وحدة صافية (src/pages/farm/gridLogic.ts)');
    if (L) {
      const shape = (over = {}) => ({ rows: 46, cols: 6, stops: [2, 3, 4, 5], opener: 4, rtl: true, page: 8, empty: () => false, ...over });
      const s = (row, col) => L.at({ row, col });
      const key = (k, mods = {}) => ({ key: k, shiftKey: Boolean(mods.shift), ctrlKey: Boolean(mods.ctrl), code: mods.code });
      const go = (sel, k, mods, sh = shape()) => {
        const intent = L.gridKey(sel, key(k, mods), sh);
        return intent.kind === 'move' ? [intent.selection.cursor.row, intent.selection.cursor.col] : intent.kind;
      };
      t.same(
        [go(s(20, 2), 'ArrowLeft'), go(s(20, 2), 'ArrowRight'), go(s(20, 2), 'ArrowLeft', {}, shape({ rtl: false })), go(s(20, 2), 'ArrowRight', {}, shape({ rtl: false })), go(s(20, 2), 'ArrowDown'), go(s(0, 0), 'ArrowUp'), go(s(0, 0), 'ArrowRight')],
        [[20, 3], [20, 1], [20, 1], [20, 3], [21, 2], [0, 0], [0, 0]],
        'G0 الأسهم بموضعها على الشاشة: في rtl ← إلى العمود التالي و→ إلى السابق، وبالعكس في ltr؛ والطرف لا يتجاوز',
      );
      const tab1 = L.gridKey(s(19, 2), key('Tab'), shape());
      const tab2 = L.gridKey(tab1.selection, key('Tab'), shape());
      const tabWrap = L.gridKey(s(19, 5), key('Tab'), shape());
      const back = L.gridKey(s(20, 2), key('Tab', { shift: true }), shape());
      const enterBack = L.gridKey(tab2.selection, key('Enter'), shape({ opener: null }));
      t.same(
        [L.gridKey(s(45, 5), key('Tab'), shape()).kind, L.gridKey(s(0, 0), key('Tab', { shift: true }), shape()).kind, L.gridKey(s(0, 2), key('Tab', { shift: true }), shape()).kind],
        ['pass', 'pass', 'pass'],
        'G0 Tab من آخر خانة تُكتب وShift+Tab من أوّلها يخرجان من الجدول (لا تُحبس لوحة المفاتيح فيه)',
      );
      t.same(
        [tab1.selection.cursor, tab2.selection.cursor, tabWrap.selection.cursor, back.selection.cursor, enterBack.selection.cursor, L.gridKey(s(19, 4), key('Enter'), shape()).kind],
        [{ row: 19, col: 3 }, { row: 19, col: 4 }, { row: 20, col: 2 }, { row: 19, col: 5 }, { row: 20, col: 2 }, 'open'],
        'G0 Tab إلى العمود التالي الذي يُكتب ومن آخره إلى أوّل عمود في الصفّ التالي، وShift+Tab بالعكس، وEnter بعد سلسلة Tab إلى عمود بدئها، وEnter على العلف يفتحه',
      );
      const filled = new Set([1, 2, 3, 4, 5, 7, 12, 18, 19, 20]);
      const data = shape({ empty: (pos) => !filled.has(pos.row) });
      const jumps = [];
      let at = s(1, 2);
      for (let i = 0; i < 6; i += 1) {
        at = L.gridKey(at, key('ArrowDown', { ctrl: true }), data).selection;
        jumps.push(at.cursor.row);
      }
      t.same(jumps, [5, 7, 12, 18, 20, 45], 'G0 Ctrl+↓ كإكسل: إلى آخر خانة متّصلة فيها شيء، ثمّ إلى أوّل خانة فيها شيء بعد الفراغ، ثمّ طرف الجدول');
      t.same(
        [go(s(20, 3), 'Home'), go(s(20, 3), 'End'), go(s(20, 3), 'Home', { ctrl: true }), go(s(20, 3), 'End', { ctrl: true }), go(s(20, 3), 'PageDown'), go(s(20, 3), 'PageUp'), go(s(3, 3), 'PageUp'), go(s(44, 3), 'PageDown')],
        [[20, 0], [20, 5], [0, 0], [45, 5], [28, 3], [12, 3], [0, 3], [45, 3]],
        'G0 Home/End أوّل العمود وآخره، وCtrl+Home/End أوّل يوم وآخره، وPageUp/PageDown بشاشة (8 صفوف)',
      );
      const ext = L.gridKey(L.gridKey(s(18, 2), key('ArrowDown', { shift: true }), shape()).selection, key('ArrowLeft', { shift: true }), shape()).selection;
      const all6 = L.gridKey(s(20, 2), key('a', { ctrl: true }), shape()).selection;
      const arabicUndo = L.gridKey(s(1, 1), { key: 'ئ', code: 'KeyZ', ctrlKey: true }, shape());
      t.same(
        [ext.cursor, L.rangeOf(ext), all6.cursor, L.rangeOf(all6), L.gridKey(ext, key('Escape'), shape()).kind, arabicUndo.kind, L.gridKey(s(1, 1), key('y', { ctrl: true }), shape()).kind, L.gridKey(s(1, 1), key('7'), shape())],
        [{ row: 18, col: 2 }, { top: 18, bottom: 19, first: 2, last: 3 }, { row: 20, col: 2 }, { top: 0, bottom: 45, first: 0, last: 5 }, 'escape', 'undo', 'redo', { kind: 'type', text: '7' }],
        'G0 Shift مع سهم يمدّ النطاق والخانة النشطة في مكانها، وCtrl+A الكلّ، وEsc، وCtrl+Z بموضع المفتاح (لوحة عربية)، وCtrl+Y، والحرف كتابة',
      );
      const row = L.gridKey(s(20, 3), { key: ' ', shiftKey: true }, shape()).selection;
      const column = L.gridKey(s(20, 3), { key: ' ', ctrlKey: true }, shape()).selection;
      t.same([L.rangeOf(row), row.cursor, L.rangeOf(column)], [{ top: 20, bottom: 20, first: 0, last: 5 }, { row: 20, col: 3 }, { top: 0, bottom: 45, first: 3, last: 3 }], 'G0 Shift+Space الصفّ كلّه وCtrl+Space العمود كلّه (كإكسل)');
      const inRange = L.gridKey({ ...ext }, key('Enter'), shape({ opener: null })).selection;
      t.same([inRange.cursor, L.rangeOf(inRange)], [{ row: 19, col: 2 }, { top: 18, bottom: 19, first: 2, last: 3 }], 'G0 Enter داخل نطاق ينقل الخانة النشطة فيه ويبقى النطاق (إدخال كتلة كإكسل)');
      const commit = L.editKey(s(20, 2), key('ArrowLeft'), 'enter', shape());
      t.same(
        [commit.kind, commit.then?.cursor, L.editKey(s(20, 2), key('ArrowLeft'), 'edit', shape()).kind, L.editKey(s(20, 2), key('Enter', { ctrl: true }), 'enter', shape()).then, L.editKey(s(20, 2), key('Escape'), 'enter', shape()).kind, L.editKey(s(20, 2), key('F2'), 'enter', shape()).kind],
        ['commit', { row: 20, col: 3 }, 'pass', null, 'cancel', 'toggle'],
        'G0 أثناء التعديل: السهم يحفظ وينتقل (بدأ بحرف) أو يحرّك المؤشّر في النصّ (F2)، وCtrl+Enter يحفظ ويبقى، وEsc يلغي، وF2 يبدّل',
      );
      const tsv = L.toTsv([['4', ''], ['1', '1'], ['تهوية\tجيّدة', 'قال "نعم"']]);
      t.same(
        [tsv, L.parseTsv(tsv), L.parseTsv('7\t2\r\n5\t3\r\n'), L.parseTsv('"سطر\nثانٍ"\t5'), L.parseTsv('')],
        ['4\t\r\n1\t1\r\n"تهوية\tجيّدة"\t"قال ""نعم"""', [['4', ''], ['1', '1'], ['تهوية\tجيّدة', 'قال "نعم"']], [['7', '2'], ['5', '3']], [['سطر\nثانٍ', '5']], []],
        'G0 نصّ إكسل ذهاباً وإياباً: جدولة بين الخانات وسطر لكلّ صفّ، والتنصيص لما فيه جدولة أو سطر أو علامة، والسطر الأخير الفارغ لا يُعدّ',
      );
      t.same(
        ['7', '١٢', ' 1,234 ', '12.0', '0,5', '1,23', '-3', '2.5', 'abc', ''].map((text) => L.parseCount(text)),
        [7, 12, 1234, 12, null, null, null, null, null, null],
        'G0 العدد: أرقام غربية وعربية، وفاصلة الآلاف في مكانها وحده («0,5» ليست 5)، ولا سالب ولا كسر',
      );
      // 0037: لترات الكاز، أو براميل بعدها «ب» أو «برميل» أو «براميل» (البرميل 200 لتر، جواب المالك).
      t.same(
        ['400', '2ب', ' 2 ب ', '٣ براميل', '1 برميل', '1,000', 'ب', '2 كغم', '2.5ب', '-1ب'].map((text) => L.parseLiters(text)),
        [400, 400, 400, 600, 200, 1000, null, null, null, null],
        'G0 الكاز: لترات، أو براميل بعدها «ب» أو «برميل» أو «براميل» (× 200)، وغير ذلك لا',
      );
      const fill = L.pasteTargets([['2']], { ...s(15, 3), end: { row: 17, col: 3 } }, { rows: 46, cols: 6 });
      const block = L.pasteTargets([['a', 'b'], ['c', 'd']], s(45, 5), { rows: 46, cols: 6 });
      t.same(
        [fill.targets.map((x) => [x.pos.row, x.pos.col, x.raw]), [block.targets.map((x) => [x.pos.row, x.pos.col, x.raw]), block.outside]],
        [[[15, 3, '2'], [16, 3, '2'], [17, 3, '2']], [[[45, 5, 'a']], 3]],
        'G0 قيمة واحدة على نطاق تملؤه كلّه، والكتلة من أوّل خانة وما وقع خارج الورقة يُعدّ ولا يُلصق',
      );
    }

    // ── الحامل ─────────────────────────────────────────────────────────────────────────────────────────────────────
    const m = await screens();
    const BROILER = FIX.hall_sheet.broiler;
    const TODAY = BROILER.today;
    const ws = (role, userId) => ({
      userId, orgId: 'org-1', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role, scopes: [], divisions: ['broiler', 'layer'],
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
    const fresh = (handlers, { send } = {}) => {
      const calls = [];
      const sent = [];
      userSeq += 1;
      const userId = `u-sg-${userSeq}`;
      globalThis.__sg = {
        session: { status: 'ready', workspace: ws('hall_worker', userId), offline: false },
        userId,
        toasts: [],
        call(name, args) {
          calls.push([name, args]);
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
      return { calls, sent, userId };
    };
    const named = (calls, name) => calls.filter(([n]) => n === name).map(([, args]) => args);
    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      m.flushSync(() =>
        root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(m.Routes, null, m.h(m.Route, { path: '/broiler/*', element: m.h(m.FarmRoutes, { kind: 'broiler' }) }), m.h(m.Route, { path: '/layers/*', element: m.h(m.FarmRoutes, { kind: 'layer' }) })))),
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
      scrolled.length = 0;
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
      m.onlineStore.set(true);
      globalThis.document.documentElement.removeAttribute('dir');
    };
    const setup = (sheet = BROILER, extra = {}) => ({ loadOverviewJson: () => overviewOf(sheet), hall_sheet: () => clone(sheet), ...extra });
    /** القراءة الأولى للورقة، وكلّ قراءة بعدها لا تصل (الورقة المعروضة قديمة). */
    const slowRereads = (sheet = BROILER) => {
      let reads = 0;
      return () => (reads++ === 0 ? clone(sheet) : new Promise(() => {}));
    };
    const sheetTable = () => tableBy('هلاكات قاعة (7)');
    const open = async (sheet = BROILER, extra = {}, options = {}) => {
      const ctx = fresh(setup(sheet, extra), options);
      await mount(`/${sheet.flock.kind === 'layer' ? 'layers' : 'broiler'}/hall/${sheet.flock.hall_id}`);
      return ctx;
    };
    /** يحرّك الخانة النشطة إلى (صفّ، عمود) بالأسهم من مكانها (rtl: ← إلى العمود التالي). */
    const moveTo = async (row, col) => {
      const [r, c] = (cursorAt() ?? '0:0').split(':').map(Number);
      for (let i = r; i < row; i += 1) await press('ArrowDown', {}, 5);
      for (let i = r; i > row; i -= 1) await press('ArrowUp', {}, 5);
      for (let i = c; i < col; i += 1) await press('ArrowLeft', {}, 5);
      for (let i = c; i > col; i -= 1) await press('ArrowRight', {}, 5);
      await settle(10);
    };
    const ops = (sent) => sent.map((op) => [op.fn, op.day, op.payload, op.baseVersion]);
    /** عمليات أيام مختلفة تُرفع بترتيب الطابور (لا ترتيب بينها لمفاتيح مختلفة): تُقارن مرتّبة. */
    const sorted = (list) => [...list].sort((a, b) => `${a[0]}:${a[1]}`.localeCompare(`${b[0]}:${b[1]}`));
    const dayOf = (row) => BROILER.days[row].on;

    // ── G1: مقفولة ────────────────────────────────────────────────────────────────────────────────────────────────
    await step('G1', async () => {
      const { calls } = await open();
      const table = sheetTable();
      const inTable = (n) => ancestor(n, (a) => a === table) !== null;
      t.same(
        [all().filter((n) => n.localName === 'button' && inTable(n)).length, table?.getAttribute('role'), all().filter((n) => n.localName === 'td' && n.getAttribute('tabindex') !== null).length, textOf('sheet-grid') !== null],
        [0, null, 0, true],
        'G1 الورقة مقفولة: لا زرّ في أيّ خانة، ولا شبكة، ولا خانة تأخذ التركيز',
      );
      const button = byAction('sheet-pencil')[0];
      t.same([button?.textContent, button?.localName, /\bh-11\b/u.test(classOf(button))], ['تعديل الجدول', 'button', true], 'G1 فوق الجدول «✎ تعديل الجدول» زرّاً بارتفاع 44 نقطة');
      await tap(byAction('cell-dead').find((n) => ancestor(n, (a) => a.getAttribute?.('data-tone') === 'mark')) ?? null);
      await tap(byAction('cell-feed')[20] ?? null);
      t.same([dialogs().length, named(calls, 'send_flock_feed').length], [0, 0], 'G1 لمسة خانة والورقة مقفولة لا تفتح شيئاً');
      await unmount();
      fresh({ hall_sheet: () => clone(REAL.hall_sheet_closed) });
      await mount(`/broiler/flock/${REAL.hall_sheet_closed.flock.id}`);
      t.same([textOf('sheet-title'), byAction('sheet-pencil').length], ['قاعة 9', 0], 'G1 الوجبة المغلقة (عيّنة القاعدة): بلا قلم، للقراءة فقط');
    });

    // ── G2: القلم ─────────────────────────────────────────────────────────────────────────────────────────────────
    await step('G2', async () => {
      await open();
      await pencil();
      const table = sheetTable();
      const heads = descendants(section(table, 'thead') ?? body()).filter((n) => n.localName === 'th');
      t.same(
        [textOf('sheet-edit-title'), textOf('sheet-edit-done'), byAction('sheet-pencil').length, table?.getAttribute('role'), table?.getAttribute('aria-multiselectable'), textOf('grid-guide')?.includes('Enter') && textOf('grid-guide')?.includes('Ctrl+V')],
        ['وضع التعديل', 'انتهيت', 0, 'grid', 'true', true],
        'G2 بعد القلم: شريط «وضع التعديل» بدليل المفاتيح و«انتهيت»، والجدول شبكة',
      );
      t.same(
        [cursorAt(), focusedCell(), td(20, 2)?.getAttribute('tabindex'), all().filter((n) => n.getAttribute?.('tabindex') === '0' && n.localName === 'td').length, scrolled.includes('20:2'), textOf('grid-name')],
        ['20:2', '20:2', '0', 1, true, 'الهلاكات · يوم 03/12/2026 (العمر 20)'],
        'G2 الخانة النشطة هلاكات اليوم، والتركيز عليها ومُمرَّرة إليها، وخانة واحدة في ترتيب Tab، ومربّع الاسم يسمّيها',
      );
      t.same(
        [heads.map((n) => n.getAttribute('data-sel')), td(20, 0)?.getAttribute('data-rowsel'), td(20, 1)?.getAttribute('data-rowsel'), td(19, 0)?.getAttribute('data-rowsel')],
        [[null, null, 'true', null, null, null, null], 'true', 'true', null],
        'G2 رأس العمود المحدّد وخانتا الصفّ المحدّد (العمر والتاريخ) مظلّلة',
      );
      await click(byAction('sheet-edit-done')[0]);
      t.same([sheetTable()?.getAttribute('role'), byAction('sheet-edit-title').length, focused()?.getAttribute('data-action')], [null, 0, 'sheet-pencil'], 'G2 «انتهيت»: الورقة مقفولة من جديد والتركيز على القلم');
    });

    // ── G3: الأسهم ─────────────────────────────────────────────────────────────────────────────────────────────────
    await step('G3', async () => {
      await open();
      await pencil();
      const trail = [];
      for (const k of ['ArrowLeft', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'ArrowUp']) {
        await press(k);
        trail.push(cursorAt());
      }
      t.same(trail, ['20:3', '20:4', '20:3', '21:3', '20:3', '19:3'], 'G3 ← إلى العمود التالي على الشاشة (rtl: الغاز ثمّ الكاز)، و→ رجوعاً، و↓ و↑ بالأيّام');
      t.same([focusedCell(), scrolled.at(-1)], ['19:3', '19:3'], 'G3 التركيز يتبع الخانة النشطة وتُمرَّر إليها');
      globalThis.document.documentElement.setAttribute('dir', 'ltr');
      await press('ArrowLeft');
      t.eq(cursorAt(), '19:2', 'G3 والصفحة من اليسار: ← إلى العمود السابق (الاتجاه من الصفحة لا ثابت)');
    });

    // ── G4: Enter وTab ─────────────────────────────────────────────────────────────────────────────────────────────
    await step('G4', async () => {
      await open();
      await pencil();
      await moveTo(19, 2);
      await press('Enter');
      const afterEnter = cursorAt();
      await press('Enter', { shift: true });
      const afterShift = cursorAt();
      const tabs = [];
      for (let i = 0; i < 5; i += 1) {
        await press('Tab');
        tabs.push(cursorAt());
      }
      await press('Tab', { shift: true });
      const shiftTab = cursorAt();
      // 0037: الكاز (4) بعد الغاز يُكتب، فالعلف 5 والملاحظة 6.
      t.same([afterEnter, afterShift, tabs, shiftTab], ['20:2', '19:2', ['19:3', '19:4', '19:5', '19:6', '20:2'], '19:6'], 'G4 Enter ينزل وShift+Enter يصعد، وTab إلى الخانة التالية التي تُكتب ومن آخرها إلى أوّل الصفّ التالي، وShift+Tab رجوعاً');
      await moveTo(17, 2);
      await press('Tab');
      await press('Enter');
      t.eq(cursorAt(), '18:2', 'G4 Tab ثمّ Enter: إلى الصفّ التالي في عمود بدء السلسلة (كإكسل)');
    });

    // ── G5: الكتابة ────────────────────────────────────────────────────────────────────────────────────────────────
    await step('G5', async () => {
      const { sent } = await open();
      await pencil();
      await press('7');
      t.same([input()?.value, input()?.getAttribute('aria-label'), input()?.getAttribute('inputMode') ?? input()?.getAttribute('inputmode'), focused() === input()], ['7', 'الهلاكات يوم 03/12/2026', 'numeric', true], 'G5 رقم على الخانة يبدأ تعديلها ويحلّ محلّ القيمة (7 لا 47)، والمحرّر مركَّز بلوحة أرقام');
      await press('Enter', {}, 120);
      t.same([ops(sent), cursorAt(), cells(bodyRows(sheetTable())[20])[2]], [[['save_flock_day', TODAY, { dead: 7, culled: null }, 1]], '21:2', '7'], 'G5 Enter يحفظ (save_flock_day بنسخة صفّ اليوم) وينزل، والخانة 7');
      await press('ArrowUp');
      await press('ArrowUp');
      await press(String.fromCodePoint(0x668));
      t.eq(input()?.value, '8', 'G5 الرقم العربيّ «٨» يُكتب 8');
      await press('Escape');
      t.same([input(), ops(sent).length, cells(bodyRows(sheetTable())[19])[2], focusedCell()], [null, 1, '1', '19:2'], 'G5 Esc يلغي: لا شيء يُكتب والقيمة كما كانت والتركيز على الخانة');
      await press('F2');
      t.eq(input()?.value, '1', 'G5 F2 يعدّل القيمة كما هي');
      await typeIn('12');
      await press('Enter', {}, 120);
      t.same(ops(sent).at(-1), ['save_flock_day', dayOf(19), { dead: 12, culled: null }, 1], 'G5 F2 ثمّ تعديل ثمّ Enter يحفظ القيمة الجديدة');
      await moveTo(16, 6);
      await press('ت');
      t.same([input()?.value, input()?.getAttribute('data-kind')], ['ت', 'text'], 'G5 حرف على خانة الملاحظة يبدأ نصّها به');
      await typeIn('تهوية');
      await press('Tab', {}, 120);
      t.same([ops(sent).at(-1), cursorAt()], [['save_flock_day', dayOf(16), { note: 'تهوية' }, null], '17:2'], 'G5 Tab يحفظ الملاحظة (بنسخة null: لا صفّ بعد) وينتقل');
      await moveTo(17, 3);
      await press('5');
      await press('ArrowLeft', {}, 120);
      t.same([ops(sent).at(-1), cursorAt()], [['set_flock_gas', dayOf(17), { cylinders: 5 }, null], '17:4'], 'G5 السهم بعد الكتابة يحفظ وينتقل (كإكسل)');
    });

    // ── G5ك: الكاز يُكتب باللتر أو بالبراميل في خانته (0037) ────────────────────────────────────────────────────────────
    await step('G5 الكاز', async () => {
      const { sent } = await open();
      await pencil();
      await moveTo(19, 4);
      t.eq(textOf('grid-name'), 'الكاز (لتر) · يوم 02/12/2026 (العمر 19)', 'G5 الكاز ضابط: خانة الكاز بعد الغاز');
      await press('2');
      await typeIn('2ب');
      await press('Enter', {}, 120);
      t.same([ops(sent).at(-1), cells(bodyRows(sheetTable())[19])[4]], [['set_flock_kerosene', dayOf(19), { liters: 400 }, null], '400'], 'G5 «2ب» في خانة الكاز = 400 لتر (برميلان)، بلا نسخة (لا صفّ بعد)');
      await moveTo(18, 4);
      await press('3');
      await typeIn('30000');
      await press('Enter', {}, 60);
      const max = textOf('grid-error');
      await typeIn('٢ كغم');
      await press('Enter', {}, 60);
      t.same([max, textOf('grid-error'), sent.length], ['الكاز من 0 إلى 20,000 لتر في اليوم (100 برميل).', 'اكتب اللترات بالأرقام، أو البراميل بعدها «ب» (2ب = 400 لتر).', 1], 'G5 الكاز فوق 20,000 لتر أو بغير اللتر والبرميل: الجملة في الخانة ولا شيء يُكتب');
    });

    // ── G6: الحفظ بالترتيب، وبلا نت، والمردود ─────────────────────────────────────────────────────────────────────
    await step('G6 تعديلان على يوم واحد', async () => {
      let open1 = null;
      const gate = new Promise((resolve) => {
        open1 = resolve;
      });
      let version = 1;
      const { sent, userId } = await open(BROILER, { hall_sheet: slowRereads() }, {
        send: async (op) => {
          if (op.payload.dead !== undefined) await gate;
          version += 1;
          return { kind: 'saved', version };
        },
      });
      await pencil();
      await moveTo(19, 2);
      await press('5');
      await press('Tab', {}, 30);
      await press('Tab');
      await press('Tab');
      await press('Tab');
      await press('ت');
      await typeIn('تهوية');
      await press('Enter', {}, 30);
      const queued = (await m.pendingOps(await m.openOutbox(), { userId, orgId: 'org-1', displayName: 'علي' })).map((op) => [op.fn, op.day, op.payload, op.state]);
      t.same(ops(sent), [['save_flock_day', dayOf(19), { dead: 5, culled: null }, 1]], 'G6 ضابط: الأوّل في الطريق والثاني لا يُرسل قبل أن يُعرف مصيره');
      t.same(
        queued,
        [['save_flock_day', dayOf(19), { dead: 5, culled: null }, 'sending'], ['save_flock_day', dayOf(19), { note: 'تهوية' }, 'pending']],
        'G6 الثاني في الطابور على الجهاز فوراً (لا ينتظر رفع الأوّل في الذاكرة: إغلاق التطبيق لا يضيّعه)',
      );
      t.ok(cells(bodyRows(sheetTable())[19])[2].startsWith('5') && cells(bodyRows(sheetTable())[19])[2].includes('بانتظار الرفع'), `G6 القيمة تظهر فور Enter «بانتظار الرفع» (${cells(bodyRows(sheetTable())[19])[2]})`);
      open1();
      await settle(200);
      t.same(ops(sent), [['save_flock_day', dayOf(19), { dead: 5, culled: null }, 1], ['save_flock_day', dayOf(19), { note: 'تهوية' }, 2]], 'G6 الثاني يُرفع بعد الأوّل بنسخة ما حفظه (2) لا بنسخة القراءة (1)، فلا stale_day');
      t.same([cells(bodyRows(sheetTable())[19])[2], cells(bodyRows(sheetTable())[19])[6]], ['5', 'تهوية'], 'G6 الخانتان بقيمتيهما بعد الرفع (والقراءة الجديدة لم تصل)');
    });

    await step('G6 بلا نت والمردود', async () => {
      const { sent, userId } = await open(BROILER, {}, { send: async (op) => (op.fn === 'set_flock_gas' ? { kind: 'parked', reason: 'period_locked' } : { kind: 'saved', version: 2 }) });
      await pencil();
      m.onlineStore.set(false);
      await settle();
      await moveTo(15, 3);
      await press('3');
      await press('Enter', {}, 120);
      const db = await m.openOutbox();
      const pending = await m.pendingOps(db, { userId, orgId: 'org-1', displayName: 'علي' });
      t.same(
        [sent.length, cells(bodyRows(sheetTable())[15])[3], pending.map((op) => [op.fn, op.day, op.payload]), textOf('grid-offline')?.startsWith('بلا اتصال')],
        [0, '3بانتظار الرفع', [['set_flock_gas', dayOf(15), { cylinders: 3 }]], true],
        'G6 بلا نت: في الطابور على الجهاز و«بانتظار الرفع» في خانته، والشريط يقوله',
      );
      m.onlineStore.set(true);
      await settle();
      await moveTo(14, 3);
      await press('2');
      await press('Enter', {}, 160);
      const issue = byAction('cell-issue', td(14, 3) ?? body())[0];
      t.same(
        [issue?.textContent, globalThis.__sg.toasts.at(-1)?.title, td(14, 3)?.getAttribute('aria-label')?.includes('لم يُحفظ')],
        ['لم يُحفظ: كان اليوم في فترة حسابات مقفلة.', 'لم يُحفظ: كان اليوم في فترة حسابات مقفلة.', true],
        'G6 المردود يُقال في خانته (ولقارئ الشاشة) وبتنبيه كورقة الخانة',
      );
    });

    // ── G7: الحدود ─────────────────────────────────────────────────────────────────────────────────────────────────
    await step('G7', async () => {
      const { sent } = await open();
      await pencil();
      await press('9');
      await typeIn('9999');
      await press('Enter', {}, 60);
      t.same([textOf('grid-error'), byAction('grid-error')[0]?.getAttribute('role'), input() !== null, sent.length], ['الهلاكات أكثر من الطيور الحيّة (3,972).', 'alert', true, 0], 'G7 أكثر من الحيّ: الجملة نفسها في الخانة والمحرّر باقٍ ولا شيء يُكتب');
      await typeIn('1,234');
      await press('Enter', {}, 120);
      t.same(ops(sent), [['save_flock_day', TODAY, { dead: 1234, culled: null }, 1]], 'G7 «1,234» بفاصلة الآلاف = 1,234');
      await moveTo(20, 3);
      await press('1');
      await typeIn('1001');
      await press('Enter', {}, 60);
      const gasError = textOf('grid-error');
      await typeIn('0,5');
      await press('Enter', {}, 60);
      t.same([gasError, textOf('grid-error'), sent.length], ['عدد القناني من 0 إلى 1,000.', 'اكتب عدداً صحيحاً بالأرقام.', 1], 'G7 القناني حتى 1,000، و«0,5» ليست عدداً (لا 5)');
      await press('Escape');
      await moveTo(20, 6);
      await press('ا');
      await typeIn('ا'.repeat(501));
      await press('Enter', {}, 60);
      t.same([textOf('grid-error'), sent.length], ['الملاحظة حتى 500 حرف.', 1], 'G7 الملاحظة حتى 500 حرف');
      await press('Escape');
      await press('ArrowDown');
      await press('7');
      t.same([input(), textOf('grid-message')], [null, 'لا يُكتب ليوم لم يأتِ بعد.'], 'G7 يوم لم يأتِ: لا يُكتب فيه، والشريط يقول لماذا');
      await moveTo(19, 3);
      await press('x');
      t.same([input(), textOf('grid-message')], [null, 'اكتب أرقاماً في هذه الخانة.'], 'G7 حرف على خانة رقمية لا يبدأ تعديلها');
    });

    // ── G8: العلف ──────────────────────────────────────────────────────────────────────────────────────────────────
    await step('G8', async () => {
      const { calls } = await open(BROILER, { send_flock_feed: () => new Promise(() => {}) });
      await pencil();
      await press('ArrowLeft');
      await press('ArrowLeft');
      await press('ArrowLeft');
      t.eq(cursorAt(), '20:5', 'G8 ضابط: على علف اليوم (بعد الغاز والكاز)');
      await press('5');
      t.same([dialogs().length, textOf('grid-message'), named(calls, 'send_flock_feed').length], [0, 'العلف يُرسل من نافذته: اضغط Enter أو F2 لفتحها، ولا يُكتب في الخانة.', 0], 'G8 رقم على خانة العلف لا يكتب ولا يصرف شيئاً');
      await press('Enter', {}, 60);
      t.ok(dialogTitled('علف يوم 03/12/2026') !== null, 'G8 Enter على خانة العلف يفتح نافذة علف ذلك اليوم');
      await press('Enter', {}, 60);
      t.eq(named(calls, 'send_flock_feed').length, 0, 'G8 ولا Enter في النافذة الفارغة يصرف شيئاً');
      await click(byAction('dialog-close')[0]);
      await moveTo(14, 5);
      await press('F2', {}, 60);
      const f2 = dialogTitled('علف يوم 27/11/2026');
      await click(byAction('dialog-close')[0]);
      await press('Delete');
      t.same([f2 !== null, textOf('grid-message')], [true, 'العلف يُصحَّح بـ«ألغِ» من نافذته (Enter لفتحها).'], 'G8 F2 يفتحها أيضاً، وDelete على العلف لا يمسح بل يدلّ على «ألغِ»');
      await moveTo(21, 5);
      await press('Enter');
      t.same([dialogs().length, cursorAt()], [0, '22:5'], 'G8 علف يوم لم يأتِ (بلا علف): لا نافذة، وEnter ينزل');
    });

    // ── G9: Delete وBackspace ──────────────────────────────────────────────────────────────────────────────────────
    await step('G9', async () => {
      const { sent } = await open();
      await pencil();
      await moveTo(19, 3);
      await press('Delete', {}, 120);
      await moveTo(18, 6);
      await press('Delete', {}, 120);
      t.same(ops(sent), [['set_flock_gas', dayOf(19), { cylinders: null }, 1], ['save_flock_day', dayOf(18), { note: '' }, 1]], 'G9 Delete يمسح الغاز (بلا قنانٍ) والملاحظة (نصّ فارغ) بلا سؤال');
      await moveTo(20, 2);
      await press('Delete');
      const ask = dialogTitled('امسح الهلاكات يوم 03/12/2026؟');
      t.same([ask !== null, textOf('grid-clear-text'), sent.length], [true, 'تصير الهلاكات يوم 03/12/2026 صفراً بدل 4.', 2], 'G9 Delete على الهلاكات: تأكيد يسمّي اليوم وما كان، ولا شيء يُكتب قبله');
      await click(byAction('grid-clear-go')[0], 160);
      t.same([ops(sent).at(-1), focusedCell()], [['save_flock_day', TODAY, { dead: 0, culled: null }, 1], '20:2'], 'G9 بعد التأكيد: الهلاكات صفر بنسخة الصفّ، والتركيز في الجدول');
      await moveTo(19, 2);
      await press('Backspace');
      t.eq(input()?.value, '', 'G9 Backspace يبدأ التعديل فارغاً (كإكسل)');
      await press('Enter', {}, 60);
      const ask2 = dialogTitled('امسح الهلاكات يوم 02/12/2026؟');
      await click(byAction('grid-batch-cancel')[0] ?? descendants(ask2 ?? body()).find((n) => n.localName === 'button' && n.textContent === 'لا، تراجع') ?? null);
      t.same([ask2 !== null, sent.length, dialogs().length], [true, 3, 0], 'G9 إفراغ الهلاكات بـEnter يسأل كذلك، و«لا، تراجع» لا يكتب شيئاً');
      await moveTo(17, 3);
      await press('Delete');
      t.same([textOf('grid-message'), sent.length], ['الخانة فارغة.', 3], 'G9 Delete على خانة فارغة لا يكتب');
    });

    // ── G10: الانتقال بالمفاتيح ────────────────────────────────────────────────────────────────────────────────────
    await step('G10', async () => {
      await open();
      await pencil();
      await press('ArrowLeft');
      const trail = [];
      for (const [k, mods] of [['Home', {}], ['End', {}], ['Home', { ctrl: true }], ['End', { ctrl: true }], ['PageUp', {}], ['PageUp', {}], ['PageDown', {}]]) {
        await press(k, mods);
        trail.push(cursorAt());
      }
      t.same(trail, ['20:0', '20:6', '0:0', '45:6', '37:6', '29:6', '37:6'], 'G10 Home/End أوّل العمود وآخره، وCtrl+Home/End أوّل يوم وآخره، وPageUp/PageDown بشاشة (8 صفوف)');
      await press('Home', { ctrl: true });
      await press('ArrowDown');
      await press('ArrowLeft');
      await press('ArrowLeft');
      const jumps = [];
      for (let i = 0; i < 6; i += 1) {
        await press('ArrowDown', { ctrl: true });
        jumps.push(cursorAt());
      }
      t.same(jumps, ['5:2', '7:2', '12:2', '18:2', '20:2', '45:2'], 'G10 Ctrl+↓ على الهلاكات كإكسل: آخر يوم متّصل فيه هلاكات، ثمّ أوّل يوم بعد الفراغ، ثمّ آخر الورقة');
      await moveTo(18, 2);
      await press('ArrowDown', { shift: true });
      await press('ArrowDown', { shift: true });
      t.same([cursorAt(), selected(), textOf('grid-name')], ['18:2', ['18:2', '19:2', '20:2'], 'الخانات المحدّدة: 3 · المجموع 7 · المتوسّط 2.333 · الأعداد 3'], 'G10 Shift+↓ يمدّ النطاق والخانة النشطة في مكانها، ومربّع الاسم بمجموعه ومتوسّطه كشريط حال إكسل');
      await press('a', { ctrl: true });
      const everything = selected().length;
      await press('Escape');
      t.same([everything, selected(), cursorAt()], [46 * 7, ['18:2'], '18:2'], 'G10 Ctrl+A الكلّ، وEsc يطويه إلى الخانة النشطة');
    });

    // ── G11: النسخ ─────────────────────────────────────────────────────────────────────────────────────────────────
    await step('G11', async () => {
      await open();
      await pencil();
      const copy = async () => {
        let text = null;
        await press('c', { ctrl: true });
        fire(focused() ?? body(), 'copy', { clipboardData: { setData: (type, value) => { if (type === 'text/plain') text = value; } } });
        await settle(10);
        return text;
      };
      const one = await copy();
      t.same([one, td(20, 2)?.getAttribute('data-copied'), textOf('grid-message')], ['4', 'true', 'نُسخت خانات: 1.'], 'G11 Ctrl+C ينسخ الخانة ويعلّمها');
      await moveTo(18, 2);
      await press('ArrowDown', { shift: true });
      await press('ArrowDown', { shift: true });
      await press('ArrowLeft', { shift: true });
      const range = await copy();
      await moveTo(18, 1);
      await press('ArrowDown', { shift: true });
      await press('ArrowLeft', { shift: true });
      const dated = await copy();
      t.same([range, dated], ['2\t\r\n1\t1\r\n4\t', '01/12/2026\t2\r\n02/12/2026\t1'], 'G11 نطاق بـShift+أسهم يُنسخ نصّ إكسل: جدولة بين الخانات وسطر لكلّ يوم، والأرقام بلا فواصل');
      const written = [];
      Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText: async (text) => { written.push(text); } }, configurable: true });
      await press('Escape');
      await press('c', { ctrl: true });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await settle(10);
      t.same(written, ['01/12/2026'], 'G11 وإن لم يطلق المتصفّح حدث النسخ: الحافظة بواجهتها');
    });

    // ── G12: اللصق ─────────────────────────────────────────────────────────────────────────────────────────────────
    await step('G12', async () => {
      const { sent } = await open();
      await pencil();
      const paste = async (text) => {
        await press('v', { ctrl: true });
        fire(focused() ?? body(), 'paste', { clipboardData: { getData: (type) => (type === 'text/plain' ? text : '') } });
        await settle(30);
      };
      await moveTo(12, 2);
      await paste('7\t2\r\n5\t3\r\nabc\t1\r\n');
      const dialog = dialogTitled('الصق في الجدول');
      const rows = bodyRows(tableBy('الصق في الجدول')).map(cells);
      t.same(
        [dialog !== null, sent.length, textOf('grid-batch-summary')],
        [true, 0, 'يُكتب 5، وبلا تغيير 0، ولا يُكتب 1. لا شيء يُكتب قبل الضغط على الزرّ.'],
        'G12 Ctrl+V بكتلة من إكسل: تأكيد بما سيُكتب ولا شيء يُكتب قبله',
      );
      t.same(
        rows,
        [
          ['25/11/2026', 'الهلاكات', '3', '7', 'يُكتب'],
          ['25/11/2026', 'الغاز', 'فارغة', '2', 'يُكتب'],
          ['26/11/2026', 'الهلاكات', 'فارغة', '5', 'يُكتب'],
          ['26/11/2026', 'الغاز', 'فارغة', '3', 'يُكتب'],
          ['27/11/2026', 'الهلاكات', 'فارغة', 'abc', 'لا يُكتب: «abc» ليس عدداً صحيحاً.'],
          ['27/11/2026', 'الغاز', 'فارغة', '1', 'يُكتب'],
        ],
        'G12 التأكيد جدول: كلّ يوم وخانته وما فيها الآن وما سيصير، وما لا يُكتب بسببه',
      );
      await click(byAction('grid-batch-go')[0], 200);
      t.same(
        sorted(ops(sent)),
        [
          ['save_flock_day', dayOf(12), { dead: 7, culled: null }, 1],
          ['save_flock_day', dayOf(13), { dead: 5, culled: null }, null],
          ['set_flock_gas', dayOf(12), { cylinders: 2 }, null],
          ['set_flock_gas', dayOf(13), { cylinders: 3 }, null],
          ['set_flock_gas', dayOf(14), { cylinders: 1 }, null],
        ],
        'G12 بعد «الصق» وحده: عملية لكلّ يوم بنسخة صفّه (والغاز بنسخة صفّه)، وما لم يكن عدداً لا يُكتب',
      );
      t.eq(textOf('grid-message'), 'حُفظ: 5.', 'G12 الشريط يقول ما حُفظ');
      // من الكاز (4): العمود التالي العلف (5).
      await moveTo(20, 4);
      await paste('1\t9\r\n2\t9');
      t.same(
        bodyRows(tableBy('الصق في الجدول')).map((tr) => cells(tr)[4]),
        ['يُكتب', 'لا يُكتب: العلف يُرسل من نافذته، لا يُلصق.', 'لا يُكتب: لا يُكتب ليوم لم يأتِ بعد.', 'لا يُكتب: العلف يُرسل من نافذته، لا يُلصق.'],
        'G12 العلف لا يُلصق (نافذته وحدها تصرف)، ويوم لم يأتِ لا يُكتب',
      );
      await click(byAction('grid-batch-cancel')[0], 60);
      t.same([sent.length, dialogs().length, focusedCell()], [5, 0, '20:4'], 'G12 «لا، تراجع» لا يكتب شيئاً، والتركيز في الجدول');
      await moveTo(20, 6);
      await paste('ملاحظة\tزائدة');
      t.eq(textOf('grid-batch-outside'), 'وقيم خارج الورقة (بعد آخر يوم أو آخر عمود) لا تُلصق: 1.', 'G12 ما وقع خارج الورقة يُعدّ ولا يُلصق');
      await click(byAction('grid-batch-cancel')[0], 60);
      await moveTo(12, 2);
      await paste('2000\r\n2000');
      t.same(
        bodyRows(tableBy('الصق في الجدول')).map((tr) => cells(tr)[4]),
        ['يُكتب', 'لا يُكتب: الهلاكات أكثر من الطيور الحيّة (3,968).'],
        'G12 هلاكات اللصق معاً لا تتجاوز الحيّ (كلّ يوم وحده دونه)',
      );
      await click(byAction('grid-batch-cancel')[0], 60);
      await moveTo(15, 3);
      await press('ArrowDown', { shift: true });
      await press('ArrowDown', { shift: true });
      await paste('2');
      await click(byAction('grid-batch-go')[0], 200);
      t.same(sorted(ops(sent).slice(5)), [15, 16, 17].map((row) => ['set_flock_gas', dayOf(row), { cylinders: 2 }, BROILER.days[row].gas_version]), 'G12 قيمة واحدة على نطاق تملؤه كلّه (كإكسل)');
    });

    // ── G13: التراجع والإعادة ──────────────────────────────────────────────────────────────────────────────────────
    await step('G13', async () => {
      let version = 1;
      const { sent } = await open(BROILER, { hall_sheet: slowRereads() }, { send: async () => ({ kind: 'saved', version: ++version }) });
      await pencil();
      t.same([textOf('grid-undo'), byAction('grid-undo')[0]?.getAttribute('disabled') ?? null], ['تراجع', ''], 'G13 «تراجع» في الشريط ومعطّل ولا تعديل');
      await press('7');
      await press('Enter', {}, 160);
      await press('ArrowUp');
      await press('z', { ctrl: true }, 160);
      t.same(
        [ops(sent), cells(bodyRows(sheetTable())[20])[2], textOf('grid-message')],
        [[['save_flock_day', TODAY, { dead: 7, culled: null }, 1], ['save_flock_day', TODAY, { dead: 4, culled: null }, 2]], '4', 'أُعيدت القيمة السابقة: الهلاكات يوم 03/12/2026.'],
        'G13 Ctrl+Z يكتب القيمة السابقة (4) بنسخة ما حُفظ، والخانة 4',
      );
      await press('y', { ctrl: true }, 160);
      await click(byAction('grid-undo')[0], 160);
      t.same(ops(sent).slice(2), [['save_flock_day', TODAY, { dead: 7, culled: null }, 3], ['save_flock_day', TODAY, { dead: 4, culled: null }, 4]], 'G13 Ctrl+Y يعيد التعديل، وزرّ «تراجع» كـCtrl+Z');
    });

    await step('G13 تغيّر من جهاز آخر', async () => {
      let reads = 0;
      const other = clone(BROILER);
      other.days[20].dead = 9;
      other.days[20].day_version = 5;
      const { sent } = await open(BROILER, { hall_sheet: () => (reads++ === 0 ? clone(BROILER) : clone(other)) }, { send: async () => ({ kind: 'saved', version: 2 }) });
      await pencil();
      await press('7');
      await press('Enter', {}, 200);
      await press('ArrowUp');
      await press('z', { ctrl: true }, 120);
      t.same([sent.length, textOf('grid-message'), cells(bodyRows(sheetTable())[20])[2]], [1, 'تغيّرت الخانة بعد تعديلك (من جهاز آخر)، فلم يُمسّ شيء.', '9'], 'G13 ما تغيّر من جهاز آخر بعد التعديل لا يمسّه التراجع');
    });

    // ── G14: إمكانية الوصول ───────────────────────────────────────────────────────────────────────────────────────
    await step('G14', async () => {
      await open();
      await pencil();
      t.same(
        [td(20, 2)?.getAttribute('role'), td(20, 1)?.getAttribute('role'), td(20, 2)?.getAttribute('aria-selected'), td(19, 2)?.getAttribute('aria-selected'), td(21, 2)?.getAttribute('aria-readonly'), td(20, 0)?.getAttribute('aria-readonly'), td(20, 2)?.getAttribute('aria-readonly'), td(20, 4)?.getAttribute('aria-readonly')],
        ['gridcell', 'rowheader', 'true', 'false', 'true', 'true', null, null],
        'G14 خانات شبكة (والتاريخ رأس صفّها)، وaria-selected للمحدّد، وaria-readonly لما لا يُكتب (يوم لم يأتِ، والعمر)',
      );
      t.same(
        [td(20, 2)?.getAttribute('aria-label'), td(20, 1)?.getAttribute('aria-label'), td(17, 3)?.getAttribute('aria-label'), sheetTable()?.getAttribute('aria-label')],
        ['الهلاكات، يوم 03/12/2026: 4', 'يوم 03/12/2026 (العمر 20) اليوم', 'الغاز، يوم 30/11/2026: فارغة', 'هلاكات قاعة (7) — وضع التعديل'],
        'G14 كلّ خانة باسمها: الحقل واليوم والقيمة',
      );
      fire(focused(), 'keydown', { key: 'ArrowDown' });
      await settle(20);
      t.same([focusedCell(), td(21, 2)?.getAttribute('tabindex'), td(20, 2)?.getAttribute('tabindex')], ['21:2', '0', '-1'], 'G14 التركيز يبقى في الشبكة ويتنقّل معها (tabindex واحد متنقّل)');
    });

    // ── G15: الفأرة ────────────────────────────────────────────────────────────────────────────────────────────────
    await step('G15', async () => {
      const { calls } = await open();
      await pencil();
      await mouseDown(td(18, 3));
      await click(td(18, 3), 20);
      t.same([cursorAt(), focusedCell(), dialogs().length], ['18:3', '18:3', 0], 'G15 نقرة الفأرة تحدّد الخانة (لا نافذة)');
      await mouseDown(td(20, 4), { shift: true });
      t.same([cursorAt(), selected().sort()], ['18:3', ['18:3', '18:4', '19:3', '19:4', '20:3', '20:4']], 'G15 Shift+نقرة تمدّ النطاق');
      await mouseDown(td(15, 2));
      fire(td(17, 3), 'pointerover', { pointerType: 'mouse', buttons: 1 });
      await settle(10);
      t.same(selected().sort(), ['15:2', '15:3', '16:2', '16:3', '17:2', '17:3'], 'G15 السحب بالفأرة يحدّد نطاقاً');
      fire(globalThis.window, 'pointerup', { pointerType: 'mouse' });
      fire(td(19, 6), 'dblclick', { button: 0, detail: 2 });
      await settle(20);
      t.same([input()?.value, input()?.getAttribute('data-kind')], ['', 'text'], 'G15 نقرتان تعدّلان الخانة بقيمتها');
      await press('Escape');
      fire(td(20, 5), 'dblclick', { button: 0, detail: 2 });
      await settle(60);
      t.same([dialogTitled('علف يوم 03/12/2026') !== null, named(calls, 'send_flock_feed').length], [true, 0], 'G15 ونقرتان على العلف تفتحان نافذته');
    });

    // ── G16: اللمس ─────────────────────────────────────────────────────────────────────────────────────────────────
    await step('G16', async () => {
      await open();
      await pencil();
      await tap(byAction('cell-gas', td(19, 3) ?? body())[0] ?? td(19, 3));
      t.same([dialogTitled('الغاز — يوم 02/12/2026') !== null, cursorAt()], [true, '19:3'], 'G16 لمسة الخانة في وضع التعديل تفتح ورقتها السفلية (لوحة الأرقام)');
      await click(byAction('dialog-close')[0]);
      const savedMedia = globalThis.window.matchMedia;
      globalThis.window.matchMedia = (query) => ({ matches: query === '(pointer: coarse)', addEventListener() {}, removeEventListener() {} });
      try {
        await click(td(18, 2));
        t.ok(dialogTitled('الهلاكات — يوم 01/12/2026') !== null, 'G16 شاشة لمس بلا حدث مؤشّر (pointer: coarse): النقرة تفتح الورقة');
        await click(byAction('dialog-close')[0]);
        await click(td(20, 5), 60);
        t.ok(dialogTitled('علف يوم 03/12/2026') !== null, 'G16 ولمسة العلف تفتح نافذته');
      } finally {
        globalThis.window.matchMedia = savedMedia;
      }
    });

    // ── G17: عيّنات القاعدة الحقيقية بالمحلّلات الحقيقية ─────────────────────────────────────────────────────────────────
    await step('G17 الدجاج', async () => {
      const real = REAL.hall_sheet_broiler;
      const { sent } = await open(real);
      await pencil();
      const ti = real.days.findIndex((day) => day.on === real.today);
      t.same([cursorAt(), tableBy('هلاكات قاعة (7)')?.getAttribute('role')], [`${ti}:2`, 'grid'], 'G17 عيّنة القاعدة: الخانة النشطة هلاكات اليوم');
      await press('Home', { ctrl: true });
      await press('ArrowDown');
      await press('ArrowLeft');
      await press('ArrowLeft');
      await press('ArrowDown', { shift: true });
      await press('ArrowLeft', { shift: true });
      let text = null;
      fire(focused(), 'copy', { clipboardData: { setData: (_, value) => { text = value; } } });
      await settle(10);
      const d1 = real.days[1];
      const d2 = real.days[2];
      t.eq(text, [[d1.dead, d1.gas], [d2.day_version === null ? '' : d2.dead, d2.gas]].map((row) => row.map((v) => (v === null ? '' : String(v))).join('\t')).join('\r\n'), 'G17 نسخ يومين من العيّنة: قيمها كما أرسلها الخادم');
      await press('Escape');
      await press('2');
      await press('Enter', {}, 120);
      const gasRow = real.days.findIndex((day) => day.gas === null && day.gas_version !== null);
      await press('Home', { ctrl: true });
      for (let i = 0; i < gasRow; i += 1) await press('ArrowDown', {}, 3);
      await press('ArrowLeft');
      await press('ArrowLeft');
      await press('ArrowLeft');
      await press('3');
      await press('Enter', {}, 120);
      t.same(
        ops(sent),
        [
          ['save_flock_day', d1.on, { dead: 2, culled: null }, d1.day_version],
          ['set_flock_gas', real.days[gasRow].on, { cylinders: 3 }, real.days[gasRow].gas_version],
        ],
        'G17 الكتابة بنسخ العيّنة الحقيقية: صفّ اليوم (day_version) وصفّ الغاز الممسوح (gas_version 2)',
      );
    });

    await step('G17 البيّاض', async () => {
      const real = REAL.hall_sheet_layer;
      const { sent } = await open(real);
      await pencil();
      const table = tableBy(`هلاكات قاعة (${real.flock.hall_name.replace(/^قاعة\s+/u, '')})`);
      const heads = descendants(section(table, 'thead') ?? body()).filter((n) => n.localName === 'th').map((n) => n.textContent);
      const ei = real.days.findIndex((day) => day.eggs_total !== null);
      await press('Home', { ctrl: true });
      for (let i = 0; i < ei; i += 1) await press('ArrowDown', {}, 3);
      for (const k of ['Tab', 'Tab', 'Tab', 'Tab', 'Tab']) await press(k);
      const at = cursorAt();
      await press('1');
      await typeIn('1600');
      await press('Enter', {}, 120);
      t.same(
        [heads[6], at, ops(sent)],
        ['البيض', `${ei}:6`, [['save_flock_day', real.days[ei].on, { eggs_total: 1600 }, real.days[ei].day_version]]],
        'G17 البيّاض (عيّنة القاعدة): عمود البيض في Tab بعد العلف، ويُكتب بنسخة صفّ يومه',
      );
    });
    // ── G21: ما حُفظ للتوّ (ورفعه في الطريق) هو ما يعدّله F2 وما يُنسخ ─────────────────────────────────────────────────
    await step('G21', async () => {
      let release = null;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      await open(BROILER, { hall_sheet: slowRereads() }, { send: async () => (await gate, { kind: 'saved', version: 2 }) });
      await pencil();
      await press('7');
      await press('Enter', {}, 30);
      await press('ArrowUp');
      await press('F2');
      const editing = input()?.value;
      await press('Escape');
      let text = null;
      fire(focused() ?? body(), 'copy', { clipboardData: { setData: (_, value) => { text = value; } } });
      await settle(10);
      await press('Delete');
      const ask = textOf('grid-clear-text');
      await click(descendants(dialogs().at(-1) ?? body()).find((n) => n.localName === 'button' && n.textContent === 'لا، تراجع') ?? null);
      release();
      await settle(120);
      t.same([editing, text, ask], ['7', '7', 'تصير الهلاكات يوم 03/12/2026 صفراً بدل 7.'], 'G21 قبل أن يُعرف مصير الحفظ: F2 يعدّل 7 والنسخ 7 وتأكيد المسح يسمّي 7 (ما تراه الخانة لا القراءة القديمة 4)');
    });

    // ── G18: DataTable بلا شبكة كما كان حرفاً، وبها سماتها ────────────────────────────────────────────────────────────
    {
      const T = await load(
        await build({
          ...BUILD,
          stdin: { contents: "export { DataTable, Num } from './src/components/ui/DataTable.tsx'; export { createElement as h } from 'react'; export { renderToStaticMarkup } from 'react-dom/server.browser';", resolveDir: ROOT, loader: 'tsx' },
        }),
      );
      const columns = [
        { key: 'name', header: 'الاسم', cell: (r) => r.name, sticky: true },
        { key: 'note', header: 'البيان', wrap: true, cell: (r) => r.note },
        { key: 'qty', header: 'الكمية', kind: 'number', cell: (r) => T.h(T.Num, null, r.qty), total: T.h(T.Num, null, '9') },
      ];
      const rows = [{ name: 'أ', note: 'س', qty: '4' }, { name: 'ب', note: 'ص', qty: '5' }];
      const plain = { caption: 'ج', columns, rows, rowKey: (r) => r.name, empty: 'لا', totalLabel: 'المجموع', rowTone: (r) => (r.name === 'أ' ? 'mark' : 'warn'), footers: [{ key: 'f', label: 'ذيل', cells: { qty: '1' } }], subRow: (r) => (r.name === 'ب' ? 'تفصيل' : null), onRowClick: () => {} };
      const out = ['sm', 'md', 'lg'].map((size) => T.renderToStaticMarkup(T.h(T.DataTable, { ...plain, size })));
      out.push(T.renderToStaticMarkup(T.h(T.DataTable, { caption: 'ج', columns, rows: [], rowKey: (r) => r.name, empty: 'لا' })));
      t.eq(createHash('sha256').update(out.join('\n')).digest('hex'), PLAIN_MARKUP_SHA256, 'G18 DataTable بلا grid: النصّ كما كان على 94f1503 حرفاً (كلّ الأحجام والثابت والتذييل والتفصيل والصفّ الملوَّن والفارغ)');
      const grid = T.renderToStaticMarkup(
        T.h(T.DataTable, {
          ...plain,
          grid: { table: { role: 'grid' }, head: (column) => (column.key === 'qty' ? { 'data-sel': 'true' } : {}), cell: (row, index, column) => ({ role: 'gridcell', 'aria-selected': index === 0, 'data-cell': `${index}:${column.key}`, tabIndex: -1 }) },
        }),
      );
      const plainMd = T.renderToStaticMarkup(T.h(T.DataTable, plain));
      const classes = (html) => [...html.matchAll(/class="([^"]*)"/gu)].map((m) => m[1]).join('|');
      t.same(
        [/<table class="[^"]*" role="grid">/u.test(grid), grid.includes('data-cell="0:qty"') && grid.includes('aria-selected="true"') && grid.includes('tabindex="-1"'), /<th scope="col" class="[^"]*" data-sel="true">الكمية/u.test(grid), classes(grid) === classes(plainMd)],
        [true, true, true, true],
        'G18 بسمات grid: role="grid" على الجدول وسمات كلّ خلية ورأس، والأصناف نفسها (شكل الجدول لا يتغيّر)',
      );
    }

    // ── G19: الخروج من المحرّر إلى زرّ يحفظ ولا يسحب التركيز ─────────────────────────────────────────────────────────
    await step('G19', async () => {
      const { sent } = await open();
      await pencil();
      await press('8');
      const done = byAction('sheet-edit-done')[0];
      globalThis.document.activeElement = done;
      fire(input(), 'focusout', { relatedTarget: done });
      await settle(160);
      t.same([ops(sent), input(), focused() === done], [[['save_flock_day', TODAY, { dead: 8, culled: null }, 1]], null, true], 'G19 نقرة خارج الخانة (زرّ في الصفحة) تحفظ ما كُتب كإكسل، ولا تسحب التركيز إلى الجدول');
      // تبديل النافذة (المتصفّح بلا تركيز): المحرّر باقٍ بما كُتب ولا شيء يُحفظ.
      td(20, 2)?.focus();
      await press('ArrowUp');
      await press('6');
      const hasFocus = globalThis.document.hasFocus;
      globalThis.document.hasFocus = () => false;
      try {
        fire(input(), 'focusout', { relatedTarget: null });
        await settle(60);
      } finally {
        globalThis.document.hasFocus = hasFocus;
      }
      t.same([input()?.value, sent.length], ['6', 1], 'G19 تبديل النافذة لا يحفظ: المحرّر باقٍ بما كُتب (كإكسل)');
    });

    // ── G20: أنماط الجدول (sheetGrid.css، كسولة) ─────────────────────────────────────────────────────────────────
    {
      const rule = (selector) => {
        const at = CSS.indexOf(`${selector} {`);
        return at < 0 ? null : CSS.slice(at, CSS.indexOf('}', at));
      };
      const cursor = CSS.slice(CSS.indexOf('.sg-on td[data-cursor],'), CSS.indexOf('}', CSS.indexOf('.sg-on td[data-cursor],')));
      t.same(
        [
          /\.sg-on td\[data-cursor\],\s*\.sg-on td\[data-cursor\]:focus \{/u.test(CSS) && /outline-style: solid;/u.test(cursor) && /outline-width: 2px;/u.test(cursor),
          /td\[data-cell\]:focus\s*\{[^}]*outline-style:\s*none/u.test(CSS),
          /background-image: linear-gradient\(rgb\(var\(--ring\) \/ 0\.22\)/u.test(rule('.sg-on th[data-sel]') ?? '') && !/background-color/u.test(rule('.sg-on th[data-sel]') ?? ''),
          /position: absolute;/u.test(rule('.sg-input') ?? '') && /visibility: hidden;/u.test(rule('.sg-ghost') ?? ''),
          /@media \(pointer: coarse\) \{\s*\.sg-keys/u.test(CSS),
          !/#[0-9a-f]{3,6}\b|rgb\(\d/iu.test(CSS),
        ],
        [true, false, true, true, true, true],
        'G20 الخانة النشطة بإطار ظاهر ولو مركَّزة (لا outline: none يخفيه)، ورأس العمود المحدّد صبغةٌ فوق لونه المعتم (الرأس ثابت فوق الصفوف)، والمحرّر فوق نسخة خفيّة (لا يوسّع عموده)، ودليل المفاتيح يختفي باللمس، والألوان كلّها رموز tokens.css',
      );
    }
  } finally {
    if (savedRect) Object.defineProperty(Element.prototype, 'getBoundingClientRect', savedRect);
    else delete Element.prototype.getBoundingClientRect;
    if (savedClient) Object.defineProperty(Element.prototype, 'clientHeight', savedClient);
    else delete Element.prototype.clientHeight;
    delete Element.prototype.scrollTop;
    delete Element.prototype.scrollIntoView;
    delete Element.prototype.isConnected;
    if (navigatorClipboard) Object.defineProperty(globalThis.navigator, 'clipboard', navigatorClipboard);
    else delete globalThis.navigator.clipboard;
    delete globalThis.__sg;
    restore();
  }
}
