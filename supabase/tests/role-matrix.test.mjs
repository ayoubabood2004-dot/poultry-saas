// مصفوفة الأدوار (FOUNDATION ٨٦٥ role-matrix-check، الخطّة §2.12): كل دالّة بقائمة السماح تننادى بكل دور من الثمانية بدور
// authenticated حقيقي، والمسموح ينجح (ضابط إيجابي بكل خانة) والممنوع يرجع forbidden، ودوالّ الهويّة ترجع قيمة كل دور
// كما بجدول الصلاحيات (DECISIONS). المرحلة 0 هنا من أوّل يوم حتى سجلّ التغطية (run.mjs) يفحص خانات حقيقية مو صفراً،
// وكل حزمة بالمرحلة 1 تزيد صفوف دوالّها (الخطّة تبدي الملف بـWP2؛ بدأ بـWP0 بدوالّ المرحلة 0). دالّة جديدة بقائمة السماح
// بلا صفّ هنا تفشّل الفحص.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSrc } from '../../scripts/tests/load-src.mjs';
import { ROLES } from './db.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ALLOWLIST = JSON.parse(readFileSync(path.join(DIR, 'allowlist.json'), 'utf8'));
const CLASSES = JSON.parse(readFileSync(path.join(DIR, 'classes.json'), 'utf8'));

