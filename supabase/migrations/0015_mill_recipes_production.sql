-- 0015_mill_recipes_production — معمل العلف، النسخة الأولى: العلائق (الخلطات) ودفعة الإنتاج
--   (كلمة المالك 2026-11-03: «طوّر لي مصنع العلف الذي نقدر من خلاله نسوي خلطات، بحيث من المواد التي في المخزن نسوي
--   تشكيلة ثابتة نحدّدها، وكلّ ما ندوس إنتاج يسوي استهلاكاً بنفس الكميات حسب ما حدّدنا، ويسوي لنا مادّة منتجة بكذا
--   تاريخ وبكذا كمية»؛ FOUNDATION ٨٥، ٩٦، ٩٩، ١٢٨، ٣٤٠–٣٥٠، ٤٣٦، ٤٤٣، ٤٨١–٤٨٦، ٥٢٦، ٥٣٤–٥٣٥، ٥٥٨–٥٦١).
-- المشكلة: وحدة المعمل تستلم المواد الأوّلية وتحوّلها بين مخازنها، ولا طريق لتحويل المواد إلى علف: لا خلطة تُعرَّف، ولا
--   دفعة إنتاج تسحب مدخلاتها وتُنشئ دفعة الناتج بكلفتها. فالعلف الذي يصل الحقل إمّا مشترى جاهزاً أو غير موجود، وكلفة
--   الكيلو المنتَج لا تُعرف.
-- هنا: recipes وrecipe_versions وrecipe_lines (كتابة مباشرة للمسوّدة بفعل recipe.activate، والتفعيل يجمّد النسخة ويقاعد
--   السابقة: activate_recipe_version)، وproduction_batches وproduction_inputs (المسوّدة ولقطتها) وproduction_values
--   وproduction_input_values (المال، دالّة فقط وسياسة الكلفة المقيِّدة)، وcreate_production (لقطة العليقة والكثافة
--   ووحدة الأساس والكميات المخطّطة) وpreview_production (خطّة السحب وبصمتها والهدر قبل الترحيل)
--   وconfirm_production_costs (ختم الكلف) وpost_production (السحب والكلفة ودفعة الناتج والهدر) وvoid_production
--   (المواد ترجع لدفعاتها ودفعة الناتج تُلغى)، والقرّاء recipes_overview وrecipe_detail وproductions_overview
--   وproduction_detail، وverify_mill. والقاعدتان ٢١ و٢٢: قيمة دفعة الناتج = الكلفة بالضبط، والهدر = كتلة المدخلات −
--   وزن الناتج ونسبته تُقارن بالمدى (صفر إلى ٣٪) وخارجه يحتاج سبباً.
-- انحرافات مكتوبة (النسخة الأولى، والباقي في DECISIONS): لا كلف يدوية (production_costs وأجور وكهرباء محمّلة على مصروف
--   مسجّل، القاعدة ٢٠): extra_value = 0 دائماً وconfirm_production_costs يختم «بلا كلف»، فالختم باب النسخة الثانية
--   وليس ميزةً اليوم؛ ولا مواد بديلة (is_substitute وreason عمودان جاهزان ولا تكتبهما دالّة)؛ ولا أكياس ولا وقود
--   مدخلاتٍ إضافية (in_basis عمود جاهز وكلّ مدخل اليوم من العليقة)؛ وسطر العليقة بالكيلو أو اللتر فقط (مادّة وحدة
--   أساسها «قطعة» تُرفض: bad_recipe_unit)؛ وplanned_kg لا يُعدَّل بعد الإنشاء (اللقطة مبنيّة عليه، والتعديل طيّ المسوّدة
--   وإنشاء غيرها)؛ ولا بيع علف (المرحلة الثالثة).
-- تراجع: rollback_0015.sql — يرجّع أجسام private.draft_header_guard (كما في ٠٠٠٧) وprivate.stock_doc_memo (كما في
--   ٠٠١٤) وprivate.stock_doc_label وdiscard_draft وdelete_draft_line (كما في ٠٠١٠) حرفاً بحرف، ويرجّع قيود
--   stock_lots_source_kind_check وstock_moves_doc_kind_check بلا 'production'، ويُسقط الجداول السبعة ودوالّها.
--   **طريق رفض**: أيّ دفعة إنتاج مرحّلة (أو حركة مخزون نوعها production) توقف التراجع بصوت بلا أن يحذف شيئاً، لأنّ
--   إسقاط الجداول يمسح كلفة الناتج ومصدره؛ وأيّ خلطة أو نسخة موجودة توقفه كذلك.
-- تنعاد بأمان: create table if not exists، وcreate or replace، وكتل do تفحص الكتالوج قبل السياسات والقيود.

set lock_timeout = '5s';

-- ─── أ-1. الخلطة (FOUNDATION ٣٤٠): اسم، ومادّة الناتج، والأرشفة ───────────────────────────────────────────────────
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  name text not null,
  name_norm text not null default '',
  output_item_id uuid not null,
  note text,
  archived_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint recipes_name_check check (length(btrim(name)) between 1 and 80),
  -- اسم من تطويل أو تشكيل فقط يُفرغ name_norm (مثل المواد، ٠٠٠٥): يُرفض هنا لا يمرّ صامتاً.
  constraint recipes_name_norm_check check (name_norm <> ''),
  constraint recipes_note_check check (note is null or length(btrim(note)) between 1 and 500),
  constraint recipes_version_check check (version >= 1),
  unique (org_id, id),
  foreign key (org_id, output_item_id) references public.items (org_id, id)
);
create index if not exists recipes_output_item on public.recipes (org_id, output_item_id);
create index if not exists recipes_name_norm on public.recipes (org_id, name_norm collate "C", id);
create unique index if not exists recipes_live_name on public.recipes (org_id, name_norm) where archived_at is null;

-- ─── أ-2. نسخة الخلطة (FOUNDATION ٣٤١): مسوّدة تُعدَّل، ثمّ تُفعَّل فتُجمَّد، والسابقة تُقاعد ──────────────────────────
create table if not exists public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  recipe_id uuid not null,
  version_no int not null,
  basis_kg numeric not null default 1000,
  status text not null default 'draft',
  note text,
  activated_at timestamptz,
  activated_by uuid,
  retired_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint recipe_versions_basis_check check (abs(basis_kg) < 'Infinity' and basis_kg > 0 and basis_kg = round(basis_kg, 3)),
  constraint recipe_versions_status_check check (status in ('draft', 'active', 'retired')),
  constraint recipe_versions_version_no_check check (version_no >= 1),
  constraint recipe_versions_note_check check (note is null or length(btrim(note)) between 1 and 500),
  constraint recipe_versions_version_check check (version >= 1),
  -- المسوّدة بلا ختم تفعيل، والمفعَّلة والمقاعدة بختمه؛ والمقاعدة وحدها بختم تقاعد.
  constraint recipe_versions_stamp_check check ((status = 'draft') = (activated_at is null) and (activated_at is null) = (activated_by is null)
    and (status = 'retired') = (retired_at is not null)),
  unique (org_id, id),
  unique (org_id, recipe_id, version_no),
  foreign key (org_id, recipe_id) references public.recipes (org_id, id)
);
-- نسخة مفعَّلة واحدة لكلّ خلطة (FOUNDATION ٥٥٨: التفعيل يقاعد القديمة)، ومسوّدة واحدة تُعدَّل.
create unique index if not exists recipe_versions_one_active on public.recipe_versions (org_id, recipe_id) where status = 'active';
create unique index if not exists recipe_versions_one_draft on public.recipe_versions (org_id, recipe_id) where status = 'draft';

-- ─── أ-3. سطر العليقة (FOUNDATION ٣٤٢): الكمية بالكيلو أو اللتر لكلّ basis_kg، والكثافة لقطة لحظة التفعيل ──────────────
create table if not exists public.recipe_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  version_id uuid not null,
  line_no int not null,
  item_id uuid not null,
  qty numeric not null,
  unit text not null,
  density_kg_per_l numeric,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint recipe_lines_qty_check check (abs(qty) < 'Infinity' and qty > 0 and qty = round(qty, 3)),
  constraint recipe_lines_unit_check check (unit in ('kg', 'L')),
  constraint recipe_lines_density_check check (density_kg_per_l is null or (abs(density_kg_per_l) < 'Infinity' and density_kg_per_l > 0 and density_kg_per_l = round(density_kg_per_l, 4))),
  constraint recipe_lines_line_no_check check (line_no >= 1),
  unique (org_id, id),
  unique (org_id, version_id, line_no),
  -- مادّة مكرّرة في نسخة واحدة مرفوضة (FOUNDATION ٥٥٨)، والحارس يسمّيها قبل أن يصل القيد.
  unique (org_id, version_id, item_id),
  foreign key (org_id, version_id) references public.recipe_versions (org_id, id),
  foreign key (org_id, item_id) references public.items (org_id, id)
);
create index if not exists recipe_lines_item on public.recipe_lines (org_id, item_id);

-- ─── أ-4. دفعة الإنتاج (FOUNDATION ٣٤٣): رأس مسوّدة، ثمّ ترحيل يسحب ويُنشئ دفعة الناتج ───────────────────────────────
-- بلا عمود مال: الكلفة في production_values بسياسة الكلفة المقيِّدة، فمشغّل المعمل يقرأ دفعته ولا يقرأ كلفتها (E2).
create table if not exists public.production_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  doc_no text,
  recipe_version_id uuid not null,
  output_item_id uuid not null,
  input_warehouse_id uuid not null,
  output_warehouse_id uuid not null,
  planned_kg numeric not null,
  produced_on date not null,
  output_qty_kg numeric,
  output_expiry_on date,
  input_mass_kg numeric,
  shrink_kg numeric,
  shrink_reason text,
  output_lot_id uuid,
  costs_confirmed_at timestamptz,
  costs_confirmed_by uuid,
  note text,
  status text not null default 'draft',
  version int not null default 1,
  client_ref uuid,
  posted_at timestamptz,
  posted_by uuid,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint production_batches_planned_check check (abs(planned_kg) < 'Infinity' and planned_kg > 0 and planned_kg = round(planned_kg, 3)),
  constraint production_batches_output_qty_check check (output_qty_kg is null or (abs(output_qty_kg) < 'Infinity' and output_qty_kg > 0 and output_qty_kg = round(output_qty_kg, 3))),
  constraint production_batches_input_mass_check check (input_mass_kg is null or (abs(input_mass_kg) < 'Infinity' and input_mass_kg > 0 and input_mass_kg = round(input_mass_kg, 3))),
  constraint production_batches_shrink_check check (shrink_kg is null or (abs(shrink_kg) < 'Infinity' and shrink_kg = round(shrink_kg, 3))),
  constraint production_batches_status_check check (status in ('draft', 'posted', 'void')),
  constraint production_batches_version_check check (version >= 1),
  constraint production_batches_note_check check (note is null or length(btrim(note)) between 1 and 500),
  constraint production_batches_shrink_reason_check check (shrink_reason is null or length(btrim(shrink_reason)) between 3 and 500),
  constraint production_batches_void_reason_check check (void_reason is null or length(btrim(void_reason)) between 3 and 500),
  -- المسوّدة بلا رقم ولا ختم ترحيل ولا مرجع ولا دفعة ناتج ولا كتلة مدخلات ولا هدر (ووزن الناتج يُكتب فيها قبل الترحيل).
  constraint production_batches_draft_check check (status <> 'draft' or (posted_at is null and doc_no is null and client_ref is null
    and output_lot_id is null and input_mass_kg is null and shrink_kg is null)),
  -- والمرحَّل كلّها عنده؛ والملغى يحفظ ما كان، فالملغى من مسوّدة (طيّ) يبقى بلا شيء منها.
  constraint production_batches_posted_check check (status <> 'posted' or (posted_at is not null and doc_no is not null and client_ref is not null
    and output_lot_id is not null and output_qty_kg is not null and input_mass_kg is not null and shrink_kg is not null)),
  constraint production_batches_void_check check ((status = 'void') = (voided_at is not null) and (void_reason is null or status = 'void')),
  constraint production_batches_stores_check check (input_warehouse_id <> output_warehouse_id),
  constraint production_batches_costs_check check ((costs_confirmed_at is null) = (costs_confirmed_by is null)),
  unique (org_id, id),
  unique (org_id, doc_no),
  foreign key (org_id, recipe_version_id) references public.recipe_versions (org_id, id),
  foreign key (org_id, output_item_id) references public.items (org_id, id),
  foreign key (org_id, input_warehouse_id) references public.warehouses (org_id, id),
  foreign key (org_id, output_warehouse_id) references public.warehouses (org_id, id),
  foreign key (org_id, output_lot_id) references public.stock_lots (org_id, id)
);
create index if not exists production_batches_version on public.production_batches (org_id, recipe_version_id);
create index if not exists production_batches_day on public.production_batches (org_id, produced_on desc, id);
create index if not exists production_batches_input_wh on public.production_batches (org_id, input_warehouse_id);
create index if not exists production_batches_output_wh on public.production_batches (org_id, output_warehouse_id);
create index if not exists production_batches_output_item on public.production_batches (org_id, output_item_id);
create index if not exists production_batches_output_lot on public.production_batches (org_id, output_lot_id);

