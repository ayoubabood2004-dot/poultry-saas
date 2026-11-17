-- 0032_round_visits — الجولة بزيارات في اليوم: كلّ تسجيل في الحقل زيارة تُحفظ وحدها بوقتها وكاتبها، ومجموع اليوم = مجموع الزيارات الحيّة (كلمة المالك
--   2026-11-17 وأجوبته الثلاثة: «كلّ زيارة تنضاف»، و«كلّ الحركات بشاشة الجولة»، و«كلّ القاعات مختارة وتُشال المستثناة»؛ الخطّة docs/ROUND_VISITS_PLAN.md،
--   والعقد docs/plans/0032/contract-0032.md؛ DECISIONS 2026-11-17).
-- المشكلة: الجولة صفّ واحد لكلّ (فوج، يوم) خاناته «مجموع اليوم» (0012)، فمن يزور القاعة مرّة ثانية في اليوم يجمع بيده ويكتب المجموع الجديد، وإلّا ضاع
--   ما سجّله أوّلاً؛ وجهازان يسجّلان للقاعة نفسها في اليوم نفسه يتعارضان (stale_day) بدل أن يُجمعا؛ ولا يُعرف من سجّل ماذا ومتى.
-- هنا:
--   • public.flock_visits: زيارة لكلّ تسجيل بمعرّف من الجهاز ووقت تسجيله وكاتبه ونسخته (تكبر بكلّ تعديل أو إلغاء)، ومصدرها: visit (من الجولة) أو
--     day_total (من save_flock_day القديمة) أو legacy (التحويل). لا مال ولا مخزون فيها، والإلغاء علامة (voided_at) لا حذف. تكتبها الدالّتان وحدهما،
--     ويقرؤها من نطاقه حقل القاعة كـflock_daily.
--   • private.flock_day_rebuild(الفوج، اليوم): الكاتب الوحيد لـflock_daily بعد اليوم. يجمع زيارات اليوم الحيّة (الأعداد مجموعاً، والعلف والماء والبيض
--     مجموع غير الفارغ وnull إن فرغت كلّها، والحرارة أصغر الصغرى وأكبر الكبرى، والملاحظات بترتيب الزيارات مفصولة بـ« · » وتُقصّ عند 500 حرف)، ويحذف صفّ
--     اليوم حين لا تبقى زيارة حيّة (وجوده = «سُجّلت جولة» عند كلّ القرّاء). فلا يتغيّر قارئ واحد: report_days وhalls_day وflock_summary وflock_detail
--     وflock_feed وhalls_history كلّها تقرأ مجموع اليوم كما هو.
--   • التحويل: لكلّ صفّ flock_daily قائم زيارة legacy واحدة بقيمه كلّها (بلا إعادة بناء)، فالمجموع = الصفّ حرفاً ولا يتغيّر رقم في أيّ تقرير.
--   • public.save_flock_visit (flock_day.save، بالطابور ومرجع client_ref): إضافة زيارة، أو تعديلها بشرط نسختها (stale_visit)، أو إلغاؤها؛ والركن من
--     الطابور كالجولة (flock_closed وout_of_scope وdate_too_old وperiod_locked)؛ وبعد كلّ كتابة يُعاد بناء اليوم وتُفحص الأيّام على المجموع (البيض لا
--     يزيد على الحيّ أوّل اليوم، والحيّ لا يصير سالباً في أيّ يوم)، وأيّ رفض يرجع المعاملة كلّها.
--   • public.save_flock_day بتوقيعها ونتائجها نفسها (عمليات قديمة مخزّنة في الأجهزة): كلّ ما قبل الكتابة كما في 0029 حرفاً، والكتابة «اجعل مجموع
--     اليوم كذا»: تُلغى زيارات اليوم الحيّة وتُضاف زيارة day_total بالمجموع المدموج، ثمّ يُعاد بناء اليوم.
--   • flock_day_rejects.visit_id: الزيارة المركونة بمعرّفها، والقيد الفريد (المستخدم، الفوج، اليوم) صار فهرسين جزئيّين: الأوّل كما كان لعمليات
--     save_flock_day (الأحدث يستبدل)، والثاني (المنشأة، الزيارة) فلا تكتب زيارة مركونة فوق أخرى.
--   • public.round_visits(اليوم، النوع، الفوج): زيارات اليوم الحيّة لكلّ فوج من النوع له زيارة (أو للفوج المطلوب وحده)، بوقتها وكاتبها ومصدرها.
--   • public.delete_flock: الزيارات الحيّة تمنع الحذف كالجولات، والملغاة وحدها لا تمنعه وتُحذف معه (سجلّ التدقيق يحفظها).
--   • public.verify_round_visits (لمفتاح الخادم): صفّ اليوم = مجموع زياراته الحيّة عموداً عموداً، ولا صفّ بلا زيارة ولا زيارة حيّة بلا صفّ، وقاعة الزيارة
--     قاعة فوجها، ولا بيض لفوج لحم، والنسخ موجبة، وزيارة legacy واحدة على الأكثر لكلّ يوم، ونسخة اليوم لا تزيد على مجموع نسخ زياراته.
-- قرارات بلا سؤال (داخل الخطوط الحمر والعقد):
--   • نسخة صفّ اليوم لا ترجع إلى الوراء أبداً (درس ABA 2026-11-16): زيارة legacy تأخذ نسخة صفّ يومها لا 1، والصفّ الذي يُنشأ (أوّل مرّة أو بعد إلغاء
--     كلّ زيارات يومه) يأخذ مجموع نسخ زيارات يومه كلّها، والتحديث +1؛ فنسخة اليوم ≤ مجموع نسخ زياراته دائماً (الثابت day_version_bound)، وكلّ كتابة
--     زيارة تزيد المجموع 1، فالصفّ المعاد إنشاؤه أكبر من كلّ نسخة رآها جهاز، وعملية save_flock_day قديمة ترجع stale_day. ويوم جديد بزيارة واحدة نسخته 1
--     كما كانت.
--   • فحصا المجموع eggs_over_total وbad_temp لازمان من فحص كلّ زيارة (المكسور والمشعور لا يزيدان على بيض الزيارة نفسها، والحرارة لا تُكتب إلّا بـ
--     save_flock_day التي تلغي ما قبلها)، فيبقى قيدا flock_daily حارساً أخيراً؛ ومجموع يتجاوز حدود أعمدة صفّ اليوم bad_value.
--   • الزيارة: وقتها وقت إضافتها (التعديل لا يغيّره)، والماء والحرارة لا تُكتب بها (خارج الجولة بكلمة المالك 2026-11-11)، فتعديل زيارة legacy أو
--     day_total يُبقي ماءها وحرارتها؛ والملاحظة بلا فراغ في طرفيها (note_text، 0022)، وزيارة بلا رقم ولا ملاحظة empty_visit (الصفر الصريح رقم).
--   • زيارة بمعرّف مسجَّل لفوج أو يوم آخر visit_moved (لا stale_visit) فلا يرجع إلى جهاز شيء خارج ما أرسله؛ وبلا معرّف visit_required.
--   • last_ref في flock_daily لم يعد يُكتب (لا يقرؤه أحد)؛ والمرجع في rpc_refs وفي الزيارة نفسها.
--   • round_visits بفوج مطلوب: الفوج وحده ولو بلا زيارة (visits فارغة)، وغير موجود flock_not_found، وخارج النطاق out_of_scope، ومن نوع آخر بلا أفواج.
-- تراجع: rollback_0032.sql — يرجّع save_flock_day وdelete_flock كما في 0029 حرفاً بحرف، ويُسقط الدوالّ الجديدة والجدول، ويرجّع قيد flock_day_rejects كما
--   في 0012 ويُسقط عمود visit_id وفهرسيه. **طريق رفض**: زيارة حيّة غير legacy، أو زيارة ملغاة، أو زيارة مركونة، كلّ واحدة توقف التراجع بصوت (بيانات لا
--   يحملها النموذج القديم).
-- تنعاد بأمان: create table/index if not exists، وadd column if not exists، وdrop constraint if exists، وكتلة do تفحص الكتالوج قبل السياسة، والتحويل لما
--   لا زيارة له وحده، وcreate or replace، وrevoke وgrant.

