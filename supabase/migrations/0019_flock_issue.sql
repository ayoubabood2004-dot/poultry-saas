-- 0019_flock_issue — صرف مادّة من المخزن لفوج القاعة بنداء واحد، وكلفة الفوج (كلمة المالك 2026-11-07: «هاي المادة لمن اروح للقاعات اريد
--   اصرفلهم مادة معينة الكي المواد الي اني صنعتها بالمعمل… ويكلي شكد عندك واكدر اصرف منها للقاعة»؛ DECISIONS «المعمل بالبطاقات، وصرف
--   العلف للقاعات»؛ FOUNDATION ٩٢–٩٩، ١٢٨، ٣٨٥–٣٩٠، ٤٣٧، ٤٤٣، ٤٧٤–٤٧٦ (القواعد ١٢–١٤)، ٥٧٦–٥٧٧).
-- المشكلة: العلف المنتَج في المعمل يبقى في مخزنه، ولا طريق لإخراجه إلى فوج القاعة: الجولة اليومية تسجّل «العلف المستهلك» رقماً بلا
--   مخزون ولا كلفة، فلا يُعرف كم صُرف للقاعة ولا كم بقي فيها، ولا كلفة على الفوج.
-- هنا: flock_costs (دفتر كلفة الفوج، يُضاف ولا يُعدَّل: محفّز يرفض التعديل والحذف لكلّ دور، والإلغاء صفّ عكسي بـreverses_id فريد؛ قراءته
--   لأدوار الكلفة بسياسة مقيِّدة وبنطاق حقل الفوج)، وflock_issues وflock_issue_lines (تكتبهما الدالّتان وحدهما)؛ وpublic.record_flock_issue
--   (issue.post) تصرف مادّة واحدة بكمية بوحدة أساسها لفوج قائم وتُرحَّل فوراً بمعاملة واحدة ومرجع client_ref: تسحب من المخزن بترتيب السحب
--   (القواعد ١٢–١٤ بـprivate.draw، والمنتهي لا يُسحب) بحركات نوعها flock_issue، وتكتب سطر كلفة على الفوج بقيمة السحب بالضبط، ورقمها
--   FI-YYYY-NNNN؛ وpublic.void_flock_issue (void) تعكس الحركات على دفعاتها نفسها بيوم الإلغاء وسطر الكلفة بصفّ عكسي؛ والقارئان
--   flock_issue_options («ما يُصرف»: المواد المتاحة بمخازن نطاق القارئ، العلف المنتَج في المعمل أوّلاً) وflock_feed («علف القاعة»:
--   المصروف والمستهلك المسجّل والباقي، وسطر لكلّ صرف)؛ وverify_flock_issues؛ وverify_stock يحسب الصرف للفوج خارجاً بقيمته (حفظ القيمة)
--   ويحكم ترتيب سحبه؛ وبيان الحركة ورقمها في بطاقة المادّة (stock_doc_memo وstock_doc_label).
-- نوع الكلفة من نوع المادّة: العلف والمواد الأوّلية والإضافات feed، والدواء medicine، واللقاح vaccine، والوقود fuel، وغيرها other؛ وبيض
--   التفقيس والأفراخ وبيض المائدة لا تُصرف للفوج (الأفراخ تدخله بالتسكين لاحقاً). وكيلوغرامات العلف للقارئ: الكيلو كما هو، واللتر بلقطة
--   الكثافة على السطر، والقطعة خارجها.
-- انحرافات مكتوبة عن FOUNDATION (قرارات الجلسة 2026-11-07 مع العقد scratchpad/simple/contract-0019.md):
--   • بلا مسوّدة: الصرف يُرحَّل فوراً بنداء واحد مثل الشراء البسيط (0017)، والنقص يُرفض insufficient_stock بتلميح يسمّي المادّة والمطلوب
--     والموجود («عندك …») والمنتهي، ولا يُحفظ شيء (FOUNDATION ١٤ تقول «يبقى مسوّدة»؛ هنا لا مسوّدة أصلاً).
--   • بلا معاينة ولا بصمة خطّة: المستخدم يوافق على كمية فقط، والقيمة تُحسب لحظة الترحيل وتُعرض بعده، فلا فرق بين ما رآه وما رُحّل.
--   • سطر واحد لكلّ صرف (line_no = 1) في هذه النسخة، والجداول تحتمل أكثر؛ ولا إرجاع من الفوج (post_flock_return للنسخة القادمة).
--   • التحقّق من المعرّف (الإعادة بمعرّف الصرف نفسه بعد جواب ضاع) قبل فحوص المدخلات، تحت قفل استشاريّ للمعرّف: صرف حُفظ ثمّ تغيّر شيء
--     يرجع «حُفظ» بنتيجته لا رفضاً (درس 0017)، وصرف أُلغي بعدها id_conflict بتلميح «أُلغي».
--   • التاريخ بقواعد 0018 (لا مستقبل، ولا أقدم من 7 أيام، ولا فترة مقفولة) لوحدة المخزن ووحدة الفوج، بترتيب المعرّف؛ ولا قبل التسكين.
--   • بين وحدتين صادر داخليّ بالكلفة: لا قيد جهة ولا مصروف ولا دفتر.
--   • flock_costs يزيد site_id (نطاق سياسة القراءة بعمود الصفّ، FOUNDATION ٥٤٤) وdoc_line_id (نوع الكلفة لكلّ سطر)، وflock_issues يزيد
--     site_id وdivision_id من الفوج، وسطر الصرف يحفظ لقطة نوع الكلفة والكثافة ووحدة الأساس.
-- تراجع: rollback_0019.sql — يرجّع أجسام verify_stock (كما في 0016) وprivate.stock_doc_memo وprivate.stock_doc_label (كما في 0015) حرفاً
--   بحرف، وقيدَي stock_moves_doc_kind_check وdoc_counters_kind_check بلا 'flock_issue' و'FI'، ويُسقط الدوالّ الجديدة وسياسة نطاق سجلّ
--   التدقيق والجداول الثلاثة. **طريق رفض**: أيّ صفّ في flock_issues أو flock_issue_lines أو flock_costs يوقف التراجع بصوت بلا أن يحذف
--   شيئاً (كلفة الفوج وحركات المخزون التي تشير إليها لا تُستخرج من مكان آخر).
-- تنعاد بأمان: create table if not exists، وcreate or replace، وcreate index if not exists، وكتل do تفحص الكتالوج قبل القيود والسياسات.

set lock_timeout = '5s';