-- ─── أ-5. مدخلات الدفعة (FOUNDATION ٣٤٦): لقطة العليقة، والمخطّط، والفعلي الموزون ────────────────────────────────────
-- لقطة وحدة الأساس والكثافة على السطر (درس WP6، E46): تغيير المادّة بعد المسوّدة لا يغيّر ما حُسب، والترحيل يقارنها
-- بعد قفل المادّة. in_basis: الداخل في كتلة العليقة (الهدر يُحسب عليه، القاعدة ٢٢)؛ وكلّ مدخل في هذه النسخة من العليقة.
create table if not exists public.production_inputs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  batch_id uuid not null,
  line_no int not null,
  item_id uuid not null,
  base_unit text not null,
  density_kg_per_l numeric,
  planned_qty_base numeric not null,
  planned_mass_kg numeric not null,
  actual_qty_base numeric,
  in_basis boolean not null default true,
  is_substitute boolean not null default false,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint production_inputs_base_unit_check check (base_unit in ('kg', 'L')),
  constraint production_inputs_density_check check ((base_unit = 'L') = (density_kg_per_l is not null)
    and (density_kg_per_l is null or (abs(density_kg_per_l) < 'Infinity' and density_kg_per_l > 0 and density_kg_per_l = round(density_kg_per_l, 4)))),
  constraint production_inputs_planned_check check (abs(planned_qty_base) < 'Infinity' and planned_qty_base > 0 and planned_qty_base = round(planned_qty_base, 3)),
  constraint production_inputs_planned_mass_check check (abs(planned_mass_kg) < 'Infinity' and planned_mass_kg > 0 and planned_mass_kg = round(planned_mass_kg, 3)),
  constraint production_inputs_actual_check check (actual_qty_base is null or (abs(actual_qty_base) < 'Infinity' and actual_qty_base > 0 and actual_qty_base = round(actual_qty_base, 3))),
  constraint production_inputs_reason_check check (reason is null or length(btrim(reason)) between 3 and 500),
  constraint production_inputs_line_no_check check (line_no >= 1),
  unique (org_id, id),
  unique (org_id, batch_id, line_no),
  foreign key (org_id, batch_id) references public.production_batches (org_id, id),
  foreign key (org_id, item_id) references public.items (org_id, id)
);
create index if not exists production_inputs_item on public.production_inputs (org_id, item_id);

-- ─── أ-6. مال الدفعة (FOUNDATION ٣٤٨–٣٤٩): جارٍ محسوب، دالّة فقط، وسياسة الكلفة المقيِّدة ───────────────────────────
create table if not exists public.production_values (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  batch_id uuid not null,
  input_value numeric not null default 0,
  extra_value numeric not null default 0,
  total_value numeric not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint production_values_input_check check (abs(input_value) < 'Infinity' and input_value >= 0 and input_value = round(input_value, 2)),
  constraint production_values_extra_check check (abs(extra_value) < 'Infinity' and extra_value >= 0 and extra_value = round(extra_value, 2)),
  constraint production_values_total_check check (abs(total_value) < 'Infinity' and total_value >= 0 and total_value = round(total_value, 2) and total_value = input_value + extra_value),
  unique (org_id, id),
  unique (org_id, batch_id),
  foreign key (org_id, batch_id) references public.production_batches (org_id, id)
);

create table if not exists public.production_input_values (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  input_id uuid not null,
  batch_id uuid not null,
  value numeric not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint production_input_values_value_check check (abs(value) < 'Infinity' and value >= 0 and value = round(value, 2)),
  unique (org_id, id),
  unique (org_id, input_id),
  foreign key (org_id, input_id) references public.production_inputs (org_id, id),
  foreign key (org_id, batch_id) references public.production_batches (org_id, id)
);
create index if not exists production_input_values_batch on public.production_input_values (org_id, batch_id);

create or replace trigger audit_recipes after insert or update or delete on public.recipes
  for each row execute function private.audit_row();
create or replace trigger audit_recipe_versions after insert or update or delete on public.recipe_versions
  for each row execute function private.audit_row();
create or replace trigger audit_recipe_lines after insert or update or delete on public.recipe_lines
  for each row execute function private.audit_row();
create or replace trigger audit_production_batches after insert or update or delete on public.production_batches
  for each row execute function private.audit_row();
create or replace trigger audit_production_inputs after insert or update or delete on public.production_inputs
  for each row execute function private.audit_row();
create or replace trigger audit_production_values after insert or update or delete on public.production_values
  for each row execute function private.audit_row();
create or replace trigger audit_production_input_values after insert or update or delete on public.production_input_values
  for each row execute function private.audit_row();

-- ─── ب. RLS والامتيازات ─────────────────────────────────────────────────────────────────────────────────────────
-- الخلطة ونسخها وسطورها: قراءة للمنشأة (بلا مال)، وكتابة مباشرة للمسوّدة بفعل recipe.activate (المالك والمدير).
-- الدفعة ومدخلاتها: قراءة بنطاق مخزن المدخلات، وتعديل محدود على المسوّدة (التاريخ ووزن الناتج وسببه والملاحظة، والفعلي
-- على السطر) بفعل production.draft. والمال: قراءة بسياسة الكلفة المقيِّدة، ولا كتابة لأحد.
alter table public.recipes enable row level security;
alter table public.recipe_versions enable row level security;
alter table public.recipe_lines enable row level security;
alter table public.production_batches enable row level security;
alter table public.production_inputs enable row level security;
alter table public.production_values enable row level security;
alter table public.production_input_values enable row level security;

do $$
declare
  t text;
  v_recipe text := 'org_id = (select public.auth_org()) and (select public.can(''recipe.activate''))';
  -- رأس مسوّدة: السياسة تشرط status = 'draft' (§٢.١٠)، فالحارس المشترك لا يحتاج أن يفحص الحالة في التعديل المباشر.
  v_batch text := 'org_id = (select public.auth_org()) and status = ''draft'' and (select public.can(''production.draft''))'
    || ' and (select public.in_scope_wh(input_warehouse_id))';
  v_input text := 'org_id = (select public.auth_org()) and (select public.can(''production.draft''))';
