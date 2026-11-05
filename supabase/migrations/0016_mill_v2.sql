-- 0016_mill_v2 — المعمل، النسخة الثانية: سعر الكلفة المكتوب، وبانية الخلطة بنداء واحد، وتكاليف لكلّ طنّ بالخلطة، وسطور تكاليف
--   الدفعة محمَّلة من المصاريف المسجّلة، وإضافة مادّة للدفعة وتبديلها بسبب (كلمة المالك 2026-11-04 وأجوبته D1 وD2 وD3؛ FOUNDATION
--   القواعد ١٩–٢١، ٣٥٠، ٤٣٠، ٤٣٦، ٤٤٣، ٥٢٦، ٥٦٠).
-- المشكلة: المالك جرّب المعمل بالإنتاج فلم يجد طريقاً يكتب به سعر كلفة لمادّته، ولا تكاليف اختيارية (أيدي عاملة، كهرباء، نقل)
--   على العلف، ولا طريقاً يبني به الخلطة كاملة (الاسم والمنتج والسطور) في خطوة واحدة: أنشأ خلطة بلا سطر لأنّ السطور في صفحة
--   أخرى. والنسخة الأولى كتبت extra_value = 0 دائماً، فكلفة الكيلو المنتَج مواد فقط؛ ولا مادّة تُضاف للدفعة أو تُبدَّل.
-- هنا: item_prices.cost_price ودالّته set_item_cost_price (سعر للتخطيط فقط، لا يدخل قيمة دفعة مخزون أبداً)؛ وcreate_recipe
--   (الخلطة ونسختها وسطورها ومعدّلاتها وتفعيلها بمعاملة واحدة، وتُعاد بأمان بالمعرّف)؛ وrecipe_cost_rates (مبلغ لكلّ طنّ بفئة
--   مصروف، مسوّدة النسخة، كتابة مباشرة بفعل recipe.activate)؛ وproduction_costs (سطر لكلّ معدّل عند الإنشاء، ويدويّ يكتبه دور
--   الكلفة بفعل costs.load، وأيّ تعديل يفرّغ ختم الكلف) وproduction_cost_allocations (يكتبها الترحيل وحده من المصاريف المؤهّلة
--   الأقدم فالأحدث تحت قفل صفوفها، ويوقفها الإلغاء)؛ وvoid_expense يرفض مصروفاً عليه تحميل فعّال (expense_allocated)؛
--   وreport_expenses يزيد المحمَّل؛ وadd_production_input (مادّة جديدة أو بديلة بسببها، replaced_item_id)؛ والقرّاء يزيدون
--   سعر الكلفة وآخر شراء وكلفة الطنّ المتوقّعة والتكاليف وتحميلاتها؛ وverify_mill ستّة فحوص؛ وverify_stock يعدّ الكلف اليدوية
--   للدفعات المرحَّلة في طرف الداخل من حفظ القيمة (FOUNDATION ٤٣٠: قيمة الناتج = السحوبات + الكلف اليدوية بالضبط). والإدراج
--   المباشر في recipe_cost_rates وproduction_costs بمعرّف موجود (إعادة بعد جواب ضاع) يرجع 23505 قبل فحوص الحارس (الفئة المكتوبة
--   أو المسوّدة التي رُحّلت)، فالإعادة مأمونة (FOUNDATION ١٩٩) والشاشة تقرأ الصفّ بمعرّفه (فحص الدمج في mill2.test).
-- انحرافات مكتوبة: المصروف المؤهّل للتحميل يدويّ فقط (نقداً أو بالدين): مصروف المخزون والتسوية يكتبهما مستند ويُلغيان منه لا من
--   void_expense، فلو حُمّل منهما لبقي تحميل فعّال على مصروف أُلغي؛ وفئة واحدة لكلّ سطر تكاليف في الدفعة (فريد)، فالمتاح لكلّ
--   سطر لا يتقاسمه سطر آخر؛ وitem_lots_qty لا يتغيّر: يرجّع منذ 0007 المصدر مسطّحاً (source_kind وsource_id وsource نصّاً =
--   private.stock_doc_label، و0015 تعرف به رقم دفعة الإنتاج)، ومفتاح source نصّ تقرؤه بطاقة المادّة وشاشة الصرف، فلا يُقلب كائناً؛
--   وكلفة الطنّ المتوقّعة في recipes_overview فارغة إن بقيت مادّة بلا سعر (لا رقم ناقص بصمت)، وفي recipe_detail مجموع المسعَّر
--   ومعه عدد غير المسعَّر.
-- مراجعة 0016 (scratchpad/mill2/fixes.md القسم أ، ق١–ق١٦): الترحيل يحمّل ممّا قفلته جملة القفل وحدها (سباق كان يحمّل الدينار
--   مرّتين أو من مصروف أُلغي أثناء الانتظار)؛ وconfirm_production_costs بنطاق مخزن المدخلات وبكفاية المصاريف (expense_overloaded)؛
--   والوقود والتعبئة خارج كتلة المدخلات وأساس الخلطة (in_basis، وactivate_recipe_version يستثنيهما من المجموع)؛ وتعديل الكثافة بعد
--   التفعيل لا يوقف الإنتاج (اللقطة)؛ وإعادة create_recipe وadd_production_input تعرف نتيجتها هي بالمحتوى (id_conflict)؛ ومدى الهدر
--   بالنسبة المضبوطة (private.shrink_ok)؛ والناتج لا يولد منتهياً (output_expired)؛ وتقريب واحد للمخطّط؛ وسياسات نطاق الدفعة على
--   جداولها الخمسة وسجلّ تدقيقها؛ وأرقام المصاريف (المتاح وcosts_unfunded والتحميلات وتلميح expense_overloaded) لمن يرى وحدة مخزن
--   المدخلات وحده، والترحيل نفسه مسموح للمحصور بمخزن (التحميل يكتبه النظام)؛ وآخر شراء ومتوسّط المتاح من مخازن نطاق القارئ؛
--   وnew_recipe_version تنسخ النسخة المفعَّلة بسطورها ومعدّلاتها؛ وitem_purchases يزيد last_production؛ والمعاينة تسمّي وحدة مخزن
--   المدخلات؛ وبطاقة الدفعة المرحَّلة تقول من أيّ وجبات سُحب كلّ سطر (draws).
-- مراجعة 0016 الثانية (scratchpad/mill2/fixes2.md القسم أ، ق٢١–ق٢٧): من يحدّد مبلغاً يُحمَّل من مصاريف وحدة مخزن المدخلات أو يختمه يرى
--   تلك الوحدة (حارس سطر الكلفة وحذفه والختم: out_of_scope)، والمحصور بمخزن يرحّل بعد الختم فقط (costs_unsealed_scope)، ولا تقول له
--   المعاينة costs_unfunded قبل الختم (كان يستخرج المتاح بالفلس بالتنصيف عليها وعلى الختم)، وexpenses_visible على جذر المعاينة وبطاقة
--   الدفعة؛ و«داخل الكتلة» لقطة على سطر الخلطة عند التفعيل (recipe_lines.in_basis، مثل الكثافة: تصحيح نوع المادّة بعده لا يكسر
--   verify_mill ولا ينقص كتلة دفعة جديدة)؛ ودفعة بلا مادّة داخل الكتلة مشكلة مسمّاة (no_mass_inputs) لا خطأ قيد خام؛ والدفعة تُقرأ من
--   طرفيها كالتحويل (سياسة production_batches_read وسجلّ التدقيق وproduction_detail بمفتاح scope، وعدّ دفعات الخلطة في لوحة المعمل
--   بنطاق القارئ)، والكتابة كلّها تبقى بمخزن المدخلات؛ واسم فئة المصروف لا يتكرّر في المنشأة (expense_categories_name_guard،
--   category_name_taken).
-- مراجعة 0016 الثالثة (scratchpad/mill2/fixes3.md القسم أ، ق٣١–ق٣٧): وحدة أساس المادّة لقطة ثالثة على سطر الخلطة عند التفعيل
--   (recipe_lines.base_unit، كالكثافة و«داخل الكتلة»؛ FOUNDATION القاعدة ٤ وE46): تصحيح وحدة مادّة بعد التفعيل (كاز أُنشئ بالكيلو ثمّ
--   صُحّح لتراً) لا يكسر verify_mill ولا يبقى خرقاً على نسخة مقاعدة، وcreate_production يرفض تلك النسخة item_changed فتُنشأ غيرها،
--   وrecipe_detail يقول unit_changed، والملء من لقطة الكثافة (وحدة يوم التفعيل لا وحدة المادّة الآن)؛ وبطاقة الدفعة لا تُخرج وجبات مخزن
--   المواد واستلاماته لطرف الناتج وحده (draws = null، سابقة التحويل).
-- مراجعة 0016 الرابعة (scratchpad/mill2/fixes4.md القسم أ، ق٤١–ق٤٣): لا يرفض create_production إلّا ما لا تستطيع لقطة السطر تخطيطه (لقطة
--   كيلوغرام ومادّة صارت باللتر، أو مادّة صارت قطعة)، فلقطة لتر ومادّة صُحّحت كيلوغراماً تُخطَّط بالكيلو من لقطة الكثافة، وrecipe_detail.unit_changed
--   بالشرط نفسه، وnew_recipe_version تنسخ سطر اللتر لمادّة صارت بالكيلو سطراً بالكيلوغرام بالكتلة نفسها؛ ولا يُفعَّل سطر مكتوب باللتر لمادّة ليست
--   باللتر (bad_recipe_unit قبل أيّ حساب، وverify_mill الفحص ٣ يمسك سطر لتر بلا لقطة كثافة)، والقرّاء (recipe_detail وrecipes_overview وفرع
--   الأساس في التراجع) يحسبون كتلة السطر بـprivate.recipe_line_kg_or_null فلا يُسقط سطر واحد لوحة المعمل كلّها، وrecipe_detail يزيد
--   unit_mismatch لكلّ سطر.
-- مراجعة 0016 الخامسة (scratchpad/mill2/fixes5.md القسم أ، ق٥١–ق٥٥): recipe_detail يزيد density_missing لكلّ سطر (سائل بلا كثافة، وهو ما يرفض
--   التفعيل لأجله density_required، فتسمّيه البطاقة قبل النقر)؛ وverify_mill الفحص ٢ يجمع بالمساعد الذي لا يرمي، وكتلة سطر داخل الكتلة لا تُحسب
--   خرق يُعدّ لا رمية تُسقط الثوابت كلّها؛ وكلفة الطنّ المتوقّعة (private.recipe_expected) تحوّل سطر اللتر لمادّة صارت بالكيلو بلقطة كثافته وتسعّره
--   بسعر الكيلو كما يخطّطه create_production، لا «بلا سعر»؛ وnew_recipe_version لا تنسخ سطر مادّة صارت قطعة وتسمّيها في skipped، فلا تبقى خلطة
--   لا يُنتَج بها ولا تُنسخ. والتراجع لا يتغيّر (يرجّع verify_mill وrecipe_detail كما في 0015، ويُسقط recipe_expected وnew_recipe_version).
-- تراجع: rollback_0016.sql — يرجّع أجسام set_item_sell_price وitem_purchases (كما في 0014) وdelete_draft_line ودوالّ المعمل
--   الثماني وactivate_recipe_version وconfirm_production_costs وrecipe_lines_guard وسياسة production_batches_read (كما في 0015)
--   وvoid_expense وreport_expenses (كما في 0008) وverify_stock (كما في 0010) حرفاً بحرف، ويُسقط الجداول الثلاثة ودوالّها
--   وnew_recipe_version وshrink_ok وrecipe_line_kg_or_null وسياسات نطاق الدفعة على جداول 0015 وسجلّ التدقيق ومحفّز اسم فئة المصروف ودالّته، وأعمدة cost_price
--   وreplaced_item_id وrecipe_lines.in_basis وrecipe_lines.base_unit ويعيد sell_price غير قابل للفراغ. **طريق رفض**: أيّ معدّل تكاليف بخلطة، أو سطر تكاليف
--   أو تحميل أو مادّة بديلة بدفعة، أو سعر كلفة مكتوب، يوقف التراجع بصوت بلا أن يحذف شيئاً (أرقام كتبها المالك بيده وكلفة دفعات لا
--   تُستخرج من مكان آخر)؛ وكذلك نسخة خلطة غير مسوّدة لا يساوي مجموعُ كلّ سطورها أساسَها (الوقود أو التعبئة خارج كتلتها، أو سطر
--   باللتر بلا كثافة لا تُحسب كتلته، ففحص 0015 الثاني يرفضها بعد التراجع)، ونسخة غير مسوّدة فيها مادّة صارت باللتر بعد تفعيلها بالكيلو (فحص 0015 الثالث يقرأ الوحدة الحيّة).
-- تنعاد بأمان: create table if not exists، وadd column if not exists، وcreate or replace، وكتل do تفحص الكتالوج قبل القيود والسياسات.

set lock_timeout = '5s';

-- ─── أ. سعر الكلفة المكتوب (D1): عمود على جدول الأسعار (functionOnly وcostRestricted منذ 0014) ─────────────────────────
-- للتخطيط فقط (كلفة الطنّ المتوقّعة في الخلطة)؛ قيمة دفعة الناتج من السحب الحقيقي والكلف المحمَّلة (القاعدة ٢١). سعر البيع
-- يصير قابلاً للفراغ لصفّ فيه سعر الكلفة وحده، والصفّ بلا السعرين لا يبقى (القيد، والدالّتان تحذفانه حين يفرغان معاً).
alter table public.item_prices add column if not exists cost_price numeric;
alter table public.item_prices alter column sell_price drop not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.item_prices'::regclass and conname = 'item_prices_cost_price_check') then
    alter table public.item_prices add constraint item_prices_cost_price_check
      check (cost_price is null or (abs(cost_price) < 'Infinity' and cost_price > 0 and cost_price = round(cost_price, 2)));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.item_prices'::regclass and conname = 'item_prices_some_price_check') then
    alter table public.item_prices add constraint item_prices_some_price_check check (sell_price is not null or cost_price is not null);
  end if;
end
$$;

-- ─── ب-1. تكاليف الخلطة لكلّ طنّ (D2، D3): مبلغ بفئة مصروف على نسخة مسوّدة، ويتجمّد بتفعيلها ─────────────────────────
create table if not exists public.recipe_cost_rates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  version_id uuid not null,
  line_no int not null,
  category_id uuid not null,
  amount_per_ton numeric not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint recipe_cost_rates_amount_check check (abs(amount_per_ton) < 'Infinity' and amount_per_ton > 0 and amount_per_ton = round(amount_per_ton, 2)),
  constraint recipe_cost_rates_line_no_check check (line_no >= 1),
  unique (org_id, id),
  unique (org_id, version_id, line_no),
  -- فئة مرّة واحدة في النسخة، والحارس يسمّيها قبل أن يصل القيد.
  unique (org_id, version_id, category_id),
  foreign key (org_id, version_id) references public.recipe_versions (org_id, id),
  foreign key (org_id, category_id) references public.expense_categories (org_id, id)
);
create index if not exists recipe_cost_rates_category on public.recipe_cost_rates (org_id, category_id);

-- ─── ب-2. سطور تكاليف الدفعة (القاعدة ٢٠): جدول مال مسوّدة (FOUNDATION ٥٢٦ يسمّيه) ─────────────────────────────────
-- سطر الخلطة يكتبه create_production بمبلغه المحسوب (planned_amount = amount)، واليدوي يضيفه دور الكلفة بلا محسوب؛ والمبلغ
-- يُعدَّل في المسوّدة، وكلّ إضافة أو تعديل أو حذف يفرّغ ختم الكلف (FOUNDATION ٥٦٠). فئة مرّة واحدة في الدفعة: المتاح من مصاريفها
-- لسطر واحد، فلا يتقاسمه سطران في المعاينة والترحيل.
create table if not exists public.production_costs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  batch_id uuid not null,
  line_no int not null,
  category_id uuid not null,
  planned_amount numeric,
  amount numeric not null,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint production_costs_planned_check check (planned_amount is null or (abs(planned_amount) < 'Infinity' and planned_amount >= 0 and planned_amount = round(planned_amount, 2))),
  constraint production_costs_amount_check check (abs(amount) < 'Infinity' and amount >= 0 and amount = round(amount, 2)),
  constraint production_costs_source_check check (source in ('recipe', 'manual')),
  -- سطر الخلطة بمبلغه المحسوب منها، واليدوي بلا محسوب.
  constraint production_costs_planned_source_check check ((source = 'recipe') = (planned_amount is not null)),
  constraint production_costs_line_no_check check (line_no >= 1),
  unique (org_id, id),
  unique (org_id, batch_id, line_no),
  unique (org_id, batch_id, category_id),
  foreign key (org_id, batch_id) references public.production_batches (org_id, id),
  foreign key (org_id, category_id) references public.expense_categories (org_id, id)
);
create index if not exists production_costs_category on public.production_costs (org_id, category_id);

-- ─── ب-3. تحميل سطر الكلفة من المصاريف (القاعدة ٢٠): يكتبه الترحيل وحده، ويوقفه الإلغاء (voided_at) ─────────────────────
create table if not exists public.production_cost_allocations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  cost_id uuid not null,
  batch_id uuid not null,
  expense_id uuid not null,
  amount numeric not null,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint production_cost_allocations_amount_check check (abs(amount) < 'Infinity' and amount > 0 and amount = round(amount, 2)),
  unique (org_id, id),
  unique (org_id, cost_id, expense_id),
  foreign key (org_id, cost_id) references public.production_costs (org_id, id),
  foreign key (org_id, batch_id) references public.production_batches (org_id, id),
  foreign key (org_id, expense_id) references public.expenses (org_id, id)
);
create index if not exists production_cost_allocations_batch on public.production_cost_allocations (org_id, batch_id);
create index if not exists production_cost_allocations_expense on public.production_cost_allocations (org_id, expense_id);

-- ─── ب-4. المادّة البديلة تحفظ ما حلّت محلّه (القاعدة ١٩) ────────────────────────────────────────────────────────────
alter table public.production_inputs add column if not exists replaced_item_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.production_inputs'::regclass and conname = 'production_inputs_replaced_item_fkey') then
    alter table public.production_inputs add constraint production_inputs_replaced_item_fkey
      foreign key (org_id, replaced_item_id) references public.items (org_id, id);
  end if;
end
$$;
create index if not exists production_inputs_replaced_item on public.production_inputs (org_id, replaced_item_id);

