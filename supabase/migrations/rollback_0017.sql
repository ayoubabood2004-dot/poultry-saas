-- rollback_0017 — تراجع 0017_simple_purchase (الشراء بنداء واحد، وملفّ المادّة، وبطاقات المواد، وفعل «يسجّل الشراء»؛ مشغّل التراجع
-- بالحزمة FOUNDATION ٨٢٠، ٨٧٦). يُسقط record_purchase وitem_file وitems_overview وverify_purchases، ويرجّع جسم post_receipt كما في
-- 0009 حرفاً بحرف ثمّ يُسقط private.post_receipt_core، ويرجّع حارسَي private.receipt_lines_guard وprivate.receipt_amounts_guard كما في
-- 0009 حرفاً بحرف ثمّ يُسقط مساعدَي العلامة (purchase_marker وpurchase_pass) ومساعدَي النتيجة والتلميح، ويُسقط سياسة نطاق سجلّ التدقيق
-- وجدول purchase_prices، ثمّ يرجّع جسمَي private.actions وprivate.role_can كما في 0013 حرفاً بحرف (md5 نفسه بالكتالوج، فيختفي الفعل
-- purchase.record).
-- **طريق رفض (الكتلة أدناه):** إسقاط purchase_prices يمسح سعر الوحدة كما كتبه المستخدم وسعر البيع لكلّ شراء، ولا يُستخرجان من مكان
-- آخر (المبلغ مقرَّب لأقرب دينار، فالسعر منه تقريبيّ). فالملف يرفض نفسه إن كان في الجدول صفّ واحد. الاستلامات المرحَّلة نفسها
-- (دفعاتها وحركاتها وقيودها) تبقى بعد التراجع استلامات عادية، ويلغيها المدير من صفحتها.
-- تنعاد بأمان: drop if exists، وcreate or replace.

set lock_timeout = '5s';

-- ٠) طريق الرفض: لا تُمسح أسعار الشراء.
do $$
declare
  v_rows bigint;
begin
  select count(*) into v_rows from public.purchase_prices;
  if v_rows > 0 then
    raise exception 'rollback_blocked'
      using hint = format('في جدول أسعار الشراء %s صفّاً، والتراجع يمسحها (سعر الوحدة كما كُتب وسعر البيع لكلّ شراء). صدّرها أوّلاً، ولا تراجع عن 0017 ما دامت موجودة.', v_rows);
  end if;
end
$$;

-- ١) الدوالّ الجديدة:
drop function if exists public.record_purchase(uuid, uuid, uuid, uuid, uuid, date, numeric, numeric, numeric, text, uuid, uuid, date, timestamptz);
drop function if exists public.record_purchase(uuid, uuid, uuid, uuid, uuid, date, numeric, numeric, numeric, text, uuid, uuid);
drop function if exists public.item_file(uuid);
drop function if exists public.items_overview();
drop function if exists public.verify_purchases();
drop function if exists private.purchase_result(uuid, uuid);
drop function if exists private.store_kinds_label(text[]);

