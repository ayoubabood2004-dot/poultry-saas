// أدوات مشتركة لفحوص مرتجع المورّد وتصحيح السعر (WP7: returns.test وrole-matrix.test وproperty.test v5): مسوّدة مرتجع بالكتابة
// المباشرة (الأمين: الرأس والسطور، §2.5)، والمقبول بجدوله (أدوار الكلفة)، والترحيل والإلغاء والمعاينة بدوالّها الحقيقية؛ والتصحيح
// ومعاينته وإلغاؤه؛ وصرف مرحَّل يسحب من دفعة (للتصحيح بعد السحب). مو ملف فحص (ما ينتهي بـ.test.mjs).
import { call, uid } from './ledger-kit.mjs';

/** مسوّدة مرتجع بسطورها: lines = [{ receiptLine, qty }]. يرجّع { id, version, lines }. */
export async function returnDraft(db, user, { receipt, on, lines }) {
  return db.asUser(
    user,
    async (q) => {
      const docId = (await q('insert into public.supplier_returns (receipt_id, returned_on) values ($1, $2) returning id', [receipt, on])).rows[0].id;
      const ids = [];
      for (const line of lines) {
        ids.push((await q('insert into public.supplier_return_lines (doc_id, receipt_line_id, qty_base) values ($1, $2, $3) returning id', [docId, line.receiptLine, line.qty])).rows[0].id);
      }
      return { id: docId, version: (await q('select version from public.supplier_returns where id = $1', [docId])).rows[0].version, lines: ids };
    },
    { commit: true },
  );
}

/** المقبول لكل سطر بترتيبه (أدوار الكلفة بكتابة مباشرة). يرجّع النسخة. */
export async function creditReturn(db, user, doc, credits) {
  return db.asUser(
    user,
    async (q) => {
      for (const [i, credit] of credits.entries()) {
        await q('insert into public.supplier_return_line_amounts (line_id, credit_amount) values ($1, $2)', [doc.lines[i], credit]);
      }
      return (await q('select version from public.supplier_returns where id = $1', [doc.id])).rows[0].version;
    },
    { commit: true },
  );
}

export const previewReturn = (db, user, docId) => call(db, user, 'select public.preview_supplier_return($1)', [docId]);
/** الترحيل ببصمة معاينة تؤخذ قبله (أو بصمة معطاة: معاينة قديمة). */
export const postReturn = async (db, user, docId, version, ref = uid(), plan = undefined) => {
  const seen = plan === undefined ? ((await call(db, user, "select public.preview_supplier_return($1) ->> 'plan'", [docId])).value ?? null) : plan;
  return call(db, user, 'select public.post_supplier_return($1, $2, $3, $4)', [docId, version, seen, ref]);
};
export const voidReturn = (db, user, docId, reason = 'مرتجع خاطئ', ref = uid()) => call(db, user, 'select public.void_supplier_return($1, $2, $3)', [docId, reason, ref]);

/** مرتجع مسعَّر ومرحَّل بخطوة وحدة (يرمي إذا ما انرحّل). */
export async function postedReturn(db, { keeper, pricer, receipt, on, lines, credits }) {
  const doc = await returnDraft(db, keeper, { receipt, on, lines });
  const version = await creditReturn(db, pricer, doc, credits);
  const result = await postReturn(db, pricer, doc.id, version);
  if (!result.ok) throw new Error(`مرتجع ما انرحّل: ${result.code} ${result.hint}`);
  return { ...doc, version, result: result.value };
}

export const previewRevalue = (db, user, lineId, total) => call(db, user, 'select public.preview_receipt_revalue($1, $2)', [lineId, total]);
/** التصحيح ببصمة معاينة تؤخذ قبله (أو بصمة معطاة: معاينة قديمة). */
export const postRevalue = async (db, user, lineId, total, reason = 'فاتورة مصحّحة من المورّد', ref = uid(), plan = undefined) => {
  const seen = plan === undefined ? ((await call(db, user, "select public.preview_receipt_revalue($1, $2) ->> 'plan'", [lineId, total])).value ?? null) : plan;
  return call(db, user, 'select public.post_receipt_revalue($1, $2, $3, $4, $5)', [lineId, total, seen, reason, ref]);
};
export const voidRevalue = (db, user, id, reason = 'تصحيح خاطئ', ref = uid()) => call(db, user, 'select public.void_receipt_revalue($1, $2, $3)', [id, reason, ref]);

/** صرف مرحَّل من مخزن بتصنيف (يسحب بالترتيب)؛ يرجّع { id, docNo }. */
export async function postedUse(db, user, { wh, category, on, item, qty }) {
  const doc = await db.asUser(
    user,
    async (q) => {
      const id = (await q('insert into public.stock_uses (warehouse_id, category_id, used_on) values ($1, $2, $3) returning id', [wh, category, on])).rows[0].id;
      await q('insert into public.stock_use_lines (doc_id, item_id, qty_in_unit) values ($1, $2, $3)', [id, item, qty]);
      return id;
    },
    { commit: true },
  );
  const result = await call(db, user, "select public.post_stock_use($1, (select version from public.stock_uses where id = $1), public.preview_stock_use($1) ->> 'plan', $2)", [doc, uid()]);
  if (!result.ok) throw new Error(`صرف ما انرحّل: ${result.code} ${result.hint}`);
  return { id: doc, docNo: result.value.doc_no };
}

export const voidUse = (db, user, docId, reason = 'صرف خاطئ') => call(db, user, 'select public.void_stock_use($1, $2, $3)', [docId, reason, uid()]);
