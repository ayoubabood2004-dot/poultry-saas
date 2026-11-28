-- 0038_hall_sections — القاعة بأقسام: هلاكات كلّ قسم في خانته، والعلف والغاز والكاز والبيع للقاعة كلّها (ملاحظات «دواجن الأمير» التي نقلها المالك
--   2026-11-26 وأجوبته بخيارات؛ العقد docs/plans/0038/contract-0038.md «الجزء D»؛ DECISIONS 2026-11-26).
-- المشكلة: عند الزبون قاعة واحدة مقسومة قسمين: العلف والغاز للقاعة كلّها («دز طن فهو للقاعتين، الغاز عشرين فهو للقاعتين»)، والطيور والهلاكات لكلّ
--   قسم («العدد همين ينقسم بالنص»)؛ والنظام يعرف القاعة وحدةً واحدة: عدد واحد عند التسكين وهلاكات واحدة لكلّ يوم. وجواب المالك: الأقسام على القاعة
--   (عند إنشائها أو تعديلها)، وكلّ وجبة فيها تأخذ أقسامها، وعدد كلّ قسم يُكتب عند التسكين (بالتساوي افتراضاً)، والجولة والورقة تأخذان هلاكات كلّ قسم
--   بخانته، والعلف والغاز والكاز والبيع للقاعة كلّها، وهلاكات الوجبة = مجموع أقسامها فيبقى كلّ تقرير قائم صحيحاً.
-- هنا:
--   • halls.sections (من 1 إلى 4، و1 = غير مقسومة): يُكتب عند إنشاء القاعة (منح إدخال على العمود كالاسم والسعة)، ولا منح تعديل عليه: تغييره
--     بـset_hall_sections وحدها. وflocks.section_counts: عدد كلّ قسم للوجبة المقسومة (خانة لكلّ قسم ومجموعها العدد الداخل)، وفارغ لغيرها.
--     وflock_visits.dead_parts وflock_daily.dead_parts: هلاكات كلّ قسم (مجموعها النافق، والمستبعد القديم صفر معها)، وفارغة لغير المقسومة.
--   • المساعدات (private، ثابتة): parts_valid (من خانتين إلى أربع، كلّ خانة عدد صحيح غير سالب)، وparts_sum، وparts_add (مجموع أقسام صفوف كثيرة
--     خانةً خانة)، وparts_even (التقسيم بالتساوي والباقي للأقسام الأولى)؛ وبلا قسمة «/».
--   • private.flock_day_rebuild (الكاتب الوحيد لصفّ اليوم، 0032/0036): أقسام اليوم مجموع أقسام زياراته الحيّة، وزيارة حيّة بهلاكات بلا أقسام في وجبة
--     مقسومة ترفض sections_required: قاعدة واحدة لكلّ كاتب، فتطبيق قبل 0038 (save_flock_visit أو set_flock_dead بلا أقسام) لا يكتب هلاكات وجبة مقسومة.
--     وprivate.flock_parts_check: هلاكات كلّ قسم في الأيّام كلّها لا تزيد على عدده (live_negative يسمّي القسم)، كـflock_live_check للوجبة كلّها.
--   • public.set_flock_dead وpublic.save_flock_day بمعامل أقسام اختياريّ (p_parts وp_dead_parts، افتراضه فارغ: النداءات القائمة كما هي): للوجبة
--     المقسومة هلاكات كلّ قسم بمجموعها، ولغيرها بلا أقسام؛ «مرّة في اليوم» بالأقسام نفسها saved وبغيرها dead_recorded؛ والمركون يحمل الأقسام.
--   • public.save_flock_visit (0036، توقيعه كما هو): تعديلٌ يغيّر هلاكات زيارة بأقسام يمحو أقسامها، فتطبيق قبل 0038 يُردّ بـsections_required
--     (flock_day_rebuild) لا بالقيد الخام، والتصفير يُحفظ (مراجعة 2026-11-27).
--   • public.open_flock وpublic.edit_flock بأعداد أقسام اختياريّة (p_section_counts): التسكين بالتساوي افتراضاً أو بالمرسل، وتعديل العدد الداخل
--     لوجبة مقسومة يطلب عدد كلّ قسم (section_counts_required)، ولا يقلّ قسم عن هلاكاته؛ وأعداد الأقسام وحدها كالعدد في الفترة المقفلة (period_locked).
--   • public.set_hall_sections (flock.manage، بمرجع client_ref وبشرط نسخة القاعة): saved | stale_hall، والرفض sections_after_deaths ما دامت في القاعة
--     وجبة قائمة سُجّلت هلاكاتها، وperiod_locked لوجبة قائمة تسكينها داخل الفترة المقفلة؛ وغير ذلك تُقسم الوجبة القائمة بالتساوي.
--   • public.reopen_flock (0029) لا يعيد فتح وجبة صارت أقسام قاعتها غير أقسامها (sections_changed)، وprivate.reopen_block (مرآته في flock_sales) بالشرط
--     نفسه وبترتيبه؛ ويقفل القاعة for no key update لا for update (كان يتقفّل مع كاتب من الطابور يركن عمليته، 40P01؛ مراجعة 2026-11-27).
--   • القرّاء (مفاتيح جديدة فقط، وكلّ مفتاح قائم كما هو): flock_day_json بـdead_parts، وflock_summary بـsection_counts وsection_dead، وflocks_overview
--     بـsections لكلّ قاعة، وhall_sheet بـdead_parts لكلّ يوم وtotals.dead_parts وsections في رأس الجواب؛ وhall_sheet بخطّة عامّة محفوظة لكلّ جلسة
--     (plan_cache_mode = force_generic_plan): كان استعلامها الكبير يُخطَّط من جديد في كلّ نداء، والجواب نفسه حرفاً بالخطّتين.
--   • public.verify_hall_sections (مفتاح الخادم): مدى الأقسام، وشكل أعداد الوجبة، وأقسام الزيارات والأيّام، ولا أقسام لغير المقسومة، وحدّ كلّ قسم،
--     والورقة لكلّ وجبة مقسومة بهويّة مالك منشأتها.
--   • الورقة تُقرأ مرّة في الثوابت (درس 2026-11-21): public.verify_hall_sheet (0035) يفحص مفاتيح الكاز (مجموع الأيّام = المجموع = الخلاصة) في قراءته
--     لكلّ ورقة ضمن sheet_totals، وpublic.verify_kerosene (0037) يقرأ ورقة الوجبة بكازها وحدها؛ وكان يقرأ ورقة كلّ وجبة مرّة ثانية، وكلاهما قرب مهلة
--     الطلب (8 ثوانٍ) بعد ملفّات الحزمة كلّها (نحو 700 وجبة مسكَّنة). وكلّ فحص فيهما كما هو.
-- قرارات بلا سؤال (داخل الخطوط الحمر والعقد):
--   • الأقسام في بصمة المرجع (ref_claim) وفي المركون حين تُرسل وحدها: عملية من تطبيق قبل 0038 أُرسلت قبل التطبيق وضاع جوابها تُعاد بالمرجع نفسه
--     ببصمتها القديمة (لا ref_reused)، ومركون save_flock_day بلا أقسام كما كان حرفاً.
--   • set_hall_sections تقسم الوجبة القائمة بلا هلاكات بالتساوي وتكبر نسختها (تعديل الوجبة بنسخة قبلها stale_flock)، وتجعل أقسام زياراتها الحيّة أصفاراً
--     بطول الأقسام الجديدة (أو فارغة لقسم واحد) بنسخة أكبر، وتعيد بناء أيّامها بـflock_day_rebuild (الكاتب الوحيد)، فيبقى كلّ صفّ يوم لوجبة مقسومة
--     بأقسامه (أصفار لليوم بلا هلاكات) ونسخة اليوم لا تزيد على مجموع نسخ زياراته (day_version_bound، 0032).
--   • المستبعد القديم لا يُقسم: save_flock_day بمستبعد لوجبة مقسومة bad_value، والقيد يُلزم المستبعد صفراً مع الأقسام.
--   • نسبة القسم بلا طيور (عدده صفر) «0.00» لا فارغة: الهلاكات فيه صفر بحدّ القسم، والورقة تقرأ النسبة رقماً.
--   • القسم يبقى بأعداده في الوجبة المغلقة، فتغيير أقسام قاعة بلا وجبة قائمة حرّ؛ وإعادة فتح وجبة أقسامها غير أقسام قاعتها ترفض (sections_changed)
--     حتى تعود أقسام القاعة كما كانت.
--   • open_flock وedit_flock يرجعان section_counts في جوابهما (مفتاح جديد، والواجهة المنشورة تقرأ مفاتيحها وحدها).
-- تراجع: rollback_0038.sql — يرجّع set_flock_dead وsave_flock_day وsave_flock_visit وflock_day_rebuild وflock_day_json وflock_summary وflocks_overview كما في 0036،
--   وhall_sheet وedit_flock وverify_kerosene كما في 0037، وverify_hall_sheet كما في 0035، وopen_flock وreopen_flock وreopen_block كما في 0029، حرفاً بحرف
--   وبتواقيعها القديمة ومنحها، ويُسقط
--   set_hall_sections وverify_hall_sections وflock_parts_check وflock_parts_input والأعمدة الأربعة (بقيودها ومنح العمود) ومساعداتها. **طريق رفض**:
--   قاعة مقسومة، أو وجبة بأعداد أقسام (ولو مغلقة)، أو زيارة أو يوم بهلاكات أقسام (ولو زيارة ملغاة)، كلّ واحد يوقف التراجع بصوت (بيانات لا يحملها
--   النموذج القديم).
-- تنعاد بأمان: add column if not exists، وdrop constraint if exists قبل القيد، وdrop function if exists للتواقيع القديمة، وcreate or replace، وrevoke وgrant.

