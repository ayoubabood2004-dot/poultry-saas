// format.ts: المنسّقات الوحيدة. الكمية أبداً ما تنعرض مقرّبة (بـdoctorVet «3» عن 3.25).
import { loadSrc } from './load-src.mjs';

export default async function (t) {
  const f = await loadSrc('src/lib/format.ts');

  t.eq(f.fmtQty(3_250n, 'kg').main, '3.25 كغم', '3.25 تبقى 3.25');
  t.eq(f.fmtQty(750_000n, 'kg').main, '750 كغم', 'تحت الطن بالكيلو');
  t.same(f.fmtQty(6_120_000n, 'kg'), { main: '6.120 طن', sub: '6,120 كغم' }, 'من الطن: طن وتحته كيلو');
  t.eq(f.fmtQty(6_120_500n, 'kg').main, '6.1205 طن', 'الطن ما يخفي غرامات');
  const bag50 = { pack: { label: 'كيس', factor: 50_000n } };
  t.same(f.fmtQty(2_370_000n, 'kg', bag50), { main: '47 كيس + 20 كغم', sub: '2,370 كغم' }, 'وحدة التعبئة');
  t.same(f.fmtQty(60_010_000n, 'kg', bag50), { main: '1,200 كيس + 10 كغم', sub: '60,010 كغم' }, 'عدد الأكياس بفواصل');
  t.eq(f.fmtQty(250_000n, 'L').main, '250 لتراً', 'اللتر يبقى لتراً، بصيغة العدد (11–99 منصوب)');
  // الفصحى: المعدود بعد رقم صحيح بصيغته، والكسر مفرد، و«كغم» اختصار ثابت.
  t.eq(f.fmtQty(5_000n, 'L').main, '5 لترات', '3–10 جمع');
  t.eq(f.fmtQty(2_500n, 'L').main, '2.5 لتر', 'الكسر مفرد');
  t.eq(f.fmtQty(1_000_000n, 'L').main, '1,000 لتر', 'المئات مفرد');
  t.eq(f.fmtQty(5_000n, 'pc').main, '5 قطع', 'القطعة الافتراضية جمعها قطع');
  t.eq(f.fmtQty(5_000n, 'kg').main, '5 كغم', 'كغم ثابت');
  const eggForms = { pieceLabel: 'بيضة', pieceForms: { few: 'بيضات', many: 'بيضة' }, pack: { label: 'طبقة', few: 'طبقات', many: 'طبقة', factor: 30_000n } };
  t.same(f.fmtQty(155_000n, 'pc', eggForms), { main: '5 طبقات + 5 بيضات', sub: '155 بيضة' }, '«5 طبقات + 5 بيضات» وتحته 155 بيضة');
  t.eq(f.fmtQty(-10_000n, 'pc', eggForms).main, `${'\u{2066}'}-10${'\u{2069}'} بيضات`, 'السالب بصيغة عدده المطلق');
  // الواحد والاثنان: الاسم يحمل العدد بلا رقم قبله، والمئات والكسور والسالب تبقى رقماً.
  t.eq(f.fmtQty(2_000n, 'L').main, 'لتران', '2 لتر ← لتران');
  t.eq(f.fmtQty(1_000n, 'L').main, 'لتر واحد', '1 لتر ← لتر واحد');
  t.eq(f.fmtQty(1_000n, 'pc').main, 'قطعة واحدة', 'قطعة واحدة');
  t.eq(f.fmtQty(2_000n, 'pc').main, 'قطعتان', 'قطعتان');
  t.eq(f.fmtQty(102_000n, 'L').main, '102 لتر', '102 تبقى رقماً');
  const eggsFull = {
    pieceLabel: 'بيضة',
    pieceForms: { one: 'بيضة واحدة', two: 'بيضتان', few: 'بيضات', many: 'بيضة' },
    pack: { label: 'طبقة', one: 'طبقة واحدة', two: 'طبقتان', few: 'طبقات', many: 'طبقة', factor: 30_000n },
  };
  t.same(f.fmtQty(32_000n, 'pc', eggsFull), { main: 'طبقة واحدة + بيضتان', sub: '32 بيضة' }, '«طبقة واحدة + بيضتان»');
  t.same(f.fmtQty(60_000n, 'pc', eggsFull), { main: 'طبقتان', sub: '60 بيضة' }, '«طبقتان»');
  t.eq(f.fmtQty(-2_000n, 'pc', eggsFull).main, `${'\u{2066}'}-2${'\u{2069}'} بيضة`, 'السالب يبقى رقماً معزولاً حتى إشارة النقص تنقرا');
  t.same(
    [f.fmtCounted(5_000n, 'كيس', { few: 'أكياس' }), f.fmtCounted(2_000n, 'كيس', { two: 'كيسان' }), f.fmtCounted(2_500n, 'كيس', { few: 'أكياس' }), f.fmtCounted(5_000n, 'كيس')],
    ['5 أكياس', 'كيسان', '2.5 كيس', '5 كيس'],
    'fmtCounted: نفس الصيغ لنصّ التحويل، وبلا صيغ الاسم ثابت',
  );
  t.same([3, 10, 11, 99, 100, 101, 102, 103, 110, 111, 1000, -7].map(f.countForm), ['few', 'few', 'many', 'many', 'hundreds', 'hundreds', 'hundreds', 'few', 'few', 'many', 'hundreds', 'few'], 'countForm');
  t.eq(f.countForm(1_105n), 'few', 'countForm يقبل bigint');

  // عمود الجدول: مراتب ثابتة حتى الآحاد تصطفّ، والكسر الأطول من العمود يرمي.
  t.same([3_250n, 750_000n, -1_250_500n].map((q) => f.fmtQtyCell(q)), ['3.250', '750.000', '-1,250.500'], 'fmtQtyCell بثلاث مراتب');
  t.eq(f.fmtQtyCell(1_500n, 1), '1.5', 'مرتبة وحدة');
  t.eq(f.fmtQtyCell(2_000n, 0), '2', 'بلا مراتب');
  t.throws(() => f.fmtQtyCell(1n, 2), 'كسر أطول من العمود يرمي', /hidden_fraction/);

  // لوحة الوزن: فواصل على الجزء الصحيح، والكتابة الناقصة («12.») كما هي.
  t.same(['', '12450', '1234567.125', '12.', '0.5'].map(f.fmtTypedNumber), ['0', '12,450', '1,234,567.125', '12.', '0.5'], 'fmtTypedNumber');
  const eggs = { pieceLabel: 'بيضة', pack: { label: 'طبقة', factor: 30_000n } };
  t.same(f.fmtQty(1_380_000n, 'pc', eggs), { main: '46 طبقة', sub: '1,380 بيضة' }, 'الباقي بـE1 = 46 طبقة بالضبط');
  t.eq(f.fmtQty(1_392_000n, 'pc', eggs).main, '46 طبقة + 12 بيضة', 'طبقات وبيض');

  // أقل من وحدة تعبئة: الباقي بس. «0 كيس + 20 كغم» بسالبها كانت «-0 كيس + 20 كغم» وتنقرا +20.
  t.same(f.fmtQty(20_000n, 'kg', bag50), { main: '20 كغم' }, 'أقل من كيس بلا «0 كيس»');
  t.same(f.fmtQty(0n, 'kg', bag50), { main: '0 كغم' }, 'صفر بلا «0 كيس»');

  // السالب: كل رقم معزول LTR (LRI … PDI) حتى الإشارة تبقى ويّا رقمها بسطر عربي، والمركّب يطرح الباقي.
  const iso = (number) => `\u{2066}${number}\u{2069}`;
  t.same(f.fmtQty(-3_250n, 'kg'), { main: `${iso('-3.25')} كغم` }, 'سالب معزول');
  t.same(f.fmtQty(-6_120_000n, 'kg'), { main: `${iso('-6.120')} طن`, sub: `${iso('-6,120')} كغم` }, 'سالب من الطن');
  t.same(f.fmtQty(-20_000n, 'kg', bag50), { main: `${iso('-20')} كغم` }, '−20 كغم بكيس 50: بلا «-0 كيس + 20 كغم»');
  t.same(
    f.fmtQty(-2_370_000n, 'kg', bag50),
    { main: `${iso('-47')} كيس - ${iso('20')} كغم`, sub: `${iso('-2,370')} كغم` },
    '−2,370 كغم = «-47 كيس - 20 كغم» (بالإشارة على الأكياس بس كانت تنقرا −2,330)',
  );
  t.same(
    f.fmtQty(-1_000_000n, 'pc', eggs),
    { main: `${iso('-33')} طبقة - ${iso('10')} بيضة`, sub: `${iso('-1,000')} بيضة` },
    'تصحيح بيض E1 −1,000 = «-33 طبقة - 10 بيضة» (كانت تنقرا −980)',
  );
  t.same(f.fmtQty(-1_380_000n, 'pc', eggs), { main: `${iso('-46')} طبقة`, sub: `${iso('-1,380')} بيضة` }, 'سالب بطبقات كاملة');
  const negatives = [-1n, -3_250n, -20_000n, -2_370_000n, -6_120_500n].flatMap((q) => {
    const a = f.fmtQty(q, 'kg', bag50);
    const b = f.fmtQty(q, 'kg');
    return [a.main, a.sub ?? '', b.main, b.sub ?? ''];
  });
  t.ok(
    negatives.every((text) => !/\d/.test(text.replace(/\u{2066}[^\u{2069}]*\u{2069}/gu, ''))),
    'بالسالب ماكو رقم برّا العزل',
  );
  const positives = [f.fmtQty(2_370_000n, 'kg', bag50), f.fmtQty(6_120_000n, 'kg'), f.fmtQty(1_392_000n, 'pc', eggs)];
  t.ok(positives.every((shown) => !/[\u{2066}-\u{2069}]/u.test(shown.main + (shown.sub ?? ''))), 'الموجب بلا عزل، مثل ما كان');

  t.eq(f.fmtMoney(691_106_667n), '6,911,066.67', 'كلفة P1');
  t.eq(f.fmtMoney(396_000_000n, 0), '3,960,000', 'فاتورة INV1 دينار صحيح');
  t.eq(f.fmtMoney(-65n), '-0.65', 'سالب بمرتبتين');
  t.throws(() => f.fmtMoney(150n, 0), 'كسر مخفي بعرض الدينار يرمي', /not_whole/);

  t.eq(f.fmtInt(1_460_000), '1,460,000', 'عدد صحيح');
  t.eq(f.fmtInt(-12), '-12', 'عدد سالب');
  // Milli وFils نوعهم bigint: النوع number يمنعهم بـtsc، ووقت التشغيل يرمي (1,380 بيضة كانت تنعرض «1,380,000»).
  t.throws(() => f.fmtInt(1_380_000n), 'fmtInt يرفض bigint', /not_number/);
  t.throws(() => f.fmtInt(3.25), 'fmtInt يرفض الكسر', /not_integer/);
  t.throws(() => f.fmtInt(2 ** 53), 'fmtInt يرفض عدداً فوك الآمن', /not_integer/);
  t.eq(f.fmtMilli(3_250n), '3.25', 'كل المراتب المعنوية');
}
