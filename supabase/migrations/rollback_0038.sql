-- rollback_0038 — تراجع «القاعة بأقسام» (0038_hall_sections؛ مشغّل التراجع بالحزمة FOUNDATION ٨٢٠، ٨٧٦): يرجّع public.set_flock_dead
--   وpublic.save_flock_day وprivate.flock_day_rebuild وprivate.flock_day_json وprivate.flock_summary وpublic.flocks_overview كما في 0036، وpublic.hall_sheet
--   وpublic.edit_flock كما في 0037، وpublic.open_flock وpublic.reopen_flock وprivate.reopen_block كما في 0029، حرفاً بحرف (md5 نفسه بالكتالوج)، والأربعة التي
--   تغيّر توقيعها بتواقيعها القديمة ومنحها؛ ويُسقط verify_hall_sections وset_hall_sections وflock_parts_check وflock_parts_input، ثمّ أعمدة الأقسام الأربعة
--   (بقيودها ومنح عمود القاعة) بعد الأجسام التي تقرؤها، ثمّ مساعداتها (بعد القيود التي تناديها).
-- **طريق رفض (الكتلة الأولى أدناه):** ما لا يحمله النموذج القديم يوقف التراجع بصوت بلا أن يغيّر شيئاً، بفرع لكلّ حقيقة مستقلّة: قاعة مقسومة أقساماً،
--   ووجبة بأعداد أقسام (ولو مغلقة: إعادة فتحها بعد التراجع تفقد قسمتها)، وزيارة أو صفّ يوم بهلاكات أقسام (ولو زيارة ملغاة: سجلّ ما كتبه جهاز).
-- تنعاد بأمان: الكتلة الأولى تخرج إن لم يبقَ عمود أقسام القاعة، وdrop function if exists قبل التواقيع القديمة، وcreate or replace، وdrop column if exists.

set lock_timeout = '5s';

-- ٠) طريق الرفض. الجداول تُقفل قبل العدّ ولحدّ نهاية المعاملة (درس WP4): كتابة بلحظة التراجع تنتظر أو تُعدّ.
do $$
declare
  v_halls bigint;
  v_flocks bigint;
  v_parts bigint;
begin
  if not exists (select 1 from pg_attribute where attrelid = 'public.halls'::regclass and attname = 'sections' and attnum > 0 and not attisdropped) then
    return;
  end if;
  execute 'lock table public.halls, public.flocks, public.flock_visits, public.flock_daily in access exclusive mode';
  execute 'select count(*) from public.halls where sections > 1' into v_halls;
  execute 'select count(*) from public.flocks where section_counts is not null' into v_flocks;
  execute 'select (select count(*) from public.flock_visits where dead_parts is not null) + (select count(*) from public.flock_daily where dead_parts is not null)'
    into v_parts;
  -- الأعداد بعد نقطتين لا قبل المعدود (مراجعة 0036 R3).
  if v_halls > 0 then
    raise exception 'rollback_blocked' using hint = format('القاعات المقسومة أقساماً: %s، والنموذج القديم لا يعرف الأقسام. لا تراجع لـ0038 بعد استعمالها.', v_halls);
  end if;
  if v_flocks > 0 then
    raise exception 'rollback_blocked' using hint = format('الوجبات بأعداد أقسام: %s، والتراجع يمسحها. لا تراجع لـ0038 بعد استعمالها.', v_flocks);
  end if;
  if v_parts > 0 then
    raise exception 'rollback_blocked' using hint = format('الزيارات والأيّام بهلاكات أقسام: %s، والتراجع يمسحها. لا تراجع لـ0038 بعد استعمالها.', v_parts);
  end if;
end
$$;

-- ١) الجديد: الثابت والكاتب.
drop function if exists public.verify_hall_sections();
drop function if exists public.set_hall_sections(uuid, integer, integer, uuid);

-- ٢) التواقيع القديمة بأجسامها حرفاً ومنحها: الجديد يُسقط قبل القديم (توقيع واحد لكلّ اسم).
drop function if exists public.set_flock_dead(uuid, date, integer, uuid, boolean, integer[]);
drop function if exists public.save_flock_day(uuid, date, integer, integer, numeric, numeric, numeric, numeric, integer, integer, integer, text, integer, uuid, boolean, integer[]);
drop function if exists public.open_flock(uuid, date, integer, integer, text, uuid, integer[]);
drop function if exists public.edit_flock(uuid, int, date, integer, integer, text, uuid, integer[]);

-- public.set_flock_dead كما في 0036_round_once.sql.
create or replace function public.set_flock_dead(p_flock uuid, p_on date, p_dead integer, p_client_ref uuid, p_queued boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'set_flock_dead';
  v_cached jsonb;
  v_today date := public.app_today();
  v_queued boolean := coalesce(p_queued, false);
  v_lock date;
  v_park text;
  f public.flocks;
  d public.flock_daily;
begin
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('flock', p_flock, 'on', p_on, 'dead', p_dead, 'queued', v_queued));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.require('flock_day.save');
  set local lock_timeout = '5s';
  perform private.period_guard();
  select * into f from public.flocks x where x.org_id = public.auth_org() and x.id = p_flock for update;
  if f.id is null then
    raise exception 'flock_not_found' using hint = 'هذه الوجبة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if p_on is null or not isfinite(p_on) then
    raise exception 'date_required' using hint = 'اختر يوماً من أيّام الوجبة.';
  end if;
  if p_on > v_today then
    raise exception 'date_in_future' using hint = format('يوم %s لم يأتِ بعد؛ تُكتب الهلاكات لليوم %s أو لما قبله من أيّام الوجبة.', to_char(p_on, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY'));
  end if;
  -- الثلاثة التي تتغيّر والعملية بالطابور: بنداء مباشر ترمي، ومن الطابور تُركن وترجع parked (الأحدث للكاتب واليوم يستبدل الأقدم).
  select l.locked_through into v_lock from public.period_locks l where l.org_id = f.org_id;
  v_park := case when f.status = 'closed' then 'flock_closed' when not public.in_scope_site(f.site_id) then 'out_of_scope'
    when v_lock is not null and p_on <= v_lock then 'period_locked' end;
  if v_park is not null and v_queued then
    insert into public.flock_day_rejects (org_id, flock_id, hall_id, site_id, division_id, on_date, client_ref, payload, reason, created_by, visit_id)
    values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_on, p_client_ref, jsonb_build_object('dead', p_dead), v_park, auth.uid(),
      md5('dead:' || coalesce(auth.uid()::text, '') || ':' || f.id::text || ':' || to_char(p_on, 'YYYY-MM-DD'))::uuid)
    on conflict (org_id, visit_id) where visit_id is not null do update
      set client_ref = excluded.client_ref, payload = excluded.payload, reason = excluded.reason, created_at = now(),
          version = public.flock_day_rejects.version + 1, decision = null, decided_by = null, decided_at = null;
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'parked', 'reason', v_park));
  end if;
  if v_park = 'out_of_scope' then
    raise exception 'out_of_scope' using hint = 'قاعة هذه الوجبة خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  perform private.flock_day_check(f, p_on);
  if p_dead is null or p_dead < 0 or p_dead > 10000000 then
    raise exception 'bad_value' using hint = 'اكتب الهلاكات عدداً صحيحاً من صفر إلى 10,000,000.';
  end if;

  -- اليوم الذي سُجّلت هلاكاته (علامته المشتقّة؛ ويوم فيه نافق أو مستبعد بلا علامة، احتياطاً): لا يُضاف إليه شيء.
  select * into d from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_on;
  if d.id is not null and (d.dead_entered or d.dead + d.culled > 0) then
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object(
      'status', case when d.dead + d.culled = p_dead then 'saved' else 'dead_recorded' end, 'day', private.flock_day_json(d)));
  end if;

  insert into public.flock_visits (org_id, flock_id, hall_id, site_id, division_id, on_date, recorded_at, dead, culled, source, version, dead_entry)
  values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_on, now(), p_dead, 0, 'visit', 1, true);
  d := private.flock_day_rebuild(f, p_on);
  -- البيض لا يزيد على الحيّ أوّل اليوم (هذا اليوم وما بعده)، والحيّ لا يصير سالباً في أيّ يوم؛ والرفض لا يُبقي شيئاً.
  perform private.flock_eggs_live_check(f, p_on);
  perform private.flock_live_check(f);
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'day', private.flock_day_json(d)));
end
$$;

