-- rollback_0035 — تراجع «القاعة كالورقة» (0035_hall_sheet؛ مشغّل التراجع بالحزمة FOUNDATION ٨٢٠، ٨٧٦): يرجّع save_flock_visit وsave_flock_day كما في 0032،
--   وrecord_flock_weight كما في 0012، وreport_days وreport_day وhalls_day_totals وflock_cycle_report وflock_month وedit_flock وflock_activity_after كما في 0029،
--   وhalls_history كما في 0031، حرفاً بحرف (md5 نفسه بالكتالوج)؛ ويُسقط set_flock_gas وsend_flock_feed وdecide_flock_reject وhall_sheet وday_balance_sections
--   وverify_hall_sheet والمساعدات (issue_day وflock_day_check وflock_gas_json وhall_feed_kg وfeed_send_result)، وجدول flock_day_gas (بسياسته ومحفّزه وفهرسه)،
--   وعمود flock_issues.for_day وقيده. والمركون المحسوم (decision) يبقى: أعمدته من 0012.
-- **طريق رفض (الكتلة الأولى أدناه):** ما لا يحمله النموذج القديم يوقف التراجع بصوت بلا أن يغيّر شيئاً، بفرع لكلّ حقيقة مستقلّة: صفّ غاز (ولو مُسح عدده: الصفّ
--   يحمل نسخة رآها جهاز)، وصرف يومه في القاعة قبل تاريخ خروجه (العلف المرسل ليوم فات: بعد التراجع يظهر يوم خروجه)، وغاز مركون ينتظر قراراً (عملية لا يعرفها
--   النموذج القديم). والصرف بيومه نفسه (for_day = issued_on) لا يفقد شيئاً بإسقاط العمود.
-- تنعاد بأمان: الكتلة الأولى تخرج إن لم يبقَ الجدول، وcreate or replace، وdrop if exists، وكتلة do تفحص الكتالوج قبل القيد.

set lock_timeout = '5s';

-- ٠) طريق الرفض. الجداول تُقفل قبل العدّ ولحدّ نهاية المعاملة (درس WP4): كتابة بلحظة التراجع تنتظر أو تُعدّ.
do $$
declare
  v_gas bigint;
  v_late bigint;
  v_parked bigint;
begin
  if to_regclass('public.flock_day_gas') is null then
    return;
  end if;
  execute 'lock table public.flock_day_gas, public.flock_issues, public.flock_day_rejects in access exclusive mode';
  execute 'select count(*) from public.flock_day_gas' into v_gas;
  execute 'select count(*) from public.flock_issues x where x.for_day is not null and x.for_day <> x.issued_on' into v_late;
  execute 'select count(*) from public.flock_day_rejects r where r.payload ? ''gas''' into v_parked;
  if v_gas > 0 then
    raise exception 'rollback_blocked' using hint = format('توجد %s خانة غاز سُجّلت بعد الهجرة، والتراجع يمسحها. لا تراجع لـ0035 بعد استعمالها.', v_gas);
  end if;
  if v_late > 0 then
    raise exception 'rollback_blocked' using hint = format('يوجد %s صرف علف ليوم فات في القاعة، والتراجع ينقله إلى يوم خروجه من المخزن. لا تراجع لـ0035 بعد استعمالها.', v_late);
  end if;
  if v_parked > 0 then
    raise exception 'rollback_blocked' using hint = format('توجد %s عملية غاز مركونة، والتراجع لا يعرفها. لا تراجع لـ0035 بعد استعمالها.', v_parked);
  end if;
end
$$;

