-- 0030_open_cycle — «خلّي نهاية الدورة اختيارية» (كلمة الزبون 2026-11-16 بعد تجربته شاشات 0028: «احنى محددين بالضبط شوكت تنتهي الدورة خلي الوقت
--   مفتوح… من يخلصون همة يكولون انتهت الدورة»، ثمّ «لا لاتشيل نهاية الدورة بس خليها اختيارية»؛ DECISIONS 2026-11-16 «الدورة المفتوحة»).
-- المشكلة: نهاية الدورة رقم إلزاميّ في جدول اللقاحات (للنوع وللقاعة)، فكلّ دورة لها نهاية مخطّطة ولو لم يعرفها المربّي؛ ولا تقويم بالأشهر الحقيقية
--   لجدول القاعة لأنّ لوحة اللقاحات لا تعرف يوم تسكين فوجها.
-- هنا:
--   • vaccine_programs.end_age وhall_vaccine_programs.end_age يقبلان null (= «مفتوحة»: تنتهي الدورة حين يُقال «انتهت الدورة»)، وقيد 1–1,000 كما هو
--     لما كُتب. وsave_vaccine_program (0026) وsave_hall_vaccine_program (0028) على جسميهما حرفاً إلّا: p_end_age null مقبول، وأيّام الجدول حينها
--     من 1 إلى 1,000، وجملتا bad_end_age وbad_day تقولان «أو اتركها مفتوحة».
--   • private.hall_flock_json (0028) على جسمه إلّا أنّ جدول القاعة الخاصّ يحكم نهاية الدورة ولو كانت مفتوحة (كان coalesce يرجع إلى نهاية جدول
--     النوع)، فـend_age وend_on null لفوج قاعته بجدول مفتوح أو جدول نوع مفتوح؛ والتقويم الشهري (flock_month) وتقرير الدورة يقرآنه كما هو
--     (greatest يتجاهل null، والشاشات تُخفي سطر «نهاية الدورة المخطّطة» بلاه).
--   • public.vaccine_board (0028) على جسمه ويزيد لكلّ قاعة flock: فوجها القائم المسكَّن (المعرّف ويوم التسكين والعمر عنده) أو null، فيُرسم جدولها
--     تقويماً بالأشهر الحقيقية من يوم التسكين وفي كلّ يوم عمر الطيور.
-- بلا دالّة جديدة ولا جدول؛ والتواقيع كما هي (المنح باقٍ). و«انتهت الدورة» (close_flock) في فرع بيع الطيور، لا هنا.
-- تراجع: rollback_0030.sql — يرجّع الأجسام الأربعة كما في 0026 و0028 حرفاً بحرف (لم تمسّها 0029_bird_sales_close) ويعيد not null. **طريق رفض**: جدول نوع أو جدول قاعة بنهاية مفتوحة
--   (null لا تقبله قاعدة 0029) يوقف التراجع بصوت بلا أن يغيّر شيئاً.
-- تنعاد بأمان: alter … drop not null، وcreate or replace.

set lock_timeout = '5s';

-- ─── أ. نهاية الدورة اختيارية ──────────────────────────────────────────────────────────────────────────────────────────
alter table public.vaccine_programs alter column end_age drop not null;
alter table public.hall_vaccine_programs alter column end_age drop not null;