-- ─── أ. دفتر كلفة الفوج (FOUNDATION ٣٨٩، ٤٣٧، ٤٤٣) ───────────────────────────────────────────────────────────────
-- صفّ لكلّ كلفة دخلت الفوج بإشارتها (الصرف موجب، والإلغاء صفّ عكسي سالب يشير إلى أصله). المبلغ بالفلس (مرتبتان)، وقد يكون صفراً
-- (دفعة بقيمة صفر)؛ يُضاف ولا يُعدَّل. site_id حقل الفوج (السياسة بعمود الصفّ)، وdoc_line_id سطر المستند الذي جاء منه.
create table if not exists public.flock_costs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  flock_id uuid not null,
  site_id uuid not null,
  kind text not null,
  amount numeric not null,
  doc_kind text not null,
  doc_id uuid not null,
  doc_line_id uuid,
  on_date date not null,
  expense_id uuid,
  reverses_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint flock_costs_kind_check check (kind in ('chicks', 'feed', 'medicine', 'vaccine', 'fuel', 'labor', 'other', 'opening')),
  constraint flock_costs_amount_check check (abs(amount) < 'Infinity' and amount = round(amount, 2)),
  constraint flock_costs_doc_kind_check check (doc_kind in ('flock_issue')),
  -- الصرف للفوج صادر داخليّ بالكلفة بلا مصروف (FOUNDATION ١٢٨)؛ عمود المصروف لكلفة تُحمَّل من مصروف مسجّل في نسخة قادمة.
  constraint flock_costs_expense_check check (doc_kind <> 'flock_issue' or expense_id is null),
  unique (org_id, id),
  unique (org_id, reverses_id),
  foreign key (org_id, flock_id) references public.flocks (org_id, id),
  foreign key (org_id, expense_id) references public.expenses (org_id, id),
  foreign key (org_id, reverses_id) references public.flock_costs (org_id, id)
);
create index if not exists flock_costs_flock on public.flock_costs (org_id, flock_id, on_date);
create index if not exists flock_costs_doc on public.flock_costs (org_id, doc_kind, doc_id);
create index if not exists flock_costs_expense on public.flock_costs (org_id, expense_id);
create index if not exists flock_costs_site on public.flock_costs (org_id, site_id);

-- ─── ب. الصرف للفوج (FOUNDATION ٣٨٥–٣٨٦): رأس مرحَّل فوراً بفوجه وقاعته ومخزنه، وسطر بلقطة المادّة ─────────────────────
-- القاعة والحقل والوحدة من الفوج (المفتاح المركّب للقاعة)، والرقم FI-YYYY-NNNN من عدّاد المستندات، والحالة posted ← void.
create table if not exists public.flock_issues (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  doc_no text not null,
  flock_id uuid not null,
  hall_id uuid not null,
  site_id uuid not null,
  division_id uuid not null,
  warehouse_id uuid not null,
  issued_on date not null,
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
  constraint flock_issues_doc_no_check check (doc_no ~ '^FI-[0-9]{4}-[0-9]{4,}$'),
  constraint flock_issues_status_check check (status in ('posted', 'void')),
  constraint flock_issues_void_check check ((status = 'void') = (voided_at is not null) and (voided_at is null) = (void_reason is null)),
  constraint flock_issues_void_reason_check check (void_reason is null or length(btrim(void_reason)) between 1 and 500),
  constraint flock_issues_version_check check (version >= 1),
  unique (org_id, id),
  unique (org_id, doc_no),
  unique (org_id, id, warehouse_id, site_id),
  foreign key (org_id, flock_id) references public.flocks (org_id, id),
  foreign key (org_id, division_id, site_id, hall_id) references public.halls (org_id, division_id, site_id, id),
  foreign key (org_id, warehouse_id) references public.warehouses (org_id, id)
);
create index if not exists flock_issues_flock on public.flock_issues (org_id, flock_id, issued_on);
create index if not exists flock_issues_hall on public.flock_issues (org_id, division_id, site_id, hall_id);
create index if not exists flock_issues_warehouse on public.flock_issues (org_id, warehouse_id);

-- سطر الصرف: الكمية بوحدة أساس المادّة، ولقطة وحدة الأساس والكثافة (للتر) ونوع الكلفة لحظة الصرف (كلّ ما يُحسب منه السطر لقطة عليه،
-- درس 0009 و0016). مخزن الرأس وحقله منسوخان (السياسة بعمود الصفّ).
create table if not exists public.flock_issue_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  issue_id uuid not null,
  warehouse_id uuid not null,
  site_id uuid not null,
  line_no int not null,
  item_id uuid not null,
  qty_base numeric not null,
  base_unit text not null,
  density_kg_per_l numeric,
  cost_kind text not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint flock_issue_lines_qty_check check (abs(qty_base) < 'Infinity' and qty_base > 0 and qty_base = round(qty_base, 3)),
  constraint flock_issue_lines_unit_check check (base_unit in ('kg', 'L', 'pc') and (base_unit <> 'pc' or qty_base = trunc(qty_base))),
  constraint flock_issue_lines_density_check check (density_kg_per_l is null
    or (base_unit = 'L' and abs(density_kg_per_l) < 'Infinity' and density_kg_per_l > 0 and density_kg_per_l = round(density_kg_per_l, 4))),
  constraint flock_issue_lines_cost_kind_check check (cost_kind in ('feed', 'medicine', 'vaccine', 'fuel', 'other')),
  constraint flock_issue_lines_line_no_check check (line_no >= 1),
  unique (org_id, id),
  unique (org_id, issue_id, line_no),
  foreign key (org_id, issue_id, warehouse_id, site_id) references public.flock_issues (org_id, id, warehouse_id, site_id),
  foreign key (org_id, item_id) references public.items (org_id, id)
);
create index if not exists flock_issue_lines_issue on public.flock_issue_lines (org_id, issue_id, warehouse_id, site_id);
create index if not exists flock_issue_lines_item on public.flock_issue_lines (org_id, item_id);

do $$
declare
  t text;
begin
  -- دفتر الكلفة: تعديل أو حذف أو مسح يرفض لأيّ دور (FOUNDATION ٤٣٧).
  execute 'create or replace trigger flock_costs_append_only before update or delete on public.flock_costs for each row execute function private.reject_change()';
  execute 'create or replace trigger flock_costs_no_truncate before truncate on public.flock_costs for each statement execute function private.reject_change()';
  foreach t in array array['flock_costs', 'flock_issues', 'flock_issue_lines'] loop
    execute format('create or replace trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()', 'audit_' || t, t);
  end loop;
end
$$;