set lock_timeout = '5s';

-- ─── أ. جدول الزيارات ──────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.flock_visits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  flock_id uuid not null,
  hall_id uuid not null,
  site_id uuid not null,
  division_id uuid not null,
  on_date date not null,
  recorded_at timestamptz not null,
  dead integer not null default 0,
  culled integer not null default 0,
  feed_kg numeric,
  water_l numeric,
  temp_min numeric,
  temp_max numeric,
  eggs_total integer,
  eggs_cracked integer,
  eggs_broken integer,
  note text,
  source text not null,
  version int not null default 1,
  voided_at timestamptz,
  voided_by uuid,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint flock_visits_birds_check check (dead between 0 and 10000000 and culled between 0 and 10000000),
  constraint flock_visits_feed_check check (feed_kg is null or (abs(feed_kg) < 'Infinity' and feed_kg >= 0 and feed_kg < 1000000000 and feed_kg = round(feed_kg, 3))),
  constraint flock_visits_water_check check (water_l is null or (abs(water_l) < 'Infinity' and water_l >= 0 and water_l < 1000000000 and water_l = round(water_l, 3))),
  constraint flock_visits_temp_min_check check (temp_min is null or (abs(temp_min) < 'Infinity' and temp_min between -50 and 70 and temp_min = round(temp_min, 1))),
  constraint flock_visits_temp_max_check check (temp_max is null or (abs(temp_max) < 'Infinity' and temp_max between -50 and 70 and temp_max = round(temp_max, 1))),
  constraint flock_visits_temp_order_check check (temp_min is null or temp_max is null or temp_min <= temp_max),
  constraint flock_visits_eggs_check check (
    (eggs_total is null or eggs_total between 0 and 10000000)
    and (eggs_cracked is null or eggs_cracked between 0 and 10000000) and (eggs_broken is null or eggs_broken between 0 and 10000000)
    and ((eggs_cracked is null and eggs_broken is null) or eggs_total is not null)
    and coalesce(eggs_cracked, 0) + coalesce(eggs_broken, 0) <= coalesce(eggs_total, 0)),
  -- ملاحظة الزيارة الجديدة بلا فراغ في طرفيها؛ وملاحظة legacy وday_total كما كتبتها save_flock_day (حرفاً، فالمجموع = الصفّ).
  constraint flock_visits_note_check check (note is null or (length(note) between 1 and 500 and (source <> 'visit' or coalesce(private.note_text(note) = note, false)))),
  constraint flock_visits_source_check check (source in ('visit', 'day_total', 'legacy')),
  constraint flock_visits_version_check check (version >= 1),
  constraint flock_visits_void_check check (voided_by is null or voided_at is not null),
  constraint flock_visits_time_check check (isfinite(recorded_at) and isfinite(on_date)),
  unique (org_id, id),
  foreign key (org_id, flock_id) references public.flocks (org_id, id),
  foreign key (org_id, division_id, site_id, hall_id) references public.halls (org_id, division_id, site_id, id)
);
create index if not exists flock_visits_day on public.flock_visits (org_id, flock_id, on_date);
create index if not exists flock_visits_hall on public.flock_visits (org_id, division_id, site_id, hall_id);

