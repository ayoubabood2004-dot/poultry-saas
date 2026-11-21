-- 0035_hall_sheet — القاعة كالورقة، والغاز، والعلف من «رصيد العلف» بيومه، وقسما المخزن في الرصيد اليوميّ (كلمة المالك 2026-11-21 مع صورة ورقة
--   «هلاكات قاعة (7)»، وأجوبته الأربعة؛ الخطّة docs/HALLS_SHEET_PLAN.md بمراحلها ١–٣، والعقد docs/plans/0034/contract-0034.md «الجزء ب»؛ DECISIONS 2026-11-21).
-- المشكلة: الورقة التي يُستعمل فعلاً صفّ لكلّ يوم من عمر الوجبة (العمر، التاريخ، الهلاكات، الغاز، العلف، الملاحظات)، والنظام يقفل كلّ يوم أقدم من سبعة
--   أيّام فيُرفض أو يسقط في flock_day_rejects بلا من يقرّر فيه، ولا غاز له، والعلف في الجولة رقم «مأكول» لا يُنقص المخزن والصرف الحقيقيّ شاشة أخرى بتاريخ
--   الصرف وحده، والرصيد اليوميّ جدول واحد لا يفصل موادّ العلف عن العلف.
-- هنا:
--   • أيّ يوم من أيّام وجبة قائمة يُكتب (جواب المالك «كلّ أيّام الوجبة ما دامت مفتوحة»): private.flock_day_check(الوجبة، اليوم) قاعدة واحدة لكتابات القاعة —
--     date_required وdate_in_future وbefore_placement وflock_closed (وflock_not_placed لوجبة لم تُسكَّن) وperiod_locked، بلا حدّ الأيّام السبعة. وsave_flock_visit
--     وsave_flock_day بجسميهما في 0032 بلا فرع الأيّام السبعة وحده (الركن من الطابور بثلاثة أسباب: flock_closed وout_of_scope وperiod_locked)، وrecord_flock_weight
--     بجسمه في 0012 والقاعدة الواحدة بدل check_doc_date. ومواعيد المخزن والمال (flock_issue_options.earliest_on وweigh_ticket_options وflock_sales وflock_close_form
--     وticket_invoice_on وgive_to_flocks) كما هي.
--   • الغاز عدد قناني لكلّ (وجبة، يوم) بلا مخزن ولا كلفة (جواب المالك «عدد قناني بس»): public.flock_day_gas (صفّ لا يُحذف: المسح عدد فارغ بنسخة أكبر، درس ABA
--     2026-11-16؛ وتكتبه الدالّة وحدها، ويقرؤه من نطاقه حقل القاعة كـflock_daily)، وpublic.set_flock_gas (flock_day.save، بالطابور ومرجع client_ref، بشرط النسخة
--     التي رآها الجهاز: saved | stale_gas | parked). القيمة نفسها حُفظت بلا نسخة جديدة؛ والمركون في flock_day_rejects بالأسباب نفسها وpayload = {"gas": n}.
--   • العلف يخرج من «رصيد العلف» بتاريخ التسجيل ويظهر على يومه (جواب المالك «بتاريخ التسجيل»): flock_issues.for_day (يوم القاعة الذي يخصّه الصرف، لا بعد
--     تاريخ خروجه)، وprivate.issue_day(الصرف) = coalesce(for_day, issued_on) يعتمده كلّ قارئ للقاعة، وقرّاء المخزن على moved_on. وpublic.send_flock_feed
--     (issue.post): علف (نوعه feed) فقط، والصرف نفسه record_flock_issue كما هو (بمرجع مشتقّ كـgive_to_flocks) بتاريخ اليوم من مخزن علف فيه ما يكفي اليوم،
--     «رصيد العلف» (private.feed_balance_wh) أوّلاً؛ ثمّ يُكتب يومه. والتصحيح بـvoid_flock_issue كما هو.
--   • public.hall_sheet(الوجبة): الورقة صفّاً لكلّ يوم من التسكين حتى «حتى» (يوم الإغلاق؛ أو الأبعد من اليوم ونهاية الجدول؛ أو للّاحم عمر 45؛ أو اليوم للبيّاض)
--     بالهلاكات (النافق والمستبعد القديم معاً) والغاز والعلف المرسل بيومه وسطوره والملاحظة والبيض والمباع والحيّ آخر اليوم، ومجاميعها، والخلاصة (النفوق،
--     والأكياس، ومعدّل وزن المباع، والمرسل والراجع عند الإغلاق وصافيهما، ومعامل التحويل = الصافي ÷ صافي المباع = fcr_final لتقرير الدورة)، والأعلاف المتاحة
--     (أكبر ما في مخزن علف واحد: ما يأخذه إرسال واحد)، والمركون الذي ينتظر قراراً بنسخته. وpublic.decide_flock_reject يحسمه بشرط النسخة التي عُرضت.
--   • public.day_balance_sections(اليوم): الرصيد اليوميّ بقسمين («مواد العلف» raw وadditive، و«العلف» feed) و«أخرى» لما سواهما، بقواعد day_balance.
--   • التقارير: private.report_days يعدّ العلف النازل بيوم القاعة (issue_day)، وreport_day وhalls_day_totals وflock_cycle_report وhalls_history وflock_month
--     تزيد الغاز في كلّ يوم وفي المجاميع، والصرف بيومه؛ المفاتيح القديمة بأسمائها ومعانيها، والجديدة فقط (الواجهة المنشورة تقرؤها بين التطبيق والدمج).
--   • الحرّاس: edit_flock لا ينقل التسكين بعد يوم صرفٍ في القاعة (issue_day) أو غاز مسجَّل، وflock_activity_after يعدّ الغاز فلا تُغلق الوجبة قبل يومه،
--     وdelete_flock (الجسم الأخير من 0032) يسمّي «الغاز» المسجَّل ويحذف الصفّ الممسوح مع الوجبة.
--   • public.verify_hall_sheet: يوم الصرف بين التسكين وتاريخ خروجه، والغاز المسجَّل داخل أيّام وجبته وبقاعتها ونسخته موجبة، ومجاميع الورقة = مجموع أيّامها،
--     وعلف كلّ يوم في الورقة = سطور الصرف الحيّة بيوم القاعة والمنقول إليها، والراجع = سطور الإرجاع والنقل يوم الإغلاق (محسوبة هنا مستقلّاً)، ومعامل تحويل
--     الوجبة المغلقة = fcr_final لتقرير الدورة، لكلّ منشأة بهويّة مالكها.
-- قرارات بلا سؤال (داخل الخطوط الحمر والعقد):
--   • الغاز المركون يأخذ مكان «زيارة» في flock_day_rejects بمعرّف مشتقّ من (الكاتب، الوجبة، اليوم): الفهرس الجزئيّ (المنشأة، الزيارة) يجعل الأحدث يستبدل
--     الأقدم للكاتب واليوم كعمليات save_flock_day، ولا يكتب غاز مركون فوق جولة مركونة (فهرس الجولة لما لا معرّف له). ولا جدول جديد للمركون؛ وعموده الوحيد
--     الجديد version (مراجعة 0035): كلّ ركن من جديد يكبّره ويرجع بلا قرار.
--   • «حتى» للّاحم بلا نهاية = الأبعد من اليوم وعمر 45، فصفّ اليوم في الورقة دائماً ولو تجاوزت الوجبة 45 يوماً؛ وللوجبة المحدّدة الأبعد من اليوم ونهايتها.
--   • علف الورقة سطور الصرف الحيّة بنوع كلفة «علف» (العلف والموادّ الأوّلية والإضافات، كما يعدّها report_days)، ومعها العلف المنقول من دورة سابقة يوم تطبيقه
--     (carry_in_kg، كـgiven_kg)، والراجع يوم الإغلاق (feed_back_kg: إلى المخزن وللدورة التالية، كـout_kg)؛ والكيلو بالكتلة (private.issue_mass_kg)؛ ويوم كلّ
--     سطوره بلا كتلة يُعرض بسطوره وعلفه فارغ، وسطر بلا كتلة يفرّغ معامل التحويل (كـfcr_final). والأكياس = العلف ÷ حجم الكيس حين يكون لكلّ سطر (مرسل أو
--     منقول إليها) حجم كيس واحد مشترك (وحدة التعبئة الافتراضيّة أو الوحيدة للمادّة بالكيلو، أو وزن القطعة للمادّة بالقطعة)، وإلّا فارغ.
--   • send_flock_feed يحتاج مخزن علف (kind = feed) بنطاق الكاتب؛ لا مخزن no_feed_store، ولا مخزن فيه ما يكفي insufficient_stock بجملة تسمّي ما في «رصيد العلف».
--     ويوم القاعة يُفحص قبل الصرف ثمّ بعد أقفاله (الفترة وصفّ الوجبة يقفلهما record_flock_issue)، فكلّ فحص بعد قفله.
--   • مجاميع halls_day_totals للغاز sum (فارغ بلا تسجيل كالنافق)، ومجاميع الورقة والأشهر تعدّ الفارغ صفراً.
--   • decide_flock_reject: بنسخة غير التي في الخادم stale_reject بالمركون الآن ولا كتابة؛ وبالنسخة نفسها القرار نفسه مرّة ثانية حُفظ بلا كتابة، وقرار آخر
--     already_decided؛ والمركون من جديد لليوم نفسه يرجع بلا قرار بنسخة أكبر.
-- تراجع: rollback_0035.sql — يرجّع save_flock_visit وsave_flock_day كما في 0032، وrecord_flock_weight كما في 0012، وreport_days وreport_day وhalls_day_totals
--   وflock_cycle_report وflock_month وedit_flock وflock_activity_after كما في 0029، وhalls_history كما في 0031، وdelete_flock كما في 0032، حرفاً بحرف، ويُسقط
--   الجديد (الدوالّ وجدول الغاز وعمود for_day وقيده وعمود نسخة المركون وقيده). **طريق رفض**: صفّ غاز (ولو مُسح عدده: الصفّ يحمل نسخة رآها جهاز)، أو صرف يومه في القاعة قبل تاريخ خروجه، أو غاز مركون، كلّ واحد
--   يوقف التراجع بصوت (بيانات لا يحملها النموذج القديم).
-- تنعاد بأمان: create table/index if not exists، وadd column if not exists، وكتل do تفحص الكتالوج قبل القيد والسياسة، وcreate or replace، وrevoke وgrant.