-- ٢) الترحيل كما في 0009_receipts.sql حرفاً بحرف، ثمّ الجسم المشترك:
create or replace function public.post_receipt(p_id uuid, p_expected_version int, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'post_receipt';
  v_cached jsonb;
  d public.receipts;
  w public.warehouses;
  b public.ledger_books;
  p public.parties;
  ln public.receipt_lines;
  c public.receipt_charges;
  l public.stock_lots;
  e public.party_entries;
  m public.cash_moves;
  v_parties uuid[];
  v_items uuid[];
  v_boxes uuid[];
  v_box uuid;
  v_date date;
  v_val jsonb;
  v_row jsonb;
  v_value numeric;
  v_net numeric;
  v_paid numeric;
  v_no text;
  v_purchase uuid;
  v_lots jsonb := '[]'::jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('receipt.amounts');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'version', p_expected_version));
  if v_cached is not null then
    return v_cached;
  end if;
  select * into d from public.receipts where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(d.warehouse_id, true);
  -- الجهات من المستند بلا قفل (E9)، وتنفحص بعد قفله.
  v_parties := private.receipt_parties(d.id);
  perform private.lock_parties(v_parties);
  v_date := d.received_on;
  perform private.check_post_date(v_date, w.division_id);
  perform private.lock_receipt_rows(d.id);
  select * into d from public.receipts where org_id = w.org_id and id = p_id for update;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'هذا المستند ليس مسوّدة: رُحّل أو أُلغي من قبل.';
  end if;
  if p_expected_version is null or d.version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّرت المسوّدة بعد المعاينة. راجعها وعاينها من جديد قبل الترحيل.';
  end if;
  if d.received_on is distinct from v_date or not (private.receipt_parties(d.id) <@ v_parties) then
    raise exception 'stale_draft' using hint = 'تغيّر تاريخ المسوّدة أو مورّدها أو ناقل أحد تحميلاتها أثناء الترحيل. راجعها وعاينها من جديد.';
  end if;
  select array_agg(distinct x.item_id) into v_items from public.receipt_lines x where x.org_id = d.org_id and x.doc_id = d.id;
  if v_items is null then
    raise exception 'receipt_empty' using hint = 'الاستلام بلا سطور. أضف سطراً واحداً على الأقلّ.';
  end if;
  b := private.book_for_post(private.receipt_book(w.id));
  p := private.party_for_post(d.party_id);
  if p.archived_at is not null then
    raise exception 'party_archived' using hint = format('المورّد «%s» مؤرشف، فلا يُسجَّل منه استلام جديد. أعِده من الأرشيف أوّلاً.', p.name);
  end if;
  perform private.lock_masters(array[w.id], v_items, true);
  for ln in select * from public.receipt_lines x where x.org_id = d.org_id and x.doc_id = d.id order by x.line_no loop
    perform private.raise_receipt_problem(private.receipt_line_problem(w, d, ln));
  end loop;
  v_val := private.receipt_valuation(d.id);
  perform private.raise_receipt_problem(v_val -> 'problem');
  v_net := (v_val ->> 'net')::numeric;
  v_paid := (v_val ->> 'paid_now')::numeric;
  perform private.lock_balances(v_items, array_fill(w.id, array[cardinality(v_items)]));
  v_boxes := array(
    select distinct x.id from (
      select (v_val ->> 'cash_account_id')::uuid as id where v_paid > 0
      union all
      select y.cash_account_id from public.receipt_charges y where y.org_id = d.org_id and y.doc_id = d.id and y.cash_account_id is not null
    ) as x where x.id is not null order by x.id);
  foreach v_box in array v_boxes loop
    perform private.lock_cash_account(v_box, true);
  end loop;
  for v_row in select x.value from jsonb_array_elements(v_val -> 'lines') with ordinality as x(value, n) order by x.n loop
    select * into ln from public.receipt_lines where org_id = d.org_id and id = (v_row ->> 'line_id')::uuid;
    v_value := (v_row ->> 'value')::numeric;
    l := private.new_lot(ln.item_id, w.id, d.received_on, ln.expiry_on, ln.born_at, ln.qty_base, v_value, 'receipt', d.id, ln.id);
    if ln.supplier_lot_no is not null then
      update public.stock_lots set supplier_lot_no = ln.supplier_lot_no where org_id = l.org_id and id = l.id;
    end if;
    perform private.apply_move(l.id, 'receipt', d.id, ln.id, ln.qty_base, v_value, d.received_on, null);
    update public.receipt_line_amounts set discount_share = (v_row ->> 'discount_share')::numeric, charge_share = (v_row ->> 'charge_share')::numeric
    where org_id = d.org_id and line_id = ln.id;
    v_lots := v_lots || jsonb_build_array(jsonb_build_object('line_id', ln.id, 'lot_id', l.id, 'item_id', ln.item_id, 'qty', ln.qty_base::text,
      'money', jsonb_build_object('value', v_value::text)));
  end loop;
  insert into public.receipt_charge_shares (org_id, doc_id, warehouse_id, charge_id, line_id, share)
  select d.org_id, d.id, d.warehouse_id, (x.value ->> 'charge_id')::uuid, (s.value ->> 'line_id')::uuid, (s.value ->> 'share')::numeric
  from jsonb_array_elements(v_val -> 'charges') as x cross join lateral jsonb_array_elements(x.value -> 'shares') as s;
  v_no := private.next_doc_no('PU', d.received_on);
  if v_net > 0 then
    e := private.write_entry(gen_random_uuid(), d.party_id, b.id, 'purchase', -v_net, 'receipt', d.id, v_no, d.received_on, null);
    v_purchase := e.id;
  end if;
  for c in select * from public.receipt_charges x where x.org_id = d.org_id and x.doc_id = d.id order by x.charge_no loop
    if c.payee_party_id is not null then
      e := private.write_entry(gen_random_uuid(), c.payee_party_id, b.id, 'purchase', -c.amount, 'receipt', d.id, v_no, d.received_on, null);
      perform private.allocate_entry(e.id, null);
      update public.receipt_charges set party_entry_id = e.id where org_id = c.org_id and id = c.id;
    else
      m := private.write_cash_move(c.cash_account_id, -c.amount, 'receipt_charge', 'receipt', d.id, null, d.received_on, null, c.label);
      update public.receipt_charges set cash_move_id = m.id where org_id = c.org_id and id = c.id;
    end if;
  end loop;
  -- المدفوع عند الفاتورة يروح لفاتورته هي (FOUNDATION ٤٩٥)، وبعده متبقّي قيد المورّد يتوزّع من الأقدم.
  if v_paid > 0 then
    e := private.write_entry(gen_random_uuid(), d.party_id, b.id, 'payout', v_paid, 'receipt', d.id, v_no, d.received_on, null);
    perform private.allocate_entry(e.id, v_purchase);
    perform private.write_cash_move((v_val ->> 'cash_account_id')::uuid, -v_paid, 'receipt_paid', 'receipt', d.id, e.id, d.received_on, null, null);
  end if;
  if v_purchase is not null then
    perform private.allocate_entry(v_purchase, null);
  end if;
  update public.receipts set status = 'posted', doc_no = v_no, book_id = b.id, client_ref = p_client_ref, posted_at = now(), posted_by = auth.uid()
  where org_id = d.org_id and id = d.id;
  perform private.mark_division_posted(w.division_id);
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'kind', 'receipt', 'status', 'posted', 'doc_no', v_no,
    'party_id', d.party_id, 'warehouse_id', w.id, 'book_id', b.id, 'received_on', d.received_on, 'lots', v_lots,
    'money', jsonb_build_object('lines_total', v_val ->> 'lines_total', 'discount', v_val ->> 'discount', 'net', v_val ->> 'net',
      'paid_now', v_val ->> 'paid_now', 'charges_total', v_val ->> 'charges_total')));
