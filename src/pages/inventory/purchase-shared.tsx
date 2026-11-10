import { useCallback, useDeferredValue, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { MoneyText } from '../../components/ui/MoneyText';
import { Notice } from '../../components/ui/Notice';
import { decimalText, parseDecimal, toScale } from '../../domain/decimal';
import type { Fils } from '../../domain/money';
import { toWesternDigits } from '../../domain/normalize';
import { can } from '../../domain/permissions';
import { describeError } from '../../lib/errors';
import { t } from '../../lib/i18n';
import * as purchasing from '../../lib/repo/purchasing';
import type { BoxPick, PartyPick } from '../../lib/repo/purchasing';
import { useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';

// حقول مال الشراء (الاستلام ومرتجعه وتصحيح سعره): كلها دنانير صحيحة (Q7). بحزمة شاشات المخزون، وشاشاتها ما تستورد حزمة الحسابات.

/** المبلغ بالدينار الصحيح من نصّ الحقل بالفلس، أو null (Q7: مبالغ الاستلام كلها دنانير صحيحة، والسالب مو مبلغ). */
export function parseDinar(text: string): Fils | null {
  const value = parseDecimal(text, 0);
  return value === null || value.units < 0n ? null : toScale(value, 2);
}

/** نصّ الحقل لمبلغ محفوظ بالدينار الصحيح («2350000»). */
export const dinarText = (amount: Fils): string => decimalText(amount / 100n, 0);

/**
 * حقل مبلغ بالدينار الصحيح (مثل MoneyInput، بلا استيراده: حزمته بحزمة الحسابات ويكبّر التثبيت المسبق): الأرقام الشرقية غربية لحظة
 * الكتابة، والقراءة تحته بفواصلها حتى «0,5» ما تمرّ 5 بصمت.
 */
export function AmountField({ id, label, value, onChange, hint }: { id: string; label: string; value: string; onChange: (text: string) => void; hint?: string }) {
  const amount = parseDinar(value);
  const problem = value.trim() !== '' && amount === null ? t('money.input.whole', 'اكتب المبلغ بالدينار الصحيح دون كسور، والفاصلة بين كل ثلاثة أرقام فقط (1,250,000).') : null;
  return (
    <Field id={id} label={label} error={problem} hint={amount !== null ? undefined : hint}>
      <input id={id} inputMode="decimal" autoComplete="off" dir="ltr" className="input text-end tabular-nums" value={value} aria-invalid={problem !== null || undefined} onChange={(event) => onChange(toWesternDigits(event.target.value))} />
      {amount !== null ? (
        <span className="text-sm text-ink-muted">
          = <MoneyText amount={amount} decimals={0} />
        </span>
      ) : null}
    </Field>
  );
}

/**
 * منتقي المورّد: بحث بالاسم (أوّل 20 ويّا العدد)، و«مورّد جديد» لمن يضيف الجهات بعد تنبيه التوائم (Q1، Q2). مشترك بين ورقة الاستلام
 * ونافذة «سجّل شراء» في ملفّ المادّة (0017)، فلا نسختان من البحث ولا من طريق إضافة المورّد. وcustomer لنافذة «بِع» (0021): الجهة الجديدة زبون.
 * والإضافة بـparty.create للمورّد والزبون معاً (0024، المهمّة #58، جواب المالك 2026-11-08: الأمين يضيف الزبون بنفسه)، والخادم يحكم
 * (parties_check: غير المدير يضيف زبوناً أو مورّداً).
 */
export function SupplierPicker({ id, label, value, onChange, customer = false }: { id: string; label: string; value: PartyPick | null; onChange: (party: PartyPick | null) => void; customer?: boolean }) {
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search);
  const load = useCallback(() => purchasing.searchSuppliers(deferred), [deferred]);
  const found = useLoad(load, deferred);
  const session = useSession();
  const workspace = session.status === 'ready' ? session.workspace : null;
  const canCreate = workspace ? can(workspace.role, 'party.create') : false;
  const [twins, setTwins] = useState<string[] | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (value) {
    return (
      <Field id={id} label={label}>
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-line px-4 py-2">
          <span className="font-medium">{value.name}</span>
          <Button size="sm" variant="ghost" onClick={() => onChange(null)} data-action="change-party">
            {t('party.pick.change', 'غيّر')}
          </Button>
        </div>
      </Field>
    );
  }
  const create = () => {
    const name = search.trim();
    if (!name) return;
    setBusy(true);
    setFailure(null);
    (twins === null ? purchasing.supplierTwins(name) : Promise.resolve([]))
      .then((seen) => {
        if (seen.length > 0) {
          setTwins(seen);
          return undefined;
        }
        return (customer ? purchasing.createCustomer(name) : purchasing.createSupplier(name)).then(onChange);
      })
      .catch(setFailure)
      .finally(() => setBusy(false));
  };
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <div className="flex flex-col gap-2">
      <Field id={id} label={label}>
        <input id={id} type="search" className="input" autoComplete="off" value={search} onChange={(event) => { setSearch(event.target.value); setTwins(null); }} placeholder={t('party.pick.search', 'ابحث بالاسم')} />
      </Field>
      {found.error ? (
        <LoadFailed what={t('party.list', 'قائمة الجهات')} error={found.error} onRetry={found.retry} />
      ) : (
        <ul className="flex max-h-48 flex-col overflow-y-auto rounded-2xl border border-line">
          {(found.data?.parties ?? []).map((party) => (
            <li key={party.id}>
              <button type="button" className="w-full px-4 py-2 text-start hover:bg-surface-2" onClick={() => onChange(party)} data-action="pick-party">
                {party.name}
              </button>
            </li>
          ))}
          {found.data && found.data.parties.length === 0 ? <li className="px-4 py-2 text-sm text-ink-muted">{t('party.pick.empty', 'لا جهة بهذا الاسم.')}</li> : null}
        </ul>
      )}
      {twins && twins.length > 0 ? (
        <Notice
          tone="warning"
          title={
            customer
              ? t('sale.party.twins', 'يشبه اسماً موجوداً: {names}. اختره من القائمة، أو اضغط «أضف الجهة» مرّة أخرى إن كانت جهة أخرى.', { names: twins.join(t('list.separator', '، ')) })
              : t('receipt.supplier.twins', 'يشبه اسماً موجوداً: {names}. اختره من القائمة، أو اضغط «أضف المورّد» مرّة أخرى إن كان مورّداً آخر.', { names: twins.join(t('list.separator', '، ')) })
          }
        />
      ) : null}
      {failed ? <Notice tone="danger" title={failed.title}>{failed.detail}</Notice> : null}
      {canCreate && search.trim() ? (
        <Button size="sm" variant="secondary" busy={busy} onClick={create} data-action={customer ? 'create-party' : 'create-supplier'}>
          {customer ? t('sale.party.create', 'جهة جديدة: أضف «{name}»', { name: search.trim() }) : t('receipt.supplier.create', 'أضف المورّد «{name}»', { name: search.trim() })}
        </Button>
      ) : customer && !canCreate && search.trim() ? (
        <p className="text-sm text-ink-muted" data-action="party-create-hint">
          {t('sale.party.create_hint', 'الجهة الجديدة يضيفها أمين المخزن أو المحاسب أو المدير؛ اختر جهة من القائمة.')}
        </p>
      ) : null}
    </div>
  );
}

/** الصندوق الذي دُفع منه (الصناديق الفعّالة، ويقرؤها كلّ دور في المنشأة). */
export function BoxPicker({ id, label, boxes, value, onChange }: { id: string; label: string; boxes: readonly BoxPick[] | null; value: string; onChange: (id: string) => void }) {
  return (
    <Field id={id} label={label} hint={boxes !== null && boxes.length === 0 ? t('cash.pick.empty', 'لا صندوق فعّالاً بعد؛ أضفه من صفحة الصناديق.') : undefined}>
      <select id={id} className="input" value={value} onChange={(event) => onChange(event.target.value)} data-action="pick-box">
        <option value="">{t('cash.pick.none', 'اختر الصندوق')}</option>
        {(boxes ?? []).map((box) => (
          <option key={box.id} value={box.id}>
            {box.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
