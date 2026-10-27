-- 0005_scopes_stores_items — المواقع والمخازن والمواد ووحدات التعبئة والتصنيفات، والنطاق بالموقع والمخزن، ويوم التشغيل
--   (خطّة المرحلة 1 WP2؛ FOUNDATION «نموذج البيانات» ٢٣٧–٢٩٣، و٤٣٨–٤٤٧، و٥٢٨–٥٤٤، و٨١٢–٨١٣؛ DECISIONS 2026-10-26 Q1 وQ2).
-- المشكلة: المرحلة 1 كلها (الاستلام والتحويل والجرد والصرف) تحتاج مخازن لكل وحدة، ومواد بوحدة أساسها ووحدات تعبئتها، ونطاق
--   أمين المخزن بمخزنه مو بالوحدة كلها، ويوم تشغيل لكل وحدة (go_live_on) ما إله دالّة تحدّده. وماكو أفعال للبيانات الأساسية
--   بجدول الصلاحيات. هنا: sites وwarehouses (نوع الموقع والمخزن يطابق الوحدة، ومخزن بيض واحد فعّال لكل حقل)، وpack_types
--   وitem_categories وitems (الاسم المطبَّع والرموز الفريدة بين الفعّالة) وitem_units (افتراضي واحد) وexpense_categories (الفئات
--   النظامية الخمس)، وكلها كتابة مباشرة بسياسة (منشأة + فعل)، وبلا حذف أبداً (أرشفة). member_scopes بموقع ومخزن (هدف واحد
--   لكل صفّ)، وin_scope_site وin_scope_wh مرآة inScope، وset_member_scopes_v2 للمالك، وmy_workspace بمفاتيح النطاق الجديدة
--   وبوحدات «يلمسها» النطاق للتنقّل (E40)، وset_division_go_live (opening.post) يتجمّد بعد أوّل ترحيل (first_posted_at، E14)،
--   وfind_item_twins (التنبيه ثم السماح، Q2)، والبذور الافتراضية (E36) بـcreate_my_org وبملء للمنشآت الموجودة، وverify_stores.
--   وadd_member_v2: الدعوة ونطاقها (وحدات ومواقع ومخازن) بنداء واحد.
-- انحرافات مكتوبة عن الخطّة (WP2، جولة الإصلاح): كتابة المواقع والمخازن بنطاق الكاتب (FOUNDATION ٥٤٤)؛ وscale_step بلا
--   افتراض بالعمود (المشغّل: المعدود 1 والباقي 0.1)؛ وitems_name_norm_check؛ ووحدة الأساس ثابتة إذا للمادّة أي وحدة ولو مؤرشفة.
-- قرار المالك Q1: stores.manage للمدير (المواقع والمخازن والمواد ووحدات التعبئة والتصنيفات)؛ parties.manage وcash_accounts.manage
--   وexpense_categories.manage للمحاسب والمدير؛ party.create للأمين والمحاسب والمدير. الخمسة كلها هنا حتى الهجرات الجاية ما
--   تبدّل role_can مرّة ثانية.
-- تراجع: rollback_0005.sql يرجّع أجسام create_my_org وmy_workspace وprivate.actions وprivate.role_can كما انكتبت بـ0001–0002
--   (md5 نفسه)، ويشيل الجداول الجديدة وبذورها والأعمدة الجديدة؛ ويرفض بصوت إذا أي نطاق بموقع أو مخزن، بلا ما يحذف شي.
-- تنعاد بأمان: if not exists، create or replace، وكتل do تفحص الكتالوج قبل القيود والسياسات، والبذور بالوجود (ماكو حذف أبداً).

set lock_timeout = '5s';

-- ─── الأفعال وجدول الأدوار (Q1): نفس 0002 ويّا الأفعال الخمسة ──────────────────────────────────────────────────
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

-- ─── الوحدة: أوّل ترحيل يجمّد يوم تشغيلها (E14). تكتبه دوالّ الترحيل بس (المرحلة 1 من WP3) ────────────────────────
alter table public.divisions add column if not exists first_posted_at timestamptz;

-- ─── نوع الموقع والمخزن بنوع الوحدة (FOUNDATION ٢٦٣، ٢٧٥–٢٧٧؛ مرآتها src/domain/stores.ts) ──────────────────────────
create or replace function private.site_kind_for(p_division_kind text) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case p_division_kind
    when 'feed_mill' then 'mill'
    when 'hatchery' then 'hatchery'
    when 'broiler' then 'farm'
    when 'layer' then 'farm'
    when 'medicine' then 'store'
    when 'general' then 'store'
  end
$$;

create or replace function private.warehouse_kind_allowed(p_division_kind text, p_kind text) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select coalesce(case p_kind
    when 'raw' then p_division_kind = 'feed_mill'
    when 'feed' then p_division_kind = 'feed_mill'
    when 'hatching_egg' then p_division_kind = 'hatchery'
    when 'chick' then p_division_kind = 'hatchery'
    when 'medicine' then p_division_kind = 'medicine'
    when 'general' then p_division_kind = 'general'
    when 'farm' then p_division_kind in ('broiler', 'layer')
    when 'table_egg' then p_division_kind = 'layer'
  end, false)
$$;

-- ─── المواقع: حقل، معمل، مفقس، مخزن (FOUNDATION ٢٦٣) ─────────────────────────────────────────────────────────────
create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  division_id uuid not null,
  name text not null,
  kind text not null,
  archived_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint sites_name_check check (length(btrim(name)) between 1 and 80),
  constraint sites_kind_check check (kind in ('farm', 'mill', 'hatchery', 'store')),
  unique (org_id, id),
  unique (org_id, division_id, id),
  foreign key (org_id, division_id) references public.divisions (org_id, id)
);

-- ─── المخازن: الموقع من نفس الوحدة بالمفتاح المركّب، ومخزن بيض واحد فعّال لكل حقل (FOUNDATION ٢٧٦–٢٧٩) ──────────────
create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  division_id uuid not null,
  site_id uuid not null,
  name text not null,
  kind text not null,
  archived_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint warehouses_name_check check (length(btrim(name)) between 1 and 80),
  constraint warehouses_kind_check check (kind in ('raw', 'feed', 'medicine', 'general', 'hatching_egg', 'chick', 'table_egg', 'farm')),
  unique (org_id, id),
  unique (org_id, division_id, id),
  foreign key (org_id, division_id, site_id) references public.sites (org_id, division_id, id)
);
create index if not exists warehouses_site on public.warehouses (org_id, division_id, site_id);
create unique index if not exists warehouses_one_table_egg on public.warehouses (org_id, site_id)
  where kind = 'table_egg' and archived_at is null;

-- ─── أحجام التعبئة بالإعدادات: الكيس والكارتون (DECISIONS «الأكياس» و«الكارتون») ───────────────────────────────────
create table if not exists public.pack_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  label text not null,
  dimension text not null,
  factor numeric not null,
  archived_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint pack_types_label_check check (length(btrim(label)) between 1 and 40),
  constraint pack_types_dimension_check check (dimension in ('mass', 'volume', 'count')),
  constraint pack_types_factor_check check (abs(factor) < 'Infinity' and factor > 0 and factor = round(factor, 6)),
  constraint pack_types_count_whole_check check (dimension <> 'count' or factor = trunc(factor)),
  unique (org_id, id)
);

