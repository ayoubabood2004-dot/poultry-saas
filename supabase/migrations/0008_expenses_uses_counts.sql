-- 0008_expenses_uses_counts — المصاريف (نقداً وبالدين، وبشهرها)، والصرف لمصروف عام والإتلاف، والجرد بمراجعة المدير (خطّة
--   المرحلة 1 WP5؛ FOUNDATION ٣٠٢–٣٠٦ و٤١٩–٤٢٤ و٤٧٦–٤٧٩ و٥٥٥–٥٥٧؛ DECISIONS 2026-10-26 Q5 وQ9 وQ13 وQ14).
-- المشكلة: ماكو مصاريف (لا نقداً من صندوق ولا بالدين على جهة)، ولا صرف من المخزن لمصروف عام ولا إتلاف للمنتهي، ولا جرد يصحّح
--   الدفتر بالموجود فعلاً: الفرق بين الرفّ والدفتر يبقى، والمنتهي يبقى بالمخزن بلا طريق يطلع بيه.
-- هنا: expenses (تُضاف ولا تتعدّل، والغلط بصفّ عكسي) بأربعة مصادر وقيد لكل مصدر (E10)، وfor_month شهرها (Q14)، وحركة صندوقها أو
--   قيد bill بدفتر وحدتها يتوزّع بالقاعدة 27؛ وstock_uses/stock_use_lines (الصرف، والإتلاف بدفعة مسمّاة، وإذن المنتهي Q5) يسحب
--   ويكتب مصروفاً بمصدر stock ورقم SU؛ وstock_counts/stock_count_lines/stock_count_line_costs (عدّ أعمى E25، والمنتهي لحاله E41،
--   وتسليم ← مراجعة المدير ← ترحيل E53) يكتب النقص «فرق جرد» والزيادة دفعة جديدة بقيمة القاعدة 17 (E45، E48) ورقم CT؛
--   وrecord_expense وvoid_expense وreport_expenses؛ وطيّ المسوّدة وحذف سطرها للنوعين الجديدين؛ وhome_summary يزيد «بانتظار موافقة
--   المدير»؛ وverify_stock يزيد أطراف الحفظ (الصرف والجرد) وروابطها الثلاثة؛ وverify_ledger يزيد قواعد المصاريف ومصدر أرقام SU وCT.
-- انحرافات مكتوبة عن الخطّة (WP5): post_stock_use وpost_count يأخذان بصمة المعاينة (p_expected_plan) مثل post_transfer بعد مراجعة
--   WP4 (FOUNDATION ٥٢٠ البند 5: «فما يترحّل إلا اللي شافه المستخدم»)، وcount_stale يبقى لتغيّر الرصيد بعد العدّ؛ والمصروف بلا
--   posted_at/posted_by لأن created_at/created_by نفسهم (مثل 0006 و0007)، ويّا reason لسبب الصفّ العكسي؛ وstock_count_lines يزيد
--   gain_expired_expiry_on (زيادة منتهية تحتاج تاريخ انتهائها الماضي، E41، غير تاريخ الزيادة الصالحة) وسطراً واحداً لكل مادّة
--   بالجرد، وstock_counts يزيد snapshot_at (المستندات من آخر لقطة، refresh_count) وreturned_at/returned_by/return_reason (سبب
--   «أعِد للعدّ» يشوفه الأمين)؛ والدفعة المسمّاة بالصرف العادي للمنتهي بس (Q5)، والصالح يُسحب بترتيبه؛ والرصيد بالجرد = المتاح
--   والمنتهي بتاريخ العدّ من دفعات مستلمة بيه أو قبله (stock_at، نفس اللي يسحب منه النقص)؛ والشهر المقفول = شهر بيه يوم مقفول؛
--   وstock_doc_label يسمّي SU وCT.
-- تراجع: rollback_0008.sql — يرجّع أجسام home_summary وdiscard_draft وdelete_draft_line وstock_doc_label وverify_stock
--   وverify_ledger كما بـ0007، ويشيل الجداول الجديدة ودوالّها ومشغّلاتها وسياسة نطاقها على سجلّ التدقيق ومفتاح الدفتر المركّب؛ ويرفض
--   بصوت إذا أي مصروف أو صرف أو جرد موجود (ولو مسوّدة)، بلا ما يحذف شي.
-- تنعاد بأمان: if not exists، create or replace، وكتل do تفحص الكتالوج قبل القيود والسياسات.

set lock_timeout = '5s';

-- ─── الدفتر يثبت وحدته (WP5): مفتاح مركّب حتى المصروف بالدين يثبت إن دفتره من وحدته (book-check) ─────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.ledger_books'::regclass and conname = 'ledger_books_org_id_division_id_id_key') then
    alter table public.ledger_books add constraint ledger_books_org_id_division_id_id_key unique (org_id, division_id, id);
  end if;
end
$$;

-- ─── المصاريف (FOUNDATION ٤١٩–٤٢٤، E10): تُضاف ولا تتعدّل؛ المصدر يحدّد ما يرتبط بيه، والعكسي بنفس مصدره ومبلغه المعاكس ───────
-- cash من صندوق (حركة expense سالبة) وcredit على جهة بدفتر وحدتها (قيد bill سالب «له») بدينار صحيح؛ stock يكتبه الصرف والجرد
-- بمستنده (فلسان)؛ adjustment موقّع بمستنده بلا صندوق ولا جهة (WP6 وWP7). for_month أوّل يوم بالشهر اللي ينتسب إله (Q14).
-- flock_id وhatch_batch_id بالمرحلتين 3 و5 (Q13).
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  category_id uuid not null,
  division_id uuid not null,
  amount numeric not null,
  on_date date not null,
  for_month date not null,
  source text not null,
  account_id uuid,
  party_id uuid,
  book_id uuid,
  site_id uuid,
  doc_kind text,
  doc_id uuid,
  cash_move_id uuid,
  party_entry_id uuid,
  reverses_id uuid,
  note text,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint expenses_amount_check check (abs(amount) < 'Infinity' and amount <> 0 and amount = round(amount, 2)),
  constraint expenses_source_check check (source in ('cash', 'credit', 'stock', 'adjustment')),
  constraint expenses_sign_check check (source = 'adjustment' or (amount > 0) = (reverses_id is null)),
  constraint expenses_for_month_check check (for_month = date_trunc('month', for_month)::date),
  constraint expenses_cash_check check (source <> 'cash' or (account_id is not null and cash_move_id is not null and party_id is null
    and book_id is null and party_entry_id is null and doc_kind is null and amount = round(amount, 0))),
  constraint expenses_credit_check check (source <> 'credit' or (party_id is not null and book_id is not null and party_entry_id is not null
    and account_id is null and cash_move_id is null and doc_kind is null and amount = round(amount, 0))),
  constraint expenses_stock_check check (source <> 'stock' or (doc_kind in ('stock_use', 'count') and account_id is null and party_id is null
    and book_id is null and cash_move_id is null and party_entry_id is null)),
  constraint expenses_adjustment_check check (source <> 'adjustment' or (doc_kind is not null and account_id is null and party_id is null
    and book_id is null and party_entry_id is null)),
  constraint expenses_doc_check check ((doc_kind is null) = (doc_id is null)),
  constraint expenses_doc_kind_check check (doc_kind is null or doc_kind ~ '^[a-z][a-z_]{1,39}$'),
  constraint expenses_note_check check (note is null or length(btrim(note)) between 1 and 500),
  constraint expenses_reason_check check ((reverses_id is null) = (reason is null) and (reason is null or length(btrim(reason)) between 1 and 500)),
  unique (org_id, id),
  unique (org_id, reverses_id),
  foreign key (org_id, category_id) references public.expense_categories (org_id, id),
  foreign key (org_id, division_id) references public.divisions (org_id, id),
  foreign key (org_id, account_id) references public.cash_accounts (org_id, id),
  foreign key (org_id, party_id) references public.parties (org_id, id),
  foreign key (org_id, division_id, book_id) references public.ledger_books (org_id, division_id, id),
  foreign key (org_id, division_id, site_id) references public.sites (org_id, division_id, id),
  foreign key (org_id, cash_move_id) references public.cash_moves (org_id, id),
  foreign key (org_id, party_entry_id) references public.party_entries (org_id, id),
  foreign key (org_id, reverses_id) references public.expenses (org_id, id)
);
create index if not exists expenses_month on public.expenses (org_id, division_id, for_month);
create index if not exists expenses_category on public.expenses (org_id, category_id);
create index if not exists expenses_account on public.expenses (org_id, account_id);
create index if not exists expenses_party on public.expenses (org_id, party_id);
create index if not exists expenses_book on public.expenses (org_id, division_id, book_id);
create index if not exists expenses_site on public.expenses (org_id, division_id, site_id);
create index if not exists expenses_cash_move on public.expenses (org_id, cash_move_id);
create index if not exists expenses_party_entry on public.expenses (org_id, party_entry_id);
create index if not exists expenses_doc on public.expenses (org_id, doc_kind, doc_id);

-- ─── الصرف لمصروف عام والإتلاف (FOUNDATION ٣٠٥–٣٠٦، ٥٥٦، Q5): مسوّدة بمخزنها وتصنيفها، رقمها SU عند الترحيل بس ──────────────
-- التصنيف النظامي expired_destroy = إتلاف (كل سطر يسمّي دفعته المنتهية، expired.destroy)؛ وغيره صرف عادي (السطر يسمّي دفعة منتهية
-- بإذن المدير، expired.release، وإلا يسحب بالترتيب).
create table if not exists public.stock_uses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  doc_no text,
  warehouse_id uuid not null,
  category_id uuid,
  used_on date not null,
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
  constraint stock_uses_status_check check (status in ('draft', 'posted', 'void')),
  constraint stock_uses_lifecycle_check check ((status = 'draft' and posted_at is null and voided_at is null)
    or (status = 'posted' and posted_at is not null and voided_at is null) or (status = 'void' and voided_at is not null)),
  constraint stock_uses_numbered_check check ((doc_no is null) = (posted_at is null)),
  constraint stock_uses_doc_no_check check (doc_no is null or doc_no ~ '^SU-[0-9]{4}-[0-9]{4,}$'),
  constraint stock_uses_version_check check (version >= 1),
  constraint stock_uses_note_check check (note is null or length(btrim(note)) between 1 and 500),
  constraint stock_uses_void_reason_check check (void_reason is null or length(btrim(void_reason)) between 1 and 500),
  unique (org_id, id),
  unique (org_id, id, warehouse_id),
  unique (org_id, doc_no),
  foreign key (org_id, warehouse_id) references public.warehouses (org_id, id),
  foreign key (org_id, category_id) references public.expense_categories (org_id, id)
);
create index if not exists stock_uses_warehouse on public.stock_uses (org_id, warehouse_id);
create index if not exists stock_uses_category on public.stock_uses (org_id, category_id);

-- سطر الصرف بلا قيم (الأمين يقراه): لقطة الوحدة (E7) مثل سطر التحويل، والدفعة المسمّاة (اختيارية) بنفس المادّة بالمفتاح المركّب
-- ومن مخزن الرأس (المشغّل).
create table if not exists public.stock_use_lines (
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
  lot_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint stock_use_lines_qty_in_unit_check check (abs(qty_in_unit) < 'Infinity' and qty_in_unit > 0 and qty_in_unit = round(qty_in_unit, 3)),
  constraint stock_use_lines_factor_check check (abs(factor) < 'Infinity' and factor > 0 and factor = round(factor, 6)),
  constraint stock_use_lines_qty_base_check check (abs(qty_base) < 'Infinity' and qty_base > 0 and qty_base = round(qty_base, 3)),
  constraint stock_use_lines_unit_check check (item_unit_id is null or unit_code is null),
  constraint stock_use_lines_unit_label_check check (length(btrim(unit_label)) between 1 and 40),
  constraint stock_use_lines_line_no_check check (line_no >= 1),
  unique (org_id, id),
  unique (org_id, doc_id, line_no),
  foreign key (org_id, doc_id, warehouse_id) references public.stock_uses (org_id, id, warehouse_id),
  foreign key (org_id, item_id) references public.items (org_id, id),
  foreign key (org_id, item_unit_id) references public.item_units (org_id, id),
  foreign key (org_id, item_id, lot_id) references public.stock_lots (org_id, item_id, id)
);
create index if not exists stock_use_lines_doc on public.stock_use_lines (org_id, doc_id, warehouse_id);
create index if not exists stock_use_lines_item on public.stock_use_lines (org_id, item_id);
create index if not exists stock_use_lines_unit on public.stock_use_lines (org_id, item_unit_id);
create index if not exists stock_use_lines_lot on public.stock_use_lines (org_id, item_id, lot_id);

-- ─── الجرد (FOUNDATION ٣٠٢–٣٠٤، ٥٥٥، E25، E41، E53): مسوّدة يعدّها الأمين ← submitted ← approved (رقمها CT) أو void ────────────
create table if not exists public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  doc_no text,
  warehouse_id uuid not null,
  counted_on date not null,
  status text not null default 'draft',
  version int not null default 1,
  client_ref uuid,
  note text,
  submitted_at timestamptz,
  submitted_by uuid,
  snapshot_at timestamptz,
  returned_at timestamptz,
  returned_by uuid,
  return_reason text,
  posted_at timestamptz,
  posted_by uuid,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint stock_counts_status_check check (status in ('draft', 'submitted', 'approved', 'void')),
  constraint stock_counts_lifecycle_check check ((status = 'draft' and submitted_at is null and posted_at is null and voided_at is null)
    or (status = 'submitted' and submitted_at is not null and snapshot_at is not null and posted_at is null and voided_at is null)
    or (status = 'approved' and posted_at is not null and voided_at is null) or (status = 'void' and voided_at is not null)),
  constraint stock_counts_numbered_check check ((doc_no is null) = (posted_at is null)),
  constraint stock_counts_doc_no_check check (doc_no is null or doc_no ~ '^CT-[0-9]{4}-[0-9]{4,}$'),
  constraint stock_counts_version_check check (version >= 1),
  constraint stock_counts_note_check check (note is null or length(btrim(note)) between 1 and 500),
  constraint stock_counts_return_reason_check check (return_reason is null or length(btrim(return_reason)) between 1 and 500),
  constraint stock_counts_void_reason_check check (void_reason is null or length(btrim(void_reason)) between 1 and 500),
  unique (org_id, id),
  unique (org_id, id, warehouse_id),
  unique (org_id, doc_no),
  foreign key (org_id, warehouse_id) references public.warehouses (org_id, id)
);
create index if not exists stock_counts_warehouse on public.stock_counts (org_id, warehouse_id);

-- سطر الجرد: المعدود بوحدة الأساس (الشاشة تحوّل التعبئة)، والمنتهي لحاله للمادّة اللي تتابع الانتهاء (E41)؛ الرصيد والفرقان يكتبهم
-- submit_count وrefresh_count بس (بلا منح)، والسبب يكتبه المدير بالمراجعة (§2.5). سطر واحد لكل مادّة بالجرد.
create table if not exists public.stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  doc_id uuid not null,
  warehouse_id uuid not null,
  line_no int not null,
  item_id uuid not null,
  counted_qty numeric not null,
  counted_expired_qty numeric,
  system_qty numeric,
  system_expired_qty numeric,
  diff numeric,
  expired_diff numeric,
  gain_expiry_on date,
  gain_expired_expiry_on date,
  gain_born_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint stock_count_lines_counted_qty_check check (abs(counted_qty) < 'Infinity' and counted_qty >= 0 and counted_qty = round(counted_qty, 3)),
  constraint stock_count_lines_counted_expired_qty_check check (abs(counted_expired_qty) < 'Infinity' and counted_expired_qty >= 0
    and counted_expired_qty = round(counted_expired_qty, 3)),
  constraint stock_count_lines_system_qty_check check (abs(system_qty) < 'Infinity' and system_qty >= 0 and system_qty = round(system_qty, 3)),
  constraint stock_count_lines_system_expired_qty_check check (abs(system_expired_qty) < 'Infinity' and system_expired_qty >= 0
    and system_expired_qty = round(system_expired_qty, 3)),
  constraint stock_count_lines_diff_check check (abs(diff) < 'Infinity' and diff = round(diff, 3)),
  constraint stock_count_lines_expired_diff_check check (abs(expired_diff) < 'Infinity' and expired_diff = round(expired_diff, 3)),
  constraint stock_count_lines_snapshot_check check ((system_qty is null) = (diff is null) and (system_expired_qty is null) = (expired_diff is null)
    and (system_qty is not null or system_expired_qty is null)),
  constraint stock_count_lines_reason_check check (reason is null or length(btrim(reason)) between 1 and 500),
  constraint stock_count_lines_line_no_check check (line_no >= 1),
  unique (org_id, id),
  unique (org_id, doc_id, line_no),
  unique (org_id, doc_id, item_id),
  foreign key (org_id, doc_id, warehouse_id) references public.stock_counts (org_id, id, warehouse_id),
  foreign key (org_id, item_id) references public.items (org_id, id)
);
create index if not exists stock_count_lines_doc on public.stock_count_lines (org_id, doc_id, warehouse_id);
create index if not exists stock_count_lines_item on public.stock_count_lines (org_id, item_id);

