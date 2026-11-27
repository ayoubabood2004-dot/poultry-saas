// «الرصيد اليومي» (0022، كلمة المالك 2026-11-09 بصورة ورقته «رصيد مواد العلف — 4/11/2026») و«المخزن بقسمين» (كلمة المالك 2026-11-21، عقد
// docs/plans/0034/contract-0034.md B5 وS1): react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل StockRoutes الحقيقية والقشرة، وrepo/dayBalance
// وrepo/purchases الحقيقيين (المحلّلات وبناء النداءات) على core بديل يسجّل كلّ نداء ويجيب: أقسام الرصيد من fixtures/day-balance-sections.hand.json
// (مكتوبة باليد بمفاتيح B5 وأنواعها حرفاً، والجلسة الرئيسية تبدّلها بعيّنات القاعدة الحقيقية عند الدمج)، والملاحظة والرفض وملفّ المادّة من عيّنات
// القاعدة الحقيقية (fixtures/day-balance-0022.json: كاتب الملاحظة لم يتغيّر). وrepo المخزون والجلسة والتنبيه بدائل. الحالات:
// P المحلّلات بكلّ عيّنة (الكمية بالآلاف، والملاحظة ونسختها، والتصنيف، والخانات التي تأتي null) وصرامتها (مفتاح قسم غريب أو مكرّر، والمادّة في
// قسمين)، وترتيب الأقسام بالعرض أيّاً كان ترتيبها بالسلك، والرابط (اليوم وحده)؛
// S1 المفتاح «البطاقات | الرصيد اليومي» والرابط (?view=day يقرأ day_balance_sections ولا يقرأ day_balance، والبطاقات لا تقرأ الرصيد)؛
// S2 جدول لكلّ قسم بعنوانه وعدده وأعمدته (ت | المادّة | الرصيد (كغم) | الملاحظات، والوحدة في الرأس أو عمودها)، و«أخرى» يغيب فارغاً، ولا اختيار
// تصنيف ولا مخزن ولا «أدرج مواد»؛ S3 السهمان و«اليوم» والتاريخ بالكتابة بـp_on الصحيح؛ S6 رابط المادّة والصفّ كلّه بـ?back= إلى العرض نفسه؛
// S7 الملاحظة في أيّ قسم: النصّ واليوم والنسخة التي رآها، والمسح، وnote_changed، والطول، وout_of_scope؛ S10 الطباعة: الورقة الرسمية (رسالة الزبون
// 2026-11-26: «ترتيب رسمي… وبالاعلى الاسماء الدالة») برأسها وشبكة بياناتها وجداولها الرسمية بشريط اسم كلّ قسم وصفّ أسماء أعمدته وتذييلها، وA4 بالطول؛
// S11 «أرسل PDF» يرسل ملفّ PDF لا نصّاً (الرسالة نفسها: «لازم يروح على شكل بي دي اف»)، وما رفضه المتصفّح جاهزٌ بضغطة، وبلا مشاركة يُنزَّل، والفشل
// يُقال؛ S12 المشاهد بلا ملاحظة، والفراغ بلا طباعة ولا إرسال؛ S14 رفض day_in_future بتلميحه وزرّ «اليوم»؛ S15 القشرة
// print:hidden؛ S16 «حركات المادّة» في ملفّ المادّة؛ وR مراجعة 0022 العدائية فيما بقي من الصفحة؛
// B بطاقات المخزن بأقسامها: «مواد العلف» و«العلف» دائماً بعدد كلّ منهما، و«أخرى» إن لم يكن فارغاً، والبحث عبر الأقسام، و«أضف مادّة» داخل القسم
// بنوعه (مادّة للمعمل أو علف جاهز) حتى createItem.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const F = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'day-balance-0022.json'), 'utf8'));
const H = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'day-balance-sections.hand.json'), 'utf8')).day_balance_sections;
// عيّنة القاعدة الحقيقية (supabase/tests/hall-sheet.test.mjs بـHALL_SHEET_SAMPLES_OUT=1): تمرّ بالمحلّل الحقيقي كالمكتوبة باليد (تكامل 0035).
const REAL = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'hall-sheet-0035.json'), 'utf8')).day_balance_sections;
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
  // صورة الورقة: toJpeg يسجّل النسخة وخياراتها ويجيب بما يضعه الفحص (JPEG حقيقيّ صغير)؛ وtoBlob (صور القاعات والمبيعات) لا يُنادى هنا.
  image: 'export const toBlob = () => Promise.reject(new Error("toBlob_unused")); export const toJpeg = (node, options) => globalThis.__db.toJpeg(node, options);',
};
// repo الحقيقي يبني النداء ويقرأ الجواب؛ core بديل له وحده يسجّل النداء ويجيب.
const CORE_FOR = /src\/lib\/repo\/(?:dayBalance|purchases)\.ts$/u;
const CORE = [
  'export const call = async (fn, args) => globalThis.__db.rpc(fn, args);',
  // قراءات الجداول (بطاقة المادّة القديمة) لا تجيب: لا شيء هنا يحتاجها.
  'export const send = () => new Promise(() => {});',
  'export const classifyPostgrest = (error) => Object.assign(new Error(error.code ?? "postgrest"), error);',
].join('\n');
const stubs = {
  name: 'db-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/(inventory|purchasing|counts|mill)$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'db-stub' }));
    b.onResolve({ filter: /^html-to-image$/ }, () => ({ path: 'image', namespace: 'db-stub' }));
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
    "export { Shell } from './src/components/shell/Shell.tsx';",
    "export { recoveryStore } from './src/lib/pwa/recovery.ts';",
    "export { parseDayBalanceSections, parseDayNote } from './src/lib/repo/dayBalance.ts';",
    "export { RowShapeError } from './src/lib/repo/inventory.ts';",
    "export { dayParams, dayUrl, pdfName, NOTE_SPACES } from './src/pages/inventory/DayBalanceView.tsx';",
    "export { sectionOfKind } from './src/pages/inventory/storeSections.ts';",
    "export { backTarget } from './src/components/ui/BackButton.tsx';",
    "export { recipeBack } from './src/pages/inventory/ItemsPage.tsx';",
    "export { baseQty } from './src/pages/inventory/simple-shared.ts';",
    "export { columnDecimals, fmtQtyCell } from './src/lib/format.ts';",
    "export { onlineStore } from './src/lib/online.ts';",
    "export { RejectedError, UnknownOutcomeError } from './src/lib/errors.ts';",
  ].join('\n');
  const result = await build({
    stdin: { contents: entry, resolveDir: ROOT, loader: 'tsx' },
    bundle: true,
    loader: { '.css': 'empty' }, // أنماط المبيعات الكسولة (sales/doc.css) بلا مخرَج هنا
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
const classOf = (node) => node?.getAttribute('class') ?? '';
const disabled = (node) => Boolean(node?.hasAttribute('disabled'));
const click = async (node, init = {}) => {
  fire(node, 'click', init);
  await settle();
};
const typeIn = (input, value) => {
  input.value = value;
  fire(input, 'input');
};
const dialog = () => all().find((n) => n.getAttribute('role') === 'dialog');
const dialogTitle = () => descendants(dialog() ?? body()).find((n) => n.localName === 'h2')?.textContent ?? null;
const submitDialog = async () => {
  fire(descendants(dialog()).find((n) => n.localName === 'form'), 'submit');
  await settle();
};
/** هل للعقدة أو لأحد آبائها الصنف. */
const underClass = (node, cls) => {
  for (let n = node; n && n.nodeType === 1; n = n.parentNode) if (classOf(n).split(/\s+/).includes(cls)) return true;
  return false;
};
const under = (node, ancestor) => {
  for (let n = node; n; n = n.parentNode) if (n === ancestor) return true;
  return false;
};
const radio = (label) => all().find((n) => n.getAttribute('role') === 'radio' && n.textContent === label);
const withId = (action, id) => byAction(action).find((n) => n.getAttribute('data-id') === id);
/** جدول قسم الرصيد بمفتاحه، ورؤوسه وصفوفه. */
const section = (key) => byAction('day-section').find((n) => n.getAttribute('data-key') === key);
const headersIn = (node) => (node ? descendants(node).filter((n) => n.localName === 'th' && n.getAttribute('scope') === 'col').map((n) => n.textContent) : []);
const rowsIn = (node) => {
  const tbody = node ? descendants(node).find((n) => n.localName === 'tbody') : undefined;
  return tbody ? tbody.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent)) : [];
};
/** شريط اسم كلّ قسم (عنوان الجدول الرسميّ بمستواه). */
const bandOf = (node) => (node ? descendants(node).find((n) => n.getAttribute('role') === 'heading') : undefined);
const sectionTitles = () => byAction('day-section').map((n) => bandOf(n)?.textContent);
/** قيمة مربّع في شبكة بيانات الرأس بمفتاحه (data-info). */
const infoText = (key) => {
  const box = all().find((n) => n.getAttribute('data-info') === key);
  return box ? descendants(box).find((n) => n.localName === 'dd')?.textContent : undefined;
};
/** قيمة القائمة المختارة كما يضعها React (selected على الخيار). */
const chosenKind = () => byAction('simple-item-kind')[0]?.options.find((o) => o.selected === true)?.getAttribute('value') ?? null;

