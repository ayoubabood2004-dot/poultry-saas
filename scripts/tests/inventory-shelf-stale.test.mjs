// رفّ مسوّدات الجهاز ونسخة رفّ قديمة بنافذة ثانية (المراجعة الرابعة، WP4)، بنفس عدّة inventory-shelf-windows: الرفع والحذف من
// سجلّ الجهاز الحالي، فنسخة قديمة ما ترجّع سطراً أو مسوّدة حذفتها نافذة ثانية، ولا ترفع سطراً انحذف بالخادم، ولا تعيد مسوّدة خلص
// رفعها (S-P1/P1b/P2/P2b/P6)؛ وتنبيه «يُعمل عليها في نافذة أخرى» ما يعطّل الأزرار للأبد (P3/P3b)؛ والحذف من رفّ قديم يقول ليش ما
// حذف بدل ما يسكت (P4/P4b)؛ وderiveId ثابت وبشكل uuid (P5).
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';
import { installLocks } from './web-locks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REAL_INV = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'inventory.ts'));
const OVERRIDES = ['loadOrgSetup', 'listStockDocs', 'listItems', 'listItemUnits', 'createTransferDraft', 'addTransferLine', 'loadStockDoc', 'createOpeningDraft', 'addOpeningLine', 'previewTransfer', 'previewOpening', 'postTransferDoc', 'postOpening', 'voidTransferDoc', 'voidOpening', 'deleteDraftLine', 'discardDraft', 'loadStockOnHand', 'loadStockValues', 'loadStockValueTotals', 'loadItemLots', 'loadItemLotValues', 'loadItemMoves'];
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
    "export * as transfers from './src/pages/inventory/TransfersPage.tsx';",
    "export { onlineStore } from './src/lib/online.ts';",
    "export { rememberItems } from './src/pages/inventory/stock-shared.tsx';",
    "export { listDeviceDrafts, saveDeviceDraft, removeDeviceDraft } from './src/lib/drafts/index.ts';",
    "export { searchable } from './src/domain/normalize.ts';",
    "export { RejectedError, NetworkError, ZeroRowsError } from './src/lib/errors.ts';",
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

