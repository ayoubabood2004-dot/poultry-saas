// مراجعة 0037 و0038 العدائية (2026-11-27، على 0f86f4a): كلّ حالة هنا فشلت على الشفرة قبل إصلاحها. المعرّفات d3939000 والهواتف 96477039390.
// R1 إعادة فتح الدورة وكاتبٌ من الطابور يركن عمليته: reopen_flock كان يقفل القاعة for update ثمّ ينتظر صفّ الوجبة، والكاتب يمسك صفّ الوجبة ثمّ
//    يأخذ إدراجه في flock_day_rejects (المفتاح الأجنبيّ إلى القاعة) key share عليها، فيتقفّلان (40P01): الكاز (0037) وهلاكات الأقسام (0038). وضابطٌ
//    بالقفل القديم مثبَّتاً يتقفّل، فالسباق نفسه يمسك.
// R2 تطبيق قبل 0038 يعدّل هلاكات زيارة بأقسام (save_flock_visit): كان القيد الخام (23514 بلا رمز ولا تلميح)؛ الآن sections_required بتلميحه،
//    والتصفير يُحفظ بأقسام اليوم بعده، وتعديلٌ لا يمسّ الهلاكات يُبقي الأقسام.
// R3 الفترة المقفلة تشمل أعداد الأقسام: edit_flock بأعداد الأقسام وحدها، وset_hall_sections لوجبة تسكينها داخل الفترة: period_locked كتغيير العدد،
//    ووجبة بعد الفترة تتغيّر أقسامها.
// R4 تلميح sections_changed بالفصحى: «فلا يُعاد فتحها» (الفعل للفتح، كتلميح hall_reused).
// R5 جواب flock_sales الحقيقي بـreopen_why = sections_changed (قاعة قُسمت بعد إغلاق وجبتها) يمرّ بمحلّل الشاشات الحقيقي؛ كان يرمي فتسقط بطاقة الوجبة.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** محلّل flock_sales الحقيقي في الشاشات (src/lib/repo/flockClose.ts محزوماً بـesbuild، كـflocks.test). */
async function closeParsers() {
  const result = await build({
    stdin: { contents: "export { parseFlockSales } from './src/lib/repo/flockClose.ts';", resolveDir: ROOT, loader: 'ts' },
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

const TODAY = '2026-11-27';
const DAY_MS = 86400000;
const day = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const id = (n) => `d3939000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477039390${String(n).padStart(2, '0')}`;

const DEAD = 'select public.set_flock_dead($1, $2, $3, $4, $5, $6) as v';
const DAY = 'select public.save_flock_day($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) as v';
const VISIT = 'select public.save_flock_visit($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) as v';
const OPEN = 'select public.open_flock($1, $2, $3, 0, null, $4, $5) as v';
const EDIT = 'select public.edit_flock($1, (select version from public.flocks where id = $1), $2, $3, 0, null, $4, $5) as v';
const SECTIONS_NOW = 'select public.set_hall_sections($1, $2, (select version from public.halls where id = $1), $3) as v';
const KEROSENE = 'select public.set_flock_kerosene($1, $2, $3, $4, $5, $6) as v';
const CLOSE_FORM = "select public.flock_close_form($1) ->> 'plan' as v";
const CLOSE = "select public.close_flock($1, $2, $3, $4, $5, 0, '[]'::jsonb, 'بيعت', '[]'::jsonb, null, $6) as v";
const REOPEN = "select public.reopen_flock($1, 'أُغلقت خطأً', $2) as v";
const REOPEN_SIG = 'public.reopen_flock(uuid, text, uuid)';

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const G = await makeOrg(db, { name: 'مزرعة المراجعة', id, phone, roles: [['owner', 'owner'], ['worker', 'hall_worker', ['broiler']]] });
  const { users: U, divisions: D } = G;
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (error) {
      t.ok(false, `${name}: رمى ${error.stack ?? error.message}`);
    }
  };
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const inside = async (attempt, user, sql, params) => {
    const result = await attempt(user, async (q) => (await q(sql, params)).rows[0].v);
    return result.ok ? result.value : { code: result.code, hint: result.hint };
  };
  const site = await one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل المراجعة', 'farm') returning id", [D.broiler]);
  const hall = (name, sections = 1) => one(U.owner, 'insert into public.halls (site_id, name, sections) values ($1, $2, $3) returning id', [site, name, sections]);
  const place = async (hallId, on, count, counts = null) => (await one(U.owner, OPEN, [hallId, on, count, uid(), counts])).flock_id;
  const closed = async (name, sections) => {
    const hallId = await hall(name, sections);
    const flock = await place(hallId, day(-10), 100);
    const closeId = uid();
    await one(U.owner, CLOSE, [uid(), closeId, flock, day(-1), 100, await one(U.owner, CLOSE_FORM, [flock])]);
    return { hall: hallId, flock, closeId };
  };
  // جسمٌ مثبَّت (يُرجَع في finally) لضابط ترتيب الأقفال وحده، كـcommittedBroken في hall-sections.test.
  const withBody = async (signature, from, to, fn) => {
    const original = (await db.admin('select pg_get_functiondef($1::regprocedure) as d', [signature])).rows[0].d;
    if (original.split(from).length !== 2) throw new Error(`المرساة ليست مرّة واحدة في ${signature}: ${from}`);
    const apply = async (sql) => {
      await db.admin('begin');
      try {
        await db.admin('set local role postgres');
        await db.admin(sql);
        await db.admin('commit');
      } catch (error) {
        await db.admin('rollback');
        throw error;
      }
    };
    await apply(original.split(from).join(to));
    try {
      return await fn();
    } finally {
      await apply(original);
    }
  };
  // الجلسة A تمسك صفّ الوجبة (كما يفعل كلّ كاتب أوّلاً)، والجلسة R تبدأ reopen_flock (القاعة ثمّ تنتظر صفّ الوجبة)، ثمّ تنادي A الكاتب من الطابور
  // فيركن عمليته: إدراجه في flock_day_rejects يأخذ key share على القاعة بالمفتاح الأجنبيّ.
  const reopenRace = async (c, writerSql, writerParams) => {
    const a = await db.session(U.owner, { role: 'postgres' });
    const r = await db.session(U.owner);
    try {
      await a.run("set local lock_timeout = '10s'");
      await a.run('select 1 from public.flocks where id = $1 for update', [c.flock]);
      const pendingR = r.run(REOPEN, [c.closeId, uid()]);
      const stateR = await db.settle(pendingR, r.pid);
      const pendingA = a.run(writerSql, writerParams);
      const stateA = await db.settle(pendingA, a.pid);
      const resA = await pendingA;
      await a.commit();
      const resR = await pendingR;
      await r.commit();
      return { stateR, stateA, writer: resA.ok ? resA.rows[0].v.status : resA.error, reopen: resR.ok ? resR.rows[0].v.status : resR.error };
    } finally {
      await a.rollback();
      await r.rollback();
    }
  };
  const deadlocked = (race) => [race.writer, race.reopen].some((x) => /deadlock/u.test(String(x)));

  // ── R1: إعادة الفتح وكاتب يركن من الطابور ─────────────────────────────────────────────────────────────────────────────
  await section('R1 إعادة الفتح والطابور', async () => {
    const k = await closed('قاعة الكاز', 1);
    const kerosene = await reopenRace(k, KEROSENE, [k.flock, day(-2), 10, null, uid(), true]);
    t.same([deadlocked(kerosene), kerosene.stateR, kerosene.writer, kerosene.reopen], [false, 'blocked', 'parked', 'reopened'],
      `R1 reopen_flock ينتظر كاتب الكاز من الطابور على الوجبة المغلقة، والكاتب يركن، ثمّ تُعاد فتحها، بلا 40P01: ${JSON.stringify(kerosene)}`);
    const s = await closed('قاعة الأقسام المغلقة', 2);
    const dead = await reopenRace(s, DEAD, [s.flock, day(-2), 1, uid(), true, [1, 0]]);
    t.same([deadlocked(dead), dead.stateR, dead.writer, dead.reopen], [false, 'blocked', 'parked', 'reopened'],
      `R1 وكذلك set_flock_dead بأقسام من الطابور على الوجبة المقسومة المغلقة: ${JSON.stringify(dead)}`);
    // الضابط: القفل القديم (القاعة for update) مثبَّتاً يتقفّل في السباق نفسه، فالفحص يمسك الرجوع إليه.
    const c = await closed('قاعة الضابط', 1);
    const control = await withBody(REOPEN_SIG, 'y.id = x.hall_id for no key update;', 'y.id = x.hall_id for update;',
      () => reopenRace(c, KEROSENE, [c.flock, day(-2), 10, null, uid(), true]));
    t.ok(deadlocked(control), `R1 الضابط: بالقفل القديم (for update) يتقفّل السباق نفسه (40P01): ${JSON.stringify(control)}`);
  });

  // ── R2: تطبيق قبل 0038 يعدّل هلاكات زيارة بأقسام ────────────────────────────────────────────────────────────────────
  await section('R2 تعديل زيارة بأقسام', async () => {
    const H = await hall('قاعة الزيارة', 2);
    const F = await place(H, day(-10), 1000);
    await one(U.owner, DEAD, [F, day(-3), 5, uid(), false, [3, 2]]);
    const v = (await db.admin('select id, version from public.flock_visits where flock_id = $1 and on_date = $2 and voided_at is null', [F, day(-3)])).rows[0];
    const at = new Date().toISOString();
    const edit = await call(db, U.worker, VISIT, [v.id, F, day(-3), at, 4, 0, null, null, null, null, null, v.version, false, uid(), true], { commit: false });
    t.same([edit.code, (edit.hint ?? '').includes('مقسومة')], ['sections_required', true],
      `R2 تعديل هلاكات زيارة بأقسام من تطبيق قبل 0038 (5 ← 4): sections_required بتلميحه، لا القيد الخام: ${JSON.stringify(edit)}`);
    const read = async (oq) => ({
      visit: (await oq('select dead, dead_parts from public.flock_visits where id = $1', [v.id])).rows[0],
      day: (await oq('select dead, dead_parts from public.flock_daily where flock_id = $1 and on_date = $2', [F, day(-3)])).rows[0],
    });
    const zeroed = await mutant(db, U.owner, [], async ({ oq, attempt }) => {
      const r = await inside(attempt, U.worker, VISIT, [v.id, F, day(-3), at, 0, 0, null, null, null, null, null, v.version, false, uid(), true]);
      return { status: r.code ?? r.status, ...(await read(oq)) };
    });
    t.same(zeroed, { status: 'saved', visit: { dead: 0, dead_parts: null }, day: { dead: 0, dead_parts: [0, 0] } },
      'R2 وتصفير هلاكاتها يُحفظ (لا أقسام لزيارة بلا هلاكات)، وأقسام اليوم بعده أصفار');
    const noted = await mutant(db, U.owner, [], async ({ oq, attempt }) => {
      const r = await inside(attempt, U.worker, VISIT, [v.id, F, day(-3), at, 5, 0, null, null, null, null, 'تفقّد', v.version, false, uid(), true]);
      return { status: r.code ?? r.status, ...(await read(oq)) };
    });
    t.same(noted, { status: 'saved', visit: { dead: 5, dead_parts: [3, 2] }, day: { dead: 5, dead_parts: [3, 2] } },
      'R2 وتعديلٌ لا يمسّ هلاكاتها (ملاحظة) يُحفظ وتبقى أقسامها');
  });

  // ── R3: الفترة المقفلة وأعداد الأقسام ─────────────────────────────────────────────────────────────────────────────
  await section('R3 الفترة المقفلة', async () => {
    const H = await hall('قاعة الفترة', 2);
    const F = await place(H, day(-20), 1000);
    await one(U.owner, DAY, [F, day(-18), null, null, null, null, null, null, null, null, null, 'ملاحظة', null, uid(), false, null]);
    const L = await hall('قاعة بعد الفترة', 2);
    const later = await place(L, day(-10), 1000);
    const out = await mutant(db, U.owner, [], async ({ oq, attempt }) => {
      await inside(attempt, U.owner, 'select public.set_period_lock($1) as v', [day(-15)]);
      const countChange = await inside(attempt, U.owner, EDIT, [F, day(-20), 1001, uid(), [501, 500]]);
      const countsOnly = await inside(attempt, U.owner, EDIT, [F, day(-20), 1000, uid(), [700, 300]]);
      const before = (await oq('select version, dead_parts from public.flock_daily where flock_id = $1 and on_date = $2', [F, day(-18)])).rows[0];
      const split = await inside(attempt, U.owner, SECTIONS_NOW, [H, 3, uid()]);
      const after = (await oq('select version, dead_parts from public.flock_daily where flock_id = $1 and on_date = $2', [F, day(-18)])).rows[0];
      const laterCounts = await inside(attempt, U.owner, EDIT, [later, day(-10), 1000, uid(), [600, 400]]);
      const laterSplit = await inside(attempt, U.owner, SECTIONS_NOW, [L, 3, uid()]);
      return {
        countChange: countChange.code ?? 'saved', countsOnly: countsOnly.code ?? 'saved', split: split.code ?? split.status, unchanged: JSON.stringify(after) === JSON.stringify(before),
        laterCounts: laterCounts.code ?? JSON.stringify(laterCounts.section_counts), laterSplit: laterSplit.code ?? laterSplit.status,
      };
    });
    t.same(out, { countChange: 'period_locked', countsOnly: 'period_locked', split: 'period_locked', unchanged: true, laterCounts: '[600,400]', laterSplit: 'saved' },
      'R3 الفترة مقفلة حتى ما قبل 15 يوماً والوجبة سُكّنت قبل 20: أعداد الأقسام وحدها وتغيير أقسام القاعة period_locked كتغيير العدد (ويوم الفترة كما هو)؛ ووجبة بعد الفترة تتغيّر');
  });

  // ── R4: تلميح sections_changed بالفصحى ─────────────────────────────────────────────────────────────────────────────
  await section('R4 التلميح', async () => {
    const c = await closed('قاعة التلميح', 2);
    await one(U.owner, SECTIONS_NOW, [c.hall, 1, uid()]);
    const refused = await call(db, U.owner, REOPEN, [c.closeId, uid()], { commit: false });
    t.same([refused.code, (refused.hint ?? '').includes('فلا يُعاد فتحها'), (refused.hint ?? '').includes('تُعاد فتحها')], ['sections_changed', true, false],
      `R4 تلميح sections_changed «فلا يُعاد فتحها»: ${refused.hint}`);
  });

  // ── R5: جواب flock_sales الحقيقي بالسبب الجديد ومحلّل الشاشات ─────────────────────────────────────────────────────────────
  await section('R5 السبب الجديد والمحلّل', async () => {
    const c = await closed('قاعة البطاقة', 1);
    await one(U.owner, SECTIONS_NOW, [c.hall, 2, uid()]);
    const card = await one(U.owner, 'select public.flock_sales($1) as v', [c.flock]);
    const { parseFlockSales } = await closeParsers();
    let parsed;
    try {
      parsed = parseFlockSales(card).reopenWhy;
    } catch (error) {
      parsed = `${error.name}: ${error.message}`;
    }
    t.same([card.reopen_why, parsed], ['sections_changed', 'sections_changed'],
      'R5 وجبة مغلقة قُسمت قاعتها بعدها: flock_sales الحقيقي يقول sections_changed ومحلّل الشاشات يقرؤه (كان يرمي فتسقط البطاقة)');
  });
}
