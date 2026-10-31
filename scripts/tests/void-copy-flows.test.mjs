// الإلغاء باختيار ونسخة للتصحيح تفاعلياً (0011، قرار المالك 2026-10-31): react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل
// StockRoutes الحقيقية، وrepo الشراء والمخزون والصرف والجرد والجلسة والرسائل بدائل بحالة بالذاكرة (الإلغاء يقلب المستند ملغى، والنسخ ينشئ
// ورقة بالمعرّف المرسل). V1 «ألغِ كلّه»: لا اختيار مسبق، والزرّ يسمّي المختار، والإلغاء وحده؛ V2 «ألغِ وافتح نسخة للتصحيح»: الإلغاء ثم
// النسخ بمعرّف الجهاز ثم الورقة الجديدة بتنبيه ما لم يُنسخ ورابط الأصل؛ V3 النسخ فشل بعد إلغاء ناجح ← صفحة الأصل الملغى بسببه و«افتح
// نسخة للتصحيح» بزوج جديد؛ V4 جواب النسخ ضاع ← الإعادة بنفس المعرّف والمرجع؛ V5 الأمين (بلا كلفة) يفتح نسخة من ملغى وتنبيهه «المبالغ»
// بلا مال، والمحاسب والمشاهد بلا الزرّ، والورقة المحذوفة (ملغاة بلا رقم) بلا الزرّ، وV5c الزرّ بفعل إنشاء ورقة النوع (الافتتاح للمدير)
// وبنطاق مخزن التحويل المرسِل؛ V6 رفض الإلغاء (count_superseded) يبقى بالنافذة
// بلا نسخ؛ V7 الأنواع الخمسة الباقية بنوعها ومسارها، والجرد يحفظ فشل النسخ بعد قراءته الجديدة؛ V8 إلغاء تصحيح السعر بلا خيارين.
// والمراجعة: V9 نسخة مستند أقدم من 7 أيام (01/10/2026) بالأنواع الخمسة: الورقة بحقل تاريخ يُحفظ بدالّة نوعها فيختفي تنبيه «خارج المسموح»
// (FE-1)؛ V10 المحاسب يفتح نسخة الاستلام برابطها (بلا حالة الانتقال): أصلها ومدفوعه وتحميل صندوقه من الخادم، والأمين بلا مال (FE-2)؛
// V11 «احفظها نهائياً» لمن يحفظ النوع بس: الأمين بالاستلام «يحفظها المحاسب أو المدير»، وبالجرد «سلّمها للمراجعة»، وبالإتلاف «يحفظها المدير»
// (FE-3)؛ و«ملغى» قبل اسم الأصل (FE-4، V7).
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const PURCHASING = ['loadReceipt', 'loadReceiptOrigin', 'listReceipts', 'listBoxes', 'searchSuppliers', 'listReceiptReturns', 'listLineRevaluations', 'voidReceipt', 'voidReceiptRevalue', 'loadSupplierReturn', 'supplierReturnOptions', 'voidSupplierReturn', 'updateReceiptDraft', 'updateSupplierReturnDraft'];
const INVENTORY = ['loadOrgSetup', 'listItems', 'listItemUnits', 'loadStockDoc', 'voidTransferDoc', 'voidOpening', 'copyDocToDraft', 'listStockDocs', 'updateStockDraft'];
const USES = ['loadUse', 'voidUse', 'updateUseDraft'];
const COUNTS = ['loadCount', 'previewCount', 'voidCount', 'updateCountDraft'];
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__flow.call('${n}', a);`).join(' ')}`;
const STUBS = {
  purchasing: routed('purchasing', PURCHASING),
  inventory: routed('inventory', INVENTORY),
  uses: routed('uses', USES),
  counts: routed('counts', COUNTS),
  session: 'export const useSession = () => globalThis.__flow.session; export const sessionStore = { get: () => globalThis.__flow?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__flow.toasts.push(spec); }; export function Toaster() { return null; }',
};
const stubs = {
  name: 'void-copy-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/(purchasing|inventory|uses|counts)$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'void-copy' }));
    b.onLoad({ filter: /.*/, namespace: 'void-copy' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
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
    "export { fmtDay } from './src/lib/format.ts';",
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
const disabled = (node) => node?.getAttribute('disabled') !== null && node?.getAttribute('disabled') !== undefined;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const type = (input, value) => {
  input.value = value;
  fire(input, 'input');
};
const click = async (node) => {
  fire(node, 'click', { button: 0 });
  await settle();
};
const pick = async (radio) => {
  radio.checked = true;
  fire(radio, 'click');
  await settle();
};

export default async function (t) {
  const restore = installDom();
  try {
    const m = await bundle();
    const ws = (role, scopes = role === 'storekeeper' ? [{ warehouseId: 'w-raw' }] : []) => ({ userId: `u-${role}`, orgId: 'org-1', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role, scopes, divisions: ['feed_mill', 'general'], canSeeCost: ['owner', 'manager', 'accountant'].includes(role), canSeeAccounts: role === 'accountant', canSeeSales: false, invites: [], subscription: 'active', confirmedAt: 1 });
    const org = {
      divisions: [
        { id: 'd-mill', kind: 'feed_mill', goLiveOn: '2026-10-01', frozen: true },
        { id: 'd-gen', kind: 'general', goLiveOn: '2026-10-01', frozen: true },
      ],
      sites: [],
      packTypes: [],
      itemCategories: [],
      expenseCategories: [{ id: 'cat-1', version: 1, archived: false, name: 'صيانة', systemCode: null }],
      warehouses: [
        { id: 'w-raw', version: 1, archived: false, divisionId: 'd-mill', siteId: 's-mill', name: 'مخزن المواد الأوّلية', kind: 'raw', hasBalance: true },
        { id: 'w-gen', version: 1, archived: false, divisionId: 'd-gen', siteId: 's-gen', name: 'المخزن العام', kind: 'general', hasBalance: true },
        { id: 'w-gen2', version: 1, archived: false, divisionId: 'd-gen', siteId: 's-gen', name: 'مخزن الصيانة', kind: 'general', hasBalance: true },
      ],
    };

    // ── المستندات بحالة بالذاكرة: الإلغاء يقلبها «ملغى» بسببه، والنسخ ينشئ ورقة بالمعرّف المرسل بنفس السطور ─────────────────────────
    const at = '2026-10-29T08:00:00Z';
    const receiptLine = { id: 'ra', lineNo: 1, itemId: 'i-corn', itemName: 'ذرة صفراء', itemKind: 'raw', baseUnit: 'kg', tracksExpiry: false, itemUnitId: null, unitCode: null, unitLabel: 'kg', qtyInUnit: 5_000_000n, qty: 5_000_000n, expiryOn: null, bornAt: null, supplierLotNo: null, density: null, pieceMass: null };
    const receipt = (id, over = {}) => ({ id, status: 'posted', version: 7, docNo: 'PU-2026-0042', partyId: 'p-1', partyName: 'مورّد الحبوب', warehouseId: 'w-raw', bookId: 'b-mill', onDate: '2026-10-28', note: null, posted: true, voidReason: null, createdAt: at, ...over });
    const transfer = (id, over = {}) => ({ id, kind: 'transfer', status: 'posted', version: 2, docNo: 'TR-2026-0007', warehouseId: 'w-gen', toWarehouseId: 'w-gen2', onDate: '2026-10-29', note: null, posted: true, voidReason: null, createdAt: at, ...over });
    const opening = (id, over = {}) => ({ id, kind: 'opening', status: 'posted', version: 2, docNo: null, warehouseId: 'w-gen', toWarehouseId: null, onDate: '2026-10-01', note: null, posted: true, voidReason: null, createdAt: at, ...over });
    const use = (id, over = {}) => ({ id, status: 'posted', version: 3, docNo: 'SU-2026-0001', warehouseId: 'w-gen', categoryId: 'cat-1', onDate: '2026-10-29', note: null, posted: true, voidReason: null, createdAt: at, ...over });
    const count = (id, over = {}) => ({ id, status: 'approved', version: 8, docNo: 'CT-2026-0003', warehouseId: 'w-gen', onDate: '2026-10-29', note: null, submittedAt: at, returnReason: null, voidReason: null, createdAt: at, ...over });
    const retDoc = (id, over = {}) => ({ id, status: 'posted', version: 3, docNo: 'RT-2026-0003', receiptId: 'pu-1', partyId: 'p-1', warehouseId: 'w-raw', bookId: 'b-mill', onDate: '2026-10-29', note: null, posted: true, voidReason: null, createdAt: at, ...over });
    const kazTransfer = { id: 'tl-1', lineNo: 1, itemId: 'i-kaz', itemName: 'كاز أويل', baseUnit: 'L', itemUnitId: null, unitCode: null, unitLabel: 'L', qtyInUnit: 50_000n, qty: 50_000n };
    const kazOpening = { id: 'ol-1', lineNo: 1, itemId: 'i-kaz', itemName: 'كاز أويل', baseUnit: 'L', qty: 50_000n, value: 1_000_000n, zeroReason: null, expiryOn: null, bornAt: null };
    const kazUse = { id: 'ul-1', lineNo: 1, itemId: 'i-kaz', itemName: 'كاز أويل', baseUnit: 'L', itemUnitId: null, unitCode: null, unitLabel: 'L', qtyInUnit: 10_000n, qty: 10_000n, lotId: null };
    const kazCount = { id: 'cl-1', lineNo: 1, itemId: 'i-kaz', itemName: 'كاز أويل', itemKind: 'fuel', baseUnit: 'L', tracksExpiry: false, counted: 38_000n, countedExpired: null, gainExpiryOn: null, gainExpiredExpiryOn: null, gainBornAt: null, reason: null };
    const cornReturn = { id: 'rl-1', lineNo: 1, receiptLineId: 'ra', itemId: 'i-corn', lotId: 'lot-a', qty: 1_000_000n, itemName: 'ذرة صفراء', baseUnit: 'kg' };
    const reviewLine = { lineId: 'cl-1', lineNo: 1, itemId: 'i-kaz', itemName: 'كاز أويل', itemKind: 'fuel', baseUnit: 'L', tracksExpiry: false, counted: 38_000n, countedExpired: null, systemQty: 40_000n, systemExpiredQty: null, diff: -2_000n, expiredDiff: null, nowQty: 40_000n, nowExpiredQty: null, stale: false, gainExpiryOn: null, gainExpiredExpiryOn: null, gainBornAt: null, reason: 'تسرّب', reasonStale: false, gainSource: null, referenceLotId: null, problem: null, draws: [], expiredDraws: [], shortageValue: null, gainValue: null, gainUnitCost: null, referenceValueIn: null, referenceQtyIn: null };

    /** المخزن بالذاكرة: id ← { kind, doc }؛ voided يقلب، وcopied ينشئ ورقة جديدة بنوعها. */
    const store = () => {
      const docs = new Map();
      const put = (kind, doc) => docs.set(doc.id, { kind, doc });
      const voided = (id, reason) => {
        const entry = docs.get(id);
        entry.doc = { ...entry.doc, status: 'void', voidReason: reason };
        return { id, status: 'void', docNo: entry.doc.docNo ?? null };
      };
      // الاستلام المنسوخ يحمل أصله (copied_from، 0011) مثل الخادم.
      const copied = (kind, id, newId) => {
        const source = docs.get(id).doc;
        put(kind, { ...source, id: newId, status: 'draft', version: 1, docNo: null, posted: false, voidReason: null, submittedAt: kind === 'count' ? null : source.submittedAt, ...(kind === 'receipt' ? { copiedFrom: id } : {}) });
      };
      /** تاريخ ورقة يتغيّر (update*Draft): النسخة تزيد مثل حارس الرأس. */
      const redated = (id, day) => {
        const entry = docs.get(id);
        entry.doc = { ...entry.doc, onDate: day, version: entry.doc.version + 1 };
        return entry.doc;
      };
      return { docs, put, voided, copied, redated, get: (id) => docs.get(id).doc };
    };

    const fresh = (role, handlers, scopes) => {
      const calls = [];
      globalThis.__flow = {
        session: { status: 'ready', workspace: ws(role, scopes), offline: false },
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
    const step = async (name, fn) => {
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${name}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
    };
    /** يفتح نافذة الإلغاء، يختار (أو لا)، يكتب السبب، ويضغط الزرّ. */
    const voidWith = async (voidAction, choice, reason = 'كمية خطأ') => {
      await click(byAction(voidAction)[0]);
      if (choice) await pick(byAction(`void-choice-${choice}`)[0]);
      type(all().find((n) => n.id === 'stock-void-reason'), reason);
      await settle();
      await click(byAction('confirm-void')[0]);
    };
    m.onlineStore.set(true);

    // الاستلام: handlers بحالة المخزن (الإلغاء ثم النسخ يقلبان ما يرجّعه loadReceipt).
    const receiptHandlers = (db, over = {}) => ({
      loadOrgSetup: () => org,
      listBoxes: () => [],
      listReceiptReturns: () => [],
      listLineRevaluations: () => [],
      loadReceipt: (id, withMoney) => ({ doc: db.get(id), lines: [receiptLine], lineAmounts: withMoney ? [{ id: 'la', lineId: 'ra', lineTotal: 235_000_000n, zeroReason: null }] : [], amounts: null, charges: [] }),
      // أصل الورقة المنسوخة (copied_from): المال لأدوار الكلفة بس، مثل سياسة الكلفة بالخادم.
      loadReceiptOrigin: (id, withMoney) => ({ id, docNo: db.get(id).docNo, paidNow: withMoney && Boolean(db.get(id).paidNow), boxCharge: withMoney && Boolean(db.get(id).boxCharge) }),
      voidReceipt: (ref, id, reason) => db.voided(id, reason),
      copyDocToDraft: (ref, kind, id, newId) => {
        db.copied(kind, id, newId);
        return { id: newId, kind, lines: 1, skipped: ['paid_now', 'box_charge'] };
      },
      ...over,
    });

    // ── V1: «ألغِ كلّه»: لا اختيار مسبق (الزرّ معطّل بالسبب وحده)، والزرّ يسمّي المختار، والإلغاء وحده بلا نسخ ─────────────────────────
    await step('V1', async () => {
      const db = store();
      db.put('receipt', receipt('pu-1'));
      const calls = fresh('manager', receiptHandlers(db));
      await mount('/inventory/receipts/pu-1');
      await click(byAction('void-receipt')[0]);
      const radios = [byAction('void-choice-copy').length, byAction('void-choice-all').length];
      type(all().find((n) => n.id === 'stock-void-reason'), 'كمية خطأ');
      await settle();
      const reasonOnly = disabled(byAction('confirm-void')[0]);
      await pick(byAction('void-choice-copy')[0]);
      const copyLabel = byAction('confirm-void')[0].textContent;
      await pick(byAction('void-choice-all')[0]);
      const allLabel = byAction('confirm-void')[0].textContent;
      const ready = !disabled(byAction('confirm-void')[0]);
      await click(byAction('confirm-void')[0]);
      const sent = named(calls, 'voidReceipt');
      t.same([radios, reasonOnly, copyLabel, allLabel, ready], [[1, 1], true, 'ألغِ وافتح نسخة للتصحيح', 'ألغِ كلّه', true], 'V1: خياران بلا اختيار مسبق، والزرّ معطّل بالسبب وحده ثم يسمّي المختار');
      t.same(
        [sent.length, sent[0]?.[1], sent[0]?.[2], UUID.test(sent[0]?.[0]?.clientRef ?? ''), named(calls, 'copyDocToDraft').length, globalThis.__flow.location, byAction('confirm-void').length, text().includes('أُلغي هذا الاستلام'), byAction('copy-to-draft').length],
        [1, 'pu-1', 'كمية خطأ', true, 0, '/inventory/receipts/pu-1', 0, true, 1],
        'V1: «ألغِ كلّه» يلغي بمرجعه بلا نسخ، والصفحة تبقى بالأصل الملغى ويّا «افتح نسخة للتصحيح»',
      );
    });

    // ── V2: «ألغِ وافتح نسخة للتصحيح»: الإلغاء ثم النسخ بمعرّف الجهاز ثم الورقة الجديدة بتنبيه ما لم يُنسخ ورابط الأصل ─────────────────
    await step('V2', async () => {
      const db = store();
      db.put('receipt', receipt('pu-2'));
      const calls = fresh('manager', receiptHandlers(db));
      await mount('/inventory/receipts/pu-2');
      await voidWith('void-receipt', 'copy');
      const order = calls.map(([n]) => n).filter((n) => n === 'voidReceipt' || n === 'copyDocToDraft');
      const [copy] = named(calls, 'copyDocToDraft');
      const newId = copy?.[3];
      const original = byAction('open-original')[0];
      t.same(
        [order, copy?.[1], copy?.[2], UUID.test(newId ?? ''), UUID.test(copy?.[0]?.clientRef ?? ''), globalThis.__flow.location],
        [['voidReceipt', 'copyDocToDraft'], 'receipt', 'pu-2', true, true, `/inventory/receipts/${newId}`],
        'V2: الإلغاء أوّلاً ثم copy_doc_to_draft بالنوع والأصل ومعرّف ومرجع من الجهاز، والصفحة صارت الورقة الجديدة',
      );
      t.same(
        [text().includes('نسخة للتصحيح من مستند ملغى: الاستلام PU-2026-0042.'), text().includes('المدفوع للمورّد عند الاستلام'), text().includes('التحميلات المدفوعة من صندوق'), original?.getAttribute('href'), text().includes('استلام غير محفوظ بعد')],
        [true, true, true, '/inventory/receipts/pu-2', true],
        'V2: الورقة الجديدة غير محفوظة وتنبيهها يسمّي الأصل وما لم يُنسخ (المدفوع وتحميل الصندوق) ورابط الأصل الملغى',
      );
      // الرجوع للأصل برابطه: يدلّ على النسخة اللي انفتحت بهذه الجلسة، والزرّ «نسخة أخرى» (ورقتان من أصل واحد بالغلط تنحفظان مرّتين).
      await click(original);
      t.same(
        [globalThis.__flow.location, text().includes('فُتحت من هذه الورقة نسخة للتصحيح في هذه الجلسة'), byAction('open-copy')[0]?.getAttribute('href'), byAction('copy-to-draft')[0]?.textContent, named(calls, 'copyDocToDraft').length],
        ['/inventory/receipts/pu-2', true, `/inventory/receipts/${newId}`, 'افتح نسخة أخرى للتصحيح', 1],
        'V2: صفحة الأصل الملغى تدلّ على النسخة المفتوحة برابطها، والزرّ «افتح نسخة أخرى للتصحيح»، بلا نسخ جديد',
      );
    });

    // ── V3: النسخ رُفض بعد إلغاء ناجح: النافذة تنغلق والأصل الملغى يبيّن السبب و«افتح نسخة للتصحيح»، والإعادة بزوج جديد تفتح الورقة ──────
    await step('V3', async () => {
      const db = store();
      db.put('receipt', receipt('pu-3'));
      let tries = 0;
      const calls = fresh(
        'manager',
        receiptHandlers(db, {
          copyDocToDraft: (ref, kind, id, newId) => {
            tries += 1;
            if (tries === 1) throw new m.RejectedError('id_reused', 'معرّف الورقة الجديدة مستعمل لمستند آخر. حدّث الشاشة وأعد المحاولة.');
            db.copied(kind, id, newId);
            return { id: newId, kind, lines: 1, skipped: [] };
          },
        }),
      );
      await mount('/inventory/receipts/pu-3');
      await voidWith('void-receipt', 'copy');
      const stayed = [globalThis.__flow.location, byAction('confirm-void').length, text().includes('أُلغي هذا الاستلام'), text().includes('لم تُفتح نسخة للتصحيح: الخادم رفض العملية'), text().includes('معرّف الورقة الجديدة مستعمل لمستند آخر'), byAction('copy-to-draft').length];
      await click(byAction('copy-to-draft')[0]);
      const [first, second] = named(calls, 'copyDocToDraft');
      t.same(stayed, ['/inventory/receipts/pu-3', 0, true, true, true, 1], 'V3: الإلغاء تمّ والنسخ رُفض: النافذة انغلقت، والأصل الملغى يبيّن السبب وزرّ «افتح نسخة للتصحيح»');
      t.same(
        [named(calls, 'voidReceipt').length, second?.[3] !== first?.[3], second?.[0]?.clientRef !== first?.[0]?.clientRef, globalThis.__flow.location, text().includes('نسخة للتصحيح من مستند ملغى: الاستلام PU-2026-0042.')],
        [1, true, true, `/inventory/receipts/${second?.[3]}`, true],
        'V3: الزرّ يعيد النسخ بمعرّف ومرجع جديدين (الرفض أكيد) بلا إلغاء ثانٍ، وتنفتح الورقة',
      );
    });

    // ── V4: جواب النسخ ضاع: «نتيجة العملية غير معروفة»، والإعادة بنفس المعرّف والمرجع (ورقة وحدة) تفتح نفس الورقة ───────────────────────
    await step('V4', async () => {
      const db = store();
      db.put('receipt', receipt('pu-4'));
      let tries = 0;
      const calls = fresh(
        'manager',
        receiptHandlers(db, {
          copyDocToDraft: (ref, kind, id, newId) => {
            tries += 1;
            if (!db.docs.has(newId)) db.copied(kind, id, newId);
            if (tries === 1) throw new m.UnknownOutcomeError('fetch_failed');
            return { id: newId, kind, lines: 1, skipped: [] };
          },
        }),
      );
      await mount('/inventory/receipts/pu-4');
      await voidWith('void-receipt', 'copy');
      const unknown = [text().includes('نتيجة العملية غير معروفة'), text().includes('لن تتكرّر العملية مرّتين'), byAction('copy-to-draft').length];
      await click(byAction('copy-to-draft')[0]);
      const [first, second] = named(calls, 'copyDocToDraft');
      t.same(
        [unknown, second?.[3] === first?.[3], second?.[0]?.clientRef === first?.[0]?.clientRef, db.docs.size, globalThis.__flow.location],
        [[true, true, 1], true, true, 2, `/inventory/receipts/${first?.[3]}`],
        'V4: «ما نعرف» ثم الإعادة بنفس المعرّف والمرجع: ورقة وحدة جديدة بالخادم، والصفحة صارت هي',
      );
    });

    // ── V5: الأمين (بلا كلفة) يفتح نسخة من استلام ملغى وتنبيهه «المبالغ» بلا مال؛ والمحاسب والمشاهد بلا الزرّ؛ والورقة المحذوفة بلا الزرّ ──
    await step('V5', async () => {
      const db = store();
      db.put('receipt', receipt('pu-5', { status: 'void', voidReason: 'كمية خطأ' }));
      const calls = fresh('storekeeper', receiptHandlers(db, { copyDocToDraft: (ref, kind, id, newId) => (db.copied(kind, id, newId), { id: newId, kind, lines: 1, skipped: ['amounts'] }) }));
      await mount('/inventory/receipts/pu-5');
      const keeper = [byAction('copy-to-draft').length, byAction('void-receipt').length];
      await click(byAction('copy-to-draft')[0]);
      const [copy] = named(calls, 'copyDocToDraft');
      t.same(
        [keeper, copy?.[1], globalThis.__flow.location, text().includes('المبالغ (مبالغ السطور والخصم والتحميلات): لا تظهر لدورك'), text().includes('المدفوع للمورّد'), text().includes('دينار')],
        [[1, 0], 'receipt', `/inventory/receipts/${copy?.[3]}`, true, false, false],
        'V5: الأمين يفتح النسخة من الملغى (receipt.draft)، وتنبيهه «المبالغ لا تظهر لدورك» بلا مدفوع ولا مبلغ',
      );
    });
    await step('V5b', async () => {
      const seen = {};
      for (const [label, role, scopes] of [['accountant', 'accountant'], ['viewer', 'viewer'], ['keeper_elsewhere', 'storekeeper', [{ warehouseId: 'w-gen' }]], ['discarded', 'manager']]) {
        const db = store();
        db.put('receipt', receipt('pu-7', label === 'discarded' ? { status: 'void', docNo: null, posted: false } : { status: 'void', voidReason: 'كمية خطأ' }));
        fresh(role, receiptHandlers(db), scopes);
        await mount('/inventory/receipts/pu-7');
        seen[label] = byAction('copy-to-draft').length;
        await unmount();
      }
      t.same(seen, { accountant: 0, viewer: 0, keeper_elsewhere: 0, discarded: 0 }, 'V5b: بلا «افتح نسخة للتصحيح»: المحاسب والمشاهد (بلا receipt.draft)، والأمين بنطاق مخزن ثانٍ، والورقة المحذوفة قبل حفظها (ملغاة بلا رقم)');
    });
    // ── V5c (الدمج): مرآتا العقد §3 للزرّ: فعل إنشاء ورقة النوع (الافتتاح opening.post: الأمين بنطاق مخزنه بلا الزرّ والمدير ويّاه)،
    // ونطاق التحويل بالمخزن المرسِل مثل private.stock_wh بالخادم (الأمين بنطاق المستلِم بس بلا الزرّ، وبنطاق المرسِل ويّاه) ──────────────
    await step('V5c', async () => {
      const seen = {};
      const voidOpening = () => opening('op-9', { status: 'void', voidReason: 'كمية خطأ' });
      const voidTransfer = () => transfer('tr-9', { status: 'void', voidReason: 'كمية خطأ' });
      for (const [label, role, scopes, kind, doc, url] of [
        ['opening_keeper', 'storekeeper', [{ warehouseId: 'w-gen' }], 'opening', voidOpening(), '/inventory/openings/op-9'],
        ['opening_manager', 'manager', undefined, 'opening', voidOpening(), '/inventory/openings/op-9'],
        ['transfer_keeper_to', 'storekeeper', [{ warehouseId: 'w-gen2' }], 'transfer', voidTransfer(), '/inventory/transfers/tr-9'],
        ['transfer_keeper_from', 'storekeeper', [{ warehouseId: 'w-gen' }], 'transfer', voidTransfer(), '/inventory/transfers/tr-9'],
      ]) {
        const db = store();
        db.put(kind, doc);
        fresh(role, { loadOrgSetup: () => org, loadStockDoc: (k, id) => ({ doc: db.get(id), openingLines: kind === 'opening' ? [kazOpening] : [], transferLines: kind === 'transfer' ? [kazTransfer] : [] }) }, scopes);
        await mount(url);
        seen[label] = byAction('copy-to-draft').length;
        await unmount();
      }
      t.same(
        seen,
        { opening_keeper: 0, opening_manager: 1, transfer_keeper_to: 0, transfer_keeper_from: 1 },
        'V5c: «افتح نسخة للتصحيح» بفعل إنشاء ورقة النوع ونطاق مخزنها: الافتتاح للمدير مو للأمين، والتحويل بنطاق المخزن المرسِل مو المستلِم',
      );
    });

    // ── V6: رفض الإلغاء (جرد معتمد بعده، count_superseded) يبقى بالنافذة بتلميحه، ولا نسخ ──────────────────────────────────────────
    await step('V6', async () => {
      const db = store();
      db.put('receipt', receipt('pu-6'));
      const hint = 'جُردت «ذرة صفراء» في «مخزن المواد الأوّلية» بالجرد CT-2026-0003 بتاريخ 29/10/2026، وهو في يوم هذا المستند أو بعده؛ ألغِ الجرد أوّلاً.';
      const calls = fresh('manager', receiptHandlers(db, { voidReceipt: () => { throw new m.RejectedError('count_superseded', hint); } }));
      await mount('/inventory/receipts/pu-6');
      await voidWith('void-receipt', 'copy');
      t.same(
        [named(calls, 'voidReceipt').length, named(calls, 'copyDocToDraft').length, byAction('confirm-void').length, text().includes('بالجرد CT-2026-0003'), globalThis.__flow.location],
        [1, 0, 1, true, '/inventory/receipts/pu-6'],
        'V6: count_superseded يبقى بالنافذة بتلميحه (الجرد CT-2026-0003)، ولا نسخ',
      );
    });

    // ── V7: الأنواع الخمسة الباقية: الإلغاء بنداء نوعه ثم النسخ بنوعه ومسار ورقته ────────────────────────────────────────────────
    const kinds = [
      {
        name: 'transfer',
        url: '/inventory/transfers/tr-1',
        action: 'void-transfer',
        voidFn: 'voidTransferDoc',
        path: '/inventory/transfers/',
        from: 'التحويل TR-2026-0007',
        seed: (db) => db.put('transfer', transfer('tr-1')),
        handlers: (db) => ({ loadStockDoc: (kind, id) => ({ doc: db.get(id), openingLines: [], transferLines: [kazTransfer] }), voidTransferDoc: (ref, id, reason) => db.voided(id, reason) }),
      },
      {
        name: 'stock_use',
        url: '/inventory/uses/su-1',
        action: 'void-use',
        voidFn: 'voidUse',
        path: '/inventory/uses/',
        from: 'الصرف SU-2026-0001',
        seed: (db) => db.put('stock_use', use('su-1')),
        handlers: (db) => ({ loadUse: (id) => ({ doc: db.get(id), lines: [kazUse] }), voidUse: (ref, id, reason) => db.voided(id, reason) }),
      },
      {
        name: 'opening',
        url: '/inventory/openings/op-1',
        action: 'void-opening',
        voidFn: 'voidOpening',
        path: '/inventory/openings/',
        from: 'الرصيد عند البداية لـ«المخزن العام»',
        seed: (db) => db.put('opening', opening('op-1')),
        handlers: (db) => ({ loadStockDoc: (kind, id) => ({ doc: db.get(id), openingLines: [kazOpening], transferLines: [] }), voidOpening: (ref, id, reason) => db.voided(id, reason) }),
      },
      {
        name: 'supplier_return',
        url: '/inventory/supplier-returns/rt-1',
        action: 'void-return',
        voidFn: 'voidSupplierReturn',
        path: '/inventory/supplier-returns/',
        from: 'المرتجع RT-2026-0003',
        seed: (db) => db.put('supplier_return', retDoc('rt-1')),
        handlers: (db) => ({
          loadSupplierReturn: (id) => ({ doc: db.get(id), receipt: { id: 'pu-1', docNo: 'PU-2026-0042', onDate: '2026-10-28', partyName: 'مورّد الحبوب' }, lines: [cornReturn], credits: [] }),
          supplierReturnOptions: () => ({ receiptId: 'pu-1', receiptNo: 'PU-2026-0042', partyId: 'p-1', partyName: 'مورّد الحبوب', warehouseId: 'w-raw', receivedOn: '2026-10-28', status: 'posted', lines: [] }),
          voidSupplierReturn: (ref, id, reason) => db.voided(id, reason),
        }),
      },
      {
        name: 'count',
        url: '/inventory/counts/ct-1',
        action: 'void-count',
        voidFn: 'voidCount',
        path: '/inventory/counts/',
        from: 'الجرد CT-2026-0003',
        seed: (db) => db.put('count', count('ct-1')),
        handlers: (db) => ({
          loadCount: (id) => ({ doc: db.get(id), lines: [kazCount] }),
          previewCount: (id) => ({ version: db.get(id).version, plan: 'plan-1', status: db.get(id).status, submittedAt: null, snapshotAt: null, stale: false, problems: [], lines: [reviewLine], ready: false, shortageTotal: null, gainTotal: null }),
          voidCount: (ref, id, reason) => db.voided(id, reason),
          listItems: () => ({ rows: [], total: 0, next: null }),
        }),
      },
    ];
    for (const kind of kinds) {
      await step(`V7 ${kind.name}`, async () => {
        const db = store();
        kind.seed(db);
        const calls = fresh('manager', { loadOrgSetup: () => org, ...kind.handlers(db), copyDocToDraft: (ref, k, id, newId) => (db.copied(k, id, newId), { id: newId, kind: k, lines: 1, skipped: k === 'count' ? ['approval'] : k === 'opening' ? ['later_code'] : [] }) });
        await mount(kind.url);
        await voidWith(kind.action, 'copy');
        const order = calls.map(([n]) => n).filter((n) => n === kind.voidFn || n === 'copyDocToDraft');
        const [copy] = named(calls, 'copyDocToDraft');
        t.same(
          [order, copy?.[1], copy?.[2], globalThis.__flow.location, text().includes(`نسخة للتصحيح من مستند ملغى: ${kind.from}.`)],
          [[kind.voidFn, 'copyDocToDraft'], kind.name, kind.url.split('/').at(-1), `${kind.path}${copy?.[3]}`, true],
          `V7 ${kind.name}: الإلغاء بـ${kind.voidFn} ثم النسخ بنوعه، والورقة الجديدة بمسارها وتنبيهها`,
        );
        if (kind.name === 'count') t.ok(text().includes('مراجعة المدير (أسباب الفروق وكلف الزيادة)'), 'V7 count: الجرد المنسوخ بلا مراجعة المدير، والتنبيه يقولها');
        if (kind.name === 'opening') t.ok(text().includes('بند لم يُنسخ (الرمز: later_code)'), 'V7 opening: رمز متروك ما تعرفه الشاشة ينذكر برمزه، ما يسكت');
        // FE-4: «الملغى» بعد اسم المخزن كان يُقرأ صفة له («الرصيد عند البداية لـ«المخزن العام» الملغى»)؛ الحالة قبل اسم الأصل.
        if (kind.name === 'opening') t.ok(!text().includes('«المخزن العام» الملغى'), `V7 opening (FE-4): «ملغى» لا يلي اسم المخزن (${text().match(/نسخة للتصحيح من[^.]*/u)?.[0]})`);
      });
    }

    // ── V7c: الجرد: فشل النسخ بعد الإلغاء يبقى بعد قراءة الجرد من جديد (الحالة بالأب، مو بالمراجعة اللي تنطوي وهي تقرا) ─────────────────
    await step('V7c', async () => {
      const db = store();
      db.put('count', count('ct-1'));
      const countKind = kinds.find((k) => k.name === 'count');
      const calls = fresh('manager', { loadOrgSetup: () => org, ...countKind.handlers(db), copyDocToDraft: () => { throw new m.RejectedError('out_of_scope', 'المخزن «المخزن العام» خارج نطاقك.'); } });
      await mount('/inventory/counts/ct-1');
      await voidWith('void-count', 'copy');
      t.same(
        [named(calls, 'voidCount').length, named(calls, 'loadCount').length >= 2, globalThis.__flow.location, text().includes('أُلغي هذا الجرد'), text().includes('لم تُفتح نسخة للتصحيح'), text().includes('خارج نطاقك'), byAction('copy-to-draft').length],
        [1, true, '/inventory/counts/ct-1', true, true, true, 1],
        'V7c: الجرد انلغى وانقرا من جديد، وفشل النسخ وزرّه باقيان بصفحة الجرد الملغى',
      );
    });

    // ── V8: إلغاء تصحيح السعر (مو من الأنواع الستّة) بلا خيارين: السبب وحده يكفي ──────────────────────────────────────────────────
    await step('V8', async () => {
      const db = store();
      db.put('receipt', receipt('pu-8'));
      const revaluation = { id: 'rv-1', receiptLineId: 'ra', newTotal: 240_000_000n, oldTotal: 235_000_000n, diff: 5_000_000n, lotShare: 2_880_000n, expenseAmount: 2_120_000n, reason: 'فاتورة معدّلة', status: 'posted', postedAt: at, voidReason: null, createdAt: at };
      const calls = fresh('manager', receiptHandlers(db, { listLineRevaluations: () => [revaluation], voidReceiptRevalue: () => ({ id: 'rv-1', status: 'void' }) }));
      await mount('/inventory/receipts/pu-8');
      await click(byAction('void-revalue')[0]);
      const radios = byAction('void-choice-copy').length + byAction('void-choice-all').length;
      type(all().find((n) => n.id === 'stock-void-reason'), 'خطأ');
      await settle();
      const label = byAction('confirm-void')[0]?.textContent;
      await click(byAction('confirm-void')[0]);
      t.same([radios, label, named(calls, 'voidReceiptRevalue').length, named(calls, 'copyDocToDraft').length], [0, 'ألغِ تصحيح سعر «ذرة صفراء»', 1, 0], 'V8: إلغاء التصحيح بلا خيارين، والزرّ يسمّي التصحيح، ولا نسخ');
    });

    // ── V9 (المراجعة FE-1): «ألغِ وافتح نسخة للتصحيح» لمستند تاريخه 01/10/2026 (أقدم من 7 أيام): الورقة الجديدة بتاريخه وتنبيه «خارج
    // المسموح»، وحقل تاريخ بالورقة نفسها يُحفظ بدالّة نوعها (update*Draft بالورقة واليوم)، فتنقرا من جديد بتاريخ اليوم بلا التنبيه ────
    const OLD = '2026-10-01';
    const today = m.localDay();
    const UPDATES = { receipt: 'updateReceiptDraft', transfer: 'updateStockDraft', stock_use: 'updateUseDraft', supplier_return: 'updateSupplierReturnDraft', count: 'updateCountDraft' };
    const dated = [
      { name: 'receipt', url: '/inventory/receipts/pu-9', action: 'void-receipt', seed: (db) => db.put('receipt', receipt('pu-9')), handlers: (db) => receiptHandlers(db) },
      ...kinds.filter((k) => k.name !== 'opening'),
    ];
    const daySection = () => all().find((n) => n.getAttribute('aria-label') === 'تاريخ الورقة');
    const dayInput = () => descendants(daySection() ?? body()).find((n) => n.localName === 'input' && n.getAttribute('placeholder') === 'يوم/شهر/سنة');
    const saveDay = () => byAction('save-draft-day')[0];
    for (const kind of dated) {
      await step(`V9 ${kind.name}`, async () => {
        const db = store();
        kind.seed(db);
        for (const entry of db.docs.values()) entry.doc = { ...entry.doc, onDate: OLD };
        const calls = fresh('manager', {
          loadOrgSetup: () => org,
          ...kind.handlers(db),
          copyDocToDraft: (ref, k, id, newId) => (db.copied(k, id, newId), { id: newId, kind: k, lines: 1, skipped: k === 'count' ? ['approval'] : [] }),
          [UPDATES[kind.name]]: (doc, patch) => db.redated(doc.id, patch.day),
        });
        await mount(kind.url);
        await voidWith(kind.action, 'copy');
        const [copy] = named(calls, 'copyDocToDraft');
        const newId = copy?.[3];
        const before = [globalThis.__flow.location.endsWith(`/${newId}`), text().includes('خارج المسموح للحفظ النهائي'), dayInput()?.value ?? null, saveDay() ? disabled(saveDay()) : null];
        // بلا حقل (قبل الإصلاح) الفحص يفشل بفرق مقروء، مو برمية.
        if (dayInput()) {
          type(dayInput(), m.fmtDay(today));
          await settle();
        }
        const ready = saveDay() ? !disabled(saveDay()) : null;
        if (saveDay()) await click(saveDay());
        const [sent] = named(calls, UPDATES[kind.name]);
        t.same(
          [before, ready, sent?.[0]?.id, sent?.[1], db.get(newId)?.onDate, text().includes('خارج المسموح للحفظ النهائي'), dayInput()?.value],
          [[true, true, '01/10/2026', true], true, newId, { day: today }, today, false, m.fmtDay(today)],
          `V9 ${kind.name} (FE-1): نسخة 01/10/2026 بتنبيه «خارج المسموح» وحقل تاريخ؛ «احفظ التاريخ» بـ${UPDATES[kind.name]}(الورقة، اليوم) فتنقرا بتاريخ اليوم بلا التنبيه`,
        );
      });
    }

    // ── V10 (المراجعة FE-2): المحاسب يفتح نسخة استلام برابطها (من القائمة أو تبويب ثاني، بلا حالة الانتقال): أصلها من الخادم (copied_from)
    // ويقول إن مدفوع الأصل وتحميل صندوقه بقيا عليه فلا يُدفعان مرّة ثانية؛ والأمين يشوف الأصل بلا أي مال (يُقرأ بلا مبالغ) ───────────
    await step('V10', async () => {
      const db = store();
      db.put('receipt', receipt('pu-5', { status: 'void', voidReason: 'كمية خطأ', paidNow: true, boxCharge: true }));
      db.copied('receipt', 'pu-5', 'pu-copy');
      const seen = {};
      for (const role of ['accountant', 'storekeeper']) {
        const calls = fresh(role, receiptHandlers(db));
        await mount('/inventory/receipts/pu-copy');
        seen[role] = [
          text().includes('نسخة للتصحيح من مستند ملغى: الاستلام PU-2026-0042.'),
          text().includes('المدفوع للمورّد عند الاستلام: بقي مبلغاً على المورّد بعد إلغاء الأصل، فلا يُدفع مرّة ثانية.'),
          text().includes('التحميلات المدفوعة من صندوق'),
          byAction('open-original')[0]?.getAttribute('href'),
          named(calls, 'loadReceiptOrigin').map(([id, withMoney]) => [id, withMoney]),
        ];
        await unmount();
      }
      t.same(
        seen,
        {
          accountant: [true, true, true, '/inventory/receipts/pu-5', [['pu-5', true]]],
          storekeeper: [true, false, false, '/inventory/receipts/pu-5', [['pu-5', false]]],
        },
        'V10 (FE-2): نسخة الاستلام بلا حالة الانتقال: المحاسب يعرف أصلها PU-2026-0042 وإن مدفوعه وتحميل صندوقه بقيا عليه، والأمين يعرف الأصل بلا مال',
      );
    });

    // ── V11 (المراجعة FE-3): «احفظها نهائياً» لمن يحفظ النوع بس: الأمين بالاستلام «يحفظها المحاسب أو المدير» (قبل النسخ وبعدها)، والمدير
    // «احفظها نهائياً»؛ والأمين بالجرد «سلّمها للمراجعة»، وبالإتلاف «يحفظها المدير» ────────────────────────────────────────────────
    await step('V11', async () => {
      const seen = {};
      for (const role of ['storekeeper', 'manager']) {
        const db = store();
        db.put('receipt', receipt('pu-6', { status: 'void', voidReason: 'كمية خطأ' }));
        fresh(role, receiptHandlers(db, { copyDocToDraft: (ref, kind, id, newId) => (db.copied(kind, id, newId), { id: newId, kind, lines: 1, skipped: role === 'manager' ? [] : ['amounts'] }) }));
        await mount('/inventory/receipts/pu-6');
        const hint = text();
        await click(byAction('copy-to-draft')[0]);
        const notice = text();
        seen[`${role}_receipt`] = [
          hint.includes('تصحّحها ثم تحفظها نهائياً') || hint.includes('ثم احفظها نهائياً'),
          hint.includes('صحّحها؛ يحفظها المحاسب أو المدير نهائياً برقم جديد.'),
          notice.includes('ثم احفظها نهائياً'),
          notice.includes('صحّحها؛ يحفظها المحاسب أو المدير نهائياً برقم جديد.'),
        ];
        await unmount();
      }
      const countKind = kinds.find((k) => k.name === 'count');
      {
        const db = store();
        db.put('count', count('ct-7', { status: 'void', voidReason: 'عدّ خطأ' }));
        fresh('storekeeper', { loadOrgSetup: () => org, ...countKind.handlers(db) }, [{ warehouseId: 'w-gen' }]);
        await mount('/inventory/counts/ct-7');
        seen.storekeeper_count = [text().includes('صحّحها ثم سلّمها للمراجعة؛ يحفظها المدير نهائياً برقم جديد.'), text().includes('ثم احفظها نهائياً'), byAction('copy-to-draft').length];
        await unmount();
      }
      {
        const db = store();
        const destroyOrg = { ...org, expenseCategories: [...org.expenseCategories, { id: 'cat-x', version: 1, archived: false, name: 'إتلاف منتهي', systemCode: 'expired_destroy' }] };
        db.put('stock_use', use('su-7', { status: 'void', categoryId: 'cat-x', voidReason: 'وجبة خطأ' }));
        fresh('storekeeper', { loadOrgSetup: () => destroyOrg, loadUse: (id) => ({ doc: db.get(id), lines: [kazUse] }) }, [{ warehouseId: 'w-gen' }]);
        await mount('/inventory/uses/su-7');
        seen.storekeeper_destroy = [text().includes('صحّحها؛ يحفظها المدير نهائياً برقم جديد.'), text().includes('ثم احفظها نهائياً'), byAction('copy-to-draft').length];
        await unmount();
      }
      t.same(
        seen,
        {
          storekeeper_receipt: [false, true, false, true],
          manager_receipt: [true, false, true, false],
          storekeeper_count: [true, false, 1],
          storekeeper_destroy: [true, false, 1],
        },
        'V11 (FE-3): الأمين ما يُؤمر «احفظها نهائياً» بالاستلام (يحفظها المحاسب أو المدير) ولا بالجرد (سلّمها للمراجعة) ولا بالإتلاف (يحفظها المدير)؛ والمدير يُؤمر بها',
      );
    });
  } finally {
    restore();
    delete globalThis.__flow;
  }
}
