-- 0036_round_once — الجولة اليومية: الهلاكات مرّة واحدة في اليوم، والغاز يُضاف إلى مجموع اليوم، وعلف اليوم وغازه والأعلاف المتاحة في قارئ الجولة (كلمة
--   المالك 2026-11-24 بصورة الجولة وأجوبته الثلاثة؛ العقد docs/plans/0036/contract-0036.md «الجزء د»؛ DECISIONS 2026-11-24).
-- المشكلة: الجولة تكتب الهلاكات زيارةً تُضاف إلى ما قبلها (0032)، فمن يفتح الجولة مرّتين في اليوم، أو جهازان للقاعة نفسها، يضاعف هلاكات اليوم؛ والمالك
--   يريدها تُدخل مرّة واحدة ثمّ «تتضلّل». والغاز لا يُكتب إلّا مجموعاً لليوم بشرط نسخته (set_flock_gas، للورقة)، والمالك يريده في الجولة يُضاف («2 الصبح
--   + 1 العصر = 3»). وقارئ الجولة (flocks_overview) لا يعرف علف اليوم ولا غازه ولا الأعلاف التي في «رصيد العلف».
-- هنا:
--   • flock_daily.dead_entered («سُجّلت هلاكات اليوم»): يُملأ لكلّ يوم فيه نافق أو مستبعد، ويضعه كلّ كاتب يكتب هلاكات اليوم فعلاً: save_flock_day
--     وsave_flock_visit (جسماهما في 0035، والزيادة وحدها) حين يحمل النداء نافقاً أو مستبعداً ليوم بلا صفّ أو بهلاكات تغيّرت، لا حين يُركن أو يرجع stale
--     أو يُرفض أو لا يغيّر شيئاً. وprivate.flock_day_json (0012) يرجعه في كلّ صفّ يوم.
--   • public.set_flock_dead(الوجبة، اليوم، الهلاكات) (flock_day.save، بالطابور ومرجع client_ref): هلاكات اليوم مرّة واحدة. لليوم الذي سُجّلت هلاكاته:
--     القيمة نفسها saved بلا كتابة، وغيرها dead_recorded باليوم كما هو (لا يُضاف شيء إلى هلاكات مسجّلة أبداً)؛ ولغيره زيارة حيّة واحدة بالنافق وحده،
--     ثمّ يُعاد بناء اليوم ويُعلَّم، ويُفحص البيض والحيّ على الأيّام (live_negative وeggs_over_live، ولا يبقى شيء). ومن الطابور تُركن الأسباب الثلاثة التي
--     تتغيّر والعملية في الجهاز (flock_closed وout_of_scope وperiod_locked) كـset_flock_gas، بمعرّف مشتقّ من (الكاتب، الوجبة، اليوم): الأحدث يستبدل.
--   • public.add_flock_gas(الوجبة، اليوم، القناني) (flock_day.save، بالطابور ومرجع client_ref): يضيف إلى غاز اليوم (الفارغ صفر)، ومجموع اليوم بعدها
--     لا يتجاوز 1,000 قنينة؛ كلّ إضافة عملية بمعرّف مشتقّ من مرجعها، فالإضافتان من جهازين تثبتان معاً بقفل صفّ الوجبة. وset_flock_gas كما هو (تصحيح
--     مجموع اليوم من الورقة).
--   • القرّاء: private.flock_summary (0029) يزيد ليومه غاز اليوم ونسخته، وعلف اليوم بالكيلو وسطوره بالمادّة بترتيب أوّل إرسال، وآخر علف أُرسل للوجبة
--     (كما تحسبه الورقة)؛ وpublic.flocks_overview (0012) يزيد feed_items: أعلاف «رصيد العلف» المتاحة اليوم كما في الورقة بلا last. بلا مال، والمفاتيح
--     القديمة بأسمائها ومعانيها (الواجهة المنشورة تقرؤها بين التطبيق والدمج).
--   • public.verify_round_once (مفتاح الخادم): لا يوم فيه نافق أو مستبعد بلا العلامة، ولا غاز يوم فوق 1,000 قنينة.
-- قرارات بلا سؤال (داخل الخطوط الحمر والعقد):
--   • «القيمة نفسها» في set_flock_dead = هلاكات اليوم كما تعرضها الورقة (النافق والمستبعد القديم معاً)؛ ويوم بلا علامة وفيه نافق أو مستبعد (لا يكون
--     بعد الملء، والثابت يمسكه) يُعامل كالمسجَّل فلا يُضاف إليه.
--   • الزيارة في تعديلها تُرسل محتواها كاملاً، فالنافق كما كان (صفر زيارة البيض مثلاً) لا يُعدّ تسجيلاً للهلاكات؛ والإلغاء لا يسجّلها؛ وsave_flock_day
--     بالقيمة نفسها مع خانة أخرى كذلك. والعلامة تُكتب مع الكتابة نفسها بلا نسخة جديدة لصفّ اليوم.
--   • قيمة set_flock_dead وإضافة add_flock_gas تُفحصان بعد الركن كـset_flock_gas (المركون يحمل ما أرسله الجهاز)، والتاريخ قبله.
--   • علف اليوم في الملخّص سطور الصرف الحيّة بنوع كلفة «علف» بيوم القاعة (issue_day)، وكيلوه بالكتلة (فارغ بلا سطر، أو بسطور بلا كتلة)، وسطوره بوحدة
--     أساس كلّ مادّة؛ وآخر علف بنوع المادّة «علف» كالورقة.
-- تراجع: rollback_0036.sql — يرجّع save_flock_visit وsave_flock_day كما في 0035، وflock_summary كما في 0029، وflocks_overview وflock_day_json كما في 0012،
--   حرفاً بحرف، ويُسقط set_flock_dead وadd_flock_gas وverify_round_once وعمود flock_daily.dead_entered. **طريق رفض**: يوم سُجّلت هلاكاته صفراً (العلامة
--   لا يعيدها الملء)، أو هلاكات مركونة من set_flock_dead، أو غاز مضاف مركون من add_flock_gas، كلّ واحد يوقف التراجع بصوت (بيانات لا يحملها النموذج
--   القديم). والهلاكات الموجبة والغاز المضاف يحملهما النموذج القديم (زيارة ومجموع)، والملء يعيد العلامة.
-- تنعاد بأمان: add column if not exists، والملء لما لم يُعلَّم وحده، وcreate or replace، وrevoke وgrant.

