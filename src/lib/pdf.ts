// ملفّ PDF من صورة التقرير (رسالة الزبون 2026-11-26: «الرصيد اليومي لمن يدزه بالواتس اب او يسويله مشاركة باي طريقة… لازم يروح على شكل بي دي اف»).
// لا مكتبة PDF (تشكيل العربية فيها غير مضمون، DayBalanceView): الصفحة تُرسم صورةً JPEG بخطوط المتصفّح نفسه (reportPdf في pages/halls/reportImage)، وهنا
// تُلفّ صفحاتٍ A4 بالطول: الصورة كائنٌ واحد في الملفّ تشير إليه كلّ صفحة، وكلّ صفحة تقصّ شريحتها منه (مستطيل قصّ ثمّ الصورة مزاحةً)، فلا تُقطع
// الصورة على لوحات ولا يتكرّر حجمها. وحدود الشرائح عند حدود الصفوف (paginate)، فلا ينقسم سطر بين صفحتين. ونصّ هذا الملفّ ASCII كلّه إلّا العنوان،
// وهو UTF-16BE بست عشريّ بعلامة BOM كما تطلب المواصفة (PDF 1.4، 7.9.2.2).

/** الورقة A4 بالنقاط (1/72 بوصة)، والحاشية 10 مم كالطباعة (@page في صفحات التقارير). */
export const A4 = { width: 595.28, height: 841.89, margin: 28.35 } as const;

/** صورة JPEG وأبعادها بالنقاط الضوئية. */
export interface PdfImage {
  bytes: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
}

/** شريحة صفحة بنقاط CSS من أعلى الصورة، وصفّ أسماء الأعمدة الذي يُكرَّر فوقها [أعلاه، أسفله] إن بدأت داخل جدول، أو null. */
export interface PdfPage {
  from: number;
  to: number;
  head: readonly [number, number] | null;
}

/** تخطيط الملفّ: عرض الصفحة المصوَّرة وارتفاعها بنقاط CSS، وشرائح الصفحات، والعنوان. */
export interface PdfLayout {
  cssWidth: number;
  cssHeight: number;
  pages: readonly PdfPage[];
  title?: string;
}

/** جدولٌ في الصورة بنقاط CSS من أعلاها: صفّ أسماء أعمدته (thead) من أعلاه إلى أسفله، وأسفل الجدول كلّه. */
export interface PdfTable {
  headTop: number;
  headBottom: number;
  bottom: number;
}

/** مقياس الصورة على الورقة: نقطة PDF لكلّ نقطة CSS، فعرض الصورة كلّه في عرض الورقة بين الحاشيتين. */
export const pdfScale = (cssWidth: number): number => (A4.width - 2 * A4.margin) / cssWidth;

/** ما تسعه الصفحة الواحدة من ارتفاع الصفحة المصوَّرة بنقاط CSS. */
export const pageCapacity = (cssWidth: number): number => (A4.height - 2 * A4.margin) / pdfScale(cssWidth);

/**
 * شرائح الصفحات: من أعلى الصورة إلى أسفلها، كلّ صفحة تنتهي عند أبعد حدٍّ مسموح (breaks: أسفل كلّ صفّ وكلّ قسم بنقاط CSS من أعلى الصورة) لا يتجاوز
 * سعتها؛ وإن لم يقع حدٌّ فيها (عنصرٌ أطول من صفحة) تُقطع عند سعتها. وصفحةٌ تبدأ داخل جسم جدول يُكرَّر فوقها صفّ أسماء أعمدته (كرأس الجدول المطبوع، رسالة
 * الزبون 2026-11-26: «بالاعلى الاسماء الدالة»)، فتسعتها أقلّ بارتفاعه. والأخيرة حتى آخر الصورة.
 */
export function paginate(breaks: readonly number[], total: number, capacity: number, tables: readonly PdfTable[] = []): PdfPage[] {
  if (!(total > 0) || !(capacity > 0)) return [{ from: 0, to: Math.max(total, 0), head: null }];
  const sorted = [...new Set(breaks.filter((at) => at > 0 && at < total))].sort((a, b) => a - b);
  const pages: PdfPage[] = [];
  let start = 0;
  let head: readonly [number, number] | null = null;
  for (;;) {
    const room = capacity - (head ? head[1] - head[0] : 0);
    // نصف نقطة سماحٌ للتقريب: صفحة ارتفاعها سعة الورقة بالضبط لا تُقسم.
    if (total - start <= room + 0.5) {
      pages.push({ from: start, to: total, head });
      return pages;
    }
    const limit = start + room;
    let cut = -1;
    for (const at of sorted) if (at > start + 1 && at <= limit) cut = at;
    if (cut < 0) cut = limit;
    pages.push({ from: start, to: cut, head });
    const inside = tables.find((table) => cut > table.headBottom + 0.5 && cut < table.bottom - 0.5);
    // صفّ أطول من نصف الصفحة لا يُكرَّر (رأسٌ غير معقول لا يمنع التقدّم): يُرسم بارتفاعه كلّه فوق الشريحة، فلو كُرّر لضاق ما تحته أو خرج عن الورقة
    // (مراجعة 2026-11-27).
    head = inside && inside.headBottom - inside.headTop <= capacity / 2 ? [inside.headTop, inside.headBottom] : null;
    start = cut;
  }
}

