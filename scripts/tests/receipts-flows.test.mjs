// شاشة الاستلام التفاعلية (مراجعة WP6): react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل StockRoutes الحقيقية، وrepo الشراء
// والمخزون والجلسة والرسائل بدائل. كل حالة كانت تفشل على الشفرة قبل الإصلاح: R1 تاريخ انتهاء بعد اليوم ينقبل (postingDay كان يرفض
// أي انتهاء)؛ R2 المبلغ المكتوب يبقى لمّا يقرا الاستلام من جديد (اللوحة كانت تنطوي)؛ R3 الترحيل ممتنع ومبالغ ما انحفظت؛ R4 السالب
// ما يوقّع الصفحة؛ R5 خصم مو مبلغ يوقف الحفظ (كان ينحفظ صفراً)؛ R6 stale_draft بالترحيل يقرا الاستلام من جديد؛ R7 سبب الصفر لمبلغ
// صفر بس، والكتابة مشروطة بالمحفوظ؛ R8 المعاينة لمن يكتب المسوّدة أو مبالغها بس؛ R9 آخر سطر مختار للتحميل ما يُشال بصمت، والكل
// بزرّه؛ R10 حذف السطر بتأكيد يسمّيه.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const PURCHASING = [
  'loadReceipt', 'listReceipts', 'createReceiptDraft', 'addReceiptLine', 'updateReceiptLine', 'deleteReceiptLine', 'discardReceipt', 'setLineTotal', 'setReceiptAmounts',
  'addCharge', 'updateCharge', 'deleteCharge', 'setChargeLines', 'searchSuppliers', 'supplierTwins', 'createSupplier', 'listBoxes', 'previewReceipt', 'postReceipt', 'voidReceipt',
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
  name: 'receipt-flow-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/(purchasing|inventory)$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'receipt-flow' }));
    b.onLoad({ filter: /.*/, namespace: 'receipt-flow' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
  },
};

async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route } from 'react-router-dom';",
    "export { default as StockRoutes } from './src/pages/inventory/StockRoutes.tsx';",
    "export { onlineStore } from './src/lib/online.ts';",
    "export { searchable } from './src/domain/normalize.ts';",
    "export { RejectedError } from './src/lib/errors.ts';",
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
const click = async (node) => {
  fire(node, 'click');
  await settle();
};

