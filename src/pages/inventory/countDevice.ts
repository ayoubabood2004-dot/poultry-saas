import { decimalText } from '../../domain/decimal';
import { parseQty, type BaseUnit } from '../../domain/units';
import { listDeviceDrafts, removeDeviceDraft, saveDeviceDraft, type DeviceDraft, type DraftStamp } from '../../lib/drafts';
import { RejectedError, ZeroRowsError } from '../../lib/errors';
import { fmtQty } from '../../lib/format';
import { t } from '../../lib/i18n';
import type { CountLineFields } from '../../lib/repo/counts';

// سطور جرد ما وصلت الخادم (الخطّة WP5: «الحفظ يبقي المسوّدة لمّا تنقطع الشبكة»): السطر الجديد معرّفه يولد بالجهاز لحظة الإضافة
// (FOUNDATION ١٩٩)، فالإرسال اللي ينعاد بعد جواب ضاع يرجع 23505 على مفتاح الصفّ = انكتب (وتنكتب آخر قيمة فوقه)؛ والتعديل بمعرّف سطر
// الخادم. اللي ما وصل (بلا شبكة، أو جواب ضاع) ينحفظ بمسوّدة جهاز وحدة لكل (مستخدم، جرد) لحد «أرسل المحفوظ». القراءة والكتابة تحت
// قفل الجرد بكل نوافذ الجهاز (Web Locks، درس WP4: الفعل يقرا سجلّ الجهاز الحالي تحت القفل، مو لقطة الشاشة). الرفض الأكيد (الجرد
// سُلّم، أو السطر انحذف، أو المادّة معدودة بسطر ثاني) يشيل السطر من المحفوظ ويرجع بسببه حتى الشاشة تقوله، مو يضيع بصمت. ومراجعة
// WP5: 23505 على مفتاح ثاني (المادّة معدودة) كان ينقرا «انكتب» فيعلق المحفوظ للأبد؛ ومفتاح المسوّدة كان للجرد بس فمستخدمان بجهاز واحد
// يمسحان محفوظ بعض. والمراجعة الثانية: الكتابة أونلاين نفسها تحت القفل، والجمع مشروط بالقيمة اللي انحسب منها، والمرفوض يرجع حتى لو
// وقف الإرسال بعده، و«امسح المحفوظ» يمسح اللي انعرض بس. والمراجعة الثالثة: عدّ ثاني لمادّة إلها محفوظ ما وصل (رفّ ثاني بلا نت)
// ينجمع على المحفوظ نفسه (كان يوقف «أرسل المحفوظ أوّلاً» والإرسال ممتنع بلا نت)، والجمع يحفظ اللي أضافه العادّ (ينقال لو انرفض)
// ويكتب على سطر الخادم الكميات والتواريخ المكتوبة الآن بس، والتسليم يقرا المحفوظ تحت القفل (نافذة ثانية ممكن حفظت بعد العرض).

export interface PendingCountLine {
  /** معرّف السطر: مولود بالجهاز للجديد، أو معرّف سطر الخادم للتعديل (existing). */
  id: string;
  existing: boolean;
  itemName: string;
  baseUnit: BaseUnit;
  /** القيم اللي تنكتب (المجموع للجمع). */
  fields: CountLineFields;
  /** الجمع على سطر الخادم: التعديل بس إذا السطر بعده بالقيمة اللي انحسب منها، وإلا رفض أكيد بلا ما يمسح عدّاً أحدث. */
  expected?: CountExpected;
  /** الجمع على سطر الخادم: اللي أضافه العادّ (مجموع إضافاته)، ينعرض لو انرفض، وتواريخه المكتوبة بس تنكتب. */
  added?: CountLineFields;
}

export type CountExpected = Pick<CountLineFields, 'counted_qty' | 'counted_expired_qty'>;

export interface CountPendingPayload {
  docId: string;
  lines: PendingCountLine[];
}

/**
 * عدّ جديد لمادّة معدودة من قبل (رفّان بنفس المادّة، مراجعة WP5): يُضاف للعدّ السابق، والتواريخ ووقت الفقس الجديدة تغلب إن كُتبت.
 * السطر الثاني بنفس المادّة يرفضه الخادم (item_already_counted).
 */
export function mergeCountFields(before: CountLineFields, added: CountLineFields): CountLineFields {
  const sum = (a: string | null, b: string | null): string | null => (a === null && b === null ? null : decimalText((parseQty(a ?? '0') ?? 0n) + (parseQty(b ?? '0') ?? 0n), 3));
  return {
    item_id: before.item_id,
    counted_qty: sum(before.counted_qty, added.counted_qty) ?? '0.000',
    counted_expired_qty: sum(before.counted_expired_qty, added.counted_expired_qty),
    gain_expiry_on: added.gain_expiry_on ?? before.gain_expiry_on,
    gain_expired_expiry_on: added.gain_expired_expiry_on ?? before.gain_expired_expiry_on,
    gain_born_at: added.gain_born_at ?? before.gain_born_at,
  };
}

