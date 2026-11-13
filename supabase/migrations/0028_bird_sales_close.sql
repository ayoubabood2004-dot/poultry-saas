-- 0028_bird_sales_close — «بيع الطيور وإغلاق الدورة»، التسليم الثاني من خطّة تقارير القاعات (كلمة المالك 2026-11-12 وأجوبته الأخيرة؛
--   docs/HALLS_REPORTS_PLAN.md التسليم ٢؛ DECISIONS «تقارير القاعات»): تذكرة القبّان، وفاتورة الطيور BR، وعدد الطيور (المباع وفرق العدّ)،
--   وإغلاق الدورة وإعادة فتحها، والعلف الباقي (يرجع إلى مخزن جاء منه، أو يُحسب مستهلَكاً، أو ينتقل للدورة التالية في القاعة).
-- المشكلة: لا شيء ينهي دورة (closed_on لا يُكتب)، ولا بيع للطيور ولا تذكرة وزن، فالحيّ = المسكَّن − النافق − المستبعد ولا يعرف مباعاً ولا فرق عدّ،
--   ولا «تقرير كامل بنهاية الدورة» بمعامل تحويل نهائيّ ولا مؤشّر إنتاج نهائيّ؛ والعلف الباقي في القاعة عند نهاية الدورة لا طريق له.
-- هنا:
--   • flock_counts (يُضاف ولا يُعدَّل، والعكس صفّ بـreverses_id): المباع (من الفاتورة) وفرق العدّ (من الإغلاق أو وحده للمدير)؛ والحيّ في كلّ قارئ
--     وكاتب = المسكَّن − النافق − المستبعد + مجموعها، ولا يصير سالباً في أيّ يوم (private.flock_live_check بعد كلّ كاتب ينقصه).
--   • weigh_tickets ووقفاتها ووزناتها: مسوّدة تُحفظ بشرط النسخة بعد كلّ وزنة (save_weigh_ticket تُعاد بأمان بالمحتوى)، ثمّ finish_weigh_ticket برقم WT،
--     وvoid_weigh_ticket؛ بلا مال، يقرؤها كلّ دور في نطاق الحقل. صافي القاعة = خابطها − الخابط قبلها (− أقفاصها × وزن القفص إن وُزن الفارغ بلاها)،
--     وفي ميزان الأقفاص مجموع وزناتها − أقفاصها × وزن القفص؛ ومجموع الصافي = صافي التذكرة بالضبط.
--   • bird_sales (BR) وbird_sale_sources: record_bird_sale بنداء واحد (تاجر واحد وتذكرة واحدة، سعر الكيلو × الصافي بعد تنزيل 0–10٪، والمبلغ بالدينار
--     الصحيح، و«المقبوض الآن» إلى صندوق)، وقيد على حساب التاجر في الدفتر الرئيسيّ لوحدة اللاحم، وصفّ «مباع» لكلّ فوج بإيراده مقسوماً بصافي قاعته
--     بأكبر الباقي؛ والطيور تخرج من القاعة عند الفاتورة (القاعدة ٣٧). void_bird_sale للمدير يعكس القيد والطيور، والمقبوض يبقى رصيداً للتاجر، ويُرفض
--     على دورة مغلقة. record_flock_count_adjust: «فرق العدّ» وحده للمدير بسبب.
--   • flock_closes وflock_close_lines وflock_returns (FR) وflock_return_lines وflock_close_values (لقطة الكلفة لأدوارها): close_flock للمدير يوم البيع
--     حتى 7 أيّام مضت، والمباع من الفواتير، وفرق العدّ = −الحيّ بسبب؛ ولكلّ مادّة باقية مصيرها: يرجع إلى مخزن جاء منه (دفعة جديدة بأصغر ترتيب
--     وأقرب انتهاء لدفعاته، وقيمته بمعدّل كلفة المادّة في القاعة، القاعدة ١٦: إرجاع الكلّ يُخرج كلفته كلّها بالضبط)، أو يُحسب مستهلَكاً، أو ينتقل
--     للدورة التالية (معلَّق على القاعة حتى يُسكَّن فوجها التالي فيطبّقه open_flock، ويرجع إلى مخزن قبل ذلك بـreturn_hall_carry). reopen_flock
--     للمدير بسبب ما دام لم يُسكَّن فوج جديد ولم يُستعمل الراجع.
--   • القرّاء: weigh_ticket وweigh_ticket_options وweigh_tickets وbird_sale_form وbird_sale_detail وflock_close_form وflock_sales؛ ومفاتيح جديدة فقط في
--     القرّاء القائمة (flock_summary وflock_detail وتقارير 0027 وflock_month وflock_feed والمبيعات والمال): المباع وفرق العدّ والتذاكر والعلف الراجع
--     والمنقول، ومعامل التحويل النهائيّ ومؤشّر الإنتاج النهائيّ بعد الإغلاق.
--   • الثوابت: verify_bird_sales وverify_flock_close، وverify_flocks (الحيّ بالعدد ولكلّ يوم)، وverify_stock (الراجع من القاعة في حفظ القيمة)،
--     وverify_money (تفصيل فاتورة الطيور = قيدها).
-- انحرافات مكتوبة بلا سؤال (DECISIONS «بيع الطيور وإغلاق الدورة»، العقد contract-0028 §0):
--   • D1 اللاحم وحده: التذكرة والفاتورة والإغلاق ترفض البيّاض (site_not_broiler وclose_layer_later)؛ بيع الدجاج المستبعد وإغلاق البيّاض لاحقاً.
--   • D2 نسبة التنزيل شرط تسعير في الفاتورة، والتذكرة أوزان فقط. D3 تاريخ الفاتورة = يوم التذكرة بقاعدة التاريخ العادية.
--   • D4 جدول واحد يُضاف ولا يُعدَّل للعدد؛ العكس بيوم الإلغاء، وقرّاء الأيّام يعدّون الأصول الحيّة وحدها بتاريخها، فالفاتورة الملغاة تختفي من
--     التاريخ كالصرف الملغى في 0027. D5 «فرق العدّ» وحده للمدير حين يزيد العدد الفعليّ، والفاتورة ترفض birds_over_live وتدلّه عليه.
--   • D6 الحيّ لا يصير سالباً في أيّ يوم. D7 سطر باقٍ واحد لكلّ مادّة، وكلّ إرجاع مستند مخزون مرقَّم FR. D8 الإغلاق يحمل ما رأته الشاشة (الحيّ
--     والمباع وما نزل لكلّ مادّة) ويقارنه تحت قفل الفوج. D9 التذكرة بالشبكة. D10 كتلة سطر الباقي بكثافة آخر سطر نزل من المادّة أو وزن قطعته.
--   • D11 قرّاء المال والمبيعات يزيدون مفاتيح للطيور، والقديمة بشكلها ومعناها. D12 التطبيق والدمج معاً (أنواع جديدة في تفصيل القيد).
--   • المباع وفرق العدّ يُسجَّلان على صفّ flock_counts لا على الجولة؛ ولا قرار رفض المركونة (decide_flock_day_reject، P1) في هذه النسخة.
-- المراجعة العدائية (أربع زوايا: المال والمخزون، والتزامن والنطاق، ويوم المالك، والشاشات؛ كلّ إصلاح بفحص فشل قبله، supabase/tests/birds28-fixes.test.mjs):
--   إعادة الفتح بنطاق مخزن كلّ FR (C1/M1) ولا تُعاد في قاعة مؤرشفة (M2)، والمنقول الذي أُرجع ولم يُسحب منه يُلغى إرجاعه مع إرجاع الإغلاق (O1، O5)؛
--   المقبوض الذي رُدّ صفر بقاعدة 0021 (M3)؛ الإغلاق بشرط بصمة ما في القاعة كميةً وقيمةً (p_expected_plan، M4)؛ ما في القاعة بتعريف واحد
--   (left_in_hall_kg، O2/M5)؛ فروق العدّ بأسبابها (count_diffs، O3)؛ البطاقة لا تعد بإعادة فتح مرفوضة (reopen_why، O6)؛ يوم بدأ بلا طير حيّ لا ينتظر جولة
--   ولا علفاً (O7)؛ اليوم المقترح داخل المسموح (O8)؛ معرّفات الوقفات والوزنات بأقفالها وتحديثها مقصور على تذكرتها (C2)؛ نطاق التذكرة القائمة قبل قفلها (C4)؛
--   السعر المقترح بالنطاق (C5)؛ التلميحات (C7)؛ الثوابت close_values وreturn_store وcount_reversals (M7–M9)؛ ويوم الخادم في البطاقة والإلغاء (S1، S9)؛
--   ولا تُعرض فاتورة يرفضها الكاتب (ticket_invoice_block: too_old وperiod_locked وout_of_scope، O4؛ وتأريخ الفاتورة المتأخّرة ينتظر جواب المالك).
-- تراجع: rollback_0028.sql — يرفض بصوت ولا يغيّر شيئاً إن وُجدت تذكرة أو فاتورة طيور أو عدد أو إغلاق أو إرجاع أو نقل (أو أثرها في الكلفة والمخزون
--   والعدّادات وسجلّ التدقيق)؛ وإلّا يُسقط الجديد ويرجّع القيود الخمسة والأجسام القديمة كما كانت حرفاً بحرف (0012 و0019 و0021 و0024 و0026 و0027).
-- تنعاد بأمان: create table if not exists، وcreate or replace، وcreate index if not exists، وكتل do تفحص الكتالوج قبل القيود والسياسات.

set lock_timeout = '5s';

-- ─── أ. القيود: نوع الإرجاع في المخزون، وأرقام التذكرة والفاتورة والإرجاع، ومصدرا كلفة الفوج الجديدان ──────────────────────────────
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'stock_moves_doc_kind_check' and conrelid = 'public.stock_moves'::regclass
    and pg_get_constraintdef(oid) not like '%flock_return%') then
    alter table public.stock_moves drop constraint stock_moves_doc_kind_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_moves_doc_kind_check' and conrelid = 'public.stock_moves'::regclass) then
    alter table public.stock_moves add constraint stock_moves_doc_kind_check
      check (doc_kind in ('opening', 'receipt', 'supplier_return', 'receipt_revalue', 'transfer', 'count', 'stock_use', 'production', 'flock_issue',
        'conversion', 'sale', 'flock_return'));
  end if;
  if exists (select 1 from pg_constraint where conname = 'stock_lots_source_kind_check' and conrelid = 'public.stock_lots'::regclass
    and pg_get_constraintdef(oid) not like '%flock_return%') then
    alter table public.stock_lots drop constraint stock_lots_source_kind_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_lots_source_kind_check' and conrelid = 'public.stock_lots'::regclass) then
    alter table public.stock_lots add constraint stock_lots_source_kind_check
      check (source_kind in ('opening', 'receipt', 'transfer', 'count_gain', 'production', 'conversion', 'flock_return'));
  end if;
  if exists (select 1 from pg_constraint where conname = 'doc_counters_kind_check' and conrelid = 'public.doc_counters'::regclass
    and pg_get_constraintdef(oid) not like '%''WT''%') then
    alter table public.doc_counters drop constraint doc_counters_kind_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'doc_counters_kind_check' and conrelid = 'public.doc_counters'::regclass) then
    alter table public.doc_counters add constraint doc_counters_kind_check
      check (kind in ('PU', 'RT', 'TR', 'CT', 'SU', 'RC', 'PY', 'OF', 'PD', 'FI', 'CV', 'FD', 'MD', 'MS', 'WT', 'BR', 'FR'));
  end if;
  if exists (select 1 from pg_constraint where conname = 'flock_costs_doc_kind_check' and conrelid = 'public.flock_costs'::regclass
    and pg_get_constraintdef(oid) not like '%flock_carry%') then
    alter table public.flock_costs drop constraint flock_costs_doc_kind_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'flock_costs_doc_kind_check' and conrelid = 'public.flock_costs'::regclass) then
    alter table public.flock_costs add constraint flock_costs_doc_kind_check check (doc_kind in ('flock_issue', 'flock_return', 'flock_carry'));
  end if;
  if exists (select 1 from pg_constraint where conname = 'flock_costs_expense_check' and conrelid = 'public.flock_costs'::regclass
    and pg_get_constraintdef(oid) not like '%flock_carry%') then
    alter table public.flock_costs drop constraint flock_costs_expense_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'flock_costs_expense_check' and conrelid = 'public.flock_costs'::regclass) then
    alter table public.flock_costs add constraint flock_costs_expense_check
      check (doc_kind not in ('flock_issue', 'flock_return', 'flock_carry') or expense_id is null);
  end if;
end
$$;

-- ─── ب. الجداول ──────────────────────────────────────────────────────────────────────────────────────────────────
-- عدد الطيور (FOUNDATION ٣٧٤): يُضاف ولا يُعدَّل. المباع من سطر الفاتورة (سالب، والعكس موجب بيوم الإلغاء)، وفرق العدّ من الإغلاق أو وحده بسببه.
-- القاعة والحقل والوحدة من الفوج (المفتاح المركّب للقاعة). «الأصل الحيّ» = صفّ ليس عكساً ولا عكس له؛ ومجموع الكلّ = مجموع الأصول الحيّة.
create table if not exists public.flock_counts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  flock_id uuid not null,
  hall_id uuid not null,
  site_id uuid not null,
  division_id uuid not null,
  on_date date not null,
  kind text not null,
  birds int not null,
  net_kg numeric,
  doc_kind text not null,
  doc_id uuid not null,
  doc_line_id uuid,
  reason text,
  reverses_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint flock_counts_kind_check check (kind in ('sold', 'count_adjust')),
  constraint flock_counts_birds_check check (birds <> 0 and birds between -10000000 and 10000000),
  constraint flock_counts_sign_check check (kind <> 'sold' or ((birds < 0) = (reverses_id is null))),
  constraint flock_counts_net_check check ((kind = 'sold') = (net_kg is not null)
    and (net_kg is null or (abs(net_kg) < 'Infinity' and net_kg <> 0 and net_kg = round(net_kg, 3) and sign(net_kg) = -sign(birds)))),
  constraint flock_counts_doc_check check ((kind = 'sold' and doc_kind = 'bird_sale' and doc_line_id is not null)
    or (kind = 'count_adjust' and doc_kind in ('flock_close', 'count_adjust') and doc_line_id is null)),
  constraint flock_counts_reason_check check ((reason is null or length(btrim(reason)) between 1 and 500)
    and (kind <> 'count_adjust' or reverses_id is not null or reason is not null)),
  unique (org_id, id),
  unique (org_id, reverses_id),
  foreign key (org_id, flock_id) references public.flocks (org_id, id),
  foreign key (org_id, division_id, site_id, hall_id) references public.halls (org_id, division_id, site_id, id),
  foreign key (org_id, reverses_id) references public.flock_counts (org_id, id)
);
create index if not exists flock_counts_flock on public.flock_counts (org_id, flock_id, on_date);
create index if not exists flock_counts_doc on public.flock_counts (org_id, doc_kind, doc_id);
create index if not exists flock_counts_hall on public.flock_counts (org_id, division_id, site_id, hall_id);

-- تذكرة الوزن (FOUNDATION ٤٠٨): بلا مال. المسوّدة تُحفظ بعد كلّ وزنة بشرط النسخة، والمجاميع لقطة تُعاد بكلّ حفظ (فارغة ما دامت قاعة ناقصة)،
-- والرقم WT عند إكمالها.
create table if not exists public.weigh_tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  site_id uuid not null,
  division_id uuid not null,
  on_date date not null,
  ticket_no text,
  method text not null,
  empty_kg numeric,
  empty_with_crates boolean,
  crate_kg numeric,
  vehicle text,
  driver text,
  note text,
  birds int,
  crates int,
  net_kg numeric,
  status text not null default 'draft',
  version int not null default 1,
  finished_at timestamptz,
  finished_by uuid,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint weigh_tickets_method_check check (method in ('scale', 'crates')),
  constraint weigh_tickets_method_fields_check check ((method = 'scale') = (empty_with_crates is not null) and (method = 'scale' or empty_kg is null)),
  constraint weigh_tickets_empty_check check (empty_kg is null
    or (abs(empty_kg) < 'Infinity' and empty_kg > 0 and empty_kg <= 200000 and empty_kg = round(empty_kg, 3))),
  constraint weigh_tickets_crate_kg_check check (crate_kg is null
    or (abs(crate_kg) < 'Infinity' and crate_kg > 0 and crate_kg <= 100 and crate_kg = round(crate_kg, 3))),
  constraint weigh_tickets_totals_check check ((birds is null or birds between 1 and 10000000) and (crates is null or crates between 0 and 1000000)
    and (net_kg is null or (abs(net_kg) < 'Infinity' and net_kg > 0 and net_kg = round(net_kg, 3)))),
  constraint weigh_tickets_status_check check (status in ('draft', 'done', 'void')),
  constraint weigh_tickets_no_check check ((ticket_no is null or ticket_no ~ '^WT-[0-9]{4}-[0-9]{4,}$') and (status <> 'done' or ticket_no is not null)
    and ((ticket_no is null) = (finished_at is null))),
  constraint weigh_tickets_done_check check (status <> 'done' or (birds is not null and net_kg is not null)),
  constraint weigh_tickets_void_check check ((status = 'void') = (voided_at is not null)
    and (void_reason is null or length(btrim(void_reason)) between 1 and 500)),
  constraint weigh_tickets_text_check check ((vehicle is null or (length(vehicle) between 1 and 40 and vehicle = btrim(vehicle)))
    and (driver is null or (length(driver) between 1 and 40 and driver = btrim(driver)))
    and (note is null or (length(note) between 1 and 500 and note = btrim(note)))),
  constraint weigh_tickets_version_check check (version >= 1),
  unique (org_id, id),
  unique (org_id, ticket_no),
  unique (org_id, id, site_id),
  foreign key (org_id, division_id, site_id) references public.sites (org_id, division_id, id)
);
create index if not exists weigh_tickets_site on public.weigh_tickets (org_id, division_id, site_id);
create index if not exists weigh_tickets_on_date on public.weigh_tickets (org_id, on_date);

-- وقفة التذكرة: قاعة واحدة بترتيب التحميل، وفوجها القائم لحظة الحفظ، والصافي لقطة (والخابط في ميزان الأقفاص مجموع وزناتها). ترتيب الوقفات والقاعة
-- فريدان مؤجَّلان حتى آخر المعاملة (إعادة ترتيب المسوّدة تتبادل الأرقام).
create table if not exists public.weigh_ticket_stops (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  ticket_id uuid not null,
  site_id uuid not null,
  division_id uuid not null,
  stop_no int not null,
  hall_id uuid not null,
  flock_id uuid not null,
  birds int,
  crates int,
  gross_kg numeric,
  net_kg numeric,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint weigh_ticket_stops_no_check check (stop_no between 1 and 20),
  constraint weigh_ticket_stops_birds_check check (birds is null or birds between 1 and 10000000),
  constraint weigh_ticket_stops_crates_check check (crates is null or crates between 0 and 100000),
  constraint weigh_ticket_stops_gross_check check (gross_kg is null
    or (abs(gross_kg) < 'Infinity' and gross_kg > 0 and gross_kg <= 200000 and gross_kg = round(gross_kg, 3))),
  constraint weigh_ticket_stops_net_check check (net_kg is null or (abs(net_kg) < 'Infinity' and net_kg > 0 and net_kg = round(net_kg, 3))),
  unique (org_id, id),
  unique (org_id, id, ticket_id),
  constraint weigh_ticket_stops_order_key unique (org_id, ticket_id, stop_no) deferrable initially deferred,
  constraint weigh_ticket_stops_hall_key unique (org_id, ticket_id, hall_id) deferrable initially deferred,
  foreign key (org_id, ticket_id, site_id) references public.weigh_tickets (org_id, id, site_id),
  foreign key (org_id, division_id, site_id, hall_id) references public.halls (org_id, division_id, site_id, id),
  foreign key (org_id, flock_id) references public.flocks (org_id, id)
);
create index if not exists weigh_ticket_stops_ticket on public.weigh_ticket_stops (org_id, ticket_id, site_id);
create index if not exists weigh_ticket_stops_hall on public.weigh_ticket_stops (org_id, division_id, site_id, hall_id);
create index if not exists weigh_ticket_stops_flock on public.weigh_ticket_stops (org_id, flock_id);

-- وزنة ميزان الأقفاص: أقفاصها ووزنها (القفص بطيوره)، لوقفتها.
create table if not exists public.weigh_ticket_weighings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  ticket_id uuid not null,
  stop_id uuid not null,
  site_id uuid not null,
  weighing_no int not null,
  crates int not null,
  gross_kg numeric not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint weigh_ticket_weighings_no_check check (weighing_no between 1 and 2000),
  constraint weigh_ticket_weighings_crates_check check (crates between 1 and 1000),
  constraint weigh_ticket_weighings_gross_check check (abs(gross_kg) < 'Infinity' and gross_kg > 0 and gross_kg <= 100000 and gross_kg = round(gross_kg, 3)),
  unique (org_id, id),
  constraint weigh_ticket_weighings_order_key unique (org_id, stop_id, weighing_no) deferrable initially deferred,
  foreign key (org_id, stop_id, ticket_id) references public.weigh_ticket_stops (org_id, id, ticket_id),
  foreign key (org_id, ticket_id, site_id) references public.weigh_tickets (org_id, id, site_id)
);
create index if not exists weigh_ticket_weighings_stop on public.weigh_ticket_weighings (org_id, stop_id, ticket_id);
create index if not exists weigh_ticket_weighings_ticket on public.weigh_ticket_weighings (org_id, ticket_id, site_id);

-- فاتورة الطيور BR (القاعدتان ٢٦ و٣٧): تذكرة واحدة وتاجر واحد، والوزن المحسوب = الصافي بعد التنزيل (round3)، والمبلغ = المحسوب × سعر الكيلو بالدينار
-- الصحيح، و«المقبوض الآن» إلى صندوق بقيده وحركته. مال لأدوار المبيعات (لا كلفة فيها: الربح للفوج).
create table if not exists public.bird_sales (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  doc_no text not null,
  ticket_id uuid not null,
  site_id uuid not null,
  division_id uuid not null,
  party_id uuid not null,
  book_id uuid not null,
  sold_on date not null,
  birds int not null,
  net_kg numeric not null,
  unit_price numeric not null,
  deduction_pct numeric not null default 0,
  billed_kg numeric not null,
  total numeric not null,
  paid_now numeric not null default 0,
  cash_account_id uuid,
  invoice_entry_id uuid not null,
  payment_entry_id uuid,
  cash_move_id uuid,
  note text,
  status text not null default 'posted',
  version int not null default 1,
  client_ref uuid not null,
  posted_at timestamptz not null default now(),
  posted_by uuid default auth.uid(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint bird_sales_doc_no_check check (doc_no ~ '^BR-[0-9]{4}-[0-9]{4,}$'),
  constraint bird_sales_birds_check check (birds between 1 and 10000000 and abs(net_kg) < 'Infinity' and net_kg > 0 and net_kg = round(net_kg, 3)),
  constraint bird_sales_price_check check (abs(unit_price) < 'Infinity' and unit_price > 0 and unit_price <= 1000000000 and unit_price = round(unit_price, 2)),
  constraint bird_sales_deduction_check check (abs(deduction_pct) < 'Infinity' and deduction_pct between 0 and 10 and deduction_pct = round(deduction_pct, 2)),
  constraint bird_sales_billed_check check (abs(billed_kg) < 'Infinity' and billed_kg > 0 and billed_kg = round(billed_kg, 3) and billed_kg <= net_kg),
  constraint bird_sales_total_check check (abs(total) < 'Infinity' and total > 0 and total = round(total, 0)),
  constraint bird_sales_paid_check check (abs(paid_now) < 'Infinity' and paid_now >= 0 and paid_now <= total and paid_now = round(paid_now, 0)),
  constraint bird_sales_payment_check check ((paid_now > 0) = (cash_account_id is not null) and (paid_now > 0) = (payment_entry_id is not null)
    and (payment_entry_id is null) = (cash_move_id is null)),
  constraint bird_sales_status_check check (status in ('posted', 'void')),
  constraint bird_sales_void_check check ((status = 'void') = (voided_at is not null) and (voided_at is null) = (void_reason is null)),
  constraint bird_sales_void_reason_check check (void_reason is null or length(btrim(void_reason)) between 1 and 500),
  constraint bird_sales_note_check check (note is null or (length(note) between 1 and 500 and note = btrim(note))),
  constraint bird_sales_version_check check (version >= 1),
  unique (org_id, id),
  unique (org_id, doc_no),
  unique (org_id, id, site_id),
  foreign key (org_id, ticket_id, site_id) references public.weigh_tickets (org_id, id, site_id),
  foreign key (org_id, division_id, site_id) references public.sites (org_id, division_id, id),
  foreign key (org_id, party_id) references public.parties (org_id, id),
  foreign key (org_id, book_id) references public.ledger_books (org_id, id),
  foreign key (org_id, cash_account_id) references public.cash_accounts (org_id, id),
  foreign key (org_id, invoice_entry_id) references public.party_entries (org_id, id),
  foreign key (org_id, payment_entry_id) references public.party_entries (org_id, id),
  foreign key (org_id, cash_move_id) references public.cash_moves (org_id, id)
);
create unique index if not exists bird_sales_ticket_posted on public.bird_sales (org_id, ticket_id) where status = 'posted';
create index if not exists bird_sales_ticket on public.bird_sales (org_id, ticket_id, site_id);
create index if not exists bird_sales_site on public.bird_sales (org_id, division_id, site_id);
create index if not exists bird_sales_party on public.bird_sales (org_id, party_id);
create index if not exists bird_sales_book on public.bird_sales (org_id, book_id);
create index if not exists bird_sales_box on public.bird_sales (org_id, cash_account_id);
create index if not exists bird_sales_invoice_entry on public.bird_sales (org_id, invoice_entry_id);
create index if not exists bird_sales_payment_entry on public.bird_sales (org_id, payment_entry_id);
create index if not exists bird_sales_cash_move on public.bird_sales (org_id, cash_move_id);
create index if not exists bird_sales_sold_on on public.bird_sales (org_id, sold_on);

-- إيراد الفوج من الفاتورة: سطر لكلّ وقفة (قاعة وفوجها) بطيورها وصافيها وحصّتها من المبلغ بأكبر الباقي على صافي القاعات.
create table if not exists public.bird_sale_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  sale_id uuid not null,
  site_id uuid not null,
  division_id uuid not null,
  stop_id uuid not null,
  hall_id uuid not null,
  flock_id uuid not null,
  birds int not null,
  net_kg numeric not null,
  revenue numeric not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint bird_sale_sources_qty_check check (birds between 1 and 10000000 and abs(net_kg) < 'Infinity' and net_kg > 0 and net_kg = round(net_kg, 3)),
  constraint bird_sale_sources_revenue_check check (abs(revenue) < 'Infinity' and revenue >= 0 and revenue = round(revenue, 0)),
  unique (org_id, id),
  unique (org_id, sale_id, stop_id),
  foreign key (org_id, sale_id, site_id) references public.bird_sales (org_id, id, site_id),
  foreign key (org_id, stop_id) references public.weigh_ticket_stops (org_id, id),
  foreign key (org_id, flock_id) references public.flocks (org_id, id),
  foreign key (org_id, division_id, site_id, hall_id) references public.halls (org_id, division_id, site_id, id)
);
create index if not exists bird_sale_sources_sale on public.bird_sale_sources (org_id, sale_id, site_id);
create index if not exists bird_sale_sources_stop on public.bird_sale_sources (org_id, stop_id);
create index if not exists bird_sale_sources_flock on public.bird_sale_sources (org_id, flock_id);
create index if not exists bird_sale_sources_hall on public.bird_sale_sources (org_id, division_id, site_id, hall_id);

-- إغلاق الدورة: الحيّ قبله وفرق العدّ (= −الحيّ) بسببه، والمباع وصافيه من الفواتير المرحَّلة، وإعادة الفتح بوقتها وسببها. إغلاق واحد قائم لكلّ فوج.
create table if not exists public.flock_closes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  flock_id uuid not null,
  hall_id uuid not null,
  site_id uuid not null,
  division_id uuid not null,
  closed_on date not null,
  live_before int not null,
  count_diff int not null,
  count_reason text,
  sold_birds int not null,
  sold_net_kg numeric not null,
  note text,
  status text not null default 'closed',
  client_ref uuid not null,
  closed_at timestamptz not null default now(),
  closed_by uuid default auth.uid(),
  reopened_at timestamptz,
  reopened_by uuid,
  reopen_reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint flock_closes_status_check check (status in ('closed', 'reopened')),
  constraint flock_closes_counts_check check (live_before between 0 and 10000000 and count_diff = -live_before and sold_birds between 0 and 10000000
    and abs(sold_net_kg) < 'Infinity' and sold_net_kg >= 0 and sold_net_kg = round(sold_net_kg, 3) and ((sold_birds = 0) = (sold_net_kg = 0))),
  constraint flock_closes_reason_check check ((count_diff = 0) = (count_reason is null)
    and (count_reason is null or length(btrim(count_reason)) between 1 and 500)),
  constraint flock_closes_reopen_check check ((status = 'reopened') = (reopened_at is not null) and (reopened_at is null) = (reopen_reason is null)
    and (reopen_reason is null or length(btrim(reopen_reason)) between 1 and 500)),
  constraint flock_closes_note_check check (note is null or length(btrim(note)) between 1 and 500),
  unique (org_id, id),
  foreign key (org_id, flock_id) references public.flocks (org_id, id),
  foreign key (org_id, division_id, site_id, hall_id) references public.halls (org_id, division_id, site_id, id)
);
create unique index if not exists flock_closes_one_closed on public.flock_closes (org_id, flock_id) where status = 'closed';
create index if not exists flock_closes_flock on public.flock_closes (org_id, flock_id);
create index if not exists flock_closes_hall on public.flock_closes (org_id, division_id, site_id, hall_id);

-- سطر الباقي عند الإغلاق (كميات فقط): مصير المادّة، ولقطة وحدتها وكثافتها أو وزن قطعتها ونوع كلفتها؛ والإرجاع بمخزنه، والنقل بحالته (معلَّق ←
-- مطبَّق على الفوج التالي بيومه، أو مُرجَع إلى مخزن، أو ملغى بإعادة الفتح)، تكتبها الدوالّ وحدها.
create table if not exists public.flock_close_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  close_id uuid not null,
  flock_id uuid not null,
  hall_id uuid not null,
  site_id uuid not null,
  division_id uuid not null,
  line_no int not null,
  item_id uuid not null,
  action text not null,
  qty_base numeric not null,
  base_unit text not null,
  density_kg_per_l numeric,
  piece_mass_kg numeric,
  cost_kind text not null,
  warehouse_id uuid,
  carry_status text,
  to_flock_id uuid,
  applied_on date,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint flock_close_lines_action_check check (action in ('return', 'consumed', 'carry')),
  constraint flock_close_lines_qty_check check (abs(qty_base) < 'Infinity' and qty_base > 0 and qty_base = round(qty_base, 3)),
  constraint flock_close_lines_unit_check check (base_unit in ('kg', 'L', 'pc') and (base_unit <> 'pc' or qty_base = trunc(qty_base))),
  constraint flock_close_lines_density_check check (density_kg_per_l is null
    or (base_unit = 'L' and abs(density_kg_per_l) < 'Infinity' and density_kg_per_l > 0 and density_kg_per_l = round(density_kg_per_l, 4))),
  constraint flock_close_lines_piece_mass_check check (piece_mass_kg is null
    or (base_unit = 'pc' and abs(piece_mass_kg) < 'Infinity' and piece_mass_kg > 0 and piece_mass_kg = round(piece_mass_kg, 3))),
  constraint flock_close_lines_cost_kind_check check (cost_kind in ('feed', 'medicine', 'vaccine', 'fuel', 'other')),
  constraint flock_close_lines_line_no_check check (line_no between 1 and 100),
  constraint flock_close_lines_shape_check check ((action = 'return') = (warehouse_id is not null) and (action = 'carry') = (carry_status is not null)),
  constraint flock_close_lines_carry_check check (carry_status is null or (carry_status in ('pending', 'applied', 'returned', 'void')
    and (carry_status = 'applied') = (to_flock_id is not null) and (to_flock_id is null) = (applied_on is null))),
  unique (org_id, id),
  unique (org_id, close_id, line_no),
  unique (org_id, close_id, item_id),
  foreign key (org_id, close_id) references public.flock_closes (org_id, id),
  foreign key (org_id, item_id) references public.items (org_id, id),
  foreign key (org_id, warehouse_id) references public.warehouses (org_id, id),
  foreign key (org_id, to_flock_id) references public.flocks (org_id, id),
  foreign key (org_id, division_id, site_id, hall_id) references public.halls (org_id, division_id, site_id, id)
);
create index if not exists flock_close_lines_item on public.flock_close_lines (org_id, item_id);
create index if not exists flock_close_lines_warehouse on public.flock_close_lines (org_id, warehouse_id);
create index if not exists flock_close_lines_to_flock on public.flock_close_lines (org_id, to_flock_id);
create index if not exists flock_close_lines_hall on public.flock_close_lines (org_id, division_id, site_id, hall_id);
create index if not exists flock_close_lines_pending on public.flock_close_lines (org_id, hall_id) where carry_status = 'pending';

