// الصرف لمصروف عام والإتلاف (WP5، 0008؛ FOUNDATION ٣٠٥–٣٠٦، ٥٥٦؛ DECISIONS Q5؛ E31): الأرقام «مشتقّة» من مثال FOUNDATION (البذور
// بالافتتاح، الخطّة WP5): 10 لترات من كاز أبيض 500 لتر بـ375,000.00 ← مصروف 7,500.00 بمصدر stock. الصرف يسحب بالترتيب ويكتب
// مصروفاً واحداً بتصنيف المستند ووحدة مخزنه ورقم SU، والمنتهي ما ينسحب بالترتيب أبداً، والسطر اللي يسمّي دفعة منتهية ينتظر المدير
// (expired.release، Q5) والإتلاف للمدير (expired.destroy) بدفعة منتهية مسمّاة، والإلغاء يرجّع كل شي للفلس، وبصمة المعاينة تمنع
// ترحيل غير اللي انعاين، والسحب كلّه مقبول بالخادم (التأكيد بالشاشة)، والنتيجة بلا قيم لغير أدوار الكلفة. كل نداء بدور
// authenticated حقيقي.
import { LEDGER_ZERO, call, outcome, shown, uid, verifyLedger } from './ledger-kit.mjs';
import { draftWriteLock, sameRefRace } from './shared.mjs';
import { STOCK_ZERO, balanceOf, lotsOf, makeStockOrg, postedOpening, verifyStock } from './stock-kit.mjs';

