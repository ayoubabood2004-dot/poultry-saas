-- 0010_supplier_returns_revaluations — مرتجع المورّد وتصحيح سعر الاستلام بعد السحب (خطّة المرحلة 1 WP7؛ FOUNDATION ١٤١، ٣٣٤–٣٣٧،
--   ٤٧٦، ٥٥١–٥٥٣، ٥٩٤؛ E5 وE15 وE16 وE31 وE47 وE51 وE55).
-- المشكلة: ماكو طريق يرجّع بضاعة للمورّد، ولا يصحّح سعر استلام بعد ما انسحب منه إلا إلغاء سلسلة المستندات، وإلغاء استلام عليه تابع
--   ما يسمّيه.
-- هنا: supplier_returns وsupplier_return_lines (الأمين، receipt.draft، بلا مال) وsupplier_return_line_amounts (المقبول، أدوار الكلفة،
--   مقيِّد)، وreceipt_revaluations (دالّة بس، مقيِّد)؛ وsupplier_return_options وpost_supplier_return وvoid_supplier_return
--   وpreview_supplier_return، وpost_receipt_revalue وvoid_receipt_revalue وpreview_receipt_revalue بحساب واحد للمعاينة والترحيل
--   (revalue_plan)؛ وvoid_receipt يرفض has_supplier_returns وhas_revaluation ويسمّيهما؛ وdiscard_draft وdelete_draft_line يزيدان المرتجع؛
--   وstock_doc_label يسمّي الاستلام والمرتجع والتصحيح؛ وverify_stock يزيد طرفي الحفظ (حصص التقييم والمرتجع بقيمته)، والمستند = حركاته
--   للمرتجع والتصحيح، والمرآة وقيمة دفعة الاستلام بالتقييم، وفحصي الخطّة 14–15 (return_ties وrevaluation_ties)؛ وverify_ledger أرقام RT.
-- انحرافات مكتوبة عن الخطّة: جداول المرتجع بعمود doc_id لرأسها (مثل الاستلام)؛ وsupplier_return_lines.item_id وlot_id يكتبهما الحارس
--   (دفعة سطر الاستلام الجذر بمخزنه، E15) وسطر واحد لكل سطر استلام؛ وsupplier_return_options لقراءة الكميات المتبقّية (الشاشات ما
--   تقرا الدفعات، §2.8)؛ وreturn_before_receipt وreturn_empty وcredit_required رموز جديدة؛ والمقبول صفر بلا قيد والفرق صفر بلا مصروف
--   (القيد والمصروف مبالغهما غير صفر)؛ وإلغاء المرتجع يرفض أيضاً لو تصحّح سعر دفعته بعده (السلسلة من آخرها)؛ وreceipt_revaluations.rev_no
--   لترتيب تصحيحات السطر، وwarehouse_id للنطاق، وparty_entry_id وexpense_id لقطة الترحيل؛ والتصحيح بيوم الترحيل (app_today) وقيده يحمل
--   رقم الاستلام PU؛ وترحيل المرتجع والتصحيح ببصمة المعاينة (p_expected_plan، stale_preview؛ FOUNDATION ٥٢٠: سحب بين المعاينة
--   والترحيل يغيّر القيمة بلا ما تتغيّر النسخة).
-- تراجع: rollback_0010.sql — يرجّع أجسام void_receipt وdiscard_draft وdelete_draft_line وverify_stock وverify_ledger كما بـ0009،
--   وstock_doc_label كما بـ0008، حرفاً بحرف؛ ويشيل الجداول الأربعة ودوالّها ومشغّلاتها وسياسة نطاقها على سجلّ التدقيق؛ ويرفض بصوت إذا
--   أي مرتجع (ولو مسوّدة) أو تصحيح موجود، بلا ما يحذف شي.
-- تنعاد بأمان: if not exists، create or replace، وكتل do تفحص الكتالوج قبل السياسات.

set lock_timeout = '5s';

-- ─── مرتجع المورّد (FOUNDATION ٣٣٥–٣٣٧، ٥٥٣): الرأس من استلام مرحَّل، ومورّده ومخزنه ودفتره منسوخة منه بمشغّل؛ والرقم RT بالترحيل ──
create table if not exists public.supplier_returns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  doc_no text,
  receipt_id uuid not null,
  party_id uuid not null,
  warehouse_id uuid not null,
  book_id uuid not null,
  returned_on date not null,
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
  constraint supplier_returns_status_check check (status in ('draft', 'posted', 'void')),
  constraint supplier_returns_lifecycle_check check ((status = 'draft' and posted_at is null and voided_at is null)
    or (status = 'posted' and posted_at is not null and voided_at is null) or (status = 'void' and voided_at is not null)),
  constraint supplier_returns_numbered_check check ((doc_no is null) = (posted_at is null)),
  constraint supplier_returns_doc_no_check check (doc_no is null or doc_no ~ '^RT-[0-9]{4}-[0-9]{4,}$'),
  constraint supplier_returns_version_check check (version >= 1),
  constraint supplier_returns_note_check check (note is null or length(btrim(note)) between 1 and 500),
  constraint supplier_returns_void_reason_check check (void_reason is null or length(btrim(void_reason)) between 1 and 500),
  unique (org_id, id),
  unique (org_id, id, warehouse_id),
  unique (org_id, doc_no),
  foreign key (org_id, receipt_id, warehouse_id) references public.receipts (org_id, id, warehouse_id),
  foreign key (org_id, party_id) references public.parties (org_id, id),
  foreign key (org_id, book_id) references public.ledger_books (org_id, id)
);
create index if not exists supplier_returns_receipt on public.supplier_returns (org_id, receipt_id, warehouse_id);
create index if not exists supplier_returns_party on public.supplier_returns (org_id, party_id);
create index if not exists supplier_returns_book on public.supplier_returns (org_id, book_id);
create index if not exists supplier_returns_list on public.supplier_returns (org_id, returned_on, created_at, id);

-- سطر المرتجع بلا مال (الأمين، E47): سطر من الاستلام نفسه وكميته بوحدة الأساس؛ المادّة ودفعة السطر (الجذر بمخزن الاستلام، E15)
-- يكتبهما الحارس، ومخزن الرأس منسوخ (E6). سطر واحد لكل سطر استلام.
create table if not exists public.supplier_return_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  doc_id uuid not null,
  warehouse_id uuid not null,
  line_no int not null,
  receipt_line_id uuid not null,
  item_id uuid not null,
  lot_id uuid not null,
  qty_base numeric not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint supplier_return_lines_qty_base_check check (abs(qty_base) < 'Infinity' and qty_base > 0 and qty_base = round(qty_base, 3)),
  constraint supplier_return_lines_line_no_check check (line_no >= 1),
  unique (org_id, id),
  unique (org_id, doc_id, id),
  unique (org_id, doc_id, line_no),
  unique (org_id, doc_id, receipt_line_id),
  foreign key (org_id, doc_id, warehouse_id) references public.supplier_returns (org_id, id, warehouse_id),
  foreign key (org_id, receipt_line_id) references public.receipt_lines (org_id, id),
  foreign key (org_id, item_id) references public.items (org_id, id),
  foreign key (org_id, lot_id) references public.stock_lots (org_id, id)
);
create index if not exists supplier_return_lines_doc on public.supplier_return_lines (org_id, doc_id, warehouse_id);
create index if not exists supplier_return_lines_receipt_line on public.supplier_return_lines (org_id, receipt_line_id);
create index if not exists supplier_return_lines_item on public.supplier_return_lines (org_id, item_id);
create index if not exists supplier_return_lines_lot on public.supplier_return_lines (org_id, lot_id);

-- المبلغ اللي قبله المورّد لكل سطر (جار، FOUNDATION ٣٣٧): دينار صحيح لا يقلّ عن صفر (يدخل دفتره)، لأدوار الكلفة بس.
create table if not exists public.supplier_return_line_amounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  line_id uuid not null,
  doc_id uuid not null,
  warehouse_id uuid not null,
  credit_amount numeric not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint supplier_return_line_amounts_credit_check check (abs(credit_amount) < 'Infinity' and credit_amount >= 0 and credit_amount = round(credit_amount, 0)),
  unique (org_id, id),
  unique (org_id, line_id),
  foreign key (org_id, doc_id, line_id) references public.supplier_return_lines (org_id, doc_id, id),
  foreign key (org_id, doc_id, warehouse_id) references public.supplier_returns (org_id, id, warehouse_id)
);
create index if not exists supplier_return_line_amounts_doc on public.supplier_return_line_amounts (org_id, doc_id, warehouse_id);
create index if not exists supplier_return_line_amounts_line on public.supplier_return_line_amounts (org_id, doc_id, line_id);

-- ─── تصحيح سعر الاستلام بعد السحب (FOUNDATION ١٤١، ٣٣٤، ٥٥٢؛ E5، E16، E51، E55) ──────────────────────────────────────
-- يكتبه post_receipt_revalue بس (§2.5)، ولأدوار الكلفة قراءةً. expense_id بلا مفتاح أجنبي: مسح المصاريف (TRUNCATE) يرفضه مشغّلها
-- append_only برمزه، والمفتاح كان يسبقه بخطأ ثاني؛ والرابط يثبته verify_stock (الفحص 19). لقطات الترحيل: المبلغ الحالي قبله والفرق وحصّة الدفعات والمصروف (E55)،
-- وقيد المورّد ومصروفه. rev_no ترتيب تصحيحات السطر (الحالي = آخر غير ملغى).
create table if not exists public.receipt_revaluations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  receipt_id uuid not null,
  warehouse_id uuid not null,
  receipt_line_id uuid not null,
  rev_no int not null,
  new_total numeric not null,
  old_total numeric not null,
  diff numeric not null,
  lot_share numeric not null,
  expense_amount numeric not null,
  reason text not null,
  status text not null default 'posted',
  client_ref uuid,
  party_entry_id uuid,
  expense_id uuid,
  posted_at timestamptz not null default now(),
  posted_by uuid default auth.uid(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint receipt_revaluations_new_total_check check (abs(new_total) < 'Infinity' and new_total >= 0 and new_total = round(new_total, 0)),
  constraint receipt_revaluations_old_total_check check (abs(old_total) < 'Infinity' and old_total >= 0 and old_total = round(old_total, 0)),
  constraint receipt_revaluations_diff_check check (abs(diff) < 'Infinity' and diff <> 0 and diff = round(diff, 0) and diff = new_total - old_total),
  constraint receipt_revaluations_lot_share_check check (abs(lot_share) < 'Infinity' and lot_share = round(lot_share, 2)),
  constraint receipt_revaluations_expense_check check (abs(expense_amount) < 'Infinity' and expense_amount = round(expense_amount, 2)
    and lot_share + expense_amount = diff),
  constraint receipt_revaluations_reason_check check (length(btrim(reason)) between 1 and 500),
  constraint receipt_revaluations_status_check check (status in ('posted', 'void')),
  constraint receipt_revaluations_lifecycle_check check ((status = 'posted' and voided_at is null and void_reason is null)
    or (status = 'void' and voided_at is not null and void_reason is not null)),
  constraint receipt_revaluations_void_reason_check check (void_reason is null or length(btrim(void_reason)) between 1 and 500),
  constraint receipt_revaluations_rev_no_check check (rev_no >= 1),
  unique (org_id, id),
  unique (org_id, receipt_line_id, rev_no),
  foreign key (org_id, receipt_id, warehouse_id) references public.receipts (org_id, id, warehouse_id),
  foreign key (org_id, receipt_id, receipt_line_id) references public.receipt_lines (org_id, doc_id, id),
  foreign key (org_id, party_entry_id) references public.party_entries (org_id, id)
);
create index if not exists receipt_revaluations_receipt on public.receipt_revaluations (org_id, receipt_id, warehouse_id);
create index if not exists receipt_revaluations_line on public.receipt_revaluations (org_id, receipt_id, receipt_line_id);
create index if not exists receipt_revaluations_entry on public.receipt_revaluations (org_id, party_entry_id);
create index if not exists receipt_revaluations_expense on public.receipt_revaluations (org_id, expense_id);

