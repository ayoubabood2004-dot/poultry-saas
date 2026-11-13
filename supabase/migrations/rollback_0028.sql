-- rollback_0028 — تراجع «بيع الطيور وإغلاق الدورة» (0028_bird_sales_close): يرجّع خمسة وعشرين جسماً قديماً كما كانت حرفاً بحرف (md5 نفسه
--   بالكتالوج): من 0012 flock_summary وopen_flock وsave_flock_day وflock_detail وverify_flocks وhalls_check، ومن 0019 flock_feed، ومن 0021
--   stock_doc_memo وstock_doc_label وverify_stock وsales_overview وsales_report، ومن 0024 cash_class وentry_detail وmoney_sales وverify_money، ومن
--   0026 flock_month وremove_flock_log وundo_vaccination، ومن 0027 report_days (بتوقيعه ونوع رجوعه نفسيهما، فلا إسقاط) وreport_day وhalls_day_totals
--   وhalls_day وflock_cycle_report وflock_cycles؛ ثمّ يُسقط الدوالّ الجديدة كلّها (الكتّاب والقرّاء والمساعدات وverify_bird_sales وverify_flock_close)،
--   وسياسة نطاق سجلّ التدقيق audit_log_birds_scope، والجداول الأحد عشر بسياساتها ومحفّزاتها وفهارسها؛ ويرجّع القيود الخمسة كما كانت:
--   stock_moves_doc_kind_check وdoc_counters_kind_check كما في 0021، وstock_lots_source_kind_check كما في 0020، وقيدَي flock_costs كما في 0019.
-- **طريق رفض (الكتلة الأولى أدناه):** التذاكر والفواتير والعدد والإغلاق والإرجاع والنقل بيانات المالك، وقيود التجّار وحركات الصناديق وحركات المخزون
--   وكلفة الأفواج تشير إليها، ولا يُستخرج ذلك من مكان آخر. فالملف يرفض نفسه بصوت ولا يغيّر شيئاً ما دامت حقيقة واحدة منها موجودة، بفرع لكلّ حقيقة
--   مستقلّة (تذكرة بلا فاتورة، وفاتورة طيور، وفرق عدّ وحده، ودورة مغلقة بلا نقل مطبَّق، ونقل مطبَّق)، وفرع أخير لأثر بلا صفّ منها (سجلّ التدقيق
--   والعدّادات وأيّ صفّ يتيم): سياسة نطاق السجلّ تسقط بالتراجع فيظهر ما فيه لكلّ دور بلا نطاقه.
-- تنعاد بأمان: create or replace، وdrop if exists، وكتل do تفحص الكتالوج قبل القيود.

set lock_timeout = '5s';

-- الجداول تُقفل قبل العدّ ولحدّ نهاية المعاملة (درس WP4): تذكرة أو فاتورة أو إغلاق يُكتب بلحظة التراجع ينتظر أو يُعدّ.
lock table public.flock_counts, public.weigh_tickets, public.weigh_ticket_stops, public.weigh_ticket_weighings, public.bird_sales,
  public.bird_sale_sources, public.flock_closes, public.flock_close_lines, public.flock_returns, public.flock_return_lines, public.flock_close_values
  in access exclusive mode;

-- ٠) طريق الرفض. الفروع منفصلة: التذكرة المفوترة تُعدّ مع فاتورتها، وفرق العدّ عند الإغلاق مع إغلاقه، والإغلاق الذي طُبِّق نقله مع النقل؛ فكلّ
--    حالة يوقفها فرعها وحده، وطفرة أيّ فرع تعبر حالته (ضابط الحزمة).
do $$
declare
  v_tickets bigint;
  v_stops bigint;
  v_sales bigint;
  v_entries bigint;
  v_sold bigint;
  v_adjusts bigint;
  v_closes bigint;
  v_returns bigint;
  v_applied bigint;
  v_traces bigint;
begin
  select count(*) into v_tickets from public.weigh_tickets t
  where not exists (select 1 from public.bird_sales b where b.org_id = t.org_id and b.ticket_id = t.id);
  select count(*) into v_stops from public.weigh_ticket_stops s
  where not exists (select 1 from public.bird_sales b where b.org_id = s.org_id and b.ticket_id = s.ticket_id);
  select count(*) into v_sales from public.bird_sales;
  select count(*) into v_entries from public.party_entries where doc_kind = 'bird_sale';
  select count(*) into v_sold from public.flock_counts where kind = 'sold';
  select count(*) into v_adjusts from public.flock_counts where doc_kind = 'count_adjust';
  select count(*) into v_closes from public.flock_closes c
  where not exists (select 1 from public.flock_close_lines l where l.org_id = c.org_id and l.close_id = c.id and l.carry_status = 'applied');
  select count(*) into v_returns from public.flock_returns;
  select count(*) into v_applied from public.flock_close_lines where carry_status = 'applied';
  select (select count(*) from public.flock_counts) + (select count(*) from public.weigh_tickets) + (select count(*) from public.weigh_ticket_stops)
      + (select count(*) from public.weigh_ticket_weighings) + (select count(*) from public.bird_sales) + (select count(*) from public.bird_sale_sources)
      + (select count(*) from public.flock_closes) + (select count(*) from public.flock_close_lines) + (select count(*) from public.flock_returns)
      + (select count(*) from public.flock_return_lines) + (select count(*) from public.flock_close_values)
      + (select count(*) from public.flocks where status = 'closed')
      + (select count(*) from public.flock_costs where doc_kind in ('flock_return', 'flock_carry'))
      + (select count(*) from public.stock_moves where doc_kind = 'flock_return')
      + (select count(*) from public.stock_lots where source_kind = 'flock_return')
      + (select count(*) from public.doc_counters where kind in ('WT', 'BR', 'FR'))
      + (select count(*) from public.party_entries where doc_kind = 'bird_sale')
      + (select count(*) from public.cash_moves where doc_kind = 'bird_sale')
      + (select count(*) from public.audit_log where table_name in ('flock_counts', 'weigh_tickets', 'weigh_ticket_stops', 'weigh_ticket_weighings',
          'bird_sales', 'bird_sale_sources', 'flock_closes', 'flock_close_lines', 'flock_returns', 'flock_return_lines', 'flock_close_values'))
    into v_traces;
  if v_tickets > 0 then
    raise exception 'rollback_blocked' using hint = format('توجد %s تذكرة وزن بلا فاتورة فيها %s قاعة، والتراجع يمسحها. لا تراجع لـ0028 بعد استعمالها.',
      v_tickets, v_stops);
  end if;
  if v_sales > 0 then
    raise exception 'rollback_blocked' using hint = format('توجد %s فاتورة طيور، وتشير إليها %s قيداً على حسابات التجّار و%s حركة عدد، والتراجع يمسحها. لا تراجع لـ0028 بعد استعمالها.',
      v_sales, v_entries, v_sold);
  end if;
  if v_adjusts > 0 then
    raise exception 'rollback_blocked' using hint = format('يوجد %s فرق عدّ مسجَّل للأفواج، والتراجع يمسحه فيتغيّر عدد الطيور الحيّة. لا تراجع لـ0028 بعد استعمالها.',
      v_adjusts);
  end if;
  if v_closes > 0 then
    raise exception 'rollback_blocked' using hint = format('توجد %s دورة مغلقة و%s مستند إرجاع من القاعات، وتشير إليها حركات المخزون وكلفة الأفواج، والتراجع يمسحها. لا تراجع لـ0028 بعد استعمالها.',
      v_closes, v_returns);
  end if;
  if v_applied > 0 then
    raise exception 'rollback_blocked' using hint = format('يوجد %s علف منقول طُبِّق على دورة تالية، وتشير إليه كلفة الفوجين، والتراجع يمسحه. لا تراجع لـ0028 بعد استعمالها.',
      v_applied);
  end if;
  -- أثر بلا صفّ من الحقائق أعلاه (صفّ حُذف يدويّاً فبقي في سجلّ التدقيق، أو عدّاد، أو صفّ يتيم): سياسة نطاق السجلّ تسقط بالتراجع فيظهر ما فيه.
  if v_tickets + v_sales + v_adjusts + v_closes + v_applied = 0 and v_traces > 0 then
    raise exception 'rollback_blocked' using hint = format('في القاعدة %s أثراً من جداول 0028 (سجلّ التدقيق أو العدّادات أو صفوف بلا مستندها)، والتراجع يُسقط ما يقرؤها بنطاقه. لا تراجع لـ0028 بعد استعمالها.',
      v_traces);
  end if;
end
$$;

-- ١) الأجسام القديمة كما كانت حرفاً بحرف (create or replace لا يغيّر المنح)، قبل إسقاط ما تناديه الأجسام الجديدة:

-- private.flock_summary كما في 0012_flocks_daily.sql.
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
begin
  select coalesce(sum(x.dead), 0), coalesce(sum(x.culled), 0), coalesce(sum(x.dead + x.culled) filter (where x.on_date < v_today), 0),
         coalesce(sum(x.feed_kg), 0), count(x.feed_kg)::int, max(x.on_date) filter (where x.feed_kg is not null)
    into v_dead, v_culled, v_before, v_feed, v_feed_days, v_last_feed
  from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id;
  v_live := coalesce(f.placed_count, 0) - v_dead - v_culled;
  v_live_start := coalesce(f.placed_count, 0) - v_before;
  -- أيّام العلف اللازمة لـFCR (القاعدة ٢٨): كل يوم من التسكين لحد أمس، واليوم ويّاها إذا انسجّل علفه (جولة اليوم بس ممكن تتأخّر).
  -- لحد «آخر يوم علف» كان يعدّ الفوج كاملاً لمّا تنقطع جولات العلف، والحيّ والوزن يمشون: FCR أقلّ من الحقيقة.
  v_span := greatest(coalesce(v_last_feed, f.placed_on - 1), v_today - 1) - f.placed_on + 1;
  select * into w from public.flock_weights x where x.org_id = f.org_id and x.flock_id = f.id order by x.on_date desc limit 1;
  select * into d from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = v_today;
  if v_feed_days > 0 and v_feed_days = v_span and v_feed > 0 and w.id is not null and v_live > 0 then
    v_fcr := private._mul_div_round(v_feed, 1000, v_live * w.avg_g, 3)::text;
  end if;
  select count(*)::int into v_rejects from public.flock_day_rejects r where r.org_id = f.org_id and r.flock_id = f.id and r.decision is null;
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
    'rejects_pending', v_rejects);
end
$$;

-- public.open_flock كما في 0012_flocks_daily.sql.
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
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('flock_id', v_id, 'version', 1));
end
$$;

-- public.save_flock_day كما في 0012_flocks_daily.sql.
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
    on conflict (org_id, created_by, flock_id, on_date) do update
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

  -- الحيّ = المسكّن − كل النافق − كل المستبعد ≥ صفر (FOUNDATION ٤٣٤)، تحت قفل صفّ الفوج.
  select coalesce(sum(x.dead + x.culled), 0) into v_others from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date <> p_date;
  v_live := f.placed_count - v_others;
  if v_live - n.dead - n.culled < 0 then
    raise exception 'live_negative' using hint = format('النافق والمستبعد (%s) أكثر من الطيور الحيّة (%s). راجع الأرقام.',
      to_char(n.dead + n.culled, 'FM999,999,999,990'), to_char(greatest(v_live, 0), 'FM999,999,999,990'));
  end if;
  -- بيض اليوم ما يزيد على الدجاج الحيّ بدايته (القاعدة ٣٢)، لهذا اليوم ولكل يوم بعده سجّل بيضاً (النافق الجديد يقلّل حيّه).
  select x.on_date, x.eggs_total, x.live_start into v_bad from (
    select y.on_date, y.eggs_total,
      f.placed_count - coalesce(sum(y.dead + y.culled) over (order by y.on_date rows between unbounded preceding and 1 preceding), 0) as live_start
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

  if d.id is null then
    insert into public.flock_daily (org_id, flock_id, hall_id, site_id, division_id, on_date, dead, culled, feed_kg, water_l, temp_min, temp_max, eggs_total, eggs_cracked, eggs_broken, note, version, last_ref)
    values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_date, n.dead, n.culled, n.feed_kg, n.water_l, n.temp_min, n.temp_max, n.eggs_total, n.eggs_cracked, n.eggs_broken, n.note, 1, p_client_ref)
    returning * into n;
  else
    update public.flock_daily
    set dead = n.dead, culled = n.culled, feed_kg = n.feed_kg, water_l = n.water_l, temp_min = n.temp_min, temp_max = n.temp_max,
        eggs_total = n.eggs_total, eggs_cracked = n.eggs_cracked, eggs_broken = n.eggs_broken, note = n.note,
        version = d.version + 1, last_ref = p_client_ref, updated_at = now(), updated_by = auth.uid()
    where org_id = d.org_id and id = d.id
    returning * into n;
  end if;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'version', n.version));
end
$$;

