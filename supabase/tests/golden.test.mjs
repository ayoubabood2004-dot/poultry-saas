// المثال المحسوب للمرحلة 1 (الخطّة WP6، الملحق B؛ FOUNDATION ٦٠٠–٦١٦، ٨٣٦): D1 قيم الدفعات الثلاث عشرة بالفلس، وD2 قيود المورّد والناقل
// بدفتر المعمل، وD3 مرآة التحويل T0، وD4 أرقام التقارير بالصفحة المرسومة. كل مستند بدالّته الحقيقية بدور authenticated حقيقي ويومه
// (setToday): أمين المعمل (بنطاق مخزن المواد الأوّلية والعامّ) وأمين المفقس والأدوية يكتبان المسوّدات، والمحاسب يسعّر ويرحّل. كل
// قيمة بثلاثة شهود: نصّ FOUNDATION، ومرآة src/domain/receipt.ts (loadSrc)، والقاعدة؛ والفحص يعدّ القيم اللي قارنها، ونصّ واحد
// مغيَّر لازم يفشّله (ضابط FOUNDATION ٨٣٦).
import { loadSrc } from '../../scripts/tests/load-src.mjs';
import { bundleAccounts } from '../../scripts/tests/accounts-bundle.mjs';
import { LEDGER_ZERO, call, loadRepoParsers, makeOrg, shown, uid, verifyLedger } from './ledger-kit.mjs';
import { postReceipt, priceReceipt, receiptDraft } from './receipt-kit.mjs';
import { STOCK_ZERO, postTransfer, transferDraft, verifyStock } from './stock-kit.mjs';

const id = (n) => `601d0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477098300${String(n).padStart(2, '0')}`;
const D = 100n;

// نصوص FOUNDATION (٦٠٦–٦١٦): الدفعات الثلاث عشرة بقيمتها الداخلة.
const FOUNDATION_LOTS = {
  C1: '1800000.00', S1: '3600000.00', O1: '2300000.00', L1: '100000.00', D1: '600000.00', M1: '600000.00', SL1: '100000.00', BG1: '500000.00',
  DS1: '800000.00', C2: '2404166.67', S2: '910833.33', GZ1: '700000.00', KZ1: '375000.00',
};
const FOUNDATION_TOTALS = { lots: '14790000.00', withEggs: '24390000.00', mill: '13715000.00', general: '1075000.00', box: '-21075000', shares: ['54166.67', '10833.33'] };

