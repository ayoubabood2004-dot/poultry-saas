-- 0040_store_order_colors — ترتيب الموادّ بالسحب، وتلوين الرصيد اليوميّ باليد وتلقائيّاً (رسالتا الزبون الصوتيّتان وصورتا المخزن والرصيد
--   اليوميّ 2026-11-26؛ وأجوبة المالك بخيارات؛ DECISIONS 2026-11-26).
-- المشكلة: بطاقات المخزن بترتيب الاسم، والرصيد اليوميّ بالتصنيف ثمّ ترتيبه ثمّ الاسم، ونافذة «أدرج مواد» شيلت في 0035، فلا ترتيب يختاره
--   («انا ارتب المواد… نريد نحط الأساسيات بالبداية»)؛ ولا لون لمادّة ولا حدّ قلّة («أدوس عليها تتأشر أصفر، أي لون أريد، حتى من أدزلهم
--   الرصيد اليومي تكون مضللة»، و«من الاعدادات يكدر يخلي السستم تلقائيا: لمن مادة قليلة هيجي لونها ولمن مادة نافذة هيجي لونها»).
-- هنا:
--   • public.store_orders: ترتيب كلّ قسم من أقسام المخزن الثلاثة (موادّ العلف والعلف وأخرى) للمنشأة كلّها، يكتبه public.set_store_order
--     (stores.manage) بشرط القائمة التي رآها (كـset_recipe_order: order_changed إن تغيّرت، والإعادة بالترتيب المطلوب نفسه بلا رفض)، والترتيب كاملاً
--     بموادّ القسم كلّها. وprivate.section_items يقرأ موادّ القسم الفعّالة بهذا الترتيب، وما ليس فيه (مادّة جديدة) بعده بترتيب 0035 (التصنيف ثمّ
--     ترتيبه ثمّ الاسم)؛ ومنه يُرتَّب الرصيد اليوميّ وبطاقات المخزن معاً، وpublic.store_section_items (read) يعطي نافذة «رتّب» القائمة كاملة.
--     مصفوفة بلا مفتاح أجنبيّ (كـitem_order في 0022): مادّة حُذفت أو تغيّر نوعها تبقى معرّفاً لا يُرسم.
--   • public.item_marks: لكلّ مادّة لونها الذي اختاره (من ثمانية) وحدّ قلّتها بوحدة أساسها، صفّ واحد بنسخة لا تنزل (لا يُحذف: اللون الممسوح
--     null)، يكتبه public.set_item_color وpublic.set_item_low (stock_note.write) بشرط النسخة التي رآها، والإعادة بالقيمة نفسها بلا رفض. واللون
--     «يبقى حتى يشيله» (جواب المالك)، و«قليلة» بحدّ لكلّ مادّة (جواب المالك): الرصيد عنده أو أقلّ، و«نافدة» صفر أو أقلّ (private.stock_state).
--     بلا مفتاح أجنبيّ إلى items: الصفّ ليس استعمالاً، فـ«احذف» (delete_item وprivate.item_uses) كما هما.
--   • public.store_color_settings: «لوّن تلقائيّاً» ولونا القلّة والنفاد للمنشأة، يكتبه public.set_store_colors (stores.manage) بشرط النسخة؛ وبلا صفّ
--     التلقائيّ مطفأ والأصفر للقلّة والأحمر للنفاد.
--   • public.day_balance_sections (0035) على جسمه، ويرتّب بترتيب القسم أوّلاً، ويزيد لكلّ صفّ mark (اللون والحدّ والنسخة) وstate (out أو low أو
--     null، برصيد ذلك اليوم)، وللجواب colors وcan_arrange. وpublic.items_overview (0020) على جسمه، ويرتّب بترتيب القسم، ويزيد mark وstate (بما عندك
--     الآن) وcolors وcan_arrange. وpublic.item_mark (read) لملفّ المادّة: لونها وحدّها ووحدتها.
-- انحرافات مكتوبة (DECISIONS): الألوان ثمانية بأسمائها لا رموز حرّة (تُطبع وتُقرأ في الوضعين)؛ واللون باليد يغلب التلقائيّ؛ وقبل أيّ ترتيب تصير
--   بطاقات المخزن بترتيب الرصيد اليوميّ نفسه (التصنيف ثمّ الاسم) لا بالاسم وحده، فالشاشتان بترتيب واحد.
-- تراجع: rollback_0040.sql — يرجّع day_balance_sections كما في 0035 وitems_overview كما في 0020 حرفاً بحرف، ويُسقط الدوالّ والجداول الجديدة.
--   **طريق رفض**: ترتيب محفوظ لقسم، أو لون أو حدّ لمادّة، أو إعدادات ألوان، يوقف التراجع بصوت بلا أن يغيّر شيئاً (إسقاط الجداول يضيعها).
-- تنعاد بأمان: create table if not exists، وكتل do تفحص الكتالوج قبل السياسات، وcreate or replace.

