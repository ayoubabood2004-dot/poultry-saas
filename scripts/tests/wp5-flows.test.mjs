// شاشات WP5 التفاعلية (مراجعة WP5): react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل StockRoutes الحقيقية، وrepo الجرد والصرف
// والجلسة والرسائل بدائل، ومحفوظ الجهاز الحقيقي على fake-indexeddb. كل حالة كانت تفشل على الشفرة قبل الإصلاح:
// C1 تعديل سطر العدّ بلا المادّة (المنح بلاها)؛ C2 عدّ ثاني لمادّة معدودة ينجمع بتأكيد بدل سطر ثاني؛ C3 التسليم بنسخة الشاشة؛
// C4 حذف السطر بتأكيد؛ C5 الترحيل بموافقة كل خطّ وتأكيد؛ C6 السبب على فرق قديم يتأكّد؛ C7 نتيجة «أعد الحساب» تبقى بعد القراءة؛
// U1 مسوّدة الصرف بمعرّف الجهاز (الإعادة بعد شبكة 23505 = انكتبت فتنفتح)؛ U2 زرّ إلغاء الصرف لمن عنده الفعل بس. والمراجعة الثانية:
// C8 عدّ محفوظ ما وصل يوقف تعديل سطره؛ C9 المرفوض من المحفوظ ينعرض بعد القراءة؛ C10 الجمع وتغيّر العدّ من جهاز ثاني؛ C11 stale_draft
// يقرا الجرد من جديد؛ U3 سطر صرف بعد 23505 يكتب آخر قيمة؛ U4 أزرار المسوّدة لمن عنده الفعل. والمراجعة الثالثة: C12 رفّان بلا نت
// ينجمعان على المحفوظ؛ C9b المرفوض بكميته ويّا فشل الشبكة بعده؛ C14 فشل العدّ ما يبقى بعد التسليم؛ C15 وC16 stale_draft بالمراجعة
// وبالحذف يقرا الجرد؛ C17 معرّف الجرد الجديد لقيمه؛ C18 التسليم ومحفوظ من نافذة ثانية؛ U6 نصّ مرشّح «بانتظار المدير» الفارغ.
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const COUNTS = ['listCounts', 'loadCount', 'createCountDraft', 'addCountLine', 'updateCountLine', 'deleteCountLine', 'discardCount', 'countVersion', 'submitCount', 'returnCount', 'setCountReason', 'setGainUnitCost', 'previewCount', 'refreshCount', 'postCount', 'voidCount', 'loadApprovals'];
const USES = ['listUses', 'loadUse', 'createUseDraft', 'updateUseDraft', 'addUseLine', 'updateUseLine', 'deleteUseLine', 'discardUse', 'previewUse', 'postUse', 'voidUse'];
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
    "export { NetworkError, RejectedError, ZeroRowsError } from './src/lib/errors.ts';",
    "export { listDeviceDrafts, saveDeviceDraft, removeDeviceDraft } from './src/lib/drafts/index.ts';",
    "export { pendingDraftId } from './src/pages/inventory/countDevice.ts';",
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
      t.same(
        [sent.length, sent[0]?.[0], sent[0]?.[1]?.counted_qty, Object.keys(sent[0]?.[1] ?? {}).includes('item_id'), sent[0]?.[2]?.map((b) => b.counted_qty)],
        [1, 'l-kaz', '45.000', false, ['40.000']],
        'C1: تعديل العدّ بالسطر نفسه وبلا item_id، ومشروط بقيمة البطاقة (40)',
      );
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
      t.same(
        [asked, beforeConfirm, named(calls, 'addCountLine').length, sent.map(([id, patch, bases]) => [id, patch, bases?.[0]?.counted_qty])],
        [true, [0, 0], 0, [['l-kaz', { counted_qty: '45.000', counted_expired_qty: null }, '40.000']]],
        'C2: المادّة معدودة (40): تأكيد «يصير 45»، ثم تعديل سطرها بـ45 (الكميات بس) بشرط إنها بعدها 40 (بلا إدراج)',
      );
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
      t.same([warned, open, named(calls, 'setCountReason')], [true, true, [['l-kaz', 'تسرّب', { diff: -2000n, expiredDiff: null }]]], 'C6: السبب على فرق قديم ينقال، و«احفظ الأسباب» مفتوح ويرسله بنفس النصّ وبالفرق اللي بالشاشة');
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
            docs: [{ docKind: 'transfer', docId: 't-9', label: 'TR-2026-0009', qty: -1000n, voided: false }],
          },
        ],
      };
      fresh('manager', reviewHandlers(reviewOf(reviewLine({ stale: true })), { refreshCount: () => refreshed }));
      await mount('/inventory/counts/c-1');
      await click(byAction('refresh-count')[0]);
      await settle();
      t.ok(text().includes('TR-2026-0009 (صادر') && text().includes('الفرق السابق'), 'C7: بعد «أعد الحساب» وقراءة الجرد من جديد: جدول الفرق السابق والمستند TR-2026-0009 باتّجاهه (صادر) باقٍ');
      await unmount();
    }

    const stampOf = (role) => ({ userId: `u-${role}`, orgId: 'org-1' });
    const keep = (role, lines) => m.saveDeviceDraft(stampOf(role), { id: m.pendingDraftId(`u-${role}`, 'c-1'), kind: 'count', title: 'جرد', payload: { docId: 'c-1', lines } });
    const unkeep = (role) => m.removeDeviceDraft(m.pendingDraftId(`u-${role}`, 'c-1'));
    const keptKaz = { id: 'l-kaz', existing: true, itemName: 'كاز أويل', baseUnit: 'L', fields: { item_id: 'i-kaz', counted_qty: '50.000', counted_expired_qty: null, gain_expiry_on: null, gain_expired_expiry_on: null, gain_born_at: null }, bases: [{ counted_qty: '40.000', counted_expired_qty: null }] };

    // ── C8: سطر بعدّ محفوظ ما وصل (أحدث من البطاقة): التعديل يقف بسببه، بلا إرسال ولا مسح المحفوظ ─────────────────────────────
    {
      await keep('storekeeper', [keptKaz]);
      const calls = fresh('storekeeper', countHandlers());
      await mount('/inventory/counts/c-1');
      await click(byAction('edit-count-line')[0]);
      type(byIdSuffix('-qty')[0], '41');
      await settle();
      await submitLine();
      t.same([named(calls, 'updateCountLine').length, text().includes('أرسل المحفوظ أوّلاً'), text().includes('«كاز أويل»: 50 لتراً')], [0, true, true], 'C8: للسطر عدّ محفوظ (50) ما وصل: تعديله يقف «أرسل المحفوظ أوّلاً» والمحفوظ باقٍ');
      await unmount();
      await unkeep('storekeeper');
    }

    // ── C9: «أرسل المحفوظ» ومرفوض: سببه ينعرض ويبقى بعد قراءة الجرد ─────────────────────────────────────────────────
    {
      const gasLine = { id: 'k-gas', existing: false, itemName: 'غاز', baseUnit: 'pc', fields: { item_id: 'i-gas', counted_qty: '3.000', counted_expired_qty: null, gain_expiry_on: null, gain_expired_expiry_on: null, gain_born_at: null }, bases: [] };
      await keep('storekeeper', [gasLine]);
      const calls = fresh('storekeeper', countHandlers({ addCountLine: () => { throw new m.RejectedError('item_already_counted', '«غاز» معدودة في سطر آخر من هذا الجرد.'); } }));
      await mount('/inventory/counts/c-1');
      await click(byAction('send-kept-counts')[0]);
      await settle();
      t.same([named(calls, 'loadCount').length >= 2, text().includes('لم يُقبل عدّ «غاز»')], [true, true], 'C9: المرفوض من المحفوظ ينعرض بسببه بعد قراءة الجرد من جديد');
      await unmount();
      await unkeep('storekeeper');
    }

    // ── C10: الجمع والسطر تغيّر من جهاز ثاني (صفر صفوف): قراءة جديدة وتنبيه، بلا كتابة فوق العدّ الجديد ───────────────────────
    {
      const calls = fresh('storekeeper', countHandlers({ updateCountLine: (id, patch, expected) => { if (expected) throw new m.ZeroRowsError(); return kazLine; } }));
      await mount('/inventory/counts/c-1');
      type(byAction('search-item')[0], 'كاز');
      await settle();
      await click(byAction('pick-item')[0]);
      type(byIdSuffix('-qty')[0], '5');
      await settle();
      await submitLine();
      const loadsBefore = named(calls, 'loadCount').length;
      await click(byAction('confirm-merge-count')[0]);
      t.same(
        [named(calls, 'updateCountLine').length, named(calls, 'loadCount').length > loadsBefore, globalThis.__flow.toasts.some((x) => x.title.includes('تغيّر عدّ «كاز أويل»') && x.detail.includes('5 لترات'))],
        [1, true, true],
        'C10: الجمع والعدّ تغيّر بجهاز ثاني: تعديل واحد مشروط رفضه الخادم، فقراءة جديدة وتنبيه «تغيّر عدّ»',
      );
      await unmount();
    }

    // ── C11: التسليم ونافذة ثانية غيّرت الجرد (stale_draft): قراءة جديدة وتنبيه، مو زرّ يعيد نفس النسخة ─────────────────────
    {
      const calls = fresh('storekeeper', countHandlers({ submitCount: () => { throw new m.RejectedError('stale_draft', 'تغيّر الجرد بعد فتحه.'); } }));
      await mount('/inventory/counts/c-1');
      const loadsBefore = named(calls, 'loadCount').length;
      await click(byAction('submit-count')[0]);
      await click(byAction('confirm-submit-count')[0]);
      t.same([named(calls, 'loadCount').length > loadsBefore, globalThis.__flow.toasts.some((x) => x.title.includes('تغيّر الجرد'))], [true, true], 'C11: التسليم stale_draft: الجرد ينقرا من جديد وتنبيه «تغيّر الجرد»');
      await unmount();
    }

    const keptLines = async (role) => (await m.listDeviceDrafts(stampOf(role), 'count')).find((draft) => draft.id === m.pendingDraftId(`u-${role}`, 'c-1'))?.payload.lines ?? [];
    const oilLine = { id: 'k-oil', existing: false, itemName: 'زيت', baseUnit: 'L', fields: { item_id: 'i-oil', counted_qty: '2.000', counted_expired_qty: null, gain_expiry_on: null, gain_expired_expiry_on: null, gain_born_at: null }, bases: [] };

    // ── C12: رفّان لمادّة بلا نت وبلا سطر: الأوّل يبقى بالجهاز، والثاني يسأل الجمع على المحفوظ وينجمع بسطره (كان «أرسل المحفوظ أوّلاً») ──
    {
      const calls = fresh('storekeeper', countHandlers({ loadCount: () => ({ doc: countDoc(), lines: [] }), addCountLine: () => { throw new m.NetworkError(); } }));
      await mount('/inventory/counts/c-1');
      const countShelf = async (qty) => {
        type(byAction('search-item')[0], 'كاز');
        await settle();
        await click(byAction('pick-item')[0]);
        type(byIdSuffix('-qty')[0], qty);
        await settle();
        await submitLine();
      };
      await countShelf('5');
      await countShelf('3');
      const asked = text().includes('فيصير 8 لترات');
      await click(byAction('confirm-merge-count')[0]);
      const adds = named(calls, 'addCountLine');
      t.same(
        [asked, adds.map((args) => args[2].counted_qty), adds[0]?.[1] === adds[1]?.[1], (await keptLines('storekeeper')).map((l) => [l.id === adds[0]?.[1], l.fields.counted_qty])],
        [true, ['5.000', '8.000'], true, [[true, '8.000']]],
        'C12: بلا نت 5 ثم 3 لنفس المادّة: تأكيد «يصير 8» على المحفوظ، والسطر نفسه (نفس المعرّف) بالجهاز بـ8',
      );
      await unmount();
      await unkeep('storekeeper');
    }

    // ── C9b: «أرسل المحفوظ»: الأوّل مرفوض والثاني بلا شبكة: المرفوض بكميته وفشل الشبكة كلاهما بعد قراءة الجرد ──────────────────
    {
      const gasLine = { id: 'k-gas', existing: false, itemName: 'غاز', baseUnit: 'pc', fields: { item_id: 'i-gas', counted_qty: '3.000', counted_expired_qty: null, gain_expiry_on: null, gain_expired_expiry_on: null, gain_born_at: null }, bases: [] };
      await keep('storekeeper', [gasLine, oilLine]);
      const calls = fresh('storekeeper', countHandlers({ addCountLine: (doc, id) => { if (id === 'k-gas') throw new m.RejectedError('item_already_counted', '«غاز» معدودة في سطر آخر من هذا الجرد.'); throw new m.NetworkError(); } }));
      await mount('/inventory/counts/c-1');
      await click(byAction('send-kept-counts')[0]);
      await settle();
      t.same(
        [named(calls, 'loadCount').length >= 2, text().includes('لم يُقبل عدّ «غاز»: 3 قطع'), text().includes('تعذّر الوصول إلى الخادم'), (await keptLines('storekeeper')).map((l) => l.id)],
        [true, true, true, ['k-oil']],
        'C9b: الأوّل مرفوض (بكميته 3 قطع) والثاني بلا شبكة: الاثنان ينعرضان بعد القراءة، والثاني باقٍ بالجهاز',
      );
      await unmount();
      await unkeep('storekeeper');
    }

    // ── C14: فشل «أرسل المحفوظ» والجرد انسلّم بالقراءة الجديدة: ما يبقى «أعد المحاولة» فوق جرد مسلَّم ────────────────────────────
    {
      await keep('storekeeper', [oilLine]);
      let loads = 0;
      fresh('storekeeper', countHandlers({ loadCount: () => ((loads += 1), { doc: countDoc(loads > 1 ? { status: 'submitted', version: 6 } : {}), lines: [kazLine] }), addCountLine: () => { throw new m.NetworkError(); } }));
      await mount('/inventory/counts/c-1');
      await click(byAction('send-kept-counts')[0]);
      await settle();
      t.same([loads >= 2, text().includes('مسلَّم للمراجعة'), text().includes('تعذّر الوصول إلى الخادم')], [true, true, false], 'C14: الجرد مسلَّم بعد القراءة: فشل الإرسال ما يبقى فوقه');
      await unmount();
      await unkeep('storekeeper');
    }

    // ── C15: المراجعة وstale_draft (الفرق تغيّر من نافذة ثانية): قراءة جديدة وتنبيه ──────────────────────────────────────────
    {
      const calls = fresh('manager', reviewHandlers(reviewOf(reviewLine({ reasonStale: true })), { setCountReason: () => { throw new m.RejectedError('stale_draft', 'تغيّر الفرق بعد فتح المراجعة.'); } }));
      await mount('/inventory/counts/c-1');
      const loadsBefore = named(calls, 'loadCount').length;
      await click(byAction('save-count-review')[0]);
      await settle();
      t.same([named(calls, 'loadCount').length > loadsBefore, globalThis.__flow.toasts.some((x) => x.title.includes('تغيّر الجرد'))], [true, true], 'C15: سبب المراجعة stale_draft: الجرد ينقرا من جديد وتنبيه «تغيّر الجرد»');
      await unmount();
    }

    // ── C16: حذف سطر وstale_draft: قراءة جديدة وتنبيه ─────────────────────────────────────────────────────────────────────
    {
      const calls = fresh('storekeeper', countHandlers({ deleteCountLine: () => { throw new m.RejectedError('stale_draft', 'تغيّر الجرد بعد فتحه.'); } }));
      await mount('/inventory/counts/c-1');
      const loadsBefore = named(calls, 'loadCount').length;
      await click(byAction('delete-count-line')[0]);
      await click(byAction('confirm-delete-count-line')[0]);
      t.same([named(calls, 'loadCount').length > loadsBefore, globalThis.__flow.toasts.some((x) => x.title.includes('تغيّر الجرد'))], [true, true], 'C16: حذف السطر stale_draft: الجرد ينقرا من جديد وتنبيه «تغيّر الجرد»');
      await unmount();
    }

    // ── C17: جرد جديد: معرّفه لقيمه (مخزن ثاني معرّف ثاني، والرجوع للأوّل معرّفه) ────────────────────────────────────────────
    {
      const twoStores = { ...org, warehouses: [...org.warehouses, { ...org.warehouses[0], id: 'w-gen2', name: 'المخزن الثاني' }] };
      const calls = fresh('manager', { loadOrgSetup: () => twoStores, listCounts: () => ({ rows: [], next: null, total: 0 }), createCountDraft: () => { throw new m.NetworkError(); } });
      await mount('/inventory/counts');
      for (const store of ['w-gen', 'w-gen2', 'w-gen']) {
        choose(byIdSuffix('-store')[0], store);
        await settle();
        fire(byAction('create-count')[0].parentNode, 'submit');
        await settle();
      }
      const ids = named(calls, 'createCountDraft').map((args) => args[0]);
      t.same([ids.length, ids[0] !== ids[1], ids[0] === ids[2]], [3, true, true], 'C17: جرد جديد بعد شبكة: مخزن ثاني بمعرّف ثاني، والرجوع للأوّل بمعرّفه');
      await unmount();
    }

    // ── C18: التسليم ونافذة ثانية حفظت عدّاً بالجهاز بعد العرض: يقف (الجرد المسلَّم ما يستقبله) ويقول ليش ─────────────────────
    {
      const calls = fresh('storekeeper', countHandlers());
      await mount('/inventory/counts/c-1');
      await keep('storekeeper', [oilLine]);
      await click(byAction('submit-count')[0]);
      await click(byAction('confirm-submit-count')[0]);
      t.same(
        [named(calls, 'submitCount').length, text().includes('بالجهاز عدّ محفوظ لم يُرسل'), text().includes('لم يُرسل شيء'), text().includes('محفوظ بالجهاز ولم يُرسل')],
        [0, true, true, true],
        'C18: محفوظ من نافذة ثانية بعد العرض: التسليم يقف بلا إرسال ويسمّي المحفوظ، والمحفوظ ينقرا ويظهر بقسمه',
      );
      await unmount();
      await unkeep('storekeeper');
    }

    // ── C19 (المراجعة الرابعة): تنبيهات المرفوض تنجمع (إرسال ثاني ما يمسح الأوّل) وتنشال بزرّها، ونصيحتها الجمع مو «عدّل سطرها» ──
    {
      const gasLine = { id: 'k-gas', existing: false, itemName: 'غاز', baseUnit: 'pc', fields: { item_id: 'i-gas', counted_qty: '3.000', counted_expired_qty: null, gain_expiry_on: null, gain_expired_expiry_on: null, gain_born_at: null }, bases: [] };
      await keep('storekeeper', [gasLine, oilLine]);
      let oilTries = 0;
      fresh('storekeeper', countHandlers({
        addCountLine: (doc, id) => {
          if (id === 'k-oil' && (oilTries += 1) === 1) throw new m.NetworkError();
          throw new m.RejectedError('item_already_counted', `${id} معدودة`);
        },
      }));
      await mount('/inventory/counts/c-1');
      await click(byAction('send-kept-counts')[0]);
      await settle();
      const first = [text().includes('لم يُقبل عدّ «غاز»: 3 قطع'), text().includes('«زيت»: لتران')];
      await click(byAction('send-kept-counts')[0]);
      await settle();
      const shown = [text().includes('لم يُقبل عدّ «غاز»: 3 قطع'), text().includes('لم يُقبل عدّ «زيت»: لتران'), byAction('dismiss-rejected-count').length, text().includes('فيُجمع إلى سطرها')];
      await click(byAction('dismiss-rejected-count')[0]);
      t.same(
        [first, shown, text().includes('لم يُقبل عدّ «غاز»'), text().includes('لم يُقبل عدّ «زيت»')],
        [[true, true], [true, true, 2, true], false, true],
        'C19: مرفوض بإرسال ثم مرفوض بإرسال ثاني: الاثنان معروضان بنصيحة الجمع (الثاني ما مسح الأوّل)، وإخفاء الأوّل يبقي الثاني',
      );
      await unmount();
      await unkeep('storekeeper');
    }

    // ── C20: محفوظ جديد ما وصل وجهاز آخر عدّ المادّة بسطر: الإضافة تقف (الجمع على المحفوظ ينرفض حتماً) بلا كتابة ────────────────
    {
      await keep('storekeeper', [{ id: 'k-kaz2', existing: false, itemName: 'كاز أويل', baseUnit: 'L', fields: { item_id: 'i-kaz', counted_qty: '5.000', counted_expired_qty: null, gain_expiry_on: null, gain_expired_expiry_on: null, gain_born_at: null }, bases: [] }]);
      const calls = fresh('storekeeper', countHandlers());
      await mount('/inventory/counts/c-1');
      type(byAction('search-item')[0], 'كاز');
      await settle();
      await click(byAction('pick-item')[0]);
      type(byIdSuffix('-qty')[0], '3');
      await settle();
      await submitLine();
      t.same(
        [text().includes('وعدّها جهاز آخر بسطر'), byAction('confirm-merge-count').length, named(calls, 'addCountLine').length + named(calls, 'updateCountLine').length],
        [true, 0, 0],
        'C20: محفوظ جديد للمادّة وسطرها من جهاز آخر: الإضافة تقف «أرسل المحفوظ أوّلاً» بلا تأكيد ولا كتابة',
      );
      await unmount();
      await unkeep('storekeeper');
    }

    // ── C21: حذف سطر وإله عدّ محفوظ ما وصل: يقف بلا حذف (الإرسال بعده كان يرجّعه) ──────────────────────────────────────────
    {
      await keep('storekeeper', [keptKaz]);
      const calls = fresh('storekeeper', countHandlers());
      await mount('/inventory/counts/c-1');
      await click(byAction('delete-count-line')[0]);
      await click(byAction('confirm-delete-count-line')[0]);
      t.same([named(calls, 'deleteCountLine').length, text().includes('أرسل المحفوظ أوّلاً')], [0, true], 'C21: حذف سطر وإله عدّ محفوظ: يقف «أرسل المحفوظ أوّلاً» بلا حذف');
      await unmount();
      await unkeep('storekeeper');
    }

    // ── C22: جرد جديد رفضه الخادم رفضاً أكيداً: المحاولة الجاية بنفس القيم بمعرّف جديد (forget) ───────────────────────────────
    {
      let attempt = 0;
      const calls = fresh('manager', {
        loadOrgSetup: () => org,
        listCounts: () => ({ rows: [], next: null, total: 0 }),
        createCountDraft: () => {
          attempt += 1;
          throw attempt === 1 ? new m.RejectedError('period_locked', 'الفترة مقفلة.') : new m.NetworkError();
        },
      });
      await mount('/inventory/counts');
      choose(byIdSuffix('-store')[0], 'w-gen');
      await settle();
      fire(byAction('create-count')[0].parentNode, 'submit');
      await settle();
      fire(byAction('create-count')[0].parentNode, 'submit');
      await settle();
      const ids = named(calls, 'createCountDraft').map((args) => args[0]);
      t.same([ids.length, ids[0] !== ids[1]], [2, true], 'C22: رفض أكيد ثم المحاولة بنفس القيم: معرّف جديد (المرفوض ما ينعاد)');
      await unmount();
    }

    // ── C23: جمع على عدّ محفوظ انرفض (المادّة صارت معدودة بسطر): ينعرض بالمجموع ونصيحته ─────────────────────────────────────
    {
      await keep('storekeeper', [{ id: 'k-kaz3', existing: false, itemName: 'كاز أويل', baseUnit: 'L', fields: { item_id: 'i-kaz', counted_qty: '5.000', counted_expired_qty: null, gain_expiry_on: null, gain_expired_expiry_on: null, gain_born_at: null }, bases: [] }]);
      fresh('storekeeper', countHandlers({ loadCount: () => ({ doc: countDoc(), lines: [] }), addCountLine: () => { throw new m.RejectedError('item_already_counted', 'معدودة'); } }));
      await mount('/inventory/counts/c-1');
      type(byAction('search-item')[0], 'كاز');
      await settle();
      await click(byAction('pick-item')[0]);
      type(byIdSuffix('-qty')[0], '3');
      await settle();
      await submitLine();
      await click(byAction('confirm-merge-count')[0]);
      await settle();
      t.same(
        [text().includes('لم يُقبل عدّ «كاز أويل»: 8 لترات'), text().includes('فيُجمع إلى سطرها'), (await keptLines('storekeeper')).length],
        [true, true, 0],
        'C23: جمع على المحفوظ انرفض: ينعرض بالمجموع (8 لترات) ونصيحة الجمع، والمحفوظ فرغ',
      );
      await unmount();
      await unkeep('storekeeper');
    }

    // ── U6: مرشّح «بانتظار موافقة المدير» بلا مسوّدات: نصّه، مو «لا صرف بعد» ───────────────────────────────────────────────
    {
      const postedUse = { id: 'u-9', status: 'posted', version: 3, docNo: 'SU-2026-0009', warehouseId: 'w-gen', categoryId: 'cat-1', onDate: '2026-10-30', note: null, posted: true, voidReason: null, createdAt: '2026-10-30T08:00:00Z', namesLot: false };
      fresh('storekeeper', { loadOrgSetup: () => org, listUses: () => ({ rows: [postedUse], next: null, total: 1 }) });
      await mount('/inventory/uses?awaiting=1');
      t.same([text().includes('لا مسوّدات بانتظار موافقة المدير فيما عُرض.'), text().includes('لا صرف بعد')], [true, false], 'U6: المرشّح بلا مسوّدات بانتظار المدير: نصّه الخاصّ');
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

    // ── U5: نموذج مسوّدة الصرف تغيّر بين المحاولتين (شبكة ثم تصنيف ثاني): معرّف جديد، فمسوّدة بقيمها الجديدة مو فتح القديمة ──────
    {
      const twoCategories = { ...org, expenseCategories: [...org.expenseCategories, { id: 'cat-2', version: 1, archived: false, name: 'نظافة', systemCode: null }] };
      const calls = fresh('storekeeper', { loadOrgSetup: () => twoCategories, listUses: () => ({ rows: [], next: null, total: 0 }), createUseDraft: () => { throw new m.NetworkError(); } });
      await mount('/inventory/uses');
      choose(byIdSuffix('-store')[0], 'w-gen');
      await settle();
      choose(byAction('pick-category')[0], 'cat-1');
      await settle();
      fire(byAction('create-use')[0].parentNode, 'submit');
      await settle();
      choose(byAction('pick-category')[0], 'cat-2');
      await settle();
      fire(byAction('create-use')[0].parentNode, 'submit');
      await settle();
      choose(byAction('pick-category')[0], 'cat-1');
      await settle();
      fire(byAction('create-use')[0].parentNode, 'submit');
      await settle();
      const ids = named(calls, 'createUseDraft').map((args) => args[0]);
      t.same([ids.length, ids[0] !== ids[1], ids[0] === ids[2]], [3, true, true], 'U5: التصنيف تغيّر بين المحاولتين: معرّف جديد؛ والرجوع للتصنيف الأوّل يرجّع معرّفه (مسوّدة ضاع جوابها ما تتكرّر)');
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

    const draftUse = { id: 'u-2', status: 'draft', version: 1, docNo: null, warehouseId: 'w-gen', categoryId: 'cat-1', onDate: '2026-10-30', note: null, posted: false, voidReason: null, createdAt: '2026-10-30T08:00:00Z' };
    // ── U3: سطر صرف ضاع جوابه ثم صحّحه المستخدم: نفس معرّف الجهاز، و23505 يكتب آخر قيمة فوقه ───────────────────────────────
    {
      let attempt = 0;
      const calls = fresh('storekeeper', {
        loadOrgSetup: () => org,
        loadUse: () => ({ doc: draftUse, lines: [] }),
        listItems: () => ({ rows: [kaz], total: 1, next: null }),
        listItemUnits: () => [],
        loadItemLots: () => ({ rows: [], next: null }),
        addUseLine: () => {
          attempt += 1;
          if (attempt === 1) throw new m.NetworkError();
          throw new m.RejectedError('23505', null, 'stock_use_lines_pkey');
        },
        updateUseLine: () => ({}),
      });
      await mount('/inventory/uses/u-2');
      type(byAction('search-item')[0], 'كاز');
      await settle();
      await click(byAction('pick-item')[0]);
      type(byIdSuffix('-qty')[0], '10');
      await settle();
      fire(byAction('add-use-line')[0].parentNode, 'submit');
      await settle();
      type(byIdSuffix('-qty')[0], '12');
      await settle();
      fire(byAction('add-use-line')[0].parentNode, 'submit');
      await settle();
      const adds = named(calls, 'addUseLine');
      const updates = named(calls, 'updateUseLine');
      t.same(
        [adds.length, adds[0]?.[1] === adds[1]?.[1], updates.map(([id, fields]) => [id === adds[0]?.[1], fields.qty_in_unit])],
        [2, true, [[true, '12.000']]],
        'U3: الإعادة بنفس معرّف السطر، و23505 = انكتب فتنكتب آخر قيمة (12) فوقه بدل ما تبقى 10 بصمت',
      );
      await unmount();
    }

    // ── U4: أزرار مسوّدة الصرف لمن عنده stock_use.post بس ─────────────────────────────────────────────────────────
    {
      const seen = {};
      for (const role of ['viewer', 'storekeeper']) {
        fresh(role, { loadOrgSetup: () => org, loadUse: () => ({ doc: draftUse, lines: [] }), listItems: () => ({ rows: [], total: 0, next: null }) });
        await mount('/inventory/uses/u-2');
        seen[role] = [byAction('add-use-line').length, byAction('preview-use').length, byAction('discard-use').length];
        await unmount();
      }
      t.same(seen, { viewer: [0, 0, 0], storekeeper: [1, 1, 1] }, 'U4: المشاهد يشوف مسوّدة الصرف بلا أزرارها، والأمين بيها');
    }

    // ── C21 (مراجعة WP8): «أعِد للعدّ» ممتنع وسبب أو كلفة مكتوبة ما انحفظت (كانت تضيع والتأكيد يقول تبقى) ───────────────────────
    {
      fresh('manager', reviewHandlers(reviewOf(reviewLine())));
      await mount('/inventory/counts/c-1');
      const before = disabled(byAction('return-count')[0]);
      type(byAction('count-reason')[0], 'تسرّب من الخزّان');
      await settle();
      t.same([before, disabled(byAction('return-count')[0])], [false, true], 'C21: سبب مكتوب ما انحفظ يقفل «أعِد للعدّ» مثل «أعد الحساب» و«رحّل»');
      await unmount();
    }
  } finally {
    restore();
    delete globalThis.__flow;
  }
}
