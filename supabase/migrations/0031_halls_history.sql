-- 0031_halls_history — «من أوّل ما بدينا» في تقرير القاعات اليوميّ: أيّام الشهر يوماً بيوم، والأشهر من البداية، وسطر «منذ البداية»، وما جرى في الشهر،
--   وملاحظة المالك لكلّ يوم (كلمة المالك 2026-11-17: «كل يوم اشوف شنو الي صار بتقرير كامل بالارقام والجداول واكدر ارسلهه، وايضا يكون اكو المجموع
--   اليومي والشهري من اول ما بدينا وكتابة ملاحظة تحته من شوكت بدينا وشنو الاشياء الي صارت»؛ وأجوبته الأربعة؛ العقد docs/plans/0031/contract-0031.md؛
--   DECISIONS 2026-11-17).
-- المشكلة: التقرير اليوميّ (0027) ليوم واحد، فلا مجموع لشهر ولا لما مضى منذ أوّل تسكين، ولا سطر يقول متى بدأنا وما جرى، ولا مكان لملاحظة المالك على اليوم.
-- هنا:
--   • public.halls_history(p_month) (read): لكلّ نوع (اللاحم ثمّ البيّاض) له فوج في نطاق القارئ: يوم البداية (أوّل تسكين)، وأيّام الشهر المطلوب يوماً بيوم
--     (مجموع القاعات)، وكلّ شهر من شهر البداية إلى شهر اليوم، وسطر «منذ البداية» = مجموع الأشهر بالضبط، وأحداث الشهر (تسكين وبيع وفرق عدّ ولقاح ووزن
--     وإغلاق)؛ وملاحظات المالك لأيّام الشهر. كلّ رقم يوميّ من التعريف الواحد private.report_days (ورفيقه report_days_extra) لفوج كلّ قاعة ذلك اليوم
--     كما يختاره halls_day نفسه (المسكَّن فيه أو قبله ولم يُغلق قبله، الأحدث تسكيناً)، فيومُ الشهر = مجاميع halls_day(اليوم) لقاعات النوع حرفاً. والنطاق
--     كـhalls_day (قاعات in_scope_site، والمؤرشفة التي لها فوج). بلا مال في أيّ مفتاح (التقرير يُرسل لغير أدوار الكلفة).
--   • فعل halls_note.write (ملاحظة يوم في تقرير القاعات): للمالك والمدير وحدهما — المدير يملك كلّ الأفعال في private.role_can (0022)، فلا يتغيّر جسمه؛
--     ومرآته src/domain/permissions.ts. والملاحظة للمنشأة كلّها، فيكتبها من نطاقه المنشأة كلّها (note_scope للمدير المحصور بحقل أو وحدة).
--   • public.halls_day_notes: ملاحظة واحدة لكلّ (منشأة، يوم)، تكتبها public.set_halls_note وحدها ويقرؤها كلّ من يقرأ المنشأة؛ بشرط النسخة التي رآها
--     الكاتب، والنسخة من عدّاد private.halls_note_versions لا يتكرّر ولا ينزل، والصفّ لا يُحذف أبداً: المسح نصّ فارغ بنسخة جديدة (درس ABA 2026-11-16).
--   • public.verify_halls_history: أيّام كلّ شهر = سطره، والأشهر = «منذ البداية»، لكلّ منشأة بهويّة مالكها؛ ونسخ الملاحظات موجبة وفريدة.
-- قرارات بلا سؤال (داخل الخطوط الحمر، والعقد):
--   • النازل في السجلّ = ما نزل من المخزن: نازل halls_day ناقص العلف المنقول من دورة سابقة في القاعة نفسها (يُعدّ يوم صُرف أوّل مرّة لا يوم نُقل).
--   • يوم بلا فوج قائم داخل المدّة صفّ بصفر أفواج (النافق والمستبعد والمأكول null كما في halls_day)؛ والشهر وسطر البداية يعدّان null صفراً، فالمأكول
--     والنازل نصّ بثلاث مراتب دائماً، والبيض صفر للبيّاض بلا بيض وnull للّاحم؛ ونسبة الإنتاج للشهر وللبداية = مجموع البيض ÷ مجموع الحيّ أوّل اليوم
--     للأفواج التي سجّلت بيضاً، وnull بلا بيض.
--   • الشهر المطلوب بعد شهر اليوم مرفوض (future_month)، والشهر اللانهائيّ مرفوض (date_required)؛ وما قبل البداية مقبول بأيّام وأحداث فارغة.
--   • الأحداث بترتيب اليوم ثمّ النوع (تسكين، بيع، فرق عدّ، لقاح، وزن، إغلاق) ثمّ اسم القاعة ثمّ اسم الحقل.
-- تراجع: rollback_0031.sql — يُسقط الدوالّ الثلاث وجدول الملاحظات وعدّاد نسخه، ويرجّع private.actions كما في 0022 حرفاً بحرف. **طريق رفض**: صفّ واحد في
--   halls_day_notes (ولو مُسح نصّه: الصفّ يحمل نسخة رآها كاتب) يوقف التراجع بصوت بلا أن يغيّر شيئاً.
-- تنعاد بأمان: create table/sequence if not exists، وكتلة do تفحص الكتالوج قبل السياسة، وcreate or replace، وrevoke وgrant.