set lock_timeout = '5s';

-- ─── أ. المساعدات (ثابتة، بلا قسمة «/») ─────────────────────────────────────────────────────────────────────────────────
-- أعداد أقسام صالحة: مصفوفة ببُعد واحد تبدأ من 1، من خانتين إلى أربع، كلّ خانة عدد صحيح غير سالب وغير فارغ؛ والفارغة غير صالحة.
create or replace function private.parts_valid(p integer[]) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select coalesce(array_ndims(p) = 1 and array_lower(p, 1) = 1 and cardinality(p) between 2 and 4
    and not exists (select 1 from unnest(p) as x where x is null or x < 0), false)
$$;

-- مجموع أعداد الأقسام (فارغ للفارغة).
create or replace function private.parts_sum(p integer[]) returns bigint
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select sum(x)::bigint from unnest(p) as x
$$;

-- مجموع أقسام صفوف كثيرة خانةً خانة: مصفوفة ببُعدين (صفّ لكلّ أقسام، كما يجمعها array_agg) ← أقسام واحدة بطولها؛ فارغة للفارغة.
create or replace function private.parts_add(p integer[]) returns integer[]
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select array_agg(t.s order by t.i) from (
    select c.i, sum(p[r.j][c.i])::integer as s
    from generate_subscripts(p, 1) as r(j) cross join generate_subscripts(p, 2) as c(i)
    group by c.i
  ) as t
$$;

-- العدد على الأقسام بالتساوي، والباقي للأقسام الأولى (27,051 على قسمين = 13,526 + 13,525)؛ فارغ لقسم واحد.
create or replace function private.parts_even(p_total integer, p_sections integer) returns integer[]
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case when p_total is not null and p_sections between 2 and 4 then
    (select array_agg(div(p_total, p_sections)::integer + case when g.i <= mod(p_total, p_sections) then 1 else 0 end order by g.i)
     from generate_series(1, p_sections) as g(i)) end
$$;

-- ─── ب. الأعمدة والقيود ────────────────────────────────────────────────────────────────────────────────────────────
-- أقسام القاعة من 1 إلى 4 (1 = غير مقسومة)، تُكتب عند إنشائها (منح إدخال على العمود كالاسم والسعة) ولا منح تعديل عليها: تغييرها بـset_hall_sections.
alter table public.halls add column if not exists sections smallint not null default 1;
alter table public.halls drop constraint if exists halls_sections_check,
  add constraint halls_sections_check check (sections between 1 and 4);
grant insert (sections) on public.halls to authenticated;
-- عدد كلّ قسم للوجبة المقسومة: خانة لكلّ قسم ومجموعها العدد الداخل (والوجبة بلا تسكين بلا أعداد)؛ وفارغ لغير المقسومة.
alter table public.flocks add column if not exists section_counts integer[];
alter table public.flocks drop constraint if exists flocks_section_counts_check,
  add constraint flocks_section_counts_check check (section_counts is null
    or (placed_count is not null and private.parts_valid(section_counts) and private.parts_sum(section_counts) = placed_count));
-- هلاكات كلّ قسم في الزيارة وفي صفّ اليوم: مجموعها النافق، والمستبعد القديم صفر معها (لا يُقسم)؛ وفارغة لغير المقسومة وللزيارة بلا هلاكات.
alter table public.flock_visits add column if not exists dead_parts integer[];
alter table public.flock_visits drop constraint if exists flock_visits_dead_parts_check,
  add constraint flock_visits_dead_parts_check check (dead_parts is null
    or (private.parts_valid(dead_parts) and private.parts_sum(dead_parts) = dead and culled = 0));
alter table public.flock_daily add column if not exists dead_parts integer[];
alter table public.flock_daily drop constraint if exists flock_daily_dead_parts_check,
  add constraint flock_daily_dead_parts_check check (dead_parts is null
    or (private.parts_valid(dead_parts) and private.parts_sum(dead_parts) = dead and culled = 0));

-- ─── ج. صفّ اليوم بأقسامه، وكاتبه الوحيد، وحدّ كلّ قسم ──────────────────────────────────────────────────────────────────
-- الجسم الأخير من 0036 ومعه dead_parts.
create or replace function private.flock_day_json(d public.flock_daily) returns jsonb
language sql stable set search_path = pg_catalog, pg_temp as $$
  select case when d.id is null then null else jsonb_build_object(
    'on_date', d.on_date, 'version', d.version, 'dead', d.dead, 'culled', d.culled,
    'feed_kg', d.feed_kg::text, 'water_l', d.water_l::text, 'temp_min', d.temp_min::text, 'temp_max', d.temp_max::text,
    'eggs_total', d.eggs_total, 'eggs_cracked', d.eggs_cracked, 'eggs_broken', d.eggs_broken, 'note', d.note, 'dead_parts', d.dead_parts,
    'dead_entered', d.dead_entered) end
$$;

-- الكاتب الوحيد لصفّ اليوم (الجسم الأخير من 0036) ومعه أقسام اليوم: مجموع أقسام زياراته الحيّة خانةً خانة للوجبة المقسومة، وsections_required لزيارة حيّة
-- بهلاكات بلا أقسام فيها.
create or replace function private.flock_day_rebuild(f public.flocks, p_on date) returns public.flock_daily
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s record;
  d public.flock_daily;
  v_note text;
  v_hall text;
  v_parts integer[];
begin
  select count(*) as n, sum(v.dead) as dead, sum(v.culled) as culled, sum(v.feed_kg) as feed_kg, sum(v.water_l) as water_l,
    min(v.temp_min) as temp_min, max(v.temp_max) as temp_max, sum(v.eggs_total) as eggs_total, sum(v.eggs_cracked) as eggs_cracked,
    sum(v.eggs_broken) as eggs_broken,
    string_agg(v.note, ' ' || chr(183) || ' ' order by v.recorded_at, v.created_at, v.id) filter (where v.note <> '') as note,
    count(*) filter (where v.dead + v.culled > 0 and v.dead_parts is null) as unsplit,
    private.parts_add(array_agg(v.dead_parts) filter (where v.dead_parts is not null)) as dead_parts,
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
  -- 0038: الوجبة المقسومة: هلاكات اليوم لكلّ قسم مجموع أقسام زياراته الحيّة خانةً خانة (زيارة بلا هلاكات بلا أقسام أصفار)، وزيارة حيّة فيها نافق
  -- أو مستبعد بلا أقسام ترفض: قاعدة واحدة لكلّ كاتب (تطبيق قبل 0038 لا يكتب هلاكات وجبة مقسومة). وغير المقسومة بلا أقسام.
  if f.section_counts is not null then
    if s.unsplit > 0 then
      raise exception 'sections_required' using hint = 'هذه القاعة مقسومة أقساماً: اكتب هلاكات كلّ قسم في خانته (حدّث التطبيق إن لم تظهر الخانات).';
    end if;
    v_parts := coalesce(s.dead_parts, array_fill(0, array[cardinality(f.section_counts)]));
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
      eggs_total, eggs_cracked, eggs_broken, note, version, dead_entered, dead_parts)
    values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_on, s.dead, s.culled, s.feed_kg, s.water_l, s.temp_min, s.temp_max,
      s.eggs_total, s.eggs_cracked, s.eggs_broken, v_note,
      (select sum(y.version)::int from public.flock_visits y where y.org_id = f.org_id and y.flock_id = f.id and y.on_date = p_on), s.dead_entered, v_parts)
    returning * into d;
  else
    update public.flock_daily x
    set dead = s.dead, culled = s.culled, feed_kg = s.feed_kg, water_l = s.water_l, temp_min = s.temp_min, temp_max = s.temp_max,
        eggs_total = s.eggs_total, eggs_cracked = s.eggs_cracked, eggs_broken = s.eggs_broken, note = v_note, dead_entered = s.dead_entered,
        dead_parts = v_parts,
        version = x.version + 1, updated_at = now(), updated_by = auth.uid()
    where x.org_id = d.org_id and x.id = d.id
    returning * into d;
  end if;
  return d;
end
$$;

-- هلاكات كلّ قسم في الأيّام كلّها لا تزيد على عدده (كـflock_live_check للوجبة كلّها): أوّل قسم يزيد يرفض ويسمّيه. كلّ كاتب يغيّر الهلاكات أو أعداد الأقسام
-- يناديه بعد كتابته (تحت قفل الوجبة)، فالرفض لا يُبقي شيئاً.
create or replace function private.flock_parts_check(f public.flocks) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v record;
begin
  if f.section_counts is null then
    return;
  end if;
  select g.i, f.section_counts[g.i] as placed, k.dead into v
  from generate_subscripts(f.section_counts, 1) as g(i)
  cross join lateral (select coalesce(sum(d.dead_parts[g.i]), 0) as dead from public.flock_daily d where d.org_id = f.org_id and d.flock_id = f.id) as k
  where k.dead > f.section_counts[g.i]
  order by g.i
  limit 1;
  if v.i is not null then
    raise exception 'live_negative' using hint = format('هلاكات ق%s (%s) أكثر من طيوره (%s). راجع الأرقام.', v.i,
      to_char(v.dead, 'FM999,999,999,990'), to_char(v.placed, 'FM999,999,999,990'));
  end if;