set lock_timeout = '5s';

-- ─── أ. الغاز: عدد القناني لكلّ (وجبة، يوم) ───────────────────────────────────────────────────────────────────────────────
-- صفّ واحد لكلّ (منشأة، وجبة، يوم) لا يُحذف: العدد من صفر إلى 1,000 أو فارغ (مُسح)، والنسخة تكبر بكلّ تغيير. القاعة والحقل والوحدة من الوجبة (سياسة
-- القراءة بعمود الصفّ، والمفتاح المركّب للقاعة).
create table if not exists public.flock_day_gas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  flock_id uuid not null,
  hall_id uuid not null,
  site_id uuid not null,
  division_id uuid not null,
  on_date date not null,
  cylinders integer,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint flock_day_gas_cylinders_check check (cylinders is null or cylinders between 0 and 1000),
  constraint flock_day_gas_version_check check (version >= 1),
  constraint flock_day_gas_on_date_check check (isfinite(on_date)),
  unique (org_id, id),
  unique (org_id, flock_id, on_date),
  foreign key (org_id, flock_id) references public.flocks (org_id, id),
  foreign key (org_id, division_id, site_id, hall_id) references public.halls (org_id, division_id, site_id, id)
);
create index if not exists flock_day_gas_hall on public.flock_day_gas (org_id, division_id, site_id, hall_id);

alter table public.flock_day_gas enable row level security;

do $$
begin
  -- القراءة بنطاق حقل القاعة كـflock_daily (FOUNDATION ٥٤٤)، والكتابة بـset_flock_gas وحدها.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'flock_day_gas' and policyname = 'flock_day_gas_read') then
    create policy flock_day_gas_read on public.flock_day_gas for select to authenticated
      using (org_id = (select public.auth_org()) and (select public.in_scope_site(site_id)));
  end if;
  execute 'create or replace trigger audit_flock_day_gas after insert or update or delete on public.flock_day_gas for each row execute function private.audit_row()';
end
$$;

revoke all on table public.flock_day_gas from anon, authenticated;
grant select on table public.flock_day_gas to authenticated;
revoke truncate on table public.flock_day_gas from service_role;

-- ─── ب. يوم القاعة للصرف ─────────────────────────────────────────────────────────────────────────────────────────────
-- for_day: اليوم الذي يخصّه الصرف في القاعة (فارغ = تاريخ الصرف نفسه)، لا بعد تاريخ خروجه من المخزن. يكتبه send_flock_feed وحده.
alter table public.flock_issues add column if not exists for_day date;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'flock_issues_for_day_check' and conrelid = 'public.flock_issues'::regclass) then
    alter table public.flock_issues add constraint flock_issues_for_day_check check (for_day is null or (isfinite(for_day) and for_day <= issued_on));
  end if;
end
$$;

-- ─── ب٢. نسخة المركون ────────────────────────────────────────────────────────────────────────────────────────────────
-- الركن من جديد لليوم نفسه يكتب فوق صفّه (الفهرسان الجزئيّان من 0032)، فالنسخة تكبر بكلّ ركن ويرجع الصفّ بلا قرار، والحسم مشروط بالنسخة التي عرضتها الورقة
-- (decide_flock_reject)، فلا يُحسم ما لم يُعرض (مراجعة 0035). الصفوف القائمة بالنسخة 1.
alter table public.flock_day_rejects add column if not exists version integer not null default 1;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'flock_day_rejects_version_check' and conrelid = 'public.flock_day_rejects'::regclass) then
    alter table public.flock_day_rejects add constraint flock_day_rejects_version_check check (version >= 1);
  end if;
end
$$;

-- ─── ج. المساعدات ──────────────────────────────────────────────────────────────────────────────────────────────────
-- يوم الصرف في القاعة: اليوم الذي يخصّه، وإلّا تاريخه. كلّ قارئ للقاعة ينسب العلف بهذا اليوم، وقرّاء المخزن بـmoved_on.
create or replace function private.issue_day(i public.flock_issues) returns date
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select coalesce(i.for_day, i.issued_on)
$$;

-- قاعدة اليوم لكتابات القاعة (الجولة والوزن والغاز ويوم العلف): يوم من التقويم، لا بعد اليوم، ولا قبل التسكين، والوجبة قائمة، والفترة غير مقفلة؛ بلا حدّ
-- الأيّام السبعة (جواب المالك 2026-11-21). يناديها الكاتب بعد قفل الفترة (period_guard) وقراءة الوجبة، فقراءة قفل الفترة هنا بعد قفله.
create or replace function private.flock_day_check(f public.flocks, p_on date) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_today date := public.app_today();
  v_lock date;
  v_hall text;
begin
  if p_on is null or not isfinite(p_on) then
    raise exception 'date_required' using hint = 'اختر يوماً من أيّام الوجبة.';
  end if;
  if p_on > v_today then
    raise exception 'date_in_future' using hint = format('يوم %s لم يأتِ بعد؛ يُكتب لليوم %s أو لما قبله من أيّام الوجبة.', to_char(p_on, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY'));
  end if;
  select h.name into v_hall from public.halls h where h.org_id = f.org_id and h.id = f.hall_id;
  if p_on < f.placed_on then
    raise exception 'before_placement' using hint = format('يوم %s قبل تسكين الوجبة في «%s» يوم %s.', to_char(p_on, 'DD/MM/YYYY'), v_hall, to_char(f.placed_on, 'DD/MM/YYYY'));
  end if;
  if f.status = 'closed' then
    raise exception 'flock_closed' using hint = format('وجبة «%s» مغلقة، فلا يُكتب لها شيء. إن كان التسجيل صحيحاً فأعِد فتح الوجبة أوّلاً.', v_hall);
  end if;
  if f.status <> 'active' then
    raise exception 'flock_not_placed' using hint = format('وجبة «%s» لم تُسكَّن بعد، فلا يُكتب لها شيء.', v_hall);
  end if;
  select l.locked_through into v_lock from public.period_locks l where l.org_id = f.org_id;
  if v_lock is not null and p_on <= v_lock then
    raise exception 'period_locked' using hint = format('الحسابات مقفلة حتى %s (هذا اليوم وما قبله)، فلا يُكتب ليوم %s. إن كان التاريخ صحيحاً فاطلب من مالك المنشأة فتح الفترة.',
      to_char(v_lock, 'DD/MM/YYYY'), to_char(p_on, 'DD/MM/YYYY'));
  end if;
end
$$;

-- غاز اليوم بالشكل الذي ترجعه set_flock_gas (saved وstale_gas): اليوم والعدد والنسخة، وبلا صفّ عدد ونسخة فارغان.
create or replace function private.flock_gas_json(p_on date, g public.flock_day_gas) returns jsonb
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object('on', p_on, 'cylinders', g.cylinders, 'version', g.version)
$$;

-- علف يوم في القاعة بالكيلو: مجموع كتل سطور الصرف الحيّة بنوع كلفة «علف» يومها في القاعة p_on، أو فارغ بلا سطر (أو بسطور بلا كتلة).
create or replace function private.hall_feed_kg(p_flock uuid, p_on date) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select round(sum(private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)), 3)
  from public.flock_issues x
  join public.flock_issue_lines l on l.org_id = x.org_id and l.issue_id = x.id
  where x.org_id = public.auth_org() and x.flock_id = p_flock and x.status = 'posted' and l.cost_kind = 'feed' and private.issue_day(x) = p_on
$$;

-- نتيجة «أرسل علفاً» من صفوفها: نفسها لأوّل نداء وللإعادة بالمعرّف (بلا مال).
create or replace function private.feed_send_result(p_issue uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('status', 'saved',
    'issue', jsonb_build_object('id', x.id, 'doc_no', x.doc_no, 'item_id', l.item_id, 'item_name', i.name, 'qty', round(l.qty_base, 3)::text,
      'unit', l.base_unit, 'issued_on', x.issued_on, 'for_day', private.issue_day(x)),
    'day', jsonb_build_object('on', private.issue_day(x), 'feed_kg', private.hall_feed_kg(x.flock_id, private.issue_day(x))::text))
  from public.flock_issues x
  join public.flock_issue_lines l on l.org_id = x.org_id and l.issue_id = x.id and l.line_no = 1
  join public.items i on i.org_id = l.org_id and i.id = l.item_id
  where x.org_id = public.auth_org() and x.id = p_issue
$$;

-- ─── د. كتّاب اليوم: كلّ أيّام الوجبة القائمة ────────────────────────────────────────────────────────────────────────────
-- الزيارة (الجسم الأخير من 0032) بلا فرع الأيّام السبعة وحده.
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

-- الجولة اليومية (الجسم الأخير من 0032) بلا فرع الأيّام السبعة وحده.
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

-- وزن العيّنة (الجسم الأخير من 0012) بقاعدة اليوم الواحدة بدل check_doc_date.
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
  -- 0035: قاعدة اليوم الواحدة لكتابات القاعة (كلّ أيّام الوجبة القائمة، وقفل الفترة كما كان) بدل check_doc_date.
  perform private.flock_day_check(f, p_date);
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

-- ─── هـ. الغاز (flock_day.save، بالطابور ومرجع client_ref) ───────────────────────────────────────────────────────────────
-- p_expected_version نسخة صفّ اليوم التي رآها الجهاز (فارغ = رأى بلا صفّ). إن كان الحال الآن هو المطلوب (العدد نفسه، أو بلا عدد والمطلوب مسحه) فحُفظ بلا كتابة
-- ولا نسخة جديدة (إعادة بعد جواب ضاع، أو جهازان كتبا الشيء نفسه)؛ وإلّا إن تغيّر عمّا رآه فـstale_gas بما في الخادم. الأقفال: الفترة للمشاركة ← صفّ الوجبة
-- للتحديث (كالجولة: كاتبان ليوم واحد يترتّبان، فيرى الثاني صفّ الأوّل بعد ثباته) ← صفّ الغاز. ومن الطابور (p_queued) تُركن الثلاثة التي تتغيّر والعملية
-- في الجهاز كالجولة.
create or replace function public.set_flock_gas(p_flock uuid, p_on date, p_cylinders integer, p_expected_version bigint, p_client_ref uuid,
  p_queued boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'set_flock_gas';
  v_cached jsonb;
  v_today date := public.app_today();
  v_queued boolean := coalesce(p_queued, false);
  v_lock date;
  v_park text;
  f public.flocks;
  g public.flock_day_gas;
begin
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('flock', p_flock, 'on', p_on, 'cylinders', p_cylinders,
    'expected_version', p_expected_version, 'queued', v_queued));
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
    raise exception 'date_in_future' using hint = format('يوم %s لم يأتِ بعد؛ يُكتب الغاز لليوم %s أو لما قبله من أيّام الوجبة.', to_char(p_on, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY'));
  end if;
  -- الثلاثة التي تتغيّر والعملية بالطابور: بنداء مباشر ترمي، ومن الطابور تُركن وترجع parked.
  select l.locked_through into v_lock from public.period_locks l where l.org_id = f.org_id;
  v_park := case when f.status = 'closed' then 'flock_closed' when not public.in_scope_site(f.site_id) then 'out_of_scope'
    when v_lock is not null and p_on <= v_lock then 'period_locked' end;
  if v_park is not null and v_queued then
    insert into public.flock_day_rejects (org_id, flock_id, hall_id, site_id, division_id, on_date, client_ref, payload, reason, created_by, visit_id)
    values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_on, p_client_ref, jsonb_build_object('gas', p_cylinders), v_park, auth.uid(),
      md5('gas:' || coalesce(auth.uid()::text, '') || ':' || f.id::text || ':' || to_char(p_on, 'YYYY-MM-DD'))::uuid)
    on conflict (org_id, visit_id) where visit_id is not null do update
      set client_ref = excluded.client_ref, payload = excluded.payload, reason = excluded.reason, created_at = now(),
          version = public.flock_day_rejects.version + 1, decision = null, decided_by = null, decided_at = null;
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'parked', 'reason', v_park));
  end if;
  if v_park = 'out_of_scope' then
    raise exception 'out_of_scope' using hint = 'قاعة هذه الوجبة خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  perform private.flock_day_check(f, p_on);
  if p_cylinders < 0 or p_cylinders > 1000 then
    raise exception 'bad_value' using hint = 'عدد قناني الغاز عدد صحيح من صفر إلى 1,000.';
  end if;
  select * into g from public.flock_day_gas x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_on for update;
  if (g.id is null and p_cylinders is null) or (g.id is not null and g.cylinders is not distinct from p_cylinders) then
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'gas', private.flock_gas_json(p_on, g)));
  end if;
  if p_expected_version is distinct from g.version then
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'stale_gas', 'server', private.flock_gas_json(p_on, g)));
  end if;
  if g.id is null then
    insert into public.flock_day_gas (org_id, flock_id, hall_id, site_id, division_id, on_date, cylinders, version)
    values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_on, p_cylinders, 1)
    returning * into g;
  else
    update public.flock_day_gas x set cylinders = p_cylinders, version = x.version + 1, updated_at = now(), updated_by = auth.uid()
    where x.org_id = g.org_id and x.id = g.id
    returning * into g;
  end if;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'gas', private.flock_gas_json(p_on, g)));