-- الإرجاع من القاعة FR (مستند مخزون بلا مال): من إغلاق الدورة أو من العلف المنقول، إلى مخزن جاء منه، بدفعة جديدة واحدة لسطره.
create table if not exists public.flock_returns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  doc_no text not null,
  flock_id uuid not null,
  hall_id uuid not null,
  site_id uuid not null,
  division_id uuid not null,
  warehouse_id uuid not null,
  returned_on date not null,
  source text not null,
  close_id uuid not null,
  close_line_id uuid not null,
  status text not null default 'posted',
  version int not null default 1,
  client_ref uuid not null,
  posted_at timestamptz not null default now(),
  posted_by uuid default auth.uid(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint flock_returns_doc_no_check check (doc_no ~ '^FR-[0-9]{4}-[0-9]{4,}$'),
  constraint flock_returns_source_check check (source in ('close', 'carry')),
  constraint flock_returns_status_check check (status in ('posted', 'void')),
  constraint flock_returns_void_check check ((status = 'void') = (voided_at is not null) and (voided_at is null) = (void_reason is null)
    and (void_reason is null or length(btrim(void_reason)) between 1 and 500)),
  constraint flock_returns_version_check check (version >= 1),
  unique (org_id, id),
  unique (org_id, doc_no),
  unique (org_id, close_line_id),
  unique (org_id, id, warehouse_id, site_id),
  foreign key (org_id, flock_id) references public.flocks (org_id, id),
  foreign key (org_id, division_id, site_id, hall_id) references public.halls (org_id, division_id, site_id, id),
  foreign key (org_id, warehouse_id) references public.warehouses (org_id, id),
  foreign key (org_id, close_id) references public.flock_closes (org_id, id),
  foreign key (org_id, close_line_id) references public.flock_close_lines (org_id, id)
);
create index if not exists flock_returns_flock on public.flock_returns (org_id, flock_id);
create index if not exists flock_returns_hall on public.flock_returns (org_id, division_id, site_id, hall_id);
create index if not exists flock_returns_warehouse on public.flock_returns (org_id, warehouse_id);
create index if not exists flock_returns_close on public.flock_returns (org_id, close_id);

-- سطر الإرجاع: لقطة المادّة كسطر الصرف، ودفعته الجديدة.
create table if not exists public.flock_return_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  return_id uuid not null,
  warehouse_id uuid not null,
  site_id uuid not null,
  line_no int not null,
  item_id uuid not null,
  qty_base numeric not null,
  base_unit text not null,
  density_kg_per_l numeric,
  piece_mass_kg numeric,
  cost_kind text not null,
  lot_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint flock_return_lines_qty_check check (abs(qty_base) < 'Infinity' and qty_base > 0 and qty_base = round(qty_base, 3)),
  constraint flock_return_lines_unit_check check (base_unit in ('kg', 'L', 'pc') and (base_unit <> 'pc' or qty_base = trunc(qty_base))),
  constraint flock_return_lines_density_check check (density_kg_per_l is null
    or (base_unit = 'L' and abs(density_kg_per_l) < 'Infinity' and density_kg_per_l > 0 and density_kg_per_l = round(density_kg_per_l, 4))),
  constraint flock_return_lines_piece_mass_check check (piece_mass_kg is null
    or (base_unit = 'pc' and abs(piece_mass_kg) < 'Infinity' and piece_mass_kg > 0 and piece_mass_kg = round(piece_mass_kg, 3))),
  constraint flock_return_lines_cost_kind_check check (cost_kind in ('feed', 'medicine', 'vaccine', 'fuel', 'other')),
  constraint flock_return_lines_line_no_check check (line_no >= 1),
  unique (org_id, id),
  unique (org_id, return_id, line_no),
  unique (org_id, lot_id),
  foreign key (org_id, return_id, warehouse_id, site_id) references public.flock_returns (org_id, id, warehouse_id, site_id),
  foreign key (org_id, item_id) references public.items (org_id, id),
  foreign key (org_id, lot_id) references public.stock_lots (org_id, id)
);
create index if not exists flock_return_lines_return on public.flock_return_lines (org_id, return_id, warehouse_id, site_id);
create index if not exists flock_return_lines_item on public.flock_return_lines (org_id, item_id);

-- لقطة الإغلاق بالمال (FOUNDATION ٣٩٢): كلفة الفوج بعد الإغلاق، والراجع والمنقول، والإيراد من الفواتير المرحَّلة؛ لأدوار الكلفة وحدها. بلا ربح (كلفة
-- الفراخ لاحقاً).
create table if not exists public.flock_close_values (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  close_id uuid not null,
  flock_id uuid not null,
  site_id uuid not null,
  cost_total numeric not null,
  returned_value numeric not null,
  carried_value numeric not null,
  revenue numeric not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint flock_close_values_amounts_check check (abs(cost_total) < 'Infinity' and cost_total = round(cost_total, 2)
    and abs(returned_value) < 'Infinity' and returned_value >= 0 and returned_value = round(returned_value, 2)
    and abs(carried_value) < 'Infinity' and carried_value >= 0 and carried_value = round(carried_value, 2)
    and abs(revenue) < 'Infinity' and revenue >= 0 and revenue = round(revenue, 0)),
  unique (org_id, id),
  unique (org_id, close_id),
  foreign key (org_id, close_id) references public.flock_closes (org_id, id),
  foreign key (org_id, flock_id) references public.flocks (org_id, id)
);
create index if not exists flock_close_values_flock on public.flock_close_values (org_id, flock_id);

do $$
declare
  t text;
begin
  -- العدد يُضاف ولا يُعدَّل لأيّ دور (FOUNDATION ٣٧٥، ٤٣٧).
  execute 'create or replace trigger flock_counts_append_only before update or delete on public.flock_counts for each row execute function private.reject_change()';
  execute 'create or replace trigger flock_counts_no_truncate before truncate on public.flock_counts for each statement execute function private.reject_change()';
  foreach t in array array['flock_counts', 'weigh_tickets', 'weigh_ticket_stops', 'weigh_ticket_weighings', 'bird_sales', 'bird_sale_sources',
    'flock_closes', 'flock_close_lines', 'flock_returns', 'flock_return_lines', 'flock_close_values'] loop
    execute format('create or replace trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()', 'audit_' || t, t);
  end loop;
end
$$;

alter table public.flock_counts enable row level security;
alter table public.weigh_tickets enable row level security;
alter table public.weigh_ticket_stops enable row level security;
alter table public.weigh_ticket_weighings enable row level security;
alter table public.bird_sales enable row level security;
alter table public.bird_sale_sources enable row level security;
alter table public.flock_closes enable row level security;
alter table public.flock_close_lines enable row level security;
alter table public.flock_returns enable row level security;
alter table public.flock_return_lines enable row level security;
alter table public.flock_close_values enable row level security;

-- القراءة: بنطاق حقل القاعة (site_id على كلّ جدول، FOUNDATION ٥٤٤)، والإرجاع بحقل القاعة أو مخزن الإرجاع (مثل الصرف)؛ والفاتورة وإيرادها لأدوار
-- المبيعات (can_see_sales)، ولقطة الإغلاق بالمال لأدوار الكلفة (can_see_cost)؛ والكتابة للدوالّ وحدها.
do $$
declare
  t text;
begin
  foreach t in array array['flock_counts', 'weigh_tickets', 'weigh_ticket_stops', 'weigh_ticket_weighings', 'bird_sales', 'bird_sale_sources',
    'flock_closes', 'flock_close_lines', 'flock_close_values'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_read') then
      execute format('create policy %I on public.%I for select to authenticated using (org_id = (select public.auth_org()) and (select public.in_scope_site(site_id)))',
        t || '_read', t);
    end if;
  end loop;
  foreach t in array array['flock_returns', 'flock_return_lines'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_read') then
      execute format('create policy %I on public.%I for select to authenticated using (org_id = (select public.auth_org()) and ((select public.in_scope_site(site_id)) or (select public.in_scope_wh(warehouse_id))))',
        t || '_read', t);
    end if;
  end loop;
  foreach t in array array['bird_sales', 'bird_sale_sources'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_sales_only') then
      execute format('create policy %I on public.%I as restrictive for select to authenticated using ((select public.can_see_sales()))', t || '_sales_only', t);
    end if;
  end loop;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'flock_close_values' and policyname = 'flock_close_values_cost_only') then
    create policy flock_close_values_cost_only on public.flock_close_values as restrictive for select to authenticated using ((select public.can_see_cost()));
  end if;
  -- سجلّ التدقيق يحمل الصفّ كلّه (E49): صفوف الحقل بحقلها، والإرجاع بحقل القاعة أو مخزنه، مثل سياسات الجداول نفسها.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'audit_log_birds_scope') then
    create policy audit_log_birds_scope on public.audit_log as restrictive for select to authenticated
      using (case
        when table_name in ('flock_counts', 'weigh_tickets', 'weigh_ticket_stops', 'weigh_ticket_weighings', 'bird_sales', 'bird_sale_sources',
          'flock_closes', 'flock_close_lines', 'flock_close_values')
          then public.in_scope_site((coalesce("new", "old") ->> 'site_id')::uuid)
        when table_name in ('flock_returns', 'flock_return_lines')
          then public.in_scope_site((coalesce("new", "old") ->> 'site_id')::uuid) or public.in_scope_wh((coalesce("new", "old") ->> 'warehouse_id')::uuid)
        else true
      end);
  end if;
end
$$;

revoke all on table public.flock_counts, public.weigh_tickets, public.weigh_ticket_stops, public.weigh_ticket_weighings, public.bird_sales,
  public.bird_sale_sources, public.flock_closes, public.flock_close_lines, public.flock_returns, public.flock_return_lines, public.flock_close_values
  from anon, authenticated;
grant select on table public.flock_counts, public.weigh_tickets, public.weigh_ticket_stops, public.weigh_ticket_weighings, public.bird_sales,
  public.bird_sale_sources, public.flock_closes, public.flock_close_lines, public.flock_returns, public.flock_return_lines, public.flock_close_values
  to authenticated;
revoke truncate on table public.flock_counts, public.weigh_tickets, public.weigh_ticket_stops, public.weigh_ticket_weighings, public.bird_sales,
  public.bird_sale_sources, public.flock_closes, public.flock_close_lines, public.flock_returns, public.flock_return_lines, public.flock_close_values
  from service_role;

-- ─── ج. المساعدات ─────────────────────────────────────────────────────────────────────────────────────────────────
-- مجموع عدد الطيور للفوج (كلّ الصفوف: الأصل وعكسه يتعادلان).
create or replace function private.flock_counts_total(p_flock uuid) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(c.birds), 0)::bigint
  from public.flocks f join public.flock_counts c on c.org_id = f.org_id and c.flock_id = f.id
  where f.id = p_flock
$$;

-- الحيّ الآن (FOUNDATION ٤٣٤): المسكَّن − كلّ النافق والمستبعد + مجموع العدد (المباع سالب، وفرق العدّ بإشارته).
create or replace function private.flock_live(f public.flocks) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(f.placed_count, 0)
    - coalesce((select sum(d.dead + d.culled) from public.flock_daily d where d.org_id = f.org_id and d.flock_id = f.id), 0)
    + coalesce((select sum(c.birds) from public.flock_counts c where c.org_id = f.org_id and c.flock_id = f.id), 0)
$$;

-- الأصول الحيّة (لا عكس ولا معكوسة) مجمَّعة بيومها: المباع عدداً موجباً وصافيه، وفرق العدّ بإشارته. قرّاء الأيّام يعدّون هذه وحدها (D4).
create or replace function private.flock_count_days(p_flock uuid) returns table (on_date date, sold int, sold_kg numeric, adjust int)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.on_date, coalesce(-sum(c.birds) filter (where c.kind = 'sold'), 0)::int, coalesce(sum(c.net_kg) filter (where c.kind = 'sold'), 0),
    coalesce(sum(c.birds) filter (where c.kind = 'count_adjust'), 0)::int
  from public.flocks f join public.flock_counts c on c.org_id = f.org_id and c.flock_id = f.id
  where f.id = p_flock and c.reverses_id is null
    and not exists (select 1 from public.flock_counts r where r.org_id = c.org_id and r.reverses_id = c.id)
  group by c.on_date
$$;

-- الحيّ لا يصير سالباً في أيّ يوم (D6): فرق كلّ يوم (− نافقه ومستبعده + أصوله الحيّة من العدد) مجمَّعاً بيومه أوّلاً، ثمّ الجاري من المسكَّن بالتاريخ؛
-- أوّل يوم سالب يرفض ويسمّي القاعة واليوم والعدد. كلّ كاتب ينقص الحيّ يناديه بعد كتابته (تحت قفل الفوج)، فالرفض لا يُبقي شيئاً.
create or replace function private.flock_live_check(f public.flocks) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v record;
  v_hall text;
begin
  select x.d, x.live into v from (
    select t.d, coalesce(f.placed_count, 0) + sum(t.delta) over (order by t.d rows unbounded preceding) as live
    from (
      select u.d, sum(u.delta) as delta from (
        select y.on_date as d, -(y.dead + y.culled)::bigint as delta from public.flock_daily y where y.org_id = f.org_id and y.flock_id = f.id
        union all
        select c.on_date, c.birds::bigint from public.flock_counts c
        where c.org_id = f.org_id and c.flock_id = f.id and c.reverses_id is null
          and not exists (select 1 from public.flock_counts r where r.org_id = c.org_id and r.reverses_id = c.id)
      ) as u
      group by u.d
    ) as t
  ) as x
  where x.live < 0
  order by x.d
  limit 1;
  if v.d is not null then
    select h.name into v_hall from public.halls h where h.org_id = f.org_id and h.id = f.hall_id;
    raise exception 'live_negative' using hint = format('بهذا يصير عدد الطيور الحيّة في «%s» سالباً يوم %s (%s). راجع النافق والمستبعد والمباع وفرق العدّ لذلك اليوم وما قبله.',
      v_hall, to_char(v.d, 'DD/MM/YYYY'), to_char(v.live, 'FM999,999,999,990'));
  end if;
end
$$;

-- أيّام الفوج التي بدأت بطيور حيّة من التسكين حتى p_through (مراجعة 0028 O7): يوم بدأ بلا طير حيّ (بعد بيع الكلّ) لا جولة ولا علف ينتظره، فلا يدخل
-- أيّام العلف اللازمة لمعامل التحويل (feed_span). الحيّ أوّل اليوم بقاعدة report_days: المسكَّن − النافق والمستبعد قبله + أصول العدد الحيّة قبله.
create or replace function private.flock_alive_days(f public.flocks, p_through date) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from (
    select coalesce(f.placed_count, 0) + coalesce(sum(t.delta) over (order by g.d rows between unbounded preceding and 1 preceding), 0) as live_start
    from (select f.placed_on + s.n as d from generate_series(0, p_through - f.placed_on) as s(n)) as g
    left join (
      select u.d, sum(u.delta) as delta from (
        select y.on_date as d, -(y.dead + y.culled)::bigint as delta from public.flock_daily y where y.org_id = f.org_id and y.flock_id = f.id
        union all
        select k.on_date, (k.adjust - k.sold)::bigint from private.flock_count_days(f.id) as k
      ) as u
      group by u.d
    ) as t on t.d = g.d
  ) as x
  where x.live_start > 0
$$;

-- دفعات المادّة التي نزلت للفوج: السحب الأصليّ لصرفه المرحَّل، وصرف كلّ دورة نُقل منها علف إليه مطبَّقاً (بالتتابع، حتى 20 دورة).
create or replace function private.flock_item_lots(p_flock uuid, p_item uuid) returns table (lot_id uuid, warehouse_id uuid, issued_on date, posted_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  with recursive fl(org_id, flock_id, depth) as (
    select f.org_id, f.id, 0 from public.flocks f where f.id = p_flock
    union all
    select c.org_id, c.flock_id, fl.depth + 1
    from fl
    join public.flock_close_lines l on l.org_id = fl.org_id and l.to_flock_id = fl.flock_id and l.item_id = p_item and l.carry_status = 'applied'
    join public.flock_closes c on c.org_id = l.org_id and c.id = l.close_id
    where fl.depth < 20
  )
  select m.lot_id, m.warehouse_id, x.issued_on, x.posted_at
  from fl
  join public.flock_issues x on x.org_id = fl.org_id and x.flock_id = fl.flock_id and x.status = 'posted'
  join public.stock_moves m on m.org_id = x.org_id and m.doc_kind = 'flock_issue' and m.doc_id = x.id and m.reverses_move_id is null and m.qty < 0
    and m.item_id = p_item
$$;

-- ما في القاعة من كلّ مادّة (القاعدة ١٦): الكمية = الصرف المرحَّل + المنقول إليها مطبَّقاً − الراجع عند إغلاقها − المنقول منها غير الملغى (والمنقول
-- الذي أُرجع بعدُ يبقى نقلاً هنا: إرجاعه لا يُطرح مرّتين)؛ والقيمة = مجموع كلفة الفوج لسطور المادّة (الأصول والعكوس)؛ والكثافة ووزن القطعة من آخر سطر
-- نزل (D10)، والكيلو من سطورها (فارغ إن كان فيها سطر بلا كتلة)، وعدد وحدات الأساس، والمنقول إليها. المادّة بكمية موجبة وحدها.
create or replace function private.flock_item_pool(p_flock uuid)
returns table (item_id uuid, qty numeric, value numeric, base_unit text, units_count int, density numeric, piece_mass numeric, kg numeric, carry_in_qty numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  with f as (
    select x.org_id, x.id from public.flocks x where x.id = p_flock
  ), ins as (
    select l.item_id, l.qty_base as qty, l.base_unit, l.density_kg_per_l as density, l.piece_mass_kg as piece_mass,
      private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg) as kg, x.issued_on as on_date, x.posted_at as at, false as carry
    from f
    join public.flock_issues x on x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted'
    join public.flock_issue_lines l on l.org_id = x.org_id and l.issue_id = x.id
    union all
    select l.item_id, l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg,
      private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg), l.applied_on, l.created_at, true
    from f join public.flock_close_lines l on l.org_id = f.org_id and l.to_flock_id = f.id and l.carry_status = 'applied'
  ), outs as (
    select r.item_id, r.qty_base as qty, private.issue_mass_kg(r.qty_base, r.base_unit, r.density_kg_per_l, r.piece_mass_kg) as kg
    from f
    join public.flock_returns x on x.org_id = f.org_id and x.flock_id = f.id and x.source = 'close' and x.status = 'posted'
    join public.flock_return_lines r on r.org_id = x.org_id and r.return_id = x.id
    union all
    select l.item_id, l.qty_base, private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)
    from f join public.flock_close_lines l on l.org_id = f.org_id and l.flock_id = f.id and l.action = 'carry' and l.carry_status <> 'void'
  ), vals as (
    select coalesce(il.item_id, cl.item_id, rl.item_id) as item_id, c.amount
    from f
    join public.flock_costs c on c.org_id = f.org_id and c.flock_id = f.id
    left join public.flock_issue_lines il on c.doc_kind = 'flock_issue' and il.org_id = c.org_id and il.id = c.doc_line_id
    left join public.flock_close_lines cl on c.doc_kind = 'flock_carry' and cl.org_id = c.org_id and cl.id = c.doc_line_id
    left join public.flock_return_lines rl on c.doc_kind = 'flock_return' and rl.org_id = c.org_id and rl.id = c.doc_line_id
  ), a as (
    select i.item_id, sum(i.qty) as qty, count(distinct i.base_unit)::int as units, min(i.base_unit) as base_unit, sum(i.kg) as kg,
      bool_or(i.kg is null) as unweighed, coalesce(sum(i.qty) filter (where i.carry), 0) as carry_in_qty,
      (array_agg(i.density order by i.on_date desc, i.at desc))[1] as density,
      (array_agg(i.piece_mass order by i.on_date desc, i.at desc))[1] as piece_mass
    from ins i
    group by i.item_id
  ), o as (
    select x.item_id, sum(x.qty) as qty, sum(x.kg) as kg, bool_or(x.kg is null) as unweighed from outs x group by x.item_id
  ), v as (
    select x.item_id, sum(x.amount) as value from vals x group by x.item_id
  )
  select a.item_id, a.qty - coalesce(o.qty, 0), coalesce(v.value, 0), a.base_unit, a.units, a.density, a.piece_mass,
    case when not a.unweighed and not coalesce(o.unweighed, false) then a.kg - coalesce(o.kg, 0) end, a.carry_in_qty
  from a
  left join o on o.item_id = a.item_id
  left join v on v.item_id = a.item_id
  where a.qty - coalesce(o.qty, 0) > 0
$$;

-- بصمة ما في القاعة (مراجعة 0028 M4، آليّة بصمة المعاينة نفسها: private.plan_token بسرّ الخادم): كلّ مادّة بكميتها وقيمتها بترتيب المادّة. نموذج الإغلاق
-- يرجّعها (plan) والإغلاق يقارنها تحت قفل الفوج (pool_changed)، فقيمة تغيّرت والكمية كما هي (صرف أُلغي وأُعيد من مخزن آخر) لا تمرّ؛ وهي نصّ معمًّى لا
-- يكشف مالاً لمن لا يراه، وبصمة بلا السرّ لا تطابق أبداً.
create or replace function private.flock_pool_plan(p_flock uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select private.plan_token(coalesce((select string_agg(private.plan_piece(p.item_id, p.qty, p.value), ';' order by p.item_id)
    from private.flock_item_pool(p_flock) as p), ''))
$$;

-- دفعة الإرجاع: كدفعة جديدة لكن بترتيب السحب والانتهاء المعطيين (أصغر ترتيب وأقرب انتهاء لدفعات القاعة)، ومصدرها الإرجاع، بلا أصل؛ ومتبقّيها صفر
-- حتى تكتب حركتها الأصلية (apply_move).
create or replace function private.return_lot(p_item uuid, p_wh uuid, p_received date, p_fifo_seq bigint, p_expiry date, p_qty numeric, p_value numeric,
  p_return uuid, p_line uuid) returns public.stock_lots
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  l public.stock_lots;
begin
  insert into public.stock_lots (org_id, item_id, warehouse_id, fifo_seq, received_on, expiry_on, born_at, qty_in, value_in, qty_left, value_left,
    source_kind, source_id, source_line_id)
  values (public.auth_org(), p_item, p_wh, p_fifo_seq, p_received, p_expiry, null, p_qty, p_value, 0, 0, 'flock_return', p_return, p_line)
  returning * into l;
  return l;
end
$$;

-- نواة الإرجاع المشتركة (الإغلاق والمنقول): رأس FR وسطره (الرقم من عدّاد المستندات)، ودفعة جديدة بأصغر ترتيب وأقرب انتهاء لدفعات المادّة التي نزلت
-- للفوج، وحركتها الأصلية بالكمية والقيمة، وصفّ كلفة سالب على الفوج بالقيمة نفسها. المستدعي ماسك كلّ الأقفال (الأرصدة مقفولة) قبلها.
create or replace function private.flock_return_post(p_return uuid, f public.flocks, p_wh uuid, p_item uuid, p_qty numeric, p_value numeric, p_on date,
  p_source text, p_close uuid, p_close_line uuid, p_base_unit text, p_density numeric, p_piece_mass numeric, p_cost_kind text, p_client_ref uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_line uuid := private.derived_ref(p_return, 1);
  v_seq bigint;
  v_expiry date;
  v_no text;
  l public.stock_lots;
begin
  select min(s.fifo_seq), min(s.expiry_on) into v_seq, v_expiry
  from private.flock_item_lots(f.id, p_item) as x
  join public.stock_lots s on s.org_id = f.org_id and s.id = x.lot_id;
  if v_seq is null then
    raise exception 'not_from_store' using hint = 'لا صرف مرحَّلاً لهذه المادّة في هذه القاعة، فلا يُرجَع منها شيء. حدّث الشاشة.';
  end if;
  v_no := private.next_doc_no('FR', p_on);
  insert into public.flock_returns (id, org_id, doc_no, flock_id, hall_id, site_id, division_id, warehouse_id, returned_on, source, close_id, close_line_id,
    status, client_ref, posted_at, posted_by)
  values (p_return, f.org_id, v_no, f.id, f.hall_id, f.site_id, f.division_id, p_wh, p_on, p_source, p_close, p_close_line, 'posted', p_client_ref, now(), auth.uid());
  l := private.return_lot(p_item, p_wh, p_on, v_seq, v_expiry, p_qty, p_value, p_return, v_line);
  insert into public.flock_return_lines (id, org_id, return_id, warehouse_id, site_id, line_no, item_id, qty_base, base_unit, density_kg_per_l, piece_mass_kg,
    cost_kind, lot_id)
  values (v_line, f.org_id, p_return, p_wh, f.site_id, 1, p_item, p_qty, p_base_unit, p_density, p_piece_mass, p_cost_kind, l.id);
  perform private.apply_move(l.id, 'flock_return', p_return, v_line, p_qty, p_value, p_on, null);
  insert into public.flock_costs (org_id, flock_id, site_id, kind, amount, doc_kind, doc_id, doc_line_id, on_date)
  values (f.org_id, f.id, f.site_id, p_cost_kind, -p_value, 'flock_return', p_return, v_line, p_on);
  return p_return;
end
$$;

-- الدفتر الرئيسيّ للوحدة (القاعدة ٣٦): فاتورة الطيور فيه، ووحدة بلا دفتر رئيسيّ لا تُصدر فاتورة.
create or replace function private.division_main_book(p_division uuid) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_book uuid;
  v_name text;
begin
  select b.id into v_book from public.ledger_books b where b.org_id = public.auth_org() and b.division_id = p_division and b.code = 'main';
  if v_book is null then
    select d.name into v_name from public.divisions d where d.org_id = public.auth_org() and d.id = p_division;
    raise exception 'no_sales_book' using hint = format('لا دفتر لوحدة «%s»، فلا تُصدر فيها فاتورة طيور.', v_name);
  end if;
  return v_book;
end
$$;

-- صافي كلّ وقفة (القاعدة ٢٦ وD:225–227، والخطوط الحمر): القبّان: الخابط قبلها (للأولى وزن الفارغ)، ووزن أقفاصها (صفر إن وُزن الفارغ معها، وإلّا
-- أقفاصها × وزن القفص)، والصافي = خابطها − الخابط قبلها − وزن أقفاصها؛ وميزان الأقفاص: الخابط مجموع وزناتها، والصافي = هو − أقفاصها × وزن القفص.
-- الناقص يجعل الصافي فارغاً ويسمّي أوّل ما ينقص (problem). gross_kg الخابط الفعليّ للوقفة (للأقفاص مجموع وزناتها).
create or replace function private.ticket_nets(p_ticket uuid)
returns table (stop_id uuid, stop_no int, gross_kg numeric, prev_gross numeric, crates int, crates_kg numeric, net_kg numeric, problem text)
language sql stable security definer set search_path = public, pg_temp as $$
  with t as (
    select x.* from public.weigh_tickets x where x.id = p_ticket
  ), s as (
    select st.id, st.stop_no, h.name as hall_name,
      case when t.method = 'crates' then w.gross else st.gross_kg end as gross,
      case when t.method = 'crates' then w.crates else st.crates end as crates,
      w.n as weighings,
      lag(h.name) over (order by st.stop_no) as prev_hall,
      case when t.method = 'scale' then lag(st.gross_kg, 1, t.empty_kg) over (order by st.stop_no) end as prev,
      t.method, t.empty_with_crates, t.crate_kg, t.empty_kg
    from t
    join public.weigh_ticket_stops st on st.org_id = t.org_id and st.ticket_id = t.id
    join public.halls h on h.org_id = st.org_id and h.id = st.hall_id
    left join lateral (
      select sum(g.gross_kg) as gross, sum(g.crates)::int as crates, count(*)::int as n
      from public.weigh_ticket_weighings g where g.org_id = st.org_id and g.stop_id = st.id
    ) as w on true
  ), k as (
    select s.*,
      case
        when s.method = 'scale' and s.empty_with_crates then 0
        when s.crates is not null and s.crate_kg is not null then s.crates * s.crate_kg
      end as ckg
    from s
  )
  select k.id, k.stop_no, k.gross, k.prev, k.crates, k.ckg,
    case when k.method = 'scale' then k.gross - k.prev - k.ckg else k.gross - k.ckg end,
    case
      when k.method = 'scale' and k.prev is null and k.stop_no = 1 then 'وزن الفارغ'
      when k.method = 'scale' and k.prev is null then format('وزن الخابط بعد قاعة «%s»', k.prev_hall)
      when k.method = 'scale' and k.gross is null then format('وزن الخابط بعد قاعة «%s»', k.hall_name)
      when k.method = 'crates' and coalesce(k.weighings, 0) = 0 then format('وزنات قاعة «%s»', k.hall_name)
      when k.crate_kg is null and not (k.method = 'scale' and k.empty_with_crates) then 'وزن القفص'
      when k.ckg is null then format('عدد أقفاص قاعة «%s»', k.hall_name)
    end
  from k
  order by k.stop_no
$$;

-- المحتوى القانونيّ للتذكرة المسوّدة من صفوفها (للمقارنة بالمرسَل: الحفظ يُعاد بأمان بالمحتوى). الأوزان بثلاث مراتب، والوقفات بترتيبها، ووزنات ميزان
-- الأقفاص بترتيبها (والقبّان بلا وزنات، والأقفاص بلا خابط ولا أقفاص للوقفة: تُحسب من الوزنات).
create or replace function private.weigh_ticket_content(p_ticket uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('site_id', t.site_id, 'on_date', t.on_date, 'method', t.method, 'empty_kg', round(t.empty_kg, 3),
    'empty_with_crates', t.empty_with_crates, 'crate_kg', round(t.crate_kg, 3), 'vehicle', t.vehicle, 'driver', t.driver, 'note', t.note,
    'stops', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'hall_id', s.hall_id, 'birds', s.birds,
        'crates', case when t.method = 'scale' then s.crates end, 'gross_kg', case when t.method = 'scale' then round(s.gross_kg, 3) end,
        'weighings', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'crates', g.crates, 'gross_kg', round(g.gross_kg, 3)) order by g.weighing_no)
          from public.weigh_ticket_weighings g where g.org_id = s.org_id and g.stop_id = s.id), '[]'::jsonb)) order by s.stop_no)
      from public.weigh_ticket_stops s where s.org_id = t.org_id and s.ticket_id = t.id), '[]'::jsonb))
  from public.weigh_tickets t where t.id = p_ticket
$$;

-- الطيور على تذاكر غير ملغاة بلا فاتورة مرحَّلة لفوج (غير تذكرة معطاة): «في الطريق» قبل أن تُخرجها الفاتورة.
create or replace function private.flock_ticketed(p_flock uuid, p_except uuid) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(s.birds), 0)::bigint
  from public.flocks f
  join public.weigh_ticket_stops s on s.org_id = f.org_id and s.flock_id = f.id
  join public.weigh_tickets t on t.org_id = s.org_id and t.id = s.ticket_id
  where f.id = p_flock and t.status <> 'void' and t.id is distinct from p_except
    and not exists (select 1 from public.bird_sales b where b.org_id = t.org_id and b.ticket_id = t.id and b.status = 'posted')
$$;

-- قاعدة تاريخ الفاتورة في مكان واحد (D3: الفاتورة بيوم تذكرتها، بقاعدة المستند: لا أقدم من 7 أيام ولا في فترة مقفلة). مراجعة 0028 O4: المالك يُسأل
-- كيف تُؤرَّخ فاتورة متأخّرة؛ جوابه يغيّر هذه الدالّة (وتأريخ record_bird_sale) وحدهما. 'too_old' أو 'period_locked' أو null.
create or replace function private.ticket_date_block(p_on date) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when p_on < public.app_today() - 7 then 'too_old'
    when p_on <= (select l.locked_through from public.period_locks l where l.org_id = public.auth_org()) then 'period_locked'
  end
$$;

-- لماذا لا تُصدر لتذكرة مكتملة فاتورة الآن (القرّاء يعدونها بما يقبله الكاتب، مراجعة 0028 O4 وC3 وM6): بلا دفتر رئيسيّ لوحدتها 'no_book'، ودفترها خارج
-- نطاق القارئ 'out_of_scope' (book_for_post في الكاتب)، ثمّ قاعدة التاريخ؛ وnull = تُصدر.
create or replace function private.ticket_invoice_block(t public.weigh_tickets) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when b.id is null then 'no_book'
    when not public.in_scope_book(b.id) then 'out_of_scope'
    else private.ticket_date_block(t.on_date)
  end
  from (select (select x.id from public.ledger_books x where x.org_id = t.org_id and x.division_id = t.division_id and x.code = 'main') as id) as b
$$;