set lock_timeout = '5s';

-- ─── أ. علامة «سُجّلت هلاكات اليوم» ──────────────────────────────────────────────────────────────────────────────────
-- لكلّ صفّ يوم: هل كُتبت هلاكاته. الملء: كلّ يوم فيه نافق أو مستبعد؛ والأيّام بلا هلاكات تبقى بلا علامة فتقبل الجولة هلاكاتها.
alter table public.flock_daily add column if not exists dead_entered boolean not null default false;
update public.flock_daily x set dead_entered = true where x.dead + x.culled > 0 and not x.dead_entered;

-- ─── ب. صفّ اليوم بالعلامة ────────────────────────────────────────────────────────────────────────────────────────
-- الجسم الأخير من 0012 ومعه dead_entered.
create or replace function private.flock_day_json(d public.flock_daily) returns jsonb
language sql stable set search_path = pg_catalog, pg_temp as $$
  select case when d.id is null then null else jsonb_build_object(
    'on_date', d.on_date, 'version', d.version, 'dead', d.dead, 'culled', d.culled,
    'feed_kg', d.feed_kg::text, 'water_l', d.water_l::text, 'temp_min', d.temp_min::text, 'temp_max', d.temp_max::text,
    'eggs_total', d.eggs_total, 'eggs_cracked', d.eggs_cracked, 'eggs_broken', d.eggs_broken, 'note', d.note,
    'dead_entered', d.dead_entered) end
$$;