end
$$;

-- ─── و. «أرسل علفاً» من «رصيد العلف» بيومه (issue.post) ─────────────────────────────────────────────────────────────────
-- علف واحد بكميته بوحدة أساسه لوجبة قائمة بنطاق الكاتب، ليوم p_for_day من أيّامها. الصرف نفسه record_flock_issue بجسمه (السحب بترتيبه والكلفة والرقم والأقفال)
-- بتاريخ اليوم ومرجع مشتقّ من مرجع النداء، من مخزن علف بنطاق الكاتب فيه ما يكفي اليوم، و«رصيد العلف» أوّلاً؛ ثمّ يُكتب يوم القاعة ويُفحص بعد أقفال الصرف.
-- الإعادة بالمرجع ترجع النتيجة الأولى (والملغى بعدها id_conflict)، وبالمعرّف نفسه والمحتوى نفسه = النتيجة نفسها، وبمحتوى آخر id_conflict.
create or replace function public.send_flock_feed(p_client_ref uuid, p_issue_id uuid, p_line_id uuid, p_flock uuid, p_item uuid, p_qty numeric,
  p_for_day date) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'send_flock_feed';
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_cached jsonb;
  v_same boolean;
  v_pref uuid;
  v_any boolean := false;
  v_first public.warehouses;
  v_first_qty numeric;
  v_qty numeric;
  f public.flocks;
  i public.items;
  w public.warehouses;
  y public.warehouses;
  x public.flock_issues;
begin
  set local lock_timeout = '5s';
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('issue', p_issue_id, 'line', p_line_id, 'flock', p_flock, 'item', p_item,
    'qty', p_qty, 'for_day', p_for_day));
  if v_cached is not null then
    -- أُرسل ثمّ أُلغي: الإعادة لا تقول «حُفظ» بنتيجته القديمة (درس 0017).
    if exists (select 1 from public.flock_issues z where z.org_id = v_org and z.id = p_issue_id and z.status = 'void') then
      raise exception 'id_conflict' using hint = 'أُرسل هذا العلف من قبل ثمّ أُلغي. افتح ورقة القاعة لترى ما بقي، ثمّ أرسل من جديد.';
    end if;
    return v_cached;
  end if;
  perform private.require('issue.post');
  if p_issue_id is null or p_line_id is null or p_flock is null or p_item is null then
    raise exception 'id_required' using hint = 'تعذّر الإرسال دون معرّفات الصرف والوجبة والعلف. حدّث الشاشة وأعد المحاولة.';
  end if;
  -- الإعادة بالمعرّف (جواب ضاع ثمّ مرجع جديد): القفل نفسه الذي يأخذه record_flock_issue أوّلاً، فيرى الثاني صفّ الأوّل بعد ثباته.
  perform pg_advisory_xact_lock(hashtextextended('flock_issue:' || p_issue_id::text, 0));
  select * into x from public.flock_issues z where z.id = p_issue_id;
  if x.id is not null then
    v_same := x.org_id = v_org and x.status = 'posted' and x.created_by is not distinct from auth.uid() and x.flock_id = p_flock
      and x.for_day is not distinct from p_for_day
      and exists (select 1 from public.flock_issue_lines z where z.org_id = x.org_id and z.issue_id = x.id and z.id = p_line_id
        and z.item_id = p_item and z.qty_base = p_qty);
    if coalesce(v_same, false) then
      return private.ref_store(v_fn, p_client_ref, private.feed_send_result(x.id));
    end if;
    raise exception 'id_conflict' using hint = case
      when x.org_id = v_org and x.status = 'void' then 'أُرسل هذا العلف من قبل ثمّ أُلغي. افتح ورقة القاعة لترى ما بقي، ثمّ أرسل من جديد.'
      else 'سُجّل بهذا المعرّف صرف غير الذي أرسلته الآن. افتح ورقة القاعة لترى ما سُجّل، ثمّ أرسل من جديد.'
    end;
  end if;

  -- الوجبة بنطاق الكاتب، ويوم القاعة من أيّامها؛ والعلف موجود وفعّال ونوعه علف، والكمية بوحدة أساسه.
  f := private.flock_for(p_flock, false);
  perform private.flock_day_check(f, p_for_day);
  select * into i from public.items z where z.org_id = v_org and z.id = p_item;
  if i.id is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if i.kind <> 'feed' then
    raise exception 'not_feed' using hint = format('«%s» ليست علفاً، فلا تُرسل من «رصيد العلف» إلى القاعة. الأدوية والموادّ الأخرى تُعطى من «أعطِ للقاعات».', i.name);
  end if;
  if i.archived_at is not null then
    raise exception 'item_archived' using hint = format('العلف «%s» محذوف من القوائم، فلا يُرسل. أظهِره من ملفّه أوّلاً.', i.name);
  end if;
  if p_qty is null or not (abs(p_qty) < 'Infinity') or p_qty <= 0 or p_qty <> round(p_qty, 3) then
    raise exception 'qty_not_positive' using hint = format('اكتب كمية «%s» أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.', i.name);
  end if;
  if i.base_unit = 'pc' and p_qty <> round(p_qty, 0) then
    raise exception 'pieces_not_whole' using hint = format('«%s» يُعدّ بالقطعة؛ اكتب عدداً صحيحاً من القطع.', i.name);
  end if;

  -- مخزن العلف: «رصيد العلف» أوّلاً ثمّ الأقدم، أوّل مخزن فيه ما يكفي اليوم (الصرف يعيد الفحص تحت أقفاله).
  v_pref := private.feed_balance_wh();
  for y in
    select z.* from public.warehouses z
    where z.org_id = v_org and z.kind = 'feed' and z.archived_at is null and public.in_scope_wh(z.id)
    order by z.id = v_pref desc nulls last, z.created_at, z.id
  loop
    select s.available into v_qty from private.stock_at(i.id, y.id, v_today) as s;
    if not v_any then
      v_any := true;
      v_first := y;
      v_first_qty := v_qty;
    end if;
    if v_qty >= p_qty then
      w := y;
      exit;
    end if;
  end loop;
  if not v_any then
    raise exception 'no_feed_store' using hint = 'لا يوجد مخزن علف («رصيد العلف») في منشأتك، فلا يُرسل علف للقاعة من هنا. أنشئ مخزن العلف في المعمل أوّلاً.';
  end if;
  if w.id is null then
    raise exception 'insufficient_stock' using hint = format('لا يكفي «%s» في «%s» اليوم: طلبت %s، وفيه %s.', i.name, v_first.name,
      private.qty_text(p_qty, i.base_unit), private.qty_text(coalesce(v_first_qty, 0), i.base_unit));
  end if;

  perform public.record_flock_issue(private.derived_ref(p_client_ref, 1), p_issue_id, p_line_id, f.id, i.id, p_qty, v_today, w.id);
  update public.flock_issues z set for_day = p_for_day where z.org_id = v_org and z.id = p_issue_id;
  -- كلّ فحص بعد قفله: قفل الفترة وصفّ الوجبة مأخوذان الآن (record_flock_issue)، فيوم القاعة يُفحص على الحال بعدهما.
  select * into f from public.flocks z where z.org_id = v_org and z.id = p_flock;
  perform private.flock_day_check(f, p_for_day);
  return private.ref_store(v_fn, p_client_ref, private.feed_send_result(p_issue_id));
