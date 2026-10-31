-- 0012_flocks_daily — حقول اللحم وحقول البيض، النسخة الأولى: القاعات والأفواج والجولة اليومية الحقيقية والأوزان والمؤشّرات
--   (كلمة المالك 2026-10-31: «كمّل قسمي اللاحم والبياض حتى نقدّمهما للزبون» و«حفظ حقيقي للسجلّ اليومي»؛ FOUNDATION ٣٣–٣٤، ٨٧،
--   ١٠٠، ١٤٢، ٢٠١، ٢١٧–٢١٩، ٣٦٥–٣٩٢، ٤٣٤، ٤٣٨، ٤٩٦–٥٠٣، ٥٣٧–٥٤٠، ٥٦٨–٥٨٢، ٧٧٩–٧٨٤، ٨١٦، ٨٦٠–٨٦٤، ٨٨٢).
-- المشكلة: وحدتا اللحم والبيض بلا قاعات ولا أفواج، والجولة اليومية بالجهاز (الطابور، save_flock_day) بلا دالّة بالخادم تحفظها،
--   فما يُعرض للزبون إلا شاشات فارغة.
-- هنا: halls (كتابة مباشرة مثل المخازن: flock.manage ونطاق الموقع، والوحدة من الموقع بمشغّل، وحقل لحم أو بيض بس)، وflocks (دالّة بس:
--   open_flock يفتح ويسكّن بالعدد بنداء واحد، والموقع والوحدة والنوع من القاعة)، وflock_daily (دالّة بس: save_flock_day بالمفتاح
--   الطبيعي «فوج + يوم»، الخانات مجموع اليوم، null = بلا تغيير، وbase_version وstale_day، والعملية من الطابور اللي صارت غير صالحة
--   تنركن بـflock_day_rejects وترجع parked)، وflock_weights (record_flock_weight)، والقارئان flocks_overview وflock_detail بالمؤشّرات
--   (القاعدتان ٢٨ و٣٢: العمر والحيّ والنفوق٪ والعلف التراكمي وآخر وزن وFCR وبيض اليوم وHDEP)، وverify_flocks (الحيّ ما ينزل تحت
--   الصفر واتّساق صفوف اليوم)، وsites_check يرفض أرشفة موقع بيه قاعات فعّالة. والقراءة المباشرة للأفواج وجولاتها والمركونة
--   والأوزان بنطاق الحقل (site_id على كل جدول منها، FOUNDATION ٥٤٤)، والقاعات للمنشأة مثل المخازن.
-- انحرافات مكتوبة (النسخة الأولى، والباقي v2 بـDECISIONS): التسكين بالعدد بس بمعنى «opening» (chick_source = 'opening'، بلا كلفة
--   فراخ ولا سحب من مخزن الأفراخ ولا قيد مورّد)، وopened_on = placed_on (ماكو حالة preparing بالنسخة الأولى)؛ وماكو egg_item_id
--   وegg_warehouse_id: البيض أرقام مسجّلة بالجولة، ودخوله مخزن بيض الحقل دفعاتٍ بقيمة صفر (القاعدة ٣١) بالنسخة الثانية؛ وماكو
--   إغلاق ولا تسوية عدّ ولا صرف للفوج ولا بيع؛ ونطاق عامل القاعة بموقعه أو وحدته (ماكو صفّ نطاق بالقاعة)؛ وتاريخ الجولة بقاعدة
--   الأيام السبعة والفترة المقفولة بلا يوم تشغيل الوحدة (ماكو مال ولا مخزون بالجولة)؛ والتسكين بلا حدّ الأيام السبعة (فوج قائم
--   ينكتب بتاريخ تسكينه الحقيقي، مثل الافتتاح) ويرفض تاريخاً بفترة مقفولة؛ والأوزان صفّ لكل (فوج، يوم) والإعادة تستبدله.
-- تراجع: rollback_0012.sql — يرجّع جسم sites_check كما بـ0005 حرفاً بحرف، ويشيل الجداول الخمسة ودوالّها ومشغّلاتها. أي قاعة (ولو
--   بلا فوج) أو فوج أو جولة أو وزن أو عملية مركونة يوقف التراجع بصوت بلا ما يحذف شي.
-- تنعاد بأمان: if not exists، create or replace، وكتل do تفحص الكتالوج قبل السياسات.

