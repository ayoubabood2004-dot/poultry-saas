// لوحة المفاتيح في كلّ نافذة ونموذج (عقد 0037 الجزء K؛ كلمة المالك 2026-11-26 بعد سؤال بخيارات: «Enter ينقل إلى الخانة التالية، وفي آخر خانة يحفظ… وCtrl+Enter
// يحفظ من أيّ خانة، وEsc يغلق، والمؤشّر في أوّل خانة عند فتح النافذة على الحاسوب»؛ والزبون: «أكتب 25000 وأدوس إنتر يحفظ، مو أشيل الماوس وأضغط احفظ»).
// المستمع الحقيقيّ (lib/formKeys) على DOM صغير أغنى قليلاً (kbd-dom.mjs)، وreact-dom/client الحقيقيّ للمكوّنات:
// R القواعد على DOM بلا React: Enter ينقل إلى الخانة التالية المتاحة ويحدّد نصّها (يتخطّى المعطّلة والمقروءة فقط والمخفيّة والمربّعات)، وفي آخر خانة يضغط زرّ
//   الحفظ الافتراضيّ مرّة (الأوّل في ترتيب عناصر النموذج، ومعه زرّ الذيل المربوط بـform=)، والمعطّل لا شيء ولا إرسال ضمنيّ؛ وCtrl/Cmd+Enter يحفظ من أوّل خانة
//   ومن الملاحظة، وEnter في الملاحظة سطر؛ وتُترك: التركيب (IME) والضغطة المكرّرة وShift/Alt وما عالجه المكوّن وما في [data-enter="own"] وما بلا نطاق.
// P منتقٍ يملك Enter (React): معالجه يسبق المستمع، فلا ينتقل ولا يُرسل؛ والمنتقيات الحقيقية (ItemPicker) لا تُرسل نموذج سطرها بلا مادّة.
// D النافذة: بمؤشّر دقيق أوّل خانة متاحة مركَّزة ونصّها محدَّد، وبلمس النافذة نفسها كما كان، و[data-autofocus] يغلب.
// E من البداية إلى الحفظ بلوحة المفاتيح على نوافذ حقيقية بعد تحويلها إلى نماذج: «تعديل فوج» (editFlock مرّة بالمكتوب)، وإرسال علف الجولة (sendFlockFeed مرّة
//   بالكمية بوحدة الأساس)، و«إلغاء البيع» بسببه (voidSale مرّة بالسبب، ConfirmDialog بخانته)، و«ألغِ الورقة» (VoidDocDialog).
// H نافذتا القاعة والفوج بعد تحويلهما (الجزء H، ودمجهما هنا): «قاعة جديدة» الاسم ⏎ ← السعة، و«25000 ⏎» يحفظ مرّة (createHall بلا فأرة، كلمة الزبون نفسها)؛
//   و«عدّل القاعة» ⏎ ⏎ يحفظ بنسختها ولا يفتح «احذف القاعة»؛ و«فوج جديد» التاريخ ⏎ العدد ⏎ العمر ⏎ السلالة ⏎ يفتح الفوج مرّة.
// كلّ فحص هنا يفشل على الشفرة قبل هذا التغيير (لا lib/formKeys ولا تركيز أوّل خانة ولا نماذج النوافذ)، إلّا ما وُسم «ضابط».
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, fire, installDom, settle } from './dom.mjs';
import { enrichDom, press } from './kbd-dom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// core بديل لكلّ وحدة في src/lib/repo: النداء يُسجَّل، والجواب من globalThis.__kb.rpc باسم الدالّة.
const CORE = `
export const REQUEST_TIMEOUT_MS = 15000;
export const OFFLINE_SESSION_MS = 1000;
export const call = (fn, args) => {
  globalThis.__kb.calls.push([fn, args]);
  const answer = globalThis.__kb.rpc[fn];
  return answer ? Promise.resolve(answer(args)) : new Promise(() => {});
};
export const send = async (make) => ({ result: await make(globalThis.__kb?.db ?? null), wasOnline: true });
export const classifyPostgrest = (error) => error;
export const explained = async (error) => error;
export const updatedRows = (answer) => (answer.data === null ? [] : Array.isArray(answer.data) ? answer.data : [answer.data]);
export const authed = async () => ({ db: null });
export const unknownConstraint = () => '';
export const notConnected = () => { throw new Error('not_connected'); };
export const withTimeout = (promise) => promise;
export const violatedConstraint = () => null;
export const violatedUnique = () => null;
export const isOnline = () => true;
export const isRetryableAuth = () => false;
export const isTransientSession = () => false;
export const readSession = async () => ({ session: null });`;

const plugins = [
  {
    name: 'kb-core',
    setup(b) {
      b.onResolve({ filter: /^\.\/core$/ }, (args) => (/src[\\/]lib[\\/]repo[\\/][^\\/]+\.ts$/u.test(args.importer) ? { path: 'core', namespace: 'kb-core' } : undefined));
      b.onLoad({ filter: /.*/, namespace: 'kb-core' }, () => ({ contents: CORE, resolveDir: ROOT, loader: 'js' }));
    },
  },
];

