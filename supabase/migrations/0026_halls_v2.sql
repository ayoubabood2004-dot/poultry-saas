-- 0026_halls_v2 — «القاعات بين يديك»: الإضافة لعدّة قاعات بنداء واحد (صرف من مخزن، أو دواء بلا مخزن، أو تأشير لقاح)، وجدول اللقاحات الواحد
--   لكلّ نوع وقائمة لقاحاته، والتذكير، وتقويم القاعة الشهري، وتقرير الدورة (كلمة المالك 2026-11-11 وأجوبته الأربعة؛ docs/HALLS_PLAN.md؛
--   DECISIONS «القاعات بين يديك»).
-- المشكلة: الصرف للقاعة مادّة واحدة لقاعة واحدة من صفحة في المخزن، فتكرار حركة على عدّة قاعات يعني الدخول لكلّ قاعة؛ ولا مكان يُسجَّل فيه
--   الدواء المعطى، ولا جدول لقاحات ولا تذكير، ولا قارئ يجمع ما نزل للقاعة وما حدث فيها يوماً بيوم أو للدورة كلّها.
-- هنا: flock_logs (الدواء المعطى بلا مخزن: اسم وجرعة، يُحذف بتأكيد لأنّه ليس حركة مخزون ولا مال)، وvaccines (قائمة لقاحات المنشأة بلون لكلّ
--   لقاح وربط اختياريّ بمادّة لقاح أو دواء)، وvaccine_programs وvaccine_program_days (جدول واحد لكلّ نوع: نهاية الدورة بالأيّام وأيّام العمر لكلّ
--   لقاح، جواب المالك: جدول واحد لكلّ القاعات)، وflock_vaccinations (تأشير «تمّ» لكلّ قاعة وموعد، والمربوط بمادّة يُصرف من المخزن بالنداء نفسه،
--   جواب المالك)؛ وpublic.give_to_flocks بنداء واحد ومعاملة واحدة ومرجع واحد لسطور من ثلاثة أنواع لقاعة أو أكثر (الصرف على نواة
--   record_flock_issue نفسها: كلّ سطر صرف FI بكلفته على الفوج)، وremove_flock_log، وundo_vaccination (يعكس الصرف إن وُجد)، وsave_vaccine
--   وdelete_vaccine وsave_vaccine_program (بشرط النسخة)، والقرّاء vaccine_board وvaccine_reminders وflock_month وflock_cycle_report، وverify_halls؛
--   ومحفّز على flock_issues يرفض إلغاء صرف لقاح مؤشَّر إلّا من «ألغِ التأشير» (فلا يبقى تأشير على صرف ملغى).
-- يوم العمر N لفوج = يوم التسكين + (N − عمره عند التسكين)، كعمر الشاشات (flocks_overview)؛ والموعد قبل التسكين لا يُعدّ.
-- انحرافات مكتوبة (DECISIONS «القاعات بين يديك»):
--   • الصرف لعدّة قاعات FI لكلّ (قاعة، مادّة)، لا مستند واحد بسطور: النواة نفسها بلا نسخ جسمها، والإلغاء لكلّ صرف بحاله كما هو.
--   • النقص عبر القاعات يُفحص مجموعاً لكلّ (مادّة، مخزن) قبل أوّل سحب، بجملة تسمّي المادّة وعدد القاعات والمجموع وما عندك؛ والفحص الملزم
--     لكلّ سطر يبقى في النواة تحت أقفالها. والأقفال كلّها أوّل النداء بترتيب النواة نفسه (الفترة ← الأفواج ← المخزن والمادّة ← الأرصدة)،
--     فصرفان لعدّة قاعات بموادّ مشتركة يترتّبان ولا يتقافلان.
--   • التأشير بتاريخ الإضافة نفسه وبقواعد تاريخ المستند (لا مستقبل ولا أقدم من 7 أيام ولا فترة مقفولة)، فالتذكير يعرض الفائت حتى 7 أيام.
--   • حذف لقاح أُشِّر به يخفيه (أرشفة) ويبقى اسمه على تأشيراته؛ وحذف ما لم يُؤشَّر به يمحوه؛ وكلاهما يُخرجه من الجدولين.
--   • لون اللقاح موضع 0..4 يُعطى عند إنشائه (أوّل موضع حرّ بين الحيّة)، وما بعدها 5 (رماديّ «أخرى» في الشاشات).
-- مراجعة 0026 (قبل الإنتاج؛ أربع زوايا، كلّ ملاحظة بفحص فشل على الهجرة قبلها في halls.test «مراجعة 0026»):
--   • DB-1 (عالية): سطر التأشير المربوط يحمل المادّة التي عرضتها الشاشة (item_id)، ولقاح رُبط بغيرها بعد القراءة vaccine_relinked بلا صرف (كان يصرف
--     المادّة الجديدة بكمية كُتبت للقديمة)، والربط يُعاد فحصه تحت أقفال اللقاحات.
--   • DB-2: الإعادة بمرجع إضافة أُلغي بعدها صرف منها أو تأشير أو حُذف تسجيل id_conflict «أُلغي» (كانت «حُفظ» بنتيجتها القديمة).
--   • DB-3: معرّف صرف التأشير جديد لا صرف قبله، وفهرس فريد flock_vaccinations_issue_once وثابت issue_once: صرف واحد لتأشير واحد (كان تأشير ثانٍ
--     يتبنّى صرفاً قائماً بلا سحب ثمّ لا يُلغى أيّهما).
--   • DB-4: قفل الفترة قبل فحص التاريخ لكلّ إضافة (كان التسجيل والتأشير غير المربوط يدخلان فترة قُفلت أثناء النداء).
--   • DB-5 وDB-7: اللقاحات وجداولها مقفولة أوّل النداء بترتيب delete_vaccine وsave_vaccine_program (كانت لكلّ سطر فتتقافل مع الحذف)، واللقاح المحذوف
--     أثناء الانتظار vaccine_not_found بجملته (كان not_in_program بـ«»).
--   • DB-6: undo_vaccination يأخذ أقفال صرفه بترتيب void_flock_issue قبل قفل التأشير (كان يتقافل مع إضافة تؤشّر الموعد نفسه).
--   • DB-8: «للقاعتين» و«لـ3 قاعات» و«لـ11 قاعة» في جملة النقص.
--   • F: save_vaccine_program يقول stale_program أوّلاً حين تغيّرت النسخة (ومنه حذف لقاح فيه) قبل فحص اللقاحات.
--   • A وC وH: رقم صرف اللقاح المؤشَّر في التقويم (doc_no)، وموادّ التقرير بمجموع الموزون وعدد غير الموزون (unweighed)، وصرف اليوم الواحد بترتيب رقمه.
--   • H26-PERM-3: سجلّ تدقيق يتيم لجداول 0026 يوقف التراجع (فرع رابع)، فلا تسقط سياسة نطاقه وصفوفه باقية.
--   • H26-PERM-4: ربط لقاح بمادّة يقفلها للمشاركة، فحذفها في اللحظة نفسها ينتظر ثمّ item_not_found (كان مفتاحاً خاماً 23503).
--   متروك بقرار: GR-3 («ألغِ» في سجلّ الصرف لصرف لقاح مؤشَّر تظهر، والخادم يرفضها بجملة تدلّ على «ألغِ التأشير»؛ إخفاؤها يغيّر flock_feed من 0019).
-- تراجع: rollback_0026.sql — يُسقط المحفّز والدوالّ والجداول الخمسة وسياسة نطاق سجلّ التدقيق. **طريق رفض**: أيّ صفّ في الجداول الخمسة يوقف
--   التراجع بصوت بلا أن يحذف شيئاً (التأشيرات تشير إلى صرف مرحَّل، والجدول والتسجيلات بيانات المالك).
-- تنعاد بأمان: create table if not exists، وcreate or replace، وcreate index if not exists، وكتل do تفحص الكتالوج قبل السياسات.

set lock_timeout = '5s';

