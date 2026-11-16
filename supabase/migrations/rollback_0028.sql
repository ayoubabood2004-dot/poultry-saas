-- rollback_0028 — تراجع «كلّ خطوة فيها تعديل» (0028_customer_edits): يُسقط الدوالّ الخمس الجديدة (edit_flock وdelete_flock وsave_hall_vaccine_program
--   وdrop_hall_vaccine_program وedit_recipe)، ويرجّع أجسام private.flock_slots وprivate.hall_flock_json وvaccine_board وdelete_vaccine وgive_to_flocks
--   وverify_halls كما في 0026 حرفاً بحرف (المنح باقٍ: create or replace لا يغيّره)، ثمّ يُسقط جدولي لقاحات القاعات.
-- **طريق رفض**: صفّ جدول لقاحات خاصّ لقاعة، ولو حُذف جدوله (بيانات المالك ونسخته، والتراجع يمسحها؛ والدوالّ لا تمحو الصفّ أبداً)، يوقف التراجع
--   بصوت بلا أن يغيّر شيئاً. والأفواج المعدَّلة أو المحذوفة والخلطات المعدَّلة تبقى كما هي: صالحة بقواعد 0027.
-- تنعاد بأمان: drop if exists، وcreate or replace.

set lock_timeout = '5s';

lock table public.hall_vaccine_program_days, public.hall_vaccine_programs in access exclusive mode;

-- ٠) طريق الرفض: صفّ جدول قاعة (بأيّامه أو بلاها، أو حُذف جدوله فبقي صفّه بنسخته).
do $$
declare
  v_programs bigint;
  v_days bigint;
begin
  select count(*) into v_programs from public.hall_vaccine_programs;
  select count(*) into v_days from public.hall_vaccine_program_days;
  if v_programs > 0 then
    raise exception 'rollback_blocked' using hint = format('يوجد %s جدول لقاحات خاصّ لقاعة (ولو حُذف) و%s يوماً فيها، والتراجع يمسحها. لا تراجع لـ0028 بعد استعمالها.', v_programs, v_days);
  end if;
end
$$;

-- ١) الدوالّ الجديدة.
drop function if exists public.edit_flock(uuid, int, date, integer, integer, text, uuid);
drop function if exists public.delete_flock(uuid, int, uuid);
drop function if exists public.save_hall_vaccine_program(uuid, int, jsonb, int);
drop function if exists public.drop_hall_vaccine_program(uuid, int);
drop function if exists public.edit_recipe(uuid, uuid, text, jsonb, uuid);

-- ٢) الأجسام الستّ كما في 0026.
create or replace function private.flock_slots(p_flock uuid) returns table (vaccine_id uuid, age_day int, due_on date)
language sql stable security definer set search_path = public, pg_temp as $$
  select d.vaccine_id, d.age_day, f.placed_on + (d.age_day - f.age_days_at_placement)
  from public.flocks f
  join public.vaccine_program_days d on d.org_id = f.org_id and d.kind = f.kind
  where f.org_id = public.auth_org() and f.id = p_flock and f.placed_on is not null
    and d.age_day >= f.age_days_at_placement
    and (f.closed_on is null or f.placed_on + (d.age_day - f.age_days_at_placement) <= f.closed_on)
$$;

create or replace function private.hall_flock_json(f public.flocks) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', f.id, 'hall_id', f.hall_id, 'hall_name', h.name, 'site_name', s.name, 'kind', f.kind, 'status', f.status,
    'placed_on', f.placed_on, 'age0', f.age_days_at_placement, 'placed_count', f.placed_count, 'closed_on', f.closed_on,
    'end_age', p.end_age,
    'end_on', case when p.end_age is not null then f.placed_on + (p.end_age - f.age_days_at_placement) end)
  from public.halls h
  join public.sites s on s.org_id = h.org_id and s.id = h.site_id
  left join public.vaccine_programs p on p.org_id = f.org_id and p.kind = f.kind
  where h.org_id = f.org_id and h.id = f.hall_id
$$;