-- ─── تصنيفات المواد: اسم بس (E33) ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.item_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  name text not null,
  archived_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint item_categories_name_check check (length(btrim(name)) between 1 and 80),
  unique (org_id, id)
);

-- ─── المواد (FOUNDATION ٢٦٨–٢٧١): الاسم المطبَّع والرموز يكتبها المشغّل، والمعدود (البيض والأفراخ) بالقطعة ─────────────
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  name text not null,
  name_norm text not null default '',
  category_id uuid,
  kind text not null,
  base_unit text not null,
  density_kg_per_l numeric,
  piece_mass_kg numeric,
  tracks_expiry boolean not null default false,
  -- بلا افتراض بالعمود: المشغّل يحطّه بوحدة الأساس (المعدود 1 والباقي 0.1)، فـ0.1 ما يكسر قيد القطع الصحيحة بنفسه.
  scale_step numeric not null,
  min_qty numeric,
  barcode text,
  alt_codes text[] not null default '{}',
  archived_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint items_name_check check (length(btrim(name)) between 1 and 120),
  -- اسم من تطويل أو تشكيل بس يفرغ بـsearchable: ما ينبحث، ويطلع أوّل صفّ بكل قائمة (المشغّل يملأ الاسم المطبَّع قبل القيد).
  constraint items_name_norm_check check (name_norm <> ''),
  constraint items_kind_check check (kind in ('raw', 'additive', 'feed', 'medicine', 'vaccine', 'fuel', 'packaging',
    'hatching_egg', 'chick', 'table_egg', 'equipment', 'other')),
  constraint items_base_unit_check check (base_unit in ('kg', 'L', 'pc')),
  constraint items_count_kinds_check check (kind not in ('hatching_egg', 'chick', 'table_egg') or base_unit = 'pc'),
  constraint items_density_check check (abs(density_kg_per_l) < 'Infinity' and density_kg_per_l > 0 and density_kg_per_l = round(density_kg_per_l, 4)),
  constraint items_density_unit_check check (density_kg_per_l is null or base_unit = 'L'),
  constraint items_piece_mass_check check (abs(piece_mass_kg) < 'Infinity' and piece_mass_kg > 0 and piece_mass_kg = round(piece_mass_kg, 3)),
  constraint items_piece_mass_unit_check check (piece_mass_kg is null or base_unit = 'pc'),
  constraint items_scale_step_check check (abs(scale_step) < 'Infinity' and scale_step > 0 and scale_step = round(scale_step, 3)),
  constraint items_min_qty_check check (abs(min_qty) < 'Infinity' and min_qty >= 0 and min_qty = round(min_qty, 3)),
  constraint items_pieces_whole_check check (base_unit <> 'pc' or (scale_step = trunc(scale_step) and (min_qty is null or min_qty = trunc(min_qty)))),
  constraint items_barcode_check check (barcode is null or length(barcode) between 1 and 64),
  constraint items_alt_codes_check check (cardinality(alt_codes) <= 20 and array_position(alt_codes, null) is null),
  unique (org_id, id),
  foreign key (org_id, category_id) references public.item_categories (org_id, id)
);
create index if not exists items_category on public.items (org_id, category_id);
create index if not exists items_name_norm on public.items (org_id, name_norm collate "C", id);
-- الرمز يدلّ على مادّة وحدة بين الفعّالة (FOUNDATION ٨١٢): الباركود بفهرس، والرموز الإضافية بمشغّل المادّة.
create unique index if not exists items_barcode_active on public.items (org_id, barcode)
  where barcode is not null and archived_at is null;

-- ─── وحدات المادّة: «كيس 50 كغم» = 50 (FOUNDATION ٢٧٣)، من حجم تعبئة أو مخصّصة، وافتراضي واحد فعّال ─────────────────
create table if not exists public.item_units (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  item_id uuid not null,
  pack_type_id uuid,
  label text not null,
  factor_to_base numeric not null,
  is_default boolean not null default false,
  for_purchase boolean not null default true,
  for_sale boolean not null default true,
  for_recipe boolean not null default true,
  archived_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint item_units_label_check check (length(btrim(label)) between 1 and 40),
  constraint item_units_factor_check check (abs(factor_to_base) < 'Infinity' and factor_to_base > 0 and factor_to_base = round(factor_to_base, 6)),
  unique (org_id, id),
  foreign key (org_id, item_id) references public.items (org_id, id),
  foreign key (org_id, pack_type_id) references public.pack_types (org_id, id)
);
create index if not exists item_units_item on public.item_units (org_id, item_id);
create index if not exists item_units_pack on public.item_units (org_id, pack_type_id);
create unique index if not exists item_units_one_default on public.item_units (org_id, item_id)
  where is_default and archived_at is null;

-- ─── تصنيفات المصاريف، والنظامية بالرمز (FOUNDATION ٤٧٦، ٤٧٩، ٥٥١–٥٥٣): تتعدّل أسماؤها وما يتغيّر رمزها ولا تتؤرشف ──
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  name text not null,
  system_code text,
  archived_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint expense_categories_name_check check (length(btrim(name)) between 1 and 80),
  constraint expense_categories_system_code_check check (system_code is null or system_code ~ '^[a-z][a-z_]{1,39}$'),
  unique (org_id, id)
);
create unique index if not exists expense_categories_system_code on public.expense_categories (org_id, system_code)
  where system_code is not null;