-- public.flock_detail كما في 0012_flocks_daily.sql.
create or replace function public.flock_detail(p_flock uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  f public.flocks;
  h public.halls;
  s public.sites;
begin
  perform private.require('read');
  select * into f from public.flocks x where x.org_id = public.auth_org() and x.id = p_flock;
  if f.id is null then
    raise exception 'flock_not_found' using hint = 'هذا الفوج غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(f.site_id) then
    raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك.';
  end if;
  select * into h from public.halls x where x.org_id = f.org_id and x.id = f.hall_id;
  select * into s from public.sites x where x.org_id = f.org_id and x.id = f.site_id;
  return jsonb_build_object(
    'flock', private.flock_summary(f) || jsonb_build_object('hall_id', h.id, 'hall_name', h.name, 'site_id', s.id, 'site_name', s.name,
      'closed_on', f.closed_on, 'close_note', f.close_note),
    'can_manage', public.can('flock.manage'),
    'can_save', public.can('flock_day.save'),
    'days', coalesce((
      select jsonb_agg(private.flock_day_json(y.d) || jsonb_build_object(
        'live_start', y.live_start, 'live_end', y.live_start - (y.d).dead - (y.d).culled,
        'hdep', case when f.kind = 'layer' then private.flock_pct((y.d).eggs_total, y.live_start) end) order by (y.d).on_date desc)
      from (
        select x as d, f.placed_count - coalesce(sum(x.dead + x.culled) over (order by x.on_date rows between unbounded preceding and 1 preceding), 0) as live_start
        from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id
      ) as y
    ), '[]'::jsonb),
    'weights', coalesce((
      select jsonb_agg(jsonb_build_object('on_date', w.on_date, 'sample_count', w.sample_count, 'avg_g', round(w.avg_g, 1)::text, 'version', w.version)
        order by w.on_date desc)
      from public.flock_weights w where w.org_id = f.org_id and w.flock_id = f.id
    ), '[]'::jsonb));
end
$$;

-- public.verify_flocks كما في 0012_flocks_daily.sql.
create or replace function public.verify_flocks() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select 'live_negative', count(*) from public.flocks f
  where coalesce(f.placed_count, 0) - coalesce((select sum(x.dead + x.culled) from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id), 0) < 0
  union all
  select 'eggs_on_broiler', count(*) from public.flock_daily x join public.flocks f on f.org_id = x.org_id and f.id = x.flock_id
  where f.kind = 'broiler' and (x.eggs_total is not null or x.eggs_cracked is not null or x.eggs_broken is not null)
  union all
  select 'eggs_over_total', count(*) from public.flock_daily x
  where coalesce(x.eggs_cracked, 0) + coalesce(x.eggs_broken, 0) > coalesce(x.eggs_total, 0)
  union all
  select 'day_before_placement', count(*) from public.flock_daily x join public.flocks f on f.org_id = x.org_id and f.id = x.flock_id
  where f.placed_on is null or x.on_date < f.placed_on
  union all
  select 'day_hall_mismatch', count(*) from public.flock_daily x join public.flocks f on f.org_id = x.org_id and f.id = x.flock_id
  where x.hall_id <> f.hall_id
  union all
  select 'flock_site_mismatch', count(*) from public.flocks f join public.halls h on h.org_id = f.org_id and h.id = f.hall_id
  where f.site_id <> h.site_id or f.division_id <> h.division_id
  union all
  select 'flock_kind_mismatch', count(*) from public.flocks f join public.divisions d on d.org_id = f.org_id and d.id = f.division_id
  where f.kind <> d.kind
  union all
  select 'hall_site_kind', count(*) from public.halls h
  join public.sites s on s.org_id = h.org_id and s.id = h.site_id
  join public.divisions d on d.org_id = h.org_id and d.id = h.division_id
  where s.kind <> 'farm' or d.kind not in ('broiler', 'layer') or s.division_id <> h.division_id
  union all
  select 'live_hall_on_archived_site', count(*) from public.halls h join public.sites s on s.org_id = h.org_id and s.id = h.site_id
  where h.archived_at is null and s.archived_at is not null
  union all
  select 'live_flock_on_archived_hall', count(*) from public.flocks f join public.halls h on h.org_id = f.org_id and h.id = f.hall_id
  where f.status in ('preparing', 'active') and h.archived_at is not null
  union all
  select 'weight_hall_mismatch', count(*) from public.flock_weights w join public.flocks f on f.org_id = w.org_id and f.id = w.flock_id
  where w.hall_id <> f.hall_id or f.placed_on is null or w.on_date < f.placed_on
  union all
  -- المركونة بقاعة فوجها (حقلها ووحدتها من القاعة بالمفتاح المركّب): سياسة القراءة بنطاق الحقل تعتمد عليها.
  select 'reject_hall_mismatch', count(*) from public.flock_day_rejects r join public.flocks f on f.org_id = r.org_id and f.id = r.flock_id
  where r.hall_id <> f.hall_id
  union all
  -- بيض اليوم ما يزيد على الحيّ بدايته (القاعدة ٣٢، نفس نافذة save_flock_day): كاتب لاحق يقلّل الحيّ (تسوية عدّ أو بيع بالنسخة الثانية) يبين هنا.
  select 'eggs_over_live', count(*) from (
    select x.eggs_total,
      f.placed_count - coalesce(sum(x.dead + x.culled) over (partition by x.org_id, x.flock_id order by x.on_date rows between unbounded preceding and 1 preceding), 0) as live_start
    from public.flock_daily x join public.flocks f on f.org_id = x.org_id and f.id = x.flock_id
  ) as y
  where y.eggs_total > y.live_start
$$;

-- private.halls_check كما في 0012_flocks_daily.sql.
create or replace function private.halls_check() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.sites;
  v_kind text;
begin
  set local lock_timeout = '5s';
  if tg_op = 'INSERT' or new.archived_at is null and old.archived_at is not null then
    select * into s from public.sites x where x.org_id = new.org_id and x.id = new.site_id for share;
  else
    select * into s from public.sites x where x.org_id = new.org_id and x.id = new.site_id;
  end if;
  select d.kind into v_kind from public.divisions d where d.org_id = s.org_id and d.id = s.division_id;
  if s.id is null or s.kind <> 'farm' or coalesce(v_kind not in ('broiler', 'layer'), true) then
    raise exception 'hall_site_kind' using hint = 'القاعة تُضاف في حقل من حقول اللحم أو حقول البيض فقط. اختر الحقل من جديد.';
  end if;
  new.division_id := s.division_id;
  if new.archived_at is null and s.archived_at is not null and (tg_op = 'INSERT' or old.archived_at is not null) then
    raise exception 'site_archived' using hint = 'الحقل مؤرشف. أعِده من الأرشيف أوّلاً، ثم أضف القاعة أو أعِدها.';
  end if;
  if new.archived_at is null and exists (
    select 1 from public.halls h
    where h.org_id = new.org_id and h.site_id = new.site_id and h.id <> new.id and h.archived_at is null and btrim(h.name) = btrim(new.name)
  ) then
    raise exception 'hall_name_taken' using hint = format('في هذا الحقل قاعة فعّالة باسم «%s». اختر اسماً آخر.', btrim(new.name));
  end if;
  if tg_op = 'UPDATE' and new.archived_at is not null and old.archived_at is null
     and exists (select 1 from public.flocks f where f.org_id = new.org_id and f.hall_id = new.id and f.status in ('preparing', 'active')) then
    raise exception 'hall_in_use' using hint = 'في هذه القاعة فوج قائم، فلا تُؤرشف قبل إغلاقه.';
  end if;
  return new;
end
$$;

-- public.flock_feed كما في 0019_flock_issue.sql.
create or replace function public.flock_feed(p_flock uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  f public.flocks;
  h public.halls;
  v_issued numeric;
  v_unweighed int;
  v_consumed numeric;
  v_value numeric;
  v_rows jsonb;
  v_count int;
  v_void boolean;
  v_any_void boolean;
begin
  perform private.require('read');
  select * into f from public.flocks x where x.org_id = v_org and x.id = p_flock;
  if f.id is null then
    raise exception 'flock_not_found' using hint = 'هذا الفوج غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(f.site_id) then
    raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك.';
  end if;
  select * into h from public.halls x where x.org_id = f.org_id and x.id = f.hall_id;
  v_void := public.can('void') and f.status <> 'closed';
  select coalesce(sum(private.issue_mass_kg(y.qty_base, y.base_unit, y.density_kg_per_l, y.piece_mass_kg)), 0),
    (count(*) filter (where private.issue_mass_kg(y.qty_base, y.base_unit, y.density_kg_per_l, y.piece_mass_kg) is null))::int
  into v_issued, v_unweighed
  from public.flock_issues x join public.flock_issue_lines y on y.org_id = x.org_id and y.issue_id = x.id
  where x.org_id = v_org and x.flock_id = f.id and x.status = 'posted' and y.cost_kind = 'feed';
  select coalesce(sum(d.feed_kg), 0) into v_consumed from public.flock_daily d where d.org_id = v_org and d.flock_id = f.id;
  select coalesce(sum(c.amount), 0) into v_value from public.flock_costs c where c.org_id = v_org and c.flock_id = f.id and c.doc_kind = 'flock_issue';
  with listed as (
    select x.id, x.doc_no, x.issued_on, x.status, x.posted_at, x.void_reason, x.warehouse_id, w.name as warehouse_name,
      y.item_id, i.name as item_name, y.cost_kind, y.qty_base, y.base_unit, c.amount, r.on_date as voided_on,
      v_void and x.status = 'posted' and public.in_scope_site(x.site_id) and public.in_scope_wh(x.warehouse_id) as voidable,
      row_number() over (order by x.issued_on desc, x.posted_at desc, x.id desc) as n
    from public.flock_issues x
    join public.flock_issue_lines y on y.org_id = x.org_id and y.issue_id = x.id and y.line_no = 1
    join public.items i on i.org_id = y.org_id and i.id = y.item_id
    join public.warehouses w on w.org_id = x.org_id and w.id = x.warehouse_id
    left join public.flock_costs c on c.org_id = x.org_id and c.doc_kind = 'flock_issue' and c.doc_id = x.id and c.doc_line_id = y.id
      and c.reverses_id is null
    left join public.flock_costs r on r.org_id = c.org_id and r.reverses_id = c.id
    where x.org_id = v_org and x.flock_id = f.id
  )
  select count(*)::int, coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'doc_no', o.doc_no, 'issued_on', o.issued_on, 'status', o.status,
      'item_id', o.item_id, 'item_name', o.item_name, 'cost_kind', o.cost_kind, 'qty', o.qty_base::text, 'base_unit', o.base_unit,
      'warehouse_id', o.warehouse_id, 'warehouse_name', o.warehouse_name, 'voided_on', o.voided_on, 'void_reason', o.void_reason,
      'can_void', o.voidable, 'money', jsonb_build_object('value', o.amount::text)) order by o.n) filter (where o.n <= 500), '[]'::jsonb),
    coalesce(bool_or(o.voidable), false)
  into v_count, v_rows, v_any_void
  from listed o;
  return private.mask(jsonb_build_object('flock_id', f.id, 'flock_status', f.status, 'hall_id', h.id, 'hall_name', h.name, 'today', public.app_today(),
    'issued_feed_kg', round(v_issued, 3)::text, 'consumed_feed_kg', round(v_consumed, 3)::text, 'remaining_feed_kg', round(v_issued - v_consumed, 3)::text,
    'unweighed_feed_lines', v_unweighed, 'issues', v_rows, 'more', v_count > 500,
    'can_void', v_any_void,
    'money', jsonb_build_object('issued_value', v_value::text)));
end
$$;

