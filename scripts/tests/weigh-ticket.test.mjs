// weighTicket.ts (0028، العقد §3 ticket_nets و§4.4 والقاعدة 26): صافي كلّ قاعة بالخابط الذي قبلها (والفارغ قبل الأولى)، وأقفاصها حين وُزن الفارغ
// بلاها، وميزان الأقفاص بمجموع وزناته، ومعدّل الطير، والوزن المحسوب بعد التنزيل (round3)، والمبلغ بالدينار الصحيح (round0)، وحصّة كلّ فوج بأكبر الباقي
// بصافي قاعته. الأرقام الذهبية بلا تسامح: G1 (F:664، 24,899,875)، وG2 وG3 (D:227، بالأقفاص في الفارغ وبلاها)، وG4 (القسمة على فوجين). وكلّ حالة تمسك
// خطأً معقولاً: الصوافي من الفارغ لكلّ قاعة (بلا تتابع)، وطرح الأقفاص وهي في الفارغ، وتقريب الوزن لمرتبتين أو قصّه، وقصّ المبلغ، والقسمة بالطيور.
// والتطابق مع القاعدة: عيّنات fixtures/birds-0028.json الحقيقية (supabase/tests/birds.test بـBIRDS_SAMPLES_OUT=1) حين توجد.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSrc } from './load-src.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const kg = (whole, milli = 0) => BigInt(whole) * 1000n + BigInt(milli);
const dinars = (n) => BigInt(n) * 100n;
const stop = (birds, crates, gross) => ({ birds, crates, grossKg: gross, weighings: [] });