const load = async (contents) => {
  const result = await build({
    stdin: { contents, resolveDir: ROOT, loader: 'tsx' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    jsx: 'automatic',
    logLevel: 'silent',
    loader: { '.css': 'empty' },
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
    plugins,
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

/** نداء قد يرمي على الشفرة القديمة (وحدة غير موجودة): نتيجته أو «threw:…»، فيفشل كلّ فحص وحده بدل أن يسقط الملفّ. */
const safe = async (fn) => {
  try {
    return await fn();
  } catch (error) {
    return `threw:${error?.message ?? error}`;
  }
};

export default async function (t) {
  const restore = installDom();
  const savedMedia = globalThis.window.matchMedia;
  const pointer = (fine) => {
    globalThis.window.matchMedia = (query) => ({ matches: fine ? query === '(pointer: fine)' : query === '(pointer: coarse)', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  };
  try {
    enrichDom();
    const doc = globalThis.document;
    const body = doc.body;
    const h = (tag, attrs = {}, ...kids) => {
      const node = doc.createElement(tag);
      for (const [key, value] of Object.entries(attrs)) {
        if (key === 'value') node.value = value;
        else node.setAttribute(key, value === true ? '' : String(value));
      }
      for (const kid of kids) node.appendChild(typeof kid === 'string' ? doc.createTextNode(kid) : kid);
      return node;
    };
    const active = () => doc.activeElement;
    const selected = () => doc.__selected ?? null;
    const name = (node) => node?.getAttribute?.('data-name') ?? node?.getAttribute?.('data-action') ?? node?.localName ?? null;

    // ── R: القواعد على DOM بلا React ─────────────────────────────────────────────────────────────────────────────────
    const keys = await safe(() => load("export * from './src/lib/formKeys.ts';"));
    const installed = await safe(() => {
      keys.initFormKeys(doc);
      return 'ok';
    });
    t.eq(installed, 'ok', 'R lib/formKeys موجود ومستمعه يُركَّب على الوثيقة');
    {
      // نافذة فيها نموذج: خانات متاحة وغير متاحة بترتيبها، والذيل بزرّ «لا» وزرّ الحفظ المربوط بـform=.
      const a = h('input', { 'data-name': 'a', value: '10' });
      const b = h('input', { 'data-name': 'b', disabled: true });
      const c = h('input', { 'data-name': 'c', readonly: true, value: 'r' });
      const hd = h('input', { 'data-name': 'hd', hidden: true });
      const cb = h('input', { 'data-name': 'cb', type: 'checkbox' });
      const neg = h('input', { 'data-name': 'neg', tabindex: '-1' });
      const d = h('input', { 'data-name': 'd', value: '25000', inputmode: 'numeric' });
      const sel = h('select', { 'data-name': 'sel' }, h('option', { value: '1' }, 'واحد'));
      const x = h('input', { 'data-name': 'x' });
      const closed = h('details', {}, h('summary', {}, 'المزيد'), x);
      const last = h('input', { 'data-name': 'last', type: 'date' });
      const ownInput = h('input', { 'data-name': 'own' });
      const own = h('div', { 'data-enter': 'own' }, ownInput);
      const form = h('form', { id: 'kb-f1' }, a, b, c, hd, cb, neg, d, sel, closed, own, last);
      const cancel = h('button', { type: 'button', 'data-name': 'cancel' }, 'لا، تراجع');
      const save = h('button', { type: 'submit', form: 'kb-f1', 'data-name': 'save' }, 'احفظ');
      const dialog = h('div', { role: 'dialog', tabindex: '-1' }, h('div', {}, form), h('footer', {}, cancel, save));
      body.appendChild(dialog);
      let submits = 0;
      let clicks = 0;
      form.addEventListener('submit', (event) => {
        submits += 1;
        event.preventDefault();
      });
      save.addEventListener('click', () => {
        clicks += 1;
      });

      a.focus();
      const first = press(a);
      t.same([name(active()), name(selected()), first.defaultPrevented, submits], ['d', 'd', true, 0], 'R Enter ينقل إلى الخانة التالية المتاحة ويحدّد نصّها: يتخطّى المعطّلة والمقروءة فقط والمخفيّة والمربّع وما خارج Tab');
      press(d);
      t.eq(name(active()), 'sel', 'R والقائمة (select) خانة يُنتقل إليها');
      press(sel);
      t.eq(name(active()), 'own', 'R ما في details مغلقة لا يُنتقل إليه، وخانة المنتقي ([data-enter="own"]) يُنتقل إليها كغيرها');
      // خانة [data-enter="own"] كمكوّناتها الحقيقية: معالجها يملك Enter ويمنعه (المستمع بعده لا يلمسه).
      let owns = 0;
      ownInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        owns += 1;
      });
      ownInput.focus();
      const owned = press(ownInput);
      t.same([name(active()), owned.defaultPrevented, submits, owns], ['own', true, 0, 1], 'R ضابط: Enter في [data-enter="own"] لمعالجه: لا انتقال ولا حفظ');
      press(ownInput, 'Enter', { ctrlKey: true });
      t.same([submits, owns], [1, 1], 'R وCtrl+Enter فيه يحفظ قبل معالجه (مراجعة K2: كان لا يحفظ)');
      submits = 0;
      clicks = 0;
      last.focus();
      const saved = press(last);
      t.same([submits, clicks, name(active()), saved.defaultPrevented], [1, 1, 'last', true], 'R Enter في آخر خانة يضغط زرّ الحفظ المربوط بـform= مرّة واحدة (نقرة ثمّ إرسال)');

      save.setAttribute('disabled', '');
      const blocked = press(last);
      t.same([submits, clicks, blocked.defaultPrevented], [1, 1, true], 'R زرّ الحفظ معطّل: لا نقرة ولا إرسال، ولا إرسال ضمنيّ من المتصفّح (المنع)');
      save.removeAttribute('disabled');

      a.focus();
      press(a, 'Enter', { ctrlKey: true });
      t.same([submits, name(active())], [2, 'a'], 'R Ctrl+Enter من أوّل خانة يحفظ ولا ينتقل');
      press(d, 'Enter', { metaKey: true });
      t.eq(submits, 3, 'R وCmd+Enter (ماك) كذلك');

      a.focus();
      const shift = press(a, 'Enter', { shiftKey: true });
      const alt = press(a, 'Enter', { altKey: true });
      t.same([name(active()), shift.defaultPrevented, alt.defaultPrevented, submits], ['a', true, true, 3], 'R Shift+Enter وAlt+Enter لا ينقلان ولا يحفظان، والإرسال الضمنيّ ممنوع (مراجعة K1: كان يحفظ من الخانة الأولى)');
      const composing = press(a, 'Enter', { isComposing: true });
      t.same([name(active()), composing.defaultPrevented], ['a', false], 'R ضابط: التركيب بلوحات الهاتف (IME) لا يُقطع: Enter فيه يُترك');
      const safari = press(a, 'Enter', { keyCode: 229 });
      t.same([name(active()), safari.defaultPrevented], ['a', false], 'R ضابط: وEnter يختم التركيب في سفاري (keyCode 229) كذلك');
      const repeat = press(a, 'Enter', { repeat: true });
      t.same([name(active()), repeat.defaultPrevented, submits], ['a', true, 3], 'R Enter المضغوط (المكرّر) لا يقفز الخانات ولا يحفظ: الإرسال الضمنيّ ممنوع (مراجعة K1)');
      const handled = (event) => event.preventDefault();
      a.addEventListener('keydown', handled);
      press(a);
      t.same([name(active()), submits], ['a', 3], 'R ما عالجه المكوّن (preventDefault قبله) لا يُلمس');
      a.removeEventListener('keydown', handled);
      const numpad = press(a, 'Enter', { code: 'NumpadEnter' });
      t.same([name(active()), numpad.defaultPrevented], ['d', true], 'R Enter لوحة الأرقام كـEnter (key واحد)');
      cb.focus();
      const toggle = press(cb);
      t.same([toggle.defaultPrevented, name(active()), submits], [true, 'd', 3], 'R Enter على مربّع اختيار في نموذج ينقل إلى الخانة التالية ولا يحفظ (مراجعة K1: كان إرسالاً ضمنيّاً)');
      cb.focus();
      press(cb, 'Enter', { ctrlKey: true });
      t.eq(submits, 4, 'R وCtrl+Enter منه يحفظ');
      cancel.focus();
      t.eq(press(cancel).defaultPrevented, false, 'R ضابط: وعلى زرّ يُترك (نقرته)');
      body.removeChild(dialog);
    }
    {
      // الملاحظة: Enter فيها سطر، والانتقال إليها بلا تحديد، وCtrl+Enter منها يحفظ.
      const x2 = h('input', { 'data-name': 'x2', value: 'ا' });
      const note = h('textarea', { 'data-name': 'note', value: 'سطر أوّل' });
      const form = h('form', { id: 'kb-f2' }, x2, note);
      const save = h('button', { type: 'submit', form: 'kb-f2' }, 'احفظ');
      const wrap = h('div', { role: 'dialog' }, form, save);
      body.appendChild(wrap);
      let submits = 0;
      form.addEventListener('submit', (event) => {
        submits += 1;
        event.preventDefault();
      });
      doc.__selected = null;
      x2.focus();
      press(x2);
      t.same([name(active()), selected()], ['note', null], 'R الانتقال إلى الملاحظة تركيز بلا تحديد (Enter فيها كان سيستبدل النصّ بسطر)');
      const plain = press(note);
      t.same([plain.defaultPrevented, submits], [false, 0], 'R ضابط: Enter في الملاحظة سطر جديد (يُترك)');
      press(note, 'Enter', { ctrlKey: true });
      t.eq(submits, 1, 'R Ctrl+Enter من الملاحظة يحفظ');
      body.removeChild(wrap);
    }
    {
      // بلا نطاق (بحث الصفحة): لا شيء.
      const free = h('input', { 'data-name': 'free', type: 'search' });
      const next = h('input', { 'data-name': 'next' });
      const page = h('div', {}, free, next);
      body.appendChild(page);
      free.focus();
      const event = press(free);
      t.same([name(active()), event.defaultPrevented], ['free', false], 'R ضابط: خانة بلا نموذج ولا نافذة (بحث الصفحة): لا شيء');
      body.removeChild(page);
    }
    {
      // نافذة بلا نموذج: الانتقال داخلها، وآخر خانة لا شيء بلا زرّ حفظ، وزرّ submit فيها يُضغط.
      const p = h('input', { 'data-name': 'p' });
      const q = h('input', { 'data-name': 'q' });
      const sheet = h('div', { role: 'dialog' }, p, q);
      body.appendChild(sheet);
      p.focus();
      press(p);
      t.eq(name(active()), 'q', 'R نافذة بلا نموذج: النطاق النافذة');
      const none = press(q);
      t.same([name(active()), none.defaultPrevented], ['q', true], 'R آخر خانة بلا زرّ حفظ: لا شيء');
      let clicked = 0;
      const go = h('button', { type: 'submit' }, 'تم');
      go.addEventListener('click', () => {
        clicked += 1;
      });
      sheet.appendChild(go);
      press(q);
      t.eq(clicked, 1, 'R وزرّ submit في النافذة يُضغط');
      body.removeChild(sheet);
    }
    {
      // الزرّ الافتراضيّ أوّل زرّ حفظ بترتيب عناصر النموذج.
      const z = h('input', { 'data-name': 'z' });
      const inner = h('button', { type: 'submit', 'data-name': 'inner' }, 'أضف السطر');
      const form = h('form', { id: 'kb-f5' }, z, inner);
      const outer = h('button', { type: 'submit', form: 'kb-f5', 'data-name': 'outer' }, 'احفظ');
      const box = h('div', { role: 'dialog' }, form, outer);
      body.appendChild(box);
      const hits = [];
      for (const button of [inner, outer]) button.addEventListener('click', () => hits.push(name(button)));
      form.addEventListener('submit', (event) => event.preventDefault());
      z.focus();
      press(z);
      t.same(hits, ['inner'], 'R الزرّ الافتراضيّ أوّل زرّ حفظ في ترتيب عناصر النموذج');
      body.removeChild(box);
    }

    // ── P وD وE: المكوّنات بـreact-dom الحقيقيّ ─────────────────────────────────────────────────────────────────────────
    const m = await safe(() =>
      load(
        [
          "import { useState } from 'react';",
          "export { createElement as h } from 'react';",
          "export { createRoot } from 'react-dom/client';",
          "export { flushSync } from 'react-dom';",
          "import { Dialog } from './src/components/ui/Dialog.tsx';",
          "export { Dialog };",
          "export { ConfirmDialog } from './src/components/ui/ConfirmDialog.tsx';",
          "export { FlockEditDialog } from './src/pages/farm/FlockEditDialog.tsx';",
          "export { HallDialog, OpenFlockDialog } from './src/pages/farm/hallDialogs.tsx';",
          "export { default as RoundFeed } from './src/pages/farm/RoundFeed.tsx';",
          "export { SaleVoidDialog } from './src/pages/sales/SaleVoidDialog.tsx';",
          "export { VoidDocDialog } from './src/pages/inventory/stock-shared.tsx';",
          "export { ItemPicker } from './src/pages/inventory/stock-shared.tsx';",
          "export { onlineStore } from './src/lib/online.ts';",
          "export { localDay, addDays } from './src/domain/dates.ts';",
          "export { fmtDay } from './src/lib/format.ts';",
          // منتقٍ يملك Enter: معالجه يختار ويمنع.
          'export function PickerForm({ onPick, onSubmit }) {',
          '  return (',
          '    <>',
          '      <form id="kb-p" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>',
          '        <input data-name="before" />',
          "        <input data-name=\"picker\" onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onPick(); } }} />",
          '        <input data-name="after" />',
          '      </form>',
          '      <button type="submit" form="kb-p">احفظ</button>',
          '    </>',
          '  );',
          '}',
          // نافذة بخانات: الأولى مقروءة فقط والثانية معطّلة، ثمّ «25».
          'export function LateField({ show }) {',
          '  return (',
          '    <Dialog open onClose={() => {}} title="نافذة">',
          '      {show ? <input data-name="late" /> : <p>جارٍ الفتح…</p>}',
          '    </Dialog>',
          '  );',
          '}',
          'export function Fields({ auto, autoField }) {',
          '  const [text, setText] = useState("25");',
          '  return (',
          '    <Dialog open onClose={() => {}} title="نافذة">',
          '      <input data-name="ro" readOnly value="r" />',
          '      <input data-name="dis" disabled />',
          '      <input data-name="first" value={text} onChange={(event) => setText(event.target.value)} />',
          "      {auto ? <button type=\"button\" data-name=\"auto\" data-autofocus>ابدأ</button> : null}",
          "      {autoField ? <input data-name=\"second\" data-autofocus /> : null}",
          '    </Dialog>',
          '  );',
          '}',
        ].join('\n'),
      ),
    );
    const ready = typeof m === 'object' && m !== null;
    t.ok(ready, `P/D/E ضابط: الحزمة تُبنى (${ready ? 'ok' : m})`);
    if (!ready) return;
    // المستمع ركّبه R على الوثيقة نفسها (مستمع واحد، أيّاً كانت الحزمة)؛ والحزمة هنا لا تستورد formKeys بنفسها، فتُبنى على الشفرة القديمة وتفشل فحوصها وحدها.
    m.onlineStore.set(true);

    let root = null;
    doc.activeElement = body;
    const mount = async (element) => {
      const container = doc.createElement('div');
      body.appendChild(container);
      root = m.createRoot(container);
      m.flushSync(() => root.render(element));
      await settle(40);
    };
    const unmount = async () => {
      if (root) m.flushSync(() => root.unmount());
      root = null;
      body.textContent = '';
      // كالمتصفّح: بلا عنصر مركَّز activeElement هو body (focusInto يقارن به).
      doc.activeElement = body;
      doc.__selected = null;
      await settle();
    };
    const step = async (label, fn) => {
      try {
        await fn();
      } catch (error) {
        t.ok(false, `${label}: رمى ${error?.stack ?? error}`);
      }
      await unmount();
    };
    const byName = (value) => descendants(body).find((node) => node.getAttribute('data-name') === value) ?? null;
    const byAction = (value) => descendants(body).filter((node) => node.getAttribute('data-action') === value);
    const type = (input, value) => {
      if (!input) return;
      input.value = value;
      fire(input, 'input');
    };
    globalThis.__kb = { calls: [], rpc: {} };
    const calls = (fn) => globalThis.__kb.calls.filter(([name]) => name === fn).map(([, args]) => args);

    await step('P', async () => {
      let picks = 0;
      let submits = 0;
      await mount(
        m.h(m.PickerForm, {
          onPick: () => {
            picks += 1;
          },
          onSubmit: () => {
            submits += 1;
          },
        }),
      );
      byName('before').focus();
      press(byName('before'));
      t.eq(name(active()), 'picker', 'P Enter قبل المنتقي ينقل إليه (خانة كغيرها)');
      press(byName('picker'));
      await settle();
      t.same([picks, submits, name(active())], [1, 0, 'picker'], 'P معالج المنتقي يسبق المستمع: يختار، ولا ينتقل ولا يُرسل');
    });

    await step('P ItemPicker', async () => {
      // المنتقي الحقيقيّ بلا نت ولا موادّ محفوظة: «علف» لا يطابق شيئاً، وEnter لا يُرسل نموذج السطر ولا ينتقل.
      let submits = 0;
      let picked = null;
      await mount(
        m.h(
          'form',
          {
            id: 'kb-line',
            onSubmit: (event) => {
              event.preventDefault();
              submits += 1;
            },
          },
          m.h(m.ItemPicker, { id: 'kb-item', label: 'المادّة', value: null, offline: true, onChange: (item) => (picked = item) }),
          m.h('input', { 'data-name': 'qty' }),
          m.h('button', { type: 'submit' }, 'أضف السطر'),
        ),
      );
      const search = byAction('search-item')[0];
      type(search, 'علف');
      await settle();
      search?.focus();
      const event = press(search);
      await settle();
      t.same([submits, picked, name(active()), event.defaultPrevented, search?.getAttribute('data-enter')], [0, null, 'search-item', true, 'own'], 'P ItemPicker: Enter بحث بلا اختيار، لا انتقال ولا إرسال للسطر بلا مادّة (data-enter="own" ويمنع)');
      press(search, 'Enter', { ctrlKey: true });
      await settle();
      t.same([submits, picked], [1, null], 'P ItemPicker: Ctrl+Enter من البحث يحفظ النموذج كأيّ خانة (مراجعة K2)، ولا يختار');
    });

    await step('D fine', async () => {
      pointer(true);
      await mount(m.h(m.Fields, { auto: false }));
      t.same([name(active()), name(selected())], ['first', 'first'], 'D مؤشّر دقيق: أوّل خانة متاحة مركَّزة (لا المقروءة فقط ولا المعطّلة) ونصّها محدَّد');
    });
    await step('D coarse', async () => {
      pointer(false);
      await mount(m.h(m.Fields, { auto: false }));
      t.same([active()?.getAttribute('role'), selected()], ['dialog', null], 'D ضابط: لمس (هاتف): النافذة نفسها كما كان، فلا تقفز لوحة المفاتيح');
    });
    // مراجعة K3: خانة تظهر بعد فتح النافذة (بعد قراءة) يصلها المؤشّر حين تظهر، ما دام التركيز على النافذة نفسها.
    await step('D late', async () => {
      pointer(true);
      await mount(m.h(m.LateField, { show: false }));
      const before = active()?.getAttribute('role');
      m.flushSync(() => root.render(m.h(m.LateField, { show: true })));
      await settle(20);
      t.same([before, name(active())], ['dialog', 'late'], 'D خانة ظهرت بعد الفتح: المؤشّر إليها');
    });
    await step('D autofocus', async () => {
      pointer(true);
      await mount(m.h(m.Fields, { auto: true }));
      t.eq(name(active()), 'first', 'D [data-autofocus] على زرّ يغلبه أوّل خانة على الحاسوب (مراجعة K4: «لا، تراجع» في تأكيد بخانة سبب)');
    });
    await step('D autofocus خانة', async () => {
      pointer(true);
      await mount(m.h(m.Fields, { autoField: true }));
      t.eq(name(active()), 'second', 'D ضابط: [data-autofocus] على خانة يغلب أوّل خانة');
    });

    // ── E1: «تعديل فوج» من البداية إلى الحفظ ─────────────────────────────────────────────────────────────────────────
    await step('E1', async () => {
      pointer(true);
      const TODAY = m.localDay();
      const PLACED = m.addDays(TODAY, -12);
      const flock = { id: 'kb-flock-1', version: 3, placedOn: PLACED, placedCount: 5000, ageDaysAtPlacement: 1, breed: null };
      globalThis.__kb = {
        calls: [],
        rpc: { edit_flock: (args) => ({ flock_id: args.p_flock, version: 4, placed_on: args.p_placed_on, placed_count: args.p_placed_count, age_days_at_placement: args.p_age_days, breed: args.p_breed, changed: true }) },
      };
      let saved = 0;
      await mount(m.h(m.FlockEditDialog, { hallName: 'قاعة 8', flock, onClose: () => {}, onSaved: () => (saved += 1), onDeleted: () => {}, onStale: () => {} }));
      const field = (suffix) => descendants(body).find((node) => node.localName === 'input' && node.id.endsWith(suffix)) ?? null;
      t.same([active() === field('-day'), selected() === field('-day')], [true, true], 'E1 التاريخ أوّل خانة مركَّزة ومحدَّدة على الحاسوب');
      press(field('-day'));
      t.same([active() === field('-count'), selected() === field('-count')], [true, true], 'E1 التاريخ ⏎ ← العدد مركَّز ومحدَّد');
      type(field('-count'), '25000');
      await settle();
      press(field('-count'));
      t.eq(active() === field('-age'), true, 'E1 25000 ⏎ ← العمر');
      press(field('-age'));
      t.eq(active() === field('-breed'), true, 'E1 العمر ⏎ ← السلالة (آخر خانة)');
      type(field('-breed'), 'روس 308');
      await settle();
      press(field('-breed'));
      await settle(40);
      const sent = calls('edit_flock');
      t.same(
        sent.map((args) => [args.p_flock, args.p_expected_version, args.p_placed_on, args.p_placed_count, args.p_age_days, args.p_breed]),
        [['kb-flock-1', 3, PLACED, 25000, 1, 'روس 308']],
        'E1 السلالة ⏎ في آخر خانة: editFlock مرّة واحدة بالمكتوب (العدد 25000 والسلالة)',
      );
      t.eq(saved, 1, 'E1 والنافذة تُغلق بعد الحفظ (onSaved مرّة)');
    });

    // ── E2: إرسال علف الجولة: الكمية ⏎ ─────────────────────────────────────────────────────────────────────────────
    await step('E2', async () => {
      const TODAY = m.localDay();
      globalThis.__kb = {
        calls: [],
        rpc: {
          send_flock_feed: (args) => ({
            status: 'saved',
            issue: { id: args.p_issue_id, doc_no: 'FI-00007', item_id: args.p_item, item_name: 'علف م/1', qty: args.p_qty, unit: 'kg', issued_on: TODAY, for_day: TODAY },
            day: { on: TODAY, feed_kg: args.p_qty },
          }),
        },
      };
      const sentRows = [];
      const items = [{ itemId: 'kb-feed-1', name: 'علف م/1', baseUnit: 'kg', onHand: 55_000_000n, units: [{ id: 'kb-bag', name: 'كيس 50 كغم', baseQty: 50_000_000n }] }];
      await mount(m.h(m.RoundFeed, { flockId: 'kb-flock-2', hall: 'قاعة 8', items, lastItemId: 'kb-feed-1', today: TODAY, online: true, stamp: { userId: 'kb-u', orgId: 'kb-o' }, onSent: (sent) => sentRows.push(sent) }));
      const qty = byAction('round-feed-qty')[0];
      const send = byAction('round-feed-send')[0];
      t.same(
        [qty?.form?.localName, qty?.form ? Array.from(qty.form.elements).find((node) => node.localName === 'button' && node.type === 'submit') === send : false],
        ['form', true],
        'E2 الكمية في نموذج زرّه الافتراضيّ «أرسل» (الإرسال الضمنيّ يعمل قبل أن تُحمَّل حزمة المفاتيح)',
      );
      type(qty, '2');
      await settle();
      qty?.focus();
      press(qty);
      await settle(40);
      t.same(
        calls('send_flock_feed').map((args) => [args.p_flock, args.p_item, args.p_qty, args.p_for_day]),
        [['kb-flock-2', 'kb-feed-1', '100.000', TODAY]],
        'E2 كيسان ⏎: sendFlockFeed مرّة واحدة بـ100 كغم ليوم الجولة (ضابط: كان لها معالج Enter قبل التحويل)',
      );
      t.eq(sentRows.length, 1, 'E2 ضابط: والجولة تُخبَر بما أُرسل مرّة');
    });

    // ── E3: «إلغاء البيع» بسببه (ConfirmDialog بخانة) ───────────────────────────────────────────────────────────────
    await step('E3', async () => {
      pointer(true);
      globalThis.__kb = { calls: [], rpc: { void_sale: () => ({ doc_no: 'MS-00012' }) } };
      const done = [];
      const target = { id: 'kb-sale-1', docNo: 'MS-00012', partyName: 'أبو علي', walkIn: false, free: false, refundedAll: false, paid: null, collectedLater: 0n, goods: '100 كغم من «علف بادئ»' };
      await mount(m.h(m.SaleVoidDialog, { target, pendingKey: '', onCancel: () => {}, onDone: (text) => done.push(text) }));
      const reason = byAction('void-sale-reason')[0];
      t.eq(active() === reason, true, 'E3 على الحاسوب المؤشّر في خانة السبب (مراجعة K4: «لا، تراجع» [data-autofocus] زرّ يغلبه أوّل خانة؛ والسبب الفارغ يُبقي «ألغِ البيع» معطّلاً)');
      reason?.focus();
      type(reason, 'فاتورة مكرّرة');
      await settle();
      press(reason);
      await settle(40);
      t.same(calls('void_sale').map((args) => [args.p_sale_id, args.p_reason]), [['kb-sale-1', 'فاتورة مكرّرة']], 'E3 السبب ⏎: voidSale مرّة واحدة بالسبب (زرّ «ألغِ البيع» زرّ النموذج)');
      t.eq(done.length, 1, 'E3 والنافذة تنتهي مرّة');
    });

    // ── H: نافذتا القاعة والفوج بعد تحويلهما إلى نماذج (الجزء H) مع المستمع (الجزء K)، من البداية إلى الحفظ بلا فأرة (كلمة الزبون: «أكتب 25000 وأدوس
    // إنتر يحفظ»). القاعة كتابة مباشرة (createHall/updateHall بـwritten): قاعدة بديلة تسجّل الجدول والقيم والشرط وترجع صفّاً.
    const tableDb = (writes, row) => ({
      from: (table) => {
        const answer = async (kind, values) => {
          writes.push([kind, table, values]);
          return { data: [row], error: null, status: kind === 'insert' ? 201 : 200 };
        };
        return {
          insert: (values) => ({ select: () => answer('insert', values) }),
          update: (values) => {
            const where = [];
            const chain = {
              eq: (column, value) => {
                where.push([column, value]);
                return chain;
              },
              select: () => answer('update', { ...values, where }),
            };
            return chain;
          },
        };
      },
    });
    const field = (suffix) => descendants(body).find((node) => node.localName === 'input' && node.id.endsWith(suffix)) ?? null;
    const site = { id: 'kb-site-1', name: 'حقل لحم', divisionId: 'kb-div-1', kind: 'broiler', canManage: true, halls: [] };
    await step('H', async () => {
      pointer(true);
      const writes = [];
      globalThis.__kb = { calls: [], rpc: {}, db: tableDb(writes, { id: 'kb-hall-9', version: 1 }) };
      let saved = 0;
      await mount(m.h(m.HallDialog, { site, hall: null, onClose: () => {}, onSaved: () => (saved += 1) }));
      t.eq(active() === field('-name'), true, 'H «قاعة جديدة»: المؤشّر في اسم القاعة حين تُفتح على الحاسوب');
      type(field('-name'), 'قاعة 9');
      await settle();
      press(field('-name'));
      await settle();
      t.same([active() === field('-capacity'), selected() === field('-capacity')], [true, true], 'H اسم القاعة ⏎ ← السعة مركَّزة ومحدَّدة');
      t.same(writes, [], 'H ضابط: Enter في الاسم لا يحفظ');
      type(field('-capacity'), '25,000x');
      await settle();
      press(field('-capacity'));
      await settle(40);
      t.same(writes, [], 'H ضابط: سعة غير صالحة (الزرّ معطّل) فـEnter لا يحفظ');
      type(field('-capacity'), '25000');
      await settle();
      press(field('-capacity'));
      await settle(40);
      t.same(writes, [['insert', 'halls', { site_id: 'kb-site-1', name: 'قاعة 9', capacity: 25000 }]], 'H السعة 25000 ⏎: createHall مرّة واحدة بالحقل والاسم والسعة، بلا فأرة');
      t.eq(saved, 1, 'H والنافذة تنتهي مرّة (onSaved)');
    });
    await step('H تعديل', async () => {
      pointer(true);
      const writes = [];
      globalThis.__kb = { calls: [], rpc: {}, db: tableDb(writes, { id: 'kb-hall-4', version: 3 }) };
      let saved = 0;
      const hall = { id: 'kb-hall-4', name: 'قاعة 4', capacity: 20000, version: 2, flock: null };
      await mount(m.h(m.HallDialog, { site, hall, onClose: () => {}, onSaved: () => (saved += 1), onDeleted: () => {}, onStale: () => {} }));
      t.same([active() === field('-name'), selected() === field('-name')], [true, true], 'H «عدّل القاعة»: المؤشّر في الاسم ونصّه محدَّد');
      press(field('-name'));
      await settle();
      t.eq(active() === field('-capacity'), true, 'H «عدّل القاعة»: الاسم ⏎ ← السعة');
      type(field('-capacity'), '24000');
      await settle();
      press(field('-capacity'));
      await settle(40);
      t.same(writes, [['update', 'halls', { name: 'قاعة 4', capacity: 24000, where: [['id', 'kb-hall-4'], ['version', 2]] }]], 'H «عدّل القاعة» السعة ⏎: updateHall مرّة بشرط نسختها');
      t.same([saved, calls('delete_hall_preview').length], [1, 0], 'H وتنتهي مرّة، وEnter لا يضغط «احذف القاعة» (ليس زرّ النموذج)');
    });
    await step('H فوج', async () => {
      pointer(true);
      globalThis.__kb = { calls: [], rpc: { open_flock: () => ({ flock_id: 'kb-flock-9' }) } };
      let opened = 0;
      const hall = { id: 'kb-hall-4', name: 'قاعة 4', capacity: 20000, version: 2, flock: null };
      await mount(m.h(m.OpenFlockDialog, { hall, onClose: () => {}, onOpened: () => (opened += 1) }));
      t.same([active() === field('-day'), selected() === field('-day')], [true, true], 'H «فوج جديد»: المؤشّر في تاريخ التسكين (اليوم) ونصّه محدَّد');
      press(field('-day'));
      await settle();
      t.eq(active() === field('-count'), true, 'H التاريخ ⏎ ← العدد');
      type(field('-count'), '25000');
      await settle();
      press(field('-count'));
      await settle();
      t.same([active() === field('-age'), selected() === field('-age')], [true, true], 'H العدد ⏎ ← العمر (صفر محدَّد)');
      press(field('-age'));
      await settle();
      t.eq(active() === field('-breed'), true, 'H العمر ⏎ ← السلالة');
      t.same(calls('open_flock'), [], 'H ضابط: لا فتح قبل آخر خانة');
      type(field('-breed'), 'روس');
      await settle();
      press(field('-breed'));
      await settle(40);
      t.same(
        calls('open_flock').map((args) => [args.p_hall, args.p_placed_on, args.p_placed_count, args.p_age_days, args.p_breed]),
        [['kb-hall-4', m.localDay(), 25000, 0, 'روس']],
        'H السلالة ⏎: open_flock مرّة واحدة بالقاعة واليوم والعدد والعمر والسلالة',
      );
      t.eq(opened, 1, 'H والنافذة تنتهي مرّة (onOpened)');
    });

    await step('E3 لمس', async () => {
      pointer(false);
      globalThis.__kb = { calls: [], rpc: {} };
      const target = { id: 'kb-sale-2', docNo: 'MS-00013', partyName: 'أبو علي', walkIn: false, free: false, refundedAll: false, paid: null, collectedLater: 0n, goods: '100 كغم من «علف بادئ»' };
      await mount(m.h(m.SaleVoidDialog, { target, pendingKey: '', onCancel: () => {}, onDone: () => {} }));
      const cancel = descendants(body).find((node) => node.localName === 'button' && node.getAttribute('data-autofocus') !== null);
      t.eq(active() === cancel, true, 'E3 ضابط: على الهاتف التركيز على «لا، تراجع» كما كان (لا تقفز لوحة المفاتيح)');
    });

    // ── E4: «ألغِ الورقة» (VoidDocDialog): السبب ⏎ بسببه، والمعطّل بلا سبب لا شيء ─────────────────────────────────────
    await step('E4', async () => {
      pointer(true);
      const confirmed = [];
      await mount(m.h(m.VoidDocDialog, { title: 'ألغِ الاستلام R-0042', consequence: 'ترجع 7 موادّ من المخزن.', busy: false, failure: null, onConfirm: (reason, choice) => confirmed.push([reason, choice]), onClose: () => {} }));
      const reason = descendants(body).find((node) => node.id === 'stock-void-reason') ?? null;
      t.eq(active() === reason, true, 'E4 ضابط: خانة السبب مركَّزة ([data-autofocus])');
      press(reason);
      await settle();
      t.same(confirmed, [], 'E4 ضابط: بلا سبب الزرّ معطّل فـEnter لا شيء');
      type(reason, 'استلام مكرّر');
      await settle();
      press(reason);
      await settle();
      t.same(confirmed, [['استلام مكرّر', 'all']], 'E4 السبب ⏎: الإلغاء مرّة بالسبب');
    });
  } finally {
    globalThis.window.matchMedia = savedMedia;
    delete globalThis.__kb;
    restore();
  }
}