set lock_timeout = '5s';

-- ─── أ. فعل «ملاحظة يوم في تقرير القاعات» ──────────────────────────────────────────────────────────────────────────────
create or replace function private.actions() returns text[]
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select array[
    'receipt.draft', 'transfer.post', 'issue.post', 'count.enter', 'stock_use.post',
    'receipt.amounts', 'costs.load', 'sale.post', 'payment.post', 'sale_return.post', 'expense.post', 'accounts.view',
    'production.draft', 'production.post',
    'hatch.operate',
    'flock_day.save', 'weigh_ticket.draft',
    'recipe.activate', 'count.approve', 'flock.manage', 'flock.transfer', 'hatch.zero_saleable', 'expired.destroy',
    'expired.release', 'void', 'receipt.revalue', 'party.adjust', 'opening.post', 'period.lock',
    'party.offset', 'members.manage', 'period.unlock',
    'stores.manage', 'parties.manage', 'party.create', 'cash_accounts.manage', 'expense_categories.manage',
    'item.create',
    'purchase.record',
    'sale.record',
    'stock_note.write',
    'halls_note.write',
    'read'
  ]
$$;

-- ─── ب. ملاحظة اليوم ───────────────────────────────────────────────────────────────────────────────────────────────
-- صفّ واحد لكلّ (منشأة، يوم) لا يُحذف: النصّ بلا فراغ في طرفيه (private.note_text، 0022) حتى 500 حرف، أو فارغ = مُسحت؛ والنسخة من عدّاد لا يتكرّر.
create sequence if not exists private.halls_note_versions;

create table if not exists public.halls_day_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  on_date date not null,
  note text not null,
  version bigint not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz,
  updated_by uuid,
  constraint halls_day_notes_note_check check (note = '' or (coalesce(private.note_text(note) = note, false) and length(note) <= 500)),
  constraint halls_day_notes_version_check check (version >= 1),
  constraint halls_day_notes_on_date_check check (isfinite(on_date)),
  unique (org_id, id),
  -- ملاحظة واحدة لكلّ يوم بالمنشأة (العقد 0031).
  unique (org_id, on_date)
);

alter table public.halls_day_notes enable row level security;

do $$
begin
  -- القراءة لكلّ من يقرأ المنشأة (العقد 0031: الملاحظة تحت التقرير الذي يُرسل)، والكتابة بالدالّة وحدها.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'halls_day_notes' and policyname = 'halls_day_notes_read') then
    create policy halls_day_notes_read on public.halls_day_notes for select to authenticated using (org_id = (select public.auth_org()));
  end if;
  execute 'create or replace trigger audit_halls_day_notes after insert or update or delete on public.halls_day_notes for each row execute function private.audit_row()';
end
$$;

revoke all on table public.halls_day_notes from anon, authenticated;
grant select on table public.halls_day_notes to authenticated;
revoke truncate on table public.halls_day_notes from service_role;
revoke all on sequence private.halls_note_versions from public, anon, authenticated;

-- ─── ج. التقرير من أوّل ما بدينا ───────────────────────────────────────────────────────────────────────────────────────
-- p_month أيّ يوم في الشهر المطلوب (null = شهر يوم الخادم). الأفواج: المسكَّنة حتى اليوم في قاعات نطاق القارئ، بنوع وحدة قاعتها (كـhalls_day)، وكلّ فوج
-- بأيّامه من report_days حتى least(اليوم، يوم إغلاقه)؛ وفي كلّ (قاعة، يوم) فوج واحد كما يختاره halls_day (الأحدث تسكيناً). والتقويم لكلّ نوع من يوم بدايته
-- إلى اليوم، فاليوم بلا فوج صفّ بصفر أفواج. لا مال.
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