-- ─── ج. كاتبا اليوم القائمان يضعان العلامة ──────────────────────────────────────────────────────────────────────────
-- الزيارة (الجسم الأخير من 0035) ومعها العلامة حين تكتب هلاكات اليوم.
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
  v_deaths boolean;
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
  -- الثلاثة التي تتغيّر والعملية بالطابور (0035: بلا حدّ الأيّام السبعة؛ كلّ أيّام الوجبة القائمة): بنداء مباشر ترمي، ومن الطابور (queued) تُركن وترجع parked.
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
          version = public.flock_day_rejects.version + 1, decision = null, decided_by = null, decided_at = null;
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

  -- 0036: الزيارة تكتب هلاكات اليوم حين تحمل نافقاً أو مستبعداً: إضافة بأيّهما، أو تعديل غيّرهما (التعديل يُرسل المحتوى كاملاً، فنافق الزيارة كما كان
  -- لا يُعدّ تسجيلاً)؛ والإلغاء لا يسجّلها.
  v_deaths := not v_void and (p_dead is not null or p_culled is not null)
    and (v.id is null or (v.dead, v.culled) is distinct from (coalesce(p_dead, 0), coalesce(p_culled, 0)));

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
  -- 0036: «سُجّلت هلاكات اليوم» مع الكتابة نفسها (بلا نسخة جديدة لصفّ اليوم).
  if v_deaths and d.id is not null and not d.dead_entered then
    update public.flock_daily x set dead_entered = true where x.org_id = d.org_id and x.id = d.id
    returning * into d;
  end if;
  perform private.flock_eggs_live_check(f, p_date);
  perform private.flock_live_check(f);
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'visit', private.flock_visit_json(v), 'day', private.flock_day_json(d)));
end
$$;

-- الجولة اليومية (الجسم الأخير من 0035) ومعها العلامة حين تكتب هلاكات اليوم.
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
  v_deaths boolean;
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

  -- 0036: الجولة تكتب هلاكات اليوم حين تحمل نافقاً أو مستبعداً ليوم بلا صفّ، أو هلاكات غيّرتها (القيمة نفسها مع خانة أخرى لا تُعدّ تسجيلاً).
  v_deaths := (p_dead is not null or p_culled is not null) and (d.id is null or (n.dead, n.culled) is distinct from (d.dead, d.culled));

  -- 0032: الكتابة بالزيارات («اجعل مجموع اليوم كذا»): تُلغى زيارات اليوم الحيّة كلّها (علامة، ونسخة كلّ واحدة تكبر)، وتُضاف زيارة day_total بالمجموع
  -- المدموج، ثمّ يُعاد بناء صفّ اليوم منها (نسخته السابقة + 1، أو مجموع نسخ زيارات يومه لصفّ جديد).
  update public.flock_visits x set voided_at = now(), voided_by = auth.uid(), version = x.version + 1, updated_at = now(), updated_by = auth.uid()
  where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_date and x.voided_at is null;
  insert into public.flock_visits (org_id, flock_id, hall_id, site_id, division_id, on_date, recorded_at, dead, culled, feed_kg, water_l, temp_min, temp_max,
    eggs_total, eggs_cracked, eggs_broken, note, source, version)
  values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_date, now(), n.dead, n.culled, n.feed_kg, n.water_l, n.temp_min, n.temp_max,
    n.eggs_total, n.eggs_cracked, n.eggs_broken, n.note, 'day_total', 1);
  n := private.flock_day_rebuild(f, p_date);
  -- 0036: «سُجّلت هلاكات اليوم» مع الكتابة نفسها (بلا نسخة جديدة لصفّ اليوم).
  if v_deaths and n.id is not null and not n.dead_entered then
    update public.flock_daily x set dead_entered = true where x.org_id = n.org_id and x.id = n.id
    returning * into n;
  end if;
  -- 0028: الحيّ لا يصير سالباً في أيّ يوم (المباع وفرق العدّ بتاريخهما)، والرفض لا يُبقي شيئاً.
  perform private.flock_live_check(f);
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'version', n.version));
end
$$;