-- كلفة سطر الجرد (FOUNDATION ٣٠٤، E48، E55): لأدوار الكلفة بس (مقيِّدة). المدير يكتب كلفة وحدة الزيادة (4 مراتب) والجرد مسلَّم،
-- وpost_count يكتب قيمة الزيادة والنقص (لقطة المستند اللي verify_stock يقارن بيها الدفعات والمصروف).
create table if not exists public.stock_count_line_costs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  line_id uuid not null,
  doc_id uuid not null,
  warehouse_id uuid not null,
  gain_unit_cost numeric,
  gain_value numeric,
  shortage_value numeric,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint stock_count_line_costs_gain_unit_cost_check check (abs(gain_unit_cost) < 'Infinity' and gain_unit_cost >= 0
    and gain_unit_cost = round(gain_unit_cost, 4)),
  constraint stock_count_line_costs_gain_value_check check (abs(gain_value) < 'Infinity' and gain_value >= 0 and gain_value = round(gain_value, 2)),
  constraint stock_count_line_costs_shortage_value_check check (abs(shortage_value) < 'Infinity' and shortage_value >= 0
    and shortage_value = round(shortage_value, 2)),
  unique (org_id, id),
  unique (org_id, line_id),
  foreign key (org_id, line_id) references public.stock_count_lines (org_id, id),
  foreign key (org_id, doc_id, warehouse_id) references public.stock_counts (org_id, id, warehouse_id)
);
create index if not exists stock_count_line_costs_doc on public.stock_count_line_costs (org_id, doc_id, warehouse_id);

-- ─── المشغّلات ────────────────────────────────────────────────────────────────────────────────────────────────
-- المصروف العكسي بنفس تصنيف أصله ووحدته ومصدره وصندوقه وجهته ودفتره وموقعه ومستنده وبمبلغه المعاكس، ولا يُعكس عكسي.
create or replace function private.expenses_check() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.expenses;
begin
  if new.reverses_id is not null then
    select * into o from public.expenses where org_id = new.org_id and id = new.reverses_id;
    if o.id is null or o.reverses_id is not null or o.amount <> -new.amount or o.category_id <> new.category_id or o.division_id <> new.division_id
       or o.source <> new.source or o.account_id is distinct from new.account_id or o.party_id is distinct from new.party_id
       or o.book_id is distinct from new.book_id or o.site_id is distinct from new.site_id
       or o.doc_kind is distinct from new.doc_kind or o.doc_id is distinct from new.doc_id then
      raise exception 'reversal_mismatch' using hint = 'المصروف العكسي يأخذ تصنيف أصله ووحدته ومصدره ومبلغه بإشارة معاكسة، ولا يُعكس مصروف عكسي.';
    end if;
  end if;
  return new;
end
$$;

-- حارس رأس الصرف والجرد (§2.5): invoker، يشتغل لـauthenticated بس (دوالّ الترحيل definer تمرّ). المستند الجديد مسوّدة دائماً،
-- والتعديل المباشر بتاريخه وملاحظته (وتصنيف الصرف) بس، والنسخة تزيد وحدها.
create or replace function private.stock_doc_header_guard() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  v_free text[] := case tg_table_name when 'stock_uses' then array['used_on', 'note', 'category_id'] else array['counted_on', 'note'] end;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status is distinct from 'draft' or new.version is distinct from 1 or new.posted_at is not null or new.voided_at is not null
       or new.client_ref is not null or new.void_reason is not null or new.doc_no is not null
       or (to_jsonb(new) ->> 'submitted_at') is not null or (to_jsonb(new) ->> 'snapshot_at') is not null
       or (to_jsonb(new) ->> 'returned_at') is not null or (to_jsonb(new) ->> 'return_reason') is not null then
      raise exception 'not_draft' using hint = 'المستند الجديد مسوّدة دائماً؛ التسليم والترحيل والإلغاء من دوالّها.';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free) then
    raise exception 'frozen_column' using hint = 'يُعدَّل في المسوّدة تاريخها وملاحظتها (وتصنيف الصرف) فقط؛ الحالة والرقم والنسخة والمخزن يكتبها الخادم.';
  end if;
  new.version := old.version + 1;
  return new;
end
$$;

-- حارس سطر الصرف (§2.5، definer): الرأس مقفول ومسوّدة، والفعل والنطاق، ومخزن الرأس منسوخ (E6)، ورقم السطر التالي، ولقطة الوحدة
-- (E7) مثل سطر التحويل، والدفعة المسمّاة من نفس المادّة والمخزن، والنسخة تزيد.
create or replace function private.stock_use_lines_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d public.stock_uses;
  v_base text;
  u public.item_units;
  g public.units;
begin
  set local lock_timeout = '5s';
  if tg_op = 'UPDATE' and new.doc_id is distinct from old.doc_id then
    raise exception 'frozen_column' using hint = 'السطر يبقى في مستنده.';
  end if;
  select * into d from public.stock_uses where org_id = new.org_id and id = new.doc_id for update;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'المستند مرحَّل أو ملغى؛ لا تُعدَّل سطوره.';
  end if;
  perform private.require('stock_use.post');
  if not public.in_scope_wh(d.warehouse_id) then
    raise exception 'out_of_scope' using hint = 'مخزن هذا المستند خارج نطاقك.';
  end if;
  new.warehouse_id := d.warehouse_id;
  if tg_op = 'INSERT' then
    new.line_no := coalesce((select max(l.line_no) from public.stock_use_lines l where l.org_id = d.org_id and l.doc_id = d.id), 0) + 1;
  else
    new.line_no := old.line_no;
  end if;
  select i.base_unit into v_base from public.items i where i.org_id = d.org_id and i.id = new.item_id;
  if v_base is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if new.qty_in_unit is null or not (abs(new.qty_in_unit) < 'Infinity') or new.qty_in_unit <= 0 then
    raise exception 'qty_not_positive' using hint = 'اكتب كمية أكبر من صفر.';
  end if;
  if new.item_unit_id is not null then
    select * into u from public.item_units where org_id = d.org_id and id = new.item_unit_id;
    if u.id is null or u.item_id <> new.item_id then
      raise exception 'unit_mismatch' using hint = 'وحدة التعبئة المختارة ليست لهذه المادّة. اختر وحدة من وحداتها.';
    end if;
    new.unit_code := null;
    new.unit_label := u.label;
    new.factor := u.factor_to_base;
  elsif new.unit_code is not null then
    select * into g from public.units where code = new.unit_code;
    if g.code is null or g.base <> v_base then
      raise exception 'unit_mismatch' using hint = 'الوحدة لا تناسب وحدة أساس المادّة.';
    end if;
    new.unit_label := g.code;
    new.factor := g.factor;
  else
    new.unit_label := v_base;
    new.factor := 1;
  end if;
  new.qty_base := private.to_base(new.qty_in_unit, new.factor, v_base);
  if new.qty_base <= 0 then
    raise exception 'qty_not_positive' using hint = 'الكمية بوحدة الأساس قُرِّبت إلى صفر. اكتب كمية أكبر.';
  end if;
  if new.lot_id is not null and not exists (
    select 1 from public.stock_lots l where l.org_id = d.org_id and l.id = new.lot_id and l.item_id = new.item_id and l.warehouse_id = d.warehouse_id
  ) then
    raise exception 'lot_mismatch' using hint = 'الدفعة المسمّاة ليست من هذه المادّة في مخزن هذا المستند.';
  end if;
  update public.stock_uses set version = version + 1 where org_id = d.org_id and id = d.id;
  return new;
end
$$;

-- حارس سطر الجرد (§2.5، E53، definer): الرأس مقفول وبنطاق الكاتب. المسوّدة: العدّ بفعل count.enter (والمنتهي للمادّة اللي تتابع
-- الانتهاء بس، وفارغه صفر)، والسبب ما يتغيّر (يكتبه المدير بالمراجعة). المسلَّم: سبب الفرق بس بفعل count.approve. لقطة الرصيد
-- والفرقان بلا منح، فتعديل ما يغيّر غيرها من دوالّ الجرد نفسها (submit_count وrefresh_count وreturn_count) ويمرّ. والنسخة تزيد.
create or replace function private.stock_count_lines_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d public.stock_counts;
  i public.items;
  v_snapshot constant text[] := array['system_qty', 'system_expired_qty', 'diff', 'expired_diff'];
begin
  set local lock_timeout = '5s';
  if tg_op = 'UPDATE' and (to_jsonb(new) - v_snapshot) = (to_jsonb(old) - v_snapshot) then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.doc_id is distinct from old.doc_id then
    raise exception 'frozen_column' using hint = 'السطر يبقى في مستنده.';
  end if;
  select * into d from public.stock_counts where org_id = new.org_id and id = new.doc_id for update;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  -- الفعل قبل النطاق (مثل حارس سطر التحويل): الممنوع forbidden، والمسموح برّا نطاقه out_of_scope. والمسلَّم ما يعدّله العادّ بلا
  -- count.approve: not_draft بتلميح المراجعة، فنافذة ثانية أو طابور يرفع عدّاً بعد التسليم يفهم ليش رُفض.
  perform private.require('count.enter');
  if d.status = 'submitted' and not public.can('count.approve') then
    raise exception 'not_draft' using hint = 'الجرد مسلَّم للمراجعة؛ لا يتعدّل العدّ إلا بعد أن يعيده المدير للعدّ.';
  end if;
  if not public.in_scope_wh(d.warehouse_id) then
    raise exception 'out_of_scope' using hint = 'مخزن هذا الجرد خارج نطاقك.';
  end if;
  new.warehouse_id := d.warehouse_id;
  if d.status = 'submitted' and tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'reason') is distinct from (to_jsonb(old) - 'reason') then
      raise exception 'not_draft' using hint = 'الجرد مسلَّم للمراجعة؛ يُكتب فيه سبب الفرق فقط، والعدّ يتعدّل بعد «أعِد للعدّ».';
    end if;
    new.reason := nullif(btrim(new.reason), '');
  elsif d.status = 'draft' then
    if new.reason is distinct from (case when tg_op = 'UPDATE' then old.reason end) then
      raise exception 'frozen_column' using hint = 'سبب الفرق يكتبه المدير بمراجعة الجرد المسلَّم.';
    end if;
    select * into i from public.items where org_id = d.org_id and id = new.item_id;
    if i.id is null then
      raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
    end if;
    if tg_op = 'INSERT' then
      new.line_no := coalesce((select max(l.line_no) from public.stock_count_lines l where l.org_id = d.org_id and l.doc_id = d.id), 0) + 1;
    else
      new.line_no := old.line_no;
    end if;
    if i.tracks_expiry then
      new.counted_expired_qty := coalesce(new.counted_expired_qty, 0);
    elsif coalesce(new.counted_expired_qty, 0) <> 0 then
      raise exception 'expiry_not_tracked' using hint = format('«%s» لا تتابع تاريخ الانتهاء، فلا كمية منتهية لها.', i.name);
    else
      new.counted_expired_qty := null;
    end if;
    -- مراتب ثابتة (3) للنصّ العشري على الشبكة (E3)، والمضبوط بس: أكثر من ثلاث مراتب يرفضه قيد عموده بدل تقريب صامت (§2.7).
    if new.counted_qty = round(new.counted_qty, 3) then
      new.counted_qty := round(new.counted_qty, 3);
    end if;
    if new.counted_expired_qty = round(new.counted_expired_qty, 3) then
      new.counted_expired_qty := round(new.counted_expired_qty, 3);
    end if;
  else
    raise exception 'not_draft' using hint = case when d.status = 'submitted' then 'الجرد مسلَّم للمراجعة؛ تُضاف السطور بعد «أعِد للعدّ».'
      else 'الجرد مرحَّل أو ملغى؛ لا تُعدَّل سطوره.' end;
  end if;
  update public.stock_counts set version = version + 1 where org_id = d.org_id and id = d.id;
  return new;
end
$$;

-- حارس كلفة سطر الجرد (§2.5، E48، definer): كلفة وحدة الزيادة يكتبها count.approve من أدوار الكلفة والجرد مسلَّم، ومخزن السطر
-- ومستنده منسوخان، والنسخة تزيد. قيمتا الزيادة والنقص بلا منح، فكتابة بيها أو تعديل ما يغيّر غيرها من post_count نفسه.
create or replace function private.stock_count_line_costs_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ln public.stock_count_lines;
  d public.stock_counts;
  v_computed constant text[] := array['gain_value', 'shortage_value'];
begin
  set local lock_timeout = '5s';
  if tg_op = 'UPDATE' and (to_jsonb(new) - v_computed) = (to_jsonb(old) - v_computed) then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.line_id is distinct from old.line_id then
    raise exception 'frozen_column' using hint = 'الكلفة تبقى على سطرها.';
  end if;
  select * into ln from public.stock_count_lines where org_id = new.org_id and id = new.line_id;
  if ln.id is null then
    raise exception 'line_not_found' using hint = 'سطر الجرد غير موجود. حدّث الشاشة.';
  end if;
  new.doc_id := ln.doc_id;
  new.warehouse_id := ln.warehouse_id;
  if tg_op = 'INSERT' and (new.gain_value is not null or new.shortage_value is not null) then
    return new;
  end if;
  select * into d from public.stock_counts where org_id = ln.org_id and id = ln.doc_id for update;
  if d.status <> 'submitted' then
    raise exception 'not_draft' using hint = 'كلفة وحدة الزيادة تُكتب والجرد مسلَّم للمراجعة فقط.';
  end if;
  perform private.require('count.approve');
  if not public.can_see_cost() then
    raise exception 'forbidden' using hint = 'كلفة الجرد لأدوار الكلفة فقط.';
  end if;
  if not public.in_scope_wh(d.warehouse_id) then
    raise exception 'out_of_scope' using hint = 'مخزن هذا الجرد خارج نطاقك.';
  end if;
  if new.gain_unit_cost = round(new.gain_unit_cost, 4) then
    new.gain_unit_cost := round(new.gain_unit_cost, 4);
  end if;
  update public.stock_counts set version = version + 1 where org_id = d.org_id and id = d.id;
  return new;
end
$$;

create or replace trigger expenses_check before insert on public.expenses
  for each row execute function private.expenses_check();
create or replace trigger stock_uses_guard before insert or update on public.stock_uses
  for each row execute function private.stock_doc_header_guard();
create or replace trigger stock_counts_guard before insert or update on public.stock_counts
  for each row execute function private.stock_doc_header_guard();
create or replace trigger stock_use_lines_guard before insert or update on public.stock_use_lines
  for each row execute function private.stock_use_lines_guard();
create or replace trigger stock_count_lines_guard before insert or update on public.stock_count_lines
  for each row execute function private.stock_count_lines_guard();
create or replace trigger stock_count_line_costs_guard before insert or update on public.stock_count_line_costs
  for each row execute function private.stock_count_line_costs_guard();

do $$
declare
  t text;
begin
  -- المصاريف تُضاف ولا تتعدّل (FOUNDATION ٤٣٧): تعديل أو حذف أو مسح يرفض لأي دور.
  execute 'create or replace trigger expenses_append_only before update or delete on public.expenses for each row execute function private.reject_change()';
  execute 'create or replace trigger expenses_no_truncate before truncate on public.expenses for each statement execute function private.reject_change()';
  foreach t in array array['expenses', 'stock_uses', 'stock_use_lines', 'stock_counts', 'stock_count_lines', 'stock_count_line_costs'] loop
    execute format('create or replace trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()', 'audit_' || t, t);
  end loop;