-- ─── ب. حفظ الجدولين بنهاية مفتوحة ─────────────────────────────────────────────────────────────────────────────────────
create or replace function public.save_vaccine_program(p_kind text, p_end_age int, p_days jsonb, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  a jsonb;
  vc record;
  p public.vaccine_programs;
  v_bad record;
  v_count int;
begin
  set local lock_timeout = '5s';
  perform private.require('flock.manage');
  if p_kind is null or p_kind not in ('broiler', 'layer') then
    raise exception 'bad_kind' using hint = 'نوع الجدول إمّا لحم أو بيّاض.';
  end if;
  if p_end_age is not null and p_end_age not between 1 and 1000 then
    raise exception 'bad_end_age' using hint = 'نهاية الدورة عدد أيّام من 1 إلى 1,000، أو اتركها مفتوحة.';
  end if;
  if p_days is null or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) > 2000 then
    raise exception 'bad_day' using hint = 'أيّام الجدول بشكل غير صالح. حدّث الشاشة وأعد المحاولة.';
  end if;
  for a in select e.x from jsonb_array_elements(p_days) as e(x) loop
    if jsonb_typeof(a) <> 'object' or coalesce(a ->> 'vaccine_id', '') !~ v_uuid or jsonb_typeof(a -> 'age_day') is distinct from 'number'
        or (a ->> 'age_day') !~ '^[0-9]{1,4}$' then
      raise exception 'bad_day' using hint = 'يوم في الجدول بشكل غير صالح. حدّث الشاشة وأعد المحاولة.';
    end if;
  end loop;
  -- النسخة أوّلاً بلا قفل (وتُعاد تحت قفل الجدول أدناه): جدول تغيّر من جهاز آخر، ومنه حذف لقاح فيه، يُقال stale_program قبل أيّ فحص للّقاحات، فتقرأ
  -- الشاشة الجدول من جديد وتقارن (مراجعة 0026 F: كان vaccine_not_found أو vaccine_archived فيعلق المحرّر).
  if coalesce((select x.version from public.vaccine_programs x where x.org_id = v_org and x.kind = p_kind), 0) is distinct from p_expected_version then
    raise exception 'stale_program' using hint = 'تغيّر جدول اللقاحات من جهاز آخر. حدّث الشاشة وقارن، فإن كان التعديل منك فقد حُفظ.';
  end if;
  -- اللقاحات بترتيب معرّفاتها للمشاركة: الحذف والتعديل من جهاز آخر ينتظر أو يُرى.
  for vc in
    select x.id, x.name, x.archived_at from public.vaccines x
    where x.org_id = v_org and x.id in (select distinct (e.x ->> 'vaccine_id')::uuid from jsonb_array_elements(p_days) as e(x))
    order by x.id for share
  loop
    if vc.archived_at is not null then
      raise exception 'vaccine_archived' using hint = format('اللقاح «%s» حُذف من القائمة. حدّث الشاشة.', vc.name);
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_days) as e(x)
      where not exists (select 1 from public.vaccines x where x.org_id = v_org and x.id = (e.x ->> 'vaccine_id')::uuid)) then
    raise exception 'vaccine_not_found' using hint = 'في الجدول لقاح غير موجود في القائمة. حدّث الشاشة.';
  end if;
  select x.name, (e.x ->> 'age_day')::int as age_day into v_bad from jsonb_array_elements(p_days) as e(x)
  join public.vaccines x on x.org_id = v_org and x.id = (e.x ->> 'vaccine_id')::uuid
  where (e.x ->> 'age_day')::int not between 1 and coalesce(p_end_age, 1000) order by 2, 1 limit 1;
  if v_bad.name is not null then
    raise exception 'bad_day' using hint = case when p_end_age is null
      then format('«%s» في يوم العمر %s، وأيّام العمر في الجدول من 1 إلى 1,000.', v_bad.name, v_bad.age_day)
      else format('«%s» في يوم العمر %s، ونهاية الدورة %s يوماً. قدّم الموعد أو مدّ نهاية الدورة أو اتركها مفتوحة.', v_bad.name, v_bad.age_day, p_end_age) end;
  end if;
  select x.name, (e.x ->> 'age_day')::int as age_day into v_bad from jsonb_array_elements(p_days) as e(x)
  join public.vaccines x on x.org_id = v_org and x.id = (e.x ->> 'vaccine_id')::uuid
  group by x.name, x.id, (e.x ->> 'age_day')::int having count(*) > 1 order by 2, 1 limit 1;
  if v_bad.name is not null then
    raise exception 'duplicate_day' using hint = format('«%s» مكتوب في يوم العمر %s مرّتين.', v_bad.name, v_bad.age_day);
  end if;
  select * into p from public.vaccine_programs x where x.org_id = v_org and x.kind = p_kind for update;
  if p.kind is null then
    if p_expected_version is distinct from 0 then
      raise exception 'stale_program' using hint = 'تغيّر جدول اللقاحات من جهاز آخر. حدّث الشاشة وقارن، فإن كان التعديل منك فقد حُفظ.';
    end if;
    begin
      insert into public.vaccine_programs (org_id, kind, end_age) values (v_org, p_kind, p_end_age) returning * into p;
    exception when unique_violation then
      raise exception 'stale_program' using hint = 'حُفظ جدول اللقاحات من جهاز آخر الآن. حدّث الشاشة وقارن.';
    end;
  else
    if p.version is distinct from p_expected_version then
      raise exception 'stale_program' using hint = 'تغيّر جدول اللقاحات من جهاز آخر. حدّث الشاشة وقارن، فإن كان التعديل منك فقد حُفظ.';
    end if;
    update public.vaccine_programs x set end_age = p_end_age, version = x.version + 1, updated_at = now(), updated_by = auth.uid()
    where x.org_id = v_org and x.kind = p_kind returning * into p;
  end if;
  delete from public.vaccine_program_days d where d.org_id = v_org and d.kind = p_kind;
  insert into public.vaccine_program_days (org_id, kind, vaccine_id, age_day)
  select v_org, p_kind, (e.x ->> 'vaccine_id')::uuid, (e.x ->> 'age_day')::int from jsonb_array_elements(p_days) as e(x);
  get diagnostics v_count = row_count;
  return jsonb_build_object('kind', p.kind, 'version', p.version, 'end_age', p.end_age, 'days', v_count);
