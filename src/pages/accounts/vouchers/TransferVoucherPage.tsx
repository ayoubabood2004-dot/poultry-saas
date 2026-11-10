import { Printer } from 'lucide-react';
import { useCallback } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { Button } from '../../../components/ui/Button';
import { LoadFailed } from '../../../components/ui/LoadFailed';
import { Notice } from '../../../components/ui/Notice';
import { describeError, NotConnectedError } from '../../../lib/errors';
import { fmtDay } from '../../../lib/format';
import { t } from '../../../lib/i18n';
import type { CashBox } from '../../../lib/repo/statement';
import * as statements from '../../../lib/repo/statement';
import { useLoad } from '../../../lib/useLoad';
import { BackLink, backTarget, PageStyle, printAs } from '../papers';
import { cashKindLabel } from '../shared';
import { VoucherLine, VoucherPaper } from './VoucherPaper';

// سند النقل بين الصناديق (عقد 0024 F5 و§4.6): من أيّ صندوق إلى أيّها، والمبلغ بالأرقام والكلمات، والبيان، والتواقيع؛ يُطبع A5. بلا رقم:
// ترقيم النقل يغيّر دالّة ترحيل فهو مؤجّل (العقد §1). والملغى بختم «ملغى». الرجوع إلى ?back= وإلّا كشف الصندوق المنقول منه. والكلمة
// «نقل» في كلّ مكان (اسم الصنف في حركة الأموال «نقل بين الصناديق»، مراجعة 0024 L8)، لا «تحويل».

const boxText = (box: CashBox): string => t('cashtr.box', 'صندوق «{name}» ({kind})', { name: box.name, kind: cashKindLabel(box.kind) });

export default function TransferVoucherPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const load = useCallback(() => statements.loadTransfer(id), [id]);
  const transfer = useLoad(load, id);
  const data = transfer.data;
  const back = backTarget(new URLSearchParams(location.search).get('back'), data ? `/accounts/cash/${data.from.id}` : '/accounts/debts');
  const title = t('cashtr.voucher', 'سند نقل بين الصناديق');
  const header = (
    <div data-print="hide">
      <PageHeader
        title={title}
        subtitle={t('cashtr.voucher.subtitle', 'بلا رقم بعد؛ يُطبع على ورقة A5 بالتواقيع.')}
        actions={
          data ? (
            <Button size="sm" variant="secondary" icon={<Printer aria-hidden="true" className="size-4" />} onClick={() => printAs(t('cashtr.print.title', '{title} — {day}', { title, day: fmtDay(data.onDate) }))} data-action="print-voucher">
              {t('voucher.print', 'اطبع السند')}
            </Button>
          ) : undefined
        }
      />
    </div>
  );
  if (transfer.error instanceof NotConnectedError) {
    const { title: failed, detail } = describeError(transfer.error);
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
      {transfer.error ? (
        <LoadFailed what={t('cashtr.what', 'سند النقل')} error={transfer.error} onRetry={transfer.retry} />
      ) : !data ? (
        <p role="status" className="py-6 text-center text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <>
          <VoucherPaper
            orgName={data.orgName}
            title={title}
            docNo={null}
            onDate={data.onDate}
            amount={data.amount}
            voided={data.void}
            postedBy={data.postedBy}
            postedAt={data.postedAt}
            lead={
              <>
                <VoucherLine label={t('cashtr.from', 'نُقل من:')} action="transfer-from">
                  {boxText(data.from)}
                </VoucherLine>
                <VoucherLine label={t('cashtr.to', 'إلى:')} action="transfer-to">
                  {boxText(data.to)}
                </VoucherLine>
              </>
            }
          >
            <VoucherLine label={t('cashtr.note', 'البيان:')} action="transfer-note">
              {data.note ?? t('cashtr.note.none', 'نقل بين الصناديق')}
            </VoucherLine>
          </VoucherPaper>
          <div className="flex flex-wrap gap-2" data-print="hide">
            {[data.from, data.to].map((box) => (
              <Link key={box.id} to={`/accounts/cash/${box.id}`} className="inline-flex h-9 items-center rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-surface-2" data-action="open-box">
                {t('cashtr.open_box', 'كشف «{name}»', { name: box.name })}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
