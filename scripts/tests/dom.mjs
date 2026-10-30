// DOM صغير يشغّل react-dom/client الحقيقي بـnode لفحوص الشاشات التفاعلية (inventory-flows.test): اللي يحتاجه React 18 حتى
// يركّب ويحدّث ويوزّع الأحداث، وأدوات تلكى العقد وتطلق الأحداث. مو ملف فحص (ما ينتهي بـ.test.mjs).

class Style {
  setProperty(name, value) {
    this[name] = value;
  }
  removeProperty(name) {
    delete this[name];
  }
}

export class Node {
  constructor(nodeType, nodeName, ownerDocument) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
    this._listeners = [];
  }
  get firstChild() {
    return this.childNodes[0] ?? null;
  }
  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }
  get nextSibling() {
    const p = this.parentNode;
    if (!p) return null;
    return p.childNodes[p.childNodes.indexOf(this) + 1] ?? null;
  }
  get previousSibling() {
    const p = this.parentNode;
    if (!p) return null;
    return p.childNodes[p.childNodes.indexOf(this) - 1] ?? null;
  }
  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
  }
  appendChild(child) {
    if (child.nodeType === 11) {
      for (const c of [...child.childNodes]) this.appendChild(c);
      return child;
    }
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  insertBefore(child, ref) {
    if (ref === null || ref === undefined) return this.appendChild(child);
    if (child.parentNode) child.parentNode.removeChild(child);
    const i = this.childNodes.indexOf(ref);
    child.parentNode = this;
    this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, child);
    return child;
  }
  removeChild(child) {
    const i = this.childNodes.indexOf(child);
    if (i >= 0) this.childNodes.splice(i, 1);
    child.parentNode = null;
    return child;
  }
  contains(other) {
    for (let n = other; n; n = n.parentNode) if (n === this) return true;
    return false;
  }
  get textContent() {
    if (this.nodeType === 3 || this.nodeType === 8) return this.nodeValue;
    return this.childNodes.map((c) => c.textContent).join('');
  }
  set textContent(value) {
    if (this.nodeType === 3 || this.nodeType === 8) {
      this.nodeValue = String(value);
      return;
    }
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    if (value !== '' && value !== null && value !== undefined) this.appendChild(this.ownerDocument.createTextNode(String(value)));
  }
  addEventListener(type, fn, options) {
    const capture = typeof options === 'boolean' ? options : Boolean(options && options.capture);
    this._listeners.push({ type, fn, capture });
  }
  removeEventListener(type, fn, options) {
    const capture = typeof options === 'boolean' ? options : Boolean(options && options.capture);
    this._listeners = this._listeners.filter((l) => !(l.type === type && l.fn === fn && l.capture === capture));
  }
  dispatchEvent(event) {
    const path = [];
    for (let n = this; n; n = n.parentNode) path.push(n);
    if (this.ownerDocument && path[path.length - 1] === this.ownerDocument) path.push(this.ownerDocument.defaultView);
    event.target = event.target ?? this;
    const call = (node, capture) => {
      for (const l of [...node._listeners]) {
        if (l.type !== event.type || l.capture !== capture) continue;
        event.currentTarget = node;
        l.fn.call(node, event);
      }
    };
    for (let i = path.length - 1; i >= 1; i -= 1) {
      if (event._stop) break;
      event.eventPhase = 1;
      call(path[i], true);
    }
    if (!event._stop) {
      event.eventPhase = 2;
      call(this, true);
      call(this, false);
    }
    if (event.bubbles) {
      for (let i = 1; i < path.length; i += 1) {
        if (event._stop) break;
        event.eventPhase = 3;
        call(path[i], false);
      }
    }
    return !event.defaultPrevented;
  }
}

export class Text extends Node {
  constructor(text, doc) {
    super(3, '#text', doc);
    this.nodeValue = text;
  }
}

export class Comment extends Node {
  constructor(text, doc) {
    super(8, '#comment', doc);
    this.nodeValue = text;
  }
}

