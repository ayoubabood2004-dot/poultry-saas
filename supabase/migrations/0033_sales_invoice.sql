-- 0033_sales_invoice — الفاتورة الاحترافيّة، المرحلة ١ من نظام المبيعات (كلمة المالك 2026-11-17 وأجوبته؛ docs/SALES_PLAN.md، والعقد
--   docs/plans/0033/contract-0033.md «أ. القاعدة»؛ DECISIONS 2026-11-17 «نظام المبيعات الاحترافيّ»؛ ومهارة «نظام البيع» بقوانين هذا المشروع).
-- المشكلة: فاتورة البيع (0021) سطر واحد بوحدة الأساس، بلا خصم ولا ملاحظة، والدفع كلّه نقد أو كلّه دين من صندوق واحد؛ فمن يشتري علفاً ودواءً
--   يأخذ فاتورتين، ولا يُباع بالكيس ولا بالطنّ، ولا يُكتب خصم، والزبون الذي يدفع نصفاً لا يُكتب، ولا زبون نقديّ بلا اسم.
-- هنا:
--   • sales_invoices: الخصم (discount_total ومنه خصم الفاتورة invoice_discount)، والملاحظة، والزبون النقديّ (walk_in)، والصافي (total)، والمدفوع
--     عند البيع (paid)؛ والدين = الصافي − المدفوع ≥ 0. القيد sales_invoices_payment_check يقبل الشكلين: القديم (صندوق وقيد قبض وحركة في الرأس للنقد)
--     والجديد (الرأس بلا صندوق، والدفع في السيقان)، وpayment صار وصفاً: cash = مدفوع كلّه الآن، وcredit = بقي منه دين.
--   • sales_lines: لقطة وحدة البيع (item_unit_id وunit_label وunit_factor)، والكمية بها (unit_qty) وسعرها (unit_price_unit بالفلس)، والإجماليّ
--     (gross_total = الكمية × السعر مقرَّباً لأقرب دينار)، وخصم السطر، ونصيبه من خصم الفاتورة بأكبر الباقي؛ وline_total = الإجماليّ − الخصمان
--     (الصافي، FOUNDATION ٢٥). qty وunit_price للأساس يبقيان مملوءين. الصفوف القديمة: وحدة الأساس ومعامل 1 وبلا خصم.
--   • sales_payments (جديد): ساق لكلّ صندوق (1–5، صناديق مختلفة) بقيد القبض وحركة الصندوق. الفاتورة القديمة النقدية ساق واحدة (leg_no 1) بمعرّف
--     مشتقّ، فللمدفوع مصدر واحد؛ وrecord_sale القديمة تكتب ساقها كذلك.
--   • public.record_sale_v2 (sale.record): عدّة سطور من مخزن واحد بوحدات البيع، وخصم السطر وخصم الفاتورة بالدينار الصحيح، وسيقان من حتى خمسة
--     صناديق مخصَّصة لهذه الفاتورة، والدين = الصافي − المدفوع، والزبون النقديّ يدفع كلّه؛ والسحب FIFO لكلّ سطر وكلفته في sales_line_costs؛ والنقص
--     بعد جمع سطور المادّة الواحدة insufficient_stock؛ والرقم بنوع المخزن كما الآن؛ والإعادة بالمرجع وبمعرّف الفاتورة (المحتوى نفسه = النتيجة نفسها).
--   • public.sale_catalog (sale.record): كائن { items: موادّ المخزن القابلة للبيع بالمتاح وسعر البيع ووحدات البيع، cash_accounts: صناديق المنشأة الفعّالة
--     باسمها ونوعها بلا أرصدة } (تعديل العقد من قائد الجلسة: الأمين لا يقرأ جدول الصناديق، فبلاها لا يقبض ولا يبيع لزبون نقديّ)؛ وrecord_sale_v2 تقبل
--     هذه الصناديق لسيقان الأمين كما قبلتها record_sale القديمة.
--   • sale_detail وsales_overview يزيدان مفاتيح الفاتورة الجديدة (السطور بوحداتها وخصوماتها، والسيقان، والصافي والمدفوع والدين، والنقديّ، والملاحظة،
--     والبائع)؛ والمفاتيح القديمة بشكلها: السطر الأوّل للمادّة والكمية والسعر، والمبلغ والكلفة للفاتورة كلّها (= السطر في الفواتير القديمة).
--     sales_report بالصافي وعدد الفواتير لا السطور، وvoid_sale لكلّ السطور والسيقان، وentry_detail بالسيقان والوحدات.
--   • verify_sales بأسماء فحوصه الخمسة نفسها، لكلّ السطور والسيقان (انظر جسمه).
-- الزبون النقديّ (قرار الوكيل داخل شرط العقد): طرف نظاميّ واحد لكلّ منشأة «زبون نقديّ» (parties.system_kind = 'walk_in'، فهرس فريد للمنشأة) يُنشأ
--   عند أوّل فاتورة نقديّة بلا اسم؛ تُكتب عليه الفاتورة قيد invoice وسيقانها قيود payment مخصَّصة لها كأيّ بيع نقديّ، فقيد الفاتورة والدفعات صادقان،
--   ومال السيقان حركات party_payment بمستند sale فيعدّها money_overview وmoney_moves بيعاً نقدياً كما الآن (cash_class)، ورصيده صفر دائماً. سياسة قراءة
--   مقيِّدة تُخفيه عن القراءة المباشرة (قوائم الجهات في الشاشات وتقرير الأرصدة)، ومحفّز party_entries_walk_in يرفض أيّ قيد عليه إلّا من record_sale_v2
--   وvoid_sale (علم المعاملة app.walk_in_sale)، فلا قبض ولا «ألغِ القبض» ولا افتتاح ولا تسوية عليه؛ وverify_sales يمسك أيّ رصيد له أو قيد من غير
--   فاتورة نقديّة. record_sale القديمة ترفض اختياره جهةً (walk_in_party).
-- إلغاء الفاتورة (قرار الوكيل بشرط صدق الدفاتر): البضاعة ترجع لدفعاتها وقيد الفاتورة يُعكس كما الآن؛ وسيقان الزبون باسمه تبقى رصيداً له (كما 0021،
--   وتُردّ من «ألغِ القبض»)؛ وسيقان الزبون النقديّ تُردّ معه بيوم الإلغاء (قيد عكسيّ وحركة صندوق عكسيّة لكلّ ساق)، إذ لا اسم يبقى له رصيد. والملغاة
--   في القرّاء بلا دين ولا متبقٍّ (debt = open = 0).
-- انحرافات مكتوبة (بلا سؤال، داخل الخطوط الحمر والعقد):
--   • record_sale القديمة على جسمها في 0021 كما هي (رفوضها وترتيبها ونتائجها وطفرات sales.test)، وتكتب فوقه الأعمدة الجديدة وساقها، ولا تُبنى على
--     نواة record_sale_v2 (الواجهة المنشورة حتى الدمج؛ تُطوى بعده).
--   • مفاتيح القراءة الجديدة في المستوى الأعلى بأسماء العقد (total وpaid وdebt وdiscount_total وwalk_in وnote وposted_by_name وlines وpayments)،
--     والكلفة تحت cost.money (strip_cost) في كلّ سطر وللفاتورة.
--   • paid في القرّاء = السيقان التي لم تُردّ («ألغِ القبض» أو إلغاء الفاتورة النقديّة)، وdebt = الصافي − paid للمرحَّلة (صفر للملغاة)؛ وعمود paid =
--     المدفوع عند البيع. وopen = المتبقّي من قيد الفاتورة بعد كلّ ما وُزّع عليه (والتحصيل اللاحق منه)، فـdebt دين الفاتورة بسيقانها وopen ما بقي منه
--     فعلاً؛ وpayment_refunded = رُدّت كلّ السيقان (معنى 0021: القبض رُدّ)، وعلامة كلّ ساق في payments[].refunded.
--   • p_lines: سطر بوحدة بيع يحمل factor (حجم الوحدة كما رأته الشاشة) إلزاماً، وإلّا factor_required؛ وإن خالف حجمها الآن unit_changed. وصفّ الوحدة
--     يُقرأ بلا قفل (كما هو لحظة القراءة): ما ثبت قبلها يُرى ويُرفض بحجمه، وما ثبت بعدها لا يغيّر ما بِيع بالحجم الذي رآه البائع.
--   • البيع بالمجّان (السعر صفر) يبقى كما في 0021 (بلا قيد إن كان الصافي صفراً)؛ وخصم يجعل الصافي صفراً كذلك.
--   • سقف السطور 100 والسيقان 5، والإعادة بالمعرّف تقارن المحتوى بعد تطبيعه (trim_scale) فـ«2» و«2.000» واحد.
-- المراجعة العدائية (جهة القاعدة؛ مراجعان أثبتا كلّ ملاحظة على الشفرة، والإصلاح بفحص فشل قبله في sales-invoice-review.test وsales-invoice.test وseed.mjs):
--   • A1 لكلّ صفّ في sales_overview المفتاح open (المتبقّي، صفر للملغاة وبلا قيد) وtotals.open (للمرحَّلة)؛ والمفاتيح القديمة بمعانيها للواجهة المنشورة.
--   • A2/B1 factor إلزاميّ لسطر بوحدة بيع (factor_required). B2 بلا قفل مشاركة على صفوف الوحدات: كان يتقافل (40P01) مع تبديل الوحدة الافتراضية،
--     الذي يقفل الجديدة ثمّ القديمة بمحفّز item_units_check (0005)، والحجم الإلزاميّ يكفي لصدق ما رآه البائع.
--   • A3 الملغاة بلا دين في sale_detail وsale_more وصفوف القائمة، وpayment_refunded = bool_and على السيقان الموجودة (false بلا سيقان).
--   • A4 entry_detail لقيد الفاتورة بالمدفوع الآن (private.sale_paid) وطريقة الدفع منه كتفصيل الفاتورة، والساق بعلامة ردّها.
--   • A5 verify_sales: كلّ ما عكسه الإلغاء (المخزون وقيد الفاتورة، وللنقديّة قيود السيقان وحركات ردّها) بيوم واحد لا قبل يوم البيع. A6 وقيد الفاتورة
--     وقيود السيقان برقم الفاتورة (doc_no).
--   • A7 المبالغ بالدينار الصحيح (خصم السطر وخصم الفاتورة والسيقان) تُطبَّع (round(…, 0)) قبل الحساب والتخزين: «1000.00» يُخزَّن ويُرجع «1000».
--   • B3 الزبون النقديّ يُقفل لكلّ (جهة، دفتر) (private.lock_sale_party): قفل مشترك على الجهة يُبقي ما يحميه قفلها الحصريّ (الأرشفة وكلّ كاتب
--     بـlock_parties)، وقفل حصريّ بمفتاح يحمل المنشأة لما يحميه لكلّ دفتر (ترقيم القيد والتوزيع والإلغاء)؛ فلا تنتظر نقديّة من مخزن نقديّةً من آخر.
--   • B4 حساب النظام لا يُختار في غير البيع: party_for_post يرفضه (القبض والدفع والافتتاح والتسوية والإعفاء ومعاينة التوزيع والمصروف بالدين وترحيل
--     الاستلام والشراء البسيط وبيع الطيور)، ومحفّز party_not_system على مسوّدة الاستلام وناقل التحميل ووحدة المورّد، وparties_system_guard على صفّه؛
--     والقرّاء (الكشف وحركة الأموال) تقرؤه.
--   • B6 معرّف سطر أو ساق (أو فاتورة من منشأة أخرى) في فاتورة متزامنة: unique_violation يُرفع id_conflict بتلميحه.
--   • can_void في sale_detail ولكلّ صفّ في القائمة من private.sale_void_block: فحوص void_sale نفسها وبترتيبها (الفعل والمخزن ودفتر الفاتورة
--     وقفل يوم الإلغاء والحالة)، وvoid_block رمزها؛ وcan_void في رأس القائمة can('void') كما كان.
--   • مفتاح قفل معرّف الفاتورة 'sale:' يحمل المنشأة في record_sale_v2 وrecord_sale (قاعدة المشروع).
--   • ساق المرآة (البيع القديم وملء الفواتير القديمة) بلا صفّ تدقيق (app.sale_mirror_leg، شرط محفّز audit_sales_payments): نسخة رأسها المدقَّق بنطاق
--     مخزنه؛ وصفّ ساق مدقَّق (فاتورة جديدة دُفع منها شيء) يوقف التراجع، إذ سياسة سجلّ التدقيق في 0021 لا تعرف sales_payments فيظهر بعده خارج النطاق.
--   • مقبولة بكلمة المالك (تُكتب ولا تُغيَّر): B5 record_sale_v2 لا تشترط is_customer (كـ0021)، وB7 من يقرأ sale_detail يرى أسماء صناديق السيقان
--     (بلا أرصدة).
-- تراجع: rollback_0033.sql — يرجّع record_sale وvoid_sale وsale_detail وverify_sales وprivate.sale_result كما في 0021، وsales_overview وsales_report
--   وprivate.entry_detail كما في 0029، وprivate.party_for_post كما في 0006، حرفاً بحرف، ويُسقط الجديد (الدوالّ والجدول والأعمدة والقيود والسياسة
--   والمحفّزات)، ويرجّع القيد القديم. **طريق رفض**: فاتورة بأكثر من سطر، أو بخصم، أو بأكثر من ساق، أو بدفع جزئيّ، أو بوحدة غير الأساس، أو بملاحظة،
--   أو لزبون نقديّ (أو وُجد حسابه)، أو صفّ تدقيق لساق فاتورة جديدة، كلّ واحدة توقف التراجع بصوت (بيانات لا يحملها النموذج القديم، أو تظهر بعده خارج
--   نطاقها)؛ وفاتورة record_sale_v2 بسطر وبالدين كلّها تبقى بالشكل القديم.
-- تنعاد بأمان: add column if not exists، وcreate table/index if not exists، وكتل do تفحص الكتالوج قبل القيود والسياسات، والملء لما لم يُملأ وحده،
--   وcreate or replace، وrevoke وgrant.

set lock_timeout = '5s';

-- ─── أ. الزبون النقديّ: علم الطرف النظاميّ، وإخفاؤه، ومحفّز قيوده ─────────────────────────────────────────────────────
alter table public.parties add column if not exists system_kind text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'parties_system_kind_check' and conrelid = 'public.parties'::regclass) then
    alter table public.parties add constraint parties_system_kind_check
      check (system_kind is null or (system_kind = 'walk_in' and is_customer and not is_supplier));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'parties' and policyname = 'parties_not_system') then
    create policy parties_not_system on public.parties as restrictive for select to authenticated using (system_kind is null);
  end if;
end
$$;
create unique index if not exists parties_walk_in on public.parties (org_id) where system_kind = 'walk_in';

-- قيد على حساب الزبون النقديّ من فاتورته أو إلغائها وحدهما (علم المعاملة يضعه الكاتبان ويرفعانه)، وغيرهما walk_in_party.
create or replace function private.party_entries_walk_in() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if current_setting('app.walk_in_sale', true) is distinct from 'on'
     and exists (select 1 from public.parties p where p.org_id = new.org_id and p.id = new.party_id and p.system_kind = 'walk_in') then
    raise exception 'walk_in_party' using hint = '«زبون نقديّ» حساب للبيع النقديّ بلا اسم: لا يُكتب عليه قيد إلّا من فاتورته أو إلغائها كلّها.';
  end if;
  return new;
end
$$;
create or replace trigger party_entries_walk_in before insert on public.party_entries
  for each row execute function private.party_entries_walk_in();

