// تكامل 0028 من جهة الكتابة (درس 2026-11-02 بالاتّجاه الآخر): ما تبنيه وحدات الشاشات الحقيقية (src/lib/repo/weighTickets وflockClose وbirdSales
// محزومةً بـesbuild) من طلبات يُنفَّذ على دوالّ القاعدة الحقيقية بأسماء معاملاتها كما يرسلها PostgREST (p_x => قيمة، والكائن jsonb نصّاً)، وجوابها
// يرجع بمحلّل الشاشات نفسه. فلا تمرّ صيغة لا يقبلها الخادم (كمية بمراتبها، ومبلغ بالدينار الصحيح، ونسبة بمرتبتين، وسطور الإغلاق ومخزن الإرجاع وحده)
// ولا إعادة بالمحتوى نفسه لا يعرفها (حفظ التذكرة بلا نسخة جديدة، والفاتورة والإغلاق بمرجعهما). والأرقام على المرآة (domain/weighTicket):
// صافي التذكرة ومعدّلها، والوزن المحسوب والمبلغ وحصّة القاعة.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { postedOpening } from './stock-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TODAY = '2026-11-12';
const DAY_MS = 86400000;
const day = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const id = (n) => `e2820000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477028200${String(n).padStart(2, '0')}`;

const ERRORS = JSON.stringify(path.join(ROOT, 'src', 'lib', 'errors.ts'));
const CORE = `import { RejectedError, ZeroRowsError } from ${ERRORS};
export const call = (fn, args) => globalThis.__s28.call(fn, args);
export const send = async () => { throw new Error('screens0028: no direct table access'); };
export const classifyPostgrest = (error) => new RejectedError(error.code ?? 'x', error.hint ?? null);
export const explained = async (error) => error;
export const updatedRows = () => { throw new ZeroRowsError(); };
export const written = async () => { throw new Error('screens0028: no direct writes'); };
export const withStatus = (value) => value;
export const authed = async () => ({ userId: null, db: null });
export const unknownConstraint = () => '';`;

