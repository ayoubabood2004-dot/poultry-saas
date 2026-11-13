// «أغلق الدورة» وتقرير الدورة المغلقة (0028، الوكيل أ؛ عقد scratchpad/reports/contract-0028.md §4.7–§4.9 و§5.6 و§6 و§10): react-dom الحقيقي على DOM
// صغير يشغّل صفحة الإغلاق وتقرير الدورة الحقيقيين (HallsRoutes) على core بديل يجيب بأجوبة العقد (fixtures/halls-close-contract.json).
// P المحلّلات وبناء النداء: نموذج الإغلاق ونتيجته (المال لأدوار الكلفة وحدها)، ووسائط close_flock بمفاتيح العقد، ومفاتيح 0028 في تقرير الدورة
//   (والخادم قبلها null لا صفر).
// C صفحة الإغلاق: خلاصة الطيور من الفواتير، و«فرق العدّ» = −الحيّ بسبب إلزاميّ، ويوم الإغلاق بحدّيه، وتقدير العلف، ولكلّ مادّة باقيها ومصيرها
//   ومخزنها، والتأكيد يسمّي النتيجة كلّها، والنداء بما عرضته الشاشة شرطاً (الحيّ والمباع وما نزل لكلّ مادّة)، ثمّ التقرير؛ والتذاكر بلا فاتورة
//   تمنع؛ والرفض الأكيد يعيد القراءة ويُبقي ما كُتب بمرجع جديد؛ والنتيجة المجهولة تجمّد الصفحة خارج المكوّن (بعد إعادة التحميل أيضاً).
// R تقرير الدورة: المؤشّرات النهائيّة وأسبابها، والبيع، والإغلاق بمصير كلّ باقٍ ومستنده، و«أعد فتح الدورة» (المدير، وتأكيده يسمّي مستندات الإرجاع)،
//   و«أرجعه إلى مخزن» للعلف المنقول المعلَّق، والمال (الإيراد والراجع والمنقول) لأدوار الكلفة وحدها، والمنقول من الدورة السابقة.
// X أجوبة القاعدة الحقيقية (fixtures/birds-0028.json) بالمحلّلات الحقيقية، حين توجد.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { installDom, settle } from './dom.mjs';
import { all, body, bundle, byAction, clone, click, dialog, disabled, F, href, LRI, memoryStorage, PDI, ROOT, select, selected, sessionOf, tableFoot, tableRows, text, textOf, type, UUID, withAttr, within } from './halls-0028-kit.mjs';

