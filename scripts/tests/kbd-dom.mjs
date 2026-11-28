// DOM أغنى قليلاً لفحوص لوحة المفاتيح (عقد 0037 الجزء K): المطابقة والبحث بمحدِّدات بسيطة (اسم الوسم وسمات بقيمة أو بلا قيمة، مفصولة بفواصل)، وclosest،
// ونموذج الخانة (أقرب form أو form= بمعرّفه) وعناصر النموذج بترتيب الشجرة، والظهور (hidden وما في details مغلقة لا مستطيلات له)، وdisabled وreadOnly
// وtabIndex من السمات (كما يكتبها React)، وselect()، وclick() يرسل submit إلى نموذج زرّ الحفظ كالمتصفّح ولا يفعل شيئاً لزرّ معطّل. يُرقّع Element من
// dom.mjs في عملية الفحص التي تستورده وحدها (كلّ ملف فحص بعملية node وحده، run.mjs)، فلا يمسّ الفحوص الأخرى. مو ملف فحص.
import { Element, Node, descendants, fire } from './dom.mjs';

const LISTED = new Set(['input', 'select', 'textarea', 'button', 'fieldset', 'output', 'object']);
const FOCUSABLE = /^(input|select|textarea|button|a)$/;

/** محدِّد بسيط: [{ tag, attrs: [{ name, value }] }] لكلّ جزء بين الفواصل، أو null لصيغة لا يفهمها (فلا يطابق شيئاً). */
function parse(selector) {
  const parts = [];
  for (const raw of selector.split(',')) {
    const text = raw.trim();
    const match = /^([a-z][a-z0-9-]*)?((?:\[[a-z-]+(?:="[^"]*"|='[^']*')?\])*)$/i.exec(text);
    if (!match) return null;
    const attrs = [...match[2].matchAll(/\[([a-z-]+)(?:="([^"]*)"|='([^']*)')?\]/gi)].map((m) => ({ name: m[1], value: m[2] ?? m[3] ?? null }));
    parts.push({ tag: match[1]?.toLowerCase() ?? null, attrs });
  }
  return parts;
}

function matches(node, selector) {
  if (!node || node.nodeType !== 1) return false;
  const parts = parse(selector);
  if (!parts) return false;
  return parts.some((part) => (part.tag === null || node.localName === part.tag) && part.attrs.every(({ name, value }) => (value === null ? node.hasAttribute(name) : node.getAttribute(name) === value)));
}

function attrFlag(name) {
  return {
    configurable: true,
    get() {
      return this.hasAttribute(name);
    },
    set(on) {
      if (on) this.setAttribute(name, '');
      else this.removeAttribute(name);
    },
  };
}

const rootOf = (node) => {
  let n = node;
  while (n.parentNode) n = n.parentNode;
  return n;
};

/** يرقّع Element وdocument مرّة واحدة؛ يُنادى بعد installDom (للوثيقة). */
export function enrichDom(doc = globalThis.document) {
  Object.defineProperties(Element.prototype, {
    disabled: attrFlag('disabled'),
    readOnly: attrFlag('readonly'),
    isContentEditable: { configurable: true, get: () => false },
    tabIndex: {
      configurable: true,
      get() {
        const value = this.getAttribute('tabindex');
        return value !== null ? Number(value) : FOCUSABLE.test(this.localName) ? 0 : -1;
      },
      set(value) {
        this.setAttribute('tabindex', String(value));
      },
    },
    form: {
      configurable: true,
      get() {
        if (!LISTED.has(this.localName)) return undefined;
        const id = this.getAttribute('form');
        if (id !== null) return descendants(rootOf(this)).find((n) => n.localName === 'form' && n.id === id) ?? null;
        return this.closest('form');
      },
    },
    elements: {
      configurable: true,
      get() {
        if (this.localName !== 'form') return undefined;
        return descendants(rootOf(this)).filter((n) => LISTED.has(n.localName) && n.form === this);
      },
    },
  });
  Element.prototype.matches = function (selector) {
    return matches(this, selector);
  };
  Element.prototype.closest = function (selector) {
    for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (matches(n, selector)) return n;
    return null;
  };
  const queryAll = function (selector) {
    return descendants(this).filter((n) => matches(n, selector));
  };
  const query = function (selector) {
    return descendants(this).find((n) => matches(n, selector)) ?? null;
  };
  Element.prototype.querySelectorAll = queryAll;
  Element.prototype.querySelector = query;
  doc.querySelectorAll = queryAll;
  doc.querySelector = query;
  doc.getElementById = (id) => descendants(doc).find((n) => n.id === id) ?? null;
  Element.prototype.getClientRects = function () {
    if (rootOf(this) !== doc) return [];
    for (let n = this; n && n.nodeType === 1; n = n.parentNode) {
      if (n.hasAttribute('hidden')) return [];
      const parent = n.parentNode;
      if (parent && parent.localName === 'details' && !parent.hasAttribute('open') && n.localName !== 'summary') return [];
    }
    return [{}];
  };
  const focus = Element.prototype.focus;
  Element.prototype.focus = function () {
    if (this.disabled) return;
    focus.call(this);
  };
  Element.prototype.select = function () {
    const value = String(this.value ?? '');
    this.selectionStart = 0;
    this.selectionEnd = value.length;
    doc.__selected = this;
  };
  Element.prototype.click = function () {
    if (this.disabled) return;
    const event = fire(this, 'click', { button: 0, detail: 0 });
    if (event.defaultPrevented) return;
    if (this.localName === 'button' && this.type === 'submit' && this.form) fire(this.form, 'submit');
  };
  // MutationObserver صغير (childList تحت الهدف وما فيه) كالمتصفّح بعد المهمّة الصغيرة: خانة تظهر بعد فتح النافذة (مراجعة 0037 K3).
  const observers = new Set();
  globalThis.MutationObserver = class {
    constructor(callback) {
      this.callback = callback;
      this.target = null;
      this.queued = false;
    }
    observe(target) {
      this.target = target;
      observers.add(this);
    }
    disconnect() {
      observers.delete(this);
    }
    takeRecords() {
      return [];
    }
  };
  const notify = (parent) => {
    for (const observer of observers) {
      let inside = false;
      for (let n = parent; n && !inside; n = n.parentNode) inside = n === observer.target;
      if (!inside || observer.queued) continue;
      observer.queued = true;
      queueMicrotask(() => {
        observer.queued = false;
        if (observers.has(observer)) observer.callback([], observer);
      });
    }
  };
  for (const name of ['appendChild', 'insertBefore']) {
    const original = Node.prototype[name];
    Node.prototype[name] = function (...args) {
      const result = original.apply(this, args);
      notify(this);
      return result;
    };
  }
  return { Node };
}

const NO_IMPLICIT = /^(button|submit|reset|image|file|hidden)$/;

/**
 * ضغطة مفتاح على العقدة كما يطلقها المتصفّح (keydown يفقّع)، وترجع الحدث (defaultPrevented). ومعها فعل المتصفّح الافتراضيّ: Enter لم يُمنع في input
 * داخل نموذج إرسالٌ ضمنيّ يضغط زرّ النموذج الافتراضيّ إن كان مفعّلاً (ومن المربّعات أيضاً في كروم وسفاري)، لا أثناء التركيب (مراجعة 0037 K1).
 */
export function press(target, key = 'Enter', init = {}) {
  const event = fire(target, 'keydown', { key, code: key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, ...init });
  if (key === 'Enter' && !event.defaultPrevented && !init.isComposing && init.keyCode !== 229 && target?.localName === 'input' && !NO_IMPLICIT.test(target.type) && target.form) {
    const submit = target.form.elements.find((node) => node.localName === 'button' && node.type === 'submit');
    if (submit && !submit.disabled) submit.click();
  }
  return event;
}
