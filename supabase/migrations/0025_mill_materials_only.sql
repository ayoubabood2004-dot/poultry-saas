-- 0025_mill_materials_only — «الخلطة موادّ، والكميات عند الإنتاج»: العليقة تُعرَّف بموادّها وحدها، والكميات تُكتب لحظة الإنتاج، وسجلّ كلّ
--   تعديل وإنتاج، و«رصيد العلف» مكاناً واحداً لكلّ ما ينتجه المعمل
--   (كلمة المالك 2026-11-10: «لما اسوي انتاج عليقة او علف… اني بس احدد شنو المواد الي اريدها من دون ما احدد كميات لكن لمن اريد اسوي
--   انتاج ادخل اسوي معاينة عن المواد الي اني اختاريتها سابقا وبلحضتها احدد الكميات الي راح انتجها واحدد هل راح اعدل على هاي الخلطة لو لا
--   وبالتالي كلنا نشوف تاريخ كل تعديل شنو سويت وشنو انتجت وشكد بهاي الفترات وهاي المنتجات. ايضا… لما انتج اي مادة داخل المصنع كلهن لا
--   اراديا يروحن للمخزن الى موقع خاص اسمه رصيد العلف، هناك تتجمع كل الخلطات الي عندي بكمياتها بنفس الترتيب الي رتبنا بيه المخزن»؛
--   وأجوبته بالخيارات: كميات شاشة الإنتاج من آخر إنتاج، و«مخزن العلف» يصير «رصيد العلف» بلا اختيار مخزن للناتج، وبترتيب العلائق).
-- المشكلة: الخلطة اليوم كميات لكلّ أساس (basis_kg) تُكتب مرّة وتُضرب في كلّ إنتاج، والمالك يريد أن يختار الموادّ وحدها ويكتب كمية كلّ مادّة
--   حين يُنتج، ويقرّر حينها هل يصير تغيير الموادّ تعديلاً للخلطة أم لهذه المرّة فقط، ويرى تاريخ التعديلات والإنتاج؛ والناتج يدخل مخزناً
--   يختاره المستخدم بينما المالك يريد مكاناً واحداً ثابتاً.
-- هنا:
--   • نسخة «بالموادّ وحدها»: recipe_lines.qty وrecipe_versions.basis_kg يقبلان الفراغ؛ النسخة المفعَّلة إمّا بلا كميات كلّها وأساسها فارغ، وإمّا
--     بكميات كلّها وأساس (النسخ القائمة كما هي، والشاشات القديمة تعمل)، والخلط mixed_quantities. private.recipe_lines_guard (سطر بلا كمية وحدته
--     وحدة أساس المادّة)، وcreate_recipe (بلا أساس ولا كمية = بالموادّ وحدها)، وnew_recipe_version (التعديل يُنسخ بالموادّ وحدها دائماً)،
--     وactivate_recipe_version (طريق بالموادّ: اللقطات وكثافة السائل ومادّة داخل الكتلة)، وprivate.recipe_expected وrecipe_detail وrecipes_overview
--     بلا رمية على نسخة بلا أساس (وmaterials_only، وقطع اللوحة من آخر دفعة)، وcreate_production يرفض نسخة بلا كميات (quantities_required).
--   • public.produce_batch (production.draft): الإنتاج بنداء واحد بالكميات المكتوبة كما هي (المخطّط = المكتوب)، وتغيير الموادّ عن الخلطة يحتاج
--     اختياراً («عدّل الخلطة» نسخة بالموادّ تُفعَّل في المعاملة نفسها لمن يملك recipe.activate، أو «لهذه المرّة فقط»)، والناتج يدخل «رصيد العلف»
--     (private.feed_balance_wh) بلا اختيار، والمسوّدة بـp_draft؛ والمرجع والمعاينة والترحيل وانتظار ختم الكلف كما في record_production.
--     وproduction_batches.saved_to_recipe (لا منح؛ يكتبه produce_batch وحده) وproduction_detail يقوله.
--   • public.production_form (قارئ شاشة الإنتاج): موادّ النسخة المفعَّلة بكميات آخر إنتاج أو الخلطة القديمة، ومخازن الموادّ، و«رصيد العلف».
--   • public.recipe_history: نسخ الخلطة بما أُضيف وما حُذف ومن أيّ إنتاج، والإنتاج في مدّة بموادّه وكمياته وما زاد وما نقص، بلا مال.
--   • verify_mill: الفحص ٢ يتخطّى النسخة بلا أساس، والفحص ١٦ recipe_quantities_mode.
--   • البيانات: «مخزن العلف» في وحدة المعمل يصير «رصيد العلف»، وprivate.seed_org_defaults يزرعه بالاسم الجديد.
-- تراجع: rollback_0025.sql — يرجّع الأجسام الأحد عشر كما كانت (0023 و0016 و0005) حرفاً بحرف، ويُسقط الدوالّ الأربع الجديدة وعمود
--   saved_to_recipe، ويعيد قيدَي الكمية والأساس وعدم فراغهما، ويرجّع اسم «مخزن العلف». **طريق رفض**: دفعة حُفظت موادّها في خلطتها، أو نسخة
--   بلا أساس، أو سطر خلطة بلا كمية، كلّ واحد يوقف التراجع بصوت بلا أن يغيّر شيئاً (قاعدة 0024 لا تعرف خلطة بلا كميات).
-- تنعاد بأمان: alter column … drop not null، وقيدان بفحص الكتالوج، وadd column if not exists، وإعادة التسمية بالاسم القديم وحده، وcreate or replace.

set lock_timeout = '5s';

-- ─── أ. الخلطة بالموادّ وحدها: الكمية والأساس يقبلان الفراغ ──────────────────────────────────────────────────────────────
-- السطر بلا كمية مادّةٌ في خلطة بالموادّ وحدها (وحدته وحدة أساس المادّة يكتبها الحارس)، والسطر بكمية بقيده كما كان. والأساس بافتراضه 1000
-- كما كان (الإدراج المباشر القديم بلا أساس كما هو)، والفراغ لنسخة بالموادّ وحدها؛ والتفعيل يحفظ التوافق (verify_mill الفحص ١٦).
alter table public.recipe_lines alter column qty drop not null;
alter table public.recipe_versions alter column basis_kg drop not null;
do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.recipe_lines'::regclass and conname = 'recipe_lines_qty_check'
    and pg_get_constraintdef(oid) not like '%qty IS NULL%') then
    alter table public.recipe_lines drop constraint recipe_lines_qty_check;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.recipe_lines'::regclass and conname = 'recipe_lines_qty_check') then
    alter table public.recipe_lines add constraint recipe_lines_qty_check
      check (qty is null or (abs(qty) < 'Infinity' and qty > 0 and qty = round(qty, 3)));
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.recipe_versions'::regclass and conname = 'recipe_versions_basis_check'
    and pg_get_constraintdef(oid) not like '%basis_kg IS NULL%') then
    alter table public.recipe_versions drop constraint recipe_versions_basis_check;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.recipe_versions'::regclass and conname = 'recipe_versions_basis_check') then
    alter table public.recipe_versions add constraint recipe_versions_basis_check
      check (basis_kg is null or (abs(basis_kg) < 'Infinity' and basis_kg > 0 and basis_kg = round(basis_kg, 3)));
  end if;
end
$$;

-- ─── ب. الدفعة التي حُفظت موادّها في خلطتها ─────────────────────────────────────────────────────────────────────────
-- يكتبه produce_batch وحده حين تصير موادّ هذا الإنتاج نسخة جديدة من الخلطة («عدّل الخلطة»)؛ غير ممنوح لأحد (الحدّ هو المنح، درس 0015)،
-- فحارس الرأس المشترك (draft_header_guard) يرفض تغييره من الشاشة. ويقوله production_detail وrecipe_history.
alter table public.production_batches add column if not exists saved_to_recipe boolean not null default false;

-- ─── ج. «رصيد العلف» (جواب المالك Q2): مخزن العلف في وحدة المعمل مكان كلّ إنتاج ─────────────────────────────────────────────
-- الاسم القديم بالضبط وحده (مخزن علف ثانٍ سمّاه المالك يبقى باسمه)، ونسخة الصفّ تزيد بمحفّز البيانات الأساسية (master_write).
update public.warehouses w set name = 'رصيد العلف'
from public.divisions d
where d.org_id = w.org_id and d.id = w.division_id and d.kind = 'feed_mill' and w.kind = 'feed' and w.name = 'مخزن العلف';