begin
  foreach t in array array['recipes', 'recipe_versions', 'recipe_lines'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_read') then
      execute format('create policy %I on public.%I for select to authenticated using (org_id = (select public.auth_org()))', t || '_read', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_insert') then
      execute format('create policy %I on public.%I for insert to authenticated with check (%s)', t || '_insert', t, v_recipe);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_update') then
      execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', t || '_update', t, v_recipe, v_recipe);
    end if;
  end loop;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'production_batches' and policyname = 'production_batches_read') then
    create policy production_batches_read on public.production_batches for select to authenticated
      using (org_id = (select public.auth_org()) and (select public.in_scope_wh(input_warehouse_id)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'production_batches' and policyname = 'production_batches_update') then
    execute format('create policy production_batches_update on public.production_batches for update to authenticated using (%s) with check (%s)', v_batch, v_batch);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'production_inputs' and policyname = 'production_inputs_read') then
    create policy production_inputs_read on public.production_inputs for select to authenticated
      using (org_id = (select public.auth_org()));
  end if;
  -- السطر بلا نطاق في سياسته (لا مخزن عليه): الحارس يفحص نطاق مخزن رأسه تحت قفله (مثل سطور الاستلام).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'production_inputs' and policyname = 'production_inputs_update') then
    execute format('create policy production_inputs_update on public.production_inputs for update to authenticated using (%s) with check (%s)', v_input, v_input);
  end if;
  foreach t in array array['production_values', 'production_input_values'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_read') then
      execute format('create policy %I on public.%I for select to authenticated using (org_id = (select public.auth_org()))', t || '_read', t);
    end if;
    -- مال: سياسة مقيِّدة فوق سياسة المنشأة (§٢.٨، E2): مشغّل المعمل والأمين والمشاهد لا يقرأون كلفة الدفعة أبداً.
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_cost_only') then
      execute format('create policy %I on public.%I as restrictive for select to authenticated using ((select public.can_see_cost()))', t || '_cost_only', t);
    end if;
  end loop;
end
$$;

revoke all on table public.recipes, public.recipe_versions, public.recipe_lines, public.production_batches,
  public.production_inputs, public.production_values, public.production_input_values from anon, authenticated;
grant select on table public.recipes, public.recipe_versions, public.recipe_lines, public.production_batches,
  public.production_inputs, public.production_values, public.production_input_values to authenticated;
grant insert (id, name, output_item_id, note) on public.recipes to authenticated;
grant update (name, output_item_id, note, archived_at) on public.recipes to authenticated;
grant insert (id, recipe_id, basis_kg, note) on public.recipe_versions to authenticated;
grant update (basis_kg, note) on public.recipe_versions to authenticated;
grant insert (id, version_id, item_id, qty, unit) on public.recipe_lines to authenticated;
grant update (item_id, qty, unit) on public.recipe_lines to authenticated;
grant update (produced_on, output_qty_kg, output_expiry_on, shrink_reason, note) on public.production_batches to authenticated;
grant update (actual_qty_base) on public.production_inputs to authenticated;
revoke truncate on table public.recipes, public.recipe_versions, public.recipe_lines, public.production_batches,
  public.production_inputs, public.production_values, public.production_input_values from service_role;

-- ─── ج. حرّاس الكتابة المباشرة ──────────────────────────────────────────────────────────────────────────────────
-- الخلطة: الاسم المطبَّع يكتبه الخادم (مثل المواد، ٠٠٠٥)، ومادّة الناتج لا تتغيّر إذا للخلطة نسخة مفعَّلة أو دفعة.
create or replace function private.recipes_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  set local lock_timeout = '5s';
  new.name := private.check_name(new.name, 80, 'اسم الخلطة');
  new.name_norm := private.searchable(new.name);
  if new.name_norm = '' then
    raise exception 'bad_name' using hint = 'اكتب اسماً للخلطة فيه حرف واحد على الأقلّ.';
  end if;
  new.note := nullif(btrim(new.note), '');
  if tg_op = 'UPDATE' then
    if new.output_item_id is distinct from old.output_item_id
      and exists (select 1 from public.recipe_versions v where v.org_id = old.org_id and v.recipe_id = old.id and v.status <> 'draft') then
      raise exception 'recipe_in_use' using hint = 'لهذه الخلطة نسخة مفعَّلة أو مقاعدة، فمادّة الناتج لا تتغيّر. أنشئ خلطة جديدة للناتج الآخر.';
    end if;
    new.version := old.version + 1;
  end if;
  if (tg_op = 'INSERT' or new.output_item_id is distinct from old.output_item_id)
    and not exists (select 1 from public.items i where i.org_id = new.org_id and i.id = new.output_item_id and i.archived_at is null) then
    raise exception 'item_not_found' using hint = 'مادّة الناتج غير موجودة في منشأتك أو مؤرشفة. حدّث الشاشة واختر من جديد.';
  end if;
  return new;
end
$$;

create or replace trigger recipes_guard before insert or update on public.recipes
  for each row execute function private.recipes_guard();

-- نسخة الخلطة: الإدراج مسوّدةً دائماً برقم النسخة التالي، والحالة والختم للدالّة، وbasis_kg لا يتغيّر بعد التفعيل.
create or replace function private.recipe_versions_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.recipes;
begin
  set local lock_timeout = '5s';
  -- الحالة وختم التفعيل والتقاعد غير ممنوحة لأحد (grant أعمدة في هذا الملف)، فتغيّرها لا يكون إلا من دالّة التفعيل:
  -- current_user داخل محفّز definer هو مالك الدالّة لا المستخدم، فلا يصلح حدّاً — الحدّ هو المنح.
  if tg_op = 'UPDATE' and (new.status is distinct from old.status or new.activated_at is distinct from old.activated_at
    or new.retired_at is distinct from old.retired_at) then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.recipe_id is distinct from old.recipe_id then
    raise exception 'frozen_column' using hint = 'النسخة تبقى في خلطتها.';
  end if;
  select * into r from public.recipes where org_id = new.org_id and id = new.recipe_id for update;
  if r.id is null then
    raise exception 'recipe_not_found' using hint = 'هذه الخلطة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if r.archived_at is not null then
    raise exception 'recipe_archived' using hint = format('الخلطة «%s» مؤرشفة، فلا تُعدَّل نسخها. أعِدها من الأرشيف أوّلاً.', r.name);
  end if;
  new.note := nullif(btrim(new.note), '');
  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.version := 1;
    new.activated_at := null;
    new.activated_by := null;
    new.retired_at := null;
    new.version_no := coalesce((select max(v.version_no) from public.recipe_versions v where v.org_id = r.org_id and v.recipe_id = r.id), 0) + 1;
    return new;
  end if;
  if old.status <> 'draft' then
    raise exception 'not_draft' using hint = 'هذه النسخة مفعَّلة أو مقاعدة، فلا تُعدَّل. أنشئ نسخة جديدة وفعّلها.';
  end if;
  if (to_jsonb(new) - array['basis_kg', 'note', 'version']) is distinct from (to_jsonb(old) - array['basis_kg', 'note', 'version']) then
    raise exception 'frozen_column' using hint = 'يُعدَّل في المسوّدة أساسها وملاحظتها فقط؛ الحالة ورقم النسخة وختم التفعيل يكتبها الخادم.';
  end if;
  new.version := old.version + 1;
  return new;
end
$$;

create or replace trigger recipe_versions_guard before insert or update on public.recipe_versions
  for each row execute function private.recipe_versions_guard();

-- سطر العليقة: نسخته مقفولة ومسوّدة، والفعل، ورقم السطر التالي، والكمية round3، والمادّة بوحدة كيلو أو لتر فقط.
create or replace function private.recipe_lines_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.recipe_versions;
  i public.items;
begin
  set local lock_timeout = '5s';
  -- لقطة الكثافة عمود غير ممنوح لأحد، فتغيّرها لا يكون إلا من دالّة التفعيل (حدّها المنح لا current_user).
  if tg_op = 'UPDATE' and new.density_kg_per_l is distinct from old.density_kg_per_l then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.version_id is distinct from old.version_id then
    raise exception 'frozen_column' using hint = 'السطر يبقى في نسخته.';
  end if;
  select * into v from public.recipe_versions where org_id = new.org_id and id = new.version_id for update;
  if v.id is null then
    raise exception 'doc_not_found' using hint = 'هذه النسخة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if v.status <> 'draft' then
    raise exception 'not_draft' using hint = 'هذه النسخة مفعَّلة أو مقاعدة، فلا تُعدَّل سطورها. أنشئ نسخة جديدة وفعّلها.';
  end if;
  perform private.require('recipe.activate');
  select * into i from public.items where org_id = new.org_id and id = new.item_id;
  if i.id is null or i.archived_at is not null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك أو مؤرشفة. حدّث الشاشة واختر من جديد.';
  end if;
  -- النسخة الأولى: العليقة بالكتلة، فمادّة وحدتها «قطعة» (كيس، معدّة) لا تدخل سطراً. الأكياس مدخل إضافي في النسخة الثانية.
  if i.base_unit not in ('kg', 'L') then
    raise exception 'bad_recipe_unit' using hint = format('«%s» وحدتها قطعة، والعليقة تُحسب بالكتلة: لا تدخل في الخلطة بهذه النسخة.', i.name);
  end if;
  if new.unit = 'L' and i.base_unit <> 'L' then
    raise exception 'bad_recipe_unit' using hint = format('«%s» تُقاس بالكيلوغرام، فاكتب كميتها في الخلطة بالكيلوغرام.', i.name);
  end if;
  if new.unit = 'L' and i.density_kg_per_l is null then
    raise exception 'density_required' using hint = format('«%s» سائل بلا كثافة، فلا يُحسب وزنه في الخلطة. اكتب كثافته في بطاقة المادّة أوّلاً.', i.name);
  end if;
  -- مادّة مرّتين في نسخة واحدة (FOUNDATION ٥٥٨): تُسمّى هنا قبل أن يصل القيد الفريد برسالته الخام. النسخة مقفولة فوق.
  if exists (select 1 from public.recipe_lines l where l.org_id = new.org_id and l.version_id = new.version_id and l.item_id = new.item_id and l.id <> new.id) then
    raise exception 'item_duplicated' using hint = format('«%s» مكتوبة في الخلطة مرّتين. عدّل كميتها بدل إضافة سطر ثانٍ.', i.name);
  end if;
  if new.qty = round(new.qty, 3) then
    new.qty := round(new.qty, 3);
  end if;
  if tg_op = 'INSERT' then
    new.density_kg_per_l := null;
    new.line_no := coalesce((select max(l.line_no) from public.recipe_lines l where l.org_id = v.org_id and l.version_id = v.id), 0) + 1;
  else
    new.line_no := old.line_no;
  end if;
  update public.recipe_versions set version = version + 1 where org_id = v.org_id and id = v.id;
  return new;
end
$$;

create or replace trigger recipe_lines_guard before insert or update on public.recipe_lines
  for each row execute function private.recipe_lines_guard();

-- سطر المدخلات: رأسه مقفول ومسوّدة، والفعل والنطاق، والكمية الفعلية round3 وما عداها مجمَّد.
create or replace function private.production_inputs_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d public.production_batches;
begin
  set local lock_timeout = '5s';
  select * into d from public.production_batches where org_id = new.org_id and id = new.batch_id for update;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذه الدفعة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'الدفعة مرحَّلة أو ملغاة؛ لا تُعدَّل سطورها.';
  end if;
  perform private.require('production.draft');
  if not public.in_scope_wh(d.input_warehouse_id) then
    raise exception 'out_of_scope' using hint = 'مخزن مدخلات هذه الدفعة خارج نطاقك.';
  end if;
  if (to_jsonb(new) - array['actual_qty_base']) is distinct from (to_jsonb(old) - array['actual_qty_base']) then
    raise exception 'frozen_column' using hint = 'يُعدَّل في السطر الكمية الفعلية الموزونة فقط؛ لقطة العليقة يكتبها الخادم.';
  end if;
  if new.actual_qty_base is not null and new.actual_qty_base = round(new.actual_qty_base, 3) then
    new.actual_qty_base := round(new.actual_qty_base, 3);
  end if;
  update public.production_batches set version = version + 1 where org_id = d.org_id and id = d.id;
  return new;
end
$$;

create or replace trigger production_inputs_guard before update on public.production_inputs
  for each row execute function private.production_inputs_guard();

create or replace trigger production_batches_guard before insert or update on public.production_batches
  for each row execute function private.draft_header_guard();

-- ─── د. أعمدة المسوّدة الجديدة في الحارس المشترك (٠٠٠٧) ────────────────────────────────────────────────────────────
-- الحارس المشترك يسمح بتعديل تاريخ المسوّدة وملاحظتها؛ ودفعة الإنتاج تزيد وزن الناتج وتاريخ انتهائه وسبب الهدر، فالمستخدم
-- يراها في المعاينة قبل الترحيل (الهدر ونسبته) لا بعدها. الأعمدة الأربعة لا توجد في رؤوس المسوّدات الأخرى، فلا تتوسّع لها.
create or replace function private.draft_header_guard() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status is distinct from 'draft' or new.version is distinct from 1 or new.posted_at is not null or new.voided_at is not null
       or new.client_ref is not null or new.void_reason is not null or (to_jsonb(new) ->> 'doc_no') is not null then
      raise exception 'not_draft' using hint = 'المستند الجديد مسوّدة دائماً؛ الترحيل والإلغاء من دوالّهما.';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - array['on_date', 'moved_on', 'note', 'produced_on', 'output_qty_kg', 'output_expiry_on', 'shrink_reason'])
     is distinct from (to_jsonb(old) - array['on_date', 'moved_on', 'note', 'produced_on', 'output_qty_kg', 'output_expiry_on', 'shrink_reason']) then
    raise exception 'frozen_column' using hint = 'يُعدَّل في المسوّدة تاريخها وملاحظتها فقط؛ الحالة والرقم والنسخة والمخزن يكتبها الخادم.';
  end if;
  new.version := old.version + 1;
  return new;
end
$$;

-- ─── هـ. نوع المستند الجديد في القيود وفي البيان ─────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'stock_lots_source_kind_check' and conrelid = 'public.stock_lots'::regclass
    and pg_get_constraintdef(oid) not like '%production%') then
    alter table public.stock_lots drop constraint stock_lots_source_kind_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_lots_source_kind_check' and conrelid = 'public.stock_lots'::regclass) then
    alter table public.stock_lots add constraint stock_lots_source_kind_check
      check (source_kind in ('opening', 'receipt', 'transfer', 'count_gain', 'production'));
  end if;
  if exists (select 1 from pg_constraint where conname = 'stock_moves_doc_kind_check' and conrelid = 'public.stock_moves'::regclass
    and pg_get_constraintdef(oid) not like '%production%') then
    alter table public.stock_moves drop constraint stock_moves_doc_kind_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_moves_doc_kind_check' and conrelid = 'public.stock_moves'::regclass) then
    alter table public.stock_moves add constraint stock_moves_doc_kind_check
      check (doc_kind in ('opening', 'receipt', 'supplier_return', 'receipt_revalue', 'transfer', 'count', 'stock_use', 'production'));
  end if;
end
$$;

-- رقم دفعة الإنتاج (PD) في عدّاد المستندات (٠٠٠٦):
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'doc_counters_kind_check' and conrelid = 'public.doc_counters'::regclass
    and pg_get_constraintdef(oid) not like '%PD%') then
    alter table public.doc_counters drop constraint doc_counters_kind_check;
    alter table public.doc_counters add constraint doc_counters_kind_check
      check (kind in ('PU', 'RT', 'TR', 'CT', 'SU', 'RC', 'PY', 'OF', 'PD'));
  end if;
