// قواعد المخزون بالتفصيل (اختبار الطفرات لـWP4، 0007): كل قاعدة كانت طفرتها تعيش بلا فحص. نصّ الكمية بالتلميح = fmtQty
// (private.qty_text)، وكل قيد check وفريد بجداول المخزون يرفض صفّه الغلط باسمه، ومشغّلات الدفعة والحركة (الأهلية والمرآة
// والعكسية)، وتجميد وحدة المادّة ووحدة المخزن، ورموز حارسي الرأس والسطر ونسخة المسوّدة، وقراءة الحركات والأرصدة وسطور الافتتاح
// والتحويل وسجلّ تدقيقه بنطاق المخزن، وتلميح النقص حرفاً بحرف، والدفعة المسمّاة بالرفض (الأحدث والحيّ)، وحدود يوم التشغيل والقفل
// بالمعاينة، والافتتاح والتحويل وإلغاؤهما (النطاق والسبب والحالة والتاريخ والمرجع)، ومعاينة التحويل (النقص والمتاح والرصيد كلّه
// والجاهزية)، وطيّ المسوّدة وحذف سطرها، وصفحات القراءات وحدودها، وتنبيهات اللوحة والرئيسية بحدودها، وكل فحص بـverify_stock بشقّه،
// وسنة رقم التحويل بتاريخه. كل نداء بدور authenticated حقيقي، والضوابط المباشرة بدور صاحب الجداول بمعاملة ترجع.
import { loadSrc } from '../../scripts/tests/load-src.mjs';
import { call, makeOrg, shown, uid } from './ledger-kit.mjs';
import { lotsOf, makeStockOrg, openingDraft, postOpening, postTransfer, postedOpening, postedTransfer, transferDraft, verifyStock } from './stock-kit.mjs';

const TODAY = '2026-10-30';
const GO_LIVE = '2026-10-25';
const BROILER_GO_LIVE = '2026-10-28';
const id = (n) => `d7600000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477097600${String(n).padStart(2, '0')}`;

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
  await db.setToday('2027-01-03', () => newYear(t, db));
}

/** «12.345» ← 12345n بمراتب ثابتة. */
function scaled(text, scale) {
  const [whole, frac = ''] = String(text).split('.');
  const negative = whole.startsWith('-');
  const value = BigInt(`${negative ? whole.slice(1) : whole}${frac.padEnd(scale, '0').slice(0, scale)}`);
  return negative ? -value : value;
}

/** أوامر بدور صاحب الجداول بمعاملة ترجع، كل ضابط بنقطة حفظ: «ok» أو اسم القيد أو رسالة الرفض. */
async function probes(db, user, list) {
  return db.asOwner(async (q) => {
    const out = {};
    for (const [label, statements] of Object.entries(list)) {
      await q('savepoint p');
      try {
        for (const [sql, params = []] of statements) await q(sql, params);
        out[label] = 'ok';
      } catch (error) {
        out[label] = error.constraint ?? error.message;
      } finally {
        await q('rollback to savepoint p');
      }
    }
    return out;
  }, user);
}