-- ١) الأجسام القديمة حرفاً.
create or replace function public.save_flock_visit(p_visit uuid, p_flock uuid, p_date date, p_recorded_at timestamptz,
  p_dead integer, p_culled integer, p_feed_kg numeric, p_eggs_total integer, p_eggs_cracked integer, p_eggs_broken integer,
  p_note text, p_base_version integer, p_void boolean, p_client_ref uuid, p_queued boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'save_flock_visit';
  v_cached jsonb;
  v_today date := public.app_today();
  v_lock date;
  v_park text;
  v_queued boolean := coalesce(p_queued, false);
  v_void boolean := coalesce(p_void, false);
  v_note text := private.note_text(p_note);
  v_payload jsonb;
  f public.flocks;
  v public.flock_visits;
  d public.flock_daily;
begin
  v_payload := jsonb_build_object('visit', p_visit, 'recorded_at', p_recorded_at, 'dead', p_dead, 'culled', p_culled, 'feed_kg', p_feed_kg::text,
    'eggs_total', p_eggs_total, 'eggs_cracked', p_eggs_cracked, 'eggs_broken', p_eggs_broken, 'note', p_note, 'base_version', p_base_version,
    'void', v_void);
  v_cached := private.ref_claim(v_fn, p_client_ref, v_payload || jsonb_build_object('flock', p_flock, 'date', p_date, 'queued', v_queued));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.require('flock_day.save');
  if p_visit is null then
    raise exception 'visit_required' using hint = 'تعذّر الحفظ دون معرّف الزيارة. حدّث الشاشة وأعد التسجيل.';
  end if;
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
    raise exception 'date_in_future' using hint = format('التاريخ %s بعد تاريخ اليوم %s. الزيارة تُسجَّل لليوم أو لما قبله.', to_char(p_date, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY'));
  end if;
  select l.locked_through into v_lock from public.period_locks l where l.org_id = f.org_id;
  -- الأربعة التي تتغيّر والعملية بالطابور: بنداء مباشر ترمي، ومن الطابور (queued) تُركن وترجع parked.
  if f.status = 'closed' then
    if not v_queued then
      raise exception 'flock_closed' using hint = 'الفوج مغلق، فلا تُسجَّل عليه زيارة.';
    end if;
    v_park := 'flock_closed';
  elsif not public.in_scope_site(f.site_id) then
    if not v_queued then
      raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
    end if;
    v_park := 'out_of_scope';
  elsif p_date < v_today - 7 then
    if not v_queued then
      raise exception 'date_too_old' using hint = format('لا تُقبل زيارة أقدم من 7 أيام؛ أقدم تاريخ مسموح به %s.', to_char(v_today - 7, 'DD/MM/YYYY'));
    end if;
    v_park := 'date_too_old';
  elsif v_lock is not null and p_date <= v_lock then
    if not v_queued then
      raise exception 'period_locked' using hint = format('الحسابات مقفلة حتى %s (هذا اليوم وما قبله)، فلا تُسجَّل زيارة بتاريخ %s. إن كان التاريخ صحيحاً فاطلب من مالك المنشأة فتح الفترة.',
        to_char(v_lock, 'DD/MM/YYYY'), to_char(p_date, 'DD/MM/YYYY'));
    end if;
    v_park := 'period_locked';
  end if;
  if v_park is not null then
    insert into public.flock_day_rejects (org_id, flock_id, hall_id, site_id, division_id, on_date, client_ref, payload, reason, created_by, visit_id)
    values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_date, p_client_ref, v_payload, v_park, auth.uid(), p_visit)
    on conflict (org_id, visit_id) where visit_id is not null do update
      set client_ref = excluded.client_ref, payload = excluded.payload, reason = excluded.reason, created_at = now(),
          decision = null, decided_by = null, decided_at = null;
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'parked', 'reason', v_park));
  end if;
  if f.status <> 'active' then
    raise exception 'flock_not_placed' using hint = 'الفوج لم يُسكَّن بعد، فلا تُسجَّل عليه زيارة.';
  end if;
  if p_date < f.placed_on then
    raise exception 'before_placement' using hint = format('التاريخ %s قبل تسكين الفوج في %s.', to_char(p_date, 'DD/MM/YYYY'), to_char(f.placed_on, 'DD/MM/YYYY'));
  end if;

  -- الزيارة بمعرّفها بعد قفل صفّ فوجها (كلّ كاتب لزيارات الفوج يأخذه أوّلاً).
  select * into v from public.flock_visits x where x.org_id = f.org_id and x.id = p_visit;
  if v.id is not null and (v.flock_id <> f.id or v.on_date <> p_date) then
    raise exception 'visit_moved' using hint = 'هذه الزيارة مسجّلة لقاعة أخرى أو ليوم آخر. حدّث الشاشة ثمّ أعد التسجيل.';
  end if;
  if v_void then
    -- الإلغاء: إلغاء الملغاة إعادة آمنة بلا كتابة، وغير ذلك بشرط النسخة.
    if v.id is not null and v.voided_at is not null then
      select * into d from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_date;
      return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'visit', private.flock_visit_json(v), 'day', private.flock_day_json(d)));
    end if;
    if v.id is null or v.version is distinct from p_base_version then
      return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'stale_visit', 'server', private.flock_visit_json(v)));
    end if;
  elsif p_base_version is null then
    -- الإضافة بمعرّف مسجَّل (مرجع جديد): بالمحتوى نفسه وحيّة = حُفظت، وغير ذلك stale_visit.
    if v.id is not null then
      if v.voided_at is null and (v.dead, v.culled, v.feed_kg, v.eggs_total, v.eggs_cracked, v.eggs_broken, v.note)
         is not distinct from (coalesce(p_dead, 0), coalesce(p_culled, 0), p_feed_kg, p_eggs_total, p_eggs_cracked, p_eggs_broken, v_note) then
        select * into d from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_date;
        return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'visit', private.flock_visit_json(v), 'day', private.flock_day_json(d)));
      end if;
      return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'stale_visit', 'server', private.flock_visit_json(v)));
    end if;
  elsif v.id is null or v.voided_at is not null or v.version is distinct from p_base_version then
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'stale_visit', 'server', private.flock_visit_json(v)));
  end if;

  if not v_void then
    if p_dead < 0 or p_dead > 10000000 then
      raise exception 'bad_value' using hint = 'النافق عدد صحيح من صفر إلى 10,000,000.';
    end if;
    if p_culled < 0 or p_culled > 10000000 then
      raise exception 'bad_value' using hint = 'المستبعد عدد صحيح من صفر إلى 10,000,000.';
    end if;
    if p_feed_kg is not null and not (abs(p_feed_kg) < 'Infinity' and p_feed_kg >= 0 and p_feed_kg < 1000000000 and p_feed_kg = round(p_feed_kg, 3)) then
      raise exception 'bad_value' using hint = 'العلف بالكيلوغرام من صفر فأكثر، بثلاث مراتب عشرية على الأكثر.';
    end if;
    if p_eggs_total < 0 or p_eggs_cracked < 0 or p_eggs_broken < 0
       or p_eggs_total > 10000000 or p_eggs_cracked > 10000000 or p_eggs_broken > 10000000 then
      raise exception 'bad_value' using hint = 'أعداد البيض أعداد صحيحة من صفر إلى 10,000,000.';
    end if;
    if length(v_note) > 500 then
      raise exception 'bad_note' using hint = 'الملاحظة لا تزيد على 500 حرف.';
    end if;
    if f.kind = 'broiler' and (p_eggs_total is not null or p_eggs_cracked is not null or p_eggs_broken is not null) then
      raise exception 'eggs_on_broiler' using hint = 'فوج اللحم لا بيض له؛ البيض لأفواج البيّاض فقط.';
    end if;
    if (p_eggs_cracked is not null or p_eggs_broken is not null) and p_eggs_total is null then
      raise exception 'eggs_need_total' using hint = 'اكتب بيض الزيارة كلّه قبل المكسور والمشعور.';
    end if;
    if coalesce(p_eggs_cracked, 0) + coalesce(p_eggs_broken, 0) > coalesce(p_eggs_total, 0) then
      raise exception 'eggs_over_total' using hint = format('المكسور والمشعور (%s) أكثر من بيض الزيارة كلّه (%s). راجع الأرقام.',
        to_char(coalesce(p_eggs_cracked, 0) + coalesce(p_eggs_broken, 0), 'FM999,999,999,990'), to_char(p_eggs_total, 'FM999,999,999,990'));
    end if;
    if p_base_version is null and (p_recorded_at is null or not isfinite(p_recorded_at) or p_recorded_at > now() + interval '10 minutes') then
      raise exception 'bad_time' using hint = 'وقت الزيارة غير صالح: ساعة الجهاز متقدّمة على الخادم. صحّح ساعة الهاتف ثمّ أعد التسجيل.';
    end if;
    if p_dead is null and p_culled is null and p_feed_kg is null and p_eggs_total is null and p_eggs_cracked is null and p_eggs_broken is null
       and v_note is null then
      raise exception 'empty_visit' using hint = 'اكتب رقماً واحداً على الأقلّ قبل حفظ الزيارة، أو ألغِ الزيارة.';
    end if;
  end if;

  if v_void then
    update public.flock_visits x set voided_at = now(), voided_by = auth.uid(), version = x.version + 1, updated_at = now(), updated_by = auth.uid()
    where x.org_id = v.org_id and x.id = v.id
    returning * into v;
  elsif v.id is null then
    insert into public.flock_visits (id, org_id, flock_id, hall_id, site_id, division_id, on_date, recorded_at, dead, culled, feed_kg,
      eggs_total, eggs_cracked, eggs_broken, note, source, version)
    values (p_visit, f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_date, p_recorded_at, coalesce(p_dead, 0), coalesce(p_culled, 0), p_feed_kg,
      p_eggs_total, p_eggs_cracked, p_eggs_broken, v_note, 'visit', 1)
    returning * into v;
  elsif (v.dead, v.culled, v.feed_kg, v.eggs_total, v.eggs_cracked, v.eggs_broken, v.note)
        is not distinct from (coalesce(p_dead, 0), coalesce(p_culled, 0), p_feed_kg, p_eggs_total, p_eggs_cracked, p_eggs_broken, v_note) then
    -- التعديل بالمحتوى نفسه: حُفظ بلا كتابة (ولا تكبر النسخة).
    select * into d from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_date;
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'visit', private.flock_visit_json(v), 'day', private.flock_day_json(d)));
  else
    update public.flock_visits x
    set dead = coalesce(p_dead, 0), culled = coalesce(p_culled, 0), feed_kg = p_feed_kg, eggs_total = p_eggs_total, eggs_cracked = p_eggs_cracked,
        eggs_broken = p_eggs_broken, note = v_note, version = x.version + 1, updated_at = now(), updated_by = auth.uid()
    where x.org_id = v.org_id and x.id = v.id
    returning * into v;
  end if;

  -- مجموع اليوم من زياراته الحيّة، ثمّ الأيّام على المجموع: البيض لا يزيد على الحيّ أوّل اليوم (هذا اليوم وما بعده)، والحيّ لا يصير سالباً في أيّ يوم.
  d := private.flock_day_rebuild(f, p_date);
  perform private.flock_eggs_live_check(f, p_date);
  perform private.flock_live_check(f);
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'visit', private.flock_visit_json(v), 'day', private.flock_day_json(d)));
end
$$;

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
  -- الأربعة اللي تتغيّر والعملية بالطابور: بنداء مباشر ترمي، ومن الطابور (queued) تنركن وترجع parked.
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
  elsif p_date < v_today - 7 then
    if not v_queued then
      raise exception 'date_too_old' using hint = format('لا تُقبل جولة أقدم من 7 أيام؛ أقدم تاريخ مسموح به %s.', to_char(v_today - 7, 'DD/MM/YYYY'));
    end if;
    v_park := 'date_too_old';
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
          decision = null, decided_by = null, decided_at = null;
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
  if d.id is not null and (n.dead, n.culled, n.feed_kg, n.water_l, n.temp_min, n.temp_max, n.eggs_total, n.eggs_cracked, n.eggs_broken, n.note)
     is not distinct from (d.dead, d.culled, d.feed_kg, d.water_l, d.temp_min, d.temp_max, d.eggs_total, d.eggs_cracked, d.eggs_broken, d.note) then
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
  -- المدموج، ثمّ يُعاد بناء صفّ اليوم منها (نسخته السابقة + 1، أو مجموع نسخ زيارات يومه لصفّ جديد).
  update public.flock_visits x set voided_at = now(), voided_by = auth.uid(), version = x.version + 1, updated_at = now(), updated_by = auth.uid()
  where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_date and x.voided_at is null;
  insert into public.flock_visits (org_id, flock_id, hall_id, site_id, division_id, on_date, recorded_at, dead, culled, feed_kg, water_l, temp_min, temp_max,
    eggs_total, eggs_cracked, eggs_broken, note, source, version)
  values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_date, now(), n.dead, n.culled, n.feed_kg, n.water_l, n.temp_min, n.temp_max,
    n.eggs_total, n.eggs_cracked, n.eggs_broken, n.note, 'day_total', 1);
  n := private.flock_day_rebuild(f, p_date);
  -- 0028: الحيّ لا يصير سالباً في أيّ يوم (المباع وفرق العدّ بتاريخهما)، والرفض لا يُبقي شيئاً.
  perform private.flock_live_check(f);
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'version', n.version));
end
$$;

create or replace function public.record_flock_weight(p_flock uuid, p_date date, p_sample_count integer, p_avg_g numeric, p_client_ref uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'record_flock_weight';
  v_cached jsonb;
  f public.flocks;
  v_version int;
begin
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('flock', p_flock, 'date', p_date, 'sample', p_sample_count, 'avg_g', p_avg_g::text));
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
  if not public.in_scope_site(f.site_id) then
    raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  if f.status = 'closed' then
    raise exception 'flock_closed' using hint = 'الفوج مغلق، فلا يُسجَّل له وزن.';
  end if;
  if f.status <> 'active' then
    raise exception 'flock_not_placed' using hint = 'الفوج لم يُسكَّن بعد، فلا يُسجَّل له وزن.';
  end if;
  perform private.check_doc_date(p_date);
  if p_date < f.placed_on then
    raise exception 'before_placement' using hint = format('التاريخ %s قبل تسكين الفوج في %s.', to_char(p_date, 'DD/MM/YYYY'), to_char(f.placed_on, 'DD/MM/YYYY'));
  end if;
  if p_sample_count is null or p_sample_count < 1 or p_sample_count > 100000 then
    raise exception 'bad_sample' using hint = 'عدد طيور العيّنة عدد صحيح من 1 إلى 100,000.';
  end if;
  -- حدّ فيزيائي أدنى (القاعدة ٢٨): الفرخ بعمر يوم بحدود 40 غراماً، و1.8 (كيلوغرام انكتب بخانة الغرامات) كان يطلّع FCR معقول الشكل وغلطاً.
  if p_avg_g is null or not (abs(p_avg_g) < 'Infinity' and p_avg_g >= 20 and p_avg_g <= 20000 and p_avg_g = round(p_avg_g, 1)) then
    raise exception 'bad_weight' using hint = 'معدّل وزن الطير بالغرام من 20 إلى 20,000، بمرتبة عشرية واحدة على الأكثر؛ اكتبه بالغرام لا بالكيلوغرام (1.8 كغم = 1,800 غم).';
  end if;
  insert into public.flock_weights (org_id, flock_id, hall_id, site_id, division_id, on_date, sample_count, avg_g, last_ref)
  values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_date, p_sample_count, p_avg_g, p_client_ref)
  on conflict (org_id, flock_id, on_date) do update
    set sample_count = excluded.sample_count, avg_g = excluded.avg_g, version = public.flock_weights.version + 1,
        last_ref = excluded.last_ref, updated_at = now()
  returning version into v_version;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'version', v_version));
end
$$;

