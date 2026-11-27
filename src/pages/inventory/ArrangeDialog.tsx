import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { describeError, RejectedError } from '../../lib/errors';
import { fmtInt } from '../../lib/format';
import { t } from '../../lib/i18n';
import { loadSectionItems, setStoreOrder, type SectionItem, type StoreSectionKey } from '../../lib/repo/storeMarks';
import { useLoad } from '../../lib/useLoad';

// «رتّب» موادّ قسم بالسحب (0040، كلمة الزبون 2026-11-26: «انا ارتب المواد… نريد نحط الأساسيات بالبداية»، وكلمة المالك «يسوي سحب وادراج حسب ما
// يحب»): القسم كاملاً من store_section_items، والمادّة تُسحب بمقبضها بالإصبع أو الفأرة إلى مكانها (الصفوف تتبادل أماكنها أثناء السحب)، أو تُقدَّم
// وتُؤخَّر بسهمين (لوحة المفاتيح والقارئ الصوتيّ)، ثمّ «احفظ الترتيب»: set_store_order بشرط القائمة التي عُرضت. وorder_changed (رتّب غيره أو أُضيفت
// مادّة) يقرأ القسم من جديد ويُبقي ترتيبك لما بقي، وما أُضيف في آخره، ويقوله؛ والنتيجة المجهولة تُعاد بالطلب نفسه (الخادم يقبل الترتيب نفسه
// مرّة ثانية). وبهذا الترتيب تظهر بطاقات المخزن والرصيد اليوميّ معاً.

/** المادّة من مكان إلى مكان، وما بينهما يتزحزح. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

/** مكان الإصبع بين الصفوف: أوّل صفّ يقع منتصفه تحت الإصبع، وإلّا آخرها. */
export function indexAt(rows: readonly { top: number; bottom: number }[], y: number): number {
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row && y < (row.top + row.bottom) * 0.5) return index;
  }
  return Math.max(0, rows.length - 1);
}

/** ترتيبك على قائمة قُرئت من جديد: ما بقي منها بترتيبك، وما أُضيف في آخره بترتيب القراءة. */
export function reconcile(mine: readonly string[], fresh: readonly string[]): string[] {
  const live = new Set(fresh);
  const kept = mine.filter((id) => live.has(id));
  const seen = new Set(kept);
  return [...kept, ...fresh.filter((id) => !seen.has(id))];
}

const sameOrder = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((id, index) => id === b[index]);

const CHANGED = new Set(['order_changed', 'item_not_found', 'items_required']);

