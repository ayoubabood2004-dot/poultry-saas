// مراجعة 0019 الأولى (الصرف لفوج القاعة): كلّ ملاحظة بفحص يفشل على الشفرة قبل إصلاحها.
// M1: علف بالقطعة (كيس بوزن قطعته) لا يختفي من «علف القاعة»: الكيلو = القطع × لقطة وزن القطعة على السطر، وكلّ سطر علف بلا كتلة يُعدّ في
//     unweighed_feed_lines (قطعة بلا وزن أو لتر بلا كثافة)، وتغيير وزن القطعة بعد الصرف لا يغيّر ما صُرف.
// L1: معرّف سطر واحد في صرفين بلحظة واحدة: الثاني ينتظر الأوّل ثمّ id_conflict بتلميحه، لا تعارض مفتاح خام (flock_issue_lines_pkey).
// المشتبه (الشاشة): «ألغِ» لكلّ صرف بحاله (can_void على السطر: مرحَّل، والفوج غير مغلق، وفعل void، ونطاق حقل الفوج ومخزن الصرف كلاهما)،
//     وcan_void أعلى الجواب = سطر واحد على الأقلّ يُلغى؛ فمدير بنطاق الحقول لا يرى «ألغِ» على صرف من مخزن المعمل.
import { call, makeOrg, uid } from './ledger-kit.mjs';
import { postedOpening } from './stock-kit.mjs';