-- ─── ج. RLS والامتيازات: قراءة بالنطاق، والكتابة للدالّتين وحدهما، والمال لأدوار الكلفة ─────────────────────────────────
-- الصرف وسطره يقرؤهما من بنطاقه حقل الفوج أو مخزن الصرف (مثل التحويل بطرفيه)، والكلفة بنطاق حقل الفوج وتحت سياسة الكلفة المقيِّدة
-- (الأمين وعامل القاعة والمشاهد لا يقرؤونها، FOUNDATION ٤٤٣).
alter table public.flock_costs enable row level security;
alter table public.flock_issues enable row level security;
alter table public.flock_issue_lines enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'flock_issues' and policyname = 'flock_issues_read') then
    create policy flock_issues_read on public.flock_issues for select to authenticated
      using (org_id = (select public.auth_org()) and ((select public.in_scope_site(site_id)) or (select public.in_scope_wh(warehouse_id))));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'flock_issue_lines' and policyname = 'flock_issue_lines_read') then
    create policy flock_issue_lines_read on public.flock_issue_lines for select to authenticated
      using (org_id = (select public.auth_org()) and ((select public.in_scope_site(site_id)) or (select public.in_scope_wh(warehouse_id))));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'flock_costs' and policyname = 'flock_costs_read') then
    create policy flock_costs_read on public.flock_costs for select to authenticated
      using (org_id = (select public.auth_org()) and (select public.in_scope_site(site_id)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'flock_costs' and policyname = 'flock_costs_cost_only') then
    create policy flock_costs_cost_only on public.flock_costs as restrictive for select to authenticated using ((select public.can_see_cost()));
  end if;
  -- سجلّ التدقيق يحمل الصفّ كلّه (E49): صفوف الصرف وسطره بحقل الفوج أو مخزن الصرف، وصفوف الكلفة بحقل الفوج، مثل سياسات الجداول نفسها.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'audit_log_flock_issue_scope') then
    create policy audit_log_flock_issue_scope on public.audit_log as restrictive for select to authenticated
      using (case
        when table_name in ('flock_issues', 'flock_issue_lines')
          then public.in_scope_site((coalesce("new", "old") ->> 'site_id')::uuid) or public.in_scope_wh((coalesce("new", "old") ->> 'warehouse_id')::uuid)
        when table_name = 'flock_costs' then public.in_scope_site((coalesce("new", "old") ->> 'site_id')::uuid)
        else true
      end);
  end if;
end
$$;

revoke all on table public.flock_costs, public.flock_issues, public.flock_issue_lines from anon, authenticated;
grant select on table public.flock_costs, public.flock_issues, public.flock_issue_lines to authenticated;
revoke truncate on table public.flock_costs, public.flock_issues, public.flock_issue_lines from service_role;

-- ─── د. نوع المستند الجديد في قيد الحركة وعدّاد المستندات، وفي البيان والرقم ───────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'stock_moves_doc_kind_check' and conrelid = 'public.stock_moves'::regclass
    and pg_get_constraintdef(oid) not like '%flock_issue%') then
    alter table public.stock_moves drop constraint stock_moves_doc_kind_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_moves_doc_kind_check' and conrelid = 'public.stock_moves'::regclass) then
    alter table public.stock_moves add constraint stock_moves_doc_kind_check
      check (doc_kind in ('opening', 'receipt', 'supplier_return', 'receipt_revalue', 'transfer', 'count', 'stock_use', 'production', 'flock_issue'));
  end if;
  if exists (select 1 from pg_constraint where conname = 'doc_counters_kind_check' and conrelid = 'public.doc_counters'::regclass
    and pg_get_constraintdef(oid) not like '%FI%') then
    alter table public.doc_counters drop constraint doc_counters_kind_check;
    alter table public.doc_counters add constraint doc_counters_kind_check
      check (kind in ('PU', 'RT', 'TR', 'CT', 'SU', 'RC', 'PY', 'OF', 'PD', 'FI'));
  end if;
end
$$;