-- ─── نطاق العضو بموقع أو مخزن (FOUNDATION ٢٤٤؛ القاعة بالمرحلة 3): هدف واحد بكل صفّ، مثل ScopeRow ──────────────────
alter table public.member_scopes add column if not exists site_id uuid;
alter table public.member_scopes add column if not exists warehouse_id uuid;
do $$
declare
  v_bad bigint;
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.member_scopes'::regclass and conname = 'member_scopes_site_fkey') then
    alter table public.member_scopes add constraint member_scopes_site_fkey foreign key (org_id, site_id) references public.sites (org_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.member_scopes'::regclass and conname = 'member_scopes_warehouse_fkey') then
    alter table public.member_scopes add constraint member_scopes_warehouse_fkey foreign key (org_id, warehouse_id) references public.warehouses (org_id, id);
  end if;
  -- القيد بلا تحقّق أوّلاً، والصفوف الموجودة تنعدّ قبل التحقّق: صفّ قديم بلا هدف يوقف الهجرة باسمه، مو قفل طويل ثم فشل عامّ.
  if not exists (select 1 from pg_constraint where conrelid = 'public.member_scopes'::regclass and conname = 'member_scopes_one_target') then
    alter table public.member_scopes add constraint member_scopes_one_target check (num_nonnulls(division_id, site_id, warehouse_id) = 1) not valid;
  end if;
  select count(*) into v_bad from public.member_scopes where num_nonnulls(division_id, site_id, warehouse_id) <> 1;
  if v_bad > 0 then
    raise exception 'scope_rows_invalid' using hint = format('يوجد %s من صفوف نطاق الموظفين بلا هدف واحد (وحدة أو موقع أو مخزن). صحّحها قبل تطبيق الهجرة.', v_bad);
  end if;
  alter table public.member_scopes validate constraint member_scopes_one_target;
end
$$;
create unique index if not exists member_scopes_member_site on public.member_scopes (org_id, member_id, site_id)
  where site_id is not null;
create unique index if not exists member_scopes_member_warehouse on public.member_scopes (org_id, member_id, warehouse_id)
  where warehouse_id is not null;
create index if not exists member_scopes_site on public.member_scopes (org_id, site_id);
create index if not exists member_scopes_warehouse on public.member_scopes (org_id, warehouse_id);

-- ─── المشغّلات ────────────────────────────────────────────────────────────────────────────────────────────────
-- كل تعديل مباشر يزيد النسخة بنفسه (الكتابة بشرط النسخة اللي انفتحت، FOUNDATION ٨١٧)، والأرشفة بوقت الخادم مو الجهاز:
-- الجهاز يبعث أي قيمة غير فارغة، والمؤرشف من قبل يبقى بوقته الأوّل.
create or replace function private.master_write() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  new.version := old.version + 1;
  if new.archived_at is not null then
    new.archived_at := coalesce(old.archived_at, now());
  end if;
  return new;
end
$$;

-- نوع الموقع بنوع وحدته، والموقع ما يتؤرشف وبيه مخازن فعّالة.
create or replace function private.sites_check() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_division text;
  v_expected text;
begin
  select d.kind into v_division from public.divisions d where d.org_id = new.org_id and d.id = new.division_id;
  v_expected := private.site_kind_for(v_division);
  if v_division is not null and new.kind is distinct from v_expected then
    raise exception 'site_kind_mismatch' using hint = 'نوع الموقع لا يناسب وحدته: المعمل لمعمل العلف، والمفقس للمفقس، والحقل لحقول اللحم والبيض، والمخزن لمخزن الأدوية والمخازن العامة.';
  end if;
  if tg_op = 'UPDATE' and new.archived_at is not null and old.archived_at is null
     and exists (select 1 from public.warehouses w where w.org_id = new.org_id and w.site_id = new.id and w.archived_at is null) then
    raise exception 'archived_in_use' using hint = 'في هذا الموقع مخازن فعّالة. أرشف مخازنه أوّلاً ثم أرشف الموقع.';
  end if;
  return new;
end
$$;

-- نوع المخزن مسموح بوحدته، والمخزن الفعّال بموقع فعّال (الإنشاء والإعادة من الأرشيف). صفّ الموقع ينقفل للمشاركة قبل الفحص:
-- أرشفة الموقع (تعديل صفّه) ومخزن جديد أو مُعاد بنفس اللحظة يترتّبون، والثاني يقرا الأوّل بعد ما يثبت (المفتاح الأجنبي ياخذ
-- KEY SHARE بس، وما يتعارض ويّا تعديل عمود مو مفتاح، فبلا هالقفل الاثنين يثبتون ويبقى مخزن فعّال بموقع مؤرشف).
create or replace function private.warehouses_check() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_division text;
begin
  select d.kind into v_division from public.divisions d where d.org_id = new.org_id and d.id = new.division_id;
  if v_division is not null and not private.warehouse_kind_allowed(v_division, new.kind) then
    raise exception 'warehouse_kind_mismatch' using hint = 'نوع المخزن لا يناسب وحدته: الموادّ الأوّلية والعلف للمعمل، وبيض التفقيس والأفراخ للمفقس، والأدوية لمخزن الأدوية، والعامّ للمخازن العامة، والحقل لحقول اللحم والبيض، وبيض المائدة لحقول البيض.';
  end if;
  if new.archived_at is null and (tg_op = 'INSERT' or old.archived_at is not null) then
    set local lock_timeout = '5s';
    perform 1 from public.sites s where s.org_id = new.org_id and s.id = new.site_id for share;
    if exists (select 1 from public.sites s where s.org_id = new.org_id and s.id = new.site_id and s.archived_at is not null) then
      raise exception 'site_archived' using hint = 'الموقع مؤرشف. أعِده من الأرشيف أوّلاً، ثم أضف المخزن أو أعِده.';
    end if;
  end if;
  return new;
end
$$;

-- المادّة: الاسم المطبَّع والرموز المطبَّعة يكتبها الخادم (searchable وnormalize_code، مرآة normalize.ts)، والرمز يدلّ على
-- مادّة وحدة بين الفعّالة (الباركود والإضافية سوا، FOUNDATION ٨١٢). قفل استشاري لكل رمز بترتيبه قبل الفحص، فإدخالان بنفس
-- الرمز بنفس اللحظة يترتّبون والثاني يلكى الأوّل. ووحدة الأساس ما تتبدّل والمادّة إلها أي وحدة تعبئة، حتى المؤرشفة: الوحدة
-- معرَّفة بوحدة الأساس اللي انكتبت بيها وما تنحذف (E52)، فتبديلها يخلّي «تنكة 18» كغم تصير 18 لتراً لو انعادت، والثوابت تعدّها.
-- والخطوة بلا قيمة بالإدخال: المعدود 1 والباقي 0.1 (افتراض العمود 0.1 كان يكسر قيد القطع الصحيحة لكل مادّة بالقطعة).
create or replace function private.items_normalize() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_codes text[];
  v_code text;
  v_other text;
  v_recheck boolean;
begin
  new.name_norm := private.searchable(new.name);
  new.barcode := nullif(private.normalize_code(new.barcode), '');
  new.alt_codes := array(
    select x.c from (select distinct private.normalize_code(a) collate "C" as c from unnest(coalesce(new.alt_codes, '{}'::text[])) as a) as x
    where x.c <> '' and x.c is distinct from new.barcode
    order by x.c
  );
  if tg_op = 'INSERT' then
    v_recheck := new.archived_at is null;
    if new.scale_step is null then
      new.scale_step := case when new.base_unit = 'pc' then 1 else 0.1 end;
    end if;
  else
    v_recheck := new.archived_at is null
      and (old.archived_at is not null or new.barcode is distinct from old.barcode or new.alt_codes is distinct from old.alt_codes);
    if new.base_unit is distinct from old.base_unit
       and exists (select 1 from public.item_units u where u.org_id = new.org_id and u.item_id = new.id) then
      raise exception 'base_unit_in_use' using hint = 'للمادّة وحدات تعبئة (ولو مؤرشفة) معرَّفة بوحدة أساسها الحالية، فلا تتغيّر. إن كانت الوحدة خاطئة فأرشف المادّة وأنشئ مادّة جديدة بالوحدة الصحيحة.';
    end if;
  end if;
  if v_recheck then
    v_codes := array(select c collate "C" from unnest(array_prepend(new.barcode, new.alt_codes)) as c where c is not null order by 1);
    if cardinality(v_codes) > 0 then
      set local lock_timeout = '5s';
      foreach v_code in array v_codes loop
        perform pg_advisory_xact_lock(hashtextextended('item_code:' || new.org_id::text || ':' || v_code, 0));
      end loop;
      select x.c, i.name into v_code, v_other
      from unnest(v_codes) as x(c)
      join public.items i on i.org_id = new.org_id and i.archived_at is null and i.id <> new.id and (i.barcode = x.c or x.c = any (i.alt_codes))
      order by x.c collate "C", i.name collate "C"
      limit 1;
      if v_other is not null then
        raise exception 'twin_exists' using hint = format('الرمز «%s» مستعمل للمادّة «%s»، والرمز يدلّ على مادّة واحدة. احذفه من إحدى المادّتين.', v_code, v_other);
      end if;
    end if;
  end if;
  return new;
end
$$;

-- وحدة المادّة: حجم التعبئة بنفس بُعد وحدة الأساس وبمعامله نفسه، ومعامل المعدود عدد صحيح، والافتراضي الجديد يلغي القديم.
-- صفّ المادّة ينقفل للمشاركة قبل ما تنقرا وحدة أساسها: تبديل وحدة الأساس (تعديل صفّ المادّة) ووحدة جديدة بنفس اللحظة
-- يترتّبون، والثاني يقرا الحاضر (المفتاح الأجنبي ياخذ KEY SHARE بس، وما يتعارض ويّا تعديل عمود مو مفتاح).
create or replace function private.item_units_check() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_base text;
  v_dimension text;
  v_factor numeric;
begin
  set local lock_timeout = '5s';
  select i.base_unit into v_base from public.items i where i.org_id = new.org_id and i.id = new.item_id for share;
  if new.pack_type_id is not null then
    select p.dimension, p.factor into v_dimension, v_factor from public.pack_types p where p.org_id = new.org_id and p.id = new.pack_type_id;
    if v_dimension is not null and v_base is not null
       and v_dimension <> (case v_base when 'kg' then 'mass' when 'L' then 'volume' else 'count' end) then
      raise exception 'pack_dimension_mismatch' using hint = 'حجم التعبئة لا يناسب وحدة أساس المادّة: الكيس بالكيلو لمادّة بالكيلو، والعبوة باللتر لمادّة باللتر، والكارتون بالعدد لمادّة معدودة.';
    end if;
    if v_factor is not null and new.factor_to_base <> v_factor then
      raise exception 'pack_factor_mismatch' using hint = 'معامل الوحدة يجب أن يساوي حجم التعبئة المختار. اختر الحجم من جديد أو استعمل وحدة مخصّصة.';
    end if;
  end if;
  if v_base = 'pc' and new.factor_to_base <> trunc(new.factor_to_base) then
    raise exception 'pieces_not_whole' using hint = 'المادّة معدودة، فوحدتها عدد صحيح من القطع. راجع المعامل.';
  end if;
  if new.is_default and new.archived_at is null then
    update public.item_units set is_default = false
    where org_id = new.org_id and item_id = new.item_id and id <> new.id and is_default and archived_at is null;
  end if;
  return new;
end
$$;

-- الفئة النظامية ما يتغيّر رمزها ولا تتؤرشف (المصاريف المحسوبة بالجرد والإتلاف والمرتجع تحتاجها).
create or replace function private.expense_categories_check() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if old.system_code is not null and (new.system_code is distinct from old.system_code or new.archived_at is not null) then
    raise exception 'system_expense' using hint = 'هذه فئة مصروف نظامية يستعملها النظام نفسه، فلا يتغيّر رمزها ولا تُؤرشف.';
  end if;
  return new;
end
$$;

create or replace trigger sites_check before insert or update on public.sites
  for each row execute function private.sites_check();
create or replace trigger warehouses_check before insert or update on public.warehouses
  for each row execute function private.warehouses_check();
create or replace trigger items_normalize before insert or update on public.items
  for each row execute function private.items_normalize();
create or replace trigger item_units_check before insert or update on public.item_units
  for each row execute function private.item_units_check();
create or replace trigger expense_categories_check before update on public.expense_categories
  for each row execute function private.expense_categories_check();

do $$
declare
  t text;
begin
  foreach t in array array['sites', 'warehouses', 'pack_types', 'item_categories', 'items', 'item_units', 'expense_categories'] loop
    execute format('create or replace trigger %I before update on public.%I for each row execute function private.master_write()', t || '_master', t);
    execute format('create or replace trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()', 'audit_' || t, t);
  end loop;
end
$$;

-- ─── RLS: القراءة لكل المنشأة (بلا كلفة، FOUNDATION ٤٤٣)، والكتابة بالمنشأة والفعل بكل بند، وماكو حذف (E52) ──────────
alter table public.sites enable row level security;
alter table public.warehouses enable row level security;
alter table public.pack_types enable row level security;
alter table public.item_categories enable row level security;
alter table public.items enable row level security;
alter table public.item_units enable row level security;
alter table public.expense_categories enable row level security;

-- الامتيازات على الأعمدة (classes.json columns): الواجهة تكتب الحقول اللي يملكها المستخدم بس؛ المنشأة والنسخة والاسم
-- المطبَّع والختم والرمز النظامي يكتبها الخادم. والنوع والموقع والمادّة ثابتة بعد الإنشاء (الغلط يتؤرشف ويتصحّح بسجلّ جديد).
revoke all on table public.sites, public.warehouses, public.pack_types, public.item_categories, public.items, public.item_units,
  public.expense_categories from anon, authenticated;
grant select on table public.sites, public.warehouses, public.pack_types, public.item_categories, public.items, public.item_units,
  public.expense_categories to authenticated;
grant insert (division_id, name, kind) on public.sites to authenticated;
grant update (name, archived_at) on public.sites to authenticated;
grant insert (division_id, site_id, name, kind) on public.warehouses to authenticated;
grant update (name, archived_at) on public.warehouses to authenticated;
grant insert (label, dimension, factor) on public.pack_types to authenticated;
grant update (label, archived_at) on public.pack_types to authenticated;
grant insert (name) on public.item_categories to authenticated;
grant update (name, archived_at) on public.item_categories to authenticated;
grant insert (name, category_id, kind, base_unit, density_kg_per_l, piece_mass_kg, tracks_expiry, scale_step, min_qty, barcode, alt_codes)
  on public.items to authenticated;
grant update (name, category_id, kind, base_unit, density_kg_per_l, piece_mass_kg, tracks_expiry, scale_step, min_qty, barcode, alt_codes, archived_at)
  on public.items to authenticated;
grant insert (item_id, pack_type_id, label, factor_to_base, is_default, for_purchase, for_sale, for_recipe) on public.item_units to authenticated;
grant update (label, factor_to_base, is_default, for_purchase, for_sale, for_recipe, archived_at) on public.item_units to authenticated;
grant insert (name) on public.expense_categories to authenticated;
grant update (name, archived_at) on public.expense_categories to authenticated;
revoke truncate on table public.sites, public.warehouses, public.pack_types, public.item_categories, public.items, public.item_units,
  public.expense_categories from service_role;

-- ─── النطاق: دوالّ هويّة definer تناديها السياسات والدوالّ (مرآة inScope بـsrc/domain/scope.ts) ──────────────────────────
-- المالك دائماً؛ بلا صفوف نطاق المدير والمحاسب كل المنشأة وغيرهم ولا شي؛ صفّ الوحدة يغطّي مواقعها ومخازنها، وصفّ الموقع
-- مخازنه، وصفّ المخزن نفسه. الشي لازم بمنشأة المستخدم.
create or replace function public.in_scope_site(p_site uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select case
      when m.role = 'owner' then true
      when not exists (
        select 1 from public.member_scopes s where s.org_id = m.org_id and s.member_id = m.id and s.archived_at is null
      ) then m.role in ('manager', 'accountant')
      else exists (
        select 1 from public.member_scopes s
        where s.org_id = m.org_id and s.member_id = m.id and s.archived_at is null
          and (s.site_id = x.id or s.division_id = x.division_id)
      )
    end
    from public.members m
    join public.sites x on x.org_id = m.org_id and x.id = p_site
    where m.user_id = auth.uid() and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
  ), false)