export function ArrangeDialog({ section, title, onClose, onSaved }: { section: StoreSectionKey; title: string; onClose: () => void; onSaved: () => void }) {
  const load = useCallback(() => loadSectionItems(section), [section]);
  const state = useLoad(load, section);
  /** ترتيبك والقائمة التي بُني عليها (ما رآه الخادم في آخر قراءة)، وأسماء كلّ مادّة قُرئت. */
  const [arranged, setArranged] = useState<{ ids: string[]; basis: string[]; read: unknown } | null>(null);
  const [names, setNames] = useState<ReadonlyMap<string, SectionItem>>(new Map());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);

  // كلّ قراءة جديدة: الأولى تبدأ الترتيب بها، وما بعدها (بعد رفض) تُبقي ترتيبك لما بقي. ضبط حالة من حالة أثناء الرسم بشرط يتوقّف.
  if (state.data !== null && arranged?.read !== state.data) {
    const fresh = state.data.items.map((item) => item.id);
    setArranged({ ids: arranged ? reconcile(arranged.ids, fresh) : fresh, basis: fresh, read: state.data });
    setNames(new Map([...names, ...state.data.items.map((item) => [item.id, item] as const)]));
  }
  const ids = arranged?.ids ?? [];
  const dirty = arranged !== null && !sameOrder(arranged.ids, arranged.basis);
  const locked = busy || state.loading;

  /** المادّة بمعرّفها إلى مكان: من الترتيب الحاليّ لا من رسم سابق (حركتا إصبع متتاليتان قبل الرسم لا تنقلان غيرها). */
  const moveTo = (id: string, to: number) => {
    if (locked) return;
    setFailure(null);
    setArranged((current) => {
      if (!current) return current;
      const from = current.ids.indexOf(id);
      return from < 0 || from === to ? current : { ...current, ids: moveItem(current.ids, from, to) };
    });
  };

  // السحب: المقبض يمسك الإصبع (setPointerCapture)، وكلّ حركة تضع المادّة حيث يقع الإصبع بين صفوف القائمة كما هي على الشاشة.
  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (locked) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(id);
  };
  const dragMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const list = listRef.current;
    if (dragging === null || !list) return;
    moveTo(dragging, indexAt(Array.from(list.children, (row) => row.getBoundingClientRect()), event.clientY));
  };
  const endDrag = () => setDragging(null);

  const save = async () => {
    if (!arranged || locked || (!dirty && !unknown)) return;
    setBusy(true);
    setFailure(null);
    try {
      await setStoreOrder(section, arranged.ids, arranged.basis);
      setUnknown(false);
      onSaved();
    } catch (problem) {
      if (problem instanceof RejectedError && CHANGED.has(problem.code)) {
        setUnknown(false);
        setFailure(problem.hint ?? t('arrange.changed', 'تغيّرت موادّ القسم من جهاز آخر: قُرئت من جديد وبقي ترتيبك، فراجعه ثمّ احفظ.'));
        state.retry();
      } else if (problem instanceof RejectedError) {
        setUnknown(false);
        setFailure(problem.hint ?? describeError(problem, 'write').title);
      } else {
        // لا نعرف إن حُفظ: الإعادة بالترتيب نفسه آمنة (الخادم يقبله مرّة ثانية).
        setUnknown(true);
        setFailure(t('arrange.unknown', 'لا نعرف إن حُفظ الترتيب: أعد المحاولة، ولن يتغيّر شيء غير ترتيبك.'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      dirty={dirty || unknown}
      locked={busy}
      title={t('arrange.title', 'رتّب «{section}»', { section: title })}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy} data-action="arrange-cancel">
            {t('arrange.cancel', 'تراجع')}
          </Button>
          <Button onClick={() => void save()} busy={busy} disabled={locked || (!dirty && !unknown)} data-action={unknown ? 'arrange-retry' : 'arrange-save'}>
            {unknown ? t('arrange.retry', 'أعد المحاولة') : t('arrange.save', 'احفظ الترتيب')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3" data-action="arrange-dialog" data-section={section}>
        <p className="text-sm text-ink-muted">
          {t('arrange.hint', 'اسحب المادّة من مقبضها إلى مكانها، أو قدّمها وأخّرها بالسهمين، ثمّ «احفظ الترتيب». بهذا الترتيب تظهر في البطاقات والرصيد اليوميّ.')}
        </p>
        {state.error && !arranged ? <LoadFailed what={t('arrange.what', 'موادّ القسم')} error={state.error} onRetry={state.retry} /> : null}
        {failure ? <Notice tone={unknown ? 'warning' : 'danger'} title={failure} /> : null}
        {!arranged ? (
          !state.error ? (
            <p role="status" className="text-sm text-ink-muted">
              {t('page.loading', 'جارٍ الفتح…')}
            </p>
          ) : null
        ) : ids.length === 0 ? (
          <p className="text-sm text-ink-muted" data-action="arrange-empty">
            {t('arrange.empty', 'لا موادّ في هذا القسم.')}
          </p>
        ) : (
          <ol ref={listRef} className="flex flex-col gap-2" data-action="arrange-list">
            {ids.map((id, index) => {
              const item = names.get(id);
              const name = item?.name ?? '';
              const held = dragging === id;
              return (
                <li
                  key={id}
                  className={`flex items-center gap-2 rounded-2xl border bg-surface-1 p-1 ${held ? 'border-line-strong shadow-soft' : 'border-line'}`}
                  data-action="arrange-row"
                  data-id={id}
                >
                  <button
                    type="button"
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-2 disabled:opacity-50"
                    // بلا صنف جديد (CSS الإقلاع محفوظ بالتثبيت المسبق): touch-action بالسطر نفسه، فالإصبع يسحب ولا يمرّر الصفحة.
                    style={{ touchAction: 'none', cursor: dragging === id ? 'grabbing' : 'grab' }}
                    aria-label={t('arrange.drag', 'اسحب «{name}»', { name })}
                    disabled={locked}
                    onPointerDown={(event) => startDrag(event, id)}
                    onPointerMove={dragMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    data-action="arrange-handle"
                  >
                    <GripVertical aria-hidden="true" className="size-5" />
                  </button>
                  <span className="shrink-0 px-2 text-center text-sm text-ink-muted tabular-nums" aria-hidden="true">
                    {fmtInt(index + 1)}
                  </span>
                  <span className="min-w-0 flex-1 font-medium" data-action="arrange-name">
                    {name}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<ArrowUp aria-hidden="true" className="size-4" />}
                    aria-label={t('arrange.up', 'قدّم «{name}»', { name })}
                    disabled={locked || index === 0}
                    onClick={() => moveTo(id, index - 1)}
                    data-action="arrange-up"
                    data-id={id}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<ArrowDown aria-hidden="true" className="size-4" />}
                    aria-label={t('arrange.down', 'أخّر «{name}»', { name })}
                    disabled={locked || index === ids.length - 1}
                    onClick={() => moveTo(id, index + 1)}
                    data-action="arrange-down"
                    data-id={id}
                  />
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Dialog>
  );
}