-- public.save_flock_day كما في 0036_round_once.sql.
create or replace function public.save_flock_day(p_flock uuid, p_date date, p_dead integer, p_culled integer, p_feed_kg numeric, p_water_l numeric,
  p_temp_min numeric, p_temp_max numeric, p_eggs_total integer, p_eggs_cracked integer, p_eggs_broken integer, p_note text,
  p_base_version integer, p_client_ref uuid, p_queued boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'save_flock_day';
  v_cached jsonb;
  v_today date := public.app_today();
  v_lock date;
  v_park text;
  v_queued boolean := coalesce(p_queued, false);
  v_payload jsonb;
  f public.flocks;
  d public.flock_daily;
  n public.flock_daily;
  v_others bigint;
  v_live bigint;
  v_bad record;
  v_mark boolean;
begin
  v_payload := jsonb_build_object('dead', p_dead, 'culled', p_culled, 'feed_kg', p_feed_kg::text, 'water_l', p_water_l::text,
    'temp_min', p_temp_min::text, 'temp_max', p_temp_max::text, 'eggs_total', p_eggs_total, 'eggs_cracked', p_eggs_cracked,
    'eggs_broken', p_eggs_broken, 'note', p_note, 'base_version', p_base_version);
  v_cached := private.ref_claim(v_fn, p_client_ref, v_payload || jsonb_build_object('flock', p_flock, 'date', p_date, 'queued', v_queued));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.require('flock_day.save');
  set local lock_timeout = '5s';
  perform private.period_guard();
  select * into f from public.flocks x where x.org_id = public.auth_org() and x.id = p_flock for update;
  if f.id is null then
    raise exception 'flock_not_found' using hint = 'هذا الفوج غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if p_date is null then
    raise exception 'date_required' using hint = 'اكتب تاريخ اليوم.';
  end if;
  if p_date > v_today then
    raise exception 'date_in_future' using hint = format('التاريخ %s بعد تاريخ اليوم %s. الجولة تُسجَّل لليوم أو لما قبله.', to_char(p_date, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY'));
  end if;
  select l.locked_through into v_lock from public.period_locks l where l.org_id = f.org_id;
  -- الثلاثة التي تتغيّر والعملية بالطابور (0035: بلا حدّ الأيّام السبعة؛ كلّ أيّام الوجبة القائمة): بنداء مباشر ترمي، ومن الطابور (queued) تُركن وترجع parked.
  if f.status = 'closed' then
    if not v_queued then
      raise exception 'flock_closed' using hint = 'الفوج مغلق، فلا تُسجَّل عليه جولة.';
    end if;
    v_park := 'flock_closed';
  elsif not public.in_scope_site(f.site_id) then
    if not v_queued then
      raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
    end if;
    v_park := 'out_of_scope';
  elsif v_lock is not null and p_date <= v_lock then
    if not v_queued then
      raise exception 'period_locked' using hint = format('الحسابات مقفلة حتى %s (هذا اليوم وما قبله)، فلا تُسجَّل جولة بتاريخ %s. إن كان التاريخ صحيحاً فاطلب من مالك المنشأة فتح الفترة.',
        to_char(v_lock, 'DD/MM/YYYY'), to_char(p_date, 'DD/MM/YYYY'));
    end if;
    v_park := 'period_locked';
  end if;
  if v_park is not null then
    insert into public.flock_day_rejects (org_id, flock_id, hall_id, site_id, division_id, on_date, client_ref, payload, reason, created_by)
    values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_date, p_client_ref, v_payload, v_park, auth.uid())
    on conflict (org_id, created_by, flock_id, on_date) where visit_id is null do update
      set client_ref = excluded.client_ref, payload = excluded.payload, reason = excluded.reason, created_at = now(),
          version = public.flock_day_rejects.version + 1, decision = null, decided_by = null, decided_at = null;
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'parked', 'reason', v_park));
  end if;
  if f.status <> 'active' then
    raise exception 'flock_not_placed' using hint = 'الفوج لم يُسكَّن بعد، فلا تُسجَّل عليه جولة.';
  end if;
  if p_date < f.placed_on then
    raise exception 'before_placement' using hint = format('التاريخ %s قبل تسكين الفوج في %s.', to_char(p_date, 'DD/MM/YYYY'), to_char(f.placed_on, 'DD/MM/YYYY'));
  end if;

  select * into d from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_date;
  if (p_base_version is null and d.id is not null) or (p_base_version is not null and d.version is distinct from p_base_version) then
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'stale_day', 'server', private.flock_day_json(d)));
  end if;

  if p_dead < 0 or p_dead > 10000000 then
    raise exception 'bad_value' using hint = 'النافق عدد صحيح من صفر فأكثر.';
  end if;
  if p_culled < 0 or p_culled > 10000000 then
    raise exception 'bad_value' using hint = 'المستبعد عدد صحيح من صفر فأكثر.';
  end if;
  if p_feed_kg is not null and not (abs(p_feed_kg) < 'Infinity' and p_feed_kg >= 0 and p_feed_kg < 1000000000 and p_feed_kg = round(p_feed_kg, 3)) then
    raise exception 'bad_value' using hint = 'العلف بالكيلوغرام من صفر فأكثر، بثلاث مراتب عشرية على الأكثر.';
  end if;
  if p_water_l is not null and not (abs(p_water_l) < 'Infinity' and p_water_l >= 0 and p_water_l < 1000000000 and p_water_l = round(p_water_l, 3)) then
    raise exception 'bad_value' using hint = 'الماء باللتر من صفر فأكثر، بثلاث مراتب عشرية على الأكثر.';
  end if;
  if (p_temp_min is not null and not (abs(p_temp_min) < 'Infinity' and p_temp_min between -50 and 70 and p_temp_min = round(p_temp_min, 1)))
     or (p_temp_max is not null and not (abs(p_temp_max) < 'Infinity' and p_temp_max between -50 and 70 and p_temp_max = round(p_temp_max, 1))) then
    raise exception 'bad_temp' using hint = 'درجة الحرارة من −50 إلى 70، بمرتبة عشرية واحدة على الأكثر.';
  end if;
  -- الحدّ الأعلى للثلاثة (مو للمجموع بس): مكسور ومشعور بالمليارات كانوا يطفحون int4 بجمعهما ويرجعون «integer out of range» بلا تلميح.
  if p_eggs_total < 0 or p_eggs_cracked < 0 or p_eggs_broken < 0
     or p_eggs_total > 10000000 or p_eggs_cracked > 10000000 or p_eggs_broken > 10000000 then
    raise exception 'bad_value' using hint = 'أعداد البيض أعداد صحيحة من صفر إلى 10,000,000.';
  end if;
  if p_note is not null and length(p_note) > 500 then
    raise exception 'bad_note' using hint = 'الملاحظة لا تزيد على 500 حرف.';
  end if;
  if f.kind = 'broiler' and (p_eggs_total is not null or p_eggs_cracked is not null or p_eggs_broken is not null) then
    raise exception 'eggs_on_broiler' using hint = 'فوج اللحم لا بيض له؛ البيض لأفواج البيّاض فقط.';
  end if;
  if d.id is null and p_dead is null and p_culled is null and p_feed_kg is null and p_water_l is null and p_temp_min is null and p_temp_max is null
     and p_eggs_total is null and p_eggs_cracked is null and p_eggs_broken is null and nullif(p_note, '') is null then
    raise exception 'empty_day' using hint = 'اكتب رقماً واحداً على الأقلّ قبل الحفظ.';
  end if;

  -- القيم الجديدة: الفارغ = بلا تغيير، والملاحظة الفارغة تمسح.
  n := d;
  n.dead := coalesce(p_dead, d.dead, 0);
  n.culled := coalesce(p_culled, d.culled, 0);
  n.feed_kg := coalesce(p_feed_kg, d.feed_kg);
  n.water_l := coalesce(p_water_l, d.water_l);
  n.temp_min := coalesce(p_temp_min, d.temp_min);
  n.temp_max := coalesce(p_temp_max, d.temp_max);
  n.eggs_total := coalesce(p_eggs_total, d.eggs_total);
  n.eggs_cracked := coalesce(p_eggs_cracked, d.eggs_cracked);
  n.eggs_broken := coalesce(p_eggs_broken, d.eggs_broken);
  n.note := case when p_note is null then d.note else nullif(p_note, '') end;
  -- 0036: علامة زيارة day_total: بهلاكات في النداء تُعلَّم حين يبقى نافق أو مستبعد (فمسحها صفراً يعيد خانة الجولة مفتوحة)، وبلا هلاكات في النداء تُنقل
  -- من زيارات اليوم الحيّة التي تُلغيها (تعديل البيض أو الملاحظة لا يفتح الهلاكات). والعلامة تغيّرت = كتابة ولو بقيت القيم كما هي.
  v_mark := case when p_dead is not null or p_culled is not null then n.dead + n.culled > 0
    else exists (select 1 from public.flock_visits x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_date and x.voided_at is null
      and x.dead_entry) end;
  if d.id is not null and (n.dead, n.culled, n.feed_kg, n.water_l, n.temp_min, n.temp_max, n.eggs_total, n.eggs_cracked, n.eggs_broken, n.note, v_mark)
     is not distinct from (d.dead, d.culled, d.feed_kg, d.water_l, d.temp_min, d.temp_max, d.eggs_total, d.eggs_cracked, d.eggs_broken, d.note, d.dead_entered) then
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'version', d.version));
  end if;
  if n.temp_min > n.temp_max then
    raise exception 'bad_temp' using hint = format('الصغرى %s أكبر من العظمى %s. راجع درجتي الحرارة.', n.temp_min, n.temp_max);
  end if;
  if (n.eggs_cracked is not null or n.eggs_broken is not null) and n.eggs_total is null then
    raise exception 'eggs_need_total' using hint = 'اكتب بيض اليوم كلّه قبل المكسور والمشعور.';
  end if;
  if coalesce(n.eggs_cracked, 0) + coalesce(n.eggs_broken, 0) > coalesce(n.eggs_total, 0) then
    raise exception 'eggs_over_total' using hint = format('المكسور والمشعور (%s) أكثر من بيض اليوم كلّه (%s). راجع الأرقام.',
      to_char(coalesce(n.eggs_cracked, 0) + coalesce(n.eggs_broken, 0), 'FM999,999,999,990'), to_char(n.eggs_total, 'FM999,999,999,990'));
  end if;

  -- الحيّ = المسكّن − كل النافق − كل المستبعد + عدد الطيور (المباع وفرق العدّ، 0028) ≥ صفر (FOUNDATION ٤٣٤)، تحت قفل صفّ الفوج.
  select coalesce(sum(x.dead + x.culled), 0) into v_others from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date <> p_date;
  v_live := f.placed_count - v_others + private.flock_counts_total(f.id);
  if v_live - n.dead - n.culled < 0 then
    raise exception 'live_negative' using hint = format('النافق والمستبعد (%s) أكثر من الطيور الحيّة (%s). راجع الأرقام.',
      to_char(n.dead + n.culled, 'FM999,999,999,990'), to_char(greatest(v_live, 0), 'FM999,999,999,990'));
  end if;
  -- بيض اليوم ما يزيد على الدجاج الحيّ بدايته (القاعدة ٣٢)، لهذا اليوم ولكل يوم بعده سجّل بيضاً (النافق الجديد يقلّل حيّه).
  select x.on_date, x.eggs_total, x.live_start into v_bad from (
    select y.on_date, y.eggs_total,
      f.placed_count - coalesce(sum(y.dead + y.culled) over (order by y.on_date rows between unbounded preceding and 1 preceding), 0)
        + coalesce((select sum(k.adjust - k.sold) from private.flock_count_days(f.id) as k where k.on_date < y.on_date), 0) as live_start
    from (
      select z.on_date, z.dead, z.culled, z.eggs_total from public.flock_daily z where z.org_id = f.org_id and z.flock_id = f.id and z.on_date <> p_date
      union all
      select p_date, n.dead, n.culled, n.eggs_total
    ) as y
  ) as x
  where x.on_date >= p_date and x.eggs_total > x.live_start
  order by x.on_date limit 1;
  if v_bad.on_date is not null then
    raise exception 'eggs_over_live' using hint = format('بيض يوم %s (%s) أكثر من الدجاج الحيّ في بدايته (%s)، والنسبة فوق 100٪ خطأ إدخال. راجع الأرقام.',
      to_char(v_bad.on_date, 'DD/MM/YYYY'), to_char(v_bad.eggs_total, 'FM999,999,999,990'), to_char(v_bad.live_start, 'FM999,999,999,990'));
  end if;

  -- 0032: الكتابة بالزيارات («اجعل مجموع اليوم كذا»): تُلغى زيارات اليوم الحيّة كلّها (علامة، ونسخة كلّ واحدة تكبر)، وتُضاف زيارة day_total بالمجموع
  -- المدموج (0036: وبعلامتها)، ثمّ يُعاد بناء صفّ اليوم منها (نسخته السابقة + 1، أو مجموع نسخ زيارات يومه لصفّ جديد؛ وعلامته منها).
  update public.flock_visits x set voided_at = now(), voided_by = auth.uid(), version = x.version + 1, updated_at = now(), updated_by = auth.uid()
  where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_date and x.voided_at is null;
  insert into public.flock_visits (org_id, flock_id, hall_id, site_id, division_id, on_date, recorded_at, dead, culled, feed_kg, water_l, temp_min, temp_max,
    eggs_total, eggs_cracked, eggs_broken, note, source, version, dead_entry)
  values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_date, now(), n.dead, n.culled, n.feed_kg, n.water_l, n.temp_min, n.temp_max,
    n.eggs_total, n.eggs_cracked, n.eggs_broken, n.note, 'day_total', 1, v_mark);
  n := private.flock_day_rebuild(f, p_date);
  -- 0028: الحيّ لا يصير سالباً في أيّ يوم (المباع وفرق العدّ بتاريخهما)، والرفض لا يُبقي شيئاً.
  perform private.flock_live_check(f);
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'version', n.version));
end
$$;

