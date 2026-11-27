// ترتيب الموادّ وألوان الرصيد على الشاشات (0040؛ رسالتا الزبون الصوتيّتان 2026-11-26 وأجوبة المالك؛ DECISIONS 2026-11-26): react-dom/client الحقيقي
// على DOM صغير (dom.mjs) يشغّل StockRoutes الحقيقية، وrepo/storeMarks وrepo/dayBalance وrepo/purchases الحقيقيين (المحلّلات وبناء النداءات) على core
// بديل يسجّل كلّ نداء ويجيب بعيّنات القاعدة الحقيقية (fixtures/store-colors-0040.json من supabase/tests/store-colors.test.mjs بـ
// STORE_COLORS_SAMPLES_OUT=1). الحالات: P المحلّلات بكلّ عيّنة وتسامحها مع خادم قبل 0040 وصرامتها، واللون الظاهر، ومساعدات السحب والحدّ؛
// D الرصيد اليوميّ: تظليل الصفّ بلونه وكلمة الحالة، وزرّ اللون (اللون والإزالة وmark_changed والنتيجة المجهولة)، وحدّ القلّة، و«رتّب» بالسهمين
// والسحب وorder_changed، و«ألوان الرصيد» وcolors_changed، والمشاركة بعلامة اللون، ومن لا يملك الأفعال؛ B البطاقات بلونها وحالتها و«رتّب»؛
// F ملفّ المادّة بلونها وحدّها وزرّها.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const F = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'store-colors-0040.json'), 'utf8'));
// عيّنة الرصيد اليوميّ قبل 0040 (مكتوبة باليد بمفاتيح 0035): بلا mark ولا state ولا colors ولا can_arrange.
const OLD = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'day-balance-sections.hand.json'), 'utf8')).day_balance_sections.owner;
const clone = (value) => JSON.parse(JSON.stringify(value));
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__db.call('${n}', a);`).join(' ')}`;
const STUBS = {
  inventory: routed('inventory', ['loadOrgSetup', 'createItem', 'findItemTwins', 'listItems', 'createItemCategory', 'loadItem', 'setArchived', 'listItemUnits', 'loadItemPurchases', 'loadStoresOverview', 'loadStockOnHand', 'loadStockValues', 'loadItemLots', 'loadItemMoves', 'updateItem']),
  purchasing: routed('purchasing', ['searchSuppliers', 'supplierTwins', 'createSupplier', 'createCustomer', 'listBoxes']),
  counts: `export * from ${real('counts')}; export const loadApprovals = () => Promise.resolve({ counts: 0, uses: 0 });`,
  mill: routed('mill', ['loadMill', 'loadBuilder', 'loadRecipe', 'loadBatch', 'loadExpenseCategories', 'loadMillStores']),
  session: 'export const useSession = () => globalThis.__db.session; export const sessionStore = { get: () => globalThis.__db?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__db.toasts.push(spec); }; export function Toaster() { return null; }',
};
const CORE_FOR = /src\/lib\/repo\/(?:dayBalance|purchases|storeMarks)\.ts$/u;
const CORE = [
  'export const call = async (fn, args) => globalThis.__db.rpc(fn, args);',
  'export const send = () => new Promise(() => {});',
  'export const classifyPostgrest = (error) => Object.assign(new Error(error.code ?? "postgrest"), error);',
].join('\n');
const stubs = {
  name: 'db-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/(inventory|purchasing|counts|mill)$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'db-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'db-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
    b.onResolve({ filter: /^\.\/core$/ }, (args) => (CORE_FOR.test(args.importer.replace(/\\/g, '/')) ? { path: 'core', namespace: 'db-core' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'db-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
  },
};

async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    "export { default as StockRoutes } from './src/pages/inventory/StockRoutes.tsx';",
    "export { parseDayBalanceSections } from './src/lib/repo/dayBalance.ts';",
    "export { parseItemsOverview } from './src/lib/repo/purchases.ts';",
    "export { parseSectionItems, parseMarkResult, parseItemMark, shownColor, DEFAULT_COLORS } from './src/lib/repo/storeMarks.ts';",
    "export { moveItem, indexAt, reconcile } from './src/pages/inventory/ArrangeDialog.tsx';",
    "export { qtyInputText, lowFromText } from './src/pages/inventory/MarkDialog.tsx';",
    "export { MARK_LOOK, tintStyle } from './src/pages/inventory/markColors.ts';",
    "export { RowShapeError } from './src/lib/repo/inventory.ts';",
    "export { onlineStore } from './src/lib/online.ts';",
    "export { RejectedError, UnknownOutcomeError } from './src/lib/errors.ts';",
  ].join('\n');
  const result = await build({
    stdin: { contents: entry, resolveDir: ROOT, loader: 'tsx' },
    bundle: true,
    loader: { '.css': 'empty' },
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    jsx: 'automatic',
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
    plugins: [stubs],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name) => all().filter((n) => n.getAttribute('data-action') === name);
const text = () => body().textContent;
const disabled = (node) => Boolean(node?.hasAttribute('disabled'));
const click = async (node) => {
  fire(node, 'click');
  await settle();
};
const typeIn = (input, value) => {
  input.value = value;
  fire(input, 'input');
};
const dialog = () => all().find((n) => n.getAttribute('role') === 'dialog');
const dialogTitle = () => descendants(dialog() ?? body()).find((n) => n.localName === 'h2')?.textContent ?? null;
const withId = (action, id) => byAction(action).find((n) => n.getAttribute('data-id') === id);
const withColor = (action, color) => byAction(action).find((n) => n.getAttribute('data-color') === color);
const withKey = (action, key) => byAction(action).find((n) => n.getAttribute('data-key') === key);
const ws = (role, over = {}) => ({
  userId: `u-${role}`, orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [],
  divisions: ['feed_mill', 'general'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true,
  invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const KEEPER = { status: 'ready', workspace: ws('storekeeper') };
const I = F.ids;
const DB = F.day_balance_sections;
const rowsOf = (sample, key) => sample.sections.find((s) => s.key === key)?.rows ?? [];
const salt = rowsOf(DB, 'feed_materials').find((r) => r.name === 'ملح')?.item_id;
const ORDER = F.store_section_items.items.map((x) => x.id);

export default async function (t) {
  const restore = installDom();
  let root = null;
  let m = null;
  try {
    m = await bundle();
    m.onlineStore.set(true);
    const fresh = (session, rpcs = {}) => {
      const rpcCalls = [];
      globalThis.__db = {
        session,
        toasts: [],
        call: () => new Promise(() => {}),
        rpc(fn, args) {
          rpcCalls.push([fn, args]);
          const handler = rpcs[fn];
          if (!handler) return new Promise(() => {});
          return handler(args, rpcCalls.filter(([name]) => name === fn).length);
        },
      };
      return rpcCalls;
    };
    const named = (log, name) => log.filter(([n]) => n === name).map(([, args]) => args);
    const toasts = () => globalThis.__db.toasts.map((x) => x.title);
    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(m.Routes, null, m.h(m.Route, { path: '/inventory/*', element: m.h(m.StockRoutes) })))));
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
    const reject = (sample) => Promise.reject(new m.RejectedError(sample.code, sample.hint));
    const dayAnswer = (sample = DB) => async () => clone(sample);
    /** صفّ المادّة في الرصيد اليوميّ (tr) برابط ملفّها (الرابط ابن خليّة «المادّة» مباشرةً). */
    const dayRow = (id) => byAction('day-item').find((a) => a.getAttribute('href')?.startsWith(`/inventory/items/${id}?`))?.parentNode?.parentNode ?? null;
    const tintOf = (tr) => (tr ? tr.children.map((td) => td.getAttribute('data-color')) : null);

    // ── شروط العيّنات ───────────────────────────────────────────────────────────────────────────────────────────────
    const byName = Object.fromEntries(rowsOf(DB, 'feed_materials').map((r) => [r.name, r]));
    t.same(
      [DB.colors, DB.can_arrange, DB.can_note, byName['ذرة'].mark, byName['ذرة'].state, byName['برمكس انتاجي'].state, byName['حجر'].mark?.color, byName['حنطة'].mark?.color],
      [{ low: 'orange', out: 'red', auto: true, version: 1 }, true, true, { color: 'yellow', low_qty: '50.000', version: 4 }, 'low', 'out', 'blue', null],
      'شرط العيّنة: التلقائيّ مشغَّل بالبرتقاليّ والأحمر، والذرة صفراء باليد وقليلة، والبرمكس نافد بلا لون، والحجر أزرق، والحنطة بحدّ بلا لون',
    );
    t.same(F.store_section_items.items.map((x) => x.name), ['حنطة', 'ذرة', 'حجر', 'برمكس انتاجي', 'ملح'], 'شرط العيّنة: القسم بالترتيب الذي حفظه الأمين والملح بعده');

    // ── P: المحلّلات الحقيقية ────────────────────────────────────────────────────────────────────────────────────────
    {
      const parsed = m.parseDayBalanceSections(clone(DB));
      const fm = parsed.sections[0].rows;
      const corn = fm.find((r) => r.itemId === I.corn);
      t.same([parsed.colors, parsed.canArrange, corn.mark, corn.state], [{ auto: true, low: 'orange', out: 'red', version: 1 }, true, { color: 'yellow', lowQty: 50000n, version: 4 }, 'low'], 'P الرصيد اليوميّ: الألوان والترتيب ولون الذرة وحدّها بالآلاف وحالتها');
      t.same(fm.map((r) => r.itemId), [I.wheat, I.corn, I.stone, I.premix, salt], 'P الصفوف بترتيب القسم كما أرسلها الخادم');
      const overview = m.parseItemsOverview(clone(F.items_overview));
      const card = overview.items.find((x) => x.id === I.corn);
      t.same([overview.colors.low, overview.canArrange, card.mark?.color, card.state], ['orange', true, 'yellow', 'low'], 'P بطاقات المخزن: الألوان والترتيب ولون الذرة وحالتها');
      const section = m.parseSectionItems(clone(F.store_section_items));
      t.same([section.section, section.canArrange, section.items.map((x) => x.id)], ['feed_materials', true, ORDER], 'P store_section_items بترتيبه');
      t.same(m.parseMarkResult(clone(F.set_item_color), 'set_item_color'), { itemId: I.corn, mark: { color: 'yellow', lowQty: 50000n, version: 4 } }, 'P set_item_color');
      t.same(m.parseMarkResult(clone(F.set_item_color_cleared), 'set_item_color').mark, { color: null, lowQty: 50000n, version: 3 }, 'P اللون المُزال: color = null والحدّ باقٍ');
      t.same(m.parseMarkResult(clone(F.set_item_low), 'set_item_low').mark?.lowQty, 50000n, 'P set_item_low');
      const file = m.parseItemMark(clone(F.item_mark));
      t.same([file.itemId, file.baseUnit, file.canMark, file.mark?.version, file.colors.version], [I.corn, 'kg', true, 4, 1], 'P item_mark');
      t.eq(m.parseItemMark(clone(F.item_mark_none)).mark, null, 'P item_mark لمادّة بلا لون ولا حدّ: mark = null');
      const old = m.parseDayBalanceSections(clone(OLD));
      t.same([old.colors, old.canArrange, old.sections[0].rows[0].mark, old.sections[0].rows[0].state], [m.DEFAULT_COLORS, false, null, null], 'P خادم قبل 0040 (بين النشر والتطبيق): بلا لون ولا ترتيب ولا حالة، ولا رمي');
      const row0 = rowsOf(DB, 'feed_materials')[1];
      const withRow = (patch) => () => m.parseDayBalanceSections({ ...clone(DB), sections: [{ key: 'feed_materials', rows: [{ ...clone(row0), ...patch }] }] });
      t.throws(withRow({ mark: { color: 'gold', low_qty: null, version: 1 } }), 'P صرامة: لون ليس من الثمانية');
      t.throws(withRow({ mark: { color: 'red', low_qty: '0.000', version: 1 } }), 'P صرامة: حدّ صفر');
      t.throws(withRow({ mark: { color: 'red', low_qty: null, version: 0 } }), 'P صرامة: نسخة صفر');
      t.throws(withRow({ state: 'empty' }), 'P صرامة: حالة غير معروفة');
      t.throws(() => m.parseDayBalanceSections({ ...clone(DB), colors: { auto: true, out: 'red', version: 1 } }), 'P صرامة: ألوان بلا لون القلّة');
      t.throws(() => m.parseDayBalanceSections({ ...clone(DB), can_arrange: 'yes' }), 'P صرامة: can_arrange ليس منطقيّاً');
      t.throws(() => m.parseSectionItems({ ...clone(F.store_section_items), items: [F.store_section_items.items[0], F.store_section_items.items[0]] }), 'P صرامة: مادّة مكرّرة في القسم');
      const auto = { auto: true, low: 'orange', out: 'red', version: 1 };
      t.same(
        [
          m.shownColor({ color: 'blue', lowQty: null, version: 1 }, 'out', auto),
          m.shownColor(null, 'out', auto),
          m.shownColor(null, 'low', auto),
          m.shownColor(null, 'low', { ...auto, auto: false }),
          m.shownColor({ color: null, lowQty: 5n, version: 2 }, null, auto),
        ],
        ['blue', 'red', 'orange', null, null],
        'P اللون الظاهر: اليد تغلب، ثمّ التلقائيّ للحالة إن كان مشغَّلاً، وإلّا لا لون',
      );
      t.same([m.moveItem(['a', 'b', 'c', 'd'], 3, 0), m.moveItem(['a', 'b', 'c'], 0, 2), m.moveItem(['a', 'b'], 0, 5)], [['d', 'a', 'b', 'c'], ['b', 'c', 'a'], ['a', 'b']], 'P moveItem: من مكان إلى مكان وما بينهما يتزحزح، وخارج القائمة لا شيء');
      const rects = [0, 1, 2].map((i) => ({ top: i * 60, bottom: i * 60 + 56 }));
      t.same([m.indexAt(rects, 10), m.indexAt(rects, 70), m.indexAt(rects, 100), m.indexAt(rects, 999)], [0, 1, 2, 2], 'P indexAt: الصفّ الذي يقع منتصفه تحت الإصبع، وإلّا آخرها');
      t.same(m.reconcile(['c', 'a', 'b'], ['a', 'b', 'd']), ['a', 'b', 'd'], 'P reconcile: ما حُذف يخرج وما أُضيف في آخره');
      t.same(m.reconcile(['c', 'a', 'b', 'x'], ['a', 'b', 'c', 'x', 'y']), ['c', 'a', 'b', 'x', 'y'], 'P reconcile: ترتيبك لما بقي');
      t.same([m.qtyInputText(50000n), m.qtyInputText(500n), m.qtyInputText(1250500n)], ['50', '0.5', '1250.5'], 'P qtyInputText: بلا أصفار زائدة ولا فواصل');
      t.same(
        [m.lowFromText('', 'kg'), m.lowFromText('75', 'kg'), m.lowFromText('0', 'kg').ok, m.lowFromText('2.5', 'pc').ok, m.lowFromText('abc', 'kg').ok],
        [{ ok: true, qty: null }, { ok: true, qty: 75000n }, false, false, false],
        'P lowFromText: فارغ يزيل، والموجب يُقبل، والصفر وكسر المعدود والنصّ مرفوضة',
      );
      t.same(m.tintStyle('yellow').backgroundImage, `linear-gradient(${m.MARK_LOOK.yellow.tint}, ${m.MARK_LOOK.yellow.tint})`, 'P التظليل صورة خلفية فوق لون الخليّة (العمود الثابت يبقى معتماً)');
    }

    // ── D1: التظليل وكلمة الحالة والأزرار ───────────────────────────────────────────────────────────────────────────
    await step('D1', async () => {
      fresh(KEEPER, { day_balance_sections: dayAnswer() });
      await mount('/inventory?view=day');
      const tints = Object.fromEntries([['corn', I.corn], ['premix', I.premix], ['stone', I.stone], ['wheat', I.wheat]].map(([k, id]) => [k, tintOf(dayRow(id))]));
      t.same(
        [tints.corn?.every((c) => c === 'yellow'), tints.premix?.every((c) => c === 'red'), tints.stone?.every((c) => c === 'blue'), tints.wheat?.every((c) => c === null)],
        [true, true, true, true],
        'D1: الصفّ كلّه بلونه الظاهر: الذرة صفراء باليد (فوق القلّة)، والبرمكس أحمر تلقائيّاً (نافد)، والحجر أزرق، والحنطة بلا لون',
      );
      const cornCell = dayRow(I.corn)?.children[0];
      t.eq(cornCell?.style.backgroundImage, m.tintStyle('yellow').backgroundImage, 'D1: الخليّة مظلَّلة بلونها ويُطبع (print-color-adjust)');
      t.same(byAction('day-state').map((n) => [n.textContent, n.getAttribute('data-state')]), [['قليلة', 'low'], ['نفدت', 'out'], ['نفدت', 'out'], ['نفدت', 'out']], 'D1: كلمة الحالة بجانب الاسم للقليلة والنافدة (التلقائيّ مشغَّل)');
      t.same([withId('mark-item', I.corn)?.getAttribute('data-color'), withId('mark-item', I.wheat)?.getAttribute('data-color'), withId('mark-item', I.wheat)?.getAttribute('aria-label')], ['yellow', null, 'لوّن «حنطة»'], 'D1: زرّ اللون بدائرة لونه، وبلا لون «لوّن»');
      const note = withId('edit-note', I.corn);
      t.eq(note?.parentNode?.children[0], note, 'D1: زرّ الملاحظة يبقى أوّل خليّتها (مراجعة 0022 P1) وزرّ اللون بعده');
      t.same([withKey('arrange-section', 'feed_materials') !== undefined, withKey('arrange-section', 'feed'), byAction('day-colors').length], [true, undefined, 1], 'D1: «رتّب» لقسم فيه أكثر من مادّة، و«ألوان الرصيد» مرّة');
      // الورقة الرسمية (تُطبع وتُرسل PDF): التظليل فيها، و«رتّب» وزرّ اللون خارجها بالطباعة والملفّ (print:hidden).
      const paper = byAction('day-report')[0];
      const hiddenInPrint = (node) => {
        for (let n = node; n && n.nodeType === 1; n = n.parentNode) if ((n.getAttribute('class') ?? '').split(/\s+/).includes('print:hidden')) return true;
        return false;
      };
      const inside = (node) => {
        for (let n = node; n; n = n.parentNode) if (n === paper) return true;
        return false;
      };
      t.same([inside(cornCell), hiddenInPrint(cornCell), hiddenInPrint(withKey('arrange-section', 'feed_materials')), hiddenInPrint(withId('mark-item', I.corn))], [true, false, true, true],
        'D1: الصفّ الملوّن في الورقة التي تُطبع وتُرسل PDF، و«رتّب» وزرّ اللون لا يُطبعان');
    });

    // ── D2: لمسة على لون تحفظه ───────────────────────────────────────────────────────────────────────────────────────
    await step('D2', async () => {
      const log = fresh(KEEPER, {
        day_balance_sections: dayAnswer(),
        set_item_color: async (args) => ({ item_id: args.p_item, mark: { color: args.p_color, low_qty: '50.000', version: 5 } }),
      });
      await mount('/inventory?view=day');
      await click(withId('mark-item', I.corn));
      t.same([dialogTitle(), withColor('mark-color', 'yellow')?.getAttribute('aria-checked'), descendants(dialog()).find((n) => n.getAttribute('data-action') === 'mark-low')?.value], ['لون «ذرة»', 'true', '50'], 'D2: النافذة باسم المادّة، ولونها الحاليّ مختار، وحدّها في خانته');
      await click(withColor('mark-color', 'yellow'));
      t.eq(named(log, 'set_item_color').length, 0, 'D2: لمسة على اللون المختار لا ترسل شيئاً');
      await click(withColor('mark-color', 'red'));
      t.same(named(log, 'set_item_color'), [{ p_item: I.corn, p_color: 'red', p_expected_version: 4 }], 'D2: الأحمر بشرط النسخة التي عُرضت');
      t.same([dialog(), toasts(), named(log, 'day_balance_sections').length], [undefined, ['لُوّنت «ذرة»: أحمر.'], 2], 'D2: تُغلق وتقول ما حُفظ، ويُقرأ الرصيد من جديد');
      await click(withId('mark-item', I.corn));
      await click(withColor('mark-color', 'none'));
      t.same(named(log, 'set_item_color')[1], { p_item: I.corn, p_color: null, p_expected_version: 4 }, 'D2: «بلا لون» يرسل null');
      t.eq(toasts()[1], 'أُزيل لون «ذرة».', 'D2: وتقول إنّه أُزيل');
    });

    // ── D3: mark_changed يقرأ لونها الآن ────────────────────────────────────────────────────────────────────────────
    await step('D3', async () => {
      const log = fresh(KEEPER, {
        day_balance_sections: dayAnswer(),
        set_item_color: async (args, n) => (n === 1 ? reject(F.mark_changed) : { item_id: args.p_item, mark: { color: args.p_color, low_qty: null, version: 8 } }),
        item_mark: async () => ({ ...clone(F.item_mark), mark: { color: 'green', low_qty: null, version: 7 } }),
      });
      await mount('/inventory?view=day');
      await click(withId('mark-item', I.corn));
      await click(withColor('mark-color', 'red'));
      t.same([dialog() !== undefined, text().includes(F.mark_changed.hint), named(log, 'item_mark'), byAction('mark-reread')[0]?.textContent], [true, true, [{ p_item: I.corn }], 'لونها الآن «أخضر». اختر من جديد.'], 'D3: الرفض بتلميحه، ثمّ لونها الآن من item_mark');
      t.eq(withColor('mark-color', 'green')?.getAttribute('aria-checked'), 'true', 'D3: والأخضر مختار');
      await click(withColor('mark-color', 'red'));
      t.same(named(log, 'set_item_color')[1], { p_item: I.corn, p_color: 'red', p_expected_version: 7 }, 'D3: الحفظ التالي بالنسخة التي قُرئت');
    });

    // ── D4: النتيجة المجهولة تُعاد بالطلب نفسه ──────────────────────────────────────────────────────────────────────
    await step('D4', async () => {
      const log = fresh(KEEPER, {
        day_balance_sections: dayAnswer(),
        set_item_color: async (args, n) => (n === 1 ? Promise.reject(new m.UnknownOutcomeError()) : { item_id: args.p_item, mark: { color: args.p_color, low_qty: '50.000', version: 5 } }),
      });
      await mount('/inventory?view=day');
      await click(withId('mark-item', I.corn));
      await click(withColor('mark-color', 'pink'));
      t.same([dialog() !== undefined, byAction('mark-retry').length, text().includes('لا نعرف إن حُفظ')], [true, 1, true], 'D4: لا نعرف إن حُفظ: النافذة تبقى بـ«أعد المحاولة»');
      await click(byAction('mark-retry')[0]);
      const sent = named(log, 'set_item_color');
      t.same([sent.length, sent[1]], [2, sent[0]], 'D4: الإعادة بالطلب نفسه حرفاً (اللون نفسه الآن نجاح بالخادم)');
      t.same([dialog(), toasts()], [undefined, ['لُوّنت «ذرة»: ورديّ.']], 'D4: ثمّ تُغلق بما حُفظ');
    });

    // ── D5: حدّ القلّة ─────────────────────────────────────────────────────────────────────────────────────────────
    await step('D5', async () => {
      const log = fresh(KEEPER, {
        day_balance_sections: dayAnswer(),
        set_item_low: async (args) => ({ item_id: args.p_item, mark: { color: 'yellow', low_qty: args.p_low_qty, version: 5 } }),
      });
      await mount('/inventory?view=day');
      await click(withId('mark-item', I.corn));
      const input = () => descendants(dialog()).find((n) => n.getAttribute('data-action') === 'mark-low');
      const submit = async () => {
        fire(descendants(dialog()).find((n) => n.localName === 'form'), 'submit');
        await settle();
      };
      t.ok(disabled(byAction('mark-low-save')[0]), 'D5: «احفظ الحدّ» معطّل والحدّ كما حُفظ');
      typeIn(input(), '0');
      await settle();
      await submit();
      t.same([named(log, 'set_item_low').length, text().includes('الحدّ أكبر من صفر')], [0, true], 'D5: الصفر يُرفض بالشاشة بجملة، ولا يُرسل');
      typeIn(input(), '\u{667}\u{665}');
      await settle();
      t.eq(input().value, '75', 'D5: الأرقام الشرقية تنقلب غربية لحظة الكتابة');
      await submit();
      t.same(named(log, 'set_item_low'), [{ p_item: I.corn, p_low_qty: '75.000', p_expected_version: 4 }], 'D5: الحدّ بثلاث مراتب بوحدة الأساس وبشرط النسخة');
      t.same([dialog(), toasts()], [undefined, ['حُفظ حدّ قلّة «ذرة»: 75 كغم.']], 'D5: تُغلق وتقول الحدّ من جواب الخادم');
      await click(withId('mark-item', I.corn));
      typeIn(input(), '');
      await settle();
      await submit();
      t.same(named(log, 'set_item_low')[1], { p_item: I.corn, p_low_qty: null, p_expected_version: 4 }, 'D5: خانة فارغة تزيل الحدّ (null)');
    });

    // ── D6: «رتّب» بالسهمين والسحب، وorder_changed ─────────────────────────────────────────────────────────────────
    await step('D6', async () => {
      const added = { id: 'aaaaaaaa-0000-4000-8000-000000000040', kind: 'raw', name: 'كلس' };
      const log = fresh(KEEPER, {
        day_balance_sections: dayAnswer(),
        store_section_items: async (_args, n) => (n === 1 ? clone(F.store_section_items) : { ...clone(F.store_section_items), items: [...F.store_section_items.items.filter((x) => x.id !== I.premix), added] }),
        set_store_order: async (args, n) => (n === 1 ? reject(F.order_changed) : { section: args.p_section, count: args.p_items.length, version: 3 }),
      });
      await mount('/inventory?view=day');
      await click(withKey('arrange-section', 'feed_materials'));
      const names = () => byAction('arrange-name').map((n) => n.textContent);
      t.same([dialogTitle(), named(log, 'store_section_items'), names()], ['رتّب «رصيد مواد العلف»', [{ p_section: 'feed_materials' }], ['حنطة', 'ذرة', 'حجر', 'برمكس انتاجي', 'ملح']], 'D6: النافذة تقرأ القسم كاملاً بترتيبه');
      t.ok(disabled(byAction('arrange-save')[0]), 'D6: «احفظ الترتيب» معطّل قبل أيّ تغيير');
      await click(withId('arrange-down', I.wheat));
      t.same(names(), ['ذرة', 'حنطة', 'حجر', 'برمكس انتاجي', 'ملح'], 'D6: «أخّر» يُنزل الحنطة مكاناً');
      // السحب: كلّ صفّ بارتفاع 56 وفراغ 4، ومكانه من موضعه في القائمة الآن (كما يحسبه المتصفّح).
      for (const row of byAction('arrange-row')) row.getBoundingClientRect = () => {
        const index = row.parentNode.children.indexOf(row);
        return { top: index * 60, bottom: index * 60 + 56 };
      };
      const handle = withId('arrange-row', salt)?.children.find((n) => n.getAttribute('data-action') === 'arrange-handle');
      fire(handle, 'pointerdown', { pointerId: 1, clientY: 270 });
      await settle();
      t.ok(withId('arrange-row', salt)?.getAttribute('class').includes('border-brand-500'), 'D6: المادّة الممسوكة مميَّزة');
      fire(handle, 'pointermove', { pointerId: 1, clientY: 70 });
      fire(handle, 'pointermove', { pointerId: 1, clientY: 10 });
      await settle();
      fire(handle, 'pointerup', { pointerId: 1, clientY: 10 });
      await settle();
      t.same(names(), ['ملح', 'ذرة', 'حنطة', 'حجر', 'برمكس انتاجي'], 'D6: سحب الملح إلى الأعلى بحركتين متتاليتين قبل الرسم: أوّلاً وما بينهما يتزحزح، ولا تنتقل غيرها');
      await click(byAction('arrange-save')[0]);
      t.same(named(log, 'set_store_order')[0], { p_section: 'feed_materials', p_items: [salt, I.corn, I.wheat, I.stone, I.premix], p_expected: ORDER }, 'D6: الترتيب كاملاً بشرط القائمة التي عُرضت');
      t.same([dialog() !== undefined, text().includes(F.order_changed.hint), named(log, 'store_section_items').length], [true, true, 2], 'D6: order_changed بتلميحه، والقسم يُقرأ من جديد');
      t.same(names(), ['ملح', 'ذرة', 'حنطة', 'حجر', 'كلس'], 'D6: ترتيبك باقٍ لما بقي، وما حُذف خرج، وما أُضيف في آخره');
      await click(byAction('arrange-save')[0]);
      t.same(named(log, 'set_store_order')[1], { p_section: 'feed_materials', p_items: [salt, I.corn, I.wheat, I.stone, added.id], p_expected: [I.wheat, I.corn, I.stone, salt, added.id] }, 'D6: الحفظ الثاني بشرط القائمة التي قُرئت');
      t.same([dialog(), toasts(), named(log, 'day_balance_sections').length], [undefined, ['حُفظ ترتيب «رصيد مواد العلف»: بهذا الترتيب تظهر في البطاقات والرصيد اليوميّ.'], 2], 'D6: تُغلق وتقول ما حُفظ ويُقرأ الرصيد');
    });

    // ── D7: «ألوان الرصيد» وcolors_changed ────────────────────────────────────────────────────────────────────────
    await step('D7', async () => {
      const newer = { ...clone(DB), colors: { auto: true, low: 'pink', out: 'red', version: 2 } };
      const log = fresh(KEEPER, {
        day_balance_sections: async (_args, n) => (n === 1 ? clone(DB) : clone(newer)),
        set_store_colors: async (args, n) => (n === 1 ? reject(F.colors_changed) : { auto: args.p_auto, low: args.p_low_color, out: args.p_out_color, version: 3 }),
      });
      await mount('/inventory?view=day');
      await click(byAction('day-colors')[0]);
      const sw = () => descendants(dialog()).find((n) => n.getAttribute('role') === 'switch');
      t.same([dialogTitle(), sw()?.getAttribute('aria-checked'), withColor('colors-low', 'orange')?.getAttribute('aria-checked'), withColor('colors-out', 'red')?.getAttribute('aria-checked')], ['ألوان الرصيد', 'true', 'true', 'true'], 'D7: الإعدادات كما حُفظت');
      await click(sw());
      await click(withColor('colors-low', 'yellow'));
      await click(byAction('colors-save')[0]);
      t.same(named(log, 'set_store_colors')[0], { p_auto: false, p_low_color: 'yellow', p_out_color: 'red', p_expected_version: 1 }, 'D7: الإطفاء والأصفر بشرط النسخة');
      t.same([dialog() !== undefined, text().includes(F.colors_changed.hint), named(log, 'day_balance_sections').length], [true, true, 2], 'D7: colors_changed بتلميحه، والرصيد يُقرأ من جديد');
      t.same([byAction('colors-changed').length, withColor('colors-low', 'pink')?.getAttribute('aria-checked'), sw()?.getAttribute('aria-checked'), disabled(byAction('colors-save')[0])], [1, 'true', 'true', true], 'D7: الألوان الجديدة تُعرض وتصير الأساس، ولا يُكتب فوق ما لم يُرَ');
      await click(withColor('colors-low', 'yellow'));
      await click(byAction('colors-save')[0]);
      t.same(named(log, 'set_store_colors')[1], { p_auto: true, p_low_color: 'yellow', p_out_color: 'red', p_expected_version: 2 }, 'D7: الحفظ التالي بالنسخة الجديدة');
      t.same([dialog(), toasts()], [undefined, ['حُفظت ألوان الرصيد: التلوين التلقائيّ مشغَّل.']], 'D7: تُغلق وتقول ما حُفظ');
    });

    // ── D8: التلوين التلقائيّ مطفأ ───────────────────────────────────────────────────────────────────────────────────
    await step('D8', async () => {
      fresh(KEEPER, { day_balance_sections: dayAnswer({ ...clone(DB), colors: { auto: false, low: 'orange', out: 'red', version: 2 } }) });
      await mount('/inventory?view=day');
      t.same([tintOf(dayRow(I.corn))?.[0], tintOf(dayRow(I.premix))?.[0], tintOf(dayRow(I.stone))?.[0], byAction('day-state').length], ['yellow', null, 'blue', 0], 'D8: مطفأ: اللون باليد وحده، ولا تلوين ولا كلمة حالة للنافدة');
    });

    // ── D9: من لا يملك الأفعال ──────────────────────────────────────────────────────────────────────────────────────
    await step('D9', async () => {
      fresh(KEEPER, { day_balance_sections: dayAnswer({ ...clone(DB), can_note: false, can_arrange: false }) });
      await mount('/inventory?view=day');
      t.same([byAction('mark-item').length, byAction('arrange-section').length, byAction('day-colors').length, tintOf(dayRow(I.corn))?.[0]], [0, 0, 0, 'yellow'], 'D9: بلا can_note ولا can_arrange: لا زرّ لون ولا «رتّب» ولا «ألوان الرصيد»، والتظليل يُرى');
    });

    // ── B: البطاقات ─────────────────────────────────────────────────────────────────────────────────────────────────
    await step('B1', async () => {
      const log = fresh(KEEPER, {
        items_overview: async () => clone(F.items_overview),
        store_section_items: async () => clone(F.store_section_items),
        set_store_order: async (args) => ({ section: args.p_section, count: args.p_items.length, version: 3 }),
      });
      await mount('/inventory');
      const tile = (id) => byAction('open-item-file').find((n) => n.getAttribute('href') === `/inventory/items/${id}`);
      t.same([tile(I.corn)?.getAttribute('data-color'), tile(I.premix)?.getAttribute('data-color'), tile(I.stone)?.getAttribute('data-color'), tile(I.wheat)?.getAttribute('data-color')], ['yellow', 'red', 'blue', null], 'B1: البطاقة بلونها الظاهر');
      t.eq(tile(I.corn)?.style.backgroundImage, m.tintStyle('yellow').backgroundImage, 'B1: والبطاقة مظلَّلة بلونها');
      t.same(descendants(tile(I.corn)).filter((n) => n.getAttribute('data-action') === 'tile-state').map((n) => n.textContent), ['قليلة'], 'B1: وكلمة الحالة');
      const order = byAction('open-item-file').map((n) => n.getAttribute('href').split('/').at(-1)).filter((id) => ORDER.includes(id));
      t.same(order, ORDER, 'B1: البطاقات بترتيب القسم المحفوظ');
      t.same([withKey('arrange-section', 'feed_materials') !== undefined, withKey('arrange-section', 'feed')], [true, undefined], 'B1: «رتّب» لقسم فيه أكثر من مادّة');
      await click(withKey('arrange-section', 'feed_materials'));
      await click(withId('arrange-up', I.corn));
      await click(byAction('arrange-save')[0]);
      t.same(named(log, 'set_store_order')[0]?.p_items, [I.corn, I.wheat, I.stone, I.premix, salt], 'B1: «قدّم» ثمّ الحفظ');
      t.same([dialog(), named(log, 'items_overview').length], [undefined, 2], 'B1: تُغلق وتُقرأ البطاقات من جديد');
      const search = byAction('search-board')[0];
      typeIn(search, 'ح');
      await settle();
      t.same([byAction('open-item-file').length, byAction('arrange-section').length], [3, 0], 'B1: أثناء البحث (ثلاث مطابقات في القسم) لا «رتّب»: الترتيب للقسم كلّه لا لما طابق');
    });

    // ── F: ملفّ المادّة ──────────────────────────────────────────────────────────────────────────────────────────────
    await step('F1', async () => {
      const log = fresh(KEEPER, {
        item_file: async () => clone(F.item_file),
        item_mark: async () => clone(F.item_mark),
        set_item_color: async () => clone(F.set_item_color_cleared),
      });
      await mount(`/inventory/items/${I.corn}`);
      t.same([byAction('file-mark-color')[0]?.textContent, byAction('file-mark-low')[0]?.textContent, named(log, 'item_mark')], ['لونها: أصفر', 'حدّ القلّة: 50 كغم', [{ p_item: I.corn }]], 'F1: لونها وحدّها في ملفّها من item_mark');
      await click(byAction('file-mark-open')[0]);
      t.eq(dialogTitle(), 'لون «ذرة»', 'F1: «اللون وحدّ القلّة» يفتح النافذة نفسها');
      await click(withColor('mark-color', 'none'));
      t.same(named(log, 'set_item_color'), [{ p_item: I.corn, p_color: null, p_expected_version: 4 }], 'F1: «بلا لون» بالنسخة التي قرأها الملفّ');
      t.same([dialog(), toasts(), named(log, 'item_mark').length], [undefined, ['أُزيل لون «ذرة».'], 2], 'F1: تُغلق وتقول ما حُفظ ويُقرأ لونها من جديد');
    });
    await step('F2', async () => {
      const log = fresh(KEEPER, {
        item_file: async () => clone(F.item_file),
        item_mark: async (_args, n) => (n === 1 ? Promise.reject(new m.RejectedError('internal', null)) : clone(F.item_mark)),
      });
      await mount(`/inventory/items/${I.corn}`);
      t.same([byAction('file-mark-failed').length, byAction('retry').length, byAction('record-purchase').length], [1, 0, 1], 'F2: فشل قراءة اللون سطر صغير بـ«أعد القراءة» لا بطاقة فشل، والملفّ وأفعاله كما هي');
      await click(byAction('file-mark-retry')[0]);
      t.same([named(log, 'item_mark').length, byAction('file-mark-color')[0]?.textContent], [2, 'لونها: أصفر'], 'F2: «أعد القراءة» يقرأ من جديد فيظهر لونها');
    });
  } finally {
    if (root && m) m.flushSync(() => root.unmount());
    restore();
    delete globalThis.__db;
  }
}
