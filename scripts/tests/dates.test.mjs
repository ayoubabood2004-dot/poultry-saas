// dates.ts: اليوم المحلّي من مكوّنات الجهاز، وحساب الأيام بلا انزلاق.
import { loadSrc } from './load-src.mjs';

export default async function (t) {
  const d = await loadSrc('src/domain/dates.ts');

  // المنطقة مثبّتة على بغداد قبل أي Date: بجهاز UTC (Vercel وGitHub Actions) يوم ISO يطابق اليوم المحلّي،
  // فـlocalDay لو رجع لتحويل ISO يعدّي الفحص هناك. Node يقرا TZ وقت التشغيل.
  // المنطقة المحفوظة بالاسم مو بقيمة TZ: حذف TZ ما يرجّع منطقة الجهاز بـNode (يبقى على آخر قيمة)،
  // فالإرجاع لازم يكتب اسم منطقة الجهاز صراحةً.
  const savedZone = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  process.env.TZ = 'Asia/Baghdad';
  try {
    // الشرط المسبق: لو المنطقة ما انطبقت، يوم ISO والمحلّي يتطابقون والفحوص تحت ما تفحص شي.
    t.ok(
      new Date(2026, 9, 24, 1, 30).toISOString().slice(0, 10) !== '2026-10-24',
      'المنطقة بغداد فعلاً: يوم ISO لـ1:30 الفجر = البارحة',
    );

    t.eq(d.localDay(new Date(2026, 9, 24, 1, 30)), '2026-10-24', 'جولة الساعة 1:30 الفجر تنكتب بيومها');
    t.eq(d.localDay(new Date(2026, 0, 1, 0, 5)), '2026-01-01', 'أوّل دقايق السنة');
    t.eq(d.localDay(new Date(Date.UTC(2026, 9, 23, 22, 30))), '2026-10-24', '22:30 غرينتش = 1:30 بغداد بيوم بعده');
    t.eq(d.addDays('2026-09-24', 21), '2026-10-15', 'إخراج B1 المتوقّع = الإدخال + 21');
    t.eq(d.diffDays('2026-10-15', '2026-09-10'), 35, 'عمر BF1 يوم تذكرة الوزن 35 يوم');
    t.eq(d.addDays('2026-03-01', -1), '2026-02-28', 'رجوع يوم بشباط');
    t.eq(d.addDays('2028-03-01', -1), '2028-02-29', 'سنة كبيسة');
    t.ok(!d.isDay('2026-02-30'), '30 شباط مو يوم');
    t.ok(d.isDay('2026-10-24'), 'يوم صحيح');
    t.throws(() => d.addDays('24/10/2026', 1), 'صيغة غلط ترفض', /bad_day/);
  } finally {
    // الفحوص الثانية تشتغل بنفس العملية: نرجّع المنطقة مثل ما كانت.
    process.env.TZ = savedZone;
  }
  t.eq(Intl.DateTimeFormat().resolvedOptions().timeZone, savedZone, 'المنطقة رجعت مثل ما كانت للفحوص اللي بعده');
}
