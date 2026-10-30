// المصاريف (WP5، 0008؛ FOUNDATION ٤١٩–٤٢٤، ٥٥٧؛ DECISIONS Q13 وQ14؛ E10، E43): النقدي يحرّك الصندوق بالمبلغ بالضبط وإلغاؤه يرجّعه،
// وبالدين قيد bill «له» بدفتر وحدته يتوزّع بالقاعدة 27 (والمفقس يسمّي دفتره: book_required وbook_mismatch)، والشهر بـfor_month
// (فاتورة تشرين الأوّل بيوم 10 تشرين الثاني مقبولة لحد ما ينقفل الشهر)، وكل رفض برمزه، والمرجع يُعاد بنفس النتيجة، والإلغاء يمرّ
// لصندوق انؤرشف بعد ما صار صفراً (E43)، والمصروف المكتوب من مستند يُلغى من مستنده (system_expense)، والجدول يُضاف ولا يتعدّل،
// والتقرير بمجاميعه وصفحاته لأدوار الكلفة بس، والثوابت صفر. كل نداء بدور authenticated حقيقي.
import { LEDGER_ZERO, balance, call, makeOrg, remainders, shown, uid, verifyLedger } from './ledger-kit.mjs';
import { race } from './shared.mjs';
import { STOCK_ZERO, verifyStock } from './stock-kit.mjs';

