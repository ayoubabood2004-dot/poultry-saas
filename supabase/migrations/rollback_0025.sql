-- rollback_0025 — تراجع 0025_mill_materials_only («الخلطة موادّ، والكميات عند الإنتاج»؛ مشغّل التراجع بالحزمة FOUNDATION ٨٢٠، ٨٧٦). يُسقط
-- produce_batch وproduction_form وrecipe_history وprivate.feed_balance_wh وprivate.last_posted_batch، ويرجّع private.recipe_lines_guard وrecipes_overview (كما في 0023)
-- وcreate_recipe وnew_recipe_version وactivate_recipe_version وprivate.recipe_expected وrecipe_detail وcreate_production وproduction_detail
-- وverify_mill (كما في 0016) وprivate.seed_org_defaults (كما في 0005) حرفاً بحرف (md5 نفسه بالكتالوج)، ويُسقط عمود
-- production_batches.saved_to_recipe، ويعيد قيدَي الكمية والأساس كما في 0015 وعدم فراغهما، ويرجّع «رصيد العلف» في وحدة المعمل «مخزن العلف».
-- **طريق رفض (الكتلة أدناه):** قاعدة 0024 لا تعرف خلطة بلا كميات: دفعة حُفظت موادّها في خلطتها (العمود يسقط فيضيع أنّها صارت نسخة)، أو نسخة
-- خلطة بلا أساس، أو سطر خلطة بلا كمية (عمودان لا يقبلان الفراغ بعد التراجع، والنسخة المجمَّدة لا تُعدَّل)، كلّ واحد يوقف التراجع بصوت بلا أن
-- يغيّر شيئاً. والفروع الثلاثة منفصلة حتّى يُفحص كلّ واحد وحده؛ ودفعة حُفظت موادّها نسختُها بلا أساس ولا كميات دائماً (produce_batch)، فالفرعان
-- الآخران يوقفانها كذلك، وفرعها يسمّيها باسمها.
-- تنعاد بأمان: drop if exists، وcreate or replace، وdrop constraint/column if exists.

set lock_timeout = '5s';

-- ٠) طريق الرفض: لا تُمسح خلطة بلا كميات ولا ما حُفظ من الإنتاج فيها.
do $$
declare
  v_saved bigint;
  v_bases bigint;
  v_base_recipe text;
  v_lines bigint;
  v_line_recipe text;
begin
  select count(*) into v_saved from public.production_batches where saved_to_recipe;
  if v_saved > 0 then
    raise exception 'rollback_blocked'
      using hint = format('في القاعدة %s دفعة إنتاج حُفظت موادّها نسخةً جديدة من خلطتها. التراجع يُسقط هذا السجلّ وقاعدته لا تعرف خلطة بلا كميات: لا تراجع عن 0025 ما دامت موجودة.',
        v_saved);
  end if;
  select count(*), (array_agg(r.name order by r.name collate "C", r.id))[1] into v_bases, v_base_recipe
  from public.recipe_versions v join public.recipes r on r.org_id = v.org_id and r.id = v.recipe_id
  where v.basis_kg is null;
  if v_bases > 0 then
    raise exception 'rollback_blocked'
      using hint = format('في القاعدة %s نسخة خلطة بلا أساس (خلطة بالموادّ وحدها)، أوّلها في خلطة «%s». قاعدة 0024 تطلب أساساً لكلّ نسخة، والنسخة المجمَّدة لا تُعدَّل: لا تراجع عن 0025 ما دامت موجودة.',
        v_bases, v_base_recipe);
  end if;
  select count(*), (array_agg(r.name order by r.name collate "C", r.id))[1] into v_lines, v_line_recipe
  from public.recipe_lines l
  join public.recipe_versions v on v.org_id = l.org_id and v.id = l.version_id
  join public.recipes r on r.org_id = v.org_id and r.id = v.recipe_id
  where l.qty is null;
  if v_lines > 0 then
    raise exception 'rollback_blocked'
      using hint = format('في القاعدة %s سطر خلطة بلا كمية، أوّلها في خلطة «%s». قاعدة 0024 تطلب كمية لكلّ سطر: لا تراجع عن 0025 ما دامت موجودة.',
        v_lines, v_line_recipe);
  end if;
end
$$;

-- ١) الدوالّ الجديدة (قبل الأجسام المستعادة؛ مساعدها private.feed_balance_wh يسقط في الآخر):
drop function if exists public.recipe_history(uuid, date, date);
drop function if exists public.production_form(uuid);
drop function if exists public.produce_batch(uuid, uuid, uuid, uuid, jsonb, boolean, boolean, date, numeric, date, text, text, uuid);

-- ٢) الأجسام كما كانت قبل 0025 حرفاً بحرف:

-- private.recipe_lines_guard كما في 0023_mill_order_produce حرفاً بحرف:
create or replace function private.recipe_lines_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.recipe_versions;
  i public.items;
