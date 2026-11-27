// «الكاز» بجانب الغاز (0037، العقد docs/plans/0037/contract-0037.md «الجزء D»؛ DECISIONS 2026-11-26): لترات الكاز لكلّ (وجبة، يوم) رقماً بلا مخزن ولا كلفة —
// الجدول flock_day_kerosene وكاتبه set_flock_kerosene (مرآة set_flock_gas: saved | stale_kerosene | parked)، ومفاتيح الكاز في hall_sheet (kerosene
// وkerosene_version لكلّ يوم، وtotals.kerosene وsummary.kerosene، وكلّ مفتاح قائم كما في جسم 0035)، والحرّاس (edit_flock وflock_activity_after وdelete_flock
// تسمّي «كاز» و«الكاز»)، والثابت verify_kerosene، وملفّ التراجع. منشأة هذا الملفّ: المعرّفات d3737000 والهواتف 96477037370.
// البذرة (اليوم المثبَّت 2026-11-26): حقل لحم بخمس قاعات — «قاعة 1» (1,000 طير قبل 30 يوماً: عيّنة الورقة بكاز يومين ويوم مُسح وغاز يوم)، و«قاعة 2»
// (500 قبل عشرة أيّام، أوّل سجلّ لها كاز قبل ثلاثة أيّام)، و«قاعة 3» (300 قبل 20 يوماً تُغلق قبل يومين)، و«قاعة 4» (200 قبل 12 يوماً، لا شيء عليها إلّا
// كاز قبل ثلاثة أيّام)، و«قاعة 5» (400 قبل عشرة أيّام، للسباق). والطفرات داخل معاملة صاحب الجداول ترجع: كلّ قاعدة مكسورة يمسكها فحصها، وكلّ فحص في
// الثابت يمسكه جسم مكسور يكتب خرقه بنفسه (لا صفّ مكتوب باليد).
// وعيّنات القاعدة الحقيقية للشاشات: KEROSENE_SAMPLES_OUT=1 يكتب scripts/tests/fixtures/kerosene-0037.json.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { race } from './shared.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..');
const MIGRATIONS = path.join(DIR, '..', 'migrations');
const FIXTURE = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'kerosene-0037.json');
const TODAY = '2026-11-26';
const DAY_MS = 86400000;
const day = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const id = (n) => `d3737000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477037370${String(n).padStart(2, '0')}`;

const KEROSENE = 'select public.set_flock_kerosene($1, $2, $3, $4, $5, $6) as v';
const GAS = 'select public.set_flock_gas($1, $2, $3, $4, $5, $6) as v';
const DAY = 'select public.save_flock_day($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) as v';
const SHEET = 'select public.hall_sheet($1) as v';
const DECIDE = 'select public.decide_flock_reject($1, $2, $3) as v';
const EDIT = 'select public.edit_flock($1, (select version from public.flocks where id = $1), $2, $3, 0, null, $4) as v';
const DELETE = 'select public.delete_flock($1, (select version from public.flocks where id = $1), $2) as v';
const CLOSE_FORM = "select public.flock_close_form($1) ->> 'plan' as v";
const CLOSE = "select public.close_flock($1, $2, $3, $4, $5, 0, '[]'::jsonb, 'بيعت', '[]'::jsonb, null, $6) as v";
const SIG = {
  kerosene: 'public.set_flock_kerosene(uuid, date, integer, bigint, uuid, boolean)',
  sheet: 'public.hall_sheet(uuid)',
  edit: 'public.edit_flock(uuid, integer, date, integer, integer, text, uuid)',
  activity: 'private.flock_activity_after(public.flocks, date)',
  deleteFlock: 'public.delete_flock(uuid, integer, uuid)',
  inScopeSite: 'public.in_scope_site(uuid)',
  check: 'private.flock_day_check(public.flocks, date)',
  verify: 'public.verify_kerosene()',
};
const VERIFY_ZERO = { kerosene_days: 0, kerosene_versions: 0, kerosene_hall: 0, sheet_kerosene_totals: 0 };

const keroseneParams = (k) => [k.flock, k.on === undefined ? TODAY : k.on, k.liters ?? null, k.base ?? null, k.ref ?? uid(), k.queued ?? false];
const gasParams = (g) => [g.flock, g.on === undefined ? TODAY : g.on, g.n ?? null, g.base ?? null, g.ref ?? uid(), g.queued ?? false];
const dayParams = (d) => [d.flock, d.on === undefined ? TODAY : d.on, d.dead ?? null, null, null, null, null, null, null, null, null, d.note ?? null, d.base ?? null,
  d.ref ?? uid(), d.queued ?? false];

const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v ?? null);
const omit = (o, ...keys) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !keys.includes(k)));