end
$$;

-- ─── RLS: المصاريف لأدوار الكلفة وبنطاق الوحدة، والصرف والجرد بنطاق المخزن، وكلفة الجرد لأدوار الكلفة (مقيِّدة، §2.8) ────────
alter table public.expenses enable row level security;
alter table public.stock_uses enable row level security;
alter table public.stock_use_lines enable row level security;
alter table public.stock_counts enable row level security;
alter table public.stock_count_lines enable row level security;
alter table public.stock_count_line_costs enable row level security;

do $$
declare
  p record;
  t text;
begin
  for p in
    select * from (values
      ('expenses', 'expenses_read', 'org_id = (select public.auth_org()) and (select public.in_scope_division(division_id))'),
      ('stock_uses', 'stock_uses_read', 'org_id = (select public.auth_org()) and (select public.in_scope_wh(warehouse_id))'),
      ('stock_use_lines', 'stock_use_lines_read', 'org_id = (select public.auth_org()) and (select public.in_scope_wh(warehouse_id))'),
      ('stock_counts', 'stock_counts_read', 'org_id = (select public.auth_org()) and (select public.in_scope_wh(warehouse_id))'),
      ('stock_count_lines', 'stock_count_lines_read', 'org_id = (select public.auth_org()) and (select public.in_scope_wh(warehouse_id))'),
      ('stock_count_line_costs', 'stock_count_line_costs_read', 'org_id = (select public.auth_org()) and (select public.in_scope_wh(warehouse_id))')
    ) as x(tbl, name, cond)
  loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.name) then
      execute format('create policy %I on public.%I for select to authenticated using (%s)', p.name, p.tbl, p.cond);
    end if;
  end loop;
  foreach t in array array['expenses', 'stock_count_line_costs'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_cost_only') then
      execute format('create policy %I on public.%I as restrictive for select to authenticated using ((select public.can_see_cost()))', t || '_cost_only', t);
    end if;
  end loop;
  -- الكتابة المباشرة (§2.5): الرأس مسوّدة بنطاق مخزنه، والسطر بفعله ونطاق مخزن صفّه المنسوخ؛ وكلفة الجرد بفعل المراجعة.
  for p in
    select * from (values
      ('stock_uses', 'stock_use.post', true),
      ('stock_use_lines', 'stock_use.post', false),
      ('stock_counts', 'count.enter', true),
      ('stock_count_lines', 'count.enter', false),
      ('stock_count_line_costs', 'count.approve', false)
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
  -- سجلّ التدقيق يحمل الصفّ كلّه (E49): الصرف والجرد بمخزنهما، والمصروف بوحدته؛ فالقارئ المحصور بنطاق يقرأ منه صفوف نطاقه بس، مثل
  -- سياسة قراءة كل جدول نفسه (قالب audit_log_stock_scope بـ0007).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'audit_log_wp5_scope') then
    create policy audit_log_wp5_scope on public.audit_log as restrictive for select to authenticated
      using (case
        when table_name in ('stock_uses', 'stock_use_lines', 'stock_counts', 'stock_count_lines', 'stock_count_line_costs')
          then public.in_scope_wh((coalesce("new", "old") ->> 'warehouse_id')::uuid)
        when table_name = 'expenses' then public.in_scope_division((coalesce("new", "old") ->> 'division_id')::uuid)
        else true
      end);
  end if;
end
$$;

revoke all on table public.expenses, public.stock_uses, public.stock_use_lines, public.stock_counts, public.stock_count_lines,
  public.stock_count_line_costs from anon, authenticated;
grant select on table public.expenses, public.stock_uses, public.stock_use_lines, public.stock_counts, public.stock_count_lines,
  public.stock_count_line_costs to authenticated;
-- المعرّف يولد بالجهاز للرأس والسطر (FOUNDATION ١٩٩): حفظ يُعاد بعد جواب ضاع يرجع 23505 بدل صفّ ثاني (العدّ بالموبايل).
grant insert (id, warehouse_id, category_id, used_on, note, status) on public.stock_uses to authenticated;
grant update (category_id, used_on, note, status) on public.stock_uses to authenticated;
grant insert (id, doc_id, item_id, item_unit_id, unit_code, qty_in_unit, lot_id) on public.stock_use_lines to authenticated;
grant update (item_id, item_unit_id, unit_code, qty_in_unit, lot_id) on public.stock_use_lines to authenticated;
grant insert (id, warehouse_id, counted_on, note, status) on public.stock_counts to authenticated;
grant update (counted_on, note, status) on public.stock_counts to authenticated;
grant insert (id, doc_id, item_id, counted_qty, counted_expired_qty, gain_expiry_on, gain_expired_expiry_on, gain_born_at) on public.stock_count_lines to authenticated;
grant update (item_id, counted_qty, counted_expired_qty, gain_expiry_on, gain_expired_expiry_on, gain_born_at, reason) on public.stock_count_lines to authenticated;
grant insert (line_id, gain_unit_cost) on public.stock_count_line_costs to authenticated;
grant update (gain_unit_cost) on public.stock_count_line_costs to authenticated;
revoke truncate on table public.expenses, public.stock_uses, public.stock_use_lines, public.stock_counts, public.stock_count_lines,
  public.stock_count_line_costs from service_role;

-- ─── المساعدات ─────────────────────────────────────────────────────────────────────────────────────────────────
-- معرّف المصروف مولود بالجهاز (FOUNDATION ٥١٩): مطلوب، وما يتكرّر لمصروف ثاني بمرجع جديد.
create or replace function private.check_expense_id(p_id uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_id is null then
    raise exception 'id_required' using hint = 'تعذّر الإرسال دون معرّف العملية. حدّث الشاشة وأعد المحاولة.';
  end if;
  if exists (select 1 from public.expenses where id = p_id) then
    raise exception 'id_reused' using hint = 'معرّف هذه العملية مستعمل لعملية أخرى. حدّث الشاشة وأعد العملية من جديد.';
  end if;
end
$$;

-- تصنيف مصروف لأصل جديد: مطلوب، بالمنشأة، غير مؤرشف، ومو نظامي (system_expense: يكتبه النظام بمستنداته)، عدا الإتلاف للصرف
-- (p_use: تصنيف مستند الصرف، والإتلاف expired_destroy صرف بدفعة منتهية مسمّاة).
create or replace function private.category_for_post(p_category uuid, p_use boolean) returns public.expense_categories
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  c public.expense_categories;
begin
  if p_category is null then
    raise exception 'category_required' using hint = 'اختر تصنيف المصروف.';
  end if;
  select * into c from public.expense_categories where org_id = public.auth_org() and id = p_category;
  if c.id is null then
    raise exception 'category_not_found' using hint = 'هذا التصنيف غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if c.archived_at is not null then
    raise exception 'category_archived' using hint = format('التصنيف «%s» مؤرشف؛ أعِده من الأرشيف أو اختر تصنيفاً آخر.', c.name);
  end if;
  if c.system_code is not null and not (p_use and c.system_code = 'expired_destroy') then
    raise exception 'system_expense' using hint = format('«%s» تصنيف نظامي يكتبه النظام بمستنداته (الجرد والإتلاف والمرتجع)؛ اختر تصنيفاً آخر.', c.name);
  end if;
  return c;
end
$$;

-- الشهر اللي ينتسب إله المصروف (Q14): أوّل يوم بشهر تاريخه أو شهر قبله، والشهر المقفول (بيه يوم ضمن الفترة المقفلة) يرفض، فأرقام
-- شهر انقفل ما تتغيّر. فارغ = شهر التاريخ. بعد قفل الفترة للمشاركة (check_post_date).
create or replace function private.expense_month(p_for_month date, p_on_date date) returns date
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_month date := date_trunc('month', coalesce(p_for_month, p_on_date))::date;
  v_lock date;
begin
  if v_month > date_trunc('month', p_on_date)::date then
    raise exception 'for_month_invalid' using hint = format('المصروف يُنسب إلى شهر تاريخه %s أو إلى شهر قبله، لا إلى شهر بعده.', to_char(p_on_date, 'MM/YYYY'));
  end if;
  select l.locked_through into v_lock from public.period_locks l where l.org_id = public.auth_org();
  if v_lock is not null and v_month <= v_lock then
    raise exception 'period_locked' using hint = format('الحسابات مقفلة حتى %s، فلا يُنسب مصروف إلى شهر %s. اختر شهراً لم يُقفل.',
      to_char(v_lock, 'DD/MM/YYYY'), to_char(v_month, 'MM/YYYY'));
  end if;
  return v_month;
end
$$;

-- نتيجة مصروف (§2.2): المعرّفات والتاريخ والشهر برّا، والمبلغ والتوزيع داخل money (تنشال لمن ما يرى الكلف).
create or replace function private.expense_result(e public.expenses, p_allocations jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', e.id, 'kind', 'expense', 'source', e.source, 'category_id', e.category_id, 'division_id', e.division_id, 'on_date', e.on_date,
    'for_month', e.for_month, 'account_id', e.account_id, 'party_id', e.party_id, 'book_id', e.book_id, 'site_id', e.site_id,
    'doc_kind', e.doc_kind, 'doc_id', e.doc_id, 'reverses', e.reverses_id, 'cash_move_id', e.cash_move_id, 'party_entry_id', e.party_entry_id,
    'money', jsonb_build_object('amount', e.amount::text, 'allocations', coalesce(p_allocations, '[]'::jsonb))
  )
$$;

-- مصروف يكتبه مستند (الصرف والجرد، المصدر stock): بتصنيف المستند ووحدة مخزنه وتاريخه وشهره، ومبلغه مجموع قيم السحب.
create or replace function private.write_stock_expense(p_category uuid, p_division uuid, p_amount numeric, p_on_date date, p_doc_kind text, p_doc uuid)
returns public.expenses
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e public.expenses;
begin
  insert into public.expenses (org_id, category_id, division_id, amount, on_date, for_month, source, doc_kind, doc_id)
  values (public.auth_org(), p_category, p_division, p_amount, p_on_date, date_trunc('month', p_on_date)::date, 'stock', p_doc_kind, p_doc)
  returning * into e;
  return e;
end
$$;

-- عكس مصروف مستند (إلغاء الصرف والجرد): صفّ عكسي بيوم الإلغاء وشهره، وبسبب الإلغاء. الأصل مقفول قبلها من المستدعي.
create or replace function private.reverse_stock_expense(p_expense uuid, p_reason text) returns public.expenses
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.expenses;
  r public.expenses;
begin
  select * into o from public.expenses where org_id = public.auth_org() and id = p_expense;
  insert into public.expenses (org_id, category_id, division_id, amount, on_date, for_month, source, site_id, doc_kind, doc_id, reverses_id, note, reason)
  values (o.org_id, o.category_id, o.division_id, -o.amount, public.app_today(), date_trunc('month', public.app_today())::date, o.source, o.site_id,
    o.doc_kind, o.doc_id, o.id, o.note, p_reason)
  returning * into r;
  return r;
end
$$;

-- ─── المصاريف (FOUNDATION ٥٥٧، Q13، Q14) ───────────────────────────────────────────────────────────────────────
-- تسجيل مصروف (expense.post): نقداً (حركة صندوق سالبة) أو بالدين (قيد bill سالب «له» بدفتر الوحدة، يتوزّع بالقاعدة 27). المفقس
-- بلا دفتر رئيسي: الدفتر يُسمّى صراحةً (الأفراخ أو بيض التفقيس)، وغيره دفتر الوحدة الرئيسي. التاريخ بقاعدة الأيام السبعة، والشهر
-- بـfor_month (Q14). الفوج ووجبة الفقس يرفضان لحد المرحلتين 3 و5 بنفس التوقيع (Q13). بلا رقم (E12). الأقفال (§2.3): المرجع ←
-- الجهة ← قفل الفترة وصفّ الوحدة (check_post_date) ← الصندوق.
create or replace function public.record_expense(p_id uuid, p_category uuid, p_division uuid, p_amount numeric, p_on_date date, p_source text,
  p_account uuid, p_party uuid, p_book uuid, p_site uuid, p_flock uuid, p_hatch_batch uuid, p_note text, p_for_month date, p_client_ref uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'record_expense';
  v_cached jsonb;
  d public.divisions;
  c public.expense_categories;
  b public.ledger_books;
  a public.cash_accounts;
  m public.cash_moves;
  pe public.party_entries;
  e public.expenses;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_month date;
  v_alloc jsonb := '[]'::jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('expense.post');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'category', p_category, 'division', p_division, 'amount', p_amount,
    'on_date', p_on_date, 'source', p_source, 'account', p_account, 'party', p_party, 'book', p_book, 'site', p_site, 'flock', p_flock,
    'hatch_batch', p_hatch_batch, 'note', p_note, 'for_month', p_for_month));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.check_expense_id(p_id);
  if p_flock is not null or p_hatch_batch is not null then
    raise exception 'flock_not_available' using hint = 'تحميل المصروف على فوج يأتي مع الأفواج (المرحلة 3)، وعلى وجبة فقس مع المفقس (المرحلة 5). سجّله الآن على الوحدة.';
  end if;
  if p_division is null then
    raise exception 'division_required' using hint = 'اختر الوحدة التي يُحمَّل عليها المصروف.';
  end if;
  select * into d from public.divisions where org_id = public.auth_org() and id = p_division;
  if d.id is null then
    raise exception 'division_not_found' using hint = 'هذه الوحدة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_division(d.id) then
    raise exception 'out_of_scope' using hint = format('«%s» خارج نطاقك، فلا تسجّل عليها مصروفاً.', d.name);
  end if;
  if d.archived_at is not null then
    raise exception 'division_archived' using hint = format('«%s» مؤرشفة، فلا يُسجَّل عليها مصروف جديد.', d.name);
  end if;
  c := private.category_for_post(p_category, false);
  perform private.check_amount(p_amount, true);
  if v_note is not null and length(v_note) > 500 then
    raise exception 'note_too_long' using hint = 'الملاحظة حتى 500 حرف.';
  end if;
  if p_source = 'cash' then
    if p_party is not null or p_book is not null then
      raise exception 'source_mismatch' using hint = 'المصروف النقدي من صندوق، بلا جهة ولا دفتر؛ وبالدين على جهة بدفترها، بلا صندوق.';
    end if;
    if p_account is null then
      raise exception 'cash_account_required' using hint = 'اختر الصندوق الذي دُفع منه المصروف.';
    end if;
  elsif p_source = 'credit' then
    if p_account is not null then
      raise exception 'source_mismatch' using hint = 'المصروف النقدي من صندوق، بلا جهة ولا دفتر؛ وبالدين على جهة بدفترها، بلا صندوق.';
    end if;
    perform private.party_for_post(p_party);
    if p_book is null then
      select * into b from public.ledger_books where org_id = d.org_id and division_id = d.id and code = 'main';
      if b.id is null then
        raise exception 'book_required' using hint = format('لـ«%s» دفتران؛ اختر «دفتر الأفراخ» أو «دفتر بيض التفقيس» لهذا المصروف.', d.name);
      end if;
      b := private.book_for_post(b.id);
    else
      b := private.book_for_post(p_book);
      if b.division_id <> d.id then
        raise exception 'book_mismatch' using hint = format('الدفتر «%s» ليس من دفاتر «%s»؛ المصروف بالدين يُسجَّل بدفتر وحدته.', b.name, d.name);
      end if;
    end if;
  else
    raise exception 'source_required' using hint = 'اختر طريقة الدفع: نقداً من صندوق، أو بالدين على جهة.';
  end if;
  if p_site is not null and not exists (
    select 1 from public.sites s where s.org_id = d.org_id and s.id = p_site and s.division_id = d.id and s.archived_at is null
  ) then
    raise exception 'site_mismatch' using hint = format('الموقع المختار ليس من مواقع «%s» الفعّالة.', d.name);
  end if;
  perform private.lock_parties(array[p_party]);
  perform private.check_post_date(p_on_date, d.id);
  v_month := private.expense_month(p_for_month, p_on_date);
  if p_source = 'cash' then
    a := private.lock_cash_account(p_account, true);
    m := private.write_cash_move(a.id, -p_amount, 'expense', 'expense', p_id, null, p_on_date, null, v_note);
    insert into public.expenses (id, org_id, category_id, division_id, amount, on_date, for_month, source, account_id, site_id, cash_move_id, note)
    values (p_id, d.org_id, c.id, d.id, p_amount, p_on_date, v_month, 'cash', a.id, p_site, m.id, v_note)
    returning * into e;
  else
    pe := private.write_entry(gen_random_uuid(), p_party, b.id, 'bill', -p_amount, 'expense', p_id, null, p_on_date, null);
    v_alloc := private.allocate_entry(pe.id, null);
    insert into public.expenses (id, org_id, category_id, division_id, amount, on_date, for_month, source, party_id, book_id, site_id, party_entry_id, note)
    values (p_id, d.org_id, c.id, d.id, p_amount, p_on_date, v_month, 'credit', p_party, b.id, p_site, pe.id, v_note)
    returning * into e;
  end if;
  perform private.mark_division_posted(d.id);
  return private.ref_store(v_fn, p_client_ref, private.expense_result(e, v_alloc));
end
$$;

-- إلغاء مصروف (void، FOUNDATION ٥٥٧): صفّ عكسي بيوم الإلغاء وشهره، وحركة الصندوق العكسية أو قيد bill العكسي (زوج مغلق، والتوزيعات
-- تنفكّ وتتوزّع من جديد). مصروف كتبه مستند (stock وadjustment) يُلغى من مستنده (system_expense). يمرّ للصندوق أو الجهة المؤرشفة (E43).
create or replace function public.void_expense(p_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_expense';
  v_cached jsonb;
  v_reason text;
  e public.expenses;
  m public.cash_moves;
  m2 public.cash_moves;
  v_rev uuid;
  r public.expenses;
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into e from public.expenses where org_id = public.auth_org() and id = p_id;
  if e.id is null then
    raise exception 'expense_not_found' using hint = 'هذا المصروف غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if e.reverses_id is not null then
    raise exception 'not_voidable' using hint = 'هذا صفّ إلغاء لمصروف سابق، فلا يُلغى.';
  end if;
  if e.source in ('stock', 'adjustment') then
    raise exception 'system_expense' using hint = 'هذا المصروف كتبه مستند (الصرف أو الجرد أو الاستلام)، فيُلغى من مستنده.';
  end if;
  if not public.in_scope_division(e.division_id) then
    raise exception 'out_of_scope' using hint = 'وحدة هذا المصروف خارج نطاقك، فلا تلغيه.';
  end if;
  perform private.lock_parties(array[e.party_id]);
  perform private.check_void_date();
  select * into e from public.expenses where org_id = e.org_id and id = e.id for update;
  if exists (select 1 from public.expenses x where x.org_id = e.org_id and x.reverses_id = e.id) then
    raise exception 'already_reversed' using hint = 'هذا المصروف أُلغي من قبل.';
  end if;
  if e.source = 'cash' then
    select * into m from public.cash_moves where org_id = e.org_id and id = e.cash_move_id;
    perform private.lock_cash_account(m.account_id, false);
    m2 := private.write_cash_move(m.account_id, -m.amount, m.kind, m.doc_kind, m.doc_id, null, public.app_today(), m.id, v_reason);
  else
    v_rev := private.void_entry(e.party_entry_id, v_reason);
  end if;
  insert into public.expenses (org_id, category_id, division_id, amount, on_date, for_month, source, account_id, party_id, book_id, site_id,
    cash_move_id, party_entry_id, reverses_id, note, reason)
  values (e.org_id, e.category_id, e.division_id, -e.amount, public.app_today(), date_trunc('month', public.app_today())::date, e.source,
    e.account_id, e.party_id, e.book_id, e.site_id, m2.id, v_rev, e.id, e.note, v_reason)
  returning * into r;
  return private.ref_store(v_fn, p_client_ref, private.expense_result(r, '[]'::jsonb));
end
$$;

-- ─── الصرف لمصروف عام والإتلاف (FOUNDATION ٥٥٦، Q5، E31) ─────────────────────────────────────────────────────────
-- اسم المستند للتلميح والعرض (يحلّ محلّ نسخة 0007): رقم التحويل أو الصرف أو الجرد، أو «افتتاح بتاريخ …».
create or replace function private.stock_doc_label(p_kind text, p_doc uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case p_kind
    when 'transfer' then coalesce((select t.doc_no from public.transfers t where t.org_id = public.auth_org() and t.id = p_doc), 'تحويل')
    when 'opening' then coalesce((select format('رصيد افتتاح بتاريخ %s', to_char(o.on_date, 'DD/MM/YYYY')) from public.opening_docs o
      where o.org_id = public.auth_org() and o.id = p_doc), 'رصيد افتتاح')
    when 'stock_use' then coalesce((select u.doc_no from public.stock_uses u where u.org_id = public.auth_org() and u.id = p_doc), 'صرف')
    when 'count' then coalesce((select c.doc_no from public.stock_counts c where c.org_id = public.auth_org() and c.id = p_doc), 'جرد')
    else p_kind
  end
$$;

-- مشكلة سطر صرف (Q5): الإتلاف يسمّي دفعته، والدفعة المسمّاة منتهية بتاريخ المستند (الصالح يُسحب بترتيبه)، وبيها الكمية (بعد سطور
-- قبله على نفس الدفعة). أوّل مشكلة أو null؛ نفس الفحص بالمعاينة وبالترحيل.
create or replace function private.use_line_problem(p_date date, p_line public.stock_use_lines, p_destroy boolean, p_before numeric) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  i public.items;
  l public.stock_lots;
begin
  select * into i from public.items where org_id = public.auth_org() and id = p_line.item_id;
  if p_line.lot_id is null then
    if p_destroy then
      return jsonb_build_object('code', 'lot_required', 'hint', format('الإتلاف يسمّي الدفعة المنتهية؛ اختر دفعة «%s».', i.name));
    end if;
    return null;
  end if;
  select * into l from public.stock_lots where org_id = public.auth_org() and id = p_line.lot_id;
  if not private.lot_expired(i.tracks_expiry, l.expiry_on, p_date) then
    return jsonb_build_object('code', 'lot_not_expired', 'hint', format('دفعة «%s» المسمّاة صالحة بتاريخ المستند؛ الإتلاف للمنتهي فقط، والصالح يُصرف بترتيبه دون تسمية دفعة.', i.name));
  end if;
  if l.received_on > p_date or l.qty_left - coalesce(p_before, 0) < p_line.qty_base then
    return jsonb_build_object('code', 'insufficient_stock', 'hint', format('لا يكفي رصيد دفعة «%s» المسمّاة: المطلوب %s، وفيها %s.', i.name,
      private.qty_text(p_line.qty_base, i.base_unit),
      private.qty_text(case when l.received_on > p_date then 0 else greatest(l.qty_left - coalesce(p_before, 0), 0) end, i.base_unit)));
  end if;
  return null;
end
$$;

-- الترحيل (stock_use.post؛ والإتلاف expired.destroy؛ والدفعة المنتهية المسمّاة expired.release، Q5): كل سطر يسحب (بالترتيب، أو من
-- دفعته المسمّاة) وحركات stock_use، ومصروف واحد بمصدر stock بتصنيف المستند ووحدة مخزنه = مجموع قيم السحب (والصفر بلا مصروف)، ورقم
-- SU. p_expected_plan بصمة المعاينة (مثل التحويل): قطع غيرها ← stale_preview والسحب كلّه يرجع. الأقفال (§2.3): المرجع ← قفل الفترة
-- وصفّ الوحدة ← المستند ← المخزن والمواد ← الأرصدة ← الدفعات ← العدّاد.
create or replace function public.post_stock_use(p_id uuid, p_expected_version int, p_expected_plan text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'post_stock_use';
  v_cached jsonb;
  d public.stock_uses;
  w public.warehouses;
  c public.expense_categories;
  ln public.stock_use_lines;
  i public.items;
  v_items uuid[];
  v_destroy boolean;
  dr record;
  v_date date;
  v_problem jsonb;
  v_pieces text[];
  v_plan text := '';
  v_draws jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_line_value numeric;
  v_total numeric := 0;
  e public.expenses;
  v_no text;
begin
  set local lock_timeout = '5s';
  perform private.require('stock_use.post');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'version', p_expected_version, 'plan', p_expected_plan));
  if v_cached is not null then
    return v_cached;
  end if;
  select * into d from public.stock_uses where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(d.warehouse_id, true);
  v_date := d.used_on;
  perform private.check_post_date(v_date, w.division_id);
  select * into d from public.stock_uses where org_id = w.org_id and id = p_id for update;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'هذا المستند ليس مسوّدة: رُحّل أو أُلغي من قبل.';
  end if;
  if p_expected_version is null or d.version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّرت المسوّدة بعد المعاينة. راجعها وعاينها من جديد قبل الترحيل.';
  end if;
  if d.used_on is distinct from v_date then
    raise exception 'stale_draft' using hint = 'تغيّر تاريخ المسوّدة أثناء الترحيل. راجعها وعاينها من جديد.';
  end if;
  select array_agg(distinct x.item_id) into v_items from public.stock_use_lines x where x.org_id = d.org_id and x.doc_id = d.id;
  if v_items is null then
    raise exception 'doc_empty' using hint = 'المستند بلا سطور. أضف سطراً واحداً على الأقلّ.';
  end if;
  c := private.category_for_post(d.category_id, true);
  v_destroy := coalesce(c.system_code = 'expired_destroy', false);
  if v_destroy and not public.can('expired.destroy') then
    raise exception 'forbidden' using hint = 'إتلاف المنتهي يرحّله المدير؛ اترك المسوّدة له في «بانتظار موافقة المدير».';
  end if;
  perform private.lock_masters(array[w.id], v_items, true);
  perform private.lock_balances(v_items, array_fill(w.id, array[cardinality(v_items)]));
  for ln in select * from public.stock_use_lines x where x.org_id = d.org_id and x.doc_id = d.id order by x.line_no loop
    select * into i from public.items where org_id = d.org_id and id = ln.item_id;
    v_draws := '[]'::jsonb;
    v_line_value := 0;
    v_pieces := '{}'::text[];
    if ln.lot_id is not null then
      -- الدفعة المسمّاة: سطور قبله سحبت منها فعلاً (متبقّيها الآن بعدها)، فالفحص على الحاضر بلا طرح.
      v_problem := private.use_line_problem(d.used_on, ln, v_destroy, 0);
      perform private.raise_problem(v_problem);
      if not v_destroy and not public.can('expired.release') then
        raise exception 'expired_needs_release' using hint = format('السطر %s يسمّي دفعة منتهية من «%s»؛ صرفها يحتاج موافقة المدير، فاترك المسوّدة له في «بانتظار موافقة المدير».',
          ln.line_no, i.name);
      end if;
      for dr in select * from private.draw(ln.item_id, w.id, ln.qty_base, d.used_on, ln.lot_id, true) loop
        v_pieces := v_pieces || private.plan_piece(dr.lot_id, dr.qty, dr.value);
        perform private.apply_move(dr.lot_id, 'stock_use', d.id, ln.id, -dr.qty, -dr.value, d.used_on, null, false);
        v_line_value := v_line_value + dr.value;
        v_draws := v_draws || jsonb_build_array(jsonb_build_object('lot_id', dr.lot_id, 'qty', dr.qty::text, 'money', jsonb_build_object('value', dr.value::text)));
      end loop;
    else
      perform private.raise_problem(private.use_line_problem(d.used_on, ln, v_destroy, 0));
      for dr in select * from private.draw(ln.item_id, w.id, ln.qty_base, d.used_on, null, false) loop
        v_pieces := v_pieces || private.plan_piece(dr.lot_id, dr.qty, dr.value);
        perform private.apply_move(dr.lot_id, 'stock_use', d.id, ln.id, -dr.qty, -dr.value, d.used_on, null, coalesce(i.tracks_expiry, false));
        v_line_value := v_line_value + dr.value;
        v_draws := v_draws || jsonb_build_array(jsonb_build_object('lot_id', dr.lot_id, 'qty', dr.qty::text, 'money', jsonb_build_object('value', dr.value::text)));
      end loop;
    end if;
    v_total := v_total + v_line_value;
    v_plan := v_plan || ln.id::text || '|' || array_to_string(v_pieces, ';') || '/';
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('line_id', ln.id, 'item_id', ln.item_id, 'qty', ln.qty_base::text, 'lot_id', ln.lot_id,
      'draws', v_draws, 'money', jsonb_build_object('value', v_line_value::text)));
  end loop;
  if p_expected_plan is null or private.plan_token(v_plan) is distinct from p_expected_plan then
    raise exception 'stale_preview' using hint = 'تغيّر المخزون بعد المعاينة فتغيّرت الدفعات المسحوبة أو كمياتها. عاين الصرف من جديد ووافق عليه قبل الترحيل.';
  end if;
  if v_total > 0 then
    e := private.write_stock_expense(c.id, w.division_id, v_total, d.used_on, 'stock_use', d.id);
  end if;
  v_no := private.next_doc_no('SU', d.used_on);
  update public.stock_uses set status = 'posted', doc_no = v_no, client_ref = p_client_ref, posted_at = now(), posted_by = auth.uid()
  where org_id = d.org_id and id = d.id;
  perform private.mark_division_posted(w.division_id);
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'kind', 'stock_use', 'status', 'posted', 'doc_no', v_no,
    'warehouse_id', w.id, 'used_on', d.used_on, 'category_id', c.id, 'destroy', v_destroy, 'expense_id', e.id, 'lines', v_lines,
    'money', jsonb_build_object('total', v_total::text)));
