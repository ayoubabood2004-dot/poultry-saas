// الصرف لفوج القاعة (0019؛ كلمة المالك 2026-11-07، DECISIONS «المعمل بالبطاقات، وصرف العلف للقاعات»): العلف المنتَج في المعمل يُصرف لفوج
// القاعة بنداء واحد (record_flock_issue) يُرحَّل فوراً — سحب بترتيب السحب (القواعد ١٢–١٤) بحركات flock_issue، وسطر كلفة على الفوج بقيمة
// السحب بالضبط، ورقم FI — وبين وحدتين صادر داخليّ بالكلفة بلا قيد ولا مصروف؛ والقارئان «ما يُصرف» (المنتَج في المعمل أوّلاً، و«عندك» بنطاق
// القارئ) و«علف القاعة» (المصروف والمستهلك المسجّل والباقي)؛ والقيمة مقنَّعة للأمين وعامل القاعة؛ والإعادة بالمرجع أو بالمعرّف ترجع المخزَّن
// وغيرها id_conflict، والملغى «أُلغي»؛ والمخزن يُختار وحده أو store_required أو insufficient_stock بتلميح «عندك» والمنتهي؛ وكلّ رفض بتلميحه؛
// والإلغاء يعكس الحركات على دفعاتها نفسها بيومه وسطر الكلفة بصفّ عكسيّ؛ والتزامن: صرفان لآخر رصيد يترتّبان، ومعرّف واحد بمرجعين يرجع
// النتيجة نفسها؛ وverify_flock_issues وverify_stock بضوابط؛ وطفرات تكسر كلّ قاعدة فيفشل فحصها (آخر الملف).
import { writeFileSync } from 'node:fs';
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { postedOpening, postedTransfer } from './stock-kit.mjs';

const TODAY = '2026-11-07';
const id = (n) => `b1900000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477099900${String(n).padStart(2, '0')}`;
/** يوم بإزاحة من اليوم المثبَّت (YYYY-MM-DD). */
const day = (offset) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);

const RF = 'select public.record_flock_issue($1, $2, $3, $4, $5, $6, $7, $8) as v';
const VF = 'select public.void_flock_issue($1, $2, $3) as v';
const OPTIONS = 'select public.flock_issue_options($1) as v';
const FEED = 'select public.flock_feed($1) as v';
const FN = {
  record: 'public.record_flock_issue(uuid, uuid, uuid, uuid, uuid, numeric, date, uuid)',
  void: 'public.void_flock_issue(uuid, text, uuid)',
  options: 'public.flock_issue_options(uuid)',
  feed: 'public.flock_feed(uuid)',
  mass: 'private.issue_mass_kg(numeric, text, numeric)',
  kind: 'private.flock_cost_kind(text)',
  verify: 'public.verify_flock_issues()',
  verifyStock: 'public.verify_stock()',
};

