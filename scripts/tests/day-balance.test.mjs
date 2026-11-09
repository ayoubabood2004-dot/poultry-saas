// «الرصيد اليومي» (0022، كلمة المالك 2026-11-09 بصورة ورقته «رصيد مواد العلف — 4/11/2026»؛ عقد scratchpad/daybal/contract-0022.md «Screens»):
// react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل StockRoutes الحقيقية والقشرة، وrepo/dayBalance الحقيقي (المحلّلات وبناء النداءات) على core
// بديل يسجّل كلّ نداء ويجيب بأجوبة القاعدة (fixtures/day-balance-0022.json: بالمفاتيح التي تكتبها اختبارات القاعدة، ويقرأ هذا الفحص قيمه منها لا
// من نصوص بخطّ اليد)، وrepo المخزون والجلسة والتنبيه بدائل. الحالات:
// P المحلّلات بكلّ عيّنة (الكمية بالآلاف، والملاحظة ونسختها، والخانات التي تأتي null) وصرامتها؛
// S1 المفتاح «البطاقات | الرصيد اليومي» والرابط (?view=day ثمّ أوّل تصنيف بلا خطوة رجوع، والبطاقات لا تقرأ الرصيد ولا العكس)؛ S2 التصنيفات و«كل المواد»؛
// S3 السهمان (الأيمن «اليوم السابق»)، و«اليوم التالي» معطّل عند اليوم، و«اليوم»، والتاريخ بالكتابة (لا بعد اليوم)؛ S4 الأعمدة كورقة المالك والصفر «-»؛
// S5 الوحدة في رأس «الرصيد» أو عمود «الوحدة»؛ S6 رابط المادّة بـ?back= إلى العرض نفسه وزرّ الرجوع في ملفّها؛ S7 الملاحظة: النصّ واليوم والنسخة التي
// رآها (null بلا ملاحظة)، والمسح، وnote_changed (يقول ويقرأ من جديد ويُبقي ما كُتب، والإعادة بالنسخة الجديدة)، والطول؛ S8 «أدرج مواد» بترتيبها
// و«في «س»» والنداء بالقائمة كلّها؛ S9 «تصنيف جديد» ثمّ موادّه، والاسم المكرّر؛ S10 الطباعة (window.print، والتقرير وحده يُطبع)؛ S11 المشاركة
// (navigator.share بالعنوان والنصّ، وإلّا النسخ، وإلغاء نافذة المشاركة بلا رسالة)؛ S12 الفراغ (لا تصنيف، وتصنيف بلا موادّ) والمشاهد والمحاسب بلا
// ملاحظة ولا «أدرج»؛ S13 المخزن من قائمة حين يتعدّد وحده؛ S14 رفض day_in_future بتلميحه وزرّ «اليوم»؛ S15 القشرة print:hidden؛ S16 «حركات المادّة»
// في ملفّ المادّة (المخازن، والمخزن الأوّل بموجود، و«المزيد»).
// وتحديث العقد بعد مراجعة القاعدة: category.members (كلّ موادّ التصنيف بترتيبه) تبدأ منها «أدرج مواد» بأسمائها (قراءة واحدة لـitems، ولو لم يُظهرها
// الجدول) وهي p_expected_items؛ وcategory_changed يُقال ويُقرأ التصنيف من جديد ويبقى الاختيار (S8-changed)؛ ولا مخزن في النطاق: لا جدول ولا طباعة ولا
// مشاركة (S12-no-stores)، وموادّ لا تُخزَّن هنا غير تصنيف فارغ (S12-unstored)؛ وout_of_scope لملاحظة مادّة خارج مخازن الكاتب (S7-scope)؛ والنسخ أرقام
// تسلسل.
// شروط العيّنات (تُفحص أوّلاً، فعيّنة لا تحقّقها تفشل باسمها): owner_feed تصنيف بموادّ بوحدة واحدة، فيها صفر وملاحظة وغير صفر، ويومها قبل اليوم، ولها
// أكثر من مخزن وتصنيفان فأكثر، والمدير يكتب ويدير؛ owner_all لكلّ المواد بتصنيفات؛ mixed_units بوحدتين فأكثر؛ storekeeper يكتب ولا يدير؛ viewer لا
// يكتب ولا يدير؛ empty_category تصنيف بلا موادّ؛ no_categories بلا تصنيفات؛ وصفوف كلّ تصنيف من members وبترتيبها.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const F = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'day-balance-0022.json'), 'utf8'));
const DB = F.day_balance;
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
// repo الحقيقي يبني النداء ويقرأ الجواب؛ core بديل له وحده يسجّل النداء ويجيب: call للدوالّ، وsend لقراءة جدول بسلسلة PostgREST مسجَّلة
// (from/select/eq/is) يجيبها globalThis.__db.tables باسم الجدول.
const CORE_FOR = /src\/lib\/repo\/(?:dayBalance|purchases)\.ts$/u;
const CORE = [
  'export const call = async (fn, args) => globalThis.__db.rpc(fn, args);',
  'export const send = async (make) => ({ result: await make(globalThis.__db.db()), wasOnline: true });',
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
    "export { Shell } from './src/components/shell/Shell.tsx';",
    "export { recoveryStore } from './src/lib/pwa/recovery.ts';",
    "export { parseDayBalance, parseDayNote, parseCategoryItems } from './src/lib/repo/dayBalance.ts';",
    "export { RowShapeError } from './src/lib/repo/inventory.ts';",
    "export { dayParams, dayUrl, shareText } from './src/pages/inventory/DayBalanceView.tsx';",
    "export { backTarget } from './src/components/ui/BackButton.tsx';",
    "export { baseQty } from './src/pages/inventory/simple-shared.ts';",
    "export { columnDecimals, fmtQtyCell } from './src/lib/format.ts';",
    "export { onlineStore } from './src/lib/online.ts';",
    "export { RejectedError, UnknownOutcomeError } from './src/lib/errors.ts';",
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
const choose = (select, value) => {
  select.value = value;
  fire(select, 'change');
};
const tick = (box) => {
  box.checked = !box.checked;
  fire(box, 'click');
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
const headers = () => all().filter((n) => n.localName === 'th' && n.getAttribute('scope') === 'col').map((n) => n.textContent);
const bodyRows = () => {
  const tbody = all().find((n) => n.localName === 'tbody');
  return tbody ? tbody.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent)) : [];
};
const radio = (label) => all().find((n) => n.getAttribute('role') === 'radio' && n.textContent === label);
const chip = (id) => byAction('day-category').find((n) => n.getAttribute('data-id') === id);
const withId = (action, id) => byAction(action).find((n) => n.getAttribute('data-id') === id);

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
const ws = (role, over = {}) => ({
  userId: `u-${role}`, orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [],
  divisions: ['feed_mill', 'general'], canSeeCost: ['owner', 'manager', 'accountant'].includes(role), canSeeAccounts: ['owner', 'manager', 'accountant'].includes(role), canSeeSales: false,
  invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const MANAGER = { status: 'ready', workspace: ws('manager') };
const KEEPER = { status: 'ready', workspace: ws('storekeeper', { scopes: [{ warehouseId: 'w-raw' }] }) };
const VIEWER = { status: 'ready', workspace: ws('viewer') };
const ACCOUNTANT = { status: 'ready', workspace: ws('accountant') };

/** جواب day_balance كما تحسبه القاعدة لليوم المطلوب (on = p_on أو اليوم) والمخزن المطلوب (اسمه من stores). */
const answer = (sample) => async (args) => {
  const json = clone(sample);
  json.on = args.p_on ?? json.today;
  const store = json.stores.find((entry) => entry.id === args.p_warehouse);
  json.warehouse = store ? { id: store.id, name: store.name } : null;
  return json;
};
const itemRow = (id, name, categoryId) => ({ id, version: 1, archived: false, name, nameNorm: name, categoryId, kind: 'raw', baseUnit: 'kg', density: null, pieceMassKg: null, tracksExpiry: false, scaleStep: 1n, minQty: null, barcode: null, altCodes: [] });

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
    const fresh = (session, handlers = {}, rpcs = {}, tables = {}) => {
      const calls = [];
      const rpcCalls = [];
      const reads = [];
      globalThis.__db = {
        session,
        toasts: [],
        /** سلسلة PostgREST تسجّل القراءة كما بُنيت، وتجيب بما يرجّعه tables[الجدول] (أو لا تجيب أبداً). */
        db() {
          const query = { table: null, ops: [] };
          const chain = {
            from(table) {
              query.table = table;
              return chain;
            },
            select(columns) {
              query.ops.push(['select', columns]);
              return chain;
            },
            eq(column, value) {
              query.ops.push(['eq', column, value]);
              return chain;
            },
            is(column, value) {
              query.ops.push(['is', column, value]);
              return chain;
            },
            then(resolve, reject) {
              reads.push(query);
              const handler = tables[query.table];
              const answer = handler ? Promise.resolve().then(() => handler(query, reads.filter((read) => read.table === query.table).length)).then((data) => ({ data, error: null, status: 200 })) : new Promise(() => {});
              return answer.then(resolve, reject);
            },
          };
          return chain;
        },
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
      return { calls, rpcCalls, reads };
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
    const dayUrlOf = (sample, over = {}) => `/inventory?${new URLSearchParams({ view: 'day', cat: sample.category ? sample.category.id : 'all', ...over }).toString()}`;
    /** رابط العيّنة بيومها (بلا day إن كان يومها اليوم): الجواب المعاد يحمل يومها نفسه أيّاً كان يوم التقاطها. */
    const urlAt = (sample) => dayUrlOf(sample, sample.on === sample.today ? {} : { day: sample.on });

    // ── شروط العيّنات ───────────────────────────────────────────────────────────────────────────────────────────────
    const FEED = DB.owner_feed;
    const units = (sample) => [...new Set(sample.rows.map((row) => row.base_unit))];
    const zeroRow = FEED.rows.find((row) => milli(row.qty) === 0n);
    const noteRow = FEED.rows.find((row) => row.note);
    const plainRow = FEED.rows.find((row) => !row.note && milli(row.qty) !== 0n) ?? FEED.rows.find((row) => !row.note);
    t.same(
      [Boolean(FEED.category), units(FEED).length, Boolean(zeroRow), Boolean(noteRow), Boolean(plainRow), FEED.rows.some((row) => milli(row.qty) !== 0n), FEED.on < FEED.today, FEED.stores.length > 1, FEED.categories.length > 1, FEED.can_note, FEED.can_manage],
      [true, 1, true, true, true, true, true, true, true, true, true],
      'شرط owner_feed: تصنيف بموادّ بوحدة واحدة، فيها صفر وملاحظة وأخرى بلا ملاحظة وغير صفر، ويومه قبل اليوم، بمخزنين وتصنيفين فأكثر، والمدير يكتب ويدير',
    );
    t.same([DB.owner_all.category, DB.owner_all.categories.length > 0], [null, true], 'شرط owner_all: كلّ المواد بتصنيفات');
    t.ok(units(DB.mixed_units).length > 1, 'شرط mixed_units: وحدتان فأكثر');
    t.same([DB.storekeeper.can_note, DB.storekeeper.can_manage, DB.storekeeper.rows.some((row) => !row.note)], [true, false, true], 'شرط storekeeper: يكتب الملاحظة ولا يدير، وله مادّة بلا ملاحظة');
    t.same([DB.viewer.can_note, DB.viewer.can_manage, DB.viewer.rows.length > 0], [false, false, true], 'شرط viewer: لا يكتب ولا يدير');
    t.same([Boolean(DB.empty_category.category), DB.empty_category.rows.length, DB.empty_category.can_manage], [true, 0, true], 'شرط empty_category: تصنيف بلا موادّ (والمدير)');
    t.same([DB.no_categories.categories.length, DB.no_categories.category, DB.no_categories.can_manage], [0, null, true], 'شرط no_categories: بلا تصنيفات (والمدير)');
    t.same([F.set_day_note.saved.note !== null, F.set_day_note.cleared.note], [true, null], 'شرط set_day_note: محفوظة وممسوحة');
    t.same([F.refusals.note_changed.code, F.refusals.day_in_future.code, Boolean(F.refusals.note_changed.hint), Boolean(F.refusals.day_in_future.hint)], ['note_changed', 'day_in_future', true, true], 'شرط الرفضين بتلميحهما');
    // members كلّ موادّ التصنيف بترتيبه، والجدول منها وحدها وبترتيبها (ما لا يُخزَّن في النطاق يغيب منه لا من members)؛ وإلّا اختلف ترتيب الجدول عن
    // ترتيب نافذة «أدرج مواد».
    for (const [name, sample] of Object.entries(DB).filter(([, sample]) => sample.category)) {
      const members = sample.category.members;
      const positions = sample.rows.map((row) => members.indexOf(row.item_id));
      t.ok(Array.isArray(members) && positions.every((at, index) => at >= 0 && (index === 0 || at > positions[index - 1])), `شرط ${name}: الصفوف من category.members وبترتيبها`);
    }
    // رفضا التحديث (category_changed وout_of_scope) من العيّنة إن حضرا، وإلّا بتلميح مكتوب هنا.
    const REFUSE = {
      category_changed: F.refusals.category_changed ?? { code: 'category_changed', hint: 'تغيّرت موادّ هذا التصنيف بعد أن فتحت النافذة.' },
      out_of_scope: F.refusals.out_of_scope ?? { code: 'out_of_scope', hint: 'لا تُخزَّن هذه المادّة في شيء من مخازن نطاقك.' },
    };

    // ── P: المحلّلات الحقيقية بأجوبة القاعدة ────────────────────────────────────────────────────────────────────────
    for (const [name, sample] of Object.entries(DB)) {
      const parsed = m.parseDayBalance(clone(sample));
      const categoryOf = (value) => (value ? [value.id, value.name, [...value.members]] : null);
      const ref = (value) => (value ? [value.id, value.name] : null);
      t.same(
        [parsed.today, parsed.on, categoryOf(parsed.category), ref(parsed.warehouse), parsed.canNote, parsed.canManage, parsed.stores.map((s) => [s.id, s.name, s.kind]), parsed.categories.map((c) => [c.id, c.name, c.items])],
        [sample.today, sample.on, categoryOf(sample.category), ref(sample.warehouse), sample.can_note, sample.can_manage, sample.stores.map((s) => [s.id, s.name, s.kind]), sample.categories.map((c) => [c.id, c.name, c.items])],
        `P ${name}: اليوم والتصنيف بموادّه (members) والمخزن والصلاحيتان والمخازن والتصنيفات`,
      );
      t.same(
        parsed.rows.map((row) => [row.itemId, row.name, row.kind, row.baseUnit, row.qty, row.note]),
        sample.rows.map((row) => [row.item_id, row.name, row.kind, row.base_unit, milli(row.qty), row.note ? { text: row.note.text, version: row.note.version } : null]),
        `P ${name}: الصفوف بالكمية بالآلاف والملاحظة ونسختها`,
      );
    }
    {
      const row0 = FEED.rows[0];
      const bad = (patch, rowPatch = null) => () => m.parseDayBalance({ ...clone(FEED), ...patch, ...(rowPatch ? { rows: [{ ...clone(row0), ...rowPatch }] } : {}) });
      t.throws(bad({}, { qty: null }), 'P صرامة: كمية null');
      t.throws(bad({}, { qty: '1.2345' }), 'P صرامة: كمية بأربع مراتب');
      t.throws(bad({}, { note: { text: '', version: 1 } }), 'P صرامة: ملاحظة فارغة');
      t.throws(bad({}, { note: { text: 'x', version: 0 } }), 'P صرامة: نسخة صفر');
      t.throws(bad({}, { base_unit: 'ton' }), 'P صرامة: وحدة غير معروفة');
      t.throws(bad({ on: '2026-13-01' }), 'P صرامة: يوم غير موجود');
      t.throws(bad({ can_note: undefined }), 'P صرامة: can_note غائب');
      t.throws(bad({ categories: [{ id: 'c', name: 'x', items: -1 }] }), 'P صرامة: عدد سالب');
      t.throws(bad({ category: { id: FEED.category.id, name: FEED.category.name } }), 'P صرامة: التصنيف بلا members');
      t.throws(bad({ category: { ...clone(FEED.category), members: [1] } }), 'P صرامة: members بغير معرّفات');
      const large = m.parseDayBalance({ ...clone(FEED), rows: [{ ...clone(row0), note: { text: 'x', version: 9_007_199 } }] });
      t.eq(large.rows[0].note?.version, 9_007_199, 'P النسخة رقم من تسلسل كما هو (لا عدّاد يبدأ من 1)');
      const nullable = m.parseDayBalance({ ...clone(FEED), category: null, warehouse: undefined, rows: [{ ...clone(row0), note: undefined }] });
      t.same([nullable.category, nullable.warehouse, nullable.rows[0].note], [null, null, null], 'P الخانات التي تأتي null أو تغيب تُقرأ null');
      let shapeError = null;
      try {
        bad({}, { qty: null })();
      } catch (error) {
        shapeError = error;
      }
      t.ok(shapeError instanceof m.RowShapeError, 'P الخطأ RowShapeError (خطأ شكل، لا جدول يُعرض خطأً)');
      const saved = m.parseDayNote(clone(F.set_day_note.saved));
      t.same([saved.itemId, saved.on, saved.note], [F.set_day_note.saved.item_id, F.set_day_note.saved.on, { text: F.set_day_note.saved.note.text, version: F.set_day_note.saved.note.version }], 'P set_day_note المحفوظة');
      t.eq(m.parseDayNote(clone(F.set_day_note.cleared)).note, null, 'P set_day_note الممسوحة: note = null');
      const put = F.set_category_items.manager;
      t.same(m.parseCategoryItems(clone(put)), { categoryId: put.category_id, count: put.count, moved: put.moved, removed: put.removed }, 'P set_category_items');
      t.throws(() => m.parseCategoryItems({ ...clone(put), moved: null }), 'P صرامة: moved null');
      // الرابط: ما لا يصلح كأنّه غائب، والعرض نفسه رابط رجوع يقبله ملفّ المادّة.
      const params = m.dayParams(new URLSearchParams({ cat: 'x; drop', day: '2026-02-30', store: 'nope' }));
      t.same(params, { cat: null, day: null, store: null }, 'الرابط: معرّف مكسور ويوم غير موجود يُهملان');
      const url = m.dayUrl({ cat: FEED.category.id, day: FEED.on, store: FEED.stores[0].id });
      t.same([m.backTarget(url, '/inventory'), m.dayParams(new URLSearchParams(url.split('?')[1]))], [url, { cat: FEED.category.id, day: FEED.on, store: FEED.stores[0].id }], 'الرابط: backTarget يقبل رابط العرض ويعود منه كما هو');
    }

    const overviewOk = { items_overview: async () => ({ today: FEED.today, can_record: true, can_add_item: true, items: [] }) };
    const byCategory = (args) => Object.values(DB).find((sample) => (sample.category?.id ?? null) === args.p_category && (args.p_category !== null || sample.categories.length > 0)) ?? FEED;

    // ── S1: المفتاح والرابط ─────────────────────────────────────────────────────────────────────────────────────────
    await step('S1', async () => {
      const { rpcCalls } = fresh(MANAGER, {}, { ...overviewOk, day_balance: async (args) => answer(args.p_category === null ? DB.owner_all : byCategory(args))(args) });
      await mount('/inventory');
      t.same(
        all().filter((n) => n.getAttribute('role') === 'radio').map((n) => [n.textContent, n.getAttribute('aria-checked')]),
        [['البطاقات', 'true'], ['الرصيد اليومي', 'false']],
        'S1: مفتاح بخيارين، والبطاقات افتراضاً',
      );
      t.same([named(rpcCalls, 'items_overview').length, named(rpcCalls, 'day_balance').length], [1, 0], 'S1: البطاقات تقرأ items_overview وحده');
      await click(radio('الرصيد اليومي'));
      await settle();
      const first = DB.owner_all.categories[0].id;
      t.same([where?.pathname, search()], ['/inventory', { view: 'day', cat: first }], 'S1: ?view=day ثمّ أوّل تصنيف صريحاً في الرابط');
      t.same(named(rpcCalls, 'day_balance'), [{ p_category: null, p_on: null, p_warehouse: null }, { p_category: first, p_on: null, p_warehouse: null }], 'S1: day_balance بمفاتيحه الثلاثة: كلّ المواد ثمّ أوّل تصنيف');
      t.same([named(rpcCalls, 'items_overview').length, radio('الرصيد اليومي')?.getAttribute('aria-checked'), byAction('day-view').length, byAction('search-board').length], [1, 'true', 1, 0], 'S1: العرض اليومي بلا قراءة البطاقات ولا بحثها');
      t.ok(chip(first)?.getAttribute('aria-pressed') === 'true', 'S1: والتصنيف الأوّل مختار');
      await click(radio('البطاقات'));
      t.same([where?.search, byAction('day-view').length, named(rpcCalls, 'items_overview').length], ['', 0, 2], 'S1: «البطاقات» يعيد /inventory بلا وسائط والبطاقات كما كانت');
    });
    await step('S1-all', async () => {
      const { rpcCalls } = fresh(MANAGER, {}, { day_balance: answer(DB.owner_all) });
      await mount('/inventory?view=day&cat=all');
      t.same([named(rpcCalls, 'day_balance'), search().cat, byAction('day-title')[0]?.textContent], [[{ p_category: null, p_on: null, p_warehouse: null }], 'all', 'رصيد كلّ المواد'], 'S1: cat=all: كلّ المواد بلا انتقال');
      t.ok(chip('all')?.getAttribute('aria-pressed') === 'true', 'S1: و«كل المواد» مختار');
    });

    // ── S2: التصنيفات ───────────────────────────────────────────────────────────────────────────────────────────────
    await step('S2', async () => {
      const { rpcCalls } = fresh(MANAGER, {}, { day_balance: async (args) => answer(byCategory(args))(args) });
      await mount(dayUrlOf(FEED, { day: FEED.on }));
      t.same(byAction('day-category').map((n) => n.textContent), [...FEED.categories.map((c) => c.name), 'كل المواد'], 'S2: كلّ تصنيف باسمه ثمّ «كل المواد»');
      t.same(byAction('day-category').filter((n) => n.getAttribute('aria-pressed') === 'true').map((n) => n.getAttribute('data-id')), [FEED.category.id], 'S2: المختار تصنيف العرض');
      const other = FEED.categories.find((c) => c.id !== FEED.category.id);
      const before0 = [where?.key, named(rpcCalls, 'day_balance').length];
      await click(chip(FEED.category.id));
      t.same([where?.key, named(rpcCalls, 'day_balance').length], before0, 'S2: التصنيف المعروض نفسه لا خطوة ولا قراءة');
      await click(chip(other.id));
      t.same([search(), named(rpcCalls, 'day_balance').at(-1)], [{ view: 'day', cat: other.id, day: FEED.on }, { p_category: other.id, p_on: FEED.on, p_warehouse: null }], 'S2: تصنيف آخر بيومه نفسه');
      await click(chip('all'));
      t.same([search().cat, named(rpcCalls, 'day_balance').at(-1)], ['all', { p_category: null, p_on: FEED.on, p_warehouse: null }], 'S2: «كل المواد» بـp_category فارغ');
      const reads = named(rpcCalls, 'day_balance').length;
      await click(radio('الرصيد اليومي'));
      t.same([search(), named(rpcCalls, 'day_balance').length], [{ view: 'day', cat: 'all', day: FEED.on }, reads], 'S2: النقر على «الرصيد اليومي» وهو مختار لا يمسح التصنيف واليوم');
    });

    // ── S3: الأيام ──────────────────────────────────────────────────────────────────────────────────────────────────
    await step('S3', async () => {
      const { rpcCalls } = fresh(MANAGER, {}, { day_balance: answer(FEED) });
      await mount(dayUrlOf(FEED, { day: FEED.on }));
      const prev = byAction('day-prev')[0];
      const next = byAction('day-next')[0];
      t.same([prev?.textContent, next?.textContent, byAction('day-pick')[0]?.textContent, disabled(next), byAction('day-today').length], ['اليوم السابق', 'اليوم التالي', fmt(FEED.on), false, 1], 'S3: «اليوم السابق» والتاريخ و«اليوم التالي»، و«اليوم» ليوم مضى');
      // بالعربية السهم الأيمن إلى الخلف: أيقونة «اليوم السابق» قبل نصّه، و«اليوم التالي» نصّه ثمّ سهمه الأيسر.
      t.same([prev?.firstChild?.getAttribute?.('class')?.includes('lucide-chevron-right'), next?.lastChild?.getAttribute?.('class')?.includes('lucide-chevron-left')], [true, true], 'S3: → قبل «اليوم السابق» و← بعد «اليوم التالي»');
      t.ok(before(prev, byAction('day-pick')[0]) && before(byAction('day-pick')[0], next), 'S3: السابق ثمّ التاريخ ثمّ التالي (من اليمين)');
      await click(prev);
      t.same([search().day, named(rpcCalls, 'day_balance').at(-1)?.p_on, byAction('day-pick')[0]?.textContent], [shift(FEED.on, -1), shift(FEED.on, -1), fmt(shift(FEED.on, -1))], 'S3: «اليوم السابق» يقرأ اليوم قبله');
      await click(byAction('day-next')[0]);
      await click(byAction('day-next')[0]);
      t.same([search().day, named(rpcCalls, 'day_balance').at(-1)?.p_on], [shift(FEED.on, 1), shift(FEED.on, 1)], 'S3: «اليوم التالي» مرّتين');
      await click(byAction('day-today')[0]);
      t.same([search().day, named(rpcCalls, 'day_balance').at(-1)?.p_on, byAction('day-today').length, disabled(byAction('day-next')[0]), byAction('day-pick')[0]?.textContent], [undefined, null, 0, true, fmt(FEED.today)], 'S3: «اليوم»: بلا day في الرابط، و«اليوم التالي» معطّل، ولا «اليوم»');
      await click(byAction('day-prev')[0]);
      await click(byAction('day-next')[0]);
      t.same([search().day, named(rpcCalls, 'day_balance').at(-1)?.p_on], [undefined, null], 'S3: العودة إلى اليوم بالسهم تُسقط day من الرابط');
    });
    await step('S3-pick', async () => {
      const { rpcCalls } = fresh(MANAGER, {}, { day_balance: answer(FEED) });
      await mount(dayUrlOf(FEED, { day: FEED.on }));
      await click(byAction('day-pick')[0]);
      const input = all().find((n) => n.localName === 'input' && n.id.endsWith('-day'));
      t.same([dialogTitle(), input?.value], ['اعرض رصيد يوم آخر', fmt(FEED.on)], 'S3: النقر على التاريخ يفتح حقل اليوم بالتاريخ المعروض');
      typeIn(input, fmt(shift(FEED.today, 1)));
      await submitDialog();
      t.ok(text().includes('التاريخ بعد اليوم.') && dialog() !== undefined, 'S3: يوم بعد اليوم يُرفض بالنافذة');
      typeIn(all().find((n) => n.localName === 'input' && n.id.endsWith('-day')), '31/02/2026');
      await submitDialog();
      t.ok(text().includes('اكتب التاريخ يوم/شهر/سنة'), 'S3: يوم غير موجود يُرفض');
      const target = shift(FEED.on, -10);
      typeIn(all().find((n) => n.localName === 'input' && n.id.endsWith('-day')), fmt(target));
      await submitDialog();
      t.same([dialog(), search().day, named(rpcCalls, 'day_balance').at(-1)?.p_on], [undefined, target, target], 'S3: يوم مكتوب يُعرض');
    });

    // ── S4/S5: الأعمدة والصفر والوحدة ──────────────────────────────────────────────────────────────────────────────
    await step('S4', async () => {
      fresh(MANAGER, {}, { day_balance: answer(FEED) });
      await mount(dayUrlOf(FEED, { day: FEED.on }));
      t.same(headers(), ['ت', 'المادّة', `الرصيد (${UNIT[FEED.rows[0].base_unit]})`, 'الملاحظات'], 'S4: الأعمدة كورقة المالك والوحدة في رأس الرصيد');
      const decimals = m.columnDecimals(FEED.rows.map((row) => milli(row.qty)), 3);
      t.same(
        bodyRows(),
        FEED.rows.map((row, index) => [String(index + 1), row.name, milli(row.qty) === 0n ? '-' : m.fmtQtyCell(milli(row.qty), decimals), row.note ? row.note.text : '']),
        'S4: ت 1..n، والمادّة، والرصيد بمراتب العمود (والصفر «-»)، وملاحظة اليوم',
      );
      t.same([byAction('day-title')[0]?.textContent, byAction('day-date')[0]?.textContent], [`رصيد ${FEED.category.name}`, `بتاريخ ${fmt(FEED.on)}`], 'S4: العنوان «رصيد {التصنيف}» و«بتاريخ {اليوم}»');
    });
    await step('S5', async () => {
      const MIX = DB.mixed_units;
      fresh(MANAGER, {}, { day_balance: answer(MIX) });
      await mount(dayUrlOf(MIX, { day: MIX.on }));
      t.same(headers(), ['ت', 'المادّة', 'الرصيد', 'الوحدة', 'الملاحظات'], 'S5: وحدات مختلفة: «الرصيد» بلا وحدة وعمود «الوحدة»');
      t.same(bodyRows().map((row) => row[3]), MIX.rows.map((row) => UNIT[row.base_unit]), 'S5: وحدة كلّ مادّة في عمودها');
    });

    // ── S6: رابط المادّة ────────────────────────────────────────────────────────────────────────────────────────────
    await step('S6', async () => {
      const fileJson = { today: FEED.today, can_record: false, can_edit: false, item: { id: plainRow.item_id, name: plainRow.name, kind: plainRow.kind, base_unit: plainRow.base_unit, density_kg_per_l: null, archived: false, tracks_expiry: false }, on_hand_qty: plainRow.qty, purchased_qty: '0.000', purchases_count: 0, purchases: [], more: false, stores: [] };
      fresh(MANAGER, {}, { day_balance: answer(FEED), item_file: async () => clone(fileJson) });
      const url = dayUrlOf(FEED, { day: FEED.on });
      await mount(url);
      const link = byAction('day-item').find((n) => n.textContent === plainRow.name);
      t.eq(link?.getAttribute('href'), `/inventory/items/${plainRow.item_id}?${new URLSearchParams({ back: url }).toString()}`, 'S6: المادّة رابط ملفّها وback = العرض نفسه');
      await click(link, { button: 0 });
      await settle();
      const back = byAction('back-to-board')[0];
      t.same([where?.pathname, back?.getAttribute('href'), back?.textContent], [`/inventory/items/${plainRow.item_id}`, url, 'رجوع إلى المخزن'], 'S6: الملفّ يُفتح وزرّ «رجوع إلى المخزن» إلى اليوم والتصنيف نفسيهما');
    });

    // ── S7: الملاحظة ───────────────────────────────────────────────────────────────────────────────────────────────
    const KEEP = DB.storekeeper;
    const keepPlain = KEEP.rows.find((row) => !row.note);
    const keepNoted = KEEP.rows.find((row) => row.note) ?? null;
    await step('S7-save', async () => {
      const { rpcCalls } = fresh(KEEPER, {}, { day_balance: answer(KEEP), set_day_note: async () => clone(F.set_day_note.saved) });
      await mount(urlAt(KEEP));
      t.same([byAction('edit-note').length, byAction('include-items').length, byAction('new-category').length, byAction('day-store').length], [KEEP.rows.length, 0, 0, KEEP.stores.length > 1 ? 1 : 0], 'S7: الأمين: زرّ ملاحظة لكلّ مادّة، بلا «أدرج» ولا «تصنيف جديد»، وقائمة المخازن لأكثر من مخزن وحده');
      await click(withId('edit-note', keepPlain.item_id));
      // النصّ الابتدائي لـtextarea ابنه النصّي (React)، وvalue لا يُكتب له حين يكون فارغاً في DOM الفحص.
      const area = byAction('note-text')[0];
      t.same([dialogTitle(), area?.value ?? area?.textContent, byAction('erase-note').length], [`ملاحظة «${keepPlain.name}» ليوم ${fmt(KEEP.on)}`, '', 0], 'S7: «ملاحظة {المادّة} ليوم {اليوم}» فارغة، بلا «امسح»');
      typeIn(byAction('note-text')[0], '  ناقصة كيسين عن الفاتورة  ');
      await settle();
      const reads = named(rpcCalls, 'day_balance').length;
      await submitDialog();
      t.same(named(rpcCalls, 'set_day_note'), [{ p_item: keepPlain.item_id, p_on: KEEP.on, p_note: 'ناقصة كيسين عن الفاتورة', p_expected_version: null }], 'S7: النصّ مقصوصاً ويوم العرض وnull («لم أرَ ملاحظة»)');
      t.same([dialog(), globalThis.__db.toasts.at(-1)?.tone, named(rpcCalls, 'day_balance').length], [undefined, 'success', reads + 1], 'S7: تُغلق وتقول «حُفظت» ويُقرأ الجدول من جديد');
      t.ok(globalThis.__db.toasts.at(-1)?.title.startsWith(`حُفظت ملاحظة «${keepPlain.name}»`), 'S7: باسم المادّة');
    });
    await step('S7-erase', async () => {
      const sample = clone(KEEP);
      const target = keepNoted ? sample.rows.find((row) => row.item_id === keepNoted.item_id) : Object.assign(sample.rows[0], { note: { text: 'ملاحظة قديمة', version: 3 } });
      const { rpcCalls } = fresh(KEEPER, {}, { day_balance: answer(sample), set_day_note: async () => clone(F.set_day_note.cleared) });
      await mount(urlAt(sample));
      await click(withId('edit-note', target.item_id));
      t.eq(byAction('note-text')[0]?.value, target.note.text, 'S7: الملاحظة الحاليّة في الحقل');
      await click(byAction('erase-note')[0]);
      t.same(named(rpcCalls, 'set_day_note'), [{ p_item: target.item_id, p_on: sample.on, p_note: '', p_expected_version: target.note.version }], 'S7: «امسح الملاحظة»: نصّ فارغ بنسخة ما رآه');
      t.ok(dialog() === undefined && globalThis.__db.toasts.at(-1)?.title.startsWith('مُسحت ملاحظة'), 'S7: «مُسحت»');
    });
    await step('S7-changed', async () => {
      const sample = clone(KEEP);
      const changed = clone(KEEP);
      const row = changed.rows.find((entry) => entry.item_id === keepPlain.item_id);
      // النسخة رقم من تسلسل القاعدة (لا عدّاد للملاحظة)، فتُرسل كما قُرئت.
      row.note = { text: 'كتبها المدير من جهاز آخر', version: 7_340_077 };
      let notes = 0;
      const { rpcCalls } = fresh(KEEPER, {}, {
        day_balance: async (args, n) => answer(n === 1 ? sample : changed)(args),
        set_day_note: async () => {
          notes += 1;
          if (notes === 1) throw new m.RejectedError(F.refusals.note_changed.code, F.refusals.note_changed.hint);
          return clone(F.set_day_note.saved);
        },
      });
      await mount(urlAt(sample));
      await click(withId('edit-note', keepPlain.item_id));
      typeIn(byAction('note-text')[0], 'ما كتبه الأمين');
      await settle();
      await submitDialog();
      await settle();
      t.same(
        [dialog() !== undefined, byAction('note-text')[0]?.value, named(rpcCalls, 'day_balance').length],
        [true, 'ما كتبه الأمين', 2],
        'S7: note_changed: النافذة باقية بما كُتب، والجدول يُقرأ من جديد',
      );
      t.ok(byAction('note-changed')[0]?.textContent.includes('غُيّرت ملاحظة هذا اليوم للتوّ من جهاز أو نافذة أخرى، فلم يُحفظ ما كتبت') && byAction('note-changed')[0]?.textContent.includes('كتبها المدير من جهاز آخر'), 'S7: ويقول إنّ غيره غيّرها ويعرض الملاحظة الحاليّة');
      await submitDialog();
      t.same(named(rpcCalls, 'set_day_note').map((args) => [args.p_note, args.p_expected_version]), [['ما كتبه الأمين', null], ['ما كتبه الأمين', 7_340_077]], 'S7: الإعادة بالنصّ نفسه وبنسخة الملاحظة التي صار يراها');
      t.eq(dialog(), undefined, 'S7: ثمّ تُغلق');
    });
    await step('S7-long', async () => {
      const { rpcCalls } = fresh(KEEPER, {}, { day_balance: answer(KEEP) });
      await mount(urlAt(KEEP));
      await click(withId('edit-note', keepPlain.item_id));
      typeIn(byAction('note-text')[0], 'م'.repeat(201));
      await settle();
      await submitDialog();
      t.same([named(rpcCalls, 'set_day_note').length, text().includes('الملاحظة أطول من 200 حرف (201)')], [0, true], 'S7: أطول من 200 حرف بعد القصّ: تُقال ولا تُرسل');
      // الحدّ بالحروف كما يعدّها الخادم، لا بوحدات UTF-16: 200 حرف خارج BMP (طولها 400 بـJS) تُرسل.
      typeIn(byAction('note-text')[0], '\u{1F414}'.repeat(200));
      await settle();
      await submitDialog();
      t.eq(named(rpcCalls, 'set_day_note').length, 1, 'S7: 200 حرف خارج BMP تُرسل');
    });
    await step('S7-scope', async () => {
      const { rpcCalls } = fresh(KEEPER, {}, { day_balance: answer(KEEP), set_day_note: async () => { throw new m.RejectedError(REFUSE.out_of_scope.code, REFUSE.out_of_scope.hint); } });
      await mount(urlAt(KEEP));
      await click(withId('edit-note', keepPlain.item_id));
      typeIn(byAction('note-text')[0], 'ملاحظة');
      await settle();
      await submitDialog();
      t.same(
        [named(rpcCalls, 'set_day_note').length, byAction('note-failed')[0]?.textContent, dialog() !== undefined, byAction('note-text')[0]?.value],
        [1, REFUSE.out_of_scope.hint, true, 'ملاحظة'],
        'S7: out_of_scope (مادّة لا يقبلها شيء من مخازن الكاتب): تلميح الخادم في النافذة، وما كُتب باقٍ',
      );
    });

    // ── S8: «أدرج مواد» ────────────────────────────────────────────────────────────────────────────────────────────
    // عيّنة S8: موادّ التصنيف (members) ومعها مادّة منه لا يُظهرها الجدول (لا يقبلها شيء من مخازن النطاق)، فالنافذة تعرضها باسمها من قراءة items.
    const other = FEED.categories.find((c) => c.id !== FEED.category.id);
    const hidden = { id: '9d1c1a00-0000-4000-8000-0000000000f3', name: 'مادّة منه خارج مخازن النطاق' };
    const S8S = clone(FEED);
    S8S.category.members = [...FEED.category.members, hidden.id];
    const memberNames = () => [...FEED.rows.map((row) => ({ id: row.item_id, name: row.name })), ...FEED.category.members.filter((id) => !FEED.rows.some((row) => row.item_id === id)).map((id) => ({ id, name: `مادّة ${id.slice(-4)}` })), hidden];
    const outsider = itemRow('9d1c1a00-0000-4000-8000-0000000000f1', 'مادّة من تصنيف آخر', other.id);
    const loose = itemRow('9d1c1a00-0000-4000-8000-0000000000f2', 'مادّة بلا تصنيف', null);
    const listed = () => ({ rows: [...memberNames().map((entry) => itemRow(entry.id, entry.name, FEED.category.id)), outsider, loose], total: memberNames().length + 2, next: null });
    const chosen = () => byAction('include-chosen-row').map((n) => n.getAttribute('data-id'));
    const chosenNames = () => byAction('include-chosen-row').map((n) => descendants(n).find((child) => child.localName === 'span')?.textContent);
    await step('S8', async () => {
      const { calls, rpcCalls, reads } = fresh(MANAGER, { listItems: listed }, { day_balance: answer(S8S), set_category_items: async () => clone(F.set_category_items.manager) }, { items: () => memberNames() });
      await mount(dayUrlOf(S8S, { day: S8S.on }));
      await click(byAction('include-items')[0]);
      const nameOf = new Map(memberNames().map((entry) => [entry.id, entry.name]));
      t.same(
        [dialogTitle(), chosen(), chosenNames(), named(calls, 'listItems')],
        [`موادّ «${FEED.category.name}»`, S8S.category.members, S8S.category.members.map((id) => nameOf.get(id)), [[{ search: '' }]]],
        'S8: تبدأ بموادّ التصنيف كلّها بترتيبه (members، ومنها ما لا يُظهره الجدول) بأسمائها، وكلّ الموادّ الفعّالة للاختيار',
      );
      t.same(reads.map((read) => [read.table, read.ops]), [['items', [['select', 'id, name'], ['eq', 'category_id', FEED.category.id], ['is', 'archived_at', null]]]], 'S8: الأسماء بقراءة واحدة لموادّ التصنيف الفعّالة');
      t.same(byAction('include-in-other').map((n) => n.textContent), [`في «${other.name}»`], 'S8: المادّة في تصنيف آخر تقول «في «س»»');
      t.same(byAction('include-pick').map((n) => n.checked === true), [...memberNames().map(() => true), false, false], 'S8: موادّ التصنيف معلَّمة مسبقاً');
      tick(withId('include-pick', outsider.id));
      await settle();
      tick(withId('include-pick', loose.id));
      await settle();
      t.same(chosen(), [...S8S.category.members, outsider.id, loose.id], 'S8: الاختيار يضيف في آخر القائمة');
      // المتوقّع بمحاكاة الخطوات نفسها على القائمة (أيّاً كان عدد موادّ العيّنة): قدّم مرّتين، وأخّر الأولى، وأخرج ما رصيده صفر.
      const swap = (list, id, by) => {
        const index = list.indexOf(id);
        const target = index + by;
        if (index < 0 || target < 0 || target >= list.length) return list;
        const copy = [...list];
        [copy[index], copy[target]] = [copy[target], copy[index]];
        return copy;
      };
      let expected = [...S8S.category.members, outsider.id, loose.id];
      await click(withId('include-up', loose.id));
      expected = swap(expected, loose.id, -1);
      await click(withId('include-up', loose.id));
      expected = swap(expected, loose.id, -1);
      t.same(chosen(), expected, 'S8: «قدّم» مرّتين');
      const head = expected[0];
      await click(withId('include-down', head));
      expected = swap(expected, head, 1);
      await click(withId('include-remove', zeroRow.item_id));
      expected = expected.filter((id) => id !== zeroRow.item_id);
      t.same(chosen(), expected, 'S8: «أخّر» والإخراج');
      t.ok(disabled(withId('include-up', expected[0])) && disabled(withId('include-down', expected.at(-1))), 'S8: لا «قدّم» للأوّل ولا «أخّر» للأخير');
      const balances = named(rpcCalls, 'day_balance').length;
      await click(byAction('save-include')[0]);
      const put = F.set_category_items.manager;
      t.same(named(rpcCalls, 'set_category_items'), [{ p_category: FEED.category.id, p_items: expected, p_expected_items: S8S.category.members }], 'S8: set_category_items بالقائمة كلّها بترتيبها، وp_expected_items موادّ التصنيف كما عُرضت');
      t.same([dialog(), named(rpcCalls, 'day_balance').length], [undefined, balances + 1], 'S8: تُغلق ويُقرأ الجدول من جديد');
      t.eq(globalThis.__db.toasts.at(-1)?.title, put.moved > 0 ? `حُفظت موادّ «${FEED.category.name}»: ${put.count}، منها ${put.moved} نُقلت من تصنيف آخر.` : `حُفظت موادّ «${FEED.category.name}»: ${put.count}.`, 'S8: والرسالة من جواب الخادم');
    });
    await step('S8-names', async () => {
      // لا حفظ قبل أن تُعرف موادّ التصنيف بأسمائها (الحفظ يُخرج ما ليس في القائمة)؛ وفشل قراءتها يُقال بـ«أعد المحاولة».
      const { rpcCalls, reads } = fresh(
        MANAGER,
        { listItems: listed },
        { day_balance: answer(S8S) },
        {
          items: (_query, n) => {
            if (n === 1) throw new Error('names_down');
            return memberNames();
          },
        },
      );
      await mount(dayUrlOf(S8S, { day: S8S.on }));
      await click(byAction('include-items')[0]);
      const inDialog = (action) => descendants(dialog()).filter((n) => n.getAttribute('data-action') === action);
      t.same([disabled(byAction('save-include')[0]), byAction('include-chosen-row').length, inDialog('retry').length], [true, 0, 1], 'S8: فشل قراءة أسماء التصنيف: «أعد المحاولة» والحفظ مقفول');
      await click(byAction('save-include')[0]);
      t.eq(named(rpcCalls, 'set_category_items').length, 0, 'S8: ولا نداء');
      await click(inDialog('retry')[0]);
      t.same([reads.length, disabled(byAction('save-include')[0]), chosen()], [2, false, S8S.category.members], 'S8: بعد الإعادة: الموادّ بأسمائها والحفظ مفتوح');
    });
    await step('S8-changed', async () => {
      // غيّر غيره التصنيف بعد فتح النافذة: أضاف إليه مادّة.
      const added = { id: '9d1c1a00-0000-4000-8000-0000000000f4', name: 'مادّة أضافها مدير آخر' };
      const after = clone(S8S);
      after.category.members = [...S8S.category.members, added.id];
      let puts = 0;
      const { rpcCalls, reads } = fresh(
        MANAGER,
        { listItems: listed },
        {
          day_balance: async (args, n) => answer(n === 1 ? S8S : after)(args),
          set_category_items: async () => {
            puts += 1;
            if (puts === 1) throw new m.RejectedError(REFUSE.category_changed.code, REFUSE.category_changed.hint);
            return clone(F.set_category_items.manager);
          },
        },
        { items: (_query, n) => (n === 1 ? memberNames() : [...memberNames(), added]) },
      );
      await mount(dayUrlOf(S8S, { day: S8S.on }));
      await click(byAction('include-items')[0]);
      await click(withId('include-remove', zeroRow.item_id));
      tick(withId('include-pick', loose.id));
      await settle();
      const selection = chosen();
      await click(byAction('save-include')[0]);
      await settle();
      t.same(
        [dialog() !== undefined, chosen(), named(rpcCalls, 'day_balance').length, reads.length],
        [true, selection, 2, 2],
        'S8: category_changed: النافذة باقية بالاختيار نفسه، والجدول وأسماء التصنيف يُقرآن من جديد',
      );
      t.ok(byAction('include-changed')[0]?.textContent.startsWith(REFUSE.category_changed.hint) && byAction('include-changed')[0]?.textContent.includes('اختيارك باقٍ'), 'S8: ويقول تلميح الخادم وأنّ الاختيار باقٍ');
      await click(byAction('save-include')[0]);
      t.same(
        named(rpcCalls, 'set_category_items').map((args) => [args.p_items, args.p_expected_items]),
        [[selection, S8S.category.members], [selection, after.category.members]],
        'S8: الإعادة بالاختيار نفسه وبموادّ التصنيف كما صارت',
      );
      t.eq(dialog(), undefined, 'S8: ثمّ تُغلق');
    });

    // ── S9: «تصنيف جديد» ───────────────────────────────────────────────────────────────────────────────────────────
    await step('S9', async () => {
      const NONE = DB.no_categories;
      const created = { id: '9d1c1a00-0000-4000-8000-0000000000c9', version: 1, archived: false, name: 'مواد العلف الجديدة' };
      const fresher = { ...clone(DB.empty_category), category: { id: created.id, name: created.name, members: [] }, categories: [{ id: created.id, name: created.name, items: 0 }] };
      const corn = itemRow(NONE.rows[0].item_id, NONE.rows[0].name, null);
      const { calls, rpcCalls } = fresh(
        MANAGER,
        { createItemCategory: () => created, listItems: () => ({ rows: [corn], total: 1, next: null }) },
        { day_balance: async (args) => answer(args.p_category === created.id ? fresher : NONE)(args), set_category_items: async () => ({ ...clone(F.set_category_items.manager), category_id: created.id }) },
        { items: () => [] },
      );
      await mount('/inventory?view=day');
      t.same([search().cat, byAction('day-no-categories').length, headers().length > 0, bodyRows().length], [undefined, 1, true, NONE.rows.length], 'S9: بلا تصنيفات: «لا تصنيف بعد» وجدول كلّ المواد بلا انتقال');
      t.ok(text().includes('لا تصنيف بعد.') && text().includes('أنشئ تصنيفاً مثل «مواد العلف»'), 'S9: وتقول ما العمل للمدير');
      t.same([byAction('new-category').length, chip('all')?.getAttribute('aria-pressed')], [1, 'true'], 'S9: زرّ «تصنيف جديد» واحد، و«كل المواد» مختار');
      await click(byAction('new-category')[0]);
      await submitDialog();
      t.same([text().includes('اكتب اسم التصنيف.'), named(calls, 'createItemCategory').length], [true, 0], 'S9: الاسم مطلوب');
      typeIn(byAction('category-name')[0], `  ${created.name} `);
      await settle();
      await submitDialog();
      await settle();
      t.same(named(calls, 'createItemCategory'), [[created.name]], 'S9: الإدراج القائم بالاسم');
      t.same([search().cat, named(rpcCalls, 'day_balance').at(-1)?.p_category, dialogTitle(), text().includes('لم تختر مادّة بعد')], [created.id, created.id, `موادّ «${created.name}»`, true], 'S9: يُعرض التصنيف الجديد ونافذة موادّه فارغة فوقه');
      tick(withId('include-pick', corn.id));
      await settle();
      await click(byAction('save-include')[0]);
      t.same(named(rpcCalls, 'set_category_items'), [{ p_category: created.id, p_items: [corn.id], p_expected_items: [] }], 'S9: وحفظ موادّه بما عُرض فيه: لا شيء');
    });
    await step('S9-twin', async () => {
      const { calls } = fresh(MANAGER, {}, { day_balance: answer(FEED) });
      await mount(dayUrlOf(FEED, { day: FEED.on }));
      await click(byAction('new-category')[0]);
      typeIn(byAction('category-name')[0], FEED.categories[0].name);
      await settle();
      await submitDialog();
      t.same([text().includes(`يوجد تصنيف باسم «${FEED.categories[0].name}»`), named(calls, 'createItemCategory').length], [true, 0], 'S9: الاسم المكرّر يُقال قبل الإرسال');
    });

    // ── S10: الطباعة ───────────────────────────────────────────────────────────────────────────────────────────────
    await step('S10', async () => {
      let printed = 0;
      globalThis.window.print = () => {
        printed += 1;
      };
      try {
        fresh(MANAGER, {}, { day_balance: answer(FEED) });
        await mount(dayUrlOf(FEED, { day: FEED.on }));
        t.eq(byAction('print-day')[0]?.textContent, 'اطبع أو احفظ PDF', 'S10: الزرّ باسمه');
        await click(byAction('print-day')[0]);
        t.eq(printed, 1, 'S10: window.print');
        const org = byAction('day-org')[0];
        t.same([org?.textContent, classOf(org).split(' ').filter((c) => c === 'hidden' || c === 'print:block')], ['مشروع الدواجن', ['hidden', 'print:block']], 'S10: اسم المنشأة سطر للطباعة وحدها');
        t.ok(underClass(byAction('day-controls')[0], 'print:hidden') && underClass(radio('الرصيد اليومي'), 'print:hidden') && underClass(all().find((n) => n.localName === 'h1'), 'print:hidden') && underClass(byAction('open-store-setup')[0], 'print:hidden'), 'S10: الأزرار والمفتاح والعنوان والروابط لا تُطبع');
        t.ok(byAction('edit-note').every((n) => underClass(n, 'print:hidden')), 'S10: ولا أزرار الملاحظات');
        const table = all().find((n) => n.localName === 'table');
        t.ok(!underClass(byAction('day-title')[0], 'print:hidden') && !underClass(table, 'print:hidden') && !underClass(byAction('day-note').find((n) => n.textContent !== ''), 'print:hidden'), 'S10: العنوان والجدول والملاحظات تُطبع');
        t.ok(classOf(table?.parentNode?.parentNode).includes('print:[&>div]:max-h-none'), 'S10: والجدول بكلّ صفوفه بلا حدّ ارتفاع');
      } finally {
        delete globalThis.window.print;
      }
    });

    // ── S11: المشاركة ──────────────────────────────────────────────────────────────────────────────────────────────
    const expectedShare = (sample) => {
      const title = `رصيد ${sample.category.name} بتاريخ ${fmt(sample.on)}`;
      const lines = sample.rows.map((row, index) => {
        const qty = milli(row.qty) === 0n ? '-' : m.baseQty(milli(row.qty), row.base_unit);
        const line = `${index + 1}. ${row.name}: ${qty}`;
        return row.note ? `${line} — ${row.note.text.replace(/\s+/gu, ' ')}` : line;
      });
      return { title, text: [title, ...lines].join('\n') };
    };
    await step('S11-share', async () => {
      const shared = [];
      Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, share: async (data) => shared.push(data) }, configurable: true, writable: true });
      fresh(MANAGER, {}, { day_balance: answer(FEED) });
      await mount(dayUrlOf(FEED, { day: FEED.on }));
      await click(byAction('share-day')[0]);
      t.same(shared, [expectedShare({ ...FEED })], 'S11: navigator.share بالعنوان والنصّ: سطر لكلّ مادّة، والصفر «-»، والملاحظة بعد «—»');
      t.ok(shared[0]?.text.split('\n')[1]?.startsWith('1. '), 'S11: الأسطر مرقّمة من 1');
      t.eq(globalThis.__db.toasts.length, 0, 'S11: بلا رسالة بعد المشاركة');
    });
    await step('S11-copy', async () => {
      const copied = [];
      Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, clipboard: { writeText: async (value) => copied.push(value) } }, configurable: true, writable: true });
      fresh(MANAGER, {}, { day_balance: answer(FEED) });
      await mount(dayUrlOf(FEED, { day: FEED.on }));
      await click(byAction('share-day')[0]);
      t.same([copied, globalThis.__db.toasts.at(-1)?.tone, globalThis.__db.toasts.at(-1)?.title], [[expectedShare(FEED).text], 'success', 'نُسخ التقرير: الصقه في واتساب أو في أيّ رسالة.'], 'S11: بلا نافذة مشاركة: يُنسخ النصّ نفسه ويقول ذلك');
    });
    await step('S11-cancel', async () => {
      const copied = [];
      const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
      Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, share: async () => { throw abort; }, clipboard: { writeText: async (value) => copied.push(value) } }, configurable: true, writable: true });
      fresh(MANAGER, {}, { day_balance: answer(FEED) });
      await mount(dayUrlOf(FEED, { day: FEED.on }));
      await click(byAction('share-day')[0]);
      t.same([copied.length, globalThis.__db.toasts.length], [0, 0], 'S11: إلغاء نافذة المشاركة: لا نسخ ولا رسالة');
    });
    if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator);
    else delete globalThis.navigator;

    // ── S12: الفراغ والأدوار ───────────────────────────────────────────────────────────────────────────────────────
    await step('S12-empty-category', async () => {
      const EMPTY = DB.empty_category;
      fresh(MANAGER, { listItems: () => ({ rows: [], total: 0, next: null }) }, { day_balance: answer(EMPTY) }, { items: () => [] });
      await mount(dayUrlOf(EMPTY));
      t.same([byAction('day-empty-category').length, text().includes('لا موادّ في هذا التصنيف'), all().some((n) => n.localName === 'table'), byAction('include-items').length], [1, true, false, 1], 'S12: تصنيف بلا موادّ: «لا موادّ في هذا التصنيف» بلا جدول، و«أدرج مواد» واحد للمدير');
      t.same([disabled(byAction('print-day')[0]), disabled(byAction('share-day')[0])], [true, true], 'S12: ولا شيء يُطبع أو يُشارك');
      await click(byAction('include-items')[0]);
      t.same([dialogTitle(), byAction('include-chosen-row').length, text().includes('لم تختر مادّة بعد')], [`موادّ «${EMPTY.category.name}»`, 0, true], 'S12: ويفتح نافذة موادّه');
    });
    await step('S12-no-stores', async () => {
      // لا مخزن في النطاق: الصفوف فارغة، فلا جدول أصفار ولا طباعة ولا مشاركة، بل يُقال السبب.
      const NOSTORE = { ...clone(FEED), stores: [], rows: [] };
      fresh(KEEPER, {}, { day_balance: answer({ ...NOSTORE, can_manage: false }) });
      await mount(dayUrlOf(NOSTORE, { day: NOSTORE.on }));
      t.same(
        [byAction('day-no-stores').length, text().includes('لا مخزن في نطاقك، فلا رصيد يُعرض هنا.'), all().some((n) => n.localName === 'table'), byAction('day-report').length, byAction('print-day').length, byAction('share-day').length, byAction('day-store').length],
        [1, true, false, 0, 0, 0, 0],
        'S12: لا مخزن في النطاق: «لا مخزن في نطاقك» بلا جدول ولا عنوان تقرير ولا طباعة ولا مشاركة',
      );
      t.ok(text().includes('اطلب من صاحب المنشأة أن يضيف مخزناً إلى نطاقك.'), 'S12: ويقول ممّن يطلب');
    });
    await step('S12-unstored', async () => {
      // موادّ في التصنيف (members) ولا يُخزَّن شيء منها في المخزن المختار: غير «لا موادّ في هذا التصنيف».
      const UNSTORED = { ...clone(FEED), rows: [] };
      fresh(MANAGER, {}, { day_balance: answer(UNSTORED) });
      await mount(dayUrlOf(UNSTORED, { day: UNSTORED.on, store: FEED.stores[0].id }));
      t.same(
        [byAction('day-unstored').length, byAction('day-empty-category').length, text().includes(`لا يُخزَّن شيء من موادّ «${FEED.category.name}» في «${FEED.stores[0].name}».`), all().some((n) => n.localName === 'table'), disabled(byAction('print-day')[0]), byAction('include-items').length],
        [1, 0, true, false, true, 1],
        'S12: موادّ لا تُخزَّن في المخزن المختار: يقوله ويقترح غيره، بلا جدول ولا طباعة، و«أدرج مواد» باقٍ للمدير',
      );
      await unmount();
      fresh(MANAGER, {}, { day_balance: answer(UNSTORED) });
      await mount(dayUrlOf(UNSTORED, { day: UNSTORED.on }));
      t.ok(text().includes(`لا يُخزَّن شيء من موادّ «${FEED.category.name}» في مخازن نطاقك.`), 'S12: وبكلّ المخازن: «في مخازن نطاقك»');
    });
    for (const [label, session] of [['المشاهد', VIEWER], ['المحاسب', ACCOUNTANT]]) {
      await step(`S12-${label}`, async () => {
        fresh(session, {}, { day_balance: answer(DB.viewer) });
        await mount(dayUrlOf(DB.viewer, { day: DB.viewer.on }));
        t.same([bodyRows().length, byAction('edit-note').length, byAction('include-items').length, byAction('new-category').length, byAction('print-day').length, byAction('share-day').length], [DB.viewer.rows.length, 0, 0, 0, 1, 1], `S12: ${label}: الجدول والطباعة والمشاركة، بلا ملاحظة ولا «أدرج» ولا «تصنيف جديد»`);
      });
    }
    await step('S12-viewer-empty', async () => {
      fresh(VIEWER, {}, { day_balance: answer({ ...clone(DB.empty_category), can_note: false, can_manage: false }) });
      await mount(dayUrlOf(DB.empty_category));
      t.same([byAction('include-items').length, text().includes('يختار موادّ التصنيفات المدير.')], [0, true], 'S12: تصنيف فارغ لغير المدير: يقول من يختار موادّه، بلا زرّ');
    });

    // ── S13: المخزن ────────────────────────────────────────────────────────────────────────────────────────────────
    await step('S13', async () => {
      const { rpcCalls } = fresh(MANAGER, {}, { day_balance: answer(FEED) });
      await mount(dayUrlOf(FEED, { day: FEED.on }));
      const select = byAction('day-store')[0];
      t.same(select?.options.map((o) => [o.getAttribute('value'), o.textContent]), [['', 'كل المخازن'], ...FEED.stores.map((s) => [s.id, s.name])], 'S13: «كل المخازن» ثمّ كلّ مخزن');
      choose(select, FEED.stores[1].id);
      await settle();
      t.same([search().store, named(rpcCalls, 'day_balance').at(-1)], [FEED.stores[1].id, { p_category: FEED.category.id, p_on: FEED.on, p_warehouse: FEED.stores[1].id }], 'S13: المخزن في الرابط وفي p_warehouse');
      t.eq(byAction('day-date')[0]?.textContent, `بتاريخ ${fmt(FEED.on)}، في «${FEED.stores[1].name}»`, 'S13: والعنوان يسمّي المخزن');
      choose(byAction('day-store')[0], '');
      await settle();
      t.same([search().store, named(rpcCalls, 'day_balance').at(-1)?.p_warehouse], [undefined, null], 'S13: «كل المخازن» يُسقطه');
    });
    await step('S13-one', async () => {
      fresh(MANAGER, {}, { day_balance: answer({ ...clone(FEED), stores: [clone(FEED.stores[0])] }) });
      await mount(dayUrlOf(FEED, { day: FEED.on }));
      t.same([bodyRows().length, byAction('day-store').length], [FEED.rows.length, 0], 'S13: مخزن واحد بالنطاق: بلا قائمة مخازن');
    });

    // ── S14: الرفض ─────────────────────────────────────────────────────────────────────────────────────────────────
    await step('S14', async () => {
      const future = shift(FEED.today, 3);
      const { rpcCalls } = fresh(MANAGER, {}, {
        day_balance: async (args) => {
          if (args.p_on !== null && args.p_on > FEED.today) throw new m.RejectedError(F.refusals.day_in_future.code, F.refusals.day_in_future.hint);
          return answer(FEED)(args);
        },
      });
      await mount(dayUrlOf(FEED, { day: future }));
      t.ok(text().includes(F.refusals.day_in_future.hint) && byAction('day-refusal-way')[0]?.textContent === 'اليوم', 'S14: day_in_future بتلميح الخادم وزرّ «اليوم»');
      await click(byAction('day-refusal-way')[0]);
      t.same([search().day, named(rpcCalls, 'day_balance').at(-1)?.p_on, bodyRows().length], [undefined, null, FEED.rows.length], 'S14: «اليوم» يعرض اليوم');
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
        t.same(
          [header, aside, bottom, spacer, banner].map((node) => underClass(node, 'print:hidden')),
          [true, true, true, true, true],
          'S15: الشريط العلوي والجانبي والسفلي والفاصل وأشرطة التحديث print:hidden',
        );
        t.ok(classOf(offset).includes('print:ps-0') && !underClass(byAction('page-body')[0], 'print:hidden'), 'S15: والصفحة تُطبع بلا إزاحة الشريط الجانبي');
      } finally {
        m.recoveryStore.set('idle');
      }
    });

    // ── S16: «حركات المادّة» في ملفّ المادّة ─────────────────────────────────────────────────────────────────────
    const W_EMPTY = '6bc1bee2-2e40-4a9f-8f96-0000000000b1';
    const W_FULL = '6bc1bee2-2e40-4a9f-8f96-0000000000b2';
    const fileWith = (stores) => ({
      today: FEED.today, can_record: false, can_edit: false,
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
      const section = byAction('file-moves')[0];
      t.ok(section !== undefined && descendants(section).some((n) => n.localName === 'h2' && n.textContent === 'حركات المادّة'), 'S16: قسم «حركات المادّة» لكلّ من يفتح الملفّ (المشاهد هنا)');
      t.same(byAction('moves-store').map((n) => [n.textContent, n.getAttribute('aria-pressed')]), [['مخزن أ', 'false'], ['مخزن ب', 'true']], 'S16: زرّ لكلّ مخزن، والأوّل بموجود مختار');
      t.same(named(calls, 'loadItemMoves'), [['i-corn', W_FULL]], 'S16: دفتر ذلك المخزن');
      t.ok(text().includes('شراء من مورّد الحبوب إلى الثاني') && headers().includes('الرصيد (كغم)'), 'S16: الجدول القائم بالبيان والرصيد');
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

/** هل يسبق الأوّلُ الثاني في ترتيب المستند. */
function before(a, b) {
  const nodes = all();
  return a !== undefined && b !== undefined && nodes.indexOf(a) >= 0 && nodes.indexOf(a) < nodes.indexOf(b);
}
