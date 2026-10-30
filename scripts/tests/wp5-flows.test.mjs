// شاشات WP5 التفاعلية (مراجعة WP5): react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل StockRoutes الحقيقية، وrepo الجرد والصرف
// والجلسة والرسائل بدائل، ومحفوظ الجهاز الحقيقي على fake-indexeddb. كل حالة كانت تفشل على الشفرة قبل الإصلاح:
// C1 تعديل سطر العدّ بلا المادّة (المنح بلاها)؛ C2 عدّ ثاني لمادّة معدودة ينجمع بتأكيد بدل سطر ثاني؛ C3 التسليم بنسخة الشاشة؛
// C4 حذف السطر بتأكيد؛ C5 الترحيل بموافقة كل خطّ وتأكيد؛ C6 السبب على فرق قديم يتأكّد؛ C7 نتيجة «أعد الحساب» تبقى بعد القراءة؛
// U1 مسوّدة الصرف بمعرّف الجهاز (الإعادة بعد شبكة 23505 = انكتبت فتنفتح)؛ U2 زرّ إلغاء الصرف لمن عنده الفعل بس.
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const COUNTS = ['listCounts', 'loadCount', 'createCountDraft', 'addCountLine', 'updateCountLine', 'deleteCountLine', 'discardCount', 'countVersion', 'submitCount', 'returnCount', 'setCountReason', 'setGainUnitCost', 'previewCount', 'refreshCount', 'postCount', 'voidCount', 'loadApprovals'];
const USES = ['listUses', 'loadUse', 'createUseDraft', 'updateUseDraft', 'addUseLine', 'deleteUseLine', 'discardUse', 'previewUse', 'postUse', 'voidUse'];
const INVENTORY = ['loadOrgSetup', 'listItems', 'listItemUnits', 'loadItemLots'];
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__flow.call('${n}', a);`).join(' ')}`;
const STUBS = {
  counts: routed('counts', COUNTS),
  uses: routed('uses', USES),
  inventory: routed('inventory', INVENTORY),
  session: 'export const useSession = () => globalThis.__flow.session; export const sessionStore = { get: () => globalThis.__flow?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__flow.toasts.push(spec); }; export function Toaster() { return null; }',
};
const stubs = {
  name: 'wp5-flow-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/(counts|uses|inventory)$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'wp5-flow' }));
    b.onLoad({ filter: /.*/, namespace: 'wp5-flow' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
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
    "export { searchable } from './src/domain/normalize.ts';",
    "export { NetworkError, RejectedError } from './src/lib/errors.ts';",
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
const byId = (id) => all().find((n) => n.id === id);
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
    const ws = (role, over = {}) => ({ userId: `u-${role}`, orgId: 'org-1', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role, scopes: role === 'storekeeper' ? [{ warehouseId: 'w-gen' }] : [], divisions: ['general'], canSeeCost: role !== 'storekeeper', canSeeAccounts: false, canSeeSales: false, invites: [], subscription: 'active', confirmedAt: 1, ...over });
    const org = {
      divisions: [{ id: 'd-gen', kind: 'general', goLiveOn: '2026-10-01', frozen: true }],
      sites: [],
      packTypes: [],
      itemCategories: [],
      expenseCategories: [{ id: 'cat-1', version: 1, archived: false, name: 'صيانة', systemCode: null }],
      warehouses: [{ id: 'w-gen', version: 1, archived: false, divisionId: 'd-gen', siteId: 's-gen', name: 'المخزن العام', kind: 'general', hasBalance: true }],
    };
    const kaz = { id: 'i-kaz', version: 1, archived: false, name: 'كاز أويل', nameNorm: m.searchable('كاز أويل'), categoryId: null, kind: 'fuel', baseUnit: 'L', density: null, pieceMassKg: null, tracksExpiry: false, scaleStep: 1000n, minQty: null, barcode: null, altCodes: [] };
    const countDoc = (over = {}) => ({ id: 'c-1', status: 'draft', version: 5, docNo: null, warehouseId: 'w-gen', onDate: '2026-10-30', note: null, submittedAt: null, returnReason: null, voidReason: null, createdAt: '2026-10-30T08:00:00Z', ...over });
    const kazLine = { id: 'l-kaz', lineNo: 1, itemId: 'i-kaz', itemName: 'كاز أويل', itemKind: 'fuel', baseUnit: 'L', tracksExpiry: false, counted: 40000n, countedExpired: null, gainExpiryOn: null, gainExpiredExpiryOn: null, gainBornAt: null, reason: null };
    const reviewLine = (over = {}) => ({
      lineId: 'l-kaz', lineNo: 1, itemId: 'i-kaz', itemName: 'كاز أويل', itemKind: 'fuel', baseUnit: 'L', tracksExpiry: false, counted: 38000n, countedExpired: null,
      systemQty: 40000n, systemExpiredQty: null, diff: -2000n, expiredDiff: null, nowQty: 40000n, nowExpiredQty: null, stale: false, gainExpiryOn: null,
      gainExpiredExpiryOn: null, gainBornAt: null, reason: 'تسرّب', reasonStale: false, gainSource: null, referenceLotId: null, problem: null,
      draws: [{ lotId: 'lot-1', qty: 2000n, expiryOn: null, receivedOn: '2026-10-20', value: null }], expiredDraws: [], shortageValue: null, gainValue: null,
      gainUnitCost: null, referenceValueIn: null, referenceQtyIn: null, ...over,
    });
    const reviewOf = (line) => ({ version: 6, plan: 'plan-1', status: 'submitted', submittedAt: null, snapshotAt: null, stale: false, problems: [], lines: [line], ready: true, shortageTotal: null, gainTotal: null });

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
      m.flushSync(() => root.unmount());
      body().textContent = '';
      await settle();
    };
    const countHandlers = (over = {}) => ({
      loadOrgSetup: () => org,
      listItems: () => ({ rows: [kaz], total: 1, next: null }),
      listItemUnits: () => [],
      loadCount: () => ({ doc: countDoc(), lines: [kazLine] }),
      countVersion: () => 7,
      updateCountLine: () => kazLine,
      addCountLine: () => kazLine,
      deleteCountLine: () => ({ deleted: true, version: 6 }),
      submitCount: () => ({ id: 'c-1', status: 'submitted', version: 6 }),
      ...over,
    });
    const submitLine = async () => {
      fire(byAction('save-count-line')[0].parentNode.parentNode, 'submit');
      await settle();
    };
    m.onlineStore.set(true);

    // ── C1: تعديل سطر العدّ يرسل الكميات بلا المادّة (المنح بلاها من مراجعة WP5، فإرسالها 42501) ─────────────────────────────
    {
      const calls = fresh('storekeeper', countHandlers());
      await mount('/inventory/counts/c-1');
      await click(byAction('edit-count-line')[0]);
      type(byIdSuffix('-qty')[0], '45');
      await settle();
      await submitLine();
      const sent = named(calls, 'updateCountLine');
      t.same([sent.length, sent[0]?.[0], sent[0]?.[1]?.counted_qty, Object.keys(sent[0]?.[1] ?? {}).includes('item_id')], [1, 'l-kaz', '45.000', false], 'C1: تعديل العدّ بالسطر نفسه وبلا item_id');
      await unmount();
    }

    // ── C2: عدّ ثاني لمادّة معدودة: تأكيد يسمّي المجموع، ثم تعديل سطرها بالمجموع (مو سطر ثاني يرفضه الخادم) ─────────────────────
    {
      const calls = fresh('storekeeper', countHandlers());
      await mount('/inventory/counts/c-1');
      type(byAction('search-item')[0], 'كاز');
      await settle();
      await click(byAction('pick-item')[0]);
      type(byIdSuffix('-qty')[0], '5');
      await settle();
      await submitLine();
      const asked = text().includes('أضف إلى عدّ «كاز أويل»') && text().includes('45 لتراً');
      const beforeConfirm = [named(calls, 'addCountLine').length, named(calls, 'updateCountLine').length];
      await click(byAction('confirm-merge-count')[0]);
      const sent = named(calls, 'updateCountLine');
      t.same([asked, beforeConfirm, named(calls, 'addCountLine').length, sent.map(([id, patch]) => [id, patch.counted_qty])], [true, [0, 0], 0, [['l-kaz', '45.000']]], 'C2: المادّة معدودة (40): تأكيد «يصير 45»، ثم تعديل سطرها بـ45 بلا إدراج');
      await unmount();
    }

    // ── C3: التسليم بنسخة الشاشة (سطر من نافذة ثانية بعدها stale_draft) ─────────────────────────────────────────────────
    {
      const calls = fresh('storekeeper', countHandlers());
      await mount('/inventory/counts/c-1');
      await click(byAction('submit-count')[0]);
      await click(byAction('confirm-submit-count')[0]);
      t.same([named(calls, 'submitCount').map((args) => args[2]), named(calls, 'countVersion').length], [[5], 0], 'C3: التسليم بالنسخة اللي شافها العادّ (5)، مو أحدث نسخة من الخادم');
      await unmount();
    }

    // ── C4: حذف سطر العدّ بتأكيد يسمّيه ──────────────────────────────────────────────────────────────────────────────
    {
      const calls = fresh('storekeeper', countHandlers());
      await mount('/inventory/counts/c-1');
      await click(byAction('delete-count-line')[0]);
      const before = named(calls, 'deleteCountLine').length;
      const named40 = text().includes('احذف عدّ «كاز أويل»') && text().includes('40 لتراً');
      await click(byAction('confirm-delete-count-line')[0]);
      t.same([before, named40, named(calls, 'deleteCountLine').map((args) => args[0])], [0, true, ['l-kaz']], 'C4: الحذف ينتظر تأكيداً يسمّي «كاز أويل» و40 لتراً، وبعده يحذف');
      await unmount();
    }

    const reviewHandlers = (preview, over = {}) => ({
      loadOrgSetup: () => org,
      loadCount: () => ({ doc: countDoc({ status: 'submitted', version: 6 }), lines: [kazLine] }),
      previewCount: () => preview,
      postCount: () => ({ id: 'c-1', status: 'approved', docNo: 'CT-2026-0001', shortageTotal: null, gainTotal: null }),
      setCountReason: () => kazLine,
      ...over,
    });

    // ── C5: الترحيل بموافقة كل خطّ (النقص بدفعاته) وتأكيد يسمّي الجرد ───────────────────────────────────────────────────
    {
      const calls = fresh('manager', reviewHandlers(reviewOf(reviewLine())));
      await mount('/inventory/counts/c-1');
      const lockedFirst = disabled(byAction('post-count')[0]);
      tick(byId('preview-l-kaz:S'));
      await settle();
      const openAfter = !disabled(byAction('post-count')[0]);
      await click(byAction('post-count')[0]);
      const beforeConfirm = named(calls, 'postCount').length;
      const confirmText = text().includes('وافق على جرد «المخزن العام» ورحّله');
      await click(byAction('confirm-post-count')[0]);
      t.same(
        [lockedFirst, openAfter, beforeConfirm, confirmText, named(calls, 'postCount').map((args) => [args[2], args[3]])],
        [true, true, 0, true, [[6, 'plan-1']]],
        'C5: «وافق ورحّل» مقفل لحد الموافقة على سحب النقص، والضغط يفتح تأكيداً، والترحيل بعده بالنسخة والبصمة',
      );
      await unmount();
    }

    // ── C6: سبب كُتب على فرق قديم: تنبيه، و«احفظ الأسباب» يرسله ثاني ليتأكّد ─────────────────────────────────────────────
    {
      const calls = fresh('manager', reviewHandlers(reviewOf(reviewLine({ reasonStale: true }))));
      await mount('/inventory/counts/c-1');
      const warned = text().includes('أسباب تحتاج تأكيداً');
      const save = byAction('save-count-review')[0];
      const open = !disabled(save);
      await click(save);
      t.same([warned, open, named(calls, 'setCountReason')], [true, true, [['l-kaz', 'تسرّب']]], 'C6: السبب على فرق قديم ينقال، و«احفظ الأسباب» مفتوح ويرسله بنفس النصّ');
      await unmount();
    }

    // ── C7: نتيجة «أعد الحساب» تبقى بعد قراءة الجرد الجديدة (الشاشة تنفتح من جديد) ─────────────────────────────────────────
    {
      const refreshed = {
        version: 7,
        lines: [
          {
            lineId: 'l-kaz', itemId: 'i-kaz', itemName: 'كاز أويل', baseUnit: 'L',
            before: { systemQty: 40000n, systemExpiredQty: null, diff: -2000n, expiredDiff: null },
            after: { systemQty: 39000n, systemExpiredQty: null, diff: -1000n, expiredDiff: null },
            docs: [{ docKind: 'transfer', docId: 't-9', label: 'TR-2026-0009', qty: -1000n }],
          },
        ],
      };
      fresh('manager', reviewHandlers(reviewOf(reviewLine({ stale: true })), { refreshCount: () => refreshed }));
      await mount('/inventory/counts/c-1');
      await click(byAction('refresh-count')[0]);
      await settle();
      t.ok(text().includes('TR-2026-0009') && text().includes('الفرق السابق'), 'C7: بعد «أعد الحساب» وقراءة الجرد من جديد: جدول الفرق السابق والمستند TR-2026-0009 باقٍ');
      await unmount();
    }

    // ── U1: مسوّدة الصرف بمعرّف الجهاز: الإعادة بعد فشل الشبكة بنفس المعرّف، و23505 = انكتبت فتنفتح ─────────────────────────
    {
      let attempt = 0;
      const calls = fresh('storekeeper', {
        loadOrgSetup: () => org,
        listUses: () => ({ rows: [], next: null, total: 0 }),
        createUseDraft: () => {
          attempt += 1;
          if (attempt === 1) throw new m.NetworkError();
          throw new m.RejectedError('23505', null, 'stock_uses_pkey');
        },
      });
      await mount('/inventory/uses');
      choose(byIdSuffix('-store')[0], 'w-gen');
      await settle();
      choose(all().filter((n) => n.getAttribute('data-action') === 'pick-category')[0], 'cat-1');
      await settle();
      fire(byAction('create-use')[0].parentNode, 'submit');
      await settle();
      fire(byAction('create-use')[0].parentNode, 'submit');
      await settle();
      const ids = named(calls, 'createUseDraft').map((args) => args[0]);
      t.same([ids.length, typeof ids[0], ids[0] === ids[1], globalThis.__flow.location], [2, 'string', true, `/inventory/uses/${ids[0]}`], 'U1: المحاولتان بنفس معرّف الجهاز، و23505 بالثانية = انكتبت فتنفتح المسوّدة');
      await unmount();
    }

    // ── U2: زرّ إلغاء الصرف المرحَّل لمن عنده الفعل (المدير) بس ─────────────────────────────────────────────────────────
    {
      const posted = { id: 'u-1', status: 'posted', version: 3, docNo: 'SU-2026-0001', warehouseId: 'w-gen', categoryId: 'cat-1', onDate: '2026-10-30', note: null, posted: true, voidReason: null, createdAt: '2026-10-30T08:00:00Z' };
      const useLine = { id: 'ul-1', lineNo: 1, itemId: 'i-kaz', itemName: 'كاز أويل', baseUnit: 'L', itemUnitId: null, unitCode: null, unitLabel: 'L', qtyInUnit: 10000n, qty: 10000n, lotId: null };
      const seen = {};
      for (const role of ['storekeeper', 'manager']) {
        fresh(role, { loadOrgSetup: () => org, loadUse: () => ({ doc: posted, lines: [useLine] }) });
        await mount('/inventory/uses/u-1');
        seen[role] = byAction('void-use').length;
        await unmount();
      }
      t.same(seen, { storekeeper: 0, manager: 1 }, 'U2: إلغاء الصرف للمدير بس (الأمين بلا الفعل ما يشوف الزرّ)');
    }
  } finally {
    restore();
    delete globalThis.__flow;
  }
}