alter table public.flock_visits enable row level security;

do $$
begin
  -- القراءة بنطاق حقل القاعة كـflock_daily (FOUNDATION ٥٤٤)، والكتابة بالدالّتين وحدهما.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'flock_visits' and policyname = 'flock_visits_read') then
    create policy flock_visits_read on public.flock_visits for select to authenticated
      using (org_id = (select public.auth_org()) and (select public.in_scope_site(site_id)));
  end if;
  execute 'create or replace trigger audit_flock_visits after insert or update or delete on public.flock_visits for each row execute function private.audit_row()';
end
$$;

revoke all on table public.flock_visits from anon, authenticated;
grant select on table public.flock_visits to authenticated;
revoke truncate on table public.flock_visits from service_role;

-- ─── ب. الزيارة المركونة بمعرّفها ─────────────────────────────────────────────────────────────────────────────────────
-- القيد الفريد (المنشأة، المستخدم، الفوج، اليوم) من 0012 صار فهرسين جزئيّين: عمليات save_flock_day كما كانت (الأحدث يستبدل)، والزيارة بمعرّفها.
alter table public.flock_day_rejects add column if not exists visit_id uuid;
alter table public.flock_day_rejects drop constraint if exists flock_day_rejects_org_id_created_by_flock_id_on_date_key;
create unique index if not exists flock_day_rejects_day_op on public.flock_day_rejects (org_id, created_by, flock_id, on_date) where visit_id is null;
create unique index if not exists flock_day_rejects_visit on public.flock_day_rejects (org_id, visit_id) where visit_id is not null;