set lock_timeout = '5s';

-- ─── القاعات (FOUNDATION ٣٦٦): الوحدة من الحقل، والاسم فريد بين قاعات الحقل الفعّالة ───────────────────────────────────
create table if not exists public.halls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  division_id uuid not null,
  site_id uuid not null,
  name text not null,
  capacity integer,
  archived_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint halls_name_check check (length(btrim(name)) between 1 and 80),
  constraint halls_capacity_check check (capacity is null or capacity between 1 and 10000000),
  unique (org_id, id),
  unique (org_id, division_id, site_id, id),
  foreign key (org_id, division_id, site_id) references public.sites (org_id, division_id, id)
);
create index if not exists halls_site on public.halls (org_id, division_id, site_id);
create unique index if not exists halls_live_name on public.halls (org_id, site_id, btrim(name)) where archived_at is null;

-- ─── الأفواج (FOUNDATION ٣٦٧–٣٧٣): فوج حيّ واحد لكل قاعة، والموقع والوحدة من القاعة بمشغّل ──────────────────────────────
create table if not exists public.flocks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  hall_id uuid not null,
  site_id uuid not null,
  division_id uuid not null,
  kind text not null,
  breed text,
  opened_on date not null,
  placed_on date,
  placed_count integer,
  age_days_at_placement integer not null default 0,
  chick_source text not null default 'opening',
  status text not null default 'active',
  version int not null default 1,
  closed_on date,
  close_note text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint flocks_kind_check check (kind in ('broiler', 'layer')),
  constraint flocks_breed_check check (breed is null or length(btrim(breed)) between 1 and 80),
  constraint flocks_placed_count_check check (placed_count is null or placed_count between 1 and 10000000),
  constraint flocks_age_check check (age_days_at_placement between 0 and 1000),
  constraint flocks_chick_source_check check (chick_source in ('hatchery', 'supplier', 'opening')),
  constraint flocks_status_check check (status in ('preparing', 'active', 'closed')),
  constraint flocks_placed_check check (status = 'preparing' or (placed_on is not null and placed_count is not null and placed_on >= opened_on)),
  constraint flocks_closed_check check ((status = 'closed') = (closed_on is not null)),
  constraint flocks_close_note_check check (close_note is null or length(close_note) <= 500),
  unique (org_id, id),
  foreign key (org_id, division_id, site_id, hall_id) references public.halls (org_id, division_id, site_id, id)
);
create index if not exists flocks_hall on public.flocks (org_id, division_id, site_id, hall_id);
create unique index if not exists flocks_one_live on public.flocks (org_id, hall_id) where status in ('preparing', 'active');

-- ─── الجولة اليومية (FOUNDATION ٣٧٦–٣٨١): صفّ لكل (فوج، يوم)، والخانات مجموع اليوم ────────────────────────────────────
create table if not exists public.flock_daily (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  flock_id uuid not null,
  hall_id uuid not null,
  site_id uuid not null,
  division_id uuid not null,
  on_date date not null,
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
  version int not null default 1,
  last_ref uuid,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint flock_daily_birds_check check (dead between 0 and 10000000 and culled between 0 and 10000000),
  constraint flock_daily_feed_check check (feed_kg is null or (abs(feed_kg) < 'Infinity' and feed_kg >= 0 and feed_kg < 1000000000 and feed_kg = round(feed_kg, 3))),
  constraint flock_daily_water_check check (water_l is null or (abs(water_l) < 'Infinity' and water_l >= 0 and water_l < 1000000000 and water_l = round(water_l, 3))),
  constraint flock_daily_temp_min_check check (temp_min is null or (abs(temp_min) < 'Infinity' and temp_min between -50 and 70 and temp_min = round(temp_min, 1))),
  constraint flock_daily_temp_max_check check (temp_max is null or (abs(temp_max) < 'Infinity' and temp_max between -50 and 70 and temp_max = round(temp_max, 1))),
  constraint flock_daily_temp_order_check check (temp_min is null or temp_max is null or temp_min <= temp_max),
  constraint flock_daily_eggs_check check (
    (eggs_total is null or eggs_total between 0 and 10000000)
    and (eggs_cracked is null or eggs_cracked between 0 and 10000000) and (eggs_broken is null or eggs_broken between 0 and 10000000)
    and ((eggs_cracked is null and eggs_broken is null) or eggs_total is not null)
    and coalesce(eggs_cracked, 0) + coalesce(eggs_broken, 0) <= coalesce(eggs_total, 0)),
  constraint flock_daily_note_check check (note is null or length(note) <= 500),
  unique (org_id, id),
  unique (org_id, flock_id, on_date),
  foreign key (org_id, flock_id) references public.flocks (org_id, id),
  foreign key (org_id, division_id, site_id, hall_id) references public.halls (org_id, division_id, site_id, id)
);
create index if not exists flock_daily_hall on public.flock_daily (org_id, division_id, site_id, hall_id);

