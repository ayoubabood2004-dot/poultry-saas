// شاشات المخزون التفاعلية (مراجعة WP4 الثانية): react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل StockRoutes الحقيقية،
// وrepo والجلسة والرسائل بدائل، ومسوّدات الجهاز الحقيقية على fake-indexeddb. كل حالة كانت تفشل على الشفرة قبل الإصلاح:
// F1 سطور انكتبت بلا نت ورجع الاتصال قبل الحفظ ما تضيع (تنحفظ وترتفع)؛ F2 المسوّدة المحفوظة تبين بالرفّ فوراً وبعد رجوع الاتصال؛
// F3 سطر يرفضه الخادم دائماً (ورفض 1.5 قطعة قبل الحفظ) والرفّ يسمح بحذفه أو بحذف المسوّدة؛ F4 وقت الفقس يوم/شهر/سنة؛ F5 سطر
// الافتتاح ما ينكتب بوحدة تعبئة مادّة سابقة؛ F6 الترحيل ببصمة المعاينة وإعادتها على stale_preview؛ F7 مواد الجلسة لصاحبها؛ F8 قائمة
// التحويلات بصفحات؛ F9 (مراجعة WP8) «أضف السطر» بالتحويل والافتتاح بمعرّف الجهاز: الإعادة بعد جواب ضاع نفس السطر مو سطر ثاني.
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REAL_INV = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'inventory.ts'));
const OVERRIDES = ['loadOrgSetup', 'listStockDocs', 'listItems', 'listItemUnits', 'createTransferDraft', 'addTransferLine', 'updateTransferLine', 'loadStockDoc', 'createOpeningDraft', 'addOpeningLine', 'updateOpeningLine', 'previewTransfer', 'previewOpening', 'postTransferDoc', 'postOpening', 'voidTransferDoc', 'voidOpening', 'deleteDraftLine', 'discardDraft', 'loadStockOnHand', 'loadStockValues', 'loadStockValueTotals', 'loadItemLots', 'loadItemLotValues', 'loadItemMoves'];
const STUBS = {
  inventory: `export * from ${REAL_INV}; ${OVERRIDES.map((n) => `export const ${n} = (...a) => globalThis.__flow.call('${n}', a);`).join(' ')}`,
  session: 'export const useSession = () => globalThis.__flow.session; export const sessionStore = { get: () => globalThis.__flow?.session ?? { status: "loading" } };',
  repo: "export const workspace = { loadMyWorkspace: (...a) => globalThis.__flow.call('loadMyWorkspace', a) };",
  Toast: 'export const toast = (spec) => { globalThis.__flow.toasts.push(spec); }; export function Toaster() { return null; }',
};
const stubs = {
  name: 'flow-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/inventory$|\/lib\/repo$|\/Toast$/ }, (args) => {
      const name = args.path.endsWith('/lib/repo') ? 'repo' : args.path.split('/').at(-1);
      return { path: name, namespace: 'flow-stub' };
    });
    b.onLoad({ filter: /.*/, namespace: 'flow-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
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
    "export { rememberItems, seenItemsMatching } from './src/pages/inventory/stock-shared.tsx';",
    "export { listDeviceDrafts, saveDeviceDraft, removeDeviceDraft } from './src/lib/drafts/index.ts';",
    "export { searchable } from './src/domain/normalize.ts';",
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
const byIdSuffix = (suffix) => all().filter((n) => n.id.endsWith(suffix));
const text = () => body().textContent;
const type = (input, value) => {
  input.value = value;
  fire(input, 'input');
};
// خانة اختيار: المتصفّح يقلب checked قبل حدث النقر، وReact يقرا القيمة الجديدة منه.
const tick = (box) => {
  box.checked = !box.checked;
  fire(box, 'click');
};
const choose = (select, value) => {
  select.value = value;
  fire(select, 'change');
};

export default async function (t) {
  const restore = installDom();
  try {
    const m = await bundle();
    const ws = (over = {}) => ({ userId: 'u-1', orgId: 'org-1', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role: 'storekeeper', scopes: [{ warehouseId: 'w-gen' }], divisions: ['general'], canSeeCost: false, canSeeAccounts: false, canSeeSales: false, invites: [], subscription: 'active', confirmedAt: 1, ...over });
    const store = (id, divisionId, kind, name) => ({ id, version: 1, archived: false, divisionId, siteId: `s-${divisionId}`, name, kind, hasBalance: false });
    const org = {
      divisions: [
        { id: 'd-gen', kind: 'general', goLiveOn: '2026-10-01', frozen: true },
        { id: 'd-br', kind: 'broiler', goLiveOn: '2026-10-01', frozen: true },
        { id: 'd-hat', kind: 'hatchery', goLiveOn: '2026-11-03', frozen: false },
      ],
      sites: [], packTypes: [], itemCategories: [], expenseCategories: [],
      warehouses: [store('w-gen', 'd-gen', 'general', 'المخزن العام'), store('w-farm', 'd-br', 'farm', 'مخزن الحقل'), store('w-chick', 'd-hat', 'chick', 'مخزن الأفراخ')],
    };
    const itemRow = (id, name, kind, baseUnit) => ({ id, version: 1, archived: false, name, nameNorm: m.searchable(name), categoryId: null, kind, baseUnit, density: null, pieceMassKg: null, tracksExpiry: false, scaleStep: 1000n, minQty: null, barcode: null, altCodes: [] });
    const kaz = itemRow('i-kaz', 'كاز أويل', 'fuel', 'L');
    const bulbs = itemRow('i-bulb', 'مصابيح', 'equipment', 'pc');
    const chick = itemRow('i-chick', 'أفراخ لحم', 'chick', 'pc');

    const fresh = (session, handlers) => {
      const calls = [];
      globalThis.__flow = {
        session,
        toasts: [],
        calls,
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

    let root = null;
    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      // App.tsx يعيد تركيب الصفحة بكل مسار (RouteErrorBoundary key={location.pathname})، وهنا مثله.
      function Keyed() {
        const location = m.useLocation();
        globalThis.__flow.location = location.pathname;
        return m.h(m.Routes, { key: location.pathname }, m.h(m.Route, { path: '/inventory/*', element: m.h(m.StockRoutes) }));
      }
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(Keyed))));
      await settle();
      return container;
    };
    const unmount = async () => {
      m.flushSync(() => root.unmount());
      body().textContent = '';
      await settle();
    };
    const fillOfflineTransfer = async (line) => {
      choose(byIdSuffix('-from')[0], 'w-gen');
      await settle();
      choose(byIdSuffix('-to')[0], 'w-farm');
      await settle();
      const search = byAction('search-item')[0];
      type(search, line.search);
      await settle();
      fire(byAction('pick-item')[0], 'click');
      await settle();
      type(byIdSuffix('-qty')[0], line.qty);
      await settle();
      fire(byAction('add-device-line')[0], 'click');
      await settle();
    };
    const submitNewTransfer = async () => {
      const form = byAction('new-transfer')[0]?.parentNode;
      fire(form, 'submit');
      await settle();
    };
    const handlers = () => ({
      loadOrgSetup: () => org,
      listStockDocs: () => ({ rows: [], next: null, total: 0 }),
      listItems: () => ({ rows: [kaz, bulbs], total: 2, next: null }),
      listItemUnits: () => [],
      createTransferDraft: (from, to, day) => ({ id: 't-new', kind: 'transfer', status: 'draft', version: 1, docNo: null, warehouseId: from, toWarehouseId: to, onDate: day, note: null, posted: false, voidReason: null }),
      addTransferLine: () => ({}),
      loadStockDoc: () => ({ doc: { id: 't-new', kind: 'transfer', status: 'draft', version: 1, docNo: null, warehouseId: 'w-gen', toWarehouseId: 'w-farm', onDate: '2026-10-29', note: null, posted: false, voidReason: null }, openingLines: [], transferLines: [] }),
      loadMyWorkspace: () => ({ kind: 'member', workspace: ws() }),
    });

    // ── F1: سطور انكتبت بلا نت ثم رجع الاتصال قبل «احفظها على هذا الجهاز»: تبقى ظاهرة، والحفظ يكتبها على الجهاز ويرفعها ──
    {
      const calls = fresh({ status: 'ready', workspace: ws(), offline: false }, handlers());
      m.onlineStore.set(false);
      m.rememberItems([kaz, bulbs]);
      await mount('/inventory/transfers');
      await fillOfflineTransfer({ search: 'كاز', qty: '100' });
      t.ok(text().includes('كاز أويل') && byAction('add-device-line').length === 1, 'F1 ضابط: بلا نت السطر المكتوب بجدول سطور الجهاز');
      m.onlineStore.set(true);
      await settle();
      t.ok(text().includes('سطور الورقة على هذا الجهاز') && text().includes('كاز أويل'), `F1: رجع الاتصال والسطر المكتوب بلا نت باقٍ على الشاشة (الزرّ «${byAction('new-transfer')[0]?.textContent}»)`);
      await submitNewTransfer();
      const created = calls.filter(([n]) => n === 'createTransferDraft');
      const lines = calls.filter(([n]) => n === 'addTransferLine');
      const kept = (await m.listDeviceDrafts({ userId: 'u-1', orgId: 'org-1' }, 'transfer')).length;
      t.same(
        [created.length, lines.length, lines[0]?.[1]?.[1]?.item_id, typeof created[0]?.[1]?.[4], kept, globalThis.__flow.location],
        [1, 1, 'i-kaz', 'string', 0, `/inventory/transfers/${created[0]?.[1]?.[4]}`],
        'F1: الحفظ كتبها على الجهاز ورفع الرأس والسطر بمعرّفات الجهاز ثم شالها من الجهاز وفتح المسوّدة',
      );
      await unmount();
    }

    // ── F2: مسوّدة انحفظت بلا نت تبين بالرفّ بنفس الصفحة فوراً، وبعد رجوع الاتصال ──
    {
      fresh({ status: 'ready', workspace: ws(), offline: false }, handlers());
      m.onlineStore.set(false);
      await mount('/inventory/transfers');
      t.ok(byAction('upload-device-draft').length === 0, 'F2 ضابط: الرفّ فارغ بالبداية');
      await fillOfflineTransfer({ search: 'كاز', qty: '100' });
      await submitNewTransfer();
      const saved = await m.listDeviceDrafts({ userId: 'u-1', orgId: 'org-1' }, 'transfer');
      t.ok(saved.length === 1, `F2 ضابط: المسوّدة بـIndexedDB (${saved.length})`);
      t.ok(byAction('upload-device-draft').length === 1, `F2: بعد الحفظ مباشرةً الرفّ بنفس الصفحة يعرضها بـ«ارفع» (${byAction('upload-device-draft').length})`);
      m.onlineStore.set(true);
      await settle();
      t.ok(byAction('upload-device-draft').length === 1, `F2: بعد رجوع الاتصال الرفّ يعرضها بـ«ارفع» (${byAction('upload-device-draft').length})`);
      await unmount();
      for (const d of await m.listDeviceDrafts({ userId: 'u-1', orgId: 'org-1' }, 'transfer')) await m.removeDeviceDraft(d.id);
    }

    // ── F3: 1.5 قطعة ترفض قبل ما تنحفظ؛ وسطر يرفضه الخادم دائماً ينعلّم بتلميحه، والرفّ يعرض السطور ويحذف السطر أو المسوّدة بتأكيد ──
    {
      const h = handlers();
      fresh({ status: 'ready', workspace: ws(), offline: false }, {
        ...h,
        addTransferLine: (docId, fields) => {
          if (fields.item_id === 'i-kaz') throw new m.RejectedError('item_not_found', 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.');
          return {};
        },
      });
      m.onlineStore.set(false);
      await mount('/inventory/transfers');
      await fillOfflineTransfer({ search: 'مصابيح', qty: '2.5' });
      const alerts = () => all().filter((n) => n.getAttribute('role') === 'alert').map((n) => n.textContent).join(' | ');
      t.ok(text().includes('لا سطور بعد.') && alerts().includes('صحيح'), `F3: 2.5 «مصابيح» بالقطعة ترفض قبل الحفظ بجملة الحقل (${alerts()})`);
      fire(byAction('change-item')[0], 'click');
      await settle();
      type(byAction('search-item')[0], 'كاز');
      await settle();
      fire(byAction('pick-item')[0], 'click');
      await settle();
      type(byIdSuffix('-qty')[0], '100');
      await settle();
      fire(byAction('add-device-line')[0], 'click');
      await settle();
      await submitNewTransfer();
      m.onlineStore.set(true);
      await unmount();
      await mount('/inventory/transfers');
      for (let attempt = 0; attempt < 2; attempt += 1) {
        fire(byAction('upload-device-draft')[0], 'click');
        await settle();
      }
      const left = await m.listDeviceDrafts({ userId: 'u-1', orgId: 'org-1' }, 'transfer');
      t.same([left.length, (left[0]?.payload.lines ?? []).map((l) => l.rejected?.code ?? null)], [1, ['item_not_found']], 'F3: بعد رفعين السطر المرفوض باقٍ على الجهاز بعلامة رفضه');
      t.ok(text().includes('هذه المادّة غير موجودة') && byAction('remove-device-line').length === 1, 'F3: الرفّ يعرض السطر المرفوض بتلميحه وزرّ حذفه');
      fire(byAction('drop-device-draft')[0], 'click');
      await settle();
      t.ok(text().includes('تُحذف ورقة'), 'F3: حذف المسوّدة من الجهاز بتأكيد يسمّيها');
      fire(byAction('confirm-drop-device')[0], 'click');
      await settle();
      t.same([(await m.listDeviceDrafts({ userId: 'u-1', orgId: 'org-1' }, 'transfer')).length, byAction('upload-device-draft').length], [0, 0], 'F3: بعد التأكيد انحذفت من الجهاز والرفّ فارغ');
      await unmount();
    }

    // ── F6: الترحيل ببصمة المعاينة؛ stale_preview (المخزون تغيّر بعدها) يعيد المعاينة ويقول السبب، والموافقة من جديد ──
    {
      const draws = (lot, qty) => [{ lotId: lot, qty, receivedOn: '2026-10-20', expiryOn: null, source: 'رصيد افتتاح', value: null }];
      const previewOf = (plan, lot) => ({ version: 2, plan, internalExport: true, toDivisionKind: 'broiler', problems: [], ready: true, lines: [{ lineId: 'tl-1', lineNo: 1, itemId: 'i-kaz', itemName: 'كاز أويل', baseUnit: 'L', qty: 50_000n, qtyInUnit: 50_000n, unitLabel: 'L', available: 200_000n, expired: 0n, later: 0n, shortage: 0n, wholeBalance: false, problem: null, draws: draws(lot, 50_000n), value: null }] });
      let previews = 0;
      const calls = fresh({ status: 'ready', workspace: ws(), offline: false }, {
        loadOrgSetup: () => org,
        loadStockDoc: () => ({ doc: { id: 't-7', kind: 'transfer', status: 'draft', version: 2, docNo: null, warehouseId: 'w-gen', toWarehouseId: 'w-farm', onDate: '2026-10-30', note: null, posted: false, voidReason: null, createdAt: '2026-10-30T10:00:00Z' }, openingLines: [], transferLines: [{ id: 'tl-1', lineNo: 1, itemId: 'i-kaz', itemName: 'كاز أويل', baseUnit: 'L', itemUnitId: null, unitCode: null, unitLabel: 'L', qtyInUnit: 50_000n, qty: 50_000n }] }),
        previewTransfer: () => ((previews += 1), previews === 1 ? previewOf('plan-1', 'lot-A') : previewOf('plan-2', 'lot-B')),
        postTransferDoc: (ref, id, version, plan) => {
          if (plan === 'plan-1') throw new m.RejectedError('stale_preview', 'تغيّر المخزون بعد المعاينة فتغيّرت الدفعات المسحوبة أو كمياتها. عاين التحويل من جديد ووافق عليه قبل الترحيل.');
          return { id, kind: 'transfer', status: 'posted', docNo: 'TR-2026-0007' };
        },
      });
      m.onlineStore.set(true);
      await mount('/inventory/transfers/t-7');
      fire(byAction('preview-transfer')[0], 'click');
      await settle();
      tick(byAction('approve-line')[0]);
      await settle();
      fire(byAction('post-transfer')[0], 'click');
      await settle();
      const posts = calls.filter(([n]) => n === 'postTransferDoc').map(([, args]) => args[3]);
      const approvedAfter = byAction('approve-line').filter((n) => n.checked).length;
      t.same([posts, previews, text().includes('تغيّر المخزون بعد المراجعة فلم يُحفظ التحويل'), approvedAfter, byAction('post-transfer')[0]?.getAttribute('disabled') !== null], [['plan-1'], 2, true, 0, true], 'F6: الترحيل ببصمة المعاينة، وstale_preview يعيد المعاينة بالتنبيه وتنمسح الموافقة');
      tick(byAction('approve-line')[0]);
      await settle();
      fire(byAction('post-transfer')[0], 'click');
      await settle();
      t.same(calls.filter(([n]) => n === 'postTransferDoc').map(([, args]) => args[3]), ['plan-1', 'plan-2'], 'F6: الموافقة على المعاينة الجديدة ترحّل ببصمتها');
      await unmount();
    }

    // ── F7: المواد المحفوظة للجلسة لصاحبها ومنشأته بس: مستخدم ثانٍ بنفس التبويب ما يلكى مواد اللي قبله بلا نت ──
    {
      fresh({ status: 'ready', workspace: ws({ userId: 'u-A', orgId: 'org-A' }), offline: false }, {});
      m.rememberItems([kaz]);
      const before = m.seenItemsMatching('كاز').map((row) => row.id);
      globalThis.__flow.session = { status: 'signed_out', expired: false };
      globalThis.__flow.session = { status: 'ready', workspace: ws({ userId: 'u-B', orgId: 'org-B' }), offline: false };
      t.same([before, m.seenItemsMatching('كاز').map((row) => row.id)], [['i-kaz'], []], 'F7: بعد تبديل المستخدم والمنشأة ما يبقى شي من مواد الجلسة السابقة');
    }

    // ── F8: قائمة التحويلات بصفحات: «N من المجموع» و«المزيد» بمؤشّر آخر صفّ، والصفّ المكرّر بين صفحتين ينعرض مرّة ──
    {
      const doc = (id, status, at) => ({ id, kind: 'transfer', status, version: 1, docNo: status === 'draft' ? null : `TR-2026-${id}`, warehouseId: 'w-gen', toWarehouseId: 'w-farm', onDate: '2026-10-30', note: null, posted: status !== 'draft', voidReason: null, createdAt: at });
      const firstPage = { rows: [doc('0001', 'posted', '2026-10-30T10:00:00Z'), doc('0002', 'posted', '2026-10-30T09:00:00Z')], next: { status: 'posted', createdAt: '2026-10-30T09:00:00Z', id: '0002' }, total: 3 };
      const calls = fresh({ status: 'ready', workspace: ws({ role: 'viewer', scopes: [] }), offline: false }, {
        loadOrgSetup: () => org,
        listStockDocs: (kind, after) => (after ? { rows: [doc('0002', 'posted', '2026-10-30T09:00:00Z'), doc('0003', 'void', '2026-10-29T09:00:00Z')], next: null, total: null } : firstPage),
      });
      await mount('/inventory/transfers');
      const shownBefore = text().includes('2 من المجموع 3') && byAction('more-transfers').length === 1;
      const more = byAction('more-transfers')[0];
      if (more) fire(more, 'click');
      await settle();
      const cursor = calls.filter(([n]) => n === 'listStockDocs').at(-1)?.[1]?.[1];
      t.same([shownBefore, cursor, text().includes('3 من المجموع 3'), byAction('more-transfers').length, (text().match(/TR-2026-0002/gu) ?? []).length], [true, firstPage.next, true, 0, 1], 'F8: الصفحة الثانية بمؤشّر آخر صفّ، والعدد 3 من 3، والمكرّر مرّة');
      await unmount();
    }

    // ── F4: وقت الفقس يوم/شهر/سنة مثل كل تاريخ بالشاشة (02/11/2026 = 2 تشرين الثاني)، ويوم فوق 12 ينقبل ──
    {
      const calls = fresh({ status: 'ready', workspace: ws({ role: 'manager', scopes: [], divisions: ['general', 'broiler', 'hatchery'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true }), offline: false }, {
        loadOrgSetup: () => org,
        loadStockDoc: () => ({ doc: { id: 'o-1', kind: 'opening', status: 'draft', version: 1, docNo: null, warehouseId: 'w-chick', toWarehouseId: null, onDate: '2026-11-03', note: null, posted: false, voidReason: null }, openingLines: [], transferLines: [] }),
        listItems: () => ({ rows: [chick], total: 1, next: null }),
        listItemUnits: () => [],
        addOpeningLine: () => ({}),
      });
      m.onlineStore.set(true);
      await mount('/inventory/openings/o-1');
      type(byAction('search-item')[0], 'أفراخ');
      await settle();
      fire(byAction('pick-item')[0], 'click');
      await settle();
      type(byIdSuffix('-qty')[0], '1000');
      type(byIdSuffix('-value')[0], '650000');
      await settle();
      const born = byIdSuffix('-born')[0];
      const bornLabel = born ? all().find((n) => n.localName === 'label' && n.getAttribute('for') === born.id)?.textContent : null;
      type(born, '02/11/2026 06:00');
      await settle();
      const form = byAction('add-opening-line')[0]?.parentNode;
      fire(form, 'submit');
      await settle();
      const sent = calls.find(([n]) => n === 'addOpeningLine')?.[1]?.[1];
      t.ok(Boolean(sent), `F4 ضابط: السطر انرسل (عنوان الحقل «${bornLabel}»)`);
      t.ok(sent?.born_at?.startsWith('2026-11-0'), `F4: «02/11/2026 06:00» تنحفظ 2 تشرين الثاني (${sent?.born_at})`);
      // إرشاد الشاشة نفسها لصيغة التاريخ، لمّا اليوم فوك 12:
      type(byAction('search-item')[0], 'أفراخ');
      await settle();
      fire(byAction('pick-item')[0], 'click');
      await settle();
      type(byIdSuffix('-born')[0], '28/10/2026 06:00');
      type(byIdSuffix('-qty')[0], '1000');
      type(byIdSuffix('-value')[0], '650000');
      await settle();
      fire(byAction('add-opening-line')[0]?.parentNode, 'submit');
      await settle();
      const alert = all().filter((n) => n.getAttribute('role') === 'alert').map((n) => n.textContent).join(' | ');
      t.ok(!alert.includes('يوم/شهر/سنة'), `F4: «28/10/2026 06:00» ما تنرفض بجملة تطلب يوم/شهر/سنة (${alert})`);
      await unmount();
    }

    // ── F5: سطر افتتاح: مادّة ثانية ووحداتها بعدها تنقرا (أو فشلت) ما ينكتب سطرها بوحدة تعبئة المادّة السابقة ──
    {
      const starter = itemRow('i-A', 'علف بادئ', 'feed', 'kg');
      const finisher = itemRow('i-B', 'علف ناهي', 'feed', 'kg');
      const calls = fresh({ status: 'ready', workspace: ws({ role: 'manager', scopes: [], divisions: ['general', 'broiler', 'hatchery'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true }), offline: false }, {
        loadOrgSetup: () => org,
        loadStockDoc: () => ({ doc: { id: 'o-2', kind: 'opening', status: 'draft', version: 1, docNo: null, warehouseId: 'w-farm', toWarehouseId: null, onDate: '2026-10-01', note: null, posted: false, voidReason: null }, openingLines: [], transferLines: [] }),
        listItems: () => ({ rows: [starter, finisher], total: 2, next: null }),
        listItemUnits: (itemId) => (itemId === 'i-A' ? [{ id: 'u-A', version: 1, archived: false, itemId: 'i-A', packTypeId: null, label: 'كيس 50 كغم', factor: 50_000_000n, isDefault: false, forPurchase: true, forSale: false, forRecipe: false }] : new Promise(() => {})),
        addOpeningLine: () => ({}),
      });
      await mount('/inventory/openings/o-2');
      type(byAction('search-item')[0], 'علف');
      await settle();
      fire(byAction('pick-item')[0], 'click');
      await settle();
      const bag = all().find((n) => n.getAttribute('role') === 'radio' && n.textContent === 'كيس 50 كغم');
      fire(bag, 'click');
      await settle();
      type(byIdSuffix('-qty')[0], '10');
      await settle();
      fire(byAction('change-item')[0], 'click');
      await settle();
      const picks = byAction('pick-item');
      fire(picks.find((n) => n.textContent === 'علف ناهي'), 'click');
      await settle();
      const shown = byIdSuffix('-qty')[0] ? all().filter((n) => n.getAttribute('role') === 'radio' && n.getAttribute('aria-checked') === 'true').map((n) => n.textContent) : [];
      type(byIdSuffix('-value')[0], '1000');
      await settle();
      fire(byAction('add-opening-line')[0]?.parentNode, 'submit');
      await settle();
      const sent = calls.find(([n]) => n === 'addOpeningLine')?.[1]?.[1];
      t.ok(!(sent && sent.item_id === 'i-B' && sent.qty_base === '500.000'), `F5: سطر «علف ناهي» ما ينكتب بمعامل كيس المادّة الثانية (الوحدة ${JSON.stringify(shown)}، المرسل ${JSON.stringify(sent)})`);
      await unmount();
    }

    // ── F9 (مراجعة WP8): «أضف السطر» بالتحويل والافتتاح بمعرّف الجهاز: جواب ضاع ثم إعادة = نفس المعرّف، و23505 = تعديل بنفس القيم (كان
    //    سطراً ثانياً يضاعف الكمية والقيمة)، والنموذج يبقى بمعرّفه وتنبيهه بعد النتيجة المجهولة ──
    {
      const addTwice = async (url, fill, action) => {
        await mount(url);
        type(byAction('search-item')[0], fill.search);
        await settle();
        fire(byAction('pick-item')[0], 'click');
        await settle();
        type(byIdSuffix('-qty')[0], fill.qty);
        if (fill.value) type(byIdSuffix('-value')[0], fill.value);
        await settle();
        fire(byAction(action)[0]?.parentNode, 'submit');
        await settle();
        const unknownShown = text().includes('قد تكون العملية تمّت');
        fire(byAction(action)[0]?.parentNode, 'submit');
        await settle();
        await unmount();
        return unknownShown;
      };
      const lost = (constraint) => {
        let tries = 0;
        return () => {
          tries += 1;
          if (tries === 1) throw new m.UnknownOutcomeError();
          throw new m.RejectedError('23505', null, constraint);
        };
      };
      const transferDoc = { id: 't-9', kind: 'transfer', status: 'draft', version: 1, docNo: null, warehouseId: 'w-gen', toWarehouseId: 'w-farm', onDate: '2026-10-29', note: null, posted: false, voidReason: null };
      const tCalls = fresh({ status: 'ready', workspace: ws(), offline: false }, {
        ...handlers(),
        loadStockDoc: () => ({ doc: transferDoc, openingLines: [], transferLines: [] }),
        addTransferLine: lost('transfer_lines_pkey'),
        updateTransferLine: (lineId, patch) => ({ id: lineId, ...patch }),
      });
      m.onlineStore.set(true);
      const tUnknown = await addTwice('/inventory/transfers/t-9', { search: 'كاز', qty: '100' }, 'add-transfer-line');
      const tSent = tCalls.filter(([n]) => n === 'addTransferLine').map(([, a]) => a[2]);
      const tUpdated = tCalls.filter(([n]) => n === 'updateTransferLine').map(([, a]) => [a[0], a[1]?.qty_in_unit]);
      const tReads = tCalls.filter(([n]) => n === 'loadStockDoc').length;
      t.same(
        [tUnknown, tSent.length, typeof tSent[0], tSent[0] === tSent[1], tUpdated, tReads],
        [true, 2, 'string', true, [[tSent[0], '100.000']], 2],
        'F9: سطر التحويل: الإعادة بعد جواب ضاع بنفس المعرّف (والتنبيه ظاهر)، و23505 تعديل بنفس القيم، والمستند ينقرا بعد الإضافة',
      );
      const starter = itemRow('i-A', 'علف بادئ', 'feed', 'kg');
      const oCalls = fresh({ status: 'ready', workspace: ws({ role: 'manager', scopes: [], divisions: ['general', 'broiler', 'hatchery'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true }), offline: false }, {
        loadOrgSetup: () => org,
        loadStockDoc: () => ({ doc: { id: 'o-9', kind: 'opening', status: 'draft', version: 1, docNo: null, warehouseId: 'w-farm', toWarehouseId: null, onDate: '2026-10-01', note: null, posted: false, voidReason: null }, openingLines: [], transferLines: [] }),
        listItems: () => ({ rows: [starter], total: 1, next: null }),
        listItemUnits: () => [],
        addOpeningLine: lost('opening_lines_pkey'),
        updateOpeningLine: (lineId, patch) => ({ id: lineId, ...patch }),
      });
      const oUnknown = await addTwice('/inventory/openings/o-9', { search: 'علف', qty: '1000', value: '1500000' }, 'add-opening-line');
      const oSent = oCalls.filter(([n]) => n === 'addOpeningLine').map(([, a]) => a[2]);
      const oUpdated = oCalls.filter(([n]) => n === 'updateOpeningLine').map(([, a]) => [a[0], a[1]?.qty_base, a[1]?.value]);
      t.same(
        [oUnknown, oSent.length, typeof oSent[0], oSent[0] === oSent[1], oUpdated],
        [true, 2, 'string', true, [[oSent[0], '1000.000', '1500000.00']]],
        'F9: سطر الافتتاح: نفس المعرّف بعد جواب ضاع، و23505 تعديل بنفس الكمية والقيمة (مو افتتاح مضاعف)',
      );
    }
  } finally {
    delete globalThis.__flow;
    restore();
  }
}