end
$$;

-- الإلغاء (void): كل سحب أصلي ينعكس بيوم الإلغاء (الكمية ترجع لدفعتها)، والمصروف بصفّ عكسي. يمرّ للمؤرشف (E43).
create or replace function public.void_stock_use(p_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_stock_use';
  v_cached jsonb;
  v_reason text;
  d public.stock_uses;
  w public.warehouses;
  v_items uuid[];
  e public.expenses;
  r public.expenses;
  m public.stock_moves;
  v_back int := 0;
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into d from public.stock_uses where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(d.warehouse_id, true);
  perform private.check_void_date();
  select * into d from public.stock_uses where org_id = w.org_id and id = p_id for update;
  if d.status = 'void' then
    raise exception 'already_void' using hint = 'هذا المستند ملغى من قبل.';
  end if;
  if d.status <> 'posted' then
    raise exception 'not_posted' using hint = 'هذا المستند مسوّدة لم تُرحَّل؛ تُطوى المسوّدة بدل إلغائها.';
  end if;
  select * into e from public.expenses x
  where x.org_id = d.org_id and x.doc_kind = 'stock_use' and x.doc_id = d.id and x.reverses_id is null
  for update;
  select array_agg(distinct x.item_id) into v_items from public.stock_use_lines x where x.org_id = d.org_id and x.doc_id = d.id;
  perform private.lock_masters(array[w.id], v_items, false);
  perform private.lock_balances(v_items, array_fill(w.id, array[cardinality(v_items)]));
  for m in
    select x.* from public.stock_moves x
    where x.org_id = d.org_id and x.doc_kind = 'stock_use' and x.doc_id = d.id and x.reverses_move_id is null
    order by x.item_id, x.seq
  loop
    perform private.apply_move(m.lot_id, 'stock_use', d.id, m.doc_line_id, -m.qty, -m.value, public.app_today(), m.id);
    v_back := v_back + 1;
  end loop;
  if e.id is not null then
    r := private.reverse_stock_expense(e.id, v_reason);
  end if;
  update public.stock_uses set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
  where org_id = d.org_id and id = d.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'kind', 'stock_use', 'status', 'void', 'doc_no', d.doc_no,
    'reversed_moves', v_back, 'expense_reversal_id', r.id));
end
$$;

