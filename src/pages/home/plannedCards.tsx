import { Bird, Drumstick, Egg, Wheat } from 'lucide-react';
import { countForm, fmtInt, fmtQty } from '../../lib/format';
import { t, Trans } from '../../lib/i18n';
import type { HomeSummary } from '../../lib/repo/home';
import type { CardSpec } from './HomePage';

// بطاقات الوحدات المخطّطة (حقول اللحم والبيض، وإنتاج المعمل ووجبات المفقس): أرقامها من شاشات المراحل 2–5 التي لم تُبنَ بعد،
// فالرئيسية لا تستوردها (لا تُعرض ولا تُحمَّل بحزمتها المحفوظة بالتثبيت المسبق). تبقى هنا بصيغ الفصحى المفحوصة (ui.test)
// حتى تعود إلى cardSpecs حين تُبنى وحدتها.

const TRAY = 30_000n;
// صيغ المعدود بعد رقم: «5 طبقات + 5 بيضات»، «12 طبقة + 15 بيضة»، «طبقة واحدة + بيضتان».
const eggForms = () => ({ one: t('unit.egg.one', 'بيضة واحدة'), two: t('unit.egg.two', 'بيضتان'), few: t('unit.egg.few', 'بيضات'), many: t('unit.egg.many', 'بيضة') });
const trayForms = () => ({ one: t('unit.tray.one', 'طبقة واحدة'), two: t('unit.tray.two', 'طبقتان'), few: t('unit.tray.few', 'طبقات'), many: t('unit.tray.many', 'طبقة') });

/** رقم جوّا جملة عربية، معزول LTR حتى ما يتلخبط ترتيبه ويّا الكلمات والإشارات حواليه. */
function Num({ n }: { n: number }) {
  return <bdi dir="ltr">{fmtInt(n)}</bdi>;
}

/** عدد أيام بصيغته (countForm). genitive بعد حرف جرّ أو ظرف («بعد يومين»، «منذ يوم واحد»)، وبلاه مرفوع («يومان»). */
function Days({ n, genitive = false }: { n: number; genitive?: boolean }) {
  if (n === 1) return <>{t('home.days.one', 'يوم واحد')}</>;
  if (n === 2) return <>{genitive ? t('home.days.two_genitive', 'يومين') : t('home.days.two', 'يومان')}</>;
  const vars = { n: <Num n={n} /> };
  const form = countForm(n);
  if (form === 'few') return <Trans k="home.days.few" text="{n} أيام" vars={vars} />;
  if (form === 'many') return <Trans k="home.days.many" text="{n} يوماً" vars={vars} />;
  return <Trans k="home.days.hundreds" text="{n} يوم" vars={vars} />;
}

/**
 * أعمار الأفواج النشطة: «12 إلى 35 يوماً» (المعدود يتبع الرقم الأخير)، أو عمر واحد إذا كلها بنفس العمر.
 * إذا الأكبر 1 أو 2 ما ينكتب معدود بعد الرقم بالفصحى: الاسم يحمل العدد («يوم واحد إلى يومين»).
 */
function Ages({ min, max }: { min: number; max: number }) {
  if (min === max) return <Days n={min} />;
  if (max <= 2) {
    return <Trans k="home.broiler.ages_small" text="{min} إلى {max}" vars={{ min: <Days n={min} />, max: <Days n={max} genitive /> }} />;
  }
  const vars = { min: <Num n={min} />, max: <Num n={max} /> };
  const form = countForm(max);
  if (form === 'few') return <Trans k="home.broiler.ages_few" text="{min} إلى {max} أيام" vars={vars} />;
  if (form === 'many') return <Trans k="home.broiler.ages_many" text="{min} إلى {max} يوماً" vars={vars} />;
  return <Trans k="home.broiler.ages_hundreds" text="{min} إلى {max} يوم" vars={vars} />;
}

