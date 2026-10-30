// revalue.ts (FOUNDATION ١٤١، ٥٥٢؛ E5، E51): حصّة المتبقّي = mulDivRound2(Σ متبقّي العائلة، الفرق، كمية السطر) بأكبر الباقي بالفلس
// على دفعات العائلة بترتيبها (الجذر ثم المرايا)، والباقي «فرق سعر شراء». أرقام الخطّة (WP7، returns.test): C2 بعد سحب 2,120 كغم يبقى
// 2,880 كغم بـ1,384,800.00، والجديد 2,400,000 بدل 2,350,000 (+50,000) ← حصّة 28,800.00 ومصروف 21,200.00، ومرآة 1,000 كغم ←
// 18,800.00 و10,000.00. التطابق ويّا القاعدة بـreturns.test وproperty.test v5.
import { loadSrc } from './load-src.mjs';

const kg = (n) => BigInt(n) * 1000n;
const dinar = (n) => BigInt(Math.round(n * 100));

export default async function (t) {
  const r = await loadSrc('src/domain/revalue.ts');
  const c2 = { qtyLeft: kg(2880), valueLeft: dinar(1384800) };

  const up = r.revaluationSplit([c2], kg(5000), dinar(50000));
  t.same([up.lotShare, up.shares, up.expense, up.problem], [dinar(28800), [dinar(28800)], dinar(21200), null], 'C2 +50,000: حصّة المتبقّي 28,800.00 ومصروف «فرق سعر شراء» 21,200.00');
  t.same([c2.valueLeft + up.lotShare, dinar(2404166.67) + up.lotShare], [dinar(1413600), dinar(2432966.67)], 'C2 بعدها: المتبقّي 1,413,600.00 والداخل 2,432,966.67');

  const mirrored = r.revaluationSplit([{ qtyLeft: kg(1880), valueLeft: dinar(903966.67) }, { qtyLeft: kg(1000), valueLeft: dinar(480833.33) }], kg(5000), dinar(50000));
  t.same([mirrored.shares, mirrored.lotShare, mirrored.expense], [[dinar(18800), dinar(10000)], dinar(28800), dinar(21200)], 'مرآة 1,000 من 2,880 كغم: 18,800.00 و10,000.00');

  const down = r.revaluationSplit([{ qtyLeft: kg(1880), valueLeft: dinar(903966.67) }, { qtyLeft: kg(1000), valueLeft: dinar(480833.33) }], kg(5000), dinar(-50000));
  t.same([down.shares, down.lotShare, down.expense, down.problem], [[dinar(-18800), dinar(-10000)], dinar(-28800), dinar(-21200), null], 'السعر ينزل 50,000: نفس الحصص بالسالب');

  // أكبر الباقي بالفلس والتعادل بترتيب العائلة: 100.00 على ثلاث دفعات متساوية ← 33.34 للأولى.
  const thirds = r.revaluationSplit([{ qtyLeft: kg(1), valueLeft: dinar(10) }, { qtyLeft: kg(1), valueLeft: dinar(10) }, { qtyLeft: kg(1), valueLeft: dinar(10) }], kg(3), dinar(100));
  t.same([thirds.shares, thirds.expense], [[3_334n, 3_333n, 3_333n], 0n], 'كل الكمية باقية: الفرق كلّه للدفعات بأكبر الباقي (33.34 للأولى) وبلا مصروف');

  // دفعة خلصت (متبقّيها صفر) ما تاخذ حصّة، ومرآتها تاخذ حصّة متبقّيها.
  const drained = r.revaluationSplit([{ qtyLeft: 0n, valueLeft: 0n }, { qtyLeft: kg(500), valueLeft: dinar(240000) }], kg(5000), dinar(50000));
  t.same([drained.shares, drained.lotShare, drained.expense], [[0n, dinar(5000)], dinar(5000), dinar(45000)], 'الجذر خلص: حصّته صفر، والمرآة 500 كغم ← 5,000.00');

  // العائلة انسحبت كلها: الفرق كلّه مصروف.
  const gone = r.revaluationSplit([{ qtyLeft: 0n, valueLeft: 0n }], kg(5000), dinar(50000));
  t.same([gone.lotShare, gone.shares, gone.expense, gone.problem], [0n, [0n], dinar(50000), null], 'ما بقى شي: حصّة صفر والفرق كلّه «فرق سعر شراء»');

  // حصّة سالبة أكبر من قيمة المتبقّي ← negative_value.
  const negative = r.revaluationSplit([{ qtyLeft: kg(4000), valueLeft: dinar(100) }], kg(5000), dinar(-50000));
  t.same([negative.lotShare, negative.problem], [dinar(-40000), 'negative_value'], 'حصّة −40,000 على متبقّي 100 دينار ← negative_value');

  // تقريب نصف بعيداً عن الصفر بالإشارتين: 1 كغم من 3 كغم × 0.05 = 0.0166… ← 0.02 و−0.02.
  t.same(
    [r.revaluationSplit([{ qtyLeft: kg(1), valueLeft: dinar(10) }], kg(3), 5n).lotShare, r.revaluationSplit([{ qtyLeft: kg(1), valueLeft: dinar(10) }], kg(3), -5n).lotShare],
    [2n, -2n],
    'التقريب نصفاً بعيداً عن الصفر وبنفس المقدار للسالب',
  );
}