end
$$;

-- بيان الحركة في دفتر المادّة (٠٠١٤): الإنتاج سطران، فالبيان يفرّق بين استهلاك المدخل وإنتاج الناتج باسم الخلطة.
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
    else p_kind
  end
$$;

-- اسم المستند للتلميح: رقم الدفعة أو اسم خلطتها (دفعة مسوّدة بلا رقم).
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
    else p_kind
  end
$$;

-- ─── و. المساعدات ───────────────────────────────────────────────────────────────────────────────────────────────
-- كتلة سطر العليقة بالكيلو: الكيلو كما هو، واللتر بالكثافة (القاعدة ٤: kg = round3(L × density)).
create or replace function private.recipe_line_kg(p_qty numeric, p_unit text, p_density numeric) returns numeric
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case when p_qty is null then null when p_unit = 'kg' then round(p_qty, 3) else private.liters_to_kg(p_qty, p_density) end
$$;

-- التقريب لدقّة عدّاد المادّة (القاعدة ١٨: scale_step، افتراض 0.1): بلا قسمة — عدد الخطوات مقرّباً ثمّ × الخطوة.
create or replace function private.round_step(p_qty numeric, p_step numeric) returns numeric
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case
    when p_qty is null then null
    when p_step is null or not (abs(p_step) < 'Infinity') or p_step <= 0 then round(p_qty, 3)
    else round(private._mul_div_round0(p_qty, 1, p_step) * p_step, 3)
  end
$$;

-- كتلة المدخل بالكيلو من كميته بوحدة أساسه ولقطة كثافته (الهدر، القاعدة ٢٢).
create or replace function private.input_mass_kg(p_qty numeric, p_base text, p_density numeric) returns numeric
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case when p_qty is null then null when p_base = 'kg' then round(p_qty, 3) else private.liters_to_kg(p_qty, p_density) end
$$;

-- نسبة الهدر بالمئة بمرتبتين (القاعدة ٢٢): الهدر ÷ كتلة المدخلات × ١٠٠. الصفر صفر، والسالب (وزن أكبر من المدخلات،
-- غالباً غلط ميزان) بالإشارة: _mul_div_round يرفض كمية ≤ صفر، فلا تُمرَّر إليه (درس 0014 مع sale_value).
create or replace function private.shrink_pct(p_shrink numeric, p_mass numeric) returns numeric
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case
    when p_shrink is null or p_mass is null or not (abs(p_shrink) < 'Infinity') or not (abs(p_mass) < 'Infinity') or p_mass <= 0 then null
    when p_shrink = 0 then 0.00
    when p_shrink < 0 then -private._mul_div_round(-p_shrink, 100, p_mass, 2)
    else private._mul_div_round(p_shrink, 100, p_mass, 2)
  end
$$;

-- قيمة الوحدة (كلفة الكيلو، وكلفة وحدة المادّة): القيمة صفر تعطي صفراً، والكمية ≤ صفر تعطي «لا شيء» ولا ترمي.
create or replace function private.per_unit(p_value numeric, p_qty numeric) returns numeric
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case
    when p_value is null or p_qty is null or not (abs(p_value) < 'Infinity') or not (abs(p_qty) < 'Infinity') or p_qty <= 0 then null
    when p_value = 0 then 0.00
    else private._mul_div_round(p_value, 1, p_qty, 2)
  end
$$;

-- الهدر داخل المدى المقبول (القاعدة ٢٢، افتراض صفر إلى ٣٪): خارجه يحتاج سبباً، والسالب غالباً غلط ميزان.
create or replace function private.shrink_in_range(p_pct numeric) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select coalesce(p_pct >= 0 and p_pct <= 3, false)
$$;

-- نسخة العليقة المفعَّلة بخلطتها، مع فحص وجودها وأنّها للمنشأة.
create or replace function private.mill_version(p_id uuid, p_active_only boolean) returns public.recipe_versions
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v public.recipe_versions;
begin
  select * into v from public.recipe_versions where org_id = public.auth_org() and id = p_id;
  if v.id is null then
    raise exception 'doc_not_found' using hint = 'هذه النسخة من الخلطة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if p_active_only and v.status <> 'active' then
    raise exception 'version_not_active' using hint = 'هذه النسخة غير مفعَّلة، فلا يُنتَج بها. فعّل نسخة الخلطة أوّلاً.';
  end if;
  return v;
end
$$;