/** أبعاد صورة JPEG من مقطع SOF فيها (الأساسيّ والتدريجيّ وما سواهما من SOFn)، أو null لما ليس JPEG. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  const byte = (index: number): number => bytes[index] ?? 0;
  if (bytes.length < 4 || byte(0) !== 0xff || byte(1) !== 0xd8) return null;
  let at = 2;
  while (at + 3 < bytes.length) {
    if (byte(at) !== 0xff) return null;
    const marker = byte(at + 1);
    // حشوٌ بين المقاطع (0xFF مكرّراً).
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    // مقاطع بلا طول (RSTn وTEM).
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      at += 2;
      continue;
    }
    const length = (byte(at + 2) << 8) | byte(at + 3);
    if (length < 2) return null;
    const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (sof) {
      if (at + 8 >= bytes.length) return null;
      const height = (byte(at + 5) << 8) | byte(at + 6);
      const width = (byte(at + 7) << 8) | byte(at + 8);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    // بداية بيانات الصورة قبل أيّ SOF: ليس JPEG صالحاً.
    if (marker === 0xda) return null;
    at += 2 + length;
  }
  return null;
}

/** رقم في محتوى الصفحة: بمرتبتين على الأكثر وبلا صيغة أُسّية (القيم هنا إحداثيات ورقة، بين −100,000 و100,000). */
function num(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** العنوان نصّاً ست عشريّاً UTF-16BE بعلامة BOM. */
function utf16Hex(text: string): string {
  let hex = 'FEFF';
  for (let index = 0; index < text.length; index += 1) hex += text.charCodeAt(index).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

const ascii = (text: string): Uint8Array => {
  const out = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) out[index] = text.charCodeAt(index) & 0x7f;
  return out;
};

/**
 * الملفّ نفسه: الفهرس والصفحات والمعلومات والصورة (DCTDecode، فبيانات JPEG كما هي)، ثمّ لكلّ صفحة كائنها ومحتواها، ثمّ جدول الإحالات بمواضع
 * الكائنات بالبايت. كلّ صفحة: صفّ أسماء الأعمدة المكرَّر إن وُجد ثمّ شريحتها تحته، وكلٌّ منهما قصٌّ بمستطيله بين الحاشيتين ثمّ الصورة كلّها بعرض الورقة
 * مزاحةً حتى يقع أعلى ما يُقصّ منها على أعلى مستطيله.
 */
export function imagePdf(image: PdfImage, layout: PdfLayout): Uint8Array {
  const scale = pdfScale(layout.cssWidth);
  const drawnWidth = layout.cssWidth * scale;
  const drawnHeight = layout.cssHeight * scale;
  const top = A4.height - A4.margin;
  const pages: readonly PdfPage[] = layout.pages.length ? layout.pages : [{ from: 0, to: layout.cssHeight, head: null }];
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (part: Uint8Array) => {
    chunks.push(part);
    size += part.length;
  };
  const text = (value: string) => push(ascii(value));
  const object = (id: number, body: string) => {
    offsets[id] = size;
    text(`${id} 0 obj\n${body}\nendobj\n`);
  };
  const stream = (id: number, dictionary: string, data: Uint8Array) => {
    offsets[id] = size;
    text(`${id} 0 obj\n<< ${dictionary} /Length ${data.length} >>\nstream\n`);
    push(data);
    text('\nendstream\nendobj\n');
  };
  /** يرسم من الصورة الشريحة [from، to] بنقاط CSS ويضع أعلاها على الارتفاع at من أسفل الورقة (بالنقاط). */
  const slice = (from: number, to: number, at: number): string[] => {
    const height = (to - from) * scale;
    return [
      'q',
      `${num(A4.margin)} ${num(at - height)} ${num(drawnWidth)} ${num(height)} re W n`,
      `${num(drawnWidth)} 0 0 ${num(drawnHeight)} ${num(A4.margin)} ${num(at + from * scale - drawnHeight)} cm`,
      '/Im0 Do',
      'Q',
    ];
  };

  // الرأس، وسطر تعليق ببايتات فوق 127 يقول للبرامج إنّ الملفّ ثنائيّ.
  text('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const pageIds = pages.map((_, index) => 5 + index * 2);
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  object(3, `<< /Producer (poultry-saas)${layout.title ? ` /Title ${utf16Hex(layout.title)}` : ''} >>`);
  stream(4, `/Type /XObject /Subtype /Image /Width ${image.pixelWidth} /Height ${image.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, image.bytes);
  pages.forEach((page, index) => {
    const pageId = 5 + index * 2;
    const headHeight = page.head ? (page.head[1] - page.head[0]) * scale : 0;
    const content = [...(page.head ? slice(page.head[0], page.head[1], top) : []), ...slice(page.from, page.to, top - headHeight)].join('\n');
    object(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(A4.width)} ${num(A4.height)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`);
    stream(pageId + 1, '', ascii(content));
  });
  const count = 5 + pages.length * 2;
  const xref = size;
  const entries = ['0000000000 65535 f \n'];
  for (let id = 1; id < count; id += 1) entries.push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  text(`xref\n0 ${count}\n${entries.join('')}trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(size);
  let at = 0;
  for (const part of chunks) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