-- المعاينة (stock_use.post): لكل سطر السحب بالدفعات (الكمية للكل والقيمة داخل money)، والمتاح والمنتهي والنقص واستهلاك الرصيد كلّه
-- (E31)، والدفعة المسمّاة وانتهاؤها، وهل يحتاج المدير (إتلاف أو إذن منتهي، Q5)، ومشاكل المستند، وبصمة الخطّة؛ بلا كتابة ولا قفل.
create or replace function public.preview_stock_use(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d public.stock_uses;
  w public.warehouses;
  c public.expense_categories;
  v_destroy boolean := false;
  v_problems jsonb := '[]'::jsonb;
  v_date jsonb;
  v_lines jsonb := '[]'::jsonb;
  ln public.stock_use_lines;
  i public.items;
  l public.stock_lots;
  s record;
  v_before numeric[];
  v_skip numeric;
  v_draws jsonb;
  v_drawn numeric;
  v_value numeric;
  v_total numeric := 0;
  v_problem jsonb;
  v_ready boolean := true;
  v_piece_text text;
  v_plan text := '';
  v_release boolean := false;
begin
  perform private.require('stock_use.post');
  select * into d from public.stock_uses where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(d.warehouse_id, true);
  if d.status <> 'draft' then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'not_draft', 'hint', 'هذا المستند ليس مسوّدة.'));
  end if;
  v_date := private.date_problem(d.used_on, w.division_id, false);
  if v_date is not null then
    v_problems := v_problems || jsonb_build_array(v_date);
  end if;
  if w.archived_at is not null then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'warehouse_archived', 'hint', format('المخزن «%s» مؤرشف.', w.name)));
  end if;
  select * into c from public.expense_categories where org_id = d.org_id and id = d.category_id;
  if c.id is null then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'category_required', 'hint', 'اختر تصنيف المصروف.'));
  elsif c.archived_at is not null then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'category_archived', 'hint', format('التصنيف «%s» مؤرشف.', c.name)));
  elsif c.system_code is not null and c.system_code <> 'expired_destroy' then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'system_expense', 'hint', format('«%s» تصنيف نظامي يكتبه النظام بمستنداته؛ اختر تصنيفاً آخر.', c.name)));
  end if;
  v_destroy := coalesce(c.system_code = 'expired_destroy', false);
  for ln in select * from public.stock_use_lines x where x.org_id = d.org_id and x.doc_id = d.id order by x.line_no loop
    select * into i from public.items where org_id = d.org_id and id = ln.item_id;
    -- السطور قبله من نفس المادّة ونفس الدفعة (المسمّاة أو الترتيب)، كل واحد سحب لحاله (draw_plan يعيدها مثل الترحيل): المسمّاة
    -- منتهية والترتيب يسحب الصالح بس، فالوضعان ما يلمسون نفس الدفعات.
    select coalesce(array_agg(x.qty_base order by x.line_no), '{}'), coalesce(sum(x.qty_base), 0) into v_before, v_skip from public.stock_use_lines x
    where x.org_id = d.org_id and x.doc_id = d.id and x.item_id = ln.item_id and x.lot_id is not distinct from ln.lot_id and x.line_no < ln.line_no;
    select coalesce(jsonb_agg(jsonb_build_object('lot_id', p.lot_id, 'qty', p.qty::text, 'received_on', x.received_on, 'expiry_on', x.expiry_on,
        'source_kind', x.source_kind, 'source', private.stock_doc_label(x.source_kind, x.source_id), 'supplier_lot_no', x.supplier_lot_no,
        'money', jsonb_build_object('value', p.value::text)) order by p.n), '[]'::jsonb),
      coalesce(sum(p.qty), 0), coalesce(sum(p.value), 0),
      coalesce(string_agg(private.plan_piece(p.lot_id, p.qty, p.value), ';' order by p.n), '')
    into v_draws, v_drawn, v_value, v_piece_text
    from private.draw_plan(ln.item_id, w.id, ln.qty_base, d.used_on, ln.lot_id, ln.lot_id is not null, v_before) with ordinality as p(lot_id, qty, value, n)
    join public.stock_lots x on x.org_id = d.org_id and x.id = p.lot_id;
    select * into s from private.stock_at(ln.item_id, w.id, d.used_on);
    l := null;
    if ln.lot_id is not null then
      select * into l from public.stock_lots where org_id = d.org_id and id = ln.lot_id;
    end if;
    v_problem := coalesce(private.use_line_problem(d.used_on, ln, v_destroy, v_skip),
      case when i.archived_at is not null then jsonb_build_object('code', 'item_archived', 'hint', format('المادّة «%s» مؤرشفة.', i.name)) end);
    v_release := v_release or (ln.lot_id is not null and not v_destroy);
    v_ready := v_ready and v_problem is null and v_drawn = ln.qty_base;
    v_total := v_total + v_value;
    v_plan := v_plan || ln.id::text || '|' || v_piece_text || '/';
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('line_id', ln.id, 'line_no', ln.line_no, 'item_id', i.id, 'item_name', i.name,
      'base_unit', i.base_unit, 'tracks_expiry', i.tracks_expiry, 'qty', ln.qty_base::text, 'qty_in_unit', ln.qty_in_unit::text,
      'unit_label', ln.unit_label, 'item_unit_id', ln.item_unit_id, 'unit_code', ln.unit_code,
      'lot_id', ln.lot_id, 'lot_expiry_on', l.expiry_on, 'lot_received_on', l.received_on,
      'lot_left', case when l.id is null then null else greatest(l.qty_left - v_skip, 0)::text end,
      'available', greatest(s.available - case when ln.lot_id is null then v_skip else 0 end, 0)::text, 'expired', s.expired::text, 'later', s.later::text,
      'shortage', (ln.qty_base - v_drawn)::text,
      'whole_balance', v_drawn = ln.qty_base and case when ln.lot_id is null then v_skip + ln.qty_base = s.available else v_skip + ln.qty_base = l.qty_left end,
      'needs_release', ln.lot_id is not null and not v_destroy,
      'problem', v_problem, 'draws', v_draws, 'money', jsonb_build_object('value', v_value::text)));
  end loop;
  return private.mask(jsonb_build_object('id', d.id, 'kind', 'stock_use', 'status', d.status, 'version', d.version, 'doc_no', d.doc_no,
    'warehouse_id', w.id, 'used_on', d.used_on, 'category_id', d.category_id, 'category_name', c.name, 'destroy', v_destroy,
    'division_kind', (select x.kind from public.divisions x where x.org_id = w.org_id and x.id = w.division_id),
    -- يحتاج المدير: إتلاف، أو سطر يسمّي دفعة منتهية (Q5)؛ ومن يقدر يرحّله الآن.
    'needs_manager', v_destroy or v_release,
    'can_post', case when v_destroy then public.can('expired.destroy') when v_release then public.can('expired.release') else true end,
    'problems', v_problems, 'lines', v_lines, 'plan', private.plan_token(v_plan),
    'ready', v_ready and jsonb_array_length(v_problems) = 0 and jsonb_array_length(v_lines) > 0,
    'money', jsonb_build_object('total', v_total::text)));
end
$$;

-- ─── الجرد (FOUNDATION ٥٥٥، القاعدة 17، E25، E41، E42، E45، E48، E53، E55) ─────────────────────────────────────────
-- مشكلة محسوبة ({code, hint}) ترفض برمزها (يحلّ محلّ نسخة 0007 ويزيد رموز الصرف والجرد): المعاينة تعرضها والترحيل يرفض بيها.
create or replace function private.raise_problem(p_problem jsonb) returns void
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare
  v_hint text := p_problem ->> 'hint';
begin
  if p_problem is null then
    return;
  end if;
  case p_problem ->> 'code'
    when 'item_kind_mismatch' then raise exception 'item_kind_mismatch' using hint = coalesce(v_hint, 'نوع المادّة لا يناسب نوع المخزن.');
    when 'egg_flock_required' then raise exception 'egg_flock_required' using hint = coalesce(v_hint, 'بيض المائدة يُفتتح بفوجه في المرحلة 4.');
    when 'value_required' then raise exception 'value_required' using hint = coalesce(v_hint, 'اكتب القيمة؛ الصفر يُقبل مع سببه فقط.');
    when 'pieces_not_whole' then raise exception 'pieces_not_whole' using hint = coalesce(v_hint, 'المعدود يُسجَّل بأعداد صحيحة.');
    when 'expiry_required' then raise exception 'expiry_required' using hint = coalesce(v_hint, 'اكتب تاريخ الانتهاء.');
    when 'expiry_not_tracked' then raise exception 'expiry_not_tracked' using hint = coalesce(v_hint, 'هذه المادّة لا تتابع تاريخ الانتهاء.');
    when 'born_at_required' then raise exception 'born_at_required' using hint = coalesce(v_hint, 'اكتب وقت الفقس.');
    when 'born_at_not_chick' then raise exception 'born_at_not_chick' using hint = coalesce(v_hint, 'وقت الفقس للأفراخ فقط.');
    when 'born_at_future' then raise exception 'born_at_future' using hint = coalesce(v_hint, 'وقت الفقس بعد الآن؛ اكتب وقتاً مضى.');
    when 'item_has_moves' then raise exception 'item_has_moves' using hint = coalesce(v_hint, 'للمادّة حركات مرحّلة في هذا المخزن؛ الفرق يُسجَّل بالجرد.');
    when 'lot_required' then raise exception 'lot_required' using hint = coalesce(v_hint, 'الإتلاف يسمّي الدفعة المنتهية.');
    when 'lot_not_expired' then raise exception 'lot_not_expired' using hint = coalesce(v_hint, 'الدفعة المسمّاة صالحة؛ الإتلاف للمنتهي فقط.');
    when 'insufficient_stock' then raise exception 'insufficient_stock' using hint = coalesce(v_hint, 'لا يكفي الرصيد.');
    when 'gain_expiry_mismatch' then raise exception 'gain_expiry_mismatch' using hint = coalesce(v_hint, 'تاريخ انتهاء الزيادة لا يناسب حالتها.');
    when 'reason_required' then raise exception 'reason_required' using hint = coalesce(v_hint, 'اكتب السبب.');
    when 'gain_cost_required' then raise exception 'gain_cost_required' using hint = coalesce(v_hint, 'اكتب كلفة وحدة الزيادة.');
    else raise exception 'rejected' using hint = coalesce(v_hint, 'رُفض الطلب.');
  end case;
end
$$;