export class Element extends Node {
  constructor(tag, ns, doc) {
    super(1, ns === 'http://www.w3.org/1999/xhtml' ? tag.toUpperCase() : tag, doc);
    this.localName = tag;
    this.tagName = this.nodeName;
    this.namespaceURI = ns;
    this._attrs = new Map();
    this.style = new Style();
  }
  setAttribute(name, value) {
    this._attrs.set(name, String(value));
  }
  setAttributeNS(_ns, name, value) {
    this._attrs.set(name, String(value));
  }
  getAttribute(name) {
    return this._attrs.has(name) ? this._attrs.get(name) : null;
  }
  removeAttribute(name) {
    this._attrs.delete(name);
  }
  removeAttributeNS(_ns, name) {
    this._attrs.delete(name);
  }
  hasAttribute(name) {
    return this._attrs.has(name);
  }
  get type() {
    return (this.getAttribute('type') ?? (this.localName === 'button' ? 'submit' : 'text')).toLowerCase();
  }
  set type(value) {
    this.setAttribute('type', value);
  }
  get id() {
    return this.getAttribute('id') ?? '';
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
  blur() {}
  get options() {
    return descendants(this).filter((n) => n.localName === 'option');
  }
  get children() {
    return this.childNodes.filter((n) => n.nodeType === 1);
  }
  querySelectorAll() {
    return [];
  }
  querySelector() {
    return null;
  }
  get outerHTML() {
    return serialize(this);
  }
}

export class OptionElement extends Element {
  get value() {
    return this.getAttribute('value') ?? this.textContent;
  }
  set value(v) {
    this.setAttribute('value', v);
  }
}

export class HTMLIFrameElement extends Element {}

export function descendants(node) {
  const out = [];
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 1) out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}

const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function serialize(node) {
  if (node.nodeType === 3) return escape(node.nodeValue);
  if (node.nodeType === 8) return '';
  if (node.nodeType !== 1) return node.childNodes.map(serialize).join('');
  const attrs = [...node._attrs].map(([k, v]) => ` ${k}="${escape(v).replace(/"/g, '&quot;')}"`).join('');
  const value = node.localName === 'input' && node.value !== undefined ? ` value="${escape(node.value)}"` : '';
  return `<${node.localName}${attrs}${value}>${node.childNodes.map(serialize).join('')}</${node.localName}>`;
}

export function installDom() {
  const saved = {};
  for (const key of ['window', 'document', 'HTMLIFrameElement', 'HTMLElement', 'Node', 'self']) saved[key] = Object.getOwnPropertyDescriptor(globalThis, key);
  const doc = new Node(9, '#document', null);
  doc.ownerDocument = null;
  doc.createElement = (tag) => (tag === 'option' ? new OptionElement(tag, 'http://www.w3.org/1999/xhtml', doc) : new Element(tag, 'http://www.w3.org/1999/xhtml', doc));
  doc.createElementNS = (ns, tag) => new Element(tag, ns, doc);
  doc.createTextNode = (text) => new Text(text, doc);
  doc.createComment = (text) => new Comment(text, doc);
  doc.oninput = null;
  doc.onchange = null;
  doc.documentElement = doc.createElement('html');
  doc.appendChild(doc.documentElement);
  doc.body = doc.createElement('body');
  doc.documentElement.appendChild(doc.body);
  doc.activeElement = null;
  doc.querySelector = () => null;
  doc.querySelectorAll = () => [];
  const win = new Node(0, '#window', null);
  win.document = doc;
  win.HTMLIFrameElement = HTMLIFrameElement;
  win.HTMLElement = Element;
  win.Node = Node;
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  win.location = { href: 'http://localhost/', origin: 'http://localhost', pathname: '/' };
  win.navigator = { onLine: true, userAgent: 'node' };
  win.getComputedStyle = () => ({});
  win.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  win.cancelAnimationFrame = (id) => clearTimeout(id);
  doc.defaultView = win;
  // window props reachable as globals too.
  Object.defineProperty(globalThis, 'window', { value: win, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'HTMLIFrameElement', { value: HTMLIFrameElement, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'HTMLElement', { value: Element, configurable: true, writable: true });
  return () => {
    for (const [key, desc] of Object.entries(saved)) {
      if (desc) Object.defineProperty(globalThis, key, desc);
      else delete globalThis[key];
    }
  };
}

export function fire(target, type, init = {}) {
  const event = {
    type,
    target,
    bubbles: init.bubbles ?? true,
    cancelable: true,
    defaultPrevented: false,
    timeStamp: Date.now(),
    isTrusted: true,
    eventPhase: 0,
    currentTarget: null,
    _stop: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this._stop = true;
    },
    ...init,
  };
  target.dispatchEvent(event);
  return event;
}

export const settle = async (rounds = 30) => {
  for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setImmediate(resolve));
};