$$;

create or replace function public.in_scope_wh(p_warehouse uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select case
      when m.role = 'owner' then true
      when not exists (
        select 1 from public.member_scopes s where s.org_id = m.org_id and s.member_id = m.id and s.archived_at is null
      ) then m.role in ('manager', 'accountant')
      else exists (
        select 1 from public.member_scopes s
        where s.org_id = m.org_id and s.member_id = m.id and s.archived_at is null
          and (s.warehouse_id = w.id or s.site_id = w.site_id or s.division_id = w.division_id)
      )
    end
    from public.members m
    join public.warehouses w on w.org_id = m.org_id and w.id = p_warehouse
    where m.user_id = auth.uid() and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
  ), false)
$$;

-- سياسات الكتابة بعد دوالّ النطاق (in_scope_site وin_scope_wh): السياسة تعتمد على الدالّة، فتنشأ بعدها.
-- والمواقع والمخازن بنطاق الكاتب نفسه (FOUNDATION ٥٤٤: النطاق يدخل سياسات الكتابة): الموقع الجديد بوحدة بنطاقه، والمخزن
-- الجديد بموقع بنطاقه، والتعديل والأرشفة على صفّ بنطاقه؛ بدوالّ الهويّة على أعمدة الصفّ نفسه (بلا 42P17). المدير والمحاسب
-- بلا صفوف نطاق كل المنشأة، والمالك دائماً. المواد والأحجام والتصنيفات للمنشأة كلها (ما إلها وحدة).
do $$
declare
  p record;
  v_rule text;
