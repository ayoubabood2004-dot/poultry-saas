// «كلّ خطوة فيها تعديل» (0028؛ ملاحظات الزبون 2026-11-15 بالرسائل الصوتية والصور، DECISIONS «ملاحظات الزبون الأولى»):
// (١) edit_flock: فوج «قاعة 5» سُكّن 14/11 غلطاً والصحيح 13/11، بقواعد open_flock وشرط النسخة والمرجع، ولا تسكين بعد أوّل سجلّ ولا عدد دون النافق
//     والمستبعد، والفترة المقفلة؛ وdelete_flock للمفتوح غلطاً بلا سجلّ، وغيره يُرفض بجملة تسمّي ما له، والمفتاح الأجنبيّ المجهول بجملة لا بخطأ خام؛
// (٢) جدول لقاحات خاصّ لقاعة يحلّ محلّ جدول نوعها في التذكير والتقويم وتقرير الدورة والتأشير، بشرط النسخة، ويُحذف فتعود القاعة إلى العامّ، وحذف
//     اللقاح يُخرجه منه، والإضافة للقاعات تقفل جدول القاعة (جلستان حقيقيّتان)، وverify_halls يمسك الخرق؛
// (٣) edit_recipe: «احفظ التعديل» بنداء واحد (الاسم والموادّ والتفعيل)، بشرط النسخة المفعَّلة، والمسوّدة القائمة تُستعمل، والمعدّلات تُنسخ، وبلا تغيير
//     لا نسخة؛ والصلاحيات والنطاق لكلّ واحدة؛ وطفرات تكسر كلّ قاعدة فيفشل فحصها.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { postedOpening } from './stock-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * repo الشاشات الحقيقيّ (المحلّلات وبناء النداءات) محزوماً بـesbuild على core بديل يرجّع جواب القاعدة الحقيقيّ المحفوظ في globalThis.__ce (درس 2026-11-02:
 * جواب القاعدة الحقيقيّ يمرّ بمحلّل الشاشات الحقيقيّ، لا بجواب مكتوب باليد).
 */