begin
  set local lock_timeout = '5s';
  -- لقطات الكثافة و«داخل الكتلة» ووحدة الأساس أعمدة غير ممنوحة لأحد، فتغيّرها لا يكون إلا من دالّة التفعيل أو الملء بالهجرة (حدّها المنح لا
  -- current_user).
  if tg_op = 'UPDATE' and (new.density_kg_per_l is distinct from old.density_kg_per_l or new.in_basis is distinct from old.in_basis
    or new.base_unit is distinct from old.base_unit) then
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
  -- ترتيب السطور وحده (set_recipe_line_order، 0023؛ مراجعة 0023 #7): لا يُعاد فحص المادّة، فمادّة أُرشفت بعد إدراجها لا تمنع الترتيب
  -- برسالة لا تسمّيها؛ ورقم النسخة يزيد كما في كلّ تعديل.
  if tg_op = 'UPDATE' and current_setting('app.recipe_line_order', true) = 'on' and (to_jsonb(new) - 'line_no') = (to_jsonb(old) - 'line_no') then
    update public.recipe_versions set version = version + 1 where org_id = v.org_id and id = v.id;
    return new;
  end if;
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
  -- الكثافة تُكتب من نافذة «عدّل» في «المواد» (مراجعة 0016 السادسة #4، ق٦٥): كان التلميح يقول «بطاقة المادّة»، والكثافة فيها قراءة فقط.
  if new.unit = 'L' and i.density_kg_per_l is null then
    raise exception 'density_required' using hint = format('«%s» سائل بلا كثافة، فلا يُحسب وزنه. اكتب كثافته من «المواد» في المخزن (زرّ «عدّل» بجانبها) ثمّ فعّل.', i.name);
  end if;
  -- سطر لتر تُقرَّب كتلته صفراً بالكيلو (مراجعة 0016 السادسة #2، ق٦٤؛ القاعدة ٤: kg = round3(L × الكثافة)): 0.001 لتر بكثافة أقلّ من 0.5 كتلته 0.000، فكانت
  -- بطاقة الخلطة ترمي mul_div_domain لكلّ قارئ والإنتاج يرفضه بلا اسم. يُرفض هنا مسمّى، والكمية غير الصالحة (فارغة، أو صفر، أو بأكثر من ثلاث مراتب) يرفضها
  -- قيدها برسالته. والسطر بالكيلو كتلته كميته فلا يصير صفراً.
  if new.unit = 'L' and abs(new.qty) < 'Infinity' and new.qty > 0 and new.qty = round(new.qty, 3) then
    if private.liters_to_kg(new.qty, i.density_kg_per_l) = 0 then
      raise exception 'qty_not_positive' using hint = format('كمية «%s» في الخلطة تُقرَّب صفراً بالكيلوغرام. اكتب كمية أكبر.', i.name);
    end if;
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
    new.in_basis := null;
    new.base_unit := null;
    new.line_no := coalesce((select max(l.line_no) from public.recipe_lines l where l.org_id = v.org_id and l.version_id = v.id), 0) + 1;
  elsif current_setting('app.recipe_line_order', true) is distinct from 'on' then
    -- رقم السطر ثابت إلّا من set_recipe_line_order (0023): العمود غير ممنوح لأحد، وعلامة المعاملة منها وحدها.
    new.line_no := old.line_no;
  end if;
  update public.recipe_versions set version = version + 1 where org_id = v.org_id and id = v.id;
  return new;
end
$$;

-- public.create_recipe كما في 0016_mill_v2 حرفاً بحرف:
create or replace function public.create_recipe(p_id uuid, p_version_id uuid, p_name text, p_output_item uuid, p_basis_kg numeric, p_lines jsonb,
  p_rates jsonb, p_activate boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  r public.recipes;
  v public.recipe_versions;
  v_name text;
  v_basis numeric := coalesce(p_basis_kg, 1000);
  e jsonb;
  v_n int := 0;
  v_item uuid;
  v_qty numeric;
  v_unit text;
  v_cat uuid;
  v_amount numeric;
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_number constant text := '^[0-9]+(\.[0-9]+)?$';
begin
  set local lock_timeout = '5s';
  perform private.require('recipe.activate');
  if p_id is null or p_version_id is null then
    raise exception 'id_required' using hint = 'تعذّر حفظ الخلطة دون معرّف. حدّث الشاشة وأعد المحاولة.';
  end if;
  v_name := private.check_name(p_name, 80, 'اسم الخلطة');
  -- المعرّف مقفول قبل فحصه (درس WP5 مع record_expense): نداءان بالمعرّف نفسه لا يعبران «غير موجود» معاً.
  perform pg_advisory_xact_lock(hashtextextended('recipe:' || p_id::text, 0));
  select * into r from public.recipes where id = p_id;
  if r.id is not null then
    if r.org_id is distinct from v_org or r.name is distinct from v_name or r.output_item_id is distinct from p_output_item then
      raise exception 'id_conflict' using hint = 'هذا المعرّف لخلطة أخرى. حدّث الشاشة وأعد الحفظ.';
    end if;
    select * into v from public.recipe_versions where id = p_version_id;
    if v.id is null or v.org_id is distinct from v_org or v.recipe_id is distinct from r.id then
      raise exception 'id_conflict' using hint = 'هذا المعرّف لنسخة خلطة أخرى. حدّث الشاشة وأعد الحفظ.';
    end if;
    -- الإعادة تعرف نتيجتها هي (درس WP5: «المطلوب = انكتب، وإلّا تعارض»، مراجعة 0016 #4): المحفوظ يطابق المرسَل الآن بالأساس
    -- والسطور بترتيبها (المادّة والكمية والوحدة) والمعدّلات بترتيبها (الفئة والمبلغ) وطلب التفعيل (التفعيل ⇔ مفعَّلة، وبلاه ⇔
    -- مسوّدة)؛ وإلّا فالمحفوظ غير ما يراه المستخدم، و«نجح» كان يُضيّع تعديله بصمت والخلطة المفعَّلة بسطوره القديمة.
    if v.basis_kg is distinct from v_basis
      or v.status is distinct from (case when coalesce(p_activate, false) then 'active' else 'draft' end)
      or (select coalesce(jsonb_agg(jsonb_build_array(l.item_id::text, trim_scale(l.qty)::text, l.unit) order by l.line_no), '[]'::jsonb)
          from public.recipe_lines l where l.org_id = v_org and l.version_id = v.id)
        is distinct from (select coalesce(jsonb_agg(jsonb_build_array(lower(x.value ->> 'item_id'),
            case when coalesce(x.value ->> 'qty', '') ~ v_number then trim_scale((x.value ->> 'qty')::numeric)::text else x.value ->> 'qty' end,
            coalesce(nullif(x.value ->> 'unit', ''), 'kg')) order by x.n), '[]'::jsonb)
          from jsonb_array_elements(case when jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) = 'array' then coalesce(p_lines, '[]'::jsonb)
            else '[null]'::jsonb end) with ordinality as x(value, n))
      or (select coalesce(jsonb_agg(jsonb_build_array(c.category_id::text, trim_scale(c.amount_per_ton)::text) order by c.line_no), '[]'::jsonb)
          from public.recipe_cost_rates c where c.org_id = v_org and c.version_id = v.id)
        is distinct from (select coalesce(jsonb_agg(jsonb_build_array(lower(x.value ->> 'category_id'),
            case when coalesce(x.value ->> 'amount_per_ton', '') ~ v_number then trim_scale((x.value ->> 'amount_per_ton')::numeric)::text
              else x.value ->> 'amount_per_ton' end) order by x.n), '[]'::jsonb)
          from jsonb_array_elements(case when jsonb_typeof(coalesce(p_rates, '[]'::jsonb)) = 'array' then coalesce(p_rates, '[]'::jsonb)
            else '[null]'::jsonb end) with ordinality as x(value, n)) then
      raise exception 'id_conflict' using hint = 'حُفظت هذه الخلطة بمحاولة سابقة بمحتوى غير الذي أرسلته الآن. افتحها لترى ما حُفظ.';
    end if;
    return jsonb_build_object('id', r.id, 'version_id', v.id, 'version_no', v.version_no, 'status', v.status,
      'lines', (select count(*)::int from public.recipe_lines l where l.org_id = v_org and l.version_id = v.id),
      'rates', (select count(*)::int from public.recipe_cost_rates c where c.org_id = v_org and c.version_id = v.id));
  end if;
  if exists (select 1 from public.recipe_versions x where x.id = p_version_id) then
    raise exception 'id_conflict' using hint = 'هذا المعرّف لنسخة خلطة أخرى. حدّث الشاشة وأعد الحفظ.';
  end if;
  if p_output_item is null then
    raise exception 'item_required' using hint = 'اختر مادّة الناتج (العلف الجاهز الذي تنتجه الخلطة).';
  end if;
  if not (abs(v_basis) < 'Infinity') or v_basis <= 0 or v_basis <> round(v_basis, 3) then
    raise exception 'bad_basis' using hint = 'أساس الخلطة بالكيلوغرام أكبر من صفر، بثلاث مراتب عشرية على الأكثر.';
  end if;
  if (p_lines is not null and jsonb_typeof(p_lines) <> 'array') or (p_rates is not null and jsonb_typeof(p_rates) <> 'array') then
    raise exception 'bad_lines' using hint = 'سطور الخلطة وتكاليفها قائمتان. حدّث الشاشة وأعد المحاولة.';
  end if;
  if exists (select 1 from public.recipes x where x.org_id = v_org and x.archived_at is null and x.name_norm = private.searchable(v_name)) then
    raise exception 'recipe_name_taken' using hint = format('توجد خلطة باسم «%s». اختر اسماً آخر أو افتح الخلطة الموجودة.', v_name);
  end if;
  insert into public.recipes (id, org_id, name, output_item_id) values (p_id, v_org, v_name, p_output_item) returning * into r;
  insert into public.recipe_versions (id, org_id, recipe_id, basis_kg) values (p_version_id, v_org, r.id, v_basis) returning * into v;
  for e in select x.value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) with ordinality as x(value, n) order by x.n loop
    v_n := v_n + 1;
    if jsonb_typeof(e) <> 'object' or coalesce(e ->> 'item_id', '') !~ v_uuid then
      raise exception 'item_required' using hint = format('السطر %s في الخلطة بلا مادّة. اختر المادّة أو احذف السطر.', v_n);
    end if;
    v_item := (e ->> 'item_id')::uuid;
    if coalesce(e ->> 'qty', '') !~ v_number then
      raise exception 'qty_not_positive' using hint = format('كمية «%s» في الخلطة رقم أكبر من صفر.',
        coalesce((select i.name from public.items i where i.org_id = v_org and i.id = v_item), format('السطر %s', v_n)));
    end if;
    v_qty := (e ->> 'qty')::numeric;
    if v_qty <= 0 or v_qty <> round(v_qty, 3) then
      raise exception 'qty_not_positive' using hint = format('كمية «%s» في الخلطة أكبر من صفر، بثلاث مراتب عشرية على الأكثر.',
        coalesce((select i.name from public.items i where i.org_id = v_org and i.id = v_item), format('السطر %s', v_n)));
    end if;
    v_unit := coalesce(nullif(e ->> 'unit', ''), 'kg');
    if v_unit not in ('kg', 'L') then
      raise exception 'bad_recipe_unit' using hint = 'وحدة سطر الخلطة كيلوغرام أو لتر.';
    end if;
    insert into public.recipe_lines (org_id, version_id, item_id, qty, unit) values (v_org, v.id, v_item, v_qty, v_unit);
  end loop;
  v_n := 0;
  for e in select x.value from jsonb_array_elements(coalesce(p_rates, '[]'::jsonb)) with ordinality as x(value, n) order by x.n loop
    v_n := v_n + 1;
    if jsonb_typeof(e) <> 'object' or coalesce(e ->> 'category_id', '') !~ v_uuid then
      raise exception 'category_required' using hint = format('سطر التكاليف %s بلا فئة. اختر فئة المصروف أو احذف السطر.', v_n);
    end if;
    v_cat := (e ->> 'category_id')::uuid;
    if coalesce(e ->> 'amount_per_ton', '') !~ v_number then
      raise exception 'amount_not_positive' using hint = format('مبلغ سطر التكاليف %s لكلّ طنّ رقم أكبر من صفر.', v_n);
    end if;
    v_amount := (e ->> 'amount_per_ton')::numeric;
    if v_amount <= 0 or v_amount <> round(v_amount, 2) then
      raise exception 'amount_not_positive' using hint = format('مبلغ سطر التكاليف %s لكلّ طنّ أكبر من صفر، بمرتبتين عشريتين على الأكثر.', v_n);
    end if;
    insert into public.recipe_cost_rates (org_id, version_id, category_id, amount_per_ton) values (v_org, v.id, v_cat, v_amount);
  end loop;
  if coalesce(p_activate, false) then
    perform public.activate_recipe_version(v.id, (select x.version from public.recipe_versions x where x.org_id = v_org and x.id = v.id));
  end if;
  select * into v from public.recipe_versions where org_id = v_org and id = v.id;
  return jsonb_build_object('id', r.id, 'version_id', v.id, 'version_no', v.version_no, 'status', v.status,
    'lines', (select count(*)::int from public.recipe_lines l where l.org_id = v_org and l.version_id = v.id),
    'rates', (select count(*)::int from public.recipe_cost_rates c where c.org_id = v_org and c.version_id = v.id));
end
$$;

-- public.new_recipe_version كما في 0016_mill_v2 حرفاً بحرف:
create or replace function public.new_recipe_version(p_recipe uuid, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  r public.recipes;
  v public.recipe_versions;
  s public.recipe_versions;
  ln record;
  v_name text;
  v_existing boolean := true;
  v_skipped jsonb := '[]'::jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('recipe.activate');
  if p_id is null then
    raise exception 'id_required' using hint = 'تعذّر إنشاء النسخة دون معرّف. حدّث الشاشة وأعد المحاولة.';
  end if;
  select * into r from public.recipes where org_id = v_org and id = p_recipe for update;
  if r.id is null then
    raise exception 'recipe_not_found' using hint = 'هذه الخلطة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if r.archived_at is not null then
    raise exception 'recipe_archived' using hint = format('الخلطة «%s» مؤرشفة، فلا تُنشأ لها نسخة جديدة. أعِدها من الأرشيف أوّلاً.', r.name);
  end if;
  select * into v from public.recipe_versions where id = p_id;
  if v.id is not null and (v.org_id is distinct from v_org or v.recipe_id is distinct from r.id) then
    raise exception 'id_conflict' using hint = 'هذا المعرّف لنسخة خلطة أخرى. حدّث الشاشة وأعد المحاولة.';
  end if;
  if v.id is not null then
    -- الإعادة بالمعرّف نفسه (مراجعة 0016 السادسة #5، ق٦٣): النسخة التي أنشأها هذا الطلب، فما رجع أوّل مرّة. والمصدر نسخة قبلها (رقمها أصغر): ما دامت هذه
    -- مسوّدة فلا تُنشأ غيرها ولا تُفعَّل غيرها، فالمفعَّلة قبلها وآخر نسخة غير مسوّدة قبلها هما ما نُسخ منه أوّل مرّة.
    v_existing := false;
    select * into s from public.recipe_versions x where x.org_id = v_org and x.recipe_id = r.id and x.status = 'active' and x.version_no < v.version_no;
    if s.id is null then
      select * into s from public.recipe_versions x where x.org_id = v_org and x.recipe_id = r.id and x.status <> 'draft' and x.version_no < v.version_no
      order by x.version_no desc limit 1;
    end if;
    v_skipped := coalesce((select jsonb_agg(i.name order by l.line_no)
      from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
      where l.org_id = v_org and l.version_id = s.id and i.base_unit not in ('kg', 'L')
        and not exists (select 1 from public.recipe_lines y where y.org_id = v_org and y.version_id = v.id and y.item_id = l.item_id)), '[]'::jsonb);
  else
    select * into v from public.recipe_versions where org_id = v_org and recipe_id = r.id and status = 'draft';
  end if;
  if v.id is null then
    select * into s from public.recipe_versions where org_id = v_org and recipe_id = r.id and status = 'active';
    if s.id is null then
      select * into s from public.recipe_versions where org_id = v_org and recipe_id = r.id order by version_no desc limit 1;
    end if;
    -- مواد الكتلة وحدها (مراجعة 0016 السادسة #1، ق٦٢): المؤرشفة التي صارت قطعة تُترك في الحلقة أدناه وتُسمّى في skipped كغيرها.
    select i.name into v_name from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where l.org_id = v_org and l.version_id = s.id and i.archived_at is not null and i.base_unit in ('kg', 'L') order by l.line_no limit 1;
    if v_name is not null then
      raise exception 'item_archived' using hint = format('«%s» في الخلطة مؤرشفة، فلا تُنسخ إلى نسخة جديدة. أعِدها من الأرشيف أوّلاً.', v_name);
    end if;
    select c.name into v_name from public.recipe_cost_rates x join public.expense_categories c on c.org_id = x.org_id and c.id = x.category_id
    where x.org_id = v_org and x.version_id = s.id and c.archived_at is not null order by x.line_no limit 1;
    if v_name is not null then
      raise exception 'category_archived' using hint = format('فئة «%s» في تكاليف الخلطة مؤرشفة، فلا تُنسخ إلى نسخة جديدة. أعِدها من الأرشيف أوّلاً.', v_name);
    end if;
    insert into public.recipe_versions (id, org_id, recipe_id, basis_kg) values (p_id, v_org, r.id, coalesce(s.basis_kg, 1000)) returning * into v;
    -- سطر مكتوب باللتر لمادّة صارت بالكيلو بعد التفعيل (مراجعة 0016 الرابعة #0، ق٤١) يُنسخ سطراً بالكيلوغرام بالكتلة نفسها: الكمية × لقطة كثافة
    -- السطر المنسوخ بتقريب واحد لثلاث مراتب (القاعدة ٤، كما تُحسب كتلته في الدفعة). كان يُنسخ باللتر فيرفضه حارس السطر (bad_recipe_unit)، فلا
    -- تُنشأ المسوّدة التي يطلبها تلميح الإنتاج. والنسخة المجمَّدة تحمل لقطة الكثافة لكلّ سطر باللتر (التفعيل، وverify_mill الفحص ٣)، فغيابها رفض مسمّى.
    for ln in select l.item_id, l.qty, l.unit, l.density_kg_per_l, i.name, i.base_unit
      from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
      where l.org_id = v_org and l.version_id = s.id order by l.line_no loop
      -- مادّة صارت قطعة (مراجعة 0016 الخامسة، ق٥٥): العليقة بالكتلة فلا تدخل سطراً (حارس السطر)، فتُترك ويُسمّى اسمها.
      if ln.base_unit not in ('kg', 'L') then
        v_skipped := v_skipped || jsonb_build_array(ln.name);
        continue;
      end if;
      if ln.unit = 'L' and ln.base_unit = 'kg' then
        if ln.density_kg_per_l is null then
          raise exception 'density_required' using hint = format('«%s» صارت تُقاس بالكيلوغرام وسطرها في الخلطة باللتر بلا كثافة محفوظة، فلا تُحسب كميتها بالكيلوغرام. أنشئ خلطة جديدة واكتب كميتها بالكيلوغرام.', ln.name);
        end if;
        -- كتلة تُقرَّب صفراً (مراجعة 0016 السادسة #2، ق٦٤): كان الإدراج يرمي خطأ قيد الكمية خاماً بلا اسم.
        if private.liters_to_kg(ln.qty, ln.density_kg_per_l) = 0 then
          raise exception 'qty_not_positive' using hint = format('كمية «%s» في الخلطة تُقرَّب صفراً بالكيلوغرام. اكتب كمية أكبر.', ln.name);
        end if;
        insert into public.recipe_lines (org_id, version_id, item_id, qty, unit) values (v_org, v.id, ln.item_id, private.liters_to_kg(ln.qty, ln.density_kg_per_l), 'kg');
      else
        insert into public.recipe_lines (org_id, version_id, item_id, qty, unit) values (v_org, v.id, ln.item_id, ln.qty, ln.unit);
      end if;
    end loop;
    for ln in select x.category_id, x.amount_per_ton from public.recipe_cost_rates x where x.org_id = v_org and x.version_id = s.id order by x.line_no loop
      insert into public.recipe_cost_rates (org_id, version_id, category_id, amount_per_ton) values (v_org, v.id, ln.category_id, ln.amount_per_ton);
    end loop;
    select * into v from public.recipe_versions where org_id = v_org and id = v.id;
    v_existing := false;
  end if;
  return jsonb_build_object('recipe_id', r.id, 'version_id', v.id, 'version_no', v.version_no, 'status', v.status,
    'lines', (select count(*)::int from public.recipe_lines l where l.org_id = v_org and l.version_id = v.id),
    'rates', (select count(*)::int from public.recipe_cost_rates c where c.org_id = v_org and c.version_id = v.id),
    'existing', v_existing, 'skipped', v_skipped);
end
$$;

-- public.activate_recipe_version كما في 0016_mill_v2 حرفاً بحرف:
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
  v_outside int := 0;
  v_in boolean;
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
    select l.id, l.qty, l.unit, l.item_id, i.name, i.base_unit, i.density_kg_per_l, i.kind
    from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where l.org_id = v_org and l.version_id = v.id order by l.line_no
  loop
    if ln.base_unit not in ('kg', 'L') then
      raise exception 'bad_recipe_unit' using hint = format('«%s» وحدتها قطعة، والعليقة تُحسب بالكتلة: احذف سطرها.', ln.name);
    end if;
    -- سطر مكتوب باللتر لمادّة ليست باللتر الآن (مراجعة 0016 الرابعة #1، ق٤٢؛ FOUNDATION القاعدة ٤: «سائل بلا كثافة ما ينضاف لعليقة»): صُحّحت المادّة
    -- كيلوغراماً بعد كتابة السطر، فلا كثافة تُلقط ولا تُحسب كتلته. كان يُفعَّل خارج الكتلة (الوقود والتعبئة لا يدخلان المجموع) بلقطة كيلوغرام بلا
    -- كثافة، فترمي لوحة المعمل وبطاقة الخلطة والإنتاج density_not_positive لكلّ قارئ؛ وداخل الكتلة كان يرمي هنا بتلميح يطلب كثافة لمادّة لا تقبلها.
    -- يُرفض قبل أيّ حساب، داخل الكتلة وخارجها، بجملة حارس السطر.
    if ln.unit = 'L' and ln.base_unit <> 'L' then
      raise exception 'bad_recipe_unit' using hint = format('«%s» تُقاس بالكيلوغرام، فاكتب كميتها في الخلطة بالكيلوغرام.', ln.name);
    end if;
    -- الكثافة تُكتب من نافذة «عدّل» في «المواد» (مراجعة 0016 السادسة #4، ق٦٥): كان التلميح يقول «بطاقة المادّة»، والكثافة فيها قراءة فقط.
    if ln.base_unit = 'L' and ln.density_kg_per_l is null then
      raise exception 'density_required' using hint = format('«%s» سائل بلا كثافة، فلا يُحسب وزنه. اكتب كثافته من «المواد» في المخزن (زرّ «عدّل» بجانبها) ثمّ فعّل.', ln.name);
    end if;
    if ln.qty is null or not (abs(ln.qty) < 'Infinity') or ln.qty <= 0 then
      raise exception 'qty_not_positive' using hint = format('كمية «%s» في الخلطة يجب أن تكون أكبر من صفر.', ln.name);
    end if;
    -- كتلة السطر تُقرَّب صفراً (مراجعة 0016 السادسة #2، ق٦٤): سطر لتر كُتب بكثافة أكبر ثمّ صغرت كثافة مادّته، فالمجموع يساوي الأساس بلاه والنسخة كانت
    -- تُفعَّل، ثمّ ترمي بطاقتها وإنتاجها mul_div_domain بلا اسم. يُرفض داخل الكتلة وخارجها (الإنتاج يحسب كتلة كلّ سطر). والكتلة بالمساعد الذي لا يرمي: فحصا
    -- الوحدة والكثافة قبله يضمنان كثافة لكلّ سطر لتر، والكتلة التي لا تُحسب ليست صفراً فلا يُسمّى بها شيء.
    if private.recipe_line_kg_or_null(ln.qty, ln.unit, ln.density_kg_per_l) = 0 then
      raise exception 'qty_not_positive' using hint = format('كمية «%s» في الخلطة تُقرَّب صفراً بالكيلوغرام. اكتب كمية أكبر.', ln.name);
    end if;
    -- الوقود والتعبئة خارج كتلة الخلطة (FOUNDATION القاعدة ٢٢: «بدون الأكياس والوقود»، مراجعة 0016 #2): السطر يبقى ويُسحب ويُحسب
    -- بكلفته، ولا يدخل مجموع الأساس؛ وخلطة كلّها وقود أو تعبئة مجموعها صفر فترفض basis_mismatch. ولقطات السطر الثلاث بجملة واحدة
    -- (FOUNDATION القاعدة ٤): الكثافة للسائل، و«داخل الكتلة» من نوع المادّة الآن (مراجعة 0016 الثانية #2 و#5)، ووحدة أساس المادّة الآن
    -- (مراجعة 0016 الثالثة #2)، والمجموع منها؛ فتصحيح النوع أو الوحدة بعد التفعيل لا يغيّر النسخة المجمَّدة (verify_mill وcreate_production
    -- وrecipe_detail يقرأون اللقطة).
    v_in := ln.kind not in ('fuel', 'packaging');
    update public.recipe_lines set in_basis = v_in, base_unit = ln.base_unit,
      density_kg_per_l = case when ln.base_unit = 'L' then round(ln.density_kg_per_l, 4) else density_kg_per_l end
    where org_id = v_org and id = ln.id;
    if not v_in then
      v_outside := v_outside + 1;
    else
      v_sum := v_sum + private.recipe_line_kg(ln.qty, ln.unit, ln.density_kg_per_l);
    end if;
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then
    raise exception 'doc_empty' using hint = 'الخلطة بلا مواد. أضف مادّة واحدة على الأقلّ قبل التفعيل.';
  end if;
  if v_sum <> v.basis_kg then
    raise exception 'basis_mismatch' using hint = format('مجموع مواد الخلطة %s كغم%s، والأساس %s كغم: الفرق %s كغم. عدّل الكميات أو الأساس حتّى يتساويا.',
      to_char(v_sum, 'FM999999990.999'), case when v_outside > 0 then ' (بلا الوقود والتعبئة، فهما خارج كتلة الخلطة)' else '' end,
      to_char(v.basis_kg, 'FM999999990.999'), to_char(v_sum - v.basis_kg, 'FM999999990.999'));
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

-- private.recipe_expected كما في 0016_mill_v2 حرفاً بحرف:
create or replace function private.recipe_expected(p_version uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v public.recipe_versions;
  ln record;
  v_price numeric;
  v_qty numeric;
  v_sum numeric := 0;
  v_unpriced int := 0;
  v_unconverted int := 0;
  v_rates numeric;
  v_materials numeric;
begin
  select * into v from public.recipe_versions where org_id = public.auth_org() and id = p_version;
  if v.id is null then
    return null;
  end if;
  for ln in
    select l.item_id, l.qty, l.unit, i.base_unit, coalesce(l.density_kg_per_l, i.density_kg_per_l) as density, p.cost_price
    from public.recipe_lines l
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    left join public.item_prices p on p.org_id = l.org_id and p.item_id = l.item_id
    where l.org_id = v.org_id and l.version_id = v.id
    order by l.line_no
  loop
    v_price := coalesce(ln.cost_price, private.item_last_price(ln.item_id),
      (select private.per_unit(sum(s.value_left), sum(s.qty_left)) from public.stock_lots s
        where s.org_id = v.org_id and s.item_id = ln.item_id and s.qty_left > 0 and public.in_scope_wh(s.warehouse_id)));
    v_qty := case when ln.unit = ln.base_unit then ln.qty
      when ln.unit = 'kg' and ln.base_unit = 'L' and ln.density is not null then private.kg_to_liters(ln.qty, ln.density)
      when ln.unit = 'L' and ln.base_unit = 'kg' and ln.density is not null then private.liters_to_kg(ln.qty, ln.density) end;
    if v_price is null then
      v_unpriced := v_unpriced + 1;
    elsif v_qty is null then
      v_unconverted := v_unconverted + 1;
    else
      v_sum := v_sum + v_qty * v_price;
    end if;
  end loop;
  v_rates := coalesce((select sum(r.amount_per_ton) from public.recipe_cost_rates r where r.org_id = v.org_id and r.version_id = v.id), 0.00);
  v_materials := private._mul_div_round(1000, v_sum, v.basis_kg, 2);
  return jsonb_build_object('materials_per_ton', v_materials::text, 'rates_per_ton', v_rates::text,
    'cost_per_ton', (v_materials + v_rates)::text, 'unpriced', v_unpriced, 'unconverted', v_unconverted,
    'cost_per_kg', case when v_unpriced = 0 and v_unconverted = 0
      then private._mul_div_round(1, v_sum * 1000 + v_rates * v.basis_kg, v.basis_kg * 1000, 2)::text end);
end
$$;

-- public.recipe_detail كما في 0016_mill_v2 حرفاً بحرف:
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
        -- «داخل الكتلة» لقطة النسخة المجمَّدة، والنوع الحيّ للمسوّدة (مراجعة 0016 الثانية #2)، ومجموع الكتلة بالشرط نفسه.
        -- ووحدة الأساس لقطتها (والوحدة الحيّة للمسوّدة)، وunit_changed بشرط رفض الإنتاج نفسه (مراجعة 0016 الثالثة #2 والرابعة #0، ق٤١): لقطة
        -- كيلوغرام ومادّة صارت باللتر، أو مادّة صارت قطعة، فلا يُنتَج بالنسخة حتّى تُنشأ غيرها (create_production: item_changed)؛ ولقطة لتر ومادّة صارت
        -- بالكيلو يُنتَج بها، فلا تنبيه. وunit_mismatch سطر مكتوب باللتر لمادّة ليست باللتر الآن (الرابعة #1، ق٤٢): لا يُفعَّل (bad_recipe_unit).
        'kind', i.kind, 'base_unit', coalesce(l.base_unit, i.base_unit),
        'unit_changed', l.base_unit is not null and ((l.base_unit = 'kg' and i.base_unit = 'L') or i.base_unit not in ('kg', 'L')),
        'unit_mismatch', l.unit = 'L' and i.base_unit <> 'L',
        -- سائل بلا كثافة (مراجعة 0016 الخامسة #0، ق٥١): وحدة اللقطة (والحيّة للمسوّدة) لتر، ولا كثافة في اللقطة ولا في المادّة؛ وهو ما يرفض التفعيل
        -- لأجله (density_required). للكتلة الفارغة سببان (مادّة صارت بالكيلو، أو سائل فُرّغت كثافته)، وكان المفتاح يسمّي الأوّل وحده فتقفل البطاقة
        -- «فعّل النسخة» بلا اسم ولا علاج؛ وسطر بالكيلو لسائل بلا كثافة كتلته معروفة ويرفضه التفعيل كذلك.
        'density_missing', coalesce(l.base_unit, i.base_unit) = 'L' and coalesce(l.density_kg_per_l, i.density_kg_per_l) is null,
        'in_basis', coalesce(l.in_basis, i.kind not in ('fuel', 'packaging')), 'category_id', i.category_id,
        'category_name', (select c.name from public.item_categories c where c.org_id = v_org and c.id = i.category_id),
        -- كتلة السطر وحصّته بالمساعد الذي لا يرمي (الرابعة #1، ق٤٢): فارغتان لسطر باللتر بلا كثافة، وكانت البطاقة كلّها ترمي density_not_positive.
        'qty', l.qty::text, 'unit', l.unit, 'mass_kg', m.kg::text,
        'share_pct', case when m.kg > 0 then private._mul_div_round(m.kg, 100, v.basis_kg, 2) when m.kg = 0 then 0.00 end::text,
        'money', jsonb_build_object('unit_cost', (select private.per_unit(sum(s.value_left), sum(s.qty_left))::text
          from public.stock_lots s where s.org_id = v_org and s.item_id = l.item_id and s.qty_left > 0 and public.in_scope_wh(s.warehouse_id)),
          'cost_price', (select p.cost_price::text from public.item_prices p where p.org_id = v_org and p.item_id = l.item_id),
          'last_price', private.item_last_price(l.item_id)::text))
      order by l.line_no)
      from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
        cross join lateral (select private.recipe_line_kg_or_null(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l)) as kg) as m
      where l.org_id = v_org and l.version_id = v.id), '[]'::jsonb) end,
    -- مجموع الكتلة داخلها فارغ إن كانت كتلة سطر داخلها لا تُحسب (الرابعة #1، ق٤٢): لا مجموع ناقص بصمت.
    'mass_kg', case when v.id is null then null else (select case when bool_or(m.kg is null) then null else coalesce(sum(m.kg), 0) end
      from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
        cross join lateral (select private.recipe_line_kg_or_null(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l)) as kg) as m
      where l.org_id = v_org and l.version_id = v.id and coalesce(l.in_basis, i.kind not in ('fuel', 'packaging')))::text end,
    -- المرشَّحات لسطر جديد: مادّة فعّالة يستلمها مخزن المواد الأوّلية وتُقاس بالكيلو أو اللتر (القطعة لا تدخل العليقة).
    'pick_items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'base_unit', i.base_unit,
        'category_name', (select c.name from public.item_categories c where c.org_id = v_org and c.id = i.category_id))
        order by i.name_norm collate "C", i.id)
      from public.items i
      where i.org_id = v_org and i.archived_at is null and i.base_unit in ('kg', 'L') and private.item_admissible('raw', i.kind)), '[]'::jsonb),
    'expense_categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name collate "C", c.id)
      from public.expense_categories c where c.org_id = v_org and c.archived_at is null and c.system_code is null), '[]'::jsonb),
    'money', jsonb_build_object(
      'rates', case when v.id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'line_no', x.line_no,
          'category_id', x.category_id, 'category_name', c.name, 'amount_per_ton', x.amount_per_ton::text) order by x.line_no)
        from public.recipe_cost_rates x join public.expense_categories c on c.org_id = x.org_id and c.id = x.category_id
        where x.org_id = v_org and x.version_id = v.id), '[]'::jsonb) end,
      'expected', case when v.id is null then null else private.recipe_expected(v.id) - 'cost_per_kg' end)));
end
$$;

-- public.recipes_overview كما في 0023_mill_order_produce حرفاً بحرف:
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
          -- مواد النسخة بكتلتها بالكيلو من الأكبر: شريط التركيبة ورقاقاتها تُقرأ بلمحة قبل الأرقام. والكتلة بالمساعد الذي لا يرمي (مراجعة 0016
          -- الرابعة #1، ق٤٢): سطر باللتر بلا كثافة في نسخة مفعَّلة كان يرمي density_not_positive للوحة كلّها لكلّ قارئ، فكتلته فارغة وتُرتَّب أخيراً.
          'pieces', coalesce((select jsonb_agg(jsonb_build_object('item_id', l.item_id, 'item_name', i.name,
              'mass_kg', m.kg::text,
              -- لقطة «داخل الكتلة» (مراجعة 0016 الثانية #2، والشاشة ب-٨): شريط التركيبة يستثني الوقود والتعبئة.
              'in_basis', coalesce(l.in_basis, i.kind not in ('fuel', 'packaging')))
              order by m.kg desc nulls last, i.name collate "C", l.id)
            from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
              cross join lateral (select private.recipe_line_kg_or_null(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l)) as kg) as m
            where l.org_id = v.org_id and l.version_id = v.id), '[]'::jsonb))
        from public.recipe_versions v where v.org_id = r.org_id and v.recipe_id = r.id and v.status = 'active'),
      'draft', (select jsonb_build_object('id', v.id, 'version_no', v.version_no, 'basis_kg', v.basis_kg::text, 'version', v.version,
          'lines', (select count(*) from public.recipe_lines l where l.org_id = v.org_id and l.version_id = v.id))
        from public.recipe_versions v where v.org_id = r.org_id and v.recipe_id = r.id and v.status = 'draft'),
      -- الدفعات التي يقرؤها القارئ (أحد طرفيها بنطاقه، مراجعة 0016 الثانية #15): كانت بلا نطاق، فيرى المحصور عددها وآخر رقم وكلفته.
      'batches', (select count(*) from public.production_batches b join public.recipe_versions v2 on v2.org_id = b.org_id and v2.id = b.recipe_version_id
        where v2.org_id = r.org_id and v2.recipe_id = r.id and b.status = 'posted'
          and (public.in_scope_wh(b.input_warehouse_id) or public.in_scope_wh(b.output_warehouse_id))),
      'last_batch', (select jsonb_build_object('id', b.id, 'doc_no', b.doc_no, 'produced_on', b.produced_on, 'output_qty_kg', b.output_qty_kg::text,
          'money', jsonb_build_object('total_value', pv.total_value::text,
            'cost_per_kg', private.per_unit(pv.total_value, b.output_qty_kg)::text))
        from public.production_batches b
        join public.recipe_versions v3 on v3.org_id = b.org_id and v3.id = b.recipe_version_id
        left join public.production_values pv on pv.org_id = b.org_id and pv.batch_id = b.id
        where v3.org_id = r.org_id and v3.recipe_id = r.id and b.status = 'posted'
          and (public.in_scope_wh(b.input_warehouse_id) or public.in_scope_wh(b.output_warehouse_id))
        order by b.produced_on desc, b.id desc limit 1),
      'money', jsonb_build_object('expected_cost_per_kg', (select private.recipe_expected(v4.id) ->> 'cost_per_kg'
        from public.recipe_versions v4 where v4.org_id = r.org_id and v4.recipe_id = r.id and v4.status = 'active'))
    ) order by r.archived_at is not null, r.position nulls last, r.name_norm collate "C", r.id)
    from public.recipes r join public.items i on i.org_id = r.org_id and i.id = r.output_item_id
    where r.org_id = v_org), '[]'::jsonb),
    'stores', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'kind', w.kind) order by w.kind, w.name collate "C", w.id)
      from public.warehouses w
      where w.org_id = v_org and w.archived_at is null and w.kind in ('raw', 'feed') and public.in_scope_wh(w.id)), '[]'::jsonb),
    'feed_items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name) order by i.name_norm collate "C", i.id)
      from public.items i where i.org_id = v_org and i.archived_at is null and i.kind = 'feed'), '[]'::jsonb)));