-- ─── د. الهلاكات مرّة واحدة في اليوم (flock_day.save، بالطابور ومرجع client_ref) ─────────────────────────────────────────────
-- الأقفال كـset_flock_gas: الفترة للمشاركة ← صفّ الوجبة للتحديث، فكاتبان ليوم واحد يترتّبان ويرى الثاني صفّ يوم الأوّل بعد ثباته (dead_recorded، أو saved
-- بالقيمة نفسها)؛ وكلّ قراءة لليوم بعد القفل. اليوم الذي سُجّلت هلاكاته لا يُكتب فيه شيء (التصحيح من صفحة القاعة بـsave_flock_day)؛ وغيره زيارة حيّة
-- بالنافق وحده (المستبعد صفر، والباقي فارغ) ثمّ يُعاد بناء اليوم ويُعلَّم، والبيض والحيّ يُفحصان على الأيّام، وأيّ رفض يرجع المعاملة كلّها.
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

  -- اليوم الذي سُجّلت هلاكاته (ويوم فيه نافق أو مستبعد بلا علامة، احتياطاً): لا يُضاف إليه شيء.
  select * into d from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_on;
  if d.id is not null and (d.dead_entered or d.dead + d.culled > 0) then
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object(
      'status', case when d.dead + d.culled = p_dead then 'saved' else 'dead_recorded' end, 'day', private.flock_day_json(d)));
  end if;

  insert into public.flock_visits (org_id, flock_id, hall_id, site_id, division_id, on_date, recorded_at, dead, culled, source, version)
  values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_on, now(), p_dead, 0, 'visit', 1);
  d := private.flock_day_rebuild(f, p_on);
  update public.flock_daily x set dead_entered = true where x.org_id = d.org_id and x.id = d.id
  returning * into d;
  -- البيض لا يزيد على الحيّ أوّل اليوم (هذا اليوم وما بعده)، والحيّ لا يصير سالباً في أيّ يوم؛ والرفض لا يُبقي شيئاً.
  perform private.flock_eggs_live_check(f, p_on);
  perform private.flock_live_check(f);
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'day', private.flock_day_json(d)));
end
$$;

-- ─── هـ. الغاز يُضاف إلى مجموع اليوم (flock_day.save، بالطابور ومرجع client_ref) ───────────────────────────────────────────
-- كلّ إضافة عملية بمرجعها (لا شرط نسخة): الأقفال كـset_flock_gas (الفترة ← صفّ الوجبة ← صفّ الغاز)، فإضافتان من جهازين تثبتان معاً والمجموع مجموعهما.
-- الفارغ (مُسح) صفر، والصفّ لا يُحذف (درس ABA)، والنسخة تكبر بكلّ إضافة. ومن الطابور تُركن الأسباب الثلاثة كـset_flock_gas بمعرّف مشتقّ من مرجع الإضافة.
create or replace function public.add_flock_gas(p_flock uuid, p_on date, p_add integer, p_client_ref uuid, p_queued boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'add_flock_gas';
  v_cached jsonb;
  v_today date := public.app_today();
  v_queued boolean := coalesce(p_queued, false);
  v_lock date;
  v_park text;
  v_hall text;
  f public.flocks;
  g public.flock_day_gas;
begin
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('flock', p_flock, 'on', p_on, 'add', p_add, 'queued', v_queued));
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
    raise exception 'date_in_future' using hint = format('يوم %s لم يأتِ بعد؛ يُضاف الغاز لليوم %s أو لما قبله من أيّام الوجبة.', to_char(p_on, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY'));
  end if;
  -- الثلاثة التي تتغيّر والعملية بالطابور: بنداء مباشر ترمي، ومن الطابور تُركن وترجع parked (كلّ إضافة صفّ بمرجعها).
  select l.locked_through into v_lock from public.period_locks l where l.org_id = f.org_id;
  v_park := case when f.status = 'closed' then 'flock_closed' when not public.in_scope_site(f.site_id) then 'out_of_scope'
    when v_lock is not null and p_on <= v_lock then 'period_locked' end;
  if v_park is not null and v_queued then
    insert into public.flock_day_rejects (org_id, flock_id, hall_id, site_id, division_id, on_date, client_ref, payload, reason, created_by, visit_id)
    values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_on, p_client_ref, jsonb_build_object('gas_add', p_add), v_park, auth.uid(),
      md5('gasadd:' || p_client_ref::text)::uuid)
    on conflict (org_id, visit_id) where visit_id is not null do update
      set client_ref = excluded.client_ref, payload = excluded.payload, reason = excluded.reason, created_at = now(),
          version = public.flock_day_rejects.version + 1, decision = null, decided_by = null, decided_at = null;
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'parked', 'reason', v_park));
  end if;
  if v_park = 'out_of_scope' then
    raise exception 'out_of_scope' using hint = 'قاعة هذه الوجبة خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  perform private.flock_day_check(f, p_on);
  if p_add is null or p_add < 1 or p_add > 1000 then
    raise exception 'bad_value' using hint = 'اكتب عدد القناني المضافة عدداً صحيحاً من 1 إلى 1,000.';
  end if;
  select * into g from public.flock_day_gas x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_on for update;
  if coalesce(g.cylinders, 0) + p_add > 1000 then
    select h.name into v_hall from public.halls h where h.org_id = f.org_id and h.id = f.hall_id;
    raise exception 'bad_value' using hint = case
      when coalesce(g.cylinders, 0) >= 1000 then format('غاز يوم %s في «%s» بلغ الحدّ (1,000 قنينة لليوم)، فلا يُضاف إليه. إن كان المجموع خطأً فصحّحه من صفحة القاعة.',
        to_char(p_on, 'DD/MM/YYYY'), v_hall)
      else format('غاز يوم %s في «%s» %s قنينة حتى الآن، وإضافة %s تتجاوز الحدّ (1,000 قنينة لليوم). أضف %s على الأكثر، أو صحّح مجموع اليوم من صفحة القاعة.',
        to_char(p_on, 'DD/MM/YYYY'), v_hall, to_char(coalesce(g.cylinders, 0), 'FM999,990'), to_char(p_add, 'FM999,990'), to_char(1000 - coalesce(g.cylinders, 0), 'FM999,990'))
    end;
  end if;
  if g.id is null then
    insert into public.flock_day_gas (org_id, flock_id, hall_id, site_id, division_id, on_date, cylinders, version)
    values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_on, p_add, 1)
    returning * into g;
  else
    update public.flock_day_gas x set cylinders = coalesce(x.cylinders, 0) + p_add, version = x.version + 1, updated_at = now(), updated_by = auth.uid()
    where x.org_id = g.org_id and x.id = g.id
    returning * into g;
  end if;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'gas', private.flock_gas_json(p_on, g)));
