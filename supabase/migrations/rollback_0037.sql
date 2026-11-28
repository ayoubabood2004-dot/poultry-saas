-- rollback_0037 — تراجع «الكاز» (0037_kerosene؛ مشغّل التراجع بالحزمة FOUNDATION ٨٢٠، ٨٧٦): يرجّع public.hall_sheet وpublic.edit_flock
--   وprivate.flock_activity_after وpublic.delete_flock كما في 0035، حرفاً بحرف (md5 نفسه بالكتالوج)؛ ويُسقط verify_kerosene وset_flock_kerosene
--   وprivate.flock_kerosene_json، ثمّ جدول flock_day_kerosene (بسياسته ومحفّزه وفهرسه، بعد الأجسام التي تقرؤه).
-- **طريق رفض (الكتلة الأولى أدناه):** ما لا يحمله النموذج القديم يوقف التراجع بصوت بلا أن يغيّر شيئاً، بفرع لكلّ حقيقة مستقلّة: صفّ كاز (ولو مُسح
--   لتره: الصفّ يحمل نسخة رآها جهاز، وإسقاطه يعيد النسخة إلى البداية عند إعادة الهجرة، درس ABA 2026-11-16)، وكاز مركون ينتظر قراراً (payload فيه
--   kerosene: عملية لا يعرفها النموذج القديم).
-- تنعاد بأمان: الكتلة الأولى تخرج إن لم يبقَ الجدول، وcreate or replace، وdrop if exists.

set lock_timeout = '5s';

-- ٠) طريق الرفض. الجداول تُقفل قبل العدّ ولحدّ نهاية المعاملة (درس WP4): كتابة بلحظة التراجع تنتظر أو تُعدّ.
do $$
declare
  v_kerosene bigint;
  v_parked bigint;
begin
  if to_regclass('public.flock_day_kerosene') is null then
    return;
  end if;
  execute 'lock table public.flock_day_kerosene, public.flock_day_rejects in access exclusive mode';
  execute 'select count(*) from public.flock_day_kerosene' into v_kerosene;
  execute 'select count(*) from public.flock_day_rejects r where r.payload ? ''kerosene''' into v_parked;
  -- الأعداد بعد نقطتين لا قبل المعدود (مراجعة 0036 R3).
  if v_kerosene > 0 then
    raise exception 'rollback_blocked' using hint = format('خانات الكاز المسجّلة بعد الهجرة، ومعها الممسوحة: %s، والتراجع يمسحها. لا تراجع لـ0037 بعد استعمالها.', v_kerosene);
  end if;
  if v_parked > 0 then
    raise exception 'rollback_blocked' using hint = format('عمليات الكاز المركونة: %s، والتراجع لا يعرفها. لا تراجع لـ0037 بعد استعمالها.', v_parked);
  end if;
end
$$;

