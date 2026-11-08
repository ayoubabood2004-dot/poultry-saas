-- 0021_sales — البيع: فاتورة بيع مادّة من المخزن لجهة بنداء واحد تُحفظ فوراً
--   (كلمة المالك 2026-11-08: «ماكو زر يوديني للمبيعات حتى ابيع هاي المادة… واكدر اسجل مبيعاتي لمنو وتطلعلي هاي السوالف بالتقارير»؛ وأجوبته:
--   أيّ مادّة في المخزن، والدفع يُختار كلّ مرّة (بالدين افتراضياً)، وسعر البيع مقترح من الحاليّ ويُعدَّل؛ DECISIONS «حذف المادّة، والرجوع، والسعر
--   الاختياريّ، والتحويل، والبيع» و«قيد البيع بنوع invoice، وإلغاء البيع النقديّ يُبقي المقبوض رصيداً للزبون»؛ FOUNDATION ٤٣٠، ٤٩٥، ٥٨٣).
-- المشكلة: لا طريق لبيع مادّة من المخزن ولا لتسجيل «لمنو» ولا تقرير به.
-- هنا:
--   • sales_invoices (رأس الفاتورة: الجهة والمخزن والدفتر والتاريخ والدفع والقيود) وsales_lines (المادّة وكميتها بوحدة أساسها وسعر الوحدة والمبلغ
--     بالدينار الصحيح) بسياسة المبيعات (can_see_sales) ونطاق المخزن، وsales_line_costs (كلفة السطر = قيمة السحب بالضبط) بسياسة الكلفة؛ الكتابة
--     للدوالّ وحدها.
--   • public.record_sale (sale.record، أدوار purchase.record نفسها): سحب بترتيب السحب (القواعد ١٢–١٤) بحركات sale، وقيد invoice للجهة +المبلغ في
--     دفتر وحدة المخزن، والنقد قيد payment −المبلغ يتوزّع على الفاتورة أوّلاً وحركة صندوق party_payment +المبلغ بمستند البيع؛ والرقم بنوع المخزن
--     (العلف FD، والأدوية MD، والباقي MS). السعر صفر «تسليم بلا مقابل» (الشاشة تؤكّده): بلا قيد، والكلفة تخرج بقيمتها.
--   • public.void_sale (void): الحركات تنعكس على دفعاتها بيوم الإلغاء، وقيد الفاتورة يُلغى؛ وقيد القبض وحركة صندوقه يبقيان رصيداً للزبون (يُردّ
--     من «ألغِ القبض» القائمة)، والنتيجة تقول payment_kept.
--   • القرّاء: sales_overview (الفترة: الصفوف والمجاميع)، وsale_detail، وsales_report (بالجهة أو المادّة أو اليوم)؛ المبلغ والجهة لأدوار المبيعات،
--     والكلفة والربح داخل cost.money لأدوار الكلفة وحدها.
--   • الثوابت: verify_sales (الحركات والكلفة، والقيود والصندوق، والرقم، والشكل)، وverify_stock (حفظ القيمة: كلفة البيع المرحَّل خارجة، وترتيب
--     سحب البيع).
-- انحرافات مكتوبة (قرارات بلا سؤال داخل الخطوط الحمر، والعقد scratchpad/simple/contract-0020.md وأجوبة المنسّق):
--   • قيد البيع بنوع invoice القائم (لا نوع جديد)، والقبض النقديّ payment وحركة party_payment القائمان بمستند sale (فـ«ألغِ القبض» يعمل عليهما).
--   • البيض والأفراخ لا تُباع هنا (not_sellable): بيعها مع الطيور في النسخة القادمة. والسعر صفر لا يُقبض نقداً (price_required_for_cash)، وسعر
--     موجب مجموعه يُقرَّب إلى صفر دينار يُرفض (total_zero).
--   • المخزن إن لم يُختر: الوحيد بالنطاق الذي فيه منها متاح بتاريخ البيع (مثل الصرف والتحويل)، وإلّا store_required أو insufficient_stock.
--   • سطر واحد لكلّ فاتورة في هذه النسخة (النافذة «بِع» لمادّة واحدة)، والجداول تقبل أكثر لاحقاً.
--   • الإعادة بالمعرّف تحت قفل استشاريّ لمعرّف الفاتورة، مثل 0019.
-- تراجع: rollback_0021.sql — يرجّع verify_stock وprivate.stock_doc_memo وprivate.stock_doc_label كما في 0020 حرفاً بحرف، والقيدين كما كانا، ويُسقط
--   الجديد. **طريق رفض**: أيّ فاتورة بيع (ولو ملغاة: حركاتها وقيودها باقية) توقف التراجع بصوت بلا أن تحذف شيئاً.
-- تنعاد بأمان: create table if not exists، وcreate or replace، وكتل do تفحص الكتالوج قبل القيود والسياسات.

set lock_timeout = '5s';

-- ─── أ. القيود: نوع حركة البيع وأرقام فواتيره ───────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'stock_moves_doc_kind_check' and conrelid = 'public.stock_moves'::regclass
    and pg_get_constraintdef(oid) not like '%''sale''%') then
    alter table public.stock_moves drop constraint stock_moves_doc_kind_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_moves_doc_kind_check' and conrelid = 'public.stock_moves'::regclass) then
    alter table public.stock_moves add constraint stock_moves_doc_kind_check
      check (doc_kind in ('opening', 'receipt', 'supplier_return', 'receipt_revalue', 'transfer', 'count', 'stock_use', 'production', 'flock_issue',
        'conversion', 'sale'));
  end if;
  if exists (select 1 from pg_constraint where conname = 'doc_counters_kind_check' and conrelid = 'public.doc_counters'::regclass
    and pg_get_constraintdef(oid) not like '%MS%') then
    alter table public.doc_counters drop constraint doc_counters_kind_check;
    alter table public.doc_counters add constraint doc_counters_kind_check
      check (kind in ('PU', 'RT', 'TR', 'CT', 'SU', 'RC', 'PY', 'OF', 'PD', 'FI', 'CV', 'FD', 'MD', 'MS'));
  end if;
end
$$;