-- ─── ب-5. «داخل الكتلة» لقطة على سطر الخلطة (مراجعة 0016 الثانية #2 و#5؛ FOUNDATION القاعدة ٤ مثل لقطة الكثافة) ──────────
-- يكتبه activate_recipe_version وحده من نوع المادّة لحظة التفعيل (الحارس يفرّغه عند الإدراج، والعمود غير ممنوح لأحد). نوع المادّة يبقى
-- قابلاً للتغيير ما دامت بلا حركة مخزون، وكان الأساس يُحسب من النوع الحيّ، فتصحيحه بعد التفعيل يكسر verify_mill وينقص كتلة كلّ دفعة
-- جديدة من النسخة بصمت. والمسوّدة بلا لقطة (فارغ)، فقرّاؤها يقرأون النوع الحيّ.
alter table public.recipe_lines add column if not exists in_basis boolean;
-- ووحدة أساس المادّة لقطة ثالثة بالقاعدة نفسها (مراجعة 0016 الثالثة #2، ق٣١؛ FOUNDATION القاعدة ٤ وE46): الوحدة كالنوع تتغيّر ما دامت المادّة
-- بلا حركة مخزون، فكاز أُنشئ بالكيلو ودخل خلطة مفعَّلة ثمّ صُحّح لتراً كان يكسر verify_mill كسراً لا يزول (الفحص الثالث يقرأ الوحدة الحيّة لكلّ
-- نسخة غير مسوّدة) وتُخطَّط دفعات النسخة بكثافة المادّة الحالية. يكتبها activate_recipe_version وحده مع اللقطتين الأخريين، والحارس يفرّغها
-- عند الإدراج، ولا منح.
alter table public.recipe_lines add column if not exists base_unit text;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.recipe_lines'::regclass and conname = 'recipe_lines_base_unit_check') then
    alter table public.recipe_lines add constraint recipe_lines_base_unit_check check (base_unit is null or base_unit in ('kg', 'L'));
  end if;
end
$$;

create or replace trigger audit_recipe_cost_rates after insert or update or delete on public.recipe_cost_rates
  for each row execute function private.audit_row();
create or replace trigger audit_production_costs after insert or update or delete on public.production_costs
  for each row execute function private.audit_row();
create or replace trigger audit_production_cost_allocations after insert or update or delete on public.production_cost_allocations
  for each row execute function private.audit_row();

-- ─── ج. RLS والامتيازات ─────────────────────────────────────────────────────────────────────────────────────────
-- الجداول الثلاثة مال: قراءة المنشأة وفوقها سياسة الكلفة المقيِّدة (§٢.٨، E2)، فمشغّل المعمل والأمين والمشاهد لا يقرأون صفّاً منها.
-- والكتابة المباشرة: المعدّل بفعل recipe.activate، وسطر الكلفة بفعل costs.load؛ والتحميل لا يكتبه إلّا الترحيل والإلغاء.
alter table public.recipe_cost_rates enable row level security;
alter table public.production_costs enable row level security;
alter table public.production_cost_allocations enable row level security;

do $$
declare
  t text;
  v_rate text := 'org_id = (select public.auth_org()) and (select public.can(''recipe.activate''))';
  v_cost text := 'org_id = (select public.auth_org()) and (select public.can(''costs.load''))';
begin
  foreach t in array array['recipe_cost_rates', 'production_costs', 'production_cost_allocations'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_read') then
      execute format('create policy %I on public.%I for select to authenticated using (org_id = (select public.auth_org()))', t || '_read', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_cost_only') then
      execute format('create policy %I on public.%I as restrictive for select to authenticated using ((select public.can_see_cost()))', t || '_cost_only', t);
    end if;
  end loop;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_cost_rates' and policyname = 'recipe_cost_rates_insert') then
    execute format('create policy recipe_cost_rates_insert on public.recipe_cost_rates for insert to authenticated with check (%s)', v_rate);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipe_cost_rates' and policyname = 'recipe_cost_rates_update') then
    execute format('create policy recipe_cost_rates_update on public.recipe_cost_rates for update to authenticated using (%s) with check (%s)', v_rate, v_rate);
  end if;
  -- سطر الكلفة بلا مخزن عليه: الحارس يفحص نطاق مخزن مدخلات دفعته تحت قفلها (مثل سطور الدفعة).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'production_costs' and policyname = 'production_costs_insert') then
    execute format('create policy production_costs_insert on public.production_costs for insert to authenticated with check (%s)', v_cost);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'production_costs' and policyname = 'production_costs_update') then
    execute format('create policy production_costs_update on public.production_costs for update to authenticated using (%s) with check (%s)', v_cost, v_cost);
  end if;
end
$$;

-- نطاق القراءة لجداول الدفعة وسجلّ تدقيقها (مراجعة 0016، #11؛ E49 ودرس حقول اللحم والبيض: سياسات القراءة بالنطاق نفسه لكلّ جدول،
-- لا دوالّ القراءة وحدها): سطور الدفعة ومالها وتكاليفها وتحميلاتها مقيَّدة بدفعة يقرأها القارئ (سياسة قراءة production_batches
-- بطرفيها تنطبق داخل الاستعلام، مراجعة 0016 الثانية #7)، والتحميل كذلك بمصروف يقرأه (expenses_read بنطاق الوحدة)؛ وسجلّ التدقيق
-- يحمل الصفّ كلّه، فصفوفه بالقاعدة نفسها (الدفعات لا تُحذف أبداً: discard_draft يجعلها void، فسجلّ سطر محذوف يجد دفعته).
do $$
declare
  t text;
begin
  foreach t in array array['production_inputs', 'production_values', 'production_input_values', 'production_costs', 'production_cost_allocations'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_batch_scope') then
      execute format('create policy %I on public.%I as restrictive for select to authenticated using (exists (select 1 from public.production_batches b where b.org_id = %I.org_id and b.id = %I.batch_id))',
        t || '_batch_scope', t, t, t);
    end if;
  end loop;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'production_cost_allocations' and policyname = 'production_cost_allocations_expense_scope') then
    create policy production_cost_allocations_expense_scope on public.production_cost_allocations as restrictive for select to authenticated
      using (exists (select 1 from public.expenses x where x.org_id = production_cost_allocations.org_id and x.id = production_cost_allocations.expense_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'audit_log_mill_scope') then
    -- الدفعة بطرفيها كسياسة قراءتها (مراجعة 0016 الثانية #7)، وسطورها ومالها بدفعة يقرأها القارئ.
    create policy audit_log_mill_scope on public.audit_log as restrictive for select to authenticated
      using (case
        when table_name = 'production_batches' then public.in_scope_wh((coalesce("new", "old") ->> 'input_warehouse_id')::uuid)
          or public.in_scope_wh((coalesce("new", "old") ->> 'output_warehouse_id')::uuid)
        when table_name in ('production_inputs', 'production_values', 'production_input_values', 'production_costs') then exists (
          select 1 from public.production_batches b where b.org_id = audit_log.org_id and b.id = (coalesce("new", "old") ->> 'batch_id')::uuid)
        when table_name = 'production_cost_allocations' then exists (
          select 1 from public.production_batches b where b.org_id = audit_log.org_id and b.id = (coalesce("new", "old") ->> 'batch_id')::uuid)
          and exists (select 1 from public.expenses x where x.org_id = audit_log.org_id and x.id = (coalesce("new", "old") ->> 'expense_id')::uuid)
        else true
      end);
  end if;
end
$$;

-- الدفعة تُقرأ من طرفيها كالتحويل (مراجعة 0016 الثانية #7 و#15، سابقة transfers_read في 0007): طرفاها مخزن المواد ومخزن العلف، ومن
-- نطاقه أحدهما يقرؤها؛ فرابط «صُنعت في المعمل» في بطاقة العلف (item_purchases بنطاق مخزن الناتج) يفتح دفعته لأمين العلف ومحاسبه، وكان
-- يفتح out_of_scope. سياسات نطاق الدفعة على جداولها تتبعها (exists على production_batches)، والكتابة كلّها تبقى بنطاق مخزن المدخلات
-- (stock_wh(…, true) وسياسة التعديل)، وقائمة دفعات المعمل (productions_overview) بنطاقه كذلك. تُسقط وتُنشأ، فتنعاد بأمان.
drop policy if exists production_batches_read on public.production_batches;
create policy production_batches_read on public.production_batches for select to authenticated
  using (org_id = (select public.auth_org()) and ((select public.in_scope_wh(input_warehouse_id)) or (select public.in_scope_wh(output_warehouse_id))));

revoke all on table public.recipe_cost_rates, public.production_costs, public.production_cost_allocations from anon, authenticated;
grant select on table public.recipe_cost_rates, public.production_costs, public.production_cost_allocations to authenticated;
-- المعرّف يولد بالجهاز (FOUNDATION ١٩٩): حفظ يُعاد بعد جواب ضاع يرجع 23505 بدل صفّ ثانٍ.
grant insert (id, version_id, category_id, amount_per_ton) on public.recipe_cost_rates to authenticated;
grant update (amount_per_ton) on public.recipe_cost_rates to authenticated;
-- source وplanned_amount غير ممنوحين: سطر الخلطة (source = 'recipe') لا يكتبه إلّا create_production (الحدّ هو المنح، درس 0015).
grant insert (id, batch_id, category_id, amount) on public.production_costs to authenticated;
grant update (amount) on public.production_costs to authenticated;
revoke truncate on table public.recipe_cost_rates, public.production_costs, public.production_cost_allocations from service_role;

-- ─── د. حرّاس الكتابة المباشرة ──────────────────────────────────────────────────────────────────────────────────
-- معدّل الخلطة: نسخته مقفولة ومسوّدة، والفعل، والفئة فعّالة وغير نظامية ومرّة واحدة، والمبلغ بمرتبتين، ورقم السطر التالي،
-- ونسخة النسخة تزيد (مثل سطر العليقة). الفئة والنسخة لا تتغيّران: يُحذف المعدّل ويُضاف غيره.
create or replace function private.recipe_cost_rates_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.recipe_versions;
  c public.expense_categories;
begin
  set local lock_timeout = '5s';
  -- الإعادة بالمعرّف نفسه بعد جواب ضاع (FOUNDATION ١٩٩: «الإعادة مأمونة»): المعدّل مكتوب، فالجواب 23505 كقيد المفتاح قبل أيّ فحص
  -- يسمّي شيئاً آخر (الفئة المكتوبة، أو النسخة التي فُعّلت بعده)، والشاشة تقرأ الصفّ بمعرّفه: المطلوب = انكتب.
  if tg_op = 'INSERT' and exists (select 1 from public.recipe_cost_rates x where x.id = new.id) then
    raise exception 'row_exists' using hint = 'هذا المعدّل محفوظ من قبل بمعرّفه؛ حدّث الشاشة.', errcode = 'unique_violation';
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - array['amount_per_ton']) is distinct from (to_jsonb(old) - array['amount_per_ton']) then
    raise exception 'frozen_column' using hint = 'يُعدَّل في المعدّل مبلغه فقط؛ لفئة أخرى احذفه وأضف غيره.';
  end if;
  select * into v from public.recipe_versions where org_id = new.org_id and id = new.version_id for update;
  if v.id is null then
    raise exception 'doc_not_found' using hint = 'هذه النسخة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if v.status <> 'draft' then
    raise exception 'not_draft' using hint = 'هذه النسخة مفعَّلة أو مقاعدة، فلا تُعدَّل تكاليفها. أنشئ نسخة جديدة وفعّلها.';
  end if;
  perform private.require('recipe.activate');
  if not public.can_see_cost() then
    raise exception 'forbidden' using hint = 'تكاليف الخلطة مبالغ، فهي لأدوار الكلفة فقط.';
  end if;
  if tg_op = 'INSERT' then
    select * into c from public.expense_categories where org_id = new.org_id and id = new.category_id for share;
    if c.id is null then
      raise exception 'category_not_found' using hint = 'هذه الفئة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
    end if;
    if c.archived_at is not null then
      raise exception 'category_archived' using hint = format('الفئة «%s» مؤرشفة؛ أعِدها من الأرشيف أو اختر فئة أخرى.', c.name);
    end if;
    if c.system_code is not null then
      raise exception 'system_expense' using hint = format('«%s» فئة نظامية يكتبها النظام بمستنداته؛ اختر فئة أخرى.', c.name);
    end if;
    if exists (select 1 from public.recipe_cost_rates r where r.org_id = new.org_id and r.version_id = new.version_id and r.category_id = new.category_id) then
      raise exception 'category_duplicated' using hint = format('«%s» مكتوبة في تكاليف الخلطة؛ عدّل مبلغها بدل إضافة سطر ثانٍ.', c.name);
    end if;
    new.line_no := coalesce((select max(r.line_no) from public.recipe_cost_rates r where r.org_id = v.org_id and r.version_id = v.id), 0) + 1;
  end if;
  if new.amount_per_ton is null or not (abs(new.amount_per_ton) < 'Infinity') or new.amount_per_ton <= 0 then
    raise exception 'amount_not_positive' using hint = 'مبلغ الكلفة لكلّ طنّ أكبر من صفر.';
  end if;
  if new.amount_per_ton = round(new.amount_per_ton, 2) then
    new.amount_per_ton := round(new.amount_per_ton, 2);
  end if;
  update public.recipe_versions set version = version + 1 where org_id = v.org_id and id = v.id;
  return new;
end
$$;

create or replace trigger recipe_cost_rates_guard before insert or update on public.recipe_cost_rates
  for each row execute function private.recipe_cost_rates_guard();

-- سطر الكلفة (FOUNDATION ٥٢٦): الدفعة مقفولة ومسوّدة، وفعل costs.load وسياسة الكلفة ونطاق مخزن المدخلات، والفئة فعّالة وغير
-- نظامية ومرّة واحدة؛ والإضافة سطر يدوي بلا محسوب. وكلّ إضافة أو تغيير مبلغ يفرّغ ختم الكلف (FOUNDATION ٥٦٠)، ونسخة الدفعة تزيد.
-- سطر الخلطة (source = 'recipe') لا يأتي إلّا من create_production: العمود غير ممنوح لأحد، وcurrent_user داخل محفّز definer هو
-- مالك الدالّة لا المستخدم، فالحدّ هو المنح (درس 0015).
create or replace function private.production_costs_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d public.production_batches;
  c public.expense_categories;
  v_div uuid;
begin
  set local lock_timeout = '5s';
  if tg_op = 'INSERT' and new.source = 'recipe' then
    return new;
  end if;
  -- الإعادة بالمعرّف نفسه بعد جواب ضاع (FOUNDATION ١٩٩: «الإعادة مأمونة»): السطر مكتوب، فالجواب 23505 كقيد المفتاح قبل أيّ فحص
  -- يسمّي شيئاً آخر (الفئة المكتوبة، أو الدفعة التي رُحّلت بعده)، والشاشة تقرأ الصفّ بمعرّفه: المطلوب = انكتب.
  if tg_op = 'INSERT' and exists (select 1 from public.production_costs x where x.id = new.id) then
    raise exception 'row_exists' using hint = 'هذا السطر محفوظ من قبل بمعرّفه؛ حدّث الشاشة.', errcode = 'unique_violation';
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - array['amount']) is distinct from (to_jsonb(old) - array['amount']) then
    raise exception 'frozen_column' using hint = 'يُعدَّل في سطر الكلفة مبلغه فقط؛ الفئة والمحسوب من الخلطة يكتبهما الخادم.';
  end if;
  select * into d from public.production_batches where org_id = new.org_id and id = new.batch_id for update;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذه الدفعة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'الدفعة مرحَّلة أو ملغاة؛ لا تُعدَّل تكاليفها.';
  end if;
  perform private.require('costs.load');
  if not public.can_see_cost() then
    raise exception 'forbidden' using hint = 'تكاليف الدفعة مبالغ، فهي لأدوار الكلفة فقط.';
  end if;
  if not public.in_scope_wh(d.input_warehouse_id) then
    raise exception 'out_of_scope' using hint = 'مخزن مدخلات هذه الدفعة خارج نطاقك.';
  end if;
  -- من يحدّد مبلغاً يُحمَّل من مصاريف وحدة مخزن المدخلات يرى تلك الوحدة (مراجعة 0016 الثانية #0، ق٢١): المحصور بمخزن بلا وحدته كان
  -- يكتب المبلغ ثمّ يقرأ costs_unfunded من المعاينة أو expense_overloaded من الختم صحّاً أو خطأً، فيستخرج بالتنصيف المتاح المحجوب عنه.
  -- سطر الخلطة من create_production عبر فوق (source = 'recipe').
  select w.division_id into v_div from public.warehouses w where w.org_id = d.org_id and w.id = d.input_warehouse_id;
  if not public.in_scope_division(v_div) then
    raise exception 'out_of_scope' using hint = format('تكاليف هذه الدفعة تُحمَّل من مصاريف وحدة «%s» خارج نطاقك، فيكتبها ويختمها محاسب أو مدير يرى تلك الوحدة.',
      (select dv.name from public.divisions dv where dv.org_id = d.org_id and dv.id = v_div));
  end if;
  if tg_op = 'INSERT' then
    select * into c from public.expense_categories where org_id = new.org_id and id = new.category_id for share;
    if c.id is null then
      raise exception 'category_not_found' using hint = 'هذه الفئة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
    end if;
    if c.archived_at is not null then
      raise exception 'category_archived' using hint = format('الفئة «%s» مؤرشفة؛ أعِدها من الأرشيف أو اختر فئة أخرى.', c.name);
    end if;
    if c.system_code is not null then
      raise exception 'system_expense' using hint = format('«%s» فئة نظامية يكتبها النظام بمستنداته؛ اختر فئة أخرى.', c.name);
    end if;
    if exists (select 1 from public.production_costs x where x.org_id = new.org_id and x.batch_id = new.batch_id and x.category_id = new.category_id) then
      raise exception 'category_duplicated' using hint = format('«%s» مكتوبة في تكاليف الدفعة؛ عدّل مبلغها بدل إضافة سطر ثانٍ.', c.name);
    end if;
    new.source := 'manual';
    new.planned_amount := null;
    new.line_no := coalesce((select max(x.line_no) from public.production_costs x where x.org_id = d.org_id and x.batch_id = d.id), 0) + 1;
  end if;
  if new.amount is null or not (abs(new.amount) < 'Infinity') or new.amount < 0 then
    raise exception 'amount_required' using hint = 'اكتب مبلغ الكلفة رقماً لا يقلّ عن صفر.';
  end if;
  if new.amount = round(new.amount, 2) then
    new.amount := round(new.amount, 2);
  end if;
  if tg_op = 'INSERT' then
    update public.production_batches set costs_confirmed_at = null, costs_confirmed_by = null, version = version + 1
    where org_id = d.org_id and id = d.id;
  elsif new.amount is distinct from old.amount then
    update public.production_batches set costs_confirmed_at = null, costs_confirmed_by = null, version = version + 1
    where org_id = d.org_id and id = d.id;
  else
    update public.production_batches set version = version + 1 where org_id = d.org_id and id = d.id;
  end if;
  return new;
end
$$;

create or replace trigger production_costs_guard before insert or update on public.production_costs
  for each row execute function private.production_costs_guard();

-- سطر العليقة (0015) على جسمه حرفاً، إلّا أنّ «داخل الكتلة» لقطة ثانية كالكثافة (مراجعة 0016 الثانية #2 و#5): عمود غير ممنوح لأحد،
-- فتغيّره لا يكون إلّا من دالّة التفعيل (حدّها المنح لا current_user)، والإدراج يفرّغه كما يفرّغ لقطة الكثافة. ووحدة أساس المادّة لقطة ثالثة
-- بالقاعدة نفسها (مراجعة 0016 الثالثة #2 و#4، ق٣١ وق٣٥)، وتغيّرها وحدها يمرّ كذلك (جملة الملء بالهجرة تكتبها وحدها).
create or replace function private.recipe_lines_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.recipe_versions;
  i public.items;
begin
  set local lock_timeout = '5s';
  -- لقطات الكثافة و«داخل الكتلة» ووحدة الأساس أعمدة غير ممنوحة لأحد، فتغيّرها لا يكون إلا من دالّة التفعيل أو الملء بالهجرة (حدّها المنح لا
  -- current_user).
  if tg_op = 'UPDATE' and (new.density_kg_per_l is distinct from old.density_kg_per_l or new.in_basis is distinct from old.in_basis
    or new.base_unit is distinct from old.base_unit) then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.version_id is distinct from old.version_id then
    raise exception 'frozen_column' using hint = 'السطر يبقى في نسخته.';
  end if;
  select * into v from public.recipe_versions where org_id = new.org_id and id = new.version_id for update;
  if v.id is null then
    raise exception 'doc_not_found' using hint = 'هذه النسخة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if v.status <> 'draft' then
    raise exception 'not_draft' using hint = 'هذه النسخة مفعَّلة أو مقاعدة، فلا تُعدَّل سطورها. أنشئ نسخة جديدة وفعّلها.';
  end if;
  perform private.require('recipe.activate');
  select * into i from public.items where org_id = new.org_id and id = new.item_id;
  if i.id is null or i.archived_at is not null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك أو مؤرشفة. حدّث الشاشة واختر من جديد.';
  end if;
  -- النسخة الأولى: العليقة بالكتلة، فمادّة وحدتها «قطعة» (كيس، معدّة) لا تدخل سطراً. الأكياس مدخل إضافي في النسخة الثانية.
  if i.base_unit not in ('kg', 'L') then
    raise exception 'bad_recipe_unit' using hint = format('«%s» وحدتها قطعة، والعليقة تُحسب بالكتلة: لا تدخل في الخلطة بهذه النسخة.', i.name);
  end if;
  if new.unit = 'L' and i.base_unit <> 'L' then
    raise exception 'bad_recipe_unit' using hint = format('«%s» تُقاس بالكيلوغرام، فاكتب كميتها في الخلطة بالكيلوغرام.', i.name);
  end if;
  if new.unit = 'L' and i.density_kg_per_l is null then
    raise exception 'density_required' using hint = format('«%s» سائل بلا كثافة، فلا يُحسب وزنه في الخلطة. اكتب كثافته في بطاقة المادّة أوّلاً.', i.name);
  end if;
  -- مادّة مرّتين في نسخة واحدة (FOUNDATION ٥٥٨): تُسمّى هنا قبل أن يصل القيد الفريد برسالته الخام. النسخة مقفولة فوق.
  if exists (select 1 from public.recipe_lines l where l.org_id = new.org_id and l.version_id = new.version_id and l.item_id = new.item_id and l.id <> new.id) then
    raise exception 'item_duplicated' using hint = format('«%s» مكتوبة في الخلطة مرّتين. عدّل كميتها بدل إضافة سطر ثانٍ.', i.name);
  end if;
  if new.qty = round(new.qty, 3) then
    new.qty := round(new.qty, 3);
  end if;
  if tg_op = 'INSERT' then
    new.density_kg_per_l := null;
    new.in_basis := null;
    new.base_unit := null;
    new.line_no := coalesce((select max(l.line_no) from public.recipe_lines l where l.org_id = v.org_id and l.version_id = v.id), 0) + 1;
  else
    new.line_no := old.line_no;
  end if;
  update public.recipe_versions set version = version + 1 where org_id = v.org_id and id = v.id;
  return new;
end
$$;

-- ملء القائم بجملتين بعد الحارس الجديد (يمرّ تغيير اللقطة؛ والقديم يرفض تغيير سطر نسخة غير مسوّدة إلّا كثافتها: not_draft). نسخ 0015 غير
-- المسوّدة عدّت سطورها كلّها في الأساس (فحصها الثاني يجمع كلّ السطور)، فلقطتها «داخل الكتلة». ووحدة الأساس يوم التفعيل من لقطة الكثافة
-- نفسها (مراجعة 0016 الثالثة، ق٣١): التفعيل في 0015 و0016 يكتب الكثافة لسطر مادّة باللتر وحده ويرفض لتراً بلا كثافة، والإدراج يفرّغها، فكثافة
-- محفوظة تعني «لتر» يوم التفعيل وغيابها «كيلوغرام»؛ لا وحدة المادّة الآن، فقد تكون صُحّحت بعده (سيناريو #2 نفسه، فيبقى الخرق) أو صارت قطعة
-- (فيرفضها القيد ويتوقّف التطبيق). وتنعاد بأمان (لا فراغ بعد أوّل مرّة). الإنتاج اليوم بلا نسخة غير مسوّدة (قيس 2026-11-04)، ومشغّل التراجع
-- يمرّ بهما على بيانات: بذرة معمل، وخلطة تُفعَّل بدوالّ 0015 بين التراجع والإعادة (مراجعة 0016 الثالثة #3، ق٣٤).
update public.recipe_lines l set in_basis = true
from public.recipe_versions v
where v.org_id = l.org_id and v.id = l.version_id and v.status <> 'draft' and l.in_basis is null;
update public.recipe_lines l set base_unit = case when l.density_kg_per_l is not null then 'L' else 'kg' end
from public.recipe_versions v
where v.org_id = l.org_id and v.id = l.version_id and v.status <> 'draft' and l.base_unit is null;

-- اسم فئة المصروف لا يتكرّر في المنشأة (مراجعة 0016 الثانية، التكامل B1): الشاشة كانت تفحص التكرار على قائمتها وحدها، فيمرّ اسم فئة
-- مؤرشفة أو نظامية، واسم يكتبه جهازان معاً. الاسم المطبَّع (private.searchable: الهمزات والتشكيل وحالة اللاتيني والمسافات) يُقارن بفئات
-- المنشأة كلّها تحت قفل استشاري بالمعاملة على (المنشأة، الاسم المطبَّع)، فالجهاز الثاني ينتظر الأوّل ثمّ يرى فئته. بلا قيد فريد ولا مسّ
-- لبيانات قائمة. والإدراج النظامي يمرّ (system_code لا يكتبه إلّا الخادم: إدراج الواجهة الممنوح هو الاسم وحده): البذور تُزرع بـon conflict
-- do nothing، والمحفّز قبل الإدراج يجري حتّى للصفّ الذي يُطوى بالتعارض، فلو فُحص لرفضت إعادة الزرع نفسها.
create or replace function private.expense_categories_name_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_norm text;
  c public.expense_categories;
begin
  set local lock_timeout = '5s';
  if tg_op = 'INSERT' and new.system_code is not null then
    return new;
  end if;
  -- التعديل بلا تغيير الاسم لا يُفحص، والاسم الفارغ يرفضه قيده برسالته.
  if (tg_op = 'UPDATE' and new.name is not distinct from old.name) or btrim(coalesce(new.name, '')) = '' then
    return new;
  end if;
  v_norm := private.searchable(btrim(new.name));
  perform pg_advisory_xact_lock(hashtextextended('expense_category:' || new.org_id::text || ':' || v_norm, 0));
  -- إن تكرّر الاسم من قبل (بيانات قبل المحفّز) فالأنفع أوّلاً: فئة حيّة تُختار، ثمّ نظامية، ثمّ مؤرشفة تُعاد.
  select * into c from public.expense_categories x
  where x.org_id = new.org_id and x.id is distinct from new.id and private.searchable(btrim(x.name)) = v_norm
  order by x.archived_at is not null, x.system_code is not null, x.created_at, x.id
  limit 1;
  if c.id is not null then
    raise exception 'category_name_taken' using hint = case
      when c.archived_at is not null then format('توجد فئة «%s» مؤرشفة: أعِدها من الأرشيف بدل إنشاء أخرى.', c.name)
      when c.system_code is not null then format('«%s» اسم فئة نظامية يكتبها النظام؛ اختر اسماً آخر.', c.name)
      else format('توجد فئة «%s»: اخترها بدل إنشاء أخرى.', c.name) end;
  end if;
  return new;
end
$$;

create or replace trigger expense_categories_name_guard before insert or update of name on public.expense_categories
  for each row execute function private.expense_categories_name_guard();

-- ─── هـ. المساعدات ───────────────────────────────────────────────────────────────────────────────────────────────
-- مبلغ للتلميح بفواصل الآلاف، والفلس إن وُجد (الواجهة تعرض أرقاماً غربية بفواصل، قانون المالك للأرقام).
create or replace function private.money_text(p_amount numeric) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case when p_amount is null then null
    when p_amount = round(p_amount, 0) then to_char(p_amount, 'FM999,999,999,999,990')
    else to_char(p_amount, 'FM999,999,999,999,990.00') end
$$;

-- المتاح غير المحمَّل من المصاريف المؤهّلة لفئة في وحدة (القاعدة ٢٠): مصروف يدوي (نقداً أو بالدين) غير ملغى ومبلغه موجب،
-- ناقص تحميلاته الفعّالة. بلا قفل (المعاينة)؛ والترحيل يعيد الحساب نفسه تحت قفل صفوف المصاريف.
create or replace function private.mill_expense_free(p_category uuid, p_division uuid) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select round(coalesce(sum(x.amount - coalesce((select sum(a.amount) from public.production_cost_allocations a
      where a.org_id = x.org_id and a.expense_id = x.id and a.voided_at is null), 0)), 0), 2)
  from public.expenses x
  where x.org_id = public.auth_org() and x.category_id = p_category and x.division_id = p_division and x.reverses_id is null and x.amount > 0
    and x.source in ('cash', 'credit') and not exists (select 1 from public.expenses r where r.org_id = x.org_id and r.reverses_id = x.id)
$$;

-- سعر الشراء التلقائي (D1): كلفة وحدة الأساس في آخر سطر استلام مرحَّل للمادّة (الدفعة الجذر، بقيمتها بعد الخصم والتحميل
-- وتصحيح السعر)، مثل unit_cost في item_purchases، ومن مخازن نطاق القارئ وحدها كما فيه (مراجعة 0016 #13): المحصور بمخزن لا يرى
-- سعر استلام في مخزن خارج نطاقه، ولا يُحسب منه متوسّط المتاح في recipe_expected وrecipe_detail.
create or replace function private.item_last_price(p_item uuid) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select private._mul_div_round2(1, l.value_in, l.qty_in)
  from public.stock_lots l join public.receipts r on r.org_id = l.org_id and r.id = l.source_id
  where l.org_id = public.auth_org() and l.item_id = p_item and l.source_kind = 'receipt' and l.origin_lot_id is null and r.status = 'posted'
    and l.qty_in > 0 and public.in_scope_wh(l.warehouse_id)
  order by l.received_on desc, l.fifo_seq desc, l.id desc
  limit 1
$$;

-- كلفة الطنّ المتوقّعة لنسخة خلطة (D1، للتخطيط لا لقيمة مخزون): سعر كلّ مادّة = سعر الكلفة المكتوب، وإلّا آخر شراء، وإلّا متوسّط
-- المتاح، وإلّا بلا سعر (unpriced عددها). كمية السطر بوحدة أساس المادّة (كيلو مكتوب لسائل يُحوَّل لتراً بالكثافة). كلفة المواد
-- للطنّ بضربة تقريب واحدة (Σ كمية × سعر × 1000 ÷ الأساس)، والمعدّلات كما هي، وكلفة الكيلو بضربة واحدة كذلك؛ وكلفة الكيلو
-- فارغة إن بقيت مادّة بلا سعر. ومراجعة 0016 الخامسة (التكامل، ق٥٤): سطر مكتوب باللتر لمادّة صارت بالكيلو يُحوَّل كيلوغراماً بلقطة كثافته
-- (liters_to_kg، الكتلة نفسها التي يخطّطها create_production منذ ق٤١) ويُسعَّر بسعر الكيلو؛ كان يُعدّ «بلا سعر» وسعره مكتوب، فتفرغ كلفة الكيلو في
-- لوحة المعمل وتقول البطاقة «اكتب سعر كلفتها». والكثافة هنا لقطة السطر (items_density_unit_check: لا كثافة لمادّة غير سائلة)، وبلاها (مسوّدة
-- سطرها unit_mismatch، أو حالة مجمَّدة بلا لقطة) يبقى السطر بلا سعر لا رمية تُسقط البطاقة واللوحة.
create or replace function private.recipe_expected(p_version uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v public.recipe_versions;
  ln record;
  v_price numeric;
  v_qty numeric;
  v_sum numeric := 0;
  v_unpriced int := 0;
  v_rates numeric;
  v_materials numeric;
begin
  select * into v from public.recipe_versions where org_id = public.auth_org() and id = p_version;
  if v.id is null then
    return null;
  end if;
  for ln in
    select l.item_id, l.qty, l.unit, i.base_unit, coalesce(l.density_kg_per_l, i.density_kg_per_l) as density, p.cost_price
    from public.recipe_lines l
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    left join public.item_prices p on p.org_id = l.org_id and p.item_id = l.item_id
    where l.org_id = v.org_id and l.version_id = v.id
    order by l.line_no
  loop
    v_price := coalesce(ln.cost_price, private.item_last_price(ln.item_id),
      (select private.per_unit(sum(s.value_left), sum(s.qty_left)) from public.stock_lots s
        where s.org_id = v.org_id and s.item_id = ln.item_id and s.qty_left > 0 and public.in_scope_wh(s.warehouse_id)));
    v_qty := case when ln.unit = ln.base_unit then ln.qty
      when ln.unit = 'kg' and ln.base_unit = 'L' and ln.density is not null then private.kg_to_liters(ln.qty, ln.density)
      when ln.unit = 'L' and ln.base_unit = 'kg' and ln.density is not null then private.liters_to_kg(ln.qty, ln.density) end;
    if v_price is null or v_qty is null then
      v_unpriced := v_unpriced + 1;
    else
      v_sum := v_sum + v_qty * v_price;
    end if;
  end loop;
  v_rates := coalesce((select sum(r.amount_per_ton) from public.recipe_cost_rates r where r.org_id = v.org_id and r.version_id = v.id), 0.00);
  v_materials := private._mul_div_round(1000, v_sum, v.basis_kg, 2);
  return jsonb_build_object('materials_per_ton', v_materials::text, 'rates_per_ton', v_rates::text,
    'cost_per_ton', (v_materials + v_rates)::text, 'unpriced', v_unpriced,
    'cost_per_kg', case when v_unpriced = 0 then private._mul_div_round(1, v_sum * 1000 + v_rates * v.basis_kg, v.basis_kg * 1000, 2)::text end);
end
$$;

-- الهدر داخل المدى المقبول بالنسبة المضبوطة (القاعدة ٢٢ حرفياً، مراجعة 0016 #6): صفر إلى ٣٪ من كتلة المدخلات بلا قسمة ولا تقريب
-- (الهدر × ١٠٠ ≤ ٣ × الكتلة). كانت المقارنة بالنسبة بعد تقريبها لمرتبتين، فهدر 3.004٪ يصير 3.00 والسالب الصغير 0.00 ويعبران بلا
-- سبب. shrink_pct للعرض وحده.
create or replace function private.shrink_ok(p_shrink numeric, p_mass numeric) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select coalesce(abs(p_shrink) < 'Infinity' and abs(p_mass) < 'Infinity' and p_mass > 0 and p_shrink >= 0 and p_shrink * 100 <= 3 * p_mass, false)
$$;

-- كتلة سطر الخلطة بالكيلو للقرّاء (مراجعة 0016 الرابعة #1، ق٤٢): recipe_line_kg نفسها، إلّا أنّ سطراً باللتر بلا كثافة صالحة يرجع فارغاً بدل أن
-- يرمي density_not_positive. بطاقة الخلطة ولوحة المعمل وفرع الأساس في rollback_0016 وverify_mill الفحص ٢ (مراجعة 0016 الخامسة #1، ق٥٢) تحسب بها
-- كلّ سطور النسخة، فسطر واحد كهذا (مادّة صُحّحت كيلوغراماً بعد كتابة سطرها باللتر) كان يُسقط البطاقة واللوحة كلّها لكلّ قارئ في المنشأة، والثوابت
-- كلّها لكلّ المنشآت. والكتابة (التفعيل والإنتاج) تبقى بالرامي.
create or replace function private.recipe_line_kg_or_null(p_qty numeric, p_unit text, p_density numeric) returns numeric
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case when p_unit = 'L' and (p_density is null or not (abs(p_density) < 'Infinity') or p_density <= 0) then null
    else private.recipe_line_kg(p_qty, p_unit, p_density) end
$$;

-- ─── و. سعر الكلفة المكتوب (D1): نسخة من set_item_sell_price بالصلاحية والقفل والشرط نفسها ────────────────────────
-- القفل على صفّ المادّة بـfor no key update (يسلسل كاتبَي السعرين معاً، ولا يتقافل مع مفاتيح item_prices، درس WP4)، والكتابة فوق
-- محفوظ مشروطة بالقيمة السابقة (درس WP5): المحفوظ = المطلوب ← انكتب (إعادة بعد جواب ضاع)، والمحفوظ ≠ p_expected ← price_changed.
-- والفارغ يشيل سعر الكلفة، والصفّ يُحذف حين يفرغ السعران معاً.
create or replace function public.set_item_cost_price(p_item uuid, p_price numeric, p_expected numeric) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  i public.items;
  v_cur numeric;
  v_sell numeric;
  v_row boolean;
begin
  set local lock_timeout = '5s';
  perform private.require('stores.manage');
  if not public.can_see_cost() then
    raise exception 'no_cost_access' using hint = 'سعر الكلفة مبلغ، ولا يراه دورك ولا يكتبه.';
  end if;
  if p_price is not null and not (abs(p_price) < 'Infinity' and p_price > 0 and p_price = round(p_price, 2)) then
    raise exception 'bad_price' using hint = 'سعر الكلفة أكبر من صفر، بمرتبتين عشريتين كحدّ أقصى.';
  end if;
  if p_expected is not null and not (abs(p_expected) < 'Infinity' and p_expected = round(p_expected, 2)) then
    raise exception 'bad_price' using hint = 'السعر السابق المرسل غير صالح. حدّث الشاشة.';
  end if;
  select * into i from public.items where org_id = v_org and id = p_item for no key update;
  if i.id is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if i.archived_at is not null then
    raise exception 'item_archived' using hint = 'المادّة مؤرشفة، فلا يُغيَّر سعر كلفتها. أعِدها أوّلاً.';
  end if;
  select r.cost_price, r.sell_price into v_cur, v_sell from public.item_prices r where r.org_id = v_org and r.item_id = p_item;
  v_row := found;
  if v_cur is not distinct from p_price then
    return jsonb_build_object('item_id', p_item, 'cost_price', p_price::text, 'written', false);
  end if;
  if v_cur is distinct from p_expected then
    raise exception 'price_changed' using hint = 'تغيّر سعر الكلفة من نافذة أو جهاز آخر بعد أن بدأت تعديله. حدّث الشاشة ثمّ أعِد الكتابة.';
  end if;
  if p_price is null and v_sell is null then
    delete from public.item_prices where org_id = v_org and item_id = p_item;
  elsif not v_row then
    insert into public.item_prices (org_id, item_id, cost_price) values (v_org, p_item, p_price);
  else
    update public.item_prices set cost_price = p_price, version = version + 1 where org_id = v_org and item_id = p_item;
  end if;
  return jsonb_build_object('item_id', p_item, 'cost_price', p_price::text, 'written', true);
end
$$;

-- ─── ز. بانية الخلطة بنداء واحد (كلمة المالك: «تطلعلي قائمة إنتاج كاملة») ──────────────────────────────────────────
-- معاملة واحدة: الخلطة ونسختها الأولى وسطورها ومعدّلات تكاليفها، وتفعيلها إن طُلب بمنطق activate_recipe_version نفسه (المجموع
-- بالكيلو = الأساس وإلّا basis_mismatch ويرجع كلّ شيء). الحرّاس القائمة هي من يفحص السطور والمعدّلات. والمعرّفان من الجهاز:
-- إعادة بالمعرّف نفسه والاسم والمنتج نفسيهما ترجّع الموجود (جواب ضاع)، وبغيرهما id_conflict.
create or replace function public.create_recipe(p_id uuid, p_version_id uuid, p_name text, p_output_item uuid, p_basis_kg numeric, p_lines jsonb,
  p_rates jsonb, p_activate boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  r public.recipes;
  v public.recipe_versions;
  v_name text;
  v_basis numeric := coalesce(p_basis_kg, 1000);
  e jsonb;
  v_n int := 0;
  v_item uuid;
  v_qty numeric;
  v_unit text;
  v_cat uuid;
  v_amount numeric;
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_number constant text := '^[0-9]+(\.[0-9]+)?$';
begin
  set local lock_timeout = '5s';
  perform private.require('recipe.activate');
  if p_id is null or p_version_id is null then
    raise exception 'id_required' using hint = 'تعذّر حفظ الخلطة دون معرّف. حدّث الشاشة وأعد المحاولة.';
  end if;
  v_name := private.check_name(p_name, 80, 'اسم الخلطة');
  -- المعرّف مقفول قبل فحصه (درس WP5 مع record_expense): نداءان بالمعرّف نفسه لا يعبران «غير موجود» معاً.
  perform pg_advisory_xact_lock(hashtextextended('recipe:' || p_id::text, 0));
  select * into r from public.recipes where id = p_id;
  if r.id is not null then
    if r.org_id is distinct from v_org or r.name is distinct from v_name or r.output_item_id is distinct from p_output_item then
      raise exception 'id_conflict' using hint = 'هذا المعرّف لخلطة أخرى. حدّث الشاشة وأعد الحفظ.';
    end if;
    select * into v from public.recipe_versions where id = p_version_id;
    if v.id is null or v.org_id is distinct from v_org or v.recipe_id is distinct from r.id then
      raise exception 'id_conflict' using hint = 'هذا المعرّف لنسخة خلطة أخرى. حدّث الشاشة وأعد الحفظ.';
    end if;
    -- الإعادة تعرف نتيجتها هي (درس WP5: «المطلوب = انكتب، وإلّا تعارض»، مراجعة 0016 #4): المحفوظ يطابق المرسَل الآن بالأساس
    -- والسطور بترتيبها (المادّة والكمية والوحدة) والمعدّلات بترتيبها (الفئة والمبلغ) وطلب التفعيل (التفعيل ⇔ مفعَّلة، وبلاه ⇔
    -- مسوّدة)؛ وإلّا فالمحفوظ غير ما يراه المستخدم، و«نجح» كان يُضيّع تعديله بصمت والخلطة المفعَّلة بسطوره القديمة.
    if v.basis_kg is distinct from v_basis
      or v.status is distinct from (case when coalesce(p_activate, false) then 'active' else 'draft' end)
      or (select coalesce(jsonb_agg(jsonb_build_array(l.item_id::text, trim_scale(l.qty)::text, l.unit) order by l.line_no), '[]'::jsonb)
          from public.recipe_lines l where l.org_id = v_org and l.version_id = v.id)
        is distinct from (select coalesce(jsonb_agg(jsonb_build_array(lower(x.value ->> 'item_id'),
            case when coalesce(x.value ->> 'qty', '') ~ v_number then trim_scale((x.value ->> 'qty')::numeric)::text else x.value ->> 'qty' end,
            coalesce(nullif(x.value ->> 'unit', ''), 'kg')) order by x.n), '[]'::jsonb)
          from jsonb_array_elements(case when jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) = 'array' then coalesce(p_lines, '[]'::jsonb)
            else '[null]'::jsonb end) with ordinality as x(value, n))
      or (select coalesce(jsonb_agg(jsonb_build_array(c.category_id::text, trim_scale(c.amount_per_ton)::text) order by c.line_no), '[]'::jsonb)
          from public.recipe_cost_rates c where c.org_id = v_org and c.version_id = v.id)
        is distinct from (select coalesce(jsonb_agg(jsonb_build_array(lower(x.value ->> 'category_id'),
            case when coalesce(x.value ->> 'amount_per_ton', '') ~ v_number then trim_scale((x.value ->> 'amount_per_ton')::numeric)::text
              else x.value ->> 'amount_per_ton' end) order by x.n), '[]'::jsonb)
          from jsonb_array_elements(case when jsonb_typeof(coalesce(p_rates, '[]'::jsonb)) = 'array' then coalesce(p_rates, '[]'::jsonb)
            else '[null]'::jsonb end) with ordinality as x(value, n)) then
      raise exception 'id_conflict' using hint = 'حُفظت هذه الخلطة بمحاولة سابقة بمحتوى غير الذي أرسلته الآن. افتحها لترى ما حُفظ.';
    end if;
    return jsonb_build_object('id', r.id, 'version_id', v.id, 'version_no', v.version_no, 'status', v.status,
      'lines', (select count(*)::int from public.recipe_lines l where l.org_id = v_org and l.version_id = v.id),
      'rates', (select count(*)::int from public.recipe_cost_rates c where c.org_id = v_org and c.version_id = v.id));
  end if;
  if exists (select 1 from public.recipe_versions x where x.id = p_version_id) then
    raise exception 'id_conflict' using hint = 'هذا المعرّف لنسخة خلطة أخرى. حدّث الشاشة وأعد الحفظ.';
  end if;
  if p_output_item is null then
    raise exception 'item_required' using hint = 'اختر مادّة الناتج (العلف الجاهز الذي تنتجه الخلطة).';
  end if;
  if not (abs(v_basis) < 'Infinity') or v_basis <= 0 or v_basis <> round(v_basis, 3) then
    raise exception 'bad_basis' using hint = 'أساس الخلطة بالكيلوغرام أكبر من صفر، بثلاث مراتب عشرية على الأكثر.';
  end if;
  if (p_lines is not null and jsonb_typeof(p_lines) <> 'array') or (p_rates is not null and jsonb_typeof(p_rates) <> 'array') then
    raise exception 'bad_lines' using hint = 'سطور الخلطة وتكاليفها قائمتان. حدّث الشاشة وأعد المحاولة.';
  end if;
  if exists (select 1 from public.recipes x where x.org_id = v_org and x.archived_at is null and x.name_norm = private.searchable(v_name)) then
    raise exception 'recipe_name_taken' using hint = format('توجد خلطة باسم «%s». اختر اسماً آخر أو افتح الخلطة الموجودة.', v_name);
  end if;
  insert into public.recipes (id, org_id, name, output_item_id) values (p_id, v_org, v_name, p_output_item) returning * into r;
  insert into public.recipe_versions (id, org_id, recipe_id, basis_kg) values (p_version_id, v_org, r.id, v_basis) returning * into v;
  for e in select x.value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) with ordinality as x(value, n) order by x.n loop
    v_n := v_n + 1;
    if jsonb_typeof(e) <> 'object' or coalesce(e ->> 'item_id', '') !~ v_uuid then
      raise exception 'item_required' using hint = format('السطر %s في الخلطة بلا مادّة. اختر المادّة أو احذف السطر.', v_n);
    end if;
    v_item := (e ->> 'item_id')::uuid;
    if coalesce(e ->> 'qty', '') !~ v_number then
      raise exception 'qty_not_positive' using hint = format('كمية «%s» في الخلطة رقم أكبر من صفر.',
        coalesce((select i.name from public.items i where i.org_id = v_org and i.id = v_item), format('السطر %s', v_n)));
    end if;
    v_qty := (e ->> 'qty')::numeric;
    if v_qty <= 0 or v_qty <> round(v_qty, 3) then
      raise exception 'qty_not_positive' using hint = format('كمية «%s» في الخلطة أكبر من صفر، بثلاث مراتب عشرية على الأكثر.',
        coalesce((select i.name from public.items i where i.org_id = v_org and i.id = v_item), format('السطر %s', v_n)));
    end if;
    v_unit := coalesce(nullif(e ->> 'unit', ''), 'kg');
    if v_unit not in ('kg', 'L') then
      raise exception 'bad_recipe_unit' using hint = 'وحدة سطر الخلطة كيلوغرام أو لتر.';
    end if;
    insert into public.recipe_lines (org_id, version_id, item_id, qty, unit) values (v_org, v.id, v_item, v_qty, v_unit);
  end loop;
  v_n := 0;
  for e in select x.value from jsonb_array_elements(coalesce(p_rates, '[]'::jsonb)) with ordinality as x(value, n) order by x.n loop
    v_n := v_n + 1;
    if jsonb_typeof(e) <> 'object' or coalesce(e ->> 'category_id', '') !~ v_uuid then
      raise exception 'category_required' using hint = format('سطر التكاليف %s بلا فئة. اختر فئة المصروف أو احذف السطر.', v_n);
    end if;
    v_cat := (e ->> 'category_id')::uuid;
    if coalesce(e ->> 'amount_per_ton', '') !~ v_number then
      raise exception 'amount_not_positive' using hint = format('مبلغ سطر التكاليف %s لكلّ طنّ رقم أكبر من صفر.', v_n);
    end if;
    v_amount := (e ->> 'amount_per_ton')::numeric;
    if v_amount <= 0 or v_amount <> round(v_amount, 2) then
      raise exception 'amount_not_positive' using hint = format('مبلغ سطر التكاليف %s لكلّ طنّ أكبر من صفر، بمرتبتين عشريتين على الأكثر.', v_n);
    end if;
    insert into public.recipe_cost_rates (org_id, version_id, category_id, amount_per_ton) values (v_org, v.id, v_cat, v_amount);
  end loop;
  if coalesce(p_activate, false) then
    perform public.activate_recipe_version(v.id, (select x.version from public.recipe_versions x where x.org_id = v_org and x.id = v.id));
  end if;
  select * into v from public.recipe_versions where org_id = v_org and id = v.id;
  return jsonb_build_object('id', r.id, 'version_id', v.id, 'version_no', v.version_no, 'status', v.status,
    'lines', (select count(*)::int from public.recipe_lines l where l.org_id = v_org and l.version_id = v.id),
    'rates', (select count(*)::int from public.recipe_cost_rates c where c.org_id = v_org and c.version_id = v.id));
end
$$;

-- ─── ح. إضافة مادّة للدفعة أو تبديل سطر بها (القاعدة ١٩) ──────────────────────────────────────────────────────────
-- الدفعة مسوّدة بنطاق مخزن مدخلاتها، والمادّة فعّالة يستلمها المخزن وتُقاس بالكيلو أو اللتر (والسائل بكثافة)، ولقطة الوحدة والكثافة
-- كما في create_production، والمخطّط = الكمية بخطوة عدّاد المادّة (القاعدة ١٨). والتبديل يحذف السطر المبدَّل بالمعاملة نفسها،
-- والجديد بديل (is_substitute) بسببه الإلزامي ومادّة ما حلّ محلّه. الأقفال: السطر المبدَّل ثمّ الدفعة، بقفل لا يتقافل مع مفتاح
-- يأخذه الترحيل على السطر (قيمة المدخل تشير إليه)، مثل delete_draft_line. والمعرّف من الجهاز: إعادة بالمعرّف نفسه ترجّع السطر.
create or replace function public.add_production_input(p_batch uuid, p_id uuid, p_item uuid, p_qty numeric, p_replaces uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  d public.production_batches;
  wi public.warehouses;
  i public.items;
  x public.production_inputs;
  o public.production_inputs;
  v_reason text;
  v_qty numeric;
  v_mass numeric;
  v_line int;
begin
  set local lock_timeout = '5s';
  perform private.require('production.draft');
  if p_id is null then
    raise exception 'id_required' using hint = 'تعذّر إضافة المادّة دون معرّف. حدّث الشاشة وأعد المحاولة.';
  end if;
  select * into d from public.production_batches where org_id = v_org and id = p_batch;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذه الدفعة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  wi := private.stock_wh(d.input_warehouse_id, true);
  if p_replaces is not null then
    select * into o from public.production_inputs where org_id = v_org and id = p_replaces for no key update;
  end if;
  select * into d from public.production_batches where org_id = v_org and id = p_batch for update;
  select * into x from public.production_inputs where id = p_id;
  if x.id is not null then
    if x.org_id is distinct from v_org or x.batch_id is distinct from d.id or x.item_id is distinct from p_item then
      raise exception 'id_conflict' using hint = 'هذا المعرّف لسطر آخر. حدّث الشاشة وأعد المحاولة.';
    end if;
    -- الإعادة تعرف نتيجتها هي (مراجعة 0016 #5): المحفوظ يطابق المرسَل الآن بالكمية بعد خطوة العدّاد، وبالتبديل وسببه بعد التشذيب
    -- (السطر المبدَّل حُذف في المحاولة الأولى، فلا يُقارن بنفسه)؛ وإلّا فالدفعة ستسحب غير ما كتبه المستخدم و«نجح» يخفي ذلك.
    if p_qty is null or not (abs(p_qty) < 'Infinity') or p_qty <= 0 or p_qty <> round(p_qty, 3) then
      v_qty := null;
    else
      v_qty := private.round_step(p_qty, (select y.scale_step from public.items y where y.org_id = v_org and y.id = x.item_id));
    end if;
    if x.planned_qty_base is distinct from v_qty or x.is_substitute is distinct from (p_replaces is not null)
      or x.reason is distinct from (case when p_replaces is not null then nullif(btrim(coalesce(p_reason, '')), '') end) then
      raise exception 'id_conflict' using hint = 'أُضيفت هذه المادّة بمحاولة سابقة بكمية أو سبب غير الذي أرسلته الآن. حدّث الصفحة لترى ما حُفظ وعدّل كميتها الفعلية.';
    end if;
    return jsonb_build_object('id', x.id, 'line_no', x.line_no, 'version', d.version);
  end if;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'الدفعة مرحَّلة أو ملغاة؛ لا تُضاف إليها مادّة.';
  end if;
  if p_replaces is not null and (o.id is null or o.batch_id <> d.id) then
    raise exception 'line_not_found' using hint = 'السطر الذي تريد تبديله غير موجود في هذه الدفعة. حدّث الشاشة.';
  end if;
  if p_item is null then
    raise exception 'item_required' using hint = 'اختر المادّة التي تضيفها للدفعة.';
  end if;
  select * into i from public.items where org_id = v_org and id = p_item;
  if i.id is null or i.archived_at is not null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك أو مؤرشفة. حدّث الشاشة واختر من جديد.';
  end if;
  if not private.item_admissible(wi.kind, i.kind) then
    raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s»: اختر مادّة من مواد المعمل الأوّلية.', i.name, wi.name);
  end if;
  if i.base_unit not in ('kg', 'L') then
    raise exception 'bad_recipe_unit' using hint = format('«%s» وحدتها قطعة، والدفعة تُحسب بالكتلة: لا تدخل فيها بهذه النسخة.', i.name);
  end if;
  if i.base_unit = 'L' and i.density_kg_per_l is null then
    raise exception 'density_required' using hint = format('«%s» سائل بلا كثافة، فلا يُحسب وزنه. اكتب كثافته في بطاقة المادّة أوّلاً.', i.name);
  end if;
  if p_qty is null or not (abs(p_qty) < 'Infinity') or p_qty <= 0 or p_qty <> round(p_qty, 3) then
    raise exception 'qty_not_positive' using hint = format('كمية «%s» أكبر من صفر، بثلاث مراتب عشرية على الأكثر.', i.name);
  end if;
  v_qty := private.round_step(p_qty, i.scale_step);
  if v_qty <= 0 then
    raise exception 'qty_not_positive' using hint = format('كمية «%s» أصغر من دقّة عدّادها. اكتب كمية أكبر.', i.name);
  end if;
  if p_replaces is not null then
    if o.item_id = i.id then
      raise exception 'substitute_same_item' using hint = format('السطر المبدَّل هو «%s» نفسها؛ عدّل كميته بدل تبديله.', i.name);
    end if;
    v_reason := nullif(btrim(coalesce(p_reason, '')), '');
    if v_reason is null or length(v_reason) < 3 then
      raise exception 'reason_required' using hint = 'اكتب سبب تبديل المادّة (3 أحرف على الأقلّ)، فهو يبقى على السطر.';
    end if;
    if length(v_reason) > 500 then
      raise exception 'reason_too_long' using hint = 'سبب التبديل حتى 500 حرف.';
    end if;
  end if;
  if exists (select 1 from public.production_inputs y where y.org_id = v_org and y.batch_id = d.id and y.item_id = i.id
    and y.id is distinct from o.id) then
    raise exception 'item_duplicated' using hint = format('«%s» مكتوبة في الدفعة؛ عدّل كميتها الفعلية بدل إضافة سطر ثانٍ.', i.name);
  end if;
  if p_replaces is not null then
    delete from public.production_inputs where org_id = v_org and id = o.id;
  end if;
  v_mass := private.input_mass_kg(v_qty, i.base_unit, i.density_kg_per_l);
  v_line := coalesce((select max(y.line_no) from public.production_inputs y where y.org_id = v_org and y.batch_id = d.id), 0) + 1;
  insert into public.production_inputs (id, org_id, batch_id, line_no, item_id, base_unit, density_kg_per_l, planned_qty_base, planned_mass_kg,
    in_basis, is_substitute, reason, replaced_item_id)
  values (p_id, v_org, d.id, v_line, i.id, i.base_unit, case when i.base_unit = 'L' then round(i.density_kg_per_l, 4) end, v_qty, v_mass,
    i.kind not in ('fuel', 'packaging'), p_replaces is not null, v_reason, o.item_id);
  update public.production_batches set version = version + 1 where org_id = v_org and id = d.id;
  return jsonb_build_object('id', p_id, 'line_no', v_line, 'version', d.version + 1);
end
$$;

-- ─── ح-2. «نسخة جديدة» تنسخ المفعَّلة (مراجعة 0016، #19) ──────────────────────────────────────────────────────────────
-- كانت «نسخة جديدة» تُدرج نسخة فارغة، فإضافة «أيدي عاملة» لخلطة مفعَّلة تعني إعادة كتابة الخلطة كلّها. هنا (المالك والمدير، فعل
-- recipe.activate): الخلطة مقفولة (نداءان بنفس اللحظة يترتّبان فلا تُنشأ مسوّدتان)، والمعرّف من الجهاز: نسخة بالمعرّف نفسه لهذه
-- الخلطة ترجع كما هي (جواب ضاع)، ومسوّدة أخرى للخلطة ترجع بمعرّفها بلا نسخ (مسوّدة واحدة لكلّ خلطة)؛ وإلّا مسوّدة بأساس النسخة
-- المفعَّلة (أو آخر نسخة إن لم تُفعَّل نسخة) وسطورها ومعدّلات تكاليفها بترتيبها، عبر الحرّاس القائمة كما يكتبها المدير بيده. ومادّة
-- أو فئة مؤرشفة في المنسوخ تُسمّى قبل النسخ (حارس السطر يرفضها برسالة لا تسمّيها). ومراجعة 0016 الرابعة (ق٤١): سطر مكتوب باللتر لمادّة صارت
-- بالكيلو يُنسخ سطراً بالكيلوغرام بالكتلة نفسها. والخامسة (التكامل، ق٥٥): سطر مادّة صارت قطعة بعد التفعيل لا يُنسخ — كان حارس السطر يرفضه
-- bad_recipe_unit فلا تُنشأ المسوّدة، وcreate_production يرفض النسخة item_changed، فتبقى خلطة لا يُنتَج بها ولا تُنسخ — واسم مادّته في skipped
-- بترتيب السطور تقوله الشاشة. والمفتاح حاضر دائماً: فارغ غالباً، وفارغ للمسوّدة القائمة (لم يُنسخ شيء بهذا النداء).
create or replace function public.new_recipe_version(p_recipe uuid, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  r public.recipes;
  v public.recipe_versions;
  s public.recipe_versions;
  ln record;
  v_name text;
  v_existing boolean := true;
  v_skipped jsonb := '[]'::jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('recipe.activate');
  if p_id is null then
    raise exception 'id_required' using hint = 'تعذّر إنشاء النسخة دون معرّف. حدّث الشاشة وأعد المحاولة.';
  end if;
  select * into r from public.recipes where org_id = v_org and id = p_recipe for update;
  if r.id is null then
    raise exception 'recipe_not_found' using hint = 'هذه الخلطة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if r.archived_at is not null then
    raise exception 'recipe_archived' using hint = format('الخلطة «%s» مؤرشفة، فلا تُنشأ لها نسخة جديدة. أعِدها من الأرشيف أوّلاً.', r.name);
  end if;
  select * into v from public.recipe_versions where id = p_id;
  if v.id is not null and (v.org_id is distinct from v_org or v.recipe_id is distinct from r.id) then
    raise exception 'id_conflict' using hint = 'هذا المعرّف لنسخة خلطة أخرى. حدّث الشاشة وأعد المحاولة.';
  end if;
  if v.id is null then
    select * into v from public.recipe_versions where org_id = v_org and recipe_id = r.id and status = 'draft';
  end if;
  if v.id is null then
    select * into s from public.recipe_versions where org_id = v_org and recipe_id = r.id and status = 'active';
    if s.id is null then
      select * into s from public.recipe_versions where org_id = v_org and recipe_id = r.id order by version_no desc limit 1;
    end if;
    select i.name into v_name from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where l.org_id = v_org and l.version_id = s.id and i.archived_at is not null order by l.line_no limit 1;
    if v_name is not null then
      raise exception 'item_archived' using hint = format('«%s» في الخلطة مؤرشفة، فلا تُنسخ إلى نسخة جديدة. أعِدها من الأرشيف أوّلاً.', v_name);
    end if;
    select c.name into v_name from public.recipe_cost_rates x join public.expense_categories c on c.org_id = x.org_id and c.id = x.category_id
    where x.org_id = v_org and x.version_id = s.id and c.archived_at is not null order by x.line_no limit 1;
    if v_name is not null then
      raise exception 'category_archived' using hint = format('فئة «%s» في تكاليف الخلطة مؤرشفة، فلا تُنسخ إلى نسخة جديدة. أعِدها من الأرشيف أوّلاً.', v_name);
    end if;
    insert into public.recipe_versions (id, org_id, recipe_id, basis_kg) values (p_id, v_org, r.id, coalesce(s.basis_kg, 1000)) returning * into v;
    -- سطر مكتوب باللتر لمادّة صارت بالكيلو بعد التفعيل (مراجعة 0016 الرابعة #0، ق٤١) يُنسخ سطراً بالكيلوغرام بالكتلة نفسها: الكمية × لقطة كثافة
    -- السطر المنسوخ بتقريب واحد لثلاث مراتب (القاعدة ٤، كما تُحسب كتلته في الدفعة). كان يُنسخ باللتر فيرفضه حارس السطر (bad_recipe_unit)، فلا
    -- تُنشأ المسوّدة التي يطلبها تلميح الإنتاج. والنسخة المجمَّدة تحمل لقطة الكثافة لكلّ سطر باللتر (التفعيل، وverify_mill الفحص ٣)، فغيابها رفض مسمّى.
    for ln in select l.item_id, l.qty, l.unit, l.density_kg_per_l, i.name, i.base_unit
      from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
      where l.org_id = v_org and l.version_id = s.id order by l.line_no loop
      -- مادّة صارت قطعة (مراجعة 0016 الخامسة، ق٥٥): العليقة بالكتلة فلا تدخل سطراً (حارس السطر)، فتُترك ويُسمّى اسمها.
      if ln.base_unit not in ('kg', 'L') then
        v_skipped := v_skipped || jsonb_build_array(ln.name);
        continue;
      end if;
      if ln.unit = 'L' and ln.base_unit = 'kg' then
        if ln.density_kg_per_l is null then
          raise exception 'density_required' using hint = format('«%s» صارت تُقاس بالكيلوغرام وسطرها في الخلطة باللتر بلا كثافة محفوظة، فلا تُحسب كميتها بالكيلوغرام. أنشئ خلطة جديدة واكتب كميتها بالكيلوغرام.', ln.name);
        end if;
        insert into public.recipe_lines (org_id, version_id, item_id, qty, unit) values (v_org, v.id, ln.item_id, private.liters_to_kg(ln.qty, ln.density_kg_per_l), 'kg');
      else
        insert into public.recipe_lines (org_id, version_id, item_id, qty, unit) values (v_org, v.id, ln.item_id, ln.qty, ln.unit);
      end if;
    end loop;
    for ln in select x.category_id, x.amount_per_ton from public.recipe_cost_rates x where x.org_id = v_org and x.version_id = s.id order by x.line_no loop
      insert into public.recipe_cost_rates (org_id, version_id, category_id, amount_per_ton) values (v_org, v.id, ln.category_id, ln.amount_per_ton);
    end loop;
    select * into v from public.recipe_versions where org_id = v_org and id = v.id;
    v_existing := false;
  end if;
  return jsonb_build_object('recipe_id', r.id, 'version_id', v.id, 'version_no', v.version_no, 'status', v.status,
    'lines', (select count(*)::int from public.recipe_lines l where l.org_id = v_org and l.version_id = v.id),
    'rates', (select count(*)::int from public.recipe_cost_rates c where c.org_id = v_org and c.version_id = v.id),
    'existing', v_existing, 'skipped', v_skipped);
end
$$;

-- ─── ط. الأجسام المعاد بناؤها على آخر نسخة لها ─────────────────────────────────────────────────────────────────

-- سعر البيع (0014) على جسمه حرفاً، إلّا أنّ الصفّ قد يحمل سعر الكلفة وحده (0016): الفارغ يشيل سعر البيع ويُبقي الصفّ إن كان
-- فيه سعر كلفة، والإدراج حين لا صفّ أصلاً. سلوك سعر البيع نفسه (الشرط والإعادة والرموز والجواب) كما كان.
create or replace function public.set_item_sell_price(p_item uuid, p_price numeric, p_expected numeric) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  i public.items;
  v_cur numeric;
  v_cost numeric;
  v_row boolean;
begin
  set local lock_timeout = '5s';
  perform private.require('stores.manage');
  if not public.can_see_cost() then
    raise exception 'no_cost_access' using hint = 'سعر البيع مبلغ، ولا يراه دورك ولا يكتبه.';
  end if;
  if p_price is not null and not (abs(p_price) < 'Infinity' and p_price > 0 and p_price = round(p_price, 2)) then
    raise exception 'bad_price' using hint = 'سعر البيع أكبر من صفر، بمرتبتين عشريتين كحدّ أقصى.';
  end if;
  if p_expected is not null and not (abs(p_expected) < 'Infinity' and p_expected = round(p_expected, 2)) then
    raise exception 'bad_price' using hint = 'السعر السابق المرسل غير صالح. حدّث الشاشة.';
  end if;
  select * into i from public.items where org_id = v_org and id = p_item for no key update;
  if i.id is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if i.archived_at is not null then
    raise exception 'item_archived' using hint = 'المادّة مؤرشفة، فلا يُغيَّر سعر بيعها. أعِدها أوّلاً.';
  end if;
  select r.sell_price, r.cost_price into v_cur, v_cost from public.item_prices r where r.org_id = v_org and r.item_id = p_item;
  v_row := found;
  if v_cur is not distinct from p_price then
    return jsonb_build_object('item_id', p_item, 'sell_price', p_price::text, 'written', false);
  end if;
  if v_cur is distinct from p_expected then
    raise exception 'price_changed' using hint = 'تغيّر سعر البيع من نافذة أو جهاز آخر بعد أن بدأت تعديله. حدّث الشاشة ثمّ أعِد الكتابة.';
  end if;
  if p_price is null and v_cost is null then
    delete from public.item_prices where org_id = v_org and item_id = p_item;
  elsif not v_row then
    insert into public.item_prices (org_id, item_id, sell_price) values (v_org, p_item, p_price);
  else
    update public.item_prices set sell_price = p_price, version = version + 1 where org_id = v_org and item_id = p_item;
  end if;
  return jsonb_build_object('item_id', p_item, 'sell_price', p_price::text, 'written', true);
end
$$;

-- سجلّ الشراء (0014) كما هو، ويّا سعر الكلفة المكتوب بجانب سعر البيع داخل money على المادّة (0016، D1).
create or replace function public.item_purchases(p_item uuid, p_warehouse uuid, p_after jsonb, p_limit int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 200);
  i public.items;
  w public.warehouses;
  v_after_on date := nullif(p_after ->> 'received_on', '')::date;
  v_after_seq bigint := nullif(p_after ->> 'seq', '')::bigint;
  v_after_id uuid := nullif(p_after ->> 'id', '')::uuid;
  v_rows jsonb;
  v_total bigint;
begin
  perform private.require('read');
  if p_warehouse is not null and not public.in_scope_wh(p_warehouse) then
    raise exception 'out_of_scope' using hint = 'هذا المخزن خارج نطاقك أو غير موجود في منشأتك.';
  end if;
  select * into i from public.items where org_id = v_org and id = p_item;
  if i.id is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if p_warehouse is not null then
    select * into w from public.warehouses where org_id = v_org and id = p_warehouse;
  end if;
  with buys as (
    select l.id as lot_id, l.received_on, l.fifo_seq, l.qty_in, l.qty_left, l.value_in, l.expiry_on, l.supplier_lot_no,
      l.warehouse_id, y.name as warehouse_name,
      r.id as doc_id, r.doc_no, r.party_id, t.name as party_name,
      x.id as line_id, x.qty_in_unit, x.unit_label, x.unit_code, x.factor, x.base_unit,
      -- مبلغ الفاتورة الحالي للسطر = مبلغ أحدث تصحيح حيّ، وإلّا المبلغ المكتوب (مرآة private.revalue_plan.current_total):
      -- التصحيح لا يكتب فوق receipt_line_amounts، بل يزيد قيمة الدفعة بحصّة ويترك الفرق مصروفاً.
      coalesce((select v.new_total from public.receipt_revaluations v
        where v.org_id = l.org_id and v.receipt_line_id = x.id and v.status = 'posted' order by v.rev_no desc limit 1), a.line_total) as invoice_total,
      exists (select 1 from public.receipt_revaluations v
        where v.org_id = l.org_id and v.receipt_line_id = x.id and v.status = 'posted') as corrected
    from public.stock_lots l
    join public.receipts r on r.org_id = l.org_id and r.id = l.source_id
    join public.receipt_lines x on x.org_id = l.org_id and x.id = l.source_line_id
    join public.parties t on t.org_id = r.org_id and t.id = r.party_id
    join public.warehouses y on y.org_id = l.org_id and y.id = l.warehouse_id
    left join public.receipt_line_amounts a on a.org_id = x.org_id and a.line_id = x.id
    where l.org_id = v_org and l.item_id = i.id and l.source_kind = 'receipt' and l.origin_lot_id is null and r.status = 'posted'
      and (p_warehouse is null or l.warehouse_id = p_warehouse) and public.in_scope_wh(l.warehouse_id)
  ), paged as (
    select * from buys b
    where v_after_id is null or b.received_on < v_after_on
      or (b.received_on = v_after_on and (b.fifo_seq < v_after_seq or (b.fifo_seq = v_after_seq and b.lot_id < v_after_id)))
    order by b.received_on desc, b.fifo_seq desc, b.lot_id desc
    limit v_limit + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('lot_id', p.lot_id, 'received_on', p.received_on, 'doc_id', p.doc_id, 'doc_no', p.doc_no,
      'party_id', p.party_id, 'party_name', p.party_name, 'warehouse_id', p.warehouse_id, 'warehouse_name', p.warehouse_name,
      'line_id', p.line_id, 'qty_in', p.qty_in::text, 'qty_left', p.qty_left::text, 'qty_in_unit', p.qty_in_unit::text,
      'unit_label', p.unit_label, 'unit_code', p.unit_code, 'factor', p.factor::text, 'base_unit', p.base_unit,
      'supplier_lot_no', p.supplier_lot_no, 'expiry_on', p.expiry_on,
      -- المراتب مستقرّة للشاشة (round بمرتبتين): value_left وvalue_in تأتي بمرتبتين أو بلا مراتب بحسب وجود خصم أو تحميل، والقيمة نفسها.
      'money', jsonb_build_object('invoice_total', p.invoice_total::text, 'landed_value', round(p.value_in, 2)::text,
        'unit_cost', private._mul_div_round2(1, p.value_in, p.qty_in)::text, 'corrected', p.corrected),
      'cursor', jsonb_build_object('received_on', p.received_on, 'seq', p.fifo_seq::text, 'id', p.lot_id))
      order by p.received_on desc, p.fifo_seq desc, p.lot_id desc), '[]'::jsonb),
    case when v_after_id is null then (select count(*) from buys) end
  into v_rows, v_total
  from paged p;
  return private.mask(jsonb_build_object(
    'item', jsonb_build_object('id', i.id, 'name', i.name, 'kind', i.kind, 'base_unit', i.base_unit, 'tracks_expiry', i.tracks_expiry,
      'min_qty', i.min_qty::text, 'archived', i.archived_at is not null,
      'money', jsonb_build_object('sell_price', (select r.sell_price::text from public.item_prices r where r.org_id = v_org and r.item_id = i.id),
        'cost_price', (select r.cost_price::text from public.item_prices r where r.org_id = v_org and r.item_id = i.id))),
    'warehouse', case when w.id is not null then jsonb_build_object('id', w.id, 'name', w.name, 'kind', w.kind) end,
    -- آخر دفعة إنتاج مرحَّلة ناتجها هذه المادّة (مراجعة 0016 #20): بطاقة العلف المنتَج تعرف أنّه يُصنع في المعمل. بمخزن الناتج
    -- إن أُرسل مخزن، ومن مخازن نطاق القارئ وحدها، وبلا مال.
    'last_production', (select jsonb_build_object('batch_id', b.id, 'doc_no', b.doc_no, 'produced_on', b.produced_on,
        'qty_kg', b.output_qty_kg::text, 'warehouse_name', y.name)
      from public.production_batches b join public.warehouses y on y.org_id = b.org_id and y.id = b.output_warehouse_id
      where b.org_id = v_org and b.output_item_id = i.id and b.status = 'posted'
        and (p_warehouse is null or b.output_warehouse_id = p_warehouse) and public.in_scope_wh(b.output_warehouse_id)
      order by b.produced_on desc, b.posted_at desc, b.id desc limit 1),
    'today', public.app_today(),
    'rows', (select coalesce(jsonb_agg(r - 'cursor' order by n), '[]'::jsonb) from jsonb_array_elements(v_rows) with ordinality as x(r, n) where n <= v_limit),
    'next', case when jsonb_array_length(v_rows) > v_limit then v_rows -> (v_limit - 1) -> 'cursor' end,
    'total', v_total));
end
$$;

-- حذف سطر المسوّدة (0015) ويّا ثلاثة أنواع (0016): معدّل تكاليف الخلطة (recipe.activate، والنسخة مسوّدة)، وسطر تكاليف الدفعة
-- (costs.load لأدوار الكلفة، ويفرّغ ختم الكلف)، وسطر مدخلات الدفعة (production.draft). السطر أوّلاً ثمّ رأسه كما كان.
create or replace function public.delete_draft_line(p_doc_kind text, p_line_id uuid, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_doc uuid;
  v_status text;
  v_version int;
  v_wh uuid;
begin
  set local lock_timeout = '5s';
  -- السطر أوّلاً ثم رأسه، بنفس ترتيب تعديله المباشر (بوستغريس يقفل الصفّ قبل ما مشغّله يقفل الرأس)، وإلا حذف وتعديل لنفس السطر
  -- يقفلون بعض (40P01).
  if p_doc_kind = 'opening' then
    perform private.require('opening.post');
    select doc_id into v_doc from public.opening_lines where org_id = public.auth_org() and id = p_line_id for update;
  elsif p_doc_kind = 'transfer' then
    perform private.require('transfer.post');
    select doc_id into v_doc from public.transfer_lines where org_id = public.auth_org() and id = p_line_id for update;
  elsif p_doc_kind = 'stock_use' then
    perform private.require('stock_use.post');
    select doc_id into v_doc from public.stock_use_lines where org_id = public.auth_org() and id = p_line_id for update;
  elsif p_doc_kind = 'count' then
    perform private.require('count.enter');
    select doc_id into v_doc from public.stock_count_lines where org_id = public.auth_org() and id = p_line_id for update;
    -- كلفة السطر قبل الرأس مثل حارس الكلفة (مراجعة WP5 الثانية): كانت تنقفل بالحذف بعد الرأس فتتعاكس ويّا كلفة يكتبها المدير (40P01).
    perform 1 from public.stock_count_line_costs where org_id = public.auth_org() and line_id = p_line_id for update;
  elsif p_doc_kind = 'receipt' then
    perform private.require('receipt.draft');
    select doc_id into v_doc from public.receipt_lines where org_id = public.auth_org() and id = p_line_id for update;
    -- مبلغ السطر واختيار تحميلاته قبل الرأس مثل حرّاسها (WP6): الأمين ما يشوفها، فحذفها المباشر كان يرفض 23503.
    perform 1 from public.receipt_line_amounts where org_id = public.auth_org() and line_id = p_line_id for update;
    perform 1 from public.receipt_charge_lines where org_id = public.auth_org() and line_id = p_line_id order by charge_id for update;
  elsif p_doc_kind = 'supplier_return' then
    perform private.require('receipt.draft');
    select doc_id into v_doc from public.supplier_return_lines where org_id = public.auth_org() and id = p_line_id for update;
    -- مبلغ السطر قبل الرأس مثل حارسه (الأمين ما يشوفه، فحذفه المباشر كان يرفض 23503).
    perform 1 from public.supplier_return_line_amounts where org_id = public.auth_org() and line_id = p_line_id for update;
  elsif p_doc_kind = 'recipe_line' then
    perform private.require('recipe.activate');
    select version_id into v_doc from public.recipe_lines where org_id = public.auth_org() and id = p_line_id for update;
  elsif p_doc_kind = 'recipe_cost_rate' then
    perform private.require('recipe.activate');
    select version_id into v_doc from public.recipe_cost_rates where org_id = public.auth_org() and id = p_line_id for update;
  -- سطر الكلفة وسطر المدخلات بقفل لا يتقافل مع مفتاح يأخذه الترحيل عليهما (التحميل وقيمة المدخل تشيران إليهما): بـfor update
  -- ينتظر الحذف الدفعة وينتظر الترحيل السطر (40P01).
  elsif p_doc_kind = 'production_cost' then
    perform private.require('costs.load');
    if not public.can_see_cost() then
      raise exception 'forbidden' using hint = 'تكاليف الدفعة مبالغ، فهي لأدوار الكلفة فقط.';
    end if;
    select batch_id into v_doc from public.production_costs where org_id = public.auth_org() and id = p_line_id for no key update;
  elsif p_doc_kind = 'production_input' then
    perform private.require('production.draft');
    select batch_id into v_doc from public.production_inputs where org_id = public.auth_org() and id = p_line_id for no key update;
  else
    raise exception 'doc_kind_unknown' using hint = 'نوع المستند غير معروف.';
  end if;
  if v_doc is null then
    return jsonb_build_object('line_id', p_line_id, 'deleted', false);
  end if;
  if p_doc_kind = 'opening' then
    select status, version, warehouse_id into v_status, v_version, v_wh from public.opening_docs
    where org_id = public.auth_org() and id = v_doc for update;
  elsif p_doc_kind = 'transfer' then
    select status, version, from_warehouse_id into v_status, v_version, v_wh from public.transfers
    where org_id = public.auth_org() and id = v_doc for update;
  elsif p_doc_kind = 'stock_use' then
    select status, version, warehouse_id into v_status, v_version, v_wh from public.stock_uses
    where org_id = public.auth_org() and id = v_doc for update;
  elsif p_doc_kind = 'receipt' then
    select status, version, warehouse_id into v_status, v_version, v_wh from public.receipts
    where org_id = public.auth_org() and id = v_doc for update;
  elsif p_doc_kind = 'supplier_return' then
    select status, version, warehouse_id into v_status, v_version, v_wh from public.supplier_returns
    where org_id = public.auth_org() and id = v_doc for update;
  elsif p_doc_kind = 'recipe_line' then
    select status, version, null::uuid into v_status, v_version, v_wh from public.recipe_versions
    where org_id = public.auth_org() and id = v_doc for update;
  elsif p_doc_kind = 'recipe_cost_rate' then
    select status, version, null::uuid into v_status, v_version, v_wh from public.recipe_versions
    where org_id = public.auth_org() and id = v_doc for update;
  elsif p_doc_kind in ('production_cost', 'production_input') then
    select status, version, input_warehouse_id into v_status, v_version, v_wh from public.production_batches
    where org_id = public.auth_org() and id = v_doc for update;
  else
    select status, version, warehouse_id into v_status, v_version, v_wh from public.stock_counts
    where org_id = public.auth_org() and id = v_doc for update;
  end if;
  -- سطر العليقة بلا مخزن (الخلطة للمنشأة كلّها بفعل recipe.activate)، فلا نطاق مخزن عليه.
  if v_wh is not null then
    perform private.stock_wh(v_wh, true);
  end if;
  -- حذف سطر كلفة يغيّر ما يُحمَّل من مصاريف وحدة مخزن المدخلات، فلمن يرى تلك الوحدة كحارس السطر (مراجعة 0016 الثانية #0).
  if p_doc_kind = 'production_cost'
    and not public.in_scope_division((select w.division_id from public.warehouses w where w.org_id = public.auth_org() and w.id = v_wh)) then
    raise exception 'out_of_scope' using hint = format('تكاليف هذه الدفعة تُحمَّل من مصاريف وحدة «%s» خارج نطاقك، فيكتبها ويختمها محاسب أو مدير يرى تلك الوحدة.',
      (select dv.name from public.warehouses w join public.divisions dv on dv.org_id = w.org_id and dv.id = w.division_id
        where w.org_id = public.auth_org() and w.id = v_wh));
  end if;
  if v_status <> 'draft' then
    raise exception 'not_draft' using hint = 'المستند مرحَّل أو ملغى أو مسلَّم؛ لا تُحذف سطوره.';
  end if;
  if p_expected_version is null or v_version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّرت المسوّدة بعد فتحها. حدّث الشاشة وأعد المحاولة.';
  end if;
  if p_doc_kind = 'opening' then
    delete from public.opening_lines where org_id = public.auth_org() and id = p_line_id;
    update public.opening_docs set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  elsif p_doc_kind = 'transfer' then
    delete from public.transfer_lines where org_id = public.auth_org() and id = p_line_id;
    update public.transfers set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  elsif p_doc_kind = 'stock_use' then
    delete from public.stock_use_lines where org_id = public.auth_org() and id = p_line_id;
    update public.stock_uses set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  elsif p_doc_kind = 'receipt' then
    delete from public.receipt_charge_lines where org_id = public.auth_org() and line_id = p_line_id;
    delete from public.receipt_line_amounts where org_id = public.auth_org() and line_id = p_line_id;
    delete from public.receipt_lines where org_id = public.auth_org() and id = p_line_id;
    update public.receipts set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  elsif p_doc_kind = 'supplier_return' then
    delete from public.supplier_return_line_amounts where org_id = public.auth_org() and line_id = p_line_id;
    delete from public.supplier_return_lines where org_id = public.auth_org() and id = p_line_id;
    update public.supplier_returns set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  elsif p_doc_kind = 'recipe_line' then
    delete from public.recipe_lines where org_id = public.auth_org() and id = p_line_id;
    update public.recipe_versions set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  elsif p_doc_kind = 'recipe_cost_rate' then
    delete from public.recipe_cost_rates where org_id = public.auth_org() and id = p_line_id;
    update public.recipe_versions set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  elsif p_doc_kind = 'production_cost' then
    -- حذف سطر كلفة تعديلٌ لكلف الدفعة: يفرّغ ختمها (FOUNDATION ٥٦٠).
    delete from public.production_costs where org_id = public.auth_org() and id = p_line_id;
    update public.production_batches set costs_confirmed_at = null, costs_confirmed_by = null, version = version + 1
    where org_id = public.auth_org() and id = v_doc;
  elsif p_doc_kind = 'production_input' then
    delete from public.production_inputs where org_id = public.auth_org() and id = p_line_id;
    update public.production_batches set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  else
    delete from public.stock_count_line_costs where org_id = public.auth_org() and line_id = p_line_id;
    delete from public.stock_count_lines where org_id = public.auth_org() and id = p_line_id;
    update public.stock_counts set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  end if;
  return jsonb_build_object('line_id', p_line_id, 'deleted', true, 'doc_id', v_doc, 'version', v_version + 1);
end
$$;

-- إلغاء المصروف (0008) كما هو، ويرفض مصروفاً عليه تحميل فعّال لدفعة إنتاج (0016، القاعدة ٢٠، expense_allocated) ويسمّي الدفعة
-- والمبلغ، بعد قفل صفّ المصروف: الترحيل يقفله قبل أن يحمّل منه، فإمّا يرى الإلغاء التحميل أو يرى الترحيل الإلغاء.
create or replace function public.void_expense(p_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_expense';
  v_cached jsonb;
  v_reason text;
  e public.expenses;
  m public.cash_moves;
  m2 public.cash_moves;
  v_rev uuid;
  r public.expenses;
  v_doc_no text;
  v_allocated numeric;
  v_batches bigint;
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into e from public.expenses where org_id = public.auth_org() and id = p_id;
  if e.id is null then
    raise exception 'expense_not_found' using hint = 'هذا المصروف غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_division(e.division_id) then
    raise exception 'out_of_scope' using hint = 'وحدة هذا المصروف خارج نطاقك، فلا تلغيه.';
  end if;
  if e.reverses_id is not null then
    raise exception 'not_voidable' using hint = 'هذا صفّ إلغاء لمصروف سابق، فلا يُلغى.';
  end if;
  if e.source in ('stock', 'adjustment') then
    raise exception 'system_expense' using hint = 'هذا المصروف كتبه مستند (الصرف أو الجرد أو الاستلام)، فيُلغى من مستنده.';
  end if;
  perform private.lock_parties(array[e.party_id]);
  perform private.check_void_date();
  select * into e from public.expenses where org_id = e.org_id and id = e.id for update;
  if exists (select 1 from public.expenses x where x.org_id = e.org_id and x.reverses_id = e.id) then
    raise exception 'already_reversed' using hint = 'هذا المصروف أُلغي من قبل.';
  end if;
  select b.doc_no, sum(t.amount) over (), count(*) over () into v_doc_no, v_allocated, v_batches
  from (select a.batch_id, sum(a.amount) as amount from public.production_cost_allocations a
    where a.org_id = e.org_id and a.expense_id = e.id and a.voided_at is null group by a.batch_id) as t
  join public.production_batches b on b.org_id = e.org_id and b.id = t.batch_id
  order by b.produced_on, b.doc_no, b.id
  limit 1;
  if v_allocated is not null then
    raise exception 'expense_allocated' using hint = case when v_batches > 1
      then format('من هذا المصروف %s محمَّلة على دفعات إنتاج عددها %s، أوّلها %s؛ ألغِ الدفعات أوّلاً.', private.money_text(v_allocated), v_batches, v_doc_no)
      else format('من هذا المصروف %s محمَّلة على دفعة الإنتاج %s؛ ألغِ الدفعة أوّلاً.', private.money_text(v_allocated), v_doc_no) end;
  end if;
  if e.source = 'cash' then
    select * into m from public.cash_moves where org_id = e.org_id and id = e.cash_move_id;
    perform private.lock_cash_account(m.account_id, false);
    m2 := private.write_cash_move(m.account_id, -m.amount, m.kind, m.doc_kind, m.doc_id, null, public.app_today(), m.id, v_reason);
  else
    v_rev := private.void_entry(e.party_entry_id, v_reason);
  end if;
  insert into public.expenses (org_id, category_id, division_id, amount, on_date, for_month, source, account_id, party_id, book_id, site_id,
    cash_move_id, party_entry_id, reverses_id, note, reason)
  values (e.org_id, e.category_id, e.division_id, -e.amount, public.app_today(), date_trunc('month', public.app_today())::date, e.source,
    e.account_id, e.party_id, e.book_id, e.site_id, m2.id, v_rev, e.id, e.note, v_reason)
  returning * into r;
  return private.ref_store(v_fn, p_client_ref, private.expense_result(r, '[]'::jsonb));
end
$$;

-- تقرير المصاريف (0008) كما هو، وكلّ صفّ يزيد المحمَّل منه على العلف (تحميلاته الفعّالة، 0016، القاعدة ٢٠: «تقرير المصاريف
-- العامة يطلّع كل مصروف انحمّل على علف»). invoker: سياسة الكلفة المقيِّدة على جدول التحميلات نفسها، والتقرير لأدوار الكلفة أصلاً.
create or replace function public.report_expenses(p_from date, p_to date, p_division uuid, p_after jsonb, p_limit int) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_to date := coalesce(p_to, public.app_today());
  v_from date;
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_rows jsonb;
  v_count int;
begin
  if not (public.can('accounts.view') and public.can_see_cost()) then
    raise exception 'forbidden' using hint = 'المصاريف للمالك والمدير والمحاسب فقط.';
  end if;
  if p_from is null or p_from > v_to then
    raise exception 'period_required' using hint = 'حدّد المدّة: من تاريخ إلى تاريخ لا يسبقه.';
  end if;
  if p_division is not null and not public.in_scope_division(p_division) then
    raise exception 'out_of_scope' using hint = 'هذه الوحدة خارج نطاقك، فلا تعرض مصاريفها.';
  end if;
  v_from := date_trunc('month', p_from)::date;
  with page as (
    select e.*, c.name as category_name, c.system_code, a.name as account_name, p.name as party_name, b.code as book_code, s.name as site_name,
      case e.doc_kind
        when 'stock_use' then (select u.doc_no from public.stock_uses u where u.org_id = e.org_id and u.id = e.doc_id)
        when 'count' then (select k.doc_no from public.stock_counts k where k.org_id = e.org_id and k.id = e.doc_id)
      end as doc_no,
      exists (select 1 from public.expenses r where r.org_id = e.org_id and r.reverses_id = e.id) as reversed,
      round(coalesce((select sum(a.amount) from public.production_cost_allocations a
        where a.org_id = e.org_id and a.expense_id = e.id and a.voided_at is null), 0), 2) as allocated
    from public.expenses e
    join public.expense_categories c on c.org_id = e.org_id and c.id = e.category_id
    left join public.cash_accounts a on a.org_id = e.org_id and a.id = e.account_id
    left join public.parties p on p.org_id = e.org_id and p.id = e.party_id
    left join public.ledger_books b on b.org_id = e.org_id and b.id = e.book_id
    left join public.sites s on s.org_id = e.org_id and s.id = e.site_id
    where e.org_id = v_org and e.for_month between v_from and v_to and (p_division is null or e.division_id = p_division)
      and (p_after is null or (e.for_month, e.on_date, e.created_at, e.id) < ((p_after ->> 'for_month')::date, (p_after ->> 'on_date')::date,
        (p_after ->> 'created_at')::timestamptz, (p_after ->> 'id')::uuid))
    order by e.for_month desc, e.on_date desc, e.created_at desc, e.id desc
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'on_date', x.on_date, 'for_month', x.for_month, 'category_id', x.category_id,
      'category_name', x.category_name, 'system_code', x.system_code, 'division_id', x.division_id, 'source', x.source, 'account_id', x.account_id,
      'account_name', x.account_name, 'party_id', x.party_id, 'party_name', x.party_name, 'book_id', x.book_id, 'book_code', x.book_code,
      'site_id', x.site_id, 'site_name', x.site_name, 'doc_kind', x.doc_kind, 'doc_id', x.doc_id, 'doc_no', x.doc_no, 'note', x.note,
      'reason', x.reason, 'reverses', x.reverses_id, 'reversed', x.reversed, 'amount', x.amount::text, 'allocated', x.allocated::text,
      'cursor', jsonb_build_object('for_month', x.for_month, 'on_date', x.on_date, 'created_at', x.created_at, 'id', x.id))
      order by x.for_month desc, x.on_date desc, x.created_at desc, x.id desc), '[]'::jsonb), count(*)
  into v_rows, v_count
  from page as x;
  return jsonb_build_object('from', v_from, 'to', v_to, 'division_id', p_division,
    -- القارئ المحصور بوحدات (E49): المجاميع من وحداته بس، والشاشة تكتب «N من المجموع».
    'divisions', jsonb_build_object(
      'visible', (select count(*) from public.divisions d where d.org_id = v_org and public.in_scope_division(d.id)),
      'total', (select count(*) from public.divisions d where d.org_id = v_org)),
    'rows', coalesce((select jsonb_agg(r - 'cursor' order by n) from jsonb_array_elements(v_rows) with ordinality as a(r, n)), '[]'::jsonb),
    'next', case when v_count = v_limit then v_rows -> (v_count - 1) -> 'cursor' end,
    'totals', (
      with f as (
        select e.* from public.expenses e
        where e.org_id = v_org and e.for_month between v_from and v_to and (p_division is null or e.division_id = p_division)
      )
      select jsonb_build_object(
        'total', coalesce((select sum(amount) from f), 0)::text,
        'count', (select count(*) from f),
        'by_category', coalesce((select jsonb_agg(jsonb_build_object('category_id', g.category_id, 'name', c.name, 'system_code', c.system_code,
            'amount', g.amount::text) order by c.name collate "C", g.category_id)
          from (select category_id, sum(amount) as amount from f group by category_id) as g
          join public.expense_categories c on c.org_id = v_org and c.id = g.category_id), '[]'::jsonb),
        'by_source', coalesce((select jsonb_agg(jsonb_build_object('source', g.source, 'amount', g.amount::text) order by g.source)
          from (select source, sum(amount) as amount from f group by source) as g), '[]'::jsonb),
        'by_month', coalesce((select jsonb_agg(jsonb_build_object('for_month', g.for_month, 'amount', g.amount::text) order by g.for_month)
          from (select for_month, sum(amount) as amount from f group by for_month) as g), '[]'::jsonb))
    ));
end
$$;

-- إنشاء الدفعة (0015) كما هو، ويّا سطر تكاليف لكلّ معدّل في النسخة المفعَّلة (0016، D3): المبلغ المحسوب = المعدّل × الكمية
-- المخطّطة ÷ 1000 بضربة تقريب واحدة، والمبلغ نفسه يُعدَّل بالدفعة. ومراجعة 0016 الثالثة والرابعة: item_changed حين لا تستطيع لقطة سطر الخلطة
-- تخطيطه (لقطة كيلوغرام ومادّة صارت باللتر، أو مادّة صارت قطعة)، ولقطة لتر ومادّة صارت بالكيلو تُخطَّط بالكيلو من لقطة الكثافة.
create or replace function public.create_production(p_id uuid, p_recipe_version uuid, p_planned_kg numeric, p_wh_in uuid, p_wh_out uuid,
  p_produced_on date) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v public.recipe_versions;
  r public.recipes;
  wi public.warehouses;
  wo public.warehouses;
  o public.items;
  d public.production_batches;
  ln record;
  v_mass numeric;
  v_qty numeric;
  v_lines int := 0;
  v_div uuid;
  rt record;
  v_amount numeric;
  v_line_kg numeric;
  v_density numeric;
begin
  set local lock_timeout = '5s';
  perform private.require('production.draft');
  if p_id is null then
    raise exception 'id_required' using hint = 'تعذّر إنشاء الدفعة دون معرّف. حدّث الشاشة وأعد المحاولة.';
  end if;
  if p_planned_kg is null or not (abs(p_planned_kg) < 'Infinity') or p_planned_kg <= 0 or p_planned_kg <> round(p_planned_kg, 3) then
    raise exception 'qty_not_positive' using hint = 'اكتب كمية الإنتاج بالكيلوغرام، أكبر من صفر وبثلاث مراتب عشرية كحدّ أقصى.';
  end if;
  v := private.mill_version(p_recipe_version, true);
  select * into r from public.recipes where org_id = v_org and id = v.recipe_id;
  if r.archived_at is not null then
    raise exception 'recipe_archived' using hint = format('الخلطة «%s» مؤرشفة، فلا يُنتَج بها. أعِدها من الأرشيف أوّلاً.', r.name);
  end if;
  wi := private.stock_wh(p_wh_in, true);
  wo := private.stock_wh(p_wh_out, false);
  if wi.id = wo.id then
    raise exception 'same_warehouse' using hint = 'مخزن المواد ومخزن العلف واحد؛ اختر مخزناً آخر للناتج.';
  end if;
  select * into o from public.items where org_id = v_org and id = r.output_item_id;
  if o.archived_at is not null then
    raise exception 'item_archived' using hint = format('مادّة الناتج «%s» مؤرشفة. أعِدها من الأرشيف أوّلاً.', o.name);
  end if;
  if not private.item_admissible(wo.kind, o.kind) then
    raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s»: نوع المادّة لا يناسب نوع مخزن الناتج.', o.name, wo.name);
  end if;
  for v_div in select distinct x from unnest(array[wi.division_id, wo.division_id]) as x order by 1 loop
    perform private.check_post_date(p_produced_on, v_div);
  end loop;
  insert into public.production_batches (id, org_id, recipe_version_id, output_item_id, input_warehouse_id, output_warehouse_id,
    planned_kg, produced_on)
  values (p_id, v_org, v.id, o.id, wi.id, wo.id, p_planned_kg, p_produced_on)
  returning * into d;
  for ln in
    select l.line_no, l.qty, l.unit, l.density_kg_per_l, i.id as item_id, i.name, i.base_unit, i.density_kg_per_l as item_density, i.scale_step,
      l.in_basis, l.base_unit as line_base
    from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where l.org_id = v_org and l.version_id = v.id order by l.line_no
  loop
    -- وحدة أساس المادّة لقطة السطر عند التفعيل (مراجعة 0016 الثالثة #2، FOUNDATION القاعدة ٤ وE46، كما يقارن الترحيل لقطة سطر الدفعة). ولا يُرفض
    -- إلّا ما لا تستطيع اللقطة تخطيطه (مراجعة 0016 الرابعة #0، ق٤١): لقطة كيلوغرام ومادّة صارت باللتر (التخطيط باللتر يحتاج كثافة لم تُلقط، فكان
    -- الكيلو المكتوب يصير لتراتٍ بكثافة المادّة الحالية)، ومادّة صارت قطعة. أمّا لقطة لتر ومادّة صارت بالكيلو فكتلة السطر معروفة من لقطة الكثافة،
    -- فتُخطَّط بالكيلو كما كانت قبل لقطة الوحدة: سطر الدفعة بالكيلو بلا كثافة، والمخطّط بخطوة العدّاد من الكتلة نفسها بتقريب واحد. وكان رفضها يوقف
    -- إنتاجاً صحيحاً، والعلاج الذي يسمّيه التلميح مسدوداً. والكثافة للتخطيط لقطة السطر (التفعيل يكتبها لكلّ سطر وحدته لتر، وverify_mill الفحص ٣
    -- يمسك غيابها).
    if ln.line_base is not null and ((ln.line_base = 'kg' and ln.base_unit = 'L') or ln.base_unit not in ('kg', 'L')) then
      raise exception 'item_changed' using hint = format('تغيّرت وحدة «%s» بعد تفعيل الخلطة، فلا يُنتَج بنسختها المفعَّلة. أنشئ نسخة جديدة من الخلطة وفعّلها.', ln.name);
    end if;
    if ln.base_unit not in ('kg', 'L') then
      raise exception 'bad_recipe_unit' using hint = format('«%s» وحدتها قطعة، فلا تُسحب بالكتلة. راجع الخلطة.', ln.name);
    end if;
    if ln.base_unit = 'L' and coalesce(ln.density_kg_per_l, ln.item_density) is null then
      raise exception 'density_required' using hint = format('«%s» سائل بلا كثافة. اكتب كثافته في بطاقة المادّة ثمّ أعد الإنتاج.', ln.name);
    end if;
    if not private.item_admissible(wi.kind, (select i2.kind from public.items i2 where i2.org_id = v_org and i2.id = ln.item_id)) then
      raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s»: اختر مخزن المواد الذي فيه مواد الخلطة.', ln.name, wi.name);
    end if;
    v_line_kg := private.recipe_line_kg(ln.qty, ln.unit, coalesce(ln.density_kg_per_l, ln.item_density));
    v_density := case when ln.base_unit = 'L' then round(coalesce(ln.density_kg_per_l, ln.item_density), 4) end;
    v_mass := private._mul_div_round(v_line_kg, p_planned_kg, v.basis_kg, 3);
    if v_mass <= 0 then
      raise exception 'qty_not_positive' using hint = format('كمية «%s» المخطّطة صفر عند هذا الحجم. أنتج كمية أكبر.', ln.name);
    end if;
    -- المخطّط بوحدة الأساس بقسمة واحدة وتقريب واحد لخطوة العدّاد من الكميات المضبوطة (القاعدة ١٨ ودرس WP1، مراجعة 0016 #10):
    -- كتلة السطر × الكمية ÷ (الأساس × كثافة السائل × الخطوة) عدد خطوات صحيح ثمّ × الخطوة. كانت الكتلة تُقرَّب لثلاث مراتب ثمّ للخطوة،
    -- فتزيد خطوةً كاملة على الحدّ (163.24983675 ← 163.250 ← 163.3 بدل 163.2). والكتلة المخطّطة للعرض كما هي.
    v_qty := case when ln.scale_step is null or not (abs(ln.scale_step) < 'Infinity') or ln.scale_step <= 0
      then private._mul_div_round(v_line_kg, p_planned_kg, v.basis_kg * coalesce(v_density, 1), 3)
      else round(private._mul_div_round(v_line_kg, p_planned_kg, v.basis_kg * coalesce(v_density, 1) * ln.scale_step, 0) * ln.scale_step, 3) end;
    if v_qty <= 0 then
      raise exception 'qty_not_positive' using hint = format('كمية «%s» المخطّطة أصغر من دقّة عدّادها. أنتج كمية أكبر.', ln.name);
    end if;
    -- الوقود والتعبئة خارج كتلة المدخلات (FOUNDATION القاعدة ٢٢: «بدون الأكياس والوقود»، مراجعة 0016 #2): السطر يُسحب ويُحسب
    -- بكلفته، والهدر على الباقي. و«داخل الكتلة» لقطة سطر الخلطة عند تفعيلها لا نوع المادّة الآن (مراجعة 0016 الثانية #2): تصحيح النوع
    -- بعد التفعيل لا ينقص كتلة دفعة جديدة من النسخة؛ والفراغ (نسخة بلا لقطة) داخل الكتلة دفاعاً، وverify_mill الفحص ٣ يمسكه.
    insert into public.production_inputs (org_id, batch_id, line_no, item_id, base_unit, density_kg_per_l, planned_qty_base, planned_mass_kg, in_basis)
    values (v_org, d.id, ln.line_no, ln.item_id, ln.base_unit, v_density, v_qty, v_mass, coalesce(ln.in_basis, true));
    v_lines := v_lines + 1;
  end loop;
  if v_lines = 0 then
    raise exception 'doc_empty' using hint = 'الخلطة بلا مواد. راجعها قبل الإنتاج.';
  end if;
  for rt in
    select x.line_no, x.category_id, x.amount_per_ton from public.recipe_cost_rates x
    where x.org_id = v_org and x.version_id = v.id order by x.line_no
  loop
    v_amount := private._mul_div_round(rt.amount_per_ton, p_planned_kg, 1000, 2);
    insert into public.production_costs (org_id, batch_id, line_no, category_id, planned_amount, amount, source)
    values (v_org, d.id, rt.line_no, rt.category_id, v_amount, v_amount, 'recipe');
  end loop;
  return jsonb_build_object('id', d.id, 'kind', 'production', 'status', 'draft', 'version', d.version,
    'recipe_id', r.id, 'recipe_name', r.name, 'recipe_version_id', v.id, 'output_item_id', o.id,
    'input_warehouse_id', wi.id, 'output_warehouse_id', wo.id, 'planned_kg', p_planned_kg::text, 'produced_on', p_produced_on,
    'lines', v_lines);
end
$$;

-- المعاينة (0015) كما هي، ويّا سطور التكاليف داخل money (المحسوب والمبلغ والمتاح غير المحمَّل من المصاريف المؤهّلة، بلا قفل)
-- والكلف اليدوية الحقيقية في extra_value والكلفة الكلّية وكلفة الكيلو؛ ومشكلة costs_unfunded لكلّ سطر لا يكفيه المتاح بأرقامها
-- لأدوار الكلفة، ولغيرهم مشكلة واحدة بلا أرقام كي لا يتسرّب مال (0016، القاعدة ٢٠). ومراجعة 0016 الثانية: تلك المشكلة بلا أرقام بعد
-- الختم فقط، وقبله لمن يملك الترحيل ولا يرى مصاريف الوحدة costs_unsealed_scope تسمّيها؛ وno_mass_inputs لدفعة بلا مادّة داخل الكتلة؛
-- وexpenses_visible على الجذر.
create or replace function public.preview_production(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  d public.production_batches;
  wi public.warehouses;
  wo public.warehouses;
  r record;
  dr record;
  v_lines jsonb := '[]'::jsonb;
  v_draws jsonb;
  v_before numeric[];
  v_need numeric;
  v_got numeric;
  v_value numeric;
  v_total numeric := 0;
  v_mass numeric := 0;
  v_plan text := '';
  v_pieces text[];
  v_problems jsonb := '[]'::jsonb;
  v_short boolean := false;
  v_out numeric;
  v_shrink numeric;
  v_pct numeric;
  v_div uuid;
  v_date jsonb;
  v_cost boolean := public.can_see_cost();
  c record;
  v_costs jsonb := '[]'::jsonb;
  v_extra numeric := 0.00;
  v_free numeric;
  v_unfunded boolean := false;
  v_exp boolean;
  v_positive boolean := false;
  v_has_mass boolean := false;
begin
  perform private.require('read');
  select * into d from public.production_batches where org_id = v_org and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذه الدفعة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  select * into wi from public.warehouses where org_id = v_org and id = d.input_warehouse_id;
  select * into wo from public.warehouses where org_id = v_org and id = d.output_warehouse_id;
  if not public.in_scope_wh(wi.id) then
    raise exception 'out_of_scope' using hint = format('المخزن «%s» خارج نطاقك.', wi.name);
  end if;
  -- أرقام المصاريف (المتاح والمطلوب) لمن يرى الكلفة ووحدة مخزن المدخلات بنطاقه (E40، مراجعة 0016 #12): المحصور بمخزن بلا وحدته
  -- لا يرى مصاريفها، فيرى costs_unfunded بلا أرقام كغير أدوار الكلفة.
  v_exp := v_cost and public.in_scope_division(wi.division_id);
  for v_div in select distinct x from unnest(array[wi.division_id, wo.division_id]) as x order by 1 loop
    v_date := private.date_problem(d.produced_on, v_div, false);
    if v_date is not null then
      v_problems := v_problems || jsonb_build_array(v_date);
    end if;
  end loop;
  for r in
    select p.*, i.name, i.tracks_expiry, i.archived_at
    from public.production_inputs p join public.items i on i.org_id = p.org_id and i.id = p.item_id
    where p.org_id = v_org and p.batch_id = d.id order by p.line_no
  loop
    v_need := coalesce(r.actual_qty_base, r.planned_qty_base);
    select coalesce(array_agg(x.q order by x.line_no), '{}') into v_before from (
      select p2.line_no, coalesce(p2.actual_qty_base, p2.planned_qty_base) as q
      from public.production_inputs p2
      where p2.org_id = v_org and p2.batch_id = d.id and p2.item_id = r.item_id and p2.line_no < r.line_no
    ) as x;
    v_draws := '[]'::jsonb;
    v_pieces := '{}'::text[];
    v_got := 0;
    v_value := 0;
    for dr in select * from private.draw_plan(r.item_id, wi.id, v_need, d.produced_on, null, false, v_before) loop
      v_pieces := v_pieces || private.plan_piece(dr.lot_id, dr.qty, dr.value);
      v_got := v_got + dr.qty;
      v_value := v_value + dr.value;
      v_draws := v_draws || jsonb_build_array(jsonb_build_object('lot_id', dr.lot_id, 'qty', dr.qty::text,
        'money', jsonb_build_object('value', dr.value::text)));
    end loop;
    if v_got < v_need then
      v_short := true;
      v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'insufficient_stock', 'item_id', r.item_id, 'item_name', r.name,
        'need', v_need::text, 'have', v_got::text, 'unit', r.base_unit));
    end if;
    if r.archived_at is not null then
      v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'item_archived', 'item_id', r.item_id, 'item_name', r.name));
    end if;
    v_total := v_total + v_value;
    if r.in_basis then
      v_mass := v_mass + coalesce(private.input_mass_kg(v_need, r.base_unit, r.density_kg_per_l), 0);
      v_has_mass := true;
    end if;
    v_plan := v_plan || r.id::text || '|' || array_to_string(v_pieces, ';') || '/';
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('input_id', r.id, 'line_no', r.line_no, 'item_id', r.item_id,
      'item_name', r.name, 'base_unit', r.base_unit, 'planned_qty', r.planned_qty_base::text, 'actual_qty', r.actual_qty_base::text,
      'draw_qty', v_got::text, 'in_basis', r.in_basis, 'tracks_expiry', r.tracks_expiry,
      'money', jsonb_build_object('value', v_value::text)));
  end loop;
  -- دفعة بلا مادّة داخل الكتلة (مراجعة 0016 الثانية #6): كلّ سطورها وقود أو تعبئة (بالتبديل أو بحذف آخر مادّة أوّلية) فكتلتها صفر،
  -- والترحيل كان يرمي خطأ القيد الخام 23514 بلا تلميح. مشكلة مسمّاة تمنع الترحيل.
  if not v_has_mass then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'no_mass_inputs'));
  end if;
  v_out := coalesce(d.output_qty_kg, round(v_mass, 3));
  v_shrink := round(v_mass - v_out, 3);
  v_pct := private.shrink_pct(v_shrink, v_mass);
  if not private.shrink_ok(v_shrink, round(v_mass, 3)) and nullif(btrim(coalesce(d.shrink_reason, '')), '') is null then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'shrink_out_of_range', 'shrink_kg', v_shrink::text, 'shrink_pct', v_pct::text));
  end if;
  if (select i.tracks_expiry from public.items i where i.org_id = v_org and i.id = d.output_item_id) and d.output_expiry_on is null then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'expiry_required'));
  end if;
  -- الناتج لا يولد منتهياً (مراجعة 0016 #9): انتهاء قبل يوم الإنتاج يجعل العلف كلّه مخزوناً لا يُسحب إلّا بإتلاف.
  if private.lot_expired((select i.tracks_expiry from public.items i where i.org_id = v_org and i.id = d.output_item_id), d.output_expiry_on, d.produced_on) then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'output_expired', 'expiry_on', d.output_expiry_on, 'produced_on', d.produced_on));
  end if;
  for c in
    select pc.id, pc.line_no, pc.category_id, pc.planned_amount, pc.amount, pc.source, k.name as category_name
    from public.production_costs pc join public.expense_categories k on k.org_id = pc.org_id and k.id = pc.category_id
    where pc.org_id = v_org and pc.batch_id = d.id order by pc.line_no
  loop
    v_free := private.mill_expense_free(c.category_id, wi.division_id);
    v_extra := v_extra + c.amount;
    v_positive := v_positive or c.amount > 0;
    v_costs := v_costs || jsonb_build_array(jsonb_build_object('cost_id', c.id, 'line_no', c.line_no, 'category_id', c.category_id,
      'category_name', c.category_name, 'planned_amount', c.planned_amount::text, 'amount', c.amount::text, 'source', c.source,
      'available', case when v_exp then v_free::text end));
    if d.status = 'draft' and c.amount > v_free then
      v_unfunded := true;
      if v_exp then
        v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'costs_unfunded', 'category_id', c.category_id,
          'category_name', c.category_name, 'need', c.amount::text, 'have', v_free::text));
      end if;
    end if;
  end loop;
  -- لمن لا يرى مصاريف الوحدة: costs_unfunded بلا أرقام بعد الختم فقط (مراجعة 0016 الثانية #0): قبله هو بالضبط الوحي الذي يستخرج به
  -- المتاح (يكتب المبلغ ثمّ يسأل)، وبعده لا يتغيّر مبلغ إلّا ويُفرَّغ الختم. وقبل الختم لمن يملك الترحيل مشكلة تسمّي الوحدة: يُرحّل بعد
  -- أن يختمها من يراها (ومشغّل المعمل يغطّيه costs_pending).
  if v_unfunded and not v_exp and d.costs_confirmed_at is not null then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'costs_unfunded'));
  end if;
  if not v_exp and d.status = 'draft' and d.costs_confirmed_at is null and v_positive and public.can('production.post') then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'costs_unsealed_scope',
      'division_name', (select dv.name from public.divisions dv where dv.org_id = v_org and dv.id = wi.division_id)));
  end if;
  if d.status = 'draft' and d.costs_confirmed_at is null and not public.can('production.post') then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'costs_pending'));
  end if;
  return private.mask(jsonb_build_object('id', d.id, 'kind', 'production', 'status', d.status, 'version', d.version,
    'produced_on', d.produced_on, 'planned_kg', d.planned_kg::text, 'input_mass_kg', round(v_mass, 3)::text,
    'output_qty_kg', v_out::text, 'output_expiry_on', d.output_expiry_on, 'shrink_kg', v_shrink::text, 'shrink_pct', v_pct::text,
    'shrink_reason', d.shrink_reason, 'shrink_ok', private.shrink_ok(v_shrink, round(v_mass, 3)), 'costs_confirmed', d.costs_confirmed_at is not null,
    -- خارج money (ليس مالاً، مراجعة 0016 الثانية): هل يرى القارئ مصاريف وحدة مخزن المدخلات (المتاح وأرقام النقص)؛ الشاشة تقفل به التكاليف.
    'expenses_visible', v_exp,
    'input_warehouse', jsonb_build_object('id', wi.id, 'name', wi.name, 'division_id', wi.division_id,
      'division_name', (select dv.name from public.divisions dv where dv.org_id = v_org and dv.id = wi.division_id)),
    'output_warehouse', jsonb_build_object('id', wo.id, 'name', wo.name),
    'lines', v_lines, 'problems', v_problems, 'can_post', d.status = 'draft' and not v_short and v_problems = '[]'::jsonb,
    'plan_token', private.plan_token(v_plan),
    'money', jsonb_build_object('input_value', v_total::text, 'extra_value', v_extra::text, 'total_value', (v_total + v_extra)::text,
      'cost_per_kg', private.per_unit(v_total + v_extra, v_out)::text, 'costs', v_costs)));
end
$$;

-- الترحيل (0015) كما هو، ويّا تحميل سطور التكاليف (0016، القاعدة ٢٠): بعد قفل الدفعة وقبل المواد والمخازن (§3) تُقفل المصاريف
-- المؤهّلة لكلّ فئات سطور الدفعة بترتيب ثابت واحد (التاريخ ثمّ وقت التسجيل ثمّ المعرّف، فترحيلان لا يتقافلان)، ثمّ يُحمَّل كلّ سطر
-- بترتيب رقمه من المصاريف الأقدم فالأحدث: نفس المنشأة والفئة، ووحدة المصروف = وحدة مخزن المدخلات، ويدوي (نقداً أو بالدين) غير
-- ملغى، والمتاح = مبلغه − تحميلاته الفعّالة. لا يكفي ← expense_overloaded بأرقامه لمن يرى الكلفة ووحدة مخزن المدخلات وبلاها لغيره.
-- والكلفة الكلّية = السحوبات + مجموع السطور، ودفعة الناتج بقيمتها بالضبط (القاعدة ٢١). ومراجعة 0016: التحميل ممّا قفلته جملة القفل
-- وحدها، والكثافة لقطة لا تُقارن، والهدر بالنسبة المضبوطة، والناتج لا يولد منتهياً.
create or replace function public.post_production(p_id uuid, p_expected_version int, p_expected_plan text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'post_production';
  v_cached jsonb;
  v_org uuid := public.auth_org();
  d public.production_batches;
  wi public.warehouses;
  wo public.warehouses;
  o public.items;
  r record;
  dr record;
  l public.stock_lots;
  v_items uuid[];
  v_whs uuid[];
  v_need numeric;
  v_value numeric;
  v_total numeric := 0;
  v_mass numeric := 0;
  v_out numeric;
  v_shrink numeric;
  v_pct numeric;
  v_plan text := '';
  v_pieces text[];
  v_lines jsonb := '[]'::jsonb;
  v_no text;
  v_div uuid;
  v_date date;
  v_cost boolean := public.can_see_cost();
  c record;
  e record;
  v_extra numeric := 0.00;
  v_left numeric;
  v_take numeric;
  v_locked uuid[];
  v_exp boolean;
begin
  set local lock_timeout = '5s';
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'version', p_expected_version));
  if v_cached is not null then
    return v_cached;
  end if;
  select * into d from public.production_batches where org_id = v_org and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذه الدفعة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  -- الدور: ترحيل الدفعة للمدير أو المحاسب، ومشغّل المعمل بعد ختم الكلف (FOUNDATION ٥٣٥).
  if not public.can('production.post', d.costs_confirmed_at is not null) then
    raise exception 'forbidden' using hint = case when public.can('production.draft') and d.costs_confirmed_at is null
      then 'تُرحَّل الدفعة بعد أن يختم المحاسب أو المدير كلفها. اطلب منه ختمها.'
      else 'لا تملك صلاحية ترحيل دفعة الإنتاج. اطلب من مالك المنشأة تغيير دورك إن كنت تحتاج إليه.' end;
  end if;
  wi := private.stock_wh(d.input_warehouse_id, true);
  wo := private.stock_wh(d.output_warehouse_id, false);
  -- أرقام المصاريف في التلميح لمن يرى الكلفة ووحدة مخزن المدخلات بنطاقه (E40، مراجعة 0016 #12)، والترحيل لغيره بعد الختم فقط (مراجعة
  -- 0016 الثانية #0: costs_unsealed_scope أدناه): التحميل يكتبه النظام، كمشغّل المعمل الذي يرحّل بعد الختم ولا يرى المال.
  v_exp := v_cost and public.in_scope_division(wi.division_id);
  v_date := d.produced_on;
  for v_div in select distinct x from unnest(array[wi.division_id, wo.division_id]) as x order by 1 loop
    perform private.check_post_date(v_date, v_div);
  end loop;
  select * into d from public.production_batches where org_id = v_org and id = p_id for update;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'هذه الدفعة ليست مسوّدة: رُحّلت أو أُلغيت من قبل.';
  end if;
  if p_expected_version is null or d.version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّرت المسوّدة بعد المعاينة. راجعها وعاينها من جديد قبل الترحيل.';
  end if;
  -- التاريخ المفحوص قبل القفل نفسه بعده (درس WP4): وإلّا رُحّلت دفعة بفترة مقفلة أو بتاريخ غيّره كاتب آخر.
  if d.produced_on is distinct from v_date then
    raise exception 'stale_draft' using hint = 'تغيّر تاريخ المسوّدة أثناء الترحيل. راجعها وعاينها من جديد.';
  end if;
  select array_agg(distinct p.item_id) into v_items from public.production_inputs p where p.org_id = v_org and p.batch_id = d.id;
  if v_items is null then
    raise exception 'doc_empty' using hint = 'الدفعة بلا مواد. اطوِها وأنشئ غيرها من خلطة فيها مواد.';
  end if;
  -- دفعة بلا مادّة داخل الكتلة (مراجعة 0016 الثانية #6): الكتلة صفر، وقيد production_batches_input_mass_check كان يرفضها خطأً خاماً بعد
  -- السحب كلّه. قبل قفل المصاريف والمواد.
  if not exists (select 1 from public.production_inputs p where p.org_id = v_org and p.batch_id = d.id and p.in_basis) then
    raise exception 'no_mass_inputs' using hint = 'الدفعة بلا مادّة داخل الكتلة: الوقود والتعبئة وحدهما لا يصنعان علفاً. أضف مادّة أوّلية أو احذف المسوّدة.';
  end if;
  -- من لا يرى مصاريف وحدة مخزن المدخلات يرحّل بعد الختم فقط (مراجعة 0016 الثانية #0، ق٢١): الختم يكتبه من يراها، فلا يُحمَّل منها مبلغ
  -- لم يقرّه أحد يراها. ودفعة بلا سطر كلفة موجب تُرحَّل كما كانت لمن يملك الفعل. تحت قفل الدفعة (سطور الكلفة وختمها تُكتب تحته).
  if not v_exp and d.costs_confirmed_at is null
    and exists (select 1 from public.production_costs pc where pc.org_id = v_org and pc.batch_id = d.id and pc.amount > 0) then
    raise exception 'costs_unsealed_scope' using hint = format('تكاليف هذه الدفعة تُحمَّل من مصاريف وحدة «%s» خارج نطاقك، فتُرحَّل بعد أن يختمها محاسب أو مدير يرى تلك الوحدة.',
      (select dv.name from public.divisions dv where dv.org_id = v_org and dv.id = wi.division_id));
  end if;
  -- المصاريف المؤهّلة هي ما قفلته جملة القفل نفسها (مراجعة 0016 #0 و#7): حلقة التحميل جملة جديدة بلقطة جديدة (READ COMMITTED)، فكانت
  -- ترى مصروفاً ثُبّت بينما الترحيل ينتظر قفلاً آخر فتحمّل منه بلا قفله، فيُحمَّل الدينار مرّتين أو يبقى تحميل فعّال على مصروف أُلغي
  -- أثناء الانتظار. والمتاح (المبلغ − التحميلات الفعّالة، ولا صفّ عكس) يُحسب في الحلقة بعد القفل.
  select coalesce(array_agg(s.id order by s.on_date, s.created_at, s.id), '{}') into v_locked from (
    select x.id, x.on_date, x.created_at from public.expenses x
    where x.org_id = v_org and x.division_id = wi.division_id and x.reverses_id is null and x.amount > 0 and x.source in ('cash', 'credit')
      and x.category_id in (select pc.category_id from public.production_costs pc where pc.org_id = v_org and pc.batch_id = d.id and pc.amount > 0)
    order by x.on_date, x.created_at, x.id
    for update of x) as s;
  for c in
    select pc.id, pc.amount, k.name as category_name, pc.category_id
    from public.production_costs pc join public.expense_categories k on k.org_id = pc.org_id and k.id = pc.category_id
    where pc.org_id = v_org and pc.batch_id = d.id order by pc.line_no
  loop
    v_extra := v_extra + c.amount;
    continue when c.amount = 0;
    v_left := c.amount;
    for e in
      select x.id, x.amount - coalesce((select sum(a.amount) from public.production_cost_allocations a
          where a.org_id = x.org_id and a.expense_id = x.id and a.voided_at is null), 0) as free
      from public.expenses x
      where x.org_id = v_org and x.id = any (v_locked) and x.category_id = c.category_id and x.division_id = wi.division_id and x.reverses_id is null and x.amount > 0
        and x.source in ('cash', 'credit') and not exists (select 1 from public.expenses z where z.org_id = x.org_id and z.reverses_id = x.id)
      order by x.on_date, x.created_at, x.id
    loop
      exit when v_left = 0;
      continue when e.free <= 0;
      v_take := round(least(v_left, e.free), 2);
      insert into public.production_cost_allocations (org_id, cost_id, batch_id, expense_id, amount) values (v_org, c.id, d.id, e.id, v_take);
      v_left := v_left - v_take;
    end loop;
    if v_left > 0 then
      raise exception 'expense_overloaded' using hint = case when v_exp
        then format('%s: المطلوب %s والمتاح من المصاريف المسجّلة %s. سجّل المصروف أوّلاً أو قلّل المبلغ.', c.category_name,
          private.money_text(c.amount), private.money_text(c.amount - v_left))
        else format('تكاليف «%s» أكبر من المصاريف المسجّلة لها. اطلب من المحاسب أو المدير تسجيل المصروف أو تعديل السطر.', c.category_name) end;
    end if;
  end loop;
  perform private.lock_masters(array[wi.id, wo.id], v_items || array[d.output_item_id], true);
  select * into o from public.items where org_id = v_org and id = d.output_item_id;
  if not private.item_admissible(wo.kind, o.kind) then
    raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s»: نوع المادّة لا يناسب نوع مخزن الناتج.', o.name, wo.name);
  end if;
  if o.tracks_expiry and d.output_expiry_on is null then
    raise exception 'expiry_required' using hint = format('«%s» تُتابَع صلاحيتها، فاكتب تاريخ انتهاء الناتج قبل الترحيل.', o.name);
  end if;
  -- الناتج لا يولد منتهياً (مراجعة 0016 #9): دفعة بانتهاء قبل يوم إنتاجها لا تُسحب إلّا بإتلاف، وقيمتها عالقة.
  if private.lot_expired(o.tracks_expiry, d.output_expiry_on, d.produced_on) then
    raise exception 'output_expired' using hint = format('تاريخ انتهاء «%s» (%s) قبل يوم الإنتاج (%s). صحّح التاريخ قبل الترحيل.',
      o.name, to_char(d.output_expiry_on, 'DD/MM/YYYY'), to_char(d.produced_on, 'DD/MM/YYYY'));
  end if;
  v_whs := array_fill(wi.id, array[cardinality(v_items)]) || array[wo.id];
  perform private.lock_balances(v_items || array[d.output_item_id], v_whs);
  for r in
    select p.*, i.name, i.base_unit as item_base, i.density_kg_per_l as item_density, i.tracks_expiry
    from public.production_inputs p join public.items i on i.org_id = p.org_id and i.id = p.item_id
    where p.org_id = v_org and p.batch_id = d.id order by p.line_no
  loop
    -- لقطة الوحدة تُقارن بعد قفل المادّة (درس WP6، E46): تغيّرها بعد المسوّدة كان يرحّل كمية بوحدة غير التي حُسبت. والكثافة لقطة
    -- على السطر (FOUNDATION القاعدة ٤): تعديلها في المادّة بعد التفعيل لا يغيّر نسخة مفعَّلة ولا مسوّدة قائمة، فلا يوقف الإنتاج
    -- (مراجعة 0016 #3: كانت تُقارن بكثافة المادّة الحالية فتتوقّف كلّ دفعة من النسخة، والطيّ وإعادة الإنشاء يعيدان اللقطة نفسها).
    if r.item_base is distinct from r.base_unit then
      raise exception 'item_changed' using hint = format('تغيّرت وحدة «%s» بعد إنشاء الدفعة. احذف سطرها وأضفه من جديد، أو احذف المسوّدة وأنشئها من جديد.', r.name);
    end if;
    v_need := coalesce(r.actual_qty_base, r.planned_qty_base);
    v_pieces := '{}'::text[];
    v_value := 0;
    for dr in select * from private.draw(r.item_id, wi.id, v_need, d.produced_on, null, false) loop
      v_pieces := v_pieces || private.plan_piece(dr.lot_id, dr.qty, dr.value);
      perform private.apply_move(dr.lot_id, 'production', d.id, r.id, -dr.qty, -dr.value, d.produced_on, null, coalesce(r.tracks_expiry, false));
      v_value := v_value + dr.value;
    end loop;
    insert into public.production_input_values (org_id, input_id, batch_id, value) values (v_org, r.id, d.id, v_value);
    v_total := v_total + v_value;
    if r.in_basis then
      v_mass := v_mass + private.input_mass_kg(v_need, r.base_unit, r.density_kg_per_l);
    end if;
    v_plan := v_plan || r.id::text || '|' || array_to_string(v_pieces, ';') || '/';
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('input_id', r.id, 'item_id', r.item_id, 'qty', v_need::text,
      'money', jsonb_build_object('value', v_value::text)));
  end loop;
  if p_expected_plan is null or private.plan_token(v_plan) is distinct from p_expected_plan then
    raise exception 'stale_preview' using hint = 'تغيّر المخزون بعد المعاينة فتغيّرت الدفعات المسحوبة أو كمياتها. عاين الدفعة من جديد ووافق عليها قبل الترحيل.';
  end if;
  v_mass := round(v_mass, 3);
  v_out := coalesce(d.output_qty_kg, v_mass);
  if v_out is null or not (abs(v_out) < 'Infinity') or v_out <= 0 then
    raise exception 'output_not_positive' using hint = 'وزن الناتج يجب أن يكون أكبر من صفر.';
  end if;
  v_shrink := round(v_mass - v_out, 3);
  v_pct := private.shrink_pct(v_shrink, v_mass);
  if not private.shrink_ok(v_shrink, v_mass) and nullif(btrim(coalesce(d.shrink_reason, '')), '') is null then
    raise exception 'shrink_out_of_range' using hint = format('الهدر %s كغم (%s٪) خارج المدى المقبول (صفر إلى ٣٪). اكتب سبب الفرق أو راجع الوزن.',
      to_char(v_shrink, 'FM999999990.999'), to_char(coalesce(v_pct, 0), 'FM999990.99'));
  end if;
  l := private.new_lot(o.id, wo.id, d.produced_on, d.output_expiry_on, null, v_out, v_total + v_extra, 'production', d.id, null);
  perform private.apply_move(l.id, 'production', d.id, null, v_out, v_total + v_extra, d.produced_on, null);
  insert into public.production_values (org_id, batch_id, input_value, extra_value, total_value) values (v_org, d.id, v_total, v_extra, v_total + v_extra);
  v_no := private.next_doc_no('PD', d.produced_on);
  update public.production_batches set status = 'posted', doc_no = v_no, client_ref = p_client_ref, posted_at = now(), posted_by = auth.uid(),
    output_qty_kg = v_out, input_mass_kg = v_mass, shrink_kg = v_shrink, output_lot_id = l.id
  where org_id = v_org and id = d.id;
  for v_div in select distinct x from unnest(array[wi.division_id, wo.division_id]) as x order by 1 loop
    perform private.mark_division_posted(v_div);
  end loop;
  -- ref_store يحفظ النتيجة كما هي ويرجّعها مقنَّعة (٠٠٠٦)، فالقناع هنا زائد: الأمين ومشغّل المعمل لا يريان money.
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'kind', 'production', 'status', 'posted', 'doc_no', v_no,
    'produced_on', d.produced_on, 'output_item_id', o.id, 'output_lot_id', l.id, 'output_qty_kg', v_out::text,
    'input_mass_kg', v_mass::text, 'shrink_kg', v_shrink::text, 'shrink_pct', v_pct::text, 'lines', v_lines,
    'money', jsonb_build_object('input_value', v_total::text, 'extra_value', v_extra::text, 'total_value', (v_total + v_extra)::text,
      'cost_per_kg', private.per_unit(v_total + v_extra, v_out)::text)));
end
$$;

-- إلغاء الدفعة (0015) كما هو، وتحميلات الدفعة تتوقّف عن العدّ (0016، القاعدة ٢٠): المصروف يعود متاحاً فيُلغى أو يُحمَّل على
-- دفعة أخرى.
create or replace function public.void_production(p_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_production';
  v_cached jsonb;
  v_org uuid := public.auth_org();
  v_reason text;
  d public.production_batches;
  wi public.warehouses;
  wo public.warehouses;
  m public.stock_moves;
  l public.stock_lots;
  v_items uuid[];
  v_whs uuid[];
  v_back jsonb := '[]'::jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  if v_reason is null then
    raise exception 'reason_required' using hint = 'اكتب سبب الإلغاء.';
  end if;
  select * into d from public.production_batches where org_id = v_org and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذه الدفعة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  wi := private.stock_wh(d.input_warehouse_id, true);
  wo := private.stock_wh(d.output_warehouse_id, false);
  perform private.check_void_date();
  select * into d from public.production_batches where org_id = v_org and id = p_id for update;
  if d.status = 'void' then
    raise exception 'already_void' using hint = 'هذه الدفعة ملغاة من قبل.';
  end if;
  if d.status <> 'posted' then
    raise exception 'not_posted' using hint = 'هذه الدفعة مسوّدة لم تُرحَّل؛ تُطوى المسوّدة بدل إلغائها.';
  end if;
  select array_agg(distinct p.item_id) into v_items from public.production_inputs p where p.org_id = v_org and p.batch_id = d.id;
  perform private.lock_masters(array[wi.id, wo.id], v_items || array[d.output_item_id], false);
  v_whs := array_fill(wi.id, array[cardinality(v_items)]) || array[wo.id];
  perform private.lock_balances(v_items || array[d.output_item_id], v_whs);
  for l in select * from public.stock_lots x where x.org_id = v_org and x.source_kind = 'production' and x.source_id = d.id order by x.id for no key update loop
    perform private.check_lot_intact(l.id);
    v_back := v_back || jsonb_build_array(l.id);
  end loop;
  -- الحركات الفعلية للمستند (لا سطوره): كلّ حركة أصلية بلا عكسية تُعكس بيوم الإلغاء بنفس دفعتها.
  for m in
    select x.* from public.stock_moves x
    where x.org_id = v_org and x.doc_kind = 'production' and x.doc_id = d.id and x.reverses_move_id is null
      and not exists (select 1 from public.stock_moves y where y.org_id = x.org_id and y.reverses_move_id = x.id)
    order by x.qty, x.id
  loop
    perform private.apply_move(m.lot_id, 'production', d.id, m.doc_line_id, -m.qty, -m.value, public.app_today(), m.id);
  end loop;
  update public.production_cost_allocations set voided_at = now()
  where org_id = v_org and batch_id = d.id and voided_at is null;
  update public.production_batches set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
  where org_id = v_org and id = d.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'kind', 'production', 'status', 'void', 'doc_no', d.doc_no,
    'reversed_lots', v_back));
end
$$;

-- لوحة المعمل (0015) كما هي، وكلّ خلطة تزيد تحت money كلفة الكيلو المتوقّعة لنسختها المفعَّلة (0016، D1، للتخطيط لا لقيمة
-- مخزون): فارغة بلا نسخة مفعَّلة أو إن بقيت مادّة بلا سعر (لا رقم ناقص بصمت). ومراجعة 0016 الرابعة (ق٤٢): كتلة القطعة بالمساعد الذي لا يرمي.
create or replace function public.recipes_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
begin
  perform private.require('read');
  return private.mask(jsonb_build_object('today', public.app_today(), 'recipes', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', r.name, 'note', r.note, 'archived', r.archived_at is not null, 'version', r.version,
      'output_item', jsonb_build_object('id', i.id, 'name', i.name, 'base_unit', i.base_unit, 'kind', i.kind),
      'active', (select jsonb_build_object('id', v.id, 'version_no', v.version_no, 'basis_kg', v.basis_kg::text,
          'lines', (select count(*) from public.recipe_lines l where l.org_id = v.org_id and l.version_id = v.id),
          -- مواد النسخة بكتلتها بالكيلو من الأكبر: شريط التركيبة ورقاقاتها تُقرأ بلمحة قبل الأرقام. والكتلة بالمساعد الذي لا يرمي (مراجعة 0016
          -- الرابعة #1، ق٤٢): سطر باللتر بلا كثافة في نسخة مفعَّلة كان يرمي density_not_positive للوحة كلّها لكلّ قارئ، فكتلته فارغة وتُرتَّب أخيراً.
          'pieces', coalesce((select jsonb_agg(jsonb_build_object('item_id', l.item_id, 'item_name', i.name,
              'mass_kg', m.kg::text,
              -- لقطة «داخل الكتلة» (مراجعة 0016 الثانية #2، والشاشة ب-٨): شريط التركيبة يستثني الوقود والتعبئة.
              'in_basis', coalesce(l.in_basis, i.kind not in ('fuel', 'packaging')))
              order by m.kg desc nulls last, i.name collate "C", l.id)
            from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
              cross join lateral (select private.recipe_line_kg_or_null(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l)) as kg) as m
            where l.org_id = v.org_id and l.version_id = v.id), '[]'::jsonb))
        from public.recipe_versions v where v.org_id = r.org_id and v.recipe_id = r.id and v.status = 'active'),
      'draft', (select jsonb_build_object('id', v.id, 'version_no', v.version_no, 'basis_kg', v.basis_kg::text, 'version', v.version,
          'lines', (select count(*) from public.recipe_lines l where l.org_id = v.org_id and l.version_id = v.id))
        from public.recipe_versions v where v.org_id = r.org_id and v.recipe_id = r.id and v.status = 'draft'),
      -- الدفعات التي يقرؤها القارئ (أحد طرفيها بنطاقه، مراجعة 0016 الثانية #15): كانت بلا نطاق، فيرى المحصور عددها وآخر رقم وكلفته.
      'batches', (select count(*) from public.production_batches b join public.recipe_versions v2 on v2.org_id = b.org_id and v2.id = b.recipe_version_id
        where v2.org_id = r.org_id and v2.recipe_id = r.id and b.status = 'posted'
          and (public.in_scope_wh(b.input_warehouse_id) or public.in_scope_wh(b.output_warehouse_id))),
      'last_batch', (select jsonb_build_object('id', b.id, 'doc_no', b.doc_no, 'produced_on', b.produced_on, 'output_qty_kg', b.output_qty_kg::text,
          'money', jsonb_build_object('total_value', pv.total_value::text,
            'cost_per_kg', private.per_unit(pv.total_value, b.output_qty_kg)::text))
        from public.production_batches b
        join public.recipe_versions v3 on v3.org_id = b.org_id and v3.id = b.recipe_version_id
        left join public.production_values pv on pv.org_id = b.org_id and pv.batch_id = b.id
        where v3.org_id = r.org_id and v3.recipe_id = r.id and b.status = 'posted'
          and (public.in_scope_wh(b.input_warehouse_id) or public.in_scope_wh(b.output_warehouse_id))
        order by b.produced_on desc, b.id desc limit 1),
      'money', jsonb_build_object('expected_cost_per_kg', (select private.recipe_expected(v4.id) ->> 'cost_per_kg'
        from public.recipe_versions v4 where v4.org_id = r.org_id and v4.recipe_id = r.id and v4.status = 'active'))
    ) order by r.archived_at is not null, r.name_norm collate "C", r.id)
    from public.recipes r join public.items i on i.org_id = r.org_id and i.id = r.output_item_id
    where r.org_id = v_org), '[]'::jsonb),
    'stores', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'kind', w.kind) order by w.kind, w.name collate "C", w.id)
      from public.warehouses w
      where w.org_id = v_org and w.archived_at is null and w.kind in ('raw', 'feed') and public.in_scope_wh(w.id)), '[]'::jsonb),
    'feed_items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name) order by i.name_norm collate "C", i.id)
      from public.items i where i.org_id = v_org and i.archived_at is null and i.kind = 'feed'), '[]'::jsonb)));
end
$$;

-- بطاقة الخلطة (0015) كما هي، وتزيد لبانية الخلطة (0016): لكلّ سطر تحت money سعر الكلفة المكتوب وآخر شراء بجانب متوسّط المتاح؛
-- وتحت money معدّلات تكاليف الطنّ وكلفة الطنّ المتوقّعة (للتخطيط)؛ وفئات المصاريف الفعّالة غير النظامية لمنتقي المعدّلات (بلا مال). ومراجعة
-- 0016 الثالثة: لكلّ سطر وحدة الأساس من لقطته وunit_changed. والرابعة: unit_changed بشرط رفض الإنتاج نفسه، وunit_mismatch، والكتل بالمساعد
-- الذي لا يرمي (كتلة السطر وحصّته فارغتان لسطر باللتر بلا كثافة، ومجموع الكتلة فارغ إن كان داخلها). والخامسة (ق٥١): density_missing لكلّ سطر.
create or replace function public.recipe_detail(p_id uuid, p_version uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  r public.recipes;
  v public.recipe_versions;
begin
  perform private.require('read');
  select * into r from public.recipes where org_id = v_org and id = p_id;
  if r.id is null then
    raise exception 'recipe_not_found' using hint = 'هذه الخلطة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if p_version is not null then
    select * into v from public.recipe_versions where org_id = v_org and id = p_version and recipe_id = r.id;
    if v.id is null then
      raise exception 'doc_not_found' using hint = 'هذه النسخة غير موجودة في هذه الخلطة. حدّث الشاشة.';
    end if;
  else
    select * into v from public.recipe_versions where org_id = v_org and recipe_id = r.id and status = 'active';
    if v.id is null then
      select * into v from public.recipe_versions where org_id = v_org and recipe_id = r.id order by version_no desc limit 1;
    end if;
  end if;
  return private.mask(jsonb_build_object(
    'id', r.id, 'name', r.name, 'note', r.note, 'archived', r.archived_at is not null, 'version', r.version,
    'output_item', (select jsonb_build_object('id', i.id, 'name', i.name, 'base_unit', i.base_unit, 'kind', i.kind, 'tracks_expiry', i.tracks_expiry)
      from public.items i where i.org_id = v_org and i.id = r.output_item_id),
    'versions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'version_no', x.version_no, 'status', x.status,
        'basis_kg', x.basis_kg::text, 'activated_at', x.activated_at, 'version', x.version)
      order by x.version_no desc) from public.recipe_versions x where x.org_id = v_org and x.recipe_id = r.id), '[]'::jsonb),
    'selected', case when v.id is null then null else jsonb_build_object('id', v.id, 'version_no', v.version_no, 'status', v.status,
      'basis_kg', v.basis_kg::text, 'note', v.note, 'activated_at', v.activated_at, 'version', v.version) end,
    'lines', case when v.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'line_no', l.line_no, 'item_id', l.item_id, 'item_name', i.name,
        -- «داخل الكتلة» لقطة النسخة المجمَّدة، والنوع الحيّ للمسوّدة (مراجعة 0016 الثانية #2)، ومجموع الكتلة بالشرط نفسه.
        -- ووحدة الأساس لقطتها (والوحدة الحيّة للمسوّدة)، وunit_changed بشرط رفض الإنتاج نفسه (مراجعة 0016 الثالثة #2 والرابعة #0، ق٤١): لقطة
        -- كيلوغرام ومادّة صارت باللتر، أو مادّة صارت قطعة، فلا يُنتَج بالنسخة حتّى تُنشأ غيرها (create_production: item_changed)؛ ولقطة لتر ومادّة صارت
        -- بالكيلو يُنتَج بها، فلا تنبيه. وunit_mismatch سطر مكتوب باللتر لمادّة ليست باللتر الآن (الرابعة #1، ق٤٢): لا يُفعَّل (bad_recipe_unit).
        'kind', i.kind, 'base_unit', coalesce(l.base_unit, i.base_unit),
        'unit_changed', l.base_unit is not null and ((l.base_unit = 'kg' and i.base_unit = 'L') or i.base_unit not in ('kg', 'L')),
        'unit_mismatch', l.unit = 'L' and i.base_unit <> 'L',
        -- سائل بلا كثافة (مراجعة 0016 الخامسة #0، ق٥١): وحدة اللقطة (والحيّة للمسوّدة) لتر، ولا كثافة في اللقطة ولا في المادّة؛ وهو ما يرفض التفعيل
        -- لأجله (density_required). للكتلة الفارغة سببان (مادّة صارت بالكيلو، أو سائل فُرّغت كثافته)، وكان المفتاح يسمّي الأوّل وحده فتقفل البطاقة
        -- «فعّل النسخة» بلا اسم ولا علاج؛ وسطر بالكيلو لسائل بلا كثافة كتلته معروفة ويرفضه التفعيل كذلك.
        'density_missing', coalesce(l.base_unit, i.base_unit) = 'L' and coalesce(l.density_kg_per_l, i.density_kg_per_l) is null,
        'in_basis', coalesce(l.in_basis, i.kind not in ('fuel', 'packaging')), 'category_id', i.category_id,
        'category_name', (select c.name from public.item_categories c where c.org_id = v_org and c.id = i.category_id),
        -- كتلة السطر وحصّته بالمساعد الذي لا يرمي (الرابعة #1، ق٤٢): فارغتان لسطر باللتر بلا كثافة، وكانت البطاقة كلّها ترمي density_not_positive.
        'qty', l.qty::text, 'unit', l.unit, 'mass_kg', m.kg::text,
        'share_pct', case when m.kg is not null then private._mul_div_round(m.kg, 100, v.basis_kg, 2) end::text,
        'money', jsonb_build_object('unit_cost', (select private.per_unit(sum(s.value_left), sum(s.qty_left))::text
          from public.stock_lots s where s.org_id = v_org and s.item_id = l.item_id and s.qty_left > 0 and public.in_scope_wh(s.warehouse_id)),
          'cost_price', (select p.cost_price::text from public.item_prices p where p.org_id = v_org and p.item_id = l.item_id),
          'last_price', private.item_last_price(l.item_id)::text))
      order by l.line_no)
      from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
        cross join lateral (select private.recipe_line_kg_or_null(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l)) as kg) as m
      where l.org_id = v_org and l.version_id = v.id), '[]'::jsonb) end,
    -- مجموع الكتلة داخلها فارغ إن كانت كتلة سطر داخلها لا تُحسب (الرابعة #1، ق٤٢): لا مجموع ناقص بصمت.
    'mass_kg', case when v.id is null then null else (select case when bool_or(m.kg is null) then null else coalesce(sum(m.kg), 0) end
      from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
        cross join lateral (select private.recipe_line_kg_or_null(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l)) as kg) as m
      where l.org_id = v_org and l.version_id = v.id and coalesce(l.in_basis, i.kind not in ('fuel', 'packaging')))::text end,
    -- المرشَّحات لسطر جديد: مادّة فعّالة يستلمها مخزن المواد الأوّلية وتُقاس بالكيلو أو اللتر (القطعة لا تدخل العليقة).
    'pick_items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'base_unit', i.base_unit,
        'category_name', (select c.name from public.item_categories c where c.org_id = v_org and c.id = i.category_id))
        order by i.name_norm collate "C", i.id)
      from public.items i
      where i.org_id = v_org and i.archived_at is null and i.base_unit in ('kg', 'L') and private.item_admissible('raw', i.kind)), '[]'::jsonb),
    'expense_categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name collate "C", c.id)
      from public.expense_categories c where c.org_id = v_org and c.archived_at is null and c.system_code is null), '[]'::jsonb),
    'money', jsonb_build_object(
      'rates', case when v.id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'line_no', x.line_no,
          'category_id', x.category_id, 'category_name', c.name, 'amount_per_ton', x.amount_per_ton::text) order by x.line_no)
        from public.recipe_cost_rates x join public.expense_categories c on c.org_id = x.org_id and c.id = x.category_id
        where x.org_id = v_org and x.version_id = v.id), '[]'::jsonb) end,
      'expected', case when v.id is null then null else private.recipe_expected(v.id) - 'cost_per_kg' end)));