-- التذكرة للقارئ والكاتب (العقد §5.1): رأسها ووقفاتها بصافيها ومعدّلها والحيّ الآن وما على تذاكر أخرى، والفاتورة لأدوار المبيعات، والأفعال
-- والتنبيهات (طيور الوقفة أكثر من الحيّ ناقص ما على التذاكر الأخرى). بلا مال.
create or replace function private.weigh_ticket_json(p_ticket uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  t public.weigh_tickets;
  v_sale jsonb;
  v_invoiced boolean;
  v_stops jsonb;
  v_warnings jsonb;
  v_gross numeric;
  v_sales boolean := public.can_see_sales();
  v_block text;
begin
  select * into t from public.weigh_tickets x where x.org_id = public.auth_org() and x.id = p_ticket;
  if t.id is null then
    return null;
  end if;
  v_invoiced := exists (select 1 from public.bird_sales b where b.org_id = t.org_id and b.ticket_id = t.id and b.status = 'posted');
  -- مراجعة 0028 O4: المكتملة بلا فاتورة لا تُعرض «أصدر الفاتورة» لها إن رفضها الكاتب (التاريخ أو الدفتر)، وinvoice_why يقول لماذا.
  if t.status = 'done' and not v_invoiced then
    v_block := private.ticket_invoice_block(t);
  end if;
  if v_sales then
    select jsonb_build_object('id', b.id, 'doc_no', b.doc_no, 'status', b.status) into v_sale
    from public.bird_sales b where b.org_id = t.org_id and b.ticket_id = t.id
    order by b.status = 'posted' desc, b.posted_at desc, b.id limit 1;
  end if;
  with n as (
    select * from private.ticket_nets(t.id)
  ), r as (
    select s.id, s.stop_no, s.hall_id, h.name as hall_name, s.flock_id, f.status as flock_status, s.birds, n.crates, n.gross_kg, n.prev_gross, n.crates_kg,
      n.net_kg, case when n.net_kg > 0 and s.birds > 0 then private._mul_div_round(n.net_kg, 1, s.birds, 3) end as avg_kg,
      private.flock_live(f) as live, private.flock_ticketed(f.id, t.id) as other,
      (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'weighing_no', g.weighing_no, 'crates', g.crates, 'gross_kg', g.gross_kg::text)
          order by g.weighing_no), '[]'::jsonb)
        from public.weigh_ticket_weighings g where g.org_id = s.org_id and g.stop_id = s.id) as weighings
    from public.weigh_ticket_stops s
    join n on n.stop_id = s.id
    join public.halls h on h.org_id = s.org_id and h.id = s.hall_id
    join public.flocks f on f.org_id = s.org_id and f.id = s.flock_id
    where s.org_id = t.org_id and s.ticket_id = t.id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'stop_no', r.stop_no, 'hall_id', r.hall_id, 'hall_name', r.hall_name, 'flock_id', r.flock_id,
      'flock_status', r.flock_status, 'birds', r.birds, 'crates', r.crates, 'gross_kg', r.gross_kg::text, 'prev_gross_kg', r.prev_gross::text,
      'crates_kg', r.crates_kg::text, 'net_kg', r.net_kg::text, 'avg_kg', r.avg_kg::text, 'live', r.live, 'other_ticketed', r.other,
      'weighings', r.weighings) order by r.stop_no), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object('stop_id', r.id, 'hall_name', r.hall_name, 'birds', r.birds, 'live', r.live, 'other_ticketed', r.other)
      order by r.stop_no) filter (where t.status <> 'void' and not v_invoiced and r.birds > r.live - r.other), '[]'::jsonb),
    (array_agg(r.gross_kg order by r.stop_no desc))[1]
  into v_stops, v_warnings, v_gross
  from r;
  return jsonb_build_object('id', t.id, 'ticket_no', t.ticket_no, 'status', t.status, 'version', t.version, 'site_id', t.site_id,
    'site_name', (select s.name from public.sites s where s.org_id = t.org_id and s.id = t.site_id), 'division_id', t.division_id, 'on_date', t.on_date,
    'method', t.method, 'empty_kg', t.empty_kg::text, 'empty_with_crates', t.empty_with_crates, 'crate_kg', t.crate_kg::text, 'vehicle', t.vehicle,
    'driver', t.driver, 'note', t.note, 'birds', t.birds, 'crates', t.crates,
    'gross_kg', case when t.method = 'scale' then v_gross::text end,
    'net_kg', t.net_kg::text, 'avg_kg', case when t.net_kg > 0 and t.birds > 0 then private._mul_div_round(t.net_kg, 1, t.birds, 3)::text end,
    'stops', v_stops, 'invoiced', v_invoiced, 'sale', v_sale, 'created_by_name', private.member_name(t.created_by),
    'finished_at', t.finished_at, 'voided_at', t.voided_at, 'void_reason', t.void_reason,
    'can', jsonb_build_object(
      'edit', t.status = 'draft' and public.can('weigh_ticket.draft'),
      'finish', t.status = 'draft' and public.can('weigh_ticket.draft'),
      'void', (t.status = 'draft' and public.can('weigh_ticket.draft')) or (t.status = 'done' and not v_invoiced and public.can('void')),
      'invoice', t.status = 'done' and not v_invoiced and v_sales and public.can('sale.post') and v_block is null),
    'invoice_why', v_block,
    'warnings', v_warnings);
end
$$;

-- مقبوض فاتورة الطيور رُدّ للتاجر («ألغِ القبض» على قيده: void_party_payment يعكسه): قاعدة 0021 (sale_result وsales_overview) في مكان واحد لكلّ قارئ
-- يعرض المقبوض (مراجعة 0028 M3).
create or replace function private.bird_sale_refunded(p_payment uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_payment is not null and exists (select 1 from public.party_entries r where r.org_id = public.auth_org() and r.reverses_entry_id = p_payment)
$$;

-- الفاتورة من صفوفها (أوّل نداء والإعادة والقارئ، العقد §5.5): المبلغ والسعر والمقبوض وحصّة كلّ فوج داخل money. مراجعة 0028 M3 (قاعدة 0021
-- لـsale_result): المقبوض الذي رُدّ («ألغِ القبض»: قيد القبض معكوس) صفرٌ، وpayment_refunded يقول ذلك.
create or replace function private.bird_sale_result(p_sale uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', b.id, 'doc_no', b.doc_no, 'status', b.status, 'sold_on', b.sold_on, 'ticket_id', b.ticket_id, 'ticket_no', t.ticket_no,
    'payment_refunded', k.refunded,
    'site_id', b.site_id, 'site_name', s.name, 'party_id', b.party_id, 'party_name', p.name, 'book_id', b.book_id, 'birds', b.birds,
    'net_kg', b.net_kg::text, 'billed_kg', b.billed_kg::text, 'deduction_pct', b.deduction_pct::text,
    'avg_kg', private._mul_div_round(b.net_kg, 1, b.birds, 3)::text, 'cash_account_id', b.cash_account_id,
    'account_name', (select a.name from public.cash_accounts a where a.org_id = b.org_id and a.id = b.cash_account_id), 'note', b.note,
    'voided_at', b.voided_at, 'void_reason', b.void_reason,
    'sources', coalesce((select jsonb_agg(jsonb_build_object('stop_id', x.stop_id, 'flock_id', x.flock_id, 'hall_id', x.hall_id, 'hall_name', h.name,
        'birds', x.birds, 'net_kg', x.net_kg::text, 'avg_kg', private._mul_div_round(x.net_kg, 1, x.birds, 3)::text,
        'money', jsonb_build_object('revenue', x.revenue::text)) order by st.stop_no)
      from public.bird_sale_sources x
      join public.weigh_ticket_stops st on st.org_id = x.org_id and st.id = x.stop_id
      join public.halls h on h.org_id = x.org_id and h.id = x.hall_id
      where x.org_id = b.org_id and x.sale_id = b.id), '[]'::jsonb),
    'money', jsonb_build_object('unit_price', b.unit_price::text, 'total', b.total::text, 'paid_now', case when k.refunded then 0 else b.paid_now end::text))
  from public.bird_sales b
  join public.weigh_tickets t on t.org_id = b.org_id and t.id = b.ticket_id
  join public.sites s on s.org_id = b.org_id and s.id = b.site_id
  join public.parties p on p.org_id = b.org_id and p.id = b.party_id
  cross join lateral (select private.bird_sale_refunded(b.payment_entry_id) as refunded) as k
  where b.org_id = public.auth_org() and b.id = p_sale
$$;

-- أوّل نشاط على الفوج بعد يوم (للإغلاق: لا شيء بعد يومه؛ وللنموذج أقرب يوم مسموح): الجولة، ووزن العيّنة، والصرف المرحَّل، وتسجيل الدواء، وتأشير
-- اللقاح المنفَّذ، والفاتورة، وفرق العدّ (الأصول الحيّة). p_on فارغ = آخر نشاط (أبعد يوم) بلا حدّ.
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
  ) as a
  where p_on is null or a.d > p_on
  order by case when p_on is null then a.d end desc nulls last, case when p_on is not null then a.d end, a.rank
  limit 1
$$;

-- ─── د. تذكرة الوزن (weigh_ticket.draft: عامل القاعة في حقله والمدير) ────────────────────────────────────────────────────
-- حفظ المسوّدة بعد كلّ وزنة (العقد §4.1): كتابة مشروطة تُعاد بأمان بالمحتوى، بلا مرجع. المحتوى نفسه = حُفظ بلا كتابة؛ ونسخة غير التي رآها الكاتب
-- = stale بالتذكرة كما في الخادم (بلا رفض ولا كتابة، كـstale_day)؛ وإلّا تُكتب كلّها: الرأس (النسخة + 1)، والوقفات بمعرّفاتها بترتيب التحميل وفوج كلّ
-- قاعة القائم (للمشاركة بترتيب معرّفاتها)، والوزنات، ويُحذف ما شيل من المسوّدة؛ ثمّ لقطة صافي كلّ وقفة والمجاميع (فارغة ما دامت وقفة ناقصة).
-- الخابط الذي لا يزيد على ما قبله والصافي غير الموجب يُرفضان حيث عُرف طرفاهما.
create or replace function public.save_weigh_ticket(p_ticket uuid, p_expected_version int, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_num constant text := '^[0-9]{1,9}([.][0-9]{1,3})?$';
  v_day constant text := '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
  v_site uuid;
  v_on date;
  v_method text;
  v_empty numeric;
  v_with boolean;
  v_crate numeric;
  v_vehicle text;
  v_driver text;
  v_note text;
  v_stops jsonb := '[]'::jsonb;
  v_content jsonb;
  a jsonb;
  g jsonb;
  v_ws jsonb;
  v_birds int;
  v_crates int;
  v_gross numeric;
  v_n int;
  v_ids uuid[] := '{}';
  v_wids uuid[] := '{}';
  v_halls uuid[] := '{}';
  s public.sites;
  v_kind text;
  x public.weigh_tickets;
  h public.halls;
  f public.flocks;
  r record;
  v_version int;
  v_key bigint;
  v_rows int;
begin
  set local lock_timeout = '5s';
  perform private.require('weigh_ticket.draft');
  if p_ticket is null then
    raise exception 'id_required' using hint = 'تعذّر الحفظ دون معرّف التذكرة. حدّث الشاشة وأعد المحاولة.';
  end if;

  -- ١) الشكل والمحتوى القانونيّ قبل أيّ قراءة: الأرقام نصوص عشرية بثلاث مراتب، والأعداد أعداد صحيحة، والمعرّفات uuid.
  if p_data is null or jsonb_typeof(p_data) <> 'object' or coalesce(p_data ->> 'site_id', '') !~ v_uuid
      or coalesce(jsonb_typeof(p_data -> 'on_date'), 'null') not in ('null', 'string') or coalesce(p_data ->> 'on_date', '2000-01-01') !~ v_day
      or coalesce(jsonb_typeof(p_data -> 'stops'), 'null') not in ('null', 'array')
      or coalesce(jsonb_typeof(p_data -> 'empty_with_crates'), 'null') not in ('null', 'boolean') then
    raise exception 'bad_ticket' using hint = 'بيانات التذكرة غير صالحة. حدّث الشاشة وأعد المحاولة.';
  end if;
  foreach v_method in array array['empty_kg', 'crate_kg'] loop
    if coalesce(jsonb_typeof(p_data -> v_method), 'null') not in ('null', 'string') or coalesce(p_data ->> v_method, '0') !~ v_num then
      raise exception 'bad_weight' using hint = 'الوزن بالكيلوغرام رقم أكبر من صفر، بثلاث مراتب عشرية على الأكثر.';
    end if;
  end loop;
  foreach v_method in array array['vehicle', 'driver', 'note'] loop
    if coalesce(jsonb_typeof(p_data -> v_method), 'null') not in ('null', 'string') then
      raise exception 'bad_ticket' using hint = 'بيانات التذكرة غير صالحة. حدّث الشاشة وأعد المحاولة.';
    end if;
  end loop;
  v_site := (p_data ->> 'site_id')::uuid;
  v_on := (p_data ->> 'on_date')::date;
  v_method := p_data ->> 'method';
  if v_method is null or v_method not in ('scale', 'crates') then
    raise exception 'bad_method' using hint = 'اختر طريقة الوزن: القبّان أو ميزان الأقفاص.';
  end if;
  v_empty := round((p_data ->> 'empty_kg')::numeric, 3);
  v_with := (p_data ->> 'empty_with_crates')::boolean;
  v_crate := round((p_data ->> 'crate_kg')::numeric, 3);
  v_vehicle := nullif(btrim(coalesce(p_data ->> 'vehicle', '')), '');
  v_driver := nullif(btrim(coalesce(p_data ->> 'driver', '')), '');
  v_note := nullif(btrim(coalesce(p_data ->> 'note', '')), '');
  if v_method = 'scale' and v_with is null then
    raise exception 'bad_method' using hint = 'اختر طريقة الوزن: القبّان أو ميزان الأقفاص.';
  end if;
  if v_method = 'crates' then
    -- ميزان الأقفاص بلا وزن فارغ ولا حالة أقفاص فيه.
    v_empty := null;
    v_with := null;
  end if;
  if (v_empty is not null and (v_empty <= 0 or v_empty > 200000)) then
    raise exception 'bad_weight' using hint = 'وزن الفارغ بالكيلوغرام أكبر من صفر حتى 200,000، بثلاث مراتب عشرية على الأكثر.';
  end if;
  if (v_crate is not null and (v_crate <= 0 or v_crate > 100)) then
    raise exception 'bad_weight' using hint = 'وزن القفص الفارغ بالكيلوغرام أكبر من صفر حتى 100، بثلاث مراتب عشرية على الأكثر.';
  end if;
  if (v_vehicle is not null and length(v_vehicle) > 40) or (v_driver is not null and length(v_driver) > 40) or (v_note is not null and length(v_note) > 500) then
    raise exception 'bad_text' using hint = 'رقم السيارة واسم السائق حتى 40 حرفاً، والملاحظة حتى 500 حرف.';
  end if;
  if jsonb_array_length(coalesce(p_data -> 'stops', '[]'::jsonb)) > 20 then
    raise exception 'too_many_stops' using hint = 'التذكرة الواحدة حتى 20 قاعة.';
  end if;
  for a in select e.x from jsonb_array_elements(coalesce(p_data -> 'stops', '[]'::jsonb)) as e(x) loop
    if jsonb_typeof(a) <> 'object' or coalesce(a ->> 'id', '') !~ v_uuid or coalesce(a ->> 'hall_id', '') !~ v_uuid
        or coalesce(jsonb_typeof(a -> 'weighings'), 'null') not in ('null', 'array') then
      raise exception 'bad_ticket' using hint = 'بيانات التذكرة غير صالحة. حدّث الشاشة وأعد المحاولة.';
    end if;
    if coalesce(jsonb_typeof(a -> 'birds'), 'null') not in ('null', 'number') or coalesce(a ->> 'birds', '1') !~ '^[0-9]{1,9}$' then
      raise exception 'bad_count' using hint = 'عدد الطيور عدد صحيح من 1 إلى 10,000,000.';
    end if;
    -- مراجعة 0028 C7: الأقفاص بفحصها وتلميحها (كان عدد أقفاص سالب يُرفض بتلميح عدد الطيور).
    if coalesce(jsonb_typeof(a -> 'crates'), 'null') not in ('null', 'number') or coalesce(a ->> 'crates', '0') !~ '^[0-9]{1,9}$' then
      raise exception 'bad_count' using hint = 'عدد أقفاص القاعة من صفر إلى 100,000.';
    end if;
    if coalesce(jsonb_typeof(a -> 'gross_kg'), 'null') not in ('null', 'string') or coalesce(a ->> 'gross_kg', '0') !~ v_num then
      raise exception 'bad_weight' using hint = 'وزن الخابط بالكيلوغرام رقم أكبر من صفر، بثلاث مراتب عشرية على الأكثر.';
    end if;
    v_birds := (a ->> 'birds')::int;
    v_crates := (a ->> 'crates')::int;
    v_gross := round((a ->> 'gross_kg')::numeric, 3);
    if v_birds is not null and (v_birds < 1 or v_birds > 10000000) then
      raise exception 'bad_count' using hint = 'عدد الطيور عدد صحيح من 1 إلى 10,000,000.';
    end if;
    v_ws := '[]'::jsonb;
    if v_method = 'scale' then
      if jsonb_array_length(coalesce(a -> 'weighings', '[]'::jsonb)) > 0 then
        raise exception 'bad_method' using hint = 'وزنات ميزان الأقفاص لا تُكتب في تذكرة القبّان. اختر طريقة الوزن: القبّان أو ميزان الأقفاص.';
      end if;
      if v_crates is not null and v_crates > 100000 then
        raise exception 'bad_count' using hint = 'عدد أقفاص القاعة من صفر إلى 100,000.';
      end if;
      if v_gross is not null and (v_gross <= 0 or v_gross > 200000) then
        raise exception 'bad_weight' using hint = 'وزن الخابط بالكيلوغرام أكبر من صفر حتى 200,000، بثلاث مراتب عشرية على الأكثر.';
      end if;
    else
      -- ميزان الأقفاص: أقفاص الوقفة وخابطها من وزناتها.
      v_crates := null;
      v_gross := null;
      if jsonb_array_length(coalesce(a -> 'weighings', '[]'::jsonb)) > 2000 then
        raise exception 'bad_count' using hint = 'الوزنات حتى 2,000 لكلّ قاعة.';
      end if;
      for g in select e.x from jsonb_array_elements(coalesce(a -> 'weighings', '[]'::jsonb)) as e(x) loop
        if jsonb_typeof(g) <> 'object' or coalesce(g ->> 'id', '') !~ v_uuid then
          raise exception 'bad_ticket' using hint = 'بيانات التذكرة غير صالحة. حدّث الشاشة وأعد المحاولة.';
        end if;
        if jsonb_typeof(g -> 'crates') is distinct from 'number' or (g ->> 'crates') !~ '^[0-9]{1,9}$' or (g ->> 'crates')::int not between 1 and 1000 then
          raise exception 'bad_count' using hint = 'عدد أقفاص الوزنة من 1 إلى 1,000.';
        end if;
        if jsonb_typeof(g -> 'gross_kg') is distinct from 'string' or (g ->> 'gross_kg') !~ v_num
            or (g ->> 'gross_kg')::numeric <= 0 or (g ->> 'gross_kg')::numeric > 100000 then
          raise exception 'bad_weight' using hint = 'وزن الوزنة بالكيلوغرام أكبر من صفر حتى 100,000، بثلاث مراتب عشرية على الأكثر.';
        end if;
        v_ws := v_ws || jsonb_build_object('id', lower(g ->> 'id')::uuid, 'crates', (g ->> 'crates')::int, 'gross_kg', round((g ->> 'gross_kg')::numeric, 3));
        v_wids := v_wids || (g ->> 'id')::uuid;
      end loop;
    end if;
    if (a ->> 'hall_id')::uuid = any (v_halls) then
      select * into h from public.halls y where y.org_id = v_org and y.id = (a ->> 'hall_id')::uuid;
      if h.id is null then
        raise exception 'hall_not_found' using hint = 'هذه القاعة غير موجودة في منشأتك. حدّث الشاشة.';
      end if;
      raise exception 'duplicate_hall' using hint = format('القاعة «%s» مكرّرة في التذكرة.', h.name);
    end if;
    v_halls := v_halls || (a ->> 'hall_id')::uuid;
    v_ids := v_ids || (a ->> 'id')::uuid;
    v_stops := v_stops || jsonb_build_object('id', (a ->> 'id')::uuid, 'hall_id', (a ->> 'hall_id')::uuid, 'birds', v_birds, 'crates', v_crates,
      'gross_kg', v_gross, 'weighings', v_ws);
  end loop;
  if (select count(*) from unnest(v_ids || v_wids)) <> (select count(distinct u.z) from unnest(v_ids || v_wids) as u(z)) then
    raise exception 'id_conflict' using hint = 'معرّف مكرّر داخل التذكرة نفسها. حدّث الشاشة وأعد المحاولة.';
  end if;
  v_content := jsonb_build_object('site_id', v_site, 'on_date', v_on, 'method', v_method, 'empty_kg', v_empty, 'empty_with_crates', v_with,
    'crate_kg', v_crate, 'vehicle', v_vehicle, 'driver', v_driver, 'note', v_note, 'stops', v_stops);

  -- ٢) المعرّف بقفله (حفظان للتذكرة نفسها يترتّبان)، ثمّ الحقل: موجود، وبنطاق الكاتب (قبل أن يُسمّى)، وحقل لحم، وغير مؤرشف.
  perform pg_advisory_xact_lock(hashtextextended('weigh_ticket:' || p_ticket::text, 0));
  -- مراجعة 0028 C2: معرّفات الوقفات والوزنات من الجهاز بأقفالها قبل فحص «مستعمل في تذكرة أخرى» (كان حفظان لتذكرتين جديدتين بمعرّف وقفة واحد يعبران
  -- الفحص معاً فيكتب الثاني فوق وقفة الأوّل). الوقفات بمعرّفها (حتى 20) بترتيبه، والوزنات (حتى 40,000) بسلال تجزئة ثابتة العدد بترتيبها حتى لا يمتلئ
  -- جدول الأقفال؛ وكلّ حفظ يأخذها بالترتيب نفسه (الوقفات ثمّ السلال)، فلا تقافل.
  for v_key in select distinct z.id_key from (select hashtextextended('weigh_ticket_stop:' || u.id::text, 0) as id_key from unnest(v_ids) as u(id)) as z
      order by z.id_key loop
    perform pg_advisory_xact_lock(v_key);
  end loop;
  for v_key in select distinct (hashtextextended(u.id::text, 0) & 63) from unnest(v_wids) as u(id) order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended('weigh_ticket_weighing:' || v_key::text, 0));
  end loop;
  select * into s from public.sites y where y.org_id = v_org and y.id = v_site;
  if s.id is null then
    raise exception 'site_not_found' using hint = 'هذا الحقل غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(s.id) then
    raise exception 'out_of_scope' using hint = 'هذا الحقل خارج نطاقك، فلا تكتب تذكرة لقاعاته. اطلب من مالك المنشأة إضافته إلى نطاقك.';
  end if;
  select d.kind into v_kind from public.divisions d where d.org_id = s.org_id and d.id = s.division_id;
  if s.kind <> 'farm' or v_kind is distinct from 'broiler' then
    raise exception 'site_not_broiler' using hint = 'تذكرة الوزن لحقول اللحم في هذه النسخة؛ بيع الدجاج المستبعد يأتي لاحقاً.';
  end if;
  if s.archived_at is not null then
    raise exception 'site_archived' using hint = 'الحقل مؤرشف، فلا تُكتب فيه تذكرة.';
  end if;

  -- ٣) التذكرة القائمة: مسوّدة بحقلها نفسه؛ المحتوى نفسه = حُفظ، والنسخة القديمة = stale بلا كتابة.
  select * into x from public.weigh_tickets y where y.id = p_ticket;
  if x.id is null then
    if p_expected_version is not null then
      raise exception 'ticket_not_found' using hint = 'هذه التذكرة غير موجودة في منشأتك. حدّث الشاشة.';
    end if;
  else
    if x.org_id <> v_org then
      raise exception 'id_conflict' using hint = 'معرّف هذه التذكرة مستعمل. حدّث الشاشة وأعد المحاولة.';
    end if;
    -- مراجعة 0028 C4: حقل التذكرة القائمة نفسها بنطاق الكاتب قبل قفلها وقبل أن تُسمّى (كانت تُقفل وتُسمّى برقمها لعامل حقل آخر).
    if not public.in_scope_site(x.site_id) then
      raise exception 'out_of_scope' using hint = 'حقل هذه التذكرة خارج نطاقك. اطلب من مالك المنشأة إضافته إلى نطاقك.';
    end if;
    select * into x from public.weigh_tickets y where y.org_id = v_org and y.id = p_ticket for update;
    if x.status <> 'draft' then
      raise exception 'ticket_not_draft' using hint = case when x.ticket_no is null then 'حُذفت هذه المسوّدة، فلا تُعدَّل. أنشئ تذكرة جديدة.'
        else format('التذكرة %s اكتملت أو أُلغيت، فلا تُعدَّل. ألغِها وأنشئ غيرها إن كانت خاطئة.', x.ticket_no) end;
    end if;
    if x.site_id <> v_site then
      raise exception 'site_fixed' using hint = 'حقل التذكرة لا يتغيّر بعد إنشائها. أنشئ تذكرة جديدة.';
    end if;
    if private.weigh_ticket_content(x.id) = v_content then
      return jsonb_build_object('status', 'saved', 'ticket', private.weigh_ticket_json(x.id));
    end if;
    if p_expected_version is null or p_expected_version <> x.version then
      return jsonb_build_object('status', 'stale', 'server', private.weigh_ticket_json(x.id));
    end if;
  end if;

  -- ٤) تحت القفل: التاريخ، والمعرّفات المستعملة في تذاكر أخرى، والقاعات في الحقل وغير مؤرشفة، وأفواجها القائمة للمشاركة بترتيب معرّفاتها.
  if v_on is null then
    raise exception 'date_required' using hint = 'اكتب تاريخ التذكرة.';
  end if;
  if v_on > v_today then
    raise exception 'date_in_future' using hint = format('التاريخ %s بعد تاريخ اليوم %s.', to_char(v_on, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY'));
  end if;
  if exists (select 1 from public.weigh_ticket_stops y where y.id = any (v_ids) and y.ticket_id <> p_ticket)
      or exists (select 1 from public.weigh_ticket_weighings y where y.id = any (v_wids) and y.ticket_id <> p_ticket) then
    raise exception 'id_conflict' using hint = 'معرّف وقفة أو وزنة مستعمل في تذكرة أخرى. حدّث الشاشة وأعد المحاولة.';
  end if;
  for r in select (e.x ->> 'hall_id')::uuid as hall_id from jsonb_array_elements(v_stops) as e(x) loop
    select * into h from public.halls y where y.org_id = v_org and y.id = r.hall_id;
    -- مراجعة 0028 C7: القاعة المجهولة برمزها (كانت hall_other_site باسم فارغ «»).
    if h.id is null then
      raise exception 'hall_not_found' using hint = 'هذه القاعة غير موجودة في منشأتك. حدّث الشاشة.';
    end if;
    if h.site_id <> v_site then
      raise exception 'hall_other_site' using hint = format('القاعة «%s» ليست في حقل هذه التذكرة.', h.name);
    end if;
    if h.archived_at is not null then
      raise exception 'hall_archived' using hint = format('القاعة «%s» مؤرشفة، فلا تُحمَّل منها طيور.', h.name);
    end if;
  end loop;
  perform 1 from public.flocks y
  where y.org_id = v_org and y.hall_id = any (v_halls) and y.status in ('preparing', 'active')
  order by y.id for share;
  for r in select (e.x ->> 'hall_id')::uuid as hall_id from jsonb_array_elements(v_stops) as e(x) loop
    select * into h from public.halls y where y.org_id = v_org and y.id = r.hall_id;
    select * into f from public.flocks y where y.org_id = v_org and y.hall_id = h.id and y.status in ('preparing', 'active');
    if f.id is null or f.status <> 'active' or f.kind <> 'broiler' then
      raise exception 'no_active_flock' using hint = format('لا فوج قائم في «%s»، فلا تُحمَّل منها طيور.', h.name);
    end if;
    if v_on < f.placed_on then
      raise exception 'before_placement' using hint = format('التاريخ %s قبل تسكين «%s» في %s.', to_char(v_on, 'DD/MM/YYYY'), h.name, to_char(f.placed_on, 'DD/MM/YYYY'));
    end if;
  end loop;

  -- ٥) الكتابة: الرأس، ثمّ حذف ما شيل من المسوّدة (الوزنات قبل وقفاتها)، ثمّ الوقفات والوزنات بمعرّفاتها، ثمّ لقطة أقفاص الوقفة وخابطها في ميزان الأقفاص.
  v_version := coalesce(x.version, 0) + 1;
  if x.id is null then
    insert into public.weigh_tickets (id, org_id, site_id, division_id, on_date, method, empty_kg, empty_with_crates, crate_kg, vehicle, driver, note, status, version)
    values (p_ticket, v_org, s.id, s.division_id, v_on, v_method, v_empty, v_with, v_crate, v_vehicle, v_driver, v_note, 'draft', 1);
  else
    update public.weigh_tickets set on_date = v_on, method = v_method, empty_kg = v_empty, empty_with_crates = v_with, crate_kg = v_crate,
      vehicle = v_vehicle, driver = v_driver, note = v_note, birds = null, crates = null, net_kg = null, version = v_version,
      updated_at = now(), updated_by = auth.uid()
    where org_id = v_org and id = p_ticket;
  end if;
  delete from public.weigh_ticket_weighings y where y.org_id = v_org and y.ticket_id = p_ticket and not (y.id = any (v_wids));
  delete from public.weigh_ticket_weighings y where y.org_id = v_org and y.ticket_id = p_ticket and y.stop_id <> all (v_ids);
  delete from public.weigh_ticket_stops y where y.org_id = v_org and y.ticket_id = p_ticket and not (y.id = any (v_ids));
  v_n := 0;
  for a in select e.x from jsonb_array_elements(v_stops) as e(x) loop
    v_n := v_n + 1;
    select * into f from public.flocks y where y.org_id = v_org and y.hall_id = (a ->> 'hall_id')::uuid and y.status = 'active';
    -- مراجعة 0028 C2: التحديث بالمعرّف لصفّ هذه التذكرة وحده؛ وصفر صفوف = المعرّف لتذكرة أخرى (id_conflict، لا كتابة فوق وقفة غيرها).
    insert into public.weigh_ticket_stops (id, org_id, ticket_id, site_id, division_id, stop_no, hall_id, flock_id, birds, crates, gross_kg, net_kg)
    values ((a ->> 'id')::uuid, v_org, p_ticket, s.id, s.division_id, v_n, (a ->> 'hall_id')::uuid, f.id, (a ->> 'birds')::int, (a ->> 'crates')::int,
      (a ->> 'gross_kg')::numeric, null)
    on conflict (id) do update set stop_no = excluded.stop_no, hall_id = excluded.hall_id, flock_id = excluded.flock_id, birds = excluded.birds,
      crates = excluded.crates, gross_kg = excluded.gross_kg, net_kg = null
      where weigh_ticket_stops.org_id = excluded.org_id and weigh_ticket_stops.ticket_id = excluded.ticket_id;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'id_conflict' using hint = 'معرّف وقفة أو وزنة مستعمل في تذكرة أخرى. حدّث الشاشة وأعد المحاولة.';
    end if;
    v_crates := 0;
    for g in select e.x from jsonb_array_elements(a -> 'weighings') as e(x) loop
      v_crates := v_crates + 1;
      insert into public.weigh_ticket_weighings (id, org_id, ticket_id, stop_id, site_id, weighing_no, crates, gross_kg)
      values ((g ->> 'id')::uuid, v_org, p_ticket, (a ->> 'id')::uuid, s.id, v_crates, (g ->> 'crates')::int, (g ->> 'gross_kg')::numeric)
      on conflict (id) do update set stop_id = excluded.stop_id, weighing_no = excluded.weighing_no, crates = excluded.crates, gross_kg = excluded.gross_kg
        where weigh_ticket_weighings.org_id = excluded.org_id and weigh_ticket_weighings.ticket_id = excluded.ticket_id;
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then
        raise exception 'id_conflict' using hint = 'معرّف وقفة أو وزنة مستعمل في تذكرة أخرى. حدّث الشاشة وأعد المحاولة.';
      end if;
    end loop;
  end loop;
  if v_method = 'crates' then
    update public.weigh_ticket_stops st set crates = w.crates, gross_kg = w.gross
    from (select g.stop_id, sum(g.crates)::int as crates, sum(g.gross_kg) as gross from public.weigh_ticket_weighings g
      where g.org_id = v_org and g.ticket_id = p_ticket group by g.stop_id) as w
    where st.org_id = v_org and st.ticket_id = p_ticket and st.id = w.stop_id;
    if exists (select 1 from public.weigh_ticket_stops st where st.org_id = v_org and st.ticket_id = p_ticket and st.gross_kg > 200000) then
      raise exception 'bad_weight' using hint = 'مجموع وزنات القاعة الواحدة حتى 200,000 كيلوغرام. راجع الوزنات.';
    end if;
  end if;

  -- ٦) الصافي حيث عُرف طرفاه: الخابط يزيد على ما قبله، والصافي أكبر من صفر؛ ثمّ لقطته والمجاميع (فارغة ما دامت وقفة ناقصة).
  for r in select n.*, h2.name as hall_name from private.ticket_nets(p_ticket) as n
      join public.weigh_ticket_stops st on st.org_id = v_org and st.id = n.stop_id
      join public.halls h2 on h2.org_id = v_org and h2.id = st.hall_id
      order by n.stop_no loop
    if v_method = 'scale' and r.gross_kg is not null and r.prev_gross is not null and r.gross_kg <= r.prev_gross then
      raise exception 'gross_not_rising' using hint = format('وزن الخابط بعد «%s» (%s) لا يزيد على الذي قبله (%s). راجع الوزن.', r.hall_name,
        private.qty_text(r.gross_kg, 'kg'), private.qty_text(r.prev_gross, 'kg'));
    end if;
    if r.net_kg is not null and r.net_kg <= 0 then
      raise exception 'net_not_positive' using hint = format('صافي «%s» = %s كغم، وهو ليس أكبر من صفر. راجع الأوزان وعدد الأقفاص.', r.hall_name,
        rtrim(to_char(r.net_kg, 'FM999,999,999,990.999'), '.'));
    end if;
  end loop;
  update public.weigh_ticket_stops st set net_kg = n.net_kg
  from private.ticket_nets(p_ticket) as n
  where st.org_id = v_org and st.ticket_id = p_ticket and st.id = n.stop_id and n.net_kg is not null;
  update public.weigh_tickets t set
    birds = case when k.n > 0 and k.n = k.with_birds then k.birds end,
    crates = case when k.n > 0 and k.n = k.with_crates then k.crates end,
    net_kg = case when k.n > 0 and k.n = k.with_net then k.net end
  from (select count(*)::int as n, count(st.birds)::int as with_birds, sum(st.birds)::int as birds, count(st.crates)::int as with_crates,
      sum(st.crates)::int as crates, count(st.net_kg)::int as with_net, sum(st.net_kg) as net
    from public.weigh_ticket_stops st where st.org_id = v_org and st.ticket_id = p_ticket) as k
  where t.org_id = v_org and t.id = p_ticket;
  return jsonb_build_object('status', 'saved', 'ticket', private.weigh_ticket_json(p_ticket));