create or replace function private.report_days(f public.flocks, p_through date)
returns table (on_date date, age int, day_no int, has_round boolean, live_start bigint, dead int, culled int, live_end bigint,
  dead_cum bigint, culled_cum bigint, mortality_cum_pct text, feed_kg numeric, feed_cum_kg numeric, feed_days int, feed_span int,
  given_kg numeric, given_unweighed int, given_cum_kg numeric, given_cum_unweighed int, weight_count int, weight_avg_g numeric, last_weight_on date,
  last_weight_avg_g numeric, fcr numeric, eggs_total int, eggs_broken int, eggs_cracked int, hdep text, note text)
language sql stable security definer set search_path = public, pg_temp as $$
  with g as (
    select f.placed_on + s.n as d from generate_series(0, p_through - f.placed_on) as s(n)
  ), given as (
    select x.issued_on as d, sum(m.kg) as kg, count(*) filter (where m.kg is null) as unweighed
    from public.flock_issues x
    join public.flock_issue_lines l on l.org_id = x.org_id and l.issue_id = x.id
    cross join lateral (select private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg) as kg) as m
    where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted' and l.cost_kind = 'feed' and x.issued_on <= p_through
    group by x.issued_on
  ), y as (
    select g.d, r.id is not null as has_round, r.dead, r.culled, r.feed_kg, r.eggs_total, r.eggs_broken, r.eggs_cracked, r.note,
      w.sample_count, w.avg_g, coalesce(i.kg, 0) + e.carry_in_kg as given_kg, coalesce(i.unweighed, 0) + e.carry_in_unweighed as given_unweighed,
      e.sold, e.adjust, e.sold_cum_kg
    from g
    join private.report_days_extra(f, p_through) as e on e.on_date = g.d
    left join public.flock_daily r on r.org_id = f.org_id and r.flock_id = f.id and r.on_date = g.d
    left join public.flock_weights w on w.org_id = f.org_id and w.flock_id = f.id and w.on_date = g.d
    left join given i on i.d = g.d
  ), z as (
    select y.*,
      f.placed_count - coalesce(sum(coalesce(y.dead, 0) + coalesce(y.culled, 0) + y.sold - y.adjust)
        over (order by y.d rows between unbounded preceding and 1 preceding), 0) as live_start,
      sum(coalesce(y.dead, 0)) over c as dead_cum,
      sum(coalesce(y.culled, 0)) over c as culled_cum,
      round(coalesce(sum(y.feed_kg) over c, 0), 3) as feed_cum_kg,
      max(y.d) filter (where y.feed_kg is not null) over c as last_feed,
      sum(y.given_kg) over c as given_cum_kg,
      sum(y.given_unweighed) over c as given_cum_unweighed,
      max(y.d) filter (where y.avg_g is not null) over c as last_weight_on
    from y
    window c as (order by y.d rows unbounded preceding)
  ), a as (
    -- 0028 (مراجعة O7): يوم بدأ بلا طير حيّ (بعد بيع الكلّ) لا جولة ولا علف ينتظره: أيّام العلف اللازمة = أيّام الحيّ أوّلها من التسكين حتى أمس (أو
    -- اليوم إن سُجّل علفه). وإعادة مراجعة 0028 DN2: وأيّام العلف المسجّلة تعدّ الأيّام نفسها (أيّام الحيّ)، فجولة بعلف صفر سُجّلت يوماً كان فيه طير
    -- حيّ قبل أن تُرحَّل فاتورة التذكرة (والطيور تخرج بيوم التذكرة) لا تُسقط معامل التحويل. وبلا بيع ولا عدّ كما كانت حرفاً بحرف (كلّ يوم حيّ).
    select z.*, count(*) filter (where z.live_start > 0) over k as alive_cum,
      count(*) filter (where z.live_start > 0 and z.feed_kg is not null) over k as feed_days
    from z
    window k as (order by z.d rows unbounded preceding)
  ), v as (
    select a.*, a.live_start - coalesce(a.dead, 0) - coalesce(a.culled, 0) - a.sold + a.adjust as live_end,
      case when a.last_feed = a.d then a.alive_cum else a.alive_cum - (a.live_start > 0)::int end as feed_span,
      lw.avg_g as last_weight_avg_g
    from a
    left join public.flock_weights lw on lw.org_id = f.org_id and lw.flock_id = f.id and lw.on_date = a.last_weight_on
  ), u as (
    select v.*, case when v.live_end > 0 and v.last_weight_avg_g is not null then v.live_end * v.last_weight_avg_g else 0 end + v.sold_cum_kg * 1000 as den
    from v
  )
  select u.d, (u.d - f.placed_on + f.age_days_at_placement)::int, (u.d - f.placed_on + 1)::int, u.has_round, u.live_start::bigint, u.dead, u.culled,
    u.live_end::bigint, u.dead_cum::bigint, u.culled_cum::bigint, private.flock_pct(u.dead_cum + u.culled_cum, f.placed_count), u.feed_kg, u.feed_cum_kg,
    u.feed_days::int, u.feed_span::int, u.given_kg, u.given_unweighed::int, u.given_cum_kg, u.given_cum_unweighed::int, u.sample_count, u.avg_g,
    u.last_weight_on, u.last_weight_avg_g,
    case when u.feed_days > 0 and u.feed_days = u.feed_span and u.feed_cum_kg > 0 and u.den > 0 and (u.live_end <= 0 or u.last_weight_avg_g is not null)
      then private._mul_div_round(u.feed_cum_kg, 1000, u.den, 3) end,
    u.eggs_total, u.eggs_broken, u.eggs_cracked,
    case when f.kind = 'layer' then private.flock_pct(u.eggs_total, u.live_start) end,
    u.note
  from u
  order by u.d
$$;

create or replace function private.report_day(f public.flocks, p_on date, p_today date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', f.id, 'kind', f.kind, 'status', f.status, 'placed_on', f.placed_on, 'placed_count', f.placed_count, 'age0', f.age_days_at_placement,
    'closed_on', f.closed_on, 'age', r.age, 'day_no', r.day_no, 'round', r.has_round,
    'live_start', r.live_start, 'dead', r.dead, 'culled', r.culled, 'live_end', r.live_end,
    'dead_cum', r.dead_cum, 'culled_cum', r.culled_cum, 'mortality_cum_pct', r.mortality_cum_pct,
    'feed_eaten_kg', round(r.feed_kg, 3)::text, 'feed_eaten_cum_kg', r.feed_cum_kg::text, 'feed_days', r.feed_days, 'feed_span', r.feed_span,
    'feed_given_kg', r.given_kg::text, 'feed_given_unweighed', r.given_unweighed, 'feed_given_cum_kg', r.given_cum_kg::text,
    'feed_given_cum_unweighed', r.given_cum_unweighed, 'feed_left_kg', (r.given_cum_kg - e.out_cum_kg - r.feed_cum_kg)::text,
    'weight', case when r.weight_avg_g is not null then jsonb_build_object('sample_count', r.weight_count, 'avg_g', round(r.weight_avg_g, 1)::text) end,
    'last_weight', case when r.last_weight_on is not null then jsonb_build_object('on_date', r.last_weight_on,
      'age', r.last_weight_on - f.placed_on + f.age_days_at_placement, 'avg_g', round(r.last_weight_avg_g, 1)::text) end,
    'fcr', r.fcr::text,
    'eggs_total', case when f.kind = 'layer' then r.eggs_total end,
    'eggs_broken', case when f.kind = 'layer' then r.eggs_broken end,
    'eggs_cracked', case when f.kind = 'layer' then r.eggs_cracked end,
    'hdep', r.hdep, 'note', r.note,
    'sold', e.sold, 'sold_net_kg', round(e.sold_kg, 3)::text, 'count_diff', e.adjust,
    'ticketed', (select coalesce(sum(s.birds), 0)::int from public.weigh_ticket_stops s
      join public.weigh_tickets t on t.org_id = s.org_id and t.id = s.ticket_id
      where s.org_id = f.org_id and s.flock_id = f.id and t.on_date = p_on and t.status <> 'void'
        and not exists (select 1 from public.bird_sales b where b.org_id = t.org_id and b.ticket_id = t.id and b.status = 'posted')),
    'feed_carry_in_kg', e.carry_in_kg::text, 'feed_out_kg', e.out_kg::text, 'feed_out_unweighed', e.out_unweighed,
    'feed_out_cum_unweighed', e.out_cum_unweighed,
    -- مراجعة 0028 O2/M5: ما في القاعة فعلاً بتعريفه الواحد (private.hall_left: النازل والمنقول إليها − الراجع والمنقول منها والمحسوب مستهلَكاً عند
    -- الإغلاق − المأكول، وصفر يوم الإغلاق)، وعدّ سطوره بلا كتلة؛ وO7: يوم بدأ بلا طير حيّ لا جولة تنتظره؛ وO3: فروق العدّ في اليوم بسببها ومصدرها.
    'left_in_hall_kg', lh.kg::text,
    'left_in_hall_unweighed', lh.unweighed,
    'expects_round', r.live_start > 0,
    'count_diffs', coalesce((select jsonb_agg(jsonb_build_object('birds', c.birds, 'reason', c.reason,
        'source', case when c.doc_kind = 'flock_close' then 'close' else 'manual' end) order by c.created_at, c.id)
      from public.flock_counts c
      where c.org_id = f.org_id and c.flock_id = f.id and c.kind = 'count_adjust' and c.on_date = p_on and c.reverses_id is null
        and not exists (select 1 from public.flock_counts q where q.org_id = c.org_id and q.reverses_id = c.id)), '[]'::jsonb),
    'issues', coalesce((select jsonb_agg(jsonb_build_object('issue_id', x.id, 'doc_no', x.doc_no, 'item_id', l.item_id, 'name', i.name, 'cost_kind', l.cost_kind,
        'qty', l.qty_base::text, 'base_unit', l.base_unit, 'kg', private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)::text)
        order by x.posted_at, x.doc_no collate "C", l.line_no)
      from public.flock_issues x
      join public.flock_issue_lines l on l.org_id = x.org_id and l.issue_id = x.id
      join public.items i on i.org_id = l.org_id and i.id = l.item_id
      where x.org_id = f.org_id and x.flock_id = f.id and x.issued_on = p_on and x.status = 'posted'
        and not exists (select 1 from public.flock_vaccinations m where m.org_id = x.org_id and m.issue_id = x.id and m.status = 'done')), '[]'::jsonb),
    'logs', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'dose', o.dose) order by o.created_at, o.id)
      from public.flock_logs o where o.org_id = f.org_id and o.flock_id = f.id and o.on_date = p_on), '[]'::jsonb),
    'vaccines', coalesce((select jsonb_agg(v.j order by v.age_day, v.name_key collate "C", v.vaccine_id) from (
        select m.age_day, x.name_key, x.id as vaccine_id, jsonb_build_object('vaccine_id', x.id, 'name', x.name, 'color', x.color, 'age_day', m.age_day,
          'state', 'done', 'vaccination_id', m.id, 'issue_id', m.issue_id,
          'doc_no', (select y.doc_no from public.flock_issues y where y.org_id = m.org_id and y.id = m.issue_id)) as j
        from public.flock_vaccinations m join public.vaccines x on x.org_id = m.org_id and x.id = m.vaccine_id
        where m.org_id = f.org_id and m.flock_id = f.id and m.status = 'done' and m.done_on = p_on
        union all
        select z.age_day, x.name_key, x.id, jsonb_build_object('vaccine_id', x.id, 'name', x.name, 'color', x.color, 'age_day', z.age_day,
          'state', case when z.due_on = p_today then 'today' when z.due_on < p_today then 'missed' else 'planned' end,
          'vaccination_id', null, 'issue_id', null, 'doc_no', null)
        from private.flock_slots(f.id) as z join public.vaccines x on x.org_id = f.org_id and x.id = z.vaccine_id
        where z.due_on = p_on and not exists (select 1 from public.flock_vaccinations m where m.org_id = f.org_id and m.flock_id = f.id
          and m.vaccine_id = z.vaccine_id and m.age_day = z.age_day and m.status = 'done')) as v), '[]'::jsonb))
  from private.report_days(f, p_on) as r
  join private.report_days_extra(f, p_on) as e on e.on_date = r.on_date
  cross join lateral private.hall_left(f, r.on_date, r.given_cum_kg, e.out_cum_kg, e.used_cum_kg, r.feed_cum_kg, r.given_cum_unweighed, e.out_cum_unweighed,
    e.used_cum_unweighed) as lh
  where r.on_date = p_on