-- ─── ب. الجداول ──────────────────────────────────────────────────────────────────────────────────────────────────
-- رأس الفاتورة: مرحَّل فوراً (posted ← void)، والدفتر دفتر وحدة المخزن، وقيدا الفاتورة والقبض وحركة الصندوق تُكتب معه.
create table if not exists public.sales_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  doc_no text not null,
  party_id uuid not null,
  warehouse_id uuid not null,
  book_id uuid not null,
  sold_on date not null,
  payment text not null,
  cash_account_id uuid,
  invoice_entry_id uuid,
  payment_entry_id uuid,
  cash_move_id uuid,
  status text not null default 'posted',
  version int not null default 1,
  client_ref uuid not null,
  posted_at timestamptz not null default now(),
  posted_by uuid default auth.uid(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint sales_invoices_doc_no_check check (doc_no ~ '^(FD|MD|MS)-[0-9]{4}-[0-9]{4,}$'),
  constraint sales_invoices_payment_check check (payment in ('cash', 'credit') and (payment = 'cash') = (cash_account_id is not null)
    and (payment = 'cash') = (payment_entry_id is not null) and (payment_entry_id is null) = (cash_move_id is null)),
  constraint sales_invoices_status_check check (status in ('posted', 'void')),
  constraint sales_invoices_void_check check ((status = 'void') = (voided_at is not null) and (voided_at is null) = (void_reason is null)),
  constraint sales_invoices_void_reason_check check (void_reason is null or length(btrim(void_reason)) between 1 and 500),
  constraint sales_invoices_version_check check (version >= 1),
  unique (org_id, id),
  unique (org_id, id, warehouse_id),
  unique (org_id, doc_no),
  foreign key (org_id, party_id) references public.parties (org_id, id),
  foreign key (org_id, warehouse_id) references public.warehouses (org_id, id),
  foreign key (org_id, book_id) references public.ledger_books (org_id, id),
  foreign key (org_id, cash_account_id) references public.cash_accounts (org_id, id),
  foreign key (org_id, invoice_entry_id) references public.party_entries (org_id, id),
  foreign key (org_id, payment_entry_id) references public.party_entries (org_id, id),
  foreign key (org_id, cash_move_id) references public.cash_moves (org_id, id)
);
create index if not exists sales_invoices_party on public.sales_invoices (org_id, party_id);
create index if not exists sales_invoices_wh on public.sales_invoices (org_id, warehouse_id);
create index if not exists sales_invoices_book on public.sales_invoices (org_id, book_id);
create index if not exists sales_invoices_box on public.sales_invoices (org_id, cash_account_id);
create index if not exists sales_invoices_invoice_entry on public.sales_invoices (org_id, invoice_entry_id);
create index if not exists sales_invoices_payment_entry on public.sales_invoices (org_id, payment_entry_id);
create index if not exists sales_invoices_cash_move on public.sales_invoices (org_id, cash_move_id);
create index if not exists sales_invoices_sold_on on public.sales_invoices (org_id, sold_on);

-- سطر البيع: الكمية بوحدة أساس المادّة (لقطة الوحدة)، وسعر الوحدة كما كُتب، والمبلغ = الكمية × السعر مقرَّباً لأقرب دينار.
create table if not exists public.sales_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  sale_id uuid not null,
  warehouse_id uuid not null,
  line_no int not null,
  item_id uuid not null,
  qty numeric not null,
  base_unit text not null,
  unit_price numeric not null,
  line_total numeric not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint sales_lines_qty_check check (abs(qty) < 'Infinity' and qty > 0 and qty = round(qty, 3) and (base_unit <> 'pc' or qty = trunc(qty))),
  constraint sales_lines_base_unit_check check (base_unit in ('kg', 'L', 'pc')),
  constraint sales_lines_unit_price_check check (abs(unit_price) < 'Infinity' and unit_price >= 0 and unit_price = round(unit_price, 2)),
  constraint sales_lines_line_total_check check (abs(line_total) < 'Infinity' and line_total >= 0 and line_total = round(line_total, 0)),
  constraint sales_lines_line_no_check check (line_no >= 1),
  unique (org_id, id),
  unique (org_id, sale_id, id),
  unique (org_id, sale_id, line_no),
  foreign key (org_id, sale_id, warehouse_id) references public.sales_invoices (org_id, id, warehouse_id),
  foreign key (org_id, item_id) references public.items (org_id, id)
);
create index if not exists sales_lines_item on public.sales_lines (org_id, item_id);
create index if not exists sales_lines_sale on public.sales_lines (org_id, sale_id, warehouse_id);

-- كلفة السطر (لقطة قيمة السحب بالضبط): لأدوار الكلفة وحدها.
create table if not exists public.sales_line_costs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  sale_id uuid not null,
  line_id uuid not null,
  warehouse_id uuid not null,
  cost numeric not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint sales_line_costs_cost_check check (abs(cost) < 'Infinity' and cost >= 0 and cost = round(cost, 2)),
  unique (org_id, id),
  unique (org_id, line_id),
  foreign key (org_id, sale_id, line_id) references public.sales_lines (org_id, sale_id, id),
  foreign key (org_id, sale_id, warehouse_id) references public.sales_invoices (org_id, id, warehouse_id)
);
create index if not exists sales_line_costs_line on public.sales_line_costs (org_id, sale_id, line_id);
create index if not exists sales_line_costs_sale on public.sales_line_costs (org_id, sale_id, warehouse_id);

