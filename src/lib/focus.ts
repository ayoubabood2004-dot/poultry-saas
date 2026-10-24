// التركيز بالنوافذ اللي تغطّي الصفحة (Dialog والقائمة بالموبايل): يدخل النافذة لمّا تنفتح، Tab وShift+Tab
// يدورون جوّا العليا بس، ويرجع مكانه لمّا تنسدّ. بلاها Shift+Tab من زرّ السدّ يوصل لرابط ورا الغطاء،
// وEnter عليه يطلع من نموذج مليان بلا سؤال، والقارئ الصوتي يبقى على زرّ «القائمة» ورا الورقة.

interface Trap {
  container: HTMLElement;
  /** العنصر اللي يرجعله التركيز لمّا تنسدّ. */
  previous: HTMLElement | null;
}

const traps: Trap[] = [];

/** النافذة العليا بس تاخذ Esc وTab: نافذة «تطلع بلا حفظ؟» فوك نموذج، أو نافذة فوك القائمة. */
export function isTopModal(element: HTMLElement | null): boolean {
  return element !== null && traps[traps.length - 1]?.container === element;
}

/**
 * وين يروح Tab: count عدد العناصر اللي تنركّز بالنافذة، index مكان التركيز بيها (-1 = النافذة نفسها أو برّاها).
 * يرجّع رقم العنصر، أو -1 للنافذة نفسها (ماكو شي ينركّز)، أو null حتى يكمّل المتصفّح طبيعي.
 */
export function wrapTab(count: number, index: number, backward: boolean): number | null {
  if (count === 0) return -1;
  if (index < 0) return backward ? count - 1 : 0;
  if (backward && index === 0) return count - 1;
  if (!backward && index === count - 1) return 0;
  return null;
}

const CANDIDATES = 'a[href], area[href], button, input, select, textarea, iframe, summary, [contenteditable]:not([contenteditable="false"]), [tabindex]';

function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(CANDIDATES)).filter((element) => {
    if (element.tabIndex < 0 || element.matches(':disabled') || element.closest('[inert]')) return false;
    if (element instanceof HTMLInputElement && element.type === 'hidden') return false;
    // راديو بمجموعة: Tab ياخذ المختار بس (أو أوّلها إذا ماكو مختار)، مثل المتصفّح.
    if (element instanceof HTMLInputElement && element.type === 'radio' && element.name !== '') {
      const group = Array.from(root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(element.name)}"]`));
      if ((group.find((radio) => radio.checked) ?? group[0]) !== element) return false;
    }
    // display:none (hidden، md:hidden) ما إله مستطيلات وما ينركّز.
    return element.getClientRects().length > 0;
  });
}

/** دورة Tab: عناصر النافذة، وبعدها أزرار التنبيهات (فوك كل النوافذ) حتى «حدّث القائمة» ينوصل بلوحة المفاتيح. */
function cycle(container: HTMLElement): HTMLElement[] {
  const toaster = document.querySelector<HTMLElement>('[data-toaster]');
  return toaster ? [...tabbables(container), ...tabbables(toaster)] : tabbables(container);
}

function focusInto(container: HTMLElement): void {
  const preferred = container.querySelector<HTMLElement>('[data-autofocus]');
  preferred?.focus();
  // المفضّل يمكن معطّل (زرّ «لا، ارجع» وقت الشغل): التركيز على النافذة نفسها حتى ما يبقى ورا الغطاء.
  if (document.activeElement !== preferred) container.focus();
}

/**
 * يحبس التركيز بنافذة لحد ما تنسدّ: يدخلها ([data-autofocus] وإلا النافذة نفسها، فلازم tabIndex={-1})،
 * ويرجّع دالّة السدّ اللي ترجع التركيز للعنصر اللي فتحها.
 */
export function trapFocus(container: HTMLElement): () => void {
  const trap: Trap = { container, previous: document.activeElement instanceof HTMLElement ? document.activeElement : null };
  traps.push(trap);
  focusInto(container);

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey || !isTopModal(container)) return;
    const items = cycle(container);
    const active = document.activeElement;
    const index = active instanceof HTMLElement ? items.indexOf(active) : -1;
    // عنصر جوّا النافذة ما ينوصله بـTab (tabindex=-1): المتصفّح يعرف الجاي.
    if (index < 0 && active !== container && active instanceof Node && container.contains(active)) return;
    let target = wrapTab(items.length, index, event.shiftKey);
    if (target === null && index >= 0) {
      // العبور بين النافذة والتنبيهات صريح: ترتيب الصفحة بين البوّابتين حسب أيّها انفتحت أوّل، مو ترتيب الدورة.
      const step = event.shiftKey ? index - 1 : index + 1;
      const current = items[index];
      const next = items[step];
      if (current && next && container.contains(current) !== container.contains(next)) target = step;
    }
    if (target === null) return;
    event.preventDefault();
    (target < 0 ? container : items[target])?.focus();
  };
  document.addEventListener('keydown', onKey);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    document.removeEventListener('keydown', onKey);
    const index = traps.indexOf(trap);
    if (index < 0) return;
    const wasTop = index === traps.length - 1;
    traps.splice(index, 1);
    if (wasTop) {
      if (trap.previous?.isConnected) trap.previous.focus();
      return;
    }
    // انسدّت من تحت وحدة ثانية: ما تسحب التركيز من العليا، بس اللي فتح العليا من جوّاها يروح وياها،
    // فالعليا ترجع التركيز للي فتح هاي («اطلع وضيّع التعديلات» تسدّ النافذتين سوا).
    for (const above of traps.slice(index)) {
      if (above.previous && container.contains(above.previous)) above.previous = trap.previous;
    }
  };
}
