-- 0023_mill_order_produce — «ترتيب معمل العلف»: العلائق وموادّها بترتيب المالك، والإنتاج بنداء واحد، وتقرير كلّ عليقة بالأيام
--   (كلمة المالك 2026-11-10: «اريد يجي ينشئ كل انواع العلايق الي يريدها ويرتبها مثل ما هو يريد، وداخل هاي العليقة… يرتب المواد…
--   ويكدر يسوي انتاج… ويشوف الكمية الي راح يتم انتاجها، واذا باقي للطن شوية يكدر يسوي زر تقريبي انها طن ويكتب ملاحظة اختيارية… وتقرير
--   كامل داخل هذا العلف جدول كالندر… وطباعة تقارير… شنو انتجنا… وشنو جانت المواد»؛ وأجوبته: الفرق للطنّ من مادّة واحدة يسمّيها (مثل
--   برمكس)، وشاشة واحدة للكمية والمواد، والتقرير «كلشي مفتوح»؛ DECISIONS «ترتيب معمل العلف»).
-- المشكلة: العلائق في المعمل بالاسم وحده وموادّ كلّ عليقة بترتيب إضافتها، والإنتاج ثلاث خطوات (نافذة الكمية ثمّ صفحة الدفعة ثمّ «أنتج
--   الآن») ولا تقرير يجمع ما أُنتج من عليقة في شهر أو يوم وما استُعمل له.
-- هنا:
--   • public.recipes.position وpublic.set_recipe_order (recipe.activate): ترتيب العلائق الفعّالة كلّها بنداء واحد، مشروطاً بالترتيب الذي
--     رآه (recipes_changed إن تغيّر، والإعادة بالترتيب المطلوب نفسه بلا رفض)؛ وpublic.recipes_overview (0016 كما هي) تعرضها به ثمّ بالاسم.
--   • public.set_recipe_line_order (recipe.activate): ترتيب سطور نسخة مسوّدة بالشرط نفسه (lines_changed)، وprivate.recipe_lines_guard
--     (0016 كما هو) يقبل تغيير line_no منها وحدها (العمود غير ممنوح لأحد، وعلامة المعاملة app.recipe_line_order منها).
--   • public.record_production (production.draft): الإنتاج بنداء واحد ومعاملة واحدة من الدوالّ القائمة نفسها: create_production ثمّ
--     الكميات الفعلية والمواد الإضافية (add_production_input، ومنها مادّة «قرّب إلى طنّ») والوزن والانتهاء والسبب والملاحظة، ثمّ
--     preview_production، ثمّ post_production ببصمة المعاينة نفسها. أيّ مشكلة تمنع الترحيل ترفض النداء كلّه (production_blocked بتلميح
--     يسمّيها، ولا مسوّدة تبقى)، إلّا مشغّل المعمل وكلف الدفعة لم تُختم (القاعدة القائمة: يرحّل بعد ختمها): تُحفظ مسوّدة تنتظر الختم.
--   • public.mill_report (read): لعليقة (أو للمعمل كلّه) في مدّة حتى 366 يوماً: الأيام بإنتاجها، والدفعات المرحَّلة، والمواد المسحوبة
--     بكمياتها وقيمها، والمجاميع. والمال فيه لكلّ قارئ (كلمة المالك «كلشي مفتوح»، للتقرير وحده)؛ والدفعات بنطاق القارئ كما في recipes_overview.
-- تراجع: rollback_0023.sql — يُسقط الدوالّ الجديدة وعمود الترتيب ويرجّع recipes_overview وrecipe_lines_guard كما في 0016 حرفاً بحرف.
-- تنعاد بأمان: add column if not exists، وقيد بفحص الكتالوج، وcreate or replace.

set lock_timeout = '5s';

-- ─── أ. ترتيب العلائق ─────────────────────────────────────────────────────────────────────────────────────────────
alter table public.recipes add column if not exists position int;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recipes_position_check' and conrelid = 'public.recipes'::regclass) then
    alter table public.recipes add constraint recipes_position_check check (position is null or position >= 1);
  end if;
end
$$;