-- مخزن الناتج لكلّ إنتاج (العقد §1): أقدم مخزن علف حيّ في وحدة المعمل (بوقت إنشائه ثمّ معرّفه)، بمنشأة الداخل (لا دالّة تأخذ المنشأة).
-- بلا مخزن كهذا لا إنتاج (produce_batch: feed_store_missing)، وشاشة الإنتاج تقوله.
create or replace function private.feed_balance_wh() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select w.id from public.warehouses w
  join public.divisions d on d.org_id = w.org_id and d.id = w.division_id
  where w.org_id = public.auth_org() and d.kind = 'feed_mill' and w.kind = 'feed' and w.archived_at is null
  order by w.created_at, w.id
  limit 1
$$;

-- ─── د. الحرّاس وبانية الخلطة ونسخها وتفعيلها ─────────────────────────────────────────────────────────────────────────
-- حارس سطر الخلطة (0023) على جسمه حرفاً، إلّا أنّ السطر بلا كمية (خلطة بالموادّ وحدها، 0025) يُقبل: وحدته وحدة أساس المادّة يكتبها الحارس
-- (العمود غير فارغ)، ولا تُفحص له كمية ولا كثافة (التفعيل يطلب كثافة السائل، والكمية تُكتب لحظة الإنتاج). والمادّة بالقطعة تُرفض كما كانت،
-- والسطر بكمية بفحوصه كلّها كما كانت.
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
  -- 0025 (خلطة بالموادّ وحدها، كلمة المالك 2026-11-10): السطر بلا كمية وحدته وحدة أساس المادّة، ولا تُفحص له كمية ولا كثافة (التفعيل يطلب
  -- كثافة السائل، والكمية تُكتب لحظة الإنتاج). والسطر بكمية بفحوصه كلّها كما كانت.
  if new.qty is null then
    new.unit := i.base_unit;
  end if;
  if new.unit = 'L' and i.base_unit <> 'L' then
    raise exception 'bad_recipe_unit' using hint = format('«%s» تُقاس بالكيلوغرام، فاكتب كميتها في الخلطة بالكيلوغرام.', i.name);
  end if;
  -- الكثافة تُكتب من نافذة «عدّل» في «المواد» (مراجعة 0016 السادسة #4، ق٦٥): كان التلميح يقول «بطاقة المادّة»، والكثافة فيها قراءة فقط.
  if new.qty is not null and new.unit = 'L' and i.density_kg_per_l is null then
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

-- بانية الخلطة (0016) على جسمها، ويزيد (0025): بلا أساس ولا كمية في أيّ سطر = خلطة بالموادّ وحدها (السطر بالمادّة وحدها، والأساس فارغ،
-- والتفعيل بطريقه)؛ وكلّ سطر بكمية = الخلطة القديمة بأساسها وفحوصها (الأساس مطلوب: bad_basis)؛ وبعض السطور بكمية وبعضها بلا = mixed_quantities.
-- والإعادة بالمعرّف نفسه تقارن الكمية الفارغة قيمةً (وحدة السطر بلا كمية لا تُقارن: يكتبها الحارس من المادّة).
create or replace function public.create_recipe(p_id uuid, p_version_id uuid, p_name text, p_output_item uuid, p_basis_kg numeric, p_lines jsonb,
  p_rates jsonb, p_activate boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  r public.recipes;
  v public.recipe_versions;
  v_name text;
  v_basis numeric;
  v_with int := 0;
  v_without int := 0;
  v_bare boolean;
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
  -- 0025 (كلمة المالك 2026-11-10: «بس احدد شنو المواد… من دون ما احدد كميات»): بلا أساس ولا كمية في أيّ سطر = خلطة بالموادّ وحدها (الأساس
  -- فارغ)، وإلّا الخلطة بكميات وأساسها كما كانت. العدّ على عناصر القائمة الكائنات وحدها (غيرها يرفضه فحص السطر برسالته).
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) = 'array' then
    select count(*) filter (where coalesce(jsonb_typeof(x.value -> 'qty'), 'null') <> 'null'),
      count(*) filter (where coalesce(jsonb_typeof(x.value -> 'qty'), 'null') = 'null')
    into v_with, v_without
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as x(value)
    where jsonb_typeof(x.value) = 'object';
  end if;
  v_bare := p_basis_kg is null and v_with = 0;
  v_basis := case when v_bare then null else p_basis_kg end;
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
            -- 0025: سطر بلا كمية وحدته وحدة أساس المادّة (يكتبها حارس السطر)، فالمرسَل بلا كمية يُقارن بها.
            case when x.value ->> 'qty' is null then (select i.base_unit from public.items i where i.org_id = v_org and i.id::text = lower(x.value ->> 'item_id'))
              else coalesce(nullif(x.value ->> 'unit', ''), 'kg') end) order by x.n), '[]'::jsonb)
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
  -- 0025: الخلط مرفوض (موادّ بكميات وموادّ بلا كميات)، والخلطة بكميات تحتاج أساسها (كان الفارغ 1000 بصمت).
  if v_with > 0 and v_without > 0 then
    raise exception 'mixed_quantities' using hint = 'في الخلطة موادّ بكميات وموادّ بلا كميات: احذف الكميات كلّها، أو اكتب كمية كلّ مادّة وأساس الخلطة.';
  end if;
  if not v_bare and v_basis is null then
    raise exception 'bad_basis' using hint = 'الخلطة بكميات تحتاج أساساً بالكيلوغرام: اكتبه، أو احذف الكميات كلّها لتكون خلطة بالموادّ وحدها.';
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
    -- 0025: سطر خلطة بالموادّ وحدها: المادّة وحدها، ووحدتها يكتبها حارس السطر من المادّة.
    if v_bare then
      insert into public.recipe_lines (org_id, version_id, item_id, qty, unit) values (v_org, v.id, v_item, null, null);
      continue;
    end if;
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

-- «عدّل الخلطة» (0016) على جسمها، إلّا أنّ النسخة الجديدة بالموادّ وحدها دائماً (0025؛ العقد §3.1: «التعديل بالموادّ ولو كانت الخلطة بكميات»):
-- السطر يُنسخ بالمادّة وحدها (كمية فارغة ووحدته وحدة أساس المادّة الآن)، والأساس فارغ؛ فلا تحويل لتر إلى كيلو ولا كثافة تُطلب عند النسخ.
-- والمعدّلات تُنسخ كما كانت، والمادّة التي صارت قطعة تُترك وتُسمّى في skipped كما كانت.
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
    insert into public.recipe_versions (id, org_id, recipe_id, basis_kg) values (p_id, v_org, r.id, null) returning * into v;
    -- 0025 (كلمة المالك 2026-11-10، العقد §3.1): التعديل خلطة بالموادّ وحدها ولو كانت النسخة المصدر بكميات: السطر يُنسخ بالمادّة وحدها (كمية
    -- فارغة، ووحدته وحدة أساس المادّة الآن) والأساس فارغ فوق، فلا تحويل لتر إلى كيلو ولا كثافة تُطلب عند النسخ (التفعيل يطلب كثافة السائل).
    for ln in select l.item_id, i.name, i.base_unit
      from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
      where l.org_id = v_org and l.version_id = s.id order by l.line_no loop
      -- مادّة صارت قطعة (مراجعة 0016 الخامسة، ق٥٥): العليقة بالكتلة فلا تدخل سطراً (حارس السطر)، فتُترك ويُسمّى اسمها.
      if ln.base_unit not in ('kg', 'L') then
        v_skipped := v_skipped || jsonb_build_array(ln.name);
        continue;
      end if;
      insert into public.recipe_lines (org_id, version_id, item_id, qty, unit) values (v_org, v.id, ln.item_id, null, ln.base_unit);
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

