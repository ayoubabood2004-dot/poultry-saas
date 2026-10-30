-- 0009_receipts — الاستلام من المورّد: المسوّدة بالكميات (الأمين) ومبالغها بجداول جارة (أدوار الكلفة)، وتحميلات الاستلام، والترحيل
--   بالدفعات والحركات وقيود المورّد والناقل بدفتر نوع المخزن والدفع عند الاستلام، والإلغاء والمعاينة (خطّة المرحلة 1 WP6؛ FOUNDATION
--   ٢٨٤–٢٨٦، ٣٢٨–٣٣٤، ٤٧٢–٤٧٣، ٤٩٣–٤٩٥، ٥٥٠–٥٥١؛ DECISIONS Q2 وQ5 وQ7 وQ8 وQ9؛ E10 وE17–E19 وE21 وE43 وE44 وE46 وE52 وE55).
-- المشكلة: ماكو استلام، فما تدخل مادّة من مورّد ولا ينكتب دين مورّد ولا ناقل، وكل دفعات المخزون من الافتتاح والجرد بس.
-- هنا: receipts وreceipt_lines (الأمين، receipt.draft، بلا مال) وreceipt_amounts وreceipt_line_amounts وreceipt_charges (أدوار الكلفة،
--   receipt.amounts، مقيِّدة بالكلفة) وreceipt_charge_lines (اختيار سطور التحميل بدالّة set_charge_lines) وreceipt_charge_shares (لقطة
--   الترحيل لكل تحميل وسطر، E55)؛ ودفتر الاستلام من نوع مخزنه بمشغّل (القاعدة 36) والمخزن المستلم ونوع المادّة بحارس السطر، ولقطة
--   الكثافة ووزن القطعة على السطر (E46)؛ وpost_receipt وvoid_receipt وpreview_receipt وdelete_receipt_charge وset_charge_lines، وحساب
--   الخصم والتحميلات بدالّة وحدة للمعاينة والترحيل (receipt_valuation)؛ وdiscard_draft وdelete_draft_line يزيدان الاستلام؛ وverify_stock
--   يزيد الاستلام (حفظ القيمة، والمستند = حركاته، وروابط الخصم والتحميلات وقيمة الدفعة والقيود: فحوص الخطّة 10–13)؛ وverify_ledger
--   يزيد أرقام PU ومصدرَي حركتي دفعة الاستلام وتحميله.
-- انحرافات مكتوبة عن الخطّة: جداول الاستلام الجارة بعمود doc_id لرأسها (اسمه بكل جداول السطور، مو receipt_id: بمرتجع المورّد WP7
--   receipt_id يعني الاستلام الأصل)؛ وreceipt_charges.all_lines صريح (الخطّة: «بلا صفوف = كل السطور»، فحذف آخر سطر مختار كان يوسّع
--   التحميل لكل السطور بصمت؛ هسه تحميل اختار سطوراً وما بقى منها شي يرفض charge_lines_required)؛ وcharge_no لترتيب التحميلات؛
--   وreceipt_charges.party_entry_id وcash_move_id لقطة الترحيل (E55، المورّد نفسه ممكن يكون ناقلاً بقيد ثاني)؛ وreceipt_line_amounts
--   .zero_reason (Q9)؛ ومبلغ سطر فارغ يرفض value_required؛ ووحدة التعبئة للسطر وحدة شراء (for_purchase) وعامّة أو لنفس المورّد
--   (FOUNDATION ٢٧٣)؛ ودفعة الاستلام عند الفاتورة قيد payout برقم الاستلام نفسه وحركة receipt_paid، وتحميل الصندوق حركة
--   receipt_charge، وإلغاؤه مصروف تعديل «استلام ملغى» يشير لحركته (E10)؛ وhas_revaluation وhas_supplier_returns تجي بـWP7.
-- تراجع: rollback_0009.sql — يرجّع أجسام discard_draft وdelete_draft_line وverify_stock وverify_ledger كما بـ0008 حرفاً بحرف، ويشيل
--   الجداول السبعة ودوالّها ومشغّلاتها وسياسة نطاقها على سجلّ التدقيق؛ ويرفض بصوت إذا أي استلام موجود (ولو مسوّدة)، بلا ما يحذف شي.
-- تنعاد بأمان: if not exists، create or replace، وكتل do تفحص الكتالوج قبل السياسات.

set lock_timeout = '5s';

-- ─── الرأس (FOUNDATION ٣٢٨): مسوّدة بمورّدها ومخزنها وتاريخها؛ الدفتر يكتبه مشغّل من نوع المخزن (القاعدة 36)، والرقم PU بالترحيل ──
create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  doc_no text,
  party_id uuid not null,
  warehouse_id uuid not null,
  book_id uuid not null,
  received_on date not null,
  status text not null default 'draft',
  version int not null default 1,
  client_ref uuid,
  note text,
  posted_at timestamptz,
  posted_by uuid,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint receipts_status_check check (status in ('draft', 'posted', 'void')),
  constraint receipts_lifecycle_check check ((status = 'draft' and posted_at is null and voided_at is null)
    or (status = 'posted' and posted_at is not null and voided_at is null) or (status = 'void' and voided_at is not null)),
  constraint receipts_numbered_check check ((doc_no is null) = (posted_at is null)),
  constraint receipts_doc_no_check check (doc_no is null or doc_no ~ '^PU-[0-9]{4}-[0-9]{4,}$'),
  constraint receipts_version_check check (version >= 1),
  constraint receipts_note_check check (note is null or length(btrim(note)) between 1 and 500),
  constraint receipts_void_reason_check check (void_reason is null or length(btrim(void_reason)) between 1 and 500),
  unique (org_id, id),
  unique (org_id, id, warehouse_id),
  unique (org_id, doc_no),
  foreign key (org_id, party_id) references public.parties (org_id, id),
  foreign key (org_id, warehouse_id) references public.warehouses (org_id, id),
  foreign key (org_id, book_id) references public.ledger_books (org_id, id)
);
create index if not exists receipts_party on public.receipts (org_id, party_id);
create index if not exists receipts_warehouse on public.receipts (org_id, warehouse_id);
create index if not exists receipts_book on public.receipts (org_id, book_id);
create index if not exists receipts_list on public.receipts (org_id, received_on, created_at, id);

-- السطر بلا مال (الأمين يكتبه ويقراه): لقطة الوحدة (E7) والكمية بوحدة الأساس، ولقطة الكثافة ووزن القطعة من المادّة لحظة كتابته (E46)،
-- ومخزن الرأس منسوخ (E6).
create table if not exists public.receipt_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  doc_id uuid not null,
  warehouse_id uuid not null,
  line_no int not null,
  item_id uuid not null,
  item_unit_id uuid,
  unit_code text,
  unit_label text not null,
  qty_in_unit numeric not null,
  factor numeric not null,
  qty_base numeric not null,
  base_unit text not null,
  expiry_on date,
  born_at timestamptz,
  supplier_lot_no text,
  density_kg_per_l numeric,
  piece_mass_kg numeric,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint receipt_lines_qty_in_unit_check check (abs(qty_in_unit) < 'Infinity' and qty_in_unit > 0 and qty_in_unit = round(qty_in_unit, 3)),
  constraint receipt_lines_factor_check check (abs(factor) < 'Infinity' and factor > 0 and factor = round(factor, 6)),
  constraint receipt_lines_qty_base_check check (abs(qty_base) < 'Infinity' and qty_base > 0 and qty_base = round(qty_base, 3)),
  constraint receipt_lines_base_unit_check check (base_unit in ('kg', 'L', 'pc')),
  constraint receipt_lines_unit_check check (item_unit_id is null or unit_code is null),
  constraint receipt_lines_unit_label_check check (length(btrim(unit_label)) between 1 and 40),
  constraint receipt_lines_line_no_check check (line_no >= 1),
  constraint receipt_lines_supplier_lot_no_check check (supplier_lot_no is null or length(btrim(supplier_lot_no)) between 1 and 60),
  constraint receipt_lines_density_check check (abs(density_kg_per_l) < 'Infinity' and density_kg_per_l > 0 and density_kg_per_l = round(density_kg_per_l, 4)),
  constraint receipt_lines_piece_mass_check check (abs(piece_mass_kg) < 'Infinity' and piece_mass_kg > 0 and piece_mass_kg = round(piece_mass_kg, 3)),
  unique (org_id, id),
  unique (org_id, doc_id, id),
  unique (org_id, doc_id, line_no),
  foreign key (org_id, doc_id, warehouse_id) references public.receipts (org_id, id, warehouse_id),
  foreign key (org_id, item_id) references public.items (org_id, id),
  foreign key (org_id, item_unit_id) references public.item_units (org_id, id)
);
create index if not exists receipt_lines_doc on public.receipt_lines (org_id, doc_id, warehouse_id);
create index if not exists receipt_lines_item on public.receipt_lines (org_id, item_id);
create index if not exists receipt_lines_unit on public.receipt_lines (org_id, item_unit_id);

-- مبالغ الرأس (جار، FOUNDATION ٣٣٠): الخصم والمدفوع عند الاستلام بدينار صحيح (Q7، القاعدة 7)، وصندوق الدفع.
create table if not exists public.receipt_amounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  doc_id uuid not null,
  warehouse_id uuid not null,
  discount numeric not null default 0,
  paid_now numeric not null default 0,
  cash_account_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint receipt_amounts_discount_check check (abs(discount) < 'Infinity' and discount >= 0 and discount = round(discount, 0)),
  constraint receipt_amounts_paid_now_check check (abs(paid_now) < 'Infinity' and paid_now >= 0 and paid_now = round(paid_now, 0)),
  unique (org_id, id),
  unique (org_id, doc_id),
  foreign key (org_id, doc_id, warehouse_id) references public.receipts (org_id, id, warehouse_id),
  foreign key (org_id, cash_account_id) references public.cash_accounts (org_id, id)
);
create index if not exists receipt_amounts_doc on public.receipt_amounts (org_id, doc_id, warehouse_id);
create index if not exists receipt_amounts_account on public.receipt_amounts (org_id, cash_account_id);

-- مبلغ السطر كما بفاتورة المورّد (جار، القاعدة 10): دينار صحيح (Q7)، والصفر بسبب (Q9)؛ والحصّتان يكتبهما الترحيل بالفلس (E55).
create table if not exists public.receipt_line_amounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  line_id uuid not null,
  doc_id uuid not null,
  warehouse_id uuid not null,
  line_total numeric not null,
  zero_reason text,
  discount_share numeric,
  charge_share numeric,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint receipt_line_amounts_line_total_check check (abs(line_total) < 'Infinity' and line_total >= 0 and line_total = round(line_total, 0)),
  constraint receipt_line_amounts_zero_reason_check check (zero_reason is null or length(btrim(zero_reason)) between 1 and 500),
  constraint receipt_line_amounts_discount_share_check check (abs(discount_share) < 'Infinity' and discount_share >= 0 and discount_share = round(discount_share, 2)),
  constraint receipt_line_amounts_charge_share_check check (abs(charge_share) < 'Infinity' and charge_share >= 0 and charge_share = round(charge_share, 2)),
  unique (org_id, id),
  unique (org_id, line_id),
  foreign key (org_id, doc_id, line_id) references public.receipt_lines (org_id, doc_id, id),
  foreign key (org_id, doc_id, warehouse_id) references public.receipts (org_id, id, warehouse_id)
);
create index if not exists receipt_line_amounts_doc on public.receipt_line_amounts (org_id, doc_id, warehouse_id);
create index if not exists receipt_line_amounts_line on public.receipt_line_amounts (org_id, doc_id, line_id);

-- تحميل الاستلام (جار، القاعدة 11، E17): مبلغ بدينار صحيح يتوزّع بالكتلة أو بالقيمة، على جهة (ناقل) أو من صندوق، واحد منهما بالضبط.
-- all_lines = على كل السطور، وإلا على اختياره (receipt_charge_lines). party_entry_id وcash_move_id يكتبهما الترحيل.
create table if not exists public.receipt_charges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  doc_id uuid not null,
  warehouse_id uuid not null,
  charge_no int not null,
  label text not null,
  amount numeric not null,
  allocate_by text not null,
  payee_party_id uuid,
  cash_account_id uuid,
  all_lines boolean not null default true,
  party_entry_id uuid,
  cash_move_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint receipt_charges_label_check check (length(btrim(label)) between 1 and 80),
  constraint receipt_charges_amount_check check (abs(amount) < 'Infinity' and amount > 0 and amount = round(amount, 0)),
  constraint receipt_charges_allocate_by_check check (allocate_by in ('mass', 'value')),
  constraint receipt_charges_payee_check check (num_nonnulls(payee_party_id, cash_account_id) = 1),
  constraint receipt_charges_posted_check check ((party_entry_id is null or payee_party_id is not null) and (cash_move_id is null or cash_account_id is not null)),
  constraint receipt_charges_charge_no_check check (charge_no >= 1),
  unique (org_id, id),
  unique (org_id, doc_id, id),
  unique (org_id, doc_id, charge_no),
  foreign key (org_id, doc_id, warehouse_id) references public.receipts (org_id, id, warehouse_id),
  foreign key (org_id, payee_party_id) references public.parties (org_id, id),
  foreign key (org_id, cash_account_id) references public.cash_accounts (org_id, id),
  foreign key (org_id, party_entry_id) references public.party_entries (org_id, id),
  foreign key (org_id, cash_move_id) references public.cash_moves (org_id, id)
);
create index if not exists receipt_charges_doc on public.receipt_charges (org_id, doc_id, warehouse_id);
create index if not exists receipt_charges_payee on public.receipt_charges (org_id, payee_party_id);
create index if not exists receipt_charges_account on public.receipt_charges (org_id, cash_account_id);
create index if not exists receipt_charges_entry on public.receipt_charges (org_id, party_entry_id);
create index if not exists receipt_charges_move on public.receipt_charges (org_id, cash_move_id);

-- اختيار سطور التحميل («أو اختر السطور»، FOUNDATION ٤٧٣): يكتبه set_charge_lines بس (§2.5).
create table if not exists public.receipt_charge_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  doc_id uuid not null,
  warehouse_id uuid not null,
  charge_id uuid not null,
  line_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (org_id, id),
  unique (org_id, charge_id, line_id),
  foreign key (org_id, doc_id, charge_id) references public.receipt_charges (org_id, doc_id, id),
  foreign key (org_id, doc_id, line_id) references public.receipt_lines (org_id, doc_id, id),
  foreign key (org_id, doc_id, warehouse_id) references public.receipts (org_id, id, warehouse_id)
);
create index if not exists receipt_charge_lines_charge on public.receipt_charge_lines (org_id, doc_id, charge_id);
create index if not exists receipt_charge_lines_line on public.receipt_charge_lines (org_id, doc_id, line_id);
create index if not exists receipt_charge_lines_doc on public.receipt_charge_lines (org_id, doc_id, warehouse_id);

-- حصّة كل تحميل بكل سطر (E55): يكتبها post_receipt بس، حتى verify_stock يثبت إن حصص كل تحميل = مبلغه.
create table if not exists public.receipt_charge_shares (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  doc_id uuid not null,
  warehouse_id uuid not null,
  charge_id uuid not null,
  line_id uuid not null,
  share numeric not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint receipt_charge_shares_share_check check (abs(share) < 'Infinity' and share >= 0 and share = round(share, 2)),
  unique (org_id, id),
  unique (org_id, charge_id, line_id),
  foreign key (org_id, doc_id, charge_id) references public.receipt_charges (org_id, doc_id, id),
  foreign key (org_id, doc_id, line_id) references public.receipt_lines (org_id, doc_id, id),
  foreign key (org_id, doc_id, warehouse_id) references public.receipts (org_id, id, warehouse_id)
);
create index if not exists receipt_charge_shares_charge on public.receipt_charge_shares (org_id, doc_id, charge_id);
create index if not exists receipt_charge_shares_line on public.receipt_charge_shares (org_id, doc_id, line_id);
create index if not exists receipt_charge_shares_doc on public.receipt_charge_shares (org_id, doc_id, warehouse_id);