-- public.open_flock كما في 0029_bird_sales_close.sql.
create or replace function public.open_flock(p_hall uuid, p_placed_on date, p_placed_count integer, p_age_days integer, p_breed text, p_client_ref uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'open_flock';
  v_cached jsonb;
  v_today date := public.app_today();
  v_lock date;
  v_breed text := nullif(btrim(p_breed), '');
  v_kind text;
  h public.halls;
  o public.flocks;
  v_id uuid;
  v_last date;
  c record;
  v_amount numeric;
  v_carried jsonb := '[]'::jsonb;
begin
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('hall', p_hall, 'placed_on', p_placed_on, 'count', p_placed_count,
    'age', p_age_days, 'breed', p_breed));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.require('flock.manage');
  set local lock_timeout = '5s';
  perform private.period_guard();
  select * into h from public.halls x where x.org_id = public.auth_org() and x.id = p_hall for update;
  if h.id is null then
    raise exception 'hall_not_found' using hint = 'هذه القاعة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(h.site_id) then
    raise exception 'out_of_scope' using hint = 'هذه القاعة خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  if h.archived_at is not null then
    raise exception 'hall_archived' using hint = format('القاعة «%s» مؤرشفة، فلا يُفتح فيها فوج. أعِدها من الأرشيف أوّلاً.', h.name);
  end if;
  select * into o from public.flocks x where x.org_id = h.org_id and x.hall_id = h.id and x.status in ('preparing', 'active');
  if o.id is not null then
    raise exception 'hall_busy' using hint = format('في القاعة «%s» فوج قائم مسكَّن في %s، فلا يُفتح فيها فوج ثانٍ قبل إغلاقه.',
      h.name, to_char(o.placed_on, 'DD/MM/YYYY'));
  end if;
  -- 0028: لا يُسكَّن فوج في يوم إغلاق آخر دورة في القاعة أو قبله (مراجعة 0027 N3: التقرير اليوميّ يعرض فوجاً واحداً لكلّ قاعة في اليوم).
  select max(x.closed_on) into v_last from public.flocks x where x.org_id = h.org_id and x.hall_id = h.id and x.status = 'closed';
  if v_last is not null and p_placed_on <= v_last then
    raise exception 'before_last_close' using hint = format('آخر دورة في «%s» أُغلقت يوم %s، فلا يُسكَّن فوج في يومها أو قبله.', h.name, to_char(v_last, 'DD/MM/YYYY'));
  end if;
  if p_placed_count is null or p_placed_count < 1 or p_placed_count > 10000000 then
    raise exception 'bad_count' using hint = 'اكتب عدد الطيور المسكَّنة: عدد صحيح أكبر من صفر، لا يزيد على 10,000,000.';
  end if;
  if coalesce(p_age_days, 0) not between 0 and 1000 then
    raise exception 'bad_age' using hint = 'عمر الطيور عند التسكين بالأيام، من 0 إلى 1,000.';
  end if;
  if v_breed is not null and length(v_breed) > 80 then
    raise exception 'bad_breed' using hint = 'اسم السلالة لا يزيد على 80 حرفاً.';
  end if;
  if p_placed_on is null then
    raise exception 'date_required' using hint = 'اكتب تاريخ التسكين.';
  end if;
  if p_placed_on > v_today then
    raise exception 'date_in_future' using hint = format('تاريخ التسكين %s بعد تاريخ اليوم %s.', to_char(p_placed_on, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY'));
  end if;
  select l.locked_through into v_lock from public.period_locks l where l.org_id = h.org_id;
  if v_lock is not null and p_placed_on <= v_lock then
    raise exception 'period_locked' using hint = format('الحسابات مقفلة حتى %s، فلا يُسجَّل تسكين بتاريخ %s. إن كان التاريخ صحيحاً فاطلب من مالك المنشأة فتح الفترة.',
      to_char(v_lock, 'DD/MM/YYYY'), to_char(p_placed_on, 'DD/MM/YYYY'));
  end if;
  select d.kind into v_kind from public.divisions d where d.org_id = h.org_id and d.id = h.division_id;
  insert into public.flocks (org_id, hall_id, site_id, division_id, kind, breed, opened_on, placed_on, placed_count, age_days_at_placement, chick_source, status)
  values (h.org_id, h.id, h.site_id, h.division_id, v_kind, v_breed, p_placed_on, p_placed_on, p_placed_count, coalesce(p_age_days, 0), 'opening', 'active')
  returning id into v_id;
  -- 0028: العلف المنقول المعلَّق على القاعة يدخل الفوج الجديد بيوم تسكينه بقيمته (+ = −صفّ النقل على الفوج المغلق)، والسطر مطبَّق.
  for c in
    select l.*, i.name as item_name from public.flock_close_lines l
    join public.flock_closes k on k.org_id = l.org_id and k.id = l.close_id
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where l.org_id = h.org_id and l.hall_id = h.id and l.carry_status = 'pending' and k.status = 'closed'
    order by k.closed_on, l.close_id, l.line_no
  loop
    select -z.amount into v_amount from public.flock_costs z where z.org_id = c.org_id and z.doc_kind = 'flock_carry' and z.doc_id = c.close_id
      and z.doc_line_id = c.id and z.flock_id = c.flock_id and z.reverses_id is null;
    insert into public.flock_costs (org_id, flock_id, site_id, kind, amount, doc_kind, doc_id, doc_line_id, on_date)
    values (h.org_id, v_id, h.site_id, c.cost_kind, v_amount, 'flock_carry', c.close_id, c.id, p_placed_on);
    update public.flock_close_lines set carry_status = 'applied', to_flock_id = v_id, applied_on = p_placed_on where org_id = c.org_id and id = c.id;
    v_carried := v_carried || jsonb_build_object('line_id', c.id, 'item_id', c.item_id, 'name', c.item_name, 'qty', c.qty_base::text, 'base_unit', c.base_unit);
  end loop;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('flock_id', v_id, 'version', 1, 'carried_in', v_carried));
end
$$;

-- public.edit_flock كما في 0037_kerosene.sql.
create or replace function public.edit_flock(p_flock uuid, p_expected_version int, p_placed_on date, p_placed_count integer, p_age_days integer,
  p_breed text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'edit_flock';
  v_cached jsonb;
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_lock date;
  v_breed text := nullif(btrim(p_breed), '');
  f public.flocks;
  v_hall text;
  v_first date;
  v_closed date;
  v_losses bigint;
  v_core boolean;
  v_changed boolean;
  v_result jsonb;
begin
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('flock', p_flock, 'version', p_expected_version, 'placed_on', p_placed_on,
    'count', p_placed_count, 'age', p_age_days, 'breed', p_breed));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.require('flock.manage');
  set local lock_timeout = '5s';
  perform private.period_guard();
  select * into f from public.flocks x where x.org_id = v_org and x.id = p_flock for update;
  if f.id is null then
    raise exception 'flock_not_found' using hint = 'هذا الفوج غير موجود في منشأتك (ربّما حُذف من جهاز آخر). حدّث الشاشة.';
  end if;
  if not public.in_scope_site(f.site_id) then
    raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  select h.name into v_hall from public.halls h where h.org_id = f.org_id and h.id = f.hall_id;
  if f.status = 'closed' then
    raise exception 'flock_closed' using hint = format('فوج «%s» مغلق، فلا يُعدَّل تسكينه.', v_hall);
  end if;
  if f.status <> 'active' then
    raise exception 'flock_not_placed' using hint = format('فوج «%s» لم يُسكَّن بعد، فلا يُعدَّل تسكينه.', v_hall);
  end if;
  if p_expected_version is null or f.version <> p_expected_version then
    raise exception 'stale_flock' using hint = format('تغيّر فوج «%s» من جهاز آخر بعد فتح الشاشة. حدّث الشاشة ثمّ عدّله.', v_hall);
  end if;
  if p_placed_count is null or p_placed_count < 1 or p_placed_count > 10000000 then
    raise exception 'bad_count' using hint = 'اكتب عدد الطيور المسكَّنة: عدد صحيح أكبر من صفر، لا يزيد على 10,000,000.';
  end if;
  if coalesce(p_age_days, 0) not between 0 and 1000 then
    raise exception 'bad_age' using hint = 'عمر الطيور عند التسكين بالأيام، من 0 إلى 1,000.';
  end if;
  if v_breed is not null and length(v_breed) > 80 then
    raise exception 'bad_breed' using hint = 'اسم السلالة لا يزيد على 80 حرفاً.';
  end if;
  if p_placed_on is null then
    raise exception 'date_required' using hint = 'اكتب تاريخ التسكين.';
  end if;
  if p_placed_on > v_today then
    raise exception 'date_in_future' using hint = format('تاريخ التسكين %s بعد تاريخ اليوم %s.', to_char(p_placed_on, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY'));
  end if;
  -- التاريخ والعدد والعمر تغيّر أيّام الفوج ومؤشّراته؛ والسلالة اسم وحدها.
  v_core := p_placed_on is distinct from f.placed_on or p_placed_count is distinct from f.placed_count or coalesce(p_age_days, 0) is distinct from f.age_days_at_placement;
  v_changed := v_core or v_breed is distinct from f.breed;
  if v_core then
    select l.locked_through into v_lock from public.period_locks l where l.org_id = f.org_id;
    if v_lock is not null and least(p_placed_on, f.placed_on) <= v_lock then
      raise exception 'period_locked' using hint = format('الحسابات مقفلة حتى %s، وتسكين الفوج %s داخلها، فلا يُعدَّل. إن كان التعديل صحيحاً فاطلب من مالك المنشأة فتح الفترة.',
        to_char(v_lock, 'DD/MM/YYYY'), to_char(least(p_placed_on, f.placed_on), 'DD/MM/YYYY'));
    end if;
  end if;
  select max(x.closed_on) into v_closed from public.flocks x
  where x.org_id = f.org_id and x.hall_id = f.hall_id and x.id <> f.id and x.closed_on is not null;
  if v_closed is not null and p_placed_on <= v_closed then
    raise exception 'overlaps_previous' using hint = format('في «%s» دورة سابقة أُغلقت في %s، فالتسكين بعدها.', v_hall, to_char(v_closed, 'DD/MM/YYYY'));
  end if;
  select least(
      (select min(x.on_date) from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id),
      (select min(x.on_date) from public.flock_weights x where x.org_id = f.org_id and x.flock_id = f.id),
      -- 0035: الصرف على يومه في القاعة (لا بعد تاريخ خروجه)، والغاز المسجَّل.
      (select min(private.issue_day(x)) from public.flock_issues x where x.org_id = f.org_id and x.flock_id = f.id),
      (select min(x.on_date) from public.flock_day_gas x where x.org_id = f.org_id and x.flock_id = f.id and x.cylinders is not null),
      -- 0037: الكاز المسجَّل.
      (select min(x.on_date) from public.flock_day_kerosene x where x.org_id = f.org_id and x.flock_id = f.id and x.liters is not null),
      (select min(x.on_date) from public.flock_costs x where x.org_id = f.org_id and x.flock_id = f.id),
      (select min(x.on_date) from public.flock_logs x where x.org_id = f.org_id and x.flock_id = f.id),
      (select min(x.done_on) from public.flock_vaccinations x where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'done'),
      -- 0029: صفوف العدد (المباع بيوم تذكرته وفرق العدّ بيومه، وعكوسها بيوم الإلغاء بعدها) وتذاكر الوزن غير الملغاة (ولو مسوّدة).
      (select min(x.on_date) from public.flock_counts x where x.org_id = f.org_id and x.flock_id = f.id),
      (select min(t.on_date) from public.weigh_ticket_stops s join public.weigh_tickets t on t.org_id = s.org_id and t.id = s.ticket_id
        where s.org_id = f.org_id and s.flock_id = f.id and t.status <> 'void'))
    into v_first;
  if v_first is not null and p_placed_on > v_first then
    raise exception 'records_before_placement' using hint = format('للفوج سجلّ يوم %s (جولة أو صرف أو غاز أو كاز أو وزن أو دواء أو لقاح أو تذكرة وزن أو بيع أو فرق عدّ)، فلا يصير التسكين بعده. اختر تاريخاً في %s أو قبله.',
      to_char(v_first, 'DD/MM/YYYY'), to_char(v_first, 'DD/MM/YYYY'));
  end if;
  select coalesce(sum(x.dead + x.culled), 0) into v_losses from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id;
  if p_placed_count < v_losses then
    raise exception 'count_below_losses' using hint = format('سُجّل في الفوج %s من النافق والمستبعد، فلا يقلّ عدد الطيور المسكَّنة عنه.',
      to_char(v_losses, 'FM999,999,999,990'));
  end if;
  if v_changed then
    update public.flocks x set placed_on = p_placed_on, opened_on = p_placed_on, placed_count = p_placed_count,
      age_days_at_placement = coalesce(p_age_days, 0), breed = v_breed, version = x.version + 1
    where x.org_id = f.org_id and x.id = f.id
    returning * into f;
    -- 0029: الحيّ بالمباع وفرق العدّ لا يصير سالباً في أيّ يوم بالعدد والتاريخ الجديدين (والرفض لا يُبقي شيئاً).
    perform private.flock_live_check(f);
  end if;
  v_result := jsonb_build_object('flock_id', f.id, 'version', f.version, 'placed_on', f.placed_on, 'placed_count', f.placed_count,
    'age_days_at_placement', f.age_days_at_placement, 'breed', f.breed, 'changed', v_changed);
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;

revoke all on function public.set_flock_dead(uuid, date, integer, uuid, boolean),
  public.save_flock_day(uuid, date, integer, integer, numeric, numeric, numeric, numeric, integer, integer, integer, text, integer, uuid, boolean),
  public.open_flock(uuid, date, integer, integer, text, uuid), public.edit_flock(uuid, int, date, integer, integer, text, uuid) from public, anon;
grant execute on function public.set_flock_dead(uuid, date, integer, uuid, boolean),
  public.save_flock_day(uuid, date, integer, integer, numeric, numeric, numeric, numeric, integer, integer, integer, text, integer, uuid, boolean),
  public.open_flock(uuid, date, integer, integer, text, uuid), public.edit_flock(uuid, int, date, integer, integer, text, uuid) to authenticated;

-- ٣) الأجسام القديمة بتواقيعها نفسها حرفاً.
-- private.flock_day_rebuild كما في 0036_round_once.sql.
create or replace function private.flock_day_rebuild(f public.flocks, p_on date) returns public.flock_daily
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s record;
  d public.flock_daily;
  v_note text;
  v_hall text;
begin
  select count(*) as n, sum(v.dead) as dead, sum(v.culled) as culled, sum(v.feed_kg) as feed_kg, sum(v.water_l) as water_l,
    min(v.temp_min) as temp_min, max(v.temp_max) as temp_max, sum(v.eggs_total) as eggs_total, sum(v.eggs_cracked) as eggs_cracked,
    sum(v.eggs_broken) as eggs_broken,
    string_agg(v.note, ' ' || chr(183) || ' ' order by v.recorded_at, v.created_at, v.id) filter (where v.note <> '') as note,
    coalesce(bool_or(v.dead_entry), false) as dead_entered
  into s
  from public.flock_visits v
  where v.org_id = f.org_id and v.flock_id = f.id and v.on_date = p_on and v.voided_at is null;
  select * into d from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_on;
  if s.n = 0 then
    if d.id is not null then
      delete from public.flock_daily x where x.org_id = d.org_id and x.id = d.id;
    end if;
    return null;
  end if;
  if s.dead > 10000000 or s.culled > 10000000 or s.eggs_total > 10000000 or s.eggs_cracked > 10000000 or s.eggs_broken > 10000000
     or s.feed_kg >= 1000000000 or s.water_l >= 1000000000 then
    select h.name into v_hall from public.halls h where h.org_id = f.org_id and h.id = f.hall_id;
    raise exception 'bad_value' using hint = format('مجموع زيارات يوم %s في «%s» يتجاوز الحدّ المسموح به (10,000,000 للأعداد). راجع أرقام الزيارات.',
      to_char(p_on, 'DD/MM/YYYY'), v_hall);
  end if;
  v_note := case when length(s.note) > 500 then left(s.note, 499) || chr(8230) else s.note end;
  if d.id is null then
    insert into public.flock_daily (org_id, flock_id, hall_id, site_id, division_id, on_date, dead, culled, feed_kg, water_l, temp_min, temp_max,
      eggs_total, eggs_cracked, eggs_broken, note, version, dead_entered)
    values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_on, s.dead, s.culled, s.feed_kg, s.water_l, s.temp_min, s.temp_max,
      s.eggs_total, s.eggs_cracked, s.eggs_broken, v_note,
      (select sum(y.version)::int from public.flock_visits y where y.org_id = f.org_id and y.flock_id = f.id and y.on_date = p_on), s.dead_entered)
    returning * into d;
  else
    update public.flock_daily x
    set dead = s.dead, culled = s.culled, feed_kg = s.feed_kg, water_l = s.water_l, temp_min = s.temp_min, temp_max = s.temp_max,
        eggs_total = s.eggs_total, eggs_cracked = s.eggs_cracked, eggs_broken = s.eggs_broken, note = v_note, dead_entered = s.dead_entered,
        version = x.version + 1, updated_at = now(), updated_by = auth.uid()
    where x.org_id = d.org_id and x.id = d.id
    returning * into d;
  end if;
  return d;
end
$$;

-- private.flock_day_json كما في 0036_round_once.sql.
create or replace function private.flock_day_json(d public.flock_daily) returns jsonb
language sql stable set search_path = pg_catalog, pg_temp as $$
  select case when d.id is null then null else jsonb_build_object(
    'on_date', d.on_date, 'version', d.version, 'dead', d.dead, 'culled', d.culled,
    'feed_kg', d.feed_kg::text, 'water_l', d.water_l::text, 'temp_min', d.temp_min::text, 'temp_max', d.temp_max::text,
    'eggs_total', d.eggs_total, 'eggs_cracked', d.eggs_cracked, 'eggs_broken', d.eggs_broken, 'note', d.note,
    'dead_entered', d.dead_entered) end
$$;

-- private.flock_summary كما في 0036_round_once.sql.
create or replace function private.flock_summary(f public.flocks) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_today date := least(public.app_today(), coalesce(f.closed_on, public.app_today()));
  v_dead bigint;
  v_culled bigint;
  v_before bigint;
  v_feed numeric;
  v_unweighed bigint;
  v_feed_days int;
  v_last_feed date;
  v_live bigint;
  v_live_start bigint;
  v_span int;
  w public.flock_weights;
  d public.flock_daily;
  v_fcr text;
  v_rejects int;
  v_sold bigint;
  v_sold_kg numeric;
  v_adjust bigint;
  v_counts_before bigint;
  v_den numeric;
  g public.flock_day_gas;
  v_feed_today numeric;
  v_feed_list jsonb;
  v_last uuid;
begin
  select coalesce(sum(x.dead), 0), coalesce(sum(x.culled), 0), coalesce(sum(x.dead + x.culled) filter (where x.on_date < v_today), 0),
         count(x.feed_kg)::int, max(x.on_date) filter (where x.feed_kg is not null)
    into v_dead, v_culled, v_before, v_feed_days, v_last_feed
  from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id;
  -- 0036 (جواب المالك «عوف سالفة العلف الماكول»): العلف التراكميّ = صافي العلف المرسل بتعريف الورقة الواحد (hall_sheet، 0035) حتى يوم الملخّص: النازل
  -- للقاعة بيومه فيها + المنقول إليها يوم تطبيقه − الراجع والمنقول منها يوم الإغلاق؛ وسطوره بلا كتلة تُعدّ (لا معامل معها، كالورقة).
  select coalesce(sum(m.kg) filter (where m.side = 'in'), 0) - coalesce(sum(m.kg) filter (where m.side = 'back'), 0), count(*) filter (where m.kg is null)
  into v_feed, v_unweighed
  from (
    select 'in' as side, private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg) as kg
    from public.flock_issues x
    join public.flock_issue_lines l on l.org_id = x.org_id and l.issue_id = x.id
    where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted' and l.cost_kind = 'feed' and private.issue_day(x) between f.placed_on and v_today
    union all
    select 'in', private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)
    from public.flock_close_lines l
    where l.org_id = f.org_id and l.to_flock_id = f.id and l.carry_status = 'applied' and l.cost_kind = 'feed' and l.applied_on between f.placed_on and v_today
    union all
    select 'back', private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)
    from public.flock_closes c
    join public.flock_close_lines l on l.org_id = c.org_id and l.close_id = c.id
    where c.org_id = f.org_id and c.flock_id = f.id and c.status = 'closed' and l.cost_kind = 'feed' and l.action in ('return', 'carry')
      and c.closed_on between f.placed_on and v_today
  ) as m;
  -- 0028: المباع وفرق العدّ (الأصول الحيّة بتاريخها): الحيّ الآن وأوّل اليوم بهما.
  select coalesce(sum(k.sold), 0), coalesce(sum(k.sold_kg), 0), coalesce(sum(k.adjust), 0), coalesce(sum(k.adjust - k.sold) filter (where k.on_date < v_today), 0)
  into v_sold, v_sold_kg, v_adjust, v_counts_before
  from private.flock_count_days(f.id) as k;
  v_live := coalesce(f.placed_count, 0) - v_dead - v_culled - v_sold + v_adjust;
  v_live_start := coalesce(f.placed_count, 0) - v_before + v_counts_before;
  -- أيّام العلف المأكول المسجّل (القاعدة ٢٨) للمفتاحين feed_days وfeed_span_days بمعناهما القديم وحده (الواجهة المنشورة تقرؤهما)؛ ومعامل التحويل
  -- لا يشترطها بعد 0036 (العلف صافي المرسل لا المأكول). 0028 (مراجعة O7): بلا الأيّام التي بدأت بلا طير حيّ، بقاعدة report_days نفسها.
  v_span := case when f.placed_on is not null then (select z.alive from private.flock_alive_days(f, greatest(coalesce(v_last_feed, f.placed_on - 1), v_today - 1)) as z) end;
  -- إعادة مراجعة 0028 DN2: أيّام العلف المسجّلة من أيّام الحيّ نفسها (جولة بعلف على يوم بدأ بلا طير حيّ لا تُعدّ)، بقاعدة report_days.
  v_feed_days := case when f.placed_on is not null then (select z.fed from private.flock_alive_days(f, v_today) as z) else 0 end;
  select * into w from public.flock_weights x where x.org_id = f.org_id and x.flock_id = f.id order by x.on_date desc limit 1;
  select * into d from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = v_today;
  -- 0028: المقام = الحيّ × آخر وزن (إن بقي حيّ ووُزن) + صافي المباع بالغرام؛ ومن بقي حيّاً بلا وزن لا معامل له. 0036: البسط صافي المرسل، ولا معامل
  -- بسطر بلا كتلة فيه (كالورقة)؛ فحين لا يبقى حيّ (بيع الكلّ أو الإغلاق) المعامل = معامل الورقة (الصافي ÷ صافي المباع).
  v_den := case when v_live > 0 and w.id is not null then v_live * w.avg_g else 0 end + v_sold_kg * 1000;
  if v_unweighed = 0 and v_feed > 0 and v_den > 0 and (v_live <= 0 or w.id is not null) then
    v_fcr := private._mul_div_round(v_feed, 1000, v_den, 3)::text;
  end if;
  select count(*)::int into v_rejects from public.flock_day_rejects r where r.org_id = f.org_id and r.flock_id = f.id and r.decision is null;
  -- 0036: غاز اليوم ونسخته؛ وعلف اليوم: سطور الصرف الحيّة بنوع كلفة «علف» بيوم القاعة، والمنقول إليها من الدورة السابقة يوم تطبيقه (مراجعة 0036 R2:
  -- «أُرسل اليوم» = سطر اليوم في الورقة والتقرير اليوميّ)؛ كيلوه بالكتلة (فارغ بلا سطر) وسطوره بالمادّة بوحدة أساسها: المنقول أوّلاً بعلامة carry، ثمّ
  -- المرسل بترتيب أوّل إرسال؛ وآخر علف أُرسل للوجبة (بنوع المادّة «علف»، كما تحسبه hall_sheet).
  select * into g from public.flock_day_gas x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = v_today;
  select round(sum(o.kg), 3), coalesce(jsonb_agg(jsonb_build_object('item_id', o.item_id, 'item_name', o.name, 'qty', round(o.qty, 3)::text, 'unit', o.base_unit,
      'carry', o.carry) order by o.first_seq, o.item_id), '[]'::jsonb)
  into v_feed_today, v_feed_list
  from (
    select q.carry, q.item_id, q.base_unit, i.name, sum(q.qty_base) as qty, sum(q.kg) as kg, min(q.seq) as first_seq
    from (
      select t.*, row_number() over (order by t.carry desc, t.at, t.doc collate "C", t.line_no) as seq
      from (
        select false as carry, l.item_id, l.base_unit, l.qty_base, private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg) as kg,
          x.posted_at as at, x.doc_no as doc, l.line_no
        from public.flock_issues x
        join public.flock_issue_lines l on l.org_id = x.org_id and l.issue_id = x.id
        where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted' and l.cost_kind = 'feed' and private.issue_day(x) = v_today
        union all
        select true, l.item_id, l.base_unit, l.qty_base, private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg),
          l.created_at, l.close_id::text, l.line_no
        from public.flock_close_lines l
        where l.org_id = f.org_id and l.to_flock_id = f.id and l.carry_status = 'applied' and l.cost_kind = 'feed' and l.applied_on = v_today
      ) as t
    ) as q
    join public.items i on i.org_id = f.org_id and i.id = q.item_id
    group by q.carry, q.item_id, q.base_unit, i.name
  ) as o;
  select y.item_id into v_last
  from public.flock_issues x
  join public.flock_issue_lines y on y.org_id = x.org_id and y.issue_id = x.id
  join public.items i on i.org_id = y.org_id and i.id = y.item_id
  where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted' and i.kind = 'feed'
  order by x.posted_at desc, x.doc_no desc, y.line_no limit 1;
  return jsonb_build_object(
    'id', f.id, 'kind', f.kind, 'breed', f.breed, 'status', f.status, 'version', f.version,
    'placed_on', f.placed_on, 'placed_count', f.placed_count, 'age_days_at_placement', f.age_days_at_placement,
    'age_days', case when f.placed_on is null then null else v_today - f.placed_on + f.age_days_at_placement end,
    'days_since_placement', case when f.placed_on is null then null else v_today - f.placed_on + 1 end,
    'dead_total', v_dead, 'culled_total', v_culled, 'live', v_live, 'live_start_today', v_live_start,
    'mortality_pct', private.flock_pct(v_dead + v_culled, f.placed_count),
    'feed_kg_total', round(v_feed, 3)::text, 'feed_days', v_feed_days, 'feed_span_days', v_span,
    'last_weight', case when w.id is null then null else jsonb_build_object('on_date', w.on_date, 'sample_count', w.sample_count, 'avg_g', round(w.avg_g, 1)::text) end,
    'fcr', v_fcr,
    'today', private.flock_day_json(d),
    'eggs_today', case when f.kind = 'layer' then d.eggs_total end,
    'hdep_today', case when f.kind = 'layer' then private.flock_pct(d.eggs_total, v_live_start) end,
    'rejects_pending', v_rejects,
    'sold_birds', v_sold, 'sold_net_kg', round(v_sold_kg, 3)::text, 'count_diff', v_adjust, 'ticketed_birds', private.flock_ticketed(f.id, null),
    'closed_on', f.closed_on,
    'gas_today', g.cylinders, 'gas_today_version', g.version, 'feed_today_kg', v_feed_today::text, 'feed_today', v_feed_list,
    'last_feed_item_id', v_last);
