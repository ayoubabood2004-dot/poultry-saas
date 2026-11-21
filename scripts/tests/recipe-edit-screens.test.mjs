// «تعديل الخلطة» و«احذف» على بطاقتها (0028، كلمة الزبون 2026-11-15: لا خيار تعديل في المعمل غير «خلطة جديدة»، وتعديل الخلطة لا يُحفظ إلّا بتفعيله
// نسخةً جديدة والقديمة لا تُحذف، والتعديل والحذف أهمّ ما في الخلطات): react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل MillRoutes الحقيقية،
// وrepo المعمل الحقيقي (المحلّل وبناء النداء) على core بديل يسجّل كلّ نداء ويجيب بأشكال العقد (عقد 0028 §D: edit_recipe ونتيجته ومعها changed؛
// وأجوبة recipe_detail وrecipes_overview من fixtures/mill4-contract.json)، وقراءة المادّة وبطاقات المواد والجلسة والتنبيه بدائل. كلّ حالة تفشل على
// الشفرة قبل 0028 (8acb23a):
// P محلّل edit_recipe وصرامته؛ Q طلب edit_recipe حرفاً؛ C «عدّل» و«احذف» على بطاقة المعمل لكلّ دور، و«عدّل» يفتح الشاشة؛ D «احذف» من البطاقة: التأكيد،
// ونسخة صفّ الخلطة تُقرأ الآن ثمّ الأرشفة بها، والفشل داخل التأكيد؛ E شاشة التعديل تبدأ بالمفعَّلة (وتقرؤها إن رجعت غيرها) وباسمها ومنتجها، وجملة
// المسوّدة، والرجوع، ولمن هي؛ R الترتيب والحذف والإضافة وطلب edit_recipe حرفاً، والنجاح و«لا تغيير» والانتقال؛ F النتيجة المجهولة: التجميد والإعادة
// بالطلب نفسه، ومرجع جديد بعد رفض أكيد؛ X recipe_changed: تُقرأ الخلطة ويبقى ما اختاره المستخدم واسمه والمفعَّلة الجديدة شرطاً؛ M ما يمنع الحفظ؛
// K صفحة الخلطة: «عدّل الخلطة» يفتح الشاشة ولا ينشئ مسوّدة، ولو كانت للخلطة مسوّدة.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const F = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'mill4-contract.json'), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const real = (name) => JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', `${name}.ts`));
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const routed = (file, names) => `export * from ${real(file)}; ${names.map((n) => `export const ${n} = (...a) => globalThis.__re.call('${n}', a);`).join(' ')}`;
const STUBS = {
  inventory: routed('inventory', ['loadItem', 'listItems', 'createItem', 'findItemTwins', 'updateItem']),
  purchases: routed('purchases', ['loadItemsOverview']),
  session: 'export const useSession = () => globalThis.__re.session; export const sessionStore = { get: () => globalThis.__re?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__re.toasts.push(spec); }; export function Toaster() { return null; }',
};
const stubs = {
  name: 're-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/(inventory|purchases)$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 're-stub' }));
    b.onLoad({ filter: /.*/, namespace: 're-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
  },
};
// core بديل لملفّات repo: call يسجّله __re.rpc (المحلّل الحقيقي يقرأ الجواب)، وsend يبني سلسلة PostgREST مسجَّلة يجيبها __re.tables باسم الجدول.
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__re.rpc(fn, args);
export const send = async (make) => ({ result: await make(globalThis.__re.db()), wasOnline: true });
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
  name: 're-core',
  setup(b) {
    b.onResolve({ filter: /^\.\/core$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('src/lib/repo/') ? { path: 'core', namespace: 're-core' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 're-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
  },
};

async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    "export { default as MillRoutes } from './src/pages/mill/MillRoutes.tsx';",
    "export * as repo from './src/lib/repo/mill.ts';",
    "export { isWindowDirty } from './src/lib/pwa/dirty.ts';",
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
const h1Text = () => all().find((n) => n.localName === 'h1')?.textContent ?? null;
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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
/** صفوف جدول بعنوانه (caption): نصّ كلّ خلية. */
const tableRows = (caption) => {
  const table = all().find((n) => n.localName === 'table' && descendants(n).some((c) => c.localName === 'caption' && c.textContent.startsWith(caption)));
  const tbody = table ? descendants(table).find((n) => n.localName === 'tbody') : null;
  return tbody ? tbody.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent)) : null;
};
/**
 * وعد يُحلّ من خارجه: طلب ينتظر حتّى يُفحص ما تعرضه الشاشة أثناءه. رفضه بلا مستمع (شفرة مكسورة لم ترسل الطلب) لا يُسقط عمليّة الفحوص كلّها: يُعدّ
 * مُعالَجاً هنا، والشاشة التي أرسلت الطلب تستلم الرفض كما هو.
 */
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  promise.catch(() => {});
  return { promise, resolve, reject };
};
/** بطاقة خلطة في المعمل برابط اسمها، وما فيها بفعله. */
const cardOf = (id) => all().find((n) => n.localName === 'article' && descendants(n).some((c) => c.getAttribute('data-action') === 'open-recipe' && c.getAttribute('href') === `/mill/recipe/${id}`));
const inCard = (id, action) => {
  const card = cardOf(id);
  return card ? descendants(card).filter((n) => n.getAttribute('data-action') === action) : [];
};
const backOf = (action) => {
  const node = byAction(action)[0];
  return node ? [node.getAttribute('href'), node.textContent] : null;
};
/** موادّ جدول شاشة التعديل بأسمائها بالترتيب. */
const rowNames = () => (tableRows('موادّ الخلطة بعد التعديل') ?? []).map((row) => row[1]);
const nameInput = () => byAction('edit-name')[0];
const saveButton = () => byAction('save-recipe-edit')[0];
/** ما يمنع الحفظ تحت الزرّ، سبباً سبباً. */
const missingOf = () => {
  const box = byAction('edit-missing')[0];
  return box ? descendants(box).filter((n) => n.localName === 'li').map((n) => n.textContent) : [];
};