-- ─── الجولات المركونة (FOUNDATION ٣٨٢–٣٨٤): عملية من الطابور ردّها الخادم لأنه تغيّر وهي بالجهاز ───────────────────────
create table if not exists public.flock_day_rejects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  flock_id uuid not null,
  hall_id uuid not null,
  site_id uuid not null,
  division_id uuid not null,
  on_date date not null,
  client_ref uuid not null,
  payload jsonb not null,
  reason text not null,
  decision text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  constraint flock_day_rejects_reason_check check (reason in ('flock_closed', 'out_of_scope', 'date_too_old', 'period_locked')),
  constraint flock_day_rejects_decision_check check (decision is null or decision in ('handled', 'refused')),
  unique (org_id, id),
  unique (org_id, created_by, flock_id, on_date),
  foreign key (org_id, flock_id) references public.flocks (org_id, id),
  foreign key (org_id, division_id, site_id, hall_id) references public.halls (org_id, division_id, site_id, id)
);
create index if not exists flock_day_rejects_flock on public.flock_day_rejects (org_id, flock_id, on_date);
create index if not exists flock_day_rejects_hall on public.flock_day_rejects (org_id, division_id, site_id, hall_id);

-- ─── أوزان العيّنات (FOUNDATION ٣٨٥): صفّ لكل (فوج، يوم)، والإعادة تستبدله ─────────────────────────────────────────────
create table if not exists public.flock_weights (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  flock_id uuid not null,
  hall_id uuid not null,
  site_id uuid not null,
  division_id uuid not null,
  on_date date not null,
  sample_count integer not null,
  avg_g numeric not null,
  version int not null default 1,
  last_ref uuid,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint flock_weights_sample_check check (sample_count between 1 and 100000),
  constraint flock_weights_avg_check check (abs(avg_g) < 'Infinity' and avg_g >= 20 and avg_g <= 20000 and avg_g = round(avg_g, 1)),
  unique (org_id, id),
  unique (org_id, flock_id, on_date),
  foreign key (org_id, flock_id) references public.flocks (org_id, id),
  foreign key (org_id, division_id, site_id, hall_id) references public.halls (org_id, division_id, site_id, id)
);
create index if not exists flock_weights_hall on public.flock_weights (org_id, division_id, site_id, hall_id);

-- ─── المشغّلات ──────────────────────────────────────────────────────────────────────────────────────────────────
-- القاعة: الوحدة من الموقع (اللي ترسله الشاشة ينداس)، والموقع حقل لوحدة لحم أو بيض، وفعّال (صفّه ينقفل للمشاركة قبل الفحص، مثل
-- المخزن)، والاسم فريد بين قاعات الحقل الفعّالة، والأرشفة ترفض وبالقاعة فوج حيّ.
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

-- الفوج: الموقع والوحدة من القاعة، والنوع نوع وحدة الحقل (FOUNDATION ٣٦٩، division-check ٨٦٤).
create or replace function private.flocks_place() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_kind text;
begin
  select h.site_id, h.division_id, d.kind into new.site_id, new.division_id, v_kind
  from public.halls h join public.divisions d on d.org_id = h.org_id and d.id = h.division_id
  where h.org_id = new.org_id and h.id = new.hall_id;
  if new.kind is distinct from v_kind then
    raise exception 'flock_kind_mismatch' using hint = 'نوع الفوج لا يطابق وحدة الحقل: فوج اللحم في حقول اللحم، وفوج البيّاض في حقول البيض.';
  end if;
  return new;
end
$$;

create or replace trigger halls_check before insert or update on public.halls
  for each row execute function private.halls_check();
create or replace trigger halls_master before update on public.halls
  for each row execute function private.master_write();