begin
  for p in
    select * from (values
      ('sites', 'stores.manage', '(select public.in_scope_division(division_id))', '(select public.in_scope_site(id))'),
      ('warehouses', 'stores.manage', '(select public.in_scope_site(site_id))', '(select public.in_scope_wh(id))'),
      ('pack_types', 'stores.manage', null, null),
      ('item_categories', 'stores.manage', null, null),
      ('items', 'stores.manage', null, null),
      ('item_units', 'stores.manage', null, null),
      ('expense_categories', 'expense_categories.manage', null, null)
    ) as x(tbl, action, insert_scope, update_scope)
  loop
    v_rule := format('org_id = (select public.auth_org()) and (select public.can(%L))', p.action);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.tbl || '_read') then
      execute format('create policy %I on public.%I for select to authenticated using (org_id = (select public.auth_org()))', p.tbl || '_read', p.tbl);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.tbl || '_insert') then
      execute format('create policy %I on public.%I for insert to authenticated with check (%s%s)', p.tbl || '_insert', p.tbl, v_rule, coalesce(' and ' || p.insert_scope, ''));
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.tbl || '_update') then
      execute format('create policy %I on public.%I for update to authenticated using (%s%s) with check (%s%s)', p.tbl || '_update', p.tbl,
        v_rule, coalesce(' and ' || p.update_scope, ''), v_rule, coalesce(' and ' || p.update_scope, ''));
    end if;
  end loop;
end
$$;

-- للتنقّل بس (my_workspace().divisions، E40): الوحدة يلمسها النطاق إذا الصفّ هي، أو موقع بيها، أو مخزن بيها. in_scope_division
-- يبقى بمعناه: أمين مخزن بمخزن المخازن العامة يشوف قسمها بالشريط، وما يصير «بنطاق الوحدة كلها».
create or replace function private.scope_touches_division(p_division uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select case
      when m.role = 'owner' then true
      when not exists (
        select 1 from public.member_scopes s where s.org_id = m.org_id and s.member_id = m.id and s.archived_at is null
      ) then m.role in ('manager', 'accountant')
      else exists (
        select 1 from public.member_scopes s
        where s.org_id = m.org_id and s.member_id = m.id and s.archived_at is null
          and (s.division_id = p_division
            or exists (select 1 from public.sites x where x.org_id = s.org_id and x.id = s.site_id and x.division_id = p_division)
            or exists (select 1 from public.warehouses w where w.org_id = s.org_id and w.id = s.warehouse_id and w.division_id = p_division))
      )
    end
    from public.members m
    where m.user_id = auth.uid() and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
      and exists (select 1 from public.divisions d where d.org_id = m.org_id and d.id = p_division)
  ), false)
$$;

