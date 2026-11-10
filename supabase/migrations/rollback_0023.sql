-- rollback_0023 — تراجع 0023_mill_order_produce («ترتيب معمل العلف»؛ مشغّل التراجع بالحزمة FOUNDATION ٨٢٠، ٨٧٦). يُسقط record_production
-- وmill_report وset_recipe_order وset_recipe_line_order وprivate.production_problem_hint وعمود recipes.position وقيده، ويرجّع recipes_overview
-- وprivate.recipe_lines_guard كما في 0016 حرفاً بحرف (md5 نفسه بالكتالوج).
-- بلا طريق رفض: الدفعات التي سجّلتها record_production دفعات عاديّة (create_production ثمّ post_production)، فتبقى كما هي؛ وترتيب العلائق
-- ترتيب عرض يسقط مع عموده (العلائق نفسها باقية بأسمائها). وترتيب السطور أرقام line_no في النسخ نفسها، فيبقى.
-- تنعاد بأمان: drop if exists، وcreate or replace.

set lock_timeout = '5s';

drop function if exists public.mill_report(uuid, date, date);
drop function if exists public.record_production(uuid, uuid, numeric, uuid, uuid, date, jsonb, jsonb, numeric, date, text, text, uuid);
drop function if exists private.production_problem_hint(jsonb, text);
drop function if exists public.set_recipe_line_order(uuid, uuid[], uuid[]);
drop function if exists public.set_recipe_order(uuid[], uuid[]);

-- الأجسام كما في 0016 (قبل إسقاط العمود: recipes_overview في 0023 يقرؤه):
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
  else
    new.line_no := old.line_no;
  end if;
  update public.recipe_versions set version = version + 1 where org_id = v.org_id and id = v.id;
  return new;
end
$$;

alter table public.recipes drop constraint if exists recipes_position_check;
alter table public.recipes drop column if exists position;