end
$$;

-- ─── ز. حسم المركون (flock_day.save) ───────────────────────────────────────────────────────────────────────────────────
-- المركون كما تعرضه الورقة (rejects[]) وكما يرجعه stale_reject: اليوم والسبب ووقت الركن وما فيه ونسخته، ومرجع العملية المركونة كما حُفظ (client_ref)
-- ليطابق الجهاز عمليته به لا بمحتواها.
create or replace function private.flock_reject_json(r public.flock_day_rejects) returns jsonb
language sql stable set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object('id', r.id, 'on', r.on_date, 'reason', r.reason, 'created_at', r.created_at, 'payload', r.payload, 'version', r.version,
    'client_ref', r.client_ref)
$$;

-- handled («أُدخلت»: كُتب ما فيه يدوياً) أو refused («تجاهل»)، بشرط النسخة التي عرضتها الورقة (p_seen_version من rejects[].version): الركن من جديد لليوم
-- نفسه يكتب فوق الصفّ بنسخة أكبر وبلا قرار، فنسخة غير التي في الخادم stale_reject بالمركون كما هو الآن ولا يُكتب شيء. وبالنسخة نفسها مرّة واحدة: القرار
-- نفسه مرّة ثانية حُفظ بلا كتابة (إعادة بعد جواب ضاع)، وغيره already_decided. القفل صفّ المركون، والفحوص كلّها بعده. (النداء بحجّتين قبل المراجعة لم يُنشر.)
drop function if exists public.decide_flock_reject(uuid, text);
create or replace function public.decide_flock_reject(p_id uuid, p_decision text, p_seen_version integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.flock_day_rejects;
begin
  perform private.require('flock_day.save');
  if p_decision is null or p_decision not in ('handled', 'refused') then
    raise exception 'bad_decision' using hint = 'القرار إمّا «أُدخلت» أو «تجاهل».';
  end if;
  set local lock_timeout = '5s';
  select * into r from public.flock_day_rejects x where x.org_id = public.auth_org() and x.id = p_id for update;
  if r.id is null then
    raise exception 'reject_not_found' using hint = 'هذه العملية المرفوضة غير موجودة في منشأتك (ربّما حُسمت من جهاز آخر). حدّث الشاشة.';
  end if;
  if not public.in_scope_site(r.site_id) then
    raise exception 'out_of_scope' using hint = 'قاعة هذه العملية خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  if r.version is distinct from p_seen_version then
    return jsonb_build_object('status', 'stale_reject', 'reject', private.flock_reject_json(r));
  end if;
  if r.decision is null then
    update public.flock_day_rejects x set decision = p_decision, decided_by = auth.uid(), decided_at = now()
    where x.org_id = r.org_id and x.id = r.id
    returning * into r;
  elsif r.decision <> p_decision then
    raise exception 'already_decided' using hint = format('حُسمت هذه العملية من قبل بـ«%s». حدّث الشاشة.', case r.decision when 'handled' then 'أُدخلت' else 'تجاهل' end);
  end if;
  return jsonb_build_object('status', 'saved', 'id', r.id, 'decision', r.decision, 'decided_at', r.decided_at);
end
$$;

-- ─── ح. الورقة (read، بنطاق حقل القاعة؛ بلا مال) ─────────────────────────────────────────────────────────────────────────
-- صفّ لكلّ يوم من التسكين حتى «حتى» ولو بلا شيء: الهلاكات (النافق والمستبعد القديم معاً، والمستبعد وحده ليُصفَّر عند التعديل)، ونسخة صفّ اليوم والملاحظة،
-- والغاز ونسخته، والعلف المرسل بيوم القاعة وسطوره (الحيّة وحدها) بـ«ألغِ» لكلّ سطر كـflock_feed، والبيض للبيّاض، والمباع وصافيه، والحيّ آخر اليوم.
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

-- ─── ط. الرصيد اليوميّ بقسمين (read) ──────────────────────────────────────────────────────────────────────────────────
-- «مواد العلف» (raw وadditive) و«العلف» (feed، وناتج المعمل فيه) و«أخرى» لكلّ مادّة فعّالة غيرها يقبلها مخزن من مخازن القارئ؛ والرصيد آخر اليوم = Σ كميات
-- حركاتها بتاريخه أو قبله في تلك المخازن، وملاحظة اليوم. الترتيب داخل القسم: ما له تصنيف بترتيب اسم التصنيف ثمّ ترتيب موادّه، ثمّ الباقي بالاسم.
create or replace function public.day_balance_sections(p_on date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_on date := coalesce(p_on, public.app_today());
  v_sections jsonb;
begin
  perform private.require('read');
  if not isfinite(v_on) then
    raise exception 'date_required' using hint = 'اختر يوماً من التقويم.';
  end if;
  if v_on > v_today then
    raise exception 'day_in_future' using hint = format('يوم %s لم يأتِ بعد؛ الرصيد يُعرض حتى اليوم %s.', to_char(v_on, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY'));
  end if;
  with stores as (
    select y.id, y.kind from public.warehouses y where y.org_id = v_org and public.in_scope_wh(y.id)
  ), picked as (
    select i.id, i.name, i.name_norm, i.kind, i.base_unit, i.category_id,
      case when i.kind in ('raw', 'additive') then 'feed_materials' when i.kind = 'feed' then 'feed' else 'other' end as section
    from public.items i
    where i.org_id = v_org and i.archived_at is null and exists (select 1 from stores s where private.item_admissible(s.kind, i.kind))
  ), bal as (
    select m.item_id, sum(m.qty) as qty from public.stock_moves m
    where m.org_id = v_org and m.moved_on <= v_on and m.item_id in (select p.id from picked p) and m.warehouse_id in (select s.id from stores s)
    group by m.item_id
  ), listed as (
    select p.section, p.id, p.name_norm, c.id as category_id, c.name as category_name, array_position(c.item_order, p.id) as pos,
      jsonb_build_object('item_id', p.id, 'name', p.name, 'kind', p.kind, 'base_unit', p.base_unit, 'qty', round(coalesce(b.qty, 0), 3)::text,
        'note', case when n.id is null then null else jsonb_build_object('text', n.note, 'version', n.version) end,
        'category', case when c.id is null then null else jsonb_build_object('id', c.id, 'name', c.name) end) as j
    from picked p
    left join bal b on b.item_id = p.id
    left join public.item_categories c on c.org_id = v_org and c.id = p.category_id and c.archived_at is null
    left join public.stock_day_notes n on n.org_id = v_org and n.item_id = p.id and n.on_date = v_on
  )
  select jsonb_agg(jsonb_build_object('key', k.key, 'rows', coalesce((select jsonb_agg(r.j order by r.category_id is null, r.category_name collate "C",
        r.category_id, r.pos nulls last, r.name_norm collate "C", r.id) from listed r where r.section = k.key), '[]'::jsonb)) order by k.n)
  into v_sections
  from (values (1, 'feed_materials'), (2, 'feed'), (3, 'other')) as k(n, key);
  return jsonb_build_object('today', v_today, 'on', v_on, 'can_note', public.can('stock_note.write'), 'sections', v_sections);
end
$$;

-- ─── ي. التقارير: العلف النازل بيوم القاعة، والغاز في كلّ يوم وفي المجاميع ───────────────────────────────────────────────────
-- أرقام كلّ يوم (الجسم الأخير من 0029): العلف النازل بيوم القاعة (issue_day) لا بتاريخ خروجه.
create or replace function private.report_days(f public.flocks, p_through date)
returns table (on_date date, age int, day_no int, has_round boolean, live_start bigint, dead int, culled int, live_end bigint,
  dead_cum bigint, culled_cum bigint, mortality_cum_pct text, feed_kg numeric, feed_cum_kg numeric, feed_days int, feed_span int,
  given_kg numeric, given_unweighed int, given_cum_kg numeric, given_cum_unweighed int, weight_count int, weight_avg_g numeric, last_weight_on date,
  last_weight_avg_g numeric, fcr numeric, eggs_total int, eggs_broken int, eggs_cracked int, hdep text, note text)
language sql stable security definer set search_path = public, pg_temp as $$
  with g as (
    select f.placed_on + s.n as d from generate_series(0, p_through - f.placed_on) as s(n)
  ), given as (
    -- 0035: الصرف على يومه في القاعة (issue_day)، لا بتاريخ خروجه من المخزن.
    select private.issue_day(x) as d, sum(m.kg) as kg, count(*) filter (where m.kg is null) as unweighed
    from public.flock_issues x
    join public.flock_issue_lines l on l.org_id = x.org_id and l.issue_id = x.id
    cross join lateral (select private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg) as kg) as m
    where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted' and l.cost_kind = 'feed' and private.issue_day(x) <= p_through
    group by private.issue_day(x)
  ), y as (
    select g.d, r.id is not null as has_round, r.dead, r.culled, r.feed_kg, r.eggs_total, r.eggs_broken, r.eggs_cracked, r.note,
      w.sample_count, w.avg_g, coalesce(i.kg, 0) + e.carry_in_kg as given_kg, coalesce(i.unweighed, 0) + e.carry_in_unweighed as given_unweighed,
      e.sold, e.adjust, e.sold_cum_kg
    from g
    join private.report_days_extra(f, p_through) as e on e.on_date = g.d
    left join public.flock_daily r on r.org_id = f.org_id and r.flock_id = f.id and r.on_date = g.d
    left join public.flock_weights w on w.org_id = f.org_id and w.flock_id = f.id and w.on_date = g.d
    left join given i on i.d = g.d
  ), z as (
    select y.*,
      f.placed_count - coalesce(sum(coalesce(y.dead, 0) + coalesce(y.culled, 0) + y.sold - y.adjust)
        over (order by y.d rows between unbounded preceding and 1 preceding), 0) as live_start,
      sum(coalesce(y.dead, 0)) over c as dead_cum,
      sum(coalesce(y.culled, 0)) over c as culled_cum,
      round(coalesce(sum(y.feed_kg) over c, 0), 3) as feed_cum_kg,
      max(y.d) filter (where y.feed_kg is not null) over c as last_feed,
      sum(y.given_kg) over c as given_cum_kg,
      sum(y.given_unweighed) over c as given_cum_unweighed,
      max(y.d) filter (where y.avg_g is not null) over c as last_weight_on
    from y
    window c as (order by y.d rows unbounded preceding)
  ), a as (
    -- 0028 (مراجعة O7): يوم بدأ بلا طير حيّ (بعد بيع الكلّ) لا جولة ولا علف ينتظره: أيّام العلف اللازمة = أيّام الحيّ أوّلها من التسكين حتى أمس (أو
    -- اليوم إن سُجّل علفه). وإعادة مراجعة 0028 DN2: وأيّام العلف المسجّلة تعدّ الأيّام نفسها (أيّام الحيّ)، فجولة بعلف صفر سُجّلت يوماً كان فيه طير
    -- حيّ قبل أن تُرحَّل فاتورة التذكرة (والطيور تخرج بيوم التذكرة) لا تُسقط معامل التحويل. وبلا بيع ولا عدّ كما كانت حرفاً بحرف (كلّ يوم حيّ).
    select z.*, count(*) filter (where z.live_start > 0) over k as alive_cum,
      count(*) filter (where z.live_start > 0 and z.feed_kg is not null) over k as feed_days
    from z
    window k as (order by z.d rows unbounded preceding)
  ), v as (
    select a.*, a.live_start - coalesce(a.dead, 0) - coalesce(a.culled, 0) - a.sold + a.adjust as live_end,
      case when a.last_feed = a.d then a.alive_cum else a.alive_cum - (a.live_start > 0)::int end as feed_span,
      lw.avg_g as last_weight_avg_g
    from a
    left join public.flock_weights lw on lw.org_id = f.org_id and lw.flock_id = f.id and lw.on_date = a.last_weight_on
  ), u as (
    select v.*, case when v.live_end > 0 and v.last_weight_avg_g is not null then v.live_end * v.last_weight_avg_g else 0 end + v.sold_cum_kg * 1000 as den
    from v
  )
  select u.d, (u.d - f.placed_on + f.age_days_at_placement)::int, (u.d - f.placed_on + 1)::int, u.has_round, u.live_start::bigint, u.dead, u.culled,
    u.live_end::bigint, u.dead_cum::bigint, u.culled_cum::bigint, private.flock_pct(u.dead_cum + u.culled_cum, f.placed_count), u.feed_kg, u.feed_cum_kg,
    u.feed_days::int, u.feed_span::int, u.given_kg, u.given_unweighed::int, u.given_cum_kg, u.given_cum_unweighed::int, u.sample_count, u.avg_g,
    u.last_weight_on, u.last_weight_avg_g,
    case when u.feed_days > 0 and u.feed_days = u.feed_span and u.feed_cum_kg > 0 and u.den > 0 and (u.live_end <= 0 or u.last_weight_avg_g is not null)
      then private._mul_div_round(u.feed_cum_kg, 1000, u.den, 3) end,
    u.eggs_total, u.eggs_broken, u.eggs_cracked,
    case when f.kind = 'layer' then private.flock_pct(u.eggs_total, u.live_start) end,
    u.note
  from u
  order by u.d
$$;

-- فوج القاعة ليوم (الجسم الأخير من 0029): الغاز، والصرف بيوم القاعة وتاريخ خروجه.
create or replace function private.report_day(f public.flocks, p_on date, p_today date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', f.id, 'kind', f.kind, 'status', f.status, 'placed_on', f.placed_on, 'placed_count', f.placed_count, 'age0', f.age_days_at_placement,
    'closed_on', f.closed_on, 'age', r.age, 'day_no', r.day_no, 'round', r.has_round,
    'live_start', r.live_start, 'dead', r.dead, 'culled', r.culled, 'live_end', r.live_end,
    'dead_cum', r.dead_cum, 'culled_cum', r.culled_cum, 'mortality_cum_pct', r.mortality_cum_pct,
    'feed_eaten_kg', round(r.feed_kg, 3)::text, 'feed_eaten_cum_kg', r.feed_cum_kg::text, 'feed_days', r.feed_days, 'feed_span', r.feed_span,
    'feed_given_kg', r.given_kg::text, 'feed_given_unweighed', r.given_unweighed, 'feed_given_cum_kg', r.given_cum_kg::text,
    'feed_given_cum_unweighed', r.given_cum_unweighed, 'feed_left_kg', (r.given_cum_kg - e.out_cum_kg - r.feed_cum_kg)::text,
    'weight', case when r.weight_avg_g is not null then jsonb_build_object('sample_count', r.weight_count, 'avg_g', round(r.weight_avg_g, 1)::text) end,
    'last_weight', case when r.last_weight_on is not null then jsonb_build_object('on_date', r.last_weight_on,
      'age', r.last_weight_on - f.placed_on + f.age_days_at_placement, 'avg_g', round(r.last_weight_avg_g, 1)::text) end,
    'fcr', r.fcr::text,
    'eggs_total', case when f.kind = 'layer' then r.eggs_total end,
    'eggs_broken', case when f.kind = 'layer' then r.eggs_broken end,
    'eggs_cracked', case when f.kind = 'layer' then r.eggs_cracked end,
    'hdep', r.hdep, 'note', r.note,
    -- 0035: قناني الغاز في اليوم (فارغ بلا تسجيل).
    'gas', (select g.cylinders from public.flock_day_gas g where g.org_id = f.org_id and g.flock_id = f.id and g.on_date = p_on),
    'sold', e.sold, 'sold_net_kg', round(e.sold_kg, 3)::text, 'count_diff', e.adjust,
    'ticketed', (select coalesce(sum(s.birds), 0)::int from public.weigh_ticket_stops s
      join public.weigh_tickets t on t.org_id = s.org_id and t.id = s.ticket_id
      where s.org_id = f.org_id and s.flock_id = f.id and t.on_date = p_on and t.status <> 'void'
        and not exists (select 1 from public.bird_sales b where b.org_id = t.org_id and b.ticket_id = t.id and b.status = 'posted')),
    'feed_carry_in_kg', e.carry_in_kg::text, 'feed_out_kg', e.out_kg::text, 'feed_out_unweighed', e.out_unweighed,
    'feed_out_cum_unweighed', e.out_cum_unweighed,
    -- مراجعة 0028 O2/M5: ما في القاعة فعلاً بتعريفه الواحد (private.hall_left: النازل والمنقول إليها − الراجع والمنقول منها والمحسوب مستهلَكاً عند
    -- الإغلاق − المأكول، وصفر يوم الإغلاق)، وعدّ سطوره بلا كتلة؛ وO7: يوم بدأ بلا طير حيّ لا جولة تنتظره؛ وO3: فروق العدّ في اليوم بسببها ومصدرها.
    'left_in_hall_kg', lh.kg::text,
    'left_in_hall_unweighed', lh.unweighed,
    'expects_round', r.live_start > 0,
    'count_diffs', coalesce((select jsonb_agg(jsonb_build_object('birds', c.birds, 'reason', c.reason,
        'source', case when c.doc_kind = 'flock_close' then 'close' else 'manual' end) order by c.created_at, c.id)
      from public.flock_counts c
      where c.org_id = f.org_id and c.flock_id = f.id and c.kind = 'count_adjust' and c.on_date = p_on and c.reverses_id is null
        and not exists (select 1 from public.flock_counts q where q.org_id = c.org_id and q.reverses_id = c.id)), '[]'::jsonb),
    'issues', coalesce((select jsonb_agg(jsonb_build_object('issue_id', x.id, 'doc_no', x.doc_no, 'issued_on', x.issued_on, 'item_id', l.item_id, 'name', i.name, 'cost_kind', l.cost_kind,
        'qty', l.qty_base::text, 'base_unit', l.base_unit, 'kg', private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)::text)
        order by x.posted_at, x.doc_no collate "C", l.line_no)
      from public.flock_issues x
      join public.flock_issue_lines l on l.org_id = x.org_id and l.issue_id = x.id
      join public.items i on i.org_id = l.org_id and i.id = l.item_id
      where x.org_id = f.org_id and x.flock_id = f.id and private.issue_day(x) = p_on and x.status = 'posted'
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
  join private.report_days_extra(f, p_on) as e on e.on_date = r.on_date
  cross join lateral private.hall_left(f, r.on_date, r.given_cum_kg, e.out_cum_kg, e.used_cum_kg, r.feed_cum_kg, r.given_cum_unweighed, e.out_cum_unweighed,
    e.used_cum_unweighed) as lh
  where r.on_date = p_on
$$;

-- مجاميع القاعات المعروضة (الجسم الأخير من 0029): الغاز.
create or replace function private.halls_day_totals(p_halls jsonb) returns jsonb
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object(
    'halls', count(*)::int,
    'flocks', (count(*) filter (where jsonb_typeof(e.h -> 'flock') = 'object'))::int,
    'rounds', (count(*) filter (where (e.h -> 'flock' ->> 'round')::boolean))::int,
    'live_start', coalesce(sum((e.h -> 'flock' ->> 'live_start')::bigint), 0),
    'dead', sum((e.h -> 'flock' ->> 'dead')::bigint),
    'culled', sum((e.h -> 'flock' ->> 'culled')::bigint),
    -- 0035: قناني الغاز للقاعات التي سُجّل لها (فارغ بلا تسجيل، كالنافق).
    'gas', sum((e.h -> 'flock' ->> 'gas')::bigint),
    'live_end', coalesce(sum((e.h -> 'flock' ->> 'live_end')::bigint), 0),
    'feed_eaten_kg', round(sum((e.h -> 'flock' ->> 'feed_eaten_kg')::numeric), 3)::text,
    'feed_eaten_flocks', count(e.h -> 'flock' ->> 'feed_eaten_kg')::int,
    'feed_given_kg', coalesce(sum((e.h -> 'flock' ->> 'feed_given_kg')::numeric), 0)::text,
    'feed_given_unweighed', coalesce(sum((e.h -> 'flock' ->> 'feed_given_unweighed')::int), 0)::int,
    'sold', coalesce(sum((e.h -> 'flock' ->> 'sold')::bigint), 0),
    'count_diff', coalesce(sum((e.h -> 'flock' ->> 'count_diff')::bigint), 0),
    'ticketed', coalesce(sum((e.h -> 'flock' ->> 'ticketed')::bigint), 0),
    -- مراجعة 0028 O7: الأفواج التي تنتظر جولة اليوم (بدأ يومها بطيور حيّة)؛ والفوج الذي بيع كلّه قبله لا يُعدّ جولةً ناقصة.
    'rounds_expected', (count(*) filter (where (e.h -> 'flock' ->> 'expects_round')::boolean))::int)
  from jsonb_array_elements(coalesce(p_halls, '[]'::jsonb)) as e(h)
$$;

-- تقرير الدورة (الجسم الأخير من 0029): سطور العلف بيوم القاعة وتاريخ خروجها، والغاز في كلّ يوم وفي المؤشّرات.
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
  v_counts bigint;
  v_sold bigint;
  v_sold_kg numeric;
  v_adjust bigint;
  v_sale_age numeric;
  v_close_id uuid;
  v_close jsonb;
  v_reason text;
  v_sales jsonb;
  v_carry_in jsonb;
begin
  perform private.require('read');
  f := private.flock_for(p_flock, false);
  if f.placed_on is null then
    raise exception 'flock_not_placed' using hint = 'هذا الفوج لم يُسكَّن بعد، فلا تقرير له.';
  end if;
  select coalesce(sum(y.dead), 0)::int, coalesce(sum(y.culled), 0)::int, coalesce(sum(y.feed_kg), 0) into v_dead, v_culled, v_consumed
  from public.flock_daily y where y.org_id = f.org_id and y.flock_id = f.id;
  -- 0028: المباع وفرق العدّ (الأصول الحيّة)، وعمر البيع موزوناً بالطيور، وسبب فرق العدّ عند الإغلاق.
  select coalesce(sum(k.sold), 0), coalesce(sum(k.sold_kg), 0), coalesce(sum(k.adjust), 0) into v_sold, v_sold_kg, v_adjust
  from private.flock_count_days(f.id) as k;
  v_counts := v_adjust - v_sold;
  select case when sum(k.sold::numeric * (k.on_date - f.placed_on + f.age_days_at_placement)) > 0
      then private._mul_div_round(sum(k.sold::numeric * (k.on_date - f.placed_on + f.age_days_at_placement)), 1, sum(k.sold), 1)
    when sum(k.sold) > 0 then 0 end
  into v_sale_age
  from private.flock_count_days(f.id) as k where k.sold > 0;
  select c.id, c.count_reason into v_close_id, v_reason from public.flock_closes c where c.org_id = f.org_id and c.flock_id = f.id and c.status = 'closed';
  with lines as (
    -- 0035: السطر على يومه في القاعة (issue_day) وتاريخ خروجه من المخزن (stock_on).
    select private.issue_day(x) as issued_on, x.issued_on as stock_on, x.doc_no, x.posted_at, x.id, l.line_no, l.item_id, i.name, l.qty_base, l.base_unit,
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
    'lines', coalesce((select jsonb_agg(jsonb_build_object('on', r.issued_on, 'issued_on', r.stock_on, 'doc_no', r.doc_no, 'item_name', r.name, 'qty', r.qty_base::text,
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
  -- 0027: الأيّام والأسابيع والأوزان والمؤشّرات حتى «حتى»، من report_days مرّة واحدة (و0028: البيع والعدّ والعلف المنقول والخارج).
  v_through := coalesce(f.closed_on, v_today);
  with r as materialized (
    select d.*, e.sold, e.sold_kg, e.sold_cum, e.sold_cum_kg, e.adjust, e.adjust_cum, e.carry_in_kg, e.carry_in_cum_kg, e.out_kg, e.out_unweighed,
      e.out_cum_kg, e.out_cum_unweighed,
      -- مراجعة 0028 O2/M5: ما في القاعة بتعريفه الواحد (private.hall_left: وصفر يوم الإغلاق).
      lh.kg as left_kg, lh.unweighed as left_unweighed,
      -- 0035: قناني الغاز في اليوم.
      gs.cylinders as gas
    from private.report_days(f, v_through) as d join private.report_days_extra(f, v_through) as e on e.on_date = d.on_date
    left join public.flock_day_gas gs on gs.org_id = f.org_id and gs.flock_id = f.id and gs.on_date = d.on_date
    cross join lateral private.hall_left(f, d.on_date, d.given_cum_kg, e.out_cum_kg, e.used_cum_kg, d.feed_cum_kg, d.given_cum_unweighed, e.out_cum_unweighed,
      e.used_cum_unweighed) as lh
  ), k as (
    select * from r where r.on_date = v_through
  ), w as (
    select greatest(1, div(r.age + 6, 7))::int as week, r.* from r
  ), wk as (
    select w.week, jsonb_build_object('week', w.week, 'from_age', min(w.age), 'to_age', max(w.age), 'from_on', min(w.on_date), 'to_on', max(w.on_date),
      'days', count(*)::int, 'round_days', (count(*) filter (where w.has_round))::int,
      -- مراجعة 0028 O7: أيّام الأسبوع التي تنتظر جولة (بدأت بطيور حيّة).
      'expected_days', (count(*) filter (where w.live_start > 0))::int,
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
  ), m as (
    select k.*,
      case when k.given_cum_unweighed + k.out_cum_unweighed = 0 then k.given_cum_kg - k.out_cum_kg end as net_feed,
      case when v_sold > 0 then private._mul_div_round(v_sold_kg, 1, v_sold, 3) end as sold_avg
    from k
  ), fc as (
    select m.*, case when f.status = 'closed' and m.net_feed > 0 and v_sold_kg > 0 then private._mul_div_round(m.net_feed, 1, v_sold_kg, 3) end as fcr_final
    from m
  )
  select jsonb_build_object(
    'days', coalesce((select jsonb_agg(jsonb_build_object('on', r.on_date, 'age', r.age, 'day_no', r.day_no, 'round', r.has_round,
        'live_start', r.live_start, 'dead', r.dead, 'culled', r.culled, 'live_end', r.live_end, 'mortality_cum_pct', r.mortality_cum_pct,
        'feed_eaten_kg', round(r.feed_kg, 3)::text, 'feed_eaten_cum_kg', r.feed_cum_kg::text, 'feed_given_kg', r.given_kg::text,
        'feed_given_unweighed', r.given_unweighed, 'feed_given_cum_kg', r.given_cum_kg::text, 'feed_given_cum_unweighed', r.given_cum_unweighed,
        'feed_left_kg', (r.given_cum_kg - r.out_cum_kg - r.feed_cum_kg)::text,
        'weight', case when r.weight_avg_g is not null then jsonb_build_object('sample_count', r.weight_count, 'avg_g', round(r.weight_avg_g, 1)::text) end,
        'eggs_total', case when f.kind = 'layer' then r.eggs_total end, 'hdep', r.hdep, 'note', r.note,
        'sold', r.sold, 'sold_net_kg', round(r.sold_kg, 3)::text, 'sold_cum', r.sold_cum, 'sold_cum_net_kg', round(r.sold_cum_kg, 3)::text,
        'count_diff', r.adjust, 'count_diff_cum', r.adjust_cum, 'feed_carry_in_kg', r.carry_in_kg::text, 'feed_out_kg', r.out_kg::text,
        'feed_out_unweighed', r.out_unweighed, 'feed_out_cum_kg', r.out_cum_kg::text, 'feed_out_cum_unweighed', r.out_cum_unweighed,
        'left_in_hall_kg', r.left_kg::text, 'left_in_hall_unweighed', r.left_unweighed, 'expects_round', r.live_start > 0, 'gas', r.gas) order by r.on_date) from r),
      '[]'::jsonb),
    'weeks', coalesce((select jsonb_agg(wk.j order by wk.week) from wk), '[]'::jsonb),
    'weights', coalesce((select jsonb_agg(jsonb_build_object('on_date', x.on_date, 'age', x.on_date - f.placed_on + f.age_days_at_placement,
        'sample_count', x.sample_count, 'avg_g', round(x.avg_g, 1)::text) order by x.on_date)
      from public.flock_weights x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date between f.placed_on and v_through), '[]'::jsonb),
    'kpis', (select jsonb_build_object('days', (select count(*)::int from r), 'age_end', fc.age, 'placed', f.placed_count,
        'dead', fc.dead_cum, 'culled', fc.culled_cum, 'live', fc.live_end,
        'mortality_pct', fc.mortality_cum_pct, 'livability_pct', (100 - fc.mortality_cum_pct::numeric)::text,
        'feed_given_kg', fc.given_cum_kg::text, 'feed_eaten_kg', fc.feed_cum_kg::text, 'feed_left_kg', (fc.given_cum_kg - fc.out_cum_kg - fc.feed_cum_kg)::text,
        'feed_days', fc.feed_days, 'feed_span', fc.feed_span,
        'feed_per_bird_kg', case when fc.feed_cum_kg > 0 and f.placed_count > 0 then private._mul_div_round(fc.feed_cum_kg, 1, f.placed_count, 3)::text end,
        'last_weight', case when fc.last_weight_on is not null then jsonb_build_object('on_date', fc.last_weight_on,
          'age', fc.last_weight_on - f.placed_on + f.age_days_at_placement, 'avg_g', round(fc.last_weight_avg_g, 1)::text) end,
        'fcr', fc.fcr::text,
        'epef', case when fc.fcr > 0 and fc.last_weight_avg_g > 0 and 100 - fc.mortality_cum_pct::numeric > 0 and fc.age > 0
          then private._mul_div_round((100 - fc.mortality_cum_pct::numeric) * fc.last_weight_avg_g, 1, 10 * fc.age * fc.fcr, 0)::text end,
        'sold_birds', v_sold, 'sold_net_kg', round(v_sold_kg, 3)::text, 'sold_avg_kg', fc.sold_avg::text, 'sale_age', v_sale_age::text,
        'count_diff', v_adjust, 'feed_carry_in_kg', fc.carry_in_cum_kg::text, 'feed_out_kg', fc.out_cum_kg::text, 'feed_net_kg', fc.net_feed::text,
        'left_in_hall_kg', fc.left_kg::text, 'left_in_hall_unweighed', fc.left_unweighed,
        'fcr_final', fc.fcr_final::text,
        'gas', (select coalesce(sum(x.gas), 0)::int from r as x),
        'epef_final', case when fc.fcr_final > 0 and fc.sold_avg > 0 and v_sale_age > 0 and 100 - fc.mortality_cum_pct::numeric > 0
          then private._mul_div_round((100 - fc.mortality_cum_pct::numeric) * fc.sold_avg * 1000, 1, 10 * v_sale_age * fc.fcr_final, 0)::text end)
      from (select 1) as one left join fc on true))
  into v_more;
  -- مراجعة 0028 O2/M5: ما في القاعة في قسم العلف أيضاً (القيمة نفسها في المؤشّرات).
  v_feed := v_feed || jsonb_build_object('left_in_hall_kg', v_more -> 'kpis' -> 'left_in_hall_kg', 'left_in_hall_unweighed', v_more -> 'kpis' -> 'left_in_hall_unweighed');
  -- 0028: التذاكر والمباع، والإغلاق القائم بلا مال (وللعلف المنقول المعلَّق مخازنه)، والعلف المنقول إليه.
  v_sales := jsonb_build_object(
    'tickets', coalesce((select jsonb_agg(jsonb_build_object('ticket_id', t.id, 'ticket_no', t.ticket_no, 'status', t.status, 'on_date', t.on_date,
        'birds', s.birds, 'net_kg', s.net_kg::text, 'avg_kg', case when s.net_kg > 0 and s.birds > 0 then private._mul_div_round(s.net_kg, 1, s.birds, 3)::text end,
        'invoiced', b.id is not null, 'doc_no', case when public.can_see_sales() then b.doc_no end) order by t.on_date, t.ticket_no collate "C", t.id)
      from public.weigh_ticket_stops s
      join public.weigh_tickets t on t.org_id = s.org_id and t.id = s.ticket_id
      left join public.bird_sales b on b.org_id = t.org_id and b.ticket_id = t.id and b.status = 'posted'
      where s.org_id = f.org_id and s.flock_id = f.id and t.status <> 'void'), '[]'::jsonb),
    'birds', v_sold, 'net_kg', round(v_sold_kg, 3)::text,
    'avg_kg', case when v_sold > 0 then private._mul_div_round(v_sold_kg, 1, v_sold, 3)::text end,
    'pending_birds', private.flock_ticketed(f.id, null));
  if v_close_id is not null then
    v_close := private.strip_money(private.flock_close_result(v_close_id));
    v_close := jsonb_set(v_close, '{lines}', coalesce((select jsonb_agg(case when e.x ->> 'carry_status' = 'pending'
        then e.x || jsonb_build_object('stores', private.flock_item_stores(f.id, (e.x ->> 'item_id')::uuid)) else e.x end order by e.n)
      from jsonb_array_elements(v_close -> 'lines') with ordinality as e(x, n)), '[]'::jsonb));
  end if;
  v_carry_in := coalesce((select jsonb_agg(jsonb_build_object('line_id', l.id, 'item_id', l.item_id, 'name', i.name, 'qty', l.qty_base::text,
      'base_unit', l.base_unit, 'kg', private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)::text, 'applied_on', l.applied_on,
      'from_flock_id', c.flock_id,
      'money', jsonb_build_object('value', (select z.amount::text from public.flock_costs z where z.org_id = l.org_id and z.doc_kind = 'flock_carry'
        and z.doc_id = l.close_id and z.doc_line_id = l.id and z.flock_id = f.id and z.reverses_id is null limit 1))) order by l.applied_on, l.line_no)
    from public.flock_close_lines l
    join public.flock_closes c on c.org_id = l.org_id and c.id = l.close_id
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where l.org_id = f.org_id and l.to_flock_id = f.id and l.carry_status = 'applied'), '[]'::jsonb);
  return private.mask(jsonb_build_object(
    'flock', private.hall_flock_json(f),
    'today', v_today,
    'through', coalesce(f.closed_on, v_today),
    'birds', jsonb_build_object('placed', f.placed_count, 'dead', v_dead, 'culled', v_culled, 'live', f.placed_count - v_dead - v_culled + v_counts,
      'mortality_pct', private.flock_pct(v_dead + v_culled, f.placed_count)::text,
      'sold', v_sold, 'sold_net_kg', round(v_sold_kg, 3)::text, 'count_diff', v_adjust, 'count_reason', v_reason),
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
        'total', coalesce(sum(c.amount), 0)::text,
        'returned', (-coalesce(sum(c.amount) filter (where c.doc_kind = 'flock_return'), 0))::text,
        'carried_in', coalesce(sum(c.amount) filter (where c.doc_kind = 'flock_carry' and not exists (select 1 from public.flock_closes z
          where z.org_id = c.org_id and z.id = c.doc_id and z.flock_id = f.id)), 0)::text,
        'carried_out', (-coalesce(sum(c.amount) filter (where c.doc_kind = 'flock_carry' and exists (select 1 from public.flock_closes z
          where z.org_id = c.org_id and z.id = c.doc_id and z.flock_id = f.id)), 0))::text,
        'revenue', (select coalesce(sum(s.revenue), 0) from public.bird_sale_sources s join public.bird_sales b on b.org_id = s.org_id and b.id = s.sale_id
          where s.org_id = f.org_id and s.flock_id = f.id and b.status = 'posted')::text)
      from public.flock_costs c where c.org_id = f.org_id and c.flock_id = f.id)) || v_more
    || jsonb_build_object('sales', v_sales, 'close', v_close, 'carry_in', private.mask(v_carry_in),
      -- مراجعة 0028 O3: كلّ فرق عدّ حيّ بيومه وعدده وسببه ومصدره (يدويّ أو الإغلاق)؛ وbirds.count_reason سبب الإغلاق وحده.
      'count_diffs', coalesce((select jsonb_agg(jsonb_build_object('on', c.on_date, 'birds', c.birds, 'reason', c.reason,
          'source', case when c.doc_kind = 'flock_close' then 'close' else 'manual' end) order by c.on_date, c.created_at, c.id)
        from public.flock_counts c
        where c.org_id = f.org_id and c.flock_id = f.id and c.kind = 'count_adjust' and c.reverses_id is null
          and not exists (select 1 from public.flock_counts q where q.org_id = c.org_id and q.reverses_id = c.id)), '[]'::jsonb)));
end
$$;

-- «من أوّل ما بدينا» (الجسم الأخير من 0031): الغاز في كلّ يوم وشهر وفي «منذ البداية».
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
        r.eggs_total, r.eggs_broken, e.sold, e.sold_kg, e.adjust, e.carry_in_kg, e.carry_in_unweighed, gs.cylinders as gas
      from private.report_days(fl.f, fl.through) as r
      join private.report_days_extra(fl.f, fl.through) as e on e.on_date = r.on_date
      -- 0035: قناني الغاز في اليوم.
      left join public.flock_day_gas gs on gs.org_id = v_org and gs.flock_id = fl.id and gs.on_date = r.on_date
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
      sum(z.gas)::bigint as gas,
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
      coalesce(sum(dd.culled), 0)::bigint as culled, coalesce(sum(dd.gas), 0)::bigint as gas, sum(dd.sold)::bigint as sold, sum(dd.count_diff)::bigint as count_diff,
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
          'placed', dd.placed, 'live_start', dd.live_start, 'dead', dd.dead, 'culled', dd.culled, 'gas', dd.gas, 'sold', dd.sold, 'count_diff', dd.count_diff,
          'live_end', dd.live_end, 'feed_kg', dd.feed_kg::text, 'given_kg', dd.given_kg::text, 'given_unweighed', dd.given_unweighed,
          'eggs_total', dd.eggs_total, 'eggs_broken', dd.eggs_broken, 'hdep', private.flock_pct(dd.eggs_total, dd.egg_live)) order by dd.d)
        from dd where dd.kind = ks.kind and dd.d between v_month and v_end), '[]'::jsonb),
      'months', (select jsonb_agg(jsonb_build_object('month', mm.m, 'days', mm.days, 'placed', mm.placed, 'dead', mm.dead, 'culled', mm.culled, 'gas', mm.gas,
          'sold', mm.sold, 'count_diff', mm.count_diff, 'feed_kg', mm.feed_kg::text, 'given_kg', mm.given_kg::text, 'given_unweighed', mm.given_unweighed,
          'eggs_total', mm.eggs_total, 'eggs_broken', mm.eggs_broken, 'hdep', private.flock_pct(mm.eggs_total, mm.egg_live), 'live_end', mm.live_end,
          'opened', mm.opened, 'closed', mm.closed) order by mm.m)
        from mm where mm.kind = ks.kind),
      'total', (select jsonb_build_object('days', sum(mm.days)::int, 'placed', sum(mm.placed)::bigint, 'dead', sum(mm.dead)::bigint,
          'culled', sum(mm.culled)::bigint, 'gas', sum(mm.gas)::bigint, 'sold', sum(mm.sold)::bigint, 'count_diff', sum(mm.count_diff)::bigint, 'feed_kg', sum(mm.feed_kg)::text,
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

-- تقويم القاعة (الجسم الأخير من 0029): الغاز في كلّ يوم وفي المجموع، والصرف بيوم القاعة.
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
      'vaccinate', v_active and public.can('flock_day.save'), 'undo_issue', v_active and public.can('void')),
    'days', (select jsonb_agg(jsonb_build_object(
        'on', g.d,
        'age', case when g.d < f.placed_on or (f.closed_on is not null and g.d > f.closed_on) then null else f.age_days_at_placement + (g.d - f.placed_on) end,
        'dead', y.dead, 'culled', y.culled, 'feed_kg', y.feed_kg::text, 'note', y.note,
        -- 0035: قناني الغاز في اليوم (فارغ بلا تسجيل).
        'gas', gs.cylinders,
        'sold', coalesce((select k.sold from private.flock_count_days(f.id) as k where k.on_date = g.d), 0),
        'count_diff', coalesce((select k.adjust from private.flock_count_days(f.id) as k where k.on_date = g.d), 0),
        'out', case when g.d = f.closed_on then coalesce((select jsonb_agg(jsonb_build_object('kind', l.action, 'doc_no', r.doc_no, 'name', i.name,
            'qty', l.qty_base::text, 'base_unit', l.base_unit, 'kg', private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)::text)
            order by l.line_no)
          from public.flock_closes c join public.flock_close_lines l on l.org_id = c.org_id and l.close_id = c.id
          join public.items i on i.org_id = l.org_id and i.id = l.item_id
          left join public.flock_returns r on r.org_id = l.org_id and r.close_line_id = l.id and r.source = 'close'
          where c.org_id = f.org_id and c.flock_id = f.id and c.status = 'closed'), '[]'::jsonb) else '[]'::jsonb end,
        'carry_in', case when g.d = f.placed_on then coalesce((select jsonb_agg(jsonb_build_object('line_id', l.id, 'name', i.name, 'qty', l.qty_base::text,
            'base_unit', l.base_unit, 'kg', private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)::text) order by l.line_no)
          from public.flock_close_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
          where l.org_id = f.org_id and l.to_flock_id = f.id and l.carry_status = 'applied'), '[]'::jsonb) else '[]'::jsonb end,
        'issues', coalesce((select jsonb_agg(jsonb_build_object('issue_id', x.id, 'doc_no', x.doc_no, 'issued_on', x.issued_on, 'item_id', l.item_id, 'name', i.name, 'cost_kind', l.cost_kind,
            'qty', l.qty_base::text, 'base_unit', l.base_unit, 'kg', private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)::text)
            order by x.posted_at, x.doc_no collate "C", l.line_no)
          from public.flock_issues x
          join public.flock_issue_lines l on l.org_id = x.org_id and l.issue_id = x.id
          join public.items i on i.org_id = l.org_id and i.id = l.item_id
          where x.org_id = f.org_id and x.flock_id = f.id and private.issue_day(x) = g.d and x.status = 'posted'
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
      left join public.flock_daily y on y.org_id = f.org_id and y.flock_id = f.id and y.on_date = g.d
      left join public.flock_day_gas gs on gs.org_id = f.org_id and gs.flock_id = f.id and gs.on_date = g.d),
    'totals', jsonb_build_object(
      'feed_kg', (select coalesce(sum(private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)), 0)::text
        from public.flock_issues x join public.flock_issue_lines l on l.org_id = x.org_id and l.issue_id = x.id
        where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted' and l.cost_kind = 'feed' and private.issue_day(x) between v_first and v_last),
      'dead', (select coalesce(sum(y.dead), 0)::int from public.flock_daily y where y.org_id = f.org_id and y.flock_id = f.id and y.on_date between v_first and v_last),
      'culled', (select coalesce(sum(y.culled), 0)::int from public.flock_daily y where y.org_id = f.org_id and y.flock_id = f.id and y.on_date between v_first and v_last),
      'gas', (select coalesce(sum(g.cylinders), 0)::int from public.flock_day_gas g where g.org_id = f.org_id and g.flock_id = f.id and g.on_date between v_first and v_last)));
end
$$;

-- ─── ك. الحرّاس القائمون ───────────────────────────────────────────────────────────────────────────────────────────
-- تعديل الفوج (الجسم الأخير من 0029): الصرف بيوم القاعة والغاز المسجَّل في «أوّل سجلّ».
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

-- أوّل نشاط على الفوج بعد يوم (الجسم الأخير من 0029): والغاز المسجَّل، فلا تُغلق الوجبة قبل يوم غاز.
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

-- حذف الوجبة (الجسم الأخير من 0032؛ مراجعة 0035): الغاز المسجَّل يمنعه بتلميح يسمّي «الغاز» (كان يقع على المفتاح الأجنبيّ بجملة عامّة)، والممسوح يُحذف معها.
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

-- ─── ل. الثابت (مفتاح الخادم) ────────────────────────────────────────────────────────────────────────────────────────
-- الجداول مباشرة، ثمّ الورقة لكلّ وجبة مسكَّنة بهويّة مالك منشأتها: مجاميعها = مجموع أيّامها وصافي العلف = المرسل − الراجع، وعلف كلّ يوم = سطور الصرف الحيّة
-- بيوم القاعة والمنقول إليها بيوم تطبيقه، والراجع يوم الإغلاق = سطور الإرجاع والنقل (محسوبة هنا بلا issue_day ولا issue_mass_kg، فطفرة في أيّهما يمسكها
-- الثابت لا يكرّرها)، ولا سطر خارج أيّام الورقة؛ ومعامل تحويل الوجبة المغلقة في الورقة = fcr_final في تقرير الدورة (مراجعة 0035).
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
      begin
        v_s := public.hall_sheet(v_flock.id);
        v_totals := v_totals + (
          select count(*) from (
            select coalesce(sum((d.j ->> 'dead')::bigint), 0) as dead, coalesce(sum((d.j ->> 'gas')::bigint), 0) as gas,
              coalesce(sum((d.j ->> 'feed_kg')::numeric), 0) as feed_kg, coalesce(sum((d.j ->> 'feed_back_kg')::numeric), 0) as back_kg,
              coalesce(sum((d.j ->> 'sold_birds')::bigint), 0) as sold, coalesce(sum((d.j ->> 'sold_net_kg')::numeric), 0) as sold_kg,
              coalesce(sum((d.j ->> 'eggs_total')::bigint), 0) as eggs
            from jsonb_array_elements(v_s -> 'days') as d(j)
          ) as s
          where (v_s -> 'totals' ->> 'dead')::bigint <> s.dead or (v_s -> 'totals' ->> 'gas')::bigint <> s.gas
            or (v_s -> 'totals' ->> 'feed_kg')::numeric <> s.feed_kg or (v_s -> 'totals' ->> 'feed_back_kg')::numeric <> s.back_kg
            or (v_s -> 'summary' ->> 'feed_net_kg')::numeric <> s.feed_kg - s.back_kg
            or (v_s -> 'totals' ->> 'sold_birds')::bigint <> s.sold
            or (v_s -> 'totals' ->> 'sold_net_kg')::numeric <> s.sold_kg
            or (v_s -> 'totals' ->> 'eggs_total')::bigint is distinct from (case when v_flock.kind = 'layer' then s.eggs end));
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
      -- الوجبة المغلقة: معامل التحويل في الورقة = fcr_final في تقرير الدورة (الصافي نفسه وصافي المباع نفسه).
      if v_flock.status = 'closed' then
        begin
          v_fcr := v_fcr + (case when (public.hall_sheet(v_flock.id) -> 'summary' ->> 'fcr')::numeric
            is distinct from (public.flock_cycle_report(v_flock.id) -> 'kpis' ->> 'fcr_final')::numeric then 1 else 0 end);
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

-- ─── م. الصلاحيات ──────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.set_flock_gas(uuid, date, integer, bigint, uuid, boolean), public.send_flock_feed(uuid, uuid, uuid, uuid, uuid, numeric, date),
  public.decide_flock_reject(uuid, text, integer), public.hall_sheet(uuid), public.day_balance_sections(date) from public, anon;
grant execute on function public.set_flock_gas(uuid, date, integer, bigint, uuid, boolean), public.send_flock_feed(uuid, uuid, uuid, uuid, uuid, numeric, date),
  public.decide_flock_reject(uuid, text, integer), public.hall_sheet(uuid), public.day_balance_sections(date) to authenticated;
revoke all on function public.verify_hall_sheet() from public, anon, authenticated;
grant execute on function public.verify_hall_sheet() to service_role;
