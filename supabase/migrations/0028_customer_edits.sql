-- 0028_customer_edits — «كلّ خطوة فيها تعديل»: أوّل ملاحظات الزبون بعد العرض (رسائل صوتية وأربع صور، 2026-11-15؛ DECISIONS «ملاحظات الزبون الأولى»).
-- المشكلة: (١) فوج سُكّن بتاريخ غلط ولا طريق لتعديله ولا لحذفه («غلطت بالتاريخ… ما قاعد اقدر اعدلها… اريد احذفها واريد اعيدها»)، وزرّ
--   «عدّل» في جدول القاعات يعدّل القاعة وحدها؛ (٢) جدول لقاحات واحد لكلّ نوع يسري على كلّ قاعاته، والزبون يريد جدولاً لكلّ قاعة («المفروض كل
--   قاعة… لازم كل قاعة واحد»)؛ (٣) تعديل الخلطة نسخة مسوّدة تُفعَّل بزرّ ثانٍ، فلم يصل إليه («تدوس عليها وتعدلها وليس تتعدل، لازم افعلها جديدة»).
-- هنا:
--   • public.edit_flock: تاريخ التسكين وعدده والعمر عنده والسلالة لفوج قائم، بشرط نسخته وبقواعد open_flock (لا مستقبل ولا فترة مقفلة، قديمة أو جديدة)،
--     ولا يصير التسكين بعد أوّل سجلّ للفوج (الجولة والوزن والصرف والكلفة والدواء والتأشير، كثوابت verify_flocks وverify_flock_issues وverify_halls)
--     ولا العدد أقلّ من النافق والمستبعد؛ وpublic.delete_flock: فوج فُتح غلطاً بلا أيّ سجلّ يُحذف (ليس حركة مخزون ولا مال، وسجلّ التدقيق يحفظه)،
--     وله سجلّ يُرفض بجملة تسمّيه وتدلّ على «عدّل الفوج». كلاهما flock.manage بنطاق الحقل، ويُعاد بأمان بالمرجع.
--   • hall_vaccine_programs وhall_vaccine_program_days: جدول خاصّ لقاعة يحلّ محلّ جدول نوعها كلّه في كلّ قارئ وكاتب، من تعريفين واحدين
--     (private.flock_slots للمواعيد وprivate.hall_flock_json لنهاية الدورة: التذكير والتقويم وتقرير الدورة وتأشير «تمّ» في give_to_flocks)؛
--     وsave_hall_vaccine_program وdrop_hall_vaccine_program بشرط النسخة (كجدول النوع)؛ وvaccine_board يزيد halls؛ وdelete_vaccine يُخرج اللقاح من
--     جداول القاعات أيضاً؛ وgive_to_flocks يقفل جداول قاعات أفواج التأشير للمشاركة بعد جداول الأنواع (مراجعة 0026 DB-5)؛ وverify_halls يفحص أيّامها.
--   • public.edit_recipe: «احفظ التعديل» بنداء واحد ومعاملة واحدة: الاسم والموادّ بترتيبها بلا كميات ثمّ التفعيل (مسوّدة قائمة تُستعمل وتُستبدل
--     موادّها وتبقى معدّلاتها، وإلّا نسخة جديدة بمعدّلات المفعَّلة)، بشرط النسخة المفعَّلة التي رأتها الشاشة؛ وبلا تغيير لا نسخة جديدة.
-- انحرافات مكتوبة بلا سؤال (DECISIONS): الجدول الخاصّ للقاعة لا للفوج (كلمة الزبون «كل قاعة»)، ويبقى لدوراتها التالية حتى يُحذف؛ وتعديل التسكين
--   لا يغيّر يوم التأشيرات السابقة ولا يوم عمرها (التأشير يحفظ موعده)؛ وحذف الفوج للخالي من كلّ سجلّ وحده.
-- تراجع: rollback_0028.sql — يُسقط الدوالّ الخمس الجديدة والجدولين، ويرجّع أجسام الستّ (private.flock_slots وprivate.hall_flock_json وvaccine_board
--   وdelete_vaccine وgive_to_flocks وverify_halls) كما في 0026 حرفاً بحرف. **طريق رفض**: جدول لقاحات لقاعة، أو سجلّ تدقيق منه بلا جدول باقٍ،
--   يوقف التراجع بصوت بلا أن يغيّر شيئاً. والأفواج المعدَّلة أو المحذوفة والخلطات المعدَّلة تبقى كما هي (صالحة بقواعد 0027).
-- تنعاد بأمان: create table if not exists، وcreate index if not exists، وكتل do تفحص الكتالوج قبل السياسات، وcreate or replace.