-- ─── المشغّلات ────────────────────────────────────────────────────────────────────────────────────────────────
-- المورّد والمخزن والدفتر من الاستلام (definer): الجهاز ما يختارها (FOUNDATION ٥٥٣: «بدفتر الاستلام نفسه»)، والاستلام مرحَّل.
create or replace function private.supplier_returns_copy() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.receipts;
begin
  if tg_op = 'UPDATE' then
    return new;
  end if;
  select * into r from public.receipts where org_id = new.org_id and id = new.receipt_id;
  if r.id is null then
    raise exception 'doc_not_found' using hint = 'الاستلام المرتجَع منه غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if r.status <> 'posted' then
    raise exception 'receipt_not_posted' using hint = 'الاستلام ليس مرحَّلاً (مسوّدة أو ملغى)، فلا يُرجَع منه شيء.';
  end if;
  new.party_id := r.party_id;
  new.warehouse_id := r.warehouse_id;
  new.book_id := r.book_id;
  return new;
end
$$;

-- حارس رأس المرتجع (§2.5): invoker لـauthenticated بس. الجديد مسوّدة دائماً، والتعديل المباشر بالتاريخ والملاحظة، والنسخة تزيد.
create or replace function private.supplier_return_header_guard() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  v_free constant text[] := array['returned_on', 'note'];
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status is distinct from 'draft' or new.version is distinct from 1 or new.posted_at is not null or new.voided_at is not null
       or new.client_ref is not null or new.void_reason is not null or new.doc_no is not null then
      raise exception 'not_draft' using hint = 'المرتجع الجديد مسوّدة دائماً؛ الترحيل والإلغاء من دوالّهما.';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free) then
    raise exception 'frozen_column' using hint = 'يُعدَّل في مسوّدة المرتجع تاريخها وملاحظتها فقط؛ الاستلام والمورّد والمخزن والدفتر والحالة والرقم يكتبها الخادم.';
  end if;
  new.version := old.version + 1;
  return new;
end
$$;

-- حارس سطر المرتجع (definer): الرأس مقفول ومسوّدة، والفعل والنطاق، ومخزن الرأس منسوخ، ورقم السطر؛ وسطر الاستلام من استلام الرأس،
-- والمادّة ودفعته الجذر بمخزن الاستلام (E15: المحوَّل يرجع بإلغاء تحويله أوّلاً؛ التحويل العكسي ينشئ دفعة مرآة ولا يعيد الجذر)؛ والقطع أعداد صحيحة. والنسخة تزيد.
create or replace function private.supplier_return_lines_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d public.supplier_returns;
  rl public.receipt_lines;
  l public.stock_lots;
  i public.items;
begin
  set local lock_timeout = '5s';
  if tg_op = 'UPDATE' and (new.doc_id is distinct from old.doc_id or new.receipt_line_id is distinct from old.receipt_line_id) then
    raise exception 'frozen_column' using hint = 'السطر يبقى في مستنده وعلى سطر استلامه؛ احذفه وأضف غيره.';
  end if;
  select * into d from public.supplier_returns where org_id = new.org_id and id = new.doc_id for update;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'المرتجع مرحَّل أو ملغى؛ لا تُعدَّل سطوره.';
  end if;
  perform private.require('receipt.draft');
  if not public.in_scope_wh(d.warehouse_id) then
    raise exception 'out_of_scope' using hint = 'مخزن هذا المرتجع خارج نطاقك.';
  end if;
  new.warehouse_id := d.warehouse_id;
  if tg_op = 'INSERT' then
    new.line_no := coalesce((select max(x.line_no) from public.supplier_return_lines x where x.org_id = d.org_id and x.doc_id = d.id), 0) + 1;
  else
    new.line_no := old.line_no;
  end if;
  select * into rl from public.receipt_lines where org_id = d.org_id and id = new.receipt_line_id and doc_id = d.receipt_id;
  if rl.id is null then
    raise exception 'line_not_found' using hint = 'هذا السطر ليس من الاستلام المرتجَع منه. اختر سطراً من سطوره.';
  end if;
  select * into l from public.stock_lots
  where org_id = d.org_id and source_kind = 'receipt' and source_id = d.receipt_id and source_line_id = rl.id and origin_lot_id is null;
  if l.id is null then
    raise exception 'lot_not_found' using hint = 'لم توجد دفعة هذا السطر في مخزن الاستلام. حدّث الشاشة.';
  end if;
  select * into i from public.items where org_id = d.org_id and id = rl.item_id;
  new.item_id := rl.item_id;
  new.lot_id := l.id;
  if new.qty_base is null or not (abs(new.qty_base) < 'Infinity') or new.qty_base <= 0 then
    raise exception 'qty_not_positive' using hint = 'اكتب كمية أكبر من صفر.';
  end if;
  if i.base_unit = 'pc' and new.qty_base <> trunc(new.qty_base) then
    raise exception 'pieces_not_whole' using hint = format('«%s» تُعدّ بالقطعة، والكمية عدد صحيح.', i.name);
  end if;
  update public.supplier_returns set version = version + 1 where org_id = d.org_id and id = d.id;
  return new;
end
$$;

-- المبلغ المقبول (definer): لأدوار الكلفة بفعل receipt.amounts وبنطاق المخزن، والرأس مقفول ومسوّدة، والنسخة تزيد. السطر قبل الرأس
-- (درس WP5): الإضافة تقفل سطرها for key share أوّلاً، والتعديل صفّه مقفول قبل المشغّل.
create or replace function private.supplier_return_amounts_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d public.supplier_returns;
  ln public.supplier_return_lines;
begin
  set local lock_timeout = '5s';
  if tg_op = 'UPDATE' and new.line_id is distinct from old.line_id then
    raise exception 'frozen_column' using hint = 'المبلغ يبقى على سطره.';
  end if;
  if tg_op = 'INSERT' then
    select * into ln from public.supplier_return_lines where org_id = new.org_id and id = new.line_id for key share;
  else
    select * into ln from public.supplier_return_lines where org_id = new.org_id and id = new.line_id;
  end if;
  if ln.id is null then
    raise exception 'line_not_found' using hint = 'سطر المرتجع غير موجود. حدّث الشاشة.';
  end if;
  new.doc_id := ln.doc_id;
  select * into d from public.supplier_returns where org_id = new.org_id and id = ln.doc_id for update;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'المرتجع مرحَّل أو ملغى؛ لا تُعدَّل مبالغه.';
  end if;
  perform private.require('receipt.amounts');
  if not public.can_see_cost() then
    raise exception 'forbidden' using hint = 'مبالغ المرتجع لأدوار الكلفة فقط.';
  end if;
  if not public.in_scope_wh(d.warehouse_id) then
    raise exception 'out_of_scope' using hint = 'مخزن هذا المرتجع خارج نطاقك.';
  end if;
  new.warehouse_id := d.warehouse_id;
  if new.credit_amount is null or not (abs(new.credit_amount) < 'Infinity') or new.credit_amount < 0 then
    raise exception 'credit_required' using hint = 'اكتب المبلغ الذي قبله المورّد للسطر، ولا يقلّ عن صفر.';
  end if;
  if new.credit_amount <> round(new.credit_amount, 0) then
    raise exception 'credit_not_whole_dinar' using hint = 'المبلغ المقبول بالدينار الصحيح؛ يدخل دفتر المورّد.';
  end if;
  update public.supplier_returns set version = version + 1 where org_id = d.org_id and id = d.id;
  return new;
end
$$;

create or replace trigger supplier_returns_copy before insert or update on public.supplier_returns
  for each row execute function private.supplier_returns_copy();
create or replace trigger supplier_returns_guard before insert or update on public.supplier_returns
  for each row execute function private.supplier_return_header_guard();
create or replace trigger supplier_return_lines_guard before insert or update on public.supplier_return_lines
  for each row execute function private.supplier_return_lines_guard();
create or replace trigger supplier_return_line_amounts_guard before insert or update on public.supplier_return_line_amounts
  for each row execute function private.supplier_return_amounts_guard();

do $$
declare
  t text;
begin
  foreach t in array array['supplier_returns', 'supplier_return_lines', 'supplier_return_line_amounts', 'receipt_revaluations'] loop
    execute format('create or replace trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()', 'audit_' || t, t);
  end loop;
end
$$;

-- ─── RLS: بنطاق المخزن، وجدولا المال لأدوار الكلفة (مقيِّدة، §2.8) ─────────────────────────────────────────────────
alter table public.supplier_returns enable row level security;
alter table public.supplier_return_lines enable row level security;
alter table public.supplier_return_line_amounts enable row level security;
alter table public.receipt_revaluations enable row level security;

do $$
declare
  p record;
  t text;
