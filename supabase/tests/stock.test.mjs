// المخزون (خطّة المرحلة 1 WP4، 0007): رصيد الافتتاح وفحوصه (FOUNDATION ٥٤٨، Q9، Q13)، وآلية T0 (D3) وGOLD-06 بالفلس (FOUNDATION
// ٦٢٢، ٦٥١–٦٥٢)، والتحويل والصادر الداخلي (القاعدة 15) ولقطة الوحدة (E7)، وأهلية المادّة بالمخزن (division-check)، والتواريخ (ما
// قبل الاستلام، والرجوع 7 أيام، ومنطقة الجلسة)، والانتهاء (FEFO والمنتهي المسمّى بالرفض)، وعمر الفرخ (E24)، والأرشفة والإلغاء (E35،
// E43)، وطيّ المسوّدة وحذف سطرها (E13، E52)، وتجميد النوع، ولوحة المخزون وبطاقة المادّة والقيم، وتطابق ترتيب السحب وقيمته بين
// SQL وsrc/domain/fifo.ts على مجموعات مولّدة، وverify_stock صفر وكل فحص يمسك كسره، ورقم TR بـverify_ledger، وdraftWriteLock
// للنوعين، وسحب 500 دفعة تحت حدّ الطلب (GT-30). كل نداء بدور authenticated حقيقي.
import { loadSrc } from '../../scripts/tests/load-src.mjs';
import { call, makeOrg, shown, uid } from './ledger-kit.mjs';
import { draftWriteLock } from './shared.mjs';
import {
  STOCK_ZERO,
  balanceOf,
  lotsOf,
  makeStockOrg,
  openingDraft,
  postOpening,
  postTransfer,
  postedOpening,
  postedTransfer,
  transferDraft,
  verifyStock,
  voidOpening,
  voidTransfer,
} from './stock-kit.mjs';

const TODAY = '2026-10-30';
const GO_LIVE = '2026-10-20';
const id = (n) => `d7000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477097000${String(n).padStart(2, '0')}`;
const bareId = (n) => `d7100000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const barePhone = (n) => `96477097100${String(n).padStart(2, '0')}`;

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
  await zoneSweep(t, db);
}

/**
 * منطقة الجلسة ما تغيّر حدّ الأيام السبعة (core.test): برّا setToday، بيوم الخادم الحقيقي (app_today بتوقيت بغداد)، فدالّة تقرأ
 * current_date أو now()::date بمنطقة الجلسة تفشل بساعات اليوم اللي يختلف بيها اليوم بين بغداد وGMT+12 أو كيريتيماتي. المعاينة
 * والترحيل نفسه (check_post_date)، بمنشأة يومها قبل أيام الفحص.
 */
async function zoneSweep(t, db) {
  const today = (await db.admin('select public.app_today()::text as d')).rows[0].d;
  const goLive = (await db.admin('select (public.app_today() - 30)::text as d')).rows[0].d;
  const Z = await makeStockOrg(db, {
    name: 'مزرعة المناطق',
    id: (n) => `d7500000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    phone: (n) => `96477097500${String(n).padStart(2, '0')}`,
    goLive,
  });
  const fuel = await Z.one(Z.users.owner, "insert into public.items (name, kind, base_unit) values ('كاز المناطق', 'fuel', 'L') returning id");
  await postedOpening(db, Z.users.manager, Z.W.general, goLive, [{ item: fuel, qty: 100, value: 75000 }]);
  const dayBack = async (n) => (await db.admin('select (public.app_today() - $1::int)::text as d', [n])).rows[0].d;
  const drafts = {
    old: await transferDraft(db, Z.users.manager, Z.W.general, Z.W.raw, await dayBack(8), [{ item: fuel, qty: 1 }]),
    edge: await transferDraft(db, Z.users.manager, Z.W.general, Z.W.raw, await dayBack(7), [{ item: fuel, qty: 1 }]),
  };
  const zones = {};
  for (const zone of ['UTC', 'Etc/GMT+12', 'Pacific/Kiritimati', 'Asia/Baghdad']) {
    zones[zone] = await db.asUser(Z.users.manager, async (q) => {
      await q(`set local timezone = '${zone}'`);
      const codes = async (docId) => (await q('select public.preview_transfer($1) as p', [docId])).rows[0].p.problems.map((p) => p.code);
      const post = async (doc) => {
        await q('savepoint z');
        try {
          await q('select public.post_transfer($1, $2, public.preview_transfer($1) ->> \'plan\', gen_random_uuid())', [doc.id, doc.version]);
          return 'ok';
        } catch (error) {
          return error.message;
        } finally {
          await q('rollback to savepoint z');
        }
      };
      return [await codes(drafts.old.id), await codes(drafts.edge.id), await post(drafts.old), await post(drafts.edge)];
    });
  }
  t.same(Object.values(zones), Array(4).fill([['date_too_old'], [], 'date_too_old', 'ok']), `منطقة الجلسة ما تغيّر حدّ الأيام السبعة بيوم الخادم الحقيقي ${today} (المعاينة والترحيل، UTC وGMT+12 وكيريتيماتي وبغداد)`);
}

/** مولّد عشوائي ثابت بالبذرة (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** «12.345» ← 12345n بمراتب ثابتة (نصّ numeric من القاعدة). */
function scaled(text, scale) {
  const [whole, frac = ''] = String(text).split('.');
  const negative = whole.startsWith('-');
  const digits = `${negative ? whole.slice(1) : whole}${frac.padEnd(scale, '0').slice(0, scale)}`;
  const value = BigInt(digits);
  return negative ? -value : value;
}