$$;

create or replace function private.halls_day_totals(p_halls jsonb) returns jsonb
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object(
    'halls', count(*)::int,
    'flocks', (count(*) filter (where jsonb_typeof(e.h -> 'flock') = 'object'))::int,
    'rounds', (count(*) filter (where (e.h -> 'flock' ->> 'round')::boolean))::int,
    'live_start', coalesce(sum((e.h -> 'flock' ->> 'live_start')::bigint), 0),
    'dead', sum((e.h -> 'flock' ->> 'dead')::bigint),
    'culled', sum((e.h -> 'flock' ->> 'culled')::bigint),
    'live_end', coalesce(sum((e.h -> 'flock' ->> 'live_end')::bigint), 0),
    'feed_eaten_kg', round(sum((e.h -> 'flock' ->> 'feed_eaten_kg')::numeric), 3)::text,
    'feed_eaten_flocks', count(e.h -> 'flock' ->> 'feed_eaten_kg')::int,
    'feed_given_kg', coalesce(sum((e.h -> 'flock' ->> 'feed_given_kg')::numeric), 0)::text,
    'feed_given_unweighed', coalesce(sum((e.h -> 'flock' ->> 'feed_given_unweighed')::int), 0)::int,
    'sold', coalesce(sum((e.h -> 'flock' ->> 'sold')::bigint), 0),
    'count_diff', coalesce(sum((e.h -> 'flock' ->> 'count_diff')::bigint), 0),
    'ticketed', coalesce(sum((e.h -> 'flock' ->> 'ticketed')::bigint), 0),
    -- مراجعة 0028 O7: الأفواج التي تنتظر جولة اليوم (بدأ يومها بطيور حيّة)؛ والفوج الذي بيع كلّه قبله لا يُعدّ جولةً ناقصة.
    'rounds_expected', (count(*) filter (where (e.h -> 'flock' ->> 'expects_round')::boolean))::int)
  from jsonb_array_elements(coalesce(p_halls, '[]'::jsonb)) as e(h)
$$;