begin
  foreach t in array array['supplier_returns', 'supplier_return_lines', 'supplier_return_line_amounts', 'receipt_revaluations'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_read') then
      execute format('create policy %I on public.%I for select to authenticated using (org_id = (select public.auth_org()) and (select public.in_scope_wh(warehouse_id)))',
        t || '_read', t);
    end if;
  end loop;
  foreach t in array array['supplier_return_line_amounts', 'receipt_revaluations'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_cost_only') then
      execute format('create policy %I on public.%I as restrictive for select to authenticated using ((select public.can_see_cost()))', t || '_cost_only', t);
    end if;
  end loop;
  -- الكتابة المباشرة (§2.5): الرأس مسوّدة بنطاق مخزنه، والسطر بفعله، والمبلغ بفعل receipt.amounts. التصحيح دالّة بس.
  for p in
    select * from (values
      ('supplier_returns', 'receipt.draft', true),
      ('supplier_return_lines', 'receipt.draft', false),
      ('supplier_return_line_amounts', 'receipt.amounts', false)
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
  -- سجلّ التدقيق يحمل الصفّ كلّه (E49): صفوف المرتجع والتصحيح بمخزنها.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'audit_log_wp7_scope') then
    create policy audit_log_wp7_scope on public.audit_log as restrictive for select to authenticated
      using (case
        when table_name in ('supplier_returns', 'supplier_return_lines', 'supplier_return_line_amounts', 'receipt_revaluations')
          then public.in_scope_wh((coalesce("new", "old") ->> 'warehouse_id')::uuid)
        else true
      end);
  end if;
end
$$;

revoke all on table public.supplier_returns, public.supplier_return_lines, public.supplier_return_line_amounts, public.receipt_revaluations
  from anon, authenticated;
grant select on table public.supplier_returns, public.supplier_return_lines, public.supplier_return_line_amounts, public.receipt_revaluations
  to authenticated;
-- المعرّف يولد بالجهاز للرأس والسطر (FOUNDATION ١٩٩): حفظ يُعاد بعد جواب ضاع يرجع 23505 بدل صفّ ثاني.
grant insert (id, receipt_id, returned_on, note, status) on public.supplier_returns to authenticated;
grant update (returned_on, note, status) on public.supplier_returns to authenticated;
grant insert (id, doc_id, receipt_line_id, qty_base) on public.supplier_return_lines to authenticated;
grant update (qty_base) on public.supplier_return_lines to authenticated;
grant insert (line_id, credit_amount) on public.supplier_return_line_amounts to authenticated;
grant update (credit_amount) on public.supplier_return_line_amounts to authenticated;
revoke truncate on table public.supplier_returns, public.supplier_return_lines, public.supplier_return_line_amounts, public.receipt_revaluations
  from service_role;

-- ─── المساعدات ─────────────────────────────────────────────────────────────────────────────────────────────────
-- اسم المستند للتلميح والعرض (يحلّ محلّ نسخة 0008): يزيد الاستلام (PU) والمرتجع (RT) وتصحيح السعر («تصحيح سعر PU-…»).
create or replace function private.stock_doc_label(p_kind text, p_doc uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case p_kind
    when 'transfer' then coalesce((select t.doc_no from public.transfers t where t.org_id = public.auth_org() and t.id = p_doc), 'تحويل')
    when 'opening' then coalesce((select format('رصيد افتتاح بتاريخ %s', to_char(o.on_date, 'DD/MM/YYYY')) from public.opening_docs o
      where o.org_id = public.auth_org() and o.id = p_doc), 'رصيد افتتاح')
    when 'stock_use' then coalesce((select u.doc_no from public.stock_uses u where u.org_id = public.auth_org() and u.id = p_doc), 'صرف')
    when 'count' then coalesce((select c.doc_no from public.stock_counts c where c.org_id = public.auth_org() and c.id = p_doc), 'جرد')
    when 'count_gain' then coalesce((select c.doc_no from public.stock_counts c where c.org_id = public.auth_org() and c.id = p_doc), 'جرد')
    when 'receipt' then coalesce((select r.doc_no from public.receipts r where r.org_id = public.auth_org() and r.id = p_doc), 'استلام')
    when 'supplier_return' then coalesce((select s.doc_no from public.supplier_returns s where s.org_id = public.auth_org() and s.id = p_doc), 'مرتجع')
    when 'receipt_revalue' then coalesce((select format('تصحيح سعر %s', r.doc_no) from public.receipt_revaluations v
      join public.receipts r on r.org_id = v.org_id and r.id = v.receipt_id where v.org_id = public.auth_org() and v.id = p_doc), 'تصحيح سعر')
    else p_kind
  end
$$;

-- صفوف المرتجع قبل رأسه (§2.3، درس WP5): السطور ومبالغها بترتيب ثابت، لأن حارس كل صفّ يقفل الرأس بعد صفّه.
create or replace function private.lock_return_rows(p_doc uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  set local lock_timeout = '5s';
  perform 1 from public.supplier_return_lines x where x.org_id = public.auth_org() and x.doc_id = p_doc order by x.id for no key update;
  perform 1 from public.supplier_return_line_amounts x where x.org_id = public.auth_org() and x.doc_id = p_doc order by x.line_id for no key update;
end
$$;

-- تفصيل نقص المرتجع (FOUNDATION ٥٥٣): المادّة والمطلوب والمتبقّي بدفعة الاستلام، والمستندات اللي سحبت منها (الأحدث أوّلاً). الرفض
-- والمعاينة يكتبان جملته قبله.
create or replace function private.return_shortage_detail(p_lot uuid, p_qty numeric) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  l public.stock_lots;
  i public.items;
  v_docs text;
begin
  select * into l from public.stock_lots where org_id = public.auth_org() and id = p_lot;
  select * into i from public.items where org_id = l.org_id and id = l.item_id;
  select string_agg(x.label, '، ' order by x.last_seq desc) into v_docs from (
    select private.stock_doc_label(m.doc_kind, m.doc_id) as label, max(m.seq) as last_seq
    from public.stock_moves m
    where m.org_id = l.org_id and m.lot_id = l.id and m.qty < 0 and m.reverses_move_id is null
      and not exists (select 1 from public.stock_moves z where z.org_id = m.org_id and z.reverses_move_id = m.id)
    group by 1
  ) as x;
  return format('«%s»: المطلوب %s والمتبقّي %s.%s', i.name, private.qty_text(p_qty, i.base_unit),
    private.qty_text(l.qty_left, i.base_unit),
    case when v_docs is not null then format(' سُحب منها بالمستندات: %s؛ ألغِ ما يلزم منها أوّلاً (المحوَّل يرجع بإلغاء تحويله، لا بتحويل عكسي).', v_docs) else '' end);
end
$$;

-- حركة لاحقة على دفعة (سحب أصلي ما انعكس، أو تصحيح سعر ما انعكس) بعد حركة المستند: يرفض lot_consumed ويسمّي أحدثها (FOUNDATION ٥٥٣،
-- ٥٩٤: السلسلة تنفكّ من آخرها).
create or replace function private.check_lot_untouched_after(p_lot uuid, p_seq bigint) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  m public.stock_moves;
  v_item text;
begin
  select * into m from public.stock_moves x
  where x.org_id = public.auth_org() and x.lot_id = p_lot and x.seq > p_seq and x.reverses_move_id is null and (x.qty < 0 or x.doc_kind = 'receipt_revalue')
    and not exists (select 1 from public.stock_moves z where z.org_id = x.org_id and z.reverses_move_id = x.id)
  order by x.seq desc limit 1;
  if m.id is null then
    return;
  end if;
  select i.name into v_item from public.items i where i.org_id = m.org_id and i.id = m.item_id;
  raise exception 'lot_consumed' using hint = format('بعد هذا المستند سُجّل على دفعة «%s» المستند %s، فلا يُلغى هذا قبل إلغاء ذلك المستند.',
    v_item, coalesce(private.stock_doc_label(m.doc_kind, m.doc_id), 'آخر'));
end
$$;

-- قيد شراء المورّد الأصلي لاستلامه (مو قيد ناقل، والمورّد ممكن يكون ناقل نفسه بقيد ثاني): يتوزّع عليه المرتجع والتصحيح أوّلاً (E16).
create or replace function private.receipt_purchase_entry(p_receipt uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select x.id from public.party_entries x
  join public.receipts r on r.org_id = x.org_id and r.id = x.doc_id
  where x.org_id = public.auth_org() and x.doc_kind = 'receipt' and x.doc_id = p_receipt and x.kind = 'purchase' and x.party_id = r.party_id
    and x.reverses_entry_id is null
    and not exists (select 1 from public.receipt_charges c where c.org_id = x.org_id and c.party_entry_id = x.id)
  order by x.seq limit 1
$$;

-- ─── مرتجع المورّد (FOUNDATION ٥٥٣؛ E15، E31، E47) ────────────────────────────────────────────────────────────────
-- خيارات المرتجع من استلام (receipt.draft أو receipt.amounts، كميات بس): كل سطر ودفعته الجذر بمخزن الاستلام ومتبقّيها.
create or replace function public.supplier_return_options(p_receipt uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  r public.receipts;
  v_lines jsonb;
begin
  perform private.require(case when public.can('receipt.draft') then 'receipt.draft' else 'receipt.amounts' end);
  select * into r from public.receipts where org_id = public.auth_org() and id = p_receipt;
  if r.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  perform private.stock_wh(r.warehouse_id, true);
  select coalesce(jsonb_agg(jsonb_build_object('receipt_line_id', x.id, 'line_no', x.line_no, 'item_id', x.item_id, 'item_name', i.name,
      'base_unit', x.base_unit, 'qty_received', x.qty_base::text, 'lot_id', l.id, 'qty_left', l.qty_left::text) order by x.line_no), '[]'::jsonb)
  into v_lines
  from public.receipt_lines x
  join public.items i on i.org_id = x.org_id and i.id = x.item_id
  join public.stock_lots l on l.org_id = x.org_id and l.source_kind = 'receipt' and l.source_id = r.id and l.source_line_id = x.id and l.origin_lot_id is null
  where x.org_id = r.org_id and x.doc_id = r.id;
  return jsonb_build_object('receipt_id', r.id, 'receipt_no', r.doc_no, 'party_id', r.party_id,
    'party_name', (select p.name from public.parties p where p.org_id = r.org_id and p.id = r.party_id),
    'warehouse_id', r.warehouse_id, 'received_on', r.received_on, 'status', r.status, 'lines', v_lines);
end
$$;

-- الترحيل (receipt.amounts): من دفعة سطر الاستلام الجذر بمخزن الاستلام بس (E15) بقاعدة قيمة السحب (القاعدة 13، والمنتهي مسموح:
-- FOUNDATION ٤٧٦)، وقيد supplier_return للمورّد بدفتر الاستلام = Σ المقبول يتوزّع على قيد هذا الاستلام أوّلاً (بلا قيد للمقبول صفر)،
-- والفرق (قيمة السحب − المقبول) مصروف تعديل «فرق مرتجع» بإشارته (بلا مصروف للفرق صفر). الأقفال (§2.3): المرجع ← المورّد ← قفل
-- الفترة وصفّ الوحدة ← صفوف المستند ← الرأس ← الاستلام ← المخزن والمواد ← الأرصدة ← الدفعات ← عدّاد المستندات.
create or replace function public.post_supplier_return(p_id uuid, p_expected_version int, p_expected_plan text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'post_supplier_return';
  v_cached jsonb;
  d public.supplier_returns;
  r public.receipts;
  w public.warehouses;
  ln public.supplier_return_lines;
  l public.stock_lots;
  e public.party_entries;
  v_date date;
  v_items uuid[];
  v_item text;
  v_credit numeric;
  v_value numeric;
  v_credit_total numeric := 0;
  v_value_total numeric := 0;
  v_no text;
  v_category uuid;
  v_lines jsonb := '[]'::jsonb;
  v_plan text := '';
begin
  set local lock_timeout = '5s';
  perform private.require('receipt.amounts');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'version', p_expected_version, 'plan', p_expected_plan));
  if v_cached is not null then
    return v_cached;
  end if;
  select * into d from public.supplier_returns where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(d.warehouse_id, true);
  perform private.book_for_post(d.book_id);
  perform private.lock_parties(array[d.party_id]);
  v_date := d.returned_on;
  perform private.check_post_date(v_date, w.division_id);
  perform private.lock_return_rows(d.id);
  select * into d from public.supplier_returns where org_id = w.org_id and id = p_id for update;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'هذا المستند ليس مسوّدة: رُحّل أو أُلغي من قبل.';
  end if;
  if p_expected_version is null or d.version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّرت المسوّدة بعد المعاينة. راجعها وعاينها من جديد قبل الترحيل.';
  end if;
  if d.returned_on is distinct from v_date then
    raise exception 'stale_draft' using hint = 'تغيّر تاريخ المرتجع أثناء الترحيل. راجعه وعاينه من جديد.';
  end if;
  select * into r from public.receipts where org_id = d.org_id and id = d.receipt_id for share;
  if r.status <> 'posted' then
    raise exception 'receipt_not_posted' using hint = 'الاستلام ليس مرحَّلاً (مسوّدة أو ملغى)، فلا يُرجَع منه شيء.';
  end if;
  if d.returned_on < r.received_on then
    raise exception 'return_before_receipt' using hint = format('تاريخ المرتجع %s قبل استلام البضاعة %s؛ اكتب يوم الإرجاع الصحيح.',
      to_char(d.returned_on, 'DD/MM/YYYY'), to_char(r.received_on, 'DD/MM/YYYY'));
  end if;
  select array_agg(distinct x.item_id) into v_items from public.supplier_return_lines x where x.org_id = d.org_id and x.doc_id = d.id;
  if v_items is null then
    raise exception 'return_empty' using hint = 'المرتجع بلا سطور. أضف سطراً واحداً على الأقلّ.';
  end if;
  perform private.lock_masters(array[w.id], v_items, false);
  perform private.lock_balances(v_items, array_fill(w.id, array[cardinality(v_items)]));
  perform 1 from public.stock_lots x
  where x.org_id = d.org_id and x.id in (select y.lot_id from public.supplier_return_lines y where y.org_id = d.org_id and y.doc_id = d.id)
  order by x.id for no key update;
  select x.id into v_category from public.expense_categories x where x.org_id = d.org_id and x.system_code = 'supplier_return_diff';
  for ln in select * from public.supplier_return_lines x where x.org_id = d.org_id and x.doc_id = d.id order by x.line_no loop
    select a.credit_amount into v_credit from public.supplier_return_line_amounts a where a.org_id = ln.org_id and a.line_id = ln.id;
    if v_credit is null then
      select i.name into v_item from public.items i where i.org_id = ln.org_id and i.id = ln.item_id;
      raise exception 'credit_required' using hint = format('اكتب المبلغ الذي قبله المورّد لسطر «%s» (صفر إن لم يقبل شيئاً).', v_item);
    end if;
    select * into l from public.stock_lots where org_id = ln.org_id and id = ln.lot_id;
    if l.qty_left < ln.qty_base then
      raise exception 'insufficient_stock' using hint = format('لا يكفي المتبقّي من دفعة الاستلام لهذا المرتجع: %s', private.return_shortage_detail(l.id, ln.qty_base));
    end if;
    v_value := case when ln.qty_base = l.qty_left then l.value_left else private._mul_div_round2(ln.qty_base, l.value_left, l.qty_left) end;
    v_plan := v_plan || ln.id::text || '|' || private.plan_piece(l.id, l.qty_left, l.value_left) || '|' || private.plan_piece(l.id, ln.qty_base, v_value) || '/';
    perform private.apply_move(l.id, 'supplier_return', d.id, ln.id, -ln.qty_base, -v_value, d.returned_on, null, false);
    v_credit_total := v_credit_total + v_credit;
    v_value_total := v_value_total + v_value;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('line_id', ln.id, 'lot_id', l.id, 'item_id', ln.item_id, 'qty', ln.qty_base::text,
      'money', jsonb_build_object('value', v_value::text, 'credit', v_credit::text)));
  end loop;
  -- قيمة السحب = اللي شافها المحاسب بالمعاينة (FOUNDATION ٥٢٠): سحب أو تصحيح سعر على الدفعة بعد المعاينة يغيّر قيمة المُرجَع، أو
  -- يخلّي السطر ياخذ متبقّيها كلّه بلا تأكيده (E31)، بلا ما تتغيّر نسخة المسوّدة.
  if p_expected_plan is null or private.plan_token(v_plan) is distinct from p_expected_plan then
    raise exception 'stale_preview' using hint = 'تغيّر متبقّي دفعة بعد المعاينة فتغيّرت قيمة المُرجَع. عاين المرتجع من جديد ووافق عليه قبل الترحيل.';
  end if;
  v_no := private.next_doc_no('RT', d.returned_on);
  if v_credit_total > 0 then
    e := private.write_entry(gen_random_uuid(), d.party_id, d.book_id, 'supplier_return', v_credit_total, 'supplier_return', d.id, v_no, d.returned_on, null);
    perform private.allocate_entry(e.id, private.receipt_purchase_entry(r.id));
  end if;
  if v_value_total <> v_credit_total then
    insert into public.expenses (org_id, category_id, division_id, amount, on_date, for_month, source, doc_kind, doc_id)
    values (d.org_id, v_category, w.division_id, v_value_total - v_credit_total, d.returned_on, date_trunc('month', d.returned_on)::date, 'adjustment',
      'supplier_return', d.id);
  end if;
  perform private.mark_division_posted(w.division_id);
  update public.supplier_returns set status = 'posted', doc_no = v_no, posted_at = now(), posted_by = auth.uid(), client_ref = p_client_ref
  where org_id = d.org_id and id = d.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'kind', 'supplier_return', 'status', 'posted', 'doc_no', v_no,
    'version', d.version, 'lines', v_lines,
    'money', jsonb_build_object('value_total', v_value_total::text, 'credit_total', v_credit_total::text, 'diff', (v_value_total - v_credit_total)::text)));
end
$$;

-- الإلغاء (void): البضاعة ترجع لنفس الدفعات بيوم الإلغاء، وقيد المرتجع ينعكس بتوزيعاته (القاعدة 27)، والمصروف بصفّ عكسي. يرفض
-- lot_consumed لو انسحب من دفعة راجعة (أو تصحّح سعرها) بعد المرتجع (FOUNDATION ٥٥٣ حرفياً). العكس يمرّ مع الأرشفة (E43).
create or replace function public.void_supplier_return(p_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_supplier_return';
  v_cached jsonb;
  v_reason text;
  d public.supplier_returns;
  w public.warehouses;
  m public.stock_moves;
  e public.party_entries;
  ex public.expenses;
  v_items uuid[];
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into d from public.supplier_returns where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(d.warehouse_id, true);
  perform private.book_for_post(d.book_id);
  perform private.lock_parties(array[d.party_id]);
  perform private.check_void_date();
  select * into d from public.supplier_returns where org_id = w.org_id and id = p_id for update;
  if d.status = 'void' then
    raise exception 'already_void' using hint = 'هذا المرتجع ملغى من قبل.';
  end if;
  if d.status <> 'posted' then
    raise exception 'not_posted' using hint = 'هذا المرتجع مسوّدة لم تُرحَّل؛ تُطوى المسوّدة بدل إلغائها.';
  end if;
  select array_agg(distinct x.item_id) into v_items from public.stock_moves x where x.org_id = d.org_id and x.doc_kind = 'supplier_return' and x.doc_id = d.id;
  perform private.lock_masters(array[w.id], v_items, false);
  perform private.lock_balances(v_items, array_fill(w.id, array[cardinality(v_items)]));
  perform 1 from public.stock_lots x
  where x.org_id = d.org_id and x.id in (select y.lot_id from public.stock_moves y where y.org_id = d.org_id and y.doc_kind = 'supplier_return' and y.doc_id = d.id)
  order by x.id for no key update;
  for m in
    select y.* from public.stock_moves y
    where y.org_id = d.org_id and y.doc_kind = 'supplier_return' and y.doc_id = d.id and y.reverses_move_id is null
    order by y.lot_id, y.seq
  loop
    perform private.check_lot_untouched_after(m.lot_id, m.seq);
    perform private.apply_move(m.lot_id, 'supplier_return', d.id, m.doc_line_id, -m.qty, -m.value, public.app_today(), m.id);
  end loop;
  for e in
    select y.* from public.party_entries y
    where y.org_id = d.org_id and y.doc_kind = 'supplier_return' and y.doc_id = d.id and y.reverses_entry_id is null
      and not exists (select 1 from public.party_entries z where z.org_id = y.org_id and z.reverses_entry_id = y.id)
    order by y.seq
  loop
    perform private.void_entry(e.id, v_reason);
  end loop;
  for ex in
    select y.* from public.expenses y
    where y.org_id = d.org_id and y.doc_kind = 'supplier_return' and y.doc_id = d.id and y.reverses_id is null
      and not exists (select 1 from public.expenses z where z.org_id = y.org_id and z.reverses_id = y.id)
    order by y.id
  loop
    perform private.reverse_stock_expense(ex.id, v_reason);
  end loop;
  update public.supplier_returns set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
  where org_id = d.org_id and id = d.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'kind', 'supplier_return', 'status', 'void', 'doc_no', d.doc_no));
end
$$;

-- المعاينة (receipt.draft أو receipt.amounts): نفس الفحوص بلا كتابة ولا قفل (FOUNDATION ٧٧٠)؛ الكميات ومتبقّي الدفعة للأمين، وقيمة
-- السحب والمقبول و«فرق مرتجع» لأدوار الكلفة بس. «جاهزة» لأدوار الكلفة بس (الأمين ما يرحّل).
create or replace function public.preview_supplier_return(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d public.supplier_returns;
  r public.receipts;
  w public.warehouses;
  c record;
  v_cost boolean := public.can_see_cost();
  v_problems jsonb := '[]'::jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_money jsonb := '[]'::jsonb;
  v_date jsonb;
  v_problem jsonb;
  v_value numeric;
  v_value_total numeric := 0;
  v_credit_total numeric := 0;
  v_missing boolean := false;
  v_line_problems boolean := false;
  v_plan text := '';
begin
  perform private.require(case when public.can('receipt.draft') then 'receipt.draft' else 'receipt.amounts' end);
  select * into d from public.supplier_returns where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(d.warehouse_id, true);
  select * into r from public.receipts where org_id = d.org_id and id = d.receipt_id;
  if d.status <> 'draft' then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'not_draft', 'hint', 'هذا المستند ليس مسوّدة.'));
  end if;
  v_date := private.date_problem(d.returned_on, w.division_id, false);
  if v_date is not null then
    v_problems := v_problems || jsonb_build_array(v_date);
  end if;
  if r.status <> 'posted' then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'receipt_not_posted', 'hint', 'الاستلام ليس مرحَّلاً (مسوّدة أو ملغى)، فلا يُرجَع منه شيء.'));
  end if;
  if d.returned_on < r.received_on then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'return_before_receipt', 'hint',
      format('تاريخ المرتجع %s قبل استلام البضاعة %s؛ اكتب يوم الإرجاع الصحيح.', to_char(d.returned_on, 'DD/MM/YYYY'), to_char(r.received_on, 'DD/MM/YYYY'))));
  end if;
  for c in
    select x.id, x.line_no, x.receipt_line_id, x.item_id, x.lot_id, x.qty_base, i.name as item_name, i.base_unit, i.tracks_expiry,
      l.qty_left, l.value_left, l.expiry_on, a.credit_amount
    from public.supplier_return_lines x
    join public.items i on i.org_id = x.org_id and i.id = x.item_id
    join public.stock_lots l on l.org_id = x.org_id and l.id = x.lot_id
    left join public.supplier_return_line_amounts a on a.org_id = x.org_id and a.line_id = x.id
    where x.org_id = d.org_id and x.doc_id = d.id
    order by x.line_no
  loop
    v_problem := case when c.qty_base > c.qty_left then jsonb_build_object('code', 'insufficient_stock',
      'hint', format('لا يكفي المتبقّي من دفعة الاستلام لهذا المرتجع: %s', private.return_shortage_detail(c.lot_id, c.qty_base))) end;
    v_line_problems := v_line_problems or v_problem is not null;
    v_value := case when v_problem is not null then null when c.qty_base = c.qty_left then c.value_left
      else private._mul_div_round2(c.qty_base, c.value_left, c.qty_left) end;
    -- بصمة الترحيل (stale_preview): الدفعة بمتبقّيها وقيمته، والسطر بكميته وقيمة سحبه (صفر لسطر بمشكلة: الترحيل يرفضه قبلها).
    v_plan := v_plan || c.id::text || '|' || private.plan_piece(c.lot_id, c.qty_left, c.value_left) || '|' || private.plan_piece(c.lot_id, c.qty_base, coalesce(v_value, 0)) || '/';
    v_missing := v_missing or c.credit_amount is null;
    v_value_total := v_value_total + coalesce(v_value, 0);
    v_credit_total := v_credit_total + coalesce(c.credit_amount, 0);
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('line_id', c.id, 'line_no', c.line_no, 'receipt_line_id', c.receipt_line_id,
      'item_id', c.item_id, 'item_name', c.item_name, 'base_unit', c.base_unit, 'qty', c.qty_base::text, 'lot_id', c.lot_id,
      'lot_qty_left', c.qty_left::text, 'whole_balance', c.qty_base = c.qty_left, 'problem', v_problem,
      'warning', case when private.lot_expired(c.tracks_expiry, c.expiry_on, d.returned_on) then jsonb_build_object('code', 'expired_lot',
        'hint', format('دفعة «%s» منتهية الصلاحية؛ يُرجعها المرتجع إلى المورّد.', c.item_name)) end));
    v_money := v_money || jsonb_build_array(jsonb_build_object('line_id', c.id, 'value', v_value::text, 'credit', c.credit_amount::text,
      'diff', case when v_value is not null and c.credit_amount is not null then (v_value - c.credit_amount)::text end));
  end loop;
  if jsonb_array_length(v_lines) = 0 then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'return_empty', 'hint', 'المرتجع بلا سطور. أضف سطراً واحداً على الأقلّ.'));
  end if;
  if v_cost and v_missing then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'credit_required', 'hint', 'اكتب المبلغ الذي قبله المورّد لكل سطر (صفر إن لم يقبل شيئاً).'));
  end if;
  return private.mask(jsonb_build_object('id', d.id, 'kind', 'supplier_return', 'status', d.status, 'version', d.version, 'receipt_id', r.id,
    'receipt_no', r.doc_no, 'party_id', d.party_id, 'warehouse_id', d.warehouse_id, 'book_id', d.book_id, 'returned_on', d.returned_on,
    'problems', v_problems, 'lines', v_lines, 'plan', private.plan_token(v_plan),
    'ready', v_cost and jsonb_array_length(v_problems) = 0 and jsonb_array_length(v_lines) > 0 and not v_line_problems,
    'money', jsonb_build_object('lines', v_money, 'value_total', v_value_total::text, 'credit_total', v_credit_total::text,
      'diff_total', (v_value_total - v_credit_total)::text)));