end
$$;

-- public.flocks_overview كما في 0036_round_once.sql.
create or replace function public.flocks_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_manage boolean;
  v_today date := public.app_today();
begin
  perform private.require('read');
  v_manage := public.can('flock.manage');
  return jsonb_build_object(
    'today', public.app_today(),
    'sites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'division_id', s.division_id, 'kind', d.kind, 'can_manage', v_manage,
        'halls', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', h.id, 'name', h.name, 'capacity', h.capacity, 'version', h.version,
            'flock', (select private.flock_summary(f) from public.flocks f where f.org_id = h.org_id and f.hall_id = h.id and f.status in ('preparing', 'active'))
          ) order by h.name, h.id)
          from public.halls h where h.org_id = s.org_id and h.site_id = s.id and h.archived_at is null
        ), '[]'::jsonb)
      ) order by d.kind, s.name, s.id)
      from public.sites s join public.divisions d on d.org_id = s.org_id and d.id = s.division_id
      where s.org_id = v_org and s.archived_at is null and s.kind = 'farm' and d.kind in ('broiler', 'layer') and d.archived_at is null
        and public.in_scope_site(s.id)
    ), '[]'::jsonb),
    -- 0036: الأعلاف للإرسال من الجولة كما في hall_sheet بلا last: كلّ علف فعّال في المنشأة له اليوم متاح في مخزن علف (أكبر ما في مخزن واحد: ما يأخذه
    -- إرسال واحد)، بوحدات تعبئته، بترتيب الاسم. كمية بلا مال.
    'feed_items', coalesce((select jsonb_agg(jsonb_build_object('item_id', q.id, 'name', q.name, 'base_unit', q.base_unit, 'on_hand', round(q.on_hand, 3)::text,
        'units', q.units) order by q.name_norm collate "C", q.id)
      from (
        select i.id, i.name, i.name_norm, i.base_unit,
          coalesce((select max(s.available) from public.warehouses w cross join lateral private.stock_at(i.id, w.id, v_today) as s
            where w.org_id = i.org_id and w.kind = 'feed' and w.archived_at is null and public.in_scope_wh(w.id)), 0) as on_hand,
          coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.label, 'base_qty', u.factor_to_base::text)
              order by u.is_default desc, u.factor_to_base, u.label collate "C", u.id)
            from public.item_units u where u.org_id = i.org_id and u.item_id = i.id and u.archived_at is null and u.party_id is null), '[]'::jsonb) as units
        from public.items i
        where i.org_id = v_org and i.archived_at is null and i.kind = 'feed'
      ) as q
      where q.on_hand > 0), '[]'::jsonb));