create or replace trigger flocks_place before insert or update on public.flocks
  for each row execute function private.flocks_place();

do $$
declare
  t text;
begin
  foreach t in array array['halls', 'flocks', 'flock_daily', 'flock_day_rejects', 'flock_weights'] loop
    execute format('create or replace trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()', 'audit_' || t, t);
  end loop;
end
$$;

-- الموقع ما يتؤرشف وبيه مخازن فعّالة (0005)، ولا قاعات فعّالة (0012).
create or replace function private.sites_check() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_division text;
  v_expected text;
begin
  select d.kind into v_division from public.divisions d where d.org_id = new.org_id and d.id = new.division_id;
  v_expected := private.site_kind_for(v_division);
  if v_division is not null and new.kind is distinct from v_expected then
    raise exception 'site_kind_mismatch' using hint = 'نوع الموقع لا يناسب وحدته: المعمل لمعمل العلف، والمفقس للمفقس، والحقل لحقول اللحم والبيض، والمخزن لمخزن الأدوية والمخازن العامة.';
  end if;
  if tg_op = 'UPDATE' and new.archived_at is not null and old.archived_at is null
     and exists (select 1 from public.warehouses w where w.org_id = new.org_id and w.site_id = new.id and w.archived_at is null) then
    raise exception 'archived_in_use' using hint = 'في هذا الموقع مخازن فعّالة. أرشف مخازنه أوّلاً ثم أرشف الموقع.';
  end if;
  if tg_op = 'UPDATE' and new.archived_at is not null and old.archived_at is null
     and exists (select 1 from public.halls h where h.org_id = new.org_id and h.site_id = new.id and h.archived_at is null) then
    raise exception 'archived_in_use' using hint = 'في هذا الحقل قاعات فعّالة. أرشف قاعاته أوّلاً ثم أرشف الحقل.';
  end if;
  return new;
end
$$;

-- ─── RLS والامتيازات: القاعات كتابة مباشرة بنطاق الموقع (flock.manage)، والباقي دالّة بس (بلا مال) ─────────────────────
-- القراءة: القاعات للمنشأة (مثل المخازن)، والأفواج وجولاتها والمركونة وأوزانها بنطاق الحقل نفسه (FOUNDATION ٥٤٤: النطاق يدخل سياسات
-- القراءة، وsite_id ينكتب على كل جدول منها حتى السياسة ما تمشي سلسلة؛ والمفتاح المركّب للقاعة يربطه بحقلها ووحدتها).
alter table public.halls enable row level security;
alter table public.flocks enable row level security;
alter table public.flock_daily enable row level security;
alter table public.flock_day_rejects enable row level security;
alter table public.flock_weights enable row level security;

do $$
declare
  t text;
  v_rule text := 'org_id = (select public.auth_org()) and (select public.can(''flock.manage'')) and (select public.in_scope_site(site_id))';
begin
  foreach t in array array['halls', 'flocks', 'flock_daily', 'flock_day_rejects', 'flock_weights'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_read') then
      execute format('create policy %I on public.%I for select to authenticated using (%s)', t || '_read', t,
        case when t = 'halls' then 'org_id = (select public.auth_org())'
          else 'org_id = (select public.auth_org()) and (select public.in_scope_site(site_id))' end);
    end if;
  end loop;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'halls' and policyname = 'halls_insert') then
    execute format('create policy halls_insert on public.halls for insert to authenticated with check (%s)', v_rule);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'halls' and policyname = 'halls_update') then
    execute format('create policy halls_update on public.halls for update to authenticated using (%s) with check (%s)', v_rule, v_rule);
  end if;
end
$$;

revoke all on table public.halls, public.flocks, public.flock_daily, public.flock_day_rejects, public.flock_weights from anon, authenticated;
grant select on table public.halls, public.flocks, public.flock_daily, public.flock_day_rejects, public.flock_weights to authenticated;
grant insert (site_id, name, capacity) on public.halls to authenticated;
grant update (name, capacity, archived_at) on public.halls to authenticated;
revoke truncate on table public.halls, public.flocks, public.flock_daily, public.flock_day_rejects, public.flock_weights from service_role;