end
$$;

-- أكمل التذكرة (العقد §4.2): رقم WT ولا تُعدَّل بعده؛ الحيّ لا يتغيّر (الطيور تخرج بالفاتورة، O1). الأقفال: المرجع ← قفل الفترة ← التذكرة ← أفواج وقفاتها
-- للمشاركة بترتيب المعرّف ← العدّاد آخر شيء؛ وكلّ فحص بعد قفله: المسوّدة بنسختها، وتاريخها بقاعدة المستند، واكتمالها، وصافي كلّ وقفة ومعدّل طيرها
-- (0.3 إلى 6 كغم)، وأفواجها قائمة في قاعاتها بلا تسكين بعد يومها.
create or replace function public.finish_weigh_ticket(p_client_ref uuid, p_ticket uuid, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'finish_weigh_ticket';
  v_org uuid := public.auth_org();
  v_cached jsonb;
  x public.weigh_tickets;
  r record;
  v_missing text;
  v_no text;
  v_result jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('weigh_ticket.draft');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('ticket', p_ticket, 'version', p_expected_version));
  if v_cached is not null then
    if exists (select 1 from public.weigh_tickets t where t.org_id = v_org and t.id = p_ticket and t.status = 'void') then
      raise exception 'id_conflict' using hint = 'اكتملت هذه التذكرة ثمّ أُلغيت. أنشئ تذكرة جديدة.';
    end if;
    return v_cached;
  end if;
  select * into x from public.weigh_tickets t where t.org_id = v_org and t.id = p_ticket;
  if x.id is null then
    raise exception 'ticket_not_found' using hint = 'هذه التذكرة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(x.site_id) then
    raise exception 'out_of_scope' using hint = 'حقل هذه التذكرة خارج نطاقك. اطلب من مالك المنشأة إضافته إلى نطاقك.';
  end if;
  perform private.period_guard();
  select * into x from public.weigh_tickets t where t.org_id = v_org and t.id = p_ticket for update;
  if x.status <> 'draft' then
    -- مراجعة 0028 C7: المسوّدة المحذوفة بلا رقم بتلميحها (كان «التذكرة  اكتملت» بفراغ مكان الرقم).
    raise exception 'ticket_not_draft' using hint = case when x.ticket_no is null then 'حُذفت هذه المسوّدة، فلا تُعدَّل. أنشئ تذكرة جديدة.'
      else format('التذكرة %s اكتملت أو أُلغيت، فلا تُعدَّل. ألغِها وأنشئ غيرها إن كانت خاطئة.', x.ticket_no) end;
  end if;
  if p_expected_version is distinct from x.version then
    raise exception 'stale_ticket' using hint = 'تغيّرت التذكرة منذ فتحتها. حدّث الشاشة وراجعها ثمّ أعد المحاولة.';
  end if;
  perform private.check_doc_date(x.on_date);

  -- الاكتمال: أوّل ما ينقص بالترتيب.
  if not exists (select 1 from public.weigh_ticket_stops s where s.org_id = v_org and s.ticket_id = x.id) then
    v_missing := 'قاعة واحدة على الأقلّ';
  elsif x.method = 'scale' and x.empty_kg is null then
    v_missing := 'وزن الفارغ';
  elsif (x.method = 'crates' or not x.empty_with_crates) and x.crate_kg is null then
    v_missing := 'وزن القفص';
  else
    select coalesce(case when s.birds is null then format('عدد طيور قاعة «%s»', h.name) end, n.problem) into v_missing
    from private.ticket_nets(x.id) as n
    join public.weigh_ticket_stops s on s.org_id = v_org and s.id = n.stop_id
    join public.halls h on h.org_id = v_org and h.id = s.hall_id
    where s.birds is null or n.net_kg is null
    order by n.stop_no limit 1;
  end if;
  if v_missing is not null then
    raise exception 'ticket_incomplete' using hint = format('أكمل التذكرة قبل إنهائها: %s.', v_missing);
  end if;

  -- أفواج الوقفات للمشاركة (إغلاق بنفس اللحظة ينتظر أو يُرى)، ثمّ كلّ وقفة: فوجها قائم في قاعتها، وصافيها ومعدّل طيرها.
  perform 1 from public.flocks f
  where f.org_id = v_org and f.id in (select s.flock_id from public.weigh_ticket_stops s where s.org_id = v_org and s.ticket_id = x.id)
  order by f.id for share;
  for r in
    select n.*, s.birds, s.hall_id, h.name as hall_name, f.id as flock_id, f.status as flock_status, f.kind as flock_kind, f.hall_id as flock_hall,
      f.placed_on
    from private.ticket_nets(x.id) as n
    join public.weigh_ticket_stops s on s.org_id = v_org and s.id = n.stop_id
    join public.halls h on h.org_id = v_org and h.id = s.hall_id
    join public.flocks f on f.org_id = v_org and f.id = s.flock_id
    order by n.stop_no
  loop
    if r.flock_status = 'closed' then
      raise exception 'flock_closed' using hint = format('فوج «%s» مغلق، فلا تُحمَّل منه طيور.', r.hall_name);
    end if;
    if r.flock_status <> 'active' or r.flock_kind <> 'broiler' or r.flock_hall <> r.hall_id then
      raise exception 'no_active_flock' using hint = format('لا فوج قائم في «%s»، فلا تُحمَّل منها طيور.', r.hall_name);
    end if;
    if x.on_date < r.placed_on then
      raise exception 'before_placement' using hint = format('التاريخ %s قبل تسكين «%s» في %s.', to_char(x.on_date, 'DD/MM/YYYY'), r.hall_name,
        to_char(r.placed_on, 'DD/MM/YYYY'));
    end if;
    if x.method = 'scale' and r.gross_kg <= r.prev_gross then
      raise exception 'gross_not_rising' using hint = format('وزن الخابط بعد «%s» (%s) لا يزيد على الذي قبله (%s). راجع الوزن.', r.hall_name,
        private.qty_text(r.gross_kg, 'kg'), private.qty_text(r.prev_gross, 'kg'));
    end if;
    if r.net_kg <= 0 then
      raise exception 'net_not_positive' using hint = format('صافي «%s» = %s كغم، وهو ليس أكبر من صفر. راجع الأوزان وعدد الأقفاص.', r.hall_name,
        rtrim(to_char(r.net_kg, 'FM999,999,999,990.999'), '.'));
    end if;
    if not (r.net_kg >= 0.3 * r.birds and r.net_kg <= 6 * r.birds) then
      raise exception 'avg_out_of_range' using hint = format('معدّل الطير في «%s» = %s كغم (%s كغم ÷ %s طير)، وهو خارج المعقول (0.3 إلى 6 كغم). راجع العدد أو الوزن.',
        r.hall_name, rtrim(to_char(private._mul_div_round(r.net_kg, 1, r.birds, 3), 'FM999,999,990.999'), '.'),
        rtrim(to_char(r.net_kg, 'FM999,999,999,990.999'), '.'), to_char(r.birds, 'FM999,999,999,990'));
    end if;
  end loop;

  v_no := private.next_doc_no('WT', x.on_date);
  update public.weigh_tickets set ticket_no = v_no, status = 'done', finished_at = now(), finished_by = auth.uid(), version = version + 1,
    updated_at = now(), updated_by = auth.uid()
  where org_id = v_org and id = x.id;
  v_result := private.weigh_ticket_json(x.id);
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;

-- إلغاء التذكرة (العقد §4.3): المسوّدة بفعل التذكرة وسبب اختياريّ، والمكتملة بفعل الإلغاء وسبب إلزاميّ ولا فاتورة مرحَّلة لها. تحت قفل التذكرة.
create or replace function public.void_weigh_ticket(p_ticket uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_weigh_ticket';
  v_org uuid := public.auth_org();
  v_cached jsonb;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  x public.weigh_tickets;
  v_sale text;
begin
  set local lock_timeout = '5s';
  -- من لا يملك فعل التسويد ولا فعل الإلغاء لا يصل إلى التذكرة (والفعل اللازم بحالتها يُفحص تحت القفل أدناه).
  if not (public.can('weigh_ticket.draft') or public.can('void')) then
    perform private.require('weigh_ticket.draft');
  end if;
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_ticket, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  select * into x from public.weigh_tickets t where t.org_id = v_org and t.id = p_ticket;
  if x.id is null then
    raise exception 'ticket_not_found' using hint = 'هذه التذكرة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(x.site_id) then
    raise exception 'out_of_scope' using hint = 'حقل هذه التذكرة خارج نطاقك. اطلب من مالك المنشأة إضافته إلى نطاقك.';
  end if;
  select * into x from public.weigh_tickets t where t.org_id = v_org and t.id = p_ticket for update;
  if x.status = 'void' then
    raise exception 'already_void' using hint = 'التذكرة ملغاة من قبل.';
  end if;
  if x.status = 'draft' then
    perform private.require('weigh_ticket.draft');
    if v_reason is not null and length(v_reason) > 500 then
      raise exception 'bad_reason' using hint = format('السبب %s حرفاً، والحدّ 500 حرف. اختصره.', length(v_reason));
    end if;
  else
    perform private.require('void');
    v_reason := private.check_reason(p_reason);
    select b.doc_no into v_sale from public.bird_sales b where b.org_id = v_org and b.ticket_id = x.id and b.status = 'posted';
    if v_sale is not null then
      raise exception 'ticket_invoiced' using hint = format('للتذكرة %s فاتورة مرحّلة %s: ألغِ الفاتورة أوّلاً.', x.ticket_no, v_sale);
    end if;
  end if;
  update public.weigh_tickets set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason, version = version + 1,
    updated_at = now(), updated_by = auth.uid()
  where org_id = v_org and id = x.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', x.id, 'ticket_no', x.ticket_no, 'status', 'void'));
end
$$;

-- ─── هـ. فاتورة الطيور BR (sale.post: المحاسب والمدير والمالك) ─────────────────────────────────────────────────────────
-- تذكرة مكتملة واحدة لتاجر واحد (العقد §4.4): الوزن المحسوب = round3(الصافي × (100 − التنزيل) ÷ 100)، والمبلغ = round0(المحسوب × سعر الكيلو)، والمقبوض
-- الآن (0..المبلغ) إلى صندوق. الأقفال: المرجع ← معرّف الفاتورة ← الجهة ← قفل الفترة وصفّ الوحدة ← التذكرة ← أفواج وقفاتها بترتيب المعرّف ← الصندوق ←
-- العدّاد آخر شيء؛ وكلّ فحص بعد قفله. القيود: الفاتورة +المبلغ، والمقبوض قيد قبض −المقبوض يتوزّع على الفاتورة أوّلاً وحركة صندوق +المقبوض؛ ثمّ صفّ
-- إيراد لكلّ وقفة بأكبر الباقي على صافي القاعات، وصفّ «مباع» لفوجها بيوم التذكرة؛ والحيّ لا يصير سالباً في أيّ يوم (flock_live_check).
create or replace function public.record_bird_sale(p_client_ref uuid, p_sale_id uuid, p_ticket uuid, p_ticket_version int, p_party uuid,
  p_unit_price numeric, p_deduction_pct numeric, p_paid_now numeric, p_cash_account uuid, p_note text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'record_bird_sale';
  v_org uuid := public.auth_org();
  v_cached jsonb;
  v_result jsonb;
  v_pct numeric := coalesce(p_deduction_pct, 0);
  v_paid numeric := coalesce(p_paid_now, 0);
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_same boolean;
  x public.bird_sales;
  t public.weigh_tickets;
  p public.parties;
  b public.ledger_books;
  f public.flocks;
  e public.party_entries;
  pay public.party_entries;
  m public.cash_moves;
  r record;
  v_billed numeric;
  v_total numeric;
  v_shares numeric[];
  v_k int := 0;
  v_no text;
  v_sale_doc text;
  v_flocks uuid[];
  v_block text;
begin
  set local lock_timeout = '5s';
  perform private.require('sale.post');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('sale', p_sale_id, 'ticket', p_ticket, 'version', p_ticket_version, 'party', p_party,
    'price', p_unit_price, 'pct', p_deduction_pct, 'paid', p_paid_now, 'box', p_cash_account, 'note', p_note));
  if v_cached is not null then
    if exists (select 1 from public.bird_sales y where y.org_id = v_org and y.id = p_sale_id and y.status = 'void') then
      raise exception 'id_conflict' using hint = 'سُجّلت هذه الفاتورة ثمّ أُلغيت. أصدر فاتورة جديدة للتذكرة.';
    end if;
    return v_cached;
  end if;
  if p_sale_id is null or p_ticket is null then
    raise exception 'id_required' using hint = 'تعذّر الإرسال دون معرّفي الفاتورة والتذكرة. حدّث الشاشة وأعد المحاولة.';
  end if;

  -- الإعادة بالمعرّف (جواب ضاع): الفاتورة المرحَّلة نفسها بمحتواها ومن الكاتب نفسه = حُفظت، فنتيجتها؛ وغيرها تعارض.
  perform pg_advisory_xact_lock(hashtextextended('bird_sale:' || p_sale_id::text, 0));
  select * into x from public.bird_sales y where y.id = p_sale_id;
  if x.id is not null then
    v_same := x.org_id = v_org and x.status = 'posted' and x.created_by is not distinct from auth.uid() and x.ticket_id = p_ticket and x.party_id = p_party
      and x.unit_price = p_unit_price and x.deduction_pct = v_pct and x.paid_now = v_paid and x.cash_account_id is not distinct from p_cash_account
      and x.note is not distinct from v_note;
    if coalesce(v_same, false) then
      v_result := private.bird_sale_result(x.id);
      return private.ref_store(v_fn, p_client_ref, v_result);
    end if;
    raise exception 'id_conflict' using hint = case
      when x.org_id = v_org and x.status = 'void' then 'سُجّلت هذه الفاتورة ثمّ أُلغيت. أصدر فاتورة جديدة للتذكرة.'
      else 'سُجّلت بهذا المعرّف فاتورة غير التي أرسلتها الآن. حدّث الشاشة لترى ما سُجّل، ثمّ أصدر من جديد.'
    end;
  end if;

  -- المدخلات: السعر والتنزيل والمقبوض والصندوق والملاحظة.
  if p_unit_price is null or not (abs(p_unit_price) < 'Infinity') or p_unit_price <= 0 or p_unit_price > 1000000000 or p_unit_price <> round(p_unit_price, 2) then
    raise exception 'bad_price' using hint = 'سعر الكيلو أكبر من صفر، بمرتبتين عشريتين على الأكثر.';
  end if;
  if not (abs(v_pct) < 'Infinity') or v_pct < 0 or v_pct > 10 or v_pct <> round(v_pct, 2) then
    raise exception 'bad_deduction' using hint = 'نسبة التنزيل من 0 إلى 10٪، بمرتبتين عشريتين على الأكثر.';
  end if;
  if not (abs(v_paid) < 'Infinity') or v_paid < 0 or v_paid <> round(v_paid, 0) then
    raise exception 'bad_paid' using hint = 'المقبوض الآن مبلغ بالدينار الصحيح من صفر فأكثر.';
  end if;
  if v_paid > 0 and p_cash_account is null then
    raise exception 'cash_account_required' using hint = 'اختر الصندوق الذي قبضت فيه.';
  end if;
  if v_paid = 0 and p_cash_account is not null then
    raise exception 'bad_payment' using hint = 'بلا مبلغ مقبوض لا يُختار صندوق.';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'bad_note' using hint = format('الملاحظة %s حرفاً، والحدّ 500 حرف. اختصرها.', length(v_note));
  end if;

  -- التذكرة (بلا قفل بعد): موجودة، وبنطاق الكاتب، ومكتملة؛ والجهة؛ والدفتر الرئيسيّ لوحدة الحقل (والكتابة فيه تحتاج نطاق وحدته، E49).
  select * into t from public.weigh_tickets y where y.org_id = v_org and y.id = p_ticket;
  if t.id is null then
    raise exception 'ticket_not_found' using hint = 'هذه التذكرة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(t.site_id) then
    raise exception 'out_of_scope' using hint = 'حقل هذه التذكرة خارج نطاقك. اطلب من مالك المنشأة إضافته إلى نطاقك.';
  end if;
  if t.status <> 'done' then
    raise exception 'ticket_not_done' using hint = case when t.status = 'draft' then 'التذكرة لم تكتمل بعد: أكملها ثمّ أصدر فاتورتها.'
      else 'التذكرة ملغاة، فلا تُصدر لها فاتورة.' end;
  end if;
  p := private.party_for_post(p_party);
  b := private.book_for_post(private.division_main_book(t.division_id));

  v_billed := private._mul_div_round(t.net_kg, 100 - v_pct, 100, 3);
  v_total := private._mul_div_round(v_billed, p_unit_price, 1, 0);
  if v_total <= 0 then
    raise exception 'total_zero' using hint = 'مبلغ الفاتورة يُقرَّب إلى صفر دينار. راجع سعر الكيلو.';
  end if;
  if v_paid > v_total then
    raise exception 'paid_over_total' using hint = format('المقبوض الآن (%s) أكثر من مبلغ الفاتورة (%s).', private.money_text(v_paid), private.money_text(v_total));
  end if;

  -- الأقفال بترتيبها، وكلّ فحص بعد قفله.
  perform private.lock_parties(array[p.id]);
  -- مراجعة 0028 O4: الفاتورة بيوم تذكرتها (D3)، فرفض التاريخ يسمّي التذكرة ويومها (قاعدة القرّاء نفسها، ticket_date_block)، لا «راجع التاريخ».
  perform private.period_guard();
  v_block := private.ticket_date_block(t.on_date);
  if v_block = 'too_old' then
    raise exception 'date_too_old' using hint = format('التذكرة %s بيوم %s، والفاتورة تُكتب بيوم تذكرتها، ولا يُقبل يوم أقدم من 7 أيام (أقدمه %s)، فلا تُصدر فاتورتها الآن.',
      t.ticket_no, to_char(t.on_date, 'DD/MM/YYYY'), to_char(public.app_today() - 7, 'DD/MM/YYYY'));
  elsif v_block = 'period_locked' then
    raise exception 'period_locked' using hint = format('التذكرة %s بيوم %s، والفاتورة تُكتب بيوم تذكرتها، والحسابات مقفلة حتى %s، فلا تُصدر فاتورتها. إن كان اليوم صحيحاً فاطلب من مالك المنشأة فتح الفترة.',
      t.ticket_no, to_char(t.on_date, 'DD/MM/YYYY'),
      to_char((select l.locked_through from public.period_locks l where l.org_id = v_org), 'DD/MM/YYYY'));
  end if;
  perform private.check_post_date(t.on_date, t.division_id);
  select * into t from public.weigh_tickets y where y.org_id = v_org and y.id = p_ticket for update;
  if t.status <> 'done' then
    raise exception 'ticket_not_done' using hint = case when t.status = 'draft' then 'التذكرة لم تكتمل بعد: أكملها ثمّ أصدر فاتورتها.'
      else 'التذكرة ملغاة، فلا تُصدر لها فاتورة.' end;
  end if;
  if p_ticket_version is distinct from t.version then
    raise exception 'stale_ticket' using hint = 'تغيّرت التذكرة منذ فتحتها. حدّث الشاشة وراجعها ثمّ أعد المحاولة.';
  end if;
  select y.doc_no into v_sale_doc from public.bird_sales y where y.org_id = v_org and y.ticket_id = t.id and y.status = 'posted';
  if v_sale_doc is not null then
    raise exception 'ticket_invoiced' using hint = format('صدرت للتذكرة %s فاتورة %s من قبل.', t.ticket_no, v_sale_doc);
  end if;
  select array_agg(s.flock_id order by s.flock_id) into v_flocks from public.weigh_ticket_stops s where s.org_id = v_org and s.ticket_id = t.id;
  perform 1 from public.flocks y where y.org_id = v_org and y.id = any (v_flocks) order by y.id for update;
  for r in
    select s.*, h.name as hall_name from public.weigh_ticket_stops s join public.halls h on h.org_id = s.org_id and h.id = s.hall_id
    where s.org_id = v_org and s.ticket_id = t.id order by s.flock_id
  loop
    select * into f from public.flocks y where y.org_id = v_org and y.id = r.flock_id;
    if f.status = 'closed' then
      raise exception 'flock_closed' using hint = format('فوج «%s» مغلق، فلا تُصدر فاتورة لطيوره. أعد فتح الدورة أوّلاً إن كان الإغلاق خطأ.', r.hall_name);
    end if;
    if f.status <> 'active' or f.hall_id <> r.hall_id or f.kind <> 'broiler' then
      raise exception 'no_active_flock' using hint = format('لا فوج قائم في «%s»، فلا تُصدر فاتورة لطيوره.', r.hall_name);
    end if;
    if t.on_date < f.placed_on then
      raise exception 'before_placement' using hint = format('التاريخ %s قبل تسكين «%s» في %s.', to_char(t.on_date, 'DD/MM/YYYY'), r.hall_name,
        to_char(f.placed_on, 'DD/MM/YYYY'));
    end if;
    if private.flock_live(f) < r.birds then
      raise exception 'birds_over_live' using hint = format('في «%s» بحسب النظام %s طيراً حيّاً، وفي التذكرة %s. إن كان العدد الفعليّ أكبر فليسجّل المدير «فرق العدّ» بتاريخ %s أو قبله، ثمّ أصدر الفاتورة.',
        r.hall_name, to_char(private.flock_live(f), 'FM999,999,999,990'), to_char(r.birds, 'FM999,999,999,990'), to_char(t.on_date, 'DD/MM/YYYY'));
    end if;
  end loop;
  if v_paid > 0 then
    perform private.lock_cash_account(p_cash_account, true);
  end if;
  v_no := private.next_doc_no('BR', t.on_date);

  -- القيود (FOUNDATION ٤٩٥): الفاتورة +المبلغ، والمقبوض يروح لفاتورته هي أوّلاً، وبعده متبقّي الفاتورة يتوزّع من الأقدم.
  e := private.write_entry(gen_random_uuid(), p.id, b.id, 'invoice', v_total, 'bird_sale', p_sale_id, v_no, t.on_date, null);
  if v_paid > 0 then
    pay := private.write_entry(gen_random_uuid(), p.id, b.id, 'payment', -v_paid, 'bird_sale', p_sale_id, v_no, t.on_date, null);
    perform private.allocate_entry(pay.id, e.id);
    m := private.write_cash_move(p_cash_account, v_paid, 'party_payment', 'bird_sale', p_sale_id, pay.id, t.on_date, null, null);
  end if;
  perform private.allocate_entry(e.id, null);
  insert into public.bird_sales (id, org_id, doc_no, ticket_id, site_id, division_id, party_id, book_id, sold_on, birds, net_kg, unit_price, deduction_pct,
    billed_kg, total, paid_now, cash_account_id, invoice_entry_id, payment_entry_id, cash_move_id, note, status, client_ref, posted_at, posted_by)
  values (p_sale_id, v_org, v_no, t.id, t.site_id, t.division_id, p.id, b.id, t.on_date, t.birds, t.net_kg, p_unit_price, v_pct, v_billed, v_total, v_paid,
    case when v_paid > 0 then p_cash_account end, e.id, pay.id, m.id, v_note, 'posted', p_client_ref, now(), auth.uid());

  -- الإيراد لكلّ فوج بصافي قاعته (أكبر الباقي بالدينار)، وصفّ «مباع» بيوم التذكرة.
  v_shares := private.alloc_lr(v_total, array(select s.net_kg from public.weigh_ticket_stops s where s.org_id = v_org and s.ticket_id = t.id order by s.stop_no), 0);
  for r in select s.* from public.weigh_ticket_stops s where s.org_id = v_org and s.ticket_id = t.id order by s.stop_no loop
    v_k := v_k + 1;
    insert into public.bird_sale_sources (id, org_id, sale_id, site_id, division_id, stop_id, hall_id, flock_id, birds, net_kg, revenue)
    values (private.derived_ref(p_sale_id, r.stop_no), v_org, p_sale_id, t.site_id, t.division_id, r.id, r.hall_id, r.flock_id, r.birds, r.net_kg, v_shares[v_k]);
    select * into f from public.flocks y where y.org_id = v_org and y.id = r.flock_id;
    insert into public.flock_counts (org_id, flock_id, hall_id, site_id, division_id, on_date, kind, birds, net_kg, doc_kind, doc_id, doc_line_id)
    values (v_org, f.id, f.hall_id, f.site_id, f.division_id, t.on_date, 'sold', -r.birds, r.net_kg, 'bird_sale', p_sale_id,
      private.derived_ref(p_sale_id, r.stop_no));
  end loop;
  perform private.mark_division_posted(t.division_id);
  for f in select y.* from public.flocks y where y.org_id = v_org and y.id = any (v_flocks) order by y.id loop
    perform private.flock_live_check(f);
  end loop;
  v_result := private.bird_sale_result(p_sale_id);
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;

-- إلغاء الفاتورة (void، العقد §4.5): قيد الفاتورة يُلغى بقيد عكسيّ، والمقبوض وحركة صندوقه يبقيان رصيداً للتاجر (D:595)؛ وكلّ صفّ «مباع» يُعكس بيوم
-- الإلغاء فتعود الطيور حيّة؛ والتذكرة تبقى مكتملة فتصدر لها فاتورة جديدة. يُرفض على فوج مغلق. الأقفال: المرجع ← الجهة ← قفل الفترة ← الفاتورة ←
-- أفواجها بترتيب المعرّف.
create or replace function public.void_bird_sale(p_sale_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_bird_sale';
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_cached jsonb;
  v_reason text;
  x public.bird_sales;
  c public.flock_counts;
  r record;
  v_kept numeric := 0;
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_sale_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into x from public.bird_sales y where y.org_id = v_org and y.id = p_sale_id;
  if x.id is null then
    raise exception 'doc_not_found' using hint = 'هذه الفاتورة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(x.site_id) then
    raise exception 'out_of_scope' using hint = 'حقل هذه الفاتورة خارج نطاقك، فلا تلغيها. اطلب من مالك المنشأة إضافته إلى نطاقك.';
  end if;
  perform private.book_for_post(x.book_id);
  perform private.lock_parties(array[x.party_id]);
  perform private.check_void_date();
  select * into x from public.bird_sales y where y.org_id = v_org and y.id = p_sale_id for update;
  if x.status = 'void' then
    raise exception 'already_void' using hint = format('الفاتورة %s ملغاة من قبل.', x.doc_no);
  end if;
  perform 1 from public.flocks y where y.org_id = v_org and y.id in (select s.flock_id from public.bird_sale_sources s where s.org_id = v_org and s.sale_id = x.id)
  order by y.id for update;
  select h.name into r from public.bird_sale_sources s
  join public.flocks y on y.org_id = s.org_id and y.id = s.flock_id
  join public.halls h on h.org_id = s.org_id and h.id = s.hall_id
  where s.org_id = v_org and s.sale_id = x.id and y.status = 'closed'
  order by h.name collate "C" limit 1;
  if found then
    raise exception 'flock_closed' using hint = format('فوج «%s» مغلق، فلا تُلغى فاتورة بيع طيوره. أعد فتح الدورة أوّلاً.', r.name);
  end if;
  perform private.void_entry(x.invoice_entry_id, v_reason);
  if x.payment_entry_id is not null and not exists (select 1 from public.party_entries z where z.org_id = v_org and z.reverses_entry_id = x.payment_entry_id) then
    v_kept := x.paid_now;
  end if;
  for c in
    select z.* from public.flock_counts z
    where z.org_id = v_org and z.doc_kind = 'bird_sale' and z.doc_id = x.id and z.reverses_id is null
      and not exists (select 1 from public.flock_counts q where q.org_id = z.org_id and q.reverses_id = z.id)
    order by z.doc_line_id
  loop
    insert into public.flock_counts (org_id, flock_id, hall_id, site_id, division_id, on_date, kind, birds, net_kg, doc_kind, doc_id, doc_line_id, reverses_id)
    values (c.org_id, c.flock_id, c.hall_id, c.site_id, c.division_id, v_today, c.kind, -c.birds, -c.net_kg, c.doc_kind, c.doc_id, c.doc_line_id, c.id);
  end loop;
  update public.bird_sales set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason, version = version + 1
  where org_id = v_org and id = x.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', x.id, 'doc_no', x.doc_no, 'status', 'void', 'voided_on', v_today,
    'party_id', x.party_id, 'payment_entry_id', case when v_kept > 0 then x.payment_entry_id end,
    'money', jsonb_build_object('total', x.total::text, 'payment_kept', v_kept::text)));
end
$$;

-- «فرق العدّ» وحده للمدير (flock.manage، FOUNDATION ٥٧٥، D5): عدد بإشارته (زيادة حين يزيد العدد الفعليّ على ما في النظام، ونقص)، بسبب، بتاريخ المستند؛
-- بشرط الحيّ الذي رأته الشاشة، تحت قفل الفوج؛ والحيّ لا يصير سالباً في أيّ يوم. الإعادة بالمعرّف نفسه والمحتوى نفسه = نتيجته.
create or replace function public.record_flock_count_adjust(p_client_ref uuid, p_id uuid, p_flock uuid, p_on date, p_birds int, p_reason text,
  p_expected_live int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'record_flock_count_adjust';
  v_org uuid := public.auth_org();
  v_cached jsonb;
  v_reason text;
  x public.flock_counts;
  f public.flocks;
  h public.halls;
  v_live bigint;
  v_result jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('flock.manage');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'flock', p_flock, 'on', p_on, 'birds', p_birds, 'reason', p_reason,
    'live', p_expected_live));
  if v_cached is not null then
    return v_cached;
  end if;
  if p_id is null or p_flock is null then
    raise exception 'id_required' using hint = 'تعذّر الإرسال دون معرّف فرق العدّ والفوج. حدّث الشاشة وأعد المحاولة.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('flock_count:' || p_id::text, 0));
  select * into x from public.flock_counts y where y.id = p_id;
  if x.id is not null then
    if x.org_id = v_org and x.kind = 'count_adjust' and x.doc_kind = 'count_adjust' and x.flock_id = p_flock and x.on_date = p_on and x.birds = p_birds
        and x.reason is not distinct from btrim(coalesce(p_reason, '')) and x.created_by is not distinct from auth.uid() then
      select * into f from public.flocks y where y.org_id = v_org and y.id = x.flock_id;
      return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', x.id, 'flock_id', x.flock_id, 'on_date', x.on_date, 'birds', x.birds,
        'live_after', private.flock_live(f)));
    end if;
    raise exception 'id_conflict' using hint = 'سُجّل بهذا المعرّف غير الذي أرسلته الآن. حدّث الشاشة لترى ما سُجّل، ثمّ سجّل من جديد.';
  end if;
  if p_birds is null or p_birds = 0 or p_birds not between -10000000 and 10000000 then
    raise exception 'bad_birds' using hint = 'فرق العدّ عدد صحيح غير الصفر، لا يزيد مقداره على 10,000,000.';
  end if;
  v_reason := private.check_reason(p_reason);
  f := private.flock_for(p_flock, true);
  select * into h from public.halls y where y.org_id = v_org and y.id = f.hall_id;
  if p_on is null then
    raise exception 'date_required' using hint = 'اكتب التاريخ.';
  end if;
  perform private.period_guard();
  perform private.check_doc_date(p_on);
  if p_on < f.placed_on then
    raise exception 'before_placement' using hint = format('التاريخ %s قبل تسكين «%s» في %s.', to_char(p_on, 'DD/MM/YYYY'), h.name, to_char(f.placed_on, 'DD/MM/YYYY'));
  end if;
  select * into f from public.flocks y where y.org_id = v_org and y.id = p_flock for update;
  if f.status <> 'active' then
    raise exception 'flock_closed' using hint = format('فوج «%s» مغلق، فلا يُسجَّل له شيء.', h.name);
  end if;
  v_live := private.flock_live(f);
  if p_expected_live is distinct from v_live then
    raise exception 'live_changed' using hint = format('تغيّر عدد الطيور الحيّة منذ فتحت الشاشة: كان %s وصار %s. راجع الأرقام وأعد المحاولة.',
      coalesce(to_char(p_expected_live, 'FM999,999,999,990'), '—'), to_char(v_live, 'FM999,999,999,990'));
  end if;
  insert into public.flock_counts (id, org_id, flock_id, hall_id, site_id, division_id, on_date, kind, birds, doc_kind, doc_id, reason)
  values (p_id, v_org, f.id, f.hall_id, f.site_id, f.division_id, p_on, 'count_adjust', p_birds, 'count_adjust', p_id, v_reason);
  perform private.flock_live_check(f);
  v_result := jsonb_build_object('id', p_id, 'flock_id', f.id, 'on_date', p_on, 'birds', p_birds, 'live_after', private.flock_live(f));
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;

