// «الدورة المفتوحة» (0029؛ كلمة الزبون 2026-11-16: «خلي الوقت مفتوح… من يخلصون همة يكولون انتهت الدورة»، ثمّ «لا لاتشيل نهاية الدورة بس خليها
// اختيارية»؛ DECISIONS «الدورة المفتوحة»): جدول النوع وجدول القاعة يُحفظان بنهاية null وأيّامهما حتى 1,000، وبنهاية كما كانا؛ ورأس الفوج (التقويم
// وتقرير الدورة) بلا نهاية لقاعة جدولها الخاصّ مفتوح ولو كان لجدول النوع نهاية؛ ولوحة اللقاحات تعطي كلّ قاعة فوجها القائم المسكَّن (للتقويم بالأشهر
// الحقيقية)؛ والثوابت صفر؛ وطفرات تكسر كلّ قاعدة فيفشل فحصها.
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';

const TODAY = '2026-11-16';
const id = (n) => `d2900000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477029000${String(n).padStart(2, '0')}`;
const day = (offset) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);

const SAVE_T = 'select public.save_vaccine_program($1, $2, $3::jsonb, $4) as v';
const SAVE_H = 'select public.save_hall_vaccine_program($1, $2, $3::jsonb, $4) as v';
const FN = {
  saveType: 'public.save_vaccine_program(text, integer, jsonb, integer)',
  saveHall: 'public.save_hall_vaccine_program(uuid, integer, jsonb, integer)',
  head: 'private.hall_flock_json(public.flocks)',
};
const shown = (result) => (result.ok ? 'ok' : result.code);

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const G = await makeOrg(db, {
    name: 'مزرعة الدورة المفتوحة',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['hallWorker', 'hall_worker', ['broiler']],
      ['layerManager', 'manager', ['layer']],
    ],
  });
  const { users: U, divisions: D } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const farm = await one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل مفتوح', 'farm') returning id", [D.broiler]);
  const hall = (name) => one(U.owner, 'insert into public.halls (site_id, name) values ($1, $2) returning id', [farm, name]);
  const open = async (hallId, on, age0) => (await one(U.owner, 'select public.open_flock($1, $2, 5000, $3, null, $4) as v', [hallId, on, age0, uid()])).flock_id;
  const nd = (await one(U.owner, "select public.save_vaccine($1, 'ND', null, null) as v", [uid()])).id;
  const ib = (await one(U.owner, "select public.save_vaccine($1, 'IB', null, null) as v", [uid()])).id;
  const days = (...pairs) => JSON.stringify(pairs.map(([vaccine_id, age_day]) => ({ vaccine_id, age_day })));

  // ── ١) جدول النوع: بنهاية كما كان، وبلا نهاية (مفتوح) ──────────────────────────────────────────
  const typed = await call(db, U.manager, SAVE_T, ['broiler', 42, days([nd, 7]), 0]);
  t.same([shown(typed), typed.value?.end_age], ['ok', 42], 'جدول اللاحم بنهاية 42 كما كان');
  const beyond = await call(db, U.manager, SAVE_T, ['broiler', 42, days([nd, 7], [ib, 60]), 1]);
  t.same([shown(beyond), beyond.hint?.includes('اتركها مفتوحة')], ['bad_day', true], 'ويوم بعد النهاية مرفوض، والجملة تقول «أو اتركها مفتوحة»');
  const opened = await call(db, U.manager, SAVE_T, ['broiler', null, days([nd, 7], [ib, 60]), 1]);
  t.same([shown(opened), opened.value?.end_age, opened.value?.version, opened.value?.days], ['ok', null, 2, 2], 'وبلا نهاية: مفتوحة، ويوم 60 مقبول (كلمة الزبون: «خلي الوقت مفتوح»)');
  const far = await call(db, U.manager, SAVE_T, ['broiler', null, days([nd, 1001]), 2]);
  t.same([shown(far), far.hint?.includes('من 1 إلى 1,000')], ['bad_day', true], 'والمفتوح أيّامه من 1 إلى 1,000، والجملة تقولها');
  t.eq(shown(await call(db, U.manager, SAVE_T, ['broiler', 0, days([nd, 7]), 2])), 'bad_end_age', 'ونهاية صفر مرفوضة كما كانت');
  t.eq(shown(await call(db, U.manager, SAVE_T, ['broiler', 1001, days([nd, 7]), 2])), 'bad_end_age', 'ونهاية فوق 1,000 مرفوضة كما كانت');
  t.eq(shown(await call(db, U.hallWorker, SAVE_T, ['broiler', null, days(), 2])), 'forbidden', 'والعامل لا يكتب الجدول كما كان');

  // ── ٢) رأس الفوج: جدول النوع المفتوح بلا نهاية، وجدول القاعة يحكم ولو مفتوحاً ─────────────────
  const HA = await hall('قاعة 1');
  const HB = await hall('قاعة 2');
  const fa = await open(HA, day(-20), 0);
  const fb = await open(HB, day(-10), 3);
  const head = async (flock) => (await one(U.manager, 'select public.flock_month($1, $2) as v', [flock, TODAY])).flock;
  const ends = async (flock) => {
    const h = await head(flock);
    return [h.end_age, h.end_on];
  };
  t.same(await ends(fa), [null, null], 'جدول النوع مفتوح: الفوج بلا نهاية مخطّطة');
  await one(U.manager, SAVE_T, ['broiler', 42, days([nd, 7], [ib, 21]), 2]);
  t.same(await ends(fa), [42, day(22)], 'وبنهاية 42: نهايته يوم التسكين + 42 كما كانت');
  await one(U.manager, SAVE_H, [HA, null, days([ib, 50]), 0]);
  t.same(await ends(fa), [null, null], 'جدول «قاعة 1» الخاصّ مفتوح: يحكم ولو كان لجدول النوع نهاية (كان coalesce يرجع إلى 42)');
  t.same(await ends(fb), [42, day(29)], 'و«قاعة 2» بجدول النوع ونهايته (العمر عند التسكين 3)');
  const report = await one(U.manager, 'select public.flock_cycle_report($1) as v', [fa]);
  t.same([report.flock?.end_age, report.flock?.end_on], [null, null], 'وتقرير الدورة بلا نهاية مخطّطة لها');
  const month = await one(U.manager, 'select public.flock_month($1, $2) as v', [fa, day(-20)]);
  t.eq(month.next, true, 'والتقويم يمشي إلى شهر اليوم بلا نهاية (الأبعد من اليوم ونهاية لا شيء)');
  const hallSaved = await call(db, U.manager, SAVE_H, [HA, 30, days([ib, 50]), 1]);
  t.same([shown(hallSaved), hallSaved.hint?.includes('اتركها مفتوحة')], ['bad_day', true], 'وجدول القاعة بنهاية 30 ويوم 50 مرفوض بالجملة نفسها');
  t.eq(shown(await call(db, U.manager, SAVE_H, [HA, 60, days([ib, 50]), 1])), 'ok', 'وبنهاية 60 مقبول');
  t.same(await ends(fa), [60, day(40)], 'ونهايته من جدولها الخاصّ');

  // ── ٣) لوحة اللقاحات: فوج كلّ قاعة للتقويم بالأشهر ───────────────────────────────────────────────
  const HC = await hall('قاعة 3');
  const board = await one(U.hallWorker, 'select public.vaccine_board() as v', []);
  const flockOf = (hallId) => {
    const f = board.halls.find((h) => h.id === hallId)?.flock;
    return f ? [f.id, f.placed_on, f.age0] : f;
  };
  t.same([flockOf(HA), flockOf(HB), flockOf(HC)],
    [[fa, day(-20), 0], [fb, day(-10), 3], null], 'لوحة اللقاحات: لكلّ قاعة فوجها القائم بيوم تسكينه وعمره عنده، وقاعة بلا فوج null');
  t.eq((await one(U.layerManager, 'select public.vaccine_board() as v', [])).halls.some((h) => h.id === HA), false, 'ومن لا يرى حقل اللحم لا يرى قاعاته ولا أفواجها');

  // ── ٤) الثوابت ─────────────────────────────────────────────────────────────────────────────────────
  for (const fn of ['verify_halls', 'verify_flocks']) {
    const rows = (await db.admin(`select * from public.${fn}()`)).rows.filter((r) => Number(r.violations) !== 0);
    t.same(rows, [], `${fn} صفر`);
  }

  // ── ٥) طفرات ───────────────────────────────────────────────────────────────────────────────────────
  await mutant(db, U.manager, [[FN.saveType, [['coalesce(p_end_age, 1000)', 'p_end_age']]]], async ({ attempt }) => {
    const v = await attempt(U.manager, async (q) => (await q(SAVE_T, ['broiler', null, days([nd, 1001]), 3])).rows[0].v);
    t.ok(!v.ok && v.code !== 'bad_day', 'طفرة: بلا coalesce يعبر يوم 1001 الفحص (between مع null لا شيء) فيقع على قيد الجدول بخطأ خام لا بجملة bad_day');
  });
  await mutant(db, U.manager, [[FN.saveHall, [['  if p_end_age is not null and p_end_age not between 1 and 1000 then', '  if p_end_age is null or p_end_age not between 1 and 1000 then']]]], async ({ attempt }) => {
    const r = await attempt(U.manager, async (q) => (await q(SAVE_H, [HB, null, days([nd, 7]), 0])).rows[0].v);
    t.eq(r.code, 'bad_end_age', 'طفرة: شرط 0028 على جدول القاعة يرفض المفتوح، فيفشل فحص «جدول القاعة مفتوح»');
  });
  await mutant(db, U.manager, [[FN.head, [["'end_age', case when hp.id is not null then hp.end_age else p.end_age end", "'end_age', coalesce(hp.end_age, p.end_age)"]]]], async ({ attempt }) => {
    await attempt(U.manager, async (q) => q(SAVE_H, [HB, null, days([nd, 7]), 0]));
    const r = await attempt(U.manager, async (q) => (await q('select public.flock_month($1, $2) as v', [fb, TODAY])).rows[0].v.flock.end_age);
    t.eq(r.value, 42, 'طفرة: بـcoalesce (0028) يرجع فوج القاعة المفتوحة إلى نهاية جدول النوع 42، فيفشل فحص «جدول القاعة يحكم»');
  });
}
