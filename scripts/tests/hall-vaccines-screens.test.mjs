// جدول لقاحات لكلّ قاعة (0028، كلمة الزبون 2026-11-15 على /halls/vaccines?kind=broiler: «مو المفروض جدول لكلّ قاعة؟ هذا نفس الجدول للكلّ… كلّ
// قاعة لازم يكون إلها جدول»؛ العقد contract-0028 §C). react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل صفحة جدول اللقاحات الحقيقية وrepo
// القاعات الحقيقي (المحلّلات وبناء النداءات) على core بديل يسجّل كلّ نداء ويجيب بأشكال العقد؛ والجلسة والتنبيه بديلان. الحالات:
// S «لمن هذا الجدول؟»: العامّ أوّلاً ثمّ قاعات النوع بترتيب أرقامها (naturalCompare) والخاصّ مُعلَّم، وبحقلها حين تتوزّع على حقلين، و?hall= في الرابط.
// F القاعة بلا جدول خاصّ: العامّ للعرض بلا تعديل، و«اعمل لها جدولاً خاصّاً» نسخةٌ منه تُحفظ بالنسخة 0.
// E جدول القاعة الخاصّ يُعدَّل كالعامّ: p_days حرفاً بنسختها، وstale_program بجدول الفروق، والإعادة المجمَّدة بالنداء نفسه والتحقّق بعدها، وحذفه
//   من جهاز آخر أثناء التعديل، ولا تعارض كاذب أثناء القراءة بعد الحفظ، وقاعة أُرشفت.
// D «احذف جدولها الخاصّ»: التأكيد يسمّي النتيجة، والنداء بنسخته، وstale_program، والنتيجة المجهولة.
// G الجدول العامّ كما كان، والتعديلات لكلّ نطاق وحده، والنتيجة المجهولة في العامّ تُسمّى من نطاق آخر؛ وحذف لقاح يسمّي أيّامه في جداول القاعات؛
//   والقراءة وحدها.
// P محلّل vaccine_board ومفتاح halls بصرامته، ونتائج الكاتبين الجديدين.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, OptionElement, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const F = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'halls-contract.json'), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const STUBS = {
  session: 'export const useSession = () => globalThis.__hv.session; export const sessionStore = { get: () => globalThis.__hv?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__hv.toasts.push(spec); }; export function Toaster() { return null; }',
};
const stubs = {
  name: 'hall-vaccines-stubs',
  setup(b) {
    b.onResolve({ filter: /\/lib\/session$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'hall-vaccines-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'hall-vaccines-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
  },
};
// core بديل لملفّات repo: call يسجّله __hv.rpc والمحلّل الحقيقي يقرأ الجواب.
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__hv.rpc(fn, args);
export const send = async () => { throw new Error('hall-vaccines: no direct table access'); };
export const classifyPostgrest = (error) => new RejectedError(error.code ?? 'x', error.hint ?? null);
export const explained = async (error) => error;
export const updatedRows = () => { throw new ZeroRowsError(); };
export const authed = async () => ({ db: null });
export const unknownConstraint = () => '';`;
const coreStub = {
  name: 'hall-vaccines-core',
  setup(b) {
    b.onResolve({ filter: /^\.\/core$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('src/lib/repo/') ? { path: 'core', namespace: 'hall-vaccines-core' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'hall-vaccines-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
  },
};

async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    "export { default as VaccinesPage } from './src/pages/halls/VaccinesPage.tsx';",
    "export * as repo from './src/lib/repo/halls.ts';",
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
const ageCell = (age) => byAction('age-day').find((n) => n.getAttribute('data-age') === String(age));
const bandsOf = (age) => descendants(ageCell(age)).filter((n) => n.getAttribute('data-action') === 'age-band').map((n) => n.textContent);
/**
 * خيار واحد مختار في القائمة كما في المتصفّح (مثل expenses-allocated): React يختار خيار القاعة حين يتغيّر الرابط، وDOM الفحص يُبقي «كلّ
 * القاعات» مختاراً معه فيُقرأ الفارغ. يُرجَّع كما كان بعد الملف (الفحوص بعملية واحدة).
 */
function exclusiveOptions() {
  const saved = Object.getOwnPropertyDescriptor(OptionElement.prototype, 'selected');
  Object.defineProperty(OptionElement.prototype, 'selected', {
    configurable: true,
    get() {
      return this.__picked === true;
    },
    set(value) {
      if (value) {
        let select = this.parentNode;
        while (select && select.localName !== 'select') select = select.parentNode;
        if (select) for (const option of select.options) if (option !== this) option.__picked = false;
      }
      this.__picked = Boolean(value);
    },
  });
  return () => {
    if (saved) Object.defineProperty(OptionElement.prototype, 'selected', saved);
    else delete OptionElement.prototype.selected;
  };
}
// «لمن هذا الجدول؟» بطاقات (0030، كلمة الزبون 2026-11-16: «خلي اختيار القاعات يصير اسهل واحلى»): الخيارات اسم كلّ بطاقة (aria-label كما كان نصّ
// الخيار) بمعرّفها، والمختار البطاقة المضغوطة، والاختيار ضغطها.
const scopeCards = () => byAction('scope-card');
const scopeOptions = () => (scopeCards().length ? scopeCards().map((n) => [n.getAttribute('data-id'), n.getAttribute('aria-label')]) : null);
const scopeValue = () => scopeCards().find((n) => n.getAttribute('aria-pressed') === 'true')?.getAttribute('data-id') ?? null;
const pickScope = async (value) => {
  fire(scopeCards().find((n) => n.getAttribute('data-id') === value) ?? null, 'click');
  await settle();
  await settle();
};
const dialogTitle = (start) => all().find((n) => n.localName === 'h2' && n.textContent.startsWith(start))?.textContent ?? null;
const tableOf = (caption) => all().find((n) => n.localName === 'table' && descendants(n).some((c) => c.localName === 'caption' && c.textContent === caption));
const tableRows = (caption) => {
  const table = tableOf(caption);
  const tbody = table ? descendants(table).find((n) => n.localName === 'tbody') : null;
  return tbody ? tbody.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent)) : null;
};

const IB = '00000000-0000-4000-8000-000000000021';
const ND = '00000000-0000-4000-8000-000000000022';
const GUM = '00000000-0000-4000-8000-000000000023';
const H1 = '00000000-0000-4000-8000-000000000a01';
const H5 = '00000000-0000-4000-8000-000000000a05';
const H10 = '00000000-0000-4000-8000-000000000a10';
const H44 = '00000000-0000-4000-8000-000000000a44';
const HL = '00000000-0000-4000-8000-000000000b01';
const NAMES = { [IB]: 'IB', [ND]: 'ND', [GUM]: 'GUM' };
const short = (days) => days.map((day) => [NAMES[day.vaccine_id] ?? day.vaccine_id, day.age_day]);

const ws = (role) => ({
  userId: `u-${role}`, orgId: 'org-1', orgName: 'مشروع الدواجن', memberId: 'm-1', displayName: 'علي', phone: null, role, scopes: [],
  divisions: ['broiler_farm'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1,
});
const MANAGER = { status: 'ready', workspace: ws('manager') };

const hallRow = (id, name, program = null, { site = 'حقل الأمير', kind = 'broiler', flock = null } = {}) => ({ id, name, site_name: site, kind, program, flock });
const prog = (version, end, days) => ({ version, end_age: end, days: days.map(([vaccine, age]) => ({ vaccine_id: vaccine, age_day: age })) });
/** جدول «قاعة 5» الخاصّ: IB يوم 5 و18، وND يوم 10، ونهاية الدورة 35. */
const H5_DAYS = [[IB, 5], [ND, 10], [IB, 18]];
/** الجدول العامّ للّاحم في عيّنة العقد (النسخة 3، النهاية 42). */
const GENERAL = [[IB, 7], [ND, 7], [GUM, 12], [ND, 14], [IB, 21]];

/** اللوحة بقاعاتها بترتيب الخادم (الحقل ثمّ الاسم بالبايت: «قاعة 1» ثمّ «قاعة 10» ثمّ «قاعة 44» ثمّ «قاعة 5»)، وقاعة بيّاض في حقل آخر. */
function boardWith({ h1 = null, h5 = prog(2, 35, H5_DAYS), drop = [], over = {} } = {}) {
  const board = clone(F.vaccine_board);
  board.has_halls = { broiler: true, layer: true };
  board.halls = [hallRow(H1, 'قاعة 1', h1), hallRow(H10, 'قاعة 10'), hallRow(H44, 'قاعة 44'), hallRow(H5, 'قاعة 5', h5), hallRow(HL, 'قاعة البيّاض', null, { site: 'حقل البيض', kind: 'layer' })].filter(
    (row) => !drop.includes(row.id),
  );
  return { ...board, ...over };
}

export default async function (t) {
  const restore = installDom();
  const restoreOptions = exclusiveOptions();
  let root = null;
  let m = null;
  try {
    m = await bundle();
    const fresh = (session, { rpcs = {} } = {}) => {
      const rpcLog = [];
      globalThis.__hv = {
        session,
        toasts: [],
        location: null,
        rpc(fn, args) {
          rpcLog.push([fn, args]);
          const handler = rpcs[fn];
          if (!handler) return new Promise(() => {});
          const count = rpcLog.filter(([name]) => name === fn).length;
          return Promise.resolve().then(() => handler(args, count));
        },
      };
      return { rpcLog };
    };
    const named = (log, name) => log.filter(([n]) => n === name).map(([, args]) => args);
    const lastToast = () => globalThis.__hv.toasts.at(-1)?.title ?? null;

    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      function Keyed() {
        const location = m.useLocation();
        globalThis.__hv.location = `${location.pathname}${location.search}`;
        return m.h(m.Routes, null, m.h(m.Route, { path: '/halls/vaccines', element: m.h(m.VaccinesPage) }), m.h(m.Route, { path: '*', element: null }));
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
    const hallUrl = (id) => `/halls/vaccines?kind=broiler&hall=${id}`;

    // ── S: «لمن هذا الجدول؟» ─────────────────────────────────────────────────────────────────────────────────────────
    await step('S1 الاختيار وترتيبه وعلاماته', async () => {
      fresh(MANAGER, { rpcs: { vaccine_board: () => boardWith() } });
      await mount('/halls/vaccines?kind=broiler');
      t.same(
        [scopeOptions(), scopeValue(), text().includes('لمن هذا الجدول؟')],
        [
          [
            ['', 'كلّ القاعات (الجدول العامّ)'],
            [H1, 'قاعة 1'],
            [H5, 'قاعة 5 (جدول خاصّ)'],
            [H10, 'قاعة 10'],
            [H44, 'قاعة 44'],
          ],
          '',
          true,
        ],
        'S1 «لمن هذا الجدول؟»: العامّ أوّلاً ثمّ قاعات اللاحم بأرقامها (5 قبل 10 و44، لا بترتيب الخادم)، و«قاعة 5» معلَّمة «جدول خاصّ»، وقاعة البيّاض ليست هنا، والمختار العامّ',
      );
      t.same(
        [textOf('program-title'), textOf('own-halls'), bandsOf(7), bandsOf(5), byAction('cycle-end')[0]?.value],
        ['جدول لقاحات اللاحم', 'لا يسري هذا الجدول على القاعات ذات الجدول الخاصّ: قاعة 5.', ['IB', 'ND'], [], '42'],
        'S1 العامّ كما هو، وجملة تسمّي القاعات التي لها جدول خاصّ فلا تتبعه',
      );
      t.ok(text().includes('جدول عامّ لكلّ نوع يسري على قاعاته، ولأيّ قاعة جدول خاصّ يحلّ محلّه.'), 'S1 العنوان الفرعيّ: جدول عامّ لكلّ نوع، ولأيّ قاعة جدول خاصّ (لا «جدول واحد لكلّ نوع»)');
      await click(all().find((n) => n.getAttribute('role') === 'radio' && n.textContent === 'البيّاض'));
      t.same([globalThis.__hv.location, scopeOptions()], ['/halls/vaccines?kind=layer', [['', 'كلّ القاعات (الجدول العامّ)'], [HL, 'قاعة البيّاض']]], 'S1 تبويب البيّاض: قاعاته وحدها');
    });

    await step('S2 قاعات النوع في حقلين: الحقل مع الاسم', async () => {
      const board = boardWith();
      board.halls = [
        hallRow(H10, 'قاعة 10', prog(4, 40, [[ND, 9]])),
        hallRow(H5, 'قاعة 2'),
        hallRow(H1, 'قاعة 1', null, { site: 'حقل النهر' }),
        hallRow(HL, 'قاعة البيّاض', null, { site: 'حقل البيض', kind: 'layer' }),
      ];
      fresh(MANAGER, { rpcs: { vaccine_board: () => board } });
      await mount('/halls/vaccines?kind=broiler');
      t.same(
        [scopeOptions(), textOf('own-halls')],
        [
          [
            ['', 'كلّ القاعات (الجدول العامّ)'],
            [H5, 'قاعة 2 — حقل الأمير'],
            [H10, 'قاعة 10 — حقل الأمير (جدول خاصّ)'],
            [H1, 'قاعة 1 — حقل النهر'],
          ],
          'لا يسري هذا الجدول على القاعات ذات الجدول الخاصّ: قاعة 10 — حقل الأمير.',
        ],
        'S2 قاعات اللاحم في حقلين: بالحقل ثمّ بأرقام الأسماء، وكلّ قاعة باسم حقلها (والبيّاض في حقل واحد فلا يُعدّ حقلاً ثانياً)',
      );
    });

    await step('S3 القاعة في الرابط', async () => {
      fresh(MANAGER, { rpcs: { vaccine_board: () => boardWith() } });
      await mount('/halls/vaccines?kind=broiler');
      await pickScope(H1);
      t.same([globalThis.__hv.location, scopeValue(), textOf('program-title'), byAction('program-card')[0]?.getAttribute('data-hall')], [hallUrl(H1), H1, 'جدول لقاحات «قاعة 1»', H1], 'S3 اختيار قاعة: ?kind=broiler&hall= وعنوان الجدول باسمها');
      await pickScope('');
      t.same([globalThis.__hv.location, scopeValue(), textOf('program-title')], ['/halls/vaccines?kind=broiler', '', 'جدول لقاحات اللاحم'], 'S3 «كلّ القاعات»: بلا hall في الرابط، والجدول العامّ');
      await unmount();
      fresh(MANAGER, { rpcs: { vaccine_board: () => boardWith() } });
      await mount(`/halls/vaccines?kind=layer&hall=${H5}`);
      t.same(
        [scopeValue(), textOf('program-title'), all().find((n) => n.getAttribute('role') === 'radio' && n.getAttribute('aria-checked') === 'true')?.textContent, bandsOf(5)],
        [H5, 'جدول لقاحات «قاعة 5»', 'اللاحم', ['IB']],
        'S3 الرابط بقاعة: نوعها نوع الصفحة (ولو قال ?kind= غيره)، وجدولها الخاصّ',
      );
      await click(all().find((n) => n.getAttribute('role') === 'radio' && n.textContent === 'البيّاض'));
      t.same([globalThis.__hv.location, textOf('program-title'), scopeValue()], ['/halls/vaccines?kind=layer', 'جدول لقاحات البيّاض', ''], 'S3 تبويب نوع آخر من جدول قاعة: يترك القاعة إلى العامّ لذلك النوع');
      await unmount();
      // الرابط بلا ?kind=: الاختيار يكتب النوع مع القاعة، و«كلّ القاعات» من قاعة بيّاض يبقى على البيّاض (لا أوّل الأنواع).
      fresh(MANAGER, { rpcs: { vaccine_board: () => boardWith() } });
      await mount('/halls/vaccines');
      await pickScope(H1);
      const plain = globalThis.__hv.location;
      await unmount();
      fresh(MANAGER, { rpcs: { vaccine_board: () => boardWith() } });
      await mount(`/halls/vaccines?hall=${HL}`);
      const layerHall = textOf('program-title');
      await pickScope('');
      t.same(
        [plain, layerHall, globalThis.__hv.location, textOf('program-title')],
        [hallUrl(H1), 'جدول لقاحات «قاعة البيّاض»', '/halls/vaccines?kind=layer', 'جدول لقاحات البيّاض'],
        'S3 بلا ?kind= في الرابط: اختيار قاعة يكتب ?kind=broiler&hall=، و«كلّ القاعات» من قاعة البيّاض إلى جدول البيّاض العامّ',
      );
      await unmount();
      fresh(MANAGER, { rpcs: { vaccine_board: () => boardWith() } });
      await mount('/halls/vaccines?kind=broiler&hall=00000000-0000-4000-8000-000000000fff');
      t.same(
        [textOf('hall-missing'), scopeValue(), textOf('program-title'), bandsOf(7)],
        ['القاعة المطلوبة ليست بين قاعاتك (أُرشفت أو خرجت من نطاقك)، فيُعرض الجدول العامّ.', '', 'جدول لقاحات اللاحم', ['IB', 'ND']],
        'S3 قاعة ليست في القراءة: جملة تقول ذلك والجدول العامّ',
      );
    });

    // ── F: قاعة بلا جدول خاصّ ─────────────────────────────────────────────────────────────────────────────────────────
    await step('F1 القاعة تتبع العامّ: للعرض', async () => {
      const { rpcLog } = fresh(MANAGER, { rpcs: { vaccine_board: () => boardWith() } });
      await mount(hallUrl(H1));
      t.same(
        [textOf('hall-follows')?.startsWith('«قاعة 1» تتبع الجدول العامّ.'), byAction('hall-program-start').length, ageCell(7)?.localName, bandsOf(7), bandsOf(12), bandsOf(21), textOf('cycle-end-text')],
        [true, 1, 'div', ['IB', 'ND'], ['غمبورو'], ['IB'], 'نهاية الدورة: 42 يوماً'],
        'F1 «قاعة 1» بلا جدول خاصّ: «تتبع الجدول العامّ» والجدول العامّ بمربّعات للعرض (لا أزرار)، و«اعمل لها جدولاً خاصّاً»',
      );
      t.same(
        [byAction('cycle-end').length, byAction('save-program').length, byAction('program-bar').length, byAction('hall-program-drop').length, byAction('pick-help').length],
        [0, 0, 0, 0, 0],
        'F1 لا نهاية دورة تُكتب ولا حفظ ولا حذف، ولا «اضغط أيّام العمر» على جدول للعرض',
      );
      await click(withId('vac-pick', GUM));
      await click(ageCell(30));
      t.same([bandsOf(30), m.isWindowDirty(), named(rpcLog, 'save_hall_vaccine_program').length], [[], false, 0], 'F1 الضغط على يوم لا يغيّر شيئاً، والنافذة نظيفة');
    });

    await step('F2 «اعمل لها جدولاً خاصّاً» ثمّ الحفظ بالنسخة 0', async () => {
      const mine = [...GENERAL, [GUM, 30]];
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: (_args, n) => (n === 1 ? boardWith() : boardWith({ h1: prog(1, 40, mine) })),
          save_hall_vaccine_program: (args) => ({ hall_id: args.p_hall, kind: 'broiler', version: 1, end_age: args.p_end_age, days: args.p_days.length }),
        },
      });
      await mount(hallUrl(H1));
      await click(byAction('hall-program-start')[0]);
      t.same(
        [byAction('hall-follows').length, ageCell(7)?.localName, bandsOf(7), bandsOf(12), bandsOf(14), bandsOf(21), byAction('cycle-end')[0]?.value, textOf('hall-program-new'), disabled(byAction('save-program')[0]), m.isWindowDirty()],
        [0, 'button', ['IB', 'ND'], ['غمبورو'], ['ND'], ['IB'], '42', 'لـ«قاعة 1» جدول خاصّ لم يُحفظ بعد: احفظه لتتبعه بدل الجدول العامّ.', false, true],
        'F2 تعديل منسوخ من العامّ (أيّامه ونهايته) يُعدَّل، والحفظ مفتوح ولو لم يتغيّر شيء، والنافذة «فيها ما لم يُحفظ»',
      );
      await click(withId('vac-pick', GUM));
      await click(ageCell(30));
      type(byAction('cycle-end')[0], '40');
      await settle();
      await click(byAction('save-program')[0]);
      await settle();
      t.same(
        [named(rpcLog, 'save_hall_vaccine_program'), named(rpcLog, 'save_vaccine_program').length],
        [
          [
            {
              p_hall: H1,
              p_end_age: 40,
              p_days: [
                { vaccine_id: IB, age_day: 7 },
                { vaccine_id: ND, age_day: 7 },
                { vaccine_id: GUM, age_day: 12 },
                { vaccine_id: ND, age_day: 14 },
                { vaccine_id: IB, age_day: 21 },
                { vaccine_id: GUM, age_day: 30 },
              ],
              p_expected_version: 0,
            },
          ],
          0,
        ],
        'F2 «احفظ الجدول» نداء save_hall_vaccine_program واحد بالقاعة والنهاية والأيام مرتّبة وبالنسخة 0 (يُنشأ)، والعامّ لا يُمسّ',
      );
      await settle();
      t.same(
        [lastToast(), named(rpcLog, 'vaccine_board').length, m.isWindowDirty(), scopeOptions()?.[1], textOf('hall-program-own'), byAction('hall-program-drop').length, byAction('program-conflict').length],
        ['حُفظ جدول لقاحات «قاعة 1»: 6 مواعيد، ونهاية الدورة 40 يوماً.', 2, false, [H1, 'قاعة 1 (جدول خاصّ)'], 'لـ«قاعة 1» جدول خاصّ يحلّ محلّ الجدول العامّ.', 1, 0],
        'F2 ثمّ تُقرأ اللوحة: «قاعة 1» بجدول خاصّ، والنافذة نظيفة بلا تعارض',
      );
    });

    await step('F3 «تراجع عن التعديل» يعيدها إلى العامّ', async () => {
      fresh(MANAGER, { rpcs: { vaccine_board: () => boardWith() } });
      await mount(hallUrl(H1));
      await click(byAction('hall-program-start')[0]);
      await click(byAction('discard-program')[0]);
      t.same([byAction('hall-follows').length, ageCell(7)?.localName, m.isWindowDirty()], [1, 'div', false], 'F3 التراجع: تتبع العامّ للعرض من جديد، والنافذة نظيفة');
    });

    // ── E: جدول القاعة الخاصّ ────────────────────────────────────────────────────────────────────────────────────────
    await step('E1 تعديل جدول القاعة وحفظه بنسخته', async () => {
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: (_args, n) => (n === 1 ? boardWith() : boardWith({ h5: prog(3, 30, [...H5_DAYS, [ND, 20]]) })),
          save_hall_vaccine_program: (args) => ({ hall_id: args.p_hall, kind: 'broiler', version: 3, end_age: args.p_end_age, days: args.p_days.length }),
        },
      });
      await mount(hallUrl(H5));
      t.same(
        [ageCell(5)?.localName, bandsOf(5), bandsOf(10), bandsOf(18), bandsOf(7), byAction('cycle-end')[0]?.value, byAction('age-day').length, textOf('hall-program-own'), byAction('hall-follows').length],
        ['button', ['IB'], ['ND'], ['IB'], [], '35', 35, 'لـ«قاعة 5» جدول خاصّ يحلّ محلّ الجدول العامّ.', 0],
        'E1 «قاعة 5» بجدولها الخاصّ (لا العامّ)، يُعدَّل، ونهايته 35',
      );
      await click(withId('vac-pick', ND));
      await click(ageCell(20));
      type(byAction('cycle-end')[0], '30');
      await settle();
      t.same([bandsOf(5), bandsOf(20), textOf('program-dirty'), m.isWindowDirty()], [['IB'], ['ND'], 'في الجدول تعديل لم يُحفظ.', true], 'E1 التعديل على جدول القاعة ظاهر ولم يُحفظ');
      await click(byAction('save-program')[0]);
      await settle();
      t.same(
        [named(rpcLog, 'save_hall_vaccine_program'), named(rpcLog, 'save_vaccine_program').length],
        [[{ p_hall: H5, p_end_age: 30, p_days: [{ vaccine_id: IB, age_day: 5 }, { vaccine_id: ND, age_day: 10 }, { vaccine_id: IB, age_day: 18 }, { vaccine_id: ND, age_day: 20 }], p_expected_version: 2 }], 0],
        'E1 النداء بالقاعة والأيام بيوم العمر ثمّ ترتيب اللقاح وبالنسخة المقروءة 2',
      );
      await settle();
      t.same([lastToast(), m.isWindowDirty(), byAction('program-dirty').length, byAction('program-conflict').length], ['حُفظ جدول لقاحات «قاعة 5»: 4 مواعيد، ونهاية الدورة 30 يوماً.', false, 0, 0], 'E1 «حُفظ» باسم القاعة ثمّ النافذة نظيفة');
    });

    await step('E2 stale_program في جدول القاعة', async () => {
      const other = [...H5_DAYS, [GUM, 25]];
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: (_args, n) => (n === 1 ? boardWith() : boardWith({ h5: prog(3, 35, other) })),
          save_hall_vaccine_program: (args, n) => {
            if (n === 1) throw new m.RejectedError('stale_program', 'تغيّر جدول القاعة من جهاز آخر؛ قُرئ من جديد.');
            return { hall_id: args.p_hall, kind: 'broiler', version: 4, end_age: args.p_end_age, days: args.p_days.length };
          },
        },
      });
      await mount(hallUrl(H5));
      await click(withId('vac-pick', ND));
      await click(ageCell(20));
      await click(byAction('save-program')[0]);
      await settle();
      t.same(
        [byAction('program-conflict').length, textOf('program-conflict')?.startsWith('تغيّر جدول القاعة من جهاز آخر؛ قُرئ من جديد.'), bandsOf(20), bandsOf(25), disabled(byAction('save-program')[0]), tableRows('الفرق بين تعديلك والجدول المحفوظ الآن')],
        [1, true, ['ND'], [], true, [['20', 'ND', 'ليس فيه', 'فيه'], ['25', 'غمبورو', 'فيه', 'ليس فيه']]],
        'E2 الرفض يُقال، وجدول القاعة يُقرأ، وتعديلك ظاهر بجدول الفروق مع جدولها المحفوظ الآن، والحفظ مقفول',
      );
      await click(byAction('reapply')[0]);
      await click(byAction('save-program')[0]);
      await settle();
      const second = named(rpcLog, 'save_hall_vaccine_program')[1];
      t.same([second?.p_hall, second?.p_expected_version, short(second?.p_days ?? [])], [H5, 3, [['IB', 5], ['ND', 10], ['IB', 18], ['ND', 20]]], 'E2 «اعتمد تعديلي» ثمّ يُحفظ تعديلك بالنسخة الجديدة 3');
    });

    await step('E3 النتيجة المجهولة في جدول القاعة', async () => {
      const mine = [...H5_DAYS, [ND, 20]];
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: (_args, n) => (n === 1 ? boardWith() : boardWith({ h5: prog(3, 35, mine) })),
          save_hall_vaccine_program: (_args, n) => {
            if (n === 1) throw new m.UnknownOutcomeError();
            if (n === 2) throw new m.NetworkError();
            throw new m.RejectedError('stale_program', 'تغيّر جدول القاعة من جهاز آخر.');
          },
        },
      });
      await mount(hallUrl(H5));
      await click(withId('vac-pick', ND));
      await click(ageCell(20));
      await click(byAction('save-program')[0]);
      t.same(
        [byAction('retry-program').length, byAction('save-program').length, disabled(ageCell(21)), m.isWindowDirty(), textOf('program-card')?.includes('لا نعرف إن حُفظ جدول «قاعة 5»: أعد المحاولة؛ لن يُحفظ مرّتين.')],
        [1, 0, true, true, true],
        'E3 نتيجة مجهولة: «أعد المحاولة» وحدها باسم القاعة، والجدول مقفول، والنافذة «فيها ما لم يُحفظ»',
      );
      await click(byAction('retry-program')[0]);
      t.same([byAction('retry-program').length, textOf('program-failure')], [1, 'لم تصل الإعادة إلى الخادم: أعد المحاولة عند عودة الاتصال.'], 'E3 إعادة لم تصل: تبقى مجمَّدة');
      await click(byAction('retry-program')[0]);
      await settle();
      await settle();
      const sent = named(rpcLog, 'save_hall_vaccine_program');
      t.same(
        [sent.length, JSON.stringify(sent[1]) === JSON.stringify(sent[0]), JSON.stringify(sent[2]) === JSON.stringify(sent[0]), sent[0]?.p_expected_version, lastToast(), byAction('program-conflict').length, byAction('retry-program').length, m.isWindowDirty()],
        [3, true, true, 2, 'حُفظ جدول لقاحات «قاعة 5»: 4 مواعيد، ونهاية الدورة 35 يوماً.', 0, 0, false],
        'E3 كلّ إعادة بالنداء نفسه حرفاً؛ ورفضها بشرط النسخة وجدول القاعة المقروء = ما أُرسل بنسخة تقدّمت: حُفظ بالأولى',
      );
    });

    await step('E4 النتيجة المجهولة في إنشاء جدول القاعة', async () => {
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: (_args, n) => (n === 1 ? boardWith() : boardWith({ h1: prog(1, 42, GENERAL) })),
          save_hall_vaccine_program: (_args, n) => {
            if (n === 1) throw new m.UnknownOutcomeError();
            throw new m.RejectedError('stale_program', 'لـ«قاعة 1» جدول خاصّ الآن.');
          },
        },
      });
      await mount(hallUrl(H1));
      await click(byAction('hall-program-start')[0]);
      await click(byAction('save-program')[0]);
      await click(byAction('retry-program')[0]);
      await settle();
      await settle();
      const sent = named(rpcLog, 'save_hall_vaccine_program');
      t.same(
        [sent.length, sent.map((args) => args.p_expected_version), JSON.stringify(sent[1]) === JSON.stringify(sent[0]), lastToast(), byAction('hall-program-own').length, m.isWindowDirty()],
        [2, [0, 0], true, 'حُفظ جدول لقاحات «قاعة 1»: 5 مواعيد، ونهاية الدورة 42 يوماً.', 1, false],
        'E4 إنشاء بنتيجة مجهولة ثمّ إعادة رُفضت بشرط النسخة: للقاعة الآن جدول بالنسخة 1 = ما أُرسل، فـ«حُفظ» بالأولى',
      );
    });

    await step('E5 حُذف جدول القاعة من جهاز آخر أثناء التعديل', async () => {
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: (_args, n) => (n === 1 ? boardWith() : boardWith({ h5: null })),
          save_hall_vaccine_program: (args, n) => {
            if (n === 1) throw new m.RejectedError('stale_program', 'تغيّر جدول القاعة من جهاز آخر.');
            return { hall_id: args.p_hall, kind: 'broiler', version: 1, end_age: args.p_end_age, days: args.p_days.length };
          },
        },
      });
      await mount(hallUrl(H5));
      await click(withId('vac-pick', ND));
      await click(ageCell(20));
      await click(byAction('save-program')[0]);
      await settle();
      t.same(
        [byAction('program-conflict').length, disabled(byAction('save-program')[0]), bandsOf(20), bandsOf(7), tableRows('الفرق بين تعديلك والجدول المحفوظ الآن')?.length, byAction('hall-follows').length],
        [1, true, ['ND'], [], 9, 0],
        'E5 الرفض يقرأ اللوحة: لا جدول خاصّ لـ«قاعة 5» الآن، فتعديلك ظاهر بالفروق مع العامّ الذي تتبعه (تسعة أيّام)، والحفظ مقفول',
      );
      await pickScope('');
      await pickScope(H5);
      t.same(
        [textOf('program-conflict')?.startsWith('حُذف جدول «قاعة 5» الخاصّ من جهاز آخر بعد أن بدأت التعديل، فهي تتبع الجدول العامّ الآن.'), bandsOf(20)],
        [true, ['ND']],
        'E5 والتعارض يسمّي ما جرى (بلا تلميح الرفض بعد التنقّل)، والتعديل باقٍ لنطاقه',
      );
      await click(byAction('reapply')[0]);
      t.same([byAction('program-conflict').length, textOf('hall-program-new'), disabled(byAction('save-program')[0])], [0, 'لـ«قاعة 5» جدول خاصّ لم يُحفظ بعد: احفظه لتتبعه بدل الجدول العامّ.', false], 'E5 «اعتمد تعديلي»: جدول خاصّ يُنشأ من جديد');
      await click(byAction('save-program')[0]);
      await settle();
      const second = named(rpcLog, 'save_hall_vaccine_program')[1];
      t.same([second?.p_expected_version, short(second?.p_days ?? [])], [0, [['IB', 5], ['ND', 10], ['IB', 18], ['ND', 20]]], 'E5 والحفظ بالنسخة 0 بتعديلك كما هو');
    });

    await step('E6 بعد الحفظ وأثناء القراءة: لا تعارض كاذب', async () => {
      // اللوحة المرسومة أثناء القراءة بعد الحفظ هي ما قبله (نسخة 0 أو 2 والتعديل بُني الآن على 1 أو 3): النقص لا يُعدّ تعارضاً إلّا بقراءة جديدة.
      for (const [hallId, created] of [[H1, true], [H5, false]]) {
        const { rpcLog } = fresh(MANAGER, {
          rpcs: {
            vaccine_board: (_args, n) => (n === 1 ? boardWith() : new Promise(() => {})),
            save_hall_vaccine_program: (args) => ({ hall_id: args.p_hall, kind: 'broiler', version: created ? 1 : 3, end_age: args.p_end_age, days: args.p_days.length }),
          },
        });
        await mount(hallUrl(hallId));
        if (created) await click(byAction('hall-program-start')[0]);
        await click(withId('vac-pick', GUM));
        await click(ageCell(30));
        await click(byAction('save-program')[0]);
        await settle();
        t.same(
          [named(rpcLog, 'save_hall_vaccine_program').length, named(rpcLog, 'vaccine_board').length, byAction('program-conflict').length, bandsOf(30)],
          [1, 2, 0, ['غمبورو']],
          `E6 ${created ? 'إنشاء جدول «قاعة 1»' : 'تعديل جدول «قاعة 5»'} حُفظ والقراءة الجديدة لم تصل: ما حُفظ ظاهر بلا «تغيّر من جهاز آخر»`,
        );
        await unmount();
      }
    });

    await step('E7 قاعة أُرشفت والحفظ', async () => {
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: (_args, n) => (n === 1 ? boardWith() : boardWith({ drop: [H5] })),
          save_hall_vaccine_program: () => {
            throw new m.RejectedError('hall_archived', 'القاعة «قاعة 5» مؤرشفة.');
          },
        },
      });
      await mount(hallUrl(H5));
      await click(withId('vac-pick', ND));
      await click(ageCell(20));
      await click(byAction('save-program')[0]);
      await settle();
      await settle();
      t.same(
        [named(rpcLog, 'vaccine_board').length, text().includes('القاعة «قاعة 5» مؤرشفة.'), byAction('hall-missing').length, textOf('program-title'), scopeOptions()?.some(([value]) => value === H5), m.isWindowDirty()],
        [2, true, 1, 'جدول لقاحات اللاحم', false, false],
        'E7 hall_archived: الرفض يُقال وتُقرأ اللوحة، فتخرج القاعة من الاختيار ويُعرض العامّ، ولا يبقى تعديل معلَّق',
      );
    });

    // ── D: «احذف جدولها الخاصّ» ──────────────────────────────────────────────────────────────────────────────────────
    await step('D1 حذف جدول القاعة الخاصّ', async () => {
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: (_args, n) => (n === 1 ? boardWith() : boardWith({ h5: null })),
          drop_hall_vaccine_program: (args) => ({ hall_id: args.p_hall, dropped: true }),
        },
      });
      await mount(hallUrl(H5));
      await click(byAction('hall-program-drop')[0]);
      t.same(
        [dialogTitle('احذف جدول'), textOf('hall-drop-effect'), textOf('hall-drop-now'), byAction('hall-drop-unsaved').length, textOf('hall-drop-go')],
        ['احذف جدول «قاعة 5» الخاصّ', 'تعود «قاعة 5» إلى الجدول العامّ، ويُحذف جدولها الخاصّ وأيّامه.', 'جدولها الآن: 3 مواعيد، ونهاية الدورة 35 يوماً.', 0, 'احذف جدولها الخاصّ'],
        'D1 التأكيد يسمّي القاعة وما يجري: تعود إلى العامّ ويُحذف جدولها وأيّامه، وما فيه الآن',
      );
      await click(byAction('hall-drop-go')[0]);
      await settle();
      t.same(
        [named(rpcLog, 'drop_hall_vaccine_program'), lastToast(), byAction('hall-drop-dialog').length, named(rpcLog, 'vaccine_board').length, byAction('hall-follows').length, scopeOptions()?.find(([value]) => value === H5)],
        [[{ p_hall: H5, p_expected_version: 2 }], 'عادت «قاعة 5» إلى الجدول العامّ.', 0, 2, 1, [H5, 'قاعة 5']],
        'D1 drop_hall_vaccine_program بالقاعة ونسخة جدولها، ثمّ «عادت» وتُقرأ اللوحة فتتبع العامّ',
      );
    });

    await step('D2 حذف جدول القاعة وفيه تعديل لم يُحفظ', async () => {
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: (_args, n) => (n === 1 ? boardWith() : boardWith({ h5: null })),
          drop_hall_vaccine_program: (args) => ({ hall_id: args.p_hall, dropped: true }),
        },
      });
      await mount(hallUrl(H5));
      await click(withId('vac-pick', ND));
      await click(ageCell(20));
      await click(byAction('hall-program-drop')[0]);
      t.eq(textOf('hall-drop-unsaved'), 'في جدولها تعديل لم يُحفظ، ويُترك بالحذف.', 'D2 التأكيد يقول إنّ التعديل الذي لم يُحفظ يُترك');
      await click(byAction('hall-drop-go')[0]);
      await settle();
      t.same([named(rpcLog, 'drop_hall_vaccine_program').length, m.isWindowDirty(), byAction('hall-follows').length, bandsOf(20)], [1, false, 1, []], 'D2 بعد الحذف لا تعديل معلَّق، والقاعة تتبع العامّ');
    });

    await step('D3 حذف جدول غيّره جهاز آخر', async () => {
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: (_args, n) => (n === 1 ? boardWith() : boardWith({ h5: prog(3, 35, [...H5_DAYS, [GUM, 25]]) })),
          drop_hall_vaccine_program: (args) => {
            if (args.p_expected_version !== 3) throw new m.RejectedError('stale_program', 'تغيّر جدول القاعة من جهاز آخر.');
            return { hall_id: args.p_hall, dropped: true };
          },
        },
      });
      await mount(hallUrl(H5));
      await click(byAction('hall-program-drop')[0]);
      await click(byAction('hall-drop-go')[0]);
      await settle();
      t.same(
        [named(rpcLog, 'vaccine_board').length, textOf('hall-drop-dialog')?.includes('غُيّر جدول «قاعة 5» الخاصّ من جهاز آخر فقُرئ من جديد: راجع ما يُحذف أعلاه ثمّ أكّد.'), textOf('hall-drop-now')],
        [2, true, 'جدولها الآن: 4 مواعيد، ونهاية الدورة 35 يوماً.'],
        'D3 الرفض يقرأ اللوحة، والنافذة تقول ذلك وتعرض الجدول كما هو الآن',
      );
      await click(byAction('hall-drop-go')[0]);
      await settle();
      t.same([named(rpcLog, 'drop_hall_vaccine_program').map((args) => args.p_expected_version), lastToast()], [[2, 3], 'عادت «قاعة 5» إلى الجدول العامّ.'], 'D3 والتأكيد التالي بالنسخة الجديدة');
    });

    await step('D4 حذف بنتيجة مجهولة ثمّ stale_program', async () => {
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: (_args, n) => (n === 1 ? boardWith() : boardWith({ h5: null })),
          drop_hall_vaccine_program: (_args, n) => {
            if (n === 1) throw new m.UnknownOutcomeError();
            throw new m.RejectedError('stale_program', 'تغيّر جدول القاعة من جهاز آخر.');
          },
        },
      });
      await mount(hallUrl(H5));
      await click(byAction('hall-program-drop')[0]);
      await click(byAction('hall-drop-go')[0]);
      t.same([byAction('hall-drop-retry').length, textOf('hall-drop-dialog')?.includes('لا نعرف إن حُذف جدولها الخاصّ: أعد المحاولة؛ لن يُحذف مرّتين.')], [1, true], 'D4 النتيجة المجهولة تجمّد بـ«أعد المحاولة»');
      await click(byAction('hall-drop-retry')[0]);
      await settle();
      t.same(
        [named(rpcLog, 'drop_hall_vaccine_program'), lastToast(), byAction('hall-drop-dialog').length],
        [[{ p_hall: H5, p_expected_version: 2 }, { p_hall: H5, p_expected_version: 2 }], 'عادت «قاعة 5» إلى الجدول العامّ.', 0],
        'D4 الإعادة حرفاً؛ ورفضها بشرط النسخة والقراءة بلا جدول خاصّ لها: حُذف بالأولى',
      );
    });

    // ── G: الجدول العامّ والتعديلات لكلّ نطاق، وحذف لقاح ─────────────────────────────────────────────────────────────
    await step('G1 الجدول العامّ كما كان، والتعديل لكلّ نطاق وحده', async () => {
      let general = null;
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: () => {
            const board = boardWith();
            if (general) board.programs.broiler = general;
            return board;
          },
          save_vaccine_program: (args) => {
            general = { version: 4, end_age: args.p_end_age, days: args.p_days };
            return { kind: args.p_kind, version: 4, end_age: args.p_end_age, days: args.p_days.length };
          },
        },
      });
      await mount('/halls/vaccines?kind=broiler');
      await click(withId('vac-pick', GUM));
      await click(ageCell(30));
      await pickScope(H5);
      t.same([bandsOf(30), bandsOf(5), byAction('program-dirty').length, m.isWindowDirty()], [[], ['IB'], 0, true], 'G1 تعديل العامّ لا يظهر في جدول «قاعة 5»، والنافذة ما زالت «فيها ما لم يُحفظ»');
      await click(ageCell(33));
      await pickScope('');
      t.same([bandsOf(30), bandsOf(33), textOf('program-dirty')], [['غمبورو'], [], 'في الجدول تعديل لم يُحفظ.'], 'G1 والعودة إلى العامّ: تعديله باقٍ، وتعديل القاعة ليس فيه');
      await click(byAction('save-program')[0]);
      await settle();
      t.same(
        [named(rpcLog, 'save_vaccine_program'), named(rpcLog, 'save_hall_vaccine_program').length],
        [[{ p_kind: 'broiler', p_end_age: 42, p_days: [...GENERAL, [GUM, 30]].map(([vaccine, age]) => ({ vaccine_id: vaccine, age_day: age })), p_expected_version: 3 }], 0],
        'G1 «احفظ الجدول» في العامّ: save_vaccine_program كما كان (النوع والنهاية والأيام بالنسخة 3)، بلا نداء قاعة',
      );
      await settle();
      t.same([lastToast(), byAction('program-dirty').length, m.isWindowDirty()], ['حُفظ جدول لقاحات اللاحم: 6 مواعيد، ونهاية الدورة 42 يوماً.', 0, true], 'G1 «حُفظ» العامّ، والنافذة ما زالت «فيها ما لم يُحفظ» بتعديل «قاعة 5»');
      await pickScope(H5);
      t.same([bandsOf(33), textOf('program-dirty'), m.isWindowDirty()], [['غمبورو'], 'في الجدول تعديل لم يُحفظ.', true], 'G1 وتعديل «قاعة 5» باقٍ لها بعد حفظ العامّ');
    });

    await step('G2 نتيجة مجهولة في العامّ ثمّ الانتقال إلى قاعة', async () => {
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: () => boardWith(),
          save_vaccine_program: (args, n) => {
            if (n === 1) throw new m.UnknownOutcomeError();
            return { kind: args.p_kind, version: 4, end_age: args.p_end_age, days: args.p_days.length };
          },
        },
      });
      await mount('/halls/vaccines?kind=broiler');
      await click(withId('vac-pick', IB));
      await click(ageCell(10));
      await click(byAction('save-program')[0]);
      await pickScope(H5);
      t.same(
        [textOf('program-card')?.includes('لا نعرف إن حُفظ جدول اللاحم العامّ: أعد المحاولة؛ لن يُحفظ مرّتين.'), byAction('retry-program').length, disabled(ageCell(5)), byAction('hall-program-drop').length],
        [true, 1, true, 0],
        'G2 في جدول «قاعة 5» تسمّي النتيجةُ المجهولة الجدولَ العامّ، والشاشة مقفولة حتّى تُعاد',
      );
      await click(byAction('retry-program')[0]);
      await settle();
      const sent = named(rpcLog, 'save_vaccine_program');
      t.same(
        [sent.length, JSON.stringify(sent[1]) === JSON.stringify(sent[0]), named(rpcLog, 'save_hall_vaccine_program').length, lastToast()],
        [2, true, 0, 'حُفظ جدول لقاحات اللاحم: 6 مواعيد، ونهاية الدورة 42 يوماً.'],
        'G2 «أعد المحاولة» من هناك يعيد نداء العامّ حرفاً، لا جدول القاعة',
      );
    });

    await step('G3 حذف لقاح يسمّي أيّامه في جداول القاعات', async () => {
      const { rpcLog } = fresh(MANAGER, { rpcs: { vaccine_board: () => boardWith({ h1: prog(1, 42, [[IB, 3], [ND, 8]]) }), delete_vaccine: (args) => ({ id: args.p_id, result: 'archived' }) } });
      await mount('/halls/vaccines?kind=broiler');
      await click(withId('vac-delete', IB));
      t.same(
        [dialogTitle('أخفِ لقاح'), textOf('delete-effect'), byAction('delete-days').map((n) => n.textContent)],
        ['أخفِ لقاح «IB»', 'أُشِّر هذا اللقاح من قبل، فلا يُمحى: يُخفى من القائمة ومن كلّ جداول اللقاحات، وتبقى تأشيراته السابقة باسمه.', ['أيّامه في جدول اللاحم: 7، 21.', 'أيّامه في جدول «قاعة 1»: 3.', 'أيّامه في جدول «قاعة 5»: 5، 18.']],
        'G3 نافذة الحذف: «من كلّ جداول اللقاحات»، وأيّامه في العامّ ثمّ في كلّ جدول قاعة فيه (بأرقام القاعات)',
      );
      await click(byAction('delete-go')[0]);
      await settle();
      t.same([named(rpcLog, 'delete_vaccine'), lastToast()], [[{ p_id: IB, p_expected_version: 2 }], 'أُخفي اللقاح «IB» وأُزيلت أيّامه من كلّ الجداول: أُشِّر من قبل، فبقيت تأشيراته باسمه.'], 'G3 delete_vaccine كما كان، و«من كلّ الجداول»');
    });

    await step('G4 القراءة وحدها', async () => {
      fresh(MANAGER, { rpcs: { vaccine_board: () => boardWith({ over: { can_edit: false } }) } });
      await mount(hallUrl(H5));
      t.same(
        [scopeValue(), ageCell(5)?.localName, bandsOf(5), byAction('hall-program-drop').length, byAction('cycle-end').length, byAction('save-program').length],
        [H5, 'div', ['IB'], 0, 0, 0],
        'G4 can_edit = false: جدول «قاعة 5» الخاصّ للعرض بلا حذف ولا حفظ',
      );
      await pickScope(H1);
      t.same([textOf('hall-follows')?.startsWith('«قاعة 1» تتبع الجدول العامّ.'), byAction('hall-program-start').length], [true, 0], 'G4 والقاعة التي تتبع العامّ بلا «اعمل لها جدولاً خاصّاً»');
    });

    // ── O: الدورة المفتوحة والبطاقات والتقويم بالأشهر (0030، كلمة الزبون 2026-11-16) ─────────────────────────────────
    /** «قاعة 1» بفوج سُكّن 28/10 بعمر يوم الفقس (عمره اليوم 11/11 أربعة عشر يوماً)، و«قاعة 5» بجدولها الخاصّ وفوج سُكّن 01/11 بعمر 3. */
    const withFlocks = (over = {}) => {
      const board = boardWith(over);
      for (const row of board.halls) {
        if (row.id === H1) row.flock = { id: 'f-1', placed_on: '2026-10-28', age0: 0 };
        if (row.id === H5) row.flock = { id: 'f-5', placed_on: '2026-11-01', age0: 3 };
      }
      return board;
    };
    const cardOf = (id) => scopeCards().find((n) => n.getAttribute('data-id') === id);
    const cardText = (id, action) => descendants(cardOf(id)).find((n) => n.getAttribute('data-action') === action)?.textContent ?? null;
    const monthBlank = () => byAction('month-blank').length;
    await step('O1 «لمن هذا الجدول؟» بطاقات', async () => {
      fresh(MANAGER, { rpcs: { vaccine_board: () => withFlocks() } });
      await mount('/halls/vaccines?kind=broiler');
      t.same(
        [scopeCards().map((n) => n.getAttribute('data-id')), scopeValue(), cardText(H1, 'scope-card-flock'), cardText(H5, 'scope-card-program'), cardText(H10, 'scope-card-flock'), cardText(H10, 'scope-card-program')],
        [['', H1, H5, H10, H44], '', 'فوج عمره 14 يوماً', 'جدول خاصّ', 'بلا فوج الآن', 'تتبع الجدول العامّ'],
        'O1 البطاقات: العامّ أوّلاً ثمّ القاعات بأرقامها، وفي كلّ بطاقة جدولها وعمر فوجها اليوم (كلمة الزبون: «خلي اختيار القاعات يصير اسهل واحلى»)',
      );
      await pickScope(H1);
      t.same([globalThis.__hv.location, scopeValue(), cardOf(H1)?.getAttribute('aria-pressed')], [hallUrl(H1), H1, 'true'], 'O1 ضغط بطاقة يختار القاعة');
    });
    await step('O2 التقويم بالأشهر الحقيقية من يوم التسكين', async () => {
      fresh(MANAGER, { rpcs: { vaccine_board: () => withFlocks() } });
      await mount(hallUrl(H1));
      const cellAge = (age) => descendants(ageCell(age)).find((n) => n.getAttribute('data-action') === 'cell-age')?.textContent ?? null;
      t.same(
        [byAction('month-page').map((n) => n.textContent), textOf('month-title'), ageCell(7)?.getAttribute('data-day'), cellAge(7), bandsOf(7), ageCell(4)?.getAttribute('data-day'), textOf('calendar-from')],
        [['تشرين الأول 2026', 'تشرين الثاني 2026', 'كانون الأول 2026'], 'تشرين الثاني 2026', '2026-11-04', 'عمر 7', ['IB', 'ND'], '2026-11-01', 'بالتاريخ من تسكين الفوج في 28/10/2026، وفي كلّ يوم عمر الطيور فيه.'],
        'O2 «قاعة 1» (الجدول العامّ، النهاية 42): أشهر الدورة الثلاثة، والمعروض شهر اليوم، و4/11 عمره 7 وفيه IB وND (كلمة الزبون: «رزنامة اشهر حقيقية… وبداخلها ترقيمات الايام حسب العمر»)',
      );
      await click(byAction('month-page')[0]);
      t.same([textOf('month-title'), byAction('age-day').length, monthBlank(), ageCell(1)?.getAttribute('data-day')], ['تشرين الأول 2026', 3, 28, '2026-10-29'],
        'O2 تشرين الأول: 29 و30 و31 بأعمار 1 إلى 3، وما قبلها (ويوم التسكين بعمر صفر) باهت');
      await click(byAction('month-page')[2]);
      t.same([byAction('age-day').length, ageCell(42)?.getAttribute('data-day'), ageCell(43)], [9, '2026-12-09', undefined], 'O2 كانون الأول: حتى 9/12 بعمر 42 (نهاية الدورة)، وما بعدها باهت');
    });
    await step('O3 تعديل جدول القاعة الخاصّ من التقويم', async () => {
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: () => withFlocks(),
          save_hall_vaccine_program: (args) => ({ hall_id: args.p_hall, kind: 'broiler', version: 3, end_age: args.p_end_age, days: args.p_days.length }),
        },
      });
      await mount(hallUrl(H5));
      t.same([ageCell(3)?.getAttribute('data-day'), ageCell(2), ageCell(5)?.getAttribute('data-day'), bandsOf(5)], ['2026-11-01', undefined, '2026-11-03', ['IB']],
        'O3 «قاعة 5» سُكّنت بعمر 3: يومها الأوّل في التقويم 1/11 بعمر 3، وما قبله ليس فيه');
      await click(withId('vac-pick', GUM));
      await click(ageCell(6));
      await click(byAction('save-program')[0]);
      t.same(named(rpcLog, 'save_hall_vaccine_program').map((args) => [args.p_end_age, short(args.p_days), args.p_expected_version]),
        [[35, [['IB', 5], ['GUM', 6], ['ND', 10], ['IB', 18]], 2]], 'O3 الضغط على 4/11 يضيف المختار إلى يوم العمر 6، والحفظ بأيّام العمر كما كان');
    });
    await step('O4 نهاية الدورة مفتوحة', async () => {
      let general = null;
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          vaccine_board: () => {
            const board = withFlocks();
            if (general) board.programs.broiler = general;
            return board;
          },
          save_vaccine_program: (args) => {
            general = { version: 4, end_age: args.p_end_age, days: args.p_days };
            return { kind: args.p_kind, version: 4, end_age: args.p_end_age, days: args.p_days.length };
          },
        },
      });
      await mount('/halls/vaccines?kind=broiler');
      const radio = (label) => descendants(byAction('cycle-end-mode')[0]).find((n) => n.getAttribute('role') === 'radio' && n.textContent === label);
      t.same([radio('محدّدة')?.getAttribute('aria-checked'), byAction('cycle-end').length, byAction('age-day').length], ['true', 1, 42], 'O4 الجدول المحفوظ بنهاية 42: «محدّدة» وخانتها، و42 يوماً');
      await click(radio('مفتوحة'));
      t.same([byAction('cycle-end').length, textOf('cycle-end-text'), byAction('age-day').length, textOf('program-dirty')],
        [0, 'نهاية الدورة: مفتوحة، بلا يوم محدّد؛ تنتهي الدورة حين تُغلق.', 56, 'في الجدول تعديل لم يُحفظ.'],
        'O4 «مفتوحة» (كلمة الزبون: «خليها اختيارية»): بلا خانة، والأيّام إلى 42 وأسبوعين بعدها (56)، وتعديل لم يُحفظ');
      await click(withId('vac-pick', IB));
      await click(ageCell(50));
      t.eq(byAction('age-day').length, 70, 'O4 يوم 50 في المفتوح: تمتدّ الأيّام إلى ما بعده بأسبوعين (64 ← 70 بأسابيع كاملة)');
      await click(byAction('save-program')[0]);
      t.same([named(rpcLog, 'save_vaccine_program').map((args) => [args.p_end_age, short(args.p_days).at(-1)]), lastToast()],
        [[[null, ['IB', 50]]], 'حُفظ جدول لقاحات اللاحم: 6 مواعيد، ونهاية الدورة مفتوحة.'], 'O4 يُرسل p_end_age = null ويوم 50، والتنبيه يقول «مفتوحة»');
      t.same([radio('مفتوحة')?.getAttribute('aria-checked'), byAction('program-dirty').length], ['true', 0], 'O4 وبعد القراءة الجديدة: مفتوحة محفوظة بلا تعديل');
      await click(radio('محدّدة'));
      t.same([byAction('cycle-end')[0]?.value, byAction('age-day').length, textOf('dropped')], ['42', 42, '«IB» يوم 50'], 'O4 والرجوع إلى «محدّدة» يقترح 42 وينبّه إلى يوم 50 الذي يُشال');
    });

    // ── P: المحلّل والكاتبان ──────────────────────────────────────────────────────────────────────────────────────────
    await step('P محلّل halls وكاتباه', async () => {
      const parsed = m.repo.parseVaccineBoard(boardWith());
      t.same(
        parsed.halls?.map((hall) => [hall.id, hall.name, hall.siteName, hall.kind, hall.program && [hall.program.version, hall.program.endAge, hall.program.days.map((day) => [day.vaccineId, day.ageDay])]]),
        [
          [H1, 'قاعة 1', 'حقل الأمير', 'broiler', null],
          [H10, 'قاعة 10', 'حقل الأمير', 'broiler', null],
          [H44, 'قاعة 44', 'حقل الأمير', 'broiler', null],
          [H5, 'قاعة 5', 'حقل الأمير', 'broiler', [2, 35, [[IB, 5], [ND, 10], [IB, 18]]]],
          [HL, 'قاعة البيّاض', 'حقل البيض', 'layer', null],
        ],
        'P القاعات بحقلها ونوعها وجدولها الخاصّ (أو null)',
      );
      const old = clone(F.vaccine_board);
      delete old.halls;
      t.eq(m.repo.parseVaccineBoard(old).halls, null, 'P خادم قبل 0028 بلا مفتاح halls: null (لا جداول قاعات)، لا خطأ');
      const bad = [
        ['halls', (b) => (b.halls = null)],
        ['halls', (b) => (b.halls = {})],
        ['halls', (b) => (b.halls = ['x'])],
        ['id', (b) => delete b.halls[0].id],
        ['name', (b) => (b.halls[0].name = '')],
        ['site_name', (b) => delete b.halls[0].site_name],
        ['kind', (b) => (b.halls[0].kind = 'ducks')],
        ['program', (b) => delete b.halls[0].program],
        ['program', (b) => (b.halls[0].program = 'x')],
        ['version', (b) => (b.halls[3].program.version = 0)],
        ['version', (b) => (b.halls[3].program.version = 1.5)],
        ['end_age', (b) => delete b.halls[3].program.end_age],
        ['days', (b) => delete b.halls[3].program.days],
        ['vaccine_id', (b) => delete b.halls[3].program.days[0].vaccine_id],
        ['age_day', (b) => (b.halls[3].program.days[0].age_day = '5')],
        ['flock', (b) => (b.halls[0].flock = 'x')],
        ['placed_on', (b) => (b.halls[0].flock = { id: 'f', placed_on: '2026-13-01', age0: 0 })],
        ['age0', (b) => (b.halls[0].flock = { id: 'f', placed_on: '2026-11-01', age0: -1 })],
        ['id', (b) => (b.halls[0].flock = { placed_on: '2026-11-01', age0: 0 })],
      ];
      {
        const open = boardWith();
        open.halls[3].program.end_age = null;
        open.halls[0].flock = { id: 'f', placed_on: '2026-11-01', age0: 2 };
        const parsed = m.repo.parseVaccineBoard(open);
        const noFlock = boardWith();
        for (const row of noFlock.halls) delete row.flock;
        t.same([parsed.halls[3].program.endAge, parsed.halls[0].flock, parsed.halls[1].flock, m.repo.parseVaccineBoard(noFlock).halls[0].flock],
          [null, { id: 'f', placedOn: '2026-11-01', age0: 2 }, null, null], 'P 0030: نهاية مفتوحة null مقبولة، والفوج بشكله، وبلاه (أو خادم قبل 0029) null');
      }
      t.same(
        bad.map(([, spoil]) => {
          const board = boardWith();
          spoil(board);
          try {
            m.repo.parseVaccineBoard(board);
            return 'قُبل';
          } catch (error) {
            return error?.message ?? String(error);
          }
        }),
        bad.map(([field]) => `halls_shape:${field}`),
        'P كلّ خانة في halls بشكلها أو يُرفض الجواب كلّه (null وكائن ومصفوفة نصوص، والمعرّف والاسم والحقل والنوع، وprogram حاضر null أو جدول بنسخة 1 فما فوق ونهاية وأيّام)',
      );
      const { rpcLog } = fresh(MANAGER, {
        rpcs: {
          save_hall_vaccine_program: (args, n) =>
            n === 1 ? { hall_id: args.p_hall, kind: 'broiler', version: 1, end_age: 40, days: 2 } : n === 2 ? { kind: 'broiler', version: 1, end_age: 40, days: 2 } : { hall_id: args.p_hall, kind: 'ducks', version: 1, end_age: 40, days: 2 },
          drop_hall_vaccine_program: (args, n) => (n === 1 ? { hall_id: args.p_hall, dropped: false } : { hall_id: args.p_hall, dropped: 'yes' }),
        },
      });
      const days = [{ vaccineId: IB, ageDay: 7 }, { vaccineId: ND, ageDay: 9 }];
      const done = await m.repo.saveHallVaccineProgram(H1, 40, days, 0);
      t.same(
        [done, JSON.stringify(named(rpcLog, 'save_hall_vaccine_program')[0])],
        [{ hallId: H1, kind: 'broiler', version: 1, endAge: 40, days: 2 }, JSON.stringify({ p_hall: H1, p_end_age: 40, p_days: [{ vaccine_id: IB, age_day: 7 }, { vaccine_id: ND, age_day: 9 }], p_expected_version: 0 })],
        'P saveHallVaccineProgram: المعاملات بأسماء العقد وترتيبه، والنتيجة مقروءة',
      );
      await t.rejects(m.repo.saveHallVaccineProgram(H1, 40, days, 0), 'P نتيجة الحفظ بلا hall_id تُرفض', /^halls_shape:hall_id$/u);
      await t.rejects(m.repo.saveHallVaccineProgram(H1, 40, days, 0), 'P نتيجة الحفظ بنوع مجهول تُرفض', /^halls_shape:kind$/u);
      t.same([await m.repo.dropHallVaccineProgram(H5, 2), named(rpcLog, 'drop_hall_vaccine_program')[0]], [{ hallId: H5, dropped: false }, { p_hall: H5, p_expected_version: 2 }], 'P dropHallVaccineProgram: القاعة والنسخة، وdropped false مقروء');
      await t.rejects(m.repo.dropHallVaccineProgram(H5, 2), 'P dropped ليس منطقياً: يُرفض', /^halls_shape:dropped$/u);
    });
  } finally {
    if (root && m) {
      const mounted = root;
      m.flushSync(() => mounted.unmount());
    }
    delete globalThis.__hv;
    restoreOptions();
    restore();
  }
}
