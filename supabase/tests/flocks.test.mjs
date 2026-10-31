// حقول اللحم وحقول البيض، النسخة الأولى (0012، كلمة المالك 2026-10-31): القاعات بكتابة المدير المباشرة وحرّاسها، وopen_flock،
// والجولة اليومية الحقيقية save_flock_day (null = بلا تغيير، 0 = صفر، base_version وstale_day، نفس المرجع = نفس الجواب، والعملية من
// الطابور اللي صارت غير صالحة تنركن parked)، والأوزان، والقارئان بأرقام محسوبة باليد (10,000 مسكّن، نفوق ٪، FCR بوزن، HDEP لبيّاض)،
// وكل رمز رفض، والنطاق والأدوار (بالقارئين وبسياسات القراءة المباشرة للجداول، FOUNDATION ٥٤٤)، والحيّ ما ينزل تحت الصفر بحفظين
// متزامنين بجلستين حقيقيتين (FOUNDATION ٤٣٤، ٨٨٢)، وFCR بأيّام العلف من التسكين لحد أمس، وحدّ الوزن الفيزيائي، وضوابط verify_flocks.
// وطريق رفض التراجع ببيانات الحقول بمشغّل التراجع (seed.mjs، BLOCKING_SEEDS[12]: قاعة بفوج وجولة، وقاعة بلا فوج).
// والدمج (الطرفان على عقد واحد): أجوبة القاعدة الحقيقية تنقرأ بمحلّل الشاشات الحقيقي (src/lib/repo/flocks.ts محزوماً بـesbuild:
// parseOverview وparseDetail وparseDayRow وdayAnswer اللي يحوّل جواب save_flock_day لنتيجة الطابور)، مو بنسخة منه ولا بجواب مكتوب باليد.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { race } from './shared.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** محلّل الشاشات الحقيقي لأجوبة الحقول. */
async function screensParser() {
  const result = await build({
    stdin: { contents: "export { parseOverview, parseDetail, parseDayRow, dayAnswer } from './src/lib/repo/flocks.ts';", resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"' },
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const TODAY = '2026-10-30';
const id = (n) => `f1a00000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477991000${String(n).padStart(2, '0')}`;
const local = (canonical) => `0${canonical.slice(3)}`;
let refs = 0;
const ref = () => id(500 + (refs += 1));

const U = {
  owner: id(1),
  manager: id(2),
  worker: id(3),
  layerWorker: id(4),
  viewer: id(5),
  bareViewer: id(6),
  keeper: id(7),
  layerManager: id(8),
};

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

/** مفاتيح jsonb بترتيب بوستغريس (الطول ثم الحروف)، فالمقارنة بعد ترتيب المفاتيح بالطرفين. */
const canon = (x) => (x === null || typeof x !== 'object' ? x : Array.isArray(x) ? x.map(canon) : Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])])));