/** 12345n ← «12.345». */
function decimal(units, scale) {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

async function scenario(t, db) {
  const S = await makeStockOrg(db, { name: 'مزرعة المخزون', id, phone, goLive: GO_LIVE });
  const { users: U, W, I } = S;
  const asM = (sql, params) => call(db, U.manager, sql, params);
  const item = (label, kind, unit, extra = {}) => S.one(U.owner, 'insert into public.items (name, kind, base_unit, tracks_expiry, min_qty) values ($1, $2, $3, $4, $5) returning id', [label, kind, unit, extra.tracksExpiry ?? false, extra.minQty ?? null]);
  const docNo = async (docId) => (await db.admin('select doc_no from public.transfers where id = $1', [docId])).rows[0].doc_no;

  // ── الافتتاح: الصلاحية، ويوم التشغيل ─────────────────────────────────────────────────────────────────────────
  const dieselDoc = await openingDraft(db, U.manager, W.general, GO_LIVE, [{ item: I.diesel, qty: 1000, value: 800000 }]);
  t.same(
    { storekeeper: shown(await postOpening(db, U.storekeeper, dieselDoc)), accountant: shown(await postOpening(db, U.accountant, dieselDoc)), viewer: shown(await postOpening(db, U.viewer, dieselDoc)) },
    { storekeeper: 'forbidden', accountant: 'forbidden', viewer: 'forbidden' },
    'ترحيل الافتتاح للمدير والمالك بس (opening.post)',
  );
  const lateDoc = await openingDraft(db, U.manager, W.general2, '2026-10-21', [{ item: I.gas, qty: 1, value: 7000 }]);
  t.eq(shown(await postOpening(db, U.manager, lateDoc)), 'after_go_live', 'افتتاح بعد يوم التشغيل ← after_go_live');
  const bare = await makeOrg(db, { name: 'منشأة بلا تشغيل', id: bareId, phone: barePhone, roles: [['owner', 'owner'], ['manager', 'manager']] });
  const bareGeneral = (await db.admin("select id from public.warehouses where org_id = $1 and kind = 'general'", [bare.org])).rows[0].id;
  const bareFuel = (await call(db, bare.users.manager, "insert into public.items (name, kind, base_unit) values ('كاز', 'fuel', 'L') returning id")).value;
  const bareDoc = await openingDraft(db, bare.users.manager, bareGeneral, '2026-10-20', [{ item: bareFuel, qty: 1, value: 1 }]);
  t.eq(shown(await postOpening(db, bare.users.manager, bareDoc)), 'no_go_live', 'وحدة بلا يوم تشغيل ← no_go_live');

  // ── ترتيب الدفعات لكل منشأة (E4، درس 0006): المدير يقرأ fifo_seq من stock_lots، فرقم مشترك بين المنشآت يكشف نشاطها ──────────
  const fifoMax = async () => BigInt((await asM('select max(fifo_seq)::text as v from public.stock_lots')).value ?? '0');
  const seqBefore = await fifoMax();
  t.eq(shown(await call(db, bare.users.owner, 'select public.set_division_go_live($1, $2)', [bare.divisions.general, GO_LIVE])), 'ok', 'المنشأة الثانية تحدّد يوم تشغيل مخازنها العامة');
  const bareItems = [];
  for (const label of ['كاز ب1', 'كاز ب2', 'كاز ب3']) bareItems.push((await call(db, bare.users.manager, "insert into public.items (name, kind, base_unit) values ($1, 'fuel', 'L') returning id", [label])).value);
  await postedOpening(db, bare.users.manager, bareGeneral, GO_LIVE, bareItems.map((itemId) => ({ item: itemId, qty: 1, value: 1 })));
  const ownLot = await item('كاز الترتيب', 'fuel', 'L');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: ownLot, qty: 1, value: 1 }]);
  t.eq(String(BigInt((await asM('select fifo_seq::text as v from public.stock_lots where item_id = $1', [ownLot])).value) - seqBefore), '1', 'ثلاث دفعات بمنشأة ثانية ما تغيّر ترتيب دفعات منشأتك: الدفعة الجاية بعد آخر رقم عندك بالضبط');

  // ── فحوص سطر الافتتاح (FOUNDATION ٥٤٨، Q9، Q13)، كل رمز بسطره ──────────────────────────────────────────────────
  const lineProblem = async (wh, line) => shown(await postOpening(db, U.manager, await openingDraft(db, U.manager, wh, GO_LIVE, [line])));
  const now = Date.now();
  t.same(
    {
      kind: await lineProblem(W.medicine, { item: I.feed, qty: 10, value: 1000 }),
      egg: await lineProblem(W.table_egg, { item: I.eggs, qty: 300, value: 0, zeroReason: 'بيض بلا قيمة' }),
      noValue: await lineProblem(W.general2, { item: I.gas, qty: 1, value: null }),
      zeroNoReason: await lineProblem(W.general2, { item: I.gas, qty: 1, value: 0 }),
      pieces: await lineProblem(W.medicine, { item: I.vaccine, qty: 2.5, value: 1000, expiry: '2027-01-01' }),
      expiry: await lineProblem(W.medicine, { item: I.vaccine, qty: 2, value: 1000 }),
      notTracked: await lineProblem(W.general2, { item: I.gas, qty: 1, value: 7000, expiry: '2027-01-01' }),
      bornAt: await lineProblem(W.chick, { item: I.chicks, qty: 100, value: 65000 }),
    },
    { kind: 'item_kind_mismatch', egg: 'egg_flock_required', noValue: 'value_required', zeroNoReason: 'value_required', pieces: 'pieces_not_whole', expiry: 'expiry_required', notTracked: 'expiry_not_tracked', bornAt: 'born_at_required' },
    'سطر الافتتاح: علف بمخزن الأدوية، وبيض المائدة (المرحلة 4)، وقيمة فارغة، وصفر بلا سبب، وكسر قطعة، وبلا انتهاء، وانتهاء لمادّة ما تتابعه، وأفراخ بلا وقت فقس',
  );
  // وقت الفقس للأفراخ بس، وما يكون بعد الآن: وقود بوقت فقس كان ينحسب «أفراخ فاتها 48 ساعة»، ووقت بالمستقبل عمره سالب (E24).
  const lamp = await item('غاز مصباح', 'fuel', 'pc');
  const layerChicks = await item('أفراخ بيّاضة', 'chick', 'pc');
  t.same(
    {
      notChick: await lineProblem(W.general, { item: lamp, qty: 2, value: 14000, bornAt: new Date(now - 60 * 3_600_000).toISOString() }),
      future: await lineProblem(W.chick2, { item: layerChicks, qty: 10, value: 6500, bornAt: new Date(now + 48 * 3_600_000).toISOString() }),
    },
    { notChick: 'born_at_not_chick', future: 'born_at_future' },
    'سطر الافتتاح: وقت فقس لمادّة مو أفراخ، ووقت فقس بالمستقبل',
  );
  // مراتب السطر: كمية بأكثر من ثلاث مراتب أو قيمة بأكثر من مرتبتين ترفض بقيدها (مو تقريب صامت بالحارس)، والمضبوطة تثبت بمراتبها.
  const scaleRows = await db.asUser(U.manager, async (q) => {
    const docId = (await q('insert into public.opening_docs (warehouse_id, on_date) values ($1, $2) returning id', [W.general, GO_LIVE])).rows[0].id;
    const attempt = async (qty, value) => {
      await q('savepoint line');
      try {
        const row = (await q('insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, $3, $4) returning qty_base::text as q, value::text as v', [docId, lamp, qty, value])).rows[0];
        await q('release savepoint line');
        return `${row.q}/${row.v}`;
      } catch (error) {
        await q('rollback to savepoint line');
        return error.constraint ?? error.message;
      }
    };
    return [await attempt('2.0004', '100.00'), await attempt('2', '100.005'), await attempt('2', '100')];
  });
  t.same(scaleRows, ['opening_lines_qty_check', 'opening_lines_value_check', '2.000/100.00'], 'سطر الافتتاح: الكمية 2.0004 والقيمة 100.005 ترفض بقيدهما بلا تقريب، و2 و100 تثبت 2.000 و100.00');
  const empties = await postedOpening(db, U.manager, W.general2, GO_LIVE, [{ item: I.gas, qty: 10, value: 0, zeroReason: 'قناني فارغة بلا قيمة' }]);
  t.same((await lotsOf(db, I.gas, W.general2)).map((l) => [l.qty_in, l.value_in]), [['10', '0']], 'صفر صريح ويّا سبب يُقبل (Q9: قناني فارغة بلا قيمة)');
  t.ok(empties.result.lots.length === 1, 'الترحيل يرجّع دفعة لكل سطر');

  // ── T0 (D3، FOUNDATION ٦٢٢): افتتاح 1,000 لتر بـ800,000.00 بالعامّ، ينتقل كلّه للمواد الأوّلية (صادر داخلي) ─────────────────
  const t0Open = await postOpening(db, U.manager, dieselDoc);
  t.eq(shown(t0Open), 'ok', 'المدير يرحّل افتتاح الكاز أويل');
  const again = await openingDraft(db, U.manager, W.general, GO_LIVE, [{ item: I.diesel, qty: 5, value: 4000 }]);
  t.eq(shown(await postOpening(db, U.manager, again)), 'item_has_moves', 'افتتاح ثانٍ لنفس المادّة بنفس المخزن ← item_has_moves');
  const partiesBefore = (await db.admin('select count(*)::int as n from public.party_entries where org_id = $1', [S.org])).rows[0].n;
  const t0 = await postedTransfer(db, U.storekeeper, W.general, W.raw, '2026-10-28', [{ item: I.diesel, qty: 1000 }]);
  const [dieselSource] = await lotsOf(db, I.diesel, W.general);
  const [dieselMirror] = await lotsOf(db, I.diesel, W.raw);
  t.same(
    [dieselMirror.qty_in, dieselMirror.value_in, dieselMirror.fifo_seq, dieselMirror.expiry_on, dieselMirror.origin_lot_id, dieselMirror.source_lot_id, dieselMirror.received_on],
    ['1000', '800000', dieselSource.fifo_seq, dieselSource.expiry_on, dieselSource.id, dieselSource.id, '2026-10-28'],
    'D3: المرآة 1,000 لتر بـ800,000.00 بنفس fifo_seq والانتهاء، وجذرها ومصدرها الأصل، واستلامها يوم التحويل',
  );
  t.same([dieselSource.qty_left, dieselSource.value_left], ['0', '0'], 'المصدر صفر وصفر');
  t.eq(t0.result.doc_no, 'TR-2026-0001', 'رقم التحويل TR-2026-0001 بسنة تاريخه');
  t.eq(t0.result.internal_export, true, 'بين المخازن العامة والمعمل صادر داخلي');
  t.ok(!JSON.stringify(t0.result).includes('"money"'), 'نتيجة ترحيل الأمين بلا money');
  t.eq((await db.admin('select count(*)::int as n from public.party_entries where org_id = $1', [S.org])).rows[0].n, partiesBefore, 'الصادر الداخلي بلا قيد جهة (FOUNDATION ٩٢، ٥٥٤)');
  const partial = await postedTransfer(db, U.manager, W.raw, W.farm1, '2026-10-29', [{ item: I.diesel, qty: 40 }]);
  t.same((await lotsOf(db, I.diesel, W.farm1)).map((l) => [l.qty_in, l.value_in]), [['40', '32000']], '40 لتراً من المرآة ← 32,000.00 (FOUNDATION ٦٢٢)');
  t.eq(partial.result.money.total, '32000.00', 'المدير يشوف القيمة بنتيجة الترحيل');
  const consumed = await voidOpening(db, U.manager, dieselDoc.id);
  t.ok(!consumed.ok && consumed.code === 'lot_consumed' && consumed.hint.includes('TR-2026-0001'), `إلغاء افتتاح انسحب منه ← lot_consumed يسمّي التحويل (${consumed.hint})`);

  // ── GOLD-06 (FOUNDATION ٦٥١–٦٥٢): علف 9,950 كغم بـ6,911,066.67، تحويلان، والإلغاء من الأحدث يرجّع كل فلس ──────────────────
  await postedOpening(db, U.manager, W.feed, GO_LIVE, [{ item: I.feed, qty: 9950, value: '6911066.67' }]);
  const t1Draft = await transferDraft(db, U.manager, W.feed, W.farm1, '2026-10-28', [{ item: I.feed, qty: 100, unit: S.bag }]);
  const t1Preview = (await asM('select public.preview_transfer($1)', [t1Draft.id])).value;
  const t1Posted = await postTransfer(db, U.manager, t1Draft);
  t.same(t1Preview.lines[0].draws.map((d) => [d.qty, d.money.value]), t1Posted.value.lines[0].draws.map((d) => [d.qty, d.money.value]), 'المعاينة = الترحيل (الكمية والقيمة بالفلس)');
  t.same((await lotsOf(db, I.feed, W.farm1)).map((l) => [l.qty_in, l.value_in]), [['5000', '3472897.82']], 'تحويل 100 كيس = 5,000 كغم ← 3,472,897.82');
  t.same((await lotsOf(db, I.feed, W.feed)).map((l) => [l.qty_left, l.value_left]), [['4950', '3438168.85']], 'المصدر يبقى 4,950 كغم بـ3,438,168.85');
  const t2 = await postedTransfer(db, U.manager, W.farm1, W.farm2, '2026-10-29', [{ item: I.feed, qty: 3, code: 't' }]);
  t.same((await lotsOf(db, I.feed, W.farm2)).map((l) => [l.qty_in, l.value_in]), [['3000', '2083738.69']], '3 طن من المرآة = 3,000 كغم ← 2,083,738.69');
  t.same((await lotsOf(db, I.feed, W.farm1)).map((l) => [l.qty_left, l.value_left]), [['2000', '1389159.13']], 'المرآة تبقى 2,000 كغم بـ1,389,159.13');
  const outOfOrder = await voidTransfer(db, U.manager, t1Draft.id);
  t.ok(!outOfOrder.ok && outOfOrder.code === 'lot_consumed' && outOfOrder.hint.includes(await docNo(t2.id)), `إلغاء التحويل الأوّل قبل الثاني ← lot_consumed يسمّي ${await docNo(t2.id)}`);
  t.same([shown(await voidTransfer(db, U.manager, t2.id)), shown(await voidTransfer(db, U.manager, t1Draft.id))], ['ok', 'ok'], 'الإلغاء من الأحدث: الثاني ثم الأوّل');
  t.same((await lotsOf(db, I.feed, W.feed)).map((l) => [l.qty_left, l.value_left]), [['9950', '6911066.67']], 'بعد الإلغاء: 9,950 كغم بـ6,911,066.67 بالضبط');
  t.same([await balanceOf(db, I.feed, W.farm1), await balanceOf(db, I.feed, W.farm2)], [{ qty: '0', value: '0' }, { qty: '0', value: '0' }], 'المرآتان صفر وصفر بعد الإلغاء');
  const moves = (await asM('select public.item_moves_qty($1, $2, null, 50)', [I.feed, W.farm1])).value;
  t.same(moves.rows.map((m) => [m.qty, m.running, m.reversed, m.reverses_move_id !== null]), [['5000.000', '5000.000', true, false], ['-3000.000', '2000.000', true, false], ['3000.000', '5000.000', false, true], ['-5000.000', '0.000', false, true]], 'حركات المرآة برصيد جارٍ، والمعكوسة والعكسية بعلامتيهما');
  t.same(shown(await voidTransfer(db, U.manager, t1Draft.id)), 'already_void', 'إلغاء ثانٍ ← already_void');

  // ── سطور متكرّرة لنفس المادّة (FOUNDATION ٧٧٠: المعاينة = الترحيل): الترحيل يسحب سطراً سطراً من الدفعة كما صارت، فالمعاينة
  // تعيد كل سطر قبله لحاله بترتيبه، مو قطعة وحدة مجموعة (دفعة 3 لترات بـ10.97 بثلاثة لترات، ودفعة 600 بـ10.00 بـ100 و100 و400،
  // متداخلة بسطور مادّة ثانية).
  const thirds = await item('كاز الأثلاث', 'fuel', 'L');
  const sixths = await item('كاز الأسداس', 'fuel', 'L');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: thirds, qty: 3, value: '10.97' }, { item: sixths, qty: 600, value: '10.00' }]);
  const repeated = await transferDraft(db, U.manager, W.general, W.raw, TODAY, [
    { item: thirds, qty: 1 }, { item: sixths, qty: 100 }, { item: thirds, qty: 1 }, { item: sixths, qty: 100 }, { item: thirds, qty: 1 }, { item: sixths, qty: 400 },
  ]);
  const repeatedPreview = (await asM('select public.preview_transfer($1)', [repeated.id])).value;
  const repeatedPosted = await postTransfer(db, U.manager, repeated);
  const drawValues = (doc) => doc.lines.map((line) => line.draws.map((d) => scaled(d.money.value, 2).toString()));
  t.same(drawValues(repeatedPreview), drawValues(repeatedPosted.value), `سطور متكرّرة لنفس المادّة: قيمة كل قطعة بالمعاينة = الترحيل (${JSON.stringify(drawValues(repeatedPosted.value))})`);
  t.same(drawValues(repeatedPosted.value).flat(), ['366', '167', '366', '167', '365', '666'], 'الترحيل: 3.66 و3.66 و3.65 من دفعة الأثلاث، و1.67 و1.67 و6.66 من دفعة الأسداس (بلا فلس زايد)');
  const previewSum = (itemId) => repeatedPreview.lines.filter((line) => line.item_id === itemId).reduce((sum, line) => sum + scaled(line.money.value, 2), 0n);
  t.same([previewSum(thirds), previewSum(sixths)], [1097n, 1000n], 'مجموع المعاينة لكل دفعة = قيمتها بالضبط (10.97 و10.00)، مو أكثر');

  // ── لقطة الوحدة (E7) ─────────────────────────────────────────────────────────────────────────────────────
  const snapshot = (await db.admin('select trim_scale(qty_in_unit)::text as q, trim_scale(factor)::text as f, unit_label, trim_scale(qty_base)::text as b from public.transfer_lines where doc_id = any ($1::uuid[]) order by created_at', [[t1Draft.id, t2.id]])).rows;
  t.same(snapshot, [{ q: '100', f: '50', unit_label: 'كيس 50 كغم', b: '5000' }, { q: '3', f: '1000', unit_label: 't', b: '3000' }], 'السطر يلقط معامل الكيس والطن واسمهما، والكمية بوحدة الأساس');
  const unitProblems = {};
  for (const [label, line] of [['طن لمادّة باللتر', { item: I.diesel, qty: 1, code: 't' }], ['كيس العلف لمادّة ثانية', { item: I.corn, qty: 1, unit: S.bag }], ['نصف قنينة', { item: I.gas, qty: 0.5 }]]) {
    try {
      await transferDraft(db, U.manager, W.general2, W.general, TODAY, [line]);
      unitProblems[label] = 'ok';
    } catch (error) {
      unitProblems[label] = error.message;
    }
  }
  t.same(unitProblems, { 'طن لمادّة باللتر': 'unit_mismatch', 'كيس العلف لمادّة ثانية': 'unit_mismatch', 'نصف قنينة': 'pieces_not_whole' }, 'الوحدة لازم تناسب المادّة، والمعدود صحيح');

  // ── أهلية المادّة بالمخزن (division-check، FOUNDATION ٢٨٠–٢٨٣): مرآة TS خانةً خانة، والرفض بالوجهة ──────────────────────────
  const stock = await loadSrc('src/domain/stock.ts');
  const kinds = { wh: ['raw', 'feed', 'medicine', 'general', 'hatching_egg', 'chick', 'table_egg', 'farm'], item: ['raw', 'additive', 'feed', 'medicine', 'vaccine', 'fuel', 'packaging', 'hatching_egg', 'chick', 'table_egg', 'equipment', 'other'] };
  const sqlMatrix = await db.asOwner(async (q) => (await q('select w, i, private.item_admissible(w, i) as ok from unnest($1::text[]) as w cross join unnest($2::text[]) as i', [kinds.wh, kinds.item])).rows);
  t.same(sqlMatrix.filter((r) => r.ok !== stock.itemAdmissible(r.w, r.i)).map((r) => `${r.w}/${r.i}`), [], `أهلية المادّة: SQL = itemAdmissible (${sqlMatrix.length} خانة)`);
  const receiving = await db.asOwner(async (q) => (await q('select i, private.receiving_kinds(i) as k from unnest($1::text[]) as i', [kinds.item])).rows);
  t.same(receiving.filter((r) => JSON.stringify(r.k) !== JSON.stringify(stock.RECEIVING_KINDS[r.i])).map((r) => r.i), [], 'مخازن الاستلام: SQL = RECEIVING_KINDS');
  const same = await db.asUser(U.manager, (q) => q('insert into public.transfers (from_warehouse_id, to_warehouse_id, moved_on) values ($1, $1, $2)', [W.general, TODAY])).then(() => 'ok', (error) => error.constraint ?? error.message);
  t.eq(same, 'transfers_same_warehouse_check', 'تحويل من المخزن لنفسه يرفض بقيده (same_warehouse)');

  // ── عمر الفرخ (E24) ─────────────────────────────────────────────────────────────────────────────────────
  const bornAt = (hours) => new Date(now - hours * 3_600_000).toISOString();
  await postedOpening(db, U.manager, W.chick, GO_LIVE, [
    { item: I.chicks, qty: 100, value: 65000, bornAt: bornAt(50) },
    { item: I.chicks, qty: 50, value: 32500, bornAt: bornAt(10) },
  ]);
  const chickBoard = (await call(db, U.hatcheryKeeper, 'select public.stock_on_hand($1, null, 50)', [W.chick])).value.rows.find((r) => r.item_id === I.chicks);
  t.same([chickBoard.chick_age_hours, chickBoard.old_chicks], ['50', '100.000'], 'لوحة مخزن الأفراخ: أقدم فرخ 50 ساعة، و100 فرخ فاتها 48 ساعة');
  const intoRaw = await transferDraft(db, U.manager, W.chick, W.raw, TODAY, [{ item: I.chicks, qty: 10 }]);
  t.eq(shown(await postTransfer(db, U.manager, intoRaw)), 'item_kind_mismatch', 'الأفراخ لمخزن المواد الأوّلية ← item_kind_mismatch');
  await postedTransfer(db, U.manager, W.chick, W.chick2, TODAY, [{ item: I.chicks, qty: 100 }]);
  const chickLots = (await asM('select public.item_lots_qty($1, $2, null, 50)', [I.chicks, W.chick2])).value.rows;
  t.same(chickLots.map((l) => [l.age_hours, l.born_at === null]), [['50', false]], 'المرآة تحمل وقت الفقس نفسه: 50 ساعة بالمخزن الثاني');

  // ── التواريخ: ما قبل الاستلام، والرجوع 7 أيام، ومنطقة الجلسة ─────────────────────────────────────────────────────
  const early = await postTransfer(db, U.manager, await transferDraft(db, U.manager, W.raw, W.farm1, '2026-10-27', [{ item: I.diesel, qty: 10 }]));
  t.ok(!early.ok && early.code === 'insufficient_stock' && early.hint.includes('بهذا التاريخ') && early.hint.includes('27/10/2026'), `تحويل بيوم قبل استلام المرآة ← insufficient_stock «بهذا التاريخ…» (${early.hint})`);
  t.same(
    [
      shown(await postTransfer(db, U.manager, await transferDraft(db, U.manager, W.raw, W.farm1, '2026-10-22', [{ item: I.diesel, qty: 1 }]))),
      shown(await postTransfer(db, U.manager, await transferDraft(db, U.manager, W.general2, W.general, '2026-10-23', [{ item: I.gas, qty: 1 }]))),
    ],
    ['date_too_old', 'ok'],
    'اليوم −8 ← date_too_old، واليوم −7 يُقبل',
  );
  // المعاينة تقول نفس رمز الترحيل لليوم −8 و−7 (ومنطقة الجلسة بيوم الخادم الحقيقي بـzoneSweep، برّا اليوم الثابت).
  const dateDrafts = { old: await transferDraft(db, U.manager, W.general2, W.general, '2026-10-22', [{ item: I.gas, qty: 1 }]), edge: await transferDraft(db, U.manager, W.general2, W.general, '2026-10-23', [{ item: I.gas, qty: 1 }]) };
  const previewCodes = async (docId) => (await asM('select public.preview_transfer($1)', [docId])).value.problems.map((p) => p.code);
  t.same([await previewCodes(dateDrafts.old.id), await previewCodes(dateDrafts.edge.id)], [['date_too_old'], []], 'المعاينة: اليوم −8 date_too_old واليوم −7 بلا مشكلة، مثل الترحيل');

  // ── الانتهاء (القاعدة 14): المنتهي ما ينسحب ويتسمّى بالرفض، وانتهاء بيوم المستند يُسحب ───────────────────────────────
  await postedOpening(db, U.manager, W.medicine, GO_LIVE, [
    { item: I.vaccine, qty: 10, value: 100000, expiry: '2026-10-29' },
    { item: I.vaccine, qty: 5, value: 60000, expiry: '2026-10-30' },
    { item: I.vaccine, qty: 4, value: 48000, expiry: '2026-11-15' },
  ]);
  const fefo = await postedTransfer(db, U.manager, W.medicine, W.farm1, TODAY, [{ item: I.vaccine, qty: 6 }]);
  const drawn = fefo.result.lines[0].draws.map((d) => d.qty);
  t.same(drawn, ['5.000', '1.000'], 'FEFO: المنتهي أمس يُترك، والمنتهي اليوم أوّل (5)، ثم الأقرب انتهاءً (1)');
  const expiredOnly = await postTransfer(db, U.manager, await transferDraft(db, U.manager, W.medicine, W.farm1, TODAY, [{ item: I.vaccine, qty: 4 }]));
  t.ok(!expiredOnly.ok && expiredOnly.code === 'insufficient_stock' && expiredOnly.hint.includes('10 قطع منتهية'), `المتاح 3 والمنتهي 10 ← الرفض يسمّي المنتهي لحاله (${expiredOnly.hint})`);
  const medBoard = (await asM('select public.stock_on_hand($1, null, 50)', [W.medicine])).value.rows.find((r) => r.item_id === I.vaccine);
  t.same([medBoard.available, medBoard.expired, medBoard.near_expiry], ['3.000', '10.000', '3.000'], 'لوحة الأدوية: المتاح والمنتهي (عمود منفصل) وقريب الانتهاء');
  const hints = [early.hint, expiredOnly.hint, consumed.hint, outOfOrder.hint];
  t.same(hints.filter((hint) => /800,000|800000|6,911,066|3,472,897|100,000|100000/u.test(hint)), [], 'التلميحات بكميات بلا قيم (R6)');

  // ── الحدّ الأدنى (E22) والرئيسية ────────────────────────────────────────────────────────────────────────────
  const kerosene = await item('كاز أبيض', 'fuel', 'L', { minQty: 600 });
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: kerosene, qty: 500, value: 375000 }]);
  await postedOpening(db, U.manager, W.raw, GO_LIVE, [{ item: kerosene, qty: 200, value: 150000 }]);
  const lowBoard = (await call(db, U.storekeeper, 'select public.stock_on_hand($1, null, 50)', [W.general])).value;
  t.same(lowBoard.rows.filter((r) => r.below_min).map((r) => r.name), ['كاز أبيض'], 'الحدّ الأدنى بمخازن الاستلام (العامّة) بس: 500 < 600، والوقود بالمعمل ما ينحسب');
  const home = (await call(db, U.storekeeper, 'select public.home_summary()')).value;
  t.same([home.accounts, home.stock.map((d) => [d.kind, d.below_min])], [undefined, [['general', 1]]], 'رئيسية الأمين: بلا بطاقة حسابات، وتنبيه المخازن العامة بنطاقه بس');
  const managerHome = (await asM('select public.home_summary()')).value.stock;
  t.same(Object.fromEntries(managerHome.map((d) => [d.kind, [d.below_min, d.near_expiry, Number(d.old_chicks)]])).medicine, [0, 1, 0], 'رئيسية المدير: الأدوية بمادّة قريبة الانتهاء');
  t.same(Object.fromEntries(managerHome.map((d) => [d.kind, Number(d.old_chicks)])).hatchery, 100, 'رئيسية المدير: 100 فرخ فاتها 48 ساعة بالمفقس');

  // ── الأرشفة والإلغاء (E35، E43) ───────────────────────────────────────────────────────────────────────────
  t.eq(shown(await asM("update public.warehouses set archived_at = 'now' where id = $1", [W.medicine])), 'archived_in_use', 'مخزن بيه رصيد ما يتؤرشف (E35)');
  t.eq(shown(await asM("update public.items set archived_at = 'now' where id = $1", [kerosene])), 'archived_in_use', 'مادّة بيها رصيد ما تتؤرشف (E35)');
  const gasOut = await postedTransfer(db, U.manager, W.general2, W.general, TODAY, [{ item: I.gas, qty: 9 }]);
  t.eq(shown(await asM("update public.warehouses set archived_at = 'now' where id = $1", [W.general2])), 'ok', 'المخزن الثاني صفر بعد التحويل: يتؤرشف');
  t.eq(shown(await voidTransfer(db, U.manager, gasOut.id)), 'ok', 'إلغاء التحويل بعد أرشفة مصدره ينجح (E43)');
  const archivedBoard = (await asM('select public.stock_on_hand($1, null, 50)', [W.general2])).value.warehouse;
  t.same([archivedBoard.archived, archivedBoard.has_balance], [true, true], 'المخزن المؤرشف وعليه رصيد بعلامته');
  // العلامة بقائمة المخازن (إعدادات المنشأة ومنتقي المخزن، §2.6) من دالّة بلا قيم لكل دور، بنطاقه: الأمين بنطاق العامّ ما يشوف الثاني.
  t.same(
    [(await asM('select public.archived_stores_with_stock()')).value, (await call(db, U.storekeeper, 'select public.archived_stores_with_stock()')).value],
    [[W.general2], []],
    'قائمة المخازن المؤرشفة وعليها رصيد: المدير يشوف المخزن الثاني، والأمين بنطاق العامّ ما يشوفه',
  );
  t.eq(shown(await postTransfer(db, U.manager, await transferDraft(db, U.manager, W.general, W.general2, TODAY, [{ item: I.gas, qty: 1 }]))), 'warehouse_archived', 'تحويل جديد لمخزن مؤرشف ← warehouse_archived');

  // ── تجميد النوع بعد أوّل حركة ─────────────────────────────────────────────────────────────────────────────
  t.eq(shown(await asM("update public.items set kind = 'other' where id = $1", [I.diesel])), 'frozen_column', 'نوع المادّة ثابت بعد أوّل حركة');
  t.eq(shown(await asM("update public.items set kind = 'other' where id = $1", [await item('مادّة بلا حركة', 'fuel', 'L')])), 'ok', 'ضابط: مادّة بلا حركة يتغيّر نوعها');
  const frozenWarehouse = await db.asOwner((q) => q("update public.warehouses set kind = 'feed' where id = $1", [W.raw])).then(() => 'ok', (error) => error.message);
  t.eq(frozenWarehouse, 'frozen_column', 'نوع المخزن ثابت بعد أوّل حركة حتى لصاحب الجداول');

  // ── متابعة الانتهاء تتغيّر بعد الرصيد (0005 يسمح): دفعة بلا تاريخ لمادّة صارت تتابعه متاحة مو مختفية، ودفعة بتاريخ لمادّة بطّلت
  // تتابعه مو «قريب الانتهاء» (E22). كان (يتابع و انتهاء < يوم) = NULL فينشال الصفّ من المتاح والمنتهي والقيم والمجاميع والحدّ.
  const untracked = await item('مطهّر بلا تاريخ', 'medicine', 'pc', { minQty: 50 });
  const dated = await item('مرهم بتاريخ', 'medicine', 'pc', { tracksExpiry: true });
  await postedOpening(db, U.manager, W.medicine, GO_LIVE, [{ item: untracked, qty: 100, value: 1000 }, { item: dated, qty: 10, value: 500, expiry: '2026-11-05' }]);
  t.same(
    [shown(await asM('update public.items set tracks_expiry = true where id = $1', [untracked])), shown(await asM('update public.items set tracks_expiry = false where id = $1', [dated]))],
    ['ok', 'ok'],
    'المدير يشغّل متابعة الانتهاء لمادّة بيها رصيد ويطفّيها لثانية',
  );
  const switched = (await asM('select public.stock_on_hand($1, null, 200)', [W.medicine])).value.rows;
  const switchedRow = (itemId) => switched.find((r) => r.item_id === itemId);
  t.same(
    [scaled(switchedRow(untracked).available, 3), scaled(switchedRow(untracked).expired, 3), switchedRow(untracked).below_min, scaled(switchedRow(dated).near_expiry, 3)],
    [100_000n, 0n, false, 0n],
    'اللوحة: 100 قطعة بلا تاريخ متاحة وفوق حدّها، والمادّة اللي بطّلت تتابع الانتهاء مو «قريب الانتهاء»',
  );
  const switchedValue = (await call(db, U.accountant, 'select public.stock_values($1, null, 200)', [W.medicine])).value.rows.find((r) => r.item_id === untracked);
  t.same([scaled(switchedValue.available, 2), scaled(switchedValue.expired, 2)], [100000n, 0n], 'قيمة المتاح 1,000.00 مو صفر');
  const switchedTotals = (await call(db, U.accountant, 'select public.stock_value_totals($1)', [W.medicine])).value.money;
  t.eq(scaled(switchedTotals.available, 2) + scaled(switchedTotals.expired, 2), scaled(switchedTotals.total, 2), 'المجاميع: المتاح + المنتهي = الكلّ (ولا دفعة تختفي من الطرفين)');
  const takeAll = await transferDraft(db, U.manager, W.medicine, W.farm1, TODAY, [{ item: untracked, qty: 100 }]);
  const takeAllLine = (await asM('select public.preview_transfer($1)', [takeAll.id])).value.lines[0];
  t.same([scaled(takeAllLine.available, 3), takeAllLine.whole_balance], [100_000n, true], 'المعاينة: المتاح 100 والسطر يسحب الرصيد كلّه (تأكيد E31)');
  t.same((await asM('select public.home_summary()')).value.stock.find((d) => d.kind === 'medicine').below_min, 0, 'رئيسية المدير: المادّة فوق حدّها ما تنعدّ تحت الحدّ الأدنى');

  // ── المسوّدات: حذف السطر وطيّ المسوّدة وإعادة الترحيل بعد الإلغاء (E13، E20، E52) ────────────────────────────────────
  const shelf = await transferDraft(db, U.storekeeper, W.general, W.raw, TODAY, [{ item: kerosene, qty: 1 }, { item: kerosene, qty: 2 }]);
  const deleted = await call(db, U.storekeeper, "select public.delete_draft_line('transfer', $1, $2)", [shelf.lines[0], shelf.version]);
  t.same([deleted.value?.deleted, deleted.value?.version], [true, shelf.version + 1], 'حذف سطر المسوّدة بدالّته، والنسخة تزيد');
  t.same((await call(db, U.storekeeper, "select public.delete_draft_line('transfer', $1, $2)", [shelf.lines[0], shelf.version])).value?.deleted, false, 'إعادة حذف سطر انحذف ← deleted: false');
  t.eq(shown(await call(db, U.storekeeper, "select public.delete_draft_line('transfer', $1, $2)", [shelf.lines[1], shelf.version])), 'stale_draft', 'حذف بنسخة قديمة ← stale_draft');
  t.eq(shown(await call(db, U.storekeeper, "select public.discard_draft('transfer', $1, $2)", [shelf.id, shelf.version + 1])), 'ok', 'طيّ المسوّدة');
  t.same((await db.admin('select status, doc_no from public.transfers where id = $1', [shelf.id])).rows[0], { status: 'void', doc_no: null }, 'المطويّة void بلا رقم');
  t.eq(shown(await postTransfer(db, U.storekeeper, { ...shelf, version: shelf.version + 2 })), 'not_draft', 'المطويّة ما تنرحّل');
  // نسخة فارغة (null) مو «أي نسخة» (§2.5): NULL <> رقم يطلع NULL فكان الشرط ما يتنفّذ والمسوّدة تنرحّل أو تنطوي بنسختها الحالية.
  const loose = await transferDraft(db, U.storekeeper, W.general, W.raw, TODAY, [{ item: kerosene, qty: 1 }]);
  const looseOpening = await openingDraft(db, U.manager, W.general, GO_LIVE, [{ item: await item('كاز النسخة', 'fuel', 'L'), qty: 1, value: 750 }]);
  const once = { commit: false };
  t.same(
    {
      postTransfer: shown(await call(db, U.storekeeper, 'select public.post_transfer($1, null, public.preview_transfer($1) ->> \'plan\', $2)', [loose.id, uid()], once)),
      postOpening: shown(await call(db, U.manager, 'select public.post_opening_stock($1, null, $2)', [looseOpening.id, uid()], once)),
      discard: shown(await call(db, U.storekeeper, "select public.discard_draft('transfer', $1, null)", [loose.id], once)),
      deleteLine: shown(await call(db, U.storekeeper, "select public.delete_draft_line('transfer', $1, null)", [loose.lines[0]], once)),
      discardOpening: shown(await call(db, U.manager, "select public.discard_draft('opening', $1, null)", [looseOpening.id], once)),
      deleteOpeningLine: shown(await call(db, U.manager, "select public.delete_draft_line('opening', $1, null)", [looseOpening.lines[0]], once)),
    },
    { postTransfer: 'stale_draft', postOpening: 'stale_draft', discard: 'stale_draft', deleteLine: 'stale_draft', discardOpening: 'stale_draft', deleteOpeningLine: 'stale_draft' },
    'نسخة فارغة ← stale_draft بالترحيل والطيّ وحذف السطر (النوعين)',
  );
  // طيّ مسوّدة الافتتاح وحذف سطرها بفعلها (opening.post) ونطاق مخزنها: الأمين (transfer.post بنطاق العامّ) ممنوع، والمدير المحصور
  // بالأدوية خارج نطاقه، والمدير ينجح.
  t.same(
    {
      keeperDiscard: shown(await call(db, U.storekeeper, "select public.discard_draft('opening', $1, $2)", [looseOpening.id, looseOpening.version], once)),
      keeperDelete: shown(await call(db, U.storekeeper, "select public.delete_draft_line('opening', $1, $2)", [looseOpening.lines[0], looseOpening.version], once)),
      scopedDiscard: shown(await call(db, U.scopedManager, "select public.discard_draft('opening', $1, $2)", [looseOpening.id, looseOpening.version], once)),
      scopedDelete: shown(await call(db, U.scopedManager, "select public.delete_draft_line('opening', $1, $2)", [looseOpening.lines[0], looseOpening.version], once)),
      managerDelete: (await call(db, U.manager, "select public.delete_draft_line('opening', $1, $2) ->> 'deleted'", [looseOpening.lines[0], looseOpening.version], once)).value,
      managerDiscard: (await call(db, U.manager, "select public.discard_draft('opening', $1, $2) ->> 'status'", [looseOpening.id, looseOpening.version])).value,
    },
    { keeperDiscard: 'forbidden', keeperDelete: 'forbidden', scopedDiscard: 'out_of_scope', scopedDelete: 'out_of_scope', managerDelete: 'true', managerDiscard: 'void' },
    'طيّ مسوّدة الافتتاح وحذف سطرها: الأمين forbidden، والمحصور بمخزن ثاني out_of_scope، والمدير ينجح',
  );
  t.same((await db.admin('select status, voided_at is not null as voided from public.opening_docs where id = $1', [looseOpening.id])).rows[0], { status: 'void', voided: true }, 'مسوّدة الافتتاح المطويّة void');
  const priced = await openingDraft(db, U.manager, W.raw, GO_LIVE, [{ item: I.corn, qty: 100, value: 45000 }]);
  const direct = await db.asUser(U.manager, (q) => q('delete from public.opening_lines where id = $1', [priced.lines[0]])).then(() => 'ok', (error) => error.code);
  t.eq(direct, '42501', 'حذف سطر مباشرةً بلا صلاحية (E52)');
  t.eq((await asM("select public.delete_draft_line('opening', $1, $2)", [priced.lines[0], priced.version])).value?.deleted, true, 'سطر الافتتاح المسعَّر ينحذف بدالّته');
  const repost = await postedOpening(db, U.manager, W.raw, GO_LIVE, [{ item: I.corn, qty: 100, value: 45000 }]);
  t.eq(shown(await voidOpening(db, U.manager, repost.id)), 'ok', 'إلغاء افتتاح ما انسحب منه');
  t.eq(shown(await postOpening(db, U.manager, await openingDraft(db, U.manager, W.raw, GO_LIVE, [{ item: I.corn, qty: 120, value: 54000 }]))), 'ok', 'إعادة الافتتاح بعد إلغاء كامل تُقبل (E20)');

  // ── لوحة وبطاقة وقيم ─────────────────────────────────────────────────────────────────────────────────────
  const page1 = (await asM('select public.item_lots_qty($1, $2, null, 1)', [I.vaccine, W.medicine])).value;
  const page2 = (await asM('select public.item_lots_qty($1, $2, $3, 1)', [I.vaccine, W.medicine, JSON.stringify(page1.next)])).value;
  t.same([page1.total, page1.rows.map((r) => r.expiry_on), page2.rows.map((r) => r.expiry_on), page2.next], [2, ['2026-10-29'], ['2026-11-15'], null], 'دفعات اللقاح بترتيب السحب بصفحات (المؤشّر معرّف الدفعة)');
  t.ok(!JSON.stringify(page1).includes('fifo_seq'), 'fifo_seq ما يطلع للواجهة');
  const totals = (await call(db, U.accountant, 'select public.stock_value_totals($1)', [W.feed])).value;
  t.same([totals.money.total, totals.units.map((u) => [u.base_unit, u.available, u.expired])], ['6911066.67', [['kg', '9950.000', '0']]], 'مجاميع مخزن العلف من SQL: 6,911,066.67 و9,950 كغم');
  const vaccineValues = (await call(db, U.accountant, 'select public.stock_values($1, null, 50)', [W.medicine])).value.rows.find((r) => r.item_id === I.vaccine);
  t.same([vaccineValues.available, vaccineValues.expired], ['36000.00', '100000.00'], 'قيمة المتاح والمنتهي لكل مادّة');
  const lotValues = (await call(db, U.accountant, 'select public.item_lots_value($1, $2, null, 50)', [I.vaccine, W.medicine])).value.rows;
  const money = await loadSrc('src/domain/money.ts');
  t.same(lotValues.map((l) => money.unitCost4(scaled(l.value_left, 2), scaled(l.qty_left, 3)).toString()), ['100000000', '120000000'], 'كلفة الوحدة للعرض بأربع مراتب من القيمة ÷ الكمية (القاعدة 9)');

  // ── تطابق ترتيب السحب وقيمته: SQL draw_plan (المعاينة) وdraw (الترحيل نفسه) = fifo.planDraw على مجموعات مولّدة ──────────────
  // before: كميات سطور قبله من نفس المادّة بترتيبها (كل سطر سحب لحاله). draw يقفل ويرمي بالنقص، فكل نداء بنقطة حفظ ترجع.
  // والعدّادات تثبت إن كل فرع انمرّ فعلاً: كل المتبقّي، والجزئي، والمنتهي المتروك، وfifo_seq متعادلة، وانتهاء فارغ ويّا تاريخ.
  const fifo = await loadSrc('src/domain/fifo.ts');
  const random = rng(20261030);
  const pick = (list) => list[Math.floor(random() * list.length)];
  let compared = 0;
  const mismatches = [];
  const branches = { whole: 0, partial: 0, expiredSkipped: 0, seqTie: 0, mixedExpiry: 0, before: 0, shortage: 0 };
  await db.asOwner(
    async (q) => {
      for (let n = 0; n < 60; n += 1) {
        const tracks = n % 2 === 0;
        const itemId = (await q("insert into public.items (org_id, name, kind, base_unit, tracks_expiry) values ($1, $2, 'fuel', 'L', $3) returning id", [S.org, `تطابق ${n}`, tracks])).rows[0].id;
        const seqs = [1, 2, 2, 3, 5];
        const lots = [];
        for (let k = 0, count = 1 + Math.floor(random() * 7); k < count; k += 1) {
          const qtyIn = BigInt(1 + Math.floor(random() * 50_000));
          const qtyLeft = random() < 0.2 ? qtyIn : BigInt(1 + Math.floor(random() * Number(qtyIn)));
          const valueLeft = random() < 0.1 ? 0n : BigInt(Math.floor(random() * 1_000_000_00));
          const lot = { id: crypto.randomUUID(), fifoSeq: BigInt(pick(seqs) + n * 10), receivedOn: pick(['2026-10-20', '2026-10-25', '2026-10-28']), expiryOn: pick([null, null, '2026-10-24', '2026-10-28', '2026-11-30']), qtyLeft, valueLeft };
          lots.push(lot);
          await q(
            "insert into public.stock_lots (id, org_id, item_id, warehouse_id, fifo_seq, received_on, expiry_on, qty_in, value_in, qty_left, value_left, source_kind, source_id) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $8, $9, 'opening', gen_random_uuid())",
            [lot.id, S.org, itemId, W.general, lot.fifoSeq.toString(), lot.receivedOn, lot.expiryOn, decimal(qtyLeft, 3), decimal(valueLeft, 2)],
          );
        }
        for (let c = 0; c < 4; c += 1) {
          const day = pick(['2026-10-24', '2026-10-26', '2026-10-29', '2026-12-01']);
          const qty = BigInt(1 + Math.floor(random() * 120_000));
          const before = Array.from({ length: c % 2 === 0 ? 0 : 1 + Math.floor(random() * 3) }, () => BigInt(1 + Math.floor(random() * 20_000)));
          const sql = (await q('select lot_id, qty::text as qty, value::text as value from private.draw_plan($1, $2, $3, $4, null, false, $5::numeric[])', [itemId, W.general, decimal(qty, 3), day, before.map((b) => decimal(b, 3))])).rows
            .map((r) => `${r.lot_id}:${scaled(r.qty, 3)}:${scaled(r.value, 2)}`);
          const plan = fifo.planDraw(lots, qty, day, { tracksExpiry: tracks, before });
          const ts = plan.draws.map((d) => `${d.lotId}:${d.qty}:${d.value}`);
          compared += 1;
          if (JSON.stringify(sql) !== JSON.stringify(ts)) mismatches.push({ n, c, fn: 'draw_plan', day, qty: qty.toString(), before: before.map(String), sql, ts });
          // الترحيل نفسه (private.draw) على الدفعات كما هي (بلا سطور قبله): نفس القطع، أو insufficient_stock إذا الخطّة نقص.
          const fresh = fifo.planDraw(lots, qty, day, { tracksExpiry: tracks });
          await q('savepoint draw');
          let posted;
          try {
            posted = (await q('select lot_id, qty::text as qty, value::text as value from private.draw($1, $2, $3, $4, null, false)', [itemId, W.general, decimal(qty, 3), day])).rows.map((r) => `${r.lot_id}:${scaled(r.qty, 3)}:${scaled(r.value, 2)}`);
          } catch (error) {
            posted = error.message;
          } finally {
            await q('rollback to savepoint draw');
          }
          const want = fresh.shortage > 0n ? 'insufficient_stock' : fresh.draws.map((d) => `${d.lotId}:${d.qty}:${d.value}`);
          if (JSON.stringify(posted) !== JSON.stringify(want)) mismatches.push({ n, c, fn: 'draw', day, qty: qty.toString(), posted, want });
          const eligible = fifo.eligibleLots(lots, day, { tracksExpiry: tracks });
          const drawn = new Map(lots.map((lot) => [lot.id, lot]));
          for (const d of fresh.draws) {
            if (d.qty === drawn.get(d.lotId).qtyLeft) branches.whole += 1;
            else branches.partial += 1;
          }
          if (tracks && lots.some((lot) => lot.qtyLeft > 0n && lot.receivedOn <= day && lot.expiryOn !== null && lot.expiryOn < day)) branches.expiredSkipped += 1;
          if (new Set(eligible.map((lot) => lot.fifoSeq)).size < eligible.length) branches.seqTie += 1;
          if (eligible.some((lot) => lot.expiryOn === null) && eligible.some((lot) => lot.expiryOn !== null)) branches.mixedExpiry += 1;
          if (before.length > 0) branches.before += 1;
          if (fresh.shortage > 0n) branches.shortage += 1;
        }
      }
    },
    U.owner,
  );
  t.same(mismatches.slice(0, 3), [], `ترتيب السحب وقيمته: SQL (draw_plan وdraw) = fifo.planDraw بـ${compared} حالة`);
  t.same(Object.entries(branches).filter(([, n]) => n === 0).map(([name]) => name), [], `كل فرع انمرّ بالتطابق (${JSON.stringify(branches)})`);

  // ── draftWriteLock للنوعين (FOUNDATION ٥٢٦) ──────────────────────────────────────────────────────────────────
  const vaccine2 = await item('لقاح ثانٍ', 'vaccine', 'pc', { tracksExpiry: true });
  await draftWriteLock(t, db, {
    name: 'الافتتاح',
    user: U.manager,
    draft: async () => {
      const doc = await openingDraft(db, U.manager, W.medicine, GO_LIVE, [{ item: vaccine2, qty: 1, value: 1000, expiry: '2027-01-01' }]);
      return { id: doc.id, version: doc.version, lineId: doc.lines[0] };
    },
    posted: async () => {
      const doc = await postedOpening(db, U.manager, W.medicine, GO_LIVE, [{ item: vaccine2, qty: 1, value: 1000, expiry: '2027-01-01' }]);
      return { id: doc.id, version: doc.version, lineId: doc.lines[0] };
    },
    insertHeader: (status) => ({ sql: 'insert into public.opening_docs (warehouse_id, on_date, status) values ($1, $2, $3)', params: [W.medicine, GO_LIVE, status] }),
    setStatus: (doc, status) => ({ sql: 'update public.opening_docs set status = $2 where id = $1', params: [doc.id, status] }),
    editLine: (doc) => ({ sql: 'update public.opening_lines set qty_base = qty_base + 1 where id = $1', params: [doc.lineId] }),
    editAmount: (doc) => ({ sql: 'update public.opening_lines set value = value + 1 where id = $1', params: [doc.lineId] }),
  });
  await draftWriteLock(t, db, {
    name: 'التحويل',
    user: U.storekeeper,
    draft: async () => {
      const doc = await transferDraft(db, U.storekeeper, W.general, W.raw, TODAY, [{ item: kerosene, qty: 1 }]);
      return { id: doc.id, version: doc.version, lineId: doc.lines[0] };
    },
    posted: async () => {
      const doc = await postedTransfer(db, U.storekeeper, W.general, W.raw, TODAY, [{ item: kerosene, qty: 1 }]);
      return { id: doc.id, version: doc.version, lineId: doc.lines[0] };
    },
    insertHeader: (status) => ({ sql: 'insert into public.transfers (from_warehouse_id, to_warehouse_id, moved_on, status) values ($1, $2, $3, $4)', params: [W.general, W.raw, TODAY, status] }),
    setStatus: (doc, status) => ({ sql: 'update public.transfers set status = $2 where id = $1', params: [doc.id, status] }),
    editLine: (doc) => ({ sql: 'update public.transfer_lines set qty_in_unit = qty_in_unit + 1 where id = $1', params: [doc.lineId] }),
  });

  // ── سحب 500 دفعة تحت حدّ الطلب (GT-30، R12): الترحيل نفسه بحدود PostgREST (statement_timeout 8s) ──────────────────────────
  const bulk = await item('كاز للأداء', 'fuel', 'L');
  const bulkDoc = await openingDraft(db, U.manager, W.general, GO_LIVE, Array.from({ length: 500 }, (_, k) => ({ item: bulk, qty: 1, value: 700 + (k % 7) })));
  t.eq(shown(await postOpening(db, U.manager, bulkDoc)), 'ok', 'افتتاح بـ500 سطر = 500 دفعة');
  const started = Date.now();
  const bulkMove = await postTransfer(db, U.manager, await transferDraft(db, U.manager, W.general, W.raw, TODAY, [{ item: bulk, qty: 500 }]));
  const elapsed = Date.now() - started;
  t.ok(bulkMove.ok && bulkMove.value.lines[0].draws.length === 500 && elapsed < 8000, `تحويل يسحب 500 دفعة بـ${elapsed}ms تحت حدّ 8 ثوانٍ`);

  // ── verify_stock صفر بأسماء فحوصه، وكل فحص يمسك كسره (ضوابط بمعاملات ترجع، بمنشأة هالملف) ───────────────────────────────
  t.same(await db.asService(verifyStock), STOCK_ZERO, `verify_stock صفر بأسماء فحوصه الـ${Object.keys(STOCK_ZERO).length} بالضبط`);
  const lotIdOf = async (itemId, wh) => (await lotsOf(db, itemId, wh))[0].id;
  const t0Draw = (
    await db.admin(
      "select id, doc_kind, doc_id, doc_line_id, item_id, warehouse_id, lot_id, qty::text as qty, value::text as value, moved_on::text as moved_on from public.stock_moves where doc_id = $1 and qty < 0 and reverses_move_id is null",
      [t0.id],
    )
  ).rows[0];
  const youngChicks = (await lotsOf(db, I.chicks, W.chick)).find((l) => l.qty_left === '50').id;
  const probe = async (statements) => {
    try {
      return await db.asOwner(async (q) => {
        await statements(q);
        return verifyStock(q);
      }, U.owner);
    } catch (error) {
      return `رمى: ${error.message}`;
    }
  };
  const insertMove = (q, m) =>
    q(
      'insert into public.stock_moves (id, org_id, doc_kind, doc_id, doc_line_id, item_id, warehouse_id, lot_id, qty, value, moved_on, reverses_move_id, expiry_checked) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
      [m.id ?? uid(), S.org, m.doc_kind, m.doc_id, m.doc_line_id ?? null, m.item_id, m.warehouse_id, m.lot_id, m.qty, m.value, m.moved_on, m.reverses ?? null, m.expiry_checked ?? null],
    );
  // ضوابط الفحوص 9–11 بطفرة حقيقية: الدالّة نفسها مكسورة داخل معاملة ترجع، والترحيل يمرّ بالكسر (بصمة المعاينة من draw_plan
  // المكسور بنفس الطريقة)، فالفحوص الثمانية الأولى صفر والجديد يقلب (مراجعة WP4 الثانية: هاي الأخطاء كانت تمرّ بكل الفحوص).
  const fnDef = async (sig) => (await db.admin('select pg_get_functiondef($1::regprocedure) as d', [sig])).rows[0].d;
  const swap = (text, from, to) => {
    if (!text.includes(from)) throw new Error(`مرساة الطفرة غير موجودة: ${from}`);
    return text.split(from).join(to);
  };
  const drawDef = await fnDef('private.draw(uuid,uuid,numeric,date,uuid,boolean)');
  const planDef = await fnDef('private.draw_plan(uuid,uuid,numeric,date,uuid,boolean,numeric[])');
  const openDef = await fnDef('public.post_opening_stock(uuid,integer,uuid)');
  const voidDef = await fnDef('public.void_transfer(uuid,text,uuid)');
  const viaPreview = (q, draft) => q("select public.post_transfer($1, $2, public.preview_transfer($1) ->> 'plan', gen_random_uuid())", [draft.id, draft.version]);
  const lifoItem = await item('كاز الترتيب', 'fuel', 'L');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: lifoItem, qty: 100, value: 100 }, { item: lifoItem, qty: 100, value: 300 }]);
  const lifoDraft = await transferDraft(db, U.manager, W.general, W.raw, TODAY, [{ item: lifoItem, qty: 50 }]);
  const splitItem = await item('كاز القسمة', 'fuel', 'L');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: splitItem, qty: 3, value: 10 }]);
  const splitDraft = await transferDraft(db, U.manager, W.general, W.raw, TODAY, [{ item: splitItem, qty: 2 }]);
  const doubleDraft = await openingDraft(db, U.manager, W.general, GO_LIVE, [{ item: await item('كاز الضعف', 'fuel', 'L'), qty: 10, value: 100 }]);
  const halfItem = await item('كاز الإلغاء الناقص', 'fuel', 'L');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: halfItem, qty: 10, value: 10 }, { item: halfItem, qty: 10, value: 30 }]);
  const halfTransfer = await postedTransfer(db, U.manager, W.general, W.raw, TODAY, [{ item: halfItem, qty: 15 }]);
  const freeItem = await item('كاز هدية', 'fuel', 'L');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: freeItem, qty: 10, value: 0, zeroReason: 'هدية من المورّد' }]);
  const freeDraft = await transferDraft(db, U.manager, W.general, W.raw, TODAY, [{ item: freeItem, qty: 4 }]);
  const postDef = await fnDef('public.post_transfer(uuid,integer,text,uuid)');
  const LIFO = ['order by l.expiry_on asc nulls last, l.fifo_seq, l.id', 'order by l.expiry_on asc nulls last, l.fifo_seq desc, l.id'];
  const BREAKS = {
    balance_identity: [{ balance_identity: 1 }, (q) => q('update public.stock_balances set qty = qty + 1 where item_id = $1 and warehouse_id = $2', [I.diesel, W.farm1])],
    // دفعة بلا حركتها الأصلية بمخزن عنده صفّ رصيد: المتبقّي صفر فالأرصدة والمجاميع ما تتغيّر، وبلا سطر ولا حركة فـdoc_moves ما يشوفها.
    lot_moves: [{ lot_moves: 1 }, (q) => q("insert into public.stock_lots (org_id, item_id, warehouse_id, fifo_seq, received_on, qty_in, value_in, qty_left, value_left, source_kind, source_id) values ($1, $2, $3, 999997, $4, 5, 50, 0, 0, 'opening', gen_random_uuid())", [S.org, I.gas, W.general2, TODAY])],
    // دفعة الافتتاح نفسها: سطرها بوقت فقس، فالمستند (doc_moves) يختلف هم.
    lot_shape: [{ lot_shape: 1, doc_moves: 1 }, (q) => q('update public.stock_lots set born_at = null where id = $1', [youngChicks])],
    // عكسية بمستند غير مستند أصلها، وسحب يعادلها بمستند ثالث: المستند (doc_moves) يختلف بالحركتين وبسطر الأصل المعكوس وهو مرحَّل.
    reversal_pairs: [{ reversal_pairs: 1, doc_moves: 3 }, async (q) => {
      await q('alter table public.stock_moves disable trigger stock_moves_check');
      await insertMove(q, { ...t0Draw, id: undefined, qty: t0Draw.qty.slice(1), value: t0Draw.value.slice(1), doc_id: uid(), reverses: t0Draw.id });
      await insertMove(q, { ...t0Draw, id: undefined, doc_id: uid(), doc_line_id: null, expiry_checked: false });
    }],
    // المرآة ومرآتها (40 لتراً بالحقل) كلتاهما تخالفان انتهاء مصدرهما بعد الكسر.
    mirror_pairs: [{ mirror_pairs: 2 }, (q) => q("update public.stock_lots set expiry_on = '2027-01-01' where id = $1", [dieselMirror.id])],
    draw_dates: [{ draw_dates: 1, doc_moves: 2 }, async (q) => {
      const early2 = uid();
      const doc = uid();
      await insertMove(q, { id: early2, doc_kind: 'transfer', doc_id: doc, item_id: I.diesel, warehouse_id: W.raw, lot_id: dieselMirror.id, qty: -1, value: -800, moved_on: '2026-10-27', expiry_checked: false });
      await insertMove(q, { doc_kind: 'transfer', doc_id: doc, item_id: I.diesel, warehouse_id: W.raw, lot_id: dieselMirror.id, qty: 1, value: 800, moved_on: TODAY, reverses: early2 });
    }],
    admissible: [{ admissible: 'many' }, async (q) => {
      await q('alter table public.items disable trigger items_stock_guard');
      await q("update public.items set kind = 'feed' where id = $1", [I.diesel]);
    }],
    // قيمة سطر الافتتاح غير قيمة دفعته: الطرفان بالحفظ (8) والمستند (11) يختلفان.
    value_conservation: [{ value_conservation: 1, doc_moves: 1 }, async (q) => {
      await q('alter table public.opening_lines disable trigger opening_lines_guard');
      await q('update public.opening_lines set value = value + 1 where doc_id = $1', [dieselDoc.id]);
    }],
    posted_division_stamped: [{ posted_division_stamped: 1 }, (q) => q('update public.divisions set first_posted_at = null where id = $1', [S.divisions.feed_mill])],
    // 9: قطعة جزئية تقريبها مقطوع (6.66 بدل 6.67 لـ2 من 3 لترات بـ10.00) بالمصدر والمرآة سوا.
    draw_values: [{ draw_values: 1 }, async (q) => {
      const trunc = ['private._mul_div_round2(v_take, c.value_left, c.qty_left)', 'trunc(v_take * c.value_left / c.qty_left, 2)'];
      await q(swap(drawDef, ...trunc));
      await q(swap(planDef, 'private._mul_div_round2(v_take, v_vl[v_k], v_ql[v_k])', 'trunc(v_take * v_vl[v_k] / v_ql[v_k], 2)'));
      await viaPreview(q, splitDraft);
    }],
    // 10: السحب من الأحدث (LIFO): 50 لتراً بـ150.00 بدل 50.00، والقطعة ومرآتها متساويتان.
    draw_order: [{ draw_order: 1 }, async (q) => {
      await q(swap(drawDef, ...LIFO));
      await q(swap(planDef, 'over (order by l.expiry_on asc nulls last, l.fifo_seq, l.id)', 'over (order by l.expiry_on asc nulls last, l.fifo_seq desc, l.id)'));
      await viaPreview(q, lifoDraft);
    }],
    // 11: دفعة افتتاح بضعف كمية سطرها (وحركتها نفسها)، فكلفة الوحدة نصّ: الدفعة وحركتها والقيمة متّفقة، والمستند وحده يختلف.
    doc_moves: [{ doc_moves: 1 }, async (q) => {
      let def = swap(openDef, 'ln.born_at, ln.qty_base, ln.value', 'ln.born_at, ln.qty_base * 2, ln.value');
      def = swap(def, 'ln.id, ln.qty_base, ln.value, d.on_date', 'ln.id, ln.qty_base * 2, ln.value, d.on_date');
      await q(def);
      await q('select public.post_opening_stock($1, $2, gen_random_uuid())', [doubleDraft.id, doubleDraft.version]);
    }],
  };
  t.same(Object.keys(BREAKS).sort(), Object.keys(STOCK_ZERO).sort(), `كل فحص بـverify_stock إله ضابط كسر (${Object.keys(STOCK_ZERO).length})`);
  // ضوابط ثانية لفرع ثاني بنفس الفحص: سحب من دفعة لقاح منتهية بيوم السحب (الفحص 6 بشقّ الانتهاء، مو الاستلام)، ووقت فقس على
  // دفعة مو أفراخ (الفحص 3).
  const expiredVial = (await lotsOf(db, I.vaccine, W.medicine)).find((l) => l.expiry_on === '2026-10-29');
  const keroseneRawLot = await lotIdOf(kerosene, W.raw);
  const EXTRA_BREAKS = {
    'draw_dates (منتهية بيوم السحب)': ['draw_dates', [{ draw_dates: 1, doc_moves: 2 }, async (q) => {
      const drawn = uid();
      const doc = uid();
      await insertMove(q, { id: drawn, doc_kind: 'transfer', doc_id: doc, item_id: I.vaccine, warehouse_id: W.medicine, lot_id: expiredVial.id, qty: -1, value: -10000, moved_on: TODAY, expiry_checked: true });
      await insertMove(q, { doc_kind: 'transfer', doc_id: doc, item_id: I.vaccine, warehouse_id: W.medicine, lot_id: expiredVial.id, qty: 1, value: 10000, moved_on: TODAY, reverses: drawn });
    }]],
    'lot_shape (وقت فقس لغير الأفراخ)': ['lot_shape', [{ lot_shape: 1, doc_moves: 1 }, (q) => q('update public.stock_lots set born_at = now() where id = $1', [keroseneRawLot])]],
    // سحب أصلي بلا علامة الانتهاء: كل حزمة تكتبها (الفحص 6 بعلامة يوم السحب).
    'draw_dates (سحب بلا علامة الانتهاء)': ['draw_dates', [{ draw_dates: 1, doc_moves: 2 }, async (q) => {
      const drawn = uid();
      const doc = uid();
      await insertMove(q, { id: drawn, doc_kind: 'transfer', doc_id: doc, item_id: I.diesel, warehouse_id: W.raw, lot_id: dieselMirror.id, qty: -1, value: -800, moved_on: TODAY });
      await insertMove(q, { doc_kind: 'transfer', doc_id: doc, item_id: I.diesel, warehouse_id: W.raw, lot_id: dieselMirror.id, qty: 1, value: 800, moved_on: TODAY, reverses: drawn });
    }]],
    // إلغاء ناقص: الأولى من قطعتين انعكست والتحويل صار ملغى، والثانية ومرآتها باقيتان (قطعة السطر بلا عكس، وحركتان بمستند ملغى).
    // مرآة ضاعت بقيمة صفر (المراجعة الثانية للإصلاحات): 4 لترات طلعت من المصدر وما وصلت مكان، والقيمة صفر فالحفظ ومرايا
    // المصدر ما يشوفونها؛ المستند (المستلم بكمية السطر) يشوفها.
    'doc_moves (مرآة ضايعة بقيمة صفر)': ['doc_moves', [{ doc_moves: 1 }, async (q) => {
      let def = swap(postDef, '      m := private.mirror_lot(dr.lot_id, wt.id, dr.qty, dr.value, d.moved_on, d.id, ln.id);\n', '');
      def = swap(def, "      perform private.apply_move(m.id, 'transfer', d.id, ln.id, dr.qty, dr.value, d.moved_on, null);\n", '');
      await q(def);
      await viaPreview(q, freeDraft);
    }]],
    'doc_moves (إلغاء ناقص)': ['doc_moves', [{ doc_moves: 3 }, async (q) => {
      await q(swap(voidDef, 'order by x.source_line_id, x.id loop', 'order by x.source_line_id, x.id limit 1 loop'));
      await q('select public.void_transfer($1, $2, gen_random_uuid())', [halfTransfer.id, 'ضابط الإلغاء الناقص']);
    }]],
  };
  for (const [check, [expected, statements]] of [...Object.entries(BREAKS), ...Object.entries(EXTRA_BREAKS).map(([label, [, probe]]) => [label, probe])]) {
    const broken = await probe(statements);
    const many = Object.entries(expected).filter(([, v]) => v === 'many').map(([k]) => k);
    const fixed = typeof broken === 'string' ? broken : Object.fromEntries(Object.entries(broken).filter(([k]) => !many.includes(k)));
    const want = Object.fromEntries(Object.entries({ ...STOCK_ZERO, ...expected }).filter(([k]) => !many.includes(k)));
    t.ok(typeof broken !== 'string' && many.every((k) => broken[k] > 0) && JSON.stringify(fixed) === JSON.stringify(want), `ضابط: كسر ${check} يقلب ${Object.keys(expected).join(' و')} بالعدد المتوقّع والباقي صفر (${JSON.stringify(broken)})`);
  }

  // عمر الفرخ وتنبيه 48 ساعة للأفراخ بس (E24): دفعة وقود عليها وقت فقس (لو عبرت) ما تصير «أفراخ فاتها 48 ساعة» باللوحة والرئيسية.
  const fuelBorn = await db.asOwner(async (q) => {
    await q("update public.stock_lots set born_at = now() - interval '60 hours' where id = $1", [keroseneRawLot]);
    const row = (await q('select public.stock_on_hand($1, null, 200) as v', [W.raw])).rows[0].v.rows.find((r) => r.item_id === kerosene);
    const mill = (await q('select public.home_summary() as v')).rows[0].v.stock.find((d) => d.kind === 'feed_mill');
    return [row.chick_age_hours, scaled(row.old_chicks, 3), Number(mill.old_chicks)];
  }, U.owner);
  t.same(fuelBorn, [null, 0n, 0], 'وقود بوقت فقس: بلا عمر فرخ ولا «أفراخ فاتها 48 ساعة» باللوحة ولا بالرئيسية');

  // ── رقم TR بـverify_ledger (الفحص 11): العدّاد والرقم ينفحصان ويّا RC وPY ─────────────────────────────────────────
  const ledgerNumbers = async (statement) =>
    db.asOwner(async (q) => {
      if (statement) await q(statement, [S.org]);
      return (await q("select violations::int as v from public.verify_ledger() where check_name = 'doc_numbers'")).rows[0].v;
    }, U.owner);
  t.same(
    [await ledgerNumbers(null), await ledgerNumbers("update public.doc_counters set last_no = last_no + 1 where org_id = $1 and kind = 'TR'"), await ledgerNumbers("update public.transfers set doc_no = 'TR-2026-0099' where org_id = $1 and doc_no = 'TR-2026-0002'")],
    [0, 1, 1],
    'verify_ledger.doc_numbers يمسك عدّاد TR زايداً، ورقم تحويل بفجوة',
  );
}