-- التفعيل (0016) على جسمه، ويزيد طريقاً لنسخة بالموادّ وحدها (0025) في الحلقة نفسها: كلّ سطورها بلا كمية ← الأساس فارغ، واللقطات الثلاث بجملتها
-- ومعها وحدة السطر = وحدة أساس المادّة الآن، وكثافة كلّ سائل (density_required)، ومادّة واحدة داخل الكتلة على الأقلّ (no_mass_inputs)، بلا فحص كمية
-- ولا مجموع. والنسخة بكميات كلّها بطريقها القديم، وأساسها مطلوب (نسخة بكميات بلا أساس كانت تعبر مقارنة المجموع الفارغة: bad_basis). وبعض السطور
-- بكمية وبعضها بلا ← mixed_quantities.
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
  v_null int := 0;
  v_set int := 0;
  v_bare boolean;
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
  -- 0025 (كلمة المالك 2026-11-10: «بس احدد شنو المواد… من دون ما احدد كميات»): كلّ السطور بلا كمية = نسخة بالموادّ وحدها (أساسها فارغ، ولا مجموع
  -- يُقارن، والكمية تُكتب لحظة الإنتاج)؛ وكلّها بكمية = الطريق القديم كما هو؛ وبعضها بكمية وبعضها بلا مرفوض.
  select count(*) filter (where l.qty is null), count(*) filter (where l.qty is not null) into v_null, v_set
  from public.recipe_lines l where l.org_id = v_org and l.version_id = v.id;
  if v_null > 0 and v_set > 0 then
    raise exception 'mixed_quantities' using hint = 'في هذه النسخة موادّ بكميات وموادّ بلا كميات: احذف الكميات كلّها.';
  end if;
  v_bare := v_set = 0;
  for ln in
    select l.id, l.qty, l.unit, l.item_id, i.name, i.base_unit, i.density_kg_per_l, i.kind
    from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where l.org_id = v_org and l.version_id = v.id order by l.line_no
  loop
    if ln.base_unit not in ('kg', 'L') then
      raise exception 'bad_recipe_unit' using hint = format('«%s» وحدتها قطعة، والعليقة تُحسب بالكتلة: احذف سطرها.', ln.name);
    end if;
    -- 0025: سطر النسخة بالموادّ وحدها بلا كمية فلا وحدة كتابة له: وحدته وحدة أساس المادّة الآن (تُكتب مع اللقطات أدناه)، فلا يُرفض بفحص سطر اللتر،
    -- ويُطلب للسائل كثافته (يُحسب وزنه حين يُنتج)، ولا تُفحص له كمية.
    if v_bare then
      ln.unit := ln.base_unit;
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
    if not v_bare and (ln.qty is null or not (abs(ln.qty) < 'Infinity') or ln.qty <= 0) then
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
      density_kg_per_l = case when ln.base_unit = 'L' then round(ln.density_kg_per_l, 4) else density_kg_per_l end, unit = ln.unit
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
  -- 0025: النسخة بالموادّ وحدها بمادّة داخل الكتلة على الأقلّ (الوقود والتعبئة خارجها)؛ والنسخة بكميات تحتاج أساسها (نسخة بكميات بلا أساس كانت
  -- تعبر مقارنة المجموع الفارغة).
  if v_bare and v_outside = v_count then
    raise exception 'no_mass_inputs' using hint = 'أضف مادّة داخل كتلة الخلطة؛ الوقود والتعبئة خارجها.';
  end if;
  if not v_bare and v.basis_kg is null then
    raise exception 'bad_basis' using hint = format('النسخة بكميات وبلا أساس (مجموع موادّها %s كغم): اكتب أساسها بالكيلوغرام، أو احذف الكميات كلّها.',
      to_char(v_sum, 'FM999999990.999'));
  end if;
  if not v_bare and v_sum <> v.basis_kg then
    raise exception 'basis_mismatch' using hint = format('مجموع مواد الخلطة %s كغم%s، والأساس %s كغم: الفرق %s كغم. عدّل الكميات أو الأساس حتّى يتساويا.',
      to_char(v_sum, 'FM999999990.999'), case when v_outside > 0 then ' (بلا الوقود والتعبئة، فهما خارج كتلة الخلطة)' else '' end,
      to_char(v.basis_kg, 'FM999999990.999'), to_char(v_sum - v.basis_kg, 'FM999999990.999'));
  end if;
  select x.id into v_old from public.recipe_versions x where x.org_id = v_org and x.recipe_id = v.recipe_id and x.status = 'active' for update;
  if v_old is not null then
    update public.recipe_versions set status = 'retired', retired_at = now(), version = version + 1 where org_id = v_org and id = v_old;
  end if;
  update public.recipe_versions set status = 'active', activated_at = now(), activated_by = auth.uid(), version = version + 1,
    basis_kg = case when v_bare then null else basis_kg end
  where org_id = v_org and id = v.id;
  return jsonb_build_object('id', v.id, 'recipe_id', v.recipe_id, 'version_no', v.version_no, 'status', 'active',
    'basis_kg', case when not v_bare then v.basis_kg::text end, 'lines', v_count, 'retired_id', v_old);
end
$$;

-- كلفة الطنّ المتوقّعة (0016) على جسمها، ونسخة بلا أساس (بالموادّ وحدها، 0025) بلا كلفة متوقّعة (null)؛ وسطر بلا كمية في مسوّدة بأساس لا يُحوَّل
-- (يُعدّ في unconverted إن كان له سعر) بدل رمية التحويل على كمية فارغة.
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
  -- 0025: نسخة بلا أساس (بالموادّ وحدها) بلا كلفة متوقّعة.
  if v.id is null or v.basis_kg is null then
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
    v_qty := case when ln.qty is null then null when ln.unit = ln.base_unit then ln.qty
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

-- بطاقة الخلطة (0016) على جسمها، ويزيد (0025): materials_only لكلّ نسخة وللمختارة (لا سطر بكمية). ولنسخة بلا كميات: كمية السطر وكتلته وحصّته فارغة
-- بأنفسها (الكتلة بالمساعد الذي لا يرمي، والحصّة لكتلة معروفة وحدها)، والأساس فارغ، ومجموع الكتلة والكلفة المتوقّعة فارغان.
create or replace function public.recipe_detail(p_id uuid, p_version uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  r public.recipes;
  v public.recipe_versions;
  v_bare boolean;
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
  -- 0025: نسخة بالموادّ وحدها (لا سطر فيها بكمية): كميات سطورها وكتلها وحصصها فارغة بأنفسها، والأساس فارغ، ومجموع الكتلة والكلفة المتوقّعة فارغان.
  v_bare := v.id is not null and not exists (select 1 from public.recipe_lines y where y.org_id = v_org and y.version_id = v.id and y.qty is not null);
  return private.mask(jsonb_build_object(
    'id', r.id, 'name', r.name, 'note', r.note, 'archived', r.archived_at is not null, 'version', r.version,
    'output_item', (select jsonb_build_object('id', i.id, 'name', i.name, 'base_unit', i.base_unit, 'kind', i.kind, 'tracks_expiry', i.tracks_expiry)
      from public.items i where i.org_id = v_org and i.id = r.output_item_id),
    'versions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'version_no', x.version_no, 'status', x.status,
        'basis_kg', x.basis_kg::text, 'activated_at', x.activated_at, 'version', x.version,
        'materials_only', not exists (select 1 from public.recipe_lines y where y.org_id = x.org_id and y.version_id = x.id and y.qty is not null))
      order by x.version_no desc) from public.recipe_versions x where x.org_id = v_org and x.recipe_id = r.id), '[]'::jsonb),
    'selected', case when v.id is null then null else jsonb_build_object('id', v.id, 'version_no', v.version_no, 'status', v.status,
      'basis_kg', v.basis_kg::text, 'note', v.note, 'activated_at', v.activated_at, 'version', v.version, 'materials_only', v_bare) end,
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
    'mass_kg', case when v.id is null or v_bare then null else (select case when bool_or(m.kg is null) then null else coalesce(sum(m.kg), 0) end
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
      'expected', case when v.id is null or v_bare then null else private.recipe_expected(v.id) - 'cost_per_kg' end)));
end
$$;

