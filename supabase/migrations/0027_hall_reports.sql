-- 0027_hall_reports — «تقارير القاعات»، التسليم الأوّل: التقرير اليوميّ لكلّ القاعات ليوم يختاره القارئ، والتقرير الكامل للدورة يوماً بيوم وأسبوعاً
--   بأسبوع بالمؤشّرات، وقائمة الدورات (كلمة المالك 2026-11-12 وأجوبته؛ docs/HALLS_REPORTS_PLAN.md التسليم ١؛ DECISIONS «تقارير القاعات»).
-- المشكلة: بيانات كلّ يوم موجودة لكلّ فوج (الجولة والصرف FI والأدوية والتأشير والأوزان)، لكن لا قارئ يجمع القاعات كلّها ليوم مختار، فيفتح المالك
--   كلّ قاعة وحدها؛ وتقرير الدورة (0026) بلا جدول أيّام ولا أسابيع ولا أوزان ولا معامل تحويل ولا مؤشّر إنتاج؛ ولا طريق إلى تقرير دورة مغلقة بعد
--   أن تشغل قاعتَها دورةٌ جديدة.
-- هنا قرّاء فقط، بلا جدول ولا كتابة ولا مال في المفاتيح الجديدة:
--   • public.halls_day(p_on): كلّ قاعة في نطاق القارئ مجمَّعة بحقلها (غير المؤرشفة، والمؤرشفة التي كان فيها فوج ذلك اليوم)، وفوجها ذلك اليوم (المسكَّن
--     فيه أو قبله ولم يُغلق قبله، الأحدث تسكيناً) بجولته وتراكماتها والعلف المأكول والنازل والباقي والوزن ومعامل التحويل والبيض والأدوية واللقاحات،
--     ومجاميع كلّ حقل وكلّ القاعات من القاعات المعروضة نفسها؛ واليوم القادم مرفوض بجملته (future_day).
--   • public.flock_cycle_report: التوقيع نفسه والمفاتيح القديمة كما هي (الشاشة المنشورة تقرؤها بين التطبيق والدمج)، وأربعة مفاتيح جديدة: days (كلّ يوم من
--     التسكين إلى «حتى»)، وweeks (بعمر الطيور)، وweights، وkpis (ومنها معامل التحويل ومؤشّر الإنتاج EPEF).
--   • public.flock_cycles(): كلّ دورات النطاق، القائمة أوّلاً ثمّ المغلقة الأحدث إغلاقاً، بحدّ 500 وعلم more، لتصل تقارير الدورات المغلقة.
--   • private.report_days (أرقام كلّ يوم من التسكين حتى يوم معطى: تعريف واحد للقارئين)، وprivate.report_day (فوج القاعة ليوم)، وprivate.halls_day_totals
--     (المجاميع من القاعات المعروضة).
-- التعريفات (العقد 0027)، لفوج ويوم D بين التسكين و«حتى» (الإغلاق، وإلّا اليوم): العمر = D − التسكين + عمره عند التسكين، ورقم اليوم = D − التسكين + 1؛
--   والحيّ أوّل اليوم = المسكَّن − نافق ما قبل D ومستبعده، وآخره = أوّله − نافق D ومستبعده؛ والنفوق التراكميّ ٪ من المسكَّن؛ والعلف المأكول من الجولة،
--   والنازل من سطور العلف المرحَّلة بتاريخ صرفها (الملغى لا يُعدّ، وما لا كتلة له لا يُجمع في الكيلو ويُعدّ في يومه وفي كلّ يوم بعده)، والباقي = النازل
--   التراكميّ − المأكول التراكميّ (قد يكون سالباً)؛ ومعامل التحويل بقاعدة flock_summary (0012) واليوم = D: العلف التراكميّ × 1000 ÷ (الحيّ آخر D × آخر وزن
--   حتى D) حين سُجّل العلف كلّ يوم من التسكين حتى أمس D (وD إن سُجّل)؛ والأسبوع n = الأعمار 7(n−1)+1 إلى 7n والعمر صفر في الأوّل؛ وEPEF = الحيوية ٪ ×
--   الوزن بالغرام ÷ (10 × العمر × معامل التحويل)، أي الحيوية × الوزن بالكيلو ÷ (العمر × معامل التحويل) × 100.
-- قرارات بلا سؤال (داخل الخطوط الحمر):
--   • القيمة الغائبة null لا صفر: نافق يوم بلا جولة ومستبعده وعلفه، ونافق أسبوع بلا جولة ومستبعده ونفوقه ٪، وعلف أسبوع لم يُسجَّل فيه علف، ومجموع النافق
--     والمستبعد لحقل لا جولة فيه ذلك اليوم، ومجموع العلف المأكول حين لم يسجّله فوج؛ والمجموع يحمل عدد ما جُمع منه (rounds وfeed_eaten_flocks) فتقول
--     الشاشة «من N قاعة». والنازل صفر حقيقيّ حين لم يُصرف شيء ('0').
--   • سطر العلف بلا كتلة يُعدّ ولا يختفي (DECISIONS 0019): الكيلو لا يجمعه، فبجانب النازل عدد سطوره بلا وزن في اليوم (feed_given_unweighed) وحتى اليوم
--     (feed_given_cum_unweighed) في التقرير اليوميّ وأيّام الدورة، وعدد اليوم في مجموع كلّ حقل وكلّ القاعات؛ فلا يُقرأ النازل التراكميّ ولا الباقي في
--     القاعة كاملين وفيها سطر لم يُوزن (مراجعة 0027: كان العدد ليوم الصرف وحده، فيختفي السطر من الأيّام بعده ومن المجاميع).
--   • كلّ مؤشّر بقسمة يُحسب حين تكون مدخلاته كلّها أكبر من صفر، وإلّا null (القارئ لا يرمي بسطر واحد، درس 0016): معامل تحويل قُرِّب إلى صفر، وحيوية
--     قُرِّبت إلى صفر، وحيّ صفر؛ وغرام العلف لكلّ طير في اليوم '0.0' حين سُجّل علف مجموعه صفر.
-- تراجع: rollback_0027.sql — يُسقط halls_day وflock_cycles والمساعدات الثلاثة، ويرجّع جسم flock_cycle_report كما في 0026 حرفاً بحرف. لا طريق رفض: 0027
--   لا ينشئ جدولاً ولا يكتب صفّاً.
-- تنعاد بأمان: create or replace، وrevoke وgrant.