-- ─── ج. المساعدات ──────────────────────────────────────────────────────────────────────────────────────────────────
-- الزيارة بالشكل الذي ترجعه الدالّتان والقارئ (العقد 0032): العلف نصّ بثلاث مراتب، والكاتب اسمه في المنشأة (null إن لم يُعرف).
create or replace function private.flock_visit_json(v public.flock_visits) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when v.id is null then null else jsonb_build_object(
    'id', v.id, 'flock_id', v.flock_id, 'on', v.on_date, 'recorded_at', v.recorded_at, 'dead', v.dead, 'culled', v.culled,
    'feed_kg', round(v.feed_kg, 3)::text, 'eggs_total', v.eggs_total, 'eggs_cracked', v.eggs_cracked, 'eggs_broken', v.eggs_broken,
    'note', v.note, 'source', v.source, 'version', v.version, 'voided', v.voided_at is not null,
    'by', (select m.display_name from public.members m where m.org_id = v.org_id and m.user_id = v.created_by)) end
$$;

-- الكاتب الوحيد لصفّ اليوم: مجموع زيارات (الفوج، اليوم) الحيّة، أو حذف الصفّ حين لا تبقى زيارة حيّة. يناديه كاتب الزيارات تحت قفل صفّ الفوج بعد
-- كتابته، فيقرأ الزيارات بعد القفل. النسخة: التحديث +1، والإنشاء مجموع نسخ زيارات اليوم كلّها (الحيّة والملغاة)، فلا ترجع نسخة رآها جهاز (درس ABA).
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
    string_agg(v.note, ' ' || chr(183) || ' ' order by v.recorded_at, v.created_at, v.id) filter (where v.note <> '') as note
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
      eggs_total, eggs_cracked, eggs_broken, note, version)
    values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_on, s.dead, s.culled, s.feed_kg, s.water_l, s.temp_min, s.temp_max,
      s.eggs_total, s.eggs_cracked, s.eggs_broken, v_note,
      (select sum(y.version)::int from public.flock_visits y where y.org_id = f.org_id and y.flock_id = f.id and y.on_date = p_on))
    returning * into d;
  else
    update public.flock_daily x
    set dead = s.dead, culled = s.culled, feed_kg = s.feed_kg, water_l = s.water_l, temp_min = s.temp_min, temp_max = s.temp_max,
        eggs_total = s.eggs_total, eggs_cracked = s.eggs_cracked, eggs_broken = s.eggs_broken, note = v_note,
        version = x.version + 1, updated_at = now(), updated_by = auth.uid()
    where x.org_id = d.org_id and x.id = d.id
    returning * into d;
  end if;
  return d;
end
$$;

-- بيض كلّ يوم من p_from فما بعده لا يزيد على الدجاج الحيّ في بدايته (القاعدة ٣٢)، على صفوف الأيّام بعد إعادة بنائها: مرآة فحص save_flock_day قبل
-- كتابتها (الحيّ أوّل اليوم = المسكَّن − النافق والمستبعد قبله + أصول العدد الحيّة قبله).
create or replace function private.flock_eggs_live_check(f public.flocks, p_from date) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_bad record;
begin
  select x.on_date, x.eggs_total, x.live_start into v_bad from (
    select y.on_date, y.eggs_total,
      f.placed_count - coalesce(sum(y.dead + y.culled) over (order by y.on_date rows between unbounded preceding and 1 preceding), 0)
        + coalesce((select sum(k.adjust - k.sold) from private.flock_count_days(f.id) as k where k.on_date < y.on_date), 0) as live_start
    from public.flock_daily y where y.org_id = f.org_id and y.flock_id = f.id
  ) as x
  where x.on_date >= p_from and x.eggs_total > x.live_start
  order by x.on_date limit 1;
  if v_bad.on_date is not null then
    raise exception 'eggs_over_live' using hint = format('بيض يوم %s (%s) أكثر من الدجاج الحيّ في بدايته (%s)، والنسبة فوق 100٪ خطأ إدخال. راجع الأرقام.',
      to_char(v_bad.on_date, 'DD/MM/YYYY'), to_char(v_bad.eggs_total, 'FM999,999,999,990'), to_char(v_bad.live_start, 'FM999,999,999,990'));
  end if;
end
$$;

-- ─── د. التحويل: كلّ صفّ يوم قائم زيارة legacy واحدة بقيمه (بلا إعادة بناء) ─────────────────────────────────────────────
-- وقتها وقت آخر تعديل للصفّ، وكاتبها آخر من عدّله، ونسختها نسخة الصفّ (فالثابت day_version_bound صفر من أوّل يوم). والصفّ الذي له زيارة لا يُمسّ
-- (إعادة الهجرة لا تكرّر شيئاً).
insert into public.flock_visits (org_id, flock_id, hall_id, site_id, division_id, on_date, recorded_at, dead, culled, feed_kg, water_l, temp_min, temp_max,
  eggs_total, eggs_cracked, eggs_broken, note, source, version, created_by, updated_at, updated_by)