/** كمية العدّ كما تُعرض: الصالح والمنتهي لمادّة تتابع الانتهاء، والعدد لغيرها. */
export function countAmountText(fields: CountExpected, unit: BaseUnit): string {
  const qty = (text: string | null): string => fmtQty(parseQty(text ?? '0') ?? 0n, unit).main;
  return fields.counted_expired_qty !== null
    ? t('count.line.both', 'صالح {valid}، منتهٍ {expired}', { valid: qty(fields.counted_qty), expired: qty(fields.counted_expired_qty) })
    : qty(fields.counted_qty);
}

/** العدّ المحفوظ كما يُعرض: المادّة والمجموع، واللي أضافه العادّ للجمع على سطر الخادم. */
export function pendingText(line: PendingCountLine): string {
  const total = countAmountText(line.fields, line.baseUnit);
  return line.added
    ? t('count.pending.merge', '«{item}»: {total} (أُضيف {added})', { item: line.itemName, total, added: countAmountText(line.added, line.baseUnit) })
    : t('count.pending.line', '«{item}»: {qty}', { item: line.itemName, qty: total });
}

export const pendingDraftId = (userId: string, docId: string): string => `count:${userId}:${docId}`;

/** السطر بالمحفوظ: نفس المعرّف يتبدّل بآخر قيمة، والجديد بالآخر. */
export function withPending(lines: readonly PendingCountLine[], line: PendingCountLine): PendingCountLine[] {
  return [...lines.filter((other) => other.id !== line.id), line];
}

export interface PendingStore {
  read: () => Promise<DeviceDraft<CountPendingPayload> | null>;
  /** يحفظ السطور الباقية، أو يشيل المسوّدة إذا فرغت. */
  write: (lines: readonly PendingCountLine[]) => Promise<void>;
}

export type CountLinePatch = Partial<Omit<CountLineFields, 'item_id'>>;

export interface PendingSend {
  add: (docId: string, id: string, fields: CountLineFields) => Promise<unknown>;
  update: (id: string, patch: CountLinePatch, expected?: CountExpected) => Promise<unknown>;
}

/** حقول تعديل السطر: بلا المادّة (ثابتة، والمنح بلاها من مراجعة WP5، فإرسالها يرجع 42501). */
export const countLinePatch = (fields: CountLineFields): Omit<CountLineFields, 'item_id'> => ({
  counted_qty: fields.counted_qty,
  counted_expired_qty: fields.counted_expired_qty,
  gain_expiry_on: fields.gain_expiry_on,
  gain_expired_expiry_on: fields.gain_expired_expiry_on,
  gain_born_at: fields.gain_born_at,
});

/**
 * تعديل السطر كما ينرسل: الجمع على سطر الخادم يكتب المجموع والتواريخ اللي كتبها العادّ الآن بس (تاريخ قديم من الشاشة كان يرجّع تعديل
 * تاريخ من جهاز ثاني، المراجعة الثالثة)، وغيره القيم كلّها.
 */
export function linePatch(line: PendingCountLine): CountLinePatch {
  if (!(line.added && line.expected)) return countLinePatch(line.fields);
  const patch: CountLinePatch = { counted_qty: line.fields.counted_qty, counted_expired_qty: line.fields.counted_expired_qty };
  if (line.added.gain_expiry_on !== null) patch.gain_expiry_on = line.fields.gain_expiry_on;
  if (line.added.gain_expired_expiry_on !== null) patch.gain_expired_expiry_on = line.fields.gain_expired_expiry_on;
  if (line.added.gain_born_at !== null) patch.gain_born_at = line.fields.gain_born_at;
  return patch;
}

/** 23505 على مفتاح الصفّ (المعرّف): نفس السطر انكتب بمحاولة جوابها ضاع. مفتاح ثاني (المادّة بالجرد) رفض أكيد. */
export function isOwnRetry(error: unknown): boolean {
  return error instanceof RejectedError && error.code === '23505' && (error.constraint === null || /_pkey$|_org_id_id_key$/u.test(error.constraint));
}