set lock_timeout = '5s';

-- ─── أ. أرقام كلّ يوم لفوج: تعريف واحد للتقرير اليوميّ وتقرير الدورة ───────────────────────────────────────────────────────────
-- صفّ لكلّ يوم من التسكين حتى p_through (الأقدم أوّلاً)، وكلّ تراكم بما في اليوم أو قبله. الجولة الغائبة: نافقها ومستبعدها وعلفها null ولا تُنقص الحيّ.
-- والعلف النازل من سطور العلف المرحَّلة (cost_kind = 'feed') بكتلتها (issue_mass_kg: ما لا كتلة له null، لا يُجمع ويُعدّ في given_unweighed ليومه وفي
-- given_cum_unweighed ليومه ولكلّ يوم بعده)؛ والوزن ليوم وزنه، وآخر وزن حتى اليوم؛ ومعامل التحويل بقاعدة flock_summary (0012) واليوم = D؛ ونسبة الإنتاج
-- للبيّاض وحده من الحيّ أوّل اليوم (القاعدة ٣٢).
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

-- ─── ب. فوج القاعة ليوم (التقرير اليوميّ) ─────────────────────────────────────────────────────────────────────────────
-- رأسه، وأرقام يومه من report_days (ومنها عدد سطور العلف بلا وزن في يومه feed_given_unweighed وحتى يومه feed_given_cum_unweighed)، وما نزل له ذلك اليوم
-- (الصرف المرحَّل بلا صرف اللقاح المؤشَّر، بترتيب تقويم القاعة)، والأدوية المسجّلة بلا مخزن، ولقاحات يومه كما في flock_month حرفاً (المؤشَّر يوم تأشيره،
-- وغير المؤشَّر يوم موعده بحالته من p_today). البيض ونسبة الإنتاج للبيّاض وحده.
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

-- ─── ج. مجاميع القاعات المعروضة (حقل أو الكلّ) ───────────────────────────────────────────────────────────────────────
-- من القاعات نفسها كما تُعرض، فالمجموع = مجموع قاعاته دائماً: الحيّ أوّل اليوم وآخره لكلّ فوج؛ والنافق والمستبعد لما فيه جولة (null حين لا جولة)؛ والعلف
-- المأكول لما سجّله (null حين لم يسجّله فوج)؛ والنازل للكلّ، وعدد سطوره بلا وزن في اليوم (feed_given_unweighed: صفر حين لا سطر، والقاعة بلا فوج لا تضيف
-- شيئاً)؛ وعدد القاعات والأفواج والجولات ومن سجّل العلف.
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