export default async function (t) {
  const restore = installDom();
  try {
    const m = await bundle();
    const ws = (role) => ({ userId: `u-${role}`, orgId: 'org-1', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role, scopes: [], divisions: ['general'], canSeeCost: role !== 'storekeeper', canSeeAccounts: role === 'accountant', canSeeSales: false, invites: [], subscription: 'active', confirmedAt: 1 });
    const org = {
      divisions: [{ id: 'd-gen', kind: 'general', goLiveOn: '2026-10-01', frozen: true }],
      sites: [],
      packTypes: [],
      itemCategories: [],
      expenseCategories: [],
      warehouses: [{ id: 'w-gen', version: 1, archived: false, divisionId: 'd-gen', siteId: 's-gen', name: 'المخزن العام', kind: 'general', hasBalance: true }],
    };
    const ointment = { id: 'i-oil', version: 1, archived: false, name: 'زيت محرّك', nameNorm: m.searchable('زيت محرّك'), categoryId: null, kind: 'other', baseUnit: 'L', density: null, pieceMassKg: null, tracksExpiry: true, scaleStep: 1000n, minQty: null, barcode: null, altCodes: [] };
    const doc = (over = {}) => ({ id: 'r-1', status: 'draft', version: 4, docNo: null, partyId: 'p-1', partyName: 'مورّد الزيوت', warehouseId: 'w-gen', bookId: 'b-gen', onDate: '2026-10-30', note: null, posted: false, voidReason: null, createdAt: '2026-10-30T08:00:00Z', ...over });
    const line = (id, name, over = {}) => ({ id, lineNo: 1, itemId: `i-${id}`, itemName: name, itemKind: 'other', baseUnit: 'kg', tracksExpiry: false, itemUnitId: null, unitCode: null, unitLabel: 'kg', qtyInUnit: 100_000n, qty: 100_000n, expiryOn: null, bornAt: null, supplierLotNo: null, density: null, pieceMass: null, ...over });
    const lineA = line('l-1', 'شحم');
    const lineB = line('l-2', 'فلتر', { lineNo: 2 });
    const charge = (over = {}) => ({ id: 'c-1', chargeNo: 1, label: 'نقل', amount: 1_000_000n, allocateBy: 'mass', payeePartyId: null, cashAccountId: 'box-1', allLines: true, lineIds: [], ...over });
    const bundleOf = (over = {}) => ({ doc: doc(), lines: [lineA], lineAmounts: [], amounts: null, charges: [], ...over });
    const preview = (over = {}) => ({ version: 4, bookId: 'b-gen', problems: [], ready: true, money: null, lines: [{ lineId: 'l-1', lineNo: 1, itemId: 'i-l-1', itemName: 'شحم', baseUnit: 'kg', unitLabel: 'kg', qtyInUnit: 100_000n, qty: 100_000n, expiryOn: null, problem: null, warning: null }], ...over });

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
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(m.Routes, null, m.h(m.Route, { path: '/inventory/*', element: m.h(m.StockRoutes) })))));
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
    // كل حالة لحالها: رمية بحالة (زرّ ما موجود بالشفرة القديمة) تنحسب فشلها وما توقف اللي بعدها.
    const step = async (name, fn) => {
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${name}: رمى ${error}`);
        await unmount();
      }
    };
    const handlers = (over = {}) => ({ loadOrgSetup: () => org, listBoxes: () => [{ id: 'box-1', name: 'الصندوق الرئيسي' }], loadReceipt: () => bundleOf(), ...over });
    const lineTotal = (lineId) => byIdSuffix(`-total-${lineId}`)[0];
    m.onlineStore.set(true);

    // ── R1: الأمين يضيف مادّة بانتهاء بعد اليوم (31/12/2027) ─────────────────────────────────────────────────────────────
    await step('R1', async () => {
      const calls = fresh('storekeeper', handlers({ listItems: () => ({ rows: [ointment], total: 1, next: null }), listItemUnits: () => [], addReceiptLine: () => ({}), loadReceipt: () => bundleOf({ lines: [] }) }));
      await mount('/inventory/receipts/r-1');
      type(byAction('search-item')[0], 'زيت');
      await settle();
      await click(byAction('pick-item')[0]);
      type(byIdSuffix('-qty')[0], '20');
      type(byIdSuffix('-expiry')[0], '31/12/2027');
      await settle();
      fire(byAction('add-receipt-line')[0].parentNode, 'submit');
      await settle();
      const sent = named(calls, 'addReceiptLine');
      t.same([sent.length, sent[0]?.[2]?.expiry_on, sent[0]?.[2]?.qty_in_unit], [1, '2027-12-31', '20.000'], 'R1: انتهاء بعد اليوم ينقبل ويُرسل يوماً بالتقويم');
      await unmount();
    });

    // ── R2: المبلغ المكتوب يبقى لمّا يقرا الاستلام من جديد (حذف تحميل يعيد القراءة) ─────────────────────────────────────────
    await step('R2', async () => {
      let reads = 0;
      const calls = fresh('accountant', handlers({ loadReceipt: () => (reads++ === 0 ? bundleOf({ charges: [charge()] }) : bundleOf()), deleteCharge: () => true }));
      await mount('/inventory/receipts/r-1');
      type(lineTotal('l-1'), '2350000');
      await settle();
      await click(byAction('delete-charge')[0]);
      t.same([named(calls, 'loadReceipt').length, lineTotal('l-1')?.value, byAction('delete-charge').length], [2, '2350000', 0], 'R2: قراءة جديدة (بلا التحميل المحذوف) والمبلغ المكتوب باقٍ بحقله');
      await unmount();
    });

    // ── R3: الترحيل ممتنع ومبالغ ما انحفظت، وينفتح بعد التراجع عنها ─────────────────────────────────────────────────────────
    await step('R3', async () => {
      const priced = bundleOf({ lineAmounts: [{ id: 'la-1', lineId: 'l-1', lineTotal: 235_000_000n, zeroReason: null }] });
      fresh('accountant', handlers({ loadReceipt: () => priced, previewReceipt: () => preview() }));
      await mount('/inventory/receipts/r-1');
      await click(byAction('preview-receipt')[0]);
      tick(byAction('approve-line')[0]);
      await settle();
      const clean = disabled(byAction('post-receipt')[0]);
      type(lineTotal('l-1'), '2400000');
      await settle();
      const dirty = [disabled(byAction('post-receipt')[0]), text().includes('في المبالغ تعديل لم يُحفظ')];
      await click(byAction('undo-amounts')[0]);
      t.same([clean, ...dirty, disabled(byAction('post-receipt')[0]), lineTotal('l-1')?.value], [false, true, true, false, '2350000'], 'R3: الترحيل ممتنع والمبالغ معدّلة ما انحفظت، وبعد التراجع يرجع والحقل بالمحفوظ');
      await unmount();
    });

    // ── R4: السالب بمبلغ سطر (والتحميل بالقيمة) ما يوقّع الصفحة ──────────────────────────────────────────────────────────────
    await step('R4', async () => {
      fresh('accountant', handlers({ loadReceipt: () => bundleOf({ lines: [lineA, lineB], charges: [charge({ allocateBy: 'value' })] }) }));
      await mount('/inventory/receipts/r-1');
      type(lineTotal('l-1'), '-5');
      await settle();
      t.ok(byAction('save-amounts').length === 1 && text().includes('اكتب المبلغ بالدينار الصحيح'), 'R4: «-5» خطأ بالحقل والصفحة باقية');
      await unmount();
    });

    // ── R5: خصم مو مبلغ يوقف الحفظ بجملته (كان ينحفظ صفراً بدل الخصم المحفوظ) ──────────────────────────────────────────────
    await step('R5', async () => {
      const saved = bundleOf({ lineAmounts: [{ id: 'la-1', lineId: 'l-1', lineTotal: 235_000_000n, zeroReason: null }], amounts: { id: 'ra-1', discount: 100_000n, paidNow: 0n, cashAccountId: null } });
      const calls = fresh('accountant', handlers({ loadReceipt: () => saved, setReceiptAmounts: () => undefined, setLineTotal: () => undefined }));
      await mount('/inventory/receipts/r-1');
      type(byIdSuffix('-discount')[0], 'ألف');
      await settle();
      await click(byAction('save-amounts')[0]);
      t.same([named(calls, 'setReceiptAmounts').length, named(calls, 'setLineTotal').length, text().includes('اكتب الخصم بالدينار الصحيح')], [0, 0, true], 'R5: لا كتابة، والجملة تسمّي الخصم');
      await unmount();
    });

    // ── R6: stale_draft بالترحيل يقرا الاستلام من جديد ويبقى تنبيهه ──────────────────────────────────────────────────────────
    await step('R6', async () => {
      const priced = bundleOf({ lineAmounts: [{ id: 'la-1', lineId: 'l-1', lineTotal: 235_000_000n, zeroReason: null }] });
      const calls = fresh('accountant', handlers({ loadReceipt: () => priced, previewReceipt: () => preview(), postReceipt: () => { throw new m.RejectedError('stale_draft', 'تغيّرت المسوّدة بعد المعاينة.'); } }));
      await mount('/inventory/receipts/r-1');
      await click(byAction('preview-receipt')[0]);
      tick(byAction('approve-line')[0]);
      await settle();
      await click(byAction('post-receipt')[0]);
      t.same([named(calls, 'postReceipt').length, named(calls, 'loadReceipt').length, globalThis.__flow.toasts.some((x) => x.tone === 'warning'), byAction('post-receipt').length], [1, 2, true, 0], 'R6: قراءة جديدة وتنبيه، والمعاينة القديمة تنشال');
      await unmount();
    });

    // ── R7: سبب الصفر للصفر بس، والكتابة مشروطة بالصفّ المحفوظ ─────────────────────────────────────────────────────────────
    await step('R7', async () => {
      const gift = { id: 'la-1', lineId: 'l-1', lineTotal: 0n, zeroReason: 'هدية' };
      const calls = fresh('accountant', handlers({ loadReceipt: () => bundleOf({ lineAmounts: [gift] }), setLineTotal: () => undefined }));
      await mount('/inventory/receipts/r-1');
      type(lineTotal('l-1'), '100');
      await settle();
      await click(byAction('save-amounts')[0]);
      const sent = named(calls, 'setLineTotal');
      t.same([sent.length, sent[0]?.[0], sent[0]?.[1], sent[0]?.[2], sent[0]?.[3]], [1, 'l-1', gift, 10_000n, null], 'R7: 100 دينار بلا سبب الصفر القديم، ومشروطة بالصفّ (0، «هدية»)');
      await unmount();
    });

    // ── R8: المعاينة لمن يكتب المسوّدة أو مبالغها بس ─────────────────────────────────────────────────────────────────────
    await step('R8', async () => {
      fresh('viewer', handlers());
      await mount('/inventory/receipts/r-1');
      t.same([text().includes('شحم'), byAction('preview-receipt').length, byAction('discard-receipt').length], [true, 0, 0], 'R8: القارئ يشوف السطور بلا زرّ معاينة');
      await unmount();
    });

    // ── R9: آخر سطر مختار للتحميل ما يُشال بصمت (الفارغ = كل السطور)، والكل بزرّه الصريح ─────────────────────────────────────
    await step('R9', async () => {
      const calls = fresh('accountant', handlers({ loadReceipt: () => bundleOf({ lines: [lineA, lineB], charges: [charge({ allLines: false, lineIds: ['l-1'] })] }), setChargeLines: () => undefined }));
      await mount('/inventory/receipts/r-1');
      const boxes = byAction('pick-charge-line');
      const lastLocked = disabled(boxes[0]) && !disabled(boxes[1]);
      await click(byAction('charge-all-lines')[0]);
      t.same([lastLocked, named(calls, 'setChargeLines')], [true, [['c-1', [], 4]]], 'R9: خانة آخر سطر مقفولة، و«وزّعه على كل السطور» يرسل الفارغ بنسخة الشاشة');
      await unmount();
    });

    // ── R10: حذف السطر بتأكيد يسمّيه ─────────────────────────────────────────────────────────────────────────────────────
    await step('R10', async () => {
      const calls = fresh('storekeeper', handlers({ deleteReceiptLine: () => ({ deleted: true, version: 5 }), listItems: () => ({ rows: [], total: 0, next: null }) }));
      await mount('/inventory/receipts/r-1');
      await click(byAction('delete-line')[0]);
      const asked = [named(calls, 'deleteReceiptLine').length, text().includes('احذف سطر «شحم»')];
      await click(byAction('confirm-delete-line')[0]);
      t.same([...asked, named(calls, 'deleteReceiptLine')], [0, true, [['l-1', 4]]], 'R10: لا حذف قبل التأكيد، وبعده بنسخة الشاشة');
      await unmount();
    });

    // ── R11 (مراجعة WP8): تحميل مكتوب لم يُضف، أو إضافة جارية، توقف الترحيل بتنبيه (كان الاستلام يترحّل بلا التحميل فيضيع قيد الناقل) ──
    await step('R11', async () => {
      const priced = bundleOf({ lineAmounts: [{ id: 'la-1', lineId: 'l-1', lineTotal: 235_000_000n, zeroReason: null }] });
      const calls = fresh('accountant', handlers({ loadReceipt: () => priced, previewReceipt: () => preview(), addCharge: () => new Promise(() => {}) }));
      await mount('/inventory/receipts/r-1');
      await click(byAction('preview-receipt')[0]);
      tick(byAction('approve-line')[0]);
      await settle();
      const clean = disabled(byAction('post-receipt')[0]);
      type(byIdSuffix('-amount').at(-1), '50000');
      await settle();
      const typed = [disabled(byAction('post-receipt')[0]), text().includes('في التحميلات مبلغ مكتوب لم يُضف بعد')];
      fire(all().find((n) => n.getAttribute('role') === 'radio' && n.textContent === 'من صندوق الآن'), 'click');
      await settle();
      const boxPick = byAction('pick-box').at(-1);
      boxPick.value = 'box-1';
      fire(boxPick, 'change');
      await settle();
      fire(byAction('add-charge')[0]?.parentNode, 'submit');
      await settle();
      const inFlight = [named(calls, 'addCharge').length, disabled(byAction('post-receipt')[0])];
      await click(byAction('post-receipt')[0]);
      t.same([clean, ...typed, ...inFlight, named(calls, 'postReceipt').length], [false, true, true, 1, true, 0], 'R11: المبلغ المكتوب والإضافة الجارية يوقفان الترحيل بتنبيه، وما ينرسل ترحيل');
      await unmount();
    });
  } finally {
    restore();
  }
}