-- ─── ز. تفعيل نسخة العليقة (FOUNDATION ٥٥٨) ──────────────────────────────────────────────────────────────────────
-- تتحقّق: سطر واحد على الأقلّ، وكلّ كمية أكبر من صفر، وسائل بلا كثافة مرفوض، والمجموع بالكيلو = basis_kg بالضبط.
-- ثمّ تحفظ الكثافة لقطةً على سطورها (القاعدة ٤: تعديلها في المادّة بعدها لا يغيّر نسخة مفعَّلة)، وتجمّد النسخة،
-- وتقاعد المفعَّلة القديمة. القفل: الخلطة ثمّ نسخها، فتفعيلان في اللحظة نفسها يترتّبان ولا تبقى نسختان مفعَّلتان.
create or replace function public.activate_recipe_version(p_id uuid, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v public.recipe_versions;
  r public.recipes;
  ln record;
  v_sum numeric := 0;
  v_count int := 0;
  v_old uuid;
begin
  set local lock_timeout = '5s';
  perform private.require('recipe.activate');
  select * into v from public.recipe_versions where org_id = v_org and id = p_id;
  if v.id is null then
    raise exception 'doc_not_found' using hint = 'هذه النسخة من الخلطة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  select * into r from public.recipes where org_id = v_org and id = v.recipe_id for update;
  if r.archived_at is not null then
    raise exception 'recipe_archived' using hint = format('الخلطة «%s» مؤرشفة. أعِدها من الأرشيف قبل التفعيل.', r.name);
  end if;
  select * into v from public.recipe_versions where org_id = v_org and id = p_id for update;
  if v.status <> 'draft' then
    raise exception 'not_draft' using hint = 'هذه النسخة مفعَّلة أو مقاعدة من قبل.';
  end if;
  if p_expected_version is null or v.version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّرت الخلطة بعد فتحها. حدّث الشاشة وراجع سطورها قبل التفعيل.';
  end if;
  for ln in
    select l.id, l.qty, l.unit, l.item_id, i.name, i.base_unit, i.density_kg_per_l
    from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where l.org_id = v_org and l.version_id = v.id order by l.line_no
  loop
    if ln.base_unit not in ('kg', 'L') then
      raise exception 'bad_recipe_unit' using hint = format('«%s» وحدتها قطعة، والعليقة تُحسب بالكتلة: احذف سطرها.', ln.name);
    end if;
    if ln.base_unit = 'L' and ln.density_kg_per_l is null then
      raise exception 'density_required' using hint = format('«%s» سائل بلا كثافة، فلا يُحسب وزنه. اكتب كثافته في بطاقة المادّة ثمّ فعّل.', ln.name);
    end if;
    if ln.qty is null or not (abs(ln.qty) < 'Infinity') or ln.qty <= 0 then
      raise exception 'qty_not_positive' using hint = format('كمية «%s» في الخلطة يجب أن تكون أكبر من صفر.', ln.name);
    end if;
    if ln.base_unit = 'L' then
      update public.recipe_lines set density_kg_per_l = round(ln.density_kg_per_l, 4) where org_id = v_org and id = ln.id;
    end if;
    v_sum := v_sum + private.recipe_line_kg(ln.qty, ln.unit, ln.density_kg_per_l);
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then
    raise exception 'doc_empty' using hint = 'الخلطة بلا مواد. أضف مادّة واحدة على الأقلّ قبل التفعيل.';
  end if;
  if v_sum <> v.basis_kg then
    raise exception 'basis_mismatch' using hint = format('مجموع مواد الخلطة %s كغم، والأساس %s كغم: الفرق %s كغم. عدّل الكميات أو الأساس حتّى يتساويا.',
      to_char(v_sum, 'FM999999990.999'), to_char(v.basis_kg, 'FM999999990.999'), to_char(v_sum - v.basis_kg, 'FM999999990.999'));
  end if;
  select x.id into v_old from public.recipe_versions x where x.org_id = v_org and x.recipe_id = v.recipe_id and x.status = 'active' for update;
  if v_old is not null then
    update public.recipe_versions set status = 'retired', retired_at = now(), version = version + 1 where org_id = v_org and id = v_old;
  end if;
  update public.recipe_versions set status = 'active', activated_at = now(), activated_by = auth.uid(), version = version + 1
  where org_id = v_org and id = v.id;
  return jsonb_build_object('id', v.id, 'recipe_id', v.recipe_id, 'version_no', v.version_no, 'status', 'active',
    'basis_kg', v.basis_kg::text, 'lines', v_count, 'retired_id', v_old);
end
$$;

-- ─── ح. إنشاء دفعة الإنتاج (FOUNDATION ٥٥٩) ───────────────────────────────────────────────────────────────────────
-- مسوّدة بلقطة العليقة: لكلّ سطر وحدة أساس المادّة وكثافتها والمخطّط = كتلة السطر × planned_kg ÷ basis_kg مقرّباً لدقّة
-- عدّاد المادّة (القاعدة ١٨)، فالمجموع المخطّط قد يختلف بالغرامات ويُعرض ولا يُصحّح صامتاً. المعرّف من الجهاز
-- (درس WP4: insert (id)، والمكرّر 23505 = كُتبت)، فلا تُنشأ دفعتان إذا ضاع الجواب.
create or replace function public.create_production(p_id uuid, p_recipe_version uuid, p_planned_kg numeric, p_wh_in uuid, p_wh_out uuid,
  p_produced_on date) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v public.recipe_versions;
  r public.recipes;
  wi public.warehouses;
  wo public.warehouses;
  o public.items;
  d public.production_batches;
  ln record;
  v_mass numeric;
  v_qty numeric;
  v_lines int := 0;
  v_div uuid;
begin
  set local lock_timeout = '5s';
  perform private.require('production.draft');
  if p_id is null then
    raise exception 'id_required' using hint = 'تعذّر إنشاء الدفعة دون معرّف. حدّث الشاشة وأعد المحاولة.';
  end if;
  if p_planned_kg is null or not (abs(p_planned_kg) < 'Infinity') or p_planned_kg <= 0 or p_planned_kg <> round(p_planned_kg, 3) then
    raise exception 'qty_not_positive' using hint = 'اكتب كمية الإنتاج بالكيلوغرام، أكبر من صفر وبثلاث مراتب عشرية كحدّ أقصى.';
  end if;
  v := private.mill_version(p_recipe_version, true);
  select * into r from public.recipes where org_id = v_org and id = v.recipe_id;
  if r.archived_at is not null then
    raise exception 'recipe_archived' using hint = format('الخلطة «%s» مؤرشفة، فلا يُنتَج بها. أعِدها من الأرشيف أوّلاً.', r.name);
  end if;
  wi := private.stock_wh(p_wh_in, true);
  wo := private.stock_wh(p_wh_out, false);
  if wi.id = wo.id then
    raise exception 'same_warehouse' using hint = 'مخزن المواد ومخزن العلف واحد؛ اختر مخزناً آخر للناتج.';
  end if;
  select * into o from public.items where org_id = v_org and id = r.output_item_id;
  if o.archived_at is not null then
    raise exception 'item_archived' using hint = format('مادّة الناتج «%s» مؤرشفة. أعِدها من الأرشيف أوّلاً.', o.name);
  end if;
  if not private.item_admissible(wo.kind, o.kind) then
    raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s»: نوع المادّة لا يناسب نوع مخزن الناتج.', o.name, wo.name);
  end if;
  for v_div in select distinct x from unnest(array[wi.division_id, wo.division_id]) as x order by 1 loop
    perform private.check_post_date(p_produced_on, v_div);
  end loop;
  insert into public.production_batches (id, org_id, recipe_version_id, output_item_id, input_warehouse_id, output_warehouse_id,
    planned_kg, produced_on)
  values (p_id, v_org, v.id, o.id, wi.id, wo.id, p_planned_kg, p_produced_on)
  returning * into d;
  for ln in
    select l.line_no, l.qty, l.unit, l.density_kg_per_l, i.id as item_id, i.name, i.base_unit, i.density_kg_per_l as item_density, i.scale_step
    from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where l.org_id = v_org and l.version_id = v.id order by l.line_no
  loop
    if ln.base_unit not in ('kg', 'L') then
      raise exception 'bad_recipe_unit' using hint = format('«%s» وحدتها قطعة، فلا تُسحب بالكتلة. راجع الخلطة.', ln.name);
    end if;
    if ln.base_unit = 'L' and coalesce(ln.density_kg_per_l, ln.item_density) is null then
      raise exception 'density_required' using hint = format('«%s» سائل بلا كثافة. اكتب كثافته في بطاقة المادّة ثمّ أعد الإنتاج.', ln.name);
    end if;
    if not private.item_admissible(wi.kind, (select i2.kind from public.items i2 where i2.org_id = v_org and i2.id = ln.item_id)) then
      raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s»: اختر مخزن المواد الذي فيه مواد الخلطة.', ln.name, wi.name);
    end if;
    v_mass := private._mul_div_round(private.recipe_line_kg(ln.qty, ln.unit, coalesce(ln.density_kg_per_l, ln.item_density)), p_planned_kg, v.basis_kg, 3);
    if v_mass <= 0 then
      raise exception 'qty_not_positive' using hint = format('كمية «%s» المخطّطة صفر عند هذا الحجم. أنتج كمية أكبر.', ln.name);
    end if;
    v_qty := private.round_step(case when ln.base_unit = 'kg' then v_mass else private.kg_to_liters(v_mass, coalesce(ln.density_kg_per_l, ln.item_density)) end, ln.scale_step);
    if v_qty <= 0 then
      raise exception 'qty_not_positive' using hint = format('كمية «%s» المخطّطة أصغر من دقّة عدّادها. أنتج كمية أكبر.', ln.name);
    end if;
    insert into public.production_inputs (org_id, batch_id, line_no, item_id, base_unit, density_kg_per_l, planned_qty_base, planned_mass_kg)
    values (v_org, d.id, ln.line_no, ln.item_id, ln.base_unit,
      case when ln.base_unit = 'L' then round(coalesce(ln.density_kg_per_l, ln.item_density), 4) else null end, v_qty, v_mass);
    v_lines := v_lines + 1;
  end loop;
  if v_lines = 0 then
    raise exception 'doc_empty' using hint = 'الخلطة بلا مواد. راجعها قبل الإنتاج.';
  end if;
  return jsonb_build_object('id', d.id, 'kind', 'production', 'status', 'draft', 'version', d.version,
    'recipe_id', r.id, 'recipe_name', r.name, 'recipe_version_id', v.id, 'output_item_id', o.id,
    'input_warehouse_id', wi.id, 'output_warehouse_id', wo.id, 'planned_kg', p_planned_kg::text, 'produced_on', p_produced_on,
    'lines', v_lines);
end
$$;

-- ─── ط. معاينة الدفعة (FOUNDATION ٧٧٠) ────────────────────────────────────────────────────────────────────────────
-- لكلّ مدخل: المخطّط والفعلي والمسحوب من الدفعات بترتيب السحب (الكمية للكلّ، والقيمة داخل money)، والنقص يُسمّى ولا
-- يرمي، والهدر ونسبته من وزن الناتج المكتوب (أو كتلة المدخلات إذا لم يُكتب)، وبصمة الخطّة للترحيل. بلا كتابة ولا قفل.
create or replace function public.preview_production(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  d public.production_batches;
  wi public.warehouses;
  wo public.warehouses;
  r record;
  dr record;
  v_lines jsonb := '[]'::jsonb;
  v_draws jsonb;
  v_before numeric[];
  v_need numeric;
  v_got numeric;
  v_value numeric;
  v_total numeric := 0;
  v_mass numeric := 0;
  v_plan text := '';
  v_pieces text[];
  v_problems jsonb := '[]'::jsonb;
  v_short boolean := false;
  v_out numeric;
  v_shrink numeric;
  v_pct numeric;
  v_div uuid;
  v_date jsonb;
begin
  perform private.require('read');
  select * into d from public.production_batches where org_id = v_org and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذه الدفعة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  select * into wi from public.warehouses where org_id = v_org and id = d.input_warehouse_id;
  select * into wo from public.warehouses where org_id = v_org and id = d.output_warehouse_id;
  if not public.in_scope_wh(wi.id) then
    raise exception 'out_of_scope' using hint = format('المخزن «%s» خارج نطاقك.', wi.name);
  end if;
  for v_div in select distinct x from unnest(array[wi.division_id, wo.division_id]) as x order by 1 loop
    v_date := private.date_problem(d.produced_on, v_div, false);
    if v_date is not null then
      v_problems := v_problems || jsonb_build_array(v_date);
    end if;
  end loop;
  for r in
    select p.*, i.name, i.tracks_expiry, i.archived_at
    from public.production_inputs p join public.items i on i.org_id = p.org_id and i.id = p.item_id
    where p.org_id = v_org and p.batch_id = d.id order by p.line_no
  loop
    v_need := coalesce(r.actual_qty_base, r.planned_qty_base);
    select coalesce(array_agg(x.q order by x.line_no), '{}') into v_before from (
      select p2.line_no, coalesce(p2.actual_qty_base, p2.planned_qty_base) as q
      from public.production_inputs p2
      where p2.org_id = v_org and p2.batch_id = d.id and p2.item_id = r.item_id and p2.line_no < r.line_no
    ) as x;
    v_draws := '[]'::jsonb;
    v_pieces := '{}'::text[];
    v_got := 0;
    v_value := 0;
    for dr in select * from private.draw_plan(r.item_id, wi.id, v_need, d.produced_on, null, false, v_before) loop
      v_pieces := v_pieces || private.plan_piece(dr.lot_id, dr.qty, dr.value);
      v_got := v_got + dr.qty;
      v_value := v_value + dr.value;
      v_draws := v_draws || jsonb_build_array(jsonb_build_object('lot_id', dr.lot_id, 'qty', dr.qty::text,
        'money', jsonb_build_object('value', dr.value::text)));
    end loop;
    if v_got < v_need then
      v_short := true;
      v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'insufficient_stock', 'item_id', r.item_id, 'item_name', r.name,
        'need', v_need::text, 'have', v_got::text, 'unit', r.base_unit));
    end if;
    if r.archived_at is not null then
      v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'item_archived', 'item_id', r.item_id, 'item_name', r.name));
    end if;
    v_total := v_total + v_value;
    if r.in_basis then
      v_mass := v_mass + coalesce(private.input_mass_kg(v_need, r.base_unit, r.density_kg_per_l), 0);
    end if;
    v_plan := v_plan || r.id::text || '|' || array_to_string(v_pieces, ';') || '/';
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('input_id', r.id, 'line_no', r.line_no, 'item_id', r.item_id,
      'item_name', r.name, 'base_unit', r.base_unit, 'planned_qty', r.planned_qty_base::text, 'actual_qty', r.actual_qty_base::text,
      'draw_qty', v_got::text, 'in_basis', r.in_basis, 'tracks_expiry', r.tracks_expiry,
      'money', jsonb_build_object('value', v_value::text)));
  end loop;
  v_out := coalesce(d.output_qty_kg, round(v_mass, 3));
  v_shrink := round(v_mass - v_out, 3);
  v_pct := private.shrink_pct(v_shrink, v_mass);
  if not private.shrink_in_range(v_pct) and nullif(btrim(coalesce(d.shrink_reason, '')), '') is null then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'shrink_out_of_range', 'shrink_kg', v_shrink::text, 'shrink_pct', v_pct::text));
  end if;
  if (select i.tracks_expiry from public.items i where i.org_id = v_org and i.id = d.output_item_id) and d.output_expiry_on is null then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'expiry_required'));
  end if;
  if d.status = 'draft' and d.costs_confirmed_at is null and not public.can('production.post') then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'costs_pending'));
  end if;
  return private.mask(jsonb_build_object('id', d.id, 'kind', 'production', 'status', d.status, 'version', d.version,
    'produced_on', d.produced_on, 'planned_kg', d.planned_kg::text, 'input_mass_kg', round(v_mass, 3)::text,
    'output_qty_kg', v_out::text, 'output_expiry_on', d.output_expiry_on, 'shrink_kg', v_shrink::text, 'shrink_pct', v_pct::text,
    'shrink_reason', d.shrink_reason, 'shrink_ok', private.shrink_in_range(v_pct), 'costs_confirmed', d.costs_confirmed_at is not null,
    'input_warehouse', jsonb_build_object('id', wi.id, 'name', wi.name), 'output_warehouse', jsonb_build_object('id', wo.id, 'name', wo.name),
    'lines', v_lines, 'problems', v_problems, 'can_post', d.status = 'draft' and not v_short and v_problems = '[]'::jsonb,
    'plan_token', private.plan_token(v_plan),
    'money', jsonb_build_object('input_value', v_total::text, 'extra_value', '0', 'total_value', v_total::text,
      'cost_per_kg', private.per_unit(v_total, v_out)::text)));
end
$$;