end
$$;

drop function if exists private.post_receipt_core(uuid, integer, uuid);

-- ٣) الحارسان كما في 0009_receipts.sql حرفاً بحرف، ثمّ مساعدا العلامة:
create or replace function private.receipt_lines_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d public.receipts;
  w public.warehouses;
  i public.items;
  u public.item_units;
  g public.units;
begin
  set local lock_timeout = '5s';
  if tg_op = 'UPDATE' and new.doc_id is distinct from old.doc_id then
    raise exception 'frozen_column' using hint = 'السطر يبقى في مستنده.';
  end if;
  select * into d from public.receipts where org_id = new.org_id and id = new.doc_id for update;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'الاستلام مرحَّل أو ملغى؛ لا تُعدَّل سطوره.';
  end if;
  perform private.require('receipt.draft');
  if not public.in_scope_wh(d.warehouse_id) then
    raise exception 'out_of_scope' using hint = 'مخزن هذا الاستلام خارج نطاقك.';
  end if;
  new.warehouse_id := d.warehouse_id;
  if tg_op = 'INSERT' then
    new.line_no := coalesce((select max(l.line_no) from public.receipt_lines l where l.org_id = d.org_id and l.doc_id = d.id), 0) + 1;
  else
    new.line_no := old.line_no;
  end if;
  select * into i from public.items where org_id = d.org_id and id = new.item_id;
  if i.id is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  select * into w from public.warehouses where org_id = d.org_id and id = d.warehouse_id;
  if not private.item_admissible(w.kind, i.kind) then
    raise exception 'item_kind_mismatch' using hint = format('«%s» لا يُخزَّن في «%s»: نوع المادّة لا يناسب نوع المخزن.', i.name, w.name);
  end if;
  if not (w.kind = any (private.receiving_kinds(i.kind))) then
    raise exception 'wrong_receiving_store' using hint = format('«%s» لا تُستلم من المورّد في «%s»؛ تُستلم في مخزن الوحدة صاحبة نوعها ثم تُحوَّل.', i.name, w.name);
  end if;
  if new.qty_in_unit is null or not (abs(new.qty_in_unit) < 'Infinity') or new.qty_in_unit <= 0 then
    raise exception 'qty_not_positive' using hint = 'اكتب كمية أكبر من صفر.';
  end if;
  if new.item_unit_id is not null then
    select * into u from public.item_units where org_id = d.org_id and id = new.item_unit_id;
    if u.id is null or u.item_id <> new.item_id then
      raise exception 'unit_mismatch' using hint = 'وحدة التعبئة المختارة ليست لهذه المادّة. اختر وحدة من وحداتها.';
    end if;
    if not u.for_purchase or (u.party_id is not null and u.party_id <> d.party_id) then
      raise exception 'unit_mismatch' using hint = format('«%s» ليست وحدة شراء من هذا المورّد. اختر وحدة شراء عامّة أو خاصّة بمورّد الاستلام.', u.label);
    end if;
    new.unit_code := null;
    new.unit_label := u.label;
    new.factor := u.factor_to_base;
  elsif new.unit_code is not null then
    select * into g from public.units where code = new.unit_code;
    if g.code is null or g.base <> i.base_unit then
      raise exception 'unit_mismatch' using hint = 'الوحدة لا تناسب وحدة أساس المادّة.';
    end if;
    new.unit_label := g.code;
    new.factor := g.factor;
  else
    new.unit_label := i.base_unit;
    new.factor := 1;
  end if;
  new.qty_base := private.to_base(new.qty_in_unit, new.factor, i.base_unit);
  if new.qty_base <= 0 then
    raise exception 'qty_not_positive' using hint = 'الكمية بوحدة الأساس قُرِّبت إلى صفر. اكتب كمية أكبر.';
  end if;
  new.base_unit := i.base_unit;
  new.density_kg_per_l := i.density_kg_per_l;
  new.piece_mass_kg := i.piece_mass_kg;
  new.supplier_lot_no := nullif(btrim(new.supplier_lot_no), '');
  update public.receipts set version = version + 1 where org_id = d.org_id and id = d.id;
  return new;