async function scenario(t, db) {
  const S = await makeStockOrg(db, { name: 'مزرعة القواعد', id, phone, goLive: GO_LIVE });
  const { users: U, W, I } = S;
  await S.one(U.owner, 'select public.set_division_go_live($1, $2)', [S.divisions.broiler, BROILER_GO_LIVE]);
  const asM = (sql, params) => call(db, U.manager, sql, params);
  const once = { commit: false };
  const item = (label, kind, unit, extra = {}) =>
    S.one(U.owner, 'insert into public.items (name, kind, base_unit, tracks_expiry, min_qty) values ($1, $2, $3, $4, $5) returning id', [label, kind, unit, extra.tracksExpiry ?? false, extra.minQty ?? null]);
  const previewOf = async (fn, docId, user = U.manager) => {
    const result = await call(db, user, `select public.${fn}($1)`, [docId]);
    if (!result.ok) throw new Error(`${fn}: ${result.code}`);
    return result.value;
  };
  const codes = (p) => p.problems.map((x) => x.code);
  const siteOf = async (wh) => (await db.admin('select site_id from public.warehouses where id = $1', [wh])).rows[0].site_id;
  const storeIn = async (division, siteWh, label, kind) =>
    S.one(U.owner, 'insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, $3, $4) returning id', [S.divisions[division], await siteOf(siteWh), label, kind]);
  const docNo = async (docId) => (await db.admin('select doc_no from public.transfers where id = $1', [docId])).rows[0].doc_no;
  const board = async (wh, user = U.manager) => (await call(db, user, 'select public.stock_on_hand($1, null, 200)', [wh])).value;
  const rowOf = (b, itemId) => b.rows.find((r) => r.item_id === itemId);
  const home = async (user) => Object.fromEntries((await call(db, user, 'select public.home_summary()')).value.stock.map((d) => [d.kind, d]));

  // ── نصّ الكمية بالتلميح = fmtQty (private.qty_text مرآتها المختصرة): الواحد والاثنان كلمة، و3–10 جمع، و11–99 منصوب، والكسر مفرد،
  // والكيلو ثابت، والأرقام غربية بفواصل الآلاف ────────────────────────────────────────────────────────────────────────
  const format = await loadSrc('src/lib/format.ts');
  const QTYS = ['0', '0.5', '1', '1.25', '2', '2.5', '3', '3.5', '10', '11', '12.75', '99', '100', '101', '102', '103', '110', '111', '999', '1000', '1500', '2001', '1234.567', '1000000'];
  const texts = await db.asOwner(async (q) => (await q("select u, x, private.qty_text(x::numeric, u) as s from unnest(array['kg', 'L', 'pc']) as u cross join unnest($1::text[]) as x", [QTYS])).rows);
  const plain = (x, u) => {
    const shown2 = format.fmtQty(scaled(x, 3), u);
    return shown2.sub ?? shown2.main;
  };
  t.same(texts.filter((r) => r.s !== plain(r.x, r.u)).map((r) => `${r.u}/${r.x}: ${r.s} ≠ ${plain(r.x, r.u)}`), [], `qty_text = fmtQty (${texts.length} كمية ووحدة)`);

  // ── التجهيز: افتتاح بسطرين لنفس المادّة (دفعتان)، وتحويلان مرحّلان منه، ومرآة المرآة، ومسوّدات ────────────────────────────
  const probeItem = await item('كاز القيود', 'fuel', 'L');
  const probeRef = uid();
  const probeDraft = await openingDraft(db, U.manager, W.general, GO_LIVE, [{ item: probeItem, qty: 10, value: 1000 }, { item: probeItem, qty: 5, value: 500 }]);
  const probePosted = await postOpening(db, U.manager, probeDraft, probeRef);
  t.eq(shown(probePosted), 'ok', 'افتتاح القيود');
  const [L, L2] = (await db.admin('select id from public.stock_lots where source_id = $1 order by source_line_id = $2 desc', [probeDraft.id, probeDraft.lines[0]])).rows.map((r) => r.id);
  const M = (await db.admin('select id, doc_id, doc_line_id from public.stock_moves where lot_id = $1', [L])).rows[0];
  t.same(
    [probePosted.value.money.total, (await db.admin('select client_ref from public.opening_docs where id = $1', [probeDraft.id])).rows[0].client_ref],
    ['1500.00', probeRef],
    'الافتتاح: المجموع لكل السطور (1,500.00)، والمستند يحمل مرجع ترحيله',
  );
  t.same(
    (await db.admin('select source_line_id from public.stock_lots where source_id = $1 order by source_line_id', [probeDraft.id])).rows.map((r) => r.source_line_id),
    [...probeDraft.lines].sort(),
    'كل دفعة افتتاح تشير لسطرها',
  );
  const t1Ref = uid();
  const t1 = await transferDraft(db, U.manager, W.general, W.raw, TODAY, [{ item: probeItem, qty: 1 }]);
  t.eq(shown(await postTransfer(db, U.manager, t1, t1Ref)), 'ok', 'تحويل القيود الأوّل');
  t.eq((await db.admin('select client_ref from public.transfers where id = $1', [t1.id])).rows[0].client_ref, t1Ref, 'التحويل يحمل مرجع ترحيله');
  const t2 = await postedTransfer(db, U.manager, W.general, W.raw, TODAY, [{ item: probeItem, qty: 1 }]);
  await postedTransfer(db, U.manager, W.raw, W.general2, TODAY, [{ item: probeItem, qty: 1 }]);
  // مرآة المرآة m2 ومصدرها المباشر m1 (المرآتان بالمواد الأوّلية بنفس fifo_seq، فالمسحوبة منهما بالمعرّف).
  const [m2] = (await lotsOf(db, probeItem, W.general2)).map((l) => l.id);
  const m1 = (await db.admin('select source_lot_id from public.stock_lots where id = $1', [m2])).rows[0].source_lot_id;
  const t1Draw = (await db.admin('select id from public.stock_moves where doc_id = $1 and qty < 0', [t1.id])).rows[0].id;
  const openingDraftDoc = await openingDraft(db, U.manager, W.general, GO_LIVE, [{ item: await item('كاز المسوّدة', 'fuel', 'L'), qty: 1, value: 1 }]);
  const transferDraftDoc = await transferDraft(db, U.storekeeper, W.general, W.raw, TODAY, [{ item: probeItem, qty: 1 }]);
  const bare = (await db.admin('select fifo_seq::text as f from public.stock_lots where id = $1', [L])).rows[0].f;

  // ── كل قيد check وفريد يرفض صفّه الغلط باسمه (الدوالّ ما تكتب صفّاً غلطاً، فالقيد ينفحص مباشرةً بدور صاحب الجداول) ─────────
  const lot = (set) => [[`update public.stock_lots set ${set} where id = $1`, [L]]];
  const move = (over) => [
    [
      'insert into public.stock_moves (org_id, doc_kind, doc_id, doc_line_id, item_id, warehouse_id, lot_id, qty, value, moved_on, reverses_move_id) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
      [S.org, over.kind ?? 'opening', over.doc ?? M.doc_id, over.line === undefined ? M.doc_line_id : over.line, probeItem, over.wh ?? W.general, over.lot ?? L, over.qty, over.value, TODAY, over.reverses ?? null],
    ],
  ];
  const balance = (set) => [[`update public.stock_balances set ${set} where item_id = $1 and warehouse_id = $2`, [probeItem, W.general]]];
  const transferLine = (lineNo) => [
    ['alter table public.transfer_lines disable trigger transfer_lines_guard'],
    ["insert into public.transfer_lines (org_id, doc_id, from_warehouse_id, to_warehouse_id, line_no, item_id, unit_label, qty_in_unit, factor, qty_base) values ($1, $2, $3, $4, $5, $6, 'L', 1, 1, 1)", [S.org, transferDraftDoc.id, W.general, W.raw, lineNo, probeItem]],
  ];
  const openingLine = (lineNo) => [
    ['alter table public.opening_lines disable trigger opening_lines_guard'],
    ['insert into public.opening_lines (org_id, doc_id, warehouse_id, line_no, item_id, qty_base, value) values ($1, $2, $3, $4, $5, 1, 1)', [S.org, openingDraftDoc.id, W.general, lineNo, probeItem]],
  ];
  const CONSTRAINTS = {
    stock_lots_qty_in_positive: [lot('qty_in = 0, qty_left = 0, value_left = 0'), 'stock_lots_qty_in_check'],
    stock_lots_qty_in_scale: [lot('qty_in = 10.0005'), 'stock_lots_qty_in_check'],
    stock_lots_value_in_nonneg: [lot('value_in = -1'), 'stock_lots_value_in_check'],
    stock_lots_value_in_scale: [lot('value_in = 1000.005'), 'stock_lots_value_in_check'],
    stock_lots_left_le_in: [lot('qty_left = 11'), 'stock_lots_qty_left_check'],
    stock_lots_left_nonneg: [lot('qty_left = -1, value_left = 0'), 'stock_lots_qty_left_check'],
    stock_lots_empty_no_value: [lot('qty_left = 0, value_left = 5'), 'stock_lots_value_left_check'],
    stock_lots_value_left_nonneg: [lot('value_left = -1'), 'stock_lots_value_left_check'],
    stock_lots_source_kind: [lot("source_kind = 'gift'"), 'stock_lots_source_kind_check'],
    stock_lots_origin_without_source: [lot('origin_lot_id = id'), 'stock_lots_mirror_check'],
    stock_lots_transfer_without_source: [lot("source_kind = 'transfer'"), 'stock_lots_mirror_check'],
    stock_lots_supplier_lot_no: [lot("supplier_lot_no = repeat('x', 61)"), 'stock_lots_supplier_lot_no_check'],
    stock_moves_qty_zero: [move({ qty: 0, value: 5 }), 'stock_moves_qty_check'],
    stock_moves_value_sign: [move({ qty: 1, value: -5 }), 'stock_moves_value_check'],
    stock_moves_revalue_zero: [move({ kind: 'receipt_revalue', qty: 0, value: 0 }), 'stock_moves_value_check'],
    stock_moves_doc_kind: [move({ kind: 'sale', qty: 1, value: 1 }), 'stock_moves_doc_kind_check'],
    stock_moves_seq_unique: [
      [['alter table public.stock_moves disable trigger stock_moves_seq'], ...move({ qty: 1, value: 1 }).map(([sql, params]) => [sql.replace('reverses_move_id)', 'reverses_move_id, seq)').replace('$11)', '$11, 1)'), params])],
      'stock_moves_org_id_item_id_warehouse_id_seq_key',
    ],
    stock_moves_reverses_unique: [[...move({ qty: -10, value: -1000, reverses: M.id }), ...move({ qty: -10, value: -1000, reverses: M.id })], 'stock_moves_org_id_reverses_move_id_key'],
    stock_moves_lot_fk: [[['alter table public.stock_moves disable trigger stock_moves_check'], ...move({ qty: 1, value: 1, lot: uid() })], 'stock_moves_org_id_lot_id_fkey'],
    stock_balances_qty_nonneg: [balance('qty = -1, value = 0'), 'stock_balances_qty_check'],
    stock_balances_zero_no_value: [balance('qty = 0, value = 5'), 'stock_balances_value_check'],
    stock_balances_unique: [[['insert into public.stock_balances (org_id, item_id, warehouse_id) values ($1, $2, $3)', [S.org, probeItem, W.general]]], 'stock_balances_org_id_item_id_warehouse_id_key'],
    opening_docs_void_needs_stamp: [[["update public.opening_docs set status = 'void' where id = $1", [openingDraftDoc.id]]], 'opening_docs_lifecycle_check'],
    opening_docs_version: [[['update public.opening_docs set version = 0 where id = $1', [openingDraftDoc.id]]], 'opening_docs_version_check'],
    opening_docs_note: [[["update public.opening_docs set note = repeat('x', 501) where id = $1", [openingDraftDoc.id]]], 'opening_docs_note_check'],
    opening_docs_void_reason: [[["update public.opening_docs set void_reason = repeat('x', 501) where id = $1", [openingDraftDoc.id]]], 'opening_docs_void_reason_check'],
    opening_lines_qty: [[['update public.opening_lines set qty_base = 0 where id = $1', [openingDraftDoc.lines[0]]]], 'opening_lines_qty_check'],
    opening_lines_value: [[['update public.opening_lines set value = -1 where id = $1', [openingDraftDoc.lines[0]]]], 'opening_lines_value_check'],
    opening_lines_line_no_unique: [openingLine(1), 'opening_lines_org_id_doc_id_line_no_key'],
    transfers_numbered: [[['update public.transfers set doc_no = null where id = $1', [t1.id]]], 'transfers_numbered_check'],
    transfers_doc_no_shape: [[["update public.transfers set doc_no = 'TR-2026-001' where id = $1", [t1.id]]], 'transfers_doc_no_check'],
    transfers_void_needs_stamp: [[["update public.transfers set status = 'void' where id = $1", [transferDraftDoc.id]]], 'transfers_lifecycle_check'],
    transfers_doc_no_unique: [[['update public.transfers set doc_no = (select doc_no from public.transfers where id = $2) where id = $1', [t2.id, t1.id]]], 'transfers_org_id_doc_no_key'],
    transfer_lines_line_no_unique: [transferLine(1), 'transfer_lines_org_id_doc_id_line_no_key'],
  };
  const constraintOutcome = await probes(db, U.owner, Object.fromEntries(Object.entries(CONSTRAINTS).map(([label, [statements]]) => [label, statements])));
  t.same(constraintOutcome, Object.fromEntries(Object.entries(CONSTRAINTS).map(([label, [, name]]) => [label, name])), `كل قيد بجداول المخزون يرفض صفّه الغلط باسمه (${Object.keys(CONSTRAINTS).length} ضابط)`);
  const controls = await probes(db, U.owner, { lot: lot('qty_left = 7, value_left = 700'), move: move({ qty: 1, value: 1 }), balance: balance('qty = 1, value = 1'), line: openingLine(9) });
  t.same(controls, { lot: 'ok', move: 'ok', balance: 'ok', line: 'ok' }, 'ضابط: نفس الأوامر بقيم سليمة تمرّ');

  // ── مشغّلات الدفعة والحركة: الأهلية، والمرآة جذرها جذر بترتيبه، والحركة بدفعة مادّتها ومخزنها، والعكسية مطابقة ────────────────
  const reversible = await item('كاز النوع', 'fuel', 'L');
  const TRIGGERS = {
    lot_inadmissible: [[["insert into public.stock_lots (org_id, item_id, warehouse_id, fifo_seq, received_on, qty_in, value_in, qty_left, value_left, source_kind, source_id) values ($1, $2, $3, 999999, $4, 1, 1, 0, 0, 'opening', gen_random_uuid())", [S.org, I.feed, W.medicine, TODAY]]], 'item_kind_mismatch'],
    mirror_of_mirror: [[["insert into public.stock_lots (org_id, item_id, warehouse_id, origin_lot_id, source_lot_id, fifo_seq, received_on, qty_in, value_in, qty_left, value_left, source_kind, source_id) select $1, $2, $3, $4, $4, fifo_seq, $5, 1, 1, 0, 0, 'transfer', gen_random_uuid() from public.stock_lots where id = $4", [S.org, probeItem, W.general2, m1, TODAY]]], 'mirror_mismatch'],
    mirror_other_fifo: [[["insert into public.stock_lots (org_id, item_id, warehouse_id, origin_lot_id, source_lot_id, fifo_seq, received_on, qty_in, value_in, qty_left, value_left, source_kind, source_id) values ($1, $2, $3, $4, $4, $5::bigint + 1000, $6, 1, 1, 0, 0, 'transfer', gen_random_uuid())", [S.org, probeItem, W.general2, L, bare, TODAY]]], 'mirror_mismatch'],
    move_other_store: [move({ qty: 1, value: 1, wh: W.raw }), 'lot_mismatch'],
    move_inadmissible: [
      [
        ["insert into public.stock_lots (id, org_id, item_id, warehouse_id, fifo_seq, received_on, qty_in, value_in, qty_left, value_left, source_kind, source_id) values ('d7690000-0000-4000-8000-000000000001', $1, $2, $3, 999998, $4, 1, 1, 0, 0, 'opening', gen_random_uuid())", [S.org, reversible, W.general, TODAY]],
        ["update public.items set kind = 'feed' where id = $1", [reversible]],
        ["insert into public.stock_moves (org_id, doc_kind, doc_id, item_id, warehouse_id, lot_id, qty, value, moved_on) values ($1, 'opening', gen_random_uuid(), $2, $3, 'd7690000-0000-4000-8000-000000000001', 1, 1, $4)", [S.org, reversible, W.general, TODAY]],
      ],
      'item_kind_mismatch',
    ],
    reversal_qty: [move({ qty: -9, value: -1000, reverses: M.id }), 'reversal_mismatch'],
    reversal_value: [move({ qty: -10, value: -999, reverses: M.id }), 'reversal_mismatch'],
    reversal_lot: [move({ qty: -10, value: -1000, reverses: M.id, lot: L2 }), 'reversal_mismatch'],
    reversal_doc: [move({ qty: -10, value: -1000, reverses: M.id, doc: uid() }), 'reversal_mismatch'],
    reversal_line: [move({ qty: -10, value: -1000, reverses: M.id, line: null }), 'reversal_mismatch'],
    reversal_of_reversal: [
      [
        ...move({ qty: -10, value: -1000, reverses: M.id }),
        ["insert into public.stock_moves (org_id, doc_kind, doc_id, doc_line_id, item_id, warehouse_id, lot_id, qty, value, moved_on, reverses_move_id) select $1, 'opening', $2, $3, $4, $5, $6, 10, 1000, $7, id from public.stock_moves where reverses_move_id = $8", [S.org, M.doc_id, M.doc_line_id, probeItem, W.general, L, TODAY, M.id]],
      ],
      'reversal_mismatch',
    ],
    reversal_ok: [move({ qty: -10, value: -1000, reverses: M.id }), 'ok'],
    item_unit_frozen: [[["update public.items set base_unit = 'kg' where id = $1", [probeItem]]], 'frozen_column'],
  };
  const triggerOutcome = await probes(db, U.owner, Object.fromEntries(Object.entries(TRIGGERS).map(([label, [statements]]) => [label, statements])));
  t.same(triggerOutcome, Object.fromEntries(Object.entries(TRIGGERS).map(([label, [, expected]]) => [label, expected])), 'مشغّلات الدفعة والحركة والتجميد: كل كسر برمزه، والعكسية الصحيحة تمرّ');

  // ── حارس الرأس والسطر: الرمز نفسه (مو RLS)، والنسخة تزيد بكل تعديل، ورقم السطر متتالٍ، والسبب الفارغ null ──────────────────
  const guardCodes = {
    insertPosted: shown(await call(db, U.manager, "insert into public.opening_docs (warehouse_id, on_date, status) values ($1, $2, 'posted')", [W.general, GO_LIVE], once)),
    statusEdit: shown(await call(db, U.storekeeper, "update public.transfers set status = 'posted' where id = $1", [transferDraftDoc.id], once)),
    openingLineOutOfScope: shown(await call(db, U.scopedManager, 'insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, 1, 1)', [openingDraftDoc.id, probeItem], once)),
    transferLineOutOfScope: shown(await call(db, U.hatcheryKeeper, 'insert into public.transfer_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 1)', [transferDraftDoc.id, probeItem], once)),
    unknownItem: shown(await call(db, U.storekeeper, 'insert into public.transfer_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 1)', [transferDraftDoc.id, uid()], once)),
    nanQty: shown(await call(db, U.storekeeper, "insert into public.transfer_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 'NaN')", [transferDraftDoc.id, probeItem], once)),
  };
  t.same(
    guardCodes,
    { insertPosted: 'not_draft', statusEdit: 'frozen_column', openingLineOutOfScope: 'out_of_scope', transferLineOutOfScope: 'out_of_scope', unknownItem: 'item_not_found', nanQty: 'qty_not_positive' },
    'حارسا الرأس والسطر يرفضان برموزهما قبل RLS والمفتاح الأجنبي والتحويل',
  );
  const versionOf = async (table, docId) => (await db.admin(`select version from public.${table} where id = $1`, [docId])).rows[0].version;
  const v0 = await versionOf('opening_docs', openingDraftDoc.id);
  await asM("update public.opening_docs set note = 'ملاحظة' where id = $1", [openingDraftDoc.id]);
  const v1 = await versionOf('opening_docs', openingDraftDoc.id);
  await asM('update public.opening_lines set qty_base = 2 where id = $1', [openingDraftDoc.lines[0]]);
  const v2 = await versionOf('opening_docs', openingDraftDoc.id);
  const tv0 = await versionOf('transfers', transferDraftDoc.id);
  await call(db, U.storekeeper, "update public.transfers set note = 'ملاحظة' where id = $1", [transferDraftDoc.id]);
  t.same([v1 - v0, v2 - v0, (await versionOf('transfers', transferDraftDoc.id)) - tv0], [1, 2, 1], 'نسخة المسوّدة تزيد بتعديل رأسها وبتعديل سطرها (النوعين)');
  const threeLines = await openingDraft(db, U.manager, W.general2, GO_LIVE, [1, 2, 3].map((n) => ({ item: probeItem, qty: n, value: n })));
  t.same((await db.admin('select line_no from public.opening_lines where doc_id = $1 order by line_no', [threeLines.id])).rows.map((r) => r.line_no), [1, 2, 3], 'أرقام سطور الافتتاح 1، 2، 3');
  const blankReason = await openingDraft(db, U.manager, W.general2, GO_LIVE, [{ item: await item('كاز السبب', 'fuel', 'L'), qty: 1, value: 0, zeroReason: '   ' }]);
  t.same(
    [(await db.admin('select zero_reason from public.opening_lines where id = $1', [blankReason.lines[0]])).rows[0].zero_reason, shown(await postOpening(db, U.manager, blankReason, uid()))],
    [null, 'value_required'],
    'سبب الصفر الفارغ ينحفظ null (مو رفض قيد)، والترحيل يطلب القيمة أو سببها',
  );
  const both = await transferDraft(db, U.manager, W.feed, W.farm1, TODAY, [{ item: I.feed, qty: 2, unit: S.bag, code: 't' }]);
  t.same((await db.admin('select unit_code, unit_label from public.transfer_lines where id = $1', [both.lines[0]])).rows[0], { unit_code: null, unit_label: 'كيس 50 كغم' }, 'وحدة التعبئة تمسح رمز الوحدة (السطر بوحدة وحدة)');

  // ── القراءة بنطاق المخزن: الحركات والأرصدة وسطور الافتتاح للمحصور بمخزنه، والتحويل وسطره وتدقيقه بأيّ من مخزنيه ─────────────
  await postedOpening(db, U.manager, W.medicine, GO_LIVE, [{ item: I.vaccine, qty: 30, value: 30000, expiry: '2027-06-30' }]);
  await postedOpening(db, U.manager, W.chick2, GO_LIVE, [{ item: I.chicks, qty: 100, value: 65000, bornAt: new Date(Date.now() - 20 * 3_600_000).toISOString() }]);
  const intoChick = await postedTransfer(db, U.manager, W.chick2, W.chick, TODAY, [{ item: I.chicks, qty: 10 }]);
  await postedTransfer(db, U.manager, W.medicine, W.farm1, TODAY, [{ item: I.vaccine, qty: 2 }]);
  const intoMedicine = await postedTransfer(db, U.manager, W.farm1, W.medicine, TODAY, [{ item: I.vaccine, qty: 1 }]);
  const scopedRead = await db.asUser(U.scopedManager, async (q) => {
    const stores = async (sql, params) => [...new Set((await q(sql, params)).rows.map((r) => r.w))].sort();
    return {
      moves: await stores('select warehouse_id as w from public.stock_moves'),
      balances: await stores('select warehouse_id as w from public.stock_balances'),
      lines: await stores('select warehouse_id as w from public.opening_lines'),
      transferAudit: (await q("select count(*)::int as n from public.audit_log where table_name = 'transfers' and coalesce(new, old) ->> 'id' = $1", [intoMedicine.id])).rows[0].n > 0,
    };
  });
  t.same(scopedRead, { moves: [W.medicine], balances: [W.medicine], lines: [W.medicine], transferAudit: true }, 'المدير المحصور بالأدوية: حركاتها وأرصدتها وسطور افتتاحها بس، وتدقيق تحويل وارد إليها');
  const keeperRead = await db.asUser(U.hatcheryKeeper, async (q) => [(await q('select count(*)::int as n from public.transfers where id = $1', [intoChick.id])).rows[0].n, (await q('select count(*)::int as n from public.transfer_lines where doc_id = $1', [intoChick.id])).rows[0].n]);
  t.same(keeperRead, [1, 1], 'أمين الأفراخ يقرأ التحويل الوارد لمخزنه وسطره');
  // وحدة مخزن بيه حركات ثابتة (مخزن الحقل لوحدة حقول البيض: نوعه يناسبها، فالتجميد وحده يرفض)، وضابطه مخزن حقل بلا حركة.
  const farmMove = await probes(db, U.owner, {
    moved: [['update public.warehouses set division_id = $2 where id = $1', [W.farm1, S.divisions.layer]]],
    unmoved: [['update public.warehouses set division_id = $2 where id = $1', [W.farm2, S.divisions.layer]]],
  });
  t.eq(farmMove.moved, 'frozen_column', `وحدة مخزن بيه حركات ثابتة (${JSON.stringify(farmMove)})`);

  // ── تلميح النقص حرفاً بحرف، و«المتاح» و«اللي وصل بعده» بيوم الاستلام نفسه ──────────────────────────────────────────────
  const hintItem = await item('كاز التلميح', 'fuel', 'L');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: hintItem, qty: 100, value: 75000 }]);
  const toRaw = await postedTransfer(db, U.manager, W.general, W.raw, '2026-10-28', [{ item: hintItem, qty: 100 }]);
  const early = await postTransfer(db, U.manager, await transferDraft(db, U.manager, W.raw, W.general2, '2026-10-27', [{ item: hintItem, qty: 10 }]));
  t.same(
    [early.code, early.hint],
    ['insufficient_stock', 'لا يكفي رصيد «كاز التلميح»: المطلوب 10 لترات، وبهذا التاريخ (27/10/2026) لم يكن موجوداً إلا 0 لتر. و100 لتر استُلمت بعد هذا التاريخ.'],
    'تلميح النقص: المطلوب ثم الموجود بالتاريخ ثم اللي وصل بعده، بأرقام غربية',
  );
  const sameDay = (await previewOf('preview_transfer', (await transferDraft(db, U.manager, W.raw, W.general2, '2026-10-28', [{ item: hintItem, qty: 10 }])).id)).lines[0];
  t.same([scaled(sameDay.available, 3), scaled(sameDay.later, 3)], [100_000n, 0n], 'بيوم استلام المرآة: متاحة، مو «وصلت بعده»');
  const mirrorLots = (await asM('select public.item_lots_qty($1, $2, null, 50)', [hintItem, W.raw])).value.rows;
  t.same(mirrorLots.map((l) => [l.received_on, l.root_received_on, l.age_days]), [['2026-10-28', GO_LIVE, 5]], 'عمر المرآة من استلام جذرها (E24): 5 أيام');
  const generalLots = (await asM('select public.item_lots_qty($1, $2, null, 50)', [probeItem, W.general])).value.rows;
  t.ok(generalLots.length > 0 && generalLots.every((l) => l.source === 'رصيد افتتاح بتاريخ 25/10/2026'), 'مصدر دفعة الافتتاح «رصيد افتتاح بتاريخ 25/10/2026»');
  t.eq(shown(await call(db, U.manager, "select public.void_transfer($1, 'خطأ', $2)", [toRaw.id, uid()])), 'ok', 'إلغاء تحويل مؤرَّخ قبل اليوم');
  t.same(
    (await db.admin('select distinct moved_on::text as d from public.stock_moves where doc_id = $1 and reverses_move_id is not null', [toRaw.id])).rows.map((r) => r.d),
    [TODAY],
    'عكس التحويل (المرآة ومصدرها) مؤرَّخ بيوم الإلغاء',
  );

  // ── lot_consumed يسمّي آخر مستند سحب حيّ من الدفعة ─────────────────────────────────────────────────────────────
  const voidItem = await item('كاز الإلغاء', 'fuel', 'L');
  const voidOpening = await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: voidItem, qty: 100, value: 1000 }]);
  const ta = await postedTransfer(db, U.manager, W.general, W.raw, TODAY, [{ item: voidItem, qty: 10 }]);
  const tb = await postedTransfer(db, U.manager, W.general, W.raw, TODAY, [{ item: voidItem, qty: 10 }]);
  const [aNo, bNo] = [await docNo(ta.id), await docNo(tb.id)];
  const newest = await call(db, U.manager, "select public.void_opening_stock($1, 'خطأ', $2)", [voidOpening.id, uid()]);
  await call(db, U.manager, "select public.void_transfer($1, 'خطأ', $2)", [tb.id, uid()]);
  const live = await call(db, U.manager, "select public.void_opening_stock($1, 'خطأ', $2)", [voidOpening.id, uid()]);
  t.same([newest.code, newest.hint.includes(bNo) && !newest.hint.includes(aNo), live.code, live.hint.includes(aNo) && !live.hint.includes(bNo)], ['lot_consumed', true, 'lot_consumed', true], `lot_consumed يسمّي الأحدث (${bNo})، وبعد إلغائه الحيّ اللي قبله (${aNo})`);

  // ── حدود يوم التشغيل بالمعاينة والترحيل، والافتتاح معفى من الأيام السبعة، والتاريخ بالوحدتين ─────────────────────────────
  const goLiveItem = await item('كاز التشغيل', 'fuel', 'L');
  const openingCodes = async (day) => codes(await previewOf('preview_opening_stock', (await openingDraft(db, U.manager, W.general2, day, [{ item: goLiveItem, qty: 1, value: 1 }])).id));
  // رمز لكل مشكلة (الوحدتان بتلميحين يسمّيان كل وحدة).
  const transferCodes = async (to, day) => [...new Set(codes(await previewOf('preview_transfer', (await transferDraft(db, U.manager, W.general, to, day, [{ item: probeItem, qty: 1 }])).id)))];
  t.same(
    { openingOnGoLive: await openingCodes(GO_LIVE), openingAfter: await openingCodes('2026-10-26'), transferBefore: await transferCodes(W.raw, '2026-10-24'), transferOnGoLive: await transferCodes(W.raw, GO_LIVE), destinationBefore: await transferCodes(W.farm1, '2026-10-27') },
    { openingOnGoLive: [], openingAfter: ['after_go_live'], transferBefore: ['before_go_live'], transferOnGoLive: [], destinationBefore: ['before_go_live'] },
    'المعاينة: الافتتاح بيوم التشغيل بلا مشكلة وبعده after_go_live، والتحويل قبله before_go_live (والوجهة بوحدتها)',
  );
  const lateDestination = await transferDraft(db, U.manager, W.general, W.farm1, '2026-10-27', [{ item: probeItem, qty: 1 }]);
  const lateCheck = await previewOf('preview_transfer', lateDestination.id);
  t.same([lateCheck.ready, lateCheck.lines[0].problem, shown(await postTransfer(db, U.manager, lateDestination))], [false, null, 'before_go_live'], 'تحويل لوحدة يومها بعد تاريخه: المعاينة غير جاهزة والترحيل before_go_live');
  const oldItem = await item('كاز قديم', 'fuel', 'L');
  const oldDoc = await openingDraft(db, U.manager, W.general2, '2026-10-20', [{ item: oldItem, qty: 10, value: 100 }]);
  const oldPreview = await previewOf('preview_opening_stock', oldDoc.id);
  t.same([codes(oldPreview), oldPreview.ready, shown(await postOpening(db, U.manager, oldDoc))], [[], true, 'ok'], 'افتتاح قبل 10 أيام (قبل يوم التشغيل) جاهز ويترحّل: معفى من الأيام السبعة');
  t.same(
    [(await lotsOf(db, oldItem, W.general2))[0].received_on, (await db.admin('select moved_on::text as d from public.stock_moves where doc_id = $1', [oldDoc.id])).rows[0].d],
    ['2026-10-20', '2026-10-20'],
    'دفعة الافتتاح وحركته بتاريخ المستند',
  );
  const bareOrg = await makeOrg(db, {
    name: 'منشأة بلا تشغيل ثانية',
    id: (n) => `d7610000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    phone: (n) => `96477097610${String(n).padStart(2, '0')}`,
    roles: [['owner', 'owner'], ['manager', 'manager']],
  });
  const bareStores = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [bareOrg.org])).rows.map((r) => [r.kind, r.id]));
  const bareFuel = (await call(db, bareOrg.users.manager, "insert into public.items (name, kind, base_unit) values ('كاز', 'fuel', 'L') returning id")).value;
  const bareOpening = await openingDraft(db, bareOrg.users.manager, bareStores.general, '2026-10-20', [{ item: bareFuel, qty: 1, value: 1 }]);
  const bareTransfer = await transferDraft(db, bareOrg.users.manager, bareStores.general, bareStores.raw, TODAY, [{ item: bareFuel, qty: 1 }]);
  t.same(
    [[...new Set(codes(await previewOf('preview_opening_stock', bareOpening.id, bareOrg.users.manager)))], [...new Set(codes(await previewOf('preview_transfer', bareTransfer.id, bareOrg.users.manager)))]],
    [['no_go_live'], ['no_go_live']],
    'المعاينة بوحدة بلا يوم تشغيل: no_go_live',
  );

  // ── الافتتاح: النطاق والفراغ والمؤرشف، والإلغاء (السبب والنطاق والحالة والتاريخ) ───────────────────────────────────────
  const archivedItem = await item('كاز مؤرشف', 'fuel', 'L');
  await asM("update public.items set archived_at = 'now' where id = $1", [archivedItem]);
  const gen3 = await storeIn('general', W.general, 'مخزن عامّ ثالث', 'general');
  const gen3Opening = await openingDraft(db, U.manager, gen3, GO_LIVE, [{ item: probeItem, qty: 1, value: 1 }]);
  const gen3Out = await transferDraft(db, U.manager, gen3, W.general, TODAY, [{ item: probeItem, qty: 1 }]);
  const gen3In = await transferDraft(db, U.manager, W.general, gen3, TODAY, [{ item: probeItem, qty: 1 }]);
  await asM("update public.warehouses set archived_at = 'now' where id = $1", [gen3]);
  const emptyOpening = await openingDraft(db, U.manager, W.general2, GO_LIVE, []);
  const emptyTransfer = await transferDraft(db, U.manager, W.general, W.raw, TODAY, []);
  const archivedLine = await openingDraft(db, U.manager, W.general2, GO_LIVE, [{ item: archivedItem, qty: 1, value: 1 }]);
  t.same(
    {
      scoped: shown(await call(db, U.scopedManager, 'select public.post_opening_stock($1, $2, $3)', [openingDraftDoc.id, await versionOf('opening_docs', openingDraftDoc.id), uid()], once)),
      emptyOpening: shown(await postOpening(db, U.manager, emptyOpening)),
      emptyTransfer: shown(await postTransfer(db, U.manager, emptyTransfer)),
      archivedItem: shown(await postOpening(db, U.manager, archivedLine)),
      archivedStore: shown(await postOpening(db, U.manager, gen3Opening)),
      keeperOtherStore: shown(await call(db, U.hatcheryKeeper, 'select public.post_transfer($1, $2, $3)', [transferDraftDoc.id, await versionOf('transfers', transferDraftDoc.id), uid()], once)),
    },
    { scoped: 'out_of_scope', emptyOpening: 'doc_empty', emptyTransfer: 'doc_empty', archivedItem: 'item_archived', archivedStore: 'warehouse_archived', keeperOtherStore: 'out_of_scope' },
    'الترحيل: مخزن برّا النطاق، ومستند بلا سطور، ومادّة أو مخزن مؤرشف',
  );
  const emptyPreviews = [await previewOf('preview_opening_stock', emptyOpening.id), await previewOf('preview_transfer', emptyTransfer.id)];
  t.same(emptyPreviews.map((p) => p.ready), [false, false], 'معاينة مستند بلا سطور غير جاهزة');
  const archivedPreview = await previewOf('preview_opening_stock', archivedLine.id);
  const storePreviews = [await previewOf('preview_opening_stock', gen3Opening.id), await previewOf('preview_transfer', gen3Out.id), await previewOf('preview_transfer', gen3In.id)];
  t.same(
    [archivedPreview.lines[0].problem?.code, archivedPreview.ready, ...storePreviews.map((p) => codes(p).includes('warehouse_archived'))],
    ['item_archived', false, true, true, true],
    'المعاينة: المادّة المؤرشفة مشكلة سطرها، والمخزن المؤرشف (للافتتاح وللمرسِل وللمستلم) مشكلة المستند',
  );
  const lineProblem = await previewOf('preview_opening_stock', (await openingDraft(db, U.manager, W.medicine, GO_LIVE, [{ item: I.feed, qty: 1, value: 1 }])).id);
  t.same([lineProblem.lines[0].problem?.code, lineProblem.ready], ['item_kind_mismatch', false], 'معاينة الافتتاح: سطر بمشكلة يمنع الجاهزية');
  const posted = [await previewOf('preview_opening_stock', probeDraft.id), await previewOf('preview_transfer', t1.id)];
  t.same(posted.map((p) => codes(p).includes('not_draft')), [true, true], 'معاينة مستند مرحَّل تقول not_draft');
  const reasons = {
    blankOpening: shown(await call(db, U.manager, 'select public.void_opening_stock($1, $2, $3)', [oldDoc.id, '   ', uid()], once)),
    blankTransfer: shown(await call(db, U.manager, 'select public.void_transfer($1, $2, $3)', [t2.id, '   ', uid()], once)),
    scopedOpening: shown(await call(db, U.scopedManager, "select public.void_opening_stock($1, 'خطأ', $2)", [probeDraft.id, uid()], once)),
    scopedTransfer: shown(await call(db, U.scopedManager, "select public.void_transfer($1, 'خطأ', $2)", [t2.id, uid()], once)),
    draftOpening: shown(await call(db, U.manager, "select public.void_opening_stock($1, 'خطأ', $2)", [openingDraftDoc.id, uid()], once)),
    draftTransfer: shown(await call(db, U.manager, "select public.void_transfer($1, 'خطأ', $2)", [transferDraftDoc.id, uid()], once)),
  };
  t.same(reasons, { blankOpening: 'reason_required', blankTransfer: 'reason_required', scopedOpening: 'out_of_scope', scopedTransfer: 'out_of_scope', draftOpening: 'not_posted', draftTransfer: 'not_posted' }, 'الإلغاء: سبب فارغ، ومخزن برّا النطاق، ومسوّدة لم تُرحَّل');
  t.eq(shown(await call(db, U.manager, 'select public.void_opening_stock($1, $2, $3)', [oldDoc.id, '  عدّ خاطئ  ', uid()])), 'ok', 'إلغاء افتتاح قبل 10 أيام');
  t.same(
    [
      (await db.admin('select void_reason from public.opening_docs where id = $1', [oldDoc.id])).rows[0].void_reason,
      (await db.admin('select moved_on::text as d from public.stock_moves where doc_id = $1 and reverses_move_id is not null', [oldDoc.id])).rows.map((r) => r.d),
      shown(await call(db, U.manager, "select public.void_opening_stock($1, 'ثانية', $2)", [oldDoc.id, uid()])),
    ],
    ['عدّ خاطئ', [TODAY], 'already_void'],
    'إلغاء الافتتاح: السبب مقصوص، والعكس بيوم الإلغاء، والإلغاء الثاني already_void',
  );

  // ── الترحيل والإلغاء بسطور: قيمة كل سطر مجموع قطعه، والمجموع للسطور، والوجهة غير المؤهّلة بتلميحها، والسطور المتكرّرة تنعكس ──────
  const sumItem = await item('كاز المجموع', 'fuel', 'L');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: sumItem, qty: 5, value: 500 }, { item: sumItem, qty: 5, value: 700 }]);
  const firstLot = (await lotsOf(db, sumItem, W.general)).find((l) => l.value_in === '500').id;
  const summed = await postTransfer(db, U.manager, await transferDraft(db, U.manager, W.general, W.raw, TODAY, [{ item: sumItem, qty: 8 }, { item: probeItem, qty: 1 }]));
  const firstDraws = summed.value.lines[0].draws;
  t.same(
    [firstDraws[0].lot_id === firstLot, summed.value.lines[0].money.value, summed.value.lines[1].money.value, summed.value.money.total],
    [true, '920.00', '100.00', '1020.00'],
    'قيمة السطر = مجموع قطعه (500.00 + 420.00)، والمجموع = مجموع السطور',
  );
  await postedOpening(db, U.manager, W.feed, GO_LIVE, [{ item: I.feed, qty: 100, value: 70000 }]);
  const wrongPlace = await transferDraft(db, U.manager, W.feed, W.raw, TODAY, [{ item: I.feed, qty: 1 }]);
  const wrongPreview = await previewOf('preview_transfer', wrongPlace.id);
  const wrongPost = await postTransfer(db, U.manager, wrongPlace);
  t.same([wrongPreview.lines[0].problem?.code, wrongPreview.ready, wrongPost.code, wrongPost.hint.includes('المستلم')], ['item_kind_mismatch', false, 'item_kind_mismatch', true], 'الوجهة غير المؤهّلة: مشكلة السطر بالمعاينة، والترحيل يسمّي المخزن المستلم');
  const repeatItem = await item('كاز التكرار', 'fuel', 'L');
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: repeatItem, qty: 10, value: 1000 }]);
  const repeatedDraft = await transferDraft(db, U.manager, W.general, W.raw, TODAY, [{ item: repeatItem, qty: 4 }, { item: repeatItem, qty: 6 }]);
  const repeatedPreview = await previewOf('preview_transfer', repeatedDraft.id);
  t.same(repeatedPreview.lines.map((l) => [scaled(l.available, 3), l.whole_balance]), [[10_000n, false], [6_000n, true]], 'سطران لنفس المادّة: المتاح للثاني بعد الأوّل، و«الرصيد كلّه» للسطر اللي يصفّره بس');
  const repeated = await postTransfer(db, U.manager, repeatedDraft);
  t.same([shown(repeated), shown(await call(db, U.manager, "select public.void_transfer($1, 'خطأ', $2)", [repeatedDraft.id, uid()]))], ['ok', 'ok'], 'تحويل بسطرين من نفس الدفعة يترحّل وينلغي');
  t.same((await lotsOf(db, repeatItem, W.general)).map((l) => [l.qty_left, l.value_left]), [['10', '1000']], 'بعد الإلغاء الدفعة كاملة: كل قطعة انعكست مع مرآتها');
  const short = (await previewOf('preview_transfer', (await transferDraft(db, U.manager, W.general, W.raw, TODAY, [{ item: sumItem, qty: 100 }])).id));
  t.same([scaled(short.lines[0].shortage, 3), scaled(short.lines[0].available, 3), short.ready], [98_000n, 2_000n, false], 'النقص بالمعاينة = المطلوب − المسحوب، والمسوّدة غير جاهزة');
  const archivedTransfer = await previewOf('preview_transfer', (await transferDraft(db, U.manager, W.general, W.raw, TODAY, [{ item: archivedItem, qty: 1 }])).id);
  t.eq(archivedTransfer.lines[0].problem?.code, 'item_archived', 'معاينة التحويل: المادّة المؤرشفة مشكلة سطرها');

  // ── طيّ المسوّدة وحذف سطرها: النوع غير المعروف، والمستند غير الموجود، والمرحَّل، والنسخة ──────────────────────────────────
  const discardable = await transferDraft(db, U.manager, W.general, W.raw, TODAY, [{ item: probeItem, qty: 1 }]);
  const twoLines = await openingDraft(db, U.manager, W.general2, GO_LIVE, [{ item: probeItem, qty: 1, value: 1 }, { item: probeItem, qty: 2, value: 2 }]);
  t.same(
    {
      discardKind: shown(await asM("select public.discard_draft('count', $1, 1)", [uid()])),
      deleteKind: shown(await asM("select public.delete_draft_line('count', $1, 1)", [uid()])),
      discardMissing: shown(await asM("select public.discard_draft('transfer', $1, 1)", [uid()])),
      discardPosted: shown(await call(db, U.manager, "select public.discard_draft('transfer', $1, $2)", [t1.id, await versionOf('transfers', t1.id)], once)),
      deletePosted: shown(await call(db, U.manager, "select public.delete_draft_line('transfer', $1, $2)", [t1.lines[0], await versionOf('transfers', t1.id)], once)),
    },
    { discardKind: 'doc_kind_unknown', deleteKind: 'doc_kind_unknown', discardMissing: 'doc_not_found', discardPosted: 'not_draft', deletePosted: 'not_draft' },
    'الطيّ وحذف السطر: نوع غير معروف، ومستند غير موجود، ومستند مرحَّل',
  );
  await asM("select public.discard_draft('transfer', $1, $2)", [discardable.id, discardable.version]);
  await asM("select public.delete_draft_line('opening', $1, $2)", [twoLines.lines[0], twoLines.version]);
  t.same([await versionOf('transfers', discardable.id), await versionOf('opening_docs', twoLines.id)], [discardable.version + 1, twoLines.version + 1], 'الطيّ وحذف سطر الافتتاح يزيدان نسخة المسوّدة');

  // ── اللوحة: قريب الانتهاء 30 يوماً بالضبط، والحدّ الأدنى (الحدّ نفسه، ومخازن الاستلام، والمنتهي ما ينحسب، والصفر يبين، والمؤرشف لا) ─────
  const nearItem = await item('لقاح الحدّ', 'vaccine', 'pc', { tracksExpiry: true });
  await postedOpening(db, U.manager, W.medicine, GO_LIVE, [
    { item: nearItem, qty: 3, value: 300, expiry: '2026-11-29' },
    { item: nearItem, qty: 4, value: 400, expiry: '2026-11-30' },
    { item: nearItem, qty: 2, value: 200, expiry: '2026-10-29' },
  ]);
  const expiredMin = await item('لقاح منتهٍ', 'vaccine', 'pc', { tracksExpiry: true, minQty: 5 });
  await postedOpening(db, U.manager, W.medicine, GO_LIVE, [{ item: expiredMin, qty: 20, value: 2000, expiry: '2026-10-29' }]);
  const exactMin = await item('كاز الحدّ', 'fuel', 'L', { minQty: 100 });
  await postedOpening(db, U.manager, W.general, GO_LIVE, [{ item: exactMin, qty: 100, value: 100 }]);
  const millMin = await item('كاز المعمل', 'fuel', 'L', { minQty: 50 });
  await postedOpening(db, U.manager, W.raw, GO_LIVE, [{ item: millMin, qty: 10, value: 10 }]);
  const archivedMin = await item('مؤرشف بحدّ', 'fuel', 'L', { minQty: 5 });
  const medicineBoard = await board(W.medicine);
  const generalBoard = await board(W.general);
  t.same(
    {
      near: rowOf(medicineBoard, nearItem).near_expiry,
      expired: rowOf(medicineBoard, nearItem).expired,
      expiredBelow: rowOf(medicineBoard, expiredMin).below_min,
      exact: rowOf(generalBoard, exactMin).below_min,
      zeroShown: rowOf(generalBoard, millMin)?.below_min,
      rawBoard: rowOf(await board(W.raw), millMin).below_min,
    },
    { near: '3.000', expired: '2.000', expiredBelow: true, exact: false, zeroShown: true, rawBoard: false },
    'اللوحة: قريب الانتهاء لحد 30 يوماً، والمنتهي لحاله، والحدّ الأدنى بالمتاح غير المنتهي وبمخازن الاستلام، والمادّة بلا رصيد تبين تحته',
  );
  const generalBefore = (await home(U.manager)).general.below_min;
  await asM("update public.items set archived_at = 'now' where id = $1", [archivedMin]);
  t.same([generalBefore - (await home(U.manager)).general.below_min, rowOf(await board(W.general), archivedMin)], [1, undefined], 'المادّة المؤرشفة بلا رصيد ما تنعدّ تحت الحدّ ولا تبين باللوحة');

  // ── الرئيسية: مخازن استلام الوحدة ونطاقها، والمنتهي والمطفأ ما ينحسبان قريب الانتهاء ───────────────────────────────────
  await item('بيض تفقيس بحدّ', 'hatching_egg', 'pc', { minQty: 10 });
  const medicine2 = await storeIn('medicine', W.medicine, 'مخزن أدوية ثانٍ', 'medicine');
  await postedOpening(db, U.manager, medicine2, GO_LIVE, [{ item: await item('لقاح الطرف', 'vaccine', 'pc', { tracksExpiry: true }), qty: 5, value: 500, expiry: '2026-11-10' }]);
  const switchedOff = await item('مرهم مطفأ', 'medicine', 'pc', { tracksExpiry: true });
  await postedOpening(db, U.manager, W.medicine, GO_LIVE, [{ item: switchedOff, qty: 5, value: 50, expiry: '2026-11-10' }]);
  await asM('update public.items set tracks_expiry = false where id = $1', [switchedOff]);
  const managerHome = await home(U.manager);
  const scopedHome = await home(U.scopedManager);
  const keeperHome = await home(U.hatcheryKeeper);
  t.same(
    {
      millBelow: managerHome.feed_mill.below_min,
      medicineBelow: managerHome.medicine.below_min,
      medicineNear: managerHome.medicine.near_expiry,
      scopedNear: scopedHome.medicine.near_expiry,
      hatcheryBelow: managerHome.hatchery.below_min,
      keeperHatcheryBelow: keeperHome.hatchery.below_min,
    },
    { millBelow: 0, medicineBelow: 1, medicineNear: 2, scopedNear: 1, hatcheryBelow: 1, keeperHatcheryBelow: 0 },
    'الرئيسية: الوقود بالمعمل ما يدخل حدّ المعمل، والمنتهي ما يكمّل الحدّ، وقريب الانتهاء بلا المنتهي والمطفأ وبمخازن النطاق، وحدّ بيض التفقيس لمخزنه',
  );

  // ── صفحات القراءات: اللوحة والدفعات وقيمها والحركات وقيم اللوحة، بمؤشّراتها بلا تكرار ولا نقص، والعدد الكلّي ───────────────────
  const chain = async (sql, params, next, limit = 1) => {
    const pages = [];
    let after = null;
    for (let n = 0; n < 20; n += 1) {
      const page = (await asM(sql, [...params, after, limit])).value;
      pages.push(page);
      after = next(page);
      if (after === null || after === undefined) break;
    }
    return pages;
  };
  const fullBoard = (await board(W.medicine)).rows.map((r) => r.item_id);
  const boardPages = await chain('select public.stock_on_hand($1, $2, $3)', [W.medicine], (p) => p.next);
  t.same([boardPages.flatMap((p) => p.rows.map((r) => r.item_id)), boardPages[0].total, boardPages.every((p) => p.rows.length <= 1)], [fullBoard, fullBoard.length, true], `صفحات لوحة الأدوية بمؤشّرها = القائمة كاملة (${fullBoard.length})`);
  const valuePages = await chain('select public.stock_values($1, $2, $3)', [W.medicine], (p) => p.rows.at(-1)?.item_id ?? null);
  const fullValues = (await asM('select public.stock_values($1, null, 200)', [W.medicine])).value.rows.map((r) => r.item_id);
  t.same([valuePages.flatMap((p) => p.rows.map((r) => r.item_id)), valuePages.every((p) => p.rows.length <= 1)], [fullValues, true], 'صفحات قيم اللوحة بمؤشّرها = القائمة كاملة');
  const pagedItem = await item('كاز الصفحات', 'fuel', 'L');
  await postedOpening(db, U.manager, W.general2, GO_LIVE, [1, 2, 3, 4].map((n) => ({ item: pagedItem, qty: n, value: n * 10 })));
  await postedTransfer(db, U.manager, W.general2, W.general, TODAY, [{ item: pagedItem, qty: 1 }]);
  const lotPages = await chain('select public.item_lots_qty($1, $2, $3, $4)', [pagedItem, W.general2], (p) => p.next);
  const fullLots = (await asM('select public.item_lots_qty($1, $2, null, 200)', [pagedItem, W.general2])).value.rows.map((r) => r.lot_id);
  const lotValuePages = await chain('select public.item_lots_value($1, $2, $3, $4)', [pagedItem, W.general2], (p) => (p.rows.length ? { id: p.rows.at(-1).lot_id } : null));
  t.same(
    [lotPages.flatMap((p) => p.rows.map((r) => r.lot_id)), lotPages[0].total, lotValuePages.flatMap((p) => p.rows.map((r) => r.lot_id)), fullLots.length],
    [fullLots, fullLots.length, fullLots, 3],
    'صفحات الدفعات (انتهاء فارغ) وقيمها بمؤشّر الدفعة = القائمة كاملة',
  );
  const movePages = await chain('select public.item_moves_qty($1, $2, $3, $4)', [pagedItem, W.general2], (p) => p.next);
  const fullMoves = (await asM('select public.item_moves_qty($1, $2, null, 200)', [pagedItem, W.general2])).value.rows.map((r) => r.seq);
  t.same([movePages.flatMap((p) => p.rows.map((r) => r.seq)), fullMoves], [fullMoves, ['1', '2', '3', '4', '5']], 'الحركات أرقامها 1…5 بالمادّة والمخزن، وصفحاتها بآخر رقم بلا تكرار');
  const mixed = await item('مطهّر الصفحات', 'medicine', 'pc');
  await postedOpening(db, U.manager, W.medicine, GO_LIVE, [{ item: mixed, qty: 5, value: 50 }]);
  await asM('update public.items set tracks_expiry = true where id = $1', [mixed]);
  await postedOpening(db, U.manager, W.farm1, BROILER_GO_LIVE, [{ item: mixed, qty: 5, value: 60, expiry: '2027-06-30' }]);
  await postedTransfer(db, U.manager, W.farm1, W.medicine, TODAY, [{ item: mixed, qty: 2 }]);
  const mixedFull = (await asM('select public.item_lots_qty($1, $2, null, 200)', [mixed, W.medicine])).value.rows;
  const mixedPages = await chain('select public.item_lots_qty($1, $2, $3, $4)', [mixed, W.medicine], (p) => p.next);
  const mixedValues = (await asM('select public.item_lots_value($1, $2, null, 200)', [mixed, W.medicine])).value.rows.map((r) => r.lot_id);
  t.same(
    [mixedFull.map((l) => l.expiry_on), mixedPages.flatMap((p) => p.rows.map((r) => r.lot_id)), mixedValues],
    [['2027-06-30', null], mixedFull.map((l) => l.lot_id), mixedFull.map((l) => l.lot_id)],
    'دفعة بتاريخ ثم دفعة بلا تاريخ: الصفحة الثانية بعد المؤرَّخة، والقيم بنفس الترتيب',
  );
  const nearLots = (await asM('select public.item_lots_qty($1, $2, null, 50)', [nearItem, W.medicine])).value.rows;
  t.same(nearLots.map((l) => [l.expiry_on, l.expired, l.near_expiry]), [['2026-10-29', true, false], ['2026-11-29', false, true], ['2026-11-30', false, false]], 'الدفعات: المنتهية بعلامتها (مو قريبة)، وقريبة الانتهاء لحد 30 يوماً');
  t.eq(shown(await asM('select public.item_lots_qty($1, $2, null, 50)', [uid(), W.general])), 'item_not_found', 'دفعات مادّة غير موجودة ← item_not_found');
  const medicineTotals = (await call(db, U.accountant, 'select public.stock_value_totals($1)', [W.medicine])).value.units.find((u) => u.base_unit === 'pc');
  const pcRows = (await board(W.medicine)).rows.filter((r) => r.base_unit === 'pc');
  t.same([scaled(medicineTotals.available, 3), scaled(medicineTotals.expired, 3)], [pcRows.reduce((s, r) => s + scaled(r.available, 3), 0n), pcRows.reduce((s, r) => s + scaled(r.expired, 3), 0n)], 'مجاميع المخزن بالقطعة: المتاح بلا المنتهي = اللوحة');
  t.same(
    [
      shown(await call(db, U.scopedManager, 'select public.stock_values($1, null, 50)', [W.general])),
      shown(await call(db, U.scopedManager, 'select public.stock_value_totals($1)', [W.general])),
      shown(await call(db, U.scopedManager, 'select public.item_lots_value($1, $2, null, 50)', [probeItem, W.general])),
    ],
    ['out_of_scope', 'out_of_scope', 'out_of_scope'],
    'قراءات القيم لمخزن برّا النطاق: out_of_scope مو صفر صفوف',
  );

  // ── verify_stock: كل شقّ بكل فحص يمسك كسره (ضوابط بمعاملات ترجع، بمنشأة هالملف) ─────────────────────────────────────
  const vaccineLot = (await lotsOf(db, I.vaccine, W.medicine)).find((l) => l.source_kind === 'opening').id;
  const chickMirror = (await lotsOf(db, I.chicks, W.chick)).find((l) => l.source_kind === 'transfer').id;
  const rev = (qty, value, lotId = L) => [
    ['alter table public.stock_moves disable trigger stock_moves_check'],
    ['insert into public.stock_moves (org_id, doc_kind, doc_id, doc_line_id, item_id, warehouse_id, lot_id, qty, value, moved_on, reverses_move_id) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)', [S.org, 'opening', M.doc_id, M.doc_line_id, probeItem, W.general, lotId, qty, value, TODAY, M.id]],
  ];
  const VERIFY = {
    balanceValue: [[['update public.stock_balances set value = value + 1 where item_id = $1 and warehouse_id = $2', [probeItem, W.general]]], { balance_identity: 1 }],
    balanceMissing: [[['delete from public.stock_balances where item_id = $1 and warehouse_id = $2', [probeItem, W.general]]], { balance_identity: 1 }],
    lotQty: [[['update public.stock_lots set qty_left = qty_left - 1 where id = $1', [L]]], { balance_identity: 1, lot_moves: 1 }],
    lotValue: [[['update public.stock_lots set value_left = value_left - 1 where id = $1', [L]]], { balance_identity: 1, lot_moves: 1, value_conservation: 1 }],
    lotWithoutMove: [[["insert into public.stock_lots (org_id, item_id, warehouse_id, fifo_seq, received_on, qty_in, value_in, qty_left, value_left, source_kind, source_id) values ($1, $2, $3, 999997, $4, 5, 50, 0, 0, 'opening', gen_random_uuid())", [S.org, probeItem, W.general, TODAY]]], { lot_moves: 1 }],
    valueIn: [[['update public.stock_lots set value_in = value_in + 1 where id = $1', [L]]], { lot_moves: 1 }],
    pieces: [[['update public.stock_lots set qty_in = qty_in + 0.5 where id = $1', [vaccineLot]]], { lot_moves: 1, lot_shape: 1 }],
    mirrorRoot: [[['update public.stock_lots set origin_lot_id = $2 where id = $1', [m2, m1]]], { lot_shape: 1, mirror_pairs: 1 }],
    reversalQty: [rev(-9, -1000), { reversal_pairs: 1 }],
    reversalValue: [rev(-10, -999), { reversal_pairs: 1 }],
    reversalLot: [rev(-10, -1000, L2), { reversal_pairs: 1 }],
    mirrorBorn: [[["update public.stock_lots set born_at = born_at - interval '1 hour' where id = $1", [chickMirror]]], { mirror_pairs: 1 }],
    mirrorFifo: [[['update public.stock_lots set fifo_seq = fifo_seq + 100000 where id = $1', [m1]]], { lot_shape: 1, mirror_pairs: 2 }],
    mirrorIn: [[['update public.stock_lots set value_in = value_in + 1 where id = $1', [m1]]], { lot_moves: 1, mirror_pairs: 1 }],
    mirrorPair: [[['alter table public.stock_moves disable trigger stock_moves_append_only'], ['update public.stock_moves set value = value - 1 where id = $1', [t1Draw]]], { mirror_pairs: 1 }],
  };
  const verifyOutcome = {};
  for (const [label, [statements, expected]] of Object.entries(VERIFY)) {
    const got = await db.asOwner(async (q) => {
      for (const [sql, params = []] of statements) await q(sql, params);
      return verifyStock(q);
    }, U.owner);
    verifyOutcome[label] = Object.fromEntries(Object.keys(expected).map((key) => [key, got[key]]));
  }
  t.same(verifyOutcome, Object.fromEntries(Object.entries(VERIFY).map(([label, [, expected]]) => [label, expected])), `verify_stock: كل شقّ يمسك كسره (${Object.keys(VERIFY).length} ضابطاً)`);
  const trYear = await db.asOwner(async (q) => {
    await q("update public.transfers set moved_on = '2025-12-31' where id = $1", [t1.id]);
    return (await q("select violations::int as v from public.verify_ledger() where check_name = 'doc_numbers'")).rows[0].v;
  }, U.owner);
  t.eq(trYear, 1, 'verify_ledger.doc_numbers: رقم تحويل بسنة غير سنة تاريخه');

  // ── حدود الصفحة (200) للوحة والحركات ─────────────────────────────────────────────────────────────────────────
  await db.asOwner((q) => q("insert into public.items (org_id, name, kind, base_unit, min_qty) select $1, 'حدّ الصفحة ' || g, 'fuel', 'L', 1 from generate_series(1, 201) as g", [S.org]), U.owner, { commit: true });
  const capped = (await asM('select public.stock_on_hand($1, null, 1000)', [W.general2])).value;
  const manyMoves = await item('كاز الحركات', 'fuel', 'L');
  await postedOpening(db, U.manager, W.general2, GO_LIVE, Array.from({ length: 201 }, () => ({ item: manyMoves, qty: 1, value: 1 })));
  const cappedMoves = (await asM('select public.item_moves_qty($1, $2, null, 1000)', [manyMoves, W.general2])).value;
  t.same([capped.rows.length, capped.next !== null, cappedMoves.rows.length, cappedMoves.next], [200, true, 200, '200'], 'الصفحة 200 صفّاً كحدّ أقصى ولو طُلب أكثر، والمؤشّر للصفحة الجاية');

  // ── قفل الفترة بالمعاينة (آخر شي: يقفل المنشأة) ─────────────────────────────────────────────────────────────────
  const lockedDraft = await transferDraft(db, U.manager, W.general, W.raw, '2026-10-26', [{ item: probeItem, qty: 1 }]);
  const openDraft = await transferDraft(db, U.manager, W.general, W.raw, '2026-10-27', [{ item: probeItem, qty: 1 }]);
  t.eq(shown(await call(db, U.owner, 'select public.set_period_lock($1)', ['2026-10-26'])), 'ok', 'المالك يقفل الفترة لحد 26/10');
  t.same(
    [codes(await previewOf('preview_transfer', lockedDraft.id)), codes(await previewOf('preview_transfer', openDraft.id)), shown(await postTransfer(db, U.manager, lockedDraft))],
    [['period_locked'], [], 'period_locked'],
    'المعاينة: يوم القفل نفسه period_locked واليوم بعده بلا مشكلة، والترحيل مثلها',
  );
}

/** سنة رقم التحويل = سنة تاريخ المستند (FOUNDATION ٥١٨): تحويل مؤرَّخ 30/12/2026 يترحّل يوم 3/1/2027 برقم TR-2026. */
async function newYear(t, db) {
  const N = await makeStockOrg(db, {
    name: 'مزرعة رأس السنة',
    id: (n) => `d7620000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    phone: (n) => `96477097620${String(n).padStart(2, '0')}`,
    goLive: '2026-12-27',
  });
  const fuel = await N.one(N.users.owner, "insert into public.items (name, kind, base_unit) values ('كاز السنة', 'fuel', 'L') returning id");
  await postedOpening(db, N.users.manager, N.W.general, '2026-12-27', [{ item: fuel, qty: 10, value: 100 }]);
  const moved = await postedTransfer(db, N.users.manager, N.W.general, N.W.raw, '2026-12-30', [{ item: fuel, qty: 1 }]);
  t.eq(moved.result.doc_no, 'TR-2026-0001', 'تحويل بتاريخ 30/12/2026 يترحّل 3/1/2027 برقم TR-2026-0001');
}