end
$$;

-- ─── تصحيح سعر الاستلام (FOUNDATION ١٤١، ٥٥٢؛ E5، E16، E51، E55) ──────────────────────────────────────────────────
-- الحساب بلا كتابة (المعاينة والترحيل بعد أقفاله): الحالي = آخر تصحيح غير ملغى وإلا مبلغ السطر، والفرق = الجديد − الحالي (الخصم ما
-- ينعاد توزيعه، E51)؛ العائلة = دفعة السطر الجذر ومراياها (E5)، وحصّة المتبقّي = _mul_div_round2(Σ متبقّيها، الفرق، داخل الجذر) موزّعة
-- بأكبر الباقي على اللي متبقّيها > 0 بالترتيب (الجذر ثم المرايا بالمعرّف) وزنها متبقّيها، والباقي مصروف «فرق سعر شراء». أوّل مشكلة
-- بـproblem (ما ترفض هنا). وplan بصمة اللي شافه المدير (المبلغان وكل دفعة بمتبقّيها وحصّتها): الترحيل يرفض stale_preview لو تغيّرت
-- (سحب بين المعاينة والترحيل كان يرحّل قسمة ما انشافت، FOUNDATION ٥٢٠، مثل بصمة التحويل).
create or replace function private.revalue_plan(p_line uuid, p_new_total numeric) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  root public.stock_lots;
  v_current numeric;
  v_diff numeric;
  v_ids uuid[];
  v_whs uuid[];
  v_names text[];
  v_ql numeric[];
  v_vl numeric[];
  v_sum numeric;
  v_share numeric := 0;
  v_shares numeric[] := '{}';
  v_lots jsonb := '[]'::jsonb;
  v_problem jsonb;
  v_item text;
  v_pieces text := '';
  v_out text;
  k int;