set lock_timeout = '5s';

-- ─── أ. الأقسام والألوان والجداول ──────────────────────────────────────────────────────────────────────────────────
-- قسم المادّة بنوعها: مرآة قسمة day_balance_sections (0035) وsrc/pages/inventory/storeSections.ts.
create or replace function private.store_section(p_kind text) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case when p_kind in ('raw', 'additive') then 'feed_materials' when p_kind = 'feed' then 'feed' else 'other' end
$$;

-- الألوان الثمانية بأسمائها (مرآة src/pages/inventory/markColors.ts).
create or replace function private.mark_colors() returns text[]
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select array['yellow', 'orange', 'red', 'pink', 'purple', 'blue', 'green', 'gray']
$$;

-- مصفوفة معرّفات بلا تكرار ولا null.
create or replace function private.uuids_unique(p_ids uuid[]) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select coalesce(array_position(p_ids, null) is null and cardinality(p_ids) = (select count(distinct x.id) from unnest(p_ids) as x(id)), false)
$$;

-- حالة المادّة برصيدها: نافدة صفراً أو أقلّ، وقليلة عند حدّها أو تحته (جواب المالك: حدّ لكلّ مادّة)، وإلّا لا شيء.
create or replace function private.stock_state(p_qty numeric, p_low numeric) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case when p_qty <= 0 then 'out' when p_low is not null and p_qty <= p_low then 'low' end
$$;

create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  section text not null,
  item_ids uuid[] not null default '{}',
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint store_orders_section_check check (section in ('feed_materials', 'feed', 'other')),
  constraint store_orders_items_check check (private.uuids_unique(item_ids) and cardinality(item_ids) <= 5000),
  constraint store_orders_version_check check (version >= 1),
  unique (org_id, id),
  unique (org_id, section)
);

create table if not exists public.item_marks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  item_id uuid not null,
  color text,
  low_qty numeric,
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint item_marks_color_check check (color is null or color = any (private.mark_colors())),
  constraint item_marks_low_qty_check check (low_qty is null or (abs(low_qty) < 'Infinity' and low_qty > 0 and low_qty < 1000000000000 and low_qty = round(low_qty, 3))),
  constraint item_marks_version_check check (version >= 1),
  unique (org_id, id),
  unique (org_id, item_id)
);

create table if not exists public.store_color_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  auto boolean not null default false,
  low_color text not null default 'yellow',
  out_color text not null default 'red',
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint store_color_settings_low_color_check check (low_color = any (private.mark_colors())),
  constraint store_color_settings_out_color_check check (out_color = any (private.mark_colors())),
  constraint store_color_settings_version_check check (version >= 1),
  unique (org_id, id),
  unique (org_id)
);

