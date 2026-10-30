// مرتجع المورّد وتصحيح السعر تفاعلياً (الخطّة WP7): react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل StockRoutes الحقيقية، وrepo
// الشراء والمخزون والجلسة والرسائل بدائل. F1 الأمين يضيف سطراً من سطور الاستلام الباقية بـ«كل المتبقّي» (والسطر الموجود ما ينعرض)؛ F2
// المقبول يُحفظ مشروطاً بالمحفوظ؛ F3 الترحيل ممتنع ومبالغ ما انحفظت؛ F4 سطر ياخذ متبقّي دفعته كلّه يحتاج تأكيداً يسمّيه، وبعد الترحيل
// إعلان؛ F5 stale_draft بالترحيل يقرا المرتجع من جديد؛ F6 تصحيح السعر للمدير: المعاينة ثم تأكيد يسمّي الاستلام والسطر ثم الترحيل بالمبلغ
// والسبب؛ F7 المحاسب بلا تصحيح سعر ولا «مرتجع جديد»؛ F8 الأمين ينشئ مرتجعاً من الاستلام المرحَّل فينفتح. ومراجعة WP7: F9 إعادة التصحيح
// بعد جواب ضاع بنفس المرجع، وبصمة جديدة بمرجع جديد، وstale_preview يعاين من جديد؛ F10 تكرار سطر الاستلام (23505 على مفتاحه) رفض أكيد
// وقراءة جديدة، و23505 بمعرّف الجهاز تعديل؛ F11 المبلغ الحالي يبقى آخر المعروف وسجلّ التصحيحات يقرا من جديد؛ F12 المقبول المحفوظ يبقى
// بالحقل لمّا قراءة بدت قبل الكتابة ترجع بالقديم؛ F13 stale_preview بترحيل المرتجع يعاين من جديد والموافقة تنعاد.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const PURCHASING = [
  'loadReceipt', 'listReceipts', 'listBoxes', 'searchSuppliers', 'listReceiptReturns', 'listLineRevaluations', 'previewReceiptRevalue', 'postReceiptRevalue', 'voidReceiptRevalue',
  'loadSupplierReturn', 'supplierReturnOptions', 'createSupplierReturnDraft', 'addReturnLine', 'updateReturnLine', 'deleteReturnLine', 'discardSupplierReturn', 'setReturnCredit',
  'previewSupplierReturn', 'postSupplierReturn', 'voidSupplierReturn',
];
const INVENTORY = ['loadOrgSetup', 'listItems', 'listItemUnits'];
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__flow.call('${n}', a);`).join(' ')}`;
const STUBS = {
  purchasing: routed('purchasing', PURCHASING),
  inventory: routed('inventory', INVENTORY),
  session: 'export const useSession = () => globalThis.__flow.session; export const sessionStore = { get: () => globalThis.__flow?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__flow.toasts.push(spec); }; export function Toaster() { return null; }',
};
const stubs = {
  name: 'return-flow-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/(purchasing|inventory)$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'return-flow' }));
    b.onLoad({ filter: /.*/, namespace: 'return-flow' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
  },
};

async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    "export { default as StockRoutes } from './src/pages/inventory/StockRoutes.tsx';",
    "export { onlineStore } from './src/lib/online.ts';",
    "export { RejectedError, UnknownOutcomeError } from './src/lib/errors.ts';",
    "export { localDay } from './src/domain/dates.ts';",
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
const byIdSuffix = (suffix) => all().filter((n) => n.id.endsWith(suffix));
const text = () => body().textContent;
const disabled = (node) => node?.getAttribute('disabled') !== null && node?.getAttribute('disabled') !== undefined;
const type = (input, value) => {
  input.value = value;
  fire(input, 'input');
};
const tick = (box) => {
  box.checked = !box.checked;
  fire(box, 'click');
};
const choose = (select, value) => {
  select.value = value;
  fire(select, 'change');
};
const click = async (node) => {
  fire(node, 'click');
  await settle();
};

export default async function (t) {
  const restore = installDom();
  try {
    const m = await bundle();
    const ws = (role) => ({ userId: `u-${role}`, orgId: 'org-1', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role, scopes: [], divisions: ['feed_mill'], canSeeCost: role !== 'storekeeper', canSeeAccounts: role === 'accountant', canSeeSales: false, invites: [], subscription: 'active', confirmedAt: 1 });
    const org = {
      divisions: [{ id: 'd-mill', kind: 'feed_mill', goLiveOn: '2026-10-01', frozen: true }],
      sites: [],
      packTypes: [],
      itemCategories: [],
      expenseCategories: [],
      warehouses: [{ id: 'w-raw', version: 1, archived: false, divisionId: 'd-mill', siteId: 's-mill', name: 'مخزن المواد الأوّلية', kind: 'raw', hasBalance: true }],
    };
    const retDoc = (over = {}) => ({ id: 'rt-1', status: 'draft', version: 3, docNo: null, receiptId: 'pu-1', partyId: 'p-1', warehouseId: 'w-raw', bookId: 'b-mill', onDate: '2026-10-30', note: null, posted: false, voidReason: null, createdAt: '2026-10-30T08:00:00Z', ...over });
    const cornLine = { id: 'a', lineNo: 1, receiptLineId: 'ra', itemId: 'i-corn', lotId: 'lot-a', qty: 1_000_000n, itemName: 'ذرة صفراء', baseUnit: 'kg' };
    const retBundle = (over = {}) => ({ doc: retDoc(), receipt: { id: 'pu-1', docNo: 'PU-2026-0042', onDate: '2026-10-28', partyName: 'مورّد الحبوب' }, lines: [cornLine], credits: [], ...over });
    const options = {
      receiptId: 'pu-1', receiptNo: 'PU-2026-0042', partyId: 'p-1', partyName: 'مورّد الحبوب', warehouseId: 'w-raw', receivedOn: '2026-10-28', status: 'posted',
      lines: [
        { receiptLineId: 'ra', lineNo: 1, itemId: 'i-corn', itemName: 'ذرة صفراء', baseUnit: 'kg', qtyReceived: 5_000_000n, lotId: 'lot-a', qtyLeft: 5_000_000n },
        { receiptLineId: 'rb', lineNo: 2, itemId: 'i-soy', itemName: 'كسبة صويا', baseUnit: 'kg', qtyReceived: 1_000_000n, lotId: 'lot-b', qtyLeft: 200_000n },
        { receiptLineId: 'rc', lineNo: 3, itemId: 'i-oil', itemName: 'زيت نباتي', baseUnit: 'L', qtyReceived: 1_000_000n, lotId: 'lot-c', qtyLeft: 0n },
      ],
    };
    const previewLine = (over = {}) => ({ lineId: 'a', lineNo: 1, receiptLineId: 'ra', itemId: 'i-corn', itemName: 'ذرة صفراء', baseUnit: 'kg', qty: 1_000_000n, lotId: 'lot-a', lotQtyLeft: 5_000_000n, wholeBalance: false, problem: null, warning: null, ...over });
    const retPreview = (over = {}) => ({
      version: 3, receiptId: 'pu-1', receiptNo: 'PU-2026-0042', problems: [], ready: true, plan: 'ret-plan', lines: [previewLine()],
      money: { lines: [{ lineId: 'a', value: 48_083_333n, credit: 47_000_000n, diff: 1_083_333n }], valueTotal: 48_083_333n, creditTotal: 47_000_000n, diffTotal: 1_083_333n },
      ...over,
    });
    const savedCredit = { id: 'c-1', lineId: 'a', credit: 47_000_000n };
    const receiptDoc = { id: 'pu-1', status: 'posted', version: 7, docNo: 'PU-2026-0042', partyId: 'p-1', partyName: 'مورّد الحبوب', warehouseId: 'w-raw', bookId: 'b-mill', onDate: '2026-10-28', note: null, posted: true, voidReason: null, createdAt: '2026-10-28T08:00:00Z' };
    const receiptLine = { id: 'ra', lineNo: 1, itemId: 'i-corn', itemName: 'ذرة صفراء', itemKind: 'raw', baseUnit: 'kg', tracksExpiry: false, itemUnitId: null, unitCode: null, unitLabel: 'kg', qtyInUnit: 5_000_000n, qty: 5_000_000n, expiryOn: null, bornAt: null, supplierLotNo: null, density: null, pieceMass: null };
    const receiptBundle = (withMoney) => ({ doc: receiptDoc, lines: [receiptLine], lineAmounts: withMoney ? [{ id: 'la', lineId: 'ra', lineTotal: 235_000_000n, zeroReason: null }] : [], amounts: null, charges: [] });
    const revaluePreview = {
      lineId: 'ra', receiptId: 'pu-1', receiptNo: 'PU-2026-0042', itemName: 'ذرة صفراء', baseUnit: 'kg', qtyIn: 5_000_000n, currentTotal: 235_000_000n, newTotal: 240_000_000n, diff: 5_000_000n,
      family: [{ lotId: 'lot-a', warehouseId: 'w-raw', warehouseName: 'مخزن المواد الأوّلية', qtyLeft: 2_880_000n, valueLeft: 138_480_000n, share: 2_880_000n }],
      lotShare: 2_880_000n, expenseAmount: 2_120_000n, supplierAdjustment: -5_000_000n, problems: [], ready: true, plan: 'plan-seen',
    };

    const fresh = (role, handlers) => {
      const calls = [];
      globalThis.__flow = {
        session: { status: 'ready', workspace: ws(role), offline: false },
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
      };
      return calls;
    };
    const named = (calls, name) => calls.filter(([n]) => n === name).map(([, args]) => args);
    let root = null;
    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      function Keyed() {
        const location = m.useLocation();
        globalThis.__flow.location = location.pathname;
        return m.h(m.Routes, { key: location.pathname }, m.h(m.Route, { path: '/inventory/*', element: m.h(m.StockRoutes) }));
      }
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(Keyed))));
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
    // كل حالة لحالها: رمية بحالة (زرّ ما موجود) تنحسب فشلها وما توقف اللي بعدها.
    const step = async (name, fn) => {
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${name}: رمى ${error}`);
        await unmount();
      }
    };
    const returnHandlers = (over = {}) => ({ loadSupplierReturn: () => retBundle(), supplierReturnOptions: () => options, ...over });
    const receiptHandlers = (withMoney, over = {}) => ({ loadReceipt: () => receiptBundle(withMoney), loadOrgSetup: () => org, listBoxes: () => [], listReceiptReturns: () => [], listLineRevaluations: () => [], ...over });
    m.onlineStore.set(true);

    // ── F1: الأمين يضيف سطراً: سطور الاستلام الباقية بس (بلا الموجود بالمرتجع ولا اللي خلص)، و«كل المتبقّي» يملأ الكمية ───────────────
    await step('F1', async () => {
      const calls = fresh('storekeeper', returnHandlers({ addReturnLine: (docId, id, receiptLineId, qty) => ({ id, lineNo: 2, receiptLineId, itemId: 'i-soy', lotId: 'lot-b', qty }) }));
      await mount('/inventory/supplier-returns/rt-1');
      const picker = byAction('pick-receipt-line')[0];
      const offered = picker.childNodes.map((option) => option.getAttribute('value')).filter(Boolean);
      choose(picker, 'rb');
      await settle();
      await click(byAction('return-all-left')[0]);
      fire(byAction('add-return-line')[0].parentNode, 'submit');
      await settle();
      const sent = named(calls, 'addReturnLine');
      t.same([offered, sent.length, sent[0]?.[0], sent[0]?.[2], sent[0]?.[3], named(calls, 'loadSupplierReturn').length], [['rb'], 1, 'rt-1', 'rb', 200_000n, 2], 'F1: «صويا» وحدها معروضة، و«كل المتبقّي» 200 كغم، والسطر ينضاف والمرتجع ينقرا من جديد');
      t.ok(byAction('post-return').length === 0 && byAction('save-credits').length === 0, 'F1: الأمين بلا مبلغ مقبول ولا ترحيل');
      await unmount();
    });

    // ── F2: المقبول يُحفظ مشروطاً بالمحفوظ (470,000 ← 480,000) ─────────────────────────────────────────────────────────
    await step('F2', async () => {
      const calls = fresh('accountant', returnHandlers({ loadSupplierReturn: () => retBundle({ credits: [savedCredit] }), setReturnCredit: () => undefined }));
      await mount('/inventory/supplier-returns/rt-1');
      const field = byIdSuffix('-credit-a')[0];
      const shown = field.value;
      type(field, '480000');
      await settle();
      await click(byAction('save-credits')[0]);
      t.same([shown, named(calls, 'setReturnCredit')], ['470000', [['a', { id: '', lineId: 'a', credit: 47_000_000n }, 48_000_000n]]], 'F2: الحقل بالمحفوظ، والحفظ مشروط بـ470,000');
      await unmount();
    });

    // ── F3: الترحيل ممتنع ومبالغ ما انحفظت، وينفتح بعد التراجع ───────────────────────────────────────────────────────────
    await step('F3', async () => {
      fresh('accountant', returnHandlers({ loadSupplierReturn: () => retBundle({ credits: [savedCredit] }), previewSupplierReturn: () => retPreview() }));
      await mount('/inventory/supplier-returns/rt-1');
      await click(byAction('preview-return')[0]);
      tick(byAction('approve-return-line')[0]);
      await settle();
      const clean = disabled(byAction('post-return')[0]);
      type(byIdSuffix('-credit-a')[0], '480000');
      await settle();
      const dirty = [disabled(byAction('post-return')[0]), text().includes('في المبالغ المقبولة تعديل لم يُحفظ')];
      await click(byAction('undo-credits')[0]);
      t.same([clean, ...dirty, disabled(byAction('post-return')[0])], [false, true, true, false], 'F3: ممتنع مع تعديل ما انحفظ، ويرجع بعد التراجع');
      await unmount();
    });

    // ── F4: سطر ياخذ متبقّي دفعته كلّه: تأكيد يسمّيه قبل الترحيل، وإعلان بعده ────────────────────────────────────────────
    await step('F4', async () => {
      const calls = fresh('accountant', returnHandlers({
        loadSupplierReturn: () => retBundle({ credits: [savedCredit] }),
        previewSupplierReturn: () => retPreview({ lines: [previewLine({ qty: 5_000_000n, wholeBalance: true })] }),
        postSupplierReturn: (ref, id, version) => ({ id, status: 'posted', docNo: 'RT-2026-0001', version }),
      }));
      await mount('/inventory/supplier-returns/rt-1');
      await click(byAction('preview-return')[0]);
      tick(byAction('approve-return-line')[0]);
      await settle();
      await click(byAction('post-return')[0]);
      const asked = [named(calls, 'postSupplierReturn').length, text().includes('إرجاع ما بقي من الدفعة كلّه') && text().includes('«ذرة صفراء»: 5.000 طن')];
      await click(byAction('confirm-whole-return')[0]);
      const sent = named(calls, 'postSupplierReturn');
      const announced = globalThis.__flow.toasts.some((x) => x.tone === 'warning' && x.title.includes('PU-2026-0042'));
      t.same([...asked, sent.length, sent[0]?.[1], sent[0]?.[2], sent[0]?.[3], announced], [0, true, 1, 'rt-1', 3, 'ret-plan', true], 'F4: التأكيد يسمّي المادّة والكمية، والترحيل بنسخة المعاينة وبصمتها، والإعلان يسمّي الاستلام');
      await unmount();
    });

    // ── F5: stale_draft بالترحيل يقرا المرتجع من جديد ويبقى تنبيهه ──────────────────────────────────────────────────────
    await step('F5', async () => {
      const calls = fresh('accountant', returnHandlers({
        loadSupplierReturn: () => retBundle({ credits: [savedCredit] }),
        previewSupplierReturn: () => retPreview(),
        postSupplierReturn: () => {
          throw new m.RejectedError('stale_draft', 'تغيّرت المسوّدة بعد المعاينة.');
        },
      }));
      await mount('/inventory/supplier-returns/rt-1');
      await click(byAction('preview-return')[0]);
      tick(byAction('approve-return-line')[0]);
      await settle();
      await click(byAction('post-return')[0]);
      t.same([named(calls, 'postSupplierReturn').length, named(calls, 'loadSupplierReturn').length, globalThis.__flow.toasts.some((x) => x.tone === 'warning'), byAction('post-return').length], [1, 2, true, 0], 'F5: قراءة جديدة وتنبيه، والمعاينة القديمة تنشال');
      await unmount();
    });

    // ── F6: تصحيح السعر للمدير: معاينة، ثم تأكيد يسمّي الاستلام والسطر، ثم الترحيل بالمبلغ والسبب ───────────────────────────────
    await step('F6', async () => {
      const calls = fresh('manager', receiptHandlers(true, { previewReceiptRevalue: () => revaluePreview, postReceiptRevalue: () => ({ id: 'rv-1', status: 'posted' }) }));
      await mount('/inventory/receipts/pu-1');
      await click(byAction('open-revalue')[0]);
      type(byIdSuffix('-total').at(-1), '2400000');
      type(byAction('revalue-reason')[0], 'فاتورة معدّلة من المورّد');
      await settle();
      await click(byAction('preview-revalue')[0]);
      const previewed = [named(calls, 'previewReceiptRevalue'), text().includes('28,800.00') && text().includes('21,200.00')];
      await click(byAction('post-revalue')[0]);
      const confirmText = text().includes('صحّح سعر «ذرة صفراء» في الاستلام PU-2026-0042');
      const beforeConfirm = named(calls, 'postReceiptRevalue').length;
      await click(byAction('confirm-revalue')[0]);
      const sent = named(calls, 'postReceiptRevalue');
      t.same(
        [...previewed, confirmText, beforeConfirm, sent.length, sent[0]?.[1], sent[0]?.[2], sent[0]?.[3], sent[0]?.[4], named(calls, 'listLineRevaluations').length],
        [[['ra', 240_000_000n]], true, true, 0, 1, 'ra', 240_000_000n, 'plan-seen', 'فاتورة معدّلة من المورّد', 2],
        'F6: المعاينة بالمبلغ، والتأكيد يسمّي الاستلام والسطر، والترحيل بالمبلغ وبصمة المعاينة (stale_preview بالخادم) والسبب، والسجلّ ينقرا من جديد',
      );
      await unmount();
    });

    // ── F7: المحاسب: مرتجعات الاستلام بلا «مرتجع جديد» ولا تصحيح سعر ──────────────────────────────────────────────────────
    await step('F7', async () => {
      const calls = fresh('accountant', receiptHandlers(true));
      await mount('/inventory/receipts/pu-1');
      t.same([text().includes('المرتجع إلى المورّد'), byAction('new-return').length, byAction('open-revalue').length, named(calls, 'listLineRevaluations').length], [true, 0, 0, 0], 'F7: المحاسب يشوف المرتجعات، وبلا مرتجع جديد ولا تصحيح سعر');
      await unmount();
    });

    // ── F8: الأمين ينشئ مرتجعاً من الاستلام المرحَّل فينفتح، وما يشوف تصحيح السعر ──────────────────────────────────────────────
    await step('F8', async () => {
      const calls = fresh('storekeeper', {
        ...receiptHandlers(false),
        createSupplierReturnDraft: (id, receiptId, day) => retDoc({ id, receiptId, onDate: day }),
        loadSupplierReturn: (id) => retBundle({ doc: retDoc({ id }), lines: [] }),
        supplierReturnOptions: () => options,
      });
      await mount('/inventory/receipts/pu-1');
      const noCorrection = byAction('open-revalue').length === 0;
      await click(byAction('new-return')[0]);
      const sent = named(calls, 'createSupplierReturnDraft');
      t.same(
        [noCorrection, sent.length, sent[0]?.[1], sent[0]?.[2], globalThis.__flow.location, named(calls, 'loadSupplierReturn').length],
        [true, 1, 'pu-1', m.localDay(), `/inventory/supplier-returns/${sent[0]?.[0]}`, 1],
        'F8: مسوّدة بمعرّف الجهاز ويوم اليوم، وتنفتح صفحتها',
      );
      await unmount();
    });

    // ── F9: إعادة التصحيح بعد جواب ضاع بنفس المرجع؛ ومعاينة ببصمة جديدة بمرجع جديد (المرجع القديم كان يرجع «سُجّلت من محاولة سابقة» لتصحيح
    // ما انرحّل)؛ وstale_preview يعاين من جديد بدل زرّ يعيد القسمة القديمة ─────────────────────────────────────────────────────
    await step('F9', async () => {
      const plans = ['plan-1', 'plan-2', 'plan-3'];
      let previews = 0;
      let posts = 0;
      const calls = fresh('manager', receiptHandlers(true, {
        previewReceiptRevalue: () => ({ ...revaluePreview, plan: plans[previews++] }),
        postReceiptRevalue: () => {
          posts += 1;
          if (posts < 3) throw new m.UnknownOutcomeError();
          throw new m.RejectedError('stale_preview', 'تغيّرت الدفعات بعد المعاينة.');
        },
      }));
      await mount('/inventory/receipts/pu-1');
      await click(byAction('open-revalue')[0]);
      type(byIdSuffix('-total').at(-1), '2400000');
      type(byAction('revalue-reason')[0], 'فاتورة معدّلة من المورّد');
      await settle();
      const post = async () => {
        await click(byAction('post-revalue')[0]);
        await click(byAction('confirm-revalue')[0]);
      };
      await click(byAction('preview-revalue')[0]);
      await post();
      await post();
      await click(byAction('preview-revalue')[0]);
      await post();
      const sent = named(calls, 'postReceiptRevalue');
      t.same(
        [sent.length, sent[1]?.[0]?.clientRef === sent[0]?.[0]?.clientRef, sent[2]?.[0]?.clientRef !== sent[0]?.[0]?.clientRef, sent.map((args) => args[3]), named(calls, 'previewReceiptRevalue').length],
        [3, true, true, ['plan-1', 'plan-1', 'plan-2'], 3],
        'F9: الإعادة بنفس المرجع، والبصمة الجديدة بمرجع جديد، وstale_preview يعاين من جديد',
      );
      await unmount();
    });

    // ── F10: سطر الاستلام بالمرتجع من نافذة ثانية (23505 على مفتاحه): رفض يسمّيه وقراءة جديدة بلا تعديل؛ و23505 بمعرّف الجهاز تعديل ─────
    await step('F10', async () => {
      const taken = async (constraint) => {
        const calls = fresh('storekeeper', returnHandlers({
          addReturnLine: () => {
            throw new m.RejectedError('23505', null, constraint);
          },
          updateReturnLine: (id, qty) => ({ id, lineNo: 2, receiptLineId: 'rb', itemId: 'i-soy', lotId: 'lot-b', qty }),
        }));
        await mount('/inventory/supplier-returns/rt-1');
        choose(byAction('pick-receipt-line')[0], 'rb');
        await settle();
        await click(byAction('return-all-left')[0]);
        fire(byAction('add-return-line')[0].parentNode, 'submit');
        await settle();
        const result = { calls, named: text().includes('هذا السطر في المرتجع من قبل') };
        await unmount();
        return result;
      };
      const other = await taken('supplier_return_lines_doc_id_receipt_line_id_key');
      const own = await taken('supplier_return_lines_pkey');
      const ownSent = named(own.calls, 'addReturnLine')[0];
      t.same(
        [named(other.calls, 'updateReturnLine').length, named(other.calls, 'loadSupplierReturn').length, other.named, named(own.calls, 'updateReturnLine'), own.named],
        [0, 2, true, [[ownSent?.[1], 200_000n]], false],
        'F10: سطر غيرك رفض يسمّيه وقراءة جديدة بلا تعديل، ومحاولتك السابقة تعديل بكميتها',
      );
    });

    // ── F11: المبلغ الحالي يبقى آخر المعروف (2,400,000) وسجلّ التصحيحات يقرا من جديد، مو مبلغ الفاتورة ─────────────────────────────
    await step('F11', async () => {
      const posted = { id: 'rv-1', receiptLineId: 'ra', newTotal: 240_000_000n, oldTotal: 235_000_000n, diff: 5_000_000n, lotShare: 2_880_000n, expenseAmount: 2_120_000n, reason: 'فاتورة معدّلة', status: 'posted', postedAt: '2026-10-29T08:00:00Z', voidReason: null, createdAt: '2026-10-29T08:00:00Z' };
      let lists = 0;
      fresh('manager', receiptHandlers(true, {
        listLineRevaluations: () => (lists++ === 0 ? [posted] : new Promise(() => {})),
        previewReceiptRevalue: () => ({ ...revaluePreview, currentTotal: 240_000_000n, newTotal: 245_000_000n }),
        postReceiptRevalue: () => ({ id: 'rv-2', status: 'posted' }),
      }));
      await mount('/inventory/receipts/pu-1');
      const rowOf = (node) => {
        let n = node;
        while (n && n.localName !== 'tr') n = n.parentNode;
        return n?.textContent ?? '';
      };
      const before = rowOf(byAction('open-revalue')[0]);
      await click(byAction('open-revalue')[0]);
      type(byIdSuffix('-total').at(-1), '2450000');
      type(byAction('revalue-reason')[0], 'فاتورة معدّلة ثانية');
      await settle();
      await click(byAction('preview-revalue')[0]);
      await click(byAction('post-revalue')[0]);
      await click(byAction('confirm-revalue')[0]);
      const during = rowOf(byAction('open-revalue')[0]);
      t.same([lists, before.includes('2,400,000'), during.includes('2,400,000'), during.includes('2,350,000')], [2, true, true, false], 'F11: وهو يقرا السجلّ من جديد يبقى آخر المعروف، مو مبلغ الفاتورة');
      await unmount();
    });

    // ── F12: المقبول المحفوظ (480,000) يبقى بالحقل لمّا قراءة بدت قبل الكتابة ترجع بالقديم (470,000)، بلا تعارض ─────────────────────
    await step('F12', async () => {
      const calls = fresh('accountant', returnHandlers({ loadSupplierReturn: () => retBundle({ credits: [savedCredit] }), setReturnCredit: () => undefined }));
      await mount('/inventory/supplier-returns/rt-1');
      type(byIdSuffix('-credit-a')[0], '480000');
      await settle();
      await click(byAction('save-credits')[0]);
      t.same([named(calls, 'loadSupplierReturn').length, byIdSuffix('-credit-a')[0]?.value, text().includes('من نافذة أو جهاز آخر بعد أن بدأت تعديله')], [2, '480000', false], 'F12: بعد الحفظ والقراءة القديمة يبقى 480,000 بلا تعارض');
      await unmount();
    });

    // ── F13: stale_preview بترحيل المرتجع (متبقّي دفعة تغيّر بعد المعاينة): معاينة جديدة بقيمها، والموافقة تنعاد قبل الترحيل ──────────────
    await step('F13', async () => {
      let previews = 0;
      const calls = fresh('accountant', returnHandlers({
        loadSupplierReturn: () => retBundle({ credits: [savedCredit] }),
        previewSupplierReturn: () => retPreview({ plan: `ret-plan-${++previews}` }),
        postSupplierReturn: () => {
          throw new m.RejectedError('stale_preview', 'تغيّر متبقّي دفعة بعد المعاينة فتغيّرت قيمة المُرجَع.');
        },
      }));
      await mount('/inventory/supplier-returns/rt-1');
      await click(byAction('preview-return')[0]);
      tick(byAction('approve-return-line')[0]);
      await settle();
      await click(byAction('post-return')[0]);
      t.same(
        [named(calls, 'postSupplierReturn').map((args) => args[3]), named(calls, 'previewSupplierReturn').length, disabled(byAction('post-return')[0]), text().includes('تغيّر متبقّي دفعة بعد المعاينة')],
        [['ret-plan-1'], 2, true, true],
        'F13: الترحيل ببصمة المعاينة، وstale_preview يعاين من جديد ويطلب الموافقة، والسبب ظاهر',
      );
      await unmount();
    });
  } finally {
    restore();
  }
}