alter table public.sales_invoices enable row level security;
alter table public.sales_lines enable row level security;
alter table public.sales_line_costs enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['sales_invoices', 'sales_lines', 'sales_line_costs'] loop
    execute format('create or replace trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()', 'audit_' || t, t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_read') then
      execute format('create policy %I on public.%I for select to authenticated using (org_id = (select public.auth_org()) and (select public.in_scope_wh(warehouse_id)))',
        t || '_read', t);
    end if;
  end loop;
  foreach t in array array['sales_invoices', 'sales_lines'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_sales_only') then
      execute format('create policy %I on public.%I as restrictive for select to authenticated using ((select public.can_see_sales()))', t || '_sales_only', t);
    end if;
  end loop;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sales_line_costs' and policyname = 'sales_line_costs_cost_only') then
    create policy sales_line_costs_cost_only on public.sales_line_costs as restrictive for select to authenticated using ((select public.can_see_cost()));
  end if;
  -- سجلّ التدقيق يحمل الصفّ كلّه (E49): صفوف البيع بمخزنها، مثل سياسة قراءة الجداول نفسها.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'audit_log_sale_scope') then
    create policy audit_log_sale_scope on public.audit_log as restrictive for select to authenticated
      using (case
        when table_name in ('sales_invoices', 'sales_lines', 'sales_line_costs') then public.in_scope_wh((coalesce("new", "old") ->> 'warehouse_id')::uuid)
        else true
      end);
  end if;
end
$$;

revoke all on table public.sales_invoices, public.sales_lines, public.sales_line_costs from anon, authenticated;
grant select on table public.sales_invoices, public.sales_lines, public.sales_line_costs to authenticated;
revoke truncate on table public.sales_invoices, public.sales_lines, public.sales_line_costs from service_role;

-- بيان الحركة (0020 كما هو، ويّا البيع: «بيع إلى الجهة»).
create or replace function private.stock_doc_memo(p_kind text, p_doc uuid, p_warehouse uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case p_kind
    when 'receipt' then coalesce((select format('شراء من %s', t.name) from public.receipts r
      join public.parties t on t.org_id = r.org_id and t.id = r.party_id
      where r.org_id = public.auth_org() and r.id = p_doc), 'شراء')
    when 'supplier_return' then coalesce((select format('مرتجع إلى %s', t.name) from public.supplier_returns s
      join public.parties t on t.org_id = s.org_id and t.id = s.party_id
      where s.org_id = public.auth_org() and s.id = p_doc), 'مرتجع إلى المورّد')
    when 'receipt_revalue' then coalesce((select case when v.unit_price is not null then 'إكمال سعر الشراء' else 'تصحيح سعر الشراء' end
      from public.receipt_revaluations v where v.org_id = public.auth_org() and v.id = p_doc), 'تصحيح سعر الشراء')
    when 'transfer' then coalesce((select case when x.to_warehouse_id = p_warehouse then format('تحويل من %s', f.name) else format('تحويل إلى %s', y.name) end
      from public.transfers x
      join public.warehouses f on f.org_id = x.org_id and f.id = x.from_warehouse_id
      join public.warehouses y on y.org_id = x.org_id and y.id = x.to_warehouse_id
      where x.org_id = public.auth_org() and x.id = p_doc), 'تحويل بين المخازن')
    when 'opening' then 'رصيد بداية'
    when 'count' then 'جرد'
    when 'stock_use' then coalesce((select case when c.name is null then 'صرف' else format('صرف: %s', c.name) end
      from public.stock_uses u left join public.expense_categories c on c.org_id = u.org_id and c.id = u.category_id
      where u.org_id = public.auth_org() and u.id = p_doc), 'صرف')
    when 'production' then coalesce((select case when b.output_warehouse_id = p_warehouse then format('إنتاج خلطة %s', r.name)
        else format('استهلاك في خلطة %s', r.name) end
      from public.production_batches b
      join public.recipe_versions v on v.org_id = b.org_id and v.id = b.recipe_version_id
      join public.recipes r on r.org_id = v.org_id and r.id = v.recipe_id
      where b.org_id = public.auth_org() and b.id = p_doc), 'إنتاج علف')
    when 'flock_issue' then coalesce((select format('صرف إلى %s (%s)', h.name, s.name) from public.flock_issues x
      join public.halls h on h.org_id = x.org_id and h.id = x.hall_id
      join public.sites s on s.org_id = x.org_id and s.id = x.site_id
      where x.org_id = public.auth_org() and x.id = p_doc), 'صرف لفوج')
    when 'conversion' then coalesce((select format('تحويل «%s» إلى «%s»', a.name, b.name) from public.stock_conversions c
      join public.items a on a.org_id = c.org_id and a.id = c.from_item_id
      join public.items b on b.org_id = c.org_id and b.id = c.to_item_id
      where c.org_id = public.auth_org() and c.id = p_doc), 'تحويل مادّة')
    when 'sale' then coalesce((select format('بيع إلى %s', t.name) from public.sales_invoices s
      join public.parties t on t.org_id = s.org_id and t.id = s.party_id
      where s.org_id = public.auth_org() and s.id = p_doc), 'بيع')
    else p_kind
  end
$$;

-- اسم المستند (0020 كما هو، ويّا رقم فاتورة البيع).
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
    when 'receipt_revalue' then coalesce((select format(case when v.unit_price is not null then 'سعر %s' else 'تصحيح سعر %s' end, r.doc_no)
      from public.receipt_revaluations v
      join public.receipts r on r.org_id = v.org_id and r.id = v.receipt_id where v.org_id = public.auth_org() and v.id = p_doc), 'تصحيح سعر')
    when 'production' then coalesce((select coalesce(b.doc_no, format('دفعة إنتاج %s', r.name)) from public.production_batches b
      join public.recipe_versions v on v.org_id = b.org_id and v.id = b.recipe_version_id
      join public.recipes r on r.org_id = v.org_id and r.id = v.recipe_id
      where b.org_id = public.auth_org() and b.id = p_doc), 'دفعة إنتاج')
    when 'flock_issue' then coalesce((select x.doc_no from public.flock_issues x where x.org_id = public.auth_org() and x.id = p_doc), 'صرف لفوج')
    when 'conversion' then coalesce((select c.doc_no from public.stock_conversions c where c.org_id = public.auth_org() and c.id = p_doc), 'تحويل مادّة')
    when 'sale' then coalesce((select s.doc_no from public.sales_invoices s where s.org_id = public.auth_org() and s.id = p_doc), 'بيع')
    else p_kind
  end
$$;

-- ─── ج. المساعدات ────────────────────────────────────────────────────────────────────────────────────────────────
-- دفتر البيع: الدفتر الرئيسيّ لوحدة المخزن (القاعدة 36). وحدة المفقس بلا دفتر رئيسيّ، ومخازنها للبيض والأفراخ (لا تُباع هنا).
create or replace function private.sale_book(p_wh uuid) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  w public.warehouses;
  v_book uuid;
begin
  select * into w from public.warehouses where org_id = public.auth_org() and id = p_wh;
  select b.id into v_book from public.ledger_books b where b.org_id = w.org_id and b.division_id = w.division_id and b.code = 'main';
  if v_book is null then
    raise exception 'not_sellable' using hint = format('«%s» لا يبيع في هذه النسخة: بيع البيض والأفراخ يأتي مع الطيور.', w.name);
  end if;
  return v_book;
end
$$;

-- نوع رقم الفاتورة من نوع المخزن: العلف FD، والأدوية MD، والباقي MS (مبيعات مواد).
create or replace function private.sale_doc_kind(p_wh_kind text) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case p_wh_kind when 'feed' then 'FD' when 'medicine' then 'MD' else 'MS' end
$$;

-- الكلفة والربح لأدوار الكلفة وحدها: كلّ كائن cost (بأيّ عمق) يفقد money لغيرها، والمبلغ والجهة يبقيان لأدوار المبيعات.
create or replace function private.strip_cost(p jsonb) returns jsonb
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
begin
  if jsonb_typeof(p) = 'object' then
    return coalesce((select jsonb_object_agg(e.key, case when e.key = 'cost' then private.strip_money(e.value) else private.strip_cost(e.value) end)
      from jsonb_each(p) as e), '{}'::jsonb);
  elsif jsonb_typeof(p) = 'array' then
    return coalesce((select jsonb_agg(private.strip_cost(a.value) order by a.n) from jsonb_array_elements(p) with ordinality as a(value, n)), '[]'::jsonb);
  end if;
  return p;
end
$$;

create or replace function private.sale_view(p jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.can_see_cost() then p else private.strip_cost(p) end
$$;

-- نتيجة الفاتورة من صفوفها (أوّل نداء والإعادة والقارئ): المبلغ داخل money، والكلفة والربح داخل cost.money.
create or replace function private.sale_result(p_sale uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', s.id, 'doc_no', s.doc_no, 'status', s.status, 'sold_on', s.sold_on, 'payment', s.payment,
    'party_id', s.party_id, 'party_name', p.name, 'warehouse_id', s.warehouse_id, 'warehouse_name', w.name, 'book_id', s.book_id,
    'cash_account_id', s.cash_account_id, 'line_id', l.id, 'item_id', l.item_id, 'item_name', i.name, 'qty', l.qty::text, 'base_unit', l.base_unit,
    'free', l.line_total = 0, 'voided_at', s.voided_at, 'void_reason', s.void_reason,
    'money', jsonb_build_object('unit_price', l.unit_price::text, 'line_total', l.line_total::text,
      'paid_now', case when s.payment = 'cash' then l.line_total else 0 end::text),
    'cost', jsonb_build_object('money', jsonb_build_object('cost', c.cost::text, 'profit', (l.line_total - c.cost)::text)))
  from public.sales_invoices s
  join public.sales_lines l on l.org_id = s.org_id and l.sale_id = s.id and l.line_no = 1
  join public.sales_line_costs c on c.org_id = l.org_id and c.line_id = l.id
  join public.items i on i.org_id = l.org_id and i.id = l.item_id
  join public.parties p on p.org_id = s.org_id and p.id = s.party_id
  join public.warehouses w on w.org_id = s.org_id and w.id = s.warehouse_id
  where s.org_id = public.auth_org() and s.id = p_sale
$$;

-- ─── د. البيع ───────────────────────────────────────────────────────────────────────────────────────────────────
-- البيع (sale.record): مادّة بكميتها بوحدة أساسها وسعر الوحدة لجهة، من المخزن المختار أو الوحيد بالنطاق الذي فيه منها متاح بالتاريخ، بالدين
-- أو نقداً لصندوق. الأقفال (§2.3): المرجع ← معرّف الفاتورة ← الجهة ← قفل الفترة وصفّ الوحدة ← المخزن والمادّة ← الرصيد ← الصندوق ← الدفعات
-- (draw) ← عدّاد المستندات؛ وكلّ فحص بعد قفله. الكلفة = مجموع قيم السحب بالضبط (القاعدة ١٣).
create or replace function public.record_sale(p_client_ref uuid, p_sale_id uuid, p_line_id uuid, p_party uuid, p_item uuid, p_qty numeric,
  p_unit_price numeric, p_sold_on date, p_payment text, p_cash_account uuid, p_warehouse uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'record_sale';
  v_org uuid := public.auth_org();
  v_cached jsonb;
  v_result jsonb;
  i public.items;
  w public.warehouses;
  p public.parties;
  b public.ledger_books;
  x public.sales_invoices;
  e public.party_entries;
  pay public.party_entries;
  m public.cash_moves;
  s record;
  dr record;
  v_same boolean;
  v_count int;
  v_names text;
  v_expired numeric;
  v_total numeric;
  v_cost numeric := 0;
  v_no text;
begin
  set local lock_timeout = '5s';
  perform private.require('sale.record');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('sale', p_sale_id, 'line', p_line_id, 'party', p_party, 'item', p_item,
    'qty', p_qty, 'price', p_unit_price, 'on', p_sold_on, 'payment', p_payment, 'box', p_cash_account, 'warehouse', p_warehouse));
  if v_cached is not null then
    if exists (select 1 from public.sales_invoices y where y.org_id = v_org and y.id = p_sale_id and y.status = 'void') then
      raise exception 'id_conflict' using hint = 'سُجّل هذا البيع من قبل ثمّ أُلغي. سجّل بيعاً جديداً.';
    end if;
    -- ref_claim يقنّع المال كلّه لمن لا يرى الكلفة، ومن يبيع يرى المبلغ: المخزَّن نفسه بقناع الكلفة وحدها.
    select y.result into v_cached from public.rpc_refs y where y.org_id = v_org and y.fn = v_fn and y.client_ref = p_client_ref;
    return private.sale_view(v_cached);
  end if;
  if p_sale_id is null or p_line_id is null or p_party is null or p_item is null then
    raise exception 'id_required' using hint = 'تعذّر الإرسال دون معرّفات البيع والجهة والمادّة. حدّث الشاشة وأعد المحاولة.';
  end if;

  -- الإعادة بالمعرّف (جواب ضاع): الفاتورة المرحَّلة نفسها بسطرها ومحتواها = حُفظت، فنتيجتها؛ وغيرها تعارض.
  perform pg_advisory_xact_lock(hashtextextended('sale:' || p_sale_id::text, 0));
  select * into x from public.sales_invoices y where y.id = p_sale_id;
  if x.id is not null then
    v_same := x.org_id = v_org and x.status = 'posted' and x.created_by is not distinct from auth.uid() and x.party_id = p_party and x.sold_on = p_sold_on
      and x.payment = p_payment and x.cash_account_id is not distinct from p_cash_account and (p_warehouse is null or x.warehouse_id = p_warehouse)
      and exists (select 1 from public.sales_lines y where y.org_id = x.org_id and y.sale_id = x.id and y.id = p_line_id and y.item_id = p_item
        and y.qty = p_qty and y.unit_price = p_unit_price);
    if coalesce(v_same, false) then
      v_result := private.sale_result(x.id);
      update public.rpc_refs set result = v_result where org_id = v_org and fn = v_fn and client_ref = p_client_ref;
      return private.sale_view(v_result);
    end if;
    raise exception 'id_conflict' using hint = case
      when x.org_id = v_org and x.status = 'void' then 'سُجّل هذا البيع من قبل ثمّ أُلغي. سجّل بيعاً جديداً.'
      else 'سُجّل بهذا المعرّف بيع غير الذي أرسلته الآن. حدّث الشاشة لترى ما سُجّل، ثمّ سجّل من جديد.'
    end;
  end if;
  if exists (select 1 from public.sales_lines y where y.id = p_line_id) then
    raise exception 'id_conflict' using hint = 'معرّف سطر البيع مستعمل لفاتورة أخرى. حدّث الشاشة وأعد المحاولة.';
  end if;

  -- المادّة والكمية والسعر والدفع.
  select * into i from public.items y where y.org_id = v_org and y.id = p_item;
  if i.id is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if i.archived_at is not null then
    raise exception 'item_archived' using hint = format('المادّة «%s» مؤرشفة، فلا تُباع. أعِدها من الأرشيف أوّلاً.', i.name);
  end if;
  if i.kind in ('hatching_egg', 'chick', 'table_egg') then
    raise exception 'not_sellable' using hint = format('«%s» لا تُباع من هنا في هذه النسخة: بيع البيض والأفراخ يأتي مع بيع الطيور.', i.name);
  end if;
  if p_qty is null or not (abs(p_qty) < 'Infinity') or p_qty <= 0 or p_qty <> round(p_qty, 3) then
    raise exception 'qty_not_positive' using hint = format('اكتب كمية «%s» أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.', i.name);
  end if;
  if i.base_unit = 'pc' and p_qty <> round(p_qty, 0) then
    raise exception 'pieces_not_whole' using hint = format('«%s» تُعدّ بالقطعة؛ اكتب عدداً صحيحاً من القطع.', i.name);
  end if;
  if p_unit_price is null or not (abs(p_unit_price) < 'Infinity') or p_unit_price < 0 or p_unit_price <> round(p_unit_price, 2) then
    raise exception 'bad_price' using hint = 'سعر البيع لكلّ وحدة صفر أو أكثر، بمرتبتين عشريتين كحدّ أقصى.';
  end if;
  v_total := private._mul_div_round(p_qty, p_unit_price, 1, 0);
  if p_unit_price > 0 and v_total = 0 then
    raise exception 'total_zero' using hint = 'مجموع البيع يُقرَّب إلى صفر دينار. راجع الكمية والسعر، أو اكتب السعر صفراً لتسليم بلا مقابل.';
  end if;
  if p_payment is null or p_payment not in ('credit', 'cash') then
    raise exception 'bad_payment' using hint = 'اختر طريقة الدفع: نقداً إلى الصندوق أو بالدين على الجهة.';
  end if;
  if p_payment = 'cash' and v_total = 0 then
    raise exception 'price_required_for_cash' using hint = 'التسليم بلا مقابل لا يُقبض نقداً؛ اختر «بالدين» أو اكتب السعر.';
  end if;
  if p_payment = 'cash' and p_cash_account is null then
    raise exception 'cash_account_required' using hint = 'اختر الصندوق الذي قبضت فيه.';
  end if;
  if p_payment = 'credit' and p_cash_account is not null then
    raise exception 'bad_payment' using hint = 'البيع بالدين على الجهة لا يأخذ صندوقاً؛ اختر «نقداً إلى الصندوق» إن قبضت الآن.';
  end if;
  if p_sold_on is null then
    raise exception 'date_required' using hint = 'اكتب تاريخ البيع.';
  end if;
  perform private.check_doc_date(p_sold_on);

  -- الجهة.
  select * into p from public.parties y where y.org_id = v_org and y.id = p_party;
  if p.id is null then
    raise exception 'party_not_found' using hint = 'هذه الجهة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if p.archived_at is not null then
    raise exception 'party_archived' using hint = format('الجهة «%s» مؤرشفة، فلا يُسجَّل لها بيع جديد. أعِدها من الأرشيف أوّلاً.', p.name);
  end if;

  -- المخزن: المختار يُفحص (النطاق قبل أن يُسمّى)، وإلّا الوحيد بالنطاق الذي فيه منها متاح بالتاريخ.
  if p_warehouse is not null then
    select * into w from public.warehouses y where y.org_id = v_org and y.id = p_warehouse;
    if w.id is null then
      raise exception 'warehouse_not_found' using hint = 'هذا المخزن غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
    end if;
    if not public.in_scope_wh(w.id) then
      raise exception 'out_of_scope' using hint = format('المخزن «%s» خارج نطاقك، فلا تبيع منه.', w.name);
    end if;
    if w.archived_at is not null then
      raise exception 'warehouse_archived' using hint = format('المخزن «%s» مؤرشف، فلا يُباع منه. اختر مخزناً آخر.', w.name);
    end if;
    if not private.item_admissible(w.kind, i.kind) then
      raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s». اختر مخزناً فيه هذه المادّة.', i.name, w.name);
    end if;
  else
    select (count(*) filter (where q.available > 0))::int,
      string_agg(format('«%s» (%s)', y.name, private.qty_text(q.available, i.base_unit)), '، ' order by y.name collate "C", y.id) filter (where q.available > 0),
      coalesce(sum(q.expired), 0)
    into v_count, v_names, v_expired
    from public.warehouses y cross join lateral private.stock_at(i.id, y.id, p_sold_on) as q
    where y.org_id = v_org and y.archived_at is null and private.item_admissible(y.kind, i.kind) and public.in_scope_wh(y.id);
    if v_count = 0 then
      raise exception 'insufficient_stock' using hint = format('لا يوجد «%s» متاح في مخازن نطاقك بتاريخ %s: طلبت %s، وعندك %s.%s',
        i.name, to_char(p_sold_on, 'DD/MM/YYYY'), private.qty_text(p_qty, i.base_unit), private.qty_text(0, i.base_unit),
        case when v_expired > 0 then format(' وفي مخازنك %s منتهية الصلاحية لا تُباع.', private.qty_text(v_expired, i.base_unit)) else '' end);
    end if;
    if v_count > 1 then
      raise exception 'store_required' using hint = format('«%s» موجودة في أكثر من مخزن في نطاقك: %s. اختر المخزن الذي تبيع منه.', i.name, v_names);
    end if;
    select y.* into w from public.warehouses y cross join lateral private.stock_at(i.id, y.id, p_sold_on) as q
    where y.org_id = v_org and y.archived_at is null and private.item_admissible(y.kind, i.kind) and public.in_scope_wh(y.id) and q.available > 0;
  end if;
  -- قيد الجهة في الدفتر الرئيسيّ لوحدة المخزن، والكتابة في دفتر تحتاج نطاق وحدته (book_for_post، E49).
  b := private.book_for_post(private.sale_book(w.id));

  -- الأقفال بترتيبها، وكلّ فحص بعد قفله.
  perform private.lock_parties(array[p.id]);
  perform private.check_post_date(p_sold_on, w.division_id);
  perform private.lock_masters(array[w.id], array[i.id], true);
  perform private.lock_balances(array[i.id], array[w.id]);
  if p_payment = 'cash' then
    perform private.lock_cash_account(p_cash_account, true);
  end if;
  select * into s from private.stock_at(i.id, w.id, p_sold_on);
  if s.available < p_qty then
    raise exception 'insufficient_stock' using hint = format('لا يكفي رصيد «%s» في «%s»: طلبت %s، وعندك %s بتاريخ %s.%s%s',
      i.name, w.name, private.qty_text(p_qty, i.base_unit), private.qty_text(s.available, i.base_unit), to_char(p_sold_on, 'DD/MM/YYYY'),
      case when s.expired > 0 then format(' وفي المخزن %s منتهية الصلاحية لا تُباع.', private.qty_text(s.expired, i.base_unit)) else '' end,
      case when s.later > 0 then format(' و%s استُلمت بعد هذا التاريخ.', private.qty_text(s.later, i.base_unit)) else '' end);
  end if;
  for dr in select * from private.draw(i.id, w.id, p_qty, p_sold_on, null, false) loop
    perform private.apply_move(dr.lot_id, 'sale', p_sale_id, p_line_id, -dr.qty, -dr.value, p_sold_on, null, coalesce(i.tracks_expiry, false));
    v_cost := v_cost + dr.value;
  end loop;
  v_no := private.next_doc_no(private.sale_doc_kind(w.kind), p_sold_on);
  -- القيود (FOUNDATION ٤٩٥): الفاتورة +المبلغ، والقبض النقديّ يروح لفاتورته هي أوّلاً، وبعده متبقّي الفاتورة يتوزّع من الأقدم.
  if v_total > 0 then
    e := private.write_entry(gen_random_uuid(), p.id, b.id, 'invoice', v_total, 'sale', p_sale_id, v_no, p_sold_on, null);
    if p_payment = 'cash' then
      pay := private.write_entry(gen_random_uuid(), p.id, b.id, 'payment', -v_total, 'sale', p_sale_id, v_no, p_sold_on, null);
      perform private.allocate_entry(pay.id, e.id);
      m := private.write_cash_move(p_cash_account, v_total, 'party_payment', 'sale', p_sale_id, pay.id, p_sold_on, null, null);
    end if;
    perform private.allocate_entry(e.id, null);
  end if;
  insert into public.sales_invoices (id, org_id, doc_no, party_id, warehouse_id, book_id, sold_on, payment, cash_account_id, invoice_entry_id, payment_entry_id,
    cash_move_id, status, client_ref, posted_at, posted_by)
  values (p_sale_id, v_org, v_no, p.id, w.id, b.id, p_sold_on, p_payment, case when p_payment = 'cash' then p_cash_account end, e.id, pay.id, m.id,
    'posted', p_client_ref, now(), auth.uid());
  insert into public.sales_lines (id, org_id, sale_id, warehouse_id, line_no, item_id, qty, base_unit, unit_price, line_total)
  values (p_line_id, v_org, p_sale_id, w.id, 1, i.id, p_qty, i.base_unit, p_unit_price, v_total);
  insert into public.sales_line_costs (org_id, sale_id, line_id, warehouse_id, cost) values (v_org, p_sale_id, p_line_id, w.id, v_cost);
  perform private.mark_division_posted(w.division_id);
  v_result := private.sale_result(p_sale_id);
  update public.rpc_refs set result = v_result where org_id = v_org and fn = v_fn and client_ref = p_client_ref;
  return private.sale_view(v_result);
end
$$;

-- إلغاء البيع (void): كلّ حركة سحب ترجع لدفعتها بيوم الإلغاء، وقيد الفاتورة يُلغى بقيد عكسيّ؛ والقبض النقديّ وحركة صندوقه يبقيان رصيداً للجهة
-- (قرار المالك عبر المنسّق 2026-11-08، FOUNDATION ٥٨٣، وسابقة void_receipt)، يُردّ من «ألغِ القبض» القائمة. النتيجة تقول payment_kept.
create or replace function public.void_sale(p_sale_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_sale';
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_cached jsonb;
  v_reason text;
  x public.sales_invoices;
  l public.sales_lines;
  w public.warehouses;
  mv public.stock_moves;
  v_back int := 0;
  v_kept numeric := 0;
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_sale_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into x from public.sales_invoices y where y.org_id = v_org and y.id = p_sale_id;
  if x.id is null then
    raise exception 'doc_not_found' using hint = 'هذا البيع غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(x.warehouse_id, true);
  perform private.book_for_post(x.book_id);
  perform private.lock_parties(array[x.party_id]);
  perform private.check_void_date();
  select * into x from public.sales_invoices y where y.org_id = v_org and y.id = p_sale_id for update;
  if x.status = 'void' then
    raise exception 'already_void' using hint = format('البيع %s ملغى من قبل.', x.doc_no);
  end if;
  select * into l from public.sales_lines y where y.org_id = v_org and y.sale_id = x.id and y.line_no = 1;
  perform private.lock_masters(array[w.id], array[l.item_id], false);
  perform private.lock_balances(array[l.item_id], array[w.id]);
  for mv in
    select z.* from public.stock_moves z
    where z.org_id = v_org and z.doc_kind = 'sale' and z.doc_id = x.id and z.reverses_move_id is null
    order by z.seq
  loop
    perform private.apply_move(mv.lot_id, 'sale', x.id, mv.doc_line_id, -mv.qty, -mv.value, v_today, mv.id);
    v_back := v_back + 1;
  end loop;
  if x.invoice_entry_id is not null then
    perform private.void_entry(x.invoice_entry_id, v_reason);
  end if;
  if x.payment_entry_id is not null and not exists (select 1 from public.party_entries r where r.org_id = v_org and r.reverses_entry_id = x.payment_entry_id) then
    v_kept := l.line_total;
  end if;
  update public.sales_invoices set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason, version = version + 1
  where org_id = v_org and id = x.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', x.id, 'doc_no', x.doc_no, 'status', 'void', 'voided_on', v_today,
    'reversed_moves', v_back, 'party_id', x.party_id, 'payment_entry_id', case when v_kept > 0 then x.payment_entry_id end,
    'money', jsonb_build_object('line_total', l.line_total::text, 'payment_kept', v_kept::text)));
end
$$;

-- ─── هـ. القرّاء ──────────────────────────────────────────────────────────────────────────────────────────────────
-- المبيعات بفترة (من ← إلى): الصفوف الأحدث أوّلاً (1,000 حدّاً، والمجاميع على الفترة كلّها) بنطاق المخزن، والملغاة بحالتها خارج المجاميع.
create or replace function public.sales_overview(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_result jsonb;
begin
  perform private.require('read');
  if not public.can_see_sales() then
    raise exception 'forbidden' using hint = 'المبيعات لأدوار المبيعات فقط.';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'period_required' using hint = 'حدّد المدّة: من تاريخ إلى تاريخ لا يسبقه.';
  end if;
  with listed as (
    select s.id, s.doc_no, s.sold_on, s.status, s.payment, s.party_id, p.name as party_name, s.warehouse_id, w.name as warehouse_name,
      l.item_id, i.name as item_name, l.qty, l.base_unit, l.unit_price, l.line_total, c.cost, s.posted_at
    from public.sales_invoices s
    join public.sales_lines l on l.org_id = s.org_id and l.sale_id = s.id and l.line_no = 1
    join public.sales_line_costs c on c.org_id = l.org_id and c.line_id = l.id
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    join public.parties p on p.org_id = s.org_id and p.id = s.party_id
    join public.warehouses w on w.org_id = s.org_id and w.id = s.warehouse_id
    where s.org_id = v_org and s.sold_on between p_from and p_to and public.in_scope_wh(s.warehouse_id)
  ), ordered as (
    select r.*, row_number() over (order by r.sold_on desc, r.posted_at desc, r.id desc) as n from listed r
  )
  select jsonb_build_object('from', p_from, 'to', p_to, 'today', public.app_today(), 'can_record', public.can('sale.record'), 'can_void', public.can('void'),
    'rows', coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'doc_no', o.doc_no, 'sold_on', o.sold_on, 'status', o.status, 'payment', o.payment,
        'party_id', o.party_id, 'party_name', o.party_name, 'warehouse_id', o.warehouse_id, 'warehouse_name', o.warehouse_name,
        'item_id', o.item_id, 'item_name', o.item_name, 'qty', o.qty::text, 'base_unit', o.base_unit, 'free', o.line_total = 0,
        'money', jsonb_build_object('unit_price', o.unit_price::text, 'line_total', o.line_total::text),
        'cost', jsonb_build_object('money', jsonb_build_object('cost', o.cost::text, 'profit', (o.line_total - o.cost)::text)))
      order by o.n) filter (where o.n <= 1000), '[]'::jsonb),
    'more', count(*) > 1000,
    'totals', jsonb_build_object('count', (count(*) filter (where o.status = 'posted'))::int, 'voided', (count(*) filter (where o.status = 'void'))::int,
      'money', jsonb_build_object('revenue', coalesce(sum(o.line_total) filter (where o.status = 'posted'), 0)::text,
        'cash', coalesce(sum(o.line_total) filter (where o.status = 'posted' and o.payment = 'cash'), 0)::text,
        'credit', coalesce(sum(o.line_total) filter (where o.status = 'posted' and o.payment = 'credit'), 0)::text),
      'cost', jsonb_build_object('money', jsonb_build_object('cost', coalesce(sum(o.cost) filter (where o.status = 'posted'), 0)::text,
        'profit', coalesce(sum(o.line_total - o.cost) filter (where o.status = 'posted'), 0)::text))))
  into v_result
  from ordered o;
  return private.sale_view(v_result);
