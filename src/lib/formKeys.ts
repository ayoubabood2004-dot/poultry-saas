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

/** مربّع اختيار أو زرّ اختيار: ليس خانة كتابة، لكنّ Enter عليه في نموذج إرسال ضمنيّ في كروم وسفاري، فيُمنع وينقل إلى الخانة التالية. */
const isToggle = (node: EventTarget | null): node is HTMLInputElement => (node as Element | null)?.localName === 'input' && /^(checkbox|radio)$/.test((node as HTMLInputElement).type);

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

/** نطاق الخانة (نموذجها، وإلّا أقرب نافذة) وعناصره بترتيبها ومعها أزرار الذيل المربوطة بـform=، وزرّ الحفظ الافتراضيّ (أوّل type="submit"). */
function scopeOf(field: Field | HTMLInputElement): { nodes: Element[]; submit: HTMLButtonElement | undefined } | null {
  const scope = field.form ?? field.closest('[role="dialog"]');
  if (!scope) return null;
  const nodes = Array.from<Element>(scope.localName === 'form' ? (scope as HTMLFormElement).elements : scope.querySelectorAll('input,select,textarea,button'));
  return { nodes, submit: nodes.find((node) => node.localName === 'button' && (node as HTMLButtonElement).type === 'submit') as HTMLButtonElement | undefined };
}

/** Enter مركّب في سفاري (229) أو أثناء التركيب (IME): لا يُلمس. */
const composing = (event: KeyboardEvent): boolean => event.isComposing || event.keyCode === 229;

export function onFormKey(event: KeyboardEvent): void {
  const field = event.target;
  const save = event.ctrlKey || event.metaKey;
  const toggle = isToggle(field);
  if (event.key !== 'Enter' || event.defaultPrevented || composing(event) || !(toggle || isField(field))) return;
  if ((!save && field.localName === 'textarea') || field.closest('[data-enter="own"]')) return;
  const scope = scopeOf(field);
  if (!scope) return;
  // كلّ Enter في خانة نموذج يُمنع: ما لا يفعله المستمع (المضغوط المكرّر وShift وAlt، وEnter على مربّع) كان إرسالاً ضمنيّاً يضغط «احفظ» من الخانة الثانية
  // (مراجعة 0037 K1: تعديل الفوج قبل العدد، و«أنتج» من كمية بلا تأكيد). وما يفعله: Enter وحده ينقل، وفي آخر خانة يحفظ؛ وCtrl/Cmd+Enter يحفظ.
  event.preventDefault();
  if (event.repeat || event.shiftKey || event.altKey) return;
  if (!save) {
    const fields = scope.nodes.filter((node): node is Field => node === field || (isField(node) && usable(node)));
    const next = fields[fields.indexOf(field) + 1];
    if (next) return focusField(next);
    // المربّع لا يحفظ بـEnter: الحفظ من آخر خانة كتابة أو Ctrl+Enter.
    if (toggle) return;
  }
  if (scope.submit && !scope.submit.disabled) scope.submit.click();
}

/**
 * Ctrl/Cmd+Enter من خانة تملك Enter ([data-enter="own"]: بحث المادّة، والكمية المطلوبة، واسم المنتج…) يحفظ كأيّ خانة (مراجعة 0037 K2): يُلتقط قبل
 * معالج المكوّن (مرحلة الالتقاط على الوثيقة) حين للنطاق زرّ حفظ مفعّل، وإلّا يُترك للمكوّن.
 */
export function onSaveKey(event: KeyboardEvent): void {
  const field = event.target;
  if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || composing(event)) return;
  if (!(isToggle(field) || isField(field)) || !field.closest('[data-enter="own"]')) return;
  const submit = scopeOf(field)?.submit;
  if (!submit || submit.disabled) return;
  event.preventDefault();
  event.stopPropagation();
  if (!event.repeat) submit.click();
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
  target.addEventListener('keydown', onSaveKey, true);
  target.addEventListener('keydown', onFormKey);
}