-- private.stock_doc_memo كما في 0021_sales.sql.
create or replace function private.stock_doc_memo(p_kind text, p_doc uuid, p_warehouse uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case p_kind
    when 'receipt' then coalesce((select format('شراء من %s', t.name) from public.receipts r
      join public.parties t on t.org_id = r.org_id and t.id = r.party_id
      where r.org_id = public.auth_org() and r.id = p_doc), 'شراء')
    when 'supplier_return' then coalesce((select format('مرتجع إلى %s', t.name) from public.supplier_returns s
      join public.parties t on t.org_id = s.org_id and t.id = s.party_id
      where s.org_id = public.auth_org() and s.id = p_doc), 'مرتجع إلى المورّد')
    when 'receipt_revalue' then coalesce((select case when v.unit_price is not null then 'إكمال سعر الشراء' else 'تصحيح سعر الشراء' end
      from public.receipt_revaluations v where v.org_id = public.auth_org() and v.id = p_doc), 'تصحيح سعر الشراء')
    when 'transfer' then coalesce((select case when x.to_warehouse_id = p_warehouse then format('تحويل من %s', f.name) else format('تحويل إلى %s', y.name) end
      from public.transfers x
      join public.warehouses f on f.org_id = x.org_id and f.id = x.from_warehouse_id
      join public.warehouses y on y.org_id = x.org_id and y.id = x.to_warehouse_id
      where x.org_id = public.auth_org() and x.id = p_doc), 'تحويل بين المخازن')
    when 'opening' then 'رصيد بداية'
    when 'count' then 'جرد'
    when 'stock_use' then coalesce((select case when c.name is null then 'صرف' else format('صرف: %s', c.name) end
      from public.stock_uses u left join public.expense_categories c on c.org_id = u.org_id and c.id = u.category_id
      where u.org_id = public.auth_org() and u.id = p_doc), 'صرف')
    when 'production' then coalesce((select case when b.output_warehouse_id = p_warehouse then format('إنتاج خلطة %s', r.name)
        else format('استهلاك في خلطة %s', r.name) end
      from public.production_batches b
      join public.recipe_versions v on v.org_id = b.org_id and v.id = b.recipe_version_id
      join public.recipes r on r.org_id = v.org_id and r.id = v.recipe_id
      where b.org_id = public.auth_org() and b.id = p_doc), 'إنتاج علف')
    when 'flock_issue' then coalesce((select format('صرف إلى %s (%s)', h.name, s.name) from public.flock_issues x
      join public.halls h on h.org_id = x.org_id and h.id = x.hall_id
      join public.sites s on s.org_id = x.org_id and s.id = x.site_id
      where x.org_id = public.auth_org() and x.id = p_doc), 'صرف لفوج')
    when 'conversion' then coalesce((select format('تحويل «%s» إلى «%s»', a.name, b.name) from public.stock_conversions c
      join public.items a on a.org_id = c.org_id and a.id = c.from_item_id
      join public.items b on b.org_id = c.org_id and b.id = c.to_item_id
      where c.org_id = public.auth_org() and c.id = p_doc), 'تحويل مادّة')
    when 'sale' then coalesce((select format('بيع إلى %s', t.name) from public.sales_invoices s
      join public.parties t on t.org_id = s.org_id and t.id = s.party_id
      where s.org_id = public.auth_org() and s.id = p_doc), 'بيع')
    else p_kind
  end
$$;

-- private.stock_doc_label كما في 0021_sales.sql.
create or replace function private.stock_doc_label(p_kind text, p_doc uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case p_kind
    when 'transfer' then coalesce((select t.doc_no from public.transfers t where t.org_id = public.auth_org() and t.id = p_doc), 'تحويل')
    when 'opening' then coalesce((select format('رصيد افتتاح بتاريخ %s', to_char(o.on_date, 'DD/MM/YYYY')) from public.opening_docs o
      where o.org_id = public.auth_org() and o.id = p_doc), 'رصيد افتتاح')
    when 'stock_use' then coalesce((select u.doc_no from public.stock_uses u where u.org_id = public.auth_org() and u.id = p_doc), 'صرف')
    when 'count' then coalesce((select c.doc_no from public.stock_counts c where c.org_id = public.auth_org() and c.id = p_doc), 'جرد')
    when 'count_gain' then coalesce((select c.doc_no from public.stock_counts c where c.org_id = public.auth_org() and c.id = p_doc), 'جرد')
    when 'receipt' then coalesce((select r.doc_no from public.receipts r where r.org_id = public.auth_org() and r.id = p_doc), 'استلام')
    when 'supplier_return' then coalesce((select s.doc_no from public.supplier_returns s where s.org_id = public.auth_org() and s.id = p_doc), 'مرتجع')
    when 'receipt_revalue' then coalesce((select format(case when v.unit_price is not null then 'سعر %s' else 'تصحيح سعر %s' end, r.doc_no)
      from public.receipt_revaluations v
      join public.receipts r on r.org_id = v.org_id and r.id = v.receipt_id where v.org_id = public.auth_org() and v.id = p_doc), 'تصحيح سعر')
    when 'production' then coalesce((select coalesce(b.doc_no, format('دفعة إنتاج %s', r.name)) from public.production_batches b
      join public.recipe_versions v on v.org_id = b.org_id and v.id = b.recipe_version_id
      join public.recipes r on r.org_id = v.org_id and r.id = v.recipe_id
      where b.org_id = public.auth_org() and b.id = p_doc), 'دفعة إنتاج')
    when 'flock_issue' then coalesce((select x.doc_no from public.flock_issues x where x.org_id = public.auth_org() and x.id = p_doc), 'صرف لفوج')
    when 'conversion' then coalesce((select c.doc_no from public.stock_conversions c where c.org_id = public.auth_org() and c.id = p_doc), 'تحويل مادّة')
    when 'sale' then coalesce((select s.doc_no from public.sales_invoices s where s.org_id = public.auth_org() and s.id = p_doc), 'بيع')
    else p_kind
  end
$$;

-- public.verify_stock كما في 0021_sales.sql.
create or replace function public.verify_stock() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  -- 1. لكل (مادّة، مخزن): الرصيد = Σ الحركات = Σ متبقّي الدفعات، كميةً وقيمةً؛ وحركة بلا صفّ رصيد مخالفة.
  with mv as (select org_id, item_id, warehouse_id, sum(qty) as q, sum(value) as v from public.stock_moves group by org_id, item_id, warehouse_id),
  lt as (select org_id, item_id, warehouse_id, sum(qty_left) as q, sum(value_left) as v from public.stock_lots group by org_id, item_id, warehouse_id),
  keys as (
    select org_id, item_id, warehouse_id from public.stock_balances
    union select org_id, item_id, warehouse_id from mv
    union select org_id, item_id, warehouse_id from lt
  )
  select 'balance_identity'::text, count(*) from keys k
  left join public.stock_balances b on b.org_id = k.org_id and b.item_id = k.item_id and b.warehouse_id = k.warehouse_id
  left join mv on mv.org_id = k.org_id and mv.item_id = k.item_id and mv.warehouse_id = k.warehouse_id
  left join lt on lt.org_id = k.org_id and lt.item_id = k.item_id and lt.warehouse_id = k.warehouse_id
  where b.id is null or b.qty <> coalesce(mv.q, 0) or b.value <> coalesce(mv.v, 0)
    or coalesce(lt.q, 0) <> coalesce(mv.q, 0) or coalesce(lt.v, 0) <> coalesce(mv.v, 0)
  union all
  -- 2. لكل دفعة: المتبقّي = Σ حركاتها الموقّعة، والداخل = حركتها الأصلية (وحدة بالضبط) + حركات التقييم (WP7).
  select 'lot_moves', count(*) from public.stock_lots l
  left join lateral (
    select coalesce(sum(m.qty), 0) as q, coalesce(sum(m.value), 0) as v,
      count(*) filter (where m.qty > 0 and m.reverses_move_id is null) as originals,
      sum(m.qty) filter (where m.qty > 0 and m.reverses_move_id is null) as q_in,
      sum(m.value) filter (where m.qty > 0 and m.reverses_move_id is null) as v_in,
      coalesce(sum(m.value) filter (where m.doc_kind = 'receipt_revalue'), 0) as revalued
    from public.stock_moves m where m.org_id = l.org_id and m.lot_id = l.id
  ) as s on true
  where l.qty_left <> s.q or l.value_left <> s.v or s.originals <> 1 or l.qty_in <> s.q_in or l.value_in <> s.v_in + s.revalued
  union all
  -- 3. شكل الدفعة: المتبقّي بين صفر والداخل وبلا فلس معلّق، والمعدود أعداد صحيحة، والأفراخ بوقت فقس وغيرها بلاه، والمرآة جذرها جذر بنفس
  --    الترتيب، والتحويل وحده بمصدر.
  select 'lot_shape', count(*) from public.stock_lots l
  join public.items i on i.org_id = l.org_id and i.id = l.item_id
  left join public.stock_lots o on o.org_id = l.org_id and o.id = l.origin_lot_id
  where l.qty_left < 0 or l.qty_left > l.qty_in or l.value_left < 0 or (l.qty_left = 0 and l.value_left <> 0)
    or (i.base_unit = 'pc' and (l.qty_in <> trunc(l.qty_in) or l.qty_left <> trunc(l.qty_left)))
    or (i.kind = 'chick' and l.born_at is null) or (i.kind <> 'chick' and l.born_at is not null)
    or (l.origin_lot_id is not null and (o.id is null or o.origin_lot_id is not null or o.fifo_seq <> l.fifo_seq))
    or ((l.source_kind = 'transfer') <> (l.source_lot_id is not null))
  union all
  -- 4. كل عكسية بنفس الدفعة ومستند أصلها وبكميته وقيمته المعاكستين، وأصلها مو عكسية.
  select 'reversal_pairs', count(*) from public.stock_moves r
  join public.stock_moves o on o.org_id = r.org_id and o.id = r.reverses_move_id
  where o.lot_id <> r.lot_id or o.qty <> -r.qty or o.value <> -r.value or o.reverses_move_id is not null
    or o.doc_kind <> r.doc_kind or o.doc_id <> r.doc_id or o.doc_line_id is distinct from r.doc_line_id
  union all
  -- 5. كل مرآة = قطعة مصدرها (نفس المستند والسطر، والكمية والقيمة المعاكستين)، وبنفس fifo_seq والانتهاء ووقت الفقس، وجذرها جذر مصدرها.
  select 'mirror_pairs', count(*) from public.stock_lots m
  join public.stock_lots s on s.org_id = m.org_id and s.id = m.source_lot_id
  left join lateral (
    select x.qty, x.value, x.doc_line_id from public.stock_moves x
    where x.org_id = m.org_id and x.lot_id = m.id and x.doc_kind = 'transfer' and x.doc_id = m.source_id and x.qty > 0 and x.reverses_move_id is null
  ) as mi on true
  left join lateral (
    select x.qty, x.value from public.stock_moves x
    where x.org_id = m.org_id and x.lot_id = s.id and x.doc_kind = 'transfer' and x.doc_id = m.source_id and x.doc_line_id = mi.doc_line_id
      and x.qty < 0 and x.reverses_move_id is null
  ) as mo on true
  where mi.qty is null or mo.qty is null or mo.qty <> -mi.qty or mo.value <> -mi.value or m.qty_in <> mi.qty or m.value_in <> mi.value + coalesce((select sum(z.value) from public.stock_moves z where z.org_id = m.org_id and z.lot_id = m.id and z.doc_kind = 'receipt_revalue'), 0)
    or m.fifo_seq <> s.fifo_seq or m.expiry_on is distinct from s.expiry_on or m.born_at is distinct from s.born_at
    or m.origin_lot_id is distinct from coalesce(s.origin_lot_id, s.id) or m.item_id <> s.item_id
  union all
  -- 6. ماكو سحب من دفعة قبل استلامها، ولا من دفعة منتهية بيوم السحب (الاستثناءات الأربعة بحزمها: الدفعة المسمّاة بإذن المدير
  --    والإتلاف ونقص الجرد المنتهي من WP5، والمرتجع من WP7، وكلها تكتب expiry_checked = false).
  --    قاعدة الانتهاء بعلامة السحب نفسه (expiry_checked، يوم السحب)، والسحب الأصلي بلا علامة مخالفة (كل حزمة تكتبها).
  select 'draw_dates', count(*) from public.stock_moves m
  join public.stock_lots l on l.org_id = m.org_id and l.id = m.lot_id
  where m.qty < 0 and m.reverses_move_id is null
    and (m.expiry_checked is null or l.received_on > m.moved_on or private.lot_expired(m.expiry_checked, l.expiry_on, m.moved_on))
  union all
  -- 7. أهلية نوع المادّة بنوع المخزن لكل دفعة (FOUNDATION ٢٨٠–٢٨٣).
  select 'admissible', count(*) from public.stock_lots l
  join public.items i on i.org_id = l.org_id and i.id = l.item_id
  join public.warehouses w on w.org_id = l.org_id and w.id = l.warehouse_id
  where not private.item_admissible(w.kind, i.kind)
  union all
  -- 8. حفظ القيمة (FOUNDATION ٤٣٠) لكل منشأة، وكل طرف من مصدره بالمستند (مو مجموع حركات): الداخل = قيم الافتتاح المرحّلة
  --    + قيم زيادات الجرد المرحّل (لقطة stock_count_line_costs، E55) (+ الاستلامات WP6، وحصص التقييم WP7)؛ والخارج = Σ متبقّي
  --    الدفعات + صافي مصاريف المخزون (الصرف والإتلاف ونقص الجرد، المصدر stock) (+ المرتجع WP7). التحويل بلا طرف (الفحص 5). الملغى
  --    صفر بالطرفين (حركاته معكوسة ومصروفه بصفّ عكسي). والصرف لفوج (0019) خارج بقيمته: سطر كلفته على الفوج (flock_costs بنوع مستند
  --    flock_issue)، والملغى صفر (حركاته معكوسة وكلفته بصفّ عكسي). والبيع (0021) خارج بكلفته: لقطة sales_line_costs للفاتورة المرحَّلة، والملغاة
  --    صفر (حركاتها معكوسة).
  select 'value_conservation', count(*) from (
    select o.id,
      coalesce((select sum(x.value) from public.opening_lines x join public.opening_docs d on d.org_id = x.org_id and d.id = x.doc_id
        where x.org_id = o.id and d.status = 'posted'), 0)
      + coalesce((select sum(c.gain_value) from public.stock_count_line_costs c join public.stock_counts k on k.org_id = c.org_id and k.id = c.doc_id
        where c.org_id = o.id and k.status = 'approved'), 0)
      + coalesce((select sum(a.line_total - a.discount_share + a.charge_share) from public.receipt_line_amounts a
        join public.receipts r on r.org_id = a.org_id and r.id = a.doc_id where a.org_id = o.id and r.status = 'posted'), 0)
      + coalesce((select sum(v.lot_share) from public.receipt_revaluations v where v.org_id = o.id and v.status = 'posted'), 0)
      + coalesce((select sum(pv.extra_value) from public.production_values pv join public.production_batches b on b.org_id = pv.org_id and b.id = pv.batch_id
          where pv.org_id = o.id and b.status = 'posted'), 0) as inputs,
      coalesce((select sum(l.value_left) from public.stock_lots l where l.org_id = o.id), 0)
      + coalesce((select sum(e.amount) from public.expenses e where e.org_id = o.id and e.source = 'stock'), 0)
      + coalesce((select sum(p.amount) from public.party_entries p where p.org_id = o.id and p.kind = 'supplier_return'), 0)
      + coalesce((select sum(x.amount) from public.expenses x join public.expense_categories k on k.org_id = x.org_id and k.id = x.category_id
          where x.org_id = o.id and x.doc_kind = 'supplier_return' and k.system_code = 'supplier_return_diff'), 0)
      + coalesce((select sum(c.amount) from public.flock_costs c where c.org_id = o.id and c.doc_kind = 'flock_issue'), 0)
      + coalesce((select sum(c.cost) from public.sales_line_costs c join public.sales_invoices s on s.org_id = c.org_id and s.id = c.sale_id
          where c.org_id = o.id and s.status = 'posted'), 0) as outputs
    from public.orgs o
  ) as x where x.inputs <> x.outputs
  union all
  -- E14: وحدة بيها حركة مخزون مختومة بأوّل ترحيل (first_posted_at)، فيوم تشغيلها متجمّد.
  select 'posted_division_stamped', count(*) from public.divisions d
  where d.first_posted_at is null
    and exists (select 1 from public.stock_moves m join public.warehouses w on w.org_id = m.org_id and w.id = m.warehouse_id
      where w.org_id = d.org_id and w.division_id = d.id)
  union all
  -- 9. قيمة كل سحب أصلي بالقاعدة 13 من حال دفعته قبله (حركاتها السابقة بترتيبها): كل المتبقّي = قيمته المتبقّية بالضبط، وإلا
  --    _mul_div_round2؛ وسحب أكثر من المتبقّي مخالفة. تقريب غلط بالمصدر ومرآته سوا (الطرفان متساويان) ما يشوفه الفحصان 1 و5.
  select 'draw_values', count(*) from (
    select m.qty, m.value, m.reverses_move_id,
      coalesce(sum(m.qty) over w, 0) as ql, coalesce(sum(m.value) over w, 0) as vl
    from public.stock_moves m
    window w as (partition by m.org_id, m.lot_id order by m.seq rows between unbounded preceding and 1 preceding)
  ) as x
  where x.qty < 0 and x.reverses_move_id is null
    and case when x.ql <= 0 or -x.qty > x.ql then true
      when -x.qty = x.ql then -x.value <> x.vl
      else -x.value <> private._mul_div_round2(-x.qty, x.vl, x.ql) end
  union all
  -- 10. ترتيب السحب (القاعدة 12): وقت كل قطعة سحب أصلية بالتحويل والصرف والجرد والصرف لفوج (0019) وتحويل المادّة (0020) والبيع (0021) ماكو دفعة قبلها بالترتيب (الانتهاء والفارغ أخيراً،
  --     ثم fifo_seq، ثم المعرّف) مؤهّلة بتاريخ السحب (مستلمة بيه أو قبله، وغير منتهية للسحب اللي طبّق قاعدة الانتهاء) وبيها متبقٍّ
  --     قبل القطعة. نقص الجرد المنتهي (expiry_checked = false) يشوف كل الدفعات مؤهّلة، والصالحة كلها بعد المنتهية بالترتيب، فيبقى
  --     الأقدم انتهاءً أوّلاً. السحب من دفعة مسمّاة (إذن المنتهي والإتلاف، والمرتجع WP7) برّا الفحص.
  select 'draw_order', count(*) from public.stock_moves m
  join public.stock_lots l on l.org_id = m.org_id and l.id = m.lot_id
  where m.qty < 0 and m.reverses_move_id is null and m.doc_kind in ('transfer', 'stock_use', 'count', 'flock_issue', 'conversion', 'sale')
    and not exists (select 1 from public.stock_use_lines u where m.doc_kind = 'stock_use' and u.org_id = m.org_id and u.id = m.doc_line_id and u.lot_id is not null)
    and exists (
      select 1 from public.stock_lots e
      where e.org_id = m.org_id and e.item_id = m.item_id and e.warehouse_id = m.warehouse_id and e.id <> l.id
        and e.received_on <= m.moved_on and not private.lot_expired(coalesce(m.expiry_checked, true), e.expiry_on, m.moved_on)
        and ((e.expiry_on is not null and (l.expiry_on is null or e.expiry_on < l.expiry_on))
          or (e.expiry_on is not distinct from l.expiry_on and (e.fifo_seq < l.fifo_seq or (e.fifo_seq = l.fifo_seq and e.id < l.id))))
        and (select coalesce(sum(x.qty), 0) from public.stock_moves x where x.org_id = e.org_id and x.lot_id = e.id and x.seq < m.seq) > 0)
  union all
  -- 11. المستند = حركاته. التحويل: سطر المرحَّل (والملغى بعد ترحيل) سحب كميته بالضبط من مخزنه المرسِل، والمرحَّل بلا عكسية، والملغى
  --     كل أصلية منه معكوسة، والمسوّدة والمطويّة بلا حركات؛ وكل حركة تحويل بسطر من مستند مرحَّل بنفس المادّة وبأحد مخزنيه، أصليتها
  --     سالبة بالمرسِل وموجبة بالمستلم. الافتتاح: سطر المرحَّل (والملغى بعد ترحيل) دفعة وحدة بالضبط بمادّته وكميته وقيمته (حتى
  --     الصفر) وتاريخه ومخزنه وانتهائه وفقسه، والمسوّدة والمطويّة بلا دفعة؛ وكل حركة افتتاح على دفعة سطرها، والمرحَّل بلا عكسية،
  --     والملغى كل أصلية منه معكوسة. يمسك سحباً ناقصاً، وإلغاءً ناقصاً، ودفعة افتتاح بغير كمية سطرها. الصرف (WP5): سطر المرحَّل
  --     سحب كميته بالضبط من مخزن رأسه (ومن دفعته المسمّاة بس إذا سمّاها)، وكل حركة صرف بسطر مرحَّل سالبة أصلاً. الجرد (WP5):
  --     سطر المرحَّل سحب نقصه بالضبط (المتاح والمنتهي) ودفعات زيادته بكميتها، والمسوّدة بلاهن؛ وكل حركة جرد بسطر مرحَّل، والموجبة
  --     الأصلية على دفعة زيادة سطرها. ومراجعة WP5: فرقا المرحَّل = المعدود − اللقطة؛ والنقص منقسم بانتهاء الدفعة بيوم الجرد (المادّة
  --     اللي تتابعه، لقطتها المنتهية مو فارغة): المتاح بعلامة الانتهاء والمنتهي بلاها، فسحب منتهٍ بلا علامة بغير «منتهي» السطر
  --     ينمسك؛ ودفعة الزيادة بمادّة السطر ومخزنه ويومه، وانتهاؤها انتهاء جزئها (الصالح أو المنتهي) ووقت فقسها للأفراخ بس.
  select 'doc_moves', count(*) from (
    select tl.id from public.transfer_lines tl
    join public.transfers t on t.org_id = tl.org_id and t.id = tl.doc_id
    cross join lateral (
      select coalesce(sum(x.qty), 0) as received
      from public.stock_moves x
      where x.org_id = tl.org_id and x.doc_kind = 'transfer' and x.doc_id = tl.doc_id and x.doc_line_id = tl.id
        and x.warehouse_id = tl.to_warehouse_id and x.qty > 0 and x.reverses_move_id is null
    ) as r
    cross join lateral (
      select coalesce(sum(-x.qty), 0) as drawn, count(*) as pieces,
        count(*) filter (where exists (select 1 from public.stock_moves r where r.org_id = x.org_id and r.reverses_move_id = x.id)) as reversed
      from public.stock_moves x
      where x.org_id = tl.org_id and x.doc_kind = 'transfer' and x.doc_id = tl.doc_id and x.doc_line_id = tl.id
        and x.warehouse_id = tl.from_warehouse_id and x.qty < 0 and x.reverses_move_id is null
    ) as s
    -- والمستلم بنفس الكمية (مراية ضاعت أو تكرّرت بقيمة صفر ما يشوفها الحفظ ولا mirror_pairs).
    where (t.doc_no is not null and (s.drawn <> tl.qty_base or r.received <> tl.qty_base)) or (t.doc_no is null and (s.pieces > 0 or r.received > 0))
      or (t.status = 'posted' and s.reversed > 0) or (t.status = 'void' and s.reversed <> s.pieces)
    union all
    select x.id from public.stock_moves x
    left join public.transfers t on t.org_id = x.org_id and t.id = x.doc_id
    left join public.transfer_lines tl on tl.org_id = x.org_id and tl.id = x.doc_line_id and tl.doc_id = x.doc_id
    where x.doc_kind = 'transfer'
      and (t.id is null or t.doc_no is null or tl.id is null or tl.item_id <> x.item_id
        or x.warehouse_id not in (t.from_warehouse_id, t.to_warehouse_id)
        or (x.reverses_move_id is null and (x.warehouse_id = t.from_warehouse_id) <> (x.qty < 0))
        or (x.reverses_move_id is not null and t.status <> 'void')
        or (t.status = 'void' and x.reverses_move_id is null
          and not exists (select 1 from public.stock_moves r where r.org_id = x.org_id and r.reverses_move_id = x.id)))
    union all
    select ol.id from public.opening_lines ol
    join public.opening_docs o on o.org_id = ol.org_id and o.id = ol.doc_id
    cross join lateral (
      select count(*) as n,
        count(*) filter (where l.item_id = ol.item_id and l.warehouse_id = o.warehouse_id and l.qty_in = ol.qty_base and l.value_in = ol.value
          and l.received_on = o.on_date and l.expiry_on is not distinct from ol.expiry_on and l.born_at is not distinct from ol.born_at) as exact
      from public.stock_lots l
      where l.org_id = ol.org_id and l.source_kind = 'opening' and l.source_id = ol.doc_id and l.source_line_id = ol.id
    ) as s
    where (o.posted_at is not null and (s.n <> 1 or s.exact <> 1)) or (o.posted_at is null and s.n > 0)
    union all
    select x.id from public.stock_moves x
    join public.stock_lots l on l.org_id = x.org_id and l.id = x.lot_id
    left join public.opening_docs o on o.org_id = x.org_id and o.id = x.doc_id
    where x.doc_kind = 'opening'
      and (o.id is null or o.posted_at is null or l.source_kind <> 'opening' or l.source_id <> x.doc_id
        or l.source_line_id is distinct from x.doc_line_id
        or (x.reverses_move_id is not null and o.status <> 'void')
        or (o.status = 'void' and x.reverses_move_id is null
          and not exists (select 1 from public.stock_moves r where r.org_id = x.org_id and r.reverses_move_id = x.id)))
    union all
    select ul.id from public.stock_use_lines ul
    join public.stock_uses u on u.org_id = ul.org_id and u.id = ul.doc_id
    cross join lateral (
      select coalesce(sum(-x.qty), 0) as drawn, count(*) as pieces,
        count(*) filter (where ul.lot_id is not null and x.lot_id <> ul.lot_id) as foreign_lots,
        count(*) filter (where exists (select 1 from public.stock_moves r where r.org_id = x.org_id and r.reverses_move_id = x.id)) as reversed
      from public.stock_moves x
      where x.org_id = ul.org_id and x.doc_kind = 'stock_use' and x.doc_id = ul.doc_id and x.doc_line_id = ul.id and x.qty < 0 and x.reverses_move_id is null
    ) as s
    where (u.doc_no is not null and s.drawn <> ul.qty_base) or (u.doc_no is null and s.pieces > 0) or s.foreign_lots > 0
      or (u.status = 'posted' and s.reversed > 0) or (u.status = 'void' and s.reversed <> s.pieces)
    union all
    select x.id from public.stock_moves x
    left join public.stock_uses u on u.org_id = x.org_id and u.id = x.doc_id
    left join public.stock_use_lines ul on ul.org_id = x.org_id and ul.id = x.doc_line_id and ul.doc_id = x.doc_id
    where x.doc_kind = 'stock_use'
      and (u.id is null or u.doc_no is null or ul.id is null or ul.item_id <> x.item_id or x.warehouse_id <> u.warehouse_id
        or (x.reverses_move_id is null and x.qty > 0)
        or (x.reverses_move_id is not null and u.status <> 'void')
        or (u.status = 'void' and x.reverses_move_id is null
          and not exists (select 1 from public.stock_moves r where r.org_id = x.org_id and r.reverses_move_id = x.id)))
    union all
    select cl.id from public.stock_count_lines cl
    join public.stock_counts k on k.org_id = cl.org_id and k.id = cl.doc_id
    join public.items i on i.org_id = cl.org_id and i.id = cl.item_id
    cross join lateral (
      select
        coalesce(sum(-x.qty) filter (where x.qty < 0 and not private.lot_expired(cl.system_expired_qty is not null, l.expiry_on, k.counted_on)), 0) as drawn,
        coalesce(sum(-x.qty) filter (where x.qty < 0 and private.lot_expired(cl.system_expired_qty is not null, l.expiry_on, k.counted_on)), 0) as drawn_expired,
        count(*) filter (where x.qty < 0
          and x.expiry_checked is distinct from (cl.system_expired_qty is not null and not private.lot_expired(true, l.expiry_on, k.counted_on))) as flags,
        count(*) as pieces,
        count(*) filter (where exists (select 1 from public.stock_moves r where r.org_id = x.org_id and r.reverses_move_id = x.id)) as reversed
      from public.stock_moves x
      join public.stock_lots l on l.org_id = x.org_id and l.id = x.lot_id
      where x.org_id = cl.org_id and x.doc_kind = 'count' and x.doc_id = cl.doc_id and x.doc_line_id = cl.id and x.reverses_move_id is null
    ) as s
    cross join lateral (
      select count(*) as n, coalesce(sum(l.qty_in), 0) as qty,
        count(*) filter (where l.item_id <> cl.item_id or l.warehouse_id <> k.warehouse_id or l.received_on <> k.counted_on
          or l.born_at is distinct from (case when i.kind = 'chick' then cl.gain_born_at end)
          or not ((cl.diff > 0 and l.qty_in = cl.diff and l.expiry_on is not distinct from cl.gain_expiry_on)
            or (cl.expired_diff > 0 and l.qty_in = cl.expired_diff and l.expiry_on is not distinct from cl.gain_expired_expiry_on))) as foreign_lots
      from public.stock_lots l
      where l.org_id = cl.org_id and l.source_kind = 'count_gain' and l.source_id = cl.doc_id and l.source_line_id = cl.id
    ) as g
    where (k.posted_at is not null and (cl.diff is null
        or cl.diff <> cl.counted_qty - cl.system_qty
        or cl.expired_diff is distinct from (case when cl.system_expired_qty is not null then coalesce(cl.counted_expired_qty, 0) - cl.system_expired_qty end)
        or s.drawn <> greatest(-cl.diff, 0) or s.drawn_expired <> greatest(-coalesce(cl.expired_diff, 0), 0) or s.flags > 0
        or g.qty <> greatest(cl.diff, 0) + greatest(coalesce(cl.expired_diff, 0), 0)
        or g.n <> (cl.diff > 0)::int + (coalesce(cl.expired_diff, 0) > 0)::int or g.foreign_lots > 0))
      or (k.posted_at is null and (s.pieces > 0 or g.n > 0))
      or (k.status = 'approved' and s.reversed > 0) or (k.status = 'void' and s.reversed <> s.pieces)
    union all
    select x.id from public.stock_moves x
    left join public.stock_counts k on k.org_id = x.org_id and k.id = x.doc_id
    left join public.stock_count_lines cl on cl.org_id = x.org_id and cl.id = x.doc_line_id and cl.doc_id = x.doc_id
    left join public.stock_lots l on l.org_id = x.org_id and l.id = x.lot_id
    where x.doc_kind = 'count'
      and (k.id is null or k.doc_no is null or cl.id is null or cl.item_id <> x.item_id or x.warehouse_id <> k.warehouse_id
        or (x.reverses_move_id is null and x.qty > 0
          and (l.source_kind <> 'count_gain' or l.source_id <> x.doc_id or l.source_line_id is distinct from x.doc_line_id))
        or (x.reverses_move_id is not null and k.status <> 'void')
        or (k.status = 'void' and x.reverses_move_id is null
          and not exists (select 1 from public.stock_moves r where r.org_id = x.org_id and r.reverses_move_id = x.id)))
    union all
    -- الاستلام (WP6): سطر المرحَّل (والملغى بعد ترحيله) دفعة وحدة بالضبط من سطره، جذر بمادّته وكميته ويومه ومخزنه وانتهائه وفقسه
    --     ورقم دفعة المورّد، والمسوّدة والمطويّة بلا دفعة؛ وكل حركة استلام على دفعة سطرها من مستند مرحَّل، أصليتها بكمية الدفعة
    --     ويوم المستند، والمرحَّل بلا عكسية والملغى كل أصلية منه معكوسة؛ وكل دفعة استلام من سطر مستند مرحَّل.
    select x.id from public.receipt_lines x
    join public.receipts r on r.org_id = x.org_id and r.id = x.doc_id
    cross join lateral (
      select count(*) as lots,
        count(*) filter (where l.item_id = x.item_id and l.warehouse_id = r.warehouse_id and l.qty_in = x.qty_base and l.received_on = r.received_on
          and l.expiry_on is not distinct from x.expiry_on and l.born_at is not distinct from x.born_at
          and l.supplier_lot_no is not distinct from x.supplier_lot_no and l.origin_lot_id is null) as good
      from public.stock_lots l where l.org_id = x.org_id and l.source_kind = 'receipt' and l.source_id = r.id and l.source_line_id = x.id
    ) as k
    where (r.posted_at is not null and (k.lots <> 1 or k.good <> 1)) or (r.posted_at is null and k.lots > 0)
    union all
    select x.id from public.stock_moves x
    left join public.receipts r on r.org_id = x.org_id and r.id = x.doc_id
    left join public.stock_lots l on l.org_id = x.org_id and l.id = x.lot_id
    where x.doc_kind = 'receipt'
      and (r.id is null or r.posted_at is null or l.source_kind <> 'receipt' or l.source_id <> r.id or l.source_line_id is distinct from x.doc_line_id
        or (x.reverses_move_id is null and (x.qty <> l.qty_in or x.moved_on <> r.received_on))
        or (x.reverses_move_id is not null and r.status <> 'void')
        or (r.status = 'void' and x.reverses_move_id is null
          and not exists (select 1 from public.stock_moves z where z.org_id = x.org_id and z.reverses_move_id = x.id)))
    union all
    select l.id from public.stock_lots l
    left join public.receipts r on r.org_id = l.org_id and r.id = l.source_id
    where l.source_kind = 'receipt' and (r.id is null or r.posted_at is null
      or not exists (select 1 from public.receipt_lines y where y.org_id = l.org_id and y.doc_id = r.id and y.id = l.source_line_id))
    union all
    -- المرتجع (WP7، E15): سطر المرحَّل (والملغى بعد ترحيله) سحب واحد بكميته بالضبط من دفعته (دفعة سطر الاستلام الجذر بمخزنه) بيوم
    --     المرتجع وبلا قاعدة الانتهاء (المنتهي يُرجَع، FOUNDATION ٤٧٦)، والمسوّدة والمطويّة بلا حركات؛ والمرحَّل بلا عكسية والملغى كل
    --     أصلية معكوسة؛ وكل حركة مرتجع بسطر من مستند مرحَّل، أصليتها سالبة.
    select sl.id from public.supplier_return_lines sl
    join public.supplier_returns s on s.org_id = sl.org_id and s.id = sl.doc_id
    cross join lateral (
      select coalesce(sum(-x.qty), 0) as drawn, count(*) as pieces,
        count(*) filter (where x.lot_id <> sl.lot_id or x.moved_on <> s.returned_on or x.expiry_checked is distinct from false) as foreign_pieces,
        count(*) filter (where exists (select 1 from public.stock_moves z where z.org_id = x.org_id and z.reverses_move_id = x.id)) as reversed
      from public.stock_moves x
      where x.org_id = sl.org_id and x.doc_kind = 'supplier_return' and x.doc_id = sl.doc_id and x.doc_line_id = sl.id and x.reverses_move_id is null
    ) as m
    where (s.posted_at is not null and (m.drawn <> sl.qty_base or m.pieces <> 1)) or (s.posted_at is null and m.pieces > 0) or m.foreign_pieces > 0
      or (s.status = 'posted' and m.reversed > 0) or (s.status = 'void' and m.reversed <> m.pieces)
      or not exists (select 1 from public.stock_lots l join public.receipt_lines rl on rl.org_id = l.org_id and rl.id = l.source_line_id
        where l.org_id = sl.org_id and l.id = sl.lot_id and l.source_kind = 'receipt' and l.source_id = s.receipt_id and l.origin_lot_id is null
          and l.warehouse_id = s.warehouse_id and rl.id = sl.receipt_line_id and rl.item_id = sl.item_id)
    union all
    select x.id from public.stock_moves x
    left join public.supplier_returns s on s.org_id = x.org_id and s.id = x.doc_id
    left join public.supplier_return_lines sl on sl.org_id = x.org_id and sl.id = x.doc_line_id and sl.doc_id = x.doc_id
    where x.doc_kind = 'supplier_return'
      and (s.id is null or s.posted_at is null or sl.id is null or sl.item_id <> x.item_id or x.warehouse_id <> s.warehouse_id
        or (x.reverses_move_id is null and x.qty > 0)
        or (x.reverses_move_id is not null and s.status <> 'void')
        or (s.status = 'void' and x.reverses_move_id is null
          and not exists (select 1 from public.stock_moves z where z.org_id = x.org_id and z.reverses_move_id = x.id)))
    union all
    -- تصحيح السعر (WP7، E5): كل حركة تقييم بكمية صفر من تصحيح موجود، على دفعة من عائلة سطره (الجذر أو مرآته)؛ والمرحَّل بلا عكسية
    --     والملغى كل أصلية معكوسة.
    select x.id from public.stock_moves x
    left join public.receipt_revaluations v on v.org_id = x.org_id and v.id = x.doc_id
    left join public.stock_lots l on l.org_id = x.org_id and l.id = x.lot_id
    left join public.stock_lots root on root.org_id = x.org_id and root.id = coalesce(l.origin_lot_id, l.id)
    where x.doc_kind = 'receipt_revalue'
      and (v.id is null or x.qty <> 0 or x.doc_line_id is distinct from v.receipt_line_id or root.source_kind <> 'receipt'
        or root.source_line_id is distinct from v.receipt_line_id
        or (x.reverses_move_id is not null and v.status <> 'void')
        or (v.status = 'void' and x.reverses_move_id is null
          and not exists (select 1 from public.stock_moves z where z.org_id = x.org_id and z.reverses_move_id = x.id)))
  ) as v
  union all
  -- 12. الصرف = مصروفه (WP5): مصروف المستند الأصلي = Σ قيم سحبه الأصلي، والصافي = صافي الحركات (الملغى صفر بالاثنين)، ومصروف أصلي
  --     واحد بالأكثر بتصنيف المستند ووحدة مخزنه؛ وماكو مصروف صرف بلا مستند.
  select 'use_expense', count(*) from (
    select u.id from public.stock_uses u
    join public.warehouses w on w.org_id = u.org_id and w.id = u.warehouse_id
    cross join lateral (
      select coalesce(-sum(m.value) filter (where m.reverses_move_id is null), 0) as drawn, coalesce(-sum(m.value), 0) as net
      from public.stock_moves m where m.org_id = u.org_id and m.doc_kind = 'stock_use' and m.doc_id = u.id
    ) as s
    cross join lateral (
      select coalesce(sum(e.amount) filter (where e.reverses_id is null), 0) as original, coalesce(sum(e.amount), 0) as net,
        count(*) filter (where e.reverses_id is null) as originals,
        count(*) filter (where e.category_id is distinct from u.category_id or e.division_id <> w.division_id or e.source <> 'stock') as foreign_rows
      from public.expenses e where e.org_id = u.org_id and e.doc_kind = 'stock_use' and e.doc_id = u.id
    ) as x
    where x.original <> s.drawn or x.net <> s.net or x.originals > 1 or x.foreign_rows > 0
    union all
    select e.id from public.expenses e
    left join public.stock_uses u on u.org_id = e.org_id and u.id = e.doc_id
    where e.doc_kind = 'stock_use' and (u.id is null or u.posted_at is null)
  ) as v
  union all
  -- 13. الجرد = لقطته (WP5، E55): قيمة نقص كل سطر = Σ قيم سحبه الأصلي، وقيمة زيادته = Σ قيم دفعات زيادته الداخلة؛ و«فرق جرد» الأصلي
  --     للمستند = Σ قيم نقص سطوره (صفر بلا مصروف)، بتصنيف count_diff ووحدة مخزنه، والصافي صفر للملغى؛ والمسوّدة بلا لقطة ولا مصروف.
  select 'count_values', count(*) from (
    select cl.id from public.stock_count_lines cl
    join public.stock_counts k on k.org_id = cl.org_id and k.id = cl.doc_id
    left join public.stock_count_line_costs c on c.org_id = cl.org_id and c.line_id = cl.id
    cross join lateral (
      select coalesce(-sum(m.value) filter (where m.qty < 0 and m.reverses_move_id is null), 0) as short_value
      from public.stock_moves m where m.org_id = cl.org_id and m.doc_kind = 'count' and m.doc_id = cl.doc_id and m.doc_line_id = cl.id
    ) as s
    cross join lateral (
      select coalesce(sum(l.value_in), 0) as gain_value from public.stock_lots l
      where l.org_id = cl.org_id and l.source_kind = 'count_gain' and l.source_id = cl.doc_id and l.source_line_id = cl.id
    ) as g
    where (k.posted_at is not null and (c.id is null or c.shortage_value is distinct from s.short_value or c.gain_value is distinct from g.gain_value))
      or (k.posted_at is null and (c.gain_value is not null or c.shortage_value is not null))
    union all
    select k.id from public.stock_counts k
    join public.warehouses w on w.org_id = k.org_id and w.id = k.warehouse_id
    cross join lateral (
      select coalesce(sum(c.shortage_value), 0) as short_total from public.stock_count_line_costs c where c.org_id = k.org_id and c.doc_id = k.id
    ) as t
    cross join lateral (
      select coalesce(sum(e.amount) filter (where e.reverses_id is null), 0) as original, coalesce(sum(e.amount), 0) as net,
        count(*) filter (where e.reverses_id is null) as originals,
        count(*) filter (where e.division_id <> w.division_id or e.source <> 'stock' or not exists (
          select 1 from public.expense_categories x where x.org_id = e.org_id and x.id = e.category_id and x.system_code = 'count_diff')) as foreign_rows
      from public.expenses e where e.org_id = k.org_id and e.doc_kind = 'count' and e.doc_id = k.id
    ) as x
    where x.originals > 1 or x.foreign_rows > 0 or (k.posted_at is null and x.originals > 0)
      or (k.posted_at is not null and x.original <> t.short_total)
      or (k.status = 'approved' and x.net <> x.original) or (k.status = 'void' and x.net <> 0)
    union all
    select e.id from public.expenses e
    left join public.stock_counts k on k.org_id = e.org_id and k.id = e.doc_id
    where e.doc_kind = 'count' and (k.id is null or k.posted_at is null)
  ) as v
  union all
  -- 14. الخصم (الخطّة 10، E55): لكل استلام مرحَّل (أو ملغى بعد ترحيله) كل سطر مسعَّر بحصّتيه، وΣ حصص الخصم = خصم الفاتورة؛ والمسوّدة
  --     والمطويّة بلا حصص.
  select 'receipt_discount', count(*) from public.receipts r
  cross join lateral (
    select coalesce(sum(a.discount_share), 0) as total, count(*) as priced,
      count(*) filter (where a.discount_share is null or a.charge_share is null) as unstamped,
      count(*) filter (where a.discount_share is not null or a.charge_share is not null) as stamped
    from public.receipt_line_amounts a where a.org_id = r.org_id and a.doc_id = r.id
  ) as a
  where (r.posted_at is not null and (a.unstamped > 0
      or a.priced <> (select count(*) from public.receipt_lines x where x.org_id = r.org_id and x.doc_id = r.id)
      or a.total <> coalesce((select m.discount from public.receipt_amounts m where m.org_id = r.org_id and m.doc_id = r.id), 0)))
    or (r.posted_at is null and a.stamped > 0)
  union all
  -- 15. التحميلات (الخطّة 11، E55): لكل تحميل بمستند مرحَّل Σ حصصه = مبلغه، وحصصه على سطوره المختارة بس؛ ولكل سطر Σ حصصه من كل
  --     التحميلات = charge_share؛ والمسوّدة بلا حصص.
  select 'receipt_charge_shares', (
    select count(*) from public.receipt_charges c
    join public.receipts r on r.org_id = c.org_id and r.id = c.doc_id
    where (r.posted_at is not null
        and c.amount <> coalesce((select sum(s.share) from public.receipt_charge_shares s where s.org_id = c.org_id and s.charge_id = c.id), 0))
      or (r.posted_at is null and exists (select 1 from public.receipt_charge_shares s where s.org_id = c.org_id and s.charge_id = c.id))
      or (not c.all_lines and exists (select 1 from public.receipt_charge_shares s where s.org_id = c.org_id and s.charge_id = c.id
        and not exists (select 1 from public.receipt_charge_lines y where y.org_id = s.org_id and y.charge_id = s.charge_id and y.line_id = s.line_id)))
  ) + (
    select count(*) from public.receipt_line_amounts a
    join public.receipts r on r.org_id = a.org_id and r.id = a.doc_id
    where r.posted_at is not null
      and a.charge_share is distinct from coalesce((select sum(s.share) from public.receipt_charge_shares s where s.org_id = a.org_id and s.line_id = a.line_id), 0)
  )
  union all
  -- 16. قيمة الدفعة (الخطّة 12): لكل سطر مرحَّل قيمة دفعته الداخلة = مبلغه − حصّة الخصم + حصّة التحميلات + حركات تقييمها (WP7).
  select 'receipt_lot_values', count(*) from public.receipt_line_amounts a
  join public.receipts r on r.org_id = a.org_id and r.id = a.doc_id
  join public.stock_lots l on l.org_id = a.org_id and l.source_kind = 'receipt' and l.source_id = r.id and l.source_line_id = a.line_id
  where r.posted_at is not null and l.value_in is distinct from a.line_total - a.discount_share + a.charge_share + coalesce((select sum(z.value) from public.stock_moves z where z.org_id = l.org_id and z.lot_id = l.id and z.doc_kind = 'receipt_revalue'), 0)
  union all
  -- 17. القيود والصناديق (الخطّة 13، E18، E19، E44، E10): لكل استلام مرحَّل أو ملغى بعد ترحيله قيد purchase أصلي واحد للمورّد بدفتر
  --     المستند ويومه ورقمه = −(Σ السطور − الخصم)، أو ولا واحد للصافي صفر؛ وكل تحميل بجهة قيده purchase = −مبلغه على جهته بنفس
  --     الدفتر، وبصندوق حركة receipt_charge = −مبلغه من صندوقه ما انعكست؛ والمدفوع قيد payout أصلي واحد = المدفوع بحركة receipt_paid
  --     أصلية من صندوقه (إلغاؤه بـvoid_party_payment يبقي الأصل ويّا عكسه، E44)، أو ولا واحد. المرحَّل قيود purchase بلا عكس، والملغى
  --     كلها معكوسة وكل تحميل صندوق بمصروف «استلام ملغى» واحد بمبلغه يشير لحركته. وماكو قيد ولا حركة ولا مصروف استلام بلا مستند مرحَّل.
  select 'receipt_entries', (
    select count(*) from public.receipts r
    cross join lateral (
      select coalesce((select sum(a.line_total) from public.receipt_line_amounts a where a.org_id = r.org_id and a.doc_id = r.id), 0)
          - coalesce(m.discount, 0) as net,
        coalesce(m.paid_now, 0) as paid, m.cash_account_id as box
      from (select 1) as one
      left join public.receipt_amounts m on m.org_id = r.org_id and m.doc_id = r.id
    ) as t
    cross join lateral (
      select count(*) as n,
        count(*) filter (where e.party_id = r.party_id and e.book_id = r.book_id and e.amount = -t.net and e.on_date = r.received_on
          and e.doc_no is not distinct from r.doc_no) as good,
        count(*) filter (where exists (select 1 from public.party_entries z where z.org_id = e.org_id and z.reverses_entry_id = e.id)) as reversed
      from public.party_entries e
      where e.org_id = r.org_id and e.doc_kind = 'receipt' and e.doc_id = r.id and e.kind = 'purchase' and e.reverses_entry_id is null
        and not exists (select 1 from public.receipt_charges c where c.org_id = e.org_id and c.party_entry_id = e.id)
    ) as s
    cross join lateral (
      select count(*) as n,
        count(*) filter (where e.party_id = r.party_id and e.book_id = r.book_id and e.amount = t.paid and e.on_date = r.received_on
          and e.doc_no is not distinct from r.doc_no
          and (select count(*) from public.cash_moves x where x.org_id = e.org_id and x.party_entry_id = e.id and x.reverses_move_id is null
            and x.kind = 'receipt_paid' and x.account_id is not distinct from t.box and x.amount = -t.paid and x.doc_kind = 'receipt'
            and x.doc_id = r.id and x.on_date = r.received_on) = 1) as good
      from public.party_entries e
      where e.org_id = r.org_id and e.doc_kind = 'receipt' and e.doc_id = r.id and e.kind = 'payout' and e.reverses_entry_id is null
    ) as p
    cross join lateral (
      select count(*) filter (where
        (c.payee_party_id is not null and not exists (
          select 1 from public.party_entries e where e.org_id = c.org_id and e.id = c.party_entry_id and e.kind = 'purchase'
            and e.party_id = c.payee_party_id and e.book_id = r.book_id and e.amount = -c.amount and e.doc_kind = 'receipt' and e.doc_id = r.id
            and e.on_date = r.received_on and e.reverses_entry_id is null
            and exists (select 1 from public.party_entries z where z.org_id = e.org_id and z.reverses_entry_id = e.id) = (r.status = 'void')))
        or (c.cash_account_id is not null and not exists (
          select 1 from public.cash_moves x where x.org_id = c.org_id and x.id = c.cash_move_id and x.kind = 'receipt_charge'
            and x.account_id = c.cash_account_id and x.amount = -c.amount and x.doc_kind = 'receipt' and x.doc_id = r.id
            and x.on_date = r.received_on and x.reverses_move_id is null
            and not exists (select 1 from public.cash_moves z where z.org_id = x.org_id and z.reverses_move_id = x.id)))
        or (c.cash_account_id is not null and (
          select count(*) from public.expenses x where x.org_id = c.org_id and x.cash_move_id = c.cash_move_id and x.source = 'adjustment'
            and x.doc_kind = 'receipt' and x.doc_id = r.id and x.amount = c.amount and x.reverses_id is null)
          <> case when r.status = 'void' then 1 else 0 end)) as bad
      from public.receipt_charges c where c.org_id = r.org_id and c.doc_id = r.id
    ) as ch
    where r.posted_at is not null and (s.n <> (t.net > 0)::int or s.good <> s.n
      or (r.status = 'posted' and s.reversed > 0) or (r.status = 'void' and s.reversed <> s.n)
      or p.n <> (t.paid > 0)::int or p.good <> p.n or ch.bad > 0)
  ) + (
    select count(*) from (
      select e.id from public.party_entries e
      left join public.receipts r on r.org_id = e.org_id and r.id = e.doc_id
      where e.doc_kind = 'receipt' and (r.id is null or r.posted_at is null
        or (e.reverses_entry_id is null and e.kind not in ('purchase', 'payout'))
        or (e.reverses_entry_id is null and e.kind = 'purchase' and e.party_id <> r.party_id
          and not exists (select 1 from public.receipt_charges c where c.org_id = e.org_id and c.party_entry_id = e.id)))
      union all
      select x.id from public.cash_moves x
      left join public.receipts r on r.org_id = x.org_id and r.id = x.doc_id
      where x.doc_kind = 'receipt' and (r.id is null or r.posted_at is null or x.kind not in ('receipt_paid', 'receipt_charge')
        or (x.kind = 'receipt_charge' and x.reverses_move_id is null
          and not exists (select 1 from public.receipt_charges c where c.org_id = x.org_id and c.cash_move_id = x.id)))
      union all
      select x.id from public.expenses x
      left join public.receipts r on r.org_id = x.org_id and r.id = x.doc_id
      where x.doc_kind = 'receipt' and (r.id is null or r.status <> 'void' or x.source <> 'adjustment'
        or not exists (select 1 from public.expense_categories k where k.org_id = x.org_id and k.id = x.category_id and k.system_code = 'voided_receipt')
        or x.division_id <> (select w.division_id from public.warehouses w where w.org_id = r.org_id and w.id = r.warehouse_id)
        or (x.reverses_id is null and not exists (select 1 from public.receipt_charges c where c.org_id = x.org_id and c.doc_id = r.id and c.cash_move_id = x.cash_move_id))
        or (x.reverses_id is not null and not exists (select 1 from public.expenses y where y.org_id = x.org_id and y.id = x.reverses_id and y.doc_kind = 'receipt' and y.doc_id = x.doc_id)))
    ) as v
  )
  union all
  -- 18. المرتجع (الخطّة 14، E55): لكل مرتجع مرحَّل أو ملغى بعد ترحيله قيد supplier_return أصلي واحد للمورّد بدفتره ويومه ورقمه = Σ
  --     المقبول (أو ولا واحد للمقبول صفر)، ومصروف «فرق مرتجع» أصلي واحد بوحدته = قيمة السحب − المقبول (أو ولا واحد للفرق صفر)، فالقيد
  --     + المصروف = Σ قيم سحبه؛ والمرحَّل بلا عكس والملغى كلها معكوسة؛ والمسوّدة بلاهن؛ وماكو قيد ولا مصروف مرتجع بلا مستند مرحَّل.
  select 'return_ties', (
    select count(*) from public.supplier_returns s
    join public.warehouses w on w.org_id = s.org_id and w.id = s.warehouse_id
    cross join lateral (
      select coalesce((select sum(a.credit_amount) from public.supplier_return_line_amounts a where a.org_id = s.org_id and a.doc_id = s.id), 0) as credit,
        coalesce((select -sum(m.value) from public.stock_moves m where m.org_id = s.org_id and m.doc_kind = 'supplier_return' and m.doc_id = s.id
          and m.reverses_move_id is null), 0) as drawn
    ) as t
    cross join lateral (
      select count(*) filter (where e.reverses_entry_id is null) as n,
        coalesce(sum(e.amount) filter (where e.reverses_entry_id is null), 0) as original,
        count(*) filter (where e.reverses_entry_id is null and (e.party_id <> s.party_id or e.book_id <> s.book_id or e.kind <> 'supplier_return'
          or e.on_date <> s.returned_on or e.doc_no is distinct from s.doc_no)) as foreign_rows,
        count(*) filter (where e.reverses_entry_id is not null) as reversed
      from public.party_entries e where e.org_id = s.org_id and e.doc_kind = 'supplier_return' and e.doc_id = s.id
    ) as p
    cross join lateral (
      select count(*) filter (where x.reverses_id is null) as n,
        coalesce(sum(x.amount) filter (where x.reverses_id is null), 0) as original,
        count(*) filter (where x.source <> 'adjustment' or x.division_id <> w.division_id or not exists (select 1 from public.expense_categories k
          where k.org_id = x.org_id and k.id = x.category_id and k.system_code = 'supplier_return_diff')) as foreign_rows,
        count(*) filter (where x.reverses_id is not null) as reversed
      from public.expenses x where x.org_id = s.org_id and x.doc_kind = 'supplier_return' and x.doc_id = s.id
    ) as x
    where (s.posted_at is null and (p.n > 0 or x.n > 0))
      or (s.posted_at is not null and (p.n <> (t.credit > 0)::int or p.original <> t.credit or p.foreign_rows > 0
        or x.n <> (t.drawn <> t.credit)::int or x.original <> t.drawn - t.credit or x.foreign_rows > 0
        or (s.status = 'posted' and (p.reversed > 0 or x.reversed > 0))
        or (s.status = 'void' and (p.reversed <> p.n or x.reversed <> x.n))))
  ) + (
    select count(*) from (
      select e.id from public.party_entries e
      left join public.supplier_returns s on s.org_id = e.org_id and s.id = e.doc_id
      where (e.doc_kind = 'supplier_return' and (s.id is null or s.posted_at is null or e.kind <> 'supplier_return'))
        or (e.kind = 'supplier_return' and e.doc_kind is distinct from 'supplier_return')
      union all
      select x.id from public.expenses x
      left join public.supplier_returns s on s.org_id = x.org_id and s.id = x.doc_id
      where x.doc_kind = 'supplier_return' and (s.id is null or s.posted_at is null)
    ) as v
  )
  union all
  -- 19. التصحيح (الخطّة 15، E55): لكل تصحيح Σ قيم حركات تقييمه الأصلية = lot_share، وlot_share + المصروف = الفرق = الجديد − القديم،
  --     وقيده adjustment للمورّد (purchase لإكمال سعر شراء بلا سعر، 0020) بدفتر الاستلام = −الفرق، ومصروفه «فرق سعر شراء» بوحدة الاستلام = expense_amount (أو بلاه للصفر)؛
  --     والمرحَّل بلا عكس والملغى كلها معكوسة؛ وماكو قيد ولا مصروف تصحيح بلا تصحيح يشير إله.
  select 'revaluation_ties', (
    select count(*) from public.receipt_revaluations v
    join public.receipts r on r.org_id = v.org_id and r.id = v.receipt_id
    join public.warehouses w on w.org_id = r.org_id and w.id = r.warehouse_id
    cross join lateral (
      select coalesce(sum(m.value) filter (where m.reverses_move_id is null), 0) as moved,
        count(*) filter (where m.reverses_move_id is null) as n,
        count(*) filter (where m.reverses_move_id is not null) as reversed
      from public.stock_moves m where m.org_id = v.org_id and m.doc_kind = 'receipt_revalue' and m.doc_id = v.id
    ) as m
    left join public.party_entries e on e.org_id = v.org_id and e.id = v.party_entry_id
    left join public.expenses x on x.org_id = v.org_id and x.id = v.expense_id
    where m.moved <> v.lot_share or v.lot_share + v.expense_amount <> v.diff or v.diff <> v.new_total - v.old_total
      or e.id is null or e.kind <> case when v.unit_price is not null then 'purchase' else 'adjustment' end or e.amount <> -v.diff or e.party_id <> r.party_id or e.book_id <> r.book_id
      or e.doc_kind is distinct from 'receipt_revalue' or e.doc_id is distinct from v.id
      or (v.expense_amount = 0) <> (v.expense_id is null) or (v.expense_id is not null and x.id is null)
      or (x.id is not null and (x.amount <> v.expense_amount or x.source <> 'adjustment' or x.division_id <> w.division_id
        or x.doc_kind is distinct from 'receipt_revalue' or x.doc_id is distinct from v.id
        or not exists (select 1 from public.expense_categories k where k.org_id = x.org_id and k.id = x.category_id and k.system_code = 'purchase_price_diff')))
      or (v.status = 'posted' and (m.reversed > 0
        or exists (select 1 from public.party_entries z where z.org_id = v.org_id and z.reverses_entry_id = v.party_entry_id)
        or exists (select 1 from public.expenses z where z.org_id = v.org_id and z.reverses_id = v.expense_id)))
      or (v.status = 'void' and (m.reversed <> m.n
        or not exists (select 1 from public.party_entries z where z.org_id = v.org_id and z.reverses_entry_id = v.party_entry_id)
        or (v.expense_id is not null and not exists (select 1 from public.expenses z where z.org_id = v.org_id and z.reverses_id = v.expense_id))))
  ) + (
    select count(*) from (
      select e.id from public.party_entries e
      where e.doc_kind = 'receipt_revalue' and e.reverses_entry_id is null
        and not exists (select 1 from public.receipt_revaluations v where v.org_id = e.org_id and v.party_entry_id = e.id)
      union all
      select x.id from public.expenses x
      where x.doc_kind = 'receipt_revalue' and x.reverses_id is null
        and not exists (select 1 from public.receipt_revaluations v where v.org_id = x.org_id and v.expense_id = x.id)
    ) as v
  )
$$;

-- public.sales_overview كما في 0021_sales.sql.
create or replace function public.sales_overview(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_result jsonb;
begin
  perform private.require('read');
  if not public.can_see_sales() then
    raise exception 'forbidden' using hint = 'المبيعات لأدوار المبيعات فقط.';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'period_required' using hint = 'حدّد المدّة: من تاريخ إلى تاريخ لا يسبقه.';
  end if;
  with listed as (
    select s.id, s.doc_no, s.sold_on, s.status, case when s.payment = 'cash' and not exists (select 1 from public.party_entries r where r.org_id = s.org_id
        and r.reverses_entry_id = s.payment_entry_id) then 'cash' else 'credit' end as payment,
      s.payment = 'cash' and exists (select 1 from public.party_entries r where r.org_id = s.org_id and r.reverses_entry_id = s.payment_entry_id) as refunded,
      s.party_id, p.name as party_name, s.warehouse_id, w.name as warehouse_name,
      l.item_id, i.name as item_name, l.qty, l.base_unit, l.unit_price, l.line_total, c.cost, s.posted_at
    from public.sales_invoices s
    join public.sales_lines l on l.org_id = s.org_id and l.sale_id = s.id and l.line_no = 1
    join public.sales_line_costs c on c.org_id = l.org_id and c.line_id = l.id
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    join public.parties p on p.org_id = s.org_id and p.id = s.party_id
    join public.warehouses w on w.org_id = s.org_id and w.id = s.warehouse_id
    where s.org_id = v_org and s.sold_on between p_from and p_to and public.in_scope_wh(s.warehouse_id)
  ), ordered as (
    select r.*, row_number() over (order by r.sold_on desc, r.posted_at desc, r.id desc) as n from listed r
  )
  select jsonb_build_object('from', p_from, 'to', p_to, 'today', public.app_today(), 'can_record', public.can('sale.record'), 'can_void', public.can('void'),
    'rows', coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'doc_no', o.doc_no, 'sold_on', o.sold_on, 'status', o.status, 'payment', o.payment,
        'payment_refunded', o.refunded,
        'party_id', o.party_id, 'party_name', o.party_name, 'warehouse_id', o.warehouse_id, 'warehouse_name', o.warehouse_name,
        'item_id', o.item_id, 'item_name', o.item_name, 'qty', o.qty::text, 'base_unit', o.base_unit, 'free', o.line_total = 0,
        'money', jsonb_build_object('unit_price', o.unit_price::text, 'line_total', o.line_total::text),
        'cost', jsonb_build_object('money', jsonb_build_object('cost', o.cost::text, 'profit', (o.line_total - o.cost)::text)))
      order by o.n) filter (where o.n <= 1000), '[]'::jsonb),
    'more', count(*) > 1000,
    'totals', jsonb_build_object('count', (count(*) filter (where o.status = 'posted'))::int, 'voided', (count(*) filter (where o.status = 'void'))::int,
      'money', jsonb_build_object('revenue', coalesce(sum(o.line_total) filter (where o.status = 'posted'), 0)::text,
        'cash', coalesce(sum(o.line_total) filter (where o.status = 'posted' and o.payment = 'cash'), 0)::text,
        'credit', coalesce(sum(o.line_total) filter (where o.status = 'posted' and o.payment = 'credit'), 0)::text),
      'cost', jsonb_build_object('money', jsonb_build_object('cost', coalesce(sum(o.cost) filter (where o.status = 'posted'), 0)::text,
        'profit', coalesce(sum(o.line_total - o.cost) filter (where o.status = 'posted'), 0)::text))))
  into v_result
  from ordered o;
  return private.sale_view(v_result);