const TODAY = '2026-11-07';
const id = (n) => `b1910000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477099910${String(n).padStart(2, '0')}`;
const day = (offset) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
const RF = 'select public.record_flock_issue($1, $2, $3, $4, $5, $6, $7, $8) as v';
const FEED = 'select public.flock_feed($1) as v';
const norm = (value) => {
  if (value === null || value === undefined) return value;
  const text = String(value);
  return text.includes('.') ? text.replace(/0+$/u, '').replace(/\.$/u, '') : text;
};

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const G = await makeOrg(db, {
    name: 'مزرعة مراجعة الصرف',
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
      ['managerFarm', 'manager', ['broiler']],
    ],
  });
  const { users: U, divisions: D, org } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  const farmSite = await one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل المراجعة', 'farm') returning id", [D.broiler]);
  W.farm = await one(U.owner, "insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن حقل المراجعة', 'farm') returning id", [D.broiler, farmSite]);
  const hall = await one(U.owner, "insert into public.halls (site_id, name) values ($1, 'قاعة المراجعة') returning id", [farmSite]);
  const flock = (await one(U.owner, 'select public.open_flock($1, $2, 3000, 0, null, $3) as v', [hall, day(-5), uid()])).flock_id;
  const item = (name, kind, unit, pieceMass = null) =>
    one(U.owner, 'insert into public.items (name, kind, base_unit, piece_mass_kg) values ($1, $2, $3, $4) returning id', [name, kind, unit, pieceMass]);
  const I = {
    sacks: await item('علف بالكيس', 'feed', 'pc', 50),
    bare: await item('علف قطع بلا وزن', 'feed', 'pc'),
    finisher: await item('علف ناهي', 'feed', 'kg'),
  };
  await postedOpening(db, U.owner, W.feed, day(-5), [{ item: I.sacks, qty: 100, value: '500000.00' }, { item: I.bare, qty: 20, value: '20000.00' }, { item: I.finisher, qty: 1000, value: '520000.00' }]);
  await postedOpening(db, U.owner, W.farm, day(-5), [{ item: I.finisher, qty: 200, value: '110000.00' }]);
  const args = (o) => [o.ref ?? uid(), o.issue ?? uid(), o.line ?? uid(), flock, o.item, o.qty, o.on ?? TODAY, o.wh ?? null];
  const rf = (user, o) => call(db, user, RF, args(o));
  const feed = (user) => call(db, user, FEED, [flock], { commit: false });

  // ── M1: الكيس بوزن قطعته ────────────────────────────────────────────────────────────────────────────────────────
  const sacks = await rf(U.owner, { item: I.sacks, qty: 10 });
  t.ok(sacks.ok, `صرف 10 أكياس (${sacks.code ?? ''} ${sacks.hint ?? ''})`);
  const afterSacks = (await feed(U.owner)).value;
  t.same([norm(afterSacks.issued_feed_kg), afterSacks.unweighed_feed_lines], ['500', 0], 'M1: 10 أكياس × 50 كغم = 500 كغم علفاً مصروفاً، ولا سطر بلا وزن');
  const bare = await rf(U.owner, { item: I.bare, qty: 2 });
  t.ok(bare.ok, `صرف قطعتين بلا وزن (${bare.code ?? ''})`);
  const afterBare = (await feed(U.owner)).value;
  t.same([norm(afterBare.issued_feed_kg), afterBare.unweighed_feed_lines], ['500', 1], 'M1: علف بالقطعة بلا وزن قطعة يُعدّ في unweighed_feed_lines ولا يُوزن');
  await one(U.owner, 'update public.items set piece_mass_kg = 40 where id = $1 returning id', [I.sacks]);
  t.eq(norm((await feed(U.owner)).value.issued_feed_kg), '500', 'M1: تغيير وزن الكيس بعد الصرف لا يغيّر ما صُرف (لقطة على السطر)');
  const snapshot = await db.admin('select item_id, trim_scale(piece_mass_kg)::text as mass from public.flock_issue_lines where issue_id = any ($1::uuid[]) order by created_at', [[sacks.value?.id, bare.value?.id]])
    .then((r) => r.rows.map((x) => [x.item_id, x.mass]))
    .catch((error) => error.message);
  t.same(snapshot, [[I.sacks, '50'], [I.bare, null]], 'M1: وزن القطعة لقطة على سطر الصرف (والقطعة بلا وزن فارغة)');

  // ── L1: معرّف سطر واحد في صرفين بلحظة واحدة ─────────────────────────────────────────────────────────────────────
  const lineRace = async () => {
    const line = uid();
    const s1 = await db.session(U.storekeeper);
    const s2 = await db.session(U.owner);
    try {
      const a1 = await s1.run(RF, args({ line, item: I.finisher, qty: 5, wh: W.feed }));
      const p2 = s2.run(RF, args({ line, item: I.finisher, qty: 5, wh: W.feed }));
      const st2 = await db.settle(p2, s2.pid);
      await s1.commit();
      const a2 = await p2;
      return { a1: a1.ok, st2, a2: a2.ok ? 'ok' : a2.error };
    } finally {
      await s1.rollback();
      await s2.rollback();
    }
  };
  t.same(await lineRace(), { a1: true, st2: 'blocked', a2: 'id_conflict' }, 'L1: معرّف سطر واحد في صرفين بلحظة واحدة: الثاني ينتظر ثمّ id_conflict لا تعارض مفتاح خام');
  // طفرة مثبَّتة بجلستين (الجلسات الأخرى ترى الدالّة)، وتُرجَع بتعريفها: بلا قفل معرّف السطر يرجع تعارض المفتاح الخام.
  const SIGNATURE = 'public.record_flock_issue(uuid, uuid, uuid, uuid, uuid, numeric, date, uuid)';
  const original = (await db.admin('select pg_get_functiondef($1::regprocedure) as d', [SIGNATURE])).rows[0].d;
  const LINE_LOCK = "  perform pg_advisory_xact_lock(hashtextextended('flock_issue_line:' || p_line_id::text, 0));\n";
  let mutated;
  try {
    if (original.split(LINE_LOCK).length !== 2) throw new Error('مرساة قفل السطر ليست مرّة واحدة');
    await db.asOwner((q) => q(original.split(LINE_LOCK).join('')), undefined, { commit: true });
    mutated = await lineRace();
  } finally {
    await db.asOwner((q) => q(original), undefined, { commit: true });
  }
  t.ok(/flock_issue_lines_pkey/u.test(mutated.a2), `طفرة L1: بلا قفل معرّف السطر يرجع الثاني تعارض مفتاح خاماً (${mutated.st2}: ${mutated.a2})`);
  t.eq((await db.admin('select md5(pg_get_functiondef($1::regprocedure)) = md5($2) as same', [SIGNATURE, original])).rows[0].same, true, 'الدالّة رجعت بتعريفها كما كان');

  // ── المشتبه: «ألغِ» لكلّ صرف بنطاق مخزنه ──────────────────────────────────────────────────────────────────────────
  const fromMill = await rf(U.owner, { item: I.finisher, qty: 10, wh: W.feed });
  const fromFarm = await rf(U.owner, { item: I.finisher, qty: 10, wh: W.farm });
  t.ok(fromMill.ok && fromFarm.ok, `صرفان من مخزن المعمل ومخزن الحقل (${fromMill.code ?? ''} ${fromFarm.code ?? ''})`);
  const canVoid = async (user) => {
    const result = await feed(user);
    if (!result.ok) return result.code;
    const rows = Object.fromEntries(result.value.issues.map((x) => [x.id, x.can_void]));
    return [result.value.can_void, rows[fromMill.value.id], rows[fromFarm.value.id]];
  };
  t.same(await canVoid(U.managerFarm), [true, false, true], 'مدير بنطاق الحقول: «ألغِ» على صرف مخزن الحقل وحده، لا على صرف مخزن المعمل');
  t.same(await canVoid(U.owner), [true, true, true], 'المالك: «ألغِ» على كلّ صرف مرحَّل');
  t.same(await canVoid(U.storekeeper), [false, false, false], 'الأمين بلا فعل الإلغاء: لا «ألغِ»');
  const millVoid = await call(db, U.managerFarm, 'select public.void_flock_issue($1, $2, $3) as v', [fromMill.value.id, 'ضابط', uid()], { commit: false });
  t.eq(millVoid.code, 'out_of_scope', 'ضابط: إلغاء مدير الحقول لصرف مخزن المعمل يُرفض out_of_scope (فلا يُعرض له «ألغِ»)');
  const voided = await call(db, U.owner, 'select public.void_flock_issue($1, $2, $3) as v', [fromFarm.value.id, 'كمية خاطئة', uid()]);
  t.ok(voided.ok, `إلغاء صرف مخزن الحقل (${voided.code ?? ''})`);
  t.same(await canVoid(U.managerFarm), [false, false, false], 'بعد إلغاء صرف الحقل: لا صرف يلغيه مدير الحقول (والملغى بلا «ألغِ»)');
}