end
$$;

create or replace function public.save_hall_vaccine_program(p_hall uuid, p_end_age int, p_days jsonb, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  a jsonb;
  vc record;
  h public.halls;
  v_kind text;
  p public.hall_vaccine_programs;
  v_bad record;
  v_count int;
begin
  set local lock_timeout = '5s';
  perform private.require('flock.manage');
  select * into h from public.halls x where x.org_id = v_org and x.id = p_hall;
  if h.id is null then
    raise exception 'hall_not_found' using hint = 'هذه القاعة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(h.site_id) then
    raise exception 'out_of_scope' using hint = 'هذه القاعة خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  if h.archived_at is not null then
    raise exception 'hall_archived' using hint = format('القاعة «%s» مؤرشفة، فلا يُكتب لها جدول لقاحات. أعِدها من الأرشيف أوّلاً.', h.name);
  end if;
  select d.kind into v_kind from public.divisions d where d.org_id = h.org_id and d.id = h.division_id;
  if p_end_age is not null and p_end_age not between 1 and 1000 then
    raise exception 'bad_end_age' using hint = 'نهاية الدورة عدد أيّام من 1 إلى 1,000، أو اتركها مفتوحة.';
  end if;
  if p_days is null or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) > 2000 then
    raise exception 'bad_day' using hint = 'أيّام الجدول بشكل غير صالح. حدّث الشاشة وأعد المحاولة.';
  end if;
  for a in select e.x from jsonb_array_elements(p_days) as e(x) loop
    if jsonb_typeof(a) <> 'object' or coalesce(a ->> 'vaccine_id', '') !~ v_uuid or jsonb_typeof(a -> 'age_day') is distinct from 'number'
        or (a ->> 'age_day') !~ '^[0-9]{1,4}$' then
      raise exception 'bad_day' using hint = 'يوم في الجدول بشكل غير صالح. حدّث الشاشة وأعد المحاولة.';
    end if;
  end loop;
  if coalesce((select case when x.dropped_at is null then x.version else 0 end from public.hall_vaccine_programs x where x.org_id = v_org and x.hall_id = h.id), 0)
      is distinct from p_expected_version then
    raise exception 'stale_program' using hint = format('تغيّر جدول لقاحات «%s» من جهاز آخر. حدّث الشاشة وقارن، فإن كان التعديل منك فقد حُفظ.', h.name);
  end if;
  for vc in
    select x.id, x.name, x.archived_at from public.vaccines x
    where x.org_id = v_org and x.id in (select distinct (e.x ->> 'vaccine_id')::uuid from jsonb_array_elements(p_days) as e(x))
    order by x.id for share
  loop
    if vc.archived_at is not null then
      raise exception 'vaccine_archived' using hint = format('اللقاح «%s» حُذف من القائمة. حدّث الشاشة.', vc.name);
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_days) as e(x)
      where not exists (select 1 from public.vaccines x where x.org_id = v_org and x.id = (e.x ->> 'vaccine_id')::uuid)) then
    raise exception 'vaccine_not_found' using hint = 'في الجدول لقاح غير موجود في القائمة. حدّث الشاشة.';
  end if;
  select x.name, (e.x ->> 'age_day')::int as age_day into v_bad from jsonb_array_elements(p_days) as e(x)
  join public.vaccines x on x.org_id = v_org and x.id = (e.x ->> 'vaccine_id')::uuid
  where (e.x ->> 'age_day')::int not between 1 and coalesce(p_end_age, 1000) order by 2, 1 limit 1;
  if v_bad.name is not null then
    raise exception 'bad_day' using hint = case when p_end_age is null
      then format('«%s» في يوم العمر %s، وأيّام العمر في الجدول من 1 إلى 1,000.', v_bad.name, v_bad.age_day)
      else format('«%s» في يوم العمر %s، ونهاية الدورة %s يوماً. قدّم الموعد أو مدّ نهاية الدورة أو اتركها مفتوحة.', v_bad.name, v_bad.age_day, p_end_age) end;
  end if;
  select x.name, (e.x ->> 'age_day')::int as age_day into v_bad from jsonb_array_elements(p_days) as e(x)
  join public.vaccines x on x.org_id = v_org and x.id = (e.x ->> 'vaccine_id')::uuid
  group by x.name, x.id, (e.x ->> 'age_day')::int having count(*) > 1 order by 2, 1 limit 1;
  if v_bad.name is not null then
    raise exception 'duplicate_day' using hint = format('«%s» مكتوب في يوم العمر %s مرّتين.', v_bad.name, v_bad.age_day);
  end if;
  select * into p from public.hall_vaccine_programs x where x.org_id = v_org and x.hall_id = h.id for update;
  if p.id is null or p.dropped_at is not null then
    if p_expected_version is distinct from 0 then
      raise exception 'stale_program' using hint = format('حُذف جدول «%s» الخاصّ من جهاز آخر. حدّث الشاشة وقارن.', h.name);
    end if;
    if p.id is null then
      begin
        insert into public.hall_vaccine_programs (org_id, hall_id, kind, end_age) values (v_org, h.id, v_kind, p_end_age) returning * into p;
      exception when unique_violation then
        raise exception 'stale_program' using hint = format('حُفظ جدول خاصّ لـ«%s» من جهاز آخر الآن. حدّث الشاشة وقارن.', h.name);
      end;
    else
      update public.hall_vaccine_programs x set end_age = p_end_age, dropped_at = null, dropped_by = null, version = x.version + 1, updated_at = now(), updated_by = auth.uid()
      where x.org_id = v_org and x.id = p.id returning * into p;
    end if;
  else
    if p.version is distinct from p_expected_version then
      raise exception 'stale_program' using hint = format('تغيّر جدول لقاحات «%s» من جهاز آخر. حدّث الشاشة وقارن، فإن كان التعديل منك فقد حُفظ.', h.name);
    end if;
    update public.hall_vaccine_programs x set end_age = p_end_age, version = x.version + 1, updated_at = now(), updated_by = auth.uid()
    where x.org_id = v_org and x.id = p.id returning * into p;
  end if;
  delete from public.hall_vaccine_program_days d where d.org_id = v_org and d.hall_id = h.id;
  insert into public.hall_vaccine_program_days (org_id, hall_id, vaccine_id, age_day)
  select v_org, h.id, (e.x ->> 'vaccine_id')::uuid, (e.x ->> 'age_day')::int from jsonb_array_elements(p_days) as e(x);
  get diagnostics v_count = row_count;
  return jsonb_build_object('hall_id', h.id, 'kind', p.kind, 'version', p.version, 'end_age', p.end_age, 'days', v_count);
