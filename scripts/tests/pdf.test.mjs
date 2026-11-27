// ملفّ PDF من صورة التقرير (src/lib/pdf.ts، رسالة الزبون 2026-11-26: «الرصيد اليومي… لازم يروح على شكل بي دي اف»): المصدر الحقيقي محزوماً.
// P شرائح الصفحات: كلّ صفحة تنتهي عند أبعد حدّ صفّ في سعتها، وعنصرٌ أطول من صفحة يُقطع عند سعتها، وصفحةٌ تبدأ داخل جسم جدول يُكرَّر فوقها صفّ أسماء
// أعمدته فتسعتها أقلّ بارتفاعه، ولا تكرار بعد آخر الجدول؛ J أبعاد JPEG من مقطع SOF (الأساسيّ والتدريجيّ) وnull لما سواه؛ F بنية الملفّ: الرأس والتذييل،
// وجدول الإحالات يشير إلى كلّ كائن بالبايت، والصفحات بعددها، والعنوان UTF-16BE، والصورة كما هي، ومحتوى الصفحة بالأرقام المحسوبة (قصٌّ ثمّ الصورة مزاحةً)
// وصفّ الأسماء المكرَّر فوق الشريحة. (فُتح الملفّ الناتج من البناء الحقيقي بـpoppler — pdfinfo وpdftoppm — صفحاتٍ A4 صحيحة؛ هنا البنية بلا قارئ خارجيّ.)
import { loadSrc } from './load-src.mjs';

// JPEG حقيقيّ بثلاث نقاط عرضاً وأربع ارتفاعاً: أساسيّ (SOF0) وتدريجيّ (SOF2)، من Pillow.
const BASELINE =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAEAAMDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6pooooA//2Q==';
const PROGRESSIVE =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wgARCAAEAAMDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGqA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//aAAwDAQACAAMAAAAQ8//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Qf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Qf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8Qf//Z';
const bytesOf = (base64) => new Uint8Array(Buffer.from(base64, 'base64'));
/** الملفّ نصّاً بايتاً بايتاً (latin1): مواضع النصّ = مواضع البايتات. */
const latin = (bytes) => Buffer.from(bytes).toString('latin1');
const round2 = (value) => String(Math.round(value * 100) / 100);