-- بيان الحركة في دفتر المادّة (0015 كما هو، ويّا الصرف للفوج: «صرف إلى قاعة 1 (حقل الأمل)»).
create or replace function private.stock_doc_memo(p_kind text, p_doc uuid, p_warehouse uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case p_kind
    when 'receipt' then coalesce((select format('شراء من %s', t.name) from public.receipts r
      join public.parties t on t.org_id = r.org_id and t.id = r.party_id
      where r.org_id = public.auth_org() and r.id = p_doc), 'شراء')
    when 'supplier_return' then coalesce((select format('مرتجع إلى %s', t.name) from public.supplier_returns s
      join public.parties t on t.org_id = s.org_id and t.id = s.party_id
      where s.org_id = public.auth_org() and s.id = p_doc), 'مرتجع إلى المورّد')
    when 'receipt_revalue' then 'تصحيح سعر الشراء'
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
    else p_kind
  end
$$;

-- اسم المستند للتلميح والعرض (0015 كما هو، ويّا رقم الصرف للفوج).
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
    when 'production' then coalesce((select coalesce(b.doc_no, format('دفعة إنتاج %s', r.name)) from public.production_batches b
      join public.recipe_versions v on v.org_id = b.org_id and v.id = b.recipe_version_id
      join public.recipes r on r.org_id = v.org_id and r.id = v.recipe_id
      where b.org_id = public.auth_org() and b.id = p_doc), 'دفعة إنتاج')
    when 'flock_issue' then coalesce((select x.doc_no from public.flock_issues x where x.org_id = public.auth_org() and x.id = p_doc), 'صرف لفوج')
    else p_kind
  end
$$;

-- ─── هـ. المساعدات ───────────────────────────────────────────────────────────────────────────────────────────────
-- نوع كلفة الفوج من نوع المادّة؛ والمعدود (بيض التفقيس والأفراخ وبيض المائدة) لا يُصرف للفوج: null.
create or replace function private.flock_cost_kind(p_item_kind text) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case
    when p_item_kind is null or p_item_kind in ('hatching_egg', 'chick', 'table_egg') then null
    when p_item_kind in ('feed', 'raw', 'additive') then 'feed'
    when p_item_kind in ('medicine', 'vaccine', 'fuel') then p_item_kind
    else 'other'
  end
$$;

-- كتلة السطر بالكيلو للقارئ: الكيلو كما هو، واللتر × لقطة الكثافة (القاعدة ٤: round3)، والقطعة أو اللتر بلا كثافة null. لا ترمي أبداً
-- (درس 0016: سطر واحد لا يُسقط القارئ؛ القارئ يعدّ ما لم يُوزن).
create or replace function private.issue_mass_kg(p_qty numeric, p_unit text, p_density numeric) returns numeric
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case
    when p_qty is null or not (abs(p_qty) < 'Infinity') then null
    when p_unit = 'kg' then round(p_qty, 3)
    when p_unit = 'L' and p_density is not null and abs(p_density) < 'Infinity' and p_density > 0 then round(p_qty * p_density, 3)
    else null
  end
$$;

-- نتيجة الصرف من صفوفه: نفسها لأوّل نداء وللإعادة بالمعرّف. القيمة داخل money (يُقنَّع لغير أدوار الكلفة بـprivate.mask عند الإرجاع).
create or replace function private.flock_issue_result(p_issue uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', x.id, 'doc_no', x.doc_no, 'status', x.status, 'issued_on', x.issued_on, 'flock_id', x.flock_id,
    'hall_id', x.hall_id, 'hall_name', h.name, 'line_id', y.id, 'item_id', y.item_id, 'item_name', i.name, 'cost_kind', y.cost_kind,
    'warehouse_id', x.warehouse_id, 'warehouse_name', w.name, 'qty', y.qty_base::text, 'base_unit', y.base_unit,
    'money', jsonb_build_object('value', c.amount::text))
  from public.flock_issues x
  join public.flock_issue_lines y on y.org_id = x.org_id and y.issue_id = x.id and y.line_no = 1
  join public.halls h on h.org_id = x.org_id and h.id = x.hall_id
  join public.items i on i.org_id = y.org_id and i.id = y.item_id
  join public.warehouses w on w.org_id = x.org_id and w.id = x.warehouse_id
  left join public.flock_costs c on c.org_id = x.org_id and c.doc_kind = 'flock_issue' and c.doc_id = x.id and c.doc_line_id = y.id
    and c.reverses_id is null
  where x.org_id = public.auth_org() and x.id = p_issue
$$;

-- ─── و. الصرف للفوج بنداء واحد (issue.post) ─────────────────────────────────────────────────────────────────────
-- مادّة واحدة بكميتها بوحدة أساسها لفوج قائم بنطاق الكاتب، من المخزن المختار أو من المخزن الوحيد بنطاقه الذي فيه منها متاح بالتاريخ
-- (أكثر ← store_required بأسمائها وكمياتها، ولا شيء ← insufficient_stock). الأقفال (§2.3): المرجع ← معرّف الصرف ← قفل الفترة وصفّا
-- الوحدتين بترتيب المعرّف (والتاريخ بعدهما) ← صفّ الفوج للمشاركة ← المخزن والمادّة ← الرصيد ← الدفعات (draw) ← العدّاد؛ وكلّ فحص بعد
-- قفله. القيمة = مجموع قيم السحب (القاعدة ١٣)، وسطر الكلفة بها بالضبط، والنتيجة تُقنَّع لغير أدوار الكلفة.
create or replace function public.record_flock_issue(p_client_ref uuid, p_issue_id uuid, p_line_id uuid, p_flock uuid, p_item uuid, p_qty numeric,
  p_issued_on date, p_warehouse uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'record_flock_issue';
  v_org uuid := public.auth_org();
  v_cached jsonb;
  v_result jsonb;
  f public.flocks;
  h public.halls;
  i public.items;
  w public.warehouses;
  x public.flock_issues;
  s record;
  dr record;
  v_kind text;
  v_same boolean;
  v_count int;
  v_names text;
  v_expired numeric;
  v_div uuid;
  v_total numeric := 0;
  v_no text;
begin
  set local lock_timeout = '5s';
  perform private.require('issue.post');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('issue', p_issue_id, 'line', p_line_id, 'flock', p_flock, 'item', p_item,
    'qty', p_qty, 'on', p_issued_on, 'warehouse', p_warehouse));
  if v_cached is not null then
    -- صرف حُفظ ثمّ أُلغي: الإعادة لا تقول «حُفظ» بنتيجته القديمة، بل تعارض يسمّي الإلغاء (درس 0017).
    if exists (select 1 from public.flock_issues y where y.org_id = v_org and y.id = p_issue_id and y.status = 'void') then
      raise exception 'id_conflict' using hint = 'سُجّل هذا الصرف من قبل ثمّ أُلغي. افتح صفحة القاعة وسجّل صرفاً جديداً.';
    end if;
    return v_cached;
  end if;
  if p_issue_id is null or p_line_id is null or p_flock is null or p_item is null then
    raise exception 'id_required' using hint = 'تعذّر الإرسال دون معرّفات الصرف والفوج والمادّة. حدّث الشاشة وأعد المحاولة.';
  end if;

  -- الإعادة بالمعرّف (جواب ضاع): نداءان بالمعرّف نفسه يترتّبان هنا، فيرى الثاني صفّ الأوّل بعد ثباته. الصرف المرحَّل نفسه بمحتواه = حُفظ،
  -- فنتيجته؛ وغيره تعارض.
  perform pg_advisory_xact_lock(hashtextextended('flock_issue:' || p_issue_id::text, 0));
  select * into x from public.flock_issues y where y.id = p_issue_id;
  if x.id is not null then
    v_same := x.org_id = v_org and x.status = 'posted' and x.created_by is not distinct from auth.uid() and x.flock_id = p_flock
      and x.issued_on = p_issued_on and (p_warehouse is null or x.warehouse_id = p_warehouse)
      and exists (select 1 from public.flock_issue_lines y where y.org_id = x.org_id and y.issue_id = x.id and y.id = p_line_id
        and y.item_id = p_item and y.qty_base = p_qty);
    if coalesce(v_same, false) then
      v_result := private.flock_issue_result(x.id);
      return private.ref_store(v_fn, p_client_ref, v_result);
    end if;
    raise exception 'id_conflict' using hint = case
      when x.org_id = v_org and x.status = 'void' then 'سُجّل هذا الصرف من قبل ثمّ أُلغي. افتح صفحة القاعة وسجّل صرفاً جديداً.'
      else 'سُجّل بهذا المعرّف صرف غير الذي أرسلته الآن. افتح صفحة القاعة لترى ما سُجّل، ثمّ سجّل من جديد.'
    end;
  end if;
  if exists (select 1 from public.flock_issue_lines y where y.id = p_line_id) then
    raise exception 'id_conflict' using hint = 'معرّف سطر الصرف مستعمل لصرف آخر. حدّث الشاشة وأعد المحاولة.';
  end if;

  -- الفوج: موجود، وحقله بنطاق الكاتب (قبل أن يُسمّى شيء منه، E49)، وقائم.
  select * into f from public.flocks y where y.org_id = v_org and y.id = p_flock;
  if f.id is null then
    raise exception 'flock_not_found' using hint = 'هذا الفوج غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(f.site_id) then
    raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك، فلا تصرف لها. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  select * into h from public.halls y where y.org_id = f.org_id and y.id = f.hall_id;
  if f.status = 'closed' then
    raise exception 'flock_closed' using hint = format('فوج «%s» مغلق، فلا يُصرف له شيء.', h.name);
  end if;
  if f.status <> 'active' then
    raise exception 'flock_not_placed' using hint = format('فوج «%s» لم يُسكَّن بعد، فلا يُصرف له شيء.', h.name);
  end if;

  -- المادّة: موجودة وفعّالة وتُصرف للفوج، والكمية بوحدة أساسها (القطعة عدد صحيح).
  select * into i from public.items y where y.org_id = v_org and y.id = p_item;
  if i.id is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if i.archived_at is not null then
    raise exception 'item_archived' using hint = format('المادّة «%s» مؤرشفة، فلا تُصرف. أعِدها من الأرشيف أوّلاً.', i.name);
  end if;
  v_kind := private.flock_cost_kind(i.kind);
  if v_kind is null then
    raise exception 'not_issuable' using hint = format('«%s» لا تُصرف للفوج: الأفراخ تدخله بالتسكين، والبيض يخرج منه ولا يُصرف له.', i.name);
  end if;
  if p_qty is null or not (abs(p_qty) < 'Infinity') or p_qty <= 0 or p_qty <> round(p_qty, 3) then
    raise exception 'qty_not_positive' using hint = format('اكتب كمية «%s» أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.', i.name);
  end if;
  if i.base_unit = 'pc' and p_qty <> round(p_qty, 0) then
    raise exception 'pieces_not_whole' using hint = format('«%s» تُعدّ بالقطعة؛ اكتب عدداً صحيحاً من القطع.', i.name);
  end if;
  if p_issued_on is null then
    raise exception 'date_required' using hint = 'اكتب تاريخ الصرف.';
  end if;
  -- قاعدة التاريخ (0018) قبل اختيار المخزن، فيُقال الخطأ الصحيح أوّلاً؛ والفحص الملزم تحت قفل الفترة (check_post_date أدناه).
  perform private.check_doc_date(p_issued_on);
  if p_issued_on < f.placed_on then
    raise exception 'before_placement' using hint = format('التاريخ %s قبل تسكين الفوج في %s.', to_char(p_issued_on, 'DD/MM/YYYY'), to_char(f.placed_on, 'DD/MM/YYYY'));
  end if;

  -- المخزن: المختار يُفحص (النطاق قبل أن يُسمّى)، وبلا اختيار فالمخزن الوحيد بنطاق الكاتب الذي فيه من المادّة متاح بتاريخ الصرف.
  if p_warehouse is not null then
    select * into w from public.warehouses y where y.org_id = v_org and y.id = p_warehouse;
    if w.id is null then
      raise exception 'warehouse_not_found' using hint = 'هذا المخزن غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
    end if;
    if not public.in_scope_wh(w.id) then
      raise exception 'out_of_scope' using hint = format('المخزن «%s» خارج نطاقك، فلا تصرف منه.', w.name);
    end if;
    if w.archived_at is not null then
      raise exception 'warehouse_archived' using hint = format('المخزن «%s» مؤرشف، فلا يُصرف منه. اختر مخزناً آخر.', w.name);
    end if;
    if not private.item_admissible(w.kind, i.kind) then
      raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s»، فلا تُصرف منه. اختر مخزناً فيه هذه المادّة.', i.name, w.name);
    end if;
  else
    select (count(*) filter (where a.available > 0))::int,
      string_agg(format('«%s» (%s)', y.name, private.qty_text(a.available, i.base_unit)), '، ' order by y.name collate "C", y.id) filter (where a.available > 0),
      coalesce(sum(a.expired), 0)
    into v_count, v_names, v_expired
    from public.warehouses y
    cross join lateral private.stock_at(i.id, y.id, p_issued_on) as a
    where y.org_id = v_org and y.archived_at is null and private.item_admissible(y.kind, i.kind) and public.in_scope_wh(y.id);
    if v_count = 0 then
      raise exception 'insufficient_stock' using hint = format('لا يوجد «%s» متاح في مخازن نطاقك بتاريخ %s: طلبت %s، وعندك %s.%s',
        i.name, to_char(p_issued_on, 'DD/MM/YYYY'), private.qty_text(p_qty, i.base_unit), private.qty_text(0, i.base_unit),
        case when v_expired > 0 then format(' وفي مخازنك %s منتهية الصلاحية لا تُصرف إلا بإتلاف أو مرتجع.', private.qty_text(v_expired, i.base_unit)) else '' end);
    end if;
    if v_count > 1 then
      raise exception 'store_required' using hint = format('«%s» موجودة في أكثر من مخزن في نطاقك: %s. اختر المخزن الذي تصرف منه.', i.name, v_names);
    end if;
    select y.* into w from public.warehouses y
    cross join lateral private.stock_at(i.id, y.id, p_issued_on) as a
    where y.org_id = v_org and y.archived_at is null and private.item_admissible(y.kind, i.kind) and public.in_scope_wh(y.id) and a.available > 0;
  end if;

  -- الأقفال بترتيبها، وكلّ فحص بعد قفله: قفل الفترة وصفّا الوحدتين (التاريخ: لا مستقبل ولا أقدم من 7 أيام ولا فترة مقفولة، 0018)، ثمّ
  -- صفّ الفوج للمشاركة (إغلاقه بلحظة الصرف ينتظر أو يُرى)، ثمّ المخزن والمادّة (المؤرشف يُرفض تحت قفله)، ثمّ الرصيد.
  for v_div in select d from unnest(array[w.division_id, f.division_id]) as d group by d order by d loop
    perform private.check_post_date(p_issued_on, v_div);
  end loop;
  select * into f from public.flocks y where y.org_id = v_org and y.id = p_flock for share;
  if f.status = 'closed' then
    raise exception 'flock_closed' using hint = format('فوج «%s» مغلق، فلا يُصرف له شيء.', h.name);
  end if;
  if f.status <> 'active' then
    raise exception 'flock_not_placed' using hint = format('فوج «%s» لم يُسكَّن بعد، فلا يُصرف له شيء.', h.name);
  end if;
  perform private.lock_masters(array[w.id], array[i.id], true);
  select * into i from public.items y where y.org_id = v_org and y.id = p_item;
  perform private.lock_balances(array[i.id], array[w.id]);
  select * into s from private.stock_at(i.id, w.id, p_issued_on);
  if s.available < p_qty then
    raise exception 'insufficient_stock' using hint = format('لا يكفي رصيد «%s» في «%s»: طلبت %s، وعندك %s بتاريخ %s.%s%s',
      i.name, w.name, private.qty_text(p_qty, i.base_unit), private.qty_text(s.available, i.base_unit), to_char(p_issued_on, 'DD/MM/YYYY'),
      case when s.expired > 0 then format(' وفي المخزن %s منتهية الصلاحية لا تُصرف إلا بإتلاف أو مرتجع.', private.qty_text(s.expired, i.base_unit)) else '' end,
      case when s.later > 0 then format(' و%s استُلمت بعد هذا التاريخ.', private.qty_text(s.later, i.base_unit)) else '' end);
  end if;

  -- السحب بترتيبه (القواعد ١٢–١٤) وحركاته، ثمّ العدّاد آخر شيء، ثمّ الرأس والسطر وسطر الكلفة بقيمة السحب بالضبط.
  for dr in select * from private.draw(i.id, w.id, p_qty, p_issued_on, null, false) loop
    perform private.apply_move(dr.lot_id, 'flock_issue', p_issue_id, p_line_id, -dr.qty, -dr.value, p_issued_on, null, coalesce(i.tracks_expiry, false));
    v_total := v_total + dr.value;
  end loop;
  v_no := private.next_doc_no('FI', p_issued_on);
  insert into public.flock_issues (id, org_id, doc_no, flock_id, hall_id, site_id, division_id, warehouse_id, issued_on, status, client_ref, posted_at, posted_by)
  values (p_issue_id, v_org, v_no, f.id, f.hall_id, f.site_id, f.division_id, w.id, p_issued_on, 'posted', p_client_ref, now(), auth.uid());
  insert into public.flock_issue_lines (id, org_id, issue_id, warehouse_id, site_id, line_no, item_id, qty_base, base_unit, density_kg_per_l, cost_kind)
  values (p_line_id, v_org, p_issue_id, w.id, f.site_id, 1, i.id, p_qty, i.base_unit, case when i.base_unit = 'L' then i.density_kg_per_l end, v_kind);
  insert into public.flock_costs (org_id, flock_id, site_id, kind, amount, doc_kind, doc_id, doc_line_id, on_date)
  values (v_org, f.id, f.site_id, v_kind, v_total, 'flock_issue', p_issue_id, p_line_id, p_issued_on);
  perform private.mark_division_posted(w.division_id);
  perform private.mark_division_posted(f.division_id);
  v_result := private.flock_issue_result(p_issue_id);
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;

-- ─── ز. إلغاء الصرف (void) ──────────────────────────────────────────────────────────────────────────────────────
-- كلّ سحب أصليّ ينعكس على دفعته نفسها بيوم الإلغاء (apply_move يرفض عكس سحب قبل تصحيح سعر حيّ أو قبل جرد معتمد)، وسطر الكلفة بصفّ
-- عكسيّ بإشارة معاكسة يشير إلى أصله (مرّة واحدة: reverses_id فريد). الأقفال: المرجع ← قفل الفترة ← رأس الصرف ← صفّ الفوج للمشاركة
-- (المغلق يُرفض) ← المخزن والمادّة ← الرصيد. النطاق: حقل الفوج ومخزن الصرف كلاهما (الكلفة تُكتب على الأوّل والمخزون في الثاني).
create or replace function public.void_flock_issue(p_issue_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_flock_issue';
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_cached jsonb;
  v_reason text;
  x public.flock_issues;
  f public.flocks;
  w public.warehouses;
  m public.stock_moves;
  c public.flock_costs;
  v_items uuid[];
  v_back int := 0;
  v_value numeric := 0;
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_issue_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into x from public.flock_issues y where y.org_id = v_org and y.id = p_issue_id;
  if x.id is null then
    raise exception 'doc_not_found' using hint = 'هذا الصرف غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(x.site_id) then
    raise exception 'out_of_scope' using hint = 'قاعة هذا الصرف خارج نطاقك، فلا تلغيه. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  w := private.stock_wh(x.warehouse_id, true);
  perform private.check_void_date();
  select * into x from public.flock_issues y where y.org_id = v_org and y.id = p_issue_id for update;
  if x.status = 'void' then
    raise exception 'already_void' using hint = format('الصرف %s ملغى من قبل.', x.doc_no);
  end if;
  select * into f from public.flocks y where y.org_id = v_org and y.id = x.flock_id for share;
  if f.status = 'closed' then
    raise exception 'flock_closed' using hint = format('الفوج مغلق، فلا يُلغى الصرف %s له.', x.doc_no);
  end if;
  select array_agg(distinct y.item_id) into v_items from public.flock_issue_lines y where y.org_id = x.org_id and y.issue_id = x.id;
  perform private.lock_masters(array[w.id], v_items, false);
  perform private.lock_balances(v_items, array_fill(w.id, array[cardinality(v_items)]));
  for m in
    select z.* from public.stock_moves z
    where z.org_id = x.org_id and z.doc_kind = 'flock_issue' and z.doc_id = x.id and z.reverses_move_id is null
    order by z.item_id, z.seq
  loop
    perform private.apply_move(m.lot_id, 'flock_issue', x.id, m.doc_line_id, -m.qty, -m.value, v_today, m.id);
    v_back := v_back + 1;
  end loop;
  for c in
    select z.* from public.flock_costs z
    where z.org_id = x.org_id and z.doc_kind = 'flock_issue' and z.doc_id = x.id and z.reverses_id is null
    order by z.doc_line_id, z.id
  loop
    insert into public.flock_costs (org_id, flock_id, site_id, kind, amount, doc_kind, doc_id, doc_line_id, on_date, expense_id, reverses_id)
    values (c.org_id, c.flock_id, c.site_id, c.kind, -c.amount, c.doc_kind, c.doc_id, c.doc_line_id, v_today, c.expense_id, c.id);
    v_value := v_value + c.amount;
  end loop;
  update public.flock_issues set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason, version = version + 1
  where org_id = x.org_id and id = x.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', x.id, 'doc_no', x.doc_no, 'status', 'void', 'flock_id', x.flock_id,
    'voided_on', v_today, 'reversed_moves', v_back, 'money', jsonb_build_object('value', v_value::text)));
