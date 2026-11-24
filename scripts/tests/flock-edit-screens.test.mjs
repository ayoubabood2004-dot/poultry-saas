// تعديل الفوج وحذفه (0028، كلمة الزبون 2026-11-15: «قاعة 5: أدخلت الفوج وغلطت بتاريخ التسكين ولا أستطيع تعديله. أريد أن أعدّل التاريخ،
// أو أحذفه وأدخله من جديد. كلّ خطوة تحتاج تعديلاً»؛ و«عدّل» في جدول القاعات كان يعدّل القاعة وحدها فحيّره). الشاشات الحقيقية (FarmRoutes:
// جدول الحقل وشاشة الفوج) بـreact-dom/client الحقيقي على DOM صغير (dom.mjs)، وrepo الحقول الحقيقي (editFlock وdeleteFlock ومحلّلاهما
// وflock_feed) على core بديل يسجّل كلّ نداء، وقراءتا الحقل والفوج بديلان (نسخة الجهاز حقيقية كما في farm-round).
// P المحلّلات: جواب edit_flock وdelete_flock بصرامة، والعمر عند التسكين في ملخّص الفوج.
// B الأزرار لكلّ دور: «عدّل القاعة» (بدل «عدّل») و«عدّل الفوج» للمدير لكلّ فوج قائم وحده، ولا شيء لعامل القاعة.
// N القاعات بترتيب أرقامها («قاعة 5» قبل «قاعة 44»، وشاشة الزبون عكسها).
// E النافذة: القيم المحفوظة أوّلاً، والحفظ معطّل بلا تغيير ولتاريخ بعد اليوم، والحمولة edit_flock بالضبط (اليوم ISO والأرقام والسلالة
//   الفارغة null)، والمرجع نفسه للإعادة بعد جواب ضاع، والنجاح برسالته ثمّ القراءة من جديد، والرفض بتلميحه داخل النافذة بلا قراءة.
// S stale_flock: التلميح، والقراءة من جديد والنافذة باقية، ثمّ تُفتح بالقيم الجديدة ونسختها ومرجع جديد.
// D الحذف: تأكيد يسمّي الفوج وأثره، والحمولة delete_flock، ورسالة الحذف، وdeleted:false «محذوف من قبل»، والرفض flock_has_records بتلميحه
//   في النافذة، والمرجع نفسه للإعادة.
// F شاشة الفوج: «عدّل الفوج» للمدير والفوج قائم، والتعديل يقرأ الفوج من جديد، وstale لا يطوي النافذة، والحذف يرجع إلى حقل نوعه.
// كلّ فحص هنا يفشل على الشفرة قبل هذا التغيير (لا editFlock ولا deleteFlock ولا «عدّل الفوج» ولا الترتيب)، إلّا ما وُسم «ضابط».
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';
import { everyoneLikeOwner, printOf } from './everyone-owner-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const REAL_FLOCKS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'flocks.ts'));
const REAL_HALLS = JSON.stringify(path.join(ROOT, 'src', 'pages', 'halls', 'HallsRoutes.tsx'));
// قراءتا الحقل والفوج بديلان، والباقي من flocks.ts حقيقيّ على core البديل (النداء كما يبنيه editFlock وdeleteFlock نفساهما).
const OVERRIDES = ['loadOverviewJson', 'loadFlockDetail'];
const STUBS = {
  flocks: `export * from ${REAL_FLOCKS}; import { parseOverview as __parseOverview } from ${REAL_FLOCKS}; ${OVERRIDES.map((n) => `export const ${n} = (...a) => globalThis.__fe.call('${n}', a);`).join(' ')}
    export const loadOverview = async () => __parseOverview(await globalThis.__fe.call('loadOverviewJson', []));`,
  session: 'export const useSession = () => globalThis.__fe.session; export const sessionStore = { get: () => globalThis.__fe?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__fe.toasts.push(spec); }; export function Toaster() { return null; }',
  // حزمة القاعات (نافذة «عدّل الفوج» منها): حقيقية، أو فشل تحميلها كما بلا نت (hallsFail).
  hallsChunk: `export const loadHalls = () => (globalThis.__fe?.hallsFail ? Promise.reject(new Error('offline')) : import(${REAL_HALLS}));`,
};
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__fe.rpc(fn, args);
export const send = async (make) => ({ result: await make(null), wasOnline: true });
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
const plugins = [
  {
    name: 'fe-stubs',
    setup(b) {
      b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/flocks$|\/Toast$|\/lib\/hallsChunk$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'fe-stub' }));
      b.onLoad({ filter: /.*/, namespace: 'fe-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
      // flockEdits.ts (editFlock وdeleteFlock، في حزمة القاعات مع نافذتها) على core البديل نفسه.
      b.onResolve({ filter: /^\.\/core$/ }, (args) => (/src\/lib\/repo\/(?:flocks|flockEdits|hallSheet)\.ts$/u.test(args.importer.replace(/\\/g, '/')) ? { path: 'core', namespace: 'fe-core' } : undefined));
      b.onLoad({ filter: /.*/, namespace: 'fe-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
    },
  },
];
const OPTIONS = {
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  jsx: 'automatic',
  logLevel: 'silent',
  loader: { '.css': 'empty' },
  define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
};
const load = async (contents, withStubs) => {
  const result = await build({ ...OPTIONS, stdin: { contents, resolveDir: ROOT, loader: 'tsx' }, plugins: withStubs ? plugins : [] });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name, root = body()) => descendants(root).filter((n) => n.getAttribute('data-action') === name);
const text = () => body().textContent;
const type = (input, value) => {
  if (!input) return;
  input.value = value;
  fire(input, 'input');
};
const click = async (node) => {
  if (node) fire(node, 'click', { button: 0 });
  await settle(40);
};
const disabled = (node) => Boolean(node) && node.getAttribute('disabled') !== null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
/** نداء قد يرمي على الشفرة القديمة (دالّة غير موجودة): نتيجته أو «threw:…»، فيفشل كلّ فحص وحده بدل أن يسقط الملفّ. */
const safe = (fn) => {
  try {
    return fn();
  } catch (error) {
    return `threw:${error?.message ?? error}`;
  }
};

/** صفوف الجدول بأوّل خليّة (اسم القاعة) بترتيب ظهورها. */
const hallOrder = () =>
  all()
    .filter((n) => n.localName === 'tr')
    .map((tr) => descendants(tr).find((n) => n.localName === 'td')?.textContent ?? null)
    .filter((name) => name !== null && name.startsWith('قاعة'));
const rowOf = (name) => all().find((n) => n.localName === 'tr' && descendants(n).find((c) => c.localName === 'td')?.textContent === name) ?? null;
const inRow = (name, action) => {
  const row = rowOf(name);
  return row ? byAction(action, row) : [];
};
/** نافذة بعنوان يبدأ بنصّ: الحقول تُطلب داخلها (شاشة الفوج فيها خانة تاريخ للوزن أيضاً). */
const dialogTitled = (start) => all().find((n) => n.getAttribute('role') === 'dialog' && descendants(n).some((c) => c.localName === 'h2' && c.textContent.startsWith(start))) ?? null;
const editDialog = () => dialogTitled('تعديل فوج');
const field = (suffix) => {
  const dialog = editDialog();
  return dialog ? descendants(dialog).find((n) => n.localName === 'input' && n.id.endsWith(suffix)) ?? null : null;
};
const values = () => ['-day', '-count', '-age', '-breed'].map((suffix) => field(suffix)?.value ?? null);
const dialogText = () => editDialog()?.textContent ?? '';

export default async function (t) {
  // ── P: المحلّلات الحقيقية ─────────────────────────────────────────────────────────────────────────────────────────
  const p = await load("export { parseEditedFlock, parseDeletedFlock } from './src/lib/repo/flockEdits.ts'; export { parseFlock, FlockShapeError } from './src/lib/repo/flocks.ts';", false);
  const shape = (fn) => {
    try {
      fn();
      return 'ok';
    } catch (error) {
      return p.FlockShapeError && error instanceof p.FlockShapeError ? error.message : `threw:${error?.message ?? error}`;
    }
  };
  {
    const F = 'f-5';
    const edited = { flock_id: F, version: 4, placed_on: '2026-11-02', placed_count: 5200, age_days_at_placement: 0, breed: null, changed: true };
    t.same(
      safe(() => p.parseEditedFlock(edited, F)),
      { flockId: F, version: 4, placedOn: '2026-11-02', placedCount: 5200, ageDaysAtPlacement: 0, breed: null, changed: true },
      'P جواب edit_flock: الفوج ونسخته الجديدة والتاريخ والعدد والعمر والسلالة وchanged',
    );
    t.same(safe(() => p.parseEditedFlock({ ...edited, breed: 'كوب 500', changed: false }, F)?.breed), 'كوب 500', 'P السلالة نصّاً كما هي');
    const without = (key) => {
      const copy = { ...edited };
      delete copy[key];
      return copy;
    };
    t.same(
      [
        shape(() => p.parseEditedFlock(without('changed'), F)),
        shape(() => p.parseEditedFlock({ ...edited, version: '4' }, F)),
        shape(() => p.parseEditedFlock({ ...edited, placed_on: '02/11/2026' }, F)),
        shape(() => p.parseEditedFlock({ ...edited, flock_id: 'f-other' }, F)),
        shape(() => p.parseEditedFlock({ ...edited, breed: '' }, F)),
        shape(() => p.parseEditedFlock(without('age_days_at_placement'), F)),
        shape(() => p.parseEditedFlock([edited], F)),
      ],
      ['flock_shape:changed', 'flock_shape:version', 'flock_shape:placed_on', 'flock_shape:flock_id', 'flock_shape:breed', 'flock_shape:age_days_at_placement', 'flock_shape:edit_flock'],
      'P الصرامة: مفتاح غائب أو بنوع آخر، ويوم بغير YYYY-MM-DD، وفوج غير المطلوب، وسلالة فارغة، ومصفوفة بدل كائن — كلّها خطأ شكل',
    );
    t.same(
      [safe(() => p.parseDeletedFlock({ flock_id: F, deleted: true }, F)), safe(() => p.parseDeletedFlock({ flock_id: F, deleted: false }, F))],
      [
        { flockId: F, deleted: true },
        { flockId: F, deleted: false },
      ],
      'P جواب delete_flock: حُذف، أو لم يكن موجوداً (deleted:false)',
    );
    t.same(
      [shape(() => p.parseDeletedFlock({ flock_id: F, deleted: 'yes' }, F)), shape(() => p.parseDeletedFlock({ flock_id: F }, F)), shape(() => p.parseDeletedFlock({ flock_id: 'f-x', deleted: true }, F))],
      ['flock_shape:deleted', 'flock_shape:deleted', 'flock_shape:flock_id'],
      'P صرامة delete_flock: deleted منطقيّ حاضر، والفوج هو المطلوب',
    );
    const summary = { id: F, kind: 'broiler', breed: null, status: 'active', version: 3, placed_on: '2026-11-04', placed_count: 5000, age_days_at_placement: 2, age_days: 14, days_since_placement: 13, dead_total: 0, culled_total: 0, live: 5000, live_start_today: 5000, mortality_pct: '0.00', feed_kg_total: '0.000', feed_days: 0, feed_span_days: 12, last_weight: null, fcr: null, today: null, eggs_today: null, hdep_today: null, rejects_pending: 0 };
    const noAge = { ...summary };
    delete noAge.age_days_at_placement;
    t.same([safe(() => p.parseFlock(summary).ageDaysAtPlacement), safe(() => p.parseFlock(noAge).ageDaysAtPlacement)], [2, null], 'P ملخّص الفوج يقرأ العمر عند التسكين (أوّل قيمة في النافذة)، وغيابه null');
  }

  const restore = installDom();
  try {
    const m = await load(
      [
        "export { createElement as h } from 'react';",
        "export { createRoot } from 'react-dom/client';",
        "export { flushSync } from 'react-dom';",
        "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
        "export { default as FarmRoutes } from './src/pages/farm/FarmRoutes.tsx';",
        "export { onlineStore } from './src/lib/online.ts';",
        "export { localDay, addDays } from './src/domain/dates.ts';",
        "export { parseDetail } from './src/lib/repo/flocks.ts';",
        "export { fmtDay } from './src/lib/format.ts';",
        "export { isWindowDirty } from './src/lib/pwa/dirty.ts';",
        "export { RejectedError, UnknownOutcomeError } from './src/lib/errors.ts';",
      ].join('\n'),
      true,
    );
    m.onlineStore.set(true);
    const TODAY = m.localDay();
    const PLACED = m.addDays(TODAY, -12);
    const FIXED = m.addDays(TODAY, -14);
    const F1 = '00000000-0000-4000-8000-0000000000a1';
    const F2 = '00000000-0000-4000-8000-0000000000a2';
    const F5 = '00000000-0000-4000-8000-0000000000a5';
    const F44 = '00000000-0000-4000-8000-0000000000b4';
    const ws = (role) => ({
      userId: 'u-1', orgId: 'org-1', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role, scopes: [], divisions: ['broiler', 'layer'],
      canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1,
    });
    const flockJson = (id, over = {}) => ({
      id, kind: 'broiler', breed: 'روس 308', status: 'active', version: 3, placed_on: PLACED, placed_count: 5000, age_days_at_placement: 1, age_days: 13,
      days_since_placement: 13, dead_total: 40, culled_total: 10, live: 4950, live_start_today: 4950, mortality_pct: '1.00', feed_kg_total: '800.000',
      feed_days: 12, feed_span_days: 12, last_weight: null, fcr: null, today: null, eggs_today: null, hdep_today: null, rejects_pending: 0, ...over,
    });
    const hall = (id, name, flock) => ({ id, name, capacity: 6000, version: 2, flock });
    // بترتيب القاعدة (حرفاً حرفاً): «قاعة 10» قبل «قاعة 2»، و«قاعة 44» قبل «قاعة 5» كما في شاشة الزبون.
    const overview = ({ canManage = true, f5 = {}, kind = 'broiler', empty5 = false } = {}) => ({
      today: TODAY,
      sites: [
        {
          id: 's-1', name: 'حقل الأمل', division_id: 'd-b', kind, can_manage: canManage,
          halls: [
            hall('h-1', 'قاعة 1', flockJson(F1)),
            hall('h-10', 'قاعة 10', null),
            hall('h-2', 'قاعة 2', flockJson(F2, { status: 'preparing' })),
            hall('h-44', 'قاعة 44', flockJson(F44)),
            hall('h-5', 'قاعة 5', empty5 ? null : flockJson(F5, { kind, ...f5 })),
          ],
        },
      ],
    });
    /** ورقة القاعة (hall_sheet، 0035) لفوج قاعة 5 من العيّنة اليدوية للعقد. */
    const SHEETS = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'hall-sheet.hand.json'), 'utf8')).hall_sheet;
    const sheetJson = ({ kind = 'broiler', status = 'active' } = {}) => {
      const sheet = JSON.parse(JSON.stringify(kind === 'layer' ? SHEETS.layer : SHEETS.broiler));
      Object.assign(sheet.flock, { id: F5, hall_id: 'h-5', hall_name: 'قاعة 5', site_name: 'حقل الأمل', status });
      if (status !== 'active') {
        sheet.can_write = false;
        sheet.flock.closed_on = sheet.through;
      }
      return sheet;
    };
    const editedJson = (over = {}) => ({ flock_id: F5, version: 4, placed_on: FIXED, placed_count: 5200, age_days_at_placement: 0, breed: null, changed: true, ...over });

    let root = null;
    const fresh = (role, handlers, rpc = {}) => {
      const calls = [];
      globalThis.__fe = {
        session: { status: 'ready', workspace: ws(role), offline: false },
        toasts: [],
        location: null,
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
        rpc(fn, args) {
          calls.push([`rpc:${fn}`, args]);
          const handler = rpc[fn];
          if (!handler) return new Promise(() => {});
          try {
            return Promise.resolve(handler(args));
          } catch (error) {
            return Promise.reject(error);
          }
        },
      };
      return calls;
    };
    const named = (calls, name) => calls.filter(([n]) => n === name).map(([, args]) => args);
    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      function Where() {
        const location = m.useLocation();
        globalThis.__fe.location = `${location.pathname}${location.search}`;
        return m.h(m.Routes, null, m.h(m.Route, { path: '/broiler/*', element: m.h(m.FarmRoutes, { kind: 'broiler' }) }), m.h(m.Route, { path: '/layers/*', element: m.h(m.FarmRoutes, { kind: 'layer' }) }));
      }
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(Where))));
      await settle(60);
    };
    const step = async (label, fn) => {
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      if (root) {
        m.flushSync(() => root.unmount());
        body().textContent = '';
        await settle();
        root = null;
      }
    };
    const toasts = () => globalThis.__fe.toasts.map((toast) => [toast.tone, toast.title]);
    const lastToast = () => toasts().at(-1) ?? null;
    const overviewReads = (calls) => named(calls, 'loadOverviewJson').length;

    // ── B وN: الأزرار لكلّ دور، والقاعات بترتيب أرقامها ─────────────────────────────────────────────────────────────────
    await step('B المدير', async () => {
      fresh('manager', { loadOverviewJson: () => overview() });
      await mount('/broiler');
      t.same(hallOrder(), ['قاعة 1', 'قاعة 2', 'قاعة 5', 'قاعة 10', 'قاعة 44'], 'N القاعات بترتيب أرقامها: «قاعة 5» قبل «قاعة 10» و«قاعة 44» (القاعدة ترسلها حرفاً حرفاً)');
      t.same(
        byAction('hall-edit').map((n) => n.textContent),
        ['عدّل القاعة', 'عدّل القاعة', 'عدّل القاعة', 'عدّل القاعة', 'عدّل القاعة'],
        'B زرّ القاعة «عدّل القاعة» (كان «عدّل» وحده فظنّه الزبون تعديلاً للفوج)',
      );
      t.same(
        ['قاعة 1', 'قاعة 2', 'قاعة 5', 'قاعة 10', 'قاعة 44'].map((name) => inRow(name, 'flock-edit').map((n) => n.textContent).join('|')),
        ['عدّل الفوج', '', 'عدّل الفوج', '', 'عدّل الفوج'],
        'B «عدّل الفوج» لكلّ فوج قائم (لا للقاعة الفارغة ولا لفوج قيد التجهيز)',
      );
    });
    // E «الكلّ مثل المالك» (0034): جدول الحقل («اصرف» و«افتح فوجاً» و«عدّل الفوج» و«عدّل القاعة») بالجواب نفسه لكلّ دور كما للمالك.
    await step('E جدول الحقل', async () => {
      await everyoneLikeOwner(
        t,
        'E جدول الحقل',
        async (role) => {
          fresh(role, { loadOverviewJson: () => overview({ empty5: true }) });
          await mount('/broiler');
          const print = printOf(body());
          m.flushSync(() => root.unmount());
          body().textContent = '';
          await settle();
          root = null;
          return print;
        },
        ['data-action="hall-issue"', 'data-action="flock-open"', 'data-action="flock-edit"', 'data-action="hall-edit"'],
      );
    });
    await step('B عامل القاعة', async () => {
      // 0034: الخادم يعطي كلّ عضو can_manage صحيحة كالمالك.
      fresh('hall_worker', { loadOverviewJson: () => overview() });
      await mount('/broiler');
      t.ok(rowOf('قاعة 5') !== null, 'B ضابط: عامل القاعة يرى قاعاته');
      t.same([byAction('flock-edit').length, byAction('hall-edit').length], [3, 5], 'B عامل القاعة: «عدّل الفوج» لكلّ فوج قائم و«عدّل القاعة» لكلّ قاعة كالمالك (0034)');
    });
    await step('B الخادم بلا إدارة', async () => {
      // علم الخادم لا الدور: جواب can_manage=false (خادم أقدم).
      fresh('owner', { loadOverviewJson: () => overview({ canManage: false }) });
      await mount('/broiler');
      t.ok(rowOf('قاعة 5') !== null, 'B ضابط: القاعات ظاهرة');
      t.same([byAction('flock-edit').length, byAction('hall-edit').length, byAction('flock-delete').length], [0, 0, 0], 'B الخادم أجاب can_manage=false (خادم أقدم): بلا «عدّل الفوج» ولا «عدّل القاعة»');
    });

    // ── E: النافذة والحمولة والمرجع والنجاح ─────────────────────────────────────────────────────────────────────────
    await step('E', async () => {
      let attempts = 0;
      const calls = fresh(
        'manager',
        { loadOverviewJson: () => overview() },
        {
          edit_flock: () => {
            attempts += 1;
            if (attempts === 1) throw new m.UnknownOutcomeError();
            return editedJson();
          },
        },
      );
      await mount('/broiler');
      await click(inRow('قاعة 5', 'flock-edit')[0]);
      t.ok(editDialog()?.textContent.includes('تعديل فوج «قاعة 5»'), 'E النافذة بعنوان «تعديل فوج «قاعة 5»»');
      t.same(values(), [m.fmtDay(PLACED), '5000', '1', 'روس 308'], 'E القيم المحفوظة أوّلاً: تاريخ التسكين يوم/شهر/سنة، والعدد، والعمر عند التسكين، والسلالة');
      const save = () => byAction('flock-edit-save')[0];
      t.same([save()?.textContent, disabled(save())], ['احفظ التعديل', true], 'E «احفظ التعديل» معطّل ما لم يتغيّر شيء');
      type(field('-day'), m.fmtDay(m.addDays(TODAY, 1)));
      await settle();
      t.same([dialogText().includes('التاريخ بعد اليوم.'), disabled(save())], [true, true], 'E تاريخ بعد اليوم ممنوع قبل الإرسال');
      type(field('-day'), m.fmtDay(FIXED));
      type(field('-count'), '5200');
      type(field('-age'), '0');
      type(field('-breed'), '   ');
      await settle();
      t.same([disabled(save()), m.isWindowDirty()], [false, true], 'E بعد التعديل: الحفظ متاح، والنافذة كتابة لم تُحفظ');
      await click(save());
      const [first] = named(calls, 'rpc:edit_flock');
      t.same(
        first ? { ...first, p_client_ref: UUID.test(first.p_client_ref ?? '') ? 'uuid' : first.p_client_ref } : null,
        { p_flock: F5, p_expected_version: 3, p_placed_on: FIXED, p_placed_count: 5200, p_age_days: 0, p_breed: null, p_client_ref: 'uuid' },
        'E حمولة edit_flock بالضبط: الفوج ونسخته المقروءة، واليوم YYYY-MM-DD، والعدد والعمر أرقاماً، والسلالة الفارغة null، ومرجع من الجهاز',
      );
      t.same([dialogText().includes('نتيجة العملية غير معروفة'), editDialog() !== null, overviewReads(calls)], [true, true, 1], 'E جواب ضاع: النافذة باقية وتقول إنّ النتيجة غير معروفة، بلا قراءة من جديد');
      await click(save());
      const second = named(calls, 'rpc:edit_flock')[1];
      t.same([named(calls, 'rpc:edit_flock').length, second?.p_client_ref === first?.p_client_ref, second?.p_placed_on], [2, true, FIXED], 'E الإعادة بالمرجع نفسه (التعديل نفسه لا ثانٍ)');
      t.same(lastToast(), ['success', `حُفظ تعديل فوج «قاعة 5»: التسكين ${m.fmtDay(FIXED)} بعدد 5,200.`], 'E رسالة النجاح بالتاريخ والعدد من جواب الخادم');
      t.same([editDialog() === null, overviewReads(calls)], [true, 2], 'E النافذة تُغلق والحقل يُقرأ من جديد');
    });
    await step('E السلالة', async () => {
      const calls = fresh('manager', { loadOverviewJson: () => overview() }, { edit_flock: () => editedJson({ breed: 'كوب 500' }) });
      await mount('/broiler');
      await click(inRow('قاعة 5', 'flock-edit')[0]);
      type(field('-breed'), '  كوب 500 ');
      await settle();
      await click(byAction('flock-edit-save')[0]);
      const [args] = named(calls, 'rpc:edit_flock');
      t.same([args?.p_breed, args?.p_placed_on, args?.p_placed_count, args?.p_age_days], ['كوب 500', PLACED, 5000, 1], 'E السلالة بلا فراغات حولها، وما لم يُلمس يُرسل بقيمته المحفوظة');
    });
    await step('E الرفض', async () => {
      const HINT = 'سُجّلت للفوج جولة يوم 06/11/2026 قبل تاريخ التسكين الجديد. اختر تاريخاً لا يتأخّر عنها.';
      const calls = fresh(
        'manager',
        { loadOverviewJson: () => overview() },
        {
          edit_flock: () => {
            throw new m.RejectedError('records_before_placement', HINT);
          },
        },
      );
      await mount('/broiler');
      await click(inRow('قاعة 5', 'flock-edit')[0]);
      type(field('-day'), m.fmtDay(m.addDays(TODAY, -2)));
      await settle();
      await click(byAction('flock-edit-save')[0]);
      t.same(
        [named(calls, 'rpc:edit_flock').length, dialogText().includes(HINT), disabled(byAction('flock-edit-save')[0]), overviewReads(calls), globalThis.__fe.toasts.length],
        [1, true, false, 1, 0],
        'E الرفض: تلميح الخادم داخل النافذة، والحفظ متاح للتصحيح، بلا قراءة ولا رسالة نجاح',
      );
    });

    // ── S: stale_flock ──────────────────────────────────────────────────────────────────────────────────────────────
    await step('S', async () => {
      const HINT = 'تغيّر هذا الفوج بعد أن فتحت النافذة. أغلقها وافتحها من جديد لترى قيمه الحالية.';
      let reads = 0;
      const calls = fresh(
        'manager',
        {
          loadOverviewJson: () => {
            reads += 1;
            return reads === 1 ? overview() : overview({ f5: { version: 7, placed_on: FIXED, placed_count: 5100 } });
          },
        },
        {
          edit_flock: (args) => {
            if (args.p_expected_version === 3) throw new m.RejectedError('stale_flock', HINT);
            return editedJson({ version: 8, placed_count: 5300 });
          },
        },
      );
      await mount('/broiler');
      await click(inRow('قاعة 5', 'flock-edit')[0]);
      type(field('-count'), '5300');
      await settle();
      await click(byAction('flock-edit-save')[0]);
      const [first] = named(calls, 'rpc:edit_flock');
      t.same([dialogText().includes(HINT), editDialog() !== null, reads], [true, true, 2], 'S stale_flock: التلميح في النافذة الباقية، والحقل يُقرأ من جديد');
      await click(byAction('dialog-close', editDialog() ?? body())[0]);
      await click(byAction('dialog-discard')[0]);
      t.ok(editDialog() === null, 'S ضابط: النافذة أُغلقت بعد «اخرج وتجاهل التعديلات»');
      await click(inRow('قاعة 5', 'flock-edit')[0]);
      t.same(values().slice(0, 2), [m.fmtDay(FIXED), '5100'], 'S تُفتح من جديد بالقيم التي قُرئت بعد الرفض');
      type(field('-count'), '5300');
      await settle();
      await click(byAction('flock-edit-save')[0]);
      const second = named(calls, 'rpc:edit_flock')[1];
      t.same([second?.p_expected_version, UUID.test(second?.p_client_ref ?? ''), second?.p_client_ref !== first?.p_client_ref], [7, true, true], 'S الحفظ بعدها بالنسخة الجديدة (7) وبمرجع نافذة جديد');
      t.same(lastToast()?.[0], 'success', 'S ثمّ يُحفظ');
    });

    // ── D: الحذف ────────────────────────────────────────────────────────────────────────────────────────────────────
    const CONSEQUENCE = `يُحذف الفوج المسكَّن في ${m.fmtDay(PLACED)} بعدد 5,000 وتصير القاعة فارغة، فتفتح فيها فوجاً بالتاريخ الصحيح. لا يُحذف فوج له سجلّ (جولة يومية أو صرف أو وزن أو دواء أو لقاح): عدّل تاريخه وعدده بدل ذلك.`;
    const confirmDialog = () => dialogTitled('حذف فوج');
    await step('D', async () => {
      let attempts = 0;
      const calls = fresh(
        'manager',
        { loadOverviewJson: () => overview() },
        {
          delete_flock: () => {
            attempts += 1;
            if (attempts === 1) throw new m.UnknownOutcomeError();
            return { flock_id: F5, deleted: true };
          },
        },
      );
      await mount('/broiler');
      await click(inRow('قاعة 5', 'flock-edit')[0]);
      const remove = byAction('flock-delete')[0];
      t.same([remove?.textContent, disabled(remove)], ['احذف الفوج', false], 'D «احذف الفوج» في النافذة');
      await click(remove);
      t.same(
        [confirmDialog()?.textContent.includes('حذف فوج «قاعة 5»؟'), confirmDialog()?.textContent.includes(CONSEQUENCE), named(calls, 'rpc:delete_flock').length],
        [true, true, 0],
        'D التأكيد يسمّي الفوج («حذف فوج «قاعة 5»؟») وأثره بتاريخه وعدده، بلا إرسال قبل التأكيد',
      );
      const cancel = descendants(confirmDialog() ?? body()).find((n) => n.localName === 'button' && n.textContent === 'لا، تراجع');
      await click(cancel);
      t.same([confirmDialog() === null, editDialog() !== null, named(calls, 'rpc:delete_flock').length], [true, true, 0], 'D «لا، تراجع» يرجع إلى النافذة بلا حذف');
      await click(byAction('flock-delete')[0]);
      await click(byAction('flock-delete-confirm')[0]);
      const [first] = named(calls, 'rpc:delete_flock');
      t.same(
        first ? { ...first, p_client_ref: UUID.test(first.p_client_ref ?? '') ? 'uuid' : first.p_client_ref } : null,
        { p_flock: F5, p_expected_version: 3, p_client_ref: 'uuid' },
        'D حمولة delete_flock: الفوج ونسخته ومرجع من الجهاز',
      );
      t.ok(confirmDialog() === null && dialogText().includes('نتيجة العملية غير معروفة'), 'D جواب ضاع: التأكيد يُغلق والنافذة تقول إنّ النتيجة غير معروفة');
      await click(byAction('flock-delete')[0]);
      await click(byAction('flock-delete-confirm')[0]);
      const second = named(calls, 'rpc:delete_flock')[1];
      t.eq(second?.p_client_ref === first?.p_client_ref && second !== undefined, true, 'D الإعادة بالمرجع نفسه');
      t.same([lastToast(), editDialog() === null, overviewReads(calls)], [['success', 'حُذف فوج «قاعة 5»، والقاعة فارغة الآن.'], true, 2], 'D الحذف: رسالته، والنافذة تُغلق، والحقل يُقرأ من جديد');
    });
    await step('D محذوف من قبل', async () => {
      const calls = fresh('manager', { loadOverviewJson: () => overview() }, { delete_flock: () => ({ flock_id: F5, deleted: false }) });
      await mount('/broiler');
      await click(inRow('قاعة 5', 'flock-edit')[0]);
      await click(byAction('flock-delete')[0]);
      await click(byAction('flock-delete-confirm')[0]);
      t.same([lastToast(), editDialog() === null, overviewReads(calls)], [['info', 'فوج «قاعة 5» محذوف من قبل، فلم يتغيّر شيء.'], true, 2], 'D deleted:false: «محذوف من قبل» لا «حُذف»، ثمّ القراءة من جديد');
    });
    await step('D الرفض', async () => {
      const HINT = 'لهذا الفوج سجلّات (جولات يومية: 3، صرف: 1)، فلا يُحذف. عدّل تاريخه وعدده بدل حذفه.';
      const calls = fresh(
        'manager',
        { loadOverviewJson: () => overview() },
        {
          delete_flock: () => {
            throw new m.RejectedError('flock_has_records', HINT);
          },
        },
      );
      await mount('/broiler');
      await click(inRow('قاعة 5', 'flock-edit')[0]);
      await click(byAction('flock-delete')[0]);
      await click(byAction('flock-delete-confirm')[0]);
      t.same(
        [confirmDialog() === null, dialogText().includes(HINT), editDialog() !== null, overviewReads(calls), globalThis.__fe.toasts.length],
        [true, true, true, 1, 0],
        'D flock_has_records: التأكيد يُغلق وتلميح الخادم في النافذة (لتعديل التاريخ بدل الحذف)، بلا قراءة ولا رسالة',
      );
    });

    // ── F: ورقة القاعة (0035): «عدّل الوجبة» في صفّ الأفعال، بلقطة الفوج من قراءة الحقل ───────────────────────────────────────
    await step('F المدير', async () => {
      let reads = 0;
      const calls = fresh(
        'manager',
        { loadOverviewJson: () => overview() },
        {
          hall_sheet: () => {
            reads += 1;
            return sheetJson();
          },
          edit_flock: () => editedJson(),
        },
      );
      await mount('/broiler/hall/h-5');
      const edit = byAction('sheet-edit');
      t.same(edit.map((n) => n.textContent), ['عدّل الوجبة'], 'F ورقة القاعة: «عدّل الوجبة» للمدير');
      await click(edit[0]);
      t.same([editDialog()?.textContent.includes('تعديل فوج «قاعة 5»'), values()], [true, [m.fmtDay(PLACED), '5000', '1', 'روس 308']], 'F النافذة نفسها بقيم الفوج (لا خانة تاريخ الوزن)');
      type(field('-day'), m.fmtDay(FIXED));
      await settle();
      await click(byAction('flock-edit-save')[0]);
      const [args] = named(calls, 'rpc:edit_flock');
      t.same([args?.p_flock, args?.p_expected_version, args?.p_placed_on], [F5, 3, FIXED], 'F الحفظ edit_flock بالفوج ونسخته');
      t.same([lastToast()?.[0], editDialog() === null, reads, overviewReads(calls) >= 2], ['success', true, 2, true], 'F النجاح يُغلق النافذة ويقرأ الورقة والحقل من جديد');
    });
    await step('F stale', async () => {
      let reads = 0;
      fresh(
        'manager',
        { loadOverviewJson: () => overview({ f5: reads > 1 ? { version: 9 } : {} }) },
        {
          hall_sheet: () => {
            reads += 1;
            return reads === 1 ? sheetJson() : new Promise((resolve) => setTimeout(() => resolve(sheetJson()), 5));
          },
          edit_flock: () => {
            throw new m.RejectedError('stale_flock', 'تغيّر هذا الفوج بعد أن فتحت النافذة.');
          },
        },
      );
      await mount('/broiler/hall/h-5');
      await click(byAction('sheet-edit')[0]);
      type(field('-count'), '4900');
      await settle();
      await click(byAction('flock-edit-save')[0]);
      await settle(60);
      t.same([reads, editDialog() !== null, dialogText().includes('تغيّر هذا الفوج بعد أن فتحت النافذة.'), field('-count')?.value], [2, true, true, '4900'], 'F stale: الورقة تُقرأ من جديد والنافذة باقية بالتلميح وبما كُتب فيها');
    });
    await step('F الحذف', async () => {
      let deleted = false;
      const calls = fresh(
        'manager',
        { loadOverviewJson: () => overview({ kind: 'layer', empty5: deleted }) },
        {
          hall_sheet: () => sheetJson({ kind: 'layer' }),
          delete_flock: () => {
            deleted = true;
            return { flock_id: F5, deleted: true };
          },
        },
      );
      await mount('/layers/hall/h-5');
      await click(byAction('sheet-edit')[0]);
      await click(byAction('flock-delete')[0]);
      await click(byAction('flock-delete-confirm')[0]);
      await settle(60);
      t.same([named(calls, 'rpc:delete_flock')[0]?.p_flock, lastToast()?.[0], globalThis.__fe.location, byAction('hall-empty').length], [F5, 'success', '/layers/hall/h-5', 1], 'F بعد الحذف تقرأ صفحة القاعة الحقل من جديد فتظهر فارغة (البيّاض)');
    });
    await step('F الأدوار', async () => {
      fresh('hall_worker', { loadOverviewJson: () => overview() }, { hall_sheet: () => sheetJson() });
      await mount('/broiler/hall/h-5');
      t.ok(text().includes('هلاكات قاعة (5)') && byAction('hall-back').length === 1, 'F ضابط: عامل القاعة يرى ورقة القاعة');
      t.eq(byAction('sheet-edit').length, 1, 'F عامل القاعة يعدّل الوجبة كالمالك (0034: can_manage صحيحة لكلّ عضو)');
    });
    await step('F الخادم بلا إدارة', async () => {
      // علم الخادم لا الدور: جواب can_manage=false (خادم أقدم).
      fresh('owner', { loadOverviewJson: () => overview({ canManage: false }) }, { hall_sheet: () => sheetJson() });
      await mount('/broiler/hall/h-5');
      t.eq(byAction('sheet-edit').length, 0, 'F الخادم أجاب can_manage=false (خادم أقدم): بلا «عدّل الوجبة»');
    });
    await step('F المغلق', async () => {
      fresh('manager', { loadOverviewJson: () => overview() }, { hall_sheet: () => sheetJson({ status: 'closed' }) });
      await mount('/broiler/hall/h-5');
      t.ok(text().includes('هلاكات قاعة (5)') && byAction('hall-back').length === 1, 'F ضابط: الوجبة المغلقة تُعرض');
      t.same([byAction('sheet-edit').length, byAction('sheet-reopen').length], [0, 1], 'F وجبة مغلقة بلا «عدّل الوجبة» (الخادم يرفضه flock_closed)، و«أعِد فتحها» بدلها');
    });

    // ── O: النافذة من حزمة القاعات خارج التثبيت المسبق؛ بلا نت (فشل تحميلها) تقول إنّ التعديل يحتاج اتصالاً بدل أن تختفي ─────────────
    await step('O بلا حزمة القاعات', async () => {
      fresh('manager', { loadOverviewJson: () => overview() });
      globalThis.__fe.hallsFail = true;
      await mount('/broiler');
      await click(inRow('قاعة 5', 'flock-edit')[0]);
      t.same([byAction('flock-edit-offline').length, Boolean(editDialog()), byAction('flock-edit-save').length, byAction('flock-delete').length], [1, true, 0, 0],
        'O بلا حزمة القاعات: نافذة «تعديل فوج» تقول إنّ التعديل يحتاج اتصالاً، بلا حفظ ولا حذف');
    });
  } finally {
    delete globalThis.__fe;
    restore();
  }
}