-- ─── الدفتر (القاعدة 36، FOUNDATION ٥٠٧) ─────────────────────────────────────────────────────────────────────────
-- دفتر الاستلام من نوع مخزنه: المواد الأوّلية والعلف ← main المعمل، الأدوية ← main الأدوية، العامّ ← main المخازن العامة، بيض التفقيس
-- ← hatching_eggs، الأفراخ ← chicks (وحدة المخزن نفسها، فنوعه يحدّدها). مخازن الحقول وبيض المائدة ما تستلم من مورّد.
create or replace function private.receipt_book(p_wh uuid) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  w public.warehouses;
  v_code text;
  v_book uuid;
begin
  select * into w from public.warehouses where org_id = public.auth_org() and id = p_wh;
  if w.id is null then
    raise exception 'warehouse_not_found' using hint = 'هذا المخزن غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  v_code := case w.kind when 'raw' then 'main' when 'feed' then 'main' when 'medicine' then 'main' when 'general' then 'main'
    when 'hatching_egg' then 'hatching_eggs' when 'chick' then 'chicks' end;
  if v_code is null then
    raise exception 'wrong_receiving_store' using hint = format('«%s» لا يستلم من المورّدين: مخازن الحقول وبيض المائدة تأخذ بالتحويل أو الإنتاج.', w.name);
  end if;
  select b.id into v_book from public.ledger_books b where b.org_id = w.org_id and b.division_id = w.division_id and b.code = v_code;
  if v_book is null then
    raise exception 'book_not_found' using hint = format('لم يوجد دفتر وحدة «%s» لهذا النوع من المخازن. راجع الدعم.', w.name);
  end if;
  return v_book;
end
$$;

-- ─── المشغّلات ────────────────────────────────────────────────────────────────────────────────────────────────
-- الدفتر يكتبه الخادم من المخزن (definer لكل كاتب): الجهاز ما يختار دفتراً (FOUNDATION ٣٢٩).
create or replace function private.receipts_book() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.book_id := private.receipt_book(new.warehouse_id);
  return new;
end
$$;

-- حارس رأس الاستلام (§2.5): invoker، يشتغل لـauthenticated بس (دوالّ الترحيل definer تمرّ). الجديد مسوّدة دائماً، والتعديل المباشر
-- بالمورّد والتاريخ والملاحظة بس، والنسخة تزيد وحدها.
create or replace function private.receipt_header_guard() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  v_free constant text[] := array['party_id', 'received_on', 'note'];
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status is distinct from 'draft' or new.version is distinct from 1 or new.posted_at is not null or new.voided_at is not null
       or new.client_ref is not null or new.void_reason is not null or new.doc_no is not null then
      raise exception 'not_draft' using hint = 'الاستلام الجديد مسوّدة دائماً؛ الترحيل والإلغاء من دوالّهما.';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free) then
    raise exception 'frozen_column' using hint = 'يُعدَّل في مسوّدة الاستلام مورّدها وتاريخها وملاحظتها فقط؛ المخزن والدفتر والحالة والرقم والنسخة يكتبها الخادم.';
  end if;
  new.version := old.version + 1;
  return new;
end
$$;

-- حارس سطر الاستلام (§2.5، definer): الرأس مقفول ومسوّدة، والفعل والنطاق، ومخزن الرأس منسوخ (E6)، ورقم السطر التالي؛ والمادّة
-- تناسب المخزن ويستلمها من المورّد (FOUNDATION ٢٨٤–٢٨٦: «محفّز ثانٍ»)؛ ولقطة الوحدة (E7)، ووحدة التعبئة وحدة شراء عامّة أو لنفس
-- المورّد؛ ولقطة الكثافة ووزن القطعة من المادّة بكل كتابة للسطر (E46: تعديل المادّة بعدها ما يغيّر السطر، وإعادة حفظه تحدّثها)؛
-- والنسخة تزيد.
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

-- رأس المبالغ ومبالغ السطور والتحميلات (§2.5، definer): لأدوار الكلفة بفعل receipt.amounts وبنطاق المخزن، والرأس مقفول ومسوّدة،
-- والنسخة تزيد. السطر قبل الرأس (درس WP5): الإضافة تقفل سطرها for key share أوّلاً (فحص المفتاح الأجنبي بعد الحارس يقفله بهالقفل)،
-- والتعديل صفّه مقفول قبل المشغّل. تعديل المحسوب وحده (الترحيل) يمرّ بلا هذا.
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

create or replace trigger receipts_book before insert on public.receipts
  for each row execute function private.receipts_book();
create or replace trigger receipts_guard before insert or update on public.receipts
  for each row execute function private.receipt_header_guard();
create or replace trigger receipt_lines_guard before insert or update on public.receipt_lines
  for each row execute function private.receipt_lines_guard();
create or replace trigger receipt_amounts_guard before insert or update on public.receipt_amounts
  for each row execute function private.receipt_amounts_guard();
create or replace trigger receipt_line_amounts_guard before insert or update on public.receipt_line_amounts
  for each row execute function private.receipt_amounts_guard();
create or replace trigger receipt_charges_guard before insert or update on public.receipt_charges
  for each row execute function private.receipt_amounts_guard();

do $$
declare
  t text;
begin
  foreach t in array array['receipts', 'receipt_lines', 'receipt_amounts', 'receipt_line_amounts', 'receipt_charges', 'receipt_charge_lines',
    'receipt_charge_shares'] loop
    execute format('create or replace trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()', 'audit_' || t, t);
  end loop;
end
$$;

-- ─── RLS: كل جداول الاستلام بنطاق المخزن، وجداول المال لأدوار الكلفة (مقيِّدة، §2.8) ──────────────────────────────────────
alter table public.receipts enable row level security;
alter table public.receipt_lines enable row level security;
alter table public.receipt_amounts enable row level security;
alter table public.receipt_line_amounts enable row level security;
alter table public.receipt_charges enable row level security;
alter table public.receipt_charge_lines enable row level security;
alter table public.receipt_charge_shares enable row level security;

do $$
declare
  p record;
  t text;
begin
  foreach t in array array['receipts', 'receipt_lines', 'receipt_amounts', 'receipt_line_amounts', 'receipt_charges', 'receipt_charge_lines',
    'receipt_charge_shares'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_read') then
      execute format('create policy %I on public.%I for select to authenticated using (org_id = (select public.auth_org()) and (select public.in_scope_wh(warehouse_id)))',
        t || '_read', t);
    end if;
  end loop;
  foreach t in array array['receipt_amounts', 'receipt_line_amounts', 'receipt_charges', 'receipt_charge_lines', 'receipt_charge_shares'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_cost_only') then
      execute format('create policy %I on public.%I as restrictive for select to authenticated using ((select public.can_see_cost()))', t || '_cost_only', t);
    end if;
  end loop;
  -- الكتابة المباشرة (§2.5): الرأس مسوّدة بنطاق مخزنه، والسطر بفعله ونطاق مخزن صفّه المنسوخ؛ والمبالغ بفعل receipt.amounts.
  for p in
    select * from (values
      ('receipts', 'receipt.draft', true),
      ('receipt_lines', 'receipt.draft', false),
      ('receipt_amounts', 'receipt.amounts', false),
      ('receipt_line_amounts', 'receipt.amounts', false),
      ('receipt_charges', 'receipt.amounts', false)
    ) as x(tbl, action, draft)
  loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.tbl || '_insert') then
      execute format('create policy %I on public.%I for insert to authenticated with check (org_id = (select public.auth_org()) and (select public.can(%L))%s and (select public.in_scope_wh(warehouse_id)))',
        p.tbl || '_insert', p.tbl, p.action, case when p.draft then ' and status = ''draft''' else '' end);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.tbl || '_update') then
      execute format('create policy %I on public.%I for update to authenticated using (org_id = (select public.auth_org()) and (select public.can(%L))%s and (select public.in_scope_wh(warehouse_id))) with check (org_id = (select public.auth_org()) and (select public.can(%L))%s and (select public.in_scope_wh(warehouse_id)))',
        p.tbl || '_update', p.tbl, p.action, case when p.draft then ' and status = ''draft''' else '' end,
        p.action, case when p.draft then ' and status = ''draft''' else '' end);
    end if;
  end loop;
  -- سجلّ التدقيق يحمل الصفّ كلّه (E49): صفوف الاستلام بمخزنها، مثل سياسة قراءة كل جدول نفسه.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'audit_log_wp6_scope') then
    create policy audit_log_wp6_scope on public.audit_log as restrictive for select to authenticated
      using (case
        when table_name in ('receipts', 'receipt_lines', 'receipt_amounts', 'receipt_line_amounts', 'receipt_charges', 'receipt_charge_lines',
          'receipt_charge_shares')
          then public.in_scope_wh((coalesce("new", "old") ->> 'warehouse_id')::uuid)
        else true
      end);
  end if;
end
$$;

revoke all on table public.receipts, public.receipt_lines, public.receipt_amounts, public.receipt_line_amounts, public.receipt_charges,
  public.receipt_charge_lines, public.receipt_charge_shares from anon, authenticated;
grant select on table public.receipts, public.receipt_lines, public.receipt_amounts, public.receipt_line_amounts, public.receipt_charges,
  public.receipt_charge_lines, public.receipt_charge_shares to authenticated;
-- المعرّف يولد بالجهاز للرأس والسطر والتحميل (FOUNDATION ١٩٩): حفظ يُعاد بعد جواب ضاع يرجع 23505 بدل صفّ ثاني.
grant insert (id, party_id, warehouse_id, received_on, note, status) on public.receipts to authenticated;
grant update (party_id, received_on, note, status) on public.receipts to authenticated;
grant insert (id, doc_id, item_id, item_unit_id, unit_code, qty_in_unit, expiry_on, born_at, supplier_lot_no) on public.receipt_lines to authenticated;
grant update (item_id, item_unit_id, unit_code, qty_in_unit, expiry_on, born_at, supplier_lot_no) on public.receipt_lines to authenticated;
grant insert (doc_id, discount, paid_now, cash_account_id) on public.receipt_amounts to authenticated;
grant update (discount, paid_now, cash_account_id) on public.receipt_amounts to authenticated;
grant insert (line_id, line_total, zero_reason) on public.receipt_line_amounts to authenticated;
grant update (line_total, zero_reason) on public.receipt_line_amounts to authenticated;
grant insert (id, doc_id, label, amount, allocate_by, payee_party_id, cash_account_id) on public.receipt_charges to authenticated;
grant update (label, amount, allocate_by, payee_party_id, cash_account_id) on public.receipt_charges to authenticated;
revoke truncate on table public.receipts, public.receipt_lines, public.receipt_amounts, public.receipt_line_amounts, public.receipt_charges,
  public.receipt_charge_lines, public.receipt_charge_shares from service_role;

