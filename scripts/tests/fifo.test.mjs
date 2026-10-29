// fifo.ts (القواعد 12–15): ترتيب السحب (الانتهاء والفارغ أخيراً، ثم fifo_seq، ثم المعرّف بترتيب بايتات uuid)، والدفعات المؤهّلة
// بيوم المستند (ما قبل الاستلام والمنتهي ما ينسحبون إلا المسمّاة بإذن)، وقيمة كل المتبقّي بالضبط والجزئي بـmulDivRound2، والنقص،
// وbefore (سطور قبله من نفس المادّة، كل سطر سحب لحاله)، وplanTransfer. كلّه مرّتين: TZ=":UTC" (أجهزة Vercel) وبغداد، والأيام نصوص فما تتغيّر.
// التطابق ويّا SQL (draw_plan) بـsupabase/tests/stock.test على مجموعات مولّدة.
import { loadSrc } from './load-src.mjs';

const lot = (id, fifoSeq, receivedOn, expiryOn, qtyLeft, valueLeft) => ({ id, fifoSeq, receivedOn, expiryOn, qtyLeft, valueLeft });

export default async function (t) {
  const f = await loadSrc('src/domain/fifo.ts');
  const savedTz = process.env.TZ;
  const savedZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    for (const zone of [':UTC', 'Asia/Baghdad']) {
      process.env.TZ = zone;
      const at = `(TZ=${zone})`;
      // ── الترتيب ──
      const lots = [
        lot('b0000000-0000-4000-8000-000000000002', 5n, '2026-10-01', null, 1000n, 100n),
        lot('a0000000-0000-4000-8000-000000000001', 5n, '2026-10-01', null, 1000n, 100n),
        lot('c0000000-0000-4000-8000-000000000003', 1n, '2026-10-01', null, 1000n, 100n),
        lot('d0000000-0000-4000-8000-000000000004', 9n, '2026-10-01', '2026-12-01', 1000n, 100n),
        lot('e0000000-0000-4000-8000-000000000005', 9n, '2026-10-01', '2026-11-01', 1000n, 100n),
      ];
      t.same([...lots].sort(f.compareDrawOrder).map((l) => l.id[0]), ['e', 'd', 'c', 'a', 'b'], `${at} الانتهاء الأقرب أوّلاً والفارغ أخيراً، ثم fifo_seq، والتعادل بالمعرّف`);
      // uuid بحروف كبيرة يترتّب مثل الصغيرة (بايتات ببوستغريس).
      t.eq(f.compareDrawOrder(lot('AB000000-0000-4000-8000-000000000000', 1n, '2026-10-01', null, 1n, 0n), lot('ab000000-0000-4000-8000-000000000001', 1n, '2026-10-01', null, 1n, 0n)), -1, `${at} مقارنة المعرّف بلا حالة الحروف`);

      // ── المؤهّل بيوم المستند ──
      const dated = [
        lot('a1', 1n, '2026-10-05', null, 1000n, 100n),
        lot('a2', 2n, '2026-10-01', '2026-10-09', 1000n, 100n),
        lot('a3', 3n, '2026-10-01', '2026-10-10', 1000n, 100n),
        lot('a4', 4n, '2026-10-01', null, 0n, 0n),
      ];
      t.same(f.eligibleLots(dated, '2026-10-10', { tracksExpiry: true }).map((l) => l.id), ['a3', 'a1'], `${at} المنتهي أمس يُترك، وبيوم انتهائه يُسحب أوّلاً`);
      t.same(f.eligibleLots(dated, '2026-10-04', { tracksExpiry: false }).map((l) => l.id), ['a2', 'a3'], `${at} المستلمة بعد يوم المستند والفارغة ما تؤهّل`);
      t.same(f.eligibleLots(dated, '2026-10-10', { tracksExpiry: false }).map((l) => l.id), ['a2', 'a3', 'a1'], `${at} مادّة ما تتابع الانتهاء: الانتهاء ترتيب بس`);
      t.same(f.eligibleLots(dated, '2026-10-10', { tracksExpiry: true, lotId: 'a2', allowExpired: true }).map((l) => l.id), ['a2'], `${at} الدفعة المنتهية المسمّاة بإذن المدير (Q5)`);
      t.same(f.eligibleLots(dated, '2026-10-10', { tracksExpiry: true, lotId: 'a2' }).map((l) => l.id), [], `${at} والمسمّاة بلا إذن ما تنسحب`);
      t.same(f.eligibleLots(dated, '2026-10-10', { tracksExpiry: true, allowExpired: true }).map((l) => l.id), ['a3', 'a1'], `${at} والإذن بلا دفعة مسمّاة ما يفتح المنتهي (Q5: الدفعة المسمّاة بس)`);

      // ── القيمة: GOLD-06 بالفلس، وكل المتبقّي بالضبط ──
      const feed = [lot('f1', 1n, '2026-10-01', null, 9_950_000n, 691_106_667n)];
      const first = f.planDraw(feed, 5_000_000n, '2026-10-02', { tracksExpiry: false });
      t.same([first.draws[0].value, first.shortage], [347_289_782n, 0n], `${at} 5,000 كغم من 9,950 ← 3,472,897.82`);
      const rest = f.planDraw(feed, 9_950_000n, '2026-10-02', { tracksExpiry: false, before: [5_000_000n] });
      t.same(rest.draws.map((d) => [d.qty, d.value]), [[4_950_000n, 343_816_885n]], `${at} الباقي بعد سطر سابق (before) = 4,950 كغم بـ3,438,168.85 بالضبط (كل المتبقّي)`);
      const third = [lot('t1', 1n, '2026-10-01', null, 3_000n, 100n)];
      const pieces = [f.planDraw(third, 1_000n, '2026-10-02', { tracksExpiry: false }), f.planDraw(third, 2_000n, '2026-10-02', { tracksExpiry: false, before: [1_000n] }), f.planDraw(third, 1_000n, '2026-10-02', { tracksExpiry: false, before: [2_000n] })];
      t.same(pieces.map((p) => p.draws[0].value), [33n, 67n, 33n], `${at} دفعة 3 بـ1.00: الثلث 0.33، والباقي كلّه 0.67 بالضبط، وآخر ثلث 0.33 (بلا فلس معلّق)`);

      // ── النقص ويّا المنتهي ──
      const vials = [lot('v1', 1n, '2026-10-01', '2026-10-09', 10_000n, 100_000_00n), lot('v2', 2n, '2026-10-01', '2026-11-15', 3_000n, 36_000_00n)];
      const short = f.planDraw(vials, 4_000n, '2026-10-10', { tracksExpiry: true });
      t.same([short.draws.map((d) => d.lotId), short.shortage], [['v2'], 1_000n], `${at} المنتهي ما يُحسب، والنقص قطعة وحدة`);

      // ── planTransfer: سطران لنفس المادّة يسحبان بالتتابع ──
      const plan = f.planTransfer(
        [
          { lineId: 'l1', itemId: 'x', qty: 600n },
          { lineId: 'l2', itemId: 'x', qty: 600n },
        ],
        () => [lot('x1', 1n, '2026-10-01', null, 1_000n, 1_000n)],
        () => false,
        '2026-10-02',
      );
      t.same(plan.map((p) => [p.lineId, p.draws.map((d) => d.qty), p.shortage]), [['l1', [600n], 0n], ['l2', [400n], 200n]], `${at} السطر الثاني بعد الأوّل: 400 والنقص 200`);
      const twoItems = f.planTransfer(
        [
          { lineId: 'a', itemId: 'x', qty: 600n },
          { lineId: 'b', itemId: 'y', qty: 600n },
          { lineId: 'c', itemId: 'x', qty: 300n },
        ],
        (itemId) => [lot(`${itemId}1`, 1n, '2026-10-01', null, 1_000n, 1_000n)],
        () => false,
        '2026-10-02',
      );
      t.same(twoItems.map((p) => [p.lineId, p.draws.map((d) => d.qty), p.shortage]), [['a', [600n], 0n], ['b', [600n], 0n], ['c', [300n], 0n]], `${at} سطر مادّة ثانية بين سطرين ما ينحسب على الأولى`);

      // ── سطور متكرّرة لنفس المادّة (FOUNDATION ٧٧٠): كل سطر سحب لحاله على الدفعة كما صارت، مثل الترحيل سطراً سطراً. قطعة وحدة
      // مجموعة كانت تتقرّب مرّة وحدة فتطلع المعاينة فلساً أكثر من الدفعة (3.66 ×3 = 10.98 من 10.97، و6.67 بدل 6.66).
      const sequential = (lotsList, qtys) => {
        let lots = lotsList.map((l) => ({ ...l }));
        return qtys.map((qty) => {
          const { draws } = f.planDraw(lots, qty, '2026-10-02', { tracksExpiry: false });
          lots = lots.map((l) => {
            const d = draws.find((x) => x.lotId === l.id);
            return d ? { ...l, qtyLeft: l.qtyLeft - d.qty, valueLeft: l.valueLeft - d.value } : l;
          });
          return draws.map((d) => d.value);
        });
      };
      const repeated = (lotsList, qtys) => f.planTransfer(qtys.map((qty, i) => ({ lineId: `r${i}`, itemId: 'x', qty })), () => lotsList, () => false, '2026-10-02').map((p) => p.draws.map((d) => d.value));
      const elevenNinetySeven = [lot('t3', 1n, '2026-10-01', null, 3_000n, 1_097n)];
      t.same([repeated(elevenNinetySeven, [1_000n, 1_000n, 1_000n]), sequential(elevenNinetySeven, [1_000n, 1_000n, 1_000n])], [[[366n], [366n], [365n]], [[366n], [366n], [365n]]], `${at} دفعة 3 لترات بـ10.97 وثلاثة سطور لتر: 3.66 و3.66 و3.65 = السحب المتتابع (مو 3.66 ثلاث مرّات)`);
      const sixHundred = [lot('t6', 1n, '2026-10-01', null, 600_000n, 1_000n)];
      t.same([repeated(sixHundred, [100_000n, 100_000n, 400_000n]), sequential(sixHundred, [100_000n, 100_000n, 400_000n])], [[[167n], [167n], [666n]], [[167n], [167n], [666n]]], `${at} دفعة 600 بـ10.00 وسطور 100 و100 و400: 1.67 و1.67 و6.66 (مو 6.67)`);
      // تطابق عشوائي بين planTransfer والسحب المتتابع على دفعتين، بسطور 3–5.
      let seed = 7;
      const next = (n) => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return BigInt(1 + (seed % n));
      };
      const randomMismatches = [];
      for (let k = 0; k < 300; k += 1) {
        const pair = [lot('p1', 1n, '2026-10-01', null, next(9_000), next(500_000)), lot('p2', 2n, '2026-10-01', null, next(9_000), next(500_000))];
        const qtys = Array.from({ length: 3 + Number(next(3)) - 1 }, () => next(2_500));
        const a = JSON.stringify(repeated(pair, qtys), (key, v) => (typeof v === 'bigint' ? v.toString() : v));
        const b = JSON.stringify(sequential(pair, qtys), (key, v) => (typeof v === 'bigint' ? v.toString() : v));
        if (a !== b) randomMismatches.push({ qtys: qtys.map(String), a, b });
      }
      t.same(randomMismatches.slice(0, 2), [], `${at} planTransfer = السحب المتتابع سطراً سطراً بـ300 حالة عشوائية`);
    }
  } finally {
    process.env.TZ = savedTz ?? savedZone;
  }
  t.eq(Intl.DateTimeFormat().resolvedOptions().timeZone, savedZone, 'المنطقة رجعت مثل ما كانت للفحوص اللي بعده');
}