-- مراجعة 0033 B4: معرّف «زبون نقديّ» يصل إلى الجهاز في نتائج البيع، فكلّ ما يأخذ جهةً من الجهاز لغير البيع يرفضه قبل أن يكتب شيئاً (الشراء بلا سعر
-- لا يكتب قيداً فلا يراه party_entries_walk_in، ثمّ يُرفض تسعيره أبداً). ثلاثة أبواب: party_for_post (القبض والدفع والافتتاح والتسوية والإعفاء
-- ومعاينة التوزيع والمصروف بالدين وترحيل الاستلام والشراء البسيط وبيع الطيور)، ومحفّز على ما تكتبه الشاشة مباشرة بجهة (مسوّدة الاستلام وناقل
-- التحميل ووحدة المورّد)، ومحفّز على صفّ الحساب نفسه (لا يُعدَّل ولا يُؤرشف). والقرّاء (الكشف وحركة الأموال) تقرؤه كما هو.
create or replace function private.party_for_post(p_party uuid) returns public.parties
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  p public.parties;
begin
  if p_party is null then
    raise exception 'party_required' using hint = 'اختر الجهة.';
  end if;
  select * into p from public.parties where org_id = public.auth_org() and id = p_party;
  if p.id is null then
    raise exception 'party_not_found' using hint = 'هذه الجهة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if p.system_kind is not null then
    raise exception 'walk_in_party' using hint = '«زبون نقديّ» حساب النظام للبيع النقديّ بلا اسم، فلا يُختار مورّداً ولا جهةً لقبض أو دفع أو افتتاح أو تسوية أو إعفاء أو مصروف. اختر جهة باسمها.';
  end if;
  return p;
end
$$;

-- الجهة التي تكتبها الشاشة مباشرة (العمود في tg_argv[0]) ليست حساب النظام، عند الإدراج أو حين تتغيّر.
create or replace function private.party_not_system() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_party uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
begin
  if v_party is not null and (tg_op = 'INSERT' or v_party is distinct from (to_jsonb(old) ->> tg_argv[0])::uuid)
     and exists (select 1 from public.parties p where p.org_id = new.org_id and p.id = v_party and p.system_kind is not null) then
    raise exception 'walk_in_party' using hint = '«زبون نقديّ» حساب النظام للبيع النقديّ بلا اسم، فلا يُختار مورّداً ولا ناقلاً ولا صاحب وحدة تعبئة. اختر جهة باسمها.';
  end if;
  return new;
end
$$;
create or replace trigger receipts_party_not_system before insert or update on public.receipts
  for each row execute function private.party_not_system('party_id');
create or replace trigger receipt_charges_party_not_system before insert or update on public.receipt_charges
  for each row execute function private.party_not_system('payee_party_id');
create or replace trigger item_units_party_not_system before insert or update on public.item_units
  for each row execute function private.party_not_system('party_id');

-- صفّ حساب النظام لا يُعدَّل (اسمه وهاتفه وأرشفته): سياسة القراءة تخفيه عمّا يقرأ صفوفه، وتعديل بلا شرط يقرأ عموداً يصل إليه، فهذا يردّه.
create or replace function private.parties_system_guard() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if old.system_kind is not null then
    raise exception 'walk_in_party' using hint = '«زبون نقديّ» حساب النظام للبيع النقديّ بلا اسم، فلا يُعدَّل ولا يُؤرشف. اختر جهة باسمها.';
  end if;
  return new;
end
$$;
create or replace trigger parties_system_guard before update on public.parties
  for each row execute function private.parties_system_guard();

-- ─── ب. الفاتورة وسطورها: الأعمدة الجديدة وملؤها وقيودها ──────────────────────────────────────────────────────────────
alter table public.sales_invoices add column if not exists discount_total numeric not null default 0;
alter table public.sales_invoices add column if not exists invoice_discount numeric not null default 0;
alter table public.sales_invoices add column if not exists note text;
alter table public.sales_invoices add column if not exists walk_in boolean not null default false;
alter table public.sales_invoices add column if not exists total numeric;
alter table public.sales_invoices add column if not exists paid numeric;

alter table public.sales_lines add column if not exists item_unit_id uuid;
alter table public.sales_lines add column if not exists unit_label text;
alter table public.sales_lines add column if not exists unit_factor numeric;
alter table public.sales_lines add column if not exists unit_qty numeric;
alter table public.sales_lines add column if not exists unit_price_unit numeric;
alter table public.sales_lines add column if not exists gross_total numeric;
alter table public.sales_lines add column if not exists line_discount numeric not null default 0;
alter table public.sales_lines add column if not exists invoice_discount_share numeric not null default 0;

-- الصفوف القديمة: وحدة الأساس ومعامل 1 وبلا خصم، والصافي مجموع السطور، والمدفوع قيد القبض النقديّ (= الصافي).
update public.sales_lines l set unit_label = l.base_unit, unit_factor = 1, unit_qty = l.qty, unit_price_unit = l.unit_price, gross_total = l.line_total
where l.unit_label is null;
update public.sales_invoices s
set total = coalesce((select sum(l.line_total) from public.sales_lines l where l.org_id = s.org_id and l.sale_id = s.id), 0),
  paid = coalesce((select -e.amount from public.party_entries e where e.org_id = s.org_id and e.id = s.payment_entry_id), 0)
where s.total is null or s.paid is null;

alter table public.sales_invoices alter column total set not null;
alter table public.sales_invoices alter column paid set not null;
alter table public.sales_lines alter column unit_label set not null;
alter table public.sales_lines alter column unit_factor set not null;
alter table public.sales_lines alter column unit_qty set not null;
alter table public.sales_lines alter column unit_price_unit set not null;
alter table public.sales_lines alter column gross_total set not null;