-- لوحة المعمل (0023) على جسمها، ويزيد (0025): materials_only للنسخة المفعَّلة، وقطع النسخة بالموادّ وحدها من آخر دفعة مرحَّلة للخلطة (بأيّ نسخة):
-- موادّها داخل الكتلة بكتلتها بترتيب سطورها (pieces_source = 'last_batch')، وبلا دفعة موادّ النسخة بترتيبها بلا كتلة ('recipe')؛ والنسخة بكميات كما
-- كانت ('recipe'). و«آخر دفعة» واحدة للبطاقة وقطعها وشاشة الإنتاج: يوم الإنتاج ثمّ وقت الترحيل (كانت بالمعرّف عند تساوي اليوم، فتختلف دفعة البطاقة عن
-- دفعة القطع). والاسم في كلّ قطعة بالمفتاحين item_name وname.
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
      'active', (select jsonb_build_object('id', v.id, 'version_no', v.version_no, 'basis_kg', v.basis_kg::text, 'materials_only', mo.bare,
          'lines', (select count(*) from public.recipe_lines l where l.org_id = v.org_id and l.version_id = v.id),
          -- مواد النسخة بكتلتها بالكيلو من الأكبر: شريط التركيبة ورقاقاتها تُقرأ بلمحة قبل الأرقام. والكتلة بالمساعد الذي لا يرمي (مراجعة 0016
          -- الرابعة #1، ق٤٢): سطر باللتر بلا كثافة في نسخة مفعَّلة كان يرمي density_not_positive للوحة كلّها لكلّ قارئ، فكتلته فارغة وتُرتَّب أخيراً.
          -- 0025: النسخة بالموادّ وحدها (لا كمية فيها): قطعها موادّ آخر دفعة مرحَّلة للخلطة (بأيّ نسخة) داخل الكتلة بكتلتها المسحوبة (الفعلية وإلّا
          -- المخطّطة) بترتيب سطورها، وبلا دفعة موادّ النسخة بترتيبها بلا كتلة؛ والنسخة بكميات كما كانت. والاسم في كلّ قطعة بالمفتاحين.
          'pieces', case when mo.bare and lb.id is not null then coalesce((select jsonb_agg(jsonb_build_object('item_id', p.item_id, 'item_name', pi.name,
              'name', pi.name, 'mass_kg', case when p.base_unit = 'L' and p.density_kg_per_l is null then null
                else private.input_mass_kg(coalesce(p.actual_qty_base, p.planned_qty_base), p.base_unit, p.density_kg_per_l) end::text,
              'in_basis', p.in_basis) order by p.line_no)
            from public.production_inputs p join public.items pi on pi.org_id = p.org_id and pi.id = p.item_id
            where p.org_id = v.org_id and p.batch_id = lb.id and p.in_basis), '[]'::jsonb)
          when mo.bare then coalesce((select jsonb_agg(jsonb_build_object('item_id', y.item_id, 'item_name', yi.name, 'name', yi.name,
              'mass_kg', null::text, 'in_basis', y.in_basis) order by y.line_no)
            from public.recipe_lines y join public.items yi on yi.org_id = y.org_id and yi.id = y.item_id
            where y.org_id = v.org_id and y.version_id = v.id), '[]'::jsonb)
          else coalesce((select jsonb_agg(jsonb_build_object('item_id', l.item_id, 'item_name', i.name, 'name', i.name,
              'mass_kg', m.kg::text,
              -- لقطة «داخل الكتلة» (مراجعة 0016 الثانية #2، والشاشة ب-٨): شريط التركيبة يستثني الوقود والتعبئة.
              'in_basis', coalesce(l.in_basis, i.kind not in ('fuel', 'packaging')))
              order by m.kg desc nulls last, i.name collate "C", l.id)
            from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
              cross join lateral (select private.recipe_line_kg_or_null(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l)) as kg) as m
            where l.org_id = v.org_id and l.version_id = v.id), '[]'::jsonb) end,
          'pieces_source', case when mo.bare and lb.id is not null then 'last_batch' else 'recipe' end)
        from public.recipe_versions v
          cross join lateral (select not exists (select 1 from public.recipe_lines q where q.org_id = v.org_id and q.version_id = v.id and q.qty is not null) as bare) as mo
        where v.org_id = r.org_id and v.recipe_id = r.id and v.status = 'active'),
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
        order by b.produced_on desc, b.posted_at desc, b.id desc limit 1),
      'money', jsonb_build_object('expected_cost_per_kg', (select private.recipe_expected(v4.id) ->> 'cost_per_kg'
        from public.recipe_versions v4 where v4.org_id = r.org_id and v4.recipe_id = r.id and v4.status = 'active'))
    ) order by r.archived_at is not null, r.position nulls last, r.name_norm collate "C", r.id)
    from public.recipes r join public.items i on i.org_id = r.org_id and i.id = r.output_item_id
      -- آخر دفعة مرحَّلة للخلطة يقرؤها القارئ (0025)، كـlast_batch وشاشة الإنتاج: يوم الإنتاج ثمّ وقت الترحيل (كانت last_batch بالمعرّف عند تساوي اليوم).
      left join lateral (select b.id from public.production_batches b join public.recipe_versions v5 on v5.org_id = b.org_id and v5.id = b.recipe_version_id
        where v5.org_id = r.org_id and v5.recipe_id = r.id and b.status = 'posted' and (public.in_scope_wh(b.input_warehouse_id) or public.in_scope_wh(b.output_warehouse_id))
        order by b.produced_on desc, b.posted_at desc, b.id desc limit 1) as lb on true
    where r.org_id = v_org), '[]'::jsonb),
    'stores', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'kind', w.kind) order by w.kind, w.name collate "C", w.id)
      from public.warehouses w
      where w.org_id = v_org and w.archived_at is null and w.kind in ('raw', 'feed') and public.in_scope_wh(w.id)), '[]'::jsonb),
    'feed_items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name) order by i.name_norm collate "C", i.id)
      from public.items i where i.org_id = v_org and i.archived_at is null and i.kind = 'feed'), '[]'::jsonb)));
end
$$;

-- إنشاء الدفعة (0016) على جسمه، ونسخة بلا كميات تُرفض أوّلاً (0025، quantities_required): لا كمية فيها تُضرب، والإنتاج بها من شاشة الإنتاج
-- (produce_batch). وrecord_production يصلها فيرفض كذلك.
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
  -- 0025: نسخة بالموادّ وحدها لا كمية فيها تُضرب: الإنتاج بها من شاشة الإنتاج بكميات تُكتب (produce_batch).
  if v.basis_kg is null or exists (select 1 from public.recipe_lines l where l.org_id = v.org_id and l.version_id = v.id and l.qty is null) then
    raise exception 'quantities_required' using hint = 'هذه الخلطة بلا كميات؛ أنتج من شاشة الإنتاج واكتب الكميات فيها.';
  end if;
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

-- بطاقة الدفعة (0016) على جسمها، وتزيد (0025) saved_to_recipe: حُفظت موادّ هذا الإنتاج نسخةً جديدة من الخلطة.
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
    'note', d.note, 'void_reason', d.void_reason, 'costs_confirmed', d.costs_confirmed_at is not null, 'saved_to_recipe', d.saved_to_recipe,
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

-- الثوابت (0016) كما هي، والفحص ٢ يتخطّى النسخة بلا أساس (بالموادّ وحدها، 0025)، والفحص ١٦ recipe_quantities_mode: نسخة غير مسوّدة تخلط سطوراً
-- بكمية وبلا كمية، أو أساسها فارغ وفيها كمية، أو أساسها مكتوب وسطورها كلّها بلا كمية.
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
    -- (0025) النسخة بلا أساس (بالموادّ وحدها) لا مجموع لها يُقارن؛ والفحص ١٦ يحرس توافقها.
    where v.status <> 'draft' and v.basis_kg is not null
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
  union all
  -- ١٦) (0025) نسخة غير مسوّدة إمّا بموادّ بلا كميات كلّها وأساسها فارغ، وإمّا بكميات كلّها وأساسها مكتوب: لا خلط، ولا أساس فارغ لنسخة بكميات
  --     ولا أساس لنسخة بلا كميات (التفعيل يكتبهما معاً، والجمود يحفظهما).
  select 'recipe_quantities_mode', count(*) from (
    select v.id from public.recipe_versions v
    join public.recipe_lines l on l.org_id = v.org_id and l.version_id = v.id
    where v.status <> 'draft'
    group by v.id, v.basis_kg
    having (bool_or(l.qty is null) and bool_or(l.qty is not null)) or ((v.basis_kg is null) <> bool_and(l.qty is null))
  ) as x
$$;

-- البذور الافتراضية (0005) على جسمها، ومخزن العلف في وحدة المعمل اسمه «رصيد العلف» (0025، جواب المالك Q2).
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
      (1, 'feed_mill', 'المعمل', 'mill', array['مخزن المواد الأوّلية', 'رصيد العلف'], array['raw', 'feed']),
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

