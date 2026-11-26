// «احذف القاعة» كأنّها لم تكن (0037، كلمة الزبون 2026-11-26: «هذن القاعات أريد أحذف منهم، ما گاعد أگدر أحذف… بالبداية سوّيت تجريبيات»؛ عقد 0037
// الجزء H). الشاشات الحقيقية (FarmRoutes: جدول الحقل، ونافذتا القاعة والحذف من حزمة القاعات الحقيقية) بـreact-dom/client الحقيقي على DOM صغير (dom.mjs)،
// وrepo الحذف الحقيقي (loadDeleteHallPreview وdeleteHall ومحلّلاهما) على core بديل يسجّل كلّ نداء، وقراءة الحقل وكتابات القاعة والفوج بدائل.
// P المحلّلان بصرامة بأشكال العقد (fixtures/delete-hall-0037.hand.json)، والنداءان بمعاملاتهما.
// B «احذف» لكلّ قاعة يديرها المستخدم بفوج أو بلا فوج (بدل «أرشف» للفارغة وحدها)، ولا شيء بلا إدارة.
// L وR وE وN وK حالات النافذة: القراءة، وفشلها بـ«أعد المحاولة»، وما سيحدث (يرجع إلى المخزن، وأيّامه، والدورات المنتهية)، والقاعة بلا فوج، وما يمنع بلا زرّ.
// C الحذف بنسخة ما عُرض وبصمته ومرجع من الجهاز مرّة واحدة، ومشغول أثناءه، ورسالة تسمّي ما رجع، ثمّ القراءة من جديد. U نتيجة لا تُعرف: «أعد المحاولة»
// بالطلب نفسه. S stale_plan وstale_hall ومنعٌ جديد: قراءة جديدة تُقال، ثمّ الحذف بالبصمة الجديدة والمرجع نفسه. A المحذوفة قبلاً. G hall_not_found. O بلا حزمة القاعات.
// D «احذف القاعة» في «عدّل القاعة» يفتح نافذة الحذف ولا يرسل النموذج. F نافذتا القاعة والفوج نموذجان يُرسلان (زرّ type="submit" form=…).
// T جمل الرفض (التلميح أوّلاً) وسبب الركن flock_void. I عيّنات القاعدة الحقيقية (delete-hall-0037.json من الجزء D حين تصل) بالمحلّلين والنافذة.
// كلّ فحص هنا يفشل على 31aa9e0 (لا hallDelete ولا نافذة الحذف ولا «احذف» ولا النموذجان)، إلّا ما وُسم «ضابط».
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURES = path.join(ROOT, 'scripts', 'tests', 'fixtures');
const HAND = JSON.parse(readFileSync(path.join(FIXTURES, 'delete-hall-0037.hand.json'), 'utf8'));
// عيّنات القاعدة الحقيقية (الجزء D: supabase/tests/delete-hall.test.mjs) حين تصل؛ والفحص يقرأ أشكالها أينما كانت في الملف.
const REAL_PATH = path.join(FIXTURES, 'delete-hall-0037.json');
const REAL = existsSync(REAL_PATH) ? JSON.parse(readFileSync(REAL_PATH, 'utf8')) : null;
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const REAL_FLOCKS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'flocks.ts'));
const REAL_HALLS = JSON.stringify(path.join(ROOT, 'src', 'pages', 'halls', 'HallsRoutes.tsx'));
// قراءة الحقل وكتابات القاعة والفوج بدائل؛ والباقي من flocks.ts حقيقيّ.
const OVERRIDES = ['loadOverviewJson', 'loadFlockDetail', 'createHall', 'updateHall', 'openFlock'];
const STUBS = {
  flocks: `export * from ${REAL_FLOCKS}; import { parseOverview as __parseOverview } from ${REAL_FLOCKS}; ${OVERRIDES.map((n) => `export const ${n} = (...a) => globalThis.__dh.call('${n}', a);`).join(' ')}
    export const loadOverview = async () => __parseOverview(await globalThis.__dh.call('loadOverviewJson', []));`,
  session: 'export const useSession = () => globalThis.__dh.session; export const sessionStore = { get: () => globalThis.__dh?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__dh.toasts.push(spec); }; export function Toaster() { return null; }',
  // حزمة القاعات (نافذتا القاعة والحذف منها): حقيقية، أو فشل تحميلها كما بلا نت (hallsFail).
  hallsChunk: `export const loadHalls = () => (globalThis.__dh?.hallsFail ? Promise.reject(new Error('offline')) : import(${REAL_HALLS}));`,
};
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__dh.rpc(fn, args);
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
    name: 'dh-stubs',
    setup(b) {
      b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/flocks$|\/Toast$|\/lib\/hallsChunk$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'dh-stub' }));
      b.onLoad({ filter: /.*/, namespace: 'dh-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
      b.onResolve({ filter: /^\.\/core$/ }, (args) => (/src\/lib\/repo\/(?:flocks|flockEdits|hallSheet|hallDelete)\.ts$/u.test(args.importer.replace(/\\/g, '/')) ? { path: 'core', namespace: 'dh-core' } : undefined));
      b.onLoad({ filter: /.*/, namespace: 'dh-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
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
const load = async (contents) => {
  const result = await build({ ...OPTIONS, stdin: { contents, resolveDir: ROOT, loader: 'tsx' }, plugins });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name, root = body()) => descendants(root).filter((n) => n.getAttribute('data-action') === name);
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
const clone = (value) => JSON.parse(JSON.stringify(value));

const rowOf = (name) => all().find((n) => n.localName === 'tr' && descendants(n).find((c) => c.localName === 'td')?.textContent === name) ?? null;
const inRow = (name, action) => {
  const row = rowOf(name);
  return row ? byAction(action, row) : [];
};
const dialogs = () => all().filter((n) => n.getAttribute('role') === 'dialog');
const dialogTitled = (start) => dialogs().find((n) => descendants(n).some((c) => c.localName === 'h2' && c.textContent.startsWith(start))) ?? null;
const deleteDialog = () => dialogTitled('حذف القاعة');
const deleteText = () => deleteDialog()?.textContent ?? '';
/** سطور ما سيحدث (أو ما يمنع) في نافذة الحذف بترتيبها. */
const linesOf = (action) => {
  const box = byAction(action, deleteDialog() ?? body())[0];
  return box ? descendants(box).filter((n) => n.localName === 'li').map((n) => n.textContent) : null;
};
const confirmButton = () => byAction('hall-delete-confirm', deleteDialog() ?? body())[0] ?? null;
const cancelButton = () => byAction('hall-delete-cancel', deleteDialog() ?? body())[0] ?? null;
/**
 * زرّ حفظ في ذيل نافذة مربوط بنموذجها (type="submit" form=…): نقرته في المتصفّح ترسل النموذج إن لم يكن معطّلاً، وDOM الفحص لا يرسل بالنقر، فيُرسل
 * النموذج نفسه هنا. ولا نموذج (الشفرة القديمة) = لا إرسال.
 */
const formOf = (button) => (button ? all().find((n) => n.localName === 'form' && n.id !== '' && n.id === button.getAttribute('form')) ?? null : null);
const submitVia = async (button) => {
  const form = button && !disabled(button) ? formOf(button) : null;
  if (form) fire(form, 'submit');
  await settle(40);
};

/** كلّ كائن في الشجرة بمفاتيح شكلٍ (عيّنات الجزء D أينما كانت في ملفّها). */
function shapes(root, keys) {
  const found = [];
  const walk = (value) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      if (keys.every((key) => key in value)) found.push(value);
      Object.values(value).forEach(walk);
    }
  };
  walk(root);
  return found;
}

export default async function (t) {
  // ── P: المحلّلان الحقيقيّان وجمل الرفض ونداءا repo (حزمة وحدها: على 31aa9e0 لا hallDelete، فيفشل كلّ فحص وحده) ─────────────────
  let p = {};
  try {
    p = await load(
      [
        "export * from './src/lib/repo/hallDelete.ts';",
        "export { FlockShapeError } from './src/lib/repo/flocks.ts';",
        "export { deleteHallFailure, deletedToast } from './src/pages/farm/DeleteHallDialog.tsx';",
        "export { RejectedError, NetworkError, UnknownOutcomeError } from './src/lib/errors.ts';",
      ].join('\n'),
    );
  } catch (error) {
    t.ok(false, `P حزمة المحلّلين لا تُبنى: ${String(error?.message ?? error).split('\n')[0]}`);
  }
  const shape = (fn) => {
    try {
      fn();
      return 'ok';
    } catch (error) {
      return p.FlockShapeError && error instanceof p.FlockShapeError ? error.message : `threw:${error?.message ?? error}`;
    }
  };
  const PREVIEW = HAND.preview;
  const DELETED = HAND.delete;
  const H8 = PREVIEW.running.hall.id;
  const H4 = PREVIEW.empty.hall.id;
  const H5 = PREVIEW.blocked.hall.id;
  const H6 = PREVIEW.preparing.hall.id;
  {
    const parsed = safe(() => p.parseDeleteHallPreview(PREVIEW.running, H8));
    t.same(
      safe(() => ({ hall: parsed.hall, flock: { ...parsed.flock, back: undefined }, ended: parsed.ended, blocks: parsed.blocks, plan: parsed.plan })),
      {
        hall: { id: H8, name: 'قاعة 8 تجريبي', siteId: PREVIEW.running.hall.site_id, site: 'حقل لحم', version: 3 },
        flock: { id: PREVIEW.running.flock.id, version: 9, status: 'active', placedOn: '2026-11-13', placedCount: 25250, days: 14, visits: 14, gasDays: 13, weights: 0, logs: 0, vaccinations: 1, issues: 7 },
        ended: 2,
        blocks: [],
        plan: PREVIEW.running.plan,
      },
      'P ما سيُحذف لقاعة بفوج قائم: القاعة ونسختها، والفوج بعدّاته، والدورات المنتهية، والبصمة',
    );
    t.same(
      safe(() => parsed.flock.back.map((row) => [row.warehouse, row.item, row.qty, row.baseUnit])),
      [
        ['رصيد العلف', 'علف م/1', 14_000_000n, 'kg'],
        ['رصيد العلف', 'علف م/2', 1_500_000n, 'kg'],
        ['مخزن الأدوية', 'فيتامين AD3', 2_500n, 'L'],
      ],
      'P ما يرجع إلى المخزن بترتيب الخادم، والكمية بالآلاف بوحدة أساس المادّة',
    );
    t.same(safe(() => [p.parseDeleteHallPreview(PREVIEW.empty, H4).flock, p.parseDeleteHallPreview(PREVIEW.empty, H4).ended]), [null, 1], 'P القاعة بلا فوج: flock null، ودورتها المنتهية');
    t.same(
      safe(() => p.parseDeleteHallPreview(PREVIEW.blocked, H5).blocks.map((block) => block.code)),
      ['sales', 'tickets'],
      'P ما يمنع الحذف برموزه وجمله كما هي',
    );
    t.same(
      safe(() => {
        const flock = p.parseDeleteHallPreview(PREVIEW.preparing, H6).flock;
        return [flock.status, flock.placedOn, flock.placedCount, flock.days, flock.back.length];
      }),
      ['preparing', null, null, 0, 0],
      'P فوج قيد التجهيز: التسكين وعدده null يُقرآن null',
    );
    const running = PREVIEW.running;
    const withFlock = (over) => ({ ...clone(running), flock: { ...clone(running.flock), ...over } });
    const withBack = (over) => withFlock({ back: [{ ...clone(running.flock.back[0]), ...over }] });
    const without = (key) => {
      const copy = clone(running);
      delete copy[key];
      return copy;
    };
    t.same(
      [
        shape(() => p.parseDeleteHallPreview(without('plan'), H8)),
        shape(() => p.parseDeleteHallPreview({ ...clone(running), plan: '' }, H8)),
        shape(() => p.parseDeleteHallPreview(without('ended'), H8)),
        shape(() => p.parseDeleteHallPreview({ ...clone(running), ended: -1 }, H8)),
        shape(() => p.parseDeleteHallPreview(without('flock'), H8)),
        shape(() => p.parseDeleteHallPreview({ ...clone(running), blocks: [{ code: 'mystery', text: 'x' }] }, H8)),
        shape(() => p.parseDeleteHallPreview({ ...clone(running), blocks: [{ code: 'sales', text: '' }] }, H8)),
        shape(() => p.parseDeleteHallPreview(running, H4)),
        shape(() => p.parseDeleteHallPreview({ ...clone(running), hall: { ...clone(running.hall), version: '3' } }, H8)),
        shape(() => p.parseDeleteHallPreview(withFlock({ status: 'closed' }), H8)),
        shape(() => p.parseDeleteHallPreview(withFlock({ placed_on: '13/11/2026' }), H8)),
        shape(() => p.parseDeleteHallPreview(withFlock({ days: 1.5 }), H8)),
        shape(() => p.parseDeleteHallPreview(withBack({ qty: '14,000.000' }), H8)),
        shape(() => p.parseDeleteHallPreview(withBack({ qty: '-1.000' }), H8)),
        shape(() => p.parseDeleteHallPreview(withBack({ qty: '0.000' }), H8)),
        shape(() => p.parseDeleteHallPreview(withBack({ qty: '1.2345' }), H8)),
        shape(() => p.parseDeleteHallPreview(withBack({ base_unit: 'ton' }), H8)),
        shape(() => p.parseDeleteHallPreview(withBack({ warehouse: null }), H8)),
        shape(() => p.parseDeleteHallPreview([running], H8)),
      ],
      [
        'flock_shape:plan', 'flock_shape:plan', 'flock_shape:ended', 'flock_shape:ended', 'flock_shape:flock', 'flock_shape:code', 'flock_shape:text', 'flock_shape:hall',
        'flock_shape:version', 'flock_shape:status', 'flock_shape:placed_on', 'flock_shape:days', 'flock_shape:qty', 'flock_shape:qty', 'flock_shape:qty', 'flock_shape:qty',
        'flock_shape:base_unit', 'flock_shape:warehouse', 'flock_shape:delete_hall_preview',
      ],
      'P الصرامة: مفتاح غائب أو بنوع آخر، ورمز منع مجهول، وقاعة غير المطلوبة، وفوج مغلق، ويوم بغير YYYY-MM-DD، وكمية بفواصل أو سالبة أو صفر أو بأربع مراتب — كلّها خطأ شكل باسم مفتاحه',
    );
    t.same(
      safe(() => {
        const done = p.parseDeletedHall(DELETED.running, H8);
        return [done.already, done.flockId, done.voidedIssues, done.back.map((row) => row.qty)];
      }),
      [false, PREVIEW.running.flock.id, 7, [14_000_000n, 1_500_000n, 2_500n]],
      'P جواب الحذف: الفوج الملغى وعدد الصرف الملغى وما رجع',
    );
    t.same(
      safe(() => [p.parseDeletedHall(DELETED.empty, H4), p.parseDeletedHall(DELETED.already, H8)].map((done) => [done.already, done.flockId, done.voidedIssues, done.back.length])),
      [
        [false, null, 0, 0],
        [true, null, 0, 0],
      ],
      'P القاعة بلا فوج (flock_id null)، والمحذوفة قبلاً (بلا flock_id ولا voided_issues) تُقرأ null وصفراً',
    );
    const deletedWithout = (key) => {
      const copy = clone(DELETED.running);
      delete copy[key];
      return copy;
    };
    t.same(
      [
        shape(() => p.parseDeletedHall(DELETED.running, H4)),
        shape(() => p.parseDeletedHall({ ...clone(DELETED.running), deleted: false }, H8)),
        shape(() => p.parseDeletedHall(deletedWithout('already'), H8)),
        shape(() => p.parseDeletedHall(deletedWithout('flock_id'), H8)),
        shape(() => p.parseDeletedHall(deletedWithout('voided_issues'), H8)),
        shape(() => p.parseDeletedHall({ ...clone(DELETED.running), back: null }, H8)),
      ],
      ['flock_shape:hall_id', 'flock_shape:deleted', 'flock_shape:already', 'flock_shape:flock_id', 'flock_shape:voided_issues', 'flock_shape:back'],
      'P صرامة جواب الحذف: القاعة المطلوبة، وdeleted صحيح، والحذف الجديد بفوجه (ولو null) وعدد صرفه',
    );

    // النداءان بمعاملاتهما على core البديل.
    const calls = [];
    globalThis.__dh = {
      rpc(fn, args) {
        calls.push([fn, args]);
        return Promise.resolve(fn === 'delete_hall_preview' ? PREVIEW.running : DELETED.running);
      },
    };
    const preview = await Promise.resolve(safe(() => p.loadDeleteHallPreview(H8))).catch((error) => `threw:${error?.message}`);
    const done = await Promise.resolve(safe(() => p.deleteHall(H8, 3, PREVIEW.running.plan, '11111111-2222-4333-8444-555555555555'))).catch((error) => `threw:${error?.message}`);
    t.same(
      [calls, preview?.plan, done?.voidedIssues],
      [
        [
          ['delete_hall_preview', { p_hall: H8 }],
          ['delete_hall', { p_hall: H8, p_expected_version: 3, p_expected_plan: PREVIEW.running.plan, p_client_ref: '11111111-2222-4333-8444-555555555555' }],
        ],
        PREVIEW.running.plan,
        7,
      ],
      'P النداءان: delete_hall_preview بالقاعة، وdelete_hall بالقاعة ونسختها وبصمتها ومرجع الجهاز بالضبط',
    );
    delete globalThis.__dh;
  }

  // ── T: جمل الرفض في النافذة (التلميح أوّلاً، وإلّا جملة الرمز)، ورسالة الحذف ─────────────────────────────────────────────────
  {
    const reject = (code, hint = null) => (p.RejectedError ? new p.RejectedError(code, hint) : null);
    t.same(
      ['flock_void', 'hall_has_sales', 'hall_has_tickets', 'hall_has_carry', 'stale_plan', 'stale_hall', 'period_locked'].map((code) => safe(() => p.deleteHallFailure(reject(code)))),
      [
        'حُذفت قاعة هذا الفوج، فلا يُعرض ولا يُسجَّل له شيء.',
        'في فوج القاعة بيع طيور: ألغِ فاتورته أوّلاً ثمّ احذف القاعة.',
        'لفوج القاعة تذكرة وزن: ألغِها أوّلاً ثمّ احذف القاعة.',
        'في فوج القاعة علف منقول من الدورة السابقة ما زال مطبَّقاً، فلا تُحذف القاعة الآن.',
        'تغيّر ما في القاعة بعد فتح النافذة. راجع ما سيُحذف ثمّ احذف.',
        'تغيّرت القاعة بعد فتح النافذة. راجع ما سيُحذف ثمّ احذف.',
        'يوم تسكين الفوج أو اليوم في فترة حسابات مقفلة، فلا تُحذف القاعة قبل فتح الفترة.',
      ],
      'T جملة لكلّ رمز حين يرفض الخادم بلا تلميح',
    );
    t.same(
      [safe(() => p.deleteHallFailure(reject('period_locked', 'الفترة حتى 30/11/2026 مقفلة.'))), safe(() => p.deleteHallFailure(reject('hall_has_sales', 'في الفوج بيع طيور (فاتورة BS-00012).')))],
      ['الفترة حتى 30/11/2026 مقفلة.', 'في الفوج بيع طيور (فاتورة BS-00012).'],
      'T تلميح الخادم يُعرض كما هو حين يحمله',
    );
    t.same(safe(() => p.deleteHallFailure(reject('mystery'))), 'الخادم رفض العملية لم يُحفظ شيء (الرمز: mystery).', 'T رمز لا جملة له: وصف الخطأ برمزه');
    t.same(
      safe(() => p.deletedToast(p.parseDeletedHall(DELETED.running, H8), 'قاعة 8 تجريبي')),
      {
        tone: 'success',
        title: 'حُذفت القاعة «قاعة 8 تجريبي».',
        detail: 'رجع إلى المخزن: 14,000 كغم «علف م/1» إلى «رصيد العلف»، 1,500 كغم «علف م/2» إلى «رصيد العلف»، 2.5 لتر «فيتامين AD3» إلى «مخزن الأدوية».',
      },
      'T رسالة الحذف تسمّي ما رجع إلى المخزن: كمّيته ومادّته ومخزنه',
    );
    t.same(
      [safe(() => p.deletedToast(p.parseDeletedHall(DELETED.empty, H4), 'قاعة 4')), safe(() => p.deletedToast(p.parseDeletedHall(DELETED.already, H8), 'قاعة 8 تجريبي'))],
      [
        { tone: 'success', title: 'حُذفت القاعة «قاعة 4».' },
        { tone: 'info', title: 'القاعة «قاعة 8 تجريبي» محذوفة من قبل، فلم يتغيّر شيء.' },
      ],
      'T بلا ما يرجع: «حُذفت» وحدها؛ والمحذوفة قبلاً «لم يتغيّر شيء» لا «حُذفت»',
    );
  }

  // ── I: كلّ عيّنة بأشكال العقد (اليدوية والحقيقية من الجزء D حين تصل) تمرّ بالمحلّلين ─────────────────────────────────────────
  const samples = [HAND, ...(REAL ? [REAL] : [])];
  const previews = samples.flatMap((root) => shapes(root, ['hall', 'flock', 'ended', 'blocks', 'plan']));
  const results = samples.flatMap((root) => shapes(root, ['hall_id', 'deleted', 'already', 'back']));
  t.same(
    [previews.filter((one) => typeof safe(() => p.parseDeleteHallPreview(one, one.hall?.id)) === 'string').length, results.filter((one) => typeof safe(() => p.parseDeletedHall(one, one.hall_id)) === 'string').length],
    [0, 0],
    `I العيّنات (${previews.length} لما سيُحذف و${results.length} للحذف${REAL ? '، ومعها عيّنات القاعدة الحقيقية' : ''}) تمرّ بالمحلّلين بلا خطأ شكل`,
  );
  t.ok(previews.length >= 4 && results.length >= 3, 'I ضابط: العيّنات وُجدت بأشكالها');

  const restore = installDom();
  try {
    const m = await load(
      [
        "export { createElement as h } from 'react';",
        "export { createRoot } from 'react-dom/client';",
        "export { flushSync } from 'react-dom';",
        "export { MemoryRouter, Routes, Route } from 'react-router-dom';",
        "export { default as FarmRoutes } from './src/pages/farm/FarmRoutes.tsx';",
        "export { onlineStore } from './src/lib/online.ts';",
        "export { localDay, addDays } from './src/domain/dates.ts';",
        "export { parkText } from './src/pages/farm/roundText.ts';",
        "export { RejectedError, NetworkError, UnknownOutcomeError } from './src/lib/errors.ts';",
      ].join('\n'),
    );
    m.onlineStore.set(true);

    // سبب ركن عملية جولة لفوج حُذفت قاعته (D1: الطابور يركنها flock_void) بجملة لا «رُدّ من الخادم».
    t.same(m.parkText('flock_void'), 'كانت قاعة الوجبة محذوفة حين وصل', 'T سبب الركن flock_void بجملة في الجولة وورقة القاعة');

    const TODAY = m.localDay();
    const PLACED = m.addDays(TODAY, -13);
    const ws = (role) => ({
      userId: 'u-1', orgId: 'org-1', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role, scopes: [], divisions: ['broiler', 'layer'],
      canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1,
    });
    const flockJson = (id, over = {}) => ({
      id, kind: 'broiler', breed: null, status: 'active', version: 9, placed_on: PLACED, placed_count: 25250, age_days_at_placement: 0, age_days: 13,
      days_since_placement: 14, dead_total: 40, culled_total: 10, live: 25200, live_start_today: 25200, mortality_pct: '0.20', feed_kg_total: '15500.000',
      feed_days: 13, feed_span_days: 13, last_weight: null, fcr: null, today: null, eggs_today: null, hdep_today: null, rejects_pending: 0, ...over,
    });
    const hallJson = (preview, flock) => ({ id: preview.hall.id, name: preview.hall.name, capacity: 30000, version: preview.hall.version, flock });
    const overview = ({ canManage = true } = {}) => ({
      today: TODAY,
      sites: [
        {
          id: PREVIEW.running.hall.site_id, name: 'حقل لحم', division_id: 'd-b', kind: 'broiler', can_manage: canManage,
          halls: [
            hallJson(PREVIEW.running, flockJson(PREVIEW.running.flock.id)),
            hallJson(PREVIEW.empty, null),
            hallJson(PREVIEW.blocked, flockJson(PREVIEW.blocked.flock.id, { version: 12 })),
            hallJson(PREVIEW.preparing, flockJson(PREVIEW.preparing.flock.id, { status: 'preparing', version: 1, placed_on: null, placed_count: null, age_days: null, days_since_placement: null })),
          ],
        },
      ],
    });
    const previewOf = (hallId) => Object.values(PREVIEW).find((one) => one.hall.id === hallId);

    let root = null;
    const fresh = (handlers, rpc = {}, role = 'manager') => {
      const calls = [];
      globalThis.__dh = {
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
    const mount = async (url = '/broiler') => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(m.Routes, null, m.h(m.Route, { path: '/broiler/*', element: m.h(m.FarmRoutes, { kind: 'broiler' }) })))));
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
      delete globalThis.__dh;
    };
    const toasts = () => globalThis.__dh.toasts.map((spec) => [spec.tone, spec.title, spec.detail ?? null]);
    const reads = (calls) => named(calls, 'loadOverviewJson').length;
    const PREVIEW_RPC = { delete_hall_preview: (args) => previewOf(args.p_hall) };
    const openDelete = async (name) => {
      await click(inRow(name, 'hall-delete')[0]);
      await settle(40);
    };

    // ── B: «احذف» لكلّ قاعة يديرها المستخدم ───────────────────────────────────────────────────────────────────────────
    await step('B', async () => {
      fresh({ loadOverviewJson: () => overview() });
      await mount();
      t.ok(rowOf('قاعة 8 تجريبي') !== null && rowOf('قاعة 4') !== null, 'B ضابط: القاعات ظاهرة');
      t.same(
        ['قاعة 8 تجريبي', 'قاعة 4', 'قاعه 5 تجريبي', 'قاعه 6 تجريبي'].map((name) => inRow(name, 'hall-delete').map((n) => n.textContent).join('|')),
        ['احذف', 'احذف', 'احذف', 'احذف'],
        'B «احذف» لكلّ قاعة: بفوج نشط، وفارغة، وبفوج يمنع حذفه، وبفوج قيد التجهيز (كان «أرشف» للفارغة وحدها)',
      );
      t.same(byAction('hall-archive').length, 0, 'B لا «أرشف» بعد');
    });
    await step('B بلا إدارة', async () => {
      fresh({ loadOverviewJson: () => overview({ canManage: false }) });
      await mount();
      t.ok(rowOf('قاعة 8 تجريبي') !== null, 'B ضابط: القاعات ظاهرة بلا إدارة');
      t.same(byAction('hall-delete').length, 0, 'B الخادم أجاب can_manage=false: بلا «احذف»');
    });

    // ── L وR: القراءة وفشلها ─────────────────────────────────────────────────────────────────────────────────────────
    await step('L', async () => {
      const calls = fresh({ loadOverviewJson: () => overview() }, { delete_hall_preview: () => new Promise(() => {}) });
      await mount();
      await openDelete('قاعة 8 تجريبي');
      t.same(
        [Boolean(deleteDialog()), deleteText().includes('حذف القاعة «قاعة 8 تجريبي»؟'), byAction('hall-delete-loading', deleteDialog() ?? body())[0]?.textContent ?? null],
        [true, true, 'جارٍ التحقّق ممّا في القاعة…'],
        'L النافذة بعنوان القاعة، و«جارٍ التحقّق ممّا في القاعة…» أثناء القراءة',
      );
      t.same([confirmButton(), cancelButton()?.textContent ?? null, named(calls, 'rpc:delete_hall_preview')], [null, 'أغلق', [{ p_hall: H8 }]], 'L بلا زرّ حذف قبل القراءة، والقراءة delete_hall_preview للقاعة');
    });
    await step('R', async () => {
      let attempt = 0;
      const calls = fresh(
        { loadOverviewJson: () => overview() },
        {
          delete_hall_preview: (args) => {
            attempt += 1;
            if (attempt === 1) throw new m.NetworkError();
            return previewOf(args.p_hall);
          },
        },
      );
      await mount();
      await openDelete('قاعة 8 تجريبي');
      t.same(
        [deleteText().includes('تعذّر تحميل ما في القاعة'), byAction('retry', deleteDialog() ?? body())[0]?.textContent ?? null, confirmButton()],
        [true, 'أعد المحاولة', null],
        'R فشل القراءة: جملته و«أعد المحاولة»، بلا زرّ حذف',
      );
      await click(byAction('retry', deleteDialog() ?? body())[0]);
      t.same([named(calls, 'rpc:delete_hall_preview').length, confirmButton()?.textContent ?? null], [2, 'احذف القاعة'], 'R «أعد المحاولة» تقرأ من جديد، ثمّ ما سيحدث وزرّ الحذف');
    });

    // ── E وN وK: ما سيحدث، والقاعة بلا فوج، وما يمنع ─────────────────────────────────────────────────────────────────────
    await step('E', async () => {
      fresh({ loadOverviewJson: () => overview() }, PREVIEW_RPC);
      await mount();
      await openDelete('قاعة 8 تجريبي');
      t.ok(deleteText().includes('سيُلغى فوج القاعة كأنّه لم يكن:'), 'E «سيُلغى فوج القاعة كأنّه لم يكن:»');
      t.same(
        linesOf('hall-delete-effects'),
        [
          'يرجع إلى «رصيد العلف» 14,000 كغم «علف م/1»',
          'يرجع إلى «رصيد العلف» 1,500 كغم «علف م/2»',
          'يرجع إلى «مخزن الأدوية» 2.5 لتر «فيتامين AD3»',
          'تختفي أيّامه (14 يوماً) من كلّ التقارير',
          'الدورات المنتهية في القاعة (2) تبقى في التقارير',
        ],
        'E سطر لكلّ ما يرجع إلى مخزنه بكمّيته ووحدته، ثمّ أيّامه، ثمّ الدورات المنتهية التي تبقى',
      );
      const confirm = confirmButton();
      t.same(
        [confirm?.textContent ?? null, disabled(confirm), (confirm?.getAttribute('class') ?? '').includes('bg-danger-600'), cancelButton()?.textContent ?? null],
        ['احذف القاعة', false, true, 'لا، تراجع'],
        'E «احذف القاعة» بلون الخطر و«لا، تراجع»',
      );
    });
    await step('N', async () => {
      fresh({ loadOverviewJson: () => overview() }, PREVIEW_RPC);
      await mount();
      await openDelete('قاعة 4');
      t.same(
        [linesOf('hall-delete-effects'), deleteText().includes('سيُلغى فوج'), confirmButton()?.textContent ?? null],
        [['تختفي القاعة من الحقل والجولة اليومية', 'الدورات المنتهية في القاعة (1) تبقى في التقارير'], false, 'احذف القاعة'],
        'N القاعة بلا فوج: تختفي من الحقل والجولة، ودورتها المنتهية تبقى',
      );
    });
    await step('N قيد التجهيز', async () => {
      fresh({ loadOverviewJson: () => overview() }, PREVIEW_RPC);
      await mount();
      await openDelete('قاعه 6 تجريبي');
      t.same([linesOf('hall-delete-effects'), deleteText().includes('سيُلغى فوج القاعة كأنّه لم يكن:')], [['لم تُسجَّل له أيّام بعد'], true], 'N فوج بلا أيّام ولا صرف: «لم تُسجَّل له أيّام بعد» لا «(0 يوم)»');
    });
    await step('K', async () => {
      fresh({ loadOverviewJson: () => overview() }, PREVIEW_RPC);
      await mount();
      await openDelete('قاعه 5 تجريبي');
      t.same(
        [linesOf('hall-delete-blocks'), linesOf('hall-delete-effects'), confirmButton(), cancelButton()?.textContent ?? null],
        [PREVIEW.blocked.blocks.map((block) => block.text), null, null, 'أغلق'],
        'K ما يمنع الحذف بجمل الخادم سطراً سطراً، بلا ما سيحدث وبلا زرّ حذف',
      );
    });

    // ── C: الحذف ─────────────────────────────────────────────────────────────────────────────────────────────────────
    await step('C', async () => {
      let answer = () => {};
      const calls = fresh(
        { loadOverviewJson: () => overview() },
        {
          ...PREVIEW_RPC,
          delete_hall: () =>
            new Promise((resolve) => {
              answer = () => resolve(DELETED.running);
            }),
        },
      );
      await mount();
      await openDelete('قاعة 8 تجريبي');
      await click(confirmButton());
      const [first] = named(calls, 'rpc:delete_hall');
      t.same(
        first ? { ...first, p_client_ref: UUID.test(first.p_client_ref ?? '') ? 'uuid' : first.p_client_ref } : null,
        { p_hall: H8, p_expected_version: 3, p_expected_plan: PREVIEW.running.plan, p_client_ref: 'uuid' },
        'C delete_hall بنسخة القاعة وبصمة ما عُرض ومرجع من الجهاز',
      );
      t.same(
        [confirmButton()?.getAttribute('aria-busy') ?? null, disabled(confirmButton()), disabled(cancelButton()), deleteDialog()?.getAttribute('aria-busy') ?? null],
        ['true', true, true, 'true'],
        'C مشغول أثناء الحذف: الزرّان معطّلان والنافذة مقفولة',
      );
      await click(confirmButton());
      t.eq(named(calls, 'rpc:delete_hall').length, 1, 'C نقرة ثانية أثناء الحذف لا ترسل ثانياً');
      answer();
      await settle(60);
      t.same(
        toasts(),
        [['success', 'حُذفت القاعة «قاعة 8 تجريبي».', 'رجع إلى المخزن: 14,000 كغم «علف م/1» إلى «رصيد العلف»، 1,500 كغم «علف م/2» إلى «رصيد العلف»، 2.5 لتر «فيتامين AD3» إلى «مخزن الأدوية».']],
        'C رسالة الحذف تسمّي ما رجع إلى المخزن',
      );
      t.same([deleteDialog(), reads(calls)], [null, 2], 'C النافذة تُغلق والحقل يُقرأ من جديد');
    });
    await step('A', async () => {
      const calls = fresh({ loadOverviewJson: () => overview() }, { ...PREVIEW_RPC, delete_hall: () => DELETED.already });
      await mount();
      await openDelete('قاعة 8 تجريبي');
      await click(confirmButton());
      t.same([toasts(), deleteDialog(), reads(calls)], [[['info', 'القاعة «قاعة 8 تجريبي» محذوفة من قبل، فلم يتغيّر شيء.', null]], null, 2], 'A المحذوفة قبلاً: «لم يتغيّر شيء»، والنافذة تُغلق والحقل يُقرأ من جديد');
    });

    // ── U: نتيجة لا تُعرف ثمّ الإعادة بالطلب نفسه ─────────────────────────────────────────────────────────────────────────
    await step('U', async () => {
      let attempt = 0;
      const calls = fresh(
        { loadOverviewJson: () => overview() },
        {
          ...PREVIEW_RPC,
          delete_hall: () => {
            attempt += 1;
            if (attempt === 1) throw new m.UnknownOutcomeError();
            return DELETED.running;
          },
        },
      );
      await mount();
      await openDelete('قاعة 8 تجريبي');
      await click(confirmButton());
      t.same(
        [byAction('hall-delete-problem', deleteDialog() ?? body())[0]?.textContent.includes('نتيجة العملية غير معروفة') ?? false, confirmButton()?.textContent ?? null, named(calls, 'rpc:delete_hall_preview').length, toasts().length],
        [true, 'أعد المحاولة', 1, 0],
        'U جواب ضاع: النافذة تقول إنّ النتيجة غير معروفة و«أعد المحاولة»، بلا قراءة جديدة',
      );
      await click(confirmButton());
      const [first, second] = named(calls, 'rpc:delete_hall');
      t.same([second?.p_client_ref === first?.p_client_ref, second?.p_expected_plan, second?.p_expected_version], [true, PREVIEW.running.plan, 3], 'U الإعادة بالطلب نفسه: المرجع والبصمة والنسخة');
      t.same([toasts()[0]?.[0] ?? null, deleteDialog()], ['success', null], 'U ثمّ تُحذف وتُغلق النافذة');
    });
    await step('U إغلاق', async () => {
      const calls = fresh(
        { loadOverviewJson: () => overview() },
        {
          ...PREVIEW_RPC,
          delete_hall: () => {
            throw new m.UnknownOutcomeError();
          },
        },
      );
      await mount();
      await openDelete('قاعة 8 تجريبي');
      await click(confirmButton());
      await click(cancelButton());
      t.same([deleteDialog(), reads(calls)], [null, 2], 'U إغلاق النافذة والنتيجة لا تُعرف: الحقل يُقرأ من جديد (ربما حُذفت)');
    });
    await step('U شبكة', async () => {
      let attempt = 0;
      const calls = fresh(
        { loadOverviewJson: () => overview() },
        {
          ...PREVIEW_RPC,
          delete_hall: () => {
            attempt += 1;
            if (attempt === 1) throw new m.NetworkError();
            return DELETED.running;
          },
        },
      );
      await mount();
      await openDelete('قاعة 8 تجريبي');
      await click(confirmButton());
      t.same(
        [byAction('hall-delete-problem', deleteDialog() ?? body())[0]?.textContent.includes('تعذّر الوصول إلى الخادم') ?? false, confirmButton()?.textContent ?? null],
        [true, 'احذف القاعة'],
        'U لم يصل الطلب: جملته، و«احذف القاعة» باقٍ',
      );
      await click(confirmButton());
      const [first, second] = named(calls, 'rpc:delete_hall');
      t.same([named(calls, 'rpc:delete_hall').length, second?.p_client_ref === first?.p_client_ref, deleteDialog()], [2, true, null], 'U المحاولة الثانية بمرجع النافذة نفسه ثمّ تُحذف');
    });

    // ── S: تغيّر ما في القاعة بعد فتح النافذة ─────────────────────────────────────────────────────────────────────────
    const HINT = 'تغيّر ما في القاعة بعد فتح النافذة. راجع ما سيُحذف ثمّ احذف.';
    await step('S stale_plan', async () => {
      let previews = 0;
      const fresher = { ...clone(PREVIEW.running), plan: 'aaaa1111bbbb2222cccc3333dddd4444', hall: { ...clone(PREVIEW.running.hall), version: 4 } };
      fresher.flock.back[0].qty = '16000.000';
      const calls = fresh(
        { loadOverviewJson: () => overview() },
        {
          delete_hall_preview: () => {
            previews += 1;
            return previews === 1 ? PREVIEW.running : fresher;
          },
          delete_hall: (args) => {
            if (args.p_expected_plan === PREVIEW.running.plan) throw new m.RejectedError('stale_plan', HINT);
            return DELETED.running;
          },
        },
      );
      await mount();
      await openDelete('قاعة 8 تجريبي');
      await click(confirmButton());
      const problem = byAction('hall-delete-problem', deleteDialog() ?? body())[0]?.textContent ?? '';
      t.same(
        [problem.includes(HINT), problem.includes('قُرئ ما في القاعة من جديد'), previews, linesOf('hall-delete-effects')?.[0] ?? null, reads(calls)],
        [true, true, 2, 'يرجع إلى «رصيد العلف» 16,000 كغم «علف م/1»', 2],
        'S stale_plan: التلميح ومعه «قُرئ ما في القاعة من جديد»، وما سيحدث كما قُرئ الآن، والحقل يُقرأ من جديد',
      );
      await click(confirmButton());
      const [first, second] = named(calls, 'rpc:delete_hall');
      t.same(
        [second?.p_expected_plan, second?.p_expected_version, second?.p_client_ref === first?.p_client_ref, toasts()[0]?.[0] ?? null, deleteDialog()],
        ['aaaa1111bbbb2222cccc3333dddd4444', 4, true, 'success', null],
        'S الحذف بعدها بالبصمة والنسخة الجديدتين وبمرجع النافذة نفسه',
      );
    });
    await step('S stale_hall', async () => {
      const calls = fresh(
        { loadOverviewJson: () => overview() },
        {
          ...PREVIEW_RPC,
          delete_hall: () => {
            throw new m.RejectedError('stale_hall', null);
          },
        },
      );
      await mount();
      await openDelete('قاعة 4');
      await click(confirmButton());
      t.same(
        [byAction('hall-delete-problem', deleteDialog() ?? body())[0]?.textContent.includes('تغيّرت القاعة بعد فتح النافذة. راجع ما سيُحذف ثمّ احذف.') ?? false, named(calls, 'rpc:delete_hall_preview').length, reads(calls)],
        [true, 2, 2],
        'S stale_hall بلا تلميح: جملته، وقراءة جديدة لما في القاعة وللحقل',
      );
    });
    await step('S منع جديد', async () => {
      let previews = 0;
      const blockedNow = { ...clone(PREVIEW.running), blocks: [{ code: 'sales', text: 'في الفوج بيع طيور (فاتورة BS-00019)؛ ألغِ الفاتورة أوّلاً ثمّ احذف القاعة.' }] };
      fresh(
        { loadOverviewJson: () => overview() },
        {
          delete_hall_preview: () => {
            previews += 1;
            return previews === 1 ? PREVIEW.running : blockedNow;
          },
          delete_hall: () => {
            throw new m.RejectedError('hall_has_sales', 'في الفوج بيع طيور (فاتورة BS-00019)؛ ألغِ الفاتورة أوّلاً ثمّ احذف القاعة.');
          },
        },
      );
      await mount();
      await openDelete('قاعة 8 تجريبي');
      await click(confirmButton());
      t.same(
        [linesOf('hall-delete-blocks'), confirmButton(), byAction('hall-delete-problem', deleteDialog() ?? body())[0]?.textContent.includes('BS-00019') ?? false],
        [['في الفوج بيع طيور (فاتورة BS-00019)؛ ألغِ الفاتورة أوّلاً ثمّ احذف القاعة.'], null, true],
        'S بيعٌ بعد فتح النافذة (hall_has_sales): تُقرأ القاعة من جديد فيظهر المنع بلا زرّ حذف، والتلميح فوقه',
      );
    });

    // ── G وO: قاعة حُذفت قبلاً، وبلا حزمة القاعات ─────────────────────────────────────────────────────────────────────
    await step('G', async () => {
      const calls = fresh(
        { loadOverviewJson: () => overview() },
        {
          delete_hall_preview: () => {
            throw new m.RejectedError('hall_not_found', 'هذه القاعة غير موجودة أو محذوفة.');
          },
        },
      );
      await mount();
      await openDelete('قاعة 8 تجريبي');
      t.same(
        [byAction('hall-delete-gone', deleteDialog() ?? body())[0]?.textContent ?? null, confirmButton(), reads(calls)],
        ['لم تعد القاعة «قاعة 8 تجريبي» في الحقل: حُذفت من قبل.', null, 2],
        'G hall_not_found: «حُذفت من قبل» بلا زرّ حذف، والحقل يُقرأ من جديد فتختفي منه',
      );
    });
    await step('O', async () => {
      const calls = fresh({ loadOverviewJson: () => overview() }, PREVIEW_RPC);
      globalThis.__dh.hallsFail = true;
      await mount();
      await openDelete('قاعة 8 تجريبي');
      t.same([byAction('dialog-offline').length, confirmButton(), named(calls, 'rpc:delete_hall_preview').length], [1, null, 0], 'O بلا حزمة القاعات: نافذة تقول إنّها تحتاج اتصالاً، بلا حذف ولا قراءة');
    });

    // ── D: «احذف القاعة» في «عدّل القاعة» ─────────────────────────────────────────────────────────────────────────────
    const editDialog = () => dialogTitled('تعديل القاعة');
    await step('D', async () => {
      const calls = fresh({ loadOverviewJson: () => overview(), updateHall: () => undefined }, { ...PREVIEW_RPC, delete_hall: () => DELETED.running });
      await mount();
      await click(inRow('قاعة 8 تجريبي', 'hall-edit')[0]);
      const remove = byAction('hall-edit-delete', editDialog() ?? body())[0] ?? null;
      t.same([remove?.textContent ?? null, remove?.getAttribute('type') ?? null, (remove?.getAttribute('class') ?? '').includes('bg-brand-600')], ['احذف القاعة', 'button', false], 'D «احذف القاعة» في ذيل «عدّل القاعة»: زرّ type="button" وليس الزرّ الأساسيّ');
      await click(remove);
      t.same([Boolean(deleteDialog()), Boolean(editDialog()), named(calls, 'updateHall').length, named(calls, 'rpc:delete_hall_preview')], [true, true, 0, [{ p_hall: H8 }]], 'D يفتح نافذة الحذف فوقها ويقرأ ما في القاعة، ولا يحفظ تعديل القاعة');
      await click(cancelButton());
      t.same([deleteDialog(), Boolean(editDialog())], [null, true], 'D «لا، تراجع» يرجع إلى «عدّل القاعة»');
      await click(byAction('hall-edit-delete', editDialog() ?? body())[0]);
      await click(confirmButton());
      t.same([named(calls, 'rpc:delete_hall').length, deleteDialog(), editDialog(), reads(calls), toasts()[0]?.[0] ?? null], [1, null, null, 2, 'success'], 'D الحذف منها يغلق النافذتين ويقرأ الحقل من جديد');
    });
    await step('D إضافة', async () => {
      fresh({ loadOverviewJson: () => overview() });
      await mount();
      await click(byAction('hall-add')[0]);
      t.same([Boolean(dialogTitled('قاعة جديدة')), byAction('hall-edit-delete').length], [true, 0], 'D «أضف قاعة» بلا «احذف القاعة»');
    });
    // صفحة القاعة الفارغة (حزمة القاعات) تفتح «عدّل القاعة» نفسها، فالحذف منها أيضاً، ثمّ تقرأ الحقل فلا تجد القاعة.
    await step('D صفحة القاعة', async () => {
      let deleted = false;
      const after = () => ({ ...overview(), sites: overview().sites.map((site) => ({ ...site, halls: site.halls.filter((hall) => hall.id !== H4) })) });
      const calls = fresh(
        { loadOverviewJson: () => (deleted ? after() : overview()) },
        {
          ...PREVIEW_RPC,
          delete_hall: () => {
            deleted = true;
            return DELETED.empty;
          },
        },
      );
      await mount(`/broiler/hall/${H4}`);
      await settle(60);
      t.ok(byAction('hall-empty').length === 1, 'D ضابط: صفحة القاعة الفارغة');
      await click(byAction('hall-edit')[0]);
      await click(byAction('hall-edit-delete', editDialog() ?? body())[0]);
      t.same(linesOf('hall-delete-effects'), ['تختفي القاعة من الحقل والجولة اليومية', 'الدورات المنتهية في القاعة (1) تبقى في التقارير'], 'D صفحة القاعة: «عدّل القاعة» ← «احذف القاعة» يقول ما سيحدث');
      await click(confirmButton());
      await settle(60);
      t.same(
        [named(calls, 'rpc:delete_hall').length, toasts()[0]?.[1] ?? null, deleteDialog(), editDialog(), body().textContent.includes('هذه القاعة غير موجودة أو مؤرشفة.')],
        [1, 'حُذفت القاعة «قاعة 4».', null, null, true],
        'D صفحة القاعة: بعد الحذف تُغلق النافذتان وتقرأ الصفحة الحقل فتقول إنّ القاعة غير موجودة',
      );
    });

    // ── F: نافذتا القاعة والفوج نموذجان ─────────────────────────────────────────────────────────────────────────────
    const fieldIn = (dialog, suffix) => (dialog ? descendants(dialog).find((n) => n.localName === 'input' && n.id.endsWith(suffix)) ?? null : null);
    await step('F القاعة', async () => {
      const calls = fresh({ loadOverviewJson: () => overview(), createHall: () => undefined });
      await mount();
      await click(byAction('hall-add')[0]);
      const dialog = dialogTitled('قاعة جديدة');
      const save = byAction('hall-save', dialog ?? body())[0] ?? null;
      const form = formOf(save);
      t.same(
        [save?.getAttribute('type') ?? null, Boolean(form), form ? form.getAttribute('novalidate') !== null : false, form ? descendants(form).filter((n) => n.localName === 'input').length : 0],
        ['submit', true, true, 2],
        'F «احفظ القاعة» type="submit" مربوط بنموذج النافذة (form=) وفيه الخانتان، بلا تحقّق المتصفّح (noValidate)',
      );
      if (form) fire(form, 'submit');
      await settle(40);
      t.eq(named(calls, 'createHall').length, 0, 'F ضابط: إرسال النموذج والاسم فارغ (الزرّ معطّل) لا يحفظ');
      type(fieldIn(dialog, '-name'), 'قاعة 9');
      type(fieldIn(dialog, '-capacity'), '25000');
      await settle();
      await submitVia(byAction('hall-save', dialog ?? body())[0]);
      t.same([named(calls, 'createHall'), toasts()[0]?.[1] ?? null, Boolean(dialogTitled('قاعة جديدة')), reads(calls)], [[[PREVIEW.running.hall.site_id, 'قاعة 9', 25000]], 'أُضيفت القاعة «قاعة 9».', false, 2], 'F إرسال النموذج يحفظ القاعة مرّة واحدة (createHall بالحقل والاسم والسعة)، ثمّ تُغلق والحقل يُقرأ من جديد');
    });
    await step('F تعديل القاعة', async () => {
      const calls = fresh({ loadOverviewJson: () => overview(), updateHall: () => undefined });
      await mount();
      await click(inRow('قاعة 4', 'hall-edit')[0]);
      const dialog = editDialog();
      type(fieldIn(dialog, '-capacity'), '12000');
      await settle();
      await submitVia(byAction('hall-save', dialog ?? body())[0]);
      t.same(named(calls, 'updateHall'), [[H4, 2, '4', 12000]], 'F «عدّل القاعة» يُرسل نموذجها: updateHall بالقاعة ونسختها والاسم والسعة');
    });
    await step('F الفوج', async () => {
      const calls = fresh({ loadOverviewJson: () => overview(), openFlock: () => 'f-new' });
      await mount();
      await click(inRow('قاعة 4', 'flock-open')[0]);
      const dialog = dialogTitled('فوج جديد');
      const save = byAction('flock-open-save', dialog ?? body())[0] ?? null;
      t.same([save?.getAttribute('type') ?? null, Boolean(formOf(save))], ['submit', true], 'F «افتح الفوج» type="submit" مربوط بنموذج النافذة');
      await submitVia(save);
      t.eq(named(calls, 'openFlock').length, 0, 'F ضابط: الزرّ معطّل بلا عدد فلا إرسال');
      const form = formOf(save);
      if (form) fire(form, 'submit');
      await settle(40);
      t.eq(named(calls, 'openFlock').length, 0, 'F ضابط: إرسال النموذج نفسه والعدد فارغ لا يفتح فوجاً');
      type(fieldIn(dialog, '-count'), '25250');
      await settle();
      await submitVia(byAction('flock-open-save', dialog ?? body())[0]);
      const opened = named(calls, 'openFlock');
      t.same([opened.length, opened[0]?.[0] ?? null, UUID.test(opened[0]?.[1] ?? '')], [1, { hallId: H4, placedOn: TODAY, placedCount: 25250, ageDays: 0, breed: '' }, true], 'F إرسال النموذج يفتح الفوج مرّة واحدة بمرجع النافذة');
    });

    // ── I: كلّ عيّنة لما سيُحذف (اليدوية والحقيقية) تُرسم في النافذة بحالها ─────────────────────────────────────────────
    for (const [index, sample] of previews.entries()) {
      await step(`I ${index}`, async () => {
        const hallId = sample.hall?.id ?? `x-${index}`;
        const name = sample.hall?.name ?? '';
        const one = {
          today: TODAY,
          sites: [{ id: 's-i', name: 'حقل العيّنة', division_id: 'd-b', kind: 'broiler', can_manage: true, halls: [{ id: hallId, name, capacity: null, version: sample.hall?.version ?? 1, flock: null }] }],
        };
        fresh({ loadOverviewJson: () => one }, { delete_hall_preview: () => sample });
        await mount();
        await click(byAction('hall-delete')[0]);
        await settle(40);
        const blocked = Array.isArray(sample.blocks) && sample.blocks.length > 0;
        const back = sample.flock?.back?.length ?? 0;
        const expected = blocked
          ? [sample.blocks.length, null, false]
          : [null, (sample.flock ? back + 1 : 1) + (sample.ended > 0 ? 1 : 0), true];
        t.same(
          [linesOf('hall-delete-blocks')?.length ?? null, linesOf('hall-delete-effects')?.length ?? null, confirmButton() !== null],
          expected,
          `I عيّنة «${name}»: ${blocked ? 'ما يمنع بلا زرّ حذف' : 'سطر لكلّ ما يرجع وللأيّام وللدورات المنتهية، وزرّ الحذف'}`,
        );
      });
    }
  } finally {
    delete globalThis.__dh;
    restore();
  }
}