create or replace function public.flock_cycle_report(p_flock uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  f public.flocks;
  v_dead int;
  v_culled int;
  v_consumed numeric;
  v_feed jsonb;
  v_through date;
  v_more jsonb;
  v_counts bigint;
  v_sold bigint;
  v_sold_kg numeric;
  v_adjust bigint;
  v_sale_age numeric;
  v_close_id uuid;
  v_close jsonb;
  v_reason text;
  v_sales jsonb;
  v_carry_in jsonb;
begin
  perform private.require('read');
  f := private.flock_for(p_flock, false);
  if f.placed_on is null then
    raise exception 'flock_not_placed' using hint = 'هذا الفوج لم يُسكَّن بعد، فلا تقرير له.';
  end if;
  select coalesce(sum(y.dead), 0)::int, coalesce(sum(y.culled), 0)::int, coalesce(sum(y.feed_kg), 0) into v_dead, v_culled, v_consumed
  from public.flock_daily y where y.org_id = f.org_id and y.flock_id = f.id;
  -- 0028: المباع وفرق العدّ (الأصول الحيّة)، وعمر البيع موزوناً بالطيور، وسبب فرق العدّ عند الإغلاق.
  select coalesce(sum(k.sold), 0), coalesce(sum(k.sold_kg), 0), coalesce(sum(k.adjust), 0) into v_sold, v_sold_kg, v_adjust
  from private.flock_count_days(f.id) as k;
  v_counts := v_adjust - v_sold;
  select case when sum(k.sold::numeric * (k.on_date - f.placed_on + f.age_days_at_placement)) > 0
      then private._mul_div_round(sum(k.sold::numeric * (k.on_date - f.placed_on + f.age_days_at_placement)), 1, sum(k.sold), 1)
    when sum(k.sold) > 0 then 0 end
  into v_sale_age
  from private.flock_count_days(f.id) as k where k.sold > 0;
  select c.id, c.count_reason into v_close_id, v_reason from public.flock_closes c where c.org_id = f.org_id and c.flock_id = f.id and c.status = 'closed';
  with lines as (
    select x.issued_on, x.doc_no, x.posted_at, x.id, l.line_no, l.item_id, i.name, l.qty_base, l.base_unit,
      private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg) as kg, c.amount
    from public.flock_issues x
    join public.flock_issue_lines l on l.org_id = x.org_id and l.issue_id = x.id
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    left join public.flock_costs c on c.org_id = x.org_id and c.doc_kind = 'flock_issue' and c.doc_id = x.id and c.doc_line_id = l.id and c.reverses_id is null
    where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted' and l.cost_kind = 'feed'
  ), running as (
    select o.*, sum(coalesce(o.kg, 0)) over (order by o.issued_on, o.posted_at, o.doc_no collate "C", o.line_no rows unbounded preceding) as cum
    from lines o
  )
  select jsonb_build_object(
    'lines', coalesce((select jsonb_agg(jsonb_build_object('on', r.issued_on, 'doc_no', r.doc_no, 'item_name', r.name, 'qty', r.qty_base::text,
        'base_unit', r.base_unit, 'kg', r.kg::text, 'cum_kg', r.cum::text, 'money', jsonb_build_object('value', r.amount::text))
        order by r.issued_on, r.posted_at, r.doc_no collate "C", r.line_no) from running r), '[]'::jsonb),
    'by_item', coalesce((select jsonb_agg(jsonb_build_object('item_id', b.item_id, 'name', b.name, 'qty', b.qty::text, 'base_unit', b.base_unit,
        'kg', b.kg::text, 'unweighed', b.unweighed::int) order by b.first_on, b.name collate "C", b.item_id)
      from (select o.item_id, o.name, o.base_unit, sum(o.qty_base) as qty, sum(o.kg) as kg, count(*) filter (where o.kg is null) as unweighed, min(o.issued_on) as first_on
        from lines o group by o.item_id, o.name, o.base_unit) as b), '[]'::jsonb),
    'delivered_kg', (select coalesce(sum(o.kg), 0)::text from lines o),
    'consumed_kg', v_consumed::text,
    'remaining_kg', ((select coalesce(sum(o.kg), 0) from lines o) - v_consumed)::text,
    'unweighed', (select count(*)::int from lines o where o.kg is null))
  into v_feed;
  -- 0027: الأيّام والأسابيع والأوزان والمؤشّرات حتى «حتى»، من report_days مرّة واحدة (و0028: البيع والعدّ والعلف المنقول والخارج).
  v_through := coalesce(f.closed_on, v_today);
  with r as materialized (
    select d.*, e.sold, e.sold_kg, e.sold_cum, e.sold_cum_kg, e.adjust, e.adjust_cum, e.carry_in_kg, e.carry_in_cum_kg, e.out_kg, e.out_unweighed,
      e.out_cum_kg, e.out_cum_unweighed,
      -- مراجعة 0028 O2/M5: ما في القاعة بتعريفه الواحد (private.hall_left: وصفر يوم الإغلاق).
      lh.kg as left_kg, lh.unweighed as left_unweighed
    from private.report_days(f, v_through) as d join private.report_days_extra(f, v_through) as e on e.on_date = d.on_date
    cross join lateral private.hall_left(f, d.on_date, d.given_cum_kg, e.out_cum_kg, e.used_cum_kg, d.feed_cum_kg, d.given_cum_unweighed, e.out_cum_unweighed,
      e.used_cum_unweighed) as lh
  ), k as (
    select * from r where r.on_date = v_through
  ), w as (
    select greatest(1, div(r.age + 6, 7))::int as week, r.* from r
  ), wk as (
    select w.week, jsonb_build_object('week', w.week, 'from_age', min(w.age), 'to_age', max(w.age), 'from_on', min(w.on_date), 'to_on', max(w.on_date),
      'days', count(*)::int, 'round_days', (count(*) filter (where w.has_round))::int,
      -- مراجعة 0028 O7: أيّام الأسبوع التي تنتظر جولة (بدأت بطيور حيّة).
      'expected_days', (count(*) filter (where w.live_start > 0))::int,
      'dead', sum(w.dead), 'culled', sum(w.culled),
      'mortality_pct', private.flock_pct(sum(w.dead) + sum(w.culled), (array_agg(w.live_start order by w.on_date))[1]),
      'mortality_cum_pct', (array_agg(w.mortality_cum_pct order by w.on_date desc))[1],
      'live_end', (array_agg(w.live_end order by w.on_date desc))[1],
      'feed_eaten_kg', round(sum(w.feed_kg), 3)::text,
      'feed_g_per_bird_day', case
        when count(w.feed_kg) = 0 or coalesce(sum(w.live_start) filter (where w.feed_kg is not null), 0) <= 0 then null
        when sum(w.feed_kg) <= 0 then '0.0'
        else private._mul_div_round(sum(w.feed_kg), 1000, sum(w.live_start) filter (where w.feed_kg is not null), 1)::text end,
      'weight', (array_agg(jsonb_build_object('on_date', w.on_date, 'age', w.age, 'avg_g', round(w.weight_avg_g, 1)::text) order by w.on_date desc)
        filter (where w.weight_avg_g is not null))[1],
      'fcr', ((array_agg(w.fcr order by w.on_date desc))[1])::text) as j
    from w
    group by w.week
  ), m as (
    select k.*,
      case when k.given_cum_unweighed + k.out_cum_unweighed = 0 then k.given_cum_kg - k.out_cum_kg end as net_feed,
      case when v_sold > 0 then private._mul_div_round(v_sold_kg, 1, v_sold, 3) end as sold_avg
    from k
  ), fc as (
    select m.*, case when f.status = 'closed' and m.net_feed > 0 and v_sold_kg > 0 then private._mul_div_round(m.net_feed, 1, v_sold_kg, 3) end as fcr_final
    from m
  )
  select jsonb_build_object(
    'days', coalesce((select jsonb_agg(jsonb_build_object('on', r.on_date, 'age', r.age, 'day_no', r.day_no, 'round', r.has_round,
        'live_start', r.live_start, 'dead', r.dead, 'culled', r.culled, 'live_end', r.live_end, 'mortality_cum_pct', r.mortality_cum_pct,
        'feed_eaten_kg', round(r.feed_kg, 3)::text, 'feed_eaten_cum_kg', r.feed_cum_kg::text, 'feed_given_kg', r.given_kg::text,
        'feed_given_unweighed', r.given_unweighed, 'feed_given_cum_kg', r.given_cum_kg::text, 'feed_given_cum_unweighed', r.given_cum_unweighed,
        'feed_left_kg', (r.given_cum_kg - r.out_cum_kg - r.feed_cum_kg)::text,
        'weight', case when r.weight_avg_g is not null then jsonb_build_object('sample_count', r.weight_count, 'avg_g', round(r.weight_avg_g, 1)::text) end,
        'eggs_total', case when f.kind = 'layer' then r.eggs_total end, 'hdep', r.hdep, 'note', r.note,
        'sold', r.sold, 'sold_net_kg', round(r.sold_kg, 3)::text, 'sold_cum', r.sold_cum, 'sold_cum_net_kg', round(r.sold_cum_kg, 3)::text,
        'count_diff', r.adjust, 'count_diff_cum', r.adjust_cum, 'feed_carry_in_kg', r.carry_in_kg::text, 'feed_out_kg', r.out_kg::text,
        'feed_out_unweighed', r.out_unweighed, 'feed_out_cum_kg', r.out_cum_kg::text, 'feed_out_cum_unweighed', r.out_cum_unweighed,
        'left_in_hall_kg', r.left_kg::text, 'left_in_hall_unweighed', r.left_unweighed, 'expects_round', r.live_start > 0) order by r.on_date) from r),
      '[]'::jsonb),
    'weeks', coalesce((select jsonb_agg(wk.j order by wk.week) from wk), '[]'::jsonb),
    'weights', coalesce((select jsonb_agg(jsonb_build_object('on_date', x.on_date, 'age', x.on_date - f.placed_on + f.age_days_at_placement,
        'sample_count', x.sample_count, 'avg_g', round(x.avg_g, 1)::text) order by x.on_date)
      from public.flock_weights x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date between f.placed_on and v_through), '[]'::jsonb),
    'kpis', (select jsonb_build_object('days', (select count(*)::int from r), 'age_end', fc.age, 'placed', f.placed_count,
        'dead', fc.dead_cum, 'culled', fc.culled_cum, 'live', fc.live_end,
        'mortality_pct', fc.mortality_cum_pct, 'livability_pct', (100 - fc.mortality_cum_pct::numeric)::text,
        'feed_given_kg', fc.given_cum_kg::text, 'feed_eaten_kg', fc.feed_cum_kg::text, 'feed_left_kg', (fc.given_cum_kg - fc.out_cum_kg - fc.feed_cum_kg)::text,
        'feed_days', fc.feed_days, 'feed_span', fc.feed_span,
        'feed_per_bird_kg', case when fc.feed_cum_kg > 0 and f.placed_count > 0 then private._mul_div_round(fc.feed_cum_kg, 1, f.placed_count, 3)::text end,
        'last_weight', case when fc.last_weight_on is not null then jsonb_build_object('on_date', fc.last_weight_on,
          'age', fc.last_weight_on - f.placed_on + f.age_days_at_placement, 'avg_g', round(fc.last_weight_avg_g, 1)::text) end,
        'fcr', fc.fcr::text,
        'epef', case when fc.fcr > 0 and fc.last_weight_avg_g > 0 and 100 - fc.mortality_cum_pct::numeric > 0 and fc.age > 0
          then private._mul_div_round((100 - fc.mortality_cum_pct::numeric) * fc.last_weight_avg_g, 1, 10 * fc.age * fc.fcr, 0)::text end,
        'sold_birds', v_sold, 'sold_net_kg', round(v_sold_kg, 3)::text, 'sold_avg_kg', fc.sold_avg::text, 'sale_age', v_sale_age::text,
        'count_diff', v_adjust, 'feed_carry_in_kg', fc.carry_in_cum_kg::text, 'feed_out_kg', fc.out_cum_kg::text, 'feed_net_kg', fc.net_feed::text,
        'left_in_hall_kg', fc.left_kg::text, 'left_in_hall_unweighed', fc.left_unweighed,
        'fcr_final', fc.fcr_final::text,
        'epef_final', case when fc.fcr_final > 0 and fc.sold_avg > 0 and v_sale_age > 0 and 100 - fc.mortality_cum_pct::numeric > 0
          then private._mul_div_round((100 - fc.mortality_cum_pct::numeric) * fc.sold_avg * 1000, 1, 10 * v_sale_age * fc.fcr_final, 0)::text end)
      from (select 1) as one left join fc on true))
  into v_more;
  -- مراجعة 0028 O2/M5: ما في القاعة في قسم العلف أيضاً (القيمة نفسها في المؤشّرات).
  v_feed := v_feed || jsonb_build_object('left_in_hall_kg', v_more -> 'kpis' -> 'left_in_hall_kg', 'left_in_hall_unweighed', v_more -> 'kpis' -> 'left_in_hall_unweighed');
  -- 0028: التذاكر والمباع، والإغلاق القائم بلا مال (وللعلف المنقول المعلَّق مخازنه)، والعلف المنقول إليه.
  v_sales := jsonb_build_object(
    'tickets', coalesce((select jsonb_agg(jsonb_build_object('ticket_id', t.id, 'ticket_no', t.ticket_no, 'status', t.status, 'on_date', t.on_date,
        'birds', s.birds, 'net_kg', s.net_kg::text, 'avg_kg', case when s.net_kg > 0 and s.birds > 0 then private._mul_div_round(s.net_kg, 1, s.birds, 3)::text end,
        'invoiced', b.id is not null, 'doc_no', case when public.can_see_sales() then b.doc_no end) order by t.on_date, t.ticket_no collate "C", t.id)
      from public.weigh_ticket_stops s
      join public.weigh_tickets t on t.org_id = s.org_id and t.id = s.ticket_id
      left join public.bird_sales b on b.org_id = t.org_id and b.ticket_id = t.id and b.status = 'posted'
      where s.org_id = f.org_id and s.flock_id = f.id and t.status <> 'void'), '[]'::jsonb),
    'birds', v_sold, 'net_kg', round(v_sold_kg, 3)::text,
    'avg_kg', case when v_sold > 0 then private._mul_div_round(v_sold_kg, 1, v_sold, 3)::text end,
    'pending_birds', private.flock_ticketed(f.id, null));
  if v_close_id is not null then
    v_close := private.strip_money(private.flock_close_result(v_close_id));
    v_close := jsonb_set(v_close, '{lines}', coalesce((select jsonb_agg(case when e.x ->> 'carry_status' = 'pending'
        then e.x || jsonb_build_object('stores', private.flock_item_stores(f.id, (e.x ->> 'item_id')::uuid)) else e.x end order by e.n)
      from jsonb_array_elements(v_close -> 'lines') with ordinality as e(x, n)), '[]'::jsonb));
  end if;
  v_carry_in := coalesce((select jsonb_agg(jsonb_build_object('line_id', l.id, 'item_id', l.item_id, 'name', i.name, 'qty', l.qty_base::text,
      'base_unit', l.base_unit, 'kg', private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)::text, 'applied_on', l.applied_on,
      'from_flock_id', c.flock_id,
      'money', jsonb_build_object('value', (select z.amount::text from public.flock_costs z where z.org_id = l.org_id and z.doc_kind = 'flock_carry'
        and z.doc_id = l.close_id and z.doc_line_id = l.id and z.flock_id = f.id and z.reverses_id is null limit 1))) order by l.applied_on, l.line_no)
    from public.flock_close_lines l
    join public.flock_closes c on c.org_id = l.org_id and c.id = l.close_id
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where l.org_id = f.org_id and l.to_flock_id = f.id and l.carry_status = 'applied'), '[]'::jsonb);
  return private.mask(jsonb_build_object(
    'flock', private.hall_flock_json(f),
    'today', v_today,
    'through', coalesce(f.closed_on, v_today),
    'birds', jsonb_build_object('placed', f.placed_count, 'dead', v_dead, 'culled', v_culled, 'live', f.placed_count - v_dead - v_culled + v_counts,
      'mortality_pct', private.flock_pct(v_dead + v_culled, f.placed_count)::text,
      'sold', v_sold, 'sold_net_kg', round(v_sold_kg, 3)::text, 'count_diff', v_adjust, 'count_reason', v_reason),
    'feed', v_feed,
    'medicines', coalesce((select jsonb_agg(z.j order by z.on_date, z.at, z.id) from (
        select x.issued_on as on_date, x.posted_at as at, x.id, jsonb_build_object('on', x.issued_on, 'source', 'store', 'name', i.name, 'qty', l.qty_base::text,
          'base_unit', l.base_unit, 'dose', null, 'doc_no', x.doc_no) as j
        from public.flock_issues x
        join public.flock_issue_lines l on l.org_id = x.org_id and l.issue_id = x.id
        join public.items i on i.org_id = l.org_id and i.id = l.item_id
        where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted' and l.cost_kind in ('medicine', 'vaccine')
          and not exists (select 1 from public.flock_vaccinations m where m.org_id = x.org_id and m.issue_id = x.id and m.status = 'done')
        union all
        select o.on_date, o.created_at, o.id, jsonb_build_object('on', o.on_date, 'source', 'log', 'name', o.name, 'qty', null, 'base_unit', null, 'dose', o.dose, 'doc_no', null)
        from public.flock_logs o where o.org_id = f.org_id and o.flock_id = f.id) as z), '[]'::jsonb),
    'vaccines', coalesce((select jsonb_agg(jsonb_build_object('vaccine_id', v.vaccine_id, 'name', x.name, 'color', x.color, 'age_day', v.age_day,
        'due_on', f.placed_on + (v.age_day - f.age_days_at_placement),
        'state', case when m.id is not null then 'done' when f.placed_on + (v.age_day - f.age_days_at_placement) = v_today then 'today'
          when f.placed_on + (v.age_day - f.age_days_at_placement) < v_today then 'missed' else 'planned' end,
        'done_on', m.done_on, 'doc_no', (select y.doc_no from public.flock_issues y where y.org_id = m.org_id and y.id = m.issue_id))
        order by v.age_day, x.name_key collate "C", v.vaccine_id)
      from (select z.vaccine_id, z.age_day from private.flock_slots(f.id) as z
            union
            select m.vaccine_id, m.age_day from public.flock_vaccinations m where m.org_id = f.org_id and m.flock_id = f.id and m.status = 'done') as v
      join public.vaccines x on x.org_id = f.org_id and x.id = v.vaccine_id
      left join public.flock_vaccinations m on m.org_id = f.org_id and m.flock_id = f.id and m.vaccine_id = v.vaccine_id and m.age_day = v.age_day and m.status = 'done'),
      '[]'::jsonb),
    'money', (select jsonb_build_object(
        'feed', coalesce(sum(c.amount) filter (where c.kind = 'feed'), 0)::text,
        'medicine', coalesce(sum(c.amount) filter (where c.kind = 'medicine'), 0)::text,
        'vaccine', coalesce(sum(c.amount) filter (where c.kind = 'vaccine'), 0)::text,
        'other', coalesce(sum(c.amount) filter (where c.kind not in ('feed', 'medicine', 'vaccine')), 0)::text,
        'total', coalesce(sum(c.amount), 0)::text,
        'returned', (-coalesce(sum(c.amount) filter (where c.doc_kind = 'flock_return'), 0))::text,
        'carried_in', coalesce(sum(c.amount) filter (where c.doc_kind = 'flock_carry' and not exists (select 1 from public.flock_closes z
          where z.org_id = c.org_id and z.id = c.doc_id and z.flock_id = f.id)), 0)::text,
        'carried_out', (-coalesce(sum(c.amount) filter (where c.doc_kind = 'flock_carry' and exists (select 1 from public.flock_closes z
          where z.org_id = c.org_id and z.id = c.doc_id and z.flock_id = f.id)), 0))::text,
        'revenue', (select coalesce(sum(s.revenue), 0) from public.bird_sale_sources s join public.bird_sales b on b.org_id = s.org_id and b.id = s.sale_id
          where s.org_id = f.org_id and s.flock_id = f.id and b.status = 'posted')::text)
      from public.flock_costs c where c.org_id = f.org_id and c.flock_id = f.id)) || v_more
    || jsonb_build_object('sales', v_sales, 'close', v_close, 'carry_in', private.mask(v_carry_in),
      -- مراجعة 0028 O3: كلّ فرق عدّ حيّ بيومه وعدده وسببه ومصدره (يدويّ أو الإغلاق)؛ وbirds.count_reason سبب الإغلاق وحده.
      'count_diffs', coalesce((select jsonb_agg(jsonb_build_object('on', c.on_date, 'birds', c.birds, 'reason', c.reason,
          'source', case when c.doc_kind = 'flock_close' then 'close' else 'manual' end) order by c.on_date, c.created_at, c.id)
        from public.flock_counts c
        where c.org_id = f.org_id and c.flock_id = f.id and c.kind = 'count_adjust' and c.reverses_id is null
          and not exists (select 1 from public.flock_counts q where q.org_id = c.org_id and q.reverses_id = c.id)), '[]'::jsonb)));
