// تمديد لوحة المفاتيح إلى كلّ نافذة وصفحة فيها كتابة (عقد 0037 الجزء K): جرد الخانات صار شفرة، وهذا الفحص يحرسه على المصدر نفسه (keyboard-forms يسوق
// المستمع والنوافذ الحقيقية؛ هنا كلّ موضع من الجرد):
// S زرّ الحفظ زرّ نموذجه (type="submit"، ومن ذيل النافذة form={…}) وملفّه فيه نموذج بـnoSubmit: Enter في آخر خانة يضغطه، ونقرته وحدها تحفظ مرّة.
// O خانة تملك Enter معلَّمة data-enter="own" (المنتقيات والبحث، وخانة لها زرّها، والجولة، وورقة القاعة، والماسح)، والبحث بلا فعل يمنع الإرسال الضمنيّ.
// N كلّ نافذة (Dialog) في src فيها خانة كتابة فيها نموذج وزرّ حفظ له، إلّا المسمّاة هنا بسببها (جرد يمسك النافذة الجديدة بلا نموذج).
// كلّ سطر S وO يفشل على الشفرة قبل هذا التغيير؛ ومن N تفشل النوافذ المحوَّلة (اثنتا عشرة)، والتي كانت نماذج قبله تمرّ عليها (جرد)، كما يمرّ ما وُسم «ضابط».
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');
const tsxFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? tsxFiles(path.join(dir, entry.name)) : entry.name.endsWith('.tsx') ? [path.join(dir, entry.name)] : []));

/** نصّ العنصر الذي فيه needle: من أقرب وسم يبدأ قبله (لا أيقونة في سماته) إلى ما بعده بقليل. */
function around(source, needle) {
  const at = source.indexOf(needle);
  if (at < 0) return null;
  const start = Math.max(...['<Button', '<button', '<input', '<div', '<form', '<span'].map((tag) => source.lastIndexOf(tag, at)));
  return source.slice(start, at + needle.length + 160);
}

/** النصّ بلا ConfirmDialog متداخلة (من «<ConfirmDialog» إلى «/>» بمسافتها): خانتها لنموذجها هي. */
function withoutConfirms(source) {
  let out = source;
  for (let at = out.indexOf('<ConfirmDialog'); at >= 0; at = out.indexOf('<ConfirmDialog')) {
    const indent = out.slice(out.lastIndexOf('\n', at) + 1, at);
    const end = out.indexOf(`\n${indent}/>`, at);
    out = out.slice(0, at) + (end < 0 ? '' : out.slice(end + indent.length + 3));
  }
  return out;
}

const SUBMITS = [
  // النوافذ بعد تحويلها
  ['src/components/ui/ConfirmDialog.tsx', 'data-action={action}'],
  ['src/pages/farm/FlockEditDialog.tsx', 'data-action="flock-edit-save"'],
  ['src/pages/farm/FlockPage.tsx', 'data-action="weight-save"'],
  ['src/pages/halls/CloseSections.tsx', 'data-action="carry-return-go"'],
  ['src/pages/halls/CloseSections.tsx', 'data-action="reopen-go"'],
  ['src/pages/halls/FlockCard.tsx', 'data-action="count-go"'],
  ['src/pages/halls/Reminders.tsx', 'data-action="mark-go"'],
  ['src/pages/halls/TicketPage.tsx', 'data-action="pad-commit"'],
  ['src/pages/halls/TicketPage.tsx', 'data-action="ticket-void-confirm"'],
  ['src/pages/halls/VaccinesPage.tsx', "'vac-save'"],
  ['src/pages/inventory/stock-shared.tsx', 'data-action="confirm-void"'],
  ['src/pages/mill/BatchPage.tsx', 'data-action="input-save"'],
  // خانات الصفحات بزرّها
  ['src/pages/farm/RoundFeed.tsx', 'data-action="round-feed-send"'],
  ['src/pages/halls/ClosePage.tsx', 'data-action="close-go"'],
  ['src/pages/halls/GivePage.tsx', 'data-action="give-go"'],
  ['src/pages/halls/TicketPage.tsx', 'data-action="ticket-save"'],
  ['src/pages/halls/VaccinesPage.tsx', 'data-action="save-program"'],
  ['src/pages/mill/ProducePage.tsx', 'data-action="produce-go"'],
  ['src/pages/mill/RecipeBuilderPage.tsx', 'data-action="save-activate"'],
  ['src/pages/mill/RecipeEditPage.tsx', 'data-action="save-recipe-edit"'],
  ['src/pages/mill/RecipePage.tsx', 'data-action="add-rate"'],
  ['src/pages/mill/BatchPage.tsx', 'data-action="add-cost"'],
  ['src/pages/mill/BatchPage.tsx', 'data-action="save-weight"'],
  ['src/pages/inventory/CountsPage.tsx', 'data-action="save-count-review"'],
  ['src/pages/inventory/ItemCardPage.tsx', 'data-action={words.save}'],
  ['src/pages/inventory/ReceiptPostedPanels.tsx', 'data-action="preview-revalue"'],
  ['src/pages/inventory/ReceiptsPage.tsx', 'data-action="save-amounts"'],
  ['src/pages/inventory/ItemsPage.tsx', 'data-action="save-count-name"'],
  ['src/pages/inventory/stock-shared.tsx', 'data-action="save-draft-day"'],
  ['src/pages/accounts/OpeningBalancesPage.tsx', 'data-action="save-opening"'],
];