begin
  select * into root from public.stock_lots
  where org_id = v_org and source_kind = 'receipt' and source_line_id = p_line and origin_lot_id is null;
  select i.name into v_item from public.items i where i.org_id = v_org and i.id = root.item_id;
  v_current := coalesce(
    (select v.new_total from public.receipt_revaluations v where v.org_id = v_org and v.receipt_line_id = p_line and v.status = 'posted'
      order by v.rev_no desc limit 1),
    (select a.line_total from public.receipt_line_amounts a where a.org_id = v_org and a.line_id = p_line));
  select coalesce(array_agg(l.id order by l.id <> root.id, l.id), '{}'), coalesce(array_agg(l.warehouse_id order by l.id <> root.id, l.id), '{}'),
    coalesce(array_agg(w.name order by l.id <> root.id, l.id), '{}'),
    coalesce(array_agg(l.qty_left order by l.id <> root.id, l.id), '{}'), coalesce(array_agg(l.value_left order by l.id <> root.id, l.id), '{}')
  into v_ids, v_whs, v_names, v_ql, v_vl
  from public.stock_lots l join public.warehouses w on w.org_id = l.org_id and w.id = l.warehouse_id
  where l.org_id = v_org and (l.id = root.id or l.origin_lot_id = root.id) and l.qty_left > 0;
  v_sum := coalesce((select sum(x) from unnest(v_ql) as x), 0);
  select w.name into v_out from unnest(v_whs) as x(id) join public.warehouses w on w.org_id = v_org and w.id = x.id
  where not public.in_scope_wh(x.id) order by w.name limit 1;
  if v_out is not null then
    v_problem := jsonb_build_object('code', 'out_of_scope', 'hint', format('مخزن «%s» خارج نطاقك، وفيه دفعة من هذا السطر يمسّها التصحيح.', v_out));
  elsif p_new_total is null or not (abs(p_new_total) < 'Infinity') or p_new_total < 0 then
    v_problem := jsonb_build_object('code', 'negative_total', 'hint', 'اكتب المبلغ الجديد للسطر رقماً لا يقلّ عن صفر.');
  elsif p_new_total <> round(p_new_total, 0) then
    v_problem := jsonb_build_object('code', 'amount_not_whole_dinar', 'hint', 'المبلغ الجديد للسطر بالدينار الصحيح كما يحاسبك المورّد.');
  elsif p_new_total = v_current then
    v_problem := jsonb_build_object('code', 'same_total', 'hint', format('المبلغ الجديد يساوي مبلغ «%s» الحالي (%s)؛ لا تصحيح.', v_item,
      to_char(v_current, 'FM999,999,999,999,990')));
  elsif v_sum = root.qty_in then
    v_problem := jsonb_build_object('code', 'not_drawn', 'hint', format('لم يُسحب من دفعة «%s» شيء بعد؛ ألغِ الاستلام وأعد ترحيله بالمبلغ الصحيح.', v_item));
  end if;
  if v_problem is null or v_problem ->> 'code' = 'not_drawn' then
    v_diff := p_new_total - v_current;
    -- العائلة كلها انسحبت: حصّة صفر والفرق كلّه مصروف (_mul_div_round يرفض كمية صفر، فحص الخصائص v5).
    v_share := case when v_sum = 0 then 0 else private._mul_div_round2(v_sum, v_diff, root.qty_in) end;
    if cardinality(v_ids) > 0 then
      v_shares := private.alloc_lr(v_share, v_ql, 2);
    end if;
  end if;
  for k in 1 .. coalesce(cardinality(v_ids), 0) loop
    if v_problem is null and v_vl[k] + v_shares[k] < 0 then
      v_problem := jsonb_build_object('code', 'negative_value', 'hint', format('التصحيح يجعل قيمة دفعة «%s» في «%s» سالبة؛ راجع المبلغ الجديد.', v_item, v_names[k]));
    end if;
    v_lots := v_lots || jsonb_build_array(jsonb_build_object('lot_id', v_ids[k], 'warehouse_id', v_whs[k], 'warehouse_name', v_names[k],
      'qty_left', v_ql[k]::text, 'value_left', v_vl[k]::text, 'share', coalesce(v_shares[k], 0)::text));
    v_pieces := v_pieces || '|' || private.plan_piece(v_ids[k], v_ql[k], v_vl[k] + coalesce(v_shares[k], 0));
  end loop;
  return jsonb_build_object('root_lot_id', root.id, 'item_id', root.item_id, 'item_name', v_item, 'qty_in', root.qty_in::text,
    'current_total', v_current::text, 'new_total', p_new_total::text, 'diff', v_diff::text, 'lot_share', v_share::text,
    'expense_amount', (v_diff - v_share)::text, 'supplier_adjustment', (-v_diff)::text, 'family', v_lots, 'problem', v_problem,
    'plan', private.plan_token(coalesce(v_current::text, '') || ':' || coalesce(p_new_total::text, '') || v_pieces));
end
$$;

-- رفض بمشكلة التصحيح ({code, hint}).
create or replace function private.raise_revalue_problem(p_problem jsonb) returns void
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare
  v_hint text := p_problem ->> 'hint';
begin
  if p_problem is null or jsonb_typeof(p_problem) = 'null' then
    return;
  end if;
  case p_problem ->> 'code'
    when 'negative_total' then raise exception 'negative_total' using hint = coalesce(v_hint, 'المبلغ الجديد لا يقلّ عن صفر.');
    when 'amount_not_whole_dinar' then raise exception 'amount_not_whole_dinar' using hint = coalesce(v_hint, 'المبلغ بالدينار الصحيح.');
    when 'same_total' then raise exception 'same_total' using hint = coalesce(v_hint, 'المبلغ الجديد يساوي الحالي.');
    when 'not_drawn' then raise exception 'not_drawn' using hint = coalesce(v_hint, 'لم يُسحب من الدفعة شيء بعد؛ ألغِ الاستلام وأعده.');
    when 'negative_value' then raise exception 'negative_value' using hint = coalesce(v_hint, 'التصحيح يجعل قيمة دفعة سالبة.');
    when 'out_of_scope' then raise exception 'out_of_scope' using hint = coalesce(v_hint, 'مخزن دفعة يمسّها التصحيح خارج نطاقك.');
    else raise exception 'rejected' using hint = coalesce(v_hint, 'رُفض الطلب.');
  end case;
end
$$;

-- المعاينة (receipt.revalue): الحصص على الدفعة ومراياها، والمصروف، وقيد المورّد؛ بلا كتابة ولا قفل.
create or replace function public.preview_receipt_revalue(p_line uuid, p_new_total numeric) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  ln public.receipt_lines;
  r public.receipts;
  w public.warehouses;
  v_plan jsonb;
  v_problems jsonb := '[]'::jsonb;
  v_item text;
  v_party text;
begin
  perform private.require('receipt.revalue');
  select * into ln from public.receipt_lines where org_id = public.auth_org() and id = p_line;
  if ln.id is null then
    raise exception 'line_not_found' using hint = 'سطر الاستلام غير موجود. حدّث الشاشة.';
  end if;
  select * into r from public.receipts where org_id = ln.org_id and id = ln.doc_id;
  w := private.stock_wh(r.warehouse_id, true);
  if r.status <> 'posted' then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'receipt_not_posted', 'hint', 'يُصحَّح سعر سطر من استلام مرحَّل فقط.'));
  else
    v_plan := private.revalue_plan(ln.id, p_new_total);
    if v_plan -> 'problem' ->> 'code' = 'out_of_scope' then
      v_plan := jsonb_build_object('problem', v_plan -> 'problem');
    end if;
    if jsonb_typeof(v_plan -> 'problem') = 'object' then
      v_problems := v_problems || jsonb_build_array(v_plan -> 'problem');
    end if;
  end if;
  select p.name into v_party from public.parties p where p.org_id = r.org_id and p.id = r.party_id and p.archived_at is not null;
  if v_party is not null then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'party_archived', 'hint',
      format('الجهة «%s» مؤرشفة، فلا يُسجَّل عليها قيد التصحيح. أعِدها من الأرشيف أوّلاً.', v_party)));
  end if;
  select i.name into v_item from public.items i where i.org_id = ln.org_id and i.id = ln.item_id;
  return jsonb_build_object('item_id', ln.item_id, 'item_name', v_item, 'qty_in', ln.qty_base::text) || coalesce(v_plan - 'problem', '{}'::jsonb)
    || jsonb_build_object('line_id', ln.id, 'receipt_id', r.id, 'receipt_no', r.doc_no,
    'base_unit', ln.base_unit, 'problems', v_problems, 'ready', jsonb_array_length(v_problems) = 0);