const ws = (role, over = {}) => ({
  userId: `u-${role}`, orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [],
  divisions: ['feed_mill'], canSeeCost: ['owner', 'manager', 'accountant'].includes(role), canSeeAccounts: ['owner', 'manager', 'accountant'].includes(role), canSeeSales: true,
  invites: [], subscription: 'active', confirmedAt: 1, ...over,
});
const OWNER = { status: 'ready', workspace: ws('owner') };
const MANAGER = { status: 'ready', workspace: ws('manager') };
const OPERATOR = { status: 'ready', workspace: ws('mill_operator') };
const ACCOUNTANT = { status: 'ready', workspace: ws('accountant') };

// ── الأجوبة ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// المعمل: خلطات العقد (r-1 وr-2 وr-3 ظاهرة، وr-9 محذوفة)، ومعها خلطة ظاهرة بلا نسخة مفعَّلة (مسوّدة وحدها).
const NO_ACTIVE = {
  id: 'r-4', name: 'علف تجربة', note: null, archived: false, version: 1,
  output_item: { id: 'f-2', name: 'علف ناهٍ 19٪', base_unit: 'kg', kind: 'feed' },
  active: null, draft: { id: 'v-41', version_no: 1, basis_kg: null, lines: 2, version: 1 }, batches: 0, last_batch: null, money: { expected_cost_per_kg: null },
};
const OVERVIEW = () => {
  const value = clone(F.recipes_overview.materials_only);
  value.recipes.splice(3, 0, clone(NO_ACTIVE));
  return value;
};
// recipe_detail للخلطة r-1: المفعَّلة v-4 بموادّها الستّ (ذرة، صويا، زيت باللتر، ملح، برمكس، كاز المولّدة خارج الكتلة).
const ACTIVE = () => clone(F.recipe_detail.materials_only);
// ومعها مسوّدة قديمة v-5 (من «عدّل الخلطة» القديم) بموادّ غيرها: selected النسخة المطلوبة.
const DRAFT_V5 = { id: 'v-5', version_no: 5, status: 'draft', basis_kg: null, materials_only: true, activated_at: null, version: 1 };
const withDraft = (selected) => {
  const value = ACTIVE();
  value.versions = [DRAFT_V5, ...value.versions];
  if (selected === 'v-5') {
    value.selected = { ...DRAFT_V5, note: null };
    value.lines = [{ ...value.lines[0], id: 'l-51' }, { ...value.lines[0], id: 'l-52', line_no: 2, item_id: 'i-lime', item_name: 'حجر الكلس' }];
  }
  return value;
};
// خلطة تغيّرت من جهاز آخر: المفعَّلة الآن v-6 بمادّتين، وv-4 مقاعدة.
const CHANGED = () => {
  const value = ACTIVE();
  const v6 = { id: 'v-6', version_no: 6, status: 'active', basis_kg: null, materials_only: true, activated_at: '2026-11-16T07:00:00Z', version: 1 };
  value.versions = [v6, ...value.versions.map((version) => (version.id === 'v-4' ? { ...version, status: 'retired' } : version))];
  value.selected = { ...v6, note: null };
  value.lines = value.lines.slice(0, 2);
  return value;
};
const CHANGED_HINT = 'تغيّرت هذه الخلطة من نافذة أو جهاز آخر بعد أن قرأتها: قُرئت من جديد، فراجعها واحفظ مرّة أخرى.';
const edited = (args, over = {}) => ({ recipe_id: args.p_recipe, version_id: 'v-7', version_no: 7, name: args.p_name, lines: args.p_lines.length, changed: true, ...over });

const itemRow = (id, name, kind, baseUnit, density = null) => ({ id, version: 1, archived: false, name, nameNorm: name, categoryId: null, kind, baseUnit, density, pieceMassKg: null, tracksExpiry: false, scaleStep: 100n, minQty: null, barcode: null, altCodes: [] });
const ITEMS = { 'i-oil': itemRow('i-oil', 'زيت', 'raw', 'L', 9_200n), 'i-diesel': itemRow('i-diesel', 'كاز المولّدة', 'fuel', 'L', 8_500n) };
const overviewItem = (id, name, kind, baseUnit, onHand) => ({ id, name, kind, baseUnit, onHand, purchased: 0n, lastPurchaseOn: null, unpricedCount: 0, money: null });
const ITEMS_OVERVIEW = {
  today: '2026-11-16', canRecord: true, canAddItem: true,
  items: [
    overviewItem('i-corn', 'ذرة صفراء', 'raw', 'kg', 20_000_000n),
    overviewItem('i-soy', 'كسبة صويا', 'raw', 'kg', 300_000n),
    overviewItem('i-oil', 'زيت', 'raw', 'L', 500_000n),
    overviewItem('i-salt', 'ملح', 'additive', 'kg', 50_000n),
    overviewItem('i-premix', 'برمكس', 'additive', 'kg', 40_000n),
    overviewItem('i-diesel', 'كاز المولّدة', 'fuel', 'L', 100_000n),
    overviewItem('i-lime', 'حجر الكلس', 'raw', 'kg', 200_000n),
    overviewItem('i-bag', 'كيس', 'packaging', 'pc', 900_000n),
  ],
};
const ACTIVE_NAMES = ['ذرة صفراء', 'كسبة صويا', 'زيت', 'ملح', 'برمكس', 'كاز المولّدة'];
const DELETED_TOAST = 'حُذفت الخلطة «علف بادئ» من المعمل.';