end
$$;

-- public.sales_report كما في 0021_sales.sql.
create or replace function public.sales_report(p_from date, p_to date, p_group text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_result jsonb;
begin
  perform private.require('read');
  if not public.can_see_sales() then
    raise exception 'forbidden' using hint = 'المبيعات لأدوار المبيعات فقط.';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'period_required' using hint = 'حدّد المدّة: من تاريخ إلى تاريخ لا يسبقه.';
  end if;
  if p_group is null or p_group not in ('party', 'item', 'day') then
    raise exception 'bad_group' using hint = 'اختر التجميع: بالجهة أو بالمادّة أو باليوم.';
  end if;
  with listed as (
    select case p_group when 'party' then s.party_id::text when 'item' then l.item_id::text else s.sold_on::text end as key,
      case p_group when 'party' then p.name when 'item' then i.name else to_char(s.sold_on, 'DD/MM/YYYY') end as label,
      l.item_id, l.base_unit, l.qty, l.line_total, c.cost, s.sold_on
    from public.sales_invoices s
    join public.sales_lines l on l.org_id = s.org_id and l.sale_id = s.id
    join public.sales_line_costs c on c.org_id = l.org_id and c.line_id = l.id
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    join public.parties p on p.org_id = s.org_id and p.id = s.party_id
    where s.org_id = v_org and s.status = 'posted' and s.sold_on between p_from and p_to and public.in_scope_wh(s.warehouse_id)
  ), grouped as (
    select r.key, min(r.label) as label, count(*)::int as count, sum(r.line_total) as revenue, sum(r.cost) as cost,
      case when p_group = 'item' then sum(r.qty) end as qty, case when p_group = 'item' then min(r.base_unit) end as base_unit, max(r.sold_on) as last_on
    from listed r group by r.key
  )
  select jsonb_build_object('from', p_from, 'to', p_to, 'group', p_group,
    'rows', coalesce(jsonb_agg(jsonb_build_object('key', g.key, 'label', g.label, 'count', g.count, 'qty', g.qty::text, 'base_unit', g.base_unit,
        'money', jsonb_build_object('revenue', g.revenue::text),
        'cost', jsonb_build_object('money', jsonb_build_object('cost', g.cost::text, 'profit', (g.revenue - g.cost)::text)))
      order by case when p_group = 'day' then g.key end desc, g.revenue desc, g.label collate "C", g.key), '[]'::jsonb),
    'totals', jsonb_build_object('count', coalesce(sum(g.count), 0)::int, 'money', jsonb_build_object('revenue', coalesce(sum(g.revenue), 0)::text),
      'cost', jsonb_build_object('money', jsonb_build_object('cost', coalesce(sum(g.cost), 0)::text, 'profit', coalesce(sum(g.revenue - g.cost), 0)::text))))
  into v_result
  from grouped g;
  return private.sale_view(v_result);
end
$$;

-- private.cash_class كما في 0024_money_overview.sql.
create or replace function private.cash_class(p_kind text, p_doc_kind text) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case
    when p_kind = 'party_payment' and p_doc_kind is null then 'customer_receipt'
    when p_kind = 'party_payment' and p_doc_kind = 'sale' then 'cash_sale'
    when p_kind = 'party_payout' and p_doc_kind is null then 'supplier_payment'
    when p_kind = 'receipt_paid' then 'cash_purchase'
    when p_kind = 'receipt_charge' then 'purchase_charge'
    when p_kind = 'expense' then 'expense'
    when p_kind = 'transfer' then 'transfer'
    when p_kind = 'opening' then 'opening'
    else 'other'
  end
$$;

-- private.entry_detail كما في 0024_money_overview.sql.
create or replace function private.entry_detail(p_entry uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  e public.party_entries;
  v_box jsonb;
  v_out jsonb;
begin
  select * into e from public.party_entries where org_id = v_org and id = p_entry;
  if e.id is null or e.reverses_entry_id is not null or e.doc_kind is null then
    return null;
  end if;
  if e.doc_kind = 'receipt' then
    -- أجرة شراء دَين لجهة (القيد قيدها هي، لا قيد المورّد).
    if exists (select 1 from public.receipt_charges c where c.org_id = v_org and c.party_entry_id = e.id) then
      select jsonb_build_object('type', 'purchase_charge', 'doc_id', d.id, 'doc_no', d.doc_no, 'label', c.label, 'amount', c.amount::text,
          'warehouse', jsonb_build_object('id', w.id, 'name', w.name))
      into v_out
      from public.receipt_charges c
      join public.receipts d on d.org_id = c.org_id and d.id = c.doc_id
      join public.warehouses w on w.org_id = d.org_id and w.id = d.warehouse_id
      where c.org_id = v_org and c.party_entry_id = e.id;
      return v_out;
    end if;
    if e.kind = 'payout' then
      select jsonb_build_object('id', a.id, 'name', a.name) into v_box
      from public.cash_moves m join public.cash_accounts a on a.org_id = m.org_id and a.id = m.account_id
      where m.org_id = v_org and m.party_entry_id = e.id
      limit 1;
      select jsonb_build_object('type', 'purchase_payment', 'doc_id', d.id, 'doc_no', d.doc_no, 'account', v_box)
      into v_out
      from public.receipts d where d.org_id = v_org and d.id = e.doc_id;
      return v_out;
    end if;
    select jsonb_build_object('type', 'purchase', 'doc_id', d.id, 'doc_no', d.doc_no, 'status', d.status, 'received_on', d.received_on,
        'warehouse', jsonb_build_object('id', w.id, 'name', w.name),
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object('line_no', l.line_no, 'item_id', l.item_id, 'item_name', i.name, 'qty', l.qty_in_unit::text,
              'unit_label', l.unit_label,
              'unit_price', case when la.line_total is not null and l.qty_in_unit > 0 then private._mul_div_round2(la.line_total, 1, l.qty_in_unit)::text end,
              'amount', la.line_total::text)
            order by l.line_no)
          from public.receipt_lines l
          join public.items i on i.org_id = l.org_id and i.id = l.item_id
          left join public.receipt_line_amounts la on la.org_id = l.org_id and la.line_id = l.id
          where l.org_id = v_org and l.doc_id = d.id), '[]'::jsonb),
        'lines_total', t.lines_total::text,
        'discount', coalesce(ra.discount, 0)::text,
        'charges', coalesce((
          select jsonb_agg(jsonb_build_object('label', c.label, 'amount', c.amount::text,
              'paid', case when c.cash_account_id is not null then 'cash' when c.payee_party_id is not null then 'party' end)
            order by c.charge_no)
          from public.receipt_charges c where c.org_id = v_org and c.doc_id = d.id), '[]'::jsonb),
        'net', (t.lines_total - coalesce(ra.discount, 0))::text,
        'paid_now', coalesce(ra.paid_now, 0)::text,
        'account', (select jsonb_build_object('id', a.id, 'name', a.name) from public.cash_accounts a where a.org_id = v_org and a.id = ra.cash_account_id))
    into v_out
    from public.receipts d
    join public.warehouses w on w.org_id = d.org_id and w.id = d.warehouse_id
    left join public.receipt_amounts ra on ra.org_id = d.org_id and ra.doc_id = d.id
    cross join lateral (
      select coalesce(sum(la.line_total), 0) as lines_total from public.receipt_line_amounts la where la.org_id = d.org_id and la.doc_id = d.id
    ) as t
    where d.org_id = v_org and d.id = e.doc_id;
    return v_out;
  elsif e.doc_kind = 'sale' then
    if e.kind = 'payment' then
      select jsonb_build_object('type', 'sale_payment', 'doc_id', s.id, 'doc_no', s.doc_no,
          'account', (select jsonb_build_object('id', a.id, 'name', a.name) from public.cash_accounts a where a.org_id = v_org and a.id = s.cash_account_id))
      into v_out
      from public.sales_invoices s where s.org_id = v_org and s.id = e.doc_id;
      return v_out;
    end if;
    select jsonb_build_object('type', 'sale', 'doc_id', s.id, 'doc_no', s.doc_no, 'status', s.status, 'sold_on', s.sold_on,
        'warehouse', jsonb_build_object('id', w.id, 'name', w.name), 'payment', s.payment,
        'account', (select jsonb_build_object('id', a.id, 'name', a.name) from public.cash_accounts a where a.org_id = v_org and a.id = s.cash_account_id),
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object('line_no', l.line_no, 'item_id', l.item_id, 'item_name', i.name, 'qty', l.qty::text,
              'base_unit', l.base_unit, 'unit_price', l.unit_price::text, 'amount', l.line_total::text)
            order by l.line_no)
          from public.sales_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
          where l.org_id = v_org and l.sale_id = s.id), '[]'::jsonb),
        'total', coalesce((select sum(l.line_total) from public.sales_lines l where l.org_id = v_org and l.sale_id = s.id), 0)::text)
    into v_out
    from public.sales_invoices s join public.warehouses w on w.org_id = s.org_id and w.id = s.warehouse_id
    where s.org_id = v_org and s.id = e.doc_id;
    return v_out;
  elsif e.doc_kind = 'supplier_return' then
    select jsonb_build_object('type', 'supplier_return', 'doc_id', r.id, 'doc_no', r.doc_no, 'status', r.status, 'returned_on', r.returned_on,
        'receipt_id', r.receipt_id, 'receipt_doc_no', (select d.doc_no from public.receipts d where d.org_id = v_org and d.id = r.receipt_id),
        'warehouse', jsonb_build_object('id', w.id, 'name', w.name),
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object('line_no', l.line_no, 'item_id', l.item_id, 'item_name', i.name, 'qty', l.qty_base::text,
              'base_unit', rl.base_unit, 'amount', la.credit_amount::text)
            order by l.line_no)
          from public.supplier_return_lines l
          join public.items i on i.org_id = l.org_id and i.id = l.item_id
          join public.receipt_lines rl on rl.org_id = l.org_id and rl.id = l.receipt_line_id
          left join public.supplier_return_line_amounts la on la.org_id = l.org_id and la.line_id = l.id
          where l.org_id = v_org and l.doc_id = r.id), '[]'::jsonb),
        'total', coalesce((select sum(la.credit_amount) from public.supplier_return_line_amounts la where la.org_id = v_org and la.doc_id = r.id), 0)::text)
    into v_out
    from public.supplier_returns r join public.warehouses w on w.org_id = r.org_id and w.id = r.warehouse_id
    where r.org_id = v_org and r.id = e.doc_id;
    return v_out;
  elsif e.doc_kind = 'expense' then
    select jsonb_build_object('type', 'expense', 'expense_id', x.id, 'category', c.name, 'division_kind', d.kind, 'note', x.note, 'for_month', x.for_month)
    into v_out
    from public.expenses x
    join public.expense_categories c on c.org_id = x.org_id and c.id = x.category_id
    join public.divisions d on d.org_id = x.org_id and d.id = x.division_id
    where x.org_id = v_org and x.id = e.doc_id;
    return v_out;
  elsif e.doc_kind = 'receipt_revalue' then
    -- تسعير شراء سُجّل بلا سعر (kind purchase) أو تصحيح سعر (adjustment): سطر واحد لكلّ قيد.
    select jsonb_build_object('type', 'revaluation', 'pricing', e.kind = 'purchase', 'receipt_id', v.receipt_id, 'receipt_doc_no', d.doc_no,
        'item_name', i.name, 'qty', l.qty_in_unit::text, 'unit_label', l.unit_label, 'unit_price', v.unit_price::text,
        'old_total', v.old_total::text, 'new_total', v.new_total::text, 'diff', v.diff::text)
    into v_out
    from public.receipt_revaluations v
    join public.receipts d on d.org_id = v.org_id and d.id = v.receipt_id
    join public.receipt_lines l on l.org_id = v.org_id and l.id = v.receipt_line_id
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where v.org_id = v_org and v.party_entry_id = e.id;
    return v_out;
  end if;
  return null;