/** يرسل سطراً واحداً: الجديد إدراج (23505 بمعرّفه = انكتب من قبل، فتعديل بآخر قيمة)، والموجود تعديل (مشروط للجمع). */
export async function sendLine(docId: string, line: PendingCountLine, send: PendingSend): Promise<void> {
  if (line.existing) {
    await send.update(line.id, linePatch(line), line.expected);
    return;
  }
  try {
    await send.add(docId, line.id, line.fields);
  } catch (error) {
    if (!isOwnRetry(error)) throw error;
    await send.update(line.id, countLinePatch(line.fields));
  }
}

/** رفض أكيد: الخادم رجّع المعاملة برمز، أو صفر صفوف (السطر انحذف، أو تغيّر قبل الجمع، أو الجرد ما عاد مسوّدة فالسياسة تخفيه). */
const definite = (error: unknown): boolean => error instanceof RejectedError || error instanceof ZeroRowsError;

/**
 * يرسل المحفوظ بالترتيب: اللي وصل ينشال، والمرفوض رفضاً أكيداً ينشال ويرجع بسببه، وأوّل فشل غير أكيد (شبكة أو جواب ضاع) يوقف
 * الإرسال ويبقي الباقي (هو وبعده) ويرجع ويّا المرفوض قبله (failure)، مو يرمي فيضيع المرفوض.
 */
export async function sendPending(docId: string, store: PendingStore, send: PendingSend): Promise<{ sent: number; rejected: { line: PendingCountLine; error: unknown }[]; failure: unknown }> {
  const draft = await store.read();
  if (!draft) return { sent: 0, rejected: [], failure: null };
  let left = [...draft.payload.lines];
  const rejected: { line: PendingCountLine; error: unknown }[] = [];
  let sent = 0;
  for (const line of draft.payload.lines) {
    try {
      await sendLine(docId, line, send);
      sent += 1;
    } catch (error) {
      if (!definite(error)) {
        await store.write(left);
        return { sent, rejected, failure: error };
      }
      rejected.push({ line, error });
    }
    left = left.filter((other) => other.id !== line.id);
  }
  await store.write(left);
  return { sent, rejected, failure: null };
}

/** المحفوظ لجرد بختم المستخدم والمنشأة (IndexedDB)، بمفتاح المستخدم والجرد. */
export function devicePending(stamp: DraftStamp, docId: string, title: string): PendingStore {
  const id = pendingDraftId(stamp.userId, docId);
  return {
    read: async () => (await listDeviceDrafts<CountPendingPayload>(stamp, 'count')).find((draft) => draft.id === id) ?? null,
    write: async (lines) => {
      if (lines.length === 0) await removeDeviceDraft(id);
      else await saveDeviceDraft<CountPendingPayload>(stamp, { id, kind: 'count', title, payload: { docId, lines: [...lines] } });
    },
  };
}

/** عمل على محفوظ الجرد تحت قفله بكل نوافذ الجهاز (ينتظر نافذة ثانية تخلص)؛ بلا Web Locks بالنافذة بس. */
export async function underCountLock<T>(docId: string, work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return work();
  return locks.request(`count-pending:${docId}`, { mode: 'exclusive' }, () => work());
}

/** أساس العدّ المضاف كما شافته الشاشة لحظة التأكيد: لا شي (سطر جديد بهذا المعرّف)، أو عدّ محفوظ بالجهاز، أو سطر الخادم. */
export type CountBase = { kind: 'none'; id: string } | { kind: 'kept' | 'server'; id: string; fields: CountLineFields };

/**
 * تغيير على الجرد: set يكتب قيم سطر الخادم كما عدّلها العادّ؛ add يضيف عدّاً لمادّة على أساسه (الجمع على المحفوظ أو على سطر الخادم،
 * أو سطر جديد).
 */
export type CountChange = { kind: 'set'; line: PendingCountLine } | { kind: 'add'; itemName: string; baseUnit: BaseUnit; added: CountLineFields; base: CountBase };

const FIELD_KEYS = ['item_id', 'counted_qty', 'counted_expired_qty', 'gain_expiry_on', 'gain_expired_expiry_on', 'gain_born_at'] as const;
const sameFields = (a: CountLineFields, b: CountLineFields): boolean => FIELD_KEYS.every((key) => a[key] === b[key]);

