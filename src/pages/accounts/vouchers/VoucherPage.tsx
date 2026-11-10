import { Printer } from 'lucide-react';
import { useCallback } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { Button } from '../../../components/ui/Button';
import { LoadFailed } from '../../../components/ui/LoadFailed';
import { Notice } from '../../../components/ui/Notice';
import { describeError, NotConnectedError } from '../../../lib/errors';
import { fmtDay, fmtPhone } from '../../../lib/format';
import { t } from '../../../lib/i18n';
import type { CashBox, VoucherDetail } from '../../../lib/repo/statement';
import * as statements from '../../../lib/repo/statement';
import { useLoad } from '../../../lib/useLoad';
import { BackLink, backTarget, DocText, moneyText, PageStyle, printAs } from '../papers';
import { bookLabel, cashKindLabel, entryKindLabel } from '../shared';
import { allocationLink } from '../statement/text';
import { VoucherLine, VoucherPaper } from './VoucherPaper';

// سند القبض (RC) وسند الصرف (PY) (عقد 0024 F5 و§4.5، الخطّة §9.2): «استلمنا من السيّد» أو «دفعنا إلى السيّد»، والمبلغ بالأرقام والكلمات،
// و«وذلك عن» ما سدّده من التوزيع القائم وما بقي بلا تخصيص، وطريقة الدفع بصندوقها، والتواقيع؛ يُطبع A5. وقيد الإلغاء يفتح سنده الأصلي
// (الخادم يحلّه) بختم «ملغى» وتاريخه وسببه، وتوزيعه فارغ لأنّ الإلغاء فكّه. الرجوع إلى ?back= وإلّا كشف الجهة.

/** طريقة الدفع بنوع الصندوق: نقداً في الصندوق أو منه، وإيداعاً في المصرف أو تحويلاً منه، والمحفظة. */
export function methodText(type: VoucherDetail['type'], box: CashBox): string {
  const vars = { box: box.name, kind: cashKindLabel(box.kind) };
  if (type === 'receipt') {
    if (box.kind === 'bank') return t('voucher.method.in.bank', 'إيداعاً في «{box}» ({kind})', vars);
    if (box.kind === 'wallet') return t('voucher.method.in.wallet', 'في المحفظة «{box}»', vars);
    return t('voucher.method.in.cash', 'نقداً في صندوق «{box}»', vars);
  }
  if (box.kind === 'bank') return t('voucher.method.out.bank', 'تحويلاً من «{box}» ({kind})', vars);
  if (box.kind === 'wallet') return t('voucher.method.out.wallet', 'من المحفظة «{box}»', vars);
  return t('voucher.method.out.cash', 'نقداً من صندوق «{box}»', vars);
}

/**
 * «وذلك عن»: المستندات التي سدّدها السند بمبالغها وتواريخها، وما بقي منه بلا تخصيص. الحركة بلا رقم (الرصيد عند البداية) باسم نوعها
 * وحده، فتاريخها يُذكر مرّة واحدة («تسديد الرصيد عند البداية بتاريخ 26/09/2026»، مراجعة 0024 L3).
 */
export function VoucherFor({ voucher, back }: { voucher: VoucherDetail; back: string }) {
  const rest =
    voucher.unallocated > 0n
      ? voucher.type === 'receipt'
        ? t('voucher.rest.receipt', 'ومبلغ {amount} دفعة مقدّمة تبقى رصيداً للجهة.', { amount: moneyText(voucher.unallocated) })
        : t('voucher.rest.payment', 'ومبلغ {amount} دفعة مقدّمة للجهة لم تُخصَّص لفاتورة.', { amount: moneyText(voucher.unallocated) })
      : null;
  return (
    <VoucherLine label={t('voucher.for', 'وذلك عن:')} action="voucher-for">
      {voucher.allocations.length === 0 && !rest ? (
        voucher.void ? t('voucher.for.void', 'لا شيء: فكّ الإلغاء ما سدّده.') : t('voucher.for.none', 'دفعة بلا تخصيص.')
      ) : (
        <ul className="flex flex-col gap-0.5">
          {voucher.allocations.map((allocation) => {
            const href = allocationLink(allocation, back);
            const doc = <DocText text={allocation.docNo ?? entryKindLabel(allocation.kind)} />;
            return (
              <li key={allocation.entryId} data-action="voucher-allocation">
                {t('voucher.for.settle', 'تسديد')}{' '}
                {href ? (
                  <Link to={href} className="text-brand-700 hover:underline dark:text-brand-200">
                    {doc}
                  </Link>
                ) : (
                  doc
                )}{' '}
                {t('voucher.for.item', 'بتاريخ {day} ({amount})', { day: fmtDay(allocation.onDate), amount: moneyText(allocation.amount) })}
              </li>
            );
          })}
          {rest ? <li data-action="voucher-rest">{rest}</li> : null}
        </ul>
      )}
    </VoucherLine>
  );
}