/** نصّ عشري بلا أصفار زائدة («1500.000» ← «1500»)، والفارغ كما هو. */
const norm = (value) => {
  if (value === null || value === undefined) return value;
  const text = String(value);
  return text.includes('.') ? text.replace(/0+$/u, '').replace(/\.$/u, '') : text;
};
/** أيّ مفتاح money بأيّ عمق. */
const hasMoney = (value) => {
  if (Array.isArray(value)) return value.some(hasMoney);
  if (value && typeof value === 'object') return Object.entries(value).some(([key, v]) => key === 'money' || hasMoney(v));
  return false;
};
const keys = (value) => Object.keys(value ?? {}).sort();
const shownOf = (result) => (result.ok ? 'ok' : result.code);

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  // ── المنشأة: الأدوار الثمانية، وأمين بنطاق المعمل والحقول (يصرف من مخزن العلف للقاعات)، وأمين بنطاق المعمل وحده، وأمين بنطاق الحقول وحده ──
  const G = await makeOrg(db, {
    name: 'مزرعة صرف العلف',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['storekeeper', 'storekeeper', ['feed_mill', 'broiler']],
      ['accountant', 'accountant'],
      ['millOperator', 'mill_operator', ['feed_mill']],
      ['hatcheryOperator', 'hatchery_operator', ['hatchery']],
      ['hallWorker', 'hall_worker', ['broiler']],
      ['viewer', 'viewer'],
      ['keeperMill', 'storekeeper', ['feed_mill']],
      ['keeperFarm', 'storekeeper', ['broiler']],
      ['managerLayer', 'manager', ['layer']],
    ],
  });
  const { users: U, divisions: D, org } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  const site = (division, name) => one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, $2, 'farm') returning id", [D[division], name]);
  const farmSite = await site('broiler', 'حقل الأمل');
  const layerSite = await site('layer', 'حقل البيض');
  W.farm = await one(U.owner, "insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن حقل الأمل', 'farm') returning id", [D.broiler, farmSite]);
  const millSite = (await db.admin('select site_id from public.warehouses where id = $1', [W.raw])).rows[0].site_id;
  W.archived = await one(U.owner, "insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن علف مؤرشف', 'feed') returning id", [D.feed_mill, millSite]);
  await one(U.owner, 'update public.warehouses set archived_at = now() where id = $1 returning id', [W.archived]);
  const hall = (siteId, name) => one(U.owner, 'insert into public.halls (site_id, name) values ($1, $2) returning id', [siteId, name]);
  const H = { a: await hall(farmSite, 'قاعة 1'), b: await hall(farmSite, 'قاعة 2'), c: await hall(farmSite, 'قاعة 3'), d: await hall(farmSite, 'قاعة 4'), layer: await hall(layerSite, 'قاعة البيّاض') };
  const open = async (hallId, on, count) => (await one(U.owner, 'select public.open_flock($1, $2, $3, 0, null, $4) as v', [hallId, on, count, uid()])).flock_id;
  const F = { a: await open(H.a, day(-10), 5000), b: await open(H.b, day(-3), 3000), d: await open(H.d, day(-2), 2000), layer: await open(H.layer, day(-10), 4000) };
  // فوج «قاعة 3» قيد التحضير (لا دالّة تكتبه في النسخة الأولى): إدخال بمفتاح الإدارة لفحص flock_not_placed.
  F.c = (await db.admin("insert into public.flocks (org_id, hall_id, site_id, division_id, kind, opened_on, status) values ($1, $2, $3, $4, 'broiler', $5, 'preparing') returning id",
    [org, H.c, farmSite, D.broiler, day(-1)])).rows[0].id;

  const item = (name, kind, unit, extra = {}) =>
    one(U.owner, 'insert into public.items (name, kind, base_unit, density_kg_per_l, tracks_expiry) values ($1, $2, $3, $4, $5) returning id', [name, kind, unit, extra.density ?? null, extra.tracksExpiry ?? false]);
  const I = {
    corn: await item('ذرة صفراء', 'raw', 'kg'),
    starter: await item('علف بادئ', 'feed', 'kg'),
    finisher: await item('علف ناهي', 'feed', 'kg'),
    oil: await item('زيت الصويا', 'raw', 'L', { density: 0.92 }),
    molasses: await item('دبس', 'raw', 'L'),
    newcastle: await item('لقاح نيوكاسل', 'vaccine', 'pc', { tracksExpiry: true }),
    gumboro: await item('لقاح جمبورو', 'vaccine', 'pc', { tracksExpiry: true }),
    vitamin: await item('فيتامين', 'medicine', 'kg'),
    diesel: await item('كاز', 'fuel', 'L'),
    curtains: await item('ستائر', 'equipment', 'pc'),
    chicks: await item('أفراخ لحم', 'chick', 'pc'),
    old: await item('علف قديم', 'feed', 'kg'),
    race: await item('علف التزامن', 'feed', 'kg'),
  };
  await one(U.owner, 'update public.items set archived_at = now() where id = $1 returning id', [I.old]);

  // ── المخزون: افتتاح بالمواد الأوّلية والعلف والأدوية والعامّ قبل تسعة أيّام، وشراء بلقاح صالح وعلف ناهٍ، وإنتاج «علف بادئ» في المعمل أمس ──
  await postedOpening(db, U.owner, W.raw, day(-9), [{ item: I.corn, qty: 2000, value: '900000.00' }, { item: I.oil, qty: 200, value: '300000.00' }, { item: I.molasses, qty: 50, value: '25000.00' }]);
  await postedOpening(db, U.owner, W.feed, day(-9), [{ item: I.starter, qty: 200, value: '100000.00' }, { item: I.finisher, qty: 1000, value: '520000.00' }, { item: I.race, qty: 100, value: '50000.00' }]);
  await postedOpening(db, U.owner, W.medicine, day(-9), [{ item: I.newcastle, qty: 100, value: '50000.00', expiry: day(-1) }, { item: I.gumboro, qty: 40, value: '20000.00', expiry: day(-1) }, { item: I.vitamin, qty: 20, value: '40000.00' }]);
  await postedOpening(db, U.owner, W.general, day(-9), [{ item: I.diesel, qty: 1000, value: '800000.00' }, { item: I.curtains, qty: 10, value: '50000.00' }]);
  const supplier = await one(U.owner, "insert into public.parties (name, is_supplier) values ('شركة اللقاحات', true) returning id");
  const buy = (o) => one(U.owner, 'select public.record_purchase($1, $2, $3, $4, $5, $6, $7, $8, null, \'credit\', null, $9, $10, null) as v',
    [uid(), uid(), uid(), o.item, supplier, o.on, o.qty, o.price, o.wh, o.expiry ?? null]);
  await buy({ item: I.newcastle, on: day(-2), qty: 300, price: 600, wh: W.medicine, expiry: '2027-06-30' });
  await buy({ item: I.finisher, on: day(-2), qty: 500, price: 600, wh: W.feed });
  const recipe = { id: uid(), version: uid() };
  await one(U.owner, 'select public.create_recipe($1, $2, $3, $4, 1000, $5::jsonb, \'[]\'::jsonb, true) as v',
    [recipe.id, recipe.version, 'خلطة بادئ', I.starter, JSON.stringify([{ item_id: I.corn, qty: 1000, unit: 'kg' }])]);
  const batch = uid();
  await one(U.owner, 'select public.create_production($1, $2, 1000, $3, $4, $5) as v', [batch, recipe.version, W.raw, W.feed, day(-1)]);
  await one(U.owner, "select public.post_production($1, (select version from public.production_batches where id = $1), public.preview_production($1) ->> 'plan_token', $2) as v", [batch, uid()]);
  const lotsOf = async (itemId, wh) => (await db.admin(`select id, source_kind, trim_scale(qty_left)::text as qty, trim_scale(value_left)::text as value
    from public.stock_lots where item_id = $1 and warehouse_id = $2 order by fifo_seq, id`, [itemId, wh])).rows;
  t.same((await lotsOf(I.starter, W.feed)).map((l) => [l.source_kind, l.qty, l.value]), [['opening', '200', '100000'], ['production', '1000', '450000']],
    'البذرة: «علف بادئ» في مخزن العلف دفعتان، افتتاح 200 كغم بـ100,000 وإنتاج المعمل 1,000 كغم بكلفته 450,000');

  // الإعادة: كلّ معرّف يولد مرّة لكلّ نافذة، والغائب يُولَّد هنا.
  const given = (o, key, fallback) => (o[key] === undefined ? fallback() : o[key]);
  const args = (o) => [given(o, 'ref', uid), given(o, 'issue', uid), given(o, 'line', uid), given(o, 'flock', () => F.a), o.item, o.qty, o.on === undefined ? TODAY : o.on, o.wh ?? null];
  const rf = (user, o, options) => call(db, user, RF, args(o), options);
  const vf = (user, issue, reason = 'صرف خاطئ', ref = uid(), options) => call(db, user, VF, [issue, reason, ref], options);
  const options = async (user, flock = F.a) => call(db, user, OPTIONS, [flock], { commit: false });
  const feed = async (user, flock = F.a) => call(db, user, FEED, [flock], { commit: false });
  const samples = { refusals: {} };
  const refusal = (label, result) => {
    if (!result.ok) samples.refusals[label] = { code: result.code, hint: result.hint };
    return result;
  };

  // ── ١) «ما يُصرف» قبل أيّ صرف: المنتَج في المعمل أوّلاً، ثمّ العلف، ثمّ بقية «علف» الكلفة، ثمّ الدواء والوقود؛ والمنتهي خارج «عندك» ──────────
  const ownerOptions = await options(U.owner);
  t.ok(ownerOptions.ok, `flock_issue_options للمالك (${ownerOptions.code ?? ''} ${ownerOptions.hint ?? ''})`);
  const optionRows = ownerOptions.value.items.map((x) => [x.name, x.cost_kind, norm(x.on_hand_qty), x.made_in_mill, x.stores.length]);
  t.same(optionRows, [
    ['علف بادئ', 'feed', '1200', true, 1],
    ['علف التزامن', 'feed', '100', false, 1],
    ['علف ناهي', 'feed', '1500', false, 1],
    ['دبس', 'feed', '50', false, 1],
    ['ذرة صفراء', 'feed', '1000', false, 1],
    ['زيت الصويا', 'feed', '200', false, 1],
    ['ستائر', 'other', '10', false, 1],
    ['فيتامين', 'medicine', '20', false, 1],
    ['كاز', 'fuel', '1000', false, 1],
    ['لقاح نيوكاسل', 'vaccine', '300', false, 1],
  ], 'الخيارات: المنتَج في المعمل أوّلاً ثمّ العلف ثمّ المواد الأوّلية (علف الكلفة) ثمّ الباقي بالاسم؛ «لقاح نيوكاسل» 300 بلا المنتهي، و«جمبورو» المنتهي كلّه غائب، والأفراخ والمؤرشف لا تُصرف');
  t.same([ownerOptions.value.hall_name, ownerOptions.value.site_name, ownerOptions.value.can_issue, ownerOptions.value.today, ownerOptions.value.earliest_on, ownerOptions.value.flock_status],
    ['قاعة 1', 'حقل الأمل', true, TODAY, day(-7), 'active'], 'الخيارات: القاعة والحقل ويوم اليوم وأقدم تاريخ (7 أيّام)، والمالك يصرف');
  t.same(ownerOptions.value.items[0].stores.map((x) => [x.warehouse_id, x.name, norm(x.qty)]), [[W.feed, 'مخزن العلف', '1200']], 'الخيارات: مخازن المادّة بكمياتها');
  const keeperOptions = await options(U.storekeeper);
  t.same([keeperOptions.value.can_issue, keeperOptions.value.items.map((x) => x.name)], [true, ['علف بادئ', 'علف التزامن', 'علف ناهي', 'دبس', 'ذرة صفراء', 'زيت الصويا']],
    'الخيارات للأمين بنطاق المعمل والحقول: مخازن نطاقه وحدها (لا أدوية ولا عامّ)');
  const workerOptions = await options(U.hallWorker);
  t.same([workerOptions.ok, workerOptions.value?.can_issue, workerOptions.value?.items.length], [true, false, 0], 'الخيارات لعامل القاعة: يقرأ قاعته ولا يصرف، ولا مخزن في نطاقه فيه مادّة');
  t.same([shownOf(await options(U.keeperMill)), shownOf(await options(U.owner, uid()))], ['out_of_scope', 'flock_not_found'], 'الخيارات: الفوج خارج النطاق، والفوج غير الموجود');

  // ── ٢) الصرف: الأمين يصرف 500 كغم «علف بادئ» لقاعة 1 من مخزن العلف (الوحيد فيه متاح)، سحب FIFO: كلّ دفعة الافتتاح + 300 من الإنتاج ──────
  const before = await feed(U.owner);
  t.same([norm(before.value.issued_feed_kg), before.value.issues.length], ['0', 0], 'علف القاعة قبل الصرف: صفر');
  const ledgerRows = async () => (await db.admin('select (select count(*) from public.party_entries where org_id = $1)::int + (select count(*) from public.expenses where org_id = $1)::int as n', [org])).rows[0].n;
  const ledgerBefore = await ledgerRows();
  const r1 = { ref: uid(), issue: uid(), line: uid(), item: I.starter, qty: 500 };
  const first = await rf(U.storekeeper, r1);
  t.ok(first.ok, `الأمين يصرف «علف بادئ» لقاعة 1 (${first.code ?? ''} ${first.hint ?? ''})`);
  t.same(keys(first.value), ['base_unit', 'cost_kind', 'doc_no', 'flock_id', 'hall_id', 'hall_name', 'id', 'issued_on', 'item_id', 'item_name', 'line_id', 'qty', 'status', 'warehouse_id', 'warehouse_name'],
    'نتيجة الأمين بمفاتيح العقد بلا money (القيمة لأدوار الكلفة)');
  t.same([first.value.doc_no, first.value.status, first.value.issued_on, first.value.hall_name, first.value.item_name, first.value.warehouse_name, norm(first.value.qty), first.value.base_unit, first.value.cost_kind],
    ['FI-2026-0001', 'posted', TODAY, 'قاعة 1', 'علف بادئ', 'مخزن العلف', '500', 'kg', 'feed'], 'نتيجة الصرف: الرقم والقاعة والمادّة والمخزن والكمية');
  t.same((await lotsOf(I.starter, W.feed)).map((l) => [l.qty, l.value]), [['0', '0'], ['700', '315000']], 'السحب بالترتيب: دفعة الافتتاح كلّها (100,000 بالضبط) ثمّ 300 من دفعة الإنتاج (135,000)');
  const movesOf = async (issueId) => (await db.admin(`select trim_scale(qty)::text as qty, trim_scale(value)::text as value, moved_on::text as on, expiry_checked, reverses_move_id is not null as reversal
    from public.stock_moves where doc_kind = 'flock_issue' and doc_id = $1 order by seq`, [issueId])).rows;
  t.same((await movesOf(r1.issue)).map((m) => [m.qty, m.value, m.on, m.expiry_checked]), [['-200', '-100000', TODAY, false], ['-300', '-135000', TODAY, false]], 'حركتان flock_issue بيوم الصرف');
  const costsOf = async (issueId) => (await db.admin(`select kind, trim_scale(amount)::text as amount, on_date::text as on, reverses_id is not null as reversal, flock_id, site_id, expense_id
    from public.flock_costs where doc_id = $1 order by created_at, reverses_id nulls first`, [issueId])).rows;
  t.same((await costsOf(r1.issue)).map((c) => [c.kind, c.amount, c.on, c.reversal, c.flock_id, c.site_id, c.expense_id]), [['feed', '235000', TODAY, false, F.a, farmSite, null]],
    'سطر كلفة واحد على الفوج بقيمة السحب بالضبط (235,000)، نوعه علف، بلا مصروف');
  t.eq(await ledgerRows(), ledgerBefore, 'صادر داخليّ بين المعمل والحقل بالكلفة: لا قيد جهة ولا مصروف');
  const divisionsPosted = (await db.admin('select kind, first_posted_at is not null as posted from public.divisions where org_id = $1 and kind in ($2, $3) order by kind', [org, 'broiler', 'feed_mill'])).rows;
  t.same(divisionsPosted.map((d) => [d.kind, d.posted]), [['broiler', true], ['feed_mill', true]], 'وحدتا المخزن والفوج مختومتان بأوّل ترحيل');

  // الإعادة: بالمرجع نفسه (جواب ضاع) النتيجة المخزَّنة نفسها بلا مال للأمين، وللمالك بمرجع جديد ومعرّفات الأمين: id_conflict (منشئ آخر).
  const again = await rf(U.storekeeper, r1);
  t.same([again.ok, again.value], [true, first.value], 'الإعادة بالمرجع نفسه ترجع النتيجة نفسها بلا مال');
  const sameIds = await rf(U.storekeeper, { ...r1, ref: uid() });
  t.same([sameIds.ok, sameIds.value], [true, first.value], 'الإعادة بالمعرّفات نفسها ومرجع جديد (جواب ضاع ثمّ مرجع آخر) ترجع ما حُفظ');
  t.same((await movesOf(r1.issue)).length, 2, 'الإعادتان لم تسحبا شيئاً');
  t.eq(refusal('id_conflict (المحتوى)', await rf(U.storekeeper, { ...r1, ref: uid(), qty: 499 })).code, 'id_conflict', 'المعرّف نفسه بكمية أخرى: id_conflict');
  t.eq(refusal('id_conflict (سطر مستعمل)', await rf(U.storekeeper, { line: r1.line, item: I.starter, qty: 1 })).code, 'id_conflict', 'معرّف السطر مستعمل: id_conflict');
  t.eq(refusal('ref_reused', await rf(U.storekeeper, { ...r1, qty: 1 })).code, 'ref_reused', 'المرجع نفسه بمحتوى آخر: ref_reused');

  // ── ٣) اختيار المخزن: «علف بادئ» في مخزنين بنطاق الأمين ← store_required بأسمائهما وكمياتهما؛ ومع المخزن يُصرف منه ───────────────
  await postedTransfer(db, U.owner, W.feed, W.farm, TODAY, [{ item: I.starter, qty: 100 }]);
  const twoStores = refusal('store_required', await rf(U.storekeeper, { item: I.starter, qty: 50 }));
  t.ok(twoStores.code === 'store_required' && twoStores.hint.includes('«مخزن العلف» (600 كغم)') && twoStores.hint.includes('«مخزن حقل الأمل» (100 كغم)'),
    `مخزنان فيهما المادّة: store_required بأسمائهما وكمياتهما (${twoStores.hint})`);
  const fromFarm = await rf(U.keeperFarm, { item: I.starter, qty: 100, wh: W.farm });
  t.same([fromFarm.ok, fromFarm.value?.warehouse_name, fromFarm.value?.doc_no], [true, 'مخزن حقل الأمل', 'FI-2026-0002'], `أمين الحقول يصرف من مخزن الحقل (${fromFarm.code ?? ''} ${fromFarm.hint ?? ''})`);

  // ── ٤) أنواع أخرى (المالك): زيت باللتر بكثافته، ودبس باللتر بلا كثافة، ولقاح من الصالح دون المنتهي، وكاز، وستائر بالقطعة ─────────────
  const oil = await rf(U.owner, { item: I.oil, qty: 100 });
  const molasses = await rf(U.owner, { item: I.molasses, qty: 10 });
  const vaccine = await rf(U.owner, { item: I.newcastle, qty: 50 });
  const diesel = await rf(U.owner, { item: I.diesel, qty: 20 });
  const curtains = await rf(U.owner, { item: I.curtains, qty: 2 });
  t.same([oil, molasses, vaccine, diesel, curtains].map((r) => (r.ok ? [r.value.cost_kind, norm(r.value.money.value)] : r.code)),
    [['feed', '150000'], ['feed', '5000'], ['vaccine', '30000'], ['fuel', '16000'], ['other', '10000']],
    'الزيت والدبس علف بالكلفة، واللقاح من الدفعة الصالحة (50 × 600)، والكاز وقود، والستائر أخرى؛ وقيمها للمالك');
  t.same((await lotsOf(I.newcastle, W.medicine)).map((l) => [l.source_kind, l.qty]), [['opening', '100'], ['receipt', '250']], 'المنتهي لا يُسحب: دفعة الافتتاح المنتهية كما هي');

  // ── ٥) الرفوض بتلميحاتها ────────────────────────────────────────────────────────────────────────────────────
  const cases = [
    ['forbidden (مشغّل المعمل)', U.millOperator, { item: I.starter, qty: 1 }, 'forbidden'],
    ['forbidden (عامل القاعة)', U.hallWorker, { item: I.starter, qty: 1 }, 'forbidden'],
    ['forbidden (المحاسب)', U.accountant, { item: I.starter, qty: 1 }, 'forbidden'],
    ['forbidden (المشاهد)', U.viewer, { item: I.starter, qty: 1 }, 'forbidden'],
    ['id_required', U.owner, { issue: null, item: I.starter, qty: 1 }, 'id_required'],
    ['flock_not_found', U.owner, { flock: uid(), item: I.starter, qty: 1 }, 'flock_not_found'],
    ['out_of_scope (الفوج)', U.keeperMill, { item: I.starter, qty: 1 }, 'out_of_scope', 'قاعة هذا الفوج'],
    ['out_of_scope (المخزن)', U.keeperFarm, { item: I.starter, qty: 1, wh: W.feed }, 'out_of_scope', '«مخزن العلف»'],
    ['flock_not_placed', U.owner, { flock: F.c, item: I.starter, qty: 1 }, 'flock_not_placed', '«قاعة 3»'],
    ['item_not_found', U.owner, { item: uid(), qty: 1 }, 'item_not_found'],
    ['item_archived', U.owner, { item: I.old, qty: 1 }, 'item_archived', '«علف قديم»'],
    ['not_issuable', U.owner, { item: I.chicks, qty: 1 }, 'not_issuable', 'بالتسكين'],
    ['qty_not_positive (صفر)', U.owner, { item: I.starter, qty: 0 }, 'qty_not_positive'],
    ['qty_not_positive (مراتب)', U.owner, { item: I.starter, qty: 1.2345 }, 'qty_not_positive'],
    ['pieces_not_whole', U.owner, { item: I.curtains, qty: 1.5 }, 'pieces_not_whole', 'عدداً صحيحاً'],
    ['date_required', U.owner, { item: I.starter, qty: 1, on: null }, 'date_required'],
    ['date_in_future', U.owner, { item: I.starter, qty: 1, on: day(1) }, 'date_in_future'],
    ['date_too_old', U.owner, { item: I.starter, qty: 1, on: day(-8) }, 'date_too_old'],
    ['before_placement', U.owner, { flock: F.b, item: I.starter, qty: 1, on: day(-4) }, 'before_placement'],
    ['warehouse_not_found', U.owner, { item: I.starter, qty: 1, wh: uid() }, 'warehouse_not_found'],
    ['warehouse_archived', U.owner, { item: I.starter, qty: 1, wh: W.archived }, 'warehouse_archived', '«مخزن علف مؤرشف»'],
    ['item_kind_mismatch', U.owner, { item: I.starter, qty: 1, wh: W.medicine }, 'item_kind_mismatch', '«مخزن الأدوية»'],
    ['insufficient_stock (المخزن)', U.owner, { item: I.starter, qty: 5000, wh: W.feed }, 'insufficient_stock', 'عندك 600 كغم'],
    ['insufficient_stock (المنتهي في المخزن)', U.owner, { item: I.newcastle, qty: 300 }, 'insufficient_stock', 'عندك 250 قطعة'],
    ['insufficient_stock (لا شيء في النطاق)', U.keeperFarm, { item: I.corn, qty: 5 }, 'insufficient_stock', 'عندك 0 كغم'],
    ['insufficient_stock (المنتهي كلّه)', U.owner, { item: I.gumboro, qty: 5 }, 'insufficient_stock', 'منتهية الصلاحية'],
    ['insufficient_stock (قبل الاستلام)', U.owner, { item: I.finisher, qty: 1200, on: day(-3) }, 'insufficient_stock', 'عندك 1,000 كغم'],
  ];
  const counts = async () => (await db.admin(`select (select count(*) from public.flock_issues where org_id = $1)::int as issues, (select count(*) from public.flock_costs where org_id = $1)::int as costs,
    (select count(*) from public.stock_moves where org_id = $1 and doc_kind = 'flock_issue')::int as moves`, [org])).rows[0];
  const countsBefore = await counts();
  const outcomes = [];
  for (const [label, user, o, , hintPart] of cases) {
    const result = refusal(label, await rf(user, o));
    outcomes.push(`${label}: ${shownOf(result)}${hintPart && !result.hint.includes(hintPart) ? ` (التلميح بلا «${hintPart}»: ${result.hint})` : ''}`);
  }
  t.same(outcomes, cases.map(([label, , , code]) => `${label}: ${code}`), `كلّ رفض برمزه وتلميحه (${cases.length})`);
  t.same(await counts(), countsBefore, 'الرفوض لم تكتب شيئاً (لا مسوّدة على النقص)');
  const emptyStock = samples.refusals['insufficient_stock (المنتهي كلّه)'].hint;
  t.ok(emptyStock.includes('لا يوجد «لقاح جمبورو»') && emptyStock.includes('40 قطعة'), `لا متاح في النطاق: التلميح يسمّي المادّة والمنتهي (${emptyStock})`);
  const expiredHint = samples.refusals['insufficient_stock (المنتهي في المخزن)'].hint;
  t.ok(expiredHint.includes('طلبت 300 قطعة') && expiredHint.includes('100 قطعة منتهية الصلاحية'), `النقص في المخزن: المطلوب والموجود والمنتهي (${expiredHint})`);

  // ── ٦) الإلغاء: الأمين يصرف 300 كغم «علف ناهي»، والمدير يلغيه: الحركات ترجع لدفعاتها بيوم الإلغاء، وسطر الكلفة بصفّ عكسيّ ────────────
  const r3 = { ref: uid(), issue: uid(), line: uid(), item: I.finisher, qty: 300, on: day(-1) };
  const finisherIssue = await rf(U.storekeeper, r3);
  t.same([finisherIssue.ok, finisherIssue.value?.issued_on], [true, day(-1)], `صرف «علف ناهي» بتاريخ أمس (${finisherIssue.code ?? ''})`);
  const lotsBeforeVoid = await lotsOf(I.finisher, W.feed);
  t.same(lotsBeforeVoid.map((l) => [l.qty, l.value]), [['700', '364000'], ['500', '300000']], 'السحب من دفعة الافتتاح وحدها (156,000)');
  t.eq(refusal('void: forbidden (الأمين)', await vf(U.storekeeper, r3.issue)).code, 'forbidden', 'الأمين لا يلغي');
  t.eq(refusal('void: reason_required', await vf(U.manager, r3.issue, ' ')).code, 'reason_required', 'الإلغاء بلا سبب: reason_required');
  t.eq(refusal('void: doc_not_found', await vf(U.manager, uid())).code, 'doc_not_found', 'صرف غير موجود: doc_not_found');
  const voidRef = uid();
  const voided = await vf(U.manager, r3.issue, 'كمية خاطئة', voidRef);
  t.same(voided.ok ? [voided.value.status, voided.value.reversed_moves, voided.value.voided_on, norm(voided.value.money.value)] : voided.code, ['void', 1, TODAY, '156000'],
    'الإلغاء: الحالة ملغى، وحركة واحدة عكسية، ويوم الإلغاء اليوم، وقيمته للمدير');
  t.same((await lotsOf(I.finisher, W.feed)).map((l) => [l.qty, l.value]), [['1000', '520000'], ['500', '300000']], 'الحركة رجعت لدفعتها نفسها بالفلس');
  t.same((await movesOf(r3.issue)).map((m) => [m.qty, m.on, m.reversal]), [['-300', day(-1), false], ['300', TODAY, true]], 'الأصل بيومه والعكسية بيوم الإلغاء');
  t.same((await costsOf(r3.issue)).map((c) => [c.amount, c.on, c.reversal]), [['156000', day(-1), false], ['-156000', TODAY, true]], 'سطر الكلفة وصفّه العكسيّ بيوم الإلغاء');
  const voidAgain = await vf(U.manager, r3.issue, 'كمية خاطئة', voidRef);
  t.same([voidAgain.ok, voidAgain.value?.status], [true, 'void'], 'إعادة الإلغاء بالمرجع نفسه ترجع نتيجته');
  t.eq(refusal('void: already_void', await vf(U.manager, r3.issue)).code, 'already_void', 'إلغاء الملغى بمرجع جديد: already_void');
  t.eq(refusal('id_conflict (أُلغي، المرجع نفسه)', await rf(U.storekeeper, r3)).code, 'id_conflict', 'إعادة صرف أُلغي بمرجعه: id_conflict «أُلغي»');
  const voidedRetry = refusal('id_conflict (أُلغي، مرجع جديد)', await rf(U.storekeeper, { ...r3, ref: uid() }));
  t.ok(voidedRetry.code === 'id_conflict' && voidedRetry.hint.includes('أُلغي'), `إعادة صرف أُلغي بمرجع جديد: id_conflict «أُلغي» (${voidedRetry.hint})`);
  const layerVoid = refusal('void: out_of_scope (الفوج)', await vf(U.managerLayer, first.value.id));
  t.ok(layerVoid.code === 'out_of_scope' && layerVoid.hint.includes('قاعة هذا الصرف'), `مدير بنطاق البيض لا يلغي صرفاً لقاعة لحم (${layerVoid.code} ${layerVoid.hint})`);

  // فوج مغلق: صرف لقاعة 2 ثمّ يُغلق (لا دالّة إغلاق بعد: مفتاح الإدارة)، فلا صرف له ولا إلغاء.
  const toB = await rf(U.owner, { flock: F.b, item: I.finisher, qty: 50 });
  t.ok(toB.ok, `صرف لقاعة 2 (${toB.code ?? ''})`);
  await db.admin("update public.flocks set status = 'closed', closed_on = $2 where id = $1", [F.b, TODAY]);
  t.same([refusal('flock_closed', await rf(U.owner, { flock: F.b, item: I.finisher, qty: 1 })).code, refusal('void: flock_closed', await vf(U.manager, toB.value.id)).code], ['flock_closed', 'flock_closed'],
    'الفوج المغلق: لا صرف له ولا إلغاء');

  // ── ٧) علف القاعة: المصروف من العلف بالكيلو، والمستهلك من الجولات اليومية، والباقي؛ والصرف الملغى خارج المصروف وباقٍ بالقائمة ─────────
  await one(U.hallWorker, 'select public.save_flock_day($1, $2, 0, 0, 120.5, null, null, null, null, null, null, null, null, $3, false) as v', [F.a, day(-1), uid()]);
  await one(U.hallWorker, 'select public.save_flock_day($1, $2, 0, 0, 130, null, null, null, null, null, null, null, null, $3, false) as v', [F.a, TODAY, uid()]);
  const ownerFeed = await feed(U.owner);
  t.same([norm(ownerFeed.value.issued_feed_kg), norm(ownerFeed.value.consumed_feed_kg), norm(ownerFeed.value.remaining_feed_kg), ownerFeed.value.unweighed_feed_lines, norm(ownerFeed.value.money.issued_value), ownerFeed.value.can_void],
    ['692', '250.5', '441.5', 1, '491000', true],
    'علف القاعة: 500 + 100 كغم بادئ + 92 كغم زيت (100 لتر × 0.92)، والدبس بلا كثافة يُعدّ ولا يُوزن، والمستهلك 250.5، والباقي 441.5؛ وقيمة الصرف الصافية 491,000 (الملغى صفر)');
  t.same(ownerFeed.value.issues.map((x) => [x.doc_no, x.status, x.item_name, norm(x.qty)]), [
    ['FI-2026-0007', 'posted', 'ستائر', '2'],
    ['FI-2026-0006', 'posted', 'كاز', '20'],
    ['FI-2026-0005', 'posted', 'لقاح نيوكاسل', '50'],
    ['FI-2026-0004', 'posted', 'دبس', '10'],
    ['FI-2026-0003', 'posted', 'زيت الصويا', '100'],
    ['FI-2026-0002', 'posted', 'علف بادئ', '100'],
    ['FI-2026-0001', 'posted', 'علف بادئ', '500'],
    ['FI-2026-0008', 'void', 'علف ناهي', '300'],
  ], 'قائمة الصرف الأحدث أوّلاً (بالتاريخ ثمّ وقت الترحيل)، والملغى بحالته');
  t.same([ownerFeed.value.issues.at(-1).voided_on, ownerFeed.value.issues.at(-1).void_reason, norm(ownerFeed.value.issues.at(-1).money.value)], [TODAY, 'كمية خاطئة', '156000'], 'الملغى بيوم إلغائه وسببه وقيمته');
  const keeperFeed = await feed(U.storekeeper);
  const workerFeed = await feed(U.hallWorker);
  const accountantFeed = await feed(U.accountant);
  t.same([hasMoney(keeperFeed.value), hasMoney(workerFeed.value), hasMoney(accountantFeed.value), keeperFeed.value.can_void, norm(workerFeed.value.issued_feed_kg)], [false, false, true, false, '692'],
    'القيمة للمحاسب ومشغّلي الكلفة، لا للأمين ولا لعامل القاعة؛ والكميات للجميع');
  t.same([shownOf(await feed(U.keeperMill)), shownOf(await feed(U.owner, uid()))], ['out_of_scope', 'flock_not_found'], 'علف القاعة: خارج النطاق وغير موجود');

  // بطاقة المادّة: الحركة برقم الصرف وبيان «صرف إلى قاعة 1 (حقل الأمل)».
  const ledger = await one(U.owner, 'select public.item_moves_qty($1, $2, null, 50) as v', [I.starter, W.feed]);
  const issueRow = ledger.rows.find((r) => r.doc_kind === 'flock_issue');
  t.same([issueRow?.doc, issueRow?.memo], ['FI-2026-0001', 'صرف إلى قاعة 1 (حقل الأمل)'], 'دفتر المادّة: رقم الصرف وبيانه');

  // ── ٨) الجداول: الكلفة لأدوار الكلفة بنطاق الحقل، والصرف بنطاق الحقل أو المخزن، ولا كتابة مباشرة لأحد ───────────────────────────────
  const tableCounts = async (user) => db.asUser(user, async (q) => Object.fromEntries(await Promise.all(['flock_issues', 'flock_issue_lines', 'flock_costs']
    .map(async (table) => [table, (await q(`select count(*)::int as n from public.${table}`)).rows[0].n]))));
  t.same(await tableCounts(U.owner), { flock_issues: 9, flock_issue_lines: 9, flock_costs: 10 }, 'المالك يقرأ الصرف وسطوره وكلفته');
  t.same(await tableCounts(U.storekeeper), { flock_issues: 9, flock_issue_lines: 9, flock_costs: 0 }, 'الأمين يقرأ الصرف بلا كلفته');
  t.same(await tableCounts(U.keeperMill), { flock_issues: 5, flock_issue_lines: 5, flock_costs: 0 }, 'أمين المعمل يقرأ صرف مخازن نطاقه وحدها (العلف والمواد الأوّلية)');
  t.same(await tableCounts(U.hallWorker), { flock_issues: 9, flock_issue_lines: 9, flock_costs: 0 }, 'عامل القاعة يقرأ صرف قاعاته بلا كلفة');
  const direct = await call(db, U.owner, 'insert into public.flock_costs (flock_id, site_id, kind, amount, doc_kind, doc_id, on_date) values ($1, $2, \'feed\', 1, \'flock_issue\', $3, $4) returning id', [F.a, farmSite, uid(), TODAY], { commit: false });
  t.eq(direct.code?.startsWith('42501'), true, `لا كتابة مباشرة في دفتر الكلفة ولو للمالك (${direct.code})`);
  const appendOnly = await db.asOwner(async (q) => {
    try {
      await q("update public.flock_costs set amount = amount + 1 where doc_id = $1", [r1.issue]);
      return 'ok';
    } catch (error) {
      return error.message;
    }
  });
  t.eq(appendOnly, 'append_only', 'دفتر الكلفة يُضاف ولا يُعدَّل حتى لصاحب الجداول');

  // ── ٩) التزامن: صرفان لآخر رصيد يترتّبان على الرصيد (الثاني يرى الأوّل)، ومعرّف واحد بمرجعين يرجع النتيجة نفسها بلا سطر ثانٍ ───────────
  const raceRun = async () => {
    const s1 = await db.session(U.storekeeper);
    const s2 = await db.session(U.owner);
    try {
      const a1 = await s1.run(RF, args({ item: I.race, qty: 80 }));
      const p2 = s2.run(RF, args({ item: I.race, qty: 80 }));
      const st2 = await db.settle(p2, s2.pid);
      await s1.commit();
      const a2 = await p2;
      return { a1, st2, a2 };
    } finally {
      await s1.rollback();
      await s2.rollback();
    }
  };
  const race = await raceRun();
  t.same([race.a1.ok, race.st2, race.a2.ok, race.a2.error], [true, 'blocked', false, 'insufficient_stock'], 'صرفان لآخر رصيد: الثاني ينتظر الأوّل ثمّ يرى النقص');
  const sameIdRun = async () => {
    const o = { issue: uid(), line: uid(), item: I.race, qty: 5 };
    const s1 = await db.session(U.storekeeper);
    const s2 = await db.session(U.storekeeper);
    try {
      const a1 = await s1.run(RF, args({ ...o, ref: uid() }));
      const p2 = s2.run(RF, args({ ...o, ref: uid() }));
      const st2 = await db.settle(p2, s2.pid);
      await s1.commit();
      const a2 = await p2;
      if (a2.ok) await s2.commit();
      return { a1, st2, a2, issue: o.issue };
    } finally {
      await s1.rollback();
      await s2.rollback();
    }
  };
  const sameId = await sameIdRun();
  t.same([sameId.a1.ok, sameId.st2, sameId.a2.ok, sameId.a2.rows?.[0]?.v?.doc_no === sameId.a1.rows?.[0]?.v?.doc_no, (await movesOf(sameId.issue)).length],
    [true, 'blocked', true, true, 1], `معرّف واحد بمرجعين بلحظة واحدة: الثاني ينتظر ثمّ يرجع ما حُفظ (${sameId.a2.error ?? ''})`);
  const original = (await db.admin('select pg_get_functiondef($1::regprocedure) as d', [FN.record])).rows[0].d;
  const ID_LOCK = "  perform pg_advisory_xact_lock(hashtextextended('flock_issue:' || p_issue_id::text, 0));\n";
  let lockMutant;
  try {
    if (original.split(ID_LOCK).length !== 2) throw new Error('مرساة قفل المعرّف ليست مرّة واحدة');
    await db.asOwner((q) => q(original.split(ID_LOCK).join('')), undefined, { commit: true });
    lockMutant = await sameIdRun();
  } finally {
    await db.asOwner((q) => q(original), undefined, { commit: true });
  }
  t.ok(!lockMutant.a2.ok && /duplicate key|flock_issues_pkey/u.test(lockMutant.a2.error), `طفرة: بلا قفل المعرّف يرى الثاني تعارض مفتاح بدل «حُفظ» (${lockMutant.st2}: ${lockMutant.a2.error ?? 'ok'})`);
  t.eq((await db.admin('select md5(pg_get_functiondef($1::regprocedure)) = md5($2) as same', [FN.record, original])).rows[0].same, true, 'الدالّة رجعت بتعريفها كما كان');

  // ── ١٠) الثوابت وضوابطها: بيانات حقيقية صفر، وكلّ خرق مزروع بمعاملة ترجع يُمسك باسمه ───────────────────────────────────────
  const verifyMap = async (q, fn) => Object.fromEntries((await q(`select check_name, violations::int as v from public.${fn}()`)).rows.map((r) => [r.check_name, r.v]));
  t.same(await db.asService((q) => verifyMap(q, 'verify_flock_issues')),
    { issue_shape: 0, issue_line_snapshot: 0, issue_moves: 0, issue_costs: 0, cost_reversals: 0, cost_flock_site: 0 }, 'verify_flock_issues: صفر على بيانات حقيقية (مرحَّل وملغى)');
  const stockChecks = await db.asService((q) => verifyMap(q, 'verify_stock'));
  t.same([stockChecks.value_conservation, stockChecks.draw_order, stockChecks.draw_values, stockChecks.posted_division_stamped], [0, 0, 0, 0], 'verify_stock: حفظ القيمة وترتيب السحب وقيمته صفر مع الصرف للفوج');
  const planted = async (statements, fn) => db.asOwner(async (q) => {
    await q('alter table public.flock_costs disable trigger flock_costs_append_only');
    for (const [sql, params] of statements) await q(sql, params);
    return verifyMap(q, fn);
  });
  const extraCost = await planted([["insert into public.flock_costs (org_id, flock_id, site_id, kind, amount, doc_kind, doc_id, doc_line_id, on_date) values ($1, $2, $3, 'feed', 7, 'flock_issue', $4, $5, $6)", [org, F.a, farmSite, r1.issue, r1.line, TODAY]]], 'verify_flock_issues');
  t.same([extraCost.issue_costs, extraCost.issue_moves], [1, 0], 'ضابط: سطر كلفة ثانٍ للسطر نفسه يُمسك (issue_costs)');
  const stockPlanted = await planted([["insert into public.flock_costs (org_id, flock_id, site_id, kind, amount, doc_kind, doc_id, doc_line_id, on_date) values ($1, $2, $3, 'feed', 7, 'flock_issue', $4, $5, $6)", [org, F.a, farmSite, r1.issue, r1.line, TODAY]]], 'verify_stock');
  t.eq(stockPlanted.value_conservation, 1, 'ضابط: كلفة بلا سحب تكسر حفظ القيمة (verify_stock)');
  const wrongSign = await planted([['update public.flock_costs set amount = -amount where doc_id = $1 and reverses_id is not null', [r3.issue]]], 'verify_flock_issues');
  t.same([wrongSign.cost_reversals, wrongSign.issue_costs], [1, 0], 'ضابط: صفّ عكسيّ بإشارة أصله يُمسك (cost_reversals)');
  const wrongSite = await planted([['update public.flock_costs set site_id = $2 where doc_id = $1', [r1.issue, layerSite]]], 'verify_flock_issues');
  t.same([wrongSite.cost_flock_site, wrongSite.issue_costs], [1, 1], 'ضابط: كلفة بغير حقل فوجها تُمسك');
  const halfVoid = await planted([["update public.flock_issues set status = 'void', voided_at = now(), void_reason = 'ضابط' where id = $1", [first.value.id]]], 'verify_flock_issues');
  t.same([halfVoid.issue_moves, halfVoid.issue_costs], [1, 1], 'ضابط: صرف ملغى بلا عكس حركاته وكلفته يُمسك');
  const kindDrift = await planted([["update public.flock_issue_lines set cost_kind = 'other' where id = $1", [r1.line]]], 'verify_flock_issues');
  t.same([kindDrift.issue_line_snapshot, kindDrift.issue_costs], [1, 1], 'ضابط: نوع كلفة السطر غير نوع مادّته يُمسك');

  // الفترة المقفولة آخر شيء (تبقى حتى نهاية الملف): صرف بتاريخ داخلها يُرفض، وبعدها يمرّ.
  await one(U.manager, 'select public.set_period_lock($1) as v', [day(-5)]);
  t.eq(refusal('period_locked', await rf(U.owner, { item: I.starter, qty: 1, on: day(-6) })).code, 'period_locked', 'تاريخ في فترة مقفولة: period_locked');

  // ── ١١) الطفرات: كلّ قاعدة أضافتها 0019 بتطبيق بديل معقول يكسرها، فيفشل فحصها ───────────────────────────────────────────────
  const recordAs = (user, o) => async ({ attempt }) => attempt(user, async (q) => (await q(RF, args(o))).rows[0].v);
  const code = (expected, hint) => (r) => !r.ok && r.code === expected && (!hint || r.hint.includes(hint));
  const okWith = (pick, value) => (r) => r.ok && pick(r.value) === value;
  const CASES = [
    {
      name: 'الفعل issue.post',
      fns: [[FN.record, [["  perform private.require('issue.post');\n", '']]]],
      run: recordAs(U.hallWorker, { item: I.finisher, qty: 1 }),
      expect: code('forbidden'),
    },
    {
      name: 'نطاق حقل الفوج قبل الصرف',
      fns: [[FN.record, [['  if not public.in_scope_site(f.site_id) then\n', '  if false then\n']]]],
      run: recordAs(U.keeperMill, { item: I.finisher, qty: 1 }),
      expect: code('out_of_scope', 'قاعة هذا الفوج'),
    },
    {
      name: 'نطاق المخزن المختار',
      fns: [[FN.record, [['    if not public.in_scope_wh(w.id) then\n', '    if false then\n']]]],
      run: recordAs(U.keeperFarm, { item: I.finisher, qty: 1, wh: W.feed }),
      expect: code('out_of_scope', '«مخزن العلف»'),
    },
    {
      name: 'لا صرف قبل التسكين',
      fns: [[FN.record, [['  if p_issued_on < f.placed_on then\n', '  if false then\n']]]],
      run: recordAs(U.owner, { flock: F.d, item: I.finisher, qty: 1, on: day(-3) }),
      expect: (r) => !r.ok && r.code === 'before_placement',
    },
    {
      name: 'المنتهي لا يجعل المخزن مرشَّحاً (القاعدة ١٤)',
      fns: [[FN.record, [['(count(*) filter (where a.available > 0))::int', '(count(*) filter (where a.available + a.expired > 0))::int'],
        ['in_scope_wh(y.id) and a.available > 0;', 'in_scope_wh(y.id) and a.available + a.expired > 0;']]]],
      run: recordAs(U.owner, { item: I.gumboro, qty: 5 }),
      expect: code('insufficient_stock', 'لا يوجد «لقاح جمبورو»'),
    },
    {
      name: 'المتاح من الدفعات لا من الرصيد (المنتهي خارج «عندك»)',
      fns: [[FN.record, [['  select * into s from private.stock_at(i.id, w.id, p_issued_on);\n',
        '  select b.qty as available, 0::numeric as expired, 0::numeric as later into s from public.stock_balances b where b.org_id = v_org and b.item_id = i.id and b.warehouse_id = w.id;\n']]]],
      run: recordAs(U.owner, { item: I.newcastle, qty: 300 }),
      expect: code('insufficient_stock', 'عندك 250 قطعة'),
    },
    {
      name: 'كلفة الفوج = قيمة السحب (لا متوسّط الرصيد)',
      fns: [[FN.record, [['    v_total := v_total + dr.value;\n',
        '    v_total := v_total + private._mul_div_round2(dr.qty, (select b.value + dr.value from public.stock_balances b where b.org_id = v_org and b.item_id = i.id and b.warehouse_id = w.id), (select b.qty + dr.qty from public.stock_balances b where b.org_id = v_org and b.item_id = i.id and b.warehouse_id = w.id));\n']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => {
        const o = { issue: uid(), item: I.finisher, qty: 1100 };
        const result = (await q(RF, args(o))).rows[0].v;
        const drawn = (await q("select -sum(value) as v from public.stock_moves where doc_kind = 'flock_issue' and doc_id = $1", [o.issue])).rows[0].v;
        return norm(result.money.value) === norm(drawn);
      }),
      expect: okWith((v) => v, true),
    },
    {
      name: 'النتيجة مقنَّعة لغير أدوار الكلفة',
      fns: [[FN.record, [['  v_result := private.flock_issue_result(p_issue_id);\n  return private.ref_store(v_fn, p_client_ref, v_result);\n',
        '  v_result := private.flock_issue_result(p_issue_id);\n  perform private.ref_store(v_fn, p_client_ref, v_result);\n  return v_result;\n']]]],
      run: recordAs(U.storekeeper, { item: I.finisher, qty: 1 }),
      expect: okWith((v) => hasMoney(v), false),
    },
    {
      name: 'إعادة صرف أُلغي بمرجعه',
      fns: [[FN.record, [["    if exists (select 1 from public.flock_issues y where y.org_id = v_org and y.id = p_issue_id and y.status = 'void') then\n", '    if false then\n']]]],
      run: async ({ attempt }) => {
        const o = args({ item: I.finisher, qty: 2 });
        await attempt(U.storekeeper, async (q) => q(RF, o));
        await attempt(U.manager, async (q) => q(VF, [o[1], 'ضابط', uid()]));
        return attempt(U.storekeeper, async (q) => (await q(RF, o)).rows[0].v);
      },
      expect: code('id_conflict', 'أُلغي'),
    },
    {
      name: 'عكس الكلفة بإشارة معاكسة',
      fns: [[FN.void, [['values (c.org_id, c.flock_id, c.site_id, c.kind, -c.amount,', 'values (c.org_id, c.flock_id, c.site_id, c.kind, c.amount,']]]],
      run: async ({ attempt }) => {
        const o = args({ item: I.finisher, qty: 3 });
        await attempt(U.owner, async (q) => q(RF, o));
        return attempt(U.manager, async (q) => {
          await q(VF, [o[1], 'ضابط', uid()]);
          return norm((await q('select sum(amount) as v from public.flock_costs where doc_id = $1', [o[1]])).rows[0].v);
        });
      },
      expect: okWith((v) => v, '0'),
    },
    {
      name: 'الإلغاء بيوم الإلغاء لا بيوم الصرف',
      fns: [[FN.void, [['-m.qty, -m.value, v_today, m.id);', '-m.qty, -m.value, x.issued_on, m.id);']]]],
      run: async ({ attempt }) => {
        const o = args({ item: I.finisher, qty: 4, on: day(-2) });
        await attempt(U.owner, async (q) => q(RF, o));
        return attempt(U.manager, async (q) => {
          await q(VF, [o[1], 'ضابط', uid()]);
          return (await q("select moved_on::text as v from public.stock_moves where doc_id = $1 and reverses_move_id is not null", [o[1]])).rows[0].v;
        });
      },
      expect: okWith((v) => v, TODAY),
    },
    {
      name: 'كيلوغرام اللتر بلقطة الكثافة',
      fns: [[FN.mass, [["when p_unit = 'L' and p_density is not null and abs(p_density) < 'Infinity' and p_density > 0 then round(p_qty * p_density, 3)",
        "when p_unit = 'L' and p_density is not null and abs(p_density) < 'Infinity' and p_density > 0 then round(p_qty, 3)"]]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => norm((await q(FEED, [F.a])).rows[0].v.issued_feed_kg)),
      expect: okWith((v) => v, '782'),
    },
    {
      name: 'المواد الأوّلية والإضافات علف للفوج',
      fns: [[FN.kind, [["when p_item_kind in ('feed', 'raw', 'additive') then 'feed'", "when p_item_kind = 'feed' then 'feed'"]]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => (await q(RF, args({ item: I.corn, qty: 10 }))).rows[0].v.cost_kind),
      expect: okWith((v) => v, 'feed'),
    },
    {
      name: 'verify_stock: الصرف للفوج خارج بقيمته',
      fns: [[FN.verifyStock, [["\n      + coalesce((select sum(c.amount) from public.flock_costs c where c.org_id = o.id and c.doc_kind = 'flock_issue'), 0) as outputs", ' as outputs']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => (await q("select violations::int as v from public.verify_stock() where check_name = 'value_conservation'")).rows[0].v, 'postgres'),
      expect: okWith((v) => v, 0),
    },
    {
      name: 'verify_flock_issues: الكلفة = قيمة السحب',
      fns: [[FN.verify, [['          and c.amount = (select coalesce(sum(-m.value), 0)', '          and c.amount = c.amount + 0 * (select coalesce(sum(-m.value), 0)']]]],
      run: async ({ attempt }) => attempt(U.owner, async (q) => {
        await q('alter table public.flock_costs disable trigger flock_costs_append_only');
        await q('update public.flock_costs set amount = amount + 1 where doc_id = $1 and reverses_id is null', [r1.issue]);
        return (await q("select violations::int as v from public.verify_flock_issues() where check_name = 'issue_costs'")).rows[0].v;
      }, 'postgres'),
      expect: okWith((v) => v, 1),
    },
  ];
  const mutationOutcomes = [];
  for (const c of CASES) {
    const realOutcome = await mutant(db, U.manager, [], c.run);
    const broken = await mutant(db, U.manager, c.fns, c.run);
    mutationOutcomes.push({ name: c.name, real: c.expect(realOutcome), caught: !c.expect(broken), realOutcome, broken });
  }
  const show = (o) => (o.ok ? `ok:${JSON.stringify(o.value)?.slice(0, 80)}` : `${o.code} (${o.hint.slice(0, 60)})`);
  t.same(mutationOutcomes.filter((o) => !o.real).map((o) => `${o.name}: ${show(o.realOutcome)}`), [], `الطفرات (${CASES.length}): كلّ حالة على الشفرة الحقيقية بنتيجتها`);
  t.same(mutationOutcomes.filter((o) => !o.caught).map((o) => `${o.name}: ${show(o.broken)}`), [], `الطفرات: ${mutationOutcomes.filter((o) => o.caught).length} من ${CASES.length} مُسكت (ومعها طفرة قفل المعرّف فوق)`);
  if (process.env.FLOCK_ISSUE_MUTATIONS_OUT) {
    const rows = mutationOutcomes.map((o) => ({ name: o.name, real: o.real, caught: o.caught, mutant: show(o.broken) }));
    rows.push({ name: 'قفل المعرّف (طفرة مثبَّتة بجلستين)', real: sameId.a2.ok, caught: !lockMutant.a2.ok, mutant: lockMutant.a2.error ?? 'ok' });
    writeFileSync(process.env.FLOCK_ISSUE_MUTATIONS_OUT, `${JSON.stringify(rows, null, 2)}\n`);
  }

  // ── عيّنات حقيقية لشاشات الصرف (اختياري بمتغيّر بيئة): المالك والأمين، وكلّ رفض بتلميحه ──────────────────────────────────────────
  if (process.env.FLOCK_ISSUE_SAMPLES_OUT) {
    const sample = {
      generated_by: 'supabase/tests/flock-issue.test.mjs (embedded Postgres 17، اليوم المثبَّت ' + TODAY + ')',
      flock_issue_options: { owner: ownerOptions.value, storekeeper: keeperOptions.value, hall_worker: workerOptions.value },
      record_flock_issue: { storekeeper: first.value, owner: oil.value, owner_farm_store_by_keeper_farm: fromFarm.value },
      void_flock_issue: { manager: voided.value },
      flock_feed: { owner: ownerFeed.value, storekeeper: keeperFeed.value, accountant: accountantFeed.value },
      refusals: samples.refusals,
    };
    writeFileSync(process.env.FLOCK_ISSUE_SAMPLES_OUT, `${JSON.stringify(sample, null, 2)}\n`);
  }
}
