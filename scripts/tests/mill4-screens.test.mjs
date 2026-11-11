// «الخلطة موادّ بلا كميات» و«رصيد العلف» (0025، كلمة المالك 2026-11-10؛ عقد scratchpad/mill4/contract-0025.md §4 و§5): react-dom/client الحقيقي على
// DOM صغير (dom.mjs) يشغّل MillRoutes وصفحة المخزن الحقيقيتين، وrepo المعمل والمخزون الحقيقيان (المحلّلات وبناء النداءات) على core بديل يسجّل كلّ نداء
// ويجيب بأجوبة العقد (fixtures/mill4-contract.json، مكتوبة باليد بأشكال §3 قبل الهجرة؛ وإن وُجدت fixtures/mill4-0025.json من القاعدة الحقيقية تمرّ كلّ
// عيّنة منها بالمحلّلات أيضاً). ومنتقي المخزون وبطاقات المخازن والجلسة والتنبيه بدائل. كلّ حالة تفشل على الشفرة قبل 0025:
// P المحلّلات الجديدة وصرامتها (production_form وproduce_batch وrecipe_history، ومفاتيح materials_only وpieces_source وsaved_to_recipe)؛ Q طلبات repo
// (produce_batch حرفاً، وproduction_form ومعه «يُتابَع انتهاؤه»، وrecipe_history، وسطر خلطة بلا كمية، ومحو كمية سطر قديم)؛ R شاشة الإنتاج: التعبئة من
// آخر إنتاج أو من الخلطة بعلامتها، والناتج الحيّ وشريطه ونقاطه، و«أزل» و«أضف مادّة» (موادّ آخر إنتاج أوّلاً)، و«قرّب إلى طنّ» بصفّ أو بمادّة جديدة،
// والاختيار الإلزاميّ حين تخالف الموادّ الخلطة (أو «لهذه المرّة فقط» لمن لا يعدّلها، وdraft_exists)، وطلب produce_batch حرفاً، و«احفظ مسوّدة»، والنتيجة
// المجهولة (التجميد بالطلب نفسه وبعد الرجوع، والنافذة «فيها ما لم يُحفظ»)، والرفض بتلميحه، وrecipe_changed يقرأ الشاشة، والطلب المعلَّق من شاشة 0023،
// و«رصيد العلف» الغائب؛ H «السجلّ» في صفحة الخلطة؛ W «رصيد العلف» قائمة واحدة بترتيب العلائق؛ C لوحة ألوان الموادّ.
import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const F = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'mill4-contract.json'), 'utf8'));
const REAL_PATH = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'mill4-0025.json');
const REAL = existsSync(REAL_PATH) ? JSON.parse(readFileSync(REAL_PATH, 'utf8')) : null;
const clone = (value) => JSON.parse(JSON.stringify(value));
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const INVENTORY = ['loadItem', 'loadStockOnHand', 'loadStoresOverview', 'loadOrgSetup', 'listItems', 'createItem', 'findItemTwins', 'updateItem'];
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__m4.call('${n}', a);`).join(' ')}`;
const STUBS = {
  inventory: routed('inventory', INVENTORY),
  purchases: routed('purchases', ['loadItemsOverview']),
  session: 'export const useSession = () => globalThis.__m4.session; export const sessionStore = { get: () => globalThis.__m4?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__m4.toasts.push(spec); }; export function Toaster() { return null; }',
};
const stubs = {
  name: 'mill4-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/(inventory|purchases)$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'mill4-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'mill4-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
  },
};
// core بديل لملفّات repo: call يسجّله __m4.rpc (المحلّل الحقيقي يقرأ الجواب)، وsend يبني سلسلة PostgREST مسجَّلة يجيبها __m4.tables باسم الجدول.
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__m4.rpc(fn, args);
export const send = async (make) => ({ result: await make(globalThis.__m4.db()), wasOnline: true });
export const classifyPostgrest = (error) => new RejectedError(error.code ?? 'x', error.hint ?? null);
export const explained = async (error) => error;
export const updatedRows = (answer) => {
  if (answer.error) throw answer.error;
  const rows = answer.data === null ? [] : Array.isArray(answer.data) ? answer.data : [answer.data];
  if (!rows.length) throw new ZeroRowsError();
  return rows;
};
export const authed = async () => ({ db: null });
export const unknownConstraint = () => '';`;
const coreStub = {
  name: 'mill4-core',
  setup(b) {
    b.onResolve({ filter: /^\.\/core$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('src/lib/repo/') ? { path: 'core', namespace: 'mill4-core' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'mill4-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
  },
};

async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    "export { default as MillRoutes } from './src/pages/mill/MillRoutes.tsx';",
    "export { default as WarehousePage, feedSections } from './src/pages/inventory/WarehousePage.tsx';",
    "export * as repo from './src/lib/repo/mill.ts';",
    "export * as inventoryRepo from './src/lib/repo/inventory.ts';",
    "export { pendingKey, storePending, readPending, produceRows, materialsDiffer } from './src/pages/mill/ProducePage.tsx';",
    "export { historyEvents } from './src/pages/mill/RecipeHistory.tsx';",
    "export { PALETTE, OTHER_COLOR, pieceColor, slotsOf } from './src/pages/mill/shared.tsx';",
    "export { isWindowDirty } from './src/lib/pwa/dirty.ts';",
    "export { localDay, addDays } from './src/domain/dates.ts';",
    "export { RejectedError, UnknownOutcomeError, NetworkError } from './src/lib/errors.ts';",
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
    plugins: [stubs, coreStub],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name) => all().filter((n) => n.getAttribute('data-action') === name);
const withId = (action, id) => byAction(action).find((n) => n.getAttribute('data-id') === id);
const textOf = (action) => byAction(action)[0]?.textContent ?? null;
const text = () => body().textContent;
const disabled = (node) => (node ? node.hasAttribute('disabled') : null);
const type = (input, value) => {
  if (!input) throw new Error('no input');
  input.value = value;
  fire(input, 'input');
};
const click = async (node) => {
  if (!node) throw new Error('no node');
  fire(node, 'click');
  await settle();
};
const qtyInput = (name) => all().find((n) => n.getAttribute('aria-label') === `كمية «${name}»`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
/** صفوف جدول بعنوانه (caption): نصّ كلّ خلية. */
const tableRows = (caption) => {
  const table = all().find((n) => n.localName === 'table' && descendants(n).some((c) => c.localName === 'caption' && c.textContent.startsWith(caption)));
  const tbody = table ? descendants(table).find((n) => n.localName === 'tbody') : null;
  return tbody ? tbody.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent)) : null;
};
const tableHeaders = (caption) => {
  const table = all().find((n) => n.localName === 'table' && descendants(n).some((c) => c.localName === 'caption' && c.textContent.startsWith(caption)));
  return table ? descendants(table).filter((n) => n.localName === 'th' && n.getAttribute('scope') === 'col').map((n) => n.textContent) : null;
};
/** وعد يُحلّ من خارجه: طلب ينتظر حتّى يُفحص ما تعرضه الشاشة أثناءه. */
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const fmtDayText = (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

const ws = (role, over = {}) => ({
  userId: `u-${role}`, orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [],
  divisions: ['feed_mill'], canSeeCost: ['owner', 'manager', 'accountant'].includes(role), canSeeAccounts: ['owner', 'manager', 'accountant'].includes(role), canSeeSales: true,
  invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const MANAGER = { status: 'ready', workspace: ws('manager') };
const OPERATOR = { status: 'ready', workspace: ws('mill_operator') };

// ── مخزن المواد الأوّلية كما يقرؤه loadStockOnHand (بعد محلّله) ─────────────────────────────────────────────────────────────
const stockRow = (itemId, name, kind, baseUnit, available, archived = false) => ({
  itemId, name, kind, baseUnit, archived, available, tracksExpiry: false, minQty: null, expired: 0n, nearExpiry: 0n, belowMin: false, categoryId: null, categoryName: null, barcode: null,
  chickAgeHours: null, oldChicks: 0n, money: null,
});
const RAW_STOCK = [
  stockRow('i-corn', 'ذرة صفراء', 'raw', 'kg', 20_000_000n),
  stockRow('i-soy', 'كسبة صويا', 'raw', 'kg', 300_000n),
  stockRow('i-oil', 'زيت', 'raw', 'L', 500_000n),
  stockRow('i-salt', 'ملح', 'additive', 'kg', 50_000n),
  stockRow('i-diesel', 'كاز المولّدة', 'fuel', 'L', 100_000n),
  stockRow('i-premix', 'برمكس', 'additive', 'kg', 40_000n),
  stockRow('i-lime', 'حجر الكلس', 'raw', 'kg', 200_000n),
  stockRow('i-bag', 'كيس', 'packaging', 'pc', 900_000n),
  stockRow('i-gone', 'برمكس قديم', 'additive', 'kg', 0n, true),
];
const rawBoard = (rows = RAW_STOCK) => ({
  warehouse: { id: 'w-raw', name: 'مخزن المواد الأوّلية', kind: 'raw', divisionId: 'd-mill', divisionKind: 'feed_mill', archived: false, hasBalance: true },
  asOf: '2026-11-10T08:00:00Z', rows, next: null, total: rows.length, money: null,
});
const itemRow = (id, name, kind, baseUnit, density = null) => ({ id, version: 1, archived: false, name, nameNorm: name, categoryId: null, kind, baseUnit, density, pieceMassKg: null, tracksExpiry: false, scaleStep: 100n, minQty: null, barcode: null, altCodes: [] });
const ITEMS = {
  'i-premix': itemRow('i-premix', 'برمكس', 'additive', 'kg'),
  'i-lime': itemRow('i-lime', 'حجر الكلس', 'raw', 'kg'),
  'i-diesel': itemRow('i-diesel', 'كاز المولّدة', 'fuel', 'L', 8_500n),
};

export default async function (t) {
  const restore = installDom();
  let root = null;
  try {
    const m = await bundle();
    const fresh = (session, { rpcs = {}, calls = {}, tables = {} } = {}) => {
      // الطلب المعلَّق خارج المكوّن: كلّ خطوة تبدأ بلا طلب من خطوة قبلها لهذه الخلطة.
      if (session?.workspace) m.storePending(m.pendingKey(`${session.workspace.userId}:${session.workspace.orgId}`, 'r-1'), null);
      const rpcLog = [];
      const callLog = [];
      const reads = [];
      globalThis.__m4 = {
        session,
        toasts: [],
        location: null,
        db() {
          return {
            from(table) {
              const query = { table, ops: [] };
              const chain = {};
              for (const op of ['select', 'eq', 'is', 'in', 'order', 'limit', 'insert', 'update', 'filter']) {
                chain[op] = (...args) => {
                  query.ops.push([op, ...args]);
                  return chain;
                };
              }
              chain.then = (resolve, reject) => {
                reads.push(query);
                const handler = tables[query.table];
                const answer = handler ? Promise.resolve().then(() => handler(query)).then((data) => ({ data, error: null, status: 200 })) : new Promise(() => {});
                return answer.then(resolve, reject);
              };
              return chain;
            },
          };
        },
        call(name, args) {
          callLog.push([name, args]);
          const handler = calls[name];
          if (!handler) return new Promise(() => {});
          return Promise.resolve().then(() => handler(...args));
        },
        rpc(fn, args) {
          rpcLog.push([fn, args]);
          const handler = rpcs[fn];
          if (!handler) return new Promise(() => {});
          const count = rpcLog.filter(([name]) => name === fn).length;
          return Promise.resolve().then(() => handler(args, count));
        },
      };
      return { rpcLog, callLog, reads };
    };
    const named = (log, name) => log.filter(([n]) => n === name).map(([, args]) => args);
    const refused = (key) => new m.RejectedError(F.refusals[key].code, F.refusals[key].hint);
    const shape = (fn) => {
      try {
        fn();
        return 'ok';
      } catch (error) {
        return error instanceof m.repo.MillShapeError ? error.message : `threw:${error}`;
      }
    };

    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      function Keyed() {
        const location = m.useLocation();
        globalThis.__m4.location = `${location.pathname}${location.search}`;
        return m.h(
          m.Routes,
          { key: location.pathname },
          m.h(m.Route, { path: '/mill/*', element: m.h(m.MillRoutes) }),
          m.h(m.Route, { path: '/inventory/store/:id', element: m.h(m.WarehousePage) }),
          m.h(m.Route, { path: '*', element: null }),
        );
      }
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(Keyed))));
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
    const step = async (label, fn) => {
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
    };

    // ── P: المحلّلات الحقيقية بأجوبة العقد، وصرامتها ─────────────────────────────────────────────────────────────────────
    {
      const form = m.repo.parseProductionForm(clone(F.production_form.last));
      t.same(
        [form.today, form.recipe, form.active, form.stores, form.outputStore, form.canEditRecipe, form.draftExists],
        ['2026-11-10', { id: 'r-1', name: 'علف بادئ', archived: false, outputItem: { id: 'f-1', name: 'علف بادئ 21٪' } }, { id: 'v-3', versionNo: 3, materialsOnly: true }, [{ id: 'w-raw', name: 'مخزن المواد الأوّلية' }], { id: 'w-feed', name: 'رصيد العلف' }, true, false],
        'P production_form: الخلطة ونسختها المفعَّلة ومخازن المواد و«رصيد العلف» والصلاحية',
      );
      t.same(
        form.materials.map((row) => [row.lineNo, row.itemId, row.baseUnit, row.density, row.inBasis, row.scaleStep, row.defaultQty, row.defaultSource]),
        [
          [1, 'i-corn', 'kg', null, true, 100n, 600_000n, 'last'],
          [2, 'i-soy', 'kg', null, true, 100n, 360_000n, 'last'],
          [3, 'i-oil', 'L', 9_200n, true, 100n, 20_000n, 'last'],
          [4, 'i-salt', 'kg', null, true, 100n, 21_600n, 'last'],
          [5, 'i-diesel', 'L', 8_500n, false, 100n, 2_000n, 'last'],
        ],
        'P production_form: الموادّ بترتيبها وكثافتها وداخل الكتلة والكمية المقترحة ومصدرها',
      );
      t.same(form.last, { id: 'b-9', docNo: 'PD-2026-0009', producedOn: '2026-11-08', outputKg: 1_000_000n, inputMassKg: 1_000_000n, extraItems: [{ itemId: 'i-premix', name: 'برمكس' }] }, 'P production_form: آخر إنتاج وموادّه خارج الخلطة');
      const first = m.repo.parseProductionForm(clone(F.production_form.first));
      t.same([first.last, first.outputStore, first.materials.map((row) => [row.defaultQty, row.defaultSource, row.scaleStep])], [null, null, [[null, null, 100n], [null, null, 0n]]], 'P أوّل إنتاج: بلا كمية مقترحة ولا مصدر، وبلا «رصيد العلف»، وخطوة غائبة صفر');
      t.same(m.repo.parseProductionForm(clone(F.production_form.legacy)).materials.map((row) => row.defaultSource), ['recipe', 'recipe', 'recipe', 'recipe'], 'P خلطة قديمة بكميات: المقترح من الخلطة');
      const broken = (patch) => () => {
        const value = clone(F.production_form.last);
        patch(value);
        m.repo.parseProductionForm(value);
      };
      t.same(
        [
          shape(broken((v) => delete v.can_edit_recipe)),
          shape(broken((v) => delete v.output_store)),
          shape(broken((v) => delete v.active)),
          shape(broken((v) => delete v.draft_exists)),
          shape(broken((v) => (v.materials[0].default_source = null))),
          shape(broken((v) => (v.materials[0].default_qty = null))),
          shape(broken((v) => (v.materials[0].base_unit = 'g'))),
          shape(broken((v) => delete v.materials[0].in_basis)),
          shape(broken((v) => delete v.last.extra_items)),
        ],
        ['mill_shape:can_edit_recipe', 'mill_shape:output_store', 'mill_shape:active', 'mill_shape:draft_exists', 'mill_shape:default_source', 'mill_shape:default_source', 'mill_shape:base_unit', 'mill_shape:in_basis', 'mill_shape:extra_items'],
        'P production_form صارم: المفتاح الغائب والكمية بلا مصدر والمصدر بلا كمية خطأ شكل',
      );

      const posted = m.repo.parseProducedBatch(clone(F.produce_batch.posted), false);
      t.same(
        [posted.status, posted.id, posted.docNo, posted.outputWarehouseName, posted.outputQtyKg, posted.savedToRecipe, posted.recipeVersionId, posted.versionNo, posted.money?.costPerKg],
        ['posted', 'b-10', 'PD-2026-0010', 'رصيد العلف', 1_000_000n, false, 'v-3', 3, 615_00n],
        'P produce_batch مرحَّلة: جواب record_production ومعه النسخة وهل حُفظت في الخلطة',
      );
      t.same([m.repo.parseProducedBatch(clone(F.produce_batch.saved), false).savedToRecipe, m.repo.parseProducedBatch(clone(F.produce_batch.saved), false).versionNo], [true, 4], 'P حُفظت الموادّ في الخلطة بنسختها الجديدة');
      const awaiting = m.repo.parseProducedBatch(clone(F.produce_batch.awaiting), false);
      t.same([awaiting.status, awaiting.awaiting, awaiting.plannedKg, awaiting.versionNo], ['draft', 'costs', 1_000_000n, 3], 'P مسوّدة تنتظر ختم الكلف');
      t.same(m.repo.parseProducedBatch(clone(F.produce_batch.draft), true), { status: 'draft', id: 'b-13', awaiting: null, savedToRecipe: false, recipeVersionId: 'v-3', versionNo: 3 }, 'P «احفظ مسوّدة»: المعرّف والنسخة');
      t.same(
        [
          shape(() => {
            const value = clone(F.produce_batch.posted);
            delete value.saved_to_recipe;
            m.repo.parseProducedBatch(value, false);
          }),
          shape(() => m.repo.parseProducedBatch({ ...clone(F.produce_batch.posted), version_no: '3' }, false)),
          shape(() => m.repo.parseProducedBatch(clone(F.produce_batch.posted), true)),
          shape(() => m.repo.parseProducedBatch({ ...clone(F.produce_batch.draft), recipe_version_id: null }, true)),
        ],
        ['mill_shape:saved_to_recipe', 'mill_shape:version_no', 'mill_shape:status', 'mill_shape:recipe_version_id'],
        'P produce_batch صارم',
      );

      const history = m.repo.parseRecipeHistory(clone(F.recipe_history.period));
      t.same(
        history.versions.map((v) => [v.versionNo, v.status, v.activatedBy, v.materialsOnly, v.items.length, v.added.map((i) => i.name), v.removed.map((i) => i.name), v.fromBatch]),
        [
          [4, 'active', 'علي', true, 5, ['برمكس'], ['كاز المولّدة'], { id: 'b-11', docNo: 'PD-2026-0011' }],
          [3, 'retired', 'علي', true, 5, [], ['حجر الكلس'], null],
          [1, 'retired', null, false, 6, [], [], null],
        ],
        'P recipe_history: النسخ الأحدث أوّلاً بما أُضيف وحُذف والدفعة التي حُفظت منها',
      );
      t.same(
        [history.productions.map((p) => [p.docNo, p.status, p.savedToRecipe, p.by]), history.productions[1].lines.map((l) => [l.itemId, l.qty, l.massKg, l.extra]), history.productions[1].omitted, history.totals],
        [
          [['PD-2026-0011', 'posted', true, 'علي'], ['PD-2026-0010', 'posted', false, 'سعد'], ['PD-2026-0008', 'void', false, null]],
          [['i-corn', 600_000n, 600_000n, false], ['i-soy', 360_000n, 360_000n, false], ['i-oil', 20_000n, 18_400n, false], ['i-salt', 21_600n, 21_600n, false], ['i-premix', 1_000n, 1_000n, true]],
          [{ itemId: 'i-diesel', name: 'كاز المولّدة' }],
          { batches: 2, outputKg: 2_005_000n },
        ],
        'P recipe_history: الإنتاج بموادّه وكمياته وما أُضيف لهذه المرّة وما لم يُستعمل، والمجموع',
      );
      const brokenHistory = (patch) => () => {
        const value = clone(F.recipe_history.period);
        patch(value);
        m.repo.parseRecipeHistory(value);
      };
      t.same(
        [
          shape(brokenHistory((v) => delete v.versions[1].from_batch)),
          shape(brokenHistory((v) => (v.productions[0].status = 'draft'))),
          shape(brokenHistory((v) => (v.productions[0].lines[0].qty = null))),
          shape(brokenHistory((v) => delete v.productions[0].omitted)),
          shape(brokenHistory((v) => delete v.totals.output_kg)),
          shape(brokenHistory((v) => delete v.versions[0].activated_by)),
        ],
        ['mill_shape:from_batch', 'mill_shape:status', 'mill_shape:qty', 'mill_shape:omitted', 'mill_shape:output_kg', 'mill_shape:activated_by'],
        'P recipe_history صارم',
      );

      const cards = m.repo.parseRecipes(clone(F.recipes_overview.materials_only));
      t.same(
        cards.map((card) => [card.id, card.materialsOnly, card.piecesSource, card.activeBasisKg, card.pieces.map((piece) => [piece.label, piece.weight])]),
        [
          ['r-1', true, 'last_batch', null, [['ذرة صفراء', 600_000n], ['كسبة صويا', 360_000n], ['زيت', 18_400n], ['ملح', 21_600n], ['برمكس', 10_000n]]],
          ['r-2', true, 'recipe', null, [['ذرة صفراء', null], ['كسبة صويا', null], ['كاز المولّدة', null]]],
          ['r-3', false, 'recipe', 1_000_000n, [['ذرة صفراء', 650_000n], ['كسبة صويا', 350_000n]]],
          ['r-9', false, null, null, []],
        ],
        'P recipes_overview: قطع آخر دفعة بأسمائها وكتلها، وأسماء الموادّ بلا كتل، والنسخة القديمة كما هي',
      );
      const brokenCards = (patch) => () => {
        const value = clone(F.recipes_overview.materials_only);
        patch(value);
        m.repo.parseRecipes(value);
      };
      t.same(
        [shape(brokenCards((v) => delete v.recipes[0].active.pieces_source)), shape(brokenCards((v) => (v.recipes[0].active.pieces_source = 'batch'))), shape(brokenCards((v) => delete v.recipes[1].active.materials_only)), shape(brokenCards((v) => delete v.recipes[0].active.basis_kg))],
        ['mill_shape:pieces_source', 'mill_shape:pieces_source', 'mill_shape:materials_only', 'mill_shape:basis_kg'],
        'P recipes_overview صارم: مصدر القطع وmaterials_only والأساس الفارغ مفاتيح إلزامية',
      );
      const detail = m.repo.parseRecipe(clone(F.recipe_detail.materials_only));
      t.same(
        [detail.materialsOnly, detail.basisKg, detail.massKg, detail.lines.map((line) => [line.qty, line.massKg, line.sharePct]).slice(0, 2), detail.versions.map((v) => [v.versionNo, v.materialsOnly, v.basisKg]), detail.expected],
        [true, null, null, [[null, null, null], [null, null, null]], [[4, true, null], [3, true, null], [1, false, 1_000_000n]], null],
        'P recipe_detail: نسخة موادّ بلا كميات (الكمية والكتلة والحصّة والأساس null)، وكلّ نسخة بعلامتها',
      );
      t.same(
        [
          shape(() => {
            const value = clone(F.recipe_detail.materials_only);
            delete value.selected.materials_only;
            m.repo.parseRecipe(value);
          }),
          shape(() => {
            const value = clone(F.recipe_detail.materials_only);
            delete value.lines[0].qty;
            m.repo.parseRecipe(value);
          }),
        ],
        ['mill_shape:materials_only', 'mill_shape:qty'],
        'P recipe_detail صارم: materials_only والكمية (null مقصود) مفتاحان إلزاميان',
      );
      const batch = m.repo.parseBatch(clone(F.production_detail.saved));
      t.same([batch.savedToRecipe, batch.basisKg, batch.versionNo], [true, null, 4], 'P production_detail: saved_to_recipe، وأساس نسخة بلا كميات null');
      t.eq(shape(() => {
        const value = clone(F.production_detail.saved);
        delete value.saved_to_recipe;
        m.repo.parseBatch(value);
      }), 'mill_shape:saved_to_recipe', 'P production_detail صارم: saved_to_recipe إلزامي');

      // أجوبة القاعدة الحقيقية (بعد الهجرة): كلّ عيّنة بمحلّلها.
      if (REAL) {
        const parsers = {
          production_form: (v) => m.repo.parseProductionForm(v),
          produce_batch: (v) => m.repo.parseProducedBatch(v, v?.status === 'draft' && !('awaiting' in v)),
          recipe_history: (v) => m.repo.parseRecipeHistory(v),
          recipes_overview: (v) => m.repo.parseRecipes(v),
          recipe_detail: (v) => m.repo.parseRecipe(v),
        };
        for (const [reader, parse] of Object.entries(parsers)) {
          for (const [name, sample] of Object.entries(REAL[reader] ?? {})) t.eq(shape(() => parse(clone(sample))), 'ok', `P جواب القاعدة ${reader}.${name} يُقرأ بمحلّله`);
        }
      }
    }

    // ── Q: طلبات repo الحقيقي ───────────────────────────────────────────────────────────────────────────────────
    {
      const { rpcLog } = fresh(MANAGER, { rpcs: { produce_batch: () => clone(F.produce_batch.posted) } });
      await m.repo.produceBatch({
        id: 'b-x', recipeId: 'r-1', expectedVersion: 'v-3', inputWarehouseId: 'w-raw',
        lines: [{ itemId: 'i-corn', qty: 600_000n, name: 'ذرة صفراء', unit: 'kg', density: null, inBasis: true }, { itemId: 'i-oil', qty: 20_500n, name: 'زيت', unit: 'L', density: 9_200n, inBasis: true }],
        saveRecipe: false, draft: false, producedOn: '2026-11-10', outputKg: 995_000n, expiry: null, shrinkReason: null, note: 'ملاحظة', clientRef: 'ref-x',
      });
      t.same(
        named(rpcLog, 'produce_batch')[0],
        {
          p_id: 'b-x', p_recipe: 'r-1', p_expected_version: 'v-3', p_wh_in: 'w-raw', p_lines: [{ item_id: 'i-corn', qty: '600.000' }, { item_id: 'i-oil', qty: '20.500' }],
          p_save_recipe: false, p_draft: false, p_produced_on: '2026-11-10', p_output_kg: '995.000', p_expiry: null, p_shrink_reason: null, p_note: 'ملاحظة', p_client_ref: 'ref-x',
        },
        'Q produce_batch: المعاملات الثلاث عشرة بأسمائها، والكميات نصوص بثلاث مراتب بترتيب الشاشة',
      );
    }
    {
      const { rpcLog, reads } = fresh(MANAGER, { rpcs: { production_form: () => clone(F.production_form.last) }, tables: { items: () => [{ id: 'f-1', tracks_expiry: true }] } });
      const form = await m.repo.loadProduceForm('r-1');
      t.same([named(rpcLog, 'production_form')[0], reads.map((read) => [read.table, read.ops.find(([op]) => op === 'eq')])], [{ p_recipe: 'r-1' }, [['items', ['eq', 'id', 'f-1']]]], 'Q production_form بالخلطة، و«يُتابَع انتهاؤه» لمنتجها بقراءة واحدة');
      t.eq(form.tracksExpiry, true, 'Q tracks_expiry من صفّ المنتج');
    }
    {
      const { rpcLog } = fresh(MANAGER, { rpcs: { recipe_history: () => clone(F.recipe_history.period) } });
      await m.repo.loadRecipeHistory('r-1', '2026-08-13', '2026-11-10');
      t.same(named(rpcLog, 'recipe_history')[0], { p_recipe: 'r-1', p_from: '2026-08-13', p_to: '2026-11-10' }, 'Q recipe_history بالخلطة والمدّة');
    }
    {
      const { reads } = fresh(MANAGER, { tables: { recipe_lines: () => [{ id: 'l-new' }] } });
      await m.repo.addRecipeLine('v-3', 'i-corn');
      await m.repo.clearRecipeLineQty('l-41');
      t.same(
        reads.map((read) => [read.table, read.ops.filter(([op]) => op === 'insert' || op === 'update' || op === 'eq')]),
        [['recipe_lines', [['insert', { version_id: 'v-3', item_id: 'i-corn' }]]], ['recipe_lines', [['update', { qty: null }], ['eq', 'id', 'l-41']]]],
        'Q سطر خلطة بلا كمية ولا وحدة (الحارس يكتب الوحدة)، ومحو كمية سطر مسوّدة قديمة',
      );
    }

    // ── R: شاشة الإنتاج على production_form وproduce_batch ───────────────────────────────────────────────────────────
    const produceUrl = '/mill/produce/r-1';
    const FORM = F.production_form.last;
    const formWith = (over = {}) => ({ ...clone(FORM), ...over });
    const produceSetup = (session, { form = () => clone(FORM), produce = () => clone(F.produce_batch.posted), stock = RAW_STOCK } = {}) =>
      fresh(session, {
        rpcs: { production_form: form, produce_batch: produce },
        calls: { loadStockOnHand: () => rawBoard(stock), loadItem: (id) => ITEMS[id] ?? null },
        tables: { items: () => [{ id: 'f-1', tracks_expiry: false }] },
      });
    const rowNames = () => tableRows('موادّ هذا الإنتاج')?.map((row) => row[0].split('ليست في الخلطة')[0].split('خارج الكتلة')[0].split('أي ')[0].split('+')[0]) ?? null;

    await step('R1 التعبئة من آخر إنتاج', async () => {
      produceSetup(MANAGER);
      await mount(produceUrl);
      t.same(
        ['ذرة صفراء', 'كسبة صويا', 'زيت', 'ملح', 'كاز المولّدة'].map((name) => qtyInput(name)?.value),
        ['600', '360', '20', '21.6', '2'],
        'R1 كمية كلّ مادّة من آخر إنتاج، بترتيب الخلطة',
      );
      t.same(byAction('line-source').map((n) => n.textContent), ['من آخر إنتاج', 'من آخر إنتاج', 'من آخر إنتاج', 'من آخر إنتاج', 'من آخر إنتاج'], 'R1 وعلامة «من آخر إنتاج» تحت كلّ كمية');
      t.eq(textOf('produce-source'), 'الكميات من آخر إنتاج (PD-2026-0009 بتاريخ 08/11/2026، الناتج 1,000 كغم): عدّل أيّ كمية، أو أزل مادّة، أو أضف غيرها.', 'R1 والجملة تسمّي آخر إنتاج');
      t.eq(textOf('produce-mass'), 'الناتج: 1,000 كغم (قبل الهدر)', 'R1 الناتج حيّاً = مجموع كتلة ما داخل الكتلة (الزيت 20 لتراً × 0.92 = 18.4 كغم، والكاز خارجها)');
      t.same([textOf('row-kg'), byAction('out-of-basis').length, withId('line-short', 'i-soy')?.textContent], ['أي 18.4 كغم', 1, 'ينقص 60 كغم'], 'R1 الكيلو للّتر، و«خارج الكتلة» للكاز، وعلامة النقص من «عندك»');
      t.same(byAction('dot').map((n) => n.getAttribute('data-slot')), ['0', '1', '2', '3'], 'R1 نقطة لون لكلّ مادّة داخل الكتلة بموضعها (والكاز بلا نقطة)');
      const pieces = byAction('bar-piece');
      t.same(pieces.map((n) => n.getAttribute('data-slot')), ['0', '1', '2', '3'], 'R1 شريط التركيبة الحيّ: قطعة لكلّ نقطة');
      t.same([textOf('input-store'), textOf('output-store'), byAction('store-to').length], ['تُسحب الموادّ من: «مخزن المواد الأوّلية»', 'يدخل الناتج: «رصيد العلف»', 0], 'R1 الناتج يدخل «رصيد العلف» بلا اختيار مخزن');
      t.same([byAction('round-ton').length, byAction('recipe-diff').length, disabled(byAction('produce-go')[0]), byAction('produce-missing').length], [0, 0, false, 0], 'R1 طنّ كامل والموادّ كالخلطة: لا «قرّب» ولا اختيار، و«أنتج» مفتوح');
      t.same([byAction('quick-qty').length, byAction('produce-qty').length], [0, 0], 'R1 لا كمية كلّية ولا كميات سريعة');
      t.ok(/(^|\s)w-32(\s|$)/u.test(qtyInput('ذرة صفراء')?.getAttribute('class') ?? ''), 'R1 خانة الكمية بعرض ثابت (w-32، مراجعة 0023 S3)');
    });
    await step('R1 من الخلطة ومخزنان', async () => {
      produceSetup(MANAGER, { form: () => clone(F.production_form.legacy) });
      await mount(produceUrl);
      t.same([qtyInput('كسبة صويا')?.value, byAction('line-source').map((n) => n.textContent)], ['377.7', ['من الخلطة', 'من الخلطة', 'من الخلطة', 'من الخلطة']], 'R1 خلطة قديمة بكميات بلا إنتاج: من الخلطة بعلامتها');
      t.eq(textOf('produce-source'), 'الكميات من الخلطة كما كُتبت فيها: عدّل أيّ كمية، أو أزل مادّة، أو أضف غيرها.', 'R1 والجملة تقول إنّها من الخلطة');
      const select = byAction('store-from')[0];
      t.same(select ? select.options.map((option) => option.textContent) : null, ['مخزن المواد الأوّلية', 'مخزن موادّ ثانٍ'], 'R1 مخزنا موادّ: يُختار منهما');
    });
    await step('R1 أوّل إنتاج', async () => {
      produceSetup(MANAGER, { form: () => ({ ...clone(F.production_form.first), output_store: { id: 'w-feed', name: 'رصيد العلف' } }) });
      await mount(produceUrl);
      t.same([qtyInput('ذرة صفراء')?.value, qtyInput('كسبة صويا')?.value, byAction('line-source').length], ['', '', 0], 'R1 أوّل إنتاج: الخانات فارغة بلا علامة');
      t.ok(disabled(byAction('produce-go')[0]) && textOf('produce-missing')?.includes('اكتب كمية «ذرة صفراء» أكبر من صفر.'), 'R1 و«أنتج» معطّل حتّى تُكتب الكميات، والسبب يسمّي المادّة');
      t.eq(textOf('produce-source'), 'أوّل إنتاج لهذه الخلطة: اكتب كمية كلّ مادّة، وتُقترح كميات هذا الإنتاج في المرّة القادمة.', 'R1 والجملة تقول إنّه أوّل إنتاج');
    });
    await step('R1 بلا «رصيد العلف»', async () => {
      produceSetup(MANAGER, { form: () => clone(F.production_form.first) });
      await mount(produceUrl);
      t.same([text().includes('لا يوجد «رصيد العلف» في المعمل: أضفه من إعداد المخزن.'), byAction('produce-go').length], [true, 0], 'R1 output_store فارغ: جملة تمنع ولا «أنتج»');
    });

    await step('R2 التعديل و«قرّب»', async () => {
      const { rpcLog, callLog } = produceSetup(MANAGER);
      await mount(produceUrl);
      type(qtyInput('ذرة صفراء'), '590');
      await settle();
      t.same([withId('line-source', 'i-corn')?.textContent, textOf('produce-mass'), textOf('round-ton')], ['في آخر إنتاج: 600 كغم', 'الناتج: 990 كغم (قبل الهدر)', 'قرّب إلى طنّ واحد (+10 كغم)'], 'R2 الكمية المعدَّلة تقول ما كانت في آخر إنتاج، والناتج و«قرّب» يتبعانها');
      await click(byAction('round-ton')[0]);
      t.same(byAction('pick-group').map((n) => n.getAttribute('data-group')), ['rows', 'store'], 'R2 «قرّب»: موادّ هذا الإنتاج ثمّ موادّ أخرى في المخزن');
      await click(withId('pick-option', 'i-salt'));
      t.same([qtyInput('ملح')?.value, textOf('round-added'), textOf('produce-mass'), byAction('round-ton').length], ['31.6', '+10 كغم لإكمال طنّ واحد', 'الناتج: 1,000 كغم (قبل الهدر)', 0], 'R2 الفرق كلّه إلى الملح بالضبط، والناتج طنّ');
      await click(byAction('undo-round')[0]);
      t.same([qtyInput('ملح')?.value, textOf('round-ton')], ['21.6', 'قرّب إلى طنّ واحد (+10 كغم)'], 'R2 «تراجع عن الإكمال» يعيد الكمية و«قرّب»');
      await click(byAction('round-ton')[0]);
      await click(withId('pick-option', 'i-premix'));
      t.same(named(callLog, 'loadItem').at(-1), ['i-premix'], 'R2 مادّة من المخزن تُقرأ قبل إضافتها');
      t.same([rowNames()?.at(-1), qtyInput('برمكس')?.value, textOf('row-extra'), textOf('produce-mass')], ['برمكس', '10', 'ليست في الخلطة: لهذا الإنتاج', 'الناتج: 1,000 كغم (قبل الهدر)'], 'R2 أو تُضاف مادّة جديدة بالفرق في آخر الموادّ');
      t.same([textOf('recipe-diff-text'), disabled(byAction('produce-go')[0]), textOf('produce-missing')?.includes('غيّرت موادّ الخلطة: اختر «عدّل الخلطة بهذه الموادّ» أو «لهذه المرّة فقط».')], ['أضفت: برمكس', true, true], 'R2 خالفت الموادّ الخلطة: الاختيار إلزاميّ بلا افتراض، و«أنتج» معطّل قبله');
      t.same(byAction('recipe-choice')[0]?.children.map((n) => [n.getAttribute('role'), n.getAttribute('aria-checked')]), [['radio', 'false'], ['radio', 'false']], 'R2 الخياران بلا افتراض');
      await click(byAction('choice-once')[0]);
      t.same([byAction('choice-once')[0]?.getAttribute('aria-checked'), disabled(byAction('produce-go')[0])], ['true', false], 'R2 «لهذه المرّة فقط» يفتح «أنتج»');
      await click(byAction('produce-go')[0]);
      const sent = named(rpcLog, 'produce_batch')[0];
      t.same(
        [sent?.p_recipe, sent?.p_expected_version, sent?.p_wh_in, sent?.p_save_recipe, sent?.p_draft, sent?.p_produced_on, sent?.p_output_kg, sent?.p_note, sent?.p_lines],
        ['r-1', 'v-3', 'w-raw', false, false, '2026-11-10', null, null, [
          { item_id: 'i-corn', qty: '590.000' }, { item_id: 'i-soy', qty: '360.000' }, { item_id: 'i-oil', qty: '20.000' }, { item_id: 'i-salt', qty: '21.600' }, { item_id: 'i-diesel', qty: '2.000' }, { item_id: 'i-premix', qty: '10.000' },
        ]],
        'R2 produce_batch بالكميات كما في الشاشة بترتيبها، واختيار «لهذه المرّة فقط»',
      );
      t.ok(UUID.test(sent?.p_id ?? '') && UUID.test(sent?.p_client_ref ?? '') && sent.p_id !== sent.p_client_ref, 'R2 معرّف الدفعة ومرجع المحاولة من الجهاز');
      t.same([textOf('produced-text'), textOf('produced-doc'), textOf('produced-cost'), byAction('produced-saved').length], ['دخل 1,000 كغم من «علف بادئ 21٪» إلى «رصيد العلف».', 'PD-2026-0010', '615.00', 0], 'R2 تمّ الإنتاج: دخل «رصيد العلف»');
    });

    await step('R3 «أزل» و«أضف مادّة» و«عدّل الخلطة»', async () => {
      const { rpcLog, callLog } = produceSetup(MANAGER, { produce: () => clone(F.produce_batch.saved) });
      await mount(produceUrl);
      await click(withId('remove-line', 'i-diesel'));
      t.same([qtyInput('كاز المولّدة'), textOf('recipe-diff-text')], [undefined, 'أزلت: كاز المولّدة'], 'R3 «أزل» يُخرج المادّة من هذا الإنتاج ويقول ما تغيّر');
      await click(byAction('choice-save')[0]);
      t.same([byAction('choice-save')[0]?.getAttribute('aria-checked'), textOf('choice-help')], ['true', 'تصير هذه الموادّ بترتيبها هي الخلطة من الآن، ويُكتب ذلك في سجلّها.'], 'R3 «عدّل الخلطة بهذه الموادّ» ويقول أثره');
      await click(byAction('add-material')[0]);
      t.same(byAction('pick-group').map((n) => n.getAttribute('data-group')), ['last', 'removed', 'store'], 'R3 «أضف مادّة»: موادّ آخر إنتاج أوّلاً، ثمّ ما أُزيل، ثمّ بقيّة المخزن');
      const storeOptions = descendants(byAction('pick-group').find((n) => n.getAttribute('data-group') === 'store')).filter((n) => n.getAttribute('data-action') === 'pick-option').map((n) => n.getAttribute('data-id'));
      t.same(storeOptions, ['i-lime'], 'R3 بقيّة المخزن ما يصلح للإنتاج وليس هنا (لا القطعة ولا المؤرشفة ولا المعروض فوق)');
      await click(withId('pick-option', 'i-premix'));
      t.same([named(callLog, 'loadItem').at(-1), textOf('pick-note'), withId('pick-option', 'i-premix')], [['i-premix'], 'أُضيفت «برمكس».', undefined], 'R3 الاختيار يُقرأ ويُضاف، والنافذة تبقى لغيرها');
      await click(withId('pick-option', 'i-diesel'));
      await click(byAction('dialog-close')[0]);
      t.same(rowNames(), ['ذرة صفراء', 'كسبة صويا', 'زيت', 'ملح', 'كاز المولّدة', 'برمكس'], 'R3 المُزالة تعود إلى مكانها في الخلطة، والمضافة في آخر الموادّ');
      t.same([textOf('recipe-diff-text'), byAction('choice-save')[0]?.getAttribute('aria-checked')], ['أضفت: برمكس', 'false'], 'R3 تغيّرت المجموعة: الاختيار يُطلب من جديد');
      t.ok(textOf('produce-missing')?.includes('اكتب كمية «برمكس» أكبر من صفر.'), 'R3 المضافة بلا كمية حتّى تُكتب');
      type(qtyInput('برمكس'), '10');
      await settle();
      await click(byAction('choice-save')[0]);
      await click(byAction('produce-go')[0]);
      const sent = named(rpcLog, 'produce_batch')[0];
      t.same([sent?.p_save_recipe, sent?.p_lines.map((line) => line.item_id)], [true, ['i-corn', 'i-soy', 'i-oil', 'i-salt', 'i-diesel', 'i-premix']], 'R3 produce_batch بـp_save_recipe = true والموادّ بترتيب الشاشة');
      t.eq(textOf('produced-saved'), 'وحُفظت موادّ هذا الإنتاج في الخلطة: صارت نسخة 4 هي الخلطة.', 'R3 النتيجة تقول إنّ الموادّ حُفظت في الخلطة بنسختها');
    });

    await step('R4 مشغّل المعمل', async () => {
      const { rpcLog } = produceSetup(OPERATOR, { form: () => formWith({ can_edit_recipe: false }), produce: () => clone(F.produce_batch.awaiting) });
      await mount(produceUrl);
      await click(withId('remove-line', 'i-diesel'));
      t.same([textOf('once-only'), byAction('recipe-choice').length, disabled(byAction('produce-go')[0])], ['التغيير لهذه المرّة فقط: موادّ الخلطة تبقى كما هي (تعديلها للمالك أو المدير).', 0, false], 'R4 من لا يعدّل الخلطة: «لهذه المرّة فقط» جملةً بلا اختيار، و«أنتج» مفتوح');
      await click(byAction('produce-go')[0]);
      t.eq(named(rpcLog, 'produce_batch')[0]?.p_save_recipe, false, 'R4 p_save_recipe = false');
      t.ok(textOf('produced-draft-text')?.includes('(المخطّط 1,000 كغم)') && textOf('produced-draft-text')?.includes('«اختم الكلف»') && textOf('produced-draft-text')?.includes('«رصيد العلف»'), `R4 مسوّدة تنتظر ختم الكلف، ثمّ تدخل «رصيد العلف» (${textOf('produced-draft-text')})`);
    });
    await step('R4 الموادّ كالخلطة', async () => {
      const { rpcLog } = produceSetup(MANAGER);
      await mount(produceUrl);
      await click(withId('remove-line', 'i-salt'));
      await click(byAction('add-material')[0]);
      await click(withId('pick-option', 'i-salt'));
      await click(byAction('dialog-close')[0]);
      t.same([byAction('recipe-diff').length, rowNames()?.[3]], [0, 'ملح'], 'R4 مادّة أُزيلت ثمّ أُعيدت: الموادّ كالخلطة فلا اختيار');
      await click(byAction('produce-go')[0]);
      t.eq(named(rpcLog, 'produce_batch')[0]?.p_save_recipe, null, 'R4 والموادّ كالخلطة: p_save_recipe فارغ');
    });
    await step('R5 draft_exists', async () => {
      produceSetup(MANAGER, { form: () => formWith({ draft_exists: true }) });
      await mount(produceUrl);
      await click(withId('remove-line', 'i-diesel'));
      t.same(
        [disabled(byAction('choice-save')[0]), disabled(byAction('choice-once')[0]), textOf('choice-help')],
        [true, false, 'للخلطة تعديل مفتوح لم يُفعَّل، فلا تُحفظ الموادّ فيها الآن: فعّله أو احذفه من صفحة الخلطة، أو أنتج لهذه المرّة فقط.'],
        'R5 للخلطة مسوّدة: «عدّل الخلطة» معطّل بجملة تقول لماذا، و«لهذه المرّة فقط» متاح',
      );
    });
    await step('R6 «احفظ مسوّدة»', async () => {
      const { rpcLog } = produceSetup(MANAGER, { produce: () => clone(F.produce_batch.draft) });
      await mount(produceUrl);
      type(byAction('produce-note')[0], 'دفعة الصباح');
      await settle();
      await click(byAction('save-batch-draft')[0]);
      const sent = named(rpcLog, 'produce_batch')[0];
      t.same([sent?.p_draft, sent?.p_save_recipe, sent?.p_note, sent?.p_lines.length], [true, null, 'دفعة الصباح', 5], 'R6 «احفظ مسوّدة» نداء produce_batch بـp_draft وكلّ ما كُتب');
      t.same([globalThis.__m4.location, globalThis.__m4.toasts.at(-1)?.title], ['/mill/batch/b-13', 'حُفظت الدفعة مسوّدة بما كتبته: أكملها في صفحتها.'], 'R6 ثمّ صفحة الدفعة');
    });

    await step('R7 النتيجة المجهولة', async () => {
      const { rpcLog } = produceSetup(MANAGER, {
        produce: (_args, n) => {
          if (n === 1) throw new m.UnknownOutcomeError();
          if (n === 2) throw new m.NetworkError();
          return clone(F.produce_batch.posted);
        },
      });
      await mount(produceUrl);
      type(qtyInput('ذرة صفراء'), '590');
      type(qtyInput('ملح'), '31.6');
      await settle();
      await click(byAction('produce-go')[0]);
      t.same([byAction('frozen').length, byAction('retry-produce').length, byAction('produce-go').length, qtyInput('ذرة صفراء')], [1, 1, 0, undefined], 'R7 نتيجة مجهولة: الطلب المجمَّد وحده و«أعد المحاولة»');
      t.same(
        tableRows('موادّ الطلب المرسَل')?.map((row) => [row[0], row[1]]),
        [['ذرة صفراء', '590.0'], ['كسبة صويا', '360.0'], ['زيت', '20.0'], ['ملح', '31.6'], ['كاز المولّدة', '2.0']],
        'R7 الشاشة المجمَّدة تعرض ما أُرسل (لا الخانات)',
      );
      t.eq(m.isWindowDirty(), true, 'R7 والنافذة «فيها ما لم يُحفظ» وهي مجمَّدة');
      await unmount();
      await mount(produceUrl);
      t.same([byAction('retry-produce').length, byAction('produce-go').length], [1, 0], 'R7 الرجوع ثمّ العودة: مجمَّدة بطلبها، لا «أنتج» بمعرّف جديد');
      await click(byAction('retry-produce')[0]);
      t.ok(text().includes('لم تصل الإعادة إلى الخادم: أعد المحاولة عند عودة الاتصال.') && byAction('retry-produce').length === 1, 'R7 إعادة لم تصل: تبقى مجمَّدة');
      await click(byAction('retry-produce')[0]);
      const sent = named(rpcLog, 'produce_batch');
      t.same([sent.length, JSON.stringify(sent[1]) === JSON.stringify(sent[0]), JSON.stringify(sent[2]) === JSON.stringify(sent[0])], [3, true, true], 'R7 كلّ إعادة بالطلب نفسه حرفاً (المعرّف والمرجع والكميات)');
      t.same([byAction('produced-posted').length, m.isWindowDirty()], [1, false], 'R7 ثمّ النتيجة، والنافذة نظيفة');
      await unmount();
      await mount(produceUrl);
      t.same([byAction('retry-produce').length, byAction('produce-go').length], [0, 1], 'R7 بعد الجواب النهائي: لا طلب معلَّق');
    });
    await step('R7 في الطريق', async () => {
      const held = deferred();
      const { rpcLog } = produceSetup(MANAGER, { produce: (_args, n) => (n === 1 ? held.promise : clone(F.produce_batch.posted)) });
      await mount(produceUrl);
      const before = m.isWindowDirty();
      await click(byAction('produce-go')[0]);
      await click(byAction('produce-go')[0]);
      t.same([before, m.isWindowDirty(), named(rpcLog, 'produce_batch').length], [false, true, 1], 'R7 الطلب في الطريق: النافذة «فيها ما لم يُحفظ»، ونقرة ثانية لا ترسل');
      await unmount();
      await mount(produceUrl);
      t.same([byAction('retry-produce').length, byAction('produce-go').length], [1, 0], 'R7 الرجوع والطلب في الطريق: مجمَّدة بطلبها');
      held.resolve(clone(F.produce_batch.posted));
      await settle();
      await click(byAction('retry-produce')[0]);
      const sent = named(rpcLog, 'produce_batch');
      t.same([sent.length, JSON.stringify(sent[1]) === JSON.stringify(sent[0])], [2, true], 'R7 والإعادة بالطلب نفسه حرفاً');
    });
    await step('R8 الرفض بتلميحه', async () => {
      const { rpcLog } = produceSetup(MANAGER, {
        produce: (_args, n) => {
          if (n === 1) throw refused('production_blocked');
          return clone(F.produce_batch.posted);
        },
      });
      await mount(produceUrl);
      type(qtyInput('كسبة صويا'), '300');
      type(qtyInput('ذرة صفراء'), '660');
      await settle();
      await click(byAction('produce-go')[0]);
      t.same([text().includes(F.refusals.production_blocked.hint), qtyInput('كسبة صويا')?.value, disabled(byAction('produce-go')[0])], [true, '300', false], 'R8 production_blocked: تلميح الخادم كما هو، والمكتوب باقٍ، و«أنتج» متاح');
      await click(byAction('produce-go')[0]);
      const [first, second] = named(rpcLog, 'produce_batch');
      t.ok(first.p_id !== second.p_id && first.p_client_ref !== second.p_client_ref, 'R8 بعد رفض أكيد: المحاولة التالية بمعرّف ومرجع جديدين');
    });
    await step('R9 recipe_changed', async () => {
      const { rpcLog } = produceSetup(MANAGER, {
        form: (_args, n) => (n === 1 ? clone(FORM) : formWith({ active: { id: 'v-4', version_no: 4, materials_only: true } })),
        produce: (_args, n) => {
          if (n === 1) throw refused('recipe_changed');
          return clone(F.produce_batch.posted);
        },
      });
      await mount(produceUrl);
      type(qtyInput('ذرة صفراء'), '590');
      type(qtyInput('ملح'), '31.6');
      await settle();
      await click(byAction('produce-go')[0]);
      t.same(
        [named(rpcLog, 'production_form').length, text().includes(F.refusals.recipe_changed.hint), textOf('recipe-changed'), qtyInput('ذرة صفراء')?.value],
        [2, true, 'قُرئت الخلطة من جديد، وما كتبته من كميات باقٍ لموادّه: راجع الموادّ ثمّ أنتج.', '590'],
        'R9 recipe_changed يقرأ الشاشة من جديد ويقوله، والكميات المكتوبة باقية',
      );
      await click(byAction('produce-go')[0]);
      t.eq(named(rpcLog, 'produce_batch')[1]?.p_expected_version, 'v-4', 'R9 والطلب التالي بالنسخة المقروءة الآن');
    });
    await step('R10 طلب معلَّق من شاشة 0023', async () => {
      produceSetup(MANAGER);
      const key = m.pendingKey(`${MANAGER.workspace.userId}:${MANAGER.workspace.orgId}`, 'r-1');
      // طلب record_production كما كتبته شاشة 0023 (المعرّف ونسخة الخلطة والكمية المخطّطة).
      m.storePending(key, { id: 'b-old', versionId: 'v-2', plannedKg: 1_000_000n, inputWarehouseId: 'w-raw', outputWarehouseId: 'w-feed', clientRef: 'ref-old' });
      t.same(m.readPending(key), { kind: 'legacy' }, 'R10 طلب 0023 يُقرأ معلَّقاً قديماً لا يُعاد هنا');
      await mount(produceUrl);
      t.ok(text().includes('محاولة إنتاج سابقة لهذه الخلطة لم تُعرف نتيجتها') && disabled(byAction('produce-go')[0]), 'R10 جملة تقول راجع آخر الدفعات، و«أنتج» معطّل');
      await click(byAction('legacy-dismiss')[0]);
      t.same([text().includes('محاولة إنتاج سابقة'), disabled(byAction('produce-go')[0]), m.readPending(key)], [false, false, null], 'R10 «راجعتها» يمحوه ويفتح «أنتج»');
    });

    // ── H: «السجلّ» في صفحة الخلطة ───────────────────────────────────────────────────────────────────────────────
    const recipeSetup = (history = () => clone(F.recipe_history.period)) =>
      fresh(MANAGER, {
        rpcs: { recipe_detail: () => clone(F.recipe_detail.materials_only), recipe_history: history },
        calls: { loadItemsOverview: () => ({ today: '2026-11-10', canRecord: true, canAddItem: true, items: [] }) },
      });
    await step('H1 السجلّ', async () => {
      const { rpcLog } = recipeSetup();
      await mount('/mill/recipe/r-1');
      const today = m.localDay();
      t.same(named(rpcLog, 'recipe_history')[0], { p_recipe: 'r-1', p_from: m.addDays(today, -89), p_to: today }, 'H1 المدّة الافتراضية آخر 90 يوماً');
      t.eq(textOf('history-period'), `من ${fmtDayText(m.addDays(today, -89))} إلى ${fmtDayText(today)}`, 'H1 والمدّة مكتوبة');
      t.eq(textOf('history-totals'), 'الدفعات المرحَّلة: 2 · الناتج: 2,005 كغم', 'H1 سطر المجموع: المرحَّلة وحدها');
      t.same(tableHeaders('سجلّ «علف بادئ»'), ['التاريخ', 'الحدث', 'التفاصيل', 'الناتج (كغم)'], 'H1 الأعمدة');
      const rows = tableRows('سجلّ «علف بادئ»') ?? [];
      t.same(
        rows.map((row) => [row[0], row[1], row[3]]),
        [
          ['09/11/2026', 'تعديل الخلطةنسخة 4', '—'],
          ['09/11/2026', 'إنتاجPD-2026-0011', '1,010'],
          ['05/11/2026', 'إنتاجPD-2026-0010', '995'],
          ['01/11/2026', 'تعديل الخلطةنسخة 3', '—'],
          ['20/10/2026', 'إنتاجPD-2026-0008ملغى', '1,000'],
          ['01/10/2026', 'إنشاء الخلطةنسخة 1', '—'],
        ],
        'H1 الأحداث الأحدث أوّلاً، والتعديل فوق إنتاج يومه، والملغى بعلامته',
      );
      t.eq(rows[0]?.[2], 'أُضيف: برمكسحُذف: كاز المولّدةمن الإنتاج PD-2026-0011بيد علي', 'H1 تعديل الخلطة: ما أُضيف وحُذف والدفعة التي حُفظت منها ومن فعّلها');
      t.eq(rows[1]?.[2], 'ذرة صفراء 600 كغم، كسبة صويا 360 كغم، زيت 20 لتراً، ملح 21.6 كغم، برمكس 10 كغمحُفظ في الخلطة (نسخة 4).بيد علي', 'H1 إنتاج حُفظ في الخلطة: موادّه وكمياتها');
      t.eq(rows[2]?.[2], 'ذرة صفراء 600 كغم، كسبة صويا 360 كغم، زيت 20 لتراً، ملح 21.6 كغم، برمكس 1 كغملهذه المرّة: أُضيف برمكس · لهذه المرّة: لم يُستعمل كاز المولّدةملاحظة: أكملنا الطنّ بالبرمكسبيد سعد', 'H1 إنتاج لهذه المرّة: ما أُضيف وما لم يُستعمل والملاحظة');
      t.same([rows[3]?.[2], rows[5]?.[2]], ['حُذف: حجر الكلسبيد علي', 'الموادّ: ذرة صفراء، كسبة صويا، زيت، ملح، كاز المولّدة، حجر الكلس'], 'H1 تعديل بلا إضافة، وإنشاء الخلطة بموادّها');
      t.same(byAction('history-batch').map((n) => n.getAttribute('href')), ['/mill/batch/b-11', '/mill/batch/b-10', '/mill/batch/b-8'], 'H1 رقم كلّ دفعة رابط لصفحتها');
      t.eq(disabled(byAction('print-history')[0]), false, 'H1 «اطبع أو احفظ PDF»');
      // جدول الموادّ فوق السجلّ: بلا كمية ولا حصّة، ونقطة لكلّ مادّة داخل الكتلة.
      t.same(tableHeaders('موادّ الخلطة بترتيبها'), ['#', 'المادّة', 'النوع', 'داخل الكتلة'], 'H1 بطاقة الخلطة: # | المادّة | النوع | داخل الكتلة');
      t.same((tableRows('موادّ الخلطة بترتيبها') ?? []).map((row) => [row[1], row[3]]).at(-1), ['كاز المولّدة', 'خارج الكتلة'], 'H1 والكاز «خارج الكتلة»');
      t.same(byAction('dot').map((n) => n.getAttribute('data-slot')), ['0', '1', '2', '3', '4'], 'H1 ونقطة لون لكلّ مادّة داخل الكتلة');
    });
    await step('H2 المدّة', async () => {
      const { rpcLog } = recipeSetup();
      await mount('/mill/recipe/r-1');
      const today = m.localDay();
      type(byAction('history-from')[0], fmtDayText(m.addDays(today, -366)));
      await settle();
      t.same([textOf('history-period-problem'), named(rpcLog, 'recipe_history').length], ['المدّة أطول من سنة (366 يوماً): اختر مدّة أقصر.', 1], 'H2 أطول من 366 يوماً: يُقال ولا يُطلب');
      type(byAction('history-from')[0], fmtDayText(m.addDays(today, 1)));
      await settle();
      t.eq(textOf('history-period-problem'), 'أوّل المدّة بعد آخرها.', 'H2 أوّلها بعد آخرها');
      type(byAction('history-from')[0], fmtDayText(m.addDays(today, -365)));
      await settle();
      t.same([byAction('history-period-problem').length, named(rpcLog, 'recipe_history').at(-1)?.p_from], [0, m.addDays(today, -365)], 'H2 366 يوماً بالضبط: تُطلب');
    });
    await step('H3 فشل السجلّ', async () => {
      recipeSetup(() => {
        throw refused('period_too_long');
      });
      await mount('/mill/recipe/r-1');
      t.ok(text().includes(F.refusals.period_too_long.hint) && byAction('recipe-history').length === 1, 'H3 رفض القارئ يُقال بتلميحه، والصفحة باقية');
    });

    // ── W: «رصيد العلف» قائمة واحدة بترتيب العلائق ────────────────────────────────────────────────────────────────
    const feedRow = (itemId, name, available) => ({
      item_id: itemId, name, kind: 'feed', base_unit: 'kg', tracks_expiry: false, min_qty: null, archived: false, category_id: null, category_name: null, barcode: null,
      available, expired: '0.000', near_expiry: '0.000', below_min: false, chick_age_hours: null, old_chicks: '0.000',
    });
    const feedWarehouse = { id: 'w-feed', name: 'رصيد العلف', kind: 'feed', division_id: 'd-mill', division_kind: 'feed_mill', archived: false, has_balance: true };
    // ترتيب الخادم بالاسم المطبَّع، بصفحتين: «علف بادئ» ثمّ «علف تجريبي» (منتج خلطة محذوفة) ثمّ «علف دواجن قديم»، ثمّ «علف ناهٍ» و«مركّز بروتين».
    const PAGE1 = [feedRow('f-1', 'علف بادئ 21٪', '1010.000'), feedRow('f-9', 'علف تجريبي', '0.000'), feedRow('f-old', 'علف دواجن قديم', '250.000')];
    const PAGE2 = [feedRow('f-2', 'علف ناهٍ 19٪', '0.000'), feedRow('f-x', 'مركّز بروتين', '0.000')];
    const feedCard = (over = {}) => ({
      id: 'w-feed', name: 'رصيد العلف', kind: 'feed', siteId: 's-mill', siteName: 'المعمل', siteKind: 'mill', divisionId: 'd-mill', divisionKind: 'feed_mill',
      itemsCount: 5, belowMinimum: 0, nearExpiry: 0, expired: 0, stockValue: 0n, saleValue: 0n, expectedProfit: 0n, itemsUnpriced: 0, ...over,
    });
    const feedSetup = () =>
      fresh(MANAGER, {
        rpcs: {
          stock_on_hand: (args) =>
            args.p_after === null
              ? { warehouse: feedWarehouse, as_of: '2026-11-10T08:00:00Z', today: '2026-11-10', rows: PAGE1, next: { name: 'علف دواجن قديم', id: 'f-old' }, total: 5 }
              : { warehouse: feedWarehouse, as_of: '2026-11-10T08:00:00Z', today: '2026-11-10', rows: PAGE2, next: null, total: null },
          recipes_overview: () => clone(F.recipes_overview.materials_only),
        },
        calls: {
          loadStoresOverview: () => ({ today: '2026-11-10', canManage: true, canCreateItem: false, rows: [feedCard(), feedCard({ id: 'w-raw', name: 'مخزن المواد الأوّلية', kind: 'raw' })], sites: [] }),
          loadOrgSetup: () => ({ divisions: [], sites: [], warehouses: [], packTypes: [], itemCategories: [], expenseCategories: [] }),
          loadStockOnHand: () => m.inventoryRepo.parseStockBoard({ warehouse: feedWarehouse, as_of: '2026-11-10T08:00:00Z', rows: PAGE1, next: { name: 'علف دواجن قديم', id: 'f-old' }, total: 5 }),
        },
      });
    await step('W1 رصيد العلف', async () => {
      const { rpcLog } = feedSetup();
      await mount('/inventory/store/w-feed');
      t.same(
        named(rpcLog, 'stock_on_hand').map((args) => [args.p_warehouse, args.p_after]),
        [['w-feed', null], ['w-feed', { name: 'علف دواجن قديم', id: 'f-old' }]],
        'W1 كلّ صفحات المخزن تُقرأ (لا الأولى وحدها)',
      );
      t.eq(named(rpcLog, 'recipes_overview').length, 1, 'W1 وترتيب العلائق من recipes_overview');
      const rows = tableRows('مواد قسم العلف بترتيب العلائق') ?? [];
      t.same(rows.map((row) => row[0]), ['علف بادئ 21٪', 'علف ناهٍ 19٪', 'علف تجريبي', 'علف دواجن قديم', 'مركّز بروتين'], 'W1 منتجات العلائق بترتيب العلائق (المشترك مرّة، والمحذوفة لا)، ثمّ بقيّة العلف بالاسم');
      t.same(rows.map((row) => row[1]), ['1,010.000', '0.000', '0.000', '250.000', '0.000'], 'W1 والرصيد الصفري ظاهر (عمود الكيلو بثلاث مراتب كبقيّة المخازن)');
      t.same([byAction('toggle-section').length, text().includes('دون تصنيف')], [1, false], 'W1 قائمة واحدة لا أقسام تصنيف');
      t.ok(text().includes('كلّ إنتاج المعمل يدخل هنا تلقائياً') && byAction('open-raw-store')[0]?.getAttribute('href') === '/inventory/store/w-raw', 'W1 «كلّ إنتاج المعمل يدخل هنا تلقائياً» ودليل المواد الأوّلية إلى مخزنها');
      t.same([byAction('more-stock').length, text().includes('5 من المجموع 5')], [0, true], 'W1 بلا «المزيد»: كلّ الموادّ معروضة');
      type(all().find((n) => n.localName === 'input' && n.getAttribute('type') === 'search'), 'ناهٍ');
      await settle();
      t.same((tableRows('مواد قسم العلف بترتيب العلائق') ?? []).map((row) => row[0]), ['علف ناهٍ 19٪'], 'W1 والبحث يصفّي القائمة');
    });
    t.same(
      m.feedSections([{ itemId: 'b', name: 'ب', barcode: null }, { itemId: 'a', name: 'أ', barcode: null }, { itemId: 'c', name: 'ج', barcode: null }], ['c', 'b', 'c']).map((section) => section.rows.map((row) => row.itemId)),
      [['c', 'b', 'a']],
      'W2 feedSections: ترتيب العلائق أوّلاً ثمّ ترتيب الخادم',
    );
    t.same(m.inventoryRepo.parseFeedOrder(clone(F.recipes_overview.materials_only)), ['f-1', 'f-2'], 'W2 ترتيب «رصيد العلف»: منتجات العلائق الظاهرة بترتيبها، والمشترك مرّة، والمحذوفة لا');

    // ── C: لوحة ألوان الموادّ ───────────────────────────────────────────────────────────────────────────────────
    {
      const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const oklch = (hex) => {
        const [r, g, b] = rgb(hex).map(linear);
        const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
        const mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
        const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
        const L = 0.2104542553 * l + 0.793617785 * mm - 0.0040720468 * s;
        const A = 1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s;
        const B = 0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s;
        const H = (Math.atan2(B, A) * 180) / Math.PI;
        return { L, C: Math.hypot(A, B), H: H < 0 ? H + 360 : H };
      };
      const luminance = (hex) => {
        const [r, g, b] = rgb(hex).map(linear);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const contrast = (a, b) => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      };
      // سطوح التطبيق: البطاقة والسطح الثاني بالوضعين (tokens.css).
      const SURFACES = ['#ffffff', '#eef5fc', '#101827', '#172133'];
      const hues = m.PALETTE.map((hex) => oklch(hex));
      t.ok(m.PALETTE.length >= 4 && new Set(m.PALETTE).size === m.PALETTE.length, `C لوحة ثابتة بألوان مختلفة (${m.PALETTE.join(' ')})`);
      // الأحمر والبرتقالي والكهرماني والأصفر والأخضر (درجات OKLCH من 0 إلى نحو 200، ومن 350) محجوزة للحالة: اللوحة من الأزرق إلى الأرجواني وحدها.
      t.ok(hues.every((c) => c.H >= 200 && c.H <= 345), `C لا لون حالة في اللوحة: الدرجات ${hues.map((c) => c.H.toFixed(0)).join('، ')}`);
      t.ok(hues.every((c) => c.C >= 0.1 && c.L >= 0.48 && c.L <= 0.67), 'C زاهية (تشبّع ≥ 0.1) بإضاءة تصلح للوضعين');
      t.ok(m.PALETTE.every((hex) => SURFACES.every((surface) => contrast(hex, surface) >= 3)) && SURFACES.every((surface) => contrast(m.OTHER_COLOR, surface) >= 3), 'C كلّ لون و«أخرى» بتباين ≥ 3:1 على سطوح التطبيق بالوضعين');
      t.ok(oklch(m.OTHER_COLOR).C < 0.05, 'C «أخرى» رمادية لا لون مادّة');
      t.same([...m.slotsOf([{ key: 'a', inBasis: true }, { key: 'k', inBasis: false }, { key: 'b', inBasis: true }, { key: 'a', inBasis: true }])], [['a', 0], ['k', null], ['b', 1]], 'C الموضع بالترتيب لما داخل الكتلة وحده، والمادّة مرّة');
    }

    // ── X: صفوف الإنتاج ومخالفة الخلطة (دوالّ الشاشة) ────────────────────────────────────────────────────────────────
    {
      const form = m.repo.parseProductionForm(clone(FORM));
      const rows = m.produceRows(form.materials, { texts: { 'i-corn': '590' }, removed: ['i-diesel'], extras: [{ itemId: 'i-premix', name: 'برمكس', kind: 'additive', unit: 'kg', density: null, text: '' }], topUp: { itemId: 'i-premix', name: 'برمكس', unit: 'kg', added: 10_000n, target: 1_000_000n, gap: 10_000n, created: true } });
      t.same(rows.map((row) => [row.itemId, row.qty, row.mass, row.fromRecipe]), [['i-corn', 590_000n, 590_000n, true], ['i-soy', 360_000n, 360_000n, true], ['i-oil', 20_000n, 18_400n, true], ['i-salt', 21_600n, 21_600n, true], ['i-premix', 10_000n, 10_000n, false]], 'X الصفوف: المكتوب فوق المقترح، والمُزال خارجها، والمضاف بإكماله في آخرها');
      t.same([m.materialsDiffer(rows, form.materials), m.materialsDiffer([...form.materials].reverse(), form.materials)], [true, false], 'X المخالفة بمجموعة الموادّ لا بترتيبها');
    }
  } finally {
    if (root) {
      const mounted = root;
      root = null;
      try {
        mounted.unmount();
      } catch {
        // swallow-ok: تنظيف بعد فشل
      }
    }
    delete globalThis.__m4;
    restore();
  }
}