end
$$;

-- هلاكات الأقسام المرسلة مع مجموعها (set_flock_dead وsave_flock_day): للوجبة غير المقسومة بلا أقسام، وللمقسومة خانة لكلّ قسم بأعداد صحيحة غير سالبة
-- مجموعها الهلاكات. يرجع الأقسام كما تُكتب (فارغة لغير المقسومة).
create or replace function private.flock_parts_input(f public.flocks, p_dead integer, p_parts integer[]) returns integer[]
language plpgsql stable set search_path = pg_catalog, pg_temp as $$
begin
  if f.section_counts is null then
    if p_parts is not null then
      raise exception 'bad_value' using hint = 'هذه القاعة غير مقسومة أقساماً، فتُكتب هلاكاتها عدداً واحداً.';
    end if;
    return null;
  end if;
  if p_parts is null then
    raise exception 'sections_required' using hint = 'هذه القاعة مقسومة أقساماً: اكتب هلاكات كلّ قسم في خانته (حدّث التطبيق إن لم تظهر الخانات).';
  end if;
  if not private.parts_valid(p_parts) or cardinality(p_parts) <> cardinality(f.section_counts) then
    raise exception 'bad_value' using hint = 'هلاكات كلّ قسم أعداد صحيحة، خانة لكلّ قسم.';
  end if;
  if private.parts_sum(p_parts) is distinct from p_dead::bigint then
    raise exception 'bad_value' using hint = format('مجموع هلاكات الأقسام (%s) لا يساوي هلاكات اليوم (%s).',
      to_char(private.parts_sum(p_parts), 'FM999,999,999,990'), to_char(p_dead, 'FM999,999,999,990'));
  end if;
  return p_parts;
end
$$;

-- ─── د. الهلاكات بأقسامها: الجولة وورقة القاعة ─────────────────────────────────────────────────────────────────────────
-- الهلاكات مرّة واحدة في اليوم (الجسم الأخير من 0036) ومعها p_parts (افتراضه فارغ: نداء الواجهة المنشورة بأسماء معاملاته كما هو): للوجبة المقسومة خانة لكلّ
-- قسم مجموعها الهلاكات (وبلاها sections_required)، ولغيرها بلا أقسام؛ ويومٌ مسجَّل بالأقسام نفسها saved وبغيرها dead_recorded؛ والزيارة بأقسامها، ثمّ حدّ
-- كلّ قسم بعد إعادة بناء اليوم؛ والمركون {dead, parts}.
drop function if exists public.set_flock_dead(uuid, date, integer, uuid, boolean);
create or replace function public.set_flock_dead(p_flock uuid, p_on date, p_dead integer, p_client_ref uuid, p_queued boolean default false,
  p_parts integer[] default null)
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
  -- 0038: الأقسام في بصمة المرجع حين تُرسل وحدها، فعملية بلا أقسام (تطبيق قبل 0038) تُعاد بالمرجع نفسه ببصمتها القديمة.
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('flock', p_flock, 'on', p_on, 'dead', p_dead, 'queued', v_queued)
    || case when p_parts is not null then jsonb_build_object('parts', p_parts) else '{}'::jsonb end);
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
    values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_on, p_client_ref,
      jsonb_build_object('dead', p_dead) || case when p_parts is not null then jsonb_build_object('parts', p_parts) else '{}'::jsonb end, v_park, auth.uid(),
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
  -- 0038: هلاكات الأقسام: للوجبة المقسومة خانة لكلّ قسم مجموعها هلاكات اليوم، ولغيرها بلا أقسام.
  perform private.flock_parts_input(f, p_dead, p_parts);

  -- اليوم الذي سُجّلت هلاكاته (علامته المشتقّة؛ ويوم فيه نافق أو مستبعد بلا علامة، احتياطاً): لا يُضاف إليه شيء.
  select * into d from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_on;
  if d.id is not null and (d.dead_entered or d.dead + d.culled > 0) then
    -- 0038: والأقسام نفسها: يومٌ سُجّلت هلاكاته بأقسام أخرى (ولو بالمجموع نفسه) dead_recorded كما هو.
    if d.dead_parts is distinct from p_parts then
      return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'dead_recorded', 'day', private.flock_day_json(d)));
    end if;
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object(
      'status', case when d.dead + d.culled = p_dead then 'saved' else 'dead_recorded' end, 'day', private.flock_day_json(d)));
  end if;

  insert into public.flock_visits (org_id, flock_id, hall_id, site_id, division_id, dead_parts, on_date, recorded_at, dead, culled, source, version,
    dead_entry)
  values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_parts, p_on, now(), p_dead, 0, 'visit', 1, true);
  d := private.flock_day_rebuild(f, p_on);
  -- البيض لا يزيد على الحيّ أوّل اليوم (هذا اليوم وما بعده)، والحيّ لا يصير سالباً في أيّ يوم؛ والرفض لا يُبقي شيئاً.
  perform private.flock_eggs_live_check(f, p_on);
  perform private.flock_live_check(f);
  -- 0038: وهلاكات كلّ قسم في الأيّام كلّها لا تزيد على عدده.
  perform private.flock_parts_check(f);
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'day', private.flock_day_json(d)));
end
$$;

-- الجولة اليومية وورقة القاعة (الجسم الأخير من 0036) ومعها p_dead_parts (افتراضه فارغ): الهلاكات في النداء لوجبة مقسومة بأقسامها (والصفر بلا أقسام
-- أصفار)، وزيارة day_total بأقسام النداء أو بأقسام اليوم (تعديل الملاحظة أو البيض يُبقيها)، ثمّ حدّ كلّ قسم بعد إعادة بناء اليوم؛ والمركون بأقسامه.
drop function if exists public.save_flock_day(uuid, date, integer, integer, numeric, numeric, numeric, numeric, integer, integer, integer, text, integer, uuid, boolean);
create or replace function public.save_flock_day(p_flock uuid, p_date date, p_dead integer, p_culled integer, p_feed_kg numeric, p_water_l numeric,
  p_temp_min numeric, p_temp_max numeric, p_eggs_total integer, p_eggs_cracked integer, p_eggs_broken integer, p_note text,
  p_base_version integer, p_client_ref uuid, p_queued boolean default false, p_dead_parts integer[] default null)
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
  v_parts integer[];
begin
  v_payload := jsonb_build_object('dead', p_dead, 'culled', p_culled, 'feed_kg', p_feed_kg::text, 'water_l', p_water_l::text,
    'temp_min', p_temp_min::text, 'temp_max', p_temp_max::text, 'eggs_total', p_eggs_total, 'eggs_cracked', p_eggs_cracked,
    'eggs_broken', p_eggs_broken, 'note', p_note, 'base_version', p_base_version)
    -- 0038: أقسام الهلاكات في بصمة المرجع وفي المركون حين تُرسل وحدها (عملية بلا أقسام ببصمتها ومركونها القديمين).
    || case when p_dead_parts is not null then jsonb_build_object('dead_parts', p_dead_parts) else '{}'::jsonb end;
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

  -- 0038: هلاكات الأقسام. الوجبة المقسومة: الهلاكات في النداء بأقسامها (والصفر بلا أقسام أصفار)، والمستبعد القديم لا يُقسم؛ وبلا هلاكات في النداء
  -- تبقى أقسام اليوم كما هي (تعديل الملاحظة أو البيض لا يمسّها). وغير المقسومة بلا أقسام.
  if p_dead_parts is not null and p_dead is null then
    raise exception 'bad_value' using hint = 'هلاكات الأقسام تُرسل مع مجموع هلاكات اليوم.';
  end if;
  if f.section_counts is not null and coalesce(p_culled, 0) > 0 then
    raise exception 'bad_value' using hint = 'المستبعد لا يُقسم على الأقسام: في القاعة المقسومة تُكتب هلاكات كلّ قسم في خانته.';
  end if;
  if p_dead is null then
    v_parts := d.dead_parts;
  else
    v_parts := private.flock_parts_input(f, p_dead, case when p_dead = 0 and p_dead_parts is null and f.section_counts is not null
      then array_fill(0, array[cardinality(f.section_counts)]) else p_dead_parts end);
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
     is not distinct from (d.dead, d.culled, d.feed_kg, d.water_l, d.temp_min, d.temp_max, d.eggs_total, d.eggs_cracked, d.eggs_broken, d.note, d.dead_entered)
     and v_parts is not distinct from d.dead_parts then
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
  insert into public.flock_visits (org_id, flock_id, hall_id, site_id, division_id, dead_parts, on_date, recorded_at, dead, culled, feed_kg, water_l,
    temp_min, temp_max, eggs_total, eggs_cracked, eggs_broken, note, source, version, dead_entry)
  values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, v_parts, p_date, now(), n.dead, n.culled, n.feed_kg, n.water_l, n.temp_min, n.temp_max,
    n.eggs_total, n.eggs_cracked, n.eggs_broken, n.note, 'day_total', 1, v_mark);
  n := private.flock_day_rebuild(f, p_date);
  -- 0028: الحيّ لا يصير سالباً في أيّ يوم (المباع وفرق العدّ بتاريخهما)، والرفض لا يُبقي شيئاً.
  perform private.flock_live_check(f);
  -- 0038: وهلاكات كلّ قسم في الأيّام كلّها لا تزيد على عدده.
  perform private.flock_parts_check(f);
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'version', n.version));
end
$$;