end
$$;

-- private.money_sales كما في 0024_money_overview.sql.
create or replace function private.money_sales(p_from date, p_to date, p_division uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with x as (
    select s.id, l.line_total, c.cost
    from public.sales_invoices s
    join public.ledger_books b on b.org_id = s.org_id and b.id = s.book_id
    join public.sales_lines l on l.org_id = s.org_id and l.sale_id = s.id
    left join public.sales_line_costs c on c.org_id = l.org_id and c.line_id = l.id
    where s.org_id = public.auth_org() and s.status = 'posted' and s.sold_on between p_from and p_to and public.in_scope_book(s.book_id)
      and (p_division is null or b.division_id = p_division)
  )
  select jsonb_build_object('count', count(distinct x.id)::int, 'revenue', coalesce(sum(x.line_total), 0)::text,
    'cost', case when public.can_see_cost() then coalesce(sum(x.cost), 0)::text end,
    'gross', case when public.can_see_cost() then (coalesce(sum(x.line_total), 0) - coalesce(sum(x.cost), 0))::text end)
  from x
$$;

-- public.verify_money كما في 0024_money_overview.sql.
create or replace function public.verify_money() returns table (check_name text, violations bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_bad bigint := 0;
  v_org record;
  v_user uuid;
  v_over jsonb;
  v_recv jsonb;
  v_pay jsonb;
  v_cross boolean;
begin
  return query
  with rem as (
    select e.org_id, e.party_id, e.book_id, e.amount, abs(e.amount) - coalesce((
      select sum(a.amount) from public.party_allocations a
      where a.org_id = e.org_id and a.party_id = e.party_id and a.book_id = e.book_id
        and ((e.amount > 0 and a.debit_entry_id = e.id) or (e.amount < 0 and a.credit_entry_id = e.id))
    ), 0) as remaining
    from public.party_entries e
  )
  select 'open_both_sides'::text, count(*) from (
    select r.org_id, r.party_id, r.book_id from rem r where r.remaining > 0
    group by r.org_id, r.party_id, r.book_id having bool_or(r.amount > 0) and bool_or(r.amount < 0)) as x
  union all
  select 'purchase_detail_total', count(*) from public.party_entries e
  join public.receipts d on d.org_id = e.org_id and d.id = e.doc_id
  where e.doc_kind = 'receipt' and e.kind = 'purchase' and e.reverses_entry_id is null and e.party_id = d.party_id
    and not exists (select 1 from public.receipt_charges c where c.org_id = e.org_id and c.party_entry_id = e.id)
    and -e.amount <> coalesce((select sum(la.line_total) from public.receipt_line_amounts la where la.org_id = d.org_id and la.doc_id = d.id), 0)
      - coalesce((select ra.discount from public.receipt_amounts ra where ra.org_id = d.org_id and ra.doc_id = d.id), 0)
  union all
  select 'sale_detail_total', count(*) from public.sales_invoices s
  join public.party_entries e on e.org_id = s.org_id and e.id = s.invoice_entry_id
  where e.amount <> coalesce((select sum(l.line_total) from public.sales_lines l where l.org_id = s.org_id and l.sale_id = s.id), 0)
  union all
  select 'return_detail_total', count(*) from public.party_entries e
  join public.supplier_returns r on r.org_id = e.org_id and r.id = e.doc_id
  where e.doc_kind = 'supplier_return' and e.kind = 'supplier_return' and e.reverses_entry_id is null
    and e.amount <> coalesce((select sum(la.credit_amount) from public.supplier_return_line_amounts la where la.org_id = r.org_id and la.doc_id = r.id), 0)
  union all
  select 'charge_entry_total', count(*) from public.receipt_charges c
  join public.party_entries e on e.org_id = c.org_id and e.id = c.party_entry_id
  where e.amount <> -c.amount or e.party_id is distinct from c.payee_party_id
  union all
  select 'voucher_numbers', count(*) from public.party_entries e
  where e.kind in ('payment', 'payout') and e.doc_kind is null
    and (e.doc_no is null or e.doc_no !~ case when e.kind = 'payment' then '^RC-' else '^PY-' end
      or (select count(*) from public.cash_moves m where m.org_id = e.org_id and m.party_entry_id = e.id) <> 1);

  for v_org in select x.org_id from (select org_id from public.party_entries union select org_id from public.cash_moves) as x order by 1 loop
    select m.user_id into v_user from public.members m
    where m.org_id = v_org.org_id and m.role = 'owner' and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
    order by m.created_at, m.id limit 1;
    continue when v_user is null;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    begin
      v_over := public.money_overview();
      v_recv := public.debts_overview('receivable', null, null, null, 'amount', null, false, null, 1);
      v_pay := public.debts_overview('payable', null, null, null, 'amount', null, false, null, 1);
      -- الأعمار من المتبقّي بعد التوزيع القائم (حالة الآن)، والرصيد حتى اليوم: يتّفقان ما دام لا توزيع يصل قيداً حتى اليوم بقيد بعده.
      -- والترحيل يرفض التاريخ القادم (date_in_future)، فهذا لا يقع بالإنتاج؛ يقع في الحزمة وحدها حين يثبّت ملفّ يوماً أقدم من قيود
      -- منشآت ملفّات قبله، فتُترك مقارنة الأعمار لتلك المنشأة وحدها.
      select exists (
        select 1 from public.party_allocations a
        join public.party_entries d on d.org_id = a.org_id and d.id = a.debit_entry_id
        join public.party_entries c on c.org_id = a.org_id and c.id = a.credit_entry_id
        where a.org_id = v_org.org_id and (d.on_date > public.app_today()) <> (c.on_date > public.app_today()))
      into v_cross;
      v_bad := v_bad + (
        case when (v_over -> 'cash' ->> 'total')::numeric is distinct from coalesce((select sum(m.amount) from public.cash_moves m
          where m.org_id = v_org.org_id and m.on_date <= public.app_today()), 0) then 1 else 0 end
      ) + (
        select count(*) from public.cash_accounts a
        cross join lateral (select coalesce(sum(m.amount), 0) as bal from public.cash_moves m
          where m.org_id = a.org_id and m.account_id = a.id and m.on_date <= public.app_today()) as raw
        left join lateral (select x from jsonb_array_elements(v_over -> 'cash' -> 'boxes') as x where x ->> 'account_id' = a.id::text) as rep on true
        where a.org_id = v_org.org_id and (a.archived_at is null or raw.bal <> 0)
          and (rep.x is null or (rep.x ->> 'balance')::numeric is distinct from raw.bal)
      ) + (
        select case when (v_over -> 'debts' ->> 'receivable')::numeric is distinct from coalesce(sum(greatest(s.balance, 0)), 0)
          or (v_over -> 'debts' ->> 'payable')::numeric is distinct from coalesce(sum(greatest(-s.balance, 0)), 0) then 1 else 0 end
        from (
          select sum(e.amount) as balance from public.party_entries e join public.ledger_books b on b.org_id = e.org_id and b.id = e.book_id
          where e.org_id = v_org.org_id and b.archived_at is null and e.on_date <= public.app_today()
          group by e.party_id, e.book_id
        ) as s
      ) + (
        case when (v_recv -> 'totals' ->> 'amount')::numeric is distinct from (v_over -> 'debts' ->> 'receivable')::numeric
          or (v_pay -> 'totals' ->> 'amount')::numeric is distinct from (v_over -> 'debts' ->> 'payable')::numeric
          or (not v_cross and (select sum((v_recv -> 'totals' -> 'aging' ->> k)::numeric) from unnest(array['d0_30', 'd31_60', 'd61_90', 'd91_plus']) as k)
            is distinct from (v_recv -> 'totals' ->> 'amount')::numeric)
          or (not v_cross and (select sum((v_pay -> 'totals' -> 'aging' ->> k)::numeric) from unnest(array['d0_30', 'd31_60', 'd61_90', 'd91_plus']) as k)
            is distinct from (v_pay -> 'totals' ->> 'amount')::numeric)
        then 1 else 0 end
      );
    exception when others then
      v_bad := v_bad + 1;
    end;
  end loop;
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  return query select 'money_formulas'::text, v_bad;
end
$$;

-- public.flock_month كما في 0026_halls_v2.sql.
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
      'vaccinate', v_active and public.can('flock_day.save'), 'undo_issue', public.can('void')),
    'days', (select jsonb_agg(jsonb_build_object(
        'on', g.d,
        'age', case when g.d < f.placed_on or (f.closed_on is not null and g.d > f.closed_on) then null else f.age_days_at_placement + (g.d - f.placed_on) end,
        'dead', y.dead, 'culled', y.culled, 'feed_kg', y.feed_kg::text, 'note', y.note,
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

-- public.remove_flock_log كما في 0026_halls_v2.sql.
create or replace function public.remove_flock_log(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  l public.flock_logs;
begin
  set local lock_timeout = '5s';
  perform private.require('flock_day.save');
  select * into l from public.flock_logs x where x.org_id = v_org and x.id = p_id for update;
  if l.id is null then
    return jsonb_build_object('id', p_id, 'removed', false);
  end if;
  perform private.flock_for(l.flock_id, true);
  delete from public.flock_logs x where x.org_id = v_org and x.id = l.id;
  return jsonb_build_object('id', l.id, 'removed', true);
end
$$;

-- public.undo_vaccination كما في 0026_halls_v2.sql.
create or replace function public.undo_vaccination(p_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'undo_vaccination';
  v_org uuid := public.auth_org();
  v_cached jsonb;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  m public.flock_vaccinations;
  v_items uuid[];
  v_whs uuid[];
  v_result jsonb;
begin
  set local lock_timeout = '5s';
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'reason', v_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.require('flock_day.save');
  select * into m from public.flock_vaccinations x where x.org_id = v_org and x.id = p_id;
  if m.id is null then
    raise exception 'vaccination_not_found' using hint = 'هذا التأشير غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  perform private.flock_for(m.flock_id, true);
  if m.issue_id is not null and m.status = 'done' then
    perform private.period_guard();
    perform 1 from public.flock_issues y where y.org_id = v_org and y.id = m.issue_id for update;
    perform 1 from public.flocks y where y.org_id = v_org and y.id = m.flock_id for share;
    select array_agg(l.item_id order by l.line_no), array_agg(l.warehouse_id order by l.line_no) into v_items, v_whs
    from public.flock_issue_lines l where l.org_id = v_org and l.issue_id = m.issue_id;
    perform private.lock_masters(v_whs, v_items, false);
    perform private.lock_balances(v_items, v_whs);
  end if;
  select * into m from public.flock_vaccinations x where x.org_id = v_org and x.id = p_id for update;
  if m.status = 'void' then
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', m.id, 'status', 'void', 'issue_voided', m.issue_id is not null));
  end if;
  if v_reason is not null and length(v_reason) > 500 then
    raise exception 'bad_reason' using hint = format('السبب %s حرفاً، والحدّ 500 حرف. اختصره.', length(v_reason));
  end if;
  if m.issue_id is not null then
    perform private.require('void');
    if v_reason is null then
      raise exception 'reason_required' using hint = 'هذا التأشير صُرف معه لقاح من المخزن، وإلغاؤه يُرجع اللقاح: اكتب السبب.';
    end if;
  end if;
  update public.flock_vaccinations x set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
  where x.org_id = v_org and x.id = m.id;
  if m.issue_id is not null then
    perform public.void_flock_issue(m.issue_id, v_reason, private.derived_ref(p_client_ref, 1));
  end if;
  v_result := jsonb_build_object('id', m.id, 'status', 'void', 'issue_voided', m.issue_id is not null);
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;

-- private.report_days كما في 0027_hall_reports.sql.
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
      w.sample_count, w.avg_g, coalesce(i.kg, 0) as given_kg, coalesce(i.unweighed, 0) as given_unweighed
    from g
    left join public.flock_daily r on r.org_id = f.org_id and r.flock_id = f.id and r.on_date = g.d
    left join public.flock_weights w on w.org_id = f.org_id and w.flock_id = f.id and w.on_date = g.d
    left join given i on i.d = g.d
  ), z as (
    select y.*,
      f.placed_count - coalesce(sum(coalesce(y.dead, 0) + coalesce(y.culled, 0)) over (order by y.d rows between unbounded preceding and 1 preceding), 0) as live_start,
      sum(coalesce(y.dead, 0)) over c as dead_cum,
      sum(coalesce(y.culled, 0)) over c as culled_cum,
      round(coalesce(sum(y.feed_kg) over c, 0), 3) as feed_cum_kg,
      count(y.feed_kg) over c as feed_days,
      max(y.d) filter (where y.feed_kg is not null) over c as last_feed,
      sum(y.given_kg) over c as given_cum_kg,
      sum(y.given_unweighed) over c as given_cum_unweighed,
      max(y.d) filter (where y.avg_g is not null) over c as last_weight_on
    from y
    window c as (order by y.d rows unbounded preceding)
  ), v as (
    select z.*, z.live_start - coalesce(z.dead, 0) - coalesce(z.culled, 0) as live_end,
      greatest(coalesce(z.last_feed, f.placed_on - 1), z.d - 1) - f.placed_on + 1 as feed_span,
      lw.avg_g as last_weight_avg_g
    from z
    left join public.flock_weights lw on lw.org_id = f.org_id and lw.flock_id = f.id and lw.on_date = z.last_weight_on
  )
  select v.d, (v.d - f.placed_on + f.age_days_at_placement)::int, (v.d - f.placed_on + 1)::int, v.has_round, v.live_start::bigint, v.dead, v.culled,
    v.live_end::bigint, v.dead_cum::bigint, v.culled_cum::bigint, private.flock_pct(v.dead_cum + v.culled_cum, f.placed_count), v.feed_kg, v.feed_cum_kg,
    v.feed_days::int, v.feed_span::int, v.given_kg, v.given_unweighed::int, v.given_cum_kg, v.given_cum_unweighed::int, v.sample_count, v.avg_g,
    v.last_weight_on, v.last_weight_avg_g,
    case when v.feed_days > 0 and v.feed_days = v.feed_span and v.feed_cum_kg > 0 and v.last_weight_avg_g is not null and v.live_end > 0
      then private._mul_div_round(v.feed_cum_kg, 1000, v.live_end * v.last_weight_avg_g, 3) end,
    v.eggs_total, v.eggs_broken, v.eggs_cracked,
    case when f.kind = 'layer' then private.flock_pct(v.eggs_total, v.live_start) end,
    v.note
  from v
  order by v.d
$$;

-- private.report_day كما في 0027_hall_reports.sql.
create or replace function private.report_day(f public.flocks, p_on date, p_today date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', f.id, 'kind', f.kind, 'status', f.status, 'placed_on', f.placed_on, 'placed_count', f.placed_count, 'age0', f.age_days_at_placement,
    'closed_on', f.closed_on, 'age', r.age, 'day_no', r.day_no, 'round', r.has_round,
    'live_start', r.live_start, 'dead', r.dead, 'culled', r.culled, 'live_end', r.live_end,
    'dead_cum', r.dead_cum, 'culled_cum', r.culled_cum, 'mortality_cum_pct', r.mortality_cum_pct,
    'feed_eaten_kg', round(r.feed_kg, 3)::text, 'feed_eaten_cum_kg', r.feed_cum_kg::text, 'feed_days', r.feed_days, 'feed_span', r.feed_span,
    'feed_given_kg', r.given_kg::text, 'feed_given_unweighed', r.given_unweighed, 'feed_given_cum_kg', r.given_cum_kg::text,
    'feed_given_cum_unweighed', r.given_cum_unweighed, 'feed_left_kg', (r.given_cum_kg - r.feed_cum_kg)::text,
    'weight', case when r.weight_avg_g is not null then jsonb_build_object('sample_count', r.weight_count, 'avg_g', round(r.weight_avg_g, 1)::text) end,
    'last_weight', case when r.last_weight_on is not null then jsonb_build_object('on_date', r.last_weight_on,
      'age', r.last_weight_on - f.placed_on + f.age_days_at_placement, 'avg_g', round(r.last_weight_avg_g, 1)::text) end,
    'fcr', r.fcr::text,
    'eggs_total', case when f.kind = 'layer' then r.eggs_total end,
    'eggs_broken', case when f.kind = 'layer' then r.eggs_broken end,
    'eggs_cracked', case when f.kind = 'layer' then r.eggs_cracked end,
    'hdep', r.hdep, 'note', r.note,
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
  where r.on_date = p_on
$$;

-- private.halls_day_totals كما في 0027_hall_reports.sql.
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
    'feed_given_unweighed', coalesce(sum((e.h -> 'flock' ->> 'feed_given_unweighed')::int), 0)::int)
  from jsonb_array_elements(coalesce(p_halls, '[]'::jsonb)) as e(h)
$$;

-- public.halls_day كما في 0027_hall_reports.sql.
create or replace function public.halls_day(p_on date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_on date := coalesce(p_on, v_today);
  v_sites jsonb;
begin
  perform private.require('read');
  if v_on > v_today then
    raise exception 'future_day' using hint = 'لا تقرير ليوم لم يأتِ بعد.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'halls', s.halls, 'totals', private.halls_day_totals(s.halls))
      order by s.name collate "C", s.id), '[]'::jsonb)
  into v_sites
  from (
    select t.id, t.name, jsonb_agg(jsonb_build_object('hall_id', h.id, 'hall_name', h.name, 'kind', d.kind,
        'flock', case when q.id is not null then private.report_day(q.f, v_on, v_today) end) order by h.name collate "C", h.id) as halls
    from public.halls h
    join public.sites t on t.org_id = h.org_id and t.id = h.site_id
    join public.divisions d on d.org_id = h.org_id and d.id = h.division_id
    left join lateral (
      select x.id, x as f from public.flocks x
      where x.org_id = h.org_id and x.hall_id = h.id and x.placed_on is not null and x.placed_on <= v_on
        and (x.closed_on is null or v_on <= x.closed_on)
      order by x.placed_on desc, x.id
      limit 1) as q on true
    where h.org_id = v_org and public.in_scope_site(h.site_id) and (h.archived_at is null or q.id is not null)
    group by t.id, t.name
  ) as s;
  return jsonb_build_object(
    'on', v_on,
    'today', v_today,
    'prev', exists (select 1 from public.flocks x where x.org_id = v_org and x.placed_on < v_on and public.in_scope_site(x.site_id)),
    'next', v_on < v_today,
    'sites', v_sites,
    'totals', private.halls_day_totals(coalesce((select jsonb_agg(e.h order by s.n, e.n)
      from jsonb_array_elements(v_sites) with ordinality as s(site, n)
      cross join lateral jsonb_array_elements(s.site -> 'halls') with ordinality as e(h, n)), '[]'::jsonb)));
end
$$;

-- public.flock_cycle_report كما في 0027_hall_reports.sql.
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
begin
  perform private.require('read');
  f := private.flock_for(p_flock, false);
  if f.placed_on is null then
    raise exception 'flock_not_placed' using hint = 'هذا الفوج لم يُسكَّن بعد، فلا تقرير له.';
  end if;
  select coalesce(sum(y.dead), 0)::int, coalesce(sum(y.culled), 0)::int, coalesce(sum(y.feed_kg), 0) into v_dead, v_culled, v_consumed
  from public.flock_daily y where y.org_id = f.org_id and y.flock_id = f.id;
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
  -- 0027: الأيّام والأسابيع والأوزان والمؤشّرات حتى «حتى»، من report_days مرّة واحدة.
  v_through := coalesce(f.closed_on, v_today);
  with r as materialized (
    select * from private.report_days(f, v_through)
  ), k as (
    select * from r where r.on_date = v_through
  ), w as (
    select greatest(1, div(r.age + 6, 7))::int as week, r.* from r
  ), wk as (
    select w.week, jsonb_build_object('week', w.week, 'from_age', min(w.age), 'to_age', max(w.age), 'from_on', min(w.on_date), 'to_on', max(w.on_date),
      'days', count(*)::int, 'round_days', (count(*) filter (where w.has_round))::int,
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
  )
  select jsonb_build_object(
    'days', coalesce((select jsonb_agg(jsonb_build_object('on', r.on_date, 'age', r.age, 'day_no', r.day_no, 'round', r.has_round,
        'live_start', r.live_start, 'dead', r.dead, 'culled', r.culled, 'live_end', r.live_end, 'mortality_cum_pct', r.mortality_cum_pct,
        'feed_eaten_kg', round(r.feed_kg, 3)::text, 'feed_eaten_cum_kg', r.feed_cum_kg::text, 'feed_given_kg', r.given_kg::text,
        'feed_given_unweighed', r.given_unweighed, 'feed_given_cum_kg', r.given_cum_kg::text, 'feed_given_cum_unweighed', r.given_cum_unweighed,
        'feed_left_kg', (r.given_cum_kg - r.feed_cum_kg)::text,
        'weight', case when r.weight_avg_g is not null then jsonb_build_object('sample_count', r.weight_count, 'avg_g', round(r.weight_avg_g, 1)::text) end,
        'eggs_total', case when f.kind = 'layer' then r.eggs_total end, 'hdep', r.hdep, 'note', r.note) order by r.on_date) from r), '[]'::jsonb),
    'weeks', coalesce((select jsonb_agg(wk.j order by wk.week) from wk), '[]'::jsonb),
    'weights', coalesce((select jsonb_agg(jsonb_build_object('on_date', x.on_date, 'age', x.on_date - f.placed_on + f.age_days_at_placement,
        'sample_count', x.sample_count, 'avg_g', round(x.avg_g, 1)::text) order by x.on_date)
      from public.flock_weights x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date between f.placed_on and v_through), '[]'::jsonb),
    'kpis', (select jsonb_build_object('days', (select count(*)::int from r), 'age_end', k.age, 'placed', f.placed_count,
        'dead', k.dead_cum, 'culled', k.culled_cum, 'live', k.live_end,
        'mortality_pct', k.mortality_cum_pct, 'livability_pct', (100 - k.mortality_cum_pct::numeric)::text,
        'feed_given_kg', k.given_cum_kg::text, 'feed_eaten_kg', k.feed_cum_kg::text, 'feed_left_kg', (k.given_cum_kg - k.feed_cum_kg)::text,
        'feed_days', k.feed_days, 'feed_span', k.feed_span,
        'feed_per_bird_kg', case when k.feed_cum_kg > 0 and f.placed_count > 0 then private._mul_div_round(k.feed_cum_kg, 1, f.placed_count, 3)::text end,
        'last_weight', case when k.last_weight_on is not null then jsonb_build_object('on_date', k.last_weight_on,
          'age', k.last_weight_on - f.placed_on + f.age_days_at_placement, 'avg_g', round(k.last_weight_avg_g, 1)::text) end,
        'fcr', k.fcr::text,
        'epef', case when k.fcr > 0 and k.last_weight_avg_g > 0 and 100 - k.mortality_cum_pct::numeric > 0 and k.age > 0
          then private._mul_div_round((100 - k.mortality_cum_pct::numeric) * k.last_weight_avg_g, 1, 10 * k.age * k.fcr, 0)::text end)
      from (select 1) as one left join k on true))
  into v_more;
  return private.mask(jsonb_build_object(
    'flock', private.hall_flock_json(f),
    'today', v_today,
    'through', coalesce(f.closed_on, v_today),
    'birds', jsonb_build_object('placed', f.placed_count, 'dead', v_dead, 'culled', v_culled, 'live', f.placed_count - v_dead - v_culled,
      'mortality_pct', private.flock_pct(v_dead + v_culled, f.placed_count)::text),
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
        'total', coalesce(sum(c.amount), 0)::text)
      from public.flock_costs c where c.org_id = f.org_id and c.flock_id = f.id)) || v_more);
end
$$;

-- public.flock_cycles كما في 0027_hall_reports.sql.
create or replace function public.flock_cycles() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_count int;
  v_cycles jsonb;
begin
  perform private.require('read');
  with c as (
    select x.id, x.hall_id, h.name as hall_name, x.site_id, s.name as site_name, x.kind, x.status, x.placed_on, x.closed_on,
      coalesce(x.closed_on, v_today) as through, x.placed_count, x.age_days_at_placement as age0,
      row_number() over (order by x.status = 'active' desc, x.closed_on desc, x.placed_on desc, h.name collate "C", x.id) as n
    from public.flocks x
    join public.halls h on h.org_id = x.org_id and h.id = x.hall_id
    join public.sites s on s.org_id = x.org_id and s.id = x.site_id
    where x.org_id = v_org and x.placed_on is not null and public.in_scope_site(x.site_id)
    order by n
    limit 501
  )
  select count(*)::int, coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'hall_id', c.hall_id, 'hall_name', c.hall_name, 'site_id', c.site_id,
      'site_name', c.site_name, 'kind', c.kind, 'status', c.status, 'placed_on', c.placed_on, 'closed_on', c.closed_on, 'through', c.through,
      'placed_count', c.placed_count, 'age', c.through - c.placed_on + c.age0, 'days', c.through - c.placed_on + 1,
      'live', c.placed_count - b.gone, 'mortality_pct', private.flock_pct(b.gone, c.placed_count)) order by c.n) filter (where c.n <= 500), '[]'::jsonb)
  into v_count, v_cycles
  from c
  cross join lateral (select coalesce(sum(y.dead + y.culled), 0) as gone from public.flock_daily y
    where y.org_id = v_org and y.flock_id = c.id and y.on_date <= c.through) as b;
  return jsonb_build_object('today', v_today, 'more', v_count > 500, 'cycles', v_cycles);