end
$$;

-- ─── ح. القارئان (read، بنطاق حقل الفوج) ────────────────────────────────────────────────────────────────────────
-- «ما يُصرف» للفوج: كلّ مادّة فعّالة تُصرف للفوج ولها متاح بتاريخ اليوم (مستلم بيومه أو قبله وغير منتهٍ، القاعدة ١٤) في مخازن نطاق القارئ
-- الفعّالة، بمجموعها ومخازنها بكمياتها؛ المنتَج في المعمل أوّلاً (دفعة إنتاج أو مادّة ناتج خلطة فعّالة)، ثمّ العلف، ثمّ بقية «علف» الكلفة،
-- ثمّ الاسم. بلا مال. can_issue = issue.post والفوج قائم؛ وearliest_on أقدم تاريخ يقبله الصرف (7 أيام، والتسكين، والفترة المقفولة).
create or replace function public.flock_issue_options(p_flock uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_lock date;
  f public.flocks;
  h public.halls;
  s public.sites;
  v_items jsonb;
begin
  perform private.require('read');
  select * into f from public.flocks x where x.org_id = v_org and x.id = p_flock;
  if f.id is null then
    raise exception 'flock_not_found' using hint = 'هذا الفوج غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(f.site_id) then
    raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك.';
  end if;
  select * into h from public.halls x where x.org_id = f.org_id and x.id = f.hall_id;
  select * into s from public.sites x where x.org_id = f.org_id and x.id = f.site_id;
  select l.locked_through into v_lock from public.period_locks l where l.org_id = v_org;
  with av as (
    select l.item_id, l.warehouse_id, sum(l.qty_left) as qty
    from public.stock_lots l
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    join public.warehouses w on w.org_id = l.org_id and w.id = l.warehouse_id
    where l.org_id = v_org and l.qty_left > 0 and l.received_on <= v_today and not private.lot_expired(i.tracks_expiry, l.expiry_on, v_today)
      and i.archived_at is null and private.flock_cost_kind(i.kind) is not null and w.archived_at is null and public.in_scope_wh(w.id)
    group by l.item_id, l.warehouse_id
  ), per_item as (
    select a.item_id, sum(a.qty) as qty,
      jsonb_agg(jsonb_build_object('warehouse_id', w.id, 'name', w.name, 'qty', a.qty::text) order by a.qty desc, w.name collate "C", w.id) as stores
    from av a join public.warehouses w on w.org_id = v_org and w.id = a.warehouse_id
    group by a.item_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'name', i.name, 'kind', i.kind, 'cost_kind', private.flock_cost_kind(i.kind),
      'base_unit', i.base_unit, 'density_kg_per_l', i.density_kg_per_l::text, 'on_hand_qty', p.qty::text, 'made_in_mill', k.made,
      'stores', p.stores)
    order by k.made desc, (i.kind = 'feed') desc, (private.flock_cost_kind(i.kind) = 'feed') desc, i.name_norm collate "C", i.id), '[]'::jsonb)
  into v_items
  from per_item p
  join public.items i on i.org_id = v_org and i.id = p.item_id
  cross join lateral (
    select exists (select 1 from public.stock_lots z where z.org_id = v_org and z.item_id = i.id and z.source_kind = 'production')
      or exists (select 1 from public.recipes r where r.org_id = v_org and r.output_item_id = i.id and r.archived_at is null) as made
  ) as k;
  return jsonb_build_object('flock_id', f.id, 'flock_status', f.status, 'hall_id', h.id, 'hall_name', h.name, 'site_id', s.id, 'site_name', s.name,
    'placed_on', f.placed_on, 'today', v_today, 'earliest_on', greatest(v_today - 7, f.placed_on, v_lock + 1),
    'can_issue', public.can('issue.post') and f.status = 'active', 'items', v_items);