create or replace function public.vaccine_board() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
begin
  perform private.require('read');
  return jsonb_build_object(
    'today', public.app_today(),
    'can_edit', public.can('flock.manage'),
    'has_halls', jsonb_build_object(
      'broiler', exists (select 1 from public.halls h join public.divisions d on d.org_id = h.org_id and d.id = h.division_id
        where h.org_id = v_org and h.archived_at is null and d.kind = 'broiler'),
      'layer', exists (select 1 from public.halls h join public.divisions d on d.org_id = h.org_id and d.id = h.division_id
        where h.org_id = v_org and h.archived_at is null and d.kind = 'layer')),
    'vaccines', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'color', x.color, 'version', x.version,
        'in_use', exists (select 1 from public.flock_vaccinations m where m.org_id = x.org_id and m.vaccine_id = x.id),
        'item', (select jsonb_build_object('id', i.id, 'name', i.name, 'base_unit', i.base_unit) from public.items i where i.org_id = x.org_id and i.id = x.item_id))
        order by x.name_key collate "C", x.id)
      from public.vaccines x where x.org_id = v_org and x.archived_at is null), '[]'::jsonb),
    'programs', (select jsonb_object_agg(k.kind, jsonb_build_object('version', coalesce(p.version, 0), 'end_age', p.end_age,
        'days', coalesce((select jsonb_agg(jsonb_build_object('vaccine_id', d.vaccine_id, 'age_day', d.age_day) order by d.age_day, x.name_key collate "C", x.id)
          from public.vaccine_program_days d join public.vaccines x on x.org_id = d.org_id and x.id = d.vaccine_id
          where d.org_id = v_org and d.kind = k.kind), '[]'::jsonb)))
      from (values ('broiler'), ('layer')) as k(kind)
      left join public.vaccine_programs p on p.org_id = v_org and p.kind = k.kind),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'kind', i.kind, 'base_unit', i.base_unit) order by i.name_norm collate "C", i.id)
      from public.items i where i.org_id = v_org and i.archived_at is null and i.kind in ('vaccine', 'medicine')), '[]'::jsonb));
end
$$;