-- الزيارة (الجسم الأخير من 0036) ومعها أقسامها (مراجعة 2026-11-27): تطبيق قبل 0038 يعدّل زيارة بأقسام (هلاكات سجّلتها الجولة الجديدة) كان
-- يُبقي أقسامها ويغيّر هلاكاتها فيرفض القيد الخام (23514 بلا تلميح)؛ الآن تُمحى أقسامها حين تتغيّر هلاكاتها، فتردّ flock_day_rebuild كلّ هلاكات
-- بلا أقسام في وجبة مقسومة بـsections_required، ويُحفظ التصفير. والوجبة غير المقسومة بلا أقسام كما كانت حرفاً.
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
  v_mark boolean;
  v_hall text;
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

  -- 0036: علامة الزيارة: يبقى فيها نافق أو مستبعد (الصفر لا يقفل الجولة). وزيارة جديدة، أو تعديل يرفع زيارة من صفر، بهلاكات ليوم علّمته زيارة حيّة
  -- أخرى (بعد قفل صفّ الوجبة، فكاتبان لليوم يترتّبان) لا تُضاف: من الطابور تُركن كلّها dead_recorded، وبنداء مباشر ترمي. وتعديل المعلَّمة نفسها مسموح.
  v_mark := not v_void and coalesce(p_dead, 0) + coalesce(p_culled, 0) > 0;
  if v_mark and (v.id is null or v.dead + v.culled = 0)
     and exists (select 1 from public.flock_visits x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_date and x.voided_at is null
       and x.dead_entry and x.id <> p_visit) then
    if v_queued then
      insert into public.flock_day_rejects (org_id, flock_id, hall_id, site_id, division_id, on_date, client_ref, payload, reason, created_by, visit_id)
      values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_date, p_client_ref, v_payload, 'dead_recorded', auth.uid(), p_visit)
      on conflict (org_id, visit_id) where visit_id is not null do update
        set client_ref = excluded.client_ref, payload = excluded.payload, reason = excluded.reason, created_at = now(),
            version = public.flock_day_rejects.version + 1, decision = null, decided_by = null, decided_at = null;
      return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'parked', 'reason', 'dead_recorded'));
    end if;
    select * into d from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_date;
    select h.name into v_hall from public.halls h where h.org_id = f.org_id and h.id = f.hall_id;
    raise exception 'dead_recorded' using hint = format('هلاكات يوم %s في «%s» مسجّلة (%s)، فلا تُضاف إليها هلاكات زيارة أخرى. لتصحيح العدد افتح صفحة القاعة ← ✎ تعديل الجدول.',
      to_char(p_date, 'DD/MM/YYYY'), v_hall, to_char(coalesce(d.dead + d.culled, 0), 'FM999,999,990'));
  end if;

  if v_void then
    update public.flock_visits x set voided_at = now(), voided_by = auth.uid(), version = x.version + 1, updated_at = now(), updated_by = auth.uid()
    where x.org_id = v.org_id and x.id = v.id
    returning * into v;
  elsif v.id is null then
    insert into public.flock_visits (id, org_id, flock_id, hall_id, site_id, division_id, on_date, recorded_at, dead, culled, feed_kg,
      eggs_total, eggs_cracked, eggs_broken, note, source, version, dead_entry)
    values (p_visit, f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_date, p_recorded_at, coalesce(p_dead, 0), coalesce(p_culled, 0), p_feed_kg,
      p_eggs_total, p_eggs_cracked, p_eggs_broken, v_note, 'visit', 1, v_mark)
    returning * into v;
  elsif (v.dead, v.culled, v.feed_kg, v.eggs_total, v.eggs_cracked, v.eggs_broken, v.note)
        is not distinct from (coalesce(p_dead, 0), coalesce(p_culled, 0), p_feed_kg, p_eggs_total, p_eggs_cracked, p_eggs_broken, v_note) then
    -- التعديل بالمحتوى نفسه: حُفظ بلا كتابة (ولا تكبر النسخة).
    select * into d from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_date;
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'visit', private.flock_visit_json(v), 'day', private.flock_day_json(d)));
  else
    update public.flock_visits x
    set dead = coalesce(p_dead, 0), culled = coalesce(p_culled, 0), feed_kg = p_feed_kg, eggs_total = p_eggs_total, eggs_cracked = p_eggs_cracked,
        eggs_broken = p_eggs_broken, note = v_note, dead_entry = v_mark, version = x.version + 1, updated_at = now(), updated_by = auth.uid(),
        -- 0038 (مراجعة 2026-11-27): أقسام الزيارة تبقى ما بقيت هلاكاتها؛ وتغييرها من تطبيق قبل 0038 (بلا أقسام) يمحوها، فهلاكات بلا أقسام في وجبة
        -- مقسومة تردّها flock_day_rebuild بـsections_required (قاعدة واحدة لكلّ كاتب)، والتصفير يُحفظ. وكانت تبقى فيرفض القيد الخام بلا تلميح.
        dead_parts = case when (x.dead, x.culled) is not distinct from (coalesce(p_dead, 0), coalesce(p_culled, 0)) then x.dead_parts end
    where x.org_id = v.org_id and x.id = v.id
    returning * into v;
  end if;

  -- مجموع اليوم من زياراته الحيّة (0036: وعلامته منها)، ثمّ الأيّام على المجموع: البيض لا يزيد على الحيّ أوّل اليوم (هذا اليوم وما بعده)، والحيّ لا
  -- يصير سالباً في أيّ يوم.
  d := private.flock_day_rebuild(f, p_date);
  perform private.flock_eggs_live_check(f, p_date);
  perform private.flock_live_check(f);
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'visit', private.flock_visit_json(v), 'day', private.flock_day_json(d)));
end
$$;

-- ─── هـ. التسكين وتعديل الوجبة وأقسام القاعة وإعادة الفتح ───────────────────────────────────────────────────────────────
-- التسكين (الجسم الأخير من 0029) ومعه p_section_counts (افتراضه فارغ): لقاعة مقسومة عدد كلّ قسم، بالتساوي افتراضاً والباقي للأقسام الأولى.
drop function if exists public.open_flock(uuid, date, integer, integer, text, uuid);
create or replace function public.open_flock(p_hall uuid, p_placed_on date, p_placed_count integer, p_age_days integer, p_breed text, p_client_ref uuid,
  p_section_counts integer[] default null)
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
  v_counts integer[];
begin
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('hall', p_hall, 'placed_on', p_placed_on, 'count', p_placed_count,
    'age', p_age_days, 'breed', p_breed)
    -- 0038: أعداد الأقسام في بصمة المرجع حين تُرسل وحدها (عملية قبل 0038 ببصمتها).
    || case when p_section_counts is not null then jsonb_build_object('section_counts', p_section_counts) else '{}'::jsonb end);
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
  -- 0038: أقسام القاعة: لقاعة بقسم واحد بلا أعداد، وللمقسومة عدد كلّ قسم (المرسل، وإلّا التقسيم بالتساوي والباقي للأقسام الأولى) ومجموعها العدد
  -- الداخل.
  if h.sections = 1 then
    if p_section_counts is not null then
      raise exception 'bad_value' using hint = format('القاعة «%s» غير مقسومة أقساماً، فيُكتب عدد الطيور الداخلة عدداً واحداً.', h.name);
    end if;
  elsif p_section_counts is null then
    v_counts := private.parts_even(p_placed_count, h.sections);
  else
    if not private.parts_valid(p_section_counts) or cardinality(p_section_counts) <> h.sections then
      raise exception 'bad_value' using hint = format('اكتب عدد طيور كلّ قسم من أقسام القاعة «%s» (%s) عدداً صحيحاً من صفر فأكثر، خانة لكلّ قسم.',
        h.name, h.sections);
    end if;
    if private.parts_sum(p_section_counts) is distinct from p_placed_count::bigint then
      raise exception 'bad_value' using hint = format('مجموع أعداد الأقسام (%s) لا يساوي العدد الداخل (%s).',
        to_char(private.parts_sum(p_section_counts), 'FM999,999,999,990'), to_char(p_placed_count, 'FM999,999,999,990'));
    end if;
    v_counts := p_section_counts;
  end if;
  select d.kind into v_kind from public.divisions d where d.org_id = h.org_id and d.id = h.division_id;
  insert into public.flocks (org_id, hall_id, site_id, division_id, kind, breed, opened_on, placed_on, placed_count, age_days_at_placement, chick_source, status,
    section_counts)
  values (h.org_id, h.id, h.site_id, h.division_id, v_kind, v_breed, p_placed_on, p_placed_on, p_placed_count, coalesce(p_age_days, 0), 'opening', 'active',
    v_counts)
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
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('flock_id', v_id, 'version', 1, 'carried_in', v_carried, 'section_counts', v_counts));
end
$$;