select d.org_id, d.flock_id, d.hall_id, d.site_id, d.division_id, d.on_date, d.updated_at, d.dead, d.culled, d.feed_kg, d.water_l, d.temp_min, d.temp_max,
  d.eggs_total, d.eggs_cracked, d.eggs_broken, d.note, 'legacy', d.version, coalesce(d.updated_by, d.created_by), d.updated_at, coalesce(d.updated_by, d.created_by)
from public.flock_daily d
where not exists (select 1 from public.flock_visits v where v.org_id = d.org_id and v.flock_id = d.flock_id and v.on_date = d.on_date)
order by d.org_id, d.flock_id, d.on_date;

-- ─── هـ. الكاتب: زيارة تُضاف أو تُعدَّل أو تُلغى ───────────────────────────────────────────────────────────────────────────
-- p_base_version null = إضافة (p_visit من الجهاز)، ورقم = تعديل أو إلغاء (p_void) بشرط نسخة الزيارة. المحتوى كامل لا دمج (الفارغ فارغ)، والنافق والمستبعد
-- الفارغان صفر. الأربعة التي تتغيّر والعملية بالطابور تُركن كالجولة (بنداء مباشر ترمي)، والزيارة المركونة بمعرّفها فلا تكتب فوق أخرى.
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

-- ─── و. التوافق: save_flock_day بتوقيعها ونتائجها ──────────────────────────────────────────────────────────────────────
-- الجولة اليومية (الجسم الأخير من 0029): كلّ ما قبل الكتابة كما هو حرفاً، والركن بالفهرس الجزئيّ الأوّل، والكتابة بالزيارات (0032).
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

-- ─── ز. حذف الفوج ─────────────────────────────────────────────────────────────────────────────────────────────────
-- حذف الفوج (الجسم الأخير من 0029): الزيارات الحيّة تمنعه كالجولات، والملغاة وحدها تُحذف معه (0032).
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
  begin
    delete from public.flocks x where x.org_id = f.org_id and x.id = f.id;
  exception when foreign_key_violation then
    raise exception 'flock_has_records' using hint = format('لفوج «%s» سجلّ مرتبط به، فلا يُحذف. إن كان التاريخ أو العدد غلطاً فاضغط «عدّل الفوج» وصحّحه.', v_hall);
  end;
  v_result := jsonb_build_object('flock_id', f.id, 'deleted', true);
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;