do $$
begin
  -- الشكلان: القديم (صندوق وقيد قبض وحركة في الرأس للنقد) والجديد (الرأس بلا صندوق)؛ وcash = مدفوع كلّه الآن والصافي موجب.
  if exists (select 1 from pg_constraint where conname = 'sales_invoices_payment_check' and conrelid = 'public.sales_invoices'::regclass
    and pg_get_constraintdef(oid) not like '%paid%') then
    alter table public.sales_invoices drop constraint sales_invoices_payment_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_invoices_payment_check' and conrelid = 'public.sales_invoices'::regclass) then
    alter table public.sales_invoices add constraint sales_invoices_payment_check check (payment in ('cash', 'credit')
      and (payment_entry_id is null) = (cash_move_id is null) and (payment_entry_id is null) = (cash_account_id is null)
      and (payment_entry_id is null or payment = 'cash') and (payment = 'cash') = (paid = total and total > 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_invoices_total_check' and conrelid = 'public.sales_invoices'::regclass) then
    alter table public.sales_invoices add constraint sales_invoices_total_check check (abs(total) < 'Infinity' and total >= 0 and total = round(total, 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_invoices_paid_check' and conrelid = 'public.sales_invoices'::regclass) then
    alter table public.sales_invoices add constraint sales_invoices_paid_check
      check (abs(paid) < 'Infinity' and paid >= 0 and paid = round(paid, 0) and paid <= total);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_invoices_discount_check' and conrelid = 'public.sales_invoices'::regclass) then
    alter table public.sales_invoices add constraint sales_invoices_discount_check
      check (abs(discount_total) < 'Infinity' and discount_total >= 0 and discount_total = round(discount_total, 0)
        and abs(invoice_discount) < 'Infinity' and invoice_discount >= 0 and invoice_discount = round(invoice_discount, 0) and invoice_discount <= discount_total);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_invoices_note_check' and conrelid = 'public.sales_invoices'::regclass) then
    alter table public.sales_invoices add constraint sales_invoices_note_check
      check (note is null or (length(note) between 1 and 500 and coalesce(private.note_text(note) = note, false)));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_invoices_walk_in_check' and conrelid = 'public.sales_invoices'::regclass) then
    alter table public.sales_invoices add constraint sales_invoices_walk_in_check check (not walk_in or (paid = total and payment_entry_id is null));
  end if;
  -- السطر: لقطة الوحدة (الأساس بمعامل 1 واسمه) والكمية بها والأساس منها، والسعر والإجماليّ والخصمان؛ ومعادلة الصافي في verify_sales.
  if not exists (select 1 from pg_constraint where conname = 'sales_lines_unit_factor_check' and conrelid = 'public.sales_lines'::regclass) then
    alter table public.sales_lines add constraint sales_lines_unit_factor_check
      check (abs(unit_factor) < 'Infinity' and unit_factor > 0 and unit_factor = round(unit_factor, 6) and (item_unit_id is not null or unit_factor = 1));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_lines_unit_label_check' and conrelid = 'public.sales_lines'::regclass) then
    alter table public.sales_lines add constraint sales_lines_unit_label_check check (length(btrim(unit_label)) between 1 and 40);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_lines_unit_qty_check' and conrelid = 'public.sales_lines'::regclass) then
    alter table public.sales_lines add constraint sales_lines_unit_qty_check
      check (abs(unit_qty) < 'Infinity' and unit_qty > 0 and unit_qty = round(unit_qty, 3) and qty = round(unit_qty * unit_factor, 3));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_lines_unit_price_unit_check' and conrelid = 'public.sales_lines'::regclass) then
    alter table public.sales_lines add constraint sales_lines_unit_price_unit_check
      check (abs(unit_price_unit) < 'Infinity' and unit_price_unit >= 0 and unit_price_unit = round(unit_price_unit, 2));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_lines_gross_total_check' and conrelid = 'public.sales_lines'::regclass) then
    alter table public.sales_lines add constraint sales_lines_gross_total_check check (abs(gross_total) < 'Infinity' and gross_total >= 0 and gross_total = round(gross_total, 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_lines_discount_check' and conrelid = 'public.sales_lines'::regclass) then
    alter table public.sales_lines add constraint sales_lines_discount_check
      check (abs(line_discount) < 'Infinity' and line_discount >= 0 and line_discount = round(line_discount, 0)
        and abs(invoice_discount_share) < 'Infinity' and invoice_discount_share >= 0 and invoice_discount_share = round(invoice_discount_share, 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_lines_item_unit_fkey' and conrelid = 'public.sales_lines'::regclass) then
    alter table public.sales_lines add constraint sales_lines_item_unit_fkey foreign key (org_id, item_unit_id) references public.item_units (org_id, id);
  end if;
end
$$;
create index if not exists sales_lines_unit on public.sales_lines (org_id, item_unit_id);

-- ─── ج. سيقان الدفع: ساق لكلّ صندوق بقيد قبضها وحركة صندوقها، مخصَّصة لفاتورتها ─────────────────────────────────────────
create table if not exists public.sales_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  sale_id uuid not null,
  warehouse_id uuid not null,
  leg_no int not null,
  cash_account_id uuid not null,
  amount numeric not null,
  payment_entry_id uuid not null,
  cash_move_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint sales_payments_leg_no_check check (leg_no between 1 and 5),
  constraint sales_payments_amount_check check (abs(amount) < 'Infinity' and amount > 0 and amount = round(amount, 0)),
  unique (org_id, id),
  unique (org_id, sale_id, leg_no),
  unique (org_id, sale_id, cash_account_id),
  unique (org_id, payment_entry_id),
  unique (org_id, cash_move_id),
  foreign key (org_id, sale_id, warehouse_id) references public.sales_invoices (org_id, id, warehouse_id),
  foreign key (org_id, cash_account_id) references public.cash_accounts (org_id, id),
  foreign key (org_id, payment_entry_id) references public.party_entries (org_id, id),
  foreign key (org_id, cash_move_id) references public.cash_moves (org_id, id)
);
create index if not exists sales_payments_sale on public.sales_payments (org_id, sale_id, warehouse_id);
create index if not exists sales_payments_box on public.sales_payments (org_id, cash_account_id);

alter table public.sales_payments enable row level security;

do $$
begin
  -- ساق المرآة (البيع القديم والفاتورة القديمة بالملء) نسخة رأسها المدقَّق بنطاق مخزنه، فبلا صفّ تدقيق (مراجعة 0033 V3): سياسة سجلّ التدقيق في
  -- 0021 (يرجّعها التراجع) لا تعرف sales_payments، فصفّها يظهر بعده لكلّ دور كلفة خارج النطاق؛ وما بقي منها (سيقان record_sale_v2) يوقف التراجع.
  execute 'create or replace trigger audit_sales_payments after insert or update or delete on public.sales_payments for each row'
    || ' when (current_setting(''app.sale_mirror_leg'', true) is distinct from ''on'') execute function private.audit_row()';
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sales_payments' and policyname = 'sales_payments_read') then
    create policy sales_payments_read on public.sales_payments for select to authenticated
      using (org_id = (select public.auth_org()) and (select public.in_scope_wh(warehouse_id)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sales_payments' and policyname = 'sales_payments_sales_only') then
    create policy sales_payments_sales_only on public.sales_payments as restrictive for select to authenticated using ((select public.can_see_sales()));
  end if;
  -- سجلّ التدقيق يحمل الصفّ كلّه (E49): السيقان بمخزنها كصفوف البيع الأخرى.
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'audit_log_sale_scope'
    and qual not like '%sales_payments%') then
    drop policy audit_log_sale_scope on public.audit_log;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'audit_log_sale_scope') then
    create policy audit_log_sale_scope on public.audit_log as restrictive for select to authenticated
      using (case
        when table_name in ('sales_invoices', 'sales_lines', 'sales_line_costs', 'sales_payments') then public.in_scope_wh((coalesce("new", "old") ->> 'warehouse_id')::uuid)
        else true
      end);
  end if;
end
$$;

revoke all on table public.sales_payments from anon, authenticated;
grant select on table public.sales_payments to authenticated;
revoke truncate on table public.sales_payments from service_role;

-- الفاتورة القديمة النقدية ساق واحدة بمعرّف مشتقّ من الفاتورة (كما تكتبها record_sale بعد اليوم)، بقيدها وحركتها؛ مرآة رأسها فبلا صفّ تدقيق.
do $$
begin
  perform set_config('app.sale_mirror_leg', 'on', true);
  insert into public.sales_payments (id, org_id, sale_id, warehouse_id, leg_no, cash_account_id, amount, payment_entry_id, cash_move_id, created_at, created_by)
  select private.derived_ref(s.id, 1), s.org_id, s.id, s.warehouse_id, 1, s.cash_account_id, -e.amount, s.payment_entry_id, s.cash_move_id, s.posted_at, s.posted_by
  from public.sales_invoices s
  join public.party_entries e on e.org_id = s.org_id and e.id = s.payment_entry_id
  where s.payment_entry_id is not null and not exists (select 1 from public.sales_payments g where g.org_id = s.org_id and g.sale_id = s.id);
  perform set_config('app.sale_mirror_leg', '', true);
end
$$;

-- ─── د. المساعدات ────────────────────────────────────────────────────────────────────────────────────────────────
-- قراءة معرّف أو رقم من كائن JSON بلا رمي: نصّ بشكل المعرّف، ورقم أو نصّ رقميّ؛ وغيرهما null (والكاتب يرفض برمزه).
create or replace function private.json_uuid(p jsonb, p_key text) returns uuid
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case when jsonb_typeof(p -> p_key) = 'string' and (p ->> p_key) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (p ->> p_key)::uuid end
$$;

create or replace function private.json_num(p jsonb, p_key text) returns numeric
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case when jsonb_typeof(p -> p_key) = 'number' then (p ->> p_key)::numeric
    when jsonb_typeof(p -> p_key) = 'string' and (p ->> p_key) ~ '^[+-]?[0-9]{1,15}([.][0-9]{1,6})?$' then (p ->> p_key)::numeric end
$$;

-- حساب «زبون نقديّ» للمنشأة: يُقرأ، أو يُنشأ أوّل مرّة (الفهرس الفريد يجمع المتزامنَين على صفّ واحد).
create or replace function private.walk_in_party() returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_id uuid;
begin
  select p.id into v_id from public.parties p where p.org_id = v_org and p.system_kind = 'walk_in';
  if v_id is null then
    insert into public.parties (org_id, name, is_customer, system_kind) values (v_org, 'زبون نقديّ', true, 'walk_in')
    on conflict (org_id) where system_kind = 'walk_in' do nothing;
    select p.id into v_id from public.parties p where p.org_id = v_org and p.system_kind = 'walk_in';
  end if;
  return v_id;
end
$$;

-- قفل حساب الفاتورة (§2.3، في مكان قفل الجهات): الزبون باسمه قفل جهته كلّها كما في كلّ كاتب قيد (lock_parties). والزبون النقديّ (مراجعة 0033 B3)
-- قفل مشترك على جهته، فما يقفلها حصرياً (الأرشفة وكلّ كاتب بـlock_parties) ينتظر فواتيرها أو تنتظره كما كان، وقفل حصريّ لدفتر الفاتورة وحده
-- بمفتاح يحمل المنشأة: ما يحميه قفل الجهة لهذا الحساب لكلّ (جهة، دفتر) — ترقيم القيد (seq) والتوزيع وإلغاء القيد — فلا تنتظر فاتورة نقديّة من
-- مخزن الأدوية فاتورةً نقديّة عالقة على قفل مخزن العلف.
create or replace function private.lock_sale_party(p_party uuid, p_book uuid, p_walk_in boolean) returns void
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  set local lock_timeout = '5s';
  if not coalesce(p_walk_in, false) then
    perform private.lock_parties(array[p_party]);
    return;
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('party:' || p_party::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('walk_in_book:' || public.auth_org()::text || ':' || p_party::text || ':' || p_book::text, 0));
end
$$;

-- لماذا لا تُلغى الفاتورة الآن: رمز رفض void_sale أو null (مراجعة 0033، can_void). مرآة فحوص void_sale نفسها وبترتيبها (درس 2026-11-15: علم
-- «يمكن» في القارئ يُبنى من فحوص الكاتب): الفعل (require)، ونطاق المخزن (stock_wh)، ونطاق دفتر الفاتورة (book_for_post)، وقفل الفترة على يوم
-- الإلغاء (check_void_date)، والحالة. والمؤرشف من المخزن والموادّ لا يمنع العكس (lock_masters بلا أصل، E43).
create or replace function private.sale_void_block(p_sale uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when not public.can('void') then 'forbidden'
    when not public.in_scope_wh(s.warehouse_id) then 'out_of_scope'
    when not public.in_scope_book(s.book_id) then 'out_of_scope'
    when exists (select 1 from public.period_locks l where l.org_id = s.org_id and public.app_today() <= l.locked_through) then 'period_locked'
    when s.status = 'void' then 'already_void'
  end
  from public.sales_invoices s where s.org_id = public.auth_org() and s.id = p_sale
$$;

-- المدفوع الآن من السيقان: ما لم يُردّ منها (قيد قبضها غير معكوس)، وهل رُدّت كلّها (payment_refunded بمعنى 0021: القبض رُدّ؛ مراجعة 0033 A3،
-- وبلا سيقان false)، وعددها، والساق الأولى (لمفاتيح الشكل القديم).
create or replace function private.sale_paid(p_sale uuid, out paid numeric, out refunded boolean, out legs int, out first_box uuid, out first_entry uuid,
  out first_move uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(g.amount) filter (where not g.rev), 0), coalesce(bool_and(g.rev), false), count(*)::int,
    (array_agg(g.cash_account_id order by g.leg_no))[1], (array_agg(g.payment_entry_id order by g.leg_no))[1], (array_agg(g.cash_move_id order by g.leg_no))[1]
  from (
    select y.*, exists (select 1 from public.party_entries r where r.org_id = y.org_id and r.reverses_entry_id = y.payment_entry_id) as rev
    from public.sales_payments y where y.org_id = public.auth_org() and y.sale_id = p_sale
  ) as g
$$;

-- نتيجة الفاتورة بالشكل القديم (record_sale وأساس sale_detail): المادّة والكمية وسعر الأساس من السطر الأوّل، والمبلغ والكلفة والربح للفاتورة
-- كلّها (= السطر في الفاتورة القديمة)، والدفع cash ما دام المدفوع الآن = الصافي؛ وما رُدّ من السيقان دين (payment_refunded، مراجعة 0021 L4).
create or replace function private.sale_result(p_sale uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', s.id, 'doc_no', s.doc_no, 'status', s.status, 'sold_on', s.sold_on,
    'payment', case when g.paid = s.total and s.total > 0 then 'cash' else 'credit' end, 'payment_refunded', g.refunded,
    'party_id', s.party_id, 'party_name', p.name, 'warehouse_id', s.warehouse_id, 'warehouse_name', w.name, 'book_id', s.book_id,
    'cash_account_id', coalesce(s.cash_account_id, g.first_box), 'line_id', f.id, 'item_id', f.item_id, 'item_name', f.item_name, 'qty', f.qty::text,
    'base_unit', f.base_unit, 'free', s.total = 0, 'voided_at', s.voided_at, 'void_reason', s.void_reason,
    'money', jsonb_build_object('unit_price', f.unit_price::text, 'line_total', s.total::text, 'paid_now', g.paid::text),
    'cost', jsonb_build_object('money', jsonb_build_object('cost', k.cost::text, 'profit', (s.total - k.cost)::text)))
  from public.sales_invoices s
  join public.parties p on p.org_id = s.org_id and p.id = s.party_id
  join public.warehouses w on w.org_id = s.org_id and w.id = s.warehouse_id
  cross join lateral (
    select l.id, l.item_id, i.name as item_name, l.qty, l.base_unit, l.unit_price from public.sales_lines l
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where l.org_id = s.org_id and l.sale_id = s.id order by l.line_no limit 1
  ) as f
  cross join lateral (select coalesce(sum(c.cost), 0) as cost from public.sales_line_costs c where c.org_id = s.org_id and c.sale_id = s.id) as k
  cross join lateral private.sale_paid(s.id) as g
  where s.org_id = public.auth_org() and s.id = p_sale
$$;

-- مفاتيح الفاتورة الجديدة (sale_detail): السطور بوحداتها وخصوماتها وكلفتها، والسيقان بصناديقها، والصافي والمدفوع والدين، والمتبقّي من قيدها
-- و«استلم من الزبون»، والملاحظة والبائع. الكلفة والربح تحت cost.money (strip_cost). الملغاة بلا دين ولا متبقٍّ (مراجعة 0033 A3): ما بقي من سيقان
-- الزبون باسمه رصيد له في دفتره، لا دين عليه.
create or replace function private.sale_more(p_sale uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('walk_in', s.walk_in, 'note', s.note, 'posted_at', s.posted_at, 'posted_by_name', private.member_name(s.posted_by),
    'lines_count', k.lines, 'total', s.total::text, 'discount_total', s.discount_total::text, 'invoice_discount', s.invoice_discount::text,
    'paid', g.paid::text, 'debt', case when s.status = 'void' then 0 else s.total - g.paid end::text, 'paid_at_sale', s.paid::text, 'open', v.open::text,
    'can_collect', s.status = 'posted' and not s.walk_in and v.open > 0 and public.can('payment.post') and public.in_scope_book(s.book_id),
    'invoice', jsonb_build_object('cost', jsonb_build_object('money', jsonb_build_object('cost', k.cost::text, 'profit', (s.total - k.cost)::text))),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('line_id', l.id, 'line_no', l.line_no, 'item_id', l.item_id, 'item_name', i.name, 'item_kind', i.kind,
        'base_unit', l.base_unit, 'qty_base', l.qty::text, 'unit_id', l.item_unit_id, 'unit_label', l.unit_label, 'unit_factor', l.unit_factor::text,
        'unit_qty', l.unit_qty::text, 'unit_price', l.unit_price_unit::text, 'base_unit_price', l.unit_price::text, 'gross_total', l.gross_total::text,
        'line_discount', l.line_discount::text, 'invoice_discount_share', l.invoice_discount_share::text, 'line_total', l.line_total::text,
        'cost', jsonb_build_object('money', jsonb_build_object('cost', c.cost::text, 'profit', (l.line_total - c.cost)::text)))
      order by l.line_no), '[]'::jsonb)
      from public.sales_lines l
      join public.items i on i.org_id = l.org_id and i.id = l.item_id
      left join public.sales_line_costs c on c.org_id = l.org_id and c.line_id = l.id
      where l.org_id = s.org_id and l.sale_id = s.id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('leg_id', y.id, 'leg_no', y.leg_no, 'cash_account_id', y.cash_account_id, 'cash_account_name', a.name,
        'amount', y.amount::text, 'payment_entry_id', y.payment_entry_id,
        'refunded', exists (select 1 from public.party_entries r where r.org_id = y.org_id and r.reverses_entry_id = y.payment_entry_id))
      order by y.leg_no), '[]'::jsonb)
      from public.sales_payments y join public.cash_accounts a on a.org_id = y.org_id and a.id = y.cash_account_id
      where y.org_id = s.org_id and y.sale_id = s.id))
  from public.sales_invoices s
  cross join lateral (select count(*)::int as lines, coalesce(sum(c.cost), 0) as cost from public.sales_lines l
    left join public.sales_line_costs c on c.org_id = l.org_id and c.line_id = l.id where l.org_id = s.org_id and l.sale_id = s.id) as k
  cross join lateral private.sale_paid(s.id) as g
  cross join lateral (select case when s.status = 'void' then 0 else coalesce(private.entry_remaining(s.invoice_entry_id), 0) end as open) as v
  where s.org_id = public.auth_org() and s.id = p_sale
$$;

-- محتوى الفاتورة كما يرسله record_sale_v2 (الإعادة بالمعرّف تقارنه): المخزن والجهة (null للنقديّ) واليوم وخصم الفاتورة والملاحظة، والسطور
-- (المعرّف والمادّة والوحدة والكمية والسعر والخصم) والسيقان (المعرّف والصندوق والمبلغ) بترتيبها، والأرقام بلا أصفار زائدة.
create or replace function private.sale_v2_content(p_sale uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('warehouse', s.warehouse_id, 'party', case when s.walk_in then null else s.party_id end, 'on', s.sold_on,
    'discount', trim_scale(s.invoice_discount), 'note', s.note,
    'lines', (select jsonb_agg(jsonb_build_array(l.id, l.item_id, l.item_unit_id, trim_scale(l.unit_qty), trim_scale(l.unit_price_unit), trim_scale(l.line_discount))
        order by l.line_no)
      from public.sales_lines l where l.org_id = s.org_id and l.sale_id = s.id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_array(g.id, g.cash_account_id, trim_scale(g.amount)) order by g.leg_no), '[]'::jsonb)
      from public.sales_payments g where g.org_id = s.org_id and g.sale_id = s.id))
  from public.sales_invoices s where s.org_id = public.auth_org() and s.id = p_sale
$$;

-- جواب record_sale_v2 (العقد): الرقم واليوم والصافي والخصم والمدفوع والدين والنقديّ، والسطور بالكمية بالأساس وصافيها؛ بلا كلفة.
create or replace function private.sale_v2_result(p_sale uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('sale_id', s.id, 'doc_no', s.doc_no, 'status', s.status, 'sold_on', s.sold_on, 'warehouse_id', s.warehouse_id,
    'warehouse_name', w.name, 'party_id', s.party_id, 'party_name', p.name, 'walk_in', s.walk_in,
    'total', s.total::text, 'discount_total', s.discount_total::text, 'paid', s.paid::text, 'debt', (s.total - s.paid)::text,
    'lines', (select jsonb_agg(jsonb_build_object('line_id', l.id, 'line_no', l.line_no, 'item_id', l.item_id, 'qty_base', l.qty::text,
        'line_total', l.line_total::text) order by l.line_no)
      from public.sales_lines l where l.org_id = s.org_id and l.sale_id = s.id))
  from public.sales_invoices s
  join public.parties p on p.org_id = s.org_id and p.id = s.party_id
  join public.warehouses w on w.org_id = s.org_id and w.id = s.warehouse_id
  where s.org_id = public.auth_org() and s.id = p_sale
$$;

-- ─── هـ. البيع ───────────────────────────────────────────────────────────────────────────────────────────────────
-- البيع القديم (الواجهة المنشورة حتى الدمج): جسم 0021 كما هو، ويكتب الأعمدة الجديدة (الصافي والمدفوع، ووحدة الأساس بمعامل 1) وساق القبض
-- النقديّ الواحدة (مرآة رأسها بلا صفّ تدقيق)، ويرفض حساب الزبون النقديّ جهةً؛ ومفتاح قفل المعرّف يحمل المنشأة كالفاتورة الجديدة (مراجعة 0033 V2).
create or replace function public.record_sale(p_client_ref uuid, p_sale_id uuid, p_line_id uuid, p_party uuid, p_item uuid, p_qty numeric,
  p_unit_price numeric, p_sold_on date, p_payment text, p_cash_account uuid, p_warehouse uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'record_sale';
  v_org uuid := public.auth_org();
  v_cached jsonb;
  v_result jsonb;
  i public.items;
  w public.warehouses;
  p public.parties;
  b public.ledger_books;
  x public.sales_invoices;
  e public.party_entries;
  pay public.party_entries;
  m public.cash_moves;
  s record;
  dr record;
  v_same boolean;
  v_count int;
  v_names text;
  v_expired numeric;
  v_total numeric;
  v_cost numeric := 0;
  v_no text;
begin
  set local lock_timeout = '5s';
  perform private.require('sale.record');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('sale', p_sale_id, 'line', p_line_id, 'party', p_party, 'item', p_item,
    'qty', p_qty, 'price', p_unit_price, 'on', p_sold_on, 'payment', p_payment, 'box', p_cash_account, 'warehouse', p_warehouse));
  if v_cached is not null then
    if exists (select 1 from public.sales_invoices y where y.org_id = v_org and y.id = p_sale_id and y.status = 'void') then
      raise exception 'id_conflict' using hint = 'سُجّل هذا البيع من قبل ثمّ أُلغي. سجّل بيعاً جديداً.';
    end if;
    -- ref_claim يقنّع المال كلّه لمن لا يرى الكلفة، ومن يبيع يرى المبلغ: المخزَّن نفسه بقناع الكلفة وحدها.
    select y.result into v_cached from public.rpc_refs y where y.org_id = v_org and y.fn = v_fn and y.client_ref = p_client_ref;
    return private.sale_view(v_cached);
  end if;
  if p_sale_id is null or p_line_id is null or p_party is null or p_item is null then
    raise exception 'id_required' using hint = 'تعذّر الإرسال دون معرّفات البيع والجهة والمادّة. حدّث الشاشة وأعد المحاولة.';
  end if;

  -- الإعادة بالمعرّف (جواب ضاع): الفاتورة المرحَّلة نفسها بسطرها ومحتواها = حُفظت، فنتيجتها؛ وغيرها تعارض.
  perform pg_advisory_xact_lock(hashtextextended('sale:' || v_org::text || ':' || p_sale_id::text, 0));
  select * into x from public.sales_invoices y where y.id = p_sale_id;
  if x.id is not null then
    v_same := x.org_id = v_org and x.status = 'posted' and x.created_by is not distinct from auth.uid() and x.party_id = p_party and x.sold_on = p_sold_on
      and x.payment = p_payment and x.cash_account_id is not distinct from p_cash_account and (p_warehouse is null or x.warehouse_id = p_warehouse)
      and exists (select 1 from public.sales_lines y where y.org_id = x.org_id and y.sale_id = x.id and y.id = p_line_id and y.item_id = p_item
        and y.qty = p_qty and y.unit_price = p_unit_price);
    if coalesce(v_same, false) then
      v_result := private.sale_result(x.id);
      update public.rpc_refs set result = v_result where org_id = v_org and fn = v_fn and client_ref = p_client_ref;
      return private.sale_view(v_result);
    end if;
    raise exception 'id_conflict' using hint = case
      when x.org_id = v_org and x.status = 'void' then 'سُجّل هذا البيع من قبل ثمّ أُلغي. سجّل بيعاً جديداً.'
      else 'سُجّل بهذا المعرّف بيع غير الذي أرسلته الآن. حدّث الشاشة لترى ما سُجّل، ثمّ سجّل من جديد.'
    end;
  end if;
  if exists (select 1 from public.sales_lines y where y.id = p_line_id) then
    raise exception 'id_conflict' using hint = 'معرّف سطر البيع مستعمل لفاتورة أخرى. حدّث الشاشة وأعد المحاولة.';
  end if;

  -- المادّة والكمية والسعر والدفع.
  select * into i from public.items y where y.org_id = v_org and y.id = p_item;
  if i.id is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if i.archived_at is not null then
    raise exception 'item_archived' using hint = format('المادّة «%s» مؤرشفة، فلا تُباع. أعِدها من الأرشيف أوّلاً.', i.name);
  end if;
  if i.kind in ('hatching_egg', 'chick', 'table_egg') then
    raise exception 'not_sellable' using hint = format('«%s» لا تُباع من هنا في هذه النسخة: بيع البيض والأفراخ يأتي مع بيع الطيور.', i.name);
  end if;
  if p_qty is null or not (abs(p_qty) < 'Infinity') or p_qty <= 0 or p_qty <> round(p_qty, 3) then
    raise exception 'qty_not_positive' using hint = format('اكتب كمية «%s» أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.', i.name);
  end if;
  if i.base_unit = 'pc' and p_qty <> round(p_qty, 0) then
    raise exception 'pieces_not_whole' using hint = format('«%s» تُعدّ بالقطعة؛ اكتب عدداً صحيحاً من القطع.', i.name);
  end if;
  if p_unit_price is null or not (abs(p_unit_price) < 'Infinity') or p_unit_price < 0 or p_unit_price <> round(p_unit_price, 2) then
    raise exception 'bad_price' using hint = 'سعر البيع لكلّ وحدة صفر أو أكثر، بمرتبتين عشريتين كحدّ أقصى.';
  end if;
  v_total := private._mul_div_round(p_qty, p_unit_price, 1, 0);
  if p_unit_price > 0 and v_total = 0 then
    raise exception 'total_zero' using hint = 'مجموع البيع يُقرَّب إلى صفر دينار. راجع الكمية والسعر، أو اكتب السعر صفراً لتسليم بلا مقابل.';
  end if;
  if p_payment is null or p_payment not in ('credit', 'cash') then
    raise exception 'bad_payment' using hint = 'اختر طريقة الدفع: نقداً إلى الصندوق أو بالدين على الجهة.';
  end if;
  if p_payment = 'cash' and v_total = 0 then
    raise exception 'price_required_for_cash' using hint = 'التسليم بلا مقابل لا يُقبض نقداً؛ اختر «بالدين» أو اكتب السعر.';
  end if;
  if p_payment = 'cash' and p_cash_account is null then
    raise exception 'cash_account_required' using hint = 'اختر الصندوق الذي قبضت فيه.';
  end if;
  if p_payment = 'credit' and p_cash_account is not null then
    raise exception 'bad_payment' using hint = 'البيع بالدين على الجهة لا يأخذ صندوقاً؛ اختر «نقداً إلى الصندوق» إن قبضت الآن.';
  end if;
  if p_sold_on is null then
    raise exception 'date_required' using hint = 'اكتب تاريخ البيع.';
  end if;
  perform private.check_doc_date(p_sold_on);

  -- الجهة.
  select * into p from public.parties y where y.org_id = v_org and y.id = p_party;
  if p.id is null then
    raise exception 'party_not_found' using hint = 'هذه الجهة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if p.archived_at is not null then
    raise exception 'party_archived' using hint = format('الجهة «%s» مؤرشفة، فلا يُسجَّل لها بيع جديد. أعِدها من الأرشيف أوّلاً.', p.name);
  end if;
  -- 0033: حساب الزبون النقديّ لا يُختار جهةً (فاتورته من record_sale_v2 بلا جهة).
  if p.system_kind is not null then
    raise exception 'walk_in_party' using hint = 'هذا حساب الزبون النقديّ: اختر «زبون نقديّ» بلا اسم من الفاتورة الجديدة، أو زبوناً باسمه.';
  end if;

  -- المخزن: المختار يُفحص (النطاق قبل أن يُسمّى)، وإلّا الوحيد بالنطاق الذي فيه منها متاح بالتاريخ.
  if p_warehouse is not null then
    select * into w from public.warehouses y where y.org_id = v_org and y.id = p_warehouse;
    if w.id is null then
      raise exception 'warehouse_not_found' using hint = 'هذا المخزن غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
    end if;
    if not public.in_scope_wh(w.id) then
      raise exception 'out_of_scope' using hint = format('المخزن «%s» خارج نطاقك، فلا تبيع منه.', w.name);
    end if;
    if w.archived_at is not null then
      raise exception 'warehouse_archived' using hint = format('المخزن «%s» مؤرشف، فلا يُباع منه. اختر مخزناً آخر.', w.name);
    end if;
    if not private.item_admissible(w.kind, i.kind) then
      raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s». اختر مخزناً فيه هذه المادّة.', i.name, w.name);
    end if;
  else
    select (count(*) filter (where q.available > 0))::int,
      string_agg(format('«%s» (%s)', y.name, private.qty_text(q.available, i.base_unit)), '، ' order by y.name collate "C", y.id) filter (where q.available > 0),
      coalesce(sum(q.expired), 0)
    into v_count, v_names, v_expired
    from public.warehouses y cross join lateral private.stock_at(i.id, y.id, p_sold_on) as q
    where y.org_id = v_org and y.archived_at is null and private.item_admissible(y.kind, i.kind) and public.in_scope_wh(y.id);
    if v_count = 0 then
      raise exception 'insufficient_stock' using hint = format('لا يوجد «%s» متاح في مخازن نطاقك بتاريخ %s: طلبت %s، وعندك %s.%s',
        i.name, to_char(p_sold_on, 'DD/MM/YYYY'), private.qty_text(p_qty, i.base_unit), private.qty_text(0, i.base_unit),
        case when v_expired > 0 then format(' وفي مخازنك %s منتهية الصلاحية لا تُباع.', private.qty_text(v_expired, i.base_unit)) else '' end);
    end if;
    if v_count > 1 then
      raise exception 'store_required' using hint = format('«%s» موجودة في أكثر من مخزن في نطاقك: %s. اختر المخزن الذي تبيع منه.', i.name, v_names);
    end if;
    select y.* into w from public.warehouses y cross join lateral private.stock_at(i.id, y.id, p_sold_on) as q
    where y.org_id = v_org and y.archived_at is null and private.item_admissible(y.kind, i.kind) and public.in_scope_wh(y.id) and q.available > 0;
  end if;
  -- قيد الجهة في الدفتر الرئيسيّ لوحدة المخزن، والكتابة في دفتر تحتاج نطاق وحدته (book_for_post، E49).
  b := private.book_for_post(private.sale_book(w.id));

  -- الأقفال بترتيبها، وكلّ فحص بعد قفله.
  perform private.lock_parties(array[p.id]);
  perform private.check_post_date(p_sold_on, w.division_id);
  perform private.lock_masters(array[w.id], array[i.id], true);
  perform private.lock_balances(array[i.id], array[w.id]);
  if p_payment = 'cash' then
    perform private.lock_cash_account(p_cash_account, true);
  end if;
  select * into s from private.stock_at(i.id, w.id, p_sold_on);
  if s.available < p_qty then
    raise exception 'insufficient_stock' using hint = format('لا يكفي رصيد «%s» في «%s»: طلبت %s، وعندك %s بتاريخ %s.%s%s',
      i.name, w.name, private.qty_text(p_qty, i.base_unit), private.qty_text(s.available, i.base_unit), to_char(p_sold_on, 'DD/MM/YYYY'),
      case when s.expired > 0 then format(' وفي المخزن %s منتهية الصلاحية لا تُباع.', private.qty_text(s.expired, i.base_unit)) else '' end,
      case when s.later > 0 then format(' و%s استُلمت بعد هذا التاريخ.', private.qty_text(s.later, i.base_unit)) else '' end);
  end if;
  for dr in select * from private.draw(i.id, w.id, p_qty, p_sold_on, null, false) loop
    perform private.apply_move(dr.lot_id, 'sale', p_sale_id, p_line_id, -dr.qty, -dr.value, p_sold_on, null, coalesce(i.tracks_expiry, false));
    v_cost := v_cost + dr.value;
  end loop;
  v_no := private.next_doc_no(private.sale_doc_kind(w.kind), p_sold_on);
  -- القيود (FOUNDATION ٤٩٥): الفاتورة +المبلغ، والقبض النقديّ يروح لفاتورته هي أوّلاً، وبعده متبقّي الفاتورة يتوزّع من الأقدم.
  if v_total > 0 then
    e := private.write_entry(gen_random_uuid(), p.id, b.id, 'invoice', v_total, 'sale', p_sale_id, v_no, p_sold_on, null);
    if p_payment = 'cash' then
      pay := private.write_entry(gen_random_uuid(), p.id, b.id, 'payment', -v_total, 'sale', p_sale_id, v_no, p_sold_on, null);
      perform private.allocate_entry(pay.id, e.id);
      m := private.write_cash_move(p_cash_account, v_total, 'party_payment', 'sale', p_sale_id, pay.id, p_sold_on, null, null);
    end if;
    perform private.allocate_entry(e.id, null);
  end if;
  insert into public.sales_invoices (id, org_id, doc_no, party_id, warehouse_id, book_id, sold_on, payment, cash_account_id, invoice_entry_id, payment_entry_id,
    cash_move_id, status, client_ref, posted_at, posted_by, total, paid)
  values (p_sale_id, v_org, v_no, p.id, w.id, b.id, p_sold_on, p_payment, case when p_payment = 'cash' then p_cash_account end, e.id, pay.id, m.id,
    'posted', p_client_ref, now(), auth.uid(), v_total, case when p_payment = 'cash' then v_total else 0 end);
  insert into public.sales_lines (id, org_id, sale_id, warehouse_id, line_no, item_id, qty, base_unit, unit_price, line_total, unit_label, unit_factor,
    unit_qty, unit_price_unit, gross_total)
  values (p_line_id, v_org, p_sale_id, w.id, 1, i.id, p_qty, i.base_unit, p_unit_price, v_total, i.base_unit, 1, p_qty, p_unit_price, v_total);
  insert into public.sales_line_costs (org_id, sale_id, line_id, warehouse_id, cost) values (v_org, p_sale_id, p_line_id, w.id, v_cost);
  -- 0033: المقبوض ساق دفع واحدة (المصدر الواحد للمدفوع) بمعرّف مشتقّ من الفاتورة؛ وهي مرآة رأسها المدقَّق بنطاق مخزنه، فبلا صفّ تدقيق لها
  -- (app.sale_mirror_leg، مراجعة 0033 V3): بعد التراجع لا يبقى صفّ سيقان ظاهر لمن هو خارج نطاق المخزن.
  perform set_config('app.sale_mirror_leg', 'on', true);
  if pay.id is not null then
    insert into public.sales_payments (id, org_id, sale_id, warehouse_id, leg_no, cash_account_id, amount, payment_entry_id, cash_move_id)
    values (private.derived_ref(p_sale_id, 1), v_org, p_sale_id, w.id, 1, p_cash_account, v_total, pay.id, m.id);
  end if;
  perform set_config('app.sale_mirror_leg', '', true);
  perform private.mark_division_posted(w.division_id);
  v_result := private.sale_result(p_sale_id);
  update public.rpc_refs set result = v_result where org_id = v_org and fn = v_fn and client_ref = p_client_ref;
  return private.sale_view(v_result);
end
$$;

-- الفاتورة (sale.record): عدّة سطور من مخزن واحد بوحدات البيع وأسعارها، وخصم السطر وخصم الفاتورة بالدينار الصحيح (موزَّعاً على السطور بأكبر
-- الباقي على صافيها بعد خصمها)، وسيقان دفع من صناديق مختلفة مخصَّصة لهذه الفاتورة، والباقي دين على الزبون؛ أو الزبون النقديّ (p_party = null)
-- يدفع كلّه. الأقفال (§2.3): المرجع ← معرّف الفاتورة (بالمنشأة) ← الجهة (والزبون النقديّ لدفتر الفاتورة) ← قفل الفترة ← المخزن والموادّ ← الأرصدة ←
-- الصناديق بترتيب المعرّف ← الدفعات (draw) ← عدّاد المستندات؛ وكلّ فحص بعد قفله، ووحدات البيع كما قُرئت بحجمها الذي رأته الشاشة (بلا قفل). النقص
-- بعد جمع سطور المادّة الواحدة، والكلفة = قيم السحب بالضبط لكلّ سطر. والمبالغ بالدينار الصحيح تُطبَّع («1000.00» = «1000»).
create or replace function public.record_sale_v2(p_client_ref uuid, p_sale_id uuid, p_warehouse uuid, p_party uuid, p_sold_on date,
  p_lines jsonb, p_invoice_discount numeric, p_payments jsonb, p_note text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'record_sale_v2';
  v_org uuid := public.auth_org();
  v_cached jsonb;
  v_result jsonb;
  v_walk_in boolean := p_party is null;
  v_note text;
  v_party uuid;
  v_n int;
  v_legs int;
  v_inv numeric;
  v_sum numeric := 0;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_disc_total numeric := 0;
  v_no text;
  v_content jsonb;
  v_same boolean;
  o jsonb;
  k int;
  i public.items;
  u public.item_units;
  w public.warehouses;
  p public.parties;
  b public.ledger_books;
  x public.sales_invoices;
  e public.party_entries;
  pay public.party_entries;
  m public.cash_moves;
  r record;
  s record;
  dr record;
  v_line_ids uuid[] := '{}';
  v_items uuid[] := '{}';
  v_units uuid[] := '{}';
  v_qty numeric[] := '{}';
  v_price numeric[] := '{}';
  v_disc numeric[] := '{}';
  v_expect numeric[] := '{}';
  v_names text[] := '{}';
  v_base_unit text[] := '{}';
  v_tracks boolean[] := '{}';
  v_gross numeric[] := '{}';
  v_share numeric[] := '{}';
  v_net numeric[] := '{}';
  v_factor numeric[] := '{}';
  v_label text[] := '{}';
  v_base numeric[] := '{}';
  v_cost numeric[] := '{}';
  v_distinct uuid[];
  v_leg_ids uuid[] := '{}';
  v_boxes uuid[] := '{}';
  v_amounts numeric[] := '{}';
  v_pay_entries uuid[] := '{}';
  v_moves uuid[] := '{}';
  v_conflict text;
begin
  set local lock_timeout = '5s';
  perform private.require('sale.record');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('sale', p_sale_id, 'warehouse', p_warehouse, 'party', p_party, 'on', p_sold_on,
    'lines', p_lines, 'discount', p_invoice_discount, 'payments', p_payments, 'note', p_note));
  if v_cached is not null then
    if exists (select 1 from public.sales_invoices y where y.org_id = v_org and y.id = p_sale_id and y.status = 'void') then
      raise exception 'id_conflict' using hint = 'سُجّلت هذه الفاتورة من قبل ثمّ أُلغيت. سجّل فاتورة جديدة.';
    end if;
    select y.result into v_cached from public.rpc_refs y where y.org_id = v_org and y.fn = v_fn and y.client_ref = p_client_ref;
    return v_cached;
  end if;
  if p_sale_id is null then
    raise exception 'id_required' using hint = 'تعذّر الإرسال دون معرّف الفاتورة. حدّث الشاشة وأعد المحاولة.';
  end if;

  -- شكل السطور والسيقان (قبل أيّ قراءة): مصفوفتان من كائنات بمعرّفاتها، وحدّاهما.
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'bad_lines' using hint = 'سطور الفاتورة غير صالحة. حدّث الشاشة وأعد المحاولة.';
  end if;
  v_n := jsonb_array_length(p_lines);
  if v_n = 0 then
    raise exception 'no_lines' using hint = 'أضف مادّة واحدة على الأقلّ إلى الفاتورة.';
  end if;
  if v_n > 100 then
    raise exception 'too_many_lines' using hint = 'الفاتورة حتى 100 سطر. قسّمها إلى فاتورتين.';
  end if;
  for k in 1 .. v_n loop
    o := p_lines -> (k - 1);
    if jsonb_typeof(o) is distinct from 'object' then
      raise exception 'bad_lines' using hint = 'سطور الفاتورة غير صالحة. حدّث الشاشة وأعد المحاولة.';
    end if;
    v_line_ids[k] := private.json_uuid(o, 'line_id');
    v_items[k] := private.json_uuid(o, 'item_id');
    if v_line_ids[k] is null or v_items[k] is null then
      raise exception 'id_required' using hint = 'تعذّر الإرسال دون معرّفات السطر والمادّة. حدّث الشاشة وأعد المحاولة.';
    end if;
    if coalesce(jsonb_typeof(o -> 'unit_id'), 'null') = 'null' then
      v_units[k] := null;
    else
      v_units[k] := private.json_uuid(o, 'unit_id');
      if v_units[k] is null then
        raise exception 'unit_mismatch' using hint = 'وحدة البيع في أحد السطور غير صالحة. اختر وحدة من وحدات المادّة.';
      end if;
    end if;
    v_qty[k] := private.json_num(o, 'qty');
    v_price[k] := private.json_num(o, 'unit_price');
    v_disc[k] := case when coalesce(jsonb_typeof(o -> 'discount'), 'null') = 'null' then 0 else private.json_num(o, 'discount') end;
    v_expect[k] := case when coalesce(jsonb_typeof(o -> 'factor'), 'null') = 'null' then null else coalesce(private.json_num(o, 'factor'), -1) end;
  end loop;
  if (select count(distinct y) from unnest(v_line_ids) as y) <> v_n then
    raise exception 'bad_lines' using hint = 'في الفاتورة سطران بمعرّف واحد. حدّث الشاشة وأعد المحاولة.';
  end if;
  if p_payments is not null and jsonb_typeof(p_payments) <> 'array' then
    raise exception 'bad_payments' using hint = 'دفعات الفاتورة غير صالحة. حدّث الشاشة وأعد المحاولة.';
  end if;
  v_legs := coalesce(jsonb_array_length(p_payments), 0);
  if v_legs > 5 then
    raise exception 'too_many_payments' using hint = 'الدفع الآن من خمسة صناديق على الأكثر.';
  end if;
  for k in 1 .. v_legs loop
    o := p_payments -> (k - 1);
    if jsonb_typeof(o) is distinct from 'object' then
      raise exception 'bad_payments' using hint = 'دفعات الفاتورة غير صالحة. حدّث الشاشة وأعد المحاولة.';
    end if;
    v_leg_ids[k] := private.json_uuid(o, 'leg_id');
    if v_leg_ids[k] is null then
      raise exception 'id_required' using hint = 'تعذّر الإرسال دون معرّفات الدفعات. حدّث الشاشة وأعد المحاولة.';
    end if;
    v_boxes[k] := private.json_uuid(o, 'cash_account_id');
    if v_boxes[k] is null then
      raise exception 'cash_account_required' using hint = 'اختر الصندوق لكلّ دفعة.';
    end if;
    v_amounts[k] := private.json_num(o, 'amount');
  end loop;
  if (select count(distinct y) from unnest(v_leg_ids) as y) <> v_legs then
    raise exception 'bad_payments' using hint = 'في الفاتورة دفعتان بمعرّف واحد. حدّث الشاشة وأعد المحاولة.';
  end if;
  if (select count(distinct y) from unnest(v_boxes) as y) <> v_legs then
    raise exception 'duplicate_box' using hint = 'كلّ صندوق مرّة واحدة في الفاتورة؛ اجمع مبلغه في دفعة واحدة.';
  end if;
  v_inv := coalesce(p_invoice_discount, 0);
  v_note := private.note_text(p_note);

  -- الإعادة بالمعرّف (جواب ضاع): الفاتورة المرحَّلة نفسها بمحتواها = حُفظت، فنتيجتها؛ وغيرها تعارض.
  perform pg_advisory_xact_lock(hashtextextended('sale:' || v_org::text || ':' || p_sale_id::text, 0));
  select * into x from public.sales_invoices y where y.id = p_sale_id;
  if x.id is not null then
    v_content := jsonb_build_object('warehouse', p_warehouse, 'party', p_party, 'on', p_sold_on, 'discount', trim_scale(v_inv), 'note', v_note,
      'lines', (select jsonb_agg(jsonb_build_array(y.lid, y.iid, y.uid, trim_scale(y.q), trim_scale(y.pr), trim_scale(y.d)) order by y.n)
        from unnest(v_line_ids, v_items, v_units, v_qty, v_price, v_disc) with ordinality as y(lid, iid, uid, q, pr, d, n)),
      'payments', (select coalesce(jsonb_agg(jsonb_build_array(y.gid, y.bid, trim_scale(y.a)) order by y.n), '[]'::jsonb)
        from unnest(v_leg_ids, v_boxes, v_amounts) with ordinality as y(gid, bid, a, n)));
    v_same := x.org_id = v_org and x.status = 'posted' and x.created_by is not distinct from auth.uid() and private.sale_v2_content(x.id) = v_content;
    if coalesce(v_same, false) then
      v_result := private.sale_v2_result(x.id);
      update public.rpc_refs set result = v_result where org_id = v_org and fn = v_fn and client_ref = p_client_ref;
      return v_result;
    end if;
    raise exception 'id_conflict' using hint = case
      when x.org_id = v_org and x.status = 'void' then 'سُجّلت هذه الفاتورة من قبل ثمّ أُلغيت. سجّل فاتورة جديدة.'
      else 'سُجّلت بهذا المعرّف فاتورة غير التي أرسلتها الآن. حدّث الشاشة لترى ما سُجّل، ثمّ سجّل من جديد.'
    end;
  end if;
  if exists (select 1 from public.sales_lines y where y.id = any (v_line_ids)) then
    raise exception 'id_conflict' using hint = 'معرّف سطر من سطور الفاتورة مستعمل لفاتورة أخرى. حدّث الشاشة وأعد المحاولة.';
  end if;
  if exists (select 1 from public.sales_payments y where y.id = any (v_leg_ids)) then
    raise exception 'id_conflict' using hint = 'معرّف دفعة من دفعات الفاتورة مستعمل لفاتورة أخرى. حدّث الشاشة وأعد المحاولة.';
  end if;

  -- الموادّ والكميات والأسعار والخصوم (بترتيب السطور).
  for k in 1 .. v_n loop
    select * into i from public.items y where y.org_id = v_org and y.id = v_items[k];
    if i.id is null then
      raise exception 'item_not_found' using hint = 'مادّة في الفاتورة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
    end if;
    if i.archived_at is not null then
      raise exception 'item_archived' using hint = format('المادّة «%s» مؤرشفة، فلا تُباع. أعِدها من الأرشيف أوّلاً.', i.name);
    end if;
    if i.kind in ('hatching_egg', 'chick', 'table_egg') then
      raise exception 'not_sellable' using hint = format('«%s» لا تُباع من هنا في هذه النسخة: بيع البيض والأفراخ يأتي في مرحلة لاحقة.', i.name);
    end if;
    if v_qty[k] is null or not (abs(v_qty[k]) < 'Infinity') or v_qty[k] <= 0 or v_qty[k] <> round(v_qty[k], 3) then
      raise exception 'qty_not_positive' using hint = format('اكتب كمية «%s» أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.', i.name);
    end if;
    if v_price[k] is null or not (abs(v_price[k]) < 'Infinity') or v_price[k] < 0 or v_price[k] <> round(v_price[k], 2) then
      raise exception 'bad_price' using hint = format('سعر «%s» لكلّ وحدة صفر أو أكثر، بمرتبتين عشريتين كحدّ أقصى.', i.name);
    end if;
    v_gross[k] := private._mul_div_round(v_qty[k], v_price[k], 1, 0);
    if v_price[k] > 0 and v_gross[k] = 0 then
      raise exception 'total_zero' using hint = format('مبلغ «%s» يُقرَّب إلى صفر دينار. راجع الكمية والسعر، أو اكتب السعر صفراً لتسليم بلا مقابل.', i.name);
    end if;
    if v_disc[k] is null or not (abs(v_disc[k]) < 'Infinity') or v_disc[k] < 0 or v_disc[k] <> round(v_disc[k], 0) then
      raise exception 'bad_discount' using hint = format('خصم «%s» بالدينار الصحيح، صفر أو أكثر.', i.name);
    end if;
    -- المبلغ «500.00» بالدينار الصحيح نفسه «500» (مراجعة 0033 A7): يُطبَّع قبل أيّ حساب، فلا يحمل الصافي والقيد مراتب كُتبت أصفاراً.
    v_disc[k] := round(v_disc[k], 0);
    if v_disc[k] > v_gross[k] then
      raise exception 'bad_discount' using hint = format('خصم «%s» (%s دينار) أكبر من مبلغ سطره (%s دينار).', i.name, private.money_text(v_disc[k]),
        private.money_text(v_gross[k]));
    end if;
    v_names[k] := i.name;
    v_base_unit[k] := i.base_unit;
    v_tracks[k] := coalesce(i.tracks_expiry, false);
    v_sum := v_sum + v_gross[k] - v_disc[k];
  end loop;
  if not (abs(v_inv) < 'Infinity') or v_inv < 0 or v_inv <> round(v_inv, 0) then
    raise exception 'bad_discount' using hint = 'خصم الفاتورة بالدينار الصحيح، صفر أو أكثر.';
  end if;
  v_inv := round(v_inv, 0);
  if v_inv > v_sum then
    raise exception 'bad_discount' using hint = format('خصم الفاتورة (%s دينار) أكبر من مجموع سطورها بعد خصوماتها (%s دينار).', private.money_text(v_inv),
      private.money_text(v_sum));
  end if;
  -- خصم الفاتورة على صافي كلّ سطر بعد خصمه، بأكبر الباقي بالدينار (التعادل بترتيب السطر)، فمجموع الأنصبة = الخصم بالضبط.
  if v_inv > 0 then
    v_share := private.alloc_lr(v_inv, array(select v_gross[y] - v_disc[y] from generate_series(1, v_n) as y order by y), 0);
  else
    v_share := array_fill(0::numeric, array[v_n]);
  end if;
  for k in 1 .. v_n loop
    v_net[k] := v_gross[k] - v_disc[k] - v_share[k];
    v_total := v_total + v_net[k];
    v_disc_total := v_disc_total + v_disc[k];
  end loop;
  v_disc_total := v_disc_total + v_inv;

  -- الدفع الآن: كلّ ساق بالدينار الصحيح أكبر من صفر، والمدفوع لا يزيد على الصافي، والنقديّ يدفع كلّه.
  for k in 1 .. v_legs loop
    perform private.check_amount(v_amounts[k], true);
    v_amounts[k] := round(v_amounts[k], 0);
    v_paid := v_paid + v_amounts[k];
  end loop;
  if v_paid > v_total then
    raise exception 'overpaid' using hint = format('المدفوع الآن (%s دينار) أكثر من صافي الفاتورة (%s دينار). اكتب المبلغ الذي قبضته من الفاتورة وحدها.',
      private.money_text(v_paid), private.money_text(v_total));
  end if;
  if v_walk_in and v_paid <> v_total then
    raise exception 'walk_in_unpaid' using hint = format('الزبون النقديّ يدفع الفاتورة كلّها الآن (%s دينار)، والمدفوع %s دينار. اختر زبوناً باسمه ليبقى الباقي ديناً عليه.',
      private.money_text(v_total), private.money_text(v_paid));
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'bad_note' using hint = format('الملاحظة %s حرفاً، والحدّ 500 حرف. اختصرها.', length(v_note));
  end if;
  if p_sold_on is null then
    raise exception 'date_required' using hint = 'اكتب تاريخ البيع.';
  end if;
  perform private.check_doc_date(p_sold_on);

  -- الجهة (أو الزبون النقديّ)، والمخزن (النطاق قبل أن يُسمّى) وقبوله لكلّ مادّة، ودفتره.
  if not v_walk_in then
    select * into p from public.parties y where y.org_id = v_org and y.id = p_party;
    if p.id is null then
      raise exception 'party_not_found' using hint = 'هذه الجهة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
    end if;
    if p.archived_at is not null then
      raise exception 'party_archived' using hint = format('الجهة «%s» مؤرشفة، فلا يُسجَّل لها بيع جديد. أعِدها من الأرشيف أوّلاً.', p.name);
    end if;
    if p.system_kind is not null then
      raise exception 'walk_in_party' using hint = 'هذا حساب الزبون النقديّ: اختر «زبون نقديّ» بلا اسم، أو زبوناً باسمه.';
    end if;
  end if;
  if p_warehouse is null then
    raise exception 'store_required' using hint = 'اختر المخزن الذي تبيع منه.';
  end if;
  select * into w from public.warehouses y where y.org_id = v_org and y.id = p_warehouse;
  if w.id is null then
    raise exception 'warehouse_not_found' using hint = 'هذا المخزن غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if not public.in_scope_wh(w.id) then
    raise exception 'out_of_scope' using hint = format('المخزن «%s» خارج نطاقك، فلا تبيع منه.', w.name);
  end if;
  if w.archived_at is not null then
    raise exception 'warehouse_archived' using hint = format('المخزن «%s» مؤرشف، فلا يُباع منه. اختر مخزناً آخر.', w.name);
  end if;
  for k in 1 .. v_n loop
    if not private.item_admissible(w.kind, (select y.kind from public.items y where y.org_id = v_org and y.id = v_items[k])) then
      raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s». اختر مخزناً فيه هذه المادّة، أو بِعها في فاتورة من مخزنها.',
        v_names[k], w.name);
    end if;
  end loop;
  b := private.book_for_post(private.sale_book(w.id));
  v_party := case when v_walk_in then private.walk_in_party() else p.id end;

  -- الأقفال بترتيبها، وكلّ فحص بعد قفله. الزبون النقديّ لكلّ (جهة، دفتر) لا للجهة كلّها (lock_sale_party، مراجعة 0033 B3).
  perform private.lock_sale_party(v_party, b.id, v_walk_in);
  perform private.check_post_date(p_sold_on, w.division_id);
  v_distinct := array(select distinct y from unnest(v_items) as y order by 1);
  perform private.lock_masters(array[w.id], v_distinct, true);
  -- وحدات البيع كما تُقرأ الآن بلا قفل (مراجعة 0033 B2: قفل المشاركة بترتيب المعرّف يتقافل مع تبديل الوحدة الافتراضية، الذي يقفل الجديدة ثمّ القديمة
  -- بمحفّز item_units_check): الحجم الذي رأته الشاشة إلزاميّ لكلّ سطر بوحدة بيع (factor_required)، فأيّ تغيير ثبت قبل القراءة unit_changed، وما ثبت
  -- بعدها لا يغيّر ما بِيع بالحجم الذي رآه البائع؛ وكذا الأرشفة ووحدة البيع كما قُرئتا.
  for k in 1 .. v_n loop
    if v_units[k] is null then
      v_factor[k] := 1;
      v_label[k] := v_base_unit[k];
    else
      select * into u from public.item_units y where y.org_id = v_org and y.id = v_units[k];
      if u.id is null or u.item_id <> v_items[k] then
        raise exception 'unit_mismatch' using hint = format('الوحدة المختارة ليست من وحدات «%s». اختر وحدة من وحداتها.', v_names[k]);
      end if;
      if not u.for_sale or u.archived_at is not null then
        raise exception 'unit_mismatch' using hint = format('«%s» ليست وحدة بيع فعّالة لـ«%s». اختر وحدة بيع أخرى.', u.label, v_names[k]);
      end if;
      if v_expect[k] is null then
        raise exception 'factor_required' using hint = format('سطر «%s» بوحدة «%s» وصل دون حجمها الذي رأته الشاشة، فلا يُعرف أنّه لم يتغيّر. حدّث الشاشة وأعد المحاولة.',
          v_names[k], u.label);
      end if;
      v_factor[k] := u.factor_to_base;
      v_label[k] := u.label;
    end if;
    if v_expect[k] is not null and v_expect[k] <> v_factor[k] then
      raise exception 'unit_changed' using hint = format('تغيّر حجم «%s» لـ«%s» منذ فتحت الشاشة (صار %s). حدّث الشاشة وراجع السطر.', v_label[k], v_names[k],
        private.qty_text(v_factor[k], v_base_unit[k]));
    end if;
    v_base[k] := round(v_qty[k] * v_factor[k], 3);
    if v_base[k] <= 0 then
      raise exception 'qty_not_positive' using hint = format('كمية «%s» بوحدة الأساس قُرِّبت إلى صفر. اكتب كمية أكبر.', v_names[k]);
    end if;
    if v_base_unit[k] = 'pc' and v_base[k] <> trunc(v_base[k]) then
      raise exception 'pieces_not_whole' using hint = format('«%s» تُعدّ بالقطعة؛ اكتب كمية تعطي عدداً صحيحاً من القطع.', v_names[k]);
    end if;
  end loop;
  perform private.lock_balances(v_distinct, array_fill(w.id, array[cardinality(v_distinct)]));
  for r in select y.box from unnest(v_boxes) as y(box) order by 1 loop
    perform private.lock_cash_account(r.box, true);
  end loop;
  -- النقص لكلّ مادّة بعد جمع سطورها (بترتيب أوّل سطر لها).
  for r in select y.item, sum(y.q) as need, min(y.n)::int as first from unnest(v_items, v_base) with ordinality as y(item, q, n) group by y.item order by 3 loop
    select * into s from private.stock_at(r.item, w.id, p_sold_on);
    if s.available < r.need then
      raise exception 'insufficient_stock' using hint = format('لا يكفي رصيد «%s» في «%s»: طلبت %s، وعندك %s بتاريخ %s.%s%s',
        v_names[r.first], w.name, private.qty_text(r.need, v_base_unit[r.first]), private.qty_text(s.available, v_base_unit[r.first]),
        to_char(p_sold_on, 'DD/MM/YYYY'),
        case when s.expired > 0 then format(' وفي المخزن %s منتهية الصلاحية لا تُباع.', private.qty_text(s.expired, v_base_unit[r.first])) else '' end,
        case when s.later > 0 then format(' و%s استُلمت بعد هذا التاريخ.', private.qty_text(s.later, v_base_unit[r.first])) else '' end);
    end if;
  end loop;
  for k in 1 .. v_n loop
    v_cost[k] := 0;
    for dr in select * from private.draw(v_items[k], w.id, v_base[k], p_sold_on, null, false) loop
      perform private.apply_move(dr.lot_id, 'sale', p_sale_id, v_line_ids[k], -dr.qty, -dr.value, p_sold_on, null, v_tracks[k]);
      v_cost[k] := v_cost[k] + dr.value;
    end loop;
  end loop;
  v_no := private.next_doc_no(private.sale_doc_kind(w.kind), p_sold_on);

  -- القيود (FOUNDATION ٤٩٥): الفاتورة +الصافي، وكلّ ساق قيد قبض −مبلغها يروح لهذه الفاتورة أوّلاً وحركة صندوق party_payment +مبلغها؛ وبعدها
  -- متبقّي الفاتورة يتوزّع من الأقدم. حساب الزبون النقديّ يُكتب بعلم المعاملة وحدها.
  if v_walk_in then
    perform set_config('app.walk_in_sale', 'on', true);
  end if;
  if v_total > 0 then
    e := private.write_entry(gen_random_uuid(), v_party, b.id, 'invoice', v_total, 'sale', p_sale_id, v_no, p_sold_on, null);
  end if;
  for k in 1 .. v_legs loop
    pay := private.write_entry(gen_random_uuid(), v_party, b.id, 'payment', -v_amounts[k], 'sale', p_sale_id, v_no, p_sold_on, null);
    perform private.allocate_entry(pay.id, e.id);
    m := private.write_cash_move(v_boxes[k], v_amounts[k], 'party_payment', 'sale', p_sale_id, pay.id, p_sold_on, null, null);
    v_pay_entries[k] := pay.id;
    v_moves[k] := m.id;
  end loop;
  if e.id is not null then
    perform private.allocate_entry(e.id, null);
  end if;
  if v_walk_in then
    perform set_config('app.walk_in_sale', '', true);
  end if;
  -- المعرّفات من الجهاز: فاتورة أخرى متزامنة بمعرّف السطر أو الساق نفسه (أو بمعرّف الفاتورة من منشأة أخرى) تعبر فحص «مستعمل» قبل أن تثبت، ثمّ
  -- يردّها الفهرس الفريد بعد انتظارها؛ فالرفض باسمه وتلميحه لا بخطأ الفهرس الخام (مراجعة 0033 B6).
  begin
    insert into public.sales_invoices (id, org_id, doc_no, party_id, warehouse_id, book_id, sold_on, payment, cash_account_id, invoice_entry_id, payment_entry_id,
      cash_move_id, status, client_ref, posted_at, posted_by, discount_total, invoice_discount, note, walk_in, total, paid)
    values (p_sale_id, v_org, v_no, v_party, w.id, b.id, p_sold_on, case when v_paid = v_total and v_total > 0 then 'cash' else 'credit' end, null, e.id, null,
      null, 'posted', p_client_ref, now(), auth.uid(), v_disc_total, v_inv, v_note, v_walk_in, v_total, v_paid);
    for k in 1 .. v_n loop
      insert into public.sales_lines (id, org_id, sale_id, warehouse_id, line_no, item_id, qty, base_unit, unit_price, line_total, item_unit_id, unit_label,
        unit_factor, unit_qty, unit_price_unit, gross_total, line_discount, invoice_discount_share)
      values (v_line_ids[k], v_org, p_sale_id, w.id, k, v_items[k], v_base[k], v_base_unit[k], private._mul_div_round(1, v_price[k], v_factor[k], 2), v_net[k],
        v_units[k], v_label[k], v_factor[k], round(v_qty[k], 3), round(v_price[k], 2), v_gross[k], round(v_disc[k], 0), v_share[k]);
      insert into public.sales_line_costs (org_id, sale_id, line_id, warehouse_id, cost) values (v_org, p_sale_id, v_line_ids[k], w.id, v_cost[k]);
    end loop;
    for k in 1 .. v_legs loop
      insert into public.sales_payments (id, org_id, sale_id, warehouse_id, leg_no, cash_account_id, amount, payment_entry_id, cash_move_id)
      values (v_leg_ids[k], v_org, p_sale_id, w.id, k, v_boxes[k], round(v_amounts[k], 0), v_pay_entries[k], v_moves[k]);
    end loop;
  exception when unique_violation then
    get stacked diagnostics v_conflict = table_name;
    if v_conflict = 'sales_lines' then
      raise exception 'id_conflict' using hint = 'معرّف سطر من سطور الفاتورة مستعمل لفاتورة أخرى. حدّث الشاشة وأعد المحاولة.';
    elsif v_conflict = 'sales_payments' then
      raise exception 'id_conflict' using hint = 'معرّف دفعة من دفعات الفاتورة مستعمل لفاتورة أخرى. حدّث الشاشة وأعد المحاولة.';
    elsif v_conflict = 'sales_invoices' then
      raise exception 'id_conflict' using hint = 'سُجّلت بهذا المعرّف فاتورة غير التي أرسلتها الآن. حدّث الشاشة لترى ما سُجّل، ثمّ سجّل من جديد.';
    end if;
    raise;
  end;
  perform private.mark_division_posted(w.division_id);
  v_result := private.sale_v2_result(p_sale_id);
  update public.rpc_refs set result = v_result where org_id = v_org and fn = v_fn and client_ref = p_client_ref;
  return v_result;
end
$$;

-- إلغاء الفاتورة (void): كلّ حركة سحب لكلّ سطر ترجع لدفعتها بيوم الإلغاء، وقيد الفاتورة يُلغى بقيد عكسيّ؛ وسيقان الزبون باسمه تبقى رصيداً له
-- (FOUNDATION ٥٨٣، وسابقة void_receipt؛ تُردّ من «ألغِ القبض»)، وسيقان الزبون النقديّ تُردّ معها بيوم الإلغاء (قيد عكسيّ وحركة صندوق عكسيّة لكلّ
-- ساق، فرصيده صفر). الأقفال: المرجع ← الجهة (والزبون النقديّ لدفتر فاتورته، lock_sale_party) ← قفل الفترة ← الفاتورة ← المخزن والموادّ ← الأرصدة ←
-- صناديق الردّ بترتيب المعرّف. وفحوصه بترتيبها مرآتها private.sale_void_block (can_void في القرّاء).
create or replace function public.void_sale(p_sale_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_sale';
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_cached jsonb;
  v_reason text;
  x public.sales_invoices;
  g public.sales_payments;
  w public.warehouses;
  mv public.stock_moves;
  v_items uuid[];
  v_rev uuid;
  v_back int := 0;
  v_kept numeric := 0;
  v_refunded numeric := 0;
  v_kept_ids uuid[] := '{}';
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_sale_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into x from public.sales_invoices y where y.org_id = v_org and y.id = p_sale_id;
  if x.id is null then
    raise exception 'doc_not_found' using hint = 'هذا البيع غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(x.warehouse_id, true);
  perform private.book_for_post(x.book_id);
  perform private.lock_sale_party(x.party_id, x.book_id, x.walk_in);
  perform private.check_void_date();
  select * into x from public.sales_invoices y where y.org_id = v_org and y.id = p_sale_id for update;
  if x.status = 'void' then
    raise exception 'already_void' using hint = format('البيع %s ملغى من قبل.', x.doc_no);
  end if;
  v_items := array(select distinct l.item_id from public.sales_lines l where l.org_id = v_org and l.sale_id = x.id order by 1);
  perform private.lock_masters(array[w.id], v_items, false);
  perform private.lock_balances(v_items, array_fill(w.id, array[cardinality(v_items)]));
  if x.walk_in then
    for g in select y.* from public.sales_payments y where y.org_id = v_org and y.sale_id = x.id order by y.cash_account_id loop
      perform private.lock_cash_account(g.cash_account_id, false);
    end loop;
  end if;
  for mv in
    select z.* from public.stock_moves z
    where z.org_id = v_org and z.doc_kind = 'sale' and z.doc_id = x.id and z.reverses_move_id is null
    order by z.seq
  loop
    perform private.apply_move(mv.lot_id, 'sale', x.id, mv.doc_line_id, -mv.qty, -mv.value, v_today, mv.id);
    v_back := v_back + 1;
  end loop;
  if x.walk_in then
    perform set_config('app.walk_in_sale', 'on', true);
  end if;
  if x.invoice_entry_id is not null then
    perform private.void_entry(x.invoice_entry_id, v_reason);
  end if;
  for g in select y.* from public.sales_payments y where y.org_id = v_org and y.sale_id = x.id order by y.leg_no loop
    continue when exists (select 1 from public.party_entries q where q.org_id = v_org and q.reverses_entry_id = g.payment_entry_id);
    if x.walk_in then
      v_rev := private.void_entry(g.payment_entry_id, v_reason);
      perform private.write_cash_move(g.cash_account_id, -g.amount, 'party_payment', 'sale', x.id, v_rev, v_today, g.cash_move_id, null);
      v_refunded := v_refunded + g.amount;
    else
      v_kept := v_kept + g.amount;
      v_kept_ids := v_kept_ids || g.payment_entry_id;
    end if;
  end loop;
  if x.walk_in then
    perform set_config('app.walk_in_sale', '', true);
  end if;
  update public.sales_invoices set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason, version = version + 1
  where org_id = v_org and id = x.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', x.id, 'doc_no', x.doc_no, 'status', 'void', 'voided_on', v_today,
    'reversed_moves', v_back, 'party_id', x.party_id, 'walk_in', x.walk_in, 'payment_entry_id', v_kept_ids[1], 'payment_entry_ids', to_jsonb(v_kept_ids),
    'money', jsonb_build_object('line_total', x.total::text, 'payment_kept', v_kept::text, 'payment_refunded', v_refunded::text)));
end
$$;

-- ─── و. القرّاء ──────────────────────────────────────────────────────────────────────────────────────────────────
-- موادّ المخزن القابلة للبيع (sale.record، وبوّابات الكاتب نفسها: المخزن بالنطاق وغير مؤرشف ودفتر وحدته بالنطاق): items كلّ مادّة فعّالة يقبلها المخزن،
-- بالمتاح اليوم (ولو صفراً، فالمسح يقول «نفدت» لا «غير معروفة»)، وسعر البيع للأساس، ووحدات البيع؛ بترتيب الاسم. وcash_accounts صناديق المنشأة الفعّالة
-- باسمها ونوعها وحدهما (بلا رصيد) لسيقان الدفع: الأمين لا يقرأ جدول الصناديق (كـ«بِع» في item_file منذ 0021).
create or replace function public.sale_catalog(p_warehouse uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  w public.warehouses;
begin
  perform private.require('sale.record');
  if p_warehouse is null then
    raise exception 'store_required' using hint = 'اختر المخزن الذي تبيع منه.';
  end if;
  w := private.stock_wh(p_warehouse, true);
  if w.archived_at is not null then
    raise exception 'warehouse_archived' using hint = format('المخزن «%s» مؤرشف، فلا يُباع منه. اختر مخزناً آخر.', w.name);
  end if;
  perform private.book_for_post(private.sale_book(w.id));
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('item_id', i.id, 'name', i.name, 'barcode', i.barcode, 'alt_codes', to_jsonb(i.alt_codes), 'kind', i.kind,
        'category', c.name, 'base_unit', i.base_unit, 'tracks_expiry', i.tracks_expiry, 'available', q.available::text, 'expired', q.expired::text,
        'sell_price', ip.sell_price::text,
        'units', (select coalesce(jsonb_agg(jsonb_build_object('unit_id', u.id, 'label', u.label, 'factor', u.factor_to_base::text)
            order by u.factor_to_base, u.label collate "C", u.id), '[]'::jsonb)
          from public.item_units u where u.org_id = i.org_id and u.item_id = i.id and u.for_sale and u.archived_at is null))
      order by i.name collate "C", i.id)
    from public.items i
    left join public.item_categories c on c.org_id = i.org_id and c.id = i.category_id
    left join public.item_prices ip on ip.org_id = i.org_id and ip.item_id = i.id
    cross join lateral private.stock_at(i.id, w.id, v_today) as q
    where i.org_id = v_org and i.archived_at is null and i.kind not in ('hatching_egg', 'chick', 'table_egg') and private.item_admissible(w.kind, i.kind)
  ), '[]'::jsonb),
    'cash_accounts', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'kind', a.kind) order by a.name collate "C", a.id), '[]'::jsonb)
      from public.cash_accounts a where a.org_id = v_org and a.archived_at is null));
