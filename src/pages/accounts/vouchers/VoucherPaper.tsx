import type { ReactNode } from 'react';
import { Num } from '../../../components/ui/DataTable';
import { amountInWords } from '../../../domain/amountWords';
import type { Day } from '../../../domain/dates';
import type { Fils } from '../../../domain/money';
import { fmtDay } from '../../../lib/format';
import { t } from '../../../lib/i18n';
import type { VoidMark } from '../../../lib/repo/statement';
import { moneyText, postedDay, Signatures, VoidStamp } from '../papers';

// ورقة السند (عقد 0024 F5، الخطّة §9.2): A5 برأس المنشأة واسم السند ورقمه وتاريخه، والمبلغ بالأرقام والكلمات، وما بين ذلك سطور
// «العنوان: القيمة» يملؤها السند، والتواقيع أسفلها؛ والملغى بختم «ملغى» وتاريخه وسببه. بطاقة على الشاشة، وبالطباعة بلا إطار.

/** سطر «العنوان: القيمة» في السند. */
export function VoucherLine({ label, action, children }: { label: string; action: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-line py-2" data-action={action}>
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="min-w-0 flex-1 font-medium">{children}</span>
    </div>
  );
}

export function VoucherPaper({
  orgName,
  title,
  docNo,
  onDate,
  amount,
  voided,
  postedBy,
  postedAt,
  lead,
  children,
}: {
  orgName: string;
  title: string;
  /** رقم السند، أو null (سند التحويل بلا رقم: الترقيم مؤجّل، العقد §1). */
  docNo: string | null;
  onDate: Day;
  amount: Fils;
  voided: VoidMark | null;
  postedBy: string | null;
  postedAt: string;
  /** السطور قبل المبلغ (الجهة، أو الصندوقان). */
  lead: ReactNode;
  /** السطور بعد المبلغ كتابةً («وذلك عن»، وطريقة الدفع، والحساب). */
  children: ReactNode;
}) {
  return (
    <article className="card mx-auto flex w-full max-w-xl flex-col gap-3 p-4 sm:p-6" data-paper data-action="voucher-paper">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4" data-keep>
        <p className="text-lg font-semibold" data-action="org-name">
          {orgName}
        </p>
        <div className="flex flex-col items-end gap-0.5">
          <h2 className="text-2xl font-semibold" data-action="voucher-title">
            {title}
          </h2>
          {docNo ? (
            <p className="text-sm" data-action="voucher-no">
              {t('voucher.no', 'رقم:')} <Num>{docNo}</Num>
            </p>
          ) : null}
          <p className="text-sm" data-action="voucher-date">
            {t('voucher.date', 'التاريخ:')} <Num>{fmtDay(onDate)}</Num>
          </p>
        </div>
      </header>
      {voided ? <VoidStamp onDate={voided.onDate} reason={voided.reason} by={voided.by} /> : null}
      {lead}
      <VoucherLine label={t('voucher.amount', 'مبلغاً قدره:')} action="voucher-amount">
        {t('voucher.amount.value', '{amount} دينار', { amount: moneyText(amount) })}
      </VoucherLine>
      <p className="rounded-2xl border border-line px-3 py-2 font-semibold" data-action="voucher-words">
        {amountInWords(amount)}
      </p>
      {children}
      <p className="text-xs text-ink-muted" data-action="voucher-posted">
        {postedBy
          ? t('voucher.posted_by', 'سجّله {by} يوم {day}.', { by: postedBy, day: fmtDay(postedDay(postedAt)) })
          : t('voucher.posted', 'سُجّل يوم {day}.', { day: fmtDay(postedDay(postedAt)) })}
      </p>
      <Signatures roles={[t('voucher.sign.receiver', 'المستلم'), t('voucher.sign.cashier', 'أمين الصندوق'), t('voucher.sign.accountant', 'المحاسب')]} />
    </article>
  );
}