const TODAY = '2026-10-30';
const GO_LIVE = '2026-10-20';
const id = (n) => `5e000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477098100${String(n).padStart(2, '0')}`;

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const S = await makeStockOrg(db, { name: 'مزرعة الصرف', id, phone, goLive: GO_LIVE });
  const { users: U, W, I } = S;
  // الأمين بنطاق المخزن العامّ ومخزن الأدوية (الصرف بالنطاق، والإتلاف وإذن المنتهي للمدير).
  await S.one(U.owner, "select public.set_member_scopes_v2($1, '{}', '{}', array[$2, $3]::uuid[])", [S.members.storekeeper, W.general, W.medicine]);
  const item = (label, kind, unit, extra = {}) =>
    S.one(U.owner, 'insert into public.items (name, kind, base_unit, tracks_expiry) values ($1, $2, $3, $4) returning id', [label, kind, unit, extra.tracksExpiry ?? false]);
  const kerosene = await item('كاز أبيض', 'fuel', 'L');
  const oil = await item('زيت محرّكات', 'fuel', 'L');
  const parts = await item('قطع غيار', 'equipment', 'pc');
  const grease = await item('شحم', 'other', 'kg');
  const maintenance = await S.one(U.accountant, "insert into public.expense_categories (name) values ('صيانة') returning id");
  const archivedCategory = await S.one(U.accountant, "insert into public.expense_categories (name) values ('قديم') returning id");
  await S.one(U.accountant, 'update public.expense_categories set archived_at = now() where id = $1 returning id', [archivedCategory]);
  const system = Object.fromEntries((await db.admin('select system_code, id from public.expense_categories where org_id = $1 and system_code is not null', [S.org])).rows.map((r) => [r.system_code, r.id]));

  // البذور بالافتتاح (الخطّة WP5: «derived»): كاز أبيض KZ1 500 لتر بـ375,000.00، وزيت 20 لتراً، وقطع غيار 3 بـ10.00، ولقاح منتهٍ
  // (6 عبوات انتهت 25/10) وصالح (10 عبوات لـ2027).
  await postedOpening(db, U.manager, W.general, GO_LIVE, [
    { item: kerosene, qty: 500, value: 375000 },
    { item: oil, qty: 20, value: 30000 },
    { item: parts, qty: 3, value: 10 },
    { item: grease, qty: 3, value: 10 },
  ]);
  await postedOpening(db, U.manager, W.medicine, GO_LIVE, [
    { item: I.vaccine, qty: 6, value: 6000, expiry: '2026-10-25' },
    { item: I.vaccine, qty: 10, value: 20000, expiry: '2027-06-30' },
  ]);
  const vials = await lotsOf(db, I.vaccine, W.medicine);
  const expiredLot = vials.find((l) => l.expiry_on === '2026-10-25').id;
  const validLot = vials.find((l) => l.expiry_on === '2027-06-30').id;

  /** مسوّدة صرف بكتابة مباشرة: lines = [{ item, qty, lot?, unit?, code? }]. */
  const useDraft = (user, wh, category, lines, usedOn = TODAY) =>
    db.asUser(
      user,
      async (q) => {
        const docId = (await q('insert into public.stock_uses (warehouse_id, category_id, used_on) values ($1, $2, $3) returning id', [wh, category, usedOn])).rows[0].id;
        const ids = [];
        for (const line of lines) {
          ids.push((await q('insert into public.stock_use_lines (doc_id, item_id, qty_in_unit, lot_id, item_unit_id, unit_code) values ($1, $2, $3, $4, $5, $6) returning id', [
            docId, line.item, line.qty, line.lot ?? null, line.unit ?? null, line.code ?? null,
          ])).rows[0].id);
        }
        return { id: docId, version: (await q('select version from public.stock_uses where id = $1', [docId])).rows[0].version, lines: ids };
      },
      { commit: true },
    );
  const preview = async (user, docId) => call(db, user, 'select public.preview_stock_use($1)', [docId]);
  const post = (user, doc, plan, ref = uid()) => call(db, user, 'select public.post_stock_use($1, $2, $3, $4)', [doc.id, doc.version, plan, ref]);
  const postNow = (user, doc, ref = uid()) => call(db, user, "select public.post_stock_use($1, $2, public.preview_stock_use($1) ->> 'plan', $3)", [doc.id, doc.version, ref]);
  const expenseOf = async (docId) =>
    (await db.admin("select amount::text as amount, category_id, division_id, source, on_date::text as on_date, for_month::text as for_month, reverses_id from public.expenses where doc_kind = 'stock_use' and doc_id = $1 order by created_at, id", [docId])).rows;

  // ── الصرف العادي (مشتقّ): 10 لترات من KZ1 ← 7,500.00 بمصدر stock بتصنيف المستند ووحدة المخزن، ورقم SU، والأمين بلا قيم ───────
  const doc1 = await useDraft(U.storekeeper, W.general, maintenance, [{ item: kerosene, qty: 10 }]);
  const seen = await preview(U.storekeeper, doc1.id);
  t.same(
    [seen.ok, seen.value.ready, seen.value.lines[0].draws.length, 'money' in seen.value, 'money' in seen.value.lines[0], seen.value.lines[0].whole_balance, seen.value.needs_manager],
    [true, true, 1, false, false, false, false],
    'معاينة الأمين: جاهزة بقطعة وحدة، بلا أي money (المصروف مخفي عنه)، ومو الرصيد كلّه، وما تحتاج المدير',
  );
  const posted1 = await post(U.storekeeper, doc1, seen.value.plan);
  const general = (await db.admin('select division_id from public.warehouses where id = $1', [W.general])).rows[0].division_id;
  t.same(
    [shown(posted1), posted1.value?.doc_no, 'money' in (posted1.value ?? {}), await expenseOf(doc1.id), await balanceOf(db, kerosene, W.general)],
    ['ok', 'SU-2026-0001', false, [{ amount: '7500.00', category_id: maintenance, division_id: general, source: 'stock', on_date: TODAY, for_month: '2026-10-01', reverses_id: null }], { qty: '490', value: '367500' }],
    'الأمين يرحّل الصرف: SU-2026-0001 بلا قيم بنتيجته، ومصروف 7,500.00 بمصدر stock بالصيانة ووحدة العامّة، والرصيد 490 لتراً بـ367,500.00',
  );
  const again = await call(db, U.manager, 'select public.post_stock_use($1, $2, $3, $4)', [doc1.id, doc1.version, seen.value.plan, uid()]);
  t.eq(shown(again), 'not_draft', 'المرحَّل بمرجع جديد not_draft');

  // ── المعاينة = الترحيل (بصمة الخطّة)، وتغيّر المخزون بعدها stale_preview ─────────────────────────────────────────────────
  // الشحم 3 كغم بـ10.00 (القاعدة 13): المعاينة تسحب الكيلو الأوّل بـ3.33 والثاني بـ3.34؛ صرف كيلو قبلها يخلّي الأوّل 3.34.
  const doc2 = await useDraft(U.storekeeper, W.general, maintenance, [{ item: grease, qty: 1 }, { item: grease, qty: 1 }]);
  const seen2 = (await preview(U.manager, doc2.id)).value;
  t.same(seen2.lines.map((l) => l.money.value), ['3.33', '3.34'], 'المعاينة تحاكي السطر الثاني بعد الأوّل على نفس الدفعة: 3.33 ثم 3.34');
  const plan2 = seen2.plan;
  const other = await useDraft(U.storekeeper, W.general, maintenance, [{ item: grease, qty: 1 }]);
  t.eq(shown(await postNow(U.storekeeper, other)), 'ok', 'صرف ثاني بعد المعاينة يغيّر قيمة الدفعة المتبقّية');
  t.same(
    [shown(await post(U.storekeeper, doc2, plan2)), shown(await post(U.storekeeper, doc2, 'بصمة غلط')), shown(await post(U.storekeeper, doc2, null)), shown(await postNow(U.storekeeper, doc2))],
    ['stale_preview', 'stale_preview', 'stale_preview', 'ok'],
    'بصمة قديمة أو غلط أو فارغة stale_preview والمستند يبقى مسوّدة، والمعاينة الجديدة ترحّل',
  );

  // ── السحب كلّه (E31): المعاينة تعلّمه، والخادم يقبله، والرصيد صفر ─────────────────────────────────────────────────────
  const whole = await useDraft(U.storekeeper, W.general, maintenance, [{ item: oil, qty: 20 }]);
  const wholeSeen = (await preview(U.manager, whole.id)).value;
  t.same(
    [wholeSeen.lines[0].whole_balance, wholeSeen.money.total, shown(await postNow(U.storekeeper, whole)), await balanceOf(db, oil, W.general)],
    [true, '30000.00', 'ok', { qty: '0', value: '0' }],
    'صرف الرصيد كلّه: المعاينة تعلّمه وقيمته 30,000.00، والترحيل يقبله، والرصيد صفر',
  );
  // القطعة الجزئية بالقاعدة 13: لترا قطع غيار؟ لا — قطعتان من 3 بـ10.00 ← 6.67، والباقية 3.33.
  const split = await useDraft(U.manager, W.general, maintenance, [{ item: parts, qty: 2 }]);
  await postNow(U.manager, split);
  t.same([(await expenseOf(split.id))[0]?.amount, await balanceOf(db, parts, W.general)], ['6.67', { qty: '1', value: '3.33' }], 'قطعتان من 3 بـ10.00: مصروف 6.67 (القاعدة 13) والباقية 3.33');

  // ── المنتهي (Q5): الترتيب ما يسحبه أبداً، والسطر يسمّيه ينتظر المدير، والإتلاف للمدير بدفعة منتهية مسمّاة ───────────────────────
  const fefo = await useDraft(U.storekeeper, W.medicine, maintenance, [{ item: I.vaccine, qty: 3 }]);
  const fefoSeen = (await preview(U.storekeeper, fefo.id)).value;
  t.same(
    [fefoSeen.lines[0].draws.map((d) => d.lot_id), fefoSeen.lines[0].expired, fefoSeen.lines[0].available, shown(await postNow(U.storekeeper, fefo))],
    [[validLot], '6.000', '10.000', 'ok'],
    'الصرف بالترتيب يتخطّى المنتهي (6) ويسحب من الصالح (10) بس',
  );
  const release = await useDraft(U.storekeeper, W.medicine, maintenance, [{ item: I.vaccine, qty: 2, lot: expiredLot }]);
  const releaseSeen = (await preview(U.storekeeper, release.id)).value;
  t.same(
    [releaseSeen.needs_manager, releaseSeen.can_post, releaseSeen.lines[0].needs_release, releaseSeen.lines[0].draws.map((d) => d.lot_id), shown(await postNow(U.storekeeper, release))],
    [true, false, true, [expiredLot], 'expired_needs_release'],
    'سطر يسمّي دفعة منتهية: المعاينة «يحتاج المدير» والأمين ما يرحّل (expired_needs_release)',
  );
  const releaseManager = (await preview(U.manager, release.id)).value;
  const released = await postNow(U.manager, release);
  const releaseMove = (await db.admin("select lot_id, trim_scale(qty)::text as qty, expiry_checked from public.stock_moves where doc_kind = 'stock_use' and doc_id = $1", [release.id])).rows;
  t.same(
    [releaseManager.can_post, shown(released), releaseMove, await verifyStock((sql, p) => db.admin(sql, p))],
    [true, 'ok', [{ lot_id: expiredLot, qty: '-2', expiry_checked: false }], STOCK_ZERO],
    'المدير يرحّله (expired.release): سحب من الدفعة المنتهية المسمّاة بس بعلامة expiry_checked = false، والثوابت صفر',
  );
  const namedValid = await useDraft(U.manager, W.medicine, maintenance, [{ item: I.vaccine, qty: 1, lot: validLot }]);
  t.eq(shown(await postNow(U.manager, namedValid)), 'lot_not_expired', 'الصرف العادي يسمّي دفعة صالحة: lot_not_expired (الصالح بالترتيب)');
  const destroyByKeeper = await useDraft(U.storekeeper, W.medicine, system.expired_destroy, [{ item: I.vaccine, qty: 4, lot: expiredLot }]);
  const destroySeen = (await preview(U.storekeeper, destroyByKeeper.id)).value;
  t.same([destroySeen.destroy, destroySeen.can_post, shown(await postNow(U.storekeeper, destroyByKeeper))], [true, false, 'forbidden'], 'الأمين يجهّز الإتلاف ولا يرحّله (expired.destroy للمدير)');
  t.same(
    [shown(await postNow(U.manager, destroyByKeeper)), (await expenseOf(destroyByKeeper.id)).map((e) => [e.amount, e.category_id === system.expired_destroy]), (await lotsOf(db, I.vaccine, W.medicine)).find((l) => l.id === expiredLot).qty_left],
    ['ok', [['4000.00', true]], '0'],
    'المدير يتلف 4 عبوات منتهية: مصروف 4,000.00 بتصنيف «إتلاف منتهي»، والدفعة المنتهية صفر',
  );
  const destroyNoLot = await useDraft(U.manager, W.medicine, system.expired_destroy, [{ item: I.vaccine, qty: 1 }]);
  const destroyValid = await useDraft(U.manager, W.medicine, system.expired_destroy, [{ item: I.vaccine, qty: 1, lot: validLot }]);
  t.same([shown(await postNow(U.manager, destroyNoLot)), shown(await postNow(U.manager, destroyValid))], ['lot_required', 'lot_not_expired'], 'الإتلاف بلا دفعة lot_required، وبدفعة صالحة lot_not_expired');

  // ── التصنيف، والنقص، والنطاق، والدفعة المسمّاة من مخزن ثاني ──────────────────────────────────────────────────────────
  const noCategory = await useDraft(U.storekeeper, W.general, null, [{ item: kerosene, qty: 1 }]);
  const systemCategory = await useDraft(U.storekeeper, W.general, system.count_diff, [{ item: kerosene, qty: 1 }]);
  const oldCategory = await useDraft(U.storekeeper, W.general, archivedCategory, [{ item: kerosene, qty: 1 }]);
  const tooMuch = await useDraft(U.storekeeper, W.general, maintenance, [{ item: kerosene, qty: 1000 }]);
  const noCategorySeen = (await preview(U.storekeeper, noCategory.id)).value;
  t.same(
    [noCategorySeen.problems.map((p) => p.code), shown(await postNow(U.storekeeper, noCategory)), shown(await postNow(U.storekeeper, systemCategory)), shown(await postNow(U.storekeeper, oldCategory)), shown(await postNow(U.storekeeper, tooMuch))],
    [['category_required'], 'category_required', 'system_expense', 'category_archived', 'insufficient_stock'],
    'بلا تصنيف category_required (والمعاينة تقوله)، وتصنيف نظامي system_expense، ومؤرشف category_archived، وأكثر من الرصيد insufficient_stock',
  );
  const foreignLot = await db
    .asUser(U.manager, async (q) => {
      const docId = (await q('insert into public.stock_uses (warehouse_id, category_id, used_on) values ($1, $2, $3) returning id', [W.general, maintenance, TODAY])).rows[0].id;
      await q('insert into public.stock_use_lines (doc_id, item_id, qty_in_unit, lot_id) values ($1, $2, 1, $3)', [docId, I.vaccine, expiredLot]);
      return 'ok';
    })
    .catch(outcome);
  t.same(
    [foreignLot, await useDraft(U.hatcheryKeeper, W.general, maintenance, [{ item: kerosene, qty: 1 }]).then(() => 'ok', outcome)],
    ['lot_mismatch', 'rls'],
    'الدفعة المسمّاة من مخزن ثاني lot_mismatch، والأمين برّا النطاق ما يكتب مسوّدة (RLS)',
  );

  // ── الإلغاء يرجّع كل شي للفلس: الدفعات والرصيد والمصروف (صفّ عكسي بيوم الإلغاء) ─────────────────────────────────────────
  const beforeVoid = [await lotsOf(db, kerosene, W.general), await balanceOf(db, kerosene, W.general)];
  const toVoid = await useDraft(U.manager, W.general, maintenance, [{ item: kerosene, qty: 33.3 }]);
  await postNow(U.manager, toVoid);
  const voided = await call(db, U.manager, "select public.void_stock_use($1, 'صرف بالخطأ', gen_random_uuid())", [toVoid.id]);
  t.same(
    [shown(voided), [await lotsOf(db, kerosene, W.general), await balanceOf(db, kerosene, W.general)], (await expenseOf(toVoid.id)).map((e) => e.amount)],
    ['ok', beforeVoid, ['24975.00', '-24975.00']],
    'الإلغاء يرجّع الدفعات والرصيد للفلس، والمصروف بصفّ عكسي بنفس المبلغ',
  );
  t.same(
    [
      shown(await call(db, U.manager, "select public.void_stock_use($1, 'مرّة ثانية', gen_random_uuid())", [toVoid.id])),
      shown(await call(db, U.storekeeper, "select public.void_stock_use($1, 'الأمين', gen_random_uuid())", [doc1.id])),
      shown(await call(db, U.manager, "select public.void_stock_use($1, 'مسوّدة', gen_random_uuid())", [noCategory.id])),
      shown(await call(db, U.manager, "select public.void_expense((select id from public.expenses where doc_kind = 'stock_use' and doc_id = $1), 'مباشر', gen_random_uuid())", [doc1.id])),
    ],
    ['already_void', 'forbidden', 'not_posted', 'system_expense'],
    'الإلغاء مرّة ثانية already_void، والأمين forbidden، والمسوّدة not_posted، ومصروف الصرف ما يُلغى مباشرة (system_expense)',
  );

  // ── مرجع واحد (D6، FOUNDATION ٨٧٣، ٨٨٦) وقفل المسوّدة المرحَّلة (FOUNDATION ٥٢٦) ─────────────────────────────────────────
  await sameRefRace(t, db, {
    name: 'الصرف',
    user: U.storekeeper,
    draft: async () => useDraft(U.storekeeper, W.general, maintenance, [{ item: kerosene, qty: 2 }]),
    post: (docId, version, ref) => ({ sql: "select public.post_stock_use($1, $2, public.preview_stock_use($1) ->> 'plan', $3) as result", params: [docId, version, ref] }),
    postings: async (docId) => (await db.admin("select count(*)::int as count, count(distinct doc_no)::int as numbers from public.stock_uses where id = $1 and status = 'posted'", [docId])).rows[0],
  });
  await draftWriteLock(t, db, {
    name: 'الصرف',
    user: U.storekeeper,
    draft: async () => {
      const doc = await useDraft(U.storekeeper, W.general, maintenance, [{ item: kerosene, qty: 1 }]);
      return { id: doc.id, version: doc.version, lineId: doc.lines[0] };
    },
    posted: async () => {
      const doc = await useDraft(U.storekeeper, W.general, maintenance, [{ item: kerosene, qty: 1 }]);
      const result = await postNow(U.storekeeper, doc);
      if (!result.ok) throw new Error(`صرف ما انرحّل: ${result.code}`);
      return { id: doc.id, version: doc.version, lineId: doc.lines[0] };
    },
    insertHeader: (status) => ({ sql: 'insert into public.stock_uses (warehouse_id, category_id, used_on, status) values ($1, $2, $3, $4)', params: [W.general, maintenance, TODAY, status] }),
    setStatus: (doc, status) => ({ sql: 'update public.stock_uses set status = $2 where id = $1', params: [doc.id, status] }),
    editLine: (doc) => ({ sql: 'update public.stock_use_lines set qty_in_unit = qty_in_unit + 1 where id = $1', params: [doc.lineId] }),
  });

  // ── الطيّ وحذف السطر للصرف ───────────────────────────────────────────────────────────────────────────────────────
  const scrap = await useDraft(U.storekeeper, W.general, maintenance, [{ item: kerosene, qty: 1 }, { item: kerosene, qty: 2 }]);
  const deleted = await call(db, U.storekeeper, "select public.delete_draft_line('stock_use', $1, $2) ->> 'deleted'", [scrap.lines[0], scrap.version]);
  const deletedAgain = await call(db, U.storekeeper, "select public.delete_draft_line('stock_use', $1, $2) ->> 'deleted'", [scrap.lines[0], scrap.version + 1]);
  const discarded = await call(db, U.storekeeper, "select public.discard_draft('stock_use', $1, $2) ->> 'status'", [scrap.id, scrap.version + 1]);
  t.same([deleted.value, deletedAgain.value, discarded.value, (await db.admin('select status, doc_no from public.stock_uses where id = $1', [scrap.id])).rows[0]], ['true', 'false', 'void', { status: 'void', doc_no: null }], 'حذف السطر (والإعادة deleted: false) وطيّ المسوّدة بلا رقم');

  // ── الثوابت ─────────────────────────────────────────────────────────────────────────────────────────────────────
  t.same(await db.asService(verifyStock), STOCK_ZERO, 'verify_stock صفر بعد الصرف والإتلاف والإلغاء');
  t.same(await db.asService(verifyLedger), LEDGER_ZERO, 'verify_ledger صفر (أرقام SU بلا فجوة)');
  const gap = await db.asOwner(async (q) => {
    await q("update public.doc_counters set last_no = last_no + 1 where org_id = $1 and kind = 'SU'", [S.org]);
    return verifyLedger(q);
  }, U.owner);
  t.same(gap, { ...LEDGER_ZERO, doc_numbers: 1 }, 'ضابط: عدّاد SU بفجوة يقلب doc_numbers وحده');
}