end
$$;

-- ─── ج. رأس الفوج: جدول القاعة يحكم نهايته ولو مفتوحة ───────────────────────────────────────────────────────────────────
create or replace function private.hall_flock_json(f public.flocks) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', f.id, 'hall_id', f.hall_id, 'hall_name', h.name, 'site_name', s.name, 'kind', f.kind, 'status', f.status,
    'placed_on', f.placed_on, 'age0', f.age_days_at_placement, 'placed_count', f.placed_count, 'closed_on', f.closed_on,
    'end_age', case when hp.id is not null then hp.end_age else p.end_age end,
    'end_on', case when case when hp.id is not null then hp.end_age else p.end_age end is not null then f.placed_on + (case when hp.id is not null then hp.end_age else p.end_age end - f.age_days_at_placement) end)
  from public.halls h
  join public.sites s on s.org_id = h.org_id and s.id = h.site_id
  left join public.hall_vaccine_programs hp on hp.org_id = f.org_id and hp.hall_id = f.hall_id and hp.dropped_at is null
  left join public.vaccine_programs p on p.org_id = f.org_id and p.kind = f.kind
  where h.org_id = f.org_id and h.id = f.hall_id
$$;

-- ─── د. لوحة اللقاحات: فوج كلّ قاعة للتقويم بالأشهر ──────────────────────────────────────────────────────────────────────
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
    'halls', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name, 'site_name', s.name, 'kind', dv.kind,
        'flock', (select jsonb_build_object('id', f.id, 'placed_on', f.placed_on, 'age0', f.age_days_at_placement) from public.flocks f
          where f.org_id = h.org_id and f.hall_id = h.id and f.status = 'active' and f.placed_on is not null),
        'program', case when hp.id is null then null else jsonb_build_object('version', hp.version, 'end_age', hp.end_age,
          'days', coalesce((select jsonb_agg(jsonb_build_object('vaccine_id', d.vaccine_id, 'age_day', d.age_day) order by d.age_day, x.name_key collate "C", x.id)
            from public.hall_vaccine_program_days d join public.vaccines x on x.org_id = d.org_id and x.id = d.vaccine_id
            where d.org_id = v_org and d.hall_id = h.id), '[]'::jsonb)) end)
        order by s.name collate "C", h.name collate "C", h.id)
      from public.halls h
      join public.sites s on s.org_id = h.org_id and s.id = h.site_id
      join public.divisions dv on dv.org_id = h.org_id and dv.id = h.division_id
      left join public.hall_vaccine_programs hp on hp.org_id = h.org_id and hp.hall_id = h.id and hp.dropped_at is null
      where h.org_id = v_org and h.archived_at is null and dv.kind in ('broiler', 'layer') and public.in_scope_site(h.site_id)), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'kind', i.kind, 'base_unit', i.base_unit) order by i.name_norm collate "C", i.id)
      from public.items i where i.org_id = v_org and i.archived_at is null and i.kind in ('vaccine', 'medicine')), '[]'::jsonb));
end
$$;