-- تعديل الوجبة (الجسم الأخير من 0037) ومعه p_section_counts (افتراضه فارغ، والواجهة ترسله حين تتغيّر الأعداد): تغيير العدد الداخل لوجبة مقسومة يطلب
-- عدد كلّ قسم، والأعداد خانة لكلّ قسم مجموعها العدد الداخل، وكلّ قسم لا يقلّ عن هلاكاته؛ وكلّ قاعدة أخرى كما هي.
drop function if exists public.edit_flock(uuid, int, date, integer, integer, text, uuid);
create or replace function public.edit_flock(p_flock uuid, p_expected_version int, p_placed_on date, p_placed_count integer, p_age_days integer,
  p_breed text, p_client_ref uuid, p_section_counts integer[] default null) returns jsonb
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
  v_counts integer[];
begin
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('flock', p_flock, 'version', p_expected_version, 'placed_on', p_placed_on,
    'count', p_placed_count, 'age', p_age_days, 'breed', p_breed)
    -- 0038: أعداد الأقسام في بصمة المرجع حين تُرسل وحدها (عملية قبل 0038 ببصمتها).
    || case when p_section_counts is not null then jsonb_build_object('section_counts', p_section_counts) else '{}'::jsonb end);
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
  -- 0038: أعداد الأقسام. الوجبة غير المقسومة بلا أعداد؛ والمقسومة: تغيير العدد الداخل يطلب عدد كلّ قسم، والأعداد المرسلة خانة لكلّ قسم ومجموعها
  -- العدد الداخل (وكلّ قسم لا يقلّ عن هلاكاته: يُفحص بعد الكتابة بـflock_parts_check)؛ وبلا أعداد ولا تغيير للعدد تبقى أعداده.
  if f.section_counts is null then
    if p_section_counts is not null then
      raise exception 'bad_value' using hint = format('قاعة فوج «%s» غير مقسومة أقساماً، فيُكتب عدد طيوره عدداً واحداً.', v_hall);
    end if;
  elsif p_section_counts is null then
    if p_placed_count is distinct from f.placed_count then
      raise exception 'section_counts_required' using hint = 'اكتب عدد كلّ قسم بعد تغيير العدد الداخل.';
    end if;
    v_counts := f.section_counts;
  else
    if not private.parts_valid(p_section_counts) or cardinality(p_section_counts) <> cardinality(f.section_counts) then
      raise exception 'bad_value' using hint = format('أعداد أقسام فوج «%s» أعداد صحيحة من صفر فأكثر، خانة لكلّ قسم من أقسامه (%s).', v_hall,
        cardinality(f.section_counts));
    end if;
    if private.parts_sum(p_section_counts) is distinct from p_placed_count::bigint then
      raise exception 'bad_value' using hint = format('مجموع أعداد الأقسام (%s) لا يساوي العدد الداخل (%s).',
        to_char(private.parts_sum(p_section_counts), 'FM999,999,999,990'), to_char(p_placed_count, 'FM999,999,999,990'));
    end if;
    v_counts := p_section_counts;
  end if;
  -- التاريخ والعدد والعمر تغيّر أيّام الفوج ومؤشّراته؛ والسلالة اسم وحدها.
  v_core := p_placed_on is distinct from f.placed_on or p_placed_count is distinct from f.placed_count or coalesce(p_age_days, 0) is distinct from f.age_days_at_placement;
  v_changed := v_core or v_breed is distinct from f.breed or v_counts is distinct from f.section_counts;
  -- 0038 (مراجعة 2026-11-27): وأعداد الأقسام وحدها تُقفل بالفترة كالعدد (كانت تُحفظ داخل الفترة المقفلة).
  if v_core or v_counts is distinct from f.section_counts then
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
      age_days_at_placement = coalesce(p_age_days, 0), breed = v_breed, version = x.version + 1, section_counts = v_counts
    where x.org_id = f.org_id and x.id = f.id
    returning * into f;
    -- 0029: الحيّ بالمباع وفرق العدّ لا يصير سالباً في أيّ يوم بالعدد والتاريخ الجديدين (والرفض لا يُبقي شيئاً).
    perform private.flock_live_check(f);
    -- 0038: وكلّ قسم لا تزيد هلاكاته على عدده الجديد (live_negative يسمّي القسم).
    perform private.flock_parts_check(f);
  end if;
  v_result := jsonb_build_object('flock_id', f.id, 'version', f.version, 'placed_on', f.placed_on, 'placed_count', f.placed_count,
    'age_days_at_placement', f.age_days_at_placement, 'breed', f.breed, 'changed', v_changed, 'section_counts', f.section_counts);
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;

-- أقسام القاعة (flock.manage، ونطاق حقل القاعة كسياستها؛ بمرجع client_ref وبشرط نسخة القاعة). الأقفال: القاعة for no key update ← وجبتها القائمة للتحديث
-- (القاعة قبل الوجبة كـopen_flock وreopen_flock وclose_flock، فتترتّب معها)، وكلّ قراءة بعد قفلها. والقاعة no key update لا update: كاتب الهلاكات يمسك صفّ
-- الوجبة ثمّ يُدخل زيارة أو صفّ يوم يأخذ تحقّق مفتاحه الأجنبيّ key share على القاعة، وfor update يمنعه فينتظر كلّ منهما الآخر (40P01). من 1 إلى 4 (bad_value)؛ ونسخة غير التي رآها الجهاز stale_hall بما في الخادم؛ والقيمة نفسها
-- saved بلا كتابة؛ ووجبة قائمة سُجّلت هلاكاتها (يوم بنافق أو مستبعد) sections_after_deaths: لو تغيّرت بعدها لبقيت أيّام بلا قسمة. وغير ذلك: القاعة بأقسامها
-- (النسخة +1 بمشغّلها halls_master) والوجبة القائمة مقسومة بالتساوي (فارغة لقسم واحد) بنسخة أكبر، وأقسام زياراتها الحيّة أصفار بالطول الجديد بنسخة أكبر،
-- وأيّامها تُعاد بناءً بـflock_day_rebuild (الكاتب الوحيد لصفّ اليوم).
create or replace function public.set_hall_sections(p_hall uuid, p_sections integer, p_expected_version integer, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'set_hall_sections';
  v_cached jsonb;
  h public.halls;
  f public.flocks;
  v_day date;
  v_lock date;
begin
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('hall', p_hall, 'sections', p_sections, 'version', p_expected_version));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.require('flock.manage');
  set local lock_timeout = '5s';
  perform private.period_guard();
  select * into h from public.halls x where x.org_id = public.auth_org() and x.id = p_hall for no key update;
  if h.id is null then
    raise exception 'hall_not_found' using hint = 'هذه القاعة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(h.site_id) then
    raise exception 'out_of_scope' using hint = 'هذه القاعة خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  if p_sections is null or p_sections not between 1 and 4 then
    raise exception 'bad_value' using hint = 'أقسام القاعة من 1 (غير مقسومة) إلى 4.';
  end if;
  select * into f from public.flocks x where x.org_id = h.org_id and x.hall_id = h.id and x.status in ('preparing', 'active') for update;
  if p_expected_version is distinct from h.version then
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'stale_hall',
      'hall', jsonb_build_object('id', h.id, 'version', h.version, 'sections', h.sections)));
  end if;
  if p_sections = h.sections then
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved',
      'hall', jsonb_build_object('id', h.id, 'version', h.version, 'sections', h.sections), 'section_counts', f.section_counts));
  end if;
  if f.id is not null and exists (select 1 from public.flock_daily d where d.org_id = f.org_id and d.flock_id = f.id and d.dead + d.culled > 0) then
    raise exception 'sections_after_deaths' using hint = format('في القاعة «%s» وجبة سُجّلت هلاكاتها، فلا تتغيّر أقسامها حتى تُغلق.', h.name);
  end if;
  -- مراجعة 2026-11-27: أعداد أقسام الوجبة القائمة وأيّامها تُقفل بالفترة كعددها (edit_flock): وجبة تسكينها داخل الفترة المقفلة لا تتغيّر أقسامها
  -- (كانت تُعاد كتابة أيّامها في الفترة، وsave_flock_day يرفض اليوم نفسه).
  if f.id is not null then
    select l.locked_through into v_lock from public.period_locks l where l.org_id = h.org_id;
    if v_lock is not null and f.placed_on <= v_lock then
      raise exception 'period_locked' using hint = format('الحسابات مقفلة حتى %s، وتسكين الوجبة في «%s» يوم %s داخلها، فلا تتغيّر أقسامها. إن كان التغيير صحيحاً فاطلب من مالك المنشأة فتح الفترة.',
        to_char(v_lock, 'DD/MM/YYYY'), h.name, to_char(f.placed_on, 'DD/MM/YYYY'));
    end if;
  end if;
  update public.halls x set sections = p_sections where x.org_id = h.org_id and x.id = h.id
  returning * into h;
  if f.id is not null then
    update public.flocks x set section_counts = private.parts_even(x.placed_count, p_sections), version = x.version + 1
    where x.org_id = f.org_id and x.id = f.id
    returning * into f;
    update public.flock_visits v set dead_parts = case when p_sections > 1 and v.dead_parts is not null then array_fill(0, array[p_sections]) end,
        version = v.version + 1, updated_at = now(), updated_by = auth.uid()
    where v.org_id = f.org_id and v.flock_id = f.id and v.voided_at is null;
    for v_day in select distinct v.on_date from public.flock_visits v where v.org_id = f.org_id and v.flock_id = f.id and v.voided_at is null order by 1 loop
      perform private.flock_day_rebuild(f, v_day);
    end loop;
  end if;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved',
    'hall', jsonb_build_object('id', h.id, 'version', h.version, 'sections', h.sections), 'section_counts', f.section_counts));