-- المواقع والمخازن المختارة كلها بمنشأة الداخل (مثل check_divisions)، قبل أي تعديل.
create or replace function private.check_sites(p_sites uuid[]) returns uuid[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_list uuid[] := coalesce(p_sites, '{}'::uuid[]);
begin
  if exists (
    select 1 from unnest(v_list) as x(id)
    where x.id is null or not exists (select 1 from public.sites s where s.org_id = public.auth_org() and s.id = x.id)
  ) then
    raise exception 'site_not_found' using hint = 'أحد المواقع المختارة غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  return array(select distinct x from unnest(v_list) as x);
end
$$;

create or replace function private.check_warehouses(p_warehouses uuid[]) returns uuid[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_list uuid[] := coalesce(p_warehouses, '{}'::uuid[]);
begin
  if exists (
    select 1 from unnest(v_list) as x(id)
    where x.id is null or not exists (select 1 from public.warehouses w where w.org_id = public.auth_org() and w.id = x.id)
  ) then
    raise exception 'warehouse_not_found' using hint = 'أحد المخازن المختارة غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  return array(select distinct x from unnest(v_list) as x);
end
$$;

-- يستبدل نطاق العضو بالقوائم الثلاث: الجديد ينضاف أو يرجع من الأرشيف، واللي طلع ينأرشف. ماكو حذف.
create or replace function private.apply_scopes_v2(p_member uuid, p_divisions uuid[], p_sites uuid[], p_warehouses uuid[]) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_id uuid;
begin
  foreach v_id in array coalesce(p_divisions, '{}'::uuid[]) loop
    insert into public.member_scopes (org_id, member_id, division_id) values (v_org, p_member, v_id)
    on conflict (org_id, member_id, division_id) where division_id is not null
    do update set archived_at = null where public.member_scopes.archived_at is not null;
  end loop;
  foreach v_id in array coalesce(p_sites, '{}'::uuid[]) loop
    insert into public.member_scopes (org_id, member_id, site_id) values (v_org, p_member, v_id)
    on conflict (org_id, member_id, site_id) where site_id is not null
    do update set archived_at = null where public.member_scopes.archived_at is not null;
  end loop;
  foreach v_id in array coalesce(p_warehouses, '{}'::uuid[]) loop
    insert into public.member_scopes (org_id, member_id, warehouse_id) values (v_org, p_member, v_id)
    on conflict (org_id, member_id, warehouse_id) where warehouse_id is not null
    do update set archived_at = null where public.member_scopes.archived_at is not null;
  end loop;
  update public.member_scopes set archived_at = now()
  where org_id = v_org and member_id = p_member and archived_at is null
    and not (coalesce(division_id = any (coalesce(p_divisions, '{}'::uuid[])), false)
      or coalesce(site_id = any (coalesce(p_sites, '{}'::uuid[])), false)
      or coalesce(warehouse_id = any (coalesce(p_warehouses, '{}'::uuid[])), false));
end
$$;

-- المالك بس (members.manage، DECISIONS ٢٠٧). set_member_scopes(uuid, uuid[]) القديمة تبقى باسمها وتوقيعها (FOUNDATION ٢٣٠):
-- تحطّ النطاق وحدات بس، فتؤرشف صفوف المواقع والمخازن.
create or replace function public.set_member_scopes_v2(p_member uuid, p_divisions uuid[], p_sites uuid[], p_warehouses uuid[]) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  m public.members;
  v_divisions uuid[];
  v_sites uuid[];
  v_warehouses uuid[];
begin
  set local lock_timeout = '5s';
  perform private.require('members.manage');
  v_divisions := private.check_divisions(p_divisions);
  v_sites := private.check_sites(p_sites);
  v_warehouses := private.check_warehouses(p_warehouses);
  m := private.org_member(p_member);
  perform private.apply_scopes_v2(m.id, v_divisions, v_sites, v_warehouses);
end
$$;

-- الدعوة بنطاقها كلّه بنداء واحد (المالك بس، members.manage): نفس add_member مال 0003 بفحوصه، ثم النطاق بالوحدات والمواقع
-- والمخازن بنفس المعاملة. بنداءين كان فشل الثاني يخلّي الدعوة بلا صفوف نطاق، والمدير والمحاسب بلاها كل المنشأة.
create or replace function public.add_member_v2(p_phone text, p_role text, p_display_name text, p_divisions uuid[], p_sites uuid[], p_warehouses uuid[]) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_member uuid;
  v_sites uuid[];
  v_warehouses uuid[];
begin
  perform private.require('members.manage');
  v_sites := private.check_sites(p_sites);
  v_warehouses := private.check_warehouses(p_warehouses);
  v_member := public.add_member(p_phone, p_role, p_display_name, p_divisions);
  perform private.apply_scopes_v2(v_member, private.check_divisions(p_divisions), v_sites, v_warehouses);
  return v_member;
end
$$;

-- ─── my_workspace: نفس 0001، ويّا site_id وwarehouse_id بكل صفّ نطاق، والوحدات اللي يلمسها النطاق (E40) ──────────────
create or replace function public.my_workspace() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_signed_in();
  m public.members;
  v_org_name text;
  v_invites jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'member_id', i.id, 'org_name', o.name, 'role', i.role, 'display_name', i.display_name, 'invited_at', i.created_at
    ) order by i.created_at), '[]'::jsonb)
  into v_invites
  from public.members i join public.orgs o on o.id = i.org_id
  where i.user_id = v_uid and i.accepted_at is null and i.archived_at is null;

  select * into m from public.members where user_id = v_uid and archived_at is null and accepted_at is not null;
  if m.id is null then
    return jsonb_build_object('user_id', v_uid, 'org_id', null, 'phone', private.user_phone(v_uid),
      'invites', v_invites, 'confirmed_at', now());
  end if;
  select o.name into v_org_name from public.orgs o where o.id = m.org_id;
  return jsonb_build_object(
    'user_id', v_uid,
    'org_id', m.org_id,
    'org_name', v_org_name,
    'member_id', m.id,
    'display_name', m.display_name,
    'phone', m.phone,
    'role', m.role,
    -- الهدف بمفتاحه (site_id أو warehouse_id)، وdivision_id دائماً وحدة الهدف: النسخ المنشورة قبل 0005 تقرا كل صفّ بـdivision_id
    -- نصّاً غير فارغ، وNULL يطيّح جلستها لحد ما تتحدّث خدمتها العاملة (FOUNDATION ٢٣٠: النسخ القديمة تعيش). المفاتيح الجديدة
    -- إضافة؛ والمحلّل الجديد ياخذ الأخصّ (المخزن ثم الموقع ثم الوحدة).
    'scopes', coalesce((
      select jsonb_agg(jsonb_build_object('division_id', coalesce(s.division_id, x.division_id, w.division_id), 'site_id', s.site_id, 'warehouse_id', s.warehouse_id)
        order by s.created_at, s.id)
      from public.member_scopes s
      left join public.sites x on x.org_id = s.org_id and x.id = s.site_id
      left join public.warehouses w on w.org_id = s.org_id and w.id = s.warehouse_id
      where s.org_id = m.org_id and s.member_id = m.id and s.archived_at is null
    ), '[]'::jsonb),
    'divisions', coalesce((
      select jsonb_agg(d.kind order by d.kind collate "C")
      from public.divisions d where d.org_id = m.org_id and d.archived_at is null and private.scope_touches_division(d.id)
    ), '[]'::jsonb),
    'can_see_cost', public.can_see_cost(),
    'can_see_accounts', public.can_see_accounts(),
    'can_see_sales', public.can_see_sales(),
    'invites', v_invites,
    'subscription', 'unknown',
    'confirmed_at', now()
  );
end
$$;

-- ─── يوم تشغيل الوحدة (Q1: المدير تحت opening.post): يتجمّد بعد أوّل ترحيل بيها، وما يدخل فترة مقفولة ولا يطلع منها ───
create or replace function public.set_division_go_live(p_division uuid, p_go_live_on date) returns date
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  d public.divisions;
  v_lock date;