end
$$;

-- «علف القاعة»: المصروف من العلف بالكيلو (الصرف المرحَّل غير الملغى بنوع كلفة feed: الكيلو كما هو، واللتر بلقطة الكثافة، والقطعة خارجه،
-- واللتر بلا كثافة يُعدّ في unweighed_feed_lines)، والمستهلك المسجّل بالجولات اليومية، والباقي = الفرق (قد يكون سالباً)؛ وسطر لكلّ صرف
-- الأحدث أوّلاً بقيمته داخل money، ومجموع قيمة الصرف الصافي داخل money. المال يُقنَّع لغير أدوار الكلفة بـprivate.mask.
create or replace function public.flock_feed(p_flock uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  f public.flocks;
  h public.halls;
  v_issued numeric;
  v_unweighed int;
  v_consumed numeric;
  v_value numeric;
  v_rows jsonb;
  v_count int;
begin
  perform private.require('read');
  select * into f from public.flocks x where x.org_id = v_org and x.id = p_flock;
  if f.id is null then
    raise exception 'flock_not_found' using hint = 'هذا الفوج غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(f.site_id) then
    raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك.';
  end if;
  select * into h from public.halls x where x.org_id = f.org_id and x.id = f.hall_id;
  select coalesce(sum(private.issue_mass_kg(y.qty_base, y.base_unit, y.density_kg_per_l)), 0),
    (count(*) filter (where y.base_unit <> 'pc' and private.issue_mass_kg(y.qty_base, y.base_unit, y.density_kg_per_l) is null))::int
  into v_issued, v_unweighed
  from public.flock_issues x join public.flock_issue_lines y on y.org_id = x.org_id and y.issue_id = x.id
  where x.org_id = v_org and x.flock_id = f.id and x.status = 'posted' and y.cost_kind = 'feed';
  select coalesce(sum(d.feed_kg), 0) into v_consumed from public.flock_daily d where d.org_id = v_org and d.flock_id = f.id;
  select coalesce(sum(c.amount), 0) into v_value from public.flock_costs c where c.org_id = v_org and c.flock_id = f.id and c.doc_kind = 'flock_issue';
  with listed as (
    select x.id, x.doc_no, x.issued_on, x.status, x.posted_at, x.void_reason, x.warehouse_id, w.name as warehouse_name,
      y.item_id, i.name as item_name, y.cost_kind, y.qty_base, y.base_unit, c.amount, r.on_date as voided_on,
      row_number() over (order by x.issued_on desc, x.posted_at desc, x.id desc) as n
    from public.flock_issues x
    join public.flock_issue_lines y on y.org_id = x.org_id and y.issue_id = x.id and y.line_no = 1
    join public.items i on i.org_id = y.org_id and i.id = y.item_id
    join public.warehouses w on w.org_id = x.org_id and w.id = x.warehouse_id
    left join public.flock_costs c on c.org_id = x.org_id and c.doc_kind = 'flock_issue' and c.doc_id = x.id and c.doc_line_id = y.id
      and c.reverses_id is null
    left join public.flock_costs r on r.org_id = c.org_id and r.reverses_id = c.id
    where x.org_id = v_org and x.flock_id = f.id
  )
  select count(*)::int, coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'doc_no', o.doc_no, 'issued_on', o.issued_on, 'status', o.status,
      'item_id', o.item_id, 'item_name', o.item_name, 'cost_kind', o.cost_kind, 'qty', o.qty_base::text, 'base_unit', o.base_unit,
      'warehouse_id', o.warehouse_id, 'warehouse_name', o.warehouse_name, 'voided_on', o.voided_on, 'void_reason', o.void_reason,
      'money', jsonb_build_object('value', o.amount::text)) order by o.n) filter (where o.n <= 500), '[]'::jsonb)
  into v_count, v_rows
  from listed o;
  return private.mask(jsonb_build_object('flock_id', f.id, 'flock_status', f.status, 'hall_id', h.id, 'hall_name', h.name, 'today', public.app_today(),
    'issued_feed_kg', round(v_issued, 3)::text, 'consumed_feed_kg', round(v_consumed, 3)::text, 'remaining_feed_kg', round(v_issued - v_consumed, 3)::text,
    'unweighed_feed_lines', v_unweighed, 'issues', v_rows, 'more', v_count > 500,
    'can_void', public.can('void') and f.status <> 'closed',
    'money', jsonb_build_object('issued_value', v_value::text)));
