// الواجهة اللي ما تنشاف بالعين: النافذة المقفولة وقت الشغل، حبس التركيز، قفل التمرير بعدّاد واحد،
// حقل الكمية (القراءة المعروضة والوحدة المختارة)، مكدس التنبيهات، اتّجاه أرقام الرئيسية، الخطوط،
// حقول ≥ 16px، وإعدادات العرض بين نافذتين. يرسم المصدر الحقيقي نصّاً، والبوّابة (createPortal) تنرسم بمكانها.
import { build } from 'esbuild';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../../tailwind.config.js';
import { loadSrc } from './load-src.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARABIC = /[\u{600}-\u{6FF}]/u;
const REACT = "export { renderToStaticMarkup } from 'react-dom/server.browser'; export { createElement as h } from 'react';";

// الرسم النصّي ما يقبل createPortal: البوّابة ترجع العقدة بمكانها، والباقي من react-dom الحقيقي.
const inlinePortal = {
  name: 'inline-portal',
  setup(b) {
    b.onResolve({ filter: /^react-dom$/ }, (args) => (args.namespace === 'portal' ? undefined : { path: 'react-dom', namespace: 'portal' }));
    b.onLoad({ filter: /.*/, namespace: 'portal' }, () => ({
      contents: "export * from 'react-dom'; export const createPortal = (node) => node;",
      resolveDir: ROOT,
    }));
  },
};

