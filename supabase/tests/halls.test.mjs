// «القاعات بين يديك» (0026؛ كلمة المالك 2026-11-11 وأجوبته الأربعة، docs/HALLS_PLAN.md): الإضافة لعدّة قاعات بنداء واحد (صرف من المخزن على نواة
// record_flock_issue، ودواء بلا مخزن، وتأشير لقاح يُصرف إن رُبط بمادّة)، والنقص المجموع عبر القاعات بجملة واحدة، والإعادة بالمرجع، والصلاحيات
// (عامل القاعة يسجّل ويؤشّر غير المربوط ولا يصرف، والأمين يصرف ولا يسجّل)، وقواعد التاريخ والنطاق؛ وقائمة اللقاحات وجدولها الواحد بشرط
// النسخة؛ والتراجع عن التأشير يعكس الصرف، وإلغاء صرف لقاح مؤشَّر وحده مرفوض؛ والقرّاء (التذكير والتقويم وتقرير الدورة واللوحة) والمال
// مقنَّع لغير أدوار الكلفة؛ وverify_halls؛ والتزامن؛ وطفرات تكسر كلّ قاعدة فيفشل فحصها؛ والعيّنات الحقيقية للشاشات (HALLS_SAMPLES_OUT=1).
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { mutant } from './purchase-kit.mjs';
import { postedOpening } from './stock-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TODAY = '2026-11-11';
const id = (n) => `d2600000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477026000${String(n).padStart(2, '0')}`;
const day = (offset) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);

const GIVE = 'select public.give_to_flocks($1, $2, $3::jsonb) as v';
const UNDO = 'select public.undo_vaccination($1, $2, $3) as v';
const SAVE_V = 'select public.save_vaccine($1, $2, $3, $4) as v';
const DEL_V = 'select public.delete_vaccine($1, $2) as v';
const SAVE_P = 'select public.save_vaccine_program($1, $2, $3::jsonb, $4) as v';
const BOARD = 'select public.vaccine_board() as v';
const REMIND = 'select public.vaccine_reminders() as v';
const MONTH = 'select public.flock_month($1, $2) as v';
const REPORT = 'select public.flock_cycle_report($1) as v';
const FN = {
  give: 'public.give_to_flocks(uuid, date, jsonb)',
  reminders: 'public.vaccine_reminders()',
  slots: 'private.flock_slots(uuid)',
  guard: 'private.flock_issue_vaccination_guard()',
  month: 'public.flock_month(uuid, date)',
  undo: 'public.undo_vaccination(uuid, text, uuid)',
};