end
$$;

-- فاتورة واحدة: نتيجتها بالشكل القديم، ودفعاتها المسحوبة لكلّ سطر (الكمية لكلّ دور، والقيمة داخل cost.money)، وقيد الفاتورة والساق الأولى، وأفعالها؛
-- ومفاتيح الفاتورة الجديدة (private.sale_more). can_void من فحوص void_sale نفسها وبترتيبها، وvoid_block رمز رفضها (مراجعة 0033).
create or replace function public.sale_detail(p_sale uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  x public.sales_invoices;
  g record;
  v_block text;
  v_result jsonb;
begin
  perform private.require('read');
  if not public.can_see_sales() then
    raise exception 'forbidden' using hint = 'المبيعات لأدوار المبيعات فقط.';
  end if;
  select * into x from public.sales_invoices y where y.org_id = v_org and y.id = p_sale;
  if x.id is null then
    raise exception 'doc_not_found' using hint = 'هذا البيع غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_wh(x.warehouse_id) then
    raise exception 'out_of_scope' using hint = 'مخزن هذا البيع خارج نطاقك.';
  end if;
  select * into g from private.sale_paid(x.id);
  v_block := private.sale_void_block(x.id);
  v_result := private.sale_result(x.id) || jsonb_build_object(
    'can_void', v_block is null, 'void_block', v_block,
    'draws', (select coalesce(jsonb_agg(jsonb_build_object('line_id', m.doc_line_id, 'lot_id', m.lot_id, 'received_on', lt.received_on, 'expiry_on', lt.expiry_on,
        'qty', (-m.qty)::text, 'cost', jsonb_build_object('money', jsonb_build_object('value', (-m.value)::text))) order by l.line_no, m.seq), '[]'::jsonb)
      from public.stock_moves m
      join public.stock_lots lt on lt.org_id = m.org_id and lt.id = m.lot_id
      join public.sales_lines l on l.org_id = m.org_id and l.id = m.doc_line_id
      where m.org_id = x.org_id and m.doc_kind = 'sale' and m.doc_id = x.id and m.reverses_move_id is null),
    'invoice_entry_id', x.invoice_entry_id, 'payment_entry_id', coalesce(x.payment_entry_id, g.first_entry), 'cash_move_id', coalesce(x.cash_move_id, g.first_move),
    'payment_reversed', g.refunded) || private.sale_more(x.id);
  return private.sale_view(v_result);
end
$$;

-- المبيعات بفترة (من ← إلى): الفواتير الأحدث أوّلاً (1,000 حدّاً، والمجاميع على الفترة كلّها) بنطاق المخزن، والملغاة بحالتها خارج المجاميع. المفاتيح
-- القديمة: المادّة الأولى وكميتها وسعرها، والمبلغ والكلفة للفاتورة، والنقد = المدفوع الآن والدين = الباقي (مراجعة 0021 L4)؛ والجديدة: عدد السطور
-- والصافي والمدفوع والدين والخصم والنقديّ؛ وفواتير الطيور مفتاحاً (الجسم الأخير من 0029، ومعه 0033). مراجعة 0033: لكلّ صفّ open (المتبقّي من قيد
-- الفاتورة بعد كلّ ما وُزّع عليه، والتحصيل اللاحق منه؛ صفر للملغاة وبلا قيد) وcan_void (فحوص void_sale)، والملغاة بلا دين؛ وtotals.open للمرحَّلة.
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
    select s.id, s.doc_no, s.sold_on, s.status, s.party_id, p.name as party_name, s.warehouse_id, w.name as warehouse_name, s.posted_at,
      s.total, s.discount_total, s.walk_in, f.item_id, f.item_name, f.qty, f.base_unit, f.unit_price, k.lines, k.items, k.cost, g.paid, g.refunded,
      case when s.status = 'void' then 0 else coalesce(private.entry_remaining(s.invoice_entry_id), 0) end as open
    from public.sales_invoices s
    join public.parties p on p.org_id = s.org_id and p.id = s.party_id
    join public.warehouses w on w.org_id = s.org_id and w.id = s.warehouse_id
    cross join lateral (
      select l.item_id, i.name as item_name, l.qty, l.base_unit, l.unit_price from public.sales_lines l
      join public.items i on i.org_id = l.org_id and i.id = l.item_id
      where l.org_id = s.org_id and l.sale_id = s.id order by l.line_no limit 1
    ) as f
    cross join lateral (
      select count(*)::int as lines, count(distinct l.item_id)::int as items, coalesce(sum(c.cost), 0) as cost from public.sales_lines l
      left join public.sales_line_costs c on c.org_id = l.org_id and c.line_id = l.id
      where l.org_id = s.org_id and l.sale_id = s.id
    ) as k
    cross join lateral private.sale_paid(s.id) as g
    where s.org_id = v_org and s.sold_on between p_from and p_to and public.in_scope_wh(s.warehouse_id)
  ), ordered as (
    select r.*, row_number() over (order by r.sold_on desc, r.posted_at desc, r.id desc) as n from listed r
  )
  select jsonb_build_object('from', p_from, 'to', p_to, 'today', public.app_today(), 'can_record', public.can('sale.record'), 'can_void', public.can('void'),
    'rows', coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'doc_no', o.doc_no, 'sold_on', o.sold_on, 'status', o.status,
        'payment', case when o.paid = o.total and o.total > 0 then 'cash' else 'credit' end, 'payment_refunded', o.refunded,
        'party_id', o.party_id, 'party_name', o.party_name, 'warehouse_id', o.warehouse_id, 'warehouse_name', o.warehouse_name,
        'item_id', o.item_id, 'item_name', o.item_name, 'qty', o.qty::text, 'base_unit', o.base_unit, 'free', o.total = 0,
        'money', jsonb_build_object('unit_price', o.unit_price::text, 'line_total', o.total::text),
        'cost', jsonb_build_object('money', jsonb_build_object('cost', o.cost::text, 'profit', (o.total - o.cost)::text)),
        'lines_count', o.lines, 'items_count', o.items, 'first_item_name', o.item_name, 'walk_in', o.walk_in, 'total', o.total::text, 'paid', o.paid::text,
        'debt', case when o.status = 'void' then 0 else o.total - o.paid end::text, 'discount_total', o.discount_total::text, 'open', o.open::text,
        'can_void', private.sale_void_block(o.id) is null)
      order by o.n) filter (where o.n <= 1000), '[]'::jsonb),
    'more', count(*) > 1000,
    'totals', jsonb_build_object('count', (count(*) filter (where o.status = 'posted'))::int, 'voided', (count(*) filter (where o.status = 'void'))::int,
      'money', jsonb_build_object('revenue', coalesce(sum(o.total) filter (where o.status = 'posted'), 0)::text,
        'cash', coalesce(sum(o.paid) filter (where o.status = 'posted'), 0)::text,
        'credit', coalesce(sum(o.total - o.paid) filter (where o.status = 'posted'), 0)::text),
      'cost', jsonb_build_object('money', jsonb_build_object('cost', coalesce(sum(o.cost) filter (where o.status = 'posted'), 0)::text,
        'profit', coalesce(sum(o.total - o.cost) filter (where o.status = 'posted'), 0)::text)),
      'total', coalesce(sum(o.total) filter (where o.status = 'posted'), 0)::text,
      'paid', coalesce(sum(o.paid) filter (where o.status = 'posted'), 0)::text,
      'debt', coalesce(sum(o.total - o.paid) filter (where o.status = 'posted'), 0)::text,
      'discount_total', coalesce(sum(o.discount_total) filter (where o.status = 'posted'), 0)::text,
      'open', coalesce(sum(o.open) filter (where o.status = 'posted'), 0)::text))
  into v_result
  from ordered o;
  -- 0028: فواتير الطيور مفتاحاً جديداً (القديمة بشكلها ومعناها، D11).
  v_result := v_result || jsonb_build_object('birds', private.bird_sales_overview(p_from, p_to));
  return private.sale_view(v_result);
