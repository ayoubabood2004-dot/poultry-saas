// count.ts (القاعدة 17، E45، E48): دفعة القياس (الأكبر fifo_seq، والتعادل الجذر قبل مراياه ثم المعرّف بترتيب بايتات uuid، والمعكوسة
// مستثناة حتى لو أكبر)، وقيمة الزيادة بدفعة القياس (mulDivRound2) أو بكلفة المدير بأربع مراتب (تقريب وحدة للفلس) أو null. أرقام
// counts.test نفسها (الذرة C2، والجذر 10.00 ÷ 3 والمرآة 6.67 ÷ 2، والمولّدة 2 × 1,234.5678). التطابق ويّا القاعدة بـproperty.test v3.
import { loadSrc } from './load-src.mjs';

const lot = (id, fifoSeq, mirror, reversed, qtyIn, valueIn) => ({ id, fifoSeq, mirror, reversed, qtyIn, valueIn });

export default async function (t) {
  const c = await loadSrc('src/domain/count.ts');

  // ── دفعة القياس ──
  const c1 = lot('c1000000-0000-4000-8000-000000000001', 1n, false, false, 4_000_000n, 180_000_000n);
  const c2 = lot('c2000000-0000-4000-8000-000000000002', 2n, false, false, 5_000_000n, 240_416_667n);
  const c3 = lot('c3000000-0000-4000-8000-000000000003', 3n, false, true, 100_000n, 5_000_000n);
  t.eq(c.pickGainReferenceLot([c1, c2]).id, c2.id, 'الأكبر fifo_seq');
  t.eq(c.pickGainReferenceLot([c3, c1, c2]).id, c2.id, 'المعكوسة مستثناة حتى لو أكبر fifo_seq');
  t.eq(c.pickGainReferenceLot([c3]), null, 'كلها معكوسة: null');
  t.eq(c.pickGainReferenceLot([]), null, 'بلا دفعات: null');
  const root = lot('f0000000-0000-4000-8000-000000000009', 7n, false, false, 3000n, 1000n);
  const mirror = lot('a0000000-0000-4000-8000-000000000001', 7n, true, false, 2000n, 667n);
  t.eq(c.pickGainReferenceLot([mirror, root]).id, root.id, 'التعادل بين الجذر ومرآته: الجذر حتى لو معرّفه أكبر');
  const twin = lot('A0000000-0000-4000-8000-000000000000', 7n, true, false, 2000n, 667n);
  t.eq(c.pickGainReferenceLot([mirror, twin]).id, twin.id, 'مرآتان: المعرّف الأصغر بترتيب البايتات وبلا حالة الحروف');

  // ── القيمة ──
  t.eq(c.gainValue(10_000n, c2, null), 480_833n, 'زيادة 10 كغم بـC2: 10 × 2,404,166.67 ÷ 5,000 = 4,808.33');
  t.eq(c.gainValue(1000n, root, null), 333n, 'لتر بالجذر: 10.00 ÷ 3 = 3.33');
  t.eq(c.gainValue(1000n, mirror, null), 334n, 'ولو بالمرآة كان 6.67 ÷ 2 = 3.34 (لهذا التعادل للجذر)');
  t.eq(c.gainValue(2000n, null, 12_345_678n), 246_914n, 'قطعتان بكلفة المدير 1,234.5678: 2,469.1356 ← 2,469.14');
  t.eq(c.gainValue(1n, null, 5_000n), 0n, 'غرام بكلفة 0.5 دينار للكيلو: 0.0005 ← صفر فلس');
  t.eq(c.gainValue(1n, null, 50_000n), 1n, 'غرام بكلفة 5 دنانير للكيلو: 0.005 ← فلس (نصف بعيداً عن الصفر)');
  t.eq(c.gainValue(2000n, c2, 12_345_678n), c.gainValue(2000n, c2, null), 'دفعة القياس تغلب كلفة المدير');
  t.eq(c.gainValue(2000n, null, null), null, 'بلا دفعة ولا كلفة: null (gain_cost_required)');
  t.throws(() => c.gainValue(0n, c2, null), 'الكمية الصفر ترمي', /qty_not_positive/u);
}