end
$$;

-- «أعد فتح الدورة» (الجسم الأخير من 0029) ومعها sections_changed: أقسام الوجبة ثابتة بأعدادها، فإن صارت أقسام قاعتها غيرها بعد إغلاقها لا يُعاد فتحها.
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
  v_counts integer[];
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
  -- مراجعة 2026-11-27: القاعة for no key update لا for update (من 0029): كاتبٌ من الطابور يقفل صفّ الوجبة أوّلاً ثمّ يركن عمليته، فيأخذ إدراجه في
  -- flock_day_rejects (والمفتاح الأجنبيّ إلى القاعة) key share عليها، وfor update هنا ثمّ انتظار صفّ الوجبة كان يقفّل الاثنين (40P01). وno key update
  -- يبقى يمنع التسكين (open_flock) وتغيير الأقسام (set_hall_sections) والإغلاق (close_flock) وإرجاع المنقول في القاعة نفسها حتى ينتهي.
  select * into h from public.halls y where y.org_id = v_org and y.id = x.hall_id for no key update;
  -- 0038: أقسام الوجبة مع قفلها (تُقارن بأقسام القاعة أدناه).
  select y.section_counts into v_counts from public.flocks y where y.org_id = v_org and y.id = x.flock_id for update;
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
  -- 0038: أقسام الوجبة ثابتة بأعدادها، فإن صارت أقسام القاعة غيرها بعد إغلاقها لا يُعاد فتحها حتى تعود أقسام القاعة كما كانت (وتعود بحرّية ما دام
  -- لا وجبة قائمة فيها).
  if coalesce(cardinality(v_counts), 1) <> h.sections then
    raise exception 'sections_changed' using hint = format('أقسام القاعة «%s» صارت %s بعد إغلاق هذه الوجبة وكانت %s، فلا يُعاد فتحها. أعِد أقسام القاعة إلى %s ثمّ أعد فتحها.',
      h.name, h.sections, coalesce(cardinality(v_counts), 1), coalesce(cardinality(v_counts), 1));
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

-- لماذا لا يُعاد فتح إغلاق قائم الآن (الجسم الأخير من 0029، مرآة فحوص reopen_flock بترتيبها) ومعها 'sections_changed' بعد 'hall_reused': أقسام القاعة غير
-- أقسام الوجبة؛ وnull = تُعاد.
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
    -- 0038: أقسام القاعة غير أقسام الوجبة (شرط reopen_flock الجديد sections_changed، بترتيبه بعد hall_reused).
    when exists (select 1 from public.flocks y join public.halls h on h.org_id = y.org_id and h.id = y.hall_id
        where y.org_id = x.org_id and y.id = x.flock_id and coalesce(cardinality(y.section_counts), 1) <> h.sections) then 'sections_changed'
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

-- ─── و. القرّاء (مفاتيح جديدة فقط، وكلّ مفتاح قائم كما هو) ────────────────────────────────────────────────────────────────
-- ملخّص الوجبة (الجسم الأخير من 0036) ومعه section_counts وsection_dead (هلاكات كلّ قسم في الأيّام كلّها): الجولة تعرض الباقي في كلّ قسم وتفحصه.
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
  v_section_dead integer[];
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
  -- 0038: هلاكات كلّ قسم في الوجبة كلّها (أيّامها كلّها، كـdead_total) للوجبة المقسومة: الجولة تعرض الباقي في كلّ قسم وتفحصه.
  if f.section_counts is not null then
    select coalesce(private.parts_add(array_agg(x.dead_parts) filter (where x.dead_parts is not null)), array_fill(0, array[cardinality(f.section_counts)]))
    into v_section_dead
    from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id;
  end if;
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
    'last_feed_item_id', v_last,
    'section_counts', f.section_counts, 'section_dead', v_section_dead);
end
$$;

-- الحقول بقاعاتها ووجباتها (الجسم الأخير من 0036) ومعه أقسام كلّ قاعة.
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
            'id', h.id, 'name', h.name, 'capacity', h.capacity, 'version', h.version, 'sections', h.sections,
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

-- الورقة (الجسم الأخير من 0037) ومعها dead_parts لكلّ يوم، وtotals.dead_parts (مجموع الأيّام خانةً خانة للوجبة المقسومة)، وsections في رأس الجواب: لكلّ قسم
-- رقمه وعدده وهلاكاته ونسبتها والباقي بعدها. وبخطّة عامّة واحدة لكلّ جلسة (plan_cache_mode = force_generic_plan على الدالّة): استعلامها الكبير كان يُخطَّط من
-- جديد في كلّ نداء، لأنّ تقدير الخطّة العامّة أغلى بطول أيّام مجهول، فكان التخطيط نصف وقت الورقة؛ والخطّة لا تغيّر الجواب (كلّ تجميع فيه بترتيبه الصريح،
-- و696 ورقة في نهاية الحزمة هي نفسها حرفاً بالخطّتين)، وثابتا الورقة يقرآنها بنحو نصف الوقت.
create or replace function public.hall_sheet(p_flock uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp set plan_cache_mode = force_generic_plan as $$
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
      r.dead_parts,
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
      'sold_birds', z.sold, 'sold_net_kg', case when z.sold_kg is not null then round(z.sold_kg, 3)::text end, 'live_end', z.live_end,
      'dead_parts', z.dead_parts) order by z.d),
    jsonb_build_object('dead', coalesce(sum(z.dead + z.culled), 0)::bigint, 'gas', coalesce(sum(z.cylinders), 0)::bigint,
      'kerosene', coalesce(sum(z.liters), 0)::bigint,
      'feed_kg', round(coalesce(sum(z.kg), 0), 3)::text, 'feed_back_kg', round(coalesce(sum(z.back_kg), 0), 3)::text,
      'sold_birds', sum(z.sold)::bigint, 'sold_net_kg', round(coalesce(sum(z.sold_kg), 0), 3)::text,
      'eggs_total', case when f.kind = 'layer' then coalesce(sum(z.eggs_total), 0)::bigint end,
      'dead_parts', case when f.section_counts is not null then coalesce(private.parts_add(array_agg(z.dead_parts) filter (where z.dead_parts is not null)),
        array_fill(0, array[cardinality(f.section_counts)])) end),
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
    -- 0038: أقسام الوجبة المقسومة بترتيبها: عدد كلّ قسم وهلاكاته في الأيّام كلّها ونسبتها إلى عدده (كنسبة الخلاصة، والقسم بلا طيور صفر) والباقي بعد
    -- الهلاكات (المبيع لا يُقسم)؛ وفارغة لغير المقسومة.
    'sections', case when f.section_counts is not null then (select jsonb_agg(jsonb_build_object('no', s.i, 'placed', f.section_counts[s.i],
        'dead', (v_totals -> 'dead_parts' ->> (s.i - 1))::bigint,
        'mortality_pct', coalesce(private.flock_pct((v_totals -> 'dead_parts' ->> (s.i - 1))::numeric, f.section_counts[s.i]), '0.00'),
        'remaining', f.section_counts[s.i] - (v_totals -> 'dead_parts' ->> (s.i - 1))::bigint) order by s.i)
      from generate_subscripts(f.section_counts, 1) as s(i)) end,
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