-- ─── د. التقرير اليوميّ لكلّ القاعات ──────────────────────────────────────────────────────────────────────────────────
-- كلّ قاعة في حقل بنطاق القارئ: غير المؤرشفة، والمؤرشفة التي كان فيها فوج يوم p_on. فوج القاعة ذلك اليوم: المسكَّن فيه أو قبله ولم يُغلق قبله، والأحدث
-- تسكيناً حين يلتقي فوج أُغلق ذلك اليوم بفوج سُكّن فيه. الحقول بالاسم (collate "C") ثمّ المعرّف، والقاعات كذلك، والحقل بلا قاعة معروضة لا يظهر.
-- prev: في النطاق فوج سُكّن قبل اليوم (الرجوع يفيد)؛ next: اليوم قبل اليوم الحاليّ. بلا مال.
create or replace function public.halls_day(p_on date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_sites jsonb;
begin
  perform private.require('read');
  if p_on is null then
    raise exception 'day_required' using hint = 'اختر اليوم.';
  end if;
  if p_on > v_today then
    raise exception 'future_day' using hint = 'لا تقرير ليوم لم يأتِ بعد.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'halls', s.halls, 'totals', private.halls_day_totals(s.halls))
      order by s.name collate "C", s.id), '[]'::jsonb)
  into v_sites
  from (
    select t.id, t.name, jsonb_agg(jsonb_build_object('hall_id', h.id, 'hall_name', h.name, 'kind', d.kind,
        'flock', case when q.id is not null then private.report_day(q.f, p_on, v_today) end) order by h.name collate "C", h.id) as halls
    from public.halls h
    join public.sites t on t.org_id = h.org_id and t.id = h.site_id
    join public.divisions d on d.org_id = h.org_id and d.id = h.division_id
    left join lateral (
      select x.id, x as f from public.flocks x
      where x.org_id = h.org_id and x.hall_id = h.id and x.placed_on is not null and x.placed_on <= p_on
        and (x.closed_on is null or p_on <= x.closed_on)
      order by x.placed_on desc, x.id
      limit 1) as q on true
    where h.org_id = v_org and public.in_scope_site(h.site_id) and (h.archived_at is null or q.id is not null)
    group by t.id, t.name
  ) as s;
  return jsonb_build_object(
    'on', p_on,
    'today', v_today,
    'prev', exists (select 1 from public.flocks x where x.org_id = v_org and x.placed_on < p_on and public.in_scope_site(x.site_id)),
    'next', p_on < v_today,
    'sites', v_sites,
    'totals', private.halls_day_totals(coalesce((select jsonb_agg(e.h order by s.n, e.n)
      from jsonb_array_elements(v_sites) with ordinality as s(site, n)
      cross join lateral jsonb_array_elements(s.site -> 'halls') with ordinality as e(h, n)), '[]'::jsonb)));
end
$$;

-- ─── هـ. تقرير الدورة: المفاتيح القديمة كما هي، ومعها الأيّام والأسابيع والأوزان والمؤشّرات ─────────────────────────────────────────
-- تقرير الدورة: الطيور، وكلّ علف نزل بتاريخه وتراكمه ومجموعه لكلّ مادّة والمصروف والمستهلك والباقي، والأدوية (صرفاً وتسجيلاً)، واللقاحات
-- (المخطّط والمنفَّذ)، والمال لأدوار الكلفة وحدها (private.mask)؛ و(0027) days: كلّ يوم من التسكين إلى «حتى» بتعريفات التقرير اليوميّ (report_days،
-- ومنها عدد سطور العلف بلا وزن في يومه وحتى يومه)، وweeks: الأسبوع n للأعمار 7(n−1)+1 إلى 7n والعمر صفر في الأوّل، نفوقه ٪ من الحيّ أوّل يومه الأوّل،
-- وتراكمه وحيّه وآخر وزن فيه ومعامل التحويل في يومه الأخير، وغرام العلف لكلّ طير في اليوم = علف أيّامه المسجّلة × 1000 ÷ مجموع الحيّ أوّل تلك الأيّام؛
-- وweights؛ وkpis في «حتى»: الحيوية = 100 − النفوق، والعلف لكلّ طير مسكَّن، ومعامل التحويل، وEPEF. مجاميع الأيّام = مفاتيح birds وfeed (وعدد سطور العلف
-- بلا وزن حتى «حتى» = feed.unweighed).
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

-- ─── و. قائمة الدورات ───────────────────────────────────────────────────────────────────────────────────────────────
-- كلّ فوج مسكَّن في النطاق (القائم والمغلق، ولو في قاعة مؤرشفة): القائم أوّلاً، ثمّ المغلق الأحدث إغلاقاً، ثمّ الأحدث تسكيناً، ثمّ القاعة (collate "C")
-- والمعرّف؛ بحدّ 500 وmore = ما بعدها. العمر والأيّام والحيّ والنفوق ٪ في «حتى» (الإغلاق، وإلّا اليوم). بلا مال.
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

-- ─── ز. الصلاحيات ──────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function private.report_days(public.flocks, date), private.report_day(public.flocks, date, date), private.halls_day_totals(jsonb)
  from public, anon, authenticated;
revoke all on function public.halls_day(date), public.flock_cycles(), public.flock_cycle_report(uuid) from public, anon;
grant execute on function public.halls_day(date), public.flock_cycles(), public.flock_cycle_report(uuid) to authenticated;