-- ─── ي. ختم الكلف (FOUNDATION ٥٦٠) ───────────────────────────────────────────────────────────────────────────────
-- النسخة الأولى بلا كلف يدوية: الختم يقول «لا كلف على هذه الدفعة» فيرحّلها مشغّل المعمل (الدور يشترطه). المحاسب أو
-- المدير يختم، وأيّ سطر كلفة في النسخة الثانية يُفرّغ الختم عند تعديله.
create or replace function public.confirm_production_costs(p_id uuid, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  d public.production_batches;
begin
  set local lock_timeout = '5s';
  perform private.require('costs.load');
  select * into d from public.production_batches where org_id = v_org and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذه الدفعة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  perform private.stock_wh(d.input_warehouse_id, false);
  select * into d from public.production_batches where org_id = v_org and id = p_id for update;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'هذه الدفعة مرحَّلة أو ملغاة؛ لا يُختَم كلفها.';
  end if;
  if p_expected_version is null or d.version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّرت الدفعة بعد فتحها. حدّث الشاشة وأعد المحاولة.';
  end if;
  if d.costs_confirmed_at is not null then
    return jsonb_build_object('id', d.id, 'costs_confirmed', true, 'written', false, 'version', d.version);
  end if;
  update public.production_batches set costs_confirmed_at = now(), costs_confirmed_by = auth.uid(), version = version + 1
  where org_id = v_org and id = d.id;
  return jsonb_build_object('id', d.id, 'costs_confirmed', true, 'written', true, 'version', d.version + 1);
end
$$;

-- ─── ك. ترحيل الدفعة (FOUNDATION ٥٦١، القواعد ١٩–٢٣) ──────────────────────────────────────────────────────────────
-- المرحَّل هو الكمية الفعلية الموزونة (أو المخطّطة إذا لم تُوزن): تُسحب من مخزن المواد بترتيب السحب، ومجموع قيم السحوبات
-- كلفة الدفعة، ودفعة الناتج قيمتها الكلفة **بالضبط** (القاعدة ٢١) فلا يضيع فلس، والهدر = كتلة المدخلات − وزن الناتج
-- وخارج المدى يحتاج سبباً (القاعدة ٢٢). القطع المسحوبة = التي رآها المستخدم في المعاينة (بصمة الخطّة)، وإلّا stale_preview.
create or replace function public.post_production(p_id uuid, p_expected_version int, p_expected_plan text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'post_production';
  v_cached jsonb;
  v_org uuid := public.auth_org();
  d public.production_batches;
  wi public.warehouses;
  wo public.warehouses;
  o public.items;
  r record;
  dr record;
  l public.stock_lots;
  v_items uuid[];
  v_whs uuid[];
  v_need numeric;
  v_value numeric;
  v_total numeric := 0;
  v_mass numeric := 0;
  v_out numeric;
  v_shrink numeric;
  v_pct numeric;
  v_plan text := '';
  v_pieces text[];
  v_lines jsonb := '[]'::jsonb;
  v_no text;
  v_div uuid;
  v_date date;
begin
  set local lock_timeout = '5s';
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'version', p_expected_version));
  if v_cached is not null then
    return v_cached;
  end if;
  select * into d from public.production_batches where org_id = v_org and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذه الدفعة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  -- الدور: ترحيل الدفعة للمدير أو المحاسب، ومشغّل المعمل بعد ختم الكلف (FOUNDATION ٥٣٥).
  if not public.can('production.post', d.costs_confirmed_at is not null) then
    raise exception 'forbidden' using hint = case when public.can('production.draft') and d.costs_confirmed_at is null
      then 'تُرحَّل الدفعة بعد أن يختم المحاسب أو المدير كلفها. اطلب منه ختمها.'
      else 'لا تملك صلاحية ترحيل دفعة الإنتاج. اطلب من مالك المنشأة تغيير دورك إن كنت تحتاج إليه.' end;
  end if;
  wi := private.stock_wh(d.input_warehouse_id, true);
  wo := private.stock_wh(d.output_warehouse_id, false);
  v_date := d.produced_on;
  for v_div in select distinct x from unnest(array[wi.division_id, wo.division_id]) as x order by 1 loop
    perform private.check_post_date(v_date, v_div);
  end loop;
  select * into d from public.production_batches where org_id = v_org and id = p_id for update;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'هذه الدفعة ليست مسوّدة: رُحّلت أو أُلغيت من قبل.';
  end if;
  if p_expected_version is null or d.version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّرت المسوّدة بعد المعاينة. راجعها وعاينها من جديد قبل الترحيل.';
  end if;
  -- التاريخ المفحوص قبل القفل نفسه بعده (درس WP4): وإلّا رُحّلت دفعة بفترة مقفلة أو بتاريخ غيّره كاتب آخر.
  if d.produced_on is distinct from v_date then
    raise exception 'stale_draft' using hint = 'تغيّر تاريخ المسوّدة أثناء الترحيل. راجعها وعاينها من جديد.';
  end if;
  select array_agg(distinct p.item_id) into v_items from public.production_inputs p where p.org_id = v_org and p.batch_id = d.id;
  if v_items is null then
    raise exception 'doc_empty' using hint = 'الدفعة بلا مواد. اطوِها وأنشئ غيرها من خلطة فيها مواد.';
  end if;
  perform private.lock_masters(array[wi.id, wo.id], v_items || array[d.output_item_id], true);
  select * into o from public.items where org_id = v_org and id = d.output_item_id;
  if not private.item_admissible(wo.kind, o.kind) then
    raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s»: نوع المادّة لا يناسب نوع مخزن الناتج.', o.name, wo.name);
  end if;
  if o.tracks_expiry and d.output_expiry_on is null then
    raise exception 'expiry_required' using hint = format('«%s» تُتابَع صلاحيتها، فاكتب تاريخ انتهاء الناتج قبل الترحيل.', o.name);
  end if;
  v_whs := array_fill(wi.id, array[cardinality(v_items)]) || array[wo.id];
  perform private.lock_balances(v_items || array[d.output_item_id], v_whs);
  for r in
    select p.*, i.name, i.base_unit as item_base, i.density_kg_per_l as item_density, i.tracks_expiry
    from public.production_inputs p join public.items i on i.org_id = p.org_id and i.id = p.item_id
    where p.org_id = v_org and p.batch_id = d.id order by p.line_no
  loop
    -- لقطة الوحدة والكثافة تُقارن بعد قفل المادّة (درس WP6، E46): تغييرهما بعد المسوّدة كان يرحّل كتلة غير التي حُسبت.
    if r.item_base is distinct from r.base_unit
      or (r.base_unit = 'L' and r.item_density is distinct from r.density_kg_per_l) then
      raise exception 'item_changed' using hint = format('تغيّرت وحدة «%s» أو كثافتها بعد إنشاء الدفعة. اطوِ المسوّدة وأنشئها من جديد.', r.name);
    end if;
    v_need := coalesce(r.actual_qty_base, r.planned_qty_base);
    v_pieces := '{}'::text[];
    v_value := 0;
    for dr in select * from private.draw(r.item_id, wi.id, v_need, d.produced_on, null, false) loop
      v_pieces := v_pieces || private.plan_piece(dr.lot_id, dr.qty, dr.value);
      perform private.apply_move(dr.lot_id, 'production', d.id, r.id, -dr.qty, -dr.value, d.produced_on, null, coalesce(r.tracks_expiry, false));
      v_value := v_value + dr.value;
    end loop;
    insert into public.production_input_values (org_id, input_id, batch_id, value) values (v_org, r.id, d.id, v_value);
    v_total := v_total + v_value;
    if r.in_basis then
      v_mass := v_mass + private.input_mass_kg(v_need, r.base_unit, r.density_kg_per_l);
    end if;
    v_plan := v_plan || r.id::text || '|' || array_to_string(v_pieces, ';') || '/';
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('input_id', r.id, 'item_id', r.item_id, 'qty', v_need::text,
      'money', jsonb_build_object('value', v_value::text)));
  end loop;
  if p_expected_plan is null or private.plan_token(v_plan) is distinct from p_expected_plan then
    raise exception 'stale_preview' using hint = 'تغيّر المخزون بعد المعاينة فتغيّرت الدفعات المسحوبة أو كمياتها. عاين الدفعة من جديد ووافق عليها قبل الترحيل.';
  end if;
  v_mass := round(v_mass, 3);
  v_out := coalesce(d.output_qty_kg, v_mass);
  if v_out is null or not (abs(v_out) < 'Infinity') or v_out <= 0 then
    raise exception 'output_not_positive' using hint = 'وزن الناتج يجب أن يكون أكبر من صفر.';
  end if;
  v_shrink := round(v_mass - v_out, 3);
  v_pct := private.shrink_pct(v_shrink, v_mass);
  if not private.shrink_in_range(v_pct) and nullif(btrim(coalesce(d.shrink_reason, '')), '') is null then
    raise exception 'shrink_out_of_range' using hint = format('الهدر %s كغم (%s٪) خارج المدى المقبول (صفر إلى ٣٪). اكتب سبب الفرق أو راجع الوزن.',
      to_char(v_shrink, 'FM999999990.999'), to_char(coalesce(v_pct, 0), 'FM999990.99'));
  end if;
  l := private.new_lot(o.id, wo.id, d.produced_on, d.output_expiry_on, null, v_out, v_total, 'production', d.id, null);
  perform private.apply_move(l.id, 'production', d.id, null, v_out, v_total, d.produced_on, null);
  insert into public.production_values (org_id, batch_id, input_value, extra_value, total_value) values (v_org, d.id, v_total, 0.00, v_total);
  v_no := private.next_doc_no('PD', d.produced_on);
  update public.production_batches set status = 'posted', doc_no = v_no, client_ref = p_client_ref, posted_at = now(), posted_by = auth.uid(),
    output_qty_kg = v_out, input_mass_kg = v_mass, shrink_kg = v_shrink, output_lot_id = l.id
  where org_id = v_org and id = d.id;
  for v_div in select distinct x from unnest(array[wi.division_id, wo.division_id]) as x order by 1 loop
    perform private.mark_division_posted(v_div);
  end loop;
  -- ref_store يحفظ النتيجة كما هي ويرجّعها مقنَّعة (٠٠٠٦)، فالقناع هنا زائد: الأمين ومشغّل المعمل لا يريان money.
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'kind', 'production', 'status', 'posted', 'doc_no', v_no,
    'produced_on', d.produced_on, 'output_item_id', o.id, 'output_lot_id', l.id, 'output_qty_kg', v_out::text,
    'input_mass_kg', v_mass::text, 'shrink_kg', v_shrink::text, 'shrink_pct', v_pct::text, 'lines', v_lines,
    'money', jsonb_build_object('input_value', v_total::text, 'extra_value', '0', 'total_value', v_total::text,
      'cost_per_kg', private.per_unit(v_total, v_out)::text)));
end
$$;

-- ─── ل. إلغاء الدفعة (FOUNDATION ٥٦١) ────────────────────────────────────────────────────────────────────────────
-- دفعة الناتج تُلغى والمواد ترجع لدفعاتها الأصلية (نفس lot_id): كلّ حركة للمستند تُعكس بيوم الإلغاء. دفعة الناتج التي
-- سُحب منها شيء ← lot_consumed يسمّي المستند الذي سحب، فتُرجَّع التوابع أوّلاً (الإلغاء من الأحدث).
create or replace function public.void_production(p_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_production';
  v_cached jsonb;
  v_org uuid := public.auth_org();
  v_reason text;
  d public.production_batches;
  wi public.warehouses;
  wo public.warehouses;
  m public.stock_moves;
  l public.stock_lots;
  v_items uuid[];
  v_whs uuid[];
  v_back jsonb := '[]'::jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  if v_reason is null then
    raise exception 'reason_required' using hint = 'اكتب سبب الإلغاء.';
  end if;
  select * into d from public.production_batches where org_id = v_org and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذه الدفعة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  wi := private.stock_wh(d.input_warehouse_id, true);
  wo := private.stock_wh(d.output_warehouse_id, false);
  perform private.check_void_date();
  select * into d from public.production_batches where org_id = v_org and id = p_id for update;
  if d.status = 'void' then
    raise exception 'already_void' using hint = 'هذه الدفعة ملغاة من قبل.';
  end if;
  if d.status <> 'posted' then
    raise exception 'not_posted' using hint = 'هذه الدفعة مسوّدة لم تُرحَّل؛ تُطوى المسوّدة بدل إلغائها.';
  end if;
  select array_agg(distinct p.item_id) into v_items from public.production_inputs p where p.org_id = v_org and p.batch_id = d.id;
  perform private.lock_masters(array[wi.id, wo.id], v_items || array[d.output_item_id], false);
  v_whs := array_fill(wi.id, array[cardinality(v_items)]) || array[wo.id];
  perform private.lock_balances(v_items || array[d.output_item_id], v_whs);
  for l in select * from public.stock_lots x where x.org_id = v_org and x.source_kind = 'production' and x.source_id = d.id order by x.id for no key update loop
    perform private.check_lot_intact(l.id);
    v_back := v_back || jsonb_build_array(l.id);
  end loop;
  -- الحركات الفعلية للمستند (لا سطوره): كلّ حركة أصلية بلا عكسية تُعكس بيوم الإلغاء بنفس دفعتها.
  for m in
    select x.* from public.stock_moves x
    where x.org_id = v_org and x.doc_kind = 'production' and x.doc_id = d.id and x.reverses_move_id is null
      and not exists (select 1 from public.stock_moves y where y.org_id = x.org_id and y.reverses_move_id = x.id)
    order by x.qty, x.id
  loop
    perform private.apply_move(m.lot_id, 'production', d.id, m.doc_line_id, -m.qty, -m.value, public.app_today(), m.id);
  end loop;
  update public.production_batches set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
  where org_id = v_org and id = d.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'kind', 'production', 'status', 'void', 'doc_no', d.doc_no,
    'reversed_lots', v_back));