end
$$;

create or replace function public.halls_history(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_this date := v_today - extract(day from v_today)::int + 1;
  v_month date;
  v_end date;
  v_kinds jsonb;
  v_prev boolean;
begin
  perform private.require('read');
  if p_month is not null and not isfinite(p_month) then
    raise exception 'date_required' using hint = 'اختر شهراً من التقويم.';
  end if;
  v_month := coalesce(p_month, v_today) - extract(day from coalesce(p_month, v_today))::int + 1;
  if v_month > v_this then
    raise exception 'future_month' using hint = format('شهر %s لم يأتِ بعد؛ التقرير حتى شهر اليوم %s.', to_char(v_month, 'MM/YYYY'), to_char(v_today, 'MM/YYYY'));
  end if;
  v_end := least((v_month + interval '1 month')::date - 1, v_today);
  with fl as materialized (
    select x.id, x.hall_id, x.placed_on, x.placed_count, x.closed_on, d.kind, h.name as hall_name, t.name as site_name, x as f,
      least(v_today, x.closed_on) as through
    from public.flocks x
    join public.halls h on h.org_id = x.org_id and h.id = x.hall_id
    join public.sites t on t.org_id = h.org_id and t.id = h.site_id
    join public.divisions d on d.org_id = h.org_id and d.id = h.division_id
    where x.org_id = v_org and x.placed_on is not null and x.placed_on <= v_today and public.in_scope_site(h.site_id)
  ), z as materialized (
    -- فوج كلّ (قاعة، يوم) كـhalls_day: المسكَّن فيه أو قبله ولم يُغلق قبله، الأحدث تسكيناً ثمّ المعرّف.
    select distinct on (fl.hall_id, q.on_date) fl.id, fl.hall_id, fl.kind, fl.placed_on, fl.placed_count, fl.hall_name, fl.site_name, q.*
    from fl
    cross join lateral (
      select r.on_date, r.has_round, r.live_start, r.dead, r.culled, r.live_end, r.feed_kg, r.given_kg, r.given_unweighed, r.weight_avg_g,
        r.eggs_total, r.eggs_broken, e.sold, e.sold_kg, e.adjust, e.carry_in_kg, e.carry_in_unweighed
      from private.report_days(fl.f, fl.through) as r
      join private.report_days_extra(fl.f, fl.through) as e on e.on_date = r.on_date
    ) as q
    order by fl.hall_id, q.on_date, fl.placed_on desc, fl.id
  ), ks as materialized (
    select fl.kind, min(fl.placed_on) as start, count(distinct fl.hall_id)::int as halls from fl group by fl.kind
  ), dd as materialized (
    -- يوم النوع = مجاميع halls_day لقاعاته (private.halls_day_totals): الحيّ والمباع وفرق العدّ لكلّ فوج، والنافق والمستبعد لما فيه جولة (null
    -- بلا جولة)، والمأكول لما سجّله (null بلا تسجيل)؛ والبيض للبيّاض بحيّ أوّل اليوم للأفواج التي سجّلته. والنازل من المخزن وحده: halls_day يعدّ العلف
    -- المنقول من الدورة السابقة نازلاً للفوج الجديد يوم تسكينه (0029)، وهو في السجلّ نقلٌ داخل القاعة نُزّل يوم صُرف للدورة السابقة، فجمعه في الشهر وفي
    -- «منذ البداية» يعدّه مرّتين (مراجعة 0031 M1). فالنازل هنا = نازل halls_day − المنقول إليها (carry_in_kg)، وسطوره بلا وزن كذلك.
    select ks.kind, c.d, c.d - extract(day from c.d)::int + 1 as m,
      count(z.id)::int as flocks,
      (count(*) filter (where z.has_round))::int as rounds,
      (count(*) filter (where z.live_start > 0))::int as rounds_expected,
      coalesce(sum(z.placed_count) filter (where z.placed_on = c.d), 0)::bigint as placed,
      coalesce(sum(z.live_start), 0)::bigint as live_start,
      sum(z.dead)::bigint as dead,
      sum(z.culled)::bigint as culled,
      coalesce(sum(z.sold), 0)::bigint as sold,
      coalesce(sum(z.adjust), 0)::bigint as count_diff,
      coalesce(sum(z.live_end), 0)::bigint as live_end,
      round(sum(round(z.feed_kg, 3)), 3) as feed_kg,
      round(coalesce(sum(z.given_kg - z.carry_in_kg), 0), 3) as given_kg,
      coalesce(sum(z.given_unweighed - z.carry_in_unweighed), 0)::bigint as given_unweighed,
      case when ks.kind = 'layer' then sum(z.eggs_total) end::bigint as eggs_total,
      case when ks.kind = 'layer' then sum(z.eggs_broken) end::bigint as eggs_broken,
      case when ks.kind = 'layer' then sum(z.live_start) filter (where z.eggs_total is not null) end::bigint as egg_live
    from ks
    cross join lateral generate_series(0, v_today - ks.start) as s(n)
    cross join lateral (select ks.start + s.n as d) as c
    left join z on z.kind = ks.kind and z.on_date = c.d
    group by ks.kind, ks.start, c.d
  ), mm as materialized (
    -- الشهر = مجموع أيّامه داخل [البداية، اليوم] (null يُعدّ صفراً)، والحيّ آخر آخر يوم منها، والأفواج المسكَّنة والمغلقة فيه.
    select dd.kind, dd.m, count(*)::int as days, sum(dd.placed)::bigint as placed, coalesce(sum(dd.dead), 0)::bigint as dead,
      coalesce(sum(dd.culled), 0)::bigint as culled, sum(dd.sold)::bigint as sold, sum(dd.count_diff)::bigint as count_diff,
      round(coalesce(sum(dd.feed_kg), 0), 3) as feed_kg, round(sum(dd.given_kg), 3) as given_kg, sum(dd.given_unweighed)::bigint as given_unweighed,
      case when dd.kind = 'layer' then coalesce(sum(dd.eggs_total), 0) end::bigint as eggs_total,
      case when dd.kind = 'layer' then coalesce(sum(dd.eggs_broken), 0) end::bigint as eggs_broken,
      case when dd.kind = 'layer' then sum(dd.egg_live) end::bigint as egg_live,
      (array_agg(dd.live_end order by dd.d desc))[1] as live_end,
      (select count(*) from fl where fl.kind = dd.kind and fl.placed_on - extract(day from fl.placed_on)::int + 1 = dd.m)::int as opened,
      (select count(*) from fl where fl.kind = dd.kind and fl.closed_on <= v_today
        and fl.closed_on - extract(day from fl.closed_on)::int + 1 = dd.m)::int as closed
    from dd
    group by dd.kind, dd.m
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'kind', ks.kind,
      'start', ks.start,
      'days', coalesce((select jsonb_agg(jsonb_build_object('on', dd.d, 'flocks', dd.flocks, 'rounds', dd.rounds, 'rounds_expected', dd.rounds_expected,
          'placed', dd.placed, 'live_start', dd.live_start, 'dead', dd.dead, 'culled', dd.culled, 'sold', dd.sold, 'count_diff', dd.count_diff,
          'live_end', dd.live_end, 'feed_kg', dd.feed_kg::text, 'given_kg', dd.given_kg::text, 'given_unweighed', dd.given_unweighed,
          'eggs_total', dd.eggs_total, 'eggs_broken', dd.eggs_broken, 'hdep', private.flock_pct(dd.eggs_total, dd.egg_live)) order by dd.d)
        from dd where dd.kind = ks.kind and dd.d between v_month and v_end), '[]'::jsonb),
      'months', (select jsonb_agg(jsonb_build_object('month', mm.m, 'days', mm.days, 'placed', mm.placed, 'dead', mm.dead, 'culled', mm.culled,
          'sold', mm.sold, 'count_diff', mm.count_diff, 'feed_kg', mm.feed_kg::text, 'given_kg', mm.given_kg::text, 'given_unweighed', mm.given_unweighed,
          'eggs_total', mm.eggs_total, 'eggs_broken', mm.eggs_broken, 'hdep', private.flock_pct(mm.eggs_total, mm.egg_live), 'live_end', mm.live_end,
          'opened', mm.opened, 'closed', mm.closed) order by mm.m)
        from mm where mm.kind = ks.kind),
      'total', (select jsonb_build_object('days', sum(mm.days)::int, 'placed', sum(mm.placed)::bigint, 'dead', sum(mm.dead)::bigint,
          'culled', sum(mm.culled)::bigint, 'sold', sum(mm.sold)::bigint, 'count_diff', sum(mm.count_diff)::bigint, 'feed_kg', sum(mm.feed_kg)::text,
          'given_kg', sum(mm.given_kg)::text, 'given_unweighed', sum(mm.given_unweighed)::bigint,
          'eggs_total', sum(mm.eggs_total)::bigint, 'eggs_broken', sum(mm.eggs_broken)::bigint, 'hdep', private.flock_pct(sum(mm.eggs_total), sum(mm.egg_live)),
          'live_now', (array_agg(mm.live_end order by mm.m desc))[1], 'opened', sum(mm.opened)::int, 'closed', sum(mm.closed)::int, 'halls', ks.halls)
        from mm where mm.kind = ks.kind),
      'events', coalesce((select jsonb_agg(ev.j order by ev.on_date, ev.pos, ev.hall_name collate "C", ev.site_name collate "C", ev.k collate "C") from (
          select fl.placed_on as on_date, 1 as pos, fl.hall_name, fl.site_name, fl.id::text as k,
            jsonb_build_object('on', fl.placed_on, 'type', 'placed', 'hall', fl.hall_name, 'site', fl.site_name, 'birds', fl.placed_count) as j
          from fl where fl.kind = ks.kind and fl.placed_on between v_month and v_end
          union all
          select z.on_date, 2, z.hall_name, z.site_name, z.id::text,
            jsonb_build_object('on', z.on_date, 'type', 'sold', 'hall', z.hall_name, 'site', z.site_name, 'birds', z.sold, 'kg', round(z.sold_kg, 3)::text)
          from z where z.kind = ks.kind and z.on_date between v_month and v_end and z.sold <> 0
          union all
          select z.on_date, 3, z.hall_name, z.site_name, z.id::text,
            jsonb_build_object('on', z.on_date, 'type', 'count_diff', 'hall', z.hall_name, 'site', z.site_name, 'birds', z.adjust)
          from z where z.kind = ks.kind and z.on_date between v_month and v_end and z.adjust <> 0
          union all
          select m.done_on, 4, fl.hall_name, fl.site_name, x.name_key || ':' || m.id::text,
            jsonb_build_object('on', m.done_on, 'type', 'vaccine', 'hall', fl.hall_name, 'site', fl.site_name, 'name', x.name)
          from public.flock_vaccinations m
          join fl on fl.id = m.flock_id
          join public.vaccines x on x.org_id = m.org_id and x.id = m.vaccine_id
          where m.org_id = v_org and m.status = 'done' and fl.kind = ks.kind and m.done_on between v_month and v_end
          union all
          select z.on_date, 5, z.hall_name, z.site_name, z.id::text,
            jsonb_build_object('on', z.on_date, 'type', 'weight', 'hall', z.hall_name, 'site', z.site_name, 'avg_g', round(z.weight_avg_g, 1)::text)
          from z where z.kind = ks.kind and z.on_date between v_month and v_end and z.weight_avg_g is not null
          union all
          select fl.closed_on, 6, fl.hall_name, fl.site_name, fl.id::text,
            jsonb_build_object('on', fl.closed_on, 'type', 'closed', 'hall', fl.hall_name, 'site', fl.site_name)
          from fl where fl.kind = ks.kind and fl.closed_on between v_month and v_end
        ) as ev), '[]'::jsonb))
      order by ks.kind = 'layer', ks.kind), '[]'::jsonb),
    exists (select 1 from fl where fl.placed_on < v_month)
  into v_kinds, v_prev
  from ks;
  return jsonb_build_object(
    'today', v_today,
    'month', v_month,
    'prev', coalesce(v_prev, false),
    'next', v_month < v_this,
    'kinds', v_kinds,
    'notes', coalesce((select jsonb_agg(jsonb_build_object('on', n.on_date, 'text', n.note, 'version', n.version) order by n.on_date)
      from public.halls_day_notes n where n.org_id = v_org and n.on_date between v_month and v_end and n.note <> ''), '[]'::jsonb));