// أجزاء الأجسام الحقيقية التي تكسرها الطفرات (كلّ مرساة مرّة واحدة بالضبط في تعريفها، purchase-kit).
const ANCHOR = {
  dayCheck: '  perform private.flock_day_check(f, p_on);\n',
  insertValues: '    values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_on, p_liters, 1)\n',
  sameValue: '  if (k.id is null and p_liters is null) or (k.id is not null and k.liters is not distinct from p_liters) then',
  versionCheck: '  if p_expected_version is distinct from k.version then',
  bounds: '  if p_liters < 0 or p_liters > 20000 then',
  futureBlock: "  if p_on > v_today then\n    raise exception 'date_in_future' using hint = format('يوم %s لم يأتِ بعد؛ يُكتب الكاز لليوم %s أو لما قبله من أيّام الوجبة.', to_char(p_on, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY'));\n  end if;\n",
  parkKey: "      md5('kerosene:' || coalesce(auth.uid()::text, '') || ':' || f.id::text || ':' || to_char(p_on, 'YYYY-MM-DD'))::uuid)\n    on conflict (org_id, visit_id) where visit_id is not null do update",
  parkVersion: '          version = public.flock_day_rejects.version + 1, decision = null',
  parkDecision: 'version = public.flock_day_rejects.version + 1, decision = null, decided_by = null, decided_at = null;',
  sheetJoin: 'left join public.flock_day_kerosene ks on ks.org_id = f.org_id and ks.flock_id = f.id and ks.on_date = g.d',
  sheetVersion: 'ks.liters, ks.version as kerosene_version,',
  sheetTotals: "'kerosene', coalesce(sum(z.liters), 0)::bigint",
  sheetSummary: "'kerosene', (v_totals ->> 'kerosene')::bigint",
  sheetDay: "'kerosene', z.liters, ",
  editLine: '      (select min(x.on_date) from public.flock_day_kerosene x where x.org_id = f.org_id and x.flock_id = f.id and x.liters is not null),\n',
  editFilter: 'x.flock_id = f.id and x.liters is not null),\n',
  activityUnion: "    union all\n    -- 0037: الكاز المسجَّل.\n    select 'كاز', k.on_date, 8 from public.flock_day_kerosene k where k.org_id = f.org_id and k.flock_id = f.id and k.liters is not null\n",
  activityFilter: 'k.flock_id = f.id and k.liters is not null\n',
  deleteNaming: "  if exists (select 1 from public.flock_day_kerosene x where x.org_id = f.org_id and x.flock_id = f.id and x.liters is not null) then\n    v_has := v_has || 'الكاز'::text;\n  end if;\n",
  deleteNamingFilter: "x.flock_id = f.id and x.liters is not null) then\n    v_has := v_has || 'الكاز'::text;",
  deleteCleared: '  delete from public.flock_day_kerosene x where x.org_id = f.org_id and x.flock_id = f.id and x.liters is null;\n',
};

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const samples = {};
  const same = (actual, expected, label) => t.same(sorted(actual), sorted(expected), label);
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (error) {
      t.ok(false, `${name}: رمى ${error.stack ?? error.message}`);
    }
  };
  const G = await makeOrg(db, {
    name: 'مزرعة الكاز',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['worker', 'hall_worker', ['broiler']],
      ['viewer', 'viewer'],
    ],
  });
  const { users: U, divisions: D, org } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const code = (result) => (result.ok ? 'ok' : result.code);
  const kerosene = (user, k, options) => call(db, user, KEROSENE, keroseneParams(k), options);
  const sheet = async (flock, user = U.owner) => one(user, SHEET, [flock]);
  const verifyOf = async (q) => Object.fromEntries((await q('select check_name, violations::int as v from public.verify_kerosene()')).rows.map((r) => [r.check_name, r.v]));
  const inside = async (attempt, user, sql, params) => {
    const result = await attempt(user, async (q) => (await q(sql, params)).rows[0].v);
    return result.ok ? result.value : { code: result.code, hint: result.hint };
  };
  const rowOf = (s, on) => s.days.find((d) => d.on === on);
  const keroseneRow = async (flock, on) => (await db.admin('select liters, version::int as version from public.flock_day_kerosene where flock_id = $1 and on_date = $2', [flock, on])).rows[0] ?? null;
  const rejectRow = async (rejectId) => (await db.admin('select version, decision, payload from public.flock_day_rejects where id = $1', [rejectId])).rows[0];
  const bodyOf = (file, head) => {
    const text = readFileSync(path.join(MIGRATIONS, file), 'utf8');
    const start = text.indexOf(`create or replace function ${head}(`);
    return text.slice(start, text.indexOf('\n$$;', start) + 4);
  };

  // ── البذرة ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const S = { a: await one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل الكاز', 'farm') returning id", [D.broiler]) };
  const hall = (name) => one(U.owner, 'insert into public.halls (site_id, name) values ($1, $2) returning id', [S.a, name]);
  const H = { a: await hall('قاعة 1'), b: await hall('قاعة 2'), c: await hall('قاعة 3'), d: await hall('قاعة 4'), e: await hall('قاعة 5') };
  const place = async (hallId, on, count) => (await one(U.owner, 'select public.open_flock($1, $2, $3, 0, null, $4) as v', [hallId, on, count, uid()])).flock_id;
  const F = { a: await place(H.a, day(-30), 1000), b: await place(H.b, day(-10), 500), c: await place(H.c, day(-20), 300), d: await place(H.d, day(-12), 200), e: await place(H.e, day(-10), 400) };
  // «قاعة 3» تُغلق قبل يومين بفرق العدّ (300 حيّة).
  await db.setToday(day(-2), async () => {
    const plan = await one(U.owner, CLOSE_FORM, [F.c]);
    await one(U.owner, CLOSE, [uid(), uid(), F.c, day(-2), 300, plan]);
  });
  // إغلاق «قاعة 4» بيوم داخل معاملة طفرة.
  const closeD = async (attempt, on) => inside(attempt, U.owner, CLOSE, [uid(), uid(), F.d, on, 200, await inside(attempt, U.owner, CLOSE_FORM, [F.d])]);
  // وجبة جديدة في «قاعة 6» قبل ثلاثة أيّام داخل معاملة طفرة (للحذف).
  const freshFlock = async (attempt) => {
    const hallId = await inside(attempt, U.owner, "insert into public.halls (site_id, name) values ($1, 'قاعة 6') returning id as v", [S.a]);
    return (await inside(attempt, U.owner, 'select public.open_flock($1, $2, 100, 0, null, $3) as v', [hallId, day(-3), uid()])).flock_id;
  };
  // وجبة قيد التحضير (لا دالّة تكتبها) في «قاعة التحضير» داخل معاملة طفرة.
  const preparingFlock = async (oq, attempt) => {
    const hallId = await inside(attempt, U.owner, "insert into public.halls (site_id, name) values ($1, 'قاعة التحضير') returning id as v", [S.a]);
    return (await oq("insert into public.flocks (org_id, hall_id, site_id, division_id, kind, opened_on, status) values ($1, $2, $3, $4, 'broiler', $5, 'preparing') returning id",
      [org, hallId, S.a, D.broiler, day(-1)])).rows[0].id;
  };

  // ── ١) الحفظ والنسخة ───────────────────────────────────────────────────────────────────────────────────────────────
  await section('الكاز: الحفظ والنسخة', async () => {
    const ref1 = uid();
    const first = await kerosene(U.owner, { flock: F.a, on: day(-3), liters: 120, ref: ref1 });
    same(first.value, { status: 'saved', kerosene: { on: day(-3), liters: 120, version: 1 } }, 'أوّل كاز ليوم: saved بالنسخة 1');
    samples.set_flock_kerosene_saved = first.value;
    same((await kerosene(U.owner, { flock: F.a, on: day(-3), liters: 120, ref: ref1 })).value, first.value, 'الإعادة بالمرجع نفسه = الجواب الأوّل');
    same(code(await kerosene(U.owner, { flock: F.a, on: day(-3), liters: 999, ref: ref1 })), 'ref_reused', 'المرجع نفسه بقيمة أخرى ref_reused');
    same((await kerosene(U.owner, { flock: F.a, on: day(-3), liters: 120 })).value, { status: 'saved', kerosene: { on: day(-3), liters: 120, version: 1 } },
      'اللترات نفسها بمرجع جديد ولو بلا نسخة: حُفظت بلا نسخة جديدة');
    same((await kerosene(U.owner, { flock: F.a, on: day(-3), liters: 150, base: 1 })).value, { status: 'saved', kerosene: { on: day(-3), liters: 150, version: 2 } },
      'التعديل بنسخته: النسخة 2');
    const stale = await kerosene(U.worker, { flock: F.a, on: day(-3), liters: 200, base: 1 });
    same(stale.value, { status: 'stale_kerosene', server: { on: day(-3), liters: 150, version: 2 } }, 'التعديل بنسخة قديمة: stale_kerosene بما في الخادم');
    samples.set_flock_kerosene_stale = stale.value;
    same((await kerosene(U.owner, { flock: F.a, on: day(-3), liters: 200 })).value?.status, 'stale_kerosene', 'بلا نسخة وفي الخادم صفّ: stale_kerosene');
    same(await keroseneRow(F.a, day(-3)), { liters: 150, version: 2 }, 'الرفضان لا يكتبان');
    same((await kerosene(U.owner, { flock: F.a, on: day(-29), liters: 40 })).value?.kerosene, { on: day(-29), liters: 40, version: 1 },
      'كاز يوم قبل 29 يوماً لوجبة قائمة (بلا حدّ الأيّام السبعة)');
    await one(U.owner, KEROSENE, keroseneParams({ flock: F.a, on: day(-1), liters: 60 }));
    same((await kerosene(U.owner, { flock: F.a, on: day(-1), liters: null, base: 1 })).value, { status: 'saved', kerosene: { on: day(-1), liters: null, version: 2 } },
      'المسح: لترات فارغة بنسخة أكبر');
    same((await kerosene(U.owner, { flock: F.a, on: day(-1), liters: null })).value, { status: 'saved', kerosene: { on: day(-1), liters: null, version: 2 } },
      'المسح مرّة ثانية: حُفظ بلا نسخة جديدة');
    same(await keroseneRow(F.a, day(-1)), { liters: null, version: 2 }, 'صفّ الكاز الممسوح باقٍ بنسخته (درس ABA)');
    same((await kerosene(U.owner, { flock: F.a, on: day(-1), liters: 70, base: 1 })).value, { status: 'stale_kerosene', server: { on: day(-1), liters: null, version: 2 } },
      'بعد المسح: نسخة ما قبله stale_kerosene (لا ترجع النسخة)');
    same((await kerosene(U.owner, { flock: F.a, on: day(-6), liters: null })).value, { status: 'saved', kerosene: { on: day(-6), liters: null, version: null } },
      'مسح يوم بلا صفّ: حُفظ بلا كتابة');
    t.eq(await keroseneRow(F.a, day(-6)), null, 'ولا صفّ له');
    // والغاز بجانبه في يوم الكاز نفسه (عيّنة الورقة): خانتان مستقلّتان.
    await one(U.owner, GAS, gasParams({ flock: F.a, on: day(-3), n: 2 }));
    same([await keroseneRow(F.a, day(-3)), (await db.admin('select cylinders from public.flock_day_gas where flock_id = $1 and on_date = $2', [F.a, day(-3)])).rows[0]?.cylinders],
      [{ liters: 150, version: 2 }, 2], 'الغاز في يوم الكاز نفسه لا يمسّ الكاز');
  });

  // ── ٢) الرفوض بنداء مباشر ────────────────────────────────────────────────────────────────────────────────────────────
  await section('الكاز: الرفوض', async () => {
    const accepted = async (liters) => (await kerosene(U.owner, { flock: F.a, on: day(-4), liters }, { commit: false })).value;
    same({
      over: code(await kerosene(U.owner, { flock: F.a, on: day(-4), liters: 20001 })),
      negative: code(await kerosene(U.owner, { flock: F.a, on: day(-4), liters: -1 })),
      zero: await accepted(0),
      max: await accepted(20000),
      future: code(await kerosene(U.owner, { flock: F.a, on: day(1), liters: 1 })),
      futureQueued: code(await kerosene(U.owner, { flock: F.a, on: day(1), liters: 1, queued: true })),
      before: code(await kerosene(U.owner, { flock: F.a, on: day(-31), liters: 1 })),
      beforeQueued: code(await kerosene(U.owner, { flock: F.a, on: day(-31), liters: 1, queued: true })),
      required: code(await kerosene(U.owner, { flock: F.a, on: null, liters: 1 })),
      infinite: code(await kerosene(U.owner, { flock: F.a, on: 'infinity', liters: 1 })),
      missing: code(await kerosene(U.owner, { flock: id(999), on: day(-4), liters: 1 })),
      missingQueued: code(await kerosene(U.owner, { flock: id(999), on: day(-4), liters: 1, queued: true })),
      closed: code(await kerosene(U.owner, { flock: F.c, on: day(-4), liters: 1 })),
      // 0034 («الكلّ مثل المالك»): المشاهد وعامل القاعة يكتبان الكاز كالمالك (بمعاملة ترجع، فلا صفّ بعدها).
      viewer: (await kerosene(U.viewer, { flock: F.a, on: day(-4), liters: 1 }, { commit: false })).value?.status,
      worker: (await kerosene(U.worker, { flock: F.a, on: day(-4), liters: 1 }, { commit: false })).value?.status,
    }, {
      over: 'bad_value', negative: 'bad_value', zero: { status: 'saved', kerosene: { on: day(-4), liters: 0, version: 1 } },
      max: { status: 'saved', kerosene: { on: day(-4), liters: 20000, version: 1 } }, future: 'date_in_future', futureQueued: 'date_in_future',
      before: 'before_placement', beforeQueued: 'before_placement', required: 'date_required', infinite: 'date_required', missing: 'flock_not_found',
      missingQueued: 'flock_not_found', closed: 'flock_closed', viewer: 'saved', worker: 'saved',
    }, 'set_flock_kerosene: كلّ رمز رفض بنداء مباشر، وحدّا اللترات (صفر و20,000 يُقبلان، و−1 و20,001 يُرفضان)، وكلّ عضو يكتب الكاز (0034)');
    t.eq(await keroseneRow(F.a, day(-4)), null, 'ولا صفّ كاز من رفض (ولا من نداء رجعت معاملته)');
    const bad = await kerosene(U.owner, { flock: F.a, on: day(-4), liters: 20001 });
    t.ok(bad.hint.includes('الكاز') && bad.hint.includes('20,000'), `تلميح bad_value يسمّي الكاز وحدّه (${bad.hint})`);
    const future = await kerosene(U.owner, { flock: F.a, on: day(1), liters: 1 });
    t.ok(future.hint.includes('الكاز') && future.hint.includes(dmy(day(1))) && future.hint.includes(dmy(TODAY)), `تلميح date_in_future يسمّي الكاز واليومين (${future.hint})`);
    const closed = await kerosene(U.owner, { flock: F.c, on: day(-4), liters: 1 });
    t.ok(closed.hint.includes('قاعة 3'), `تلميح flock_closed يسمّي القاعة (${closed.hint})`);
    // وجبة لم تُسكَّن (قيد التحضير، لا دالّة تكتبها): في قاعة جديدة داخل معاملة ترجع.
    const notPlaced = await mutant(db, U.owner, [], async ({ oq, attempt }) =>
      inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: await preparingFlock(oq, attempt), on: day(-1), liters: 5 })));
    t.ok(notPlaced?.code === 'flock_not_placed' && notPlaced.hint.includes('قاعة التحضير'), `وجبة لم تُسكَّن: flock_not_placed بتلميح يسمّي قاعتها (${notPlaced?.code} ${notPlaced?.hint})`);
  });

  // ── ٣) خارج النطاق والفترة المقفلة: بنداء مباشر ترمي، ومن الطابور تُركن ────────────────────────────────────────────────────────
  await section('الكاز: خارج النطاق والفترة المقفلة', async () => {
    // لا «خارج النطاق» لعضو في منشأته بعد 0034، فالنطاق يُضيَّق داخل معاملة ترجع: in_scope_site لا يرى «حقل الكاز».
    const narrow = [SIG.inScopeSite, [[
      '    where m.user_id = auth.uid() and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)\n',
      `    where p_site <> '${S.a}'::uuid and m.user_id = auth.uid() and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)\n`,
    ]]];
    const scope = await mutant(db, U.owner, [narrow], async ({ oq, attempt }) => {
      const direct = await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: F.a, on: day(-4), liters: 5 }));
      const queued = await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: F.a, on: day(-4), liters: 5, queued: true }));
      return {
        direct: direct?.code,
        queued,
        parked: (await oq("select payload, reason, version from public.flock_day_rejects where flock_id = $1 and on_date = $2 and payload ? 'kerosene'", [F.a, day(-4)])).rows,
        rows: (await oq('select count(*)::int as n from public.flock_day_kerosene where flock_id = $1 and on_date = $2', [F.a, day(-4)])).rows[0].n,
      };
    });
    same(scope, { direct: 'out_of_scope', queued: { status: 'parked', reason: 'out_of_scope' }, parked: [{ payload: { kerosene: 5 }, reason: 'out_of_scope', version: 1 }], rows: 0 },
      'قاعة خارج نطاق الكاتب: بنداء مباشر out_of_scope، ومن الطابور parked بـ{"kerosene": 5} ولا صفّ كاز');
    const locked = await mutant(db, U.owner, [], async ({ oq, attempt }) => {
      await inside(attempt, U.owner, 'select public.set_period_lock($1) as v', [day(-28)]);
      const direct = await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: F.a, on: day(-29), liters: 9, base: 1 }));
      const queued = await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: F.a, on: day(-29), liters: 9, base: 1, queued: true }));
      return {
        direct: direct?.code,
        queued,
        parked: (await oq("select payload, reason from public.flock_day_rejects where flock_id = $1 and on_date = $2 and payload ? 'kerosene'", [F.a, day(-29)])).rows,
        row: (await oq('select liters, version::int as version from public.flock_day_kerosene where flock_id = $1 and on_date = $2', [F.a, day(-29)])).rows[0],
        open: (await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: F.a, on: day(-27), liters: 9 })))?.status,
      };
    });
    same(locked, { direct: 'period_locked', queued: { status: 'parked', reason: 'period_locked' }, parked: [{ payload: { kerosene: 9 }, reason: 'period_locked' }],
      row: { liters: 40, version: 1 }, open: 'saved' },
    'الفترة المقفلة: بنداء مباشر period_locked، ومن الطابور parked، والكاز المسجَّل كما هو؛ ويوم بعد القفل يُكتب');
  });

  // ── ٤) الركن من الطابور: الوجبة المغلقة، والأحدث يستبدل بنسخة أكبر وبلا قرار، ولا يكتب فوق جولة أو غاز مركونين ─────────────────────────
  const rejectIds = {};
  await section('الكاز: الركن من الطابور', async () => {
    same((await call(db, U.owner, DAY, dayParams({ flock: F.c, on: day(-5), dead: 1, queued: true }))).value, { status: 'parked', reason: 'flock_closed' },
      'جولة لوجبة مغلقة من الطابور: parked');
    same((await call(db, U.owner, GAS, gasParams({ flock: F.c, on: day(-5), n: 2, queued: true }))).value, { status: 'parked', reason: 'flock_closed' }, 'وغاز لليوم نفسه');
    const parked = await kerosene(U.owner, { flock: F.c, on: day(-5), liters: 30, queued: true });
    same(parked.value, { status: 'parked', reason: 'flock_closed' }, 'كاز لوجبة مغلقة من الطابور: parked');
    samples.set_flock_kerosene_parked = parked.value;
    same((await kerosene(U.owner, { flock: F.c, on: day(-5), liters: 45, queued: true })).value, { status: 'parked', reason: 'flock_closed' }, 'وكاز أحدث لليوم نفسه');
    const rows = (await db.admin("select payload, reason, version, visit_id is not null as keyed from public.flock_day_rejects where flock_id = $1 and on_date = $2 order by payload ? 'kerosene', payload ? 'gas'",
      [F.c, day(-5)])).rows;
    same(rows, [
      { payload: { dead: 1, culled: null, feed_kg: null, water_l: null, temp_min: null, temp_max: null, eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null, base_version: null },
        reason: 'flock_closed', version: 1, keyed: false },
      { payload: { gas: 2 }, reason: 'flock_closed', version: 1, keyed: true },
      { payload: { kerosene: 45 }, reason: 'flock_closed', version: 2, keyed: true },
    ], 'المركون: الجولة والغاز كما هما، والكاز صفّ واحد بأحدث قيمته (payload {"kerosene": 45}) ونسخته 2، لا يكتب فوقهما');
    t.eq(await keroseneRow(F.c, day(-5)), null, 'المركون بلا أثر على الكاز');
    rejectIds.kerosene = (await db.admin("select id from public.flock_day_rejects where flock_id = $1 and payload ? 'kerosene'", [F.c])).rows[0].id;
    const shown = (await sheet(F.c)).rejects.find((r) => r.id === rejectIds.kerosene);
    same([shown?.version, shown?.payload, shown?.on, shown?.reason], [2, { kerosene: 45 }, day(-5), 'flock_closed'], 'الورقة تعرض الكاز المركون بنسخته وأحدث قيمته');
    same((await call(db, U.owner, DECIDE, [rejectIds.kerosene, 'handled', 2])).value?.decision, 'handled', 'حسم الكاز المركون بنسخته');
    same((await kerosene(U.owner, { flock: F.c, on: day(-5), liters: 50, queued: true })).value?.status, 'parked', 'كاز مركون جديد لليوم نفسه بعد الحسم');
    same(await rejectRow(rejectIds.kerosene), { version: 3, decision: null, payload: { kerosene: 50 } }, 'يكتب فوق صفّه: بلا قرار، بالنسخة 3 وبقيمته الجديدة');
    same((await call(db, U.owner, DECIDE, [rejectIds.kerosene, 'refused', 2])).value?.status, 'stale_reject', 'والحسم بما عُرض قبله stale_reject');
  });

  // ── ٥) جلستان لليوم نفسه بلا نسخة ───────────────────────────────────────────────────────────────────────────────────
  await section('الكاز: جلستان لليوم نفسه', async () => {
    const raced = await race(db, { user: U.owner, sql: KEROSENE, params: keroseneParams({ flock: F.e, on: day(-7), liters: 50 }) },
      { user: U.worker, sql: KEROSENE, params: keroseneParams({ flock: F.e, on: day(-7), liters: 60 }) });
    same([raced.first, raced.state, raced.second, raced.rows[1]?.[0]?.v], ['ok', 'blocked', 'ok', { status: 'stale_kerosene', server: { on: day(-7), liters: 50, version: 1 } }],
      'كاتبان بلا نسخة ليوم واحد: الثاني ينتظر صفّ الوجبة ثمّ يرى كاز الأوّل (stale_kerosene) ولا يكتب فوقه');
    same(await keroseneRow(F.e, day(-7)), { liters: 50, version: 1 }, 'والصفّ بقيمة الأوّل');
    const control = await race(db, { user: U.owner, sql: KEROSENE, params: keroseneParams({ flock: F.e, on: day(-8), liters: 50 }), rollback: true },
      { user: U.worker, sql: KEROSENE, params: keroseneParams({ flock: F.e, on: day(-8), liters: 60 }) });
    same([control.state, control.rows[1]?.[0]?.v], ['blocked', { status: 'saved', kerosene: { on: day(-8), liters: 60, version: 1 } }], 'ضابط: الأوّل يرجع فيُحفظ الثاني');
  });

  // ── ٦) الورقة ───────────────────────────────────────────────────────────────────────────────────────────────────
  await section('الكاز في الورقة', async () => {
    const a = await sheet(F.a);
    samples.hall_sheet = a;
    const pick = (d) => [d.kerosene, d.kerosene_version];
    same({ d3: pick(rowOf(a, day(-3))), d29: pick(rowOf(a, day(-29))), d1: pick(rowOf(a, day(-1))), d6: pick(rowOf(a, day(-6))), today: pick(rowOf(a, TODAY)), later: pick(rowOf(a, day(5))) },
      { d3: [150, 2], d29: [40, 1], d1: [null, 2], d6: [null, null], today: [null, null], later: [null, null] },
      'كلّ يوم بلتراته ونسخته: يوما الكاز، واليوم الممسوح لترات فارغة بنسخته (للكتابة التالية)، ويوم بلا صفّ فارغان');
    same([rowOf(a, day(-3)).gas, rowOf(a, day(-3)).gas_version], [2, 1], 'والغاز بجانبه في يومه كما هو');
    same([a.totals.kerosene, a.summary.kerosene, a.totals.gas, a.summary.gas], [190, 190, 2, 2], 'مجموع الكاز 150 + 40 في المجاميع والخلاصة (الممسوح صفر)، والغاز كما هو');
    same(a.days.reduce((s, d) => s + (d.kerosene ?? 0), 0), 190, 'مجموع الكاز = مجموع الأيّام');
    // مفاتيح جديدة فقط: الورقة بجسم 0035 داخل معاملة ترجع = الورقة الآن بلا مفاتيح الكاز، لوجبة بالكاز والغاز ولوجبة مغلقة بمركونها.
    const old = await mutant(db, U.owner, [], async ({ oq, attempt }) => {
      await oq(bodyOf('0035_hall_sheet.sql', 'public.hall_sheet'));
      return { a: await inside(attempt, U.owner, SHEET, [F.a]), c: await inside(attempt, U.owner, SHEET, [F.c]) };
    });
    const strip = (s) => ({ ...s, days: s.days.map((d) => omit(d, 'kerosene', 'kerosene_version')), totals: omit(s.totals, 'kerosene'), summary: omit(s.summary, 'kerosene') });
    const c = await sheet(F.c);
    t.ok(Boolean(old.a?.totals) && !('kerosene' in old.a.totals) && !('kerosene' in old.a.summary) && !('kerosene' in old.a.days[0]), 'ضابط: الورقة بجسم 0035 بلا مفاتيح الكاز');
    same([strip(a), strip(c)], [old.a, old.c], 'المفاتيح القائمة كلّها بأسمائها وقيمها وترتيب أيّامها كما في جسم 0035 (الواجهة المنشورة تقرؤها بين التطبيق والدمج)، والجديد مفاتيح الكاز وحدها');
    same([c.totals.kerosene, c.summary.kerosene, c.days.every((d) => d.kerosene === null && d.kerosene_version === null)], [0, 0, true], 'وجبة بلا كاز: المجموع صفر وكلّ يوم فارغ');
  });

  // ── ٧) الحرّاس: تعديل الوجبة وإغلاقها وحذفها ────────────────────────────────────────────────────────────────────────────
  await section('الحرّاس', async () => {
    // «قاعة 2» سُكّنت قبل عشرة أيّام، وأوّل سجلّ لها كاز قبل ثلاثة أيّام.
    await one(U.owner, KEROSENE, keroseneParams({ flock: F.b, on: day(-3), liters: 50 }));
    const moved = await mutant(db, U.owner, [], async ({ attempt }) => ({
      after: await inside(attempt, U.owner, EDIT, [F.b, day(-2), 500, uid()]),
      before: (await inside(attempt, U.owner, EDIT, [F.b, day(-4), 500, uid()]))?.changed,
    }));
    t.ok(moved.after?.code === 'records_before_placement' && moved.after.hint.includes('كاز') && moved.after.hint.includes(dmy(day(-3))),
      `التسكين لا ينتقل بعد يوم كاز مسجَّل، والتلميح يسمّي الكاز ويومه (${moved.after?.code} ${moved.after?.hint})`);
    t.eq(moved.before, true, 'وقبل يوم الكاز يُقبل');
    const cleared = await mutant(db, U.owner, [], async ({ attempt }) => {
      await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: F.b, on: day(-3), liters: null, base: 1 }));
      return (await inside(attempt, U.owner, EDIT, [F.b, day(-2), 500, uid()]))?.changed;
    });
    t.eq(cleared, true, 'بعد مسح الكاز ينتقل التسكين بعد يومه (الصفّ الممسوح يبقى ولا يحرس)');
    // «قاعة 4» لا شيء عليها إلّا كاز قبل ثلاثة أيّام.
    await one(U.owner, KEROSENE, keroseneParams({ flock: F.d, on: day(-3), liters: 30 }));
    const early = await mutant(db, U.owner, [], async ({ attempt }) => closeD(attempt, day(-4)));
    t.ok(early?.code === 'activity_after_close' && early.hint.includes('كاز') && early.hint.includes(dmy(day(-3))), `الإغلاق قبل يوم كاز يُرفض ويسمّيه ويومه (${early?.code} ${early?.hint})`);
    const onDay = await mutant(db, U.owner, [], async ({ attempt }) => closeD(attempt, day(-3)));
    t.ok(Boolean(onDay) && !onDay.code, `والإغلاق في يوم الكاز نفسه يُقبل (${JSON.stringify(onDay)?.slice(0, 120)})`);
    const clearedClose = await mutant(db, U.owner, [], async ({ attempt }) => {
      await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: F.d, on: day(-3), liters: null, base: 1 }));
      return closeD(attempt, day(-4));
    });
    t.ok(Boolean(clearedClose) && !clearedClose.code, `وبعد مسح الكاز يُغلق قبل يومه (${JSON.stringify(clearedClose)?.slice(0, 120)})`);
    // الحذف: الكاز المسجَّل يمنعه باسمه بعد الغاز، والممسوح يُحذف مع الوجبة.
    const del = await mutant(db, U.owner, [], async ({ oq, attempt }) => {
      const flockId = await freshFlock(attempt);
      await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: flockId, on: day(-2), liters: 30 }));
      await inside(attempt, U.owner, GAS, gasParams({ flock: flockId, on: day(-1), n: 1 }));
      const both = await inside(attempt, U.owner, DELETE, [flockId, uid()]);
      await inside(attempt, U.owner, GAS, gasParams({ flock: flockId, on: day(-1), n: null, base: 1 }));
      const only = await inside(attempt, U.owner, DELETE, [flockId, uid()]);
      await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: flockId, on: day(-2), liters: null, base: 1 }));
      const kept = (await oq('select count(*)::int as n from public.flock_day_kerosene where flock_id = $1', [flockId])).rows[0].n;
      const deleted = await inside(attempt, U.owner, DELETE, [flockId, uid()]);
      return {
        both: [both?.code, (both?.hint ?? '').includes('الغاز، الكاز')],
        only: [only?.code, (only?.hint ?? '').includes('الكاز'), (only?.hint ?? '').includes('الغاز')],
        kept,
        deleted: deleted?.deleted ?? deleted?.code,
        left: (await oq('select count(*)::int as n from public.flock_day_kerosene where flock_id = $1', [flockId])).rows[0].n,
        gone: (await oq('select count(*)::int as n from public.flocks where id = $1', [flockId])).rows[0].n,
      };
    });
    same(del, { both: ['flock_has_records', true], only: ['flock_has_records', true, false], kept: 1, deleted: true, left: 0, gone: 0 },
      'الكاز المسجَّل يمنع حذف الوجبة بتلميح يسمّي «الكاز» بعد «الغاز»؛ وبعد مسحه (والصفّ باقٍ) تُحذف الوجبة ويُحذف صفّ الكاز الممسوح معها');
  });

  // ── ٨) الثابت: صفر، وكلّ فحص يمسكه جسم مكسور يكتب خرقه ─────────────────────────────────────────────────────────────────────
  await section('الثابت', async () => {
    same(await db.asService(verifyOf), VERIFY_ZERO, 'verify_kerosene صفر');
    const write = (flock, on) => async ({ attempt }) => inside(attempt, U.owner, KEROSENE, keroseneParams({ flock, on, liters: 10 }));
    const BREAKS = {
      // الضابط: الأجسام الحقيقية تكتب ولا خرق.
      control: ['kerosene_days', [], write(F.a, day(-5))],
      // الكاتب بلا قاعدة اليوم يكتب كازاً قبل التسكين، ولوجبة لم تُسكَّن.
      noDayCheck: ['kerosene_days', [[SIG.kerosene, [[ANCHOR.dayCheck, '']]]], write(F.a, day(-31))],
      notPlaced: ['kerosene_days', [[SIG.kerosene, [[ANCHOR.dayCheck, '']]]],
        async ({ oq, attempt }) => inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: await preparingFlock(oq, attempt), on: day(-1), liters: 10 }))],
      // الكاتب بلا فحصَي المستقبل (فرعه وقاعدة اليوم) يكتب كازاً ليوم بعد اليوم الحقيقيّ بتوقيت بغداد (لا بعد اليوم المثبَّت: الحدّ لا يقلّ عن يوم الكتابة).
      future: ['kerosene_days', [[SIG.kerosene, [['  if p_on > v_today then', '  if false then']]], [SIG.check, [['  if p_on > v_today then', '  if false then']]]],
        async ({ oq, attempt }) => {
          const later = (await oq("select ((now() at time zone 'Asia/Baghdad')::date + 1)::text as d")).rows[0].d;
          return inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: F.a, on: later, liters: 10 }));
        }],
      // تعديل الوجبة بلا الكاز ينقل التسكين بعد يوم كاز «قاعة 2».
      editBlind: ['kerosene_days', [[SIG.edit, [[ANCHOR.editLine, '']]]], ({ attempt }) => inside(attempt, U.owner, EDIT, [F.b, day(-2), 500, uid()])],
      // الإغلاق بلا الكاز يغلق «قاعة 4» قبل يوم كازها.
      closeBlind: ['kerosene_days', [[SIG.activity, [[ANCHOR.activityUnion, '']]]], ({ attempt }) => closeD(attempt, day(-4))],
      // الكاتب بالنسخة صفراً (وقيد النسخة مُسقط داخل المعاملة).
      versionZero: ['kerosene_versions', [[SIG.kerosene, [[ANCHOR.insertValues, ANCHOR.insertValues.replace('p_liters, 1)', 'p_liters, 0)')]]]], write(F.e, day(-2)), true],
      // الكاتب بقاعة أخرى من الحقل نفسه.
      otherHall: ['kerosene_hall', [[SIG.kerosene, [[ANCHOR.insertValues,
        '    values (f.org_id, f.id, (select h.id from public.halls h where h.org_id = f.org_id and h.site_id = f.site_id and h.id <> f.hall_id order by h.id limit 1), f.site_id, f.division_id, p_on, p_liters, 1)\n']]]],
      write(F.e, day(-2))],
    };
    const caught = {};
    for (const [label, [name, fns, run, dropVersionCheck]] of Object.entries(BREAKS)) {
      caught[label] = await mutant(db, U.owner, fns, async (kit) => {
        if (dropVersionCheck) await kit.oq('alter table public.flock_day_kerosene drop constraint flock_day_kerosene_version_check');
        const done = await run(kit);
        return { done: done?.code ?? 'ok', [name]: (await verifyOf(kit.oq))[name] };
      });
    }
    same(caught, {
      control: { done: 'ok', kerosene_days: 0 },
      noDayCheck: { done: 'ok', kerosene_days: 1 },
      notPlaced: { done: 'ok', kerosene_days: 1 },
      future: { done: 'ok', kerosene_days: 1 },
      editBlind: { done: 'ok', kerosene_days: 1 },
      closeBlind: { done: 'ok', kerosene_days: 1 },
      versionZero: { done: 'ok', kerosene_versions: 1 },
      otherHall: { done: 'ok', kerosene_hall: 1 },
    }, 'كلّ فحص في الجدول يمسك خرقاً يكتبه جسم مكسور باسمه (الكاتب بلا قاعدة اليوم قبل التسكين ولوجبة لم تُسكَّن، وبلا فحصَي المستقبل، والتعديل والإغلاق بلا الكاز، والنسخة صفراً، والقاعة الأخرى)، والضابط صفر');
    // ساعة الحزمة (درس 2026-11-10): صفّ كُتب بالساعة الحقيقية ثمّ ثُبّت يومٌ أقدم منه، كملفّ يلي core الذي يكتب كاز يومه الحقيقيّ. الحدّ الأعلى لا يقلّ عن يوم
    // كتابة الصفّ فلا خرق، والحدّ باليوم وحده (نصّ العقد حرفاً) يعدّه خرقاً.
    const clockOf = (body) => `create or replace function public.app_today() returns date language sql stable set search_path = pg_catalog, pg_temp as $$ ${body} $$`;
    const clockCase = (fns) => mutant(db, U.owner, fns, async ({ oq, attempt }) => {
      await oq(clockOf("select (now() at time zone 'Asia/Baghdad')::date"));
      const real = (await oq('select public.app_today()::text as d')).rows[0].d;
      const done = await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: F.a, on: real, liters: 10 }));
      await oq(clockOf(`select date '${TODAY}'`));
      return { done: done?.code ?? 'ok', later: real > TODAY, kerosene_days: (await verifyOf(oq)).kerosene_days };
    });
    const todayOnly = [SIG.verify, [["greatest(public.app_today(), (k.created_at at time zone 'Asia/Baghdad')::date)", 'public.app_today()']]];
    const refined = await clockCase([]);
    const literal = await clockCase([todayOnly]);
    // بنصّ العقد حرفاً يُعدّ صفّ هذا الفحص وكلّ صفّ كتبته ملفّات قبله بيومها الحقيقيّ (core)، فالعدد واحد فأكثر.
    same({ refined, literal: { ...literal, kerosene_days: literal.kerosene_days >= 1 } },
      { refined: { done: 'ok', later: true, kerosene_days: 0 }, literal: { done: 'ok', later: true, kerosene_days: true } },
      'كاز كُتب بيومه الحقيقيّ ثمّ ثُبّت يوم أقدم: لا خرق (الحدّ لا يقلّ عن يوم الكتابة)، والحدّ باليوم المثبَّت وحده يعدّه خرقاً');
    const sheetBreaks = {
      totals: [[SIG.sheet, [[ANCHOR.sheetTotals, `${ANCHOR.sheetTotals} + 1`]]]],
      summary: [[SIG.sheet, [[ANCHOR.sheetSummary, "'kerosene', 0::bigint"]]]],
      days: [[SIG.sheet, [[ANCHOR.sheetDay, "'kerosene', z.cylinders, "]]]],
    };
    const sheetCaught = {};
    for (const [label, fns] of Object.entries(sheetBreaks)) sheetCaught[label] = await mutant(db, U.owner, fns, async ({ oq }) => (await verifyOf(oq)).sheet_kerosene_totals);
    t.ok(sheetCaught.totals > 0 && sheetCaught.summary > 0 && sheetCaught.days > 0,
      `طفرة في مفاتيح الكاز بالورقة يمسكها الثابت (المجموع ${sheetCaught.totals}، والخلاصة ${sheetCaught.summary}، والأيّام من عمود الغاز ${sheetCaught.days})`);
  });

  // ── ٩) الطفرات: كلّ قاعدة مكسورة يمسكها فحصها ─────────────────────────────────────────────────────────────────────────
  await section('الطفرات', async () => {
    const editB = ({ attempt }) => inside(attempt, U.owner, EDIT, [F.b, day(-2), 500, uid()]);
    const CASES = [
      {
        name: 'الكاز: القيمة نفسها بلا اختصار',
        fns: [[SIG.kerosene, [[ANCHOR.sameValue, '  if false then']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: F.a, on: day(-3), liters: 150, base: 2 })))?.kerosene?.version,
        correct: (v) => v === 2,
      },
      {
        name: 'الكاز بلا شرط النسخة',
        fns: [[SIG.kerosene, [[ANCHOR.versionCheck, '  if false then']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: F.a, on: day(-3), liters: 999, base: 1 })))?.status,
        correct: (v) => v === 'stale_kerosene',
      },
      {
        name: 'الكاز بلا حدّه الأعلى',
        fns: [[SIG.kerosene, [[ANCHOR.bounds, '  if p_liters < 0 then']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: F.a, on: day(-4), liters: 20001 })))?.code,
        correct: (v) => v === 'bad_value',
      },
      {
        name: 'الكاز بلا حدّه الأدنى',
        fns: [[SIG.kerosene, [[ANCHOR.bounds, '  if p_liters > 20000 then']]]],
        run: async ({ attempt }) => (await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: F.a, on: day(-4), liters: -1 })))?.code,
        correct: (v) => v === 'bad_value',
      },
      {
        name: 'الكاز بلا فرع المستقبل (تلميح قاعدة اليوم العامّ)',
        fns: [[SIG.kerosene, [[ANCHOR.futureBlock, '']]]],
        run: async ({ attempt }) => {
          const answer = await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: F.a, on: day(1), liters: 1 }));
          return [answer?.code, (answer?.hint ?? '').includes('الكاز')];
        },
        correct: (v) => JSON.stringify(v) === JSON.stringify(['date_in_future', true]),
      },
      {
        name: 'الكاز المركون بلا معرّف (يكتب فوق الجولة المركونة)',
        fns: [[SIG.kerosene, [[ANCHOR.parkKey, "      null)\n    on conflict (org_id, created_by, flock_id, on_date) where visit_id is null do update"]]]],
        run: async ({ oq, attempt }) => {
          await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: F.c, on: day(-5), liters: 8, queued: true }));
          return (await oq("select count(*)::int as n from public.flock_day_rejects where flock_id = $1 and on_date = $2 and payload ? 'dead'", [F.c, day(-5)])).rows[0].n;
        },
        correct: (v) => v === 1,
      },
      {
        name: 'الكاز المركون بمعرّف الغاز (يكتب فوق الغاز المركون)',
        fns: [[SIG.kerosene, [["md5('kerosene:' ||", "md5('gas:' ||"]]]],
        run: async ({ oq, attempt }) => {
          await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: F.c, on: day(-5), liters: 8, queued: true }));
          return (await oq("select count(*)::int as n from public.flock_day_rejects where flock_id = $1 and on_date = $2 and payload ? 'gas'", [F.c, day(-5)])).rows[0].n;
        },
        correct: (v) => v === 1,
      },
      {
        name: 'الكاز المركون من جديد بلا نسخة أكبر',
        fns: [[SIG.kerosene, [[ANCHOR.parkVersion, ANCHOR.parkVersion.replace('version + 1', 'version')]]]],
        run: async ({ oq, attempt }) => {
          const versionOf = async () => (await oq('select version from public.flock_day_rejects where id = $1', [rejectIds.kerosene])).rows[0].version;
          const before = await versionOf();
          const parked = await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: F.c, on: day(-5), liters: 9, queued: true }));
          return [parked?.status, (await versionOf()) - before];
        },
        correct: (v) => JSON.stringify(v) === JSON.stringify(['parked', 1]),
      },
      {
        name: 'الكاز المركون من جديد يُبقي القرار',
        fns: [[SIG.kerosene, [[ANCHOR.parkDecision, 'version = public.flock_day_rejects.version + 1;']]]],
        run: async ({ oq, attempt }) => {
          await inside(attempt, U.owner, DECIDE, [rejectIds.kerosene, 'handled', 3]);
          await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: F.c, on: day(-5), liters: 9, queued: true }));
          return (await oq('select decision from public.flock_day_rejects where id = $1', [rejectIds.kerosene])).rows[0].decision;
        },
        correct: (v) => v === null,
      },
      {
        name: 'الورقة: الكاز على غير يومه',
        fns: [[SIG.sheet, [[ANCHOR.sheetJoin, `${ANCHOR.sheetJoin} + 1`]]]],
        run: async ({ attempt }) => rowOf(await inside(attempt, U.owner, SHEET, [F.a]), day(-3))?.kerosene,
        correct: (v) => v === 150,
      },
      {
        name: 'الورقة: نسخة الكاز من صفّ الغاز',
        fns: [[SIG.sheet, [[ANCHOR.sheetVersion, 'ks.liters, gs.version as kerosene_version,']]]],
        run: async ({ attempt }) => rowOf(await inside(attempt, U.owner, SHEET, [F.a]), day(-1))?.kerosene_version,
        correct: (v) => v === 2,
      },
      {
        name: 'تعديل الوجبة بلا الكاز',
        fns: [[SIG.edit, [[ANCHOR.editLine, '']]]],
        run: async (kit) => (await editB(kit))?.code,
        correct: (v) => v === 'records_before_placement',
      },
      {
        name: 'تعديل الوجبة يعدّ الكاز الممسوح',
        fns: [[SIG.edit, [[ANCHOR.editFilter, 'x.flock_id = f.id),\n']]]],
        run: async (kit) => {
          await inside(kit.attempt, U.owner, KEROSENE, keroseneParams({ flock: F.b, on: day(-3), liters: null, base: 1 }));
          const answer = await editB(kit);
          return answer?.changed ?? answer?.code;
        },
        correct: (v) => v === true,
      },
      {
        name: 'الإغلاق بلا الكاز',
        fns: [[SIG.activity, [[ANCHOR.activityUnion, '']]]],
        run: async ({ attempt }) => (await closeD(attempt, day(-4)))?.code,
        correct: (v) => v === 'activity_after_close',
      },
      {
        name: 'الإغلاق يعدّ الكاز الممسوح',
        fns: [[SIG.activity, [[ANCHOR.activityFilter, 'k.flock_id = f.id\n']]]],
        run: async ({ attempt }) => {
          await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: F.d, on: day(-3), liters: null, base: 1 }));
          return (await closeD(attempt, day(-4)))?.code ?? 'closed';
        },
        correct: (v) => v === 'closed',
      },
      {
        name: 'حذف الوجبة بلا الكاز',
        fns: [[SIG.deleteFlock, [[ANCHOR.deleteNaming, ''], [ANCHOR.deleteCleared, '']]]],
        run: async ({ attempt }) => {
          const flockId = await freshFlock(attempt);
          await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: flockId, on: day(-2), liters: 30 }));
          const blocked = await inside(attempt, U.owner, DELETE, [flockId, uid()]);
          await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: flockId, on: day(-2), liters: null, base: 1 }));
          const deleted = await inside(attempt, U.owner, DELETE, [flockId, uid()]);
          return [(blocked?.hint ?? '').includes('الكاز'), deleted?.deleted ?? deleted?.code];
        },
        correct: (v) => JSON.stringify(v) === JSON.stringify([true, true]),
      },
      {
        name: 'حذف الوجبة لا يحذف الكاز الممسوح',
        fns: [[SIG.deleteFlock, [[ANCHOR.deleteCleared, '']]]],
        run: async ({ attempt }) => {
          const flockId = await freshFlock(attempt);
          await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: flockId, on: day(-2), liters: 30 }));
          await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: flockId, on: day(-2), liters: null, base: 1 }));
          const deleted = await inside(attempt, U.owner, DELETE, [flockId, uid()]);
          return deleted?.deleted ?? deleted?.code;
        },
        correct: (v) => v === true,
      },
      {
        name: 'حذف الوجبة يعدّ الكاز الممسوح سجلّاً',
        fns: [[SIG.deleteFlock, [[ANCHOR.deleteNamingFilter, "x.flock_id = f.id) then\n    v_has := v_has || 'الكاز'::text;"]]]],
        run: async ({ attempt }) => {
          const flockId = await freshFlock(attempt);
          await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: flockId, on: day(-2), liters: 30 }));
          await inside(attempt, U.owner, KEROSENE, keroseneParams({ flock: flockId, on: day(-2), liters: null, base: 1 }));
          const deleted = await inside(attempt, U.owner, DELETE, [flockId, uid()]);
          return deleted?.deleted ?? deleted?.code;
        },
        correct: (v) => v === true,
      },
    ];
    const outcomes = [];
    for (const c of CASES) {
      const real = await mutant(db, U.owner, [], (kit) => c.run(kit));
      const broken = await mutant(db, U.owner, c.fns, (kit) => c.run(kit));
      outcomes.push({ name: c.name, real: c.correct(real), caught: !c.correct(broken), shown: JSON.stringify(real), broken: JSON.stringify(broken) });
    }
    t.same(outcomes.filter((o) => !o.real).map((o) => `${o.name}: ${o.shown}`), [], `الطفرات (${CASES.length}): الشفرة الحقيقية بالصحيح في كلّ حالة`);
    t.same(outcomes.filter((o) => !o.caught).map((o) => `${o.name}: ${o.broken}`), [], `الطفرات: ${outcomes.filter((o) => o.caught).length} من ${CASES.length} مُسكت`);
  });

  // ── ١٠) ملفّ التراجع يرجّع الأجسام القديمة حرفاً، والهجرة تغيّرها ──────────────────────────────────────────────────────────────
  await section('التراجع', async () => {
    const HEADS = ['public.hall_sheet', 'public.edit_flock', 'private.flock_activity_after', 'public.delete_flock'];
    const rollback = readFileSync(path.join(MIGRATIONS, 'rollback_0037.sql'), 'utf8');
    const migration = readFileSync(path.join(MIGRATIONS, '0037_kerosene.sql'), 'utf8');
    same(HEADS.filter((head) => !rollback.includes(bodyOf('0035_hall_sheet.sql', head))), [], 'ملفّ التراجع يرجّع الأجسام الأربعة كما في 0035 (آخر هجرة عرّفتها) حرفاً');
    same(HEADS.filter((head) => migration.includes(bodyOf('0035_hall_sheet.sql', head)) || !migration.includes(`create or replace function ${head}(`)), [],
      'والهجرة تعيد تعريف الأربعة كلّها بجسم غير جسم 0035');
  });

  same(await db.asService(verifyOf), VERIFY_ZERO, 'الثابت صفر في نهاية الملفّ');
  if (process.env.KEROSENE_SAMPLES_OUT) {
    writeFileSync(FIXTURE, JSON.stringify({
      _note: `عيّنات القاعدة الحقيقية (supabase/tests/kerosene.test.mjs بـKEROSENE_SAMPLES_OUT=1، اليوم المثبَّت ${TODAY})؛ المحلّلات الحقيقية تقرؤها في فحوص الشاشات. hall_sheet وجبة لحم بكاز يومين (150 لتراً بالنسخة 2 قبل ثلاثة أيّام وبجانبه غاز قنينتين، و40 لتراً قبل 29 يوماً) ويوم مُسح (أمس: لترات فارغة بالنسخة 2).`,
      hall_sheet: samples.hall_sheet,
      set_flock_kerosene_saved: samples.set_flock_kerosene_saved,
      set_flock_kerosene_stale: samples.set_flock_kerosene_stale,
      set_flock_kerosene_parked: samples.set_flock_kerosene_parked,
    }, null, 1) + '\n');
  }
}