-- ─── أ. الجداول ───────────────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.vaccines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  name text not null,
  name_key text generated always as (private.searchable(name)) stored,
  color int not null,
  item_id uuid,
  archived_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint vaccines_name_check check (length(name) between 1 and 40 and name = btrim(name)),
  constraint vaccines_color_check check (color between 0 and 9),
  constraint vaccines_version_check check (version >= 1),
  unique (org_id, id),
  foreign key (org_id, item_id) references public.items (org_id, id)
);
create unique index if not exists vaccines_live_name on public.vaccines (org_id, name_key) where archived_at is null;
create index if not exists vaccines_item on public.vaccines (org_id, item_id);

create table if not exists public.vaccine_programs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  kind text not null,
  end_age int not null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint vaccine_programs_kind_check check (kind in ('broiler', 'layer')),
  constraint vaccine_programs_end_age_check check (end_age between 1 and 1000),
  constraint vaccine_programs_version_check check (version >= 1),
  unique (org_id, id),
  unique (org_id, kind)
);

create table if not exists public.vaccine_program_days (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  kind text not null,
  vaccine_id uuid not null,
  age_day int not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint vaccine_program_days_age_check check (age_day between 1 and 1000),
  unique (org_id, id),
  unique (org_id, kind, vaccine_id, age_day),
  foreign key (org_id, kind) references public.vaccine_programs (org_id, kind),
  foreign key (org_id, vaccine_id) references public.vaccines (org_id, id)
);
create index if not exists vaccine_program_days_vaccine on public.vaccine_program_days (org_id, vaccine_id);

create table if not exists public.flock_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  flock_id uuid not null,
  hall_id uuid not null,
  site_id uuid not null,
  division_id uuid not null,
  on_date date not null,
  kind text not null default 'medicine',
  name text not null,
  dose text,
  client_ref uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint flock_logs_kind_check check (kind in ('medicine')),
  constraint flock_logs_name_check check (length(name) between 1 and 80 and name = btrim(name)),
  constraint flock_logs_dose_check check (dose is null or (length(dose) between 1 and 120 and dose = btrim(dose))),
  unique (org_id, id),
  foreign key (org_id, flock_id) references public.flocks (org_id, id),
  foreign key (org_id, division_id, site_id, hall_id) references public.halls (org_id, division_id, site_id, id)
);
create index if not exists flock_logs_flock on public.flock_logs (org_id, flock_id, on_date);
create index if not exists flock_logs_hall on public.flock_logs (org_id, division_id, site_id, hall_id);

create table if not exists public.flock_vaccinations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  flock_id uuid not null,
  hall_id uuid not null,
  site_id uuid not null,
  division_id uuid not null,
  vaccine_id uuid not null,
  age_day int not null,
  done_on date not null,
  issue_id uuid,
  item_id uuid,
  status text not null default 'done',
  client_ref uuid not null,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint flock_vaccinations_age_check check (age_day between 1 and 1000),
  constraint flock_vaccinations_status_check check (status in ('done', 'void')),
  constraint flock_vaccinations_void_check check ((status = 'void') = (voided_at is not null) and (void_reason is null or status = 'void')),
  constraint flock_vaccinations_void_reason_check check (void_reason is null or (length(void_reason) between 1 and 500 and void_reason = btrim(void_reason))),
  constraint flock_vaccinations_issue_check check ((issue_id is null) = (item_id is null)),
  unique (org_id, id),
  foreign key (org_id, flock_id) references public.flocks (org_id, id),
  foreign key (org_id, division_id, site_id, hall_id) references public.halls (org_id, division_id, site_id, id),
  foreign key (org_id, vaccine_id) references public.vaccines (org_id, id),
  foreign key (org_id, issue_id) references public.flock_issues (org_id, id),
  foreign key (org_id, item_id) references public.items (org_id, id)
);
create unique index if not exists flock_vaccinations_live on public.flock_vaccinations (org_id, flock_id, vaccine_id, age_day) where status = 'done';
create index if not exists flock_vaccinations_flock on public.flock_vaccinations (org_id, flock_id, done_on);
create index if not exists flock_vaccinations_hall on public.flock_vaccinations (org_id, division_id, site_id, hall_id);
create unique index if not exists flock_vaccinations_issue_once on public.flock_vaccinations (org_id, issue_id);
create index if not exists flock_vaccinations_vaccine on public.flock_vaccinations (org_id, vaccine_id);
create index if not exists flock_vaccinations_item on public.flock_vaccinations (org_id, item_id);

do $$
declare
  t text;
begin
  foreach t in array array['vaccines', 'vaccine_programs', 'vaccine_program_days', 'flock_logs', 'flock_vaccinations'] loop
    execute format('create or replace trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()', 'audit_' || t, t);
  end loop;
end
$$;

