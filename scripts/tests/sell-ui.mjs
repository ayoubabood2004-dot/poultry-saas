// يسوق شاشة البيع الجديدة (/sales/new، تصميم المبيعات 2026-11-18) من DOM الحقيقي كما يفعل البائع: البطاقات والعدّاد، وورقة السطر بشرائح وحدتها
// وتبويباتها ولوحة أرقامها، والسلّة و«المزيد»، وورقة الدفع («لمن؟» والبطاقات الثلاث والسيقان ولوحتها). تشترك فيه فحوص الشاشة (sales-invoice-screens
// وsales-review وsales-ux-sell)؛ لا شيء هنا يقرّر سلوكاً، والأحكام في الفحوص.

/** @param {{ body: () => any, descendants: (n: any) => any[], fire: Function, settle: (n?: number) => Promise<void> }} dom */
export function sellDriver({ body, descendants, fire, settle }) {
  const byAction = (name, scope = body()) => (scope ? descendants(scope).filter((n) => n.getAttribute('data-action') === name) : []);
  const first = (name, scope) => byAction(name, scope)[0] ?? null;
  const pick = (name, attr, value, scope) => byAction(name, scope).find((n) => n.getAttribute(attr) === value) ?? null;
  const click = async (node, label = '') => {
    if (!node) throw new Error(`no node ${label}`);
    fire(node, 'click', { button: 0 });
    await settle();
  };
  const typeIn = (input, value) => {
    if (!input) throw new Error('no input');
    input.value = value;
    fire(input, 'input');
  };
  const card = (item) => pick('sale-item-card', 'data-item', item);
  /** خليّة البطاقة (li): الزرّ ← البطاقة ← الخليّة. */
  const cell = (item) => card(item)?.parentNode?.parentNode ?? null;
  const lineSheet = () => first('sale-line');
  const paySheet = () => first('sale-pay');
  const cartSheet = () => first('sale-cart');
  /** لوحة الأرقام في الورقة العليا (السطر فوق الدفع). */
  const pad = () => first('sale-pad', lineSheet() ?? paySheet());
  const d = {
    byAction,
    first,
    pick,
    click,
    typeIn,
    card,
    cell,
    lineSheet,
    paySheet,
    cartSheet,
    /** المخزن من قائمة «من أيّ مخزن تبيع؟» أو من ورقة المخازن. */
    async store(id) {
      await click(pick('sale-store-option', 'data-store', id), `store ${id}`);
      await settle(20);
    },
    async tap(item) {
      await click(card(item), `card ${item}`);
    },
    async plus(item) {
      await click(first('card-plus', cell(item)), `plus ${item}`);
    },
    async minus(item) {
      await click(first('card-minus', cell(item)), `minus ${item}`);
    },
    /** نصّ العدّاد على البطاقة («2 كيس»)، أو null. */
    cardQty(item) {
      return first('card-qty', cell(item))?.childNodes?.[0]?.textContent ?? first('card-qty', cell(item))?.textContent ?? null;
    },
    async openLineOf(item) {
      await click(first('card-qty', cell(item)), `card-qty ${item}`);
    },
    async keys(text) {
      for (const ch of [...text]) await click(pick('key', 'data-key', ch, pad()), `key ${ch}`);
    },
    async unit(unitId) {
      await click(pick('line-unit', 'data-unit', unitId ?? '', lineSheet()), `unit ${unitId}`);
    },
    async tab(name) {
      await click(pick('line-tab', 'data-tab', name, lineSheet()), `tab ${name}`);
    },
    async clearValue() {
      await click(first('pad-clear', lineSheet()), 'pad-clear');
    },
    async done() {
      await click(first('line-done'), 'line-done');
      await settle(10);
    },
    display() {
      return first('line-value', lineSheet())?.textContent ?? null;
    },
    units() {
      return byAction('line-unit', lineSheet()).map((n) => [n.getAttribute('data-unit'), n.textContent, n.getAttribute('aria-checked')]);
    },
    async openCart() {
      await click(first('open-cart'), 'open-cart');
    },
    lines() {
      return byAction('cart-line', cartSheet());
    },
    async openLine(index) {
      await click(first('cart-line-open', d.lines()[index]), `line ${index}`);
    },
    discountText(value) {
      typeIn(first('sale-invoice-discount', cartSheet()), value);
    },
    note(value) {
      typeIn(first('sale-note', cartSheet()), value);
    },
    /** «التالي: الدفع»: من ذيل السلّة إن كانت مفتوحة، وإلّا من الشريط. */
    async next() {
      await click(first('sale-next', cartSheet()) ?? first('sale-next'), 'next');
      await settle(10);
    },
    async scan(code) {
      const input = first('sale-search');
      typeIn(input, code);
      await settle();
      fire(input, 'keydown', { key: 'Enter' });
      await settle();
    },
    async search(text) {
      typeIn(first('sale-search'), text);
      await settle(20);
    },
    async party(query) {
      typeIn(first('sale-party-search', paySheet()), query);
      await settle(20);
      await click(first('pick-party', paySheet()), 'pick-party');
    },
    async payKind(kind) {
      await click(pick('pay-kind', 'data-kind', kind, paySheet()), `pay ${kind}`);
    },
    async addLeg() {
      await click(first('pay-add', paySheet()), 'pay-add');
    },
    async padDone() {
      await click(first('pad-done', paySheet()), 'pad-done');
    },
    async save() {
      await click(first('save-invoice', paySheet()), 'save');
    },
    /** فاتورة العقد: العلف كيسين بخصم 1,000 والفيتامين ثلاث علب بالباركود، وخصم الفاتورة 5,000، وأبو علي، وصندوقان 50,000 و39,000. */
    async fillContract({ legs = true, note = true, onCart = null } = {}) {
      await d.store('w-gen');
      await d.tap('i-feed');
      await d.unit('u-bag');
      await d.keys('2');
      await d.tab('discount');
      await d.keys('1000');
      await d.done();
      await d.scan('6260000000024');
      await d.openLineOf('i-vit');
      await d.unit('u-box');
      await d.keys('3');
      await d.done();
      await d.openCart();
      d.discountText('5000');
      if (note) d.note('تسليم بالسيارة');
      await settle();
      if (onCart) await onCart();
      await d.next();
      await d.party('أبو');
      if (legs) {
        await d.payKind('part');
        await d.keys('50000');
        await d.addLeg();
        await d.keys('39000');
        await d.padDone();
      }
    },
  };
  return d;
}
