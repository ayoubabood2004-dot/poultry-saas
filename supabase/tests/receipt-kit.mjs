// أدوات مشتركة لفحوص الاستلام (WP6: receipts.test وgolden.test وstock-concurrency.test وcost-leak.test وproperty.test v4): مسوّدة
// استلام بالكتابة المباشرة (الأمين: الرأس والسطور، §2.5)، وتسعيرها بجداول المبالغ (أدوار الكلفة)، وترحيلها وإلغاؤها ومعاينتها بدوالّها
// الحقيقية. مو ملف فحص (ما ينتهي بـ.test.mjs).
import { call, uid } from './ledger-kit.mjs';

/**
 * مسوّدة استلام بسطورها (المستخدم بكتابة مباشرة): lines = [{ item, qty, unit?, code?, expiry?, bornAt?, lotNo? }]. يرجّع
 * { id, version, lines }.
 */
export async function receiptDraft(db, user, { wh, party, on, lines }) {
  return db.asUser(
    user,
    async (q) => {
      const docId = (await q('insert into public.receipts (party_id, warehouse_id, received_on) values ($1, $2, $3) returning id', [party, wh, on])).rows[0].id;
      const ids = [];
      for (const line of lines) {
        ids.push(
          (await q('insert into public.receipt_lines (doc_id, item_id, qty_in_unit, item_unit_id, unit_code, expiry_on, born_at, supplier_lot_no) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id', [
            docId, line.item, line.qty, line.unit ?? null, line.code ?? null, line.expiry ?? null, line.bornAt ?? null, line.lotNo ?? null,
          ])).rows[0].id,
        );
      }
      return { id: docId, version: (await q('select version from public.receipts where id = $1', [docId])).rows[0].version, lines: ids };
    },
    { commit: true },
  );
}

/**
 * التسعير (أدوار الكلفة بكتابة مباشرة): totals مبلغ كل سطر بترتيبه ({ total, zeroReason? } أو رقم)، وdiscount وpaid وbox، وcharges
 * [{ label, amount, by: 'mass'|'value', payee?, box?, lines?: [مؤشّرات السطور] }] (lines تمرّ من set_charge_lines). يرجّع النسخة.
 */
export async function priceReceipt(db, user, doc, { totals = [], discount = 0, paid = 0, box = null, charges = [] }) {
  return db.asUser(
    user,
    async (q) => {
      for (const [i, entry] of totals.entries()) {
        const { total, zeroReason = null } = typeof entry === 'object' ? entry : { total: entry };
        await q('insert into public.receipt_line_amounts (line_id, line_total, zero_reason) values ($1, $2, $3)', [doc.lines[i], total, zeroReason]);
      }
      if (discount || paid || box) {
        await q('insert into public.receipt_amounts (doc_id, discount, paid_now, cash_account_id) values ($1, $2, $3, $4)', [doc.id, discount, paid, box]);
      }
      for (const charge of charges) {
        const chargeId = (
          await q('insert into public.receipt_charges (doc_id, label, amount, allocate_by, payee_party_id, cash_account_id) values ($1, $2, $3, $4, $5, $6) returning id', [
            doc.id, charge.label, charge.amount, charge.by, charge.payee ?? null, charge.box ?? null,
          ])
        ).rows[0].id;
        if (charge.lines) {
          const version = (await q('select version from public.receipts where id = $1', [doc.id])).rows[0].version;
          await q('select public.set_charge_lines($1, $2, $3)', [chargeId, charge.lines.map((i) => doc.lines[i]), version]);
        }
      }
      return (await q('select version from public.receipts where id = $1', [doc.id])).rows[0].version;
    },
    { commit: true },
  );
}

export const previewReceipt = (db, user, docId) => call(db, user, 'select public.preview_receipt($1)', [docId]);
export const postReceipt = (db, user, docId, version, ref = uid()) => call(db, user, 'select public.post_receipt($1, $2, $3)', [docId, version, ref]);
export const voidReceipt = (db, user, docId, reason = 'استلام خاطئ', ref = uid()) => call(db, user, 'select public.void_receipt($1, $2, $3)', [docId, reason, ref]);

/** مسوّدة مسعَّرة ومرحَّلة بخطوة وحدة (يرمي إذا ما انرحّلت): { id, version, lines, result }. */
export async function postedReceipt(db, { keeper, pricer, wh, party, on, lines, ...amounts }) {
  const doc = await receiptDraft(db, keeper, { wh, party, on, lines });
  const version = await priceReceipt(db, pricer, doc, amounts);
  const result = await postReceipt(db, pricer, doc.id, version);
  if (!result.ok) throw new Error(`استلام ما انرحّل: ${result.code} ${result.hint}`);
  return { ...doc, version, result: result.value };
}

/** قيم دفعات استلام بترتيب سطوره: [{ qty_in, value_in }] نصوصاً بلا أصفار زائدة. */
export async function receiptLots(db, docId) {
  return (
    await db.admin(
      `select trim_scale(l.qty_in)::text as qty, trim_scale(l.value_in)::text as value from public.stock_lots l
       join public.receipt_lines x on x.id = l.source_line_id where l.source_kind = 'receipt' and l.source_id = $1 order by x.line_no`,
      [docId],
    )
  ).rows.map((r) => [r.qty, r.value]);
}