alter table public.vaccines enable row level security;
alter table public.vaccine_programs enable row level security;
alter table public.vaccine_program_days enable row level security;
alter table public.flock_logs enable row level security;
alter table public.flock_vaccinations enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vaccines' and policyname = 'vaccines_read') then
    create policy vaccines_read on public.vaccines for select to authenticated using (org_id = (select public.auth_org()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vaccine_programs' and policyname = 'vaccine_programs_read') then
    create policy vaccine_programs_read on public.vaccine_programs for select to authenticated using (org_id = (select public.auth_org()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vaccine_program_days' and policyname = 'vaccine_program_days_read') then
    create policy vaccine_program_days_read on public.vaccine_program_days for select to authenticated using (org_id = (select public.auth_org()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'flock_logs' and policyname = 'flock_logs_read') then
    create policy flock_logs_read on public.flock_logs for select to authenticated
      using (org_id = (select public.auth_org()) and (select public.in_scope_site(site_id)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'flock_vaccinations' and policyname = 'flock_vaccinations_read') then
    create policy flock_vaccinations_read on public.flock_vaccinations for select to authenticated
      using (org_id = (select public.auth_org()) and (select public.in_scope_site(site_id)));
  end if;
  -- سجلّ التدقيق يحمل الصفّ كلّه (E49): التسجيلات والتأشيرات بحقل فوجها، مثل سياستَي جدوليهما.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'audit_log_halls_scope') then
    create policy audit_log_halls_scope on public.audit_log as restrictive for select to authenticated
      using (case
        when table_name in ('flock_logs', 'flock_vaccinations') then public.in_scope_site((coalesce("new", "old") ->> 'site_id')::uuid)
        else true
      end);
  end if;
end
$$;

revoke all on table public.vaccines, public.vaccine_programs, public.vaccine_program_days, public.flock_logs, public.flock_vaccinations from anon, authenticated;
grant select on table public.vaccines, public.vaccine_programs, public.vaccine_program_days, public.flock_logs, public.flock_vaccinations to authenticated;

-- ─── ب. مساعدات ──────────────────────────────────────────────────────────────────────────────────────────────────

-- مرجع مشتقّ ثابت لكلّ سطر من مرجع النداء الواحد: نداء النواة (record_flock_issue وvoid_flock_issue) لكلّ سطر يحفظ مرجعه، والإعادة بمرجع النداء
-- نفسه ترجع من الخارج قبل أن تصل إليه.
create or replace function private.derived_ref(p_ref uuid, p_n int) returns uuid
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select md5(p_ref::text || ':' || p_n::text)::uuid
$$;

-- الفوج لمن يقرؤه أو يكتب له: موجود في المنشأة، وحقله بنطاق القارئ (قبل أن يُسمّى شيء منه، E49)، وللكتابة قائم (لا مغلق ولا قيد التحضير).
create or replace function private.flock_for(p_flock uuid, p_write boolean) returns public.flocks
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  f public.flocks;
  v_hall text;
begin
  select * into f from public.flocks x where x.org_id = public.auth_org() and x.id = p_flock;
  if f.id is null then
    raise exception 'flock_not_found' using hint = 'هذا الفوج غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(f.site_id) then
    raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  if p_write then
    select h.name into v_hall from public.halls h where h.org_id = f.org_id and h.id = f.hall_id;
    if f.status = 'closed' then
      raise exception 'flock_closed' using hint = format('فوج «%s» مغلق، فلا يُسجَّل له شيء.', v_hall);
    end if;
    if f.status <> 'active' then
      raise exception 'flock_not_placed' using hint = format('فوج «%s» لم يُسكَّن بعد، فلا يُسجَّل له شيء.', v_hall);
    end if;
  end if;
  return f;
end
$$;

-- مواعيد جدول اللقاحات لفوج: كلّ (لقاح، يوم عمر) في جدول نوعه بتاريخه، من يوم التسكين حتى الإغلاق إن أُغلق.
create or replace function private.flock_slots(p_flock uuid) returns table (vaccine_id uuid, age_day int, due_on date)
language sql stable security definer set search_path = public, pg_temp as $$
  select d.vaccine_id, d.age_day, f.placed_on + (d.age_day - f.age_days_at_placement)
  from public.flocks f
  join public.vaccine_program_days d on d.org_id = f.org_id and d.kind = f.kind
  where f.org_id = public.auth_org() and f.id = p_flock and f.placed_on is not null
    and d.age_day >= f.age_days_at_placement
    and (f.closed_on is null or f.placed_on + (d.age_day - f.age_days_at_placement) <= f.closed_on)
$$;

-- رأس الفوج للقارئين (التقويم والتقرير): القاعة والحقل والنوع والتسكين ونهاية الدورة من جدول نوعه.
create or replace function private.hall_flock_json(f public.flocks) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', f.id, 'hall_id', f.hall_id, 'hall_name', h.name, 'site_name', s.name, 'kind', f.kind, 'status', f.status,
    'placed_on', f.placed_on, 'age0', f.age_days_at_placement, 'placed_count', f.placed_count, 'closed_on', f.closed_on,
    'end_age', p.end_age,
    'end_on', case when p.end_age is not null then f.placed_on + (p.end_age - f.age_days_at_placement) end)
  from public.halls h
  join public.sites s on s.org_id = h.org_id and s.id = h.site_id
  left join public.vaccine_programs p on p.org_id = f.org_id and p.kind = f.kind
  where h.org_id = f.org_id and h.id = f.hall_id
$$;

-- ─── ج. إلغاء صرف لقاح مؤشَّر يمرّ من «ألغِ التأشير» وحده ──────────────────────────────────────────────────────────────────
-- void_flock_issue يُلغي أيّ صرف مرحَّل؛ وصرف اللقاح المؤشَّر لو أُلغي وحده يبقى التأشير «تمّ» على صرف ملغى. undo_vaccination يُلغي التأشير أوّلاً
-- ثمّ الصرف في المعاملة نفسها، فلا يصل المحفّز تأشير حيّ.
create or replace function private.flock_issue_vaccination_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.status = 'posted' and new.status = 'void' and exists (select 1 from public.flock_vaccinations m
      where m.org_id = new.org_id and m.issue_id = new.id and m.status = 'done') then
    raise exception 'vaccination_issue' using hint = format('الصرف %s لقاح مؤشَّر «تمّ» في جدول اللقاحات. ألغِ التأشير من تقويم القاعة فيُلغى الصرف معه.', new.doc_no);
  end if;
  return new;
end
$$;

do $$
begin
  execute 'create or replace trigger flock_issues_vaccination_guard before update on public.flock_issues for each row execute function private.flock_issue_vaccination_guard()';
end
$$;

-- ─── د. الإضافة للقاعات بنداء واحد ─────────────────────────────────────────────────────────────────────────────────────
-- p_lines مصفوفة 1..100 سطراً بترتيب الشاشة، كلّ سطر لفوج قائم بنطاق الكاتب:
--   issue: صرف مادّة من مخزن (issue.post) على نواة record_flock_issue بمرجع مشتقّ — FI بكلفته على الفوج؛
--   log: دواء بلا مخزن باسمه وجرعته (flock_day.save)؛
--   vaccination: تأشير موعد في جدول نوع الفوج (flock_day.save)، والمربوط بمادّة يُصرف منها بالكمية المرسلة (issue.post) بالنداء نفسه، والسطر يحمل
--     المادّة التي عرضتها الشاشة: لقاحٌ رُبط بغيرها بعد القراءة يُرفض vaccine_relinked ولا يُصرف شيء (مراجعة 0026 DB-1: كان يصرف المادّة الجديدة
--     بكمية كُتبت للقديمة)، ومعرّف الصرف جديد لا صرف قبله (DB-3: كان يتبنّى صرفاً قائماً بلا سحب).
-- أيّ رفض يرفض النداء كلّه، والإعادة بالمرجع نفسه ترجّع النتيجة نفسها، إلّا إن أُلغي من بعدها شيء ممّا حفظته (صرف أو تأشير) أو حُذف تسجيل منه:
-- id_conflict «أُلغي» كنواة الصرف (DB-2، درس 0017). الأقفال كلّها أوّل النداء بترتيب واحد: الفترة (قبل فحص التاريخ، DB-4) ← الأفواج ← اللقاحات
-- ← جداولها (كترتيب delete_vaccine وsave_vaccine_program، DB-5) ← المخزن والمادّة ← الأرصدة (كترتيب النواة)، فكلّ قفل بعدها مأخوذ.
create or replace function public.give_to_flocks(p_client_ref uuid, p_on date, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'give_to_flocks';
  v_org uuid := public.auth_org();
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_qty constant text := '^[0-9]{1,12}([.][0-9]{1,3})?$';
  v_cached jsonb;
  a jsonb;
  v_n int;
  v_kind text;
  v_part int;
  v_keys text[] := '{}';
  v_ids text[] := '{}';
  v_key text;
  v_issue_any boolean := false;
  v_record_any boolean := false;
  v_flocks uuid[];
  v_vaccines uuid[];
  v_kinds text[];
  v_fid uuid;
  f public.flocks;
  h public.halls;
  vc public.vaccines;
  v_jobs jsonb := '[]';
  v_items uuid[];
  v_whs uuid[];
  v_need record;
  s record;
  v_res jsonb;
  v_name text;
  v_dose text;
  v_issue uuid;
  v_constraint text;
  v_out_issues jsonb := '[]';
  v_out_logs jsonb := '[]';
  v_out_vaccinations jsonb := '[]';
  v_result jsonb;
begin
  set local lock_timeout = '5s';
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('on', p_on, 'lines', p_lines));
  if v_cached is not null then
    -- إضافة حُفظت ثمّ أُلغي منها صرف أو تأشير أو حُذف تسجيل: الإعادة لا تقول «حُفظ» بنتيجتها القديمة (مراجعة 0026 DB-2).
    if exists (select 1 from jsonb_array_elements(coalesce(v_cached -> 'issues', '[]'::jsonb)) as e(x)
          join public.flock_issues y on y.org_id = v_org and y.id = (e.x ->> 'issue_id')::uuid where y.status = 'void')
        or exists (select 1 from jsonb_array_elements(coalesce(v_cached -> 'vaccinations', '[]'::jsonb)) as e(x)
          join public.flock_vaccinations m on m.org_id = v_org and m.id = (e.x ->> 'id')::uuid where m.status = 'void')
        or exists (select 1 from jsonb_array_elements(coalesce(v_cached -> 'logs', '[]'::jsonb)) as e(x)
          where not exists (select 1 from public.flock_logs o where o.org_id = v_org and o.id = (e.x ->> 'id')::uuid)) then
      raise exception 'id_conflict' using hint = 'سُجّلت هذه الإضافة من قبل ثمّ أُلغي منها شيء أو حُذف. افتح تقويم القاعة لترى ما بقي، ثمّ أضف من جديد.';
    end if;
    return v_cached;
  end if;

  -- ١) شكل السطور كلّها قبل أيّ قراءة: النوع والمعرّفات والكمية نصّاً بثلاث مراتب، والمكرَّر في الطلب نفسه.
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'bad_line' using hint = 'سطور الإضافة بشكل غير صالح. حدّث الشاشة وأعد المحاولة.';
  end if;
  if jsonb_array_length(p_lines) = 0 then
    raise exception 'lines_required' using hint = 'اختر مادّة أو دواءً أو لقاحاً واحداً على الأقلّ.';
  end if;
  if jsonb_array_length(p_lines) > 100 then
    raise exception 'too_many_lines' using hint = format('الطلب %s سطراً، والحدّ 100 سطر في المرّة. قسّمه على مرّتين.', jsonb_array_length(p_lines));
  end if;
  for a, v_n in select e.x, e.n from jsonb_array_elements(p_lines) with ordinality as e(x, n) loop
    if jsonb_typeof(a) <> 'object' or coalesce(a ->> 'kind', '') not in ('issue', 'log', 'vaccination') or coalesce(a ->> 'flock_id', '') !~ v_uuid then
      raise exception 'bad_line' using hint = 'سطر إضافة بشكل غير صالح. حدّث الشاشة وأعد المحاولة.';
    end if;
    v_kind := a ->> 'kind';
    if v_kind = 'issue' then
      if coalesce(a ->> 'issue_id', '') !~ v_uuid or coalesce(a ->> 'line_id', '') !~ v_uuid or coalesce(a ->> 'item_id', '') !~ v_uuid
          or coalesce(a ->> 'warehouse_id', '') !~ v_uuid or jsonb_typeof(a -> 'qty') is distinct from 'string' or (a ->> 'qty') !~ v_qty then
        raise exception 'bad_line' using hint = 'سطر صرف بشكل غير صالح (المادّة أو المخزن أو الكمية). حدّث الشاشة وأعد المحاولة.';
      end if;
      v_key := 'i:' || lower(a ->> 'flock_id') || ':' || lower(a ->> 'item_id') || ':' || lower(a ->> 'warehouse_id');
      v_ids := v_ids || lower(a ->> 'issue_id') || lower(a ->> 'line_id');
      v_issue_any := true;
    elsif v_kind = 'log' then
      if coalesce(a ->> 'id', '') !~ v_uuid or jsonb_typeof(a -> 'name') is distinct from 'string'
          or not (coalesce(jsonb_typeof(a -> 'dose'), 'null') in ('null', 'string')) then
        raise exception 'bad_line' using hint = 'سطر دواء بشكل غير صالح. حدّث الشاشة وأعد المحاولة.';
      end if;
      v_key := null;
      v_ids := v_ids || lower(a ->> 'id');
      v_record_any := true;
    else
      if coalesce(a ->> 'id', '') !~ v_uuid or coalesce(a ->> 'vaccine_id', '') !~ v_uuid
          or jsonb_typeof(a -> 'age_day') is distinct from 'number' or (a ->> 'age_day') !~ '^[0-9]{1,4}$' then
        raise exception 'bad_line' using hint = 'سطر لقاح بشكل غير صالح. حدّث الشاشة وأعد المحاولة.';
      end if;
      -- صرف التأشير المربوط خمسة مفاتيح معاً (المادّة المعروضة والمعرّفان والمخزن والكمية) أو لا شيء منها.
      v_part := (case when a ? 'item_id' and a -> 'item_id' <> 'null'::jsonb then 1 else 0 end)
        + (case when a ? 'issue_id' and a -> 'issue_id' <> 'null'::jsonb then 1 else 0 end) + (case when a ? 'line_id' and a -> 'line_id' <> 'null'::jsonb then 1 else 0 end)
        + (case when a ? 'warehouse_id' and a -> 'warehouse_id' <> 'null'::jsonb then 1 else 0 end) + (case when a ? 'qty' and a -> 'qty' <> 'null'::jsonb then 1 else 0 end);
      if v_part not in (0, 5) or (v_part = 5 and (coalesce(a ->> 'item_id', '') !~ v_uuid or coalesce(a ->> 'issue_id', '') !~ v_uuid
          or coalesce(a ->> 'line_id', '') !~ v_uuid or coalesce(a ->> 'warehouse_id', '') !~ v_uuid or jsonb_typeof(a -> 'qty') <> 'string' or (a ->> 'qty') !~ v_qty)) then
        raise exception 'bad_line' using hint = 'سطر لقاح بشكل غير صالح (صرفه ناقص). حدّث الشاشة وأعد المحاولة.';
      end if;
      v_key := 'v:' || lower(a ->> 'flock_id') || ':' || lower(a ->> 'vaccine_id') || ':' || (a ->> 'age_day');
      v_ids := v_ids || lower(a ->> 'id');
      if v_part = 5 then
        v_ids := v_ids || lower(a ->> 'issue_id') || lower(a ->> 'line_id');
        v_issue_any := true;
      end if;
      v_record_any := true;
    end if;
    if v_key is not null then
      if v_key = any (v_keys) then
        raise exception 'duplicate_line' using hint = case when v_kind = 'issue'
          then 'المادّة نفسها من المخزن نفسه مكتوبة لقاعة واحدة مرّتين. اجمع كميتها في سطر واحد.'
          else 'اللقاح نفسه في الموعد نفسه مكتوب لقاعة واحدة مرّتين.' end;
      end if;
      v_keys := v_keys || v_key;
    end if;
  end loop;
  if (select count(*) from unnest(v_ids) as x) <> (select count(distinct x) from unnest(v_ids) as x) then
    raise exception 'id_conflict' using hint = 'معرّف مكرّر داخل الطلب نفسه. حدّث الشاشة وأعد المحاولة.';
  end if;

  -- ٢) الصلاحية، ثمّ قفل الفترة قبل فحص التاريخ (كلّ فحص بعد قفله، مراجعة 0026 DB-4: قفل فترة يُثبَّت أثناء النداء كان يُدخل التسجيل والتأشير
  --    غير المربوط فيها)، والتاريخ بقواعد المستند (لا مستقبل ولا أقدم من 7 أيام ولا فترة مقفولة).
  if v_record_any then
    perform private.require('flock_day.save');
  end if;
  if v_issue_any then
    perform private.require('issue.post');
  end if;
  perform private.period_guard();
  perform private.check_doc_date(p_on);

  -- ٣) الأفواج بترتيب معرّفاتها: موجودة وبنطاق الكاتب وقائمة، والتاريخ لا يسبق تسكين أيّ منها.
  select array_agg(distinct (e.x ->> 'flock_id')::uuid order by (e.x ->> 'flock_id')::uuid) into v_flocks from jsonb_array_elements(p_lines) as e(x);
  foreach v_fid in array v_flocks loop
    f := private.flock_for(v_fid, true);
    if p_on < f.placed_on then
      select * into h from public.halls x where x.org_id = v_org and x.id = f.hall_id;
      raise exception 'before_placement' using hint = format('التاريخ %s قبل تسكين «%s» في %s.', to_char(p_on, 'DD/MM/YYYY'), h.name, to_char(f.placed_on, 'DD/MM/YYYY'));
    end if;
  end loop;

  -- ٤) الأقفال أوّلاً: الأفواج، ثمّ اللقاحات المذكورة بترتيب معرّفاتها وجداول أنواع أفواجها بترتيب النوع (للمشاركة: الحذف والتعديل من جهاز آخر
  --    ينتظر أو يُرى). اللقاح المحذوف بعد قراءة الشاشة vaccine_not_found بجملته (DB-7: كان «» بلا اسم).
  perform 1 from public.flocks x where x.org_id = v_org and x.id = any (v_flocks) order by x.id for share;
  select array_agg(distinct (e.x ->> 'vaccine_id')::uuid order by (e.x ->> 'vaccine_id')::uuid) into v_vaccines
  from jsonb_array_elements(p_lines) as e(x) where e.x ->> 'kind' = 'vaccination';
  if v_vaccines is not null then
    if (select count(*) from (select 1 from public.vaccines x where x.org_id = v_org and x.id = any (v_vaccines) order by x.id for share) as l) <> cardinality(v_vaccines) then
      raise exception 'vaccine_not_found' using hint = 'لقاح في الطلب غير موجود في القائمة (ربّما حُذف الآن من جهاز آخر). حدّث الشاشة.';
    end if;
    select array_agg(distinct f2.kind order by f2.kind) into v_kinds
    from jsonb_array_elements(p_lines) as e(x) join public.flocks f2 on f2.org_id = v_org and f2.id = (e.x ->> 'flock_id')::uuid
    where e.x ->> 'kind' = 'vaccination';
    perform 1 from public.vaccine_programs p where p.org_id = v_org and p.kind = any (v_kinds) order by p.kind for share;
  end if;

  -- ٥) اللقاحات تحت أقفالها: حيّة، والمربوط يُرسل صرفه بالمادّة التي هو مربوط بها الآن وغير المربوط بلاه؛ ومنها ومن سطور الصرف قائمة السحب.
  for a, v_n in select e.x, e.n from jsonb_array_elements(p_lines) with ordinality as e(x, n) loop
    if a ->> 'kind' = 'issue' then
      v_jobs := v_jobs || jsonb_build_object('n', v_n, 'flock_id', a ->> 'flock_id', 'item_id', a ->> 'item_id', 'warehouse_id', a ->> 'warehouse_id', 'qty', a ->> 'qty');
    elsif a ->> 'kind' = 'vaccination' then
      select * into vc from public.vaccines x where x.org_id = v_org and x.id = (a ->> 'vaccine_id')::uuid;
      if vc.archived_at is not null then
        raise exception 'vaccine_archived' using hint = format('اللقاح «%s» محذوف من القائمة. حدّث الشاشة.', vc.name);
      end if;
      if vc.item_id is not null and not (a ? 'qty' and a -> 'qty' <> 'null'::jsonb) then
        raise exception 'vaccine_linked' using hint = format('اللقاح «%s» مربوط بمادّة في المخزن، فيُصرف عند التأشير: حدّث الشاشة واكتب الكمية.', vc.name);
      end if;
      if vc.item_id is null and a ? 'qty' and a -> 'qty' <> 'null'::jsonb then
        raise exception 'vaccine_not_linked' using hint = format('اللقاح «%s» غير مربوط بمادّة في المخزن، فلا يُصرف شيء عند تأشيره. حدّث الشاشة.', vc.name);
      end if;
      if vc.item_id is not null and vc.item_id <> (a ->> 'item_id')::uuid then
        raise exception 'vaccine_relinked' using hint = (select format('اللقاح «%s» صار مربوطاً بـ«%s» في المخزن بعد قراءة الشاشة، فلم يُصرف شيء. حدّث الشاشة واكتب الكمية من جديد.', vc.name, i.name)
          from public.items i where i.org_id = v_org and i.id = vc.item_id);
      end if;
      if vc.item_id is not null then
        if exists (select 1 from public.flock_issues y where y.id = (a ->> 'issue_id')::uuid) then
          raise exception 'id_conflict' using hint = 'معرّف صرف هذا التأشير مستعمل لصرف قبله. حدّث الشاشة وأعد التأشير.';
        end if;
        v_jobs := v_jobs || jsonb_build_object('n', v_n, 'flock_id', a ->> 'flock_id', 'item_id', vc.item_id, 'warehouse_id', a ->> 'warehouse_id', 'qty', a ->> 'qty');
      end if;
    end if;
  end loop;

  -- ٦) المخزن والمادّة والأرصدة بترتيب النواة، ثمّ النقص عبر القاعات: مجموع كلّ (مادّة، مخزن) في أكثر من سطر مقابل المتاح بتاريخ الإضافة.
  if jsonb_array_length(v_jobs) > 0 then
    for v_fid in select distinct (j.x ->> 'warehouse_id')::uuid from jsonb_array_elements(v_jobs) as j(x) order by 1 loop
      if not exists (select 1 from public.warehouses w where w.org_id = v_org and w.id = v_fid) then
        raise exception 'warehouse_not_found' using hint = 'هذا المخزن غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
      end if;
      if not public.in_scope_wh(v_fid) then
        raise exception 'out_of_scope' using hint = (select format('المخزن «%s» خارج نطاقك، فلا تصرف منه.', w.name) from public.warehouses w where w.org_id = v_org and w.id = v_fid);
      end if;
    end loop;
    select array_agg((j.x ->> 'item_id')::uuid order by j.n), array_agg((j.x ->> 'warehouse_id')::uuid order by j.n) into v_items, v_whs
    from jsonb_array_elements(v_jobs) with ordinality as j(x, n);
    perform private.lock_masters(v_whs, v_items, true);
    perform private.lock_balances(v_items, v_whs);
    for v_need in
      select (j.x ->> 'item_id')::uuid as item_id, (j.x ->> 'warehouse_id')::uuid as warehouse_id, sum((j.x ->> 'qty')::numeric) as qty,
        count(distinct j.x ->> 'flock_id')::int as halls
      from jsonb_array_elements(v_jobs) as j(x)
      join public.items i on i.org_id = v_org and i.id = (j.x ->> 'item_id')::uuid and i.archived_at is null and private.flock_cost_kind(i.kind) is not null
      join public.warehouses w on w.org_id = v_org and w.id = (j.x ->> 'warehouse_id')::uuid and w.archived_at is null and private.item_admissible(w.kind, i.kind)
      group by 1, 2 having count(*) > 1
      order by 1, 2
    loop
      select * into s from private.stock_at(v_need.item_id, v_need.warehouse_id, p_on);
      if s.available < v_need.qty then
        raise exception 'insufficient_stock' using hint = (select format('لا يكفي رصيد «%s» في «%s» لكلّ القاعات: مجموع ما طلبته %s %s، وعندك %s بتاريخ %s.',
            i.name, w.name, private.qty_text(v_need.qty, i.base_unit),
            case when v_need.halls = 1 then 'لقاعة واحدة' when v_need.halls = 2 then 'للقاعتين' when v_need.halls <= 10 then format('لـ%s قاعات', v_need.halls)
              else format('لـ%s قاعة', v_need.halls) end,
            private.qty_text(s.available, i.base_unit), to_char(p_on, 'DD/MM/YYYY'))
          from public.items i, public.warehouses w where i.org_id = v_org and i.id = v_need.item_id and w.org_id = v_org and w.id = v_need.warehouse_id);
      end if;
    end loop;
  end if;

  -- ٧) السطور بترتيب الشاشة.
  for a, v_n in select e.x, e.n from jsonb_array_elements(p_lines) with ordinality as e(x, n) loop
    f := private.flock_for((a ->> 'flock_id')::uuid, true);
    if a ->> 'kind' = 'issue' then
      v_res := public.record_flock_issue(private.derived_ref(p_client_ref, v_n), (a ->> 'issue_id')::uuid, (a ->> 'line_id')::uuid, f.id,
        (a ->> 'item_id')::uuid, (a ->> 'qty')::numeric, p_on, (a ->> 'warehouse_id')::uuid);
      v_out_issues := v_out_issues || jsonb_build_object('issue_id', v_res ->> 'id', 'doc_no', v_res ->> 'doc_no', 'flock_id', f.id,
        'hall_name', v_res ->> 'hall_name', 'item_name', v_res ->> 'item_name', 'qty', v_res ->> 'qty', 'base_unit', v_res ->> 'base_unit');
    elsif a ->> 'kind' = 'log' then
      v_name := btrim(a ->> 'name');
      v_dose := nullif(btrim(coalesce(a ->> 'dose', '')), '');
      if v_name = '' then
        raise exception 'name_required' using hint = 'اكتب اسم الدواء.';
      end if;
      if length(v_name) > 80 then
        raise exception 'name_too_long' using hint = format('اسم الدواء %s حرفاً، والحدّ 80 حرفاً. اختصره.', length(v_name));
      end if;
      if v_dose is not null and length(v_dose) > 120 then
        raise exception 'dose_too_long' using hint = format('الجرعة %s حرفاً، والحدّ 120 حرفاً. اختصرها.', length(v_dose));
      end if;
      begin
        insert into public.flock_logs (id, org_id, flock_id, hall_id, site_id, division_id, on_date, kind, name, dose, client_ref)
        values ((a ->> 'id')::uuid, v_org, f.id, f.hall_id, f.site_id, f.division_id, p_on, 'medicine', v_name, v_dose, p_client_ref);
      exception when unique_violation then
        raise exception 'id_conflict' using hint = 'سُجّل هذا الدواء من قبل. حدّث الشاشة لترى ما حُفظ.';
      end;
      v_out_logs := v_out_logs || jsonb_build_object('id', (a ->> 'id')::uuid, 'flock_id', f.id);
    else
      -- اللقاح مقفول منذ الخطوة ٤، فهذه القراءة هي الحالية؛ والموعد في جدول نوع الفوج ولا تأشير حيّ له.
      select * into vc from public.vaccines x where x.org_id = v_org and x.id = (a ->> 'vaccine_id')::uuid;
      if not exists (select 1 from private.flock_slots(f.id) z where z.vaccine_id = vc.id and z.age_day = (a ->> 'age_day')::int) then
        select * into h from public.halls x where x.org_id = v_org and x.id = f.hall_id;
        raise exception 'not_in_program' using hint = format('«%s» في يوم العمر %s ليس في جدول لقاحات «%s» الآن. حدّث الشاشة.', vc.name, a ->> 'age_day', h.name);
      end if;
      v_issue := null;
      v_res := null;
      if vc.item_id is not null then
        v_res := public.record_flock_issue(private.derived_ref(p_client_ref, v_n), (a ->> 'issue_id')::uuid, (a ->> 'line_id')::uuid, f.id,
          vc.item_id, (a ->> 'qty')::numeric, p_on, (a ->> 'warehouse_id')::uuid);
        v_issue := (v_res ->> 'id')::uuid;
      end if;
      begin
        insert into public.flock_vaccinations (id, org_id, flock_id, hall_id, site_id, division_id, vaccine_id, age_day, done_on, issue_id, item_id, client_ref)
        values ((a ->> 'id')::uuid, v_org, f.id, f.hall_id, f.site_id, f.division_id, vc.id, (a ->> 'age_day')::int, p_on, v_issue,
          case when v_issue is not null then vc.item_id end, p_client_ref);
      exception when unique_violation then
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint = 'flock_vaccinations_live' then
          select * into h from public.halls x where x.org_id = v_org and x.id = f.hall_id;
          raise exception 'already_vaccinated' using hint = format('«%s» ليوم العمر %s مؤشَّر «تمّ» لـ«%s» من قبل.', vc.name, a ->> 'age_day', h.name);
        end if;
        raise exception 'id_conflict' using hint = 'سُجّل هذا التأشير أو صرفه من قبل. حدّث الشاشة لترى ما حُفظ.';
      end;
      v_out_vaccinations := v_out_vaccinations || jsonb_build_object('id', (a ->> 'id')::uuid, 'flock_id', f.id, 'vaccine_id', vc.id,
        'age_day', (a ->> 'age_day')::int, 'issue_id', v_issue, 'doc_no', v_res ->> 'doc_no');
    end if;
  end loop;
  v_result := jsonb_build_object('on', p_on, 'issues', v_out_issues, 'logs', v_out_logs, 'vaccinations', v_out_vaccinations);
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;