async function loadScreensRepo() {
  const core = `export const call = (fn, args) => globalThis.__ce(fn, args);
export const send = () => { throw new Error('send'); };
export const authed = async () => ({ db: null });
export const updatedRows = () => [];
export const classifyPostgrest = (error) => error;
export const explained = async (error) => error;
export const unknownConstraint = () => '';`;
  const result = await build({
    stdin: {
      contents: [
        "export { editFlock, deleteFlock } from './src/lib/repo/flockEdits.ts';",
        "export { editRecipe } from './src/lib/repo/mill.ts';",
        "export { parseVaccineBoard, saveHallVaccineProgram, dropHallVaccineProgram } from './src/lib/repo/halls.ts';",
      ].join('\n'),
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"' },
    plugins: [
      {
        name: 'ce-core',
        setup(b) {
          b.onResolve({ filter: /^\.\/core$/ }, (args) => (args.importer.replace(/\\/g, '/').includes('/src/lib/repo/') ? { path: 'core', namespace: 'ce-core' } : undefined));
          b.onLoad({ filter: /.*/, namespace: 'ce-core' }, () => ({ contents: core, resolveDir: ROOT, loader: 'js' }));
        },
      },
    ],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const TODAY = '2026-11-15';
const id = (n) => `d2800000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477028000${String(n).padStart(2, '0')}`;
const day = (offset) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
const dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const EDIT = 'select public.edit_flock($1, $2, $3, $4, $5, $6, $7) as v';
const DEL = 'select public.delete_flock($1, $2, $3) as v';
const SAVE_H = 'select public.save_hall_vaccine_program($1, $2, $3::jsonb, $4) as v';
const DROP_H = 'select public.drop_hall_vaccine_program($1, $2) as v';
const EDIT_R = 'select public.edit_recipe($1, $2, $3, $4::jsonb, $5) as v';
const FN = {
  edit: 'public.edit_flock(uuid, integer, date, integer, integer, text, uuid)',
  del: 'public.delete_flock(uuid, integer, uuid)',
  recipe: 'public.edit_recipe(uuid, uuid, text, jsonb, uuid)',
  slots: 'private.flock_slots(uuid)',
};
const shown = (result) => (result.ok ? 'ok' : result.code);
/** مفاتيح كلّ كائن بترتيب ثابت (jsonb يرتّبها بالطول ثمّ بالبايت). */
const canon = (value) => JSON.parse(JSON.stringify(value, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x)));
const lines = (...items) => JSON.stringify(items.map((item) => ({ item_id: item })));

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const G = await makeOrg(db, {
    name: 'مزرعة الزبون',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['storekeeper', 'storekeeper', ['feed_mill', 'broiler', 'medicine']],
      ['accountant', 'accountant'],
      ['hallWorker', 'hall_worker', ['broiler']],
      ['viewer', 'viewer'],
      ['millOp', 'mill_operator', ['feed_mill']],
      ['layerManager', 'manager', ['layer']],
    ],
  });
  const { users: U, divisions: D, org } = G;
  const OTHERS = ['storekeeper', 'accountant', 'hallWorker', 'viewer', 'millOp'];
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const admin1 = async (sql, params) => Object.values((await db.admin(sql, params)).rows[0] ?? {})[0];
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  const site = (division, name) => one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, $2, 'farm') returning id", [D[division], name]);
  const farm = await site('broiler', 'حقل الزبون');
  const hall = (name) => one(U.owner, 'insert into public.halls (site_id, name) values ($1, $2) returning id', [farm, name]);
  const open = async (hallId, on, count, age0) => (await one(U.owner, 'select public.open_flock($1, $2, $3, $4, null, $5) as v', [hallId, on, count, age0, uid()])).flock_id;
  const version = (flock) => admin1('select version from public.flocks where id = $1', [flock]);
  const flockRow = async (flock) => (await db.admin('select placed_on::text, opened_on::text, placed_count, age_days_at_placement, breed, version from public.flocks where id = $1', [flock])).rows[0];

  // ── ١) تعديل الفوج ─────────────────────────────────────────────────────────────────────────────────────────────
  const H = { five: await hall('قاعة 5'), six: await hall('قاعة 6'), seven: await hall('قاعة 7'), eight: await hall('قاعة 8') };
  const f5 = await open(H.five, day(-1), 22500, 0);
  const ref = uid();
  const fixed = await call(db, U.manager, EDIT, [f5, 1, day(-2), 22500, 0, null, ref]);
  t.same([fixed.ok, fixed.value?.changed, fixed.value?.version, fixed.value?.placed_on], [true, true, 2, day(-2)], 'تعديل الفوج: «قاعة 5» من 14/11 إلى 13/11 (كلمة الزبون)، والنسخة 2');
  t.same(await flockRow(f5), { placed_on: day(-2), opened_on: day(-2), placed_count: 22500, age_days_at_placement: 0, breed: null, version: 2 }, 'والفتح يتبع التسكين (النسخة الأولى)');
  const overview = await one(U.manager, 'select public.flocks_overview() as v', []);
  const five = overview.sites.flatMap((s) => s.halls).find((h) => h.id === H.five);
  t.eq(five?.flock?.age_days, 2, 'وعمر الفوج في جدول القاعات يتبع التاريخ الجديد (يومان)');
  const again = await call(db, U.manager, EDIT, [f5, 1, day(-2), 22500, 0, null, ref]);
  t.same([again.ok, again.value?.version], [true, 2], 'الإعادة بالمرجع نفسه بعد جواب ضاع ترجّع النتيجة نفسها');
  t.eq(shown(await call(db, U.manager, EDIT, [f5, 1, day(-3), 22500, 0, null, ref])), 'ref_reused', 'والمرجع نفسه بطلب آخر ref_reused');
  t.eq(shown(await call(db, U.manager, EDIT, [f5, 1, day(-3), 22500, 0, null, uid()])), 'stale_flock', 'النسخة القديمة (من شاشة قبل التعديل) stale_flock');

  await one(U.hallWorker, 'select public.save_flock_day($1, $2, 5, 1, 300.5, null, null, null, null, null, null, null, null, $3, false) as v', [f5, day(-1), uid()]);
  const late = await call(db, U.manager, EDIT, [f5, 2, TODAY, 22500, 0, null, uid()]);
  t.same([shown(late), late.hint?.includes(dmy(day(-1)))], ['records_before_placement', true], 'التسكين بعد أوّل جولة مرفوض، والجملة تسمّي يومها');
  t.eq(shown(await call(db, U.manager, EDIT, [f5, 2, day(-1), 22500, 0, null, uid()])), 'ok', 'والتسكين يوم الجولة نفسه مقبول');
  const below = await call(db, U.manager, EDIT, [f5, 3, day(-1), 5, 0, null, uid()]);
  t.same([shown(below), below.hint?.includes('6')], ['count_below_losses', true], 'العدد أقلّ من النافق والمستبعد (6) مرفوض');
  t.eq(shown(await call(db, U.manager, EDIT, [f5, 3, day(-1), 6, 0, null, uid()])), 'ok', 'والعدد مساوياً لهما مقبول (الحيّ صفر)');
  t.eq(shown(await call(db, U.manager, EDIT, [f5, 4, day(1), 22500, 0, null, uid()])), 'date_in_future', 'تاريخ بعد اليوم مرفوض');
  t.eq(shown(await call(db, U.manager, EDIT, [f5, 4, null, 22500, 0, null, uid()])), 'date_required', 'بلا تاريخ مرفوض');
  t.eq(shown(await call(db, U.manager, EDIT, [f5, 4, day(-2), 0, 0, null, uid()])), 'bad_count', 'عدد صفر مرفوض');
  t.eq(shown(await call(db, U.manager, EDIT, [f5, 4, day(-2), 22500, 1001, null, uid()])), 'bad_age', 'عمر فوق 1,000 مرفوض');
  t.eq(shown(await call(db, U.manager, EDIT, [f5, 4, day(-2), 22500, 0, 'س'.repeat(81), uid()])), 'bad_breed', 'سلالة فوق 80 حرفاً مرفوضة');
  const back = await call(db, U.manager, EDIT, [f5, 4, day(-2), 22500, 0, '  روس  ', uid()]);
  t.same([back.value?.changed, back.value?.breed, back.value?.version], [true, 'روس', 5], 'التاريخ والعدد والسلالة معاً، والسلالة بلا فراغ طرفيها');
  const same = await call(db, U.manager, EDIT, [f5, 5, day(-2), 22500, 0, 'روس', uid()]);
  t.same([same.value?.changed, same.value?.version, await version(f5)], [false, 5, 5], 'بلا تغيير: changed = false والنسخة كما هي');
  for (const role of OTHERS) t.eq(shown(await call(db, U[role], EDIT, [f5, 5, day(-2), 22500, 0, null, uid()])), 'forbidden', `تعديل الفوج للمالك والمدير: ${role} forbidden`);
  t.eq(shown(await call(db, U.layerManager, EDIT, [f5, 5, day(-2), 22500, 0, null, uid()])), 'out_of_scope', 'ومدير بنطاق البيّاض out_of_scope');
  t.eq(shown(await call(db, U.owner, EDIT, [uid(), 1, day(-2), 1000, 0, null, uid()])), 'flock_not_found', 'فوج غير موجود flock_not_found');

  // الصرف ولو أُلغي، والتأشير الحيّ، يمنعان تسكيناً بعدهما (كثوابت verify_flock_issues وverify_halls).
  const items = {
    starter: await one(U.owner, "insert into public.items (name, kind, base_unit) values ('علف بادئ', 'feed', 'kg') returning id", []),
  };
  await postedOpening(db, U.owner, W.feed, day(-9), [{ item: items.starter, qty: 2000, value: '1000000.00' }]);
  const f6 = await open(H.six, day(-4), 3000, 0);
  const issue = await one(U.manager, 'select public.record_flock_issue($1, $2, $3, $4, $5, 50, $6, null) as v', [uid(), uid(), uid(), f6, items.starter, day(-3)]);
  await one(U.manager, 'select public.void_flock_issue($1, $2, $3) as v', [issue.id, 'صرف لقاعة أخرى', uid()]);
  const voided = await call(db, U.manager, EDIT, [f6, await version(f6), day(-2), 3000, 0, null, uid()]);
  t.same([shown(voided), voided.hint?.includes(dmy(day(-3)))], ['records_before_placement', true], 'صرف ملغى قبل التاريخ الجديد يمنعه (verify_flock_issues يعدّ كلّ صرف)');
  t.eq(shown(await call(db, U.manager, EDIT, [f6, await version(f6), day(-5), 3000, 0, null, uid()])), 'ok', 'والتسكين أبكر من كلّ سجلّ مقبول');

  // ── ٢) حذف الفوج المفتوح غلطاً ───────────────────────────────────────────────────────────────────────────────────
  const f8 = await open(H.eight, day(-1), 1000, 0);
  const dref = uid();
  const gone = await call(db, U.manager, DEL, [f8, 1, dref]);
  t.same([gone.ok, gone.value?.deleted, await admin1('select count(*)::int from public.flocks where id = $1', [f8])], [true, true, 0], 'حذف فوج بلا سجلّ: يختفي');
  t.eq(await admin1("select count(*)::int from public.audit_log where table_name = 'flocks' and old ->> 'id' = $1::text", [f8]), 1, 'وسجلّ التدقيق يحفظ صفّه');
  t.same(canon((await call(db, U.manager, DEL, [f8, 1, dref])).value), canon({ flock_id: f8, deleted: true }), 'الإعادة بالمرجع نفسه ترجّع النتيجة نفسها');
  t.same(canon((await call(db, U.manager, DEL, [f8, 1, uid()])).value), canon({ flock_id: f8, deleted: false }), 'وبمرجع آخر: الفوج غير موجود، deleted = false بلا خطأ');
  const f8b = await open(H.eight, day(-2), 1200, 0);
  t.ok(Boolean(f8b), 'والقاعة فارغة: يُفتح فيها الفوج بتاريخه الصحيح');
  const busy = await call(db, U.manager, DEL, [f5, await version(f5), uid()]);
  t.same([shown(busy), busy.hint?.includes('جولات يومية'), busy.hint?.includes('عدّل الفوج')], ['flock_has_records', true, true], 'فوج له جولة لا يُحذف، والجملة تسمّي ما له وتدلّ على «عدّل الفوج»');
  const issued = await call(db, U.manager, DEL, [f6, await version(f6), uid()]);
  t.same([shown(issued), issued.hint?.includes('صرف من المخزن')], ['flock_has_records', true], 'وفوج له صرف (ولو ملغى) لا يُحذف');
  t.eq(shown(await call(db, U.manager, DEL, [f8b, 9, uid()])), 'stale_flock', 'الحذف بنسخة قديمة stale_flock');
  for (const role of OTHERS) t.eq(shown(await call(db, U[role], DEL, [f8b, 1, uid()])), 'forbidden', `حذف الفوج للمالك والمدير: ${role} forbidden`);
  t.eq(shown(await call(db, U.layerManager, DEL, [f8b, 1, uid()])), 'out_of_scope', 'ومدير بنطاق البيّاض out_of_scope');

  // ── ٣) جدول لقاحات القاعة ─────────────────────────────────────────────────────────────────────────────────────────
  const nd = (await one(U.owner, "select public.save_vaccine($1, 'ND', null, null) as v", [uid()])).id;
  const ib = (await one(U.owner, "select public.save_vaccine($1, 'IB', null, null) as v", [uid()])).id;
  await one(U.owner, 'select public.save_vaccine_program($1, $2, $3::jsonb, $4) as v', ['broiler', 42, JSON.stringify([{ vaccine_id: nd, age_day: 7 }, { vaccine_id: ib, age_day: 14 }]), 0]);
  const HA = await hall('قاعة 10');
  const HB = await hall('قاعة 11');
  const fa = await open(HA, day(-5), 5000, 0);
  const fb = await open(HB, day(-5), 5000, 0);
  const reminders = async () => (await one(U.manager, 'select public.vaccine_reminders() as v', [])).items;
  const dueIn = async (hallId) => (await reminders()).filter((x) => x.hall_id === hallId).map((x) => `${x.name}:${x.age_day}:${x.due_on}`);
  t.same([await dueIn(HA), await dueIn(HB)], [[`ND:7:${day(2)}`], [`ND:7:${day(2)}`]], 'قبل الجدول الخاصّ: القاعتان بجدول اللاحم العامّ');
  const saved = await call(db, U.manager, SAVE_H, [HA, 35, JSON.stringify([{ vaccine_id: ib, age_day: 6 }]), 0]);
  t.same(canon(saved.value), canon({ hall_id: HA, kind: 'broiler', version: 1, end_age: 35, days: 1 }), 'جدول خاصّ لـ«قاعة 10» (كلمة الزبون: «كل قاعة واحد»)');
  t.same([await dueIn(HA), await dueIn(HB)], [[`IB:6:${day(1)}`], [`ND:7:${day(2)}`]], 'التذكير: «قاعة 10» بجدولها الخاصّ وحده، و«قاعة 11» بالعامّ');
  const board = await one(U.hallWorker, 'select public.vaccine_board() as v', []);
  const boardHall = (hallId) => board.halls.find((h) => h.id === hallId);
  t.same(canon([boardHall(HA)?.program, boardHall(HB)?.program, boardHall(HA)?.kind, boardHall(HA)?.site_name]),
    canon([{ version: 1, end_age: 35, days: [{ vaccine_id: ib, age_day: 6 }] }, null, 'broiler', 'حقل الزبون']), 'لوحة اللقاحات: القاعات بجداولها الخاصّة أو null');
  t.eq((await one(U.layerManager, 'select public.vaccine_board() as v', [])).halls.some((h) => h.id === HA), false, 'ومن لا يرى حقل اللحم لا يرى قاعاته في اللوحة');
  const reportEnd = async (flock) => (await one(U.manager, 'select public.flock_cycle_report($1) as v', [flock])).flock.end_age;
  t.same([await reportEnd(fa), await reportEnd(fb)], [35, 42], 'تقرير الدورة: نهاية الدورة من جدول القاعة الخاصّ، وإلّا العامّ');
  const planned = async (flock) =>
    (await one(U.manager, 'select public.flock_month($1, $2) as v', [flock, TODAY])).days.flatMap((d) => d.vaccines.map((v) => `${v.name}:${v.age_day}:${v.state}`));
  t.same([await planned(fa), await planned(fb)], [['IB:6:planned'], ['ND:7:planned', 'IB:14:planned']], 'التقويم الشهري: مواعيد كلّ قاعة من جدولها (الخاصّ وحده، أو العامّ)');
  const mark = (flock, vaccine, age) => JSON.stringify([{ kind: 'vaccination', flock_id: flock, id: uid(), vaccine_id: vaccine, age_day: age }]);
  t.eq(shown(await call(db, U.hallWorker, 'select public.give_to_flocks($1, $2, $3::jsonb) as v', [uid(), TODAY, mark(fa, nd, 7)])), 'not_in_program', 'التأشير: ND يوم 7 ليس في جدول «قاعة 10» الآن');
  t.eq(shown(await call(db, U.hallWorker, 'select public.give_to_flocks($1, $2, $3::jsonb) as v', [uid(), TODAY, mark(fa, ib, 6)])), 'ok', 'وIB يوم 6 من جدولها يُؤشَّر');
  t.eq(shown(await call(db, U.manager, SAVE_H, [HA, 35, '[]', 0])), 'stale_program', 'حفظ بنسخة قديمة (0 بعد الإنشاء) stale_program');
  t.eq(shown(await call(db, U.manager, SAVE_H, [HA, 35, JSON.stringify([{ vaccine_id: ib, age_day: 40 }]), 1])), 'bad_day', 'يوم بعد نهاية الدورة bad_day');
  t.eq(shown(await call(db, U.manager, SAVE_H, [HA, 35, JSON.stringify([{ vaccine_id: ib, age_day: 6 }, { vaccine_id: ib, age_day: 6 }]), 1])), 'duplicate_day', 'اللقاح في اليوم نفسه مرّتين duplicate_day');
  t.eq(shown(await call(db, U.manager, SAVE_H, [HA, 35, JSON.stringify([{ vaccine_id: uid(), age_day: 6 }]), 1])), 'vaccine_not_found', 'لقاح غير موجود vaccine_not_found');
  t.eq(shown(await call(db, U.manager, SAVE_H, [HA, 0, '[]', 1])), 'bad_end_age', 'نهاية دورة صفر bad_end_age');
  t.eq(shown(await call(db, U.manager, SAVE_H, [uid(), 35, '[]', 0])), 'hall_not_found', 'قاعة غير موجودة hall_not_found');
  const two = await call(db, U.manager, SAVE_H, [HA, 35, JSON.stringify([{ vaccine_id: ib, age_day: 6 }, { vaccine_id: nd, age_day: 12 }]), 1]);
  t.same([two.value?.version, two.value?.days], [2, 2], 'الحفظ بنسخته يكتب الجدول كلّه (النسخة 2)');
  for (const role of OTHERS) {
    t.eq(shown(await call(db, U[role], SAVE_H, [HB, 42, '[]', 0])), 'forbidden', `جدول القاعة لمن يدير الحقول: ${role} forbidden`);
    t.eq(shown(await call(db, U[role], DROP_H, [HA, 2])), 'forbidden', `وحذفه: ${role} forbidden`);
  }
  t.eq(shown(await call(db, U.layerManager, SAVE_H, [HB, 42, '[]', 0])), 'out_of_scope', 'ومدير بنطاق البيّاض out_of_scope');
  const archivedHall = await hall('قاعة مؤرشفة');
  await one(U.owner, 'update public.halls set archived_at = now() where id = $1 returning id', [archivedHall]);
  t.eq(shown(await call(db, U.manager, SAVE_H, [archivedHall, 42, '[]', 0])), 'hall_archived', 'قاعة مؤرشفة hall_archived');

  // جلستان حقيقيّتان: إضافة لقاعة بجدول خاصّ تمسك جدولها للمشاركة، فحفظه من جهاز آخر ينتظرها ثمّ يكمل.
  {
    const marker = await db.session(U.hallWorker);
    const editor = await db.session(U.manager);
    try {
      const first = await marker.run('select public.give_to_flocks($1, $2, $3::jsonb) as v', [uid(), TODAY, mark(fa, nd, 12)]);
      const pending = editor.run(SAVE_H, [HA, 35, JSON.stringify([{ vaccine_id: ib, age_day: 6 }]), 2]);
      const state = await db.settle(pending, editor.pid);
      await marker.commit();
      const done = await pending;
      if (done.ok) await editor.commit();
      t.same([first.ok, state, done.ok ? done.rows[0].v.version : done.error], [true, 'blocked', 3], 'الإضافة تمسك جدول القاعة: الحفظ من جهاز آخر ينتظرها ثمّ يكمل بنسخته');
    } finally {
      await marker.rollback();
      await editor.rollback();
    }
  }

  const delIb = await call(db, U.manager, 'select public.delete_vaccine($1, (select version from public.vaccines where id = $1)) as v', [ib]);
  const haRow = (await db.admin('select version, (select count(*)::int from public.hall_vaccine_program_days d where d.hall_id = p.hall_id) as days from public.hall_vaccine_programs p where hall_id = $1', [HA])).rows[0];
  t.same([delIb.value?.result, haRow], ['archived', { version: 4, days: 0 }], 'حذف لقاح مؤشَّر به: يُخفى ويخرج من جدول القاعة (النسخة +1)');
  t.same(await dueIn(HA), [], 'وجدول «قاعة 10» الخاصّ بلا أيّام: لا مواعيد لها (لا تعود إلى العامّ وحدها)');
  t.eq(shown(await call(db, U.manager, DROP_H, [HA, 3])), 'stale_program', 'حذف الجدول بنسخة قديمة stale_program');
  t.same(canon((await call(db, U.manager, DROP_H, [HA, 4])).value), canon({ hall_id: HA, dropped: true }), 'حذف جدول القاعة الخاصّ');
  t.same(canon((await call(db, U.manager, DROP_H, [HA, 4])).value), canon({ hall_id: HA, dropped: false }), 'وحذفه ثانيةً: لا جدول، dropped = false بلا خطأ');
  t.same(await dueIn(HA), [`ND:7:${day(2)}`], 'وتعود «قاعة 10» إلى الجدول العامّ');
  // الحذف يُبقي الصفّ بنسخة أكبر (مراجعة شاشات 0028، ABA): إعادة الإنشاء تكمل النسخة، فتعديل بُني على جدول قديم بالنسخة نفسها لا يكتب فوق الجديد.
  t.same((await db.admin('select version, dropped_at is not null as dropped from public.hall_vaccine_programs where hall_id = $1', [HA])).rows[0], { version: 5, dropped: true },
    'الحذف يُبقي صفّ الجدول بنسخة أكبر بلا أيّام');
  const reborn = await call(db, U.manager, SAVE_H, [HA, 30, JSON.stringify([{ vaccine_id: nd, age_day: 8 }]), 0]);
  t.same([reborn.value?.version, await dueIn(HA)], [6, [`ND:8:${day(3)}`]], 'جدول خاصّ جديد بعد الحذف: النسخة تكمل (6)، ويحلّ محلّ العامّ من جديد');
  t.eq(shown(await call(db, U.manager, SAVE_H, [HA, 30, '[]', 1])), 'stale_program', 'وتعديل بُني على نسخة 1 القديمة لا يكتب فوق الجدول الجديد');
  t.eq(shown(await call(db, U.manager, SAVE_H, [HA, 30, '[]', 0])), 'stale_program', 'وإنشاء ثانٍ (0) والجدول قائم stale_program');
  t.same(canon((await call(db, U.manager, DROP_H, [HA, 6])).value), canon({ hall_id: HA, dropped: true }), 'ويُحذف بنسخته الجديدة');
  await db.asOwner(async (oq) => {
    await oq("insert into public.hall_vaccine_programs (org_id, hall_id, kind, end_age) values ($1, $2, 'layer', 20)", [org, HB]);
    await oq('insert into public.hall_vaccine_program_days (org_id, hall_id, vaccine_id, age_day) values ($1, $2, $3, 30)', [org, HB, nd]);
    const v = Object.fromEntries((await oq('select check_name, violations from public.verify_halls()')).rows.map((r) => [r.check_name, Number(r.violations)]));
    t.same([v.hall_program_kind, v.hall_program_days], [1, 1], 'verify_halls: نوع جدول القاعة غير نوع حقلها، ويوم بعد نهاية دورته (بمعاملة تُرجَع)');
  });

  // ── ٤) «احفظ التعديل» للخلطة ─────────────────────────────────────────────────────────────────────────────────────
  const item = (name, kind, unit, density = null) =>
    one(U.owner, 'insert into public.items (name, kind, base_unit, density_kg_per_l) values ($1, $2, $3, $4) returning id', [name, kind, unit, density]);
  const I = {
    corn: await item('ذرة', 'raw', 'kg'),
    soy: await item('صويا', 'raw', 'kg'),
    oil: await item('زيت', 'raw', 'L', 0.92),
    diesel: await item('كاز', 'fuel', 'L', 0.85),
    bags: await item('أكياس', 'packaging', 'pc'),
    thin: await item('سائل بلا كثافة', 'raw', 'L'),
    feed: await item('علف الزبون', 'feed', 'kg'),
  };
  const labor = await one(U.manager, "insert into public.expense_categories (name) values ('أجور الخلط') returning id", []);
  const create = async (name, items, rates = []) => {
    const recipe = uid();
    const versionId = uid();
    await one(U.manager, 'select public.create_recipe($1, $2, $3, $4, null, $5::jsonb, $6::jsonb, true) as v', [recipe, versionId, name, I.feed, lines(...items), JSON.stringify(rates)]);
    return { recipe, version: versionId };
  };
  const versions = async (recipe) => (await db.admin('select id, status from public.recipe_versions where recipe_id = $1 order by version_no', [recipe])).rows;
  const activeLines = async (recipe) =>
    (await db.admin("select l.item_id from public.recipe_lines l join public.recipe_versions v on v.id = l.version_id where v.recipe_id = $1 and v.status = 'active' order by l.line_no", [recipe])).rows.map((r) => r.item_id);
  const R = await create('تسويه', [I.corn, I.soy]);
  const rref = uid();
  const edited = await call(db, U.manager, EDIT_R, [R.recipe, R.version, 'تسوية', lines(I.soy, I.corn, I.oil), rref]);
  const afterEdit = await versions(R.recipe);
  t.same([edited.ok, edited.value?.changed, edited.value?.name, edited.value?.lines, afterEdit.map((v) => v.status)], [true, true, 'تسوية', 3, ['retired', 'active']],
    '«احفظ التعديل»: الاسم والموادّ والتفعيل بنداء واحد (كلمة الزبون: «تدوس عليها وتعدلها وليس تتعدل»)');
  t.same(await activeLines(R.recipe), [I.soy, I.corn, I.oil], 'والموادّ بترتيبها');
  t.same((await call(db, U.manager, EDIT_R, [R.recipe, R.version, 'تسوية', lines(I.soy, I.corn, I.oil), rref])).value, edited.value, 'الإعادة بالمرجع نفسه ترجّع النتيجة نفسها');
  t.eq(shown(await call(db, U.manager, EDIT_R, [R.recipe, R.version, 'تسوية', lines(I.corn), uid()])), 'recipe_changed', 'بالنسخة المفعَّلة القديمة (من شاشة قبل التعديل) recipe_changed');
  const activeNow = edited.value.version_id;
  const unchanged = await call(db, U.manager, EDIT_R, [R.recipe, activeNow, 'تسوية', lines(I.soy, I.corn, I.oil), uid()]);
  t.same([unchanged.value?.changed, unchanged.value?.version_id, (await versions(R.recipe)).length], [false, activeNow, 2], 'بلا تغيير: لا نسخة جديدة');
  const renamed = await call(db, U.manager, EDIT_R, [R.recipe, activeNow, 'تسوية أولى', lines(I.soy, I.corn, I.oil), uid()]);
  t.same([renamed.value?.changed, renamed.value?.version_id, (await versions(R.recipe)).length, await admin1('select name from public.recipes where id = $1', [R.recipe])],
    [true, activeNow, 2, 'تسوية أولى'], 'تغيير الاسم وحده بلا نسخة جديدة');
  const fail = async (args) => shown(await call(db, U.manager, EDIT_R, args));
  t.eq(await fail([R.recipe, activeNow, 'تسوية أولى', lines(I.corn, I.corn), uid()]), 'item_duplicated', 'مادّة مرّتين item_duplicated');
  t.eq(await fail([R.recipe, activeNow, 'تسوية أولى', '[]', uid()]), 'lines_required', 'بلا موادّ lines_required');
  t.eq(await fail([R.recipe, activeNow, 'تسوية أولى', lines(I.corn, I.bags), uid()]), 'bad_recipe_unit', 'مادّة بالقطعة bad_recipe_unit');
  t.eq(await fail([R.recipe, activeNow, 'تسوية أولى', lines(I.corn, I.thin), uid()]), 'density_required', 'سائل بلا كثافة density_required');
  t.eq(await fail([R.recipe, activeNow, 'تسوية أولى', lines(I.diesel), uid()]), 'no_mass_inputs', 'وقود وحده no_mass_inputs');
  t.eq(await fail([R.recipe, activeNow, '   ', lines(I.corn), uid()]), 'invalid_name', 'اسم فارغ invalid_name');
  const other = await create('مرحلة اولى', [I.corn]);
  t.eq(await fail([R.recipe, activeNow, 'مرحلة اولى', lines(I.corn), uid()]), 'recipe_name_taken', 'اسم خلطة أخرى recipe_name_taken');
  t.same([(await versions(R.recipe)).length, await activeLines(R.recipe)], [2, [I.soy, I.corn, I.oil]], 'والرفض لا يغيّر شيئاً');
  for (const role of OTHERS) t.eq(shown(await call(db, U[role], EDIT_R, [R.recipe, activeNow, 'تسوية أولى', lines(I.corn), uid()])), 'forbidden', `تعديل الخلطة لمن يفعّلها: ${role} forbidden`);
  const withRate = await create('خلطة بتكلفة', [I.corn], [{ category_id: labor, amount_per_ton: '1500' }]);
  const rated = await one(U.manager, EDIT_R, [withRate.recipe, withRate.version, 'خلطة بتكلفة', lines(I.corn, I.soy), uid()]);
  t.same((await db.admin('select category_id, amount_per_ton::text from public.recipe_cost_rates where version_id = $1', [rated.version_id])).rows, [{ category_id: labor, amount_per_ton: '1500.00' }],
    'نسخة التعديل الجديدة تنسخ تكاليف المفعَّلة لكلّ طنّ');
  // مسوّدة قائمة من «عدّل الخلطة» القديم: تُستعمل (لا نسخة ثالثة)، وتُستبدل موادّها، وتبقى تكاليفها.
  const draft = await one(U.manager, 'select public.new_recipe_version($1, $2) as v', [other.recipe, uid()]);
  await one(U.manager, 'insert into public.recipe_cost_rates (version_id, category_id, amount_per_ton) values ($1, $2, 900) returning id', [draft.version_id, labor]);
  const viaDraft = await one(U.manager, EDIT_R, [other.recipe, other.version, 'مرحلة اولى', lines(I.soy), uid()]);
  t.same([viaDraft.version_id, (await versions(other.recipe)).map((v) => v.status), await activeLines(other.recipe),
    await admin1('select count(*)::int from public.recipe_cost_rates where version_id = $1', [draft.version_id])],
  [draft.version_id, ['retired', 'active'], [I.soy], 1], 'المسوّدة القائمة تصير المفعَّلة بالموادّ الجديدة وتكاليفها');
  await one(U.manager, 'update public.recipes set archived_at = now() where id = $1 returning id', [withRate.recipe]);
  t.eq(await fail([withRate.recipe, rated.version_id, 'خلطة بتكلفة', lines(I.corn), uid()]), 'recipe_archived', 'خلطة محذوفة من المعمل recipe_archived');

  // ── التكامل: أجوبة القاعدة الحقيقية لكلّ دالّة جديدة تمرّ بمحلّلات الشاشات الحقيقية ونداءاتها ──────────────────────────────────────────
  {
    const repo = await loadScreensRepo();
    const seen = [];
    const answer = (value) => {
      globalThis.__ce = (fn, args) => {
        seen.push([fn, Object.keys(args ?? {}).sort().join(',')]);
        return Promise.resolve(value);
      };
    };
    try {
      answer(fixed.value);
      const e = await repo.editFlock({ flockId: f5, expectedVersion: 1, placedOn: day(-2), placedCount: 22500, ageDays: 0, breed: '' }, uid());
      answer(gone.value);
      const d = await repo.deleteFlock(f8, 1, uid());
      answer(saved.value);
      const s = await repo.saveHallVaccineProgram(HA, 35, [{ vaccineId: ib, ageDay: 6 }], 0);
      answer({ hall_id: HA, dropped: true });
      const b = repo.parseVaccineBoard(board);
      answer(edited.value);
      const r = await repo.editRecipe({ recipeId: R.recipe, expectedActive: R.version, name: 'تسوية', lines: [{ itemId: I.soy }, { itemId: I.corn }, { itemId: I.oil }], clientRef: uid() });
      t.same([e.version, e.placedOn, e.changed, d.deleted, s.version, s.kind, b.halls?.find((h) => h.id === HA)?.program?.endAge, r.changed, r.lines],
        [2, day(-2), true, true, 1, 'broiler', 35, true, 3], 'التكامل: أجوبة edit_flock وdelete_flock وsave_hall_vaccine_program وvaccine_board وedit_recipe الحقيقية تُقرأ بمحلّلات الشاشات');
      t.same(seen.map(([fn, keys]) => `${fn}(${keys})`), [
        'edit_flock(p_age_days,p_breed,p_client_ref,p_expected_version,p_flock,p_placed_count,p_placed_on)',
        'delete_flock(p_client_ref,p_expected_version,p_flock)',
        'save_hall_vaccine_program(p_days,p_end_age,p_expected_version,p_hall)',
        'edit_recipe(p_client_ref,p_expected_active,p_lines,p_name,p_recipe)',
      ], 'والشاشات تنادي الدوالّ الجديدة بأسماء معاملاتها في الهجرة');
    } finally {
      delete globalThis.__ce;
    }
  }

  // ── ٥) الطفرات: كلّ قاعدة مكسورة يفشل فحصها ────────────────────────────────────────────────────────────────────────────
  await mutant(db, U.manager, [[FN.edit, [['  if v_first is not null and p_placed_on > v_first then', '  if false then']]]], async ({ attempt, oq }) => {
    const r = await attempt(U.manager, async (q) => (await q(EDIT, [f5, await version(f5), TODAY, 22500, 0, null, uid()])).rows[0].v);
    const v = (await oq('select * from public.verify_flocks()')).rows.find((x) => x.check_name === 'day_before_placement');
    t.ok(r.ok && Number(v.violations) === 1, 'طفرة: بلا فحص أوّل سجلّ يصير التسكين بعد جولة فيمسكه day_before_placement');
  });
  // 0029 أضاف بعد الكتابة flock_live_check (الحيّ بالمباع وفرق العدّ لا يصير سالباً في أيّ يوم)، فالطفرة تكسر الحاجزين معاً ليصل الثابت.
  await mutant(db, U.manager, [[FN.edit, [['  if p_placed_count < v_losses then', '  if false then'], ['    perform private.flock_live_check(f);\n', '']]]], async ({ attempt, oq }) => {
    const r = await attempt(U.manager, async (q) => (await q(EDIT, [f5, await version(f5), day(-2), 1, 0, null, uid()])).rows[0].v);
    const v = (await oq('select * from public.verify_flocks()')).rows.find((x) => x.check_name === 'live_negative');
    t.ok(r.ok && Number(v.violations) === 1, 'طفرة: بلا فحص النافق يصير الحيّ سالباً فيمسكه live_negative');
  });
  await mutant(db, U.manager, [[FN.edit, [['  if p_placed_count < v_losses then', '  if false then']]]], async ({ attempt }) => {
    const r = await attempt(U.manager, async (q) => (await q(EDIT, [f5, await version(f5), day(-2), 1, 0, null, uid()])).rows[0].v);
    t.same([r.ok, r.code], [false, 'live_negative'], 'طفرة 0029: بلا فحص النافق وحده يرفض flock_live_check التعديل بالحيّ السالب');
  });
  await mutant(db, U.manager, [[FN.edit, [['  if p_expected_version is null or f.version <> p_expected_version then', '  if false then']]]], async ({ attempt }) => {
    const r = await attempt(U.manager, async (q) => (await q(EDIT, [f5, 1, day(-2), 22500, 0, null, uid()])).rows[0].v);
    t.ok(r.ok, 'طفرة: بلا شرط النسخة يُكتب فوق تعديل جهاز آخر');
  });
  await mutant(db, U.manager, [[FN.del, [['  if cardinality(v_has) > 0 then', '  if false then']]]], async ({ attempt }) => {
    const r = await attempt(U.manager, async (q) => (await q(DEL, [f5, await version(f5), uid()])).rows[0].v);
    t.same([r.ok, r.code, r.hint.includes('سجلّ مرتبط به')], [false, 'flock_has_records', true], 'طفرة: بلا الفحص الصريح يمسك المفتاح الأجنبيّ الحذف بالجملة نفسها لا بخطأ خام');
  });
  await mutant(db, U.manager, [[FN.recipe, [['  if v_active is distinct from p_expected_active then', '  if false then']]]], async ({ attempt }) => {
    const r = await attempt(U.manager, async (q) => (await q(EDIT_R, [R.recipe, R.version, 'تسوية أولى', lines(I.corn), uid()])).rows[0].v);
    t.ok(r.ok, 'طفرة: بلا شرط النسخة المفعَّلة يُكتب تعديل شاشة قديمة فوق تعديل أحدث');
  });
  await mutant(db, U.manager, [[FN.slots, [['    and not exists (select 1 from public.hall_vaccine_programs hp where hp.org_id = f.org_id and hp.hall_id = f.hall_id and hp.dropped_at is null)\n', '']]]], async ({ attempt, oq }) => {
    await oq('select public.save_hall_vaccine_program($1, 35, $2::jsonb, 0)', [HB, JSON.stringify([{ vaccine_id: nd, age_day: 8 }])]);
    const r = await attempt(U.manager, async (q) => (await q('select public.vaccine_reminders() as v')).rows[0].v.items.filter((x) => x.hall_id === HB).map((x) => x.age_day));
    t.same(r.value, [7, 8], 'طفرة: بلا استبعاد جدول النوع يختلط العامّ بجدول القاعة الخاصّ');
  });

  // ── ٦) الفترة المقفلة (آخر الملف: القفل يبقى) ─────────────────────────────────────────────────────────────────────
  const f7 = await open(H.seven, day(-6), 4000, 0);
  await one(U.owner, 'select public.set_period_lock($1) as v', [day(-8)]);
  const locked = await call(db, U.manager, EDIT, [f7, await version(f7), day(-9), 4000, 0, null, uid()]);
  t.same([shown(locked), locked.hint?.includes(dmy(day(-8)))], ['period_locked', true], 'تسكين جديد داخل فترة مقفلة مرفوض');
  t.eq(shown(await call(db, U.manager, EDIT, [f7, await version(f7), day(-6), 4100, 0, null, uid()])), 'ok', 'وتعديل فوج تسكينه بعد القفل مقبول');
  const closedFlock = await open(await hall('قاعة 9'), day(-7), 900, 0);
  t.ok(Boolean(closedFlock), 'فوج قبل القفل بيوم');
  await one(U.owner, 'select public.set_period_lock($1) as v', [day(-7)]);
  t.eq(shown(await call(db, U.manager, EDIT, [closedFlock, await version(closedFlock), day(-6), 900, 0, null, uid()])), 'period_locked', 'وتسكين قديم داخل الفترة لا يُنقل منها');
  t.eq(shown(await call(db, U.manager, DEL, [closedFlock, await version(closedFlock), uid()])), 'period_locked', 'ولا يُحذف فوج تسكينه داخلها');
  t.eq(shown(await call(db, U.manager, EDIT, [closedFlock, await version(closedFlock), day(-7), 900, 0, 'كوب', uid()])), 'ok', 'والسلالة وحدها اسم: تُعدَّل ولو في الفترة المقفلة');
}