-- ─── د. كتابة ملاحظة اليوم ─────────────────────────────────────────────────────────────────────────────────────────
-- ملاحظة يوم p_on (halls_note.write: المالك والمدير). p_expected_version نسخة الملاحظة التي رآها الكاتب (null = رأى بلا ملاحظة). إن كان الحال الآن هو
-- المطلوب (النصّ نفسه، أو بلا ملاحظة والمطلوب مسحها) فنتيجته بلا كتابة ولا نسخة جديدة — إعادة بعد جواب ضاع أو جهازان كتبا الشيء نفسه؛ وإلّا إن تغيّر
-- عمّا رآه فـnote_changed. الصفّ لا يُحذف: المسح نصّ فارغ بنسخة جديدة من العدّاد، فلا تعود نسخة رآها كاتب قديم (درس ABA 2026-11-16). الأقفال: قفل
-- استشاريّ لـ(المنشأة، اليوم) بمفتاح يحمل المنشأة ولا يتبع DateStyle يرتّب أوّل كتابتين (الصفّ قد لا يكون بعد)، ثمّ صفّ الملاحظة؛ وكلّ فحص بعد قفله.
create or replace function public.set_halls_note(p_on date, p_note text, p_expected_version bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_text text := private.note_text(p_note);
  v_seen bigint;
  n public.halls_day_notes;
begin
  set local lock_timeout = '5s';
  perform private.require('halls_note.write');
  -- الملاحظة للمنشأة كلّها (تحت التقرير الذي يرى كلّ حقوله): يكتبها من نطاقه المنشأة كلّها، المالك أو مدير بلا نطاق محدود؛ والمدير المحصور بحقل لا
  -- يكتب فوق ملاحظة عن حقل لا يراه (مراجعة 0031 L4).
  if exists (select 1 from public.sites s where s.org_id = v_org and s.archived_at is null and not public.in_scope_site(s.id)) then
    raise exception 'note_scope' using hint = 'ملاحظة اليوم للمنشأة كلّها: يكتبها المالك أو مدير نطاقه المنشأة كلّها.';
  end if;
  if p_on is null or not isfinite(p_on) then
    raise exception 'date_required' using hint = 'اختر يوم الملاحظة من التقويم.';
  end if;
  if p_on > v_today then
    raise exception 'day_in_future' using hint = format('يوم %s لم يأتِ بعد؛ اكتب ملاحظة ليوم مضى أو لليوم.', to_char(p_on, 'DD/MM/YYYY'));
  end if;
  if v_text is not null and length(v_text) > 500 then
    raise exception 'bad_note' using hint = format('الملاحظة %s حرفاً، والحدّ 500 حرف. اختصرها.', length(v_text));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('halls_note:' || v_org::text || ':' || to_char(p_on, 'YYYY-MM-DD'), 0));
  select * into n from public.halls_day_notes x where x.org_id = v_org and x.on_date = p_on for update;
  v_seen := case when n.id is not null and n.note <> '' then n.version end;
  if (v_seen is null and v_text is null) or (v_seen is not null and n.note = v_text) then
    return jsonb_build_object('on', p_on, 'note', case when v_seen is null then null else jsonb_build_object('text', n.note, 'version', n.version) end);
  end if;
  if p_expected_version is distinct from v_seen then
    raise exception 'note_changed' using hint = format('تغيّرت ملاحظة يوم %s من نافذة أو جهاز آخر بعد أن فتحتها. حدّث الشاشة لترى ما كُتب، ثمّ اكتب من جديد.',
      to_char(p_on, 'DD/MM/YYYY'));
  end if;
  if n.id is null then
    insert into public.halls_day_notes (org_id, on_date, note, version)
    values (v_org, p_on, v_text, nextval('private.halls_note_versions')) returning * into n;
  else
    update public.halls_day_notes set note = coalesce(v_text, ''), version = nextval('private.halls_note_versions'), updated_at = now(), updated_by = auth.uid()
    where org_id = v_org and id = n.id returning * into n;
  end if;
  return jsonb_build_object('on', p_on, 'note', case when n.note = '' then null else jsonb_build_object('text', n.note, 'version', n.version) end);
end
$$;