end
$$;

-- ─── م. طيّ مسوّدة الدفعة: نوع جديد في discard_draft (٠٠٠٧) ────────────────────────────────────────────────────────
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
  elsif p_doc_kind = 'production' then
    perform private.require('production.draft');
    select status, version, input_warehouse_id into v_status, v_version, v_wh from public.production_batches
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
  elsif p_doc_kind = 'production' then
    update public.production_batches set status = 'void', voided_at = now(), voided_by = auth.uid(), version = version + 1
    where org_id = public.auth_org() and id = p_id;
  else
    update public.stock_counts set status = 'void', voided_at = now(), voided_by = auth.uid(), version = version + 1
    where org_id = public.auth_org() and id = p_id;
  end if;
  return jsonb_build_object('id', p_id, 'kind', p_doc_kind, 'status', 'void', 'version', v_version + 1);
end
$$;

-- ─── م-2. حذف سطر العليقة: نوع جديد في delete_draft_line (٠٠٠٧، E52: الحذف بدالّة لا بمنح delete) ─────────────────
-- النسخة مقفولة ومسوّدة وبشرط نسختها، ونسختها تزيد. سطر العليقة بلا مخزن، فلا نطاق مخزن عليه (الفعل recipe.activate
-- للمالك والمدير وهو على المنشأة كلّها).
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
  elsif p_doc_kind = 'recipe_line' then
    perform private.require('recipe.activate');
    select version_id into v_doc from public.recipe_lines where org_id = public.auth_org() and id = p_line_id for update;
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
  elsif p_doc_kind = 'recipe_line' then
    select status, version, null::uuid into v_status, v_version, v_wh from public.recipe_versions
    where org_id = public.auth_org() and id = v_doc for update;
  else
    select status, version, warehouse_id into v_status, v_version, v_wh from public.stock_counts
    where org_id = public.auth_org() and id = v_doc for update;
  end if;
  -- سطر العليقة بلا مخزن (الخلطة للمنشأة كلّها بفعل recipe.activate)، فلا نطاق مخزن عليه.
  if v_wh is not null then
    perform private.stock_wh(v_wh, true);
  end if;
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
  elsif p_doc_kind = 'recipe_line' then
    delete from public.recipe_lines where org_id = public.auth_org() and id = p_line_id;
    update public.recipe_versions set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  else
    delete from public.stock_count_line_costs where org_id = public.auth_org() and line_id = p_line_id;
    delete from public.stock_count_lines where org_id = public.auth_org() and id = p_line_id;
    update public.stock_counts set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  end if;
  return jsonb_build_object('line_id', p_line_id, 'deleted', true, 'doc_id', v_doc, 'version', v_version + 1);
end
$$;

-- ─── ن. القرّاء ─────────────────────────────────────────────────────────────────────────────────────────────────
-- لوحة المعمل: لكلّ خلطة مادّة ناتجها، ونسختها المفعَّلة (أساسها وعدد موادّها)، ومسوّدتها إن وُجدت، وآخر دفعة وكلفة
-- كيلوها، وعدد دفعاتها. المال داخل money (private.mask يشيله عن غير أدوار الكلفة).
create or replace function public.recipes_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
begin
  perform private.require('read');
  return private.mask(jsonb_build_object('today', public.app_today(), 'recipes', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', r.name, 'note', r.note, 'archived', r.archived_at is not null, 'version', r.version,
      'output_item', jsonb_build_object('id', i.id, 'name', i.name, 'base_unit', i.base_unit, 'kind', i.kind),
      'active', (select jsonb_build_object('id', v.id, 'version_no', v.version_no, 'basis_kg', v.basis_kg::text,
          'lines', (select count(*) from public.recipe_lines l where l.org_id = v.org_id and l.version_id = v.id),
          -- مواد النسخة بكتلتها بالكيلو من الأكبر: شريط التركيبة ورقاقاتها تُقرأ بلمحة قبل الأرقام.
          'pieces', coalesce((select jsonb_agg(jsonb_build_object('item_id', l.item_id, 'item_name', i.name,
              'mass_kg', private.recipe_line_kg(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l))::text)
              order by private.recipe_line_kg(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l)) desc, i.name collate "C", l.id)
            from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
            where l.org_id = v.org_id and l.version_id = v.id), '[]'::jsonb))
        from public.recipe_versions v where v.org_id = r.org_id and v.recipe_id = r.id and v.status = 'active'),
      'draft', (select jsonb_build_object('id', v.id, 'version_no', v.version_no, 'basis_kg', v.basis_kg::text, 'version', v.version,
          'lines', (select count(*) from public.recipe_lines l where l.org_id = v.org_id and l.version_id = v.id))
        from public.recipe_versions v where v.org_id = r.org_id and v.recipe_id = r.id and v.status = 'draft'),
      'batches', (select count(*) from public.production_batches b join public.recipe_versions v2 on v2.org_id = b.org_id and v2.id = b.recipe_version_id
        where v2.org_id = r.org_id and v2.recipe_id = r.id and b.status = 'posted'),
      'last_batch', (select jsonb_build_object('id', b.id, 'doc_no', b.doc_no, 'produced_on', b.produced_on, 'output_qty_kg', b.output_qty_kg::text,
          'money', jsonb_build_object('total_value', pv.total_value::text,
            'cost_per_kg', private.per_unit(pv.total_value, b.output_qty_kg)::text))
        from public.production_batches b
        join public.recipe_versions v3 on v3.org_id = b.org_id and v3.id = b.recipe_version_id
        left join public.production_values pv on pv.org_id = b.org_id and pv.batch_id = b.id
        where v3.org_id = r.org_id and v3.recipe_id = r.id and b.status = 'posted'
        order by b.produced_on desc, b.id desc limit 1)
    ) order by r.archived_at is not null, r.name_norm collate "C", r.id)
    from public.recipes r join public.items i on i.org_id = r.org_id and i.id = r.output_item_id
    where r.org_id = v_org), '[]'::jsonb),
    'stores', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'kind', w.kind) order by w.kind, w.name collate "C", w.id)
      from public.warehouses w
      where w.org_id = v_org and w.archived_at is null and w.kind in ('raw', 'feed') and public.in_scope_wh(w.id)), '[]'::jsonb),
    'feed_items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name) order by i.name_norm collate "C", i.id)
      from public.items i where i.org_id = v_org and i.archived_at is null and i.kind = 'feed'), '[]'::jsonb)));
end
$$;

-- بطاقة الخلطة: نسخها، وسطور النسخة المطلوبة (أو المفعَّلة) بتصنيف المادّة ووحدتها وكتلتها وحصّتها من الأساس، ومال
-- كلفة الكيلو المقدّرة من آخر شراء (قيمة المتبقّي ÷ كميته، فإن لم يكن للمادّة رصيد فصفر ويُرجَّع items_unvalued).
create or replace function public.recipe_detail(p_id uuid, p_version uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  r public.recipes;
  v public.recipe_versions;
begin
  perform private.require('read');
  select * into r from public.recipes where org_id = v_org and id = p_id;
  if r.id is null then
    raise exception 'recipe_not_found' using hint = 'هذه الخلطة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if p_version is not null then
    select * into v from public.recipe_versions where org_id = v_org and id = p_version and recipe_id = r.id;
    if v.id is null then
      raise exception 'doc_not_found' using hint = 'هذه النسخة غير موجودة في هذه الخلطة. حدّث الشاشة.';
    end if;
  else
    select * into v from public.recipe_versions where org_id = v_org and recipe_id = r.id and status = 'active';
    if v.id is null then
      select * into v from public.recipe_versions where org_id = v_org and recipe_id = r.id order by version_no desc limit 1;
    end if;
  end if;
  return private.mask(jsonb_build_object(
    'id', r.id, 'name', r.name, 'note', r.note, 'archived', r.archived_at is not null, 'version', r.version,
    'output_item', (select jsonb_build_object('id', i.id, 'name', i.name, 'base_unit', i.base_unit, 'kind', i.kind, 'tracks_expiry', i.tracks_expiry)
      from public.items i where i.org_id = v_org and i.id = r.output_item_id),
    'versions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'version_no', x.version_no, 'status', x.status,
        'basis_kg', x.basis_kg::text, 'activated_at', x.activated_at, 'version', x.version)
      order by x.version_no desc) from public.recipe_versions x where x.org_id = v_org and x.recipe_id = r.id), '[]'::jsonb),
    'selected', case when v.id is null then null else jsonb_build_object('id', v.id, 'version_no', v.version_no, 'status', v.status,
      'basis_kg', v.basis_kg::text, 'note', v.note, 'activated_at', v.activated_at, 'version', v.version) end,
    'lines', case when v.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'line_no', l.line_no, 'item_id', l.item_id, 'item_name', i.name,
        'kind', i.kind, 'base_unit', i.base_unit, 'category_id', i.category_id,
        'category_name', (select c.name from public.item_categories c where c.org_id = v_org and c.id = i.category_id),
        'qty', l.qty::text, 'unit', l.unit, 'mass_kg', private.recipe_line_kg(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l))::text,
        'share_pct', private._mul_div_round(private.recipe_line_kg(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l)), 100, v.basis_kg, 2)::text,
        'money', jsonb_build_object('unit_cost', (select private.per_unit(sum(s.value_left), sum(s.qty_left))::text
          from public.stock_lots s where s.org_id = v_org and s.item_id = l.item_id and s.qty_left > 0)))
      order by l.line_no)
      from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
      where l.org_id = v_org and l.version_id = v.id), '[]'::jsonb) end,
    'mass_kg', case when v.id is null then null else coalesce((select sum(private.recipe_line_kg(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l)))
      from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
      where l.org_id = v_org and l.version_id = v.id), 0)::text end,
    -- المرشَّحات لسطر جديد: مادّة فعّالة يستلمها مخزن المواد الأوّلية وتُقاس بالكيلو أو اللتر (القطعة لا تدخل العليقة).
    'pick_items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'base_unit', i.base_unit,
        'category_name', (select c.name from public.item_categories c where c.org_id = v_org and c.id = i.category_id))
        order by i.name_norm collate "C", i.id)
      from public.items i
      where i.org_id = v_org and i.archived_at is null and i.base_unit in ('kg', 'L') and private.item_admissible('raw', i.kind)), '[]'::jsonb)));
end
$$;