-- السحب من المنتهي بس (E41): نقص الجرد المنتهي يسحب الدفعات المنتهية بتاريخ الجرد، الأقدم انتهاءً أوّلاً، وتتقفل for no key update
-- مثل draw. يرجّع القطع؛ الحركات يكتبها المستدعي.
create or replace function private.draw_expired(p_item uuid, p_wh uuid, p_qty numeric, p_date date)
returns table (lot_id uuid, qty numeric, value numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tracks boolean;
  v_left numeric := p_qty;
  v_take numeric;
  c record;
begin
  set local lock_timeout = '5s';
  if p_qty is null or not (abs(p_qty) < 'Infinity') or p_qty <= 0 then
    raise exception 'qty_not_positive' using hint = 'اكتب كمية أكبر من صفر.';
  end if;
  select i.tracks_expiry into v_tracks from public.items i where i.org_id = public.auth_org() and i.id = p_item;
  for c in
    select l.id, l.qty_left, l.value_left from public.stock_lots l
    where l.org_id = public.auth_org() and l.item_id = p_item and l.warehouse_id = p_wh and l.qty_left > 0 and l.received_on <= p_date
      and private.lot_expired(v_tracks, l.expiry_on, p_date)
    order by l.expiry_on asc nulls last, l.fifo_seq, l.id
    for no key update
  loop
    exit when v_left <= 0;
    v_take := least(v_left, c.qty_left);
    lot_id := c.id;
    qty := v_take;
    value := case when v_take = c.qty_left then c.value_left else private._mul_div_round2(v_take, c.value_left, c.qty_left) end;
    v_left := v_left - v_take;
    return next;
  end loop;
  if v_left > 0 then
    perform private.raise_shortage(p_item, p_wh, p_qty, p_date);
  end if;
end
$$;

-- خطّته بلا قفل (المعاينة): نفس الترتيب ونفس القيمة.
create or replace function private.draw_expired_plan(p_item uuid, p_wh uuid, p_qty numeric, p_date date)
returns table (lot_id uuid, qty numeric, value numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_tracks boolean;
  v_left numeric := coalesce(p_qty, 0);
  v_take numeric;
  c record;
begin
  select i.tracks_expiry into v_tracks from public.items i where i.org_id = public.auth_org() and i.id = p_item;
  for c in
    select l.id, l.qty_left, l.value_left from public.stock_lots l
    where l.org_id = public.auth_org() and l.item_id = p_item and l.warehouse_id = p_wh and l.qty_left > 0 and l.received_on <= p_date
      and private.lot_expired(v_tracks, l.expiry_on, p_date)
    order by l.expiry_on asc nulls last, l.fifo_seq, l.id
  loop
    exit when v_left <= 0;
    v_take := least(v_left, c.qty_left);
    lot_id := c.id;
    qty := v_take;
    value := case when v_take = c.qty_left then c.value_left else private._mul_div_round2(v_take, c.value_left, c.qty_left) end;
    v_left := v_left - v_take;
    return next;
  end loop;
end
$$;

-- دفعة القياس للزيادة (القاعدة 17، E45): من دفعات المادّة بالمنشأة كلها (أيّ مصدر وأيّ مخزن) اللي حركتها الأصلية ما انعكست، الأكبر
-- fifo_seq، والتعادل (الجذر ومراياه) الجذر أوّلاً ثم المعرّف؛ وvalue_in/qty_in كما هما (ويّا التقييم، WP7). مرآتها
-- pickGainReferenceLot بـsrc/domain/count.ts.
create or replace function private.gain_reference_lot(p_item uuid) returns public.stock_lots
language sql stable security definer set search_path = public, pg_temp as $$
  select l.* from public.stock_lots l
  where l.org_id = public.auth_org() and l.item_id = p_item
    and not exists (
      select 1 from public.stock_moves m join public.stock_moves r on r.org_id = m.org_id and r.reverses_move_id = m.id
      where m.org_id = l.org_id and m.lot_id = l.id and m.qty > 0 and m.reverses_move_id is null)
  order by l.fifo_seq desc, (l.origin_lot_id is null) desc, l.id
  limit 1
$$;

-- قيمة زيادة (القاعدة 17، E48): من دفعة القياس _mul_div_round2(q, value_in, qty_in)، وبلاها كلفة وحدة المدير _mul_div_round2(q, cost, 1)،
-- وبلا الاثنين فارغ (gain_cost_required). مرآتها gainValue.
create or replace function private.gain_value(p_qty numeric, p_ref public.stock_lots, p_unit_cost numeric) returns numeric
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_ref.id is not null then private._mul_div_round2(p_qty, p_ref.value_in, p_ref.qty_in)
    when p_unit_cost is not null then private._mul_div_round2(p_qty, p_unit_cost, 1)
  end
$$;

-- مشكلة سطر جرد بالعدّ نفسه (بلا الفرق): الأهلية، وبيض المائدة لحد المرحلة 4 (Q13)، والمعدود أعداد صحيحة، والمنتهي ووقت الفقس بمادّتهما.
create or replace function private.count_line_problem(p_wh public.warehouses, p_line public.stock_count_lines) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  i public.items;
begin
  select * into i from public.items where org_id = public.auth_org() and id = p_line.item_id;
  if not private.item_admissible(p_wh.kind, i.kind) then
    return jsonb_build_object('code', 'item_kind_mismatch', 'hint', format('«%s» لا يُخزَّن في «%s»: نوع المادّة لا يناسب نوع المخزن.', i.name, p_wh.name));
  end if;
  if i.kind = 'table_egg' then
    return jsonb_build_object('code', 'egg_flock_required', 'hint', 'بيض المائدة يُجرد بفوجه، وهذا يأتي مع الأفواج في المرحلة 4.');
  end if;
  if i.base_unit = 'pc' and (p_line.counted_qty <> trunc(p_line.counted_qty) or coalesce(p_line.counted_expired_qty, 0) <> trunc(coalesce(p_line.counted_expired_qty, 0))) then
    return jsonb_build_object('code', 'pieces_not_whole', 'hint', format('«%s» تُعدّ بالقطعة، والكمية عدد صحيح.', i.name));
  end if;
  if not i.tracks_expiry and (coalesce(p_line.counted_expired_qty, 0) <> 0 or p_line.gain_expiry_on is not null or p_line.gain_expired_expiry_on is not null) then
    return jsonb_build_object('code', 'expiry_not_tracked', 'hint', format('«%s» لا تتابع تاريخ الانتهاء؛ احذف الكمية المنتهية وتواريخ الانتهاء من سطرها.', i.name));
  end if;
  if i.kind <> 'chick' and p_line.gain_born_at is not null then
    return jsonb_build_object('code', 'born_at_not_chick', 'hint', format('«%s» ليست أفراخاً، فلا وقت فقس لها؛ احذف وقت الفقس.', i.name));
  end if;
  if p_line.gain_born_at > now() then
    return jsonb_build_object('code', 'born_at_future', 'hint', format('وقت فقس «%s» بعد الآن؛ اكتب وقتاً مضى.', i.name));
  end if;
  return null;
end
$$;

-- مشكلة الزيادة بالفرق (E41، E42): الصالحة لمادّة تتابع الانتهاء بتاريخ انتهاء اليوم أو بعده، والمنتهية بتاريخ قبله، والأفراخ بوقت فقس.
create or replace function private.count_gain_problem(p_date date, p_line public.stock_count_lines, p_diff numeric, p_expired_diff numeric) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  i public.items;
begin
  select * into i from public.items where org_id = public.auth_org() and id = p_line.item_id;
  if coalesce(p_diff, 0) > 0 and i.tracks_expiry and p_line.gain_expiry_on is null then
    return jsonb_build_object('code', 'expiry_required', 'hint', format('العدد الصالح من «%s» أكثر من الدفتر؛ اكتب تاريخ انتهاء الزيادة.', i.name));
  end if;
  if coalesce(p_diff, 0) > 0 and p_line.gain_expiry_on < p_date then
    return jsonb_build_object('code', 'gain_expiry_mismatch', 'hint', format('تاريخ انتهاء زيادة «%s» الصالحة قبل يوم الجرد؛ المنتهي يُكتب في «منتهي».', i.name));
  end if;
  if coalesce(p_expired_diff, 0) > 0 and p_line.gain_expired_expiry_on is null then
    return jsonb_build_object('code', 'expiry_required', 'hint', format('العدد المنتهي من «%s» أكثر من الدفتر؛ اكتب تاريخ انتهاء الزيادة المنتهية.', i.name));
  end if;
  if coalesce(p_expired_diff, 0) > 0 and p_line.gain_expired_expiry_on >= p_date then
    return jsonb_build_object('code', 'gain_expiry_mismatch', 'hint', format('تاريخ انتهاء زيادة «%s» المنتهية ليس قبل يوم الجرد؛ الصالح يُكتب في «صالح».', i.name));
  end if;
  if (coalesce(p_diff, 0) > 0 or coalesce(p_expired_diff, 0) > 0) and i.kind = 'chick' and p_line.gain_born_at is null then
    return jsonb_build_object('code', 'born_at_required', 'hint', format('العدد من «%s» أكثر من الدفتر؛ اكتب وقت فقس الزيادة.', i.name));
  end if;
  return null;
end
$$;

-- لقطة رصيد سطر بتاريخ الجرد (E25، E41): المتاح، والمنتهي للمادّة اللي تتابع الانتهاء (وإلا فارغ)، والفرقان بالمعدود.
create or replace function private.count_snapshot(p_wh uuid, p_date date, p_line public.stock_count_lines,
  out system_qty numeric, out system_expired_qty numeric, out diff numeric, out expired_diff numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_tracks boolean;
  s record;
begin
  select i.tracks_expiry into v_tracks from public.items i where i.org_id = public.auth_org() and i.id = p_line.item_id;
  select * into s from private.stock_at(p_line.item_id, p_wh, p_date);
  system_qty := s.available;
  diff := p_line.counted_qty - s.available;
  if coalesce(v_tracks, false) then
    system_expired_qty := s.expired;
    expired_diff := coalesce(p_line.counted_expired_qty, 0) - s.expired;
  end if;
end
$$;

-- حالة الجرد لدوالّ المراجعة (E53): المسلَّم بس. المرحَّل والملغى not_draft مثل كل مستند (موافقة ثانية أو نافذة متأخّرة)، والمسوّدة
-- not_submitted.
create or replace function private.require_submitted(p_status text) returns void
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
begin
  if p_status in ('approved', 'void') then
    raise exception 'not_draft' using hint = 'هذا الجرد رُحّل أو أُلغي من قبل.';
  end if;
  if p_status is distinct from 'submitted' then
    raise exception 'not_submitted' using hint = 'هذا الجرد ما زال مسوّدة لم تُسلَّم للمراجعة.';
  end if;
end
$$;

-- التسليم (count.enter، E25، E53): لكل سطر لقطة الرصيد بتاريخ الجرد والفرقان، والمسوّدة ← submitted. النتيجة بلا كميات الدفتر (عدّ
-- أعمى). الأقفال: المرجع ← قفل الفترة وصفّ الوحدة (التاريخ) ← المستند.
create or replace function public.submit_count(p_id uuid, p_expected_version int, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'submit_count';
  v_cached jsonb;
  d public.stock_counts;
  w public.warehouses;
  ln public.stock_count_lines;
  s record;
  v_date date;
begin
  set local lock_timeout = '5s';
  perform private.require('count.enter');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'version', p_expected_version));
  if v_cached is not null then
    return v_cached;
  end if;
  select * into d from public.stock_counts where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا الجرد غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(d.warehouse_id, true);
  v_date := d.counted_on;
  perform private.check_post_date(v_date, w.division_id);
  select * into d from public.stock_counts where org_id = w.org_id and id = p_id for update;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'هذا الجرد ليس مسوّدة: سُلّم أو رُحّل أو أُلغي من قبل.';
  end if;
  if p_expected_version is null or d.version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّر الجرد بعد فتحه. حدّث الشاشة وأعد المحاولة.';
  end if;
  if d.counted_on is distinct from v_date then
    raise exception 'stale_draft' using hint = 'تغيّر تاريخ الجرد أثناء التسليم. حدّث الشاشة وأعد المحاولة.';
  end if;
  if not exists (select 1 from public.stock_count_lines x where x.org_id = d.org_id and x.doc_id = d.id) then
    raise exception 'doc_empty' using hint = 'الجرد بلا سطور. عُدّ مادّة واحدة على الأقلّ.';
  end if;
  for ln in select * from public.stock_count_lines x where x.org_id = d.org_id and x.doc_id = d.id order by x.line_no loop
    perform private.raise_problem(private.count_line_problem(w, ln));
    select * into s from private.count_snapshot(w.id, d.counted_on, ln);
    perform private.raise_problem(private.count_gain_problem(d.counted_on, ln, s.diff, s.expired_diff));
    update public.stock_count_lines set system_qty = s.system_qty, system_expired_qty = s.system_expired_qty, diff = s.diff, expired_diff = s.expired_diff
    where org_id = ln.org_id and id = ln.id;
  end loop;
  update public.stock_counts set status = 'submitted', submitted_at = now(), submitted_by = auth.uid(), snapshot_at = now(), version = version + 1
  where org_id = d.org_id and id = d.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'kind', 'count', 'status', 'submitted', 'version', d.version + 1));
end
$$;

-- إعادة الحساب (count.approve، E53): لقطة جديدة لكل سطر، وترجّع الفرق القديم والجديد والمستندات اللي ترحّلت على المادّة بالمخزن من
-- آخر لقطة (كميات بس)، والنسخة تزيد. «ينعاد حساب الفرق وينعرض» (FOUNDATION ٥٥٥) بنداء مثبَّت، لأن count_stale يرجّع.
create or replace function public.refresh_count(p_id uuid, p_expected_version int, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'refresh_count';
  v_cached jsonb;
  d public.stock_counts;
  w public.warehouses;
  ln public.stock_count_lines;
  i public.items;
  s record;
  v_docs jsonb;
  v_lines jsonb := '[]'::jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('count.approve');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'version', p_expected_version));
  if v_cached is not null then
    return v_cached;
  end if;
  select * into d from public.stock_counts where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا الجرد غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(d.warehouse_id, true);
  select * into d from public.stock_counts where org_id = w.org_id and id = p_id for update;
  perform private.require_submitted(d.status);
  if p_expected_version is null or d.version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّر الجرد بعد فتحه. حدّث الشاشة وأعد المحاولة.';
  end if;
  for ln in select * from public.stock_count_lines x where x.org_id = d.org_id and x.doc_id = d.id order by x.line_no loop
    select * into i from public.items where org_id = d.org_id and id = ln.item_id;
    select * into s from private.count_snapshot(w.id, d.counted_on, ln);
    select coalesce(jsonb_agg(jsonb_build_object('doc_kind', g.doc_kind, 'doc_id', g.doc_id, 'label', private.stock_doc_label(g.doc_kind, g.doc_id),
        'qty', g.qty::text) order by g.first_at), '[]'::jsonb)
    into v_docs
    from (
      select m.doc_kind, m.doc_id, sum(m.qty) as qty, min(m.created_at) as first_at from public.stock_moves m
      where m.org_id = d.org_id and m.item_id = ln.item_id and m.warehouse_id = w.id and m.created_at > d.snapshot_at
      group by m.doc_kind, m.doc_id
    ) as g;
    update public.stock_count_lines set system_qty = s.system_qty, system_expired_qty = s.system_expired_qty, diff = s.diff, expired_diff = s.expired_diff
    where org_id = ln.org_id and id = ln.id;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('line_id', ln.id, 'item_id', ln.item_id, 'item_name', i.name, 'base_unit', i.base_unit,
      'old', jsonb_build_object('system_qty', ln.system_qty::text, 'system_expired_qty', ln.system_expired_qty::text, 'diff', ln.diff::text,
        'expired_diff', ln.expired_diff::text),
      'new', jsonb_build_object('system_qty', s.system_qty::text, 'system_expired_qty', s.system_expired_qty::text, 'diff', s.diff::text,
        'expired_diff', s.expired_diff::text),
      'docs', v_docs));
  end loop;
  update public.stock_counts set snapshot_at = now(), version = version + 1 where org_id = d.org_id and id = d.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'kind', 'count', 'status', 'submitted', 'version', d.version + 1,
    'lines', v_lines));
end
$$;

-- «أعِد للعدّ» (count.approve، E53): المسلَّم ← مسوّدة بسببه، واللقطة تنمسح، والمراجعة (الأسباب والكلف) تبقى.
create or replace function public.return_count(p_id uuid, p_expected_version int, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'return_count';
  v_cached jsonb;
  v_reason text;
  d public.stock_counts;
  w public.warehouses;
begin
  set local lock_timeout = '5s';
  perform private.require('count.approve');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'version', p_expected_version, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into d from public.stock_counts where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا الجرد غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(d.warehouse_id, true);
  select * into d from public.stock_counts where org_id = w.org_id and id = p_id for update;
  perform private.require_submitted(d.status);
  if p_expected_version is null or d.version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّر الجرد بعد فتحه. حدّث الشاشة وأعد المحاولة.';
  end if;
  update public.stock_count_lines set system_qty = null, system_expired_qty = null, diff = null, expired_diff = null
  where org_id = d.org_id and doc_id = d.id;
  update public.stock_counts set status = 'draft', submitted_at = null, submitted_by = null, snapshot_at = null, returned_at = now(),
    returned_by = auth.uid(), return_reason = v_reason, version = version + 1
  where org_id = d.org_id and id = d.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'kind', 'count', 'status', 'draft', 'version', d.version + 1));
end
$$;