export default async function (t) {
  const restore = installDom();
  let root = null;
  try {
    const m = await bundle();
    const fresh = (session, { rpcs = {}, calls = {}, tables = {} } = {}) => {
      const rpcLog = [];
      const callLog = [];
      globalThis.__re = {
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
      return { rpcLog, callLog };
    };
    const named = (log, name) => log.filter(([n]) => n === name).map(([, args]) => args);
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
        globalThis.__re.location = `${location.pathname}${location.search}`;
        return m.h(m.Routes, { key: location.pathname }, m.h(m.Route, { path: '/mill/*', element: m.h(m.MillRoutes) }), m.h(m.Route, { path: '*', element: null }));
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

    // ── P: محلّل edit_recipe وصرامته ─────────────────────────────────────────────────────────────────────────────────
    const EDITED = { recipe_id: 'r-1', version_id: 'v-7', version_no: 7, name: 'علف بادئ', lines: 5, changed: true };
    await step('P edit_recipe', async () => {
      t.same(m.repo.parseEditedRecipe(clone(EDITED)), { recipeId: 'r-1', versionId: 'v-7', versionNo: 7, name: 'علف بادئ', lines: 5, changed: true }, 'P جواب edit_recipe بمفاتيحه الستّ ومعها changed');
      t.eq(m.repo.parseEditedRecipe({ ...clone(EDITED), changed: false }).changed, false, 'P changed = false يُقرأ (الاسم والموادّ كالمفعَّلة فلم يُكتب شيء)');
      const broken = (patch) =>
        shape(() => {
          const value = clone(EDITED);
          patch(value);
          m.repo.parseEditedRecipe(value);
        });
      t.same(
        [
          broken((v) => delete v.changed),
          broken((v) => (v.changed = 'true')),
          broken((v) => delete v.recipe_id),
          broken((v) => (v.version_id = '')),
          broken((v) => (v.version_no = '7')),
          broken((v) => (v.version_no = 0)),
          broken((v) => (v.lines = 0)),
          broken((v) => (v.lines = 1.5)),
          broken((v) => (v.name = null)),
          shape(() => m.repo.parseEditedRecipe([clone(EDITED)])),
        ],
        ['mill_shape:changed', 'mill_shape:changed', 'mill_shape:recipe_id', 'mill_shape:version_id', 'mill_shape:version_no', 'mill_shape:version_no', 'mill_shape:lines', 'mill_shape:lines', 'mill_shape:name', 'mill_shape:edit_recipe'],
        'P edit_recipe صارم: changed منطقيّ إلزاميّ، والمعرّفان والاسم نصوص غير فارغة، ورقم النسخة وعدد الموادّ صحيحان موجبان، والجواب كائن',
      );
    });

    // ── Q: طلب edit_recipe من repo الحقيقي ─────────────────────────────────────────────────────────────────────────────
    await step('Q edit_recipe', async () => {
      const { rpcLog } = fresh(MANAGER, { rpcs: { edit_recipe: () => clone(EDITED) } });
      const saved = await m.repo.editRecipe({ recipeId: 'r-1', expectedActive: 'v-4', name: '  علف بادئ ممتاز  ', lines: [{ itemId: 'i-soy' }, { itemId: 'i-corn' }], clientRef: 'ref-1' });
      await m.repo.editRecipe({ recipeId: 'r-4', expectedActive: null, name: 'علف تجربة', lines: [{ itemId: 'i-corn' }], clientRef: 'ref-2' });
      t.same(
        named(rpcLog, 'edit_recipe'),
        [
          { p_recipe: 'r-1', p_expected_active: 'v-4', p_name: 'علف بادئ ممتاز', p_lines: [{ item_id: 'i-soy' }, { item_id: 'i-corn' }], p_client_ref: 'ref-1' },
          { p_recipe: 'r-4', p_expected_active: null, p_name: 'علف تجربة', p_lines: [{ item_id: 'i-corn' }], p_client_ref: 'ref-2' },
        ],
        'Q edit_recipe: المعاملات الخمس بأسمائها، والاسم بلا فراغ طرفيه، والموادّ بترتيبها بلا كميات، وخلطة بلا مفعَّلة شرطها null',
      );
      t.same([saved.versionId, saved.changed], ['v-7', true], 'Q والجواب بمحلّله');
    });

    // ── C: «عدّل» و«احذف» على بطاقة المعمل ─────────────────────────────────────────────────────────────────────────────
    const millSetup = (session, { detail = () => ACTIVE(), tables = {} } = {}) =>
      fresh(session, {
        rpcs: { recipes_overview: () => OVERVIEW(), productions_overview: () => ({ drafts: [], rows: [], total: 0 }), recipe_detail: detail },
        calls: { loadItemsOverview: () => ITEMS_OVERVIEW, loadItem: (id) => ITEMS[id] ?? null },
        tables,
      });
    await step('C الأدوار', async () => {
      const seen = {};
      for (const [role, session] of [['owner', OWNER], ['manager', MANAGER], ['mill_operator', OPERATOR], ['accountant', ACCOUNTANT]]) {
        millSetup(session);
        await mount('/mill');
        seen[role] = [byAction('edit-recipe').length, byAction('delete-recipe-card').length, byAction('produce').length];
        await unmount();
      }
      t.same(
        seen,
        { owner: [4, 4, 3], manager: [4, 4, 3], mill_operator: [4, 4, 3], accountant: [4, 4, 3] },
        'C «عدّل» و«احذف» و«أنتج» على كلّ خلطة ظاهرة (والتي بلا مفعَّلة أيضاً) لكلّ دور (0034)',
      );
    });
    await step('C البطاقة', async () => {
      millSetup(MANAGER);
      await mount('/mill');
      const row = inCard('r-1', 'card-actions')[0];
      const order = row ? descendants(row).map((n) => n.getAttribute('data-action')).filter((action) => ['produce', 'edit-recipe', 'delete-recipe-card'].includes(action)) : null;
      t.same(
        [order, inCard('r-1', 'edit-recipe')[0]?.textContent, inCard('r-1', 'delete-recipe-card')[0]?.textContent, inCard('r-1', 'edit-recipe')[0]?.getAttribute('aria-label'), inCard('r-1', 'delete-recipe-card')[0]?.getAttribute('aria-label')],
        [['produce', 'edit-recipe', 'delete-recipe-card'], 'عدّل', 'احذف', 'عدّل «علف بادئ»', 'احذف «علف بادئ»'],
        'C «عدّل» و«احذف» بجانب «أنتج» في صفّ البطاقة، وكلّ زرّ يسمّي خلطته لقارئ الشاشة',
      );
      t.same(
        [inCard('r-4', 'edit-recipe').length, inCard('r-4', 'delete-recipe-card').length, inCard('r-4', 'produce').length, text().includes('اضغط «عدّل» واختر موادّها ثمّ «احفظ التعديل» لتُنتج بها.')],
        [1, 1, 0, true],
        'C خلطة بلا مفعَّلة: «عدّل» و«احذف» بلا «أنتج»، والجملة تدلّ على «عدّل» (حفظه يفعّلها) لا على مسوّدة تُفعَّل',
      );
      await click(inCard('r-1', 'edit-recipe')[0]);
      t.same([globalThis.__re.location, h1Text()], ['/mill/recipe/r-1/edit?back=mill', 'تعديل الخلطة «علف بادئ»'], 'C «عدّل» يفتح شاشة تعديل الخلطة، ورجوعها إلى المعمل');
    });

    // ── D: «احذف» من البطاقة ─────────────────────────────────────────────────────────────────────────────────────────
    await step('D الحذف', async () => {
      const writes = [];
      const { rpcLog } = millSetup(MANAGER, {
        // نسخة صفّ الخلطة الآن 7 (تغيّرت بعد قراءة المعمل، وفيه 4): الأرشفة بالمقروء الآن.
        detail: () => ({ ...ACTIVE(), version: 7 }),
        tables: {
          recipes: (query) => {
            writes.push(query.ops);
            return [{ id: 'r-1' }];
          },
        },
      });
      await mount('/mill');
      await click(inCard('r-1', 'delete-recipe-card')[0]);
      t.same(
        [
          text().includes('حذف الخلطة «علف بادئ»؟'),
          text().includes('تختفي «علف بادئ» من المعمل ولا يُنتَج بها بعد الآن، وتبقى دفعاتها السابقة في سجلّ الإنتاج. وتعيدها من صفحتها متى شئت.'),
          textOf('confirm-delete-recipe'),
          named(rpcLog, 'recipe_detail').length,
          writes.length,
        ],
        [true, true, 'احذفها', 0, 0],
        'D التأكيد يسمّي الخلطة وأثر حذفها كما في صفحتها و«احذفها»، ولا قراءة ولا كتابة قبله',
      );
      await click(byAction('confirm-delete-recipe')[0]);
      const ops = writes[0] ?? [];
      const update = ops.find(([op]) => op === 'update');
      t.same(
        [named(rpcLog, 'recipe_detail'), ops.filter(([op]) => op === 'eq')],
        [[{ p_id: 'r-1', p_version: null }], [['eq', 'id', 'r-1'], ['eq', 'version', 7]]],
        'D نسخة صفّ الخلطة تُقرأ الآن (7، لا 4 من قراءة المعمل)، ثمّ الأرشفة القائمة مشروطة بها',
      );
      t.ok(typeof update?.[1]?.archived_at === 'string' && !Number.isNaN(Date.parse(update[1].archived_at)), 'D الأرشفة تكتب archived_at');
      t.same(
        [byAction('confirm-delete-recipe').length, globalThis.__re.toasts.at(-1)?.title, named(rpcLog, 'recipes_overview').length],
        [0, DELETED_TOAST, 2],
        'D ثمّ يُغلق التأكيد ويقول إنّها حُذفت ويُقرأ المعمل من جديد',
      );
    });
    await step('D الفشل داخل التأكيد', async () => {
      let attempts = 0;
      const { rpcLog } = millSetup(MANAGER, {
        tables: {
          recipes: () => {
            attempts += 1;
            return attempts === 1 ? [] : [{ id: 'r-1' }];
          },
        },
      });
      await mount('/mill');
      await click(inCard('r-1', 'delete-recipe-card')[0]);
      await click(byAction('confirm-delete-recipe')[0]);
      t.same(
        [textOf('delete-recipe-failed'), byAction('confirm-delete-recipe').length, globalThis.__re.toasts.length, named(rpcLog, 'recipes_overview').length],
        ['لم يُحفظ لم يغيّر الخادم أيّ صفّ. حدّث الشاشة وتأكّد من صلاحيتك.', 1, 0, 1],
        'D تغيّر الصفّ بين القراءة والكتابة (صفر صفوف): الفشل يُقال داخل التأكيد ولا يُغلق',
      );
      await click(byAction('confirm-delete-recipe')[0]);
      t.same(
        [named(rpcLog, 'recipe_detail').length, attempts, byAction('confirm-delete-recipe').length, globalThis.__re.toasts.at(-1)?.title],
        [2, 2, 0, DELETED_TOAST],
        'D والمحاولة الثانية تقرأ النسخة من جديد وتحذف',
      );
    });
    await step('D القراءة الفاشلة والمحذوفة أصلاً والتراجع', async () => {
      const writes = [];
      millSetup(MANAGER, {
        detail: () => {
          throw new m.RejectedError('recipe_not_found', 'لم تعد هذه الخلطة موجودة.');
        },
        tables: { recipes: (query) => writes.push(query) && [{ id: 'r-1' }] },
      });
      await mount('/mill');
      await click(inCard('r-1', 'delete-recipe-card')[0]);
      await click(byAction('confirm-delete-recipe')[0]);
      t.same([textOf('delete-recipe-failed'), writes.length, byAction('confirm-delete-recipe').length], ['لم تعد هذه الخلطة موجودة.', 0, 1], 'D فشل قراءة النسخة: بتلميحه داخل التأكيد ولا كتابة');
      await unmount();
      const { rpcLog } = millSetup(MANAGER, { detail: () => ({ ...ACTIVE(), archived: true }), tables: { recipes: (query) => writes.push(query) && [{ id: 'r-1' }] } });
      await mount('/mill');
      await click(inCard('r-1', 'delete-recipe-card')[0]);
      await click(byAction('confirm-delete-recipe')[0]);
      t.same(
        [writes.length, globalThis.__re.toasts.at(-1)?.title, named(rpcLog, 'recipes_overview').length],
        [0, DELETED_TOAST, 2],
        'D محذوفة من نافذة أخرى: لا تُكتب أرشفتها ثانيةً، وتُقال محذوفة ويُقرأ المعمل',
      );
      await click(inCard('r-2', 'delete-recipe-card')[0]);
      await click(all().find((n) => n.localName === 'button' && n.textContent === 'لا، تراجع'));
      t.same([byAction('confirm-delete-recipe').length, named(rpcLog, 'recipe_detail').length], [0, 1], 'D «لا، تراجع» يُغلق التأكيد بلا قراءة ولا كتابة');
    });

    // ── E: شاشة التعديل تبدأ بالمفعَّلة ───────────────────────────────────────────────────────────────────────────────
    const editSetup = (session, { detail = () => ACTIVE(), edit = (args) => edited(args), items = ITEMS } = {}) =>
      fresh(session, {
        rpcs: { recipe_detail: detail, recipes_overview: () => OVERVIEW(), edit_recipe: edit, recipe_history: () => clone(F.recipe_history.period) },
        calls: { loadItemsOverview: () => ITEMS_OVERVIEW, loadItem: (id) => items[id] ?? null },
      });
    await step('E المفعَّلة', async () => {
      const { rpcLog, callLog } = editSetup(MANAGER);
      await mount('/mill/recipe/r-1/edit?back=mill');
      t.same(
        [h1Text(), nameInput()?.value, textOf('edit-output'), rowNames()],
        ['تعديل الخلطة «علف بادئ»', 'علف بادئ', 'تنتج: علف بادئ 21٪', ACTIVE_NAMES],
        'E العنوان، والاسم في خانته، والمنتج للقراءة، وموادّ النسخة المفعَّلة بترتيبها',
      );
      t.same([named(rpcLog, 'recipe_detail'), named(rpcLog, 'recipes_overview').length], [[{ p_id: 'r-1', p_version: null }], 1], 'E recipe_detail بلا نسخة (رجعت المفعَّلة: لا قراءة ثانية)، وأسماء الخلطات من recipes_overview');
      t.same(
        named(callLog, 'loadItem')
          .map(([id]) => id)
          .sort(),
        ['i-diesel', 'i-oil'],
        'E كثافة كلّ سائل في الخلطة تُقرأ كما يقرؤها «اختر» في البطاقات',
      );
      t.same(
        byAction('material-card')
          .filter((n) => n.getAttribute('aria-pressed') === 'true')
          .map((n) => n.getAttribute('data-item'))
          .sort(),
        ['i-corn', 'i-diesel', 'i-oil', 'i-premix', 'i-salt', 'i-soy'],
        'E بطاقات موادّ الخلطة مختارة',
      );
      t.same(
        [backOf('back-to-mill'), byAction('edit-draft-notice').length, disabled(saveButton()), textOf('save-recipe-edit'), byAction('edit-missing').length, m.isWindowDirty()],
        [['/mill', 'رجوع إلى المعمل'], 0, false, 'احفظ التعديل', 0, false],
        'E الرجوع إلى المعمل، ولا مسوّدة، و«احفظ التعديل» مفتوح بلا سبب يمنعه، والنافذة نظيفة قبل أيّ تغيير',
      );
    });
    await step('E رجعت غير المفعَّلة', async () => {
      // الخادم رجّع المسوّدة v-5 بلا نسخة مطلوبة وللخلطة مفعَّلة v-4: تُقرأ المفعَّلة وتبدأ الشاشة بموادّها لا بموادّ المسوّدة.
      const { rpcLog } = editSetup(MANAGER, { detail: (args) => withDraft(args.p_version ?? 'v-5') });
      await mount('/mill/recipe/r-1/edit');
      t.same(
        [named(rpcLog, 'recipe_detail'), rowNames()],
        [[{ p_id: 'r-1', p_version: null }, { p_id: 'r-1', p_version: 'v-4' }], ACTIVE_NAMES],
        'E تُقرأ المفعَّلة v-4 بعد ما رجع غيرها، والموادّ موادّها',
      );
      t.same(
        [textOf('edit-draft-notice'), backOf('back-to-recipe')],
        ['لهذه الخلطة تعديل سابق لم يُفعَّل (نسخة 5): حفظ هذا التعديل يحلّ محلّه.', ['/mill/recipe/r-1', 'رجوع إلى «علف بادئ»']],
        'E للخلطة مسوّدة: جملة تقول إنّ الحفظ يحلّ محلّها؛ وبلا ?back الرجوع إلى صفحة الخلطة',
      );
      await click(saveButton());
      t.same([named(rpcLog, 'edit_recipe')[0]?.p_expected_active, globalThis.__re.location], ['v-4', '/mill/recipe/r-1'], 'E الشرط المفعَّلة لا المسوّدة، وبعد الحفظ إلى صفحة الخلطة');
    });
    await step('E بلا مفعَّلة', async () => {
      const draftOnly = () => {
        const value = ACTIVE();
        value.versions = [{ id: 'v-1', version_no: 1, status: 'draft', basis_kg: null, materials_only: true, activated_at: null, version: 2 }];
        value.selected = { ...value.versions[0], note: null };
        value.lines = value.lines.slice(0, 2);
        return value;
      };
      const { rpcLog } = editSetup(MANAGER, { detail: draftOnly });
      await mount('/mill/recipe/r-1/edit');
      t.same([named(rpcLog, 'recipe_detail').length, rowNames()], [1, ['ذرة صفراء', 'كسبة صويا']], 'E خلطة بلا مفعَّلة: ما رجع (آخر نسخة) بلا قراءة ثانية');
      await click(saveButton());
      t.eq(named(rpcLog, 'edit_recipe')[0]?.p_expected_active, null, 'E وشرطها null: لا مفعَّلة قرأتها الشاشة');
    });
    await step('E لمن هي، والمحذوفة', async () => {
      editSetup(OPERATOR);
      await mount('/mill/recipe/r-1/edit');
      t.same([text().includes('تعديل الخلطات للمالك والمدير.'), byAction('save-recipe-edit').length], [false, 1], 'E مشغّل المعمل يعدّل الخلطة: «احفظ التعديل» (0034)');
      await unmount();
      editSetup(MANAGER, { detail: () => ({ ...ACTIVE(), archived: true }) });
      await mount('/mill/recipe/r-1/edit');
      t.same([text().includes('هذه الخلطة محذوفة من المعمل: أعِدها من صفحتها أوّلاً، ثمّ عدّلها.'), byAction('save-recipe-edit').length], [true, 0], 'E المحذوفة: «أعِدها أوّلاً» بلا «احفظ التعديل»');
    });

    // ── R: الترتيب والحذف والإضافة والطلب ─────────────────────────────────────────────────────────────────────────────
    await step('R التعديل والحفظ', async () => {
      const { rpcLog } = editSetup(MANAGER);
      await mount('/mill/recipe/r-1/edit?back=mill');
      await click(withId('line-down', 'i-corn'));
      await click(withId('remove-line', 'i-premix'));
      await click(byAction('material-card').find((n) => n.getAttribute('data-item') === 'i-lime'));
      await click(withId('line-up', 'i-lime'));
      type(nameInput(), '  علف بادئ ممتاز  ');
      await settle();
      t.same(
        [rowNames(), disabled(withId('line-up', 'i-soy')), disabled(withId('line-down', 'i-diesel')), m.isWindowDirty()],
        [['كسبة صويا', 'ذرة صفراء', 'زيت', 'ملح', 'حجر الكلس', 'كاز المولّدة'], true, true, true],
        'R «أخّر» و«احذف» واختيار بطاقة و«قدّم»: الجدول بالترتيب الجديد (الأوّل بلا «قدّم» والأخير بلا «أخّر»)، والنافذة «فيها ما لم يُحفظ»',
      );
      await click(saveButton());
      const sent = named(rpcLog, 'edit_recipe');
      t.same(
        sent.map((args) => [args.p_recipe, args.p_expected_active, args.p_name, args.p_lines]),
        [['r-1', 'v-4', 'علف بادئ ممتاز', ['i-soy', 'i-corn', 'i-oil', 'i-salt', 'i-lime', 'i-diesel'].map((item) => ({ item_id: item }))]],
        'R edit_recipe بالخلطة وشرط المفعَّلة المقروءة والاسم بلا فراغ طرفيه والموادّ بترتيب الجدول',
      );
      t.ok(UUID.test(sent[0]?.p_client_ref ?? ''), 'R ومرجع المحاولة من الجهاز');
      t.same(
        [globalThis.__re.toasts.at(-1)?.title, globalThis.__re.location, m.isWindowDirty()],
        ['حُفظ تعديل الخلطة «علف بادئ ممتاز»: موادّها الآن كما اخترت، وتُستعمل في الإنتاج من الآن.', '/mill', false],
        'R النجاح يقول ما حُفظ ويرجع إلى المعمل، والنافذة نظيفة',
      );
    });
    await step('R لا تغيير', async () => {
      const { rpcLog } = editSetup(MANAGER, { edit: (args) => edited(args, { version_id: 'v-4', version_no: 4, changed: false }) });
      await mount('/mill/recipe/r-1/edit');
      await click(saveButton());
      t.same(
        [named(rpcLog, 'edit_recipe')[0]?.p_lines.length, globalThis.__re.toasts.at(-1)?.title, globalThis.__re.location],
        [6, 'لا تغيير: الخلطة كما كانت.', '/mill/recipe/r-1'],
        'R الحفظ بلا تغيير (changed = false): «لا تغيير» ويرجع إلى صفحة الخلطة',
      );
    });

    // ── F: النتيجة المجهولة ──────────────────────────────────────────────────────────────────────────────────────────
    await step('F التجميد والإعادة', async () => {
      const { rpcLog } = editSetup(MANAGER, {
        edit: (args, n) => {
          if (n === 1) throw new m.UnknownOutcomeError();
          if (n === 2) throw new m.NetworkError();
          return edited(args);
        },
      });
      await mount('/mill/recipe/r-1/edit?back=mill');
      await click(withId('remove-line', 'i-premix'));
      await click(saveButton());
      t.same(
        [byAction('edit-frozen').length, byAction('retry-recipe-edit').length, byAction('save-recipe-edit').length, disabled(nameInput()), disabled(withId('remove-line', 'i-corn')), disabled(byAction('material-card')[0]), m.isWindowDirty(), globalThis.__re.location],
        [1, 1, 0, true, true, true, true, '/mill/recipe/r-1/edit?back=mill'],
        'F نتيجة مجهولة: الشاشة مجمَّدة و«أعد المحاولة» وحده، والحقول مقفولة، والنافذة «فيها ما لم يُحفظ»',
      );
      t.ok(textOf('edit-frozen') === 'لا نعرف إن حُفظ التعديل: أعد المحاولة قبل أيّ تغيير؛ لن يُحفظ مرّتين.أعد المحاولة', `F والجملة تقول ما العمل (${textOf('edit-frozen')})`);
      await click(byAction('retry-recipe-edit')[0]);
      t.same([byAction('retry-recipe-edit').length, text().includes('لم تصل الإعادة إلى الخادم: أعد المحاولة عند عودة الاتصال.')], [1, true], 'F إعادة لم تصل: تبقى مجمَّدة وتقول ذلك');
      await click(byAction('retry-recipe-edit')[0]);
      const sent = named(rpcLog, 'edit_recipe');
      t.same(
        [sent.length, JSON.stringify(sent[1]) === JSON.stringify(sent[0]), JSON.stringify(sent[2]) === JSON.stringify(sent[0]), sent[0]?.p_lines.length],
        [3, true, true, 5],
        'F كلّ إعادة بالطلب نفسه حرفاً (الشرط والاسم والموادّ والمرجع)',
      );
      t.same([globalThis.__re.location, m.isWindowDirty()], ['/mill', false], 'F ثمّ النتيجة: يرجع إلى المعمل والنافذة نظيفة');
    });
    await step('F في الطريق، ورفض بعد الإعادة', async () => {
      const held = deferred();
      const { rpcLog } = editSetup(MANAGER, {
        edit: (args, n) => {
          if (n === 1) return held.promise;
          if (n === 2) throw new m.RejectedError('item_archived', '«برمكس» محذوفة من القوائم: احذفها من الخلطة.');
          return edited(args);
        },
      });
      await mount('/mill/recipe/r-1/edit');
      const before = m.isWindowDirty();
      await click(saveButton());
      await click(saveButton());
      t.same(
        [before, m.isWindowDirty(), named(rpcLog, 'edit_recipe').length, disabled(saveButton())],
        [false, true, 1, true],
        'F الطلب في الطريق: النافذة «فيها ما لم يُحفظ»، والزرّ معطّل فنقرة ثانية لا ترسل',
      );
      held.reject(new m.UnknownOutcomeError());
      await settle();
      await click(byAction('retry-recipe-edit')[0]);
      t.same(
        [byAction('retry-recipe-edit').length, text().includes('«برمكس» محذوفة من القوائم: احذفها من الخلطة.'), disabled(nameInput())],
        [0, true, false],
        'F رفض أكيد بعد الإعادة (لم تُحفظ الأولى): يُفكّ التجميد ويُقال تلميح الخادم',
      );
      await click(withId('remove-line', 'i-premix'));
      await click(saveButton());
      const sent = named(rpcLog, 'edit_recipe');
      t.same(
        [sent.length, sent[1]?.p_client_ref === sent[0]?.p_client_ref, sent[2]?.p_client_ref === sent[0]?.p_client_ref, UUID.test(sent[2]?.p_client_ref ?? ''), sent[2]?.p_lines.length],
        [3, true, false, true, 5],
        'F الإعادة بالمرجع نفسه، والحفظ بعد الرفض الأكيد بمرجع جديد (الحمولة تغيّرت)',
      );
    });

    // ── X: recipe_changed ────────────────────────────────────────────────────────────────────────────────────────────
    await step('X تُقرأ من جديد وما اختاره المستخدم باقٍ', async () => {
      const reread = deferred();
      const { rpcLog } = editSetup(MANAGER, {
        detail: (_args, n) => (n === 1 ? ACTIVE() : reread.promise),
        edit: (args, n) => {
          if (n === 1) throw new m.RejectedError('recipe_changed', CHANGED_HINT);
          return edited(args);
        },
      });
      await mount('/mill/recipe/r-1/edit?back=mill');
      await click(withId('remove-line', 'i-premix'));
      type(nameInput(), 'علف بادئ 2');
      await settle();
      await click(saveButton());
      t.same(
        [textOf('edit-changed'), disabled(saveButton()), named(rpcLog, 'recipe_detail').length, rowNames().length],
        [`${CHANGED_HINT} جارٍ قراءة الخلطة من جديد…`, true, 2, 5],
        'X recipe_changed: تلميح الخادم، والخلطة تُقرأ من جديد والحفظ معطّل حتّى تصل، والنموذج باقٍ أثناءها',
      );
      reread.resolve(CHANGED());
      await settle();
      t.same(
        [textOf('edit-changed'), nameInput()?.value, rowNames(), disabled(saveButton()), globalThis.__re.location],
        [
          `${CHANGED_HINT} قُرئت الخلطة من جديد، وما اخترته باقٍ: احفظ التعديل ليحلّ محلّ ما حُفظ الآن، أو ارجع دون حفظ.`,
          'علف بادئ 2',
          ['ذرة صفراء', 'كسبة صويا', 'زيت', 'ملح', 'كاز المولّدة'],
          false,
          '/mill/recipe/r-1/edit?back=mill',
        ],
        'X بعد القراءة: الاسم والموادّ كما تركها المستخدم (لا موادّ القراءة الجديدة)، والحفظ مفتوح',
      );
      await click(saveButton());
      const [first, second] = named(rpcLog, 'edit_recipe');
      t.same(
        [first?.p_expected_active, second?.p_expected_active, second?.p_name, second?.p_lines.map((line) => line.item_id), second?.p_client_ref !== first?.p_client_ref],
        ['v-4', 'v-6', 'علف بادئ 2', ['i-corn', 'i-soy', 'i-oil', 'i-salt', 'i-diesel'], true],
        'X الحفظ التالي بشرط المفعَّلة الجديدة v-6 وبما اختاره المستخدم، بمرجع جديد',
      );
    });
    await step('X تعذّرت القراءة من جديد', async () => {
      const { rpcLog } = editSetup(MANAGER, {
        detail: (_args, n) => {
          if (n === 1) return ACTIVE();
          if (n === 2) throw new m.NetworkError();
          return CHANGED();
        },
        edit: (args, n) => {
          if (n === 1) throw new m.RejectedError('recipe_changed', CHANGED_HINT);
          return edited(args);
        },
      });
      await mount('/mill/recipe/r-1/edit');
      await click(withId('remove-line', 'i-premix'));
      await click(saveButton());
      t.same(
        [textOf('edit-changed'), byAction('edit-reread').length, disabled(saveButton()), rowNames().length],
        [`${CHANGED_HINT} وتعذّرت قراءة الخلطة من جديد: أعد القراءة، ثمّ احفظ تعديلك إن شئت.`, 1, true, 5],
        'X فشل القراءة الجديدة: يُقال بـ«أعد القراءة»، والنموذج باقٍ والحفظ معطّل',
      );
      await click(byAction('edit-reread')[0]);
      await click(saveButton());
      t.same(named(rpcLog, 'edit_recipe').map((args) => args.p_expected_active), ['v-4', 'v-6'], 'X «أعد القراءة» ثمّ الحفظ بشرط المفعَّلة الجديدة');
    });

    // ── M: ما يمنع الحفظ ─────────────────────────────────────────────────────────────────────────────────────────────
    await step('M الاسم والموادّ', async () => {
      editSetup(MANAGER);
      await mount('/mill/recipe/r-1/edit');
      type(nameInput(), '  ');
      await settle();
      t.same([disabled(saveButton()), missingOf()], [true, ['اكتب اسم الخلطة.']], 'M اسم فارغ: الحفظ معطّل والسبب تحته');
      type(nameInput(), 'علف ناهٍ');
      await settle();
      t.same(
        [missingOf(), text().includes('توجد خلطة بهذا الاسم؛ اختر اسماً آخر أو افتحها من المعمل.'), disabled(saveButton())],
        [['اسم الخلطة لخلطة أخرى: اختر اسماً غيره.'], true, true],
        'M اسم خلطة ظاهرة أخرى: تحت الحقل وتحت الزرّ',
      );
      type(nameInput(), 'خلطة محذوفة');
      await settle();
      t.same([missingOf(), disabled(saveButton())], [[], false], 'M اسم خلطة محذوفة يصلح');
      type(nameInput(), 'علف بادئ');
      await settle();
      t.same([missingOf(), disabled(saveButton())], [[], false], 'M واسمها نفسه يصلح');
      for (const id of ['i-corn', 'i-soy', 'i-oil', 'i-salt', 'i-premix']) await click(withId('remove-line', id));
      t.same(missingOf(), ['أضف مادّة داخل الكتلة: الوقود والتعبئة وحدهما لا يكوّنان خلطة.'], 'M الوقود وحده لا يكوّن خلطة');
      await click(withId('remove-line', 'i-diesel'));
      t.same([missingOf(), text().includes('لم تبقَ في الخلطة مادّة: المس بطاقة مادّة فوق لتختارها.')], [['اختر مادّة واحدة على الأقلّ من البطاقات.'], true], 'M بلا موادّ');
    });
    await step('M موادّ لم تعد تصلح', async () => {
      const stale = () => {
        const value = ACTIVE();
        value.lines[1] = { ...value.lines[1], kind: 'feed' };
        value.lines[4] = { ...value.lines[4], base_unit: 'pc' };
        return value;
      };
      const { rpcLog } = editSetup(MANAGER, { detail: stale, items: { ...ITEMS, 'i-oil': { ...ITEMS['i-oil'], density: null } } });
      await mount('/mill/recipe/r-1/edit');
      t.same(
        [missingOf(), disabled(saveButton())],
        [
          [
            '«كسبة صويا» لم تعد من موادّ الخلطة (نوعها الآن «علف»): احذفها من الجدول.',
            '«زيت» سائل بلا كثافة: اكتب كثافته على بطاقته.',
            '«برمكس» صارت تُقاس بالقطعة فلا تدخل الخلطة: احذفها من الجدول.',
          ],
          true,
        ],
        'M مادّة صارت علفاً، وسائل بلا كثافة، ومادّة صارت بالقطعة: كلّ واحدة تُسمّى ولا يُرسل شيء',
      );
      await click(withId('remove-line', 'i-soy'));
      await click(withId('remove-line', 'i-premix'));
      t.same(missingOf(), ['«زيت» سائل بلا كثافة: اكتب كثافته على بطاقته.'], 'M حذفهما يُسقط سببيهما');
      t.eq(named(rpcLog, 'edit_recipe').length, 0, 'M ولا طلب');
    });

    // ── K: صفحة الخلطة ───────────────────────────────────────────────────────────────────────────────────────────────
    await step('K «عدّل الخلطة» في صفحة الخلطة', async () => {
      const { rpcLog } = editSetup(MANAGER);
      await mount('/mill/recipe/r-1');
      t.same([textOf('edit-recipe'), byAction('new-version').length, byAction('open-draft').length], ['عدّل الخلطة', 0, 0], 'K «عدّل الخلطة» في صفّ الأفعال');
      await click(byAction('edit-recipe')[0]);
      t.same(
        [globalThis.__re.location, named(rpcLog, 'new_recipe_version').length, h1Text()],
        ['/mill/recipe/r-1/edit', 0, 'تعديل الخلطة «علف بادئ»'],
        'K يفتح شاشة التعديل ولا ينشئ مسوّدة (كان new_recipe_version ثمّ «فعّل النسخة»)',
      );
      await unmount();
      const drafted = editSetup(MANAGER, { detail: (args) => withDraft(args.p_version ?? 'v-4') });
      await mount('/mill/recipe/r-1');
      t.same([byAction('open-draft').length, textOf('edit-recipe')], [0, 'عدّل الخلطة'], 'K للخلطة مسوّدة: «عدّل الخلطة» نفسه لا «أكمل تعديل الخلطة»');
      await click(byAction('edit-recipe')[0]);
      t.same(
        [globalThis.__re.location, named(drafted.rpcLog, 'new_recipe_version').length, textOf('edit-draft-notice'), rowNames()],
        ['/mill/recipe/r-1/edit', 0, 'لهذه الخلطة تعديل سابق لم يُفعَّل (نسخة 5): حفظ هذا التعديل يحلّ محلّه.', ACTIVE_NAMES],
        'K ويفتح شاشة التعديل بموادّ المفعَّلة وجملة المسوّدة',
      );
    });
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
    delete globalThis.__re;
    restore();
  }
}