-- ─── المساعدات ─────────────────────────────────────────────────────────────────────────────────────────────────
-- صفوف المستند قبل رأسه (§2.3، درس WP5): السطور ومبالغها ورأس المبالغ والتحميلات واختيارها، بترتيب ثابت. حارس كل صفّ منها يقفل الرأس
-- بعد صفّه، فالترحيل اللي يكتب المحسوب عليها لازم يمسكها قبل الرأس، وإلا يتعاكس ويّا تعديل مباشر (40P01).
create or replace function private.lock_receipt_rows(p_doc uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  set local lock_timeout = '5s';
  perform 1 from public.receipt_lines x where x.org_id = public.auth_org() and x.doc_id = p_doc order by x.id for no key update;
  perform 1 from public.receipt_line_amounts x where x.org_id = public.auth_org() and x.doc_id = p_doc order by x.line_id for no key update;
  perform 1 from public.receipt_amounts x where x.org_id = public.auth_org() and x.doc_id = p_doc for no key update;
  perform 1 from public.receipt_charges x where x.org_id = public.auth_org() and x.doc_id = p_doc order by x.id for no key update;
  perform 1 from public.receipt_charge_lines x where x.org_id = public.auth_org() and x.doc_id = p_doc order by x.charge_id, x.line_id for no key update;
end
$$;

-- مشكلة سطر استلام (FOUNDATION ٥٥٠، Q5، E21): أوّل رمز أو null، نفس الفحص بالمعاينة وبالترحيل. بلا قيم أبداً (التلميح يوصل للأمين).
create or replace function private.receipt_line_problem(p_wh public.warehouses, p_doc public.receipts, p_line public.receipt_lines) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  i public.items;
begin
  select * into i from public.items where org_id = public.auth_org() and id = p_line.item_id;
  -- كمية السطر بوحدة أساس لقطته (E46): المادّة غيّرت وحدتها بعده (ما يمنعه شي ومسوّدتها مفتوحة)، فالدفعة تنخلق بوحدة غير اللي انكتبت
  -- (5 طنّ = 5,000 لتر). الترحيل يقفل المادّة for share (lock_masters) قبل هذا الفحص، فما تتغيّر بعده.
  if p_line.base_unit is distinct from i.base_unit then
    return jsonb_build_object('code', 'base_unit_changed', 'hint', format('تغيّرت وحدة أساس «%s» بعد كتابة سطرها؛ احذف السطر وأعد كتابته.', i.name));
  end if;
  -- وحدة التعبئة تنفحص وقت كتابة السطر، والمورّد أو وحدته يتغيّران بعدها (رأس المسوّدة حرّ، و«للشراء» تنطفي).
  if p_line.item_unit_id is not null and not exists (
    select 1 from public.item_units u where u.org_id = p_doc.org_id and u.id = p_line.item_unit_id and u.for_purchase and (u.party_id is null or u.party_id = p_doc.party_id)
  ) then
    return jsonb_build_object('code', 'unit_mismatch', 'hint', format('«%s» في سطر «%s» ليست وحدة شراء من مورّد هذا الاستلام؛ احذف السطر وأعد كتابته بوحدة شراء عامّة أو خاصّة بالمورّد.', p_line.unit_label, i.name));
  end if;
  if not private.item_admissible(p_wh.kind, i.kind) then
    return jsonb_build_object('code', 'item_kind_mismatch', 'hint', format('«%s» لا يُخزَّن في «%s»: نوع المادّة لا يناسب نوع المخزن.', i.name, p_wh.name));
  end if;
  if not (p_wh.kind = any (private.receiving_kinds(i.kind))) then
    return jsonb_build_object('code', 'wrong_receiving_store', 'hint', format('«%s» لا تُستلم من المورّد في «%s»؛ تُستلم في مخزن الوحدة صاحبة نوعها ثم تُحوَّل.', i.name, p_wh.name));
  end if;
  if i.base_unit = 'pc' and p_line.qty_base <> trunc(p_line.qty_base) then
    return jsonb_build_object('code', 'pieces_not_whole', 'hint', format('«%s» تُعدّ بالقطعة، والكمية عدد صحيح.', i.name));
  end if;
  if i.tracks_expiry and p_line.expiry_on is null then
    return jsonb_build_object('code', 'expiry_required', 'hint', format('اكتب تاريخ انتهاء «%s».', i.name));
  end if;
  if not i.tracks_expiry and p_line.expiry_on is not null then
    return jsonb_build_object('code', 'expiry_not_tracked', 'hint', format('«%s» لا تتابع تاريخ الانتهاء؛ احذف التاريخ أو فعّل متابعته من بطاقة المادّة.', i.name));
  end if;
  if i.kind = 'chick' and p_line.born_at is null then
    return jsonb_build_object('code', 'born_at_required', 'hint', format('اكتب وقت فقس «%s».', i.name));
  end if;
  if i.kind <> 'chick' and p_line.born_at is not null then
    return jsonb_build_object('code', 'born_at_not_chick', 'hint', format('«%s» ليست أفراخاً، فلا وقت فقس لها؛ احذف وقت الفقس.', i.name));
  end if;
  if p_line.born_at > now() then
    return jsonb_build_object('code', 'born_at_future', 'hint', format('وقت فقس «%s» بعد الآن؛ اكتب وقتاً مضى.', i.name));
  end if;
  -- منتهٍ يوم الاستلام (Q5): يرفض إلا إذا رحّله المدير (expired.release)، والتحذير بالمعاينة.
  if private.lot_expired(i.tracks_expiry, p_line.expiry_on, p_doc.received_on) and not public.can('expired.release') then
    return jsonb_build_object('code', 'expired_on_receipt', 'hint', format('«%s» منتهية في %s قبل يوم الاستلام %s؛ لا يُستلم المنتهي إلا بترحيل المدير.',
      i.name, to_char(p_line.expiry_on, 'DD/MM/YYYY'), to_char(p_doc.received_on, 'DD/MM/YYYY')));
  end if;
  return null;
end
$$;

-- رفض بمشكلة محسوبة ({code, hint}): رموز الاستلام هنا، والباقي من raise_problem (0008). المعاينة تعرض نفس المشكلة.
create or replace function private.raise_receipt_problem(p_problem jsonb) returns void
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare
  v_hint text := p_problem ->> 'hint';
begin
  if p_problem is null or jsonb_typeof(p_problem) = 'null' then
    return;
  end if;
  case p_problem ->> 'code'
    when 'wrong_receiving_store' then raise exception 'wrong_receiving_store' using hint = coalesce(v_hint, 'هذه المادّة لا تُستلم في هذا المخزن.');
    when 'expired_on_receipt' then raise exception 'expired_on_receipt' using hint = coalesce(v_hint, 'المنتهي لا يُستلم إلا بترحيل المدير.');
    when 'discount_exceeds_total' then raise exception 'discount_exceeds_total' using hint = coalesce(v_hint, 'الخصم أكبر من مجموع السطور.');
    when 'paid_exceeds_total' then raise exception 'paid_exceeds_total' using hint = coalesce(v_hint, 'المدفوع أكبر من صافي الفاتورة.');
    when 'cash_account_required' then raise exception 'cash_account_required' using hint = coalesce(v_hint, 'اختر الصندوق.');
    when 'charge_lines_required' then raise exception 'charge_lines_required' using hint = coalesce(v_hint, 'اختر سطور التحميل.');
    when 'no_mass' then raise exception 'no_mass' using hint = coalesce(v_hint, 'سطر بلا وزن معروف؛ وزّع بالقيمة أو اختر السطور.');
    when 'zero_weights' then raise exception 'zero_weights' using hint = coalesce(v_hint, 'مجموع الأوزان صفر.');
    when 'party_archived' then raise exception 'party_archived' using hint = coalesce(v_hint, 'الجهة مؤرشفة.');
    when 'base_unit_changed' then raise exception 'base_unit_changed' using hint = coalesce(v_hint, 'تغيّرت وحدة أساس المادّة بعد كتابة السطر؛ أعد كتابته.');
    when 'unit_mismatch' then raise exception 'unit_mismatch' using hint = coalesce(v_hint, 'وحدة السطر ليست وحدة شراء من هذا المورّد.');
    else perform private.raise_problem(p_problem);
  end case;
end
$$;

-- حساب الاستلام (القواعد 10 و11 و25، FOUNDATION ٤٧٢–٤٧٣، ٤٩٣؛ Q7، Q8، E46): نفس الدالّة للمعاينة والترحيل (DV-805). حصّة الخصم
-- = أكبر الباقي بالفلس حسب مبلغ السطر؛ وكل تحميل بأكبر الباقي بالفلس على سطوره بالكتلة (اللتر بكثافة لقطته، والقطعة بوزن لقطتها)
-- أو بالقيمة (مبلغ السطر كما بالفاتورة، Q8)؛ وقيمة الدفعة = المبلغ − حصّة الخصم + حصص التحميلات؛ وصافي المورّد = Σ السطور − الخصم
-- (دينار صحيح). أوّل مشكلة بـproblem (ما ترفض هنا)، والمبالغ نصوص عشرية. مال كلّه: للمتّصل اللي يرى الكلفة بس.
create or replace function private.receipt_valuation(p_doc uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  ln record;
  c record;
  v_ids uuid[] := '{}';
  v_names text[] := '{}';
  v_totals numeric[] := '{}';
  v_mass numeric[] := '{}';
  v_charge numeric[] := '{}';
  v_disc numeric[];
  v_sum numeric := 0;
  v_discount numeric;
  v_paid numeric;
  v_box uuid;
  v_w numeric[];
  v_pos int[];
  v_sh numeric[];
  v_missing text;
  v_charges jsonb := '[]'::jsonb;
  v_charges_total numeric := 0;
  v_lines jsonb := '[]'::jsonb;
  v_problem jsonb;
  n int;
  k int;
begin
  for ln in
    select x.id, x.qty_base, x.density_kg_per_l, x.piece_mass_kg, i.name, x.base_unit, a.line_total, a.zero_reason, a.id is not null as priced
    from public.receipt_lines x
    join public.items i on i.org_id = x.org_id and i.id = x.item_id
    left join public.receipt_line_amounts a on a.org_id = x.org_id and a.line_id = x.id
    where x.org_id = v_org and x.doc_id = p_doc
    order by x.line_no
  loop
    if v_problem is null and not ln.priced then
      v_problem := jsonb_build_object('code', 'value_required', 'hint', format('اكتب مبلغ سطر «%s» كما في فاتورة المورّد.', ln.name));
    elsif v_problem is null and ln.line_total = 0 and ln.zero_reason is null then
      v_problem := jsonb_build_object('code', 'value_required', 'hint', format('مبلغ «%s» صفر؛ الصفر يُقبل مع سببه فقط (بضاعة مجانية مثلاً).', ln.name));
    end if;
    v_ids := v_ids || ln.id;
    v_names := v_names || ln.name;
    v_totals := v_totals || coalesce(ln.line_total, 0);
    v_sum := v_sum + coalesce(ln.line_total, 0);
    v_mass := v_mass || (case ln.base_unit
      when 'kg' then ln.qty_base
      when 'L' then case when ln.density_kg_per_l is not null then private.liters_to_kg(ln.qty_base, ln.density_kg_per_l) end
      else case when ln.piece_mass_kg is not null then round(ln.qty_base * ln.piece_mass_kg, 3) end
    end);
    v_charge := v_charge || 0::numeric;
  end loop;
  n := cardinality(v_ids);
  select a.discount, a.paid_now, a.cash_account_id into v_discount, v_paid, v_box
  from public.receipt_amounts a where a.org_id = v_org and a.doc_id = p_doc;
  v_discount := coalesce(v_discount, 0);
  v_paid := coalesce(v_paid, 0);
  if v_problem is null and v_discount > v_sum then
    v_problem := jsonb_build_object('code', 'discount_exceeds_total', 'hint', format('خصم الفاتورة %s أكبر من مجموع سطورها %s.',
      to_char(v_discount, 'FM999,999,999,999,990'), to_char(v_sum, 'FM999,999,999,999,990')));
  end if;
  if v_discount > 0 and v_discount <= v_sum then
    v_disc := private.alloc_lr(v_discount, v_totals, 2);
  else
    v_disc := array_fill(0::numeric, array[n]);
  end if;
  for c in select x.* from public.receipt_charges x where x.org_id = v_org and x.doc_id = p_doc order by x.charge_no loop
    v_w := '{}';
    v_pos := '{}';
    v_sh := null;
    v_missing := null;
    for k in 1 .. n loop
      continue when not c.all_lines and not exists (
        select 1 from public.receipt_charge_lines y where y.org_id = v_org and y.charge_id = c.id and y.line_id = v_ids[k]);
      v_pos := v_pos || k;
      if c.allocate_by = 'mass' then
        if v_mass[k] is null and v_missing is null then
          v_missing := v_names[k];
        end if;
        v_w := v_w || coalesce(v_mass[k], 0);
      else
        v_w := v_w || v_totals[k];
      end if;
    end loop;
    v_charges_total := v_charges_total + c.amount;
    if cardinality(v_pos) = 0 then
      if v_problem is null then
        v_problem := jsonb_build_object('code', 'charge_lines_required', 'hint', format('التحميل «%s» لم يبقَ له سطر مختار؛ اختر سطوره من جديد أو وزّعه على كل السطور.', c.label));
      end if;
    elsif v_missing is not null then
      if v_problem is null then
        v_problem := jsonb_build_object('code', 'no_mass', 'hint', format('«%s» ليس لها وزن معروف، فلا يُوزَّع التحميل «%s» بالوزن — وزّعه بالقيمة أو اختر السطور.', v_missing, c.label));
      end if;
    elsif (select sum(x) from unnest(v_w) as x) = 0 then
      if v_problem is null then
        v_problem := jsonb_build_object('code', 'zero_weights', 'hint', format('مجموع أوزان السطور للتحميل «%s» صفر، فلا يُوزَّع عليها. وزّعه بأساس آخر أو اختر سطوراً لها وزن.', c.label));
      end if;
    else
      v_sh := private.alloc_lr(c.amount, v_w, 2);
      for k in 1 .. cardinality(v_pos) loop
        v_charge[v_pos[k]] := v_charge[v_pos[k]] + v_sh[k];
      end loop;
    end if;
    v_charges := v_charges || jsonb_build_array(jsonb_build_object('charge_id', c.id, 'charge_no', c.charge_no, 'label', c.label,
      'amount', c.amount::text, 'allocate_by', c.allocate_by, 'all_lines', c.all_lines, 'payee_party_id', c.payee_party_id,
      'cash_account_id', c.cash_account_id,
      'shares', case when v_sh is null then '[]'::jsonb else (
        select jsonb_agg(jsonb_build_object('line_id', v_ids[v_pos[s.k]], 'share', v_sh[s.k]::text) order by s.k)
        from generate_subscripts(v_pos, 1) as s(k)) end));
  end loop;
  for k in 1 .. n loop
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('line_id', v_ids[k], 'mass_kg', v_mass[k]::text, 'line_total', v_totals[k]::text,
      'discount_share', v_disc[k]::text, 'charge_share', v_charge[k]::text, 'value', (v_totals[k] - v_disc[k] + v_charge[k])::text));
  end loop;
  if v_problem is null and v_paid > v_sum - v_discount then
    v_problem := jsonb_build_object('code', 'paid_exceeds_total', 'hint', format('المدفوع عند الاستلام %s أكبر من صافي الفاتورة %s.',
      to_char(v_paid, 'FM999,999,999,999,990'), to_char(v_sum - v_discount, 'FM999,999,999,999,990')));
  end if;
  if v_problem is null and v_paid > 0 and v_box is null then
    v_problem := jsonb_build_object('code', 'cash_account_required', 'hint', 'اختر الصندوق الذي دُفع منه المبلغ عند الاستلام.');
  end if;
  return jsonb_build_object('problem', v_problem, 'lines', v_lines, 'charges', v_charges, 'lines_total', v_sum::text,
    'discount', v_discount::text, 'net', (v_sum - v_discount)::text, 'paid_now', v_paid::text, 'cash_account_id', v_box,
    'charges_total', v_charges_total::text);
end
$$;

-- جهات المستند (E9): المورّد وكل ناقل، بلا تكرار وبترتيب المعرّف.
create or replace function private.receipt_parties(p_doc uuid) returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct x.party_id order by x.party_id), '{}'::uuid[]) from (
    select r.party_id from public.receipts r where r.org_id = public.auth_org() and r.id = p_doc
    union all
    select c.payee_party_id from public.receipt_charges c where c.org_id = public.auth_org() and c.doc_id = p_doc and c.payee_party_id is not null
  ) as x
$$;

-- ─── الاستلام (FOUNDATION ٥٥٠–٥٥١) ─────────────────────────────────────────────────────────────────────────────
-- الترحيل (receipt.amounts): دفعة لكل سطر بقيمته المحسوبة وحركة receipt، وقيد purchase للمورّد = −الصافي بدفتر نوع المخزن (بلا قيد
-- للصافي صفر، E19)، وكل تحميل قيد purchase على ناقله بنفس الدفتر (يتوزّع) أو حركة صندوق، والمدفوع قيد payout وحركة صندوق يتوزّع على
-- قيد هذا الاستلام أوّلاً، وبعده متبقّي قيد المورّد على أي رصيد معاكس قائم من الأقدم (القاعدة 27). الأقفال (§2.3): المرجع ← الجهات
-- ← قفل الفترة وصفّ الوحدة ← صفوف المستند ← الرأس ← المخزن والمواد ← الأرصدة ← الصناديق ← عدّاد الدفعات ← عدّاد المستندات.
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

-- الإلغاء (void، FOUNDATION ٥٥١): عكس على نفس الدفعات بيوم الإلغاء (دفعة انسحب منها ← lot_consumed يسمّي المستند)، وقيد purchase عكسي
-- للمورّد ولكل ناقل يتزوّج بأصله بعد فكّ توزيعاته، والقيود اللي انفكّت ترجع تتوزّع (القاعدة 27). المدفوع يبقى payout فيصير المورّد
-- «عليه»، والصحيح بمبلغ غلط يُلغى دفعه بـvoid_party_payment بدل إلغاء الاستلام (E44). تحميل دُفع من صندوق بلا جهة يصير مصروف تعديل
-- «استلام ملغى» يشير لحركته بلا حركة جديدة (E10). العكس يمرّ حتى لو المورّد أو المادّة أو المخزن انؤرشف (E43).
create or replace function public.void_receipt(p_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_receipt';
  v_cached jsonb;
  v_reason text;
  d public.receipts;
  w public.warehouses;
  l public.stock_lots;
  mv public.stock_moves;
  e public.party_entries;
  m public.cash_moves;
  v_items uuid[];
  v_parties uuid[];
  v_category uuid;
  v_back jsonb := '[]'::jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into d from public.receipts where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(d.warehouse_id, true);
  v_parties := private.receipt_parties(d.id);
  perform private.lock_parties(v_parties);
  perform private.check_void_date();
  select * into d from public.receipts where org_id = w.org_id and id = p_id for update;
  if d.status = 'void' then
    raise exception 'already_void' using hint = 'هذا الاستلام ملغى من قبل.';
  end if;
  if d.status <> 'posted' then
    raise exception 'not_posted' using hint = 'هذا الاستلام مسوّدة لم تُرحَّل؛ تُطوى المسوّدة بدل إلغائها.';
  end if;
  -- الجهات انقرت بلا قفل (E9): مسوّدة غيّرت ناقلها ورُحّلت قبل قفل المستند تكتب قيداً لجهة ما انقفلت، فتنفحص بعده.
  if not (private.receipt_parties(d.id) <@ v_parties) then
    raise exception 'stale_draft' using hint = 'تغيّر الاستلام أثناء الإلغاء. حدّث الشاشة وأعد المحاولة.';
  end if;
  perform private.book_for_post(d.book_id);
  select array_agg(distinct x.item_id) into v_items from public.stock_lots x where x.org_id = d.org_id and x.source_kind = 'receipt' and x.source_id = d.id;
  perform private.lock_masters(array[w.id], v_items, false);
  perform private.lock_balances(v_items, array_fill(w.id, array[cardinality(v_items)]));
  for l in select * from public.stock_lots x where x.org_id = d.org_id and x.source_kind = 'receipt' and x.source_id = d.id order by x.id for no key update loop
    perform private.check_lot_intact(l.id);
  end loop;
  for mv in
    select x.* from public.stock_moves x
    where x.org_id = d.org_id and x.doc_kind = 'receipt' and x.doc_id = d.id and x.reverses_move_id is null
    order by x.item_id, x.seq
  loop
    perform private.apply_move(mv.lot_id, 'receipt', d.id, mv.doc_line_id, -mv.qty, -mv.value, public.app_today(), mv.id);
    v_back := v_back || jsonb_build_array(mv.lot_id);
  end loop;
  for e in
    select x.* from public.party_entries x
    where x.org_id = d.org_id and x.doc_kind = 'receipt' and x.doc_id = d.id and x.kind = 'purchase' and x.reverses_entry_id is null
      and not exists (select 1 from public.party_entries r where r.org_id = x.org_id and r.reverses_entry_id = x.id)
    order by x.party_id, x.seq
  loop
    perform private.void_entry(e.id, v_reason);
  end loop;
  select x.id into v_category from public.expense_categories x where x.org_id = d.org_id and x.system_code = 'voided_receipt';
  for m in
    select x.* from public.cash_moves x
    where x.org_id = d.org_id and x.doc_kind = 'receipt' and x.doc_id = d.id and x.kind = 'receipt_charge' and x.reverses_move_id is null
    order by x.account_id, x.seq
  loop
    insert into public.expenses (org_id, category_id, division_id, amount, on_date, for_month, source, doc_kind, doc_id, cash_move_id, note)
    values (d.org_id, v_category, w.division_id, -m.amount, public.app_today(), date_trunc('month', public.app_today())::date, 'adjustment',
      'receipt', d.id, m.id, m.note);
  end loop;
  update public.receipts set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
  where org_id = d.org_id and id = d.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'kind', 'receipt', 'status', 'void', 'doc_no', d.doc_no,
    'reversed_lots', v_back));