-- ─── هـ. الإنتاج بالكميات المكتوبة (كلمة المالك: «بلحضتها احدد الكميات… واحدد هل راح اعدل على هاي الخلطة لو لا») ─────────────────
-- نداء شاشة الإنتاج الواحد، بمعاملة واحدة، على قواعد record_production (0023): الصلاحية (production.draft ونطاق مخزن الموادّ)، والمرجع أوّل شيء
-- (الإعادة بالقيم نفسها ترجّع النتيجة نفسها، والمعرّف بمرجع آخر id_conflict)، والتاريخ كما أُرسل، والمعاينة ثمّ الترحيل ببصمتها (مرّتين على الأكثر)،
-- ومسوّدة تنتظر ختم الكلف حين تكون المشاكل كلّها انتظاره، وأيّ مشكلة أخرى ترفض النداء كلّه (production_blocked بتلميحها، ولا شيء يبقى).
-- والجديد: الكميات كما كتبها المستخدم بوحدة أساس كلّ مادّة (المخطّط = المكتوب، بلا تقريب لخطوة العدّاد)، وكمية الإنتاج = مجموع كتلة الموادّ داخل
-- الكتلة، ولا تُقرأ كميات الخلطة أبداً (بكميات أو بلا). وتغيير الموادّ عن موادّ النسخة المفعَّلة (الترتيب لا يُعدّ) يحتاج اختياراً: «عدّل الخلطة» (true،
-- لمن يملك recipe.activate، ولا مسوّدة قائمة للخلطة) نسخة بالموادّ وحدها بترتيب الشاشة ومعدّلات النسخة الحالية تُفعَّل في المعاملة نفسها وتُنتج بها
-- الدفعة (saved_to_recipe)؛ أو «لهذه المرّة فقط» (false): الدفعة بالنسخة الحالية، والمادّة خارجها مدخل عاديّ، والمحذوفة غائبة. والناتج يدخل
-- «رصيد العلف» (private.feed_balance_wh) بلا اختيار.
-- الأقفال: لا قفل للخلطة إلّا لحفظ الموادّ فيها: الخلطة أوّلاً (كالتفعيل) ثمّ يُعاد فحص النسخة المفعَّلة تحته، فإنتاجان يحفظان معاً يترتّبان والثاني
-- يرى recipe_changed؛ ثمّ أقفال الترحيل كما هي.
create or replace function public.produce_batch(p_id uuid, p_recipe uuid, p_expected_version uuid, p_wh_in uuid, p_lines jsonb,
  p_save_recipe boolean, p_draft boolean, p_produced_on date, p_output_kg numeric, p_expiry date, p_shrink_reason text, p_note text,
  p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'produce_batch';
  v_cached jsonb;
  v_org uuid := public.auth_org();
  v_on date := coalesce(p_produced_on, public.app_today());
  v_reason text := nullif(btrim(coalesce(p_shrink_reason, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  r public.recipes;
  cur public.recipe_versions;
  v public.recipe_versions;
  wi public.warehouses;
  wo public.warehouses;
  o public.items;
  i public.items;
  d public.production_batches;
  a jsonb;
  rt record;
  v_wo uuid;
  v_div uuid;
  v_same boolean;
  v_save boolean;
  v_saved boolean := false;
  v_has_mass boolean := false;
  v_qty numeric;
  v_mass numeric;
  v_density numeric;
  v_planned numeric := 0;
  v_items uuid[] := '{}';
  v_units text[] := '{}';
  v_densities numeric[] := '{}';
  v_qtys numeric[] := '{}';
  v_masses numeric[] := '{}';
  v_basis boolean[] := '{}';
  v_name text;
  v_n int;
  v_amount numeric;
  v_prev jsonb;
  v_post jsonb;
  v_result jsonb;
  v_try int;
  v_constraint text;
  -- مشاكل «انتظار ختم الكلف» وحدها: يختمها غيره، فالدفعة تُحفظ مسوّدة (كما في record_production).
  v_wait constant text[] := array['costs_pending', 'costs_unsealed_scope'];
begin
  set local lock_timeout = '5s';
  -- اليوم كما أُرسل لا كما حُلَّ (مراجعة 0023 #1)، والموادّ كما أُرسلت بترتيبها.
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'recipe', p_recipe, 'version', p_expected_version,
    'in', p_wh_in, 'lines', p_lines, 'save', p_save_recipe, 'draft', p_draft, 'on', p_produced_on, 'output', p_output_kg::text,
    'expiry', p_expiry, 'reason', v_reason, 'note', v_note));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.require('production.draft');
  if p_id is null then
    raise exception 'id_required' using hint = 'تعذّر إنشاء الدفعة دون معرّف. حدّث الشاشة وأعد المحاولة.';
  end if;
  -- ١) شكل الموادّ: قائمة غير فارغة، وكلّ عنصر مادّة بمعرّف وكمية نصّاً بثلاث مراتب على الأكثر.
  if p_lines is null or (jsonb_typeof(p_lines) = 'array' and jsonb_array_length(p_lines) = 0) then
    raise exception 'lines_required' using hint = 'أضف مادّة واحدة على الأقلّ واكتب كميتها.';
  end if;
  if jsonb_typeof(p_lines) <> 'array' then
    raise exception 'bad_line' using hint = 'موادّ الإنتاج بشكل غير صالح. حدّث الشاشة وأعد المحاولة.';
  end if;
  for a in select e.x from jsonb_array_elements(p_lines) as e(x) loop
    if jsonb_typeof(a) <> 'object' or coalesce(a ->> 'item_id', '') !~ v_uuid or coalesce(a ->> 'qty', '') !~ '^[0-9]{1,15}([.][0-9]{1,3})?$' then
      raise exception 'bad_line' using hint = 'كمية مادّة بشكل غير صالح. حدّث الشاشة وأعد المحاولة.';
    end if;
  end loop;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'bad_note' using hint = format('الملاحظة %s حرفاً، والحدّ 500 حرف. اختصرها.', length(v_note));
  end if;
  if p_output_kg >= 1000000000 then
    raise exception 'qty_too_large' using hint = 'الكمية أكبر من المعقول لدفعة واحدة (الحدّ أقلّ من 1,000,000,000). راجع الرقم.';
  end if;
  -- معرّف دفعة سُجّلت بنداء آخر (ضغطتان بمرجعين، أو معرّف مكرَّر): يُسمّى بدل خطأ المفتاح الخام (كما في record_production).
  if exists (select 1 from public.production_batches x where x.id = p_id) then
    raise exception 'id_conflict' using hint = 'هذه الدفعة سُجّلت من قبل. افتحها من المعمل لترى ما حُفظ.';
  end if;
  -- ٢) الخلطة ونسختها المفعَّلة كما رأتها الشاشة.
  select * into r from public.recipes where org_id = v_org and id = p_recipe;
  if r.id is null then
    raise exception 'recipe_not_found' using hint = 'هذه الخلطة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if r.archived_at is not null then
    raise exception 'recipe_archived' using hint = format('الخلطة «%s» مؤرشفة، فلا يُنتَج بها. أعِدها من الأرشيف أوّلاً.', r.name);
  end if;
  select * into cur from public.recipe_versions where org_id = v_org and recipe_id = r.id and status = 'active';
  if cur.id is null then
    raise exception 'version_not_active' using hint = format('لا نسخة مفعَّلة للخلطة «%s»، فلا يُنتَج بها. فعّل موادّها من صفحة الخلطة أوّلاً.', r.name);
  end if;
  if cur.id is distinct from p_expected_version then
    raise exception 'recipe_changed' using hint = 'تغيّرت هذه الخلطة من جهاز آخر؛ حدّث الشاشة ثمّ أنتج.';
  end if;
  -- ٣) المخزنان: الموادّ بنطاق المنتج، والناتج «رصيد العلف» بلا اختيار.
  wi := private.stock_wh(p_wh_in, true);
  v_wo := private.feed_balance_wh();
  select * into wo from public.warehouses where org_id = v_org and id = v_wo;
  if wo.id is null then
    raise exception 'feed_store_missing' using hint = 'لا يوجد «رصيد العلف» في المعمل: أضفه من إعداد المخزن.';
  end if;
  if wi.id = wo.id then
    raise exception 'same_warehouse' using hint = 'مخزن الموادّ هو «رصيد العلف» نفسه؛ اختر مخزن الموادّ الأوّلية.';
  end if;
  select * into o from public.items where org_id = v_org and id = r.output_item_id;
  if o.archived_at is not null then
    raise exception 'item_archived' using hint = format('مادّة الناتج «%s» مؤرشفة. أعِدها من الأرشيف أوّلاً.', o.name);
  end if;
  if not private.item_admissible(wo.kind, o.kind) then
    raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s»: نوع المادّة لا يناسب نوع مخزن الناتج.', o.name, wo.name);
  end if;
  for v_div in select distinct x from unnest(array[wi.division_id, wo.division_id]) as x order by 1 loop
    perform private.check_post_date(v_on, v_div);
  end loop;
  -- ٤) هل تغيّرت الموادّ عن موادّ النسخة المفعَّلة (مجموعة المعرّفات، الترتيب لا يُعدّ)، وهل تُحفظ فيها: الكثافة للسائل من لقطة النسخة التي تُنتج
  --    بها الدفعة (الجديدة تلقط كثافة المادّة الآن)، وإلّا كثافة المادّة.
  v_same := (select coalesce(array_agg(distinct (e.x ->> 'item_id')::uuid order by (e.x ->> 'item_id')::uuid), '{}') from jsonb_array_elements(p_lines) as e(x))
    = (select coalesce(array_agg(l.item_id order by l.item_id), '{}') from public.recipe_lines l where l.org_id = v_org and l.version_id = cur.id);
  v_save := not v_same and coalesce(p_save_recipe, false);
  -- ٥) كلّ مادّة بترتيب الشاشة: موجودة وحيّة ومرّة واحدة، يستلمها مخزن الموادّ، بالكتلة (كيلو أو لتر) والسائل بكثافة، وكميتها أكبر من صفر.
  for a in select e.x from jsonb_array_elements(p_lines) with ordinality as e(x, n) order by e.n loop
    select * into i from public.items where org_id = v_org and id = (a ->> 'item_id')::uuid;
    if i.id is null then
      raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
    end if;
    if i.archived_at is not null then
      raise exception 'item_archived' using hint = format('«%s» محذوفة من القوائم، فلا تُسحب في الإنتاج. أظهِرها من ملفّها، أو أزِلها من موادّ هذا الإنتاج.', i.name);
    end if;
    if i.id = any (v_items) then
      raise exception 'item_duplicated' using hint = format('«%s» مكتوبة في موادّ الإنتاج مرّتين. اكتب كميتها مرّة واحدة.', i.name);
    end if;
    if not private.item_admissible(wi.kind, i.kind) then
      raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s»: اختر مادّة من مواد المعمل الأوّلية.', i.name, wi.name);
    end if;
    if i.base_unit not in ('kg', 'L') then
      raise exception 'bad_recipe_unit' using hint = format('«%s» وحدتها قطعة، والدفعة تُحسب بالكتلة: لا تدخل فيها بهذه النسخة.', i.name);
    end if;
    v_density := case when i.base_unit = 'L' then round(case when v_save then i.density_kg_per_l else coalesce((select l.density_kg_per_l
      from public.recipe_lines l where l.org_id = v_org and l.version_id = cur.id and l.item_id = i.id), i.density_kg_per_l) end, 4) end;
    -- الكثافة تُكتب من نافذة «عدّل» في «المواد» (مراجعة 0016 السادسة #4، ق٦٥).
    if i.base_unit = 'L' and v_density is null then
      raise exception 'density_required' using hint = format('«%s» سائل بلا كثافة، فلا يُحسب وزنه. اكتب كثافته من «المواد» في المخزن (زرّ «عدّل» بجانبها) أوّلاً.', i.name);
    end if;
    v_qty := round((a ->> 'qty')::numeric, 3);
    if v_qty <= 0 then
      raise exception 'qty_not_positive' using hint = format('كمية «%s» أكبر من صفر. لإخراجها من هذا الإنتاج اضغط «أزِل».', i.name);
    end if;
    if v_qty >= 1000000000 then
      raise exception 'qty_too_large' using hint = 'الكمية أكبر من المعقول لدفعة واحدة (الحدّ أقلّ من 1,000,000,000). راجع الرقم.';
    end if;
    v_mass := private.input_mass_kg(v_qty, i.base_unit, v_density);
    -- سطر لتر تُقرَّب كتلته صفراً (القاعدة ٤): رفض مسمّى لا خطأ قيد خام.
    if v_mass <= 0 then
      raise exception 'qty_not_positive' using hint = format('كمية «%s» تُقرَّب صفراً بالكيلوغرام. اكتب كمية أكبر.', i.name);
    end if;
    v_items := v_items || i.id;
    v_units := v_units || i.base_unit;
    v_densities := v_densities || v_density;
    v_qtys := v_qtys || v_qty;
    v_masses := v_masses || v_mass;
    -- الوقود والتعبئة خارج الكتلة (FOUNDATION القاعدة ٢٢): يُسحبان ويُحسبان بكلفتهما، ولا يدخلان كمية الإنتاج.
    v_basis := v_basis || (i.kind not in ('fuel', 'packaging'));
    if i.kind not in ('fuel', 'packaging') then
      v_planned := v_planned + v_mass;
      v_has_mass := true;
    end if;
  end loop;
  if not v_has_mass then
    raise exception 'no_mass_inputs' using hint = 'الدفعة بلا مادّة داخل الكتلة: أضف مادّة أوّلية؛ الوقود والتعبئة وحدهما لا يصنعان علفاً.';
  end if;
  if v_planned >= 1000000000 then
    raise exception 'qty_too_large' using hint = 'الكمية أكبر من المعقول لدفعة واحدة (الحدّ أقلّ من 1,000,000,000). راجع الرقم.';
  end if;
  -- ٦) الاختيار حين تغيّرت الموادّ، و«عدّل الخلطة»: نسخة بالموادّ وحدها بترتيب الشاشة ومعدّلات النسخة الحالية، مفعَّلة في هذه المعاملة.
  if not v_same then
    if p_save_recipe is null then
      raise exception 'recipe_choice_required' using hint = 'غيّرت موادّ الخلطة: اختر «عدّل الخلطة» أو «لهذه المرّة فقط».';
    end if;
    if p_save_recipe then
      if not public.can('recipe.activate') then
        raise exception 'forbidden' using hint = 'تعديل الخلطة للمالك أو المدير؛ اختر «لهذه المرّة فقط».';
      end if;
      perform 1 from public.recipes x where x.org_id = v_org and x.id = r.id for update;
      select * into cur from public.recipe_versions where org_id = v_org and recipe_id = r.id and status = 'active';
      if cur.id is distinct from p_expected_version then
        raise exception 'recipe_changed' using hint = 'تغيّرت هذه الخلطة من جهاز آخر؛ حدّث الشاشة ثمّ أنتج.';
      end if;
      if exists (select 1 from public.recipe_versions x where x.org_id = v_org and x.recipe_id = r.id and x.status = 'draft') then
        raise exception 'draft_exists' using hint = 'للخلطة تعديل مفتوح لم يُفعَّل؛ فعّله أو احذفه من صفحة الخلطة، أو أنتج لهذه المرّة فقط.';
      end if;
      select c.name into v_name from public.recipe_cost_rates x join public.expense_categories c on c.org_id = x.org_id and c.id = x.category_id
      where x.org_id = v_org and x.version_id = cur.id and c.archived_at is not null order by x.line_no limit 1;
      if v_name is not null then
        raise exception 'category_archived' using hint = format('فئة «%s» في تكاليف الخلطة مؤرشفة، فلا تُنسخ إلى تعديل الخلطة. أعِدها من الأرشيف، أو أنتج لهذه المرّة فقط.', v_name);
      end if;
      insert into public.recipe_versions (org_id, recipe_id, basis_kg) values (v_org, r.id, null) returning * into v;
      for v_n in 1 .. cardinality(v_items) loop
        insert into public.recipe_lines (org_id, version_id, item_id, qty, unit) values (v_org, v.id, v_items[v_n], null, v_units[v_n]);
      end loop;
      for rt in select x.category_id, x.amount_per_ton from public.recipe_cost_rates x where x.org_id = v_org and x.version_id = cur.id order by x.line_no loop
        insert into public.recipe_cost_rates (org_id, version_id, category_id, amount_per_ton) values (v_org, v.id, rt.category_id, rt.amount_per_ton);
      end loop;
      perform public.activate_recipe_version(v.id, (select x.version from public.recipe_versions x where x.org_id = v_org and x.id = v.id));
      select * into v from public.recipe_versions where org_id = v_org and id = v.id;
      v_saved := true;
    end if;
  end if;
  if not v_saved then
    v := cur;
  end if;
  -- ٧) الدفعة: المخطّط = المكتوب، وكمية الإنتاج = مجموع كتلة ما داخل الكتلة، والناتج «رصيد العلف»، وسطور التكاليف من معدّلات نسختها كما في
  --    create_production؛ ووزن الناتج والانتهاء والسبب والملاحظة كما في record_production. وضغطتان بمرجعين على المعرّف نفسه في اللحظة نفسها
  --    (مراجعة 0023 #8): الثانية تنتظر على المفتاح ثمّ تصلها مخالفته، فتُسمّى id_conflict.
  begin
    insert into public.production_batches (id, org_id, recipe_version_id, output_item_id, input_warehouse_id, output_warehouse_id,
      planned_kg, produced_on, output_qty_kg, output_expiry_on, shrink_reason, note, saved_to_recipe)
    values (p_id, v_org, v.id, o.id, wi.id, wo.id, round(v_planned, 3), v_on, p_output_kg, p_expiry, v_reason, v_note, v_saved)
    returning * into d;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint is distinct from 'production_batches_pkey' then
      raise;
    end if;
    raise exception 'id_conflict' using hint = 'هذه الدفعة سُجّلت من قبل. افتحها من المعمل لترى ما حُفظ.';
  end;
  for v_n in 1 .. cardinality(v_items) loop
    insert into public.production_inputs (org_id, batch_id, line_no, item_id, base_unit, density_kg_per_l, planned_qty_base, planned_mass_kg, in_basis)
    values (v_org, d.id, v_n, v_items[v_n], v_units[v_n], v_densities[v_n], v_qtys[v_n], v_masses[v_n], v_basis[v_n]);
  end loop;
  for rt in
    select x.line_no, x.category_id, x.amount_per_ton from public.recipe_cost_rates x
    where x.org_id = v_org and x.version_id = v.id order by x.line_no
  loop
    v_amount := private._mul_div_round(rt.amount_per_ton, d.planned_kg, 1000, 2);
    insert into public.production_costs (org_id, batch_id, line_no, category_id, planned_amount, amount, source)
    values (v_org, d.id, rt.line_no, rt.category_id, v_amount, v_amount, 'recipe');
  end loop;
  -- ٨) «احفظ مسوّدة»: الدفعة ورأسها وحدهما، وصفحة الدفعة تكمل كما اليوم.
  if coalesce(p_draft, false) then
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'status', 'draft', 'saved_to_recipe', v_saved,
      'recipe_version_id', v.id, 'version_no', v.version_no));
  end if;
  -- ٩) المعاينة ثمّ الترحيل ببصمتها، مرّتين على الأكثر (مراجعة 0023 #4)، كما في record_production.
  for v_try in 1 .. 2 loop
    v_prev := public.preview_production(p_id);
    if jsonb_array_length(v_prev -> 'problems') > 0 and not exists (select 1 from jsonb_array_elements(v_prev -> 'problems') as p(x)
        where not (p.x ->> 'code' = any (v_wait))) then
      select * into d from public.production_batches where org_id = v_org and id = p_id;
      v_result := jsonb_build_object('id', d.id, 'status', 'draft', 'awaiting', 'costs', 'version', d.version, 'planned_kg', d.planned_kg::text,
        'recipe_name', r.name, 'saved_to_recipe', v_saved, 'recipe_version_id', v.id, 'version_no', v.version_no);
      return private.ref_store(v_fn, p_client_ref, v_result);
    end if;
    if not coalesce((v_prev ->> 'can_post')::boolean, false) then
      -- أوّل مشكلة تمنع الإنتاج (لا انتظار الختم) بأرقامها، ولا شيء يبقى (ولا نسخة الخلطة إن حُفظت).
      raise exception 'production_blocked' using hint = coalesce(private.production_problem_hint((select p.x from jsonb_array_elements(v_prev -> 'problems')
          with ordinality as p(x, n) where not (p.x ->> 'code' = any (v_wait)) order by p.n limit 1), wi.name),
        'في الدفعة ما يمنع الإنتاج. حدّث الشاشة وأعد المحاولة.');
    end if;
    select * into d from public.production_batches where org_id = v_org and id = p_id;
    begin
      v_post := public.post_production(p_id, d.version, v_prev ->> 'plan_token', p_client_ref);
      exit;
    exception when raise_exception then
      if sqlerrm is distinct from 'stale_preview' then
        raise;
      end if;
      if v_try = 2 then
        raise exception 'stale_preview' using hint = 'تغيّر المخزون من نافذة أو جهاز آخر أثناء الإنتاج، فلم يُحفظ شيء. اضغط «أنتج» مرّة أخرى.';
      end if;
    end;
  end loop;
  select * into d from public.production_batches where org_id = v_org and id = p_id;
  v_result := jsonb_build_object('id', d.id, 'status', d.status, 'doc_no', d.doc_no, 'produced_on', d.produced_on,
    'recipe_name', r.name, 'output_item_name', o.name, 'input_warehouse_name', wi.name, 'output_warehouse_name', wo.name,
    'output_qty_kg', d.output_qty_kg::text, 'input_mass_kg', d.input_mass_kg::text, 'shrink_kg', d.shrink_kg::text, 'note', d.note,
    'saved_to_recipe', v_saved, 'recipe_version_id', v.id, 'version_no', v.version_no,
    'money', (select jsonb_build_object('input_value', pv.input_value::text, 'extra_value', pv.extra_value::text, 'total_value', pv.total_value::text,
        'cost_per_kg', private.per_unit(pv.total_value, d.output_qty_kg)::text)
      from public.production_values pv where pv.org_id = v_org and pv.batch_id = d.id));
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;

-- ─── و. قارئ شاشة الإنتاج ───────────────────────────────────────────────────────────────────────────────────────────
-- لمن يُنتج (production.draft) وبنطاقه مخزن موادّ حيّ واحد على الأقلّ، وإلّا forbidden. موادّ النسخة المفعَّلة بترتيبها، بوحدة أساس كلّ مادّة الآن
-- وكثافة السائل وخطوة العدّاد و«داخل الكتلة» كما يحسبها produce_batch؛ وكمية كلّ مادّة مقترحة (جواب المالك Q1): كميتها في آخر دفعة مرحَّلة للخلطة
-- (يوم الإنتاج ثمّ وقت الترحيل؛ مجموع الفعلي وإلّا المخطّط، بوحدتها الآن) ← «last»، وإلّا كميتها في النسخة القديمة بكميات محوَّلة إلى وحدتها بكثافة
-- اللقطة ← «recipe»، وإلّا فارغة. وآخر دفعة بموادّها التي ليست في النسخة (تعرضها الشاشة أوّلاً في «أضف مادّة»)، ومخازن الموادّ الحيّة بالنطاق
-- بأسمائها، و«رصيد العلف»، وهل يعدّل الخلطة، وهل للخلطة تعديل مفتوح. بلا مال.
create or replace function public.production_form(p_recipe uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  r public.recipes;
  cur public.recipe_versions;
  v_bare boolean;
  v_last uuid;
  v_wo uuid;
begin
  perform private.require('production.draft');
  if not exists (select 1 from public.warehouses w where w.org_id = v_org and w.kind = 'raw' and w.archived_at is null and public.in_scope_wh(w.id)) then
    raise exception 'forbidden' using hint = 'مخازن موادّ المعمل خارج نطاقك، فلا تُنتج منها. اطلب من مالك المنشأة تعديل نطاقك.';
  end if;
  select * into r from public.recipes where org_id = v_org and id = p_recipe;
  if r.id is null then
    raise exception 'recipe_not_found' using hint = 'هذه الخلطة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  select * into cur from public.recipe_versions where org_id = v_org and recipe_id = r.id and status = 'active';
  v_bare := cur.id is not null and not exists (select 1 from public.recipe_lines l where l.org_id = v_org and l.version_id = cur.id and l.qty is not null);
  -- آخر دفعة مرحَّلة للخلطة بأيّ نسخة، ممّا يقرؤه المنتج (أحد طرفيها بنطاقه، كسياسة قراءة الدفعة).
  select b.id into v_last from public.production_batches b
  join public.recipe_versions x on x.org_id = b.org_id and x.id = b.recipe_version_id
  where b.org_id = v_org and x.recipe_id = r.id and b.status = 'posted'
    and (public.in_scope_wh(b.input_warehouse_id) or public.in_scope_wh(b.output_warehouse_id))
  order by b.produced_on desc, b.posted_at desc, b.id desc
  limit 1;
  v_wo := private.feed_balance_wh();
  return jsonb_build_object(
    'today', public.app_today(),
    'recipe', jsonb_build_object('id', r.id, 'name', r.name, 'archived', r.archived_at is not null,
      'output_item', (select jsonb_build_object('id', i.id, 'name', i.name) from public.items i where i.org_id = v_org and i.id = r.output_item_id)),
    'active', case when cur.id is null then null else jsonb_build_object('id', cur.id, 'version_no', cur.version_no, 'materials_only', v_bare) end,
    'materials', case when cur.id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
        'line_no', l.line_no, 'item_id', l.item_id, 'name', i.name, 'kind', i.kind, 'base_unit', i.base_unit,
        'density', case when i.base_unit = 'L' then round(coalesce(l.density_kg_per_l, i.density_kg_per_l), 4)::text end,
        'in_basis', i.kind not in ('fuel', 'packaging'), 'scale_step', i.scale_step::text,
        'default_qty', coalesce(q.last_qty, q.recipe_qty)::text,
        'default_source', case when q.last_qty is not null then 'last' when q.recipe_qty is not null then 'recipe' end)
        order by l.line_no)
      from public.recipe_lines l
      join public.items i on i.org_id = l.org_id and i.id = l.item_id
      cross join lateral (select
        (select sum(coalesce(p.actual_qty_base, p.planned_qty_base)) from public.production_inputs p
          where p.org_id = l.org_id and p.batch_id = v_last and p.item_id = l.item_id and p.base_unit = i.base_unit) as last_qty,
        case when v_bare or l.qty is null then null
          when l.unit = i.base_unit then l.qty
          when l.unit = 'kg' and i.base_unit = 'L' and coalesce(l.density_kg_per_l, i.density_kg_per_l) > 0
            then private.kg_to_liters(l.qty, coalesce(l.density_kg_per_l, i.density_kg_per_l))
          when l.unit = 'L' and i.base_unit = 'kg' and l.density_kg_per_l > 0 then private.liters_to_kg(l.qty, l.density_kg_per_l)
        end as recipe_qty) as q
      where l.org_id = v_org and l.version_id = cur.id), '[]'::jsonb) end,
    'last', (select jsonb_build_object('id', b.id, 'doc_no', b.doc_no, 'produced_on', b.produced_on, 'output_kg', b.output_qty_kg::text,
        'input_mass_kg', b.input_mass_kg::text,
        'extra_items', coalesce((select jsonb_agg(jsonb_build_object('item_id', p.item_id, 'name', i.name) order by p.line_no)
          from public.production_inputs p join public.items i on i.org_id = p.org_id and i.id = p.item_id
          where p.org_id = b.org_id and p.batch_id = b.id
            and not exists (select 1 from public.recipe_lines l where l.org_id = p.org_id and l.version_id = cur.id and l.item_id = p.item_id)), '[]'::jsonb))
      from public.production_batches b where b.org_id = v_org and b.id = v_last),
    'stores', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name) order by w.name collate "C", w.id)
      from public.warehouses w where w.org_id = v_org and w.kind = 'raw' and w.archived_at is null and public.in_scope_wh(w.id)), '[]'::jsonb),
    'output_store', (select jsonb_build_object('id', w.id, 'name', w.name) from public.warehouses w where w.org_id = v_org and w.id = v_wo),
    'can_edit_recipe', public.can('recipe.activate'),
    'draft_exists', exists (select 1 from public.recipe_versions x where x.org_id = v_org and x.recipe_id = r.id and x.status = 'draft'));
