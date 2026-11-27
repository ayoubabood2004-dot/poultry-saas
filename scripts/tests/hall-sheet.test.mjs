// «القاعة كالورقة» (طلب المالك 2026-11-21 بصورة ورقته «هلاكات قاعة (7)»، «وجبة 2026-11-13»؛ عقد 0034/0035 الجزء B4 وC/S2): ورقة القاعة من hall_sheet.
// الشاشات الحقيقية (FarmRoutes بصفحة القاعة، وتقرير الوجبة ReportPage) بـreact-dom/client الحقيقي على DOM صغير (dom.mjs)، والطابور الحقيقي (saveRound
// وuploadRounds) على fake-indexeddb، والمحلّل الحقيقي (parseHallSheet وparseFeedSent وgasAnswer) على العيّنة اليدوية للعقد (fixtures/hall-sheet.hand.json؛
// الجلسة الرئيسية تبدّلها بعيّنات القاعدة الحقيقية). كلّ حالة تفشل على الشفرة قبلها (لا hall_sheet ولا غاز ولا ورقة).
// P المحلّل: الشكل والقيم، والصرامة لكلّ مفتاح (نصّ مكان عدد، وفاصلة في رقم، وفجوة في الأيام، وthrough، والمستبعد فوق الهلاكات، وغاز بلا نسخة، وبيض للّاحم…)،
//   وجواب send_flock_feed وset_flock_gas، وتحويل الكيس إلى الكيلو.
// S الورقة: العنوان و«وجبة»، والأعمدة، وصفّ لكلّ يوم من التسكين حتى through، واليوم معلَّم ومُمرَّر إليه، والمجموع من الخادم، والمستبعد القديم داخل الهلاكات،
//   وعلف يوم فات في يومه، وصفّ الأفعال، والمركون بـ«أُدخلت»/«تجاهل»، والبيّاض بعمود البيض.
// E الخانات: هلاكات يوم بثلاث لمسات بالطابور (save_flock_day بنسخة صفّ اليوم)، والمستبعد القديم يُصفَّر، ويوم قبل 20 يوماً يُكتب، والغاز بالطابور ويندمج
//   و«بانتظار الرفع»، والملاحظة، ولا كتابة ليوم قادم ولا لوجبة مغلقة، وحدّ الحيّ.
// F العلف: ورقة اليوم بما أُرسل و«ألغِ» بتأكيد يسمّي المادّة والكمية واليوم، والإرسال من «رصيد العلف» بثلاث لمسات (آخر علف جاهز والكيس افتراضاً)، ويوم فات
//   بيومه، والنتيجة المجهولة تُعاد بالمرجع نفسه بعد إعادة الفتح، وبلا اتصال جملة.
// Q المركون على الجهاز يُدلّ عليه في الورقة. R تقرير الوجبة: الخلاصة من الخادم وحسابها من العيّنة، والجدول حتى اليوم بمجموعه في آخره (بلا مجموع تراكميّ)، والصورة والطباعة.
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, Element, fire, installDom, settle } from './dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'hall-sheet.hand.json'), 'utf8'));
// عيّنات القاعدة الحقيقية (supabase/tests/hall-sheet.test.mjs بـHALL_SHEET_SAMPLES_OUT=1): تمرّ بالمحلّلات الحقيقية (تكامل 0035).
// قاعة مقسومة قسمين (0038، عقد Part S): الورقة نفسها بأقسامها، مكتوبة باليد قبل الهجرة.
const SPLIT = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'hall-sections.hand.json'), 'utf8')).hall_sheet;
const REAL = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'hall-sheet-0035.json'), 'utf8'));
// عيّنات الكاز الحقيقية (supabase/tests/kerosene.test.mjs بـKEROSENE_SAMPLES_OUT=1، اليوم المثبَّت 2026-11-26).
const KERO = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'kerosene-0037.json'), 'utf8'));
// عيّنات الأقسام الحقيقية (supabase/tests/hall-sections.test.mjs بـHALL_SECTIONS_SAMPLES_OUT=1، اليوم المثبَّت 2026-11-27): وجبة بقسمين 13,526 + 13,525.
const HSEC = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'hall-sections-0038.json'), 'utf8'));
const REAL_FLOCKS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'flocks.ts'));
const REAL_SHEET = JSON.stringify(path.join(ROOT, 'src', 'lib', 'repo', 'hallSheet.ts'));
const STUBS = {
  flocks: `export * from ${REAL_FLOCKS}; import { parseOverview as __parseOverview } from ${REAL_FLOCKS};
    export const loadOverviewJson = (...a) => globalThis.__hs.call('loadOverviewJson', a);
    export const loadOverview = async () => __parseOverview(await globalThis.__hs.call('loadOverviewJson', []));
    export const recordFlockWeight = (...a) => globalThis.__hs.call('record_flock_weight', a);
    export const flockDayTransport = { currentUserId: async () => globalThis.__hs.userId, send: (op) => globalThis.__hs.send(op), lookup: async () => null };`,
  hallSheet: `export * from ${REAL_SHEET}; import { parseHallSheet as __sheet, parseFeedSent as __sent } from ${REAL_SHEET};
    export const loadHallSheet = async (id) => __sheet(await globalThis.__hs.call('hall_sheet', [id]));
    export const sendFlockFeed = async (request) => __sent(await globalThis.__hs.call('send_flock_feed', [request]));
    export const voidSheetFeed = (...a) => globalThis.__hs.call('void_flock_issue', a);
    import * as __S from ${REAL_SHEET}; const __outcome = (answer) => (__S.rejectOutcome ? __S.rejectOutcome(answer) : answer);
    export const decideFlockReject = async (...a) => __outcome(await globalThis.__hs.call('decide_flock_reject', a));`,
  session: 'export const useSession = () => globalThis.__hs.session;',
  Toast: 'export const toast = (spec) => { globalThis.__hs.toasts.push(spec); }; export function Toaster() { return null; }',
  // بطاقة البيع والإغلاق (0028) لها فحوصها؛ هنا فارغة فلا تقرأ الخادم.
  FlockCard: 'export default function FlockCard() { return null; }',
  hallsChunk: `import FlockPage, { HallPage } from './src/pages/farm/FlockPage.tsx';
    const nothing = () => null;
    export const loadHalls = () => Promise.resolve({ HallPage, FlockPage, FlockCard: nothing, Reminders: nothing, FlockEditDialog: nothing });`,
};

