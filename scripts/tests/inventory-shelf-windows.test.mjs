// رفّ مسوّدات الجهاز بنوافذ وفشل قراءة (المراجعة الثالثة، WP4)، بنفس عدّة inventory-flows. «نافذة ثانية» = قفل Web Locks ماسكه غيرنا
// (مدير أقفال بالعملية نفسها) أو رفع بنسخة اعتماديات ثانية:
// C1/C1b قراءة الرأس السابق فشلت (ومعها إنشاء) ما تنقل سطراً وصله؛ C2 مسوّدة ماسكتها نافذة ثانية تنعرض بتنبيه وحذف سطر منها
// ينرفض (ما ينحذف سطر يرتفع رغماً)، والتنبيه يروح لمّا تفلتها؛ C3 نافذتان تنقلان الباقي لنفس المعرّفات (23505) مو لمسوّدتين؛ C4 الحفظ بلا نت يبقي القائمة؛ C5
// صفحة «المزيد» من قبل إعادة القراءة تنرمى؛ C6 i18n-guard يمسك «اللي» ونصّ الرسالة فصيح؛ C7 حذف سطر من مسوّدة بلا معرّفات
// سطور؛ C8 رأس سابق مخفي بالنطاق (ZeroRowsError) يوقف الرفع.
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
const byIdSuffix = (suffix) => all().filter((n) => n.id.endsWith(suffix));
const text = () => body().textContent;
const type = (input, value) => {
  input.value = value;
  fire(input, 'input');
};
const choose = (select, value) => {
  select.value = value;
  fire(select, 'change');
};
const linkTo = (id) => all().filter((n) => n.localName === 'a' && (n.getAttribute('href') ?? '').endsWith(`/inventory/transfers/${id}`)).length;

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
        /* انفكّت قبل */
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
    const pressUploadUntilGone = async (max = 3) => {
      for (let attempt = 0; attempt < max && byAction('upload-device-draft').length > 0; attempt += 1) {
        fire(byAction('upload-device-draft')[0], 'click');
        await uploadIdle();
      }
    };

    // ── C1: السطر l-1 وصل h-1 (جوابه ضاع)، وبعدها ترحّل h-1. «ارفع» يلاقي not_draft، وقراءة سطور h-1 (linesOn ← loadStockDoc)
    //        تفشل مرّة بالشبكة: l-1 ما ينكتب مرّتين (إصلاح R2-C1).
    if (run('C1')) {
      const server = makeServer();
      server.heads.set('h-1', 'posted');
      server.lines.set('l-1', { docId: 'h-1', itemId: 'i-kaz' });
      let readFails = 1;
      fresh(session(), {
        ...base,
        loadMyWorkspace: () => ({ kind: 'member', workspace: ws() }),
        createTransferDraft: server.create,
        addTransferLine: server.add,
        loadStockDoc: (kind, id) => {
          if (readFails > 0) {
            readFails -= 1;
            throw new m.NetworkError();
          }
          return server.doc(kind, id);
        },
      });
      await clearDrafts();
      await m.saveDeviceDraft(STAMP, { id: 'dd-p1', kind: 'transfer', title: 'تحويل', payload: payload('h-1', 'h-1', [KAZ('l-1'), BULB('l-2')]) });
      m.onlineStore.set(true);
      await mount('/inventory/transfers');
      await pressUploadUntilGone();
      t.same([server.where('i-kaz'), server.where('i-bulb').length], [['h-1:posted'], 1], `C1: قراءة فاشلة لسطور الرأس السابق ما تنقل سطراً وصله (كاز: ${JSON.stringify(server.where('i-kaz'))})`);
      await unmount();
      await clearDrafts();
    }

    // ── C1b: نفسه، والشبكة تنقطع كمان بالطلب اللي بعده (الرأس الجديد): كان سجلّ الجهاز ينكتب بمعرّفات جديدة قبل ما ينعرف شي،
    //         فالإعادة بشبكة زينة تكرّر.
    if (run('C1b')) {
      const server = makeServer();
      server.heads.set('h-1b', 'posted');
      server.lines.set('l-1b', { docId: 'h-1b', itemId: 'i-kaz' });
      let readFails = 1;
      let createFails = 1;
      fresh(session(), {
        ...base,
        loadMyWorkspace: () => ({ kind: 'member', workspace: ws() }),
        createTransferDraft: (...a) => {
          if (createFails > 0) {
            createFails -= 1;
            throw new m.NetworkError();
          }
          return server.create(...a);
        },
        addTransferLine: server.add,
        loadStockDoc: (kind, id) => {
          if (readFails > 0) {
            readFails -= 1;
            throw new m.NetworkError();
          }
          return server.doc(kind, id);
        },
      });
      await clearDrafts();
      await m.saveDeviceDraft(STAMP, { id: 'dd-p1b', kind: 'transfer', title: 'تحويل', payload: payload('h-1b', 'h-1b', [KAZ('l-1b'), BULB('l-2b')]) });
      m.onlineStore.set(true);
      await mount('/inventory/transfers');
      fire(byAction('upload-device-draft')[0], 'click');
      await settle();
      const kept = (await m.listDeviceDrafts(STAMP, 'transfer')).find((d) => d.id === 'dd-p1b')?.payload.lines.map((l) => l.id) ?? null;
      await pressUploadUntilGone();
      t.same(server.where('i-kaz'), ['h-1b:posted'], `C1b: قراءة وإنشاء فاشلان ثم إعادة: كاز مرّة وحدة (الجهاز ${JSON.stringify(kept)}؛ كاز ${JSON.stringify(server.where('i-kaz'))})`);
      await unmount();
      await clearDrafts();
    }

    // ── C2: نافذتان للتطبيق. A ترفع المسوّدة (بنسختها من الوحدة و`uploading` مالها)، ورفّ B يعرض نفس المسوّدة والمستخدم يحذف
    //        «مصابيح» («ولا يرتفع، ولا يرجع») بتأكيد: الحذف ينرفض والسطر يرتفع ويّا رفعها، والتنبيه يروح لمّا تفلتها (R2-C2).
    if (run('C2')) {
      const server = makeServer();
      const gate = [];
      const windowA = {
        confirm: async () => STAMP,
        createTransferDraft: async (...a) => server.create(...a),
        addTransferLine: (docId, fields, id) =>
          new Promise((resolve, reject) =>
            gate.push(() => {
              try {
                resolve(server.add(docId, fields, id));
              } catch (error) {
                reject(error);
              }
            }),
          ),
        saveDeviceDraft: m.saveDeviceDraft,
        removeDeviceDraft: m.removeDeviceDraft,
        newId: () => crypto.randomUUID(),
        deriveId: m.transfers.deriveId,
        linesOn: async (docId) => server.on(docId),
      };
      fresh(session(), { ...base });
      await clearDrafts();
      const draft = await m.saveDeviceDraft(STAMP, { id: 'dd-p2', kind: 'transfer', title: 'تحويل', payload: payload('h-2', null, [KAZ('l-21'), BULB('l-22')]) });
      m.onlineStore.set(true);
      // النافذة الأولى ماسكة المسوّدة (قفلها) طول رفعها.
      const upA = webLocks.locks.request('device-draft:dd-p2', { ifAvailable: true }, () => m.transfers.uploadShelfDraft(draft, windowA)).then((r) => r, (e) => e);
      await settle();
      await mount('/inventory/transfers');
      const disabled = (action) => byAction(action).every((n) => n.getAttribute('disabled') !== null);
      fire(byAction('show-device-lines')[0], 'click');
      await settle();
      // التنبيه ظاهر والأزرار شغّالة (المراجعة الرابعة: تعطيلها بلقطة القراءة كان يبقى بعد ما تفلتها)، والحذف نفسه ينرفض لأنها ماسوكة.
      const shownClaimed = [text().includes('يُعمل عليها في نافذة أخرى'), disabled('upload-device-draft'), disabled('drop-device-draft'), disabled('remove-device-line')];
      fire(byAction('remove-device-line')[1], 'click');
      await settle();
      fire(byAction('confirm-drop-device')[0], 'click');
      for (let n = 0; n < 5; n += 1) await settle(5);
      const refused = text().includes('ثم أعد المحاولة');
      const afterRemove = (await m.listDeviceDrafts(STAMP, 'transfer')).find((d) => d.id === 'dd-p2')?.payload.lines.map((l) => l.id) ?? null;
      for (let n = 0; n < 5 && gate.length; n += 1) {
        gate.shift()();
        await settle();
      }
      await upA;
      for (let n = 0; n < 10; n += 1) await settle(5);
      const sent = [...server.lines.values()].map((row) => row.itemId);
      // خلص رفعها هناك وفلتتها: الرفّ انقرا من جديد بلاها (ولا تنبيه)، وما بقى انتظار قفل.
      const released = [text().includes('يُعمل عليها في نافذة أخرى'), byAction('upload-device-draft').length, webLocks.pending().length];
      t.same(
        [shownClaimed, refused, afterRemove, sent, released],
        [[true, false, false, false], true, ['l-21', 'l-22'], ['i-kaz', 'i-bulb'], [false, 0, 0]],
        `C2: مسوّدة ماسكتها نافذة ثانية تنعرض «يُعمل عليها في نافذة أخرى»، وحذف سطر منها ينرفض فما ينحذف سطر يرتفع رغماً، والتنبيه يروح لمّا تفلتها (${JSON.stringify([sent, released])})`,
      );
      await unmount();
      await clearDrafts();
    }

    // ── C2b: الرفّ انعرض قبل ما تمسكها النافذة الثانية (أزراره بعدها شغّالة): حذف سطر بنصّ رفعها هناك ينرفض «يُعمل عليها في نافذة
    //         أخرى»، والسطر باقٍ على الجهاز ويرتفع ويّا رفعها.
    if (run('C2b')) {
      const server = makeServer();
      fresh(session(), { ...base });
      await clearDrafts();
      const draft = await m.saveDeviceDraft(STAMP, { id: 'dd-c2b', kind: 'transfer', title: 'تحويل', payload: payload('h-2b', null, [KAZ('l-2b1'), BULB('l-2b2')]) });
      m.onlineStore.set(true);
      await mount('/inventory/transfers');
      fire(byAction('show-device-lines')[0], 'click');
      await settle();
      let release = null;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const windowA = {
        confirm: async () => STAMP,
        createTransferDraft: async (...a) => server.create(...a),
        addTransferLine: async (...a) => {
          await gate;
          return server.add(...a);
        },
        saveDeviceDraft: m.saveDeviceDraft,
        removeDeviceDraft: m.removeDeviceDraft,
        newId: () => crypto.randomUUID(),
        deriveId: m.transfers.deriveId,
        linesOn: async (docId) => server.on(docId),
      };
      const upA = webLocks.locks.request('device-draft:dd-c2b', { ifAvailable: true }, () => m.transfers.uploadShelfDraft(draft, windowA)).then((r) => r, (e) => e);
      await settle();
      fire(byAction('remove-device-line')[1], 'click');
      await settle();
      fire(byAction('confirm-drop-device')[0], 'click');
      await settle();
      const refused = text().includes('يُعمل على هذه الورقة في نافذة أخرى');
      const linesNow = (await m.listDeviceDrafts(STAMP, 'transfer')).find((d) => d.id === 'dd-c2b')?.payload.lines.map((l) => l.id) ?? null;
      release();
      await upA;
      await settle();
      t.same([refused, linesNow, [...server.lines.values()].map((row) => row.itemId)], [true, ['l-2b1', 'l-2b2'], ['i-kaz', 'i-bulb']], 'C2b: حذف سطر بنصّ رفع نافذة ثانية ينرفض بسببه، والسطر يرتفع ويّا رفعها');
      await unmount();
      await clearDrafts();
    }

    // ── C3: h-3 ترحّل وبيه l-31، ونافذتان تضغطان «ارفع» على نفس مسوّدة الجهاز. كانت كل وحدة تنقل الباقي بمعرّفات جديدة مالها،
    //        فـ«مصابيح» توصل مسوّدتين جديدتين (معرّفات الجهاز ما عادت تحمي الإعادة)؛ هسه المعرّفات مشتقّة فالثانية 23505.
    if (run('C3')) {
      const server = makeServer();
      server.heads.set('h-3', 'posted');
      server.lines.set('l-31', { docId: 'h-3', itemId: 'i-kaz' });
      let releaseA = null;
      const windowA = {
        confirm: async () => STAMP,
        createTransferDraft: async (...a) => server.create(...a),
        addTransferLine: async (...a) => server.add(...a),
        saveDeviceDraft: m.saveDeviceDraft,
        removeDeviceDraft: m.removeDeviceDraft,
        newId: () => crypto.randomUUID(),
        deriveId: m.transfers.deriveId,
        linesOn: (docId) =>
          new Promise((resolve) => {
            releaseA = () => resolve(server.on(docId));
          }),
      };
      fresh(session(), {
        ...base,
        loadMyWorkspace: () => ({ kind: 'member', workspace: ws() }),
        createTransferDraft: server.create,
        addTransferLine: server.add,
        loadStockDoc: server.doc,
      });
      await clearDrafts();
      const draft = await m.saveDeviceDraft(STAMP, { id: 'dd-p3', kind: 'transfer', title: 'تحويل', payload: payload('h-3', 'h-3', [KAZ('l-31'), BULB('l-32')]) });
      m.onlineStore.set(true);
      await mount('/inventory/transfers');
      const upA = m.transfers.uploadShelfDraft(draft, windowA).then((r) => r, (e) => e);
      await settle();
      fire(byAction('upload-device-draft')[0], 'click');
      await settle();
      if (releaseA) releaseA();
      const resultA = await upA;
      await settle();
      const left = (await m.listDeviceDrafts(STAMP, 'transfer')).length;
      t.same([server.where('i-kaz'), server.where('i-bulb').length], [['h-3:posted'], 1], `C3: نافذتان ترفعان نفس المسوّدة بعد ما انرحّل رأسها: «مصابيح» مرّة وحدة (${JSON.stringify(server.where('i-bulb'))}) (window A: ${resultA?.docId ?? resultA?.name}; device drafts left ${left})`);
      await unmount();
      await clearDrafts();
    }

    // ── C4: بلا نت، قائمة التحويلات (المحمّلة قبل) تبقى لمّا تنحفظ مسوّدة على الجهاز (الحفظ بلا نت يحرّك الرفّ بس).
    if (run('C4')) {
      let net = true;
      const posted = { id: 't-p4', kind: 'transfer', status: 'posted', version: 2, docNo: 'TR-2026-0044', warehouseId: 'w-gen', toWarehouseId: 'w-farm', onDate: '2026-10-29', note: null, posted: true, voidReason: null, createdAt: '2026-10-29T10:00:00Z' };
      fresh(session(), {
        ...base,
        listStockDocs: () => {
          if (!net) throw new m.NetworkError();
          return { rows: [posted], next: null, total: 1 };
        },
      });
      await clearDrafts();
      m.onlineStore.set(true);
      m.rememberItems([kaz, bulbs]);
      await mount('/inventory/transfers');
      const before = linkTo('t-p4');
      net = false;
      m.onlineStore.set(false);
      await settle();
      choose(byIdSuffix('-from')[0], 'w-gen');
      await settle();
      choose(byIdSuffix('-to')[0], 'w-farm');
      await settle();
      type(byAction('search-item')[0], 'كاز');
      await settle();
      fire(byAction('pick-item')[0], 'click');
      await settle();
      type(byIdSuffix('-qty')[0], '100');
      await settle();
      fire(byAction('add-device-line')[0], 'click');
      await settle();
      fire(byAction('new-transfer')[0].parentNode, 'submit');
      await settle();
      const saved = (await m.listDeviceDrafts(STAMP, 'transfer')).length;
      t.same([before, saved, linkTo('t-p4')], [1, 1, 1], `C4: الحفظ بلا نت يبقي قائمة التحويلات المحمّلة (${text().includes('تعذّر') ? 'تعذّر' : 'اختفت'})`);
      await unmount();
      await clearDrafts();
      m.onlineStore.set(true);
    }

    // ── C5: «المزيد» بالطريق لمّا تخلص محاولة رفع (docs.reload): الصفحة المتأخّرة من المؤشّر القديم كانت تنضاف للصفحة الأولى
    //        الجديدة، فصفّ بيناتهم ما ينعرض أبداً و«المزيد» يختفي؛ هسه عدّاد الجيل يرميها.
    if (run('C5')) {
      const doc = (id, status, at) => ({ id, kind: 'transfer', status, version: 1, docNo: status === 'draft' ? null : `TR-2026-${id}`, warehouseId: 'w-gen', toWarehouseId: 'w-farm', onDate: '2026-10-30', note: null, posted: status !== 'draft', voidReason: null, createdAt: at });
      const A = doc('0001', 'draft', '2026-10-30T11:00:00Z');
      const [B, C, D, E] = [doc('0002', 'posted', '2026-10-30T09:00:00Z'), doc('0003', 'posted', '2026-10-30T08:00:00Z'), doc('0004', 'posted', '2026-10-30T07:00:00Z'), doc('0005', 'posted', '2026-10-30T06:00:00Z')];
      let rows = [B, C, D, E];
      let hold = null;
      fresh(session(), {
        ...base,
        listStockDocs: (kind, after) => {
          if (!after) return { rows: rows.slice(0, 2), next: { status: rows[1].status, createdAt: rows[1].createdAt, id: rows[1].id }, total: rows.length };
          const at = rows.findIndex((r) => r.id === after.id);
          const slice = rows.slice(at + 1, at + 3);
          const last = slice.at(-1);
          const page = { rows: slice, next: at + 3 < rows.length && last ? { status: last.status, createdAt: last.createdAt, id: last.id } : null, total: null };
          return new Promise((resolve) => {
            hold = () => resolve(page);
          });
        },
        loadMyWorkspace: () => ({ kind: 'member', workspace: ws({ orgId: 'org-elsewhere' }) }),
      });
      await clearDrafts();
      await m.saveDeviceDraft(STAMP, { id: 'dd-p5', kind: 'transfer', title: 'تحويل', payload: payload('h-5', null, [KAZ('l-51')]) });
      m.onlineStore.set(true);
      await mount('/inventory/transfers');
      fire(byAction('more-transfers')[0], 'click');
      await settle();
      rows = [A, B, C, D, E];
      fire(byAction('upload-device-draft')[0], 'click');
      await uploadIdle();
      const stale = hold;
      hold = null;
      if (stale) stale();
      await settle();
      const afterReload = ['0001', '0002', '0003', '0004', '0005'].filter((id) => linkTo(id) > 0);
      // الصفحات بعدها ترجع فوراً: «المزيد» لحد ما يختفي، وكل صفّ مرّة وحدة.
      for (let n = 0; n < 5 && byAction('more-transfers').length > 0; n += 1) {
        fire(byAction('more-transfers')[0], 'click');
        await settle();
        if (hold) {
          const next = hold;
          hold = null;
          next();
          await settle();
        }
      }
      const listed = ['0001', '0002', '0003', '0004', '0005'].map((id) => linkTo(id));
      t.same([afterReload, listed, byAction('more-transfers').length], [['0001', '0002'], [1, 1, 1, 1, 1], 0], `C5: صفحة «المزيد» من قبل إعادة القراءة تنرمى، و«المزيد» بعدها يجيب الباقي بلا قفز ولا تكرار (${JSON.stringify(listed)})`);
      await unmount();
      await clearDrafts();
    }

    // ── C6: إشعار نقل الباقي فصيح (قرار المالك 18)، وi18n-guard يمسكه لو ما كان.
    if (run('C6')) {
      const { dialectWords } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'guards', 'i18n-guard.mjs')).href);
      const detail = 'السطور اللي وصلتها ({landed}) ما انعادت؛ والباقي صار مسوّدة جديدة.';
      t.ok(dialectWords(detail).length > 0, `C6: i18n-guard يمسك «اللي» (${JSON.stringify(dialectWords(detail))})`);
      const shown = ['السطور التي وصلتها ({landed}) لم تُكرَّر، وصار الباقي مسوّدة جديدة.', 'كل السطور الباقية كانت قد وصلتها ({landed})، فلم تُكرَّر ولم تُنشأ مسوّدة جديدة.', 'يُعمل على هذه المسوّدة في نافذة أخرى'];
      t.same(shown.flatMap((text) => dialectWords(text)), [], 'C6: نصوص الرسالة الجديدة فصيحة');
    }

    // ── C7: مسوّدة جهاز سطورها بلا معرّف (انحفظت قبل معرّفات السطور، وwithIds يدعمها): حذف السطر الثالث يحذفه هو بالضبط،
    //        والتأكيد يسمّيه.
    if (run('C7')) {
      fresh(session(), { ...base });
      await clearDrafts();
      const noId = (itemId, itemName) => ({ itemId, itemName, baseUnit: 'L', itemUnitId: null, unitCode: null, unitLabel: 'لتر', qtyInUnit: '1.000' });
      await m.saveDeviceDraft(STAMP, { id: 'dd-p7', kind: 'transfer', title: 'تحويل قديم', payload: { from: 'w-gen', to: 'w-farm', day: '2026-10-30', note: '', lines: [noId('i-a', 'مادّة ألف'), noId('i-b', 'مادّة باء'), noId('i-c', 'مادّة جيم')] } });
      m.onlineStore.set(true);
      await mount('/inventory/transfers');
      fire(byAction('show-device-lines')[0], 'click');
      await settle();
      fire(byAction('remove-device-line')[2], 'click');
      await settle();
      const sentence = all().find((n) => n.getAttribute('role') === 'dialog' || n.getAttribute('role') === 'alertdialog')?.textContent ?? '';
      fire(byAction('confirm-drop-device')[0], 'click');
      await settle();
      const left = (await m.listDeviceDrafts(STAMP, 'transfer')).find((d) => d.id === 'dd-p7')?.payload.lines.map((l) => l.itemName) ?? null;
      t.same([sentence.includes('مادّة جيم'), left], [true, ['مادّة ألف', 'مادّة باء']], `C7: حذف «مادّة جيم» من مسوّدة بلا معرّفات سطور (${JSON.stringify(left)})`);
      await unmount();
      await clearDrafts();
    }
    // ── C7b: نفس المسوّدة بلا معرّفات، ونافذة ثانية رفعتها (withIds عطاها معرّفات، والسطر الأوّل وصل وانشال، وبعدها انقطعت الشبكة).
    //         حذف «مادّة باء» بترتيبه من الرفّ القديم كان يحذف «مادّة جيم» (الترتيب تحرّك): هسه ينرفض «رُفع هذا السطر أو تغيّر».
    if (run('C7b')) {
      const server = makeServer();
      fresh(session(), { ...base });
      await clearDrafts();
      const noId = (itemId, itemName) => ({ itemId, itemName, baseUnit: 'L', itemUnitId: null, unitCode: null, unitLabel: 'لتر', qtyInUnit: '1.000' });
      const draft = await m.saveDeviceDraft(STAMP, { id: 'dd-p7b', kind: 'transfer', title: 'تحويل قديم', payload: { from: 'w-gen', to: 'w-farm', day: '2026-10-30', note: '', lines: [noId('i-a', 'مادّة ألف'), noId('i-b', 'مادّة باء'), noId('i-c', 'مادّة جيم')] } });
      m.onlineStore.set(true);
      await mount('/inventory/transfers');
      fire(byAction('show-device-lines')[0], 'click');
      await settle();
      let sent = 0;
      const windowA = {
        confirm: async () => STAMP,
        createTransferDraft: async (...a) => server.create(...a),
        addTransferLine: async (docId, fields, id) => {
          sent += 1;
          if (sent > 1) throw new m.NetworkError();
          return server.add(docId, fields, id);
        },
        saveDeviceDraft: m.saveDeviceDraft,
        removeDeviceDraft: m.removeDeviceDraft,
        newId: () => crypto.randomUUID(),
        deriveId: m.transfers.deriveId,
        linesOn: async (docId) => server.on(docId),
      };
      const errA = await webLocks.locks.request('device-draft:dd-p7b', { ifAvailable: true }, () => m.transfers.uploadShelfDraft(draft, windowA)).then((r) => r, (e) => e);
      const onDevice = async () => (await m.listDeviceDrafts(STAMP, 'transfer')).find((d) => d.id === 'dd-p7b')?.payload.lines.map((l) => l.itemName) ?? null;
      const before = await onDevice();
      fire(byAction('remove-device-line')[1], 'click');
      await settle();
      const sentence = all().find((n) => n.getAttribute('role') === 'dialog' || n.getAttribute('role') === 'alertdialog')?.textContent ?? '';
      fire(byAction('confirm-drop-device')[0], 'click');
      for (let n = 0; n < 5; n += 1) await settle(5);
      const left = await onDevice();
      t.same(
        [errA?.name, before, sentence.includes('مادّة باء'), left, text().includes('رُفع هذا السطر أو تغيّر في نافذة أخرى')],
        ['NetworkError', ['مادّة باء', 'مادّة جيم'], true, ['مادّة باء', 'مادّة جيم'], true],
        `C7b: حذف سطر بلا معرّف بترتيبه بعد ما نافذة ثانية رفعت المسوّدة ينرفض وما يحذف سطراً ثانياً (${JSON.stringify(left)})`,
      );
      await unmount();
      await clearDrafts();
    }
    // ── C8: not_draft يثبت إن h-8 موجود، بس قراءة ZeroRowsError (الرأس مخفي لأن نطاق أمين المخزن تضيّق) كانت تنحسب «ماكو شي
    //        وصل»: النقل يكتب معرّفات جديدة والرأس الجديد ينرفض (RLS)، ولمّا يرجع النطاق الإعادة تكتب السطر الواصل مرّة ثانية.
    if (run('C8')) {
      const server = makeServer();
      server.heads.set('h-8', 'posted');
      server.lines.set('l-81', { docId: 'h-8', itemId: 'i-kaz' });
      let scoped = false;
      fresh(session(), {
        ...base,
        loadMyWorkspace: () => ({ kind: 'member', workspace: ws() }),
        createTransferDraft: (...a) => {
          if (!scoped) throw new m.RejectedError('42501', 'المخزن المرسِل خارج نطاقك.');
          return server.create(...a);
        },
        addTransferLine: server.add,
        loadStockDoc: (kind, id) => {
          if (!scoped) throw new m.ZeroRowsError();
          return server.doc(kind, id);
        },
      });
      await clearDrafts();
      await m.saveDeviceDraft(STAMP, { id: 'dd-p8', kind: 'transfer', title: 'تحويل', payload: payload('h-8', 'h-8', [KAZ('l-81'), BULB('l-82')]) });
      m.onlineStore.set(true);
      await mount('/inventory/transfers');
      fire(byAction('upload-device-draft')[0], 'click');
      await settle();
      scoped = true;
      await pressUploadUntilGone();
      t.same(server.where('i-kaz'), ['h-8:posted'], `C8: رأس سابق مخفي بالنطاق ما ينقرا فارغاً (كاز ${JSON.stringify(server.where('i-kaz'))})`);
      await unmount();
      await clearDrafts();
    }
  } finally {
    console.error = originalError;
    delete globalThis.__flow;
    webLocks.restore();
    restore();
  }
}