end
$$;

-- بطاقة الدفعة (0015) كما هي، وتزيد (0016): لكلّ سطر اسم المادّة التي حلّ محلّها البديل، وmoney كائناً للمسوّدة أيضاً (قيمها
-- فارغة قبل الترحيل) فيه سطور التكاليف وتحميلاتها الفعّالة من المصاريف (التاريخ والمبلغ ووصف المصروف). ومراجعة 0016 الثالثة: draws لمن
-- يرى مخزن المدخلات وحده.
create or replace function public.production_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  d public.production_batches;
  v public.recipe_versions;
  r public.recipes;
  pv public.production_values;
  v_exp boolean;
  v_in boolean;
  v_out boolean;
begin
  perform private.require('read');
  select * into d from public.production_batches where org_id = v_org and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذه الدفعة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  -- من طرفيها كالتحويل (مراجعة 0016 الثانية #7 و#15): من نطاقه مخزن المواد أو مخزن العلف يقرؤها، وscope يقول أيّهما فتخفي الشاشة ما
  -- لا يُفتح له (المعاينة وأفعال المسوّدة والإلغاء بمخزن المدخلات، ووجبات العلف بمخزنه).
  v_in := public.in_scope_wh(d.input_warehouse_id);
  v_out := public.in_scope_wh(d.output_warehouse_id);
  if not (v_in or v_out) then
    raise exception 'out_of_scope' using hint = 'مخزنا هذه الدفعة (مخزن المواد ومخزن العلف) خارج نطاقك.';
  end if;
  -- تحميلات المصاريف (ملاحظة المصروف وتاريخه ومبلغه) لمن يرى الكلفة ووحدة مخزن المدخلات بنطاقه (E40، مراجعة 0016 #12)، ولغيره null.
  v_exp := public.can_see_cost() and public.in_scope_division((select w.division_id from public.warehouses w where w.org_id = v_org and w.id = d.input_warehouse_id));
  select * into v from public.recipe_versions where org_id = v_org and id = d.recipe_version_id;
  select * into r from public.recipes where org_id = v_org and id = v.recipe_id;
  select * into pv from public.production_values where org_id = v_org and batch_id = d.id;
  return private.mask(jsonb_build_object(
    'id', d.id, 'doc_no', d.doc_no, 'status', d.status, 'version', d.version, 'produced_on', d.produced_on,
    'planned_kg', d.planned_kg::text, 'output_qty_kg', d.output_qty_kg::text, 'output_expiry_on', d.output_expiry_on,
    'input_mass_kg', d.input_mass_kg::text, 'shrink_kg', d.shrink_kg::text,
    'shrink_pct', private.shrink_pct(d.shrink_kg, d.input_mass_kg)::text, 'shrink_reason', d.shrink_reason,
    'note', d.note, 'void_reason', d.void_reason, 'costs_confirmed', d.costs_confirmed_at is not null,
    'scope', jsonb_build_object('input', v_in, 'output', v_out), 'expenses_visible', v_exp,
    'recipe', jsonb_build_object('id', r.id, 'name', r.name, 'version_id', v.id, 'version_no', v.version_no, 'basis_kg', v.basis_kg::text),
    'output_item', (select jsonb_build_object('id', i.id, 'name', i.name, 'base_unit', i.base_unit, 'tracks_expiry', i.tracks_expiry)
      from public.items i where i.org_id = v_org and i.id = d.output_item_id),
    'input_warehouse', (select jsonb_build_object('id', w.id, 'name', w.name) from public.warehouses w where w.org_id = v_org and w.id = d.input_warehouse_id),
    'output_warehouse', (select jsonb_build_object('id', w.id, 'name', w.name) from public.warehouses w where w.org_id = v_org and w.id = d.output_warehouse_id),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'line_no', p.line_no, 'item_id', p.item_id, 'item_name', i.name,
        'base_unit', p.base_unit, 'planned_qty', p.planned_qty_base::text, 'actual_qty', p.actual_qty_base::text,
        'used_qty', case when d.status = 'draft' then null else (select coalesce(-sum(m.qty), 0)::text from public.stock_moves m
          where m.org_id = v_org and m.doc_kind = 'production' and m.doc_id = d.id and m.doc_line_id = p.id) end,
        'in_basis', p.in_basis, 'is_substitute', p.is_substitute, 'reason', p.reason,
        'replaced_item_name', (select x.name from public.items x where x.org_id = v_org and x.id = p.replaced_item_id),
        -- من أيّ وجبات سُحب السطر (طلب المالك «أعرف منين صنعتها بالضبط»): السحوبات الأصلية بترتيبها، بالكمية موجبة ومصدر كلّ وجبة
        -- (رقم الاستلام أو الافتتاح أو التحويل)، بلا مال؛ وللمسوّدة null، ولطرف الناتج وحده null (مراجعة 0016 الثالثة #1، ق٣٢): وجبات مخزن
        -- المواد واستلاماته صفوف تمنعها سياسات جداولها عنه، كطرف الوجهة في التحويل يرى مصدر مرآته لا استلامات المصدر.
        'draws', case when d.status = 'draft' or not v_in then null else coalesce((select jsonb_agg(jsonb_build_object('lot_id', m.lot_id, 'qty', (-m.qty)::text,
            'received_on', l.received_on, 'source', private.stock_doc_label(l.source_kind, l.source_id)) order by m.seq, m.id)
          from public.stock_moves m join public.stock_lots l on l.org_id = m.org_id and l.id = m.lot_id
          where m.org_id = v_org and m.doc_kind = 'production' and m.doc_id = d.id and m.doc_line_id = p.id
            and m.reverses_move_id is null and m.qty < 0), '[]'::jsonb) end,
        'money', jsonb_build_object('value', (select iv.value::text from public.production_input_values iv
          where iv.org_id = v_org and iv.input_id = p.id)))
      order by p.line_no)
      from public.production_inputs p join public.items i on i.org_id = p.org_id and i.id = p.item_id
      where p.org_id = v_org and p.batch_id = d.id), '[]'::jsonb),
    'money', jsonb_build_object('input_value', pv.input_value::text, 'extra_value', pv.extra_value::text,
        'total_value', pv.total_value::text,
        'cost_per_kg', private.per_unit(pv.total_value, d.output_qty_kg)::text,
        'costs', coalesce((select jsonb_agg(jsonb_build_object('cost_id', c.id, 'line_no', c.line_no, 'category_id', c.category_id,
            'category_name', k.name, 'planned_amount', c.planned_amount::text, 'amount', c.amount::text, 'source', c.source,
            'allocations', case when v_exp then coalesce((select jsonb_agg(jsonb_build_object('expense_id', e.id, 'on_date', e.on_date, 'amount', a.amount::text,
                'label', coalesce(e.note, case e.source when 'cash' then format('نقداً من %s', ca.name) else format('بالدين على %s', pt.name) end))
                order by e.on_date, e.created_at, e.id)
              from public.production_cost_allocations a
              join public.expenses e on e.org_id = a.org_id and e.id = a.expense_id
              left join public.cash_accounts ca on ca.org_id = e.org_id and ca.id = e.account_id
              left join public.parties pt on pt.org_id = e.org_id and pt.id = e.party_id
              where a.org_id = v_org and a.cost_id = c.id and a.voided_at is null), '[]'::jsonb) end)
            order by c.line_no)
          from public.production_costs c join public.expense_categories k on k.org_id = c.org_id and k.id = c.category_id
          where c.org_id = v_org and c.batch_id = d.id), '[]'::jsonb))));
