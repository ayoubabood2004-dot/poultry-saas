// لوحة المفاتيح في كلّ نافذة ونموذج (كلمة المالك 2026-11-26، عقد 0037 الجزء K؛ والزبون: «أكتب 25000 وأدوس إنتر يحفظ، مو أشيل الماوس وأضغط احفظ»):
// Enter في خانة ينقل إلى الخانة التالية في نطاقها (نموذجها، وإلّا أقرب role="dialog") ويحدّد نصّها، وفي آخر خانة يضغط زرّ الحفظ الافتراضيّ إن كان مفعّلاً
// (click لا requestSubmit: هذا يتجاهل disabled)؛ وCtrl+Enter (Cmd+Enter) يحفظ من أيّ خانة، والملاحظة (textarea) معها. مستمع واحد على الوثيقة بمرحلة
// الفقاعة: معالج المكوّن يسبقه (النوافذ في body وReact يستمع هناك أيضاً)، فما عالجه (preventDefault) لا يُلمس؛ ولا يُلمس التركيب (IME) ولا معدِّل آخر
// ولا الضغطة المكرّرة (Enter مضغوط لا يقفز الخانات ويحفظ)، ولا الأزرار والمربّعات، ولا ما في [data-enter="own"] (المنتقيات والماسح وورقة القاعة: Enter لها).

/** أنواع input ليست خانة كتابة. */
const NOT_TEXT = /^(button|submit|reset|checkbox|radio|file|image|range|color|hidden)$/;

export type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** خانة كتابة: input نصّيّ (نصّ وبحث وهاتف ورقم وتاريخ…) أو select أو textarea. بالاسم لا بـinstanceof (الفحوص على DOM صغير). */
export function isField(node: EventTarget | null): node is Field {
  const name = (node as Element | null)?.localName;
  return name === 'select' || name === 'textarea' || (name === 'input' && !NOT_TEXT.test((node as HTMLInputElement).type));
}

/** خانة يُنتقل إليها: مفعّلة وتُكتب وظاهرة وفي ترتيب Tab. */
const usable = (field: Field): boolean => !field.disabled && !(field as HTMLInputElement).readOnly && field.tabIndex >= 0 && field.getClientRects().length > 0;

/** أوّل خانة تُكتب في العنصر (النافذة حين تُفتح على الحاسوب). */
export function firstField(root: Element): Field | null {
  return Array.from(root.querySelectorAll('input,select,textarea')).find((node): node is Field => isField(node) && usable(node)) ?? null;
}

/** التركيز على الخانة وتحديد نصّها؛ الملاحظة بلا تحديد (Enter فيها كان سيستبدل النصّ المحدَّد بسطر). */
export function focusField(field: Field): void {
  field.focus();
  if (field.localName === 'input') (field as HTMLInputElement).select();
}

export function onFormKey(event: KeyboardEvent): void {
  const field = event.target;
  const save = event.ctrlKey || event.metaKey;
  // 229: Enter يختم التركيب في سفاري وisComposing فيه false.
  if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey || event.shiftKey || event.repeat || !isField(field)) return;
  if ((!save && field.localName === 'textarea') || field.closest('[data-enter="own"]')) return;
  const scope = field.form ?? field.closest('[role="dialog"]');
  if (!scope) return;
  event.preventDefault();
  // عناصر النموذج بترتيبها ومعها أزرار الذيل المربوطة بـform=، أو عناصر النافذة.
  const nodes = Array.from<Element>(scope.localName === 'form' ? (scope as HTMLFormElement).elements : scope.querySelectorAll('input,select,textarea,button'));
  if (!save) {
    const fields = nodes.filter((node): node is Field => node === field || (isField(node) && usable(node)));
    const next = fields[fields.indexOf(field) + 1];
    if (next) return focusField(next);
  }
  const submit = nodes.find((node) => node.localName === 'button' && (node as HTMLButtonElement).type === 'submit') as HTMLButtonElement | undefined;
  if (submit && !submit.disabled) submit.click();
}

/**
 * onSubmit لنموذج يحفظ بـonClick زرّه (type="submit"، أو form={id} من ذيل النافذة): النموذج نطاق Enter وزرّه الافتراضيّ، والإرسال لا يغادر الصفحة
 * ولا يصل نموذجاً أباً في شجرة React (النافذة بوّابة، وsubmit يفقّع في الشجرة). Enter وimplicit submission ونقرة الفأرة كلّها نقرة على الزرّ، فالحفظ مرّة.
 */
export function noSubmit(event: { preventDefault(): void; stopPropagation(): void }): void {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * onKeyDown لبحث يملك Enter ([data-enter="own"]) بلا فعل له: لا ينتقل إلى الخانة التالية (والجهة أو المادّة لم تُختر بعد) ولا يرسل نموذجه إرسالاً ضمنيّاً.
 */
export function ownEnter(event: { key: string; nativeEvent: { isComposing: boolean }; preventDefault(): void }): void {
  if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault();
}

let installed = false;

export function initFormKeys(target: Pick<Document, 'addEventListener'> = document): void {
  if (installed) return;
  installed = true;
  target.addEventListener('keydown', onFormKey);
}
