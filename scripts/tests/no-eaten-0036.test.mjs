// جواب المالك الثاني في 0036 «عوف سالفة العلف الماكول» (DECISIONS 2026-11-24): لا «علف مأكول» ولا رقم محسوب منه في أيّ شاشة، وكلّ رقم علف من العلف
// المرسل. react-dom/client الحقيقي على DOM صغير (dom.mjs) يشغّل الصفحات الحقيقية (HallsRoutes: تقرير الدورة والتقويم والتقرير اليوميّ بسجلّه والإغلاق،
// وسطر علف القاعة) على repo الحقيقي بأجوبة القاعدة الحقيقية (fixtures/round-feed-0036.json من supabase/tests/round-once-feed.test بـROUND_FEED_SAMPLES_OUT=1):
// «قاعة الصافي» P قائمة بمعامل تحويل، و«قاعة بلا كتلة» U بسطر بلا وزن، و«قاعة الإغلاق» C مغلقة بإرجاع ونقل ومحسوب مستهلَكاً، وN فيها اليوم بالمنقول
// والمرسل. الحالات (كلّها تفشل على bfa5015):
// E1–E4 تقرير الدورة: لا مؤشّر المأكول ولا الباقي، ولا أعمدتهما في الأيّام والأسابيع، و«النازل» في الأسابيع، وأسباب «—» الجديدة (سطر بلا وزن، لا حيّ
//   موزون ولا مبيع)، و«خلاصة علف القاعة» بما وقع وحده (للمغلقة الراجع والمنقول عند الإغلاق والباقي الفعليّ، وللمنقول إليها عموده).
// E5 التقويم: «العلف المرسل» يوم القاعة (الصرف ليوم سابق، ويوم التسكين بالمنقول) لا «الاستهلاك المسجّل».
// E6 التقرير اليوميّ وسجلّه: عمود «صافي العلف المرسل» وجملته، ويوم الإغلاق سالب بالراجع والمنقول.
// E7 سطر علف القاعة: المصروف وحده. E8 الإغلاق: «النازل للقاعة» وحده. E9 سبب الركن dead_recorded بجملته. E10 نسخة الجهاز بعد إرسال يوم التسكين: سطر
//   المرسل لا يُضاف إلى سطر المنقول، والمجموع من جواب الإرسال (خانة الورقة).
// وفي كلّ شاشة: لا كلمة من كلمات المأكول (NO_EATEN).
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'round-feed-0036.json'), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const STUBS = {
  session: 'export const useSession = () => globalThis.__ne.session; export const sessionStore = { get: () => globalThis.__ne?.session ?? { status: "loading" } };',
  Toast: 'export const toast = (spec) => { globalThis.__ne.toasts.push(spec); }; export function Toaster() { return null; }',
  image: 'export const toBlob = async () => new Blob(["png"], { type: "image/png" });',
};
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__ne.rpc(fn, args);
export const send = async () => { throw new Error('no-eaten: no direct table access'); };
export const classifyPostgrest = (error) => new RejectedError(error.code ?? 'x', error.hint ?? null);
export const explained = async (error) => error;
export const updatedRows = () => { throw new ZeroRowsError(); };
export const authed = async () => ({ userId: globalThis.__ne?.session?.workspace?.userId ?? null, db: null });
export const unknownConstraint = () => '';`;
const plugins = [
  {
    name: 'ne-stubs',
    setup(b) {
      b.onResolve({ filter: /\/lib\/session$|\/Toast$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'ne-stub' }));
      b.onResolve({ filter: /^html-to-image$/ }, () => ({ path: 'image', namespace: 'ne-stub' }));
      b.onLoad({ filter: /.*/, namespace: 'ne-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
      b.onResolve({ filter: /^\.\/core$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('src/lib/repo/') ? { path: 'core', namespace: 'ne-core' } : undefined));
      b.onLoad({ filter: /.*/, namespace: 'ne-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
    },
  },
];

async function bundle() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route } from 'react-router-dom';",
    "export { default as HallsRoutes } from './src/pages/halls/HallsRoutes.tsx';",
    "export { FeedLine } from './src/pages/farm/feed.tsx';",
    "export { parkText } from './src/pages/farm/roundText.ts';",
    "export { withSaved } from './src/lib/farmCopy.ts';",
    "export { parseFlockFeed, parseOverview } from './src/lib/repo/flocks.ts';",
    "export { parseCycleReport, parseFlockMonth } from './src/lib/repo/halls.ts';",
    "export { parseHallsHistory } from './src/lib/repo/hallReports.ts';",
    "export { parseCloseForm } from './src/lib/repo/flockClose.ts';",
    "export { parseFeedSent } from './src/lib/repo/hallSheet.ts';",
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
    loader: { '.css': 'empty' },
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
    plugins,
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

/** كلمات العلف المأكول وما حُسب منه: لا تظهر في أيّ شاشة بعد 0036. */
const NO_EATEN = /مأكول|أُكل|المستهلك المسجّل|الاستهلاك المسجّل|الباقي في القاعة|المتوقّع في القاعة|سُجّل العلف|علف كلّ يوم|أوّل جولة بعلفها/u;
const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name, root = body()) => descendants(root).filter((n) => n.getAttribute('data-action') === name);
const textOf = (action) => byAction(action)[0]?.textContent ?? null;
const eatenWords = () => body().textContent.match(new RegExp(NO_EATEN.source, 'gu')) ?? [];
const tableOf = (caption) => all().find((n) => n.localName === 'table' && descendants(n).some((c) => c.localName === 'caption' && c.textContent === caption));
const tableRows = (caption) => {
  const table = tableOf(caption);
  const tbody = table ? descendants(table).find((n) => n.localName === 'tbody') : null;
  return tbody ? tbody.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent)) : null;
};
const tableFoot = (caption) => {
  const table = tableOf(caption);
  const tfoot = table ? descendants(table).find((n) => n.localName === 'tfoot') : null;
  return tfoot ? tfoot.children.filter((n) => n.localName === 'tr').map((tr) => tr.children.map((td) => td.textContent)) : null;
};
const tableHeaders = (caption) => {
  const table = tableOf(caption);
  return table ? descendants(table).filter((n) => n.localName === 'th' && n.getAttribute('scope') === 'col').map((n) => n.textContent) : null;
};
const keyed = (action, key) => byAction(action).find((n) => n.getAttribute('data-key') === key);
/** مؤشّر بمفتاحه: [القيمة، نصّ السبب أو الملاحظة]، أو null حين لا صفّ له. */
const kpiOf = (key) => {
  const value = keyed('kpi-value', key);
  return value ? [value.textContent, (keyed('kpi-reason', key) ?? keyed('kpi-note', key))?.textContent ?? ''] : null;
};
const kpiKeys = () => byAction('kpi-label').map((n) => n.getAttribute('data-key'));

const ws = { userId: 'u-1', orgId: 'org-1', orgName: 'مزرعة العلف المرسل', memberId: 'm-1', displayName: 'علي', phone: null, role: 'owner', scopes: [],
  divisions: ['broiler_farm', 'layer_farm'], canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1 };
const OWNER = { status: 'ready', workspace: ws };
const UNWEIGHED = 'فيه سطر علف بلا وزن بالكيلو (لتر بلا كثافة أو قطعة بلا وزن)، فلا يُعرف صافي العلف.';

export default async function (t) {
  const restore = installDom();
  globalThis.window.print = () => {};
  globalThis.document.title = 'نظام الدواجن';
  let root = null;
  let m = null;
  const unmount = async () => {
    if (!root) return;
    const mounted = root;
    root = null;
    m.flushSync(() => mounted.unmount());
    body().textContent = '';
    await settle();
  };
  try {
    m = await bundle();
    const F = R.ids.flocks;
    const fresh = (rpcs) => {
      globalThis.__ne = {
        session: OWNER,
        toasts: [],
        rpc(fn, args) {
          const handler = rpcs[fn];
          if (!handler) return new Promise(() => {});
          return Promise.resolve().then(() => clone(handler(args)));
        },
      };
    };
    const mount = async (url) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(m.Routes, null, m.h(m.Route, { path: '/halls/*', element: m.h(m.HallsRoutes) })))));
      await settle();
      await settle();
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
    const reportOf = (key) => () => R[`flock_cycle_report_${key}`];

    // ── E1: تقرير دورة قائمة بمعامل تحويل (P) ──────────────────────────────────────────────────────────────────────
    await step('E1 تقرير الدورة القائمة', async () => {
      fresh({ flock_cycle_report: reportOf('p') });
      await mount(`/halls/cycle/${F.p}`);
      t.same(
        [kpiKeys().filter((key) => ['eaten', 'left'].includes(key)), kpiOf('given'), kpiOf('per_bird'), kpiOf('fcr')?.[0], kpiOf('epef')?.[0]],
        [[], ['550', ''], ['0.55', ''], '0.463', '1,283'],
        'E1 المؤشّرات بلا «المأكول» ولا «الباقي في القاعة»، والنازل والعلف لكلّ طير ومعامل التحويل ومؤشّر الإنتاج من صافي المرسل كما قالها الخادم',
      );
      t.same(
        [tableHeaders('الأسابيع')?.includes('النازل (كغم)'), tableHeaders('الأسابيع')?.includes('المأكول (كغم)'), tableRows('الأسابيع')?.map((row) => row[10]), tableFoot('الأسابيع')?.[0]?.[6]],
        [true, false, ['0', '300', '250'], '550'],
        'E1 الأسابيع بعمود «النازل» (300 في الثاني، و50 أُرسلت ليومها + 200 في الثالث) ومجموعه من المؤشّرات، بلا «المأكول»',
      );
      t.same(
        [tableHeaders('أيّام الدورة')?.filter((head) => NO_EATEN.test(head)), tableHeaders('خلاصة علف القاعة'), tableRows('خلاصة علف القاعة'), tableOf('المصروف والمستهلك والباقي') ?? null],
        [[], ['المصروف للقاعة (كغم)'], [['550']], null],
        'E1 أيّام الدورة بلا أعمدة المأكول والباقي، و«خلاصة علف القاعة» للقائمة بالمصروف وحده (لا «المستهلك المسجّل» ولا «الباقي»)',
      );
      t.same([eatenWords(), byAction('rep-no-feed').length, byAction('rep-left-note').length], [[], 0, 0], 'E1 لا كلمة من كلمات العلف المأكول في الصفحة كلّها');
    });

    // ── E2: سطر علف بلا وزن (U) ────────────────────────────────────────────────────────────────────────────────────
    await step('E2 سطر علف بلا وزن', async () => {
      fresh({ flock_cycle_report: reportOf('u') });
      await mount(`/halls/cycle/${F.u}`);
      t.same(
        [kpiOf('per_bird'), kpiOf('fcr'), tableRows('الأسابيع')?.at(-1)?.[10], textOf('rep-unweighed')],
        [['—', UNWEIGHED], ['—', UNWEIGHED], '100وسطر واحد بلا وزن', 'لم يُحسب في الكيلو سطر واحد بلا وزن (لتر بلا كثافة أو قطعة بلا وزن).'],
        'E2 «—» معامل التحويل والعلف لكلّ طير سببه سطر العلف بلا وزن (سبب الخادم)، والأسبوع بنازله وسطره بلا وزن، والخلاصة تعدّه',
      );
      t.same(eatenWords(), [], 'E2 لا كلمة من كلمات العلف المأكول');
    });

    // ── E3: الدورة المغلقة بإرجاع ونقل ومحسوب مستهلَكاً (C) ────────────────────────────────────────────────────────
    await step('E3 الدورة المغلقة', async () => {
      fresh({ flock_cycle_report: reportOf('c'), flock_sales: () => ({ flock_id: F.c }) });
      await mount(`/halls/cycle/${F.c}`);
      t.same(
        [tableHeaders('خلاصة علف القاعة'), tableRows('خلاصة علف القاعة'), textOf('rep-close-note')],
        [
          ['المصروف للقاعة (كغم)', 'الراجع والمنقول عند الإغلاق (كغم)', 'الباقي الفعليّ عند الإغلاق (كغم)'],
          [['250', '180', '190']],
          'الباقي الفعليّ ما كُتب عند الإغلاق لكلّ مادّة علف: منه ما رجع إلى المخزن أو نُقل للدورة التالية، والباقي حُسب مستهلَكاً.',
        ],
        'E3 خلاصة المغلقة بما وقع: المصروف 250، والراجع والمنقول عند الإغلاق 180 (150 + 30)، والباقي الفعليّ 190 (ومعه 10 محسوبة مستهلَكة)، لا باقٍ محسوب',
      );
      t.same(
        [kpiOf('fcr'), kpiOf('feed_out')?.[0], kpiOf('feed_net')?.[0], kpiOf('per_bird')?.[0], tableRows('الأسابيع')?.map((row) => [row[10], row[11]])],
        [['—', 'لا طيور حيّة موزونة ولا مبيع بفاتورة.'], '180', '70', '0.233', [['0', '—'], ['0', '—'], ['250', '58.3']]],
        'E3 معامل التحويل «—» بلا حيّ موزون ولا مبيع، والخارج 180 والصافي 70 والعلف لكلّ طير منه، وغرامات أسبوع الإغلاق من الصافي (70 كغم) بجانب نازله',
      );
      t.same(eatenWords(), [], 'E3 لا كلمة من كلمات العلف المأكول (و«حُسب مستهلَكاً» مصير باقٍ عند الإغلاق لا علف مأكول)');
    });

    // ── E4: الدورة التالية بالمنقول إليها (N) ───────────────────────────────────────────────────────────────────────
    await step('E4 المنقول إليها', async () => {
      fresh({ flock_cycle_report: reportOf('n') });
      await mount(`/halls/cycle/${F.n}`);
      t.same(
        [tableHeaders('خلاصة علف القاعة'), tableRows('خلاصة علف القاعة'), kpiOf('carry_in')?.[0], eatenWords()],
        [['من الدورة السابقة (كغم)', 'المصروف للقاعة (كغم)', 'النازل للقاعة (كغم)'], [['30', '40', '70']], '30', []],
        'E4 خلاصة الدورة التالية: المنقول إليها 30 والمصروف 40 والنازل 70، بلا مستهلك ولا باقٍ',
      );
    });

    // ── E5: التقويم ───────────────────────────────────────────────────────────────────────────────────────────────
    await step('E5 التقويم', async () => {
      const panel = async (flock, month, day) => {
        fresh({ flock_month: () => month });
        await mount(`/halls/calendar/${flock}?m=2026-11`);
        const cell = byAction('cal-day').find((n) => n.getAttribute('data-day') === day);
        fire(cell, 'click');
        await settle();
        const sent = byAction('day-feed-sent')[0];
        const out = [sent?.parentNode?.children?.[0]?.textContent ?? null, sent?.textContent ?? null, byAction('day-consumed').length, eatenWords()];
        await unmount();
        return out;
      };
      t.same(
        [await panel(F.p, R.flock_month_p, '2026-11-21'), await panel(F.n, R.flock_month_n, '2026-11-24'), await panel(F.u, R.flock_month_u, '2026-11-19')],
        [['العلف المرسل', '50 كغم', 0, []], ['العلف المرسل', '70 كغم', 0, []], ['العلف المرسل', '100 كغم', 0, []]],
        'E5 تفاصيل اليوم: «العلف المرسل» يوم القاعة (50 أُرسلت اليوم ليوم 21/11، و70 يوم تسكين N: المنقول 30 والمرسل 40، والموزون وحده ليوم بسطر بلا وزن)، لا «الاستهلاك المسجّل»',
      );
    });

    // ── E6: التقرير اليوميّ وسجلّه ───────────────────────────────────────────────────────────────────────────────────
    await step('E6 التقرير اليوميّ وسجلّه', async () => {
      fresh({ halls_day: () => R.halls_day, halls_history: () => R.halls_history });
      await mount('/halls/day?on=2026-11-24');
      const kinds = byAction('hist-kind');
      const broiler = kinds.find((n) => n.getAttribute('data-kind') === 'broiler');
      const caption = (n) => descendants(n).find((c) => c.localName === 'caption' && c.textContent.includes('أيّام'))?.textContent ?? '';
      const days = caption(broiler);
      const rowOf = (on) => (tableRows(days) ?? []).find((row) => row[0].startsWith(on));
      const col = (tableHeaders(days) ?? []).indexOf('صافي العلف المرسل (كغم)');
      t.same(
        [col > 0, (tableHeaders(days) ?? []).includes('المأكول (كغم)'), rowOf('22/11/2026')?.[col], rowOf('19/11/2026')?.[col], rowOf('20/11/2026')?.[col], rowOf('18/11/2026')?.[col], tableFoot(days)?.[0]?.[col - 1]],
        [true, false, '-180', '100وسطر واحد بلا وزن', '250', '—', '790وسطر واحد بلا وزن'],
        'E6 أيّام السجلّ بعمود «صافي العلف المرسل» (لا «المأكول»): يوم الإغلاق −180 (الراجع والمنقول)، ويوم بسطر بلا وزن بسطره، ويوم بلا علف «—»، ومجموع الشهر 790',
      );
      t.same(
        [within(broiler, 'hist-sentence')?.includes('وصافي العلف المرسل إلى القاعات 790 كغم وسطر واحد بلا وزن'), eatenWords()],
        [true, []],
        'E6 جملة «ما جرى» بصافي العلف المرسل، ولا كلمة من كلمات العلف المأكول في التقرير اليوميّ وسجلّه',
      );
    });

    // ── E7: سطر علف القاعة ─────────────────────────────────────────────────────────────────────────────────────────
    await step('E7 سطر علف القاعة', async () => {
      const line = async (sample) => {
        const container = globalThis.document.createElement('div');
        body().appendChild(container);
        root = m.createRoot(container);
        m.flushSync(() => root.render(m.h(m.MemoryRouter, null, m.h(m.FeedLine, { feed: m.parseFlockFeed(clone(sample)) }))));
        await settle();
        const out = [byAction('feed-line')[0]?.children?.[0]?.textContent ?? null, textOf('feed-unweighed'), byAction('feed-negative').length, eatenWords()];
        await unmount();
        return out;
      };
      t.same(
        [await line(R.flock_feed_p), await line(R.flock_feed_u)],
        [
          ['المصروف للقاعة: 550 كغم', null, 0, []],
          ['المصروف للقاعة: 100 كغم', 'سطور علف لا يُعرف وزنها (سائل بلا كثافة أو كيس بلا وزن) فلم تُحسب بالكيلو: 1.', 0, []],
        ],
        'E7 علف القاعة بالمصروف وحده وسطوره بلا وزن: لا «المستهلك المسجّل» ولا «الباقي في القاعة» ولا جملة «سُجّل أكل»',
      );
    });

    // ── E8: نموذج الإغلاق ──────────────────────────────────────────────────────────────────────────────────────────
    await step('E8 الإغلاق', async () => {
      const form = async (sample, flock) => {
        fresh({ flock_close_form: () => sample });
        await mount(`/halls/close/${flock}`);
        const out = [textOf('close-estimate'), descendants(byAction('close-feed')[0] ?? body()).find((n) => n.localName === 'h2')?.textContent ?? null,
          body().textContent.includes('اكتب الباقي الفعليّ لكلّ مادّة'), eatenWords()];
        await unmount();
        return out;
      };
      t.same(
        [await form(R.flock_close_form_p, F.p), await form(R.flock_close_form_u, F.u)],
        [
          ['النازل للقاعة 550 كغم.', 'الباقي الفعليّ في القاعة', true, []],
          ['النازل للقاعة 100 كغم. وسطور بلا وزن خارج الكيلو: 1.', 'الباقي الفعليّ في القاعة', true, []],
        ],
        'E8 نموذج الإغلاق: «النازل للقاعة» وحده (وسطوره بلا وزن)، بلا المأكول ولا «المتوقّع في القاعة» ولا «سُجّل العلف n من m»، و«اكتب الباقي الفعليّ» باقٍ',
      );
    });

    // ── E9: سبب الركن dead_recorded ────────────────────────────────────────────────────────────────────────────────
    t.same(
      [m.parkText('dead_recorded'), m.parkText('nothing_known')],
      ['سُجّلت هلاكات هذا اليوم قبلها، فلم تُضف إليها؛ وتصحيحها من صفحة القاعة ← ✎ تعديل الجدول', 'رُدّ من الخادم'],
      'E9 الزيارة المركونة لأنّ هلاكات يومها مسجّلة بجملتها وطريق تصحيحها (لا «رُدّ من الخادم»)',
    );

    // ── E10: نسخة الجهاز بعد إرسال علف يوم التسكين ────────────────────────────────────────────────────────────────────
    {
      const overview = clone(R.flocks_overview);
      const sent = m.parseFeedSent(clone(R.send_flock_feed_carry));
      const before = clone(overview);
      const n = (json) => json.sites.flatMap((site) => site.halls).find((hall) => hall.flock?.id === F.n)?.flock;
      // قراءةٌ قبل الإرسال (المنقول وحده) ثمّ جوابه: سطر المرسل يُضاف وحده، والمجموع من الجواب (70 = المنقول 30 + 40).
      const read = n(before);
      read.feed_today = read.feed_today.filter((line) => line.carry);
      read.feed_today_kg = '30.000';
      const fed = [{ ...sent.issue, key: 'u-1:org-1', flockId: F.n, day: sent.day.on, dayKg: sent.day.feedKg, mark: 2 }];
      const shown = m.parseOverview(m.withSaved(before, 'u-1:org-1', 1, [], fed));
      const flock = shown.sites.flatMap((site) => site.halls).find((hall) => hall.flock?.id === F.n)?.flock;
      t.same(
        [flock?.feedTodayKg, flock?.feedToday.map((line) => [line.itemName, line.qty, line.carry])],
        [70_000n, [['علف ناهي', 30_000n, true], ['علف ناهي', 40_000n, false]]],
        'E10 بعد إرسال 40 يوم التسكين: سطر المنقول 30 كما هو وسطر المرسل 40 وحده (لا 70 تحت المنقول)، ومجموع اليوم 70 من جواب الإرسال',
      );
      const real = m.parseOverview(clone(R.flocks_overview));
      const nReal = real.sites.flatMap((site) => site.halls).find((hall) => hall.flock?.id === F.n)?.flock;
      t.same([nReal?.feedTodayKg, nReal?.feedToday.map((line) => [line.qty, line.carry])], [70_000n, [[30_000n, true], [40_000n, false]]],
        'E10 عيّنة القاعدة: علامة المنقول تُقرأ لكلّ سطر، والمجموع يعدّه مرّة');
    }
  } finally {
    await unmount();
    delete globalThis.window.print;
    delete globalThis.__ne;
    restore();
  }
}

/** نصّ أوّل عقدة بفعلها تحت عقدة. */
function within(root, action) {
  return root ? (descendants(root).find((n) => n.getAttribute('data-action') === action)?.textContent ?? null) : null;
}