create or replace function public.delete_vaccine(p_id uuid, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  vc public.vaccines;
  v_kind text;
begin
  set local lock_timeout = '5s';
  perform private.require('flock.manage');
  select * into vc from public.vaccines x where x.org_id = v_org and x.id = p_id for update;
  if vc.id is null or vc.archived_at is not null then
    raise exception 'vaccine_not_found' using hint = 'هذا اللقاح غير موجود في القائمة (ربّما حُذف من جهاز آخر). حدّث الشاشة.';
  end if;
  if vc.version is distinct from p_expected_version then
    raise exception 'stale_vaccine' using hint = format('تغيّر اللقاح «%s» من جهاز آخر. حدّث الشاشة ثمّ احذفه.', vc.name);
  end if;
  for v_kind in select distinct d.kind from public.vaccine_program_days d where d.org_id = v_org and d.vaccine_id = vc.id order by 1 loop
    update public.vaccine_programs p set version = p.version + 1, updated_at = now(), updated_by = auth.uid() where p.org_id = v_org and p.kind = v_kind;
  end loop;
  delete from public.vaccine_program_days d where d.org_id = v_org and d.vaccine_id = vc.id;
  if exists (select 1 from public.flock_vaccinations m where m.org_id = v_org and m.vaccine_id = vc.id) then
    update public.vaccines x set archived_at = now(), version = x.version + 1, updated_at = now() where x.org_id = v_org and x.id = vc.id;
    return jsonb_build_object('id', vc.id, 'result', 'archived');
  end if;
  delete from public.vaccines x where x.org_id = v_org and x.id = vc.id;
  return jsonb_build_object('id', vc.id, 'result', 'deleted');
end
$$;

create or replace function public.give_to_flocks(p_client_ref uuid, p_on date, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'give_to_flocks';
  v_org uuid := public.auth_org();
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_qty constant text := '^[0-9]{1,12}([.][0-9]{1,3})?$';
  v_cached jsonb;
  a jsonb;
  v_n int;
  v_kind text;
  v_part int;
  v_keys text[] := '{}';
  v_ids text[] := '{}';
  v_key text;
  v_issue_any boolean := false;
  v_record_any boolean := false;
  v_flocks uuid[];
  v_vaccines uuid[];
  v_kinds text[];
  v_fid uuid;
  f public.flocks;
  h public.halls;
  vc public.vaccines;
  v_jobs jsonb := '[]';
  v_items uuid[];
  v_whs uuid[];
  v_need record;
  s record;
  v_res jsonb;
  v_name text;
  v_dose text;
  v_issue uuid;
  v_constraint text;
  v_out_issues jsonb := '[]';
  v_out_logs jsonb := '[]';
  v_out_vaccinations jsonb := '[]';
  v_result jsonb;
begin
  set local lock_timeout = '5s';
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('on', p_on, 'lines', p_lines));
  if v_cached is not null then
    -- إضافة حُفظت ثمّ أُلغي منها صرف أو تأشير أو حُذف تسجيل: الإعادة لا تقول «حُفظ» بنتيجتها القديمة (مراجعة 0026 DB-2).
    if exists (select 1 from jsonb_array_elements(coalesce(v_cached -> 'issues', '[]'::jsonb)) as e(x)
          join public.flock_issues y on y.org_id = v_org and y.id = (e.x ->> 'issue_id')::uuid where y.status = 'void')
        or exists (select 1 from jsonb_array_elements(coalesce(v_cached -> 'vaccinations', '[]'::jsonb)) as e(x)
          join public.flock_vaccinations m on m.org_id = v_org and m.id = (e.x ->> 'id')::uuid where m.status = 'void')
        or exists (select 1 from jsonb_array_elements(coalesce(v_cached -> 'logs', '[]'::jsonb)) as e(x)
          where not exists (select 1 from public.flock_logs o where o.org_id = v_org and o.id = (e.x ->> 'id')::uuid)) then
      raise exception 'id_conflict' using hint = 'سُجّلت هذه الإضافة من قبل ثمّ أُلغي منها شيء أو حُذف. افتح تقويم القاعة لترى ما بقي، ثمّ أضف من جديد.';
    end if;
    return v_cached;
  end if;

  -- ١) شكل السطور كلّها قبل أيّ قراءة: النوع والمعرّفات والكمية نصّاً بثلاث مراتب، والمكرَّر في الطلب نفسه.
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'bad_line' using hint = 'سطور الإضافة بشكل غير صالح. حدّث الشاشة وأعد المحاولة.';
  end if;
  if jsonb_array_length(p_lines) = 0 then
    raise exception 'lines_required' using hint = 'اختر مادّة أو دواءً أو لقاحاً واحداً على الأقلّ.';
  end if;
  if jsonb_array_length(p_lines) > 100 then
    raise exception 'too_many_lines' using hint = format('الطلب %s سطراً، والحدّ 100 سطر في المرّة. قسّمه على مرّتين.', jsonb_array_length(p_lines));
  end if;
  for a, v_n in select e.x, e.n from jsonb_array_elements(p_lines) with ordinality as e(x, n) loop
    if jsonb_typeof(a) <> 'object' or coalesce(a ->> 'kind', '') not in ('issue', 'log', 'vaccination') or coalesce(a ->> 'flock_id', '') !~ v_uuid then
      raise exception 'bad_line' using hint = 'سطر إضافة بشكل غير صالح. حدّث الشاشة وأعد المحاولة.';
    end if;
    v_kind := a ->> 'kind';
    if v_kind = 'issue' then
      if coalesce(a ->> 'issue_id', '') !~ v_uuid or coalesce(a ->> 'line_id', '') !~ v_uuid or coalesce(a ->> 'item_id', '') !~ v_uuid
          or coalesce(a ->> 'warehouse_id', '') !~ v_uuid or jsonb_typeof(a -> 'qty') is distinct from 'string' or (a ->> 'qty') !~ v_qty then
        raise exception 'bad_line' using hint = 'سطر صرف بشكل غير صالح (المادّة أو المخزن أو الكمية). حدّث الشاشة وأعد المحاولة.';
      end if;
      v_key := 'i:' || lower(a ->> 'flock_id') || ':' || lower(a ->> 'item_id') || ':' || lower(a ->> 'warehouse_id');
      v_ids := v_ids || lower(a ->> 'issue_id') || lower(a ->> 'line_id');
      v_issue_any := true;
    elsif v_kind = 'log' then
      if coalesce(a ->> 'id', '') !~ v_uuid or jsonb_typeof(a -> 'name') is distinct from 'string'
          or not (coalesce(jsonb_typeof(a -> 'dose'), 'null') in ('null', 'string')) then
        raise exception 'bad_line' using hint = 'سطر دواء بشكل غير صالح. حدّث الشاشة وأعد المحاولة.';
      end if;
      v_key := null;
      v_ids := v_ids || lower(a ->> 'id');
      v_record_any := true;
    else
      if coalesce(a ->> 'id', '') !~ v_uuid or coalesce(a ->> 'vaccine_id', '') !~ v_uuid
          or jsonb_typeof(a -> 'age_day') is distinct from 'number' or (a ->> 'age_day') !~ '^[0-9]{1,4}$' then
        raise exception 'bad_line' using hint = 'سطر لقاح بشكل غير صالح. حدّث الشاشة وأعد المحاولة.';
      end if;
      -- صرف التأشير المربوط خمسة مفاتيح معاً (المادّة المعروضة والمعرّفان والمخزن والكمية) أو لا شيء منها.
      v_part := (case when a ? 'item_id' and a -> 'item_id' <> 'null'::jsonb then 1 else 0 end)
        + (case when a ? 'issue_id' and a -> 'issue_id' <> 'null'::jsonb then 1 else 0 end) + (case when a ? 'line_id' and a -> 'line_id' <> 'null'::jsonb then 1 else 0 end)
        + (case when a ? 'warehouse_id' and a -> 'warehouse_id' <> 'null'::jsonb then 1 else 0 end) + (case when a ? 'qty' and a -> 'qty' <> 'null'::jsonb then 1 else 0 end);
      if v_part not in (0, 5) or (v_part = 5 and (coalesce(a ->> 'item_id', '') !~ v_uuid or coalesce(a ->> 'issue_id', '') !~ v_uuid
          or coalesce(a ->> 'line_id', '') !~ v_uuid or coalesce(a ->> 'warehouse_id', '') !~ v_uuid or jsonb_typeof(a -> 'qty') <> 'string' or (a ->> 'qty') !~ v_qty)) then
        raise exception 'bad_line' using hint = 'سطر لقاح بشكل غير صالح (صرفه ناقص). حدّث الشاشة وأعد المحاولة.';
      end if;
      v_key := 'v:' || lower(a ->> 'flock_id') || ':' || lower(a ->> 'vaccine_id') || ':' || (a ->> 'age_day');
      v_ids := v_ids || lower(a ->> 'id');
      if v_part = 5 then
        v_ids := v_ids || lower(a ->> 'issue_id') || lower(a ->> 'line_id');
        v_issue_any := true;
      end if;
      v_record_any := true;
    end if;
    if v_key is not null then
      if v_key = any (v_keys) then
        raise exception 'duplicate_line' using hint = case when v_kind = 'issue'
          then 'المادّة نفسها من المخزن نفسه مكتوبة لقاعة واحدة مرّتين. اجمع كميتها في سطر واحد.'
          else 'اللقاح نفسه في الموعد نفسه مكتوب لقاعة واحدة مرّتين.' end;
      end if;
      v_keys := v_keys || v_key;
    end if;
  end loop;
  if (select count(*) from unnest(v_ids) as x) <> (select count(distinct x) from unnest(v_ids) as x) then
    raise exception 'id_conflict' using hint = 'معرّف مكرّر داخل الطلب نفسه. حدّث الشاشة وأعد المحاولة.';
  end if;

  -- ٢) الصلاحية، ثمّ قفل الفترة قبل فحص التاريخ (كلّ فحص بعد قفله، مراجعة 0026 DB-4: قفل فترة يُثبَّت أثناء النداء كان يُدخل التسجيل والتأشير
  --    غير المربوط فيها)، والتاريخ بقواعد المستند (لا مستقبل ولا أقدم من 7 أيام ولا فترة مقفولة).
  if v_record_any then
    perform private.require('flock_day.save');
  end if;
  if v_issue_any then
    perform private.require('issue.post');
  end if;
  perform private.period_guard();
  perform private.check_doc_date(p_on);

  -- ٣) الأفواج بترتيب معرّفاتها: موجودة وبنطاق الكاتب وقائمة، والتاريخ لا يسبق تسكين أيّ منها.
  select array_agg(distinct (e.x ->> 'flock_id')::uuid order by (e.x ->> 'flock_id')::uuid) into v_flocks from jsonb_array_elements(p_lines) as e(x);
  foreach v_fid in array v_flocks loop
    f := private.flock_for(v_fid, true);
    if p_on < f.placed_on then
      select * into h from public.halls x where x.org_id = v_org and x.id = f.hall_id;
      raise exception 'before_placement' using hint = format('التاريخ %s قبل تسكين «%s» في %s.', to_char(p_on, 'DD/MM/YYYY'), h.name, to_char(f.placed_on, 'DD/MM/YYYY'));
    end if;
  end loop;

  -- ٤) الأقفال أوّلاً: الأفواج، ثمّ اللقاحات المذكورة بترتيب معرّفاتها وجداول أنواع أفواجها بترتيب النوع (للمشاركة: الحذف والتعديل من جهاز آخر
  --    ينتظر أو يُرى). اللقاح المحذوف بعد قراءة الشاشة vaccine_not_found بجملته (DB-7: كان «» بلا اسم).
  perform 1 from public.flocks x where x.org_id = v_org and x.id = any (v_flocks) order by x.id for share;
  select array_agg(distinct (e.x ->> 'vaccine_id')::uuid order by (e.x ->> 'vaccine_id')::uuid) into v_vaccines
  from jsonb_array_elements(p_lines) as e(x) where e.x ->> 'kind' = 'vaccination';
  if v_vaccines is not null then
    if (select count(*) from (select 1 from public.vaccines x where x.org_id = v_org and x.id = any (v_vaccines) order by x.id for share) as l) <> cardinality(v_vaccines) then
      raise exception 'vaccine_not_found' using hint = 'لقاح في الطلب غير موجود في القائمة (ربّما حُذف الآن من جهاز آخر). حدّث الشاشة.';
    end if;
    select array_agg(distinct f2.kind order by f2.kind) into v_kinds
    from jsonb_array_elements(p_lines) as e(x) join public.flocks f2 on f2.org_id = v_org and f2.id = (e.x ->> 'flock_id')::uuid
    where e.x ->> 'kind' = 'vaccination';
    perform 1 from public.vaccine_programs p where p.org_id = v_org and p.kind = any (v_kinds) order by p.kind for share;
  end if;

  -- ٥) اللقاحات تحت أقفالها: حيّة، والمربوط يُرسل صرفه بالمادّة التي هو مربوط بها الآن وغير المربوط بلاه؛ ومنها ومن سطور الصرف قائمة السحب.
  for a, v_n in select e.x, e.n from jsonb_array_elements(p_lines) with ordinality as e(x, n) loop
    if a ->> 'kind' = 'issue' then
      v_jobs := v_jobs || jsonb_build_object('n', v_n, 'flock_id', a ->> 'flock_id', 'item_id', a ->> 'item_id', 'warehouse_id', a ->> 'warehouse_id', 'qty', a ->> 'qty');
    elsif a ->> 'kind' = 'vaccination' then
      select * into vc from public.vaccines x where x.org_id = v_org and x.id = (a ->> 'vaccine_id')::uuid;
      if vc.archived_at is not null then
        raise exception 'vaccine_archived' using hint = format('اللقاح «%s» محذوف من القائمة. حدّث الشاشة.', vc.name);
      end if;
      if vc.item_id is not null and not (a ? 'qty' and a -> 'qty' <> 'null'::jsonb) then
        raise exception 'vaccine_linked' using hint = format('اللقاح «%s» مربوط بمادّة في المخزن، فيُصرف عند التأشير: حدّث الشاشة واكتب الكمية.', vc.name);
      end if;
      if vc.item_id is null and a ? 'qty' and a -> 'qty' <> 'null'::jsonb then
        raise exception 'vaccine_not_linked' using hint = format('اللقاح «%s» غير مربوط بمادّة في المخزن، فلا يُصرف شيء عند تأشيره. حدّث الشاشة.', vc.name);
      end if;
      if vc.item_id is not null and vc.item_id <> (a ->> 'item_id')::uuid then
        raise exception 'vaccine_relinked' using hint = (select format('اللقاح «%s» صار مربوطاً بـ«%s» في المخزن بعد قراءة الشاشة، فلم يُصرف شيء. حدّث الشاشة واكتب الكمية من جديد.', vc.name, i.name)
          from public.items i where i.org_id = v_org and i.id = vc.item_id);
      end if;
      if vc.item_id is not null then
        if exists (select 1 from public.flock_issues y where y.id = (a ->> 'issue_id')::uuid) then
          raise exception 'id_conflict' using hint = 'معرّف صرف هذا التأشير مستعمل لصرف قبله. حدّث الشاشة وأعد التأشير.';
        end if;
        v_jobs := v_jobs || jsonb_build_object('n', v_n, 'flock_id', a ->> 'flock_id', 'item_id', vc.item_id, 'warehouse_id', a ->> 'warehouse_id', 'qty', a ->> 'qty');
      end if;
    end if;
  end loop;

  -- ٦) المخزن والمادّة والأرصدة بترتيب النواة، ثمّ النقص عبر القاعات: مجموع كلّ (مادّة، مخزن) في أكثر من سطر مقابل المتاح بتاريخ الإضافة.
  if jsonb_array_length(v_jobs) > 0 then
    for v_fid in select distinct (j.x ->> 'warehouse_id')::uuid from jsonb_array_elements(v_jobs) as j(x) order by 1 loop
      if not exists (select 1 from public.warehouses w where w.org_id = v_org and w.id = v_fid) then
        raise exception 'warehouse_not_found' using hint = 'هذا المخزن غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
      end if;
      if not public.in_scope_wh(v_fid) then
        raise exception 'out_of_scope' using hint = (select format('المخزن «%s» خارج نطاقك، فلا تصرف منه.', w.name) from public.warehouses w where w.org_id = v_org and w.id = v_fid);
      end if;
    end loop;
    select array_agg((j.x ->> 'item_id')::uuid order by j.n), array_agg((j.x ->> 'warehouse_id')::uuid order by j.n) into v_items, v_whs
    from jsonb_array_elements(v_jobs) with ordinality as j(x, n);
    perform private.lock_masters(v_whs, v_items, true);
    perform private.lock_balances(v_items, v_whs);
    for v_need in
      select (j.x ->> 'item_id')::uuid as item_id, (j.x ->> 'warehouse_id')::uuid as warehouse_id, sum((j.x ->> 'qty')::numeric) as qty,
        count(distinct j.x ->> 'flock_id')::int as halls
      from jsonb_array_elements(v_jobs) as j(x)
      join public.items i on i.org_id = v_org and i.id = (j.x ->> 'item_id')::uuid and i.archived_at is null and private.flock_cost_kind(i.kind) is not null
      join public.warehouses w on w.org_id = v_org and w.id = (j.x ->> 'warehouse_id')::uuid and w.archived_at is null and private.item_admissible(w.kind, i.kind)
      group by 1, 2 having count(*) > 1
      order by 1, 2
    loop
      select * into s from private.stock_at(v_need.item_id, v_need.warehouse_id, p_on);
      if s.available < v_need.qty then
        raise exception 'insufficient_stock' using hint = (select format('لا يكفي رصيد «%s» في «%s» لكلّ القاعات: مجموع ما طلبته %s %s، وعندك %s بتاريخ %s.',
            i.name, w.name, private.qty_text(v_need.qty, i.base_unit),
            case when v_need.halls = 1 then 'لقاعة واحدة' when v_need.halls = 2 then 'للقاعتين' when v_need.halls <= 10 then format('لـ%s قاعات', v_need.halls)
              else format('لـ%s قاعة', v_need.halls) end,
            private.qty_text(s.available, i.base_unit), to_char(p_on, 'DD/MM/YYYY'))
          from public.items i, public.warehouses w where i.org_id = v_org and i.id = v_need.item_id and w.org_id = v_org and w.id = v_need.warehouse_id);
      end if;
    end loop;
  end if;

  -- ٧) السطور بترتيب الشاشة.
  for a, v_n in select e.x, e.n from jsonb_array_elements(p_lines) with ordinality as e(x, n) loop
    f := private.flock_for((a ->> 'flock_id')::uuid, true);
    if a ->> 'kind' = 'issue' then
      v_res := public.record_flock_issue(private.derived_ref(p_client_ref, v_n), (a ->> 'issue_id')::uuid, (a ->> 'line_id')::uuid, f.id,
        (a ->> 'item_id')::uuid, (a ->> 'qty')::numeric, p_on, (a ->> 'warehouse_id')::uuid);
      v_out_issues := v_out_issues || jsonb_build_object('issue_id', v_res ->> 'id', 'doc_no', v_res ->> 'doc_no', 'flock_id', f.id,
        'hall_name', v_res ->> 'hall_name', 'item_name', v_res ->> 'item_name', 'qty', v_res ->> 'qty', 'base_unit', v_res ->> 'base_unit');
    elsif a ->> 'kind' = 'log' then
      v_name := btrim(a ->> 'name');
      v_dose := nullif(btrim(coalesce(a ->> 'dose', '')), '');
      if v_name = '' then
        raise exception 'name_required' using hint = 'اكتب اسم الدواء.';
      end if;
      if length(v_name) > 80 then
        raise exception 'name_too_long' using hint = format('اسم الدواء %s حرفاً، والحدّ 80 حرفاً. اختصره.', length(v_name));
      end if;
      if v_dose is not null and length(v_dose) > 120 then
        raise exception 'dose_too_long' using hint = format('الجرعة %s حرفاً، والحدّ 120 حرفاً. اختصرها.', length(v_dose));
      end if;
      begin
        insert into public.flock_logs (id, org_id, flock_id, hall_id, site_id, division_id, on_date, kind, name, dose, client_ref)
        values ((a ->> 'id')::uuid, v_org, f.id, f.hall_id, f.site_id, f.division_id, p_on, 'medicine', v_name, v_dose, p_client_ref);
      exception when unique_violation then
        raise exception 'id_conflict' using hint = 'سُجّل هذا الدواء من قبل. حدّث الشاشة لترى ما حُفظ.';
      end;
      v_out_logs := v_out_logs || jsonb_build_object('id', (a ->> 'id')::uuid, 'flock_id', f.id);
    else
      -- اللقاح مقفول منذ الخطوة ٤، فهذه القراءة هي الحالية؛ والموعد في جدول نوع الفوج ولا تأشير حيّ له.
      select * into vc from public.vaccines x where x.org_id = v_org and x.id = (a ->> 'vaccine_id')::uuid;
      if not exists (select 1 from private.flock_slots(f.id) z where z.vaccine_id = vc.id and z.age_day = (a ->> 'age_day')::int) then
        select * into h from public.halls x where x.org_id = v_org and x.id = f.hall_id;
        raise exception 'not_in_program' using hint = format('«%s» في يوم العمر %s ليس في جدول لقاحات «%s» الآن. حدّث الشاشة.', vc.name, a ->> 'age_day', h.name);
      end if;
      v_issue := null;
      v_res := null;
      if vc.item_id is not null then
        v_res := public.record_flock_issue(private.derived_ref(p_client_ref, v_n), (a ->> 'issue_id')::uuid, (a ->> 'line_id')::uuid, f.id,
          vc.item_id, (a ->> 'qty')::numeric, p_on, (a ->> 'warehouse_id')::uuid);
        v_issue := (v_res ->> 'id')::uuid;
      end if;
      begin
        insert into public.flock_vaccinations (id, org_id, flock_id, hall_id, site_id, division_id, vaccine_id, age_day, done_on, issue_id, item_id, client_ref)
        values ((a ->> 'id')::uuid, v_org, f.id, f.hall_id, f.site_id, f.division_id, vc.id, (a ->> 'age_day')::int, p_on, v_issue,
          case when v_issue is not null then vc.item_id end, p_client_ref);
      exception when unique_violation then
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint = 'flock_vaccinations_live' then
          select * into h from public.halls x where x.org_id = v_org and x.id = f.hall_id;
          raise exception 'already_vaccinated' using hint = format('«%s» ليوم العمر %s مؤشَّر «تمّ» لـ«%s» من قبل.', vc.name, a ->> 'age_day', h.name);
        end if;
        raise exception 'id_conflict' using hint = 'سُجّل هذا التأشير أو صرفه من قبل. حدّث الشاشة لترى ما حُفظ.';
      end;
      v_out_vaccinations := v_out_vaccinations || jsonb_build_object('id', (a ->> 'id')::uuid, 'flock_id', f.id, 'vaccine_id', vc.id,
        'age_day', (a ->> 'age_day')::int, 'issue_id', v_issue, 'doc_no', v_res ->> 'doc_no');
    end if;
  end loop;
  v_result := jsonb_build_object('on', p_on, 'issues', v_out_issues, 'logs', v_out_logs, 'vaccinations', v_out_vaccinations);
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;