export default async function (t, db) {
  const G = await makeOrg(db, {
    name: 'مزرعة المثال المحسوب',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['accountant', 'accountant'],
      ['millKeeper', 'storekeeper'],
      ['hatchKeeper', 'storekeeper'],
      ['viewer', 'viewer', ['feed_mill']],
    ],
  });
  const { users: U, divisions: Dv, books: B } = G;
  const at = (day, fn) => db.setToday(day, fn);
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [G.org])).rows.map((r) => [r.kind, r.id]));
  let compared = 0;
  const same = (got, want, label) => {
    compared += Array.isArray(want) ? want.length : typeof want === 'object' && want ? Object.keys(want).length : 1;
    t.same(got, want, label);
  };

  await at('2026-10-15', async () => {
    for (const [kind, day] of [['broiler', '2026-09-08'], ['hatchery', '2026-09-24'], ['medicine', '2026-09-24'], ['feed_mill', '2026-09-30'], ['general', '2026-09-30'], ['layer', '2026-10-15']]) {
      await one(U.owner, 'select public.set_division_go_live($1, $2)', [Dv[kind], day]);
    }
  });
  await one(U.owner, "select public.set_member_scopes_v2($1, '{}', '{}', $2::uuid[])", [G.members.millKeeper, [W.raw, W.general]]);
  await one(U.owner, "select public.set_member_scopes_v2($1, '{}', '{}', $2::uuid[])", [G.members.hatchKeeper, [W.hatching_egg, W.medicine]]);
  const item = (name, kind, unit, extra = {}) =>
    one(U.owner, 'insert into public.items (name, kind, base_unit, density_kg_per_l, tracks_expiry) values ($1, $2, $3, $4, $5) returning id', [name, kind, unit, extra.density ?? null, extra.tracksExpiry ?? false]);
  const I = {
    corn: await item('ذرة صفراء', 'raw', 'kg'),
    soy: await item('كسبة صويا 46٪', 'raw', 'kg'),
    oil: await item('زيت نباتي', 'raw', 'L', { density: 0.92 }),
    lime: await item('حجر كلس', 'additive', 'kg'),
    dcp: await item('فوسفات ثنائي الكالسيوم DCP', 'additive', 'kg'),
    premix: await item('بريمكس', 'additive', 'kg', { tracksExpiry: true }),
    salt: await item('ملح', 'additive', 'kg'),
    bags: await item('أكياس فارغة 50 كغم', 'packaging', 'pc'),
    diesel: await item('كاز أويل', 'fuel', 'L'),
    gas: await item('غاز', 'fuel', 'pc'),
    kerosene: await item('كاز أبيض', 'fuel', 'L'),
    eggs: await item('بيض تفقيس', 'hatching_egg', 'pc'),
    vaccine: await item('لقاح', 'vaccine', 'pc', { tracksExpiry: true }),
  };
  const pack = (await db.admin('select id from public.pack_types where org_id = $1 and factor = 25', [G.org])).rows[0].id;
  const sack = await one(U.owner, "insert into public.item_units (item_id, pack_type_id, label, factor_to_base) values ($1, $2, 'كيس 25 كغم', 25) returning id", [I.premix, pack]);
  const party = (name) => one(U.accountant, 'insert into public.parties (name, is_supplier) values ($1, true) returning id', [name]);
  const P = {
    abuAli: await one(U.accountant, "insert into public.parties (name, is_customer) values ('أبو علي', true) returning id"),
    grain: await party('مورّد الحبوب'),
    carrier: await party('الناقل'),
    eggs: await party('مورّد بيض التفقيس'),
    vaccine: await party('مورّد اللقاح'),
    cash1: await party('مورّد نقدي 1'),
    cash2: await party('مورّد نقدي 2'),
    cash4: await party('مورّد نقدي 4'),
  };
  const box = await one(U.accountant, "insert into public.cash_accounts (name, kind) values ('الصندوق', 'cash') returning id");
  const lotsOf = {};
  const receipt = async (day, keeper, wh, supplier, lines, amounts) =>
    at(day, async () => {
      const doc = await receiptDraft(db, keeper, { wh, party: supplier, on: day, lines });
      const version = await priceReceipt(db, U.accountant, doc, amounts);
      const result = await postReceipt(db, U.accountant, doc.id, version);
      return { ...doc, result };
    });
  const lots = async (doc, names) => {
    const rows = (await db.admin(
      "select l.id, trim_scale(l.value_in)::text as v, l.fifo_seq from public.stock_lots l join public.receipt_lines x on x.id = l.source_line_id where l.source_kind = 'receipt' and l.source_id = $1 order by x.line_no",
      [doc.id],
    )).rows;
    names.forEach((name, i) => {
      lotsOf[name] = rows[i];
    });
  };

  // RH وRV (2026-09-24): بيض التفقيس والقاح نقداً بأمين المفقس والأدوية، كل واحد بدفتره وصافيه صفر.
  const rh = await receipt('2026-09-24', U.hatchKeeper, W.hatching_egg, P.eggs, [{ item: I.eggs, qty: 30000 }], { totals: [9000000], paid: 9000000, box });
  const rv = await receipt('2026-09-24', U.hatchKeeper, W.medicine, P.vaccine, [{ item: I.vaccine, qty: 30, expiry: '2027-06-30' }], { totals: [600000], paid: 600000, box });
  same([rh.result.value?.doc_no, rv.result.value?.doc_no], ['PU-2026-0001', 'PU-2026-0002'], 'RH وRV مرحّلان بأرقامهما الأولى بالسنة');
  await lots(rh, ['HE1']);
  await lots(rv, ['V1']);
  const bookSum = async (book) => (await db.admin('select coalesce(sum(amount), 0)::text as v from public.party_entries where book_id = $1', [book])).rows[0].v;
  same([await bookSum(B.hatching_eggs), await bookSum(B.medicine), lotsOf.HE1.v, lotsOf.V1.v], ['0', '0', '9000000', '600000'], 'HE1 بدفتر بيض التفقيس وV1 بدفتر الأدوية: شراء ودفع صافيهما صفر، والدفعتان 9,000,000 و600,000');
  const outOfScope = await at('2026-10-01', () => call(db, U.millKeeper, 'insert into public.receipts (party_id, warehouse_id, received_on) values ($1, $2, $3) returning id', [P.vaccine, W.medicine, '2026-10-01']));
  t.eq(shown(outOfScope), 'rls', 'ضابط النطاق: أمين المعمل ما يكتب مسوّدة بمخزن الأدوية');

  // افتتاح أبو علي (2026-09-30) بدفتر المعمل، ونفسه بعد التشغيل after_go_live.
  await at('2026-09-30', () => one(U.manager, 'select public.record_opening_balance($1, $2, $3, 500000, $4, $5)', [uid(), P.abuAli, B.feed_mill, '2026-09-30', uid()]));
  const late = await at('2026-10-01', () => call(db, U.manager, 'select public.record_opening_balance($1, $2, $3, 500000, $4, $5)', [uid(), P.abuAli, B.feed_mill, '2026-10-01', uid()]));
  t.eq(shown(late), 'after_go_live', 'افتتاح بعد يوم التشغيل يرفض after_go_live');

  // R1 (2026-10-01): نقداً بمخزن مواد المعمل؛ وقبله مستند بتاريخ 2026-09-29 قبل التشغيل.
  const before = await at('2026-10-01', async () => {
    const doc = await receiptDraft(db, U.millKeeper, { wh: W.raw, party: P.cash1, on: '2026-09-29', lines: [{ item: I.corn, qty: 1 }] });
    const version = await priceReceipt(db, U.accountant, doc, { totals: [450] });
    const result = await postReceipt(db, U.accountant, doc.id, version);
    await one(U.millKeeper, "select public.discard_draft('receipt', $1, $2)", [doc.id, version]);
    return result;
  });
  t.eq(shown(before), 'before_go_live', 'استلام بالمعمل بتاريخ قبل يوم تشغيله ← before_go_live');
  const r1Lines = [
    { item: I.corn, qty: 4000 }, { item: I.soy, qty: 4000 }, { item: I.oil, qty: 1000 }, { item: I.lime, qty: 1000 }, { item: I.dcp, qty: 500 },
    { item: I.premix, qty: 8, unit: sack, expiry: '2027-03-01' }, { item: I.salt, qty: 500 }, { item: I.bags, qty: 1000 },
  ];
  const r1Totals = [1800000, 3600000, 2300000, 100000, 600000, 600000, 100000, 500000];
  const r1 = await receipt('2026-10-01', U.millKeeper, W.raw, P.cash1, r1Lines, { totals: r1Totals, paid: 9600000, box });
  t.eq(r1.result.value?.doc_no, 'PU-2026-0003', `R1 مرحَّل PU-2026-0003 (${shown(r1.result)})`);
  await lots(r1, ['C1', 'S1', 'O1', 'L1', 'D1', 'M1', 'SL1', 'BG1']);
  const m1 = (await db.admin('select trim_scale(qty_in)::text as q, expiry_on::text as e from public.stock_lots where id = $1', [lotsOf.M1.id])).rows[0];
  same([m1.q, m1.e], ['200', '2027-03-01'], 'M1: 8 أكياس × 25 = 200 كغم بانتهاء 2027-03-01');

  // T0 قبل R2 ← insufficient_stock (GOLD-08)، ثم R2 وT0 (D3).
  const t0Early = await at('2026-10-01', async () => {
    const doc = await transferDraft(db, U.millKeeper, W.general, W.raw, '2026-10-01', [{ item: I.diesel, qty: 1000 }]);
    const result = await postTransfer(db, U.millKeeper, doc);
    await one(U.millKeeper, "select public.discard_draft('transfer', $1, (select version from public.transfers where id = $1))", [doc.id]);
    return result;
  });
  t.eq(shown(t0Early), 'insufficient_stock', 'T0 قبل R2 ← insufficient_stock (GOLD-08)');
  const r2 = await receipt('2026-10-01', U.millKeeper, W.general, P.cash2, [{ item: I.diesel, qty: 1000 }], { totals: [800000], paid: 800000, box });
  t.eq(r2.result.value?.doc_no, 'PU-2026-0004', 'R2 مرحَّل PU-2026-0004');
  await lots(r2, ['DS1']);
  const t0 = await at('2026-10-01', async () => {
    const doc = await transferDraft(db, U.millKeeper, W.general, W.raw, '2026-10-01', [{ item: I.diesel, qty: 1000 }]);
    return postTransfer(db, U.millKeeper, doc);
  });
  const mirror = (await db.admin("select trim_scale(qty_in)::text as q, trim_scale(value_in)::text as v, fifo_seq, origin_lot_id from public.stock_lots where source_kind = 'transfer' and origin_lot_id = $1", [lotsOf.DS1.id])).rows[0];
  same([t0.value?.doc_no, mirror.q, mirror.v, mirror.fifo_seq === lotsOf.DS1.fifo_seq], ['TR-2026-0001', '1000', '800000', true], 'T0 (D3): مرآة 1,000 لتر بـ800,000.00 بنفس fifo_seq، ورقمها TR-2026-0001');
  const leftSum = async (exclude) => (await db.admin(`select trim_scale(coalesce(sum(value_left), 0))::text as v from public.stock_lots where org_id = $1 ${exclude ? 'and item_id not in ($2, $3)' : ''}`, exclude ? [G.org, I.eggs, I.vaccine] : [G.org])).rows[0].v;
  same(await leftSum(true), '10400000', 'بعد T0: Σ المتبقّي 10,400,000.00 بلا HE1 وV1');

  // R3 (2026-10-15): بالدين، والنقل 65,000 بالوزن على الناقل (D2)؛ وR4 نقداً بالمخزن العامّ.
  const r3 = await receipt('2026-10-15', U.millKeeper, W.raw, P.grain, [{ item: I.corn, qty: 5000 }, { item: I.soy, qty: 1000 }], {
    totals: [2350000, 900000],
    charges: [{ label: 'نقل', amount: 65000, by: 'mass', payee: P.carrier }],
  });
  t.eq(r3.result.value?.doc_no, 'PU-2026-0005', 'R3 مرحَّل PU-2026-0005');
  await lots(r3, ['C2', 'S2']);
  const shares = (await db.admin('select trim_scale(s.share)::text as v from public.receipt_charge_shares s join public.receipt_lines x on x.id = s.line_id where s.doc_id = $1 order by x.line_no', [r3.id])).rows.map((r) => r.v);
  same(shares, FOUNDATION_TOTALS.shares, 'حصص النقل 54,166.67 و10,833.33 (لقطة الترحيل)');
  const r4 = await receipt('2026-10-15', U.millKeeper, W.general, P.cash4, [{ item: I.gas, qty: 100 }, { item: I.kerosene, qty: 500 }], { totals: [700000, 375000], paid: 1075000, box });
  t.eq(r4.result.value?.doc_no, 'PU-2026-0006', 'R4 مرحَّل PU-2026-0006');
  await lots(r4, ['GZ1', 'KZ1']);

  // ── D1: الشهود الثلاثة لكل دفعة (نصّ FOUNDATION، والمرآة، والقاعدة) ──────────────────────────────────────────────────────
  const { receiptValuation } = await loadSrc('src/domain/receipt.ts');
  // نصّ عشري ← بمرتبتين (بلا فاصلة عائمة): '1800000' ← '1800000.00'.
  const two = (text) => {
    const [whole, part = ''] = String(text).split('.');
    return `${whole}.${(part + '00').slice(0, 2)}`;
  };
  const fils = (text) => BigInt(two(text).replace('.', ''));
  const asText = (value) => `${value / D}.${String(value % D).padStart(2, '0')}`;
  const mirrorOf = (lines, totals, charges = []) =>
    receiptValuation(
      lines.map((line, i) => ({ qtyBase: line.qty, baseUnit: line.unit, density: line.density ?? null, pieceMass: null, lineTotal: BigInt(totals[i]) * D })),
      { discount: 0n, paidNow: 0n, hasBox: false },
      charges,
    ).values.map(asText);
  const tsValues = {
    ...Object.fromEntries(['C1', 'S1', 'O1', 'L1', 'D1', 'M1', 'SL1', 'BG1'].map((name, i) => [name, mirrorOf([{ qty: 1000n, unit: 'kg' }], [r1Totals[i]])[0]])),
    DS1: mirrorOf([{ qty: 1000000n, unit: 'L' }], [800000])[0],
    ...Object.fromEntries(['C2', 'S2'].map((name, i) => [name, mirrorOf([{ qty: 5000000n, unit: 'kg' }, { qty: 1000000n, unit: 'kg' }], [2350000, 900000], [{ amount: 65000n * D, allocateBy: 'mass', allLines: true, lines: [] }])[i]])),
    GZ1: mirrorOf([{ qty: 100000n, unit: 'kg' }, { qty: 500000n, unit: 'kg' }], [700000, 375000])[0],
    KZ1: mirrorOf([{ qty: 100000n, unit: 'kg' }, { qty: 500000n, unit: 'kg' }], [700000, 375000])[1],
  };
  const sqlValues = Object.fromEntries(Object.keys(FOUNDATION_LOTS).map((name) => [name, two(lotsOf[name].v)]));
  const witnesses = (literal) => Object.keys(literal).filter((name) => literal[name] !== tsValues[name] || literal[name] !== sqlValues[name]);
  same(witnesses(FOUNDATION_LOTS), [], `D1: الدفعات الثلاث عشرة بالفلس بثلاثة شهود (${Object.keys(FOUNDATION_LOTS).length} قيمة × 3)`);
  compared += Object.keys(FOUNDATION_LOTS).length * 2;
  t.same(witnesses({ ...FOUNDATION_LOTS, C2: '2404166.68' }), ['C2'], 'ضابط: نصّ FOUNDATION مغيَّر بفلس (C2) يفشل');
  const lotTotal = Object.values(sqlValues).reduce((sum, v) => sum + fils(v), 0n);
  same([asText(lotTotal), two(await leftSum(true)), two(await leftSum(false))], [FOUNDATION_TOTALS.lots, FOUNDATION_TOTALS.lots, FOUNDATION_TOTALS.withEggs], 'Σ الدفعات 14,790,000.00، وΣ المتبقّي 14,790,000.00 و24,390,000.00 ويّا HE1 وV1');
  const storeValue = async (wh) => (await db.admin('select trim_scale(coalesce(sum(value), 0))::text as v from public.stock_balances where warehouse_id = $1', [wh])).rows[0].v;
  same([two(await storeValue(W.raw)), two(await storeValue(W.general))], [FOUNDATION_TOTALS.mill, FOUNDATION_TOTALS.general], 'مخزن مواد المعمل 13,715,000.00 (ويّا مرآة T0) والعامّ 1,075,000.00');
  same((await db.admin('select coalesce(sum(amount), 0)::text as v from public.cash_moves where account_id = $1', [box])).rows[0].v, FOUNDATION_TOTALS.box, 'الصندوق: −21,075,000 (كل الدفع النقدي)');
  const cashSuppliers = (await db.admin('select coalesce(sum(amount), 0)::text as v from public.party_entries where party_id = any ($1::uuid[])', [[P.eggs, P.vaccine, P.cash1, P.cash2, P.cash4]])).rows[0].v;
  same(cashSuppliers, '0', 'كل مورّد نقدي صفر');

  // ── D2 وD4: التقارير بأرقامها، ثم مرسومة بالصفحة الحقيقية ─────────────────────────────────────────────────────────
  const wire = await at('2026-10-15', async () => ({
    balances: await one(U.accountant, 'select public.report_party_balances($1, $2, null, true, $3, null, null, 50)', ['2026-01-01', '2026-12-31', 'balance']),
    summary: await one(U.accountant, 'select public.report_accounts_summary($1, $2)', ['2026-01-01', '2026-12-31']),
    grain: await one(U.accountant, 'select public.report_party_statement($1, null, $2, $3)', [P.grain, '2026-01-01', '2026-12-31']),
    carrier: await one(U.accountant, 'select public.report_party_statement($1, null, $2, $3)', [P.carrier, '2026-01-01', '2026-12-31']),
  }));
  const parsers = await loadRepoParsers();
  const summary = parsers.parseAccountsSummary(wire.summary);
  const millDivision = summary.divisions.find((d) => d.kind === 'feed_mill');
  same(
    [millDivision.receivable / D, millDivision.payable / D, summary.divisions.filter((d) => d.kind !== 'feed_mill').every((d) => d.receivable === 0n && d.payable === 0n), summary.project.receivable / D, summary.project.payable / D],
    [500000n, 3315000n, true, 500000n, 3315000n],
    'D2: ملخّص الحسابات: المعمل «لنا» 500,000 و«علينا» 3,315,000، وباقي الوحدات صفر، والمشروع مثله',
  );
  const lastBalance = (statementWire) => {
    const books = parsers.parseStatement(statementWire).books;
    const mill = books.find((book) => book.bookId === B.feed_mill);
    return [books.length, mill?.closing / D];
  };
  same([lastBalance(wire.grain), lastBalance(wire.carrier)], [[1, -3250000n], [1, -65000n]], 'آخر سطر بكشف مورّد الحبوب «له 3,250,000» والناقل «له 65,000» بدفتر المعمل');

  const m = await bundleAccounts(
    [
      "export { PartiesTable } from './src/pages/accounts/AccountsPage.tsx';",
      "export { StatementBooks } from './src/pages/accounts/PartyStatementPage.tsx';",
      "export { parsePartyBalances, parseAccountsSummary, parseStatement } from './src/lib/repo/parties.ts';",
    ].join('\n'),
  );
  const saved = { accounts: globalThis.__accounts, document: globalThis.document };
  try {
    globalThis.__accounts = { loads: {}, calls: [], capture: false, session: { status: 'ready', workspace: { orgId: G.org, role: 'accountant', userId: U.accountant } } };
    globalThis.document = { body: null };
    const textOf = (html) => html.replace(/<[^>]+>/g, '');
    const section = (html, tag) => html.split(`<${tag}>`)[1]?.split(`</${tag}>`)[0] ?? '';
    const pageChecks = (summaryWire) => {
      const page = m.parsePartyBalances(wire.balances);
      const html = m.renderToStaticMarkup(m.h(m.MemoryRouter, null, m.h(m.PartiesTable, { page, rows: page.rows, summary: m.parseAccountsSummary(summaryWire), divisionId: null })));
      const millIndex = page.books.findIndex((book) => book.id === B.feed_mill);
      const rowCells = (name) => {
        const row = section(html, 'tbody').split('<tr').find((chunk) => chunk.includes(name)) ?? '';
        return row.split('<td').slice(1).map((cell) => textOf(`<td${cell}`).trim());
      };
      const millCell = (name) => rowCells(name)[2 + millIndex];
      const foot = section(html, 'tfoot').split('<tr').slice(1).map((row) => [...row.matchAll(/<bdi dir="ltr">([^<]*)<\/bdi>/g)].map((match) => match[1]));
      const statement = (statementWire) => textOf(m.renderToStaticMarkup(m.h(m.MemoryRouter, null, m.h(m.StatementBooks, { statement: m.parseStatement(statementWire) }))));
      return [
        millCell('مورّد الحبوب'),
        millCell('الناقل'),
        millCell('أبو علي'),
        foot[0]?.[millIndex],
        foot[0]?.at(-1),
        foot[1]?.[millIndex],
        foot[1]?.at(-1),
        statement(wire.grain).includes('له3,250,000'),
        statement(wire.carrier).includes('له65,000'),
      ];
    };
    const expected = ['له3,250,000', 'له65,000', 'عليه500,000', '500,000', '500,000', '3,315,000', '3,315,000', true, true];
    same(pageChecks(wire.summary), expected, 'D4 بالصفحة: «له 3,250,000» و«له 65,000» بخانة المعمل، و«عليه 500,000» لأبو علي، وتذييلا «لنا» 500,000 و«علينا» 3,315,000 بالمعمل والمشروع، وآخر سطر بالكشفين');
    const altered = JSON.parse(JSON.stringify(wire.summary));
    for (const book of altered.book_totals) if (book.book_id === B.feed_mill) book.payable = '3315001';
    t.ok(JSON.stringify(pageChecks(altered)) !== JSON.stringify(expected), 'ضابط D4: ملخّص برقم واحد مغيَّر يفشّل الصفحة');
  } finally {
    globalThis.__accounts = saved.accounts;
    globalThis.document = saved.document;
  }

  same(await db.asService(verifyStock), STOCK_ZERO, 'verify_stock صفر (مع روابط الاستلام 14–17)');
  same(await db.asService(verifyLedger), LEDGER_ZERO, 'verify_ledger صفر (أرقام PU وTR، والتوزيع مكتمل)');
  t.ok(compared >= 60, `المثال قارن ${compared} قيمة`);
}