const OWNED = [
  ['src/pages/inventory/stock-shared.tsx', 'data-action="search-item"'],
  ['src/pages/inventory/purchase-shared.tsx', "placeholder={t('party.pick.search', 'ابحث بالاسم')}"],
  ['src/pages/accounts/shared.tsx', "placeholder={t('party.pick.search', 'ابحث بالاسم')}"],
  ['src/pages/inventory/ItemOps.tsx', 'data-action="op-item-search"'],
  ['src/pages/mill/pickers.tsx', 'data-action="search-material"'],
  ['src/pages/mill/pickers.tsx', 'data-action="new-category-name"'],
  ['src/pages/mill/pickers.tsx', 'data-action={action}'],
  ['src/pages/mill/cards.tsx', 'data-action="card-density-text"'],
  ['src/pages/mill/ProducePage.tsx', 'data-action="target-qty"'],
  ['src/pages/mill/RecipeBuilderPage.tsx', 'data-action="new-output-name"'],
  ['src/pages/farm/RoundPage.tsx', 'data-round-field={field}'],
  ['src/pages/farm/SheetGrid.tsx', 'data-action="sheet-grid"'],
  ['src/pages/sales/SaleCheckout.tsx', 'data-action="sale-search"'],
  ['src/pages/sales/SellSheets.tsx', 'data-action="sale-party-search"'],
];

/** ملفّات فيها نافذة بخانة كتابة بلا نموذج، بسببها. */
const NO_FORM = new Map([
  ['src/pages/farm/hallDialogs.tsx', 'نافذتا القاعة والفتح لجزء آخر من العقد نفسه يحوّلهما'],
  ['src/pages/accounts/PartyStatementPage.tsx', 'نصّ الكشف للنسخ (readOnly): لا كتابة'],
  ['src/pages/mill/ProducePage.tsx', 'منتقي المادّة: بحث بلا حفظ، وEnter فيه لا ينقل إلى شيء'],
]);

const TYPING = /<(input|textarea|select|MoneyInput|QtyInput|DayField)\b(?![^>]*type="(checkbox|radio|range)")/;

/** عناصر <Dialog …>…</Dialog> بالتداخل (لا ConfirmDialog ولا ReviewDialog: لهما ملفّاهما). */
function dialogs(source) {
  const out = [];
  const tag = /<Dialog\b|<\/Dialog>/g;
  let depth = 0;
  let start = -1;
  let match;
  while ((match = tag.exec(source))) {
    if (match[0] === '</Dialog>') {
      depth -= 1;
      if (depth === 0 && start >= 0) out.push(source.slice(start, match.index));
    } else {
      if (depth === 0) start = match.index;
      depth += 1;
    }
  }
  return out;
}

export default async function (t) {
  for (const [file, needle] of SUBMITS) {
    const source = read(file);
    const element = around(source, needle);
    const label = `${path.basename(file)} ${needle}`;
    t.ok(element !== null && /type="submit"/.test(element), `S ${label}: زرّ نموذجه (type="submit")`);
    t.ok(/<form\b[^>]*onSubmit=\{noSubmit\}/.test(source), `S ${label}: وفي ملفّه نموذج بـnoSubmit`);
  }
  for (const [file, needle] of OWNED) {
    const element = around(read(file), needle);
    t.ok(element !== null && element.includes('data-enter="own"'), `O ${path.basename(file)} ${needle}: data-enter="own"`);
  }
  {
    // البحث بلا فعل يمنع الإرسال الضمنيّ لنموذجه (ownEnter)، والمنتقي يختار بمطابقة واحدة ويمنع غيرها.
    for (const file of ['src/pages/inventory/purchase-shared.tsx', 'src/pages/accounts/shared.tsx', 'src/pages/inventory/ItemOps.tsx', 'src/pages/mill/pickers.tsx', 'src/pages/sales/SellSheets.tsx']) {
      t.ok(read(file).includes('onKeyDown={ownEnter}'), `O ${path.basename(file)}: البحث يمنع Enter (ownEnter)`);
    }
  }
  {
    // كلّ نافذة (Dialog) في src فيها خانة كتابة مباشرة: نموذج وزرّ حفظ له، إلّا المسمّاة في NO_FORM بسببها. نافذة جديدة بخانة بلا نموذج تفشل هنا.
    let checked = 0;
    for (const file of tsxFiles(path.join(ROOT, 'src'))) {
      const relative = path.relative(ROOT, file).split(path.sep).join('/');
      if (NO_FORM.has(relative)) continue;
      dialogs(readFileSync(file, 'utf8')).map(withoutConfirms).forEach((dialog, index) => {
        if (!TYPING.test(dialog)) return;
        checked += 1;
        t.ok(/<form\b/.test(dialog) && /type="submit"/.test(dialog), `N ${relative} نافذة ${index + 1}: فيها خانة كتابة، فنموذج وزرّ حفظ له`);
      });
    }
    t.ok(checked >= 25, `N ضابط: فُحصت نوافذ بخانات كتابة (${checked})`);
    // المستثنى موجود (لا اسم ملفّ قديم)؛ وhallDialogs يخرج من الاستثناء حين يُدمج تحويله.
    for (const file of NO_FORM.keys()) t.ok(dialogs(read(file)).length > 0, `N ضابط: ${file} في NO_FORM وفيه نافذة`);
  }
}
