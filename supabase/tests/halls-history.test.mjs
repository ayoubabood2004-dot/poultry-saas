// «من أوّل ما بدينا» (0031، العقد docs/plans/0031/contract-0031.md): halls_history وملاحظة اليوم (set_halls_note) وثابتها verify_halls_history.
// البذرة تمتدّ شهرين (تشرين الأوّل وتشرين الثاني 2026) يوماً بيوم بقاعدة الأيّام السبعة (setToday): تسكينات في أيّام مختلفة، وجولات بنافق ومستبعد وعلف
// (ومنها جولة بلا علف وجولة بيّاض بلا بيض)، وصرف علف موزون وسطر بلا وزن وأكياس بوزنها، وتذكرة قبّان وفاتورتها، وفرق عدّ، وتأشير لقاح، ووزن عيّنة،
// ودورتان مغلقتان (وقاعة إحداهما مؤرشفة)، وفجوة أيّام بلا فوج لحم، وفوج بيّاض ببيض؛ وفي حقل ثانٍ فوج يراه مدير محصور بحقله.
// الفحوص: (١) كلّ يوم من أوّل تشرين الأوّل إلى اليوم ولكلّ نوع ولكلّ هويّة (المالك، والمدير المحصور بحقل، وعامل الحقول): صفّ اليوم = مجاميع halls_day لقاعات
// النوع من private.halls_day_totals نفسها حرفاً (والبيض ونسبة الإنتاج من أفواج اليوم)؛ (٢) حساب الأشهر و«منذ البداية» وقيم مكتوبة باليد؛ (٣) start وprev
// وnext وfuture_month والشهر قبل البداية والمنشأة الفارغة (kinds = [])؛ (٤) الأحداث بترتيبها؛ (٥) النطاق؛ (٦) الملاحظة (الصلاحية والشرط والإعادة بلا نسخة
// والحدّ والمسح بلا حذف واليوم القادم)؛ (٧) طفرات داخل معاملة صاحب الجداول ترجع: كلّ قاعدة مكسورة يمسكها فحصها، والثابت يمسك سطر شهر وسطر بداية مكسورين؛
// (٨) التراجع داخل معاملة ترجع: يرفض بصوت والملاحظات قائمة، ويكمل بلاها فيرجّع private.actions كما في 0022 حرفاً. منشأة هذا الملفّ وحدها: المعرّفات
// d3131000 والهواتف 96477031310 (ومنشأة النقل بين الدورات منها: المعرّفات 201 وما بعدها والهواتف 71 وما بعدها). وعيّنات القاعدة الحقيقية للشاشات: HISTORY_SAMPLES_OUT=1 يكتب scripts/tests/fixtures/halls-history-0031.json.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, canon, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { postedOpening } from './stock-kit.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..');
const FIXTURE = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'halls-history-0031.json');
const TODAY = '2026-11-17';
const DAY_MS = 86400000;
const addDays = (on, n) => new Date(Date.parse(`${on}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const day = (n) => addDays(TODAY, n);
const between = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS);
const monthOf = (on) => `${on.slice(0, 7)}-01`;
const id = (n) => `d3131000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477031310${String(n).padStart(2, '0')}`;

const HISTORY = 'select public.halls_history($1) as v';
const NOTE = 'select public.set_halls_note($1, $2, $3) as v';
const FN = { history: 'public.halls_history(date)', note: 'public.set_halls_note(date, text, bigint)' };
const KINDS = ['broiler', 'layer'];
const DAY_KEYS = ['on', 'flocks', 'rounds', 'rounds_expected', 'placed', 'live_start', 'dead', 'culled', 'sold', 'count_diff', 'live_end', 'feed_kg', 'given_kg',
  'given_unweighed', 'eggs_total', 'eggs_broken', 'hdep'];
const MONTH_KEYS = ['month', 'days', 'placed', 'dead', 'culled', 'sold', 'count_diff', 'feed_kg', 'given_kg', 'given_unweighed', 'eggs_total', 'eggs_broken', 'hdep',
  'live_end', 'opened', 'closed'];
const TOTAL_KEYS = ['days', 'placed', 'dead', 'culled', 'sold', 'count_diff', 'feed_kg', 'given_kg', 'given_unweighed', 'eggs_total', 'eggs_broken', 'hdep', 'live_now',
  'opened', 'closed', 'halls'];
const KIND_KEYS = ['kind', 'start', 'days', 'months', 'total', 'events'];
const TOP_KEYS = ['today', 'month', 'prev', 'next', 'kinds', 'notes'];

/** الكيلو بالفلس الصحيح: نصّ عشريّ ← BigInt بالآلاف (لا Number). */
const milli = (v) => {
  if (v === null || v === undefined) return null;
  const [whole, frac = ''] = String(v).split('.');
  const sign = whole.startsWith('-') ? -1n : 1n;
  return sign * (BigInt(whole.replace('-', '')) * 1000n + BigInt((frac + '000').slice(0, 3)));
};
const sumMilli = (rows, key) => rows.reduce((acc, r) => acc + (milli(r[key]) ?? 0n), 0n);
/** الآلاف ← نصّ بثلاث مراتب ("-1.500"). */
const kgText = (m) => `${m < 0n ? '-' : ''}${(m < 0n ? -m : m) / 1000n}.${String((m < 0n ? -m : m) % 1000n).padStart(3, '0')}`;
const sumInt = (rows, key) => rows.reduce((acc, r) => acc + BigInt(r[key] ?? 0), 0n);
const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v ?? null);
const keysOf = (o) => Object.keys(o ?? {}).sort();

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
    name: 'مزرعة السجلّ',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['accountant', 'accountant'],
      ['worker', 'hall_worker', ['broiler']],
    ],
  });
  const { users: U, divisions: D } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const at = (on, fn) => db.setToday(on, fn);
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [G.org])).rows.map((r) => [r.kind, r.id]));

  // ── الحقول والقاعات والمواد ─────────────────────────────────────────────────────────────────────────────────────────
  const site = (division, name) => one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, $2, 'farm') returning id", [D[division], name]);
  const S = { a: await site('broiler', 'حقل ألف'), b: await site('broiler', 'حقل باء'), l: await site('layer', 'حقل البيض') };
  const hall = (siteId, name) => one(U.owner, 'insert into public.halls (site_id, name) values ($1, $2) returning id', [siteId, name]);
  const H = { a1: await hall(S.a, 'قاعة 1'), a2: await hall(S.a, 'قاعة 2'), a3: await hall(S.a, 'قاعة 3'), b1: await hall(S.b, 'قاعة 1'), l1: await hall(S.l, 'قاعة البيّاض') };
  // مدير محصور بـ«حقل باء» (النطاق).
  await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())', [id(9), phone(9)]);
  const siteMember = await one(U.owner, 'select public.add_member_v2($1, $2, $3, $4::uuid[], $5::uuid[], $6::uuid[])', [`0${phone(9).slice(3)}`, 'manager', 'مدير حقل باء', [], [S.b], []]);
  await db.acceptInvite(U.owner, id(9), siteMember);
  U.siteManager = id(9);

  const item = (name, kind, unit, piece = null) => one(U.owner, 'insert into public.items (name, kind, base_unit, piece_mass_kg) values ($1, $2, $3, $4) returning id', [name, kind, unit, piece]);
  const I = { feed: await item('علف السجلّ', 'feed', 'kg'), bags: await item('علف بالأكياس', 'feed', 'pc', 50), loose: await item('علف بلا وزن', 'feed', 'pc') };
  await postedOpening(db, U.owner, W.feed, day(-50), [{ item: I.feed, qty: 20000, value: '10000000.00' }, { item: I.bags, qty: 100, value: '1000000.00' },
    { item: I.loose, qty: 20, value: '200000.00' }]);
  const V = { nd: id(101) };
  await one(U.manager, 'select public.save_vaccine($1, $2, null, null) as v', [V.nd, 'نيوكاسل']);
  await one(U.manager, 'select public.save_vaccine_program($1, $2, $3::jsonb, 0) as v',
    ['broiler', 42, JSON.stringify([{ vaccine_id: V.nd, age_day: 4 }, { vaccine_id: V.nd, age_day: 14 }])]);
  const trader = await one(U.owner, "insert into public.parties (name, is_customer) values ('تاجر السجلّ', true) returning id");

  // ── الأدوات ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const place = async (hallId, on, count, age0 = 0) => (await one(U.manager, 'select public.open_flock($1, $2, $3, $4, null, $5) as v', [hallId, on, count, age0, uid()])).flock_id;
  const issue = (flock, itemId, qty, on) => one(U.manager, 'select public.record_flock_issue($1, $2, $3, $4, $5, $6, $7, $8) as v', [uid(), uid(), uid(), flock, itemId, qty, on, W.feed]);
  const round = async (flock, on, dead, culled, feed, eggs = null) => {
    const v = await one(U.manager, 'select public.save_flock_day($1, $2, $3, $4, $5, null, null, null, $6, $7, $8, null, null, $9, false) as v',
      [flock, on, dead, culled, feed, eggs?.[0] ?? null, eggs?.[1] ?? null, eggs?.[2] ?? null, uid()]);
    if (v.status !== 'saved') throw new Error(`جولة ${on}: ${JSON.stringify(v)}`);
  };
  const weigh = async (flock, on, count, avg) => {
    const v = await one(U.manager, 'select public.record_flock_weight($1, $2, $3, $4, $5) as v', [flock, on, count, avg, uid()]);
    if (v.status !== 'saved') throw new Error(`وزن ${on}: ${JSON.stringify(v)}`);
  };
  const vaccinate = (flock, on, ageDay) => one(U.manager, 'select public.give_to_flocks($1, $2, $3::jsonb) as v',
    [uid(), on, JSON.stringify([{ kind: 'vaccination', flock_id: flock, id: uid(), vaccine_id: V.nd, age_day: ageDay }])]);
  const live = async (flock) => Number((await one(U.manager, 'select public.flock_sales($1) as v', [flock])).live);
  /** تذكرة قبّان مكتملة بوقفة واحدة في «حقل ألف» (الفارغ 7,000 مع الأقفاص) وفاتورتها من المحاسب. */
  const sell = async (hallId, on, birds, net) => {
    const ticketId = uid();
    const data = { site_id: S.a, on_date: on, method: 'scale', empty_kg: '7000', empty_with_crates: true, crate_kg: null,
      stops: [{ id: uid(), hall_id: hallId, birds, crates: Math.ceil(birds / 10), gross_kg: String(7000 + net), weighings: [] }] };
    const saved = await one(U.worker, 'select public.save_weigh_ticket($1, $2, $3::jsonb) as v', [ticketId, null, JSON.stringify(data)]);
    if (saved.status !== 'saved') throw new Error(`تذكرة: ${JSON.stringify(saved)}`);
    const finished = await one(U.worker, 'select public.finish_weigh_ticket($1, $2, $3) as v', [uid(), ticketId, 1]);
    return one(U.accountant, 'select public.record_bird_sale($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as v',
      [uid(), uid(), ticketId, finished.version, trader, '2750.00', '0', '0', null, null]);
  };
  const close = async (flock, on) => {
    const form = await one(U.manager, 'select public.flock_close_form($1) as v', [flock]);
    return one(U.manager, "select public.close_flock($1, $2, $3, $4, $5, $6, $7::jsonb, 'نهاية الدورة', '[]'::jsonb, null, $8) as v",
      [uid(), uid(), flock, on, form.flock.live, form.sales.birds, JSON.stringify(form.items.map((i) => ({ item_id: i.item_id, qty: i.pool_qty }))), form.plan]);
  };

  // ── البذرة يوماً بيوم ─────────────────────────────────────────────────────────────────────────────────────────────
  // تشرين الأوّل: F0 في «قاعة 1» (2 ت1، 1,000 طير) بصرف 500 كغم وجولات (3 و5 و8 ت1) ووزن وتأشير نيوكاسل (6 ت1) وبيع 400 طير بتذكرة (8 ت1) ويُغلق 10 ت1؛
  // FX في «قاعة 3» (4 ت1، 500 طير) بجولة ويُغلق 9 ت1 ثمّ تُؤرشف القاعة؛ ثمّ لا فوج لحم من 11 إلى 17 ت1 (فجوة)؛ F2 في «قاعة 2» (18 ت1، 2,000) بصرفين
  // وجولات في الشهرين وتأشير (2 ت2) وفرق عدّ −5 (5 ت2) ووزن (10 ت2)؛ وFL بيّاض في «قاعة البيّاض» (25 ت1، 3,000 بعمر 140) ببيض في الشهرين وجولة بلا بيض.
  // تشرين الثاني: F1 في «قاعة 1» (3 ت2، 1,200) بسطر علف بلا وزن؛ FB في «حقل باء» (7 ت2، 1,500) بأكياس بوزنها (4 × 50 كغم).
  const F = {};
  await at(day(-44), async () => {
    F.f0 = await place(H.a1, day(-46), 1000);
    await issue(F.f0, I.feed, '500', day(-46));
    await round(F.f0, day(-45), 5, 1, '50');
    F.fx = await place(H.a3, day(-44), 500);
    await round(F.fx, day(-44), 2, 0, '20');
  });
  await at(day(-40), async () => {
    await round(F.f0, day(-43), 3, 0, '60');
    await weigh(F.f0, day(-42), 50, '150.0');
    await vaccinate(F.f0, day(-42), 4);
    await sell(H.a1, day(-40), 400, 800);
    await round(F.f0, day(-40), 1, 0, '70');
  });
  await at(day(-39), async () => {
    await close(F.fx, day(-39));
  });
  await at(day(-38), async () => {
    await close(F.f0, day(-38));
    await one(U.owner, 'update public.halls set archived_at = now() where id = $1 returning id', [H.a3]);
  });
  await at(day(-28), async () => {
    F.f2 = await place(H.a2, day(-30), 2000);
    await issue(F.f2, I.feed, '1000', day(-30));
    await round(F.f2, day(-28), 10, 2, '150');
  });
  await at(day(-22), async () => {
    F.fl = await place(H.l1, day(-23), 3000, 140);
    await issue(F.fl, I.feed, '2000', day(-23));
    await round(F.fl, day(-22), 3, 0, '300', [2500, 10, 5]);
  });
  await at(day(-16), async () => {
    await round(F.f2, day(-17), 4, 0, '200');
    await round(F.f2, day(-16), 5, 1, '210');
    await round(F.fl, day(-17), 2, 0, '310', [2600, 0, 8]);
    await round(F.fl, day(-16), 1, 0, null, [2550, 5, 3]);
    await issue(F.f2, I.feed, '1500', day(-16));
  });
  await at(day(-12), async () => {
    await vaccinate(F.f2, day(-15), 14);
    F.f1 = await place(H.a1, day(-14), 1200);
    await issue(F.f1, I.loose, '1', day(-14));
    await round(F.f1, day(-13), 6, 0, '40');
    await one(U.manager, "select public.record_flock_count_adjust($1, $2, $3, $4, -5, 'العدد الفعليّ أقلّ', $5) as v", [uid(), uid(), F.f2, day(-12), await live(F.f2)]);
  });
  await at(day(-7), async () => {
    F.fb = await place(H.b1, day(-10), 1500);
    await round(F.fb, day(-9), 7, 1, '90');
    await issue(F.fb, I.bags, '4', day(-9));
    await round(F.f2, day(-7), 3, 0, '260');
    await weigh(F.f2, day(-7), 40, '450.5');
  });
  await round(F.fl, day(-2), 2, 0, '320');
  await round(F.fb, day(-1), 2, 0, '100');
  await round(F.f2, day(0), 1, 0, '280');
  await round(F.f1, day(0), 3, 1, '60');

  // منشأة بلا فوج (kinds = []).
  const E = await makeOrg(db, { name: 'مزرعة بلا قاعات', id: (n) => id(50 + n), phone: (n) => phone(50 + n), roles: [['owner', 'owner']] });

  const history = (user, month) => one(user, HISTORY, [month]);
  const months = [day(-47), day(0)].map(monthOf);
  const H_OWNER = Object.fromEntries(await Promise.all(months.map(async (m) => [m, await history(U.owner, m)])));
  const kindOf = (v, kind) => v.kinds.find((k) => k.kind === kind);

  // ── ١) كلّ يوم = مجاميع halls_day لقاعات النوع، لكلّ هويّة ────────────────────────────────────────────────────────────
  /** صفّ اليوم المتوقَّع لكلّ نوع من halls_day(اليوم) بهويّة المستخدم: المجاميع من private.halls_day_totals نفسها، والبيض من أفواج النوع. */
  const expectedDays = async (user, on) => {
    const hd = await one(user, 'select public.halls_day($1) as v', [on]);
    const out = {};
    for (const kind of KINDS) {
      const halls = hd.sites.flatMap((s) => s.halls).filter((h) => h.kind === kind);
      const flocks = halls.map((h) => h.flock).filter(Boolean);
      const egged = flocks.filter((f) => f.eggs_total !== null && f.eggs_total !== undefined);
      const eggs = egged.length ? egged.reduce((a, f) => a + Number(f.eggs_total), 0) : null;
      const broken = flocks.some((f) => f.eggs_broken !== null && f.eggs_broken !== undefined) ? flocks.reduce((a, f) => a + Number(f.eggs_broken ?? 0), 0) : null;
      const eggLive = egged.reduce((a, f) => a + Number(f.live_start), 0);
      const [tot, hdep] = await db.asOwner(async (q) => [
        (await q('select private.halls_day_totals($1::jsonb) as v', [JSON.stringify(halls)])).rows[0].v,
        (await q('select private.flock_pct($1::numeric, $2::numeric) as v', [eggs, egged.length ? eggLive : null])).rows[0].v,
      ]);
      out[kind] = {
        on, flocks: tot.flocks, rounds: tot.rounds, rounds_expected: tot.rounds_expected,
        placed: flocks.filter((f) => f.placed_on === on).reduce((a, f) => a + Number(f.placed_count), 0),
        live_start: tot.live_start, dead: tot.dead, culled: tot.culled, sold: tot.sold, count_diff: tot.count_diff, live_end: tot.live_end,
        // النازل من المخزن: نازل halls_day ناقص العلف المنقول من الدورة السابقة (يُعدّ يوم صُرف أوّل مرّة؛ مراجعة 0031 M1).
        feed_kg: tot.feed_eaten_kg, given_kg: kgText(milli(tot.feed_given_kg) - flocks.reduce((a, f) => a + (milli(f.feed_carry_in_kg) ?? 0n), 0n)),
        given_unweighed: tot.feed_given_unweighed,
        eggs_total: kind === 'layer' ? eggs : null, eggs_broken: kind === 'layer' ? broken : null, hdep: kind === 'layer' ? hdep : null,
      };
    }
    return out;
  };
  /** صفّ يوم من halls_history مقابل المتوقَّع: الأعداد بقيمها، والكيلو بالآلاف (المراتب الثلاث شكلٌ لا قيمة). */
  const dayDiff = (got, want) => {
    const problems = [];
    for (const key of DAY_KEYS) {
      const a = ['feed_kg', 'given_kg'].includes(key) ? milli(got[key]) : got[key];
      const b = ['feed_kg', 'given_kg'].includes(key) ? milli(want[key]) : want[key];
      if (String(a) !== String(b)) problems.push(`${key}: ${got[key]} ≠ ${want[key]}`);
    }
    return problems;
  };
  await section('كلّ يوم = halls_day', async () => {
    for (const [who, user] of [['owner', U.owner], ['siteManager', U.siteManager], ['worker', U.worker]]) {
      const byMonth = who === 'owner' ? H_OWNER : Object.fromEntries(await Promise.all(months.map(async (m) => [m, await history(user, m)])));
      const mismatches = [];
      let compared = 0;
      for (let on = day(-47); on <= TODAY; on = addDays(on, 1)) {
        const want = await expectedDays(user, on);
        for (const kind of KINDS) {
          const k = kindOf(byMonth[monthOf(on)], kind);
          const row = k?.days.find((d) => d.on === on);
          if (!k || on < k.start) {
            if (row) mismatches.push(`${who} ${kind} ${on}: صفّ قبل البداية`);
            if (want[kind].flocks !== 0) mismatches.push(`${who} ${kind} ${on}: في halls_day ${want[kind].flocks} فوج ولا صفّ في السجلّ`);
            continue;
          }
          if (!row) {
            mismatches.push(`${who} ${kind} ${on}: لا صفّ`);
            continue;
          }
          compared += 1;
          const diff = dayDiff(row, want[kind]);
          if (diff.length) mismatches.push(`${who} ${kind} ${on}: ${diff.join('، ')}`);
          if (keysOf(row).join() !== [...DAY_KEYS].sort().join()) mismatches.push(`${who} ${kind} ${on}: مفاتيح ${keysOf(row).join()}`);
        }
      }
      t.same(mismatches.slice(0, 6), [], `${who}: صفّ كلّ يوم في halls_history = مجاميع halls_day لقاعات نوعه (${compared} يوم نوع)`);
      if (who === 'owner') t.eq(compared, 47 + 24, `المالك: أيّام اللاحم من 2 ت1 (47) وأيّام البيّاض من 25 ت1 (24)`);
      // 0034 («الكلّ مثل المالك»): صفوف النطاق لا تحجب، فالمدير بصفّ حقل باء وعامل الحقول بصفّ وحدة اللحم يرون أيّام المالك نفسها.
      if (who === 'siteManager') t.eq(compared, 47 + 24, 'المدير بصفّ نطاق حقل باء: أيّام اللاحم والبيّاض كالمالك');
      if (who === 'worker') t.eq(compared, 47 + 24, 'عامل الحقول بصفّ نطاق اللحم: أيّام اللاحم والبيّاض كالمالك');
    }
  });

  // ── ٢) الأشهر و«منذ البداية» ─────────────────────────────────────────────────────────────────────────────────────────
  await section('الأشهر وسطر البداية', async () => {
    const problems = [];
    for (const kind of KINDS) {
      const all = months.map((m) => kindOf(H_OWNER[m], kind));
      const monthRows = all[1].months;
      same(all[0].months, monthRows, `${kind}: الأشهر نفسها مهما كان الشهر المطلوب`);
      same(all[0].total, all[1].total, `${kind}: سطر البداية نفسه مهما كان الشهر المطلوب`);
      for (const [i, m] of months.entries()) {
        const days = all[i].days;
        const row = monthRows.find((x) => x.month === m);
        if (!days.length) {
          if (row) problems.push(`${kind} ${m}: سطر شهر بلا أيّام`);
          continue;
        }
        const want = {
          days: BigInt(days.length), placed: sumInt(days, 'placed'), dead: sumInt(days, 'dead'), culled: sumInt(days, 'culled'), sold: sumInt(days, 'sold'),
          count_diff: sumInt(days, 'count_diff'), given_unweighed: sumInt(days, 'given_unweighed'), live_end: BigInt(days.at(-1).live_end),
        };
        for (const [key, value] of Object.entries(want)) if (BigInt(row[key]) !== value) problems.push(`${kind} ${m} ${key}: ${row[key]} ≠ ${value}`);
        for (const key of ['feed_kg', 'given_kg']) if (milli(row[key]) !== sumMilli(days, key)) problems.push(`${kind} ${m} ${key}: ${row[key]}`);
        for (const key of ['eggs_total', 'eggs_broken']) {
          const expected = kind === 'layer' ? sumInt(days, key) : null;
          if ((row[key] === null ? null : BigInt(row[key])) !== expected) problems.push(`${kind} ${m} ${key}: ${row[key]}`);
        }
      }
      const total = all[1].total;
      for (const key of ['days', 'placed', 'dead', 'culled', 'sold', 'count_diff', 'given_unweighed', 'opened', 'closed']) {
        if (BigInt(total[key]) !== sumInt(monthRows, key)) problems.push(`${kind} total ${key}: ${total[key]}`);
      }
      for (const key of ['feed_kg', 'given_kg']) if (milli(total[key]) !== sumMilli(monthRows, key)) problems.push(`${kind} total ${key}: ${total[key]}`);
      if (total.live_now !== monthRows.at(-1).live_end) problems.push(`${kind} live_now ${total.live_now}`);
      if (total.days !== between(TODAY, all[1].start) + 1) problems.push(`${kind} days ${total.days}`);
      if (keysOf(total).join() !== [...TOTAL_KEYS].sort().join()) problems.push(`${kind} مفاتيح البداية ${keysOf(total).join()}`);
      for (const row of monthRows) if (keysOf(row).join() !== [...MONTH_KEYS].sort().join()) problems.push(`${kind} مفاتيح الشهر ${keysOf(row).join()}`);
      if (keysOf(all[1]).join() !== [...KIND_KEYS].sort().join()) problems.push(`${kind} مفاتيح النوع ${keysOf(all[1]).join()}`);
    }
    t.same(problems, [], 'أيّام كلّ شهر = سطره، والأشهر = «منذ البداية»، والحيّ الآن = حيّ آخر يوم، والأيّام = من البداية إلى اليوم');

    // باليد. اللاحم: المسكَّن 1,000 + 500 + 2,000 + 1,200 + 1,500 = 6,200 في خمسة أفواج، والمغلق اثنان (F0 وFX في ت1)، وأربع قاعات؛ النافق
    // ت1 5 + 3 + 1 (F0) + 2 (FX) + 10 + 4 (F2) = 25 وت2 5 + 3 + 1 (F2) + 6 + 3 (F1) + 7 + 2 (FB) = 27؛ والمستبعد ت1 1 + 2 = 3 وت2 1 + 1 + 1 = 3؛ والمباع 400
    // (8 ت1). وفرق العدّ: −5 لـF2 (5 ت2)، وعند الإغلاق −الحيّ: FX 500 − 2 = 498، وF0 1,000 − 9 − 1 − 400 = 590.
    const broiler = kindOf(H_OWNER[months[1]], 'broiler');
    same(broiler.months.map((m) => [m.month, m.days, m.placed, m.dead, m.culled, m.sold, m.count_diff, m.opened, m.closed]),
      [['2026-10-01', 30, 3500, 25, 3, 400, -1088, 3, 2], ['2026-11-01', 17, 2700, 27, 3, 0, -5, 2, 0]], 'اللاحم: سطرا الشهرين باليد');
    // المأكول: ت1 50 + 20 + 60 + 70 + 150 + 200 = 550، وت2 210 + 40 + 90 + 260 + 100 + 280 + 60 = 1,040؛ والنازل: ت1 500 + 1,000 = 1,500، وت2 1,500 + 200
    // (4 أكياس × 50) = 1,700 وسطر بلا وزن.
    same(broiler.months.map((m) => [m.feed_kg, m.given_kg, m.given_unweighed, m.eggs_total, m.hdep]),
      [['550.000', '1500.000', 0, null, null], ['1040.000', '1700.000', 1, null, null]], 'اللاحم: المأكول والنازل والبيض باليد');
    // الحيّ الآن: F2 2,000 − (10+2) − 4 − (5+1) − 5 (فرق العدّ) − 3 − 1 = 1,969؛ F1 1,200 − 6 − (3+1) = 1,190؛ FB 1,500 − (7+1) − 2 = 1,490.
    same(pickTotal(broiler.total), { days: 47, placed: 6200, dead: 52, culled: 6, sold: 400, count_diff: -1093, feed_kg: '1590.000', given_kg: '3200.000',
      given_unweighed: 1, eggs_total: null, eggs_broken: null, hdep: null, live_now: 4649, opened: 5, closed: 2, halls: 4 }, 'اللاحم: منذ البداية باليد');
    same([broiler.start, broiler.months.find((m) => m.month === '2026-10-01').live_end], [day(-46), 1984], 'اللاحم: البداية 2 ت1، وحيّ آخر ت1 = F2 وحده (2,000 − 12 − 4 = 1,984)');
    // البيّاض: 3,000 بعمر 140 يوم 25 ت1؛ البيض ت1 2,500 + 2,600 = 5,100 (المكسور 5 + 8 = 13) من الحيّ أوّل يومَيهما 3,000 + 2,997 = 5,997؛ وت2 2,550 (مكسور 3)
    // من 2,995، وجولة 15 ت2 بلا بيض لا تدخل المقام.
    const layer = kindOf(H_OWNER[months[1]], 'layer');
    same(layer.months.map((m) => [m.month, m.days, m.placed, m.dead, m.eggs_total, m.eggs_broken, m.hdep, m.feed_kg, m.given_kg, m.live_end, m.opened]),
      [['2026-10-01', 7, 3000, 5, 5100, 13, '85.04', '610.000', '2000.000', 2995, 1], ['2026-11-01', 17, 0, 3, 2550, 3, '85.14', '320.000', '0.000', 2992, 0]],
      'البيّاض: الشهران باليد (نسبة الإنتاج = البيض ÷ الحيّ أوّل أيّام البيض)');
    same(pickTotal(layer.total), { days: 24, placed: 3000, dead: 8, culled: 0, sold: 0, count_diff: 0, feed_kg: '930.000', given_kg: '2000.000', given_unweighed: 0,
      eggs_total: 7650, eggs_broken: 16, hdep: '85.08', live_now: 2992, opened: 1, closed: 0, halls: 1 }, 'البيّاض: منذ البداية باليد');
    const gap = kindOf(H_OWNER[months[0]], 'broiler').days.filter((d) => d.on >= day(-37) && d.on <= day(-31));
    same(gap.map((d) => [d.flocks, d.live_start, d.dead, d.feed_kg, d.given_kg, d.rounds_expected]), Array(7).fill([0, 0, null, null, '0.000', 0]),
      'الفجوة (11–17 ت1): صفوف بصفر أفواج، والنافق والمأكول null، والنازل 0.000');
  });

  // ── ٣) الشهر والتنقّل والمنشأة الفارغة ─────────────────────────────────────────────────────────────────────────────
  await section('الشهر والتنقّل', async () => {
    const now = await history(U.owner, null);
    same(now, H_OWNER[months[1]], 'الشهر الفارغ (null) = شهر يوم الخادم');
    same([now.today, now.month, now.prev, now.next, now.kinds.map((k) => k.kind), keysOf(now)], [TODAY, '2026-11-01', true, false, KINDS, [...TOP_KEYS].sort()],
      'شهر اليوم: prev لأنّ قبله شهراً فيه بداية، وnext لا، واللاحم ثمّ البيّاض');
    const oct = await history(U.owner, '2026-10-15');
    same([oct.month, oct.prev, oct.next, kindOf(oct, 'broiler').days.length, kindOf(oct, 'layer').days.length], ['2026-10-01', false, true, 30, 7],
      'ت1 (أيّ يوم فيه): أوّل أيّامه قبل كلّ بداية فلا prev، وnext؛ أيّام اللاحم من 2 ت1 والبيّاض من 25 ت1');
    const sep = await history(U.owner, '2026-09-30');
    same([sep.month, sep.prev, sep.next, sep.kinds.map((k) => [k.kind, k.days.length, k.events.length, k.months.length])],
      ['2026-09-01', false, true, [['broiler', 0, 0, 2], ['layer', 0, 0, 2]]], 'شهر قبل البداية: الأنواع بأيّام وأحداث فارغة، والأشهر كما هي');
    const future = await call(db, U.owner, HISTORY, ['2026-12-01']);
    same([future.ok, future.code, /لم يأتِ بعد/u.test(future.hint)], [false, 'future_month', true], 'شهر بعد شهر اليوم: future_month بتلميح فصيح');
    t.eq((await call(db, U.owner, HISTORY, ['2026-11-30'])).ok, true, 'آخر يوم في شهر اليوم (بعد اليوم) يعني شهر اليوم: مقبول');
    t.eq((await call(db, U.owner, HISTORY, ['infinity'])).code, 'date_required', 'شهر لا نهائيّ: date_required');
    const empty = await history(E.users.owner, null);
    same(empty, { today: TODAY, month: '2026-11-01', prev: false, next: false, kinds: [], notes: [] }, 'منشأة بلا فوج: kinds = [] ولا ملاحظات');
    samples.halls_history_empty = empty;
    const scales = [];
    for (const v of Object.values(H_OWNER)) {
      for (const k of v.kinds) {
        for (const row of [...k.days, ...k.months, k.total]) {
          for (const key of ['feed_kg', 'given_kg']) if (row[key] !== null && !/^-?\d+\.\d{3}$/u.test(row[key])) scales.push(`${key} ${row[key]}`);
          if (row.hdep !== null && !/^\d+\.\d{2}$/u.test(row.hdep)) scales.push(`hdep ${row.hdep}`);
          for (const [key, value] of Object.entries(row)) if (typeof value === 'number' && !Number.isInteger(value)) scales.push(`${key} ${value}`);
        }
        for (const e of k.events) if (e.avg_g !== undefined && !/^\d+\.\d$/u.test(e.avg_g)) scales.push(`avg_g ${e.avg_g}`);
      }
    }
    t.same(scales, [], 'الكيلو بثلاث مراتب، ونسبة الإنتاج بمرتبتين، والوزن بمرتبة، والأعداد صحيحة');
    const money = JSON.stringify(H_OWNER).match(/"(?:money|value|amount|cost|price)[a-z_]*"/gu);
    t.eq(money, null, 'لا مال في أيّ مفتاح');
  });

  // ── ٤) الأحداث ──────────────────────────────────────────────────────────────────────────────────────────────────
  await section('الأحداث', async () => {
    const brief = (k) => k.events.map((e) => [e.on, e.type, e.hall, e.site, e.birds ?? e.name ?? e.avg_g ?? null, e.kg ?? null]);
    same(brief(kindOf(H_OWNER[months[0]], 'broiler')), [
      [day(-46), 'placed', 'قاعة 1', 'حقل ألف', 1000, null],
      [day(-44), 'placed', 'قاعة 3', 'حقل ألف', 500, null],
      [day(-42), 'vaccine', 'قاعة 1', 'حقل ألف', 'نيوكاسل', null],
      [day(-42), 'weight', 'قاعة 1', 'حقل ألف', '150.0', null],
      [day(-40), 'sold', 'قاعة 1', 'حقل ألف', 400, '800.000'],
      [day(-39), 'count_diff', 'قاعة 3', 'حقل ألف', -498, null],
      [day(-39), 'closed', 'قاعة 3', 'حقل ألف', null, null],
      [day(-38), 'count_diff', 'قاعة 1', 'حقل ألف', -590, null],
      [day(-38), 'closed', 'قاعة 1', 'حقل ألف', null, null],
      [day(-30), 'placed', 'قاعة 2', 'حقل ألف', 2000, null],
    ], 'أحداث ت1 للّاحم بترتيب اليوم ثمّ النوع ثمّ القاعة (والقاعة المؤرشفة باسمها)');
    same(brief(kindOf(H_OWNER[months[1]], 'broiler')), [
      [day(-15), 'vaccine', 'قاعة 2', 'حقل ألف', 'نيوكاسل', null],
      [day(-14), 'placed', 'قاعة 1', 'حقل ألف', 1200, null],
      [day(-12), 'count_diff', 'قاعة 2', 'حقل ألف', -5, null],
      [day(-10), 'placed', 'قاعة 1', 'حقل باء', 1500, null],
      [day(-7), 'weight', 'قاعة 2', 'حقل ألف', '450.5', null],
    ], 'أحداث ت2 للّاحم (قاعتان باسم «قاعة 1» في حقلين)');
    same(brief(kindOf(H_OWNER[months[0]], 'layer')), [[day(-23), 'placed', 'قاعة البيّاض', 'حقل البيض', 3000, null]], 'أحداث ت1 للبيّاض');
    same(kindOf(H_OWNER[months[1]], 'layer').events, [], 'لا حدث للبيّاض في ت2');
    const keys = H_OWNER[months[0]].kinds.flatMap((k) => k.events.map((e) => `${e.type}:${keysOf(e).join(',')}`));
    same([...new Set(keys)].sort(), ['closed:hall,on,site,type', 'count_diff:birds,hall,on,site,type', 'placed:birds,hall,on,site,type', 'sold:birds,hall,kg,on,site,type',
      'vaccine:hall,name,on,site,type', 'weight:avg_g,hall,on,site,type'], 'مفاتيح كلّ نوع حدث كما في العقد');
  });

  // ── ٥) النطاق ────────────────────────────────────────────────────────────────────────────────────────────────────
  await section('النطاق', async () => {
    // 0034 («الكلّ مثل المالك»): صفّ النطاق لا يحجب، فالسجلّ لصاحبه = سجلّ المالك حرفاً بحرف.
    const full = await history(U.owner, null);
    const scoped = await history(U.siteManager, null);
    same(canon(scoped), canon(full), 'المدير بصفّ نطاق حقل باء: السجلّ كلّه كالمالك (اللاحم والبيّاض وكلّ الحقول)');
    same(kindOf(scoped, 'broiler').events.some((e) => e.site === 'حقل ألف'), true, 'وأحداث حقل ألف معها');
    samples.halls_history_scoped = scoped;
    const worker = await history(U.worker, null);
    same(canon(worker), canon(full), 'عامل الحقول بصفّ نطاق اللحم: السجلّ كلّه كالمالك');
  });

  // ── ٥ب) النقل بين الدورات (مراجعة 0031 M1) ─────────────────────────────────────────────────────────────────────────
  // منشأة ثانية (فلا تتغيّر عيّنات الشاشات): فوج A في «قاعة 5» (23 ت1، 1,000 طير) يُصرف له 500 كغم وسطر بلا وزن، ويُغلق 2 ت2 بنقل 200 كغم والسطر بلا
  // وزن إلى الدورة التالية، ثمّ فوج B في القاعة نفسها (7 ت2، 800 طير) يأخذ المنقول يوم تسكينه. ما نزل من المخزن 500 كغم وسطر واحد بلا وزن؛ وhalls_day يعدّ
  // المنقول نازلاً لـB يوم تسكينه، فجمعه في الشهر و«منذ البداية» كان يعدّه مرّتين (700 كغم وسطران).
  let C = null;
  await section('النقل بين الدورات', async () => {
    C = await makeOrg(db, { name: 'مزرعة النقل', id: (n) => id(200 + n), phone: (n) => phone(70 + n), roles: [['owner', 'owner'], ['manager', 'manager']] });
    const CU = C.users;
    const one2 = (user, sql, params) => one(user, sql, params);
    const store = (await db.admin("select id from public.warehouses where org_id = $1 and kind = 'feed'", [C.org])).rows[0].id;
    const siteC = await one2(CU.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل النقل', 'farm') returning id", [C.divisions.broiler]);
    const hallC = await one2(CU.owner, "insert into public.halls (site_id, name) values ($1, 'قاعة 5') returning id", [siteC]);
    const feedC = await one2(CU.owner, "insert into public.items (name, kind, base_unit) values ('علف النقل', 'feed', 'kg') returning id");
    const looseC = await one2(CU.owner, "insert into public.items (name, kind, base_unit) values ('علف النقل بلا وزن', 'feed', 'pc') returning id");
    await postedOpening(db, CU.owner, store, day(-50), [{ item: feedC, qty: 2000, value: '1000000.00' }, { item: looseC, qty: 10, value: '100000.00' }]);
    const issueC = (flock, itemId, qty, on) => one2(CU.manager, 'select public.record_flock_issue($1, $2, $3, $4, $5, $6, $7, $8) as v', [uid(), uid(), uid(), flock, itemId, qty, on, store]);
    let fa = null;
    await at(day(-23), async () => {
      fa = (await one2(CU.manager, 'select public.open_flock($1, $2, 1000, 0, null, $3) as v', [hallC, day(-25), uid()])).flock_id;
      await issueC(fa, feedC, '500', day(-25));
      await issueC(fa, looseC, '1', day(-25));
    });
    await at(day(-15), async () => {
      const form = await one2(CU.manager, 'select public.flock_close_form($1) as v', [fa]);
      const lines = [{ item_id: feedC, qty: '200', action: 'carry' }, { item_id: looseC, qty: '1', action: 'carry' }];
      await one2(CU.manager, "select public.close_flock($1, $2, $3, $4, $5, $6, $7::jsonb, 'نهاية الدورة', $8::jsonb, null, $9) as v",
        [uid(), uid(), fa, day(-15), form.flock.live, form.sales.birds, JSON.stringify(form.items.map((i) => ({ item_id: i.item_id, qty: i.pool_qty }))),
          JSON.stringify(lines), form.plan]);
    });
    await at(day(-10), async () => {
      await one2(CU.manager, 'select public.open_flock($1, $2, 800, 0, null, $3) as v', [hallC, day(-10), uid()]);
    });
    const hd = await one2(CU.owner, 'select public.halls_day($1) as v', [day(-10)]);
    const fb = hd.sites.flatMap((x) => x.halls).find((h) => h.hall_name === 'قاعة 5').flock;
    same([fb.feed_carry_in_kg, fb.feed_given_kg, fb.feed_given_unweighed], ['200.000', '200.000', 1],
      'البذرة: halls_day يوم تسكين B يعدّ المنقول (200 كغم وسطراً بلا وزن) نازلاً له');
    const now = await one2(CU.owner, HISTORY, [null]);
    const oct = await one2(CU.owner, HISTORY, ['2026-10-01']);
    const k = kindOf(now, 'broiler');
    same([k.total.given_kg, k.total.given_unweighed], ['500.000', 1], '«منذ البداية»: النازل من المخزن 500 كغم وسطر واحد بلا وزن (لا 700 وسطرين)');
    same(k.months.map((m) => [m.month, m.given_kg, m.given_unweighed]), [['2026-10-01', '500.000', 1], ['2026-11-01', '0.000', 0]],
      'الأشهر: ت1 ما صُرف، وت2 بلا نازل (المنقول نُزّل في ت1)');
    same(k.days.find((d) => d.on === day(-10)), { ...k.days.find((d) => d.on === day(-10)), given_kg: '0.000', given_unweighed: 0, placed: 800 },
      'يوم تسكين B في السجلّ: لا نازل من المخزن (والمنقول في halls_day نفسه)');
    same(kindOf(oct, 'broiler').days.find((d) => d.on === day(-25)).given_kg, '500.000', 'يوم الصرف الأوّل: 500 كغم');
    const v = Object.fromEntries((await db.asService((q) => q('select check_name, violations::int as v from public.verify_halls_history()'))).rows.map((r) => [r.check_name, r.v]));
    same(v, { halls_note_versions: 0, history_days_month: 0, history_months_total: 0 }, 'verify_halls_history بالصفر مع النقل');
  });

  // ── ٦) الملاحظة ──────────────────────────────────────────────────────────────────────────────────────────────────
  const notes = {};
  await section('الملاحظة', async () => {
    const write = (user, on, text, expected) => call(db, user, NOTE, [on, text, expected]);
    const rowOf = async (on) => (await db.admin('select note, version::text as version from public.halls_day_notes where org_id = $1 and on_date = $2', [G.org, on])).rows[0] ?? null;
    // 0034: كلّ عضو يكتب ملاحظة اليوم، ولو بصفّ نطاق حقل (بمعاملة ترجع، فما بعده كما كان).
    for (const who of ['worker', 'accountant', 'siteManager']) {
      const r = await call(db, U[who], NOTE, [day(-3), 'من غير المالك', null], { commit: false });
      t.eq(r.ok ? 'ok' : r.code, 'ok', `${who}: يكتب ملاحظة اليوم (halls_note.write لكلّ عضو)`);
    }
    const first = await write(U.owner, day(-3), '  وصل العلف وبدأنا القاعة الثانية  ', null);
    t.ok(first.ok && first.value.note.text === 'وصل العلف وبدأنا القاعة الثانية' && first.value.on === day(-3) && first.value.note.version >= 1,
      `المالك يكتب ملاحظة اليوم (الفراغ في الطرفين يُقصّ): ${JSON.stringify(first.value ?? first)}`);
    samples.set_halls_note = first.value;
    const v1 = first.value.note.version;
    const stale = await write(U.manager, day(-3), 'من المدير بلا رؤية', null);
    same([stale.ok, stale.code, /تغيّرت ملاحظة يوم/u.test(stale.hint)], [false, 'note_changed', true], 'المدير بنسخة قديمة (رأى بلا ملاحظة): note_changed بتلميح فصيح');
    const again = await write(U.manager, day(-3), 'وصل العلف وبدأنا القاعة الثانية', null);
    same([again.ok, again.value?.note?.version], [true, v1], 'النصّ نفسه مرّة أخرى (ولو بنسخة قديمة): النتيجة نفسها بلا نسخة جديدة');
    const second = await write(U.manager, day(-3), 'وصل العلف، ونفق في القاعة الثانية', v1);
    t.ok(second.ok && second.value.note.version > v1, `المدير بالنسخة التي رآها يعدّل: نسخة أكبر (${JSON.stringify(second.value ?? second)})`);
    const v2 = second.value.note.version;
    t.eq((await write(U.owner, day(-3), 'تعديل على النسخة الأولى', v1)).code, 'note_changed', 'تعديل على النسخة الأولى بعد الثانية: note_changed');
    const long = await write(U.owner, day(-4), 'ب'.repeat(501), null);
    same([long.ok, long.code, /501 حرفاً، والحدّ 500/u.test(long.hint)], [false, 'bad_note', true], '501 حرفاً: bad_note بعدد الحروف');
    t.eq((await write(U.owner, day(-4), 'ب'.repeat(500), null)).ok, true, '500 حرف بالضبط: مقبولة');
    t.eq((await write(U.owner, day(1), 'غداً', null)).code, 'day_in_future', 'يوم لم يأتِ: day_in_future');
    t.eq((await write(U.owner, null, 'بلا يوم', null)).code, 'date_required', 'بلا يوم: date_required');
    t.eq((await write(U.owner, 'infinity', 'لا نهائيّ', null)).code, 'date_required', 'يوم لا نهائيّ: date_required');
    // المسح: نصّ فارغ (أو فراغ فقط) بالنسخة التي رآها، فيبقى الصفّ بنصّ فارغ ونسخة أكبر، ولا يظهر في التقرير.
    const cleared = await write(U.manager, day(-3), ' \n ', v2);
    same([cleared.ok, cleared.value?.note], [true, null], 'المسح بفراغ فقط: الجواب بلا ملاحظة');
    const kept = await rowOf(day(-3));
    t.ok(kept && kept.note === '' && BigInt(kept.version) > BigInt(v2), `الصفّ باقٍ بنصّ فارغ ونسخة أكبر (${JSON.stringify(kept)})`);
    same((await write(U.owner, day(-3), '', null)).value, { on: day(-3), note: null }, 'المسح مرّة أخرى (رأى بلا ملاحظة): النتيجة نفسها');
    t.eq((await rowOf(day(-3))).version, kept.version, 'المسح الثاني بلا نسخة جديدة');
    t.eq((await write(U.owner, day(-3), 'على النسخة الثانية بعد المسح', v2)).code, 'note_changed', 'نسخة قبل المسح بعده: note_changed (لا ABA)');
    const reborn = await write(U.owner, day(-3), 'ملاحظة جديدة بعد المسح', null);
    t.ok(reborn.ok && BigInt(reborn.value.note.version) > BigInt(kept.version), 'بعد المسح يكتب من رأى بلا ملاحظة: نسخة أكبر من كلّ ما قبلها');
    notes.d3 = reborn.value.note;
    notes.d4 = (await rowOf(day(-4)));
    await write(U.manager, day(-40), 'بيع الدفعة الأولى من قاعة 1', null);
    const direct = await call(db, U.owner, "insert into public.halls_day_notes (on_date, note, version) values ($1, 'مباشرة', 999) returning id", [day(-5)]);
    t.eq(direct.ok, false, `لا كتابة مباشرة في الجدول (${direct.code})`);
    const seen = await history(U.worker, null);
    same(seen.notes, [{ on: day(-4), text: 'ب'.repeat(500), version: Number(notes.d4.version) }, { on: day(-3), text: 'ملاحظة جديدة بعد المسح', version: notes.d3.version }],
      'ملاحظات ت2 لكلّ من يقرأ المنشأة (عامل الحقول)، تصاعدياً، والممسوحة لا تظهر');
    same((await history(U.siteManager, '2026-10-01')).notes.map((n) => [n.on, n.text]), [[day(-40), 'بيع الدفعة الأولى من قاعة 1']], 'ملاحظات ت1 للمنشأة كلّها لا للنطاق');
    const audit = await db.admin("select count(*)::int as n from public.audit_log where table_name = 'halls_day_notes' and org_id = $1", [G.org]);
    t.ok(audit.rows[0].n >= 5, `كلّ كتابة في سجلّ التدقيق (${audit.rows[0].n})`);
    const v = Object.fromEntries((await db.asService((q) => q('select check_name, violations::int as v from public.verify_halls_history()'))).rows.map((r) => [r.check_name, r.v]));
    same(v, { halls_note_versions: 0, history_days_month: 0, history_months_total: 0 }, 'verify_halls_history: ثلاثة فحوص بالصفر');
  });

  // ── ٧) الطفرات ──────────────────────────────────────────────────────────────────────────────────────────────────
  await section('الطفرات', async () => {
    const VERIFY = 'select check_name, violations::int as v from public.verify_halls_history()';
    const verifyOf = async (q) => Object.fromEntries((await q(VERIFY)).rows.map((r) => [r.check_name, r.v]));
    const CASES = [
      // 0034: طفرتا «النطاق كـhalls_day» و«فعل الملاحظة halls_note.write» و«ملاحظة المنشأة لمن نطاقه المنشأة كلّها» صارت مكافئة (النطاق المنشأة كلّها
      // والفعل لكلّ عضو، والمنشأة شرط كلّ جملة)، فشيلت؛ وما بين المنشآت يحرسه role-matrix.
      {
        name: 'يوم بلا فوج داخل المدّة صفّ',
        fns: [[FN.history, [['    left join z on z.kind = ks.kind and z.on_date = c.d\n', '    join z on z.kind = ks.kind and z.on_date = c.d\n']]]],
        run: ({ attempt }) => attempt(U.owner, async (q) => (await q(HISTORY, ['2026-10-01'])).rows[0].v.kinds[0].days.length),
        correct: (r) => r.ok && r.value === 30,
      },
      {
        name: 'المسكَّن يوم تسكينه وحده',
        fns: [[FN.history, [['filter (where z.placed_on = c.d)', 'filter (where z.placed_on <= c.d)']]]],
        run: ({ attempt }) => attempt(U.owner, async (q) => (await q(HISTORY, [null])).rows[0].v.kinds[0].total.placed),
        correct: (r) => r.ok && r.value === 6200,
      },
      {
        name: 'شرط النسخة',
        fns: [[FN.note, [['  if p_expected_version is distinct from v_seen then\n', '  if false then\n']]]],
        run: ({ attempt }) => attempt(U.manager, async (q) => (await q(NOTE, [day(-3), 'فوق ما لم يُرَ', null])).rows[0].v.note.text),
        correct: (r) => !r.ok && r.code === 'note_changed',
      },
      {
        name: 'الإعادة بالنصّ نفسه بلا نسخة جديدة',
        fns: [[FN.note, [['(v_seen is not null and n.note = v_text)', 'false']]]],
        run: ({ attempt }) => attempt(U.owner, async (q) => (await q(NOTE, [day(-3), 'ملاحظة جديدة بعد المسح', notes.d3.version])).rows[0].v.note.version),
        correct: (r) => r.ok && r.value === notes.d3.version,
      },
      {
        name: 'الممسوحة لا تُعرض',
        fns: [[FN.history, [["n.on_date between v_month and v_end and n.note <> ''", 'n.on_date between v_month and v_end']]]],
        run: ({ attempt }) => attempt(U.owner, async (q) => {
          await q(NOTE, [day(-4), '', Number(notes.d4.version)]);
          return (await q(HISTORY, [null])).rows[0].v.notes.length;
        }),
        correct: (r) => r.ok && r.value === 1,
      },
      {
        name: 'النازل من المخزن بلا المنقول',
        fns: [[FN.history, [['sum(z.given_kg - z.carry_in_kg)', 'sum(z.given_kg)']]]],
        run: ({ attempt }) => attempt(C.users.owner, async (q) => (await q(HISTORY, [null])).rows[0].v.kinds[0].total.given_kg),
        correct: (r) => r.ok && r.value === '500.000',
      },
      {
        name: 'سطور المنقول بلا وزن',
        fns: [[FN.history, [['sum(z.given_unweighed - z.carry_in_unweighed)', 'sum(z.given_unweighed)']]]],
        run: ({ attempt }) => attempt(C.users.owner, async (q) => (await q(HISTORY, [null])).rows[0].v.kinds[0].total.given_unweighed),
        correct: (r) => r.ok && r.value === 1,
      },
      {
        name: 'الثابت يمسك سطر شهر لا يساوي أيّامه',
        fns: [[FN.history, [['sum(dd.placed)::bigint as placed', 'sum(dd.placed)::bigint + 1 as placed']]]],
        run: ({ oq }) => verifyOf(oq).then((value) => ({ ok: true, value })),
        correct: (r) => r.ok && r.value.history_days_month === 0 && r.value.history_months_total === 0,
      },
      {
        name: 'الثابت يمسك أيّام شهر ماضٍ لا تطابق التقويم',
        fns: [[FN.history, [['count(*)::int as days, sum(dd.placed)', '(count(*) + (dd.m < v_this)::int)::int as days, sum(dd.placed)']]]],
        run: ({ oq }) => verifyOf(oq).then((value) => ({ ok: true, value })),
        correct: (r) => r.ok && r.value.history_days_month === 0,
      },
      {
        name: 'الثابت يمسك سطر بداية لا يساوي الأشهر',
        fns: [[FN.history, [["'feed_kg', sum(mm.feed_kg)::text", "'feed_kg', (sum(mm.feed_kg) + 1)::text"]]]],
        run: ({ oq }) => verifyOf(oq).then((value) => ({ ok: true, value })),
        correct: (r) => r.ok && r.value.history_months_total === 0,
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

  // ── ٨) التراجع داخل معاملة ترجع ────────────────────────────────────────────────────────────────────────────────────
  await section('التراجع', async () => {
    const rollbackSql = readFileSync(path.join(DIR, '..', 'migrations', 'rollback_0031.sql'), 'utf8');
    const body0022 = (() => {
      const text = readFileSync(path.join(DIR, '..', 'migrations', '0022_day_balance.sql'), 'utf8');
      const start = text.indexOf('create or replace function private.actions()');
      return text.slice(start, text.indexOf('\n$$;', start) + 4);
    })();
    t.ok(rollbackSql.includes(body0022), 'ملف التراجع يرجّع private.actions كما في 0022 حرفاً');
    const refused = await db.asOwner((q) => q(rollbackSql)).then(() => 'completed', (error) => error.message);
    t.eq(refused, 'rollback_blocked', 'التراجع والملاحظات قائمة: rollback_blocked ولا يُسقط شيئاً');
    const undone = await db.asOwner(async (q) => {
      await q('delete from public.halls_day_notes where true');
      await q(rollbackSql);
      return (await q(`select to_regprocedure('public.halls_history(date)') is null and to_regprocedure('public.set_halls_note(date, text, bigint)') is null
          and to_regprocedure('public.verify_halls_history()') is null as gone, to_regclass('public.halls_day_notes') is null as table_gone,
        to_regclass('private.halls_note_versions') is null as sequence_gone, 'halls_note.write' = any (private.actions()) as action_kept,
        public.halls_day($1) -> 'totals' ->> 'flocks' as halls_day`, [TODAY])).rows[0];
    }, U.owner);
    same(undone, { gone: true, table_gone: true, sequence_gone: true, action_kept: false, halls_day: '4' },
      'بلا ملاحظات يكمل التراجع: الدوالّ والجدول والعدّاد تسقط، والفعل يخرج من القائمة، وhalls_day كما هو (معاملة ترجع)');
    t.eq((await call(db, U.owner, HISTORY, [null])).ok, true, 'بعد المعاملة الراجعة: halls_history قائم');
  });

  samples.halls_history = await history(U.owner, null);
  samples.halls_history_prev_month = await history(U.owner, '2026-10-01');
  if (process.env.HISTORY_SAMPLES_OUT) {
    writeFileSync(FIXTURE, JSON.stringify({
      _note: `عيّنات القاعدة الحقيقية (supabase/tests/halls-history.test.mjs بـHISTORY_SAMPLES_OUT=1، اليوم المثبَّت ${TODAY})؛ المحلّلات الحقيقية تقرؤها في فحوص الشاشات.`,
      halls_history: samples.halls_history,
      halls_history_prev_month: samples.halls_history_prev_month,
      halls_history_scoped: samples.halls_history_scoped,
      halls_history_empty: samples.halls_history_empty,
      set_halls_note: samples.set_halls_note,
    }, null, 1) + '\n');
  }
}

/** سطر «منذ البداية» بمفاتيح العقد. */
function pickTotal(total) {
  return Object.fromEntries(TOTAL_KEYS.map((k) => [k, total?.[k]]));
}