-- ─── ز. الثابت (مفتاح الخادم) ───────────────────────────────────────────────────────────────────────────────────────
-- الجداول مباشرة (مجموع اليوم محسوب هنا مستقلّاً عن flock_day_rebuild)، ثمّ الورقة لكلّ وجبة مقسومة مسكَّنة بهويّة مالك منشأتها (كـverify_kerosene)؛
-- والوجبة غير المقسومة جوابها معروف بتعريفه (بلا أقسام، ويمسك unsplit_parts أيّ قسم فيها)، فلا تُقرأ ورقتها.
create or replace function public.verify_hall_sections() returns table (check_name text, violations bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_sheets bigint := 0;
  v_org record;
  v_user uuid;
  v_flock record;
  v_s jsonb;
begin
  return query
  select 'hall_sections_range'::text, count(*) from public.halls h where h.sections not between 1 and 4
  union all
  -- الوجبة المقسومة: أعداد صالحة مجموعها العدد الداخل؛ والقائمة المسكَّنة بأقسام قاعتها (وغير المقسومة في قاعة مقسومة خرق).
  select 'flock_counts_shape', count(*) from public.flocks f
  join public.halls h on h.org_id = f.org_id and h.id = f.hall_id
  where (f.section_counts is not null and (not private.parts_valid(f.section_counts) or f.placed_count is null
      or private.parts_sum(f.section_counts) is distinct from f.placed_count::bigint))
    or (f.status = 'active' and coalesce(cardinality(f.section_counts), 1) <> h.sections)
    or (f.status = 'preparing' and f.section_counts is not null and cardinality(f.section_counts) <> h.sections)
  union all
  -- الزيارات الحيّة للوجبة المقسومة: الأقسام صالحة بطول أقسامها ومجموعها النافق والمستبعد صفر؛ ولا هلاكات بلا أقسام.
  select 'visit_parts', count(*) from public.flock_visits v
  join public.flocks f on f.org_id = v.org_id and f.id = v.flock_id
  where v.voided_at is null and f.section_counts is not null
    and case when v.dead_parts is null then v.dead + v.culled > 0
      else not private.parts_valid(v.dead_parts) or cardinality(v.dead_parts) <> cardinality(f.section_counts)
        or private.parts_sum(v.dead_parts) <> v.dead or v.culled <> 0 end
  union all
  -- صفّ اليوم للوجبة المقسومة: أقسامه صالحة بطول أقسامها ومجموعها النافق والمستبعد صفر، وكلّ خانة = مجموع خانات زياراته الحيّة (الفارغة أصفار).
  select 'day_parts', count(*) from public.flock_daily d
  join public.flocks f on f.org_id = d.org_id and f.id = d.flock_id
  where f.section_counts is not null and (d.dead_parts is null or not private.parts_valid(d.dead_parts)
    or cardinality(d.dead_parts) <> cardinality(f.section_counts) or private.parts_sum(d.dead_parts) <> d.dead or d.culled <> 0
    or exists (
      select 1 from (
        select u.i, sum(u.x) as s from public.flock_visits v cross join unnest(v.dead_parts) with ordinality as u(x, i)
        where v.org_id = d.org_id and v.flock_id = d.flock_id and v.on_date = d.on_date and v.voided_at is null
        group by u.i
      ) as k
      full join unnest(d.dead_parts) with ordinality as e(x, i) on e.i = k.i
      where e.i is null or coalesce(k.s, 0) <> e.x))
  union all
  -- لا أقسام لزيارة حيّة ولا لصفّ يوم في وجبة غير مقسومة.
  select 'unsplit_parts',
    (select count(*) from public.flock_visits v join public.flocks f on f.org_id = v.org_id and f.id = v.flock_id
      where f.section_counts is null and v.voided_at is null and v.dead_parts is not null)
    + (select count(*) from public.flock_daily d join public.flocks f on f.org_id = d.org_id and f.id = d.flock_id
      where f.section_counts is null and d.dead_parts is not null)
  union all
  -- هلاكات كلّ قسم في الأيّام كلّها لا تزيد على عدده.
  select 'section_live', count(*) from public.flocks f
  cross join generate_subscripts(f.section_counts, 1) as g(i)
  where f.section_counts is not null
    and f.section_counts[g.i] < coalesce((select sum(d.dead_parts[g.i]) from public.flock_daily d where d.org_id = f.org_id and d.flock_id = f.id), 0);

  -- الورقة لكلّ وجبة مقسومة مسكَّنة بهويّة مالك منشأتها: أقسام اليوم مجموعها هلاكاته، وtotals.dead_parts مجموع الأيّام خانةً خانة ومجموعها totals.dead، وكلّ
  -- قسم برقمه وعدده وهلاكاته من الأيّام ونسبتها وباقيه؛ وورقة رمت خرق.
  for v_org in select distinct x.org_id from public.flocks x where x.placed_on is not null and x.section_counts is not null order by 1 loop
    select m.user_id into v_user from public.members m
    where m.org_id = v_org.org_id and m.role = 'owner' and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
    order by m.created_at, m.id limit 1;
    continue when v_user is null;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    for v_flock in select x.id, x.section_counts from public.flocks x
        where x.org_id = v_org.org_id and x.placed_on is not null and x.section_counts is not null order by x.id loop
      begin
        v_s := public.hall_sheet(v_flock.id);
        if not coalesce(jsonb_typeof(v_s -> 'sections') = 'array' and jsonb_array_length(v_s -> 'sections') = cardinality(v_flock.section_counts)
            and jsonb_typeof(v_s -> 'totals' -> 'dead_parts') = 'array'
            and jsonb_array_length(v_s -> 'totals' -> 'dead_parts') = cardinality(v_flock.section_counts), false)
          or exists (select 1 from jsonb_array_elements(v_s -> 'days') as d(j)
            where jsonb_typeof(d.j -> 'dead_parts') = 'array'
              and (d.j ->> 'dead')::bigint is distinct from (select sum(e::bigint) from jsonb_array_elements_text(d.j -> 'dead_parts') as e))
          or (v_s -> 'totals' ->> 'dead')::bigint is distinct from (select sum(e::bigint) from jsonb_array_elements_text(v_s -> 'totals' -> 'dead_parts') as e)
          or exists (select 1 from generate_subscripts(v_flock.section_counts, 1) as g(i)
            cross join lateral (select coalesce(sum((d.j -> 'dead_parts' ->> (g.i - 1))::bigint), 0) as dead
              from jsonb_array_elements(v_s -> 'days') as d(j)) as k
            cross join lateral (select v_s -> 'sections' -> (g.i - 1) as e) as c
            where (v_s -> 'totals' -> 'dead_parts' ->> (g.i - 1))::bigint is distinct from k.dead
              or (c.e ->> 'no')::int is distinct from g.i
              or (c.e ->> 'placed')::bigint is distinct from v_flock.section_counts[g.i]::bigint
              or (c.e ->> 'dead')::bigint is distinct from k.dead
              or (c.e ->> 'remaining')::bigint is distinct from v_flock.section_counts[g.i] - k.dead
              or (c.e ->> 'mortality_pct') is distinct from coalesce(private.flock_pct(k.dead, v_flock.section_counts[g.i]), '0.00')) then
          v_sheets := v_sheets + 1;
        end if;
      exception when others then
        v_sheets := v_sheets + 1;
      end;
    end loop;
  end loop;
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  return query select 'sheet_sections'::text, v_sheets;
end
$$;

-- ─── ز٢. ثابتا الورقة والكاز (مفتاح الخادم): الورقة تُقرأ مرّة ──────────────────────────────────────────────────────────────
-- verify_kerosene (0037) يقرأ ورقة كلّ وجبة مسكَّنة مرّة ثانية بعد verify_hall_sheet (0035) ليفحص مفاتيح الكاز فيها، وبعد ملفّات الحزمة كلّها (نحو 700 وجبة،
-- منها خمسمئة «دورة حدّ» مغلقة في reports.test) صار كلاهما قرب مهلة الطلب (8 ثوانٍ). فمفاتيح الكاز تُفحص في قراءة verify_hall_sheet لكلّ ورقة (ضمن
-- sheet_totals، بلا قراءة ثانية)، وverify_kerosene يقرأ ورقة الوجبة بكازها وحدها (sheet_kerosene_totals كما هو لها)؛ وطفرة في الحزمة تثبت أنّ
-- verify_hall_sheet يمسك ما يتخطّاه verify_kerosene (درس 2026-11-21).
create or replace function public.verify_hall_sheet() returns table (check_name text, violations bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_totals bigint := 0;
  v_days bigint := 0;
  v_fcr bigint := 0;
  v_org record;
  v_user uuid;
  v_flock record;
  v_s jsonb;
begin
  return query
  select 'for_day_range'::text, count(*) from public.flock_issues x
  join public.flocks f on f.org_id = x.org_id and f.id = x.flock_id
  where x.for_day is not null and (f.placed_on is null or x.for_day < f.placed_on or x.for_day > x.issued_on)
  union all
  select 'gas_days', count(*) from public.flock_day_gas g
  join public.flocks f on f.org_id = g.org_id and f.id = g.flock_id
  where g.cylinders is not null and (f.placed_on is null or g.on_date < f.placed_on or (f.closed_on is not null and g.on_date > f.closed_on))
  union all
  select 'gas_versions', count(*) from public.flock_day_gas g where g.version < 1
  union all
  select 'gas_hall', count(*) from public.flock_day_gas g
  join public.flocks f on f.org_id = g.org_id and f.id = g.flock_id
  where (g.hall_id, g.site_id, g.division_id) is distinct from (f.hall_id, f.site_id, f.division_id);

  for v_org in select distinct x.org_id from public.flocks x where x.placed_on is not null order by 1 loop
    select m.user_id into v_user from public.members m
    where m.org_id = v_org.org_id and m.role = 'owner' and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
    order by m.created_at, m.id limit 1;
    continue when v_user is null;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    for v_flock in select x.id, x.kind, x.status from public.flocks x where x.org_id = v_org.org_id and x.placed_on is not null order by x.id loop
      v_s := null;
      begin
        v_s := public.hall_sheet(v_flock.id);
        v_totals := v_totals + (
          select count(*) from (
            select coalesce(sum((d.j ->> 'dead')::bigint), 0) as dead, coalesce(sum((d.j ->> 'gas')::bigint), 0) as gas,
              coalesce(sum((d.j ->> 'feed_kg')::numeric), 0) as feed_kg, coalesce(sum((d.j ->> 'feed_back_kg')::numeric), 0) as back_kg,
              coalesce(sum((d.j ->> 'sold_birds')::bigint), 0) as sold, coalesce(sum((d.j ->> 'sold_net_kg')::numeric), 0) as sold_kg,
              coalesce(sum((d.j ->> 'eggs_total')::bigint), 0) as eggs,
              -- 0038: مفاتيح الكاز في الورقة نفسها المقروءة هنا (لا قراءة ثانية لها في verify_kerosene إلّا لوجبة بكازها).
              coalesce(sum((d.j ->> 'kerosene')::bigint), 0) as kerosene
            from jsonb_array_elements(v_s -> 'days') as d(j)
          ) as s
          where (v_s -> 'totals' ->> 'dead')::bigint <> s.dead or (v_s -> 'totals' ->> 'gas')::bigint <> s.gas
            or (v_s -> 'totals' ->> 'feed_kg')::numeric <> s.feed_kg or (v_s -> 'totals' ->> 'feed_back_kg')::numeric <> s.back_kg
            or (v_s -> 'summary' ->> 'feed_net_kg')::numeric <> s.feed_kg - s.back_kg
            or (v_s -> 'totals' ->> 'sold_birds')::bigint <> s.sold
            or (v_s -> 'totals' ->> 'sold_net_kg')::numeric <> s.sold_kg
            or (v_s -> 'totals' ->> 'eggs_total')::bigint is distinct from (case when v_flock.kind = 'layer' then s.eggs end)
            or (v_s -> 'totals' ->> 'kerosene')::bigint is distinct from s.kerosene
            or (v_s -> 'summary' ->> 'kerosene')::bigint is distinct from (v_s -> 'totals' ->> 'kerosene')::bigint);
        v_days := v_days + (
          select count(*) from (
            select (d.j ->> 'on')::date as on_date, (d.j ->> 'feed_kg')::numeric as kg, (d.j ->> 'feed_back_kg')::numeric as back
            from jsonb_array_elements(v_s -> 'days') as d(j)
          ) as s
          full join (
            select u.on_date, sum(u.kg) filter (where u.side = 'in') as kg, sum(u.kg) filter (where u.side = 'back') as back
            from (
              select o.side, o.on_date, case
                  when o.base_unit = 'kg' then round(o.qty_base, 3)
                  when o.base_unit = 'L' and o.density_kg_per_l > 0 then round(o.qty_base * o.density_kg_per_l, 3)
                  when o.base_unit = 'pc' and o.piece_mass_kg > 0 then round(o.qty_base * o.piece_mass_kg, 3) end as kg
              from (
                select 'in' as side, coalesce(x.for_day, x.issued_on) as on_date, l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg
                from public.flock_issues x join public.flock_issue_lines l on l.org_id = x.org_id and l.issue_id = x.id
                where x.org_id = v_org.org_id and x.flock_id = v_flock.id and x.status = 'posted' and l.cost_kind = 'feed'
                union all
                select 'in', l.applied_on, l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg
                from public.flock_close_lines l
                where l.org_id = v_org.org_id and l.to_flock_id = v_flock.id and l.carry_status = 'applied' and l.cost_kind = 'feed'
                union all
                select 'back', c.closed_on, l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg
                from public.flock_closes c join public.flock_close_lines l on l.org_id = c.org_id and l.close_id = c.id
                where c.org_id = v_org.org_id and c.flock_id = v_flock.id and c.status = 'closed' and l.cost_kind = 'feed' and l.action in ('return', 'carry')
              ) as o
            ) as u
            group by u.on_date
          ) as t on t.on_date = s.on_date
          where s.on_date is null or (t.on_date is null and (s.kg is not null or s.back is not null))
            or (t.on_date is not null and (s.kg is distinct from t.kg or s.back is distinct from t.back)));
      exception when others then
        v_totals := v_totals + 1;
      end;
      -- الوجبة المغلقة: معامل التحويل في الورقة = fcr_final في تقرير الدورة (الصافي نفسه وصافي المباع نفسه). الورقة نفسها المقروءة أعلاه (v_s)
      -- لا قراءة ثانية لها، وورقة رمت = خرق كما كانت. ووجبة مغلقة بلا مبيع (لا يوم في flock_count_days بصافٍ موجب، وهو مصدر v_sold_kg في
      -- التقرير وشرط fcr_final فيه) معاملها في التقرير null بتعريفه، فتُقارن الورقة بـnull بلا قراءة التقرير: مئات الدورات المغلقة بلا بيع
      -- كانت تتجاوز مهلة الطلب (8 ثوانٍ).
      if v_flock.status = 'closed' then
        begin
          if v_s is null then
            v_fcr := v_fcr + 1;
          elsif not exists (select 1 from private.flock_count_days(v_flock.id) as k where k.sold_kg > 0) then
            v_fcr := v_fcr + (case when (v_s -> 'summary' ->> 'fcr') is not null then 1 else 0 end);
          else
            v_fcr := v_fcr + (case when (v_s -> 'summary' ->> 'fcr')::numeric
              is distinct from (public.flock_cycle_report(v_flock.id) -> 'kpis' ->> 'fcr_final')::numeric then 1 else 0 end);
          end if;
        exception when others then
          v_fcr := v_fcr + 1;
        end;
      end if;
    end loop;
  end loop;
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  return query select 'sheet_totals'::text, v_totals
    union all select 'sheet_feed_by_day'::text, v_days
    union all select 'sheet_fcr_final'::text, v_fcr;
end
$$;

create or replace function public.verify_kerosene() returns table (check_name text, violations bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_totals bigint := 0;
  v_org record;
  v_user uuid;
  v_flock record;
  v_s jsonb;
begin
  return query
  -- للوجبة القائمة الحدّ الأعلى اليوم، ولا يقلّ عن يوم كتابة الصفّ بتوقيت بغداد: في الإنتاج هو اليوم نفسه (الساعة لا ترجع)، والحزمة تثبّت أيّاماً أقدم من
  -- صفوف كتبتها ملفّات قبلها بساعتها الحقيقية (درس 2026-11-10).
  select 'kerosene_days'::text, count(*) from public.flock_day_kerosene k
  join public.flocks f on f.org_id = k.org_id and f.id = k.flock_id
  where k.liters is not null and (f.placed_on is null or k.on_date < f.placed_on
    or k.on_date > coalesce(f.closed_on, greatest(public.app_today(), (k.created_at at time zone 'Asia/Baghdad')::date)))
  union all
  select 'kerosene_versions', count(*) from public.flock_day_kerosene k where k.version < 1
  union all
  select 'kerosene_hall', count(*) from public.flock_day_kerosene k
  join public.flocks f on f.org_id = k.org_id and f.id = k.flock_id
  where (k.hall_id, k.site_id, k.division_id) is distinct from (f.hall_id, f.site_id, f.division_id);

  for v_org in select distinct x.org_id from public.flocks x where x.placed_on is not null order by 1 loop
    select m.user_id into v_user from public.members m
    where m.org_id = v_org.org_id and m.role = 'owner' and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
    order by m.created_at, m.id limit 1;
    continue when v_user is null;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    -- 0038: مفاتيح الكاز في ورقة كلّ وجبة يفحصها verify_hall_sheet في قراءته لها (الورقة تُقرأ مرّة)، فهنا ورقة الوجبة بكازها وحدها.
    for v_flock in select x.id from public.flocks x where x.org_id = v_org.org_id and x.placed_on is not null
        and exists (select 1 from public.flock_day_kerosene k where k.org_id = x.org_id and k.flock_id = x.id) order by x.id loop
      begin
        v_s := public.hall_sheet(v_flock.id);
        v_totals := v_totals + (
          select count(*) from (
            select coalesce(sum((d.j ->> 'kerosene')::bigint), 0) as kerosene
            from jsonb_array_elements(v_s -> 'days') as d(j)
          ) as s
          where (v_s -> 'totals' ->> 'kerosene')::bigint is distinct from s.kerosene
            or (v_s -> 'summary' ->> 'kerosene')::bigint is distinct from (v_s -> 'totals' ->> 'kerosene')::bigint);
      exception when others then
        v_totals := v_totals + 1;
      end;
    end loop;
  end loop;
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  return query select 'sheet_kerosene_totals'::text, v_totals;
end
$$;

-- ─── ح. الصلاحيات ──────────────────────────────────────────────────────────────────────────────────────────────────
-- التواقيع الجديدة بمنح القديمة نفسها (للمستخدم المسجّل وحده)، والكاتب الجديد مثلها، والثابت لمفتاح الخادم وحده، والمساعدات مسدودة.
revoke all on function public.set_flock_dead(uuid, date, integer, uuid, boolean, integer[]),
  public.save_flock_day(uuid, date, integer, integer, numeric, numeric, numeric, numeric, integer, integer, integer, text, integer, uuid, boolean, integer[]),
  public.open_flock(uuid, date, integer, integer, text, uuid, integer[]), public.edit_flock(uuid, int, date, integer, integer, text, uuid, integer[]),
  public.set_hall_sections(uuid, integer, integer, uuid) from public, anon;
grant execute on function public.set_flock_dead(uuid, date, integer, uuid, boolean, integer[]),
  public.save_flock_day(uuid, date, integer, integer, numeric, numeric, numeric, numeric, integer, integer, integer, text, integer, uuid, boolean, integer[]),
  public.open_flock(uuid, date, integer, integer, text, uuid, integer[]), public.edit_flock(uuid, int, date, integer, integer, text, uuid, integer[]),
  public.set_hall_sections(uuid, integer, integer, uuid) to authenticated;
revoke all on function public.verify_hall_sections() from public, anon, authenticated;
grant execute on function public.verify_hall_sections() to service_role;
revoke all on function private.parts_valid(integer[]), private.parts_sum(integer[]), private.parts_add(integer[]), private.parts_even(integer, integer),
  private.flock_parts_check(public.flocks), private.flock_parts_input(public.flocks, integer, integer[]) from public, anon, authenticated;