end
$$;

-- public.create_production كما في 0016_mill_v2 حرفاً بحرف:
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
  rt record;
  v_amount numeric;
  v_line_kg numeric;
  v_density numeric;
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
    select l.line_no, l.qty, l.unit, l.density_kg_per_l, i.id as item_id, i.name, i.base_unit, i.density_kg_per_l as item_density, i.scale_step,
      l.in_basis, l.base_unit as line_base
    from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where l.org_id = v_org and l.version_id = v.id order by l.line_no
  loop
    -- وحدة أساس المادّة لقطة السطر عند التفعيل (مراجعة 0016 الثالثة #2، FOUNDATION القاعدة ٤ وE46، كما يقارن الترحيل لقطة سطر الدفعة). ولا يُرفض
    -- إلّا ما لا تستطيع اللقطة تخطيطه (مراجعة 0016 الرابعة #0، ق٤١): لقطة كيلوغرام ومادّة صارت باللتر (التخطيط باللتر يحتاج كثافة لم تُلقط، فكان
    -- الكيلو المكتوب يصير لتراتٍ بكثافة المادّة الحالية)، ومادّة صارت قطعة. أمّا لقطة لتر ومادّة صارت بالكيلو فكتلة السطر معروفة من لقطة الكثافة،
    -- فتُخطَّط بالكيلو كما كانت قبل لقطة الوحدة: سطر الدفعة بالكيلو بلا كثافة، والمخطّط بخطوة العدّاد من الكتلة نفسها بتقريب واحد. وكان رفضها يوقف
    -- إنتاجاً صحيحاً، والعلاج الذي يسمّيه التلميح مسدوداً. والكثافة للتخطيط لقطة السطر (التفعيل يكتبها لكلّ سطر وحدته لتر، وverify_mill الفحص ٣
    -- يمسك غيابها).
    if ln.line_base is not null and ((ln.line_base = 'kg' and ln.base_unit = 'L') or ln.base_unit not in ('kg', 'L')) then
      raise exception 'item_changed' using hint = format('تغيّرت وحدة «%s» بعد تفعيل الخلطة، فلا يُنتَج بنسختها المفعَّلة. أنشئ نسخة جديدة من الخلطة وفعّلها.', ln.name);
    end if;
    if ln.base_unit not in ('kg', 'L') then
      raise exception 'bad_recipe_unit' using hint = format('«%s» وحدتها قطعة، فلا تُسحب بالكتلة. راجع الخلطة.', ln.name);
    end if;
    -- الكثافة تُكتب من نافذة «عدّل» في «المواد» (مراجعة 0016 السادسة #4، ق٦٥).
    if ln.base_unit = 'L' and coalesce(ln.density_kg_per_l, ln.item_density) is null then
      raise exception 'density_required' using hint = format('«%s» سائل بلا كثافة. اكتب كثافته من «المواد» في المخزن (زرّ «عدّل» بجانبها) ثمّ أعد الإنتاج.', ln.name);
    end if;
    if not private.item_admissible(wi.kind, (select i2.kind from public.items i2 where i2.org_id = v_org and i2.id = ln.item_id)) then
      raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s»: اختر مخزن المواد الذي فيه مواد الخلطة.', ln.name, wi.name);
    end if;
    v_line_kg := private.recipe_line_kg(ln.qty, ln.unit, coalesce(ln.density_kg_per_l, ln.item_density));
    v_density := case when ln.base_unit = 'L' then round(coalesce(ln.density_kg_per_l, ln.item_density), 4) end;
    v_mass := private._mul_div_round(v_line_kg, p_planned_kg, v.basis_kg, 3);
    if v_mass <= 0 then
      raise exception 'qty_not_positive' using hint = format('كمية «%s» المخطّطة صفر عند هذا الحجم. أنتج كمية أكبر.', ln.name);
    end if;
    -- المخطّط بوحدة الأساس بقسمة واحدة وتقريب واحد لخطوة العدّاد من الكميات المضبوطة (القاعدة ١٨ ودرس WP1، مراجعة 0016 #10):
    -- كتلة السطر × الكمية ÷ (الأساس × كثافة السائل × الخطوة) عدد خطوات صحيح ثمّ × الخطوة. كانت الكتلة تُقرَّب لثلاث مراتب ثمّ للخطوة،
    -- فتزيد خطوةً كاملة على الحدّ (163.24983675 ← 163.250 ← 163.3 بدل 163.2). والكتلة المخطّطة للعرض كما هي.
    v_qty := case when ln.scale_step is null or not (abs(ln.scale_step) < 'Infinity') or ln.scale_step <= 0
      then private._mul_div_round(v_line_kg, p_planned_kg, v.basis_kg * coalesce(v_density, 1), 3)
      else round(private._mul_div_round(v_line_kg, p_planned_kg, v.basis_kg * coalesce(v_density, 1) * ln.scale_step, 0) * ln.scale_step, 3) end;
    if v_qty <= 0 then
      raise exception 'qty_not_positive' using hint = format('كمية «%s» المخطّطة أصغر من دقّة عدّادها. أنتج كمية أكبر.', ln.name);
    end if;
    -- الوقود والتعبئة خارج كتلة المدخلات (FOUNDATION القاعدة ٢٢: «بدون الأكياس والوقود»، مراجعة 0016 #2): السطر يُسحب ويُحسب
    -- بكلفته، والهدر على الباقي. و«داخل الكتلة» لقطة سطر الخلطة عند تفعيلها لا نوع المادّة الآن (مراجعة 0016 الثانية #2): تصحيح النوع
    -- بعد التفعيل لا ينقص كتلة دفعة جديدة من النسخة؛ والفراغ (نسخة بلا لقطة) داخل الكتلة دفاعاً، وverify_mill الفحص ٣ يمسكه.
    insert into public.production_inputs (org_id, batch_id, line_no, item_id, base_unit, density_kg_per_l, planned_qty_base, planned_mass_kg, in_basis)
    values (v_org, d.id, ln.line_no, ln.item_id, ln.base_unit, v_density, v_qty, v_mass, coalesce(ln.in_basis, true));
    v_lines := v_lines + 1;
  end loop;
  if v_lines = 0 then
    raise exception 'doc_empty' using hint = 'الخلطة بلا مواد. راجعها قبل الإنتاج.';
  end if;
  for rt in
    select x.line_no, x.category_id, x.amount_per_ton from public.recipe_cost_rates x
    where x.org_id = v_org and x.version_id = v.id order by x.line_no
  loop
    v_amount := private._mul_div_round(rt.amount_per_ton, p_planned_kg, 1000, 2);
    insert into public.production_costs (org_id, batch_id, line_no, category_id, planned_amount, amount, source)
    values (v_org, d.id, rt.line_no, rt.category_id, v_amount, v_amount, 'recipe');
  end loop;
  return jsonb_build_object('id', d.id, 'kind', 'production', 'status', 'draft', 'version', d.version,
    'recipe_id', r.id, 'recipe_name', r.name, 'recipe_version_id', v.id, 'output_item_id', o.id,
    'input_warehouse_id', wi.id, 'output_warehouse_id', wo.id, 'planned_kg', p_planned_kg::text, 'produced_on', p_produced_on,
    'lines', v_lines);
end
$$;

-- public.production_detail كما في 0016_mill_v2 حرفاً بحرف:
create or replace function public.production_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  d public.production_batches;
  v public.recipe_versions;
  r public.recipes;
  pv public.production_values;
  v_exp boolean;
  v_in boolean;
  v_out boolean;
begin
  perform private.require('read');
  select * into d from public.production_batches where org_id = v_org and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذه الدفعة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  -- من طرفيها كالتحويل (مراجعة 0016 الثانية #7 و#15): من نطاقه مخزن المواد أو مخزن العلف يقرؤها، وscope يقول أيّهما فتخفي الشاشة ما
  -- لا يُفتح له (المعاينة وأفعال المسوّدة والإلغاء بمخزن المدخلات، ووجبات العلف بمخزنه).
  v_in := public.in_scope_wh(d.input_warehouse_id);
  v_out := public.in_scope_wh(d.output_warehouse_id);
  if not (v_in or v_out) then
    raise exception 'out_of_scope' using hint = 'مخزنا هذه الدفعة (مخزن المواد ومخزن العلف) خارج نطاقك.';
  end if;
  -- تحميلات المصاريف (ملاحظة المصروف وتاريخه ومبلغه) لمن يرى الكلفة ووحدة مخزن المدخلات بنطاقه (E40، مراجعة 0016 #12)، ولغيره null.
  v_exp := public.can_see_cost() and public.in_scope_division((select w.division_id from public.warehouses w where w.org_id = v_org and w.id = d.input_warehouse_id));
  select * into v from public.recipe_versions where org_id = v_org and id = d.recipe_version_id;
  select * into r from public.recipes where org_id = v_org and id = v.recipe_id;
  select * into pv from public.production_values where org_id = v_org and batch_id = d.id;
  return private.mask(jsonb_build_object(
    'id', d.id, 'doc_no', d.doc_no, 'status', d.status, 'version', d.version, 'produced_on', d.produced_on,
    'planned_kg', d.planned_kg::text, 'output_qty_kg', d.output_qty_kg::text, 'output_expiry_on', d.output_expiry_on,
    'input_mass_kg', d.input_mass_kg::text, 'shrink_kg', d.shrink_kg::text,
    'shrink_pct', private.shrink_pct(d.shrink_kg, d.input_mass_kg)::text, 'shrink_reason', d.shrink_reason,
    'note', d.note, 'void_reason', d.void_reason, 'costs_confirmed', d.costs_confirmed_at is not null,
    'scope', jsonb_build_object('input', v_in, 'output', v_out), 'expenses_visible', v_exp,
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
        'replaced_item_name', (select x.name from public.items x where x.org_id = v_org and x.id = p.replaced_item_id),
        -- من أيّ وجبات سُحب السطر (طلب المالك «أعرف منين صنعتها بالضبط»): السحوبات الأصلية بترتيبها، بالكمية موجبة ومصدر كلّ وجبة
        -- (رقم الاستلام أو الافتتاح أو التحويل)، بلا مال؛ وللمسوّدة null، ولطرف الناتج وحده null (مراجعة 0016 الثالثة #1، ق٣٢): وجبات مخزن
        -- المواد واستلاماته صفوف تمنعها سياسات جداولها عنه، كطرف الوجهة في التحويل يرى مصدر مرآته لا استلامات المصدر.
        'draws', case when d.status = 'draft' or not v_in then null else coalesce((select jsonb_agg(jsonb_build_object('lot_id', m.lot_id, 'qty', (-m.qty)::text,
            'received_on', l.received_on, 'source', private.stock_doc_label(l.source_kind, l.source_id)) order by m.seq, m.id)
          from public.stock_moves m join public.stock_lots l on l.org_id = m.org_id and l.id = m.lot_id
          where m.org_id = v_org and m.doc_kind = 'production' and m.doc_id = d.id and m.doc_line_id = p.id
            and m.reverses_move_id is null and m.qty < 0), '[]'::jsonb) end,
        'money', jsonb_build_object('value', (select iv.value::text from public.production_input_values iv
          where iv.org_id = v_org and iv.input_id = p.id)))
      order by p.line_no)
      from public.production_inputs p join public.items i on i.org_id = p.org_id and i.id = p.item_id
      where p.org_id = v_org and p.batch_id = d.id), '[]'::jsonb),
    'money', jsonb_build_object('input_value', pv.input_value::text, 'extra_value', pv.extra_value::text,
        'total_value', pv.total_value::text,
        'cost_per_kg', private.per_unit(pv.total_value, d.output_qty_kg)::text,
        'costs', coalesce((select jsonb_agg(jsonb_build_object('cost_id', c.id, 'line_no', c.line_no, 'category_id', c.category_id,
            'category_name', k.name, 'planned_amount', c.planned_amount::text, 'amount', c.amount::text, 'source', c.source,
            'allocations', case when v_exp then coalesce((select jsonb_agg(jsonb_build_object('expense_id', e.id, 'on_date', e.on_date, 'amount', a.amount::text,
                'label', coalesce(e.note, case e.source when 'cash' then format('نقداً من %s', ca.name) else format('بالدين على %s', pt.name) end))
                order by e.on_date, e.created_at, e.id)
              from public.production_cost_allocations a
              join public.expenses e on e.org_id = a.org_id and e.id = a.expense_id
              left join public.cash_accounts ca on ca.org_id = e.org_id and ca.id = e.account_id
              left join public.parties pt on pt.org_id = e.org_id and pt.id = e.party_id
              where a.org_id = v_org and a.cost_id = c.id and a.voided_at is null), '[]'::jsonb) end)
            order by c.line_no)
          from public.production_costs c join public.expense_categories k on k.org_id = c.org_id and k.id = c.category_id
          where c.org_id = v_org and c.batch_id = d.id), '[]'::jsonb))));
end
$$;

-- public.verify_mill كما في 0016_mill_v2 حرفاً بحرف:
create or replace function public.verify_mill() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  -- ١) نسخة مفعَّلة واحدة لكلّ خلطة.
  select 'recipe_many_active', count(*) from (
    select v.recipe_id from public.recipe_versions v where v.status = 'active' group by v.org_id, v.recipe_id having count(*) > 1
  ) as x
  union all
  -- ٢) كلّ نسخة غير مسوّدة مجموع موادّها بالكيلو = أساسها (التفعيل يفحصه، والجمود يحفظه)، بلا الوقود والتعبئة (القاعدة ٢٢، 0016): السطور
  --    التي لقطتها «داخل الكتلة» عند التفعيل، لا نوع المادّة الآن (مراجعة 0016 الثانية #2: النوع يتغيّر ما دامت المادّة بلا حركة). والكتلة بالمساعد
  --    الذي لا يرمي (مراجعة 0016 الخامسة #1، ق٥٢): سطر باللتر بلا كثافة في نسخة مجمَّدة كان يُسقط الثوابت كلّها لكلّ المنشآت بـdensity_not_positive
  --    (جملة واحدة بلا شرط منشأة)، فكتلة سطر داخل الكتلة لا تُحسب خرق يُعدّ هنا (والفحص ٣ يسمّي السطر)، وسطر خارجها لا يمسّ المجموع.
  select 'recipe_basis_mismatch', count(*) from (
    select v.id from public.recipe_versions v
    join public.recipe_lines l on l.org_id = v.org_id and l.version_id = v.id
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    cross join lateral (select private.recipe_line_kg_or_null(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l)) as kg) as m
    where v.status <> 'draft'
    group by v.id, v.basis_kg
    having coalesce(bool_or(m.kg is null) filter (where l.in_basis), false) or coalesce(sum(m.kg) filter (where l.in_basis), 0) <> v.basis_kg
  ) as x
  union all
  -- ٣) نسخة غير مسوّدة بلا سطور، أو سطر بلا لقطة وحدة أساس أو لقطته لتر بلا لقطة كثافة (مراجعة 0016 الثالثة #2: اللقطة لا وحدة المادّة الآن،
  --    فتصحيح الوحدة بعد التفعيل لا يكسره ولا يبقى خرقاً على نسخة مقاعدة)، أو سطر مكتوب باللتر بلا لقطة كثافة (مراجعة 0016 الرابعة #1، ق٤٢: كتلته
  --    لا تُحسب، و«سائل بلا كثافة ما ينضاف لعليقة»؛ كان التفعيل يكتب لقطة كيلوغرام لسطر وقود باللتر صُحّحت مادّته كيلوغراماً فيعبر هنا)، أو سطر
  --    بلا لقطة «داخل الكتلة» (مراجعة 0016 الثانية #2).
  select 'recipe_frozen_bad_lines', count(*) from public.recipe_versions v
  where v.status <> 'draft' and (
    not exists (select 1 from public.recipe_lines l where l.org_id = v.org_id and l.version_id = v.id)
    or exists (select 1 from public.recipe_lines l
      where l.org_id = v.org_id and l.version_id = v.id and (l.base_unit is null or (l.base_unit = 'L' and l.density_kg_per_l is null)
        or (l.unit = 'L' and l.density_kg_per_l is null)))
    or exists (select 1 from public.recipe_lines l where l.org_id = v.org_id and l.version_id = v.id and l.in_basis is null))
  union all
  -- ٤) قيمة دفعة الناتج = كلفة الدفعة بالضبط (القاعدة ٢١: لا يضيع فلس بين الإنتاج والمخزن).
  select 'production_output_value', count(*) from public.production_batches b
  join public.stock_lots l on l.org_id = b.org_id and l.id = b.output_lot_id
  left join public.production_values pv on pv.org_id = b.org_id and pv.batch_id = b.id
  where b.status = 'posted' and (l.value_in is distinct from coalesce(pv.total_value, -1) or l.qty_in is distinct from b.output_qty_kg)
  union all
  -- ٥) كلفة الدفعة = مجموع قيم مدخلاتها + الكلف اليدوية (والكلف اليدوية بسطورها في الفحص ١٠).
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
  union all
  -- ١٠) الكلف اليدوية للدفعة المرحَّلة = مجموع سطور تكاليفها (القاعدة ٢٠).
  select 'production_extra_value', count(*) from public.production_values pv
  join public.production_batches b on b.org_id = pv.org_id and b.id = pv.batch_id
  where b.status = 'posted' and pv.extra_value is distinct from coalesce((
    select sum(c.amount) from public.production_costs c where c.org_id = pv.org_id and c.batch_id = pv.batch_id), 0)
  union all
  -- ١١) كلّ سطر كلفة لدفعة مرحَّلة محمَّل بالكامل: مجموع تحميلاته الفعّالة = مبلغه.
  select 'production_cost_allocated', count(*) from public.production_costs c
  join public.production_batches b on b.org_id = c.org_id and b.id = c.batch_id
  where b.status = 'posted' and c.amount is distinct from coalesce((
    select sum(a.amount) from public.production_cost_allocations a where a.org_id = c.org_id and a.cost_id = c.id and a.voided_at is null), 0)
  union all
  -- ١٢) لا مصروف محمَّل فوق مبلغه (FOUNDATION ٤٣٦).
  select 'expense_over_allocated', count(*) from (
    select a.expense_id from public.production_cost_allocations a
    join public.expenses e on e.org_id = a.org_id and e.id = a.expense_id
    where a.voided_at is null
    group by a.expense_id, e.amount having sum(a.amount) > e.amount
  ) as x
  union all
  -- ١٣) لا تحميل فعّال على مصروف ملغى ولا على دفعة غير مرحَّلة (ملغاة أو مسوّدة).
  select 'allocation_on_void', count(*) from public.production_cost_allocations a
  join public.production_batches b on b.org_id = a.org_id and b.id = a.batch_id
  where a.voided_at is null and (b.status <> 'posted'
    or exists (select 1 from public.expenses z where z.org_id = a.org_id and z.reverses_id = a.expense_id))
  union all
  -- ١٤) التحميل من مصروف يدوي (نقداً أو بالدين) أصلي بفئة سطره ووحدة مخزن مدخلات دفعته، ودفعته دفعة سطره.
  select 'allocation_mismatch', count(*) from public.production_cost_allocations a
  join public.production_costs c on c.org_id = a.org_id and c.id = a.cost_id
  join public.production_batches b on b.org_id = c.org_id and b.id = c.batch_id
  join public.warehouses w on w.org_id = b.org_id and w.id = b.input_warehouse_id
  join public.expenses e on e.org_id = a.org_id and e.id = a.expense_id
  where a.batch_id <> c.batch_id or e.category_id <> c.category_id or e.division_id <> w.division_id
    or e.source not in ('cash', 'credit') or e.reverses_id is not null
  union all
  -- ١٥) كلّ مادّة بديلة بسببها وبالمادّة التي حلّت محلّها (القاعدة ١٩).
  select 'production_substitute_reason', count(*) from public.production_inputs p
  where p.is_substitute and (p.reason is null or p.replaced_item_id is null)