-- ١) الأجسام القديمة حرفاً.
-- public.hall_sheet كما في 0035_hall_sheet.sql.
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
      case when fd.kg is not null or ci.kg is not null then coalesce(fd.kg, 0) + coalesce(ci.kg, 0) end as kg,
      coalesce(fd.unweighed, 0) + coalesce(ci.unweighed, 0) + coalesce(bk.unweighed, 0) as unweighed,
      coalesce(ci.n, 0) as carry_n, ci.kg as carry_kg, coalesce(bk.n, 0) as back_n, bk.kg as back_kg,
      fd.feed, coalesce(k.sold, 0) as sold, k.sold_kg, coalesce(k.adjust, 0) as adjust
    from g
    left join public.flock_daily r on r.org_id = f.org_id and r.flock_id = f.id and r.on_date = g.d
    left join public.flock_day_gas gs on gs.org_id = f.org_id and gs.flock_id = f.id and gs.on_date = g.d
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
      'gas', z.cylinders, 'gas_version', z.gas_version, 'feed_kg', round(z.kg, 3)::text, 'feed', coalesce(z.feed, '[]'::jsonb),
      'carry_in_kg', case when z.carry_n > 0 then round(z.carry_kg, 3)::text end, 'feed_back_kg', case when z.back_n > 0 then round(z.back_kg, 3)::text end,
      'eggs_total', case when f.kind = 'layer' then z.eggs_total end, 'eggs_cracked', case when f.kind = 'layer' then z.eggs_cracked end,
      'eggs_broken', case when f.kind = 'layer' then z.eggs_broken end,
      'sold_birds', z.sold, 'sold_net_kg', case when z.sold_kg is not null then round(z.sold_kg, 3)::text end, 'live_end', z.live_end) order by z.d),
    jsonb_build_object('dead', coalesce(sum(z.dead + z.culled), 0)::bigint, 'gas', coalesce(sum(z.cylinders), 0)::bigint,
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
      'gas', (v_totals ->> 'gas')::bigint, 'sold_birds', (v_totals ->> 'sold_birds')::bigint, 'sold_net_kg', v_totals ->> 'sold_net_kg',
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

-- public.edit_flock كما في 0035_hall_sheet.sql.
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
      (select min(x.on_date) from public.flock_costs x where x.org_id = f.org_id and x.flock_id = f.id),
      (select min(x.on_date) from public.flock_logs x where x.org_id = f.org_id and x.flock_id = f.id),
      (select min(x.done_on) from public.flock_vaccinations x where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'done'),
      -- 0029: صفوف العدد (المباع بيوم تذكرته وفرق العدّ بيومه، وعكوسها بيوم الإلغاء بعدها) وتذاكر الوزن غير الملغاة (ولو مسوّدة).
      (select min(x.on_date) from public.flock_counts x where x.org_id = f.org_id and x.flock_id = f.id),
      (select min(t.on_date) from public.weigh_ticket_stops s join public.weigh_tickets t on t.org_id = s.org_id and t.id = s.ticket_id
        where s.org_id = f.org_id and s.flock_id = f.id and t.status <> 'void'))
    into v_first;
  if v_first is not null and p_placed_on > v_first then
    raise exception 'records_before_placement' using hint = format('للفوج سجلّ يوم %s (جولة أو صرف أو غاز أو وزن أو دواء أو لقاح أو تذكرة وزن أو بيع أو فرق عدّ)، فلا يصير التسكين بعده. اختر تاريخاً في %s أو قبله.',
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

-- private.flock_activity_after كما في 0035_hall_sheet.sql.
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
    union all
    -- 0035: الغاز المسجَّل.
    select 'غاز', g.on_date, 7 from public.flock_day_gas g where g.org_id = f.org_id and g.flock_id = f.id and g.cylinders is not null
  ) as a
  where p_on is null or a.d > p_on
  order by case when p_on is null then a.d end desc nulls last, case when p_on is not null then a.d end, a.rank
  limit 1
$$;

