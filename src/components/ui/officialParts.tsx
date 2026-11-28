import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { localDay } from '../../domain/dates';
import { fmtDay, fmtInt } from '../../lib/format';
import { t, Trans } from '../../lib/i18n';
import { wideStore } from '../../lib/wide';
import { Num } from './DataTable';

// التقرير الرسميّ «مثل تقارير المستشفيات» (عقد 0036 S1، كلمة المالك 2026-11-24): رأسٌ باسم المنشأة وعنوان التقرير وشبكة بيانات بمربّعات، وأشرطة أقسام
// ملوّنة، وجداول DataTable الرسمية، وتذييلٌ بـ«أعدّه» و«طُبع في» وسطرَي «المسؤول» و«التوقيع». القطع هنا بلا أنماط؛ وأنماطها official.css الكسول يحملها
// حاملٌ في كلّ حزمة تستعملها: OfficialReport.tsx في حزمة القاعات (تقرير الوجبة والتقرير اليوميّ و«منذ أن بدأنا» وورقة القاعة)، وdayReport.css في حزمة
// المخزون («الرصيد اليوميّ»، رسالة الزبون 2026-11-26: «ترتيب رسمي مثل باقي السستم»). فهذه الوحدة المشتركة بين الحزمتين (حزمة stores-admin) بلا CSS: لو
// استوردت official.css لخرج ملفّ CSS باسمٍ لا يستثنيه التثبيت المسبق (قيس بالبناء: weighTickets-*.css في sw.js). فحص official-tables G.

/** الصفحة عريضة ما دامت مركّبة (lib/wide.ts): القشرة تضع data-wide على <main>. */
export function useWidePage(): void {
  useEffect(() => {
    wideStore.set((count) => count + 1);
    return () => wideStore.set((count) => count - 1);
  }, []);
}

const pad = (n: number): string => `${n < 10 ? '0' : ''}${fmtInt(n)}`;
/** «09:05» بساعة الجهاز. */
const clockOf = (at: Date): string => `${pad(at.getHours())}:${pad(at.getMinutes())}`;

/** «24/11/2026 الساعة 09:05» بساعة الجهاز ويومه (localDay، لا يوم غرينتش). */
export function printedText(at: Date): string {
  return t('report.when', '{day} الساعة {time}', { day: fmtDay(localDay(at)), time: clockOf(at) });
}

/**
 * النصّ نفسه في مربّع «طُبع في» من شبكة البيانات: اليوم والوقت كلٌّ في Num (LTR معزول، وسطرٌ واحد في official.css)، فيلتفّ المربّع الضيّق بين الكلمات
 * ولا ينكسر التاريخ ولا الوقت (مراجعة 0036 R1).
 */
export function PrintedAt({ at }: { at: Date }) {
  return <Trans k="report.when" text="{day} الساعة {time}" vars={{ day: <Num>{fmtDay(localDay(at))}</Num>, time: <Num>{clockOf(at)}</Num> }} />;
}

/**
 * لحظة «طُبع في»: حين فُتحت الصفحة، وتتجدّد قبل كلّ طباعة (beforeprint: «اطبع» وCtrl+P معاً) وقبل الصورة (stamp). flushSync يكتبها في الصفحة قبل أن
 * تلتقطها الطباعة أو تنسخها الصورة: window.print() يطبع داخل ضغطة الزرّ، وتحديث React العاديّ ينتظر نهايتها.
 */
export function usePrintedAt(): { at: Date; stamp: () => void } {
  const [at, setAt] = useState(() => new Date());
  const stamp = useCallback(() => flushSync(() => setAt(new Date())), []);
  useEffect(() => {
    window.addEventListener('beforeprint', stamp);
    return () => window.removeEventListener('beforeprint', stamp);
  }, [stamp]);
  return { at, stamp };
}

/** مربّع في شبكة البيانات: عنوانه وقيمته (الأرقام من منسّقات format.ts، وما هو رقم أو تاريخ وحده داخل Num). */
export interface InfoItem {
  key: string;
  label: string;
  value: ReactNode;
}

/** أعمدة شبكة البيانات من 640 (--ofc-cols): خمسة مربّعات فأقلّ صفٌّ واحد، وأكثر منها صفّان ممتلئان (ثمانية: أربعة وأربعة). */
export const infoColumns = (count: number): number => (count <= 5 ? Math.max(count, 1) : Math.ceil(count / 2));

/**
 * رأس التقرير: اسم المنشأة (من مساحة العمل في الجلسة) ثمّ العنوان ثمّ ما يُمرَّر (سطر حالٍ إن وُجد) ثمّ شبكة البيانات. orgAction وtitleAction أسماء
 * data-action التي تعرفها الصفحة وفحوصها (rep-org/batch-title، day-org/day-title). والعنوان h1، أو h2 في تقريرٍ داخل صفحة لها عنوانها (الرصيد اليوميّ
 * تحت «المخزن»).
 */
export function ReportHeader({
  org,
  title,
  info,
  orgAction,
  titleAction,
  level = 1,
  children,
}: {
  org: string;
  title: string;
  info: readonly InfoItem[];
  orgAction: string;
  titleAction: string;
  level?: 1 | 2;
  children?: ReactNode;
}) {
  const columns = { '--ofc-cols': String(infoColumns(info.length)) } as CSSProperties;
  const Title = level === 1 ? 'h1' : 'h2';
  return (
    <header className="ofc-head" data-action="report-head">
      {org ? (
        <p className="ofc-org" data-action={orgAction}>
          {org}
        </p>
      ) : null}
      <Title className="ofc-title" data-action={titleAction}>
        {title}
      </Title>
      {children}
      {info.length ? (
        <dl className="ofc-info" style={columns} data-action="report-info">
          {info.map((item) => (
            <div key={item.key} data-info={item.key}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </header>
  );
}

/** شريط قسم ملوّن (عنوان القسم h2). */
export function SectionBar({ children, action }: { children: ReactNode; action?: string }) {
  return (
    <h2 className="ofc-bar" data-action={action}>
      {children}
    </h2>
  );
}

/** عنوان فرعيّ داخل قسم (h3): خطّ العلامة على جانب البداية فوق خلفية فاتحة. */
export function SubBar({ children }: { children: ReactNode }) {
  return <h3 className="ofc-subbar">{children}</h3>;
}

/** تذييل التقرير: «أعدّه: الاسم» و«طُبع في …»، ثمّ سطرا «المسؤول» و«التوقيع» يُكتبان باليد على الورقة. */
export function ReportFooter({ by, at }: { by: string; at: Date }) {
  return (
    <footer className="ofc-foot" data-action="report-foot">
      <div className="ofc-foot-line">
        {by ? <p data-action="report-by">{t('report.by', 'أعدّه: {name}', { name: by })}</p> : null}
        <p data-action="report-printed">{t('report.printed', 'طُبع في {when}', { when: printedText(at) })}</p>
      </div>
      <div className="ofc-sign" data-action="report-sign">
        <p>{t('report.sign.responsible', 'المسؤول: ………………………')}</p>
        <p>{t('report.sign.signature', 'التوقيع: ………………………')}</p>
      </div>
    </footer>
  );
}