end
$$;

-- المعاينة (receipt.draft أو receipt.amounts): نفس الحساب بلا كتابة ولا قفل (FOUNDATION ٧٧٠)؛ الكميات للأمين، والمال (الحساب كلّه
-- ومشكلته) لأدوار الكلفة بس. الدفتر من نوع المخزن كما راح ينكتب.
create or replace function public.preview_receipt(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d public.receipts;
  w public.warehouses;
  pt public.parties;
  v_arch record;
  v_cost boolean := public.can_see_cost();
  v_problems jsonb := '[]'::jsonb;
  v_lines jsonb;
  v_date jsonb;
  v_val jsonb;
begin
  perform private.require(case when public.can('receipt.draft') then 'receipt.draft' else 'receipt.amounts' end);
  select * into d from public.receipts where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(d.warehouse_id, true);
  if d.status <> 'draft' then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'not_draft', 'hint', 'هذا المستند ليس مسوّدة.'));
  end if;
  v_date := private.date_problem(d.received_on, w.division_id, false);
  if v_date is not null then
    v_problems := v_problems || jsonb_build_array(v_date);
  end if;
  if w.archived_at is not null then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'warehouse_archived', 'hint', format('المخزن «%s» مؤرشف.', w.name)));
  end if;
  select * into pt from public.parties where org_id = d.org_id and id = d.party_id;
  if pt.archived_at is not null then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'party_archived', 'hint', format('المورّد «%s» مؤرشف.', pt.name)));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('line_id', x.id, 'line_no', x.line_no, 'item_id', x.item_id, 'item_name', i.name,
      'base_unit', x.base_unit, 'unit_label', x.unit_label, 'qty_in_unit', x.qty_in_unit::text, 'qty', x.qty_base::text,
      'expiry_on', x.expiry_on, 'born_at', x.born_at, 'supplier_lot_no', x.supplier_lot_no,
      'problem', coalesce(private.receipt_line_problem(w, d, x),
        case when i.archived_at is not null then jsonb_build_object('code', 'item_archived', 'hint', format('المادّة «%s» مؤرشفة.', i.name)) end),
      'warning', case when private.lot_expired(i.tracks_expiry, x.expiry_on, d.received_on) then jsonb_build_object('code', 'expired_on_receipt',
        'hint', format('«%s» منتهية في %s قبل يوم الاستلام؛ تدخل المخزن منتهية ولا تُصرف إلا بإتلاف أو مرتجع.', i.name, to_char(x.expiry_on, 'DD/MM/YYYY'))) end
    ) order by x.line_no), '[]'::jsonb)
  into v_lines
  from public.receipt_lines x join public.items i on i.org_id = x.org_id and i.id = x.item_id
  where x.org_id = d.org_id and x.doc_id = d.id;
  if v_cost then
    for v_arch in
      select 'party_archived' as code, format('الناقل «%s» مؤرشف، فلا يُسجَّل عليه قيد جديد. أعِده من الأرشيف أوّلاً.', p2.name) as hint
      from public.receipt_charges c2 join public.parties p2 on p2.org_id = c2.org_id and p2.id = c2.payee_party_id
      where c2.org_id = d.org_id and c2.doc_id = d.id and p2.archived_at is not null
      union all
      select 'cash_account_archived', format('الصندوق «%s» مؤرشف، فلا تُسجَّل فيه حركة جديدة. أعِده من الأرشيف أوّلاً.', a.name)
      from public.cash_accounts a
      where a.org_id = d.org_id and a.archived_at is not null and a.id in (
        select ra.cash_account_id from public.receipt_amounts ra where ra.org_id = d.org_id and ra.doc_id = d.id and ra.paid_now > 0
        union
        select c3.cash_account_id from public.receipt_charges c3 where c3.org_id = d.org_id and c3.doc_id = d.id)
    loop
      v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', v_arch.code, 'hint', v_arch.hint));
    end loop;
    v_val := private.receipt_valuation(d.id);
    if jsonb_typeof(v_val -> 'problem') = 'object' then
      v_problems := v_problems || jsonb_build_array(v_val -> 'problem');
    end if;
  end if;
  return private.mask(jsonb_build_object('id', d.id, 'kind', 'receipt', 'status', d.status, 'version', d.version, 'party_id', d.party_id,
    'warehouse_id', w.id, 'book_id', private.receipt_book(w.id), 'received_on', d.received_on, 'problems', v_problems, 'lines', v_lines,
    'ready', v_cost and jsonb_array_length(v_problems) = 0 and jsonb_array_length(v_lines) > 0
      and not exists (select 1 from jsonb_array_elements(v_lines) as x where x.value -> 'problem' <> 'null'::jsonb),
    'money', v_val));
end
$$;