-- ─── هـ. حذف تسجيل دواء، والتراجع عن تأشير ────────────────────────────────────────────────────────────────────────────

-- تسجيل الدواء بلا مخزن ليس حركة مخزون ولا مال، فيُحذف (وسجلّ التدقيق يحفظه)؛ والمحذوف من جهاز آخر removed=false.
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

-- التأشير غير المربوط يُلغى بفعل الجولة؛ والمربوط بصرف بفعل الإلغاء وسبب إلزاميّ: التأشير أوّلاً ثمّ الصرف بحركات عكسية على دفعاته نفسها
-- (void_flock_issue بمرجع مشتقّ). والملغى من قبل يرجع كما هو. والمربوط يأخذ أقفال صرفه بترتيب void_flock_issue (الفترة ← رأس الصرف ← الفوج ←
-- المخزن والمادّة ← الأرصدة) قبل قفل التأشير (مراجعة 0026 DB-6: كان يقفل التأشير ثمّ ينتظر رصيداً تمسكه إضافة تؤشّر الموعد نفسه فتنتظر التأشير).
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

-- ─── و. قائمة اللقاحات وجدولها ─────────────────────────────────────────────────────────────────────────────────────────

-- لقاح جديد (p_expected_version null، والمعرّف من الجهاز؛ إعادة الإنشاء نفسه ترجّعه) أو تعديل اسمه ومادّته بشرط نسخته. المادّة المربوطة لقاح أو
-- دواء حيّ. الاسم فريد بين الحيّة بالمطابقة المطوية (searchable). اللون أوّل موضع حرّ 0..4 بين الحيّة، وإلّا 5، تحت قفل المنشأة للقائمة.
create or replace function public.save_vaccine(p_id uuid, p_name text, p_item uuid, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_name text := btrim(coalesce(p_name, ''));
  vc public.vaccines;
  i public.items;
  v_color int;
begin
  set local lock_timeout = '5s';
  perform private.require('flock.manage');
  if p_id is null then
    raise exception 'id_required' using hint = 'تعذّر الحفظ دون معرّف اللقاح. حدّث الشاشة وأعد المحاولة.';
  end if;
  if v_name = '' then
    raise exception 'name_required' using hint = 'اكتب اسم اللقاح.';
  end if;
  if length(v_name) > 40 then
    raise exception 'name_too_long' using hint = format('اسم اللقاح %s حرفاً، والحدّ 40 حرفاً. اختصره.', length(v_name));
  end if;
  if p_item is not null then
    select * into i from public.items x where x.org_id = v_org and x.id = p_item for share;
    if i.id is null then
      raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
    end if;
    if i.archived_at is not null then
      raise exception 'item_archived' using hint = format('المادّة «%s» مؤرشفة، فلا يُربط بها لقاح.', i.name);
    end if;
    if i.kind not in ('vaccine', 'medicine') then
      raise exception 'item_not_vaccine' using hint = format('«%s» ليست لقاحاً ولا دواءً، فلا يُربط بها لقاح. اختر مادّة من مخزن الأدوية.', i.name);
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('vaccines:' || v_org::text, 0));
  select * into vc from public.vaccines x where x.id = p_id for update;
  if p_expected_version is null then
    if vc.id is not null then
      if vc.org_id = v_org and vc.archived_at is null and vc.name = v_name and vc.item_id is not distinct from p_item then
        return jsonb_build_object('id', vc.id, 'version', vc.version, 'color', vc.color);
      end if;
      raise exception 'id_conflict' using hint = 'سُجّل لقاح بهذا المعرّف من قبل. حدّث الشاشة لترى ما حُفظ.';
    end if;
    if exists (select 1 from public.vaccines x where x.org_id = v_org and x.archived_at is null and x.name_key = private.searchable(v_name)) then
      raise exception 'name_taken' using hint = format('في القائمة لقاح باسم «%s». اختر اسماً آخر.', v_name);
    end if;
    select coalesce(min(c), 5) into v_color from generate_series(0, 4) as c
    where not exists (select 1 from public.vaccines x where x.org_id = v_org and x.archived_at is null and x.color = c);
    insert into public.vaccines (id, org_id, name, color, item_id) values (p_id, v_org, v_name, v_color, p_item) returning * into vc;
    return jsonb_build_object('id', vc.id, 'version', vc.version, 'color', vc.color);
  end if;
  if vc.id is null or vc.org_id <> v_org or vc.archived_at is not null then
    raise exception 'vaccine_not_found' using hint = 'هذا اللقاح غير موجود في القائمة (ربّما حُذف من جهاز آخر). حدّث الشاشة.';
  end if;
  if vc.version <> p_expected_version then
    raise exception 'stale_vaccine' using hint = format('تغيّر اللقاح «%s» من جهاز آخر. حدّث الشاشة ثمّ عدّله.', vc.name);
  end if;
  if exists (select 1 from public.vaccines x where x.org_id = v_org and x.archived_at is null and x.id <> vc.id and x.name_key = private.searchable(v_name)) then
    raise exception 'name_taken' using hint = format('في القائمة لقاح باسم «%s». اختر اسماً آخر.', v_name);
  end if;
  update public.vaccines x set name = v_name, item_id = p_item, version = x.version + 1, updated_at = now()
  where x.org_id = v_org and x.id = vc.id returning * into vc;
  return jsonb_build_object('id', vc.id, 'version', vc.version, 'color', vc.color);