end
$$;

-- الترحيل (receipt.revalue، المدير) بالبصمة اللي شافها (stale_preview لو تغيّرت): حركة receipt_revalue بكمية صفر وقيمة حصّتها على كل دفعة بالعائلة (الداخل والمتبقّي يزيدان بها)،
-- ومصروف «فرق سعر شراء» بالباقي بإشارته (بلا مصروف للصفر)، وقيد adjustment للمورّد بدفتر الاستلام = −الفرق يتوزّع على قيد
-- استلامه أوّلاً (E16). الأقفال (§2.3): المرجع ← المورّد ← قفل الفترة وصفّ الوحدة ← الاستلام ← المخازن والمادّة ← الأرصدة ← الدفعات.
create or replace function public.post_receipt_revalue(p_line uuid, p_new_total numeric, p_expected_plan text, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'post_receipt_revalue';
  v_cached jsonb;
  v_reason text;
  ln public.receipt_lines;
  r public.receipts;
  w public.warehouses;
  e public.party_entries;
  v_id uuid := gen_random_uuid();
  v_plan jsonb;
  v_root uuid;
  v_whs uuid[];
  v_diff numeric;
  v_share numeric;
  v_expense numeric;
  v_expense_id uuid;
  v_category uuid;
  v_rev_no int;
  f record;
begin
  set local lock_timeout = '5s';
  perform private.require('receipt.revalue');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('line', p_line, 'new_total', p_new_total, 'plan', p_expected_plan, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into ln from public.receipt_lines where org_id = public.auth_org() and id = p_line;
  if ln.id is null then
    raise exception 'line_not_found' using hint = 'سطر الاستلام غير موجود. حدّث الشاشة.';
  end if;
  select * into r from public.receipts where org_id = ln.org_id and id = ln.doc_id;
  w := private.stock_wh(r.warehouse_id, true);
  perform private.book_for_post(r.book_id);
  perform private.lock_parties(array[r.party_id]);
  perform private.check_post_date(public.app_today(), w.division_id);
  select * into r from public.receipts where org_id = ln.org_id and id = ln.doc_id for share;
  if r.status <> 'posted' then
    raise exception 'receipt_not_posted' using hint = 'يُصحَّح سعر سطر من استلام مرحَّل فقط.';
  end if;
  select l.id into v_root from public.stock_lots l
  where l.org_id = r.org_id and l.source_kind = 'receipt' and l.source_id = r.id and l.source_line_id = ln.id and l.origin_lot_id is null;
  select array_agg(distinct l.warehouse_id) into v_whs from public.stock_lots l where l.org_id = r.org_id and (l.id = v_root or l.origin_lot_id = v_root);
  perform private.lock_masters(v_whs, array[ln.item_id], false);
  perform private.lock_balances(array_fill(ln.item_id, array[cardinality(v_whs)]), v_whs);
  perform 1 from public.stock_lots l where l.org_id = r.org_id and (l.id = v_root or l.origin_lot_id = v_root) order by l.id for no key update;
  v_plan := private.revalue_plan(ln.id, p_new_total);
  perform private.raise_revalue_problem(v_plan -> 'problem');
  if p_expected_plan is null or p_expected_plan is distinct from v_plan ->> 'plan' then
    raise exception 'stale_preview' using hint = 'تغيّرت دفعات السطر أو مبلغه الحالي بعد المعاينة؛ عاين التصحيح من جديد قبل ترحيله.';
  end if;
  v_diff := (v_plan ->> 'diff')::numeric;
  v_share := (v_plan ->> 'lot_share')::numeric;
  v_expense := v_diff - v_share;
  v_rev_no := coalesce((select max(v.rev_no) from public.receipt_revaluations v where v.org_id = r.org_id and v.receipt_line_id = ln.id), 0) + 1;
  insert into public.receipt_revaluations (id, org_id, receipt_id, warehouse_id, receipt_line_id, rev_no, new_total, old_total, diff, lot_share,
    expense_amount, reason, status, client_ref)
  values (v_id, r.org_id, r.id, r.warehouse_id, ln.id, v_rev_no, p_new_total, (v_plan ->> 'current_total')::numeric, v_diff, v_share, v_expense,
    v_reason, 'posted', p_client_ref);
  for f in select (x.value ->> 'lot_id')::uuid as lot_id, (x.value ->> 'share')::numeric as share from jsonb_array_elements(v_plan -> 'family') as x loop
    continue when f.share = 0;
    perform private.apply_move(f.lot_id, 'receipt_revalue', v_id, ln.id, 0, f.share, public.app_today(), null);
    update public.stock_lots set value_in = value_in + f.share where org_id = r.org_id and id = f.lot_id;
  end loop;
  if v_expense <> 0 then
    select x.id into v_category from public.expense_categories x where x.org_id = r.org_id and x.system_code = 'purchase_price_diff';
    insert into public.expenses (org_id, category_id, division_id, amount, on_date, for_month, source, doc_kind, doc_id)
    values (r.org_id, v_category, w.division_id, v_expense, public.app_today(), date_trunc('month', public.app_today())::date, 'adjustment',
      'receipt_revalue', v_id)
    returning id into v_expense_id;
  end if;
  e := private.write_entry(gen_random_uuid(), r.party_id, r.book_id, 'adjustment', -v_diff, 'receipt_revalue', v_id, r.doc_no, public.app_today(), v_reason);
  perform private.allocate_entry(e.id, private.receipt_purchase_entry(r.id));
  perform private.mark_division_posted(w.division_id);
  update public.receipt_revaluations set party_entry_id = e.id, expense_id = v_expense_id where org_id = r.org_id and id = v_id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', v_id, 'kind', 'receipt_revalue', 'receipt_id', r.id, 'line_id', ln.id,
    'old_total', v_plan ->> 'current_total', 'new_total', p_new_total::text, 'diff', v_diff::text, 'lot_share', v_share::text,
    'expense_amount', v_expense::text));
end
$$;

-- الإلغاء (void): حركات التقييم تنعكس على نفس الدفعات (الداخل والمتبقّي ينقصان بها)، والمصروف بصفّ عكسي، والقيد بتوزيعاته. يرفض
-- newer_revaluation لو بعده تصحيح غير ملغى لنفس السطر، وlot_consumed لو انسحب من دفعة بالعائلة بعده.
create or replace function public.void_receipt_revalue(p_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_receipt_revalue';
  v_cached jsonb;
  v_reason text;
  v public.receipt_revaluations;
  r public.receipts;
  w public.warehouses;
  m public.stock_moves;
  v_whs uuid[];
  v_item uuid;
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into v from public.receipt_revaluations where org_id = public.auth_org() and id = p_id;
  if v.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  select * into r from public.receipts where org_id = v.org_id and id = v.receipt_id;
  w := private.stock_wh(r.warehouse_id, true);
  perform private.book_for_post(r.book_id);
  perform private.lock_parties(array[r.party_id]);
  perform private.check_void_date();
  select * into v from public.receipt_revaluations where org_id = r.org_id and id = p_id for update;
  if v.status = 'void' then
    raise exception 'already_void' using hint = 'هذا التصحيح ملغى من قبل.';
  end if;
  if exists (select 1 from public.receipt_revaluations x where x.org_id = v.org_id and x.receipt_line_id = v.receipt_line_id and x.rev_no > v.rev_no
    and x.status = 'posted') then
    raise exception 'newer_revaluation' using hint = 'بعد هذا التصحيح تصحيح أحدث لنفس السطر لم يُلغَ؛ ألغِ الأحدث أوّلاً.';
  end if;
  select l.item_id into v_item from public.stock_lots l where l.org_id = r.org_id and l.source_kind = 'receipt' and l.source_line_id = v.receipt_line_id
    and l.origin_lot_id is null;
  select array_agg(distinct x.warehouse_id) into v_whs from public.stock_moves x where x.org_id = v.org_id and x.doc_kind = 'receipt_revalue' and x.doc_id = v.id;
  if v_whs is not null then
    perform private.lock_masters(v_whs, array[v_item], false);
    perform private.lock_balances(array_fill(v_item, array[cardinality(v_whs)]), v_whs);
    perform 1 from public.stock_lots x
    where x.org_id = v.org_id and x.id in (select y.lot_id from public.stock_moves y where y.org_id = v.org_id and y.doc_kind = 'receipt_revalue' and y.doc_id = v.id)
    order by x.id for no key update;
  end if;
  for m in
    select y.* from public.stock_moves y
    where y.org_id = v.org_id and y.doc_kind = 'receipt_revalue' and y.doc_id = v.id and y.reverses_move_id is null
    order by y.lot_id, y.seq
  loop
    perform private.check_lot_untouched_after(m.lot_id, m.seq);
    perform private.apply_move(m.lot_id, 'receipt_revalue', v.id, m.doc_line_id, 0, -m.value, public.app_today(), m.id);
    update public.stock_lots set value_in = value_in - m.value where org_id = v.org_id and id = m.lot_id;
  end loop;
  if v.expense_id is not null then
    perform private.reverse_stock_expense(v.expense_id, v_reason);
  end if;
  perform private.void_entry(v.party_entry_id, v_reason);
  update public.receipt_revaluations set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
  where org_id = v.org_id and id = v.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', v.id, 'kind', 'receipt_revalue', 'status', 'void', 'receipt_id', r.id,
    'line_id', v.receipt_line_id));
end
$$;

-- ─── الدوالّ المستبدلة (نفس التواقيع): void_receipt يسمّي التوابع، والمسوّدات تزيد المرتجع، والثوابت تزيد WP7 ──────────────────
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
  v_deps text;
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
  -- التابع الحيّ يرفض ويُسمّى (FOUNDATION ٥٥١، WP7): مرتجع مرحَّل منه أو تصحيح سعر مرحَّل على سطوره؛ السلسلة تنفكّ من آخرها.
  select string_agg(x.doc_no, '، ' order by x.doc_no) into v_deps from public.supplier_returns x
  where x.org_id = d.org_id and x.receipt_id = d.id and x.status = 'posted';
  if v_deps is not null then
    raise exception 'has_supplier_returns' using hint = format('على هذا الاستلام مرتجع مرحَّل (%s)؛ ألغِ المرتجع أوّلاً.', v_deps);
  end if;
  select string_agg(distinct i.name, '، ') into v_deps from public.receipt_revaluations x
  join public.receipt_lines y on y.org_id = x.org_id and y.id = x.receipt_line_id
  join public.items i on i.org_id = y.org_id and i.id = y.item_id
  where x.org_id = d.org_id and x.receipt_id = d.id and x.status = 'posted';
  if v_deps is not null then
    raise exception 'has_revaluation' using hint = format('على هذا الاستلام تصحيح سعر مرحَّل لـ«%s»؛ ألغِ التصحيح أوّلاً.', v_deps);
  end if;
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
  elsif p_doc_kind = 'supplier_return' then
    perform private.require('receipt.draft');
    select status, version, warehouse_id into v_status, v_version, v_wh from public.supplier_returns
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
  elsif p_doc_kind = 'supplier_return' then
    update public.supplier_returns set status = 'void', voided_at = now(), voided_by = auth.uid(), version = version + 1
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
  elsif p_doc_kind = 'supplier_return' then
    perform private.require('receipt.draft');
    select doc_id into v_doc from public.supplier_return_lines where org_id = public.auth_org() and id = p_line_id for update;
    -- مبلغ السطر قبل الرأس مثل حارسه (الأمين ما يشوفه، فحذفه المباشر كان يرفض 23503).
    perform 1 from public.supplier_return_line_amounts where org_id = public.auth_org() and line_id = p_line_id for update;
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
  elsif p_doc_kind = 'supplier_return' then
    select status, version, warehouse_id into v_status, v_version, v_wh from public.supplier_returns
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
  elsif p_doc_kind = 'supplier_return' then
    delete from public.supplier_return_line_amounts where org_id = public.auth_org() and line_id = p_line_id;
    delete from public.supplier_return_lines where org_id = public.auth_org() and id = p_line_id;
    update public.supplier_returns set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  else
    delete from public.stock_count_line_costs where org_id = public.auth_org() and line_id = p_line_id;
    delete from public.stock_count_lines where org_id = public.auth_org() and id = p_line_id;
    update public.stock_counts set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  end if;
  return jsonb_build_object('line_id', p_line_id, 'deleted', true, 'doc_id', v_doc, 'version', v_version + 1);