-- ─── و. إغلاق الدورة وإعادة فتحها والعلف المنقول (flock.manage: المدير والمالك) ──────────────────────────────────────────
-- نتيجة الإغلاق من صفوفه (العقد §5.6): أرقامه وسطوره بمصيرها ومخزنها ومستند إرجاعها وحالة نقلها، وقيمة كلّ سطر والكلفة والراجع والمنقول والإيراد داخل
-- money (يُقنَّع لغير أدوار الكلفة عند الإرجاع).
create or replace function private.flock_close_result(p_close uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', c.id, 'flock_id', c.flock_id, 'hall_id', c.hall_id, 'hall_name', h.name, 'status', c.status, 'closed_on', c.closed_on,
    'live_before', c.live_before, 'count_diff', c.count_diff, 'count_reason', c.count_reason, 'sold_birds', c.sold_birds,
    'sold_net_kg', c.sold_net_kg::text, 'note', c.note,
    'lines', coalesce((select jsonb_agg(jsonb_build_object('line_id', l.id, 'line_no', l.line_no, 'item_id', l.item_id, 'item_name', i.name,
        'action', l.action, 'qty', l.qty_base::text, 'base_unit', l.base_unit,
        'kg', private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)::text,
        'warehouse_id', coalesce(l.warehouse_id, r.warehouse_id), 'warehouse_name', w.name, 'return_id', r.id, 'return_doc_no', r.doc_no, 'carry_status', l.carry_status,
        'to_flock_id', l.to_flock_id, 'applied_on', l.applied_on,
        'money', jsonb_build_object('value', case
          when l.action = 'return' then (select (-z.amount)::text from public.flock_costs z where z.org_id = l.org_id and z.doc_kind = 'flock_return'
            and z.doc_id = r.id and z.reverses_id is null limit 1)
          when l.action = 'carry' then (select (-z.amount)::text from public.flock_costs z where z.org_id = l.org_id and z.doc_kind = 'flock_carry'
            and z.doc_id = c.id and z.doc_line_id = l.id and z.flock_id = c.flock_id and z.reverses_id is null limit 1)
        end)) order by l.line_no)
      from public.flock_close_lines l
      join public.items i on i.org_id = l.org_id and i.id = l.item_id
      left join public.flock_returns r on r.org_id = l.org_id and r.close_line_id = l.id
      left join public.warehouses w on w.org_id = l.org_id and w.id = coalesce(l.warehouse_id, r.warehouse_id)
      where l.org_id = c.org_id and l.close_id = c.id), '[]'::jsonb),
    'money', jsonb_build_object('cost_total', v.cost_total::text, 'returned_value', v.returned_value::text, 'carried_value', v.carried_value::text,
      'revenue', v.revenue::text))
  from public.flock_closes c
  join public.halls h on h.org_id = c.org_id and h.id = c.hall_id
  left join public.flock_close_values v on v.org_id = c.org_id and v.close_id = c.id
  where c.org_id = public.auth_org() and c.id = p_close
$$;

-- «أغلق الدورة» (العقد §4.7): يوم الإغلاق بقاعدة المستند (يوم البيع حتى 7 أيّام مضت)، والمباع من الفواتير المرحَّلة، وفرق العدّ = −الحيّ بسبب إلزاميّ؛
-- ولكلّ مادّة باقية مصير واحد: يرجع إلى مخزن جاء منه (FR بدفعة جديدة، وقيمته من معدّل المادّة في القاعة، القاعدة ١٦: الكلّ = القيمة كلّها بالضبط)، أو
-- يُحسب مستهلَكاً (يبقى في كلفة الفوج)، أو ينتقل للدورة التالية (كلفته تخرج من الفوج وتبقى معلَّقة على القاعة). الشاشة ترسل ما رأته (الحيّ والمباع
-- وما نزل لكلّ مادّة) ويُقارن تحت قفل الفوج (D8)، وp_expected_plan بصمة ما نزل كما رآه النموذج (كميةً وقيمةً، flock_pool_plan؛ مراجعة 0028 M4).
-- الأقفال: المرجع ← المعرّف ← قفل الفترة وصفوف الوحدات (الفوج ومخازن الإرجاع بترتيب المعرّف) ← القاعة للمشاركة ← الفوج ← مخازن الإرجاع وموادّها
-- ← الأرصدة ← عدّاد FR آخر شيء.
create or replace function public.close_flock(p_client_ref uuid, p_close_id uuid, p_flock uuid, p_on date, p_expected_live int, p_expected_sold int,
  p_expected_pools jsonb, p_count_reason text, p_lines jsonb, p_note text, p_expected_plan text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'close_flock';
  v_org uuid := public.auth_org();
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_qty constant text := '^[0-9]{1,12}([.][0-9]{1,3})?$';
  v_cached jsonb;
  v_reason text := nullif(btrim(coalesce(p_count_reason, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_lines jsonb := coalesce(p_lines, '[]'::jsonb);
  v_pools jsonb := coalesce(p_expected_pools, '[]'::jsonb);
  a jsonb;
  v_n int;
  v_items uuid[] := '{}';
  v_rstores uuid[] := '{}';
  v_ritems uuid[] := '{}';
  v_div uuid;
  x public.flock_closes;
  f public.flocks;
  h public.halls;
  i public.items;
  w public.warehouses;
  p record;
  q record;
  v_live bigint;
  v_sold bigint;
  v_sold_kg numeric;
  v_act record;
  v_pending text;
  v_value numeric;
  v_line uuid;
  v_returned numeric := 0;
  v_carried numeric := 0;
  v_result jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('flock.manage');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('close', p_close_id, 'flock', p_flock, 'on', p_on, 'live', p_expected_live,
    'sold', p_expected_sold, 'pools', p_expected_pools, 'reason', p_count_reason, 'lines', p_lines, 'note', p_note, 'plan', p_expected_plan));
  if v_cached is not null then
    if exists (select 1 from public.flock_closes y where y.org_id = v_org and y.id = p_close_id and y.status = 'reopened') then
      raise exception 'id_conflict' using hint = 'أُغلقت هذه الدورة بهذا الطلب ثمّ أُعيد فتحها. أغلقها من جديد من صفحة الفوج.';
    end if;
    return v_cached;
  end if;
  if p_close_id is null or p_flock is null then
    raise exception 'id_required' using hint = 'تعذّر الإرسال دون معرّفي الإغلاق والفوج. حدّث الشاشة وأعد المحاولة.';
  end if;

  -- الإعادة بالمعرّف (جواب ضاع): الإغلاق القائم نفسه للفوج نفسه ويومه وسبب فرق عدّه (إن كُتب فرق) وملاحظته وسطوره ومن الكاتب نفسه = نتيجته؛
  -- وغيره تعارض (سبب آخر لا يُقال عنه «حُفظ» والمحفوظ غيره).
  perform pg_advisory_xact_lock(hashtextextended('flock_close:' || p_close_id::text, 0));
  select * into x from public.flock_closes y where y.id = p_close_id;
  if x.id is not null then
    if x.org_id = v_org and x.status = 'closed' and x.flock_id = p_flock and x.closed_on = p_on and x.closed_by is not distinct from auth.uid()
        and x.note is not distinct from v_note and x.count_reason is not distinct from (case when x.count_diff <> 0 then v_reason end)
        and (select coalesce(jsonb_agg(jsonb_build_object('item_id', l.item_id, 'qty', l.qty_base, 'action', l.action, 'warehouse_id', l.warehouse_id)
              order by l.line_no), '[]'::jsonb) from public.flock_close_lines l where l.org_id = x.org_id and l.close_id = x.id)
          = (select coalesce(jsonb_agg(jsonb_build_object('item_id', (e.x ->> 'item_id')::uuid, 'qty', round((e.x ->> 'qty')::numeric, 3),
              'action', e.x ->> 'action', 'warehouse_id', case when e.x ->> 'action' = 'return' then (e.x ->> 'warehouse_id')::uuid end) order by e.n), '[]'::jsonb)
             from jsonb_array_elements(case when jsonb_typeof(v_lines) = 'array' then v_lines else '[]'::jsonb end) with ordinality as e(x, n)) then
      v_result := private.flock_close_result(x.id);
      return private.ref_store(v_fn, p_client_ref, v_result);
    end if;
    raise exception 'id_conflict' using hint = case
      when x.org_id = v_org and x.status = 'reopened' then 'أُغلقت هذه الدورة بهذا الطلب ثمّ أُعيد فتحها. أغلقها من جديد من صفحة الفوج.'
      else 'سُجّل بهذا المعرّف إغلاق غير الذي أرسلته الآن. حدّث الشاشة لترى ما سُجّل.'
    end;
  end if;

  -- ١) المدخلات: اليوم، والسبب والملاحظة، وشكل السطور (مادّة ومصير وكمية نصّاً بثلاث مراتب، والمخزن لسطر الإرجاع وحده)، وما رأته الشاشة.
  if p_on is null then
    raise exception 'date_required' using hint = 'اكتب يوم الإغلاق.';
  end if;
  perform private.check_doc_date(p_on);
  if v_reason is not null and length(v_reason) > 500 then
    raise exception 'bad_reason' using hint = format('السبب %s حرفاً، والحدّ 500 حرف. اختصره.', length(v_reason));
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'bad_note' using hint = format('الملاحظة %s حرفاً، والحدّ 500 حرف. اختصرها.', length(v_note));
  end if;
  if jsonb_typeof(v_lines) <> 'array' or jsonb_typeof(v_pools) <> 'array' then
    raise exception 'bad_lines' using hint = 'سطور الباقي غير صالحة. حدّث الشاشة وأعد المحاولة.';
  end if;
  if jsonb_array_length(v_lines) > 100 then
    raise exception 'too_many_lines' using hint = 'الباقي حتى 100 مادّة في المرّة.';
  end if;
  for a in select e.x from jsonb_array_elements(v_pools) as e(x) loop
    if jsonb_typeof(a) <> 'object' or coalesce(a ->> 'item_id', '') !~ v_uuid or jsonb_typeof(a -> 'qty') is distinct from 'string' or (a ->> 'qty') !~ v_qty then
      raise exception 'bad_lines' using hint = 'سطور الباقي غير صالحة. حدّث الشاشة وأعد المحاولة.';
    end if;
  end loop;
  for a in select e.x from jsonb_array_elements(v_lines) as e(x) loop
    if jsonb_typeof(a) <> 'object' or coalesce(a ->> 'item_id', '') !~ v_uuid or jsonb_typeof(a -> 'qty') is distinct from 'string' or (a ->> 'qty') !~ v_qty
        or not (coalesce(jsonb_typeof(a -> 'warehouse_id'), 'null') = 'null' or (a ->> 'warehouse_id') ~ v_uuid) then
      raise exception 'bad_lines' using hint = 'سطور الباقي غير صالحة. حدّث الشاشة وأعد المحاولة.';
    end if;
    select * into i from public.items y where y.org_id = v_org and y.id = (a ->> 'item_id')::uuid;
    if i.id is null then
      raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة.';
    end if;
    if coalesce(a ->> 'action', '') not in ('return', 'consumed', 'carry') then
      raise exception 'bad_action' using hint = 'اختر لكلّ مادّة باقية: يرجع إلى مخزن، أو يُحسب مستهلَكاً، أو ينتقل للدورة التالية.';
    end if;
    if (a ->> 'qty')::numeric <= 0 then
      raise exception 'qty_not_positive' using hint = format('اكتب كمية «%s» الباقية أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.', i.name);
    end if;
    if i.base_unit = 'pc' and (a ->> 'qty')::numeric <> trunc((a ->> 'qty')::numeric) then
      raise exception 'pieces_not_whole' using hint = format('«%s» تُعدّ بالقطعة؛ اكتب عدداً صحيحاً من القطع.', i.name);
    end if;
    if i.id = any (v_items) then
      raise exception 'duplicate_line' using hint = format('«%s» مكرّرة. لكلّ مادّة مصير واحد.', i.name);
    end if;
    v_items := v_items || i.id;
    if a ->> 'action' = 'return' then
      if coalesce(jsonb_typeof(a -> 'warehouse_id'), 'null') = 'null' then
        raise exception 'store_required' using hint = format('اختر المخزن الذي يرجع إليه «%s».', i.name);
      end if;
      w := private.stock_wh((a ->> 'warehouse_id')::uuid, true);
      if not private.item_admissible(w.kind, i.kind) then
        raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s». اختر مخزناً جاء منه.', i.name, w.name);
      end if;
      v_rstores := v_rstores || w.id;
      v_ritems := v_ritems || i.id;
    elsif coalesce(jsonb_typeof(a -> 'warehouse_id'), 'null') <> 'null' then
      raise exception 'store_not_allowed' using hint = 'المخزن لسطر الإرجاع وحده.';
    end if;
  end loop;

  -- ٢) الفوج: موجود وبنطاق الكاتب وقائم، ولحم (البيّاض لاحقاً)، واليوم لا يسبق تسكينه.
  f := private.flock_for(p_flock, true);
  select * into h from public.halls y where y.org_id = v_org and y.id = f.hall_id;
  if f.kind <> 'broiler' then
    raise exception 'close_layer_later' using hint = 'إغلاق دورة البيّاض يأتي مع بيع الدجاج المستبعد.';
  end if;
  if p_on < f.placed_on then
    raise exception 'before_placement' using hint = format('التاريخ %s قبل تسكين «%s» في %s.', to_char(p_on, 'DD/MM/YYYY'), h.name, to_char(f.placed_on, 'DD/MM/YYYY'));
  end if;

  -- ٣) الأقفال بترتيبها، وكلّ فحص بعد قفله.
  for v_div in select d from unnest(array[f.division_id] || array(select w2.division_id from public.warehouses w2 where w2.org_id = v_org and w2.id = any (v_rstores)))
      as d group by d order by d loop
    perform private.check_post_date(p_on, v_div);
  end loop;
  perform 1 from public.halls y where y.org_id = v_org and y.id = f.hall_id for share;
  select * into f from public.flocks y where y.org_id = v_org and y.id = p_flock for update;
  if f.status = 'closed' then
    raise exception 'flock_closed' using hint = format('الدورة مغلقة من قبل يوم %s.', to_char(f.closed_on, 'DD/MM/YYYY'));
  end if;
  if f.status <> 'active' then
    raise exception 'flock_not_placed' using hint = format('فوج «%s» لم يُسكَّن بعد، فلا تُغلق دورته.', h.name);
  end if;
  perform private.lock_masters(v_rstores, v_ritems, true);
  perform private.lock_balances(v_ritems, v_rstores);

  -- ٤) تحت قفل الفوج: لا نشاط بعد يوم الإغلاق، ولا تذكرة بلا فاتورة، والحيّ والمباع وما نزل كما رأته الشاشة، وكلّ سطر من ممّا نزل.
  select * into v_act from private.flock_activity_after(f, p_on);
  if v_act.what is not null then
    raise exception 'activity_after_close' using hint = format('سُجّل على الفوج %s يوم %s، بعد يوم الإغلاق %s. اختر يوم الإغلاق في آخر يوم سُجّل فيه شيء أو بعده.',
      v_act.what, to_char(v_act.on_date, 'DD/MM/YYYY'), to_char(p_on, 'DD/MM/YYYY'));
  end if;
  select string_agg(coalesce(t.ticket_no, format('مسوّدة %s', to_char(t.on_date, 'DD/MM/YYYY'))), '، ' order by t.on_date, t.ticket_no collate "C", t.id)
  into v_pending
  from public.weigh_tickets t
  where t.org_id = v_org and t.status <> 'void'
    and exists (select 1 from public.weigh_ticket_stops s where s.org_id = t.org_id and s.ticket_id = t.id and s.flock_id = f.id)
    and not exists (select 1 from public.bird_sales b where b.org_id = t.org_id and b.ticket_id = t.id and b.status = 'posted');
  if v_pending is not null then
    raise exception 'tickets_pending' using hint = format('تذاكر وزن بلا فاتورة لهذه القاعة: %s. تُصدر فواتيرها أو تُلغى قبل إغلاق الدورة.', v_pending);
  end if;
  v_live := private.flock_live(f);
  if p_expected_live is distinct from v_live then
    raise exception 'live_changed' using hint = format('تغيّر عدد الطيور الحيّة منذ فتحت الشاشة: كان %s وصار %s. راجع الأرقام وأعد المحاولة.',
      coalesce(to_char(p_expected_live, 'FM999,999,999,990'), '—'), to_char(v_live, 'FM999,999,999,990'));
  end if;
  select coalesce(sum(d.sold), 0), coalesce(sum(d.sold_kg), 0) into v_sold, v_sold_kg from private.flock_count_days(f.id) as d;
  if p_expected_sold is distinct from v_sold then
    raise exception 'sales_changed' using hint = format('تغيّر المباع منذ فتحت الشاشة: كان %s طيراً وصار %s. راجع الفواتير وأعد الإغلاق.',
      coalesce(to_char(p_expected_sold, 'FM999,999,999,990'), '—'), to_char(v_sold, 'FM999,999,999,990'));
  end if;
  if v_live > 0 and v_reason is null then
    raise exception 'count_reason_required' using hint = format('في القاعة بحسب النظام %s طيراً لم تُبَع ولم تُسجَّل نافقة. اكتب سبب «فرق العدّ» ليُكتب مع الإغلاق.',
      to_char(v_live, 'FM999,999,999,990'));
  end if;
  -- ما نزل لكلّ مادّة كما رأته الشاشة: لا مادّة ناقصة ولا زائدة ولا كمية غيرها.
  select coalesce(n.item_id, o.item_id) as item_id, o.qty as was, n.qty as cur into q
  from private.flock_item_pool(f.id) as n
  full join (select (e.x ->> 'item_id')::uuid as item_id, round((e.x ->> 'qty')::numeric, 3) as qty from jsonb_array_elements(v_pools) as e(x)) as o
    on o.item_id = n.item_id
  where o.item_id is null or n.item_id is null or o.qty <> n.qty
  order by 1 limit 1;
  if q.item_id is not null then
    select * into i from public.items y where y.org_id = v_org and y.id = q.item_id;
    raise exception 'pool_changed' using hint = format('تغيّر ما نزل للقاعة منذ فتحت الشاشة («%s»: كان %s وصار %s). حدّث الشاشة وراجع الباقي.', coalesce(i.name, ''),
      case when q.was is null then '—' else private.qty_text(q.was, i.base_unit) end, case when q.cur is null then '—' else private.qty_text(q.cur, i.base_unit) end);
  end if;
  -- مراجعة 0028 M4: والقيمة كما رآها النموذج (البصمة): صرف أُلغي وأُعيد بكميته من مخزن آخر يغيّر قيمة الباقي والكمية كما هي. بلا بصمة لا إغلاق.
  if p_expected_plan is null or p_expected_plan is distinct from private.flock_pool_plan(f.id) then
    raise exception 'pool_changed' using hint = 'تغيّر ما نزل للقاعة أو قيمته منذ فتحت الشاشة (صرف أو إلغاء أو إرجاع). حدّث الشاشة وراجع الباقي.';
  end if;
  for a in select e.x from jsonb_array_elements(v_lines) as e(x) loop
    select * into i from public.items y where y.org_id = v_org and y.id = (a ->> 'item_id')::uuid;
    select * into p from private.flock_item_pool(f.id) as z where z.item_id = i.id;
    if p.item_id is null then
      raise exception 'not_in_pool' using hint = format('لم يُصرف «%s» لهذه القاعة في هذه الدورة.', i.name);
    end if;
    if p.units_count > 1 or p.base_unit <> i.base_unit then
      raise exception 'pool_unit_mixed' using hint = format('وحدة «%s» تغيّرت بين ما نزل للقاعة، فلا يُحسب باقيها. راجع المادّة.', i.name);
    end if;
    if (a ->> 'qty')::numeric > p.qty then
      raise exception 'over_pool' using hint = format('الباقي المكتوب من «%s» (%s) أكثر ممّا نزل للقاعة (%s).', i.name,
        private.qty_text((a ->> 'qty')::numeric, i.base_unit), private.qty_text(p.qty, i.base_unit));
    end if;
    if a ->> 'action' = 'return' and not exists (select 1 from private.flock_item_lots(f.id, i.id) as z where z.warehouse_id = (a ->> 'warehouse_id')::uuid) then
      select * into w from public.warehouses y where y.org_id = v_org and y.id = (a ->> 'warehouse_id')::uuid;
      raise exception 'not_from_store' using hint = format('«%s» لم يأتِ إلى هذه القاعة من «%s». اختر مخزناً جاء منه: %s.', i.name, w.name,
        (select string_agg(format('«%s»', y.name), '، ' order by y.name collate "C", y.id) from public.warehouses y
          where y.org_id = v_org and y.id in (select z.warehouse_id from private.flock_item_lots(f.id, i.id) as z)));
    end if;
  end loop;

  -- ٥) الكتابة: الفوج مغلق، ثمّ الإغلاق، وفرق العدّ إن بقي حيّ، والسطور بلقطاتها (D10)، والإرجاع والنقل بقيمتهما (القاعدة ١٦)، ثمّ لقطة المال.
  update public.flocks set status = 'closed', closed_on = p_on, close_note = v_note, version = version + 1 where org_id = v_org and id = f.id;
  insert into public.flock_closes (id, org_id, flock_id, hall_id, site_id, division_id, closed_on, live_before, count_diff, count_reason, sold_birds,
    sold_net_kg, note, status, client_ref, closed_at, closed_by)
  values (p_close_id, v_org, f.id, f.hall_id, f.site_id, f.division_id, p_on, v_live, -v_live, case when v_live > 0 then v_reason end, v_sold,
    v_sold_kg, v_note, 'closed', p_client_ref, now(), auth.uid());
  if v_live > 0 then
    insert into public.flock_counts (org_id, flock_id, hall_id, site_id, division_id, on_date, kind, birds, doc_kind, doc_id, reason)
    values (v_org, f.id, f.hall_id, f.site_id, f.division_id, p_on, 'count_adjust', -v_live, 'flock_close', p_close_id, v_reason);
  end if;
  for a, v_n in select e.x, e.n::int from jsonb_array_elements(v_lines) with ordinality as e(x, n) loop
    select * into i from public.items y where y.org_id = v_org and y.id = (a ->> 'item_id')::uuid;
    select * into p from private.flock_item_pool(f.id) as z where z.item_id = i.id;
    v_line := private.derived_ref(p_close_id, v_n);
    insert into public.flock_close_lines (id, org_id, close_id, flock_id, hall_id, site_id, division_id, line_no, item_id, action, qty_base, base_unit,
      density_kg_per_l, piece_mass_kg, cost_kind, warehouse_id, carry_status)
    values (v_line, v_org, p_close_id, f.id, f.hall_id, f.site_id, f.division_id, v_n, i.id, a ->> 'action', (a ->> 'qty')::numeric, p.base_unit,
      case when p.base_unit = 'L' then p.density end, case when p.base_unit = 'pc' then p.piece_mass end, private.flock_cost_kind(i.kind),
      case when a ->> 'action' = 'return' then (a ->> 'warehouse_id')::uuid end, case when a ->> 'action' = 'carry' then 'pending' end);
    if a ->> 'action' in ('return', 'carry') then
      v_value := case when (a ->> 'qty')::numeric = p.qty then p.value else private._mul_div_round2((a ->> 'qty')::numeric, p.value, p.qty) end;
      if a ->> 'action' = 'return' then
        perform private.flock_return_post(private.derived_ref(p_close_id, 100 + v_n), f, (a ->> 'warehouse_id')::uuid, i.id, (a ->> 'qty')::numeric, v_value,
          p_on, 'close', p_close_id, v_line, p.base_unit, case when p.base_unit = 'L' then p.density end, case when p.base_unit = 'pc' then p.piece_mass end,
          private.flock_cost_kind(i.kind), p_client_ref);
        v_returned := v_returned + v_value;
      else
        insert into public.flock_costs (org_id, flock_id, site_id, kind, amount, doc_kind, doc_id, doc_line_id, on_date)
        values (v_org, f.id, f.site_id, private.flock_cost_kind(i.kind), -v_value, 'flock_carry', p_close_id, v_line, p_on);
        v_carried := v_carried + v_value;
      end if;
    end if;
  end loop;
  insert into public.flock_close_values (org_id, close_id, flock_id, site_id, cost_total, returned_value, carried_value, revenue)
  values (v_org, p_close_id, f.id, f.site_id,
    (select coalesce(sum(c.amount), 0) from public.flock_costs c where c.org_id = v_org and c.flock_id = f.id), v_returned, v_carried,
    (select coalesce(sum(s.revenue), 0) from public.bird_sale_sources s join public.bird_sales b on b.org_id = s.org_id and b.id = s.sale_id
      where s.org_id = v_org and s.flock_id = f.id and b.status = 'posted'));
  for v_div in select d from unnest(array[f.division_id] || array(select w2.division_id from public.warehouses w2 where w2.org_id = v_org and w2.id = any (v_rstores)))
      as d group by d order by d loop
    perform private.mark_division_posted(v_div);
  end loop;
  perform private.flock_live_check(f);
  v_result := private.flock_close_result(p_close_id);
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;

-- «أعد فتح الدورة» (العقد §4.8، flock.manage والإلغاء معاً، بسبب؛ O5): ما دام لم يُسكَّن في القاعة فوج بعدها ولم يُطبَّق نقلها، ولم يُسحب من دفعات
-- إرجاعها، والقاعة غير مؤرشفة. والنقل الذي أُرجع إلى مخزن قبل التسكين يُعامل كإرجاع الإغلاق نفسه (مراجعة 0028 O1): مستنده FR يُلغى وحركته تنعكس على
-- دفعته (ما لم يُسحب منها) وصفّ كلفته يُعكس، فيعود العلف إلى حساب القاعة. ومخزن كلّ FR بنطاق الكاتب كإلغاء الصرف (مراجعة 0028 C1/M1). يُكتب بيوم
-- اليوم: حركات الإرجاع تنعكس على دفعاتها (وحرّاس apply_move: الجرد المعتمد بعدها)، ومستندات FR ملغاة، وصفوف كلفة الإرجاع والنقل معكوسة، وسطور النقل
-- ملغاة، وفرق العدّ معكوس؛ والفوج قائم بلا يوم إغلاق، والفواتير كما هي. الأقفال: المرجع ← قفل الفترة ← القاعة ← الفوج ← الإغلاق ← مخازن الإرجاع
-- وموادّها ← الأرصدة ← دفعات الإرجاع.
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
  select * into h from public.halls y where y.org_id = v_org and y.id = x.hall_id for update;
  perform 1 from public.flocks y where y.org_id = v_org and y.id = x.flock_id for update;
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

-- «أرجعه إلى مخزن» للعلف المنقول المعلَّق (العقد §4.9): قبل أن يُسكَّن فوج القاعة التالي، إلى مخزن جاء منه، بقيمته المنقولة؛ على الفوج المغلق: عكس صفّ
-- النقل (+القيمة) وصفّ إرجاع (−القيمة) فكلفته كما هي، ودفعة جديدة بأصغر ترتيب وأقرب انتهاء لدفعاته. الأقفال: المرجع ← المعرّف ← قفل الفترة وصفّ وحدة
-- المخزن ← القاعة (مع open_flock) ← السطر ← المخزن والمادّة ← الرصيد ← عدّاد FR آخر شيء.
create or replace function public.return_hall_carry(p_client_ref uuid, p_return_id uuid, p_line uuid, p_warehouse uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'return_hall_carry';
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_cached jsonb;
  y public.flock_returns;
  l public.flock_close_lines;
  c public.flock_closes;
  f public.flocks;
  i public.items;
  w public.warehouses;
  k public.flock_costs;
  v_result jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('flock.manage');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('return', p_return_id, 'line', p_line, 'warehouse', p_warehouse));
  if v_cached is not null then
    return v_cached;
  end if;
  if p_return_id is null or p_line is null then
    raise exception 'id_required' using hint = 'تعذّر الإرسال دون معرّفي الإرجاع والسطر. حدّث الشاشة وأعد المحاولة.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('flock_return:' || p_return_id::text, 0));
  select * into y from public.flock_returns z where z.id = p_return_id;
  if y.id is not null then
    if y.org_id = v_org and y.source = 'carry' and y.close_line_id = p_line and y.warehouse_id = p_warehouse and y.posted_by is not distinct from auth.uid() then
      return private.ref_store(v_fn, p_client_ref, jsonb_build_object('return_id', y.id, 'doc_no', y.doc_no, 'line_id', p_line,
        'money', jsonb_build_object('value', (select (-z.amount)::text from public.flock_costs z where z.org_id = y.org_id and z.doc_kind = 'flock_return'
          and z.doc_id = y.id and z.reverses_id is null limit 1))));
    end if;
    raise exception 'id_conflict' using hint = 'سُجّل بهذا المعرّف إرجاع غير الذي أرسلته الآن. حدّث الشاشة لترى ما سُجّل.';
  end if;
  select * into l from public.flock_close_lines z where z.org_id = v_org and z.id = p_line;
  select * into c from public.flock_closes z where z.org_id = v_org and z.id = l.close_id;
  if l.id is null or l.action <> 'carry' or c.status is distinct from 'closed' then
    raise exception 'carry_not_found' using hint = 'هذا العلف المنقول غير موجود. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(l.site_id) then
    raise exception 'out_of_scope' using hint = 'قاعة هذا العلف خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  select * into i from public.items z where z.org_id = v_org and z.id = l.item_id;
  if p_warehouse is null then
    raise exception 'store_required' using hint = format('اختر المخزن الذي يرجع إليه «%s».', i.name);
  end if;
  w := private.stock_wh(p_warehouse, true);
  if not private.item_admissible(w.kind, i.kind) then
    raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s». اختر مخزناً جاء منه.', i.name, w.name);
  end if;
  perform private.check_post_date(v_today, w.division_id);
  perform 1 from public.halls z where z.org_id = v_org and z.id = l.hall_id for update;
  select * into l from public.flock_close_lines z where z.org_id = v_org and z.id = p_line for update;
  if l.carry_status <> 'pending' then
    raise exception 'carry_not_pending' using hint = format('العلف المنقول «%s» %s.', i.name, case
      when l.carry_status = 'applied' then format('نُقل إلى الفوج الجديد يوم %s', to_char(l.applied_on, 'DD/MM/YYYY'))
      when l.carry_status = 'returned' then 'أُرجع إلى مخزن من قبل'
      else 'أُلغي بإعادة فتح الدورة' end);
  end if;
  perform private.lock_masters(array[w.id], array[i.id], true);
  perform private.lock_balances(array[i.id], array[w.id]);
  select * into f from public.flocks z where z.org_id = v_org and z.id = c.flock_id;
  if not exists (select 1 from private.flock_item_lots(f.id, i.id) as z where z.warehouse_id = w.id) then
    raise exception 'not_from_store' using hint = format('«%s» لم يأتِ إلى هذه القاعة من «%s». اختر مخزناً جاء منه: %s.', i.name, w.name,
      (select string_agg(format('«%s»', z.name), '، ' order by z.name collate "C", z.id) from public.warehouses z
        where z.org_id = v_org and z.id in (select q.warehouse_id from private.flock_item_lots(f.id, i.id) as q)));
  end if;
  select * into k from public.flock_costs z where z.org_id = v_org and z.doc_kind = 'flock_carry' and z.doc_id = c.id and z.doc_line_id = l.id
    and z.flock_id = f.id and z.reverses_id is null;
  insert into public.flock_costs (org_id, flock_id, site_id, kind, amount, doc_kind, doc_id, doc_line_id, on_date, reverses_id)
  values (k.org_id, k.flock_id, k.site_id, k.kind, -k.amount, k.doc_kind, k.doc_id, k.doc_line_id, v_today, k.id);
  perform private.flock_return_post(p_return_id, f, w.id, i.id, l.qty_base, -k.amount, v_today, 'carry', c.id, l.id, l.base_unit, l.density_kg_per_l,
    l.piece_mass_kg, l.cost_kind, p_client_ref);
  update public.flock_close_lines set carry_status = 'returned' where org_id = v_org and id = l.id;
  perform private.mark_division_posted(w.division_id);
  select * into y from public.flock_returns z where z.org_id = v_org and z.id = p_return_id;
  v_result := jsonb_build_object('return_id', y.id, 'doc_no', y.doc_no, 'line_id', l.id, 'money', jsonb_build_object('value', (-k.amount)::text));
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;