const TODAY = '2026-11-10';
const GO_LIVE = '2026-10-01';
const id = (n) => `e5000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477098000${String(n).padStart(2, '0')}`;

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const G = await makeOrg(db, {
    name: 'مزرعة المصاريف',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['accountant', 'accountant'],
      ['storekeeper', 'storekeeper'],
      ['viewer', 'viewer'],
      ['scopedAccountant', 'accountant', ['broiler']],
      ['scopedManager', 'manager', ['broiler']],
    ],
  });
  const { users: U, divisions: D, books: B } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  for (const division of Object.values(D)) await one(U.owner, 'select public.set_division_go_live($1, $2)', [division, GO_LIVE]);
  const box = await one(U.accountant, "insert into public.cash_accounts (name, kind) values ('الصندوق', 'cash') returning id");
  const box2 = await one(U.accountant, "insert into public.cash_accounts (name, kind) values ('صندوق النثرية', 'cash') returning id");
  await one(U.manager, 'select public.record_cash_opening(gen_random_uuid(), $1, 1000000, $2, gen_random_uuid())', [box, GO_LIVE]);
  await one(U.manager, 'select public.record_cash_opening(gen_random_uuid(), $1, 10000, $2, gen_random_uuid())', [box2, GO_LIVE]);
  const supplier = await one(U.accountant, "insert into public.parties (name, is_supplier) values ('شركة الكهرباء', true) returning id");
  const vet = await one(U.accountant, "insert into public.parties (name, is_supplier) values ('الطبيب البيطري', true) returning id");
  const power = await one(U.accountant, "insert into public.expense_categories (name) values ('كهرباء') returning id");
  const transport = await one(U.accountant, "insert into public.expense_categories (name) values ('نقل') returning id");
  const countDiff = (await db.admin("select id from public.expense_categories where org_id = $1 and system_code = 'count_diff'", [G.org])).rows[0].id;
  const broilerSite = await one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل الأمل', 'farm') returning id", [D.broiler]);

  /** تسجيل مصروف بالدالّة الحقيقية: الافتراض نقدي 25,000 كهرباء على العامّة من الصندوق، بتاريخ اليوم. */
  const rec = (user, o = {}, ref = uid()) =>
    call(db, user, 'select public.record_expense($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)', [
      o.id ?? uid(),
      'category' in o ? o.category : power,
      'division' in o ? o.division : D.general,
      'amount' in o ? o.amount : '25000',
      o.onDate ?? TODAY,
      'source' in o ? o.source : 'cash',
      'account' in o ? o.account : (o.source ?? 'cash') === 'cash' ? box : null,
      o.party ?? null,
      o.book ?? null,
      o.site ?? null,
      o.flock ?? null,
      o.batch ?? null,
      o.note ?? null,
      o.forMonth ?? null,
      ref,
    ]);
  const voidIt = (user, expenseId, reason = 'مصروف خاطئ', ref = uid()) => call(db, user, 'select public.void_expense($1, $2, $3)', [expenseId, reason, ref]);
  const boxBalance = async (account) => (await db.admin('select coalesce(sum(amount), 0)::text as v from public.cash_moves where account_id = $1', [account])).rows[0].v;
  const row = async (expenseId) =>
    (await db.admin(
      `select source, amount::text as amount, on_date::text as on_date, for_month::text as for_month, account_id, party_id, book_id, site_id, doc_kind, doc_id,
         cash_move_id, party_entry_id, reverses_id, reason, note from public.expenses where id = $1`,
      [expenseId],
    )).rows[0];

  // ── النقدي: حركة expense سالبة بالصندوق بالمبلغ بالضبط، وإلغاؤه يرجّعه بيوم الإلغاء وشهره ─────────────────────────────────
  const before = await boxBalance(box);
  const cashId = uid();
  const cash = await rec(U.accountant, { id: cashId, note: 'فاتورة كهرباء تشرين الأوّل', forMonth: '2026-10-15' });
  t.eq(shown(cash), 'ok', `المحاسب يسجّل مصروفاً نقدياً (${cash.code ?? ''} ${cash.hint ?? ''})`);
  const cashRow = await row(cashId);
  const cashMove = (await db.admin('select kind, amount::text as amount, doc_kind, doc_id, on_date::text as on_date from public.cash_moves where id = $1', [cashRow.cash_move_id])).rows[0];
  t.same(
    [cashRow.source, cashRow.amount, cashRow.for_month, cashRow.account_id === box, cashMove, await boxBalance(box)],
    ['cash', '25000', '2026-10-01', true, { kind: 'expense', amount: '-25000', doc_kind: 'expense', doc_id: cashId, on_date: TODAY }, String(Number(before) - 25000)],
    'النقدي: الشهر أوّل تشرين الأوّل، وحركة expense بـ−25,000 بمستند المصروف، والصندوق نقص المبلغ بالضبط',
  );
  t.same([cash.value.money.amount, cash.value.for_month, cash.value.cash_move_id], ['25000', '2026-10-01', cashRow.cash_move_id], 'النتيجة: المبلغ داخل money والشهر وحركة الصندوق');
  t.same(await rec(U.accountant, { id: cashId, note: 'فاتورة كهرباء تشرين الأوّل', forMonth: '2026-10-15' }, uid()).then(shown), 'id_reused', 'نفس المعرّف بمرجع جديد ← id_reused');

  // المرجع: نفس النداء ← نفس النتيجة بلا صفّ ثاني؛ بمعطيات ثانية أو بمستخدم ثاني ← ref_reused.
  const ref = uid();
  const replayId = uid();
  const first = await rec(U.accountant, { id: replayId, amount: '7000', category: transport }, ref);
  const again = await rec(U.accountant, { id: replayId, amount: '7000', category: transport }, ref);
  const changed = await rec(U.accountant, { id: replayId, amount: '7500', category: transport }, ref);
  const otherUser = await rec(U.manager, { id: replayId, amount: '7000', category: transport }, ref);
  t.same(
    [shown(first), JSON.stringify(again.value) === JSON.stringify(first.value), shown(changed), shown(otherUser),
      (await db.admin('select count(*)::int as n from public.expenses where id = $1', [replayId])).rows[0].n],
    ['ok', true, 'ref_reused', 'ref_reused', 1],
    'نفس المرجع مرّتين = نتيجة وحدة وصفّ واحد؛ بمبلغ ثاني أو بمستخدم ثاني ← ref_reused',
  );

  // الإلغاء: صفّ عكسي بيوم الإلغاء وشهره وسببه، وحركة عكسية ترجّع الصندوق؛ ومرّة ثانية already_reversed، وصفّ الإلغاء ما يُلغى.
  const voided = await voidIt(U.manager, cashId, 'تكرّرت الفاتورة');
  const reversal = (await db.admin('select id from public.expenses where reverses_id = $1', [cashId])).rows[0]?.id;
  const reversalRow = reversal ? await row(reversal) : null;
  t.same(
    [shown(voided), reversalRow?.amount, reversalRow?.on_date, reversalRow?.for_month, reversalRow?.reason, await boxBalance(box)],
    ['ok', '-25000', TODAY, '2026-11-01', 'تكرّرت الفاتورة', String(Number(before) - 7000)],
    'إلغاء النقدي: −25,000 بيوم الإلغاء وشهره (تشرين الثاني) وسببه، والصندوق رجع ما عدا مصروف الـ7,000',
  );
  t.same(
    [shown(await voidIt(U.manager, cashId)), shown(await voidIt(U.manager, reversal)), shown(await voidIt(U.accountant, replayId)), shown(await voidIt(U.manager, replayId, '  '))],
    ['already_reversed', 'not_voidable', 'forbidden', 'reason_required'],
    'الإلغاء مرّة ثانية already_reversed، وصفّ الإلغاء not_voidable، والمحاسب forbidden، والسبب الفارغ reason_required',
  );
  t.eq(shown(await call(db, U.manager, "select public.void_cash_move($1, 'خطأ', gen_random_uuid())", [cashRow.cash_move_id])), 'void_from_source', 'حركة المصروف ما تُلغى من «ألغِ الحركة»: void_from_source');

  // ── بالدين: قيد bill «له» بدفتر الوحدة الرئيسي، يتوزّع على «عليه» القائم بنفس الدفتر (القاعدة 27) ─────────────────────────────
  await one(U.manager, 'select public.record_opening_balance(gen_random_uuid(), $1, $2, 20000, $3, gen_random_uuid())', [supplier, B.broiler, GO_LIVE]);
  const creditId = uid();
  const credit = await rec(U.accountant, { id: creditId, division: D.broiler, source: 'credit', party: supplier, amount: '50000', site: broilerSite });
  const creditRow = await row(creditId);
  const bill = (await db.admin('select kind, amount::text as amount, book_id, doc_kind, doc_id from public.party_entries where id = $1', [creditRow.party_entry_id])).rows[0];
  t.same(
    [shown(credit), creditRow.book_id === B.broiler, creditRow.site_id === broilerSite, bill.kind, bill.amount, bill.book_id === B.broiler, bill.doc_kind, bill.doc_id === creditId,
      credit.value.money.allocations.map((a) => a.amount), await balance(db, supplier, B.broiler)],
    ['ok', true, true, 'bill', '-50000', true, 'expense', true, ['20000'], '-30000'],
    'بالدين باللحم: bill −50,000 «له» بدفتر اللحم الرئيسي، توزّع منه 20,000 على الافتتاح القائم، والرصيد «له» 30,000',
  );
  const credit2Id = uid();
  await rec(U.accountant, { id: credit2Id, division: D.broiler, source: 'credit', party: supplier, amount: '5000', book: B.broiler });
  const voidCredit = await voidIt(U.manager, creditId, 'فاتورة مكرّرة');
  t.same(
    [shown(voidCredit), await balance(db, supplier, B.broiler), (await remainders(db, supplier, B.broiler)).filter((r) => r.remaining !== '0').map((r) => [r.kind, r.amount, r.remaining])],
    ['ok', '15000', [['opening', '20000', '15000']]],
    'إلغاء بالدين: القيد وعكسه زوج مغلق، والتوزيع انفكّ وانعاد: الافتتاح 20,000 متبقّيه 15,000 بعد ما توزّعت عليه فاتورة الـ5,000',
  );
  // المفقس بلا دفتر رئيسي: الدفتر يُسمّى (book_required)، ودفتر وحدة ثانية book_mismatch، ودفتر الأفراخ ينجح.
  t.same(
    [
      shown(await rec(U.accountant, { division: D.hatchery, source: 'credit', party: vet })),
      shown(await rec(U.accountant, { division: D.hatchery, source: 'credit', party: vet, book: B.feed_mill })),
      shown(await rec(U.accountant, { division: D.hatchery, source: 'credit', party: vet, book: B.chicks, amount: '3000' })),
      shown(await rec(U.accountant, { division: D.broiler, source: 'credit', party: vet, book: B.chicks })),
      await balance(db, vet, B.chicks),
    ],
    ['book_required', 'book_mismatch', 'ok', 'book_mismatch', '-3000'],
    'المفقس: بلا دفتر book_required، وبدفتر المعمل book_mismatch، وبدفتر الأفراخ «له» 3,000؛ واللحم بدفتر الأفراخ book_mismatch',
  );

  // ── الرفض برمزه (FOUNDATION ٥٥٧؛ Q13؛ Q2) ──────────────────────────────────────────────────────────────────────────
  const archivedParty = await one(U.accountant, "insert into public.parties (name, is_supplier) values ('مورّد قديم', true) returning id");
  await one(U.accountant, 'update public.parties set archived_at = now() where id = $1 returning id', [archivedParty]);
  const archivedCategory = await one(U.accountant, "insert into public.expense_categories (name) values ('قرطاسية') returning id");
  await one(U.accountant, 'update public.expense_categories set archived_at = now() where id = $1 returning id', [archivedCategory]);
  const otherSite = await one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل البيض', 'farm') returning id", [D.layer]);
  const rejects = {
    flock: [{ flock: uid() }, 'flock_not_available'],
    batch: [{ batch: uid() }, 'flock_not_available'],
    division: [{ division: null }, 'division_required'],
    category: [{ category: null }, 'category_required'],
    systemCategory: [{ category: countDiff }, 'system_expense'],
    archivedCategory: [{ category: archivedCategory }, 'category_archived'],
    zero: [{ amount: '0' }, 'amount_not_positive'],
    negative: [{ amount: '-100' }, 'amount_not_positive'],
    fils: [{ amount: '25000.5' }, 'amount_not_whole_dinar'],
    notANumber: [{ amount: 'NaN' }, 'amount_required'],
    source: [{ source: null, account: null }, 'source_required'],
    sourceText: [{ source: 'stock', account: null }, 'source_required'],
    cashParty: [{ party: supplier }, 'source_mismatch'],
    cashNoBox: [{ account: null }, 'cash_account_required'],
    creditBox: [{ source: 'credit', party: supplier, account: box }, 'source_mismatch'],
    creditNoParty: [{ source: 'credit' }, 'party_required'],
    archivedParty: [{ source: 'credit', party: archivedParty, division: D.broiler }, 'party_archived'],
    site: [{ site: otherSite }, 'site_mismatch'],
    future: [{ onDate: '2026-11-11' }, 'date_in_future'],
    tooOld: [{ onDate: '2026-11-02' }, 'date_too_old'],
    beforeGoLive: [{ onDate: '2026-11-05', division: D.layer }, null],
    nextMonth: [{ forMonth: '2026-12-01' }, 'for_month_invalid'],
    longNote: [{ note: 'ن'.repeat(501) }, 'note_too_long'],
  };
  // يوم تشغيل البيّاض بعد التاريخ: before_go_live (الوحدة الثانية بلا ترحيل، فيوم تشغيلها يتغيّر).
  await one(U.owner, 'select public.set_division_go_live($1, $2)', [D.layer, '2026-11-08']);
  rejects.beforeGoLive[1] = 'before_go_live';
  const got = {};
  for (const [key, [o]] of Object.entries(rejects)) got[key] = shown(await rec(U.accountant, o));
  t.same(got, Object.fromEntries(Object.entries(rejects).map(([key, [, code]]) => [key, code])), 'كل رفض برمزه');
  t.same(
    [shown(await rec(U.storekeeper)), shown(await rec(U.viewer)), shown(await rec(U.scopedAccountant)), shown(await rec(U.scopedAccountant, { division: D.broiler, amount: '1000' }))],
    ['forbidden', 'forbidden', 'out_of_scope', 'ok'],
    'الأمين والمشاهد forbidden، والمحاسب المحصور باللحم: العامّة out_of_scope واللحم ينجح',
  );

  // ── E43: صندوق صار صفراً وانؤرشف، فإلغاء مصروفه يمرّ ويرجع إليه رصيده (مؤرشف وعليه رصيد) ──────────────────────────────────
  const pettyId = uid();
  t.eq(shown(await rec(U.accountant, { id: pettyId, account: box2, amount: '10000' })), 'ok', 'مصروف يصفّر صندوق النثرية');
  await one(U.accountant, 'update public.cash_accounts set archived_at = now() where id = $1 returning id', [box2]);
  t.same(
    [shown(await rec(U.accountant, { account: box2, amount: '1000' })), shown(await voidIt(U.manager, pettyId, 'ما صُرف')), await boxBalance(box2)],
    ['cash_account_archived', 'ok', '10000'],
    'الصندوق المؤرشف يرفض مصروفاً جديداً، وإلغاء مصروفه يمرّ (E43) فيرجع إليه 10,000',
  );

  // ── المصروف المكتوب من مستند يُلغى من مستنده، والجدول يُضاف ولا يتعدّل حتى لصاحب الجداول ─────────────────────────────────
  const stockLike = await db.asOwner(async (q) => {
    await q('savepoint s');
    const docId = uid();
    const inserted = (await q(
      "insert into public.expenses (org_id, category_id, division_id, amount, on_date, for_month, source, doc_kind, doc_id) values ($1, $2, $3, 500, $4, '2026-11-01', 'stock', 'count', $5) returning id",
      [G.org, countDiff, D.general, TODAY, docId],
    )).rows[0].id;
    const result = [];
    for (const sql of ['update public.expenses set amount = 600 where id = $1', 'delete from public.expenses where id = $1']) {
      await q('savepoint x');
      try {
        await q(sql, [inserted]);
        result.push('ok');
      } catch (error) {
        result.push(error.message);
      }
      await q('rollback to savepoint x');
    }
    await q('savepoint y');
    try {
      await q('truncate public.expenses');
      result.push('ok');
    } catch (error) {
      result.push(error.message);
    }
    await q('rollback to savepoint y');
    return result;
  }, U.owner);
  t.same(stockLike, ['append_only', 'append_only', 'append_only'], 'المصاريف تُضاف ولا تتعدّل: التعديل والحذف والمسح يرفضها مشغّلها حتى لصاحب الجداول');
  t.eq(shown(await voidIt(U.manager, uid())), 'expense_not_found', 'إلغاء مصروف غير موجود: expense_not_found');

  // ── الشهر (Q14): فاتورة تشرين الأوّل بيوم 10 تشرين الثاني مقبولة لحد ما ينقفل الشهر، والشهر المقفول (آخر يوم بيه مقفول) يرفض ────────────
  t.same(
    [
      shown(await rec(U.accountant, { forMonth: '2026-10-01', amount: '1000' })),
      shown(await rec(U.accountant, { forMonth: '2026-09-01', amount: '1000' })),
    ],
    ['ok', 'ok'],
    'شهر قبله غير مقفول (تشرين الأوّل وأيلول) مقبول',
  );
  await one(U.manager, 'select public.set_period_lock($1)', ['2026-10-15']);
  t.same(
    [
      shown(await rec(U.accountant, { forMonth: '2026-09-01', amount: '1000' })),
      shown(await rec(U.accountant, { forMonth: '2026-10-01', amount: '1000' })),
      shown(await rec(U.accountant, { forMonth: '2026-11-01', amount: '1000' })),
    ],
    ['period_locked', 'ok', 'ok'],
    'قفل حتى 15 تشرين الأوّل: أيلول (مقفل كلّه) period_locked، وتشرين الأوّل (باقي أيّامه مفتوحة، مراجعة WP5) وتشرين الثاني مقبولان',
  );
  await one(U.manager, 'select public.set_period_lock($1)', ['2026-10-31']);
  const lockedMonth = await rec(U.accountant, { forMonth: '2026-10-01', amount: '1000' });
  t.same(
    [shown(lockedMonth), lockedMonth.hint.includes('10/2026'), shown(await rec(U.accountant, { amount: '1000' }))],
    ['period_locked', true, 'ok'],
    'قفل حتى آخر تشرين الأوّل: تشرين الأوّل period_locked (التلميح يسمّيه)، وشهر التاريخ مقبول',
  );

  // ── التقرير (§2.8، Q14): أدوار الكلفة بس، والمجاميع لكل تصنيف ومصدر وشهر من الخادم، والصفحات بمؤشّر ───────────────────────────
  const report = (user, from, to, division = null, after = null, limit = 50) =>
    call(db, user, 'select public.report_expenses($1, $2, $3, $4, $5)', [from, to, division, after, limit]);
  const full = (await report(U.accountant, '2026-09-01', TODAY)).value;
  const raw = (await db.admin(
    "select coalesce(sum(amount), 0)::text as total, count(*)::int as n from public.expenses where org_id = $1 and for_month between '2026-09-01' and $2",
    [G.org, TODAY],
  )).rows[0];
  const byMonth = Object.fromEntries(full.totals.by_month.map((m) => [m.for_month, m.amount]));
  t.same(
    [full.totals.total, full.totals.count, full.rows.length, byMonth['2026-09-01'], Object.keys(byMonth).sort()],
    [raw.total, raw.n, raw.n, '1000', ['2026-09-01', '2026-10-01', '2026-11-01']],
    'التقرير: المجموع والعدد = الصفوف الخام، والمجاميع بالشهر (أيلول وتشرين الأوّل وتشرين الثاني)',
  );
  const pageOne = (await report(U.accountant, '2026-09-01', TODAY, null, null, 2)).value;
  const pageTwo = (await report(U.accountant, '2026-09-01', TODAY, null, pageOne.next, 2)).value;
  t.same(
    [pageOne.rows.length, pageTwo.rows.length, pageOne.rows.concat(pageTwo.rows).map((r) => r.id), pageOne.totals.total],
    [2, 2, full.rows.slice(0, 4).map((r) => r.id), full.totals.total],
    'صفحتان بمؤشّر: نفس ترتيب التقرير كلّه، والمجموع نفسه بكل صفحة (مو مجموع الصفحة)',
  );
  const broilerOnly = (await report(U.accountant, '2026-09-01', TODAY, D.broiler)).value;
  const reversed = full.rows.find((r) => r.id === cashId);
  t.same(
    [broilerOnly.rows.every((r) => r.division_id === D.broiler), reversed?.reversed, full.rows.find((r) => r.reverses === cashId)?.amount, full.rows.find((r) => r.id === creditId)?.party_name],
    [true, true, '-25000', 'شركة الكهرباء'],
    'فلتر الوحدة، والملغى معلَّم وصفّ إلغائه سالب، والجهة باسمها',
  );
  t.same(
    [shown(await report(U.storekeeper, '2026-09-01', TODAY)), shown(await report(U.viewer, '2026-09-01', TODAY)), shown(await report(U.accountant, TODAY, '2026-09-01'))],
    ['forbidden', 'forbidden', 'period_required'],
    'الأمين والمشاهد forbidden (مو صفر صفوف)، ومدّة مقلوبة period_required',
  );
  const scoped = (await report(U.scopedAccountant, '2026-09-01', TODAY)).value;
  t.ok(scoped.rows.length > 0 && scoped.rows.every((r) => r.division_id === D.broiler), 'المحاسب المحصور باللحم يقرأ مصاريف اللحم بس (E49)');
  t.same(
    [scoped.divisions, full.divisions, shown(await report(U.scopedAccountant, '2026-09-01', TODAY, D.general))],
    [{ total: 6, visible: 1 }, { total: 6, visible: 6 }, 'out_of_scope'],
    'التقرير يقول وحدات النطاق من المجموع (1 من 6 للمحصور)، ووحدة برّا نطاقه out_of_scope (كانت مجموعاً صفراً بصمت)',
  );
  // إلغاء مصروف وحدة ثانية: النطاق قبل رموز الصفّ (system_expense وnot_voidable كانت تكشف نوعه بمعرّفه).
  const otherDivision = (await db.admin("select id from public.expenses where org_id = $1 and division_id <> $2 and source = 'cash' and reverses_id is null limit 1", [G.org, D.broiler])).rows[0].id;
  t.eq(shown(await voidIt(U.scopedManager, otherDivision, 'برّا النطاق')), 'out_of_scope', 'المدير المحصور باللحم يلغي مصروف وحدة ثانية: out_of_scope قبل أيّ رمز');
  const seen = async (user) => (await db.asUser(user, (q) => q('select count(*)::int as n from public.expenses'))).rows[0].n;
  t.same([await seen(U.storekeeper), await seen(U.viewer), (await seen(U.accountant)) > 0], [0, 0, true], 'جدول المصاريف: الأمين والمشاهد صفر صفوف، والمحاسب يقرأ');

  // ── التزامن (مراجعة WP5، جلستان حقيقيتان): أرشفة التصنيف أو الموقع بين فحص المصروف وكتابته، والوحدة تنقرا ثاني بقفل بعد قفل
  //    الفترة، ونفس المعرّف بمرجعين بنفس اللحظة ──────────────────────────────────────────────────────────────────────────
  const RECORD = "select public.record_expense($1, $2, $3, 25000, $4, 'cash', $5, null, null, $6, null, null, null, null, gen_random_uuid()) as result";
  const recordSpec = (o = {}) => ({ user: U.accountant, sql: RECORD, params: [o.id ?? uid(), o.category ?? power, o.division ?? D.general, TODAY, box, o.site ?? null] });
  const racing = await one(U.accountant, "insert into public.expense_categories (name) values ('وقود السباق') returning id");
  const categoryRace = await race(db, { user: U.accountant, sql: 'update public.expense_categories set archived_at = now() where id = $1', params: [racing] }, recordSpec({ category: racing }));
  t.same(
    [categoryRace.first, categoryRace.state, categoryRace.second],
    ['ok', 'blocked', 'category_archived'],
    'أرشفة التصنيف والمصروف سوا: المصروف ينتظر قفل التصنيف ثم category_archived (كان يعبر بتصنيف انؤرشف)',
  );
  const racingSite = await one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل السباق', 'farm') returning id", [D.broiler]);
  const siteRace = await race(db, { user: U.owner, sql: 'update public.sites set archived_at = now() where id = $1', params: [racingSite] }, recordSpec({ division: D.broiler, site: racingSite }));
  t.same(
    [siteRace.first, siteRace.state, siteRace.second],
    ['ok', 'blocked', 'site_mismatch'],
    'أرشفة الموقع والمصروف عليه سوا: المصروف ينتظر قفل الموقع ثم site_mismatch (كان يعبر بموقع انؤرشف)',
  );
  // الوحدة ما تنؤرشف من الشاشات بعد، فالبديلة صاحب الجداول وأرشفتها ترجع (الوحدات الست ثابتة بـverify_core): المصروف ينتظرها.
  const divisionRace = await race(
    db,
    { user: U.owner, role: 'postgres', sql: 'update public.divisions set archived_at = now() where id = $1', params: [D.general], rollback: true },
    recordSpec(),
  );
  t.same([divisionRace.first, divisionRace.state, divisionRace.second], ['ok', 'blocked', 'ok'], 'أرشفة وحدة لسه ما ثبتت: المصروف ينتظر قفل الوحدة بعد قفل الفترة (كان يعبر بلا انتظار)');
  const sharedId = uid();
  const idRace = await race(db, recordSpec({ id: sharedId }), recordSpec({ id: sharedId }));
  t.same(
    [idRace.first, idRace.state, idRace.second, (await db.admin('select count(*)::int as n from public.expenses where id = $1', [sharedId])).rows[0].n],
    ['ok', 'blocked', 'id_reused', 1],
    'نفس المعرّف بمرجعين بنفس اللحظة: الثاني ينتظر قفل المعرّف ثم id_reused (كان 23505 خام)، وصفّ واحد',
  );

  // ── الثوابت ─────────────────────────────────────────────────────────────────────────────────────────────────────
  t.same(await db.asService(verifyLedger), LEDGER_ZERO, 'verify_ledger صفر بعد المصاريف وإلغاءاتها');
  t.same(await db.asService(verifyStock), STOCK_ZERO, 'verify_stock صفر');
}
