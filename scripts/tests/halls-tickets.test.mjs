// تذاكر الوزن وبطاقة الفوج (0028، الوكيل أ؛ عقد scratchpad/reports/contract-0028.md §4.1–§4.3 و§4.6 و§5.1–§5.3 و§5.7 و§10 و§11): react-dom الحقيقي على DOM
// صغير (dom.mjs) يشغّل صفحات القاعات الحقيقية (HallsRoutes: التذكرة الجديدة والمحفوظة وقائمتها) وبطاقة الفوج والتذكير المختصر وصفحة «التقارير»، وrepo
// الحقيقي (المحلّلات وبناء النداء) على core بديل يجيب بأجوبة العقد (fixtures/halls-close-contract.json، مكتوبة باليد قبل الهجرة).
// S التوصيل: المسارات الأربعة وتصدير بطاقة الفوج، ووحدتا الصفحات في write-guard لا يصدّرهما repo/index، وتسمية الحزم المشتركة (vite)، والفتحة الكسولة
//   في صفحة الفوج، وقاموس القيود بأسماء العقد.
// P المحلّلات وبناء النداء: التذكرة بحالاتها وطريقتيها، والخيارات بشكليها، والقائمة، والحفظ (حُفظ وحُفظ بلا تذكرة وتغيّرت)، وp_data بمفاتيح العقد،
//   وبطاقة الفوج؛ والشكل الغريب خطأ يسمّي خانته.
// N التذكرة الجديدة: الحقول بلا ?site، ثمّ القاعة من ?hall، و«وُزن مع الأقفاص» ووزن القفص المقترح، و«وزن الفارغ» باللوحة يحفظ أوّل مرّة بلا نسخة
//   ويصير الرابط رابطها.
// E المسوّدة المحفوظة: الصافي والمعدّل من المرآة، والناقص بترتيب الخادم، والحفظ بعد كلّ وزنة بشرط النسخة، والإكمال بتأكيده وورقته، والخابط الذي لا
//   يزيد لا يُرسل، وتغيّرت بالنسختين، ونسخة الجهاز بعد إعادة التحميل، والنتيجة المجهولة للإكمال بالمرجع نفسه، وميزان الأقفاص بوزناته.
// D المكتملة: الورقة بلا سعر ولا تاجر، و«أصدر الفاتورة» لمن يصدرها، والإلغاء بسببه، والملغاة بختمها، والتي صدرت فاتورتها برابطها.
// L القائمة: الصفوف والمجاميع بصيغة العدد، والمرشّح في الرابط، والمدّة.
// C بطاقة الفوج: المباع والحيّ والأفعال بما يجيزه الخادم، و«فرق العدّ» بنافذته ونتيجته المجهولة (خارج المكوّن)، والمغلقة.
// R التذكير المختصر: «تذاكر وزن بانتظار الفاتورة» لمن يصدر الفاتورة وحده ويُعدّ شغلاً. H صفحة «التقارير»: مدخل «تذاكر الوزن».
// Q مراجعة 0028 للشاشات بأجوبة القاعدة الحقيقية: «احذف المسوّدة» بعد أوّل حفظ نتيجته مجهولة يلغي مسوّدة الخادم (S2)، وticket_not_draft يعيد القراءة
//   وما في الجهاز لتذكرة لم تعد مسوّدة يُعرض ويُمحى بتأكيد (S3)، ويوم التذكرة يُثبَّت عند أوّل وزنة و«تغيّرت» بيومَي النسختين (S4)، وصيغة المعدود (S6).
// X أجوبة القاعدة الحقيقية (fixtures/birds-0028.json من supabase/tests/birds.test بـBIRDS_SAMPLES_OUT=1) بالمحلّلات الحقيقية، حين توجد.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fire, installDom, settle } from './dom.mjs';
import {
  all, body, bundle, buttonText, byAction, clone, click, dialog, disabled, F, href, LRI, memoryStorage, padType, PDI, ROOT, sessionOf, tableFoot, tableRows, text, textOf, type, UUID, withAttr, within,
} from './halls-0028-kit.mjs';

const DRAFT = F.weigh_ticket_draft;
const SITE = DRAFT.site_id;
const [S1, S2] = DRAFT.stops.map((stop) => stop.id);
const H1 = DRAFT.stops[0].hall_id;
const F1 = DRAFT.stops[0].flock_id;
const OWNER = sessionOf('owner');
const WORKER = sessionOf('hall_worker');
const ACCOUNTANT = sessionOf('accountant');