-- ─── هـ. الثوابت (لمفتاح الخادم وحده؛ صفر مخالفة) ─────────────────────────────────────────────────────────────────────
-- halls_note_versions: كلّ نسخة ملاحظة موجبة ولا تتكرّر (العدّاد واحد للمنشآت كلّها).
-- history_days_month: لكلّ منشأة فيها فوج مسكَّن، بهويّة مالك حيّ منها (لا نطاق له)، ونداء واحد لـhalls_history (شهر اليوم): أيّام الشهر = سطره (عدد الأيّام
--   والمسكَّن والنافق والمستبعد والمباع وفرق العدّ والمأكول والنازل وسطوره بلا وزن والبيض والمكسور، والحيّ آخر آخر يوم)؛ والأشهر شهر لكلّ شهر من شهر البداية
--   إلى شهر اليوم بلا فجوة ولا تكرار، وأيّام كلّ شهر = أيّامه داخل [البداية، اليوم]؛ والقارئ الذي يرمي يُعدّ مخالفة. والهويّة ترجع كما كانت بالآخر. (نداء
--   واحد لكلّ منشأة: الحزمة فيها منشأة بـ501 دورة، والقارئ يحسب كلّ أيّامها في كلّ نداء؛ ومجاميع أيّام الأشهر الماضية يفحصها halls-history.test شهراً شهراً.)
-- history_months_total: مجموع الأشهر = «منذ البداية»، والحيّ الآن = حيّ آخر شهر، وأيّام البداية = من يوم البداية إلى اليوم.
create or replace function public.verify_halls_history() returns table (check_name text, violations bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_days bigint := 0;
  v_total bigint := 0;
  v_org record;
  v_user uuid;
  v_today date;
  v_this date;
  v_h jsonb;
begin
  return query
  select 'halls_note_versions'::text, count(*) from public.halls_day_notes n
  where n.version < 1 or exists (select 1 from public.halls_day_notes o where o.version = n.version and o.id <> n.id);

  for v_org in select distinct x.org_id from public.flocks x where x.placed_on is not null order by 1 loop
    select m.user_id into v_user from public.members m
    where m.org_id = v_org.org_id and m.role = 'owner' and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
    order by m.created_at, m.id limit 1;
    continue when v_user is null;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    begin
      v_today := public.app_today();
      v_this := v_today - extract(day from v_today)::int + 1;
      v_h := public.halls_history(null);
      v_days := v_days + (
        select count(*) from jsonb_array_elements(v_h -> 'kinds') as k(j)
        left join lateral (select x.j from jsonb_array_elements(k.j -> 'months') as x(j) where (x.j ->> 'month')::date = v_this) as mo on true
        cross join lateral (
          select count(*) as n, coalesce(sum((d.j ->> 'placed')::bigint), 0) as placed, coalesce(sum((d.j ->> 'dead')::bigint), 0) as dead,
            coalesce(sum((d.j ->> 'culled')::bigint), 0) as culled, coalesce(sum((d.j ->> 'sold')::bigint), 0) as sold,
            coalesce(sum((d.j ->> 'count_diff')::bigint), 0) as count_diff, coalesce(sum((d.j ->> 'feed_kg')::numeric), 0) as feed_kg,
            coalesce(sum((d.j ->> 'given_kg')::numeric), 0) as given_kg, coalesce(sum((d.j ->> 'given_unweighed')::bigint), 0) as given_unweighed,
            coalesce(sum((d.j ->> 'eggs_total')::bigint), 0) as eggs_total, coalesce(sum((d.j ->> 'eggs_broken')::bigint), 0) as eggs_broken,
            (array_agg((d.j ->> 'live_end')::bigint order by (d.j ->> 'on')::date desc))[1] as live_end
          from jsonb_array_elements(k.j -> 'days') as d(j)
        ) as s
        cross join lateral (
          -- الأشهر من شهر البداية إلى شهر اليوم شهراً شهراً، وأيّام كلّ شهر داخل [البداية، اليوم].
          select count(*) filter (where e.j is null or g.m is null
              or (e.j ->> 'days')::int <> least((g.m + interval '1 month')::date - 1, v_today) - greatest(g.m, (k.j ->> 'start')::date) + 1) as bad,
            count(distinct g.m) as expected
          from (select (x.j ->> 'month')::date as month, x.j from jsonb_array_elements(k.j -> 'months') as x(j)) as e
          full join (
            select (b.m0 + make_interval(months => q.n))::date as m
            from (select (k.j ->> 'start')::date - extract(day from (k.j ->> 'start')::date)::int + 1 as m0) as b
            cross join lateral generate_series(0, ((extract(year from v_this) - extract(year from b.m0)) * 12 + extract(month from v_this) - extract(month from b.m0))::int) as q(n)
          ) as g on g.m = e.month
        ) as c
        where c.bad > 0 or jsonb_array_length(k.j -> 'months') <> c.expected or mo.j is null or (s.n = 0) or (s.n <> v_today - greatest(v_this, (k.j ->> 'start')::date) + 1)
          or (mo.j ->> 'days')::bigint <> s.n or (mo.j ->> 'placed')::bigint <> s.placed or (mo.j ->> 'dead')::bigint <> s.dead
          or (mo.j ->> 'culled')::bigint <> s.culled or (mo.j ->> 'sold')::bigint <> s.sold or (mo.j ->> 'count_diff')::bigint <> s.count_diff
          or (mo.j ->> 'feed_kg')::numeric <> s.feed_kg or (mo.j ->> 'given_kg')::numeric <> s.given_kg
          or (mo.j ->> 'given_unweighed')::bigint <> s.given_unweighed or coalesce((mo.j ->> 'eggs_total')::bigint, 0) <> s.eggs_total
          or coalesce((mo.j ->> 'eggs_broken')::bigint, 0) <> s.eggs_broken or (mo.j ->> 'live_end')::bigint is distinct from s.live_end);
      v_total := v_total + (
        select count(*) from jsonb_array_elements(v_h -> 'kinds') as k(j)
        cross join lateral (
          select coalesce(sum((x.j ->> 'days')::bigint), 0) as days, coalesce(sum((x.j ->> 'placed')::bigint), 0) as placed,
            coalesce(sum((x.j ->> 'dead')::bigint), 0) as dead, coalesce(sum((x.j ->> 'culled')::bigint), 0) as culled,
            coalesce(sum((x.j ->> 'sold')::bigint), 0) as sold, coalesce(sum((x.j ->> 'count_diff')::bigint), 0) as count_diff,
            coalesce(sum((x.j ->> 'feed_kg')::numeric), 0) as feed_kg, coalesce(sum((x.j ->> 'given_kg')::numeric), 0) as given_kg,
            coalesce(sum((x.j ->> 'given_unweighed')::bigint), 0) as given_unweighed, coalesce(sum((x.j ->> 'eggs_total')::bigint), 0) as eggs_total,
            coalesce(sum((x.j ->> 'eggs_broken')::bigint), 0) as eggs_broken, coalesce(sum((x.j ->> 'opened')::bigint), 0) as opened,
            coalesce(sum((x.j ->> 'closed')::bigint), 0) as closed,
            (array_agg((x.j ->> 'live_end')::bigint order by (x.j ->> 'month')::date desc))[1] as live_now
          from jsonb_array_elements(k.j -> 'months') as x(j)
        ) as s
        cross join lateral (select k.j -> 'total' as t) as o
        where (o.t ->> 'days')::bigint <> s.days or (o.t ->> 'placed')::bigint <> s.placed or (o.t ->> 'dead')::bigint <> s.dead
          or (o.t ->> 'culled')::bigint <> s.culled or (o.t ->> 'sold')::bigint <> s.sold or (o.t ->> 'count_diff')::bigint <> s.count_diff
          or (o.t ->> 'feed_kg')::numeric <> s.feed_kg or (o.t ->> 'given_kg')::numeric <> s.given_kg
          or (o.t ->> 'given_unweighed')::bigint <> s.given_unweighed or coalesce((o.t ->> 'eggs_total')::bigint, 0) <> s.eggs_total
          or coalesce((o.t ->> 'eggs_broken')::bigint, 0) <> s.eggs_broken or (o.t ->> 'opened')::bigint <> s.opened
          or (o.t ->> 'closed')::bigint <> s.closed or (o.t ->> 'live_now')::bigint is distinct from s.live_now
          or (o.t ->> 'days')::bigint <> v_today - (k.j ->> 'start')::date + 1);
    exception when others then
      v_days := v_days + 1;
    end;
  end loop;
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  return query select 'history_days_month'::text, v_days
    union all select 'history_months_total'::text, v_total;
end
$$;

-- ─── و. الصلاحيات ──────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.halls_history(date), public.set_halls_note(date, text, bigint) from public, anon;
grant execute on function public.halls_history(date), public.set_halls_note(date, text, bigint) to authenticated;
revoke all on function public.verify_halls_history() from public, anon, authenticated;
grant execute on function public.verify_halls_history() to service_role;