end
$$;

-- ٢) الدوالّ الجديدة (لم يبقَ جسم قديم يناديها):
drop function if exists public.save_weigh_ticket(uuid, int, jsonb);
drop function if exists public.finish_weigh_ticket(uuid, uuid, int);
drop function if exists public.void_weigh_ticket(uuid, text, uuid);
drop function if exists public.record_bird_sale(uuid, uuid, uuid, int, uuid, numeric, numeric, numeric, uuid, text);
drop function if exists public.void_bird_sale(uuid, text, uuid);
drop function if exists public.record_flock_count_adjust(uuid, uuid, uuid, date, int, text, int);
drop function if exists public.close_flock(uuid, uuid, uuid, date, int, int, jsonb, text, jsonb, text, text);
drop function if exists public.reopen_flock(uuid, text, uuid);
drop function if exists public.return_hall_carry(uuid, uuid, uuid, uuid);
drop function if exists public.weigh_ticket(uuid);
drop function if exists public.weigh_ticket_options(uuid);
drop function if exists public.weigh_tickets(date, date, text);
drop function if exists public.bird_sale_form(uuid);
drop function if exists public.bird_sale_detail(uuid);
drop function if exists public.flock_close_form(uuid);
drop function if exists public.flock_sales(uuid);
drop function if exists public.verify_bird_sales();
drop function if exists public.verify_flock_close();
drop function if exists private.bird_sale_result(uuid);
drop function if exists private.bird_sales_groups(date, date, text);
drop function if exists private.bird_sales_overview(date, date);
drop function if exists private.division_main_book(uuid);
drop function if exists private.flock_activity_after(public.flocks, date);
drop function if exists private.flock_close_result(uuid);
drop function if exists private.flock_count_days(uuid);
drop function if exists private.flock_counts_total(uuid);
drop function if exists private.flock_item_lots(uuid, uuid);
drop function if exists private.flock_item_pool(uuid);
drop function if exists private.flock_item_stores(uuid, uuid);
drop function if exists private.flock_live(public.flocks);
drop function if exists private.flock_live_check(public.flocks);
drop function if exists private.flock_return_post(uuid, public.flocks, uuid, uuid, numeric, numeric, date, text, uuid, uuid, text, numeric, numeric, text, uuid);
drop function if exists private.flock_ticketed(uuid, uuid);
drop function if exists private.hall_carry(uuid, date);
drop function if exists private.report_days_extra(public.flocks, date);
drop function if exists private.return_lot(uuid, uuid, date, bigint, date, numeric, numeric, uuid, uuid);
drop function if exists private.ticket_nets(uuid);
drop function if exists private.weigh_ticket_content(uuid);
drop function if exists private.weigh_ticket_json(uuid);
drop function if exists private.ticket_date_block(date);
drop function if exists private.ticket_invoice_block(public.weigh_tickets);
drop function if exists private.bird_sale_refunded(uuid);
drop function if exists private.flock_pool_plan(uuid);
drop function if exists private.flock_alive_days(public.flocks, date);
drop function if exists private.flock_left_in_hall(public.flocks, date);
drop function if exists private.reopen_block(public.flock_closes);