-- public.delete_flock كما في 0035_hall_sheet.sql.
create or replace function public.delete_flock(p_flock uuid, p_expected_version int, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'delete_flock';
  v_cached jsonb;
  v_org uuid := public.auth_org();
  v_lock date;
  f public.flocks;
  v_hall text;
  v_has text[] := '{}';
  v_result jsonb;
begin
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('flock', p_flock, 'version', p_expected_version));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.require('flock.manage');
  set local lock_timeout = '5s';
  perform private.period_guard();
  select * into f from public.flocks x where x.org_id = v_org and x.id = p_flock for update;
  if f.id is null then
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('flock_id', p_flock, 'deleted', false));
  end if;
  if not public.in_scope_site(f.site_id) then
    raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  select h.name into v_hall from public.halls h where h.org_id = f.org_id and h.id = f.hall_id;
  if f.status = 'closed' then
    raise exception 'flock_closed' using hint = format('فوج «%s» مغلق، فلا يُحذف.', v_hall);
  end if;
  if p_expected_version is null or f.version <> p_expected_version then
    raise exception 'stale_flock' using hint = format('تغيّر فوج «%s» من جهاز آخر بعد فتح الشاشة. حدّث الشاشة ثمّ احذفه.', v_hall);
  end if;
  select l.locked_through into v_lock from public.period_locks l where l.org_id = f.org_id;
  if v_lock is not null and f.placed_on <= v_lock then
    raise exception 'period_locked' using hint = format('الحسابات مقفلة حتى %s، وتسكين الفوج %s داخلها، فلا يُحذف.', to_char(v_lock, 'DD/MM/YYYY'), to_char(f.placed_on, 'DD/MM/YYYY'));
  end if;
  if exists (select 1 from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id)
      or exists (select 1 from public.flock_visits x where x.org_id = f.org_id and x.flock_id = f.id and x.voided_at is null)
      or exists (select 1 from public.flock_day_rejects x where x.org_id = f.org_id and x.flock_id = f.id) then
    v_has := v_has || 'جولات يومية'::text;
  end if;
  if exists (select 1 from public.flock_weights x where x.org_id = f.org_id and x.flock_id = f.id) then
    v_has := v_has || 'أوزان'::text;
  end if;
  -- 0035: الغاز المسجَّل (بعدد) باسمه؛ والصفّ الممسوح (عدد فارغ بنسخة) لا يمنع الحذف.
  if exists (select 1 from public.flock_day_gas x where x.org_id = f.org_id and x.flock_id = f.id and x.cylinders is not null) then
    v_has := v_has || 'الغاز'::text;
  end if;
  if exists (select 1 from public.flock_issues x where x.org_id = f.org_id and x.flock_id = f.id)
      or exists (select 1 from public.flock_costs x where x.org_id = f.org_id and x.flock_id = f.id) then
    v_has := v_has || 'صرف من المخزن'::text;
  end if;
  if exists (select 1 from public.flock_logs x where x.org_id = f.org_id and x.flock_id = f.id) then
    v_has := v_has || 'أدوية'::text;
  end if;
  if exists (select 1 from public.flock_vaccinations x where x.org_id = f.org_id and x.flock_id = f.id) then
    v_has := v_has || 'تأشيرات لقاح'::text;
  end if;
  -- 0029: تذاكر الوزن (ولو ملغاة: وقفاتها تشير إلى الفوج) والبيع وفرق العدّ والإغلاق السابق بأسمائها، لا بجملة المفتاح الأجنبيّ العامّة.
  if exists (select 1 from public.weigh_ticket_stops x where x.org_id = f.org_id and x.flock_id = f.id) then
    v_has := v_has || 'تذاكر وزن'::text;
  end if;
  if exists (select 1 from public.flock_counts x where x.org_id = f.org_id and x.flock_id = f.id and x.kind = 'sold') then
    v_has := v_has || 'بيع'::text;
  end if;
  if exists (select 1 from public.flock_counts x where x.org_id = f.org_id and x.flock_id = f.id and x.kind = 'count_adjust') then
    v_has := v_has || 'فرق عدّ'::text;
  end if;
  if exists (select 1 from public.flock_closes x where x.org_id = f.org_id and x.flock_id = f.id) then
    v_has := v_has || 'إغلاق سابق'::text;
  end if;
  if cardinality(v_has) > 0 then
    raise exception 'flock_has_records' using hint = format('لفوج «%s» سجلّ (%s)، فلا يُحذف. إن كان التاريخ أو العدد غلطاً فاضغط «عدّل الفوج» وصحّحه.',
      v_hall, array_to_string(v_has, '، '));
  end if;
  -- 0032: الزيارات الملغاة وحدها لا تمنع الحذف (الحيّة تمنعه أعلاه مع صفّ يومها)، فتُحذف مع الفوج، وسجلّ التدقيق يحفظها.
  delete from public.flock_visits x where x.org_id = f.org_id and x.flock_id = f.id and x.voided_at is not null;
  -- 0035: وصفوف الغاز الممسوحة كذلك (لا كتابة بعدها: الوجبة نفسها تُحذف، فلا ABA).
  delete from public.flock_day_gas x where x.org_id = f.org_id and x.flock_id = f.id and x.cylinders is null;
  begin
    delete from public.flocks x where x.org_id = f.org_id and x.id = f.id;
  exception when foreign_key_violation then
    raise exception 'flock_has_records' using hint = format('لفوج «%s» سجلّ مرتبط به، فلا يُحذف. إن كان التاريخ أو العدد غلطاً فاضغط «عدّل الفوج» وصحّحه.', v_hall);
  end;
  v_result := jsonb_build_object('flock_id', f.id, 'deleted', true);
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;

-- ٢) الجديد: الثابت والكاتب والمساعد، ثمّ الجدول (بعد الأجسام التي تقرؤه، والمساعد يأخذ نوع صفّه).
drop function if exists public.verify_kerosene();
drop function if exists public.set_flock_kerosene(uuid, date, integer, bigint, uuid, boolean);
drop function if exists private.flock_kerosene_json(date, public.flock_day_kerosene);
drop table if exists public.flock_day_kerosene;