async function screens() {
  const entry = [
    "export { createElement as h } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "export { flushSync } from 'react-dom';",
    "export { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';",
    "export { default as FarmRoutes } from './src/pages/farm/FarmRoutes.tsx';",
    "export { default as ReportPage, summaryRows, reportDays } from './src/pages/halls/ReportPage.tsx';",
    "export { onlineStore } from './src/lib/online.ts';",
    "export { openOutbox, pendingOps, reviewEntries, saveRound } from './src/lib/outbox/index.ts';",
    "export { uploadRounds } from './src/lib/roundUploads.ts';",
    "export { parseHallSheet, parseFeedSent, toBaseQty, HallSheetShapeError } from './src/lib/repo/hallSheet.ts';",
    "export { gasAnswer, keroseneAnswer, deadAnswer, parseDayRow, parseOverview } from './src/lib/repo/flocks.ts';",
    "export { parseHallSections } from './src/lib/repo/hallAdmin.ts';",
    "export { UnknownOutcomeError } from './src/lib/errors.ts';",
    "export { fmtDay, fmtInt } from './src/lib/format.ts';",
    "export { wideStore } from './src/lib/wide.ts';",
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
    plugins: [
      {
        name: 'sheet-stubs',
        setup(b) {
          b.onResolve({ filter: /\/lib\/session$|\/lib\/repo\/flocks$|\/lib\/repo\/hallSheet$|\/Toast$|\/lib\/hallsChunk$|\/halls\/FlockCard$/ }, (args) => ({ path: args.path.split('/').at(-1), namespace: 'sheet-stub' }));
          b.onLoad({ filter: /.*/, namespace: 'sheet-stub' }, (args) => ({ contents: STUBS[args.path], resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const body = () => globalThis.document.body;
const all = () => descendants(body());
const byAction = (name, root = body()) => descendants(root).filter((n) => n.getAttribute('data-action') === name);
const textOf = (name, root = body()) => byAction(name, root)[0]?.textContent ?? null;
const hrefOf = (name, root = body()) => byAction(name, root)[0]?.getAttribute('href') ?? null;
const text = () => body().textContent;
const clone = (value) => JSON.parse(JSON.stringify(value));
const click = async (node, rounds = 60) => {
  if (node) fire(node, 'click', { button: 0, detail: 1 });
  await settle(rounds);
};
const type = (input, value) => {
  if (!input) return;
  input.value = value;
  fire(input, 'input');
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const ancestor = (node, test) => {
  for (let n = node?.parentNode ?? null; n; n = n.parentNode) if (test(n)) return n;
  return null;
};
const tableBy = (caption) => all().find((n) => n.localName === 'table' && n.children.some((c) => c.localName === 'caption' && c.textContent === caption)) ?? null;
const section = (table, name) => table?.children.find((c) => c.localName === name) ?? null;
const bodyRows = (table) => (section(table, 'tbody')?.children ?? []).filter((c) => c.localName === 'tr');
const footRow = (table) => (section(table, 'tfoot')?.children ?? []).find((c) => c.localName === 'tr') ?? null;
const headers = (table) => descendants(section(table, 'thead') ?? body()).filter((n) => n.localName === 'th').map((n) => n.textContent);
const cells = (tr) => (tr?.children ?? []).filter((c) => c.localName === 'td' || c.localName === 'th').map((c) => c.textContent);
const dialogTitled = (start) => all().find((n) => n.getAttribute('role') === 'dialog' && descendants(n).some((c) => c.localName === 'h2' && c.textContent.startsWith(start))) ?? null;
/** مفتاح لوحة الأرقام (WeightPad) بقيمته داخل النافذة. */
const key = (dialog, value) => (dialog ? descendants(dialog).find((n) => n.localName === 'button' && n.getAttribute('aria-label') === value) ?? null : null);
/** سطور زرّ بسطرين (الفعل، وتحته ما يُرسل): نصوص أوراقه. */
const lines = (node) => (node ? descendants(node).filter((n) => n.localName === 'span' && !n.children.some((c) => c.localName === 'span')).map((n) => n.textContent) : null);
const classOf = (node) => node?.getAttribute('class') ?? '';
/** مفتاح من لوحة الحاسوب على عنصر (keydown يصعد إلى window كالمتصفّح). */
const pressKey = async (target, value, rounds = 5) => {
  if (target) fire(target, 'keydown', { key: value });
  await settle(rounds);
};
/**
 * لمسة إصبع على خانة (pointerdown من اللمس ثمّ click): الورقة مقفولة حتى القلم (عقد 0036 S2)، وفي وضع التعديل لمسة الخانة تفتح ورقتها السفلية أو نافذة العلف
 * كما كانت لمستها تفتحها قبل القفل.
 */
const tap = async (node, rounds = 60) => {
  if (node) {
    fire(node, 'pointerdown', { pointerType: 'touch', button: 0, buttons: 1 });
    fire(node, 'click', { button: 0, detail: 1 });
  }
  await settle(rounds);
};
/** «✎ تعديل الجدول»: وضع التعديل. */
const pencil = async () => {
  const button = byAction('sheet-pencil')[0] ?? null;
  if (button) fire(button, 'click', { button: 0, detail: 1 });
  await settle(30);
};
/** الرقم المعروض في لوحة الأرقام داخل النافذة. */
const padText = (dialog) => {
  const shown = dialog ? byAction('weight-display', dialog)[0] : null;
  return shown ? (descendants(shown).find((n) => n.localName === 'span' && n.getAttribute('dir') === 'ltr')?.textContent ?? null) : null;
};

export default async function (t) {
  const restore = installDom();
  // تمرير صفّ اليوم إلى وسط الجدول: مواضع بسيطة لكلّ صفّ (40 نقطة) والحاوية بارتفاع 400.
  const savedRect = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect');
  const savedClient = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
  Element.prototype.getBoundingClientRect = function rect() {
    if (this.localName === 'tr') {
      const rows = (this.parentNode?.children ?? []).filter((c) => c.localName === 'tr');
      return { top: 40 + rows.indexOf(this) * 40, height: 40 };
    }
    return { top: 0, height: 400 };
  };
  Object.defineProperty(Element.prototype, 'clientHeight', { get: () => 400, configurable: true });
  Object.defineProperty(Element.prototype, 'scrollTop', { value: 0, writable: true, configurable: true });
  try {
    const m = await screens();
    const BROILER = FIX.hall_sheet.broiler;
    const LAYER = FIX.hall_sheet.layer;
    const TODAY = BROILER.today;
    const F7 = BROILER.flock.id;
    const H7 = BROILER.flock.hall_id;
    const GROWER = BROILER.feed_items.find((item) => item.last).item_id;

    // ── I: عيّنات القاعدة الحقيقية بالمحلّلات الحقيقية ─────────────────────────────────────────────────
    for (const name of ['hall_sheet_broiler', 'hall_sheet_layer', 'hall_sheet_closed']) {
      const raw = REAL[name];
      const sheet = m.parseHallSheet(clone(raw));
      t.same([sheet.days.length, sheet.days[0].on, sheet.days.at(-1).on], [raw.days.length, raw.placed_on ?? raw.flock.placed_on, raw.through], `I ${name}: صفّ لكلّ يوم من التسكين حتى through`);
      t.same(sheet.days.map((day) => [day.dead, day.gas, day.note]), raw.days.map((day) => [day.day_version === null ? 0 : day.dead, day.gas, day.note]), `I ${name}: الهلاكات والغاز والملاحظة كما أرسلها الخادم (يوم بلا جولة هلاكاته null من الخادم وصفر بالمحلّل؛ «سُجّل؟» من النسخة)`);
    }
    {
      const sheet = m.parseHallSheet(clone(REAL.hall_sheet_broiler));
      t.same([sheet.days.filter((day) => day.feed.length > 0).length > 0, sheet.feedItems.length > 0], [true, true], 'I الدجاج: علف مرسل في يومه، وعلف يُختار');
      t.same(m.parseHallSheet(clone(REAL.hall_sheet_closed)).rejects.length > 0, true, 'I الوجبة المغلقة: المردود يظهر');
      t.same(m.parseFeedSent(clone(REAL.send_flock_feed)).issue.forDay ?? null, REAL.send_flock_feed.issue.for_day, 'I send_flock_feed الحقيقي');
      t.same([m.gasAnswer(clone(REAL.set_flock_gas_saved)).kind, m.gasAnswer(clone(REAL.set_flock_gas_stale)).kind], ['saved', 'stale_gas'], 'I set_flock_gas الحقيقي: saved وstale_gas');
    }
    // ── I0037: عيّنات الكاز الحقيقية (kerosene.test بـKEROSENE_SAMPLES_OUT=1، يومها المثبَّت 2026-11-26) بالمحلّلات الحقيقية ──────────────────
    {
      const raw = KERO.hall_sheet;
      const sheet = m.parseHallSheet(clone(raw));
      const keroDays = (days, liters, version) => days.filter((day) => day[liters] !== null || day[version] !== null).map((day) => [day.on, day[liters], day[version]]);
      t.same(keroDays(sheet.days, 'kerosene', 'keroseneVersion'), keroDays(raw.days, 'kerosene', 'kerosene_version'), 'I0037 الكاز ونسخته لكلّ يوم كما أرسلهما الخادم (اليوم الممسوح لتراته فارغة بنسخته)');
      t.same(keroDays(sheet.days, 'kerosene', 'keroseneVersion').length, 3, 'I0037 العيّنة فيها يوما كاز ويوم ممسوح');
      t.same([sheet.totals.kerosene, sheet.summary.kerosene], [raw.totals.kerosene, raw.summary.kerosene], 'I0037 مجموع الكاز في الورقة وخلاصتها كما أرسلهما الخادم');
      t.same(
        [KERO.set_flock_kerosene_saved, KERO.set_flock_kerosene_stale, KERO.set_flock_kerosene_parked].map((answer) => m.keroseneAnswer(clone(answer)).kind),
        ['saved', 'stale_kerosene', 'parked'],
        'I0037 set_flock_kerosene الحقيقي: saved وstale_kerosene وparked',
      );
    }
    // ── I0038: عيّنات الأقسام الحقيقية (hall-sections.test بـHALL_SECTIONS_SAMPLES_OUT=1، يومها المثبَّت 2026-11-27) بالمحلّلات الحقيقية ──────────
    {
      const raw = HSEC.hall_sheet;
      const sheet = m.parseHallSheet(clone(raw));
      const partDays = (days, on, parts, version) => days.filter((day) => day[parts] !== null).map((day) => [day[on], day.dead, day[parts], day[version]]);
      t.same(partDays(sheet.days, 'on', 'deadParts', 'dayVersion'), partDays(raw.days, 'on', 'dead_parts', 'day_version'), 'I0038 هلاكات كلّ قسم ومجموعها ونسخة الصفّ لكلّ يوم كما أرسلها الخادم');
      t.same(
        partDays(sheet.days, 'on', 'deadParts', 'dayVersion').map(([on, dead, parts]) => [on, dead, parts]),
        [['2026-11-22', 5, [3, 2]], ['2026-11-24', 4, [1, 3]], ['2026-11-25', 0, [0, 0]], ['2026-11-26', 2, [2, 0]]],
        'I0038 العيّنة: ثلاثة أيّام بهلاكات ويوم «لا هلاكات» بأصفار',
      );
      t.same(
        [sheet.sections?.map((x) => [x.no, x.placed, x.dead, x.mortalityPct, x.remaining]), sheet.totals.deadParts, sheet.totals.dead],
        [[[1, 13526, 6, 4n, 13520], [2, 13525, 5, 4n, 13520]], [6, 5], 11],
        'I0038 الأقسام بأعدادها (27,051 بالتساوي) وهلاكاتها ونسبها وباقيها، ومجموع كلّ قسم، كما أرسلها الخادم',
      );
      const overview = m.parseOverview(clone(HSEC.flocks_overview));
      const view = (halls, counts, dead) => halls.map((hall) => [hall.name, hall.sections, hall.flock?.[counts] ?? null, hall.flock?.[dead] ?? null]);
      t.same(
        view(overview.sites.flatMap((site) => site.halls), 'sectionCounts', 'sectionDead'),
        view(HSEC.flocks_overview.sites.flatMap((site) => site.halls), 'section_counts', 'section_dead'),
        'I0038 flocks_overview: أقسام كلّ قاعة، وعدد كلّ قسم في وجبتها وهلاكاته، كما أرسلها الخادم',
      );
      t.same(
        overview.sites.flatMap((site) => site.halls).filter((hall) => hall.sections > 1 && hall.flock === null).length > 0,
        true,
        'I0038 العيّنة فيها قاعة مقسومة بلا وجبة (التسكين يقسم العدد عليها)',
      );
      const saved = m.deadAnswer(clone(HSEC.set_flock_dead_saved));
      const recorded = m.deadAnswer(clone(HSEC.set_flock_dead_recorded));
      t.same(
        [saved.kind, saved.version, m.parseDayRow(saved.day).deadParts, recorded.kind, m.parseDayRow(recorded.server).deadParts],
        ['saved', 1, [2, 0], 'dead_recorded', [3, 2]],
        'I0038 set_flock_dead الحقيقي: saved بأقسام اليوم، وdead_recorded بأقسام المسجَّل قبل',
      );
      t.same(m.parseHallSections(clone(HSEC.set_hall_sections_saved)), { status: 'saved', version: 2, sections: 2 }, 'I0038 set_hall_sections الحقيقي: saved بنسخة القاعة وأقسامها');
      t.same(
        [HSEC.set_hall_sections_refused.code, /^في القاعة «.+» وجبة سُجّلت هلاكاتها/u.test(HSEC.set_hall_sections_refused.hint)],
        ['sections_after_deaths', true],
        'I0038 رفض set_hall_sections الحقيقي برمزه وتلميحه الذي تعرضه النافذة (sections-review-round HD1 بالتلميح نفسه)',
      );
    }
    // ── P: المحلّل ──────────────────────────────────────────────────────────────────────────────────────────────────
    {
      const sheet = m.parseHallSheet(clone(BROILER));
      t.same(
        [sheet.days.length, sheet.days[0].on, sheet.days.at(-1).on, sheet.through, sheet.days[0].age, sheet.canWrite, sheet.flock.kind, sheet.flock.hallName],
        [46, '2026-11-13', '2026-12-28', '2026-12-28', 0, true, 'broiler', '7'],
        'P الورقة صفّ لكلّ يوم من التسكين (عمر 0) حتى through (التسكين + 45 للّاحم بلا نهاية مخطّطة)',
      );
      const cull = sheet.days.find((day) => day.on === '2026-11-15');
      const late = sheet.days.find((day) => day.on === '2026-11-20');
      t.same(
        [cull.dead, cull.culled, cull.dayVersion, late.feedKg, late.feed.map((line) => [line.itemName, line.qty, line.issuedOn, line.canVoid]), sheet.days[0].dayVersion, sheet.days[0].gas, sheet.days[0].gasVersion],
        [5, 2, 2, 200000n, [['علف بادئ', 200000n, '2026-12-01', true]], null, 4, 1],
        'P المستبعد القديم داخل الهلاكات، وعلف يوم فات بيوم خروجه، واليوم بلا صفّ نسخته null، والغاز بنسخته',
      );
      t.same(
        [sheet.totals, sheet.summary],
        [
          { dead: 32, deadParts: null, gas: 17, kerosene: 400, feedKg: 1000000n, feedBackKg: null, soldBirds: 1000, soldNetKg: 2350500n, eggsTotal: null },
          { placed: 5000, dead: 32, mortalityPct: 64n, live: 3968, feedKg: 1000000n, feedBags: 20000n, feedBackKg: null, feedNetKg: 1000000n, gas: 17, kerosene: 400, soldBirds: 1000, soldNetKg: 2350500n, avgWeightKg: 2351n, fcr: 425n },
        ],
        'P المجاميع والخلاصة من الخادم كما هي (بالآلاف والمئات)، والكاز (0037)',
      );
      // الكاز (0037): اليوم بلتراته ونسخته، والممسوح نسخة بلا لترات، وقارئ قبل 0037 (البيّاض بلا المفاتيح) null وصفر.
      const kero = (on) => sheet.days.find((day) => day.on === on);
      const layerSheet = m.parseHallSheet(clone(LAYER));
      t.same(
        [[kero('2026-11-15').kerosene, kero('2026-11-15').keroseneVersion], [kero('2026-11-16').kerosene, kero('2026-11-16').keroseneVersion], [kero('2026-11-17').kerosene, kero('2026-11-17').keroseneVersion], [layerSheet.days[0].kerosene, layerSheet.days[0].keroseneVersion, layerSheet.totals.kerosene, layerSheet.summary.kerosene]],
        [[400, 1], [null, 2], [null, null], [null, null, 0, 0]],
        'P الكاز بلتراته ونسخته، والممسوح بنسخة بلا لترات، وبلا المفاتيح (قارئ قبل 0037) null وصفر',
      );
      const badKero = (patch) => {
        const sample = clone(BROILER);
        Object.assign(sample.days[2], patch);
        try {
          m.parseHallSheet(sample);
          return 'parsed';
        } catch (error) {
          return error instanceof m.HallSheetShapeError ? error.field : `other:${error?.message}`;
        }
      };
      t.same([badKero({ kerosene_version: null }), badKero({ kerosene: 20001 }), badKero({ kerosene: -1 })], ['kerosene', 'kerosene', 'kerosene'], 'P الكاز بلا نسخة، أو فوق 20,000، أو سالباً: يُرفض');
      t.same(
        [sheet.feedItems.map((item) => [item.name, item.onHand, item.units.map((unit) => [unit.name, unit.baseQty]), item.last]), sheet.rejects.map((reject) => [reject.on, reject.reason])],
        [[['علف بادئ', 1200000n, [['كيس 50 كغم', 50000000n]], false], ['علف نامي', 850500n, [['كيس 50 كغم', 50000000n]], true]], [['2026-11-19', 'date_too_old'], ['2026-11-21', 'period_locked']]],
        'P أعلاف «رصيد العلف» بعندك ووحداتها (العامل بستّ مراتب) وآخرها، والمركون',
      );
      t.same(m.parseHallSheet(clone(LAYER)).days.map((day) => day.eggsTotal), [null, 2100, 2250, 2300, null, 2280, 2310], 'P البيّاض ببيضه، والغائب null لا صفر');
      const bad = (mutate) => {
        const json = clone(BROILER);
        mutate(json);
        try {
          m.parseHallSheet(json);
          return 'parsed';
        } catch (error) {
          return error instanceof m.HallSheetShapeError ? error.field : `other:${error?.message}`;
        }
      };
      t.same(
        [
          bad((j) => { j.days[1].dead = '6'; }),
          bad((j) => { j.days[0].feed_kg = 100; }),
          bad((j) => { j.totals.feed_kg = '1,000.000'; }),
          bad((j) => { j.days.splice(3, 1); }),
          bad((j) => { j.through = '2026-12-29'; }),
          bad((j) => { j.days[2].culled = 9; }),
          bad((j) => { j.days[0].gas_version = null; }),
          bad((j) => { j.flock.kind = 'pigeon'; }),
          bad((j) => { j.days[1].eggs_total = 10; }),
          bad((j) => { j.feed_items[0].units[0].base_qty = '0'; }),
          bad((j) => { j.rejects[0].created_at = 'أمس'; }),
          bad((j) => { delete j.can_write; }),
          bad((j) => { j.feed_items[0].on_hand = null; }),
          bad((j) => { j.days[0].feed[0].qty = '0'; }),
        ],
        ['dead', 'feed_kg', 'feed_kg', 'days', 'through', 'culled', 'gas_version', 'kind', 'eggs_total', 'base_qty', 'created_at', 'can_write', 'on_hand', 'qty'],
        'P الصرامة: كلّ مفتاح بنوعه، والرقم العشري نصّ بلا فواصل، وصفّ لكلّ يوم بلا فجوة حتى through، والمستبعد لا يتجاوز الهلاكات، والغاز ونسخته معاً، ولا بيض للّاحم',
      );
      const sent = m.parseFeedSent(clone(FIX.send_flock_feed));
      t.same([sent.issue.docNo, sent.issue.qty, sent.issue.forDay, sent.issue.issuedOn, sent.day.feedKg], ['FI-2026-0321', 100000n, '2026-11-21', TODAY, 100000n], 'P جواب send_flock_feed: الصرف بيوم خروجه ويومه');
      t.throws(() => m.parseFeedSent({ ...clone(FIX.send_flock_feed), status: 'parked' }), 'P send_flock_feed بغير saved يرمي');
      const gas = FIX.set_flock_gas;
      t.same(
        [m.gasAnswer(clone(gas.saved)), m.gasAnswer(clone(gas.stale)), m.gasAnswer(clone(gas.parked))],
        [{ kind: 'saved', version: 1 }, { kind: 'stale_gas', server: gas.stale.server }, { kind: 'parked', reason: 'period_locked' }],
        'P جواب set_flock_gas ← نتيجة الطابور: saved بنسخة الصفّ، وstale_gas بقيمة الخادم، وparked بسببه',
      );
      t.throws(() => m.gasAnswer({ status: 'saved', gas: { on: TODAY, cylinders: 1001, version: 1 } }), 'P غاز فوق 1,000 قنينة شكلٌ غريب (يبقى بالطابور)');
      // 0037: جواب set_flock_kerosene بأشكال العقد (D3): saved بالكاز كما حُفظ ونسخته، وstale_kerosene بقيمة الخادم، وparked بسببه.
      const keroSaved = { status: 'saved', kerosene: { on: TODAY, liters: 400, version: 3 } };
      const keroStale = { status: 'stale_kerosene', server: { on: TODAY, liters: 200, version: 2 } };
      t.same(
        [m.keroseneAnswer(clone(keroSaved)), m.keroseneAnswer(clone(keroStale)), m.keroseneAnswer({ status: 'parked', reason: 'flock_closed' })],
        [{ kind: 'saved', version: 3, kerosene: keroSaved.kerosene }, { kind: 'stale_kerosene', server: keroStale.server }, { kind: 'parked', reason: 'flock_closed' }],
        'P جواب set_flock_kerosene ← نتيجة الطابور: saved بنسخة صفّ الكاز، وstale_kerosene بقيمة الخادم، وparked بسببه',
      );
      t.same(
        [
          (() => { try { m.keroseneAnswer({ status: 'saved', kerosene: { on: TODAY, liters: 20001, version: 1 } }); return 'parsed'; } catch { return 'threw'; } })(),
          (() => { try { m.keroseneAnswer({ status: 'saved', kerosene: { on: TODAY, liters: 5, version: 0 } }); return 'parsed'; } catch { return 'threw'; } })(),
          (() => { try { m.keroseneAnswer({ status: 'stale_gas', server: keroStale.server }); return 'parsed'; } catch { return 'threw'; } })(),
          m.keroseneAnswer({ status: 'saved', kerosene: { on: TODAY, liters: null, version: 4 } }).version,
        ],
        ['threw', 'threw', 'threw', 4],
        'P الكاز فوق 20,000 لتر أو بلا نسخة أو بحالة غير حالاته شكلٌ غريب (يبقى بالطابور)، والممسوح بنسخته',
      );
      const bag = sheet.feedItems[1].units[0];
      t.same([m.toBaseQty(2000n, bag), m.toBaseQty(1500n, bag), m.toBaseQty(120500n, null)], [100000n, 75000n, 120500n], 'P كيسان من 50 كغم = 100 كغم، وكيس ونصف = 75، والكيلو كما هو');
    }

    // ── الحامل ─────────────────────────────────────────────────────────────────────────────────────────────────────
    const ws = (role, userId) => ({
      userId, orgId: 'org-1', orgName: 'مزرعة', memberId: 'mm-1', displayName: 'علي', phone: null, role, scopes: [], divisions: ['broiler', 'layer'],
      canSeeCost: true, canSeeAccounts: true, canSeeSales: true, invites: [], subscription: 'active', confirmedAt: 1,
    });
    const summaryOf = (sheet) => ({
      id: sheet.flock.id, kind: sheet.flock.kind, breed: null, status: sheet.flock.status, version: 3, placed_on: sheet.flock.placed_on, placed_count: sheet.flock.placed_count,
      age_days_at_placement: sheet.flock.age0, age_days: 20, days_since_placement: 21, dead_total: 30, culled_total: 2, live: 3968, live_start_today: 3972, mortality_pct: '0.64',
      feed_kg_total: '0.000', feed_days: 0, feed_span_days: 20, last_weight: null, fcr: null, today: null, eggs_today: null, hdep_today: null, rejects_pending: 2,
    });
    const overviewOf = (sheet, canManage = true) => ({
      today: TODAY,
      sites: [
        {
          id: 's-1', name: sheet.flock.site_name, division_id: 'd-1', kind: sheet.flock.kind, can_manage: canManage,
          halls: [
            { id: 'h-6', name: '6', capacity: 6000, version: 1, flock: null },
            { id: sheet.flock.hall_id, name: sheet.flock.hall_name, capacity: 6000, version: 1, flock: summaryOf(sheet) },
            { id: 'h-8', name: '8', capacity: 6000, version: 1, flock: null },
          ],
        },
      ],
    });
    let root = null;
    const fresh = (role, handlers, { userId = 'u-hs', send } = {}) => {
      const calls = [];
      const sent = [];
      globalThis.__hs = {
        session: { status: 'ready', workspace: ws(role, userId), offline: false },
        userId,
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
        async send(op) {
          sent.push(op);
          return send ? send(op) : { kind: 'saved', version: 99 };
        },
      };
      return { calls, sent };
    };
    const named = (calls, name) => calls.filter(([n]) => n === name).map(([, args]) => args);
    const mount = async (url, element) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = m.createRoot(container);
      function Where() {
        const location = m.useLocation();
        globalThis.__hs.location = `${location.pathname}${location.search}`;
        return element ?? m.h(m.Routes, null, m.h(m.Route, { path: '/broiler/*', element: m.h(m.FarmRoutes, { kind: 'broiler' }) }), m.h(m.Route, { path: '/layers/*', element: m.h(m.FarmRoutes, { kind: 'layer' }) }));
      }
      m.flushSync(() => root.render(m.h(m.MemoryRouter, { initialEntries: [url] }, m.h(Where))));
      await settle(90);
    };
    const unmount = async () => {
      if (!root) return;
      m.flushSync(() => root.unmount());
      body().textContent = '';
      await settle();
      root = null;
    };
    const step = async (label, fn) => {
      m.onlineStore.set(true);
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
      m.onlineStore.set(true);
    };
    const sheetSetup = (sheet = BROILER, extra = {}, canManage = true) => ({ loadOverviewJson: () => overviewOf(sheet, canManage), hall_sheet: () => clone(sheet), ...extra });
    const sheetTable = () => tableBy('هلاكات قاعة (7)');
    // التاريخ في صفّ الورقة يوم/شهر (السنة في سطر «وجبة»: مراجعة 0035، عرض 360).
    const rowOn = (on) => bodyRows(sheetTable()).find((tr) => cells(tr)[1]?.startsWith(m.fmtDay(on).slice(0, 5))) ?? null;
    const cellIn = (on, action) => (rowOn(on) ? byAction(action, rowOn(on))[0] ?? null : null);
    const queue = async (userId = 'u-hs') => {
      const db = await m.openOutbox();
      const owner = { userId, orgId: 'org-1', displayName: 'علي' };
      return { pending: await m.pendingOps(db, owner), review: await m.reviewEntries(db, owner) };
    };

    // ── S: الورقة ───────────────────────────────────────────────────────────────────────────────────────────────────
    await step('S1', async () => {
      const { calls } = fresh('manager', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      t.same(named(calls, 'hall_sheet'), [[F7]], 'S1 الورقة بقراءة hall_sheet واحدة لفوج القاعة');
      t.same([textOf('sheet-title'), textOf('sheet-batch')?.startsWith('وجبة 13/11/2026')], ['قاعة 7', true], 'S1 عنوان الصفحة اسم القاعة «قاعة 7» وتحته «وجبة 13/11/2026» («هلاكات قاعة (7)» شريط الجدول، لا عنواناً ثانياً فوقه، 0036)');
      t.same(headers(sheetTable()), ['العمر', 'التاريخ', 'الهلاكات', 'الغاز', 'الكاز (لتر)', 'العلف (كغم)', 'الملاحظات'], 'S1 أعمدة الورقة: العمر | التاريخ | الهلاكات | الغاز | الكاز (لتر) | العلف | الملاحظات');
      const rows = bodyRows(sheetTable());
      t.same([rows.length, cells(rows[0]).slice(0, 2), cells(rows.at(-1)).slice(0, 2)], [46, ['0', '13/11'], ['45', '28/12']], 'S1 صفّ لكلّ يوم من عمر 0 حتى نهاية الوجبة، ولو بلا شيء (التاريخ يوم/شهر، والسنة في سطر «وجبة»)');
      const today = rowOn(TODAY);
      t.same([today?.getAttribute('data-tone'), byAction('sheet-today').length, byAction('sheet-today', today ?? body()).length, cells(today).slice(0, 6)], ['mark', 1, 1, ['20', '03/12اليوم', '4', '', '', '300']], 'S1 صفّ اليوم معلَّم («اليوم» وخلفية الصفّ المختار) بقيمه');
      const box = ancestor(sheetTable(), (n) => (n.getAttribute?.('class') ?? '').includes('overflow-auto'));
      t.ok(box && box.scrollTop > 0, `S1 الجدول مُمرَّر إلى صفّ اليوم عند الفتح (scrollTop ${box?.scrollTop})`);
      t.same(
        [cells(rowOn('2026-11-15')).slice(2, 5), cells(rowOn('2026-11-13')).slice(2, 6), cells(rowOn('2026-11-20')).slice(2, 6), cells(rowOn('2026-11-19')).slice(2, 7), cells(rowOn('2026-11-16'))[6], cells(rowOn('2026-11-16'))[4]],
        [['5', '3', '400'], ['', '4', '', '100منقول'], ['5', '', '', '200'], ['', '', '', '', ''], 'تلقيح نيوكاسل', ''],
        'S1 المستبعد القديم داخل الهلاكات (3 + 2)، والكاز بلتراته (والممسوح فارغ)، واليوم بلا صفّ فارغ لا صفر، وعلف 20/11 الذي خرج يوم 01/12 في يومه، والملاحظة',
      );
      t.same(cells(footRow(sheetTable())), ['المجموع', '32', '17', '400', '1,000', ''], 'S1 صفّ المجموع من الخادم (totals)، والكاز');
      t.ok(!text().includes('المستبعد'), 'S1 لا «المستبعد» في الورقة');
      const back = encodeURIComponent(`/broiler/hall/${H7}`);
      t.same(
        [textOf('sheet-feed'), hrefOf('sheet-sell'), hrefOf('sheet-report'), textOf('sheet-edit'), hrefOf('sheet-close'), byAction('sheet-reopen').length],
        ['أرسل علفاً', `/halls/ticket/new?site=s-1&hall=${H7}&back=${back}`, `/halls/report/${F7}?back=${back}`, 'عدّل الوجبة', `/halls/close/${F7}?back=${back}`, 0],
        'S1 صفّ الأفعال الكبيرة: «أرسل علفاً» و«بيع» (تذكرة الوزن بحقلها وقاعتها) و«التقرير» و«عدّل الوجبة» و«أغلق الوجبة»، بلا قوائم داخل قوائم',
      );
      t.same([hrefOf('hall-prev'), hrefOf('hall-next')], ['/broiler/hall/h-6', '/broiler/hall/h-8'], 'S1 القاعة السابقة والتالية في الحقل');
    });

    await step('S2 المركون', async () => {
      let decided = 0;
      const { calls } = fresh('hall_worker', sheetSetup(BROILER, { decide_flock_reject: () => { decided += 1; return { status: 'saved' }; } }));
      await mount(`/broiler/hall/${H7}`);
      const lines = byAction('sheet-reject').map((n) => descendants(n).find((c) => c.localName === 'span')?.textContent ?? null);
      t.same(
        lines,
        ['يوم 19/11/2026: الهلاكات 7 — كان اليوم أقدم من سبعة أيام قبل أن يُرفع هذا الحدّ.', 'يوم 21/11/2026: الغاز 2 — كان اليوم في فترة حسابات مقفلة.'],
        'S2 كلّ مركون بجملة: يومه، وما حمله، ولماذا',
      );
      await click(byAction('reject-handled')[0]);
      await click(byAction('reject-refused')[1]);
      t.same([named(calls, 'decide_flock_reject'), decided, named(calls, 'hall_sheet').length >= 3], [[[BROILER.rejects[0].id, 'handled', 1], [BROILER.rejects[1].id, 'refused', 2]], 2, true], 'S2 «أُدخلت» handled و«تجاهل» refused بنسخة المركون كما عُرض، ثمّ تُقرأ الورقة من جديد');
    });

    await step('S3 البيّاض', async () => {
      fresh('manager', sheetSetup(LAYER));
      await mount(`/layers/hall/${LAYER.flock.hall_id}`);
      const table = tableBy('هلاكات قاعة (3)');
      t.same([headers(table), cells(footRow(table))], [['العمر', 'التاريخ', 'الهلاكات', 'الغاز', 'الكاز (لتر)', 'العلف (كغم)', 'البيض', 'الملاحظات'], ['المجموع', '4', '3', '0', '100', '11,240', '']], 'S3 البيّاض بعمود البيض ومجموعه، وكاز صفر بلا مفاتيحه');
    });

    // ── E: الخانات ──────────────────────────────────────────────────────────────────────────────────────────────────
    await step('E1 هلاكات اليوم بثلاث لمسات', async () => {
      const { sent, calls } = fresh('hall_worker', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      await tap(cellIn(TODAY, 'cell-dead'));
      const dialog = dialogTitled('الهلاكات — يوم 03/12/2026');
      t.same([Boolean(dialog), textOf('cell-current', dialog ?? body())], [true, 'المسجّل الآن: 4'], 'E1 لمسة الخانة تفتح ورقة الهلاكات بلوحة الأرقام والمسجّل');
      await click(key(dialog, '7'));
      await click(byAction('cell-done', dialogTitled('الهلاكات') ?? body())[0], 120);
      t.same(
        sent.map((op) => [op.fn, op.flockId, op.day, op.payload, op.baseVersion]),
        [['save_flock_day', F7, TODAY, { dead: 7, culled: null }, 1]],
        'E1 ثلاث لمسات (الخانة، 7، «تم»): save_flock_day بهلاكات اليوم ونسخة صفّه (لا مستبعد يُصفَّر)',
      );
      t.same([dialogTitled('الهلاكات') === null, globalThis.__hs.toasts.at(-1)?.title, named(calls, 'hall_sheet').length], [true, 'حُفظ.', 2], 'E1 النافذة تُغلق و«حُفظ.» والورقة تُقرأ من جديد');
    });

    await step('E2 المستبعد القديم يُصفَّر', async () => {
      const { sent } = fresh('hall_worker', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      await tap(cellIn('2026-11-15', 'cell-dead'));
      const dialog = dialogTitled('الهلاكات — يوم 15/11/2026');
      t.ok(textOf('cell-current', dialog ?? body())?.includes('منها 2 مستبعد قديم'), 'E2 الورقة تقول إنّ المستبعد القديم داخل الرقم');
      await click(key(dialog, '4'));
      await click(byAction('cell-done', dialog ?? body())[0], 120);
      t.same(sent.map((op) => [op.payload, op.baseVersion]), [[{ dead: 4, culled: 0 }, 2]], 'E2 هلاكات يومٍ فيه مستبعد قديم: النافق الجديد والمستبعد صفر بنسخة الصفّ');
    });

    await step('E3 يوم قبل 20 يوماً', async () => {
      const { sent } = fresh('hall_worker', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      const old = '2026-11-13';
      const tdOf = (action) => ancestor(cellIn(old, action), (n) => n.localName === 'td');
      t.same(
        ['cell-dead', 'cell-gas', 'cell-note'].map((action) => [cellIn(old, action)?.localName, tdOf(action)?.getAttribute('role'), tdOf(action)?.getAttribute('aria-readonly')]),
        [['span', 'gridcell', null], ['span', 'gridcell', null], ['span', 'gridcell', null]],
        'E3 خانات يومٍ قبل 20 يوماً تُكتب في وضع التعديل (لا حدّ أيام سبعة): خانات شبكة بلا aria-readonly، ولا زرّ فيها',
      );
      await tap(cellIn(old, 'cell-dead'));
      await click(key(dialogTitled('الهلاكات'), '2'));
      await click(byAction('cell-done', dialogTitled('الهلاكات') ?? body())[0], 120);
      t.same(sent.map((op) => [op.day, op.payload.dead, op.baseVersion]), [[old, 2, null]], 'E3 تُحفظ بالخطوات نفسها، بنسخة null (لا صفّ بعد)');
    });

    await step('E4 الغاز بالطابور', async () => {
      const { sent } = fresh('hall_worker', sheetSetup(), { userId: 'u-gas' });
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      m.onlineStore.set(false);
      await settle();
      const day = '2026-11-17';
      await tap(cellIn(day, 'cell-gas'));
      t.ok(textOf('cell-offline', dialogTitled('الغاز') ?? body())?.includes('بلا اتصال'), 'E4 بلا اتصال: الورقة تقول إنّه يُحفظ على الجهاز');
      await click(key(dialogTitled('الغاز'), '3'));
      await click(byAction('cell-done', dialogTitled('الغاز') ?? body())[0], 120);
      t.same([sent.length, cells(rowOn(day))[3]], [0, '3بانتظار الرفع'], 'E4 بلا نت لا إرسال، والخانة بقيمتها و«بانتظار الرفع»');
      await tap(cellIn(day, 'cell-gas'));
      await click(key(dialogTitled('الغاز'), '5'));
      await click(byAction('cell-done', dialogTitled('الغاز') ?? body())[0], 120);
      const { pending } = await queue('u-gas');
      t.same(pending.map((op) => [op.fn, op.day, op.payload, op.baseVersion]), [['set_flock_gas', day, { cylinders: 5 }, null]], 'E4 تعديل ثانٍ قبل الرفع يندمج بالعملية نفسها (فوج + يوم)، بنسخة صفّ الغاز');
      m.onlineStore.set(true);
      await settle(120);
      await click(byAction('hall-reread')[0] ?? null);
      // الرفع يحدث مع الحفظ التالي أو من الجولة؛ هنا من خانة أخرى بنت.
      await tap(cellIn(day, 'cell-gas'));
      await click(key(dialogTitled('الغاز'), '6'));
      await click(byAction('cell-done', dialogTitled('الغاز') ?? body())[0], 120);
      t.same(sent.map((op) => [op.fn, op.payload.cylinders]), [['set_flock_gas', 6]], 'E4 بنت: عملية غاز واحدة بآخر قيمة (set_flock_gas)');
      t.eq((await queue('u-gas')).pending.length, 0, 'E4 الطابور فارغ بعد الرفع');
    });

    await step('E5 الملاحظة', async () => {
      const { sent } = fresh('hall_worker', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      await tap(cellIn('2026-11-16', 'cell-note'));
      const dialog = dialogTitled('الملاحظات');
      const area = dialog ? descendants(dialog).find((n) => n.localName === 'textarea') : null;
      t.eq(area?.value, 'تلقيح نيوكاسل', 'E5 الملاحظة بنصّها');
      type(area, 'تلقيح نيوكاسل ثانٍ');
      await settle();
      await click(byAction('cell-done', dialog ?? body())[0], 120);
      t.same(sent.map((op) => [op.fn, op.day, op.payload, op.baseVersion]), [['save_flock_day', '2026-11-16', { note: 'تلقيح نيوكاسل ثانٍ' }, 1]], 'E5 الملاحظة save_flock_day بنسخة صفّ اليوم');
    });

    await step('E6 يوم قادم والوجبة المغلقة', async () => {
      fresh('manager', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      t.same([cellIn('2026-12-04', 'cell-dead')?.localName, cellIn('2026-12-04', 'cell-gas')?.localName], ['span', 'span'], 'E6 يوم لم يأتِ: الخانة قراءة لا زرّ');
      await unmount();
      const closed = clone(BROILER);
      Object.assign(closed.flock, { status: 'closed', closed_on: '2026-12-02' });
      closed.can_write = false;
      closed.through = '2026-12-02';
      closed.days = closed.days.filter((day) => day.on <= '2026-12-02');
      fresh('manager', { hall_sheet: () => clone(closed) });
      await mount(`/broiler/flock/${F7}`);
      t.same(
        [all().filter((n) => n.localName === 'button' && /^cell-(?:dead|gas|eggs|note)$/u.test(n.getAttribute('data-action') ?? '')).length, textOf('sheet-read-only'), byAction('sheet-feed').length, byAction('sheet-close').length, hrefOf('sheet-reopen')],
        [0, 'الوجبة مغلقة: الورقة للقراءة فقط. «أعِد فتحها» لتعديلها.', 0, 0, `/halls/cycle/${F7}?back=%2Fbroiler%2Fhall%2F${H7}&act=reopen`],
        'E6 الوجبة المغلقة قراءة فقط: لا خانة كتابة تُلمس (خانة العلف تعرض ما أُرسل وحده) ولا «أرسل علفاً» ولا «أغلق»، و«أعِد فتحها» إلى التقرير المفصّل مفتوحاً عليها',
      );
    });

    await step('E7 حدّ الحيّ', async () => {
      const { sent } = fresh('hall_worker', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      await tap(cellIn(TODAY, 'cell-dead'));
      const dialog = dialogTitled('الهلاكات');
      for (const digit of ['9', '9', '9', '9']) await click(key(dialog, digit), 5);
      await click(byAction('cell-done', dialog ?? body())[0], 60);
      t.same([sent.length, Boolean(dialogTitled('الهلاكات')), text().includes('الهلاكات أكثر من الطيور الحيّة (3,972)')], [0, true, true], 'E7 9,999 أكثر من الحيّ (3,968 + 4 اليوم): يُمنع قبل الحفظ بجملته');
    });

    // ── F: العلف ────────────────────────────────────────────────────────────────────────────────────────────────────
    const feedOk = (request) => ({ ...clone(FIX.send_flock_feed), issue: { ...FIX.send_flock_feed.issue, qty: request.qty.toString().replace(/(\d{3})$/u, '.$1'), for_day: request.forDay, item_id: request.itemId } });
    await step('F1 علف اليوم بثلاث لمسات', async () => {
      const { calls } = fresh('hall_worker', sheetSetup(BROILER, { send_flock_feed: (request) => feedOk(request) }));
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      await tap(cellIn(TODAY, 'cell-feed'));
      const dialog = dialogTitled('علف يوم 03/12/2026');
      const sentTable = dialog ? tableBy('ما أُرسل لهذا اليوم') : null;
      t.same([bodyRows(sentTable).map((tr) => cells(tr).slice(0, 4)), byAction('feed-void', dialog ?? body()).length], [[['علف نامي', '300', 'كغم', '03/12/2026']], 1], 'F1 ورقة اليوم بما أُرسل له و«ألغِ»');
      const chips = byAction('feed-item', dialog ?? body());
      t.same(
        chips.map((n) => [n.getAttribute('aria-checked'), n.textContent]),
        [['false', 'علف بادئعندك 1,200 كغم'], ['true', 'علف ناميعندك 850.5 كغم']],
        'F1 أعلاف «رصيد العلف» بعندك، وآخر علف لهذه القاعة مختار مسبقاً',
      );
      const unit = descendants(dialog ?? body()).find((n) => n.getAttribute('role') === 'radio' && n.getAttribute('aria-checked') === 'true' && n.textContent === 'كيس 50 كغم');
      t.ok(Boolean(unit), 'F1 الوحدة الكيس افتراضاً (والكيلو بجانبه)');
      await click(key(dialog, '2'));
      t.same([textOf('feed-base', dialog ?? body()), lines(byAction('feed-send', dialog ?? body())[0])], ['= 100 كغم', ['أرسل 100 كغم', 'من «علف نامي»']], 'F1 الكمية بالكيس وما تساويه بالكيلو، والزرّ يسمّي ما يُرسل بالكيلو وبسطرين (لا «2 كيس»)');
      await click(byAction('feed-send', dialog ?? body())[0], 120);
      const [request] = named(calls, 'send_flock_feed').map(([r]) => r);
      t.same(
        request && [UUID.test(request.clientRef), UUID.test(request.issueId), UUID.test(request.lineId), request.flockId, request.itemId, request.qty, request.forDay],
        [true, true, true, F7, GROWER, 100000n, TODAY],
        'F1 ثلاث لمسات (الخانة، 2، «أرسل»): send_flock_feed بـ100 كغم من آخر علف ليومه بمعرّفات من الجهاز',
      );
      t.same([dialogTitled('علف يوم') === null, globalThis.__hs.toasts.at(-1)?.title?.startsWith('أُرسل 100 كغم من «علف نامي» ليوم 03/12/2026')], [true, true], 'F1 النافذة تُغلق وتنبيه بما أُرسل');
    });

    await step('F2 علف يوم فات', async () => {
      const { calls } = fresh('hall_worker', sheetSetup(BROILER, { send_flock_feed: (request) => feedOk(request) }));
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      t.eq(byAction('sheet-feed')[0]?.textContent, 'أرسل علفاً', 'F2 ضابط');
      await tap(cellIn('2026-11-21', 'cell-feed'));
      const dialog = dialogTitled('علف يوم 21/11/2026');
      await click(descendants(dialog ?? body()).find((n) => n.getAttribute('role') === 'radio' && n.textContent === 'كغم') ?? null);
      for (const digit of ['1', '2', '0']) await click(key(dialog, digit), 5);
      await click(byAction('feed-send', dialog ?? body())[0], 120);
      t.same(named(calls, 'send_flock_feed').map(([r]) => [r.qty, r.forDay]), [[120000n, '2026-11-21']], 'F2 علف يوم فات بالكيلو بيومه (for_day)، ويخرج من المخزن يوم تسجيله في الخادم');
    });

    await step('F3 النتيجة المجهولة', async () => {
      let attempt = 0;
      const { calls } = fresh('hall_worker', sheetSetup(BROILER, {
        send_flock_feed: (request) => {
          attempt += 1;
          if (attempt === 1) throw new m.UnknownOutcomeError();
          return feedOk(request);
        },
      }));
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      await tap(cellIn(TODAY, 'cell-feed'));
      await click(key(dialogTitled('علف يوم'), '1'));
      await click(byAction('feed-send')[0], 120);
      t.same([textOf('feed-pending')?.startsWith('علف يوم 03/12/2026 لم يُعرف مصيره: أعد المحاولة.'), lines(byAction('feed-retry')[0])], [true, ['أعد المحاولة', 'علف يوم 03/12/2026: 50 كغم من «علف نامي»']], 'F3 لا نعرف إن صُرف: الطلب مجمَّد بيومه و«أعد المحاولة»');
      await click(byAction('dialog-close')[0]);
      await click(byAction('dialog-discard')[0] ?? null);
      t.eq(dialogTitled('علف يوم'), null, 'F3 ضابط: الورقة أُغلقت');
      await tap(cellIn(TODAY, 'cell-feed'));
      t.ok(textOf('feed-retry')?.includes('علف يوم 03/12/2026: 50 كغم من «علف نامي»'), 'F3 إعادة فتح الورقة تعود مجمَّدة بالطلب نفسه (محفوظ خارج المكوّن)');
      await click(byAction('feed-retry')[0], 120);
      const [first, second] = named(calls, 'send_flock_feed').map(([r]) => r);
      t.same([second && [second.clientRef, second.issueId, second.lineId, second.qty] , named(calls, 'send_flock_feed').length], [first && [first.clientRef, first.issueId, first.lineId, first.qty], 2], 'F3 الإعادة بالمرجع والمعرّفات نفسها حرفاً، فلا يُصرف مرّتين');
    });

    await step('F4 «ألغِ»', async () => {
      const { calls } = fresh('manager', sheetSetup(BROILER, { void_flock_issue: () => ({ status: 'void', id: 'x', doc_no: 'FI-2026-0303', voided_on: TODAY }) }));
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      await tap(cellIn('2026-11-20', 'cell-feed'));
      await click(byAction('feed-void')[0]);
      t.eq(textOf('feed-void-text'), 'يُلغى صرف 200 كغم من «علف بادئ» ليوم 20/11/2026 (المستند FI-2026-0303)، ويعود العلف إلى «رصيد العلف» بحركة عكسية بتاريخ اليوم.', 'F4 التأكيد يسمّي المادّة والكمية واليوم والمستند ونتيجته');
      t.eq(named(calls, 'void_flock_issue').length, 0, 'F4 لا إلغاء قبل التأكيد');
      await click(byAction('feed-void-go')[0], 120);
      const [args] = named(calls, 'void_flock_issue');
      t.same(args && [args[0], args[1], UUID.test(args[2])], [BROILER.days.find((day) => day.on === '2026-11-20').feed[0].issue_id, 'تصحيح من ورقة القاعة', true], 'F4 void_flock_issue بالصرف وسببه ومرجعه');
    });

    await step('F5 بلا اتصال', async () => {
      const { calls } = fresh('hall_worker', sheetSetup(BROILER, { send_flock_feed: (request) => feedOk(request) }));
      await mount(`/broiler/hall/${H7}`);
      m.onlineStore.set(false);
      await settle();
      await click(byAction('sheet-feed')[0]);
      const dialog = dialogTitled('علف يوم 03/12/2026');
      t.ok(dialog?.textContent.includes('إرسال العلف يحتاج اتصالاً بالإنترنت'), 'F5 بلا اتصال: جملة تقول إنّ الإرسال يحتاج اتصالاً');
      await click(key(dialog, '1'));
      t.same([byAction('feed-send', dialog ?? body())[0]?.getAttribute('disabled') !== null, named(calls, 'send_flock_feed').length], [true, 0], 'F5 «أرسل» مقفول ولا إرسال');
    });

    // ── K: لوحة الحاسوب (كلمة المالك 2026-11-23 بصورتين: «الكيبورد ابد ما يدوس اي ارقام… ولو ااشر عليها واكتب رقم واحد كلها تنمسح») ──────────────
    const kgRadio = (dialog) => descendants(dialog ?? body()).find((n) => n.getAttribute('role') === 'radio' && n.textContent === 'كغم') ?? null;
    await step('K1 أرقام الحاسوب تُكتب في ورقة العلف فور فتحها، وEnter يرسل', async () => {
      const { calls } = fresh('hall_worker', sheetSetup(BROILER, { send_flock_feed: (request) => feedOk(request) }));
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      await tap(cellIn(TODAY, 'cell-feed'));
      const dialog = dialogTitled('علف يوم 03/12/2026');
      await click(kgRadio(dialog));
      for (const digit of ['1', String.fromCodePoint(0x662), '0']) await pressKey(dialog, digit);
      t.eq(padText(dialog), '120', 'K1 الأرقام الغربية والعربية من لوحة الحاسوب تُكتب بلا لمسة على اللوحة');
      await pressKey(dialog, 'Backspace');
      t.eq(padText(dialog), '12', 'K1 Backspace يمسح رقماً');
      await pressKey(dialog, 'Delete');
      t.eq(padText(dialog), '0', 'K1 Delete يمسح الكلّ');
      await pressKey(dialog, '5');
      await pressKey(dialog, '0');
      await pressKey(dialog, 'Enter', 120);
      t.same(named(calls, 'send_flock_feed').map(([r]) => [r.qty, r.forDay]), [[50000n, TODAY]], 'K1 Enter يرسل ما كُتب (50 كغم ليومه)');
    });

    await step('K2 الرقم المحدَّد تستبدله أوّل ضغطة', async () => {
      fresh('hall_worker', sheetSetup(BROILER, { send_flock_feed: (request) => feedOk(request) }));
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      await tap(cellIn(TODAY, 'cell-feed'));
      const dialog = dialogTitled('علف يوم 03/12/2026');
      await click(kgRadio(dialog));
      for (const digit of ['1', '2', '3']) await pressKey(dialog, digit);
      await click(byAction('weight-display', dialog ?? body())[0]);
      t.eq(byAction('weight-display', dialog ?? body())[0]?.getAttribute('data-selected') ?? null, 'true', 'K2 لمسة على الرقم تحدّده');
      await pressKey(dialog, '7');
      t.eq(padText(dialog), '7', 'K2 أوّل رقم من لوحة الحاسوب يستبدل المحدَّد كلّه (لا 1237)');
      await click(byAction('weight-display', dialog ?? body())[0]);
      await click(key(dialog, '9'));
      t.eq(padText(dialog), '9', 'K2 وأوّل لمسة على اللوحة كذلك (لا 79)');
      await pressKey(dialog, '4');
      t.eq(padText(dialog), '94', 'K2 وبعدها تُكمل الكتابة');
    });

    await step('K3 أكثر ممّا عندك: يُقال وهو يُكتب و«أرسل» مقفول', async () => {
      const { calls } = fresh('hall_worker', sheetSetup(BROILER, { send_flock_feed: (request) => feedOk(request) }));
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      await tap(cellIn(TODAY, 'cell-feed'));
      const dialog = dialogTitled('علف يوم 03/12/2026');
      await click(kgRadio(dialog));
      for (const digit of ['2', '0', '0', '0']) await pressKey(dialog, digit);
      t.same(
        [textOf('feed-over', dialog ?? body()), byAction('feed-send', dialog ?? body())[0]?.getAttribute('disabled') !== null],
        ['أكثر ما يُرسل من «علف نامي» مرّة واحدة 850.5 كغم.', true],
        'K3 الجملة تظهر قبل الضغط و«أرسل» مقفول (كان مفتوحاً، صورة المالك)',
      );
      t.same(lines(byAction('feed-send', dialog ?? body())[0]), ['أرسل 2,000 كغم', 'أكثر ممّا عندك: 850.5 كغم'], 'K3 والزرّ المقفول يقول سببه في سطره الثاني (الشريط السفليّ ظاهر دائماً، والجملة تحت اللوحة قد تكون خارج الشاشة)');
      await pressKey(dialog, 'Enter', 60);
      t.eq(named(calls, 'send_flock_feed').length, 0, 'K3 ولا Enter يرسل');
    });

    await step('K4 Enter على زرّ آخر له فعله، والأرقام لا تُكتب تحت نافذة فوقها', async () => {
      const { calls } = fresh('manager', sheetSetup(BROILER, { send_flock_feed: (request) => feedOk(request) }));
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      await tap(cellIn('2026-11-20', 'cell-feed'));
      const dialog = dialogTitled('علف يوم 20/11/2026');
      await click(kgRadio(dialog));
      await pressKey(dialog, '3');
      await pressKey(byAction('feed-item', dialog ?? body())[0] ?? null, 'Enter', 60);
      t.same([named(calls, 'send_flock_feed').length, padText(dialog)], [0, '3'], 'K4 Enter وهو على بطاقة علف لا يرسل');
      await click(byAction('feed-void', dialog ?? body())[0]);
      const confirm = all().filter((n) => n.getAttribute('role') === 'dialog').at(-1) ?? null;
      t.ok(confirm !== null && confirm !== dialog, 'K4 ضابط: نافذة التأكيد فوق الورقة');
      await pressKey(confirm, '9');
      await pressKey(confirm, 'Enter', 60);
      t.same([padText(dialog), named(calls, 'send_flock_feed').length], ['3', 0], 'K4 لا تُكتب الأرقام في ورقة تحت نافذة التأكيد، ولا Enter يرسلها');
    });

    await step('K5 خانة الهلاكات بلوحة الحاسوب وEnter يحفظ', async () => {
      // مستخدم وحده: ورقة الخانة تكتب بالجدول (مراجعة 0036 R13)، و«بلا تغيير» بما تعرضه الخانة، ومخزن الرفع (roundQueueStore) يحمل من E1 أنّ هلاكات
      // اليوم 7 لـ«u-hs» فتعرضها الخانة 7 وكتابة 7 بلا تغيير.
      const { sent } = fresh('hall_worker', sheetSetup(), { userId: 'u-k5' });
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      await tap(cellIn(TODAY, 'cell-dead'));
      const dialog = dialogTitled('الهلاكات — يوم 03/12/2026');
      await pressKey(dialog, '7');
      await pressKey(dialog, 'Enter', 120);
      t.same(sent.map((op) => [op.fn, op.payload]), [['save_flock_day', { dead: 7, culled: null }]], 'K5 7 ثمّ Enter: هلاكات اليوم محفوظة بلا لمسة');
    });

    // ── Q: المركون على الجهاز ────────────────────────────────────────────────────────────────────────────────────────
    await step('Q المركون باقٍ ويُدلّ عليه', async () => {
      fresh('hall_worker', sheetSetup(), { userId: 'u-park', send: async () => ({ kind: 'parked', reason: 'period_locked' }) });
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      await tap(cellIn('2026-11-22', 'cell-gas'));
      await click(key(dialogTitled('الغاز'), '2'));
      await click(byAction('cell-done', dialogTitled('الغاز') ?? body())[0], 120);
      const { pending, review } = await queue('u-park');
      t.same([pending.length, review.map((entry) => [entry.reason, entry.hint, entry.op.fn])], [0, [['parked', 'period_locked', 'set_flock_gas']]], 'Q المركون يبقى على الجهاز في رفّ المراجعة بسببه');
      t.same(
        [globalThis.__hs.toasts.at(-1)?.title, textOf('sheet-review') !== null, hrefOf('sheet-review')],
        ['لم يُحفظ: كان اليوم في فترة حسابات مقفلة.', true, '/broiler/round'],
        'Q التنبيه يقول السبب، والورقة تدلّ على ما بقي على الجهاز في «جولات تحتاج مراجعة»',
      );
    });

    // ── مراجعة 0035 (S2): كلّ حالة تفشل على c69c13f ─────────────────────────────────────────────────────────────────
    const owner = (userId) => ({ userId, orgId: 'org-1', displayName: 'علي' });
    /** رافع الخلفية (RoundQueue) حين يعود الاتصال: يرفع الطابور ولا يعيد قراءة الورقة بنفسه. */
    const background = async (userId) => {
      await m.uploadRounds(owner(userId), async () => ({ currentUserId: async () => userId, send: (op) => globalThis.__hs.send(op), lookup: async () => null }));
      await settle(120);
    };
    /** القراءة الأولى للورقة، وكلّ قراءة بعدها في الطريق لا تصل (شبكة بطيئة): الورقة المعروضة قديمة. */
    const slowRereads = (sheet = BROILER) => {
      let reads = 0;
      return () => (reads++ === 0 ? clone(sheet) : new Promise(() => {}));
    };
    const doneIn = async (title, rounds = 120) => click(byAction('cell-done', dialogTitled(title) ?? body())[0], rounds);

    // ── تكامل 0036: عمليات الجولة الجديدة (set_flock_dead وadd_flock_gas) على الورقة — كلّ حالة تفشل على c67ab76 ─────────────────────────────
    await step('I1 هلاكات الجولة وقنانيها تنتظر في خانتيهما وحدهما', async () => {
      fresh('hall_worker', sheetSetup(), { userId: 'u-i36a' });
      m.onlineStore.set(false);
      const db = await m.openOutbox();
      await m.saveRound(db, owner('u-i36a'), { fn: 'add_flock_gas', flockId: F7, day: TODAY, payload: { add: 2 }, baseVersion: null });
      await m.saveRound(db, owner('u-i36a'), { fn: 'set_flock_dead', flockId: F7, day: '2026-11-19', payload: { dead: 3 }, baseVersion: null });
      await mount(`/broiler/hall/${H7}`);
      t.same(
        [cells(rowOn(TODAY)).slice(2, 4), cells(rowOn('2026-11-19')).slice(2, 4)],
        [['4', '2بانتظار الرفع'], ['3بانتظار الرفع', '']],
        'I1 قنينتان أُرسلتا من الجولة: خانة الغاز «2 بانتظار الرفع» والهلاكات كما هي؛ وهلاكات الجولة في خانتها وحدها (كانت الإضافة تعلّم الهلاكات والغاز فارغ)',
      );
      await unmount();
      fresh('hall_worker', sheetSetup(LAYER), { userId: 'u-i36b' });
      m.onlineStore.set(false);
      await m.saveRound(await m.openOutbox(), owner('u-i36b'), { fn: 'set_flock_dead', flockId: LAYER.flock.id, day: '2026-12-01', payload: { dead: 1 }, baseVersion: null });
      await mount(`/layers/hall/${LAYER.flock.hall_id}`);
      const row = bodyRows(tableBy('هلاكات قاعة (3)')).find((tr) => cells(tr)[1]?.startsWith('01/12')) ?? null;
      t.same([cells(row)[2], cells(row)[5]], ['1بانتظار الرفع', ''], 'I1 البيّاض: هلاكات الجولة لا تعلّم خانة البيض «بانتظار الرفع»');
    });

    await step('I2 قناني الجولة بعد رفعها: الخانة بمجموع الخادم بعد الإضافة', async () => {
      fresh('hall_worker', sheetSetup(), {
        userId: 'u-i36c',
        send: (op) => (op.fn === 'add_flock_gas' ? { kind: 'saved', version: 2, gas: { on: TODAY, cylinders: 3, version: 2 } } : { kind: 'saved', version: 99 }),
      });
      m.onlineStore.set(false);
      await m.saveRound(await m.openOutbox(), owner('u-i36c'), { fn: 'add_flock_gas', flockId: F7, day: TODAY, payload: { add: 2 }, baseVersion: null });
      await mount(`/broiler/hall/${H7}`);
      m.onlineStore.set(true);
      await background('u-i36c');
      t.same(cells(rowOn(TODAY))[3], '3', 'I2 بعد الرفع: «3» كما أرجعه الخادم (قنينة من جهاز آخر + 2 من هذا)، لا فارغة حتى تصل قراءة بعده');
    });

    await step('I3 مركون إضافة الغاز بجملته', async () => {
      const sheet = clone(BROILER);
      sheet.rejects[1].payload = { gas_add: 2 };
      fresh('hall_worker', sheetSetup(sheet));
      await mount(`/broiler/hall/${H7}`);
      const lines = byAction('sheet-reject').map((n) => descendants(n).find((c) => c.localName === 'span')?.textContent ?? null);
      t.eq(lines[1], 'يوم 21/11/2026: إضافة غاز 2 — كان اليوم في فترة حسابات مقفلة.', 'I3 مركون قناني الجولة يقول «إضافة غاز 2» (كان «تعديل»)');
    });

    await step('H1 رفع في الخلفية: ما حُفظ لا يرجع، والتعديل التالي بنسخته', async () => {
      let n = 0;
      const { sent, calls } = fresh('hall_worker', sheetSetup(BROILER, { hall_sheet: slowRereads() }), { userId: 'u-h1', send: async () => ({ kind: 'saved', version: 1 + ++n }) });
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      m.onlineStore.set(false);
      await settle();
      await tap(cellIn(TODAY, 'cell-dead'));
      await click(key(dialogTitled('الهلاكات'), '7'));
      await doneIn('الهلاكات');
      t.same([sent.length, cells(rowOn(TODAY))[2]], [0, '7بانتظار الرفع'], 'H1 ضابط: بلا نت على الجهاز «بانتظار الرفع»');
      m.onlineStore.set(true);
      await background('u-h1');
      t.same(
        [sent.map((op) => [op.payload.dead, op.baseVersion]), cells(rowOn(TODAY))[2], named(calls, 'hall_sheet').length],
        [[[7, 1]], '7', 2],
        'H1 بعد رفع الخلفية: الخانة 7 محفوظةً (لا ترجع إلى 4 ولا «بانتظار الرفع») والقراءة الجديدة لم تصل، والورقة تُقرأ من جديد',
      );
      await tap(cellIn(TODAY, 'cell-dead'));
      t.eq(textOf('cell-current', dialogTitled('الهلاكات') ?? body()), 'المسجّل الآن: 7', 'H1 الورقة تقول المحفوظ (7)');
      await click(key(dialogTitled('الهلاكات'), '9'));
      await doneIn('الهلاكات');
      t.same(sent.map((op) => [op.payload.dead, op.baseVersion]), [[7, 1], [9, 2]], 'H1 التعديل التالي بنسخة ما حُفظ (2) لا بنسخة القراءة القديمة (1) فيُرَدّ stale_day');
    });

    await step('H2 ملاحظة والقراءة بعد الحفظ في الطريق', async () => {
      let n = 0;
      const { sent } = fresh('hall_worker', sheetSetup(BROILER, { hall_sheet: slowRereads() }), { userId: 'u-h2', send: async () => ({ kind: 'saved', version: 1 + ++n }) });
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      await tap(cellIn(TODAY, 'cell-dead'));
      await click(key(dialogTitled('الهلاكات'), '7'));
      await doneIn('الهلاكات');
      await tap(cellIn(TODAY, 'cell-note'));
      const dialog = dialogTitled('الملاحظات');
      type(dialog ? descendants(dialog).find((n2) => n2.localName === 'textarea') : null, 'تهوية');
      await settle();
      await doneIn('الملاحظات');
      t.same(sent.map((op) => [Object.keys(op.payload).sort().join(','), op.baseVersion]), [['culled,dead', 1], ['note', 2]], 'H2 الملاحظة بعد حفظ الهلاكات والقراءة في الطريق بنسخة ما حُفظ (2)، فلا stale_day');
    });

    await step('H3 غاز بلا نت ثمّ تعديله', async () => {
      const versions = { set_flock_gas: 0, save_flock_day: 1 };
      const { sent } = fresh('hall_worker', sheetSetup(BROILER, { hall_sheet: slowRereads() }), { userId: 'u-h3', send: async (op) => ({ kind: 'saved', version: ++versions[op.fn] }) });
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      const day = '2026-11-17';
      m.onlineStore.set(false);
      await settle();
      await tap(cellIn(day, 'cell-gas'));
      await click(key(dialogTitled('الغاز'), '3'));
      await doneIn('الغاز');
      m.onlineStore.set(true);
      await background('u-h3');
      t.eq(cells(rowOn(day))[3], '3', 'H3 الغاز المحفوظ يبقى ظاهراً بعد رفع الخلفية (لا يرجع فارغاً)');
      await tap(cellIn(day, 'cell-gas'));
      await click(key(dialogTitled('الغاز'), '5'));
      await doneIn('الغاز');
      t.same(sent.map((op) => [op.payload.cylinders, op.baseVersion]), [[3, null], [5, 1]], 'H3 تعديل الغاز بعد رفعه بنسخة صفّه المحفوظ (1) لا null فيُرَدّ stale_gas');
    });

    await step('D1 المركون يُعدّ مرّة ويُقرَّر فيه مرّة', async () => {
      const decided = [];
      fresh('hall_worker', sheetSetup(BROILER, { decide_flock_reject: (id, decision, version) => (decided.push([id, decision, version]), clone(FIX.decide_flock_reject.saved)) }), { userId: 'u-d1', send: async () => ({ kind: 'parked', reason: 'period_locked' }) });
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      // هذا الجهاز ركن غاز 21/11 (قنينتان، فترة مقفلة)، والخادم يعرض المركون نفسه.
      await tap(cellIn('2026-11-21', 'cell-gas'));
      await click(key(dialogTitled('الغاز'), '2'));
      await doneIn('الغاز');
      t.same(
        [(await queue('u-d1')).review.length, textOf('sheet-attention'), byAction('sheet-review').length, byAction('sheet-reject').length],
        [1, 'لم يُحفظ من الأجهزة: 2، وتفصيله تحت الجدول.', 0, 2],
        'D1 المركون على الجهاز والخادم واحد: يُعدّ مرّة (2 لا 3)، ولا تنبيه «على هذا الجهاز» له',
      );
      await click(byAction('reject-handled')[1], 120);
      t.same([decided, (await queue('u-d1')).review.length], [[[BROILER.rejects[1].id, 'handled', 2]], 0], 'D1 «أُدخلت» بنسخته يحذف نسخة هذا الجهاز من رفّ المراجعة معه');
    });

    await step('D2 المركون على وجبة مغلقة', async () => {
      const closed = clone(BROILER);
      Object.assign(closed.flock, { status: 'closed', closed_on: '2026-12-02' });
      closed.can_write = false;
      closed.through = '2026-12-02';
      closed.days = closed.days.filter((day) => day.on <= '2026-12-02');
      fresh('manager', { hall_sheet: () => clone(closed) });
      await mount(`/broiler/flock/${F7}`);
      t.same(
        [byAction('reject-handled').length, byAction('reject-refused').length, textOf('sheet-rejects-hint')],
        [0, 2, 'الوجبة مغلقة: أعِد فتحها لإدخاله، أو اضغط «تجاهل».'],
        'D2 الوجبة المغلقة: لا «أُدخلت» إلى جدول للقراءة، بل «تجاهل» وجملة «أعِد فتحها لإدخاله»',
      );
    });

    await step('D3 مركون تغيّر بعد عرضه', async () => {
      const decided = [];
      fresh('hall_worker', sheetSetup(BROILER, { decide_flock_reject: (id, decision, version) => (decided.push([id, version]), clone(FIX.decide_flock_reject.stale)) }));
      await mount(`/broiler/hall/${H7}`);
      await click(byAction('reject-refused')[1], 120);
      const line = byAction('sheet-reject')[1];
      t.same(
        [decided, line ? descendants(line).find((n2) => n2.localName === 'span')?.textContent : null, globalThis.__hs.toasts.at(-1)?.title],
        [[[BROILER.rejects[1].id, 2]], 'يوم 21/11/2026: الغاز 3 — كان اليوم في فترة حسابات مقفلة.', 'تغيّر هذا المركون منذ عُرض، فلم يُقرَّر فيه شيء: راجع محتواه الجديد ثمّ قرّر.'],
        'D3 stale_reject: لم يُقرَّر شيء، والمركون بمحتواه الجديد (الغاز 3) أمام صاحبه',
      );
      await click(byAction('reject-refused')[1], 120);
      t.same(decided.at(-1), [BROILER.rejects[1].id, 3], 'D3 القرار التالي بنسخة ما عُرض الآن (3)');
    });

    await step('E8 امسح الغاز', async () => {
      const { sent } = fresh('hall_worker', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      await tap(cellIn('2026-11-13', 'cell-gas'));
      const dialog = dialogTitled('الغاز');
      t.same([textOf('cell-current', dialog ?? body()), textOf('cell-clear', dialog ?? body()), byAction('cell-done', dialog ?? body())[0]?.getAttribute('disabled') !== null], ['المسجّل الآن: 4', 'امسح الغاز', true], 'E8 الغاز المسجّل يُمسح بزرّ «امسح الغاز» («تم» حين يُكتب رقم)');
      await click(byAction('cell-clear', dialog ?? body())[0], 120);
      t.same([sent.map((op) => [op.fn, op.day, op.payload, op.baseVersion]), cells(rowOn('2026-11-13'))[3]], [[['set_flock_gas', '2026-11-13', { cylinders: null }, 1]], ''], 'E8 المسح set_flock_gas بقناني null ونسخة الصفّ، والخانة فارغة');
    });

    // ── K: الكاز (0037): باللتر أو بالبرميل، والمسح ─────────────────────────────────────────────────────────────────────
    await step('K1 الكاز بالبرميل', async () => {
      const { sent } = fresh('hall_worker', sheetSetup(), { userId: 'u-kero' });
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      const day = '2026-11-17';
      await tap(cellIn(day, 'cell-kerosene'));
      const dialog = dialogTitled('الكاز (لتر)');
      const units = dialog ? descendants(dialog).filter((n) => n.getAttribute('role') === 'radio').map((n) => [n.textContent, n.getAttribute('aria-checked')]) : [];
      t.same([dialog !== null, units, textOf('cell-current', dialog ?? body())], [true, [['لتر', 'true'], ['برميل', 'false']], 'لم يُسجَّل شيء لهذا اليوم بعد.'], 'K1 لمسة خانة الكاز: ورقته بـ«لتر | برميل» واللتر أوّلاً');
      await click(descendants(dialog ?? body()).find((n) => n.getAttribute('role') === 'radio' && n.textContent === 'برميل') ?? null);
      const hint = textOf('cell-barrels', dialog ?? body());
      await click(key(dialog, '2'));
      t.same([hint, textOf('cell-barrels', dialog ?? body())], ['البرميل 200 لتر.', 'برميلان = 400 لتر'], 'K1 بالبرميل: البرميل 200 لتر، وما يُكتب يُقال لتراً قبل الحفظ (برميلان = 400 لتر)');
      await click(byAction('cell-done', dialog ?? body())[0], 120);
      t.same([sent.map((op) => [op.fn, op.day, op.payload, op.baseVersion]), cells(rowOn(day))[4]], [[['set_flock_kerosene', day, { liters: 400 }, null]], '400'], 'K1 «تم»: set_flock_kerosene بـ400 لتر (برميلان) بلا نسخة (لا صفّ بعد)، والخانة 400');
    });

    await step('K2 امسح الكاز', async () => {
      const { sent } = fresh('hall_worker', sheetSetup(), { userId: 'u-kero2' });
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      await tap(cellIn('2026-11-15', 'cell-kerosene'));
      const dialog = dialogTitled('الكاز (لتر)');
      t.same([textOf('cell-current', dialog ?? body()), textOf('cell-clear', dialog ?? body())], ['المسجّل الآن: 400 لتر', 'امسح الكاز'], 'K2 الكاز المسجّل بلتراته، ويُمسح بـ«امسح الكاز»');
      await click(byAction('cell-clear', dialog ?? body())[0], 120);
      t.same([sent.map((op) => [op.fn, op.day, op.payload, op.baseVersion]), cells(rowOn('2026-11-15'))[4]], [[['set_flock_kerosene', '2026-11-15', { liters: null }, 1]], ''], 'K2 المسح set_flock_kerosene بلترات null ونسخة الصفّ (1)، والخانة فارغة');
      await tap(cellIn('2026-11-16', 'cell-kerosene'));
      const cleared = dialogTitled('الكاز (لتر)');
      await click(key(cleared, '5'));
      await click(byAction('cell-done', cleared ?? body())[0], 120);
      t.same(sent.at(-1) ? [sent.at(-1).fn, sent.at(-1).payload, sent.at(-1).baseVersion] : null, ['set_flock_kerosene', { liters: 5 }, 2], 'K2 يومٌ مُسح كازه من قبل: الكتابة بنسخة صفّه الممسوح (2) لا بلا نسخة');
    });

    // ── K3: قاعة مقسومة (0038) باللمس: خانة «هلاكات ق2» تفتح ورقتها، والحفظ بأقسام اليوم ومجموعها ─────────────────────────────────
    await step('K3 الأقسام باللمس', async () => {
      const { sent } = fresh('hall_worker', sheetSetup(SPLIT), { userId: 'u-split' });
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      const row = rowOn(TODAY);
      const cellsOf = row ? byAction('cell-dead-part', row) : [];
      await tap(cellsOf[1] ?? null);
      const dialog = dialogTitled('هلاكات ق2');
      t.same([cellsOf.length, dialog !== null, textOf('cell-current', dialog ?? body())], [2, true, 'المسجّل الآن: 2'], 'K3 لمسة «هلاكات ق2» تفتح ورقتها بقيمتها');
      await click(key(dialog, '6'));
      await click(byAction('cell-done', dialog ?? body())[0], 120);
      t.same(sent.map((op) => [op.fn, op.day, op.payload, op.baseVersion]), [['save_flock_day', TODAY, { dead: 8, dead_parts: [2, 6], culled: null }, SPLIT.days.find((day) => day.on === TODAY).day_version]], 'K3 «تم»: save_flock_day بمجموع اليوم 8 وأقسامه [2، 6] بنسخة صفّه');
    });

    await step('F6 الطلب المجمَّد يسمّي يومه', async () => {
      fresh('hall_worker', sheetSetup(BROILER, { send_flock_feed: () => { throw new m.UnknownOutcomeError(); } }), { userId: 'u-f6' });
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      await tap(cellIn(TODAY, 'cell-feed'));
      await click(key(dialogTitled('علف يوم'), '1'));
      await click(byAction('feed-send')[0], 120);
      await click(byAction('dialog-close')[0]);
      await click(byAction('dialog-discard')[0] ?? null);
      await tap(cellIn('2026-11-21', 'cell-feed'));
      const dialog = dialogTitled('علف يوم 21/11/2026');
      t.same(
        [Boolean(dialog), textOf('feed-pending', dialog ?? body())?.startsWith('علف يوم 03/12/2026 لم يُعرف مصيره'), lines(byAction('feed-retry', dialog ?? body())[0])?.[1], byAction('feed-send', dialog ?? body()).length],
        [true, true, 'علف يوم 03/12/2026: 50 كغم من «علف نامي»', 0],
        'F6 ورقة يوم آخر: الطلب المجمَّد بيومه هو (03/12) لا كأنّه ليوم الورقة، والإرسال مقفول حتى يُعرف مصيره',
      );
    });

    await step('F7 زرّ الإرسال بفواصل الآلاف وبسطرين', async () => {
      fresh('hall_worker', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      await tap(cellIn(TODAY, 'cell-feed'));
      const dialog = dialogTitled('علف يوم 03/12/2026');
      // «علف بادئ» (عندك 1,200 كغم): 1,000 كغم في حدود ما عنده (2,500 من «علف نامي» صارت أكثر ممّا عنده، فالزرّ مقفول بسببه، K3).
      await click(byAction('feed-item', dialog ?? body()).find((n2) => n2.textContent.startsWith('علف بادئ')) ?? null);
      await click(byAction('feed-unit', dialog ?? body()).find((n2) => n2.textContent === 'كغم') ?? null);
      for (const digit of ['1', '0', '0', '0']) await click(key(dialog, digit), 5);
      t.same(lines(byAction('feed-send', dialog ?? body())[0]), ['أرسل 1,000 كغم', 'من «علف بادئ»'], 'F7 «أرسل 1,000 كغم» بفاصلة الآلاف، والعلف في سطر ثانٍ');
    });

    await step('F8 المنقول والمرتجع', async () => {
      fresh('manager', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      t.same(byAction('cell-carry', rowOn('2026-11-13') ?? body()).map((n2) => n2.textContent), ['منقول'], 'F8 علف يوم التسكين معلَّم «منقول»');
      await tap(cellIn('2026-11-13', 'cell-feed'));
      t.eq(textOf('feed-carry'), 'منقول من الوجبة السابقة: 50 كغم، داخل علف هذا اليوم (ليس صرفاً من المخزن).', 'F8 ورقة العلف تقول المنقول من الوجبة السابقة');
    });

    await step('L1 الورقة بعرض الهاتف', async () => {
      fresh('manager', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      const table = sheetTable();
      const noteCell = ancestor(cellIn(TODAY, 'cell-note'), (n2) => n2.localName === 'td');
      const feedHead = descendants(section(table, 'thead') ?? body()).find((n2) => n2.localName === 'th' && n2.textContent === 'العلف (كغم)');
      t.same(
        [cells(rowOn(TODAY))[1], /min-w-48|whitespace-nowrap/u.test(classOf(noteCell)), /whitespace-nowrap/u.test(classOf(feedHead)), /px-3/u.test(classOf(noteCell))],
        ['03/12اليوم', false, false, false],
        'L1 التاريخ يوم/شهر، والملاحظات تلتفّ بلا عرض أدنى، ورأس العلف يلتفّ، والحشوة أضيق (العقد: ستّة أعمدة بعرض 360 بلا تمرير أفقيّ)',
      );
    });

    await step('T1 أهداف اللمس 44 نقطة', async () => {
      fresh('manager', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      await pencil();
      const rejectButtons = [...byAction('reject-handled'), ...byAction('reject-refused')];
      await tap(cellIn(TODAY, 'cell-feed'));
      const dialog = dialogTitled('علف يوم 03/12/2026');
      const units = descendants(dialog ?? body()).filter((n2) => n2.getAttribute('role') === 'radio' && (n2.textContent === 'كغم' || n2.textContent === 'كيس 50 كغم'));
      t.same(
        [rejectButtons.length, rejectButtons.every((n2) => /\bh-11\b/u.test(classOf(n2))), /\bh-11\b/u.test(classOf(byAction('feed-void', dialog ?? body())[0])), units.length, units.every((n2) => /\bmin-h-11\b/u.test(classOf(n2)))],
        [4, true, true, 2, true],
        'T1 «أُدخلت» و«تجاهل» و«ألغِ» ووحدة العلف بارتفاع 44 نقطة على الأقل',
      );
    });

    await step('R2 عنوان التقرير بقاعة اسمها «قاعة 7» (عيّنة القاعدة)', async () => {
      fresh('viewer', { hall_sheet: () => clone(REAL.hall_sheet_broiler) });
      await mount(`/halls/report/${REAL.hall_sheet_broiler.flock.id}`, m.h(m.Routes, null, m.h(m.Route, { path: '/halls/report/:flockId', element: m.h(m.ReportPage) })));
      t.eq(textOf('batch-title'), 'تقرير وجبة قاعة 7 — حقل الورقة', 'R2 لا «قاعة قاعة 7» (العنوان نفسه للصورة والطباعة)');
    });

    await step('R3 خلاصة بالمرتجع والمنقول وصافي العلف', async () => {
      const closed = clone(BROILER);
      Object.assign(closed.flock, { status: 'closed', closed_on: '2026-12-02' });
      closed.can_write = false;
      closed.through = '2026-12-02';
      closed.days = closed.days.filter((day) => day.on <= '2026-12-02');
      closed.days.at(-1).feed_back_kg = '100.000';
      closed.totals.feed_back_kg = '100.000';
      Object.assign(closed.summary, { feed_back_kg: '100.000', feed_net_kg: '900.000', fcr: '0.383' });
      fresh('viewer', { hall_sheet: () => clone(closed) });
      await mount(`/halls/report/${F7}`, m.h(m.Routes, null, m.h(m.Route, { path: '/halls/report/:flockId', element: m.h(m.ReportPage) })));
      const rows = bodyRows(tableBy('خلاصة الوجبة')).map(cells);
      t.same(
        rows.filter((row) => row[0].startsWith('العلف') || row[0].startsWith('المرتجع') || row[0].startsWith('صافي العلف') || row[0].startsWith('معامل')),
        [['العلف المرسل (كغم)', '1,000'], ['العلف المرسل (أكياس)', '20'], ['المرتجع والمنقول (كغم)', '100'], ['صافي العلف (كغم)', '900'], ['معامل التحويل (صافي العلف ÷ صافي المباع)', '0.383']],
        'R3 المرسل كغم وأكياساً، والمرتجع والمنقول (حين فوق الصفر)، وصافي العلف، ومعامل التحويل على الصافي',
      );
      t.throws(() => m.parseHallSheet({ ...clone(BROILER), rejects: [{ ...clone(BROILER.rejects[0]), version: '1' }] }), 'R3 نسخة المركون نصّاً تُرفض (المفتاح الجديد بشكله)');
      t.throws(() => m.parseHallSheet((() => { const j = clone(BROILER); j.days[3].carry_in_kg = '10.000'; return j; })()), 'R3 منقول في غير يوم التسكين يُرفض');
    });

    // ── Q: القاعة المقسومة (0038): المحلّل وتقرير الوجبة ───────────────────────────────────────────────────────────────────
    await step('Q الأقسام', async () => {
      const split = m.parseHallSheet(clone(SPLIT));
      t.same(
        [split.sections?.map((x) => [x.no, x.placed, x.dead, x.mortalityPct, x.remaining]), split.totals.deadParts, split.days[20].deadParts, split.days.find((day) => day.dayVersion === null)?.deadParts],
        [[[1, 2500, 18, 72n, 2482], [2, 2500, 14, 56n, 2486]], [18, 14], [2, 2], null],
        'Q المحلّل: الأقسام بأعدادها وهلاكاتها ونسبها وباقيها، ومجاميعها، وأقسام كلّ يوم (ويوم بلا جولة null)',
      );
      const bad = (mutate) => {
        const json = clone(SPLIT);
        mutate(json);
        try {
          m.parseHallSheet(json);
          return 'parsed';
        } catch (error) {
          return error instanceof m.HallSheetShapeError ? error.field : `other:${error?.message}`;
        }
      };
      t.same(
        [
          bad((j) => { j.days[20].dead_parts = [3, 2]; }),
          bad((j) => { j.days[20].dead_parts = [4]; }),
          bad((j) => { j.days[20].dead_parts = [2, 1, 1]; }),
          bad((j) => { j.sections[0].remaining = 1; }),
          bad((j) => { j.sections[1].dead = 15; }),
          bad((j) => { j.sections = null; }),
        ],
        ['dead_parts', 'dead_parts', 'dead_parts', 'sections', 'sections', 'dead_parts'],
        'Q الصرامة: أقسام يوم لا تساوي هلاكاته، أو بغير عدد الأقسام، وقسم باقيه غير عدده ناقص هلاكاته، أو هلاكاته غير مجموع أيّامه، وأقسام أيّام بلا أقسام الوجبة: يُرفض',
      );
      fresh('viewer', { hall_sheet: () => clone(SPLIT) });
      await mount(`/halls/report/${F7}`, m.h(m.Routes, null, m.h(m.Route, { path: '/halls/report/:flockId', element: m.h(m.ReportPage) })));
      const sections = tableBy('الأقسام');
      t.same(
        [headers(sections), bodyRows(sections).map(cells)],
        [['القسم', 'الداخل', 'الهلاكات', 'نسبة الهلاكات', 'الباقي بعد الهلاكات'], [['ق1', '2,500', '18', '0.72%', '2,482'], ['ق2', '2,500', '14', '0.56%', '2,486']]],
        'Q تقرير الوجبة: جدول «الأقسام» بعدد كلّ قسم وهلاكاته ونسبتها والباقي فيه بعد الهلاكات',
      );
      const days = tableBy('أيام الوجبة');
      t.same(
        [headers(days).slice(0, 5), cells(footRow(days)).slice(0, 4), bodyRows(days).map(cells).at(-1)?.slice(2, 4)],
        [['العمر', 'التاريخ', 'هلاكات ق1', 'هلاكات ق2', 'الغاز'], ['المجموع', '18', '14', '17'], ['2', '2']],
        'Q تقرير الوجبة: عمود هلاكات لكلّ قسم بمجموعه في آخره بدل «الهلاكات»',
      );
    });

    // ── I0038 بالشاشات: ورقة القاعة وتقرير الوجبة بعيّنة القاعدة الحقيقية (لا المكتوبة باليد) ─────────────────────────────────────────
    await step('I0038 الورقة والتقرير بالعيّنة الحقيقية', async () => {
      const raw = HSEC.hall_sheet;
      fresh('hall_worker', { loadOverviewJson: () => clone(HSEC.flocks_overview), hall_sheet: () => clone(raw) });
      await mount(`/broiler/hall/${raw.flock.hall_id}`);
      const sheet = tableBy('هلاكات قاعة (1)');
      const dayCells = (on) => cells(bodyRows(sheet).find((tr) => cells(tr)[1]?.startsWith(m.fmtDay(on).slice(0, 5))) ?? null).slice(2, 4);
      t.same(
        [headers(sheet).slice(2, 4), dayCells('2026-11-22'), dayCells('2026-11-24'), dayCells('2026-11-25'), dayCells('2026-11-26')],
        [['هلاكات ق1', 'هلاكات ق2'], ['3', '2'], ['1', '3'], ['0', '0'], ['2', '0']],
        'I0038 ورقة القاعة بالعيّنة الحقيقية: عمود لكلّ قسم، وهلاكات كلّ قسم في يومها',
      );
      await unmount();
      fresh('viewer', { hall_sheet: () => clone(raw) });
      await mount(`/halls/report/${raw.flock.id}`, m.h(m.Routes, null, m.h(m.Route, { path: '/halls/report/:flockId', element: m.h(m.ReportPage) })));
      const sections = tableBy('الأقسام');
      const days = tableBy('أيام الوجبة');
      t.same(
        [bodyRows(sections).map(cells), cells(footRow(days)).slice(0, 3)],
        [[['ق1', '13,526', '6', '0.04%', '13,520'], ['ق2', '13,525', '5', '0.04%', '13,520']], ['المجموع', '6', '5']],
        'I0038 تقرير الوجبة بالعيّنة الحقيقية: جدول «الأقسام» ومجموع كلّ قسم في آخر جدول الأيّام',
      );
    });

    // ── R: تقرير الوجبة ─────────────────────────────────────────────────────────────────────────────────────────────
    await step('R تقرير الوجبة', async () => {
      fresh('viewer', { hall_sheet: () => clone(BROILER) });
      await mount(`/halls/report/${F7}`, m.h(m.Routes, null, m.h(m.Route, { path: '/halls/report/:flockId', element: m.h(m.ReportPage) })));
      t.eq(textOf('batch-title'), 'تقرير وجبة قاعة 7 — حقل الشمال', 'R العنوان');
      const summary = bodyRows(tableBy('خلاصة الوجبة')).map(cells);
      t.same(
        summary,
        [
          ['الداخل', '5,000'], ['الهلاكات', '32'], ['نسبة الهلاكات', '0.64%'], ['الباقي', '3,968'], ['العلف المرسل (كغم)', '1,000'], ['العلف المرسل (أكياس)', '20'], ['صافي العلف (كغم)', '1,000'],
          ['الغاز (قناني)', '17'], ['الكاز (لتر)', '400'], ['المباع (طير)', '1,000'], ['صافي وزن المباع (كغم)', '2,350.5'], ['معدّل وزن الطير (كغم)', '2.351'], ['معامل التحويل (صافي العلف ÷ صافي المباع)', '0.425'],
        ],
        'R الخلاصة من الخادم: الداخل والهلاكات ونسبتها والباقي والعلف المرسل كغم وأكياساً وصافي العلف (بلا مرتجع: لا سطر له) والغاز والمباع وصافيه ومعدّله ومعامل التحويل على الصافي',
      );
      // حساب الخلاصة من أيام العيّنة: تتّسق بتعريفاتها (النسبة = الهلاكات ÷ الداخل، والمعدّل = الصافي ÷ المباع، والمعامل = العلف ÷ الصافي، والأكياس = العلف ÷ 50).
      const s = BROILER.summary;
      const milli = (text) => BigInt(text.replace('.', ''));
      const half = (num, den) => (num % den) * 2n >= den ? num / den + 1n : num / den;
      const days = BROILER.days;
      const feed = days.reduce((sum, day) => sum + (day.feed_kg ? milli(day.feed_kg) : 0n), 0n);
      const net = days.reduce((sum, day) => sum + (day.sold_net_kg ? milli(day.sold_net_kg) : 0n), 0n);
      const dead = days.reduce((sum, day) => sum + day.dead, 0);
      const sold = days.reduce((sum, day) => sum + day.sold_birds, 0);
      t.same(
        [dead, s.placed - dead - sold, half(BigInt(dead) * 10000n, BigInt(s.placed)), feed, half(feed * 1000n, 50000n), half(net, BigInt(sold)), half(feed * 1000n, net)],
        [s.dead, s.live, milli(s.mortality_pct), milli(s.feed_kg), milli(s.feed_bags), milli(s.avg_weight_kg), milli(s.fcr)],
        'R حساب الخلاصة من أيام العيّنة يساوي خلاصة الخادم (بالتقريب الواحد)',
      );
      const table = tableBy('أيام الوجبة');
      const rows = bodyRows(table).map(cells);
      t.same(
        [headers(table), rows.length, rows.at(-1)?.slice(0, 6), rows.find((row) => row[1] === '20/11/2026')?.slice(2, 6), rows.find((row) => row[1] === '15/11/2026')?.[4]],
        [
          ['العمر', 'التاريخ', 'الهلاكات', 'الغاز', 'الكاز (لتر)', 'العلف (كغم)', 'المباع (طير)', 'صافي المباع (كغم)', 'الملاحظات'],
          21,
          ['20', '03/12/2026', '4', '', '', '300'],
          ['5', '', '', '200'],
          '400',
        ],
        'R جدول الورقة حتى اليوم بلا عمودَي مجموع تراكميّ (رسالة الزبون 2026-11-26؛ علف 20/11 في يومه)، والمباع وصافيه، بلا وزن يوميّ ولا علف مأكول',
      );
      t.same(cells(footRow(table)), ['المجموع', '32', '17', '400', '1,000', '1,000', '2,350.5', ''], 'R المجموع في آخر خلية من كلّ عمود (صفّ مجموع الخادم)، ولا مجموع إلّا فيه، والكاز بعموده');
      t.same(
        [textOf('batch-image'), textOf('batch-print'), hrefOf('batch-detailed'), text().includes('الوزن'), text().includes('المأكول')],
        ['أرسل صورة', 'اطبع / PDF', `/halls/cycle/${F7}?back=%2Fhalls%2Freport%2F${F7}`, false, false],
        'R «أرسل صورة» و«اطبع / PDF»، والتقرير المفصّل رابطٌ؛ ولا وزن ولا مأكول',
      );
      t.same(
        ['batch-image', 'batch-print'].map((action) => [byAction(action).length, /\bh-11\b/u.test(classOf(byAction(action)[0])), /\bh-9\b/u.test(classOf(byAction(action)[0]))]),
        [[1, true, false], [1, true, false]],
        'T1 «أرسل صورة» و«اطبع / PDF» في تقرير الوجبة بارتفاع 44 نقطة على الأقل (h-11، لا h-9)',
      );
    });

    // ── O: الشكل الرسميّ (عقد 0036 S1، «مثل تقارير المستشفيات») ──────────────────────────────────────────────────────
    // ساعة الجهاز ثابتة («طُبع في» من new Date)، وتتقدّم قبل الطباعة فيتجدّد الوقت المكتوب.
    const RealDate = Date;
    let clock = new RealDate(2026, 11, 3, 9, 5).getTime();
    class FixedDate extends RealDate {
      constructor(...args) {
        if (args.length) super(...args);
        else super(clock);
      }
      static now() {
        return clock;
      }
    }
    const ofcOf = (cls, root = body()) => descendants(root).filter((n2) => classOf(n2).split(' ').includes(cls));
    const infoOf = () => (byAction('report-info')[0]?.children ?? []).map((cell) => cell.children.map((n2) => n2.textContent));
    await step('O1 تقرير الوجبة ورقةٌ رسمية', async () => {
      globalThis.Date = FixedDate;
      try {
        fresh('viewer', { hall_sheet: () => clone(BROILER) });
        await mount(`/halls/report/${F7}`, m.h(m.Routes, null, m.h(m.Route, { path: '/halls/report/:flockId', element: m.h(m.ReportPage) })));
        const paper = byAction('batch-paper')[0] ?? null;
        t.same(
          [textOf('rep-org'), classOf(byAction('rep-org')[0]).split(' ').includes('hidden'), textOf('batch-title'), infoOf()],
          [
            'مزرعة',
            false,
            'تقرير وجبة قاعة 7 — حقل الشمال',
            [
              ['القاعة', '7'], ['الحقل', 'حقل الشمال'], ['تاريخ الوجبة', '13/11/2026'], ['الداخل', '5,000'], ['العمر (يوم)', '20'], ['الحالة', 'قائمة'],
              ['تاريخ التقرير', '03/12/2026'], ['طُبع في', '03/12/2026 الساعة 09:05'],
            ],
          ],
          'O1 الرأس: اسم المنشأة ظاهرٌ على الشاشة (كان للطباعة وحدها)، والعنوان، وشبكة البيانات (القاعة والحقل وتاريخ الوجبة والداخل والعمر والحالة وتاريخ التقرير ووقت الطباعة)',
        );
        t.same(
          [
            ofcOf('ofc-band').map((n2) => n2.textContent),
            ['batch-summary', 'batch-days'].map((name) => descendants(byAction(name)[0] ?? body()).filter((n2) => n2.localName === 'h2').length),
            [textOf('report-by'), textOf('report-printed')],
            descendants(byAction('report-sign')[0] ?? body()).filter((n2) => n2.localName === 'p').map((n2) => n2.textContent),
            paper ? ['report-head', 'batch-summary', 'batch-days', 'report-foot'].map((name) => byAction(name).filter((n2) => paper.contains(n2)).length) : null,
            paper ? ['batch-image', 'batch-print', 'batch-detailed', 'back'].map((name) => byAction(name).filter((n2) => paper.contains(n2)).length) : null,
            m.wideStore.get(),
            all().filter((n2) => n2.localName === 'style').some((n2) => n2.textContent.includes('@page { size: A4 portrait; margin: 10mm; }')),
          ],
          [
            ['خلاصة الوجبة', 'أيام الوجبة'],
            [0, 0],
            ['أعدّه: علي', 'طُبع في 03/12/2026 الساعة 09:05'],
            ['المسؤول: ………………………', 'التوقيع: ………………………'],
            [1, 1, 1, 1],
            [0, 0, 0, 0],
            1,
            true,
          ],
          'O1 الجدولان رسميّان بشريط اسميهما (بلا عنوان مكرّر فوقهما)، والتذييل «أعدّه» و«طُبع في» وسطرا التوقيع، والورقة تحمل التقرير والأزرار خارجها، والصفحة عريضة، وA4 بالطول',
        );
        t.eq(byAction('report-info')[0]?.style['--ofc-cols'], '4', 'O1 ثمانية مربّعات صفّان من أربعة من 640 (--ofc-cols)');
        clock = new RealDate(2026, 11, 3, 14, 47).getTime();
        fire(globalThis.window, 'beforeprint', { bubbles: false });
        await settle();
        t.same([textOf('report-printed'), infoOf().at(-1)], ['طُبع في 03/12/2026 الساعة 14:47', ['طُبع في', '03/12/2026 الساعة 14:47']], 'O1 «طُبع في» يتجدّد قبل الطباعة (beforeprint)');
      } finally {
        globalThis.Date = RealDate;
      }
    });
    await step('O2 الورقة جدولٌ رسميّ بعرض أكبر', async () => {
      const left = m.wideStore.get();
      fresh('manager', sheetSetup());
      await mount(`/broiler/hall/${H7}`);
      const frame = ancestor(sheetTable(), (n2) => classOf(n2).split(' ').includes('ofc-frame'));
      const outer = frame?.parentNode ?? null;
      t.same(
        [
          left,
          outer ? classOf(outer) : null,
          outer?.children[0] ? [classOf(outer.children[0]), outer.children[0].getAttribute('role'), outer.children[0].getAttribute('aria-level'), outer.children[0].getAttribute('aria-hidden'), outer.children[0].textContent] : null,
          classOf(frame).includes('overflow-auto'),
          m.wideStore.get(),
        ],
        [0, 'ofc', ['ofc-band', 'heading', '2', null, 'هلاكات قاعة (7)'], true, 2],
        'O2 عنوان الورقة «هلاكات قاعة (7)» شريطُ الجدول الملوّن فوق إطاره عنواناً من المستوى الثاني (مراجعة 0036 R3؛ والإطار يُمرَّر إلى اليوم كما كان)، والصفحة عريضة ما دامت مركّبة: صفحة القاعة والورقة كلتاهما (R6؛ والورقة وحدها في /flock/:id)، وتقرير الوجبة تركها حين أُزيل',
      );
    });
  } finally {
    if (savedRect) Object.defineProperty(Element.prototype, 'getBoundingClientRect', savedRect);
    else delete Element.prototype.getBoundingClientRect;
    if (savedClient) Object.defineProperty(Element.prototype, 'clientHeight', savedClient);
    else delete Element.prototype.clientHeight;
    delete Element.prototype.scrollTop;
    delete globalThis.__hs;
    restore();
  }
}