end
$$;

-- ─── ز. سجلّ الخلطة (كلمة المالك: «كلنا نشوف تاريخ كل تعديل شنو سويت وشنو انتجت وشكد بهاي الفترات») ──────────────────────────────
-- لكلّ قارئ (read، كبطاقة الخلطة)، لمدّة حتى 366 يوماً: نسخ الخلطة غير المسوّدة كلّها من الأحدث (بلا تصفية بالمدّة) بموادّها بترتيبها، وما أُضيف وما
-- حُذف عن النسخة غير المسوّدة قبلها (الأولى: موادّها كلّها مضافة)، والإنتاج الذي حُفظت موادّه فيها؛ والإنتاج في المدّة (المرحَّل والملغى بعد ترحيله،
-- لا المسوّدات) من الأحدث، بموادّه وكمياته بترتيبها، والمادّة خارج نسخته (extra) وموادّ نسخته التي لم تُستعمل (omitted)؛ والمجاميع للمرحَّل. الدفعات
-- بنطاق القارئ كسياسة قراءتها (أحد طرفيها). بلا مال.
create or replace function public.recipe_history(p_recipe uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  r public.recipes;
begin
  perform private.require('read');
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) then
    raise exception 'period_required' using hint = 'اختر أوّل المدّة وآخرها من التقويم.';
  end if;
  if p_from > p_to then
    raise exception 'period_required' using hint = 'أوّل المدّة بعد آخرها. اختر المدّة من جديد.';
  end if;
  if p_to - p_from > 365 then
    raise exception 'period_too_long' using hint = 'المدّة أطول من سنة. اختر مدّة حتى 366 يوماً.';
  end if;
  select * into r from public.recipes x where x.org_id = v_org and x.id = p_recipe;
  if r.id is null then
    raise exception 'recipe_not_found' using hint = 'هذه الخلطة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  return jsonb_build_object(
    'recipe', jsonb_build_object('id', r.id, 'name', r.name),
    'versions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'version_no', x.version_no, 'status', x.status,
        'activated_at', x.activated_at, 'activated_by', private.member_name(x.activated_by), 'retired_at', x.retired_at,
        'materials_only', not exists (select 1 from public.recipe_lines l where l.org_id = x.org_id and l.version_id = x.id and l.qty is not null),
        'items', coalesce((select jsonb_agg(jsonb_build_object('item_id', l.item_id, 'name', i.name) order by l.line_no)
          from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
          where l.org_id = x.org_id and l.version_id = x.id), '[]'::jsonb),
        'added', coalesce((select jsonb_agg(jsonb_build_object('item_id', l.item_id, 'name', i.name) order by l.line_no)
          from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
          where l.org_id = x.org_id and l.version_id = x.id
            and not exists (select 1 from public.recipe_lines y where y.org_id = l.org_id and y.version_id = pv.id and y.item_id = l.item_id)), '[]'::jsonb),
        'removed', coalesce((select jsonb_agg(jsonb_build_object('item_id', y.item_id, 'name', i.name) order by y.line_no)
          from public.recipe_lines y join public.items i on i.org_id = y.org_id and i.id = y.item_id
          where y.org_id = x.org_id and y.version_id = pv.id
            and not exists (select 1 from public.recipe_lines l where l.org_id = y.org_id and l.version_id = x.id and l.item_id = y.item_id)), '[]'::jsonb),
        'from_batch', (select jsonb_build_object('id', b.id, 'doc_no', b.doc_no) from public.production_batches b
          where b.org_id = x.org_id and b.recipe_version_id = x.id and b.saved_to_recipe
            and (public.in_scope_wh(b.input_warehouse_id) or public.in_scope_wh(b.output_warehouse_id))
          order by b.created_at, b.id limit 1))
      order by x.version_no desc)
      from public.recipe_versions x
      left join lateral (select y.id from public.recipe_versions y
        where y.org_id = x.org_id and y.recipe_id = x.recipe_id and y.status <> 'draft' and y.version_no < x.version_no
        order by y.version_no desc limit 1) as pv on true
      where x.org_id = v_org and x.recipe_id = r.id and x.status <> 'draft'), '[]'::jsonb),
    'productions', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'doc_no', b.doc_no, 'produced_on', b.produced_on, 'status', b.status,
        'version_no', x.version_no, 'output_kg', b.output_qty_kg::text, 'input_mass_kg', b.input_mass_kg::text,
        'saved_to_recipe', b.saved_to_recipe, 'note', b.note, 'by', private.member_name(coalesce(b.posted_by, b.created_by)),
        'lines', coalesce((select jsonb_agg(jsonb_build_object('item_id', p.item_id, 'name', i.name,
            'qty', coalesce(p.actual_qty_base, p.planned_qty_base)::text, 'base_unit', p.base_unit,
            'mass_kg', private.input_mass_kg(coalesce(p.actual_qty_base, p.planned_qty_base), p.base_unit, p.density_kg_per_l)::text,
            'in_basis', p.in_basis,
            'extra', not exists (select 1 from public.recipe_lines l where l.org_id = p.org_id and l.version_id = b.recipe_version_id and l.item_id = p.item_id))
            order by p.line_no)
          from public.production_inputs p join public.items i on i.org_id = p.org_id and i.id = p.item_id
          where p.org_id = b.org_id and p.batch_id = b.id), '[]'::jsonb),
        'omitted', coalesce((select jsonb_agg(jsonb_build_object('item_id', l.item_id, 'name', i.name) order by l.line_no)
          from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
          where l.org_id = b.org_id and l.version_id = b.recipe_version_id
            and not exists (select 1 from public.production_inputs p where p.org_id = l.org_id and p.batch_id = b.id and p.item_id = l.item_id)), '[]'::jsonb))
      order by b.produced_on desc, b.posted_at desc, b.id desc)
      from public.production_batches b
      join public.recipe_versions x on x.org_id = b.org_id and x.id = b.recipe_version_id
      where b.org_id = v_org and x.recipe_id = r.id and b.produced_on between p_from and p_to
        and (b.status = 'posted' or (b.status = 'void' and b.doc_no is not null))
        and (public.in_scope_wh(b.input_warehouse_id) or public.in_scope_wh(b.output_warehouse_id))), '[]'::jsonb),
    'totals', (select jsonb_build_object('batches', count(*)::int, 'output_kg', coalesce(sum(b.output_qty_kg), 0)::text)
      from public.production_batches b
      join public.recipe_versions x on x.org_id = b.org_id and x.id = b.recipe_version_id
      where b.org_id = v_org and x.recipe_id = r.id and b.produced_on between p_from and p_to and b.status = 'posted'
        and (public.in_scope_wh(b.input_warehouse_id) or public.in_scope_wh(b.output_warehouse_id))));
end
$$;

-- ─── ح. الصلاحيات ───────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.produce_batch(uuid, uuid, uuid, uuid, jsonb, boolean, boolean, date, numeric, date, text, text, uuid),
  public.production_form(uuid), public.recipe_history(uuid, date, date) from public, anon;
grant execute on function public.produce_batch(uuid, uuid, uuid, uuid, jsonb, boolean, boolean, date, numeric, date, text, text, uuid),
  public.production_form(uuid), public.recipe_history(uuid, date, date) to authenticated;
