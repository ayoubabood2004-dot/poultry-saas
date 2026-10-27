// دفاتر الجهة بـsrc/domain/ledger.ts (خطّة المرحلة 1 WP3): runBooks يعيد تسلسلات أبو علي (FOUNDATION ٧٠٢) دفتراً دفتراً
// وفحص الفصل (الدفتر الغلط يغيّر الدفترين والمجموع نفسه، ٧٠٣)؛ allocationPlan مرآة private.allocation_plan (قيد المستند أوّلاً،
// ثم الافتتاح الفعّال، ثم الأقدم بالتاريخ ثم seq مو برقم المستند، والباقي فائض بنفس الدفتر)؛ وaccountsTotals مرآة الملخّص (حالة
// الفصل ٧٠٥: «لنا» و«علينا» بلا تصافٍ بين دفترين). مقارنة allocationPlan بالخادم نفسه بالحزمة (supabase/tests/ledger.test).
import { loadSrc } from './load-src.mjs';

const D = 100n; // فلس بالدينار
const dinars = (ledger) => ledger.lines.map((line) => line.balance / D);

export default async function (t) {
  const m = await loadSrc('src/domain/ledger.ts');

  // ── أبو علي: افتتاح 500,000 بالمعمل، فاتورة 3,960,000، وقبضان 1,000,000 و2,000,000؛ بالأفراخ فاتورة 9,750,000 وقبض 1,000,000.
  const entry = (bookId, date, doc, debit, credit) => ({ bookId, date, doc, memo: doc, debit: debit * D, credit: credit * D });
  const abuAli = [
    entry('mill', '2026-09-30', 'OP', 500_000n, 0n),
    entry('mill', '2026-10-03', 'INV1', 3_960_000n, 0n),
    entry('chicks', '2026-10-05', 'INV2', 9_750_000n, 0n),
    entry('mill', '2026-10-06', 'RC-2026-0001', 0n, 1_000_000n),
    entry('chicks', '2026-10-08', 'RC-2026-0002', 0n, 1_000_000n),
    entry('mill', '2026-10-09', 'RC-2026-0003', 0n, 2_000_000n),
  ];
  const books = m.runBooks(abuAli);
  t.same([...books.keys()], ['mill', 'chicks'], 'دفتر لكل دفتر بترتيب أوّل ظهور');
  t.same(dinars(books.get('mill')), [500_000n, 4_460_000n, 3_460_000n, 1_460_000n], 'المعمل 500,000 ← 4,460,000 ← 3,460,000 ← 1,460,000');
  t.same(dinars(books.get('chicks')), [9_750_000n, 8_750_000n], 'الأفراخ 9,750,000 ← 8,750,000');
  t.same([books.get('mill').closing / D, books.get('chicks').closing / D], [1_460_000n, 8_750_000n], 'آخر سطر بكل دفتر = رقمه بالجدول');
  t.same(books.get('mill').lines.map((line) => line.doc), ['OP', 'INV1', 'RC-2026-0001', 'RC-2026-0003'], 'سطور الدفتر بترتيبها، بلا سطور الدفتر الثاني');

  // فحص الفصل (٧٠٣): قبض الأفراخ انكتب بالمعمل بالغلط ← المعمل 460,000 والأفراخ 9,750,000، والمجموع نفسه.
  const wrong = m.runBooks(abuAli.map((line) => (line.doc === 'RC-2026-0002' ? { ...line, bookId: 'mill' } : line)));
  const closing = (map, id) => map.get(id).closing / D;
  t.same([closing(wrong, 'mill'), closing(wrong, 'chicks')], [460_000n, 9_750_000n], 'الدفتر الغلط: كل دفتر يتغيّر');
  t.eq(closing(wrong, 'mill') + closing(wrong, 'chicks'), closing(books, 'mill') + closing(books, 'chicks'), 'والمجموع نفسه (10,210,000): المجموع وحده ما يمسك الغلط');

  // المدوَّر قبل المدّة لكل دفتر، ودفتر بمدوَّر بلا قيود يبقى بكشفه.
  const carried = m.runBooks([entry('mill', '2026-10-10', 'RC-2026-0004', 0n, 60_000n)], { mill: 1_460_000n * D, chicks: 8_750_000n * D });
  t.same(dinars(carried.get('mill')), [1_400_000n], 'الرصيد الجاري يبدي من المدوَّر');
  t.ok(carried.has('chicks') && carried.get('chicks').lines.length === 0 && closing(carried, 'chicks') === 8_750_000n, 'دفتر بمدوَّر بلا قيود بالمدّة يبقى برصيده');

  // ── التوزيع (القاعدة 27).
  const open = (id, amount, remaining, onDate, seq, opening = false) => ({ id, amount: amount * D, remaining: remaining * D, onDate, seq, opening });
  const plan = (entries, amount, first = null) => {
    const result = m.allocationPlan(entries, amount * D, first);
    return { allocations: result.allocations.map((line) => [line.entryId, line.amount / D]), surplus: result.surplus / D };
  };
  // التشبيه المشتقّ للمرحلة 1: 2,000,000 قبضنا بدفتر المعمل يسدّ الافتتاح 500,000 والباقي «له 1,500,000».
  t.same(plan([open('op', 500_000n, 500_000n, '2026-09-30', 1n, true)], -2_000_000n), { allocations: [['op', 500_000n]], surplus: 1_500_000n }, 'القبض يسدّ الافتتاح والفائض يبقى بالدفتر');
  // الافتتاح أوّلاً حتى لو بعده بالتاريخ (E8)، ثم الأقدم.
  const mixed = [
    open('inv-old', 300_000n, 300_000n, '2026-09-01', 1n),
    open('op', 200_000n, 200_000n, '2026-09-30', 9n, true),
    open('inv-new', 400_000n, 400_000n, '2026-10-02', 3n),
  ];
  t.same(plan(mixed, -600_000n), { allocations: [['op', 200_000n], ['inv-old', 300_000n], ['inv-new', 100_000n]], surplus: 0n }, 'الافتتاح الفعّال أوّلاً، ثم الأقدم تاريخاً');
  // نفس اليوم: seq يحسم، مو نصّ رقم المستند (RC-2026-0010 قبل RC-2026-0009 نصّاً).
  const sameDay = [open('b', 100_000n, 100_000n, '2026-10-05', 12n), open('a', 100_000n, 100_000n, '2026-10-05', 7n)];
  t.same(plan(sameDay, -150_000n).allocations, [['a', 100_000n], ['b', 50_000n]], 'نفس اليوم بترتيب seq');
  // قيد المستند نفسه أوّلاً (الإعفاء أو المرتجع على فاتورته).
  t.same(plan(mixed, -250_000n, 'inv-new').allocations, [['inv-new', 250_000n]], 'قيد المستند نفسه قبل الافتتاح والأقدم');
  // المتبقّي بس، والقيود المسدودة والقيود بنفس الجهة ما تنحسب.
  const partial = [open('done', 100_000n, 0n, '2026-09-01', 1n), open('half', 100_000n, 40_000n, '2026-09-02', 2n), open('credit', -50_000n, 50_000n, '2026-09-03', 3n)];
  t.same(plan(partial, -100_000n), { allocations: [['half', 40_000n]], surplus: 60_000n }, 'المتبقّي بس، والمسدود والمعاكس ما ينحسبون');
  // الدفع (موجب) يسدّ «له» بنفس القاعدة.
  t.same(plan(partial, 80_000n), { allocations: [['credit', 50_000n]], surplus: 30_000n }, 'الدفع يسدّ ما له علينا، والباقي فائض');
  t.same(plan(mixed, 0n), { allocations: [], surplus: 0n }, 'صفر ما يوزّع شي');
  t.same(plan([], -10_000n), { allocations: [], surplus: 10_000n }, 'بلا قيود مفتوحة: كلّه فائض');
  const total = m.allocationPlan(mixed, -900_000n * D);
  t.eq(total.allocations.reduce((sum, line) => sum + line.amount, 0n) + total.surplus, 900_000n * D, 'الحصص + الفائض = المبلغ بالضبط');

  // ── الملخّص (FOUNDATION ٧٠٥): جهة عليها 1,000,000 بالمعمل وإلها 600,000 بالأفراخ.
  const separated = m.accountsTotals([
    { divisionId: 'mill', balance: 1_000_000n * D },
    { divisionId: 'hatchery', balance: -600_000n * D },
  ]);
  const sides = (totals) => [totals.receivable / D, totals.payable / D];
  t.same(sides(separated.divisions.get('mill')), [1_000_000n, 0n], 'المعمل: لنا 1,000,000');
  t.same(sides(separated.divisions.get('hatchery')), [0n, 600_000n], 'المفقس: علينا 600,000');
  t.same(sides(separated.project), [1_000_000n, 600_000n], 'المشروع 1,000,000 / 600,000، مو 400,000 / 0');
  // نفسها بين دفتري المفقس: خانة المفقس لنا 1,000,000 وعلينا 600,000.
  const hatchery = m.accountsTotals([
    { divisionId: 'hatchery', balance: 1_000_000n * D },
    { divisionId: 'hatchery', balance: -600_000n * D },
  ]);
  t.same(sides(hatchery.divisions.get('hatchery')), [1_000_000n, 600_000n], 'دفترا المفقس ما يتصافون');
}