-- ─── ح. القارئ: زيارات اليوم ─────────────────────────────────────────────────────────────────────────────────────────
-- p_on null = يوم الخادم. الأفواج من النوع في نطاق القارئ التي لها زيارة حيّة ذلك اليوم (أو الفوج المطلوب وحده ولو بلا زيارة)، بترتيب الحقل ثمّ القاعة،
-- والزيارات الحيّة وحدها بترتيب تسجيلها.
create or replace function public.round_visits(p_on date, p_kind text, p_flock uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_on date := coalesce(p_on, public.app_today());
  f public.flocks;
begin
  perform private.require('read');
  if p_kind is null or p_kind not in ('broiler', 'layer') then
    raise exception 'bad_kind' using hint = 'نوع الحقول إمّا لحم أو بيّاض.';
  end if;
  if not isfinite(v_on) then
    raise exception 'date_required' using hint = 'اختر يوماً من التقويم.';
  end if;
  if p_flock is not null then
    select * into f from public.flocks x where x.org_id = v_org and x.id = p_flock;
    if f.id is null then
      raise exception 'flock_not_found' using hint = 'هذا الفوج غير موجود في منشأتك. حدّث الشاشة.';
    end if;
    if not public.in_scope_site(f.site_id) then
      raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
    end if;
  end if;
  return jsonb_build_object('on', v_on, 'today', v_today, 'flocks', coalesce((
    select jsonb_agg(jsonb_build_object('flock_id', q.id, 'hall_id', q.hall_id, 'visits', q.visits)
      order by q.site_name collate "C", q.hall_name collate "C", q.hall_id)
    from (
      select fl.id, fl.hall_id, s.name as site_name, h.name as hall_name,
        coalesce((select jsonb_agg(private.flock_visit_json(v) order by v.recorded_at, v.created_at, v.id) from public.flock_visits v
          where v.org_id = fl.org_id and v.flock_id = fl.id and v.on_date = v_on and v.voided_at is null), '[]'::jsonb) as visits
      from public.flocks fl
      join public.halls h on h.org_id = fl.org_id and h.id = fl.hall_id
      join public.sites s on s.org_id = h.org_id and s.id = h.site_id
      where fl.org_id = v_org and fl.kind = p_kind and public.in_scope_site(fl.site_id)
        and case when p_flock is null
          then exists (select 1 from public.flock_visits v where v.org_id = fl.org_id and v.flock_id = fl.id and v.on_date = v_on and v.voided_at is null)
          else fl.id = p_flock end
    ) as q), '[]'::jsonb));
end
$$;

-- ─── ط. الثابت (مفتاح الخادم) ───────────────────────────────────────────────────────────────────────────────────────
-- مجموع اليوم محسوب هنا مستقلّاً عن flock_day_rebuild (طفرة في المساعد يمسكها الثابت لا يكرّرها).
create or replace function public.verify_round_visits() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  with live as (
    select v.org_id, v.flock_id, v.on_date, sum(v.dead) as dead, sum(v.culled) as culled, sum(v.feed_kg) as feed_kg, sum(v.water_l) as water_l,
      min(v.temp_min) as temp_min, max(v.temp_max) as temp_max, sum(v.eggs_total) as eggs_total, sum(v.eggs_cracked) as eggs_cracked,
      sum(v.eggs_broken) as eggs_broken,
      string_agg(v.note, ' ' || chr(183) || ' ' order by v.recorded_at, v.created_at, v.id) filter (where v.note <> '') as notes
    from public.flock_visits v
    where v.voided_at is null
    group by v.org_id, v.flock_id, v.on_date
  ), every_visit as (
    select v.org_id, v.flock_id, v.on_date, sum(v.version) as versions
    from public.flock_visits v
    group by v.org_id, v.flock_id, v.on_date
  )
  select 'day_equals_visits'::text, count(*) from public.flock_daily d
  join live l on l.org_id = d.org_id and l.flock_id = d.flock_id and l.on_date = d.on_date
  where (d.dead, d.culled, d.feed_kg, d.water_l, d.temp_min, d.temp_max, d.eggs_total, d.eggs_cracked, d.eggs_broken, d.note)
    is distinct from (l.dead, l.culled, l.feed_kg, l.water_l, l.temp_min, l.temp_max, l.eggs_total, l.eggs_cracked, l.eggs_broken,
      case when length(l.notes) > 500 then left(l.notes, 499) || chr(8230) else l.notes end)
  union all
  select 'day_without_visits', count(*) from public.flock_daily d
  where not exists (select 1 from live l where l.org_id = d.org_id and l.flock_id = d.flock_id and l.on_date = d.on_date)
  union all
  select 'visits_without_day', count(*) from live l
  where not exists (select 1 from public.flock_daily d where d.org_id = l.org_id and d.flock_id = l.flock_id and d.on_date = l.on_date)
  union all
  select 'visit_hall_mismatch', count(*) from public.flock_visits v
  join public.flocks f on f.org_id = v.org_id and f.id = v.flock_id
  where (v.hall_id, v.site_id, v.division_id) is distinct from (f.hall_id, f.site_id, f.division_id)
  union all
  select 'visit_eggs_on_broiler', count(*) from public.flock_visits v
  join public.flocks f on f.org_id = v.org_id and f.id = v.flock_id
  where f.kind = 'broiler' and (v.eggs_total is not null or v.eggs_cracked is not null or v.eggs_broken is not null)
  union all
  select 'visit_versions', count(*) from public.flock_visits v where v.version < 1
  union all
  select 'legacy_once', count(*) from (
    select 1 from public.flock_visits v where v.source = 'legacy' group by v.org_id, v.flock_id, v.on_date having count(*) > 1
  ) as x
  union all
  select 'day_version_bound', count(*) from public.flock_daily d
  join every_visit e on e.org_id = d.org_id and e.flock_id = d.flock_id and e.on_date = d.on_date
  where d.version > e.versions
$$;

-- ─── ي. الصلاحيات ──────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.save_flock_visit(uuid, uuid, date, timestamptz, integer, integer, numeric, integer, integer, integer, text, integer, boolean, uuid, boolean),
  public.round_visits(date, text, uuid) from public, anon;
grant execute on function public.save_flock_visit(uuid, uuid, date, timestamptz, integer, integer, numeric, integer, integer, integer, text, integer, boolean, uuid, boolean),
  public.round_visits(date, text, uuid) to authenticated;
revoke all on function public.verify_round_visits() from public, anon, authenticated;
grant execute on function public.verify_round_visits() to service_role;