alter table public.store_orders enable row level security;
alter table public.item_marks enable row level security;
alter table public.store_color_settings enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['store_orders', 'item_marks', 'store_color_settings'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_read') then
      execute format('create policy %I on public.%I for select to authenticated using (org_id = (select public.auth_org()))', t || '_read', t);
    end if;
    execute format('create or replace trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()', 'audit_' || t, t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('revoke truncate on table public.%I from service_role', t);
  end loop;
end
$$;

-- موادّ القسم الفعّالة بالترتيب الذي اختاره، وما ليس فيه بعده بترتيب 0035 (ما له تصنيف باسم التصنيف ثمّ ترتيبه فيه، ثمّ الباقي بالاسم).
create or replace function private.section_items(p_section text) returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(i.id order by array_position(o.item_ids, i.id) nulls last, c.id is null, c.name collate "C", c.id,
      array_position(c.item_order, i.id) nulls last, i.name_norm collate "C", i.id), '{}')
  from public.items i
  left join public.store_orders o on o.org_id = i.org_id and o.section = p_section
  left join public.item_categories c on c.org_id = i.org_id and c.id = i.category_id and c.archived_at is null
  where i.org_id = public.auth_org() and i.archived_at is null and private.store_section(i.kind) = p_section
$$;

-- إعدادات الألوان، وبلا صفّ الافتراض: التلقائيّ مطفأ، والأصفر للقلّة والأحمر للنفاد، والنسخة 0.
create or replace function private.store_colors_json() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select jsonb_build_object('auto', s.auto, 'low', s.low_color, 'out', s.out_color, 'version', s.version)
      from public.store_color_settings s where s.org_id = public.auth_org()),
    jsonb_build_object('auto', false, 'low', 'yellow', 'out', 'red', 'version', 0))
$$;

-- لون المادّة وحدّها ونسختها، أو null بلا صفّ.
create or replace function private.item_mark_json(m public.item_marks) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select case when m.id is null then null else jsonb_build_object('color', m.color, 'low_qty', round(m.low_qty, 3)::text, 'version', m.version) end
$$;

-- ─── ب. ترتيب الأقسام ────────────────────────────────────────────────────────────────────────────────────────────────────
-- القسم كاملاً بترتيبه لنافذة «رتّب»: كلّ مادّة فعّالة فيه، وكلّ ما لا يظهر في الرصيد اليوميّ أيضاً (لا مخزن يقبلها) ليكتمل الترتيب.
create or replace function public.store_section_items(p_section text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
begin
  perform private.require('read');
  if p_section is null or p_section not in ('feed_materials', 'feed', 'other') then
    raise exception 'bad_section' using hint = 'القسم إمّا موادّ العلف أو العلف أو أخرى. حدّث الشاشة وأعد المحاولة.';
  end if;
  return jsonb_build_object('section', p_section, 'can_arrange', public.can('stores.manage'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'kind', i.kind) order by x.n)
      from unnest(private.section_items(p_section)) with ordinality as x(id, n)
      join public.items i on i.org_id = v_org and i.id = x.id), '[]'::jsonb));
end
$$;