-- ─── المساعدات ──────────────────────────────────────────────────────────────────────────────────────────────────
-- صفّ اليوم بالشكل اللي ترجعه الدوالّ (stale_day.server والقارئان): الكسور نصوص عشرية مثل باقي الشفرة.
create or replace function private.flock_day_json(d public.flock_daily) returns jsonb
language sql stable set search_path = pg_catalog, pg_temp as $$
  select case when d.id is null then null else jsonb_build_object(
    'on_date', d.on_date, 'version', d.version, 'dead', d.dead, 'culled', d.culled,
    'feed_kg', d.feed_kg::text, 'water_l', d.water_l::text, 'temp_min', d.temp_min::text, 'temp_max', d.temp_max::text,
    'eggs_total', d.eggs_total, 'eggs_cracked', d.eggs_cracked, 'eggs_broken', d.eggs_broken, 'note', d.note) end
$$;

-- نسبة بمرتبتين (النفوق٪ وHDEP): الجزء × 100 ÷ الكلّ بالتقريب الوحيد؛ الجزء صفر = "0.00"، والكلّ صفر أو مجهول = null.
create or replace function private.flock_pct(p_part numeric, p_whole numeric) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case
    when p_part is null or p_whole is null or p_whole <= 0 then null
    when p_part <= 0 then '0.00'
    else private._mul_div_round(p_part, 100, p_whole, 2)::text
  end
$$;

-- ملخّص الفوج بمؤشّراته (القاعدتان ٢٨ و٣٢). «اليوم» يوم بغداد، وللفوج المغلق يوم إغلاقه.
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

-- ─── فتح الفوج وتسكينه (FOUNDATION ٥٧١–٥٧٢، النسخة الأولى بمعنى opening) ─────────────────────────────────────────
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

-- ─── الجولة اليومية (FOUNDATION ٥٧٨): upsert بالمفتاح الطبيعي، والوحيدة اللي تدخل الطابور ─────────────────────────────
-- الترتيب: المرجع أوّل شي، ثم الفعل، ثم قفل الفترة للمشاركة وصفّ الفوج (كل كاتب لأيّام الفوج يقفله أوّلاً، فالحيّ ما ينزل تحت
-- الصفر بحفظين متزامنين، FOUNDATION ٤٣٤ و٨٨٢)، ثم فحوص الحالة والنطاق والتاريخ (الأربعة اللي تتغيّر والعملية بالطابور تنركن إذا
-- queued)، ثم base_version، ثم القيم. الجواب saved أو stale_day أو parked ينحفظ بالمرجع، والرفض بخطأ ما ينحفظ.
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

-- ─── وزن العيّنة (FOUNDATION ٣٨٥، ٥٣٧): بالنت بس، صفّ لكل (فوج، يوم) ─────────────────────────────────────────────────
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

-- ─── القارئان (بلا مال، لكل دور بنطاقه) ─────────────────────────────────────────────────────────────────────────
-- الحقول بنطاق المستخدم (in_scope_site) ← قاعاتها الفعّالة ← فوج كل قاعة الحيّ بملخّصه.
create or replace function public.flocks_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_manage boolean;
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
    ), '[]'::jsonb));
end
$$;

-- الفوج بأيّامه (الحيّ الجاري وHDEP لكل يوم، «—» = null ليوم بلا بيض) وأوزانه.
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

-- ─── الثوابت (FOUNDATION ٤٣٤، ٨٦٤، ٨٨٢): صفر مخالفة بالحزمة وبالإنتاج، لـservice_role بس ──────────────────────────────
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

-- ─── الصلاحيات ─────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.open_flock(uuid, date, integer, integer, text, uuid),
  public.save_flock_day(uuid, date, integer, integer, numeric, numeric, numeric, numeric, integer, integer, integer, text, integer, uuid, boolean),
  public.record_flock_weight(uuid, date, integer, numeric, uuid), public.flocks_overview(), public.flock_detail(uuid), public.verify_flocks()
  from public, anon;
grant execute on function public.open_flock(uuid, date, integer, integer, text, uuid),
  public.save_flock_day(uuid, date, integer, integer, numeric, numeric, numeric, numeric, integer, integer, integer, text, integer, uuid, boolean),
  public.record_flock_weight(uuid, date, integer, numeric, uuid), public.flocks_overview(), public.flock_detail(uuid) to authenticated;
revoke all on function public.verify_flocks() from authenticated;
grant execute on function public.verify_flocks() to service_role;