set lock_timeout = '5s';

-- ─── أ. جدول لقاحات القاعة ─────────────────────────────────────────────────────────────────────────────────────────
-- جدول واحد لكلّ قاعة على الأكثر، ونوعه نوع وحدة حقلها (يكتبه الكاتب، وverify_halls يفحصه)؛ وأيّامه من قائمة اللقاحات الواحدة للمنشأة. يُقرأ
-- للمنشأة كلّها كجدول النوع (إعداد لا سجلّ عمل)، والكتابة دالّة وحدها.
create table if not exists public.hall_vaccine_programs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  hall_id uuid not null,
  kind text not null,
  end_age int not null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint hall_vaccine_programs_kind_check check (kind in ('broiler', 'layer')),
  constraint hall_vaccine_programs_end_age_check check (end_age between 1 and 1000),
  constraint hall_vaccine_programs_version_check check (version >= 1),
  unique (org_id, id),
  unique (org_id, hall_id),
  foreign key (org_id, hall_id) references public.halls (org_id, id)
);

create table if not exists public.hall_vaccine_program_days (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  hall_id uuid not null,
  vaccine_id uuid not null,
  age_day int not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint hall_vaccine_program_days_age_check check (age_day between 1 and 1000),
  unique (org_id, id),
  unique (org_id, hall_id, vaccine_id, age_day),
  foreign key (org_id, hall_id) references public.hall_vaccine_programs (org_id, hall_id),
  foreign key (org_id, vaccine_id) references public.vaccines (org_id, id)
);
create index if not exists hall_vaccine_program_days_vaccine on public.hall_vaccine_program_days (org_id, vaccine_id);

do $$
declare
  t text;
begin
  foreach t in array array['hall_vaccine_programs', 'hall_vaccine_program_days'] loop
    execute format('create or replace trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()', 'audit_' || t, t);
  end loop;
end
$$;