-- الترحيل (count.approve، الموافقة = الترحيل): الرصيد ما تغيّر من آخر لقطة (count_stale يسمّي المواد وكمياتها)، وكل سطر بفرق بسببه.
-- النقص يسحب بالترتيب من المتاح (والمنتهي من المنتهي بس، E41) بحركات count و«فرق جرد» واحد بالمستند = مجموع قيم النقص؛ والزيادة
-- دفعة جديدة (count_gain، رقم ترتيب جديد E4) بقيمة القاعدة 17 من دفعة القياس (E45) أو كلفة المدير (E48) وبلا مصروف (E11)؛ وقيمتا كل
-- سطر بكلفته (E55)؛ ورقم CT. p_expected_plan بصمة المعاينة: قطع أو قيم غيرها ← stale_preview.
create or replace function public.post_count(p_id uuid, p_expected_version int, p_expected_plan text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'post_count';
  v_cached jsonb;
  d public.stock_counts;
  w public.warehouses;
  ln public.stock_count_lines;
  i public.items;
  s record;
  ref public.stock_lots;
  l public.stock_lots;
  dr record;
  v_items uuid[];
  v_date date;
  v_stale text[] := '{}';
  v_cost numeric;
  v_val numeric;
  v_short numeric;
  v_gain numeric;
  v_short_total numeric := 0;
  v_gain_total numeric := 0;
  v_pieces text;
  v_plan text := '';
  v_draws jsonb;
  v_gains jsonb;
  v_lines jsonb := '[]'::jsonb;
  c public.expense_categories;
  e public.expenses;
  v_no text;
begin
  set local lock_timeout = '5s';
  perform private.require('count.approve');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'version', p_expected_version, 'plan', p_expected_plan));
  if v_cached is not null then
    return v_cached;
  end if;
  select * into d from public.stock_counts where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا الجرد غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(d.warehouse_id, true);
  v_date := d.counted_on;
  perform private.check_post_date(v_date, w.division_id);
  select * into d from public.stock_counts where org_id = w.org_id and id = p_id for update;
  perform private.require_submitted(d.status);
  if p_expected_version is null or d.version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّر الجرد بعد المعاينة. راجعه وعاينه من جديد قبل الترحيل.';
  end if;
  if d.counted_on is distinct from v_date then
    raise exception 'stale_draft' using hint = 'تغيّر تاريخ الجرد أثناء الترحيل. راجعه وعاينه من جديد.';
  end if;
  select array_agg(distinct x.item_id) into v_items from public.stock_count_lines x where x.org_id = d.org_id and x.doc_id = d.id;
  if v_items is null then
    raise exception 'doc_empty' using hint = 'الجرد بلا سطور.';
  end if;
  perform private.lock_masters(array[w.id], v_items, true);
  perform private.lock_balances(v_items, array_fill(w.id, array[cardinality(v_items)]));
  -- الرصيد تغيّر من آخر لقطة (مستند ترحّل بعد العدّ، C11): الفرق المحسوب ما عاد صحيحاً.
  for ln in select * from public.stock_count_lines x where x.org_id = d.org_id and x.doc_id = d.id order by x.line_no loop
    select * into i from public.items where org_id = d.org_id and id = ln.item_id;
    select * into s from private.count_snapshot(w.id, d.counted_on, ln);
    if s.system_qty is distinct from ln.system_qty or s.system_expired_qty is distinct from ln.system_expired_qty then
      v_stale := v_stale || format('«%s» كان %s وصار %s', i.name, private.qty_text(ln.system_qty + coalesce(ln.system_expired_qty, 0), i.base_unit),
        private.qty_text(s.system_qty + coalesce(s.system_expired_qty, 0), i.base_unit));
    end if;
  end loop;
  if cardinality(v_stale) > 0 then
    raise exception 'count_stale' using hint = format('تغيّر الرصيد بعد العدّ: %s. اضغط «أعد الحساب» لترى الفرق الجديد قبل الترحيل.', array_to_string(v_stale, '، '));
  end if;
  for ln in select * from public.stock_count_lines x where x.org_id = d.org_id and x.doc_id = d.id order by x.line_no loop
    select * into i from public.items where org_id = d.org_id and id = ln.item_id;
    perform private.raise_problem(private.count_line_problem(w, ln));
    perform private.raise_problem(private.count_gain_problem(d.counted_on, ln, ln.diff, ln.expired_diff));
    if (ln.diff <> 0 or coalesce(ln.expired_diff, 0) <> 0) and ln.reason is null then
      raise exception 'reason_required' using hint = format('اكتب سبب فرق «%s» قبل الترحيل.', i.name);
    end if;
  end loop;
  for ln in select * from public.stock_count_lines x where x.org_id = d.org_id and x.doc_id = d.id order by x.line_no loop
    select * into i from public.items where org_id = d.org_id and id = ln.item_id;
    v_short := 0;
    v_gain := 0;
    v_pieces := '';
    v_draws := '[]'::jsonb;
    v_gains := '[]'::jsonb;
    if ln.diff < 0 then
      v_pieces := v_pieces || 'S:';
      for dr in select * from private.draw(ln.item_id, w.id, -ln.diff, d.counted_on, null, false) loop
        v_pieces := v_pieces || private.plan_piece(dr.lot_id, dr.qty, dr.value) || ';';
        perform private.apply_move(dr.lot_id, 'count', d.id, ln.id, -dr.qty, -dr.value, d.counted_on, null, coalesce(i.tracks_expiry, false));
        v_short := v_short + dr.value;
        v_draws := v_draws || jsonb_build_array(jsonb_build_object('lot_id', dr.lot_id, 'qty', dr.qty::text, 'expired', false,
          'money', jsonb_build_object('value', dr.value::text)));
      end loop;
    end if;
    if coalesce(ln.expired_diff, 0) < 0 then
      v_pieces := v_pieces || 'X:';
      for dr in select * from private.draw_expired(ln.item_id, w.id, -ln.expired_diff, d.counted_on) loop
        v_pieces := v_pieces || private.plan_piece(dr.lot_id, dr.qty, dr.value) || ';';
        perform private.apply_move(dr.lot_id, 'count', d.id, ln.id, -dr.qty, -dr.value, d.counted_on, null, false);
        v_short := v_short + dr.value;
        v_draws := v_draws || jsonb_build_array(jsonb_build_object('lot_id', dr.lot_id, 'qty', dr.qty::text, 'expired', true,
          'money', jsonb_build_object('value', dr.value::text)));
      end loop;
    end if;
    if ln.diff > 0 or coalesce(ln.expired_diff, 0) > 0 then
      ref := private.gain_reference_lot(ln.item_id);
      select x.gain_unit_cost into v_cost from public.stock_count_line_costs x where x.org_id = d.org_id and x.line_id = ln.id;
      if ref.id is null and v_cost is null then
        raise exception 'gain_cost_required' using hint = format('لا دفعة سابقة لـ«%s» تُقيَّم بها الزيادة؛ اكتب كلفة الوحدة وسبب الفرق.', i.name);
      end if;
      if ln.diff > 0 then
        v_val := private.gain_value(ln.diff, ref, v_cost);
        l := private.new_lot(ln.item_id, w.id, d.counted_on, ln.gain_expiry_on, case when i.kind = 'chick' then ln.gain_born_at end,
          ln.diff, v_val, 'count_gain', d.id, ln.id);
        perform private.apply_move(l.id, 'count', d.id, ln.id, ln.diff, v_val, d.counted_on, null);
        v_gain := v_gain + v_val;
        v_pieces := v_pieces || 'G:' || round(ln.diff, 3)::text || ':' || round(v_val, 2)::text || ';';
        v_gains := v_gains || jsonb_build_array(jsonb_build_object('lot_id', l.id, 'qty', ln.diff::text, 'expired', false,
          'money', jsonb_build_object('value', v_val::text)));
      end if;
      if coalesce(ln.expired_diff, 0) > 0 then
        v_val := private.gain_value(ln.expired_diff, ref, v_cost);
        l := private.new_lot(ln.item_id, w.id, d.counted_on, ln.gain_expired_expiry_on, case when i.kind = 'chick' then ln.gain_born_at end,
          ln.expired_diff, v_val, 'count_gain', d.id, ln.id);
        perform private.apply_move(l.id, 'count', d.id, ln.id, ln.expired_diff, v_val, d.counted_on, null);
        v_gain := v_gain + v_val;
        v_pieces := v_pieces || 'E:' || round(ln.expired_diff, 3)::text || ':' || round(v_val, 2)::text || ';';
        v_gains := v_gains || jsonb_build_array(jsonb_build_object('lot_id', l.id, 'qty', ln.expired_diff::text, 'expired', true,
          'money', jsonb_build_object('value', v_val::text)));
      end if;
    end if;
    insert into public.stock_count_line_costs (org_id, line_id, doc_id, warehouse_id, gain_value, shortage_value)
    values (d.org_id, ln.id, d.id, w.id, v_gain, v_short)
    on conflict (org_id, line_id) do update set gain_value = excluded.gain_value, shortage_value = excluded.shortage_value;
    v_short_total := v_short_total + v_short;
    v_gain_total := v_gain_total + v_gain;
    v_plan := v_plan || ln.id::text || '|' || v_pieces || '/';
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('line_id', ln.id, 'item_id', ln.item_id, 'diff', ln.diff::text,
      'expired_diff', ln.expired_diff::text, 'draws', v_draws, 'gains', v_gains,
      'money', jsonb_build_object('gain_value', v_gain::text, 'shortage_value', v_short::text)));
  end loop;
  if p_expected_plan is null or private.plan_token(v_plan) is distinct from p_expected_plan then
    raise exception 'stale_preview' using hint = 'تغيّر المخزون أو كلفة القياس بعد المعاينة فتغيّرت الدفعات أو القيم. عاين الجرد من جديد ووافق عليه قبل الترحيل.';
  end if;
  if v_short_total > 0 then
    select * into c from public.expense_categories where org_id = d.org_id and system_code = 'count_diff';
    e := private.write_stock_expense(c.id, w.division_id, v_short_total, d.counted_on, 'count', d.id);
  end if;
  v_no := private.next_doc_no('CT', d.counted_on);
  update public.stock_counts set status = 'approved', doc_no = v_no, client_ref = p_client_ref, posted_at = now(), posted_by = auth.uid()
  where org_id = d.org_id and id = d.id;
  perform private.mark_division_posted(w.division_id);
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'kind', 'count', 'status', 'approved', 'doc_no', v_no,
    'warehouse_id', w.id, 'counted_on', d.counted_on, 'expense_id', e.id, 'lines', v_lines,
    'money', jsonb_build_object('gain_total', v_gain_total::text, 'shortage_total', v_short_total::text)));
end
$$;

-- الإلغاء (void): كل حركة أصلية للجرد تنعكس بيوم الإلغاء؛ دفعة زيادة انسحب منها ← lot_consumed يسمّي المستند؛ و«فرق جرد» بصفّ عكسي.
create or replace function public.void_count(p_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_count';
  v_cached jsonb;
  v_reason text;
  d public.stock_counts;
  w public.warehouses;
  v_items uuid[];
  e public.expenses;
  r public.expenses;
  l public.stock_lots;
  m public.stock_moves;
  v_back int := 0;
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into d from public.stock_counts where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا الجرد غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(d.warehouse_id, true);
  perform private.check_void_date();
  select * into d from public.stock_counts where org_id = w.org_id and id = p_id for update;
  if d.status = 'void' then
    raise exception 'already_void' using hint = 'هذا الجرد ملغى من قبل.';
  end if;
  if d.status <> 'approved' then
    raise exception 'not_posted' using hint = 'هذا الجرد لم يُرحَّل؛ يُغلق دون ترحيل بدل إلغائه.';
  end if;
  select * into e from public.expenses x
  where x.org_id = d.org_id and x.doc_kind = 'count' and x.doc_id = d.id and x.reverses_id is null
  for update;
  select array_agg(distinct x.item_id) into v_items from public.stock_count_lines x where x.org_id = d.org_id and x.doc_id = d.id;
  perform private.lock_masters(array[w.id], v_items, false);
  perform private.lock_balances(v_items, array_fill(w.id, array[cardinality(v_items)]));
  for l in select * from public.stock_lots x where x.org_id = d.org_id and x.source_kind = 'count_gain' and x.source_id = d.id order by x.id for no key update loop
    perform private.check_lot_intact(l.id);
  end loop;
  for m in
    select x.* from public.stock_moves x
    where x.org_id = d.org_id and x.doc_kind = 'count' and x.doc_id = d.id and x.reverses_move_id is null
    order by x.item_id, x.seq
  loop
    perform private.apply_move(m.lot_id, 'count', d.id, m.doc_line_id, -m.qty, -m.value, public.app_today(), m.id);
    v_back := v_back + 1;
  end loop;
  if e.id is not null then
    r := private.reverse_stock_expense(e.id, v_reason);
  end if;
  update public.stock_counts set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
  where org_id = d.org_id and id = d.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'kind', 'count', 'status', 'void', 'doc_no', d.doc_no,
    'reversed_moves', v_back, 'expense_reversal_id', r.id));
end
$$;

-- المعاينة (count.approve): لكل سطر الرصيد باللقطة والآن (وتغيّره)، والمعدود والفرقان، وقطع النقص (المتاح والمنتهي)، وقيمة الزيادة
-- ومصدرها (دفعة القياس أو كلفة المدير)، ومشكلته؛ وبصمة الخطّة بنفس شكل الترحيل؛ بلا كتابة ولا قفل. المال داخل money.
create or replace function public.preview_count(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d public.stock_counts;
  w public.warehouses;
  ln public.stock_count_lines;
  i public.items;
  s record;
  ref public.stock_lots;
  v_cost numeric;
  v_problems jsonb := '[]'::jsonb;
  v_date jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_problem jsonb;
  v_ready boolean := true;
  v_stale boolean := false;
  v_line_stale boolean;
  v_short_draws jsonb;
  v_exp_draws jsonb;
  v_short_qty numeric;
  v_exp_qty numeric;
  v_short_val numeric;
  v_exp_val numeric;
  v_short_text text;
  v_exp_text text;
  v_gain numeric;
  v_xgain numeric;
  v_pieces text;
  v_plan text := '';
  v_short_total numeric := 0;
  v_gain_total numeric := 0;
begin
  perform private.require('count.approve');
  select * into d from public.stock_counts where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا الجرد غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(d.warehouse_id, true);
  if d.status in ('approved', 'void') then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'not_draft', 'hint', 'هذا الجرد رُحّل أو أُلغي من قبل.'));
  elsif d.status <> 'submitted' then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'not_submitted', 'hint', 'هذا الجرد ما زال مسوّدة لم تُسلَّم للمراجعة.'));
  end if;
  v_date := private.date_problem(d.counted_on, w.division_id, false);
  if v_date is not null then
    v_problems := v_problems || jsonb_build_array(v_date);
  end if;
  if w.archived_at is not null then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'warehouse_archived', 'hint', format('المخزن «%s» مؤرشف.', w.name)));
  end if;
  for ln in select * from public.stock_count_lines x where x.org_id = d.org_id and x.doc_id = d.id order by x.line_no loop
    select * into i from public.items where org_id = d.org_id and id = ln.item_id;
    select * into s from private.count_snapshot(w.id, d.counted_on, ln);
    v_line_stale := ln.system_qty is null or s.system_qty is distinct from ln.system_qty or s.system_expired_qty is distinct from ln.system_expired_qty;
    v_stale := v_stale or v_line_stale;
    select coalesce(jsonb_agg(jsonb_build_object('lot_id', p.lot_id, 'qty', p.qty::text, 'expiry_on', x.expiry_on, 'received_on', x.received_on,
        'money', jsonb_build_object('value', p.value::text)) order by p.n), '[]'::jsonb),
      coalesce(sum(p.qty), 0), coalesce(sum(p.value), 0), coalesce(string_agg(private.plan_piece(p.lot_id, p.qty, p.value) || ';', '' order by p.n), '')
    into v_short_draws, v_short_qty, v_short_val, v_short_text
    from private.draw_plan(ln.item_id, w.id, greatest(-coalesce(ln.diff, 0), 0), d.counted_on, null, false, '{}') with ordinality as p(lot_id, qty, value, n)
    join public.stock_lots x on x.org_id = d.org_id and x.id = p.lot_id;
    select coalesce(jsonb_agg(jsonb_build_object('lot_id', p.lot_id, 'qty', p.qty::text, 'expiry_on', x.expiry_on, 'received_on', x.received_on,
        'money', jsonb_build_object('value', p.value::text)) order by p.n), '[]'::jsonb),
      coalesce(sum(p.qty), 0), coalesce(sum(p.value), 0), coalesce(string_agg(private.plan_piece(p.lot_id, p.qty, p.value) || ';', '' order by p.n), '')
    into v_exp_draws, v_exp_qty, v_exp_val, v_exp_text
    from private.draw_expired_plan(ln.item_id, w.id, greatest(-coalesce(ln.expired_diff, 0), 0), d.counted_on) with ordinality as p(lot_id, qty, value, n)
    join public.stock_lots x on x.org_id = d.org_id and x.id = p.lot_id;
    ref := private.gain_reference_lot(ln.item_id);
    select x.gain_unit_cost into v_cost from public.stock_count_line_costs x where x.org_id = d.org_id and x.line_id = ln.id;
    v_gain := case when coalesce(ln.diff, 0) > 0 then private.gain_value(ln.diff, ref, v_cost) end;
    v_xgain := case when coalesce(ln.expired_diff, 0) > 0 then private.gain_value(ln.expired_diff, ref, v_cost) end;
    v_problem := coalesce(private.count_line_problem(w, ln), private.count_gain_problem(d.counted_on, ln, ln.diff, ln.expired_diff),
      case when (coalesce(ln.diff, 0) <> 0 or coalesce(ln.expired_diff, 0) <> 0) and ln.reason is null then
        jsonb_build_object('code', 'reason_required', 'hint', format('اكتب سبب فرق «%s».', i.name)) end,
      case when (coalesce(ln.diff, 0) > 0 or coalesce(ln.expired_diff, 0) > 0) and ref.id is null and v_cost is null then
        jsonb_build_object('code', 'gain_cost_required', 'hint', format('لا دفعة سابقة لـ«%s» تُقيَّم بها الزيادة؛ اكتب كلفة الوحدة.', i.name)) end,
      case when v_short_qty < greatest(-coalesce(ln.diff, 0), 0) or v_exp_qty < greatest(-coalesce(ln.expired_diff, 0), 0) then
        jsonb_build_object('code', 'insufficient_stock', 'hint', format('رصيد «%s» لا يكفي للنقص؛ أعد الحساب.', i.name)) end,
      case when i.archived_at is not null then jsonb_build_object('code', 'item_archived', 'hint', format('المادّة «%s» مؤرشفة.', i.name)) end);
    v_ready := v_ready and v_problem is null and not v_line_stale;
    -- نفس شكل خطّة الترحيل بالضبط: S: ثم X: لكل نقص، وG: وE: لكل زيادة.
    v_pieces := case when ln.diff < 0 then 'S:' || v_short_text else '' end
      || case when coalesce(ln.expired_diff, 0) < 0 then 'X:' || v_exp_text else '' end
      || case when ln.diff > 0 and v_gain is not null then 'G:' || round(ln.diff, 3)::text || ':' || round(v_gain, 2)::text || ';' else '' end
      || case when coalesce(ln.expired_diff, 0) > 0 and v_xgain is not null then 'E:' || round(ln.expired_diff, 3)::text || ':' || round(v_xgain, 2)::text || ';' else '' end;
    v_plan := v_plan || ln.id::text || '|' || v_pieces || '/';
    v_short_total := v_short_total + v_short_val + v_exp_val;
    v_gain_total := v_gain_total + coalesce(v_gain, 0) + coalesce(v_xgain, 0);
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('line_id', ln.id, 'line_no', ln.line_no, 'item_id', i.id, 'item_name', i.name,
      'base_unit', i.base_unit, 'tracks_expiry', i.tracks_expiry, 'kind', i.kind,
      'counted_qty', ln.counted_qty::text, 'counted_expired_qty', ln.counted_expired_qty::text,
      'system_qty', ln.system_qty::text, 'system_expired_qty', ln.system_expired_qty::text, 'diff', ln.diff::text, 'expired_diff', ln.expired_diff::text,
      'now_qty', s.system_qty::text, 'now_expired_qty', s.system_expired_qty::text, 'stale', v_line_stale,
      'gain_expiry_on', ln.gain_expiry_on, 'gain_expired_expiry_on', ln.gain_expired_expiry_on, 'gain_born_at', ln.gain_born_at, 'reason', ln.reason,
      'gain_source', case when coalesce(ln.diff, 0) > 0 or coalesce(ln.expired_diff, 0) > 0 then case when ref.id is not null then 'lot' when v_cost is not null then 'manual' end end,
      'reference_lot_id', ref.id, 'problem', v_problem, 'draws', v_short_draws, 'expired_draws', v_exp_draws,
      'money', jsonb_build_object('shortage_value', (v_short_val + v_exp_val)::text, 'gain_value', (coalesce(v_gain, 0) + coalesce(v_xgain, 0))::text,
        'gain_unit_cost', v_cost::text, 'reference_value_in', ref.value_in::text, 'reference_qty_in', ref.qty_in::text)));
  end loop;
  return private.mask(jsonb_build_object('id', d.id, 'kind', 'count', 'status', d.status, 'version', d.version, 'doc_no', d.doc_no,
    'warehouse_id', w.id, 'counted_on', d.counted_on, 'submitted_at', d.submitted_at, 'snapshot_at', d.snapshot_at,
    'division_kind', (select x.kind from public.divisions x where x.org_id = w.org_id and x.id = w.division_id),
    'stale', v_stale, 'problems', v_problems, 'lines', v_lines, 'plan', private.plan_token(v_plan),
    'ready', v_ready and jsonb_array_length(v_problems) = 0 and jsonb_array_length(v_lines) > 0,
    'money', jsonb_build_object('shortage_total', v_short_total::text, 'gain_total', v_gain_total::text)));