-- ─── و٢. الكتّاب القائمون (من أجسامهم الأخيرة) ─────────────────────────────────────────────────────────────────────

-- التسكين: لا تسكين في يوم إغلاق آخر دورة في القاعة أو قبله، والعلف المنقول المعلَّق يدخل الفوج الجديد بيوم تسكينه (carried_in) (الجسم الأخير من 0012، ومعه 0028).
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
  v_last date;
  c record;
  v_amount numeric;
  v_carried jsonb := '[]'::jsonb;
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
  select d.kind into v_kind from public.divisions d where d.org_id = h.org_id and d.id = h.division_id;
  insert into public.flocks (org_id, hall_id, site_id, division_id, kind, breed, opened_on, placed_on, placed_count, age_days_at_placement, chick_source, status)
  values (h.org_id, h.id, h.site_id, h.division_id, v_kind, v_breed, p_placed_on, p_placed_on, p_placed_count, coalesce(p_age_days, 0), 'opening', 'active')
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
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('flock_id', v_id, 'version', 1, 'carried_in', v_carried));
end
$$;

-- الجولة اليومية: الحيّ بالمباع وفرق العدّ، والبيض بحيّ أوّل اليوم بهما، والحيّ لا يصير سالباً في أيّ يوم (الجسم الأخير من 0012، ومعه 0028).
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
  -- 0028: الحيّ لا يصير سالباً في أيّ يوم (المباع وفرق العدّ بتاريخهما)، والرفض لا يُبقي شيئاً.
  perform private.flock_live_check(f);
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'version', n.version));
end
$$;

-- حذف تسجيل الدواء: صفّ الفوج للمشاركة قبل فحص حالته (الجسم الأخير من 0026، ومعه 0028).
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
  -- 0028: صفّ الفوج للمشاركة قبل فحص حالته (إغلاق الدورة بنفس اللحظة ينتظر أو يُرى).
  perform 1 from public.flocks y where y.org_id = v_org and y.id = l.flock_id for share;
  perform private.flock_for(l.flock_id, true);
  delete from public.flock_logs x where x.org_id = v_org and x.id = l.id;
  return jsonb_build_object('id', l.id, 'removed', true);
end
$$;

-- التراجع عن التأشير غير المربوط: صفّ الفوج للمشاركة قبل فحص حالته (الجسم الأخير من 0026، ومعه 0028).
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
  -- 0028: غير المربوط يقفل صفّ الفوج للمشاركة قبل فحص حالته (إغلاق الدورة بنفس اللحظة ينتظر أو يُرى)؛ والمربوط يقفله بعد قفل صرفه بترتيب void_flock_issue.
  if m.issue_id is null or m.status <> 'done' then
    perform 1 from public.flocks y where y.org_id = v_org and y.id = m.flock_id for share;
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

-- القاعة: لا تُؤرشف وفيها علف منقول معلَّق (الجسم الأخير من 0012، ومعه 0028).
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
  -- 0028: ولا وفيها علف منقول معلَّق للدورة التالية (يُرجَع إلى مخزن أوّلاً).
  if tg_op = 'UPDATE' and new.archived_at is not null and old.archived_at is null
     and exists (select 1 from public.flock_close_lines l join public.flock_closes c on c.org_id = l.org_id and c.id = l.close_id
       where l.org_id = new.org_id and l.hall_id = new.id and l.carry_status = 'pending' and c.status = 'closed') then
    raise exception 'hall_has_carry' using hint = format('في القاعة «%s» علف منقول للدورة التالية، فلا تُؤرشف قبل أن يُرجَع إلى مخزن.', btrim(new.name));
  end if;
  return new;
end
$$;

-- ─── ز. القرّاء الجديدة (read، بنطاق الحقل؛ بلا مال إلّا ما يُذكر) ──────────────────────────────────────────────────────────
-- التذكرة (العقد §5.1).
create or replace function public.weigh_ticket(p_ticket uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  t public.weigh_tickets;
begin
  perform private.require('read');
  select * into t from public.weigh_tickets x where x.org_id = public.auth_org() and x.id = p_ticket;
  if t.id is null then
    raise exception 'ticket_not_found' using hint = 'هذه التذكرة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(t.site_id) then
    raise exception 'out_of_scope' using hint = 'حقل هذه التذكرة خارج نطاقك.';
  end if;
  return private.weigh_ticket_json(t.id);
end
$$;

-- ما تحتاجه شاشة التذكرة (العقد §5.2): بلا حقل قائمة حقول اللحم في النطاق بعدد قاعاتها بفوج قائم؛ وبحقل: اليوم وأقدم يوم مسموح، وآخر وزن قفص في
-- تذكرة مكتملة، وقاعاته بفوجها القائم (عمره وحيّه وما على التذاكر بلا فاتورة)، وهل يكتب القارئ تذكرة.
create or replace function public.weigh_ticket_options(p_site uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_lock date;
  s public.sites;
  v_kind text;
begin
  perform private.require('read');
  if p_site is null then
    return jsonb_build_object('today', v_today, 'can_create', public.can('weigh_ticket.draft'),
      'sites', coalesce((select jsonb_agg(jsonb_build_object('site_id', x.id, 'name', x.name,
          'halls_with_flock', (select count(*)::int from public.halls h join public.flocks f on f.org_id = h.org_id and f.hall_id = h.id and f.status = 'active'
            where h.org_id = x.org_id and h.site_id = x.id and h.archived_at is null)) order by x.name collate "C", x.id)
        from public.sites x join public.divisions d on d.org_id = x.org_id and d.id = x.division_id
        where x.org_id = v_org and x.kind = 'farm' and d.kind = 'broiler' and x.archived_at is null and public.in_scope_site(x.id)), '[]'::jsonb));
  end if;
  select * into s from public.sites x where x.org_id = v_org and x.id = p_site;
  if s.id is null then
    raise exception 'site_not_found' using hint = 'هذا الحقل غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(s.id) then
    raise exception 'out_of_scope' using hint = 'هذا الحقل خارج نطاقك.';
  end if;
  select d.kind into v_kind from public.divisions d where d.org_id = s.org_id and d.id = s.division_id;
  if s.kind <> 'farm' or v_kind is distinct from 'broiler' then
    raise exception 'site_not_broiler' using hint = 'تذكرة الوزن لحقول اللحم في هذه النسخة؛ بيع الدجاج المستبعد يأتي لاحقاً.';
  end if;
  select l.locked_through into v_lock from public.period_locks l where l.org_id = v_org;
  return jsonb_build_object(
    'site', jsonb_build_object('site_id', s.id, 'name', s.name, 'division_id', s.division_id, 'archived', s.archived_at is not null),
    'today', v_today,
    'earliest_on', greatest(v_today - 7, v_lock + 1),
    'last_crate_kg', (select t.crate_kg::text from public.weigh_tickets t where t.org_id = v_org and t.status = 'done' and t.crate_kg is not null
      order by t.finished_at desc, t.id limit 1),
    'halls', coalesce((select jsonb_agg(jsonb_build_object('hall_id', h.id, 'name', h.name,
        'flock', case when f.id is not null then jsonb_build_object('id', f.id, 'placed_on', f.placed_on,
          'age', v_today - f.placed_on + f.age_days_at_placement, 'live', private.flock_live(f), 'ticketed', private.flock_ticketed(f.id, null)) end)
        order by h.name collate "C", h.id)
      from public.halls h
      left join public.flocks f on f.org_id = h.org_id and f.hall_id = h.id and f.status = 'active' and f.kind = 'broiler'
      where h.org_id = v_org and h.site_id = s.id and h.archived_at is null), '[]'::jsonb),
    'can_create', public.can('weigh_ticket.draft') and s.archived_at is null);
end
$$;

-- تذاكر الوزن بالفترة والحالة (العقد §5.3): بلا تاريخين = بلا حدّ؛ والأحدث أوّلاً بحدّ 500؛ والمجاميع لغير الملغاة؛ و«بانتظار الفاتورة» = مكتملة بلا
-- فاتورة مرحَّلة. الفاتورة لأدوار المبيعات.
create or replace function public.weigh_tickets(p_from date, p_to date, p_status text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_sales boolean := public.can_see_sales();
  v_result jsonb;
begin
  perform private.require('read');
  if p_status is null or p_status not in ('all', 'draft', 'done', 'awaiting', 'void') then
    raise exception 'bad_status' using hint = 'اختر الحالة: الكلّ أو المسوّدة أو المكتملة أو بانتظار الفاتورة أو الملغاة.';
  end if;
  if (p_from is null) <> (p_to is null) or p_from > p_to then
    raise exception 'period_required' using hint = 'حدّد المدّة: من تاريخ إلى تاريخ لا يسبقه.';
  end if;
  with listed as (
    -- مراجعة 0028 O4: المكتملة بلا فاتورة تقول هل تُصدر لها فاتورة الآن (invoiceable) ولماذا لا (invoice_why، قاعدة الكاتب ticket_invoice_block).
    select t.*, s.name as site_name, b.id as sale_id, b.doc_no as sale_no, b.status as sale_status, k.invoiced,
      case when t.status = 'done' and not k.invoiced then private.ticket_invoice_block(t) end as invoice_why
    from public.weigh_tickets t
    join public.sites s on s.org_id = t.org_id and s.id = t.site_id
    left join lateral (select z.id, z.doc_no, z.status from public.bird_sales z where z.org_id = t.org_id and z.ticket_id = t.id
      order by z.status = 'posted' desc, z.posted_at desc, z.id limit 1) as b on true
    cross join lateral (select exists (select 1 from public.bird_sales z where z.org_id = t.org_id and z.ticket_id = t.id and z.status = 'posted') as invoiced) as k
    where t.org_id = v_org and public.in_scope_site(t.site_id) and (p_from is null or t.on_date between p_from and p_to)
  ), chosen as (
    select l.*, row_number() over (order by l.on_date desc, coalesce(l.finished_at, l.created_at) desc, l.id desc) as n
    from listed l
    where p_status = 'all' or (p_status = 'awaiting' and l.status = 'done' and not l.invoiced) or (p_status <> 'awaiting' and l.status = p_status)
  )
  select jsonb_build_object('from', p_from, 'to', p_to, 'status', p_status, 'today', public.app_today(), 'can_create', public.can('weigh_ticket.draft'),
    'rows', coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'ticket_no', c.ticket_no, 'status', c.status, 'on_date', c.on_date, 'site_id', c.site_id,
        'site_name', c.site_name, 'birds', c.birds, 'net_kg', c.net_kg::text,
        'halls', (select coalesce(jsonb_agg(h.name order by st.stop_no), '[]'::jsonb) from public.weigh_ticket_stops st
          join public.halls h on h.org_id = st.org_id and h.id = st.hall_id where st.org_id = c.org_id and st.ticket_id = c.id),
        'invoiced', c.invoiced,
        'invoiceable', c.status = 'done' and not c.invoiced and c.invoice_why is null, 'invoice_why', c.invoice_why,
        'sale', case when v_sales and c.sale_id is not null then jsonb_build_object('id', c.sale_id, 'doc_no', c.sale_no, 'status', c.sale_status) end)
      order by c.n) filter (where c.n <= 500), '[]'::jsonb),
    'more', count(*) > 500,
    'totals', jsonb_build_object('count', (count(*) filter (where c.status <> 'void'))::int,
      'birds', coalesce(sum(c.birds) filter (where c.status <> 'void'), 0), 'net_kg', coalesce(sum(c.net_kg) filter (where c.status <> 'void'), 0)::text,
      'invoiceable', (count(*) filter (where c.status = 'done' and not c.invoiced and c.invoice_why is null))::int))
  into v_result
  from chosen c;
  return v_result;
end
$$;

-- شاشة الفاتورة (العقد §5.4، لأدوار المبيعات): التذكرة بلا أفعالها، وهل تُصدر لها فاتورة ولماذا لا، والدفتر، وأفواجها بحيّها، والسعر المقترح (آخر فاتورة
-- مرحَّلة)، والفاتورة المرحَّلة إن وُجدت.
create or replace function public.bird_sale_form(p_ticket uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  t public.weigh_tickets;
  v_book jsonb;
  v_sale uuid;
  v_closed boolean;
  v_why text;
begin
  perform private.require('read');
  if not public.can_see_sales() then
    raise exception 'forbidden' using hint = 'المبيعات لأدوار المبيعات فقط.';
  end if;
  select * into t from public.weigh_tickets x where x.org_id = v_org and x.id = p_ticket;
  if t.id is null then
    raise exception 'ticket_not_found' using hint = 'هذه التذكرة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(t.site_id) then
    raise exception 'out_of_scope' using hint = 'حقل هذه التذكرة خارج نطاقك.';
  end if;
  select jsonb_build_object('id', b.id, 'name', b.name) into v_book from public.ledger_books b
  where b.org_id = v_org and b.division_id = t.division_id and b.code = 'main';
  select b.id into v_sale from public.bird_sales b where b.org_id = v_org and b.ticket_id = t.id and b.status = 'posted';
  v_closed := exists (select 1 from public.weigh_ticket_stops s join public.flocks f on f.org_id = s.org_id and f.id = s.flock_id
    where s.org_id = v_org and s.ticket_id = t.id and f.status = 'closed');
  -- مراجعة 0028 O4 وC3 وM6: لا تُعرض فاتورة يرفضها الكاتب: بلا دفتر، والدفتر خارج النطاق، وقاعدة التاريخ (ticket_invoice_block، مكانها الواحد).
  v_why := case when t.status = 'void' then 'void' when t.status = 'draft' then 'draft' when v_sale is not null then 'invoiced'
    when v_closed then 'flock_closed' else private.ticket_invoice_block(t) end;
  return jsonb_build_object(
    'ticket', private.weigh_ticket_json(t.id) - 'can',
    'invoiceable', v_why is null,
    'why', v_why,
    'book', v_book,
    'flocks', coalesce((select jsonb_agg(jsonb_build_object('stop_id', s.id, 'hall_name', h.name, 'flock_id', f.id, 'live', private.flock_live(f),
        'birds', s.birds, 'over_live', s.birds > private.flock_live(f)) order by s.stop_no)
      from public.weigh_ticket_stops s
      join public.halls h on h.org_id = s.org_id and h.id = s.hall_id
      join public.flocks f on f.org_id = s.org_id and f.id = s.flock_id
      where s.org_id = v_org and s.ticket_id = t.id), '[]'::jsonb),
    -- مراجعة 0028 C5: السعر المقترح من فواتير حقول نطاق القارئ وحدها.
    'suggested_price', (select b.unit_price::text from public.bird_sales b where b.org_id = v_org and b.status = 'posted' and public.in_scope_site(b.site_id)
      order by b.sold_on desc, b.posted_at desc, b.id limit 1),
    'sale', case when v_sale is not null then private.bird_sale_result(v_sale) end,
    'today', public.app_today(),
    'can_post', public.can('sale.post') and v_why is null);
end
$$;

-- الفاتورة (العقد §5.5، لأدوار المبيعات): نتيجتها، والتذكرة بسيّارتها وسائقها، وهاتف التاجر، والمتبقّي من قيدها، والمقبوض الباقي رصيداً بعد الإلغاء،
-- وهل تُلغى (فعل الإلغاء، ومرحَّلة، ولا فوج مغلق). المبالغ لأدوار المبيعات (لا كلفة فيها).
create or replace function public.bird_sale_detail(p_sale uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  x public.bird_sales;
begin
  perform private.require('read');
  if not public.can_see_sales() then
    raise exception 'forbidden' using hint = 'المبيعات لأدوار المبيعات فقط.';
  end if;
  select * into x from public.bird_sales y where y.org_id = v_org and y.id = p_sale;
  if x.id is null then
    raise exception 'doc_not_found' using hint = 'هذه الفاتورة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(x.site_id) then
    raise exception 'out_of_scope' using hint = 'حقل هذه الفاتورة خارج نطاقك.';
  end if;
  return private.bird_sale_result(x.id) || jsonb_build_object(
    'ticket', (select jsonb_build_object('ticket_no', t.ticket_no, 'vehicle', t.vehicle, 'driver', t.driver, 'method', t.method)
      from public.weigh_tickets t where t.org_id = x.org_id and t.id = x.ticket_id),
    'party_phone', (select p.phone from public.parties p where p.org_id = x.org_id and p.id = x.party_id),
    -- مراجعة 0028 S9: يوم الإلغاء بيوم الخادم (يوم قيد الإلغاء العكسيّ)، لا من ساعة الجهاز.
    'voided_on', (select r.on_date from public.party_entries r where r.org_id = x.org_id and r.reverses_entry_id = x.invoice_entry_id),
    'remaining', private.entry_remaining(x.invoice_entry_id)::text,
    'payment_kept', case when x.status = 'void' and x.payment_entry_id is not null and not exists (select 1 from public.party_entries r
      where r.org_id = x.org_id and r.reverses_entry_id = x.payment_entry_id) then x.paid_now::text end,
    'can_void', public.can('void') and x.status = 'posted' and not exists (select 1 from public.bird_sale_sources s
      join public.flocks f on f.org_id = s.org_id and f.id = s.flock_id where s.org_id = x.org_id and s.sale_id = x.id and f.status = 'closed'));
end
$$;

-- شاشة الإغلاق (العقد §5.6): الفوج بحيّه ونافقه ومستبعده وفرق عدّه وعمره، واليوم وأقدم يوم مسموح ويوم مقترح، والمباع من الفواتير، والتذاكر المعلّقة،
-- والعلف تقديراً، وما في القاعة من كلّ مادّة بمخازنه (والقيمة لأدوار الكلفة)، والمنقول إليه، وهل يُغلق ولماذا لا.
create or replace function public.flock_close_form(p_flock uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_lock date;
  f public.flocks;
  v_last date;
  v_sold_last date;
  v_pending jsonb;
  v_why text;
  v_earliest date;
  k record;
  v_left_kg numeric;
  v_left_unweighed int;
begin
  perform private.require('read');
  f := private.flock_for(p_flock, false);
  if f.placed_on is null then
    raise exception 'flock_not_placed' using hint = 'هذا الفوج لم يُسكَّن بعد، فلا تُغلق دورته.';
  end if;
  select l.locked_through into v_lock from public.period_locks l where l.org_id = v_org;
  select a.on_date into v_last from private.flock_activity_after(f, null) as a;
  select max(d.on_date) into v_sold_last from private.flock_count_days(f.id) as d where d.sold > 0;
  select * into k from private.report_days(f, least(v_today, coalesce(f.closed_on, v_today))) as r order by r.on_date desc limit 1;
  select z.kg, z.unweighed into v_left_kg, v_left_unweighed from private.flock_left_in_hall(f, least(v_today, coalesce(f.closed_on, v_today))) as z;
  v_earliest := greatest(v_today - 7, v_lock + 1, f.placed_on, v_last);
  v_pending := coalesce((select jsonb_agg(jsonb_build_object('ticket_id', t.id, 'ticket_no', t.ticket_no, 'status', t.status, 'on_date', t.on_date,
      'birds', s.birds) order by t.on_date, t.ticket_no collate "C", t.id)
    from public.weigh_tickets t join public.weigh_ticket_stops s on s.org_id = t.org_id and s.ticket_id = t.id and s.flock_id = f.id
    where t.org_id = v_org and t.status <> 'void'
      and not exists (select 1 from public.bird_sales b where b.org_id = t.org_id and b.ticket_id = t.id and b.status = 'posted')), '[]'::jsonb);
  v_why := case when not public.can('flock.manage') then 'forbidden' when f.status <> 'active' then 'not_active' when f.kind <> 'broiler' then 'layer'
    when jsonb_array_length(v_pending) > 0 then 'tickets_pending' end;
  return private.mask(jsonb_build_object(
    'flock', private.hall_flock_json(f) || jsonb_build_object('live', private.flock_live(f),
      'dead', (select coalesce(sum(y.dead), 0)::int from public.flock_daily y where y.org_id = f.org_id and y.flock_id = f.id),
      'culled', (select coalesce(sum(y.culled), 0)::int from public.flock_daily y where y.org_id = f.org_id and y.flock_id = f.id),
      'count_diff', (select coalesce(sum(d.adjust), 0)::int from private.flock_count_days(f.id) as d),
      'age', least(v_today, coalesce(f.closed_on, v_today)) - f.placed_on + f.age_days_at_placement),
    'today', v_today,
    'earliest_on', v_earliest,
    -- مراجعة 0028 O8/C6: اليوم المقترح لا يسبق أقدم يوم مسموح (آخر نشاط قبل أسبوع كان يقترح يوماً يرفضه الإغلاق).
    'default_on', greatest(least(coalesce(greatest(v_sold_last, v_last), v_today), v_today), v_earliest),
    -- مراجعة 0028 M4: بصمة ما في القاعة كميةً وقيمةً (close_flock يقارنها، p_expected_plan).
    'plan', private.flock_pool_plan(f.id),
    'sales', (select jsonb_build_object('birds', coalesce(sum(d.sold), 0), 'net_kg', round(coalesce(sum(d.sold_kg), 0), 3)::text,
        'avg_kg', case when sum(d.sold) > 0 then private._mul_div_round(sum(d.sold_kg), 1, sum(d.sold), 3)::text end,
        'invoices', coalesce((select jsonb_agg(jsonb_build_object('sold_on', b.sold_on, 'birds', s.birds, 'net_kg', s.net_kg::text, 'ticket_no', t.ticket_no,
            'doc_no', case when public.can_see_sales() then b.doc_no end) order by b.sold_on, b.doc_no collate "C")
          from public.bird_sale_sources s
          join public.bird_sales b on b.org_id = s.org_id and b.id = s.sale_id and b.status = 'posted'
          join public.weigh_tickets t on t.org_id = b.org_id and t.id = b.ticket_id
          where s.org_id = f.org_id and s.flock_id = f.id), '[]'::jsonb))
      from private.flock_count_days(f.id) as d),
    'pending_tickets', v_pending,
    'feed', jsonb_build_object('given_kg', k.given_cum_kg::text, 'eaten_kg', k.feed_cum_kg::text, 'estimate_left_kg', (k.given_cum_kg - k.feed_cum_kg)::text,
      'feed_days', k.feed_days, 'feed_span', k.feed_span, 'unweighed', k.given_cum_unweighed,
      'left_in_hall_kg', v_left_kg::text, 'left_in_hall_unweighed', v_left_unweighed),
    'items', coalesce((select jsonb_agg(jsonb_build_object('item_id', i.id, 'name', i.name, 'kind', i.kind, 'cost_kind', private.flock_cost_kind(i.kind),
        'base_unit', p.base_unit, 'pool_qty', p.qty::text, 'pool_kg', p.kg::text, 'carry_in_qty', p.carry_in_qty::text,
        'stores', st.stores,
        'default_store', (select (e.x ->> 'warehouse_id')::uuid from jsonb_array_elements(st.stores) with ordinality as e(x, n)
          where (e.x ->> 'usable')::boolean order by e.n limit 1),
        'money', jsonb_build_object('pool_value', p.value::text)) order by i.name_norm collate "C", i.id)
      from private.flock_item_pool(f.id) as p
      join public.items i on i.org_id = v_org and i.id = p.item_id
      cross join lateral (select private.flock_item_stores(f.id, i.id) as stores) as st), '[]'::jsonb),
    'carry_in', coalesce((select jsonb_agg(jsonb_build_object('line_id', l.id, 'item_id', l.item_id, 'name', i.name, 'qty', l.qty_base::text,
        'base_unit', l.base_unit, 'kg', private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)::text, 'applied_on', l.applied_on,
        'from_flock_id', c.flock_id) order by l.applied_on, l.line_no)
      from public.flock_close_lines l
      join public.flock_closes c on c.org_id = l.org_id and c.id = l.close_id
      join public.items i on i.org_id = l.org_id and i.id = l.item_id
      where l.org_id = v_org and l.to_flock_id = f.id and l.carry_status = 'applied'), '[]'::jsonb),
    'can_close', v_why is null,
    'why_not', v_why));
end
$$;

-- لماذا لا يُعاد فتح إغلاق قائم الآن (مراجعة 0028 O6: البطاقة لا تعد بإعادة فتح يرفضها reopen_flock حتماً)، بترتيب فحوص reopen_flock: مخزن مستند FR خارج
-- نطاق القارئ 'out_of_scope'، واليوم في فترة مقفلة 'period_locked'، والقاعة أو حقلها مؤرشف 'hall_archived'، وفوج بعدها في القاعة 'hall_reused'، ونقل
-- مطبَّق 'carry_used'، ودفعة إرجاع سُحب منها أو عليها تصحيح سعر حيّ 'lot_consumed' (شرط check_lot_intact)؛ وnull = تُعاد.
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
  end
$$;

-- بطاقة البيع على صفحة الفوج (العقد §5.7): الحيّ والمباع وصافيه وفرق العدّ وما على التذاكر بلا فاتورة، وأحدث 20 تذكرة غير ملغاة، والإغلاق الأخير، والأفعال.
-- مراجعة 0028: إعادة الفتح متاحة حين لا يرفضها reopen_flock حتماً، وreopen_why يقول لماذا لا (O6)؛ ويوم الخادم وأقدم يوم يقبله فرق العدّ (S1: كانت
-- نافذة فرق العدّ تحزرهما من ساعة الجهاز).
create or replace function public.flock_sales(p_flock uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  f public.flocks;
  v_active boolean;
  v_today date := public.app_today();
  v_lock date;
  v_close public.flock_closes;
  v_why text;
begin
  perform private.require('read');
  f := private.flock_for(p_flock, false);
  v_active := f.status = 'active';
  select l.locked_through into v_lock from public.period_locks l where l.org_id = f.org_id;
  select * into v_close from public.flock_closes c where c.org_id = f.org_id and c.flock_id = f.id and c.status = 'closed';
  if f.status = 'closed' and v_close.id is not null then
    v_why := private.reopen_block(v_close);
  end if;
  return (select jsonb_build_object('flock_id', f.id, 'status', f.status, 'kind', f.kind, 'live', private.flock_live(f),
      'today', v_today, 'earliest_on', greatest(v_today - 7, v_lock + 1, f.placed_on), 'reopen_why', v_why,
      'sold_birds', coalesce(sum(d.sold), 0), 'sold_net_kg', round(coalesce(sum(d.sold_kg), 0), 3)::text, 'count_diff', coalesce(sum(d.adjust), 0),
      'ticketed', private.flock_ticketed(f.id, null),
      'tickets', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'ticket_no', t.ticket_no, 'status', t.status, 'on_date', t.on_date, 'birds', t.birds,
          'invoiced', t.invoiced) order by t.on_date desc, t.at desc, t.id desc)
        from (select x.id, x.ticket_no, x.status, x.on_date, s.birds, coalesce(x.finished_at, x.created_at) as at,
            exists (select 1 from public.bird_sales b where b.org_id = x.org_id and b.ticket_id = x.id and b.status = 'posted') as invoiced
          from public.weigh_tickets x join public.weigh_ticket_stops s on s.org_id = x.org_id and s.ticket_id = x.id and s.flock_id = f.id
          where x.org_id = f.org_id and x.status <> 'void'
          order by x.on_date desc, coalesce(x.finished_at, x.created_at) desc, x.id desc limit 20) as t), '[]'::jsonb),
      'close', (select jsonb_build_object('id', c.id, 'closed_on', c.closed_on, 'status', c.status) from public.flock_closes c
        where c.org_id = f.org_id and c.flock_id = f.id order by c.status = 'closed' desc, c.closed_at desc, c.id limit 1),
      'can', jsonb_build_object('ticket', public.can('weigh_ticket.draft') and v_active and f.kind = 'broiler',
        'adjust', public.can('flock.manage') and v_active,
        'close', public.can('flock.manage') and v_active and f.kind = 'broiler',
        'reopen', public.can('flock.manage') and public.can('void') and f.status = 'closed' and v_close.id is not null and v_why is null))
    from private.flock_count_days(f.id) as d);
end
$$;

-- فواتير الطيور في قائمة المبيعات (مفتاح birds، العقد §6): الصفوف بالفترة الأحدث أوّلاً (1,000 حدّاً) بطريقة الدفع (بالدين أو جزئيّاً أو نقداً)،
-- والمجاميع للمرحَّلة، والتذاكر المكتملة بانتظار فاتورتها (حتى 100، بلا فترة)، بنطاق الحقل. مراجعة 0028 M3: المقبوض الذي رُدّ صفر (قاعدة 0021)،
-- وpayment_refunded لكلّ صفّ؛ وO4: لكلّ تذكرة بانتظار الفاتورة invoiceable وwhy بقاعدة الكاتب (ticket_invoice_block).
create or replace function private.bird_sales_overview(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with listed as (
    select b.*, p.name as party_name, s.name as site_name, t.ticket_no, k.refunded, k.paid_now as paid_eff,
      case when k.paid_now = 0 then 'credit' when k.paid_now < b.total then 'partial' else 'cash' end as paid,
      row_number() over (order by b.sold_on desc, b.posted_at desc, b.id desc) as n
    from public.bird_sales b
    join public.parties p on p.org_id = b.org_id and p.id = b.party_id
    join public.sites s on s.org_id = b.org_id and s.id = b.site_id
    join public.weigh_tickets t on t.org_id = b.org_id and t.id = b.ticket_id
    cross join lateral (select r.refunded, case when r.refunded then 0 else b.paid_now end as paid_now
      from (select private.bird_sale_refunded(b.payment_entry_id) as refunded) as r) as k
    where b.org_id = public.auth_org() and b.sold_on between p_from and p_to and public.in_scope_site(b.site_id)
  )
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'doc_no', o.doc_no, 'sold_on', o.sold_on, 'status', o.status, 'party_id', o.party_id,
        'party_name', o.party_name, 'site_id', o.site_id, 'site_name', o.site_name, 'ticket_id', o.ticket_id, 'ticket_no', o.ticket_no, 'birds', o.birds,
        'net_kg', o.net_kg::text, 'billed_kg', o.billed_kg::text, 'deduction_pct', o.deduction_pct::text, 'paid', o.paid, 'payment_refunded', o.refunded,
        'money', jsonb_build_object('unit_price', o.unit_price::text, 'total', o.total::text, 'paid_now', o.paid_eff::text)) order by o.n)
      filter (where o.n <= 1000), '[]'::jsonb),
    'more', count(*) > 1000,
    'totals', jsonb_build_object('count', (count(*) filter (where o.status = 'posted'))::int, 'voided', (count(*) filter (where o.status = 'void'))::int,
      'birds', coalesce(sum(o.birds) filter (where o.status = 'posted'), 0), 'net_kg', coalesce(sum(o.net_kg) filter (where o.status = 'posted'), 0)::text,
      'money', jsonb_build_object('revenue', coalesce(sum(o.total) filter (where o.status = 'posted'), 0)::text,
        'paid_now', coalesce(sum(o.paid_eff) filter (where o.status = 'posted'), 0)::text,
        'credit', coalesce(sum(o.total - o.paid_eff) filter (where o.status = 'posted'), 0)::text)),
    'awaiting', coalesce((select jsonb_agg(a.j order by a.on_date desc, a.at desc, a.id desc) from (
        select t.id, t.on_date, t.finished_at as at, jsonb_build_object('ticket_id', t.id, 'ticket_no', t.ticket_no, 'on_date', t.on_date, 'site_name', s.name,
          'birds', t.birds, 'net_kg', t.net_kg::text, 'invoiceable', w.why is null, 'why', w.why) as j
        from public.weigh_tickets t join public.sites s on s.org_id = t.org_id and s.id = t.site_id
        cross join lateral (select private.ticket_invoice_block(t) as why) as w
        where t.org_id = public.auth_org() and t.status = 'done' and public.in_scope_site(t.site_id)
          and not exists (select 1 from public.bird_sales b where b.org_id = t.org_id and b.ticket_id = t.id and b.status = 'posted')
        order by t.on_date desc, t.finished_at desc, t.id desc limit 100) as a), '[]'::jsonb),
    'can_record', public.can('sale.post'))
  from listed o
$$;