end
$$;

-- ─── و. قارئا الجولة: غاز اليوم وعلفه، والأعلاف المتاحة (read؛ بلا مال) ─────────────────────────────────────────────────────
-- ملخّص الوجبة (الجسم الأخير من 0029) ومعه غاز اليوم وعلفه وآخر علف أُرسل.
create or replace function private.flock_summary(f public.flocks) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_today date := least(public.app_today(), coalesce(f.closed_on, public.app_today()));
  v_dead bigint;
  v_culled bigint;
  v_before bigint;
  v_feed numeric;
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
         coalesce(sum(x.feed_kg), 0), count(x.feed_kg)::int, max(x.on_date) filter (where x.feed_kg is not null)
    into v_dead, v_culled, v_before, v_feed, v_feed_days, v_last_feed
  from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id;
  -- 0028: المباع وفرق العدّ (الأصول الحيّة بتاريخها): الحيّ الآن وأوّل اليوم بهما.
  select coalesce(sum(k.sold), 0), coalesce(sum(k.sold_kg), 0), coalesce(sum(k.adjust), 0), coalesce(sum(k.adjust - k.sold) filter (where k.on_date < v_today), 0)
  into v_sold, v_sold_kg, v_adjust, v_counts_before
  from private.flock_count_days(f.id) as k;
  v_live := coalesce(f.placed_count, 0) - v_dead - v_culled - v_sold + v_adjust;
  v_live_start := coalesce(f.placed_count, 0) - v_before + v_counts_before;
  -- أيّام العلف اللازمة لـFCR (القاعدة ٢٨): كل يوم من التسكين لحد أمس، واليوم ويّاها إذا انسجّل علفه (جولة اليوم بس ممكن تتأخّر).
  -- لحد «آخر يوم علف» كان يعدّ الفوج كاملاً لمّا تنقطع جولات العلف، والحيّ والوزن يمشون: FCR أقلّ من الحقيقة.
  -- 0028 (مراجعة O7): بلا الأيّام التي بدأت بلا طير حيّ (بعد بيع الكلّ لا جولة ولا علف ينتظرها)، بقاعدة report_days نفسها.
  v_span := case when f.placed_on is not null then (select z.alive from private.flock_alive_days(f, greatest(coalesce(v_last_feed, f.placed_on - 1), v_today - 1)) as z) end;
  -- إعادة مراجعة 0028 DN2: أيّام العلف المسجّلة من أيّام الحيّ نفسها (جولة بعلف على يوم بدأ بلا طير حيّ لا تُعدّ)، بقاعدة report_days.
  v_feed_days := case when f.placed_on is not null then (select z.fed from private.flock_alive_days(f, v_today) as z) else 0 end;
  select * into w from public.flock_weights x where x.org_id = f.org_id and x.flock_id = f.id order by x.on_date desc limit 1;
  select * into d from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = v_today;
  -- 0028: المقام = الحيّ × آخر وزن (إن بقي حيّ ووُزن) + صافي المباع بالغرام؛ ومن بقي حيّاً بلا وزن لا معامل له. بلا بيع كما كان.
  v_den := case when v_live > 0 and w.id is not null then v_live * w.avg_g else 0 end + v_sold_kg * 1000;
  if v_feed_days > 0 and v_feed_days = v_span and v_feed > 0 and v_den > 0 and (v_live <= 0 or w.id is not null) then
    v_fcr := private._mul_div_round(v_feed, 1000, v_den, 3)::text;
  end if;
  select count(*)::int into v_rejects from public.flock_day_rejects r where r.org_id = f.org_id and r.flock_id = f.id and r.decision is null;
  -- 0036: غاز اليوم ونسخته؛ وعلف اليوم: سطور الصرف الحيّة بنوع كلفة «علف» بيوم القاعة، كيلوها بالكتلة (فارغ بلا سطر) وسطورها بالمادّة بوحدة أساسها
  -- بترتيب أوّل إرسال؛ وآخر علف أُرسل للوجبة (بنوع المادّة «علف»، كما تحسبه hall_sheet).
  select * into g from public.flock_day_gas x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = v_today;
  select round(sum(private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)), 3) into v_feed_today
  from public.flock_issues x
  join public.flock_issue_lines l on l.org_id = x.org_id and l.issue_id = x.id
  where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted' and l.cost_kind = 'feed' and private.issue_day(x) = v_today;
  select coalesce(jsonb_agg(jsonb_build_object('item_id', q.item_id, 'item_name', q.name, 'qty', round(q.qty, 3)::text, 'unit', q.base_unit)
      order by q.first_seq, q.item_id), '[]'::jsonb)
  into v_feed_list
  from (
    select o.item_id, o.base_unit, i.name, sum(o.qty_base) as qty, min(o.seq) as first_seq
    from (
      select l.item_id, l.base_unit, l.qty_base, row_number() over (order by x.posted_at, x.doc_no collate "C", l.line_no) as seq
      from public.flock_issues x
      join public.flock_issue_lines l on l.org_id = x.org_id and l.issue_id = x.id
      where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted' and l.cost_kind = 'feed' and private.issue_day(x) = v_today
    ) as o
    join public.items i on i.org_id = f.org_id and i.id = o.item_id
    group by o.item_id, o.base_unit, i.name
  ) as q;
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