/** السطر اللي ينكتب من التغيير على محفوظ الجهاز الآن، أو رفض محلّي (ما انرسل شي) لو المحفوظ تغيّر عن اللي شافته الشاشة. */
function resolveChange(kept: readonly PendingCountLine[], change: CountChange): PendingCountLine {
  if (change.kind === 'set') {
    // تعديل سطر الخادم وإله عدّ محفوظ ما وصل: المحفوظ أحدث من البطاقة، فالكتابة فوقه أو جنبه كانت تضيّعه.
    const waiting = kept.find((other) => other.id === change.line.id || other.fields.item_id === change.line.fields.item_id);
    if (waiting) throw new RejectedError('kept_first', t('count.kept_first', 'لـ«{item}» عدّ محفوظ بالجهاز لم يُرسل؛ أرسل المحفوظ أوّلاً، ثم عدّل.', { item: waiting.itemName }));
    return change.line;
  }
  const { added, base } = change;
  const waiting = kept.find((other) => other.fields.item_id === added.item_id);
  const matches = base.kind === 'kept' ? waiting?.id === base.id && sameFields(waiting.fields, base.fields) : !waiting;
  if (!matches) {
    throw new RejectedError(
      'count_changed',
      t('count.changed', 'تغيّر عدّ «{item}» المحفوظ بالجهاز قبل الإضافة (نافذة أخرى)؛ هذا عدّها الآن، فأضف عدّك ({qty}) من جديد.', { item: change.itemName, qty: countAmountText(added, change.baseUnit) }),
    );
  }
  if (base.kind === 'kept' && waiting) {
    return { ...waiting, fields: mergeCountFields(waiting.fields, added), added: waiting.added ? mergeCountFields(waiting.added, added) : undefined };
  }
  if (base.kind === 'server') {
    return {
      id: base.id,
      existing: true,
      itemName: change.itemName,
      baseUnit: change.baseUnit,
      fields: mergeCountFields(base.fields, added),
      expected: { counted_qty: base.fields.counted_qty, counted_expired_qty: base.fields.counted_expired_qty },
      added,
    };
  }
  return { id: base.id, existing: false, itemName: change.itemName, baseUnit: change.baseUnit, fields: added };
}

export type WriteOutcome = { kind: 'written' } | { kind: 'kept' } | { kind: 'dropped'; line: PendingCountLine; error: unknown };

/**
 * يكتب تغييراً أونلاين تحت قفل الجرد، واللي ما وصل (شبكة أو جواب ضاع) يبقى بالجهاز ('kept'). الجمع على عدّ محفوظ يكتب المجموع
 * ويشيله من الجهاز لو وصل، ولو انرفض رفضاً أكيداً ينشال مثل «أرسل المحفوظ» ويرجع بسببه ('dropped') حتى الشاشة تقوله بكميته (محفوظ
 * باقٍ على سطر تغيّر كان يرجع أساساً لكل جمع جاي فينرفض كلّ مرّة). وغيره الرفض الأكيد يطلع.
 */
export async function writeOrKeep(docId: string, store: PendingStore, change: CountChange, send: PendingSend): Promise<WriteOutcome> {
  return underCountLock(docId, async (): Promise<WriteOutcome> => {
    const kept = (await store.read())?.payload.lines ?? [];
    const line = resolveChange(kept, change);
    const wasKept = kept.some((other) => other.id === line.id);
    try {
      await sendLine(docId, line, send);
    } catch (error) {
      if (!definite(error)) {
        await store.write(withPending(kept, line));
        return { kind: 'kept' };
      }
      if (!wasKept) throw error;
      await store.write(kept.filter((other) => other.id !== line.id));
      return { kind: 'dropped', line, error };
    }
    if (wasKept) await store.write(kept.filter((other) => other.id !== line.id));
    return { kind: 'written' };
  });
}

/**
 * التسليم تحت قفل الجرد: عدّ محفوظ بالجهاز ما وصل (ولو حفظته نافذة ثانية بعد ما انقرت الشاشة) يوقفه، لأن الجرد المسلَّم ما يستقبله
 * (المراجعة الثالثة). وكتابة تنتظر القفل تكمل بعد التسليم فتنرفض not_draft وتنعرض.
 */
export async function submitUnlessKept<T>(docId: string, store: PendingStore, submit: () => Promise<T>): Promise<T> {
  return underCountLock(docId, async () => {
    const kept = (await store.read())?.payload.lines ?? [];
    if (kept.length > 0) {
      throw new RejectedError('kept_unsent', t('count.submit.kept', 'بالجهاز عدّ محفوظ لم يُرسل ({lines})؛ أرسله أوّلاً، ثم سلّم الجرد.', { lines: kept.map(pendingText).join(t('list.separator', '، ')) }));
    }
    return submit();
  });
}

/** يمسح من المحفوظ السطور اللي انعرضت وتأكّد مسحها بس (نافذة ثانية ممكن حفظت غيرها بعد العرض)، تحت القفل. */
export async function clearPending(store: PendingStore, docId: string, ids: readonly string[]): Promise<void> {
  await underCountLock(docId, async () => {
    const draft = await store.read();
    if (!draft) return;
    await store.write(draft.payload.lines.filter((line) => !ids.includes(line.id)));
  });
}