end
$$;

-- ─── المسوّدات: الطيّ وحذف السطر (§2.5، E13، E52، E53): نفس التوقيع، ويزيد الصرف والجرد ─────────────────────────────
-- الطيّ: المسوّدة void بلا رقم ولا حركات، لمن عنده فعل مسوّدتها وبنطاقها، وبشرط النسخة. والجرد المسلَّم يطويه count.approve
-- («أغلِق دون ترحيل»). الرأس ما ينحذف أبداً.
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
  else
    update public.stock_counts set status = 'void', voided_at = now(), voided_by = auth.uid(), version = version + 1
    where org_id = public.auth_org() and id = p_id;
  end if;
  return jsonb_build_object('id', p_id, 'kind', p_doc_kind, 'status', 'void', 'version', v_version + 1);
end
$$;

-- حذف سطر مسوّدة (E52): تحت قفل السطر ثم رأسه، بفعل مسوّدته ونطاقها وبشرط النسخة، والنسخة تزيد. سطر الجرد يحذف كلفته قبله (المدير
-- كتبها بالمراجعة وانرجع الجرد للعدّ؛ الأمين ما يشوفها، فحذفها المباشر كان يرفض 23503). السطر اللي انحذف من قبل يرجّع deleted: false.
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
  else
    delete from public.stock_count_line_costs where org_id = public.auth_org() and line_id = p_line_id;
    delete from public.stock_count_lines where org_id = public.auth_org() and id = p_line_id;
    update public.stock_counts set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  end if;
  return jsonb_build_object('line_id', p_line_id, 'deleted', true, 'doc_id', v_doc, 'version', v_version + 1);
end
$$;

-- ─── تقرير المصاريف (§2.8، Q14): invoker (سياسات الكلفة والنطاق نفسها) ويّا فحص صريح يرفض forbidden ─────────────────────
-- الصفوف بصفحات (الشهر ثم التاريخ ثم وقت الكتابة ثم المعرّف، تنازلياً) بالأشهر من شهر p_from لحد p_to، والمجاميع لكل تصنيف ومصدر
-- وشهر من هنا (مو من جمع الصفوف المحمّلة). الإلغاء صفّ سالب بشهره، فالمجموع صافٍ. ما تنادي private (invoker ما يوصله).
create or replace function public.report_expenses(p_from date, p_to date, p_division uuid, p_after jsonb, p_limit int) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_to date := coalesce(p_to, public.app_today());
  v_from date;
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_rows jsonb;
  v_count int;
begin
  if not (public.can('accounts.view') and public.can_see_cost()) then
    raise exception 'forbidden' using hint = 'المصاريف للمالك والمدير والمحاسب فقط.';
  end if;
  if p_from is null or p_from > v_to then
    raise exception 'period_required' using hint = 'حدّد المدّة: من تاريخ إلى تاريخ لا يسبقه.';
  end if;
  v_from := date_trunc('month', p_from)::date;
  with page as (
    select e.*, c.name as category_name, c.system_code, a.name as account_name, p.name as party_name, b.code as book_code, s.name as site_name,
      case e.doc_kind
        when 'stock_use' then (select u.doc_no from public.stock_uses u where u.org_id = e.org_id and u.id = e.doc_id)
        when 'count' then (select k.doc_no from public.stock_counts k where k.org_id = e.org_id and k.id = e.doc_id)
      end as doc_no,
      exists (select 1 from public.expenses r where r.org_id = e.org_id and r.reverses_id = e.id) as reversed
    from public.expenses e
    join public.expense_categories c on c.org_id = e.org_id and c.id = e.category_id
    left join public.cash_accounts a on a.org_id = e.org_id and a.id = e.account_id
    left join public.parties p on p.org_id = e.org_id and p.id = e.party_id
    left join public.ledger_books b on b.org_id = e.org_id and b.id = e.book_id
    left join public.sites s on s.org_id = e.org_id and s.id = e.site_id
    where e.org_id = v_org and e.for_month between v_from and v_to and (p_division is null or e.division_id = p_division)
      and (p_after is null or (e.for_month, e.on_date, e.created_at, e.id) < ((p_after ->> 'for_month')::date, (p_after ->> 'on_date')::date,
        (p_after ->> 'created_at')::timestamptz, (p_after ->> 'id')::uuid))
    order by e.for_month desc, e.on_date desc, e.created_at desc, e.id desc
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'on_date', x.on_date, 'for_month', x.for_month, 'category_id', x.category_id,
      'category_name', x.category_name, 'system_code', x.system_code, 'division_id', x.division_id, 'source', x.source, 'account_id', x.account_id,
      'account_name', x.account_name, 'party_id', x.party_id, 'party_name', x.party_name, 'book_id', x.book_id, 'book_code', x.book_code,
      'site_id', x.site_id, 'site_name', x.site_name, 'doc_kind', x.doc_kind, 'doc_id', x.doc_id, 'doc_no', x.doc_no, 'note', x.note,
      'reason', x.reason, 'reverses', x.reverses_id, 'reversed', x.reversed, 'amount', x.amount::text,
      'cursor', jsonb_build_object('for_month', x.for_month, 'on_date', x.on_date, 'created_at', x.created_at, 'id', x.id))
      order by x.for_month desc, x.on_date desc, x.created_at desc, x.id desc), '[]'::jsonb), count(*)
  into v_rows, v_count
  from page as x;
  return jsonb_build_object('from', v_from, 'to', v_to, 'division_id', p_division,
    'rows', coalesce((select jsonb_agg(r - 'cursor' order by n) from jsonb_array_elements(v_rows) with ordinality as a(r, n)), '[]'::jsonb),
    'next', case when v_count = v_limit then v_rows -> (v_count - 1) -> 'cursor' end,
    'totals', (
      with f as (
        select e.* from public.expenses e
        where e.org_id = v_org and e.for_month between v_from and v_to and (p_division is null or e.division_id = p_division)
      )
      select jsonb_build_object(
        'total', coalesce((select sum(amount) from f), 0)::text,
        'count', (select count(*) from f),
        'by_category', coalesce((select jsonb_agg(jsonb_build_object('category_id', g.category_id, 'name', c.name, 'system_code', c.system_code,
            'amount', g.amount::text) order by c.name collate "C", g.category_id)
          from (select category_id, sum(amount) as amount from f group by category_id) as g
          join public.expense_categories c on c.org_id = v_org and c.id = g.category_id), '[]'::jsonb),
        'by_source', coalesce((select jsonb_agg(jsonb_build_object('source', g.source, 'amount', g.amount::text) order by g.source)
          from (select source, sum(amount) as amount from f group by source) as g), '[]'::jsonb),
        'by_month', coalesce((select jsonb_agg(jsonb_build_object('for_month', g.for_month, 'amount', g.amount::text) order by g.for_month)
          from (select for_month, sum(amount) as amount from f group by for_month) as g), '[]'::jsonb))
    ));
end
$$;

-- ─── ملخّص الرئيسية (E38): كما بـ0007 (الحسابات بدفاتر النطاق E49، وتنبيهات المخزون لكل وحدة)، ويزيد «بانتظار موافقة المدير»
-- لمن يوافق: جرود مسلَّمة للمراجعة، ومسوّدات صرف تحتاج المدير (إتلاف أو دفعة منتهية مسمّاة، Q5)، بمخازن نطاقه.
create or replace function public.home_summary() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_out jsonb := '{}'::jsonb;
begin
  -- بلا منشأة ماكو أرقام: ملخّص فارغ (مثل find_item_twins)، مو رفض.
  if v_org is null then
    return v_out;
  end if;
  if public.can_see_accounts() then
    v_out := v_out || jsonb_build_object('accounts', (
      select jsonb_build_object('receivable', coalesce(sum(greatest(x.balance, 0)), 0)::text, 'payable', coalesce(sum(greatest(-x.balance, 0)), 0)::text,
        -- الصناديق بالسالب (Q10: السالب مسموح ويّا تنبيه ظاهر بالبطاقة).
        'negative_boxes', (select count(*) from (
          select m.account_id from public.cash_moves m where m.org_id = v_org group by m.account_id having sum(m.amount) < 0) as n),
        -- القارئ المحصور (E49): «لنا» و«علينا» من دفاتر نطاقه بس، فالبطاقة تكتب «N من المجموع» مثل صفحة الحسابات.
        'books', jsonb_build_object(
          'visible', (select count(*) from public.ledger_books b where b.org_id = v_org and b.archived_at is null and public.in_scope_book(b.id)),
          'total', (select count(*) from public.ledger_books b where b.org_id = v_org and b.archived_at is null)))
      from (
        select sum(e.amount) as balance from public.party_entries e
        where e.org_id = v_org and e.on_date <= v_today and public.in_scope_book(e.book_id)
        group by e.party_id, e.book_id
      ) as x));
  end if;
  v_out := v_out || jsonb_build_object('stock', coalesce((
    select jsonb_agg(jsonb_build_object('division_id', d.id, 'kind', d.kind,
        'below_min', (
          select count(*) from public.items i
          where i.org_id = v_org and i.min_qty is not null and i.archived_at is null
            and exists (select 1 from public.warehouses w where w.org_id = v_org and w.division_id = d.id and w.archived_at is null
              and w.kind = any (private.receiving_kinds(i.kind)) and public.in_scope_wh(w.id))
            and coalesce((
              select sum(x.qty_left) from public.stock_lots x join public.warehouses y on y.org_id = x.org_id and y.id = x.warehouse_id
              where x.org_id = v_org and x.item_id = i.id and x.qty_left > 0 and y.kind = any (private.receiving_kinds(i.kind))
                and not private.lot_expired(i.tracks_expiry, x.expiry_on, v_today)
            ), 0) < i.min_qty),
        'near_expiry', (
          select count(distinct x.item_id) from public.stock_lots x
          join public.warehouses w on w.org_id = x.org_id and w.id = x.warehouse_id
          join public.items i on i.org_id = x.org_id and i.id = x.item_id
          where x.org_id = v_org and w.division_id = d.id and public.in_scope_wh(w.id) and x.qty_left > 0 and i.tracks_expiry
            and x.expiry_on >= v_today and x.expiry_on <= v_today + 30),
        'old_chicks', (
          select coalesce(sum(x.qty_left), 0)::bigint from public.stock_lots x
          join public.warehouses w on w.org_id = x.org_id and w.id = x.warehouse_id
          join public.items i on i.org_id = x.org_id and i.id = x.item_id
          where x.org_id = v_org and w.division_id = d.id and public.in_scope_wh(w.id) and x.qty_left > 0 and i.kind = 'chick'
            and x.born_at is not null and x.born_at <= now() - interval '48 hours'))
      order by d.kind collate "C")
    from public.divisions d
    where d.org_id = v_org and d.archived_at is null
      and exists (select 1 from public.warehouses w where w.org_id = v_org and w.division_id = d.id and public.in_scope_wh(w.id))
  ), '[]'::jsonb));
  if public.can('count.approve') or public.can('expired.release') then
    v_out := v_out || jsonb_build_object('approvals', jsonb_build_object(
      'counts', case when public.can('count.approve') then (
        select count(*) from public.stock_counts c where c.org_id = v_org and c.status = 'submitted' and public.in_scope_wh(c.warehouse_id)) else 0 end,
      'uses', (
        select count(*) from public.stock_uses u
        left join public.expense_categories c on c.org_id = u.org_id and c.id = u.category_id
        where u.org_id = v_org and u.status = 'draft' and public.in_scope_wh(u.warehouse_id)
          and ((c.system_code = 'expired_destroy' and public.can('expired.destroy'))
            or (coalesce(c.system_code, '') <> 'expired_destroy' and public.can('expired.release')
              and exists (select 1 from public.stock_use_lines l where l.org_id = u.org_id and l.doc_id = u.id and l.lot_id is not null))))));
  end if;
  return v_out;
end
$$;

-- ─── الثوابت (FOUNDATION ٤٢٩–٤٣٠، الخطّة WP5): verify_stock كما بـ0007 ويزيد الصرف والجرد: أطراف الحفظ (8)، وترتيب سحبهما (10)،
-- والمستند = حركاته (11)، والرابطان 12 و13 (الخطّة: «every stock-use expense = Σ its moves' value»، ونقص الجرد وزيادته = لقطتهما) ──
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
        where c.org_id = o.id and k.status = 'approved'), 0) as inputs,
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
  --     الأصلية على دفعة زيادة سطرها.
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
    cross join lateral (
      select coalesce(sum(-x.qty) filter (where x.qty < 0), 0) as drawn, count(*) as pieces,
        count(*) filter (where exists (select 1 from public.stock_moves r where r.org_id = x.org_id and r.reverses_move_id = x.id)) as reversed
      from public.stock_moves x
      where x.org_id = cl.org_id and x.doc_kind = 'count' and x.doc_id = cl.doc_id and x.doc_line_id = cl.id and x.reverses_move_id is null
    ) as s
    cross join lateral (
      select count(*) as n, coalesce(sum(l.qty_in), 0) as qty
      from public.stock_lots l
      where l.org_id = cl.org_id and l.source_kind = 'count_gain' and l.source_id = cl.doc_id and l.source_line_id = cl.id
    ) as g
    where (k.posted_at is not null and (cl.diff is null
        or s.drawn <> greatest(-cl.diff, 0) + greatest(-coalesce(cl.expired_diff, 0), 0)
        or g.qty <> greatest(cl.diff, 0) + greatest(coalesce(cl.expired_diff, 0), 0)
        or g.n <> (cl.diff > 0)::int + (coalesce(cl.expired_diff, 0) > 0)::int))
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
$$;

-- ─── verify_ledger كما بـ0007 ويزيد المصاريف (الخطّة WP5: «the CHECK per source, and every cash or credit expense has its cash
-- move or bill entry»، الفحص 14 والفحص 8) ومصدر أرقام SU وCT (الفحص 11)؛ نفس التوقيع ────────────────────────────────────────
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
  --    وبمستند expense؛ دفعة الاستلام ونقله مصادرها بـWP6، فحركة بيها بلا مصدر مخالفة لحد ما تنضاف؛ والافتتاح بلا مستند.
  select 'cash_move_sources', count(*) from public.cash_moves m
  left join public.party_entries e on e.org_id = m.org_id and e.id = m.party_entry_id
  where (m.kind = 'party_payment' and (e.id is null or e.kind <> 'payment' or m.amount <> -e.amount))
    or (m.kind = 'party_payout' and (e.id is null or e.kind <> 'payout' or e.doc_kind is not null or m.amount <> -e.amount))
    or m.kind in ('receipt_paid', 'receipt_charge')
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
      ) as n
      group by n.org_id, n.kind, n.year
    ) as g
    full join (select * from public.doc_counters where kind in ('RC', 'PY', 'TR', 'SU', 'CT')) as c on c.org_id = g.org_id and c.kind = g.kind and c.year = g.year
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

grant execute on function public.verify_ledger() to service_role;


-- ─── قائمة السماح (نسختها بـsupabase/tests/allowlist.json) ─────────────────────────────────────────────────────
grant execute on function
  public.record_expense(uuid, uuid, uuid, numeric, date, text, uuid, uuid, uuid, uuid, uuid, uuid, text, date, uuid),
  public.void_expense(uuid, text, uuid),
  public.post_stock_use(uuid, integer, text, uuid),
  public.void_stock_use(uuid, text, uuid),
  public.preview_stock_use(uuid),
  public.submit_count(uuid, integer, uuid),
  public.refresh_count(uuid, integer, uuid),
  public.return_count(uuid, integer, text, uuid),
  public.post_count(uuid, integer, text, uuid),
  public.void_count(uuid, text, uuid),
  public.preview_count(uuid),
  public.report_expenses(date, date, uuid, jsonb, integer)
to authenticated;

grant execute on function public.verify_stock() to service_role;