end
$$;

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
  where mi.qty is null or mo.qty is null or mo.qty <> -mi.qty or mo.value <> -mi.value or m.qty_in <> mi.qty or m.value_in <> mi.value + coalesce((select sum(z.value) from public.stock_moves z where z.org_id = m.org_id and z.lot_id = m.id and z.doc_kind = 'receipt_revalue'), 0)
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
        join public.receipts r on r.org_id = a.org_id and r.id = a.doc_id where a.org_id = o.id and r.status = 'posted'), 0)
      + coalesce((select sum(v.lot_share) from public.receipt_revaluations v where v.org_id = o.id and v.status = 'posted'), 0) as inputs,
      coalesce((select sum(l.value_left) from public.stock_lots l where l.org_id = o.id), 0)
      + coalesce((select sum(e.amount) from public.expenses e where e.org_id = o.id and e.source = 'stock'), 0)
      + coalesce((select sum(p.amount) from public.party_entries p where p.org_id = o.id and p.kind = 'supplier_return'), 0)
      + coalesce((select sum(x.amount) from public.expenses x join public.expense_categories k on k.org_id = x.org_id and k.id = x.category_id
          where x.org_id = o.id and x.doc_kind = 'supplier_return' and k.system_code = 'supplier_return_diff'), 0) as outputs
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
    union all
    -- المرتجع (WP7، E15): سطر المرحَّل (والملغى بعد ترحيله) سحب واحد بكميته بالضبط من دفعته (دفعة سطر الاستلام الجذر بمخزنه) بيوم
    --     المرتجع وبلا قاعدة الانتهاء (المنتهي يُرجَع، FOUNDATION ٤٧٦)، والمسوّدة والمطويّة بلا حركات؛ والمرحَّل بلا عكسية والملغى كل
    --     أصلية معكوسة؛ وكل حركة مرتجع بسطر من مستند مرحَّل، أصليتها سالبة.
    select sl.id from public.supplier_return_lines sl
    join public.supplier_returns s on s.org_id = sl.org_id and s.id = sl.doc_id
    cross join lateral (
      select coalesce(sum(-x.qty), 0) as drawn, count(*) as pieces,
        count(*) filter (where x.lot_id <> sl.lot_id or x.moved_on <> s.returned_on or x.expiry_checked is distinct from false) as foreign_pieces,
        count(*) filter (where exists (select 1 from public.stock_moves z where z.org_id = x.org_id and z.reverses_move_id = x.id)) as reversed
      from public.stock_moves x
      where x.org_id = sl.org_id and x.doc_kind = 'supplier_return' and x.doc_id = sl.doc_id and x.doc_line_id = sl.id and x.reverses_move_id is null
    ) as m
    where (s.posted_at is not null and (m.drawn <> sl.qty_base or m.pieces <> 1)) or (s.posted_at is null and m.pieces > 0) or m.foreign_pieces > 0
      or (s.status = 'posted' and m.reversed > 0) or (s.status = 'void' and m.reversed <> m.pieces)
      or not exists (select 1 from public.stock_lots l join public.receipt_lines rl on rl.org_id = l.org_id and rl.id = l.source_line_id
        where l.org_id = sl.org_id and l.id = sl.lot_id and l.source_kind = 'receipt' and l.source_id = s.receipt_id and l.origin_lot_id is null
          and l.warehouse_id = s.warehouse_id and rl.id = sl.receipt_line_id and rl.item_id = sl.item_id)
    union all
    select x.id from public.stock_moves x
    left join public.supplier_returns s on s.org_id = x.org_id and s.id = x.doc_id
    left join public.supplier_return_lines sl on sl.org_id = x.org_id and sl.id = x.doc_line_id and sl.doc_id = x.doc_id
    where x.doc_kind = 'supplier_return'
      and (s.id is null or s.posted_at is null or sl.id is null or sl.item_id <> x.item_id or x.warehouse_id <> s.warehouse_id
        or (x.reverses_move_id is null and x.qty > 0)
        or (x.reverses_move_id is not null and s.status <> 'void')
        or (s.status = 'void' and x.reverses_move_id is null
          and not exists (select 1 from public.stock_moves z where z.org_id = x.org_id and z.reverses_move_id = x.id)))
    union all
    -- تصحيح السعر (WP7، E5): كل حركة تقييم بكمية صفر من تصحيح موجود، على دفعة من عائلة سطره (الجذر أو مرآته)؛ والمرحَّل بلا عكسية
    --     والملغى كل أصلية معكوسة.
    select x.id from public.stock_moves x
    left join public.receipt_revaluations v on v.org_id = x.org_id and v.id = x.doc_id
    left join public.stock_lots l on l.org_id = x.org_id and l.id = x.lot_id
    left join public.stock_lots root on root.org_id = x.org_id and root.id = coalesce(l.origin_lot_id, l.id)
    where x.doc_kind = 'receipt_revalue'
      and (v.id is null or x.qty <> 0 or x.doc_line_id is distinct from v.receipt_line_id or root.source_kind <> 'receipt'
        or root.source_line_id is distinct from v.receipt_line_id
        or (x.reverses_move_id is not null and v.status <> 'void')
        or (v.status = 'void' and x.reverses_move_id is null
          and not exists (select 1 from public.stock_moves z where z.org_id = x.org_id and z.reverses_move_id = x.id)))
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
  -- 16. قيمة الدفعة (الخطّة 12): لكل سطر مرحَّل قيمة دفعته الداخلة = مبلغه − حصّة الخصم + حصّة التحميلات + حركات تقييمها (WP7).
  select 'receipt_lot_values', count(*) from public.receipt_line_amounts a
  join public.receipts r on r.org_id = a.org_id and r.id = a.doc_id
  join public.stock_lots l on l.org_id = a.org_id and l.source_kind = 'receipt' and l.source_id = r.id and l.source_line_id = a.line_id
  where r.posted_at is not null and l.value_in is distinct from a.line_total - a.discount_share + a.charge_share + coalesce((select sum(z.value) from public.stock_moves z where z.org_id = l.org_id and z.lot_id = l.id and z.doc_kind = 'receipt_revalue'), 0)
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
  union all
  -- 18. المرتجع (الخطّة 14، E55): لكل مرتجع مرحَّل أو ملغى بعد ترحيله قيد supplier_return أصلي واحد للمورّد بدفتره ويومه ورقمه = Σ
  --     المقبول (أو ولا واحد للمقبول صفر)، ومصروف «فرق مرتجع» أصلي واحد بوحدته = قيمة السحب − المقبول (أو ولا واحد للفرق صفر)، فالقيد
  --     + المصروف = Σ قيم سحبه؛ والمرحَّل بلا عكس والملغى كلها معكوسة؛ والمسوّدة بلاهن؛ وماكو قيد ولا مصروف مرتجع بلا مستند مرحَّل.
  select 'return_ties', (
    select count(*) from public.supplier_returns s
    join public.warehouses w on w.org_id = s.org_id and w.id = s.warehouse_id
    cross join lateral (
      select coalesce((select sum(a.credit_amount) from public.supplier_return_line_amounts a where a.org_id = s.org_id and a.doc_id = s.id), 0) as credit,
        coalesce((select -sum(m.value) from public.stock_moves m where m.org_id = s.org_id and m.doc_kind = 'supplier_return' and m.doc_id = s.id
          and m.reverses_move_id is null), 0) as drawn
    ) as t
    cross join lateral (
      select count(*) filter (where e.reverses_entry_id is null) as n,
        coalesce(sum(e.amount) filter (where e.reverses_entry_id is null), 0) as original,
        count(*) filter (where e.reverses_entry_id is null and (e.party_id <> s.party_id or e.book_id <> s.book_id or e.kind <> 'supplier_return'
          or e.on_date <> s.returned_on or e.doc_no is distinct from s.doc_no)) as foreign_rows,
        count(*) filter (where e.reverses_entry_id is not null) as reversed
      from public.party_entries e where e.org_id = s.org_id and e.doc_kind = 'supplier_return' and e.doc_id = s.id
    ) as p
    cross join lateral (
      select count(*) filter (where x.reverses_id is null) as n,
        coalesce(sum(x.amount) filter (where x.reverses_id is null), 0) as original,
        count(*) filter (where x.source <> 'adjustment' or x.division_id <> w.division_id or not exists (select 1 from public.expense_categories k
          where k.org_id = x.org_id and k.id = x.category_id and k.system_code = 'supplier_return_diff')) as foreign_rows,
        count(*) filter (where x.reverses_id is not null) as reversed
      from public.expenses x where x.org_id = s.org_id and x.doc_kind = 'supplier_return' and x.doc_id = s.id
    ) as x
    where (s.posted_at is null and (p.n > 0 or x.n > 0))
      or (s.posted_at is not null and (p.n <> (t.credit > 0)::int or p.original <> t.credit or p.foreign_rows > 0
        or x.n <> (t.drawn <> t.credit)::int or x.original <> t.drawn - t.credit or x.foreign_rows > 0
        or (s.status = 'posted' and (p.reversed > 0 or x.reversed > 0))
        or (s.status = 'void' and (p.reversed <> p.n or x.reversed <> x.n))))
  ) + (
    select count(*) from (
      select e.id from public.party_entries e
      left join public.supplier_returns s on s.org_id = e.org_id and s.id = e.doc_id
      where (e.doc_kind = 'supplier_return' and (s.id is null or s.posted_at is null or e.kind <> 'supplier_return'))
        or (e.kind = 'supplier_return' and e.doc_kind is distinct from 'supplier_return')
      union all
      select x.id from public.expenses x
      left join public.supplier_returns s on s.org_id = x.org_id and s.id = x.doc_id
      where x.doc_kind = 'supplier_return' and (s.id is null or s.posted_at is null)
    ) as v
  )
  union all
  -- 19. التصحيح (الخطّة 15، E55): لكل تصحيح Σ قيم حركات تقييمه الأصلية = lot_share، وlot_share + المصروف = الفرق = الجديد − القديم،
  --     وقيده adjustment للمورّد بدفتر الاستلام = −الفرق، ومصروفه «فرق سعر شراء» بوحدة الاستلام = expense_amount (أو بلاه للصفر)؛
  --     والمرحَّل بلا عكس والملغى كلها معكوسة؛ وماكو قيد ولا مصروف تصحيح بلا تصحيح يشير إله.
  select 'revaluation_ties', (
    select count(*) from public.receipt_revaluations v
    join public.receipts r on r.org_id = v.org_id and r.id = v.receipt_id
    join public.warehouses w on w.org_id = r.org_id and w.id = r.warehouse_id
    cross join lateral (
      select coalesce(sum(m.value) filter (where m.reverses_move_id is null), 0) as moved,
        count(*) filter (where m.reverses_move_id is null) as n,
        count(*) filter (where m.reverses_move_id is not null) as reversed
      from public.stock_moves m where m.org_id = v.org_id and m.doc_kind = 'receipt_revalue' and m.doc_id = v.id
    ) as m
    left join public.party_entries e on e.org_id = v.org_id and e.id = v.party_entry_id
    left join public.expenses x on x.org_id = v.org_id and x.id = v.expense_id
    where m.moved <> v.lot_share or v.lot_share + v.expense_amount <> v.diff or v.diff <> v.new_total - v.old_total
      or e.id is null or e.kind <> 'adjustment' or e.amount <> -v.diff or e.party_id <> r.party_id or e.book_id <> r.book_id
      or e.doc_kind is distinct from 'receipt_revalue' or e.doc_id is distinct from v.id
      or (v.expense_amount = 0) <> (v.expense_id is null) or (v.expense_id is not null and x.id is null)
      or (x.id is not null and (x.amount <> v.expense_amount or x.source <> 'adjustment' or x.division_id <> w.division_id
        or x.doc_kind is distinct from 'receipt_revalue' or x.doc_id is distinct from v.id
        or not exists (select 1 from public.expense_categories k where k.org_id = x.org_id and k.id = x.category_id and k.system_code = 'purchase_price_diff')))
      or (v.status = 'posted' and (m.reversed > 0
        or exists (select 1 from public.party_entries z where z.org_id = v.org_id and z.reverses_entry_id = v.party_entry_id)
        or exists (select 1 from public.expenses z where z.org_id = v.org_id and z.reverses_id = v.expense_id)))
      or (v.status = 'void' and (m.reversed <> m.n
        or not exists (select 1 from public.party_entries z where z.org_id = v.org_id and z.reverses_entry_id = v.party_entry_id)
        or (v.expense_id is not null and not exists (select 1 from public.expenses z where z.org_id = v.org_id and z.reverses_id = v.expense_id))))
  ) + (
    select count(*) from (
      select e.id from public.party_entries e
      where e.doc_kind = 'receipt_revalue' and e.reverses_entry_id is null
        and not exists (select 1 from public.receipt_revaluations v where v.org_id = e.org_id and v.party_entry_id = e.id)
      union all
      select x.id from public.expenses x
      where x.doc_kind = 'receipt_revalue' and x.reverses_id is null
        and not exists (select 1 from public.receipt_revaluations v where v.org_id = x.org_id and v.expense_id = x.id)
    ) as v
  )