export default function VoucherPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const load = useCallback(() => statements.loadVoucher(id), [id]);
  const voucher = useLoad(load, id);
  const data = voucher.data;
  const back = backTarget(new URLSearchParams(location.search).get('back'), data ? `/accounts/parties/${data.party.id}` : '/accounts/debts');
  const here = `${location.pathname}${location.search}`;
  const title = data ? (data.type === 'receipt' ? t('voucher.receipt', 'سند قبض') : t('voucher.payment', 'سند صرف')) : t('voucher.title', 'السند');
  const header = (
    <div data-print="hide">
      <PageHeader
        title={data ? t('voucher.heading', '{title} {doc}', { title, doc: data.docNo }) : title}
        subtitle={t('voucher.subtitle', 'يُطبع على ورقة A5 بالتواقيع.')}
        actions={
          data ? (
            <Button size="sm" variant="secondary" icon={<Printer aria-hidden="true" className="size-4" />} onClick={() => printAs(t('voucher.print.title', '{title} {doc} — {party}', { title, doc: data.docNo, party: data.party.name }))} data-action="print-voucher">
              {t('voucher.print', 'اطبع السند')}
            </Button>
          ) : undefined
        }
      />
    </div>
  );
  if (voucher.error instanceof NotConnectedError) {
    const { title: failed, detail } = describeError(voucher.error);
    return (
      <div className="flex flex-col gap-4">
        <BackLink to={back} label={t('paper.back', 'رجوع')} />
        {header}
        <Notice tone="info" title={failed}>
          {detail}
        </Notice>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4" data-print-area>
      <PageStyle size="A5" />
      <BackLink to={back} label={t('paper.back', 'رجوع')} />
      {header}
      {voucher.error ? (
        <LoadFailed what={t('voucher.what', 'السند')} error={voucher.error} onRetry={voucher.retry} />
      ) : !data ? (
        <p role="status" className="py-6 text-center text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <>
          <VoucherPaper
            orgName={data.orgName}
            title={title}
            docNo={data.docNo}
            onDate={data.onDate}
            amount={data.amount}
            voided={data.void}
            postedBy={data.postedBy}
            postedAt={data.postedAt}
            lead={
              <VoucherLine label={data.type === 'receipt' ? t('voucher.from', 'استلمنا من السيّد:') : t('voucher.to', 'دفعنا إلى السيّد:')} action="voucher-party">
                {data.party.name}
                {data.party.phone ? (
                  <>
                    {' — '}
                    <bdi dir="ltr">{fmtPhone(data.party.phone)}</bdi>
                  </>
                ) : null}
              </VoucherLine>
            }
          >
            <VoucherFor voucher={data} back={here} />
            <VoucherLine label={t('voucher.method', 'طريقة الدفع:')} action="voucher-method">
              {methodText(data.type, data.account)}
            </VoucherLine>
            <VoucherLine label={t('voucher.book', 'الحساب:')} action="voucher-book">
              {bookLabel(data.book)}
            </VoucherLine>
          </VoucherPaper>
          <div className="flex flex-wrap gap-2" data-print="hide">
            <Link to={`/accounts/parties/${data.party.id}?book=${encodeURIComponent(data.book.id)}`} className="inline-flex h-9 items-center rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-surface-2" data-action="open-statement">
              {t('voucher.statement', 'كشف «{party}»', { party: data.party.name })}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