-- دفعات الإنتاج: صفحة بالتاريخ ثمّ المعرّف، والمسوّدات أوّلاً (العمل القائم)، والمال داخل money.
create or replace function public.productions_overview(p_after jsonb, p_limit int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_lim int := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_day date := nullif(p_after ->> 'produced_on', '')::date;
  v_id uuid := nullif(p_after ->> 'id', '')::uuid;
begin
  perform private.require('read');
  return private.mask(jsonb_build_object(
    'drafts', case when p_after is not null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'status', b.status, 'produced_on', b.produced_on, 'planned_kg', b.planned_kg::text,
        'recipe_name', r.name, 'output_item_name', i.name, 'version', b.version, 'costs_confirmed', b.costs_confirmed_at is not null,
        'input_warehouse_name', wi.name, 'output_warehouse_name', wo.name,
        'lines', (select count(*) from public.production_inputs p where p.org_id = b.org_id and p.batch_id = b.id))
      order by b.produced_on desc, b.id desc)
      from public.production_batches b
      join public.recipe_versions v on v.org_id = b.org_id and v.id = b.recipe_version_id
      join public.recipes r on r.org_id = v.org_id and r.id = v.recipe_id
      join public.items i on i.org_id = b.org_id and i.id = b.output_item_id
      join public.warehouses wi on wi.org_id = b.org_id and wi.id = b.input_warehouse_id
      join public.warehouses wo on wo.org_id = b.org_id and wo.id = b.output_warehouse_id
      where b.org_id = v_org and b.status = 'draft' and public.in_scope_wh(b.input_warehouse_id)), '[]'::jsonb) end,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'doc_no', x.doc_no, 'status', x.status, 'produced_on', x.produced_on,
        'recipe_name', x.recipe_name, 'output_item_name', x.output_item_name, 'output_qty_kg', x.output_qty_kg::text,
        'shrink_kg', x.shrink_kg::text, 'shrink_pct', private.shrink_pct(x.shrink_kg, x.input_mass_kg)::text,
        'money', jsonb_build_object('total_value', x.total_value::text,
          'cost_per_kg', private.per_unit(x.total_value, x.output_qty_kg)::text))
      order by x.produced_on desc, x.id desc)
      from (
        select b.id, b.doc_no, b.status, b.produced_on, b.output_qty_kg, b.shrink_kg, b.input_mass_kg, r.name as recipe_name,
          i.name as output_item_name, pv.total_value
        from public.production_batches b
        join public.recipe_versions v on v.org_id = b.org_id and v.id = b.recipe_version_id
        join public.recipes r on r.org_id = v.org_id and r.id = v.recipe_id
        join public.items i on i.org_id = b.org_id and i.id = b.output_item_id
        left join public.production_values pv on pv.org_id = b.org_id and pv.batch_id = b.id
        where b.org_id = v_org and (b.status = 'posted' or (b.status = 'void' and b.doc_no is not null))
          and public.in_scope_wh(b.input_warehouse_id)
          and (v_day is null or (b.produced_on, b.id) < (v_day, v_id))
        order by b.produced_on desc, b.id desc limit v_lim
      ) as x), '[]'::jsonb),
    'total', case when p_after is not null then null else (select count(*) from public.production_batches b
      where b.org_id = v_org and b.status = 'posted' and public.in_scope_wh(b.input_warehouse_id)) end));
end
$$;

-- بطاقة الدفعة: رأسها ومدخلاتها (المخطّط والفعلي والمسحوب) وكلفتها وهدرها، والمرحَّلة من حركاتها الفعلية لا من سطورها.
create or replace function public.production_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  d public.production_batches;
  v public.recipe_versions;
  r public.recipes;
begin
  perform private.require('read');
  select * into d from public.production_batches where org_id = v_org and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذه الدفعة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_wh(d.input_warehouse_id) then
    raise exception 'out_of_scope' using hint = 'مخزن مدخلات هذه الدفعة خارج نطاقك.';
  end if;
  select * into v from public.recipe_versions where org_id = v_org and id = d.recipe_version_id;
  select * into r from public.recipes where org_id = v_org and id = v.recipe_id;
  return private.mask(jsonb_build_object(
    'id', d.id, 'doc_no', d.doc_no, 'status', d.status, 'version', d.version, 'produced_on', d.produced_on,
    'planned_kg', d.planned_kg::text, 'output_qty_kg', d.output_qty_kg::text, 'output_expiry_on', d.output_expiry_on,
    'input_mass_kg', d.input_mass_kg::text, 'shrink_kg', d.shrink_kg::text,
    'shrink_pct', private.shrink_pct(d.shrink_kg, d.input_mass_kg)::text, 'shrink_reason', d.shrink_reason,
    'note', d.note, 'void_reason', d.void_reason, 'costs_confirmed', d.costs_confirmed_at is not null,
    'recipe', jsonb_build_object('id', r.id, 'name', r.name, 'version_id', v.id, 'version_no', v.version_no, 'basis_kg', v.basis_kg::text),
    'output_item', (select jsonb_build_object('id', i.id, 'name', i.name, 'base_unit', i.base_unit, 'tracks_expiry', i.tracks_expiry)
      from public.items i where i.org_id = v_org and i.id = d.output_item_id),
    'input_warehouse', (select jsonb_build_object('id', w.id, 'name', w.name) from public.warehouses w where w.org_id = v_org and w.id = d.input_warehouse_id),
    'output_warehouse', (select jsonb_build_object('id', w.id, 'name', w.name) from public.warehouses w where w.org_id = v_org and w.id = d.output_warehouse_id),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'line_no', p.line_no, 'item_id', p.item_id, 'item_name', i.name,
        'base_unit', p.base_unit, 'planned_qty', p.planned_qty_base::text, 'actual_qty', p.actual_qty_base::text,
        'used_qty', case when d.status = 'draft' then null else (select coalesce(-sum(m.qty), 0)::text from public.stock_moves m
          where m.org_id = v_org and m.doc_kind = 'production' and m.doc_id = d.id and m.doc_line_id = p.id) end,
        'in_basis', p.in_basis, 'is_substitute', p.is_substitute, 'reason', p.reason,
        'money', jsonb_build_object('value', (select iv.value::text from public.production_input_values iv
          where iv.org_id = v_org and iv.input_id = p.id)))
      order by p.line_no)
      from public.production_inputs p join public.items i on i.org_id = p.org_id and i.id = p.item_id
      where p.org_id = v_org and p.batch_id = d.id), '[]'::jsonb),
    'money', (select jsonb_build_object('input_value', pv.input_value::text, 'extra_value', pv.extra_value::text,
        'total_value', pv.total_value::text,
        'cost_per_kg', private.per_unit(pv.total_value, d.output_qty_kg)::text)
      from public.production_values pv where pv.org_id = v_org and pv.batch_id = d.id)));
end
$$;

-- ─── س. الثوابت (FOUNDATION ٤٢٧) ────────────────────────────────────────────────────────────────────────────────
create or replace function public.verify_mill() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  -- ١) نسخة مفعَّلة واحدة لكلّ خلطة.
  select 'recipe_many_active', count(*) from (
    select v.recipe_id from public.recipe_versions v where v.status = 'active' group by v.org_id, v.recipe_id having count(*) > 1
  ) as x
  union all
  -- ٢) كلّ نسخة غير مسوّدة مجموع موادّها بالكيلو = أساسها (التفعيل يفحصه، والجمود يحفظه).
  select 'recipe_basis_mismatch', count(*) from (
    select v.id from public.recipe_versions v
    join public.recipe_lines l on l.org_id = v.org_id and l.version_id = v.id
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where v.status <> 'draft'
    group by v.id, v.basis_kg
    having sum(private.recipe_line_kg(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l))) <> v.basis_kg
  ) as x
  union all
  -- ٣) نسخة غير مسوّدة بلا سطور، أو سطر سائل بلا لقطة كثافة.
  select 'recipe_frozen_bad_lines', count(*) from public.recipe_versions v
  where v.status <> 'draft' and (
    not exists (select 1 from public.recipe_lines l where l.org_id = v.org_id and l.version_id = v.id)
    or exists (select 1 from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
      where l.org_id = v.org_id and l.version_id = v.id and i.base_unit = 'L' and l.density_kg_per_l is null))
  union all
  -- ٤) قيمة دفعة الناتج = كلفة الدفعة بالضبط (القاعدة ٢١: لا يضيع فلس بين الإنتاج والمخزن).
  select 'production_output_value', count(*) from public.production_batches b
  join public.stock_lots l on l.org_id = b.org_id and l.id = b.output_lot_id
  left join public.production_values pv on pv.org_id = b.org_id and pv.batch_id = b.id
  where b.status = 'posted' and (l.value_in is distinct from coalesce(pv.total_value, -1) or l.qty_in is distinct from b.output_qty_kg)
  union all
  -- ٥) كلفة الدفعة = مجموع قيم مدخلاتها + الكلف اليدوية (صفر في هذه النسخة).
  select 'production_value_sum', count(*) from public.production_values pv
  join public.production_batches b on b.org_id = pv.org_id and b.id = pv.batch_id
  where b.status = 'posted' and pv.input_value is distinct from coalesce((
    select sum(iv.value) from public.production_input_values iv where iv.org_id = pv.org_id and iv.batch_id = pv.batch_id), 0)
  union all
  -- ٦) قيمة كلّ مدخل = مجموع قيم سحوباته الفعلية بالسالب (الحركات لا السطور).
  select 'production_input_moves', count(*) from public.production_inputs p
  join public.production_batches b on b.org_id = p.org_id and b.id = p.batch_id
  left join public.production_input_values iv on iv.org_id = p.org_id and iv.input_id = p.id
  where b.status = 'posted' and coalesce(iv.value, -1) is distinct from coalesce((
    select -sum(m.value) from public.stock_moves m
    where m.org_id = p.org_id and m.doc_kind = 'production' and m.doc_id = b.id and m.doc_line_id = p.id and m.reverses_move_id is null), 0)
  union all
  -- ٧) الهدر = كتلة المدخلات − وزن الناتج، والمرحَّل كلّه بالثلاثة.
  select 'production_shrink', count(*) from public.production_batches b
  where b.status = 'posted' and (b.input_mass_kg is null or b.output_qty_kg is null or b.shrink_kg is distinct from round(b.input_mass_kg - b.output_qty_kg, 3))
  union all
  -- ٨) الملغاة صافي حركاتها صفر كميةً وقيمةً، والمرحَّلة لها حركة إدخال واحدة للناتج.
  select 'production_void_net', count(*) from (
    select b.id from public.production_batches b join public.stock_moves m on m.org_id = b.org_id and m.doc_kind = 'production' and m.doc_id = b.id
    where b.status = 'void' group by b.id having sum(m.qty) <> 0 or sum(m.value) <> 0
  ) as x
  union all
  -- ٩) كلّ حركة إنتاج دفعتها من دفعات المستند أو من مخزن مدخلاته (لا حركة في مخزن ثالث).
  select 'production_move_warehouse', count(*) from public.stock_moves m
  join public.production_batches b on b.org_id = m.org_id and b.id = m.doc_id
  where m.doc_kind = 'production' and m.warehouse_id not in (b.input_warehouse_id, b.output_warehouse_id)
$$;

-- ─── ع. الصلاحيات ───────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.activate_recipe_version(uuid, integer),
  public.create_production(uuid, uuid, numeric, uuid, uuid, date), public.preview_production(uuid),
  public.confirm_production_costs(uuid, integer), public.post_production(uuid, integer, text, uuid),
  public.void_production(uuid, text, uuid), public.recipes_overview(), public.recipe_detail(uuid, uuid),
  public.productions_overview(jsonb, integer), public.production_detail(uuid), public.verify_mill()
  from public, anon;
grant execute on function public.activate_recipe_version(uuid, integer),
  public.create_production(uuid, uuid, numeric, uuid, uuid, date), public.preview_production(uuid),
  public.confirm_production_costs(uuid, integer), public.post_production(uuid, integer, text, uuid),
  public.void_production(uuid, text, uuid), public.recipes_overview(), public.recipe_detail(uuid, uuid),
  public.productions_overview(jsonb, integer), public.production_detail(uuid) to authenticated;
revoke all on function public.verify_mill() from authenticated;
grant execute on function public.verify_mill() to service_role;
