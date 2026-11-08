import { useDeferredValue, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { searchable } from '../../domain/normalize';
import type { ItemKind } from '../../domain/stores';
import type { BaseUnit } from '../../domain/units';
import { describeError, RejectedError, UnknownOutcomeError } from '../../lib/errors';
import { t } from '../../lib/i18n';
import * as purchases from '../../lib/repo/purchases';
import type { OpIds, OverviewItem } from '../../lib/repo/purchases';
import { useLoad } from '../../lib/useLoad';
import { baseQty } from './simple-shared';

// أدوات نوافذ أفعال المادّة (كلمة المالك 2026-11-08: «بِع» و«حوّل» و«انقل» و«أكمل السعر»): كلّ نافذة نداء واحد يُحفظ فوراً بمعرّفات من الجهاز،
// فالنتيجة المجهولة (انقطع الاتصال بعد الإرسال) تُعاد بالنداء نفسه كما أُرسل لا بما في الحقول، ولا تُسجَّل مرّتين — مثل «سجّل شراء».

export interface OpItem {
  id: string;
  name: string;
  kind: ItemKind;
  baseUnit: BaseUnit;
}

/** نداء أُرسل ولم يُعرف جوابه، بما يُعرض عنه («المرسَل: …»): الإعادة به وحده حرفاً. */
export interface Pending<I> {
  input: I;
  summary: string;
}

/**
 * معرّفات النداء ونداؤه المعلَّق، في الصفحة لا في النافذة (مراجعة 0020، كدرس 0019 F10): إغلاق النافذة بعد نتيجة مجهولة ثمّ فتحها يعيدان النداء
 * نفسه بمعرّفاته، فلا يُسجَّل البيع أو التحويل أو النقل مرّتين بمعرّفين. معرّفات جديدة بعد الحفظ وحده (والرفض الأكيد يُصحَّح ويُعاد بها نفسها).
 */
export interface OpSession<I> {
  /** المادّة (أو مفتاح العملية) التي فُتحت لها: جلسة مادّة أخرى لا تُستعمل هنا. */
  key: string;
  ids: OpIds;
  pending: Pending<I> | null;
}

export function newSession<I>(key: string): OpSession<I> {
  return { key, ids: purchases.newOpIds(), pending: null };
}

/** الجلسة للمفتاح نفسه، أو جديدة. */
export function sessionFor<I>(current: OpSession<I> | null, key: string): OpSession<I> {
  return current && current.key === key ? current : newSession<I>(key);
}

export interface Lifted<I> {
  pending: Pending<I> | null;
  onPending: (pending: Pending<I> | null) => void;
}

/**
 * الإرسال بنداء واحد وإعادته: النتيجة المجهولة تبقى مجهولة ما لم يرفضها الخادم رفضاً أكيداً (55P03 خلف الأصل، أو انقطاع)، والرفض الأكيد
 * يعيد النافذة للتصحيح. onRefused يأخذ الرفض أوّلاً (store_required ← اختيار المخزن) ويرجّع true إن عالجه. والنداء المعلَّق في الصفحة إن
 * أُعطيت lifted (يبقى بعد إغلاق النافذة)، وإلّا في النافذة.
 */
export function useSend<I, R>(run: (input: I) => Promise<R>, onSaved: (result: R, input: I) => void, onRefused?: (error: RejectedError) => boolean, lifted?: Lifted<I>) {
  const [own, setOwn] = useState<Pending<I> | null>(null);
  const pending = lifted ? lifted.pending : own;
  const setPending = lifted ? lifted.onPending : setOwn;
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const send = async (input: I, summary: string) => {
    const retrying = pending !== null;
    const sent = pending ? pending.input : input;
    setBusy(true);
    setFailure(null);
    try {
      const result = await run(sent);
      setBusy(false);
      setPending(null);
      onSaved(result, sent);
    } catch (error) {
      setBusy(false);
      if (!retrying && error instanceof RejectedError && onRefused?.(error)) return;
      setFailure(error);
      const unknown = error instanceof UnknownOutcomeError || (retrying && !(error instanceof RejectedError));
      if (unknown && !retrying) setPending({ input, summary });
      else if (!unknown && retrying) setPending(null);
    }
  };
  return { state: { busy, failure, unknown: pending?.input ?? null }, pending, send };
}

/** شريط الصفحة لنداء معلَّق بعد إغلاق نافذته: «لم يُعرف إن حُفظ … — أعد المحاولة» يفتحها بالنداء نفسه. */
export function PendingBanner({ what, summary, onRetry, action }: { what: string; summary: string; onRetry: () => void; action: string }) {
  return (
    <Notice tone="warning" title={t('op.pending', 'لم يُعرف إن حُفظ {what} — أعد المحاولة', { what })}>
      <span className="flex flex-col items-start gap-2">
        <span>{summary}</span>
        <Button size="sm" variant="secondary" onClick={onRetry} data-action={action}>
          {t('purchase.retry', 'أعد المحاولة')}
        </Button>
      </span>
    </Notice>
  );
}

/** رسالة الفشل تحت النافذة: تلميح الخادم إن وُجد (يسمّي ما ينقص)، وإلّا الوصف العامّ. */
export function FailureNotice({ failure }: { failure: unknown }) {
  if (!failure) return null;
  const failed = describeError(failure);
  const hint = failure instanceof RejectedError ? failure.hint : null;
  return (
    <Notice tone="danger" title={hint ?? failed.title}>
      {hint ? null : failed.detail}
    </Notice>
  );
}

/** «لم يُعرف إن حُفظ» بعد نتيجة مجهولة: الإعادة ترسل النداء نفسه، ولن يُسجَّل مرّتين. */
export function UnknownNotice({ again }: { again: boolean }) {
  return (
    <Notice tone="warning" title={t('op.unknown', 'لم يُعرف إن حُفظ؛ أعد المحاولة')}>
      {t('op.unknown.detail', 'أُرسل ولم يصل الردّ. «أعد المحاولة» يرسله نفسه، ولن يُسجَّل مرّتين.')}
      {again ? (
        <span className="mt-1 block" data-action="op-retry-unknown">
          {t('op.unknown.again_kept', 'ولم تكتمل الإعادة أيضاً؛ أعد المحاولة بعد قليل. وإن أغلقت تبقى «أعد المحاولة» في الصفحة حتى يُعرف، فلا يُسجَّل مرّتين.')}
        </span>
      ) : null}
    </Notice>
  );
}

/**
 * اختيار مادّة ببطاقات وبحث (لـ«حوّل» إلى مادّة أخرى، و«بيع جديد»): كلّ المواد الفعّالة من items_overview بقراءة واحدة، والبحث بالاسم
 * المطبَّع بالجهاز، و«أضف مادّة جديدة» بالاسم المكتوب حين يُسمح (can_add_item). البحث بلا نتيجة يقول ذلك ولا يسكت.
 */
export function ItemPickCards({
  exclude,
  filter,
  onPick,
  onAdd,
  emptyHint,
}: {
  exclude?: string;
  filter?: (item: OverviewItem) => boolean;
  onPick: (item: OverviewItem) => void;
  onAdd?: (name: string) => void;
  emptyHint?: string;
}) {
  const overview = useLoad(purchases.loadItemsOverview);
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search);
  const needle = searchable(deferred);
  if (overview.error) return <LoadFailed what={t('board.what', 'قائمة المواد')} error={overview.error} onRetry={overview.retry} />;
  if (!overview.data) {
    return (
      <p role="status" className="text-sm text-ink-muted">
        {t('page.loading', 'جارٍ الفتح…')}
      </p>
    );
  }
  const pool = overview.data.items.filter((item) => item.id !== exclude && (!filter || filter(item)));
  const shown = needle ? pool.filter((item) => searchable(item.name).includes(needle)) : pool;
  const canAdd = onAdd !== undefined && overview.data.canAddItem;
  return (
    <div className="flex flex-col gap-3">
      <Field id="op-item-search" label={t('op.item.search', 'ابحث عن المادّة')}>
        <input id="op-item-search" type="search" className="input" autoComplete="off" value={search} onChange={(event) => setSearch(event.target.value)} data-action="op-item-search" />
      </Field>
      {shown.length ? (
        <ul className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          {shown.map((item) => (
            <li key={item.id} className="flex">
              <button type="button" className="flex w-full flex-col items-start gap-1 rounded-2xl border border-line p-3 text-start hover:bg-surface-2" onClick={() => onPick(item)} data-action="op-item-card" data-item={item.id}>
                <span className="font-semibold">{item.name}</span>
                <span className="text-xs text-ink-muted">{t('mill.on_hand', 'عندك: {qty}', { qty: baseQty(item.onHand, item.baseUnit) })}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted" data-action="op-item-none">
          {needle ? t('op.item.none', 'لا مادّة باسم «{name}».', { name: search.trim() }) : (emptyHint ?? t('op.item.empty', 'لا مواد بعد.'))}
        </p>
      )}
      {canAdd && search.trim() ? (
        <Button variant="secondary" size="sm" className="self-start" onClick={() => onAdd(search.trim())} data-action="op-item-add">
          {t('op.item.add', 'أضف مادّة جديدة «{name}»', { name: search.trim() })}
        </Button>
      ) : canAdd ? (
        <Button variant="secondary" size="sm" className="self-start" onClick={() => onAdd('')} data-action="op-item-add">
          {t('op.item.add_new', 'أضف مادّة جديدة')}
        </Button>
      ) : null}
    </div>
  );
}