export default async function (t) {
  const p = await loadSrc('src/lib/pdf.ts');

  // ── P: شرائح الصفحات ──────────────────────────────────────────────────────────────────────────────────────────
  const page = (from, to, head = null) => ({ from, to, head });
  t.same(p.paginate([100, 200], 500, 1000), [page(0, 500)], 'P1 ما يسعه ورق واحد صفحةٌ واحدة');
  t.same(p.paginate([], 1000.4, 1000), [page(0, 1000.4)], 'P1 ونصف نقطة فوق السعة للتقريب لا تفتح صفحة');
  const rows = Array.from({ length: 80 }, (_, index) => 25 + index * 30);
  t.same(
    p.paginate(rows, 2420, 1000),
    [page(0, 985), page(985, 1975), page(1975, 2420)],
    'P2 كلّ صفحة تنتهي عند أبعد حدّ صفّ لا يتجاوز سعتها (985 لا 1000، ثمّ 1975)، والأخيرة حتى آخر الصورة',
  );
  t.same(p.paginate([500, 1000], 1800, 1000), [page(0, 1000), page(1000, 1800)], 'P2 حدٌّ على السعة بالضبط مسموح (لا يُرجَع إلى الحدّ قبله)');
  t.same(p.paginate([500], 2500, 1000), [page(0, 500), page(500, 1500), page(1500, 2500)], 'P3 بلا حدّ في الصفحة (عنصرٌ أطول منها): تُقطع عند سعتها');
  const table = { headTop: 100, headBottom: 130, bottom: 2410 };
  t.same(
    p.paginate(rows, 2420, 1000, [table]),
    [page(0, 985), page(985, 1945, [100, 130]), page(1945, 2420, [100, 130])],
    'P4 صفحةٌ تبدأ داخل جسم الجدول يُكرَّر فوقها صفّ أسماء أعمدته (100–130)، فتسعتها 970 (1945 لا 1975)',
  );
  t.same(
    p.paginate([400, 960, 1300], 1500, 1000, [{ headTop: 100, headBottom: 130, bottom: 960 }]),
    [page(0, 960), page(960, 1500)],
    'P5 قطعٌ على آخر الجدول بالضبط: الصفحة التالية بلا صفّ مكرَّر',
  );
  t.same(
    p.paginate([], 3000, 1000, [{ headTop: 0, headBottom: 900, bottom: 3000 }]),
    [page(0, 1000), page(1000, 2000), page(2000, 3000)],
    'P6 صفّ أسماء أعمدة أطول من نصف الصفحة لا يُكرَّر: يُرسم بارتفاعه كلّه، فلو كُرّر لخرج ما تحته عن الورقة (مراجعة 2026-11-27)',
  );
  t.same(
    p.paginate([], 2000, 1000, [{ headTop: 0, headBottom: 500, bottom: 2000 }]),
    [page(0, 1000), page(1000, 1500, [0, 500]), page(1500, 2000, [0, 500])],
    'P6 ونصف الصفحة بالضبط يُكرَّر، وما تحته نصفها الآخر',
  );
  {
    const capacity = p.pageCapacity(720);
    const pages = p.paginate([], 4000, capacity, [{ headTop: 0, headBottom: 600, bottom: 4000 }]);
    t.ok(
      pages.length > 1 && pages.every((one) => (one.head ? one.head[1] - one.head[0] : 0) + (one.to - one.from) <= capacity + 0.5),
      'P6 كلّ صفحة: الصفّ المكرَّر وشريحتها معاً داخل سعة الورقة (رأس 600 نقطة في سعة 1,049.7)',
    );
  }
  t.same([p.paginate([], 0, 1000), p.paginate([5], 10, 0)], [[page(0, 0)], [page(0, 10)]], 'P7 ارتفاع أو سعة غير صالحين: صفحة واحدة بلا حلقة');
  t.ok(Math.abs(p.pageCapacity(720) - (841.89 - 2 * 28.35) / ((595.28 - 2 * 28.35) / 720)) < 1e-9, 'P8 سعة الصفحة بنقاط CSS: ارتفاع ما بين الحاشيتين ÷ المقياس');

  // ── J: أبعاد JPEG ─────────────────────────────────────────────────────────────────────────────────────────────
  t.same([p.jpegSize(bytesOf(BASELINE)), p.jpegSize(bytesOf(PROGRESSIVE))], [{ width: 3, height: 4 }, { width: 3, height: 4 }], 'J1 الأساسيّ والتدريجيّ: العرض 3 والارتفاع 4 من مقطع SOF');
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const cut = bytesOf(BASELINE).slice(0, 150);
  t.same([p.jpegSize(png), p.jpegSize(cut), p.jpegSize(new Uint8Array([0xff, 0xd8]))], [null, null, null], 'J2 ليس JPEG، أو مقطوع قبل SOF: null');

  // ── F: بنية الملفّ ────────────────────────────────────────────────────────────────────────────────────────────
  const jpeg = bytesOf(BASELINE);
  const pages = [page(0, 970), page(970, 1930, [100, 130])];
  const pdf = p.imagePdf({ bytes: jpeg, pixelWidth: 1440, pixelHeight: 3860 }, { cssWidth: 720, cssHeight: 1930, pages, title: 'الرصيد اليومي' });
  const text = latin(pdf);
  t.same([text.startsWith('%PDF-1.4\n'), text.endsWith('%%EOF\n'), pdf[9], pdf[10]], [true, true, 0x25, 0xe2], 'F1 الرأس %PDF-1.4 وسطر التعليق الثنائيّ، والتذييل %%EOF');
  const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/u.exec(text)?.[1]);
  const xref = text.slice(startxref);
  const count = Number(/^xref\n0 (\d+)\n/u.exec(xref)?.[1]);
  const offsets = [...xref.matchAll(/^(\d{10}) 00000 n \n/gmu)].map((match) => Number(match[1]));
  t.same([xref.startsWith('xref\n0 9\n0000000000 65535 f \n'), count, offsets.length], [true, 9, 8], 'F2 جدول الإحالات بتسعة كائنات (الفهرس والصفحات والمعلومات والصورة وصفحتان بمحتواهما)، كلّ سطر عشرون بايتاً');
  t.same(
    offsets.map((offset, index) => text.startsWith(`${index + 1} 0 obj\n`, offset)),
    Array(8).fill(true),
    'F2 كلّ موضع في جدول الإحالات يقع على «N 0 obj» بالبايت',
  );
  t.ok(/\/Trailer|trailer\n<< \/Size 9 \/Root 1 0 R \/Info 3 0 R >>/u.test(text), 'F2 الخاتمة بالعدد والفهرس والمعلومات');
  t.ok(text.includes('<< /Type /Pages /Kids [5 0 R 7 0 R] /Count 2 >>'), 'F3 الصفحات بعددها');
  const hex = `FEFF${[...'الرصيد اليومي'].map((ch) => ch.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()).join('')}`;
  t.ok(text.includes(`/Title <${hex}>`), 'F4 العنوان UTF-16BE ست عشريّاً بعلامة BOM');
  const imageAt = text.indexOf('4 0 obj\n');
  const imageHead = `4 0 obj\n<< /Type /XObject /Subtype /Image /Width 1440 /Height 3860 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`;
  t.same(
    [text.startsWith(imageHead, imageAt), Buffer.from(pdf.slice(imageAt + imageHead.length, imageAt + imageHead.length + jpeg.length)).equals(Buffer.from(jpeg)), text.startsWith('\nendstream\nendobj\n', imageAt + imageHead.length + jpeg.length)],
    [true, true, true],
    'F5 الصورة كائنٌ واحد بأبعادها بالنقاط الضوئية وDCTDecode، وبياناتها كما هي حرفاً بطولها',
  );
  const scale = (595.28 - 2 * 28.35) / 720;
  const width = 720 * scale;
  const height = 1930 * scale;
  const top = 841.89 - 28.35;
  const block = (from, to, at) => ['q', `${round2(28.35)} ${round2(at - (to - from) * scale)} ${round2(width)} ${round2((to - from) * scale)} re W n`, `${round2(width)} 0 0 ${round2(height)} ${round2(28.35)} ${round2(at + from * scale - height)} cm`, '/Im0 Do', 'Q'];
  const contentOf = (id) => /stream\n([\s\S]*?)\nendstream/u.exec(text.slice(offsets[id - 1]))?.[1];
  t.same(contentOf(6), block(0, 970, top).join('\n'), 'F6 الصفحة الأولى: قصٌّ بمستطيل شريحتها تحت الحاشية العليا، ثمّ الصورة كلّها بعرض الورقة مزاحةً حتى أعلى الشريحة');
  t.same(
    contentOf(8),
    [...block(100, 130, top), ...block(970, 1930, top - 30 * scale)].join('\n'),
    'F7 الصفحة الثانية: صفّ أسماء الأعمدة (100–130) أعلاها، ثمّ شريحتها تحته مباشرةً',
  );
  t.ok(text.includes('/MediaBox [0 0 595.28 841.89]') && text.includes('/Resources << /XObject << /Im0 4 0 R >> >> /Contents 6 0 R'), 'F8 كلّ صفحة A4 تشير إلى الصورة الواحدة وإلى محتواها');
  const untitled = latin(p.imagePdf({ bytes: jpeg, pixelWidth: 3, pixelHeight: 4 }, { cssWidth: 720, cssHeight: 960, pages: [] }));
  t.same([untitled.includes('/Title'), untitled.includes('/Count 1 >>')], [false, true], 'F9 بلا عنوان ولا شرائح: بلا /Title وصفحة واحدة للصورة كلّها');
  t.ok(!/[eE][+-]?\d/u.test(text.slice(text.indexOf('5 0 obj'), startxref).replace(/\/Type|\/Page|\/Parent|\/Resources|\/XObject|\/Contents|endobj|endstream|stream/gu, '')), 'F10 لا صيغة أُسّية في أرقام الصفحات (PDF لا يقرؤها)');
}