end
$$;

create or replace function public.flock_month(p_flock uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  f public.flocks;
  v_head jsonb;
  v_first date;
  v_last date;
  v_end date;
  v_active boolean;
begin
  perform private.require('read');
  if p_month is null then
    raise exception 'month_required' using hint = 'اختر الشهر.';
  end if;
  f := private.flock_for(p_flock, false);
  if f.placed_on is null then
    raise exception 'flock_not_placed' using hint = 'هذا الفوج لم يُسكَّن بعد، فلا تقويم له.';
  end if;
  v_head := private.hall_flock_json(f);
  v_first := p_month - (extract(day from p_month)::int - 1);
  v_last := (v_first + interval '1 month')::date - 1;
  -- آخر يوم في حياة الفوج للتنقّل: الإغلاق، وإلّا الأبعد من اليوم ونهاية الدورة.
  v_end := coalesce(f.closed_on, greatest(v_today, (v_head ->> 'end_on')::date));
  v_active := f.status = 'active';
  return jsonb_build_object(
    'flock', v_head,
    'today', v_today,
    'month', v_first,
    'prev', v_first > f.placed_on,
    'next', v_last < v_end,
    'can', jsonb_build_object('give', v_active and (public.can('issue.post') or public.can('flock_day.save')), 'log', v_active and public.can('flock_day.save'),
      'vaccinate', v_active and public.can('flock_day.save'), 'undo_issue', v_active and public.can('void')),
    'days', (select jsonb_agg(jsonb_build_object(
        'on', g.d,
        'age', case when g.d < f.placed_on or (f.closed_on is not null and g.d > f.closed_on) then null else f.age_days_at_placement + (g.d - f.placed_on) end,
        'dead', y.dead, 'culled', y.culled, 'feed_kg', y.feed_kg::text, 'note', y.note,
        'sold', coalesce((select k.sold from private.flock_count_days(f.id) as k where k.on_date = g.d), 0),
        'count_diff', coalesce((select k.adjust from private.flock_count_days(f.id) as k where k.on_date = g.d), 0),
        'out', case when g.d = f.closed_on then coalesce((select jsonb_agg(jsonb_build_object('kind', l.action, 'doc_no', r.doc_no, 'name', i.name,
            'qty', l.qty_base::text, 'base_unit', l.base_unit, 'kg', private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)::text)
            order by l.line_no)
          from public.flock_closes c join public.flock_close_lines l on l.org_id = c.org_id and l.close_id = c.id
          join public.items i on i.org_id = l.org_id and i.id = l.item_id
          left join public.flock_returns r on r.org_id = l.org_id and r.close_line_id = l.id and r.source = 'close'
          where c.org_id = f.org_id and c.flock_id = f.id and c.status = 'closed'), '[]'::jsonb) else '[]'::jsonb end,
        'carry_in', case when g.d = f.placed_on then coalesce((select jsonb_agg(jsonb_build_object('line_id', l.id, 'name', i.name, 'qty', l.qty_base::text,
            'base_unit', l.base_unit, 'kg', private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)::text) order by l.line_no)
          from public.flock_close_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
          where l.org_id = f.org_id and l.to_flock_id = f.id and l.carry_status = 'applied'), '[]'::jsonb) else '[]'::jsonb end,
        'issues', coalesce((select jsonb_agg(jsonb_build_object('issue_id', x.id, 'doc_no', x.doc_no, 'item_id', l.item_id, 'name', i.name, 'cost_kind', l.cost_kind,
            'qty', l.qty_base::text, 'base_unit', l.base_unit, 'kg', private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)::text)
            order by x.posted_at, x.doc_no collate "C", l.line_no)
          from public.flock_issues x
          join public.flock_issue_lines l on l.org_id = x.org_id and l.issue_id = x.id
          join public.items i on i.org_id = l.org_id and i.id = l.item_id
          where x.org_id = f.org_id and x.flock_id = f.id and x.issued_on = g.d and x.status = 'posted'
            and not exists (select 1 from public.flock_vaccinations m where m.org_id = x.org_id and m.issue_id = x.id and m.status = 'done')), '[]'::jsonb),
        'logs', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'dose', o.dose) order by o.created_at, o.id)
          from public.flock_logs o where o.org_id = f.org_id and o.flock_id = f.id and o.on_date = g.d), '[]'::jsonb),
        'vaccines', coalesce((select jsonb_agg(v.j order by v.age_day, v.name_key collate "C", v.vaccine_id) from (
            select m.age_day, x.name_key, x.id as vaccine_id, jsonb_build_object('vaccine_id', x.id, 'name', x.name, 'color', x.color, 'age_day', m.age_day,
              'state', 'done', 'vaccination_id', m.id, 'issue_id', m.issue_id,
              'doc_no', (select y.doc_no from public.flock_issues y where y.org_id = m.org_id and y.id = m.issue_id)) as j
            from public.flock_vaccinations m join public.vaccines x on x.org_id = m.org_id and x.id = m.vaccine_id
            where m.org_id = f.org_id and m.flock_id = f.id and m.status = 'done' and m.done_on = g.d
            union all
            select z.age_day, x.name_key, x.id, jsonb_build_object('vaccine_id', x.id, 'name', x.name, 'color', x.color, 'age_day', z.age_day,
              'state', case when z.due_on = v_today then 'today' when z.due_on < v_today then 'missed' else 'planned' end,
              'vaccination_id', null, 'issue_id', null, 'doc_no', null)
            from private.flock_slots(f.id) as z join public.vaccines x on x.org_id = f.org_id and x.id = z.vaccine_id
            where z.due_on = g.d and not exists (select 1 from public.flock_vaccinations m where m.org_id = f.org_id and m.flock_id = f.id
              and m.vaccine_id = z.vaccine_id and m.age_day = z.age_day and m.status = 'done')) as v), '[]'::jsonb))
        order by g.d)
      from (select v_first + n as d from generate_series(0, v_last - v_first) as n) as g
      left join public.flock_daily y on y.org_id = f.org_id and y.flock_id = f.id and y.on_date = g.d),
    'totals', jsonb_build_object(
      'feed_kg', (select coalesce(sum(private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)), 0)::text
        from public.flock_issues x join public.flock_issue_lines l on l.org_id = x.org_id and l.issue_id = x.id
        where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted' and l.cost_kind = 'feed' and x.issued_on between v_first and v_last),
      'dead', (select coalesce(sum(y.dead), 0)::int from public.flock_daily y where y.org_id = f.org_id and y.flock_id = f.id and y.on_date between v_first and v_last),
      'culled', (select coalesce(sum(y.culled), 0)::int from public.flock_daily y where y.org_id = f.org_id and y.flock_id = f.id and y.on_date between v_first and v_last)));