create or replace function public.verify_halls() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  -- ١) التسجيل والتأشير في مكان فوجهما (القاعة والحقل والوحدة).
  select 'record_place', count(*) from (
    select o.flock_id, o.hall_id, o.site_id, o.division_id from public.flock_logs o
    union all
    select m.flock_id, m.hall_id, m.site_id, m.division_id from public.flock_vaccinations m) as r
  join public.flocks f on f.id = r.flock_id
  where (f.hall_id, f.site_id, f.division_id) is distinct from (r.hall_id, r.site_id, r.division_id)
  -- ٢) التأشير الحيّ المصروف: صرفه مرحَّل لفوجه بمادّته؛ والملغى المصروف: صرفه ملغى.
  union all
  select 'vaccination_issue', count(*) from public.flock_vaccinations m
  left join public.flock_issues x on x.org_id = m.org_id and x.id = m.issue_id
  where m.issue_id is not null and (x.id is null or x.flock_id <> m.flock_id
    or (m.status = 'done' and x.status <> 'posted') or (m.status = 'void' and x.status <> 'void')
    or not exists (select 1 from public.flock_issue_lines l where l.org_id = x.org_id and l.issue_id = x.id and l.item_id = m.item_id))
  -- ٣) التأشير والتسجيل لا يسبقان التسكين ولا يتجاوزان الإغلاق.
  union all
  select 'record_dates', count(*) from (
    select o.flock_id, o.on_date from public.flock_logs o
    union all
    select m.flock_id, m.done_on from public.flock_vaccinations m where m.status = 'done') as r
  join public.flocks f on f.id = r.flock_id
  where f.placed_on is null or r.on_date < f.placed_on or (f.closed_on is not null and r.on_date > f.closed_on)
  -- ٤) صرف واحد لتأشير واحد (مراجعة 0026 DB-3).
  union all
  select 'issue_once', count(*) from (select m.issue_id from public.flock_vaccinations m where m.issue_id is not null group by m.org_id, m.issue_id having count(*) > 1) as d
  -- ٥) أيّام الجدول ضمن نهاية دورته، ولقاحاتها حيّة.
  union all
  select 'program_days', count(*) from public.vaccine_program_days d
  join public.vaccine_programs p on p.org_id = d.org_id and p.kind = d.kind
  join public.vaccines x on x.org_id = d.org_id and x.id = d.vaccine_id
  where d.age_day > p.end_age or x.archived_at is not null
$$;

-- ٣) الجدولان بترتيب مفاتيحهما (سياساتهما ومحفّزاتهما معهما).
drop table if exists public.hall_vaccine_program_days;
drop table if exists public.hall_vaccine_programs;
