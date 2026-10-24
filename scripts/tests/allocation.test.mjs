// allocation.ts: «أكبر الباقي» — المجموع = المبلغ بالضبط، والتعادل بترتيب السطر.
import { loadSrc } from './load-src.mjs';

const sum = (values) => values.reduce((a, b) => a + b, 0n);

export default async function (t) {
  const { allocateLargestRemainder } = await loadSrc('src/domain/allocation.ts');

  // المثال المحسوب: نقل 65,000 على الذرة 5,000 كغم والصويا 1,000 كغم بالوزن، بالفلس.
  const freight = allocateLargestRemainder(6_500_000n, [5_000_000n, 1_000_000n]);
  t.same(freight, [5_416_667n, 1_083_333n], 'حصّتا النقل 54,166.67 و10,833.33 (الفلس الباقي للذرة)');
  t.eq(sum(freight), 6_500_000n, 'مجموع الحصص = 65,000 بالضبط');

  t.same(allocateLargestRemainder(10n, [1n, 1n, 1n]), [4n, 3n, 3n], 'التعادل بترتيب السطر');
  t.same(allocateLargestRemainder(-10n, [1n, 1n, 1n]), [-4n, -3n, -3n], 'مبلغ سالب يتوزّع بنفس القاعدة');
  t.same(allocateLargestRemainder(7n, [0n, 5n, 0n]), [0n, 7n, 0n], 'وزن صفر ما ياخذ شي');
  t.same(allocateLargestRemainder(0n, [3n, 4n]), [0n, 0n], 'صفر يتوزّع صفر');

  // الباقي لأكبر باقٍ مو لأوّل سطر: توزيع «الأوائل ياخذون الزايد» كان يعدّي كل الحالات اللي فوك.
  t.same(allocateLargestRemainder(1n, [1n, 2n]), [0n, 1n], 'خصم دينار على [1، 2]: الدينار للثاني (باقيه 2/3)');
  t.same(allocateLargestRemainder(1n, [100n, 200n]), [0n, 1n], 'خصم دينار على سطرين 100 و200');
  t.same(allocateLargestRemainder(-1n, [1n, 2n]), [0n, -1n], 'السالب نفس الترتيب');
  // 5 على [1،1،1،4]: الحصص [0،0،0،2] والبواقي [5،5،5،6]/7 ← الرابع أوّل، وبعده الأوّل والثاني بالتعادل.
  t.same(allocateLargestRemainder(5n, [1n, 1n, 1n, 4n]), [1n, 1n, 0n, 3n], 'الأكبر باقياً أوّل، والتعادل بترتيب السطر');

  // سبع سطور، مجموع الأوزان 93: الحصص [32258، 75268، 118279، 139785، 182795، 204301، 247312] = 999,998
  // والبواقي [9، 83، 64، 8، 82، 26، 7]، فالوحدات الثلاث للسطر 2 (83) و5 (82) و3 (64).
  const many = allocateLargestRemainder(1_000_001n, [3n, 7n, 11n, 13n, 17n, 19n, 23n]);
  t.same(many, [32_258n, 75_269n, 118_280n, 139_785n, 182_796n, 204_301n, 247_312n], 'سبع سطور: كل حصّة بالضبط');
  t.eq(sum(many), 1_000_001n, 'سبع سطور: المجموع بالضبط');

  t.throws(() => allocateLargestRemainder(5n, [0n, 0n]), 'مجموع أوزان صفر يرفض', /zero_weights/);
  t.throws(() => allocateLargestRemainder(5n, [1n, -1n]), 'وزن سالب يرفض', /negative_weight/);
}