/** وحدات الشاشات الحقيقية (repo ومرآة الفاتورة والتذكرة) على core يحوّل كلّ نداء إلى globalThis.__s28. */
async function screensRepo() {
  const result = await build({
    stdin: {
      contents: [
        "export * as tickets from './src/lib/repo/weighTickets.ts';",
        "export * as close from './src/lib/repo/flockClose.ts';",
        "export * as birds from './src/lib/repo/birdSales.ts';",
        "export { ticketNets, billedKg, saleTotal, revenueSplit } from './src/domain/weighTicket.ts';",
      ].join('\n'),
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    jsx: 'automatic',
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'screens0028-core',
        setup(b) {
          b.onResolve({ filter: /^\.\/core$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('src/lib/repo/') ? { path: 'core', namespace: 's28-core' } : undefined));
          b.onLoad({ filter: /.*/, namespace: 's28-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const m = await screensRepo();
  const G = await makeOrg(db, {
    name: 'مزرعة الشاشات',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['accountant', 'accountant'],
      ['worker', 'hall_worker', ['broiler']],
    ],
  });
  const { users: U, divisions: D, org } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  // نداء الشاشات: الدالّة بأسماء معاملاتها كما يرسلها PostgREST، بهويّة المستخدم الحاليّ؛ والرفض خطأ برمزه وجملته.
  let as = null;
  globalThis.__s28 = {
    async call(fn, args) {
      const names = Object.keys(args);
      const sql = `select public.${fn}(${names.map((name, i) => `${name} => $${i + 1}`).join(', ')}) as v`;
      const result = await call(db, as, sql, names.map((name) => (args[name] !== null && typeof args[name] === 'object' ? JSON.stringify(args[name]) : args[name])));
      if (!result.ok) throw Object.assign(new Error(`${fn}: ${result.code}`), { code: result.code, hint: result.hint });
      return result.value;
    },
  };
  const by = async (user, run) => {
    as = user;
    try {
      return await run();
    } catch (error) {
      return { refused: error.code ?? String(error), hint: error.hint ?? null };
    } finally {
      as = null;
    }
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (error) {
      t.ok(false, `${name}: رمى ${error.stack ?? error.message}`);
    }
  };

  try {
    // ── الحقل والقاعتان والفوجان، والعلف بالافتتاح ثمّ صرفه للفوج، والتاجر والصندوق ─────────────────────────────────────────
    const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
    const site = await one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل الشاشات', 'farm') returning id", [D.broiler]);
    const hall = (name) => one(U.owner, 'insert into public.halls (site_id, name) values ($1, $2) returning id', [site, name]);
    const H1 = await hall('قاعة 1');
    const H2 = await hall('قاعة 2');
    const place = async (hallId, count) => (await one(U.manager, 'select public.open_flock($1, $2, $3, 0, null, $4)', [hallId, day(-30), count, uid()])).flock_id;
    const F1 = await place(H1, 1000);
    const F2 = await place(H2, 200);
    const item = (name) => one(U.owner, "insert into public.items (name, kind, base_unit) values ($1, 'feed', 'kg') returning id", [name]);
    const IA = await item('علف بادئ الشاشات');
    const IB = await item('علف نامي الشاشات');
    await postedOpening(db, U.owner, W.feed, day(-40), [{ item: IA, qty: 2000, value: '1400000.00' }, { item: IB, qty: 2000, value: '1200000.00' }]);
    const issue = (itemId, qty) => one(U.manager, 'select public.record_flock_issue($1, $2, $3, $4, $5, $6, $7, $8)', [uid(), uid(), uid(), F1, itemId, qty, day(-20), W.feed]);
    // الصرف بيومه (القاعدة لا تقبل تاريخاً أقدم من سبعة أيام من اليوم).
    await db.setToday(day(-20), async () => {
      await issue(IA, 500);
      await issue(IB, 300);
    });
    const trader = await one(U.owner, "insert into public.parties (name, is_customer) values ('تاجر الشاشات', true) returning id");
    const box = await one(U.owner, "insert into public.cash_accounts (name, kind) values ('صندوق الشاشات', 'cash') returning id");

    // ── التذكرة: الحفظ والإعادة بالمحتوى نفسه والإكمال، بطلب الشاشة ─────────────────────────────────────────────────────
    // قبّان، فارغ 7,000 بلا أقفاص، قفص 6، «قاعة 1» 400 طير في 40 قفصاً بخابط 7,900: الصافي 7,900 − 7,000 − 240 = 660.000 والمعدّل 1.650.
    const T1 = id(101);
    const draft = (stopId, birds, crates, grossKg) => ({
      siteId: site, onDate: day(-1), method: 'scale', emptyKg: 7_000_000n, emptyWithCrates: false, crateKg: 6000n, vehicle: ' 12345 بغداد ', driver: 'حسين', note: '',
      stops: [{ id: stopId, hallId: H1, birds, crates, grossKg, weighings: [] }],
    });
    const T1_DRAFT = draft(id(102), 400, 40, 7_900_000n);
    const mirror = m.ticketNets({ method: 'scale', emptyKg: 7_000_000n, emptyWithCrates: false, crateKg: 6000n, stops: [{ birds: 400, crates: 40, grossKg: 7_900_000n, weighings: [] }] });
    await section('التذكرة بطلب الشاشة', async () => {
      const saved = await by(U.worker, () => m.tickets.saveWeighTicket(T1, null, T1_DRAFT));
      const again = await by(U.worker, () => m.tickets.saveWeighTicket(T1, 1, T1_DRAFT));
      const done = await by(U.worker, () => m.tickets.finishWeighTicket(uid(), T1, 1));
      t.same(
        [saved.status, saved.ticket?.version, saved.ticket?.netKg, saved.ticket?.avgKg, saved.ticket?.vehicle, again.status, again.ticket?.version ?? 1, done.status, /^WT-\d{4}-\d{4,}$/u.test(done.ticketNo ?? '')],
        ['saved', 1, mirror.netKg, mirror.avgKg, '12345 بغداد', 'saved', 1, 'done', true],
        'الشاشة: حفظ التذكرة بنسختها (الصافي والمعدّل = المرآة، والسيارة مقصوصة)، وإعادة المحتوى نفسه «حُفظ» بلا نسخة جديدة، والإكمال برقم WT',
      );
    });

    // ── الفاتورة بطلب الشاشة: مقبوض جزئيّ بصندوقه، والإعادة بالمرجع نفسه؛ وفاتورة ثانية تُلغى ─────────────────────────────────
    // 660 × 99.5٪ = 656.700 كغم × 2,750.00 = 1,805,925 دينار، منها 1,000,000 مقبوضة.
    await section('الفاتورة بطلب الشاشة', async () => {
      const form = await by(U.accountant, () => m.birds.loadBirdSaleForm(T1));
      const request = { clientRef: id(111), saleId: id(112), ticketId: T1, ticketVersion: form.ticket.version, partyId: trader, unitPrice: 275_000n, deduction: 50n, paidNow: 100_000_000n, cashAccountId: box, note: null };
      const sale = await by(U.accountant, () => m.birds.recordBirdSale(request));
      const replay = await by(U.accountant, () => m.birds.recordBirdSale(request));
      const billed = m.billedKg(mirror.netKg, 50n);
      const total = m.saleTotal(billed, 275_000n);
      t.same(
        [form.invoiceable, sale.status, sale.billedKg, sale.money?.total, sale.money?.paidNow, sale.sources.map((s) => s.revenue), replay.docNo === sale.docNo, replay.id],
        [true, 'posted', billed, total, 100_000_000n, m.revenueSplit(total, [mirror.netKg]), true, id(112)],
        'الشاشة: الفاتورة بالسعر والتنزيل والمقبوض نصوصاً كما يقبلها الخادم: الوزن المحسوب والمبلغ والحصّة = المرآة، والإعادة بالمرجع نفسه نتيجتها',
      );
      // فاتورة ثانية لتذكرة ثانية (100 طير، الصافي 165) يلغيها المدير بطلب الشاشة: الطيور تعود، ولا مقبوض.
      const T2 = id(121);
      await by(U.worker, () => m.tickets.saveWeighTicket(T2, null, draft(id(122), 100, 10, 7_225_000n)));
      await by(U.worker, () => m.tickets.finishWeighTicket(uid(), T2, 1));
      const second = await by(U.accountant, () => m.birds.recordBirdSale({ ...request, clientRef: uid(), saleId: id(123), ticketId: T2, ticketVersion: 2, deduction: 0n, paidNow: 0n, cashAccountId: null }));
      const voided = await by(U.manager, () => m.birds.voidBirdSale(uid(), id(123), ' وزن خاطئ '));
      // التذكرة بلا فاتورة مرحّلة تمنع الإغلاق (tickets_pending)، فيلغيها المدير بسببها بطلب الشاشة.
      const ticketVoided = await by(U.manager, () => m.tickets.voidWeighTicket(T2, ' وزن خاطئ ', uid()));
      t.same([second.status, second.money?.total, voided.docNo === second.docNo, voided.voidedOn, voided.paymentEntryId, voided.paymentKept, ticketVoided.status], ['posted', 45_375_000n, true, TODAY, null, 0n, 'void'],
        'الشاشة: فاتورة بالدين كلّها (165 × 2,750 = 453,750) ثمّ إلغاؤها بسببها (يوم الإلغاء اليوم ولا مقبوض باقٍ)، ثمّ تذكرتها بسببها');
      // مسوّدة تُحذف بطلب الشاشة (عامل القاعة بلا سبب).
      const T3 = id(131);
      await by(U.worker, () => m.tickets.saveWeighTicket(T3, null, draft(id(132), 50, 5, 7_120_000n)));
      const dropped = await by(U.worker, () => m.tickets.voidWeighTicket(T3, null, uid()));
      t.same([dropped.status, dropped.ticketNo], ['void', null], 'الشاشة: المسوّدة تُحذف بلا سبب ولا رقم');
    });

    // ── فرق العدّ بطلب الشاشة، بشرط الحيّ الذي عرضته بطاقة الفوج ──────────────────────────────────────────────────────────
    await section('فرق العدّ بطلب الشاشة', async () => {
      const card = await by(U.manager, () => m.close.loadFlockSales(F1));
      const adjusted = await by(U.manager, () => m.close.recordCountAdjust({ clientRef: uid(), id: id(141), flockId: F1, on: TODAY, birds: -10, reason: ' طيور هربت ', expectedLive: card.live }));
      const stale = await by(U.manager, () => m.close.recordCountAdjust({ clientRef: uid(), id: id(142), flockId: F1, on: TODAY, birds: -1, reason: 'عدّ', expectedLive: card.live }));
      t.same([card.live, card.soldBirds, adjusted.birds, adjusted.liveAfter, stale.refused], [600, 400, -10, 590, 'live_changed'],
        'الشاشة: الحيّ 1,000 − 400 مباعة = 600، وفرق العدّ −10 يجعله 590، وطلب بحيّ قديم live_changed');
    });

    // ── الإغلاق بطلب الشاشة من نموذجه (الحيّ والمباع وما نزل شرطاً)، والإرجاع والنقل، ثمّ إرجاع المنقول وإعادة الفتح ───────────────────
    await section('الإغلاق بطلب الشاشة', async () => {
      const form = await by(U.manager, () => m.close.loadCloseForm(F1));
      const [a, b] = [IA, IB].map((itemId) => form.items.find((row) => row.itemId === itemId));
      const request = {
        clientRef: uid(), closeId: id(151), flockId: F1, on: TODAY, expectedLive: form.flock.live, expectedSold: form.sales.birds,
        expectedPools: form.items.map((row) => ({ itemId: row.itemId, qty: row.poolQty })), countReason: ' طيور لم تُعدّ ',
        lines: [{ itemId: IA, qty: 100_000n, action: 'return', warehouseId: a.defaultStore }, { itemId: IB, qty: 50_000n, action: 'carry', warehouseId: null }], note: ' نهاية الدورة ',
      };
      const closed = await by(U.manager, () => m.close.closeFlock(request));
      if (closed.refused) throw new Error(`close_flock: ${closed.refused} ${closed.hint}`);
      const replay = await by(U.manager, () => m.close.closeFlock(request));
      const carry = closed.lines?.find((line) => line.action === 'carry');
      t.same(
        [form.flock.live, form.sales.birds, [a.poolQty, b.poolQty], a.defaultStore, closed.status, closed.countDiff, closed.countReason, closed.note,
          closed.lines?.map((line) => [line.action, line.qty, line.returnDocNo !== null, line.carryStatus]), replay.id],
        [590, 400, [500_000n, 300_000n], W.feed, 'closed', -590, 'طيور لم تُعدّ', 'نهاية الدورة', [['return', 100_000n, true, null], ['carry', 50_000n, false, 'pending']], id(151)],
        'الشاشة: الإغلاق بما عرضه نموذجه شرطاً: فرق العدّ −590 بسببه، و100 كغم ترجع بمستند FR، و50 كغم تُنقل معلَّقة، والإعادة بالمرجع نفسه نتيجتها',
      );
      const returned = await by(U.manager, () => m.close.returnHallCarry(uid(), id(161), carry.lineId, W.feed));
      const reopenUsed = await by(U.manager, () => m.close.reopenFlock(id(151), 'إغلاق خاطئ', uid()));
      t.same([/^FR-\d{4}-\d{4,}$/u.test(returned.docNo ?? ''), returned.lineId, reopenUsed.refused], [true, carry.lineId, 'carry_used'],
        'الشاشة: المنقول يرجع إلى مخزنه بمستند FR، وبعده لا يُعاد فتح الدورة (carry_used)');
      // الفوج الثاني: إغلاق بلا باقٍ ثمّ إعادة فتحه بطلب الشاشة.
      const second = await by(U.manager, () => m.close.loadCloseForm(F2));
      const shut = await by(U.manager, () => m.close.closeFlock({ clientRef: uid(), closeId: id(171), flockId: F2, on: TODAY, expectedLive: second.flock.live, expectedSold: 0,
        expectedPools: [], countReason: 'نهاية الدورة', lines: [], note: null }));
      const reopened = await by(U.manager, () => m.close.reopenFlock(id(171), ' إغلاق خاطئ ', uid()));
      const card = await by(U.manager, () => m.close.loadFlockSales(F2));
      t.same([shut.status, shut.countDiff, reopened.closeId, reopened.flockId, card.status, card.live, card.close?.status], ['closed', -200, id(171), F2, 'active', 200, 'reopened'],
        'الشاشة: الفوج الثاني يُغلق بفرق عدّ −200 ثمّ يُعاد فتحه، فيعود قائماً بحيّه');
    });
  } finally {
    delete globalThis.__s28;
  }
}