-- فواتير الطيور المرحَّلة مجمَّعة (مفتاح birds في تقرير المبيعات): بالجهة أو باليوم، وبالمادّة مفتاح واحد «دجاج لحم حيّ».
create or replace function private.bird_sales_groups(p_from date, p_to date, p_group text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with listed as (
    select case p_group when 'party' then b.party_id::text when 'item' then 'birds' else b.sold_on::text end as key,
      case p_group when 'party' then p.name when 'item' then 'دجاج لحم حيّ' else to_char(b.sold_on, 'DD/MM/YYYY') end as label,
      b.birds, b.net_kg, b.total
    from public.bird_sales b join public.parties p on p.org_id = b.org_id and p.id = b.party_id
    where b.org_id = public.auth_org() and b.status = 'posted' and b.sold_on between p_from and p_to and public.in_scope_site(b.site_id)
  ), grouped as (
    select l.key, min(l.label) as label, count(*)::int as count, sum(l.birds) as birds, sum(l.net_kg) as net_kg, sum(l.total) as revenue
    from listed l group by l.key
  )
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(jsonb_build_object('key', g.key, 'label', g.label, 'count', g.count, 'birds', g.birds, 'net_kg', g.net_kg::text,
        'money', jsonb_build_object('revenue', g.revenue::text)) order by case when p_group = 'day' then g.key end desc, g.revenue desc, g.label collate "C", g.key),
      '[]'::jsonb),
    'totals', jsonb_build_object('count', coalesce(sum(g.count), 0)::int, 'birds', coalesce(sum(g.birds), 0), 'net_kg', coalesce(sum(g.net_kg), 0)::text,
      'money', jsonb_build_object('revenue', coalesce(sum(g.revenue), 0)::text)))
  from grouped g
$$;

-- ─── ز٢. القرّاء القائمون (من أجسامهم الأخيرة؛ المفاتيح القديمة بشكلها ومعناها، والجديدة فقط) ──────────────────────────────────

-- ملخّص الفوج: الحيّ بالمباع وفرق العدّ، ومعامل التحويل بصافي المباع، ومفاتيح المباع والعدّ والتذاكر ويوم الإغلاق (الجسم الأخير من 0012، ومعه 0028).
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
  v_sold bigint;
  v_sold_kg numeric;
  v_adjust bigint;
  v_counts_before bigint;
  v_den numeric;
begin
  select coalesce(sum(x.dead), 0), coalesce(sum(x.culled), 0), coalesce(sum(x.dead + x.culled) filter (where x.on_date < v_today), 0),
         coalesce(sum(x.feed_kg), 0), count(x.feed_kg)::int, max(x.on_date) filter (where x.feed_kg is not null)
    into v_dead, v_culled, v_before, v_feed, v_feed_days, v_last_feed
  from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id;
  -- 0028: المباع وفرق العدّ (الأصول الحيّة بتاريخها): الحيّ الآن وأوّل اليوم بهما.
  select coalesce(sum(k.sold), 0), coalesce(sum(k.sold_kg), 0), coalesce(sum(k.adjust), 0), coalesce(sum(k.adjust - k.sold) filter (where k.on_date < v_today), 0)
  into v_sold, v_sold_kg, v_adjust, v_counts_before
  from private.flock_count_days(f.id) as k;
  v_live := coalesce(f.placed_count, 0) - v_dead - v_culled - v_sold + v_adjust;
  v_live_start := coalesce(f.placed_count, 0) - v_before + v_counts_before;
  -- أيّام العلف اللازمة لـFCR (القاعدة ٢٨): كل يوم من التسكين لحد أمس، واليوم ويّاها إذا انسجّل علفه (جولة اليوم بس ممكن تتأخّر).
  -- لحد «آخر يوم علف» كان يعدّ الفوج كاملاً لمّا تنقطع جولات العلف، والحيّ والوزن يمشون: FCR أقلّ من الحقيقة.
  -- 0028 (مراجعة O7): بلا الأيّام التي بدأت بلا طير حيّ (بعد بيع الكلّ لا جولة ولا علف ينتظرها)، بقاعدة report_days نفسها.
  v_span := case when f.placed_on is not null then private.flock_alive_days(f, greatest(coalesce(v_last_feed, f.placed_on - 1), v_today - 1)) end;
  select * into w from public.flock_weights x where x.org_id = f.org_id and x.flock_id = f.id order by x.on_date desc limit 1;
  select * into d from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = v_today;
  -- 0028: المقام = الحيّ × آخر وزن (إن بقي حيّ ووُزن) + صافي المباع بالغرام؛ ومن بقي حيّاً بلا وزن لا معامل له. بلا بيع كما كان.
  v_den := case when v_live > 0 and w.id is not null then v_live * w.avg_g else 0 end + v_sold_kg * 1000;
  if v_feed_days > 0 and v_feed_days = v_span and v_feed > 0 and v_den > 0 and (v_live <= 0 or w.id is not null) then
    v_fcr := private._mul_div_round(v_feed, 1000, v_den, 3)::text;
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
    'rejects_pending', v_rejects,
    'sold_birds', v_sold, 'sold_net_kg', round(v_sold_kg, 3)::text, 'count_diff', v_adjust, 'ticketed_birds', private.flock_ticketed(f.id, null),
    'closed_on', f.closed_on);
end
$$;

-- الفوج بأيّامه: الحيّ بالمباع وفرق العدّ، ولكلّ يوم مباعه وفرق عدّه (الجسم الأخير من 0012، ومعه 0028).
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
        'live_start', y.live_start, 'live_end', y.live_start - (y.d).dead - (y.d).culled - coalesce(k.sold, 0) + coalesce(k.adjust, 0),
        'sold', coalesce(k.sold, 0), 'count_diff', coalesce(k.adjust, 0),
        'hdep', case when f.kind = 'layer' then private.flock_pct((y.d).eggs_total, y.live_start) end) order by (y.d).on_date desc)
      from (
        select x as d, f.placed_count - coalesce(sum(x.dead + x.culled) over (order by x.on_date rows between unbounded preceding and 1 preceding), 0)
          + coalesce((select sum(z.adjust - z.sold) from private.flock_count_days(f.id) as z where z.on_date < x.on_date), 0) as live_start
        from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id
      ) as y
      left join private.flock_count_days(f.id) as k on k.on_date = (y.d).on_date
    ), '[]'::jsonb),
    'weights', coalesce((
      select jsonb_agg(jsonb_build_object('on_date', w.on_date, 'sample_count', w.sample_count, 'avg_g', round(w.avg_g, 1)::text, 'version', w.version)
        order by w.on_date desc)
      from public.flock_weights w where w.org_id = f.org_id and w.flock_id = f.id
    ), '[]'::jsonb));
end
$$;

-- قائمة الدورات: الحيّ بالمباع وفرق العدّ، ومفتاحاهما (الجسم الأخير من 0027، ومعه 0028).
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
      'live', c.placed_count - b.gone - n.sold + n.adjust, 'mortality_pct', private.flock_pct(b.gone, c.placed_count),
      'sold_birds', n.sold, 'count_diff', n.adjust) order by c.n) filter (where c.n <= 500), '[]'::jsonb)
  into v_count, v_cycles
  from c
  cross join lateral (select coalesce(sum(y.dead + y.culled), 0) as gone from public.flock_daily y
    where y.org_id = v_org and y.flock_id = c.id and y.on_date <= c.through) as b
  cross join lateral (select coalesce(sum(k.sold), 0)::int as sold, coalesce(sum(k.adjust), 0)::int as adjust from private.flock_count_days(c.id) as k
    where k.on_date <= c.through) as n;
  return jsonb_build_object('today', v_today, 'more', v_count > 500, 'cycles', v_cycles);
end
$$;

-- تقويم القاعة: «ألغِ» الصرف للقائم وحده، ولكلّ يوم مباعه وفرق عدّه، والخارج يوم الإغلاق والمنقول إليه يوم التسكين (الجسم الأخير من 0026، ومعه 0028).
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

-- علف القاعة: المنقول إليها والخارج منها والصافي (الجسم الأخير من 0019، ومعه 0028).
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
  v_carry_in numeric;
  v_out numeric;
  v_left_kg numeric;
  v_left_unweighed int;
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
  -- 0028 (مراجعة O2/M5): ما في القاعة فعلاً بتعريفه الواحد (private.flock_left_in_hall)، حتى يوم الإغلاق أو اليوم.
  if f.placed_on is not null then
    select z.kg, z.unweighed into v_left_kg, v_left_unweighed from private.flock_left_in_hall(f, least(public.app_today(), coalesce(f.closed_on, public.app_today()))) as z;
  end if;
  select coalesce(sum(private.issue_mass_kg(y.qty_base, y.base_unit, y.density_kg_per_l, y.piece_mass_kg)), 0),
    (count(*) filter (where private.issue_mass_kg(y.qty_base, y.base_unit, y.density_kg_per_l, y.piece_mass_kg) is null))::int
  into v_issued, v_unweighed
  from public.flock_issues x join public.flock_issue_lines y on y.org_id = x.org_id and y.issue_id = x.id
  where x.org_id = v_org and x.flock_id = f.id and x.status = 'posted' and y.cost_kind = 'feed';
  select coalesce(sum(d.feed_kg), 0) into v_consumed from public.flock_daily d where d.org_id = v_org and d.flock_id = f.id;
  -- 0028: العلف المنقول إليها من الدورة السابقة (مطبَّقاً)، والخارج منها عند إغلاقها (الراجع والمنقول)، بالكيلو.
  select coalesce(sum(private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)), 0) into v_carry_in
  from public.flock_close_lines l where l.org_id = v_org and l.to_flock_id = f.id and l.carry_status = 'applied' and l.cost_kind = 'feed';
  select coalesce(sum(private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)), 0) into v_out
  from public.flock_close_lines l join public.flock_closes c on c.org_id = l.org_id and c.id = l.close_id
  where l.org_id = v_org and l.flock_id = f.id and c.status = 'closed' and l.action in ('return', 'carry') and l.cost_kind = 'feed';
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
    'carry_in_feed_kg', round(v_carry_in, 3)::text, 'out_feed_kg', round(v_out, 3)::text, 'net_feed_kg', round(v_issued + v_carry_in - v_out, 3)::text,
    'left_in_hall_kg', round(coalesce(v_left_kg, 0), 3)::text, 'left_in_hall_unweighed', coalesce(v_left_unweighed, 0),
    'can_void', v_any_void,
    'money', jsonb_build_object('issued_value', v_value::text)));
end
$$;

-- بيان الحركة: الإرجاع من القاعة (الجسم الأخير من 0021، ومعه 0028).
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
    when 'flock_return' then coalesce((select case when x.source = 'close' then format('إرجاع من %s (%s) عند إغلاق الدورة', h.name, s.name)
        else format('إرجاع علف منقول من %s (%s)', h.name, s.name) end
      from public.flock_returns x
      join public.halls h on h.org_id = x.org_id and h.id = x.hall_id
      join public.sites s on s.org_id = x.org_id and s.id = x.site_id
      where x.org_id = public.auth_org() and x.id = p_doc), 'إرجاع من قاعة')
    else p_kind
  end
$$;

-- اسم المستند: رقم الإرجاع FR (الجسم الأخير من 0021، ومعه 0028).
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
    when 'flock_return' then coalesce((select x.doc_no from public.flock_returns x where x.org_id = public.auth_org() and x.id = p_doc), 'إرجاع من قاعة')
    else p_kind
  end
$$;

-- صنف حركة الصندوق: المقبوض عند بيع الطيور بيع نقديّ (الجسم الأخير من 0024، ومعه 0028).
create or replace function private.cash_class(p_kind text, p_doc_kind text) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case
    when p_kind = 'party_payment' and p_doc_kind is null then 'customer_receipt'
    when p_kind = 'party_payment' and p_doc_kind in ('sale', 'bird_sale') then 'cash_sale'
    when p_kind = 'party_payout' and p_doc_kind is null then 'supplier_payment'
    when p_kind = 'receipt_paid' then 'cash_purchase'
    when p_kind = 'receipt_charge' then 'purchase_charge'
    when p_kind = 'expense' then 'expense'
    when p_kind = 'transfer' then 'transfer'
    when p_kind = 'opening' then 'opening'
    else 'other'
  end
$$;

-- تفصيل القيد: فاتورة الطيور ومقبوضها (الجسم الأخير من 0024، ومعه 0028).
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
  elsif e.doc_kind = 'bird_sale' then
    -- 0028: فاتورة الطيور BR: الحقل والتذكرة والطيور والصافي والتنزيل والمحسوب وسعر الكيلو والمبلغ والمقبوض وصندوقه؛ وقيد المقبوض بصندوقه. والمقبوض
    -- الذي رُدّ («ألغِ القبض») صفر وpayment_refunded يقول ذلك (مراجعة 0028 M3، قاعدة 0021).
    if e.kind = 'payment' then
      select jsonb_build_object('type', 'bird_sale_payment', 'doc_id', b.id, 'doc_no', b.doc_no,
          'payment_refunded', private.bird_sale_refunded(b.payment_entry_id),
          'account', (select jsonb_build_object('id', a.id, 'name', a.name) from public.cash_accounts a where a.org_id = v_org and a.id = b.cash_account_id))
      into v_out
      from public.bird_sales b where b.org_id = v_org and b.id = e.doc_id;
      return v_out;
    end if;
    select jsonb_build_object('type', 'bird_sale', 'doc_id', b.id, 'doc_no', b.doc_no, 'status', b.status, 'sold_on', b.sold_on,
        'site', jsonb_build_object('id', s.id, 'name', s.name), 'ticket_no', t.ticket_no, 'birds', b.birds, 'net_kg', b.net_kg::text,
        'deduction_pct', b.deduction_pct::text, 'billed_kg', b.billed_kg::text, 'unit_price', b.unit_price::text, 'total', b.total::text,
        'paid_now', case when private.bird_sale_refunded(b.payment_entry_id) then 0 else b.paid_now end::text,
        'payment_refunded', private.bird_sale_refunded(b.payment_entry_id),
        'account', (select jsonb_build_object('id', a.id, 'name', a.name) from public.cash_accounts a where a.org_id = v_org and a.id = b.cash_account_id))
    into v_out
    from public.bird_sales b
    join public.sites s on s.org_id = b.org_id and s.id = b.site_id
    join public.weigh_tickets t on t.org_id = b.org_id and t.id = b.ticket_id
    where b.org_id = v_org and b.id = e.doc_id;
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

-- أرقام المبيعات: فواتير الطيور بإيرادها مفتاحاً جديداً (الجسم الأخير من 0024، ومعه 0028).
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
    'gross', case when public.can_see_cost() then (coalesce(sum(x.line_total), 0) - coalesce(sum(x.cost), 0))::text end,
    -- 0028: فواتير الطيور المرحَّلة بإيرادها (بلا كلفة بند: الربح للفوج)، بنطاق الدفتر ووحدته.
    'birds', (select jsonb_build_object('count', count(*)::int, 'revenue', coalesce(sum(b.total), 0)::text)
      from public.bird_sales b join public.ledger_books k on k.org_id = b.org_id and k.id = b.book_id
      where b.org_id = public.auth_org() and b.status = 'posted' and b.sold_on between p_from and p_to and public.in_scope_book(b.book_id)
        and (p_division is null or k.division_id = p_division)))
  from x
$$;

-- المبيعات بفترة: فواتير الطيور مفتاحاً جديداً (الجسم الأخير من 0021، ومعه 0028).
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
  -- 0028: فواتير الطيور مفتاحاً جديداً (القديمة بشكلها ومعناها، D11).
  v_result := v_result || jsonb_build_object('birds', private.bird_sales_overview(p_from, p_to));
  return private.sale_view(v_result);
end
$$;

-- تقرير المبيعات: فواتير الطيور مجمَّعة مفتاحاً جديداً (الجسم الأخير من 0021، ومعه 0028).
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
  -- 0028: فواتير الطيور مجمَّعة بالتجميع نفسه مفتاحاً جديداً (بالمادّة: مفتاح واحد «دجاج لحم حيّ»).
  v_result := v_result || jsonb_build_object('birds', private.bird_sales_groups(p_from, p_to, p_group));
  return private.sale_view(v_result);
end
$$;

-- ─── ح. قرّاء 0027 بالمباع وفرق العدّ والعلف المنقول والراجع (المفاتيح القديمة بشكلها، والجديدة فقط) ─────────────────────────────────
-- المخازن التي جاءت منها مادّة إلى فوج (الإرجاع إليها وحدها): الاسم، وهل يُرجَع إليه الآن (غير مؤرشف، وبنطاق القارئ، ويقبل نوع المادّة) ولماذا لا،
-- وآخر يوم نزلت منه.
create or replace function private.flock_item_stores(p_flock uuid, p_item uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('warehouse_id', w.id, 'name', w.name,
      'usable', w.archived_at is null and public.in_scope_wh(w.id) and private.item_admissible(w.kind, i.kind),
      'why', case when w.archived_at is not null then 'archived' when not public.in_scope_wh(w.id) then 'out_of_scope' end,
      'last_on', x.last_on) order by x.last_on desc, w.name collate "C", w.id), '[]'::jsonb)
  from (select z.warehouse_id, max(z.issued_on) as last_on from private.flock_item_lots(p_flock, p_item) as z group by z.warehouse_id) as x
  join public.warehouses w on w.org_id = public.auth_org() and w.id = x.warehouse_id
  join public.items i on i.org_id = w.org_id and i.id = p_item
$$;

-- العلف المنقول المعلَّق على قاعة بلا فوج في يوم (التقرير اليوميّ): سطور نقل لإغلاق قائم أُغلق يومه أو قبله ولم يُطبَّق ولم يُرجَع قبل اليوم.
create or replace function private.hall_carry(p_hall uuid, p_on date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('line_id', l.id, 'item_id', l.item_id, 'name', i.name, 'qty', l.qty_base::text, 'base_unit', l.base_unit,
      'kg', private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)::text, 'closed_on', c.closed_on, 'from_flock_id', c.flock_id)
      order by c.closed_on, l.line_no), '[]'::jsonb)
  from public.flock_close_lines l
  join public.flock_closes c on c.org_id = l.org_id and c.id = l.close_id
  join public.items i on i.org_id = l.org_id and i.id = l.item_id
  left join public.flock_returns r on r.org_id = l.org_id and r.close_line_id = l.id and r.source = 'carry' and r.status = 'posted'
  where l.org_id = public.auth_org() and l.hall_id = p_hall and l.action = 'carry' and l.carry_status in ('pending', 'applied', 'returned')
    and c.status = 'closed' and c.closed_on <= p_on
    and ((l.applied_on is null and r.returned_on is null) or p_on < coalesce(l.applied_on, r.returned_on))
$$;

-- أرقام البيع والعدّ والعلف المنقول والخارج لكلّ يوم من التسكين حتى p_through (0028؛ رفيق report_days بأعمدته كما في 0027): المباع وصافيه وفرق العدّ
-- (الأصول الحيّة بتاريخها، D4) وتراكمها؛ والعلف المنقول إليه من الدورة السابقة يوم تطبيقه وعدّ سطوره بلا كتلة وتراكمه؛ والخارج يوم الإغلاق القائم (الراجع
-- والمنقول) وعدّ سطوره بلا كتلة وتراكمهما؛ والمحسوب مستهلَكاً عند الإغلاق (used، مراجعة 0028 O2/M5: ما في القاعة بتعريف واحد) وعدّ سطوره بلا كتلة.
create or replace function private.report_days_extra(f public.flocks, p_through date)
returns table (on_date date, sold int, sold_kg numeric, sold_cum bigint, sold_cum_kg numeric, adjust int, adjust_cum bigint,
  carry_in_kg numeric, carry_in_unweighed int, carry_in_cum_kg numeric, out_kg numeric, out_unweighed int, out_cum_kg numeric, out_cum_unweighed int,
  used_kg numeric, used_unweighed int, used_cum_kg numeric, used_cum_unweighed int)
language sql stable security definer set search_path = public, pg_temp as $$
  with g as (
    select f.placed_on + s.n as d from generate_series(0, p_through - f.placed_on) as s(n)
  ), carry as (
    select l.applied_on as d, sum(m.kg) as kg, count(*) filter (where m.kg is null) as unweighed
    from public.flock_close_lines l
    cross join lateral (select private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg) as kg) as m
    where l.org_id = f.org_id and l.to_flock_id = f.id and l.carry_status = 'applied' and l.cost_kind = 'feed' and l.applied_on <= p_through
    group by l.applied_on
  ), outs as (
    select c.closed_on as d, sum(m.kg) filter (where l.action in ('return', 'carry')) as kg,
      count(*) filter (where l.action in ('return', 'carry') and m.kg is null) as unweighed,
      sum(m.kg) filter (where l.action = 'consumed') as used_kg, count(*) filter (where l.action = 'consumed' and m.kg is null) as used_unweighed
    from public.flock_closes c
    join public.flock_close_lines l on l.org_id = c.org_id and l.close_id = c.id
    cross join lateral (select private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg) as kg) as m
    where c.org_id = f.org_id and c.flock_id = f.id and c.status = 'closed' and c.closed_on <= p_through and l.cost_kind = 'feed'
    group by c.closed_on
  ), y as (
    select g.d, coalesce(k.sold, 0) as sold, coalesce(k.sold_kg, 0) as sold_kg, coalesce(k.adjust, 0) as adjust,
      coalesce(c.kg, 0) as carry_kg, coalesce(c.unweighed, 0) as carry_unweighed, coalesce(o.kg, 0) as out_kg, coalesce(o.unweighed, 0) as out_unweighed,
      coalesce(o.used_kg, 0) as used_kg, coalesce(o.used_unweighed, 0) as used_unweighed
    from g
    left join private.flock_count_days(f.id) as k on k.on_date = g.d
    left join carry c on c.d = g.d
    left join outs o on o.d = g.d
  )
  select y.d, y.sold::int, y.sold_kg, (sum(y.sold) over w)::bigint, sum(y.sold_kg) over w, y.adjust::int, (sum(y.adjust) over w)::bigint,
    y.carry_kg, y.carry_unweighed::int, sum(y.carry_kg) over w, y.out_kg, y.out_unweighed::int, sum(y.out_kg) over w, (sum(y.out_unweighed) over w)::int,
    y.used_kg, y.used_unweighed::int, sum(y.used_kg) over w, (sum(y.used_unweighed) over w)::int
  from y
  window w as (order by y.d rows unbounded preceding)
  order by y.d
$$;

-- أرقام كلّ يوم لفوج (0027 بأعمدته نفسها، و0028 من رفيقه report_days_extra): الحيّ أوّل اليوم وآخره بالمباع وفرق العدّ؛ والعلف النازل = الصرف + المنقول
-- من الدورة السابقة يوم تطبيقه، وعدّ سطورهما بلا كتلة؛ ومعامل التحويل بقاعدة flock_summary واليوم = D: المقام = الحيّ آخر اليوم × آخر وزن (إن بقي حيّ ووُزن)
-- + صافي المباع التراكميّ بالغرام. بلا بيع ولا نقل ولا عدّ كما كان حرفاً بحرف.
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
      count(y.feed_kg) over c as feed_days,
      max(y.d) filter (where y.feed_kg is not null) over c as last_feed,
      sum(y.given_kg) over c as given_cum_kg,
      sum(y.given_unweighed) over c as given_cum_unweighed,
      max(y.d) filter (where y.avg_g is not null) over c as last_weight_on
    from y
    window c as (order by y.d rows unbounded preceding)
  ), a as (
    -- 0028 (مراجعة O7): يوم بدأ بلا طير حيّ (بعد بيع الكلّ) لا جولة ولا علف ينتظره: أيّام العلف اللازمة = أيّام الحيّ أوّلها من التسكين حتى أمس (أو
    -- اليوم إن سُجّل علفه). وبلا بيع ولا عدّ كما كانت حرفاً بحرف (كلّ يوم حيّ).
    select z.*, count(*) filter (where z.live_start > 0) over (order by z.d rows unbounded preceding) as alive_cum
    from z
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

-- ما في القاعة فعلاً حتى يوم (مراجعة 0028 O2/M5، التعريف الواحد لكلّ قارئ: left_in_hall_kg في flock_feed وflock_close_form وتقرير الدورة والتقرير
-- اليوميّ): النازل (الصرف المرحَّل والمنقول إليها مطبَّقاً) − الراجع والمنقول منها والمحسوب مستهلَكاً عند إغلاقها القائم − المأكول في الجولات، بالكيلو من
-- سطور العلف الموزونة؛ وعدد سطورها بلا كتلة (تُعدّ ولا تختفي، 0027 N1). فالقاعة المغلقة صفر حين كان لكلّ باقٍ مصير، والفوج التالي يعدّ منقوله.
create or replace function private.flock_left_in_hall(f public.flocks, p_through date, out kg numeric, out unweighed int)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.given_cum_kg - e.out_cum_kg - e.used_cum_kg - r.feed_cum_kg, r.given_cum_unweighed + e.out_cum_unweighed + e.used_cum_unweighed
  from private.report_days(f, p_through) as r
  join private.report_days_extra(f, p_through) as e on e.on_date = r.on_date
  where r.on_date = p_through
$$;

-- فوج القاعة ليوم (0027 كما هو، و0028): المباع وصافيه وفرق العدّ في يومه، والطيور على تذاكر يومه بلا فاتورة (ticketed)، والعلف المنقول إليه يومه
-- والخارج منه يوم إغلاقه وعدّ سطوره بلا كتلة؛ والباقي = النازل التراكميّ − الخارج التراكميّ − المأكول التراكميّ.
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
    'sold', e.sold, 'sold_net_kg', round(e.sold_kg, 3)::text, 'count_diff', e.adjust,
    'ticketed', (select coalesce(sum(s.birds), 0)::int from public.weigh_ticket_stops s
      join public.weigh_tickets t on t.org_id = s.org_id and t.id = s.ticket_id
      where s.org_id = f.org_id and s.flock_id = f.id and t.on_date = p_on and t.status <> 'void'
        and not exists (select 1 from public.bird_sales b where b.org_id = t.org_id and b.ticket_id = t.id and b.status = 'posted')),
    'feed_carry_in_kg', e.carry_in_kg::text, 'feed_out_kg', e.out_kg::text, 'feed_out_unweighed', e.out_unweighed,
    'feed_out_cum_unweighed', e.out_cum_unweighed,
    -- مراجعة 0028 O2/M5: ما في القاعة فعلاً بتعريفه الواحد (النازل والمنقول إليها − الراجع والمنقول منها والمحسوب مستهلَكاً عند الإغلاق − المأكول)،
    -- وعدّ سطوره بلا كتلة؛ وO7: يوم بدأ بلا طير حيّ لا جولة تنتظره؛ وO3: فروق العدّ في اليوم بسببها ومصدرها.
    'left_in_hall_kg', (r.given_cum_kg - e.out_cum_kg - e.used_cum_kg - r.feed_cum_kg)::text,
    'left_in_hall_unweighed', r.given_cum_unweighed + e.out_cum_unweighed + e.used_cum_unweighed,
    'expects_round', r.live_start > 0,
    'count_diffs', coalesce((select jsonb_agg(jsonb_build_object('birds', c.birds, 'reason', c.reason,
        'source', case when c.doc_kind = 'flock_close' then 'close' else 'manual' end) order by c.created_at, c.id)
      from public.flock_counts c
      where c.org_id = f.org_id and c.flock_id = f.id and c.kind = 'count_adjust' and c.on_date = p_on and c.reverses_id is null
        and not exists (select 1 from public.flock_counts q where q.org_id = c.org_id and q.reverses_id = c.id)), '[]'::jsonb),
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
  join private.report_days_extra(f, p_on) as e on e.on_date = r.on_date
  where r.on_date = p_on
$$;

-- مجاميع القاعات المعروضة (0027 كما هو، و0028: المباع وفرق العدّ والطيور على التذاكر بلا فاتورة لكلّ فوج).
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
    'feed_given_unweighed', coalesce(sum((e.h -> 'flock' ->> 'feed_given_unweighed')::int), 0)::int,
    'sold', coalesce(sum((e.h -> 'flock' ->> 'sold')::bigint), 0),
    'count_diff', coalesce(sum((e.h -> 'flock' ->> 'count_diff')::bigint), 0),
    'ticketed', coalesce(sum((e.h -> 'flock' ->> 'ticketed')::bigint), 0),
    -- مراجعة 0028 O7: الأفواج التي تنتظر جولة اليوم (بدأ يومها بطيور حيّة)؛ والفوج الذي بيع كلّه قبله لا يُعدّ جولةً ناقصة.
    'rounds_expected', (count(*) filter (where (e.h -> 'flock' ->> 'expects_round')::boolean))::int)
  from jsonb_array_elements(coalesce(p_halls, '[]'::jsonb)) as e(h)
$$;

-- التقرير اليوميّ لكلّ القاعات (0027 كما هو، و0028: العلف المنقول المعلَّق على كلّ قاعة بلا فوج في اليوم، carry).
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
        'flock', case when q.id is not null then private.report_day(q.f, v_on, v_today) end,
        'carry', case when q.id is null then private.hall_carry(h.id, v_on) else '[]'::jsonb end) order by h.name collate "C", h.id) as halls
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

-- تقرير الدورة (0027 كما هو، و0028): الطيور بالمباع وفرق العدّ وسببه؛ والأيّام بأرقام البيع والعدّ والعلف المنقول والخارج؛ والمؤشّرات بالمباع وصافيه ومعدّله
-- وعمر البيع (موزوناً بالطيور) والعلف المنقول والخارج والصافي، ومعامل التحويل النهائيّ (المغلقة وحدها: العلف الصافي ÷ صافي المباع) ومؤشّر الإنتاج النهائيّ
-- (الحيوية × معدّل وزن البيع بالغرام ÷ (10 × عمر البيع × معامل التحويل النهائيّ))؛ وsales وclose وcarry_in؛ والمال يزيد الإيراد والراجع والمنقول إليها
-- ومنها (والمفاتيح القديمة صافية بالراجع والمنقول: كلفة الفوج بمعناها).
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
  -- 0027: الأيّام والأسابيع والأوزان والمؤشّرات حتى «حتى»، من report_days مرّة واحدة (و0028: البيع والعدّ والعلف المنقول والخارج).
  v_through := coalesce(f.closed_on, v_today);
  with r as materialized (
    select d.*, e.sold, e.sold_kg, e.sold_cum, e.sold_cum_kg, e.adjust, e.adjust_cum, e.carry_in_kg, e.carry_in_cum_kg, e.out_kg, e.out_unweighed,
      e.out_cum_kg, e.out_cum_unweighed,
      -- مراجعة 0028 O2/M5: ما في القاعة بتعريفه الواحد (private.flock_left_in_hall).
      d.given_cum_kg - e.out_cum_kg - e.used_cum_kg - d.feed_cum_kg as left_kg, d.given_cum_unweighed + e.out_cum_unweighed + e.used_cum_unweighed as left_unweighed
    from private.report_days(f, v_through) as d join private.report_days_extra(f, v_through) as e on e.on_date = d.on_date
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
        'left_in_hall_kg', r.left_kg::text, 'left_in_hall_unweighed', r.left_unweighed, 'expects_round', r.live_start > 0) order by r.on_date) from r),
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

-- ─── ط٢. الثوابت القائمة (من أجسامها الأخيرة) ───────────────────────────────────────────────────────────────────────

-- ثوابت الأفواج: الحيّ بالعدد، والحيّ في كلّ يوم (live_negative_day) (الجسم الأخير من 0012، ومعه 0028).
create or replace function public.verify_flocks() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select 'live_negative', count(*) from public.flocks f
  where coalesce(f.placed_count, 0) - coalesce((select sum(x.dead + x.culled) from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id), 0)
    + coalesce((select sum(c.birds) from public.flock_counts c where c.org_id = f.org_id and c.flock_id = f.id), 0) < 0
  union all
  -- 0028: الحيّ لا ينزل تحت الصفر في أيّ يوم (D6): الجاري بالتاريخ من المسكَّن، بفرق كلّ يوم (نافقه ومستبعده وأصول العدد الحيّة).
  select 'live_negative_day', count(*) from public.flocks f
  where exists (
    select 1 from (
      select coalesce(f.placed_count, 0) + sum(t.delta) over (order by t.d rows unbounded preceding) as live
      from (
        select u.d, sum(u.delta) as delta from (
          select y.on_date as d, -(y.dead + y.culled)::bigint as delta from public.flock_daily y where y.org_id = f.org_id and y.flock_id = f.id
          union all
          select c.on_date, c.birds::bigint from public.flock_counts c
          where c.org_id = f.org_id and c.flock_id = f.id and c.reverses_id is null and not exists (select 1 from public.flock_counts r where r.org_id = c.org_id and r.reverses_id = c.id)
        ) as u group by u.d
      ) as t
    ) as z where z.live < 0)
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
      f.placed_count - coalesce(sum(x.dead + x.culled) over (partition by x.org_id, x.flock_id order by x.on_date rows between unbounded preceding and 1 preceding), 0)
        + coalesce((select sum(c.birds) from public.flock_counts c where c.org_id = x.org_id and c.flock_id = x.flock_id and c.on_date < x.on_date and c.reverses_id is null and not exists (select 1 from public.flock_counts r where r.org_id = c.org_id and r.reverses_id = c.id)), 0) as live_start
    from public.flock_daily x join public.flocks f on f.org_id = x.org_id and f.id = x.flock_id
  ) as y
  where y.eggs_total > y.live_start