async function scenario(t, db) {
  const same = (actual, expected, label) => t.same(canon(actual), canon(expected), label);
  const ui = await screensParser();
  for (const [i, user] of Object.values(U).entries()) {
    await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())', [user, phone(i + 1)]);
  }
  await db.asUser(U.owner, (q) => q("select public.create_my_org('مزرعة الأفواج', 'المالك')"), { commit: true });
  const org = (await db.admin('select org_id from public.members where user_id = $1', [U.owner])).rows[0].org_id;
  const division = async (kind) => (await db.admin('select id from public.divisions where org_id = $1 and kind = $2', [org, kind])).rows[0].id;
  const broiler = await division('broiler');
  const layer = await division('layer');

  // المدير ينشئ حقلاً للّحم وحقلاً للبيض (كتابة مباشرة، stores.manage).
  const sites = await db.asUser(
    U.owner,
    async (q) => {
      const one = async (sql, params) => Object.values((await q(sql, params)).rows[0])[0];
      return {
        broiler: await one("insert into public.sites (division_id, name, kind) values ($1, 'حقل اللحم الأوّل', 'farm') returning id", [broiler]),
        layer: await one("insert into public.sites (division_id, name, kind) values ($1, 'حقل البيض الأوّل', 'farm') returning id", [layer]),
        spare: await one("insert into public.sites (division_id, name, kind) values ($1, 'حقل اللحم الثاني', 'farm') returning id", [broiler]),
      };
    },
    { commit: true },
  );
  const generalSite = (await db.admin("select s.id from public.sites s join public.divisions d on d.id = s.division_id where s.org_id = $1 and d.kind = 'general'", [org])).rows[0].id;

  // الموظفون: المدير بلا نطاق (المنشأة كلها)، وعامل قاعة بوحدة اللحم، وعامل ثانٍ بحقل البيض وحده، ومشاهد بوحدة اللحم، ومشاهد بلا
  // نطاق، وأمين، ومدير ثانٍ بوحدة البيض وحدها.
  const invite = async (user, n, role, divisions, sitesScope = []) => {
    const member = await db.asUser(U.owner, async (q) => (await q('select public.add_member_v2($1, $2, $3, $4::uuid[], $5::uuid[], $6::uuid[]) as id', [local(phone(n)), role, role, divisions, sitesScope, []])).rows[0].id, { commit: true });
    await db.acceptInvite(U.owner, user, member);
  };
  await invite(U.manager, 2, 'manager', []);
  await invite(U.worker, 3, 'hall_worker', [broiler]);
  await invite(U.layerWorker, 4, 'hall_worker', [], [sites.layer]);
  await invite(U.viewer, 5, 'viewer', [broiler]);
  await invite(U.bareViewer, 6, 'viewer', []);
  await invite(U.keeper, 7, 'storekeeper', []);
  await invite(U.layerManager, 8, 'manager', [layer]);

  /** نداء بمعاملة تثبت إذا نجح: { ok, v } أو { ok: false, code, hint }. */
  const call = async (user, sql, params = []) => {
    try {
      const rows = (await db.asUser(user, (q) => q(sql, params), { commit: true })).rows;
      return { ok: true, v: rows[0] ? Object.values(rows[0])[0] : null, rows };
    } catch (error) {
      return { ok: false, code: error.message, hint: error.hint ?? null };
    }
  };
  const code = (outcome) => (outcome.ok ? 'ok' : outcome.code);

  // ─── القاعات: كتابة المدير المباشرة وحرّاسها ───────────────────────────────────────────────────────────────
  const hall = async (user, site, name, capacity = null) => call(user, 'insert into public.halls (site_id, name, capacity) values ($1, $2, $3) returning id', [site, name, capacity]);
  const B1 = (await hall(U.manager, sites.broiler, 'قاعة 1', 12000)).v;
  const B2 = (await hall(U.manager, sites.broiler, 'قاعة 2')).v;
  const B3 = (await hall(U.manager, sites.broiler, 'قاعة 3')).v;
  const B4 = (await hall(U.manager, sites.broiler, 'قاعة 4')).v;
  const L1 = (await hall(U.manager, sites.layer, 'قاعة البيّاض 1', 6000)).v;
  t.ok([B1, B2, B3, B4, L1].every(Boolean), 'المدير يضيف قاعات بحقل اللحم وحقل البيض');
  const hallDivision = (await db.admin('select division_id from public.halls where id = $1', [B1])).rows[0].division_id;
  t.eq(hallDivision, broiler, 'وحدة القاعة من حقلها (المشغّل)');
  same(
    [
      code(await hall(U.manager, generalSite, 'قاعة بالمخزن')),
      code(await hall(U.manager, sites.broiler, ' قاعة 1 ')),
      code(await hall(U.worker, sites.broiler, 'قاعة العامل')),
      code(await hall(U.layerManager, sites.broiler, 'قاعة خارج النطاق')),
      code(await hall(U.manager, sites.broiler, 'قاعة', 0)),
    ],
    [
      'hall_site_kind',
      'hall_name_taken',
      'new row violates row-level security policy for table "halls"',
      'new row violates row-level security policy for table "halls"',
      'new row for relation "halls" violates check constraint "halls_capacity_check"',
    ],
    'القاعة: بحقل لحم أو بيض فقط، والاسم فريد بين الفعّالة، والعامل ومدير وحدة ثانية ممنوعان، والسعة أكبر من صفر',
  );
  const archivedSite = await call(U.manager, "update public.sites set archived_at = now() where id = $1 returning id", [sites.spare]);
  t.ok(archivedSite.ok, 'حقل بلا قاعات يتؤرشف');
  t.eq(code(await hall(U.manager, sites.spare, 'قاعة بحقل مؤرشف')), 'site_archived', 'قاعة بحقل مؤرشف: site_archived');

  // ─── فتح الفوج وتسكينه ─────────────────────────────────────────────────────────────────────────────────────
  const open = (user, hallId, placedOn, count, age = 0, breed = null, r = ref()) =>
    call(user, 'select public.open_flock($1, $2, $3, $4, $5, $6) as v', [hallId, placedOn, count, age, breed, r]);
  const openRef = ref();
  const F1open = await open(U.manager, B1, '2026-10-25', 10000, 1, 'روس 308', openRef);
  t.ok(F1open.ok && F1open.v.version === 1, `فتح فوج لحم بـ10,000 طير (${JSON.stringify(F1open)})`);
  const F1 = F1open.v.flock_id;
  same((await open(U.manager, B1, '2026-10-25', 10000, 1, 'روس 308', openRef)).v, F1open.v, 'نفس المرجع ونفس المعاملات = نفس الجواب بلا فوج ثانٍ');
  const F1row = (await db.admin('select kind, site_id, division_id, chick_source, status, opened_on::text, placed_on::text, placed_count from public.flocks where id = $1', [F1])).rows[0];
  same(F1row, { kind: 'broiler', site_id: sites.broiler, division_id: broiler, chick_source: 'opening', status: 'active', opened_on: '2026-10-25', placed_on: '2026-10-25', placed_count: 10000 }, 'الفوج: النوع والحقل والوحدة من القاعة، ومعنى opening بالنسخة الأولى');
  const F2 = (await open(U.layerManager, L1, '2026-10-27', 5000, 140, 'لوهمان')).v?.flock_id;
  t.eq((await db.admin('select kind from public.flocks where id = $1', [F2])).rows[0]?.kind, 'layer', 'مدير وحدة البيض يفتح فوج بيّاض بقاعة حقله');
  const F3 = (await open(U.manager, B3, '2026-10-26', 2000)).v?.flock_id;
  const F4 = (await open(U.manager, B4, '2026-10-26', 100)).v?.flock_id;
  t.ok(F3 && F4, 'فوجان آخران للحالات والتزامن');
  t.eq(code(await call(U.manager, 'update public.halls set archived_at = now() where id = $1', [B2])), 'ok', 'قاعة بلا فوج تتؤرشف');
  const lockedHall = (await hall(U.manager, sites.broiler, 'قاعة 5')).v;
  same(
    {
      busy: code(await open(U.manager, B1, '2026-10-28', 500)),
      count: code(await open(U.manager, lockedHall, '2026-10-28', 0)),
      age: code(await open(U.manager, lockedHall, '2026-10-28', 500, -1)),
      breed: code(await open(U.manager, lockedHall, '2026-10-28', 500, 0, 'س'.repeat(81))),
      required: code(await open(U.manager, lockedHall, null, 500)),
      future: code(await open(U.manager, lockedHall, '2026-10-31', 500)),
      missing: code(await open(U.manager, id(999), '2026-10-28', 500)),
      archived: code(await open(U.manager, B2, '2026-10-28', 500)),
      scope: code(await open(U.layerManager, lockedHall, '2026-10-28', 500)),
      worker: code(await open(U.worker, lockedHall, '2026-10-28', 500)),
      viewer: code(await open(U.viewer, lockedHall, '2026-10-28', 500)),
    },
    { busy: 'hall_busy', count: 'bad_count', age: 'bad_age', breed: 'bad_breed', required: 'date_required', future: 'date_in_future', missing: 'hall_not_found', archived: 'hall_archived', scope: 'out_of_scope', worker: 'forbidden', viewer: 'forbidden' },
    'open_flock: كل رمز رفض',
  );
  t.eq(code(await call(U.manager, 'update public.halls set archived_at = now() where id = $1', [B1])), 'hall_in_use', 'قاعة بفوج قائم ما تتؤرشف: hall_in_use');
  t.eq(code(await call(U.manager, 'update public.sites set archived_at = now() where id = $1', [sites.broiler])), 'archived_in_use', 'حقل بقاعات فعّالة ما يتؤرشف: archived_in_use');

  // ─── الجولة اليومية: فوج اللحم F1 (10,000 طير من 25/10) ─────────────────────────────────────────────────────
  const save = (user, flock, day, f = {}, base = null, r = ref(), queued = false) =>
    call(user, 'select public.save_flock_day($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) as v', [
      flock, day, f.dead ?? null, f.culled ?? null, f.feed ?? null, f.water ?? null, f.tmin ?? null, f.tmax ?? null,
      f.eggs ?? null, f.cracked ?? null, f.broken ?? null, f.note ?? null, base, r, queued,
    ]);
  const day = async (flock, d) => (await db.admin('select dead, culled, feed_kg::text as feed, water_l::text as water, eggs_total as eggs, version, note from public.flock_daily where flock_id = $1 and on_date = $2', [flock, d])).rows[0] ?? null;

  const d25 = await save(U.worker, F1, '2026-10-25', { dead: 20, culled: 5, feed: '300' });
  const d26 = await save(U.worker, F1, '2026-10-26', { dead: 15, feed: '350', water: '700.5', tmin: '24.5', tmax: '31' });
  const d27 = await save(U.worker, F1, '2026-10-27', { dead: 10, feed: '400' });
  const d28 = await save(U.worker, F1, '2026-10-28', { dead: 5, feed: '450', note: 'تهوية جيّدة' });
  same([d25.v, d26.v, d27.v, d28.v], Array(4).fill({ status: 'saved', version: 1 }), 'عامل القاعة يسجّل أربعة أيام (الإصدار 1 لكل يوم)');
  same(await day(F1, '2026-10-26'), { dead: 15, culled: 0, feed: '350', water: '700.5', eggs: null, version: 1, note: null }, 'يوم جديد: المستبعد الفارغ صفر والباقي كما كُتب');

  // null = بلا تغيير، و0 = صفر، والمطابق بلا رفع إصدار.
  same((await save(U.worker, F1, '2026-10-28', { water: '900' }, 1)).v, { status: 'saved', version: 2 }, 'خانة وحدة تتغيّر والإصدار 2');
  same(await day(F1, '2026-10-28'), { dead: 5, culled: 0, feed: '450', water: '900', eggs: null, version: 2, note: 'تهوية جيّدة' }, 'null = بلا تغيير: النافق والعلف والملاحظة كما هي');
  same((await save(U.worker, F1, '2026-10-25', { culled: 0 }, 1)).v, { status: 'saved', version: 2 }, 'الصفر الصريح يُحفظ');
  t.eq((await day(F1, '2026-10-25')).culled, 0, '0 = صفر: المستبعد صار صفراً');
  same((await save(U.worker, F1, '2026-10-25', { culled: 5 }, 2)).v, { status: 'saved', version: 3 }, 'المستبعد يرجع 5 بالإصدار 3');
  same((await save(U.worker, F1, '2026-10-25', { dead: 20 }, 3)).v, { status: 'saved', version: 3 }, 'حفظ مطابق للمحفوظ: saved بلا رفع الإصدار');
  same((await save(U.worker, F1, '2026-10-28', { note: '' }, 2)).v, { status: 'saved', version: 3 }, 'الملاحظة الفارغة تمسح');
  t.eq((await day(F1, '2026-10-28')).note, null, 'الملاحظة انمسحت');

  // base_version: أقدم من المحفوظ، أو null ويوم بيه صفّ، أو رقم ويوم بلا صفّ ← stale_day بصفّ الخادم.
  const stale = await save(U.worker, F1, '2026-10-28', { dead: 7 }, 1);
  same(stale.v, { status: 'stale_day', server: { on_date: '2026-10-28', version: 3, dead: 5, culled: 0, feed_kg: '450', water_l: '900', temp_min: null, temp_max: null, eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null } }, 'base_version أقدم ← stale_day بصفّ الخادم كاملاً');
  const staleResult = ui.dayAnswer(stale.v);
  same(
    [staleResult.kind, ui.parseDayRow(staleResult.server), ui.dayAnswer(d28.v)],
    [
      'stale_day',
      { onDate: '2026-10-28', version: 3, dead: 5, culled: 0, feedKg: 450000n, waterL: 900000n, tempMin: null, tempMax: null, eggsTotal: null, eggsCracked: null, eggsBroken: null, note: null },
      { kind: 'saved', version: 1 },
    ],
    'محلّل الشاشات (dayAnswer): stale_day لرفّ المراجعة بصفّ الخادم (العلف 450 كغم = 450,000 غرام، والماء 900 لتر)، وsaved برقم الإصدار',
  );
  t.eq((await save(U.worker, F1, '2026-10-28', { dead: 7 }, null)).v?.status, 'stale_day', 'base_version = null ويوم بيه صفّ ← stale_day');
  same((await save(U.worker, F1, '2026-10-29', { dead: 1 }, 4)).v, { status: 'stale_day', server: null }, 'base_version ويوم بلا صفّ ← stale_day بلا صفّ');
  t.eq((await day(F1, '2026-10-28')).dead, 5, 'stale_day ما غيّر شيئاً');

  // نفس المرجع = نفس الجواب (saved وstale_day)، والمرجع نفسه بمعاملات أخرى ref_reused.
  const sameRef = ref();
  const first = await save(U.worker, F1, '2026-10-27', { water: '800' }, 1, sameRef);
  const again = await save(U.worker, F1, '2026-10-27', { water: '800' }, 1, sameRef);
  same([first.v, again.v, (await day(F1, '2026-10-27')).version], [{ status: 'saved', version: 2 }, { status: 'saved', version: 2 }, 2], 'إعادة نفس المرجع ترجع الجواب المحفوظ بلا رفع ثانٍ للإصدار');
  t.eq(code(await save(U.worker, F1, '2026-10-27', { water: '801' }, 1, sameRef)), 'ref_reused', 'نفس المرجع بقيمة أخرى: ref_reused');

  // ─── الأوزان والمؤشّرات (القاعدة ٢٨): 10,000 − 55 = 9,945 حيّ، والنفوق 0.55٪، والعلف 1,500 كغم بأربعة أيام متتالية ────────
  const weight = (user, flock, d, n, g, r = ref()) => call(user, 'select public.record_flock_weight($1, $2, $3, $4, $5) as v', [flock, d, n, g, r]);
  same((await weight(U.worker, F1, '2026-10-28', 50, '140.0')).v, { status: 'saved', version: 1 }, 'وزن عيّنة (50 طيراً بمعدّل 140.0 غم)');
  same((await weight(U.worker, F1, '2026-10-28', 60, '150.0')).v, { status: 'saved', version: 2 }, 'إعادة وزن اليوم نفسه تستبدله (الإصدار 2)');
  same(
    {
      flock: code(await weight(U.worker, id(998), '2026-10-28', 50, '150')),
      scope: code(await weight(U.layerWorker, F1, '2026-10-28', 50, '150')),
      role: code(await weight(U.viewer, F1, '2026-10-28', 50, '150')),
      future: code(await weight(U.worker, F1, '2026-10-31', 50, '150')),
      old: code(await weight(U.worker, F1, '2026-10-22', 50, '150')),
      before: code(await weight(U.layerManager, F2, '2026-10-26', 50, '150')),
      sample: code(await weight(U.worker, F1, '2026-10-28', 0, '150')),
      grams: code(await weight(U.worker, F1, '2026-10-28', 50, '150.25')),
      zero: code(await weight(U.worker, F1, '2026-10-28', 50, '0')),
      kg: code(await weight(U.worker, F1, '2026-10-28', 50, '1.8')),
      light: code(await weight(U.worker, F1, '2026-10-28', 50, '19.9')),
    },
    { flock: 'flock_not_found', scope: 'out_of_scope', role: 'forbidden', future: 'date_in_future', old: 'date_too_old', before: 'before_placement', sample: 'bad_sample', grams: 'bad_weight', zero: 'bad_weight', kg: 'bad_weight', light: 'bad_weight' },
    'record_flock_weight: كل رمز رفض، و1.8 (كيلوغرام بخانة الغرامات) و19.9 تحت الحدّ الفيزيائي الأدنى 20 غراماً (القاعدة 28)',
  );

  const overview = async (user) => (await call(user, 'select public.flocks_overview() as v')).v;
  const summary = (view, siteId, hallId) => view.sites.find((s) => s.id === siteId)?.halls.find((h) => h.id === hallId)?.flock ?? null;
  const managerView = await overview(U.manager);
  const s1 = summary(managerView, sites.broiler, B1);
  same(
    {
      today: managerView.today, age: s1.age_days, days: s1.days_since_placement, dead: s1.dead_total, culled: s1.culled_total, live: s1.live,
      liveStart: s1.live_start_today, mortality: s1.mortality_pct, feed: s1.feed_kg_total, feedDays: s1.feed_days, span: s1.feed_span_days,
      weight: s1.last_weight, fcr: s1.fcr, today_row: s1.today, eggs: s1.eggs_today, hdep: s1.hdep_today,
    },
    {
      today: TODAY, age: 6, days: 6, dead: 50, culled: 5, live: 9945, liveStart: 9945, mortality: '0.55', feed: '1500.000', feedDays: 4, span: 5,
      weight: { on_date: '2026-10-28', sample_count: 60, avg_g: '150.0' }, fcr: null, today_row: null, eggs: null, hdep: null,
    },
    'مؤشّرات فوج اللحم: العمر (30−25)+1 = 6، والحيّ 9,945، والنفوق 55 ÷ 10,000 = 0.55٪، وFCR «—» لأن جولة أمس (29/10) بلا علف: 4 من 5 (جولة اليوم بس ممكن تتأخّر)',
  );
  const p1 = ui.parseOverview(managerView).sites.find((s) => s.id === sites.broiler)?.halls.find((h) => h.id === B1)?.flock ?? null;
  same(
    [p1?.kind, p1?.live, p1?.liveStartToday, p1?.mortalityPct, p1?.feedKgTotal, p1?.feedDays, p1?.feedSpanDays, p1?.fcr, p1?.lastWeight, p1?.ageDays, p1?.today, p1?.hdepToday],
    ['broiler', 9945, 9945, 55n, 1500000n, 4, 5, null, { onDate: '2026-10-28', sampleCount: 60, avgG: 1500n }, 6, null, null],
    'محلّل الشاشات يقرأ ملخّص فوج اللحم من القاعدة: النفوق 55 (0.55٪)، والعلف 1,500,000 غرام، وFCR فارغ (4 من 5)، والوزن 1,500 (150.0 غم)',
  );
  // يوم ناقص بين أيّام العلف ← FCR «—» (null) مع «5 من 6».
  t.eq((await save(U.worker, F1, TODAY, { dead: 3, feed: '500' })).v?.status, 'saved', 'جولة اليوم (30/10) بلا جولة 29/10');
  const s1b = summary(await overview(U.manager), sites.broiler, B1);
  same([s1b.fcr, s1b.feed_days, s1b.feed_span_days, s1b.live, s1b.live_start_today, s1b.today?.dead, s1b.today?.feed_kg], [null, 5, 6, 9942, 9945, 3, '500'], 'يوم 29/10 بلا علف ← FCR فارغ (5 من 6 أيام)، والحيّ 9,942 وحيّ بداية اليوم 9,945');
  // جولات العلف انقطعت بعد يوم التسكين والأيام تمشي (القاعدة 28: «إذا كل الأيام من التسكين مسجّلة»): فوج 100 طير من 26/10 بعلف 26/10
  // بس ووزن اليوم ← FCR «—» بـ«1 من 4» (لحد أمس)، مو 10 ÷ (100 × 0.020) كأن الفوج كامل. ووزن 20.0 غم (الحدّ الأدنى) مقبول.
  t.eq((await save(U.manager, F4, '2026-10-26', { feed: '10' })).v?.status, 'saved', 'فوج F4: علف يوم التسكين بس');
  t.eq((await weight(U.manager, F4, TODAY, 20, '20.0')).v?.status, 'saved', 'ضابط: وزن 20.0 غم (الحدّ الفيزيائي الأدنى) مقبول');
  const s4 = summary(await overview(U.manager), sites.broiler, B4);
  same([s4.fcr, s4.feed_days, s4.feed_span_days, s4.days_since_placement], [null, 1, 4, 5], 'العلف انقطع بعد يومه الأوّل: FCR فارغ و«1 من 4» (26–29/10)، مو FCR محسوب على آخر يوم علف');

  // ─── رفض الجولة: كل رمز ─────────────────────────────────────────────────────────────────────────────────────
  same(
    {
      missing: code(await save(U.worker, id(997), TODAY, { dead: 1 })),
      required: code(await save(U.worker, F1, null, { dead: 1 })),
      future: code(await save(U.worker, F1, '2026-10-31', { dead: 1 })),
      old: code(await save(U.worker, F1, '2026-10-22', { dead: 1 })),
      before: code(await save(U.layerManager, F2, '2026-10-26', { dead: 1 })),
      eggsBroiler: code(await save(U.worker, F1, TODAY, { eggs: 5 }, 1)),
      negative: code(await save(U.worker, F1, TODAY, { dead: -1 }, 1)),
      feedScale: code(await save(U.worker, F1, TODAY, { feed: '1.2345' }, 1)),
      water: code(await save(U.worker, F1, TODAY, { water: '-3' }, 1)),
      tempRange: code(await save(U.worker, F1, TODAY, { tmin: '80' }, 1)),
      tempOrder: code(await save(U.worker, F1, TODAY, { tmin: '30', tmax: '20' }, 1)),
      note: code(await save(U.worker, F1, TODAY, { note: 'م'.repeat(501) }, 1)),
      empty: code(await save(U.worker, F1, '2026-10-29', {})),
      live: code(await save(U.worker, F1, '2026-10-29', { dead: 9000, culled: 943 })),
      scope: code(await save(U.layerWorker, F1, TODAY, { dead: 1 }, 1)),
      viewer: code(await save(U.viewer, F1, TODAY, { dead: 1 }, 1)),
      keeper: code(await save(U.keeper, F1, TODAY, { dead: 1 }, 1)),
    },
    {
      missing: 'flock_not_found', required: 'date_required', future: 'date_in_future', old: 'date_too_old', before: 'before_placement',
      eggsBroiler: 'eggs_on_broiler', negative: 'bad_value', feedScale: 'bad_value', water: 'bad_value', tempRange: 'bad_temp', tempOrder: 'bad_temp',
      note: 'bad_note', empty: 'empty_day', live: 'live_negative', scope: 'out_of_scope', viewer: 'forbidden', keeper: 'forbidden',
    },
    'save_flock_day: كل رمز رفض بنداء مباشر',
  );
  const liveHint = await save(U.worker, F1, '2026-10-29', { dead: 9000, culled: 943 });
  t.ok(liveHint.hint?.includes('9,943') && liveHint.hint?.includes('9,942'), `تلميح live_negative يسمّي العددين بفواصل الآلاف (${liveHint.hint})`);
  t.eq((await save(U.worker, F1, '2026-10-29', { dead: 9000, culled: 942 })).v?.status, 'saved', 'ضابط: النافق والمستبعد = الحيّ بالضبط مقبول (الحيّ صفر)');
  same((await save(U.worker, F1, '2026-10-29', { dead: 0, culled: 0 }, 1)).v, { status: 'saved', version: 2 }, 'التصحيح بالصفر يرجّع الحيّ');
  // علف 29/10 يكمّل الأيام من التسكين لليوم ← FCR = 2,450 ÷ (9,942 × 0.150) = 1.643 (القاعدة 28)، ومحلّل الشاشات يقرأه بالآلاف.
  same((await save(U.worker, F1, '2026-10-29', { feed: '450' }, 2)).v, { status: 'saved', version: 3 }, 'علف 29/10 انسجّل');
  const fullView = await overview(U.manager);
  const s1c = summary(fullView, sites.broiler, B1);
  const p1c = ui.parseOverview(fullView).sites.find((s) => s.id === sites.broiler)?.halls.find((h) => h.id === B1)?.flock ?? null;
  same(
    [s1c.fcr, s1c.feed_days, s1c.feed_span_days, s1c.feed_kg_total, s1c.live, p1c?.fcr, p1c?.feedSpanDays],
    ['1.643', 6, 6, '2450.000', 9942, 1643n, 6],
    'كل الأيام من التسكين لليوم بعلفها: FCR = 2,450 ÷ (9,942 × 0.150) = 1.643، ومحلّل الشاشات 1,643 (1.643)',
  );

  // ─── فوج البيّاض F2 (5,000 دجاجة من 27/10): HDEP لكل يوم = بيض اليوم ÷ الحيّ بدايته (القاعدة ٣٢) ────────────────────────
  same(
    [
      (await save(U.layerWorker, F2, '2026-10-27', { dead: 10, feed: '500', eggs: 4000, broken: 40, cracked: 20 })).v?.status,
      (await save(U.layerWorker, F2, '2026-10-28', { dead: 5, feed: '520', eggs: 4200 })).v?.status,
      (await save(U.layerWorker, F2, '2026-10-29', { feed: '600' })).v?.status,
      (await save(U.layerWorker, F2, TODAY, { dead: 2, feed: '530', eggs: 4100, broken: 30 })).v?.status,
    ],
    ['saved', 'saved', 'saved', 'saved'],
    'عامل حقل البيض يسجّل أربعة أيام (يوم 29/10 بلا بيض)',
  );
  const detail = async (user, flock) => call(user, 'select public.flock_detail($1) as v', [flock]);
  const noEggs = (await detail(U.layerWorker, F2)).v.days.find((d) => d.on_date === '2026-10-29');
  same([noEggs.eggs_total, noEggs.hdep], [null, null], 'يوم بلا بيض مسجّل: HDEP «—» (null) مو صفر');
  same(
    {
      overTotal: code(await save(U.layerWorker, F2, TODAY, { broken: 4000, cracked: 101 }, 1)),
      needTotal: code(await save(U.layerWorker, F2, '2026-10-29', { broken: 5 }, 1)),
      overLive: code(await save(U.layerWorker, F2, '2026-10-29', { eggs: 4986 }, 1)),
      laterDay: code(await save(U.layerWorker, F2, '2026-10-27', { dead: 900 }, 1)),
      negative: code(await save(U.layerWorker, F2, TODAY, { eggs: -1 }, 1)),
      huge: code(await save(U.layerWorker, F2, TODAY, { eggs: 100, cracked: 2000000000, broken: 2000000000 }, 1)),
    },
    { overTotal: 'eggs_over_total', needTotal: 'eggs_need_total', overLive: 'eggs_over_live', laterDay: 'eggs_over_live', negative: 'bad_value', huge: 'bad_value' },
    'البيض: المكسور والمشعور ≤ المجموع، ولا يُكتبان قبله، وبيض اليوم ≤ الحيّ بدايته (ولأيّام بعده سجّلت بيضاً)، ومكسور ومشعور بالمليارات رفض برمزه مو «integer out of range»',
  );
  const hugeHint = await save(U.layerWorker, F2, TODAY, { eggs: 100, cracked: 2000000000, broken: 2000000000 }, 1);
  t.ok(hugeHint.hint?.includes('10,000,000'), `تلميح أعداد البيض الكبيرة يسمّي الحدّ بفواصل الآلاف (${hugeHint.hint})`);
  const laterHint = await save(U.layerWorker, F2, '2026-10-27', { dead: 900 }, 1);
  t.ok(laterHint.hint?.includes('28/10/2026') && laterHint.hint?.includes('4,200') && laterHint.hint?.includes('4,100'), `نافق جديد يقلّل حيّ يوم لاحق سجّل بيضاً: التلميح يسمّي اليوم والعددين (${laterHint.hint})`);
  t.eq((await save(U.layerWorker, F2, '2026-10-29', { eggs: 4985 }, 1)).v?.status, 'saved', 'ضابط: بيض = الحيّ بداية اليوم بالضبط (100٪) مقبول');
  same((await save(U.layerWorker, F2, '2026-10-29', { eggs: 0 }, 2)).v, { status: 'saved', version: 3 }, 'بيض صفر صريح يُحفظ');

  const f2 = (await detail(U.layerWorker, F2)).v;
  same(
    f2.days.map((d) => [d.on_date, d.live_start, d.live_end, d.eggs_total, d.hdep]),
    [
      [TODAY, 4985, 4983, 4100, '82.25'],
      ['2026-10-29', 4985, 4985, 0, '0.00'],
      ['2026-10-28', 4990, 4985, 4200, '84.17'],
      ['2026-10-27', 5000, 4990, 4000, '80.00'],
    ],
    'أيّام البيّاض: الحيّ الجاري، وHDEP = 4,000 ÷ 5,000 = 80.00 و4,200 ÷ 4,990 = 84.17 و4,100 ÷ 4,985 = 82.25، والصفر 0.00',
  );
  same(
    [f2.flock.live, f2.flock.eggs_today, f2.flock.hdep_today, f2.flock.mortality_pct, f2.flock.age_days, f2.flock.hall_name, f2.flock.site_name, f2.can_manage, f2.can_save, f2.flock.fcr, f2.flock.feed_kg_total],
    [4983, 4100, '82.25', '0.34', 143, 'قاعة البيّاض 1', 'حقل البيض الأوّل', false, true, null, '2150.000'],
    'ملخّص البيّاض: الحيّ 4,983، وبيض اليوم 4,100 بنسبة 82.25٪، والنفوق 17 ÷ 5,000 = 0.34٪، والعمر 3 + 140 = 143، وبلا وزن ما في FCR',
  );
  t.eq((await detail(U.manager, F1)).v.days.find((d) => d.on_date === '2026-10-26').hdep, null, 'فوج اللحم: HDEP فارغ لكل يوم');
  const d2 = ui.parseDetail(f2);
  const d1 = ui.parseDetail((await detail(U.manager, F1)).v).days.find((d) => d.onDate === '2026-10-26') ?? null;
  same(
    [
      d2.days.map((d) => [d.onDate, d.liveStart, d.liveEnd, d.eggsTotal, d.eggsBroken, d.hdep]),
      [d2.flock.eggsToday, d2.flock.hdepToday, d2.flock.feedKgTotal, d2.flock.hallName, d2.canSave, d2.canManage],
      [d1?.waterL, d1?.tempMin, d1?.tempMax, d1?.eggsTotal, d1?.hdep],
    ],
    [
      [[TODAY, 4985, 4983, 4100, 30, 8225n], ['2026-10-29', 4985, 4985, 0, null, 0n], ['2026-10-28', 4990, 4985, 4200, null, 8417n], ['2026-10-27', 5000, 4990, 4000, 40, 8000n]],
      [4100, 8225n, 2150000n, 'قاعة البيّاض 1', true, false],
      [700500n, 245n, 310n, null, null],
    ],
    'محلّل الشاشات يقرأ الأيّام من القاعدة: HDEP بالمئات (8,225 = 82.25٪) والصفر 0 مو «—»، ويوم اللحم بلا بيض null («—»)، والماء 700.5 لتر والحرارة 24.5 و31 بالأعشار',
  );

  // ─── النطاق والأدوار بالقارئين ────────────────────────────────────────────────────────────────────────────
  const siteIds = (view) => view.sites.map((s) => s.id).sort();
  const sorted = (list) => [...list].sort();
  same(
    {
      manager: siteIds(await overview(U.manager)),
      worker: siteIds(await overview(U.worker)),
      layerWorker: siteIds(await overview(U.layerWorker)),
      viewer: siteIds(await overview(U.viewer)),
      bare: siteIds(await overview(U.bareViewer)),
      keeper: siteIds(await overview(U.keeper)),
    },
    { manager: sorted([sites.broiler, sites.layer]), worker: [sites.broiler], layerWorker: [sites.layer], viewer: [sites.broiler], bare: [], keeper: [] },
    'flocks_overview: كل دور يرى حقول نطاقه فقط (الحقل المؤرشف لا يظهر)',
  );
  const workerView = await overview(U.worker);
  same([workerView.sites[0].can_manage, workerView.sites[0].halls.map((h) => h.name)], [false, ['قاعة 1', 'قاعة 3', 'قاعة 4', 'قاعة 5']], 'العامل: بلا إدارة، وقاعات حقله الفعّالة بترتيب الاسم');
  same(
    { viewer: code(await detail(U.viewer, F1)), outside: code(await detail(U.worker, F2)), bare: code(await detail(U.bareViewer, F1)), missing: code(await detail(U.manager, id(996))) },
    { viewer: 'ok', outside: 'out_of_scope', bare: 'out_of_scope', missing: 'flock_not_found' },
    'flock_detail: المشاهد بنطاقه يقرأ، وخارج النطاق out_of_scope، والمجهول flock_not_found',
  );
  const noMoney = JSON.stringify([await overview(U.manager), (await detail(U.manager, F1)).v]);
  t.ok(!/"(money|value|cost|amount|price)"/u.test(noMoney), 'القارئان بلا أيّ حقل مال');

  // ─── من الطابور: العملية اللي صارت غير صالحة تنركن parked ولا ترمي ──────────────────────────────────────────────
  await db.admin("update public.flocks set status = 'preparing' where id = $1", [F3]);
  t.eq(code(await save(U.worker, F3, TODAY, { dead: 1 })), 'flock_not_placed', 'فوج غير مسكَّن: flock_not_placed');
  await db.admin("update public.flocks set status = 'closed', closed_on = '2026-10-29' where id = $1", [F3]);
  t.eq(code(await save(U.worker, F3, TODAY, { dead: 1 })), 'flock_closed', 'فوج مغلق بنداء مباشر: flock_closed');
  const parkRef = ref();
  const parked = await save(U.worker, F3, TODAY, { dead: 4, feed: '90' }, null, parkRef, true);
  same(parked.v, { status: 'parked', reason: 'flock_closed' }, 'فوج مغلق من الطابور: parked');
  same(ui.dayAnswer(parked.v), { kind: 'parked' }, 'محلّل الشاشات (dayAnswer): parked تنشال من الطابور بلا رفّ مراجعة');
  same((await save(U.worker, F3, TODAY, { dead: 4, feed: '90' }, null, parkRef, true)).v, parked.v, 'نفس المرجع = نفس الجواب المركون');
  t.eq((await save(U.worker, F3, TODAY, { dead: 6 }, null, ref(), true)).v?.status, 'parked', 'عملية أحدث لنفس اليوم تنركن');
  const rejects = (await db.admin('select reason, payload, client_ref from public.flock_day_rejects where flock_id = $1', [F3])).rows;
  same([rejects.length, rejects[0]?.payload.dead, rejects[0]?.client_ref === parkRef], [1, 6, false], 'صفّ مركون واحد لكل (المستخدم، الفوج، اليوم) والأحدث يستبدله');
  t.eq(await day(F3, TODAY), null, 'المركون بلا أثر على الجولة');
  same(
    {
      scope: (await save(U.layerWorker, F1, TODAY, { dead: 1 }, 1, ref(), true)).v,
      old: (await save(U.worker, F1, '2026-10-21', { dead: 1 }, null, ref(), true)).v,
    },
    { scope: { status: 'parked', reason: 'out_of_scope' }, old: { status: 'parked', reason: 'date_too_old' } },
    'خارج النطاق وأقدم من 7 أيام من الطابور: parked بسببه',
  );
  t.eq(code(await call(U.manager, 'select public.set_period_lock($1)', ['2026-10-25'])), 'ok', 'المدير يقفل الفترة حتى 25/10');
  same(
    {
      queued: (await save(U.worker, F1, '2026-10-25', { dead: 21 }, 3, ref(), true)).v,
      direct: code(await save(U.worker, F1, '2026-10-25', { dead: 21 }, 3)),
      weight: code(await weight(U.worker, F1, '2026-10-25', 50, '120')),
      open: code(await open(U.manager, lockedHall, '2026-10-25', 300)),
    },
    { queued: { status: 'parked', reason: 'period_locked' }, direct: 'period_locked', weight: 'period_locked', open: 'period_locked' },
    'الفترة المقفولة: من الطابور parked، وبنداء مباشر period_locked (الجولة والوزن والتسكين)',
  );
  const pending = summary(await overview(U.manager), sites.broiler, B1);
  t.eq(pending.rejects_pending, 3, 'ملخّص الفوج يعدّ المركونات بلا قرار (خارج النطاق وقديم ومقفول)');
  t.eq((await day(F1, '2026-10-25')).dead, 20, 'المركونات ما غيّرت يوم 25/10');

  // ─── سياسات القراءة بالنطاق نفسه (FOUNDATION ٥٤٤): القراءة المباشرة للجداول (PostgREST) ما تعبر نطاق القارئ ─────────────────
  t.eq((await weight(U.layerWorker, F2, TODAY, 20, '1650.0')).v?.status, 'saved', 'وزن عيّنة لفوج البيّاض');
  t.eq((await save(U.layerWorker, F2, '2026-10-21', { dead: 2 }, null, ref(), true)).v?.status, 'parked', 'جولة بيّاض قديمة من الطابور تنركن');
  const direct = async (user, flock) =>
    (
      await call(
        user,
        'select (select count(*) from public.flocks where id = $1)::int as flocks, (select count(*) from public.flock_daily where flock_id = $1)::int as days, (select count(*) from public.flock_weights where flock_id = $1)::int as weights, (select count(*) from public.flock_day_rejects where flock_id = $1)::int as rejects',
        [flock],
      )
    ).rows?.[0] ?? null;
  const none = { flocks: 0, days: 0, weights: 0, rejects: 0 };
  same(
    {
      layerWorker: await direct(U.layerWorker, F2),
      manager: await direct(U.manager, F2),
      viewer: await direct(U.viewer, F1),
      worker: await direct(U.worker, F2),
      viewerLayer: await direct(U.viewer, F2),
      layerManager: await direct(U.layerManager, F1),
      bare: await direct(U.bareViewer, F1),
      keeper: await direct(U.keeper, F1),
    },
    {
      layerWorker: { flocks: 1, days: 4, weights: 1, rejects: 1 },
      manager: { flocks: 1, days: 4, weights: 1, rejects: 1 },
      viewer: { flocks: 1, days: 6, weights: 1, rejects: 3 },
      worker: none,
      viewerLayer: none,
      layerManager: none,
      bare: none,
      keeper: none,
    },
    'القراءة المباشرة بنطاق الحقل: عامل البيّاض والمدير يقرآن فوج البيّاض، والمشاهد فوج اللحم بنطاقه؛ وعامل اللحم ومشاهده ومدير البيض خارج نطاقهم، والمشاهد بلا نطاق والأمين: صفر صفّ بكل جدول',
  );

  // ─── التزامن: فوج 100 طير وحفظان بنفس اللحظة بـ60 لكل يوم ← واحد يحفظ والثاني live_negative والحيّ 40 ───────────────────
  const daySql = 'select public.save_flock_day($1, $2, $3, null, null, null, null, null, null, null, null, null, null, $4, false) as v';
  const raced = await race(
    db,
    { user: U.worker, sql: daySql, params: [F4, '2026-10-29', 60, ref()] },
    { user: U.manager, sql: daySql, params: [F4, TODAY, 60, ref()] },
  );
  same([raced.first, raced.state, raced.second], ['ok', 'blocked', 'live_negative'], 'الثاني ينتظر قفل صفّ الفوج ثم يرى الأوّل: live_negative');
  t.eq(summary(await overview(U.manager), sites.broiler, B4).live, 40, 'الحيّ 40 (100 − 60) وما نزل تحت الصفر');
  const control = await race(
    db,
    { user: U.worker, sql: daySql, params: [F4, '2026-10-28', 30, ref()], rollback: true },
    { user: U.manager, sql: daySql, params: [F4, TODAY, 30, ref()] },
  );
  same([control.first, control.state, control.second], ['ok', 'blocked', 'ok'], 'ضابط: الأوّل يرجع فالثاني يكمل بعد انتظاره');
  t.eq(summary(await overview(U.manager), sites.broiler, B4).live, 10, 'الحيّ 10 (100 − 60 − 30)');

  // ─── ضوابط verify_flocks: خرق مثبَّت بمعاملة ترجع يبين باسمه ─────────────────────────────────────────────────
  const probe = (sql) =>
    db.asOwner(async (oq) => {
      await oq(sql);
      return Object.fromEntries((await oq('select check_name, violations::int as n from public.verify_flocks() where violations <> 0')).rows.map((r) => [r.check_name, r.n]));
    });
  same(await probe(`update public.flock_daily set dead = 99999 where flock_id = '${F1}' and on_date = '2026-10-26'`), { live_negative: 1 }, 'ضابط: نافق أكثر من المسكّن ← live_negative');
  same(await probe(`update public.flock_daily set eggs_total = 7 where flock_id = '${F1}' and on_date = '2026-10-26'`), { eggs_on_broiler: 1 }, 'ضابط: بيض بفوج لحم ← eggs_on_broiler');
  same(await probe(`update public.flock_daily set on_date = '2026-10-24' where flock_id = '${F1}' and on_date = '2026-10-25'`), { day_before_placement: 1 }, 'ضابط: يوم قبل التسكين ← day_before_placement');
  same(await probe(`update public.flock_daily set hall_id = '${B3}' where flock_id = '${F1}' and on_date = '2026-10-26'`), { day_hall_mismatch: 1 }, 'ضابط: يوم بقاعة غير قاعة فوجه ← day_hall_mismatch');
  same(await probe(`alter table public.halls disable trigger halls_check; update public.halls set archived_at = now() where id = '${B4}'`), { live_flock_on_archived_hall: 1 }, 'ضابط: فوج قائم بقاعة مؤرشفة ← live_flock_on_archived_hall');
  same(await probe(`update public.flock_weights set hall_id = '${B3}' where flock_id = '${F1}'`), { weight_hall_mismatch: 1 }, 'ضابط: وزن بقاعة غير قاعة فوجه ← weight_hall_mismatch');
  same(await probe(`alter table public.flocks disable trigger flocks_place; update public.flocks set kind = 'layer' where id = '${F4}'`), { flock_kind_mismatch: 1 }, 'ضابط: فوج بيّاض بحقل لحم ← flock_kind_mismatch');
  same(await probe(`update public.flock_daily set eggs_total = 6000 where flock_id = '${F2}' and on_date = '2026-10-28'`), { eggs_over_live: 1 }, 'ضابط: بيض 6,000 من 4,990 دجاجة حيّة بداية اليوم (فوق 100٪) ← eggs_over_live');
  same(await probe(`update public.flock_day_rejects set hall_id = '${B3}' where flock_id = '${F1}' and on_date = '2026-10-21'`), { reject_hall_mismatch: 1 }, 'ضابط: جولة مركونة بقاعة غير قاعة فوجها ← reject_hall_mismatch');

  // الكتابة المباشرة على جداول الدالّة ممنوعة لكل دور (write-lock-check).
  same(
    [
      code(await call(U.manager, 'insert into public.flocks (hall_id, kind, opened_on) values ($1, \'broiler\', $2)', [lockedHall, TODAY])),
      code(await call(U.manager, 'update public.flock_daily set dead = 0 where flock_id = $1', [F1])),
      code(await call(U.worker, 'insert into public.flock_weights (flock_id, hall_id, on_date, sample_count, avg_g) values ($1, $2, $3, 1, 1)', [F1, B1, TODAY])),
    ],
    ['permission denied for table flocks', 'permission denied for table flock_daily', 'permission denied for table flock_weights'],
    'الأفواج والجولات والأوزان: الكتابة من الدوالّ فقط',
  );
}