end
$$;

-- تقرير المبيعات بفترة مجمَّعاً بالجهة أو المادّة أو اليوم (المرحَّل وحده): بصافي السطور (الخصم داخله)، والعدد فواتير لا سطور، والكمية بوحدتها
-- للمادّة وحدها، والكلفة والربح لأدوار الكلفة؛ وفواتير الطيور مفتاحاً (الجسم الأخير من 0029، ومعه 0033).
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
    select s.id as sale_id, case p_group when 'party' then s.party_id::text when 'item' then l.item_id::text else s.sold_on::text end as key,
      case p_group when 'party' then p.name when 'item' then i.name else to_char(s.sold_on, 'DD/MM/YYYY') end as label,
      l.item_id, l.base_unit, l.qty, l.line_total, c.cost, s.sold_on
    from public.sales_invoices s
    join public.sales_lines l on l.org_id = s.org_id and l.sale_id = s.id
    join public.sales_line_costs c on c.org_id = l.org_id and c.line_id = l.id
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    join public.parties p on p.org_id = s.org_id and p.id = s.party_id
    where s.org_id = v_org and s.status = 'posted' and s.sold_on between p_from and p_to and public.in_scope_wh(s.warehouse_id)
  ), grouped as (
    select r.key, min(r.label) as label, count(distinct r.sale_id)::int as count, sum(r.line_total) as revenue, sum(r.cost) as cost,
      case when p_group = 'item' then sum(r.qty) end as qty, case when p_group = 'item' then min(r.base_unit) end as base_unit, max(r.sold_on) as last_on
    from listed r group by r.key
  )
  select jsonb_build_object('from', p_from, 'to', p_to, 'group', p_group,
    'rows', coalesce(jsonb_agg(jsonb_build_object('key', g.key, 'label', g.label, 'count', g.count, 'qty', g.qty::text, 'base_unit', g.base_unit,
        'money', jsonb_build_object('revenue', g.revenue::text),
        'cost', jsonb_build_object('money', jsonb_build_object('cost', g.cost::text, 'profit', (g.revenue - g.cost)::text)))
      order by case when p_group = 'day' then g.key end desc, g.revenue desc, g.label collate "C", g.key), '[]'::jsonb),
    'totals', jsonb_build_object('count', (select count(distinct x.sale_id) from listed x)::int, 'money', jsonb_build_object('revenue', coalesce(sum(g.revenue), 0)::text),
      'cost', jsonb_build_object('money', jsonb_build_object('cost', coalesce(sum(g.cost), 0)::text, 'profit', coalesce(sum(g.revenue - g.cost), 0)::text))))
  into v_result
  from grouped g;
  -- 0028: فواتير الطيور مجمَّعة بالتجميع نفسه مفتاحاً جديداً (بالمادّة: مفتاح واحد «دجاج لحم حيّ»).
  v_result := v_result || jsonb_build_object('birds', private.bird_sales_groups(p_from, p_to, p_group));
  return private.sale_view(v_result);