end
$$;

-- حذف لقاح بشرط نسخته: يخرج من الجدولين (نسختاهما +1)، والمؤشَّر به من قبل يُخفى (أرشفة) وغيره يُمحى. الأقفال: اللقاح ثمّ الجدولان بترتيب النوع،
-- كترتيب save_vaccine_program (اللقاحات ثمّ الجدول).
create or replace function public.delete_vaccine(p_id uuid, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  vc public.vaccines;
  v_kind text;
begin
  set local lock_timeout = '5s';
  perform private.require('flock.manage');
  select * into vc from public.vaccines x where x.org_id = v_org and x.id = p_id for update;
  if vc.id is null or vc.archived_at is not null then
    raise exception 'vaccine_not_found' using hint = 'هذا اللقاح غير موجود في القائمة (ربّما حُذف من جهاز آخر). حدّث الشاشة.';
  end if;
  if vc.version is distinct from p_expected_version then
    raise exception 'stale_vaccine' using hint = format('تغيّر اللقاح «%s» من جهاز آخر. حدّث الشاشة ثمّ احذفه.', vc.name);
  end if;
  for v_kind in select distinct d.kind from public.vaccine_program_days d where d.org_id = v_org and d.vaccine_id = vc.id order by 1 loop
    update public.vaccine_programs p set version = p.version + 1, updated_at = now(), updated_by = auth.uid() where p.org_id = v_org and p.kind = v_kind;
  end loop;
  delete from public.vaccine_program_days d where d.org_id = v_org and d.vaccine_id = vc.id;
  if exists (select 1 from public.flock_vaccinations m where m.org_id = v_org and m.vaccine_id = vc.id) then
    update public.vaccines x set archived_at = now(), version = x.version + 1, updated_at = now() where x.org_id = v_org and x.id = vc.id;
    return jsonb_build_object('id', vc.id, 'result', 'archived');
  end if;
  delete from public.vaccines x where x.org_id = v_org and x.id = vc.id;
  return jsonb_build_object('id', vc.id, 'result', 'deleted');
end
$$;

-- الجدول كلّه لنوع بنهايته وأيّامه، بشرط النسخة التي قرأتها الشاشة (0 = لا جدول بعد). اللقاحات المذكورة تُقفل للمشاركة بترتيبها قبل الجدول.
create or replace function public.save_vaccine_program(p_kind text, p_end_age int, p_days jsonb, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  a jsonb;
  vc record;
  p public.vaccine_programs;
  v_bad record;
  v_count int;
begin
  set local lock_timeout = '5s';
  perform private.require('flock.manage');
  if p_kind is null or p_kind not in ('broiler', 'layer') then
    raise exception 'bad_kind' using hint = 'نوع الجدول إمّا لحم أو بيّاض.';
  end if;
  if p_end_age is null or p_end_age not between 1 and 1000 then
    raise exception 'bad_end_age' using hint = 'نهاية الدورة عدد أيّام من 1 إلى 1,000.';
  end if;
  if p_days is null or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) > 2000 then
    raise exception 'bad_day' using hint = 'أيّام الجدول بشكل غير صالح. حدّث الشاشة وأعد المحاولة.';
  end if;
  for a in select e.x from jsonb_array_elements(p_days) as e(x) loop
    if jsonb_typeof(a) <> 'object' or coalesce(a ->> 'vaccine_id', '') !~ v_uuid or jsonb_typeof(a -> 'age_day') is distinct from 'number'
        or (a ->> 'age_day') !~ '^[0-9]{1,4}$' then
      raise exception 'bad_day' using hint = 'يوم في الجدول بشكل غير صالح. حدّث الشاشة وأعد المحاولة.';
    end if;
  end loop;
  -- النسخة أوّلاً بلا قفل (وتُعاد تحت قفل الجدول أدناه): جدول تغيّر من جهاز آخر، ومنه حذف لقاح فيه، يُقال stale_program قبل أيّ فحص للّقاحات، فتقرأ
  -- الشاشة الجدول من جديد وتقارن (مراجعة 0026 F: كان vaccine_not_found أو vaccine_archived فيعلق المحرّر).
  if coalesce((select x.version from public.vaccine_programs x where x.org_id = v_org and x.kind = p_kind), 0) is distinct from p_expected_version then
    raise exception 'stale_program' using hint = 'تغيّر جدول اللقاحات من جهاز آخر. حدّث الشاشة وقارن، فإن كان التعديل منك فقد حُفظ.';
  end if;
  -- اللقاحات بترتيب معرّفاتها للمشاركة: الحذف والتعديل من جهاز آخر ينتظر أو يُرى.
  for vc in
    select x.id, x.name, x.archived_at from public.vaccines x
    where x.org_id = v_org and x.id in (select distinct (e.x ->> 'vaccine_id')::uuid from jsonb_array_elements(p_days) as e(x))
    order by x.id for share
  loop
    if vc.archived_at is not null then
      raise exception 'vaccine_archived' using hint = format('اللقاح «%s» حُذف من القائمة. حدّث الشاشة.', vc.name);
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_days) as e(x)
      where not exists (select 1 from public.vaccines x where x.org_id = v_org and x.id = (e.x ->> 'vaccine_id')::uuid)) then
    raise exception 'vaccine_not_found' using hint = 'في الجدول لقاح غير موجود في القائمة. حدّث الشاشة.';
  end if;
  select x.name, (e.x ->> 'age_day')::int as age_day into v_bad from jsonb_array_elements(p_days) as e(x)
  join public.vaccines x on x.org_id = v_org and x.id = (e.x ->> 'vaccine_id')::uuid
  where (e.x ->> 'age_day')::int not between 1 and p_end_age order by 2, 1 limit 1;
  if v_bad.name is not null then
    raise exception 'bad_day' using hint = format('«%s» في يوم العمر %s، ونهاية الدورة %s يوماً. قدّم الموعد أو مدّ نهاية الدورة.', v_bad.name, v_bad.age_day, p_end_age);
  end if;
  select x.name, (e.x ->> 'age_day')::int as age_day into v_bad from jsonb_array_elements(p_days) as e(x)
  join public.vaccines x on x.org_id = v_org and x.id = (e.x ->> 'vaccine_id')::uuid
  group by x.name, x.id, (e.x ->> 'age_day')::int having count(*) > 1 order by 2, 1 limit 1;
  if v_bad.name is not null then
    raise exception 'duplicate_day' using hint = format('«%s» مكتوب في يوم العمر %s مرّتين.', v_bad.name, v_bad.age_day);
  end if;
  select * into p from public.vaccine_programs x where x.org_id = v_org and x.kind = p_kind for update;
  if p.kind is null then
    if p_expected_version is distinct from 0 then
      raise exception 'stale_program' using hint = 'تغيّر جدول اللقاحات من جهاز آخر. حدّث الشاشة وقارن، فإن كان التعديل منك فقد حُفظ.';
    end if;
    begin
      insert into public.vaccine_programs (org_id, kind, end_age) values (v_org, p_kind, p_end_age) returning * into p;
    exception when unique_violation then
      raise exception 'stale_program' using hint = 'حُفظ جدول اللقاحات من جهاز آخر الآن. حدّث الشاشة وقارن.';
    end;
  else
    if p.version is distinct from p_expected_version then
      raise exception 'stale_program' using hint = 'تغيّر جدول اللقاحات من جهاز آخر. حدّث الشاشة وقارن، فإن كان التعديل منك فقد حُفظ.';
    end if;
    update public.vaccine_programs x set end_age = p_end_age, version = x.version + 1, updated_at = now(), updated_by = auth.uid()
    where x.org_id = v_org and x.kind = p_kind returning * into p;
  end if;
  delete from public.vaccine_program_days d where d.org_id = v_org and d.kind = p_kind;
  insert into public.vaccine_program_days (org_id, kind, vaccine_id, age_day)
  select v_org, p_kind, (e.x ->> 'vaccine_id')::uuid, (e.x ->> 'age_day')::int from jsonb_array_elements(p_days) as e(x);
  get diagnostics v_count = row_count;
  return jsonb_build_object('kind', p.kind, 'version', p.version, 'end_age', p.end_age, 'days', v_count);