end
$$;

create or replace function private.receipt_amounts_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d public.receipts;
  ln public.receipt_lines;
  v_doc uuid;
  v_computed constant text[] := array['discount_share', 'charge_share', 'party_entry_id', 'cash_move_id', 'all_lines'];
begin
  set local lock_timeout = '5s';
  if tg_op = 'UPDATE' and (to_jsonb(new) - v_computed) = (to_jsonb(old) - v_computed) and to_jsonb(new) <> to_jsonb(old) then
    return new;
  end if;
  if tg_table_name = 'receipt_line_amounts' then
    if tg_op = 'UPDATE' and new.line_id is distinct from old.line_id then
      raise exception 'frozen_column' using hint = 'المبلغ يبقى على سطره.';
    end if;
    if tg_op = 'INSERT' then
      select * into ln from public.receipt_lines where org_id = new.org_id and id = new.line_id for key share;
    else
      select * into ln from public.receipt_lines where org_id = new.org_id and id = new.line_id;
    end if;
    if ln.id is null then
      raise exception 'line_not_found' using hint = 'سطر الاستلام غير موجود. حدّث الشاشة.';
    end if;
    v_doc := ln.doc_id;
    new.doc_id := ln.doc_id;
  else
    if tg_op = 'UPDATE' and new.doc_id is distinct from old.doc_id then
      raise exception 'frozen_column' using hint = 'المبلغ يبقى على مستنده.';
    end if;
    v_doc := new.doc_id;
  end if;
  select * into d from public.receipts where org_id = new.org_id and id = v_doc for update;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'الاستلام مرحَّل أو ملغى؛ لا تُعدَّل مبالغه.';
  end if;
  perform private.require('receipt.amounts');
  if not public.can_see_cost() then
    raise exception 'forbidden' using hint = 'مبالغ الاستلام لأدوار الكلفة فقط.';
  end if;
  if not public.in_scope_wh(d.warehouse_id) then
    raise exception 'out_of_scope' using hint = 'مخزن هذا الاستلام خارج نطاقك.';
  end if;
  new.warehouse_id := d.warehouse_id;
  if tg_table_name = 'receipt_line_amounts' then
    if new.line_total is null or not (abs(new.line_total) < 'Infinity') or new.line_total < 0 then
      raise exception 'value_required' using hint = 'اكتب مبلغ السطر كما في فاتورة المورّد؛ الصفر يُقبل مع سببه فقط.';
    end if;
    if new.line_total <> round(new.line_total, 0) then
      raise exception 'amount_not_whole_dinar' using hint = 'مبلغ سطر الاستلام بالدينار الصحيح كما يحاسبك المورّد؛ الفلس يظهر في قيمة الدفعات فقط.';
    end if;
    new.zero_reason := nullif(btrim(new.zero_reason), '');
  elsif tg_table_name = 'receipt_amounts' then
    if new.discount is null or not (abs(new.discount) < 'Infinity') or new.discount < 0
       or new.paid_now is null or not (abs(new.paid_now) < 'Infinity') or new.paid_now < 0 then
      raise exception 'amount_required' using hint = 'اكتب الخصم والمدفوع أرقاماً لا تقلّ عن صفر.';
    end if;
    if new.discount <> round(new.discount, 0) or new.paid_now <> round(new.paid_now, 0) then
      raise exception 'amount_not_whole_dinar' using hint = 'خصم الفاتورة والمدفوع عند الاستلام بالدينار الصحيح، دون كسور.';
    end if;
  else
    if tg_op = 'INSERT' then
      new.charge_no := coalesce((select max(c.charge_no) from public.receipt_charges c where c.org_id = d.org_id and c.doc_id = d.id), 0) + 1;
      new.all_lines := true;
      new.party_entry_id := null;
      new.cash_move_id := null;
    else
      new.charge_no := old.charge_no;
    end if;
    new.label := btrim(new.label);
    if new.amount is null or not (abs(new.amount) < 'Infinity') or new.amount <= 0 then
      raise exception 'amount_not_positive' using hint = 'مبلغ التحميل أكبر من صفر.';
    end if;
    if new.amount <> round(new.amount, 0) then
      raise exception 'amount_not_whole_dinar' using hint = 'مبلغ التحميل بالدينار الصحيح: يدخل دفتر الناقل أو الصندوق.';
    end if;
    if num_nonnulls(new.payee_party_id, new.cash_account_id) <> 1 then
      raise exception 'charge_payee_required' using hint = 'اختر لمن يُدفع التحميل: جهة (ناقل) يُسجَّل لها في دفترها، أو صندوق يُدفع منه الآن — واحداً منهما فقط.';
    end if;
  end if;
  update public.receipts set version = version + 1 where org_id = d.org_id and id = d.id;
  return new;