-- العلائق الفعّالة بترتيب المالك (position) ثمّ بالاسم، والمؤرشفة بعدها؛ وغير ذلك كما في 0016.
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

-- ترتيب العلائق الفعّالة كلّها: p_ids بالترتيب الجديد، وp_expected الترتيب الذي عرضته الشاشة. إن كان الحال الآن هو المطلوب فبلا رفض
-- (إعادة بعد جواب ضاع)؛ وإلّا إن تغيّر عمّا رآه (عليقة أُضيفت أو حُذفت أو رُتّبت من جهاز آخر) فـrecipes_changed. الأقفال: كلّ علائق المنشأة
-- بترتيب المعرّف (ترتيبان معاً يتتابعان، for no key update لأنّ النسخ تشير إليها بمفتاح أجنبيّ)، ثمّ القراءة والفحص.
create or replace function public.set_recipe_order(p_ids uuid[], p_expected uuid[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_now uuid[];
begin
  set local lock_timeout = '5s';
  perform private.require('recipe.activate');
  if p_ids is null or p_expected is null then
    raise exception 'items_required' using hint = 'تعذّر الحفظ دون ترتيب العلائق وما رأيته منه. حدّث الشاشة وأعد المحاولة.';
  end if;
  if array_position(p_ids, null) is not null then
    raise exception 'recipe_not_found' using hint = 'في الترتيب عليقة بلا معرّف. حدّث الشاشة وأعد المحاولة.';
  end if;
  if (select count(distinct x.id) from unnest(p_ids) as x(id)) <> cardinality(p_ids) then
    raise exception 'duplicate_item' using hint = 'عليقة مكرّرة في الترتيب. حدّث الشاشة وأعد المحاولة.';
  end if;
  perform 1 from public.recipes r where r.org_id = v_org order by r.id for no key update;
  select coalesce(array_agg(r.id order by r.position nulls last, r.name_norm collate "C", r.id), '{}') into v_now
  from public.recipes r where r.org_id = v_org and r.archived_at is null;
  if exists (select 1 from unnest(p_ids) as x(id) where not (x.id = any (v_now))) then
    raise exception 'recipe_not_found' using hint = 'عليقة في الترتيب غير موجودة في المعمل أو محذوفة منه. حدّث الشاشة وأعد المحاولة.';
  end if;
  if v_now <> p_ids and v_now <> p_expected then
    raise exception 'recipes_changed' using hint = 'تغيّرت العلائق أو ترتيبها من نافذة أو جهاز آخر بعد أن فتحت الشاشة. حدّث الشاشة لترى ما صار، ثمّ رتّب من جديد.';
  end if;
  if cardinality(p_ids) <> cardinality(v_now) then
    raise exception 'items_required' using hint = 'الترتيب لا يشمل كلّ العلائق. حدّث الشاشة وأعد المحاولة.';
  end if;
  update public.recipes r set position = x.n
  from unnest(p_ids) with ordinality as x(id, n)
  where r.org_id = v_org and r.id = x.id and r.position is distinct from x.n::int;
  return jsonb_build_object('count', cardinality(p_ids));
end
$$;

-- ─── ب. ترتيب موادّ العليقة (في المسوّدة) ───────────────────────────────────────────────────────────────────────────
-- كما في 0016، ويقبل تغيير line_no من set_recipe_line_order وحدها (علامة المعاملة؛ والعمود غير ممنوح لأحد).
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

-- ترتيب سطور نسخة مسوّدة: p_lines كلّ سطورها بالترتيب الجديد، وp_expected ما عرضته الشاشة؛ والشرط كترتيب العلائق (lines_changed).
-- الترقيم 1..n بخطوتين (إزاحة ثمّ الأرقام الجديدة) لأنّ (النسخة، الرقم) فريد، وكلّ سطر يمرّ بحارسه (مسوّدة، ومادّة صالحة).
create or replace function public.set_recipe_line_order(p_version uuid, p_lines uuid[], p_expected uuid[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v public.recipe_versions;
  v_now uuid[];
begin
  set local lock_timeout = '5s';
  perform private.require('recipe.activate');
  if p_lines is null or p_expected is null then
    raise exception 'items_required' using hint = 'تعذّر الحفظ دون ترتيب الموادّ وما رأيته منه. حدّث الشاشة وأعد المحاولة.';
  end if;
  if array_position(p_lines, null) is not null then
    raise exception 'line_not_found' using hint = 'في الترتيب مادّة بلا معرّف. حدّث الشاشة وأعد المحاولة.';
  end if;
  if (select count(distinct x.id) from unnest(p_lines) as x(id)) <> cardinality(p_lines) then
    raise exception 'duplicate_item' using hint = 'مادّة مكرّرة في الترتيب. حدّث الشاشة وأعد المحاولة.';
  end if;
  select * into v from public.recipe_versions where org_id = v_org and id = p_version for update;
  if v.id is null then
    raise exception 'doc_not_found' using hint = 'هذه النسخة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if v.status <> 'draft' then
    raise exception 'not_draft' using hint = 'هذه النسخة مفعَّلة أو مقاعدة، فلا يتغيّر ترتيب موادّها. اضغط «عدّل الخلطة» ورتّبها في المسوّدة.';
  end if;
  select coalesce(array_agg(l.id order by l.line_no), '{}') into v_now from public.recipe_lines l where l.org_id = v_org and l.version_id = v.id;
  if exists (select 1 from unnest(p_lines) as x(id) where not (x.id = any (v_now))) then
    raise exception 'line_not_found' using hint = 'مادّة في الترتيب ليست في هذه المسوّدة. حدّث الشاشة وأعد المحاولة.';
  end if;
  if v_now <> p_lines and v_now <> p_expected then
    raise exception 'lines_changed' using hint = 'تغيّرت موادّ المسوّدة أو ترتيبها من نافذة أو جهاز آخر بعد أن فتحتها. حدّث الشاشة لترى ما صار، ثمّ رتّب من جديد.';
  end if;
  if cardinality(p_lines) <> cardinality(v_now) then
    raise exception 'items_required' using hint = 'الترتيب لا يشمل كلّ موادّ المسوّدة. حدّث الشاشة وأعد المحاولة.';
  end if;
  if v_now <> p_lines then
    perform set_config('app.recipe_line_order', 'on', true);
    update public.recipe_lines set line_no = line_no + 100000 where org_id = v_org and version_id = v.id;
    update public.recipe_lines l set line_no = x.n::int
    from unnest(p_lines) with ordinality as x(id, n)
    where l.org_id = v_org and l.version_id = v.id and l.id = x.id;
    perform set_config('app.recipe_line_order', '', true);
  end if;
  return jsonb_build_object('version_id', v.id, 'count', cardinality(p_lines),
    'version', (select x.version from public.recipe_versions x where x.org_id = v_org and x.id = v.id));
end
$$;

-- ─── ج. الإنتاج بنداء واحد ────────────────────────────────────────────────────────────────────────────────────────
-- جملة المشكلة الأولى التي تمنع الترحيل، بأرقامها (المال لا يظهر في مشكلة: المتاح من المصاريف لأدوار الكلفة وحدها في صفحة الدفعة).
create or replace function private.production_problem_hint(p jsonb, p_store text) returns text
language plpgsql stable set search_path = pg_catalog, pg_temp as $$
begin
  return case p ->> 'code'
    when 'insufficient_stock' then format('لا يكفي رصيد «%s» في «%s»: المطلوب %s، والموجود %s. اشترِ الناقص أو قلّل الكمية.',
      p ->> 'item_name', p_store, private.qty_text((p ->> 'need')::numeric, p ->> 'unit'), private.qty_text((p ->> 'have')::numeric, p ->> 'unit'))
    when 'item_archived' then format('«%s» محذوفة من القوائم، فلا تُسحب في الإنتاج. أظهِرها من ملفّها أو احذفها من موادّ الدفعة.', p ->> 'item_name')
    when 'no_mass_inputs' then 'الدفعة بلا مادّة داخل الكتلة: أضف مادّة أوّلية؛ الوقود والتعبئة وحدهما لا يصنعان علفاً.'
    when 'shrink_out_of_range' then format('الهدر %s (%s٪) خارج المدى المقبول (صفر إلى ٣٪): اكتب سبب الفرق أو راجع وزن الناتج.',
      private.qty_text((p ->> 'shrink_kg')::numeric, 'kg'), coalesce(p ->> 'shrink_pct', '—'))
    when 'expiry_required' then 'الناتج يُتابَع انتهاؤه: اكتب تاريخ انتهاء الناتج.'
    when 'output_expired' then 'تاريخ انتهاء الناتج قبل يوم الإنتاج: صحّح التاريخ.'
    when 'costs_unfunded' then 'تكاليف الدفعة أكبر من المتاح في المصاريف المسجّلة: يسجّل المحاسب أو المدير المصروف أوّلاً، أو تُعدَّل تكاليف الخلطة لكلّ طنّ.'
    when 'costs_unsealed_scope' then format('تكاليف هذه الدفعة تُحمَّل من مصاريف وحدة «%s» خارج نطاقك: يختمها محاسب أو مدير يرى تلك الوحدة.', p ->> 'division_name')
    when 'costs_pending' then 'الكلف لم تُختم بعد: يختمها المحاسب أو المدير من صفحة الدفعة.'
    else coalesce(p ->> 'hint', format('في الدفعة ما يمنع الإنتاج (%s). افتحها من المعمل لتراه.', p ->> 'code'))
  end;
end
$$;

-- الإنتاج كما تفعله صفحة الدفعة بخطواتها، في معاملة واحدة: إنشاء الدفعة من النسخة المفعَّلة بالكمية (التخطيط بنسبة الخلطة، create_production)،
-- ثمّ الكميات الفعلية لسطور الخلطة التي غيّرها (p_actuals: [{line_no, qty}] بوحدة أساس المادّة)، ثمّ المواد الإضافية (p_extra: [{id, item_id,
-- qty}]، ومنها مادّة «قرّب إلى طنّ» حين لا تكون من موادّ الخلطة)، ثمّ وزن الناتج (فارغ = كتلة المواد بلا هدر) والانتهاء وسبب الهدر
-- والملاحظة، ثمّ المعاينة، ثمّ الترحيل ببصمتها. المرجع أوّل شيء: الإعادة بالقيم نفسها ترجّع النتيجة نفسها ولا تنتج مرّتين.
create or replace function public.record_production(p_id uuid, p_recipe_version uuid, p_planned_kg numeric, p_wh_in uuid, p_wh_out uuid,
  p_produced_on date, p_actuals jsonb, p_extra jsonb, p_output_kg numeric, p_expiry date, p_shrink_reason text, p_note text, p_client_ref uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'record_production';
  v_cached jsonb;
  v_org uuid := public.auth_org();
  v_on date := coalesce(p_produced_on, public.app_today());
  v_actuals jsonb := coalesce(p_actuals, '[]'::jsonb);
  v_extra jsonb := coalesce(p_extra, '[]'::jsonb);
  v_reason text := nullif(btrim(coalesce(p_shrink_reason, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  d public.production_batches;
  a jsonb;
  v_line int;
  v_qty numeric;
  v_prev jsonb;
  v_post jsonb;
  v_result jsonb;
  v_store text;
begin
  set local lock_timeout = '5s';
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'version', p_recipe_version, 'kg', p_planned_kg::text,
    'in', p_wh_in, 'out', p_wh_out, 'on', v_on, 'actuals', v_actuals, 'extra', v_extra, 'output', p_output_kg::text, 'expiry', p_expiry,
    'reason', v_reason, 'note', v_note));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.require('production.draft');
  if jsonb_typeof(v_actuals) <> 'array' or jsonb_typeof(v_extra) <> 'array' then
    raise exception 'bad_line' using hint = 'موادّ الإنتاج بشكل غير صالح. حدّث الشاشة وأعد المحاولة.';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'bad_note' using hint = format('الملاحظة %s حرفاً، والحدّ 500 حرف. اختصرها.', length(v_note));
  end if;
  -- معرّف دفعة سُجّلت بنداء آخر (ضغطتان بمرجعين، أو معرّف مكرَّر): يُسمّى بدل خطأ المفتاح الخام.
  if exists (select 1 from public.production_batches x where x.id = p_id) then
    raise exception 'id_conflict' using hint = 'هذه الدفعة سُجّلت من قبل. افتحها من المعمل لترى ما حُفظ.';
  end if;
  perform public.create_production(p_id, p_recipe_version, p_planned_kg, p_wh_in, p_wh_out, v_on);
  for a in select x from jsonb_array_elements(v_actuals) as e(x) loop
    if jsonb_typeof(a) <> 'object' or coalesce(a ->> 'line_no', '') !~ '^[0-9]{1,6}$' or coalesce(a ->> 'qty', '') !~ '^[0-9]{1,15}([.][0-9]{1,3})?$' then
      raise exception 'bad_line' using hint = 'كمية مادّة بشكل غير صالح. حدّث الشاشة وأعد المحاولة.';
    end if;
    v_line := (a ->> 'line_no')::int;
    v_qty := (a ->> 'qty')::numeric;
    if v_qty <= 0 then
      raise exception 'qty_not_positive' using hint = 'كمية كلّ مادّة أكبر من صفر؛ لإخراج مادّة من الدفعة افتح صفحتها من المعمل.';
    end if;
    if (select count(*) from jsonb_array_elements(v_actuals) as e2(y) where e2.y ->> 'line_no' = a ->> 'line_no') > 1 then
      raise exception 'bad_line' using hint = 'مادّة مكرّرة في كميات الإنتاج. حدّث الشاشة وأعد المحاولة.';
    end if;
    update public.production_inputs set actual_qty_base = v_qty where org_id = v_org and batch_id = p_id and line_no = v_line;
    if not found then
      raise exception 'bad_line' using hint = 'مادّة في كميات الإنتاج ليست من موادّ الخلطة. حدّث الشاشة وأعد المحاولة.';
    end if;
  end loop;
  for a in select x from jsonb_array_elements(v_extra) as e(x) loop
    if jsonb_typeof(a) <> 'object' or coalesce(a ->> 'qty', '') !~ '^[0-9]{1,15}([.][0-9]{1,3})?$'
      or coalesce(a ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(a ->> 'item_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'bad_line' using hint = 'مادّة إضافية بشكل غير صالح. حدّث الشاشة وأعد المحاولة.';
    end if;
    perform public.add_production_input(p_id, (a ->> 'id')::uuid, (a ->> 'item_id')::uuid, (a ->> 'qty')::numeric, null, null);
  end loop;
  update public.production_batches set output_qty_kg = p_output_kg, output_expiry_on = p_expiry, shrink_reason = v_reason, note = v_note
  where org_id = v_org and id = p_id;
  v_prev := public.preview_production(p_id);
  -- مشغّل المعمل والكلف لم تُختم وحدها: الدفعة تُحفظ مسوّدة تنتظر الختم (القاعدة القائمة)، وصفحتها تُكمل بعده.
  if v_prev -> 'problems' = jsonb_build_array(jsonb_build_object('code', 'costs_pending')) then
    select * into d from public.production_batches where org_id = v_org and id = p_id;
    v_result := jsonb_build_object('id', d.id, 'status', 'draft', 'awaiting', 'costs', 'version', d.version, 'planned_kg', d.planned_kg::text,
      'recipe_name', (select r.name from public.recipe_versions x join public.recipes r on r.org_id = x.org_id and r.id = x.recipe_id
        where x.org_id = v_org and x.id = d.recipe_version_id));
    return private.ref_store(v_fn, p_client_ref, v_result);
  end if;
  if not coalesce((v_prev ->> 'can_post')::boolean, false) then
    select w.name into v_store from public.warehouses w where w.org_id = v_org and w.id = p_wh_in;
    raise exception 'production_blocked' using hint = coalesce(private.production_problem_hint(v_prev -> 'problems' -> 0, v_store),
      'في الدفعة ما يمنع الإنتاج. حدّث الشاشة وأعد المحاولة.');
  end if;
  select * into d from public.production_batches where org_id = v_org and id = p_id;
  v_post := public.post_production(p_id, d.version, v_prev ->> 'plan_token', p_client_ref);
  select * into d from public.production_batches where org_id = v_org and id = p_id;
  v_result := jsonb_build_object('id', d.id, 'status', d.status, 'doc_no', d.doc_no, 'produced_on', d.produced_on,
    'recipe_name', (select r.name from public.recipe_versions x join public.recipes r on r.org_id = x.org_id and r.id = x.recipe_id
      where x.org_id = v_org and x.id = d.recipe_version_id),
    'output_item_name', (select i.name from public.items i where i.org_id = v_org and i.id = d.output_item_id),
    'input_warehouse_name', (select w.name from public.warehouses w where w.org_id = v_org and w.id = d.input_warehouse_id),
    'output_warehouse_name', (select w.name from public.warehouses w where w.org_id = v_org and w.id = d.output_warehouse_id),
    'output_qty_kg', d.output_qty_kg::text, 'input_mass_kg', d.input_mass_kg::text, 'shrink_kg', d.shrink_kg::text, 'note', d.note,
    'money', (select jsonb_build_object('input_value', pv.input_value::text, 'extra_value', pv.extra_value::text, 'total_value', pv.total_value::text,
        'cost_per_kg', private.per_unit(pv.total_value, d.output_qty_kg)::text)
      from public.production_values pv where pv.org_id = v_org and pv.batch_id = d.id));
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;

-- ─── د. تقرير العليقة بالأيام ─────────────────────────────────────────────────────────────────────────────────────
-- الدفعات المرحَّلة لعليقة (أو لكلّ العلائق) بيوم إنتاجها في المدّة، بنطاق القارئ (أحد طرفي الدفعة بنطاقه، كما في recipes_overview):
-- الأيام بعدد دفعاتها وناتجها، والدفعات، والمواد المسحوبة (الكمية الفعلية وإلّا المخطّطة، كما يسحبها الترحيل) بكتلتها وقيمتها، والمجاميع.
-- المال لكلّ قارئ (كلمة المالك «كلشي مفتوح»، 2026-11-10، للتقرير وحده): بلا private.mask.
create or replace function public.mill_report(p_recipe uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  r public.recipes;
  v_result jsonb;
begin
  perform private.require('read');
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) then
    raise exception 'date_required' using hint = 'اختر أوّل المدّة وآخرها من التقويم.';
  end if;
  if p_from > p_to then
    raise exception 'bad_range' using hint = 'أوّل المدّة بعد آخرها. اختر المدّة من جديد.';
  end if;
  if p_to - p_from > 365 then
    raise exception 'range_too_long' using hint = 'المدّة أطول من سنة. اختر سنة أو شهراً أو يوماً.';
  end if;
  if p_recipe is not null then
    select * into r from public.recipes x where x.org_id = v_org and x.id = p_recipe;
    if r.id is null then
      raise exception 'recipe_not_found' using hint = 'هذه العليقة غير موجودة في منشأتك. حدّث الشاشة.';
    end if;
  end if;
  with b as (
    select d.id, d.doc_no, d.produced_on, d.output_qty_kg, d.input_mass_kg, d.shrink_kg, d.note, rc.name as recipe_name, oi.name as output_item_name,
      wi.name as input_warehouse_name, wo.name as output_warehouse_name,
      coalesce(pv.input_value, 0) as input_value, coalesce(pv.extra_value, 0) as extra_value, coalesce(pv.total_value, 0) as total_value
    from public.production_batches d
    join public.recipe_versions v on v.org_id = d.org_id and v.id = d.recipe_version_id
    join public.recipes rc on rc.org_id = v.org_id and rc.id = v.recipe_id
    join public.items oi on oi.org_id = d.org_id and oi.id = d.output_item_id
    join public.warehouses wi on wi.org_id = d.org_id and wi.id = d.input_warehouse_id
    join public.warehouses wo on wo.org_id = d.org_id and wo.id = d.output_warehouse_id
    left join public.production_values pv on pv.org_id = d.org_id and pv.batch_id = d.id
    where d.org_id = v_org and d.status = 'posted' and d.produced_on between p_from and p_to
      and (p_recipe is null or v.recipe_id = p_recipe)
      and (public.in_scope_wh(d.input_warehouse_id) or public.in_scope_wh(d.output_warehouse_id))
  ), m as (
    select p.item_id, i.name, p.base_unit,
      sum(coalesce(p.actual_qty_base, p.planned_qty_base)) as qty,
      sum(coalesce(private.input_mass_kg(coalesce(p.actual_qty_base, p.planned_qty_base), p.base_unit, p.density_kg_per_l), 0)) as mass_kg,
      sum(coalesce(iv.value, 0)) as value
    from public.production_inputs p
    join b on b.id = p.batch_id
    join public.items i on i.org_id = p.org_id and i.id = p.item_id
    left join public.production_input_values iv on iv.org_id = p.org_id and iv.input_id = p.id
    where p.org_id = v_org
    group by p.item_id, i.name, i.name_norm, p.base_unit
  )
  select jsonb_build_object(
    'today', public.app_today(), 'from', p_from, 'to', p_to,
    'recipe', case when r.id is null then null else jsonb_build_object('id', r.id, 'name', r.name,
      'output_item_name', (select i.name from public.items i where i.org_id = v_org and i.id = r.output_item_id)) end,
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', x.day, 'batches', x.n, 'output_kg', x.kg::text) order by x.day)
      from (select b.produced_on as day, count(*)::int as n, sum(b.output_qty_kg) as kg from b group by b.produced_on) as x), '[]'::jsonb),
    'batches', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'doc_no', b.doc_no, 'produced_on', b.produced_on,
        'recipe_name', b.recipe_name, 'output_item_name', b.output_item_name, 'output_kg', b.output_qty_kg::text, 'mass_kg', b.input_mass_kg::text,
        'shrink_kg', b.shrink_kg::text, 'note', b.note, 'input_warehouse_name', b.input_warehouse_name, 'output_warehouse_name', b.output_warehouse_name,
        'money', jsonb_build_object('materials_value', b.input_value::text, 'extra_value', b.extra_value::text, 'total_value', b.total_value::text,
          'cost_per_kg', private.per_unit(b.total_value, b.output_qty_kg)::text))
      order by b.produced_on, b.doc_no) from b), '[]'::jsonb),
    'materials', coalesce((select jsonb_agg(jsonb_build_object('item_id', m.item_id, 'name', m.name, 'base_unit', m.base_unit,
        'qty', m.qty::text, 'mass_kg', round(m.mass_kg, 3)::text, 'value', m.value::text)
      order by m.mass_kg desc, m.name collate "C", m.item_id) from m), '[]'::jsonb),
    'totals', (select jsonb_build_object('batches', count(*)::int, 'output_kg', coalesce(sum(b.output_qty_kg), 0)::text,
        'mass_kg', coalesce(sum(b.input_mass_kg), 0)::text, 'materials_value', coalesce(sum(b.input_value), 0)::text,
        'extra_value', coalesce(sum(b.extra_value), 0)::text, 'total_value', coalesce(sum(b.total_value), 0)::text,
        'cost_per_kg', private.per_unit(coalesce(sum(b.total_value), 0), coalesce(sum(b.output_qty_kg), 0))::text) from b))
  into v_result;
  return v_result;
end
$$;

-- ─── هـ. الصلاحيات ──────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.set_recipe_order(uuid[], uuid[]), public.set_recipe_line_order(uuid, uuid[], uuid[]),
  public.record_production(uuid, uuid, numeric, uuid, uuid, date, jsonb, jsonb, numeric, date, text, text, uuid),
  public.mill_report(uuid, date, date) from public, anon;
grant execute on function public.set_recipe_order(uuid[], uuid[]), public.set_recipe_line_order(uuid, uuid[], uuid[]),
  public.record_production(uuid, uuid, numeric, uuid, uuid, date, jsonb, jsonb, numeric, date, text, text, uuid),
  public.mill_report(uuid, date, date) to authenticated;
