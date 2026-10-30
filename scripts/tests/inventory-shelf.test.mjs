// رفّ مسوّدات الجهاز بعد إصلاحاته (المراجعة الثانية للإصلاحات، WP4)، بنفس عدّة inventory-flows (StockRoutes الحقيقية على dom.mjs):
// S1 سطر جوابه ضاع ثم المسوّدة بالخادم انرحّلت: الإعادة ما تكتبه مرّتين؛ S2 وقت فقس بفراغات ما يطيّح المحرّر؛ S3 جواب بحث وصل
// بعد تبديل المستخدم ما ينحفظ للجديد؛ S4 مسوّدة ترتفع من النموذج ما تنعرض بالرفّ (فما ينحذف منها سطر يرتفع رغماً)؛ S5 جملة
// حذف السطر بالفصحى؛ S6 بعد رفع جزئي القائمة تنقرا من جديد. كلها كانت تفشل على الإصلاحات الأولى.
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

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
    "export { uploadShelfDraft } from './src/pages/inventory/TransfersPage.tsx';",
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
const type = (input, value) => {
  input.value = value;
  fire(input, 'input');
};

export default async function (t) {
  const restore = installDom();
  const uncaught = [];
  const onUncaught = (error) => uncaught.push(error);
  process.on('uncaughtException', onUncaught);
  const originalError = console.error;
  console.error = () => {};
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
      try {
        m.flushSync(() => root.unmount());
      } catch {
        /* root may already be torn down by an uncaught render error */
      }
      body().textContent = '';
      await settle();
    };

    // ── S1: a line write whose response was lost, then the partial server draft is posted: the retry re-homes that line
    //        to a fresh header although it is already in the posted transfer (the BEFORE INSERT guard raises not_draft
    //        before the primary-key check, so 23505 never comes back once the header is not a draft).
    {
      const server = { heads: new Map(), lines: new Map() };
      let lose = null;
      let device = null;
      let n = 0;
      const line = (k) => ({ id: `l-${k}`, itemId: `i-${k}`, itemName: `مادّة ${k}`, baseUnit: 'L', itemUnitId: null, unitCode: null, unitLabel: 'لتر', qtyInUnit: `${k}00.000` });
      const draft = { id: 'dd-1', userId: 'u-1', orgId: 'org-1', kind: 'transfer', title: 'تحويل', savedAt: 1, payload: { from: 'w-gen', to: 'w-farm', day: '2026-10-30', note: '', headerId: 'h-1', docId: null, lines: [line(1), line(2)] } };
      const deps = {
        confirm: async () => ({ userId: 'u-1', orgId: 'org-1' }),
        createTransferDraft: async (from, to, day, note, id) => {
          if (server.heads.has(id)) throw new m.RejectedError('23505', null);
          server.heads.set(id, 'draft');
          return { id };
        },
        // transfer_lines_guard is BEFORE INSERT: header lookup (doc_not_found) and status (not_draft) run before the PK check (23505).
        addTransferLine: async (docId, fields, id) => {
          if (!server.heads.has(docId)) throw new m.RejectedError('doc_not_found', 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.');
          if (server.heads.get(docId) !== 'draft') throw new m.RejectedError('not_draft', 'المستند مرحَّل أو ملغى؛ لا تُعدَّل سطوره.');
          if (server.lines.has(id)) throw new m.RejectedError('23505', null);
          server.lines.set(id, { docId, itemId: fields.item_id });
          if (lose === fields.item_id) {
            lose = null;
            throw new m.UnknownOutcomeError('fetch_failed');
          }
          return {};
        },
        saveDeviceDraft: async (stamp, next) => {
          device = { ...draft, id: next.id, title: next.title, payload: next.payload };
          return device;
        },
        removeDeviceDraft: async () => {
          device = null;
        },
        newId: () => `n-${(n += 1)}`,
        linesOn: async (docId) => new Set([...server.lines].filter(([, row]) => row.docId === docId).map(([id]) => id)),
      };
      lose = 'i-1';
      const first = await m.uploadShelfDraft(draft, deps).then((r) => `ok:${r.docId}`, (error) => error.name);
      t.same([first, device?.payload.docId, device?.payload.lines.map((l) => l.id)], ['UnknownOutcomeError', 'h-1', ['l-1', 'l-2']], 'S1 ضابط: جواب السطر الأوّل ضاع؛ الجهاز يحتفظ بـh-1 والسطرين، والخادم عنده السطر الأوّل');
      server.heads.set('h-1', 'posted'); // the storekeeper posts the server draft (it holds line 1) before pressing «ارفع» again
      const second = await m.uploadShelfDraft(device, deps).then((r) => r, (error) => error.name);
      const perItem = [...server.lines.values()].filter((l) => l.itemId === 'i-1').map((l) => `${l.docId}:${server.heads.get(l.docId)}`);
      const perOther = [...server.lines.values()].filter((l) => l.itemId === 'i-2').map((l) => server.heads.get(l.docId));
      t.same([perItem.length, perOther, second.previous, device], [1, ['draft'], { docId: 'h-1', landed: 1 }, null], `S1: الإعادة بعد جواب ضاع والمسوّدة انرحّلت: «مادّة 1» مرّة وحدة، والباقي بمسوّدة جديدة، والنتيجة تسمّي السابقة (${JSON.stringify(perItem)})`);
    }

    // ── S2: hatch time typed with spaces between day/month/year (DAY_TEXT accepts a space separator): parseMomentText accepts it,
    //        then the hint calls fmtDay('') and the opening editor crashes.
    {
      fresh({ status: 'ready', workspace: ws({ role: 'manager', scopes: [], divisions: ['general', 'broiler', 'hatchery'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true }), offline: false }, {
        loadOrgSetup: () => org,
        loadStockDoc: () => ({ doc: { id: 'o-1', kind: 'opening', status: 'draft', version: 1, docNo: null, warehouseId: 'w-chick', toWarehouseId: null, onDate: '2026-11-03', note: null, posted: false, voidReason: null, createdAt: '2026-10-30T10:00:00+00:00' }, openingLines: [], transferLines: [] }),
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
      const control = byIdSuffix('-born')[0];
      type(control, '28/10/2026 06:00');
      await settle();
      t.ok(byAction('add-opening-line').length === 1 && uncaught.length === 0, 'S2 ضابط: «28/10/2026 06:00» يعرض التلميح والنموذج باقٍ');
      try {
        type(byIdSuffix('-born')[0], '28 10 2026 06:00');
      } catch (error) {
        uncaught.push(error);
      }
      await settle();
      t.ok(
        byAction('add-opening-line').length === 1 && uncaught.length === 0,
        `S2: «28 10 2026 06:00» (يوم بفراغات يقبله parseDayText) ما يطيّح محرّر الافتتاح (${uncaught.map((e) => e?.message).join('، ')})`,
      );
      uncaught.length = 0;
      await unmount();
    }

    // ── S3: an item search answered after the session switched to another user/org is remembered for the new owner
    //        (rememberItems runs before the cancelled check), so the next user's offline picker lists the previous org's items.
    {
      const orgA = itemRow('i-secret', 'مادّة المنشأة الأولى', 'fuel', 'L');
      let answer = null;
      fresh({ status: 'ready', workspace: ws(), offline: false }, {
        loadOrgSetup: () => org,
        listStockDocs: () => ({ rows: [], next: null, total: 0 }),
        listItems: (query) => (query?.search ? new Promise((resolve) => { answer = resolve; }) : { rows: [], total: 0, next: null }),
        listItemUnits: () => [],
      });
      m.onlineStore.set(true);
      await mount('/inventory/openings/x');
      await unmount();
      // A transfer form on user A's session: start a search, leave it pending.
      fresh({ status: 'ready', workspace: ws(), offline: false }, {
        loadOrgSetup: () => org,
        listStockDocs: () => ({ rows: [], next: null, total: 0 }),
        listItems: (query) => (query?.search ? new Promise((resolve) => { answer = resolve; }) : { rows: [], total: 0, next: null }),
        listItemUnits: () => [],
        loadStockDoc: () => ({ doc: { id: 't-9', kind: 'transfer', status: 'draft', version: 1, docNo: null, warehouseId: 'w-gen', toWarehouseId: 'w-farm', onDate: '2026-10-29', note: null, posted: false, voidReason: null, createdAt: '2026-10-30T10:00:00+00:00' }, openingLines: [], transferLines: [] }),
      });
      await mount('/inventory/transfers/t-9');
      type(byAction('search-item')[0], 'مادّة');
      await settle();
      t.ok(typeof answer === 'function', 'S3 ضابط: طلب البحث معلّق');
      await unmount(); // user A signs out (screen unmounts)
      globalThis.__flow.session = { status: 'ready', workspace: ws({ userId: 'u-2', orgId: 'org-2' }), offline: false }; // user B signs in
      answer({ rows: [orgA], total: 1, next: null }); // A's answer arrives late
      await settle();
      const leaked = m.seenItemsMatching('مادّة').map((row) => row.id);
      t.same(leaked, [], `S3: مواد الجلسة للمستخدم الثاني ما بيها مواد المنشأة الأولى (${JSON.stringify(leaked)})`);
    }

    // ── S4: «ارفع المسوّدة بسطورها» on NewTransfer: the shelf lists the same draft as idle while NewTransfer uploads it. A line
    //        removed on the shelf meanwhile («... ولا يرتفع») is written back by the upload's next save and uploaded anyway.
    {
      const kaz = itemRow('i-kaz', 'كاز أويل', 'fuel', 'L');
      const bulbs = itemRow('i-bulb', 'مصابيح', 'equipment', 'pc');
      const gate = [];
      const calls = fresh({ status: 'ready', workspace: ws(), offline: false }, {
        loadOrgSetup: () => org,
        listStockDocs: () => ({ rows: [], next: null, total: 0 }),
        listItems: () => ({ rows: [kaz, bulbs], total: 2, next: null }),
        listItemUnits: () => [],
        loadMyWorkspace: () => ({ kind: 'member', workspace: ws() }),
        createTransferDraft: (from, to, day, note, id) => ({ id }),
        addTransferLine: () => new Promise((resolve) => gate.push(resolve)),
        loadStockDoc: () => new Promise(() => {}),
      });
      for (const d of await m.listDeviceDrafts({ userId: 'u-1', orgId: 'org-1' }, 'transfer')) await m.removeDeviceDraft(d.id);
      m.onlineStore.set(false);
      m.rememberItems([kaz, bulbs]);
      await mount('/inventory/transfers');
      const choose = (select, value) => {
        select.value = value;
        fire(select, 'change');
      };
      choose(byIdSuffix('-from')[0], 'w-gen');
      await settle();
      choose(byIdSuffix('-to')[0], 'w-farm');
      await settle();
      for (const [search, qty] of [['كاز', '100'], ['مصابيح', '4']]) {
        type(byAction('search-item')[0], search);
        await settle();
        fire(byAction('pick-item')[0], 'click');
        await settle();
        type(byIdSuffix('-qty')[0], qty);
        await settle();
        fire(byAction('add-device-line')[0], 'click');
        await settle();
      }
      m.onlineStore.set(true);
      await settle();
      fire(byAction('new-transfer')[0].parentNode, 'submit'); // «ارفع المسوّدة بسطورها»
      await settle();
      t.same([gate.length, byAction('upload-device-draft').length, byAction('remove-device-line').length], [1, 0, 0], 'S4: السطر الأوّل بالطريق والرفّ ما يعرض المسوّدة اللي ترتفع (فما ينحذف منها سطر يرتفع رغماً)');
      gate.shift()({});
      await settle();
      while (gate.length) {
        gate.shift()({});
        await settle();
      }
      const sent = calls.filter(([n]) => n === 'addTransferLine').map(([, a]) => a[1].item_id);
      t.same([sent, (await m.listDeviceDrafts({ userId: 'u-1', orgId: 'org-1' }, 'transfer')).length], [['i-kaz', 'i-bulb'], 0], 'S4: الرفع كمل بالسطرين وانشالت من الجهاز');
      await unmount();
      for (const d of await m.listDeviceDrafts({ userId: 'u-1', orgId: 'org-1' }, 'transfer')) await m.removeDeviceDraft(d.id);
    }

    // ── S5: the shelf's line-removal sentence counts with fmtCounted and no forms: «(2 لتر)»، «(5 قطعة)» (owner lesson: «2 بيضة» is not Fusha).
    {
      fresh({ status: 'ready', workspace: ws(), offline: false }, {
        loadOrgSetup: () => org,
        listStockDocs: () => ({ rows: [], next: null, total: 0 }),
        listItems: () => ({ rows: [], total: 0, next: null }),
      });
      const shelfLine = (id, itemName, baseUnit, unitLabel, qtyInUnit) => ({ id, itemId: `i-${id}`, itemName, baseUnit, itemUnitId: null, unitCode: null, unitLabel, qtyInUnit });
      await m.saveDeviceDraft({ userId: 'u-1', orgId: 'org-1' }, { id: 'dd-p5', kind: 'transfer', title: 'تحويل', payload: { from: 'w-gen', to: 'w-farm', day: '2026-10-30', note: '', headerId: 'h-p5', docId: null, lines: [shelfLine('a', 'كاز أويل', 'L', 'لتر', '2.000'), shelfLine('b', 'مصابيح', 'pc', 'قطعة', '5.000')] } });
      m.onlineStore.set(true);
      await mount('/inventory/transfers');
      fire(byAction('show-device-lines')[0], 'click');
      await settle();
      const sentences = [];
      for (const index of [0, 1]) {
        fire(byAction('remove-device-line')[index], 'click');
        await settle();
        const dialog = all().find((n) => n.getAttribute('role') === 'dialog' || n.getAttribute('role') === 'alertdialog');
        sentences.push(dialog?.textContent ?? body().textContent);
        const cancel = all().find((n) => n.localName === 'button' && /تراجع/u.test(n.textContent));
        if (cancel) fire(cancel, 'click');
        await settle();
      }
      t.ok(!/\(2 لتر\)|\(5 قطعة\)/u.test(sentences.join(' ')), `S5: جملة حذف السطر بالفصحى («لتران»، «5 قطع») مو «2 لتر»/«5 قطعة» (${sentences.map((x) => x.slice(0, 120)).join(' || ')})`);
      await unmount();
      await m.removeDeviceDraft('dd-p5');
    }

    // ── S6: a partial upload from the shelf (header written, then a network failure) — the message says the uploaded part «is in
    //        the draft on the server», but the transfers list on the same page is never re-read, so that draft is not listed.
    {
      const heads = [];
      fresh({ status: 'ready', workspace: ws(), offline: false }, {
        loadOrgSetup: () => org,
        listStockDocs: () => ({ rows: heads.map((id) => ({ id, kind: 'transfer', status: 'draft', version: 1, docNo: null, warehouseId: 'w-gen', toWarehouseId: 'w-farm', onDate: '2026-10-30', note: null, posted: false, voidReason: null, createdAt: '2026-10-30T10:00:00+00:00' })), next: null, total: heads.length }),
        listItems: () => ({ rows: [], total: 0, next: null }),
        loadMyWorkspace: () => ({ kind: 'member', workspace: ws() }),
        createTransferDraft: (from, to, day, note, id) => (heads.push(id), { id }),
        addTransferLine: () => {
          throw new (class extends Error {})('offline');
        },
      });
      await m.saveDeviceDraft({ userId: 'u-1', orgId: 'org-1' }, { id: 'dd-p6', kind: 'transfer', title: 'تحويل', payload: { from: 'w-gen', to: 'w-farm', day: '2026-10-30', note: '', headerId: 'h-p6', docId: null, lines: [{ id: 'l-p6', itemId: 'i-x', itemName: 'كاز أويل', baseUnit: 'L', itemUnitId: null, unitCode: null, unitLabel: 'لتر', qtyInUnit: '5.000' }] } });
      m.onlineStore.set(true);
      await mount('/inventory/transfers');
      fire(byAction('upload-device-draft')[0], 'click');
      await settle();
      const listed = all().filter((n) => n.localName === 'a' && (n.getAttribute('href') ?? '').endsWith('/inventory/transfers/h-p6')).length;
      t.ok(heads.includes('h-p6') && listed === 1, `S6: بعد رفع جزئي المسوّدة h-p6 تبين بقائمة التحويلات بنفس الصفحة (${heads.includes('h-p6')}، ${listed})`);
      await unmount();
      await mount('/inventory/transfers');
      const relisted = all().filter((n) => n.localName === 'a' && (n.getAttribute('href') ?? '').endsWith('/inventory/transfers/h-p6')).length;
      t.ok(relisted === 1, `S6 ضابط: بعد إعادة الفتح القائمة تعرضها (${relisted})`);
      await unmount();
      await m.removeDeviceDraft('dd-p6');
    }
  } finally {
    console.error = originalError;
    process.off('uncaughtException', onUncaught);
    delete globalThis.__flow;
    restore();
  }
}