end
$$;

-- public.hall_sheet كما في 0037_kerosene.sql.
create or replace function public.hall_sheet(p_flock uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_today date := public.app_today();
  f public.flocks;
  v_head jsonb;
  v_end date;
  v_through date;
  v_void boolean;
  v_days jsonb;
  v_totals jsonb;
  v_summary jsonb;
  v_live bigint;
  v_net numeric;
  v_sold_kg numeric;
  v_unweighed bigint;
  v_last uuid;
begin
  perform private.require('read');
  f := private.flock_for(p_flock, false);
  if f.placed_on is null then
    raise exception 'flock_not_placed' using hint = 'هذه الوجبة لم تُسكَّن بعد، فلا ورقة لها.';
  end if;
  v_head := private.hall_flock_json(f);
  v_end := (v_head ->> 'end_on')::date;
  v_through := greatest(f.placed_on, case
    when f.status = 'closed' then f.closed_on
    when v_end is not null then greatest(v_today, v_end)
    when f.kind = 'broiler' then greatest(v_today, f.placed_on + (45 - f.age_days_at_placement))
    else v_today end);
  v_void := public.can('void') and f.status <> 'closed';
  with g as (
    select f.placed_on + s.n as d from generate_series(0, v_through - f.placed_on) as s(n)
  ), lines as (
    select private.issue_day(x) as d, x.id, x.doc_no, x.issued_on, x.posted_at, l.line_no, l.item_id, i.name, l.qty_base, l.base_unit,
      private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg) as kg,
      v_void and public.in_scope_site(x.site_id) and public.in_scope_wh(x.warehouse_id) as voidable
    from public.flock_issues x
    join public.flock_issue_lines l on l.org_id = x.org_id and l.issue_id = x.id
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted' and l.cost_kind = 'feed'
  ), fd as (
    select o.d, sum(o.kg) as kg, count(*) filter (where o.kg is null) as unweighed,
      jsonb_agg(jsonb_build_object('issue_id', o.id, 'doc_no', o.doc_no, 'item_id', o.item_id, 'item_name', o.name, 'qty', round(o.qty_base, 3)::text,
        'unit', o.base_unit, 'issued_on', o.issued_on, 'can_void', o.voidable) order by o.posted_at, o.doc_no collate "C", o.line_no) as feed
    from lines o group by o.d
  ), carry as (
    -- مراجعة 0035: العلف المنقول من دورة سابقة يدخل القاعة يوم تطبيقه (يوم التسكين)، فهو من المرسل كما يعدّه report_days (given_kg).
    select l.applied_on as d, sum(m.kg) as kg, count(*) as n, count(*) filter (where m.kg is null) as unweighed
    from public.flock_close_lines l
    cross join lateral (select private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg) as kg) as m
    where l.org_id = f.org_id and l.to_flock_id = f.id and l.carry_status = 'applied' and l.cost_kind = 'feed'
    group by l.applied_on
  ), back as (
    -- ومن الإغلاق: الراجع إلى المخزن والمنقول للدورة التالية يوم الإغلاق، خارج الصافي كما يعدّه report_days_extra (out_kg).
    select c.closed_on as d, sum(m.kg) as kg, count(*) as n, count(*) filter (where m.kg is null) as unweighed
    from public.flock_closes c
    join public.flock_close_lines l on l.org_id = c.org_id and l.close_id = c.id
    cross join lateral (select private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg) as kg) as m
    where c.org_id = f.org_id and c.flock_id = f.id and c.status = 'closed' and l.cost_kind = 'feed' and l.action in ('return', 'carry')
    group by c.closed_on
  ), y as (
    select g.d, r.dead, r.culled, r.version, r.note, r.eggs_total, r.eggs_cracked, r.eggs_broken, gs.cylinders, gs.version as gas_version,
      ks.liters, ks.version as kerosene_version,
      case when fd.kg is not null or ci.kg is not null then coalesce(fd.kg, 0) + coalesce(ci.kg, 0) end as kg,
      coalesce(fd.unweighed, 0) + coalesce(ci.unweighed, 0) + coalesce(bk.unweighed, 0) as unweighed,
      coalesce(ci.n, 0) as carry_n, ci.kg as carry_kg, coalesce(bk.n, 0) as back_n, bk.kg as back_kg,
      fd.feed, coalesce(k.sold, 0) as sold, k.sold_kg, coalesce(k.adjust, 0) as adjust
    from g
    left join public.flock_daily r on r.org_id = f.org_id and r.flock_id = f.id and r.on_date = g.d
    left join public.flock_day_gas gs on gs.org_id = f.org_id and gs.flock_id = f.id and gs.on_date = g.d
    left join public.flock_day_kerosene ks on ks.org_id = f.org_id and ks.flock_id = f.id and ks.on_date = g.d
    left join fd on fd.d = g.d
    left join carry ci on ci.d = g.d
    left join back bk on bk.d = g.d
    left join private.flock_count_days(f.id) as k on k.on_date = g.d
  ), z as (
    select y.*, f.placed_count - sum(coalesce(y.dead, 0) + coalesce(y.culled, 0) + y.sold - y.adjust) over (order by y.d rows unbounded preceding) as live_end
    from y
  )
  select
    jsonb_agg(jsonb_build_object('on', z.d, 'age', z.d - f.placed_on + f.age_days_at_placement, 'day_no', z.d - f.placed_on + 1,
      'dead', case when z.version is not null then z.dead + z.culled end, 'culled', z.culled, 'day_version', z.version, 'note', z.note,
      'gas', z.cylinders, 'gas_version', z.gas_version, 'kerosene', z.liters, 'kerosene_version', z.kerosene_version,
      'feed_kg', round(z.kg, 3)::text, 'feed', coalesce(z.feed, '[]'::jsonb),
      'carry_in_kg', case when z.carry_n > 0 then round(z.carry_kg, 3)::text end, 'feed_back_kg', case when z.back_n > 0 then round(z.back_kg, 3)::text end,
      'eggs_total', case when f.kind = 'layer' then z.eggs_total end, 'eggs_cracked', case when f.kind = 'layer' then z.eggs_cracked end,
      'eggs_broken', case when f.kind = 'layer' then z.eggs_broken end,
      'sold_birds', z.sold, 'sold_net_kg', case when z.sold_kg is not null then round(z.sold_kg, 3)::text end, 'live_end', z.live_end) order by z.d),
    jsonb_build_object('dead', coalesce(sum(z.dead + z.culled), 0)::bigint, 'gas', coalesce(sum(z.cylinders), 0)::bigint,
      'kerosene', coalesce(sum(z.liters), 0)::bigint,
      'feed_kg', round(coalesce(sum(z.kg), 0), 3)::text, 'feed_back_kg', round(coalesce(sum(z.back_kg), 0), 3)::text,
      'sold_birds', sum(z.sold)::bigint, 'sold_net_kg', round(coalesce(sum(z.sold_kg), 0), 3)::text,
      'eggs_total', case when f.kind = 'layer' then coalesce(sum(z.eggs_total), 0)::bigint end),
    (array_agg(z.live_end order by z.d desc))[1],
    coalesce(sum(z.kg), 0) - coalesce(sum(z.back_kg), 0), coalesce(sum(z.sold_kg), 0), coalesce(sum(z.unweighed), 0)
  into v_days, v_totals, v_live, v_net, v_sold_kg, v_unweighed
  from z;
  -- الخلاصة: النفوق من المسكَّن، والحيّ آخر آخر يوم، ومعدّل وزن المباع، والمرسل (ومعه المنقول إليها) والراجع منها عند الإغلاق (إلى المخزن أو للدورة التالية)
  -- وصافيهما، ومعامل التحويل = الصافي ÷ صافي المباع (= flock_cycle_report.kpis.fcr_final للوجبة المغلقة، بلا سطر بلا كتلة)، والأكياس بحجم كيس واحد مشترك
  -- لكلّ سطر مرسل أو منقول إليها.
  select jsonb_build_object('placed', f.placed_count, 'dead', (v_totals ->> 'dead')::bigint,
      'mortality_pct', private.flock_pct((v_totals ->> 'dead')::numeric, f.placed_count), 'live', v_live,
      'feed_kg', v_totals ->> 'feed_kg', 'feed_back_kg', v_totals ->> 'feed_back_kg', 'feed_net_kg', round(v_net, 3)::text,
      'feed_bags', case when b.lines > 0 and b.sized = b.lines and b.sizes = 1 and (v_totals ->> 'feed_kg')::numeric > 0
        then private._mul_div_round((v_totals ->> 'feed_kg')::numeric, 1, b.size, 3)::text end,
      'gas', (v_totals ->> 'gas')::bigint, 'kerosene', (v_totals ->> 'kerosene')::bigint,
      'sold_birds', (v_totals ->> 'sold_birds')::bigint, 'sold_net_kg', v_totals ->> 'sold_net_kg',
      'avg_weight_kg', case when (v_totals ->> 'sold_birds')::numeric > 0 and (v_totals ->> 'sold_net_kg')::numeric > 0
        then private._mul_div_round((v_totals ->> 'sold_net_kg')::numeric, 1, (v_totals ->> 'sold_birds')::numeric, 3)::text end,
      'fcr', case when v_unweighed = 0 and v_net > 0 and v_sold_kg > 0 then private._mul_div_round(v_net, 1, v_sold_kg, 3)::text end)
  into v_summary
  from (
    select count(*) as lines, count(q.size) as sized, count(distinct q.size) as sizes, max(q.size) as size
    from (
      select case
          when l.base_unit = 'pc' then l.piece_mass_kg
          when l.base_unit = 'kg' then (select case when count(*) filter (where u.is_default) = 1 then max(u.factor_to_base) filter (where u.is_default)
              when count(*) = 1 then max(u.factor_to_base) end
            from public.item_units u where u.org_id = l.org_id and u.item_id = l.item_id and u.archived_at is null and u.party_id is null and u.factor_to_base > 1)
        end as size
      from (
        select l.org_id, l.item_id, l.base_unit, l.piece_mass_kg
        from public.flock_issues x join public.flock_issue_lines l on l.org_id = x.org_id and l.issue_id = x.id
        where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted' and l.cost_kind = 'feed'
        union all
        select l.org_id, l.item_id, l.base_unit, l.piece_mass_kg
        from public.flock_close_lines l
        where l.org_id = f.org_id and l.to_flock_id = f.id and l.carry_status = 'applied' and l.cost_kind = 'feed'
      ) as l
    ) as q
  ) as b;
  select (select y.item_id from public.flock_issues x join public.flock_issue_lines y on y.org_id = x.org_id and y.issue_id = x.id
      join public.items i on i.org_id = y.org_id and i.id = y.item_id
      where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted' and i.kind = 'feed'
      order by x.posted_at desc, x.doc_no desc, y.line_no limit 1)
  into v_last;
  return jsonb_build_object(
    'today', v_today,
    'flock', v_head,
    'can_write', f.status = 'active',
    'through', v_through,
    'days', coalesce(v_days, '[]'::jsonb),
    'totals', v_totals,
    'summary', v_summary,
    -- الأعلاف للإرسال: كلّ علف فعّال له اليوم متاح في مخازن العلف بنطاق القارئ، أو آخر علف أُرسل لهذه الوجبة؛ والأخير أوّلاً ثمّ الاسم. والمتاح (on_hand)
    -- أكبر ما في مخزن علف واحد اليوم، لا مجموع المخازن: ما يأخذه إرسال واحد (send_flock_feed يصرف من مخزن واحد فيه ما يكفي؛ مراجعة 0035).
    'feed_items', coalesce((select jsonb_agg(jsonb_build_object('item_id', q.id, 'name', q.name, 'base_unit', q.base_unit, 'on_hand', round(q.on_hand, 3)::text,
        'units', q.units, 'last', coalesce(q.id = v_last, false)) order by coalesce(q.id = v_last, false) desc, q.name_norm collate "C", q.id)
      from (
        select i.id, i.name, i.name_norm, i.base_unit,
          coalesce((select max(s.available) from public.warehouses w cross join lateral private.stock_at(i.id, w.id, v_today) as s
            where w.org_id = i.org_id and w.kind = 'feed' and w.archived_at is null and public.in_scope_wh(w.id)), 0) as on_hand,
          coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.label, 'base_qty', u.factor_to_base::text)
              order by u.is_default desc, u.factor_to_base, u.label collate "C", u.id)
            from public.item_units u where u.org_id = i.org_id and u.item_id = i.id and u.archived_at is null and u.party_id is null), '[]'::jsonb) as units
        from public.items i
        where i.org_id = f.org_id and i.archived_at is null and i.kind = 'feed'
      ) as q
      where q.on_hand > 0 or q.id = v_last), '[]'::jsonb),
    'rejects', coalesce((select jsonb_agg(private.flock_reject_json(r) order by r.on_date, r.created_at, r.id)
      from public.flock_day_rejects r where r.org_id = f.org_id and r.flock_id = f.id and r.decision is null), '[]'::jsonb));