alter table public.hall_vaccine_programs enable row level security;
alter table public.hall_vaccine_program_days enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hall_vaccine_programs' and policyname = 'hall_vaccine_programs_read') then
    create policy hall_vaccine_programs_read on public.hall_vaccine_programs for select to authenticated using (org_id = (select public.auth_org()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hall_vaccine_program_days' and policyname = 'hall_vaccine_program_days_read') then
    create policy hall_vaccine_program_days_read on public.hall_vaccine_program_days for select to authenticated using (org_id = (select public.auth_org()));
  end if;
end
$$;

revoke all on table public.hall_vaccine_programs, public.hall_vaccine_program_days from anon, authenticated;
grant select on table public.hall_vaccine_programs, public.hall_vaccine_program_days to authenticated;
revoke truncate on table public.hall_vaccine_programs, public.hall_vaccine_program_days from service_role;

-- ─── ب. مواعيد الفوج ونهاية دورته: جدول قاعته إن كان لها، وإلّا جدول نوعها ─────────────────────────────────────────────────
-- private.flock_slots (0026) على جسمها، والأيّام من جدول القاعة الخاصّ كلّه إن وُجد (ولو بلا أيّام: جدولها فارغ)، وإلّا من جدول النوع كما كانت.
-- كلّ قارئ وكاتب يمرّ بها (التذكير والتقويم وتقرير الدورة وتقارير 0027 وفحص not_in_program في give_to_flocks)، فلا تعريف ثانٍ للموعد.
create or replace function private.flock_slots(p_flock uuid) returns table (vaccine_id uuid, age_day int, due_on date)
language sql stable security definer set search_path = public, pg_temp as $$
  select d.vaccine_id, d.age_day, f.placed_on + (d.age_day - f.age_days_at_placement)
  from public.flocks f
  join public.vaccine_program_days d on d.org_id = f.org_id and d.kind = f.kind
  where f.org_id = public.auth_org() and f.id = p_flock and f.placed_on is not null
    and not exists (select 1 from public.hall_vaccine_programs hp where hp.org_id = f.org_id and hp.hall_id = f.hall_id)
    and d.age_day >= f.age_days_at_placement
    and (f.closed_on is null or f.placed_on + (d.age_day - f.age_days_at_placement) <= f.closed_on)
  union all
  select d.vaccine_id, d.age_day, f.placed_on + (d.age_day - f.age_days_at_placement)
  from public.flocks f
  join public.hall_vaccine_program_days d on d.org_id = f.org_id and d.hall_id = f.hall_id
  where f.org_id = public.auth_org() and f.id = p_flock and f.placed_on is not null
    and d.age_day >= f.age_days_at_placement
    and (f.closed_on is null or f.placed_on + (d.age_day - f.age_days_at_placement) <= f.closed_on)
$$;

-- رأس الفوج للقارئين (0026) على جسمه، ونهاية الدورة من جدول القاعة الخاصّ إن وُجد، وإلّا من جدول نوعها كما كانت.
create or replace function private.hall_flock_json(f public.flocks) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', f.id, 'hall_id', f.hall_id, 'hall_name', h.name, 'site_name', s.name, 'kind', f.kind, 'status', f.status,
    'placed_on', f.placed_on, 'age0', f.age_days_at_placement, 'placed_count', f.placed_count, 'closed_on', f.closed_on,
    'end_age', coalesce(hp.end_age, p.end_age),
    'end_on', case when coalesce(hp.end_age, p.end_age) is not null then f.placed_on + (coalesce(hp.end_age, p.end_age) - f.age_days_at_placement) end)
  from public.halls h
  join public.sites s on s.org_id = h.org_id and s.id = h.site_id
  left join public.hall_vaccine_programs hp on hp.org_id = f.org_id and hp.hall_id = f.hall_id
  left join public.vaccine_programs p on p.org_id = f.org_id and p.kind = f.kind
  where h.org_id = f.org_id and h.id = f.hall_id
$$;


-- ─── ج. لوحة اللقاحات وحذف اللقاح ────────────────────────────────────────────────────────────────────────────────────
-- vaccine_board (0026) على جسمه، ويزيد halls: كلّ قاعة حيّة في حقل لحم أو بيض بنطاق القارئ (الحقل ثمّ اسم القاعة)، وجدولها الخاصّ بنسخته ونهايته
-- وأيّامه (بيوم العمر ثمّ اسم اللقاح كجدول النوع)، أو null حين تتبع جدول نوعها.
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
    'halls', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name, 'site_name', s.name, 'kind', dv.kind,
        'program', case when hp.id is null then null else jsonb_build_object('version', hp.version, 'end_age', hp.end_age,
          'days', coalesce((select jsonb_agg(jsonb_build_object('vaccine_id', d.vaccine_id, 'age_day', d.age_day) order by d.age_day, x.name_key collate "C", x.id)
            from public.hall_vaccine_program_days d join public.vaccines x on x.org_id = d.org_id and x.id = d.vaccine_id
            where d.org_id = v_org and d.hall_id = h.id), '[]'::jsonb)) end)
        order by s.name collate "C", h.name collate "C", h.id)
      from public.halls h
      join public.sites s on s.org_id = h.org_id and s.id = h.site_id
      join public.divisions dv on dv.org_id = h.org_id and dv.id = h.division_id
      left join public.hall_vaccine_programs hp on hp.org_id = h.org_id and hp.hall_id = h.id
      where h.org_id = v_org and h.archived_at is null and dv.kind in ('broiler', 'layer') and public.in_scope_site(h.site_id)), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'kind', i.kind, 'base_unit', i.base_unit) order by i.name_norm collate "C", i.id)
      from public.items i where i.org_id = v_org and i.archived_at is null and i.kind in ('vaccine', 'medicine')), '[]'::jsonb));
end
$$;