export default async function (t) {
  const w = await loadSrc('src/domain/weighTicket.ts');
  const scale = (emptyKg, emptyWithCrates, crateKg, stops) => w.ticketNets({ method: 'scale', emptyKg, emptyWithCrates, crateKg, stops });
  const nets = (result) => result.stops.map((s) => s.netKg);

  // G1 (F:664): الفارغ 7,000 بلا أقفاص، والقفص 6، وقاعة واحدة 4,000 طير و400 قفص وخابطها 18,500 ← 18,500 − 7,000 − 2,400 = 9,100، والمعدّل 2.275.
  const g1 = scale(kg(7000), false, kg(6), [stop(4000, 400, kg(18500))]);
  t.same(
    [g1.stops[0].prevGrossKg, g1.stops[0].cratesKg, g1.stops[0].netKg, g1.stops[0].avgKg, g1.stops[0].problem, g1.birds, g1.crates, g1.netKg, g1.avgKg],
    [kg(7000), kg(2400), kg(9100), 2275n, null, 4000, 400, kg(9100), 2275n],
    'G1 الصافي 9,100.000 والمعدّل 2.275 ومجاميع التذكرة',
  );
  // التنزيل 0.50٪ ← 9,054.500، وسعر الكيلو 2,750.00 ← 24,899,875 دينار (رقم قبول المرحلة)، والحصّة كلّها للفوج الواحد.
  const g1Billed = w.billedKg(g1.netKg, 50n);
  const g1Total = w.saleTotal(g1Billed, dinars(2750));
  t.same([g1Billed, g1Total, w.revenueSplit(g1Total, [g1.netKg])], [kg(9054, 500), dinars(24_899_875), [dinars(24_899_875)]], 'G1 الوزن المحسوب 9,054.500 والمبلغ 24,899,875 دينار');

  // G2 (D:227، الفارغ مع الأقفاص): الفارغ 8,000، والخابط 11,000 ثمّ 14,500 ← 3,000 و3,500 (المجموع 6,500). الأقفاص مكتوبة ولا تُطرح.
  const g2 = scale(kg(8000), true, kg(6), [stop(1300, 200, kg(11000)), stop(1500, 230, kg(14500))]);
  t.same([nets(g2), g2.stops.map((s) => s.cratesKg), g2.netKg, g2.crates], [[kg(3000), kg(3500)], [0n, 0n], kg(6500), 430], 'G2 بالأقفاص في الفارغ: 3,000 و3,500 ولا يُطرح وزن قفص');
  // والأقفاص اختيارية حين وُزنت مع الفارغ: الصافي يُحسب بلاها، ومجموع الأقفاص null (كعمود الخادم).
  const g2Bare = scale(kg(8000), true, null, [stop(1300, null, kg(11000)), stop(1500, null, kg(14500))]);
  t.same([nets(g2Bare), g2Bare.crates, g2Bare.stops.map((s) => s.problem)], [[kg(3000), kg(3500)], null, [null, null]], 'G2 بلا عدد أقفاص ولا وزن قفص: الصافي كما هو');

  // G3 (D:227، الفارغ بلا أقفاص): الفارغ 7,000، و200 قفص لكلّ قاعة، والقفص 6، والخابط 10,000 ثمّ 13,500 ← 1,800 و2,300 (= 13,500 − 7,000 − 2,400).
  const g3 = scale(kg(7000), false, kg(6), [stop(1800, 200, kg(10000)), stop(2200, 200, kg(13500))]);
  t.same(
    [nets(g3), g3.stops.map((s) => s.prevGrossKg), g3.netKg, kg(13500) - kg(7000) - kg(2400)],
    [[kg(1800), kg(2300)], [kg(7000), kg(10000)], kg(4100), kg(4100)],
    'G3 بلا أقفاص في الفارغ: 1,800 و2,300، والخابط قبل الثانية خابط الأولى، والمجموع = آخر خابط − الفارغ − كلّ الأقفاص',
  );

  // G4: G3 بتنزيل 0.50٪ ← 4,079.500، وسعر 2,749.00 ← round0(11,214,545.5) = 11,214,546، والحصّتان بالصافي 4,923,459 و6,291,087 (أكبر الباقي).
  const g4Billed = w.billedKg(g3.netKg, 50n);
  const g4Total = w.saleTotal(g4Billed, dinars(2749));
  const g4Split = w.revenueSplit(g4Total, nets(g3));
  t.same([g4Billed, g4Total, g4Split], [kg(4079, 500), dinars(11_214_546), [dinars(4_923_459), dinars(6_291_087)]], 'G4 المبلغ 11,214,546 (لا 11,214,545)، والحصّتان 4,923,459 و6,291,087');
  t.eq(g4Split[0] + g4Split[1], g4Total, 'G4 مجموع الحصص = المبلغ بالضبط');
  // بالطيور (1,800 و2,200) تكون الحصّتان غيرهما: القسمة بالصافي لا بعدد الطيور (D:227).
  t.ok(g4Split[0] !== w.revenueSplit(g4Total, [1800n, 2200n])[0], 'G4 القسمة بصافي كلّ قاعة لا بطيورها');

  // الوزن المحسوب يُقرّب لثلاث مراتب نصفاً بعيداً عن الصفر مرّة واحدة: 1,000.001 بتنزيل 0.05٪ = 999.5009995 ← 999.501 (لا 999.500 قصّاً ولا 999.50).
  t.eq(w.billedKg(kg(1000, 1), 5n), kg(999, 501), 'round3: 999.5009995 ← 999.501');
  t.same([w.billedKg(kg(1000), 0n), w.billedKg(kg(1000), 1000n)], [kg(1000), kg(900)], 'التنزيل صفر يبقي الصافي، و10٪ حدّه');
  t.throws(() => w.billedKg(kg(1000), 1001n), 'تنزيل فوق 10٪ يُرفض', /deduction_out_of_range/);
  t.throws(() => w.billedKg(kg(1000), -1n), 'تنزيل سالب يُرفض', /deduction_out_of_range/);
  // المبلغ round0 بنصف بعيد عن الصفر: 0.500 كغم × 1.00 = 0.5 ← دينار واحد، و0.499 ← صفر.
  t.same([w.saleTotal(500n, dinars(1)), w.saleTotal(499n, dinars(1))], [dinars(1), 0n], 'round0 للمبلغ: نصف الدينار يُرفع');
  t.throws(() => w.revenueSplit(dinars(10) + 50n, [kg(1)]), 'مبلغ بكسر دينار لا يُقسم', /total_not_whole/);

  // ميزان الأقفاص: خابط القاعة مجموع وزناتها، وأقفاصها مجموع أقفاص الوزنات، والصافي = الخابط − الأقفاص × وزن القفص.
  const crates = w.ticketNets({
    method: 'crates',
    emptyKg: null,
    emptyWithCrates: false,
    crateKg: kg(6),
    stops: [
      { birds: 300, crates: null, grossKg: null, weighings: [{ crates: 10, grossKg: kg(520) }, { crates: 10, grossKg: kg(515, 500) }] },
      { birds: 150, crates: null, grossKg: null, weighings: [{ crates: 10, grossKg: kg(470, 250) }] },
    ],
  });
  t.same(
    crates.stops.map((s) => [s.prevGrossKg, s.grossKg, s.crates, s.cratesKg, s.netKg, s.avgKg, s.problem]),
    [
      [null, kg(1035, 500), 20, kg(120), kg(915, 500), 3052n, null],
      [null, kg(470, 250), 10, kg(60), kg(410, 250), 2735n, null],
    ],
    'ميزان الأقفاص: 1,035.500 − 20 × 6 = 915.500 (معدّل 3.052)، و470.250 − 60 = 410.250 (معدّل 2.735)',
  );
  t.same([crates.netKg, crates.crates, crates.birds, crates.avgKg], [kg(1325, 750), 30, 450, 2946n], 'ميزان الأقفاص: المجاميع ومعدّل التذكرة 1,325.750 ÷ 450 = 2.946');

  // النقص بترتيب جملة الخادم، والرقمان اللذان لا يستقيمان.
  const problems = (ticket) => w.ticketNets(ticket).stops.map((s) => s.problem);
  t.same(problems({ method: 'scale', emptyKg: null, emptyWithCrates: true, crateKg: null, stops: [stop(10, null, kg(100))] }), ['empty'], 'بلا وزن الفارغ: empty');
  t.same(problems({ method: 'scale', emptyKg: kg(50), emptyWithCrates: false, crateKg: null, stops: [stop(10, 2, kg(100))] }), ['crate_kg'], 'الفارغ بلا أقفاص وبلا وزن القفص: crate_kg');
  t.same(problems({ method: 'scale', emptyKg: kg(50), emptyWithCrates: false, crateKg: kg(6), stops: [stop(10, null, kg(100))] }), ['crates'], 'الفارغ بلا أقفاص وبلا عدد أقفاص القاعة: crates');
  t.same(problems({ method: 'scale', emptyKg: kg(50), emptyWithCrates: true, crateKg: null, stops: [stop(10, null, null), stop(10, null, kg(200))] }), ['gross', 'prev_gross'], 'بلا خابط الأولى: gross لها، وprev_gross للتي بعدها');
  t.same(problems({ method: 'scale', emptyKg: kg(100), emptyWithCrates: true, crateKg: null, stops: [stop(10, null, kg(100))] }), ['not_rising'], 'خابط لا يزيد على الفارغ: not_rising');
  t.same(problems({ method: 'scale', emptyKg: kg(100), emptyWithCrates: false, crateKg: kg(6), stops: [stop(10, 5, kg(130))] }), ['not_positive'], 'صافٍ بعد طرح الأقفاص ليس أكبر من صفر: not_positive');
  t.same(problems({ method: 'crates', emptyKg: null, emptyWithCrates: false, crateKg: kg(6), stops: [{ birds: 10, crates: null, grossKg: null, weighings: [] }] }), ['weighings'], 'ميزان الأقفاص بلا وزنة: weighings');
  t.same(problems({ method: 'crates', emptyKg: null, emptyWithCrates: false, crateKg: null, stops: [{ birds: 10, crates: null, grossKg: null, weighings: [{ crates: 1, grossKg: kg(10) }] }] }), ['crate_kg'], 'ميزان الأقفاص بلا وزن القفص: crate_kg');
  // المجاميع null ما دامت قاعة ناقصة أو لا تستقيم، والمعدّل null بلا طيور.
  const partial = scale(kg(100), true, null, [stop(10, null, kg(200)), stop(null, null, kg(150))]);
  t.same([partial.stops[0].netKg, partial.stops[1].netKg, partial.netKg, partial.birds, partial.stops[0].avgKg, partial.stops[1].avgKg], [kg(100), kg(-50), null, null, 10_000n, null], 'قاعة لا تستقيم: لا مجموع، ولا معدّل بلا طيور');

  // المعقول عند الإكمال 0.3 إلى 6 كغم للطير بالحدّين.
  t.same([w.averageInRange(kg(300), 1000), w.averageInRange(kg(299, 999), 1000), w.averageInRange(kg(6000), 1000), w.averageInRange(kg(6000, 1), 1000)], [true, false, true, false], 'المعدّل المعقول 0.3 إلى 6 كغم بالحدّين');

  // ── التطابق مع القاعدة: عيّنات 0028 الحقيقية (حين توجد) ─────────────────────────────────────────────────────────────
  const samplesPath = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'birds-0028.json');
  if (existsSync(samplesPath)) {
    const S = JSON.parse(readFileSync(samplesPath, 'utf8'));
    const milli = (text) => (text === null || text === undefined ? null : kg(...String(text).split('.').map((part, i) => (i === 1 ? Number(part.padEnd(3, '0')) : Number(part)))));
    const tickets = Object.entries(S).filter(([, value]) => value && typeof value === 'object' && Array.isArray(value.stops) && value.method);
    for (const [name, ticket] of tickets) {
      const mirrored = w.ticketNets({
        method: ticket.method,
        emptyKg: milli(ticket.empty_kg),
        emptyWithCrates: ticket.empty_with_crates === true,
        crateKg: milli(ticket.crate_kg),
        stops: ticket.stops.map((s) => ({ birds: s.birds, crates: s.crates, grossKg: milli(s.gross_kg), weighings: (s.weighings ?? []).map((x) => ({ crates: x.crates, grossKg: milli(x.gross_kg) })) })),
      });
      t.same(
        mirrored.stops.map((s) => [s.netKg, s.avgKg]),
        ticket.stops.map((s) => [milli(s.net_kg), milli(s.avg_kg)]),
        `التطابق ${name}: صافي كلّ قاعة ومعدّلها = الخادم`,
      );
      if (ticket.net_kg !== null && ticket.net_kg !== undefined) t.eq(mirrored.netKg, milli(ticket.net_kg), `التطابق ${name}: صافي التذكرة = الخادم`);
    }
    t.ok(tickets.length > 0, 'التطابق: في العيّنات تذكرة واحدة على الأقلّ');
  }
}