const hasMoney = (value) => {
  if (Array.isArray(value)) return value.some(hasMoney);
  if (value && typeof value === 'object') return Object.entries(value).some(([key, v]) => key === 'money' || hasMoney(v));
  return false;
};
const norm = (value) => (value === null || value === undefined ? value : String(value).includes('.') ? String(value).replace(/0+$/u, '').replace(/\.$/u, '') : String(value));
const shown = (result) => (result.ok ? 'ok' : result.code);
/** مفاتيح كلّ كائن بترتيب ثابت (jsonb يرتّبها بالطول ثمّ بالبايت). */
const canon = (value) => JSON.parse(JSON.stringify(value, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x)));

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const G = await makeOrg(db, {
    name: 'مزرعة القاعات',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['storekeeper', 'storekeeper', ['feed_mill', 'broiler', 'medicine']],
      ['accountant', 'accountant'],
      ['hallWorker', 'hall_worker', ['broiler']],
      ['viewer', 'viewer'],
      ['keeperMill', 'storekeeper', ['feed_mill']],
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
  const farm = await site('broiler', 'حقل الأمير');
  const layerSite = await site('layer', 'حقل البيض');
  const hall = (siteId, name) => one(U.owner, 'insert into public.halls (site_id, name) values ($1, $2) returning id', [siteId, name]);
  const H = { a: await hall(farm, 'قاعة 1'), b: await hall(farm, 'قاعة 2'), c: await hall(farm, 'قاعة 3'), old: await hall(farm, 'قاعة 4'), layer: await hall(layerSite, 'قاعة البيّاض') };
  const open = async (hallId, on, count, age0) => (await one(U.owner, 'select public.open_flock($1, $2, $3, $4, null, $5) as v', [hallId, on, count, age0, uid()])).flock_id;
  // «قاعة 1» عمرها 1 يوم التسكين قبل عشرة أيّام (عمرها اليوم 11)، و«قاعة 2» عمرها صفر قبل ستّة، و«قاعة 3» قبل يومين، و«قاعة 4» بعمر 10 قبل يوم
  // (موعد يوم العمر 7 سبق تسكينها فلا يُعدّ).
  const F = { a: await open(H.a, day(-10), 5000, 1), b: await open(H.b, day(-6), 3000, 0), c: await open(H.c, day(-2), 2000, 0), old: await open(H.old, day(-1), 1000, 10),
    layer: await open(H.layer, day(-10), 4000, 0) };
  const item = (name, kind, unit, density = null) =>
    one(U.owner, 'insert into public.items (name, kind, base_unit, density_kg_per_l) values ($1, $2, $3, $4) returning id', [name, kind, unit, density]);
  const I = { starter: await item('علف بادئ', 'feed', 'kg'), vitamin: await item('فيتامين سائل', 'medicine', 'L'), ib: await item('لقاح IB', 'vaccine', 'pc'),
    corn: await item('ذرة صفراء', 'raw', 'kg') };
  await postedOpening(db, U.owner, W.feed, day(-9), [{ item: I.starter, qty: 3000, value: '1500000.00' }]);
  await postedOpening(db, U.owner, W.medicine, day(-9), [{ item: I.vitamin, qty: 20, value: '200000.00' }, { item: I.ib, qty: 50, value: '50000.00' }]);
  await one(U.owner, "select public.save_flock_day($1, $2, 12, 3, 450, null, null, null, null, null, null, 'تهوية', null, $3, false) as v", [F.a, day(-1), uid()]);

  // ── قائمة اللقاحات: الإنشاء بلون أوّل موضع حرّ، والإعادة نفسها، والاسم المطويّ، والمادّة لقاح أو دواء، والنسخة، والصلاحية.
  const V = { ib: id(101), nd: id(102), gb: id(103) };
  const sv = (user, vid, name, itemId, version) => call(db, user, SAVE_V, [vid, name, itemId, version]);
  const created = [await sv(U.manager, V.ib, 'IB', I.ib, null), await sv(U.manager, V.nd, 'ND', null, null), await sv(U.manager, V.gb, 'غمبورو', null, null)];
  t.same(created.map((r) => (r.ok ? [r.value.version, r.value.color] : r.code)), [[1, 0], [1, 1], [1, 2]], 'اللقاحات الثلاثة بنسخة 1 وألوان 0 و1 و2 بترتيب إنشائها');
  t.same([(await sv(U.manager, V.ib, ' IB ', I.ib, null)).value].map((v) => [v.id, v.version, v.color]), [[V.ib, 1, 0]], 'إعادة إنشاء اللقاح نفسه ترجّعه بلا تكرار');
  t.same([shown(await sv(U.manager, id(104), 'ib', null, null)), shown(await sv(U.manager, id(104), 'جديد', I.starter, null)), shown(await sv(U.manager, V.nd, 'ND2', null, 7)),
    shown(await sv(U.hallWorker, id(104), 'جديد', null, null)), shown(await sv(U.manager, V.ib, 'ND', I.ib, 1))],
    ['name_taken', 'item_not_vaccine', 'stale_vaccine', 'forbidden', 'name_taken'], 'الاسم المطويّ مأخوذ، والمادّة ليست لقاحاً، والنسخة قديمة، وعامل القاعة لا يدير القائمة، وإعادة التسمية لاسم موجود');

  // ── الجدول الواحد للّاحم: IB وND في اليوم 7، وغمبورو 12، وND 14، وIB 21، ونهاية الدورة 42.
  const program = [{ vaccine_id: V.ib, age_day: 7 }, { vaccine_id: V.nd, age_day: 7 }, { vaccine_id: V.gb, age_day: 12 }, { vaccine_id: V.nd, age_day: 14 }, { vaccine_id: V.ib, age_day: 21 }];
  const sp = (user, kind, end, days, version) => call(db, user, SAVE_P, [kind, end, JSON.stringify(days), version]);
  t.same([shown(await sp(U.manager, 'broiler', 20, program, 0)), shown(await sp(U.manager, 'broiler', 42, [...program, { vaccine_id: V.nd, age_day: 14 }], 0)),
    shown(await sp(U.manager, 'broiler', 42, program, 3)), shown(await sp(U.hallWorker, 'broiler', 42, program, 0)), shown(await sp(U.manager, 'ducks', 42, [], 0))],
    ['bad_day', 'duplicate_day', 'stale_program', 'forbidden', 'bad_kind'], 'الجدول: يوم بعد النهاية، ويوم مكرّر، ونسخة غير المقروءة، وعامل القاعة، ونوع مجهول');
  t.ok((await sp(U.manager, 'broiler', 20, program, 0)).hint?.includes('«IB» في يوم العمر 21'), 'bad_day يسمّي اللقاح واليوم');
  t.same([(await sp(U.manager, 'broiler', 42, program, 0)).value].map((v) => [v.kind, v.version, v.end_age, v.days]), [['broiler', 1, 42, 5]], 'جدول اللاحم يُحفظ بنسخته الأولى');
  t.same(shown(await sp(U.manager, 'broiler', 42, program, 0)), 'stale_program', 'حفظ ثانٍ بالنسخة نفسها المقروءة قبل الحفظ يُرفض');

  // ── التذكير: «قاعة 1» فاتها IB وND يوم العمر 7 (قبل أربعة أيّام) وغداً غمبورو وبعد ثلاثة ND 14؛ و«قاعة 2» غداً IB وND؛ و«قاعة 4» لا يوم 7 لها.
  const reminders = async (user = U.manager) => (await one(user, REMIND, [])).items.map((r) => [r.hall_name, r.name, r.age_day, r.due_on, r.when, r.linked]);
  t.same(await reminders(), [
    ['قاعة 1', 'IB', 7, day(-4), 'overdue', true], ['قاعة 1', 'ND', 7, day(-4), 'overdue', false],
    ['قاعة 1', 'غمبورو', 12, day(1), 'tomorrow', false], ['قاعة 2', 'IB', 7, day(1), 'tomorrow', true], ['قاعة 2', 'ND', 7, day(1), 'tomorrow', false],
    ['قاعة 4', 'غمبورو', 12, day(1), 'tomorrow', false], ['قاعة 1', 'ND', 14, day(3), 'soon', false], ['قاعة 4', 'ND', 14, day(3), 'soon', false],
  ], 'التذكير: الفائت حتى 7 أيّام والقادم حتى 3، بالتاريخ ثمّ القاعة ثمّ اللقاح؛ و«قاعة 4» (عمرها 10 عند التسكين) بلا مواعيد اليوم 7');
  t.same([(await call(db, U.keeperMill, REMIND, [])).value.items.length, (await one(U.hallWorker, REMIND, [])).can_mark, (await one(U.storekeeper, REMIND, [])).can_mark],
    [0, true, false], 'التذكير بنطاق القارئ، والتأشير لمن يسجّل الجولة');

  // ── الإضافة لعدّة قاعات بنداء واحد.
  const lines = {
    issue: (flock, itemId, wh, qty, n) => ({ kind: 'issue', flock_id: flock, issue_id: id(200 + n), line_id: id(300 + n), item_id: itemId, warehouse_id: wh, qty }),
    log: (flock, name, dose, n) => ({ kind: 'log', flock_id: flock, id: id(400 + n), name, dose }),
    vac: (flock, vaccine, age, n, issue = null) => ({ kind: 'vaccination', flock_id: flock, id: id(500 + n), vaccine_id: vaccine, age_day: age,
      ...(issue ? { item_id: issue.item ?? I.ib, issue_id: id(600 + n), line_id: id(700 + n), warehouse_id: issue.wh, qty: issue.qty } : {}) }),
  };
  const give = (user, ref, on, list) => call(db, user, GIVE, [ref, on, JSON.stringify(list)]);
  const count = async (sql, params = [org]) => Number((await db.admin(sql, params)).rows[0].n);
  const fiCount = () => count('select count(*) as n from public.flock_issues where org_id = $1');
  const before = await fiCount();

  // النقص المجموع: 1,200 لثلاث قاعات (3,600) وعندك 3,000: جملة واحدة قبل أوّل سحب، ولا يُحفظ شيء.
  const short = await give(U.manager, uid(), TODAY, [lines.issue(F.a, I.starter, W.feed, '1200', 1), lines.issue(F.b, I.starter, W.feed, '1200', 2), lines.issue(F.c, I.starter, W.feed, '1200', 3)]);
  t.same([short.code, short.hint, await fiCount()], ['insufficient_stock',
    `لا يكفي رصيد «علف بادئ» في «رصيد العلف» لكلّ القاعات: مجموع ما طلبته 3,600 كغم لـ3 قاعات، وعندك 3,000 كغم بتاريخ ${TODAY.split('-').reverse().join('/')}.`, before],
    'النقص عبر القاعات بجملة المجموع وعدد القاعات وما عندك، ولا صرف');

  const REF1 = id(901);
  const main = [lines.issue(F.a, I.starter, W.feed, '1000', 1), lines.issue(F.b, I.starter, W.feed, '1000', 2), lines.issue(F.c, I.starter, W.feed, '500', 3),
    lines.issue(F.a, I.vitamin, W.medicine, '2', 4), lines.log(F.b, '  فيتامين AD3E ', ' 1 مل لكلّ لتر ', 1),
    lines.vac(F.a, V.ib, 7, 1, { wh: W.medicine, qty: '5' }), lines.vac(F.a, V.nd, 7, 2)];
  const first = await give(U.manager, REF1, TODAY, main);
  t.ok(first.ok, `الإضافة: ثلاث قاعات علفاً ودواءً من المخزن وتسجيل دواء وتأشيرين (${first.code ?? ''} ${first.hint ?? ''})`);
  const V1 = first.value;
  t.same([V1.on, V1.issues.map((r) => [r.flock_id, r.item_name, norm(r.qty), r.base_unit, r.hall_name]), V1.logs, V1.vaccinations.map((r) => [r.vaccine_id, r.age_day, r.issue_id !== null, r.doc_no !== null])],
    [TODAY, [[F.a, 'علف بادئ', '1000', 'kg', 'قاعة 1'], [F.b, 'علف بادئ', '1000', 'kg', 'قاعة 2'], [F.c, 'علف بادئ', '500', 'kg', 'قاعة 3'], [F.a, 'فيتامين سائل', '2', 'L', 'قاعة 1']],
      [{ id: id(401), flock_id: F.b }], [[V.ib, 7, true, true], [V.nd, 7, false, false]]],
    'الجواب بترتيب السطور: أربعة صرف FI، وتسجيل، وتأشيران (المربوط بصرفه ورقمه)');
  t.same([await fiCount() - before, (await db.admin("select name, dose from public.flock_logs where id = $1", [id(401)])).rows[0]],
    [5, { name: 'فيتامين AD3E', dose: '1 مل لكلّ لتر' }], 'خمسة صرف (أربعة واللقاح)، والاسم والجرعة بلا فراغ الطرفين');
  const stock = async (itemId, wh) => norm((await db.admin('select trim_scale(coalesce(sum(qty_left), 0))::text as q from public.stock_lots where item_id = $1 and warehouse_id = $2', [itemId, wh])).rows[0].q);
  t.same([await stock(I.starter, W.feed), await stock(I.vitamin, W.medicine), await stock(I.ib, W.medicine)], ['500', '18', '45'], 'المخزون نقص بما صُرف بالضبط');
  const again = await give(U.manager, REF1, TODAY, main);
  t.same([again.value, await fiCount() - before], [V1, 5], 'الإعادة بالمرجع نفسه ترجّع النتيجة نفسها ولا تصرف مرّتين');

  // الصلاحيات: عامل القاعة يسجّل ويؤشّر غير المربوط ولا يصرف؛ والأمين يصرف ولا يسجّل؛ والأمين خارج الحقل خارج النطاق.
  t.same([
    shown(await give(U.hallWorker, uid(), TODAY, [lines.log(F.c, 'مضادّ', null, 2), lines.vac(F.b, V.nd, 7, 3)])),
    shown(await give(U.hallWorker, uid(), TODAY, [lines.issue(F.c, I.starter, W.feed, '1', 5)])),
    shown(await give(U.hallWorker, uid(), TODAY, [lines.vac(F.b, V.ib, 7, 4, { wh: W.medicine, qty: '2' })])),
    shown(await give(U.storekeeper, uid(), TODAY, [lines.issue(F.c, I.starter, W.feed, '10', 6)])),
    shown(await give(U.storekeeper, uid(), TODAY, [lines.log(F.c, 'مضادّ', null, 3)])),
    shown(await give(U.keeperMill, uid(), TODAY, [lines.issue(F.c, I.starter, W.feed, '10', 7)])),
  ], ['ok', 'forbidden', 'forbidden', 'ok', 'forbidden', 'out_of_scope'], 'الصلاحيات: التسجيل والتأشير بفعل الجولة، والصرف بفعل الصرف، والنطاق بحقل الفوج');

  // الرفض بلا حفظ: خارج الجدول، ومؤشَّر من قبل، والمربوط بلا كمية، وغير المربوط بكمية، والمكرّر، والتاريخ، والشكل.
  const many = Array.from({ length: 101 }, (_, n) => lines.log(F.c, 'دواء', null, 50 + n));
  t.same([
    shown(await give(U.manager, uid(), TODAY, [lines.vac(F.a, V.gb, 13, 5)])),
    shown(await give(U.manager, uid(), TODAY, [lines.vac(F.a, V.nd, 7, 6)])),
    shown(await give(U.manager, uid(), TODAY, [lines.vac(F.b, V.ib, 7, 7)])),
    shown(await give(U.manager, uid(), TODAY, [{ ...lines.vac(F.c, V.nd, 7, 8), item_id: I.ib, issue_id: id(608), line_id: id(708), warehouse_id: W.medicine, qty: '1' }])),
    shown(await give(U.manager, uid(), TODAY, [lines.issue(F.c, I.starter, W.feed, '1', 8), lines.issue(F.c, I.starter, W.feed, '2', 9)])),
    shown(await give(U.manager, uid(), TODAY, [lines.issue(F.c, I.starter, W.feed, '1', 10), { ...lines.issue(F.b, I.starter, W.feed, '1', 11), line_id: id(310) }])),
    shown(await give(U.manager, uid(), day(1), [lines.log(F.c, 'دواء', null, 9)])),
    shown(await give(U.manager, uid(), day(-3), [lines.log(F.c, 'دواء', null, 10)])),
    shown(await give(U.manager, uid(), day(-8), [lines.log(F.a, 'دواء', null, 11)])),
    shown(await give(U.manager, uid(), TODAY, [])),
    shown(await give(U.manager, uid(), TODAY, many)),
    shown(await give(U.manager, uid(), TODAY, [{ ...lines.issue(F.c, I.starter, W.feed, '1', 12), qty: '1.2345' }])),
    shown(await give(U.manager, uid(), TODAY, [{ ...lines.vac(F.c, V.nd, 7, 9), qty: '1' }])),
    shown(await give(U.manager, uid(), TODAY, [lines.log(F.c, '   ', null, 12)])),
  ], ['not_in_program', 'already_vaccinated', 'vaccine_linked', 'vaccine_not_linked', 'duplicate_line', 'id_conflict', 'date_in_future', 'before_placement',
    'date_too_old', 'lines_required', 'too_many_lines', 'bad_line', 'bad_line', 'name_required'],
  'الرفض بأسمائه: خارج الجدول، ومؤشَّر، ومربوط بلا كمية، وغير مربوط بكمية، ومكرّر، ومعرّف مكرّر، والتاريخ، والشكل');

  // ── إلغاء صرف لقاح مؤشَّر وحده مرفوض، و«ألغِ التأشير» يعكسه؛ وغير المربوط يُلغى بفعل الجولة بلا سبب.
  const ibMark = id(501);
  const ibIssue = (await db.admin('select issue_id from public.flock_vaccinations where id = $1', [ibMark])).rows[0].issue_id;
  const voidDirect = await call(db, U.manager, 'select public.void_flock_issue($1, $2, $3) as v', [ibIssue, 'خطأ', uid()]);
  t.same([voidDirect.code, voidDirect.hint?.includes('ألغِ التأشير من تقويم القاعة')], ['vaccination_issue', true], 'إلغاء صرف لقاح مؤشَّر من سجلّ الصرف مرفوض بجملة تدلّ على التأشير');
  const UNDO_REF = id(902);
  t.same([shown(await call(db, U.hallWorker, UNDO, [ibMark, 'خطأ', uid()])), shown(await call(db, U.manager, UNDO, [ibMark, '  ', uid()]))], ['forbidden', 'reason_required'],
    'التراجع عن تأشير مصروف بفعل الإلغاء وبسبب');
  const undone = await call(db, U.manager, UNDO, [ibMark, 'الكمية خاطئة', UNDO_REF]);
  t.same([undone.value, (await db.admin('select status from public.flock_issues where id = $1', [ibIssue])).rows[0].status, await stock(I.ib, W.medicine)],
    [{ id: ibMark, status: 'void', issue_voided: true }, 'void', '50'], 'التراجع يُلغي التأشير وصرفه، واللقاح يرجع للمخزن');
  t.same((await call(db, U.manager, UNDO, [ibMark, 'الكمية خاطئة', UNDO_REF])).value, undone.value, 'إعادة التراجع بالمرجع نفسه ترجّع النتيجة نفسها');
  t.same((await call(db, U.hallWorker, UNDO, [id(503), null, uid()])).value, { id: id(503), status: 'void', issue_voided: false }, 'تأشير غير مربوط يُلغيه عامل القاعة بلا سبب');
  t.same((await reminders()).filter((r) => r[0] === 'قاعة 1' && r[2] === 7).map((r) => r[1]), ['IB'], 'IB يوم 7 لـ«قاعة 1» يرجع للتذكير بعد التراجع، وND يبقى مؤشَّراً');
  // عامل القاعة يحذف تسجيل الدواء، والمحذوف من قبل removed=false.
  const removed = [await one(U.hallWorker, 'select public.remove_flock_log($1) as v', [id(401)]), await one(U.hallWorker, 'select public.remove_flock_log($1) as v', [id(401)])];
  t.same(removed.map((r) => r.removed), [true, false], 'حذف تسجيل الدواء، والإعادة تقول إنّه حُذف من قبل');
  // إعادة التأشير بعد التراجع: موعد واحد بتأشير حيّ واحد.
  t.ok((await give(U.manager, uid(), TODAY, [lines.vac(F.a, V.ib, 7, 20, { wh: W.medicine, qty: '4' })])).ok, 'التأشير من جديد بعد التراجع');

  // ── تقويم «قاعة 1» لشهر اليوم: العمر، والعلف النازل، والدواء، واللقاحات بحالاتها، بلا مال.
  const month = await one(U.manager, MONTH, [F.a, '2026-11-20']);
  const dayOf = (d) => month.days.find((x) => x.on === d);
  t.same([month.month, month.prev, month.next, month.days.length, month.flock.end_age, month.flock.end_on, dayOf(day(-10)).age, (await one(U.manager, MONTH, [F.b, TODAY])).days.find((x) => x.on === day(-7)).age, dayOf(TODAY).age],
    ['2026-11-01', false, true, 30, 42, '2026-12-12', 1, null, 11], 'الشهر من أوّله، والتنقّل، والعمر من يوم التسكين، ونهاية الدورة من الجدول');
  t.same([dayOf(TODAY).issues.map((x) => [x.name, norm(x.qty), x.base_unit, norm(x.kg), x.cost_kind]), dayOf(TODAY).vaccines.map((x) => [x.name, x.age_day, x.state, x.issue_id !== null])],
    [[['علف بادئ', '1000', 'kg', '1000', 'feed'], ['فيتامين سائل', '2', 'L', null, 'medicine']], [['IB', 7, 'done', true], ['ND', 7, 'done', false]]],
    'اليوم: العلف والدواء من المخزن (صرف اللقاح المؤشَّر داخل اللقاح لا في الصرف)، واللقاحان المؤشَّران «تمّ»');
  t.same([dayOf(day(-4)).vaccines, dayOf(day(1)).vaccines.map((x) => [x.name, x.state]), dayOf(day(3)).vaccines.map((x) => [x.name, x.state]),
    dayOf(day(-1)).dead, dayOf(day(-1)).note, [norm(month.totals.feed_kg), month.totals.dead, month.totals.culled], hasMoney(month)],
    [[], [['غمبورو', 'planned']], [['ND', 'planned']], 12, 'تهوية', ['1000', 12, 3], false],
    'الموعد المؤشَّر يظهر يوم تأشيره لا يوم موعده، والقادم «قادم»، وأرقام الجولة، والمجاميع، وبلا مال');
  t.same([shown(await call(db, U.keeperMill, MONTH, [F.a, TODAY])), shown(await call(db, U.manager, MONTH, [id(999), TODAY]))], ['out_of_scope', 'flock_not_found'],
    'التقويم بنطاق حقل الفوج');

  // ── تقرير الدورة: الطيور، والعلف بتراكمه، والأدوية (بلا صرف اللقاح المؤشَّر)، واللقاحات المخطّطة والمنفَّذة، والمال لأدوار الكلفة وحدها.
  const report = await one(U.manager, REPORT, [F.a]);
  t.same(canon([{ ...report.birds, mortality_pct: norm(report.birds.mortality_pct) }, report.feed.lines.map((x) => [x.on, x.item_name, norm(x.cum_kg)]), [report.feed.delivered_kg, report.feed.consumed_kg, report.feed.remaining_kg].map(norm)]),
    // 0028: الطيور تزيد المباع وصافيه وفرق العدّ وسببه (صفر بلا فاتورة ولا إغلاق)، والقديمة بمعناها.
    canon([{ placed: 5000, dead: 12, culled: 3, live: 4985, mortality_pct: '0.3', sold: 0, sold_net_kg: '0.000', count_diff: 0, count_reason: null }, [[TODAY, 'علف بادئ', '1000']], ['1000', '450', '550']]),
    'التقرير: الطيور والنفوق٪، وكلّ نزول علف بتراكمه، والمصروف والمستهلك والباقي');
  t.same([report.medicines.map((x) => [x.source, x.name]), report.vaccines.map((x) => [x.name, x.age_day, x.state])],
    [[['store', 'فيتامين سائل']], [['IB', 7, 'done'], ['ND', 7, 'done'], ['غمبورو', 12, 'planned'], ['ND', 14, 'planned'], ['IB', 21, 'planned']]],
    'الأدوية من المخزن، واللقاحات كلّ مواعيد الجدول بحالاتها');
  t.same([norm(report.money.feed), norm(report.money.medicine), norm(report.money.vaccine), hasMoney(await one(U.hallWorker, REPORT, [F.a])), hasMoney(await one(U.storekeeper, REPORT, [F.a]))],
    ['500000', '20000', '4000', false, false], 'مال الدورة لأدوار الكلفة: العلف والدواء واللقاح الحيّ بقيمته، ومقنَّع لعامل القاعة والأمين');

  // ── اللوحة، والحذف: غمبورو لم يُؤشَّر به فيُمحى، وIB أُشِّر به فيُخفى؛ وكلاهما يخرج من الجدول بنسخة جديدة.
  const board = await one(U.manager, BOARD, []);
  t.same(canon([board.vaccines.map((v) => [v.name, v.in_use, v.item?.name ?? null]), board.programs.broiler.version, board.programs.layer, board.has_halls, board.items.map((x) => x.name)]),
    canon([[['IB', true, 'لقاح IB'], ['ND', true, null], ['غمبورو', false, null]], 1, { version: 0, end_age: null, days: [] }, { broiler: true, layer: true }, ['فيتامين سائل', 'لقاح IB']]),
    'اللوحة: اللقاحات بالاسم المطويّ وعلم الاستعمال ومادّتها، وجدولا النوعين، وموادّ الربط');
  t.same(canon([(await call(db, U.manager, DEL_V, [V.gb, 1])).value, (await call(db, U.manager, DEL_V, [V.ib, 1])).value, (await one(U.manager, BOARD, [])).programs.broiler]),
    canon([{ id: V.gb, result: 'deleted' }, { id: V.ib, result: 'archived' },
      { version: 3, end_age: 42, days: [{ vaccine_id: V.nd, age_day: 7 }, { vaccine_id: V.nd, age_day: 14 }] }]),
    'الحذف: غير المستعمل يُمحى والمستعمل يُخفى، والجدول بلا أيّامهما بنسختين جديدتين');
  t.same([shown(await sp(U.manager, 'broiler', 42, program.filter((d) => d.vaccine_id === V.ib), 3)), (await one(U.manager, MONTH, [F.a, TODAY])).days.find((x) => x.on === TODAY).vaccines.map((x) => x.name)],
    ['vaccine_archived', ['IB', 'ND']], 'اللقاح المخفيّ لا يدخل الجدول، وتأشيراته باقية باسمه في التقويم');

  // ── الثوابت.
  const verify = async (fn) => Object.fromEntries((await db.asService((q) => q(`select * from public.${fn}()`))).rows.map((r) => [r.check_name, Number(r.violations)]));
  t.same([await verify('verify_halls'), Object.values(await verify('verify_flock_issues')).every((n) => n === 0), Object.values(await verify('verify_stock')).every((n) => n === 0)],
    [{ record_place: 0, vaccination_issue: 0, record_dates: 0, issue_once: 0, program_days: 0 }, true, true], 'الثوابت صفر: verify_halls وصرف الأفواج والمخزون');

  // ── التزامن: إضافتان لعلف بادئ (الباقي 490) لقاعتين بلحظة واحدة: الثانية تنتظر أقفال الأولى ثمّ ترى النقص.
  const A1 = await db.session(U.manager);
  const B1 = await db.session(U.storekeeper);
  let race;
  try {
    const a = await A1.run(GIVE, [uid(), TODAY, JSON.stringify([lines.issue(F.a, I.starter, W.feed, '200', 30), lines.issue(F.b, I.starter, W.feed, '200', 31)])]);
    const pending = B1.run(GIVE, [uid(), TODAY, JSON.stringify([lines.issue(F.b, I.starter, W.feed, '100', 32), lines.issue(F.c, I.starter, W.feed, '100', 33)])]);
    const waited = await db.settle(pending, B1.pid);
    await A1.commit();
    const b = await pending;
    await B1.rollback();
    race = { a: a.ok, waited, b: b.ok ? 'ok' : b.error };
  } finally {
    await A1.rollback();
    await B1.rollback();
  }
  t.same(race, { a: true, waited: 'blocked', b: 'insufficient_stock' }, 'إضافتان بلحظة واحدة لمادّة مشتركة تترتّبان، والثانية ترى ما بقي فتُرفض');

  // ── مراجعة 0026 (جولة واحدة لكلّ جهة، كلّ إصلاح بفحص فشل على الهجرة قبله) ───────────────────────────────────────────
  const boardVersion = async () => (await one(U.manager, BOARD, [])).programs.broiler.version;
  const programNow = async () => (await one(U.manager, BOARD, [])).programs.broiler.days;
  const addDays = async (extra) => {
    const r = await sp(U.manager, 'broiler', 42, [...(await programNow()), ...extra], await boardVersion());
    if (!r.ok) throw new Error(`الجدول: ${r.code} ${r.hint}`);
  };
  const V2 = { mg: id(111), md: id(112), nb: id(113) };
  await sv(U.manager, V2.mg, 'MG', I.ib, null);
  await sv(U.manager, V2.md, 'MD', null, null);
  await sv(U.manager, V2.nb, 'NB', null, null);
  // MG يوم 9 (لـ«قاعة 1» قبل يومين)، وMD يوم 10 وNB يوم 11 (لـ«قاعة 2» بعد أربعة وخمسة أيّام).
  await addDays([{ vaccine_id: V2.mg, age_day: 9 }, { vaccine_id: V2.md, age_day: 10 }, { vaccine_id: V2.nb, age_day: 11 }, { vaccine_id: V2.mg, age_day: 30 }]);
  const stale = await boardVersion();

  // DB-1: سطر التأشير يحمل المادّة التي عرضتها الشاشة؛ لقاح رُبط بغيرها بعد القراءة يُرفض ولا يُصرف شيء (كان يصرف المادّة الجديدة بالكمية القديمة).
  const mgLine = (n, itemId, qty = '1') => ({ ...lines.vac(F.a, V2.mg, 9, n, { wh: W.medicine, qty }), item_id: itemId });
  const oldShape = { ...mgLine(60, I.ib) };
  delete oldShape.item_id;
  t.same(shown(await give(U.manager, uid(), TODAY, [oldShape])), 'bad_line', 'مراجعة DB-1: صرف التأشير بلا المادّة المعروضة شكل غير صالح');
  await sv(U.manager, V2.mg, 'MG', I.vitamin, 1);
  const vitBefore = await stock(I.vitamin, W.medicine);
  const relinked = await give(U.manager, uid(), TODAY, [mgLine(61, I.ib)]);
  t.same([relinked.code, relinked.hint?.includes('«فيتامين سائل»'), await stock(I.vitamin, W.medicine)], ['vaccine_relinked', true, vitBefore],
    'مراجعة DB-1: لقاح رُبط بمادّة أخرى بعد قراءة الشاشة يُرفض بجملة تسمّي المادّة الجديدة، ولا يُصرف منها شيء');
  const mgDone = await give(U.manager, uid(), TODAY, [mgLine(62, I.vitamin)]);
  const mgMark = mgDone.ok ? mgDone.value.vaccinations[0] : null;
  t.ok(mgMark?.doc_no?.startsWith('FI-'), 'مراجعة DB-1: التأشير بالمادّة المربوطة الآن يُصرف');

  // DB-2: إعادة إضافة بمرجعها بعد إلغاء صرفها تقول «أُلغي» لا «حُفظ».
  const RD = id(903);
  const dLines = [lines.issue(F.b, I.starter, W.feed, '1', 70)];
  const d1 = await give(U.manager, RD, TODAY, dLines);
  await one(U.manager, 'select public.void_flock_issue($1, $2, $3) as v', [d1.value.issues[0].issue_id, 'لم يصل', uid()]);
  const d2 = await give(U.manager, RD, TODAY, dLines);
  t.same([d2.code, d2.hint?.includes('أُلغي')], ['id_conflict', true], 'مراجعة DB-2: الإعادة بالمرجع بعد إلغاء صرفها id_conflict «أُلغي»');

  // DB-3: تأشير موعد آخر بمعرّفَي صرف تأشير قائم وبمحتواه نفسه (الكمية والمخزن واليوم والكاتب): النواة تراه إعادة فترجّع صرفه، فكان التأشير الثاني
  // يتبنّاه بلا سحب، ولا يُلغى أيّهما بعدها.
  const ibBeforeReuse = await stock(I.vitamin, W.medicine);
  const reuse = await give(U.manager, uid(), TODAY, [{ ...lines.vac(F.a, V2.mg, 30, 63, { wh: W.medicine, qty: '1', item: I.vitamin }), issue_id: id(662), line_id: id(762) }]);
  t.same([reuse.code, await stock(I.vitamin, W.medicine), Number((await db.admin('select count(*) as n from public.flock_vaccinations where issue_id = $1', [id(662)])).rows[0].n)],
    ['id_conflict', ibBeforeReuse, 1], 'مراجعة DB-3: تأشير بمعرّف صرف قائم مرفوض، فلا تأشيران على صرف واحد');

  // DB-8: جملة النقص للقاعتين فصيحة.
  const two = await give(U.manager, uid(), TODAY, [lines.issue(F.a, I.starter, W.feed, '5000', 71), lines.issue(F.b, I.starter, W.feed, '5000', 72)]);
  t.ok(two.code === 'insufficient_stock' && two.hint.includes('للقاعتين'), 'مراجعة DB-8: «للقاعتين» لا «لـ2 قاعات»');

  // C وH: علف بالقطعة سُحب مرّة بلا وزن ومرّة بوزنه: المادّة بمجموع الموزون وعدد غير الموزون؛ وصرفان بإضافة واحدة بترتيب رقميهما.
  I.bags = await item('علف أكياس', 'feed', 'pc');
  await postedOpening(db, U.owner, W.feed, day(-9), [{ item: I.bags, qty: 10, value: '100000.00' }]);
  t.ok((await give(U.manager, uid(), TODAY, [lines.issue(F.c, I.bags, W.feed, '2', 73)])).ok, 'C: كيسان بلا وزن قطعة');
  await one(U.owner, 'update public.items set piece_mass_kg = 25 where id = $1 returning id', [I.bags]);
  const ordered = await give(U.manager, uid(), TODAY, [{ ...lines.issue(F.c, I.bags, W.feed, '2', 74), issue_id: 'ffffffff-ffff-4fff-8fff-ffffffffff01' },
    { ...lines.issue(F.c, I.starter, W.feed, '1', 75), issue_id: '00000000-0000-4000-8000-0000000000f2' }]);
  t.ok(ordered.ok, 'C وH: إضافة بصرفين لـ«قاعة 3»');
  const cReport = await one(U.manager, REPORT, [F.c]);
  const bags = cReport.feed.by_item.find((x) => x.name === 'علف أكياس');
  t.same([norm(bags?.kg), bags?.unweighed], ['50', 1], 'مراجعة C: المادّة بمجموع سطورها الموزونة وعدد غير الموزون (كانت بلا وزن كلّها)');
  const docs = ordered.value.issues.map((x) => x.doc_no);
  t.same(cReport.feed.lines.filter((x) => docs.includes(x.doc_no)).map((x) => x.doc_no), docs, 'مراجعة H: صرفا الإضافة الواحدة في التقرير بترتيب رقميهما لا بمعرّفيهما');

  // A: رقم صرف اللقاح المؤشَّر في التقويم.
  const mgDay = (await one(U.manager, MONTH, [F.a, TODAY])).days.find((x) => x.on === TODAY).vaccines.find((x) => x.name === 'MG');
  t.same(mgDay?.doc_no ?? null, mgMark?.doc_no ?? 'missing', 'مراجعة A: تأشير MG في التقويم برقم صرفه');

  // DB-5: إضافة بتأشيرين حولها صرف ينتظر عدّاد الأرقام، وحذف لقاحها الثاني في اللحظة نفسها: لا تقافل.
  {
    const X = await db.session(U.storekeeper);
    const G = await db.session(U.manager);
    const D = await db.session(U.owner);
    let race;
    try {
      const x = await X.run('select public.record_flock_issue($1, $2, $3, $4, $5, $6, $7, $8) as v', [uid(), uid(), uid(), F.c, I.bags, 1, TODAY, W.feed]);
      const g = G.run(GIVE, [uid(), TODAY, JSON.stringify([lines.vac(F.b, V.nd, 7, 64), lines.issue(F.b, I.starter, W.feed, '1', 76), lines.vac(F.b, V2.md, 10, 65)])]);
      const gWait = await db.settle(g, G.pid);
      const d = D.run(DEL_V, [V2.md, (await db.admin('select version from public.vaccines where id = $1', [V2.md])).rows[0].version]);
      const dWait = await db.settle(d, D.pid);
      await X.commit();
      const gr = await g;
      await G.commit();
      const dr = await d;
      await D.commit();
      race = { x: x.ok, gWait, dWait, g: gr.ok ? 'ok' : gr.error, d: dr.ok ? dr.rows[0].v.result : dr.error };
    } finally {
      await X.rollback();
      await G.rollback();
      await D.rollback();
    }
    t.same(race, { x: true, gWait: 'blocked', dWait: 'blocked', g: 'ok', d: 'archived' }, 'مراجعة DB-5: الإضافة تقفل لقاحاتها وجدولها أوّلاً، فالحذف ينتظرها ثمّ يُخفي المؤشَّر به، بلا تقافل');
  }

  // DB-6: التراجع عن تأشير مصروف وإضافة تؤشّر الموعد نفسه في اللحظة نفسها: لا تقافل، والإضافة ترى التأشير حيّاً.
  {
    const mark = mgMark?.id ?? uid();
    const X = await db.session(U.storekeeper);
    const G = await db.session(U.manager);
    const R = await db.session(U.owner);
    let race;
    try {
      const x = await X.run('select public.record_flock_issue($1, $2, $3, $4, $5, $6, $7, $8) as v', [uid(), uid(), uid(), F.c, I.bags, 1, TODAY, W.feed]);
      const g = G.run(GIVE, [uid(), TODAY, JSON.stringify([lines.issue(F.c, I.starter, W.feed, '1', 77), mgLine(66, I.vitamin)])]);
      const gWait = await db.settle(g, G.pid);
      const r = R.run(UNDO, [mark, 'خطأ في الكمية', uid()]);
      const rWait = await db.settle(r, R.pid);
      await X.commit();
      const gr = await g;
      await G.rollback();
      const rr = await r;
      await R.commit();
      race = { x: x.ok, gWait, rWait, g: gr.ok ? 'ok' : gr.error, r: rr.ok ? rr.rows[0].v.status : rr.error };
    } finally {
      await X.rollback();
      await G.rollback();
      await R.rollback();
    }
    t.same(race, { x: true, gWait: 'blocked', rWait: 'blocked', g: 'already_vaccinated', r: 'void' }, 'مراجعة DB-6: التراجع يأخذ أقفال صرفه قبل التأشير، فلا تقافل مع إضافة تؤشّر الموعد نفسه');
  }

  // DB-7 وF: لقاح يُحذف أثناء انتظار إضافة تؤشّره: vaccine_not_found بجملته (كان not_in_program بـ«»)؛ وحفظ الجدول بنسخة قبل الحذف stale_program.
  {
    const D = await db.session(U.owner);
    const G = await db.session(U.manager);
    let race;
    try {
      const d = await D.run(DEL_V, [V2.nb, (await db.admin('select version from public.vaccines where id = $1', [V2.nb])).rows[0].version]);
      const g = G.run(GIVE, [uid(), TODAY, JSON.stringify([lines.vac(F.b, V2.nb, 11, 67)])]);
      const gWait = await db.settle(g, G.pid);
      await D.commit();
      const gr = await g;
      await G.rollback();
      race = { d: d.ok, gWait, g: gr.ok ? 'ok' : gr.error, hint: gr.ok ? null : !String(gr.hint ?? '').includes('«»') };
    } finally {
      await D.rollback();
      await G.rollback();
    }
    t.same(race, { d: true, gWait: 'blocked', g: 'vaccine_not_found', hint: true }, 'مراجعة DB-7: لقاح حُذف أثناء الانتظار vaccine_not_found بجملته');
  }
  t.same(shown(await sp(U.manager, 'broiler', 42, [...program.filter((x) => x.vaccine_id === V.nd), { vaccine_id: V2.nb, age_day: 11 }], stale)), 'stale_program',
    'مراجعة F: حفظ الجدول بنسخة قبل حذف لقاح فيه stale_program لا vaccine_not_found');

  // H26-PERM-4: ربط لقاح بمادّة تُحذف في اللحظة نفسها item_not_found بجملته؛ وحذف مادّة مربوطة بلقاح يفكّ الربط ولا يُرفض بمفتاح خام.
  {
    const lone = await item('لقاح للحذف', 'vaccine', 'pc');
    const D = await db.session(U.owner);
    const S = await db.session(U.manager);
    let race;
    try {
      const d = await D.run('select public.delete_item($1, (select version from public.items where id = $1)) as v', [lone]);
      const s = S.run(SAVE_V, [id(114), 'لقاح عابر', lone, null]);
      const sWait = await db.settle(s, S.pid);
      await D.commit();
      const sr = await s;
      await S.rollback();
      race = { d: d.ok, sWait, s: sr.ok ? 'ok' : sr.error };
    } finally {
      await D.rollback();
      await S.rollback();
    }
    t.same(race, { d: true, sWait: 'blocked', s: 'item_not_found' }, 'مراجعة PERM-4: ربط بمادّة حُذفت في اللحظة نفسها item_not_found');
    const linkedItem = await item('لقاح مربوط', 'vaccine', 'pc');
    await sv(U.manager, id(115), 'لقاح الربط', linkedItem, null);
    const del = await call(db, U.owner, 'select public.delete_item($1, (select version from public.items where id = $1)) as v', [linkedItem]);
    t.same([shown(del), (await db.admin('select item_id from public.vaccines where id = $1', [id(115)])).rows[0].item_id], ['item_in_use', linkedItem],
      'مراجعة PERM-4: مادّة مربوطة بلقاح مستعملة (item_uses يقرأ كلّ مفتاح إليها)، فحذفها يُرفض بجملته لا بمفتاح خام، والربط باقٍ');
  }
  t.same(await verify('verify_halls'), { record_place: 0, vaccination_issue: 0, record_dates: 0, issue_once: 0, program_days: 0 }, 'مراجعة: الثوابت صفر بعد كلّ ما سبق');

  // ── الطفرات: كلّ قاعدة تُكسر فيفشل فحصها.
  await mutant(db, U.manager, [[FN.give, [['group by 1, 2 having count(*) > 1', 'group by 1, 2 having false']]]], async ({ attempt }) => {
    const r = await attempt(U.manager, async (q) => (await q(GIVE, [uid(), TODAY, JSON.stringify([lines.issue(F.a, I.starter, W.feed, '200', 40), lines.issue(F.b, I.starter, W.feed, '200', 41)])])).rows[0].v);
    t.ok(!r.ok && r.code === 'insufficient_stock' && !r.hint.includes('لكلّ القاعات'), 'طفرة: بلا فحص المجموع يُرفض السطر الثاني بجملة النواة لا بجملة القاعات');
  });
  await mutant(db, U.manager, [[FN.reminders, [["and m.age_day = z.age_day and m.status = 'done')), '[]'::jsonb));", "and m.age_day = z.age_day and false)), '[]'::jsonb));"]]]], async ({ attempt }) => {
    const r = await attempt(U.manager, async (q) => (await q(REMIND)).rows[0].v.items.filter((x) => x.hall_name === 'قاعة 1' && x.age_day === 7).length);
    t.eq(r.value, 1, 'طفرة: بلا استبعاد المؤشَّر يعود ND يوم 7 («IB» مخفيّ الآن) إلى التذكير');
  });
  await mutant(db, U.manager, [[FN.slots, [['and d.age_day >= f.age_days_at_placement', '']]]], async ({ attempt }) => {
    const r = await attempt(U.manager, async (q) => (await q(REMIND)).rows[0].v.items.filter((x) => x.hall_name === 'قاعة 4' && x.age_day === 7).length);
    t.ok(r.value > 0, 'طفرة: بلا شرط التسكين يظهر لـ«قاعة 4» موعد سبق تسكينها');
  });
  await mutant(db, U.manager, [[FN.guard, [["and m.status = 'done') then", 'and false) then']]]], async ({ attempt }) => {
    const mark = (await db.admin("select issue_id from public.flock_vaccinations where id = $1", [id(520)])).rows[0].issue_id;
    const r = await attempt(U.manager, async (q) => (await q('select public.void_flock_issue($1, $2, $3) as v', [mark, 'طفرة', uid()])).rows[0].v.status);
    t.eq(r.value, 'void', 'طفرة: بلا المحفّز يُلغى صرف لقاح مؤشَّر وحده');
  });
  await mutant(db, U.manager, [[FN.undo, [['  if m.issue_id is not null then\n    perform public.void_flock_issue', '  if false then\n    perform public.void_flock_issue']]]], async ({ attempt, oq }) => {
    const r = await attempt(U.manager, async (q) => (await q(UNDO, [id(520), 'طفرة', uid()])).rows[0].v);
    const v = (await oq('select * from public.verify_halls()')).rows.find((x) => x.check_name === 'vaccination_issue');
    t.ok(r.ok && Number(v.violations) === 1, 'طفرة: تراجع لا يُلغي الصرف يتركه مرحَّلاً فيمسكه vaccination_issue');
  });

  // ── عيّنات القاعدة الحقيقية للشاشات (مثل mill4): HALLS_SAMPLES_OUT=1.
  if (process.env.HALLS_SAMPLES_OUT) {
    const samples = {
      _note: 'عيّنات القاعدة الحقيقية (supabase/tests/halls.test.mjs بـHALLS_SAMPLES_OUT=1)؛ المحلّلات الحقيقية تقرؤها في فحوص الشاشات.',
      give_to_flocks: V1,
      vaccine_board: await one(U.manager, BOARD, []),
      vaccine_reminders: await one(U.manager, REMIND, []),
      flock_month: await one(U.manager, MONTH, [F.a, TODAY]),
      flock_month_no_money: await one(U.hallWorker, MONTH, [F.a, TODAY]),
      flock_cycle_report: await one(U.manager, REPORT, [F.a]),
      flock_cycle_report_no_money: await one(U.hallWorker, REPORT, [F.a]),
    };
    writeFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures', 'halls-0026.json'), JSON.stringify(samples, null, 1) + '\n');
  }
}