const FORM = F.flock_close_form;
const F1 = FORM.flock.id;
const [I1, I2, I3] = FORM.items.map((item) => item.item_id);
const WH_FEED = FORM.items[0].stores[0].warehouse_id;
const RESULT = F.close_result;
const REPORT = F.flock_cycle_report_closed;
const OWNER = sessionOf('owner');
const MANAGER = sessionOf('manager');
const WORKER = sessionOf('hall_worker');

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
  try {
    m = await bundle('halls-close');
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
    const mount = async (url, mm = current) => {
      const container = globalThis.document.createElement('div');
      body().appendChild(container);
      root = mm.createRoot(container);
      function Where() {
        const location = mm.useLocation();
        globalThis.__h8.location = `${location.pathname}${location.search}`;
        return mm.h(mm.Routes, null, mm.h(mm.Route, { path: '/halls/*', element: mm.h(mm.HallsRoutes) }), mm.h(mm.Route, { path: '*', element: null }));
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
      for (const role of ['owner', 'manager', 'hall_worker']) m.storePending(m.pendingKey(`u-${role}:org-1`, `close:${F1}`), null);
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
      current = m;
    };

    // ── P: المحلّلات ───────────────────────────────────────────────────────────────────────────────────────────────────
    {
      const form = m.close.parseCloseForm(clone(FORM));
      t.same(
        [form.flock.live, form.flock.dead, form.sales.birds, form.sales.netKg, form.sales.avgKg, form.items.map((i) => [i.name, i.baseUnit, i.poolQty, i.poolKg, i.carryInQty, i.stores.length, i.defaultStore, i.poolValue]), form.carryIn.length, form.canClose],
        [30, 270, 9700, 23_280_000n, 2400n, [['علف بادئ', 'kg', 3_000_000n, 3_000_000n, 0n, 1, WH_FEED, 208_373_869n], ['علف نامي', 'kg', 2_000_000n, 2_000_000n, 500_000n, 2, WH_FEED, 138_915_913n], ['فيتامين سائل', 'L', 5000n, null, 0n, 1, null, 7_500_000n]], 1, true],
        'P نموذج الإغلاق: الحيّ والمباع من الفواتير، وما نزل لكلّ مادّة بوحدتها وكيلوه (null للتر بلا كثافة) ومخازنها، والقيمة لأدوار الكلفة',
      );
      const noMoney = clone(FORM);
      for (const item of noMoney.items) delete item.money;
      t.same(m.close.parseCloseForm(noMoney).items.map((i) => i.poolValue), [null, null, null], 'P بلا مال: الغياب قناع لا خطأ');
      const result = m.close.parseCloseResult(clone(RESULT));
      t.same(
        [result.countDiff, result.countReason, result.lines.map((l) => [l.action, l.qty, l.warehouseName, l.returnDocNo, l.carryStatus, l.value]), result.money],
        [-30, 'طيور هربت عند التحميل', [['return', 500_000n, 'رصيد العلف', 'FR-2026-0001', null, 34_728_978n], ['carry', 200_000n, null, null, 'pending', 13_891_591n], ['consumed', 2000n, null, null, null, null]], { costTotal: 2_390_129_344n, returnedValue: 34_728_978n, carriedValue: 13_891_591n, revenue: 5_587_200_000n }],
        'P نتيجة الإغلاق: فرق العدّ وسببه، ومصير كلّ سطر وقيمته (G5: 500 كغم من 3,000 بـ2,083,738.69 ← 347,289.78)',
      );
      const args = m.close.closeArgs({ clientRef: 'r', closeId: 'c', flockId: F1, on: '2026-11-12', expectedLive: 30, expectedSold: 9700, expectedPools: [{ itemId: I1, qty: 3_000_000n }], countReason: '  هروب ', lines: [{ itemId: I1, qty: 500_000n, action: 'return', warehouseId: WH_FEED }, { itemId: I2, qty: 200_000n, action: 'carry', warehouseId: WH_FEED }], note: '   ' });
      t.same(
        args,
        { p_client_ref: 'r', p_close_id: 'c', p_flock: F1, p_on: '2026-11-12', p_expected_live: 30, p_expected_sold: 9700, p_expected_pools: [{ item_id: I1, qty: '3000.000' }], p_count_reason: 'هروب', p_lines: [{ item_id: I1, qty: '500.000', action: 'return', warehouse_id: WH_FEED }, { item_id: I2, qty: '200.000', action: 'carry' }], p_note: null },
        'P وسائط close_flock بمفاتيح العقد: الكمية نصّاً، والمخزن للإرجاع وحده، والنصّ مقصوصاً أو null',
      );
      const report = m.halls.parseCycleReport(clone(REPORT));
      t.same(
        [report.birds.sold, report.birds.countDiff, report.birds.countReason, report.cycle.kpis.soldBirds, report.cycle.kpis.saleAge, report.cycle.kpis.fcrFinal, report.cycle.kpis.epefFinal, report.cycle.days.at(-1).sold, report.cycle.days.at(-1).adjust, report.sales.pendingBirds, report.close.lines.map((l) => l.stores.length), report.close.money, report.money.revenue, report.money.carriedOut],
        [980, -7, 'طيور هربت', 980, 110n, 694n, 3232n, 980, -7, 0, [0, 2, 0], null, 673_750_000n, -13_891_591n],
        'P تقرير الدورة بمفاتيح 0028: المباع وفرق العدّ وسببه، والمؤشّرات النهائيّة، ويوم البيع، والإغلاق بلا مال ومخازن العلف المنقول، والإيراد',
      );
      const old = m.halls.parseCycleReport(clone(F.flock_cycle_report_open));
      const before = clone(REPORT);
      for (const key of ['sales', 'close', 'carry_in']) delete before[key];
      for (const key of ['sold', 'sold_net_kg', 'count_diff', 'count_reason']) delete before.birds[key];
      const parsedBefore = m.halls.parseCycleReport(before);
      t.same([old.carryIn.map((c) => c.qty), parsedBefore.sales, parsedBefore.close, parsedBefore.carryIn, parsedBefore.birds.sold], [[200_000n], null, null, [], null], 'P خادم قبل 0028: لا بيع ولا إغلاق ولا منقول (null وفارغ لا صفر)، والمنقول إلى دورة قائمة يُقرأ');
    }

    const formRpcs = (over = {}) => ({ flock_close_form: () => clone(FORM), close_flock: () => clone(RESULT), flock_cycle_report: () => clone(REPORT), ...over });
    const qty = (item) => withAttr('close-qty', 'data-item', item);
    const action = (item, value) => within(withAttr('close-actions', 'data-item', item), 'close-action').find((n) => n.getAttribute('data-value') === value) ?? null;
    const store = (item) => withAttr('close-store', 'data-item', item);
    /** الباقي: 500 كغم بادئ يرجع إلى «رصيد العلف»، و200 كغم نامي للدورة التالية، ولتران فيتامين مستهلَكان. */
    const fillLines = async () => {
      type(qty(I1), '500');
      type(qty(I2), '200');
      type(qty(I3), '2');
      await settle();
      await click(action(I1, 'return'));
      await click(action(I2, 'carry'));
      await click(action(I3, 'consumed'));
    };

    // ── C: صفحة الإغلاق ───────────────────────────────────────────────────────────────────────────────────────────────
    await step('C الإغلاق', async () => {
      const log = fresh(MANAGER, formRpcs());
      await mount(`/halls/close/${F1}?back=${encodeURIComponent(`/broiler/flock/${F1}`)}`);
      t.same(
        [textOf('close-title'), text().includes('صافيه 23,280 كغم، ومعدّل الطير 2.400 كغم'), textOf('close-count-diff'), byAction('close-day-input')[0]?.value, textOf('close-estimate')],
        [
          'أغلق دورة «قاعة 1»',
          true,
          `في القاعة بحسب النظام 30 طيراً لم تُبَع ولم تُسجَّل نافقة: يُكتب مع الإغلاق «فرق العدّ» ${LRI}-30${PDI} بسبب، ويظهر وحده لا مع النافق.`,
          '12/11/2026',
          'النازل للقاعة 40,000 كغم، والمأكول المسجّل 38,412 كغم، فالمتوقّع في القاعة 1,588 كغم.',
        ],
        'C الخلاصة: المباع من الفواتير بصافيه، وفرق العدّ −الحيّ بإشارته معزولة، ويوم الإغلاق المقترح، وتقدير العلف',
      );
      t.same(tableRows('ما نزل للقاعة وباقيه')?.map((row) => row.slice(0, 2)), [['علف بادئ', '3,000 كغم'], ['علف نامي' + 'منه من الدورة السابقة 500 كغم', '2,000 كغم'], ['فيتامين سائل', '5 لترات']], 'C ما نزل لكلّ مادّة بوحدتها، والمنقول إليها من الدورة السابقة');
      t.same([disabled(byAction('close-go')[0]), textOf('close-missing')], [true, 'لتُغلق الدورة: اكتب سبب «فرق العدّ».'], 'C بلا سبب لفرق العدّ: لا إغلاق، والجملة تقول لماذا');
      type(byAction('close-reason')[0], 'طيور هربت عند التحميل');
      await fillLines();
      t.same([selected(store(I1)), store(I2), disabled(byAction('close-go')[0])], [WH_FEED, null, false], 'C الإرجاع بمخزنه الافتراضيّ، والنقل والمستهلَك بلا مخزن، والإغلاق متاح');
      await click(byAction('close-go')[0]);
      t.same(
        textOf('close-confirm-text'),
        `تُغلق دورة «قاعة 1» يوم 12/11/2026، ويُكتب فرق العدّ ${LRI}-30${PDI}، ويرجع 500 كغم «علف بادئ» إلى «رصيد العلف»، ويُنقل 200 كغم «علف نامي» للدورة التالية في القاعة، ويُحسب لتران «فيتامين سائل» مستهلَكاً. لا يُسجَّل على الفوج شيء بعد الإغلاق.`,
        'C التأكيد يسمّي النتيجة كلّها (العقد §10)',
      );
      await click(byAction('close-confirm')[0]);
      await settle(30);
      const sent = named(log, 'close_flock');
      t.same(
        [sent.length, { ...sent[0], p_client_ref: UUID.test(sent[0]?.p_client_ref ?? ''), p_close_id: UUID.test(sent[0]?.p_close_id ?? '') }],
        [
          1,
          {
            p_client_ref: true,
            p_close_id: true,
            p_flock: F1,
            p_on: '2026-11-12',
            p_expected_live: 30,
            p_expected_sold: 9700,
            p_expected_pools: [{ item_id: I1, qty: '3000.000' }, { item_id: I2, qty: '2000.000' }, { item_id: I3, qty: '5.000' }],
            p_count_reason: 'طيور هربت عند التحميل',
            p_lines: [{ item_id: I1, qty: '500.000', action: 'return', warehouse_id: WH_FEED }, { item_id: I2, qty: '200.000', action: 'carry' }, { item_id: I3, qty: '2.000', action: 'consumed' }],
            p_note: null,
          },
        ],
        'C close_flock نداء واحد بمرجعه ومعرّفه، وما عرضته الشاشة شرطاً: الحيّ 30 والمباع 9,700 وما نزل لكلّ مادّة (D8)',
      );
      t.same([lastToast(), globalThis.__h8.location], ['أُغلقت دورة «قاعة 1» يوم 12/11/2026.', `/halls/report/${F1}?back=%2Fbroiler%2Fflock%2F${F1}`], 'C بعد الإغلاق: تقرير الدورة برجوع الصفحة');
    });
    await step('C التحقّق قبل الإرسال', async () => {
      fresh(MANAGER, formRpcs());
      await mount(`/halls/close/${F1}`);
      type(byAction('close-reason')[0], 'هروب');
      type(qty(I1), '3500');
      type(qty(I2), '10');
      await settle();
      t.same(
        [text().includes('الباقي المكتوب من «علف بادئ» أكثر ممّا نزل للقاعة (3,000 كغم).'), text().includes('اختر مصير باقي «علف نامي».'), disabled(byAction('close-go')[0])],
        [true, true, true],
        'C الباقي أكثر ممّا نزل، ومادّة بلا مصير: جملتان ولا إغلاق',
      );
      type(qty(I1), '');
      await click(action(I2, 'return'));
      select(store(I2), '');
      await settle();
      t.ok(text().includes('اختر المخزن الذي يرجع إليه «علف نامي».'), 'C الإرجاع بلا مخزن: جملة');
      type(qty(I3), '1');
      await settle();
      await click(action(I3, 'return'));
      t.same([within(store(I3), 'x').length, store(I3)?.options.filter((o) => o.hasAttribute('disabled')).map((o) => o.textContent)], [0, ['المخزن العامّ (مؤرشف)']], 'C مخزن مؤرشف يُعرض بسببه ولا يُختار');
      type(byAction('close-day-input')[0], '13/11/2026');
      await settle();
      t.ok(!text().includes('التاريخ بعد اليوم.'), 'C يوم الخادم (13/11) مقبول');
      type(byAction('close-day-input')[0], '14/11/2026');
      await settle();
      t.ok(text().includes('التاريخ بعد اليوم.'), 'C يوم بعد يوم الخادم: جملة');
      type(byAction('close-day-input')[0], '11/11/2026');
      await settle();
      t.ok(text().includes('أقدم يوم يُقبل للإغلاق 12/11/2026'), 'C قبل أقدم يوم: جملة بحدّه');
    });
    await step('C التذاكر بلا فاتورة', async () => {
      fresh(MANAGER, formRpcs({ flock_close_form: () => ({ ...clone(FORM), pending_tickets: [{ ticket_id: F.weigh_ticket_done.id, ticket_no: 'WT-2026-0009', status: 'done', on_date: '2026-11-12', birds: 500 }, { ticket_id: F.weigh_ticket_draft.id, ticket_no: null, status: 'draft', on_date: '2026-11-12', birds: null }] }) }));
      await mount(`/halls/close/${F1}`);
      type(byAction('close-reason')[0], 'هروب');
      await settle();
      const links = byAction('close-pending-ticket');
      t.same(
        [links.map((n) => n.textContent), href(links[0])?.startsWith(`/halls/ticket/${F.weigh_ticket_done.id}?back=`), disabled(byAction('close-go')[0]), textOf('close-missing')],
        [['WT-2026-0009 (12/11/2026)', 'مسوّدة (12/11/2026)'], true, true, 'لتُغلق الدورة: تُصدر فواتير التذاكر أو تُلغى أوّلاً.'],
        'C تذاكر بلا فاتورة تمنع الإغلاق بروابطها (برجوع إلى الإغلاق)',
      );
    });
    await step('C الرفض الأكيد', async () => {
      const log = fresh(MANAGER, formRpcs({ close_flock: () => Promise.reject(new m.RejectedError('pool_changed', 'تغيّر ما نزل للقاعة منذ فتحت الشاشة («علف بادئ»: كان 3,000 كغم وصار 3,500 كغم). حدّث الشاشة وراجع الباقي.')) }));
      await mount(`/halls/close/${F1}`);
      type(byAction('close-reason')[0], 'هروب');
      await fillLines();
      await click(byAction('close-go')[0]);
      await click(byAction('close-confirm')[0]);
      await settle(30);
      t.same(
        [text().includes('تغيّر ما نزل للقاعة منذ فتحت الشاشة («علف بادئ»'), named(log, 'flock_close_form').length, qty(I1)?.value, byAction('close-frozen').length],
        [true, 2, '500', 0],
        'C رفض أكيد: جملة الخادم، والنموذج يُقرأ من جديد وما كُتب باقٍ، ولا تجميد',
      );
      await click(byAction('close-go')[0]);
      await click(byAction('close-confirm')[0]);
      await settle(30);
      const sent = named(log, 'close_flock');
      t.same([sent.length, sent[1]?.p_client_ref !== sent[0]?.p_client_ref, sent[1]?.p_close_id === sent[0]?.p_close_id], [2, true, true], 'C بعد الرفض الأكيد: مرجع جديد والمعرّف نفسه');
    });
    await step('C النتيجة المجهولة', async () => {
      const log = fresh(MANAGER, formRpcs({ close_flock: () => Promise.reject(new m.UnknownOutcomeError()) }));
      await mount(`/halls/close/${F1}`);
      type(byAction('close-reason')[0], 'هروب');
      await fillLines();
      await click(byAction('close-go')[0]);
      await click(byAction('close-confirm')[0]);
      await settle(30);
      t.same([byAction('close-frozen').length, tableRows('ما أُرسل')?.length], [1, 3], 'C نتيجة مجهولة: الصفحة مجمَّدة بما أُرسل');
      await unmount();
      current = await bundle('halls-close');
      const log2 = fresh(MANAGER, formRpcs());
      await mount(`/halls/close/${F1}`);
      t.same([byAction('close-frozen').length, tableRows('ما أُرسل')?.map((row) => row[0])], [1, ['علف بادئ', 'علف نامي', 'فيتامين سائل']], 'C بعد إعادة التحميل: مجمَّدة بالطلب من sessionStorage');
      await click(byAction('close-retry')[0]);
      await settle(30);
      const first = named(log, 'close_flock')[0];
      const again = named(log2, 'close_flock');
      t.same([again.length, JSON.stringify(again[0]) === JSON.stringify(first), globalThis.__h8.location], [1, true, `/halls/report/${F1}?back=%2Fbroiler%2Fflock%2F${F1}`], 'C «أعد المحاولة» بالطلب نفسه حرفاً (المرجع والمعرّف والكميات)، ثمّ التقرير');
    });
    await step('C لا يُغلق', async () => {
      fresh(MANAGER, formRpcs({ flock_close_form: () => ({ ...clone(FORM), can_close: false, why_not: 'close_layer_later' }) }));
      await mount(`/halls/close/${F1}`);
      t.same([text().includes('إغلاق دورة البيّاض يأتي مع بيع الدجاج المستبعد.'), disabled(byAction('close-go')[0])], [true, true], 'C ما لا يُغلق: سببه بجملة ولا زرّ');
    });
    await step('C بلا فرق عدّ', async () => {
      fresh(MANAGER, formRpcs({ flock_close_form: () => ({ ...clone(FORM), flock: { ...clone(FORM.flock), live: 0 } }) }));
      await mount(`/halls/close/${F1}`);
      t.same([byAction('close-reason').length, textOf('close-no-diff'), disabled(byAction('close-go')[0])], [0, 'لا فرق عدّ: كلّ الطيور بيعت أو سُجّلت نافقة أو مستبعدة.', false], 'C الحيّ صفر: لا سبب ولا فرق، والإغلاق بلا باقٍ متاح');
    });

    // ── R: تقرير الدورة المغلقة ──────────────────────────────────────────────────────────────────────────────────────
    const kpi = (key) => {
      const label = all().find((n) => n.getAttribute('data-action') === 'kpi-label' && n.getAttribute('data-key') === key);
      const value = all().find((n) => n.getAttribute('data-action') === 'kpi-value' && n.getAttribute('data-key') === key);
      const note = all().find((n) => (n.getAttribute('data-action') === 'kpi-note' || n.getAttribute('data-action') === 'kpi-reason') && n.getAttribute('data-key') === key);
      return label ? [label.textContent, value?.textContent ?? null, note?.textContent ?? null] : null;
    };
    await step('R المغلقة للمدير', async () => {
      const log = fresh(MANAGER, formRpcs({ reopen_flock: () => clone(F.reopen_result), return_hall_carry: () => clone(F.return_carry_result) }));
      await mount(`/halls/report/${F1}`);
      t.same(
        [kpi('sold'), kpi('sold_avg'), kpi('sale_age'), kpi('count_diff'), kpi('feed_out'), kpi('feed_net'), kpi('fcr_final'), kpi('epef_final')],
        [
          ['المباع (طير)', '980', 'من الفواتير المرحّلة؛ والطيور تخرج من القاعة عند الفاتورة.'],
          ['معدّل وزن البيع (كغم)', '2.500', 'صافي المباع ÷ عدد طيوره.'],
          ['عمر البيع (يوم)', '11.0', 'مرجَّحاً بعدد الطيور في كلّ يوم بيع.'],
          ['فرق العدّ', `${LRI}-7${PDI}`, 'السبب: طيور هربت. يظهر وحده لا مع النافق.'],
          ['العلف الخارج عند الإغلاق (كغم)', '300', 'ما رجع إلى المخازن وما نُقل للدورة التالية.'],
          ['صافي العلف (كغم)', '1,700', 'النازل للقاعة ناقص الخارج عند الإغلاق.'],
          ['معامل التحويل النهائيّ', '0.694', 'صافي العلف ÷ صافي وزن المباع.'],
          ['مؤشّر الإنتاج النهائيّ (EPEF)', '3,232', 'الحيوية × معدّل وزن البيع ÷ (عمر البيع × معامل التحويل النهائيّ) × 100.'],
        ],
        'R المؤشّرات النهائيّة بملاحظاتها، وفرق العدّ بسببه وحده',
      );
      t.same(
        [textOf('rep-close-line'), textOf('rep-close-count'), tableRows('الباقي عند الإغلاق')?.map((row) => [row[0], row[1], row[4]]), tableRows('الطيور')?.[0]],
        [
          'أُغلقت يوم 11/11/2026. المباع من الفواتير 980 طيراً صافيها 2,450 كغم.',
          `فرق العدّ عند الإغلاق ${LRI}-7${PDI} (الحيّ قبله 7)، وسببه: طيور هربت`,
          [['علف بادئ', '500 كغم', 'FR-2026-0001'], ['علف نامي', '200 كغم', '—'], ['فيتامين سائل', 'لتران', '—']],
          ['1,000', '11', '2', '980', `${LRI}-7${PDI}`, '0', '1.30%'],
        ],
        'R الإغلاق: يومه والمباع، وفرق العدّ وسببه، وكلّ باقٍ ومستنده؛ وجدول الطيور بالمباع وفرق العدّ',
      );
      t.same(
        [tableRows('البيع')?.map((row) => row.slice(0, 6)), tableFoot('البيع')?.[0]?.slice(0, 5)],
        [[['WT-2026-0007', '11/11/2026', '980', '2,450', '2.500', 'صدرت فاتورتها']], ['المباع بالفواتير', '980', '2,450', '2.500', '']],
        'R البيع: التذاكر وفواتيرها، ومجموع المباع بالفواتير',
      );
      const days = tableRows('أيّام الدورة');
      t.same([days?.at(-1)?.slice(0, 7), days?.[0]?.[3], days?.[0]?.[4]], [['11/11/2026', '11', '987', '—', '—', '980', `${LRI}-7${PDI}`], '2', '0'], 'R جدول الأيّام بعمودي المباع وفرق العدّ يومهما');
      // «أرجعه إلى مخزن» للعلف المنقول المعلَّق.
      await click(byAction('carry-return')[0]);
      t.same([dialog()?.textContent.includes('أرجع «علف نامي» (200 كغم) إلى مخزن'), selected(byAction('carry-return-store')[0])], [true, WH_FEED], 'R «أرجعه إلى مخزن»: النافذة تسمّي المادّة وكميتها، والمخزن الوحيد المتاح مختار');
      await click(byAction('carry-return-go')[0]);
      await settle(30);
      const returned = named(log, 'return_hall_carry');
      t.same([returned.length, UUID.test(returned[0]?.p_client_ref ?? ''), UUID.test(returned[0]?.p_return_id ?? ''), returned[0]?.p_line, returned[0]?.p_warehouse, lastToast(), named(log, 'flock_cycle_report').length], [1, true, true, RESULT.lines[1].line_id, WH_FEED, 'أُرجع «علف نامي» إلى المخزن بالمستند FR-2026-0002.', 2], 'R الإرجاع نداء واحد بمرجعه ومعرّف الإرجاع، ثمّ يُقرأ التقرير');
      // «أعد فتح الدورة».
      await click(byAction('reopen-open')[0]);
      t.same([textOf('reopen-text'), disabled(byAction('reopen-go')[0])], ['تُلغى مستندات الإرجاع FR-2026-0001 ويعود العلف من المخزن إلى حساب القاعة، ويُلغى فرق العدّ، ويعود الفوج قائماً. والفواتير تبقى مرحّلة.', true], 'R «أعد فتح الدورة»: التأكيد يسمّي مستند الإرجاع وما يحدث، وبلا سبب مقفول');
      type(byAction('reopen-reason')[0], 'نسي الحقل قاعة');
      await settle();
      await click(byAction('reopen-go')[0]);
      await settle(30);
      const reopened = named(log, 'reopen_flock');
      t.same([reopened.length, reopened[0]?.p_close_id, reopened[0]?.p_reason, UUID.test(reopened[0]?.p_client_ref ?? ''), lastToast(), named(log, 'flock_cycle_report').length], [1, RESULT.id, 'نسي الحقل قاعة', true, 'أُعيد فتح دورة «قاعة 1».', 3], 'R إعادة الفتح بسببها ومرجعها، ثمّ يُقرأ التقرير');
    });
    await step('R أعد الفتح من البطاقة', async () => {
      fresh(OWNER, formRpcs());
      await mount(`/halls/report/${F1}?act=reopen&back=${encodeURIComponent(`/broiler/flock/${F1}`)}`);
      t.same([dialog()?.textContent.includes('أعد فتح دورة «قاعة 1» المغلقة يوم 11/11/2026؟'), tableRows('الإيراد والعلف الراجع والمنقول')], [true, [['إيراد فواتير الطيور', '6,737,500.00'], ['العلف الراجع إلى المخازن', '-347,289.78'], ['العلف المنقول للدورة التالية', '-138,915.91']]], 'R ?act=reopen يفتح نافذة إعادة الفتح أوّل الفتح، والمال (الإيراد والراجع والمنقول) لأدوار الكلفة');
    });
    await step('R لعامل القاعة', async () => {
      fresh(WORKER, formRpcs({ flock_cycle_report: () => clone(F.flock_cycle_report_closed_no_money) }));
      await mount(`/halls/report/${F1}?act=reopen`);
      t.same([byAction('reopen-open').length, byAction('carry-return').length, dialog(), tableRows('الإيراد والعلف الراجع والمنقول'), text().includes('معلَّق في القاعة للدورة التالية')], [0, 0, null, null, true], 'R عامل القاعة: الإغلاق يُقرأ بلا «أعد فتح» ولا «أرجعه»، ولا مال');
    });
    await step('R دورة قائمة بمفاتيح 0028', async () => {
      fresh(MANAGER, formRpcs({ flock_cycle_report: () => clone(F.flock_cycle_report_open) }));
      await mount(`/halls/report/${F1}`);
      t.same(
        [kpi('fcr_final'), kpi('sold_avg'), kpi('carry_in'), textOf('rep-carry-in'), byAction('rep-close').length, kpi('feed_out')],
        [
          ['معامل التحويل النهائيّ', '—', 'يُحسب عند إغلاق الدورة.'],
          ['معدّل وزن البيع (كغم)', '—', 'لا مبيع بفاتورة بعد.'],
          ['العلف من الدورة السابقة (كغم)', '200', 'منقول إلى هذه القاعة عند تسكينها، ومحسوب في النازل.'],
          'من الدورة السابقة في القاعة: 200 كغم «علف نامي».',
          0,
          null,
        ],
        'R القائمة: النهائيّان «—» بسببهما، والمنقول إليها من الدورة السابقة، ولا إغلاق',
      );
    });

    // ── X: أجوبة القاعدة الحقيقية (حين توجد) ────────────────────────────────────────────────────────────────────────────
    const samplesPath = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'birds-0028.json');
    if (existsSync(samplesPath)) {
      const X = JSON.parse(readFileSync(samplesPath, 'utf8'));
      const parsers = { flock_close_form: m.close.parseCloseForm, close_result: m.close.parseCloseResult, flock_cycle_report: m.halls.parseCycleReport, halls_day: m.days.parseHallsDay, flock_cycles: m.days.parseFlockCycles };
      for (const [key, value] of Object.entries(X)) {
        const parse = Object.entries(parsers).find(([prefix]) => key === prefix || key.startsWith(`${prefix}_`))?.[1];
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