end
$$;

-- الثوابت (0015) التسعة كما هي، وستّة للنسخة الثانية (0016، القاعدتان ١٩ و٢٠، FOUNDATION ٤٣٦).
create or replace function public.verify_mill() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  -- ١) نسخة مفعَّلة واحدة لكلّ خلطة.
  select 'recipe_many_active', count(*) from (
    select v.recipe_id from public.recipe_versions v where v.status = 'active' group by v.org_id, v.recipe_id having count(*) > 1
  ) as x
  union all
  -- ٢) كلّ نسخة غير مسوّدة مجموع موادّها بالكيلو = أساسها (التفعيل يفحصه، والجمود يحفظه)، بلا الوقود والتعبئة (القاعدة ٢٢، 0016): السطور
  --    التي لقطتها «داخل الكتلة» عند التفعيل، لا نوع المادّة الآن (مراجعة 0016 الثانية #2: النوع يتغيّر ما دامت المادّة بلا حركة). والكتلة بالمساعد
  --    الذي لا يرمي (مراجعة 0016 الخامسة #1، ق٥٢): سطر باللتر بلا كثافة في نسخة مجمَّدة كان يُسقط الثوابت كلّها لكلّ المنشآت بـdensity_not_positive
  --    (جملة واحدة بلا شرط منشأة)، فكتلة سطر داخل الكتلة لا تُحسب خرق يُعدّ هنا (والفحص ٣ يسمّي السطر)، وسطر خارجها لا يمسّ المجموع.
  select 'recipe_basis_mismatch', count(*) from (
    select v.id from public.recipe_versions v
    join public.recipe_lines l on l.org_id = v.org_id and l.version_id = v.id
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    cross join lateral (select private.recipe_line_kg_or_null(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l)) as kg) as m
    where v.status <> 'draft'
    group by v.id, v.basis_kg
    having coalesce(bool_or(m.kg is null) filter (where l.in_basis), false) or coalesce(sum(m.kg) filter (where l.in_basis), 0) <> v.basis_kg
  ) as x
  union all
  -- ٣) نسخة غير مسوّدة بلا سطور، أو سطر بلا لقطة وحدة أساس أو لقطته لتر بلا لقطة كثافة (مراجعة 0016 الثالثة #2: اللقطة لا وحدة المادّة الآن،
  --    فتصحيح الوحدة بعد التفعيل لا يكسره ولا يبقى خرقاً على نسخة مقاعدة)، أو سطر مكتوب باللتر بلا لقطة كثافة (مراجعة 0016 الرابعة #1، ق٤٢: كتلته
  --    لا تُحسب، و«سائل بلا كثافة ما ينضاف لعليقة»؛ كان التفعيل يكتب لقطة كيلوغرام لسطر وقود باللتر صُحّحت مادّته كيلوغراماً فيعبر هنا)، أو سطر
  --    بلا لقطة «داخل الكتلة» (مراجعة 0016 الثانية #2).
  select 'recipe_frozen_bad_lines', count(*) from public.recipe_versions v
  where v.status <> 'draft' and (
    not exists (select 1 from public.recipe_lines l where l.org_id = v.org_id and l.version_id = v.id)
    or exists (select 1 from public.recipe_lines l
      where l.org_id = v.org_id and l.version_id = v.id and (l.base_unit is null or (l.base_unit = 'L' and l.density_kg_per_l is null)
        or (l.unit = 'L' and l.density_kg_per_l is null)))
    or exists (select 1 from public.recipe_lines l where l.org_id = v.org_id and l.version_id = v.id and l.in_basis is null))
  union all
  -- ٤) قيمة دفعة الناتج = كلفة الدفعة بالضبط (القاعدة ٢١: لا يضيع فلس بين الإنتاج والمخزن).
  select 'production_output_value', count(*) from public.production_batches b
  join public.stock_lots l on l.org_id = b.org_id and l.id = b.output_lot_id
  left join public.production_values pv on pv.org_id = b.org_id and pv.batch_id = b.id
  where b.status = 'posted' and (l.value_in is distinct from coalesce(pv.total_value, -1) or l.qty_in is distinct from b.output_qty_kg)
  union all
  -- ٥) كلفة الدفعة = مجموع قيم مدخلاتها + الكلف اليدوية (والكلف اليدوية بسطورها في الفحص ١٠).
  select 'production_value_sum', count(*) from public.production_values pv
  join public.production_batches b on b.org_id = pv.org_id and b.id = pv.batch_id
  where b.status = 'posted' and pv.input_value is distinct from coalesce((
    select sum(iv.value) from public.production_input_values iv where iv.org_id = pv.org_id and iv.batch_id = pv.batch_id), 0)
  union all
  -- ٦) قيمة كلّ مدخل = مجموع قيم سحوباته الفعلية بالسالب (الحركات لا السطور).
  select 'production_input_moves', count(*) from public.production_inputs p
  join public.production_batches b on b.org_id = p.org_id and b.id = p.batch_id
  left join public.production_input_values iv on iv.org_id = p.org_id and iv.input_id = p.id
  where b.status = 'posted' and coalesce(iv.value, -1) is distinct from coalesce((
    select -sum(m.value) from public.stock_moves m
    where m.org_id = p.org_id and m.doc_kind = 'production' and m.doc_id = b.id and m.doc_line_id = p.id and m.reverses_move_id is null), 0)
  union all
  -- ٧) الهدر = كتلة المدخلات − وزن الناتج، والمرحَّل كلّه بالثلاثة.
  select 'production_shrink', count(*) from public.production_batches b
  where b.status = 'posted' and (b.input_mass_kg is null or b.output_qty_kg is null or b.shrink_kg is distinct from round(b.input_mass_kg - b.output_qty_kg, 3))
  union all
  -- ٨) الملغاة صافي حركاتها صفر كميةً وقيمةً، والمرحَّلة لها حركة إدخال واحدة للناتج.
  select 'production_void_net', count(*) from (
    select b.id from public.production_batches b join public.stock_moves m on m.org_id = b.org_id and m.doc_kind = 'production' and m.doc_id = b.id
    where b.status = 'void' group by b.id having sum(m.qty) <> 0 or sum(m.value) <> 0
  ) as x
  union all
  -- ٩) كلّ حركة إنتاج دفعتها من دفعات المستند أو من مخزن مدخلاته (لا حركة في مخزن ثالث).
  select 'production_move_warehouse', count(*) from public.stock_moves m
  join public.production_batches b on b.org_id = m.org_id and b.id = m.doc_id
  where m.doc_kind = 'production' and m.warehouse_id not in (b.input_warehouse_id, b.output_warehouse_id)
  union all
  -- ١٠) الكلف اليدوية للدفعة المرحَّلة = مجموع سطور تكاليفها (القاعدة ٢٠).
  select 'production_extra_value', count(*) from public.production_values pv
  join public.production_batches b on b.org_id = pv.org_id and b.id = pv.batch_id
  where b.status = 'posted' and pv.extra_value is distinct from coalesce((
    select sum(c.amount) from public.production_costs c where c.org_id = pv.org_id and c.batch_id = pv.batch_id), 0)
  union all
  -- ١١) كلّ سطر كلفة لدفعة مرحَّلة محمَّل بالكامل: مجموع تحميلاته الفعّالة = مبلغه.
  select 'production_cost_allocated', count(*) from public.production_costs c
  join public.production_batches b on b.org_id = c.org_id and b.id = c.batch_id
  where b.status = 'posted' and c.amount is distinct from coalesce((
    select sum(a.amount) from public.production_cost_allocations a where a.org_id = c.org_id and a.cost_id = c.id and a.voided_at is null), 0)
  union all
  -- ١٢) لا مصروف محمَّل فوق مبلغه (FOUNDATION ٤٣٦).
  select 'expense_over_allocated', count(*) from (
    select a.expense_id from public.production_cost_allocations a
    join public.expenses e on e.org_id = a.org_id and e.id = a.expense_id
    where a.voided_at is null
    group by a.expense_id, e.amount having sum(a.amount) > e.amount
  ) as x
  union all
  -- ١٣) لا تحميل فعّال على مصروف ملغى ولا على دفعة غير مرحَّلة (ملغاة أو مسوّدة).
  select 'allocation_on_void', count(*) from public.production_cost_allocations a
  join public.production_batches b on b.org_id = a.org_id and b.id = a.batch_id
  where a.voided_at is null and (b.status <> 'posted'
    or exists (select 1 from public.expenses z where z.org_id = a.org_id and z.reverses_id = a.expense_id))
  union all
  -- ١٤) التحميل من مصروف يدوي (نقداً أو بالدين) أصلي بفئة سطره ووحدة مخزن مدخلات دفعته، ودفعته دفعة سطره.
  select 'allocation_mismatch', count(*) from public.production_cost_allocations a
  join public.production_costs c on c.org_id = a.org_id and c.id = a.cost_id
  join public.production_batches b on b.org_id = c.org_id and b.id = c.batch_id
  join public.warehouses w on w.org_id = b.org_id and w.id = b.input_warehouse_id
  join public.expenses e on e.org_id = a.org_id and e.id = a.expense_id
  where a.batch_id <> c.batch_id or e.category_id <> c.category_id or e.division_id <> w.division_id
    or e.source not in ('cash', 'credit') or e.reverses_id is not null
  union all
  -- ١٥) كلّ مادّة بديلة بسببها وبالمادّة التي حلّت محلّها (القاعدة ١٩).
  select 'production_substitute_reason', count(*) from public.production_inputs p
  where p.is_substitute and (p.reason is null or p.replaced_item_id is null)