/** يحزم المكوّنات ويّا react-dom/server بحزمة وحدة: نسختين من React تكسر الخطّافات. */
async function bundle(contents) {
  const result = await build({
    stdin: { contents: `${contents} ${REACT}`, resolveDir: ROOT, loader: 'tsx' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    jsx: 'automatic',
    logLevel: 'silent',
    // بناء الإنتاج: React بلا تحذيرات الرسم بالخادم (useLayoutEffect) اللي تغطّي النتيجة.
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"production"' },
    plugins: [inlinePortal],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

/** قسم يرمي ما يخفي الأقسام الباقية: كل قسم فحص لحاله. */
async function section(t, label, fn) {
  try {
    await fn();
  } catch (error) {
    t.ok(false, `${label}: رمى ${error?.message ?? error}`);
  }
}

/** يبدّل كائنات عامّة لحد ما ينتهي القسم، ويرجّعها مثل ما كانت. */
async function withGlobals(values, fn) {
  const saved = Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  try {
    return await fn();
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(ROOT, rel)).isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.(ts|tsx)$/.test(name)) out.push({ rel, text: readFileSync(path.join(ROOT, rel), 'utf8') });
  }
  return out;
}

export default async function (t) {
  // C16/C38: «الغِ الاستلام» وقت الشغل: لا Esc ولا نقرة برّا ولا X يسدّها والطلب بعده طالع.
  await section(t, 'ConfirmDialog', async () => {
    const d = await bundle("export { ConfirmDialog } from './src/components/ui/ConfirmDialog.tsx';");
    // document.body ينقرا قبل createPortal نفسها.
    const render = (busy) =>
      withGlobals({ document: { body: {} } }, () =>
        d.renderToStaticMarkup(
          d.h(d.ConfirmDialog, { open: true, title: 'الغِ الاستلام R-0042', consequence: 'ترجع 7 مواد من المخزن', confirmLabel: 'الغِ الاستلام', busy, onConfirm() {}, onCancel() {} }),
        ),
      );
    const closeButton = (html) => html.match(/<button[^>]*aria-label="أغلق النافذة"[^>]*>/)?.[0] ?? '';
    t.ok(/\sdisabled=""/.test(closeButton(await render(true))), 'وقت الشغل X معطّل');
    const idle = closeButton(await render(false));
    t.ok(idle !== '' && !/\sdisabled=""/.test(idle), 'بلا شغل X شغّال');
  });
  await section(t, 'closeIntent', async () => {
    const { closeIntent } = await loadSrc('src/components/ui/Dialog.tsx');
    t.eq(closeIntent(true, false), 'ignore', 'مقفولة: Esc والنقرة برّا ما يسدّون');
    t.eq(closeIntent(true, true), 'ignore', 'مقفولة ومعدّلة: حتى سؤال «تطلع بلا حفظ؟» ما يطلع');
    t.eq(closeIntent(false, true), 'ask', 'نموذج معدّل يسأل');
    t.eq(closeIntent(false, false), 'close', 'غير هيچ تنسدّ');
    t.eq(closeIntent(false, false, false), 'ignore', 'رمز الدعوة (dismissible=false): نقرة برّا أو Esc ما تضيّعه');
  });

  // C21: Tab يدور جوّا النافذة العليا، والتركيز يدخل ويرجع.
  await section(t, 'focus', async () => {
    const f = await loadSrc('src/lib/focus.ts');
    t.eq(f.wrapTab(3, 2, false), 0, 'Tab من الأخير يرجع للأوّل');
    t.eq(f.wrapTab(3, 0, true), 2, 'Shift+Tab من الأوّل يروح للأخير، مو لرابط ورا الغطاء');
    t.eq(f.wrapTab(3, -1, true), 2, 'Shift+Tab من النافذة نفسها يبقى جوّاها');
    t.eq(f.wrapTab(3, -1, false), 0, 'تركيز برّا النافذة يرجع لأوّلها');
    t.eq(f.wrapTab(3, 1, false), null, 'بالنصّ: المتصفّح يكمّل');
    t.eq(f.wrapTab(0, -1, true), -1, 'ماكو شي ينركّز: يبقى على النافذة');

    const listeners = new Set();
    let toaster = null;
    const doc = {
      activeElement: null,
      addEventListener: (type, fn) => type === 'keydown' && listeners.add(fn),
      removeEventListener: (type, fn) => type === 'keydown' && listeners.delete(fn),
      querySelector: (selector) => (selector === '[data-toaster]' ? toaster : null),
    };
    class FakeElement {
      constructor(name, { tabIndex = 0, autofocus = false, children = [] } = {}) {
        Object.assign(this, { name, tabIndex, autofocus, children, isConnected: true });
      }
      focus() {
        doc.activeElement = this;
      }
      matches() {
        return false;
      }
      closest() {
        return null;
      }
      getClientRects() {
        return [{}];
      }
      contains(node) {
        return node === this || this.children.includes(node);
      }
      querySelector(selector) {
        return selector === '[data-autofocus]' ? (this.children.find((child) => child.autofocus) ?? null) : null;
      }
      querySelectorAll() {
        return this.children;
      }
    }
    const press = (shiftKey = false) => {
      let prevented = false;
      const event = { key: 'Tab', shiftKey, altKey: false, ctrlKey: false, metaKey: false, preventDefault: () => (prevented = true) };
      for (const fn of [...listeners]) fn(event);
      return prevented;
    };
    await withGlobals({ document: doc, HTMLElement: FakeElement, HTMLInputElement: class extends FakeElement {}, Node: FakeElement, CSS: { escape: (s) => s } }, () => {
      const menu = new FakeElement('menu');
      menu.focus();
      const [a, b, c] = ['a', 'b', 'c'].map((name) => new FakeElement(name));
      const drawer = new FakeElement('drawer', { tabIndex: -1, children: [a, b, c] });
      const releaseDrawer = f.trapFocus(drawer);
      t.eq(doc.activeElement?.name, 'drawer', 'التركيز يدخل القائمة لمّا تنفتح');
      t.ok(press(true) && doc.activeElement === c, 'Shift+Tab من القائمة نفسها ← آخر رابط بيها');
      t.ok(press() && doc.activeElement === a, 'Tab من آخر رابط ← أوّل رابط');
      doc.activeElement = b;
      t.ok(!press() && doc.activeElement === b, 'بالنصّ ماكو تدخّل');

      const stay = new FakeElement('stay', { autofocus: true });
      const leave = new FakeElement('leave');
      const dialog = new FakeElement('dialog', { tabIndex: -1, children: [stay, leave] });
      const releaseDialog = f.trapFocus(dialog);
      t.eq(doc.activeElement?.name, 'stay', 'data-autofocus ياخذ التركيز');
      t.ok(f.isTopModal(dialog) && !f.isTopModal(drawer), 'النافذة الجديدة هي العليا');
      t.ok(!press() && doc.activeElement === stay, 'Tab بالعليا بس: القائمة تحتها ما تسحبه لروابطها');
      doc.activeElement = leave;
      t.ok(press() && doc.activeElement === stay, 'ويدور جوّا العليا');
      releaseDialog();
      t.eq(doc.activeElement?.name, 'b', 'سدّ النافذة يرجع التركيز للي فتحها');
      releaseDrawer();
      t.eq(doc.activeElement?.name, 'menu', 'سدّ القائمة يرجع التركيز لزرّ «القائمة»');
      releaseDrawer();
      t.eq(listeners.size, 0, 'ماكو مستمع باقي، والسدّ المكرّر ما يسوي شي');

      // التنبيهات فوك كل النوافذ: «حدّث القائمة» ينوصل بـTab من جوّا النافذة، وبعده يرجع لأوّلها.
      const refresh = new FakeElement('refresh');
      toaster = new FakeElement('toaster', { children: [refresh] });
      const only = new FakeElement('only');
      const sheet = new FakeElement('sheet', { tabIndex: -1, children: [only] });
      const releaseSheet = f.trapFocus(sheet);
      only.focus();
      t.ok(press() && doc.activeElement === refresh, 'Tab من آخر عنصر بالنافذة ← زرّ التنبيه');
      t.ok(press() && doc.activeElement === only, 'Tab من زرّ التنبيه ← يرجع للنافذة');
      releaseSheet();
      toaster = null;

      const under = f.trapFocus(new FakeElement('under', { tabIndex: -1 }));
      const top = new FakeElement('top', { tabIndex: -1 });
      const releaseTop = f.trapFocus(top);
      under();
      t.eq(doc.activeElement?.name, 'top', 'نافذة انسدّت من تحت ما تسحب التركيز من العليا');
      releaseTop();

      // «اطلع وضيّع التعديلات» تسدّ النافذتين سوا: التركيز يرجع للي فتح النموذج، بأي ترتيب انسدّن.
      for (const formFirst of [true, false]) {
        const opener = new FakeElement('opener');
        opener.focus();
        const discard = new FakeElement('discard');
        const form = new FakeElement('form', { tabIndex: -1, children: [discard] });
        const releaseForm = f.trapFocus(form);
        discard.focus();
        const releaseAsk = f.trapFocus(new FakeElement('ask', { tabIndex: -1 }));
        // React يشيل العقد قبل ما ينظّف التأثيرات.
        form.isConnected = false;
        discard.isConnected = false;
        if (formFirst) {
          releaseForm();
          releaseAsk();
        } else {
          releaseAsk();
          releaseForm();
        }
        t.eq(doc.activeElement?.name, 'opener', `النافذتين انسدّن (${formFirst ? 'النموذج أوّل' : 'السؤال أوّل'}): التركيز للي فتح النموذج`);
      }
    });
  });

  // C18: عدّاد واحد للنافذة والقائمة؛ ماكو حفظ وإرجاع لـoverflow بأي مكان ثاني.
  await section(t, 'scrollLock', async () => {
    const body = { style: { overflow: '' } };
    const { lockScroll } = await loadSrc('src/lib/scrollLock.ts');
    await withGlobals({ document: { body } }, () => {
      const dialog = lockScroll();
      const drawer = lockScroll();
      drawer();
      t.eq(body.style.overflow, 'hidden', 'القائمة انسدّت تحت نافذة مفتوحة: الصفحة تبقى مقفولة');
      dialog();
      t.eq(body.style.overflow, '', 'آخر واحد انفكّ: الصفحة تتمرّر');
      const once = lockScroll();
      once();
      const other = lockScroll();
      once();
      t.eq(body.style.overflow, 'hidden', 'فكّ مكرّر ما ينقّص العدّاد');
      other();
      t.eq(body.style.overflow, '', 'وبعدها ينفكّ صحّ');
    });
  });
  await section(t, 'modals', async () => {
    const files = sourceFiles('src');
    const direct = files.filter((file) => file.rel !== 'src/lib/scrollLock.ts' && /style\.overflow\s*=/.test(file.text)).map((file) => file.rel);
    t.same(direct, [], 'overflow يتغيّر من scrollLock بس');
    const modals = files.filter((file) => /aria-modal="true"/.test(file.text));
    t.ok(modals.length >= 2, 'لكيت النوافذ (Dialog والقائمة)');
    t.same(
      modals.filter((file) => !/\btrapFocus\(/.test(file.text) || !/\blockScroll\(/.test(file.text)).map((file) => file.rel),
      [],
      'كل aria-modal يحبس التركيز ويقفل التمرير بالعدّاد',
    );
  });

  // C15 وC19: حقل الكمية يعيد قراءة أي فاصلة، وما يبيّن وحدة مختارة غير اللي بالقيمة.
  await section(t, 'QtyInput', async () => {
    const q = await bundle("export { QtyInput } from './src/components/ui/QtyInput.tsx';");
    const kg = { id: 'kg', label: 'كغم', factor: { units: 1n, scale: 0 } };
    const bag = { id: 'bag', label: 'كيس 50 كغم', factor: { units: 50n, scale: 0 } };
    const render = (units, text, unitId) =>
      q.renderToStaticMarkup(q.h(q.QtyInput, { id: 'q', label: 'الكمية', base: 'kg', units, value: { text, unitId }, onChange() {} }));
    const alert = (html) => html.match(/<p role="alert"[^>]*>([^<]*)<\/p>/)?.[1] ?? null;
    const hint = (html) => html.match(/<p class="text-sm text-ink-muted">([^<]*)<\/p>/)?.[1] ?? null;

    t.eq(hint(render([kg], '1,234.5', 'kg')), '= 1,234.5 كغم', 'بوحدة الأساس: الفاصلة تنعاد مقروءة');
    t.eq(hint(render([kg], '0.5', 'kg')), '= 0.5 كغم', 'والنقطة هم');
    t.eq(hint(render([kg], '5', 'kg')), null, 'رقم صحيح بلا فاصلة: ماكو تكرار');
    for (const text of ['0,5', '\u{660}\u{66C}\u{665}', '2,50']) {
      const html = render([kg], text, 'kg');
      const shown = alert(html) ?? hint(html);
      t.ok(shown !== null, `«${text}» ما يمرّ بصمت`);
      t.ok(!/^= 5 /.test(hint(html) ?? '') || alert(html) !== null, `«${text}» ما ينقرا 5 بلا كلمة`);
    }
    t.ok(/الفاصلة بين كل ثلاثة أرقام/.test(alert(render([kg], '0,5', 'kg')) ?? ''), 'الغلط يكول وين الفاصلة تنكتب');

    const stale = render([bag, kg], '2', 'old-unit');
    t.ok(!/aria-checked="true"/.test(stale), 'unitId ما يطابق: ماكو وحدة تبين مختارة');
    t.eq(alert(stale), 'اختر الوحدة', 'ويطلب الوحدة');
    t.ok(!/= 100/.test(stale), 'وما يعرض تحويل بوحدة ما بالقيمة');
    const picked = render([bag, kg], '2', 'bag');
    t.ok(/aria-checked="true"[^>]*>كيس 50 كغم</.test(picked), 'الوحدة اللي بالقيمة هي المختارة');
    t.eq(hint(picked), '2 كيس 50 كغم = 100 كغم', 'وتحويلها حيّ');
    t.ok(/role="radiogroup"/.test(render([kg], '2', '')), 'وحدة وحدة ما بالقيمة: تنعرض للاختيار، مو كلمة ثابتة');

    // الفصحى بنصّ التحويل: صيغ الوحدة واسم القطعة («5 طبقات = 150 بيضة»، «طبقتان = 60 بيضة»).
    const egg = { one: 'بيضة واحدة', two: 'بيضتان', few: 'بيضات', many: 'بيضة' };
    const tray = { id: 'tray', label: 'طبقة', factor: { units: 30n, scale: 0 }, forms: { one: 'طبقة واحدة', two: 'طبقتان', few: 'طبقات', many: 'طبقة' } };
    const eggs = (text) =>
      hint(q.renderToStaticMarkup(q.h(q.QtyInput, { id: 'q', label: 'البيض', base: 'pc', pieceLabel: 'بيضة', pieceForms: egg, units: [tray], value: { text, unitId: 'tray' }, onChange() {} })));
    t.eq(eggs('5'), '5 طبقات = 150 بيضة', 'التحويل بصيغة العدد');
    t.eq(eggs('2'), 'طبقتان = 60 بيضة', 'الاثنان مثنّى بلا رقم');
  });

  // المعاينة قبل الترحيل: اسم القطعة بصيغة العدد بالسطر والنقص («ينقص 5 بيضات»).
  await section(t, 'PostPreview forms', async () => {
    const p = await bundle("export { PostPreview } from './src/components/ui/PostPreview.tsx';");
    const line = {
      lineId: 'l1',
      itemName: 'بيض مائدة',
      unit: 'pc',
      pieceLabel: 'بيضة',
      pieceForms: { one: 'بيضة واحدة', two: 'بيضتان', few: 'بيضات', many: 'بيضة' },
      requested: 5_000n,
      draws: [],
      shortage: 5_000n,
    };
    const html = p.renderToStaticMarkup(p.h(p.PostPreview, { lines: [line], approved: new Set(), onToggle() {} }));
    t.ok(html.includes('5 بيضات') && !html.includes('5 بيضة'), 'المطلوب بصيغة العدد');
    t.ok(/ينقص <b[^>]*>5 بيضات<\/b>/.test(html), 'والنقص');
  });

  // C37 وC40: الخطر والتحذير ما ينشالون بتنبيهات أحدث، وأزرار التنبيه هي Button وIconButton.
  await section(t, 'toast stack', async () => {
    const { withToast } = await loadSrc('src/components/ui/Toast.tsx');
    let list = [];
    let id = 0;
    const add = (tone) => (list = withToast(list, { id: ++id, tone, title: tone }));
    add('danger');
    add('warning');
    for (let i = 0; i < 6; i += 1) add('success');
    t.same(list.filter((item) => item.tone !== 'success').map((item) => item.id), [1, 2], 'الخطر والتحذير باقيات بعد ست نجاحات');
    t.same(list.filter((item) => item.tone === 'success').map((item) => item.id), [6, 7, 8], 'النجاح مسقوف بثلاث والأقدم طلع أوّل');
    for (let i = 0; i < 5; i += 1) add('danger');
    t.eq(list.filter((item) => item.tone === 'danger').length, 6, 'الخطر ما ينسقف');
  });
  await section(t, 'Toaster', async () => {
    const m = await bundle("export { Toaster, toast } from './src/components/ui/Toast.tsx';");
    const realTimeout = globalThis.setTimeout;
    globalThis.setTimeout = () => 0; // النجاح يروح بعد 4 ثواني؛ الفحص ما ينتظره
    try {
      m.toast({ tone: 'danger', title: 'الاستلام ما انرحّل', action: { label: 'حدّث القائمة', run() {} } });
      for (let i = 0; i < 4; i += 1) m.toast({ tone: 'success', title: `انحفظ ${i}` });
    } finally {
      globalThis.setTimeout = realTimeout;
    }
    const html = await withGlobals({ document: { body: {} } }, () => m.renderToStaticMarkup(m.h(m.Toaster)));
    t.ok(html.includes('الاستلام ما انرحّل'), 'أربع «انحفظ» ما طيّحت «الاستلام ما انرحّل»');
    const action = html.match(/<button[^>]*>حدّث القائمة<\/button>/)?.[0] ?? '';
    t.ok(/\bh-9\b/.test(action), 'زرّ الفعل Button sm (h-9)، مو 28px');
    const close = html.match(/<button[^>]*aria-label="أغلق التنبيه"[^>]*>/)?.[0] ?? '';
    t.ok(/\bsize-11\b/.test(close), 'زرّ السدّ IconButton (44px)');
  });

  // C17 وC39 وC43: dir=ltr للرقم الصافي بس، والوحدة العربية ترث RTL؛ والأعمار وأقرب إخراج على البطاقات.
  await section(t, 'HomePage', async () => {
    const m = await bundle("export { cardSpecs, DivisionCard } from './src/pages/home/HomePage.tsx'; export { countForm } from './src/lib/format.ts'; export { MemoryRouter } from 'react-router-dom';");
    const render = (summary) =>
      m
        .cardSpecs(summary)
        .map((spec) => m.renderToStaticMarkup(m.h(m.MemoryRouter, null, m.h(m.DivisionCard, { spec }))))
        .join('');
    const html = render({
      feedMill: { producedTodayKg: 6_120_000n, feedInStockKg: 750_000n },
      broiler: { activeFlocks: 3, deadToday: 12, ageDays: { min: 12, max: 35 } },
      layer: { eggsToday: 41_250, hdepPercent: '87.5', traysInStore: 1_392_000n },
      hatchery: { batchesSetting: 2, chicksWaiting: 1500, nextHatchInDays: 4 },
      medicine: { nearExpiry: 1 },
      general: { belowMinimum: 0 },
      accounts: { receivable: 396_000_000n, payable: 0n, negativeBoxes: 1, visibleBooks: 7, totalBooks: 7 },
    });
    // بطاقة الحسابات: «صناديق بالسالب» برقمها، و«دفاتر نطاقك» للقارئ المحصور بس (E49).
    t.ok(/صناديق بالسالب<\/dt><dd dir="ltr"[^>]*>1<\/dd>/.test(html), 'بطاقة الحسابات: «صناديق بالسالب» 1');
    t.ok(!html.includes('دفاتر نطاقك'), 'القارئ بلا نطاق: بلا «دفاتر نطاقك»');
    const scopedAccounts = render({ accounts: { receivable: 50_000_000n, payable: 0n, negativeBoxes: 0, visibleBooks: 1, totalBooks: 7 } });
    t.ok(scopedAccounts.includes('دفاتر نطاقك') && scopedAccounts.includes('1 من المجموع 7'), 'المحصور: البطاقة تكتب «1 من المجموع 7» دفاتر');
    const ltr = [...html.matchAll(/<dd dir="ltr"[^>]*>(.*?)<\/dd>/g)].map((match) => match[1]);
    t.ok(ltr.length >= 10, `الأرقام الصافية بـdir=ltr (${ltr.length})`);
    t.same(ltr.filter((value) => ARABIC.test(value)), [], 'ماكو كلمة عربية جوّا dd بـdir=ltr');
    t.ok(/<dd class="[^"]*">46 طبقة \+ 12 بيضة<\/dd>/.test(html), 'الطبقات والبيض ترث RTL');
    t.ok(/<dd class="[^"]*">6\.120 طن<\/dd>/.test(html), 'الطن يرث RTL');
    t.ok(html.includes('الأعمار') && html.includes('<bdi dir="ltr">12</bdi> إلى <bdi dir="ltr">35</bdi> يوماً'), 'أعمار الأفواج بأرقام معزولة وبالفصحى');
    t.ok(html.includes('أقرب إخراج') && html.includes('بعد <bdi dir="ltr">4</bdi> أيام'), 'أقرب إخراج بأيامه');

    const hatch = (days) => render({ hatchery: { batchesSetting: 1, chicksWaiting: 0, nextHatchInDays: days } });
    t.ok(hatch(0).includes('>اليوم<'), 'إخراج اليوم');
    t.ok(hatch(2).includes('بعد يومين'), 'يومين');
    t.ok(hatch(14).includes('بعد <bdi dir="ltr">14</bdi> يوماً'), '14 يوماً');
    t.ok(hatch(100).includes('بعد <bdi dir="ltr">100</bdi> يوم<'), '100 يوم');
    t.ok(hatch(1200).includes('بعد <bdi dir="ltr">1,200</bdi> يوم<'), 'الرقم داخل الجملة بفواصل');
    t.ok(hatch(-2).includes('فات موعده منذ يومين'), 'المجرور بعد «منذ»: يومين');
    t.ok(hatch(1).includes('بعد يوم واحد'), 'بعد يوم واحد');
    // الفصحى: المعدود يتبع آخر رقم.
    t.same([3, 10, 11, 99, 100, 101, 102, 103, 110, 111, 1000].map(m.countForm), ['few', 'few', 'many', 'many', 'hundreds', 'hundreds', 'hundreds', 'few', 'few', 'many', 'hundreds'], 'صيغة المعدود');
    const ages = (min, max) => render({ broiler: { activeFlocks: 2, deadToday: 0, ageDays: { min, max } } });
    t.ok(ages(2, 2).includes('>يومان<'), 'عمر واحد مرفوع: يومان');
    t.ok(ages(3, 8).includes('<bdi dir="ltr">3</bdi> إلى <bdi dir="ltr">8</bdi> أيام'), '3 إلى 8 أيام');
    t.ok(ages(1, 2).includes('يوم واحد إلى يومين'), '1 و2 بلا معدود بعد الرقم: «يوم واحد إلى يومين»');
    t.ok(!ages(1, 2).includes('2</bdi> يوم'), 'مو «1 إلى 2 يوم»');
    t.ok(hatch(-1).includes('فات موعده منذ يوم واحد'), 'فات موعده (أقرب إخراج مذكّر)');
    const eggs = render({ layer: { eggsToday: 0, hdepPercent: null, traysInStore: 155_000n } });
    t.ok(eggs.includes('5 طبقات + 5 بيضات'), 'المعدود 3–10 جمع: «5 طبقات + 5 بيضات»');
    const few = render({ layer: { eggsToday: 0, hdepPercent: null, traysInStore: 32_000n } });
    t.ok(few.includes('طبقة واحدة + بيضتان'), 'الواحد والاثنان كلمة: «طبقة واحدة + بيضتان» مو «1 طبقة + 2 بيضة»');
    const none = render({ broiler: { activeFlocks: 0, deadToday: 0, ageDays: null }, hatchery: { batchesSetting: 0, chicksWaiting: 0, nextHatchInDays: null } });
    t.ok(/الأعمار<\/dt><dd[^>]*>—<\/dd>/.test(none) && /أقرب إخراج<\/dt><dd[^>]*>—<\/dd>/.test(none), 'ماكو فوج أو وجبة: «—» مو صفر');
  });

  // C36: سفاري الآيفون يكبّر الصفحة لحقل تحت 16px، وحجم الواجهة 80–95٪ ينزّل الجذر تحتها.
  await section(t, 'input font-size', async () => {
    const css = readFileSync(path.join(ROOT, 'src', 'index.css'), 'utf8').replace(/^@import .*$/gm, '');
    const result = await postcss([tailwindcss({ ...tailwindConfig, content: [{ raw: 'input hidden', extension: 'html' }] })]).process(css, { from: undefined });
    const sizes = [];
    result.root.walkRules((rule) => {
      if (rule.selector === '.input') rule.walkDecls('font-size', (decl) => sizes.push(decl.value));
    });
    t.eq(sizes.at(-1), 'max(1rem, 16px)', 'نصّ الحقل ما ينزل تحت 16px بأي حجم واجهة');
  });

  // C41: كل وزن مستعمل (font-medium = 500) إله وجه، وماكو وجه ما ينستعمل بقائمة التثبيت.
  await section(t, 'font faces', async () => {
    const main = readFileSync(path.join(ROOT, 'src', 'main.tsx'), 'utf8');
    const weights = (subset) => [...main.matchAll(new RegExp(`@fontsource/[\\w-]+/${subset}-(\\d+)\\.css`, 'g'))].map((match) => Number(match[1])).sort();
    t.same(weights('arabic'), [400, 500, 600], 'العربي 400 و500 و600');
    t.same(weights('latin'), [400, 500, 600], 'اللاتيني 400 و500 و600');
    const files = sourceFiles('src');
    t.ok(files.some((file) => /\bfont-medium\b/.test(file.text)), 'font-medium مستعمل، فـ500 لازم');
    t.same(files.filter((file) => /\bfont-(bold|extrabold|black)\b/.test(file.text)).map((file) => file.rel), [], 'ماكو وزن فوك 600 بلا وجه');
  });

  // C42: نافذتين: كل وحدة تسمع الثانية، والحفظ يدمج بالمحفوظ مو بنسخة الذاكرة.
  await section(t, 'display', async () => {
    const KEY = 'poultry.display';
    const saved = new Map([[KEY, JSON.stringify({ scale: 100 })]]);
    const storage = { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, String(value)) };
    const listeners = new Map();
    const root = { classList: { toggle() {} }, style: { fontSize: '' } };
    const win = {
      matchMedia: () => ({ matches: false, addEventListener() {} }),
      addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    };
    const fire = (key) => {
      for (const fn of listeners.get('storage') ?? []) fn({ key });
    };
    await withGlobals({ window: win, localStorage: storage, document: { documentElement: root, querySelectorAll: () => [] } }, async () => {
      const d = await loadSrc('src/lib/display.ts');
      d.initDisplay();
      saved.set(KEY, JSON.stringify({ theme: 'system', scale: 120, clarity: false, sound: true }));
      d.updateDisplay({ sound: false });
      t.same(JSON.parse(saved.get(KEY)), { theme: 'system', scale: 120, clarity: false, sound: false }, 'نافذة قديمة تطفي الصوت وما ترجّع 120 لـ100');
      saved.set(KEY, JSON.stringify({ scale: 90 }));
      fire(KEY);
      t.eq(d.displayStore.get().scale, 90, 'تغيير النافذة الثانية يوصل هنا');
      t.eq(root.style.fontSize, '90%', 'وينطبق على الشاشة');
      saved.set(KEY, JSON.stringify({ scale: 110 }));
      fire('poultry.sidebar-collapsed');
      t.eq(d.displayStore.get().scale, 90, 'مفتاح ثاني ما يعيد القراءة');
      saved.delete(KEY);
      fire(null);
      t.eq(d.displayStore.get().scale, 100, 'تخزين انمسح: الافتراضي');
    });
  });
}