end
$$;

-- ─── ط. الثوابت ──────────────────────────────────────────────────────────────────────────────────────────────────
-- حفظ القيمة (الفحص 8) يحسب الصرف للفوج خارجاً بقيمته، وترتيب السحب (الفحص 10) يحكمه (0016 كما هو ويّا الموضعين).
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
  --    flock_issue)، والملغى صفر (حركاته معكوسة وكلفته بصفّ عكسي).
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
      + coalesce((select sum(c.amount) from public.flock_costs c where c.org_id = o.id and c.doc_kind = 'flock_issue'), 0) as outputs
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
  -- 10. ترتيب السحب (القاعدة 12): وقت كل قطعة سحب أصلية بالتحويل والصرف والجرد والصرف لفوج (0019) ماكو دفعة قبلها بالترتيب (الانتهاء والفارغ أخيراً،
  --     ثم fifo_seq، ثم المعرّف) مؤهّلة بتاريخ السحب (مستلمة بيه أو قبله، وغير منتهية للسحب اللي طبّق قاعدة الانتهاء) وبيها متبقٍّ
  --     قبل القطعة. نقص الجرد المنتهي (expiry_checked = false) يشوف كل الدفعات مؤهّلة، والصالحة كلها بعد المنتهية بالترتيب، فيبقى
  --     الأقدم انتهاءً أوّلاً. السحب من دفعة مسمّاة (إذن المنتهي والإتلاف، والمرتجع WP7) برّا الفحص.
  select 'draw_order', count(*) from public.stock_moves m
  join public.stock_lots l on l.org_id = m.org_id and l.id = m.lot_id
  where m.qty < 0 and m.reverses_move_id is null and m.doc_kind in ('transfer', 'stock_use', 'count', 'flock_issue')
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