$$;

-- ثوابت المخزون (0010) كما هي، وطرف الداخل في حفظ القيمة (الفحص 8) يزيد الكلف اليدوية للدفعات المرحَّلة (0016، FOUNDATION ٤٣٠:
-- «الكلف اليدوية للإنتاج» داخلٌ، لأنّ دفعة الناتج = السحوبات + الكلف بالضبط فيزيد بها مجموع المتبقّي).
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
  --    صفر بالطرفين (حركاته معكوسة ومصروفه بصفّ عكسي).
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
          where x.org_id = o.id and x.doc_kind = 'supplier_return' and k.system_code = 'supplier_return_diff'), 0) as outputs
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
  -- 10. ترتيب السحب (القاعدة 12): وقت كل قطعة سحب أصلية بالتحويل والصرف والجرد ماكو دفعة قبلها بالترتيب (الانتهاء والفارغ أخيراً،
  --     ثم fifo_seq، ثم المعرّف) مؤهّلة بتاريخ السحب (مستلمة بيه أو قبله، وغير منتهية للسحب اللي طبّق قاعدة الانتهاء) وبيها متبقٍّ
  --     قبل القطعة. نقص الجرد المنتهي (expiry_checked = false) يشوف كل الدفعات مؤهّلة، والصالحة كلها بعد المنتهية بالترتيب، فيبقى
  --     الأقدم انتهاءً أوّلاً. السحب من دفعة مسمّاة (إذن المنتهي والإتلاف، والمرتجع WP7) برّا الفحص.
  select 'draw_order', count(*) from public.stock_moves m
  join public.stock_lots l on l.org_id = m.org_id and l.id = m.lot_id
  where m.qty < 0 and m.reverses_move_id is null and m.doc_kind in ('transfer', 'stock_use', 'count')
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
  --     وقيده adjustment للمورّد بدفتر الاستلام = −الفرق، ومصروفه «فرق سعر شراء» بوحدة الاستلام = expense_amount (أو بلاه للصفر)؛
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
      or e.id is null or e.kind <> 'adjustment' or e.amount <> -v.diff or e.party_id <> r.party_id or e.book_id <> r.book_id
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