end
$$;

-- ─── ز. القرّاء ───────────────────────────────────────────────────────────────────────────────────────────────────────

-- قائمة اللقاحات وجدولا النوعين وموادّ الربط (اللقاح والدواء الحيّة)، لكلّ قارئ؛ والتعديل لمن يدير الحقول.
create or replace function public.vaccine_board() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
begin
  perform private.require('read');
  return jsonb_build_object(
    'today', public.app_today(),
    'can_edit', public.can('flock.manage'),
    'has_halls', jsonb_build_object(
      'broiler', exists (select 1 from public.halls h join public.divisions d on d.org_id = h.org_id and d.id = h.division_id
        where h.org_id = v_org and h.archived_at is null and d.kind = 'broiler'),
      'layer', exists (select 1 from public.halls h join public.divisions d on d.org_id = h.org_id and d.id = h.division_id
        where h.org_id = v_org and h.archived_at is null and d.kind = 'layer')),
    'vaccines', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'color', x.color, 'version', x.version,
        'in_use', exists (select 1 from public.flock_vaccinations m where m.org_id = x.org_id and m.vaccine_id = x.id),
        'item', (select jsonb_build_object('id', i.id, 'name', i.name, 'base_unit', i.base_unit) from public.items i where i.org_id = x.org_id and i.id = x.item_id))
        order by x.name_key collate "C", x.id)
      from public.vaccines x where x.org_id = v_org and x.archived_at is null), '[]'::jsonb),
    'programs', (select jsonb_object_agg(k.kind, jsonb_build_object('version', coalesce(p.version, 0), 'end_age', p.end_age,
        'days', coalesce((select jsonb_agg(jsonb_build_object('vaccine_id', d.vaccine_id, 'age_day', d.age_day) order by d.age_day, x.name_key collate "C", x.id)
          from public.vaccine_program_days d join public.vaccines x on x.org_id = d.org_id and x.id = d.vaccine_id
          where d.org_id = v_org and d.kind = k.kind), '[]'::jsonb)))
      from (values ('broiler'), ('layer')) as k(kind)
      left join public.vaccine_programs p on p.org_id = v_org and p.kind = k.kind),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'kind', i.kind, 'base_unit', i.base_unit) order by i.name_norm collate "C", i.id)
      from public.items i where i.org_id = v_org and i.archived_at is null and i.kind in ('vaccine', 'medicine')), '[]'::jsonb));