$$;

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
        union all
        -- RT (0010): المرتجع المرحَّل (والملغى بعد ترحيله) برقمه.
        select s.org_id, split_part(s.doc_no, '-', 1), split_part(s.doc_no, '-', 2)::int, split_part(s.doc_no, '-', 3)::int
        from public.supplier_returns s where s.doc_no is not null
      ) as n
      group by n.org_id, n.kind, n.year
    ) as g
    full join (select * from public.doc_counters where kind in ('RC', 'PY', 'TR', 'SU', 'CT', 'PU', 'RT')) as c on c.org_id = g.org_id and c.kind = g.kind and c.year = g.year
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
  ) + (
    -- المرتجع برقم RT بسنة تاريخه (0010)، والمسوّدة والمطويّة بلا رقم (والملغى بعد ترحيله يبقى برقمه).
    select count(*) from public.supplier_returns s
    where (s.posted_at is null and s.doc_no is not null)
      or (s.posted_at is not null and (s.doc_no is null or s.doc_no !~ '^RT-' or split_part(s.doc_no, '-', 2) <> to_char(s.returned_on, 'YYYY')))
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

create or replace function public.void_party_entry(p_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_party_entry';
  v_cached jsonb;
  v_reason text;
  o public.party_entries;
  r public.party_entries;
  v_rev uuid;
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into o from public.party_entries where org_id = public.auth_org() and id = p_id;
  if o.id is null then
    raise exception 'entry_not_found' using hint = 'هذا القيد غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if o.kind not in ('opening', 'adjustment', 'forgiveness') or o.reverses_entry_id is not null then
    raise exception 'entry_not_voidable' using hint = 'يُلغى من هنا قيد الافتتاح والتسوية والإعفاء فقط؛ القبض والدفع من «ألغِ القبض أو الدفع»، والمستندات من مستندها.';
  end if;
  -- قيد يتبع مستنداً (مراجعة WP7): يُلغى بإلغاء مستنده بس؛ إلغاؤه لحاله كان يعلّق المستند.
  if o.doc_kind is not null then
    raise exception 'entry_not_voidable' using hint = format('هذا القيد من المستند %s؛ يُلغى بإلغاء مستنده.', coalesce(private.stock_doc_label(o.doc_kind, o.doc_id), o.doc_no, ''));
  end if;
  perform private.book_for_post(o.book_id);
  perform private.lock_parties(array[o.party_id]);
  perform private.check_void_date();
  v_rev := private.void_entry(o.id, v_reason);
  select * into r from public.party_entries where org_id = o.org_id and id = v_rev;
  return private.ref_store(v_fn, p_client_ref, private.entry_result(r, '[]'::jsonb, null));
end
$$;

create or replace function public.report_party_statement(p_party uuid, p_book uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_party jsonb;
  v_to date := coalesce(p_to, public.app_today());
begin
  if not (public.can('accounts.view') and public.can_see_accounts()) then
    raise exception 'forbidden' using hint = 'الحسابات للمالك والمدير والمحاسب فقط.';
  end if;
  if p_from is null or p_from > v_to then
    raise exception 'period_required' using hint = 'حدّد المدّة: من تاريخ إلى تاريخ لا يسبقه.';
  end if;
  select jsonb_build_object('id', p.id, 'name', p.name, 'phone', p.phone, 'archived', p.archived_at is not null, 'version', p.version,
      'is_customer', p.is_customer, 'is_supplier', p.is_supplier)
  into v_party from public.parties p where p.org_id = v_org and p.id = p_party;
  if v_party is null then
    raise exception 'party_not_found' using hint = 'هذه الجهة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if p_book is not null and not public.in_scope_book(p_book) then
    raise exception 'out_of_scope' using hint = 'هذا الدفتر خارج نطاقك.';
  end if;
  return jsonb_build_object('party', v_party, 'from', p_from, 'to', v_to, 'books', coalesce((
    select jsonb_agg(jsonb_build_object(
        'book_id', b.id, 'code', b.code, 'name', b.name, 'division_id', b.division_id, 'division_kind', d.kind,
        'brought_forward', s.bf::text, 'total_debit', s.debit::text, 'total_credit', s.credit::text, 'closing', (s.bf + s.debit - s.credit)::text,
        'lines', s.lines)
      order by d.kind collate "C", b.code collate "C")
    from public.ledger_books b
    join public.divisions d on d.org_id = b.org_id and d.id = b.division_id
    cross join lateral (
      select
        coalesce((select sum(e.amount) from public.party_entries e where e.org_id = v_org and e.party_id = p_party and e.book_id = b.id and e.on_date < p_from), 0) as bf,
        coalesce((select sum(e.amount) from public.party_entries e where e.org_id = v_org and e.party_id = p_party and e.book_id = b.id
          and e.on_date between p_from and v_to and e.amount > 0), 0) as debit,
        coalesce((select -sum(e.amount) from public.party_entries e where e.org_id = v_org and e.party_id = p_party and e.book_id = b.id
          and e.on_date between p_from and v_to and e.amount < 0), 0) as credit,
        coalesce((
          select jsonb_agg(jsonb_build_object('entry_id', l.id, 'on_date', l.on_date, 'seq', l.seq::text, 'kind', l.kind, 'doc_kind', l.doc_kind, 'doc_no', l.doc_no,
              'reason', l.reason, 'reverses', l.reverses_entry_id, 'reversed', l.reversed, 'account', l.account, 'debit', greatest(l.amount, 0)::text,
              'credit', greatest(-l.amount, 0)::text, 'balance', l.balance::text)
            order by l.on_date, l.seq)
          from (
            select e.*, exists (select 1 from public.party_entries r where r.org_id = e.org_id and r.reverses_entry_id = e.id) as reversed,
              (select a.name from public.cash_moves m join public.cash_accounts a on a.org_id = m.org_id and a.id = m.account_id
               where m.org_id = e.org_id and m.party_entry_id = e.id and m.reverses_move_id is null) as account,
              coalesce((select sum(z.amount) from public.party_entries z where z.org_id = v_org and z.party_id = p_party and z.book_id = b.id and z.on_date < p_from), 0)
                + sum(e.amount) over (order by e.on_date, e.seq rows between unbounded preceding and current row) as balance
            from public.party_entries e
            where e.org_id = v_org and e.party_id = p_party and e.book_id = b.id and e.on_date between p_from and v_to
          ) as l
        ), '[]'::jsonb) as lines
    ) as s
    where b.org_id = v_org and b.archived_at is null and public.in_scope_book(b.id)
      and (b.id = p_book or (p_book is null and exists (select 1 from public.party_entries e where e.org_id = v_org and e.party_id = p_party and e.book_id = b.id)))
  ), '[]'::jsonb));
end
$$;

create or replace function private.check_lot_intact(p_lot uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  l public.stock_lots;
  m public.stock_moves;
  v_item text;
begin
  select * into l from public.stock_lots where org_id = public.auth_org() and id = p_lot;
  -- تصحيح سعر حيّ على الدفعة (WP7) يرفع داخلها ومتبقّيها سويّةً فتبين سليمة: يُسمّى ويُلغى أوّلاً.
  select * into m from public.stock_moves x
  where x.org_id = l.org_id and x.lot_id = l.id and x.doc_kind = 'receipt_revalue' and x.reverses_move_id is null
    and not exists (select 1 from public.stock_moves r where r.org_id = x.org_id and r.reverses_move_id = x.id)
  order by x.seq desc limit 1;
  if m.id is not null then
    select i.name into v_item from public.items i where i.org_id = l.org_id and i.id = l.item_id;
    raise exception 'lot_consumed' using hint = format('على دفعة «%s» %s، فلا يُلغى هذا قبل إلغاء التصحيح.', v_item,
      coalesce(private.stock_doc_label(m.doc_kind, m.doc_id), 'تصحيح سعر'));
  end if;
  if l.qty_left = l.qty_in and l.value_left = l.value_in then
    return;
  end if;
  select * into m from public.stock_moves x
  where x.org_id = l.org_id and x.lot_id = l.id and x.qty < 0 and x.reverses_move_id is null
    and not exists (select 1 from public.stock_moves r where r.org_id = x.org_id and r.reverses_move_id = x.id)
  order by x.seq desc limit 1;
  select i.name into v_item from public.items i where i.org_id = l.org_id and i.id = l.item_id;
  raise exception 'lot_consumed' using hint = format('انسحب من دفعة «%s» بالمستند %s، فلا يُلغى هذا قبل إلغاء ذلك المستند.',
    v_item, coalesce(private.stock_doc_label(m.doc_kind, m.doc_id), 'آخر'));
end
$$;

-- ─── الصلاحيات ─────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.supplier_return_options(uuid), public.post_supplier_return(uuid, int, text, uuid), public.void_supplier_return(uuid, text, uuid),
  public.preview_supplier_return(uuid), public.post_receipt_revalue(uuid, numeric, text, text, uuid), public.void_receipt_revalue(uuid, text, uuid),
  public.preview_receipt_revalue(uuid, numeric) from public, anon;
grant execute on function public.supplier_return_options(uuid), public.post_supplier_return(uuid, int, text, uuid), public.void_supplier_return(uuid, text, uuid),
  public.preview_supplier_return(uuid), public.post_receipt_revalue(uuid, numeric, text, text, uuid), public.void_receipt_revalue(uuid, text, uuid),
  public.preview_receipt_revalue(uuid, numeric) to authenticated;