-- تفعيل النسخة (0015) على جسمه حرفاً، إلّا أنّ الوقود والتعبئة خارج مجموع الأساس (القاعدة ٢٢: «بدون الأكياس والوقود»، مراجعة 0016
-- #2): السطر يبقى ويُسحب ويُحسب بكلفته، وdoc_empty على السطور كلّها، وتلميح basis_mismatch يقول إنّهما خارج الكتلة إن وُجدا؛ و«داخل
-- الكتلة» لقطة على كلّ سطر مع لقطة الكثافة (مراجعة 0016 الثانية #2 و#5)، ووحدة أساس المادّة كذلك (مراجعة 0016 الثالثة #2)؛ وسطر مكتوب
-- باللتر لمادّة ليست باللتر الآن يُرفض قبل أيّ حساب (مراجعة 0016 الرابعة #1).
create or replace function public.activate_recipe_version(p_id uuid, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v public.recipe_versions;
  r public.recipes;
  ln record;
  v_sum numeric := 0;
  v_count int := 0;
  v_old uuid;
  v_outside int := 0;
  v_in boolean;
begin
  set local lock_timeout = '5s';
  perform private.require('recipe.activate');
  select * into v from public.recipe_versions where org_id = v_org and id = p_id;
  if v.id is null then
    raise exception 'doc_not_found' using hint = 'هذه النسخة من الخلطة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  select * into r from public.recipes where org_id = v_org and id = v.recipe_id for update;
  if r.archived_at is not null then
    raise exception 'recipe_archived' using hint = format('الخلطة «%s» مؤرشفة. أعِدها من الأرشيف قبل التفعيل.', r.name);
  end if;
  select * into v from public.recipe_versions where org_id = v_org and id = p_id for update;
  if v.status <> 'draft' then
    raise exception 'not_draft' using hint = 'هذه النسخة مفعَّلة أو مقاعدة من قبل.';
  end if;
  if p_expected_version is null or v.version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّرت الخلطة بعد فتحها. حدّث الشاشة وراجع سطورها قبل التفعيل.';
  end if;
  for ln in
    select l.id, l.qty, l.unit, l.item_id, i.name, i.base_unit, i.density_kg_per_l, i.kind
    from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where l.org_id = v_org and l.version_id = v.id order by l.line_no
  loop
    if ln.base_unit not in ('kg', 'L') then
      raise exception 'bad_recipe_unit' using hint = format('«%s» وحدتها قطعة، والعليقة تُحسب بالكتلة: احذف سطرها.', ln.name);
    end if;
    -- سطر مكتوب باللتر لمادّة ليست باللتر الآن (مراجعة 0016 الرابعة #1، ق٤٢؛ FOUNDATION القاعدة ٤: «سائل بلا كثافة ما ينضاف لعليقة»): صُحّحت المادّة
    -- كيلوغراماً بعد كتابة السطر، فلا كثافة تُلقط ولا تُحسب كتلته. كان يُفعَّل خارج الكتلة (الوقود والتعبئة لا يدخلان المجموع) بلقطة كيلوغرام بلا
    -- كثافة، فترمي لوحة المعمل وبطاقة الخلطة والإنتاج density_not_positive لكلّ قارئ؛ وداخل الكتلة كان يرمي هنا بتلميح يطلب كثافة لمادّة لا تقبلها.
    -- يُرفض قبل أيّ حساب، داخل الكتلة وخارجها، بجملة حارس السطر.
    if ln.unit = 'L' and ln.base_unit <> 'L' then
      raise exception 'bad_recipe_unit' using hint = format('«%s» تُقاس بالكيلوغرام، فاكتب كميتها في الخلطة بالكيلوغرام.', ln.name);
    end if;
    if ln.base_unit = 'L' and ln.density_kg_per_l is null then
      raise exception 'density_required' using hint = format('«%s» سائل بلا كثافة، فلا يُحسب وزنه. اكتب كثافته في بطاقة المادّة ثمّ فعّل.', ln.name);
    end if;
    if ln.qty is null or not (abs(ln.qty) < 'Infinity') or ln.qty <= 0 then
      raise exception 'qty_not_positive' using hint = format('كمية «%s» في الخلطة يجب أن تكون أكبر من صفر.', ln.name);
    end if;
    -- الوقود والتعبئة خارج كتلة الخلطة (FOUNDATION القاعدة ٢٢: «بدون الأكياس والوقود»، مراجعة 0016 #2): السطر يبقى ويُسحب ويُحسب
    -- بكلفته، ولا يدخل مجموع الأساس؛ وخلطة كلّها وقود أو تعبئة مجموعها صفر فترفض basis_mismatch. ولقطات السطر الثلاث بجملة واحدة
    -- (FOUNDATION القاعدة ٤): الكثافة للسائل، و«داخل الكتلة» من نوع المادّة الآن (مراجعة 0016 الثانية #2 و#5)، ووحدة أساس المادّة الآن
    -- (مراجعة 0016 الثالثة #2)، والمجموع منها؛ فتصحيح النوع أو الوحدة بعد التفعيل لا يغيّر النسخة المجمَّدة (verify_mill وcreate_production
    -- وrecipe_detail يقرأون اللقطة).
    v_in := ln.kind not in ('fuel', 'packaging');
    update public.recipe_lines set in_basis = v_in, base_unit = ln.base_unit,
      density_kg_per_l = case when ln.base_unit = 'L' then round(ln.density_kg_per_l, 4) else density_kg_per_l end
    where org_id = v_org and id = ln.id;
    if not v_in then
      v_outside := v_outside + 1;
    else
      v_sum := v_sum + private.recipe_line_kg(ln.qty, ln.unit, ln.density_kg_per_l);
    end if;
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then
    raise exception 'doc_empty' using hint = 'الخلطة بلا مواد. أضف مادّة واحدة على الأقلّ قبل التفعيل.';
  end if;
  if v_sum <> v.basis_kg then
    raise exception 'basis_mismatch' using hint = format('مجموع مواد الخلطة %s كغم%s، والأساس %s كغم: الفرق %s كغم. عدّل الكميات أو الأساس حتّى يتساويا.',
      to_char(v_sum, 'FM999999990.999'), case when v_outside > 0 then ' (بلا الوقود والتعبئة، فهما خارج كتلة الخلطة)' else '' end,
      to_char(v.basis_kg, 'FM999999990.999'), to_char(v_sum - v.basis_kg, 'FM999999990.999'));
  end if;
  select x.id into v_old from public.recipe_versions x where x.org_id = v_org and x.recipe_id = v.recipe_id and x.status = 'active' for update;
  if v_old is not null then
    update public.recipe_versions set status = 'retired', retired_at = now(), version = version + 1 where org_id = v_org and id = v_old;
  end if;
  update public.recipe_versions set status = 'active', activated_at = now(), activated_by = auth.uid(), version = version + 1
  where org_id = v_org and id = v.id;
  return jsonb_build_object('id', v.id, 'recipe_id', v.recipe_id, 'version_no', v.version_no, 'status', 'active',
    'basis_kg', v.basis_kg::text, 'lines', v_count, 'retired_id', v_old);
end
$$;

-- ختم الكلف (0015) على جسمه، بنطاقه وبكفاية المصاريف (مراجعة 0016 #1 و#8 و#14): مخزن المدخلات بنطاق الخاتم (كحارس سطر الكلفة
-- وحذفه)، ووحدته كذلك (مراجعة 0016 الثانية #0)، ولكلّ سطر تكاليف مبلغه أكبر من المتاح من المصاريف المؤهّلة expense_overloaded
-- (FOUNDATION ٥٦٠) بأرقامه دائماً (الخاتم يرى الوحدة).
create or replace function public.confirm_production_costs(p_id uuid, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  d public.production_batches;
  wi public.warehouses;
  c record;
  v_free numeric;
begin
  set local lock_timeout = '5s';
  perform private.require('costs.load');
  select * into d from public.production_batches where org_id = v_org and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذه الدفعة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  wi := private.stock_wh(d.input_warehouse_id, true);
  -- من يختم مبلغاً يُحمَّل من مصاريف وحدة مخزن المدخلات يرى تلك الوحدة (مراجعة 0016 الثانية #0، ق٢١): الختم بمبلغ ثمّ ok أو
  -- expense_overloaded كان جواب صحّ/خطأ يستخرج به المحصور بمخزن المتاح المحجوب عنه. فالتلميح بعده بأرقامه دائماً.
  if not public.in_scope_division(wi.division_id) then
    raise exception 'out_of_scope' using hint = format('تكاليف هذه الدفعة تُحمَّل من مصاريف وحدة «%s» خارج نطاقك، فيكتبها ويختمها محاسب أو مدير يرى تلك الوحدة.',
      (select dv.name from public.divisions dv where dv.org_id = v_org and dv.id = wi.division_id));
  end if;
  select * into d from public.production_batches where org_id = v_org and id = p_id for update;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'هذه الدفعة مرحَّلة أو ملغاة؛ لا يُختَم كلفها.';
  end if;
  if p_expected_version is null or d.version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّرت الدفعة بعد فتحها. حدّث الشاشة وأعد المحاولة.';
  end if;
  if d.costs_confirmed_at is not null then
    return jsonb_build_object('id', d.id, 'costs_confirmed', true, 'written', false, 'version', d.version);
  end if;
  -- الختم يأذن لمشغّل المعمل بالترحيل، فلا يُختم ما يُرفض ترحيله (FOUNDATION ٥٦٠، مراجعة 0016 #1 و#8): كلّ سطر بمبلغ أكبر من المتاح
  -- من المصاريف المؤهّلة expense_overloaded بتلميح الترحيل نفسه. بلا قفل للمصاريف هنا: الترحيل يعيد الفحص تحت قفل صفوفها.
  for c in
    select pc.amount, pc.category_id, k.name as category_name
    from public.production_costs pc join public.expense_categories k on k.org_id = pc.org_id and k.id = pc.category_id
    where pc.org_id = v_org and pc.batch_id = d.id and pc.amount > 0 order by pc.line_no
  loop
    v_free := private.mill_expense_free(c.category_id, wi.division_id);
    if c.amount > v_free then
      raise exception 'expense_overloaded' using hint = format('%s: المطلوب %s والمتاح من المصاريف المسجّلة %s. سجّل المصروف أوّلاً أو قلّل المبلغ.',
        c.category_name, private.money_text(c.amount), private.money_text(v_free));
    end if;
  end loop;
  update public.production_batches set costs_confirmed_at = now(), costs_confirmed_by = auth.uid(), version = version + 1
  where org_id = v_org and id = d.id;
  return jsonb_build_object('id', d.id, 'costs_confirmed', true, 'written', true, 'version', d.version + 1);
end
$$;

-- ─── ي. الصلاحيات ───────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.create_recipe(uuid, uuid, text, uuid, numeric, jsonb, jsonb, boolean),
  public.set_item_cost_price(uuid, numeric, numeric), public.add_production_input(uuid, uuid, uuid, numeric, uuid, text),
  public.new_recipe_version(uuid, uuid)
  from public, anon;
grant execute on function public.create_recipe(uuid, uuid, text, uuid, numeric, jsonb, jsonb, boolean),
  public.set_item_cost_price(uuid, numeric, numeric), public.add_production_input(uuid, uuid, uuid, numeric, uuid, text),
  public.new_recipe_version(uuid, uuid)
  to authenticated;