$$;

-- ثوابت المخزون: الإرجاع من القاعة في حفظ القيمة (الجسم الأخير من 0021، ومعه 0028).
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
  --    صفر (حركاتها معكوسة). والإرجاع من القاعة (0028) داخل بدفعته وخارج بصفّ كلفته السالب على الفوج (flock_return)، فلا يغيّر الحفظ؛ والنقل
  --    للدورة التالية بلا حركة مخزون خارج الحفظ (flock_carry).
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
      + coalesce((select sum(c.amount) from public.flock_costs c where c.org_id = o.id and c.doc_kind in ('flock_issue', 'flock_return')), 0)
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

-- ثوابت المال: تفصيل فاتورة الطيور = قيدها (الجسم الأخير من 0024، ومعه 0028).
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
  -- 0028: تفصيل فاتورة الطيور = قيدها: الفاتورة +المبلغ، والمقبوض قيد −المقبوض بحركة صندوق +المقبوض.
  select 'bird_sale_detail_total', count(*) from public.bird_sales b
  join public.party_entries e on e.org_id = b.org_id and e.id = b.invoice_entry_id
  left join public.party_entries pe on pe.org_id = b.org_id and pe.id = b.payment_entry_id
  left join public.cash_moves m on m.org_id = b.org_id and m.id = b.cash_move_id
  where e.amount <> b.total or (b.paid_now > 0 and (pe.amount is distinct from -b.paid_now or m.amount is distinct from b.paid_now))
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

-- ─── ط. الثوابت (لمفتاح الخادم وحده؛ صفر مخالفة) ─────────────────────────────────────────────────────────────────────────
-- بيع الطيور (العقد §7): شكل التذكرة المكتملة وصافيها، وأرقام WT، وشكل الفاتورة (القاعدة ٢٦)، وإيرادها لكلّ وقفة بأكبر الباقي، وصفوف «مباع» من
-- كلّ مصدر، وقيودها وصندوقها، وأرقام BR، ولا يتيم بمستند bird_sale.
create or replace function public.verify_bird_sales() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  -- ١) التذكرة المكتملة: وقفة واحدة على الأقلّ، وكلّ وقفة كاملة بقاعة في حقل التذكرة وفوج في قاعتها، وصافيها ولقطة أقفاصها وخابطها = المعادلة
  --    (ticket_nets)، والمجاميع = مجموع الوقفات؛ والقبّان: مجموع الصافي = آخر خابط − الفارغ − (الأقفاص × وزن القفص إن وُزن الفارغ بلاها).
  select 'ticket_shape'::text, count(*) from public.weigh_tickets t
  where t.status = 'done' and (
    not exists (select 1 from public.weigh_ticket_stops s where s.org_id = t.org_id and s.ticket_id = t.id)
    or exists (select 1 from public.weigh_ticket_stops s
      join public.halls h on h.org_id = s.org_id and h.id = s.hall_id
      join public.flocks f on f.org_id = s.org_id and f.id = s.flock_id
      where s.org_id = t.org_id and s.ticket_id = t.id
        and (s.birds is null or s.net_kg is null or h.site_id <> t.site_id or f.hall_id <> s.hall_id or s.site_id <> t.site_id))
    or exists (select 1 from private.ticket_nets(t.id) as n join public.weigh_ticket_stops s on s.org_id = t.org_id and s.id = n.stop_id
      where n.net_kg is distinct from s.net_kg or (t.method = 'crates' and (n.crates is distinct from s.crates or n.gross_kg is distinct from s.gross_kg)))
    or t.birds is distinct from (select sum(s.birds)::int from public.weigh_ticket_stops s where s.org_id = t.org_id and s.ticket_id = t.id)
    or t.net_kg is distinct from (select sum(s.net_kg) from public.weigh_ticket_stops s where s.org_id = t.org_id and s.ticket_id = t.id)
    or (t.crates is not null and t.crates is distinct from (select sum(s.crates)::int from public.weigh_ticket_stops s where s.org_id = t.org_id and s.ticket_id = t.id))
    or (t.method = 'scale' and t.net_kg is distinct from
      (select (array_agg(s.gross_kg order by s.stop_no desc))[1] - t.empty_kg
        - case when t.empty_with_crates then 0 else sum(s.crates) * t.crate_kg end
       from public.weigh_ticket_stops s where s.org_id = t.org_id and s.ticket_id = t.id)))
  union all
  -- ٢) أرقام WT: سنة يوم التذكرة، ولكلّ (منشأة، سنة) الأرقام 1…last_no بلا فجوة ولا تكرار (والملغاة بعد إكمالها برقمها).
  select 'ticket_numbers', (
    select count(*) from public.weigh_tickets t where t.ticket_no is not null and split_part(t.ticket_no, '-', 2) <> to_char(t.on_date, 'YYYY')
  ) + (
    select count(*) from (
      select t.org_id, split_part(t.ticket_no, '-', 2)::int as year, count(*) as items, count(distinct split_part(t.ticket_no, '-', 3)::int) as distinct_no,
        min(split_part(t.ticket_no, '-', 3)::int) as min_no, max(split_part(t.ticket_no, '-', 3)::int) as max_no
      from public.weigh_tickets t where t.ticket_no is not null group by 1, 2
    ) as g
    full join (select * from public.doc_counters where kind = 'WT') as c on c.org_id = g.org_id and c.year = g.year
    where g.org_id is null or c.org_id is null or g.items <> g.distinct_no or g.min_no <> 1 or g.max_no <> c.last_no
  )
  union all
  -- ٣) الفاتورة (القاعدة ٢٦): الطيور والصافي = التذكرة، ويومها يوم التذكرة، والمحسوب = round3(الصافي × (100 − التنزيل) ÷ 100)، والمبلغ = round0(المحسوب
  --    × سعر الكيلو)، والدفتر الرئيسيّ لوحدة الحقل، والمرحَّلة لتذكرة مكتملة، وفاتورة مرحَّلة واحدة لكلّ تذكرة.
  select 'sale_shape', count(*) from public.bird_sales b
  join public.weigh_tickets t on t.org_id = b.org_id and t.id = b.ticket_id
  where b.birds <> t.birds or b.net_kg <> t.net_kg or b.sold_on <> t.on_date or b.site_id <> t.site_id or b.division_id <> t.division_id
    or b.billed_kg <> private._mul_div_round(b.net_kg, 100 - b.deduction_pct, 100, 3)
    or b.total <> private._mul_div_round(b.billed_kg, b.unit_price, 1, 0)
    or not exists (select 1 from public.ledger_books k where k.org_id = b.org_id and k.id = b.book_id and k.division_id = t.division_id and k.code = 'main')
    or (b.status = 'posted' and t.status <> 'done')
    or (select count(*) from public.bird_sales z where z.org_id = b.org_id and z.ticket_id = b.ticket_id and z.status = 'posted') > 1
  union all
  -- ٤) الإيراد لكلّ وقفة: مصدر واحد لكلّ وقفة بطيورها وصافيها وفوجها وقاعتها، ومجموع الإيراد = المبلغ، وكلّ حصّة = أكبر الباقي على صافي الوقفات.
  select 'sale_sources', count(*) from public.bird_sales b
  where (select count(*) from public.bird_sale_sources x where x.org_id = b.org_id and x.sale_id = b.id)
      <> (select count(*) from public.weigh_ticket_stops s where s.org_id = b.org_id and s.ticket_id = b.ticket_id)
    or exists (select 1 from public.weigh_ticket_stops s
      left join public.bird_sale_sources x on x.org_id = s.org_id and x.sale_id = b.id and x.stop_id = s.id
      where s.org_id = b.org_id and s.ticket_id = b.ticket_id
        and (x.id is null or x.birds <> s.birds or x.net_kg <> s.net_kg or x.flock_id <> s.flock_id or x.hall_id <> s.hall_id))
    or b.total <> (select coalesce(sum(x.revenue), 0) from public.bird_sale_sources x where x.org_id = b.org_id and x.sale_id = b.id)
    or private.alloc_lr(b.total, array(select s.net_kg from public.weigh_ticket_stops s where s.org_id = b.org_id and s.ticket_id = b.ticket_id order by s.stop_no), 0)
      is distinct from array(select x.revenue from public.bird_sale_sources x join public.weigh_ticket_stops s on s.org_id = x.org_id and s.id = x.stop_id
        where x.org_id = b.org_id and x.sale_id = b.id order by s.stop_no)
  union all
  -- ٥) صفّ «مباع» واحد أصليّ لكلّ مصدر (−الطيور، +الصافي، فوجه، يوم الفاتورة)، والمرحَّلة بلا عكس، والملغاة معكوسة مرّة؛ ولا صفّ bird_sale يتيم.
  select 'sale_counts', count(*) from (
    select x.id from public.bird_sale_sources x
    join public.bird_sales b on b.org_id = x.org_id and b.id = x.sale_id
    cross join lateral (
      select count(*) as n,
        count(*) filter (where c.birds = -x.birds and c.net_kg = x.net_kg and c.flock_id = x.flock_id and c.on_date = b.sold_on and c.kind = 'sold') as good,
        count(*) filter (where exists (select 1 from public.flock_counts r where r.org_id = c.org_id and r.reverses_id = c.id)) as reversed
      from public.flock_counts c
      where c.org_id = x.org_id and c.doc_kind = 'bird_sale' and c.doc_id = b.id and c.doc_line_id = x.id and c.reverses_id is null
    ) as k
    where k.n <> 1 or k.good <> 1 or (b.status = 'posted' and k.reversed > 0) or (b.status = 'void' and k.reversed <> 1)
    union all
    select c.id from public.flock_counts c
    where c.doc_kind = 'bird_sale'
      and not exists (select 1 from public.bird_sale_sources x where x.org_id = c.org_id and x.sale_id = c.doc_id and x.id = c.doc_line_id)
  ) as v
  union all
  -- ٦) القيود والصندوق (كفحص البيع ٣): الفاتورة قيد invoice للتاجر بدفترها بمستند الفاتورة ويومها = المبلغ، والمقبوض قيد payment = −المقبوض بحركة
  --    party_payment بالصندوق = +المقبوض؛ والمرحَّلة قيد فاتورتها بلا عكس، والملغاة معكوس.
  select 'sale_entries', count(*) from public.bird_sales b
  left join public.party_entries e on e.org_id = b.org_id and e.id = b.invoice_entry_id
  left join public.party_entries pe on pe.org_id = b.org_id and pe.id = b.payment_entry_id
  left join public.cash_moves m on m.org_id = b.org_id and m.id = b.cash_move_id
  where e.id is null or e.kind <> 'invoice' or e.amount <> b.total or e.party_id <> b.party_id or e.book_id <> b.book_id
    or e.doc_kind is distinct from 'bird_sale' or e.doc_id is distinct from b.id or e.doc_no is distinct from b.doc_no or e.on_date <> b.sold_on
    or e.reverses_entry_id is not null
    or (b.paid_now > 0 and (pe.id is null or pe.kind <> 'payment' or pe.amount <> -b.paid_now or pe.party_id <> b.party_id or pe.book_id <> b.book_id
      or pe.doc_kind is distinct from 'bird_sale' or pe.doc_id is distinct from b.id or pe.on_date <> b.sold_on or pe.reverses_entry_id is not null
      or m.id is null or m.kind <> 'party_payment' or m.amount <> b.paid_now or m.account_id is distinct from b.cash_account_id
      or m.party_entry_id is distinct from pe.id or m.doc_kind is distinct from 'bird_sale' or m.doc_id is distinct from b.id or m.reverses_move_id is not null))
    or (b.paid_now = 0 and (pe.id is not null or m.id is not null))
    or (b.status = 'posted' and exists (select 1 from public.party_entries r where r.org_id = b.org_id and r.reverses_entry_id = e.id))
    or (b.status = 'void' and not exists (select 1 from public.party_entries r where r.org_id = b.org_id and r.reverses_entry_id = e.id))
  union all
  -- ٧) أرقام BR: سنة يوم الفاتورة، ولكلّ (منشأة، سنة) الأرقام 1…last_no بلا فجوة ولا تكرار.
  select 'sale_numbers', (
    select count(*) from public.bird_sales b where split_part(b.doc_no, '-', 2) <> to_char(b.sold_on, 'YYYY')
  ) + (
    select count(*) from (
      select b.org_id, split_part(b.doc_no, '-', 2)::int as year, count(*) as items, count(distinct split_part(b.doc_no, '-', 3)::int) as distinct_no,
        min(split_part(b.doc_no, '-', 3)::int) as min_no, max(split_part(b.doc_no, '-', 3)::int) as max_no
      from public.bird_sales b group by 1, 2
    ) as g
    full join (select * from public.doc_counters where kind = 'BR') as c on c.org_id = g.org_id and c.year = g.year
    where g.org_id is null or c.org_id is null or g.items <> g.distinct_no or g.min_no <> 1 or g.max_no <> c.last_no
  )
  union all
  -- ٨) لا قيد ولا حركة صندوق بمستند bird_sale إلّا من فاتورة تشير إليها (أصلاً، والعكسيات لأصول منها).
  select 'sale_orphans', count(*) from (
    select e.id from public.party_entries e
    where e.doc_kind = 'bird_sale'
      and not exists (select 1 from public.bird_sales b where b.org_id = e.org_id and b.id = e.doc_id
        and coalesce(e.reverses_entry_id, e.id) in (b.invoice_entry_id, b.payment_entry_id))
    union all
    select m.id from public.cash_moves m
    where m.doc_kind = 'bird_sale'
      and not exists (select 1 from public.bird_sales b where b.org_id = m.org_id and b.id = m.doc_id and coalesce(m.reverses_move_id, m.id) = b.cash_move_id)
  ) as v
  union all
  -- ٩) مراجعة 0028 M9: كلّ عكس في عدد الطيور (إلغاء الفاتورة وإعادة فتح الدورة) = أصله بالضبط بإشارة معاكسة: −الطيور و−الصافي، والفوج والقاعة والحقل
  --    والوحدة والنوع والمستند وسطره أنفسها، ويومه لا يسبق يوم أصله، وأصله ليس عكساً (كانت الطيور تعود إلى فوج آخر فلا يراها فحص).
  select 'count_reversals', count(*) from public.flock_counts r
  left join public.flock_counts o on o.org_id = r.org_id and o.id = r.reverses_id
  where r.reverses_id is not null and (o.id is null or o.reverses_id is not null or r.birds <> -o.birds or r.net_kg is distinct from -o.net_kg
    or r.flock_id <> o.flock_id or r.hall_id <> o.hall_id or r.site_id <> o.site_id or r.division_id <> o.division_id or r.kind <> o.kind
    or r.doc_kind <> o.doc_kind or r.doc_id <> o.doc_id or r.doc_line_id is distinct from o.doc_line_id or r.on_date < o.on_date)
$$;

-- إغلاق الدورة (العقد §7): الفوج المغلق بإغلاق قائم واحد بيومه، وحيّه صفر، ولا نشاط بعد يومه؛ وفرق العدّ بصفّه؛ والإرجاع بحركته ودفعته وكلفته؛ والنقل
-- بصفوفه بحالته؛ وقيمة كلّ سطر بالقاعدة ١٦؛ وكلفة المغلق = لقطته؛ وكلفة الصرف والإرجاع لكلّ فوج = قيمة حركاتهما (F:431).
create or replace function public.verify_flock_close() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  -- ١) المغلق ⇔ إغلاق قائم واحد بيومه وقاعته وحقله، والإغلاق القائم لفوج مغلق.
  select 'close_shape'::text, count(*) from public.flocks f
  where (f.status = 'closed') <> exists (select 1 from public.flock_closes c where c.org_id = f.org_id and c.flock_id = f.id and c.status = 'closed'
      and c.closed_on = f.closed_on and c.hall_id = f.hall_id and c.site_id = f.site_id and c.division_id = f.division_id)
    or (select count(*) from public.flock_closes c where c.org_id = f.org_id and c.flock_id = f.id and c.status = 'closed') > 1
  union all
  -- ٢) حيّ المغلق صفر.
  select 'closed_live_zero', count(*) from public.flocks f where f.status = 'closed' and private.flock_live(f) <> 0
  union all
  -- ٣) لا نشاط على المغلق بعد يوم إغلاقه.
  select 'activity_after_close', count(*) from public.flocks f
  cross join lateral private.flock_activity_after(f, f.closed_on) as a
  where f.status = 'closed' and a.what is not null
  union all
  -- ٤) فرق العدّ عند الإغلاق: غير الصفر ⇔ صفّ أصليّ واحد = فرق العدّ بيوم الإغلاق وسببه؛ والقائم بلا عكس، والمُعاد فتحه معكوس مرّة.
  select 'close_counts', count(*) from public.flock_closes c
  cross join lateral (
    select count(*) as n, count(*) filter (where k.birds = c.count_diff and k.on_date = c.closed_on and k.flock_id = c.flock_id and k.kind = 'count_adjust'
        and k.reason is not distinct from c.count_reason) as good,
      count(*) filter (where exists (select 1 from public.flock_counts r where r.org_id = k.org_id and r.reverses_id = k.id)) as reversed
    from public.flock_counts k where k.org_id = c.org_id and k.doc_kind = 'flock_close' and k.doc_id = c.id and k.reverses_id is null
  ) as x
  where x.n <> (c.count_diff <> 0)::int or x.good <> x.n or (c.status = 'closed' and x.reversed > 0) or (c.status = 'reopened' and x.reversed <> x.n)
  union all
  -- ٥) كلّ سطر إرجاع: حركة أصلية موجبة واحدة بكميته على دفعته (مصدرها الإرجاع وسطره، ويومها يوم الإرجاع، ومخزنها مخزنه)، وللمرحَّل ترتيب الدفعة وانتهاؤها
  --    أصغر ما في دفعات المادّة التي نزلت للفوج؛ والمرحَّل بلا عكس، والملغى معكوس.
  select 'return_moves', count(*) from public.flock_return_lines l
  join public.flock_returns r on r.org_id = l.org_id and r.id = l.return_id
  join public.stock_lots s on s.org_id = l.org_id and s.id = l.lot_id
  cross join lateral (
    select count(*) as n, count(*) filter (where m.qty = l.qty_base and m.lot_id = l.lot_id and m.warehouse_id = r.warehouse_id and m.moved_on = r.returned_on) as good,
      count(*) filter (where exists (select 1 from public.stock_moves z where z.org_id = m.org_id and z.reverses_move_id = m.id)) as reversed
    from public.stock_moves m where m.org_id = l.org_id and m.doc_kind = 'flock_return' and m.doc_id = r.id and m.doc_line_id = l.id and m.reverses_move_id is null
  ) as x
  where x.n <> 1 or x.good <> 1 or s.source_kind <> 'flock_return' or s.source_id <> r.id or s.source_line_id is distinct from l.id or s.received_on <> r.returned_on
    or s.warehouse_id <> r.warehouse_id or s.item_id <> l.item_id or s.origin_lot_id is not null or s.qty_in <> l.qty_base
    or (r.status = 'posted' and (x.reversed > 0
      or s.fifo_seq is distinct from (select min(z.fifo_seq) from private.flock_item_lots(r.flock_id, l.item_id) as q join public.stock_lots z on z.org_id = l.org_id and z.id = q.lot_id)
      or s.expiry_on is distinct from (select min(z.expiry_on) from private.flock_item_lots(r.flock_id, l.item_id) as q join public.stock_lots z on z.org_id = l.org_id and z.id = q.lot_id)))
    or (r.status = 'void' and x.reversed <> 1)
  union all
  -- ٦) صفّ كلفة أصليّ واحد سالب لكلّ سطر إرجاع على فوجه = قيمة حركته؛ والمرحَّل بلا عكس، والملغى معكوس.
  select 'return_costs', count(*) from public.flock_return_lines l
  join public.flock_returns r on r.org_id = l.org_id and r.id = l.return_id
  cross join lateral (
    select count(*) as n,
      count(*) filter (where c.flock_id = r.flock_id and c.kind = l.cost_kind and c.on_date = r.returned_on and -c.amount = (select m.value from public.stock_moves m
        where m.org_id = l.org_id and m.doc_kind = 'flock_return' and m.doc_id = r.id and m.doc_line_id = l.id and m.reverses_move_id is null limit 1)) as good,
      count(*) filter (where exists (select 1 from public.flock_costs z where z.org_id = c.org_id and z.reverses_id = c.id)) as reversed
    from public.flock_costs c where c.org_id = l.org_id and c.doc_kind = 'flock_return' and c.doc_id = r.id and c.doc_line_id = l.id and c.reverses_id is null
  ) as x
  where x.n <> 1 or x.good <> 1 or (r.status = 'posted' and x.reversed > 0) or (r.status = 'void' and x.reversed <> 1)
  union all
  -- ٧) النقل: صفّ خروج أصليّ واحد (−القيمة) على الفوج المغلق؛ المعلَّق بلا عكس ولا دخول؛ والمطبَّق بلا عكس ودخول واحد = −الخروج على فوج القاعة نفسها
  --    بيوم التطبيق؛ والمُرجَع خروجه معكوس مرّة وله إرجاع مرحَّل؛ والملغى خروجه معكوس بلا دخول.
  select 'carry_costs', count(*) from public.flock_close_lines l
  join public.flock_closes c on c.org_id = l.org_id and c.id = l.close_id
  cross join lateral (
    select count(*) as n, min(z.amount) as amount,
      count(*) filter (where exists (select 1 from public.flock_costs q where q.org_id = z.org_id and q.reverses_id = z.id)) as reversed
    from public.flock_costs z where z.org_id = l.org_id and z.doc_kind = 'flock_carry' and z.doc_id = c.id and z.doc_line_id = l.id and z.flock_id = c.flock_id
      and z.reverses_id is null
  ) as o
  cross join lateral (
    select count(*) as n, min(z.amount) as amount, min(z.on_date) as on_date, min(f.hall_id::text) as hall
    from public.flock_costs z join public.flocks f on f.org_id = z.org_id and f.id = z.flock_id
    where z.org_id = l.org_id and z.doc_kind = 'flock_carry' and z.doc_id = c.id and z.doc_line_id = l.id and z.flock_id <> c.flock_id
  ) as i
  where l.action = 'carry' and (o.n <> 1 or o.amount > 0
    or (l.carry_status = 'pending' and (o.reversed > 0 or i.n > 0))
    or (l.carry_status = 'applied' and (o.reversed > 0 or i.n <> 1 or i.amount <> -o.amount or i.on_date <> l.applied_on or i.hall <> l.hall_id::text
      or not exists (select 1 from public.flocks f where f.org_id = l.org_id and f.id = l.to_flock_id and f.hall_id = l.hall_id)))
    or (l.carry_status = 'returned' and (o.reversed <> 1 or i.n > 0 or not exists (select 1 from public.flock_returns r where r.org_id = l.org_id
      and r.close_line_id = l.id and r.source = 'carry' and r.status = 'posted')))
    or (l.carry_status = 'void' and (o.reversed <> 1 or i.n > 0))
    -- مراجعة 0028 O1: إرجاع المنقول المرحَّل لسطر «أُرجع» وحده (إعادة الفتح تلغيه مع سطره، فلا يبقى في المخزن وما نزل للقاعة معاً).
    or (l.carry_status <> 'returned' and exists (select 1 from public.flock_returns r where r.org_id = l.org_id and r.close_line_id = l.id
      and r.source = 'carry' and r.status = 'posted')))
  union all
  -- ٨) قيمة كلّ سطر إرجاع أو نقل في إغلاق قائم بالقاعدة ١٦ من مخزون القاعدة قبله (الصرف والمنقول إليها، بلا صفوف هذا الإغلاق): الكلّ = القيمة كلّها،
  --    وإلّا _mul_div_round2(الكمية، القيمة، الكمية كلّها).
  select 'return_values', count(*) from public.flock_close_lines l
  join public.flock_closes c on c.org_id = l.org_id and c.id = l.close_id
  cross join lateral (
    select coalesce((select sum(il.qty_base) from public.flock_issues x join public.flock_issue_lines il on il.org_id = x.org_id and il.issue_id = x.id
        where x.org_id = c.org_id and x.flock_id = c.flock_id and x.status = 'posted' and il.item_id = l.item_id), 0)
      + coalesce((select sum(z.qty_base) from public.flock_close_lines z where z.org_id = c.org_id and z.to_flock_id = c.flock_id and z.item_id = l.item_id
        and z.carry_status = 'applied'), 0) as q,
      coalesce((select sum(k.amount) from public.flock_costs k
        left join public.flock_issue_lines il on k.doc_kind = 'flock_issue' and il.org_id = k.org_id and il.id = k.doc_line_id
        left join public.flock_close_lines cl on k.doc_kind = 'flock_carry' and cl.org_id = k.org_id and cl.id = k.doc_line_id
        where k.org_id = c.org_id and k.flock_id = c.flock_id and k.doc_kind in ('flock_issue', 'flock_carry') and coalesce(il.item_id, cl.item_id) = l.item_id
          and not (k.doc_kind = 'flock_carry' and k.doc_id = c.id)), 0) as v
  ) as p
  cross join lateral (
    select case when l.action = 'return' then (select -k.amount from public.flock_costs k join public.flock_returns r on r.org_id = k.org_id and r.id = k.doc_id
        where k.org_id = l.org_id and k.doc_kind = 'flock_return' and r.close_line_id = l.id and r.source = 'close' and k.reverses_id is null limit 1)
      else (select -k.amount from public.flock_costs k where k.org_id = l.org_id and k.doc_kind = 'flock_carry' and k.doc_id = c.id and k.doc_line_id = l.id
        and k.flock_id = c.flock_id and k.reverses_id is null) end as value
  ) as a
  where c.status = 'closed' and l.action in ('return', 'carry')
    and (p.q <= 0 or l.qty_base > p.q or a.value is distinct from case when l.qty_base = p.q then p.v else private._mul_div_round2(l.qty_base, p.v, p.q) end)
  union all
  -- ٩) كلفة المغلق = لقطته عند الإغلاق (إرجاع المنقول بعده عكس وإرجاع بالقيمة نفسها).
  select 'closed_cost_frozen', count(*) from public.flock_closes c
  join public.flock_close_values v on v.org_id = c.org_id and v.close_id = c.id
  where c.status = 'closed' and v.cost_total <> (select coalesce(sum(k.amount), 0) from public.flock_costs k where k.org_id = c.org_id and k.flock_id = c.flock_id)
  union all
  -- ١٠) لكلّ فوج: صفوف كلفة الصرف والإرجاع = −قيمة حركاتهما في المخزون (F:431).
  select 'flock_stock_costs', count(*) from public.flocks f
  where coalesce((select sum(k.amount) from public.flock_costs k where k.org_id = f.org_id and k.flock_id = f.id and k.doc_kind in ('flock_issue', 'flock_return')), 0)
    <> -coalesce((select sum(m.value) from public.stock_moves m where m.org_id = f.org_id and (
        (m.doc_kind = 'flock_issue' and m.doc_id in (select x.id from public.flock_issues x where x.org_id = f.org_id and x.flock_id = f.id))
        or (m.doc_kind = 'flock_return' and m.doc_id in (select r.id from public.flock_returns r where r.org_id = f.org_id and r.flock_id = f.id)))), 0)
  union all
  -- ١١) مراجعة 0028 M7: لقطة مال الإغلاق = صفوفها: الراجع = −صفوف كلفة إرجاعه الأصلية (FR بمصدر الإغلاق)، والمنقول = −صفوف النقل الأصلية على فوجه،
  --     والإيراد (للقائم) = إيراد مصادر فواتيره المرحَّلة؛ ولقطة واحدة لكلّ إغلاق بفوجه وحقله (كانت لقطة الإيراد بمبلغ الفاتورة كلّها تعبر الفحوص).
  select 'close_values', count(*) from public.flock_closes c
  left join public.flock_close_values v on v.org_id = c.org_id and v.close_id = c.id
  where v.id is null or v.flock_id <> c.flock_id or v.site_id <> c.site_id
    or v.returned_value <> coalesce((select sum(-k.amount) from public.flock_costs k join public.flock_returns r on r.org_id = k.org_id and r.id = k.doc_id
      where k.org_id = c.org_id and k.doc_kind = 'flock_return' and k.reverses_id is null and r.close_id = c.id and r.source = 'close'), 0)
    or v.carried_value <> coalesce((select sum(-k.amount) from public.flock_costs k where k.org_id = c.org_id and k.doc_kind = 'flock_carry' and k.doc_id = c.id
      and k.flock_id = c.flock_id and k.reverses_id is null), 0)
    or (c.status = 'closed' and v.revenue <> coalesce((select sum(s.revenue) from public.bird_sale_sources s
      join public.bird_sales b on b.org_id = s.org_id and b.id = s.sale_id where s.org_id = c.org_id and s.flock_id = c.flock_id and b.status = 'posted'), 0))
  union all
  -- ١٢) مراجعة 0028 M8: كلّ إرجاع مرحَّل إلى مخزن جاءت منه المادّة إلى الفوج (دفعات flock_item_lots)، كما يفرض الإغلاق وإرجاع المنقول (not_from_store).
  select 'return_store', count(*) from public.flock_returns r
  join public.flock_return_lines l on l.org_id = r.org_id and l.return_id = r.id
  where r.status = 'posted' and not exists (select 1 from private.flock_item_lots(r.flock_id, l.item_id) as z where z.warehouse_id = r.warehouse_id)
$$;

-- ─── ي. الصلاحيات ──────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function private.flock_counts_total(uuid), private.flock_live(public.flocks), private.flock_count_days(uuid), private.flock_live_check(public.flocks),
  private.flock_item_lots(uuid, uuid), private.flock_item_pool(uuid),
  private.return_lot(uuid, uuid, date, bigint, date, numeric, numeric, uuid, uuid),
  private.flock_return_post(uuid, public.flocks, uuid, uuid, numeric, numeric, date, text, uuid, uuid, text, numeric, numeric, text, uuid),
  private.division_main_book(uuid), private.ticket_nets(uuid), private.weigh_ticket_content(uuid), private.flock_ticketed(uuid, uuid),
  private.weigh_ticket_json(uuid), private.bird_sale_result(uuid), private.flock_activity_after(public.flocks, date), private.flock_close_result(uuid),
  private.flock_item_stores(uuid, uuid), private.hall_carry(uuid, date), private.report_days_extra(public.flocks, date),
  private.bird_sales_overview(date, date), private.bird_sales_groups(date, date, text),
  private.ticket_date_block(date), private.ticket_invoice_block(public.weigh_tickets), private.bird_sale_refunded(uuid), private.flock_pool_plan(uuid),
  private.flock_alive_days(public.flocks, date), private.flock_left_in_hall(public.flocks, date), private.reopen_block(public.flock_closes)
  from public, anon, authenticated;
revoke all on function public.save_weigh_ticket(uuid, int, jsonb), public.finish_weigh_ticket(uuid, uuid, int), public.void_weigh_ticket(uuid, text, uuid),
  public.record_bird_sale(uuid, uuid, uuid, int, uuid, numeric, numeric, numeric, uuid, text), public.void_bird_sale(uuid, text, uuid),
  public.record_flock_count_adjust(uuid, uuid, uuid, date, int, text, int),
  public.close_flock(uuid, uuid, uuid, date, int, int, jsonb, text, jsonb, text, text), public.reopen_flock(uuid, text, uuid),
  public.return_hall_carry(uuid, uuid, uuid, uuid),
  public.weigh_ticket(uuid), public.weigh_ticket_options(uuid), public.weigh_tickets(date, date, text), public.bird_sale_form(uuid),
  public.bird_sale_detail(uuid), public.flock_close_form(uuid), public.flock_sales(uuid), public.verify_bird_sales(), public.verify_flock_close()
  from public, anon;
grant execute on function public.save_weigh_ticket(uuid, int, jsonb), public.finish_weigh_ticket(uuid, uuid, int), public.void_weigh_ticket(uuid, text, uuid),
  public.record_bird_sale(uuid, uuid, uuid, int, uuid, numeric, numeric, numeric, uuid, text), public.void_bird_sale(uuid, text, uuid),
  public.record_flock_count_adjust(uuid, uuid, uuid, date, int, text, int),
  public.close_flock(uuid, uuid, uuid, date, int, int, jsonb, text, jsonb, text, text), public.reopen_flock(uuid, text, uuid),
  public.return_hall_carry(uuid, uuid, uuid, uuid),
  public.weigh_ticket(uuid), public.weigh_ticket_options(uuid), public.weigh_tickets(date, date, text), public.bird_sale_form(uuid),
  public.bird_sale_detail(uuid), public.flock_close_form(uuid), public.flock_sales(uuid) to authenticated;
revoke all on function public.verify_bird_sales(), public.verify_flock_close() from authenticated;
grant execute on function public.verify_bird_sales(), public.verify_flock_close() to service_role;