const id = (n) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477050000${String(n).padStart(2, '0')}`;
const local = (canonical) => `0${canonical.slice(3)}`;
const USERS = Object.fromEntries(ROLES.map((role, i) => [role, id(i + 1)]));
const SPARE = { guest: id(20), pending: id(21) };

const all = (outcome) => Object.fromEntries(ROLES.map((role) => [role, outcome]));
const only = (allowed, yes = 'ok', no = 'forbidden') => Object.fromEntries(ROLES.map((role) => [role, allowed.includes(role) ? yes : no]));

export default async function (t, db) {
  const { can } = await loadSrc('src/domain/permissions.ts');
  for (const [i, role] of ROLES.entries()) {
    await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())', [USERS[role], phone(i + 1)]);
  }
  await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now()), ($3, $4, now())', [SPARE.guest, phone(20), SPARE.pending, phone(21)]);
  await db.asUser(USERS.owner, (q) => q("select public.create_my_org('مزرعة المصفوفة', 'المالك')"), { commit: true });
  const org = (await db.admin('select org_id from public.members where user_id = $1', [USERS.owner])).rows[0].org_id;
  const division = async (kind) => (await db.admin('select id from public.divisions where org_id = $1 and kind = $2', [org, kind])).rows[0].id;
  const broiler = await division('broiler');
  const layer = await division('layer');
  const member = {};
  for (const [i, role] of ROLES.entries()) {
    if (role === 'owner') continue;
    const scope = role === 'hall_worker' ? [broiler] : role === 'mill_operator' ? [await division('feed_mill')] : [];
    member[role] = await db.asUser(USERS.owner, async (q) => (await q('select public.add_member($1, $2, $3, $4::uuid[]) as id', [local(phone(i + 1)), role, role, scope])).rows[0].id, { commit: true });
    await db.acceptInvite(USERS.owner, USERS[role], member[role]);
  }
  member.owner = (await db.admin('select id from public.members where user_id = $1', [USERS.owner])).rows[0].id;
  const pending = await db.asUser(USERS.owner, async (q) => (await q("select public.add_member($1, 'viewer', 'مدعوّ') as id", [local(phone(21))])).rows[0].id, { commit: true });

  // المرحلة 1 (WP2): البذور (موقع المعمل، والمخزن العام) وحقل لحم بمخزنه ومادّة، والأمين بنطاق المخزن العام بس.
  const general = await division('general');
  const millSite = (await db.admin("select s.id from public.sites s join public.divisions d on d.id = s.division_id where s.org_id = $1 and d.kind = 'feed_mill'", [org])).rows[0].id;
  const generalStore = (await db.admin("select id from public.warehouses where org_id = $1 and kind = 'general'", [org])).rows[0].id;
  const farm = await db.asUser(
    USERS.owner,
    async (q) => {
      const site = (await q("insert into public.sites (division_id, name, kind) values ($1, 'حقل الرحمة', 'farm') returning id", [broiler])).rows[0].id;
      const store = (await q("insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن حقل الرحمة', 'farm') returning id", [broiler, site])).rows[0].id;
      const item = (await q("insert into public.items (name, kind, base_unit) values ('ذرة صفراء', 'raw', 'kg') returning id")).rows[0].id;
      await q("select public.set_member_scopes_v2($1, '{}', '{}', array[$2]::uuid[])", [member.storekeeper, generalStore]);
      return { site, store, item };
    },
    { commit: true },
  );

  // المرحلة 1 (WP3): يوم تشغيل المعمل، وجهتان وصندوقان، وقبض وافتتاح جهة وافتتاح صندوق مثبّتة، حتى الإلغاء والإعفاء ينجحون للمسموح
  // (كل نداء بالمصفوفة بمعاملة ترجع، فنفس القيد يلغيه المالك والمدير كلّ بمعاملته).
  const feedMill = await division('feed_mill');
  const millBook = (await db.admin("select id from public.ledger_books where org_id = $1 and division_id = $2", [org, feedMill])).rows[0].id;
  const ledger = await db.asUser(
    USERS.owner,
    async (q) => {
      const one = async (sql, params) => Object.values((await q(sql, params)).rows[0])[0];
      await q('select public.set_division_go_live($1, public.app_today() - 3)', [feedMill]);
      const debtor = await one("insert into public.parties (name, phone, is_customer) values ('أبو علي', '07701112233', true) returning id");
      const fresh = await one("insert into public.parties (name, is_supplier) values ('مورّد الحبوب', true) returning id");
      const box = await one("insert into public.cash_accounts (name, kind) values ('الصندوق', 'cash') returning id");
      const bank = await one("insert into public.cash_accounts (name, kind) values ('المصرف', 'bank') returning id");
      const opening = await one("select (public.record_opening_balance(gen_random_uuid(), $1, $2, 500000, public.app_today() - 3, gen_random_uuid())) ->> 'id'", [debtor, millBook]);
      const payment = await one("select (public.record_party_payment(gen_random_uuid(), $1, $2, 100000, $3, public.app_today(), gen_random_uuid())) ->> 'id'", [debtor, millBook, box]);
      const cashOpening = await one("select (public.record_cash_opening(gen_random_uuid(), $1, 250000, public.app_today() - 3, gen_random_uuid())) ->> 'id'", [box]);
      return { debtor, fresh, box, bank, opening, payment, cashOpening };
    },
    { commit: true },
  );
  const ACCOUNTS = ['owner', 'manager', 'accountant'];

  // المرحلة 1 (WP4): يوم تشغيل المخازن العامة، وافتتاحان مرحّلان بالمخزن العامّ (كاز أويل للإلغاء، وكاز أبيض للتحويل)، وتحويل مرحّل
  // للمواد الأوّلية بالمعمل، ومسوّدة تحويل بسطر ومسوّدة افتتاح بسطر (بنزين). العامّة صار بيها ترحيل، فيوم تشغيلها ثابت، وصفّ
  // set_division_go_live يجرّب حقول البيض (بلا ترحيل).
  const millRaw = (await db.admin("select id from public.warehouses where org_id = $1 and kind = 'raw'", [org])).rows[0].id;
  const STOCK = ['owner', 'manager', 'storekeeper', 'accountant'];
  const TRANSFER = ['owner', 'manager', 'storekeeper'];
  const stock = await db.asUser(
    USERS.owner,
    async (q) => {
      const one = async (sql, params) => Object.values((await q(sql, params)).rows[0])[0];
      await q('select public.set_division_go_live($1, public.app_today() - 3)', [general]);
      const fuel = async (name) => one("insert into public.items (name, kind, base_unit) values ($1, 'fuel', 'L') returning id", [name]);
      const diesel = await fuel('كاز أويل');
      const kerosene = await fuel('كاز أبيض');
      const petrol = await fuel('بنزين');
      const version = async (table, docId) => one(`select version from public.${table} where id = $1`, [docId]);
      const opening = async (item, qty, amount) => {
        const doc = await one('insert into public.opening_docs (warehouse_id, on_date) values ($1, public.app_today() - 3) returning id', [generalStore]);
        await q('insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, $3, $4)', [doc, item, qty, amount]);
        return doc;
      };
      const posted = await opening(diesel, 100, 80000);
      await q('select public.post_opening_stock($1, $2, gen_random_uuid())', [posted, await version('opening_docs', posted)]);
      const stocked = await opening(kerosene, 500, 375000);
      await q('select public.post_opening_stock($1, $2, gen_random_uuid())', [stocked, await version('opening_docs', stocked)]);
      const transfer = async (qty) => {
        const doc = await one('insert into public.transfers (from_warehouse_id, to_warehouse_id, moved_on) values ($1, $2, public.app_today()) returning id', [generalStore, millRaw]);
        const line = await one('insert into public.transfer_lines (doc_id, item_id, qty_in_unit) values ($1, $2, $3) returning id', [doc, kerosene, qty]);
        return { doc, line };
      };
      const moved = await transfer(100);
      await q('select public.post_transfer($1, $2, public.preview_transfer($1) ->> \'plan\', gen_random_uuid())', [moved.doc, await version('transfers', moved.doc)]);
      const draft = await transfer(50);
      const draftOpening = await opening(petrol, 10, 7500);
      return {
        diesel,
        kerosene,
        posted,
        moved: moved.doc,
        draft: draft.doc,
        draftLine: draft.line,
        draftVersion: await version('transfers', draft.doc),
        draftOpening,
        openingLine: await one('select id from public.opening_lines where doc_id = $1', [draftOpening]),
        openingVersion: await version('opening_docs', draftOpening),
      };
    },
    { commit: true },
  );

  // المرحلة 1 (WP5): تصنيف مصروف، ومصروف نقدي مرحَّل من المصرف (لإلغائه)، وزيت محرّكات بافتتاح 200 لتر بـ100,000 بالمخزن العامّ:
  // صرف مرحَّل 10 لترات (لإلغائه) ومسوّدة صرف 5 لترات، وجرد مرحَّل بنقص لتر (لإلغائه)، وجرد مسلَّم (زيت بنقص لترين وسببه، وكاز أبيض
  // بلا فرق)، ومسوّدة جرد (لتسليمها)، وكلفة زيادة على سطر الزيت المسلَّم (لتعديلها).
  const wp5 = await db.asUser(
    USERS.owner,
    async (q) => {
      const one = async (sql, params) => Object.values((await q(sql, params)).rows[0])[0];
      const version = async (table, docId) => one(`select version from public.${table} where id = $1`, [docId]);
      const category = await one("insert into public.expense_categories (name) values ('نقل') returning id");
      const expense = await one("select (public.record_expense(gen_random_uuid(), $1, $2, 1000, public.app_today(), 'cash', $3, null, null, null, null, null, null, null, gen_random_uuid())) ->> 'id'", [category, general, ledger.bank]);
      const oil = await one("insert into public.items (name, kind, base_unit) values ('زيت محرّكات', 'fuel', 'L') returning id");
      const opening = await one('insert into public.opening_docs (warehouse_id, on_date) values ($1, public.app_today() - 3) returning id', [generalStore]);
      await q('insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, 200, 100000)', [opening, oil]);
      await q('select public.post_opening_stock($1, $2, gen_random_uuid())', [opening, await version('opening_docs', opening)]);
      const use = async (qty) => {
        const doc = await one('insert into public.stock_uses (warehouse_id, category_id, used_on) values ($1, $2, public.app_today()) returning id', [generalStore, category]);
        const line = await one('insert into public.stock_use_lines (doc_id, item_id, qty_in_unit) values ($1, $2, $3) returning id', [doc, oil, qty]);
        return { doc, line };
      };
      const usePosted = await use(10);
      await q("select public.post_stock_use($1, $2, public.preview_stock_use($1) ->> 'plan', gen_random_uuid())", [usePosted.doc, await version('stock_uses', usePosted.doc)]);
      const useDraft = await use(5);
      const count = async (lines) => {
        const doc = await one('insert into public.stock_counts (warehouse_id, counted_on) values ($1, public.app_today()) returning id', [generalStore]);
        const ids = [];
        for (const [item, qty] of lines) ids.push(await one('insert into public.stock_count_lines (doc_id, item_id, counted_qty) values ($1, $2, $3) returning id', [doc, item, qty]));
        return { doc, lines: ids };
      };
      const approved = await count([[oil, 189]]);
      await q('select public.submit_count($1, $2, gen_random_uuid())', [approved.doc, await version('stock_counts', approved.doc)]);
      await q("update public.stock_count_lines set reason = 'تسرّب', reason_diff = diff, reason_expired_diff = expired_diff where doc_id = $1", [approved.doc]);
      await q("select public.post_count($1, $2, public.preview_count($1) ->> 'plan', gen_random_uuid())", [approved.doc, await version('stock_counts', approved.doc)]);
      const submitted = await count([[oil, 187], [stock.kerosene, 400]]);
      await q('select public.submit_count($1, $2, gen_random_uuid())', [submitted.doc, await version('stock_counts', submitted.doc)]);
      await q("update public.stock_count_lines set reason = 'تسرّب', reason_diff = diff, reason_expired_diff = expired_diff where id = $1", [submitted.lines[0]]);
      const cost = await one('insert into public.stock_count_line_costs (line_id, gain_unit_cost) values ($1, 500) returning id', [submitted.lines[0]]);
      const draft = await count([[oil, 189]]);
      return {
        category,
        expense,
        oil,
        usePosted: usePosted.doc,
        useDraft: useDraft.doc,
        useDraftLine: useDraft.line,
        useVersion: await version('stock_uses', useDraft.doc),
        countApproved: approved.doc,
        countSubmitted: submitted.doc,
        countSubmittedLine: submitted.lines[1],
        countSubmittedVersion: await version('stock_counts', submitted.doc),
        cost,
        countDraft: draft.doc,
        countDraftLine: draft.lines[0],
        countDraftVersion: await version('stock_counts', draft.doc),
      };
    },
    { commit: true },
  );
  const COUNT_APPROVE = ['owner', 'manager'];

  // المرحلة 1 (WP6): استلام مرحَّل (لإلغائه) لذرة بمخزن المعمل بمبلغ صفر وسببه (بلا قيد ولا حركة صندوق، فما يغيّر صفوف المخزون
  // والدفاتر فوك)؛ وكاز أبيض بالمخزن العامّ من «مورّد الحبوب»: مسوّدة مسعَّرة بسطر ورأس مبالغ وتحميل من الصندوق (للترحيل والمعاينة وحذف التحميل واختيار سطوره وتعديل المبالغ)، ومسوّدة ثانية بسطر بلا مبلغ (لإدخاله وطيّ المسوّدة).
  const wp6 = await db.asUser(
    USERS.owner,
    async (q) => {
      const one = async (sql, params) => Object.values((await q(sql, params)).rows[0])[0];
      const version = async (docId) => one('select version from public.receipts where id = $1', [docId]);
      const draft = async (wh = generalStore, item = stock.kerosene) => {
        const doc = await one('insert into public.receipts (party_id, warehouse_id, received_on) values ($1, $2, public.app_today()) returning id', [ledger.fresh, wh]);
        const line = await one('insert into public.receipt_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 10) returning id', [doc, item]);
        return { doc, line };
      };
      const posted = await draft(millRaw, farm.item);
      await q("insert into public.receipt_line_amounts (line_id, line_total, zero_reason) values ($1, 0, 'عيّنة مجانية')", [posted.line]);
      await q('select public.post_receipt($1, $2, gen_random_uuid())', [posted.doc, await version(posted.doc)]);
      const priced = await draft();
      const lineAmount = await one('insert into public.receipt_line_amounts (line_id, line_total) values ($1, 7500) returning id', [priced.line]);
      const amounts = await one('insert into public.receipt_amounts (doc_id, discount) values ($1, 0) returning id', [priced.doc]);
      const charge = await one("insert into public.receipt_charges (doc_id, label, amount, allocate_by, cash_account_id) values ($1, 'نقل', 500, 'value', $2) returning id", [priced.doc, ledger.box]);
      const bare = await draft();
      return {
        posted: posted.doc,
        draft: priced.doc,
        line: priced.line,
        lineAmount,
        amounts,
        charge,
        version: await version(priced.doc),
        bare: bare.doc,
        bareLine: bare.line,
        bareVersion: await version(bare.doc),
      };
    },
    { commit: true },
  );

  // المرحلة 1 (WP7): استلام مرحَّل بالمخزن العامّ بسطرين لمادّتين جديدتين (10 لترات بـ7,500 لكل وحدة): الأوّل للمرتجع (مرتجع مرحَّل
  // منه لتر بمقبول 700 لإلغائه، ومسوّدة مقبولها مكتوب للترحيل والمعاينة وتعديل المقبول وحذف السطر، ومسوّدة بسطر بلا مقبول لإدخاله
  // وطيّها، ومسوّدة فارغة لإدخال سطر)، والثاني للتصحيح (انصرف منه لتران فيصحّ، وتصحيح مرحَّل لـ7,600 لإلغائه). سطران منفصلان حتى
  // حركة التصحيح ما تقع على دفعة المرتجع بعده (فيمتنع إلغاؤه، lot_consumed).
  const wp7 = await db.asUser(
    USERS.owner,
    async (q) => {
      const one = async (sql, params) => Object.values((await q(sql, params)).rows[0])[0];
      const version = async (docId) => one('select version from public.supplier_returns where id = $1', [docId]);
      const fuelA = await one("insert into public.items (name, kind, base_unit) values ('كاز المرتجع', 'fuel', 'L') returning id");
      const fuelB = await one("insert into public.items (name, kind, base_unit) values ('كاز التصحيح', 'fuel', 'L') returning id");
      const receipt = await one('insert into public.receipts (party_id, warehouse_id, received_on) values ($1, $2, public.app_today()) returning id', [ledger.fresh, generalStore]);
      const lineA = await one('insert into public.receipt_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 10) returning id', [receipt, fuelA]);
      const lineB = await one('insert into public.receipt_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 10) returning id', [receipt, fuelB]);
      await q('insert into public.receipt_line_amounts (line_id, line_total) values ($1, 7500), ($2, 7500)', [lineA, lineB]);
      await q('select public.post_receipt($1, (select version from public.receipts where id = $1), gen_random_uuid())', [receipt]);
      const use = await one('insert into public.stock_uses (warehouse_id, category_id, used_on) values ($1, $2, public.app_today()) returning id', [generalStore, wp5.category]);
      await q('insert into public.stock_use_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 2)', [use, fuelB]);
      await q("select public.post_stock_use($1, (select version from public.stock_uses where id = $1), public.preview_stock_use($1) ->> 'plan', gen_random_uuid())", [use]);
      const draft = async (qty) => {
        const doc = await one('insert into public.supplier_returns (receipt_id, returned_on) values ($1, public.app_today()) returning id', [receipt]);
        const line = qty === null ? null : await one('insert into public.supplier_return_lines (doc_id, receipt_line_id, qty_base) values ($1, $2, $3) returning id', [doc, lineA, qty]);
        return { doc, line };
      };
      const posted = await draft(1);
      await q('insert into public.supplier_return_line_amounts (line_id, credit_amount) values ($1, 700)', [posted.line]);
      await q("select public.post_supplier_return($1, $2, public.preview_supplier_return($1) ->> 'plan', gen_random_uuid())", [posted.doc, await version(posted.doc)]);
      const revaluation = await one("select public.post_receipt_revalue($1, 7600, public.preview_receipt_revalue($1, 7600) ->> 'plan', 'فاتورة معدّلة', gen_random_uuid()) ->> 'id'", [lineB]);
      const priced = await draft(2);
      const credit = await one('insert into public.supplier_return_line_amounts (line_id, credit_amount) values ($1, 1500) returning id', [priced.line]);
      const bare = await draft(1);
      const empty = await draft(null);
      return {
        receipt,
        fuelA,
        fuelB,
        receiptLine: lineA,
        revalueLine: lineB,
        plan7700: await one("select public.preview_receipt_revalue($1, 7700) ->> 'plan'", [lineB]),
        posted: posted.doc,
        revaluation,
        draft: priced.doc,
        line: priced.line,
        credit,
        version: await version(priced.doc),
        bare: bare.doc,
        bareLine: bare.line,
        bareVersion: await version(bare.doc),
        empty: empty.doc,
      };
    },
    { commit: true },
  );

  // 0011 (قرارات المالك 2026-10-31): تحويل مرحَّل ثم ملغى (10 لترات كاز أويل من العامّ للمواد الأوّلية، فدفعة الافتتاح ترجع كما
  // كانت بالفلس) وافتتاح مرحَّل ثم ملغى (مادّة جديدة بالعامّ، متبقّيها صفر فما تبين باللوحة ولا بالقيم)، والإلغاء مثبَّت؛ والنسخ
  // للتصحيح بكل خانة بمعاملة ترجع.
  const v11 = await db.asUser(
    USERS.owner,
    async (q) => {
      const one = async (sql, params) => Object.values((await q(sql, params)).rows[0])[0];
      const transfer = await one('insert into public.transfers (from_warehouse_id, to_warehouse_id, moved_on) values ($1, $2, public.app_today()) returning id', [generalStore, millRaw]);
      await q('insert into public.transfer_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 10)', [transfer, stock.diesel]);
      await q("select public.post_transfer($1, (select version from public.transfers where id = $1), public.preview_transfer($1) ->> 'plan', gen_random_uuid())", [transfer]);
      await q("select public.void_transfer($1, 'تحويل للنسخ', gen_random_uuid())", [transfer]);
      const solar = await one("insert into public.items (name, kind, base_unit) values ('سولار النسخ', 'fuel', 'L') returning id");
      const opening = await one('insert into public.opening_docs (warehouse_id, on_date) values ($1, public.app_today() - 3) returning id', [generalStore]);
      await q('insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, 5, 4000)', [opening, solar]);
      await q('select public.post_opening_stock($1, (select version from public.opening_docs where id = $1), gen_random_uuid())', [opening]);
      await q("select public.void_opening_stock($1, 'افتتاح للنسخ', gen_random_uuid())", [opening]);
      // صرف الزيت (WP5) صار قبل جرد معتمد لنفس المادّة والمخزن بيومه، فإلغاؤه count_superseded: صفّ void_stock_use على صرف مادّة
      // بلا جرد (افتتاح بالمواد الأوّلية بقيمة صفر وسببها، فالصرف بلا مصروف وما يغيّر التقارير فوك).
      const sample = await one("insert into public.items (name, kind, base_unit) values ('زيت عيّنة', 'fuel', 'L') returning id");
      const sampleOpening = await one('insert into public.opening_docs (warehouse_id, on_date) values ($1, public.app_today() - 3) returning id', [millRaw]);
      await q("insert into public.opening_lines (doc_id, item_id, qty_base, value, zero_reason) values ($1, $2, 10, 0, 'عيّنة مجانية')", [sampleOpening, sample]);
      await q('select public.post_opening_stock($1, (select version from public.opening_docs where id = $1), gen_random_uuid())', [sampleOpening]);
      const use = await one('insert into public.stock_uses (warehouse_id, category_id, used_on) values ($1, $2, public.app_today()) returning id', [millRaw, wp5.category]);
      await q('insert into public.stock_use_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 2)', [use, sample]);
      await q("select public.post_stock_use($1, (select version from public.stock_uses where id = $1), public.preview_stock_use($1) ->> 'plan', gen_random_uuid())", [use]);
      return { transfer, opening, use };
    },
    { commit: true },
  );

  // 0012 (حقول اللحم والبيض، النسخة الأولى): قاعة بفوج مفتوح (1,000 طير) وقاعة فارغة بحقل الرحمة (لحم)، بكتابة المالك ودالّته.
  const p2 = await db.asUser(
    USERS.owner,
    async (q) => {
      const one = async (sql, params) => Object.values((await q(sql, params)).rows[0])[0];
      const hall = await one("insert into public.halls (site_id, name, capacity) values ($1, 'قاعة 1', 5000) returning id", [farm.site]);
      const empty = await one("insert into public.halls (site_id, name) values ($1, 'قاعة 2') returning id", [farm.site]);
      const flock = await one("select public.open_flock($1, public.app_today() - 3, 1000, 0, null, gen_random_uuid()) ->> 'flock_id'", [hall]);
      return { hall, empty, flock };
    },
    { commit: true },
  );
  const FLOCK_MANAGE = ['owner', 'manager'];
  const FLOCK_DAY = ['owner', 'manager', 'hall_worker'];
  const FLOCK_SCOPE = ['owner', 'manager', 'accountant', 'hall_worker'];

  // كل صفّ: النداء ونتيجة كل دور. value: ترجع القيمة بالنتيجة (ok:<قيمة>) لدوالّ الهويّة.
  // 0015 (معمل العلف): خلطة مفعَّلة بسطر ذرة واحد لأساس 100 كغم، ونسخة مسوّدة ثانية وسطرها (للتفعيل والتعديل والحذف)،
  // وخلطة بلا نسخ (لإدراج نسخة)، ومخزون ذرة بمخزن المواد الأوّلية، ودفعة مسوّدة (للمعاينة والختم والترحيل) ودفعة مرحَّلة
  // (للبطاقة والإلغاء). كل خانة تنفَّذ بمعاملة تُرجَع، فالبذرة واحدة لكل الأدوار.
  const p3 = await db.asUser(
    USERS.owner,
    async (q) => {
      const one = async (sql, params) => Object.values((await q(sql, params)).rows[0])[0];
      const raw = await one("select id from public.warehouses where kind = 'raw'");
      const feedStore = await one("select id from public.warehouses where kind = 'feed'");
      const output = await one("insert into public.items (name, kind, base_unit) values ('علف المصفوفة', 'feed', 'kg') returning id");
      const bran = await one("insert into public.items (name, kind, base_unit) values ('نخالة المصفوفة', 'raw', 'kg') returning id");
      // مادّة المعمل لحالها: «ذرة صفراء» مال البذور لها حركات، ورصيد البداية يُرفض لمادّة متحرّكة (item_has_moves).
      const corn = await one("insert into public.items (name, kind, base_unit) values ('ذرة المعمل', 'raw', 'kg') returning id");
      const recipe = await one("insert into public.recipes (name, output_item_id) values ('خلطة المصفوفة', $1) returning id", [output]);
      const spare = await one("insert into public.recipes (name, output_item_id) values ('خلطة بلا نسخ', $1) returning id", [output]);
      const version = await one('insert into public.recipe_versions (recipe_id, basis_kg) values ($1, 100) returning id', [recipe]);
      await q("insert into public.recipe_lines (version_id, item_id, qty, unit) values ($1, $2, 100, 'kg')", [version, corn]);
      await q('select public.activate_recipe_version($1, (select version from public.recipe_versions where id = $1))', [version]);
      const draftVersion = await one('insert into public.recipe_versions (recipe_id, basis_kg) values ($1, 100) returning id', [recipe]);
      const draftLine = await one("insert into public.recipe_lines (version_id, item_id, qty, unit) values ($1, $2, 100, 'kg') returning id", [draftVersion, corn]);
      // 0016: فئتا مصروف للمعمل، ومعدّل «أجور المعمل» على النسخة المسوّدة (لتعديله وحذفه)، وسطر كلفة يدوي بالمبلغ صفر على الدفعة
      // المسوّدة (لتعديله وحذفه؛ الصفر لا يحتاج تحميلاً، فترحيل المسوّدة في خانته ينجح كما كان).
      const labor = await one("insert into public.expense_categories (name) values ('أجور المعمل') returning id");
      const transport = await one("insert into public.expense_categories (name) values ('نقل المعمل') returning id");
      const draftRate = await one('insert into public.recipe_cost_rates (version_id, category_id, amount_per_ton) values ($1, $2, 1000) returning id', [draftVersion, labor]);
      const opening = await one('insert into public.opening_docs (warehouse_id, on_date) values ($1, public.app_today() - 3) returning id', [raw]);
      await q('insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, 500, 450000)', [opening, corn]);
      await q('select public.post_opening_stock($1, (select version from public.opening_docs where id = $1), gen_random_uuid())', [opening]);
      const draftBatch = await one('select gen_random_uuid()');
      await q('select public.create_production($1, $2, 50, $3, $4, public.app_today())', [draftBatch, version, raw, feedStore]);
      const draftInput = await one('select id from public.production_inputs where batch_id = $1', [draftBatch]);
      const draftCost = await one('insert into public.production_costs (batch_id, category_id, amount) values ($1, $2, 0) returning id', [draftBatch, labor]);
      const postedBatch = await one('select gen_random_uuid()');
      await q('select public.create_production($1, $2, 50, $3, $4, public.app_today())', [postedBatch, version, raw, feedStore]);
      await q("select public.post_production($1, (select version from public.production_batches where id = $1), public.preview_production($1) ->> 'plan_token', gen_random_uuid())", [postedBatch]);
      return {
        raw,
        feedStore,
        output,
        bran,
        recipe,
        spare,
        version,
        draftVersion,
        draftVersionNo: await one('select version from public.recipe_versions where id = $1', [draftVersion]),
        draftLine,
        draftBatch,
        draftInput,
        labor,
        transport,
        draftRate,
        draftCost,
        draftBatchVersion: await one('select version from public.production_batches where id = $1', [draftBatch]),
        postedBatch,
      };
    },
    { commit: true },
  );
  const RECIPE = ['owner', 'manager'];
  const MILL_DRAFT = ['owner', 'manager', 'mill_operator'];
  const MILL_POST = ['owner', 'manager', 'accountant'];
  const MILL_SCOPE = ['owner', 'manager', 'accountant', 'mill_operator'];
  // 0019 (الصرف لفوج القاعة): مادّة علف لحالها برصيد افتتاح 100 كغم في مخزن العلف (لا تمسّ دفعة ناتج الإنتاج المرحَّل، فإلغاؤه يبقى ممكناً)،
  // وصرف 10 كغم منها لفوج قاعة 1 مثبَّت لخانة الإلغاء؛ وكلّ خانة صرف تُرجَع.
  const p19 = await db.asUser(
    USERS.owner,
    async (q) => {
      const one = async (sql, params) => Object.values((await q(sql, params)).rows[0])[0];
      const feedItem = await one("insert into public.items (name, kind, base_unit) values ('علف الصرف', 'feed', 'kg') returning id");
      const opening = await one('insert into public.opening_docs (warehouse_id, on_date) values ($1, public.app_today() - 3) returning id', [p3.feedStore]);
      await q('insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, 100, 60000)', [opening, feedItem]);
      await q('select public.post_opening_stock($1, (select version from public.opening_docs where id = $1), gen_random_uuid())', [opening]);
      const issue = await one("select public.record_flock_issue(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), $1, $2, 10, public.app_today(), null) ->> 'id'", [p2.flock, feedItem]);
      return { feedItem, issue };
    },
    { commit: true },
  );

  // 0020 (عمليات المخزن البسيطة): مادّة بلا استعمال للحذف، وشراء كاز بلا سعر بالمخزن العامّ (10 لترات) يُسعَّر في خانته، وتحويل لترين منه إلى
  // «زيت المصفوفة» مثبَّت لخانة الإلغاء؛ وكلّ خانة تُرجَع.
  const p20 = await db.asUser(
    USERS.owner,
    async (q) => {
      const one = async (sql, params) => Object.values((await q(sql, params)).rows[0])[0];
      const fresh = await one("insert into public.items (name, kind, base_unit) values ('مادّة الحذف', 'raw', 'kg') returning id");
      const fuel = await one("insert into public.items (name, kind, base_unit) values ('كاز التسعير', 'fuel', 'L') returning id");
      const oil = await one("insert into public.items (name, kind, base_unit) values ('زيت المصفوفة', 'fuel', 'L') returning id");
      const line = await one('select gen_random_uuid()');
      await q("select public.record_purchase(gen_random_uuid(), gen_random_uuid(), $1, $2, $3, public.app_today(), 10, null, null, 'credit', null, null)", [line, fuel, ledger.fresh]);
      const conversion = await one("select public.record_conversion(gen_random_uuid(), gen_random_uuid(), $1, 2, $2, 2, public.app_today(), null, null) ->> 'id'", [fuel, oil]);
      return { fresh, fuel, oil, line, conversion };
    },
    { commit: true },
  );

  // 0021 (البيع): بيع لتر من «كاز التسعير» بـ1,000 لـ«الجهة الجديدة» بالدين من المخزن العامّ مثبَّت لخانتي الإلغاء والتفصيل؛ وكلّ خانة تُرجَع.
  const p21 = await db.asUser(
    USERS.owner,
    async (q) => {
      const one = async (sql, params) => Object.values((await q(sql, params)).rows[0])[0];
      const sale = await one("select public.record_sale(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), $1, $2, 1, 1000, public.app_today(), 'credit', null, null) ->> 'id'", [ledger.fresh, p20.fuel]);
      return { sale };
    },
    { commit: true },
  );

  // 0022 (الرصيد اليومي): تصنيف «تصنيف المصفوفة» يُملأ بـ«كاز التسعير» في خانته؛ وكلّ خانة تُرجَع.
  const p22 = await db.asUser(
    USERS.owner,
    async (q) => ({ category: Object.values((await q("insert into public.item_categories (name) values ('تصنيف المصفوفة') returning id")).rows[0])[0] }),
    { commit: true },
  );

  const ROWS = {
    accept_invite_code: { sql: (role) => ["select public.accept_invite_code($1, '000000')", [member[role]]], expect: all('invite_not_found') },
    add_member: { sql: () => ["select public.add_member($1, 'viewer', 'ضيف')", [local(phone(20))]], expect: only(['owner']) },
    // الدعوة بنطاق موقع أو مخزن بنداء واحد (0005): المالك بس، مثل add_member.
    add_member_v2: { sql: () => ["select public.add_member_v2($1, 'storekeeper', 'ضيف', '{}', '{}', array[$2]::uuid[])", [local(phone(20)), generalStore]], expect: only(['owner']) },
    app_today: { sql: () => ["select public.app_today() = (now() at time zone 'Asia/Baghdad')::date as v", []], value: true, expect: all('ok:true') },
    archive_member: { sql: () => ['select public.archive_member($1)', [member.viewer]], expect: only(['owner']) },
    auth_org: { sql: () => ['select public.auth_org() = $1::uuid as v', [org]], value: true, expect: all('ok:true') },
    can: { sql: () => ["select public.can('members.manage', false) as v", []], value: true, expect: only(['owner'], 'ok:true', 'ok:false') },
    can_see_accounts: { sql: () => ['select public.can_see_accounts() as v', []], value: true, expect: only(['owner', 'manager', 'accountant'], 'ok:true', 'ok:false') },
    can_see_cost: { sql: () => ['select public.can_see_cost() as v', []], value: true, expect: only(['owner', 'manager', 'accountant'], 'ok:true', 'ok:false') },
    can_see_sales: { sql: () => ['select public.can_see_sales() as v', []], value: true, expect: only(['owner', 'manager', 'storekeeper', 'accountant', 'viewer'], 'ok:true', 'ok:false') },
    create_my_org: { sql: () => ["select public.create_my_org('منشأة ثانية', 'س')", []], expect: all('already_member') },
    decline_and_block: { sql: (role) => ['select public.decline_and_block($1)', [member[role]]], expect: all('invite_not_found') },
    decline_invite: { sql: (role) => ['select public.decline_invite($1)', [member[role]]], expect: all('invite_not_found') },
    in_scope_division: { sql: () => ['select public.in_scope_division($1) as v', [broiler]], value: true, expect: only(['owner', 'manager', 'accountant', 'hall_worker'], 'ok:true', 'ok:false') },
    invite_code: { sql: () => ['select length(public.invite_code($1)) as v', [pending]], value: true, expect: only(['owner'], 'ok:6') },
    leave_my_org: { sql: () => ['select public.leave_my_org()', []], expect: { ...all('ok'), owner: 'last_owner' } },
    my_workspace: { sql: () => ["select public.my_workspace() ->> 'role' as v", []], value: true, expect: Object.fromEntries(ROLES.map((role) => [role, `ok:${role}`])) },
    set_member_role: { sql: () => ["select public.set_member_role($1, 'viewer')", [member.hall_worker]], expect: only(['owner']) },
    set_member_scopes: { sql: () => ['select public.set_member_scopes($1, array[$2]::uuid[])', [member.hall_worker, layer]], expect: only(['owner']) },
    set_period_lock: { sql: () => ['select public.set_period_lock(public.app_today() - 3)', []], expect: only(['owner', 'manager']) },
    // المرحلة 1 (WP2، §2.12): التوائم لكل عضو (read)، والنطاق بالموقع والمخزن (الأمين مخزنه بس، وعامل القاعة وحدته بس)، ويوم
    // التشغيل للمدير (opening.post، Q1)، والنطاق الجديد للمالك بس (members.manage).
    find_item_twins: { sql: () => ["select jsonb_array_length(public.find_item_twins('ذره صفراء', '{}')) as v", []], value: true, expect: all('ok:1') },
    in_scope_site: { sql: () => ['select public.in_scope_site($1) as v', [millSite]], value: true, expect: only(['owner', 'manager', 'accountant', 'mill_operator'], 'ok:true', 'ok:false') },
    in_scope_wh: { sql: () => ['select public.in_scope_wh($1) as v', [generalStore]], value: true, expect: only(['owner', 'manager', 'accountant', 'storekeeper'], 'ok:true', 'ok:false') },
    set_division_go_live: { sql: () => ['select public.set_division_go_live($1, public.app_today() - 1)', [layer]], expect: only(['owner', 'manager']) },
    set_member_scopes_v2: { sql: () => ["select public.set_member_scopes_v2($1, array[$2]::uuid[], '{}', '{}')", [member.hall_worker, layer]], expect: only(['owner']) },
    // المرحلة 1 (WP3، §2.12): الافتتاح للمدير (opening.post)، والقبض والدفع والنقل والمعاينة للمحاسب والمدير (payment.post)، والتسوية
    // والإعفاء للمدير (party.adjust)، وكل إلغاء للمدير (void)، والتقارير لأدوار الحسابات (accounts.view ويّا can_see_accounts)،
    // والرئيسية لكل عضو وبطاقة الحسابات لأدوارها، والتوائم لمن يضيف جهة (party.create)، والدفتر بالنطاق (E49).
    in_scope_book: { sql: () => ['select public.in_scope_book($1) as v', [millBook]], value: true, expect: only([...ACCOUNTS, 'mill_operator'], 'ok:true', 'ok:false') },
    record_opening_balance: { sql: () => ['select public.record_opening_balance(gen_random_uuid(), $1, $2, 100000, public.app_today() - 3, gen_random_uuid())', [ledger.fresh, millBook]], expect: only(['owner', 'manager']) },
    record_party_payment: { sql: () => ['select public.record_party_payment(gen_random_uuid(), $1, $2, 1000, $3, public.app_today(), gen_random_uuid())', [ledger.debtor, millBook, ledger.box]], expect: only(ACCOUNTS) },
    pay_party: { sql: () => ['select public.pay_party(gen_random_uuid(), $1, $2, 1000, $3, public.app_today(), gen_random_uuid())', [ledger.fresh, millBook, ledger.box]], expect: only(ACCOUNTS) },
    void_party_payment: { sql: () => ["select public.void_party_payment($1, 'قبض مكرّر', gen_random_uuid())", [ledger.payment]], expect: only(['owner', 'manager']) },
    record_party_adjustment: { sql: () => ["select public.record_party_adjustment(gen_random_uuid(), $1, $2, 'debit', 1000, public.app_today(), 'فرق حساب', gen_random_uuid())", [ledger.debtor, millBook]], expect: only(['owner', 'manager']) },
    forgive_debt: { sql: () => ["select public.forgive_debt(gen_random_uuid(), $1, $2, 1000, public.app_today(), 'خصم تسوية', gen_random_uuid())", [ledger.debtor, millBook]], expect: only(['owner', 'manager']) },
    void_party_entry: { sql: () => ["select public.void_party_entry($1, 'افتتاح خاطئ', gen_random_uuid())", [ledger.opening]], expect: only(['owner', 'manager']) },
    record_cash_opening: { sql: () => ['select public.record_cash_opening(gen_random_uuid(), $1, 100000, public.app_today() - 3, gen_random_uuid())', [ledger.bank]], expect: only(['owner', 'manager']) },
    transfer_cash: { sql: () => ['select public.transfer_cash(gen_random_uuid(), $1, $2, 1000, public.app_today(), null, gen_random_uuid())', [ledger.box, ledger.bank]], expect: only(ACCOUNTS) },
    void_cash_move: { sql: () => ["select public.void_cash_move($1, 'رصيد خاطئ', gen_random_uuid())", [ledger.cashOpening]], expect: only(['owner', 'manager']) },
    preview_party_allocation: { sql: () => ["select public.preview_party_allocation($1, $2, 'payment', 1000) -> 'money' ->> 'amount' as v", [ledger.debtor, millBook]], value: true, expect: only(ACCOUNTS, 'ok:-1000') },
    report_accounts_summary: { sql: () => ["select public.report_accounts_summary(public.app_today() - 30, public.app_today()) -> 'project' ->> 'receivable' as v", []], value: true, expect: only(ACCOUNTS, 'ok:400000') },
    report_party_balances: { sql: () => ["select jsonb_array_length(public.report_party_balances(public.app_today() - 30, public.app_today(), null, true, 'balance', null, null, 50) -> 'rows') as v", []], value: true, expect: only(ACCOUNTS, 'ok:2') },
    report_party_statement: { sql: () => ["select jsonb_array_length(public.report_party_statement($1, null, public.app_today() - 30, public.app_today()) -> 'books') as v", [ledger.debtor]], value: true, expect: only(ACCOUNTS, 'ok:1') },
    report_cash_balances: { sql: () => ["select public.report_cash_balances(public.app_today() - 30, public.app_today()) -> 'total' ->> 'closing' as v", []], value: true, expect: only(ACCOUNTS, 'ok:349000') },
    report_cash_statement: { sql: () => ["select jsonb_array_length(public.report_cash_statement($1, public.app_today() - 30, public.app_today()) -> 'lines') as v", [ledger.box]], value: true, expect: only(ACCOUNTS, 'ok:2') },
    home_summary: { sql: () => ["select public.home_summary() -> 'accounts' ->> 'receivable' as v", []], value: true, expect: only(ACCOUNTS, 'ok:400000', 'ok:null') },
    find_party_twins: { sql: () => ["select jsonb_array_length(public.find_party_twins('ابو علي', null)) as v", []], value: true, expect: only([...ACCOUNTS, 'storekeeper'], 'ok:1') },
    // المرحلة 1 (WP4، §2.12): الافتتاح ومعاينته للمدير (opening.post)، والتحويل ومعاينته والطيّ وحذف السطر للأمين والمدير (transfer.post،
    // والمحاسب ممنوع)، والإلغاء للمدير (void)، وقراءات الكميات لمن المخزن بنطاقه (والباقي out_of_scope)، والقيم لأدوار الحسابات.
    post_opening_stock: { sql: () => ['select public.post_opening_stock($1, $2, gen_random_uuid())', [stock.draftOpening, stock.openingVersion]], expect: only(['owner', 'manager']) },
    void_opening_stock: { sql: () => ["select public.void_opening_stock($1, 'افتتاح خاطئ', gen_random_uuid())", [stock.posted]], expect: only(['owner', 'manager']) },
    preview_opening_stock: { sql: () => ["select (public.preview_opening_stock($1) -> 'money' ->> 'total')::numeric = 7500 as v", [stock.draftOpening]], value: true, expect: only(['owner', 'manager'], 'ok:true') },
    post_transfer: { sql: () => ['select public.post_transfer($1, $2, public.preview_transfer($1) ->> \'plan\', gen_random_uuid())', [stock.draft, stock.draftVersion]], expect: only(TRANSFER) },
    void_transfer: { sql: () => ["select public.void_transfer($1, 'تحويل خاطئ', gen_random_uuid())", [stock.moved]], expect: only(['owner', 'manager']) },
    preview_transfer: { sql: () => ["select public.preview_transfer($1) ->> 'ready' as v", [stock.draft]], value: true, expect: only(TRANSFER, 'ok:true') },
    discard_draft: { sql: () => ["select public.discard_draft('transfer', $1, $2) ->> 'status' as v", [stock.draft, stock.draftVersion]], value: true, expect: only(TRANSFER, 'ok:void') },
    delete_draft_line: { sql: () => ["select public.delete_draft_line('transfer', $1, $2) ->> 'deleted' as v", [stock.draftLine, stock.draftVersion]], value: true, expect: only(TRANSFER, 'ok:true') },
    // WP7 زاد مادّتين بالمخزن العامّ (6,750 بعد مرتجع لتر، و6,080 بعد صرف لترين وتصحيح بحصّة 80)، وجهة برصيد، وثلاث مصاريف.
    // 0014: القائمة تشمل كلّ مادّة فعّالة يستلم المخزن نوعها ولو برصيد صفر (كانت 5: من لها رصيد أو حدّ أدنى)،
    // فالمادّة التي تُضاف اليوم تظهر بقسمها اليوم. و0020 زاد مادّتي وقود («كاز التسعير» المشترى بلا سعر و«زيت المصفوفة» المحوَّل إليه) بقيمة صفر.
    stock_on_hand: { sql: () => ["select jsonb_array_length(public.stock_on_hand($1, null, 50) -> 'rows') as v", [generalStore]], value: true, expect: only(STOCK, 'ok:10', 'out_of_scope') },
    item_lots_qty: { sql: () => ["select jsonb_array_length(public.item_lots_qty($1, $2, null, 50) -> 'rows') as v", [stock.kerosene, generalStore]], value: true, expect: only(STOCK, 'ok:1', 'out_of_scope') },
    item_moves_qty: { sql: () => ["select jsonb_array_length(public.item_moves_qty($1, $2, null, 50) -> 'rows') as v", [stock.kerosene, generalStore]], value: true, expect: only(STOCK, 'ok:2', 'out_of_scope') },
    stock_values: { sql: () => ["select (select sum((r ->> 'available')::numeric) from jsonb_array_elements(public.stock_values($1, null, 50) -> 'rows') as r) = 487330 as v", [generalStore]], value: true, expect: only(ACCOUNTS, 'ok:true') },
    stock_value_totals: { sql: () => ["select (public.stock_value_totals($1) -> 'money' ->> 'total')::numeric = 487330 as v", [generalStore]], value: true, expect: only(ACCOUNTS, 'ok:true') },
    item_lots_value: { sql: () => ["select (public.item_lots_value($1, $2, null, 50) -> 'rows' -> 0 ->> 'value_left')::numeric = 300000 as v", [stock.kerosene, generalStore]], value: true, expect: only(ACCOUNTS, 'ok:true') },
    // علامة «مؤرشف وعليه رصيد» لقائمة المخازن (§2.6): بلا قيم، لكل دور بنطاقه (ماكو مخزن مؤرشف هنا؛ الضابط الإيجابي بـstock.test).
    archived_stores_with_stock: { sql: () => ['select jsonb_array_length(public.archived_stores_with_stock()) as v', []], value: true, expect: all('ok:0') },
    // المرحلة 1 (WP5، §2.12): المصروف للمحاسب والمدير (expense.post)، والصرف ومعاينته وتسليم الجرد للأمين والمدير (stock_use.post
    // وcount.enter، والمحاسب ممنوع)، ومراجعة الجرد وترحيله للمدير (count.approve)، وكل إلغاء للمدير (void)، والتقرير لأدوار الكلفة.
    record_expense: { sql: () => ["select public.record_expense(gen_random_uuid(), $1, $2, 1000, public.app_today(), 'cash', $3, null, null, null, null, null, null, null, gen_random_uuid())", [wp5.category, general, ledger.bank]], expect: only(ACCOUNTS) },
    void_expense: { sql: () => ["select public.void_expense($1, 'مصروف مكرّر', gen_random_uuid())", [wp5.expense]], expect: only(['owner', 'manager']) },
    post_stock_use: { sql: () => ["select public.post_stock_use($1, $2, public.preview_stock_use($1) ->> 'plan', gen_random_uuid())", [wp5.useDraft, wp5.useVersion]], expect: only(TRANSFER) },
    // صرف الزيت (wp5.usePosted) قبل جرد معتمد، فإلغاؤه count_superseded (0011)؛ الصفّ على صرف «زيت عيّنة» بلا جرد.
    void_stock_use: { sql: () => ["select public.void_stock_use($1, 'صرف خاطئ', gen_random_uuid())", [v11.use]], expect: only(['owner', 'manager']) },
    preview_stock_use: { sql: () => ["select public.preview_stock_use($1) ->> 'ready' as v", [wp5.useDraft]], value: true, expect: only(TRANSFER, 'ok:true') },
    submit_count: { sql: () => ['select public.submit_count($1, $2, gen_random_uuid())', [wp5.countDraft, wp5.countDraftVersion]], expect: only(TRANSFER) },
    refresh_count: { sql: () => ['select public.refresh_count($1, $2, gen_random_uuid())', [wp5.countSubmitted, wp5.countSubmittedVersion]], expect: only(COUNT_APPROVE) },
    return_count: { sql: () => ["select public.return_count($1, $2, 'أعد العدّ', gen_random_uuid())", [wp5.countSubmitted, wp5.countSubmittedVersion]], expect: only(COUNT_APPROVE) },
    post_count: { sql: () => ["select public.post_count($1, $2, public.preview_count($1) ->> 'plan', gen_random_uuid())", [wp5.countSubmitted, wp5.countSubmittedVersion]], expect: only(COUNT_APPROVE) },
    void_count: { sql: () => ["select public.void_count($1, 'جرد خاطئ', gen_random_uuid())", [wp5.countApproved]], expect: only(['owner', 'manager']) },
    preview_count: { sql: () => ["select public.preview_count($1) ->> 'ready' as v", [wp5.countSubmitted]], value: true, expect: only(COUNT_APPROVE, 'ok:true') },
    report_expenses: { sql: () => ["select public.report_expenses(public.app_today() - 30, public.app_today(), null, null, 50) -> 'totals' ->> 'count' as v", []], value: true, expect: only(ACCOUNTS, 'ok:6') },
    // المرحلة 1 (WP6، §2.12): مسوّدة الاستلام للأمين والمدير (receipt.draft)، ومبالغه وترحيله وتحميلاته لأدوار الكلفة (receipt.amounts)،
    // والمعاينة للاثنين (الكميات للأمين)، والإلغاء للمدير (void).
    post_receipt: { sql: () => ['select public.post_receipt($1, $2, gen_random_uuid())', [wp6.draft, wp6.version]], expect: only(ACCOUNTS) },
    void_receipt: { sql: () => ["select public.void_receipt($1, 'استلام خاطئ', gen_random_uuid())", [wp6.posted]], expect: only(['owner', 'manager']) },
    preview_receipt: { sql: () => ["select jsonb_array_length(public.preview_receipt($1) -> 'lines') as v", [wp6.draft]], value: true, expect: only([...ACCOUNTS, 'storekeeper'], 'ok:1') },
    delete_receipt_charge: { sql: () => ["select public.delete_receipt_charge($1, $2) ->> 'deleted' as v", [wp6.charge, wp6.version]], value: true, expect: only(ACCOUNTS, 'ok:true') },
    set_charge_lines: { sql: () => ["select public.set_charge_lines($1, array[$2]::uuid[], $3) ->> 'all_lines' as v", [wp6.charge, wp6.line, wp6.version]], value: true, expect: only(ACCOUNTS, 'ok:false') },
    // المرحلة 1 (WP7، §2.12): مسوّدة المرتجع للأمين والمدير (receipt.draft)، ومقبوله وترحيله لأدوار الكلفة (receipt.amounts)، وإلغاؤه للمدير
    // (void)؛ وتصحيح السعر ومعاينته للمدير والمالك (receipt.revalue)، وإلغاؤه للمدير (void).
    post_supplier_return: { sql: () => ["select public.post_supplier_return($1, $2, public.preview_supplier_return($1) ->> 'plan', gen_random_uuid())", [wp7.draft, wp7.version]], expect: only(ACCOUNTS) },
    void_supplier_return: { sql: () => ["select public.void_supplier_return($1, 'مرتجع خاطئ', gen_random_uuid())", [wp7.posted]], expect: only(['owner', 'manager']) },
    preview_supplier_return: { sql: () => ["select jsonb_array_length(public.preview_supplier_return($1) -> 'lines') as v", [wp7.draft]], value: true, expect: only([...ACCOUNTS, 'storekeeper'], 'ok:1') },
    supplier_return_options: { sql: () => ["select jsonb_array_length(public.supplier_return_options($1) -> 'lines') as v", [wp7.receipt]], value: true, expect: only([...ACCOUNTS, 'storekeeper'], 'ok:2') },
    post_receipt_revalue: { sql: () => ["select public.post_receipt_revalue($1, 7700, $2, 'فاتورة', gen_random_uuid())", [wp7.revalueLine, wp7.plan7700]], expect: only(['owner', 'manager']) },
    void_receipt_revalue: { sql: () => ["select public.void_receipt_revalue($1, 'تصحيح خاطئ', gen_random_uuid())", [wp7.revaluation]], expect: only(['owner', 'manager']) },
    preview_receipt_revalue: { sql: () => ["select public.preview_receipt_revalue($1, 7700) ->> 'ready' as v", [wp7.revalueLine]], value: true, expect: only(['owner', 'manager'], 'ok:true') },
    // 0011: النسخة للتصحيح بفعل إنشاء ورقة النوع ونطاق مخزنها: التحويل لمن يكتب ورقة التحويل (transfer.post، والأمين بنطاق العامّ
    // المرسِل)، والمحاسب والمشاهد ممنوعان؛ والافتتاح بصفّه تحت (opening.post).
    copy_doc_to_draft: { sql: () => ["select public.copy_doc_to_draft('transfer', $1, gen_random_uuid(), gen_random_uuid()) ->> 'status' as v", [v11.transfer]], value: true, expect: only(TRANSFER, 'ok:draft') },
    // 0012: فتح الفوج للمدير والمالك (flock.manage)، والجولة والوزن لعامل القاعة بنطاقه (flock_day.save، نطاقه وحدة اللحم)، والقارئان
    // لكل دور بنطاقه: من بلا نطاق (غير المالك والمدير والمحاسب) ما يشوف الحقل، والفوج خارج نطاقه out_of_scope.
    open_flock: { sql: () => ["select public.open_flock($1, public.app_today(), 500, 0, null, gen_random_uuid()) ->> 'version' as v", [p2.empty]], value: true, expect: only(FLOCK_MANAGE, 'ok:1') },
    save_flock_day: { sql: () => ["select public.save_flock_day($1, public.app_today(), 2, 1, 40.5, null, null, null, null, null, null, null, null, gen_random_uuid(), false) ->> 'status' as v", [p2.flock]], value: true, expect: only(FLOCK_DAY, 'ok:saved') },
    record_flock_weight: { sql: () => ["select public.record_flock_weight($1, public.app_today(), 50, 650.5, gen_random_uuid()) ->> 'status' as v", [p2.flock]], value: true, expect: only(FLOCK_DAY, 'ok:saved') },
    flocks_overview: { sql: () => ["select public.flocks_overview() -> 'sites' @> jsonb_build_array(jsonb_build_object('id', $1::uuid)) as v", [farm.site]], value: true, expect: only(FLOCK_SCOPE, 'ok:true', 'ok:false') },
    flock_detail: { sql: () => ["select public.flock_detail($1) -> 'flock' ->> 'live' as v", [p2.flock]], value: true, expect: only(FLOCK_SCOPE, 'ok:1000', 'out_of_scope') },
    // 0013 (تجربة الاستخدام، الجزء الثاني): القارئان لكل دور بنطاقه (مثل قراءات الكميات): سجلّ شراء كاز المرتجع بالمخزن العامّ
    // (دفعة جذر واحدة من استلام WP7 المرحّل)، والمخزن خارج النطاق out_of_scope؛ وبطاقات المخازن تنجح للكل،
    // ومن بلا نطاق (غير المالك والمدير والمحاسب) لا يرى بطاقة المخزن العامّ.
    item_purchases: { sql: () => ["select jsonb_array_length(public.item_purchases($1, $2, null, 50) -> 'rows') as v", [wp7.fuelA, generalStore]], value: true, expect: only(STOCK, 'ok:1', 'out_of_scope') },
    // 0015 (معمل العلف): التفعيل للمالك والمدير (recipe.activate)، والتسويد لمشغّل المعمل بنطاقه (production.draft)، وختم
    // الكلف للمحاسب والمدير (costs.load)، والترحيل لهم ولمشغّل المعمل بعد الختم (هنا بلا ختم: forbidden له)، والإلغاء للمالك
    // والمدير (void)؛ والقرّاء: الخلطة للمنشأة كلّها، والدفعة بنطاق مخزن مدخلاتها.
    activate_recipe_version: { sql: () => ["select public.activate_recipe_version($1, $2) ->> 'status' as v", [p3.draftVersion, p3.draftVersionNo]], value: true, expect: only(RECIPE, 'ok:active') },
    create_production: { sql: () => ["select public.create_production(gen_random_uuid(), $1, 50, $2, $3, public.app_today()) ->> 'status' as v", [p3.version, p3.raw, p3.feedStore]], value: true, expect: only(MILL_DRAFT, 'ok:draft') },
    confirm_production_costs: { sql: () => ["select public.confirm_production_costs($1, $2) ->> 'costs_confirmed' as v", [p3.draftBatch, p3.draftBatchVersion]], value: true, expect: only(ACCOUNTS, 'ok:true') },
    post_production: {
      sql: () => ["select public.post_production($1, (select version from public.production_batches where id = $1), public.preview_production($1) ->> 'plan_token', gen_random_uuid()) ->> 'status' as v", [p3.draftBatch]],
      value: true,
      expect: { ...only(MILL_POST, 'ok:posted', 'out_of_scope'), mill_operator: 'forbidden' },
    },
    void_production: { sql: () => ["select public.void_production($1, 'خطأ في الوزن', gen_random_uuid()) ->> 'status' as v", [p3.postedBatch]], value: true, expect: only(RECIPE, 'ok:void') },
    preview_production: { sql: () => ["select public.preview_production($1) ->> 'status' as v", [p3.postedBatch]], value: true, expect: only(MILL_SCOPE, 'ok:posted', 'out_of_scope') },
    production_detail: { sql: () => ["select public.production_detail($1) ->> 'status' as v", [p3.postedBatch]], value: true, expect: only(MILL_SCOPE, 'ok:posted', 'out_of_scope') },
    productions_overview: { sql: () => ["select public.productions_overview(null, 30) -> 'rows' @> jsonb_build_array(jsonb_build_object('id', $1::uuid)) as v", [p3.postedBatch]], value: true, expect: only(MILL_SCOPE, 'ok:true', 'ok:false') },
    recipes_overview: { sql: () => ["select public.recipes_overview() -> 'recipes' @> jsonb_build_array(jsonb_build_object('id', $1::uuid)) as v", [p3.recipe]], value: true, expect: all('ok:true') },
    recipe_detail: { sql: () => ['select public.recipe_detail($1, null) ->> $2 as v', [p3.recipe, 'name']], value: true, expect: all('ok:خلطة المصفوفة') },
    stores_overview: { sql: () => ["select public.stores_overview() -> 'rows' @> jsonb_build_array(jsonb_build_object('id', $1::uuid)) as v", [generalStore]], value: true, expect: only(STOCK, 'ok:true', 'ok:false') },
    // 0014 (سعر البيع): الكتابة لمن يدير المخازن ويرى الكلفة (المالك والمدير)؛ والنداء الثاني بنفس السعر يرجّعه نفسه
    // (المحفوظ = المطلوب ← انكتب، فلا price_changed لأنّ المصفوفة لا تراجع بين الأدوار).
    set_item_sell_price: { sql: () => ["select public.set_item_sell_price($1, 1500, null) ->> 'sell_price' as v", [wp7.fuelA]], value: true, expect: only(['owner', 'manager'], 'ok:1500') },
    // 0016: سعر الكلفة بصلاحية سعر البيع نفسها (stores.manage ويرى الكلفة)؛ وبانية الخلطة بفعل التفعيل (recipe.activate)؛ وإضافة مادّة
    // لدفعة مسوّدة بفعل التسويد ونطاق مخزن مدخلاتها (production.draft)، فالسطر الثاني بعد سطر الذرة.
    set_item_cost_price: { sql: () => ["select public.set_item_cost_price($1, 1200, null) ->> 'cost_price' as v", [wp7.fuelA]], value: true, expect: only(['owner', 'manager'], 'ok:1200') },
    create_recipe: {
      sql: () => [
        "select public.create_recipe(gen_random_uuid(), gen_random_uuid(), 'خلطة البانية', $1, 100, jsonb_build_array(jsonb_build_object('item_id', $2::uuid, 'qty', 100, 'unit', 'kg')), jsonb_build_array(jsonb_build_object('category_id', $3::uuid, 'amount_per_ton', 1000)), true) ->> 'status' as v",
        [p3.output, p3.bran, p3.labor],
      ],
      value: true,
      expect: only(RECIPE, 'ok:active'),
    },
    add_production_input: { sql: () => ["select public.add_production_input($1, gen_random_uuid(), $2, 5, null, null) ->> 'line_no' as v", [p3.draftBatch, p3.bran]], value: true, expect: only(MILL_DRAFT, 'ok:2') },
    // مراجعة 0016 (#19): «نسخة جديدة» بفعل التفعيل (recipe.activate) للمالك والمدير؛ للخلطة مسوّدة قائمة (النسخة الثانية)، فترجع هي
    // بمعرّفها بلا نسخ (existing) والمعرّف الجديد لا يُستعمل.
    new_recipe_version: { sql: () => ["select public.new_recipe_version($1, gen_random_uuid()) ->> 'version_id' = $2::text as v", [p3.recipe, p3.draftVersion]], value: true, expect: only(RECIPE, 'ok:true') },
    // 0017 (المخزن ببساطة، قرار المالك 2026-11-06): الشراء بنداء واحد لكلّ من يعمل في المخزن (purchase.record: المالك والمدير والمحاسب
    // والأمين)، والمخزن يُختار من نوع المادّة (الكاز للمخزن العامّ). الأمين هنا محصور بالمخزن العامّ دون وحدته، فدين المورّد في دفتر
    // الوحدة العامّة خارج نطاقه: out_of_scope (قاعدة book_for_post، E49؛ قرار مفتوح للمالك). والقارئان لكلّ دور: ملفّ كاز المرتجع بعدد
    // شراءاته بنطاق القارئ (استلام WP7 المرحَّل بالمخزن العامّ)، وبطاقات المواد بعلم «يسجّل الشراء».
    record_purchase: {
      sql: () => ["select public.record_purchase(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), $1, $2, public.app_today(), 10, 750, null, 'credit', null, null) ->> 'payment' as v", [wp7.fuelA, ledger.fresh]],
      value: true,
      expect: { ...only(['owner', 'manager', 'accountant'], 'ok:credit'), storekeeper: 'out_of_scope' },
    },
    item_file: { sql: () => ["select public.item_file($1) ->> 'purchases_count' as v", [wp7.fuelA]], value: true, expect: only(STOCK, 'ok:1', 'ok:0') },
    items_overview: { sql: () => ["select public.items_overview() ->> 'can_record' as v", []], value: true, expect: only(STOCK, 'ok:true', 'ok:false') },
    // 0019 (صرف العلف للقاعات، قرار المالك 2026-11-07): الصرف بفعل issue.post (المالك والمدير والأمين) ونطاق حقل الفوج، والأمين هنا محصور
    // بالمخزن العامّ فقاعة اللحم خارج نطاقه (out_of_scope)؛ والإلغاء بفعل void (المالك والمدير)؛ والقارئان لمن بنطاقه حقل الفوج (read)، و«يصرف»
    // علم الفعل، والمصروف من العلف بالكيلو للجميع.
    record_flock_issue: {
      sql: () => ["select public.record_flock_issue(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), $1, $2, 1, public.app_today(), null) ->> 'status' as v", [p2.flock, p19.feedItem]],
      value: true,
      expect: { ...only(['owner', 'manager'], 'ok:posted'), storekeeper: 'out_of_scope' },
    },
    void_flock_issue: { sql: () => ["select public.void_flock_issue($1, 'كمية خاطئة', gen_random_uuid()) ->> 'status' as v", [p19.issue]], value: true, expect: only(['owner', 'manager'], 'ok:void') },
    flock_issue_options: {
      sql: () => ["select public.flock_issue_options($1) ->> 'can_issue' as v", [p2.flock]],
      value: true,
      expect: { ...only(FLOCK_SCOPE, 'ok:false', 'out_of_scope'), owner: 'ok:true', manager: 'ok:true' },
    },
    flock_feed: { sql: () => ["select public.flock_feed($1) ->> 'issued_feed_kg' as v", [p2.flock]], value: true, expect: only(FLOCK_SCOPE, 'ok:10.000', 'out_of_scope') },
    // 0020 (قرار المالك 2026-11-08): الحذف لمن يدير المخازن (المالك والمدير)؛ و«أكمل السعر» بفعل الشراء (purchase.record)، والأمين هنا محصور
    // بالمخزن العامّ دون وحدته فقيد المورّد في دفتر الوحدة خارج نطاقه (out_of_scope، مثل record_purchase)؛ وتحويل المادّة بفعل الصرف
    // (stock_use.post: المالك والمدير والأمين بنطاق المخزن)؛ وإلغاؤه بفعل void؛ والنقل بخطوة واحدة بفعل النقل (transfer.post) إلى مخزن الحقل.
    delete_item: { sql: () => ["select public.delete_item($1, (select version from public.items where id = $1)) ->> 'deleted' as v", [p20.fresh]], value: true, expect: only(['owner', 'manager'], 'ok:true') },
    price_purchase: {
      sql: () => ["select public.price_purchase(gen_random_uuid(), $1, 800, null) ->> 'priced' as v", [p20.line]],
      value: true,
      expect: { ...only(['owner', 'manager', 'accountant'], 'ok:true'), storekeeper: 'out_of_scope' },
    },
    record_conversion: {
      sql: () => ["select public.record_conversion(gen_random_uuid(), gen_random_uuid(), $1, 1, $2, 1, public.app_today(), null, null) ->> 'status' as v", [p20.fuel, p20.oil]],
      value: true,
      expect: only(TRANSFER, 'ok:posted'),
    },
    void_conversion: { sql: () => ["select public.void_conversion($1, 'كمية خاطئة', gen_random_uuid()) ->> 'status' as v", [p20.conversion]], value: true, expect: only(['owner', 'manager'], 'ok:void') },
    record_transfer: {
      sql: () => ["select public.record_transfer(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), $1, 1, null, $2, public.app_today()) ->> 'status' as v", [p20.fuel, farm.store]],
      value: true,
      expect: only(TRANSFER, 'ok:posted'),
    },
    // 0021 (قرار المالك 2026-11-08): البيع بفعل sale.record (أدوار الشراء نفسها)، والأمين هنا محصور بالمخزن العامّ دون وحدته فقيد الجهة في دفتر
    // الوحدة خارج نطاقه (out_of_scope، مثل record_purchase)؛ والإلغاء بفعل void؛ والقرّاء لأدوار المبيعات بنطاق المخزن (المشاهد بلا نطاق يرى صفراً،
    // وتفصيل فاتورة خارج نطاقه out_of_scope)، وعامل القاعة ومشغّلا المفقس والمعمل forbidden.
    record_sale: {
      sql: () => ["select public.record_sale(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), $1, $2, 1, 1000, public.app_today(), 'credit', null, null) ->> 'status' as v", [ledger.fresh, p20.fuel]],
      value: true,
      expect: { ...only(['owner', 'manager', 'accountant'], 'ok:posted'), storekeeper: 'out_of_scope' },
    },
    void_sale: { sql: () => ["select public.void_sale($1, 'بيع خاطئ', gen_random_uuid()) ->> 'status' as v", [p21.sale]], value: true, expect: only(['owner', 'manager'], 'ok:void') },
    sales_overview: {
      sql: () => ["select public.sales_overview(public.app_today() - 1, public.app_today()) -> 'totals' ->> 'count' as v", []],
      value: true,
      expect: { ...only(['owner', 'manager', 'storekeeper', 'accountant'], 'ok:1'), viewer: 'ok:0' },
    },
    sale_detail: {
      sql: () => ["select public.sale_detail($1) ->> 'status' as v", [p21.sale]],
      value: true,
      expect: { ...only(['owner', 'manager', 'storekeeper', 'accountant'], 'ok:posted'), viewer: 'out_of_scope' },
    },
    sales_report: {
      sql: () => ["select public.sales_report(public.app_today() - 1, public.app_today(), 'party') -> 'totals' ->> 'count' as v", []],
      value: true,
      expect: { ...only(['owner', 'manager', 'storekeeper', 'accountant'], 'ok:1'), viewer: 'ok:0' },
    },
    // 0022 (قرار المالك 2026-11-09): الجدول لكلّ دور (read)، و«يكتب ملاحظة اليوم» علم الفعل stock_note.write (الأمين ومشغّلا المعمل والمفقس والمدير
    // والمالك)؛ والملاحظة بالفعل نفسه؛ وملء التصنيف لمن يدير المخازن (المالك والمدير).
    day_balance: {
      sql: () => ["select public.day_balance(null, public.app_today(), null) ->> 'can_note' as v", []],
      value: true,
      expect: { ...only(['owner', 'manager', 'storekeeper', 'mill_operator', 'hatchery_operator'], 'ok:true', 'ok:false') },
    },
    set_day_note: {
      sql: () => ["select public.set_day_note($1, public.app_today(), 'ملاحظة المصفوفة', null) -> 'note' ->> 'text' as v", [p20.fuel]],
      value: true,
      // مشغّل المفقس يملك الفعل، لكنّ الكاز لا يُخزَّن في مخازن المفقس التي بنطاقه (out_of_scope).
      expect: { ...only(['owner', 'manager', 'storekeeper', 'mill_operator'], 'ok:ملاحظة المصفوفة'), hatchery_operator: 'out_of_scope' },
    },
    set_category_items: {
      sql: () => ["select public.set_category_items($1, array[$2]::uuid[], '{}'::uuid[]) ->> 'count' as v", [p22.category, p20.fuel]],
      value: true,
      expect: only(['owner', 'manager'], 'ok:1'),
    },
    // 0023 (ترتيب معمل العلف، كلمة المالك 2026-11-10): ترتيب العلائق وموادّ المسوّدة لمن يفعّل الخلطة (المالك والمدير)، كلّ واحد بما يراه الآن؛
    // والإنتاج بنداء واحد بفعل التسويد: المالك والمدير يرحّلان، ومشغّل المعمل مسوّدة تنتظر ختم الكلف؛ والتقرير لكلّ دور بمنشأة بنطاق الدفعة.
    set_recipe_order: {
      sql: () => [
        "select (public.set_recipe_order(x.ids, x.ids) ->> 'count')::int = cardinality(x.ids) as v from (select array(select (e ->> 'id')::uuid from jsonb_array_elements(public.recipes_overview() -> 'recipes') as e where not (e ->> 'archived')::boolean) as ids) as x",
        [],
      ],
      value: true,
      expect: only(RECIPE, 'ok:true'),
    },
    set_recipe_line_order: {
      sql: () => ["select public.set_recipe_line_order($1, array[$2]::uuid[], array[$2]::uuid[]) ->> 'count' as v", [p3.draftVersion, p3.draftLine]],
      value: true,
      expect: only(RECIPE, 'ok:1'),
    },
    record_production: {
      sql: () => [
        "select public.record_production(gen_random_uuid(), $1, 50, $2, $3, public.app_today(), '[]'::jsonb, '[]'::jsonb, null, null, null, null, gen_random_uuid()) ->> 'status' as v",
        [p3.version, p3.raw, p3.feedStore],
      ],
      value: true,
      expect: { ...only(RECIPE, 'ok:posted'), mill_operator: 'ok:draft' },
    },
    mill_report: {
      sql: () => ["select public.mill_report($1, public.app_today(), public.app_today()) -> 'totals' ->> 'batches' as v", [p3.recipe]],
      value: true,
      expect: only(MILL_SCOPE, 'ok:1', 'ok:0'),
    },
  };

  const allowlisted = ALLOWLIST.authenticated.map((signature) => signature.slice('public.'.length, signature.indexOf('('))).sort();
  t.same(Object.keys(ROWS).sort(), allowlisted, `المصفوفة تغطّي قائمة السماح بالضبط (${allowlisted.length} دالّة)`);

  let cells = 0;
  for (const [fn, row] of Object.entries(ROWS)) {
    const got = {};
    for (const role of ROLES) {
      const [sql, params] = row.sql(role);
      cells += 1;
      try {
        const result = await db.asUser(USERS[role], (q) => q(sql, params));
        got[role] = row.value ? `ok:${result.rows[0].v}` : 'ok';
      } catch (error) {
        got[role] = error.message;
      }
    }
    t.same(got, row.expect, `${fn}: كل دور بنتيجته`);
  }
  t.eq(cells, allowlisted.length * ROLES.length, `خانات المصفوفة: ${allowlisted.length} دالّة × ${ROLES.length} أدوار`);
  // §2.12: delete_draft_line وdiscard_draft بفعل مسوّدة كل نوع، فالنوع الثاني (الافتتاح: opening.post للمالك والمدير) صفوفه لحالها،
  // ومسوّدته بالمخزن العامّ اللي الأمين بنطاقه (فلو فرع الافتتاح صار transfer.post ينجح الأمين وينمسك)، والنسخة القديمة stale_draft.
  const KIND_ROWS = {
    "discard_draft('opening')": { sql: ["select public.discard_draft('opening', $1, $2) ->> 'status' as v", [stock.draftOpening, stock.openingVersion]], value: true, expect: only(['owner', 'manager'], 'ok:void') },
    "delete_draft_line('opening')": { sql: ["select public.delete_draft_line('opening', $1, $2) ->> 'deleted' as v", [stock.openingLine, stock.openingVersion]], value: true, expect: only(['owner', 'manager'], 'ok:true') },
    "discard_draft('opening') بنسخة قديمة": { sql: ["select public.discard_draft('opening', $1, $2) ->> 'status' as v", [stock.draftOpening, stock.openingVersion - 1]], value: true, expect: only(['owner', 'manager'], 'stale_draft') },
    "delete_draft_line('opening') بنسخة قديمة": { sql: ["select public.delete_draft_line('opening', $1, $2) ->> 'deleted' as v", [stock.openingLine, stock.openingVersion - 1]], value: true, expect: only(['owner', 'manager'], 'stale_draft') },
    // WP5: الصرف بـstock_use.post، ومسوّدة الجرد بـcount.enter، والجرد المسلَّم يطويه count.approve بس («أغلِق دون ترحيل»، E53).
    "discard_draft('stock_use')": { sql: ["select public.discard_draft('stock_use', $1, $2) ->> 'status' as v", [wp5.useDraft, wp5.useVersion]], value: true, expect: only(TRANSFER, 'ok:void') },
    "delete_draft_line('stock_use')": { sql: ["select public.delete_draft_line('stock_use', $1, $2) ->> 'deleted' as v", [wp5.useDraftLine, wp5.useVersion]], value: true, expect: only(TRANSFER, 'ok:true') },
    "discard_draft('count') مسوّدة": { sql: ["select public.discard_draft('count', $1, $2) ->> 'status' as v", [wp5.countDraft, wp5.countDraftVersion]], value: true, expect: only(TRANSFER, 'ok:void') },
    "discard_draft('count') مسلَّم": { sql: ["select public.discard_draft('count', $1, $2) ->> 'status' as v", [wp5.countSubmitted, wp5.countSubmittedVersion]], value: true, expect: only(COUNT_APPROVE, 'ok:void') },
    "delete_draft_line('count')": { sql: ["select public.delete_draft_line('count', $1, $2) ->> 'deleted' as v", [wp5.countDraftLine, wp5.countDraftVersion]], value: true, expect: only(TRANSFER, 'ok:true') },
    // WP6: مسوّدة الاستلام بـreceipt.draft (المحاسب ممنوع)، وحذف السطر المسعَّر يحذف مبلغه ويّاه.
    "discard_draft('receipt')": { sql: ["select public.discard_draft('receipt', $1, $2) ->> 'status' as v", [wp6.bare, wp6.bareVersion]], value: true, expect: only(TRANSFER, 'ok:void') },
    "delete_draft_line('receipt')": { sql: ["select public.delete_draft_line('receipt', $1, $2) ->> 'deleted' as v", [wp6.line, wp6.version]], value: true, expect: only(TRANSFER, 'ok:true') },
    // WP7: مسوّدة المرتجع بـreceipt.draft (المحاسب ممنوع)، وحذف السطر يحذف مقبوله ويّاه.
    "discard_draft('supplier_return')": { sql: ["select public.discard_draft('supplier_return', $1, $2) ->> 'status' as v", [wp7.bare, wp7.bareVersion]], value: true, expect: only(TRANSFER, 'ok:void') },
    "delete_draft_line('supplier_return')": { sql: ["select public.delete_draft_line('supplier_return', $1, $2) ->> 'deleted' as v", [wp7.line, wp7.version]], value: true, expect: only(TRANSFER, 'ok:true') },
    // 0011: نسخة الافتتاح الملغى بـopening.post (المالك والمدير)، والمخزن العامّ بنطاق الأمين (فلو فرع الافتتاح صار transfer.post
    // ينجح الأمين وينمسك).
    "copy_doc_to_draft('opening')": { sql: ["select public.copy_doc_to_draft('opening', $1, gen_random_uuid(), gen_random_uuid()) ->> 'status' as v", [v11.opening]], value: true, expect: only(['owner', 'manager'], 'ok:draft') },
    // 0016: معدّل الخلطة بفعل التفعيل، وسطر الكلفة بفعل costs.load لأدوار الكلفة (مشغّل المعمل ممنوع)، وسطر المدخلات بفعل التسويد
    // (المحاسب ممنوع)؛ والنسخة بعد إضافة المعدّل وسطر الكلفة.
    "delete_draft_line('recipe_cost_rate')": { sql: ["select public.delete_draft_line('recipe_cost_rate', $1, $2) ->> 'deleted' as v", [p3.draftRate, p3.draftVersionNo]], value: true, expect: only(RECIPE, 'ok:true') },
    "delete_draft_line('production_cost')": { sql: ["select public.delete_draft_line('production_cost', $1, $2) ->> 'deleted' as v", [p3.draftCost, p3.draftBatchVersion]], value: true, expect: only(ACCOUNTS, 'ok:true') },
    "delete_draft_line('production_input')": { sql: ["select public.delete_draft_line('production_input', $1, $2) ->> 'deleted' as v", [p3.draftInput, p3.draftBatchVersion]], value: true, expect: only(MILL_DRAFT, 'ok:true') },
  };
  for (const [label, row] of Object.entries(KIND_ROWS)) {
    const got = {};
    for (const role of ROLES) {
      try {
        const result = await db.asUser(USERS[role], (q) => q(row.sql[0], row.sql[1]));
        got[role] = row.value ? `ok:${result.rows[0].v}` : 'ok';
      } catch (error) {
        got[role] = error.message;
      }
    }
    t.same(got, row.expect, `${label}: كل دور بنتيجته`);
  }
  // المدير ينجح بكل خانة تشغيلية والمحاسب يفشل بيها (FOUNDATION ٥٤٤، ٨٦٥): بالمرحلة 0 الخانة التشغيلية قفل الفترة.
  t.same([ROWS.set_period_lock.expect.manager, ROWS.set_period_lock.expect.accountant], ['ok', 'forbidden'], 'المدير يقفل الفترة والمحاسب لا');
  t.same([ROWS.set_division_go_live.expect.manager, ROWS.set_division_go_live.expect.accountant], ['ok', 'forbidden'], 'المدير يحدّد يوم التشغيل والمحاسب لا');
  t.same(
    ['record_opening_balance', 'record_party_adjustment', 'forgive_debt', 'void_party_payment', 'void_party_entry', 'record_cash_opening', 'void_cash_move'].map((fn) => [ROWS[fn].expect.manager, ROWS[fn].expect.accountant]),
    Array(7).fill(['ok', 'forbidden']),
    'المدير ينجح بالافتتاح والتسوية والإعفاء والإلغاء والمحاسب لا (FOUNDATION ٥٤٤، ٨٦٥)',
  );
  t.same(
    ['post_opening_stock', 'void_opening_stock', 'post_transfer', 'void_transfer', 'preview_transfer', 'discard_draft', 'delete_draft_line'].map((fn) => [ROWS[fn].expect.manager.split(':')[0], ROWS[fn].expect.accountant]),
    Array(7).fill(['ok', 'forbidden']),
    'المدير ينجح بخانات المخزون التشغيلية (الافتتاح والتحويل والإلغاء والمسوّدات) والمحاسب لا (FOUNDATION ٥٤٤، ٨٦٥)',
  );
  t.same(
    ['post_stock_use', 'void_stock_use', 'preview_stock_use', 'submit_count', 'refresh_count', 'return_count', 'post_count', 'void_count', 'preview_count', 'void_expense'].map((fn) => [ROWS[fn].expect.manager.split(':')[0], ROWS[fn].expect.accountant]),
    Array(10).fill(['ok', 'forbidden']),
    'المدير ينجح بالصرف والجرد ومراجعته وإلغائها وإلغاء المصروف والمحاسب لا (FOUNDATION ٥٤٤، ٨٦٥)',
  );
  t.same([ROWS.record_expense.expect.accountant, ROWS.report_expenses.expect.accountant], ['ok', 'ok:6'], 'المحاسب يسجّل المصروف ويقرأ تقريره (ثلاث من WP5 وثلاث من WP7)');
  t.same(
    [ROWS.post_receipt.expect.manager, ROWS.post_receipt.expect.accountant, ROWS.post_receipt.expect.storekeeper, ROWS.void_receipt.expect.manager, ROWS.void_receipt.expect.accountant],
    ['ok', 'ok', 'forbidden', 'ok', 'forbidden'],
    'الاستلام: المدير يرحّل ويلغي، والمحاسب يرحّل ولا يلغي، والأمين لا يرحّل (§2.12)',
  );
  t.same(
    [ROWS.post_supplier_return.expect.manager, ROWS.post_supplier_return.expect.accountant, ROWS.post_supplier_return.expect.storekeeper,
      ROWS.post_receipt_revalue.expect.manager, ROWS.post_receipt_revalue.expect.accountant, ROWS.void_supplier_return.expect.accountant],
    ['ok', 'ok', 'forbidden', 'ok', 'forbidden', 'forbidden'],
    'المرتجع والتصحيح: الأمين يكتب المسوّدة ولا يرحّل، والمحاسب يرحّل المرتجع ولا يصحّح السعر ولا يلغي، والمدير كلّها (§2.12)',
  );

  // ── الكتابة المباشرة بالبيانات الأساسية (Q1، §2.12): كل جدول × دور، إدخال وتعديل، والمسموح بضابط إيجابي بكل خانة ─────────
  // الإدخال الممنوع يرفضه RLS (42501)، والتعديل الممنوع صفر صفوف (USING يحجب الصفّ). stores.manage للمالك والمدير، وفئات
  // المصاريف (expense_categories.manage) للمحاسب هم.
  const STORES = ['owner', 'manager'];
  const ITEM_CREATE = ['owner', 'manager', 'storekeeper'];
  const EXPENSES = ['owner', 'manager', 'accountant'];
  const someId = async (table) => (await db.admin(`select id from public.${table} where org_id = $1 order by created_at, id limit 1`, [org])).rows[0].id;
  const pack = await someId('pack_types');
  const category = await db.asUser(USERS.owner, async (q) => (await q("insert into public.item_categories (name) values ('أعلاف') returning id")).rows[0].id, { commit: true });
  const unit = await db.asUser(USERS.owner, async (q) => (await q("insert into public.item_units (item_id, label, factor_to_base) values ($1, 'شوال', 70) returning id", [farm.item])).rows[0].id, { commit: true });
  const expense = await someId('expense_categories');
  const WRITES = {
    sites: {
      allowed: STORES,
      insert: ["insert into public.sites (division_id, name, kind) values ($1, 'حقل النور', 'farm')", [broiler]],
      update: ['update public.sites set name = name where id = $1', [farm.site]],
    },
    warehouses: {
      allowed: STORES,
      insert: ["insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن ثانٍ', 'farm')", [broiler, farm.site]],
      update: ['update public.warehouses set name = name where id = $1', [farm.store]],
    },
    pack_types: {
      allowed: STORES,
      insert: ["insert into public.pack_types (label, dimension, factor) values ('كارتون 12 طبقة', 'count', 360)", []],
      update: ['update public.pack_types set label = label where id = $1', [pack]],
    },
    item_categories: {
      allowed: STORES,
      insert: ["insert into public.item_categories (name) values ('إضافات')", []],
      update: ['update public.item_categories set name = name where id = $1', [category]],
    },
    // 0013 (قرار المالك 2026-11-02): الأمين يضيف مادة ووحدتها (item.create)، ولا يعدّل عليهما ولا يضيف مخزناً (stores.manage).
    items: {
      insertAllowed: ITEM_CREATE,
      allowed: STORES,
      insert: ["insert into public.items (name, kind, base_unit) values ('صويا 46%', 'raw', 'kg')", []],
      update: ['update public.items set name = name where id = $1', [farm.item]],
    },
    item_units: {
      insertAllowed: ITEM_CREATE,
      allowed: STORES,
      insert: ["insert into public.item_units (item_id, label, factor_to_base) values ($1, 'طن', 1000)", [farm.item]],
      update: ['update public.item_units set label = label where id = $1', [unit]],
    },
    expense_categories: {
      allowed: EXPENSES,
      insert: ["insert into public.expense_categories (name) values ('كهرباء')", []],
      update: ['update public.expense_categories set name = name where id = $1', [expense]],
    },
    // WP3 (Q1): الجهة يضيفها الأمين هم (مورّداً، party.create)، ويعدّلها المحاسب والمدير (parties.manage)؛ والصندوق للمحاسب والمدير.
    parties: {
      insertAllowed: [...EXPENSES, 'storekeeper'],
      updateAllowed: EXPENSES,
      insert: ["insert into public.parties (name, is_supplier) values ('مورّد جديد', true)", []],
      update: ['update public.parties set name = name where id = $1', [ledger.debtor]],
    },
    cash_accounts: {
      allowed: EXPENSES,
      insert: ["insert into public.cash_accounts (name, kind) values ('صندوق ثالث', 'wallet')", []],
      update: ['update public.cash_accounts set name = name where id = $1', [ledger.box]],
    },
    // WP4 (§2.5): مسوّدات الافتتاح (opening.post) والتحويل (transfer.post، المرسِل بنطاق الأمين). إدخال السطر الممنوع يرفضه حارس
    // السطر نفسه (forbidden، قبل RLS)، وتعديله الممنوع صفر صفوف (USING يحجب الصفّ قبل الحارس).
    opening_docs: {
      allowed: STORES,
      insert: ['insert into public.opening_docs (warehouse_id, on_date) values ($1, public.app_today() - 3)', [generalStore]],
      update: ['update public.opening_docs set note = note where id = $1', [stock.draftOpening]],
    },
    opening_lines: {
      allowed: STORES,
      insertDenied: 'forbidden',
      insert: ['insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, 1, 750)', [stock.draftOpening, stock.diesel]],
      update: ['update public.opening_lines set qty_base = qty_base where id = $1', [stock.openingLine]],
    },
    transfers: {
      allowed: TRANSFER,
      insert: ['insert into public.transfers (from_warehouse_id, to_warehouse_id, moved_on) values ($1, $2, public.app_today())', [generalStore, millRaw]],
      update: ['update public.transfers set note = note where id = $1', [stock.draft]],
    },
    transfer_lines: {
      allowed: TRANSFER,
      insertDenied: 'forbidden',
      insert: ['insert into public.transfer_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 1)', [stock.draft, stock.kerosene]],
      update: ['update public.transfer_lines set qty_in_unit = qty_in_unit where id = $1', [stock.draftLine]],
    },
    // WP5 (§2.5): مسوّدة الصرف (stock_use.post) والجرد (count.enter، والسطر الممنوع يرفضه حارسه بـforbidden)، وكلفة سطر الجرد المسلَّم
    // (count.approve، وحارسها يرفض الممنوع قبل RLS).
    stock_uses: {
      allowed: TRANSFER,
      insert: ['insert into public.stock_uses (warehouse_id, category_id, used_on) values ($1, $2, public.app_today())', [generalStore, wp5.category]],
      update: ['update public.stock_uses set note = note where id = $1', [wp5.useDraft]],
    },
    stock_use_lines: {
      allowed: TRANSFER,
      insertDenied: 'forbidden',
      insert: ['insert into public.stock_use_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 1)', [wp5.useDraft, wp5.oil]],
      update: ['update public.stock_use_lines set qty_in_unit = qty_in_unit where id = $1', [wp5.useDraftLine]],
    },
    stock_counts: {
      allowed: TRANSFER,
      insert: ['insert into public.stock_counts (warehouse_id, counted_on) values ($1, public.app_today())', [generalStore]],
      update: ['update public.stock_counts set note = note where id = $1', [wp5.countDraft]],
    },
    stock_count_lines: {
      allowed: TRANSFER,
      insertDenied: 'forbidden',
      insert: ['insert into public.stock_count_lines (doc_id, item_id, counted_qty) values ($1, $2, 1)', [wp5.countDraft, stock.kerosene]],
      update: ['update public.stock_count_lines set counted_qty = counted_qty where id = $1', [wp5.countDraftLine]],
    },
    stock_count_line_costs: {
      allowed: COUNT_APPROVE,
      insertDenied: 'forbidden',
      insert: ['insert into public.stock_count_line_costs (line_id, gain_unit_cost) values ($1, 100)', [wp5.countSubmittedLine]],
      update: ['update public.stock_count_line_costs set gain_unit_cost = gain_unit_cost where id = $1', [wp5.cost]],
    },
  };
  // WP6 (§2.5): الرأس والسطر بـreceipt.draft (السطر الممنوع يرفضه حارسه بـforbidden)، والمبالغ والتحميلات بـreceipt.amounts (حارسها
  // يرفض الممنوع قبل RLS).
  Object.assign(WRITES, {
    receipts: {
      allowed: TRANSFER,
      insert: ['insert into public.receipts (party_id, warehouse_id, received_on) values ($1, $2, public.app_today())', [ledger.fresh, generalStore]],
      update: ['update public.receipts set note = note where id = $1', [wp6.draft]],
    },
    receipt_lines: {
      allowed: TRANSFER,
      insertDenied: 'forbidden',
      insert: ['insert into public.receipt_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 1)', [wp6.draft, stock.kerosene]],
      update: ['update public.receipt_lines set qty_in_unit = qty_in_unit where id = $1', [wp6.line]],
    },
    receipt_amounts: {
      allowed: ACCOUNTS,
      insertDenied: 'forbidden',
      insert: ['insert into public.receipt_amounts (doc_id, discount) values ($1, 0)', [wp6.bare]],
      update: ['update public.receipt_amounts set discount = discount where id = $1', [wp6.amounts]],
    },
    receipt_line_amounts: {
      allowed: ACCOUNTS,
      insertDenied: 'forbidden',
      insert: ['insert into public.receipt_line_amounts (line_id, line_total) values ($1, 100)', [wp6.bareLine]],
      update: ['update public.receipt_line_amounts set line_total = line_total where id = $1', [wp6.lineAmount]],
    },
    receipt_charges: {
      allowed: ACCOUNTS,
      insertDenied: 'forbidden',
      insert: ["insert into public.receipt_charges (doc_id, label, amount, allocate_by, cash_account_id) values ($1, 'نقل', 100, 'value', $2)", [wp6.draft, ledger.box]],
      update: ['update public.receipt_charges set amount = amount where id = $1', [wp6.charge]],
    },
    // WP7 (§2.5): رأس المرتجع وسطره بـreceipt.draft، والمقبول بـreceipt.amounts (حارسه يرفض الممنوع قبل RLS).
    supplier_returns: {
      allowed: TRANSFER,
      insert: ['insert into public.supplier_returns (receipt_id, returned_on) values ($1, public.app_today())', [wp7.receipt]],
      update: ['update public.supplier_returns set note = note where id = $1', [wp7.draft]],
    },
    supplier_return_lines: {
      allowed: TRANSFER,
      insertDenied: 'forbidden',
      insert: ['insert into public.supplier_return_lines (doc_id, receipt_line_id, qty_base) values ($1, $2, 1)', [wp7.empty, wp7.receiptLine]],
      update: ['update public.supplier_return_lines set qty_base = qty_base where id = $1', [wp7.line]],
    },
    // 0015: الخلطة ونسخها وسطورها بفعل recipe.activate (المنشأة كلّها)، ورأس الدفعة وسطرها بالتعديل وحده (الإدراج من
    // create_production باللقطة) بفعل production.draft ونطاق مخزن مدخلاتها.
    recipes: {
      allowed: RECIPE,
      insert: ["insert into public.recipes (name, output_item_id) values ('خلطة ثالثة', $1)", [p3.output]],
      update: ['update public.recipes set note = note where id = $1', [p3.recipe]],
    },
    recipe_versions: {
      allowed: RECIPE,
      insert: ['insert into public.recipe_versions (recipe_id, basis_kg) values ($1, 100)', [p3.spare]],
      update: ['update public.recipe_versions set note = note where id = $1', [p3.draftVersion]],
    },
    recipe_lines: {
      allowed: RECIPE,
      // حارس السطر (definer) يفحص recipe.activate قبل أن تُقيَّم سياسة الإدراج، فالرفض بالفعل لا بالسياسة.
      insertDenied: 'forbidden',
      insert: ["insert into public.recipe_lines (version_id, item_id, qty, unit) values ($1, $2, 10, 'kg')", [p3.draftVersion, p3.bran]],
      update: ['update public.recipe_lines set qty = qty where id = $1', [p3.draftLine]],
    },
    production_batches: {
      allowed: MILL_DRAFT,
      update: ['update public.production_batches set note = note where id = $1', [p3.draftBatch]],
    },
    production_inputs: {
      allowed: MILL_DRAFT,
      update: ['update public.production_inputs set actual_qty_base = actual_qty_base where id = $1', [p3.draftInput]],
    },
    // 0016: معدّل تكاليف الخلطة بفعل التفعيل، وسطر تكاليف الدفعة بفعل costs.load؛ وحارس كلّ منهما (definer) يرفض الممنوع بالفعل قبل
    // سياسة الإدراج، والتعديل الممنوع صفر صفوف (USING وسياسة الكلفة المقيِّدة تحجبان الصفّ).
    recipe_cost_rates: {
      allowed: RECIPE,
      insertDenied: 'forbidden',
      insert: ['insert into public.recipe_cost_rates (version_id, category_id, amount_per_ton) values ($1, $2, 500)', [p3.draftVersion, p3.transport]],
      update: ['update public.recipe_cost_rates set amount_per_ton = amount_per_ton where id = $1', [p3.draftRate]],
    },
    production_costs: {
      allowed: ACCOUNTS,
      insertDenied: 'forbidden',
      insert: ['insert into public.production_costs (batch_id, category_id, amount) values ($1, $2, 10)', [p3.draftBatch, p3.transport]],
      update: ['update public.production_costs set amount = amount where id = $1', [p3.draftCost]],
    },
    // 0012: القاعة بفعل flock.manage ونطاق حقلها (in_scope_site)، مثل المخزن بنطاق موقعه.
    halls: {
      allowed: FLOCK_MANAGE,
      insert: ["insert into public.halls (site_id, name) values ($1, 'قاعة 3')", [farm.site]],
      update: ['update public.halls set name = name where id = $1', [p2.hall]],
    },
    supplier_return_line_amounts: {
      allowed: ACCOUNTS,
      insertDenied: 'forbidden',
      insert: ['insert into public.supplier_return_line_amounts (line_id, credit_amount) values ($1, 100)', [wp7.bareLine]],
      update: ['update public.supplier_return_line_amounts set credit_amount = credit_amount where id = $1', [wp7.credit]],
    },
  });
  t.same(Object.keys(WRITES).sort(), Object.keys(CLASSES.directWrite).sort(), `الكتابة المباشرة تغطّي directWrite بـclasses.json بالضبط (${Object.keys(WRITES).length} جدول)`);
  let writeCells = 0;
  // الفعل لكل أمر ({ insert, update }، الجهات من 0006) أو واحد للأمرين؛ والمسموح لكل أمر = can(فعله) بـpermissions.ts.
  const actionOf = (table, verb) => (typeof CLASSES.directWrite[table].action === 'string' ? CLASSES.directWrite[table].action : CLASSES.directWrite[table].action[verb]);
  for (const [table, row] of Object.entries(WRITES)) {
    for (const verb of CLASSES.directWrite[table].privileges) {
      const allowed = row[`${verb}Allowed`] ?? row.allowed;
      t.same([...allowed].sort(), ROLES.filter((role) => role === 'owner' || can(role, actionOf(table, verb))).sort(), `${table}.${verb}: المسموح = can(${actionOf(table, verb)}) بـpermissions.ts`);
      const got = {};
      for (const role of ROLES) {
        writeCells += 1;
        const [sql, params] = row[verb];
        try {
          const result = await db.asUser(USERS[role], (q) => q(sql, params));
          got[role] = result.rowCount === 1 ? 'ok' : `rows:${result.rowCount}`;
        } catch (error) {
          got[role] = /row-level security/u.test(error.message) ? 'rls' : error.message;
        }
      }
      const expected = Object.fromEntries(ROLES.map((role) => [role, allowed.includes(role) ? 'ok' : verb === 'insert' ? (row.insertDenied ?? 'rls') : 'rows:0']));
      t.same(got, expected, `${table}.${verb}: كل دور بنتيجته`);
    }
  }
  const writeVerbs = Object.keys(WRITES).reduce((sum, table) => sum + CLASSES.directWrite[table].privileges.length, 0);
  t.eq(writeCells, writeVerbs * ROLES.length, `خانات الكتابة المباشرة: ${writeVerbs} (جدول × أمر) × ${ROLES.length} أدوار`);
}