end
$$;

-- تفصيل القيد: قبض الفاتورة بصندوق ساقه، والفاتورة بسطورها ووحداتها وخصوماتها وسيقانها (الجسم الأخير من 0029، ومعه 0033).
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
    -- 0033: قبض الفاتورة بصندوق ساقه (والفاتورة القديمة ساقها مرآة رأسها)، والزبون النقديّ.
    if e.kind = 'payment' then
      select jsonb_build_object('type', 'sale_payment', 'doc_id', s.id, 'doc_no', s.doc_no,
          'account', (select jsonb_build_object('id', a.id, 'name', a.name) from public.cash_accounts a where a.org_id = v_org
            and a.id = coalesce((select g.cash_account_id from public.sales_payments g where g.org_id = v_org and g.payment_entry_id = e.id), s.cash_account_id)),
          'leg_no', (select g.leg_no from public.sales_payments g where g.org_id = v_org and g.payment_entry_id = e.id), 'walk_in', s.walk_in)
      into v_out
      from public.sales_invoices s where s.org_id = v_org and s.id = e.doc_id;
      return v_out;
    end if;
    -- 0033: السطور بوحداتها وخصوماتها (amount = صافي السطر)، والصافي والخصم والسيقان، والنقديّ والملاحظة؛ والمدفوع وطريقة الدفع الآن كتفصيل الفاتورة
    -- (private.sale_paid: بلا الساق المردودة، مراجعة 0033 A4)، والساق بعلامة ردّها.
    select jsonb_build_object('type', 'sale', 'doc_id', s.id, 'doc_no', s.doc_no, 'status', s.status, 'sold_on', s.sold_on,
        'warehouse', jsonb_build_object('id', w.id, 'name', w.name), 'payment', case when pd.paid = s.total and s.total > 0 then 'cash' else 'credit' end,
        'account', (select jsonb_build_object('id', a.id, 'name', a.name) from public.cash_accounts a where a.org_id = v_org
          and a.id = coalesce(s.cash_account_id, (select g.cash_account_id from public.sales_payments g where g.org_id = v_org and g.sale_id = s.id order by g.leg_no limit 1))),
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object('line_no', l.line_no, 'item_id', l.item_id, 'item_name', i.name, 'qty', l.qty::text,
              'base_unit', l.base_unit, 'unit_price', l.unit_price::text, 'amount', l.line_total::text, 'unit_label', l.unit_label, 'unit_qty', l.unit_qty::text,
              'unit_price_unit', l.unit_price_unit::text, 'gross_total', l.gross_total::text, 'line_discount', l.line_discount::text,
              'invoice_discount_share', l.invoice_discount_share::text)
            order by l.line_no)
          from public.sales_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
          where l.org_id = v_org and l.sale_id = s.id), '[]'::jsonb),
        'total', coalesce((select sum(l.line_total) from public.sales_lines l where l.org_id = v_org and l.sale_id = s.id), 0)::text,
        'discount_total', s.discount_total::text, 'invoice_discount', s.invoice_discount::text, 'paid', pd.paid::text, 'walk_in', s.walk_in, 'note', s.note,
        'payments', coalesce((
          select jsonb_agg(jsonb_build_object('leg_no', g.leg_no, 'account', jsonb_build_object('id', a.id, 'name', a.name), 'amount', g.amount::text,
              'refunded', exists (select 1 from public.party_entries r where r.org_id = g.org_id and r.reverses_entry_id = g.payment_entry_id))
            order by g.leg_no)
          from public.sales_payments g join public.cash_accounts a on a.org_id = g.org_id and a.id = g.cash_account_id
          where g.org_id = v_org and g.sale_id = s.id), '[]'::jsonb))
    into v_out
    from public.sales_invoices s join public.warehouses w on w.org_id = s.org_id and w.id = s.warehouse_id
    cross join lateral private.sale_paid(s.id) as pd
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

