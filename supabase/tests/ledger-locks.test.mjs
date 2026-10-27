// أقفال 0006 بجلستين حقيقيتين (المراجعة العدائية لـWP3، ودرس 2026-10-25: كل ضمان قفل يثبته فحص بجلستين، مو بجلسة وحدة):
// افتتاحان لنفس الصندوق بنفس اللحظة، وإلغاءان لنفس النقل، وقفل فترة ضدّ قبض بيومها، وأرشفة صندوق ضدّ قبض فيه (بالترتيبين)،
// وأرشفة جهة ضدّ دفع لها، وترتيب الأقفال (الجهات قبل صفّ الوحدة، §2.3) ضدّ مستند لاحق يقفل الجهة ثم الوحدة؛ وتجميد يوم التشغيل
// بأوّل ترحيل حقيقي (E14)؛ ورقم القيد والحركة (seq) بترتيبه داخل دفتره أو صندوقه مو تسلسلاً عامّاً يكشف حركة منشآت ثانية.
// كل سباق: الأولى تنفّذ وتبقى مفتوحة، الثانية تنحبس على القفل (blocked) وتطلع برمزها بعد ما الأولى تثبّت.
import { call, makeOrg, shown, uid } from './ledger-kit.mjs';

const TODAY = '2026-10-30';
const id = (n) => `d5000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477094000${String(n).padStart(2, '0')}`;
const otherId = (n) => `d5100000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const otherPhone = (n) => `96477094100${String(n).padStart(2, '0')}`;

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

/** الأولى تنفّذ وتبقى مفتوحة، والثانية تنطلق وتنحبس، والأولى تثبّت، والثانية تكمل وتثبّت إذا نجحت. */
async function race(db, first, second) {
  const one = await db.session(first.user);
  const two = await db.session(second.user);
  try {
    const a = await one.run(first.sql, first.params);
    const pending = two.run(second.sql, second.params);
    const state = await db.settle(pending, two.pid);
    await one.commit();
    const b = await pending;
    await two.commit();
    return { first: a.ok ? 'ok' : a.error, state, second: b.ok ? 'ok' : b.error };
  } finally {
    await one.rollback();
    await two.rollback();
  }
}

async function scenario(t, db) {
  const G = await makeOrg(db, {
    name: 'مزرعة الأقفال',
    id,
    phone,
    roles: [['owner', 'owner'], ['manager', 'manager'], ['manager2', 'manager'], ['accountant', 'accountant']],
  });
  const { users: U, books: B, divisions: D } = G;
  const asM = (sql, params) => call(db, U.manager, sql, params);
  // المعمل والعامة واللحم والبيض والأدوية بيوم تشغيل؛ المفقس بيوم تشغيل وبلا ترحيل لحد سباق ترتيب الأقفال.
  for (const kind of ['feed_mill', 'general', 'broiler', 'layer', 'medicine', 'hatchery']) await asM('select public.set_division_go_live($1, $2)', [D[kind], '2026-10-25']);
  const party = async (name) => (await asM('insert into public.parties (name, is_customer) values ($1, true) returning id', [name])).value;
  const box = async (name) => (await asM("insert into public.cash_accounts (name, kind) values ($1, 'cash') returning id", [name])).value;
  const BOX = await box('صندوق الأقفال');
  const PAY = 'select public.record_party_payment($1, $2, $3, $4, $5, $6, $7)';
  const PAYOUT = 'select public.pay_party($1, $2, $3, $4, $5, $6, $7)';
  const payArgs = (p, book, amount, account = BOX, day = TODAY) => [uid(), p, book, amount, account, day, uid()];
  const one = async (sql, params) => (await db.admin(sql, params)).rows[0];

  // ── ترتيب الأقفال (§2.3): الجهات قبل صفّ الوحدة. مستند لاحق (بديله: قفل الجهة ثم صفّ الوحدة بـset_division_go_live) ضدّ قبض
  //    بوحدة ما رحّلت بعد: القبض ينتظر قفل الجهة وهو ما ماسك صفّ الوحدة، فالبديل يكمل والقبض بعده، بلا 40P01 ─────────────────────
  const lockParty = await party('جهة ترتيب الأقفال');
  const standIn = await db.session(U.manager2);
  const payer = await db.session(U.manager);
  let ordered;
  try {
    const held = await standIn.run("select pg_advisory_xact_lock(hashtextextended('party:' || $1::text, 0))", [lockParty]);
    const paying = payer.run(PAY, payArgs(lockParty, B.chicks, '1000'));
    const state = await db.settle(paying, payer.pid);
    const division = await standIn.run('select public.set_division_go_live($1, $2::date)', [D.hatchery, '2026-10-25']);
    await standIn.commit();
    const paid = await paying;
    await payer.commit();
    ordered = { held: held.ok, state, division: division.ok ? 'ok' : division.error, paid: paid.ok ? 'ok' : paid.error };
  } finally {
    await standIn.rollback();
    await payer.rollback();
  }
  t.same(ordered, { held: true, state: 'blocked', division: 'ok', paid: 'ok' }, 'مستند يقفل الجهة ثم صفّ الوحدة ضدّ قبض لنفس الجهة بوحدة ما رحّلت: القبض ينتظر الجهة قبل الوحدة، والاثنين يكملون بلا 40P01');

  // ── E14: أوّل ترحيل حقيقي بالوحدة يختم first_posted_at فيتجمّد يوم تشغيلها (كل دالّة تقدر تكون أوّل ترحيل) ─────────────────
  const firsts = {
    broiler: await asM('select public.record_opening_balance($1, $2, $3, 1000, $4, $5)', [uid(), await party('أوّل افتتاح'), B.broiler, '2026-10-25', uid()]),
    layer: await asM(PAY, payArgs(await party('أوّل قبض'), B.layer, '1000')),
    medicine: await asM(PAYOUT, payArgs(await party('أوّل دفع'), B.medicine, '1000')),
    feed_mill: await asM('select public.record_party_adjustment($1, $2, $3, $4, $5, $6, $7, $8)', [uid(), await party('أوّل تسوية'), B.feed_mill, 'debit', '1000', TODAY, 'فاتورة', uid()]),
  };
  t.same(Object.values(firsts).map(shown), ['ok', 'ok', 'ok', 'ok'], 'ضابط: افتتاح وقبض ودفع وتسوية، كل واحد أوّل ترحيل بوحدته');
  const frozen = {};
  for (const kind of [...Object.keys(firsts), 'hatchery', 'general']) frozen[kind] = shown(await asM('select public.set_division_go_live($1, $2)', [D[kind], '2026-10-20']));
  t.same(
    frozen,
    { broiler: 'go_live_frozen', layer: 'go_live_frozen', medicine: 'go_live_frozen', feed_mill: 'go_live_frozen', hatchery: 'go_live_frozen', general: 'ok' },
    'بعد أوّل افتتاح أو قبض أو دفع أو تسوية يتجمّد يوم التشغيل (E14)، والوحدة بلا ترحيل تتعدّل (ضابط)',
  );
  await asM('select public.set_division_go_live($1, $2)', [D.general, '2026-10-25']);

  // ── افتتاحان لنفس الصندوق بمرجعين: الثاني ينتظر قفل الصندوق الحصري ويرفض opening_exists (مو افتتاحين فعّالين) ─────────────
  const OPEN = 'select public.record_cash_opening($1, $2, $3, $4, $5)';
  const openings = await race(db, { user: U.manager, sql: OPEN, params: [uid(), BOX, '500000', '2026-10-20', uid()] }, { user: U.owner, sql: OPEN, params: [uid(), BOX, '700000', '2026-10-20', uid()] });
  t.same(openings, { first: 'ok', state: 'blocked', second: 'opening_exists' }, 'افتتاحا صندوق بنفس اللحظة: الثاني ينام على الصندوق ثم opening_exists');
  t.eq((await one("select count(*)::int as n from public.cash_moves where account_id = $1 and kind = 'opening'", [BOX])).n, 1, 'افتتاح واحد للصندوق');

  // ── إلغاءان لنفس النقل: الثاني ينتظر ثم already_reversed، مو 23505 خام من الفهرس الفريد ──────────────────────────────
  const BANK = await box('مصرف الأقفال');
  const moved = (await asM('select public.transfer_cash($1, $2, $3, $4, $5, $6, $7)', [uid(), BOX, BANK, '100000', TODAY, null, uid()])).value;
  const VOID_MOVE = 'select public.void_cash_move($1, $2, $3)';
  const voids = await race(db, { user: U.manager, sql: VOID_MOVE, params: [moved.id, 'نقل خاطئ', uid()] }, { user: U.manager2, sql: VOID_MOVE, params: [moved.moves[1], 'نقل خاطئ', uid()] });
  t.same(voids, { first: 'ok', state: 'blocked', second: 'already_reversed' }, 'إلغاءا نقل بنفس اللحظة: الثاني ينام على الصندوق ثم already_reversed');

  // ── أرشفة صندوق ضدّ قبض فيه (§2.3، الصندوق مقفول): الأرشفة أوّلاً ← القبض ينام ثم cash_account_archived؛ القبض أوّلاً ←
  //    الأرشفة تنام ثم archived_in_use. بلا القفل كان صندوق مؤرشف يستلم حركة جديدة، أو يتؤرشف وبيه رصيد ─────────────────────
  const archiver = await party('جهة أرشفة الصندوق');
  const ARCHIVE_BOX = "update public.cash_accounts set archived_at = 'now' where id = $1";
  const boxFirst = await box('صندوق يتؤرشف أوّلاً');
  t.same(
    await race(db, { user: U.manager, sql: ARCHIVE_BOX, params: [boxFirst] }, { user: U.accountant, sql: PAY, params: payArgs(archiver, B.general, '1000', boxFirst) }),
    { first: 'ok', state: 'blocked', second: 'cash_account_archived' },
    'أرشفة الصندوق أوّلاً: القبض فيه ينام ثم cash_account_archived',
  );
  const payFirst = await box('صندوق يقبض أوّلاً');
  t.same(
    await race(db, { user: U.accountant, sql: PAY, params: payArgs(archiver, B.general, '1000', payFirst) }, { user: U.manager, sql: ARCHIVE_BOX, params: [payFirst] }),
    { first: 'ok', state: 'blocked', second: 'archived_in_use' },
    'القبض أوّلاً: أرشفة الصندوق تنام ثم archived_in_use (رصيده 1,000)',
  );

  // ── أرشفة جهة ضدّ دفع لها: الأرشفة تنام على قفل الجهة ثم archived_in_use (الرصيد اللي كتبه الدفع ينحسب) ─────────────────
  const archived = await party('جهة تتؤرشف');
  t.same(
    await race(db, { user: U.accountant, sql: PAYOUT, params: payArgs(archived, B.general, '1000') }, { user: U.manager, sql: "update public.parties set archived_at = 'now' where id = $1", params: [archived] }),
    { first: 'ok', state: 'blocked', second: 'archived_in_use' },
    'الدفع أوّلاً: أرشفة الجهة تنام على قفلها ثم archived_in_use',
  );

  // ── رقم القيد والحركة (seq) بترتيبه داخل (الجهة، الدفتر) والصندوق: قيود منشأة ثانية بالنص ما تبين بالفرق ───────────────
  const O = await makeOrg(db, { name: 'منشأة التسلسل الثانية', id: otherId, phone: otherPhone, roles: [['owner', 'owner'], ['manager', 'manager']] });
  const asO = (sql, params) => call(db, O.users.manager, sql, params);
  await asO('select public.set_division_go_live($1, $2)', [O.divisions.general, '2026-10-25']);
  const oParty = (await asO("insert into public.parties (name, is_customer) values ('جهة المنشأة الثانية', true) returning id")).value;
  const oBox = (await asO("insert into public.cash_accounts (name, kind) values ('صندوقها', 'cash') returning id")).value;
  const seqParty = await party('جهة التسلسل');
  const firstEntry = (await asM(PAY, payArgs(seqParty, B.general, '1000'))).value;
  for (let i = 0; i < 5; i += 1) await asO(PAY, [uid(), oParty, O.books.general, '1000', oBox, TODAY, uid()]);
  const secondEntry = (await asM(PAY, payArgs(seqParty, B.general, '1000'))).value;
  const seqs = (await db.admin('select id, seq::int as seq from public.party_entries where id = any ($1::uuid[]) order by seq', [[firstEntry.id, secondEntry.id]])).rows.map((r) => r.seq);
  t.same(seqs, [1, 2], `رقم القيد داخل دفتر الجهة 1 ثم 2، وخمسة قيود منشأة ثانية بينهما ما تبين بالفرق (${seqs.join('، ')})`);
  const moveSeqs = (await db.admin('select seq::int as seq from public.cash_moves where party_entry_id = any ($1::uuid[]) order by seq', [[firstEntry.id, secondEntry.id]])).rows.map((r) => r.seq);
  t.eq(moveSeqs[1] - moveSeqs[0], 1, `وحركتا الصندوق متتاليتان بصندوقهما (${moveSeqs.join('، ')})`);
  const otherMoves = (await db.admin('select seq::int as seq from public.cash_moves where account_id = $1 order by seq', [oBox])).rows.map((r) => r.seq);
  t.same(otherMoves, [1, 2, 3, 4, 5], 'حركات صندوق المنشأة الثانية 1…5 بصندوقها');

  // ── قفل الفترة ضدّ قبض بيومها (آخر الملف: القفل يبقى): القبض ينام على قفل الفترة ثم period_locked ─────────────────────
  const lockDay = '2026-10-29';
  t.same(
    await race(db, { user: U.manager, sql: 'select public.set_period_lock($1)', params: [lockDay] }, { user: U.accountant, sql: PAY, params: payArgs(await party('جهة يوم القفل'), B.general, '1000', BOX, lockDay) }),
    { first: 'ok', state: 'blocked', second: 'period_locked' },
    'قفل الفترة وقبض بيومها بنفس اللحظة: القبض ينام على قفل الفترة ثم period_locked',
  );
}