end
$$;

drop function if exists private.purchase_pass(uuid);
drop function if exists private.purchase_marker(uuid);

-- ٤) سياسة نطاق سجلّ التدقيق والجدول (سياسته ومحفّزه وفهارسه تسقط معه):
drop policy if exists audit_log_purchase_scope on public.audit_log;
drop table if exists public.purchase_prices;

-- ٥) الأفعال وجدول الأدوار كما في 0013_item_purchases_stores.sql حرفاً بحرف (الفعل purchase.record يختفي معهما):
create or replace function private.actions() returns text[]
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select array[
    'receipt.draft', 'transfer.post', 'issue.post', 'count.enter', 'stock_use.post',
    'receipt.amounts', 'costs.load', 'sale.post', 'payment.post', 'sale_return.post', 'expense.post', 'accounts.view',
    'production.draft', 'production.post',
    'hatch.operate',
    'flock_day.save', 'weigh_ticket.draft',
    'recipe.activate', 'count.approve', 'flock.manage', 'flock.transfer', 'hatch.zero_saleable', 'expired.destroy',
    'expired.release', 'void', 'receipt.revalue', 'party.adjust', 'opening.post', 'period.lock',
    'party.offset', 'members.manage', 'period.unlock',
    'stores.manage', 'parties.manage', 'party.create', 'cash_accounts.manage', 'expense_categories.manage',
    'item.create',
    'read'
  ]
$$;

create or replace function private.role_can(p_role text, p_action text, p_costs_confirmed boolean default false) returns boolean
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
begin
  if p_action is null or not (p_action = any (private.actions())) then
    raise exception 'unknown_action' using hint = case
      when p_action is null then 'لم يُحدَّد الإجراء.'
      else format('الإجراء «%s» غير معروف.', p_action)
    end;
  end if;
  if p_role is null then return false; end if;
  if p_role = 'owner' then return true; end if;
  if p_action in ('party.offset', 'members.manage', 'period.unlock') then return false; end if;
  if p_action = 'read' then return true; end if;
  -- «يضيف مادّة» (قرار المالك 2026-11-02): أمين المخزن يضيف مادّة ووحدتها، ومن يملك إدارة المخازن يملكها أيضاً (المالك والمدير).
  -- القاعدة مكتوبة مرّة واحدة هنا، فلا تتفرّق إذا تغيّر جدول الأدوار؛ والتعديل والأرشفة تبقى stores.manage.
  if p_action = 'item.create' then
    return p_role = 'storekeeper' or private.role_can(p_role, 'stores.manage', p_costs_confirmed);
  end if;
  return case p_role
    when 'manager' then true
    when 'accountant' then p_action in ('receipt.amounts', 'costs.load', 'production.post', 'sale.post', 'payment.post', 'sale_return.post', 'expense.post', 'accounts.view',
      'parties.manage', 'party.create', 'cash_accounts.manage', 'expense_categories.manage')
    when 'storekeeper' then p_action in ('receipt.draft', 'transfer.post', 'issue.post', 'count.enter', 'stock_use.post', 'party.create')
    when 'mill_operator' then p_action = 'production.draft' or (p_action = 'production.post' and coalesce(p_costs_confirmed, false))
    when 'hatchery_operator' then p_action = 'hatch.operate'
    when 'hall_worker' then p_action in ('flock_day.save', 'weigh_ticket.draft')
    else false
  end;
end
$$;