end
$$;

-- مواعيد اللقاحات غير المؤشَّرة لأفواج القارئ القائمة، من 7 أيام مضت (ما زال التأشير ممكناً) حتى 3 أيام قادمة.
create or replace function public.vaccine_reminders() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
begin
  perform private.require('read');
  return jsonb_build_object('today', v_today, 'can_mark', public.can('flock_day.save'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('flock_id', f.id, 'hall_id', h.id, 'hall_name', h.name, 'site_name', s.name, 'kind', f.kind,
        'vaccine_id', x.id, 'name', x.name, 'color', x.color, 'age_day', z.age_day, 'due_on', z.due_on,
        'when', case when z.due_on < v_today then 'overdue' when z.due_on = v_today then 'today' when z.due_on = v_today + 1 then 'tomorrow' else 'soon' end,
        'linked', x.item_id is not null,
        'item', (select jsonb_build_object('id', i.id, 'name', i.name, 'base_unit', i.base_unit) from public.items i where i.org_id = x.org_id and i.id = x.item_id))
        order by z.due_on, h.name collate "C", x.name_key collate "C", f.id, x.id)
      from public.flocks f
      join public.halls h on h.org_id = f.org_id and h.id = f.hall_id
      join public.sites s on s.org_id = f.org_id and s.id = f.site_id
      cross join lateral private.flock_slots(f.id) as z
      join public.vaccines x on x.org_id = f.org_id and x.id = z.vaccine_id and x.archived_at is null
      where f.org_id = v_org and f.status = 'active' and public.in_scope_site(f.site_id)
        and z.due_on between v_today - 7 and v_today + 3
        and not exists (select 1 from public.flock_vaccinations m where m.org_id = f.org_id and m.flock_id = f.id and m.vaccine_id = x.id
          and m.age_day = z.age_day and m.status = 'done')), '[]'::jsonb));
