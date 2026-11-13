// «تقارير القاعات» (0027؛ كلمة المالك 2026-11-12 وأجوبته، docs/HALLS_REPORTS_PLAN.md التسليم ١): التقرير اليوميّ لكلّ القاعات (halls_day)، وتقرير
// الدورة بالأيّام والأسابيع والأوزان والمؤشّرات (flock_cycle_report)، وقائمة الدورات (flock_cycles). البذرة بالدوالّ الحقيقية يوماً بيوم (setToday وقاعدة
// الأيّام السبعة): جولات بفجوة وجولة بلا علف ويوم بلا جولة، وأوزان، وصرف علف بالكيلو واللتر والقطعة وبلا وزن (لقاعتين في حقل واحد يوماً واحداً، ولقاعة
// قبل اليوم بثلاثة أيّام، وملغى) وصرف ملغى، ودواء من المخزن وتسجيل دواء، ولقاح
// مؤشَّر بصرفه وموعد اليوم وموعد فائت، وفوج بيّاض ببيضه، وفوجان مغلقان (أحدهما في قاعة أُرشفت بعده، والآخر أُغلق يوم سُكّن التالي في قاعته)، وقاعة فارغة،
// وقاعة مؤرشفة بلا فوج، وحقل بلا قاعات، وعاملا قاعة بنطاق حقل؛ ومنشأة ثانية صُرف فيها علف موزون وبلا وزن في أيّام بلا جولة (يوم التسكين ويوم في الوسط
// واليوم، وفوج سُكّن اليوم بكيس بلا وزن). ونموذج مستقلّ بالأعداد الصحيحة الكبيرة (BigInt) يحسب كلّ تعريف في العقد من الصفوف الخام
// ويُقارن بالجواب لكلّ يوم ولكلّ هويّة، وقيم محسوبة باليد لأهمّها؛ والرفض والتنقّل والمجاميع والنطاق والحدّ 500؛ وطفرات يكتبها تطبيق ساذج فيمسكها
// فحصها؛ وعيّنات القاعدة الحقيقية للشاشات (REPORTS_SAMPLES_OUT=1 يكتب scripts/tests/fixtures/reports-0027.json).
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, canon, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { postedOpening } from './stock-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TODAY = '2026-11-12';
const id = (n) => `d2727000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477027270${String(n).padStart(2, '0')}`;
const DAY_MS = 86400000;
const addDays = (on, n) => new Date(Date.parse(`${on}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const day = (offset) => addDays(TODAY, offset);
const between = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS);
const bytes = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));

const HALLS_DAY = 'select public.halls_day($1) as v';
const REPORT = 'select public.flock_cycle_report($1) as v';
const CYCLES = 'select public.flock_cycles() as v';
const FEED = 'select public.flock_feed($1) as v';
const FN = {
  day: 'public.halls_day(date)',
  days: 'private.report_days(public.flocks, date)',
  one: 'private.report_day(public.flocks, date, date)',
  totals: 'private.halls_day_totals(jsonb)',
  report: 'public.flock_cycle_report(uuid)',
  cycles: 'public.flock_cycles()',
};

// ─── أعداد عشرية بالأعداد الصحيحة الكبيرة: لا عدد عائم في النموذج ─────────────────────────────────────────────────────────
/** النصّ العشريّ بوحدات 10^-scale (يرمي إن زادت مراتبه). */
const units = (value, scale) => {
  const s = String(value);
  const negative = s.startsWith('-');
  const [whole, fraction = ''] = (negative ? s.slice(1) : s).split('.');
  if (fraction.length > scale) throw new Error(`units: «${s}» بأكثر من ${scale} مراتب`);
  const v = BigInt(whole + fraction.padEnd(scale, '0'));
  return negative ? -v : v;
};
/** وحدات 10^-scale نصّاً بمراتبها كلّها. */
const text = (v, scale) => {
  const negative = v < 0n;
  const digits = (negative ? -v : v).toString().padStart(scale + 1, '0');
  const out = scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
  return negative ? `-${out}` : out;
};
/** num ÷ den (den > 0) مقرَّباً نصفاً بعيداً عن الصفر إلى n مراتب، نصّاً. */
const ratio = (num, den, n) => {
  const scaled = num * 10n ** BigInt(n);
  const negative = scaled < 0n;
  const q = (2n * (negative ? -scaled : scaled) + den) / (2n * den);
  return text(negative ? -q : q, n);
};
/** v بوحدات from مقرَّباً إلى وحدات to (نصفاً بعيداً عن الصفر). */
const rescale = (v, from, to) => {
  const den = 10n ** BigInt(from - to);
  const negative = v < 0n;
  const q = (2n * (negative ? -v : v) + den) / (2n * den);
  return negative ? -q : q;
};
/** flock_pct: الجزء × 100 ÷ الكلّ بمرتبتين؛ الكلّ صفر أو مجهول null، والجزء صفر '0.00'. */
const pct = (part, whole) => (part === null || whole <= 0n ? null : part <= 0n ? '0.00' : ratio(part * 100n, whole, 2));
/** كتلة سطر الصرف بالغرام (وحدات 10^-3 كغم) كـissue_mass_kg، وما لا كتلة له null. */
const massMilli = (unit, qty, density, piece) => {
  if (unit === 'kg') return units(qty, 3);
  if (unit === 'L' && density !== null) return rescale(units(qty, 3) * units(density, 4), 7, 3);
  if (unit === 'pc' && piece !== null) return rescale(units(qty, 3) * units(piece, 3), 6, 3);
  return null;
};
/** العدد العشريّ بلا أصفار زائدة (للمقارنة بالمعنى: '0' و'0.000' سواء). */
const norm = (v) => (typeof v === 'string' && /^-?\d+\.\d+$/u.test(v) ? v.replace(/0+$/u, '').replace(/\.$/u, '') : v);
/** بلا أصفار زائدة وبمفاتيح مرتّبة (jsonb يرتّب مفاتيحه بالطول ثمّ بالبايت)، فالمقارنة بالمعنى. */
const deep = (v) => (Array.isArray(v) ? v.map(deep)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => [k, deep(x)])) : norm(v));
const same = (a, b) => canon(deep(a)) === canon(deep(b));
const pick = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k]]));
const hasMoney = (value) => {
  if (Array.isArray(value)) return value.some(hasMoney);
  if (value && typeof value === 'object') return Object.entries(value).some(([key, v]) => key === 'money' || hasMoney(v));
  return false;
};

// المراتب القصوى لكلّ مفتاح عشريّ تقرؤه الشاشات بمرتبته (parseDecimal يرفض الزائد): نصّ عشريّ لا عدد، ولا مراتب فوق حدّها.
const SCALE = {
  feed_eaten_kg: 3, feed_eaten_cum_kg: 3, feed_given_kg: 3, feed_given_cum_kg: 3, feed_left_kg: 3, kg: 3, qty: 3, feed_per_bird_kg: 3, fcr: 3,
  mortality_cum_pct: 2, mortality_pct: 2, livability_pct: 2, hdep: 2, avg_g: 1, feed_g_per_bird_day: 1, epef: 0,
};
const scaleProblems = (value, where = '') => {
  if (Array.isArray(value)) return value.flatMap((x, i) => scaleProblems(x, `${where}[${i}]`));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, v]) => {
    const here = `${where}.${key}`;
    if (key in SCALE && v !== null) {
      if (typeof v !== 'string' || !/^-?\d+(\.\d+)?$/u.test(v)) return [`${here}: ${JSON.stringify(v)} ليس نصّاً عشرياً`];
      const decimals = v.includes('.') ? v.split('.')[1].length : 0;
      return decimals > SCALE[key] ? [`${here}: ${v} بأكثر من ${SCALE[key]} مراتب`] : [];
    }
    return scaleProblems(v, here);
  });
};

// ─── النموذج المستقلّ: كلّ تعريف في العقد من الصفوف الخام ─────────────────────────────────────────────────────────────────
async function loadRaw(db, org) {
  const halls = (await db.admin(`select h.id, h.name, h.site_id, s.name as site_name, d.kind, h.archived_at is not null as archived
    from public.halls h join public.sites s on s.id = h.site_id join public.divisions d on d.id = h.division_id where h.org_id = $1`, [org])).rows;
  const flockList = (await db.admin(`select f.id, f.hall_id, h.name as hall_name, f.site_id, s.name as site_name, f.kind, f.status, f.placed_on::text as placed_on,
      f.placed_count, f.age_days_at_placement as age0, f.closed_on::text as closed_on
    from public.flocks f join public.halls h on h.id = f.hall_id join public.sites s on s.id = f.site_id where f.org_id = $1 and f.placed_on is not null`, [org])).rows;
  const flocks = new Map(flockList.map((f) => [f.id, { f, rows: new Map(), weights: new Map(), given: new Map() }]));
  for (const r of (await db.admin(`select flock_id, on_date::text as d, dead, culled, feed_kg::text as feed, eggs_total, eggs_broken, eggs_cracked, note
      from public.flock_daily where org_id = $1`, [org])).rows) flocks.get(r.flock_id)?.rows.set(r.d, r);
  for (const w of (await db.admin('select flock_id, on_date::text as d, sample_count, avg_g::text as avg from public.flock_weights where org_id = $1', [org])).rows) {
    flocks.get(w.flock_id)?.weights.set(w.d, w);
  }
  for (const l of (await db.admin(`select x.flock_id, x.issued_on::text as d, l.qty_base::text as qty, l.base_unit as unit, l.density_kg_per_l::text as density,
      l.piece_mass_kg::text as piece
    from public.flock_issues x join public.flock_issue_lines l on l.issue_id = x.id
    where x.org_id = $1 and x.status = 'posted' and l.cost_kind = 'feed'`, [org])).rows) {
    const fx = flocks.get(l.flock_id);
    const g = fx.given.get(l.d) ?? { kg: 0n, unweighed: 0 };
    const mass = massMilli(l.unit, l.qty, l.density, l.piece);
    if (mass === null) g.unweighed += 1;
    else g.kg += mass;
    fx.given.set(l.d, g);
  }
  return { halls, flockList, flocks };
}

/** أيّام الفوج من تسكينه حتى through: لكلّ يوم أرقامه بتعريفات العقد (view بشكل الجواب) وقيمه الخام للأسابيع. */
function daysOf(fx, through) {
  const { f, rows, weights, given } = fx;
  const placed = BigInt(f.placed_count);
  const layer = f.kind === 'layer';
  const out = [];
  let gone = 0n;
  let deadCum = 0n;
  let culledCum = 0n;
  let feedCum = 0n;
  let feedDays = 0;
  let lastFeed = null;
  let givenCum = 0n;
  let givenCumUnweighed = 0;
  let lastWeight = null;
  for (let on = f.placed_on; on <= through; on = addDays(on, 1)) {
    const r = rows.get(on) ?? null;
    const w = weights.get(on) ?? null;
    const g = given.get(on) ?? { kg: 0n, unweighed: 0 };
    const liveStart = placed - gone;
    const dead = r ? BigInt(r.dead) : 0n;
    const culled = r ? BigInt(r.culled) : 0n;
    const liveEnd = liveStart - dead - culled;
    gone += dead + culled;
    deadCum += dead;
    culledCum += culled;
    const feed = r && r.feed !== null ? units(r.feed, 3) : null;
    if (feed !== null) {
      feedCum += feed;
      feedDays += 1;
      lastFeed = on;
    }
    givenCum += g.kg;
    givenCumUnweighed += g.unweighed;
    if (w) lastWeight = { on, avg: units(w.avg, 1) };
    const latest = lastFeed ?? addDays(f.placed_on, -1);
    const yesterday = addDays(on, -1);
    const span = between(latest > yesterday ? latest : yesterday, f.placed_on) + 1;
    const fcr = feedDays > 0 && feedDays === span && feedCum > 0n && lastWeight && liveEnd > 0n ? ratio(feedCum * 10n, liveEnd * lastWeight.avg, 3) : null;
    out.push({
      liveStart,
      dead: r ? dead : null,
      culled: r ? culled : null,
      feed,
      weight: w ? units(w.avg, 1) : null,
      view: {
        on, age: between(on, f.placed_on) + f.age0, day_no: between(on, f.placed_on) + 1, round: r !== null,
        live_start: Number(liveStart), dead: r ? r.dead : null, culled: r ? r.culled : null, live_end: Number(liveEnd),
        dead_cum: Number(deadCum), culled_cum: Number(culledCum), mortality_cum_pct: pct(deadCum + culledCum, placed),
        feed_eaten_kg: feed === null ? null : text(feed, 3), feed_eaten_cum_kg: text(feedCum, 3), feed_days: feedDays, feed_span: span,
        feed_given_kg: text(g.kg, 3), feed_given_unweighed: g.unweighed, feed_given_cum_kg: text(givenCum, 3), feed_given_cum_unweighed: givenCumUnweighed,
        feed_left_kg: text(givenCum - feedCum, 3),
        weight: w ? { sample_count: w.sample_count, avg_g: text(units(w.avg, 1), 1) } : null,
        last_weight: lastWeight ? { on_date: lastWeight.on, age: between(lastWeight.on, f.placed_on) + f.age0, avg_g: text(lastWeight.avg, 1) } : null,
        fcr,
        eggs_total: layer && r ? r.eggs_total : null, eggs_broken: layer && r ? r.eggs_broken : null, eggs_cracked: layer && r ? r.eggs_cracked : null,
        hdep: layer && r && r.eggs_total !== null ? pct(BigInt(r.eggs_total), liveStart) : null,
        note: r ? r.note : null,
      },
    });
  }
  return out;
}

const DAY_KEYS = ['on', 'age', 'day_no', 'round', 'live_start', 'dead', 'culled', 'live_end', 'mortality_cum_pct', 'feed_eaten_kg', 'feed_eaten_cum_kg',
  'feed_given_kg', 'feed_given_unweighed', 'feed_given_cum_kg', 'feed_given_cum_unweighed', 'feed_left_kg', 'weight', 'eggs_total', 'hdep', 'note'];
const LISTS = ['issues', 'logs', 'vaccines'];

/** فوج القاعة ليوم on بشكل halls_day (بلا قوائمه الثلاث). */
function flockOn(fx, on) {
  const { f } = fx;
  const view = { ...daysOf(fx, on).at(-1).view };
  delete view.on;
  return { id: f.id, kind: f.kind, status: f.status, placed_on: f.placed_on, placed_count: f.placed_count, age0: f.age0, closed_on: f.closed_on, ...view };
}

/** مجاميع القاعات كما يعرّفها العقد. */
function totalsOf(halls) {
  const flocks = halls.map((h) => h.flock).filter(Boolean);
  const rounds = flocks.filter((x) => x.round);
  const fed = flocks.filter((x) => x.feed_eaten_kg !== null);
  const sumInt = (list, key) => list.reduce((s, x) => s + x[key], 0);
  const sumKg = (list, key) => text(list.reduce((s, x) => s + units(x[key], 3), 0n), 3);
  return {
    halls: halls.length, flocks: flocks.length, rounds: rounds.length,
    live_start: sumInt(flocks, 'live_start'), dead: rounds.length ? sumInt(rounds, 'dead') : null, culled: rounds.length ? sumInt(rounds, 'culled') : null,
    live_end: sumInt(flocks, 'live_end'), feed_eaten_kg: fed.length ? sumKg(fed, 'feed_eaten_kg') : null, feed_eaten_flocks: fed.length,
    feed_given_kg: sumKg(flocks, 'feed_given_kg'), feed_given_unweighed: sumInt(flocks, 'feed_given_unweighed'),
  };
}

/** التقرير اليوميّ المتوقّع (بلا القوائم الثلاث) لقارئ نطاقه inScope(site). */
function hallsDayModel(raw, on, today, inScope) {
  const sites = new Map();
  for (const h of raw.halls) {
    if (!inScope(h.site_id)) continue;
    const flock = raw.flockList
      .filter((x) => x.hall_id === h.id && x.placed_on <= on && (x.closed_on === null || on <= x.closed_on))
      .sort((a, b) => (a.placed_on !== b.placed_on ? (a.placed_on < b.placed_on ? 1 : -1) : a.id < b.id ? -1 : 1))[0];
    if (h.archived && !flock) continue;
    if (!sites.has(h.site_id)) sites.set(h.site_id, { id: h.site_id, name: h.site_name, halls: [] });
    sites.get(h.site_id).halls.push({ hall_id: h.id, hall_name: h.name, kind: h.kind, flock: flock ? flockOn(raw.flocks.get(flock.id), on) : null });
  }
  const ordered = [...sites.values()].sort((a, b) => bytes(a.name, b.name) || (a.id < b.id ? -1 : 1));
  for (const s of ordered) {
    s.halls.sort((a, b) => bytes(a.hall_name, b.hall_name) || (a.hall_id < b.hall_id ? -1 : 1));
    s.totals = totalsOf(s.halls);
  }
  return {
    on, today,
    prev: raw.flockList.some((x) => x.placed_on < on && inScope(x.site_id)),
    next: on < today,
    sites: ordered,
    totals: totalsOf(ordered.flatMap((s) => s.halls)),
  };
}
const withoutLists = (response) => ({
  ...response,
  sites: response.sites.map((s) => ({ ...s, halls: s.halls.map((h) => ({ ...h, flock: h.flock && Object.fromEntries(Object.entries(h.flock).filter(([k]) => !LISTS.includes(k))) })) })),
});

/** الأسابيع بعمر الطيور: الأسبوع n للأعمار 7(n−1)+1 إلى 7n، والعمر صفر في الأوّل. */
function weeksOf(days) {
  const groups = new Map();
  for (const d of days) {
    const week = Math.max(1, Math.floor((d.view.age + 6) / 7));
    if (!groups.has(week)) groups.set(week, []);
    groups.get(week).push(d);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([week, ds]) => {
    const first = ds[0];
    const last = ds.at(-1);
    const rounds = ds.filter((d) => d.view.round);
    const dead = rounds.length ? rounds.reduce((s, d) => s + d.dead, 0n) : null;
    const culled = rounds.length ? rounds.reduce((s, d) => s + d.culled, 0n) : null;
    const fed = ds.filter((d) => d.feed !== null);
    const feed = fed.reduce((s, d) => s + d.feed, 0n);
    const lives = fed.reduce((s, d) => s + d.liveStart, 0n);
    const weighed = ds.filter((d) => d.weight !== null).at(-1);
    return {
      week, from_age: first.view.age, to_age: last.view.age, from_on: first.view.on, to_on: last.view.on, days: ds.length, round_days: rounds.length,
      dead: dead === null ? null : Number(dead), culled: culled === null ? null : Number(culled),
      mortality_pct: dead === null ? null : pct(dead + culled, first.liveStart),
      mortality_cum_pct: last.view.mortality_cum_pct, live_end: last.view.live_end,
      feed_eaten_kg: fed.length ? text(feed, 3) : null,
      feed_g_per_bird_day: !fed.length || lives <= 0n ? null : feed <= 0n ? '0.0' : ratio(feed, lives, 1),
      weight: weighed ? { on_date: weighed.view.on, age: weighed.view.age, avg_g: text(weighed.weight, 1) } : null,
      fcr: last.view.fcr,
    };
  });
}

/** المؤشّرات في «حتى». */
function kpisOf(f, days) {
  const last = days.at(-1).view;
  const placed = BigInt(f.placed_count);
  const eaten = units(last.feed_eaten_cum_kg, 3);
  const livability = last.mortality_cum_pct === null ? null : 10000n - units(last.mortality_cum_pct, 2);
  const lw = last.last_weight;
  const fcr = last.fcr;
  return {
    days: days.length, age_end: last.age, placed: f.placed_count, dead: last.dead_cum, culled: last.culled_cum, live: last.live_end,
    mortality_pct: last.mortality_cum_pct, livability_pct: livability === null ? null : text(livability, 2),
    feed_given_kg: last.feed_given_cum_kg, feed_eaten_kg: last.feed_eaten_cum_kg, feed_left_kg: last.feed_left_kg, feed_days: last.feed_days, feed_span: last.feed_span,
    feed_per_bird_kg: eaten > 0n && placed > 0n ? ratio(eaten, placed * 1000n, 3) : null,
    last_weight: lw, fcr,
    epef: fcr !== null && units(fcr, 3) > 0n && lw && livability > 0n && last.age > 0
      ? ratio(livability * units(lw.avg_g, 1), 10n * BigInt(last.age) * units(fcr, 3), 0) : null,
  };
}

/** قائمة الدورات المتوقّعة لقارئ نطاقه inScope(site). */
function cyclesModel(raw, today, inScope) {
  return raw.flockList
    .filter((x) => inScope(x.site_id))
    .map((x) => {
      const through = x.closed_on ?? today;
      const gone = [...raw.flocks.get(x.id).rows.values()].filter((r) => r.d <= through).reduce((s, r) => s + BigInt(r.dead + r.culled), 0n);
      return {
        id: x.id, hall_id: x.hall_id, hall_name: x.hall_name, site_id: x.site_id, site_name: x.site_name, kind: x.kind, status: x.status,
        placed_on: x.placed_on, closed_on: x.closed_on, through, placed_count: x.placed_count, age: between(through, x.placed_on) + x.age0,
        days: between(through, x.placed_on) + 1, live: x.placed_count - Number(gone), mortality_pct: pct(gone, BigInt(x.placed_count)),
      };
    })
    .sort((a, b) => {
      if ((a.status === 'active') !== (b.status === 'active')) return a.status === 'active' ? -1 : 1;
      if (a.closed_on !== b.closed_on) return a.closed_on === null ? -1 : b.closed_on === null ? 1 : a.closed_on < b.closed_on ? 1 : -1;
      if (a.placed_on !== b.placed_on) return a.placed_on < b.placed_on ? 1 : -1;
      return bytes(a.hall_name, b.hall_name) || (a.id < b.id ? -1 : 1);
    });
}

// ─── البذرة: الجولات والأوزان بالأيّام من اليوم (TODAY) ──────────────────────────────────────────────────────────────────
// الجولة: [اليوم، النافق، المستبعد، العلف أو null، الملاحظة، البيض [الكلّ، المشعور، المكسور]].
const ROUNDS = {
  f0: [[-42, 1, 0, '20'], [-41, 0, 0, '22']],
  fc: [[-23, 2, 0, '50'], [-22, 1, 1, '55'], [-18, 3, 0, '70']],
  f1: [[-11, 2, 0, '100'], [-10, 3, 1, '150'], [-9, 1, 0, '200'], [-7, 2, 0, '250'], [-6, 0, 0, '300'], [-5, 4, 1, null, 'تهوية'], [-4, 1, 0, '350'],
    [-3, 2, 0, '400'], [-2, 1, 0, '450'], [-1, 0, 1, '500', 'حرارة مرتفعة']],
  f2: [[-8, 5, 0, '60'], [-7, 3, 1, '80'], [-6, 2, 0, '100'], [-5, 4, 0, '120'], [-4, 1, 2, '140'], [-3, 2, 0, '160'], [-2, 1, 0, '180'], [-1, 0, 0, '200'],
    [0, 3, 1, '220']],
  f5: [[-3, 1, 0, '30'], [-2, 0, 0, '35'], [0, 2, 0, '40']],
  fl: [[-2, 2, 0, '480', null, [3000, 20, 10]], [-1, 1, 1, '470', null, [3100, 15, 5]], [0, 0, 0, '475', null, [3050, null, null]]],
};
// الوزن: [اليوم، عدد العيّنة، المعدّل بالغرام].
const WEIGHTS = { fc: [[-18, 30, '150.0']], f1: [[-9, 50, '85.0'], [-4, 50, '190.0'], [-1, 40, '300.5']], f2: [[-5, 40, '120.0'], [-2, 40, '200.5'], [0, 50, '260.0']] };

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const G = await makeOrg(db, { name: 'مزرعة التقارير', id, phone, roles: [['owner', 'owner'], ['manager', 'manager']] });
  const { users: U, org } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const shown = (result) => (result.ok ? 'ok' : result.code);
  const at = (on, fn) => db.setToday(on, fn);
  const warehouses = async (orgId) => Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [orgId])).rows.map((r) => [r.kind, r.id]));
  const W = await warehouses(org);
  // أدوات البذرة بمالك المنشأة ومديرها؛ آخر معامل (by) منشأة أخرى من makeOrg (منشأة الصرف بلا جولة أدناه)، وإلّا «مزرعة التقارير».
  const site = (division, name, by = G) =>
    one(by.users.owner, "insert into public.sites (division_id, name, kind) values ($1, $2, 'farm') returning id", [by.divisions[division], name]);
  const S = { a: await site('broiler', 'حقل ألف'), b: await site('broiler', 'حقل باء'), l: await site('layer', 'حقل البيض'), e: await site('broiler', 'حقل فارغ') };
  const hall = (siteId, name, by = G) => one(by.users.owner, 'insert into public.halls (site_id, name) values ($1, $2) returning id', [siteId, name]);
  const H = { h1: await hall(S.a, 'قاعة 1'), h2: await hall(S.a, 'قاعة 2'), h3: await hall(S.a, 'قاعة 3'), h4: await hall(S.a, 'قاعة 4'),
    h5: await hall(S.b, 'قاعة 5'), old: await hall(S.b, 'قاعة قديمة'), hl: await hall(S.l, 'قاعة البيّاض') };
  await one(U.owner, 'update public.halls set archived_at = now() where id = $1 returning id', [H.old]);
  const invite = async (n, key, sites) => {
    await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())', [id(n), phone(n)]);
    const member = await one(U.owner, 'select public.add_member_v2($1, $2, $3, $4::uuid[], $5::uuid[], $6::uuid[]) as id', [`0${phone(n).slice(3)}`, 'hall_worker', key, [], sites, []]);
    await db.acceptInvite(U.owner, id(n), member);
    return id(n);
  };
  U.hallWorker = await invite(3, 'hallWorker', [S.a]);
  U.layerWorker = await invite(4, 'layerWorker', [S.l]);

  const item = (name, kind, unit, density = null, piece = null, by = G) =>
    one(by.users.owner, 'insert into public.items (name, kind, base_unit, density_kg_per_l, piece_mass_kg) values ($1, $2, $3, $4, $5) returning id', [name, kind, unit, density, piece]);
  const I = { starter: await item('علف بادئ', 'feed', 'kg'), bags: await item('علف بالأكياس', 'feed', 'pc', null, 50), loose: await item('علف بلا وزن', 'feed', 'pc'),
    oil: await item('زيت', 'raw', 'L', 0.92), vitamin: await item('فيتامين سائل', 'medicine', 'L'), ib: await item('لقاح IB', 'vaccine', 'pc') };
  await postedOpening(db, U.owner, W.feed, day(-45), [{ item: I.starter, qty: 5000, value: '2500000.00' }, { item: I.bags, qty: 20, value: '200000.00' },
    { item: I.loose, qty: 10, value: '100000.00' }]);
  await postedOpening(db, U.owner, W.raw, day(-45), [{ item: I.oil, qty: 100, value: '150000.00' }]);
  await postedOpening(db, U.owner, W.medicine, day(-45), [{ item: I.vitamin, qty: 20, value: '200000.00' }, { item: I.ib, qty: 50, value: '50000.00' }]);
  const V = { ib: id(101), nd: id(102), gb: id(103) };
  for (const [vid, name, itemId] of [[V.ib, 'IB', I.ib], [V.nd, 'ND', null], [V.gb, 'غمبورو', null]]) await one(U.manager, 'select public.save_vaccine($1, $2, $3, null) as v', [vid, name, itemId]);
  await one(U.manager, 'select public.save_vaccine_program($1, $2, $3::jsonb, 0) as v',
    ['broiler', 42, JSON.stringify([{ vaccine_id: V.ib, age_day: 7 }, { vaccine_id: V.nd, age_day: 10 }, { vaccine_id: V.gb, age_day: 14 }])]);

  const open = async (hallId, on, count, age0, by = G) =>
    (await one(by.users.manager, 'select public.open_flock($1, $2, $3, $4, null, $5) as v', [hallId, on, count, age0, uid()])).flock_id;
  const round = async (flock, [offset, dead, culled, feed, note = null, eggs = null], by = G) => {
    const v = await one(by.users.manager, 'select public.save_flock_day($1, $2, $3, $4, $5, null, null, null, $6, $7, $8, $9, null, $10, false) as v',
      [flock, day(offset), dead, culled, feed, eggs?.[0] ?? null, eggs?.[1] ?? null, eggs?.[2] ?? null, note, uid()]);
    if (v.status !== 'saved') throw new Error(`جولة ${day(offset)} لم تُحفظ: ${JSON.stringify(v)}`);
  };
  const weigh = async (flock, [offset, count, avg]) => {
    const v = await one(U.manager, 'select public.record_flock_weight($1, $2, $3, $4, $5) as v', [flock, day(offset), count, avg, uid()]);
    if (v.status !== 'saved') throw new Error(`وزن ${day(offset)} لم يُحفظ: ${JSON.stringify(v)}`);
  };
  const issue = async (flock, offset, itemId, wh, qty, by = G) => {
    const issueId = uid();
    await one(by.users.manager, 'select public.record_flock_issue($1, $2, $3, $4, $5, $6, $7, $8) as v', [uid(), issueId, uid(), flock, itemId, qty, day(offset), wh]);
    return issueId;
  };
  const close = (flock, offset) => db.admin("update public.flocks set status = 'closed', closed_on = $2 where id = $1", [flock, day(offset)]);
  const give = (on, lines) => one(U.manager, 'select public.give_to_flocks($1, $2, $3::jsonb) as v', [uid(), on, JSON.stringify(lines)]);

  // ── البذرة يوماً بيوم: F0 في «قاعة 1» من 1 تشرين الأوّل ويُغلق يوم 1 تشرين الثاني فيُسكَّن F1 فيها اليوم نفسه؛ FC في «قاعة 4» من 20 تشرين الأوّل
  // ويُغلق 4 تشرين الثاني ثمّ تُؤرشف القاعة؛ F1 (عمر صفر) وF2 (عمر 1) وF5 (عمر 4) لحم، وFL بيّاض بعمر 140.
  const F = {};
  await at(day(-41), async () => {
    F.f0 = await open(H.h1, day(-42), 500, 0);
    for (const r of ROUNDS.f0) await round(F.f0, r);
  });
  await at(day(-18), async () => {
    F.fc = await open(H.h4, day(-23), 1000, 0);
    for (const r of ROUNDS.fc) await round(F.fc, r);
    for (const w of WEIGHTS.fc) await weigh(F.fc, w);
    await issue(F.fc, -23, I.starter, W.feed, '200');
  });
  await at(day(-8), async () => {
    await close(F.f0, -11);
    F.f1 = await open(H.h1, day(-11), 12000, 0);
    await close(F.fc, -8);
    await one(U.owner, 'update public.halls set archived_at = now() where id = $1 returning id', [H.h4]);
    F.fl = await open(H.hl, day(-10), 4000, 140);
    F.f2 = await open(H.h2, day(-8), 3000, 1);
    for (const r of ROUNDS.f1.filter(([o]) => o <= -8)) await round(F.f1, r);
    for (const r of ROUNDS.f2.filter(([o]) => o <= -8)) await round(F.f2, r);
    for (const w of WEIGHTS.f1.filter(([o]) => o <= -8)) await weigh(F.f1, w);
    await issue(F.f1, -11, I.starter, W.feed, '1000');
    await issue(F.f2, -8, I.starter, W.feed, '1000');
  });
  F.f5 = await open(H.h5, day(-3), 2000, 4);
  for (const key of ['f1', 'f2', 'f5', 'fl']) for (const r of ROUNDS[key].filter(([o]) => o > -8)) await round(F[key], r);
  for (const key of ['f1', 'f2']) for (const w of WEIGHTS[key].filter(([o]) => o > -8)) await weigh(F[key], w);
  // يوم 8 تشرين الثاني لـF1: علف 500 كغم ثمّ فيتامين سائل (دواء من المخزن بلا كثافة: بلا كتلة)، ثمّ لقاح IB المربوط مؤشَّراً بصرفه وتسجيل دواء.
  await issue(F.f1, -4, I.starter, W.feed, '500');
  await issue(F.f1, -4, I.vitamin, W.medicine, '2');
  await give(day(-4), [
    { kind: 'vaccination', flock_id: F.f1, id: uid(), vaccine_id: V.ib, age_day: 7, item_id: I.ib, issue_id: uid(), line_id: uid(), warehouse_id: W.medicine, qty: '5' },
    { kind: 'log', flock_id: F.f1, id: id(401), name: 'مضاد حيوي', dose: '1 غم لكلّ لتر' },
  ]);
  const voided = await issue(F.f1, -3, I.starter, W.feed, '300');
  await one(U.manager, 'select public.void_flock_issue($1, $2, $3) as v', [voided, 'كمية خاطئة', uid()]);
  await issue(F.f1, -1, I.loose, W.feed, '2');
  await give(day(-2), [{ kind: 'vaccination', flock_id: F.f2, id: uid(), vaccine_id: V.ib, age_day: 7, item_id: I.ib, issue_id: uid(), line_id: uid(), warehouse_id: W.medicine, qty: '5' }]);
  await issue(F.f2, -2, I.bags, W.feed, '4');
  await issue(F.f2, 0, I.oil, W.raw, '10');
  await issue(F.f2, 0, I.loose, W.feed, '2');
  // سطور علف بلا وزن تُعدّ ولا تختفي (مراجعة 0027: R27-N1 وR27-N2 وR1 وR5؛ DECISIONS 0019)، بعد البذرة كلّها فأرقام FI قبلها كما هي: كيس بلا وزن لـF5
  // يوم 9 تشرين الثاني، وآخر لها يوم 10 يُلغى؛ وكيسان لـF2 يوم 11، فيوم 11 في «حقل ألف» قاعتان بسطور بلا وزن (F1 بسطره وF2 بسطرين) وقاعة بلا فوج.
  await issue(F.f5, -3, I.loose, W.feed, '1');
  const voidedLoose = await issue(F.f5, -2, I.loose, W.feed, '1');
  await one(U.manager, 'select public.void_flock_issue($1, $2, $3) as v', [voidedLoose, 'صُرف لقاعة أخرى', uid()]);
  await issue(F.f2, -1, I.loose, W.feed, '1');
  await issue(F.f2, -1, I.loose, W.feed, '1');

  // ── منشأة الصرف بلا جولة (مراجعة 0027: R27-RR1): كلّ سطر علف في «مزرعة التقارير» نزل يوم جولة، وفي الإنتاج الجولات في 4 أيّام من 33، فأغلب الصرف
  // في يوم بلا جولة. في «حقل جيم»: «ن1» سُكّن 6 تشرين الثاني بلا جولة يومها، وجولاته 7 و8 و10 و11 وحدها؛ صُرف له يوم تسكينه 100 كغم وسطر بلا وزن، ويوم 7
  // (بجولته) 50 كغم، ويوم 9 (بلا جولة) كيسان (50 كغم للكيس) وسطران بلا وزن، واليوم (بلا جولة) 150 كغم وسطر بلا وزن بقطعتين؛ و«ن2» سُكّن اليوم بلا جولة
  // وصُرف له كيس بلا وزن. منشأة مستقلّة، فعيّنات الشاشات وقيم «مزرعة التقارير» المحسوبة باليد كما هي؛ والنموذج يقارنها في ١ و٣، وقيمها باليد في ٣ج.
  const N = await makeOrg(db, { name: 'مزرعة الصرف بلا جولة', id: (n) => id(60 + n), phone: (n) => phone(60 + n), roles: [['owner', 'owner'], ['manager', 'manager']] });
  const NW = await warehouses(N.org);
  const nSite = await site('broiler', 'حقل جيم', N);
  const NH = { h6: await hall(nSite, 'قاعة 6', N), h7: await hall(nSite, 'قاعة 7', N) };
  const NI = { starter: await item('علف بادئ', 'feed', 'kg', null, null, N), bags: await item('علف بالأكياس', 'feed', 'pc', null, 50, N),
    loose: await item('علف بلا وزن', 'feed', 'pc', null, null, N) };
  await postedOpening(db, N.users.owner, NW.feed, day(-7), [{ item: NI.starter, qty: 1000, value: '500000.00' }, { item: NI.bags, qty: 10, value: '100000.00' },
    { item: NI.loose, qty: 10, value: '100000.00' }]);
  const NF = { na: await open(NH.h6, day(-6), 5000, 0, N), nb: await open(NH.h7, TODAY, 1000, 0, N) };
  for (const r of [[-5, 3, 0, '40'], [-4, 2, 1, '45'], [-2, 1, 0, '55'], [-1, 0, 0, '60']]) await round(NF.na, r, N);
  for (const [offset, itemId, qty] of [[-6, NI.starter, '100'], [-6, NI.loose, '1'], [-5, NI.starter, '50'], [-3, NI.bags, '2'], [-3, NI.loose, '1'],
    [-3, NI.loose, '1'], [0, NI.starter, '150'], [0, NI.loose, '2']]) await issue(NF.na, offset, itemId, NW.feed, qty, N);
  await issue(NF.nb, 0, NI.loose, NW.feed, '1', N);

  const raw = await loadRaw(db, org);
  const rawN = await loadRaw(db, N.org);
  const ALL = () => true;
  const SCOPES = { manager: ALL, hallWorker: (s) => s === S.a, layerWorker: (s) => s === S.l };
  const hallsDay = async (user, on) => one(user, HALLS_DAY, [on]);
  const flockOf = (response, hallName) => response.sites.flatMap((s) => s.halls).find((h) => h.hall_name === hallName)?.flock ?? null;
  const hallNames = (response) => response.sites.flatMap((s) => s.halls.map((h) => h.hall_name));
  const scaleIssues = [];

  // ── ١) halls_day كلّه بالنموذج المستقلّ: كلّ يوم من 28 أيلول إلى اليوم، لكلّ هويّة بنطاقها (القاعات والأفواج والأرقام والمجاميع والتنقّل).
  const mismatches = [];
  let flockDays = 0;
  const responses = {};
  for (const [who, inScope] of Object.entries(SCOPES)) {
    for (let on = day(-45); on <= TODAY; on = addDays(on, 1)) {
      const got = await hallsDay(U[who], on);
      responses[`${who}:${on}`] = got;
      scaleIssues.push(...scaleProblems(got, `halls_day(${who}, ${on})`));
      const want = hallsDayModel(raw, on, TODAY, inScope);
      flockDays += want.sites.flatMap((s) => s.halls).filter((h) => h.flock).length;
      if (!same(withoutLists(got), want)) mismatches.push(`${who} ${on}: ${canon(deep(withoutLists(got))).slice(0, 400)} ≠ ${canon(deep(want)).slice(0, 400)}`);
    }
  }
  // ومنشأة الصرف بلا جولة بمديرها من اليوم الذي قبل تسكين «ن1» إلى اليوم (أجوبتها خارج responses: المجاميع والعيّنات أدناه لـ«مزرعة التقارير» وحدها).
  const responsesN = {};
  let flockDaysN = 0;
  for (let on = day(-7); on <= TODAY; on = addDays(on, 1)) {
    const got = await hallsDay(N.users.manager, on);
    responsesN[on] = got;
    scaleIssues.push(...scaleProblems(got, `halls_day(n, ${on})`));
    const want = hallsDayModel(rawN, on, TODAY, ALL);
    flockDaysN += want.sites.flatMap((s) => s.halls).filter((h) => h.flock).length;
    if (!same(withoutLists(got), want)) mismatches.push(`n ${on}: ${canon(deep(withoutLists(got))).slice(0, 400)} ≠ ${canon(deep(want)).slice(0, 400)}`);
  }
  t.same(mismatches.slice(0, 3), [], `halls_day = النموذج المستقلّ لكلّ يوم من ${day(-45)} إلى ${TODAY} ولكلّ هويّة (3 × 46 جواباً، ${flockDays} يوم فوج)، `
    + `ولمنشأة الصرف بلا جولة من ${day(-7)} (8 أجوبة، ${flockDaysN} أيّام فوج، والعلف في أيّام بلا جولة)`);
  t.ok(flockDays > 100 && flockDaysN === 8, `النموذج مرّ على أيّام أفواج حقيقية (${flockDays} و${flockDaysN})، لا على صفر`);

  // ── ٢) قيم محسوبة باليد لأهمّ التعريفات (تحرس النموذج نفسه).
  const today = responses[`manager:${TODAY}`];
  t.same([today.on, today.today, today.prev, today.next, today.sites.map((s) => s.name), hallNames(today)],
    [TODAY, TODAY, true, false, ['حقل ألف', 'حقل البيض', 'حقل باء'], ['قاعة 1', 'قاعة 2', 'قاعة 3', 'قاعة البيّاض', 'قاعة 5']],
    'اليوم: الحقول بترتيب البايت (collate "C")، والقاعة المؤرشفة بلا فوج وFC المغلق قبل اليوم والحقل بلا قاعات لا تظهر، و«قاعة 3» فارغة تظهر');
  const f1Today = flockOf(today, 'قاعة 1');
  t.same(deep(pick(f1Today, ['round', 'dead', 'culled', 'feed_eaten_kg', 'note', 'weight', 'live_start', 'live_end', 'dead_cum', 'culled_cum', 'mortality_cum_pct',
    'feed_eaten_cum_kg', 'feed_days', 'feed_span', 'feed_given_kg', 'feed_given_unweighed', 'feed_given_cum_kg', 'feed_given_cum_unweighed', 'feed_left_kg',
    'last_weight', 'fcr', 'age', 'day_no'])),
  deep({ round: false, dead: null, culled: null, feed_eaten_kg: null, note: null, weight: null, live_start: 11981, live_end: 11981, dead_cum: 16, culled_cum: 3,
    mortality_cum_pct: '0.16', feed_eaten_cum_kg: '2700', feed_days: 9, feed_span: 11, feed_given_kg: '0', feed_given_unweighed: 0, feed_given_cum_kg: '1500',
    feed_given_cum_unweighed: 1, feed_left_kg: '-1200', last_weight: { on_date: day(-1), age: 10, avg_g: '300.5' }, fcr: null, age: 11, day_no: 12 }),
  'F1 اليوم بلا جولة: النافق والمستبعد والعلف null لا صفر، والحيّ أوّل اليوم = آخره، والنازل بلا الملغى والباقي سالب وبجانبه سطر أمس بلا وزن (تراكمه 1 وعدد اليوم 0)، وآخر وزن أمس، ولا معامل تحويل (فجوة 4 تشرين الثاني)');
  const f2Today = flockOf(today, 'قاعة 2');
  t.same(deep(pick(f2Today, ['round', 'live_start', 'dead', 'culled', 'live_end', 'mortality_cum_pct', 'feed_eaten_kg', 'feed_eaten_cum_kg', 'feed_given_kg',
    'feed_given_unweighed', 'feed_given_cum_kg', 'feed_given_cum_unweighed', 'feed_left_kg', 'weight', 'last_weight', 'fcr', 'age', 'eggs_total', 'hdep'])),
  deep({ round: true, live_start: 2979, dead: 3, culled: 1, live_end: 2975, mortality_cum_pct: '0.83', feed_eaten_kg: '220', feed_eaten_cum_kg: '1260',
    feed_given_kg: '9.2', feed_given_unweighed: 1, feed_given_cum_kg: '1209.2', feed_given_cum_unweighed: 3, feed_left_kg: '-50.8',
    weight: { sample_count: 50, avg_g: '260.0' }, last_weight: { on_date: TODAY, age: 9, avg_g: '260.0' }, fcr: '1.629', age: 9, eggs_total: null, hdep: null }),
  'F2 اليوم: الحيّ أوّل اليوم 3,000 − 21، والزيت 10 لتر × 0.92 = 9.2 كغم والكيس بلا وزن يُعدّ (وتراكمه 3 بكيسَي أمس)، ومعامل التحويل 1,260,000 ÷ (2,975 × 260) = 1.629');
  t.same([f2Today.issues.map((x) => [x.name, norm(x.qty), x.base_unit, norm(x.kg), x.cost_kind]), f2Today.logs, f2Today.vaccines],
    [[['زيت', '10', 'L', '9.2', 'feed'], ['علف بلا وزن', '2', 'pc', null, 'feed']], [], []], 'F2 اليوم: الصرف بترتيب ترحيله باللتر والقطعة، بلا لقاح ولا تسجيل');
  t.same(today.sites.map((s) => [s.name, deep(s.totals)]), [
    ['حقل ألف', deep({ halls: 3, flocks: 2, rounds: 1, live_start: 14960, dead: 3, culled: 1, live_end: 14956, feed_eaten_kg: '220', feed_eaten_flocks: 1, feed_given_kg: '9.2',
      feed_given_unweighed: 1 })],
    ['حقل البيض', deep({ halls: 1, flocks: 1, rounds: 1, live_start: 3996, dead: 0, culled: 0, live_end: 3996, feed_eaten_kg: '475', feed_eaten_flocks: 1, feed_given_kg: '0',
      feed_given_unweighed: 0 })],
    ['حقل باء', deep({ halls: 1, flocks: 1, rounds: 1, live_start: 1999, dead: 2, culled: 0, live_end: 1997, feed_eaten_kg: '40', feed_eaten_flocks: 1, feed_given_kg: '0',
      feed_given_unweighed: 0 })],
  ], 'مجاميع الحقول: النافق من جولة F2 وحدها («من قاعة واحدة»)، والحيّ لكلّ فوج، والعلف ممّن سجّله، والنازل بكيلوه وبسطر F2 بلا وزن اليوم (لا تراكم F1 وF2)');
  t.same(deep(today.totals), deep({ halls: 5, flocks: 4, rounds: 3, live_start: 20955, dead: 5, culled: 1, live_end: 20949, feed_eaten_kg: '735', feed_eaten_flocks: 3,
    feed_given_kg: '9.2', feed_given_unweighed: 1 }), 'مجموع الكلّ = مجموع الحقول');
  const bNov11 = responses[`manager:${day(-1)}`].sites.find((s) => s.name === 'حقل باء');
  t.same([bNov11.totals.rounds, bNov11.totals.dead, bNov11.totals.culled, bNov11.totals.feed_eaten_kg, bNov11.totals.feed_eaten_flocks, bNov11.totals.live_start,
    flockOf(responses[`manager:${day(-1)}`], 'قاعة 5').round, bNov11.totals.feed_given_unweighed], [0, null, null, null, 0, 1999, false, 0],
  'حقل لا جولة فيه ذلك اليوم: النافق والمستبعد والعلف null لا صفر، والحيّ باقٍ، ولا سطر بلا وزن ذلك اليوم (صفر حقيقيّ)');
  const f5Today = flockOf(today, 'قاعة 5');
  t.same(f5Today.vaccines.map((x) => [x.name, x.age_day, x.state, x.vaccination_id]), [['IB', 7, 'today', null]], 'F5 (عمره 4 عند التسكين قبل ثلاثة أيّام): IB يوم العمر 7 موعده اليوم');
  const f1Nov8 = flockOf(responses[`manager:${day(-4)}`], 'قاعة 1');
  t.same([f1Nov8.issues.map((x) => [x.name, norm(x.kg), x.cost_kind]), f1Nov8.logs.map((x) => [x.id, x.name, x.dose]),
    f1Nov8.vaccines.map((x) => [x.name, x.state, x.issue_id !== null, /^FI-/u.test(x.doc_no ?? '')]), deep(f1Nov8.weight), deep(f1Nov8.last_weight), norm(f1Nov8.feed_given_kg)],
  [[['علف بادئ', '500', 'feed'], ['فيتامين سائل', null, 'medicine']], [[id(401), 'مضاد حيوي', '1 غم لكلّ لتر']], [['IB', 'done', true, true]],
    deep({ sample_count: 50, avg_g: '190.0' }), deep({ on_date: day(-4), age: 7, avg_g: '190.0' }), '500'],
  'F1 يوم 8 تشرين الثاني: العلف ثمّ الدواء بترتيب الترحيل (صرف لقاح IB المؤشَّر داخل اللقاح لا في الصرف)، والتسجيل، والوزن يومه وآخر وزن');
  const f1Nov9 = flockOf(responses[`manager:${day(-3)}`], 'قاعة 1');
  t.same([f1Nov9.weight, deep(f1Nov9.last_weight), f1Nov9.issues, norm(f1Nov9.feed_given_kg), norm(f1Nov9.feed_given_cum_kg)],
    [null, deep({ on_date: day(-4), age: 7, avg_g: '190.0' }), [], '0', '1500'], 'F1 يوم 9: الصرف الملغى لا يظهر ولا يُعدّ، وآخر وزن قبله');
  const f1Nov11 = flockOf(responses[`manager:${day(-1)}`], 'قاعة 1');
  t.same([f1Nov11.vaccines.map((x) => [x.name, x.age_day, x.state]), f1Nov11.note, norm(f1Nov11.feed_given_kg), f1Nov11.feed_given_unweighed,
    f1Nov11.feed_given_cum_unweighed], [[['ND', 10, 'missed']], 'حرارة مرتفعة', '0', 1, 1],
  'F1 يوم 11: ND يوم العمر 10 فائت، والملاحظة، والعلف بالقطعة بلا وزن يُعدّ (في يومه وتراكمه) ولا يُجمع');
  const fcrAt = (offset) => flockOf(responses[`manager:${day(offset)}`], 'قاعة 1').fcr;
  t.same([fcrAt(-10), fcrAt(-9), fcrAt(-8), fcrAt(-7), fcrAt(-6)], [null, '0.441', '0.441', null, null],
    'معامل تحويل F1 بقاعدة flock_summary واليوم = D: بلا وزن null، و450,000 ÷ (11,993 × 85) = 0.441 يوم 3 ويوم 4 بلا جولة، ثمّ null بعد فجوة يوم 4');
  const fl = (offset) => flockOf(responses[`manager:${day(offset)}`], 'قاعة البيّاض');
  t.same([[fl(-2).hdep, fl(-1).hdep, fl(0).hdep], [fl(-1).eggs_total, fl(-1).eggs_cracked, fl(-1).eggs_broken], [fl(0).eggs_cracked, fl(0).eggs_broken], fl(-3).round, fl(-3).hdep],
    [['75.00', '77.54', '76.33'], [3100, 15, 5], [null, null], false, null], 'البيّاض: نسبة الإنتاج من الحيّ أوّل اليوم (310,000 ÷ 3,998)، والمشعور والمكسور، ويوم بلا جولة null');
  const nov3 = responses[`manager:${day(-9)}`];
  t.same([hallNames(nov3), flockOf(nov3, 'قاعة 2'), flockOf(nov3, 'قاعة 4')?.id, flockOf(nov3, 'قاعة 4')?.status, flockOf(nov3, 'قاعة 4')?.closed_on],
    [['قاعة 1', 'قاعة 2', 'قاعة 3', 'قاعة 4', 'قاعة البيّاض', 'قاعة 5'], null, F.fc, 'closed', day(-8)],
  'يوم 3 تشرين الثاني: F2 سُكّن بعده فـ«قاعة 2» فارغة، و«قاعة 4» المؤرشفة تظهر بـFC المغلق بعده، و«قاعة 5» فارغة');
  t.same([hallNames(responses[`manager:${day(-8)}`]).includes('قاعة 4'), hallNames(responses[`manager:${day(-7)}`]).includes('قاعة 4')], [true, false],
    'القاعة المؤرشفة يوم إغلاق فوجها نفسه تظهر، وبعده لا');
  t.same([flockOf(responses[`manager:${day(-11)}`], 'قاعة 1').id, flockOf(responses[`manager:${day(-12)}`], 'قاعة 1').id, flockOf(responses[`manager:${day(-12)}`], 'قاعة 1').status],
    [F.f1, F.f0, 'closed'], 'يوم يلتقي فيه فوج أُغلق وفوج سُكّن في القاعة نفسها: الأحدث تسكيناً؛ وقبله المغلق بحالته');
  t.same([responses[`manager:${day(-42)}`].prev, responses[`manager:${day(-42)}`].next, responses[`manager:${day(-43)}`].prev, responses[`layerWorker:${day(-10)}`].prev,
    responses[`manager:${day(-10)}`].prev, responses[`hallWorker:${TODAY}`].sites.map((s) => s.name), responses[`layerWorker:${TODAY}`].sites.map((s) => s.name)],
  [false, true, false, false, true, ['حقل ألف'], ['حقل البيض']],
  'التنقّل: لا رجوع قبل أوّل تسكين في النطاق (البيّاض وحده سُكّن 2 تشرين الثاني)، والتالي ما دام قبل اليوم؛ وعامل القاعة بنطاق حقله لا يرى غيره');
  const [nullCall, todayCall] = [await call(db, U.hallWorker, HALLS_DAY, [null]), await call(db, U.hallWorker, HALLS_DAY, [TODAY])];
  const nullDay = nullCall.ok ? nullCall.value : {};
  t.same([shown(await call(db, U.manager, HALLS_DAY, [day(1)])), (await call(db, U.manager, HALLS_DAY, [day(1)])).hint, shown(nullCall), nullDay.on, nullDay.today,
    canon(nullDay) === canon(todayCall.value), (nullDay.sites ?? []).map((s) => s.name)],
  ['future_day', 'لا تقرير ليوم لم يأتِ بعد.', 'ok', TODAY, TODAY, true, ['حقل ألف']],
  'اليوم القادم مرفوض بجملته، وبلا يوم (null) يومُ الخادم الحاليّ: جواب اليوم نفسه حرفاً وبنطاق القارئ (الشاشة التي تتبع «اليوم» لا تقرأ ساعة الجهاز)');
  t.ok(!hasMoney(today), 'التقرير اليوميّ بلا مال');

  // ── ٣) تقرير الدورة: المفاتيح الجديدة بالنموذج لكلّ فوج، ومجاميع الأيّام = المفاتيح القديمة، والمال لأدوار الكلفة وحدها.
  /** تقرير دورة فوج من rawX: أجزاؤه المخالفة للنموذج (parts)، ومجاميع أيّامه (totals) مقابل المفاتيح القديمة وflock_feed (old)؛ get يقرأ الجواب
   *  (النداء الحقيقيّ، أو داخل طفرة). */
  const cycleCheck = async (get, rawX, flockId) => {
    const fx = rawX.flocks.get(flockId);
    const through = fx.f.closed_on ?? TODAY;
    const days = daysOf(fx, through);
    const got = await get(REPORT, [flockId]);
    const want = {
      days: days.map((d) => pick(d.view, DAY_KEYS)),
      weeks: weeksOf(days),
      weights: [...fx.weights.values()].sort((a, b) => (a.d < b.d ? -1 : 1)).map((w) => ({ on_date: w.d, age: between(w.d, fx.f.placed_on) + fx.f.age0,
        sample_count: w.sample_count, avg_g: text(units(w.avg, 1), 1) })),
      kpis: kpisOf(fx.f, days),
    };
    const sum = (k) => got.days.reduce((s, d) => s + (d[k] ?? 0), 0);
    const last = got.days.at(-1);
    const feedNow = await get(FEED, [flockId]);
    const totals = [sum('dead'), sum('culled'), last.live_end, norm(last.feed_eaten_cum_kg), norm(last.feed_given_cum_kg), norm(last.feed_left_kg), got.kpis.mortality_pct, last.on,
      sum('feed_given_unweighed'), last.feed_given_cum_unweighed];
    const old = [got.birds.dead, got.birds.culled, got.birds.live, norm(got.feed.consumed_kg), norm(got.feed.delivered_kg), norm(got.feed.remaining_kg), got.birds.mortality_pct, got.through,
      got.feed.unweighed, feedNow.unweighed_feed_lines];
    return { got, want, parts: Object.keys(want).filter((part) => !same(got[part], want[part])), totals, old };
  };
  const reports = {};
  const reportMismatches = [];
  const cycleFlocks = [...Object.entries(F).map(([key, flockId]) => [key, flockId, raw, U.manager]),
    ...Object.entries(NF).map(([key, flockId]) => [key, flockId, rawN, N.users.manager])];
  for (const [key, flockId, rawX, user] of cycleFlocks) {
    const { got, want, parts, totals, old } = await cycleCheck((sql, params) => one(user, sql, params), rawX, flockId);
    reports[key] = got;
    scaleIssues.push(...scaleProblems(got, `flock_cycle_report(${key})`));
    for (const part of parts) reportMismatches.push(`${key}.${part}: ${canon(deep(got[part])).slice(0, 300)} ≠ ${canon(deep(want[part])).slice(0, 300)}`);
    if (canon(totals) !== canon(old)) reportMismatches.push(`${key}: مجاميع الأيّام ${canon(totals)} ≠ المفاتيح القديمة ${canon(old)}`);
  }
  t.same(reportMismatches, [], `تقرير الدورة: الأيّام والأسابيع والأوزان والمؤشّرات = النموذج لثمانية أفواج (قائمة ومغلقة، لحم وبيّاض، عمر 0 و1 و4 و140، وفوجا منشأة الصرف بلا جولة)، ومجاميع الأيّام = birds وfeed، وسطور العلف بلا وزن (مجموع أعداد الأيّام وتراكم آخرها) = feed.unweighed = unweighed_feed_lines في flock_feed`);
  const wk = (key) => reports[key].weeks.map((w) => [w.week, w.from_age, w.to_age, w.from_on, w.to_on, w.days, w.round_days, w.dead, w.culled, w.mortality_pct,
    w.mortality_cum_pct, w.live_end, norm(w.feed_eaten_kg), w.feed_g_per_bird_day, w.weight && [w.weight.on_date, w.weight.age, w.weight.avg_g], w.fcr]);
  t.same(wk('f1'), [
    [1, 0, 7, day(-11), day(-4), 8, 7, 13, 2, '0.13', '0.13', 11985, '1350', '18.8', [day(-4), 7, '190.0'], null],
    [2, 8, 11, day(-3), TODAY, 4, 3, 3, 1, '0.03', '0.16', 11981, '1350', '37.6', [day(-1), 10, '300.5'], null],
  ], 'أسابيع F1 (عمر صفر): الأوّل للأعمار 0–7 (8 أيّام، 7 جولات)، ونفوقه 15 ÷ 12,000 = 0.13٪، وغرام العلف 1,350,000 ÷ 71,962 = 18.8، وبلا معامل تحويل (فجوة)');
  t.same(wk('f2'), [
    [1, 1, 7, day(-8), day(-2), 7, 7, 18, 3, '0.70', '0.70', 2979, '840', '40.1', [day(-2), 7, '200.5'], '1.406'],
    [2, 8, 9, day(-1), TODAY, 2, 2, 3, 1, '0.13', '0.83', 2975, '420', '70.5', [TODAY, 9, '260.0'], '1.629'],
  ], 'أسابيع F2 (عمر 1): الأوّل للأعمار 1–7 (7 أيّام)، ومعامل التحويل في آخر يوم من كلّ أسبوع (840,000 ÷ (2,979 × 200.5) = 1.406)');
  t.same(wk('fl').map((w) => w.slice(0, 14)), [
    [20, 140, 140, day(-10), day(-10), 1, 0, null, null, null, '0.00', 4000, null, null],
    [21, 141, 147, day(-9), day(-3), 7, 0, null, null, null, '0.00', 4000, null, null],
    [22, 148, 150, day(-2), TODAY, 3, 3, 3, 1, '0.10', '0.10', 3996, '1425', '118.8'],
  ], 'أسابيع البيّاض (عمر 140): أسبوع بلا جولة نافقه وعلفه ونفوقه null لا صفر، والتراكم والحيّ في آخر يومه، وغرام العلف 1,425,000 ÷ 11,994 = 118.8');
  t.same(deep(reports.f2.kpis), deep({ days: 9, age_end: 9, placed: 3000, dead: 21, culled: 4, live: 2975, mortality_pct: '0.83', livability_pct: '99.17',
    feed_given_kg: '1209.2', feed_eaten_kg: '1260', feed_left_kg: '-50.8', feed_days: 9, feed_span: 9, feed_per_bird_kg: '0.42',
    last_weight: { on_date: TODAY, age: 9, avg_g: '260.0' }, fcr: '1.629', epef: '176' }),
  'مؤشّرات F2: الحيوية 100 − 0.83، والعلف لكلّ طير 1,260 ÷ 3,000، وEPEF = 99.17 × 260 ÷ (10 × 9 × 1.629) = 176');
  t.same([reports.f1.kpis.fcr, reports.f1.kpis.epef, reports.f1.kpis.livability_pct, reports.f1.kpis.feed_per_bird_kg, reports.f1.kpis.feed_days, reports.f1.kpis.feed_span],
    [null, null, '99.84', '0.225', 9, 11], 'مؤشّرات F1: سُجّل العلف 9 من 11 يوماً، فلا معامل تحويل ولا EPEF، والباقي محسوب');
  t.same([reports.fc.through, reports.fc.days.length, reports.fc.days.at(-1).on, reports.fc.kpis.days, reports.fc.kpis.age_end, reports.fc.weeks.map((w) => w.days),
    reports.f0.days.length, reports.f0.through], [day(-8), 16, day(-8), 16, 15, [8, 7, 1], 32, day(-11)],
  'الفوج المغلق: أيّامه حتى يوم إغلاقه لا حتى اليوم، وأسابيعه كذلك');
  t.same([hasMoney(reports.f2), hasMoney(await one(U.hallWorker, REPORT, [F.f2])), hasMoney({ days: reports.f2.days, weeks: reports.f2.weeks, weights: reports.f2.weights, kpis: reports.f2.kpis }),
    shown(await call(db, U.hallWorker, REPORT, [F.f5])), shown(await call(db, U.layerWorker, REPORT, [F.f1]))], [true, false, false, 'out_of_scope', 'out_of_scope'],
  'المال لأدوار الكلفة وحدها كما في 0026، والمفاتيح الجديدة بلا مال، والتقرير بنطاق حقل الفوج');

  // ── ٣ب) سطور العلف بلا وزن تُعدّ ولا تختفي (DECISIONS 0019؛ مراجعة 0027: R27-N1 وR27-N2 وR1 وR5): عدد يومها وعددها التراكميّ في التقرير اليوميّ
  // وأيّام الدورة، وعدد اليوم في مجموع كلّ حقل وكلّ القاعات؛ والملغى لا يُعدّ في أيّ منها.
  const unweighedOf = (x) => (x ? [x.feed_given_unweighed, x.feed_given_cum_unweighed] : null);
  const reportDayOf = (report, offset) => report.days.find((d) => d.on === day(offset)) ?? null;
  const reportDay = (key, offset) => reportDayOf(reports[key], offset);
  const hallsSum = (halls) => halls.reduce((s, h) => s + (h.flock?.feed_given_unweighed ?? 0), 0);
  const f5Feed = await one(U.manager, FEED, [F.f5]);
  const AROUND = [-3, -2, -1, 0];
  t.same([AROUND.map((o) => unweighedOf(flockOf(responses[`manager:${day(o)}`], 'قاعة 5'))), AROUND.map((o) => unweighedOf(reportDay('f5', o))),
    reports.f5.days.at(-1).feed_given_cum_unweighed, f5Feed.unweighed_feed_lines],
  [[[1, 1], [0, 1], [0, 1], [0, 1]], [[1, 1], [0, 1], [0, 1], [0, 1]], 1, 1],
  'كيس بلا وزن لـF5 يوم 9 (D): عدد يومه 1، ثمّ يوم 10 و11 (D+1 وD+2) واليوم عدد اليوم 0 والتراكميّ 1 لا 0، في التقرير اليوميّ وأيّام الدورة سواءً؛ وتراكم آخر يوم في الدورة = unweighed_feed_lines في flock_feed');

  const nov11 = responses[`manager:${day(-1)}`];
  const alef11 = nov11.sites.find((s) => s.name === 'حقل ألف');
  t.same([alef11.halls.map((h) => [h.hall_name, h.flock && h.flock.feed_given_unweighed, h.flock && norm(h.flock.feed_given_kg)]),
    nov11.sites.map((s) => [s.name, s.totals.feed_given_unweighed, hallsSum(s.halls), norm(s.totals.feed_given_kg), s.totals.halls]),
    [nov11.totals.feed_given_unweighed, hallsSum(nov11.sites.flatMap((s) => s.halls)), norm(nov11.totals.feed_given_kg)],
    [responses[`hallWorker:${day(-1)}`].sites.map((s) => [s.name, s.totals.feed_given_unweighed]), responses[`hallWorker:${day(-1)}`].totals.feed_given_unweighed]],
  [[['قاعة 1', 1, '0'], ['قاعة 2', 2, '0'], ['قاعة 3', null, null]],
    [['حقل ألف', 3, 3, '0', 3], ['حقل البيض', 0, 0, '0', 1], ['حقل باء', 0, 0, '0', 1]],
    [3, 3, '0'],
    [[['حقل ألف', 3]], 3]],
  'يوم 11: قاعتا «حقل ألف» بسطور بلا وزن (F1 سطر وF2 سطران) و«قاعة 3» بلا فوج: مجموع الحقل 3 = مجموع قاعاته والقاعة الفارغة لا تضيف شيئاً، ومجموع الكلّ 3 = مجموع القاعات كلّها، والكيلو صفر فلا يقول المجموع «النازل 0» وحده؛ وعامل القاعة بنطاق حقله يرى مجموعه');
  const sumProblems = [];
  let unweighedTotals = 0;
  for (const [label, r] of Object.entries(responses)) {
    for (const s of r.sites) if (s.totals.feed_given_unweighed !== hallsSum(s.halls)) sumProblems.push(`${label} ${s.name}: ${s.totals.feed_given_unweighed} ≠ ${hallsSum(s.halls)}`);
    const all = hallsSum(r.sites.flatMap((s) => s.halls));
    if (r.totals.feed_given_unweighed !== all) sumProblems.push(`${label}: ${r.totals.feed_given_unweighed} ≠ ${all}`);
    if (all > 0) unweighedTotals += 1;
  }
  t.same([sumProblems.slice(0, 3), unweighedTotals], [[], 5],
    `في كلّ جواب (${Object.keys(responses).length}): سطور الحقل بلا وزن = مجموع قاعاته، وسطور الكلّ = مجموع القاعات كلّها؛ ومجموع غير صفريّ في 5 أجوبة (يوم 9 و11 واليوم للمدير، ويوم 11 واليوم لعامل القاعة، فـF5 يوم 9 خارج نطاقه، والملغى يوم 10 صفر)`);

  const nov10 = responses[`manager:${day(-2)}`];
  const f5Nov10 = flockOf(nov10, 'قاعة 5');
  t.same([f5Nov10.issues, unweighedOf(f5Nov10), unweighedOf(reportDay('f5', -2)), nov10.sites.find((s) => s.name === 'حقل باء').totals.feed_given_unweighed,
    nov10.totals.feed_given_unweighed, f5Feed.issues.map((x) => [x.issued_on, x.status, x.item_name, norm(x.qty)])],
  [[], [0, 1], [0, 1], 0, 0, [[day(-2), 'void', 'علف بلا وزن', '1'], [day(-3), 'posted', 'علف بلا وزن', '1']]],
  'الصرف الملغى بسطر بلا وزن (F5 يوم 10) لا يظهر في صرف يومه، ولا يُعدّ في عدد يومه ولا في التراكميّ (التقرير اليوميّ وأيّام الدورة) ولا في مجموع الحقل والكلّ؛ وflock_feed يعرضه ملغى ولا يعدّه');
  // العيّنات (REPORTS_SAMPLES_OUT أدناه) تحمل ما تحتاجه الشاشات من هذا: فوج تراكمه موجب وعدد يومه صفر، ومجموع حقل وكلّ موجب، وأيّام دورة بعدد يوم موجب ثمّ
  // تراكم موجب بعده.
  const laterCum = (report) => report.days.some((d, i) => d.feed_given_unweighed > 0 && report.days.slice(i + 1).some((x) => x.feed_given_cum_unweighed > 0));
  t.same([
    today.sites.flatMap((s) => s.halls).filter((h) => h.flock && h.flock.feed_given_unweighed === 0 && h.flock.feed_given_cum_unweighed > 0).map((h) => h.hall_name),
    today.sites.filter((s) => s.totals.feed_given_unweighed > 0).map((s) => s.name), today.totals.feed_given_unweighed > 0, [laterCum(reports.f1), laterCum(reports.f2)],
  ], [['قاعة 1', 'قاعة 5'], ['حقل ألف'], true, [true, true]],
  'العيّنات للشاشات: اليوم «قاعة 1» و«قاعة 5» بتراكم موجب وعدد يوم صفر، و«حقل ألف» والكلّ بمجموع موجب، وأيّام دورتَي F1 (الفجوات) وF2 بعدد يوم موجب ثمّ تراكم بعده');

  // ── ٣ج) علف نزل في أيّام بلا جولة (مراجعة 0027: R27-RR1): النازل بكيلوه وسطوره بلا وزن ليوم صرفه، جولةً كان أو لا (يوم التسكين ويوم في الوسط واليوم)،
  // في التقرير اليوميّ وأيّام الدورة ومجموع الحقل والكلّ، وflock_feed يعدّها. النموذج يقارن هذه المنشأة في ١ و٣؛ وهنا قيم محسوبة باليد تحرس النموذج نفسه.
  const givenRow = (x) => (x ? [x.round, norm(x.feed_given_kg), x.feed_given_unweighed, norm(x.feed_given_cum_kg), x.feed_given_cum_unweighed, norm(x.feed_left_kg)] : null);
  const NA_DAYS = [-6, -5, -4, -3, -2, -1, 0];
  const naGiven = [[false, '100', 1, '100', 1, '100'], [true, '50', 0, '150', 1, '110'], [true, '0', 0, '150', 1, '65'], [false, '100', 2, '250', 3, '165'],
    [true, '0', 0, '250', 3, '110'], [true, '0', 0, '250', 3, '50'], [false, '150', 1, '400', 4, '200']];
  t.same([NA_DAYS.map((o) => givenRow(flockOf(responsesN[day(o)], 'قاعة 6'))), NA_DAYS.map((o) => givenRow(reportDay('na', o)))], [naGiven, naGiven],
    '«ن1» من 6 تشرين الثاني إلى اليوم [الجولة، النازل، سطوره بلا وزن، تراكم النازل، تراكم سطوره، الباقي]: يوم تسكينه بلا جولة 100 كغم وسطر، ويوم 7 بجولته 50 كغم، ويوم 9 بلا جولة كيسان (100 كغم) وسطران، واليوم بلا جولة 150 كغم وسطر بقطعتين (السطر يُعدّ لا القطع)؛ والباقي = تراكم النازل − المأكول (40 و45 و55 و60)، في التقرير اليوميّ وأيّام الدورة سواءً');
  const nToday = responsesN[TODAY];
  const naFeed = await one(N.users.manager, FEED, [NF.na]);
  const nbFeed = await one(N.users.manager, FEED, [NF.nb]);
  t.same([givenRow(flockOf(nToday, 'قاعة 7')), flockOf(nToday, 'قاعة 7').day_no, reports.nb.days.map(givenRow),
    nToday.sites.map((s) => [s.name, s.totals.flocks, s.totals.rounds, s.totals.dead, s.totals.feed_eaten_kg, norm(s.totals.feed_given_kg), s.totals.feed_given_unweighed]),
    [nToday.totals.rounds, norm(nToday.totals.feed_given_kg), nToday.totals.feed_given_unweighed],
    [norm(naFeed.issued_feed_kg), norm(naFeed.consumed_feed_kg), naFeed.unweighed_feed_lines, reports.na.feed.unweighed, norm(nbFeed.issued_feed_kg), nbFeed.unweighed_feed_lines,
      reports.nb.feed.unweighed]],
  [[false, '0', 1, '0', 1, '0'], 1, [[false, '0', 1, '0', 1, '0']], [['حقل جيم', 2, 0, null, null, '150', 2]], [0, '150', 2], ['400', '200', 4, 4, '0', 1, 1]],
  '«ن2» سُكّن اليوم بلا جولة وصُرف له كيس بلا وزن: عدد يومه 1 وتراكمه 1 في التقرير اليوميّ وأيّام الدورة؛ ومجموع «حقل جيم» والكلّ اليوم ولا جولة فيه: 150 كغم وسطران (سطر «ن1» وكيس «ن2»)؛ وflock_feed وfeed.unweighed: «ن1» 400 كغم و4 سطور، و«ن2» سطر واحد');

  // ── ٤) قائمة الدورات: الترتيب والنطاق والحيّ والنفوق بالنموذج، والحدّ 500.
  const cyclesMismatches = [];
  for (const [who, inScope] of Object.entries(SCOPES)) {
    const got = await one(U[who], CYCLES, []);
    scaleIssues.push(...scaleProblems(got, `flock_cycles(${who})`));
    const want = { today: TODAY, more: false, cycles: cyclesModel(raw, TODAY, inScope) };
    if (!same(got, want)) cyclesMismatches.push(`${who}: ${canon(deep(got)).slice(0, 300)} ≠ ${canon(deep(want)).slice(0, 300)}`);
  }
  t.same(cyclesMismatches, [], 'flock_cycles = النموذج لكلّ هويّة (القائمة ثمّ المغلقة الأحدث إغلاقاً، والحيّ والنفوق حتى «حتى»)');
  const cycles = await one(U.manager, CYCLES, []);
  t.same(cycles.cycles.map((c) => [c.id, c.status, c.through, c.age, c.days, c.live, c.mortality_pct]), [
    [F.f5, 'active', TODAY, 7, 4, 1997, '0.15'], [F.f2, 'active', TODAY, 9, 9, 2975, '0.83'], [F.fl, 'active', TODAY, 150, 11, 3996, '0.10'],
    [F.f1, 'active', TODAY, 11, 12, 11981, '0.16'], [F.fc, 'closed', day(-8), 15, 16, 993, '0.70'], [F.f0, 'closed', day(-11), 31, 32, 499, '0.20'],
  ], 'الدورات: القائمة بالأحدث تسكيناً، ثمّ المغلقة بالأحدث إغلاقاً (FC في قاعة مؤرشفة ما زال يُوصل إليه)');
  t.same((await one(U.hallWorker, CYCLES, [])).cycles.map((c) => c.id), [F.f2, F.f1, F.fc, F.f0], 'عامل القاعة يرى دورات حقله وحده');

  const M = await makeOrg(db, { name: 'مزرعة الدورات الكثيرة', id: (n) => id(50 + n), phone: (n) => phone(50 + n), roles: [['owner', 'owner']] });
  const many = await one(M.users.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل الدورات', 'farm') returning id", [M.divisions.broiler]);
  const addCycles = async (from, to) => {
    await db.admin("insert into public.halls (org_id, division_id, site_id, name) select $1, $2, $3, 'قاعة ' || n from generate_series($4::int, $5::int) as n",
      [M.org, M.divisions.broiler, many, from, to]);
    await db.admin(`insert into public.flocks (org_id, hall_id, site_id, division_id, kind, opened_on, placed_on, placed_count, age_days_at_placement, status, closed_on)
      select h.org_id, h.id, h.site_id, h.division_id, 'broiler', date '2026-09-01', date '2026-09-01', 100, 0, 'closed',
        date '2026-09-01' + (row_number() over (order by h.id))::int % 40
      from public.halls h where h.org_id = $1 and not exists (select 1 from public.flocks f where f.hall_id = h.id)`, [M.org]);
  };
  await addCycles(1, 500);
  const at500 = await one(M.users.owner, CYCLES, []);
  await mutant(db, M.users.owner, [[FN.cycles, [["'more', v_count > 500", "'more', v_count >= 500"]]]], async ({ attempt }) => {
    const r = await attempt(M.users.owner, async (q) => (await q(CYCLES)).rows[0].v.more);
    t.eq(r.value, true, 'طفرة: «more» بـ≥ 500 يقول إنّ وراء الخمسمئة دورات وهي خمسمئة بالضبط');
  });
  await addCycles(501, 501);
  const at501 = await one(M.users.owner, CYCLES, []);
  const closedDesc = (list) => list.every((c, i) => i === 0 || list[i - 1].closed_on >= c.closed_on);
  t.same([at500.more, at500.cycles.length, at501.more, at501.cycles.length, closedDesc(at501.cycles), (await one(U.manager, CYCLES, [])).cycles.length],
    [false, 500, true, 500, true, 6], 'الحدّ: 500 دورة بالضبط بلا more، والـ501 تُقصّ إلى 500 بـmore؛ والمنشأة الثانية لا تختلط بالأولى');

  t.same(scaleIssues.slice(0, 5), [], 'كلّ رقم عشريّ نصّ بمراتب لا تزيد على مرتبة مفتاحه (الشاشات تقرؤه بها)');

  // ── ٥) الطفرات: تطبيق ساذج يكسر قاعدة فيمسكه فحصها.
  const asManager = (sql, params, pickValue) => async ({ attempt }) => attempt(U.manager, async (q) => pickValue((await q(sql, params)).rows[0].v));
  const caught = async (label, fns, run, check, user = U.manager) => {
    let r = null;
    await mutant(db, user, fns, async (ctx) => {
      r = await run(ctx);
    });
    t.ok(r?.ok && check(r.value), `طفرة: ${label} (${JSON.stringify(r?.value ?? r?.code ?? null)})`);
  };
  await caught('الأقدم تسكيناً أوّلاً يعرض في «قاعة 1» يوم 1 تشرين الثاني الفوج المغلق ذلك اليوم بدل المسكَّن فيه',
    [[FN.day, [['order by x.placed_on desc, x.id', 'order by x.placed_on, x.id']]]], asManager(HALLS_DAY, [day(-11)], (v) => flockOf(v, 'قاعة 1').id), (v) => v === F.f0);
  await caught('«يوم الإغلاق خارج الدورة» يُسقط «قاعة 4» يوم إغلاق FC',
    [[FN.day, [['and (x.closed_on is null or v_on <= x.closed_on)', 'and (x.closed_on is null or v_on < x.closed_on)']]]],
    asManager(HALLS_DAY, [day(-8)], hallNames), (v) => !v.includes('قاعة 4'));
  await caught('القاعات غير المؤرشفة وحدها تُسقط «قاعة 4» وفيها FC يوم 3 تشرين الثاني',
    [[FN.day, [['and (h.archived_at is null or q.id is not null)', 'and h.archived_at is null']]]], asManager(HALLS_DAY, [day(-9)], hallNames), (v) => !v.includes('قاعة 4'));
  await caught('بلا نطاق الحقل يرى عامل القاعة «حقل باء»',
    [[FN.day, [['where h.org_id = v_org and public.in_scope_site(h.site_id) and', 'where h.org_id = v_org and']]]],
    ({ attempt }) => attempt(U.hallWorker, async (q) => (await q(HALLS_DAY, [TODAY])).rows[0].v.sites.map((s) => s.name)), (v) => v.includes('حقل باء'));
  await caught('«قبل اليوم أو فيه» يجعل يوم أوّل تسكين قابلاً للرجوع',
    [[FN.day, [['x.placed_on < v_on', 'x.placed_on <= v_on']]]], asManager(HALLS_DAY, [day(-42)], (v) => v.prev), (v) => v === true);
  await caught('الحيّ أوّل اليوم بنافق اليوم نفسه يُنقص F2 اليوم إلى 2,975',
    [[FN.days, [['over (order by y.d rows between unbounded preceding and 1 preceding)', 'over (order by y.d rows between unbounded preceding and current row)']]]],
    asManager(HALLS_DAY, [TODAY], (v) => flockOf(v, 'قاعة 2').live_start), (v) => v === 2975);
  await caught('بلا شرط الترحيل يُعدّ الصرف الملغى 300 كغم يوم 9',
    [[FN.days, [["x.status = 'posted' and l.cost_kind = 'feed'", "l.cost_kind = 'feed'"]]]], asManager(HALLS_DAY, [day(-3)], (v) => norm(flockOf(v, 'قاعة 1').feed_given_kg)),
    (v) => v === '300');
  await caught('بلا شرط «العلف كلّ يوم» يُحسب لـF1 معامل تحويل رغم الفجوة',
    [[FN.days, [['v.feed_days > 0 and v.feed_days = v.feed_span and', 'v.feed_days > 0 and']]]], asManager(REPORT, [F.f1], (v) => v.kpis.fcr), (v) => v !== null);
  await caught('نسبة الإنتاج من الحيّ آخر اليوم تجعل يوم 11 للبيّاض 77.58',
    [[FN.days, [['then private.flock_pct(v.eggs_total, v.live_start) end', 'then private.flock_pct(v.eggs_total, v.live_end) end']]]],
    asManager(HALLS_DAY, [day(-1)], (v) => flockOf(v, 'قاعة البيّاض').hdep), (v) => v === '77.58');
  await caught('صرف اللقاح المؤشَّر يظهر في صرف يوم 8 بلا استبعاده',
    [[FN.one, [["and not exists (select 1 from public.flock_vaccinations m where m.org_id = x.org_id and m.issue_id = x.id and m.status = 'done')", '']]]],
    asManager(HALLS_DAY, [day(-4)], (v) => flockOf(v, 'قاعة 1').issues.map((x) => x.name)), (v) => v.includes('لقاح IB'));
  await caught('النافق صفر لحقل بلا جولة يوم 11 بدل null',
    [[FN.totals, [["'dead', sum((e.h -> 'flock' ->> 'dead')::bigint),", "'dead', coalesce(sum((e.h -> 'flock' ->> 'dead')::bigint), 0),"]]]],
    asManager(HALLS_DAY, [day(-1)], (v) => v.sites.find((s) => s.name === 'حقل باء').totals.dead), (v) => v === 0);
  await caught('الجولات تُعدّ بالأفواج فيقول مجموع «حقل ألف» اليوم إنّ الجولتين سُجّلتا',
    [[FN.totals, [["'rounds', (count(*) filter (where (e.h -> 'flock' ->> 'round')::boolean))::int,", "'rounds', (count(*) filter (where jsonb_typeof(e.h -> 'flock') = 'object'))::int,"]]]],
    asManager(HALLS_DAY, [TODAY], (v) => v.sites.find((s) => s.name === 'حقل ألف').totals.rounds), (v) => v === 2);
  await caught('الأسبوع بالقسمة الساذجة (العمر ÷ 7 + 1) يقصّ أسبوع F1 الأوّل إلى 7 أيّام',
    [[FN.report, [['greatest(1, div(r.age + 6, 7))::int', '(div(r.age, 7) + 1)::int']]]], asManager(REPORT, [F.f1], (v) => v.weeks[0].days), (v) => v === 7);
  await caught('الأسبوع بالقسمة الساذجة يقصّ أسبوع F2 (عمر 1) إلى 6 أيّام',
    [[FN.report, [['greatest(1, div(r.age + 6, 7))::int', '(div(r.age, 7) + 1)::int']]]], asManager(REPORT, [F.f2], (v) => v.weeks[0].days), (v) => v === 6);
  await caught('EPEF بلا ×10 (الوزن بالغرام كأنّه بالكيلو مضروباً في 100) يصير 1,759',
    [[FN.report, [['10 * k.age * k.fcr', 'k.age * k.fcr']]]], asManager(REPORT, [F.f2], (v) => v.kpis.epef), (v) => v === '1759');
  await caught('المغلقة بالأقدم إغلاقاً تقدّم F0 على FC',
    [[FN.cycles, [['x.closed_on desc, x.placed_on desc', 'x.closed_on, x.placed_on desc']]]], asManager(CYCLES, [], (v) => v.cycles.map((c) => c.id).slice(-2)),
    (v) => v[0] === F.f0 && v[1] === F.fc);

  // ── ضوابط النموذج: طفرة في القارئ تُفشل المقارنة بالنموذج نفسها (مقارنة لا تقدر أن تفشل ليست فحصاً).
  await caught('ضابط النموذج: الصرف الملغى معدوداً يُفشل مقارنة halls_day بالنموذج من يومه إلى اليوم (4 أيّام)',
    [[FN.days, [["x.status = 'posted' and l.cost_kind = 'feed'", "l.cost_kind = 'feed'"]]]],
    ({ attempt }) => attempt(U.manager, async (q) => {
      let differ = 0;
      for (let on = day(-12); on <= TODAY; on = addDays(on, 1)) {
        if (!same(withoutLists((await q(HALLS_DAY, [on])).rows[0].v), hallsDayModel(raw, on, TODAY, ALL))) differ += 1;
      }
      return differ;
    }), (v) => v === 4);
  await caught('ضابط النموذج: الباقي بإشارة معكوسة (المأكول − النازل) في أيّام التقرير يُفشل مقارنته بالنموذج',
    [[FN.report, [["'feed_left_kg', (r.given_cum_kg - r.feed_cum_kg)::text", "'feed_left_kg', (r.feed_cum_kg - r.given_cum_kg)::text"]]]],
    asManager(REPORT, [F.f2], (v) => same(v.days, daysOf(raw.flocks.get(F.f2), TODAY).map((d) => pick(d.view, DAY_KEYS)))), (v) => v === false);
  await caught('ضابط النموذج: الحيّ بلا النافق في قائمة الدورات يُفشل مقارنتها بالنموذج',
    [[FN.cycles, [["'live', c.placed_count - b.gone", "'live', c.placed_count"]]]],
    asManager(CYCLES, [], (v) => same(v, { today: TODAY, more: false, cycles: cyclesModel(raw, TODAY, ALL) })), (v) => v === false);

  // ── طفرات سطور العلف بلا وزن (مراجعة 0027): كلّ تطبيق ساذج يُسقط السطر من الأيّام بعده أو من المجاميع يمسكه فحص في ٢ أو ٣ب.
  const CUM = 'sum(y.given_unweighed) over c as given_cum_unweighed';
  await caught('العدد التراكميّ = عدد اليوم (عيب R27-N1) يُسقط كيس F5 من يوم 11 فتراكمه 0',
    [[FN.days, [[CUM, 'y.given_unweighed as given_cum_unweighed']]]], asManager(HALLS_DAY, [day(-1)], (v) => flockOf(v, 'قاعة 5').feed_given_cum_unweighed), (v) => v === 0);
  await caught('التراكم حتى أمس (بلا يومه) يجعل تراكم F5 يوم كيسها نفسه 0 في أيّام الدورة',
    [[FN.days, [[CUM, 'coalesce(sum(y.given_unweighed) over (order by y.d rows between unbounded preceding and 1 preceding), 0) as given_cum_unweighed']]]],
    asManager(REPORT, [F.f5], (v) => reportDayOf(v, -3).feed_given_cum_unweighed), (v) => v === 0);
  await caught('بلا شرط الترحيل يُعدّ كيس F5 الملغى يوم 10 في عدد يومه وتراكمه',
    [[FN.days, [["x.status = 'posted' and l.cost_kind = 'feed'", "l.cost_kind = 'feed'"]]]], asManager(HALLS_DAY, [day(-2)], (v) => unweighedOf(flockOf(v, 'قاعة 5'))),
    (v) => same(v, [1, 2]));
  await caught('مجموع الحقل بعدّ الأفواج لا بجمع سطورها يقول يوم 11 إنّ في «حقل ألف» سطرين بلا وزن وفيه ثلاثة',
    [[FN.totals, [["coalesce(sum((e.h -> 'flock' ->> 'feed_given_unweighed')::int), 0)::int", "count(e.h -> 'flock' ->> 'feed_given_unweighed')::int"]]]],
    asManager(HALLS_DAY, [day(-1)], (v) => v.sites.find((s) => s.name === 'حقل ألف').totals.feed_given_unweighed), (v) => v === 2);
  await caught('مجموع الحقل من العدد التراكميّ يقول اليوم إنّ في «حقل ألف» أربعة سطور بلا وزن وفيه سطر واحد',
    [[FN.totals, [["sum((e.h -> 'flock' ->> 'feed_given_unweighed')::int)", "sum((e.h -> 'flock' ->> 'feed_given_cum_unweighed')::int)"]]]],
    asManager(HALLS_DAY, [TODAY], (v) => v.sites.find((s) => s.name === 'حقل ألف').totals.feed_given_unweighed), (v) => v === 4);
  await caught('بلا coalesce يصير مجموع يوم بلا أفواج (28 أيلول) null لا صفراً',
    [[FN.totals, [["coalesce(sum((e.h -> 'flock' ->> 'feed_given_unweighed')::int), 0)::int", "sum((e.h -> 'flock' ->> 'feed_given_unweighed')::int)::int"]]]],
    asManager(HALLS_DAY, [day(-45)], (v) => v.totals.feed_given_unweighed), (v) => v === null);
  await caught('ضابط النموذج: العدد التراكميّ بلا تراكم يُفشل مقارنة halls_day بالنموذج في الأيّام التي يسبقها سطر بلا وزن (10 و11 واليوم)',
    [[FN.days, [[CUM, 'y.given_unweighed as given_cum_unweighed']]]],
    ({ attempt }) => attempt(U.manager, async (q) => {
      const differ = [];
      for (let on = day(-12); on <= TODAY; on = addDays(on, 1)) {
        if (!same(withoutLists((await q(HALLS_DAY, [on])).rows[0].v), hallsDayModel(raw, on, TODAY, ALL))) differ.push(on);
      }
      return differ;
    }), (v) => same(v, [day(-2), day(-1), TODAY]));
  await caught('ضابط النموذج: عدد اليوم مكان التراكميّ في أيّام التقرير يُفشل مقارنتها بالنموذج',
    [[FN.report, [["'feed_given_cum_unweighed', r.given_cum_unweighed", "'feed_given_cum_unweighed', r.given_unweighed"]]]],
    asManager(REPORT, [F.f5], (v) => same(v.days, daysOf(raw.flocks.get(F.f5), TODAY).map((d) => pick(d.view, DAY_KEYS)))), (v) => v === false);
  await caught('ضابط النموذج: مجموع السطور بلا وزن بعدّ الأفواج يُفشل مقارنة halls_day بالنموذج يوم 11',
    [[FN.totals, [["coalesce(sum((e.h -> 'flock' ->> 'feed_given_unweighed')::int), 0)::int", "count(e.h -> 'flock' ->> 'feed_given_unweighed')::int"]]]],
    asManager(HALLS_DAY, [day(-1)], (v) => same(withoutLists(v), hallsDayModel(raw, day(-1), TODAY, ALL))), (v) => v === false);

  // ── ضوابط النموذج للعلف في أيّام بلا جولة (R27-RR1): تطبيق ساذج يربط النازل بصفّ الجولة يُسقط ما صُرف في يوم بلا جولة، فتفشل مقارنة منشأة الصرف بلا
  // جولة بالنموذج (في «مزرعة التقارير» كلّ صرف نزل يوم جولة، فما كانت تقدر أن تفشل).
  const viaQ = (q) => async (sql, params) => (await q(sql, params)).rows[0].v;
  /** أيّام منشأة الصرف بلا جولة التي يخالف فيها halls_day النموذج (المقارنة نفسها في ١). */
  const nDiffers = async (get) => {
    const differ = [];
    for (let on = day(-7); on <= TODAY; on = addDays(on, 1)) if (!same(withoutLists(await get(HALLS_DAY, [on])), hallsDayModel(rawN, on, TODAY, ALL))) differ.push(on);
    return differ;
  };
  /** الأجزاء المخالفة للنموذج في تقرير الدورة، ومواضع مجاميع الأيّام المخالفة للمفاتيح القديمة وflock_feed [من الأيّام، المتوقّع] (الفحص نفسه في ٣). */
  const cycleGaps = async (get, flockId) => {
    const { parts, totals, old } = await cycleCheck(get, rawN, flockId);
    return [parts, totals.map((x, i) => [x, old[i]]).filter(([x, y]) => canon(x) !== canon(y))];
  };
  await caught('ضابط النموذج: النازل بيوم الجولة (given على r.on_date لا g.d) يُسقط ما صُرف بلا جولة، فتفشل مقارنة halls_day بالنموذج من تسكين «ن1» إلى اليوم، وأيّام تقريرَي «ن1» و«ن2» ومؤشّرات «ن1»، ومجاميع الأيّام مقابل feed وflock_feed (الكيلو والباقي والسطور بلا وزن)',
    [[FN.days, [['left join given i on i.d = g.d', 'left join given i on i.d = r.on_date']]]],
    ({ attempt }) => attempt(N.users.manager, async (q) => [await nDiffers(viaQ(q)), await cycleGaps(viaQ(q), NF.na), await cycleGaps(viaQ(q), NF.nb)]),
    (v) => same(v, [NA_DAYS.map((o) => day(o)), [['days', 'kpis'], [['50', '400'], ['-150', '200'], [0, 4], [0, 4]]], [['days'], [[0, 1], [0, 1]]]]), N.users.manager);
  await caught('ضابط النموذج: عدد السطور بلا وزن صفراً في يوم بلا جولة (report_day) يُفشل مقارنة halls_day بالنموذج في أيّام الصرف بلا جولة: تسكين «ن1» ويوم 9 واليوم',
    [[FN.one, [["'feed_given_unweighed', r.given_unweighed", "'feed_given_unweighed', case when r.has_round then r.given_unweighed else 0 end"]]]],
    ({ attempt }) => attempt(N.users.manager, async (q) => nDiffers(viaQ(q))), (v) => same(v, [day(-6), day(-3), TODAY]), N.users.manager);

  // ── عيّنات القاعدة الحقيقية للشاشات: REPORTS_SAMPLES_OUT=1.
  if (process.env.REPORTS_SAMPLES_OUT) {
    const samples = {
      _note: 'عيّنات القاعدة الحقيقية (supabase/tests/reports.test.mjs بـREPORTS_SAMPLES_OUT=1)؛ المحلّلات الحقيقية تقرؤها في فحوص الشاشات.',
      halls_day: today,
      halls_day_layer: responses[`layerWorker:${day(-1)}`],
      halls_day_closed: responses[`manager:${day(-9)}`],
      flock_cycle_report: reports.f2,
      flock_cycle_report_no_money: await one(U.hallWorker, REPORT, [F.f2]),
      flock_cycle_report_gaps: reports.f1,
      flock_cycle_report_layer: reports.fl,
      flock_cycle_report_closed: reports.fc,
      flock_cycles: cycles,
    };
    writeFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'reports-0027.json'), JSON.stringify(samples, null, 1) + '\n');
  }
}
