import { toWesternDigits } from '../domain/normalize';

// قانون المالك (docs/DECISIONS.md، 2026-10-24): «كل الارقام تكتب باللغة الانكليزية وتدخل باللغة الانكليزية حتى لو انكتبت بالعربي».
// مستمع بمرحلة الالتقاط على الوثيقة يقلب الرقم الشرقي (٠-٩، ۰-۹، «٫»، «٬») بأي حقل لحظة الكتابة أو اللصق،
// قبل ما يقراه React (مستمعه على جذر التطبيق، تحت الوثيقة). الحقل الجديد بعدين يتبع القانون بلا ما يتذكّره أحد.

const EASTERN = /[\u{660}-\u{669}\u{6F0}-\u{6F9}\u{66B}\u{66C}]/u;

/** النصّ بأرقام غربية، أو null إذا ما بيه رقم شرقي (ماكو كتابة بلا داعي). كل حرف يقابله حرف: المؤشّر ما يتحرّك. */
export function westernize(value: string): string | null {
  return EASTERN.test(value) ? toWesternDigits(value) : null;
}

type Field = HTMLInputElement | HTMLTextAreaElement;

function isTextArea(target: unknown): target is HTMLTextAreaElement {
  return typeof HTMLTextAreaElement !== 'undefined' && target instanceof HTMLTextAreaElement;
}

function isField(target: EventTarget | null): target is Field {
  return (typeof HTMLInputElement !== 'undefined' && target instanceof HTMLInputElement) || isTextArea(target);
}

/**
 * يكتب القيمة بمُعيِّن النموذج الأصلي مو بمُعيِّن العقدة: React يركّب متتبّع قيمة على العقدة نفسها،
 * والكتابة من وراه تخلّيه يشوف الفرق ويطلق onChange بالقيمة الغربية. الكتابة العادية (el.value =)
 * تحدّث المتتبّع، فـReact يحسب ماكو تغيير ويبلع الحرف.
 */
function writeBehindReact(field: Field, value: string): void {
  const proto = isTextArea(field) ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(field, value);
  else field.value = value;
}

/** يقلب قيمة الحقل ويرجّع المؤشّر بمكانه. true إذا تغيّرت. */
function westernizeField(field: Field): boolean {
  const next = westernize(field.value);
  if (next === null) return false;
  // type=number وأخواته: selectionStart يرجع null وsetSelectionRange يرمي، فالمؤشّر ينرجع بس إذا موجود.
  const start = field.selectionStart;
  const end = field.selectionEnd;
  writeBehindReact(field, next);
  if (start !== null && end !== null) field.setSelectionRange(start, end, field.selectionDirection ?? undefined);
  return true;
}

export function westernizeInput(event: Event): void {
  const field = event.target;
  if (!isField(field)) return;
  // أثناء التركيب (لوحات IME والتنبؤ) ما ينلمس الحقل حتى ما ينكسر التركيب؛ compositionend يقلبه بعدين.
  if ('isComposing' in event && (event as InputEvent).isComposing) return;
  westernizeField(field);
}

/**
 * نهاية التركيب: كروم (وأندرويد) وفايرفوكس يطلقون آخر input وisComposing بعده true، وبعد compositionend
 * ماكو input، فالرقم الشرقي يبقى بالحقل وبحالة React. هنا ينقلب، وinput مصنوع يخلّي React يشوف التغيير
 * (المستمع أعلاه يمرّ عليه وما يلاقي شرقي). سفاري يطلق input بعد compositionend، ويعبر بلا شي.
 */
export function westernizeComposed(event: Event): void {
  const field = event.target;
  if (!isField(field)) return;
  if (westernizeField(field)) field.dispatchEvent(new Event('input', { bubbles: true }));
}

let installed = false;

export function initWesternDigits(target: Pick<Document, 'addEventListener'> = document): void {
  if (installed) return;
  installed = true;
  target.addEventListener('input', westernizeInput, true);
  target.addEventListener('compositionend', westernizeComposed, true);
}