-- ─── ز. الثوابت (لمفتاح الخادم وحده؛ صفر مخالفة) ─────────────────────────────────────────────────────────────────────────
create or replace function public.verify_sales() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  -- ١) الشكل لكلّ سطر: مخزن رأسه ووحدة أساس مادّته، والإجماليّ = الكمية × السعر بوحدة السطر مقرَّباً لأقرب دينار، والأساس = الكمية × المعامل، والصافي
  --    = الإجماليّ − الخصمان، وسعر الأساس من سعر الوحدة، ولقطة الوحدة (الأساس بمعامل 1 واسمه، أو وحدة من وحدات المادّة)، وكلفة واحدة. وللفاتورة:
  --    سطر على الأقلّ، والصافي = مجموع السطور، والخصم = خصوم السطور + خصم الفاتورة، وأنصبة خصم الفاتورة = خصمها موزَّعاً بأكبر الباقي بالضبط.
  select 'sale_shape'::text, count(*) from public.sales_invoices s
  cross join lateral (
    select count(*) as n,
      count(*) filter (where l.warehouse_id <> s.warehouse_id or i.id is null or l.base_unit <> i.base_unit
        or l.gross_total <> private._mul_div_round(l.unit_qty, l.unit_price_unit, 1, 0)
        or l.qty <> round(l.unit_qty * l.unit_factor, 3)
        or l.line_total <> l.gross_total - l.line_discount - l.invoice_discount_share
        or l.unit_price <> private._mul_div_round(1, l.unit_price_unit, l.unit_factor, 2)
        or (l.item_unit_id is null and (l.unit_factor <> 1 or l.unit_label <> l.base_unit))
        or (l.item_unit_id is not null and not exists (select 1 from public.item_units u where u.org_id = l.org_id and u.id = l.item_unit_id and u.item_id = l.item_id))
        or (select count(*) from public.sales_line_costs c where c.org_id = l.org_id and c.line_id = l.id and c.sale_id = s.id) <> 1) as bad,
      coalesce(sum(l.line_total), 0) as total, coalesce(sum(l.line_discount), 0) as line_disc, coalesce(sum(l.invoice_discount_share), 0) as shares,
      array_agg(l.invoice_discount_share order by l.line_no) as share_list, array_agg(l.gross_total - l.line_discount order by l.line_no) as weights,
      coalesce(sum(l.gross_total - l.line_discount), 0) as weight_sum, bool_and(l.gross_total - l.line_discount >= 0) as weights_ok
    from public.sales_lines l left join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where l.org_id = s.org_id and l.sale_id = s.id
  ) as k
  where k.n = 0 or k.bad > 0 or k.total <> s.total or k.line_disc + s.invoice_discount <> s.discount_total or k.shares <> s.invoice_discount
    or case when s.invoice_discount = 0 then false
      when not coalesce(k.weights_ok, false) or k.weight_sum < s.invoice_discount then true
      else k.share_list <> private.alloc_lr(s.invoice_discount, k.weights, 0) end
  union all
  -- ٢) الحركات والكلفة: سحب أصليّ من مادّة السطر بكميته بالضبط من مخزنه ويومه (قطعة واحدة على الأقلّ)، وΣ قيمه = كلفة السطر؛ والمرحَّل بلا
  --    عكسية، والملغى كلّ أصلية منه معكوسة.
  select 'sale_moves', count(*) from public.sales_invoices s
  join public.sales_lines l on l.org_id = s.org_id and l.sale_id = s.id
  join public.sales_line_costs c on c.org_id = l.org_id and c.line_id = l.id
  cross join lateral (
    select coalesce(sum(-m.qty), 0) as drawn, coalesce(sum(-m.value), 0) as drawn_value, count(*) as pieces,
      count(*) filter (where m.item_id <> l.item_id or m.warehouse_id <> s.warehouse_id or m.moved_on <> s.sold_on or m.qty >= 0) as foreign_pieces,
      count(*) filter (where exists (select 1 from public.stock_moves r where r.org_id = m.org_id and r.reverses_move_id = m.id)) as reversed
    from public.stock_moves m
    where m.org_id = s.org_id and m.doc_kind = 'sale' and m.doc_id = s.id and m.doc_line_id = l.id and m.reverses_move_id is null
  ) as a
  where a.drawn <> l.qty or a.pieces = 0 or a.foreign_pieces > 0 or a.drawn_value <> c.cost
    or (s.status = 'posted' and a.reversed > 0) or (s.status = 'void' and a.reversed <> a.pieces)
  union all
  -- ٣) القيود والسيقان والصندوق: الفاتورة بصافٍ موجب قيد invoice للجهة بدفترها (الرئيسيّ لوحدة المخزن) بمستند البيع ويومه = الصافي (والصفر بلا قيد)،
  --    والمرحَّل بلا عكس والملغى معكوس؛ وكلّ ساق قيد payment = −مبلغها وحركة party_payment بصندوقها = +مبلغها على قيدها بيوم البيع، ومجموعها =
  --    المدفوع، ومرحَّلة غير مردودة مخصَّصة لفاتورتها بمبلغها، والمردودة بقيدها وحركتها؛ والرأس القديم (صندوق وقيد وحركة) = ساقه الأولى الوحيدة. والنقديّ
  --    على حساب «زبون نقديّ» وحده، وسيقانه مردودة مع إلغائه لا قبله. ورصيد ذلك الحساب صفر بكلّ دفتر، ولا قيد عليه إلّا من فاتورة نقديّة.
  --    مراجعة 0033: قيد الفاتورة وقيد كلّ ساق برقم الفاتورة (A6)؛ والملغاة كلّ ما عكسه إلغاؤها — حركات المخزون، وقيد الفاتورة، وللنقديّة قيود سيقانها
  --    وحركات ردّها — بيوم واحد هو يوم الإلغاء، لا قبل يوم البيع (A5). وسيقان الزبون باسمه تُردّ بيومها من «ألغِ القبض» فخارج ذلك.
  select 'sale_entries', (
    select count(*) from public.sales_invoices s
    left join public.party_entries e on e.org_id = s.org_id and e.id = s.invoice_entry_id
    left join public.parties pt on pt.org_id = s.org_id and pt.id = s.party_id
    cross join lateral (
      select coalesce(sum(g.amount), 0) as legs_sum, count(*) as legs,
        count(*) filter (where pe.id is null or pe.kind <> 'payment' or pe.amount <> -g.amount or pe.party_id <> s.party_id or pe.book_id <> s.book_id
          or pe.doc_kind is distinct from 'sale' or pe.doc_id is distinct from s.id or pe.doc_no is distinct from s.doc_no or pe.on_date <> s.sold_on
          or pe.reverses_entry_id is not null
          or m.id is null or m.kind <> 'party_payment' or m.amount <> g.amount or m.account_id <> g.cash_account_id or m.party_entry_id is distinct from pe.id
          or m.doc_kind is distinct from 'sale' or m.doc_id is distinct from s.id or m.on_date <> s.sold_on or m.reverses_move_id is not null
          or g.warehouse_id <> s.warehouse_id) as bad_legs,
        count(*) filter (where rv.id is not null) as refunded,
        count(*) filter (where rv.id is not null and not exists (select 1 from public.cash_moves mr where mr.org_id = g.org_id and mr.reverses_move_id = g.cash_move_id
          and mr.party_entry_id = rv.id)) as half_refunded,
        count(*) filter (where s.status = 'posted' and rv.id is null and coalesce((select sum(a.amount) from public.party_allocations a
          where a.org_id = s.org_id and a.debit_entry_id = s.invoice_entry_id and a.credit_entry_id = g.payment_entry_id), 0) <> g.amount) as unallocated,
        coalesce(bool_or(g.leg_no = 1 and g.cash_account_id = s.cash_account_id and g.payment_entry_id = s.payment_entry_id and g.cash_move_id = s.cash_move_id), false)
          as mirror
      from public.sales_payments g
      left join public.party_entries pe on pe.org_id = g.org_id and pe.id = g.payment_entry_id
      left join public.cash_moves m on m.org_id = g.org_id and m.id = g.cash_move_id
      left join public.party_entries rv on rv.org_id = g.org_id and rv.reverses_entry_id = g.payment_entry_id
      where g.org_id = s.org_id and g.sale_id = s.id
    ) as k
    cross join lateral (
      select count(distinct z.d) as days, min(z.d) as first_day from (
        select r.moved_on as d from public.stock_moves m join public.stock_moves r on r.org_id = m.org_id and r.reverses_move_id = m.id
        where m.org_id = s.org_id and m.doc_kind = 'sale' and m.doc_id = s.id and m.reverses_move_id is null
        union all
        select r.on_date from public.party_entries r where r.org_id = s.org_id and r.reverses_entry_id = s.invoice_entry_id
        union all
        select r.on_date from public.sales_payments g join public.party_entries r on r.org_id = g.org_id and r.reverses_entry_id = g.payment_entry_id
        where s.walk_in and g.org_id = s.org_id and g.sale_id = s.id
        union all
        select r.on_date from public.sales_payments g join public.cash_moves r on r.org_id = g.org_id and r.reverses_move_id = g.cash_move_id
        where s.walk_in and g.org_id = s.org_id and g.sale_id = s.id
      ) as z
    ) as vd
    where (s.total > 0) <> (e.id is not null)
      or (e.id is not null and (e.kind <> 'invoice' or e.amount <> s.total or e.party_id <> s.party_id or e.book_id <> s.book_id
        or e.doc_kind is distinct from 'sale' or e.doc_id is distinct from s.id or e.doc_no is distinct from s.doc_no or e.on_date <> s.sold_on
        or e.reverses_entry_id is not null))
      or (s.status = 'void' and (vd.days <> 1 or vd.first_day < s.sold_on))
      or (e.id is not null and s.status = 'posted' and exists (select 1 from public.party_entries r where r.org_id = s.org_id and r.reverses_entry_id = e.id))
      or (e.id is not null and s.status = 'void' and not exists (select 1 from public.party_entries r where r.org_id = s.org_id and r.reverses_entry_id = e.id))
      or not exists (select 1 from public.ledger_books b join public.warehouses w on w.org_id = s.org_id and w.id = s.warehouse_id
        where b.org_id = s.org_id and b.id = s.book_id and b.division_id = w.division_id and b.code = 'main')
      or k.legs_sum <> s.paid or k.bad_legs > 0 or k.half_refunded > 0 or k.unallocated > 0
      or (s.payment_entry_id is not null and (k.legs <> 1 or not k.mirror))
      or s.walk_in <> coalesce(pt.system_kind = 'walk_in', false)
      or (s.walk_in and s.status = 'posted' and k.refunded > 0)
      or (s.walk_in and s.status = 'void' and k.refunded <> k.legs)
  ) + (
    select count(*) from (
      select e.org_id, e.party_id, e.book_id from public.party_entries e
      join public.parties pt on pt.org_id = e.org_id and pt.id = e.party_id
      where pt.system_kind = 'walk_in'
      group by e.org_id, e.party_id, e.book_id having sum(e.amount) <> 0
    ) as z
  ) + (
    select count(*) from public.party_entries e
    join public.parties pt on pt.org_id = e.org_id and pt.id = e.party_id
    where pt.system_kind = 'walk_in'
      and not exists (select 1 from public.sales_invoices s where s.org_id = e.org_id and e.doc_kind = 'sale' and s.id = e.doc_id and s.walk_in)
  )
  union all
  -- ٤) لا قيد ولا حركة صندوق ولا حركة مخزون بمستند sale إلا من فاتورة تشير إليها (قيدها أو ساق منها أصلاً، والعكسيات لأصول منها).
  select 'sale_orphans', count(*) from (
    select e.id from public.party_entries e
    where e.doc_kind = 'sale'
      and not exists (select 1 from public.sales_invoices s where s.org_id = e.org_id and s.id = e.doc_id
        and (coalesce(e.reverses_entry_id, e.id) = s.invoice_entry_id
          or exists (select 1 from public.sales_payments g where g.org_id = s.org_id and g.sale_id = s.id and g.payment_entry_id = coalesce(e.reverses_entry_id, e.id))))
    union all
    select m.id from public.cash_moves m
    where m.doc_kind = 'sale'
      and not exists (select 1 from public.sales_payments g where g.org_id = m.org_id and g.sale_id = m.doc_id and g.cash_move_id = coalesce(m.reverses_move_id, m.id))
    union all
    select m.id from public.stock_moves m
    left join public.sales_lines l on l.org_id = m.org_id and l.id = m.doc_line_id and l.sale_id = m.doc_id
    where m.doc_kind = 'sale' and (l.id is null or m.item_id <> l.item_id or m.warehouse_id <> l.warehouse_id)
  ) as v
  union all
  -- ٥) الرقم: بنوع المخزن (العلف FD، والأدوية MD، والباقي MS) وسنة تاريخ البيع، ولكلّ (منشأة، نوع، سنة) الأرقام 1…last_no بلا فجوة ولا تكرار.
  select 'sale_numbers', (
    select count(*) from public.sales_invoices s join public.warehouses w on w.org_id = s.org_id and w.id = s.warehouse_id
    where split_part(s.doc_no, '-', 1) <> private.sale_doc_kind(w.kind) or split_part(s.doc_no, '-', 2) <> to_char(s.sold_on, 'YYYY')
  ) + (
    select count(*) from (
      select s.org_id, split_part(s.doc_no, '-', 1) as kind, split_part(s.doc_no, '-', 2)::int as year, count(*) as items,
        count(distinct split_part(s.doc_no, '-', 3)::int) as distinct_no, min(split_part(s.doc_no, '-', 3)::int) as min_no, max(split_part(s.doc_no, '-', 3)::int) as max_no
      from public.sales_invoices s group by 1, 2, 3
    ) as g
    full join (select * from public.doc_counters where kind in ('FD', 'MD', 'MS')) as c on c.org_id = g.org_id and c.kind = g.kind and c.year = g.year
    where g.org_id is null or c.org_id is null or g.items <> g.distinct_no or g.min_no <> 1 or g.max_no <> c.last_no
  )
$$;

-- ─── ح. الصلاحيات ───────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function private.party_entries_walk_in(), private.json_uuid(jsonb, text), private.json_num(jsonb, text), private.walk_in_party(),
  private.sale_paid(uuid), private.sale_more(uuid), private.sale_v2_content(uuid), private.sale_v2_result(uuid), private.party_not_system(),
  private.parties_system_guard(), private.lock_sale_party(uuid, uuid, boolean), private.sale_void_block(uuid) from public, anon, authenticated;
revoke all on function public.record_sale_v2(uuid, uuid, uuid, uuid, date, jsonb, numeric, jsonb, text), public.sale_catalog(uuid) from public, anon;
grant execute on function public.record_sale_v2(uuid, uuid, uuid, uuid, date, jsonb, numeric, jsonb, text), public.sale_catalog(uuid) to authenticated;