-- حذف تحميل (receipt.amounts، §2.5، E52): التحميل ثم اختياره ثم الرأس، بشرط النسخة، والنسخة تزيد. اللي انحذف من قبل يرجّع deleted: false.
create or replace function public.delete_receipt_charge(p_charge_id uuid, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_doc uuid;
  v_status text;
  v_version int;
  v_wh uuid;
begin
  set local lock_timeout = '5s';
  perform private.require('receipt.amounts');
  select doc_id into v_doc from public.receipt_charges where org_id = public.auth_org() and id = p_charge_id for update;
  if v_doc is null then
    return jsonb_build_object('charge_id', p_charge_id, 'deleted', false);
  end if;
  perform 1 from public.receipt_charge_lines where org_id = public.auth_org() and charge_id = p_charge_id order by line_id for update;
  select status, version, warehouse_id into v_status, v_version, v_wh from public.receipts where org_id = public.auth_org() and id = v_doc for update;
  perform private.stock_wh(v_wh, true);
  if v_status <> 'draft' then
    raise exception 'not_draft' using hint = 'الاستلام مرحَّل أو ملغى؛ لا تُحذف تحميلاته.';
  end if;
  if p_expected_version is null or v_version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّرت المسوّدة بعد فتحها. حدّث الشاشة وأعد المحاولة.';
  end if;
  delete from public.receipt_charge_lines where org_id = public.auth_org() and charge_id = p_charge_id;
  delete from public.receipt_charges where org_id = public.auth_org() and id = p_charge_id;
  update public.receipts set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  return jsonb_build_object('charge_id', p_charge_id, 'deleted', true, 'doc_id', v_doc, 'version', v_version + 1);
end
$$;

-- اختيار سطور التحميل (receipt.amounts، §2.5): يستبدل الاختيار كلّه؛ الفارغ = كل السطور. التحميل ثم السطور المختارة (للمشاركة، قبل
-- الرأس مثل حذف السطر) ثم الاختيار القديم ثم الرأس، بشرط النسخة، والنسخة تزيد.
create or replace function public.set_charge_lines(p_charge_id uuid, p_line_ids uuid[], p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.receipt_charges;
  v_ids uuid[];
  v_status text;
  v_version int;
begin
  set local lock_timeout = '5s';
  perform private.require('receipt.amounts');
  select * into c from public.receipt_charges where org_id = public.auth_org() and id = p_charge_id for update;
  if c.id is null then
    raise exception 'charge_not_found' using hint = 'هذا التحميل غير موجود أو حُذف. حدّث الشاشة.';
  end if;
  v_ids := array(select distinct x from unnest(coalesce(p_line_ids, '{}'::uuid[])) as x where x is not null order by 1);
  perform 1 from public.receipt_lines where org_id = c.org_id and doc_id = c.doc_id and id = any (v_ids) order by id for key share;
  perform 1 from public.receipt_charge_lines where org_id = c.org_id and charge_id = c.id order by line_id for update;
  select status, version into v_status, v_version from public.receipts where org_id = c.org_id and id = c.doc_id for update;
  perform private.stock_wh(c.warehouse_id, true);
  if v_status <> 'draft' then
    raise exception 'not_draft' using hint = 'الاستلام مرحَّل أو ملغى؛ لا تتغيّر تحميلاته.';
  end if;
  if p_expected_version is null or v_version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّرت المسوّدة بعد فتحها. حدّث الشاشة وأعد المحاولة.';
  end if;
  if (select count(*) from public.receipt_lines x where x.org_id = c.org_id and x.doc_id = c.doc_id and x.id = any (v_ids)) <> cardinality(v_ids) then
    raise exception 'line_not_found' using hint = 'أحد السطور المختارة ليس من هذا الاستلام أو حُذف. حدّث الشاشة واختر من جديد.';
  end if;
  delete from public.receipt_charge_lines where org_id = c.org_id and charge_id = c.id;
  insert into public.receipt_charge_lines (org_id, doc_id, warehouse_id, charge_id, line_id)
  select c.org_id, c.doc_id, c.warehouse_id, c.id, x from unnest(v_ids) as x;
  update public.receipt_charges set all_lines = (cardinality(v_ids) = 0)
  where org_id = c.org_id and id = c.id and all_lines is distinct from (cardinality(v_ids) = 0);
  update public.receipts set version = version + 1 where org_id = c.org_id and id = c.doc_id;
  return jsonb_build_object('charge_id', c.id, 'line_ids', to_jsonb(v_ids), 'all_lines', cardinality(v_ids) = 0, 'doc_id', c.doc_id,
    'version', v_version + 1);
end
$$;

-- ─── المسوّدات: الطيّ وحذف السطر (§2.5، E13، E52): نفس التوقيع، ويزيد الاستلام ─────────────────────────────────────────
-- الطيّ: مسوّدة الاستلام void بلا رقم ولا حركات لمن عنده receipt.draft. حذف سطرها يحذف مبلغه واختيار تحميلاته قبله.
create or replace function public.discard_draft(p_doc_kind text, p_id uuid, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_status text;
  v_version int;
  v_wh uuid;
begin
  set local lock_timeout = '5s';
  if p_doc_kind = 'opening' then
    perform private.require('opening.post');
    select status, version, warehouse_id into v_status, v_version, v_wh from public.opening_docs
    where org_id = public.auth_org() and id = p_id for update;
  elsif p_doc_kind = 'transfer' then
    perform private.require('transfer.post');
    select status, version, from_warehouse_id into v_status, v_version, v_wh from public.transfers
    where org_id = public.auth_org() and id = p_id for update;
  elsif p_doc_kind = 'stock_use' then
    perform private.require('stock_use.post');
    select status, version, warehouse_id into v_status, v_version, v_wh from public.stock_uses
    where org_id = public.auth_org() and id = p_id for update;
  elsif p_doc_kind = 'count' then
    select status, version, warehouse_id into v_status, v_version, v_wh from public.stock_counts
    where org_id = public.auth_org() and id = p_id for update;
    perform private.require(case when v_status = 'submitted' then 'count.approve' else 'count.enter' end);
  elsif p_doc_kind = 'receipt' then
    perform private.require('receipt.draft');
    select status, version, warehouse_id into v_status, v_version, v_wh from public.receipts
    where org_id = public.auth_org() and id = p_id for update;
  else
    raise exception 'doc_kind_unknown' using hint = 'نوع المستند غير معروف.';
  end if;
  if v_status is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  perform private.stock_wh(v_wh, true);
  if v_status <> 'draft' and not (p_doc_kind = 'count' and v_status = 'submitted') then
    raise exception 'not_draft' using hint = 'هذا المستند ليس مسوّدة: رُحّل أو أُلغي من قبل.';
  end if;
  if p_expected_version is null or v_version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّرت المسوّدة بعد فتحها. حدّث الشاشة وأعد المحاولة.';
  end if;
  if p_doc_kind = 'opening' then
    update public.opening_docs set status = 'void', voided_at = now(), voided_by = auth.uid(), version = version + 1
    where org_id = public.auth_org() and id = p_id;
  elsif p_doc_kind = 'transfer' then
    update public.transfers set status = 'void', voided_at = now(), voided_by = auth.uid(), version = version + 1
    where org_id = public.auth_org() and id = p_id;
  elsif p_doc_kind = 'stock_use' then
    update public.stock_uses set status = 'void', voided_at = now(), voided_by = auth.uid(), version = version + 1
    where org_id = public.auth_org() and id = p_id;
  elsif p_doc_kind = 'receipt' then
    update public.receipts set status = 'void', voided_at = now(), voided_by = auth.uid(), version = version + 1
    where org_id = public.auth_org() and id = p_id;
  else
    update public.stock_counts set status = 'void', voided_at = now(), voided_by = auth.uid(), version = version + 1
    where org_id = public.auth_org() and id = p_id;
  end if;
  return jsonb_build_object('id', p_id, 'kind', p_doc_kind, 'status', 'void', 'version', v_version + 1);
end
$$;

create or replace function public.delete_draft_line(p_doc_kind text, p_line_id uuid, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_doc uuid;
  v_status text;
  v_version int;
  v_wh uuid;
begin
  set local lock_timeout = '5s';
  -- السطر أوّلاً ثم رأسه، بنفس ترتيب تعديله المباشر (بوستغريس يقفل الصفّ قبل ما مشغّله يقفل الرأس)، وإلا حذف وتعديل لنفس السطر
  -- يقفلون بعض (40P01).
  if p_doc_kind = 'opening' then
    perform private.require('opening.post');
    select doc_id into v_doc from public.opening_lines where org_id = public.auth_org() and id = p_line_id for update;
  elsif p_doc_kind = 'transfer' then
    perform private.require('transfer.post');
    select doc_id into v_doc from public.transfer_lines where org_id = public.auth_org() and id = p_line_id for update;
  elsif p_doc_kind = 'stock_use' then
    perform private.require('stock_use.post');
    select doc_id into v_doc from public.stock_use_lines where org_id = public.auth_org() and id = p_line_id for update;
  elsif p_doc_kind = 'count' then
    perform private.require('count.enter');
    select doc_id into v_doc from public.stock_count_lines where org_id = public.auth_org() and id = p_line_id for update;
    -- كلفة السطر قبل الرأس مثل حارس الكلفة (مراجعة WP5 الثانية): كانت تنقفل بالحذف بعد الرأس فتتعاكس ويّا كلفة يكتبها المدير (40P01).
    perform 1 from public.stock_count_line_costs where org_id = public.auth_org() and line_id = p_line_id for update;
  elsif p_doc_kind = 'receipt' then
    perform private.require('receipt.draft');
    select doc_id into v_doc from public.receipt_lines where org_id = public.auth_org() and id = p_line_id for update;
    -- مبلغ السطر واختيار تحميلاته قبل الرأس مثل حرّاسها (WP6): الأمين ما يشوفها، فحذفها المباشر كان يرفض 23503.
    perform 1 from public.receipt_line_amounts where org_id = public.auth_org() and line_id = p_line_id for update;
    perform 1 from public.receipt_charge_lines where org_id = public.auth_org() and line_id = p_line_id order by charge_id for update;
  else
    raise exception 'doc_kind_unknown' using hint = 'نوع المستند غير معروف.';
  end if;
  if v_doc is null then
    return jsonb_build_object('line_id', p_line_id, 'deleted', false);
  end if;
  if p_doc_kind = 'opening' then
    select status, version, warehouse_id into v_status, v_version, v_wh from public.opening_docs
    where org_id = public.auth_org() and id = v_doc for update;
  elsif p_doc_kind = 'transfer' then
    select status, version, from_warehouse_id into v_status, v_version, v_wh from public.transfers
    where org_id = public.auth_org() and id = v_doc for update;
  elsif p_doc_kind = 'stock_use' then
    select status, version, warehouse_id into v_status, v_version, v_wh from public.stock_uses
    where org_id = public.auth_org() and id = v_doc for update;
  elsif p_doc_kind = 'receipt' then
    select status, version, warehouse_id into v_status, v_version, v_wh from public.receipts
    where org_id = public.auth_org() and id = v_doc for update;
  else
    select status, version, warehouse_id into v_status, v_version, v_wh from public.stock_counts
    where org_id = public.auth_org() and id = v_doc for update;
  end if;
  perform private.stock_wh(v_wh, true);
  if v_status <> 'draft' then
    raise exception 'not_draft' using hint = 'المستند مرحَّل أو ملغى أو مسلَّم؛ لا تُحذف سطوره.';
  end if;
  if p_expected_version is null or v_version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّرت المسوّدة بعد فتحها. حدّث الشاشة وأعد المحاولة.';
  end if;
  if p_doc_kind = 'opening' then
    delete from public.opening_lines where org_id = public.auth_org() and id = p_line_id;
    update public.opening_docs set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  elsif p_doc_kind = 'transfer' then
    delete from public.transfer_lines where org_id = public.auth_org() and id = p_line_id;
    update public.transfers set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  elsif p_doc_kind = 'stock_use' then
    delete from public.stock_use_lines where org_id = public.auth_org() and id = p_line_id;
    update public.stock_uses set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  elsif p_doc_kind = 'receipt' then
    delete from public.receipt_charge_lines where org_id = public.auth_org() and line_id = p_line_id;
    delete from public.receipt_line_amounts where org_id = public.auth_org() and line_id = p_line_id;
    delete from public.receipt_lines where org_id = public.auth_org() and id = p_line_id;
    update public.receipts set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  else
    delete from public.stock_count_line_costs where org_id = public.auth_org() and line_id = p_line_id;
    delete from public.stock_count_lines where org_id = public.auth_org() and id = p_line_id;
    update public.stock_counts set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  end if;
  return jsonb_build_object('line_id', p_line_id, 'deleted', true, 'doc_id', v_doc, 'version', v_version + 1);
end
$$;

-- ─── الثوابت (FOUNDATION ٤٢٩–٤٣٠، الخطّة WP6): verify_stock كما بـ0008 ويزيد الاستلام: طرف الحفظ (8)، والمستند = حركاته (11)،
-- وروابط الخصم والتحميلات وقيمة الدفعة والقيود (14–17 = فحوص الخطّة 10–13، كل واحد بمسبار يكسر قيمة مخزونة) ──────────────────
create or replace function public.verify_stock() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  -- 1. لكل (مادّة، مخزن): الرصيد = Σ الحركات = Σ متبقّي الدفعات، كميةً وقيمةً؛ وحركة بلا صفّ رصيد مخالفة.
  with mv as (select org_id, item_id, warehouse_id, sum(qty) as q, sum(value) as v from public.stock_moves group by org_id, item_id, warehouse_id),
  lt as (select org_id, item_id, warehouse_id, sum(qty_left) as q, sum(value_left) as v from public.stock_lots group by org_id, item_id, warehouse_id),
  keys as (
    select org_id, item_id, warehouse_id from public.stock_balances
    union select org_id, item_id, warehouse_id from mv
    union select org_id, item_id, warehouse_id from lt
  )
  select 'balance_identity'::text, count(*) from keys k
  left join public.stock_balances b on b.org_id = k.org_id and b.item_id = k.item_id and b.warehouse_id = k.warehouse_id
  left join mv on mv.org_id = k.org_id and mv.item_id = k.item_id and mv.warehouse_id = k.warehouse_id
  left join lt on lt.org_id = k.org_id and lt.item_id = k.item_id and lt.warehouse_id = k.warehouse_id
  where b.id is null or b.qty <> coalesce(mv.q, 0) or b.value <> coalesce(mv.v, 0)
    or coalesce(lt.q, 0) <> coalesce(mv.q, 0) or coalesce(lt.v, 0) <> coalesce(mv.v, 0)
  union all
  -- 2. لكل دفعة: المتبقّي = Σ حركاتها الموقّعة، والداخل = حركتها الأصلية (وحدة بالضبط) + حركات التقييم (WP7).
  select 'lot_moves', count(*) from public.stock_lots l
  left join lateral (
    select coalesce(sum(m.qty), 0) as q, coalesce(sum(m.value), 0) as v,
      count(*) filter (where m.qty > 0 and m.reverses_move_id is null) as originals,
      sum(m.qty) filter (where m.qty > 0 and m.reverses_move_id is null) as q_in,
      sum(m.value) filter (where m.qty > 0 and m.reverses_move_id is null) as v_in,
      coalesce(sum(m.value) filter (where m.doc_kind = 'receipt_revalue'), 0) as revalued
    from public.stock_moves m where m.org_id = l.org_id and m.lot_id = l.id
  ) as s on true
  where l.qty_left <> s.q or l.value_left <> s.v or s.originals <> 1 or l.qty_in <> s.q_in or l.value_in <> s.v_in + s.revalued
  union all
  -- 3. شكل الدفعة: المتبقّي بين صفر والداخل وبلا فلس معلّق، والمعدود أعداد صحيحة، والأفراخ بوقت فقس وغيرها بلاه، والمرآة جذرها جذر بنفس
  --    الترتيب، والتحويل وحده بمصدر.
  select 'lot_shape', count(*) from public.stock_lots l
  join public.items i on i.org_id = l.org_id and i.id = l.item_id
  left join public.stock_lots o on o.org_id = l.org_id and o.id = l.origin_lot_id
  where l.qty_left < 0 or l.qty_left > l.qty_in or l.value_left < 0 or (l.qty_left = 0 and l.value_left <> 0)
    or (i.base_unit = 'pc' and (l.qty_in <> trunc(l.qty_in) or l.qty_left <> trunc(l.qty_left)))
    or (i.kind = 'chick' and l.born_at is null) or (i.kind <> 'chick' and l.born_at is not null)
    or (l.origin_lot_id is not null and (o.id is null or o.origin_lot_id is not null or o.fifo_seq <> l.fifo_seq))
    or ((l.source_kind = 'transfer') <> (l.source_lot_id is not null))
  union all
  -- 4. كل عكسية بنفس الدفعة ومستند أصلها وبكميته وقيمته المعاكستين، وأصلها مو عكسية.
  select 'reversal_pairs', count(*) from public.stock_moves r
  join public.stock_moves o on o.org_id = r.org_id and o.id = r.reverses_move_id
  where o.lot_id <> r.lot_id or o.qty <> -r.qty or o.value <> -r.value or o.reverses_move_id is not null
    or o.doc_kind <> r.doc_kind or o.doc_id <> r.doc_id or o.doc_line_id is distinct from r.doc_line_id
  union all
  -- 5. كل مرآة = قطعة مصدرها (نفس المستند والسطر، والكمية والقيمة المعاكستين)، وبنفس fifo_seq والانتهاء ووقت الفقس، وجذرها جذر مصدرها.
  select 'mirror_pairs', count(*) from public.stock_lots m
  join public.stock_lots s on s.org_id = m.org_id and s.id = m.source_lot_id
  left join lateral (
    select x.qty, x.value, x.doc_line_id from public.stock_moves x
    where x.org_id = m.org_id and x.lot_id = m.id and x.doc_kind = 'transfer' and x.doc_id = m.source_id and x.qty > 0 and x.reverses_move_id is null
  ) as mi on true
  left join lateral (
    select x.qty, x.value from public.stock_moves x
    where x.org_id = m.org_id and x.lot_id = s.id and x.doc_kind = 'transfer' and x.doc_id = m.source_id and x.doc_line_id = mi.doc_line_id
      and x.qty < 0 and x.reverses_move_id is null
  ) as mo on true
  where mi.qty is null or mo.qty is null or mo.qty <> -mi.qty or mo.value <> -mi.value or m.qty_in <> mi.qty or m.value_in <> mi.value
    or m.fifo_seq <> s.fifo_seq or m.expiry_on is distinct from s.expiry_on or m.born_at is distinct from s.born_at
    or m.origin_lot_id is distinct from coalesce(s.origin_lot_id, s.id) or m.item_id <> s.item_id
  union all
  -- 6. ماكو سحب من دفعة قبل استلامها، ولا من دفعة منتهية بيوم السحب (الاستثناءات الأربعة بحزمها: الدفعة المسمّاة بإذن المدير
  --    والإتلاف ونقص الجرد المنتهي من WP5، والمرتجع من WP7، وكلها تكتب expiry_checked = false).
  --    قاعدة الانتهاء بعلامة السحب نفسه (expiry_checked، يوم السحب)، والسحب الأصلي بلا علامة مخالفة (كل حزمة تكتبها).
  select 'draw_dates', count(*) from public.stock_moves m
  join public.stock_lots l on l.org_id = m.org_id and l.id = m.lot_id
  where m.qty < 0 and m.reverses_move_id is null
    and (m.expiry_checked is null or l.received_on > m.moved_on or private.lot_expired(m.expiry_checked, l.expiry_on, m.moved_on))
  union all
  -- 7. أهلية نوع المادّة بنوع المخزن لكل دفعة (FOUNDATION ٢٨٠–٢٨٣).
  select 'admissible', count(*) from public.stock_lots l
  join public.items i on i.org_id = l.org_id and i.id = l.item_id
  join public.warehouses w on w.org_id = l.org_id and w.id = l.warehouse_id
  where not private.item_admissible(w.kind, i.kind)
  union all
  -- 8. حفظ القيمة (FOUNDATION ٤٣٠) لكل منشأة، وكل طرف من مصدره بالمستند (مو مجموع حركات): الداخل = قيم الافتتاح المرحّلة
  --    + قيم زيادات الجرد المرحّل (لقطة stock_count_line_costs، E55) (+ الاستلامات WP6، وحصص التقييم WP7)؛ والخارج = Σ متبقّي
  --    الدفعات + صافي مصاريف المخزون (الصرف والإتلاف ونقص الجرد، المصدر stock) (+ المرتجع WP7). التحويل بلا طرف (الفحص 5). الملغى
  --    صفر بالطرفين (حركاته معكوسة ومصروفه بصفّ عكسي).
  select 'value_conservation', count(*) from (
    select o.id,
      coalesce((select sum(x.value) from public.opening_lines x join public.opening_docs d on d.org_id = x.org_id and d.id = x.doc_id
        where x.org_id = o.id and d.status = 'posted'), 0)
      + coalesce((select sum(c.gain_value) from public.stock_count_line_costs c join public.stock_counts k on k.org_id = c.org_id and k.id = c.doc_id
        where c.org_id = o.id and k.status = 'approved'), 0)
      + coalesce((select sum(a.line_total - a.discount_share + a.charge_share) from public.receipt_line_amounts a
        join public.receipts r on r.org_id = a.org_id and r.id = a.doc_id where a.org_id = o.id and r.status = 'posted'), 0) as inputs,
      coalesce((select sum(l.value_left) from public.stock_lots l where l.org_id = o.id), 0)
      + coalesce((select sum(e.amount) from public.expenses e where e.org_id = o.id and e.source = 'stock'), 0) as outputs
    from public.orgs o
  ) as x where x.inputs <> x.outputs
  union all
  -- E14: وحدة بيها حركة مخزون مختومة بأوّل ترحيل (first_posted_at)، فيوم تشغيلها متجمّد.
  select 'posted_division_stamped', count(*) from public.divisions d
  where d.first_posted_at is null
    and exists (select 1 from public.stock_moves m join public.warehouses w on w.org_id = m.org_id and w.id = m.warehouse_id
      where w.org_id = d.org_id and w.division_id = d.id)
  union all
  -- 9. قيمة كل سحب أصلي بالقاعدة 13 من حال دفعته قبله (حركاتها السابقة بترتيبها): كل المتبقّي = قيمته المتبقّية بالضبط، وإلا
  --    _mul_div_round2؛ وسحب أكثر من المتبقّي مخالفة. تقريب غلط بالمصدر ومرآته سوا (الطرفان متساويان) ما يشوفه الفحصان 1 و5.
  select 'draw_values', count(*) from (
    select m.qty, m.value, m.reverses_move_id,
      coalesce(sum(m.qty) over w, 0) as ql, coalesce(sum(m.value) over w, 0) as vl
    from public.stock_moves m
    window w as (partition by m.org_id, m.lot_id order by m.seq rows between unbounded preceding and 1 preceding)
  ) as x
  where x.qty < 0 and x.reverses_move_id is null
    and case when x.ql <= 0 or -x.qty > x.ql then true
      when -x.qty = x.ql then -x.value <> x.vl
      else -x.value <> private._mul_div_round2(-x.qty, x.vl, x.ql) end
  union all
  -- 10. ترتيب السحب (القاعدة 12): وقت كل قطعة سحب أصلية بالتحويل والصرف والجرد ماكو دفعة قبلها بالترتيب (الانتهاء والفارغ أخيراً،
  --     ثم fifo_seq، ثم المعرّف) مؤهّلة بتاريخ السحب (مستلمة بيه أو قبله، وغير منتهية للسحب اللي طبّق قاعدة الانتهاء) وبيها متبقٍّ
  --     قبل القطعة. نقص الجرد المنتهي (expiry_checked = false) يشوف كل الدفعات مؤهّلة، والصالحة كلها بعد المنتهية بالترتيب، فيبقى
  --     الأقدم انتهاءً أوّلاً. السحب من دفعة مسمّاة (إذن المنتهي والإتلاف، والمرتجع WP7) برّا الفحص.
  select 'draw_order', count(*) from public.stock_moves m
  join public.stock_lots l on l.org_id = m.org_id and l.id = m.lot_id
  where m.qty < 0 and m.reverses_move_id is null and m.doc_kind in ('transfer', 'stock_use', 'count')
    and not exists (select 1 from public.stock_use_lines u where m.doc_kind = 'stock_use' and u.org_id = m.org_id and u.id = m.doc_line_id and u.lot_id is not null)
    and exists (
      select 1 from public.stock_lots e
      where e.org_id = m.org_id and e.item_id = m.item_id and e.warehouse_id = m.warehouse_id and e.id <> l.id
        and e.received_on <= m.moved_on and not private.lot_expired(coalesce(m.expiry_checked, true), e.expiry_on, m.moved_on)
        and ((e.expiry_on is not null and (l.expiry_on is null or e.expiry_on < l.expiry_on))
          or (e.expiry_on is not distinct from l.expiry_on and (e.fifo_seq < l.fifo_seq or (e.fifo_seq = l.fifo_seq and e.id < l.id))))
        and (select coalesce(sum(x.qty), 0) from public.stock_moves x where x.org_id = e.org_id and x.lot_id = e.id and x.seq < m.seq) > 0)
  union all
  -- 11. المستند = حركاته. التحويل: سطر المرحَّل (والملغى بعد ترحيل) سحب كميته بالضبط من مخزنه المرسِل، والمرحَّل بلا عكسية، والملغى
  --     كل أصلية منه معكوسة، والمسوّدة والمطويّة بلا حركات؛ وكل حركة تحويل بسطر من مستند مرحَّل بنفس المادّة وبأحد مخزنيه، أصليتها
  --     سالبة بالمرسِل وموجبة بالمستلم. الافتتاح: سطر المرحَّل (والملغى بعد ترحيل) دفعة وحدة بالضبط بمادّته وكميته وقيمته (حتى
  --     الصفر) وتاريخه ومخزنه وانتهائه وفقسه، والمسوّدة والمطويّة بلا دفعة؛ وكل حركة افتتاح على دفعة سطرها، والمرحَّل بلا عكسية،
  --     والملغى كل أصلية منه معكوسة. يمسك سحباً ناقصاً، وإلغاءً ناقصاً، ودفعة افتتاح بغير كمية سطرها. الصرف (WP5): سطر المرحَّل
  --     سحب كميته بالضبط من مخزن رأسه (ومن دفعته المسمّاة بس إذا سمّاها)، وكل حركة صرف بسطر مرحَّل سالبة أصلاً. الجرد (WP5):
  --     سطر المرحَّل سحب نقصه بالضبط (المتاح والمنتهي) ودفعات زيادته بكميتها، والمسوّدة بلاهن؛ وكل حركة جرد بسطر مرحَّل، والموجبة
  --     الأصلية على دفعة زيادة سطرها. ومراجعة WP5: فرقا المرحَّل = المعدود − اللقطة؛ والنقص منقسم بانتهاء الدفعة بيوم الجرد (المادّة
  --     اللي تتابعه، لقطتها المنتهية مو فارغة): المتاح بعلامة الانتهاء والمنتهي بلاها، فسحب منتهٍ بلا علامة بغير «منتهي» السطر
  --     ينمسك؛ ودفعة الزيادة بمادّة السطر ومخزنه ويومه، وانتهاؤها انتهاء جزئها (الصالح أو المنتهي) ووقت فقسها للأفراخ بس.
  select 'doc_moves', count(*) from (
    select tl.id from public.transfer_lines tl
    join public.transfers t on t.org_id = tl.org_id and t.id = tl.doc_id
    cross join lateral (
      select coalesce(sum(x.qty), 0) as received
      from public.stock_moves x
      where x.org_id = tl.org_id and x.doc_kind = 'transfer' and x.doc_id = tl.doc_id and x.doc_line_id = tl.id
        and x.warehouse_id = tl.to_warehouse_id and x.qty > 0 and x.reverses_move_id is null
    ) as r
    cross join lateral (
      select coalesce(sum(-x.qty), 0) as drawn, count(*) as pieces,
        count(*) filter (where exists (select 1 from public.stock_moves r where r.org_id = x.org_id and r.reverses_move_id = x.id)) as reversed
      from public.stock_moves x
      where x.org_id = tl.org_id and x.doc_kind = 'transfer' and x.doc_id = tl.doc_id and x.doc_line_id = tl.id
        and x.warehouse_id = tl.from_warehouse_id and x.qty < 0 and x.reverses_move_id is null
    ) as s
    -- والمستلم بنفس الكمية (مراية ضاعت أو تكرّرت بقيمة صفر ما يشوفها الحفظ ولا mirror_pairs).
    where (t.doc_no is not null and (s.drawn <> tl.qty_base or r.received <> tl.qty_base)) or (t.doc_no is null and (s.pieces > 0 or r.received > 0))
      or (t.status = 'posted' and s.reversed > 0) or (t.status = 'void' and s.reversed <> s.pieces)
    union all
    select x.id from public.stock_moves x
    left join public.transfers t on t.org_id = x.org_id and t.id = x.doc_id
    left join public.transfer_lines tl on tl.org_id = x.org_id and tl.id = x.doc_line_id and tl.doc_id = x.doc_id
    where x.doc_kind = 'transfer'
      and (t.id is null or t.doc_no is null or tl.id is null or tl.item_id <> x.item_id
        or x.warehouse_id not in (t.from_warehouse_id, t.to_warehouse_id)
        or (x.reverses_move_id is null and (x.warehouse_id = t.from_warehouse_id) <> (x.qty < 0))
        or (x.reverses_move_id is not null and t.status <> 'void')
        or (t.status = 'void' and x.reverses_move_id is null
          and not exists (select 1 from public.stock_moves r where r.org_id = x.org_id and r.reverses_move_id = x.id)))
    union all
    select ol.id from public.opening_lines ol
    join public.opening_docs o on o.org_id = ol.org_id and o.id = ol.doc_id
    cross join lateral (
      select count(*) as n,
        count(*) filter (where l.item_id = ol.item_id and l.warehouse_id = o.warehouse_id and l.qty_in = ol.qty_base and l.value_in = ol.value
          and l.received_on = o.on_date and l.expiry_on is not distinct from ol.expiry_on and l.born_at is not distinct from ol.born_at) as exact
      from public.stock_lots l
      where l.org_id = ol.org_id and l.source_kind = 'opening' and l.source_id = ol.doc_id and l.source_line_id = ol.id
    ) as s
    where (o.posted_at is not null and (s.n <> 1 or s.exact <> 1)) or (o.posted_at is null and s.n > 0)
    union all
    select x.id from public.stock_moves x
    join public.stock_lots l on l.org_id = x.org_id and l.id = x.lot_id
    left join public.opening_docs o on o.org_id = x.org_id and o.id = x.doc_id
    where x.doc_kind = 'opening'
      and (o.id is null or o.posted_at is null or l.source_kind <> 'opening' or l.source_id <> x.doc_id
        or l.source_line_id is distinct from x.doc_line_id
        or (x.reverses_move_id is not null and o.status <> 'void')
        or (o.status = 'void' and x.reverses_move_id is null
          and not exists (select 1 from public.stock_moves r where r.org_id = x.org_id and r.reverses_move_id = x.id)))
    union all
    select ul.id from public.stock_use_lines ul
    join public.stock_uses u on u.org_id = ul.org_id and u.id = ul.doc_id
    cross join lateral (
      select coalesce(sum(-x.qty), 0) as drawn, count(*) as pieces,
        count(*) filter (where ul.lot_id is not null and x.lot_id <> ul.lot_id) as foreign_lots,
        count(*) filter (where exists (select 1 from public.stock_moves r where r.org_id = x.org_id and r.reverses_move_id = x.id)) as reversed
      from public.stock_moves x
      where x.org_id = ul.org_id and x.doc_kind = 'stock_use' and x.doc_id = ul.doc_id and x.doc_line_id = ul.id and x.qty < 0 and x.reverses_move_id is null
    ) as s
    where (u.doc_no is not null and s.drawn <> ul.qty_base) or (u.doc_no is null and s.pieces > 0) or s.foreign_lots > 0
      or (u.status = 'posted' and s.reversed > 0) or (u.status = 'void' and s.reversed <> s.pieces)
    union all
    select x.id from public.stock_moves x
    left join public.stock_uses u on u.org_id = x.org_id and u.id = x.doc_id
    left join public.stock_use_lines ul on ul.org_id = x.org_id and ul.id = x.doc_line_id and ul.doc_id = x.doc_id
    where x.doc_kind = 'stock_use'
      and (u.id is null or u.doc_no is null or ul.id is null or ul.item_id <> x.item_id or x.warehouse_id <> u.warehouse_id
        or (x.reverses_move_id is null and x.qty > 0)
        or (x.reverses_move_id is not null and u.status <> 'void')
        or (u.status = 'void' and x.reverses_move_id is null
          and not exists (select 1 from public.stock_moves r where r.org_id = x.org_id and r.reverses_move_id = x.id)))
    union all
    select cl.id from public.stock_count_lines cl
    join public.stock_counts k on k.org_id = cl.org_id and k.id = cl.doc_id
    join public.items i on i.org_id = cl.org_id and i.id = cl.item_id
    cross join lateral (
      select
        coalesce(sum(-x.qty) filter (where x.qty < 0 and not private.lot_expired(cl.system_expired_qty is not null, l.expiry_on, k.counted_on)), 0) as drawn,
        coalesce(sum(-x.qty) filter (where x.qty < 0 and private.lot_expired(cl.system_expired_qty is not null, l.expiry_on, k.counted_on)), 0) as drawn_expired,
        count(*) filter (where x.qty < 0
          and x.expiry_checked is distinct from (cl.system_expired_qty is not null and not private.lot_expired(true, l.expiry_on, k.counted_on))) as flags,
        count(*) as pieces,
        count(*) filter (where exists (select 1 from public.stock_moves r where r.org_id = x.org_id and r.reverses_move_id = x.id)) as reversed
      from public.stock_moves x
      join public.stock_lots l on l.org_id = x.org_id and l.id = x.lot_id
      where x.org_id = cl.org_id and x.doc_kind = 'count' and x.doc_id = cl.doc_id and x.doc_line_id = cl.id and x.reverses_move_id is null
    ) as s
    cross join lateral (
      select count(*) as n, coalesce(sum(l.qty_in), 0) as qty,
        count(*) filter (where l.item_id <> cl.item_id or l.warehouse_id <> k.warehouse_id or l.received_on <> k.counted_on
          or l.born_at is distinct from (case when i.kind = 'chick' then cl.gain_born_at end)
          or not ((cl.diff > 0 and l.qty_in = cl.diff and l.expiry_on is not distinct from cl.gain_expiry_on)
            or (cl.expired_diff > 0 and l.qty_in = cl.expired_diff and l.expiry_on is not distinct from cl.gain_expired_expiry_on))) as foreign_lots
      from public.stock_lots l
      where l.org_id = cl.org_id and l.source_kind = 'count_gain' and l.source_id = cl.doc_id and l.source_line_id = cl.id
    ) as g
    where (k.posted_at is not null and (cl.diff is null
        or cl.diff <> cl.counted_qty - cl.system_qty
        or cl.expired_diff is distinct from (case when cl.system_expired_qty is not null then coalesce(cl.counted_expired_qty, 0) - cl.system_expired_qty end)
        or s.drawn <> greatest(-cl.diff, 0) or s.drawn_expired <> greatest(-coalesce(cl.expired_diff, 0), 0) or s.flags > 0
        or g.qty <> greatest(cl.diff, 0) + greatest(coalesce(cl.expired_diff, 0), 0)
        or g.n <> (cl.diff > 0)::int + (coalesce(cl.expired_diff, 0) > 0)::int or g.foreign_lots > 0))
      or (k.posted_at is null and (s.pieces > 0 or g.n > 0))
      or (k.status = 'approved' and s.reversed > 0) or (k.status = 'void' and s.reversed <> s.pieces)
    union all
    select x.id from public.stock_moves x
    left join public.stock_counts k on k.org_id = x.org_id and k.id = x.doc_id
    left join public.stock_count_lines cl on cl.org_id = x.org_id and cl.id = x.doc_line_id and cl.doc_id = x.doc_id
    left join public.stock_lots l on l.org_id = x.org_id and l.id = x.lot_id
    where x.doc_kind = 'count'
      and (k.id is null or k.doc_no is null or cl.id is null or cl.item_id <> x.item_id or x.warehouse_id <> k.warehouse_id
        or (x.reverses_move_id is null and x.qty > 0
          and (l.source_kind <> 'count_gain' or l.source_id <> x.doc_id or l.source_line_id is distinct from x.doc_line_id))
        or (x.reverses_move_id is not null and k.status <> 'void')
        or (k.status = 'void' and x.reverses_move_id is null
          and not exists (select 1 from public.stock_moves r where r.org_id = x.org_id and r.reverses_move_id = x.id)))
    union all
    -- الاستلام (WP6): سطر المرحَّل (والملغى بعد ترحيله) دفعة وحدة بالضبط من سطره، جذر بمادّته وكميته ويومه ومخزنه وانتهائه وفقسه
    --     ورقم دفعة المورّد، والمسوّدة والمطويّة بلا دفعة؛ وكل حركة استلام على دفعة سطرها من مستند مرحَّل، أصليتها بكمية الدفعة
    --     ويوم المستند، والمرحَّل بلا عكسية والملغى كل أصلية منه معكوسة؛ وكل دفعة استلام من سطر مستند مرحَّل.
    select x.id from public.receipt_lines x
    join public.receipts r on r.org_id = x.org_id and r.id = x.doc_id
    cross join lateral (
      select count(*) as lots,
        count(*) filter (where l.item_id = x.item_id and l.warehouse_id = r.warehouse_id and l.qty_in = x.qty_base and l.received_on = r.received_on
          and l.expiry_on is not distinct from x.expiry_on and l.born_at is not distinct from x.born_at
          and l.supplier_lot_no is not distinct from x.supplier_lot_no and l.origin_lot_id is null) as good
      from public.stock_lots l where l.org_id = x.org_id and l.source_kind = 'receipt' and l.source_id = r.id and l.source_line_id = x.id
    ) as k
    where (r.posted_at is not null and (k.lots <> 1 or k.good <> 1)) or (r.posted_at is null and k.lots > 0)
    union all
    select x.id from public.stock_moves x
    left join public.receipts r on r.org_id = x.org_id and r.id = x.doc_id
    left join public.stock_lots l on l.org_id = x.org_id and l.id = x.lot_id
    where x.doc_kind = 'receipt'
      and (r.id is null or r.posted_at is null or l.source_kind <> 'receipt' or l.source_id <> r.id or l.source_line_id is distinct from x.doc_line_id
        or (x.reverses_move_id is null and (x.qty <> l.qty_in or x.moved_on <> r.received_on))
        or (x.reverses_move_id is not null and r.status <> 'void')
        or (r.status = 'void' and x.reverses_move_id is null
          and not exists (select 1 from public.stock_moves z where z.org_id = x.org_id and z.reverses_move_id = x.id)))
    union all
    select l.id from public.stock_lots l
    left join public.receipts r on r.org_id = l.org_id and r.id = l.source_id
    where l.source_kind = 'receipt' and (r.id is null or r.posted_at is null
      or not exists (select 1 from public.receipt_lines y where y.org_id = l.org_id and y.doc_id = r.id and y.id = l.source_line_id))
  ) as v
  union all
  -- 12. الصرف = مصروفه (WP5): مصروف المستند الأصلي = Σ قيم سحبه الأصلي، والصافي = صافي الحركات (الملغى صفر بالاثنين)، ومصروف أصلي
  --     واحد بالأكثر بتصنيف المستند ووحدة مخزنه؛ وماكو مصروف صرف بلا مستند.
  select 'use_expense', count(*) from (
    select u.id from public.stock_uses u
    join public.warehouses w on w.org_id = u.org_id and w.id = u.warehouse_id
    cross join lateral (
      select coalesce(-sum(m.value) filter (where m.reverses_move_id is null), 0) as drawn, coalesce(-sum(m.value), 0) as net
      from public.stock_moves m where m.org_id = u.org_id and m.doc_kind = 'stock_use' and m.doc_id = u.id
    ) as s
    cross join lateral (
      select coalesce(sum(e.amount) filter (where e.reverses_id is null), 0) as original, coalesce(sum(e.amount), 0) as net,
        count(*) filter (where e.reverses_id is null) as originals,
        count(*) filter (where e.category_id is distinct from u.category_id or e.division_id <> w.division_id or e.source <> 'stock') as foreign_rows
      from public.expenses e where e.org_id = u.org_id and e.doc_kind = 'stock_use' and e.doc_id = u.id
    ) as x
    where x.original <> s.drawn or x.net <> s.net or x.originals > 1 or x.foreign_rows > 0
    union all
    select e.id from public.expenses e
    left join public.stock_uses u on u.org_id = e.org_id and u.id = e.doc_id
    where e.doc_kind = 'stock_use' and (u.id is null or u.posted_at is null)
  ) as v
  union all
  -- 13. الجرد = لقطته (WP5، E55): قيمة نقص كل سطر = Σ قيم سحبه الأصلي، وقيمة زيادته = Σ قيم دفعات زيادته الداخلة؛ و«فرق جرد» الأصلي
  --     للمستند = Σ قيم نقص سطوره (صفر بلا مصروف)، بتصنيف count_diff ووحدة مخزنه، والصافي صفر للملغى؛ والمسوّدة بلا لقطة ولا مصروف.
  select 'count_values', count(*) from (
    select cl.id from public.stock_count_lines cl
    join public.stock_counts k on k.org_id = cl.org_id and k.id = cl.doc_id
    left join public.stock_count_line_costs c on c.org_id = cl.org_id and c.line_id = cl.id
    cross join lateral (
      select coalesce(-sum(m.value) filter (where m.qty < 0 and m.reverses_move_id is null), 0) as short_value
      from public.stock_moves m where m.org_id = cl.org_id and m.doc_kind = 'count' and m.doc_id = cl.doc_id and m.doc_line_id = cl.id
    ) as s
    cross join lateral (
      select coalesce(sum(l.value_in), 0) as gain_value from public.stock_lots l
      where l.org_id = cl.org_id and l.source_kind = 'count_gain' and l.source_id = cl.doc_id and l.source_line_id = cl.id
    ) as g
    where (k.posted_at is not null and (c.id is null or c.shortage_value is distinct from s.short_value or c.gain_value is distinct from g.gain_value))
      or (k.posted_at is null and (c.gain_value is not null or c.shortage_value is not null))
    union all
    select k.id from public.stock_counts k
    join public.warehouses w on w.org_id = k.org_id and w.id = k.warehouse_id
    cross join lateral (
      select coalesce(sum(c.shortage_value), 0) as short_total from public.stock_count_line_costs c where c.org_id = k.org_id and c.doc_id = k.id
    ) as t
    cross join lateral (
      select coalesce(sum(e.amount) filter (where e.reverses_id is null), 0) as original, coalesce(sum(e.amount), 0) as net,
        count(*) filter (where e.reverses_id is null) as originals,
        count(*) filter (where e.division_id <> w.division_id or e.source <> 'stock' or not exists (
          select 1 from public.expense_categories x where x.org_id = e.org_id and x.id = e.category_id and x.system_code = 'count_diff')) as foreign_rows
      from public.expenses e where e.org_id = k.org_id and e.doc_kind = 'count' and e.doc_id = k.id
    ) as x
    where x.originals > 1 or x.foreign_rows > 0 or (k.posted_at is null and x.originals > 0)
      or (k.posted_at is not null and x.original <> t.short_total)
      or (k.status = 'approved' and x.net <> x.original) or (k.status = 'void' and x.net <> 0)
    union all
    select e.id from public.expenses e
    left join public.stock_counts k on k.org_id = e.org_id and k.id = e.doc_id
    where e.doc_kind = 'count' and (k.id is null or k.posted_at is null)
  ) as v
  union all
  -- 14. الخصم (الخطّة 10، E55): لكل استلام مرحَّل (أو ملغى بعد ترحيله) كل سطر مسعَّر بحصّتيه، وΣ حصص الخصم = خصم الفاتورة؛ والمسوّدة
  --     والمطويّة بلا حصص.
  select 'receipt_discount', count(*) from public.receipts r
  cross join lateral (
    select coalesce(sum(a.discount_share), 0) as total, count(*) as priced,
      count(*) filter (where a.discount_share is null or a.charge_share is null) as unstamped,
      count(*) filter (where a.discount_share is not null or a.charge_share is not null) as stamped
    from public.receipt_line_amounts a where a.org_id = r.org_id and a.doc_id = r.id
  ) as a
  where (r.posted_at is not null and (a.unstamped > 0
      or a.priced <> (select count(*) from public.receipt_lines x where x.org_id = r.org_id and x.doc_id = r.id)
      or a.total <> coalesce((select m.discount from public.receipt_amounts m where m.org_id = r.org_id and m.doc_id = r.id), 0)))
    or (r.posted_at is null and a.stamped > 0)
  union all
  -- 15. التحميلات (الخطّة 11، E55): لكل تحميل بمستند مرحَّل Σ حصصه = مبلغه، وحصصه على سطوره المختارة بس؛ ولكل سطر Σ حصصه من كل
  --     التحميلات = charge_share؛ والمسوّدة بلا حصص.
  select 'receipt_charge_shares', (
    select count(*) from public.receipt_charges c
    join public.receipts r on r.org_id = c.org_id and r.id = c.doc_id
    where (r.posted_at is not null
        and c.amount <> coalesce((select sum(s.share) from public.receipt_charge_shares s where s.org_id = c.org_id and s.charge_id = c.id), 0))
      or (r.posted_at is null and exists (select 1 from public.receipt_charge_shares s where s.org_id = c.org_id and s.charge_id = c.id))
      or (not c.all_lines and exists (select 1 from public.receipt_charge_shares s where s.org_id = c.org_id and s.charge_id = c.id
        and not exists (select 1 from public.receipt_charge_lines y where y.org_id = s.org_id and y.charge_id = s.charge_id and y.line_id = s.line_id)))
  ) + (
    select count(*) from public.receipt_line_amounts a
    join public.receipts r on r.org_id = a.org_id and r.id = a.doc_id
    where r.posted_at is not null
      and a.charge_share is distinct from coalesce((select sum(s.share) from public.receipt_charge_shares s where s.org_id = a.org_id and s.line_id = a.line_id), 0)
  )
  union all
  -- 16. قيمة الدفعة (الخطّة 12): لكل سطر مرحَّل قيمة دفعته الداخلة = مبلغه − حصّة الخصم + حصّة التحميلات (التقييم يجي بـWP7).
  select 'receipt_lot_values', count(*) from public.receipt_line_amounts a
  join public.receipts r on r.org_id = a.org_id and r.id = a.doc_id
  join public.stock_lots l on l.org_id = a.org_id and l.source_kind = 'receipt' and l.source_id = r.id and l.source_line_id = a.line_id
  where r.posted_at is not null and l.value_in is distinct from a.line_total - a.discount_share + a.charge_share
  union all
  -- 17. القيود والصناديق (الخطّة 13، E18، E19، E44، E10): لكل استلام مرحَّل أو ملغى بعد ترحيله قيد purchase أصلي واحد للمورّد بدفتر
  --     المستند ويومه ورقمه = −(Σ السطور − الخصم)، أو ولا واحد للصافي صفر؛ وكل تحميل بجهة قيده purchase = −مبلغه على جهته بنفس
  --     الدفتر، وبصندوق حركة receipt_charge = −مبلغه من صندوقه ما انعكست؛ والمدفوع قيد payout أصلي واحد = المدفوع بحركة receipt_paid
  --     أصلية من صندوقه (إلغاؤه بـvoid_party_payment يبقي الأصل ويّا عكسه، E44)، أو ولا واحد. المرحَّل قيود purchase بلا عكس، والملغى
  --     كلها معكوسة وكل تحميل صندوق بمصروف «استلام ملغى» واحد بمبلغه يشير لحركته. وماكو قيد ولا حركة ولا مصروف استلام بلا مستند مرحَّل.
  select 'receipt_entries', (
    select count(*) from public.receipts r
    cross join lateral (
      select coalesce((select sum(a.line_total) from public.receipt_line_amounts a where a.org_id = r.org_id and a.doc_id = r.id), 0)
          - coalesce(m.discount, 0) as net,
        coalesce(m.paid_now, 0) as paid, m.cash_account_id as box
      from (select 1) as one
      left join public.receipt_amounts m on m.org_id = r.org_id and m.doc_id = r.id
    ) as t
    cross join lateral (
      select count(*) as n,
        count(*) filter (where e.party_id = r.party_id and e.book_id = r.book_id and e.amount = -t.net and e.on_date = r.received_on
          and e.doc_no is not distinct from r.doc_no) as good,
        count(*) filter (where exists (select 1 from public.party_entries z where z.org_id = e.org_id and z.reverses_entry_id = e.id)) as reversed
      from public.party_entries e
      where e.org_id = r.org_id and e.doc_kind = 'receipt' and e.doc_id = r.id and e.kind = 'purchase' and e.reverses_entry_id is null
        and not exists (select 1 from public.receipt_charges c where c.org_id = e.org_id and c.party_entry_id = e.id)
    ) as s
    cross join lateral (
      select count(*) as n,
        count(*) filter (where e.party_id = r.party_id and e.book_id = r.book_id and e.amount = t.paid and e.on_date = r.received_on
          and e.doc_no is not distinct from r.doc_no
          and (select count(*) from public.cash_moves x where x.org_id = e.org_id and x.party_entry_id = e.id and x.reverses_move_id is null
            and x.kind = 'receipt_paid' and x.account_id is not distinct from t.box and x.amount = -t.paid and x.doc_kind = 'receipt'
            and x.doc_id = r.id and x.on_date = r.received_on) = 1) as good
      from public.party_entries e
      where e.org_id = r.org_id and e.doc_kind = 'receipt' and e.doc_id = r.id and e.kind = 'payout' and e.reverses_entry_id is null
    ) as p
    cross join lateral (
      select count(*) filter (where
        (c.payee_party_id is not null and not exists (
          select 1 from public.party_entries e where e.org_id = c.org_id and e.id = c.party_entry_id and e.kind = 'purchase'
            and e.party_id = c.payee_party_id and e.book_id = r.book_id and e.amount = -c.amount and e.doc_kind = 'receipt' and e.doc_id = r.id
            and e.on_date = r.received_on and e.reverses_entry_id is null
            and exists (select 1 from public.party_entries z where z.org_id = e.org_id and z.reverses_entry_id = e.id) = (r.status = 'void')))
        or (c.cash_account_id is not null and not exists (
          select 1 from public.cash_moves x where x.org_id = c.org_id and x.id = c.cash_move_id and x.kind = 'receipt_charge'
            and x.account_id = c.cash_account_id and x.amount = -c.amount and x.doc_kind = 'receipt' and x.doc_id = r.id
            and x.on_date = r.received_on and x.reverses_move_id is null
            and not exists (select 1 from public.cash_moves z where z.org_id = x.org_id and z.reverses_move_id = x.id)))
        or (c.cash_account_id is not null and (
          select count(*) from public.expenses x where x.org_id = c.org_id and x.cash_move_id = c.cash_move_id and x.source = 'adjustment'
            and x.doc_kind = 'receipt' and x.doc_id = r.id and x.amount = c.amount and x.reverses_id is null)
          <> case when r.status = 'void' then 1 else 0 end)) as bad
      from public.receipt_charges c where c.org_id = r.org_id and c.doc_id = r.id
    ) as ch
    where r.posted_at is not null and (s.n <> (t.net > 0)::int or s.good <> s.n
      or (r.status = 'posted' and s.reversed > 0) or (r.status = 'void' and s.reversed <> s.n)
      or p.n <> (t.paid > 0)::int or p.good <> p.n or ch.bad > 0)
  ) + (
    select count(*) from (
      select e.id from public.party_entries e
      left join public.receipts r on r.org_id = e.org_id and r.id = e.doc_id
      where e.doc_kind = 'receipt' and (r.id is null or r.posted_at is null
        or (e.reverses_entry_id is null and e.kind not in ('purchase', 'payout'))
        or (e.reverses_entry_id is null and e.kind = 'purchase' and e.party_id <> r.party_id
          and not exists (select 1 from public.receipt_charges c where c.org_id = e.org_id and c.party_entry_id = e.id)))
      union all
      select x.id from public.cash_moves x
      left join public.receipts r on r.org_id = x.org_id and r.id = x.doc_id
      where x.doc_kind = 'receipt' and (r.id is null or r.posted_at is null or x.kind not in ('receipt_paid', 'receipt_charge')
        or (x.kind = 'receipt_charge' and x.reverses_move_id is null
          and not exists (select 1 from public.receipt_charges c where c.org_id = x.org_id and c.cash_move_id = x.id)))
      union all
      select x.id from public.expenses x
      left join public.receipts r on r.org_id = x.org_id and r.id = x.doc_id
      where x.doc_kind = 'receipt' and (r.id is null or r.status <> 'void' or x.source <> 'adjustment'
        or not exists (select 1 from public.expense_categories k where k.org_id = x.org_id and k.id = x.category_id and k.system_code = 'voided_receipt')
        or x.division_id <> (select w.division_id from public.warehouses w where w.org_id = r.org_id and w.id = r.warehouse_id)
        or (x.reverses_id is null and not exists (select 1 from public.receipt_charges c where c.org_id = x.org_id and c.doc_id = r.id and c.cash_move_id = x.cash_move_id))
        or (x.reverses_id is not null and not exists (select 1 from public.expenses y where y.org_id = x.org_id and y.id = x.reverses_id and y.doc_kind = 'receipt' and y.doc_id = x.doc_id)))
    ) as v
  )
$$;

-- ─── verify_ledger كما بـ0008 ويزيد أرقام PU (الفحص 11) ومصدرَي حركتي دفعة الاستلام وتحميله (الفحص 8)؛ نفس التوقيع ─────────────
create or replace function public.verify_ledger() returns table (check_name text, violations bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_bad bigint := 0;
  v_org record;
  v_user uuid;
  v_report jsonb;
  v_cash jsonb;
begin
  return query
  with rem as (
    select e.org_id, e.id, e.party_id, e.book_id, e.kind, e.amount, e.reverses_entry_id, e.doc_kind, e.doc_no, e.on_date,
      abs(e.amount) - coalesce((
        select sum(a.amount) from public.party_allocations a
        where a.org_id = e.org_id and a.party_id = e.party_id and a.book_id = e.book_id
          and ((e.amount > 0 and a.debit_entry_id = e.id) or (e.amount < 0 and a.credit_entry_id = e.id))
      ), 0) as remaining
    from public.party_entries e
  )
  -- 1. المتبقّي المقداري بين صفر و|المبلغ|.
  select 'entry_remaining_range'::text, count(*) from rem where remaining < 0 or remaining > abs(amount)
  union all
  -- 2. لكل (جهة، دفتر): Σ المبالغ = Σ متبقّي الموجبة − Σ متبقّي السالبة (يلزم من 3، وينفحص بمصدره).
  select 'book_balance_identity', count(*) from (
    select org_id, party_id, book_id from rem group by org_id, party_id, book_id
    having sum(amount) <> coalesce(sum(remaining) filter (where amount > 0), 0) - coalesce(sum(remaining) filter (where amount < 0), 0)
  ) as x
  union all
  -- 3. كل توزيع بين قيد موجب وقيد سالب لنفس (الجهة، الدفتر) المكتوبين عليه، والعكس بنفس قيديه ومبلغه المعاكس.
  select 'allocation_pairs', count(*) from public.party_allocations a
  left join public.party_entries d on d.org_id = a.org_id and d.id = a.debit_entry_id
  left join public.party_entries c on c.org_id = a.org_id and c.id = a.credit_entry_id
  left join public.party_allocations o on o.org_id = a.org_id and o.id = a.reverses_allocation_id
  where d.id is null or c.id is null or d.amount <= 0 or c.amount >= 0
    or d.party_id <> a.party_id or d.book_id <> a.book_id or c.party_id <> a.party_id or c.book_id <> a.book_id
    or (a.reverses_allocation_id is not null and (o.id is null or o.debit_entry_id <> a.debit_entry_id or o.credit_entry_id <> a.credit_entry_id
      or o.amount <> -a.amount or o.reverses_allocation_id is not null))
  union all
  -- 4. كل قيد عكسي بنوع أصله وبمبلغه المعاكس، ومتوزّع بالكامل على أصله (زوج مغلق).
  select 'reversal_pairs', count(*) from public.party_entries r
  join public.party_entries o on o.org_id = r.org_id and o.id = r.reverses_entry_id
  where o.kind <> r.kind or r.amount <> -o.amount or o.reverses_entry_id is not null or o.party_id <> r.party_id or o.book_id <> r.book_id
    or coalesce((select sum(a.amount) from public.party_allocations a where a.org_id = r.org_id
      and ((a.debit_entry_id = r.id and a.credit_entry_id = o.id) or (a.debit_entry_id = o.id and a.credit_entry_id = r.id))), 0) <> abs(o.amount)
  union all
  -- 5. مبالغ الدفاتر والتوزيع والصناديق بدينار صحيح.
  select 'whole_dinar', (select count(*) from public.party_entries where amount <> round(amount, 0))
    + (select count(*) from public.party_allocations where amount <> round(amount, 0))
    + (select count(*) from public.cash_moves where amount <> round(amount, 0))
  union all
  -- 6. النوع وإشارته (FOUNDATION ٣١٣)، والعكسي بالإشارة المعاكسة.
  select 'kind_sign', count(*) from public.party_entries
  where (kind in ('invoice', 'payout', 'supplier_return') and (amount > 0) <> (reverses_entry_id is null))
    or (kind in ('purchase', 'bill', 'payment', 'return') and (amount < 0) <> (reverses_entry_id is null))
    or kind not in ('invoice', 'purchase', 'bill', 'payment', 'payout', 'return', 'supplier_return', 'forgiveness', 'opening', 'adjustment', 'offset')
  union all
  -- 7. كل قيد قبض أو دفع (أصلاً وعكساً) بحركة صندوق وحدة بالاتّجاه المعاكس.
  select 'payment_cash_moves', count(*) from public.party_entries e
  where e.kind in ('payment', 'payout')
    and (select count(*) from public.cash_moves m where m.org_id = e.org_id and m.party_entry_id = e.id and m.amount = -e.amount) <> 1
  union all
  -- 8. كل حركة صندوق مربوطة بمصدرها: القبض بقيد payment والدفع بقيد payout وبالمبلغ المعاكس، والمصروف (WP5) بمصروف واحد يشير إلها
  --    وبمستند expense؛ ودفعة الاستلام (WP6) بقيد payout مستنده الاستلام وبمبلغه المعاكس، وتحميله بتحميل واحد يشير إلها وبمبلغه؛ والافتتاح بلا مستند.
  select 'cash_move_sources', count(*) from public.cash_moves m
  left join public.party_entries e on e.org_id = m.org_id and e.id = m.party_entry_id
  where (m.kind = 'party_payment' and (e.id is null or e.kind <> 'payment' or m.amount <> -e.amount))
    or (m.kind = 'party_payout' and (e.id is null or e.kind <> 'payout' or e.doc_kind is not null or m.amount <> -e.amount))
    or (m.kind = 'receipt_paid' and (e.id is null or e.kind <> 'payout' or e.doc_kind is distinct from 'receipt' or m.doc_kind is distinct from 'receipt'
      or m.doc_id is distinct from e.doc_id or m.amount <> -e.amount))
    or (m.kind = 'receipt_charge' and (m.doc_kind is distinct from 'receipt' or m.party_entry_id is not null
      or (m.reverses_move_id is null and (select count(*) from public.receipt_charges c where c.org_id = m.org_id and c.cash_move_id = m.id
        and c.amount = -m.amount and c.doc_id = m.doc_id) <> 1)))
    or (m.kind = 'expense' and (m.doc_kind is distinct from 'expense' or m.party_entry_id is not null
      or (select count(*) from public.expenses x where x.org_id = m.org_id and x.cash_move_id = m.id) <> 1))
    or (m.kind = 'opening' and (m.doc_kind is not null or m.party_entry_id is not null))
    or (m.kind = 'transfer' and (m.doc_kind is distinct from 'cash_transfer' or m.party_entry_id is not null))
  union all
  -- 8. والعكس: كل حركة عكسية بنفس صندوق أصلها ونوعه ومستنده وبمبلغه المعاكس، مرّة وحدة؛ وحركة القيد العكسي لقيده العكسي.
  select 'cash_move_reversals', count(*) from public.cash_moves r
  join public.cash_moves o on o.org_id = r.org_id and o.id = r.reverses_move_id
  where o.account_id <> r.account_id or o.kind <> r.kind or r.amount <> -o.amount or o.reverses_move_id is not null
    or o.doc_kind is distinct from r.doc_kind or o.doc_id is distinct from r.doc_id
    or (o.party_entry_id is not null and not exists (select 1 from public.party_entries x where x.org_id = r.org_id and x.id = r.party_entry_id
      and x.reverses_entry_id = o.party_entry_id))
  union all
  -- 8. النقل: وجهان أصليان بصندوقين مختلفين ومجموعهما صفر لكل مستند.
  select 'cash_transfer_legs', count(*) from (
    select org_id, doc_id from public.cash_moves where kind = 'transfer' and reverses_move_id is null group by org_id, doc_id
    having count(*) <> 2 or sum(amount) <> 0 or count(distinct account_id) <> 2
  ) as x
  union all
  -- 8. رصيد افتتاحي فعّال واحد لكل صندوق.
  select 'cash_opening_once', count(*) from (
    select o.org_id, o.account_id from public.cash_moves o
    where o.kind = 'opening' and o.reverses_move_id is null and not exists (select 1 from public.cash_moves r where r.org_id = o.org_id and r.reverses_move_id = o.id)
    group by o.org_id, o.account_id having count(*) > 1
  ) as x
  union all
  -- رصيد افتتاحي فعّال واحد لكل (جهة، دفتر) (E20: المعكوس ما ينحسب).
  select 'party_opening_once', count(*) from (
    select o.org_id, o.party_id, o.book_id from public.party_entries o
    where o.kind = 'opening' and o.reverses_entry_id is null and not exists (select 1 from public.party_entries r where r.org_id = o.org_id and r.reverses_entry_id = o.id)
    group by o.org_id, o.party_id, o.book_id having count(*) > 1
  ) as x
  union all
  -- 10. اكتمال التوزيع (القاعدة 27): ما يجتمع بنفس (الجهة، الدفتر) متبقٍّ موجب ومتبقٍّ سالب.
  select 'allocation_completeness', count(*) from (
    select org_id, party_id, book_id from rem where remaining > 0 group by org_id, party_id, book_id
    having bool_or(amount > 0) and bool_or(amount < 0)
  ) as x
  union all
  -- 11. الترقيم: لكل (منشأة، نوع، سنة) بالعدّاد، الأصول المرقّمة (القبض RC والدفع PY المستقلّان، والتحويل TR من 0007) بأرقام
  --     1…last_no بلا فجوة ولا تكرار، وكل رقم بنوعه وسنة تاريخه، وماكو رقم بلا عدّاد. كل حزمة جاية تزيد مصدرها (SU وCT وPU وRT).
  select 'doc_numbers', (
    select count(*) from (
      select n.org_id, n.kind, n.year, count(*) as items, count(distinct n.no) as distinct_no, min(n.no) as min_no, max(n.no) as max_no
      from (
        select e.org_id, split_part(e.doc_no, '-', 1) as kind, split_part(e.doc_no, '-', 2)::int as year, split_part(e.doc_no, '-', 3)::int as no
        from public.party_entries e
        where e.reverses_entry_id is null and e.doc_kind is null and e.doc_no is not null
        union all
        -- TR (0007): التحويل المرحَّل أو الملغى بعد ترحيله برقمه.
        select t.org_id, split_part(t.doc_no, '-', 1), split_part(t.doc_no, '-', 2)::int, split_part(t.doc_no, '-', 3)::int
        from public.transfers t where t.doc_no is not null
        union all
        -- SU وCT (0008): الصرف المرحَّل والجرد الموافَق عليه (والملغى بعد ترحيله) برقمه.
        select u.org_id, split_part(u.doc_no, '-', 1), split_part(u.doc_no, '-', 2)::int, split_part(u.doc_no, '-', 3)::int
        from public.stock_uses u where u.doc_no is not null
        union all
        select k.org_id, split_part(k.doc_no, '-', 1), split_part(k.doc_no, '-', 2)::int, split_part(k.doc_no, '-', 3)::int
        from public.stock_counts k where k.doc_no is not null
        union all
        -- PU (0009): الاستلام المرحَّل (والملغى بعد ترحيله) برقمه.
        select r.org_id, split_part(r.doc_no, '-', 1), split_part(r.doc_no, '-', 2)::int, split_part(r.doc_no, '-', 3)::int
        from public.receipts r where r.doc_no is not null
      ) as n
      group by n.org_id, n.kind, n.year
    ) as g
    full join (select * from public.doc_counters where kind in ('RC', 'PY', 'TR', 'SU', 'CT', 'PU')) as c on c.org_id = g.org_id and c.kind = g.kind and c.year = g.year
    where g.org_id is null or c.org_id is null or g.items <> g.distinct_no or g.min_no <> 1 or g.max_no <> c.last_no or g.distinct_no <> c.last_no
  ) + (
    select count(*) from public.party_entries e
    where e.reverses_entry_id is null and e.doc_kind is null
      and ((e.kind = 'payment' and (e.doc_no is null or e.doc_no !~ '^RC-')) or (e.kind = 'payout' and (e.doc_no is null or e.doc_no !~ '^PY-'))
        or (e.kind not in ('payment', 'payout') and e.doc_no is not null)
        or (e.doc_no is not null and split_part(e.doc_no, '-', 2) <> to_char(e.on_date, 'YYYY')))
  ) + (
    -- التحويل: المرحَّل (والملغى بعد ترحيله) برقم TR بسنة تاريخه، والمسوّدة والمطويّة بلا رقم.
    select count(*) from public.transfers t
    where (t.posted_at is null and t.doc_no is not null)
      or (t.posted_at is not null and (t.doc_no is null or t.doc_no !~ '^TR-' or split_part(t.doc_no, '-', 2) <> to_char(t.moved_on, 'YYYY')))
  ) + (
    -- الصرف برقم SU بسنة تاريخه، والجرد الموافَق عليه برقم CT بسنة تاريخه، وغير المرحَّل بلا رقم.
    select count(*) from public.stock_uses u
    where (u.posted_at is null and u.doc_no is not null)
      or (u.posted_at is not null and (u.doc_no is null or u.doc_no !~ '^SU-' or split_part(u.doc_no, '-', 2) <> to_char(u.used_on, 'YYYY')))
  ) + (
    select count(*) from public.stock_counts k
    where (k.posted_at is null and k.doc_no is not null)
      or (k.posted_at is not null and (k.doc_no is null or k.doc_no !~ '^CT-' or split_part(k.doc_no, '-', 2) <> to_char(k.counted_on, 'YYYY')))
  ) + (
    -- الاستلام برقم PU بسنة تاريخه، والمسوّدة والمطويّة بلا رقم (والملغى بعد ترحيله يبقى برقمه).
    select count(*) from public.receipts r
    where (r.posted_at is null and r.doc_no is not null)
      or (r.posted_at is not null and (r.doc_no is null or r.doc_no !~ '^PU-' or split_part(r.doc_no, '-', 2) <> to_char(r.received_on, 'YYYY')))
  )
  union all
  -- 14. المصاريف (WP5، E10): كل مصروف نقدي بحركة صندوق expense بمستنده وصندوقه وتاريخه وبمبلغه المعاكس، وبالدين بقيد bill بجهته
  --     ودفتر وحدته وتاريخه وبمبلغه المعاكس؛ والعكسي بعكس حركة أصله أو قيده؛ والنقدي وبالدين بدينار صحيح؛ وكل قيد bill بمستند
  --     expense بمصروفه، والمصروف بمصدره الصحيح (stock للصرف والجرد بس).
  select 'expense_sources', (
    select count(*) from public.expenses e
    left join public.cash_moves m on m.org_id = e.org_id and m.id = e.cash_move_id
    left join public.party_entries p on p.org_id = e.org_id and p.id = e.party_entry_id
    left join public.expenses o on o.org_id = e.org_id and o.id = e.reverses_id
    where (e.source = 'cash' and (m.id is null or m.kind <> 'expense' or m.amount <> -e.amount or m.account_id is distinct from e.account_id
        or m.doc_kind is distinct from 'expense' or m.doc_id is distinct from coalesce(e.reverses_id, e.id) or m.on_date <> e.on_date
        or (m.reverses_move_id is null) <> (e.reverses_id is null) or (e.reverses_id is not null and m.reverses_move_id is distinct from o.cash_move_id)))
      or (e.source = 'credit' and (p.id is null or p.kind <> 'bill' or p.amount <> -e.amount or p.party_id is distinct from e.party_id
        or p.book_id is distinct from e.book_id or p.doc_kind is distinct from 'expense' or p.doc_id is distinct from coalesce(e.reverses_id, e.id)
        or p.on_date <> e.on_date or (p.reverses_entry_id is null) <> (e.reverses_id is null)
        or (e.reverses_id is not null and p.reverses_entry_id is distinct from o.party_entry_id)
        or not exists (select 1 from public.ledger_books b where b.org_id = e.org_id and b.id = e.book_id and b.division_id = e.division_id)))
      or (e.source in ('cash', 'credit') and e.amount <> round(e.amount, 0))
      or (e.source = 'stock' and e.doc_kind not in ('stock_use', 'count'))
  ) + (
    select count(*) from public.party_entries p
    where p.doc_kind = 'expense' and (p.kind <> 'bill'
      or (select count(*) from public.expenses x where x.org_id = p.org_id and x.party_entry_id = p.id) <> 1)
  )
  union all
  -- E14: وحدة بيها قيد جهة أو مصروف مختومة بأوّل ترحيل (first_posted_at)، فيوم تشغيلها متجمّد (mark_division_posted بكل دالّة ترحيل).
  select 'posted_division_stamped', count(*) from public.divisions d
  where d.first_posted_at is null
    and (exists (select 1 from public.party_entries e join public.ledger_books b on b.org_id = e.org_id and b.id = e.book_id where b.org_id = d.org_id and b.division_id = d.id)
      or exists (select 1 from public.expenses x where x.org_id = d.org_id and x.division_id = d.id));

  -- 9. التقارير = المعادلة من الصفوف الخام، لكل منشأة بيها قيود أو حركات، بهويّة مالك حيّ منها (التقرير invoker، والدالّة صاحبة
  --    الجداول فتشوف كل صفوف المنشأة). الهويّة ترجع كما كانت بالآخر. المقارنة is distinct from: مفتاح غايب (NULL) فرق، مو صفر.
  for v_org in select x.org_id from (select org_id from public.party_entries union select org_id from public.cash_moves) as x order by 1 loop
    select m.user_id into v_user from public.members m
    where m.org_id = v_org.org_id and m.role = 'owner' and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
    order by m.created_at, m.id limit 1;
    continue when v_user is null;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    begin
      v_report := public.report_accounts_summary(date '2000-01-01', date '9999-12-31');
      v_cash := public.report_cash_balances(date '2000-01-01', date '9999-12-31');
      v_bad := v_bad + (
        select count(*) from public.divisions d
        left join lateral (
          select coalesce(sum(greatest(s.balance, 0)), 0) as receivable, coalesce(sum(greatest(-s.balance, 0)), 0) as payable
          from (
            select sum(e.amount) as balance from public.party_entries e join public.ledger_books b on b.org_id = e.org_id and b.id = e.book_id
            where e.org_id = d.org_id and b.division_id = d.id group by e.party_id, e.book_id
          ) as s
        ) as raw on true
        left join lateral (
          select x from jsonb_array_elements(v_report -> 'divisions') as x where x ->> 'division_id' = d.id::text
        ) as rep on true
        where d.org_id = v_org.org_id and d.archived_at is null
          and (rep.x is null or (rep.x ->> 'receivable')::numeric is distinct from raw.receivable or (rep.x ->> 'payable')::numeric is distinct from raw.payable)
      ) + (
        select count(*) from public.cash_accounts a
        left join lateral (select x from jsonb_array_elements(v_cash -> 'accounts') as x where x ->> 'account_id' = a.id::text) as rep on true
        where a.org_id = v_org.org_id
          and (rep.x is null or (rep.x ->> 'closing')::numeric is distinct from coalesce((select sum(m.amount) from public.cash_moves m where m.org_id = a.org_id and m.account_id = a.id), 0))
      ) + (
        case when (v_report -> 'project' ->> 'receivable')::numeric is distinct from coalesce((select sum((x ->> 'receivable')::numeric) from jsonb_array_elements(v_report -> 'divisions') as x), 0)
          or (v_report -> 'project' ->> 'payable')::numeric is distinct from coalesce((select sum((x ->> 'payable')::numeric) from jsonb_array_elements(v_report -> 'divisions') as x), 0)
        then 1 else 0 end
      );
    exception when others then
      v_bad := v_bad + 1;
    end;
  end loop;
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  return query select 'report_formulas'::text, v_bad;
end
$$;

-- ─── قائمة السماح (نسختها بـsupabase/tests/allowlist.json) ─────────────────────────────────────────────────────
grant execute on function
  public.post_receipt(uuid, integer, uuid),
  public.void_receipt(uuid, text, uuid),
  public.preview_receipt(uuid),
  public.delete_receipt_charge(uuid, integer),
  public.set_charge_lines(uuid, uuid[], integer)
to authenticated;