export default async function (t) {
  const restore = installDom();
  const saved = { session: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'), local: Object.getOwnPropertyDescriptor(globalThis, 'localStorage') };
  const session = memoryStorage();
  const local = memoryStorage();
  Object.defineProperty(globalThis, 'sessionStorage', { value: session.api, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: local.api, configurable: true, writable: true });
  let root = null;
  let m = null;
  let current = null;
  const printed = [];
  globalThis.window.print = () => printed.push(globalThis.document.title);
  try {
    m = await bundle('halls-tickets');
    current = m;
    const fresh = (who, rpcs = {}) => {
      const log = [];
      globalThis.__h8 = {
        session: who,
        toasts: [],
        location: null,
        rpc(fn, args) {
          log.push([fn, args]);
          const handler = rpcs[fn];
          if (!handler) return new Promise(() => {});
          const count = log.filter(([name]) => name === fn).length;
          return Promise.resolve().then(() => handler(args, count));
        },
      };
      return log;
    };
    const named = (log, fn) => log.filter(([name]) => name === fn).map(([, args]) => args);
    const lastToast = () => globalThis.__h8.toasts.at(-1)?.title ?? null;
    const mount = async (url, element = null, mm = current) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = mm.createRoot(container);
      function Where() {
        const location = mm.useLocation();
        globalThis.__h8.location = `${location.pathname}${location.search}`;
        return element ?? mm.h(mm.Routes, null, mm.h(mm.Route, { path: '/halls/*', element: mm.h(mm.HallsRoutes) }), mm.h(mm.Route, { path: '/reports', element: mm.h(mm.ReportsPage) }), mm.h(mm.Route, { path: '*', element: null }));
      }
      mm.flushSync(() => root.render(mm.h(mm.MemoryRouter, { initialEntries: [url] }, mm.h(Where))));
      await settle(40);
    };
    const unmount = async () => {
      if (!root) return;
      const mounted = root;
      root = null;
      current.flushSync(() => mounted.unmount());
      body().textContent = '';
      await settle();
    };
    const step = async (label, fn) => {
      session.map.clear();
      local.map.clear();
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
      current = m;
    };
    const stop = (id) => withAttr('ticket-stop', 'data-stop', id);
    const inStop = (id, action) => within(stop(id), action)[0] ?? null;
    const dd = (node) => node?.children.find((n) => n.localName === 'dd')?.textContent ?? null;

    // ── S: التوصيل ────────────────────────────────────────────────────────────────────────────────────────────────────
    {
      const routes = readFileSync(path.join(ROOT, 'src', 'pages', 'halls', 'HallsRoutes.tsx'), 'utf8');
      t.same(
        ['path="ticket/new" element={<TicketPage />}', 'path="ticket/:id" element={<TicketPage />}', 'path="tickets" element={<TicketsPage />}', 'path="close/:flockId" element={<ClosePage />}', "export { default as FlockCard } from './FlockCard';"].map((needle) => routes.includes(needle)),
        [true, true, true, true, true],
        'S المسارات الأربعة في HallsRoutes (خارج التثبيت المسبق)، وبطاقة الفوج تصديرٌ من الحزمة نفسها',
      );
      const write = await import(pathToFileURL(path.join(ROOT, 'scripts', 'guards', 'write-guard.mjs')).href);
      const index = readFileSync(path.join(ROOT, 'src', 'lib', 'repo', 'index.ts'), 'utf8');
      t.same([write.PAGE_MODULES.has('weighTickets'), write.PAGE_MODULES.has('flockClose'), index.includes('weighTickets'), index.includes('flockClose')], [true, true, false, false], 'S weighTickets وflockClose وحدتا صفحات، وrepo/index لا يصدّرهما');
      const vite = readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
      const storesAdmin = vite.split('\n').find((line) => line.includes("'assets/stores-admin-[hash].js'")) ?? '';
      const accounts = vite.split('\n').find((line) => line.includes("'assets/accounts-office-[hash].js'")) ?? '';
      t.same([storesAdmin.includes('weighTicket|allocation'), storesAdmin.includes('weighTickets'), accounts.includes('domain\\/amountWords\\.ts')], [true, true, true], 'S الحزم المشتركة بين المستثناة بأسماء مستثناة: المرآة وتوزيعها stores-admin، والمبلغ كتابةً accounts-office');
      const shared = readFileSync(path.join(ROOT, 'src', 'pages', 'farm', 'shared.tsx'), 'utf8');
      const flockPage = readFileSync(path.join(ROOT, 'src', 'pages', 'farm', 'FlockPage.tsx'), 'utf8');
      t.same(
        [shared.includes('hallsLazy((halls) => halls.FlockCard)'), shared.includes('quietly(loadHalls)'), flockPage.includes('<HallFlockCard flock={detail.flock} onChanged={state.retry} />'), /import[^;]*halls\//u.test(flockPage)],
        [true, true, true, false],
        'S صفحة الفوج (محفوظة) تحمّل البطاقة كسولةً من حزمة القاعات (quietly) ولا تستورد منها شيئاً ثابتاً',
      );
      const names = [
        'flock_counts_kind_check', 'flock_counts_birds_check', 'flock_counts_sign_check', 'flock_counts_net_check', 'flock_counts_doc_check', 'flock_counts_reason_check',
        'weigh_tickets_method_check', 'weigh_tickets_method_fields_check', 'weigh_tickets_empty_check', 'weigh_tickets_crate_kg_check', 'weigh_tickets_totals_check', 'weigh_tickets_status_check',
        'weigh_tickets_no_check', 'weigh_tickets_done_check', 'weigh_tickets_void_check', 'weigh_tickets_text_check', 'weigh_tickets_version_check',
        'weigh_ticket_stops_no_check', 'weigh_ticket_stops_birds_check', 'weigh_ticket_stops_crates_check', 'weigh_ticket_stops_gross_check', 'weigh_ticket_stops_net_check',
        'weigh_ticket_weighings_no_check', 'weigh_ticket_weighings_crates_check', 'weigh_ticket_weighings_gross_check',
        'flock_closes_status_check', 'flock_closes_counts_check', 'flock_closes_reason_check', 'flock_closes_reopen_check', 'flock_closes_note_check',
        'flock_close_lines_action_check', 'flock_close_lines_qty_check', 'flock_close_lines_unit_check', 'flock_close_lines_density_check', 'flock_close_lines_piece_mass_check',
        'flock_close_lines_cost_kind_check', 'flock_close_lines_line_no_check', 'flock_close_lines_shape_check', 'flock_close_lines_carry_check',
        'flock_returns_doc_no_check', 'flock_returns_source_check', 'flock_returns_status_check', 'flock_returns_void_check', 'flock_returns_version_check',
        'flock_return_lines_qty_check', 'flock_return_lines_unit_check', 'flock_return_lines_density_check', 'flock_return_lines_piece_mass_check', 'flock_return_lines_cost_kind_check', 'flock_return_lines_line_no_check',
        'flock_close_values_amounts_check',
      ];
      t.same(Object.keys(m.CLOSE_CONSTRAINT_HINTS).sort(), [...names].sort(), 'S قاموس القيود (constraints-close) بأسماء العقد §2 كلّها، ولا قيد لفاتورة الطيور (قاموس الوكيل ب)');
    }

    // ── P: المحلّلات وبناء النداء ─────────────────────────────────────────────────────────────────────────────────────
    {
      const draft = m.tickets.parseWeighTicket(clone(F.weigh_ticket_draft));
      t.same(
        [draft.ticketNo, draft.status, draft.version, draft.method, draft.emptyKg, draft.emptyWithCrates, draft.crateKg, draft.birds, draft.netKg, draft.stops.map((s) => [s.stopNo, s.birds, s.crates, s.grossKg, s.prevGrossKg, s.cratesKg, s.netKg, s.avgKg, s.live, s.otherTicketed]), draft.sale, draft.can, draft.warnings],
        [null, 'draft', 3, 'scale', 7_000_000n, false, 6000n, null, null, [[1, 800, 200, 10_000_000n, 7_000_000n, 1_200_000n, 1_800_000n, 2250n, 9730, 0], [2, 1000, 200, null, 10_000_000n, 1_200_000n, null, null, 5000, 500]], null, { edit: true, finish: true, void: true, invoice: false }, []],
        'P المسوّدة: الكيلو بالآلاف، والناقص null لا صفر، والمجاميع null ما دامت قاعة ناقصة',
      );
      const done = m.tickets.parseWeighTicket(clone(F.weigh_ticket_invoiced));
      t.same([done.ticketNo, done.status, done.netKg, done.avgKg, done.grossKg, done.invoiced, done.sale], ['WT-2026-0007', 'done', 4_100_000n, 2278n, 13_500_000n, true, { id: F.weigh_ticket_invoiced.sale.id, docNo: 'BR-2026-0003', status: 'posted' }], 'P المكتملة بفاتورتها');
      const crates = m.tickets.parseWeighTicket(clone(F.weigh_ticket_crates));
      t.same([crates.method, crates.emptyKg, crates.emptyWithCrates, crates.stops[0].weighings.map((w) => [w.weighingNo, w.crates, w.grossKg])], ['crates', null, null, [[1, 10, 520_000n], [2, 10, 515_500n]]], 'P ميزان الأقفاص: بلا فارغ، ووزناته');
      const options = m.tickets.parseTicketOptions(clone(F.weigh_ticket_options));
      const sites = m.tickets.parseTicketOptions(clone(F.weigh_ticket_options_sites));
      t.same([options.kind, options.site, options.lastCrateKg, options.halls.map((h) => [h.name, h.flock?.live ?? null, h.flock?.ticketed ?? null]), sites.kind, sites.sites.map((s) => s.hallsWithFlock)], ['site', { id: SITE, name: 'حقل الأمير' }, 6000n, [['قاعة 1', 9730, 0], ['قاعة 2', 5000, 500], ['قاعة 3', null, null]], 'sites', [2, 0]], 'P الخيارات: الحقل بقاعاته، أو الحقول');
      const list = m.tickets.parseTicketList(clone(F.weigh_tickets));
      t.same([list.rows.map((r) => [r.ticketNo, r.status, r.invoiced, r.halls.length, r.netKg]), list.totals, list.more], [[['WT-2026-0007', 'done', false, 2, 4_100_000n], ['WT-2026-0006', 'done', true, 1, 9_100_000n], [null, 'draft', false, 2, null], ['WT-2026-0005', 'void', false, 2, 4_100_000n]], { count: 3, birds: 5800, netKg: 13_200_000n }, false], 'P القائمة ومجاميعها');
      t.same(
        [m.tickets.parseSaveResult(clone(F.save_saved)).ticket.version, m.tickets.parseSaveResult(clone(F.save_saved_bare)), m.tickets.parseSaveResult(clone(F.save_stale)).server.version],
        [4, { status: 'saved', ticket: null }, 6],
        'P الحفظ: حُفظ بتذكرته، وحُفظ بلا تذكرة (إعادة بالمحتوى نفسه)، وتغيّرت بنسخة الخادم',
      );
      const payload = m.tickets.ticketPayload({ siteId: SITE, onDate: '2026-11-12', method: 'scale', emptyKg: 7_000_000n, emptyWithCrates: false, crateKg: 6000n, vehicle: ' 12 ', driver: '', note: '  ', stops: [{ id: S1, hallId: H1, birds: 800, crates: 200, grossKg: 10_000_500n, weighings: [{ id: 'w', crates: 1, grossKg: 1n }] }] });
      t.same(
        payload,
        { site_id: SITE, on_date: '2026-11-12', method: 'scale', empty_kg: '7000.000', empty_with_crates: false, crate_kg: '6.000', vehicle: '12', driver: null, note: null, stops: [{ id: S1, hall_id: H1, birds: 800, crates: 200, gross_kg: '10000.500', weighings: [] }] },
        'P p_data للقبّان بمفاتيح العقد: الكيلو نصّاً بثلاث مراتب، والنصّ مقصوصاً أو null، وبلا وزنات',
      );
      const cratesPayload = m.tickets.ticketPayload({ siteId: SITE, onDate: '2026-11-12', method: 'crates', emptyKg: 7_000_000n, emptyWithCrates: true, crateKg: 6000n, vehicle: '', driver: '', note: '', stops: [{ id: S1, hallId: H1, birds: 450, crates: 5, grossKg: 9n, weighings: [{ id: 'w1', crates: 10, grossKg: 520_000n }] }] });
      t.same([cratesPayload.empty_kg, cratesPayload.empty_with_crates, cratesPayload.stops[0].crates, cratesPayload.stops[0].gross_kg, cratesPayload.stops[0].weighings], [null, null, null, null, [{ id: 'w1', crates: 10, gross_kg: '520.000' }]], 'P p_data لميزان الأقفاص: بلا فارغ ولا حالة أقفاص ولا خابط للقاعة، والوزنات وحدها');
      const sales = m.close.parseFlockSales(clone(F.flock_sales_active));
      t.same([sales.live, sales.soldBirds, sales.soldNetKg, sales.countDiff, sales.ticketed, sales.tickets.length, sales.close, sales.can], [30, 9700, 23_280_000n, 0, 0, 1, null, { ticket: true, adjust: true, close: true, reopen: false }], 'P بطاقة الفوج');
      const bad = (parse, value, mutate) => {
        const json = clone(value);
        mutate(json);
        try {
          parse(json);
          return 'لم يرمِ';
        } catch (error) {
          return error?.field ?? `رمى ${error}`;
        }
      };
      t.same(
        [
          bad(m.tickets.parseWeighTicket, F.weigh_ticket_draft, (j) => { j.empty_kg = 7000; }),
          bad(m.tickets.parseWeighTicket, F.weigh_ticket_draft, (j) => { j.method = 'net'; }),
          bad(m.tickets.parseWeighTicket, F.weigh_ticket_draft, (j) => { j.stops[0].live = '9730'; }),
          bad(m.tickets.parseWeighTicket, F.weigh_ticket_draft, (j) => { delete j.can.invoice; }),
          bad(m.tickets.parseWeighTicket, F.weigh_ticket_draft, (j) => { j.status = 'posted'; }),
          bad(m.tickets.parseTicketList, F.weigh_tickets, (j) => { j.rows[0].halls = [1]; }),
          bad(m.tickets.parseSaveResult, F.save_stale, (j) => { j.status = 'conflict'; }),
          bad(m.close.parseFlockSales, F.flock_sales_active, (j) => { j.sold_net_kg = '1.2345'; }),
        ],
        ['empty_kg', 'method', 'live', 'invoice', 'status', 'halls', 'status', 'sold_net_kg'],
        'P الشكل الغريب يرمي خطأ شكل يسمّي خانته (لا يُقرأ رقماً ولا حالة لا يعرفها)',
      );
    }

    const options = (over = {}) => ({ ...clone(F.weigh_ticket_options), ...over });
    const draftRpcs = (over = {}) => ({ weigh_ticket: () => clone(F.weigh_ticket_draft), weigh_ticket_options: () => options(), ...over });

    // ── N: التذكرة الجديدة ────────────────────────────────────────────────────────────────────────────────────────────
    await step('N بلا حقل', async () => {
      fresh(WORKER, { weigh_ticket_options: (args) => (args.p_site === null ? clone(F.weigh_ticket_options_sites) : options()) });
      await mount('/halls/ticket/new');
      const links = byAction('ticket-site');
      t.same(links.map((link) => [link.getAttribute('data-site'), href(link)]), [[SITE, `/halls/ticket/new?site=${SITE}&back=%2Fhalls%2Ftickets`], [F.weigh_ticket_options_sites.sites[1].site_id, `/halls/ticket/new?site=${F.weigh_ticket_options_sites.sites[1].site_id}&back=%2Fhalls%2Ftickets`]], 'N بلا ?site: الحقول، وكلّ حقل إلى تذكرة جديدة فيه برجوع');
    });
    await step('N أوّل حفظ', async () => {
      const log = fresh(WORKER, draftRpcs({ save_weigh_ticket: () => clone(F.save_saved) }));
      await mount(`/halls/ticket/new?site=${SITE}&hall=${H1}&back=${encodeURIComponent(`/broiler/flock/${F1}`)}`);
      const first = byAction('ticket-stop');
      t.same([first.length, first[0]?.getAttribute('data-hall'), textOf('ticket-state'), disabled(byAction('ticket-save')[0]), disabled(byAction('ticket-finish')[0])], [1, H1, 'تذكرة جديدة لم تُحفظ بعد.', true, true], 'N ?hall= قاعة أولى، ولا حفظ ولا إكمال قبل أن يُكتب شيء');
      t.same([textOf('ticket-stop-live'), byAction('ticket-crate').length], ['الحيّ 9,730، العمر 36', 0], 'N حيّ القاعة وعمرها، والفارغ مع الأقفاص افتراضاً بلا وزن قفص');
      await click(all().find((n) => n.getAttribute('role') === 'switch'));
      t.eq(byAction('ticket-crate')[0]?.value, '6', 'N «وُزن مع الأقفاص» مطفأً: وزن القفص مقترح من آخر تذكرة');
      type(inStop(first[0].getAttribute('data-stop'), 'ticket-birds'), '800');
      type(inStop(first[0].getAttribute('data-stop'), 'ticket-crates'), '200');
      await settle();
      t.same([textOf('ticket-state'), (local.map.size > 0)], ['فيها ما لم يُحفظ بعد (محفوظ في هذا الجهاز).', true], 'N ما كُتب في الجهاز قبل أيّ حفظ');
      await click(byAction('ticket-weigh-empty')[0]);
      await padType('7000');
      const sent = named(log, 'save_weigh_ticket');
      t.same(
        [sent.length, UUID.test(sent[0]?.p_ticket ?? ''), sent[0]?.p_expected_version, { ...sent[0]?.p_data, stops: sent[0]?.p_data.stops.map((s) => ({ ...s, id: UUID.test(s.id) })) }],
        [1, true, null, { site_id: SITE, on_date: '2026-11-12', method: 'scale', empty_kg: '7000.000', empty_with_crates: false, crate_kg: '6.000', vehicle: null, driver: null, note: null, stops: [{ id: true, hall_id: H1, birds: 800, crates: 200, gross_kg: null, weighings: [] }] }],
        'N «وزن الفارغ» باللوحة يحفظ فوراً: معرّف من الجهاز وبلا نسخة (جديدة)، واليوم يوم الخادم، وp_data بما كُتب',
      );
      t.same([globalThis.__h8.location, local.map.size], [`/halls/ticket/${DRAFT.id}?back=%2Fbroiler%2Fflock%2F${F1}`, 0], 'N بعد أوّل حفظ: الرابط رابط التذكرة برجوعه، ونسخة الجهاز مُحيت');
    });

    // ── E: المسوّدة المحفوظة ──────────────────────────────────────────────────────────────────────────────────────────
    await step('E الصافي والإكمال', async () => {
      const log = fresh(WORKER, draftRpcs({ save_weigh_ticket: () => ({ status: 'saved', ticket: clone(F.weigh_ticket_complete) }), finish_weigh_ticket: () => ({ ...clone(F.weigh_ticket_done), id: DRAFT.id }) }));
      await mount(`/halls/ticket/${DRAFT.id}`);
      t.same(
        [dd(inStop(S1, 'ticket-stop-net')), dd(inStop(S1, 'ticket-stop-avg')), dd(inStop(S2, 'ticket-stop-net')), textOf('ticket-missing'), disabled(byAction('ticket-finish')[0]), textOf('ticket-state')],
        ['1,800', '2.250', '—', 'لتكتمل التذكرة: وزن الخابط بعد قاعة «قاعة 2».', true, 'محفوظة (النسخة 3).'],
        'E صافي القاعة الأولى ومعدّلها من المرآة (10,000 − 7,000 − 200 × 6)، والثانية ناقصة بجملة الخادم، ولا إكمال',
      );
      t.same([inStop(S1, 'ticket-stop-live')?.textContent, inStop(S2, 'ticket-stop-live')?.textContent], ['الحيّ 9,730، العمر 36', 'الحيّ 5,000، العمر 34، وعلى تذاكر أخرى بلا فاتورة 500'], 'E الحيّ والعمر لكلّ قاعة، وطيورها على تذاكر أخرى بلا فاتورة (من التذكرة المحفوظة)');
      await click(inStop(S2, 'ticket-weigh-gross'));
      t.ok(dialog()?.textContent.includes('وزن الخابط بعد «قاعة 2»'), 'E لوحة الخابط تسمّي القاعة');
      await padType('13500');
      const sent = named(log, 'save_weigh_ticket');
      t.same([sent.length, sent[0]?.p_ticket, sent[0]?.p_expected_version, sent[0]?.p_data.stops.map((s) => [s.id, s.gross_kg])], [1, DRAFT.id, 3, [[S1, '10000.000'], [S2, '13500.000']]], 'E الوزنة تُحفظ فوراً بشرط النسخة 3، وكلّ قاعة بمعرّفها');
      t.same(
        [textOf('ticket-state'), dd(byAction('ticket-total-birds')[0]), dd(byAction('ticket-total-crates')[0]), dd(byAction('ticket-total-net')[0]), dd(byAction('ticket-total-avg')[0]), dd(inStop(S2, 'ticket-stop-net')), byAction('ticket-missing').length, disabled(byAction('ticket-finish')[0])],
        ['محفوظة (النسخة 4).', '1,800', '400', '4,100', '2.278', '2,300', 0, false],
        'E بعد الحفظ: المجاميع (13,500 − 7,000 − 2,400 = 4,100، والمعدّل 2.278)، ولا ناقص، و«أكمل» متاح',
      );
      await click(byAction('ticket-finish')[0]);
      t.same([dialog()?.textContent.includes('أكمل التذكرة: 1,800 طير، و4,100 كغم صافياً؟'), dialog()?.textContent.includes('تأخذ التذكرة رقماً ولا تُعدَّل بعده. لا تنقص الطيور من القاعة حتى تُصدر الفاتورة.')], [true, true], 'E التأكيد بالطيور والصافي وجملة العقد');
      await click(byAction('ticket-finish-confirm')[0]);
      await settle(30);
      const finished = named(log, 'finish_weigh_ticket');
      t.same([finished.length, UUID.test(finished[0]?.p_client_ref ?? ''), finished[0]?.p_ticket, finished[0]?.p_expected_version, lastToast()], [1, true, DRAFT.id, 4, 'اكتملت التذكرة WT-2026-0007.'], 'E «أكمل» بمرجعه وبالنسخة المحفوظة 4');
      t.same(
        [textOf('ticket-paper-title'), tableRows('قاعات التذكرة'), tableFoot('قاعات التذكرة')],
        ['تذكرة وزن WT-2026-0007', [['قاعة 1', '800', '200', '10,000', '1,800', '2.250'], ['قاعة 2', '1,000', '200', '13,500', '2,300', '2.300']], [['المجموع', '1,800', '400', '', '4,100', '2.278']]],
        'E الورقة: رقمها وجدول القاعات (القاعة، الطيور، الأقفاص، الخابط، الصافي، المعدّل) ومجاميعها',
      );
    });
    await step('E الخابط لا يزيد', async () => {
      const log = fresh(WORKER, draftRpcs({ save_weigh_ticket: () => clone(F.save_saved) }));
      await mount(`/halls/ticket/${DRAFT.id}`);
      await click(inStop(S2, 'ticket-weigh-gross'));
      await padType('9500');
      t.same(
        [named(log, 'save_weigh_ticket').length, textOf('ticket-stop-problem'), disabled(byAction('ticket-save')[0]), textOf('ticket-state')],
        [0, 'وزن الخابط بعد «قاعة 2» (9,500) لا يزيد على الذي قبله (10,000). راجع الوزن.', true, 'فيها ما لم يُحفظ بعد (محفوظ في هذا الجهاز).'],
        'E خابط لا يزيد على الذي قبله: جملة الخادم نفسها ولا يُرسل، وما كُتب باقٍ في الجهاز',
      );
    });
    await step('E تغيّرت', async () => {
      const log = fresh(WORKER, draftRpcs({ save_weigh_ticket: (_args, n) => (n === 1 ? clone(F.save_stale) : { status: 'saved', ticket: { ...clone(F.weigh_ticket_complete), version: 7 } }) }));
      await mount(`/halls/ticket/${DRAFT.id}`);
      await click(inStop(S2, 'ticket-weigh-gross'));
      await padType('13500');
      t.same(
        [byAction('ticket-stale').length, tableRows('نسخة الخادم')?.map((row) => row[3]), tableRows('نسختك')?.map((row) => row[3]), textOf('ticket-state'), disabled(byAction('ticket-save')[0])],
        [1, ['10,100', '—'], ['10,000', '13,500'], 'تغيّرت التذكرة في الخادم: اختر النسخة.', true],
        'E «تغيّرت»: نسخة الخادم ونسختك جنباً إلى جنب بلا كتابة، والحفظ ينتظر الاختيار',
      );
      await click(byAction('ticket-keep-mine')[0]);
      await settle(20);
      const sent = named(log, 'save_weigh_ticket');
      t.same([sent.length, sent[1]?.p_expected_version, sent[1]?.p_data.stops[1].gross_kg, byAction('ticket-stale').length, textOf('ticket-state')], [2, 6, '13500.000', 0, 'محفوظة (النسخة 7).'], 'E «احفظ ما كتبته فوقها»: بشرط نسخة الخادم 6');
    });
    await step('E خذ نسخة الخادم', async () => {
      fresh(WORKER, draftRpcs({ save_weigh_ticket: () => clone(F.save_stale) }));
      await mount(`/halls/ticket/${DRAFT.id}`);
      await click(inStop(S2, 'ticket-weigh-gross'));
      await padType('13500');
      await click(byAction('ticket-take-server')[0]);
      t.same([byAction('ticket-stale').length, textOf('ticket-state'), textOf('ticket-gross'), local.map.size], [0, 'محفوظة (النسخة 6).', '10,100 كغم', 0], 'E «خذ نسخة الخادم»: الخانات من الخادم، ولا نسخة في الجهاز');
    });
    await step('E نسخة الجهاز بعد إعادة التحميل', async () => {
      fresh(WORKER, draftRpcs());
      await mount(`/halls/ticket/${DRAFT.id}`);
      type(inStop(S1, 'ticket-birds'), '850');
      await settle();
      await unmount();
      current = await bundle('halls-tickets');
      fresh(WORKER, draftRpcs());
      await mount(`/halls/ticket/${DRAFT.id}`);
      t.same([inStop(S1, 'ticket-birds')?.value, textOf('ticket-state'), byAction('ticket-stale').length], ['850', 'فيها ما لم يُحفظ بعد (محفوظ في هذا الجهاز).', 0], 'E إعادة التحميل: ما كُتب ولم يُحفظ يعود من الجهاز فوق النسخة نفسها');
      await unmount();
      // الخادم تقدّم (نسخة 5) والنسخة في الجهاز فوق 3: «تغيّرت» بالنسختين لا كتابة فوقها.
      current = await bundle('halls-tickets');
      fresh(WORKER, draftRpcs({ weigh_ticket: () => ({ ...clone(F.weigh_ticket_draft), version: 5 }) }));
      await mount(`/halls/ticket/${DRAFT.id}`);
      t.same([byAction('ticket-stale').length, inStop(S1, 'ticket-birds')?.value], [1, '850'], 'E نسخة جهاز فوق نسخة أقدم من الخادم: «تغيّرت» وما كُتب باقٍ');
    });
    await step('E الإكمال بنتيجة مجهولة', async () => {
      const log = fresh(WORKER, draftRpcs({ weigh_ticket: () => clone(F.weigh_ticket_complete), finish_weigh_ticket: (_args, n) => (n === 1 ? Promise.reject(new m.UnknownOutcomeError()) : { ...clone(F.weigh_ticket_done), id: DRAFT.id }) }));
      await mount(`/halls/ticket/${DRAFT.id}`);
      await click(byAction('ticket-finish')[0]);
      await click(byAction('ticket-finish-confirm')[0]);
      await settle(20);
      t.same([textOf('ticket-retry'), disabled(byAction('ticket-finish')[0]), disabled(inStop(S1, 'ticket-birds'))], ['أعد المحاولة', true, true], 'E نتيجة مجهولة: «أعد المحاولة» وحدها، والخانات مقفلة');
      await click(byAction('ticket-retry')[0]);
      await settle(20);
      const sent = named(log, 'finish_weigh_ticket');
      t.same([sent.length, sent[1]?.p_client_ref === sent[0]?.p_client_ref, textOf('ticket-paper-title')], [2, true, 'تذكرة وزن WT-2026-0007'], 'E الإعادة بالمرجع نفسه (لا تكتمل مرّتين)، ثمّ الورقة');
    });
    await step('E ميزان الأقفاص', async () => {
      const log = fresh(WORKER, draftRpcs({ weigh_ticket: () => clone(F.weigh_ticket_crates), save_weigh_ticket: () => ({ status: 'saved', ticket: { ...clone(F.weigh_ticket_crates), version: 3 } }) }));
      await mount(`/halls/ticket/${F.weigh_ticket_crates.id}`);
      t.same([byAction('ticket-weighing').map((n) => n.children[0].textContent), byAction('ticket-empty-box').length, dd(byAction('ticket-total-net')[0]), dd(byAction('ticket-total-avg')[0])], [['الوزنة 1: الأقفاص 10، والوزن 520 كغم', 'الوزنة 2: الأقفاص 10، والوزن 515.5 كغم'], 0, '915.5', '2.034'], 'E ميزان الأقفاص: الوزنات، وبلا «وزن الفارغ»، والصافي 1,035.5 − 20 × 6');
      await click(byAction('ticket-add-weighing')[0]);
      await padType('470.25', '10');
      const sent = named(log, 'save_weigh_ticket');
      t.same([sent.length, sent[0]?.p_data.method, sent[0]?.p_data.empty_kg, sent[0]?.p_data.stops[0].weighings.map((w) => [w.crates, w.gross_kg]), sent[0]?.p_data.stops[0].gross_kg], [1, 'crates', null, [[10, '520.000'], [10, '515.500'], [10, '470.250']], null], 'E «أضف وزنة» بأقفاصها ووزنها تُحفظ فوراً، والخابط لا يُرسل');
    });
    await step('E لعامل لا يكتب', async () => {
      fresh(sessionOf('viewer'), draftRpcs({ weigh_ticket: () => ({ ...clone(F.weigh_ticket_draft), can: { edit: false, finish: false, void: false, invoice: false } }) }));
      await mount(`/halls/ticket/${DRAFT.id}`);
      t.same([disabled(inStop(S1, 'ticket-birds')), byAction('ticket-delete').length, text().includes('تذكرة الوزن يكتبها عامل القاعة في حقله والمدير؛ دورك يقرأ فقط.')], [true, 0, true], 'E من لا يكتب التذاكر يقرأ: الخانات مقفلة بجملة');
    });

    // ── D: المكتملة والملغاة ─────────────────────────────────────────────────────────────────────────────────────────
    await step('D المكتملة للمحاسب', async () => {
      fresh(ACCOUNTANT, { weigh_ticket: () => clone(F.weigh_ticket_done) });
      await mount(`/halls/ticket/${F.weigh_ticket_done.id}`);
      const paper = byAction('ticket-paper')[0];
      t.same(
        [href(byAction('ticket-invoice')[0]), textOf('ticket-status'), /سعر|التاجر|دينار/u.test(paper?.textContent ?? ''), byAction('signatures')[0]?.children.map((n) => n.textContent), textOf('ticket-empty')],
        [`/sales/birds/new?ticket=${F.weigh_ticket_done.id}`, 'بانتظار الفاتورة', false, ['عامل القاعة', 'السائق', 'المستلم'], 'وزن الفارغ بلا أقفاص: 7,000 كغم، ووزن القفص الفارغ 6 كغم.'],
        'D الورقة بلا سعر ولا تاجر وبتواقيعها ووزن الفارغ، و«أصدر الفاتورة» إلى فاتورة الطيور',
      );
      const vehicle = byAction('ticket-vehicle').find((n) => n.localName === 'p');
      t.same(vehicle ? all().filter((n) => n.localName === 'bdi' && vehicle.contains(n)).map((n) => [n.getAttribute('dir'), n.textContent]) : null, [['ltr', '12345 بغداد'], ['ltr', 'حسين علي']], 'D السيارة والسائق معزولان LTR');
      await click(byAction('ticket-print')[0]);
      t.eq(printed.at(-1), 'تذكرة وزن WT-2026-0007', 'D الطباعة بعنوان الورقة');
    });
    await step('D الإلغاء', async () => {
      const log = fresh(OWNER, { weigh_ticket: (_args, n) => (n === 1 ? clone(F.weigh_ticket_done) : clone(F.weigh_ticket_void)), void_weigh_ticket: () => clone(F.void_result) });
      await mount(`/halls/ticket/${F.weigh_ticket_done.id}`);
      await click(byAction('ticket-void')[0]);
      t.eq(disabled(byAction('ticket-void-confirm')[0]), true, 'D الإلغاء بلا سبب مقفول');
      type(byAction('ticket-void-reason')[0], 'خطأ في عدد الطيور');
      await settle();
      await click(byAction('ticket-void-confirm')[0]);
      await settle(30);
      const sent = named(log, 'void_weigh_ticket');
      t.same([sent.length, sent[0]?.p_ticket, sent[0]?.p_reason, UUID.test(sent[0]?.p_client_ref ?? ''), textOf('void-stamp')], [1, F.weigh_ticket_done.id, 'خطأ في عدد الطيور', true, 'ملغىالسبب: خطأ في عدد الطيور'], 'D «ألغِ التذكرة» بسببه ومرجعه، ثمّ الورقة بختم «ملغى»');
    });
    await step('D التي صدرت فاتورتها', async () => {
      fresh(OWNER, { weigh_ticket: () => clone(F.weigh_ticket_invoiced) });
      await mount(`/halls/ticket/${F.weigh_ticket_done.id}`);
      t.same([href(byAction('ticket-sale')[0]), byAction('ticket-void').length, byAction('ticket-invoice').length, textOf('ticket-status')], [`/sales/birds/${F.weigh_ticket_invoiced.sale.id}`, 0, 0, 'صدرت فاتورتها (BR-2026-0003)'], 'D صدرت فاتورتها: رابطها، ولا إلغاء ولا فاتورة ثانية');
    });
    await step('D التحذير بعد الإكمال', async () => {
      fresh(OWNER, { weigh_ticket: () => clone(F.weigh_ticket_finished_warn) });
      await mount(`/halls/ticket/${F.weigh_ticket_done.id}`);
      t.ok(textOf('ticket-warnings')?.includes('«قاعة 2»: في التذكرة 1,000، والحيّ 1,200، وعلى تذاكر أخرى 500.'), 'D تحذير الخادم: طيور قاعة أكثر من حيّها بعد التذاكر الأخرى');
    });

    // ── L: القائمة ──────────────────────────────────────────────────────────────────────────────────────────────────────
    await step('L القائمة', async () => {
      const log = fresh(OWNER, { weigh_tickets: (args) => (args.p_status === 'awaiting' ? clone(F.weigh_tickets_awaiting) : clone(F.weigh_tickets)) });
      await mount('/halls/tickets?back=/reports');
      t.same(
        [named(log, 'weigh_tickets')[0], tableRows('تذاكر الوزن')?.map((row) => [row[0], row[6], row[7]]), tableFoot('تذاكر الوزن')?.[0]?.slice(0, 1), href(byAction('tickets-new')[0])],
        [{ p_from: null, p_to: null, p_status: 'all' }, [['WT-2026-0007', 'بانتظار الفاتورة', '—'], ['WT-2026-0006', 'صدرت فاتورتها', 'BR-2026-0003'], ['مسوّدة', 'مسوّدة', '—'], ['WT-2026-0005', 'ملغاة', '—']], ['المجموع (3 تذاكر غير ملغاة)'], '/halls/ticket/new?back=%2Fhalls%2Ftickets%3Fback%3D%252Freports'],
        'L الصفوف بحالاتها وفاتورتها، ومجموع غير الملغاة بصيغة العدد، و«تذكرة وزن جديدة» برجوع إلى القائمة',
      );
      await click(buttonText('بانتظار الفاتورة'));
      await settle(20);
      t.same([globalThis.__h8.location, named(log, 'weigh_tickets').at(-1), tableRows('تذاكر الوزن')?.length], ['/halls/tickets?back=%2Freports&status=awaiting', { p_from: null, p_to: null, p_status: 'awaiting' }, 1], 'L المرشّح في الرابط والنداء');
      type(byAction('tickets-from')[0], '01/11/2026');
      await settle();
      fire(byAction('tickets-period')[0], 'submit');
      await settle(20);
      t.ok(text().includes('اكتب اليومين معاً (يوم/شهر/سنة)، أو اتركهما فارغين لكلّ الأيّام.'), 'L يوم واحد من المدّة: جملة، ولا نداء');
      type(byAction('tickets-to')[0], '12/11/2026');
      await settle();
      fire(byAction('tickets-period')[0], 'submit');
      await settle(20);
      t.same(named(log, 'weigh_tickets').at(-1), { p_from: '2026-11-01', p_to: '2026-11-12', p_status: 'awaiting' }, 'L المدّة باليومين');
      t.same([m.ticketsCount(1), m.ticketsCount(2), m.ticketsCount(5), m.ticketsCount(11), m.ticketsCount(100)], ['تذكرة واحدة', 'تذكرتان', '5 تذاكر', '11 تذكرةً', '100 تذكرة'], 'L صيغ العدد');
    });

    // ── C: بطاقة الفوج ───────────────────────────────────────────────────────────────────────────────────────────────
    const flock = { id: F1, kind: 'broiler', siteId: SITE, hallId: H1, hallName: 'قاعة 1', siteName: 'حقل الأمير', status: 'active' };
    const cardAt = (mm, changed) => mm.h(mm.FlockCard, { flock, onChanged: changed });
    await step('C البطاقة القائمة', async () => {
      let changed = 0;
      const log = fresh(OWNER, { flock_sales: () => clone(F.flock_sales_active), record_flock_count_adjust: () => clone(F.count_adjust_result) });
      await mount('/broiler/flock/x', cardAt(m, () => (changed += 1)));
      t.same(
        [textOf('card-sold'), textOf('card-live'), href(byAction('card-new-ticket')[0]), href(byAction('card-close')[0]), byAction('card-reopen').length, tableRows('تذاكر الوزن')],
        ['المباع من الفواتير: 9,700 طير، صافيها 23,280 كغم.', 'الحيّ بحسب النظام 30.', `/halls/ticket/new?site=${SITE}&hall=${H1}&back=%2Fbroiler%2Fflock%2F${F1}`, `/halls/close/${F1}?back=%2Fbroiler%2Fflock%2F${F1}`, 0, [['WT-2026-0007', '12/11/2026', '1,800', 'صدرت فاتورتها']]],
        'C المباع والحيّ، و«تذكرة وزن» لحقل القاعة وقاعتها، و«أغلق الدورة»، وأحدث التذاكر',
      );
      await click(byAction('card-count')[0]);
      type(byAction('count-n')[0], '30');
      type(byAction('count-reason')[0], 'عُدّت القاعة');
      await settle();
      t.same([textOf('count-live'), textOf('count-go')], ['الحيّ الآن 30، وبعد فرق العدّ 0.', `سجّل فرق العدّ ${LRI}-30${PDI}`], 'C نقص 30: الحيّ قبله وبعده، والزرّ يسمّي الفرق بإشارته معزولة');
      await click(byAction('count-go')[0]);
      await settle(20);
      const sent = named(log, 'record_flock_count_adjust');
      t.same(
        [sent.length, { ...sent[0], p_client_ref: UUID.test(sent[0]?.p_client_ref ?? ''), p_id: UUID.test(sent[0]?.p_id ?? '') }, named(log, 'flock_sales').length, changed, dialog()],
        [1, { p_client_ref: true, p_id: true, p_flock: F1, p_on: F.flock_sales_active.today, p_birds: -30, p_reason: 'عُدّت القاعة', p_expected_live: 30 }, 2, 1, null],
        'C «فرق العدّ» نداء واحد بإشارته والحيّ المعروض شرطاً، ويومه المقترح يوم الخادم (flock_sales.today، مراجعة 0028 S1)، ثمّ تُقرأ البطاقة وصفحة الفوج',
      );
    });
    await step('C فرق العدّ بنتيجة مجهولة', async () => {
      const log = fresh(OWNER, { flock_sales: () => clone(F.flock_sales_active), record_flock_count_adjust: (_args, n) => (n === 1 ? Promise.reject(new m.UnknownOutcomeError()) : clone(F.count_adjust_result)) });
      await mount('/broiler/flock/x', cardAt(m, () => undefined));
      await click(byAction('card-count')[0]);
      type(byAction('count-n')[0], '30');
      type(byAction('count-reason')[0], 'عُدّت القاعة');
      await settle();
      await click(byAction('count-go')[0]);
      await settle(20);
      t.same([byAction('card-frozen').length, disabled(byAction('card-count')[0])], [1, true], 'C نتيجة مجهولة: البطاقة مجمَّدة بالطلب');
      await unmount();
      current = await bundle('halls-tickets');
      const log2 = fresh(OWNER, { flock_sales: () => clone(F.flock_sales_active), record_flock_count_adjust: () => clone(F.count_adjust_result) });
      await mount('/broiler/flock/x', cardAt(current, () => undefined));
      t.ok(textOf('card-frozen')?.includes(`لا نعرف إن سُجّل فرق العدّ ${LRI}-30${PDI}`), 'C بعد إعادة التحميل: مجمَّدة بالطلب من sessionStorage');
      await click(byAction('card-count-retry')[0]);
      await settle(20);
      const first = named(log, 'record_flock_count_adjust')[0];
      const again = named(log2, 'record_flock_count_adjust');
      t.same([again.length, JSON.stringify(again[0]) === JSON.stringify(first), byAction('card-frozen').length, globalThis.__h8.toasts.length], [1, true, 0, 1], 'C الإعادة بعد إعادة التحميل بالطلب نفسه حرفاً (المرجع والمعرّف)، ثمّ تُفكّ البطاقة');
    });
    await step('C البطاقة المغلقة', async () => {
      fresh(OWNER, { flock_sales: () => clone(F.flock_sales_closed) });
      await mount('/broiler/flock/x', cardAt(m, () => undefined));
      t.same([textOf('card-closed'), textOf('card-live'), byAction('card-close').length, byAction('card-count').length, href(byAction('card-reopen')[0])], ['أُغلقت الدورة يوم 12/11/2026.', `الحيّ بحسب النظام 0. فرق العدّ ${LRI}-30${PDI}.`, 0, 0, `/halls/report/${F1}?back=%2Fbroiler%2Fflock%2F${F1}&act=reopen`], 'C المغلقة: يوم الإغلاق وفرق العدّ، و«أعد فتح الدورة» إلى التقرير مفتوحاً عليها');
    });

    // ── R: التذكير المختصر ─────────────────────────────────────────────────────────────────────────────────────────────
    for (const [who, expected] of [[ACCOUNTANT, 1], [WORKER, 0]]) {
      await step(`R ${who.workspace.role}`, async () => {
        let rows = null;
        const log = fresh(who, { vaccine_reminders: () => ({ today: '2026-11-12', can_mark: false, items: [] }), weigh_tickets: () => clone(F.weigh_tickets_awaiting) });
        await mount('/', current.h(current.Reminders, { compact: true, onCount: (n) => (rows = n) }));
        t.same(
          [byAction('today-tickets').length, href(byAction('today-tickets')[0]) ?? null, textOf('today-tickets'), rows, named(log, 'weigh_tickets')],
          expected ? [1, '/halls/tickets?status=awaiting&back=/', 'تذاكر وزن بانتظار الفاتورة: 1', 1, [{ p_from: null, p_to: null, p_status: 'awaiting' }]] : [0, null, null, 0, []],
          `R «تذاكر وزن بانتظار الفاتورة» ${expected ? 'لمن يصدر الفاتورة، ويُعدّ شغلاً' : 'لا تُقرأ لعامل القاعة'}`,
        );
      });
    }

    // ── H: صفحة «التقارير» ──────────────────────────────────────────────────────────────────────────────────────────────
    await step('H التقارير', async () => {
      fresh(OWNER);
      await mount('/reports');
      t.same([href(byAction('reports-tickets')[0]), textOf('reports-tickets')?.startsWith('تذاكر الوزن')], ['/halls/tickets?back=/reports', true], 'H «تذاكر الوزن» في صفحة «التقارير» برجوع إليها');
    });

    // ── Q: مراجعة 0028 للشاشات (كلّ فحص يفشل على ba04e1d)، بأجوبة القاعدة الحقيقية (fixtures/birds-0028.json) ─────────────────────────────────────
    const B = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'birds-0028.json'), 'utf8'));
    const BOPT = B.weigh_ticket_options_site;
    const BSITE = BOPT.site.site_id;
    const BH1 = BOPT.halls[0].hall_id;
    const BDRAFT = B.weigh_ticket_draft;
    /** المسوّدة نفسها مكتملةً في الخادم (رقمها، ونسختها بعد «أكمل» +1 كما يكتبها الخادم). */
    const doneOf = (draft) => ({ ...clone(draft), status: 'done', ticket_no: 'WT-2026-0099', version: draft.version + 1, can: { edit: false, finish: false, void: false, invoice: false } });
    /** مفاتيح الجهاز لتذكرة: نسختها، ومؤشّر «تذكرة جديدة» لحقلها. */
    const deviceKeys = (id, site) => [...local.map.keys()].filter((key) => key.endsWith(`:${id}`) || key.endsWith(`:new:${site}`));
    /** خادم الحذف: المسوّدة هناك إن وصل حفظها (arrived)، وvoid_weigh_ticket كقاعدته (ticket_not_found لما لم يصل). والأخطاء من حزمة الصفحة الجارية (current). */
    const deleteServer = (arrived) => {
      const tickets = new Map();
      return {
        tickets,
        rpcs: {
          weigh_ticket_options: () => clone(BOPT),
          save_weigh_ticket: (args) => {
            if (arrived) tickets.set(args.p_ticket, 'draft');
            return Promise.reject(new current.UnknownOutcomeError('fetch_failed'));
          },
          void_weigh_ticket: (args) => {
            if (!tickets.has(args.p_ticket)) return Promise.reject(new current.RejectedError('ticket_not_found', 'هذه التذكرة غير موجودة في منشأتك. حدّث الشاشة.'));
            tickets.set(args.p_ticket, 'void');
            return { id: args.p_ticket, ticket_no: null, status: 'void' };
          },
        },
      };
    };
    for (const arrived of [true, false]) {
      await step(`Q S2 أوّل حفظ بنتيجة مجهولة (${arrived ? 'وصل' : 'لم يصل'}) ثمّ إعادة التحميل و«احذف المسوّدة»`, async () => {
        const server = deleteServer(arrived);
        const log = fresh(WORKER, server.rpcs);
        await mount(`/halls/ticket/new?site=${BSITE}&hall=${BH1}&back=${encodeURIComponent('/broiler')}`);
        type(inStop(byAction('ticket-stop')[0]?.getAttribute('data-stop'), 'ticket-birds'), '800');
        await settle();
        await click(byAction('ticket-weigh-empty')[0]);
        await padType('7000');
        const id = named(log, 'save_weigh_ticket')[0]?.p_ticket ?? null;
        const copy = JSON.parse(local.map.get(deviceKeys(id, BSITE).find((key) => key.endsWith(`:${id}`))) ?? 'null');
        // إعادة التحميل: «أُرسل ولم تُعرف نتيجته» من نسخة الجهاز، لا من ذاكرة المكوّن.
        await unmount();
        current = await bundle('halls-tickets');
        const log2 = fresh(WORKER, server.rpcs);
        await mount(`/halls/ticket/new?site=${BSITE}&hall=${BH1}&back=${encodeURIComponent('/broiler')}`);
        await click(byAction('ticket-delete')[0]);
        const consequence = dialog()?.textContent ?? '';
        await click(byAction('ticket-delete-confirm')[0]);
        await settle(20);
        t.same(
          [
            UUID.test(id ?? ''),
            copy?.sent ?? null,
            consequence.includes('أُرسل حفظ هذه التذكرة ولا نعرف إن وصل إلى الخادم: تُلغى مسوّدتها فيه إن كانت وصلت، وتُمحى الأوزان المكتوبة في هذا الجهاز. الطيور في القاعات كما هي.'),
            consequence.includes('ولم يُحفظ منها شيء في الخادم'),
            named(log2, 'void_weigh_ticket').map((args) => [args.p_ticket, args.p_reason, UUID.test(args.p_client_ref ?? '')]),
            [...server.tickets.values()],
            globalThis.__h8.location,
            lastToast(),
            deviceKeys(id, BSITE),
          ],
          [true, true, true, false, [[id, null, true]], arrived ? ['void'] : [], '/broiler', 'حُذفت مسوّدة التذكرة.', []],
          `Q S2 أوّل حفظ لتذكرة جديدة نتيجته مجهولة (${arrived ? 'ووصل الخادم' : 'ولم يصله'}): نسخة الجهاز تحفظ العلامة، و«احذف المسوّدة» بعد إعادة التحميل يقول ما يحدث ويلغي مسوّدة الخادم (ticket_not_found = لم يصل شيء)، ثمّ تُمحى نسخة الجهاز ويُرجع (كان يمحو الجهاز وحده ويقول «لم يُحفظ منها شيء في الخادم»)`,
        );
      });
    }
    await step('Q S3 رفض ticket_not_draft: تُقرأ التذكرة فتُعرض مكتملةً، وما كُتب ولم يُحفظ معروض بأرقامه ويُمحى بتأكيد', async () => {
      const log = fresh(WORKER, {
        weigh_ticket: (_args, n) => (n === 1 ? clone(BDRAFT) : doneOf(BDRAFT)),
        weigh_ticket_options: () => clone(BOPT),
        save_weigh_ticket: () => Promise.reject(new m.RejectedError('ticket_not_draft', 'التذكرة WT-2026-0099 اكتملت أو أُلغيت، فلا تُعدَّل. ألغِها وأنشئ غيرها إن كانت خاطئة.')),
      });
      await mount(`/halls/ticket/${BDRAFT.id}`);
      await click(within(byAction('ticket-stop')[0], 'ticket-weigh-gross')[0]);
      await padType('7400');
      await settle(20);
      const shown = [named(log, 'save_weigh_ticket').length, named(log, 'weigh_ticket').length, byAction('ticket-editor').length, byAction('ticket-done').length, tableRows('ما كُتب في هذا الجهاز'), textOf('ticket-unsaved-head')];
      await click(byAction('ticket-wipe')[0]);
      const confirm = dialog()?.textContent ?? '';
      await click(byAction('ticket-wipe-confirm')[0]);
      t.same(
        [shown, confirm.includes('امحُ ما كُتب في هذا الجهاز للتذكرة WT-2026-0099؟') && confirm.includes('تُمحى الأوزان المكتوبة في هذا الجهاز ولا تُستعاد. التذكرة في الخادم كما هي.'), byAction('ticket-unsaved').length, deviceKeys(BDRAFT.id, BDRAFT.site_id)],
        [[1, 2, 0, 1, [['قاعة 6', '100', '10', '7,400']], 'ما كتبته في هذا الجهاز — يوم 12/11/2026، ووزن الفارغ 7,000'], true, 0, []],
        'Q S3 أُكملت من جهاز آخر وهذا الجهاز يحفظ وزنة: الرفض يعيد القراءة فتُعرض مكتملةً (كان المحرّر باقياً بنسخة لا تُحفظ أبداً)، وما كُتب معروض بأرقامه، و«امحُ ما في هذا الجهاز» بتأكيد يمحوه',
      );
    });
    await step('Q S3 بعد إعادة التحميل والتذكرة أُكملت من جهاز آخر: ما في الجهاز لا يضيع صامتاً', async () => {
      fresh(WORKER, { weigh_ticket: () => clone(BDRAFT), weigh_ticket_options: () => clone(BOPT), save_weigh_ticket: () => Promise.reject(new m.NetworkError()) });
      await mount(`/halls/ticket/${BDRAFT.id}`);
      type(inStop(BDRAFT.stops[0].id, 'ticket-birds'), '120');
      await settle();
      const state = textOf('ticket-state');
      await unmount();
      current = await bundle('halls-tickets');
      fresh(WORKER, { weigh_ticket: () => doneOf(BDRAFT) });
      await mount(`/halls/ticket/${BDRAFT.id}`);
      const shown = [byAction('ticket-done').length, textOf('ticket-paper-title'), byAction('ticket-unsaved').length, tableRows('ما كُتب في هذا الجهاز'), deviceKeys(BDRAFT.id, BDRAFT.site_id).length];
      await click(byAction('ticket-wipe')[0]);
      await click(byAction('ticket-wipe-confirm')[0]);
      t.same(
        [state, shown, byAction('ticket-unsaved').length, deviceKeys(BDRAFT.id, BDRAFT.site_id)],
        ['فيها ما لم يُحفظ بعد (محفوظ في هذا الجهاز).', [1, 'تذكرة وزن WT-2026-0099', 1, [['قاعة 6', '120', '10', '7,310']], 1], 0, []],
        'Q S3 مسوّدة بما لم يُحفظ في الجهاز ثمّ أُكملت في الخادم: الورقة المكتملة ومعها ما في الجهاز بأرقامه (كان يبقى في الجهاز بلا ذكر)، ويُمحى بـ«امحُ ما في هذا الجهاز»',
      );
    });
    await step('Q S4 ما وُزن يوم 12/11 ولم يُحفظ يُحفظ بيوم وزنه لا بيوم الفتح التالي', async () => {
      fresh(WORKER, { weigh_ticket_options: () => ({ ...clone(BOPT), today: '2026-11-12' }), save_weigh_ticket: () => Promise.reject(new m.NetworkError()) });
      await mount(`/halls/ticket/new?site=${BSITE}&hall=${BH1}`);
      const stopId = byAction('ticket-stop')[0]?.getAttribute('data-stop');
      type(inStop(stopId, 'ticket-birds'), '800');
      await settle();
      const before = byAction('ticket-day')[0]?.value ?? null;
      await click(byAction('ticket-weigh-empty')[0]);
      await padType('7000');
      const fixed = byAction('ticket-day')[0]?.value ?? null;
      await click(inStop(stopId, 'ticket-weigh-gross'));
      await padType('9000');
      await unmount();
      // صباح اليوم التالي: يوم الخادم 13/11، والنسخة تعود من الجهاز.
      current = await bundle('halls-tickets');
      const log = fresh(WORKER, { weigh_ticket_options: () => ({ ...clone(BOPT), today: '2026-11-13' }), save_weigh_ticket: (args) => ({ status: 'saved', ticket: { ...clone(B.save_weigh_ticket.ticket), id: args.p_ticket, on_date: args.p_data.on_date } }) });
      await mount(`/halls/ticket/new?site=${BSITE}&hall=${BH1}`);
      const restored = [inStop(byAction('ticket-stop')[0]?.getAttribute('data-stop'), 'ticket-birds')?.value ?? null, byAction('ticket-day')[0]?.value ?? null];
      await click(byAction('ticket-save')[0]);
      await settle(20);
      t.same(
        [before, fixed, restored, named(log, 'save_weigh_ticket').map((args) => args.p_data.on_date)],
        ['', '12/11/2026', ['800', '12/11/2026'], ['2026-11-12']],
        'Q S4 اليوم يُثبَّت عند أوّل وزنة تُعتمد بيوم الخادم (12/11) ويبقى في نسخة الجهاز، فما لم يُحفظ ليلاً يُحفظ صباح 13/11 بيوم وزنه (كان بيوم الفتح 13/11)',
      );
    });
    await step('Q S4 «تغيّرت» تعرض يومَي النسختين', async () => {
      const stale = B.save_weigh_ticket_stale;
      fresh(WORKER, { weigh_ticket: () => clone(BDRAFT), weigh_ticket_options: () => clone(BOPT), save_weigh_ticket: () => clone(stale) });
      await mount(`/halls/ticket/${BDRAFT.id}`);
      await click(within(byAction('ticket-stop')[0], 'ticket-weigh-gross')[0]);
      await padType('7400');
      t.same(
        [byAction('ticket-stale').length, textOf('ticket-stale-server'), textOf('ticket-stale-mine')],
        [1, `في الخادم — يوم ${m.fmtDay(stale.server.on_date)}، ووزن الفارغ 7,000`, 'ما كتبته — يوم 12/11/2026، ووزن الفارغ 7,000'],
        'Q S4 نسخة الخادم ونسختك كلٌّ بيومها (11/11 و12/11) فوق جدوليهما',
      );
    });
    await step('Q S6 صيغة المعدود في بطاقة الفوج والتذكرة', async () => {
      const sales = B.flock_sales;
      fresh(OWNER, { flock_sales: () => clone(sales) });
      await mount('/broiler/flock/x', current.h(current.FlockCard, { flock: { id: sales.flock_id, kind: sales.kind, siteId: 's', hallId: 'h', hallName: 'قاعة 1', siteName: 'حقل', status: sales.status } }));
      const sold = textOf('card-sold');
      await unmount();
      fresh(OWNER, { weigh_ticket: () => clone(BDRAFT), weigh_ticket_options: () => clone(BOPT) });
      await mount(`/halls/ticket/${BDRAFT.id}`);
      await click(byAction('ticket-finish')[0]);
      const title = all().find((n) => n.localName === 'h2' && dialog()?.contains(n))?.textContent ?? null;
      await click(buttonText('لا، تراجع'));
      type(inStop(BDRAFT.stops[0].id, 'ticket-birds'), '800');
      await settle();
      const over = textOf('ticket-over-live');
      t.same(
        [sold, title, over],
        [
          'المباع من الفواتير: 800 طير، صافيها 1,800 كغم. وعلى تذاكر بلا فاتورة 4,000 طير.',
          'أكمل التذكرة: 100 طير، و250 كغم صافياً؟',
          'الحيّ في «قاعة 6» بحسب النظام 700 طير، وعلى تذاكر أخرى بلا فاتورة 150 طيراً. لا تصدر الفاتورة بأكثر من الحيّ حتى يُصحَّح العدد أو يُسجَّل «فرق العدّ».',
        ],
        'Q S6 الطيور بصيغة المعدود في المباع والتذاكر بلا فاتورة، وتأكيد «أكمل التذكرة»، وتنبيه الحيّ (كانت «طيراً» لكلّ عدد)',
      );
    });

    // ── X: أجوبة القاعدة الحقيقية (حين توجد) ────────────────────────────────────────────────────────────────────────────
    const samplesPath = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'birds-0028.json');
    if (existsSync(samplesPath)) {
      const X = JSON.parse(readFileSync(samplesPath, 'utf8'));
      const parsers = { weigh_ticket: m.tickets.parseWeighTicket, weigh_ticket_options: m.tickets.parseTicketOptions, weigh_tickets: m.tickets.parseTicketList, flock_sales: m.close.parseFlockSales };
      for (const [key, value] of Object.entries(X)) {
        // أطول بادئة أوّلاً: weigh_ticket_options_site بمحلّل الخيارات لا بمحلّل التذكرة (weigh_ticket بادئة أقصر منها).
        const parse = Object.entries(parsers).sort(([a], [b]) => b.length - a.length).find(([prefix]) => key === prefix || key.startsWith(`${prefix}_`))?.[1];
        if (!parse) continue;
        let error = null;
        try {
          parse(clone(value));
        } catch (problem) {
          error = problem?.field ?? String(problem);
        }
        t.eq(error, null, `X ${key} بالمحلّل الحقيقي`);
      }
    }
  } finally {
    if (root) current.flushSync(() => root.unmount());
    body().textContent = '';
    for (const [name, descriptor] of [['sessionStorage', saved.session], ['localStorage', saved.local]]) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    delete globalThis.__h8;
    restore();
  }
}
