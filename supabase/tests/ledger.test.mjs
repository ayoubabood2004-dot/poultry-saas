// 0006 بدور authenticated حقيقي (خطّة المرحلة 1 WP3): GOLD-07 (افتتاح أبو علي بيوم التشغيل، والتالي after_go_live، ومستثنى من
// حدّ الأيام السبعة)؛ والتوزيع بالقاعدة 27 (2,000,000 «قبضنا» ← 500,000 للسابق والفائض «له» بنفس الدفتر)؛ وبروتوكول المرجع
// (C2–C4، والإعادة بمستخدم ثانٍ، والإخفاء)؛ والترقيم (C5)؛ والتزامن (C6–C8)؛ وتسرّب الحسابات لكل دور؛ والدفاتر الثابتة حتى
// بمفتاح الخادم؛ والأرشيف والإلغاء (E43)؛ وverify_ledger صفر بأسماء فحوصه وكل فحص يمسك كسره. فحص الخصائص v1 بـproperty.test.mjs.
import { balance, call, canon, LEDGER_ZERO, makeOrg, remainders, shown, uid, verifyLedger } from './ledger-kit.mjs';

const TODAY = '2026-10-30';
const id = (n) => `d2000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477092000${String(n).padStart(2, '0')}`;

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const G = await makeOrg(db, {
    name: 'مزرعة الدفتر الذهبي',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['manager2', 'manager'],
      ['accountant', 'accountant'],
      ['storekeeper', 'storekeeper', ['general']],
      ['viewer', 'viewer'],
      ['mill_operator', 'mill_operator'],
      ['hatchery_operator', 'hatchery_operator'],
      ['hall_worker', 'hall_worker', ['broiler']],
    ],
  });
  const { users: U, books: B, divisions: D } = G;
  const asM = (sql, params) => call(db, U.manager, sql, params);
  for (const [kind, day] of [['feed_mill', '2026-09-30'], ['hatchery', '2026-09-24'], ['general', '2026-09-30']]) await asM('select public.set_division_go_live($1, $2)', [D[kind], day]);
  const party = async (name) => (await asM("insert into public.parties (name, is_customer) values ($1, true) returning id", [name])).value;
  const BOX = (await asM("insert into public.cash_accounts (name, kind) values ('الصندوق', 'cash') returning id")).value;
  const payArgs = (p, book, amount, account = BOX) => [uid(), p, book, amount, account, TODAY, uid()];

  // ── GOLD-07: افتتاح أبو علي +500,000 بدفتر المعمل يوم تشغيله 30/09 (قبل اليوم بثلاثين يوماً) ─────────────────────────────
  const abuAli = await party('أبو علي');
  const gold = await asM('select public.record_opening_balance($1, $2, $3, 500000, $4, $5)', [uid(), abuAli, B.feed_mill, '2026-09-30', uid()]);
  t.eq(shown(gold), 'ok', 'GOLD-07: افتتاح أبو علي 500,000 بدفتر المعمل يوم تشغيله ينقبل');
  t.eq((await db.admin("select $1::date - date '2026-09-30' as d", [TODAY])).rows[0].d, 30, 'والافتتاح قبل اليوم بثلاثين يوماً (مستثنى من حدّ الأيام السبعة)');
  const late = await asM('select public.record_opening_balance($1, $2, $3, 500000, $4, $5)', [uid(), await party('أبو علي الثاني'), B.feed_mill, '2026-10-01', uid()]);
  t.eq(shown(late), 'after_go_live', 'GOLD-07: نفس الافتتاح بتاريخ 01/10 ← after_go_live');
  t.same([gold.value.money.amount, gold.value.money.remaining, gold.value.doc_no], ['500000', '500000', null], 'الافتتاح بلا رقم (E12) ومتبقّيه كامل');

  // ── القاعدة 27: 2,000,000 «قبضنا» ← 500,000 للسابق، والفائض «له 1,500,000» بنفس الدفتر، ودفتر الأفراخ ما يتحرّك ───────────
  const received = await asM('select public.record_party_payment($1, $2, $3, $4, $5, $6, $7)', payArgs(abuAli, B.feed_mill, '2000000'));
  t.eq(canon(received.value.money.allocations), canon([{ entry_id: gold.value.id, amount: '500000' }]), 'التوزيع: 500,000 للرصيد السابق (الافتتاح أوّلاً)');
  t.same([received.value.money.remaining, received.value.doc_no], ['1500000', 'RC-2026-0001'], 'والفائض 1,500,000 يبقى على القبض، ورقمه RC-2026-0001');
  t.same([await balance(db, abuAli, B.feed_mill), await balance(db, abuAli, B.chicks)], ['-1500000', '0'], 'أبو علي «له 1,500,000» بدفتر المعمل، ودفتر الأفراخ صفر');
  const rows = (await call(db, U.accountant, "select public.report_party_balances($1, $2, null, true, 'balance', null, null, 50)", ['2026-01-01', TODAY])).value.rows;
  const cell = rows.find((r) => r.party_id === abuAli).cells.find((c) => c.book_id === B.feed_mill);
  t.same([cell.opening, cell.debit, cell.credit, cell.closing], ['0', '500000', '2000000', '-1500000'], 'جدول الجهات: خلية دفتر المعمل (عليه 500,000، له 2,000,000، الرصيد «له 1,500,000»)');

  // ── بروتوكول المرجع (C2–C4، FOUNDATION ٥١٩) ─────────────────────────────────────────────────────────────────────
  async function race(first, second, { commitFirst = true } = {}) {
    const one = await db.session(first.user);
    const two = await db.session(second.user);
    try {
      const a = await one.run(first.sql, first.params);
      const pendingB = two.run(second.sql, second.params);
      const state = await db.settle(pendingB, two.pid);
      if (commitFirst) await one.commit();
      else await one.rollback();
      const b = await pendingB;
      await two.commit();
      return { a, b, state };
    } finally {
      await one.rollback();
      await two.rollback();
    }
  }
  const sql = 'select public.record_party_payment($1, $2, $3, $4, $5, $6, $7) as r';
  const refParty = await party('جهة المرجع');
  const sameArgs = payArgs(refParty, B.feed_mill, '300000');
  const sameRef = await race({ user: U.manager, sql, params: sameArgs }, { user: U.manager, sql, params: sameArgs });
  t.same([sameRef.state, sameRef.a.ok, sameRef.b.ok], ['blocked', true, true], 'C2: نفس المرجع بجلستين: الثانية نامت على المرجع وكملت بلا خطأ');
  t.same(sameRef.b.rows, sameRef.a.rows, 'C2: نفس المرجع مرّتين = نفس النتيجة بالضبط');
  t.eq((await db.admin('select count(*)::int as n from public.party_entries where id = $1', [sameArgs[0]])).rows[0].n, 1, 'C2: قيد واحد');
  t.eq((await db.admin('select count(*)::int as n from public.cash_moves where party_entry_id = $1', [sameArgs[0]])).rows[0].n, 1, 'C2: حركة صندوق وحدة');
  const reused = await call(db, U.manager, sql, [sameArgs[0], refParty, B.feed_mill, '300001', BOX, TODAY, sameArgs[6]]);
  t.eq(shown(reused), 'ref_reused', 'C3: نفس المرجع بمبلغ ثاني ← ref_reused');
  t.eq(shown(await call(db, U.manager2, sql, sameArgs)), 'ref_reused', 'نفس المرجع بنفس المعطيات من مستخدم ثاني ← ref_reused (E2)');
  const replay = await call(db, U.manager, sql, sameArgs);
  t.same(replay.value, sameRef.a.rows[0].r, 'نفس المستخدم يعيد بنفس المرجع: النتيجة المحفوظة نفسها، بلا قيد ثاني');
  const rolledArgs = payArgs(refParty, B.feed_mill, '1000');
  const rolled = await race({ user: U.manager, sql, params: rolledArgs }, { user: U.manager, sql, params: rolledArgs }, { commitFirst: false });
  t.same([rolled.state, rolled.b.ok], ['blocked', true], 'C4: الأولى رجعت ← الثانية بنفس المرجع كملت هي');
  t.eq((await db.admin('select count(*)::int as n from public.party_entries where id = $1', [rolledArgs[0]])).rows[0].n, 1, 'C4: قيد واحد بعد رجوع الأولى');
  // الإخفاء (E2): المال داخل money ينشال بأي عمق لمن ما يرى الكلف، ويبقى لمن يراها.
  const sample = { id: 'x', money: { amount: '1' }, lines: [{ qty: '2', money: { value: '3' } }], nested: { inner: { money: { a: 1 }, keep: true } } };
  const masked = await db.asOwner((q) => q('select private.mask($1::jsonb) as v', [JSON.stringify(sample)]), U.storekeeper);
  t.eq(canon(masked.rows[0].v), canon({ id: 'x', lines: [{ qty: '2' }], nested: { inner: { keep: true } } }), 'mask: الأمين ما يشوف أي money بأي عمق');
  const visible = await db.asOwner((q) => q('select private.mask($1::jsonb) as v', [JSON.stringify(sample)]), U.accountant);
  t.eq(canon(visible.rows[0].v), canon(sample), 'ضابط: المحاسب يشوف النتيجة كاملة');

  // ── الترقيم (C5): قبضان بنفس اللحظة برقمين متتاليين، وRC وPY تسلسلان مستقلّان ─────────────────────────────────────────
  const numbered = await race(
    { user: U.manager, sql, params: payArgs(await party('جهة الرقم الأولى'), B.feed_mill, '1000') },
    { user: U.accountant, sql, params: payArgs(await party('جهة الرقم الثانية'), B.general, '1000') },
  );
  const numbers = [numbered.a.rows[0].r.doc_no, numbered.b.rows[0].r.doc_no];
  t.eq(numbered.state, 'blocked', 'C5: الثاني ينتظر عدّاد الرقم (آخر قفل)');
  t.eq(Number(numbers[1].slice(-4)) - Number(numbers[0].slice(-4)), 1, `C5: رقمان متتاليان (${numbers.join('، ')})`);
  const payout = await asM('select public.pay_party($1, $2, $3, $4, $5, $6, $7)', payArgs(refParty, B.feed_mill, '5000'));
  t.eq(payout.value.doc_no, 'PY-2026-0001', 'الدفع بتسلسله المستقلّ: أوّل PY بالسنة 0001 بعد عدّة RC');

  // ── التزامن (C6–C8، FOUNDATION ٨١٨، ٨٨٠) ─────────────────────────────────────────────────────────────────────
  const c6 = await party('جهة C6');
  const c6Opening = (await asM('select public.record_opening_balance($1, $2, $3, 1000000, $4, $5)', [uid(), c6, B.general, '2026-09-30', uid()])).value.id;
  const c6Race = await race({ user: U.manager, sql, params: payArgs(c6, B.general, '700000') }, { user: U.accountant, sql, params: payArgs(c6, B.general, '700000') });
  t.same([c6Race.state, c6Race.a.ok, c6Race.b.ok], ['blocked', true, true], 'C6: قبضان لنفس الجهة والدفتر: الثاني ينتظر قفل الجهة');
  const c6Rows = await remainders(db, c6, B.general);
  t.same(c6Rows.map((r) => [r.kind, r.amount, r.remaining]), [['opening', '1000000', '0'], ['payment', '-700000', '0'], ['payment', '-700000', '400000']], 'C6: الافتتاح انسدّ بالضبط (700,000 ثم 300,000)، والفائض 400,000 بلا توزيع زايد');
  t.eq(c6Rows[0].id, c6Opening, 'C6: والمسدود هو الافتتاح نفسه');
  const c7 = await party('جهة C7');
  await asM('select public.record_opening_balance($1, $2, $3, 100000, $4, $5)', [uid(), c7, B.feed_mill, '2026-09-30', uid()]);
  await asM('select public.record_opening_balance($1, $2, $3, 200000, $4, $5)', [uid(), c7, B.chicks, '2026-09-24', uid()]);
  const c7Race = await race({ user: U.manager, sql, params: payArgs(c7, B.feed_mill, '100000') }, { user: U.accountant, sql, params: payArgs(c7, B.chicks, '200000') });
  t.same([c7Race.state, await balance(db, c7, B.feed_mill), await balance(db, c7, B.chicks)], ['blocked', '0', '0'], 'C7: قبضان بدفترين للجهة نفسها: قفل الجهة مهما كان الدفتر، وكل قبض سدّ دفتره');
  t.same((await remainders(db, c7, B.chicks)).map((r) => r.remaining), ['0', '0'], 'C7: دفتر الأفراخ انسدّ من قبضه هو مو من قبض المعمل');
  const c8 = await party('جهة C8');
  const c8Pay = (await asM('select public.record_party_payment($1, $2, $3, $4, $5, $6, $7)', payArgs(c8, B.general, '300000'))).value.id;
  const c8Race = await race(
    { user: U.manager, sql: 'select public.void_party_payment($1, $2, $3)', params: [c8Pay, 'قبض مكرّر', uid()] },
    { user: U.manager2, sql: 'select public.pay_party($1, $2, $3, $4, $5, $6, $7)', params: payArgs(c8, B.general, '100000') },
  );
  t.same([c8Race.state, c8Race.a.ok, c8Race.b.ok, c8Race.b.error ?? ''], ['blocked', true, true, ''], 'C8: إلغاء القبض والدفع بنفس اللحظة: الثاني ينتظر، والاثنين بلا 40P01');
  t.eq(await balance(db, c8, B.general), '100000', 'C8: الرصيد الصحيح بعدهما («عليه 100,000»: الدفع وحده بعد إلغاء القبض)');

  // ── تسرّب الحسابات (FOUNDATION ٨٦١، §2.8): الأدوار بلا حسابات صفر صفوف، والتقارير forbidden، والجهات لمن يرى المبيعات ─────
  const LEAK = ['storekeeper', 'viewer', 'mill_operator', 'hatchery_operator', 'hall_worker'];
  const SALES = new Set(['storekeeper', 'viewer']);
  const reports = [
    ['report_accounts_summary', 'select public.report_accounts_summary($1, $2)', ['2026-01-01', TODAY]],
    ['report_party_balances', "select public.report_party_balances($1, $2, null, true, 'balance', null, null, 50)", ['2026-01-01', TODAY]],
    ['report_party_statement', 'select public.report_party_statement($1, null, $2, $3)', [abuAli, '2026-01-01', TODAY]],
    ['report_cash_balances', 'select public.report_cash_balances($1, $2)', ['2026-01-01', TODAY]],
    ['report_cash_statement', 'select public.report_cash_statement($1, $2, $3)', [BOX, '2026-01-01', TODAY]],
    ['preview_party_allocation', "select public.preview_party_allocation($1, $2, 'payment', 1000)", [abuAli, B.feed_mill]],
  ];
  const leakSeen = {};
  for (const role of [...LEAK, 'accountant']) {
    leakSeen[role] = await db.asUser(U[role], async (q) => {
      const count = async (table) => (await q(`select count(*)::int as n from public.${table}`)).rows[0].n;
      const out = { entries: await count('party_entries'), allocations: await count('party_allocations'), boxes: await count('cash_accounts'), moves: await count('cash_moves') };
      out.parties = (await count('parties')) > 0;
      out.audit = (await q("select count(*)::int as n from public.audit_log where table_name in ('party_entries', 'cash_moves')")).rows[0].n;
      out.home = (await q('select public.home_summary() ? $1 as v', ['accounts'])).rows[0].v;
      return out;
    });
    leakSeen[role].reports = [];
    for (const [name, text, params] of reports) leakSeen[role].reports.push(`${name}:${shown(await call(db, U[role], text, params, { commit: false }))}`);
  }
  for (const role of LEAK) {
    t.same(
      leakSeen[role],
      { entries: 0, allocations: 0, boxes: 0, moves: 0, parties: SALES.has(role), audit: 0, home: false, reports: reports.map(([name]) => `${name}:forbidden`) },
      `${role}: صفر صفوف بالقيود والتوزيع والصناديق والحركات وسجلّها، والتقارير والمعاينة forbidden، وبطاقة الحسابات غايبة، والجهات ${SALES.has(role) ? 'تنقرا' : 'ما تنقرا'}`,
    );
  }
  const control = leakSeen.accountant;
  t.ok(control.entries > 0 && control.allocations > 0 && control.boxes > 0 && control.moves > 0 && control.parties && control.audit > 0 && control.home, 'ضابط: المحاسب يقرأ كل هذا');
  t.same(control.reports, reports.map(([name]) => `${name}:ok`), 'ضابط: والتقارير والمعاينة تنجح للمحاسب');

  // ── الدفاتر الثابتة (E52، §2.6): بلا امتياز كتابة للواجهة، والمشغّل يرفض حتى مفتاح الخادم وصاحب الجداول ─────────────────────
  const LOCKED = ['party_entries', 'party_allocations', 'cash_moves', 'doc_counters'];
  const privileges = (await db.admin(
    `select t.name, has_table_privilege('authenticated', 'public.' || t.name, 'insert') as i, has_table_privilege('authenticated', 'public.' || t.name, 'update') as u,
       has_table_privilege('authenticated', 'public.' || t.name, 'delete') as d from unnest($1::text[]) as t(name) order by 1`,
    [LOCKED],
  )).rows;
  t.same(privileges.filter((r) => r.i || r.u || r.d).map((r) => r.name), [], 'authenticated بلا INSERT ولا UPDATE ولا DELETE بالدفاتر والعدّاد');
  t.eq(shown(await call(db, U.manager, 'insert into public.party_entries (party_id, book_id, kind, amount, on_date) values ($1, $2, $3, 1, $4)', [abuAli, B.feed_mill, 'adjustment', TODAY])), '42501:permission denied for table party_entries', 'المدير ما يكتب قيداً مباشرة');
  const asService = async (text, params) => {
    try {
      await db.asService((q) => q(text, params));
      return 'ok';
    } catch (error) {
      return error.message;
    }
  };
  const appendOnly = {
    entryUpdate: await asService("update public.party_entries set reason = 'تعديل' where id = $1", [gold.value.id]),
    entryDelete: await asService('delete from public.party_entries where id = $1', [gold.value.id]),
    allocationUpdate: await asService('update public.party_allocations set amount = amount where party_id = $1', [abuAli]),
    moveDelete: await asService('delete from public.cash_moves where account_id = $1', [BOX]),
  };
  t.same(appendOnly, { entryUpdate: 'append_only', entryDelete: 'append_only', allocationUpdate: 'append_only', moveDelete: 'append_only' }, 'مفتاح الخادم: تعديل أو حذف بالدفاتر يرفضه المشغّل (append_only)');
  let truncated;
  try {
    // cascade: المصاريف (0008) تشير لحركات الصناديق، فبلاها يرفض المفتاح الأجنبي قبل المشغّل؛ وcascade يوصل مشغّل الأمر بالجدولين.
    await db.asOwner((q) => q('truncate public.cash_moves cascade'));
    truncated = 'ok';
  } catch (error) {
    truncated = error.message;
  }
  t.eq(truncated, 'append_only', 'وحتى صاحب الجداول: TRUNCATE يرفضه مشغّل الأمر');

  // ── الأرشيف والإلغاء (E43): الإلغاء ينجح على صندوق أو جهة انؤرشفت بعد أصلها، ويبين «مؤرشف وعليه رصيد» ─────────────────────
  const BX = (await asM("insert into public.cash_accounts (name, kind) values ('صندوق الأرشيف', 'cash') returning id")).value;
  const QX = await party('جهة الصندوق المؤرشف');
  const inbound = (await asM('select public.record_party_payment($1, $2, $3, $4, $5, $6, $7)', payArgs(QX, B.general, '100000', BX))).value.id;
  await asM('select public.pay_party($1, $2, $3, $4, $5, $6, $7)', payArgs(QX, B.general, '100000', BX));
  t.eq(shown(await asM("update public.cash_accounts set archived_at = 'now' where id = $1", [BX])), 'ok', 'الصندوق صفر بعد قبض ودفع: يتؤرشف');
  t.eq(shown(await asM('select public.void_party_payment($1, $2, $3)', [inbound, 'قبض خاطئ', uid()])), 'ok', 'إلغاء القبض على صندوق مؤرشف ينجح (العكسي ما يرفضه الأرشيف)');
  const boxes = (await call(db, U.accountant, 'select public.report_cash_balances($1, $2)', ['2026-01-01', TODAY])).value.accounts;
  const bx = boxes.find((a) => a.account_id === BX);
  t.same([bx.archived, bx.closing], [true, '-100000'], 'والصندوق المؤرشف بعده -100,000 (يبين «مؤرشف وعليه رصيد»)');
  t.eq(shown(await asM('select public.record_party_payment($1, $2, $3, $4, $5, $6, $7)', payArgs(QX, B.general, '1000', BX))), 'cash_account_archived', 'وقبض جديد عليه يرفض');
  const RX = await party('جهة مؤرشفة بعد التسديد');
  await asM('select public.record_opening_balance($1, $2, $3, 100000, $4, $5)', [uid(), RX, B.general, '2026-09-30', uid()]);
  const settle = (await asM('select public.record_party_payment($1, $2, $3, $4, $5, $6, $7)', payArgs(RX, B.general, '100000'))).value.id;
  t.eq(shown(await asM("update public.parties set archived_at = 'now' where id = $1", [RX])), 'ok', 'الجهة صفر بعد التسديد: تتؤرشف');
  t.eq(shown(await asM('select public.void_party_payment($1, $2, $3)', [settle, 'شيك راجع', uid()])), 'ok', 'إلغاء تسديدها بعد الأرشفة ينجح');
  const archivedRow = (await call(db, U.accountant, "select public.report_party_balances($1, $2, null, true, 'balance', null, null, 200)", ['2026-01-01', TODAY])).value.rows.find((r) => r.party_id === RX);
  t.same([archivedRow?.archived, archivedRow?.total], [true, '100000'], 'والجهة المؤرشفة «عليه 100,000» بالجدول بعلامتها');

  // ── الثوابت: verify_ledger صفر بأسماء فحوصه، وكل فحص يمسك كسره (ضوابط بمعاملات ترجع، بمنشأة هالملف) ──────────────────────
  t.same(await db.asService(verifyLedger), LEDGER_ZERO, `verify_ledger صفر بأسماء فحوصه الـ${Object.keys(LEDGER_ZERO).length} بالضبط (بمفتاح الخادم)`);
  const ORG = G.org;
  const BOOK = B.general;
  const probe = async (statements) => {
    try {
      return await db.asOwner(async (q) => {
        const p = (await q("insert into public.parties (org_id, name) values ($1, 'جهة الضابط') returning id", [ORG])).rows[0].id;
        const newBox = async (name) => (await q("insert into public.cash_accounts (org_id, name, kind) values ($1, $2, 'cash') returning id", [ORG, name])).rows[0].id;
        const boxes = { main: await newBox('صندوق الضابط'), second: await newBox('صندوق الضابط الثاني') };
        const ids = {};
        const entryOf = async (key, kind, amount, extra = {}) => {
          ids[key] = (await q(
            'insert into public.party_entries (org_id, party_id, book_id, kind, amount, on_date, reverses_entry_id, doc_kind, doc_id, doc_no) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id',
            [ORG, p, extra.book ?? BOOK, kind, amount, TODAY, extra.reverses ? ids[extra.reverses] : null, extra.docKind ?? null, extra.docKind ? uid() : null, extra.docNo ?? null],
          )).rows[0].id;
        };
        const allocate = async (debit, credit, amount, reverses = null, book = BOOK) =>
          (await q('insert into public.party_allocations (org_id, party_id, book_id, debit_entry_id, credit_entry_id, amount, reverses_allocation_id) values ($1, $2, $3, $4, $5, $6, $7) returning id', [ORG, p, book, ids[debit], ids[credit], amount, reverses])).rows[0].id;
        const move = async (kind, amount, extra = {}) =>
          (await q(
            'insert into public.cash_moves (org_id, account_id, amount, kind, doc_kind, doc_id, party_entry_id, on_date, reverses_move_id) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id',
            [ORG, boxes[extra.box ?? 'main'], amount, kind, extra.docKind ?? null, extra.docId ?? null, extra.entry ? ids[extra.entry] : null, TODAY, extra.reverses ?? null],
          )).rows[0].id;
        await statements({ q, entryOf, allocate, move });
        return verifyLedger(q);
      }, U.owner);
    } catch (error) {
      return `رمى: ${error.message}`;
    }
  };
  const BREAKS = {
    entry_remaining_range: [{ entry_remaining_range: 1 }, async ({ entryOf, allocate }) => {
      await entryOf('a', 'adjustment', 100);
      await entryOf('b', 'adjustment', -50);
      await allocate('a', 'b', 100);
    }],
    book_balance_identity: [{ book_balance_identity: 1, allocation_pairs: 1 }, async ({ q, entryOf, allocate }) => {
      await q('alter table public.party_allocations disable trigger party_allocations_check');
      await entryOf('a', 'adjustment', 100);
      await entryOf('c', 'adjustment', 40);
      await allocate('a', 'c', 40);
    }],
    allocation_pairs: [{ allocation_pairs: 1 }, async ({ q, entryOf, allocate }) => {
      await q('alter table public.party_allocations disable trigger party_allocations_check');
      await q('alter table public.party_allocations drop constraint party_allocations_sign_check');
      await entryOf('a', 'adjustment', 100);
      await entryOf('b', 'adjustment', -100);
      const first = await allocate('a', 'b', 100);
      const back = await allocate('a', 'b', -100, first);
      await allocate('a', 'b', 100, back);
    }],
    reversal_pairs: [{ reversal_pairs: 1 }, async ({ q, entryOf, allocate }) => {
      await q('alter table public.party_entries disable trigger party_entries_check');
      await entryOf('a', 'adjustment', 100);
      await entryOf('r', 'opening', -100, { reverses: 'a' });
      await allocate('a', 'r', 100);
    }],
    whole_dinar: [{ whole_dinar: 1 }, async ({ q, entryOf }) => {
      await q('alter table public.party_entries drop constraint party_entries_amount_check');
      await entryOf('a', 'adjustment', 100.5);
    }],
    kind_sign: [{ kind_sign: 1 }, async ({ q, entryOf }) => {
      await q('alter table public.party_entries drop constraint party_entries_sign_check');
      await entryOf('a', 'invoice', -100);
    }],
    payment_cash_moves: [{ payment_cash_moves: 1 }, async ({ entryOf }) => {
      await entryOf('a', 'payment', -100, { docKind: 'receipt' });
    }],
    cash_move_sources: [{ cash_move_sources: 1 }, async ({ move }) => {
      await move('expense', -100);
    }],
    cash_move_reversals: [{ cash_move_reversals: 1 }, async ({ q, move }) => {
      await q('alter table public.cash_moves disable trigger cash_moves_check');
      const opening = await move('opening', 500);
      await move('opening', -400, { reverses: opening });
    }],
    cash_transfer_legs: [{ cash_transfer_legs: 1 }, async ({ move }) => {
      await move('transfer', 100, { docKind: 'cash_transfer', docId: uid() });
    }],
    cash_opening_once: [{ cash_opening_once: 1 }, async ({ move }) => {
      await move('opening', 100);
      await move('opening', 200);
    }],
    party_opening_once: [{ party_opening_once: 1 }, async ({ entryOf }) => {
      await entryOf('a', 'opening', 100);
      await entryOf('b', 'opening', 200);
    }],
    allocation_completeness: [{ allocation_completeness: 1 }, async ({ entryOf }) => {
      await entryOf('a', 'adjustment', 100);
      await entryOf('b', 'adjustment', -50);
    }],
    doc_numbers: [{ doc_numbers: 1 }, async ({ q }) => {
      await q("update public.doc_counters set last_no = last_no + 1 where org_id = $1 and kind = 'RC'", [ORG]);
    }],
    // 14 (0008): مصروف نقدي بحركة صندوقه لكن بمبلغ غير مبلغها (الحركة نفسها بمصروف واحد يشير إلها، فالفحص 8 سليم).
    expense_sources: [{ expense_sources: 1 }, async ({ q, move }) => {
      const doc = uid();
      const m = await move('expense', -100, { docKind: 'expense', docId: doc });
      const category = (await q("insert into public.expense_categories (org_id, name) values ($1, 'تصنيف الضابط') returning id", [ORG])).rows[0].id;
      await q(
        "insert into public.expenses (id, org_id, category_id, division_id, amount, on_date, for_month, source, account_id, cash_move_id) select $1, $2, $3, b.division_id, 150, $4, date_trunc('month', $4::date)::date, 'cash', m.account_id, m.id from public.ledger_books b, public.cash_moves m where b.id = $5 and m.id = $6",
        [doc, ORG, category, TODAY, BOOK, m],
      );
    }],
    // E14: وحدة بيها قيود وما انختم أوّل ترحيلها (first_posted_at) = يوم تشغيلها ما تجمّد.
    posted_division_stamped: [{ posted_division_stamped: 1 }, async ({ q }) => {
      await q('update public.divisions set first_posted_at = null where org_id = $1 and id = (select division_id from public.ledger_books where id = $2)', [ORG, BOOK]);
    }],
    report_formulas: [{ report_formulas: 'many' }, async ({ q }) => {
      await q("create or replace function public.report_accounts_summary(p_from date, p_to date) returns jsonb language sql stable set search_path = public, pg_temp as $$ select jsonb_build_object('divisions', '[]'::jsonb, 'project', jsonb_build_object('receivable', '0', 'payable', '0')) $$");
    }],
  };
  t.same(Object.keys(BREAKS).sort(), Object.keys(LEDGER_ZERO).sort(), `كل فحص بـverify_ledger إله ضابط كسر (${Object.keys(LEDGER_ZERO).length})`);
  /** الكسر يقلب فحصه وحده بالعدد المتوقّع بالضبط ('many' = أكثر من صفر)، والباقي صفر (طفرة فرع تعبر لو الباقي ينقبل بـ≥). */
  const expectOnly = (label, broken, expected) => {
    const many = Object.entries(expected).filter(([, v]) => v === 'many').map(([k]) => k);
    if (!many.length) return t.same(broken, { ...LEDGER_ZERO, ...expected }, label);
    const fixed = Object.fromEntries(Object.entries(typeof broken === 'string' ? {} : broken).filter(([k]) => !many.includes(k)));
    t.ok(typeof broken !== 'string' && many.every((k) => broken[k] > 0) && JSON.stringify(fixed) === JSON.stringify(Object.fromEntries(Object.entries({ ...LEDGER_ZERO, ...expected }).filter(([k]) => !many.includes(k)))), `${label} (${JSON.stringify(broken)})`);
  };
  for (const [check, [expected, statements]] of Object.entries(BREAKS)) {
    expectOnly(`ضابط: verify_ledger يمسك ${check}${Object.keys(expected).length > 1 ? ' (ويّا ما يلزم منه)' : ' وحده'}`, await probe(statements), expected);
  }

  // فروع الفحوص المركّبة (اختبار الطفرات WP3): كل فرع بكسر يقلبه هو وحده، والعدّاد سليم حتى ما يمسكه غير الفرع.
  const nextNo = async (q, kind) => {
    const { last } = (await q("update public.doc_counters set last_no = last_no + 1 where org_id = $1 and kind = $2 and year = 2026 returning last_no as last", [ORG, kind])).rows[0];
    return `${kind}-2026-${String(last).padStart(4, '0')}`;
  };
  const noEntryCheck = (q) => q('alter table public.cash_moves drop constraint cash_moves_entry_check');
  // التقرير البديل: أرقام كل وحدة صحيحة من الصفوف الخام إلا اللي يغيّره البديل (فالفحص 9 يقارن القيم، مو بس وجود الوحدة).
  const summaryStub = ({ receivable = 'r', payable = 'p', key = 'receivable', project = 'sum(r)' }) => `create or replace function public.report_accounts_summary(p_from date, p_to date) returns jsonb language sql stable set search_path = public, pg_temp as $$
    with b as (select e.party_id, e.book_id, k.division_id, sum(e.amount) as balance from public.party_entries e join public.ledger_books k on k.org_id = e.org_id and k.id = e.book_id where e.org_id = public.auth_org() group by 1, 2, 3),
      d as (select d.id, coalesce(sum(greatest(b.balance, 0)), 0) as r, coalesce(sum(greatest(-b.balance, 0)), 0) as p from public.divisions d left join b on b.division_id = d.id where d.org_id = public.auth_org() and d.archived_at is null group by d.id)
    select jsonb_build_object('divisions', (select jsonb_agg(jsonb_build_object('division_id', id, '${key}', (${receivable})::text, 'payable', (${payable})::text)) from d),
      'project', jsonb_build_object('receivable', (select ${project} from d)::text, 'payable', (select sum(p) from d)::text)) $$`;
  const cashStub = ({ closing = 'c', key = 'closing' }) => `create or replace function public.report_cash_balances(p_from date, p_to date) returns jsonb language sql stable set search_path = public, pg_temp as $$
    select jsonb_build_object('accounts', (select jsonb_agg(jsonb_build_object('account_id', a.id, '${key}', (${closing})::text)) from (
      select a.id, coalesce((select sum(m.amount) from public.cash_moves m where m.org_id = a.org_id and m.account_id = a.id), 0) as c from public.cash_accounts a where a.org_id = public.auth_org()) as a)) $$`;
  const BRANCHES = [
    // الترقيم بنوع القيد (الفحص 11): دفع بلا رقم، ودفع برقم قبض، وتسوية برقم، ورقم بسنة غير سنة تاريخه.
    ['doc_numbers: دفع بلا رقم', { doc_numbers: 1 }, async ({ entryOf, move }) => {
      await entryOf('a', 'payout', 100);
      await move('party_payout', -100, { entry: 'a' });
    }],
    ['doc_numbers: دفع برقم قبض', { doc_numbers: 1 }, async ({ q, entryOf, move }) => {
      await entryOf('a', 'payout', 100, { docNo: await nextNo(q, 'RC') });
      await move('party_payout', -100, { entry: 'a' });
    }],
    ['doc_numbers: قبض بلا رقم', { doc_numbers: 1 }, async ({ entryOf, move }) => {
      await entryOf('a', 'payment', -100);
      await move('party_payment', 100, { entry: 'a' });
    }],
    ['doc_numbers: قبض برقم دفع', { doc_numbers: 1 }, async ({ q, entryOf, move }) => {
      await entryOf('a', 'payment', -100, { docNo: await nextNo(q, 'PY') });
      await move('party_payment', 100, { entry: 'a' });
    }],
    ['doc_numbers: تسوية برقم', { doc_numbers: 1 }, async ({ q, entryOf }) => {
      await entryOf('a', 'adjustment', 100, { docNo: await nextNo(q, 'RC') });
    }],
    ['doc_numbers: سنة الرقم غير سنة تاريخه', { doc_numbers: 1 }, async ({ q, entryOf, move }) => {
      await q("insert into public.doc_counters (org_id, kind, year, last_no) values ($1, 'RC', 2025, 1)", [ORG]);
      await entryOf('a', 'payment', -100, { docNo: 'RC-2025-0001' });
      await move('party_payment', 100, { entry: 'a' });
    }],
    // مصادر حركات الصناديق (الفحص 8): كل فرع من الخمسة وفروعها.
    ['cash_move_sources: قبض بلا قيد', { cash_move_sources: 1 }, async ({ q, move }) => {
      await noEntryCheck(q);
      await move('party_payment', 100);
    }],
    ['cash_move_sources: قبض مربوط بقيد دفع', { cash_move_sources: 1 }, async ({ q, entryOf, move }) => {
      await entryOf('a', 'payout', 100, { docNo: await nextNo(q, 'PY') });
      await move('party_payout', -100, { entry: 'a' });
      await move('party_payment', 100, { entry: 'a' });
    }],
    ['cash_move_sources: قبض بغير مبلغ قيده', { cash_move_sources: 1 }, async ({ entryOf, move }) => {
      await entryOf('a', 'payment', -100, { docKind: 'receipt' });
      await move('party_payment', 100, { entry: 'a' });
      await move('party_payment', 50, { entry: 'a' });
    }],
    ['cash_move_sources: دفع بلا قيد', { cash_move_sources: 1 }, async ({ q, move }) => {
      await noEntryCheck(q);
      await move('party_payout', -100);
    }],
    ['cash_move_sources: دفع مربوط بقيد قبض', { cash_move_sources: 1 }, async ({ entryOf, move }) => {
      await entryOf('a', 'payment', -100, { docKind: 'receipt' });
      await move('party_payment', 100, { entry: 'a' });
      await move('party_payout', -100, { entry: 'a' });
    }],
    ['cash_move_sources: دفع لقيد مستند (دفعة الاستلام بالحزمة الجاية)', { cash_move_sources: 1 }, async ({ entryOf, move }) => {
      await entryOf('a', 'payout', 100, { docKind: 'receipt' });
      await move('party_payout', -100, { entry: 'a' });
    }],
    ['cash_move_sources: دفع بغير مبلغ قيده', { cash_move_sources: 1 }, async ({ q, entryOf, move }) => {
      await entryOf('a', 'payout', 100, { docNo: await nextNo(q, 'PY') });
      await move('party_payout', -100, { entry: 'a' });
      await move('party_payout', -50, { entry: 'a' });
    }],
    ['cash_move_sources: افتتاح بمستند', { cash_move_sources: 1 }, async ({ move }) => {
      await move('opening', 100, { docKind: 'cash_transfer', docId: uid() });
    }],
    ['cash_move_sources: افتتاح بقيد', { cash_move_sources: 1 }, async ({ q, entryOf, move }) => {
      await noEntryCheck(q);
      await entryOf('a', 'adjustment', 100);
      await move('opening', 100, { entry: 'a' });
    }],
    ['cash_move_sources: نقل بغير مستند النقل', { cash_move_sources: 2 }, async ({ move }) => {
      const doc = uid();
      await move('transfer', -100, { docKind: 'other_doc', docId: doc });
      await move('transfer', 100, { docKind: 'other_doc', docId: doc, box: 'second' });
    }],
    ['cash_move_sources: نقل بقيد', { cash_move_sources: 1 }, async ({ q, entryOf, move }) => {
      await noEntryCheck(q);
      await entryOf('a', 'adjustment', 100);
      const doc = uid();
      await move('transfer', -100, { docKind: 'cash_transfer', docId: doc, entry: 'a' });
      await move('transfer', 100, { docKind: 'cash_transfer', docId: doc, box: 'second' });
    }],
    ['cash_transfer_legs بصندوق واحد', { cash_transfer_legs: 1 }, async ({ move }) => {
      const doc = uid();
      await move('transfer', 100, { docKind: 'cash_transfer', docId: doc });
      await move('transfer', -100, { docKind: 'cash_transfer', docId: doc });
    }],
    // التقارير = المعادلة (الفحص 9): قيمة غلط بالمعرّفات الصحيحة، ومفتاح غايب (NULL ما يخبّي فرقاً)، والمشروع غير مجموع وحداته.
    ['report_formulas: «لنا» وحدة أكثر بدينار', { report_formulas: 'many' }, async ({ q }) => q(summaryStub({ receivable: 'r + 1', project: 'sum(r + 1)' }))],
    ['report_formulas: «علينا» وحدة أقلّ بدينار', { report_formulas: 'many' }, async ({ q }) => q(summaryStub({ payable: 'p - 1' }))],
    // المشروع صفر = مجموع وحداته بلا «لنا» (coalesce)، فالفرق يمسكه بس مقارنة الوحدة الآمنة من NULL.
    ['report_formulas: مفتاح «لنا» غايب', { report_formulas: 'many' }, async ({ q }) => q(summaryStub({ key: 'balance', project: 'max(0)' }))],
    ['report_formulas: المشروع غير مجموع وحداته', { report_formulas: 'many' }, async ({ q }) => q(summaryStub({ project: 'sum(r) + 1' }))],
    ['report_formulas: المشروع بلا «لنا»', { report_formulas: 'many' }, async ({ q }) => q(summaryStub({ project: 'max(null::numeric)' }))],
    ['report_formulas: رصيد صندوق غلط', { report_formulas: 'many' }, async ({ q }) => q(cashStub({ closing: 'c + 1' }))],
    ['report_formulas: مفتاح رصيد الصندوق غايب', { report_formulas: 'many' }, async ({ q }) => q(cashStub({ key: 'balance' }))],
    ['report_formulas: ضابط البديل الصحيح', {}, async ({ q }) => {
      await q(summaryStub({}));
      await q(cashStub({}));
    }],
  ];
  for (const [label, expected, statements] of BRANCHES) expectOnly(`ضابط فرع: ${label}`, await probe(statements), expected);
}
