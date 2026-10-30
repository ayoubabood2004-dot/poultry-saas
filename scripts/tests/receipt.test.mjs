// receipt.ts (القواعد 10 و11 و25، Q7، Q8، E46): كتلة السطر من لقطته، وحصص الخصم والتحميلات بأكبر الباقي بالفلس، وقيمة الدفعة، وصافي
// المورّد، وأوّل مشكلة بترتيب القاعدة. أرقام FOUNDATION (C2 وS2: 5,000 كغم بـ2,350,000 و1,000 كغم بـ900,000، ونقل 65,000 بالوزن ←
// 54,166.67 و10,833.33، وبالقيمة 47,000 و18,000). التطابق ويّا القاعدة بـgolden.test وproperty.test v4.
import { loadSrc } from './load-src.mjs';

const D = 100n;
const kg = (n) => BigInt(n) * 1000n;
const line = (qty, unit, total, extra = {}) => ({ qtyBase: qty, baseUnit: unit, density: extra.density ?? null, pieceMass: extra.pieceMass ?? null, lineTotal: total === null ? null : BigInt(total) * D, zeroReason: extra.zeroReason ?? null });
const none = { discount: 0n, paidNow: 0n, hasBox: false };
const charge = (amount, allocateBy, lines = null) => ({ amount: BigInt(amount) * D, allocateBy, allLines: lines === null, lines: lines ?? [] });

export default async function (t) {
  const r = await loadSrc('src/domain/receipt.ts');
  const c2s2 = [line(kg(5000), 'kg', 2350000), line(kg(1000), 'kg', 900000)];

  const mass = r.receiptValuation(c2s2, none, [charge(65000, 'mass')]);
  t.same([mass.perCharge[0].shares, mass.values, mass.net, mass.problem], [[5_416_667n, 1_083_333n], [240_416_667n, 91_083_333n], 325_000_000n, null], 'C2 وS2 بالوزن: 54,166.67 و10,833.33 (الفلس الباقي للذرة)، والصافي 3,250,000');
  const value = r.receiptValuation(c2s2, none, [charge(65000, 'value')]);
  t.same(value.perCharge[0].shares, [4_700_000n, 1_800_000n], 'بالقيمة (Q8): 47,000 و18,000');
  const two = r.receiptValuation(c2s2, none, [charge(65000, 'mass'), charge(30000, 'value')]);
  t.same(two.chargeShares, [7_585_898n, 1_914_102n], 'تحميلان يتجمّعون بالضبط: 75,858.98 و19,141.02');

  // الخصم بالفلس حسب مبلغ السطر، والقيد دينار صحيح: 1,000 على 3 سطور متساوية ← 333.34 و333.33 و333.33.
  const discounted = r.receiptValuation([line(kg(1), 'kg', 3000), line(kg(1), 'kg', 3000), line(kg(1), 'kg', 3000)], { discount: 1000n * D, paidNow: 0n, hasBox: false }, []);
  t.same([discounted.discountShares, discounted.values, discounted.net], [[33_334n, 33_333n, 33_333n], [266_666n, 266_667n, 266_667n], 800_000n], 'خصم 1,000 على ثلاث: الحصص بالفلس (333.34) والقيد 8,000 دينار صحيح');

  // الكتلة من اللقطة (E46): اللتر بالكثافة، والقطعة بوزنها (round3)، والقطعة بلا وزن null.
  t.same(
    [r.massOf({ qtyBase: kg(1000), baseUnit: 'L', density: 9200n, pieceMass: null }), r.massOf({ qtyBase: kg(3), baseUnit: 'pc', density: null, pieceMass: 333n }), r.massOf({ qtyBase: kg(100), baseUnit: 'pc', density: null, pieceMass: null })],
    [920_000n, 999n, null],
    'كتلة الزيت 1,000 لتر × 0.92 = 920 كغم، و3 قطع × 0.333 = 0.999 كغم، والغاز بلا وزن null',
  );
  const gas = r.receiptValuation([line(kg(100), 'pc', 700000), line(kg(500), 'L', 375000)], none, [charge(10000, 'mass')]);
  t.same([gas.problem, gas.perCharge[0].shares], [{ code: 'no_mass', charge: 0, line: 0 }, []], 'الغاز بلا وزن: «بالوزن» no_mass ويسمّي السطر');
  t.eq(r.receiptValuation([line(kg(100), 'pc', 700000), line(kg(500), 'L', 375000)], none, [charge(10000, 'value')]).problem, null, 'ونفس التحميل بالقيمة يمرّ');
  t.same(r.receiptValuation(c2s2, none, [charge(1000, 'mass', [1])]).perCharge[0], { lines: [1], shares: [100_000n] }, 'تحميل مقصور على سطر يذهب له كلّه');

  // ترتيب المشاكل نفسه بالقاعدة: مبلغ ناقص ← الخصم ← التحميلات ← المدفوع.
  const problems = [
    [[line(kg(1), 'kg', null)], none, [], 'value_required'],
    [[line(kg(1), 'kg', 0)], none, [], 'value_required'],
    [[line(kg(1), 'kg', 0, { zeroReason: 'هدية' })], none, [], null],
    [[line(kg(1), 'kg', 100)], { discount: 101n * D, paidNow: 0n, hasBox: false }, [], 'discount_exceeds_total'],
    [[line(kg(1), 'kg', 100)], none, [charge(10, 'mass', [])], 'charge_lines_required'],
    [[line(kg(1), 'kg', 0, { zeroReason: 'هدية' })], none, [charge(10, 'value')], 'zero_weights'],
    [[line(kg(1), 'kg', 100)], { discount: 0n, paidNow: 101n * D, hasBox: true }, [], 'paid_exceeds_total'],
    [[line(kg(1), 'kg', 100)], { discount: 0n, paidNow: 50n * D, hasBox: false }, [], 'cash_account_required'],
    [[line(kg(1), 'kg', null)], { discount: 101n * D, paidNow: 0n, hasBox: false }, [], 'value_required'],
  ];
  t.same(problems.map(([lines, amounts, charges]) => r.receiptValuation(lines, amounts, charges).problem?.code ?? null), problems.map(([, , , code]) => code), 'أوّل مشكلة بترتيب القاعدة (مبلغ ناقص قبل الخصم، والصفر بسببه يمرّ)');
}