export default async function (t) {
  const restore = installDom();
  const webLocks = installLocks();
  const originalError = console.error;
  console.error = () => {};
  try {
    const m = await bundle();
    const only = (process.env.ONLY ?? '').split(',').filter(Boolean);
    const run = (name) => only.length === 0 || only.includes(name);
    const ws = (over = {}) => ({ userId: 'u-1', orgId: 'org-1', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role: 'storekeeper', scopes: [{ warehouseId: 'w-gen' }], divisions: ['general'], canSeeCost: false, canSeeAccounts: false, canSeeSales: false, invites: [], subscription: 'active', confirmedAt: 1, ...over });
    const store = (id, divisionId, kind, name) => ({ id, version: 1, archived: false, divisionId, siteId: `s-${divisionId}`, name, kind, hasBalance: false });
    const org = {
      divisions: [
        { id: 'd-gen', kind: 'general', goLiveOn: '2026-10-01', frozen: true },
        { id: 'd-br', kind: 'broiler', goLiveOn: '2026-10-01', frozen: true },
      ],
      sites: [], packTypes: [], itemCategories: [], expenseCategories: [],
      warehouses: [store('w-gen', 'd-gen', 'general', 'المخزن العام'), store('w-farm', 'd-br', 'farm', 'مخزن الحقل')],
    };
    const itemRow = (id, name, kind, baseUnit) => ({ id, version: 1, archived: false, name, nameNorm: m.searchable(name), categoryId: null, kind, baseUnit, density: null, pieceMassKg: null, tracksExpiry: false, scaleStep: 1000n, minQty: null, barcode: null, altCodes: [] });
    const kaz = itemRow('i-kaz', 'كاز أويل', 'fuel', 'L');
    const bulbs = itemRow('i-bulb', 'مصابيح', 'equipment', 'pc');
    const STAMP = { userId: 'u-1', orgId: 'org-1' };
    const session = () => ({ status: 'ready', workspace: ws(), offline: false });
    const shelfLine = (id, itemId, itemName, baseUnit, unitLabel, qtyInUnit) => ({ id, itemId, itemName, baseUnit, itemUnitId: null, unitCode: null, unitLabel, qtyInUnit });
    const KAZ = (id) => shelfLine(id, 'i-kaz', 'كاز أويل', 'L', 'لتر', '100.000');
    const BULB = (id) => shelfLine(id, 'i-bulb', 'مصابيح', 'pc', 'قطعة', '4.000');
    const payload = (headerId, docId, lines) => ({ from: 'w-gen', to: 'w-farm', day: '2026-10-30', note: '', headerId, docId, lines });
    const clearDrafts = async () => {
      for (const d of await m.listDeviceDrafts(STAMP, 'transfer')) await m.removeDeviceDraft(d.id);
    };
    const base = {
      loadOrgSetup: () => org,
      listStockDocs: () => ({ rows: [], next: null, total: 0 }),
      listItems: () => ({ rows: [kaz, bulbs], total: 2, next: null }),
      listItemUnits: () => [],
    };

    // خادم يتصرّف مثل 0007: حارس BEFORE INSERT على transfer_lines يرمي doc_not_found / not_draft قبل فحص المفتاح (23505)،
    // وإدخال الرأس بمعرّف الجهاز يتكرّر بلا أثر.
    const makeServer = () => {
      const s = { heads: new Map(), lines: new Map() };
      s.create = (from, to, day, note, id) => {
        if (s.heads.has(id)) throw new m.RejectedError('23505', null);
        s.heads.set(id, 'draft');
        return { id, kind: 'transfer', status: 'draft', version: 1, docNo: null, warehouseId: from, toWarehouseId: to, onDate: day, note, posted: false, voidReason: null, createdAt: '2026-10-30T10:00:00Z' };
      };
      s.add = (docId, fields, id) => {
        if (!s.heads.has(docId)) throw new m.RejectedError('doc_not_found', 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.');
        if (s.heads.get(docId) !== 'draft') throw new m.RejectedError('not_draft', 'المستند مرحَّل أو ملغى؛ لا تُعدَّل سطوره.');
        if (s.lines.has(id)) throw new m.RejectedError('23505', null);
        s.lines.set(id, { docId, itemId: fields.item_id });
        return {};
      };
      s.on = (docId) => new Set([...s.lines].filter(([, row]) => row.docId === docId).map(([id]) => id));
      s.doc = (kind, id) => {
        if (!s.heads.has(id)) throw new m.ZeroRowsError();
        const status = s.heads.get(id);
        return {
          doc: { id, kind: 'transfer', status, version: 3, docNo: status === 'draft' ? null : 'TR-2026-0001', warehouseId: 'w-gen', toWarehouseId: 'w-farm', onDate: '2026-10-30', note: null, posted: status === 'posted', voidReason: null, createdAt: '2026-10-30T10:00:00Z' },
          openingLines: [],
          transferLines: [...s.on(id)].map((lineId, n) => ({ id: lineId, lineNo: n + 1, itemId: s.lines.get(lineId).itemId, itemName: 'x', baseUnit: 'L', itemUnitId: null, unitCode: null, unitLabel: 'L', qtyInUnit: 1000n, qty: 1000n })),
        };
      };
      s.where = (itemId) => [...s.lines.values()].filter((row) => row.itemId === itemId).map((row) => `${row.docId}:${s.heads.get(row.docId)}`);
      return s;
    };

    const fresh = (sess, handlers) => {
      const calls = [];
      globalThis.__flow = {
        session: sess,
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
      function Keyed() {
        const location = m.useLocation();
        globalThis.__flow.location = location.pathname;
        return m.h(m.Routes, { key: location.pathname }, m.h(m.Route, { path: '/inventory/*', element: m.h(m.StockRoutes) }));
      }
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(Keyed))));
      await settle();
    };
    const unmount = async () => {
      try {
        m.flushSync(() => root.unmount());
      } catch {
        /* already torn down */
      }
      body().textContent = '';
      await settle();
    };
    // الرفع يشتقّ المعرّفات بـcrypto.subtle (خيط خلفي)، فالانتظار لحد ما يخلص: المسوّدة راحت من الجهاز أو رجع زرّها.
    const uploadIdle = async () => {
      for (let n = 0; n < 400; n += 1) {
        await settle(5);
        await new Promise((resolve) => setTimeout(resolve, 1));
        if (byAction('upload-device-draft').length > 0 || (await m.listDeviceDrafts(STAMP, 'transfer')).length === 0) return;
      }
    };
    // ── سيناريوهات المراجعة الرابعة: النافذتان A وB بنفس الجهاز، ورفّ B مقروء قبل اللي صار بـA.
    const winA = (server, over = {}) => ({
      confirm: async () => STAMP,
      createTransferDraft: async (...a) => server.create(...a),
      addTransferLine: async (...a) => server.add(...a),
      saveDeviceDraft: m.saveDeviceDraft,
      removeDeviceDraft: m.removeDeviceDraft,
      newId: () => crypto.randomUUID(),
      deriveId: m.transfers.deriveId,
      linesOn: async (docId) => server.on(docId),
      ...over,
    });
    const serverHandlers = (server) => ({
      ...base,
      loadMyWorkspace: () => ({ kind: 'member', workspace: ws() }),
      createTransferDraft: server.create,
      addTransferLine: server.add,
      loadStockDoc: server.doc,
    });
    const deviceLines = async (id) => (await m.listDeviceDrafts(STAMP, 'transfer')).find((d) => d.id === id)?.payload.lines.map((l) => l.id) ?? null;

    // ── P1: رفّ B قرا المسوّدة [كاز، مصابيح]. بـA ينحذف «مصابيح» من الجهاز («ولا يرتفع، ولا يرجع») مثل drop() بالضبط (تحت قفلها
    //        ومن سجلّها الحالي). بعدها بـB (القفل فالت) «ارفع»: «مصابيح» ما يرتفع أبداً.
    if (run('P1')) {
      const server = makeServer();
      fresh(session(), serverHandlers(server));
      await clearDrafts();
      await m.saveDeviceDraft(STAMP, { id: 'dd-q1', kind: 'transfer', title: 'تحويل', payload: payload('h-q1', null, [KAZ('l-q11'), BULB('l-q12')]) });
      m.onlineStore.set(true);
      await mount('/inventory/transfers');
      const listedB = byAction('upload-device-draft').length;
      // النافذة A: تحذف السطر l-q12 تحت قفلها (مثل DeviceShelf.drop بـwithDraft).
      await webLocks.locks.request('device-draft:dd-q1', { ifAvailable: true }, async (lock) => {
        if (!lock) throw new Error('lock not granted');
        const current = (await m.listDeviceDrafts(STAMP, 'transfer')).find((d) => d.id === 'dd-q1');
        await m.saveDeviceDraft(STAMP, { id: current.id, kind: 'transfer', title: current.title, payload: { ...current.payload, lines: current.payload.lines.filter((l) => l.id !== 'l-q12') } });
      });
      const afterDropA = await deviceLines('dd-q1');
      // النافذة B: «ارفع» من رفّها القديم.
      fire(byAction('upload-device-draft')[0], 'click');
      await uploadIdle();
      await settle();
      t.same(
        [listedB, afterDropA, server.where('i-bulb')],
        [1, ['l-q11'], []],
        `P1: سطر انحذف من الجهاز بالنافذة A ما يرفعه رفّ B القديم (المصابيح بالخادم: ${JSON.stringify(server.where('i-bulb'))})`,
      );
      await unmount();
      await clearDrafts();
    }

    // ── P1b: نفسه، بس A تحذف المسوّدة كلّها («تُحذف مسوّدة … من هذا الجهاز ولا ترجع»)، وB تضغط «ارفع».
    if (run('P1b')) {
      const server = makeServer();
      fresh(session(), serverHandlers(server));
      await clearDrafts();
      await m.saveDeviceDraft(STAMP, { id: 'dd-q1b', kind: 'transfer', title: 'تحويل', payload: payload('h-q1b', null, [KAZ('l-q1b1'), BULB('l-q1b2')]) });
      m.onlineStore.set(true);
      await mount('/inventory/transfers');
      await webLocks.locks.request('device-draft:dd-q1b', { ifAvailable: true }, async () => m.removeDeviceDraft('dd-q1b'));
      const goneOnDevice = (await deviceLines('dd-q1b')) === null;
      fire(byAction('upload-device-draft')[0], 'click');
      await uploadIdle();
      await settle();
      t.same(
        [goneOnDevice, server.heads.size, server.lines.size],
        [true, 0, 0],
        `P1b: مسوّدة انحذفت من الجهاز بـA ما ترفعها B (رؤوس ${server.heads.size}، سطور ${server.lines.size})`,
      );
      await unmount();
      await clearDrafts();
    }

    // ── P2: A ترفع المسوّدة كلّها (h-q2 بيها كاز l-q21 ومصابيح l-q22، وراحت من الجهاز)، وبصفحة h-q2 ينحذف سطر الكاز (E52
    //        delete_draft_line). رفّ B (مقروء قبل) بعده يعرضها، و«ارفع» هناك: السطر المحذوف ما يرجع (23505 ما يحمي صفّاً انحذف).
    if (run('P2')) {
      const server = makeServer();
      fresh(session(), serverHandlers(server));
      await clearDrafts();
      const draft = await m.saveDeviceDraft(STAMP, { id: 'dd-q2', kind: 'transfer', title: 'تحويل', payload: payload('h-q2', null, [KAZ('l-q21'), BULB('l-q22')]) });
      m.onlineStore.set(true);
      await mount('/inventory/transfers');
      const resA = await webLocks.locks.request('device-draft:dd-q2', { ifAvailable: true }, () => m.transfers.uploadShelfDraft(draft, winA(server)));
      const afterA = [resA.docId, await deviceLines('dd-q2'), [...server.lines.keys()]];
      server.lines.delete('l-q21'); // سطر الكاز ينحذف من مسوّدة الخادم h-q2
      fire(byAction('upload-device-draft')[0], 'click');
      await uploadIdle();
      await settle();
      t.same(
        [afterA, server.where('i-kaz')],
        [['h-q2', null, ['l-q21', 'l-q22']], []],
        `P2: سطر انحذف من مسوّدة الخادم بعد رفع A ما يرجّعه «ارفع» من رفّ B القديم (الكاز: ${JSON.stringify(server.where('i-kaz'))})`,
      );
      await unmount();
      await clearDrafts();
    }

    // ── P2b: مثل P2، وبعد حذف سطر الكاز يترحّل h-q2b (بالمصابيح وسطر كاز مصحّح انضاف بالاتصال). «ارفع» من رفّ B القديم: سطر
    //         الكاز المحذوف ما ينتقل لمسوّدة جديدة، ولا إشعار يسمّيه «الباقي» اللي ما وصل.
    if (run('P2b')) {
      const server = makeServer();
      fresh(session(), serverHandlers(server));
      await clearDrafts();
      const draft = await m.saveDeviceDraft(STAMP, { id: 'dd-q2b', kind: 'transfer', title: 'تحويل', payload: payload('h-q2b', null, [KAZ('l-q2b1'), BULB('l-q2b2')]) });
      m.onlineStore.set(true);
      await mount('/inventory/transfers');
      await webLocks.locks.request('device-draft:dd-q2b', { ifAvailable: true }, () => m.transfers.uploadShelfDraft(draft, winA(server)));
      server.lines.delete('l-q2b1'); // سطر الكاز الغلط ينحذف بصفحة h-q2b
      server.lines.set('l-fix', { docId: 'h-q2b', itemId: 'i-kaz' }); // وسطر الكاز المصحّح ينضاف بالاتصال
      server.heads.set('h-q2b', 'posted'); // وh-q2b يترحّل
      fire(byAction('upload-device-draft')[0], 'click');
      await uploadIdle();
      await settle();
      const toasts = globalThis.__flow.toasts.map((x) => `${x.title} | ${x.detail ?? ''}`);
      t.same(
        server.where('i-kaz').sort(),
        ['h-q2b:posted'],
        `P2b: السطر المحذوف ما تنقله B لمسوّدة جديدة (سطور الكاز: ${JSON.stringify(server.where('i-kaz'))}؛ الصفحة ${globalThis.__flow.location}؛ الإشعارات ${JSON.stringify(toasts)})`,
      );
      await unmount();
      await clearDrafts();
    }
    // ── P3: B تقرا الرفّ وA ماسكة المسوّدة («يُعمل عليها في نافذة أخرى»). رفع A يفشل بالشبكة ويفلت القفل والمسوّدة باقية على
    //        الجهاز: رفّ B ينقرا من جديد بلا تنبيه وأزراره شغّالة، بلا إعادة تحميل.
    if (run('P3')) {
      const server = makeServer();
      fresh(session(), serverHandlers(server));
      await clearDrafts();
      const draft = await m.saveDeviceDraft(STAMP, { id: 'dd-q3', kind: 'transfer', title: 'تحويل', payload: payload('h-q3', null, [KAZ('l-q31'), BULB('l-q32')]) });
      m.onlineStore.set(true);
      let release = null;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const upA = webLocks.locks
        .request('device-draft:dd-q3', { ifAvailable: true }, () =>
          m.transfers.uploadShelfDraft(draft, winA(server, { addTransferLine: async () => { await gate; throw new m.NetworkError(); } })),
        )
        .then((r) => r, (e) => e);
      await settle();
      await mount('/inventory/transfers');
      const claimedBefore = text().includes('يُعمل عليها في نافذة أخرى');
      release();
      const errA = await upA;
      for (let n = 0; n < 20; n += 1) await settle(5);
      const stillOnDevice = await deviceLines('dd-q3');
      const uploadDisabled = byAction('upload-device-draft').every((n) => n.getAttribute('disabled') !== null);
      const dropDisabled = byAction('drop-device-draft').every((n) => n.getAttribute('disabled') !== null);
      const claimedAfter = text().includes('يُعمل عليها في نافذة أخرى');
      t.same(
        [claimedBefore, errA?.name, stillOnDevice, [claimedAfter, uploadDisabled, dropDisabled]],
        [true, 'NetworkError', ['l-q31', 'l-q32'], [false, false, false]],
        `P3: بعد ما فلتت A المسوّدة، رفّ B يشيل «يُعمل عليها» وأزراره شغّالة (التنبيه ${claimedAfter}، الرفع معطّل ${uploadDisabled}، الحذف معطّل ${dropDisabled})`,
      );
      await unmount();
      await clearDrafts();
    }

    // ── P3b: المجرى الطبيعي. B قرت الرفّ قبل (بلا تنبيه)، وA تبدي ترفع. B تضغط «ارفع»: ShelfBusyError «… ثم أعد المحاولة»،
    //         والرفّ ينقرا ويعرضها ماسوكة. رفع A يفشل بالشبكة ويفلتها: B تقدر تعيد.
    if (run('P3b')) {
      const server = makeServer();
      fresh(session(), serverHandlers(server));
      await clearDrafts();
      const draft = await m.saveDeviceDraft(STAMP, { id: 'dd-q3b', kind: 'transfer', title: 'تحويل', payload: payload('h-q3b', null, [KAZ('l-q3b1')]) });
      m.onlineStore.set(true);
      await mount('/inventory/transfers');
      let release = null;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const upA = webLocks.locks
        .request('device-draft:dd-q3b', { ifAvailable: true }, () =>
          m.transfers.uploadShelfDraft(draft, winA(server, { addTransferLine: async () => { await gate; throw new m.NetworkError(); } })),
        )
        .then((r) => r, (e) => e);
      await settle();
      fire(byAction('upload-device-draft')[0], 'click');
      for (let n = 0; n < 10; n += 1) await settle(5);
      const busyNotice = text().includes('ثم أعد المحاولة');
      release();
      await upA;
      for (let n = 0; n < 20; n += 1) await settle(5);
      const uploadDisabled = byAction('upload-device-draft').every((n) => n.getAttribute('disabled') !== null);
      t.same(
        [busyNotice, text().includes('ثم أعد المحاولة'), uploadDisabled],
        [true, true, false],
        `P3b: B ينقال لها «انتظر … ثم أعد المحاولة»، و«ارفع» شغّال بعد ما فلتتها A (معطّل ${uploadDisabled})`,
      );
      await unmount();
      await clearDrafts();
    }
    // ── P3c: قفل مشترك على المسوّدة (انتظار نافذة ثالثة لحظة ينمنح) مو «يُعمل عليها»؛ والرفّ اللي ينتظر فلت قفل حصري يلغي
    //         انتظاره لمّا ينغلق، فما يبقى طلب معلّق بطابور القفل.
    if (run('P3c')) {
      const server = makeServer();
      fresh(session(), serverHandlers(server));
      await clearDrafts();
      await m.saveDeviceDraft(STAMP, { id: 'dd-q3c', kind: 'transfer', title: 'تحويل', payload: payload('h-q3c', null, [KAZ('l-q3c1')]) });
      m.onlineStore.set(true);
      let releaseShared = null;
      const shared = webLocks.locks.request('device-draft:dd-q3c', { mode: 'shared' }, () => new Promise((resolve) => { releaseShared = resolve; }));
      await mount('/inventory/transfers');
      const sharedShown = text().includes('يُعمل عليها في نافذة أخرى');
      releaseShared();
      await shared;
      await unmount();
      let releaseHeld = null;
      const heldA = webLocks.locks.request('device-draft:dd-q3c', { ifAvailable: true }, () => new Promise((resolve) => { releaseHeld = resolve; }));
      await mount('/inventory/transfers');
      for (let n = 0; n < 5; n += 1) await settle(5);
      const claimedShown = text().includes('يُعمل عليها في نافذة أخرى');
      const waiting = webLocks.pending().length;
      await unmount();
      const waitingAfter = webLocks.pending().length;
      releaseHeld();
      await heldA;
      t.same(
        [sharedShown, claimedShown, waiting, waitingAfter],
        [false, true, 1, 0],
        `P3c: القفل المشترك مو «يُعمل عليها»، والرفّ المنغلق يلغي انتظاره (المشترك ${sharedShown}، الحصري ${claimedShown}، المنتظر ${waiting} ← ${waitingAfter})`,
      );
      await clearDrafts();
    }
    // ── P4: B تقرا الرفّ، وA ترفع المسوّدة كلّها. بـB ينحذف «مصابيح» («يُحذف … ولا يرتفع») بتأكيد: إشعار يقول إنها رُفعت أو
    //        حُذفت هناك، مو سكوت كأن الحذف صار.
    if (run('P4')) {
      const server = makeServer();
      fresh(session(), serverHandlers(server));
      await clearDrafts();
      const draft = await m.saveDeviceDraft(STAMP, { id: 'dd-q4', kind: 'transfer', title: 'تحويل', payload: payload('h-q4', null, [KAZ('l-q41'), BULB('l-q42')]) });
      m.onlineStore.set(true);
      await mount('/inventory/transfers');
      fire(byAction('show-device-lines')[0], 'click');
      await settle();
      await webLocks.locks.request('device-draft:dd-q4', { ifAvailable: true }, () => m.transfers.uploadShelfDraft(draft, winA(server)));
      fire(byAction('remove-device-line')[1], 'click');
      await settle();
      const dialog = all().find((n) => n.getAttribute('role') === 'dialog' || n.getAttribute('role') === 'alertdialog')?.textContent ?? '';
      fire(byAction('confirm-drop-device')[0], 'click');
      for (let n = 0; n < 10; n += 1) await settle(5);
      const notices = all().filter((n) => ['alert', 'status'].includes(n.getAttribute('role') ?? '')).map((n) => n.textContent).concat(globalThis.__flow.toasts.map((x) => x.title));
      t.same(
        [dialog.includes('مصابيح'), server.where('i-bulb'), notices.length > 0],
        [true, ['h-q4:draft'], true],
        `P4: حذف سطر رفعته نافذة ثانية يطلع إشعاراً وما يسكت (الإشعارات: ${JSON.stringify(notices)})`,
      );
      await unmount();
      await clearDrafts();
    }

    // ── P4b: h-q4b مترحّل وبيه l-q4b1. «ارفع» بـA ينقل المصابيح لمعرّف مشتقّ وينشئ المسوّدة المشتقّة، وبعدها تنقطع الشبكة
    //         (المصابيح باقية على الجهاز بمعرّفها المشتقّ). بـB (رفّ قديم [كاز، مصابيح]) ينحذف «مصابيح» بتأكيد.
    if (run('P4b')) {
      const server = makeServer();
      server.heads.set('h-q4b', 'posted');
      server.lines.set('l-q4b1', { docId: 'h-q4b', itemId: 'i-kaz' });
      fresh(session(), serverHandlers(server));
      await clearDrafts();
      const draft = await m.saveDeviceDraft(STAMP, { id: 'dd-q4b', kind: 'transfer', title: 'تحويل', payload: payload('h-q4b', 'h-q4b', [KAZ('l-q4b1'), BULB('l-q4b2')]) });
      m.onlineStore.set(true);
      await mount('/inventory/transfers');
      fire(byAction('show-device-lines')[0], 'click');
      await settle();
      const errA = await webLocks.locks
        .request('device-draft:dd-q4b', { ifAvailable: true }, () =>
          m.transfers.uploadShelfDraft(draft, winA(server, { addTransferLine: async (docId, fields, id) => { if (docId !== 'h-q4b') throw new m.NetworkError(); return server.add(docId, fields, id); } })),
        )
        .then((r) => r, (e) => e);
      const onDeviceAfterA = await deviceLines('dd-q4b');
      fire(byAction('remove-device-line')[1], 'click');
      await settle();
      fire(byAction('confirm-drop-device')[0], 'click');
      for (let n = 0; n < 10; n += 1) await settle(5);
      const onDeviceAfterDrop = await deviceLines('dd-q4b');
      const told = all().some((n) => ['alert', 'status'].includes(n.getAttribute('role') ?? '')) || globalThis.__flow.toasts.length > 0;
      // السطر انتقل بالنافذة الثانية لمعرّف مشتقّ: الحذف بالمعرّف القديم يقول إن السطر تغيّر، والرفّ يعرض الحالي، والسطر باقٍ.
      t.same(
        [errA?.name, onDeviceAfterA?.length, onDeviceAfterDrop, told],
        ['NetworkError', 1, onDeviceAfterA, true],
        `P4b: حذف «مصابيح» من رفّ قديم بعد ما انتقل بنافذة ثانية يقول إن السطر تغيّر والسطر باقٍ (الجهاز ${JSON.stringify(onDeviceAfterDrop)}، الإشعار ${told})`,
      );
      await unmount();
      await clearDrafts();
    }
    // ── P6: h-q6 مترحّل وبيه l-q61. A تنقل الباقي (المصابيح) للمسوّدة المشتقّة وتكمل، وبعدها تترحّل. B (رفّ قديم: h-q6
    //        و[كاز، مصابيح]) تضغط «ارفع»: أوّل دورة تلاقي المسوّدة المشتقّة مترحّلة.
    if (run('P6')) {
      const server = makeServer();
      server.heads.set('h-q6', 'posted');
      server.lines.set('l-q61', { docId: 'h-q6', itemId: 'i-kaz' });
      fresh(session(), serverHandlers(server));
      await clearDrafts();
      const draft = await m.saveDeviceDraft(STAMP, { id: 'dd-q6', kind: 'transfer', title: 'تحويل', payload: payload('h-q6', 'h-q6', [KAZ('l-q61'), BULB('l-q62')]) });
      m.onlineStore.set(true);
      await mount('/inventory/transfers');
      const resA = await webLocks.locks.request('device-draft:dd-q6', { ifAvailable: true }, () => m.transfers.uploadShelfDraft(draft, winA(server)));
      const goneAfterA = (await deviceLines('dd-q6')) === null;
      server.heads.set(resA.docId, 'posted'); // المسوّدة المنقولة تترحّل بالنافذة A
      fire(byAction('upload-device-draft')[0], 'click');
      await uploadIdle();
      for (let n = 0; n < 10; n += 1) await settle(5);
      const ghost = await deviceLines('dd-q6');
      const rejectedShown = text().includes('المستند مرحَّل أو ملغى');
      t.same(
        [goneAfterA, ghost, rejectedShown],
        [true, null, false],
        `P6: «ارفع» من رفّ B القديم ما يحيي مسوّدة الجهاز اللي خلصت ولا يطلع رفضاً كاذباً «المستند مرحَّل أو ملغى…» (${JSON.stringify(ghost)}، ${rejectedShown})`,
      );
      await unmount();
      await clearDrafts();
    }
    // ── P5: deriveId ثابت، بشكل uuid نسخة 4، ومختلف للرأس والسطر ولنقل النقل.
    if (run('P5')) {
      const a = await m.transfers.deriveId('rehome:h');
      const b = await m.transfers.deriveId('rehome:h');
      const c = await m.transfers.deriveId(`rehome:${a}`);
      const d = await m.transfers.deriveId('rehome:h:l');
      const shape = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      t.same([a === b, shape.test(a) && shape.test(c) && shape.test(d), new Set([a, c, d]).size], [true, true, 3], 'P5: deriveId ثابت وبشكل uuid');
    }
  } finally {
    console.error = originalError;
    delete globalThis.__flow;
    webLocks.restore();
    restore();
  }
}