-- ٣) سياسة نطاق سجلّ التدقيق، ثمّ الجداول بترتيب مفاتيحها (سياساتها ومحفّزاتها وفهارسها تسقط معها):
drop policy if exists audit_log_birds_scope on public.audit_log;
drop table if exists public.flock_close_values;
drop table if exists public.flock_return_lines;
drop table if exists public.flock_returns;
drop table if exists public.flock_close_lines;
drop table if exists public.flock_closes;
drop table if exists public.bird_sale_sources;
drop table if exists public.bird_sales;
drop table if exists public.weigh_ticket_weighings;
drop table if exists public.weigh_ticket_stops;
drop table if exists public.weigh_tickets;
drop table if exists public.flock_counts;

-- ٤) القيود الخمسة كما كانت. حركة 'flock_return' ودفعتها وعدّادات WT وBR وFR وكلفة 'flock_return' و'flock_carry' لا تبقى هنا: كلّ واحد منها
--    كُتب مع تذكرة أو فاتورة أو إغلاق، وطريق الرفض أعلاه يوقف التراجع ما دام واحد منها موجوداً. فإن شيل طريق الرفض (ضابط الحزمة) يُضاف القيد
--    القديم بلا فحص الصفوف القائمة (not valid) والملف يكمل ذرّياً، ولا يُحذف صفّ.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'stock_moves_doc_kind_check' and conrelid = 'public.stock_moves'::regclass
    and pg_get_constraintdef(oid) like '%flock_return%') then
    alter table public.stock_moves drop constraint stock_moves_doc_kind_check;
    if exists (select 1 from public.stock_moves m where m.doc_kind = 'flock_return') then
      alter table public.stock_moves add constraint stock_moves_doc_kind_check
        check (doc_kind in ('opening', 'receipt', 'supplier_return', 'receipt_revalue', 'transfer', 'count', 'stock_use', 'production', 'flock_issue',
          'conversion', 'sale')) not valid;
    else
      alter table public.stock_moves add constraint stock_moves_doc_kind_check
        check (doc_kind in ('opening', 'receipt', 'supplier_return', 'receipt_revalue', 'transfer', 'count', 'stock_use', 'production', 'flock_issue',
          'conversion', 'sale'));
    end if;
  end if;
  if exists (select 1 from pg_constraint where conname = 'stock_lots_source_kind_check' and conrelid = 'public.stock_lots'::regclass
    and pg_get_constraintdef(oid) like '%flock_return%') then
    alter table public.stock_lots drop constraint stock_lots_source_kind_check;
    if exists (select 1 from public.stock_lots l where l.source_kind = 'flock_return') then
      alter table public.stock_lots add constraint stock_lots_source_kind_check
        check (source_kind in ('opening', 'receipt', 'transfer', 'count_gain', 'production', 'conversion')) not valid;
    else
      alter table public.stock_lots add constraint stock_lots_source_kind_check
        check (source_kind in ('opening', 'receipt', 'transfer', 'count_gain', 'production', 'conversion'));
    end if;
  end if;
  if exists (select 1 from pg_constraint where conname = 'doc_counters_kind_check' and conrelid = 'public.doc_counters'::regclass
    and pg_get_constraintdef(oid) like '%''WT''%') then
    alter table public.doc_counters drop constraint doc_counters_kind_check;
    if exists (select 1 from public.doc_counters c where c.kind in ('WT', 'BR', 'FR')) then
      alter table public.doc_counters add constraint doc_counters_kind_check
        check (kind in ('PU', 'RT', 'TR', 'CT', 'SU', 'RC', 'PY', 'OF', 'PD', 'FI', 'CV', 'FD', 'MD', 'MS')) not valid;
    else
      alter table public.doc_counters add constraint doc_counters_kind_check
        check (kind in ('PU', 'RT', 'TR', 'CT', 'SU', 'RC', 'PY', 'OF', 'PD', 'FI', 'CV', 'FD', 'MD', 'MS'));
    end if;
  end if;
  if exists (select 1 from pg_constraint where conname = 'flock_costs_doc_kind_check' and conrelid = 'public.flock_costs'::regclass
    and pg_get_constraintdef(oid) like '%flock_carry%') then
    alter table public.flock_costs drop constraint flock_costs_doc_kind_check;
    if exists (select 1 from public.flock_costs k where k.doc_kind <> 'flock_issue') then
      alter table public.flock_costs add constraint flock_costs_doc_kind_check check (doc_kind in ('flock_issue')) not valid;
    else
      alter table public.flock_costs add constraint flock_costs_doc_kind_check check (doc_kind in ('flock_issue'));
    end if;
  end if;
  if exists (select 1 from pg_constraint where conname = 'flock_costs_expense_check' and conrelid = 'public.flock_costs'::regclass
    and pg_get_constraintdef(oid) like '%flock_carry%') then
    alter table public.flock_costs drop constraint flock_costs_expense_check;
    alter table public.flock_costs add constraint flock_costs_expense_check check (doc_kind <> 'flock_issue' or expense_id is null);
  end if;
end
$$;