end
$$;

-- public.reopen_flock كما في 0029_bird_sales_close.sql.
create or replace function public.reopen_flock(p_close_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'reopen_flock';
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_cached jsonb;
  v_reason text;
  x public.flock_closes;
  h public.halls;
  o public.flocks;
  l record;
  r public.flock_returns;
  m public.stock_moves;
  c public.flock_costs;
  k public.flock_counts;
  v_wh uuid;
  v_items uuid[];
  v_whs uuid[];
  v_back int := 0;
  v_birds int := 0;
  v_returned numeric := 0;
  v_carried numeric := 0;
begin
  set local lock_timeout = '5s';
  perform private.require('flock.manage');
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('close', p_close_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into x from public.flock_closes y where y.org_id = v_org and y.id = p_close_id;
  if x.id is null then
    raise exception 'close_not_found' using hint = 'هذا الإغلاق غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(x.site_id) then
    raise exception 'out_of_scope' using hint = 'قاعة هذه الدورة خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  -- مراجعة 0028 C1/M1: كلّ مخزن رجع إليه مستند FR من هذا الإغلاق (إرجاعه والمنقول الذي أُرجع) بنطاق الكاتب قبل أن يُسمّى شيء، كإلغاء الصرف
  -- (stock_wh بنطاقه): إعادة الفتح تلغي حركته في ذلك المخزن.
  for v_wh in select distinct y.warehouse_id from public.flock_returns y where y.org_id = v_org and y.close_id = x.id and y.status = 'posted' order by 1 loop
    perform private.stock_wh(v_wh, true);
  end loop;
  perform private.check_void_date();
  select * into h from public.halls y where y.org_id = v_org and y.id = x.hall_id for update;
  perform 1 from public.flocks y where y.org_id = v_org and y.id = x.flock_id for update;
  select * into x from public.flock_closes y where y.org_id = v_org and y.id = p_close_id for update;
  if x.status = 'reopened' then
    raise exception 'already_reopened' using hint = 'أُعيد فتح هذه الدورة من قبل.';
  end if;
  -- تحت قفل القاعة: منقول أُرجع بين القراءة الأولى والقفل يُفحص مخزنه أيضاً (return_hall_carry يقفل القاعة نفسها).
  for v_wh in select distinct y.warehouse_id from public.flock_returns y where y.org_id = v_org and y.close_id = x.id and y.status = 'posted' order by 1 loop
    perform private.stock_wh(v_wh, true);
  end loop;
  -- مراجعة 0028 M2: لا فوج قائم في قاعة مؤرشفة (أو حقل مؤرشف)، كالتسكين (open_flock).
  if h.archived_at is not null or exists (select 1 from public.sites s where s.org_id = v_org and s.id = h.site_id and s.archived_at is not null) then
    raise exception 'hall_archived' using hint = format('القاعة «%s» مؤرشفة، فلا يُعاد فتح دورتها. أعِدها من الأرشيف أوّلاً.', h.name);
  end if;
  select * into o from public.flocks y
  where y.org_id = v_org and y.hall_id = x.hall_id and y.id <> x.flock_id and (y.status in ('preparing', 'active') or y.placed_on >= x.closed_on)
  order by y.placed_on desc nulls first, y.id limit 1;
  if o.id is not null then
    raise exception 'hall_reused' using hint = format('سُكّن في «%s» فوج جديد يوم %s بعد هذه الدورة، فلا يُعاد فتحها.', h.name,
      coalesce(to_char(o.placed_on, 'DD/MM/YYYY'), '—'));
  end if;
  -- النقل المطبَّق على فوج جديد يمنع (والمعلَّق يُلغى، والمُرجَع يُعكس إرجاعه أدناه).
  select z.*, i.name as item_name into l
  from public.flock_close_lines z
  join public.items i on i.org_id = z.org_id and i.id = z.item_id
  where z.org_id = v_org and z.close_id = x.id and z.action = 'carry' and z.carry_status = 'applied'
  order by z.line_no limit 1;
  if l.id is not null then
    raise exception 'carry_used' using hint = format('العلف المنقول «%s» نُقل إلى الفوج الجديد يوم %s، فلا يُعاد فتح الدورة.', l.item_name,
      to_char(l.applied_on, 'DD/MM/YYYY'));
  end if;
  -- مستندات FR المرحَّلة لهذا الإغلاق كلّها: إرجاعه (المصدر close) والمنقول الذي أُرجع (المصدر carry).
  select array_agg(z.item_id order by z.id), array_agg(z.warehouse_id order by z.id) into v_items, v_whs
  from public.flock_return_lines z join public.flock_returns y on y.org_id = z.org_id and y.id = z.return_id
  where y.org_id = v_org and y.close_id = x.id and y.status = 'posted';
  if v_items is not null then
    perform private.lock_masters(v_whs, v_items, false);
    perform private.lock_balances(v_items, v_whs);
    perform 1 from public.stock_lots s where s.org_id = v_org and s.id in (select z.lot_id from public.flock_return_lines z
      join public.flock_returns y on y.org_id = z.org_id and y.id = z.return_id where y.org_id = v_org and y.close_id = x.id and y.status = 'posted')
    order by s.id for no key update;
    for l in select z.lot_id from public.flock_return_lines z join public.flock_returns y on y.org_id = z.org_id and y.id = z.return_id
        where y.org_id = v_org and y.close_id = x.id and y.status = 'posted' order by y.doc_no collate "C" loop
      perform private.check_lot_intact(l.lot_id);
    end loop;
  end if;

  -- الكتابة بيوم اليوم.
  for r in select y.* from public.flock_returns y where y.org_id = v_org and y.close_id = x.id and y.status = 'posted' order by y.doc_no collate "C" loop
    for m in select z.* from public.stock_moves z where z.org_id = v_org and z.doc_kind = 'flock_return' and z.doc_id = r.id and z.reverses_move_id is null
        order by z.seq loop
      perform private.apply_move(m.lot_id, 'flock_return', r.id, m.doc_line_id, -m.qty, -m.value, v_today, m.id);
    end loop;
    for c in select z.* from public.flock_costs z where z.org_id = v_org and z.doc_kind = 'flock_return' and z.doc_id = r.id and z.reverses_id is null
        and not exists (select 1 from public.flock_costs q where q.org_id = z.org_id and q.reverses_id = z.id) order by z.id loop
      insert into public.flock_costs (org_id, flock_id, site_id, kind, amount, doc_kind, doc_id, doc_line_id, on_date, reverses_id)
      values (c.org_id, c.flock_id, c.site_id, c.kind, -c.amount, c.doc_kind, c.doc_id, c.doc_line_id, v_today, c.id);
      v_returned := v_returned - c.amount;
    end loop;
    update public.flock_returns set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason, version = version + 1
    where org_id = v_org and id = r.id;
    v_back := v_back + 1;
  end loop;
  for c in select z.* from public.flock_costs z where z.org_id = v_org and z.doc_kind = 'flock_carry' and z.doc_id = x.id and z.flock_id = x.flock_id
      and z.reverses_id is null and not exists (select 1 from public.flock_costs q where q.org_id = z.org_id and q.reverses_id = z.id) order by z.id loop
    insert into public.flock_costs (org_id, flock_id, site_id, kind, amount, doc_kind, doc_id, doc_line_id, on_date, reverses_id)
    values (c.org_id, c.flock_id, c.site_id, c.kind, -c.amount, c.doc_kind, c.doc_id, c.doc_line_id, v_today, c.id);
    v_carried := v_carried - c.amount;
  end loop;
  update public.flock_close_lines set carry_status = 'void' where org_id = v_org and close_id = x.id and action = 'carry';
  for k in select z.* from public.flock_counts z where z.org_id = v_org and z.doc_kind = 'flock_close' and z.doc_id = x.id and z.reverses_id is null
      and not exists (select 1 from public.flock_counts q where q.org_id = z.org_id and q.reverses_id = z.id) loop
    insert into public.flock_counts (org_id, flock_id, hall_id, site_id, division_id, on_date, kind, birds, doc_kind, doc_id, reverses_id)
    values (k.org_id, k.flock_id, k.hall_id, k.site_id, k.division_id, v_today, k.kind, -k.birds, k.doc_kind, k.doc_id, k.id);
    v_birds := v_birds - k.birds;
  end loop;
  update public.flock_closes set status = 'reopened', reopened_at = now(), reopened_by = auth.uid(), reopen_reason = v_reason
  where org_id = v_org and id = x.id;
  update public.flocks set status = 'active', closed_on = null, close_note = null, version = version + 1 where org_id = v_org and id = x.flock_id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('close_id', x.id, 'flock_id', x.flock_id, 'status', 'reopened', 'reversed_returns', v_back,
    'reversed_count', v_birds, 'money', jsonb_build_object('returned_value', v_returned::text, 'carried_value', v_carried::text)));
end
$$;

-- private.reopen_block كما في 0029_bird_sales_close.sql.
create or replace function private.reopen_block(x public.flock_closes) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when x.status is distinct from 'closed' then 'not_closed'
    when exists (select 1 from public.flock_returns y where y.org_id = x.org_id and y.close_id = x.id and y.status = 'posted'
        and not public.in_scope_wh(y.warehouse_id)) then 'out_of_scope'
    when (select l.locked_through from public.period_locks l where l.org_id = x.org_id) >= public.app_today() then 'period_locked'
    when exists (select 1 from public.halls h join public.sites s on s.org_id = h.org_id and s.id = h.site_id
        where h.org_id = x.org_id and h.id = x.hall_id and (h.archived_at is not null or s.archived_at is not null)) then 'hall_archived'
    when exists (select 1 from public.flocks y where y.org_id = x.org_id and y.hall_id = x.hall_id and y.id <> x.flock_id
        and (y.status in ('preparing', 'active') or y.placed_on >= x.closed_on)) then 'hall_reused'
    when exists (select 1 from public.flock_close_lines z where z.org_id = x.org_id and z.close_id = x.id and z.action = 'carry'
        and z.carry_status = 'applied') then 'carry_used'
    when exists (select 1 from public.flock_return_lines z
        join public.flock_returns y on y.org_id = z.org_id and y.id = z.return_id
        join public.stock_lots s on s.org_id = z.org_id and s.id = z.lot_id
        where y.org_id = x.org_id and y.close_id = x.id and y.status = 'posted'
          and (s.qty_left <> s.qty_in or s.value_left <> s.value_in
            or exists (select 1 from public.stock_moves m where m.org_id = s.org_id and m.lot_id = s.id and m.doc_kind = 'receipt_revalue'
              and m.reverses_move_id is null and not exists (select 1 from public.stock_moves q where q.org_id = m.org_id and q.reverses_move_id = m.id))))
      then 'lot_consumed'
    -- إعادة مراجعة 0028 DN4: حركة FR أقرّها جرد معتمد لمادّتها بمخزنها بيومها أو بعده (شرط private.check_move_not_counted الذي يرفض به apply_move
    -- عكسها): reopen_flock يرفض count_superseded.
    when exists (select 1 from public.flock_returns y
        join public.stock_moves m on m.org_id = y.org_id and m.doc_kind = 'flock_return' and m.doc_id = y.id and m.reverses_move_id is null and m.qty <> 0
        join public.stock_counts c on c.org_id = m.org_id and c.warehouse_id = m.warehouse_id and c.status = 'approved' and c.counted_on >= m.moved_on
        join public.stock_count_lines n on n.org_id = c.org_id and n.doc_id = c.id and n.item_id = m.item_id and n.snapshot_seq >= m.seq
        where y.org_id = x.org_id and y.close_id = x.id and y.status = 'posted')
      then 'count_superseded'
  end
$$;

-- ٤) المساعدان اللذان لا يقرؤهما أيّ جسم بعد، ثمّ الأعمدة (قيودها ومنح عمود القاعة يسقطان معها)، ثمّ مساعدات القيود.
drop function if exists private.flock_parts_check(public.flocks);
drop function if exists private.flock_parts_input(public.flocks, integer, integer[]);
alter table public.flock_daily drop column if exists dead_parts;
alter table public.flock_visits drop column if exists dead_parts;
alter table public.flocks drop column if exists section_counts;
alter table public.halls drop column if exists sections;
drop function if exists private.parts_even(integer, integer);
drop function if exists private.parts_add(integer[]);
drop function if exists private.parts_sum(integer[]);
drop function if exists private.parts_valid(integer[]);