begin
  set local lock_timeout = '5s';
  perform private.require('opening.post');
  select * into d from public.divisions where org_id = v_org and id = p_division for update;
  if d.id is null then
    raise exception 'division_not_found' using hint = 'هذه الوحدة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  -- المحصور بوحدات (FOUNDATION ٥٤٤، §2.12): يوم تشغيل وحدة برّا نطاقه يحدّد ترحيل كل مستنداتها، فما يحدّده.
  if not public.in_scope_division(d.id) then
    raise exception 'out_of_scope' using hint = format('وحدة «%s» خارج نطاقك، فلا تحدّد يوم تشغيلها. يحدّده مالك المنشأة أو من يدير هذه الوحدة.', d.name);
  end if;
  if p_go_live_on is null then
    raise exception 'date_required' using hint = 'اختر يوم تشغيل الوحدة.';
  end if;
  if d.first_posted_at is not null then
    raise exception 'go_live_frozen' using hint = format('بدأ الترحيل في هذه الوحدة يوم %s، فيوم تشغيلها %s ثابت لا يتغيّر.',
      to_char(d.first_posted_at at time zone 'Asia/Baghdad', 'DD/MM/YYYY'), coalesce(to_char(d.go_live_on, 'DD/MM/YYYY'), '—'));
  end if;
  select l.locked_through into v_lock from public.period_locks l where l.org_id = v_org;
  if v_lock is not null and (p_go_live_on <= v_lock or d.go_live_on <= v_lock) then
    raise exception 'period_locked' using hint = format('الحسابات مقفلة حتى %s، فلا يُضبط يوم تشغيل في الفترة المقفلة ولا يُنقل منها. إن كان ضرورياً فاطلب من مالك المنشأة فتح الفترة.',
      to_char(v_lock, 'DD/MM/YYYY'));
  end if;
  update public.divisions set go_live_on = p_go_live_on where org_id = v_org and id = d.id;
  return p_go_live_on;
end
$$;

-- ─── التوائم (Q2: التنبيه ثم السماح، FOUNDATION ٨١٣): الاسم المطبَّع أو أي رمز، بالتطبيع على الطرفين، والمؤرشفة ويّاها ───
create or replace function public.find_item_twins(p_name text, p_codes text[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_name text := nullif(private.searchable(coalesce(p_name, '')), '');
  v_codes text[];
begin
  -- بلا منشأة ماكو مواد: قائمة فارغة مثل دوالّ النطاق (false)، مو رفض؛ وكل عضو عنده read.
  if v_org is null then
    return '[]'::jsonb;
  end if;
  perform private.require('read');
  v_codes := array(
    select distinct x.c from (select nullif(private.normalize_code(c), '') as c from unnest(coalesce(p_codes, '{}'::text[])) as c) as x
    where x.c is not null
  );
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'name', i.name,
        'kind', i.kind,
        'base_unit', i.base_unit,
        'archived', i.archived_at is not null,
        'same_name', v_name is not null and i.name_norm = v_name,
        'codes', to_jsonb(array(select c from unnest(array_prepend(i.barcode, i.alt_codes)) as c where c = any (v_codes) order by c collate "C"))
      ) order by i.archived_at is not null, i.name_norm collate "C", i.id)
    from public.items i
    where i.org_id = v_org
      and ((v_name is not null and i.name_norm = v_name) or i.barcode = any (v_codes) or i.alt_codes && v_codes)
  ), '[]'::jsonb);
end
$$;

-- ─── البذور الافتراضية (E36، FOUNDATION ٨٣–٩٠، DECISIONS ١٣٦) ─────────────────────────────────────────────────────
-- لمنشأة الداخل (auth_org()، المساعد ما ياخذ المنشأة معاملاً، FOUNDATION ٥١٦)، أو بالملء بالهجرة (بلا داخل) لمنشأة
-- poultry.seed_org اللي تحطّها الهجرة نفسها لكل منشأة. كل مجموعة تنزرع بس إذا ما موجودة: موقع الوحدة (حتى المؤرشف)، وأي حجم
-- تعبئة، والفئة النظامية برمزها؛ وماكو حذف أبداً، فالمزروع مرّة ما يرجع ولو انعاد اسمه أو انؤرشف.
-- الحقول (اللحم والبيض) ينشئها المستخدم، والقاعات بالمرحلة 3.
create or replace function private.seed_org_defaults() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := coalesce(public.auth_org(), nullif(current_setting('poultry.seed_org', true), '')::uuid);
  g record;
  v_division uuid;
  v_site uuid;
begin
  if v_org is null then
    raise exception 'not_member' using hint = 'لست عضواً في منشأة، فلا تُزرع إعداداتها الافتراضية.';
  end if;
  for g in
    select * from (values
      (1, 'feed_mill', 'المعمل', 'mill', array['مخزن المواد الأوّلية', 'مخزن العلف'], array['raw', 'feed']),
      (2, 'hatchery', 'المفقس', 'hatchery', array['مخزن بيض التفقيس', 'مخزن الأفراخ'], array['hatching_egg', 'chick']),
      (3, 'medicine', 'مخزن الأدوية', 'store', array['مخزن الأدوية'], array['medicine']),
      (4, 'general', 'المخازن العامة', 'store', array['المخزن العام'], array['general'])
    ) as x(ord, division_kind, site_name, site_kind, stores, kinds)
    order by ord
  loop
    select d.id into v_division from public.divisions d where d.org_id = v_org and d.kind = g.division_kind;
    if v_division is null or exists (select 1 from public.sites s where s.org_id = v_org and s.division_id = v_division) then
      continue;
    end if;
    insert into public.sites (org_id, division_id, name, kind) values (v_org, v_division, g.site_name, g.site_kind) returning id into v_site;
    insert into public.warehouses (org_id, division_id, site_id, name, kind)
    select v_org, v_division, v_site, s.name, s.kind from unnest(g.stores, g.kinds) with ordinality as s(name, kind, n) order by s.n;
  end loop;
  if not exists (select 1 from public.pack_types p where p.org_id = v_org) then
    insert into public.pack_types (org_id, label, dimension, factor)
    values (v_org, 'كيس 25 كغم', 'mass', 25), (v_org, 'كيس 40 كغم', 'mass', 40), (v_org, 'كيس 50 كغم', 'mass', 50);
  end if;
  insert into public.expense_categories (org_id, name, system_code)
  values
    (v_org, 'إتلاف منتهي', 'expired_destroy'),
    (v_org, 'فرق جرد', 'count_diff'),
    (v_org, 'فرق سعر شراء', 'purchase_price_diff'),
    (v_org, 'فرق مرتجع', 'supplier_return_diff'),
    (v_org, 'استلام ملغى', 'voided_receipt')
  on conflict (org_id, system_code) where system_code is not null do nothing;
end
$$;