-- الترتيب كاملاً لقسم بشرط القائمة التي رآها الكاتب (p_expected): كلّ موادّ القسم الفعّالة الآن مرّة واحدة؛ وقائمة تغيّرت بعد القراءة (مادّة أُضيفت
-- أو حُذفت أو رتّبها جهاز آخر) order_changed، إلّا أن يكون الترتيب الآن هو المطلوب نفسه (إعادة بعد جواب ضاع). صفّ القسم يُقفل قبل قراءة القائمة
-- (ما قُرئ قبل انتظار قفل قديم بعده، درس 0025).
create or replace function public.set_store_order(p_section text, p_items uuid[], p_expected uuid[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_now uuid[];
  o public.store_orders;
begin
  set local lock_timeout = '5s';
  perform private.require('stores.manage');
  if p_section is null or p_section not in ('feed_materials', 'feed', 'other') then
    raise exception 'bad_section' using hint = 'القسم إمّا موادّ العلف أو العلف أو أخرى. حدّث الشاشة وأعد المحاولة.';
  end if;
  if p_items is null or p_expected is null then
    raise exception 'items_required' using hint = 'تعذّر الحفظ دون الترتيب وما رأيته منه. حدّث الشاشة وأعد المحاولة.';
  end if;
  if array_position(p_items, null) is not null then
    raise exception 'item_not_found' using hint = 'في الترتيب مادّة بلا معرّف. حدّث الشاشة وأعد المحاولة.';
  end if;
  if not private.uuids_unique(p_items) then
    raise exception 'duplicate_item' using hint = 'مادّة مكرّرة في الترتيب. حدّث الشاشة وأعد المحاولة.';
  end if;
  insert into public.store_orders (org_id, section) values (v_org, p_section) on conflict (org_id, section) do nothing;
  select * into o from public.store_orders x where x.org_id = v_org and x.section = p_section for update;
  v_now := private.section_items(p_section);
  if exists (select 1 from unnest(p_items) as x(id) where not (x.id = any (v_now))) then
    raise exception 'item_not_found' using hint = 'مادّة في الترتيب لم تعد في هذا القسم (حُذفت أو تغيّر نوعها). حدّث الشاشة ورتّب من جديد.';
  end if;
  if v_now <> p_items and v_now <> p_expected then
    raise exception 'order_changed' using hint = 'تغيّرت موادّ القسم أو ترتيبها من نافذة أو جهاز آخر بعد أن فتحت «رتّب». حدّث الشاشة ورتّب من جديد.';
  end if;
  if cardinality(p_items) <> cardinality(v_now) then
    raise exception 'items_required' using hint = 'الترتيب لا يشمل كلّ موادّ القسم. حدّث الشاشة وأعد المحاولة.';
  end if;
  if v_now <> p_items then
    update public.store_orders x set item_ids = p_items, version = x.version + 1, updated_at = now(), updated_by = auth.uid()
    where x.org_id = v_org and x.id = o.id returning * into o;
  end if;
  return jsonb_build_object('section', p_section, 'count', cardinality(p_items), 'version', o.version);
end
$$;

-- ─── ج. لون المادّة وحدّ قلّتها ──────────────────────────────────────────────────────────────────────────────────────────
-- لون المادّة (null يشيله) بشرط نسخة صفّها التي رآها الكاتب (0 بلا صفّ)؛ واللون نفسه الآن نجاح بلا كتابة (إعادة بعد جواب ضاع، أو جهاز آخر لوّنها
-- باللون نفسه). المادّة حيّة في المنشأة.
create or replace function public.set_item_color(p_item uuid, p_color text, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  i public.items;
  m public.item_marks;
begin
  set local lock_timeout = '5s';
  perform private.require('stock_note.write');
  if p_color is not null and not (p_color = any (private.mark_colors())) then
    raise exception 'bad_color' using hint = 'اختر لوناً من الألوان المعروضة.';
  end if;
  select * into i from public.items x where x.org_id = v_org and x.id = p_item;
  if i.id is null or i.archived_at is not null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك أو محذوفة. حدّث الشاشة.';
  end if;
  select * into m from public.item_marks x where x.org_id = v_org and x.item_id = i.id for update;
  if m.color is not distinct from p_color then
    return jsonb_build_object('item_id', i.id, 'mark', private.item_mark_json(m));
  end if;
  if coalesce(m.version, 0) is distinct from p_expected_version then
    raise exception 'mark_changed' using hint = format('تغيّر لون «%s» أو حدّ قلّتها من جهاز آخر. حدّث الشاشة ثمّ لوّنها.', i.name);
  end if;
  if m.id is null then
    begin
      insert into public.item_marks (org_id, item_id, color) values (v_org, i.id, p_color) returning * into m;
    exception when unique_violation then
      raise exception 'mark_changed' using hint = format('لُوّنت «%s» من جهاز آخر الآن. حدّث الشاشة ثمّ لوّنها.', i.name);
    end;
  else
    update public.item_marks x set color = p_color, version = x.version + 1, updated_at = now(), updated_by = auth.uid()
    where x.org_id = v_org and x.id = m.id returning * into m;
  end if;
  return jsonb_build_object('item_id', i.id, 'mark', private.item_mark_json(m));
end
$$;

-- حدّ قلّة المادّة بوحدة أساسها (null يشيله): رقم أكبر من صفر بثلاث مراتب على الأكثر، بشرط النسخة كاللون، والحدّ نفسه الآن نجاح بلا كتابة.
create or replace function public.set_item_low(p_item uuid, p_low_qty numeric, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  i public.items;
  m public.item_marks;
begin
  set local lock_timeout = '5s';
  perform private.require('stock_note.write');
  if p_low_qty is not null and not (abs(p_low_qty) < 'Infinity' and p_low_qty > 0 and p_low_qty < 1000000000000 and p_low_qty = round(p_low_qty, 3)) then
    raise exception 'bad_low_qty' using hint = 'حدّ القلّة رقم أكبر من صفر، بثلاث مراتب عشرية على الأكثر.';
  end if;
  select * into i from public.items x where x.org_id = v_org and x.id = p_item;
  if i.id is null or i.archived_at is not null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك أو محذوفة. حدّث الشاشة.';
  end if;
  select * into m from public.item_marks x where x.org_id = v_org and x.item_id = i.id for update;
  if m.low_qty is not distinct from p_low_qty then
    return jsonb_build_object('item_id', i.id, 'mark', private.item_mark_json(m));
  end if;
  if coalesce(m.version, 0) is distinct from p_expected_version then
    raise exception 'mark_changed' using hint = format('تغيّر لون «%s» أو حدّ قلّتها من جهاز آخر. حدّث الشاشة ثمّ اكتب الحدّ.', i.name);
  end if;
  if m.id is null then
    begin
      insert into public.item_marks (org_id, item_id, low_qty) values (v_org, i.id, p_low_qty) returning * into m;
    exception when unique_violation then
      raise exception 'mark_changed' using hint = format('كُتب حدّ «%s» من جهاز آخر الآن. حدّث الشاشة ثمّ اكتب الحدّ.', i.name);
    end;
  else
    update public.item_marks x set low_qty = p_low_qty, version = x.version + 1, updated_at = now(), updated_by = auth.uid()
    where x.org_id = v_org and x.id = m.id returning * into m;
  end if;
  return jsonb_build_object('item_id', i.id, 'mark', private.item_mark_json(m));
end
$$;

-- ─── د. ألوان القلّة والنفاد ────────────────────────────────────────────────────────────────────────────────────────────
-- «لوّن تلقائيّاً» ولونا القلّة والنفاد بشرط النسخة (0 بلا صفّ)، والإعدادات نفسها الآن نجاح بلا كتابة.
create or replace function public.set_store_colors(p_auto boolean, p_low_color text, p_out_color text, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  s public.store_color_settings;
begin
  set local lock_timeout = '5s';
  perform private.require('stores.manage');
  if p_auto is null or p_low_color is null or p_out_color is null
      or not (p_low_color = any (private.mark_colors())) or not (p_out_color = any (private.mark_colors())) then
    raise exception 'bad_color' using hint = 'اختر لون القلّة ولون النفاد من الألوان المعروضة.';
  end if;
  select * into s from public.store_color_settings x where x.org_id = v_org for update;
  if (coalesce(s.auto, false), coalesce(s.low_color, 'yellow'), coalesce(s.out_color, 'red')) is not distinct from (p_auto, p_low_color, p_out_color) then
    return private.store_colors_json();
  end if;
  if coalesce(s.version, 0) is distinct from p_expected_version then
    raise exception 'colors_changed' using hint = 'تغيّرت ألوان الرصيد من جهاز آخر. حدّث الشاشة ثمّ احفظها.';
  end if;
  if s.id is null then
    begin
      insert into public.store_color_settings (org_id, auto, low_color, out_color) values (v_org, p_auto, p_low_color, p_out_color);
    exception when unique_violation then
      raise exception 'colors_changed' using hint = 'حُفظت ألوان الرصيد من جهاز آخر الآن. حدّث الشاشة ثمّ احفظها.';
    end;
  else
    update public.store_color_settings x set auto = p_auto, low_color = p_low_color, out_color = p_out_color, version = x.version + 1,
      updated_at = now(), updated_by = auth.uid()
    where x.org_id = v_org and x.id = s.id;
  end if;
  return private.store_colors_json();
end
$$;

-- ─── هـ. القرّاء ────────────────────────────────────────────────────────────────────────────────────────────────────────
-- لون المادّة وحدّها لملفّها (read)، ووحدتها، والإعدادات (فيعرف الملفّ لون القلّة)، وهل يكتبها القارئ.
create or replace function public.item_mark(p_item uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  i public.items;
  m public.item_marks;
begin
  perform private.require('read');
  select * into i from public.items x where x.org_id = v_org and x.id = p_item;
  if i.id is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  select * into m from public.item_marks x where x.org_id = v_org and x.item_id = i.id;
  return jsonb_build_object('item_id', i.id, 'base_unit', i.base_unit, 'can_mark', public.can('stock_note.write'), 'mark', private.item_mark_json(m),
    'colors', private.store_colors_json());
end
$$;

-- الرصيد اليوميّ (0035) على جسمه: بترتيب القسم، ولون كلّ مادّة وحدّها وحالتها في ذلك اليوم، والإعدادات.
create or replace function public.day_balance_sections(p_on date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_on date := coalesce(p_on, public.app_today());
  v_sections jsonb;
begin
  perform private.require('read');
  if not isfinite(v_on) then
    raise exception 'date_required' using hint = 'اختر يوماً من التقويم.';
  end if;
  if v_on > v_today then
    raise exception 'day_in_future' using hint = format('يوم %s لم يأتِ بعد؛ الرصيد يُعرض حتى اليوم %s.', to_char(v_on, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY'));
  end if;
  with stores as (
    select y.id, y.kind from public.warehouses y where y.org_id = v_org and public.in_scope_wh(y.id)
  ), picked as (
    select i.id, i.name, i.name_norm, i.kind, i.base_unit, i.category_id,
      case when i.kind in ('raw', 'additive') then 'feed_materials' when i.kind = 'feed' then 'feed' else 'other' end as section
    from public.items i
    where i.org_id = v_org and i.archived_at is null and exists (select 1 from stores s where private.item_admissible(s.kind, i.kind))
  ), bal as (
    select m.item_id, sum(m.qty) as qty from public.stock_moves m
    where m.org_id = v_org and m.moved_on <= v_on and m.item_id in (select p.id from picked p) and m.warehouse_id in (select s.id from stores s)
    group by m.item_id
  ), ranks as (
    select s.key, x.id, x.n from (values ('feed_materials'), ('feed'), ('other')) as s(key)
    cross join lateral unnest(private.section_items(s.key)) with ordinality as x(id, n)
  ), listed as (
    select p.section, p.id, p.name_norm, c.id as category_id, c.name as category_name, array_position(c.item_order, p.id) as pos, rk.n as rank,
      jsonb_build_object('item_id', p.id, 'name', p.name, 'kind', p.kind, 'base_unit', p.base_unit, 'qty', round(coalesce(b.qty, 0), 3)::text,
        'note', case when n.id is null then null else jsonb_build_object('text', n.note, 'version', n.version) end,
        'category', case when c.id is null then null else jsonb_build_object('id', c.id, 'name', c.name) end,
        'mark', private.item_mark_json(mk), 'state', private.stock_state(coalesce(b.qty, 0), mk.low_qty)) as j
    from picked p
    left join bal b on b.item_id = p.id
    left join ranks rk on rk.key = p.section and rk.id = p.id
    left join public.item_marks mk on mk.org_id = v_org and mk.item_id = p.id
    left join public.item_categories c on c.org_id = v_org and c.id = p.category_id and c.archived_at is null
    left join public.stock_day_notes n on n.org_id = v_org and n.item_id = p.id and n.on_date = v_on
  )
  select jsonb_agg(jsonb_build_object('key', k.key, 'rows', coalesce((select jsonb_agg(r.j order by r.rank nulls last, r.category_id is null,
        r.category_name collate "C", r.category_id, r.pos nulls last, r.name_norm collate "C", r.id) from listed r where r.section = k.key), '[]'::jsonb)) order by k.n)
  into v_sections
  from (values (1, 'feed_materials'), (2, 'feed'), (3, 'other')) as k(n, key);
  return jsonb_build_object('today', v_today, 'on', v_on, 'can_note', public.can('stock_note.write'), 'sections', v_sections,
    'colors', private.store_colors_json(), 'can_arrange', public.can('stores.manage'));
end
$$;

-- بطاقات المخزن (0020) على جسمها: بترتيب القسم، ولون كلّ مادّة وحالتها بما عندك الآن، والإعدادات.
create or replace function public.items_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_record boolean;
  v_result jsonb;
begin
  perform private.require('read');
  v_record := public.can('purchase.record');
  with hand as (
    select s.item_id, sum(s.qty) as qty from public.stock_balances s
    where s.org_id = v_org and public.in_scope_wh(s.warehouse_id)
    group by s.item_id
  ), lines as (
    select l.item_id, l.qty_in, r.received_on, coalesce(rv.new_total, la.line_total, 0) as value,
      (pp.id is not null and pp.unit_price is null and rv.new_total is null) as unpriced
    from public.stock_lots l
    join public.receipts r on r.org_id = l.org_id and r.id = l.source_id
    left join public.receipt_line_amounts la on la.org_id = l.org_id and la.line_id = l.source_line_id
    left join public.purchase_prices pp on pp.org_id = l.org_id and pp.line_id = l.source_line_id
    left join lateral (
      select v.new_total from public.receipt_revaluations v
      where v.org_id = l.org_id and v.receipt_line_id = l.source_line_id and v.status = 'posted' order by v.rev_no desc limit 1
    ) as rv on true
    where l.org_id = v_org and l.source_kind = 'receipt' and l.origin_lot_id is null and r.status = 'posted' and public.in_scope_wh(l.warehouse_id)
  ), buys as (
    select x.item_id, sum(x.qty_in) as qty, coalesce(sum(x.qty_in) filter (where not x.unpriced), 0) as priced_qty, sum(x.value) as value,
      max(x.received_on) as last_on, (count(*) filter (where x.unpriced))::int as unpriced
    from lines x group by x.item_id
  ), ranks as (
    select s.key, x.id, x.n from (values ('feed_materials'), ('feed'), ('other')) as s(key)
    cross join lateral unnest(private.section_items(s.key)) with ordinality as x(id, n)
  )
  select jsonb_build_object('today', public.app_today(), 'can_record', v_record, 'can_add_item', public.can('item.create'),
    'colors', private.store_colors_json(), 'can_arrange', public.can('stores.manage'),
    'items', coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'kind', i.kind, 'base_unit', i.base_unit,
      'on_hand_qty', coalesce(h.qty, 0)::text, 'purchased_qty', coalesce(u.qty, 0)::text, 'last_purchase_on', u.last_on,
      'unpriced_count', coalesce(u.unpriced, 0),
      'mark', private.item_mark_json(mk), 'state', private.stock_state(coalesce(h.qty, 0), mk.low_qty),
      'money', jsonb_build_object('sell_price', s.sell_price::text,
        'avg_unit_price', case when u.priced_qty > 0 then private._mul_div_round(1, u.value, u.priced_qty, 2)::text end))
      order by array_position(array['feed_materials', 'feed', 'other'], private.store_section(i.kind)), rk.n nulls last, i.name_norm collate "C", i.id), '[]'::jsonb))
  into v_result
  from public.items i
  left join hand h on h.item_id = i.id
  left join buys u on u.item_id = i.id
  left join public.item_prices s on s.org_id = i.org_id and s.item_id = i.id
  left join ranks rk on rk.key = private.store_section(i.kind) and rk.id = i.id
  left join public.item_marks mk on mk.org_id = i.org_id and mk.item_id = i.id
  where i.org_id = v_org and i.archived_at is null;
  if v_record then
    return v_result;
  end if;
  return private.mask(v_result);
end
$$;

-- ─── و. الصلاحيات ─────────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.store_section_items(text), public.set_store_order(text, uuid[], uuid[]), public.set_item_color(uuid, text, int),
  public.set_item_low(uuid, numeric, int), public.set_store_colors(boolean, text, text, int), public.item_mark(uuid) from public, anon;
grant execute on function public.store_section_items(text), public.set_store_order(text, uuid[], uuid[]), public.set_item_color(uuid, text, int),
  public.set_item_low(uuid, numeric, int), public.set_store_colors(boolean, text, text, int), public.item_mark(uuid) to authenticated;
