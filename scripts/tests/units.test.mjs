// units.ts: التحويل لوحدة الأساس، الكثافة، الخطوة، والتعبئة. الكميات بالآلاف.
import { loadSrc } from './load-src.mjs';

export default async function (t) {
  const u = await loadSrc('src/domain/units.ts');
  const bag50 = { units: 50n, scale: 0 };
  const tray = { units: 30n, scale: 0 };

  t.same(u.toBase(47_000n, bag50, 'kg'), { ok: true, qty: 2_350_000n }, '47 كيس = 2,350 كغم');
  t.same(u.toBase(2_500n, tray, 'pc'), { ok: true, qty: 75_000n }, '2.5 طبقة = 75 بيضة');
  t.same(u.toBase(1_500n, { units: 1n, scale: 0 }, 'pc'), { ok: false, reason: 'pieces_not_whole' }, '1.5 قطعة ترفض');
  t.same(u.toBase(2_000n, { units: 255n, scale: 1 }, 'kg'), { ok: true, qty: 51_000n }, 'كيس 25.5 كغم × 2 = 51');
  t.same(u.toBase(3_333n, { units: 1n, scale: 3 }, 'kg'), { ok: true, qty: 3n }, 'غرامات: round3 للمنتج');
  t.eq(u.UNITS.t.factor, 1_000_000n, 'الطن 1000 كغم ثابت');

  // العليقة: الزيت 23 كغم = 25 لتر بكثافة 0.92، وP1 230 كغم = 250 لتر.
  const oil = u.parseDensity('0.92');
  t.eq(oil, 9_200n, 'الكثافة بأربع مراتب');
  t.eq(u.litersToKg(25_000n, oil), 23_000n, '25 لتر × 0.92 = 23 كغم');
  t.eq(u.kgToLiters(230_000n, oil), 250_000n, '230 كغم ÷ 0.92 = 250 لتر');
  t.eq(u.parseDensity('0.92345'), null, 'كثافة بخمس مراتب ترفض');
  t.eq(u.parseDensity('0'), null, 'كثافة صفر ترفض');

  t.eq(u.parseQty('3.25'), 3_250n, '3.25 تبقى 3.25');
  t.eq(u.parseQty('٣٫٢٥'), 3_250n, 'أرقام شرقية');
  t.eq(u.parseQty('3.2505'), null, 'أربع مراتب ترفض');
  t.eq(u.parseQty('6,120'), 6_120_000n, 'فواصل الآلاف');
  t.eq(u.parseQty('1,234.56'), 1_234_560n, 'آلاف وعشري');
  t.eq(u.parseQty('١٬٢٣٤٫٥'), 1_234_500n, '«٬» آلاف و«٫» عشري');
  t.eq(u.parseQty(' 12.5 '), 12_500n, 'فراغ بالطرفين ينشال');
  // «0,5» كانت 5 كغم و«2,50» 250 كغم بصمت؛ و«٬» تشبه «٫» فـ«٠٬٥» نفس الغلطة.
  for (const text of ['0,5', '2,50', ',5', '1,2,3', '1 5', '٠٬٥', '0,500', '12,34', '1234,567', '1,234,', '1, 234']) {
    t.eq(u.parseQty(text), null, `«${text}» ترفض: فاصلة أو فراغ بغير مكانه`);
  }

  t.eq(u.roundToStep(1_234_567n, 100n), 1_234_600n, 'خطوة 0.1 كغم');
  t.eq(u.roundToStep(1_234_550n, 100n), 1_234_600n, 'النصف لفوك');

  t.same(u.splitPacks(2_370_000n, 50_000n), { packs: 47n, rest: 20_000n }, '2,370 كغم = 47 كيس + 20 كغم');
  t.same(u.splitPacks(1_380_000n, 30_000n), { packs: 46n, rest: 0n }, '1,380 بيضة = 46 طبقة بالضبط');
  t.same(u.parseFactor('50'), { units: 50n, scale: 0 }, 'معامل كيس');
  t.eq(u.parseFactor('-1'), null, 'معامل سالب يرفض');
}