-- نفس create_my_org مال 0001، ويّا البذور الافتراضية بنفس المعاملة، وlock_timeout قبل القفل الاستشاري (§2.3).
create or replace function public.create_my_org(p_org_name text, p_display_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_signed_in();
  v_org_name text := private.check_name(p_org_name, 120, 'اسم المنشأة');
  v_display text := private.check_name(p_display_name, 80, 'اسمك');
  v_existing record;
  v_org uuid;
  v_div uuid;
  k record;
begin
  set local lock_timeout = '5s';
  -- نفس مفتاح قبول الدعوة: نداءان بنفس اللحظة لنفس المستخدم يترتّبون، والثاني يلكى العضوية.
  perform pg_advisory_xact_lock(hashtextextended('membership:' || v_uid::text, 0));
  select m.role, o.name, o.created_by into v_existing
  from public.members m join public.orgs o on o.id = m.org_id
  where m.user_id = v_uid and m.archived_at is null and m.accepted_at is not null;
  if found then
    if v_existing.role = 'owner' and v_existing.created_by = v_uid and v_existing.name = v_org_name then
      return public.my_workspace();
    end if;
    raise exception 'already_member' using hint = format('أنت عضو في منشأة «%s» بالفعل؛ حدّث الشاشة لفتحها. لا يمكن أن تكون عضواً في منشأتين معاً.', v_existing.name);
  end if;
  insert into public.orgs (name, created_by) values (v_org_name, v_uid) returning id into v_org;
  insert into public.members (org_id, user_id, role, display_name, phone, accepted_at)
  values (v_org, v_uid, 'owner', v_display, private.user_phone(v_uid), now());
  for k in
    select * from (values
      (1, 'feed_mill', 'معمل العلف'),
      (2, 'broiler', 'حقول اللحم'),
      (3, 'layer', 'حقول البيض'),
      (4, 'hatchery', 'المفقس'),
      (5, 'medicine', 'مخزن الأدوية'),
      (6, 'general', 'المخازن العامة')
    ) as t(ord, kind, name) order by ord
  loop
    insert into public.divisions (org_id, kind, name) values (v_org, k.kind, k.name) returning id into v_div;
    if k.kind = 'hatchery' then
      insert into public.ledger_books (org_id, division_id, code, name)
      values (v_org, v_div, 'chicks', 'دفتر الأفراخ'), (v_org, v_div, 'hatching_eggs', 'دفتر بيض التفقيس');
    else
      insert into public.ledger_books (org_id, division_id, code, name) values (v_org, v_div, 'main', 'دفتر ' || k.name);
    end if;
  end loop;
  -- العضوية انكتبت فوك، فـauth_org() بالمعاملة نفسها هي المنشأة الجديدة.
  perform private.seed_org_defaults();
  return public.my_workspace();
end
$$;

-- ملء المنشآت الموجودة قبل 0005 (E36): كل منشأة، حتى اللي ما بيها مالك حيّ (بلاها verify_stores.org_default_seeds يبقى غير
-- صفر للأبد، وماكو طريق ثاني يزرعها). الملء فعل الهجرة مو فعل شخص: المطالبات فارغة، فـauth.uid() فارغ لـcreated_by وللفاعل
-- بسجلّ التدقيق (FOUNDATION ٧٩٧)، والمنشأة من poultry.seed_org لحد ما ينتهي الملء؛ والمطالبات ترجع كما كانت.
do $$
declare
  o record;
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  for o in select x.id from public.orgs x order by x.id loop
    perform set_config('poultry.seed_org', o.id::text, true);
    perform private.seed_org_defaults();
  end loop;
  perform set_config('poultry.seed_org', '', true);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
end
$$;

-- ─── الثوابت: صفر مخالفة بالحزمة وبالإنتاج (FOUNDATION ٤٢٧، ٨٧٠). definer لأنها تنادي مساعدات private، ولـservice_role بس ──
create or replace function public.verify_stores() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select 'site_division_kind', count(*) from public.sites s
  join public.divisions d on d.org_id = s.org_id and d.id = s.division_id
  where s.kind is distinct from private.site_kind_for(d.kind)
  union all
  select 'warehouse_division_kind', count(*) from public.warehouses w
  join public.divisions d on d.org_id = w.org_id and d.id = w.division_id
  where not private.warehouse_kind_allowed(d.kind, w.kind)
  union all
  select 'active_store_on_archived_site', count(*) from public.warehouses w
  join public.sites s on s.org_id = w.org_id and s.id = w.site_id
  where w.archived_at is null and s.archived_at is not null
  union all
  select 'table_egg_per_site', count(*) from (
    select w.site_id from public.warehouses w where w.kind = 'table_egg' and w.archived_at is null group by w.org_id, w.site_id having count(*) > 1
  ) as x
  union all
  select 'item_normalized', count(*) from public.items i
  where i.name_norm is distinct from private.searchable(i.name)
    or i.barcode is distinct from nullif(private.normalize_code(i.barcode), '')
    or exists (select 1 from unnest(i.alt_codes) as c where c is distinct from private.normalize_code(c) or c = '' or c = i.barcode)
  union all
  select 'item_code_collisions', count(*) from (
    select i.org_id, c from public.items i cross join unnest(array_prepend(i.barcode, i.alt_codes)) as c
    where i.archived_at is null and c is not null group by i.org_id, c having count(*) > 1
  ) as x
  union all
  select 'item_unit_pack', count(*) from public.item_units u
  join public.items i on i.org_id = u.org_id and i.id = u.item_id
  join public.pack_types p on p.org_id = u.org_id and p.id = u.pack_type_id
  where p.factor <> u.factor_to_base or p.dimension <> case i.base_unit when 'kg' then 'mass' when 'L' then 'volume' else 'count' end
  union all
  select 'item_unit_pieces', count(*) from public.item_units u
  join public.items i on i.org_id = u.org_id and i.id = u.item_id
  where i.base_unit = 'pc' and u.factor_to_base <> trunc(u.factor_to_base)
  union all
  select 'item_unit_defaults', count(*) from (
    select u.item_id from public.item_units u where u.is_default and u.archived_at is null group by u.org_id, u.item_id having count(*) > 1
  ) as x
  union all
  select 'member_scope_targets', count(*) from public.member_scopes s where num_nonnulls(s.division_id, s.site_id, s.warehouse_id) <> 1
  union all
  select 'first_post_without_go_live', count(*) from public.divisions d where d.first_posted_at is not null and d.go_live_on is null
  union all
  select 'org_default_seeds', count(*) from public.orgs o
  where (select count(*) from public.expense_categories e where e.org_id = o.id and e.system_code in
          ('expired_destroy', 'count_diff', 'purchase_price_diff', 'supplier_return_diff', 'voided_receipt')) <> 5
    or not exists (select 1 from public.pack_types p where p.org_id = o.id)
    or exists (
      select 1 from public.divisions d
      where d.org_id = o.id and d.kind in ('feed_mill', 'hatchery', 'medicine', 'general')
        and not exists (select 1 from public.sites s where s.org_id = o.id and s.division_id = d.id)
    )
$$;

-- ─── قائمة السماح (نسختها بـsupabase/tests/allowlist.json) ─────────────────────────────────────────────────────
grant execute on function
  public.add_member_v2(text, text, text, uuid[], uuid[], uuid[]),
  public.in_scope_site(uuid),
  public.in_scope_wh(uuid),
  public.set_member_scopes_v2(uuid, uuid[], uuid[], uuid[]),
  public.set_division_go_live(uuid, date),
  public.find_item_twins(text, text[])
to authenticated;

grant execute on function public.verify_stores() to service_role;