end
$$;

-- تقويم القاعة لشهر (أيّ يوم منه): كلّ أيّام الشهر بعمر الطيور وأرقام الجولة والعلف النازل والأدوية واللقاحات، بلا مال.
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

-- تقرير الدورة: الطيور، وكلّ علف نزل بتاريخه وتراكمه ومجموعه لكلّ مادّة والمصروف والمستهلك والباقي، والأدوية (صرفاً وتسجيلاً)، واللقاحات
-- (المخطّط والمنفَّذ)، والمال لأدوار الكلفة وحدها (private.mask).
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
      from public.flock_costs c where c.org_id = f.org_id and c.flock_id = f.id)));
end
$$;

-- ─── ح. الثوابت ──────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.verify_halls() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  -- ١) التسجيل والتأشير في مكان فوجهما (القاعة والحقل والوحدة).
  select 'record_place', count(*) from (
    select o.flock_id, o.hall_id, o.site_id, o.division_id from public.flock_logs o
    union all
    select m.flock_id, m.hall_id, m.site_id, m.division_id from public.flock_vaccinations m) as r
  join public.flocks f on f.id = r.flock_id
  where (f.hall_id, f.site_id, f.division_id) is distinct from (r.hall_id, r.site_id, r.division_id)
  -- ٢) التأشير الحيّ المصروف: صرفه مرحَّل لفوجه بمادّته؛ والملغى المصروف: صرفه ملغى.
  union all
  select 'vaccination_issue', count(*) from public.flock_vaccinations m
  left join public.flock_issues x on x.org_id = m.org_id and x.id = m.issue_id
  where m.issue_id is not null and (x.id is null or x.flock_id <> m.flock_id
    or (m.status = 'done' and x.status <> 'posted') or (m.status = 'void' and x.status <> 'void')
    or not exists (select 1 from public.flock_issue_lines l where l.org_id = x.org_id and l.issue_id = x.id and l.item_id = m.item_id))
  -- ٣) التأشير والتسجيل لا يسبقان التسكين ولا يتجاوزان الإغلاق.
  union all
  select 'record_dates', count(*) from (
    select o.flock_id, o.on_date from public.flock_logs o
    union all
    select m.flock_id, m.done_on from public.flock_vaccinations m where m.status = 'done') as r
  join public.flocks f on f.id = r.flock_id
  where f.placed_on is null or r.on_date < f.placed_on or (f.closed_on is not null and r.on_date > f.closed_on)
  -- ٤) صرف واحد لتأشير واحد (مراجعة 0026 DB-3).
  union all
  select 'issue_once', count(*) from (select m.issue_id from public.flock_vaccinations m where m.issue_id is not null group by m.org_id, m.issue_id having count(*) > 1) as d
  -- ٥) أيّام الجدول ضمن نهاية دورته، ولقاحاتها حيّة.
  union all
  select 'program_days', count(*) from public.vaccine_program_days d
  join public.vaccine_programs p on p.org_id = d.org_id and p.kind = d.kind
  join public.vaccines x on x.org_id = d.org_id and x.id = d.vaccine_id
  where d.age_day > p.end_age or x.archived_at is not null
$$;

-- ─── ط. الصلاحيات ──────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function private.derived_ref(uuid, int), private.flock_for(uuid, boolean), private.flock_slots(uuid), private.hall_flock_json(public.flocks),
  private.flock_issue_vaccination_guard() from public, anon, authenticated;
revoke all on function public.give_to_flocks(uuid, date, jsonb), public.remove_flock_log(uuid), public.undo_vaccination(uuid, text, uuid),
  public.save_vaccine(uuid, text, uuid, int), public.delete_vaccine(uuid, int), public.save_vaccine_program(text, int, jsonb, int),
  public.vaccine_board(), public.vaccine_reminders(), public.flock_month(uuid, date), public.flock_cycle_report(uuid), public.verify_halls() from public, anon;
grant execute on function public.give_to_flocks(uuid, date, jsonb), public.remove_flock_log(uuid), public.undo_vaccination(uuid, text, uuid),
  public.save_vaccine(uuid, text, uuid, int), public.delete_vaccine(uuid, int), public.save_vaccine_program(text, int, jsonb, int),
  public.vaccine_board(), public.vaccine_reminders(), public.flock_month(uuid, date), public.flock_cycle_report(uuid) to authenticated;
revoke all on function public.verify_halls() from authenticated;
grant execute on function public.verify_halls() to service_role;