end
$$;

-- فاتورة واحدة: نتيجتها، ودفعاتها المسحوبة (الكمية لكلّ دور، والقيمة داخل cost.money)، وقيدا الجهة وحركة الصندوق، وأفعالها.
create or replace function public.sale_detail(p_sale uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  x public.sales_invoices;
  v_result jsonb;
begin
  perform private.require('read');
  if not public.can_see_sales() then
    raise exception 'forbidden' using hint = 'المبيعات لأدوار المبيعات فقط.';
  end if;
  select * into x from public.sales_invoices y where y.org_id = v_org and y.id = p_sale;
  if x.id is null then
    raise exception 'doc_not_found' using hint = 'هذا البيع غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_wh(x.warehouse_id) then
    raise exception 'out_of_scope' using hint = 'مخزن هذا البيع خارج نطاقك.';
  end if;
  v_result := private.sale_result(x.id) || jsonb_build_object(
    'can_void', public.can('void') and x.status = 'posted',
    'draws', (select coalesce(jsonb_agg(jsonb_build_object('lot_id', m.lot_id, 'received_on', lt.received_on, 'expiry_on', lt.expiry_on,
        'qty', (-m.qty)::text, 'cost', jsonb_build_object('money', jsonb_build_object('value', (-m.value)::text))) order by m.seq), '[]'::jsonb)
      from public.stock_moves m join public.stock_lots lt on lt.org_id = m.org_id and lt.id = m.lot_id
      where m.org_id = x.org_id and m.doc_kind = 'sale' and m.doc_id = x.id and m.reverses_move_id is null),
    'invoice_entry_id', x.invoice_entry_id, 'payment_entry_id', x.payment_entry_id, 'cash_move_id', x.cash_move_id,
    'payment_reversed', x.payment_entry_id is not null and exists (select 1 from public.party_entries r where r.org_id = x.org_id and r.reverses_entry_id = x.payment_entry_id));
  return private.sale_view(v_result);
end
$$;

-- تقرير المبيعات بفترة مجمَّعاً بالجهة أو المادّة أو اليوم (المرحَّل وحده): العدد والمبلغ، والكمية بوحدتها للمادّة وحدها، والكلفة والربح لأدوار الكلفة.
create or replace function public.sales_report(p_from date, p_to date, p_group text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_result jsonb;
begin
  perform private.require('read');
  if not public.can_see_sales() then
    raise exception 'forbidden' using hint = 'المبيعات لأدوار المبيعات فقط.';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'period_required' using hint = 'حدّد المدّة: من تاريخ إلى تاريخ لا يسبقه.';
  end if;
  if p_group is null or p_group not in ('party', 'item', 'day') then
    raise exception 'bad_group' using hint = 'اختر التجميع: بالجهة أو بالمادّة أو باليوم.';
  end if;
  with listed as (
    select case p_group when 'party' then s.party_id::text when 'item' then l.item_id::text else s.sold_on::text end as key,
      case p_group when 'party' then p.name when 'item' then i.name else to_char(s.sold_on, 'DD/MM/YYYY') end as label,
      l.item_id, l.base_unit, l.qty, l.line_total, c.cost, s.sold_on
    from public.sales_invoices s
    join public.sales_lines l on l.org_id = s.org_id and l.sale_id = s.id
    join public.sales_line_costs c on c.org_id = l.org_id and c.line_id = l.id
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    join public.parties p on p.org_id = s.org_id and p.id = s.party_id
    where s.org_id = v_org and s.status = 'posted' and s.sold_on between p_from and p_to and public.in_scope_wh(s.warehouse_id)
  ), grouped as (
    select r.key, min(r.label) as label, count(*)::int as count, sum(r.line_total) as revenue, sum(r.cost) as cost,
      case when p_group = 'item' then sum(r.qty) end as qty, case when p_group = 'item' then min(r.base_unit) end as base_unit, max(r.sold_on) as last_on
    from listed r group by r.key
  )
  select jsonb_build_object('from', p_from, 'to', p_to, 'group', p_group,
    'rows', coalesce(jsonb_agg(jsonb_build_object('key', g.key, 'label', g.label, 'count', g.count, 'qty', g.qty::text, 'base_unit', g.base_unit,
        'money', jsonb_build_object('revenue', g.revenue::text),
        'cost', jsonb_build_object('money', jsonb_build_object('cost', g.cost::text, 'profit', (g.revenue - g.cost)::text)))
      order by case when p_group = 'day' then g.key end desc, g.revenue desc, g.label collate "C", g.key), '[]'::jsonb),
    'totals', jsonb_build_object('count', coalesce(sum(g.count), 0)::int, 'money', jsonb_build_object('revenue', coalesce(sum(g.revenue), 0)::text),
      'cost', jsonb_build_object('money', jsonb_build_object('cost', coalesce(sum(g.cost), 0)::text, 'profit', coalesce(sum(g.revenue - g.cost), 0)::text))))
  into v_result
  from grouped g;
  return private.sale_view(v_result);
end
$$;

-- ─── و. الثوابت ─────────────────────────────────────────────────────────────────────────────────────────────────
-- حفظ القيمة يُخرج كلفة البيع المرحَّل، وترتيب السحب يحكم سحب البيع (0020 كما هو ويّا الموضعين).
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
  --    صفر بالطرفين (حركاته معكوسة ومصروفه بصفّ عكسي). والصرف لفوج (0019) خارج بقيمته: سطر كلفته على الفوج (flock_costs بنوع مستند
  --    flock_issue)، والملغى صفر (حركاته معكوسة وكلفته بصفّ عكسي). والبيع (0021) خارج بكلفته: لقطة sales_line_costs للفاتورة المرحَّلة، والملغاة
  --    صفر (حركاتها معكوسة).
  select 'value_conservation', count(*) from (
    select o.id,
      coalesce((select sum(x.value) from public.opening_lines x join public.opening_docs d on d.org_id = x.org_id and d.id = x.doc_id
        where x.org_id = o.id and d.status = 'posted'), 0)
      + coalesce((select sum(c.gain_value) from public.stock_count_line_costs c join public.stock_counts k on k.org_id = c.org_id and k.id = c.doc_id
        where c.org_id = o.id and k.status = 'approved'), 0)
      + coalesce((select sum(a.line_total - a.discount_share + a.charge_share) from public.receipt_line_amounts a
        join public.receipts r on r.org_id = a.org_id and r.id = a.doc_id where a.org_id = o.id and r.status = 'posted'), 0)
      + coalesce((select sum(v.lot_share) from public.receipt_revaluations v where v.org_id = o.id and v.status = 'posted'), 0)
      + coalesce((select sum(pv.extra_value) from public.production_values pv join public.production_batches b on b.org_id = pv.org_id and b.id = pv.batch_id
          where pv.org_id = o.id and b.status = 'posted'), 0) as inputs,
      coalesce((select sum(l.value_left) from public.stock_lots l where l.org_id = o.id), 0)
      + coalesce((select sum(e.amount) from public.expenses e where e.org_id = o.id and e.source = 'stock'), 0)
      + coalesce((select sum(p.amount) from public.party_entries p where p.org_id = o.id and p.kind = 'supplier_return'), 0)
      + coalesce((select sum(x.amount) from public.expenses x join public.expense_categories k on k.org_id = x.org_id and k.id = x.category_id
          where x.org_id = o.id and x.doc_kind = 'supplier_return' and k.system_code = 'supplier_return_diff'), 0)
      + coalesce((select sum(c.amount) from public.flock_costs c where c.org_id = o.id and c.doc_kind = 'flock_issue'), 0)
      + coalesce((select sum(c.cost) from public.sales_line_costs c join public.sales_invoices s on s.org_id = c.org_id and s.id = c.sale_id
          where c.org_id = o.id and s.status = 'posted'), 0) as outputs
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
  -- 10. ترتيب السحب (القاعدة 12): وقت كل قطعة سحب أصلية بالتحويل والصرف والجرد والصرف لفوج (0019) وتحويل المادّة (0020) والبيع (0021) ماكو دفعة قبلها بالترتيب (الانتهاء والفارغ أخيراً،
  --     ثم fifo_seq، ثم المعرّف) مؤهّلة بتاريخ السحب (مستلمة بيه أو قبله، وغير منتهية للسحب اللي طبّق قاعدة الانتهاء) وبيها متبقٍّ
  --     قبل القطعة. نقص الجرد المنتهي (expiry_checked = false) يشوف كل الدفعات مؤهّلة، والصالحة كلها بعد المنتهية بالترتيب، فيبقى
  --     الأقدم انتهاءً أوّلاً. السحب من دفعة مسمّاة (إذن المنتهي والإتلاف، والمرتجع WP7) برّا الفحص.
  select 'draw_order', count(*) from public.stock_moves m
  join public.stock_lots l on l.org_id = m.org_id and l.id = m.lot_id
  where m.qty < 0 and m.reverses_move_id is null and m.doc_kind in ('transfer', 'stock_use', 'count', 'flock_issue', 'conversion', 'sale')
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
  --     وقيده adjustment للمورّد (purchase لإكمال سعر شراء بلا سعر، 0020) بدفتر الاستلام = −الفرق، ومصروفه «فرق سعر شراء» بوحدة الاستلام = expense_amount (أو بلاه للصفر)؛
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
      or e.id is null or e.kind <> case when v.unit_price is not null then 'purchase' else 'adjustment' end or e.amount <> -v.diff or e.party_id <> r.party_id or e.book_id <> r.book_id
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

create or replace function public.verify_sales() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  -- ١) الشكل: سطر واحد لكلّ فاتورة بمخزن رأسها، ومبلغه = الكمية × السعر مقرَّباً لأقرب دينار، ووحدته وحدة أساس مادّته، وكلفة واحدة له.
  select 'sale_shape'::text, count(*) from public.sales_invoices s
  left join lateral (select count(*) as n from public.sales_lines l where l.org_id = s.org_id and l.sale_id = s.id) as k on true
  left join public.sales_lines l on l.org_id = s.org_id and l.sale_id = s.id and l.line_no = 1
  left join public.items i on i.org_id = l.org_id and i.id = l.item_id
  where k.n <> 1 or l.id is null or l.warehouse_id <> s.warehouse_id or l.line_total <> private._mul_div_round(l.qty, l.unit_price, 1, 0)
    or l.base_unit <> i.base_unit
    or (select count(*) from public.sales_line_costs c where c.org_id = l.org_id and c.line_id = l.id and c.sale_id = s.id) <> 1
  union all
  -- ٢) الحركات والكلفة: سحب أصليّ من مادّة السطر بكميته بالضبط من مخزنه ويومه (قطعة واحدة على الأقلّ)، وΣ قيمه = كلفة السطر؛ والمرحَّل بلا
  --    عكسية، والملغى كلّ أصلية منه معكوسة.
  select 'sale_moves', count(*) from public.sales_invoices s
  join public.sales_lines l on l.org_id = s.org_id and l.sale_id = s.id
  join public.sales_line_costs c on c.org_id = l.org_id and c.line_id = l.id
  cross join lateral (
    select coalesce(sum(-m.qty), 0) as drawn, coalesce(sum(-m.value), 0) as drawn_value, count(*) as pieces,
      count(*) filter (where m.item_id <> l.item_id or m.warehouse_id <> s.warehouse_id or m.moved_on <> s.sold_on or m.qty >= 0) as foreign_pieces,
      count(*) filter (where exists (select 1 from public.stock_moves r where r.org_id = m.org_id and r.reverses_move_id = m.id)) as reversed
    from public.stock_moves m
    where m.org_id = s.org_id and m.doc_kind = 'sale' and m.doc_id = s.id and m.doc_line_id = l.id and m.reverses_move_id is null
  ) as a
  where a.drawn <> l.qty or a.pieces = 0 or a.foreign_pieces > 0 or a.drawn_value <> c.cost
    or (s.status = 'posted' and a.reversed > 0) or (s.status = 'void' and a.reversed <> a.pieces)
  union all
  -- ٣) القيود والصندوق: الفاتورة بمبلغ موجب قيد invoice للجهة بدفترها بمستند البيع ويومه = المبلغ (والصفر بلا قيد)، والنقد قيد payment = −المبلغ
  --    وحركة party_payment بالصندوق = +المبلغ على قيد القبض؛ والمرحَّل قيد فاتورته بلا عكس، والملغى معكوس. والقبض يبقى بعد الإلغاء (لا يُفحص عكسه).
  select 'sale_entries', count(*) from public.sales_invoices s
  join public.sales_lines l on l.org_id = s.org_id and l.sale_id = s.id and l.line_no = 1
  left join public.party_entries e on e.org_id = s.org_id and e.id = s.invoice_entry_id
  left join public.party_entries pe on pe.org_id = s.org_id and pe.id = s.payment_entry_id
  left join public.cash_moves m on m.org_id = s.org_id and m.id = s.cash_move_id
  where (l.line_total > 0) <> (e.id is not null)
    or (e.id is not null and (e.kind <> 'invoice' or e.amount <> l.line_total or e.party_id <> s.party_id or e.book_id <> s.book_id
      or e.doc_kind is distinct from 'sale' or e.doc_id is distinct from s.id or e.on_date <> s.sold_on or e.reverses_entry_id is not null))
    or (s.payment = 'cash' and (pe.id is null or pe.kind <> 'payment' or pe.amount <> -l.line_total or pe.party_id <> s.party_id or pe.book_id <> s.book_id
      or pe.doc_kind is distinct from 'sale' or pe.doc_id is distinct from s.id or pe.on_date <> s.sold_on or pe.reverses_entry_id is not null
      or m.id is null or m.kind <> 'party_payment' or m.amount <> l.line_total or m.account_id is distinct from s.cash_account_id
      or m.party_entry_id is distinct from pe.id or m.doc_kind is distinct from 'sale' or m.doc_id is distinct from s.id or m.reverses_move_id is not null))
    or (s.payment = 'credit' and (pe.id is not null or m.id is not null))
    or (e.id is not null and s.status = 'posted' and exists (select 1 from public.party_entries r where r.org_id = s.org_id and r.reverses_entry_id = e.id))
    or (e.id is not null and s.status = 'void' and not exists (select 1 from public.party_entries r where r.org_id = s.org_id and r.reverses_entry_id = e.id))
    or not exists (select 1 from public.ledger_books k join public.warehouses w on w.org_id = s.org_id and w.id = s.warehouse_id
      where k.org_id = s.org_id and k.id = s.book_id and k.division_id = w.division_id and k.code = 'main')
  union all
  -- ٤) لا قيد ولا حركة صندوق ولا حركة مخزون بمستند sale إلا من فاتورة تشير إليها (أصلاً، والعكسيات لأصول منها).
  select 'sale_orphans', count(*) from (
    select e.id from public.party_entries e
    where e.doc_kind = 'sale'
      and not exists (select 1 from public.sales_invoices s where s.org_id = e.org_id and s.id = e.doc_id
        and coalesce(e.reverses_entry_id, e.id) in (s.invoice_entry_id, s.payment_entry_id))
    union all
    select m.id from public.cash_moves m
    where m.doc_kind = 'sale'
      and not exists (select 1 from public.sales_invoices s where s.org_id = m.org_id and s.id = m.doc_id and coalesce(m.reverses_move_id, m.id) = s.cash_move_id)
    union all
    select m.id from public.stock_moves m
    left join public.sales_lines l on l.org_id = m.org_id and l.id = m.doc_line_id and l.sale_id = m.doc_id
    where m.doc_kind = 'sale' and (l.id is null or m.item_id <> l.item_id or m.warehouse_id <> l.warehouse_id)
  ) as v
  union all
  -- ٥) الرقم: بنوع المخزن (العلف FD، والأدوية MD، والباقي MS) وسنة تاريخ البيع، ولكلّ (منشأة، نوع، سنة) الأرقام 1…last_no بلا فجوة ولا تكرار.
  select 'sale_numbers', (
    select count(*) from public.sales_invoices s join public.warehouses w on w.org_id = s.org_id and w.id = s.warehouse_id
    where split_part(s.doc_no, '-', 1) <> private.sale_doc_kind(w.kind) or split_part(s.doc_no, '-', 2) <> to_char(s.sold_on, 'YYYY')
  ) + (
    select count(*) from (
      select s.org_id, split_part(s.doc_no, '-', 1) as kind, split_part(s.doc_no, '-', 2)::int as year, count(*) as items,
        count(distinct split_part(s.doc_no, '-', 3)::int) as distinct_no, min(split_part(s.doc_no, '-', 3)::int) as min_no, max(split_part(s.doc_no, '-', 3)::int) as max_no
      from public.sales_invoices s group by 1, 2, 3
    ) as g
    full join (select * from public.doc_counters where kind in ('FD', 'MD', 'MS')) as c on c.org_id = g.org_id and c.kind = g.kind and c.year = g.year
    where g.org_id is null or c.org_id is null or g.items <> g.distinct_no or g.min_no <> 1 or g.max_no <> c.last_no
  )
$$;

-- ─── ز. الصلاحيات ───────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.record_sale(uuid, uuid, uuid, uuid, uuid, numeric, numeric, date, text, uuid, uuid), public.void_sale(uuid, text, uuid),
  public.sales_overview(date, date), public.sale_detail(uuid), public.sales_report(date, date, text), public.verify_sales()
  from public, anon;
grant execute on function public.record_sale(uuid, uuid, uuid, uuid, uuid, numeric, numeric, date, text, uuid, uuid), public.void_sale(uuid, text, uuid),
  public.sales_overview(date, date), public.sale_detail(uuid), public.sales_report(date, date, text) to authenticated;
revoke all on function public.verify_sales() from authenticated;
grant execute on function public.verify_sales() to service_role;