-- حذف لقاح (0026) على جسمه: يخرج من جدولي النوعين ومن جداول القاعات أيضاً (نسخة كلّ جدول فيه +1)، والمؤشَّر به يُخفى وغيره يُمحى. الأقفال: اللقاح ثمّ
-- جداول الأنواع بترتيب النوع ثمّ جداول القاعات بترتيب القاعة (كترتيب save_vaccine_program وsave_hall_vaccine_program: اللقاحات ثمّ الجدول).
create or replace function public.delete_vaccine(p_id uuid, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  vc public.vaccines;
  v_kind text;
  v_hall uuid;
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
  for v_hall in select distinct d.hall_id from public.hall_vaccine_program_days d where d.org_id = v_org and d.vaccine_id = vc.id order by 1 loop
    update public.hall_vaccine_programs p set version = p.version + 1, updated_at = now(), updated_by = auth.uid() where p.org_id = v_org and p.hall_id = v_hall;
  end loop;
  delete from public.hall_vaccine_program_days d where d.org_id = v_org and d.vaccine_id = vc.id;
  if exists (select 1 from public.flock_vaccinations m where m.org_id = v_org and m.vaccine_id = vc.id) then
    update public.vaccines x set archived_at = now(), version = x.version + 1, updated_at = now() where x.org_id = v_org and x.id = vc.id;
    return jsonb_build_object('id', vc.id, 'result', 'archived');
  end if;
  delete from public.vaccines x where x.org_id = v_org and x.id = vc.id;
  return jsonb_build_object('id', vc.id, 'result', 'deleted');
end
$$;


-- ─── د. الإضافة للقاعات (0026) على جسمها حرفاً، وقفل جداول القاعات ─────────────────────────────────────────────────────────
-- التأشير يُفحص بـflock_slots (جدول القاعة الخاصّ إن وُجد)، فجداول قاعات أفواج التأشير تُقفل للمشاركة بعد جداول الأنواع وبترتيب القاعة، فحفظ جدول قاعة
-- أو حذفه من جهاز آخر ينتظر الإضافة أو تراه (مراجعة 0026 DB-5). الترتيب كلّه: الفترة ← الأفواج ← اللقاحات ← جداول الأنواع ← جداول القاعات ← المخزن والمادّة
-- ← الأرصدة؛ وsave_hall_vaccine_program وdrop_hall_vaccine_program وdelete_vaccine لا تأخذ قفلاً قبله يخالفه.
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
    -- 0028: وجداول قاعات أفواج التأشير الخاصّة بترتيب القاعة (جدول القاعة يحلّ محلّ جدول نوعها في flock_slots)، للمشاركة كجداول الأنواع.
    perform 1 from public.hall_vaccine_programs p where p.org_id = v_org
      and p.hall_id in (select f2.hall_id from jsonb_array_elements(p_lines) as e(x) join public.flocks f2 on f2.org_id = v_org and f2.id = (e.x ->> 'flock_id')::uuid
        where e.x ->> 'kind' = 'vaccination')
      order by p.hall_id for share;
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


-- ─── هـ. جدول القاعة الخاصّ: حفظه وحذفه ────────────────────────────────────────────────────────────────────────────────
-- الجدول كلّه لقاعة بنهايته وأيّامه، بشرط النسخة التي قرأتها الشاشة (0 = لا جدول خاصّ بعد: يُنشأ)، بقواعد save_vaccine_program نفسها: النسخة أوّلاً
-- بلا قفل (stale_program قبل فحص اللقاحات، مراجعة 0026 F)، ثمّ اللقاحات للمشاركة بترتيب معرّفاتها، ثمّ الجدول للتحديث. القاعة حيّة بنطاق الكاتب،
-- ونوع الجدول نوع وحدة حقلها.
create or replace function public.save_hall_vaccine_program(p_hall uuid, p_end_age int, p_days jsonb, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  a jsonb;
  vc record;
  h public.halls;
  v_kind text;
  p public.hall_vaccine_programs;
  v_bad record;
  v_count int;
begin
  set local lock_timeout = '5s';
  perform private.require('flock.manage');
  select * into h from public.halls x where x.org_id = v_org and x.id = p_hall;
  if h.id is null then
    raise exception 'hall_not_found' using hint = 'هذه القاعة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(h.site_id) then
    raise exception 'out_of_scope' using hint = 'هذه القاعة خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  if h.archived_at is not null then
    raise exception 'hall_archived' using hint = format('القاعة «%s» مؤرشفة، فلا يُكتب لها جدول لقاحات. أعِدها من الأرشيف أوّلاً.', h.name);
  end if;
  select d.kind into v_kind from public.divisions d where d.org_id = h.org_id and d.id = h.division_id;
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
  if coalesce((select x.version from public.hall_vaccine_programs x where x.org_id = v_org and x.hall_id = h.id), 0) is distinct from p_expected_version then
    raise exception 'stale_program' using hint = format('تغيّر جدول لقاحات «%s» من جهاز آخر. حدّث الشاشة وقارن، فإن كان التعديل منك فقد حُفظ.', h.name);
  end if;
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
  select * into p from public.hall_vaccine_programs x where x.org_id = v_org and x.hall_id = h.id for update;
  if p.id is null then
    if p_expected_version is distinct from 0 then
      raise exception 'stale_program' using hint = format('حُذف جدول «%s» الخاصّ من جهاز آخر. حدّث الشاشة وقارن.', h.name);
    end if;
    begin
      insert into public.hall_vaccine_programs (org_id, hall_id, kind, end_age) values (v_org, h.id, v_kind, p_end_age) returning * into p;
    exception when unique_violation then
      raise exception 'stale_program' using hint = format('حُفظ جدول خاصّ لـ«%s» من جهاز آخر الآن. حدّث الشاشة وقارن.', h.name);
    end;
  else
    if p.version is distinct from p_expected_version then
      raise exception 'stale_program' using hint = format('تغيّر جدول لقاحات «%s» من جهاز آخر. حدّث الشاشة وقارن، فإن كان التعديل منك فقد حُفظ.', h.name);
    end if;
    update public.hall_vaccine_programs x set end_age = p_end_age, version = x.version + 1, updated_at = now(), updated_by = auth.uid()
    where x.org_id = v_org and x.id = p.id returning * into p;
  end if;
  delete from public.hall_vaccine_program_days d where d.org_id = v_org and d.hall_id = h.id;
  insert into public.hall_vaccine_program_days (org_id, hall_id, vaccine_id, age_day)
  select v_org, h.id, (e.x ->> 'vaccine_id')::uuid, (e.x ->> 'age_day')::int from jsonb_array_elements(p_days) as e(x);
  get diagnostics v_count = row_count;
  return jsonb_build_object('hall_id', h.id, 'kind', p.kind, 'version', p.version, 'end_age', p.end_age, 'days', v_count);
end
$$;

-- حذف جدول القاعة الخاصّ بشرط نسخته: القاعة تعود إلى جدول نوعها. ولا جدول خاصّ (حُذف من جهاز آخر، أو إعادة بعد جواب ضاع) dropped = false بلا خطأ.
create or replace function public.drop_hall_vaccine_program(p_hall uuid, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  h public.halls;
  p public.hall_vaccine_programs;
begin
  set local lock_timeout = '5s';
  perform private.require('flock.manage');
  select * into h from public.halls x where x.org_id = v_org and x.id = p_hall;
  if h.id is null then
    raise exception 'hall_not_found' using hint = 'هذه القاعة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(h.site_id) then
    raise exception 'out_of_scope' using hint = 'هذه القاعة خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  select * into p from public.hall_vaccine_programs x where x.org_id = v_org and x.hall_id = h.id for update;
  if p.id is null then
    return jsonb_build_object('hall_id', h.id, 'dropped', false);
  end if;
  if p.version is distinct from p_expected_version then
    raise exception 'stale_program' using hint = format('تغيّر جدول لقاحات «%s» من جهاز آخر. حدّث الشاشة وقارن قبل حذفه.', h.name);
  end if;
  delete from public.hall_vaccine_program_days d where d.org_id = v_org and d.hall_id = h.id;
  delete from public.hall_vaccine_programs x where x.org_id = v_org and x.id = p.id;
  return jsonb_build_object('hall_id', h.id, 'dropped', true);
end
$$;


-- ─── و. تعديل الفوج وحذف المفتوح غلطاً ─────────────────────────────────────────────────────────────────────────────────
-- تعديل الفوج (كلمة الزبون 2026-11-15: «اندخلت وجبة تمام غلطت بالتاريخ… ما قاعد اقدر اعدلها»): تاريخ التسكين والعدد والعمر عنده والسلالة لفوج قائم
-- بشرط نسخته. الترتيب كـopen_flock: المرجع، ثمّ الفعل، ثمّ قفل الفترة للمشاركة، ثمّ صفّ الفوج للتحديث (كلّ كاتب لأيّام الفوج يقفله أوّلاً، فلا
-- تُحفظ جولة بين الفحص والتعديل)، ثمّ الفحوص كلّها بعد أقفالها. قواعد الإدخال قواعد open_flock، والفترة المقفلة تمنع تاريخاً قديماً أو جديداً
-- داخلها؛ والتسكين لا يصير بعد أوّل سجلّ للفوج بكلّ أنواعه كما تفحصها الثوابت (الجولة والوزن وكلّ صرف ولو ملغى وكلفته والدواء والتأشير الحيّ)،
-- ولا قبل إغلاق دورة سابقة في القاعة؛ والعدد لا يقلّ عن النافق والمستبعد (الحيّ لا يصير سالباً في أيّ يوم: مجموعهما يزيد ولا ينقص).
-- opened_on يتبع التسكين (النسخة الأولى: الفتح هو التسكين، flocks_placed_check). وبلا تغيير لا تزيد النسخة (changed = false).
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
      (select min(x.done_on) from public.flock_vaccinations x where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'done'))
    into v_first;
  if v_first is not null and p_placed_on > v_first then
    raise exception 'records_before_placement' using hint = format('للفوج سجلّ يوم %s (جولة أو صرف أو وزن أو دواء أو لقاح)، فلا يصير التسكين بعده. اختر تاريخاً في %s أو قبله.',
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
  end if;
  v_result := jsonb_build_object('flock_id', f.id, 'version', f.version, 'placed_on', f.placed_on, 'placed_count', f.placed_count,
    'age_days_at_placement', f.age_days_at_placement, 'breed', f.breed, 'changed', v_changed);
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;

-- حذف فوج فُتح غلطاً (كلمة الزبون: «اريد احذفها واريد اعيدها»): الفوج القائم الخالي من كلّ سجلّ (لا جولة ولا مركونة ولا وزن ولا صرف ولا كلفة ولا دواء
-- ولا تأشير) يُحذف بشرط نسخته، وسجلّ التدقيق يحفظه؛ وله سجلّ يُرفض بجملة تسمّي ما له وتدلّ على «عدّل الفوج» (لا حذف لحركة مخزون ولا لسطر مال). والمفتاح
-- الأجنبيّ من جدول لا يعرفه هذا الفحص (جدول يُضاف بعده) يُرفض بالجملة نفسها لا بخطأ خام. والفوج الغائب (حُذف من جهاز آخر) deleted = false.
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
  if cardinality(v_has) > 0 then
    raise exception 'flock_has_records' using hint = format('لفوج «%s» سجلّ (%s)، فلا يُحذف. إن كان التاريخ أو العدد غلطاً فاضغط «عدّل الفوج» وصحّحه.',
      v_hall, array_to_string(v_has, '، '));
  end if;
  begin
    delete from public.flocks x where x.org_id = f.org_id and x.id = f.id;
  exception when foreign_key_violation then
    raise exception 'flock_has_records' using hint = format('لفوج «%s» سجلّ مرتبط به، فلا يُحذف. إن كان التاريخ أو العدد غلطاً فاضغط «عدّل الفوج» وصحّحه.', v_hall);
  end;
  v_result := jsonb_build_object('flock_id', f.id, 'deleted', true);
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;


-- ─── ز. «احفظ التعديل» للخلطة بخطوة واحدة ────────────────────────────────────────────────────────────────────────────────
-- كلمة الزبون 2026-11-15: «اريد اعدل عليهم… لا يخرج لتعديل… تدوس عليها وتعدلها وليس تتعدل، لازم افعلها جديدة». الاسم والموادّ بترتيبها (بلا كميات،
-- 0025) والتفعيل بنداء واحد ومعاملة واحدة، بشرط النسخة المفعَّلة التي رأتها الشاشة (recipe_changed غيرها). المسوّدة القائمة (تعديل قديم لم يُفعَّل)
-- تُستعمل وتُستبدل موادّها وتبقى معدّلاتها، وإلّا نسخة جديدة بمعدّلات المفعَّلة (وإلّا آخر نسخة) كـnew_recipe_version، والتفعيل بـactivate_recipe_version
-- نفسها (الكثافة ومادّة داخل الكتلة واللقطات). والموادّ والاسم كما هي في المفعَّلة وبلا مسوّدة: لا نسخة جديدة (changed = false)، وتغيير الاسم وحده
-- بلا نسخة. حارس سطر الخلطة يفحص كلّ مادّة (حيّة، بالكيلو أو اللتر، غير مكرَّرة) ويكتب وحدتها. ويُعاد بأمان بالمرجع.
create or replace function public.edit_recipe(p_recipe uuid, p_expected_active uuid, p_name text, p_lines jsonb, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'edit_recipe';
  v_cached jsonb;
  v_org uuid := public.auth_org();
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  r public.recipes;
  v public.recipe_versions;
  s public.recipe_versions;
  v_active uuid;
  v_name text;
  a jsonb;
  v_text text;
  v_same boolean;
  v_changed boolean := false;
  v_count int;
  ln record;
  v_result jsonb;
begin
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('recipe', p_recipe, 'expected', p_expected_active, 'name', p_name, 'lines', p_lines));
  if v_cached is not null then
    return v_cached;
  end if;
  set local lock_timeout = '5s';
  perform private.require('recipe.activate');
  v_name := private.check_name(p_name, 80, 'اسم الخلطة');
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'bad_lines' using hint = 'موادّ الخلطة قائمة. حدّث الشاشة وأعد المحاولة.';
  end if;
  if jsonb_array_length(p_lines) = 0 then
    raise exception 'lines_required' using hint = 'اختر مادّة واحدة على الأقلّ للخلطة.';
  end if;
  if jsonb_array_length(p_lines) > 200 then
    raise exception 'too_many_lines' using hint = format('في الخلطة %s مادّة، والحدّ 200 مادّة.', jsonb_array_length(p_lines));
  end if;
  for a in select e.x from jsonb_array_elements(p_lines) as e(x) loop
    if jsonb_typeof(a) <> 'object' or coalesce(a ->> 'item_id', '') !~ v_uuid then
      raise exception 'bad_lines' using hint = 'مادّة في الخلطة بشكل غير صالح. حدّث الشاشة وأعد المحاولة.';
    end if;
  end loop;
  select coalesce(i.name, 'مادّة') into v_text
  from (select lower(e.x ->> 'item_id') as item from jsonb_array_elements(p_lines) as e(x) group by 1 having count(*) > 1 order by 1 limit 1) as d
  left join public.items i on i.org_id = v_org and i.id = d.item::uuid;
  if v_text is not null then
    raise exception 'item_duplicated' using hint = format('«%s» مختارة في الخلطة مرّتين. اتركها مرّة واحدة.', v_text);
  end if;
  select * into r from public.recipes x where x.org_id = v_org and x.id = p_recipe for update;
  if r.id is null then
    raise exception 'recipe_not_found' using hint = 'هذه الخلطة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if r.archived_at is not null then
    raise exception 'recipe_archived' using hint = format('الخلطة «%s» محذوفة من المعمل. أعِدها من صفحتها أوّلاً ثمّ عدّلها.', r.name);
  end if;
  select x.id into v_active from public.recipe_versions x where x.org_id = v_org and x.recipe_id = r.id and x.status = 'active';
  if v_active is distinct from p_expected_active then
    raise exception 'recipe_changed' using hint = format('تغيّرت الخلطة «%s» من جهاز آخر بعد فتح الشاشة. راجع موادّها ثمّ احفظ.', r.name);
  end if;
  if v_name is distinct from r.name then
    if exists (select 1 from public.recipes x where x.org_id = v_org and x.archived_at is null and x.id <> r.id and x.name_norm = private.searchable(v_name)) then
      raise exception 'recipe_name_taken' using hint = format('توجد خلطة باسم «%s». اختر اسماً آخر.', v_name);
    end if;
    update public.recipes x set name = v_name where x.org_id = v_org and x.id = r.id returning * into r;
    v_changed := true;
  end if;
  select * into v from public.recipe_versions x where x.org_id = v_org and x.recipe_id = r.id and x.status = 'draft' for update;
  -- بلا مسوّدة والموادّ كما في المفعَّلة بترتيبها: لا نسخة جديدة.
  v_same := v.id is null and v_active is not null
    and (select coalesce(jsonb_agg(l.item_id::text order by l.line_no), '[]'::jsonb) from public.recipe_lines l where l.org_id = v_org and l.version_id = v_active)
      = (select jsonb_agg(lower(e.x ->> 'item_id') order by e.n) from jsonb_array_elements(p_lines) with ordinality as e(x, n));
  if v_same then
    select * into v from public.recipe_versions x where x.org_id = v_org and x.id = v_active;
  else
    if v.id is null then
      select * into s from public.recipe_versions x where x.org_id = v_org and x.recipe_id = r.id and x.status = 'active';
      if s.id is null then
        select * into s from public.recipe_versions x where x.org_id = v_org and x.recipe_id = r.id order by x.version_no desc limit 1;
      end if;
      select c.name into v_text from public.recipe_cost_rates x join public.expense_categories c on c.org_id = x.org_id and c.id = x.category_id
      where x.org_id = v_org and x.version_id = s.id and c.archived_at is not null order by x.line_no limit 1;
      if v_text is not null then
        raise exception 'category_archived' using hint = format('فئة «%s» في تكاليف الخلطة مؤرشفة، فلا تُنسخ إلى التعديل. أعِدها من الأرشيف أوّلاً.', v_text);
      end if;
      insert into public.recipe_versions (org_id, recipe_id, basis_kg) values (v_org, r.id, null) returning * into v;
      for ln in select x.category_id, x.amount_per_ton from public.recipe_cost_rates x where x.org_id = v_org and x.version_id = s.id order by x.line_no loop
        insert into public.recipe_cost_rates (org_id, version_id, category_id, amount_per_ton) values (v_org, v.id, ln.category_id, ln.amount_per_ton);
      end loop;
    else
      delete from public.recipe_lines l where l.org_id = v_org and l.version_id = v.id;
    end if;
    for a in select e.x from jsonb_array_elements(p_lines) with ordinality as e(x, n) order by e.n loop
      insert into public.recipe_lines (org_id, version_id, item_id, qty, unit) values (v_org, v.id, (a ->> 'item_id')::uuid, null, null);
    end loop;
    perform public.activate_recipe_version(v.id, (select x.version from public.recipe_versions x where x.org_id = v_org and x.id = v.id));
    select * into v from public.recipe_versions x where x.org_id = v_org and x.id = v.id;
    v_changed := true;
  end if;
  select count(*)::int into v_count from public.recipe_lines l where l.org_id = v_org and l.version_id = v.id;
  v_result := jsonb_build_object('recipe_id', r.id, 'version_id', v.id, 'version_no', v.version_no, 'name', r.name, 'lines', v_count, 'changed', v_changed);
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;


-- ─── ح. الثوابت ──────────────────────────────────────────────────────────────────────────────────────────────────────
-- verify_halls (0026) على جسمه حرفاً، ويزيد فحصين لجداول القاعات: أيّامها ضمن نهاية دورتها ولقاحاتها حيّة، ونوع الجدول نوع وحدة حقل قاعته.
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
  -- ٦) أيّام جداول القاعات ضمن نهاية دورتها، ولقاحاتها حيّة (0028).
  union all
  select 'hall_program_days', count(*) from public.hall_vaccine_program_days d
  join public.hall_vaccine_programs p on p.org_id = d.org_id and p.hall_id = d.hall_id
  join public.vaccines x on x.org_id = d.org_id and x.id = d.vaccine_id
  where d.age_day > p.end_age or x.archived_at is not null
  -- ٧) نوع جدول القاعة نوع وحدة حقلها (0028).
  union all
  select 'hall_program_kind', count(*) from public.hall_vaccine_programs p
  join public.halls h on h.org_id = p.org_id and h.id = p.hall_id
  join public.divisions dv on dv.org_id = h.org_id and dv.id = h.division_id
  where p.kind is distinct from dv.kind
$$;

-- ─── ط. الصلاحيات ──────────────────────────────────────────────────────────────────────────────────────────────────
-- الدوالّ المعاد تعريفها تبقى بمنحها (create or replace لا يغيّره)، والجديدة للمستخدم المسجّل وحده.
revoke all on function public.edit_flock(uuid, int, date, integer, integer, text, uuid), public.delete_flock(uuid, int, uuid),
  public.save_hall_vaccine_program(uuid, int, jsonb, int), public.drop_hall_vaccine_program(uuid, int),
  public.edit_recipe(uuid, uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.edit_flock(uuid, int, date, integer, integer, text, uuid), public.delete_flock(uuid, int, uuid),
  public.save_hall_vaccine_program(uuid, int, jsonb, int), public.drop_hall_vaccine_program(uuid, int),
  public.edit_recipe(uuid, uuid, text, jsonb, uuid) to authenticated;