/** الكمية النصّية بالآلاف (Milli) كما يقرؤها المحلّل. */
const milli = (value) => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(`${whole}${fraction.padEnd(3, '0')}`);
};
const shift = (day, n) => {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + n);
  return at.toISOString().slice(0, 10);
};
const fmt = (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
const UNIT = { kg: 'كغم', L: 'لتر', pc: 'قطعة' };
const TITLES = { feed_materials: 'رصيد مواد العلف', feed: 'رصيد العلف', other: 'أخرى' };
const ws = (role, over = {}) => ({
  userId: `u-${role}`, orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [],
  divisions: ['feed_mill', 'general'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true,
  invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const MANAGER = { status: 'ready', workspace: ws('manager') };
const KEEPER = { status: 'ready', workspace: ws('storekeeper', { scopes: [{ warehouseId: 'w-raw' }] }) };
const VIEWER = { status: 'ready', workspace: ws('viewer') };

/** جواب day_balance_sections كما تحسبه القاعدة لليوم المطلوب (on = p_on أو اليوم). */
const answer = (sample) => async (args) => {
  const json = clone(sample);
  json.on = args.p_on ?? json.today;
  return json;
};
const itemRow = (id, name, categoryId, kind = 'raw') => ({ id, version: 1, archived: false, name, nameNorm: name, categoryId, kind, baseUnit: 'kg', density: null, pieceMassKg: null, tracksExpiry: false, scaleStep: 1n, minQty: null, barcode: null, altCodes: [] });

export default async function (t) {
  const restore = installDom();
  const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let root = null;
  try {
    const m = await bundle();
    m.onlineStore.set(true);
    let where = null;
    function Probe() {
      where = m.useLocation();
      return null;
    }
    const fresh = (session, handlers = {}, rpcs = {}) => {
      const calls = [];
      const rpcCalls = [];
      globalThis.__db = {
        session,
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
        rpc(fn, args) {
          rpcCalls.push([fn, args]);
          const handler = rpcs[fn];
          if (!handler) return new Promise(() => {});
          return handler(args, rpcCalls.filter(([name]) => name === fn).length);
        },
      };
      return { calls, rpcCalls };
    };
    const named = (log, name) => log.filter(([n]) => n === name).map(([, args]) => args);
    const mount = async (url, element = null) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      m.flushSync(() =>
        root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(Probe), element ?? m.h(m.Routes, null, m.h(m.Route, { path: '/inventory/*', element: m.h(m.StockRoutes) })))),
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
    const search = () => Object.fromEntries(new URLSearchParams(where?.search ?? ''));
    /** رابط العيّنة بيومها (بلا day إن كان يومها اليوم). */
    const urlAt = (sample) => `/inventory?${new URLSearchParams(sample.on === sample.today ? { view: 'day' } : { view: 'day', day: sample.on }).toString()}`;

    // ── شروط العيّنات ───────────────────────────────────────────────────────────────────────────────────────────────
    const OWN = H.owner;
    const rowsOf = (sample, key) => sample.sections.find((entry) => entry.key === key)?.rows ?? [];
    const units = (rows) => [...new Set(rows.map((row) => row.base_unit))];
    t.same(
      [OWN.sections.map((s) => s.key), OWN.on < OWN.today, OWN.can_note, units(rowsOf(OWN, 'feed_materials')), units(rowsOf(OWN, 'feed')), units(rowsOf(OWN, 'other')).length > 1],
      [['feed_materials', 'feed', 'other'], true, true, ['kg'], ['kg'], true],
      'شرط owner: الأقسام الثلاثة بترتيب B5، ويومه قبل اليوم، ويكتب الملاحظة، وقسما العلف بالكيلوغرام و«أخرى» بوحدتين',
    );
    t.ok(rowsOf(OWN, 'feed_materials').some((row) => milli(row.qty) === 0n) && rowsOf(OWN, 'feed').some((row) => row.note) && rowsOf(OWN, 'feed').some((row) => !row.note && milli(row.qty) !== 0n), 'شرط owner: صفر في مواد العلف، وفي العلف مادّة بملاحظة وأخرى بلا ملاحظة');
    t.same([rowsOf(H.no_other, 'feed').length, rowsOf(H.no_other, 'other').length, rowsOf(H.no_other, 'feed_materials').length > 0], [0, 0, true], 'شرط no_other: علف فارغ و«أخرى» فارغة');
    t.same([H.viewer.can_note, H.empty.sections.every((s) => s.rows.length === 0)], [false, true], 'شرط viewer لا يكتب، وempty بلا صفوف');
    t.same([F.set_day_note.saved.note !== null, F.set_day_note.cleared.note], [true, null], 'شرط set_day_note: محفوظة وممسوحة');
    t.same([F.refusals.note_changed.code, F.refusals.day_in_future.code, Boolean(F.refusals.note_changed.hint), Boolean(F.refusals.day_in_future.hint)], ['note_changed', 'day_in_future', true, true], 'شرط الرفضين بتلميحهما');
    const OUT_OF_SCOPE = F.refusals.out_of_scope ?? { code: 'out_of_scope', hint: 'لا تُخزَّن هذه المادّة في شيء من مخازن نطاقك.' };
    const plain = rowsOf(OWN, 'feed').find((row) => !row.note && milli(row.qty) !== 0n);
    const noted = rowsOf(OWN, 'feed').find((row) => row.note);

    // ── P: المحلّل الحقيقي ─────────────────────────────────────────────────────────────────────────────────────────
    for (const [name, sample] of Object.entries({ ...H, real_0035: REAL })) {
      const parsed = m.parseDayBalanceSections(clone(sample));
      t.same([parsed.today, parsed.on, parsed.canNote, parsed.sections.map((s) => s.key)], [sample.today, sample.on, sample.can_note, ['feed_materials', 'feed', 'other']], `P ${name}: اليوم والصلاحية والأقسام الثلاثة بترتيبها`);
      t.same(
        parsed.sections.map((s) => s.rows.map((row) => [row.itemId, row.name, row.kind, row.baseUnit, row.qty, row.note, row.category])),
        sample.sections.map((s) => s.rows.map((row) => [row.item_id, row.name, row.kind, row.base_unit, milli(row.qty), row.note ? { text: row.note.text, version: row.note.version } : null, row.category ? { id: row.category.id, name: row.category.name } : null])),
        `P ${name}: الصفوف بالكمية بالآلاف والملاحظة ونسختها والتصنيف`,
      );
    }
    {
      const reversed = { ...clone(OWN), sections: clone(OWN.sections).reverse() };
      t.same(m.parseDayBalanceSections(reversed).sections.map((s) => [s.key, s.rows.length]), OWN.sections.map((s) => [s.key, s.rows.length]), 'P الأقسام بترتيب العرض أيّاً كان ترتيبها بالسلك');
      const missing = { ...clone(OWN), sections: clone(OWN.sections).filter((s) => s.key !== 'other') };
      t.same(m.parseDayBalanceSections(missing).sections.map((s) => [s.key, s.rows.length]), [['feed_materials', 4], ['feed', 3], ['other', 0]], 'P قسم غاب من الجواب = بلا صفوف');
      const row0 = rowsOf(OWN, 'feed_materials')[0];
      const withRow = (patch) => () => m.parseDayBalanceSections({ ...clone(OWN), sections: [{ key: 'feed_materials', rows: [{ ...clone(row0), ...patch }] }] });
      const bad = (patch) => () => m.parseDayBalanceSections({ ...clone(OWN), ...patch });
      t.throws(bad({ sections: [...clone(OWN.sections), { key: 'drugs', rows: [] }] }), 'P صرامة: مفتاح قسم غير معروف');
      t.throws(bad({ sections: [...clone(OWN.sections), { key: 'feed', rows: [] }] }), 'P صرامة: قسم مكرّر');
      t.throws(bad({ sections: [{ key: 'feed_materials', rows: [clone(row0)] }, { key: 'feed', rows: [{ ...clone(row0), kind: 'feed' }] }] }), 'P صرامة: المادّة نفسها في قسمين');
      t.throws(bad({ sections: { feed: [] } }), 'P صرامة: sections ليست قائمة');
      t.throws(bad({ sections: [{ key: 'feed' }] }), 'P صرامة: قسم بلا rows');
      t.throws(bad({ rows: undefined, sections: undefined }), 'P صرامة: بلا sections (شكل day_balance القديم)');
      t.throws(withRow({ qty: null }), 'P صرامة: كمية null');
      t.throws(withRow({ qty: '1.2345' }), 'P صرامة: كمية بأربع مراتب');
      t.throws(withRow({ note: { text: '', version: 1 } }), 'P صرامة: ملاحظة فارغة');
      t.throws(withRow({ note: { text: 'x', version: 0 } }), 'P صرامة: نسخة صفر');
      t.throws(withRow({ base_unit: 'ton' }), 'P صرامة: وحدة غير معروفة');
      t.throws(withRow({ kind: 'grain' }), 'P صرامة: نوع غير معروف');
      t.throws(withRow({ category: { id: 'c' } }), 'P صرامة: تصنيف بلا اسم');
      t.throws(bad({ on: '2026-13-01' }), 'P صرامة: يوم غير موجود');
      t.throws(bad({ can_note: undefined }), 'P صرامة: can_note غائب');
      const large = m.parseDayBalanceSections({ ...clone(OWN), sections: [{ key: 'feed', rows: [{ ...clone(row0), note: { text: 'x', version: 9_007_199 } }] }] });
      t.eq(large.sections[1].rows[0].note?.version, 9_007_199, 'P النسخة رقم من تسلسل كما هو (لا عدّاد يبدأ من 1)');
      const nullable = m.parseDayBalanceSections({ ...clone(OWN), sections: [{ key: 'feed_materials', rows: [{ ...clone(row0), note: undefined, category: undefined }] }] });
      t.same([nullable.sections[0].rows[0].note, nullable.sections[0].rows[0].category], [null, null], 'P الخانات التي تأتي null أو تغيب تُقرأ null');
      let shapeError = null;
      try {
        withRow({ qty: null })();
      } catch (error) {
        shapeError = error;
      }
      t.ok(shapeError instanceof m.RowShapeError, 'P الخطأ RowShapeError (خطأ شكل، لا جدول يُعرض خطأً)');
      const saved = m.parseDayNote(clone(F.set_day_note.saved));
      t.same([saved.itemId, saved.on, saved.note], [F.set_day_note.saved.item_id, F.set_day_note.saved.on, { text: F.set_day_note.saved.note.text, version: F.set_day_note.saved.note.version }], 'P set_day_note المحفوظة');
      t.eq(m.parseDayNote(clone(F.set_day_note.cleared)).note, null, 'P set_day_note الممسوحة: note = null');
      // قسمة الشاشة (بطاقات المخزن) مرآة قسمة B5 بالخادم.
      t.same(['raw', 'additive', 'feed', 'medicine', 'vaccine', 'fuel', 'other', 'chick'].map((kind) => m.sectionOfKind(kind)), ['feed_materials', 'feed_materials', 'feed', 'other', 'other', 'other', 'other', 'other'], 'P القسم بنوع المادّة: raw وadditive موادّ علف، وfeed علف، والباقي أخرى');
      // الرابط: اليوم وحده؛ ما لا يصلح وما بقي من روابط قديمة (cat وstore) يُهمل، والعرض نفسه رابط رجوع يقبله ملفّ المادّة.
      t.same(m.dayParams(new URLSearchParams({ cat: 'all', day: '2026-02-30', store: '6bc1bee2-2e40-4a9f-8f96-0000000000b1' })), { day: null }, 'الرابط: يوم غير موجود يُهمل، وcat وstore القديمان لا يُقرآن');
      const url = m.dayUrl({ day: OWN.on });
      t.same([url, m.backTarget(url, '/inventory'), m.dayParams(new URLSearchParams(url.split('?')[1]))], [`/inventory?view=day&day=${OWN.on}`, url, { day: OWN.on }], 'الرابط: ?view=day&day= وbackTarget يقبله ويعود منه كما هو');
    }

    // ── S1: المفتاح والرابط ─────────────────────────────────────────────────────────────────────────────────────────
    const overviewOk = { items_overview: async () => ({ today: OWN.today, can_record: true, can_add_item: true, items: [] }) };
    await step('S1', async () => {
      const { rpcCalls } = fresh(MANAGER, {}, { ...overviewOk, day_balance_sections: answer(OWN) });
      await mount('/inventory');
      t.same(all().filter((n) => n.getAttribute('role') === 'radio').map((n) => [n.textContent, n.getAttribute('aria-checked')]), [['البطاقات', 'true'], ['الرصيد اليومي', 'false']], 'S1: مفتاح بخيارين، والبطاقات افتراضاً');
      t.same([named(rpcCalls, 'items_overview').length, named(rpcCalls, 'day_balance_sections').length], [1, 0], 'S1: البطاقات تقرأ items_overview وحده');
      await click(radio('الرصيد اليومي'));
      await settle();
      t.same([where?.pathname, search()], ['/inventory', { view: 'day' }], 'S1: ?view=day بلا تصنيف ولا انتقال');
      t.same([named(rpcCalls, 'day_balance_sections'), named(rpcCalls, 'day_balance').length], [[{ p_on: null }], 0], 'S1: day_balance_sections بـp_on فارغ (اليوم)، ولا day_balance');
      t.same([named(rpcCalls, 'items_overview').length, byAction('day-view').length, byAction('search-board').length], [1, 1, 0], 'S1: العرض اليومي بلا قراءة البطاقات ولا بحثها');
      const reads = named(rpcCalls, 'day_balance_sections').length;
      await click(radio('الرصيد اليومي'));
      t.eq(named(rpcCalls, 'day_balance_sections').length, reads, 'S1: النقر على «الرصيد اليومي» وهو مختار لا يقرأ من جديد');
      await click(radio('البطاقات'));
      t.same([where?.search, byAction('day-view').length, named(rpcCalls, 'items_overview').length], ['', 0, 2], 'S1: «البطاقات» يعيد /inventory بلا وسائط');
    });

    // ── S2: جدول لكلّ قسم ──────────────────────────────────────────────────────────────────────────────────────────
    await step('S2', async () => {
      const { rpcCalls } = fresh(MANAGER, {}, { day_balance_sections: answer(OWN) });
      await mount(urlAt(OWN));
      t.same(named(rpcCalls, 'day_balance_sections'), [{ p_on: OWN.on }], 'S2: قراءة واحدة بيوم الرابط');
      t.same(sectionTitles(), [TITLES.feed_materials, TITLES.feed, TITLES.other], 'S2: جدول لكلّ قسم بشريط اسمه: «رصيد مواد العلف» ثمّ «رصيد العلف» ثمّ «أخرى»');
      t.same(
        byAction('day-section').map((n) => bandOf(n)?.getAttribute('aria-level')),
        ['3', '3', '3'],
        'S2: شريط القسم عنوانٌ بالمستوى 3 تحت عنوان التقرير (h2)',
      );
      t.same(['count-feed_materials', 'count-feed', 'count-other'].map(infoText), ['4 موادّ', '3 موادّ', 'مادّتان'], 'S2: عدد موادّ كلّ قسم بالفصحى في شبكة بيانات الرأس');
      t.same(
        [byAction('day-title')[0]?.localName, byAction('day-title')[0]?.textContent, infoText('day'), byAction('day-org')[0]?.textContent],
        ['h2', 'الرصيد اليومي', fmt(OWN.on), 'مشروع الدواجن'],
        'S2: رأس التقرير: اسم المنشأة ثمّ العنوان (h2 تحت عنوان «المخزن») ثمّ التاريخ في شبكة البيانات',
      );
      for (const key of ['feed_materials', 'feed']) {
        const rows = rowsOf(OWN, key);
        const decimals = m.columnDecimals(rows.map((row) => milli(row.qty)), 3);
        t.same(headersIn(section(key)), ['ت', 'المادّة', 'الرصيد (كغم)', 'الملاحظات'], `S2 ${key}: الأعمدة كورقة المالك والكيلوغرام في رأس الرصيد`);
        t.same(
          rowsIn(section(key)),
          rows.map((row, index) => [String(index + 1), row.name, milli(row.qty) === 0n ? '-' : m.fmtQtyCell(milli(row.qty), decimals), row.note ? row.note.text : '']),
          `S2 ${key}: ت 1..n لكلّ جدول، والرصيد بمراتب عموده (والصفر «-»)، وملاحظة اليوم`,
        );
      }
      t.same(headersIn(section('other')), ['ت', 'المادّة', 'الرصيد', 'الوحدة', 'الملاحظات'], 'S2 other: وحدات مختلفة: «الرصيد» بلا وحدة وعمود «الوحدة»');
      t.same(rowsIn(section('other')).map((row) => row[3]), rowsOf(OWN, 'other').map((row) => UNIT[row.base_unit]), 'S2 other: وحدة كلّ مادّة في عمودها');
      t.same([byAction('day-category').length, byAction('day-store').length, byAction('include-items').length, byAction('new-category').length, all().filter((n) => n.localName === 'select').length], [0, 0, 0, 0, 0], 'S2: لا اختيار تصنيف ولا مخزن ولا «أدرج مواد» ولا «تصنيف جديد» (بلا قوائم)');
      const small = [...byAction('day-prev'), ...byAction('day-next'), ...byAction('day-pick'), ...byAction('day-today'), ...byAction('print-day'), ...byAction('share-day')].filter((n) => !classOf(n).includes('h-11'));
      t.same([small.length, byAction('edit-note').every((n) => classOf(n).includes('size-11'))], [0, true], 'S2: كلّ أزرار الصفحة بارتفاع الإصبع (44)');
    });
    await step('S2-hidden', async () => {
      fresh(MANAGER, {}, { day_balance_sections: answer(H.no_other) });
      await mount(urlAt(H.no_other));
      t.same([sectionTitles(), section('other'), infoText('count-other')], [[TITLES.feed_materials, TITLES.feed], undefined, undefined], 'S2: «أخرى» فارغة لا تُعرض ولا يُعدّ');
      t.same([rowsIn(section('feed')), infoText('count-feed')], [[['لا علف بعد.']], 'لا موادّ'], 'S2: «رصيد العلف» الفارغ يبقى بجملته وعدده');
    });

    // ── S3: الأيام ──────────────────────────────────────────────────────────────────────────────────────────────────
    await step('S3', async () => {
      const { rpcCalls } = fresh(MANAGER, {}, { day_balance_sections: answer(OWN) });
      await mount(urlAt(OWN));
      const prev = byAction('day-prev')[0];
      const next = byAction('day-next')[0];
      t.same([prev?.textContent, next?.textContent, byAction('day-pick')[0]?.textContent, disabled(next), byAction('day-today').length], ['اليوم السابق', 'اليوم التالي', fmt(OWN.on), false, 1], 'S3: «اليوم السابق» والتاريخ و«اليوم التالي»، و«اليوم» ليوم مضى');
      t.same([prev?.firstChild?.getAttribute?.('class')?.includes('lucide-chevron-right'), next?.lastChild?.getAttribute?.('class')?.includes('lucide-chevron-left')], [true, true], 'S3: → قبل «اليوم السابق» و← بعد «اليوم التالي»');
      await click(prev);
      t.same([search().day, named(rpcCalls, 'day_balance_sections').at(-1), byAction('day-pick')[0]?.textContent], [shift(OWN.on, -1), { p_on: shift(OWN.on, -1) }, fmt(shift(OWN.on, -1))], 'S3: «اليوم السابق» يقرأ اليوم قبله');
      await click(byAction('day-next')[0]);
      await click(byAction('day-next')[0]);
      t.same([search().day, named(rpcCalls, 'day_balance_sections').at(-1)], [shift(OWN.on, 1), { p_on: shift(OWN.on, 1) }], 'S3: «اليوم التالي» مرّتين');
      await click(byAction('day-today')[0]);
      t.same([search().day, named(rpcCalls, 'day_balance_sections').at(-1), byAction('day-today').length, disabled(byAction('day-next')[0]), byAction('day-pick')[0]?.textContent], [undefined, { p_on: null }, 0, true, fmt(OWN.today)], 'S3: «اليوم»: بلا day في الرابط و«اليوم التالي» معطّل');
      await click(byAction('day-prev')[0]);
      await click(byAction('day-next')[0]);
      t.same([search().day, named(rpcCalls, 'day_balance_sections').at(-1)], [undefined, { p_on: null }], 'S3: العودة إلى اليوم بالسهم تُسقط day من الرابط');
    });
    await step('S3-pick', async () => {
      const { rpcCalls } = fresh(MANAGER, {}, { day_balance_sections: answer(OWN) });
      await mount(urlAt(OWN));
      await click(byAction('day-pick')[0]);
      const input = () => all().find((n) => n.localName === 'input' && n.id.endsWith('-day'));
      t.same([dialogTitle(), input()?.value], ['اعرض رصيد يوم آخر', fmt(OWN.on)], 'S3: النقر على التاريخ يفتح حقل اليوم بالتاريخ المعروض');
      typeIn(input(), fmt(shift(OWN.today, 1)));
      await submitDialog();
      t.ok(text().includes('التاريخ بعد اليوم.') && dialog() !== undefined, 'S3: يوم بعد اليوم يُرفض بالنافذة');
      typeIn(input(), '31/02/2026');
      await submitDialog();
      t.ok(text().includes('اكتب التاريخ يوم/شهر/سنة'), 'S3: يوم غير موجود يُرفض');
      const target = shift(OWN.on, -10);
      typeIn(input(), fmt(target));
      await submitDialog();
      t.same([dialog(), search().day, named(rpcCalls, 'day_balance_sections').at(-1)], [undefined, target, { p_on: target }], 'S3: يوم مكتوب يُعرض');
    });

    // ── S6: رابط المادّة والصفّ كلّه ───────────────────────────────────────────────────────────────────────────────
    const fileJson = (row) => ({ today: OWN.today, can_record: false, can_edit: false, item: { id: row.item_id, name: row.name, kind: row.kind, base_unit: row.base_unit, density_kg_per_l: null, archived: false, tracks_expiry: false }, on_hand_qty: row.qty, purchased_qty: '0.000', purchases_count: 0, purchases: [], more: false, stores: [] });
    await step('S6', async () => {
      fresh(MANAGER, {}, { day_balance_sections: answer(OWN), item_file: async () => clone(fileJson(plain)) });
      const url = urlAt(OWN);
      await mount(url);
      const link = byAction('day-item').find((n) => n.textContent === plain.name);
      t.eq(link?.getAttribute('href'), `/inventory/items/${plain.item_id}?${new URLSearchParams({ back: url }).toString()}`, 'S6: المادّة رابط ملفّها وback = العرض نفسه');
      await click(link, { button: 0 });
      await settle();
      const back = byAction('back-to-board')[0];
      t.same([where?.pathname, back?.getAttribute('href'), back?.textContent], [`/inventory/items/${plain.item_id}`, url, 'رجوع إلى المخزن'], 'S6: الملفّ يُفتح وزرّ «رجوع إلى المخزن» إلى اليوم نفسه');
    });
    await step('S6-row', async () => {
      const other = rowsOf(OWN, 'other')[0];
      fresh(KEEPER, {}, { day_balance_sections: answer(OWN), item_file: async () => clone(fileJson(other)) });
      const url = urlAt(OWN);
      await mount(url);
      // النقر على زرّ الملاحظة في الصفّ له وحده (لا يفتح الملفّ).
      await click(withId('edit-note', other.item_id));
      t.same([dialog() !== undefined, where?.pathname], [true, '/inventory'], 'S6: زرّ الملاحظة يفتح نافذتها ولا ينتقل');
      await click(descendants(dialog()).find((n) => n.localName === 'button' && n.textContent === 'لا، تراجع'));
      const cell = rowsIn(section('other')).length ? descendants(section('other')).find((n) => n.localName === 'td' && n.textContent === m.fmtQtyCell(milli(other.qty), m.columnDecimals(rowsOf(OWN, 'other').map((row) => milli(row.qty)), 3))) : undefined;
      await click(cell);
      await settle();
      t.same([where?.pathname, new URLSearchParams(where?.search ?? '').get('back')], [`/inventory/items/${other.item_id}`, url], 'S6: النقر على أيّ خليّة في الصفّ يفتح ملفّ المادّة بطريق الرجوع');
    });

    // ── S7: الملاحظة (في جدول «رصيد العلف»: الثاني) ─────────────────────────────────────────────────────────────────
    await step('S7-save', async () => {
      const { rpcCalls } = fresh(KEEPER, {}, { day_balance_sections: answer(OWN), set_day_note: async () => clone(F.set_day_note.saved) });
      await mount(urlAt(OWN));
      const total = OWN.sections.reduce((sum, s) => sum + s.rows.length, 0);
      t.eq(byAction('edit-note').length, total, 'S7: زرّ ملاحظة لكلّ مادّة في كلّ الأقسام');
      t.ok(under(withId('edit-note', plain.item_id), section('feed')), 'S7: وزرّ المادّة في جدول قسمها');
      await click(withId('edit-note', plain.item_id));
      const area = byAction('note-text')[0];
      t.same([dialogTitle(), area?.value ?? area?.textContent, byAction('erase-note').length], [`ملاحظة «${plain.name}» ليوم ${fmt(OWN.on)}`, '', 0], 'S7: «ملاحظة {المادّة} ليوم {اليوم}» فارغة، بلا «امسح»');
      typeIn(byAction('note-text')[0], '  ناقصة كيسين عن الفاتورة  ');
      await settle();
      const reads = named(rpcCalls, 'day_balance_sections').length;
      await submitDialog();
      t.same(named(rpcCalls, 'set_day_note'), [{ p_item: plain.item_id, p_on: OWN.on, p_note: 'ناقصة كيسين عن الفاتورة', p_expected_version: null }], 'S7: النصّ مقصوصاً ويوم العرض وnull («لم أرَ ملاحظة»)');
      t.same([dialog(), globalThis.__db.toasts.at(-1)?.tone, named(rpcCalls, 'day_balance_sections').length], [undefined, 'success', reads + 1], 'S7: تُغلق وتقول «حُفظت» وتُقرأ الأقسام من جديد');
      t.ok(globalThis.__db.toasts.at(-1)?.title.startsWith(`حُفظت ملاحظة «${plain.name}»`), 'S7: باسم المادّة');
    });
    await step('S7-erase', async () => {
      const { rpcCalls } = fresh(KEEPER, {}, { day_balance_sections: answer(OWN), set_day_note: async () => clone(F.set_day_note.cleared) });
      await mount(urlAt(OWN));
      await click(withId('edit-note', noted.item_id));
      t.eq(byAction('note-text')[0]?.value, noted.note.text, 'S7: الملاحظة الحاليّة في الحقل');
      await click(byAction('erase-note')[0]);
      t.same(named(rpcCalls, 'set_day_note'), [{ p_item: noted.item_id, p_on: OWN.on, p_note: '', p_expected_version: noted.note.version }], 'S7: «امسح الملاحظة»: نصّ فارغ بنسخة ما رآه');
      t.ok(dialog() === undefined && globalThis.__db.toasts.at(-1)?.title.startsWith('مُسحت ملاحظة'), 'S7: «مُسحت»');
    });
    await step('S7-changed', async () => {
      const changed = clone(OWN);
      changed.sections[1].rows.find((row) => row.item_id === plain.item_id).note = { text: 'كتبها المدير من جهاز آخر', version: 7_340_077 };
      let notes = 0;
      const { rpcCalls } = fresh(KEEPER, {}, {
        day_balance_sections: async (args, n) => answer(n === 1 ? OWN : changed)(args),
        set_day_note: async () => {
          notes += 1;
          if (notes === 1) throw new m.RejectedError(F.refusals.note_changed.code, F.refusals.note_changed.hint);
          return clone(F.set_day_note.saved);
        },
      });
      await mount(urlAt(OWN));
      await click(withId('edit-note', plain.item_id));
      typeIn(byAction('note-text')[0], 'ما كتبه الأمين');
      await settle();
      await submitDialog();
      await settle();
      t.same([dialog() !== undefined, byAction('note-text')[0]?.value, named(rpcCalls, 'day_balance_sections').length], [true, 'ما كتبه الأمين', 2], 'S7: note_changed: النافذة باقية بما كُتب، والأقسام تُقرأ من جديد');
      t.ok((byAction('note-changed')[0]?.textContent ?? '').includes('كتبها المدير من جهاز آخر'), 'S7: ويعرض الملاحظة الحاليّة');
      await submitDialog();
      t.same(named(rpcCalls, 'set_day_note').map((args) => [args.p_note, args.p_expected_version]), [['ما كتبه الأمين', null], ['ما كتبه الأمين', 7_340_077]], 'S7: الإعادة بالنصّ نفسه وبنسخة الملاحظة التي صار يراها');
      t.eq(dialog(), undefined, 'S7: ثمّ تُغلق');
    });
    await step('S7-long', async () => {
      const { rpcCalls } = fresh(KEEPER, {}, { day_balance_sections: answer(OWN) });
      await mount(urlAt(OWN));
      await click(withId('edit-note', plain.item_id));
      typeIn(byAction('note-text')[0], 'م'.repeat(201));
      await settle();
      await submitDialog();
      t.same([named(rpcCalls, 'set_day_note').length, text().includes('الملاحظة أطول من 200 حرف (201)')], [0, true], 'S7: أطول من 200 حرف بعد القصّ: تُقال ولا تُرسل');
      typeIn(byAction('note-text')[0], '\u{1F414}'.repeat(200));
      await settle();
      await submitDialog();
      t.eq(named(rpcCalls, 'set_day_note').length, 1, 'S7: 200 حرف خارج BMP تُرسل');
    });
    await step('S7-scope', async () => {
      const { rpcCalls } = fresh(KEEPER, {}, { day_balance_sections: answer(OWN), set_day_note: async () => { throw new m.RejectedError(OUT_OF_SCOPE.code, OUT_OF_SCOPE.hint); } });
      await mount(urlAt(OWN));
      await click(withId('edit-note', plain.item_id));
      typeIn(byAction('note-text')[0], 'ملاحظة');
      await settle();
      await submitDialog();
      t.same([named(rpcCalls, 'set_day_note').length, byAction('note-failed')[0]?.textContent, dialog() !== undefined, byAction('note-text')[0]?.value], [1, OUT_OF_SCOPE.hint, true, 'ملاحظة'], 'S7: رفض الخادم بتلميحه في النافذة، وما كُتب باقٍ');
    });

    // ── S10: الطباعة: الجداول كلّها في مستند واحد ────────────────────────────────────────────────────────────────────
    await step('S10', async () => {
      let printed = 0;
      globalThis.window.print = () => {
        printed += 1;
      };
      try {
        fresh(MANAGER, {}, { day_balance_sections: answer(OWN) });
        await mount(urlAt(OWN));
        t.eq(byAction('print-day')[0]?.textContent, 'اطبع أو احفظ PDF', 'S10: الزرّ باسمه');
        await click(byAction('print-day')[0]);
        t.eq(printed, 1, 'S10: window.print مرّة واحدة للتقرير كلّه');
        const report = byAction('day-report')[0];
        const tables = all().filter((n) => n.localName === 'table');
        t.same([tables.length, tables.every((table) => under(table, report) && !underClass(table, 'print:hidden'))], [3, true], 'S10: الجداول الثلاثة في الورقة نفسها وكلّها تُطبع');
        // الجدول الرسميّ (official.css): الإطار بلا حدّ ارتفاع على الورق، وصفّ أسماء الأعمدة مجموعة رأس تتكرّر في كلّ صفحة لا خلية ثابتة بالتمرير.
        t.ok(
          tables.every((table) => classOf(table).includes('ofc-grid') && classOf(table.parentNode).includes('ofc-frame') && descendants(table).find((n) => n.localName === 'thead')),
          'S10: كلّ جدول رسميّ (ofc-grid) في إطار ofc-frame وبصفّ أسماء أعمدة (thead)',
        );
        t.same([classOf(report).split(' ').includes('ofc-paper'), report?.localName], [true, 'article'], 'S10: الورقة الرسمية');
        t.ok(byAction('day-section').every((n) => !underClass(bandOf(n), 'print:hidden')) && !underClass(byAction('day-title')[0], 'print:hidden'), 'S10: عنوان التقرير وأشرطة الأقسام تُطبع');
        const org = byAction('day-org')[0];
        t.same([org?.textContent, under(org, report), underClass(org, 'print:hidden'), classOf(org)], ['مشروع الدواجن', true, false, 'ofc-org'], 'S10: اسم المنشأة أعلى الورقة');
        const foot = byAction('report-foot')[0];
        t.same(
          [under(foot, report), byAction('report-by')[0]?.textContent, byAction('report-sign')[0]?.textContent],
          [true, 'أعدّه: علي', 'المسؤول: ………………………التوقيع: ………………………'],
          'S10: التذييل: «أعدّه» باسم من فتح الصفحة، والمسؤول والتوقيع',
        );
        const style = all().find((n) => n.localName === 'style' && under(n, byAction('day-view')[0]))?.textContent ?? '';
        t.same(
          [style.includes('@page { size: A4 portrait; margin: 10mm; }'), style.includes('[data-capture] .print\\:hidden { display: none !important; }')],
          [true, true],
          'S10: الورقة A4 بالطول، وما يُخفى عند الطباعة يُخفى في ملفّ PDF',
        );
        t.ok(underClass(byAction('day-controls')[0], 'print:hidden') && underClass(radio('الرصيد اليومي'), 'print:hidden') && underClass(all().find((n) => n.localName === 'h1'), 'print:hidden') && underClass(byAction('open-store-setup')[0], 'print:hidden'), 'S10: الأزرار والمفتاح والعنوان والروابط لا تُطبع');
        t.ok(byAction('edit-note').every((n) => underClass(n, 'print:hidden')), 'S10: ولا أزرار الملاحظات');
      } finally {
        delete globalThis.window.print;
      }
    });
    await step('R-title', async () => {
      let titled = null;
      globalThis.window.print = () => {
        titled = globalThis.document.title;
      };
      globalThis.document.title = 'نظام الدواجن';
      try {
        fresh(MANAGER, {}, { day_balance_sections: answer(OWN) });
        await mount(urlAt(OWN));
        await click(byAction('print-day')[0]);
        t.eq(titled, `الرصيد اليومي بتاريخ ${fmt(OWN.on)}`, 'R-title: عنوان الصفحة وقت الطباعة (اسم ملفّ PDF) عنوان التقرير وتاريخه');
        fire(globalThis.window, 'afterprint');
        await settle();
        t.eq(globalThis.document.title, 'نظام الدواجن', 'R-title: ثمّ يعود بعد الطباعة');
      } finally {
        delete globalThis.window.print;
        delete globalThis.document.title;
      }
    });

    // ── S11: «أرسل PDF» ─────────────────────────────────────────────────────────────────────────────────────────────
    // JPEG حقيقيّ صغير (3×4 نقاط، من Pillow): الملفّ يُبنى منه بـsrc/lib/pdf.ts الحقيقيّ.
    const JPEG =
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAEAAMDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6pooooA//2Q==';
    // ما لا يحمله dom.mjs ويحتاجه تصوير الورقة: نسخ العقد، وقياسها (بلا تخطيط: صفر)، والنقر على رابط التنزيل (يُسجَّل).
    const proto = Object.getPrototypeOf(globalThis.document.body);
    const textProto = Object.getPrototypeOf(globalThis.document.createTextNode(''));
    const commentProto = Object.getPrototypeOf(globalThis.document.createComment(''));
    const cloneOf = function cloneNode(deep) {
      if (this.nodeType === 3) return this.ownerDocument.createTextNode(this.nodeValue);
      if (this.nodeType === 8) return this.ownerDocument.createComment(this.nodeValue);
      const copy = this.ownerDocument.createElement(this.localName);
      for (const [key, value] of this._attrs) copy._attrs.set(key, value);
      if (deep) for (const child of this.childNodes) copy.appendChild(child.cloneNode(true));
      return copy;
    };
    const downloads = [];
    proto.cloneNode = cloneOf;
    textProto.cloneNode = cloneOf;
    commentProto.cloneNode = cloneOf;
    proto.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 });
    proto.click = function recordClick() {
      downloads.push({ tag: this.localName, download: this.download, href: this.href });
    };
    const savedUrl = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = () => 'blob:pdf';
    URL.revokeObjectURL = () => {};
    const setNavigator = (value) => Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
    /** المشاركة تقبل الملفّات: canShare بالملفّات، وshare يسجّل ما أُرسل أو يرمي بما يُعطى. */
    const sharing = (shared, failWith = () => null) =>
      setNavigator({ onLine: true, canShare: (data) => Array.isArray(data?.files) && data.files.length === 1, share: async (data) => { const error = failWith(); if (error) throw error; shared.push(data); } });
    const pdfText = async (file) => Buffer.from(await file.arrayBuffer()).toString('latin1');
    const title = (sample) => `الرصيد اليومي بتاريخ ${fmt(sample.on)}`;
    try {
      await step('S11-pdf', async () => {
        const shared = [];
        const captured = [];
        sharing(shared);
        fresh(MANAGER, {}, { day_balance_sections: answer(OWN) });
        globalThis.__db.toJpeg = async (node, options) => {
          captured.push({ node, options });
          return JPEG;
        };
        await mount(urlAt(OWN));
        t.eq(byAction('share-day')[0]?.textContent, 'أرسل PDF', 'S11: الزرّ «أرسل PDF»');
        await click(byAction('share-day')[0]);
        await settle();
        const [sent] = shared;
        const file = sent?.files?.[0];
        const content = file ? await pdfText(file) : '';
        t.same(
          [shared.length, sent?.title, sent?.text, file?.name, file?.type, content.startsWith('%PDF-1.4'), content.includes('/Count 1 >>'), content.includes('/Filter /DCTDecode')],
          [1, title(OWN), undefined, m.pdfName(OWN.on), 'application/pdf', true, true, true],
          'S11: نافذة المشاركة بملفّ PDF واحد (daily-balance-<اليوم>.pdf) بعنوان التقرير وتاريخه، لا نصّ',
        );
        t.eq(m.pdfName(OWN.on), `daily-balance-${OWN.on}.pdf`, 'S11: اسم الملفّ لاتينيّ باليوم');
        const [shot] = captured;
        t.same(
          [captured.length, shot?.node.getAttribute('data-capture'), shot?.node.getAttribute('data-action'), shot?.options.width, shot?.options.backgroundColor, shot?.options.quality],
          [1, '', 'day-view', 720, 'rgb(255, 255, 255)', 0.92],
          'S11: تُصوَّر نسخةٌ من جذر العرض (data-capture) بعرض 720 على ورقة بيضاء، صورةً JPEG',
        );
        t.ok(shot && descendants(shot.node).some((n) => n.getAttribute('data-action') === 'day-report') && descendants(shot.node).filter((n) => n.localName === 'table').length === 3, 'S11: والنسخة فيها الورقة بجداولها الثلاثة');
        t.same([globalThis.__db.toasts.length, byAction('day-pdf-send-ready').length], [0, 0], 'S11: بعد الإرسال بلا رسالة ولا «أرسله»');
      });
      await step('S11-blocked', async () => {
        const shared = [];
        let refuse = true;
        sharing(shared, () => (refuse ? Object.assign(new Error('late'), { name: 'NotAllowedError' }) : null));
        fresh(MANAGER, {}, { day_balance_sections: answer(OWN) });
        globalThis.__db.toJpeg = async () => JPEG;
        await mount(urlAt(OWN));
        await click(byAction('share-day')[0]);
        await settle();
        t.same([shared.length, byAction('day-pdf-send-ready')[0]?.textContent, byAction('day-pdf-download-ready')[0]?.textContent], [0, 'أرسله', 'نزّله'], 'S11: المتصفّح رفض فتح المشاركة بعد التجهيز: الملفّ جاهز بـ«أرسله» و«نزّله»');
        refuse = false;
        await click(byAction('day-pdf-send-ready')[0]);
        await settle();
        t.same([shared.length, shared[0]?.files?.[0]?.name, byAction('day-pdf-send-ready').length], [1, m.pdfName(OWN.on), 0], 'S11: «أرسله» يرسل الملفّ نفسه بضغطة جديدة');
      });
      await step('S11-download', async () => {
        downloads.length = 0;
        setNavigator({ onLine: true });
        fresh(MANAGER, {}, { day_balance_sections: answer(OWN) });
        globalThis.__db.toJpeg = async () => JPEG;
        await mount(urlAt(OWN));
        await click(byAction('share-day')[0]);
        await settle();
        t.same(
          [downloads.map((d) => [d.tag, d.download, d.href]), globalThis.__db.toasts.at(-1)?.title],
          [[['a', m.pdfName(OWN.on), 'blob:pdf']], `حُفظ الملفّ «${m.pdfName(OWN.on)}» في التنزيلات على هذا الجهاز: أرسله من هناك إلى من تريد.`],
          'S11: بلا مشاركة بالملفّات: يُنزَّل الملفّ ويُقال أين هو',
        );
      });
      await step('S11-failed', async () => {
        const shared = [];
        sharing(shared);
        fresh(MANAGER, {}, { day_balance_sections: answer(OWN) });
        globalThis.__db.toJpeg = async () => {
          throw new Error('canvas');
        };
        await mount(urlAt(OWN));
        await click(byAction('share-day')[0]);
        await settle();
        t.same(
          [shared.length, globalThis.__db.toasts.at(-1)?.tone, globalThis.__db.toasts.at(-1)?.title, disabled(byAction('share-day')[0])],
          [0, 'danger', 'تعذّر تجهيز ملفّ PDF على هذا الجهاز. اطبع التقرير واختر «حفظ بصيغة PDF» بدلاً من ذلك.', false],
          'S11: تعذّر الرسم: يُقال ذلك ويُدلّ على الطباعة، والزرّ يعود',
        );
      });
      await step('S11-cancel', async () => {
        const shared = [];
        sharing(shared, () => Object.assign(new Error('cancelled'), { name: 'AbortError' }));
        fresh(MANAGER, {}, { day_balance_sections: answer(OWN) });
        globalThis.__db.toJpeg = async () => JPEG;
        await mount(urlAt(OWN));
        await click(byAction('share-day')[0]);
        await settle();
        t.same([shared.length, globalThis.__db.toasts.length, byAction('day-pdf-send-ready').length], [0, 0, 0], 'S11: إلغاء نافذة المشاركة: لا رسالة ولا «أرسله»');
      });
      // ── مراجعة 2026-11-27 ──────────────────────────────────────────────────────────────────────────────────────────
      await step('S11-height', async () => {
        // ارتفاع الصورة في الملفّ هو ارتفاع النسخة الذي رُسمت به (يُعطى لـhtml-to-image صريحاً)، لا نسبة الصورة: في تقرير طويل يختلف مقياسا اللوحة طولاً
        // وعرضاً فيزيح الارتفاعُ من النسبة كلَّ حدّ صفّ عن صفّه في الصورة (انقسم صفّ بين صفحتين في 480 صفّاً).
        const shared = [];
        const captured = [];
        sharing(shared);
        fresh(MANAGER, {}, { day_balance_sections: answer(OWN) });
        globalThis.__db.toJpeg = async (node, options) => {
          captured.push(options);
          return JPEG;
        };
        proto.getBoundingClientRect = function measure() {
          return this.hasAttribute('data-capture') ? { top: 0, bottom: 1000, left: 0, right: 720, width: 720, height: 1000 } : { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
        };
        try {
          await mount(urlAt(OWN));
          await click(byAction('share-day')[0]);
          await settle();
        } finally {
          proto.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 });
        }
        const content = shared[0]?.files?.[0] ? await pdfText(shared[0].files[0]) : '';
        const drawn = Math.round(((1000 * (595.28 - 2 * 28.35)) / 720) * 100) / 100;
        t.same(
          [captured[0]?.height, content.includes(` 0 0 ${drawn} `)],
          [1000, true],
          `S11: ارتفاع النسخة (1000) يُعطى لـhtml-to-image ويُرسم به في الملفّ (${drawn} نقطة)، لا من نسبة الصورة (3×4)`,
        );
      });
      const NEW_NOTE = 'وصل حمل ذرة بعد الظهر';
      const withNote = (sample) => {
        const next = clone(sample);
        next.sections.find((entry) => entry.key === 'feed').rows.find((row) => row.item_id === plain.item_id).note = { text: NEW_NOTE, version: F.set_day_note.saved.note.version };
        return next;
      };
      const writeNote = async () => {
        await click(withId('edit-note', plain.item_id));
        typeIn(byAction('note-text')[0], NEW_NOTE);
        await settle();
        await submitDialog();
        await settle();
      };
      await step('S12-ready-note', async () => {
        // رفض المتصفّح المشاركة فصار الملفّ جاهزاً، ثمّ حُفظت ملاحظة فقُرئ الرصيد من جديد: «أرسله» لا يبقى بملفّ ما قبل الملاحظة.
        const shared = [];
        const captured = [];
        const refuse = { now: true };
        sharing(shared, () => (refuse.now ? Object.assign(new Error('late'), { name: 'NotAllowedError' }) : null));
        fresh(MANAGER, {}, {
          day_balance_sections: async (args, count) => {
            const json = clone(count === 1 ? OWN : withNote(OWN));
            json.on = args.p_on ?? json.today;
            return json;
          },
          set_day_note: async () => clone(F.set_day_note.saved),
        });
        globalThis.__db.toJpeg = async (node) => {
          captured.push(node.textContent);
          return JPEG;
        };
        await mount(urlAt(OWN));
        await click(byAction('share-day')[0]);
        await settle();
        t.eq(byAction('day-pdf-send-ready').length, 1, 'S12: المتصفّح رفض المشاركة: «أرسله»');
        await writeNote();
        t.ok(byAction('day-note').some((n) => n.textContent === NEW_NOTE), 'S12: الجدول قُرئ من جديد بالملاحظة');
        t.eq(byAction('day-pdf-send-ready').length, 0, 'S12: بعد قراءة جديدة لما يُعرض لا يبقى ملفّ ما قبلها جاهزاً');
        refuse.now = false;
        await click(byAction('share-day')[0]);
        await settle();
        t.same([shared.length, captured.at(-1)?.includes(NEW_NOTE)], [1, true], 'S12: «أرسل PDF» بعدها يبني ملفّاً بما على الشاشة (فيه الملاحظة)');
      });
      await step('S12-ready-midnight', async () => {
        // عرض «اليوم»: القراءة بعد حفظ الملاحظة تجاوزت منتصف ليل الخادم فصار المعروض اليوم التالي: ملفّ اليوم السابق لا يبقى جاهزاً.
        const shared = [];
        const refuse = { now: true };
        sharing(shared, () => (refuse.now ? Object.assign(new Error('late'), { name: 'NotAllowedError' }) : null));
        const day1 = OWN.today;
        const day2 = shift(OWN.today, 1);
        fresh(MANAGER, {}, {
          day_balance_sections: async (args, count) => {
            const json = clone(count === 1 ? OWN : withNote(OWN));
            json.today = count === 1 ? day1 : day2;
            json.on = args.p_on ?? json.today;
            return json;
          },
          set_day_note: async () => clone({ ...F.set_day_note.saved, on: day1 }),
        });
        globalThis.__db.toJpeg = async () => JPEG;
        await mount('/inventory?view=day');
        t.eq(infoText('day'), fmt(day1), 'S12: اليوم معروض');
        await click(byAction('share-day')[0]);
        await settle();
        t.eq(byAction('day-pdf-send-ready').length, 1, 'S12: «أرسله» لليوم');
        await writeNote();
        t.same([infoText('day'), byAction('day-pdf-send-ready').length], [fmt(day2), 0], `S12: بعد منتصف الليل يُعرض ${fmt(day2)} ولا يبقى ملفّ ${fmt(day1)} جاهزاً`);
      });
      await step('S12-error-card', async () => {
        // القراءة بعد حفظ الملاحظة فشلت: الجداول باقية ومعها رسالة الخطأ؛ الرسالة لا تُطبع ولا تدخل الملفّ (print:hidden، والنسخة المصوَّرة تُخفيه).
        const shared = [];
        sharing(shared);
        fresh(MANAGER, {}, {
          day_balance_sections: async (args, count) => {
            if (count > 1) throw new Error('Failed to fetch');
            const json = clone(OWN);
            json.on = args.p_on ?? json.today;
            return json;
          },
          set_day_note: async () => clone(F.set_day_note.saved),
        });
        globalThis.__db.toJpeg = async () => JPEG;
        await mount(urlAt(OWN));
        await writeNote();
        const alert = all().find((n) => n.getAttribute('role') === 'alert');
        t.ok(alert && byAction('day-report').length === 1 && !disabled(byAction('share-day')[0]), 'S12: القراءة فشلت: الجداول باقية برسالة الخطأ');
        t.ok(underClass(alert, 'print:hidden'), 'S12: رسالة الخطأ تحت print:hidden فلا تُطبع ولا تدخل ملفّ PDF');
      });
    } finally {
      delete proto.cloneNode;
      delete textProto.cloneNode;
      delete commentProto.cloneNode;
      delete proto.getBoundingClientRect;
      delete proto.click;
      URL.createObjectURL = savedUrl.create;
      URL.revokeObjectURL = savedUrl.revoke;
    }
    if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator);
    else delete globalThis.navigator;

    // ── S12: الأدوار والفراغ ───────────────────────────────────────────────────────────────────────────────────────
    await step('S12-viewer', async () => {
      fresh(VIEWER, {}, { day_balance_sections: answer(H.viewer) });
      await mount(urlAt(H.viewer));
      t.same([sectionTitles(), byAction('edit-note').length, byAction('print-day').length, byAction('share-day').length, text().includes('ملاحظة الأمين')], [[TITLES.feed_materials, TITLES.feed], 0, 1, 1, true], 'S12: من لا يكتب الملاحظة: الجداول والملاحظات والطباعة والإرسال، بلا زرّ ملاحظة');
    });
    await step('S12-empty', async () => {
      fresh(MANAGER, {}, { day_balance_sections: answer(H.empty) });
      await mount(urlAt(H.empty));
      t.same([sectionTitles(), rowsIn(section('feed_materials')), rowsIn(section('feed'))], [[TITLES.feed_materials, TITLES.feed], [['لا موادّ علف بعد.']], [['لا علف بعد.']]], 'S12: بلا موادّ: الجدولان بجملتيهما و«أخرى» غائبة');
      t.same([disabled(byAction('print-day')[0]), disabled(byAction('share-day')[0])], [true, true], 'S12: ولا شيء يُطبع أو يُرسل');
    });

    // ── S14: الرفض ─────────────────────────────────────────────────────────────────────────────────────────────────
    await step('S14', async () => {
      const future = shift(OWN.today, 3);
      const { rpcCalls } = fresh(MANAGER, {}, {
        day_balance_sections: async (args) => {
          if (args.p_on !== null && args.p_on > OWN.today) throw new m.RejectedError(F.refusals.day_in_future.code, F.refusals.day_in_future.hint);
          return answer(OWN)(args);
        },
      });
      await mount(`/inventory?view=day&day=${future}`);
      t.ok(text().includes(F.refusals.day_in_future.hint) && byAction('day-refusal-way')[0]?.textContent === 'اليوم', 'S14: day_in_future بتلميح الخادم وزرّ «اليوم»');
      await click(byAction('day-refusal-way')[0]);
      t.same([search().day, named(rpcCalls, 'day_balance_sections').at(-1), sectionTitles().length], [undefined, { p_on: null }, 3], 'S14: «اليوم» يعرض اليوم');
    });

    // ── S15: القشرة لا تُطبع ───────────────────────────────────────────────────────────────────────────────────────
    await step('S15', async () => {
      fresh({ status: 'loading' }, {}, {});
      m.recoveryStore.set('looped');
      try {
        await mount('/', m.h(m.Shell, null, m.h('p', { 'data-action': 'page-body' }, 'x')));
        await settle();
        const header = all().find((n) => n.localName === 'header');
        const aside = all().find((n) => n.localName === 'aside');
        const bottom = all().find((n) => n.localName === 'nav' && classOf(n).includes('bottom-0'));
        const offset = all().find((n) => classOf(n).includes('md:ps-'));
        const spacer = all().find((n) => n.getAttribute('aria-hidden') === 'true' && classOf(n).includes('h-16'));
        const banner = all().find((n) => n.getAttribute('role') === 'alert' && n.textContent.includes('تعذّر تحميل النسخة الجديدة'));
        t.same([header, aside, bottom, spacer, banner].map((node) => underClass(node, 'print:hidden')), [true, true, true, true, true], 'S15: الشريط العلوي والجانبي والسفلي والفاصل وأشرطة التحديث print:hidden');
        t.ok(classOf(offset).includes('print:ps-0') && !underClass(byAction('page-body')[0], 'print:hidden'), 'S15: والصفحة تُطبع بلا إزاحة الشريط الجانبي');
      } finally {
        m.recoveryStore.set('idle');
      }
    });

    // ── S16: «حركات المادّة» في ملفّ المادّة ─────────────────────────────────────────────────────────────────────
    const W_EMPTY = '6bc1bee2-2e40-4a9f-8f96-0000000000b1';
    const W_FULL = '6bc1bee2-2e40-4a9f-8f96-0000000000b2';
    const fileWith = (stores) => ({
      today: OWN.today, can_record: false, can_edit: false,
      item: { id: 'i-corn', name: 'ذرة', kind: 'raw', base_unit: 'kg', density_kg_per_l: null, archived: false, tracks_expiry: false },
      on_hand_qty: '20000.000', purchased_qty: '0.000', purchases_count: 0, purchases: [], more: false, stores,
    });
    const store = (id, name, qty) => ({ warehouse_id: id, name, kind: 'raw', qty, available: qty, expired: '0.000' });
    const move = (seq, memo, qty, running) => ({ moveId: `mv-${seq}`, seq: BigInt(seq), movedOn: '2026-11-05', docKind: 'receipt', docId: `r-${seq}`, doc: `PU-2026-000${seq}`, memo, qty, running, lotId: `l-${seq}`, reversesMoveId: null, reversed: false, money: null });
    await step('S16', async () => {
      const { calls } = fresh(VIEWER, {
        loadItemMoves: (itemId, warehouseId, after) =>
          after === undefined
            ? { rows: [move(1, `شراء من مورّد الحبوب إلى ${warehouseId === W_FULL ? 'الثاني' : 'الأوّل'}`, 25_000_000n, 25_000_000n)], next: 7n, total: 2 }
            : { rows: [move(7, 'بيع إلى أبي أحمد', -5_000_000n, 20_000_000n)], next: null, total: 2 },
      }, { item_file: async () => fileWith([store(W_EMPTY, 'مخزن أ', '0.000'), store(W_FULL, 'مخزن ب', '20000.000')]) });
      await mount('/inventory/items/i-corn');
      const moves = byAction('file-moves')[0];
      t.ok(moves !== undefined && descendants(moves).some((n) => n.localName === 'h2' && n.textContent === 'حركات المادّة'), 'S16: قسم «حركات المادّة» لكلّ من يفتح الملفّ (المشاهد هنا)');
      t.same(byAction('moves-store').map((n) => [n.textContent, n.getAttribute('aria-pressed')]), [['مخزن أ', 'false'], ['مخزن ب', 'true']], 'S16: زرّ لكلّ مخزن، والأوّل بموجود مختار');
      t.same(named(calls, 'loadItemMoves'), [['i-corn', W_FULL]], 'S16: دفتر ذلك المخزن');
      t.ok(text().includes('شراء من مورّد الحبوب إلى الثاني') && headersIn(moves).includes('الرصيد (كغم)'), 'S16: الجدول القائم بالبيان والرصيد');
      await click(byAction('more-file-moves')[0]);
      t.same([named(calls, 'loadItemMoves').at(-1), text().includes('بيع إلى أبي أحمد'), byAction('more-file-moves').length], [['i-corn', W_FULL, 7n], true, 0], 'S16: «المزيد» بعد آخر رقم، ثمّ لا مزيد');
      await click(byAction('moves-store')[0]);
      t.same([named(calls, 'loadItemMoves').at(-1), text().includes('شراء من مورّد الحبوب إلى الأوّل'), text().includes('بيع إلى أبي أحمد')], [['i-corn', W_EMPTY], true, false], 'S16: مخزن آخر يقرأ دفتره من أوّله');
    });
    await step('S16-one', async () => {
      const { calls } = fresh(VIEWER, { loadItemMoves: () => ({ rows: [], next: null, total: 0 }) }, { item_file: async () => fileWith([store(W_FULL, 'مخزن ب', '20000.000')]) });
      await mount('/inventory/items/i-corn');
      t.same([byAction('moves-store').length, named(calls, 'loadItemMoves'), text().includes('في «مخزن ب»')], [0, [['i-corn', W_FULL]], true], 'S16: مخزن واحد: بلا أزرار، ويسمّيه');
    });
    await step('S16-none', async () => {
      const { calls } = fresh(VIEWER, {}, { item_file: async () => fileWith([]) });
      await mount('/inventory/items/i-corn');
      t.same([byAction('file-moves').length, named(calls, 'loadItemMoves').length], [0, 0], 'S16: بلا مخازن: بلا قسم ولا قراءة');
    });
    await step('S16-sold-out', async () => {
      // جواب القاعدة الحقيقي لمادّة بيعت كلّها (0022 move_stores): stores فارغة، ومخازن حركاتها فيها مخزنها برصيد صفر — فالقسم يظهر بدفتره.
      const gone = clone(F.item_file.owner_gone);
      const at = gone.move_stores[0];
      t.same([gone.stores.length, gone.move_stores.length, at.qty], [0, 1, '0.000'], 'S16: شرط العيّنة: بلا رصيد في أيّ مخزن، وحركات في مخزن واحد');
      const { calls } = fresh(MANAGER, { loadItemMoves: () => ({ rows: [], next: null, total: 0 }) }, { item_file: async () => gone });
      await mount(`/inventory/items/${gone.item.id}`);
      t.same([byAction('file-moves').length, named(calls, 'loadItemMoves'), text().includes(`في «${at.name}»`)], [1, [[gone.item.id, at.warehouse_id]], true], 'S16: مادّة نفدت: «حركات المادّة» تظهر بدفتر مخزنها (move_stores)');
    });

    // ── R: مراجعة الشاشات العدائية (0022) فيما بقي من الصفحة ───────────────────────────────────────────────────────
    const deferred = () => {
      let resolve;
      let reject;
      const promise = new Promise((ok, no) => {
        resolve = ok;
        reject = no;
      });
      return { promise, resolve, reject };
    };
    const inDialog = (action) => descendants(dialog() ?? body()).filter((n) => n.getAttribute('data-action') === action);
    const OTHER_NOTE = { text: 'كتبها المدير من جهاز آخر', version: 7_340_099 };
    const otherNoted = () => {
      const sample = clone(OWN);
      sample.sections[1].rows.find((row) => row.item_id === noted.item_id).note = { ...OTHER_NOTE };
      return sample;
    };
    const savedFor = (args) => ({ ...clone(F.set_day_note.saved), item_id: args.p_item, on: args.p_on, note: args.p_note ? { text: args.p_note, version: 7_340_100 } : null });
    // M1: نافذة ملاحظة فُتحت والجداول تُقرأ من جديد كانت تعرض نصّ القراءة القديمة وتكتب بنسخة القراءة الجديدة (تمحو ما لم يره).
    await step('R-M1', async () => {
      const reread = deferred();
      const { rpcCalls } = fresh(KEEPER, {}, {
        day_balance_sections: (args, n) => (n === 1 ? answer(OWN)(args) : reread.promise.then(() => answer(otherNoted())(args))),
        set_day_note: async (args) => savedFor(args),
      });
      await mount(urlAt(OWN));
      await click(withId('edit-note', plain.item_id));
      typeIn(byAction('note-text')[0], 'ناقصة كيس');
      await settle();
      await submitDialog();
      t.same([dialog(), named(rpcCalls, 'day_balance_sections').length], [undefined, 2], 'R-M1: حُفظت الأولى والأقسام تُقرأ من جديد');
      t.ok(byAction('edit-note').length > 0 && byAction('edit-note').every((n) => disabled(n)), 'R-M1: أثناء القراءة أزرار الملاحظات معطّلة');
      await click(withId('edit-note', noted.item_id));
      t.ok(dialog() === undefined, 'R-M1: فلا تُفتح نافذة على ملاحظة قديمة');
      reread.resolve();
      await settle();
      await settle();
      await click(withId('edit-note', noted.item_id));
      t.eq(byAction('note-text')[0]?.value, OTHER_NOTE.text, 'R-M1: بعد القراءة تُفتح بالملاحظة الحاليّة');
      typeIn(byAction('note-text')[0], `${OTHER_NOTE.text}، وأخرى`);
      await settle();
      await submitDialog();
      t.eq(named(rpcCalls, 'set_day_note').at(-1)?.p_expected_version, OTHER_NOTE.version, 'R-M1: والكتابة بشرط نسخة ما عرضته');
    });
    // R6: note_changed ثمّ فشلت القراءة: كانت تقول «الملاحظة الآن: …» بالقديمة وتعيد بنسختها.
    await step('R-R6', async () => {
      let notes = 0;
      const { rpcCalls } = fresh(KEEPER, {}, {
        day_balance_sections: (args, n) => (n === 1 ? answer(OWN)(args) : n === 2 ? Promise.reject(new m.UnknownOutcomeError('timeout')) : answer(otherNoted())(args)),
        set_day_note: async (args) => {
          notes += 1;
          if (notes === 1) throw new m.RejectedError(F.refusals.note_changed.code, F.refusals.note_changed.hint);
          return savedFor(args);
        },
      });
      await mount(urlAt(OWN));
      await click(withId('edit-note', noted.item_id));
      typeIn(byAction('note-text')[0], 'نصّ جديد');
      await settle();
      await submitDialog();
      await settle();
      const said = byAction('note-changed')[0]?.textContent ?? '';
      t.ok(!said.includes(`«${noted.note.text}»`) && said.includes('تعذّرت قراءة الملاحظة الحاليّة'), `R-R6: القراءة فشلت: لا «الملاحظة الآن» بالقديمة بل «تعذّرت قراءتها»: «${said}»`);
      t.ok(disabled(byAction('save-note')[0]) && byAction('erase-note').every((n) => disabled(n)), 'R-R6: ولا حفظ بشرط نسخة لم تُقرأ');
      await click(inDialog('note-reread')[0]);
      await settle();
      t.ok((byAction('note-changed')[0]?.textContent ?? '').includes(`الملاحظة الآن: «${OTHER_NOTE.text}»`), 'R-R6: «أعد القراءة» ثمّ تُعرض الملاحظة الحاليّة');
      await submitDialog();
      t.same(named(rpcCalls, 'set_day_note').map((args) => [args.p_note, args.p_expected_version]), [['نصّ جديد', noted.note.version], ['نصّ جديد', OTHER_NOTE.version]], 'R-R6: والإعادة بنسخة ما عُرض');
    });
    // R11: نتيجة مجهولة ثمّ «لا، تراجع»: لعلّها حُفظت، فالأقسام تُقرأ من جديد.
    await step('R-R11', async () => {
      const { rpcCalls } = fresh(KEEPER, {}, { day_balance_sections: answer(OWN), set_day_note: async () => { throw new m.UnknownOutcomeError('fetch_failed'); } });
      await mount(urlAt(OWN));
      await click(withId('edit-note', plain.item_id));
      typeIn(byAction('note-text')[0], 'ناقصة كيس');
      await settle();
      await submitDialog();
      await click(descendants(dialog()).find((n) => n.localName === 'button' && n.textContent === 'لا، تراجع'));
      if (byAction('dialog-discard')[0]) await click(byAction('dialog-discard')[0]);
      t.same([dialog(), named(rpcCalls, 'day_balance_sections').length], [undefined, 2], 'R-R11: إغلاق نافذة ملاحظة نتيجتها مجهولة يقرأ الأقسام من جديد');
    });
    // R5: القصّ بحروف الخادم نفسها (private.note_text)، لا trim() الذي لا يقصّ علامات الاتّجاه والحروف الصفرية.
    await step('R-R5', async () => {
      const RLM = String.fromCodePoint(0x200f);
      const { rpcCalls } = fresh(KEEPER, {}, { day_balance_sections: answer(OWN), set_day_note: async (args) => savedFor(args) });
      await mount(urlAt(OWN));
      await click(withId('edit-note', plain.item_id));
      typeIn(byAction('note-text')[0], `${RLM} `);
      await settle();
      await submitDialog();
      t.same([named(rpcCalls, 'set_day_note').length, dialog(), globalThis.__db.toasts.length], [0, undefined, 0], 'R-R5: علامة خفيّة وحدها لمادّة بلا ملاحظة: لا تُرسل ولا «مُسحت»');
      await click(withId('edit-note', plain.item_id));
      typeIn(byAction('note-text')[0], `${'م'.repeat(200)}${RLM}`);
      await settle();
      await submitDialog();
      t.same(named(rpcCalls, 'set_day_note').map((args) => args.p_note), ['م'.repeat(200)], 'R-R5: 200 حرف وعلامة اتّجاه بآخرها تُرسل مقصوصة كما يقصّها الخادم');
      const sql = readFileSync(path.join(ROOT, 'supabase', 'migrations', '0022_day_balance.sql'), 'utf8');
      const from = sql.indexOf('create or replace function private.note_text(');
      const codes = [...sql.slice(from, sql.indexOf('$$;', from)).matchAll(/chr\((\d+)\)/gu)].map((match) => Number(match[1]));
      t.same([codes.length > 30, [...(m.NOTE_SPACES ?? [])]], [true, codes], 'R-R5: حروف القصّ في الشاشة هي حروف private.note_text بالهجرة رقماً برقم');
    });
    // M3: التنبيه (fixed أعلى الصفحة، والخطر لا يختفي وحده) كان يُطبع فوق التقرير في كلّ صفحة.
    await step('R-M3', async () => {
      const built = await build({
        stdin: { contents: "export { createElement as h } from 'react'; export { createRoot } from 'react-dom/client'; export { flushSync } from 'react-dom'; export { Toaster, toast } from './src/components/ui/Toast.tsx';", resolveDir: ROOT, loader: 'tsx' },
        bundle: true, loader: { '.css': 'empty' }, write: false, format: 'esm', platform: 'node', target: 'node20', jsx: 'automatic', logLevel: 'silent',
        define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
      });
      const tm = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      const toastRoot = tm.createRoot(container);
      try {
        tm.flushSync(() => toastRoot.render(tm.h(tm.Toaster)));
        tm.toast({ tone: 'danger', title: 'تعذّرت المشاركة والنسخ على هذا الجهاز.' });
        await settle();
        const toaster = all().find((n) => n.hasAttribute('data-toaster'));
        t.ok(toaster !== undefined && underClass(toaster, 'print:hidden'), `R-M3: التنبيهات لا تُطبع (print:hidden): «${classOf(toaster)}»`);
      } finally {
        tm.flushSync(() => toastRoot.unmount());
      }
    });
    // P1: بعرض الهاتف عمود «الملاحظات» وزرّه خارج الشاشة. والجدول رسميّ الآن (رسالة الزبون 2026-11-26): بالحجم sm (ofc-sm: بلا عرض أدنى للنصّ والبيان
    // تحت 640، كورقة القاعة)، فيأخذ اسم المادّة ما بقي ويبقى الجدول في عرض الشاشة (مقيس بـChromium بعرض 390: بلا تمرير أفقيّ)، وزرّ الملاحظة أوّل خليّتها.
    await step('R-P1', async () => {
      fresh(KEEPER, {}, { day_balance_sections: answer(OWN) });
      await mount(urlAt(OWN));
      const table = descendants(section('feed')).find((n) => n.localName === 'table');
      const itemHead = descendants(section('feed')).find((n) => n.localName === 'th' && n.textContent === 'المادّة');
      const noteCell = withId('edit-note', noted.item_id)?.parentNode;
      const first = noteCell?.children.find((n) => n.nodeType === 1);
      t.same(
        [classOf(table).split(' ').includes('ofc-sm'), classOf(itemHead).includes('min-w-48'), first?.getAttribute('data-action')],
        [true, false, 'edit-note'],
        'R-P1: الجدول الرسميّ بالحجم sm بلا عرض أدنى، وزرّ الملاحظة قبل نصّها (أقرب إلى الرصيد)',
      );
    });
    // R7: «عدّل المادّة» من ملفّ فُتح من الرصيد اليومي كان يعود إلى الملفّ بلا طريق رجوعه.
    await step('R-R7', async () => {
      const gone = clone(F.item_file.owner_gone);
      fresh(MANAGER, { loadItemMoves: () => ({ rows: [], next: null, total: 0 }) }, { item_file: async () => gone });
      const dayView = urlAt(OWN);
      await mount(`/inventory/items/${gone.item.id}?${new URLSearchParams({ back: dayView }).toString()}`);
      const href = byAction('edit-item-file')[0]?.getAttribute('href') ?? '';
      const editBack = new URLSearchParams(href.split('?')[1] ?? '').get('back') ?? '';
      const fileBack = new URLSearchParams(editBack.split('?')[1] ?? '').get('back');
      t.same([editBack.split('?')[0], fileBack, m.backTarget(editBack, '/inventory')], [`/inventory/items/${gone.item.id}`, dayView, editBack], 'R-R7: «عدّل المادّة» يعود إلى الملفّ ومعه طريق رجوعه');
      const fileOf = (query) => `/inventory/items/${gone.item.id}?${query}`;
      t.same(
        [m.recipeBack(editBack), m.recipeBack(fileOf(`back=${encodeURIComponent('https://evil.example/')}`)), m.recipeBack(fileOf(`back=${encodeURIComponent(dayView)}&buy=1`)), m.recipeBack(fileOf('back=')), m.recipeBack(fileOf('buy=1')), m.backTarget('//evil.example/inventory', '/inventory')],
        [editBack, null, null, null, null, '/inventory'],
        'R-R7: نافذة «عدّل المادّة» تعود إلى الملفّ بطريقه، ولا تقبل رابطاً خارجياً ولا وسيطاً آخر',
      );
    });
    // R8: كلّ إعادة قراءة للملفّ (بعد أيّ عملية) كانت تطوي «حركات المادّة» إلى «جارٍ الفتح…» وتُسقط صفحات «المزيد».
    const mv = (id, memo, qty, running) => ({ moveId: `mv-${id}`, seq: 1n, movedOn: '2026-11-05', docKind: 'receipt', docId: `r-${id}`, doc: `PU-${id}`, memo, qty, running, lotId: `l-${id}`, reversesMoveId: null, reversed: false, money: null });
    await step('R-R8', async () => {
      const refile = deferred();
      const removes = deferred();
      let firsts = 0;
      const file = (archived) => ({ ...fileWith([store(W_FULL, 'مخزن ب', '20000.000')]), can_edit: true, item: { ...fileWith([]).item, archived, version: 1 } });
      fresh(MANAGER, {
        loadItem: () => ({ ...itemRow('i-corn', 'ذرة', null), archived: true }),
        setArchived: () => 2,
        loadItemMoves: (_item, _wh, after) => {
          if (after !== undefined) return { rows: [mv('b', 'بيع إلى أبي أحمد', -5_000_000n, 20_000_000n)], next: null, total: 2 };
          firsts += 1;
          const page = { rows: [mv('a', 'شراء من مورّد الحبوب', 25_000_000n, 25_000_000n)], next: 1n, total: 2 };
          return firsts === 1 ? page : removes.promise.then(() => page);
        },
      }, { item_file: (_args, n) => (n === 1 ? Promise.resolve(file(true)) : refile.promise.then(() => file(false))) });
      await mount('/inventory/items/i-corn');
      await click(byAction('more-file-moves')[0]);
      await click(byAction('show-item')[0]);
      await click(byAction('confirm-hide-item')[0]);
      refile.resolve();
      await settle();
      await settle();
      const shown = byAction('file-moves')[0]?.textContent ?? '';
      t.ok(shown.includes('شراء من مورّد الحبوب') && shown.includes('بيع إلى أبي أحمد') && !shown.includes('جارٍ الفتح'), `R-R8: إعادة قراءة الملفّ تُبقي الحركات المعروضة: «${shown.slice(0, 60)}»`);
      t.eq(byAction('more-file-moves').length, 0, 'R-R8: ولا «المزيد» على قائمة تُقرأ من جديد');
      removes.resolve();
      await settle();
      await settle();
      t.same([(byAction('file-moves')[0]?.textContent ?? '').includes('شراء من مورّد الحبوب'), byAction('more-file-moves').length], [true, 1], 'R-R8: ثمّ الصفحة الأولى الجديدة و«المزيد»');
    });
    // R9: الترقيم بالتاريخ (0022): حركة بتاريخ أقدم رُحّلت بين صفحتين تُعيد صفّاً معروضاً في التالية: التكرار بمعرّف الحركة يقرأ القائمة من أوّلها.
    const r9Moves = () => {
      let firsts = 0;
      return (_item, _wh, after) => {
        if (after === undefined) {
          firsts += 1;
          return firsts === 1
            ? { rows: [mv('a', 'حركة أ', 1_000_000n, 1_000_000n), mv('b', 'حركة ب', 1_000_000n, 2_000_000n)], next: 2n, total: 3 }
            : { rows: [mv('x', 'حركة س المؤرّخة قبل', 1_000_000n, 1_000_000n), mv('a', 'حركة أ', 1_000_000n, 2_000_000n), mv('b', 'حركة ب', 1_000_000n, 3_000_000n), mv('c', 'حركة ج', 1_000_000n, 4_000_000n)], next: null, total: 4 };
        }
        return { rows: [mv('b', 'حركة ب', 1_000_000n, 3_000_000n), mv('c', 'حركة ج', 1_000_000n, 4_000_000n)], next: null, total: null };
      };
    };
    const rowsWith = (memo) => all().filter((n) => n.localName === 'tr' && n.textContent.includes(memo)).length;
    await step('R-R9', async () => {
      const { calls } = fresh(VIEWER, { loadItemMoves: r9Moves() }, { item_file: async () => fileWith([store(W_FULL, 'مخزن ب', '3000.000')]) });
      await mount('/inventory/items/i-corn');
      await click(byAction('more-file-moves')[0]);
      await settle();
      await settle();
      t.same([rowsWith('حركة ب'), rowsWith('حركة س المؤرّخة قبل'), named(calls, 'loadItemMoves').length], [1, 1, 3], 'R-R9: صفحة تكرّر حركة معروضة: تُقرأ الحركات من أوّلها، بلا تكرار، ومعها الحركة الجديدة');
      t.ok(globalThis.__db.toasts.some((entry) => entry.title.includes('من أوّلها')), 'R-R9: ويُقال لماذا');
    });
    await step('R-R9-card', async () => {
      const setup = {
        divisions: [{ id: 'd-mill', kind: 'feed_mill', goLiveOn: '2026-10-01', frozen: true }],
        sites: [], packTypes: [], itemCategories: [], expenseCategories: [],
        warehouses: [{ id: 'w-raw', version: 1, archived: false, divisionId: 'd-mill', siteId: 's-mill', name: 'مخزن المواد الأوّلية', kind: 'raw' }],
      };
      const { calls } = fresh(KEEPER, {
        loadOrgSetup: () => setup,
        listItemUnits: () => [],
        loadItemLots: () => ({ item: { id: 'i-corn', name: 'ذرة', kind: 'raw', baseUnit: 'kg', tracksExpiry: false, minQty: null, density: null, pieceMassKg: null, archived: false }, rows: [], next: null, total: 0 }),
        loadItemMoves: r9Moves(),
      }, {});
      await mount('/inventory/items/i-corn/details?wh=w-raw&tab=moves');
      t.ok(byAction('more-moves').length === 1, 'R-R9 شرط: «المزيد» في دفتر البطاقة');
      await click(byAction('more-moves')[0]);
      await settle();
      await settle();
      t.same([rowsWith('حركة ب'), rowsWith('حركة س المؤرّخة قبل'), named(calls, 'loadItemMoves').length], [1, 1, 3], 'R-R9: وكذلك دفتر البطاقة: يُقرأ من أوّله، بلا تكرار');
    });

    // ── B: بطاقات المخزن بأقسامها ──────────────────────────────────────────────────────────────────────────────────
    const tile = (id, name, kind, onHand = '1000.000') => ({ id, name, kind, base_unit: 'kg', on_hand_qty: onHand, purchased_qty: onHand, last_purchase_on: '2026-11-05' });
    const BOARD = {
      today: OWN.today,
      can_record: true,
      can_add_item: true,
      items: [
        tile('i-corn', 'ذرة صفراء', 'raw', '69448.000'),
        tile('i-salt', 'ملح طعام', 'additive'),
        tile('i-starter', 'علف بادئ', 'feed', '3200.000'),
        tile('i-soy', 'كسبة صويا', 'raw'),
        tile('i-drug', 'مضادّ حيوي', 'medicine'),
      ],
    };
    const boardSection = (key) => byAction('board-section').find((n) => n.getAttribute('data-key') === key);
    const tilesIn = (key) => (boardSection(key) ? descendants(boardSection(key)).filter((n) => n.getAttribute('data-action') === 'open-item-file').map((n) => n.getAttribute('href').split('/').at(-1)) : null);
    await step('B1', async () => {
      fresh(MANAGER, {}, { items_overview: async () => clone(BOARD) });
      await mount('/inventory');
      t.same(byAction('board-section-title').map((n) => n.textContent), ['مواد العلف', 'العلف', 'أخرى'], 'B1: «مواد العلف» ثمّ «العلف» ثمّ «أخرى»');
      t.same(byAction('board-section-count').map((n) => n.textContent), ['3 موادّ', 'مادّة واحدة', 'مادّة واحدة'], 'B1: عدد كلّ قسم بالفصحى');
      t.same([tilesIn('feed_materials'), tilesIn('feed'), tilesIn('other')], [['i-corn', 'i-salt', 'i-soy'], ['i-starter'], ['i-drug']], 'B1: raw وadditive في «مواد العلف»، وfeed في «العلف»، والباقي في «أخرى»، بترتيب القراءة');
      t.same(byAction('add-section-item').map((n) => [n.getAttribute('data-kind'), under(n, boardSection(n.getAttribute('data-kind') === 'raw' ? 'feed_materials' : 'feed')), classOf(n).includes('h-11')]), [['raw', true, true], ['feed', true, true]], 'B1: «أضف مادّة» داخل قسمي العلف (بارتفاع الإصبع)، لا في «أخرى»');
      t.eq(all().filter((n) => n.localName === 'details' && descendants(n).some((child) => child.localName === 'details')).length, 0, 'B1: لا قائمة داخل قائمة');
    });
    await step('B1-hidden', async () => {
      fresh(MANAGER, {}, { items_overview: async () => ({ ...clone(BOARD), items: clone(BOARD.items).filter((item) => item.kind === 'raw') }) });
      await mount('/inventory');
      t.same([byAction('board-section-title').map((n) => n.textContent), boardSection('other')], [['مواد العلف', 'العلف'], undefined], 'B1: «أخرى» بلا موادّ لا تُعرض');
      t.same([byAction('board-section-count')[1]?.textContent, byAction('board-section-empty').length], ['لا موادّ', 1], 'B1: و«العلف» الفارغ يبقى بعدده وجملته');
    });
    await step('B1-viewer', async () => {
      fresh(VIEWER, {}, { items_overview: async () => ({ ...clone(BOARD), can_record: false, can_add_item: false }) });
      await mount('/inventory');
      t.same([byAction('board-section').length, byAction('add-section-item').length, byAction('add-item').length], [3, 0, 0], 'B1: بلا item.create: الأقسام بلا «أضف مادّة»');
    });
    await step('B2-search', async () => {
      fresh(MANAGER, {}, { items_overview: async () => clone(BOARD) });
      await mount('/inventory');
      typeIn(byAction('search-board')[0], 'علف');
      await settle();
      t.same([byAction('board-section-title').map((n) => n.textContent), tilesIn('feed')], [['العلف'], ['i-starter']], 'B2: البحث يصفّي عبر الأقسام، وقسم بلا مطابقة يغيب أثناءه');
      typeIn(byAction('search-board')[0], 'ص');
      await settle();
      t.same([byAction('board-section-title').map((n) => n.textContent), tilesIn('feed_materials')], [['مواد العلف'], ['i-corn', 'i-soy']], 'B2: ومطابقات قسم واحد');
      typeIn(byAction('search-board')[0], 'قمح');
      await settle();
      t.same([byAction('board-section').length, text().includes('لا مادّة باسم «قمح»'), byAction('add-searched-item').length], [0, true, 1], 'B2: بحث بلا نتيجة يقول ذلك ويقترح الإضافة');
      typeIn(byAction('search-board')[0], '');
      await settle();
      t.eq(byAction('board-section').length, 3, 'B2: مسح البحث يعيد الأقسام كلّها');
    });
    await step('B3-preset', async () => {
      const created = [];
      const { calls } = fresh(MANAGER, {
        findItemTwins: () => [],
        createItem: (fields) => {
          created.push(fields);
          return itemRow('i-new', fields.name, null, fields.kind);
        },
      }, { items_overview: async () => clone(BOARD), item_file: async () => ({ ...fileWith([]), item: { ...fileWith([]).item, id: 'i-new', name: 'علف ناهي', kind: 'feed' } }) });
      await mount('/inventory');
      await click(byAction('add-section-item').find((n) => n.getAttribute('data-kind') === 'raw'));
      t.same([dialogTitle(), chosenKind()], ['أضف مادّة', 'raw'], 'B3: «أضف مادّة» في «مواد العلف» تبدأ بـ«مادّة للمعمل»');
      await click(descendants(dialog()).find((n) => n.localName === 'button' && n.textContent === 'لا، تراجع'));
      await click(byAction('add-section-item').find((n) => n.getAttribute('data-kind') === 'feed'));
      t.same([chosenKind(), byAction('simple-item-kind')[0]?.options.find((o) => o.selected === true)?.textContent], ['feed', 'علف جاهز'], 'B3: و«أضف مادّة» في «العلف» تبدأ بـ«علف جاهز»');
      typeIn(byAction('simple-item-name')[0], 'علف ناهي');
      await settle();
      await submitDialog();
      await settle();
      t.same([named(calls, 'createItem').length, created[0]?.kind, created[0]?.name, where?.pathname], [1, 'feed', 'علف ناهي', '/inventory/items/i-new'], 'B3: الحفظ يُنشئ المادّة بنوع القسم ويفتح ملفّها');
      await unmount();
      fresh(MANAGER, { findItemTwins: () => [] }, { items_overview: async () => clone(BOARD) });
      await mount('/inventory');
      await click(byAction('add-item')[0]);
      t.eq(chosenKind(), 'raw', 'B3: و«أضف مادّة» في رأس الصفحة كما كانت (مادّة للمعمل)');
    });
  } finally {
    if (root) {
      const mounted = root;
      root = null;
      try {
        mounted.unmount();
      } catch {
        /* swallow-ok: تنظيف بعد رمية */
      }
    }
    if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator);
    else delete globalThis.navigator;
    delete globalThis.__db;
    restore();
  }
}