/** أقرب إخراج متوقّع بين الوجبات قيد التفقيس. سالب = فات موعده ولم يُخرَج بعد. «منذ» تجرّ مثل «بعد». */
function NextHatch({ days }: { days: number }) {
  if (days === 0) return <>{t('home.hatchery.next_today', 'اليوم')}</>;
  if (days > 0) return <Trans k="home.hatchery.next_in" text="بعد {days}" vars={{ days: <Days n={days} genitive /> }} />;
  return <Trans k="home.hatchery.next_late" text="فات موعده منذ {days}" vars={{ days: <Days n={-days} genitive /> }} />;
}

/** البطاقات المخطّطة بأرقامها، مصدّرة حتى ينفحص اتّجاه كل رقم وصيغته بلا متصفّح. */
export function plannedCardSpecs(summary: HomeSummary | null): CardSpec[] {
  const s: HomeSummary = summary ?? {};
  return [
    {
      key: 'feed_mill',
      to: '/mill',
      title: t('nav.mill', 'معمل العلف'),
      icon: Wheat,
      metrics: [
        { label: t('home.mill.produced', 'إنتاج اليوم'), kind: 'text', value: s.feedMill ? fmtQty(s.feedMill.producedTodayKg, 'kg').main : null },
        { label: t('home.mill.stock', 'العلف الجاهز'), kind: 'text', value: s.feedMill ? fmtQty(s.feedMill.feedInStockKg, 'kg').main : null },
      ],
    },
    {
      key: 'broiler',
      to: '/broiler',
      title: t('nav.broiler', 'حقول اللحم'),
      icon: Drumstick,
      metrics: [
        { label: t('home.broiler.active', 'الأفواج النشطة'), kind: 'number', value: s.broiler ? fmtInt(s.broiler.activeFlocks) : null },
        {
          label: t('home.broiler.ages', 'الأعمار'),
          kind: 'text',
          value: s.broiler?.ageDays ? <Ages min={s.broiler.ageDays.min} max={s.broiler.ageDays.max} /> : null,
        },
        { label: t('home.broiler.dead', 'نفوق اليوم'), kind: 'number', value: s.broiler ? fmtInt(s.broiler.deadToday) : null },
      ],
    },
    {
      key: 'layer',
      to: '/layers',
      title: t('nav.layers', 'حقول البيض'),
      icon: Egg,
      metrics: [
        { label: t('home.layer.eggs', 'بيض اليوم'), kind: 'number', value: s.layer ? fmtInt(s.layer.eggsToday) : null },
        { label: t('home.layer.hdep', 'نسبة الإنتاج'), kind: 'number', value: s.layer?.hdepPercent ? `${s.layer.hdepPercent}%` : null },
        {
          label: t('home.layer.trays', 'في المخزن'),
          kind: 'text',
          value: s.layer
            ? fmtQty(s.layer.traysInStore, 'pc', { pieceLabel: t('unit.egg', 'بيضة'), pieceForms: eggForms(), pack: { label: t('unit.tray', 'طبقة'), ...trayForms(), factor: TRAY } }).main
            : null,
        },
      ],
    },
    {
      key: 'hatchery',
      to: '/hatchery',
      title: t('nav.hatchery', 'المفقس'),
      icon: Bird,
      metrics: [
        { label: t('home.hatchery.setting', 'وجبات قيد التفقيس'), kind: 'number', value: s.hatchery ? fmtInt(s.hatchery.batchesSetting) : null },
        {
          label: t('home.hatchery.next', 'أقرب إخراج'),
          kind: 'text',
          value: s.hatchery && s.hatchery.nextHatchInDays !== null ? <NextHatch days={s.hatchery.nextHatchInDays} /> : null,
        },
        { label: t('home.hatchery.chicks', 'أفراخ في الانتظار'), kind: 'number', value: s.hatchery ? fmtInt(s.hatchery.chicksWaiting) : null },
      ],
    },
  ];
}