end
$$;

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
      (select min(x.issued_on) from public.flock_issues x where x.org_id = f.org_id and x.flock_id = f.id),
      (select min(x.on_date) from public.flock_costs x where x.org_id = f.org_id and x.flock_id = f.id),
      (select min(x.on_date) from public.flock_logs x where x.org_id = f.org_id and x.flock_id = f.id),
      (select min(x.done_on) from public.flock_vaccinations x where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'done'),
      -- 0029: صفوف العدد (المباع بيوم تذكرته وفرق العدّ بيومه، وعكوسها بيوم الإلغاء بعدها) وتذاكر الوزن غير الملغاة (ولو مسوّدة).
      (select min(x.on_date) from public.flock_counts x where x.org_id = f.org_id and x.flock_id = f.id),
      (select min(t.on_date) from public.weigh_ticket_stops s join public.weigh_tickets t on t.org_id = s.org_id and t.id = s.ticket_id
        where s.org_id = f.org_id and s.flock_id = f.id and t.status <> 'void'))
    into v_first;
  if v_first is not null and p_placed_on > v_first then
    raise exception 'records_before_placement' using hint = format('للفوج سجلّ يوم %s (جولة أو صرف أو وزن أو دواء أو لقاح أو تذكرة وزن أو بيع أو فرق عدّ)، فلا يصير التسكين بعده. اختر تاريخاً في %s أو قبله.',
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

create or replace function private.flock_activity_after(f public.flocks, p_on date, out what text, out on_date date)
language sql stable security definer set search_path = public, pg_temp as $$
  select a.what, a.d from (
    select 'جولة' as what, d.on_date as d, 1 as rank from public.flock_daily d where d.org_id = f.org_id and d.flock_id = f.id
    union all
    select 'وزن عيّنة', w.on_date, 2 from public.flock_weights w where w.org_id = f.org_id and w.flock_id = f.id
    union all
    select format('الصرف %s', x.doc_no), x.issued_on, 3 from public.flock_issues x where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted'
    union all
    select 'تسجيل دواء', o.on_date, 4 from public.flock_logs o where o.org_id = f.org_id and o.flock_id = f.id
    union all
    select 'تأشير لقاح', m.done_on, 5 from public.flock_vaccinations m where m.org_id = f.org_id and m.flock_id = f.id and m.status = 'done'
    union all
    select case when c.kind = 'sold' then format('الفاتورة %s', (select b.doc_no from public.bird_sales b where b.org_id = c.org_id and b.id = c.doc_id))
        else 'فرق عدّ' end, c.on_date, 6
    from public.flock_counts c
    where c.org_id = f.org_id and c.flock_id = f.id and c.reverses_id is null
      and not exists (select 1 from public.flock_counts r where r.org_id = c.org_id and r.reverses_id = c.id)
  ) as a
  where p_on is null or a.d > p_on
  order by case when p_on is null then a.d end desc nulls last, case when p_on is not null then a.d end, a.rank
  limit 1
$$;

-- ٢) الجديد.
drop function if exists public.verify_hall_sheet();
drop function if exists public.day_balance_sections(date);
drop function if exists public.hall_sheet(uuid);
drop function if exists public.decide_flock_reject(uuid, text);
drop function if exists public.send_flock_feed(uuid, uuid, uuid, uuid, uuid, numeric, date);
drop function if exists public.set_flock_gas(uuid, date, integer, bigint, uuid, boolean);
drop function if exists private.feed_send_result(uuid);
drop function if exists private.hall_feed_kg(uuid, date);
drop function if exists private.flock_gas_json(date, public.flock_day_gas);
drop function if exists private.flock_day_check(public.flocks, date);
drop function if exists private.issue_day(public.flock_issues);
drop table if exists public.flock_day_gas;
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'flock_issues_for_day_check' and conrelid = 'public.flock_issues'::regclass) then
    alter table public.flock_issues drop constraint flock_issues_for_day_check;
  end if;
end
$$;
alter table public.flock_issues drop column if exists for_day;