create or replace function public.verify_flock_issues() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  -- ١) رأس الصرف بقاعة فوجه وحقله ووحدته، وتاريخه لا يسبق التسكين، وله سطر واحد على الأقلّ.
  select 'issue_shape'::text, count(*) from public.flock_issues x
  left join public.flocks f on f.org_id = x.org_id and f.id = x.flock_id
  where f.id is null or x.hall_id <> f.hall_id or x.site_id <> f.site_id or x.division_id <> f.division_id
    or f.placed_on is null or x.issued_on < f.placed_on
    or not exists (select 1 from public.flock_issue_lines y where y.org_id = x.org_id and y.issue_id = x.id)
  union all
  -- ٢) لقطة السطر: وحدة الأساس وحدة المادّة (ثابتة بعد أوّل حركة)، ونوع الكلفة من نوع المادّة، والمادّة تُصرف للفوج.
  select 'issue_line_snapshot', count(*) from public.flock_issue_lines y
  join public.items i on i.org_id = y.org_id and i.id = y.item_id
  where y.base_unit <> i.base_unit or private.flock_cost_kind(i.kind) is distinct from y.cost_kind
  union all
  -- ٣) السطر = حركاته: سحب أصليّ بكميته بالضبط من مخزن الرأس بمادّته ويومه (قطعة واحدة على الأقلّ، وكلّها سالبة)؛ والمرحَّل بلا عكسية،
  --    والملغى كلّ أصلية منه معكوسة؛ وكلّ حركة flock_issue بسطر من صرف موجود بمادّته ومخزنه، أصليتها سالبة، وعكسيتها لصرف ملغى.
  select 'issue_moves', count(*) from (
    select y.id from public.flock_issue_lines y
    join public.flock_issues x on x.org_id = y.org_id and x.id = y.issue_id
    cross join lateral (
      select coalesce(sum(-m.qty), 0) as drawn, count(*) as pieces,
        count(*) filter (where m.qty >= 0 or m.item_id <> y.item_id or m.warehouse_id <> x.warehouse_id or m.moved_on <> x.issued_on) as foreign_pieces,
        count(*) filter (where exists (select 1 from public.stock_moves r where r.org_id = m.org_id and r.reverses_move_id = m.id)) as reversed
      from public.stock_moves m
      where m.org_id = y.org_id and m.doc_kind = 'flock_issue' and m.doc_id = x.id and m.doc_line_id = y.id and m.reverses_move_id is null
    ) as s
    where s.drawn <> y.qty_base or s.pieces = 0 or s.foreign_pieces > 0
      or (x.status = 'posted' and s.reversed > 0) or (x.status = 'void' and s.reversed <> s.pieces)
    union all
    select m.id from public.stock_moves m
    left join public.flock_issues x on x.org_id = m.org_id and x.id = m.doc_id
    left join public.flock_issue_lines y on y.org_id = m.org_id and y.id = m.doc_line_id and y.issue_id = m.doc_id
    where m.doc_kind = 'flock_issue'
      and (x.id is null or y.id is null or m.item_id <> y.item_id or m.warehouse_id <> x.warehouse_id
        or (m.reverses_move_id is null and m.qty >= 0)
        or (m.reverses_move_id is not null and x.status <> 'void'))
  ) as v
  union all
  -- ٤) كلفة الفوج = قيمة السحب: لكلّ سطر صفّ كلفة أصليّ واحد بفوج الرأس وحقله ويومه ونوع كلفة السطر وبلا مصروف، مبلغه = −Σ قيم سحبه
  --    الأصليّ؛ والمرحَّل بلا عكسيّ، والملغى بعكسيّ واحد؛ وكلّ صفّ كلفة flock_issue بسطر صرف موجود.
  select 'issue_costs', count(*) from (
    select y.id from public.flock_issue_lines y
    join public.flock_issues x on x.org_id = y.org_id and x.id = y.issue_id
    cross join lateral (
      select count(*) as n,
        count(*) filter (where c.flock_id = x.flock_id and c.site_id = x.site_id and c.kind = y.cost_kind and c.on_date = x.issued_on
          and c.expense_id is null
          and c.amount = (select coalesce(sum(-m.value), 0) from public.stock_moves m where m.org_id = y.org_id and m.doc_kind = 'flock_issue'
            and m.doc_id = x.id and m.doc_line_id = y.id and m.reverses_move_id is null)) as good,
        coalesce(sum((select count(*) from public.flock_costs r where r.org_id = c.org_id and r.reverses_id = c.id)), 0) as reversed
      from public.flock_costs c
      where c.org_id = y.org_id and c.doc_kind = 'flock_issue' and c.doc_id = x.id and c.doc_line_id = y.id and c.reverses_id is null
    ) as k
    where k.n <> 1 or k.good <> 1 or (x.status = 'posted' and k.reversed <> 0) or (x.status = 'void' and k.reversed <> 1)
    union all
    select c.id from public.flock_costs c
    left join public.flock_issue_lines y on y.org_id = c.org_id and y.id = c.doc_line_id and y.issue_id = c.doc_id
    where c.doc_kind = 'flock_issue' and y.id is null
  ) as v
  union all
  -- ٥) كلّ صفّ عكسيّ يعكس أصلاً ليس عكسياً، بمبلغه المعاكس وفوجه وحقله ونوعه ومستنده وسطره ومصروفه.
  select 'cost_reversals', count(*) from public.flock_costs r
  left join public.flock_costs o on o.org_id = r.org_id and o.id = r.reverses_id
  where r.reverses_id is not null
    and (o.id is null or o.reverses_id is not null or o.amount <> -r.amount or o.flock_id <> r.flock_id or o.site_id <> r.site_id
      or o.kind <> r.kind or o.doc_kind <> r.doc_kind or o.doc_id <> r.doc_id or o.doc_line_id is distinct from r.doc_line_id
      or o.expense_id is distinct from r.expense_id)
  union all
  -- ٦) حقل صفّ الكلفة حقل فوجه (سياسة القراءة بعمود الصفّ).
  select 'cost_flock_site', count(*) from public.flock_costs c
  left join public.flocks f on f.org_id = c.org_id and f.id = c.flock_id
  where f.id is null or c.site_id <> f.site_id
$$;

-- ─── ي. الصلاحيات ───────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.record_flock_issue(uuid, uuid, uuid, uuid, uuid, numeric, date, uuid), public.void_flock_issue(uuid, text, uuid),
  public.flock_issue_options(uuid), public.flock_feed(uuid), public.verify_flock_issues()
  from public, anon;
grant execute on function public.record_flock_issue(uuid, uuid, uuid, uuid, uuid, numeric, date, uuid), public.void_flock_issue(uuid, text, uuid),
  public.flock_issue_options(uuid), public.flock_feed(uuid) to authenticated;
revoke all on function public.verify_flock_issues() from authenticated;
grant execute on function public.verify_flock_issues() to service_role;