$$;

-- private.seed_org_defaults كما في 0005_scopes_stores_items حرفاً بحرف:
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

drop function if exists private.feed_balance_wh();
drop function if exists private.last_posted_batch(uuid);

-- ٣) القيدان وعدم الفراغ كما في 0015، وعمود الدفعة. طريق الرفض أوقف التراجع إن كان في القاعدة سطر بلا كمية أو نسخة بلا أساس، فالجملتان
-- قبل إعادة عدم الفراغ لا تمسّان شيئاً (وبلا الكتلة: سطور مسوّدة بلا كمية تُحذف، ومسوّدة بلا أساس تأخذ افتراضه 1000 كما في 0015).
delete from public.recipe_lines where qty is null;
update public.recipe_versions set basis_kg = 1000 where basis_kg is null;
alter table public.recipe_lines drop constraint if exists recipe_lines_qty_check;
alter table public.recipe_lines add constraint recipe_lines_qty_check check (abs(qty) < 'Infinity' and qty > 0 and qty = round(qty, 3));
alter table public.recipe_lines alter column qty set not null;
alter table public.recipe_versions drop constraint if exists recipe_versions_basis_check;
alter table public.recipe_versions add constraint recipe_versions_basis_check check (abs(basis_kg) < 'Infinity' and basis_kg > 0 and basis_kg = round(basis_kg, 3));
alter table public.recipe_versions alter column basis_kg set not null;
alter table public.production_batches drop column if exists saved_to_recipe;

-- ٤) اسم مخزن العلف في وحدة المعمل كما زرعه 0005 (الاسم الجديد بالضبط وحده):
update public.warehouses w set name = 'مخزن العلف'
from public.divisions d
where d.org_id = w.org_id and d.id = w.division_id and d.kind = 'feed_mill' and w.kind = 'feed' and w.name = 'رصيد العلف';