-- الحقول بقاعاتها ووجباتها (الجسم الأخير من 0012) ومعها الأعلاف المتاحة للإرسال.
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

-- ─── ز. الثابت (مفتاح الخادم) ───────────────────────────────────────────────────────────────────────────────────────
-- لا يوم فيه نافق أو مستبعد بلا علامة «سُجّلت هلاكات اليوم» (فلا تضيف الجولة إلى هلاكات مسجّلة)، ولا غاز يوم فوق 1,000 قنينة (إضافات الجولة تُجمع).
create or replace function public.verify_round_once() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select 'dead_entered_flag'::text, count(*) from public.flock_daily d where d.dead + d.culled > 0 and not d.dead_entered
  union all
  select 'gas_cap', count(*) from public.flock_day_gas g where g.cylinders > 1000
$$;

-- ─── ح. الصلاحيات ──────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.set_flock_dead(uuid, date, integer, uuid, boolean), public.add_flock_gas(uuid, date, integer, uuid, boolean) from public, anon;
grant execute on function public.set_flock_dead(uuid, date, integer, uuid, boolean), public.add_flock_gas(uuid, date, integer, uuid, boolean) to authenticated;
revoke all on function public.verify_round_once() from public, anon, authenticated;
grant execute on function public.verify_round_once() to service_role;
