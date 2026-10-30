-- 0007_stock_core_openings_transfers — دفتر المخزون: الدفعات والحركات والأرصدة، ورصيد الافتتاح، والتحويل والصادر الداخلي،
--   ولوحة المخزون وبطاقة المادّة (خطّة المرحلة 1 WP4؛ FOUNDATION «نموذج البيانات» ٢٨٠–٣٠١ و٤٢٩–٤٤٧، والقواعد 12–15 (٤٧٣–٤٧٧)،
--   و٥١٤–٥٢٦، و٥٤٨، و٥٥٤؛ DECISIONS 2026-10-26 Q4 وQ5 وQ9 وQ13).
-- المشكلة: ماكو دفعات ولا حركات مخزون ولا أرصدة، فلا رصيد افتتاحي للمخازن ولا تحويل بين المخازن ولا لوحة مخزون، وكل حزمة جاية
--   (الصرف والجرد والاستلام والمرتجع) تسحب من دفعات بترتيب FIFO/FEFO وتكتب حركات تُضاف ولا تتعدّل.
-- هنا: stock_lots (fifo_seq من تسلسل واحد والمرآة تنسخه، وorigin_lot_id للجذر، E4–E5) وstock_moves (تُضاف ولا تتعدّل) وstock_balances
--   (صفّ لكل مادّة ومخزن، يتقفل أوّلاً)؛ وopening_docs/opening_lines وtransfers/transfer_lines مسوّدات بكتابة مباشرة بحارس الرأس
--   والسطر (§2.5)؛ ومشغّلات أهلية نوع المادّة بنوع المخزن، وتجميد نوع المادّة والمخزن بعد أوّل حركة، ومنع أرشفة ما بيه رصيد (E35)؛
--   والمساعدات (قفل الأرصدة، والسحب بترتيبه، والحركة، والدفعة والمرآة)؛ ودوالّ الافتتاح والتحويل ومعايناتهما وإلغاؤهما، وطيّ المسوّدة
--   وحذف سطرها (E13، E52)؛ وقراءات الكميات (definer بلا قيم) والقيم (invoker بفحص صريح)؛ وhome_summary بتنبيهات المخزون؛
--   وverify_stock؛ وverify_ledger يزيد مصدر أرقام TR (الفحص 11).
-- انحرافات مكتوبة عن الخطّة (WP4): stock_moves.seq ترتيب الحركة داخل (المادّة، المخزن) مو تسلسلاً عامّاً (درس 0006: الفرق بين رقمين
--   يكشف حركة منشآت ثانية)، وfifo_seq ما يطلع للواجهة (مؤشّر صفحة الدفعات معرّف الدفعة)؛ وstock_lots.source_lot_id (المصدر المباشر
--   للمرآة، للفحص 5)؛ والحركة بلا posted_at/posted_by لأن created_at/created_by نفسهم (مثل 0006)؛ وopening_lines.zero_reason (Q9)؛
--   وتجميد نوع المادّة والمخزن على كل الأدوار (definer يقرأ كل الحركات، فالمدير المحصور بنطاق ما يعبره)؛ وexpiry_not_tracked لانتهاء
--   على مادّة ما تتابعه؛ وhome_summary صار definer بفلتر نطاق صريح (in_scope_book وin_scope_wh)، لأن تنبيهات المخزون من جداول الكلفة.
--   وبعد المراجعة العدائية لـWP4: fifo_seq من عدّاد لكل منشأة (private.stock_fifo_counters) مو تسلسل واحد للكل (E4 حرفياً): أدوار
--   الكلفة تقرأ stock_lots، والفرق بين رقمين متتاليين بتسلسل مشترك يكشف دفعات منشآت ثانية (نفس درس 0006)، والترتيب داخل المنشأة
--   هو هو والمرآة تنسخ رقم أصلها؛ وborn_at_not_chick وborn_at_future لسطر الافتتاح (وقت الفقس للأفراخ بس)؛ وarchived_stores_with_stock
--   لعلامة «مؤرشف وعليه رصيد» بقائمة المخازن (§2.6).
--   وبعد الجولة الثانية (مراجعة مستقلّة بخمس زوايا): post_transfer يأخذ بصمة المعاينة (p_expected_plan، بسرّ بـprivate.plan_secret)
--   ويرفض stale_preview لمّا القطع تتغيّر بعد المعاينة (FOUNDATION ٥٢٠ البند 5)؛ وverify_stock زاد ثلاثة فحوص يمسكون اللي الثمانية
--   ما يشوفونه (قيمة كل سحب draw_values، وترتيبه draw_order، والمستند = حركاته doc_moves)؛ والدفعات تتقفل for no key update مو
--   for update (مرآة تحويل ثاني تأخذ key share على جذرها، فتحويلان بلا رصيد مشترك كانوا يقفلون بعض)؛ وتاريخ المستند ينقارن بعد
--   قفله (§2.3)؛ وحذف سطر المسوّدة يقفل السطر قبل رأسه؛ ومؤشّر اللوحة والقيم (الاسم المطبَّع، المعرّف) كما وصل بدل معرّف المادّة؛
--   ورأس التحويل وسطره بمعرّف يولد بالجهاز (FOUNDATION ١٩٩) حتى رفع مسوّدة الجهاز ينعاد بلا تكرار؛ وكل سحب أصلي يسجّل علامة
--   الانتهاء وقته (stock_moves.expiry_checked) فالفحصان 6 و10 ما ينقلبون لمّا المدير يطفّي متابعة الانتهاء ويشغّلها؛ وتلميح أرشفة
--   المادّة ما يسمّي مخزناً برّا نطاق الداخل.
-- تراجع: rollback_0007.sql — يرجّع جسمي home_summary وverify_ledger كما بـ0006، ويشيل الجداول الجديدة ودوالّها ومشغّلَي المادّة
--   والمخزن وسياسة نطاق المخزون على سجلّ التدقيق وعدّاد ترتيب الدفعات؛ ويرفض بصوت إذا أي مستند افتتاح أو تحويل موجود (ولو مسوّدة)،
--   بلا ما يحذف شي.
-- تنعاد بأمان: if not exists، create or replace، وكتل do تفحص الكتالوج قبل القيود والسياسات.

set lock_timeout = '5s';

-- ─── ترتيب الدفعات (E4): عدّاد لكل منشأة لكل الدفعات الجديدة، والمرآة تنسخ رقم أصلها، والزيادة بالجرد رقم جديد ─────────────
-- لكل منشأة لحالها (مو تسلسل مشترك): الفرق بين رقمين عند منشأة ما يحسب دفعات غيرها. يزيد تحت قفل صفّه (upsert ... returning) بعد
-- الأرصدة والدفعات (§2.3) وقبل عدّاد المستندات، والتراجع يرجّعه ويّا المعاملة (بلا فجوة). جدول أسرار بـprivate مثل 0003.
create table if not exists private.stock_fifo_counters (
  org_id uuid primary key references public.orgs (id),
  -- يكتبه new_lot بس (يبدأ 1 ويزيد واحداً)، فبلا قيد check (ما يوصل خطأه لشاشة).
  last_seq bigint not null
);
alter table private.stock_fifo_counters enable row level security;
revoke all on table private.stock_fifo_counters from public, anon, authenticated;

-- ─── سرّ بصمة خطّة السحب (FOUNDATION ٥٢٠ البند 5، ٧٧٠): صفّ واحد بـprivate يولد بالهجرة وما يطلع ───────────────────────
-- البصمة md5(السرّ:الخطّة)، والخطّة بيها قيم القطع: بلا سرّ الأمين (بلا كلفة) يقدر يجرّب القيم على البصمة لحد ما يلكاها.
-- صفّ وحده (id = true) تكتبه الهجرة بس، فبلا قيد check (ما يوصل خطأه لشاشة، مثل stock_fifo_counters).
create table if not exists private.plan_secret (
  id boolean primary key default true,
  secret text not null default (gen_random_uuid()::text || gen_random_uuid()::text)
);
alter table private.plan_secret enable row level security;
revoke all on table private.plan_secret from public, anon, authenticated;
insert into private.plan_secret (id) values (true) on conflict (id) do nothing;

-- ─── الدفعات (FOUNDATION ٢٨٧–٢٩٣): كل دخول مخزون دفعة، والمتبقّي ينسحب منها بترتيب السحب (القاعدة 12) ──────────────────────
-- origin_lot_id = الجذر (مرآة المرآة تنسخ الجذر، E5)، وsource_lot_id = المصدر المباشر للمرآة. الكمية والقيمة غير سالبة، والدفعة
-- اللي خلصت ما يبقى بيها فلس (القاعدة 13). source_flock_id يجي بالمرحلة 4.
create table if not exists public.stock_lots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  item_id uuid not null,
  warehouse_id uuid not null,
  origin_lot_id uuid,
  source_lot_id uuid,
  fifo_seq bigint not null,
  received_on date not null,
  expiry_on date,
  born_at timestamptz,
  qty_in numeric not null,
  value_in numeric not null,
  qty_left numeric not null,
  value_left numeric not null,
  source_kind text not null,
  source_id uuid not null,
  source_line_id uuid,
  supplier_lot_no text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint stock_lots_qty_in_check check (abs(qty_in) < 'Infinity' and qty_in > 0 and qty_in = round(qty_in, 3)),
  constraint stock_lots_value_in_check check (abs(value_in) < 'Infinity' and value_in >= 0 and value_in = round(value_in, 2)),
  constraint stock_lots_qty_left_check check (abs(qty_left) < 'Infinity' and qty_left >= 0 and qty_left = round(qty_left, 3) and qty_left <= qty_in),
  constraint stock_lots_value_left_check check (abs(value_left) < 'Infinity' and value_left >= 0 and value_left = round(value_left, 2) and (qty_left > 0 or value_left = 0)),
  constraint stock_lots_source_kind_check check (source_kind in ('opening', 'receipt', 'transfer', 'count_gain')),
  constraint stock_lots_mirror_check check ((source_kind = 'transfer') = (source_lot_id is not null) and (source_lot_id is null) = (origin_lot_id is null)),
  constraint stock_lots_supplier_lot_no_check check (supplier_lot_no is null or length(btrim(supplier_lot_no)) between 1 and 60),
  unique (org_id, id),
  unique (org_id, item_id, id),
  foreign key (org_id, item_id) references public.items (org_id, id),
  foreign key (org_id, warehouse_id) references public.warehouses (org_id, id),
  foreign key (org_id, item_id, origin_lot_id) references public.stock_lots (org_id, item_id, id),
  foreign key (org_id, item_id, source_lot_id) references public.stock_lots (org_id, item_id, id)
);
-- ترتيب السحب (القاعدة 12) للدفعات اللي بيها متبقٍّ، وفهارس المفاتيح الأجنبية كاملة (بلا شرط).
create index if not exists stock_lots_draw on public.stock_lots (org_id, item_id, warehouse_id, expiry_on, fifo_seq, id) where qty_left > 0;
create index if not exists stock_lots_item_wh on public.stock_lots (org_id, item_id, warehouse_id);
create index if not exists stock_lots_warehouse on public.stock_lots (org_id, warehouse_id);
create index if not exists stock_lots_origin on public.stock_lots (org_id, item_id, origin_lot_id);
create index if not exists stock_lots_source_lot on public.stock_lots (org_id, item_id, source_lot_id);
create index if not exists stock_lots_source on public.stock_lots (org_id, source_kind, source_id);

-- ─── الحركات (FOUNDATION ٢٩٤–٢٩٦): موقّعة، بالدفعة، وتُضاف ولا تتعدّل؛ الغلط بحركة عكسية بنفس الدفعة ─────────────────────────
-- seq ترتيب الحركة داخل (المادّة، المخزن) يكتبه مشغّل تحت قفل الرصيد (lock_balances)، والفهرس الفريد يمسك أي كاتب بلاه.
-- receipt_revalue (WP7) بكمية صفر وقيمة غير صفر؛ والقيمة بإشارة الكمية أو صفر.
create table if not exists public.stock_moves (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  seq bigint not null,
  doc_kind text not null,
  doc_id uuid not null,
  doc_line_id uuid,
  item_id uuid not null,
  warehouse_id uuid not null,
  lot_id uuid not null,
  qty numeric not null,
  value numeric not null,
  moved_on date not null,
  reverses_move_id uuid,
  -- السحب الأصلي يسجّل إذا قاعدة الانتهاء انطبقت عليه وقتها (المادّة تتابعه، وما سحبها بإذن): متابعة الانتهاء تتغيّر بعد الرصيد
  -- (0005)، فالفحصان 6 و10 بـverify_stock يحكمون كل سحب بقاعدة يومه، مو بعلامة المادّة اليوم. غيره فارغ.
  expiry_checked boolean,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint stock_moves_qty_check check (abs(qty) < 'Infinity' and qty = round(qty, 3) and (qty <> 0 or doc_kind = 'receipt_revalue')),
  constraint stock_moves_value_check check (abs(value) < 'Infinity' and value = round(value, 2) and (qty = 0 or sign(value) <> -sign(qty)) and (qty <> 0 or value <> 0)),
  constraint stock_moves_doc_kind_check check (doc_kind in ('opening', 'receipt', 'supplier_return', 'receipt_revalue', 'transfer', 'count', 'stock_use')),
  unique (org_id, id),
  unique (org_id, item_id, warehouse_id, seq),
  unique (org_id, reverses_move_id),
  foreign key (org_id, lot_id) references public.stock_lots (org_id, id),
  foreign key (org_id, warehouse_id) references public.warehouses (org_id, id),
  foreign key (org_id, reverses_move_id) references public.stock_moves (org_id, id)
);
create index if not exists stock_moves_lot on public.stock_moves (org_id, lot_id);
create index if not exists stock_moves_doc on public.stock_moves (org_id, doc_kind, doc_id);
create index if not exists stock_moves_warehouse on public.stock_moves (org_id, warehouse_id);

-- ─── الأرصدة (FOUNDATION ٢٩٧، DECISIONS ٨٤): صفّ لكل (مادّة، مخزن)، ينشأ ويتقفل أوّلاً بكل سحب وإضافة ─────────────────────
create table if not exists public.stock_balances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  item_id uuid not null,
  warehouse_id uuid not null,
  qty numeric not null default 0,
  value numeric not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint stock_balances_qty_check check (abs(qty) < 'Infinity' and qty >= 0 and qty = round(qty, 3)),
  constraint stock_balances_value_check check (abs(value) < 'Infinity' and value >= 0 and value = round(value, 2) and (qty > 0 or value = 0)),
  unique (org_id, id),
  unique (org_id, item_id, warehouse_id),
  foreign key (org_id, item_id) references public.items (org_id, id),
  foreign key (org_id, warehouse_id) references public.warehouses (org_id, id)
);
create index if not exists stock_balances_warehouse on public.stock_balances (org_id, warehouse_id);

-- ─── رصيد الافتتاح (FOUNDATION ٢٩٨–٢٩٩، ٥٤٨): مسوّدة بمخزنها وتاريخها، وسطورها لأدوار الكلفة كلها ─────────────────────────
-- الحالة draft ← posted ← void (الإلغاء)، أو draft ← void (الطيّ بلا حركات، E13). بلا رقم (E12).
create table if not exists public.opening_docs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  warehouse_id uuid not null,
  on_date date not null,
  status text not null default 'draft',
  version int not null default 1,
  client_ref uuid,
  note text,
  posted_at timestamptz,
  posted_by uuid,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint opening_docs_status_check check (status in ('draft', 'posted', 'void')),
  constraint opening_docs_lifecycle_check check ((status = 'draft' and posted_at is null and voided_at is null)
    or (status = 'posted' and posted_at is not null and voided_at is null) or (status = 'void' and voided_at is not null)),
  constraint opening_docs_version_check check (version >= 1),
  constraint opening_docs_note_check check (note is null or length(btrim(note)) between 1 and 500),
  constraint opening_docs_void_reason_check check (void_reason is null or length(btrim(void_reason)) between 1 and 500),
  unique (org_id, id),
  unique (org_id, id, warehouse_id),
  foreign key (org_id, warehouse_id) references public.warehouses (org_id, id)
);
create index if not exists opening_docs_warehouse on public.opening_docs (org_id, warehouse_id);

-- سطر الافتتاح: الكمية بوحدة الأساس والقيمة كما يكتبها المدير؛ القيمة الفارغة ترفض بالترحيل، والصفر يحتاج سبباً (Q9). مخزن
-- الرأس ينسخ على السطر (E6) بمفتاح مركّب، فسياسة السطر تفحص نطاقه بعمود صفّه نفسه.
create table if not exists public.opening_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  doc_id uuid not null,
  warehouse_id uuid not null,
  line_no int not null,
  item_id uuid not null,
  qty_base numeric not null,
  value numeric,
  zero_reason text,
  expiry_on date,
  born_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint opening_lines_qty_check check (abs(qty_base) < 'Infinity' and qty_base > 0 and qty_base = round(qty_base, 3)),
  constraint opening_lines_value_check check (abs(value) < 'Infinity' and value >= 0 and value = round(value, 2)),
  constraint opening_lines_zero_reason_check check (zero_reason is null or length(btrim(zero_reason)) between 1 and 500),
  constraint opening_lines_line_no_check check (line_no >= 1),
  unique (org_id, id),
  unique (org_id, doc_id, line_no),
  foreign key (org_id, doc_id, warehouse_id) references public.opening_docs (org_id, id, warehouse_id),
  foreign key (org_id, item_id) references public.items (org_id, id)
);
create index if not exists opening_lines_doc on public.opening_lines (org_id, doc_id, warehouse_id);
create index if not exists opening_lines_item on public.opening_lines (org_id, item_id);

-- ─── التحويل (FOUNDATION ٣٠٠–٣٠١، ٥٥٤): من مخزن لمخزن، وبين وحدتين صادر داخلي بالكلفة؛ رقمه TR عند الترحيل بس ──────────────
create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  doc_no text,
  from_warehouse_id uuid not null,
  to_warehouse_id uuid not null,
  moved_on date not null,
  status text not null default 'draft',
  version int not null default 1,
  client_ref uuid,
  note text,
  posted_at timestamptz,
  posted_by uuid,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint transfers_status_check check (status in ('draft', 'posted', 'void')),
  constraint transfers_lifecycle_check check ((status = 'draft' and posted_at is null and voided_at is null)
    or (status = 'posted' and posted_at is not null and voided_at is null) or (status = 'void' and voided_at is not null)),
  constraint transfers_numbered_check check ((doc_no is null) = (posted_at is null)),
  constraint transfers_doc_no_check check (doc_no is null or doc_no ~ '^TR-[0-9]{4}-[0-9]{4,}$'),
  constraint transfers_version_check check (version >= 1),
  constraint transfers_same_warehouse_check check (from_warehouse_id <> to_warehouse_id),
  constraint transfers_note_check check (note is null or length(btrim(note)) between 1 and 500),
  constraint transfers_void_reason_check check (void_reason is null or length(btrim(void_reason)) between 1 and 500),
  unique (org_id, id),
  unique (org_id, id, from_warehouse_id, to_warehouse_id),
  unique (org_id, doc_no),
  foreign key (org_id, from_warehouse_id) references public.warehouses (org_id, id),
  foreign key (org_id, to_warehouse_id) references public.warehouses (org_id, id)
);
create index if not exists transfers_from on public.transfers (org_id, from_warehouse_id);
create index if not exists transfers_to on public.transfers (org_id, to_warehouse_id);

-- سطر التحويل بلا قيم (الأمين يقراه): لقطة الوحدة (E7) يكتبها المشغّل من وحدة المادّة أو من جدول الوحدات، والكمية بوحدة الأساس
-- round3(الكمية × المعامل)، ومخزنا الرأس منسوخان (E6).
create table if not exists public.transfer_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  doc_id uuid not null,
  from_warehouse_id uuid not null,
  to_warehouse_id uuid not null,
  line_no int not null,
  item_id uuid not null,
  item_unit_id uuid,
  unit_code text,
  unit_label text not null,
  qty_in_unit numeric not null,
  factor numeric not null,
  qty_base numeric not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint transfer_lines_qty_in_unit_check check (abs(qty_in_unit) < 'Infinity' and qty_in_unit > 0 and qty_in_unit = round(qty_in_unit, 3)),
  constraint transfer_lines_factor_check check (abs(factor) < 'Infinity' and factor > 0 and factor = round(factor, 6)),
  constraint transfer_lines_qty_base_check check (abs(qty_base) < 'Infinity' and qty_base > 0 and qty_base = round(qty_base, 3)),
  constraint transfer_lines_unit_check check (item_unit_id is null or unit_code is null),
  constraint transfer_lines_unit_label_check check (length(btrim(unit_label)) between 1 and 40),
  constraint transfer_lines_line_no_check check (line_no >= 1),
  unique (org_id, id),
  unique (org_id, doc_id, line_no),
  foreign key (org_id, doc_id, from_warehouse_id, to_warehouse_id) references public.transfers (org_id, id, from_warehouse_id, to_warehouse_id),
  foreign key (org_id, item_id) references public.items (org_id, id),
  foreign key (org_id, item_unit_id) references public.item_units (org_id, id)
);
create index if not exists transfer_lines_doc on public.transfer_lines (org_id, doc_id, from_warehouse_id, to_warehouse_id);
create index if not exists transfer_lines_item on public.transfer_lines (org_id, item_id);
create index if not exists transfer_lines_unit on public.transfer_lines (org_id, item_unit_id);

-- ─── أهلية نوع المادّة بنوع المخزن (FOUNDATION ٢٨٠–٢٨٣؛ مرآتها itemAdmissible بـsrc/domain/stores.ts) ───────────────────
create or replace function private.item_admissible(p_wh_kind text, p_item_kind text) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select coalesce(case p_wh_kind
    when 'raw' then p_item_kind in ('raw', 'additive', 'packaging', 'fuel')
    when 'feed' then p_item_kind = 'feed'
    when 'medicine' then p_item_kind in ('medicine', 'vaccine')
    when 'general' then p_item_kind in ('fuel', 'packaging', 'equipment', 'other')
    when 'hatching_egg' then p_item_kind = 'hatching_egg'
    when 'chick' then p_item_kind = 'chick'
    when 'table_egg' then p_item_kind in ('table_egg', 'packaging')
    when 'farm' then p_item_kind in ('feed', 'medicine', 'vaccine', 'fuel', 'packaging', 'equipment', 'other')
  end, false)
$$;

-- المخازن اللي تستلم نوع المادّة من المورّد (FOUNDATION ٢٨٤–٢٨٦، E22): الحدّ الأدنى ينقارن بمجموع المتاح بيها بالمنشأة، والتنبيه
-- بلوحاتها وبطاقات وحداتها. الوقود بمخازن المعمل والحقول ما ينحسب (يوصلها بالتحويل)، والتعبئة بالمواد الأوّلية والعامّة.
create or replace function private.receiving_kinds(p_item_kind text) returns text[]
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case p_item_kind
    when 'raw' then array['raw']
    when 'additive' then array['raw']
    when 'feed' then array['feed']
    when 'medicine' then array['medicine']
    when 'vaccine' then array['medicine']
    when 'hatching_egg' then array['hatching_egg']
    when 'chick' then array['chick']
    when 'fuel' then array['general']
    when 'equipment' then array['general']
    when 'other' then array['general']
    when 'packaging' then array['raw', 'general']
    else '{}'::text[]
  end
$$;

-- الدفعة منتهية بيوم: المادّة تتابع الانتهاء (القاعدة 14) والدفعة بتاريخ قبل اليوم. صريحة بلا NULL: متابعة الانتهاء تتغيّر بعد
-- الرصيد (0005)، فدفعة بلا تاريخ لمادّة صارت تتابعه مو منتهية ومتاحة (ينسحب منها draw)، و(يتابع و NULL < يوم) كانت تطلع NULL
-- فتنشال الدفعة من المتاح والمنتهي سوا. كل قراءة تفصل المتاح عن المنتهي من هنا.
create or replace function private.lot_expired(p_tracks boolean, p_expiry date, p_day date) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select coalesce(p_tracks, false) and p_expiry is not null and p_day is not null and p_expiry < p_day
$$;

-- الكمية بالتلميح بأرقام غربية وفواصل آلاف واسمها بالفصحى (مرآة fmtQty المختصرة): «750 كغم»، «لتر واحد»، «لتران»، «5 لترات»،
-- «15 لتراً»، «قطعتان»، «6 قطع». بلا قيم أبداً (التلميح يوصل لكل دور، R6).
create or replace function private.qty_text(p_qty numeric, p_unit text) returns text
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare
  v_num text := rtrim(to_char(abs(p_qty), 'FM999,999,999,999,990.999'), '.');
  v_whole boolean := p_qty = trunc(p_qty);
  v_tail int := mod(trunc(abs(p_qty)), 100)::int;
begin
  if p_qty is null then
    return '—';
  end if;
  if p_qty < 0 then
    v_num := '-' || v_num;
  end if;
  if p_unit = 'kg' then
    return v_num || ' كغم';
  end if;
  if not v_whole or p_qty < 0 then
    return v_num || case p_unit when 'L' then ' لتر' else ' قطعة' end;
  end if;
  if p_qty = 1 then
    return case p_unit when 'L' then 'لتر واحد' else 'قطعة واحدة' end;
  elsif p_qty = 2 then
    return case p_unit when 'L' then 'لتران' else 'قطعتان' end;
  elsif v_tail between 3 and 10 then
    return v_num || case p_unit when 'L' then ' لترات' else ' قطع' end;
  elsif v_tail between 11 and 99 then
    return v_num || case p_unit when 'L' then ' لتراً' else ' قطعة' end;
  end if;
  return v_num || case p_unit when 'L' then ' لتر' else ' قطعة' end;
end
$$;

-- ─── المشغّلات ────────────────────────────────────────────────────────────────────────────────────────────────
-- الدفعة: نوع المادّة يناسب نوع المخزن، والمرآة جذرها جذر (origin بلا origin) وبنفس fifo_seq والمادّة (المفتاح المركّب).
create or replace function private.stock_lots_check() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_wh public.warehouses;
  v_item public.items;
  o public.stock_lots;
begin
  select * into v_wh from public.warehouses where org_id = new.org_id and id = new.warehouse_id;
  select * into v_item from public.items where org_id = new.org_id and id = new.item_id;
  if not private.item_admissible(v_wh.kind, v_item.kind) then
    raise exception 'item_kind_mismatch' using hint = format('«%s» لا يُخزَّن في «%s»: نوع المادّة لا يناسب نوع المخزن.', v_item.name, v_wh.name);
  end if;
  if new.origin_lot_id is not null then
    select * into o from public.stock_lots where org_id = new.org_id and id = new.origin_lot_id;
    if o.id is null or o.origin_lot_id is not null or o.fifo_seq <> new.fifo_seq then
      raise exception 'mirror_mismatch' using hint = 'دفعة التحويل تشير إلى دفعتها الأصلية وتأخذ ترتيبها نفسه.';
    end if;
  end if;
  return new;
end
$$;

-- الحركة: بدفعة نفس المادّة والمخزن، والمادّة تناسب المخزن، والعكسية بنفس الدفعة ونوع أصلها ومستنده وبكميته وقيمته المعاكستين.
create or replace function private.stock_moves_check() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  l public.stock_lots;
  o public.stock_moves;
begin
  select * into l from public.stock_lots where org_id = new.org_id and id = new.lot_id;
  if l.id is null or l.item_id <> new.item_id or l.warehouse_id <> new.warehouse_id then
    raise exception 'lot_mismatch' using hint = 'الحركة على دفعة من نفس المادّة والمخزن فقط.';
  end if;
  if not private.item_admissible((select w.kind from public.warehouses w where w.org_id = new.org_id and w.id = new.warehouse_id),
      (select i.kind from public.items i where i.org_id = new.org_id and i.id = new.item_id)) then
    raise exception 'item_kind_mismatch' using hint = 'نوع المادّة لا يناسب نوع المخزن.';
  end if;
  if new.reverses_move_id is not null then
    select * into o from public.stock_moves where org_id = new.org_id and id = new.reverses_move_id;
    if o.id is null or o.lot_id <> new.lot_id or o.qty <> -new.qty or o.value <> -new.value or o.reverses_move_id is not null
       or o.doc_kind <> new.doc_kind or o.doc_id <> new.doc_id or o.doc_line_id is distinct from new.doc_line_id then
      raise exception 'reversal_mismatch' using hint = 'الحركة العكسية بنفس الدفعة ومستند أصلها وبكميته وقيمته المعاكستين، ولا تُعكس حركة عكسية.';
    end if;
  end if;
  return new;
end
$$;

-- ترتيب الحركة داخل (المادّة، المخزن): التالي بعد آخر رقم، تحت قفل الرصيد. مشغّل لحاله (مثل 0006).
create or replace function private.stock_moves_seq() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.seq := coalesce((select max(m.seq) from public.stock_moves m
    where m.org_id = new.org_id and m.item_id = new.item_id and m.warehouse_id = new.warehouse_id), 0) + 1;
  return new;
end
$$;

-- المادّة: نوعها ووحدة أساسها ثابتان بعد أوّل حركة (FOUNDATION ٢٧٢، ٤٣٨)، وما تتؤرشف وبيها رصيد بأي مخزن (E35). definer يقرأ
-- كل الحركات والأرصدة (المدير المحصور بنطاق ما يعبر التجميد بحركات برّا نطاقه)، فالتجميد على كل الأدوار.
create or replace function private.items_stock_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_wh text;
begin
  if (new.kind is distinct from old.kind or new.base_unit is distinct from old.base_unit)
     and exists (select 1 from public.stock_moves m where m.org_id = new.org_id and m.item_id = new.id) then
    raise exception 'frozen_column' using hint = format('للمادّة «%s» حركات مخزون، فنوعها ووحدة أساسها ثابتان. إن كانا خاطئين فصفّر رصيدها وأرشفها وأنشئ مادّة جديدة.', old.name);
  end if;
  if new.archived_at is not null and old.archived_at is null then
    -- المخزن يتسمّى إذا بنطاق الداخل بس: المحصور بنطاق ما يعرف من التلميح وين رصيد مادّة بمخزن برّا نطاقه (§2.8، E49).
    select w.name into v_wh from public.stock_balances b join public.warehouses w on w.org_id = b.org_id and w.id = b.warehouse_id
    where b.org_id = new.org_id and b.item_id = new.id and b.qty <> 0 and public.in_scope_wh(w.id)
    order by w.name collate "C" limit 1;
    if v_wh is not null then
      raise exception 'archived_in_use' using hint = format('للمادّة «%s» رصيد في «%s»، فلا تُؤرشف حتى يصير رصيدها صفراً في كل المخازن.', new.name, v_wh);
    end if;
    if exists (select 1 from public.stock_balances b where b.org_id = new.org_id and b.item_id = new.id and b.qty <> 0) then
      raise exception 'archived_in_use' using hint = format('للمادّة «%s» رصيد في مخزن خارج نطاقك، فلا تُؤرشف حتى يصير رصيدها صفراً في كل المخازن.', new.name);
    end if;
  end if;
  return new;
end
$$;

-- المخزن: وحدته ونوعه ثابتان بعد أوّل حركة، وما يتؤرشف وبيه رصيد (E35).
create or replace function private.warehouses_stock_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_item text;
begin
  if (new.kind is distinct from old.kind or new.division_id is distinct from old.division_id)
     and exists (select 1 from public.stock_moves m where m.org_id = new.org_id and m.warehouse_id = new.id) then
    raise exception 'frozen_column' using hint = format('في المخزن «%s» حركات، فنوعه ووحدته ثابتان.', old.name);
  end if;
  if new.archived_at is not null and old.archived_at is null then
    select i.name into v_item from public.stock_balances b join public.items i on i.org_id = b.org_id and i.id = b.item_id
    where b.org_id = new.org_id and b.warehouse_id = new.id and b.qty <> 0
    order by i.name collate "C" limit 1;
    if v_item is not null then
      raise exception 'archived_in_use' using hint = format('في المخزن «%s» رصيد من «%s»، فلا يُؤرشف حتى يصير رصيده صفراً.', new.name, v_item);
    end if;
  end if;
  return new;
end
$$;

-- حارس رأس المسوّدة (§2.5): invoker، يشتغل لـauthenticated بس (دوالّ الترحيل definer تمرّ). المستند الجديد مسوّدة دائماً، والتعديل
-- المباشر بالتاريخ والملاحظة بس (أي عمود ثاني، ومنه الحالة والرقم والنسخة والمرجع والختم والمخزن، يرفض)، والنسخة تزيد وحدها.
create or replace function private.draft_header_guard() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status is distinct from 'draft' or new.version is distinct from 1 or new.posted_at is not null or new.voided_at is not null
       or new.client_ref is not null or new.void_reason is not null or (to_jsonb(new) ->> 'doc_no') is not null then
      raise exception 'not_draft' using hint = 'المستند الجديد مسوّدة دائماً؛ الترحيل والإلغاء من دوالّهما.';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - array['on_date', 'moved_on', 'note']) is distinct from (to_jsonb(old) - array['on_date', 'moved_on', 'note']) then
    raise exception 'frozen_column' using hint = 'يُعدَّل في المسوّدة تاريخها وملاحظتها فقط؛ الحالة والرقم والنسخة والمخزن يكتبها الخادم.';
  end if;
  new.version := old.version + 1;
  return new;
end
$$;

-- حارس سطر الافتتاح (§2.5، definer): الرأس مقفول ومسوّدة، والفعل والنطاق، ومخزن الرأس منسوخ (E6)، ورقم السطر التالي، والنسخة تزيد.
create or replace function private.opening_lines_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d public.opening_docs;
begin
  set local lock_timeout = '5s';
  if tg_op = 'UPDATE' and new.doc_id is distinct from old.doc_id then
    raise exception 'frozen_column' using hint = 'السطر يبقى في مستنده.';
  end if;
  select * into d from public.opening_docs where org_id = new.org_id and id = new.doc_id for update;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'المستند مرحَّل أو ملغى؛ لا تُعدَّل سطوره.';
  end if;
  perform private.require('opening.post');
  if not public.in_scope_wh(d.warehouse_id) then
    raise exception 'out_of_scope' using hint = 'مخزن هذا المستند خارج نطاقك.';
  end if;
  new.warehouse_id := d.warehouse_id;
  if tg_op = 'INSERT' then
    new.line_no := coalesce((select max(l.line_no) from public.opening_lines l where l.org_id = d.org_id and l.doc_id = d.id), 0) + 1;
  else
    new.line_no := old.line_no;
  end if;
  new.zero_reason := nullif(btrim(new.zero_reason), '');
  -- مراتب ثابتة (الكمية 3 والقيمة 2): النصّ العشري على الشبكة بنفس الشكل لكل دفعة وحركة (E3). للمضبوط بس: كمية بأكثر من ثلاث
  -- مراتب أو قيمة بأكثر من مرتبتين تبقى كما هي فيرفضها قيد عمودها (الرفض أحسن من تقريب صامت، §2.7)، مو تتقرّب هنا.
  if new.qty_base = round(new.qty_base, 3) then
    new.qty_base := round(new.qty_base, 3);
  end if;
  if new.value = round(new.value, 2) then
    new.value := round(new.value, 2);
  end if;
  update public.opening_docs set version = version + 1 where org_id = d.org_id and id = d.id;
  return new;
end
$$;

-- حارس سطر التحويل (§2.5، definer): نفسه، ولقطة الوحدة (E7): وحدة المادّة (للمادّة نفسها) أو رمز من جدول الوحدات بنفس أساسها أو
-- وحدة الأساس، والكمية بوحدة الأساس round3 (والمعدود عدد صحيح، pieces_not_whole).
create or replace function private.transfer_lines_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d public.transfers;
  v_base text;
  u public.item_units;
  g public.units;
begin
  set local lock_timeout = '5s';
  if tg_op = 'UPDATE' and new.doc_id is distinct from old.doc_id then
    raise exception 'frozen_column' using hint = 'السطر يبقى في مستنده.';
  end if;
  select * into d from public.transfers where org_id = new.org_id and id = new.doc_id for update;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'المستند مرحَّل أو ملغى؛ لا تُعدَّل سطوره.';
  end if;
  perform private.require('transfer.post');
  if not public.in_scope_wh(d.from_warehouse_id) then
    raise exception 'out_of_scope' using hint = 'المخزن المرسِل خارج نطاقك.';
  end if;
  new.from_warehouse_id := d.from_warehouse_id;
  new.to_warehouse_id := d.to_warehouse_id;
  if tg_op = 'INSERT' then
    new.line_no := coalesce((select max(l.line_no) from public.transfer_lines l where l.org_id = d.org_id and l.doc_id = d.id), 0) + 1;
  else
    new.line_no := old.line_no;
  end if;
  select i.base_unit into v_base from public.items i where i.org_id = d.org_id and i.id = new.item_id;
  if v_base is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if new.qty_in_unit is null or not (abs(new.qty_in_unit) < 'Infinity') or new.qty_in_unit <= 0 then
    raise exception 'qty_not_positive' using hint = 'اكتب كمية أكبر من صفر.';
  end if;
  if new.item_unit_id is not null then
    select * into u from public.item_units where org_id = d.org_id and id = new.item_unit_id;
    if u.id is null or u.item_id <> new.item_id then
      raise exception 'unit_mismatch' using hint = 'وحدة التعبئة المختارة ليست لهذه المادّة. اختر وحدة من وحداتها.';
    end if;
    new.unit_code := null;
    new.unit_label := u.label;
    new.factor := u.factor_to_base;
  elsif new.unit_code is not null then
    select * into g from public.units where code = new.unit_code;
    if g.code is null or g.base <> v_base then
      raise exception 'unit_mismatch' using hint = 'الوحدة لا تناسب وحدة أساس المادّة.';
    end if;
    new.unit_label := g.code;
    new.factor := g.factor;
  else
    new.unit_label := v_base;
    new.factor := 1;
  end if;
  new.qty_base := private.to_base(new.qty_in_unit, new.factor, v_base);
  if new.qty_base <= 0 then
    raise exception 'qty_not_positive' using hint = 'الكمية بوحدة الأساس قُرِّبت إلى صفر. اكتب كمية أكبر.';
  end if;
  update public.transfers set version = version + 1 where org_id = d.org_id and id = d.id;
  return new;
end
$$;

create or replace trigger stock_lots_check before insert on public.stock_lots
  for each row execute function private.stock_lots_check();
create or replace trigger stock_moves_check before insert on public.stock_moves
  for each row execute function private.stock_moves_check();
create or replace trigger stock_moves_seq before insert on public.stock_moves
  for each row execute function private.stock_moves_seq();
create or replace trigger items_stock_guard before update on public.items
  for each row execute function private.items_stock_guard();
create or replace trigger warehouses_stock_guard before update on public.warehouses
  for each row execute function private.warehouses_stock_guard();
create or replace trigger opening_docs_guard before insert or update on public.opening_docs
  for each row execute function private.draft_header_guard();
create or replace trigger transfers_guard before insert or update on public.transfers
  for each row execute function private.draft_header_guard();
create or replace trigger opening_lines_guard before insert or update on public.opening_lines
  for each row execute function private.opening_lines_guard();
create or replace trigger transfer_lines_guard before insert or update on public.transfer_lines
  for each row execute function private.transfer_lines_guard();

do $$
declare
  t text;
begin
  -- دفتر المخزون: تعديل أو حذف أو مسح يرفض لأي دور (FOUNDATION ٤٣٧).
  execute 'create or replace trigger stock_moves_append_only before update or delete on public.stock_moves for each row execute function private.reject_change()';
  execute 'create or replace trigger stock_moves_no_truncate before truncate on public.stock_moves for each statement execute function private.reject_change()';
  foreach t in array array['stock_lots', 'stock_moves', 'stock_balances', 'opening_docs', 'opening_lines', 'transfers', 'transfer_lines'] loop
    execute format('create or replace trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()', 'audit_' || t, t);
  end loop;
end
$$;

-- ─── RLS: المخزون بنطاق المخزن (in_scope_wh)، والقيم لأدوار الكلفة (مقيِّدة، §2.8)، والمسوّدات بكتابة مباشرة (§2.5) ──────────
alter table public.stock_lots enable row level security;
alter table public.stock_moves enable row level security;
alter table public.stock_balances enable row level security;
alter table public.opening_docs enable row level security;
alter table public.opening_lines enable row level security;
alter table public.transfers enable row level security;
alter table public.transfer_lines enable row level security;

do $$
declare
  p record;
  t text;
begin
  for p in
    select * from (values
      ('stock_lots', 'stock_lots_read', 'org_id = (select public.auth_org()) and (select public.in_scope_wh(warehouse_id))'),
      ('stock_moves', 'stock_moves_read', 'org_id = (select public.auth_org()) and (select public.in_scope_wh(warehouse_id))'),
      ('stock_balances', 'stock_balances_read', 'org_id = (select public.auth_org()) and (select public.in_scope_wh(warehouse_id))'),
      ('opening_docs', 'opening_docs_read', 'org_id = (select public.auth_org()) and (select public.in_scope_wh(warehouse_id))'),
      ('opening_lines', 'opening_lines_read', 'org_id = (select public.auth_org()) and (select public.in_scope_wh(warehouse_id))'),
      ('transfers', 'transfers_read', 'org_id = (select public.auth_org()) and ((select public.in_scope_wh(from_warehouse_id)) or (select public.in_scope_wh(to_warehouse_id)))'),
      ('transfer_lines', 'transfer_lines_read', 'org_id = (select public.auth_org()) and ((select public.in_scope_wh(from_warehouse_id)) or (select public.in_scope_wh(to_warehouse_id)))')
    ) as x(tbl, name, cond)
  loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.name) then
      execute format('create policy %I on public.%I for select to authenticated using (%s)', p.name, p.tbl, p.cond);
    end if;
  end loop;
  foreach t in array array['stock_lots', 'stock_moves', 'stock_balances', 'opening_lines'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_cost_only') then
      execute format('create policy %I on public.%I as restrictive for select to authenticated using ((select public.can_see_cost()))', t || '_cost_only', t);
    end if;
  end loop;
  -- الكتابة المباشرة (§2.5): الرأس مسوّدة بنطاق مخزنه (الافتتاح) أو المرسِل (التحويل، Q4)، والسطر بفعله ونطاق مخزن صفّه المنسوخ.
  for p in
    select * from (values
      ('opening_docs', 'opening.post', true, '(select public.in_scope_wh(warehouse_id))'),
      ('opening_lines', 'opening.post', false, '(select public.in_scope_wh(warehouse_id))'),
      ('transfers', 'transfer.post', true, '(select public.in_scope_wh(from_warehouse_id))'),
      ('transfer_lines', 'transfer.post', false, '(select public.in_scope_wh(from_warehouse_id))')
    ) as x(tbl, action, draft, scope)
  loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.tbl || '_insert') then
      execute format('create policy %I on public.%I for insert to authenticated with check (org_id = (select public.auth_org()) and (select public.can(%L))%s and %s)',
        p.tbl || '_insert', p.tbl, p.action, case when p.draft then ' and status = ''draft''' else '' end, p.scope);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.tbl || '_update') then
      execute format('create policy %I on public.%I for update to authenticated using (org_id = (select public.auth_org()) and (select public.can(%L))%s and %s) with check (org_id = (select public.auth_org()) and (select public.can(%L))%s and %s)',
        p.tbl || '_update', p.tbl, p.action, case when p.draft then ' and status = ''draft''' else '' end, p.scope,
        p.action, case when p.draft then ' and status = ''draft''' else '' end, p.scope);
    end if;
  end loop;
  -- سجلّ التدقيق يحمل الصفّ كلّه (E49): الدفعة والحركة والرصيد وسطر الافتتاح (مخزنه وقيمته)، ورأس الافتتاح، والتحويل وسطره
  -- (المخزنان والتاريخ والرقم والكمية)؛ وقراءته لأدوار الكلفة (0001). فالقارئ المحصور بنطاق يقرأ منه صفوف مخازن نطاقه بس، مثل
  -- سياسة قراءة كل جدول نفسه: بمخزن الصفّ، والتحويل بأيّ من مخزنيه (§2.8، قالب audit_log_book_scope بـ0006).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'audit_log_stock_scope') then
    create policy audit_log_stock_scope on public.audit_log as restrictive for select to authenticated
      using (case
        when table_name in ('stock_lots', 'stock_moves', 'stock_balances', 'opening_docs', 'opening_lines')
          then public.in_scope_wh((coalesce("new", "old") ->> 'warehouse_id')::uuid)
        when table_name in ('transfers', 'transfer_lines')
          then public.in_scope_wh((coalesce("new", "old") ->> 'from_warehouse_id')::uuid) or public.in_scope_wh((coalesce("new", "old") ->> 'to_warehouse_id')::uuid)
        else true
      end);
  end if;
end
$$;

revoke all on table public.stock_lots, public.stock_moves, public.stock_balances, public.opening_docs, public.opening_lines, public.transfers,
  public.transfer_lines from anon, authenticated;
grant select on table public.stock_lots, public.stock_moves, public.stock_balances, public.opening_docs, public.opening_lines, public.transfers,
  public.transfer_lines to authenticated;
grant insert (warehouse_id, on_date, note, status) on public.opening_docs to authenticated;
grant update (on_date, note, status) on public.opening_docs to authenticated;
grant insert (doc_id, item_id, qty_base, value, zero_reason, expiry_on, born_at) on public.opening_lines to authenticated;
grant update (item_id, qty_base, value, zero_reason, expiry_on, born_at) on public.opening_lines to authenticated;
-- المعرّف يولد بالجهاز لرأس التحويل وسطره (FOUNDATION ١٩٩): رفع مسوّدة الجهاز يعاد بنفس المعرّفات بعد جواب ضاع، فالمكرّر يرجع
-- 23505 بدل رأس أو سطر ثاني.
grant insert (id, from_warehouse_id, to_warehouse_id, moved_on, note, status) on public.transfers to authenticated;
grant update (moved_on, note, status) on public.transfers to authenticated;
grant insert (id, doc_id, item_id, item_unit_id, unit_code, qty_in_unit) on public.transfer_lines to authenticated;
grant update (item_id, item_unit_id, unit_code, qty_in_unit) on public.transfer_lines to authenticated;
revoke truncate on table public.stock_lots, public.stock_moves, public.stock_balances, public.opening_docs, public.opening_lines, public.transfers,
  public.transfer_lines from service_role;


-- ─── المساعدات (§2.3، القواعد 12–15) ───────────────────────────────────────────────────────────────────────────
-- المخزن بمنشأة الداخل (بلا قفل)، ويرفض إذا مو بنطاقه.
create or replace function private.stock_wh(p_wh uuid, p_scoped boolean) returns public.warehouses
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  w public.warehouses;
begin
  select * into w from public.warehouses where org_id = public.auth_org() and id = p_wh;
  if w.id is null then
    raise exception 'warehouse_not_found' using hint = 'هذا المخزن غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if p_scoped and not public.in_scope_wh(w.id) then
    raise exception 'out_of_scope' using hint = format('المخزن «%s» خارج نطاقك، فلا تسجّل فيه ولا تلغي منه.', w.name);
  end if;
  return w;
end
$$;

-- صفوف المخازن ثم المواد للمشاركة بترتيب المعرّف (§2.3: بعد المستند وقبل الأرصدة): أرشفة بنفس اللحظة تنتظر الترحيل أو الترحيل
-- يشوفها، فما تصير حركة جديدة بمؤرشف ولا يتؤرشف شي وبيه رصيد (E35). الأصل يرفض المؤرشف، والعكسي يمرّ (E43).
create or replace function private.lock_masters(p_whs uuid[], p_items uuid[], p_original boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
begin
  set local lock_timeout = '5s';
  for r in
    select w.id, w.name, w.archived_at from public.warehouses w
    where w.org_id = public.auth_org() and w.id = any (p_whs) order by w.id for share
  loop
    if p_original and r.archived_at is not null then
      raise exception 'warehouse_archived' using hint = format('المخزن «%s» مؤرشف، فلا تُسجَّل فيه حركة جديدة. أعِده من الأرشيف أوّلاً.', r.name);
    end if;
  end loop;
  for r in
    select i.id, i.name, i.archived_at from public.items i
    where i.org_id = public.auth_org() and i.id = any (p_items) order by i.id for share
  loop
    if p_original and r.archived_at is not null then
      raise exception 'item_archived' using hint = format('المادّة «%s» مؤرشفة، فلا تُسجَّل لها حركة جديدة. أعِدها من الأرشيف أوّلاً.', r.name);
    end if;
  end loop;
end
$$;

-- الأرصدة (§2.3 البند 4): كل (مادّة، مخزن) يلمسه المستند، ينشأ إذا ما موجود ويتقفل بترتيب (المادّة، المخزن) قبل أي دفعة. سحبان
-- بنفس اللحظة لنفس المادّة يترتّبون هنا، والثاني يقرأ الدفعات بعد ما الأوّل يثبت (D6).
create or replace function private.lock_balances(p_items uuid[], p_whs uuid[]) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  set local lock_timeout = '5s';
  insert into public.stock_balances (org_id, item_id, warehouse_id)
  select distinct public.auth_org(), x.item_id, x.warehouse_id from unnest(p_items, p_whs) as x(item_id, warehouse_id)
  where x.item_id is not null and x.warehouse_id is not null
  order by 2, 3
  on conflict (org_id, item_id, warehouse_id) do nothing;
  perform 1 from public.stock_balances b
  where b.org_id = public.auth_org()
    and (b.item_id, b.warehouse_id) in (select x.item_id, x.warehouse_id from unnest(p_items, p_whs) as x(item_id, warehouse_id))
  order by b.item_id, b.warehouse_id
  for update;
end
$$;

-- دفعة جديدة برقم ترتيب جديد (E4)، متبقّيها صفر لحد ما تكتب حركتها الأصلية (apply_move).
create or replace function private.new_lot(p_item uuid, p_wh uuid, p_received date, p_expiry date, p_born timestamptz, p_qty numeric, p_value numeric,
  p_source_kind text, p_source uuid, p_source_line uuid) returns public.stock_lots
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  l public.stock_lots;
  v_seq bigint;
begin
  insert into private.stock_fifo_counters (org_id, last_seq) values (public.auth_org(), 1)
  on conflict (org_id) do update set last_seq = private.stock_fifo_counters.last_seq + 1
  returning last_seq into v_seq;
  insert into public.stock_lots (org_id, item_id, warehouse_id, fifo_seq, received_on, expiry_on, born_at, qty_in, value_in, qty_left, value_left,
    source_kind, source_id, source_line_id)
  values (public.auth_org(), p_item, p_wh, v_seq, p_received, p_expiry, p_born, p_qty, p_value, 0, 0,
    p_source_kind, p_source, p_source_line)
  returning * into l;
  return l;
end
$$;

-- مرآة التحويل (القاعدة 15، E5): نفس fifo_seq والانتهاء ووقت الفقس ورقم دفعة المورّد، والجذر من أصلها، والاستلام يوم التحويل.
create or replace function private.mirror_lot(p_src uuid, p_wh uuid, p_qty numeric, p_value numeric, p_on date, p_doc uuid, p_line uuid)
returns public.stock_lots
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.stock_lots;
  l public.stock_lots;
begin
  select * into s from public.stock_lots where org_id = public.auth_org() and id = p_src;
  insert into public.stock_lots (org_id, item_id, warehouse_id, origin_lot_id, source_lot_id, fifo_seq, received_on, expiry_on, born_at,
    qty_in, value_in, qty_left, value_left, source_kind, source_id, source_line_id, supplier_lot_no)
  values (s.org_id, s.item_id, p_wh, coalesce(s.origin_lot_id, s.id), s.id, s.fifo_seq, p_on, s.expiry_on, s.born_at,
    p_qty, p_value, 0, 0, 'transfer', p_doc, p_line, s.supplier_lot_no)
  returning * into l;
  return l;
end
$$;

-- الحركة: تنكتب، والدفعة والرصيد يتحدّثون بنفس كميتها وقيمتها الموقّعتين (الرصيد مقفول من lock_balances).
create or replace function private.apply_move(p_lot uuid, p_doc_kind text, p_doc uuid, p_line uuid, p_qty numeric, p_value numeric, p_on date,
  p_reverses uuid, p_expiry_checked boolean default null) returns public.stock_moves
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  l public.stock_lots;
  m public.stock_moves;
begin
  select * into l from public.stock_lots where org_id = public.auth_org() and id = p_lot;
  insert into public.stock_moves (org_id, doc_kind, doc_id, doc_line_id, item_id, warehouse_id, lot_id, qty, value, moved_on, reverses_move_id, expiry_checked)
  values (l.org_id, p_doc_kind, p_doc, p_line, l.item_id, l.warehouse_id, l.id, p_qty, p_value, p_on, p_reverses, p_expiry_checked)
  returning * into m;
  update public.stock_lots set qty_left = qty_left + p_qty, value_left = value_left + p_value where org_id = l.org_id and id = l.id;
  update public.stock_balances set qty = qty + p_qty, value = value + p_value
  where org_id = l.org_id and item_id = l.item_id and warehouse_id = l.warehouse_id;
  if not found then
    raise exception 'balance_not_locked' using hint = 'تعذّر الترحيل: رصيد المادّة في المخزن غير مقفول. أعد المحاولة.';
  end if;
  return m;
end
$$;

-- الموجود بتاريخ: المتاح (غير منتهٍ، مستلم بالتاريخ أو قبله)، والمنتهي، واللي استُلم بعده. للتلميح والمعاينة (بلا قفل).
create or replace function private.stock_at(p_item uuid, p_wh uuid, p_date date, out available numeric, out expired numeric, out later numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    coalesce(sum(l.qty_left) filter (where l.received_on <= p_date and not private.lot_expired(i.tracks_expiry, l.expiry_on, p_date)), 0),
    coalesce(sum(l.qty_left) filter (where l.received_on <= p_date and private.lot_expired(i.tracks_expiry, l.expiry_on, p_date)), 0),
    coalesce(sum(l.qty_left) filter (where l.received_on > p_date), 0)
  from public.stock_lots l join public.items i on i.org_id = l.org_id and i.id = l.item_id
  where l.org_id = public.auth_org() and l.item_id = p_item and l.warehouse_id = p_wh and l.qty_left > 0
$$;

-- رفض النقص (FOUNDATION ٥٢١، القاعدة 14): يسمّي المادّة والمطلوب والموجود بالتاريخ، والمنتهي لحاله، واللي وصل بعده. كميات بس.
create or replace function private.raise_shortage(p_item uuid, p_wh uuid, p_qty numeric, p_date date) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  i public.items;
  s record;
begin
  select * into i from public.items where org_id = public.auth_org() and id = p_item;
  select * into s from private.stock_at(p_item, p_wh, p_date);
  raise exception 'insufficient_stock' using hint = format('لا يكفي رصيد «%s»: المطلوب %s، وبهذا التاريخ (%s) لم يكن موجوداً إلا %s.%s%s',
    i.name, private.qty_text(p_qty, i.base_unit), to_char(p_date, 'DD/MM/YYYY'), private.qty_text(s.available, i.base_unit),
    case when s.expired > 0 then format(' وفي المخزن %s منتهية الصلاحية لا تُسحب إلا بإتلاف أو مرتجع.', private.qty_text(s.expired, i.base_unit)) else '' end,
    case when s.later > 0 then format(' و%s استُلمت بعد هذا التاريخ.', private.qty_text(s.later, i.base_unit)) else '' end);
end
$$;

-- خطّة السحب بلا كتابة ولا قفل (المعاينة، FOUNDATION ٧٧٠): الدفعات المؤهّلة بالتاريخ (والانتهاء للمادّة اللي تتابعه، أو الدفعة
-- المسمّاة بإذن المنتهي، Q5) بترتيب السحب. p_before كميات سطور قبله من نفس المادّة بنفس المستند بترتيبها: كل سطر سحب لحاله على
-- الدفعات كما صارت بعد اللي قبله، مثل الترحيل سطراً سطراً بالضبط (قطعة وحدة مجموعة تتقرّب مرّة وحدة فتفرق فلساً عن سحبين).
-- القيمة: كل المتبقّي = value_left بالضبط، وإلا _mul_div_round2 (القاعدة 13). مرآتها planDraw.
create or replace function private.draw_plan(p_item uuid, p_wh uuid, p_qty numeric, p_date date, p_lot uuid, p_allow_expired boolean, p_before numeric[])
returns table (lot_id uuid, qty numeric, value numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_tracks boolean;
  v_ids uuid[];
  v_ql numeric[];
  v_vl numeric[];
  v_lots int;
  v_lines int := coalesce(cardinality(p_before), 0);
  v_left numeric;
  v_take numeric;
  v_value numeric;
begin
  select i.tracks_expiry into v_tracks from public.items i where i.org_id = public.auth_org() and i.id = p_item;
  select coalesce(array_agg(x.id order by x.n), '{}'), coalesce(array_agg(x.qty_left order by x.n), '{}'), coalesce(array_agg(x.value_left order by x.n), '{}')
  into v_ids, v_ql, v_vl
  from (
    select l.id, l.qty_left, l.value_left, row_number() over (order by l.expiry_on asc nulls last, l.fifo_seq, l.id) as n
    from public.stock_lots l
    where l.org_id = public.auth_org() and l.item_id = p_item and l.warehouse_id = p_wh and l.qty_left > 0 and l.received_on <= p_date
      and (p_lot is null or l.id = p_lot)
      and (not coalesce(v_tracks, false) or l.expiry_on is null or l.expiry_on >= p_date or (p_lot is not null and coalesce(p_allow_expired, false)))
  ) as x;
  v_lots := coalesce(cardinality(v_ids), 0);
  -- السطور قبله ثم هو (الأخير يرجع قطعه)، كل واحد على المتبقّي بعد اللي قبله.
  for v_line in 1 .. v_lines + 1 loop
    v_left := case when v_line <= v_lines then p_before[v_line] else p_qty end;
    for v_k in 1 .. v_lots loop
      exit when v_left is null or v_left <= 0;
      continue when v_ql[v_k] <= 0;
      v_take := least(v_left, v_ql[v_k]);
      v_value := case when v_take = v_ql[v_k] then v_vl[v_k] else private._mul_div_round2(v_take, v_vl[v_k], v_ql[v_k]) end;
      if v_line > v_lines then
        lot_id := v_ids[v_k];
        qty := v_take;
        value := v_value;
        return next;
      end if;
      -- القطعة تنقص من متبقّي الدفعة وقيمته (مثل apply_move بالترحيل)، والسطر من حاجته.
      v_ql[v_k] := v_ql[v_k] - v_take;
      v_vl[v_k] := v_vl[v_k] - v_value;
      v_left := v_left - v_take;
    end loop;
  end loop;
end
$$;

-- السحب نفسه (القواعد 12–14): الدفعات المؤهّلة بترتيب السحب تتقفل for no key update وهي تنقرأ (§2.3 البند 5، الرصيد مقفول قبلها)،
-- والنقص يرفض insufficient_stock والمستند يبقى مسوّدة. يرجّع القطع؛ الحركات يكتبها المستدعي.
create or replace function private.draw(p_item uuid, p_wh uuid, p_qty numeric, p_date date, p_lot uuid, p_allow_expired boolean)
returns table (lot_id uuid, qty numeric, value numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tracks boolean;
  v_left numeric := p_qty;
  v_take numeric;
  c record;
begin
  set local lock_timeout = '5s';
  if p_qty is null or not (abs(p_qty) < 'Infinity') or p_qty <= 0 then
    raise exception 'qty_not_positive' using hint = 'اكتب كمية أكبر من صفر.';
  end if;
  select i.tracks_expiry into v_tracks from public.items i where i.org_id = public.auth_org() and i.id = p_item;
  for c in
    select l.id, l.qty_left, l.value_left from public.stock_lots l
    where l.org_id = public.auth_org() and l.item_id = p_item and l.warehouse_id = p_wh and l.qty_left > 0 and l.received_on <= p_date
      and (p_lot is null or l.id = p_lot)
      and (not coalesce(v_tracks, false) or l.expiry_on is null or l.expiry_on >= p_date or (p_lot is not null and coalesce(p_allow_expired, false)))
    order by l.expiry_on asc nulls last, l.fifo_seq, l.id
    -- no key update مو update: مرآة تحويل ثاني تأخذ key share على جذرها (المفتاح الأجنبي origin_lot_id) بمخزن غير مخزن هذا السحب،
    -- وupdate يتعارض وياه فتحويلان بلا رصيد مشترك يقفلون بعض (40P01). كاتبا دفعة وحدة يبقون يستبعدون بعض.
    for no key update
  loop
    exit when v_left <= 0;
    v_take := least(v_left, c.qty_left);
    lot_id := c.id;
    qty := v_take;
    value := case when v_take = c.qty_left then c.value_left else private._mul_div_round2(v_take, c.value_left, c.qty_left) end;
    v_left := v_left - v_take;
    return next;
  end loop;
  if v_left > 0 then
    perform private.raise_shortage(p_item, p_wh, p_qty, p_date);
  end if;
end
$$;

-- قطعة بخطّة السحب كنصّ ثابت الشكل (الكمية 3 مراتب والقيمة 2، مهما كان مقياس الرقم المحسوب): «الدفعة:الكمية:القيمة».
create or replace function private.plan_piece(p_lot uuid, p_qty numeric, p_value numeric) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select p_lot::text || ':' || round(p_qty, 3)::text || ':' || round(p_value, 2)::text
$$;

-- بصمة الخطّة (سطوراً بترتيبها، وكل سطر قطعه بترتيب السحب): المعاينة ترجّعها والترحيل يقارنها بقطعه هو (stale_preview).
-- بلا صفّ السرّ (انمسح أو استرجاع فاته private) ترفض بصوت: md5 على NULL يطلع NULL، و`<>` على NULL كان يعدّي أيّ بصمة.
create or replace function private.plan_token(p_plan text) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_secret text;
begin
  select s.secret into v_secret from private.plan_secret s where s.id;
  if v_secret is null then
    raise exception 'plan_secret_missing' using hint = 'تعذّر التحقّق من المعاينة: إعداد الخادم ناقص. أبلغ مدير النظام.';
  end if;
  return md5(v_secret || ':' || coalesce(p_plan, ''));
end
$$;

-- اسم المستند للتلميح والعرض: رقم التحويل، أو «افتتاح بتاريخ …».
create or replace function private.stock_doc_label(p_kind text, p_doc uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case p_kind
    when 'transfer' then coalesce((select t.doc_no from public.transfers t where t.org_id = public.auth_org() and t.id = p_doc), 'تحويل')
    when 'opening' then coalesce((select format('رصيد افتتاح بتاريخ %s', to_char(o.on_date, 'DD/MM/YYYY')) from public.opening_docs o
      where o.org_id = public.auth_org() and o.id = p_doc), 'رصيد افتتاح')
    else p_kind
  end
$$;

-- دفعة انسحب منها (المتبقّي غير الداخل): يرفض lot_consumed ويسمّي آخر مستند سحب منها ما انلغى (الإلغاء من الأحدث، FOUNDATION ٥٩٤).
create or replace function private.check_lot_intact(p_lot uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  l public.stock_lots;
  m public.stock_moves;
  v_item text;
begin
  select * into l from public.stock_lots where org_id = public.auth_org() and id = p_lot;
  if l.qty_left = l.qty_in and l.value_left = l.value_in then
    return;
  end if;
  select * into m from public.stock_moves x
  where x.org_id = l.org_id and x.lot_id = l.id and x.qty < 0 and x.reverses_move_id is null
    and not exists (select 1 from public.stock_moves r where r.org_id = x.org_id and r.reverses_move_id = x.id)
  order by x.seq desc limit 1;
  select i.name into v_item from public.items i where i.org_id = l.org_id and i.id = l.item_id;
  raise exception 'lot_consumed' using hint = format('انسحب من دفعة «%s» بالمستند %s، فلا يُلغى هذا قبل إلغاء ذلك المستند.',
    v_item, coalesce(private.stock_doc_label(m.doc_kind, m.doc_id), 'آخر'));
end
$$;

-- مشكلة تاريخ المستند بلا قفل (للمعاينة): نفس قواعد check_post_date وcheck_opening_date (0006) ونفس رموزها، أوّل مشكلة أو null.
create or replace function private.date_problem(p_date date, p_division uuid, p_opening boolean) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d public.divisions;
  v_today date := public.app_today();
  v_lock date;
begin
  select * into d from public.divisions where org_id = public.auth_org() and id = p_division;
  select l.locked_through into v_lock from public.period_locks l where l.org_id = public.auth_org();
  if p_date is null then
    return jsonb_build_object('code', 'date_required', 'hint', 'اكتب التاريخ.');
  end if;
  if p_date > v_today then
    return jsonb_build_object('code', 'date_in_future', 'hint', format('التاريخ %s بعد تاريخ اليوم %s.', to_char(p_date, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY')));
  end if;
  if not p_opening and p_date < v_today - 7 then
    return jsonb_build_object('code', 'date_too_old', 'hint', format('لا يُقبل تاريخ أقدم من 7 أيام؛ أقدم تاريخ مسموح به %s.', to_char(v_today - 7, 'DD/MM/YYYY')));
  end if;
  if v_lock is not null and p_date <= v_lock then
    return jsonb_build_object('code', 'period_locked', 'hint', format('الحسابات مقفلة حتى %s، فلا يُسجَّل مستند بتاريخ %s.', to_char(v_lock, 'DD/MM/YYYY'), to_char(p_date, 'DD/MM/YYYY')));
  end if;
  if d.go_live_on is null then
    return jsonb_build_object('code', 'no_go_live', 'hint', format('لم يُحدَّد يوم تشغيل «%s» بعد. يحدّده المدير من إعدادات المنشأة.', d.name));
  end if;
  if p_opening and p_date > d.go_live_on then
    return jsonb_build_object('code', 'after_go_live', 'hint', format('الرصيد الافتتاحي لـ«%s» يُسجَّل بيوم تشغيلها %s أو قبله.', d.name, to_char(d.go_live_on, 'DD/MM/YYYY')));
  end if;
  if not p_opening and p_date < d.go_live_on then
    return jsonb_build_object('code', 'before_go_live', 'hint', format('يوم تشغيل «%s» هو %s، والتاريخ %s قبله.', d.name, to_char(d.go_live_on, 'DD/MM/YYYY'), to_char(p_date, 'DD/MM/YYYY')));
  end if;
  return null;
end
$$;

-- للمادّة بالمخزن حركة مرحّلة (FOUNDATION ٥٤٨): الافتتاح بعدها يمرّ من الجرد. افتتاح ملغى بالكامل ما ينحسب (E20).
create or replace function private.item_has_moves(p_item uuid, p_wh uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.stock_moves m
    where m.org_id = public.auth_org() and m.item_id = p_item and m.warehouse_id = p_wh
      and not (m.doc_kind = 'opening' and exists (
        select 1 from public.opening_docs o where o.org_id = m.org_id and o.id = m.doc_id and o.status = 'void'))
  )
$$;


-- مشكلة محسوبة ({code, hint}) ترفض برمزها: المعاينة تعرضها والترحيل يرفض بيها، من نفس الفحص.
create or replace function private.raise_problem(p_problem jsonb) returns void
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare
  v_hint text := p_problem ->> 'hint';
begin
  if p_problem is null then
    return;
  end if;
  case p_problem ->> 'code'
    when 'item_kind_mismatch' then raise exception 'item_kind_mismatch' using hint = coalesce(v_hint, 'نوع المادّة لا يناسب نوع المخزن.');
    when 'egg_flock_required' then raise exception 'egg_flock_required' using hint = coalesce(v_hint, 'بيض المائدة يُفتتح بفوجه في المرحلة 4.');
    when 'value_required' then raise exception 'value_required' using hint = coalesce(v_hint, 'اكتب القيمة؛ الصفر يُقبل مع سببه فقط.');
    when 'pieces_not_whole' then raise exception 'pieces_not_whole' using hint = coalesce(v_hint, 'المعدود يُسجَّل بأعداد صحيحة.');
    when 'expiry_required' then raise exception 'expiry_required' using hint = coalesce(v_hint, 'اكتب تاريخ الانتهاء.');
    when 'expiry_not_tracked' then raise exception 'expiry_not_tracked' using hint = coalesce(v_hint, 'هذه المادّة لا تتابع تاريخ الانتهاء.');
    when 'born_at_required' then raise exception 'born_at_required' using hint = coalesce(v_hint, 'اكتب وقت الفقس.');
    when 'born_at_not_chick' then raise exception 'born_at_not_chick' using hint = coalesce(v_hint, 'وقت الفقس للأفراخ فقط.');
    when 'born_at_future' then raise exception 'born_at_future' using hint = coalesce(v_hint, 'وقت الفقس بعد الآن؛ اكتب وقتاً مضى.');
    when 'item_has_moves' then raise exception 'item_has_moves' using hint = coalesce(v_hint, 'للمادّة حركات مرحّلة في هذا المخزن؛ الفرق يُسجَّل بالجرد.');
    else raise exception 'rejected' using hint = coalesce(v_hint, 'رُفض الطلب.');
  end case;
end
$$;

-- مشكلة سطر افتتاح (FOUNDATION ٥٤٨، Q9، Q13): أوّل رمز أو null. نفس الفحص بالمعاينة وبالترحيل.
create or replace function private.opening_line_problem(p_wh public.warehouses, p_line public.opening_lines) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  i public.items;
begin
  select * into i from public.items where org_id = public.auth_org() and id = p_line.item_id;
  if not private.item_admissible(p_wh.kind, i.kind) then
    return jsonb_build_object('code', 'item_kind_mismatch', 'hint', format('«%s» لا يُخزَّن في «%s»: نوع المادّة لا يناسب نوع المخزن.', i.name, p_wh.name));
  end if;
  if i.kind = 'table_egg' then
    return jsonb_build_object('code', 'egg_flock_required', 'hint', 'بيض المائدة يُفتتح ويُجرد بفوجه، وهذا يأتي مع الأفواج في المرحلة 4.');
  end if;
  if p_line.value is null or (p_line.value = 0 and p_line.zero_reason is null) then
    return jsonb_build_object('code', 'value_required', 'hint', format('اكتب قيمة «%s»؛ الصفر يُقبل مع سببه فقط.', i.name));
  end if;
  if i.base_unit = 'pc' and p_line.qty_base <> trunc(p_line.qty_base) then
    return jsonb_build_object('code', 'pieces_not_whole', 'hint', format('«%s» تُعدّ بالقطعة، والكمية عدد صحيح.', i.name));
  end if;
  if i.tracks_expiry and p_line.expiry_on is null then
    return jsonb_build_object('code', 'expiry_required', 'hint', format('اكتب تاريخ انتهاء «%s».', i.name));
  end if;
  if not i.tracks_expiry and p_line.expiry_on is not null then
    return jsonb_build_object('code', 'expiry_not_tracked', 'hint', format('«%s» لا تتابع تاريخ الانتهاء؛ احذف التاريخ أو فعّل متابعته من بطاقة المادّة.', i.name));
  end if;
  if i.kind = 'chick' and p_line.born_at is null then
    return jsonb_build_object('code', 'born_at_required', 'hint', format('اكتب وقت فقس «%s».', i.name));
  end if;
  -- وقت الفقس للأفراخ بس (E24: عمر الفرخ وتنبيه 48 ساعة)، وما يكون بعد الآن (عمر سالب يأخّر التنبيه).
  if i.kind <> 'chick' and p_line.born_at is not null then
    return jsonb_build_object('code', 'born_at_not_chick', 'hint', format('«%s» ليست أفراخاً، فلا وقت فقس لها؛ احذف وقت الفقس.', i.name));
  end if;
  if p_line.born_at > now() then
    return jsonb_build_object('code', 'born_at_future', 'hint', format('وقت فقس «%s» بعد الآن؛ اكتب وقتاً مضى.', i.name));
  end if;
  if private.item_has_moves(i.id, p_wh.id) then
    return jsonb_build_object('code', 'item_has_moves', 'hint', format('لـ«%s» حركات مرحّلة في «%s»؛ الفرق بعدها يُسجَّل بالجرد.', i.name, p_wh.name));
  end if;
  return null;
end
$$;

-- ─── رصيد الافتتاح (FOUNDATION ٥٤٨) ────────────────────────────────────────────────────────────────────────────
-- الترحيل (opening.post): دفعة لكل سطر بكميته وقيمته بالضبط وحركة opening، بلا قيد جهة ولا رقم (E12). الأقفال (§2.3): المرجع ←
-- قفل الفترة وصفّ الوحدة (check_opening_date) ← المستند ← المخزن والمواد ← الأرصدة؛ وكل فحص بعد قفله.
create or replace function public.post_opening_stock(p_id uuid, p_expected_version int, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'post_opening_stock';
  v_cached jsonb;
  d public.opening_docs;
  w public.warehouses;
  ln public.opening_lines;
  v_items uuid[];
  l public.stock_lots;
  v_lots jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_date date;
begin
  set local lock_timeout = '5s';
  perform private.require('opening.post');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'version', p_expected_version));
  if v_cached is not null then
    return v_cached;
  end if;
  select * into d from public.opening_docs where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(d.warehouse_id, true);
  v_date := d.on_date;
  perform private.check_opening_date(v_date, w.division_id);
  select * into d from public.opening_docs where org_id = w.org_id and id = p_id for update;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'هذا المستند ليس مسوّدة: رُحّل أو أُلغي من قبل.';
  end if;
  if p_expected_version is null or d.version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّرت المسوّدة بعد المعاينة. راجعها وعاينها من جديد قبل الترحيل.';
  end if;
  -- التاريخ انفحص من قراءة قبل قفل المستند (قفل الفترة والوحدة أوّلاً، §2.3)، فتاريخ تغيّر بينهما يرفض: النسخة وحدها ما تكفي لأن
  -- زيادتها معروفة سلفاً (+1)، فترحيل يسبق تعديلاً بنفس اللحظة كان يمرّ بتاريخ ما انفحص (فترة مقفلة أو بعد يوم التشغيل).
  if d.on_date is distinct from v_date then
    raise exception 'stale_draft' using hint = 'تغيّر تاريخ المسوّدة أثناء الترحيل. راجعها وعاينها من جديد.';
  end if;
  select array_agg(distinct x.item_id) into v_items from public.opening_lines x where x.org_id = d.org_id and x.doc_id = d.id;
  if v_items is null then
    raise exception 'doc_empty' using hint = 'المستند بلا سطور. أضف سطراً واحداً على الأقلّ.';
  end if;
  perform private.lock_masters(array[w.id], v_items, true);
  perform private.lock_balances(v_items, array_fill(w.id, array[cardinality(v_items)]));
  for ln in select * from public.opening_lines x where x.org_id = d.org_id and x.doc_id = d.id order by x.line_no loop
    perform private.raise_problem(private.opening_line_problem(w, ln));
  end loop;
  for ln in select * from public.opening_lines x where x.org_id = d.org_id and x.doc_id = d.id order by x.line_no loop
    l := private.new_lot(ln.item_id, w.id, d.on_date, ln.expiry_on, ln.born_at, ln.qty_base, ln.value, 'opening', d.id, ln.id);
    perform private.apply_move(l.id, 'opening', d.id, ln.id, ln.qty_base, ln.value, d.on_date, null);
    v_total := v_total + ln.value;
    v_lots := v_lots || jsonb_build_array(jsonb_build_object('line_id', ln.id, 'lot_id', l.id, 'item_id', ln.item_id, 'qty', ln.qty_base::text,
      'money', jsonb_build_object('value', ln.value::text)));
  end loop;
  update public.opening_docs set status = 'posted', client_ref = p_client_ref, posted_at = now(), posted_by = auth.uid()
  where org_id = d.org_id and id = d.id;
  perform private.mark_division_posted(w.division_id);
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'kind', 'opening', 'status', 'posted', 'warehouse_id', w.id,
    'on_date', d.on_date, 'lots', v_lots, 'money', jsonb_build_object('total', v_total::text)));
end
$$;

-- الإلغاء (void): عكس على نفس الدفعات بيوم الإلغاء، والأصل يبقى بيومه؛ دفعة انسحب منها ← lot_consumed يسمّي المستند. العكس يمرّ
-- حتى لو المادّة أو المخزن انؤرشف (E43).
create or replace function public.void_opening_stock(p_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_opening_stock';
  v_cached jsonb;
  v_reason text;
  d public.opening_docs;
  w public.warehouses;
  v_items uuid[];
  l public.stock_lots;
  m public.stock_moves;
  v_back jsonb := '[]'::jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into d from public.opening_docs where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(d.warehouse_id, true);
  perform private.check_void_date();
  select * into d from public.opening_docs where org_id = w.org_id and id = p_id for update;
  if d.status = 'void' then
    raise exception 'already_void' using hint = 'هذا المستند ملغى من قبل.';
  end if;
  if d.status <> 'posted' then
    raise exception 'not_posted' using hint = 'هذا المستند مسوّدة لم تُرحَّل؛ تُطوى المسوّدة بدل إلغائها.';
  end if;
  select array_agg(distinct x.item_id) into v_items from public.stock_lots x where x.org_id = d.org_id and x.source_kind = 'opening' and x.source_id = d.id;
  perform private.lock_masters(array[w.id], v_items, false);
  perform private.lock_balances(v_items, array_fill(w.id, array[cardinality(v_items)]));
  for l in select * from public.stock_lots x where x.org_id = d.org_id and x.source_kind = 'opening' and x.source_id = d.id order by x.id for no key update loop
    perform private.check_lot_intact(l.id);
  end loop;
  for m in
    select x.* from public.stock_moves x
    where x.org_id = d.org_id and x.doc_kind = 'opening' and x.doc_id = d.id and x.reverses_move_id is null
    order by x.item_id, x.seq
  loop
    perform private.apply_move(m.lot_id, 'opening', d.id, m.doc_line_id, -m.qty, -m.value, public.app_today(), m.id);
    v_back := v_back || jsonb_build_array(m.lot_id);
  end loop;
  update public.opening_docs set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
  where org_id = d.org_id and id = d.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'kind', 'opening', 'status', 'void', 'reversed_lots', v_back));
end
$$;

-- المعاينة (opening.post): الدفعات اللي راح تنخلق ومشاكل كل سطر والمستند، بلا كتابة ولا قفل (FOUNDATION ٧٧٠). المال مخفي لغير الكلفة.
create or replace function public.preview_opening_stock(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d public.opening_docs;
  w public.warehouses;
  v_division text;
  v_problems jsonb := '[]'::jsonb;
  v_lines jsonb;
  v_date jsonb;
begin
  perform private.require('opening.post');
  select * into d from public.opening_docs where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(d.warehouse_id, true);
  select x.kind into v_division from public.divisions x where x.org_id = w.org_id and x.id = w.division_id;
  if d.status <> 'draft' then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'not_draft', 'hint', 'هذا المستند ليس مسوّدة.'));
  end if;
  v_date := private.date_problem(d.on_date, w.division_id, true);
  if v_date is not null then
    v_problems := v_problems || jsonb_build_array(v_date);
  end if;
  if w.archived_at is not null then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'warehouse_archived', 'hint', format('المخزن «%s» مؤرشف.', w.name)));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('line_id', x.id, 'line_no', x.line_no, 'item_id', x.item_id, 'item_name', i.name,
      'base_unit', i.base_unit, 'qty', x.qty_base::text, 'expiry_on', x.expiry_on, 'born_at', x.born_at, 'zero_reason', x.zero_reason,
      'problem', coalesce(private.opening_line_problem(w, x),
        case when i.archived_at is not null then jsonb_build_object('code', 'item_archived', 'hint', format('المادّة «%s» مؤرشفة.', i.name)) end),
      'money', jsonb_build_object('value', x.value::text)) order by x.line_no), '[]'::jsonb)
  into v_lines
  from public.opening_lines x join public.items i on i.org_id = x.org_id and i.id = x.item_id
  where x.org_id = d.org_id and x.doc_id = d.id;
  return private.mask(jsonb_build_object('id', d.id, 'kind', 'opening', 'status', d.status, 'version', d.version, 'warehouse_id', w.id,
    'division_kind', v_division, 'on_date', d.on_date, 'problems', v_problems, 'lines', v_lines,
    'ready', jsonb_array_length(v_problems) = 0 and jsonb_array_length(v_lines) > 0
      and not exists (select 1 from jsonb_array_elements(v_lines) as e where e -> 'problem' <> 'null'::jsonb),
    'money', jsonb_build_object('total', coalesce((select sum(x.value) from public.opening_lines x where x.org_id = d.org_id and x.doc_id = d.id), 0)::text)));
end
$$;

-- ─── التحويل والصادر الداخلي (FOUNDATION ٥٥٤، القاعدة 15، Q4) ─────────────────────────────────────────────────
-- الترحيل (transfer.post، المرسِل بنطاق الأمين والمستلم أي مخزن فعّال يقبل المادّة): كل قطعة مسحوبة − بالمصدر ومرآة + بالوجهة
-- بنفس القيمة، ورقم TR، وبلا قيد جهة (بين وحدتين صادر داخلي بالكلفة). ما يسحب دفعة منتهية أبداً (FOUNDATION ٤٧٦). p_expected_plan
-- بصمة المعاينة اللي وافق عليها المستخدم: قطع غيرها (المخزون تغيّر بعد المعاينة) ← stale_preview والسحب كلّه يرجع.
create or replace function public.post_transfer(p_id uuid, p_expected_version int, p_expected_plan text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'post_transfer';
  v_cached jsonb;
  d public.transfers;
  wf public.warehouses;
  wt public.warehouses;
  v_div uuid;
  ln public.transfer_lines;
  i public.items;
  v_items uuid[];
  dr record;
  m public.stock_lots;
  v_no text;
  v_lines jsonb := '[]'::jsonb;
  v_draws jsonb;
  v_total numeric := 0;
  v_line_value numeric;
  v_date date;
  v_plan text := '';
  v_pieces text[];
  v_tracks boolean;
begin
  set local lock_timeout = '5s';
  perform private.require('transfer.post');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'version', p_expected_version));
  if v_cached is not null then
    return v_cached;
  end if;
  select * into d from public.transfers where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  wf := private.stock_wh(d.from_warehouse_id, true);
  wt := private.stock_wh(d.to_warehouse_id, false);
  if wf.id = wt.id then
    raise exception 'same_warehouse' using hint = 'المخزن المرسِل والمستلم واحد؛ اختر مخزناً آخر للاستلام.';
  end if;
  v_date := d.moved_on;
  for v_div in select distinct x from unnest(array[wf.division_id, wt.division_id]) as x order by 1 loop
    perform private.check_post_date(v_date, v_div);
  end loop;
  select * into d from public.transfers where org_id = wf.org_id and id = p_id for update;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'هذا المستند ليس مسوّدة: رُحّل أو أُلغي من قبل.';
  end if;
  if p_expected_version is null or d.version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّرت المسوّدة بعد المعاينة. راجعها وعاينها من جديد قبل الترحيل.';
  end if;
  -- التاريخ المفحوص قبل القفل نفسه بعده (مثل post_opening_stock): وإلا تحويل يترحّل بفترة مقفلة أو بالمستقبل.
  if d.moved_on is distinct from v_date then
    raise exception 'stale_draft' using hint = 'تغيّر تاريخ المسوّدة أثناء الترحيل. راجعها وعاينها من جديد.';
  end if;
  select array_agg(distinct x.item_id) into v_items from public.transfer_lines x where x.org_id = d.org_id and x.doc_id = d.id;
  if v_items is null then
    raise exception 'doc_empty' using hint = 'المستند بلا سطور. أضف سطراً واحداً على الأقلّ.';
  end if;
  perform private.lock_masters(array[wf.id, wt.id], v_items, true);
  for i in select * from public.items x where x.org_id = d.org_id and x.id = any (v_items) order by x.name collate "C", x.id loop
    if not private.item_admissible(wt.kind, i.kind) then
      raise exception 'item_kind_mismatch' using hint = format('«%s» لا يُخزَّن في «%s»: نوع المادّة لا يناسب نوع المخزن المستلم.', i.name, wt.name);
    end if;
  end loop;
  perform private.lock_balances(v_items || v_items, array_fill(wf.id, array[cardinality(v_items)]) || array_fill(wt.id, array[cardinality(v_items)]));
  for ln in select * from public.transfer_lines x where x.org_id = d.org_id and x.doc_id = d.id order by x.line_no loop
    v_draws := '[]'::jsonb;
    v_line_value := 0;
    v_pieces := '{}'::text[];
    -- علامة المادّة مقفولة for share (lock_masters)، فهي نفسها اللي حكمت السحب.
    select x.tracks_expiry into v_tracks from public.items x where x.org_id = d.org_id and x.id = ln.item_id;
    for dr in select * from private.draw(ln.item_id, wf.id, ln.qty_base, d.moved_on, null, false) loop
      v_pieces := v_pieces || private.plan_piece(dr.lot_id, dr.qty, dr.value);
      perform private.apply_move(dr.lot_id, 'transfer', d.id, ln.id, -dr.qty, -dr.value, d.moved_on, null, coalesce(v_tracks, false));
      m := private.mirror_lot(dr.lot_id, wt.id, dr.qty, dr.value, d.moved_on, d.id, ln.id);
      perform private.apply_move(m.id, 'transfer', d.id, ln.id, dr.qty, dr.value, d.moved_on, null);
      v_line_value := v_line_value + dr.value;
      v_draws := v_draws || jsonb_build_array(jsonb_build_object('lot_id', dr.lot_id, 'mirror_lot_id', m.id, 'qty', dr.qty::text,
        'money', jsonb_build_object('value', dr.value::text)));
    end loop;
    v_total := v_total + v_line_value;
    v_plan := v_plan || ln.id::text || '|' || array_to_string(v_pieces, ';') || '/';
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('line_id', ln.id, 'item_id', ln.item_id, 'qty', ln.qty_base::text, 'draws', v_draws,
      'money', jsonb_build_object('value', v_line_value::text)));
  end loop;
  -- القطع اللي انسحبت = اللي شافها المستخدم بالمعاينة (FOUNDATION ٥٢٠ البند 5: «فما يترحّل إلا اللي شافه المستخدم»، و٧٧٠): تحويل
  -- ثاني سحب نفس الدفعات بعد المعاينة، أو دفعة صارت قبلها بالترتيب، يغيّر القطع والقيمة بلا ما تتغيّر نسخة المسوّدة.
  if p_expected_plan is null or private.plan_token(v_plan) is distinct from p_expected_plan then
    raise exception 'stale_preview' using hint = 'تغيّر المخزون بعد المعاينة فتغيّرت الدفعات المسحوبة أو كمياتها. عاين التحويل من جديد ووافق عليه قبل الترحيل.';
  end if;
  v_no := private.next_doc_no('TR', d.moved_on);
  update public.transfers set status = 'posted', doc_no = v_no, client_ref = p_client_ref, posted_at = now(), posted_by = auth.uid()
  where org_id = d.org_id and id = d.id;
  for v_div in select distinct x from unnest(array[wf.division_id, wt.division_id]) as x order by 1 loop
    perform private.mark_division_posted(v_div);
  end loop;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'kind', 'transfer', 'status', 'posted', 'doc_no', v_no,
    'from_warehouse_id', wf.id, 'to_warehouse_id', wt.id, 'moved_on', d.moved_on, 'internal_export', wf.division_id <> wt.division_id,
    'lines', v_lines, 'money', jsonb_build_object('total', v_total::text)));
end
$$;

-- الإلغاء (void): كل مرآة وقطعة مصدرها تنعكس بيوم الإلغاء؛ مرآة انسحب منها ← lot_consumed يسمّي المستند. يمرّ للمؤرشف (E43).
create or replace function public.void_transfer(p_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_transfer';
  v_cached jsonb;
  v_reason text;
  d public.transfers;
  wf public.warehouses;
  wt public.warehouses;
  v_items uuid[];
  l public.stock_lots;
  mi public.stock_moves;
  mo public.stock_moves;
  v_back jsonb := '[]'::jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into d from public.transfers where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  wf := private.stock_wh(d.from_warehouse_id, true);
  wt := private.stock_wh(d.to_warehouse_id, false);
  perform private.check_void_date();
  select * into d from public.transfers where org_id = wf.org_id and id = p_id for update;
  if d.status = 'void' then
    raise exception 'already_void' using hint = 'هذا المستند ملغى من قبل.';
  end if;
  if d.status <> 'posted' then
    raise exception 'not_posted' using hint = 'هذا المستند مسوّدة لم تُرحَّل؛ تُطوى المسوّدة بدل إلغائها.';
  end if;
  select array_agg(distinct x.item_id) into v_items from public.transfer_lines x where x.org_id = d.org_id and x.doc_id = d.id;
  perform private.lock_masters(array[wf.id, wt.id], v_items, false);
  perform private.lock_balances(v_items || v_items, array_fill(wf.id, array[cardinality(v_items)]) || array_fill(wt.id, array[cardinality(v_items)]));
  for l in select * from public.stock_lots x where x.org_id = d.org_id and x.source_kind = 'transfer' and x.source_id = d.id order by x.id for no key update loop
    perform private.check_lot_intact(l.id);
  end loop;
  for l in select * from public.stock_lots x where x.org_id = d.org_id and x.source_kind = 'transfer' and x.source_id = d.id order by x.source_line_id, x.id loop
    select * into mi from public.stock_moves x
    where x.org_id = l.org_id and x.lot_id = l.id and x.doc_kind = 'transfer' and x.doc_id = d.id and x.qty > 0 and x.reverses_move_id is null;
    select * into mo from public.stock_moves x
    where x.org_id = l.org_id and x.lot_id = l.source_lot_id and x.doc_kind = 'transfer' and x.doc_id = d.id and x.doc_line_id = mi.doc_line_id
      and x.qty < 0 and x.reverses_move_id is null;
    perform private.apply_move(l.id, 'transfer', d.id, mi.doc_line_id, -mi.qty, -mi.value, public.app_today(), mi.id);
    perform private.apply_move(mo.lot_id, 'transfer', d.id, mo.doc_line_id, -mo.qty, -mo.value, public.app_today(), mo.id);
    v_back := v_back || jsonb_build_array(l.id);
  end loop;
  update public.transfers set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
  where org_id = d.org_id and id = d.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'kind', 'transfer', 'status', 'void', 'doc_no', d.doc_no,
    'reversed_mirrors', v_back));
end
$$;

-- المعاينة (transfer.post): السحب لكل سطر بالدفعات (الكمية للكل، والقيمة داخل money)، والنقص والمنتهي لحاله، واستهلاك الرصيد كلّه
-- (E31)، ومشاكل المستند (التاريخ بالوحدتين، والأرشفة، والأهلية بالوجهة)، بلا كتابة ولا قفل.
create or replace function public.preview_transfer(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d public.transfers;
  wf public.warehouses;
  wt public.warehouses;
  v_div uuid;
  v_problems jsonb := '[]'::jsonb;
  v_date jsonb;
  v_lines jsonb := '[]'::jsonb;
  ln public.transfer_lines;
  i public.items;
  s record;
  v_skip numeric;
  v_before numeric[];
  v_draws jsonb;
  v_drawn numeric;
  v_value numeric;
  v_problem jsonb;
  v_ready boolean := true;
  v_piece_text text;
  v_plan text := '';
begin
  perform private.require('transfer.post');
  select * into d from public.transfers where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  wf := private.stock_wh(d.from_warehouse_id, true);
  wt := private.stock_wh(d.to_warehouse_id, false);
  if d.status <> 'draft' then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'not_draft', 'hint', 'هذا المستند ليس مسوّدة.'));
  end if;
  for v_div in select distinct x from unnest(array[wf.division_id, wt.division_id]) as x order by 1 loop
    v_date := private.date_problem(d.moved_on, v_div, false);
    if v_date is not null and not v_problems @> jsonb_build_array(v_date) then
      v_problems := v_problems || jsonb_build_array(v_date);
    end if;
  end loop;
  if wf.archived_at is not null then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'warehouse_archived', 'hint', format('المخزن «%s» مؤرشف.', wf.name)));
  end if;
  if wt.archived_at is not null then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'warehouse_archived', 'hint', format('المخزن «%s» مؤرشف.', wt.name)));
  end if;
  for ln in select * from public.transfer_lines x where x.org_id = d.org_id and x.doc_id = d.id order by x.line_no loop
    select * into i from public.items where org_id = d.org_id and id = ln.item_id;
    -- السطور قبله من نفس المادّة بترتيبها، كل واحد سحب لحاله (draw_plan يعيدها مثل الترحيل)، ومجموعها من المتاح.
    select coalesce(array_agg(x.qty_base order by x.line_no), '{}'), coalesce(sum(x.qty_base), 0) into v_before, v_skip from public.transfer_lines x
    where x.org_id = d.org_id and x.doc_id = d.id and x.item_id = ln.item_id and x.line_no < ln.line_no;
    select coalesce(jsonb_agg(jsonb_build_object('lot_id', p.lot_id, 'qty', p.qty::text, 'received_on', l.received_on, 'expiry_on', l.expiry_on,
        'source_kind', l.source_kind, 'source', private.stock_doc_label(l.source_kind, l.source_id), 'supplier_lot_no', l.supplier_lot_no,
        'money', jsonb_build_object('value', p.value::text)) order by p.n), '[]'::jsonb),
      coalesce(sum(p.qty), 0), coalesce(sum(p.value), 0),
      coalesce(string_agg(private.plan_piece(p.lot_id, p.qty, p.value), ';' order by p.n), '')
    into v_draws, v_drawn, v_value, v_piece_text
    from private.draw_plan(ln.item_id, wf.id, ln.qty_base, d.moved_on, null, false, v_before) with ordinality as p(lot_id, qty, value, n)
    join public.stock_lots l on l.org_id = d.org_id and l.id = p.lot_id;
    select * into s from private.stock_at(ln.item_id, wf.id, d.moved_on);
    v_problem := case
      when not private.item_admissible(wt.kind, i.kind) then
        jsonb_build_object('code', 'item_kind_mismatch', 'hint', format('«%s» لا يُخزَّن في «%s»: نوع المادّة لا يناسب نوع المخزن المستلم.', i.name, wt.name))
      when i.archived_at is not null then jsonb_build_object('code', 'item_archived', 'hint', format('المادّة «%s» مؤرشفة.', i.name))
    end;
    v_ready := v_ready and v_problem is null and v_drawn = ln.qty_base;
    -- نفس شكل خطّة الترحيل (سطر|قطع/)، فالبصمة تطابق إذا ما تغيّر شي.
    v_plan := v_plan || ln.id::text || '|' || v_piece_text || '/';
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('line_id', ln.id, 'line_no', ln.line_no, 'item_id', i.id, 'item_name', i.name,
      'base_unit', i.base_unit, 'tracks_expiry', i.tracks_expiry, 'qty', ln.qty_base::text, 'qty_in_unit', ln.qty_in_unit::text,
      'unit_label', ln.unit_label, 'item_unit_id', ln.item_unit_id, 'unit_code', ln.unit_code,
      'available', greatest(s.available - v_skip, 0)::text, 'expired', s.expired::text, 'later', s.later::text,
      'shortage', (ln.qty_base - v_drawn)::text, 'whole_balance', v_drawn = ln.qty_base and v_skip + ln.qty_base = s.available,
      'problem', v_problem, 'draws', v_draws, 'money', jsonb_build_object('value', v_value::text)));
  end loop;
  return private.mask(jsonb_build_object('id', d.id, 'kind', 'transfer', 'status', d.status, 'version', d.version, 'doc_no', d.doc_no,
    'from_warehouse_id', wf.id, 'to_warehouse_id', wt.id, 'moved_on', d.moved_on, 'internal_export', wf.division_id <> wt.division_id,
    'to_division_kind', (select x.kind from public.divisions x where x.org_id = wt.org_id and x.id = wt.division_id),
    'problems', v_problems, 'lines', v_lines, 'plan', private.plan_token(v_plan),
    'ready', v_ready and jsonb_array_length(v_problems) = 0 and jsonb_array_length(v_lines) > 0));
end
$$;

-- ─── المسوّدات: الطيّ وحذف السطر (§2.5، E13، E52) ───────────────────────────────────────────────────────────────
-- الطيّ: المسوّدة void بلا رقم ولا حركات، لمن عنده فعل مسوّدتها وبنطاقها، وبشرط النسخة. الرأس ما ينحذف أبداً.
create or replace function public.discard_draft(p_doc_kind text, p_id uuid, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_status text;
  v_version int;
  v_wh uuid;
begin
  set local lock_timeout = '5s';
  if p_doc_kind = 'opening' then
    perform private.require('opening.post');
    select status, version, warehouse_id into v_status, v_version, v_wh from public.opening_docs
    where org_id = public.auth_org() and id = p_id for update;
  elsif p_doc_kind = 'transfer' then
    perform private.require('transfer.post');
    select status, version, from_warehouse_id into v_status, v_version, v_wh from public.transfers
    where org_id = public.auth_org() and id = p_id for update;
  else
    raise exception 'doc_kind_unknown' using hint = 'نوع المستند غير معروف.';
  end if;
  if v_status is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  perform private.stock_wh(v_wh, true);
  if v_status <> 'draft' then
    raise exception 'not_draft' using hint = 'هذا المستند ليس مسوّدة: رُحّل أو أُلغي من قبل.';
  end if;
  if p_expected_version is null or v_version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّرت المسوّدة بعد فتحها. حدّث الشاشة وأعد المحاولة.';
  end if;
  if p_doc_kind = 'opening' then
    update public.opening_docs set status = 'void', voided_at = now(), voided_by = auth.uid(), version = version + 1
    where org_id = public.auth_org() and id = p_id;
  else
    update public.transfers set status = 'void', voided_at = now(), voided_by = auth.uid(), version = version + 1
    where org_id = public.auth_org() and id = p_id;
  end if;
  return jsonb_build_object('id', p_id, 'kind', p_doc_kind, 'status', 'void', 'version', v_version + 1);
end
$$;

-- حذف سطر مسوّدة (E52): تحت قفل الرأس، بفعل مسوّدته ونطاقها وبشرط النسخة، والنسخة تزيد. السطر اللي انحذف من قبل يرجّع
-- deleted: false (الإعادة بعد نتيجة مجهولة). الحزم الجاية تزيد أنواعها بنفس التوقيع.
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
  else
    raise exception 'doc_kind_unknown' using hint = 'نوع المستند غير معروف.';
  end if;
  if v_doc is null then
    return jsonb_build_object('line_id', p_line_id, 'deleted', false);
  end if;
  if p_doc_kind = 'opening' then
    select status, version, warehouse_id into v_status, v_version, v_wh from public.opening_docs
    where org_id = public.auth_org() and id = v_doc for update;
  else
    select status, version, from_warehouse_id into v_status, v_version, v_wh from public.transfers
    where org_id = public.auth_org() and id = v_doc for update;
  end if;
  perform private.stock_wh(v_wh, true);
  if v_status <> 'draft' then
    raise exception 'not_draft' using hint = 'المستند مرحَّل أو ملغى؛ لا تُحذف سطوره.';
  end if;
  if p_expected_version is null or v_version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّرت المسوّدة بعد فتحها. حدّث الشاشة وأعد المحاولة.';
  end if;
  if p_doc_kind = 'opening' then
    delete from public.opening_lines where org_id = public.auth_org() and id = p_line_id;
    update public.opening_docs set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  else
    delete from public.transfer_lines where org_id = public.auth_org() and id = p_line_id;
    update public.transfers set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  end if;
  return jsonb_build_object('line_id', p_line_id, 'deleted', true, 'doc_id', v_doc, 'version', v_version + 1);
end
$$;


-- ─── قراءات الكميات (FOUNDATION ٤٤٥): definer بأعمدة بلا قيم، وأوّل سطر يفحص in_scope_wh ───────────────────────────
-- لوحة المخزن (E22، E24): لكل مادّة بالمخزن المتاح (غير منتهٍ) والمنتهي وقريب الانتهاء (30 يوماً)، وتنبيه الحدّ الأدنى (المتاح
-- بمخازن المنشأة اللي تستلم نوعها من المورّد أقلّ من حدّها، ويبين بلوحات هذه المخازن حتى لو رصيدها صفر)، وأقدم وقت فقس للأفراخ
-- وكمية اللي فاتها 48 ساعة. صفحة بالاسم المطبَّع ثم المعرّف، والمؤشّر الاسم والمعرّف كما وصلا بالصفحة (مو اسم المادّة الحالي:
-- مادّة انسمّت من جديد بين صفحتين كانت تنقل المؤشّر فتنقفز صفوف أو تنعاد)، والعدد الكلّي بأوّل صفحة.
create or replace function public.stock_on_hand(p_warehouse uuid, p_after jsonb, p_limit int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 200);
  w public.warehouses;
  v_division text;
  v_after_name text;
  v_after_id uuid;
  v_rows jsonb;
  v_total bigint;
begin
  if p_warehouse is null or not public.in_scope_wh(p_warehouse) then
    raise exception 'out_of_scope' using hint = 'هذا المخزن خارج نطاقك أو غير موجود في منشأتك.';
  end if;
  select * into w from public.warehouses where org_id = v_org and id = p_warehouse;
  select x.kind into v_division from public.divisions x where x.org_id = v_org and x.id = w.division_id;
  v_after_name := p_after ->> 'name';
  v_after_id := nullif(p_after ->> 'id', '')::uuid;
  with lots as (
    select l.item_id,
      coalesce(sum(l.qty_left) filter (where not l.expired), 0) as available,
      coalesce(sum(l.qty_left) filter (where l.expired), 0) as expired,
      coalesce(sum(l.qty_left) filter (where l.tracks and not l.expired and l.expiry_on is not null and l.expiry_on <= v_today + 30), 0) as near_expiry,
      min(l.born_at) filter (where l.chick) as oldest_born,
      coalesce(sum(l.qty_left) filter (where l.chick and l.born_at is not null and l.born_at <= now() - interval '48 hours'), 0) as old_chicks
    from (
      -- المنتهي وقريب الانتهاء لمادّة تتابع الانتهاء بس (مثل item_lots_qty وhome_summary)، والعمر بالساعات للأفراخ بس (E24).
      select x.item_id, x.qty_left, x.expiry_on, x.born_at, i.tracks_expiry as tracks, i.kind = 'chick' as chick,
        private.lot_expired(i.tracks_expiry, x.expiry_on, v_today) as expired
      from public.stock_lots x join public.items i on i.org_id = x.org_id and i.id = x.item_id
      where x.org_id = v_org and x.warehouse_id = w.id and x.qty_left > 0
    ) as l
    group by l.item_id
  ), shown as (
    select i.id, i.name, i.name_norm, i.kind, i.base_unit, i.tracks_expiry, i.min_qty, i.archived_at,
      coalesce(t.available, 0) as available, coalesce(t.expired, 0) as expired, coalesce(t.near_expiry, 0) as near_expiry,
      t.oldest_born, coalesce(t.old_chicks, 0) as old_chicks,
      i.min_qty is not null and w.kind = any (private.receiving_kinds(i.kind)) and coalesce((
        select sum(x.qty_left) from public.stock_lots x join public.warehouses y on y.org_id = x.org_id and y.id = x.warehouse_id
        where x.org_id = v_org and x.item_id = i.id and x.qty_left > 0 and y.kind = any (private.receiving_kinds(i.kind))
          and not private.lot_expired(i.tracks_expiry, x.expiry_on, v_today)
      ), 0) < i.min_qty as below_min
    from public.items i left join lots t on t.item_id = i.id
    where i.org_id = v_org
      and (t.item_id is not null or (i.min_qty is not null and i.archived_at is null and w.kind = any (private.receiving_kinds(i.kind))))
  ), paged as (
    select s.* from shown s
    where v_after_id is null or s.name_norm collate "C" > v_after_name collate "C" or (s.name_norm = v_after_name and s.id > v_after_id)
    order by s.name_norm collate "C", s.id
    limit v_limit + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('item_id', p.id, 'name', p.name, 'kind', p.kind, 'base_unit', p.base_unit,
      'tracks_expiry', p.tracks_expiry, 'min_qty', p.min_qty::text, 'archived', p.archived_at is not null,
      'available', p.available::text, 'expired', p.expired::text, 'near_expiry', p.near_expiry::text, 'below_min', p.below_min,
      'oldest_born_at', p.oldest_born,
      'chick_age_hours', case when p.oldest_born is not null then div(extract(epoch from (now() - p.oldest_born))::numeric, 3600)::text end, -- date-ok: عمر الفرخ ساعات بين لحظتين (E24)، مو يوماً
      'old_chicks', p.old_chicks::text, 'cursor', jsonb_build_object('name', p.name_norm, 'id', p.id))
      order by p.name_norm collate "C", p.id), '[]'::jsonb),
    case when v_after_id is null then (select count(*) from shown) end
  into v_rows, v_total
  from paged p;
  return jsonb_build_object(
    'warehouse', jsonb_build_object('id', w.id, 'name', w.name, 'kind', w.kind, 'division_id', w.division_id, 'division_kind', v_division,
      'archived', w.archived_at is not null,
      'has_balance', exists (select 1 from public.stock_balances b where b.org_id = v_org and b.warehouse_id = w.id and b.qty <> 0)),
    'as_of', now(), 'today', v_today,
    'rows', (select coalesce(jsonb_agg(r - 'cursor' order by n), '[]'::jsonb) from jsonb_array_elements(v_rows) with ordinality as x(r, n) where n <= v_limit),
    'next', case when jsonb_array_length(v_rows) > v_limit then v_rows -> (v_limit - 1) -> 'cursor' end,
    'total', v_total);
end
$$;

-- دفعات مادّة متبقّية بمخزن بترتيب السحب (القاعدة 12): الكمية، والعمر (ساعات من الفقس للأفراخ، وأيام من استلام الجذر لغيرها،
-- E24)، والانتهاء، ومصدرها ورقم دفعة المورّد. بلا قيم. المؤشّر معرّف آخر دفعة (fifo_seq ما يطلع).
create or replace function public.item_lots_qty(p_item uuid, p_warehouse uuid, p_after jsonb, p_limit int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 200);
  i public.items;
  c public.stock_lots;
  v_rows jsonb;
  v_total bigint;
begin
  if p_warehouse is null or not public.in_scope_wh(p_warehouse) then
    raise exception 'out_of_scope' using hint = 'هذا المخزن خارج نطاقك أو غير موجود في منشأتك.';
  end if;
  select * into i from public.items where org_id = v_org and id = p_item;
  if i.id is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  select * into c from public.stock_lots where org_id = v_org and item_id = i.id and warehouse_id = p_warehouse and id = nullif(p_after ->> 'id', '')::uuid;
  with lots as (
    select l.*, coalesce(r.received_on, l.received_on) as root_received
    from public.stock_lots l left join public.stock_lots r on r.org_id = l.org_id and r.id = l.origin_lot_id
    where l.org_id = v_org and l.item_id = i.id and l.warehouse_id = p_warehouse and l.qty_left > 0
  ), paged as (
    select * from lots l
    where c.id is null
      or (c.expiry_on is null and l.expiry_on is null and (l.fifo_seq > c.fifo_seq or (l.fifo_seq = c.fifo_seq and l.id > c.id)))
      or (c.expiry_on is not null and (l.expiry_on is null or l.expiry_on > c.expiry_on
        or (l.expiry_on = c.expiry_on and (l.fifo_seq > c.fifo_seq or (l.fifo_seq = c.fifo_seq and l.id > c.id)))))
    order by l.expiry_on asc nulls last, l.fifo_seq, l.id
    limit v_limit + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('lot_id', p.id, 'qty_left', p.qty_left::text, 'received_on', p.received_on,
      'root_received_on', p.root_received, 'age_days', v_today - p.root_received, 'born_at', p.born_at,
      'age_hours', case when i.kind = 'chick' and p.born_at is not null then div(extract(epoch from (now() - p.born_at))::numeric, 3600)::text end, -- date-ok: عمر الفرخ ساعات بين لحظتين (E24)
      'expiry_on', p.expiry_on, 'expired', private.lot_expired(i.tracks_expiry, p.expiry_on, v_today),
      'near_expiry', coalesce(i.tracks_expiry and p.expiry_on >= v_today and p.expiry_on <= v_today + 30, false),
      'source_kind', p.source_kind, 'source_id', p.source_id, 'source', private.stock_doc_label(p.source_kind, p.source_id),
      'supplier_lot_no', p.supplier_lot_no)
      order by p.expiry_on asc nulls last, p.fifo_seq, p.id), '[]'::jsonb),
    case when c.id is null then (select count(*) from lots) end
  into v_rows, v_total
  from paged p;
  return jsonb_build_object(
    'item', jsonb_build_object('id', i.id, 'name', i.name, 'kind', i.kind, 'base_unit', i.base_unit, 'tracks_expiry', i.tracks_expiry,
      'min_qty', i.min_qty::text, 'density', i.density_kg_per_l::text, 'piece_mass_kg', i.piece_mass_kg::text, 'archived', i.archived_at is not null),
    'rows', (select coalesce(jsonb_agg(r order by n), '[]'::jsonb) from jsonb_array_elements(v_rows) with ordinality as x(r, n) where n <= v_limit),
    'next', case when jsonb_array_length(v_rows) > v_limit then jsonb_build_object('id', v_rows -> (v_limit - 1) ->> 'lot_id') end,
    'total', v_total);
end
$$;

-- حركات مادّة بمخزن بترتيبها (seq داخل المادّة والمخزن) بكمية موقّعة ورصيد جارٍ من أوّل حركة، والعكسية والمعكوسة بعلامتها.
-- بلا قيم. المؤشّر آخر seq.
create or replace function public.item_moves_qty(p_item uuid, p_warehouse uuid, p_after_seq bigint, p_limit int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 200);
  v_rows jsonb;
  v_total bigint;
begin
  if p_warehouse is null or not public.in_scope_wh(p_warehouse) then
    raise exception 'out_of_scope' using hint = 'هذا المخزن خارج نطاقك أو غير موجود في منشأتك.';
  end if;
  with mv as (
    select m.*, sum(m.qty) over (order by m.seq rows between unbounded preceding and current row) as running,
      exists (select 1 from public.stock_moves r where r.org_id = m.org_id and r.reverses_move_id = m.id) as reversed
    from public.stock_moves m
    where m.org_id = v_org and m.item_id = p_item and m.warehouse_id = p_warehouse
  ), paged as (
    select * from mv where mv.seq > coalesce(p_after_seq, 0) order by mv.seq limit v_limit + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('move_id', p.id, 'seq', p.seq::text, 'moved_on', p.moved_on, 'doc_kind', p.doc_kind,
      'doc_id', p.doc_id, 'doc', private.stock_doc_label(p.doc_kind, p.doc_id), 'qty', p.qty::text, 'running', p.running::text,
      'lot_id', p.lot_id, 'reverses_move_id', p.reverses_move_id, 'reversed', p.reversed) order by p.seq), '[]'::jsonb),
    case when p_after_seq is null then (select count(*) from mv) end
  into v_rows, v_total
  from paged p;
  return jsonb_build_object(
    'rows', (select coalesce(jsonb_agg(r order by n), '[]'::jsonb) from jsonb_array_elements(v_rows) with ordinality as x(r, n) where n <= v_limit),
    'next', case when jsonb_array_length(v_rows) > v_limit then v_rows -> (v_limit - 1) ->> 'seq' end,
    'total', v_total);
end
$$;

-- ─── قراءات القيم (§2.8): invoker (سياسات الكلفة والنطاق نفسها) ويّا فحص صريح يرفض forbidden، والمجاميع من هنا مو من الصفوف ──
-- قيمة المتاح والمنتهي لكل مادّة رصيدها موجب بالمخزن، بنفس ترتيب اللوحة ومؤشّرها (صفحة القيم تغطّي صفحة الكميات).
create or replace function public.stock_values(p_warehouse uuid, p_after jsonb, p_limit int) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 200);
  v_after_name text;
  v_after_id uuid;
  v_rows jsonb;
begin
  if not (public.can('accounts.view') and public.can_see_cost()) then
    raise exception 'forbidden' using hint = 'قيم المخزون للمالك والمدير والمحاسب فقط.';
  end if;
  if p_warehouse is null or not public.in_scope_wh(p_warehouse) then
    raise exception 'out_of_scope' using hint = 'هذا المخزن خارج نطاقك أو غير موجود في منشأتك.';
  end if;
  v_after_name := p_after ->> 'name';
  v_after_id := nullif(p_after ->> 'id', '')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object('item_id', g.item_id, 'available', g.available::text, 'expired', g.expired::text)
      order by g.name_norm collate "C", g.item_id), '[]'::jsonb)
  into v_rows
  from (
    select l.item_id, i.name_norm,
      -- invoker بلا usage على private: نفس private.lot_expired مكتوب هنا (صريح بلا NULL).
      coalesce(sum(l.value_left) filter (where not coalesce(i.tracks_expiry and l.expiry_on < v_today, false)), 0) as available,
      coalesce(sum(l.value_left) filter (where coalesce(i.tracks_expiry and l.expiry_on < v_today, false)), 0) as expired
    from public.stock_lots l join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where l.org_id = v_org and l.warehouse_id = p_warehouse and l.qty_left > 0
      and (v_after_id is null or i.name_norm collate "C" > v_after_name collate "C" or (i.name_norm = v_after_name and i.id > v_after_id))
    group by l.item_id, i.name_norm
    order by i.name_norm collate "C", l.item_id
    limit v_limit
  ) as g;
  return jsonb_build_object('warehouse_id', p_warehouse, 'rows', v_rows);
end
$$;

-- مجاميع المخزن (أو كل مخازن النطاق إذا p_warehouse فارغ): الكمية لكل وحدة أساس، والقيمة المتاحة والمنتهية، محسوبة بـSQL (§2.8).
create or replace function public.stock_value_totals(p_warehouse uuid) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
begin
  if not (public.can('accounts.view') and public.can_see_cost()) then
    raise exception 'forbidden' using hint = 'قيم المخزون للمالك والمدير والمحاسب فقط.';
  end if;
  if p_warehouse is not null and not public.in_scope_wh(p_warehouse) then
    raise exception 'out_of_scope' using hint = 'هذا المخزن خارج نطاقك أو غير موجود في منشأتك.';
  end if;
  return (
    with lots as (
      -- invoker بلا usage على private: نفس private.lot_expired مكتوب هنا (صريح بلا NULL).
      select i.base_unit, l.qty_left, l.value_left, coalesce(i.tracks_expiry and l.expiry_on < v_today, false) as expired
      from public.stock_lots l join public.items i on i.org_id = l.org_id and i.id = l.item_id
      where l.org_id = v_org and l.qty_left > 0 and (p_warehouse is null or l.warehouse_id = p_warehouse) and public.in_scope_wh(l.warehouse_id)
    )
    select jsonb_build_object('warehouse_id', p_warehouse,
      'units', coalesce((select jsonb_agg(jsonb_build_object('base_unit', u.base_unit, 'available', u.available::text, 'expired', u.expired::text)
        order by u.base_unit collate "C") from (
          select base_unit, coalesce(sum(qty_left) filter (where not expired), 0) as available, coalesce(sum(qty_left) filter (where expired), 0) as expired
          from lots group by base_unit) as u), '[]'::jsonb),
      'money', jsonb_build_object(
        'available', coalesce((select sum(value_left) from lots where not expired), 0)::text,
        'expired', coalesce((select sum(value_left) from lots where expired), 0)::text,
        'total', coalesce((select sum(value_left) from lots), 0)::text))
  );
end
$$;

-- قيم الدفعات المتبقّية بنفس ترتيب item_lots_qty ومؤشّرها: المتبقّي وقيمته (كلفة الوحدة للعرض بالواجهة، القاعدة 9).
create or replace function public.item_lots_value(p_item uuid, p_warehouse uuid, p_after jsonb, p_limit int) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 200);
  c public.stock_lots;
  v_rows jsonb;
begin
  if not (public.can('accounts.view') and public.can_see_cost()) then
    raise exception 'forbidden' using hint = 'قيم المخزون للمالك والمدير والمحاسب فقط.';
  end if;
  if p_warehouse is null or not public.in_scope_wh(p_warehouse) then
    raise exception 'out_of_scope' using hint = 'هذا المخزن خارج نطاقك أو غير موجود في منشأتك.';
  end if;
  select * into c from public.stock_lots where org_id = v_org and item_id = p_item and warehouse_id = p_warehouse and id = nullif(p_after ->> 'id', '')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object('lot_id', l.id, 'qty_left', l.qty_left::text, 'value_left', l.value_left::text)
      order by l.expiry_on asc nulls last, l.fifo_seq, l.id), '[]'::jsonb)
  into v_rows
  from (
    select x.* from public.stock_lots x
    where x.org_id = v_org and x.item_id = p_item and x.warehouse_id = p_warehouse and x.qty_left > 0
      and (c.id is null
        or (c.expiry_on is null and x.expiry_on is null and (x.fifo_seq > c.fifo_seq or (x.fifo_seq = c.fifo_seq and x.id > c.id)))
        or (c.expiry_on is not null and (x.expiry_on is null or x.expiry_on > c.expiry_on
          or (x.expiry_on = c.expiry_on and (x.fifo_seq > c.fifo_seq or (x.fifo_seq = c.fifo_seq and x.id > c.id))))))
    order by x.expiry_on asc nulls last, x.fifo_seq, x.id
    limit v_limit
  ) as l;
  return jsonb_build_object('item_id', p_item, 'warehouse_id', p_warehouse, 'rows', v_rows);
end
$$;

-- ─── ملخّص الرئيسية (E38): بطاقة الحسابات كما بـ0006 (دفاتر النطاق، E49)، وتنبيهات المخزون لكل وحدة بمخازن النطاق: مواد تحت
-- الحدّ الأدنى (E22)، ومواد قريبة الانتهاء (30 يوماً)، وأفراخ فاتها 48 ساعة (E24). definer بفلتر نطاق صريح: أرقام المخزون من جداول
-- الكلفة (أعداد بلا قيم، لكل دور)، وبطاقة الحسابات لمن يرى الحسابات بس.
create or replace function public.home_summary() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_out jsonb := '{}'::jsonb;
begin
  -- بلا منشأة ماكو أرقام: ملخّص فارغ (مثل find_item_twins)، مو رفض.
  if v_org is null then
    return v_out;
  end if;
  if public.can_see_accounts() then
    v_out := v_out || jsonb_build_object('accounts', (
      select jsonb_build_object('receivable', coalesce(sum(greatest(x.balance, 0)), 0)::text, 'payable', coalesce(sum(greatest(-x.balance, 0)), 0)::text,
        -- الصناديق بالسالب (Q10: السالب مسموح ويّا تنبيه ظاهر بالبطاقة).
        'negative_boxes', (select count(*) from (
          select m.account_id from public.cash_moves m where m.org_id = v_org group by m.account_id having sum(m.amount) < 0) as n),
        -- القارئ المحصور (E49): «لنا» و«علينا» من دفاتر نطاقه بس، فالبطاقة تكتب «N من المجموع» مثل صفحة الحسابات.
        'books', jsonb_build_object(
          'visible', (select count(*) from public.ledger_books b where b.org_id = v_org and b.archived_at is null and public.in_scope_book(b.id)),
          'total', (select count(*) from public.ledger_books b where b.org_id = v_org and b.archived_at is null)))
      from (
        select sum(e.amount) as balance from public.party_entries e
        where e.org_id = v_org and e.on_date <= v_today and public.in_scope_book(e.book_id)
        group by e.party_id, e.book_id
      ) as x));
  end if;
  v_out := v_out || jsonb_build_object('stock', coalesce((
    select jsonb_agg(jsonb_build_object('division_id', d.id, 'kind', d.kind,
        'below_min', (
          select count(*) from public.items i
          where i.org_id = v_org and i.min_qty is not null and i.archived_at is null
            and exists (select 1 from public.warehouses w where w.org_id = v_org and w.division_id = d.id and w.archived_at is null
              and w.kind = any (private.receiving_kinds(i.kind)) and public.in_scope_wh(w.id))
            and coalesce((
              select sum(x.qty_left) from public.stock_lots x join public.warehouses y on y.org_id = x.org_id and y.id = x.warehouse_id
              where x.org_id = v_org and x.item_id = i.id and x.qty_left > 0 and y.kind = any (private.receiving_kinds(i.kind))
                and not private.lot_expired(i.tracks_expiry, x.expiry_on, v_today)
            ), 0) < i.min_qty),
        'near_expiry', (
          select count(distinct x.item_id) from public.stock_lots x
          join public.warehouses w on w.org_id = x.org_id and w.id = x.warehouse_id
          join public.items i on i.org_id = x.org_id and i.id = x.item_id
          where x.org_id = v_org and w.division_id = d.id and public.in_scope_wh(w.id) and x.qty_left > 0 and i.tracks_expiry
            and x.expiry_on >= v_today and x.expiry_on <= v_today + 30),
        'old_chicks', (
          select coalesce(sum(x.qty_left), 0)::bigint from public.stock_lots x
          join public.warehouses w on w.org_id = x.org_id and w.id = x.warehouse_id
          join public.items i on i.org_id = x.org_id and i.id = x.item_id
          where x.org_id = v_org and w.division_id = d.id and public.in_scope_wh(w.id) and x.qty_left > 0 and i.kind = 'chick'
            and x.born_at is not null and x.born_at <= now() - interval '48 hours'))
      order by d.kind collate "C")
    from public.divisions d
    where d.org_id = v_org and d.archived_at is null
      and exists (select 1 from public.warehouses w where w.org_id = v_org and w.division_id = d.id and public.in_scope_wh(w.id))
  ), '[]'::jsonb));
  return v_out;
end
$$;

-- ─── «مؤرشف وعليه رصيد» بقائمة المخازن (§2.6، E43): مخزن انؤرشف ورجع إليه رصيد بإلغاء، حتى ينعاد من الأرشيف أو يتصفّى ─────────
-- definer بلا قيم ولا كميات (معرّفات بس) لكل دور بنطاقه: الأرصدة جدول كلفة، والعلامة تلزم أمين المخزن هم بمنتقي المخزن.
create or replace function public.archived_stores_with_stock() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(w.id order by w.id), '[]'::jsonb)
  from public.warehouses w
  where w.org_id = public.auth_org() and w.archived_at is not null and public.in_scope_wh(w.id)
    and exists (select 1 from public.stock_balances b where b.org_id = w.org_id and b.warehouse_id = w.id and b.qty <> 0)
$$;

-- ─── الثوابت (FOUNDATION ٤٢٩–٤٣٠، الخطّة WP4): صفر مخالفة بالحزمة وبالإنتاج، لـservice_role بس ─────────────────────────────
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
  where mi.qty is null or mo.qty is null or mo.qty <> -mi.qty or mo.value <> -mi.value or m.qty_in <> mi.qty or m.value_in <> mi.value
    or m.fifo_seq <> s.fifo_seq or m.expiry_on is distinct from s.expiry_on or m.born_at is distinct from s.born_at
    or m.origin_lot_id is distinct from coalesce(s.origin_lot_id, s.id) or m.item_id <> s.item_id
  union all
  -- 6. ماكو سحب من دفعة قبل استلامها، ولا من دفعة منتهية بيوم السحب (الاستثناءات الأربعة بحزمها: الدفعة المسمّاة بإذن المدير،
  --    والإتلاف، والمرتجع، ونقص الجرد المنتهي؛ ماكو منها بالمرحلة 1 لحد WP5).
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
  --    (+ الاستلامات WP6، وزيادات الجرد WP5، وحصص التقييم WP7)؛ والخارج = Σ متبقّي الدفعات (+ المرتجع والجرد والصرف بحزمها).
  --    التحويل بلا طرف (الفحص 5). الملغى صفر بالطرفين.
  select 'value_conservation', count(*) from (
    select o.id,
      coalesce((select sum(x.value) from public.opening_lines x join public.opening_docs d on d.org_id = x.org_id and d.id = x.doc_id
        where x.org_id = o.id and d.status = 'posted'), 0) as inputs,
      coalesce((select sum(l.value_left) from public.stock_lots l where l.org_id = o.id), 0) as outputs
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
  -- 10. ترتيب السحب (القاعدة 12): وقت كل قطعة سحب أصلية بالتحويل ماكو دفعة قبلها بالترتيب (الانتهاء والفارغ أخيراً، ثم fifo_seq،
  --     ثم المعرّف) مؤهّلة بتاريخ السحب (مستلمة بيه أو قبله، وغير منتهية للمادّة اللي تتابع الانتهاء) وبيها متبقٍّ قبل القطعة.
  --     السحب من دفعة مسمّاة (إذن المنتهي، والإتلاف، والمرتجع) برّا الفحص؛ كل حزمة تضيف هنا نوع سحبها بالترتيب.
  select 'draw_order', count(*) from public.stock_moves m
  join public.stock_lots l on l.org_id = m.org_id and l.id = m.lot_id
  where m.qty < 0 and m.reverses_move_id is null and m.doc_kind = 'transfer'
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
  --     والملغى كل أصلية منه معكوسة. يمسك سحباً ناقصاً، وإلغاءً ناقصاً، ودفعة افتتاح بغير كمية سطرها.
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
  ) as v
$$;


-- ─── verify_ledger (0006) ويّا مصدر أرقام TR (الفحص 11، الخطّة WP3): نفس التوقيع، والجسم كلّه كما بـ0006 عدا الترقيم ──────────
create or replace function public.verify_ledger() returns table (check_name text, violations bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_bad bigint := 0;
  v_org record;
  v_user uuid;
  v_report jsonb;
  v_cash jsonb;
begin
  return query
  with rem as (
    select e.org_id, e.id, e.party_id, e.book_id, e.kind, e.amount, e.reverses_entry_id, e.doc_kind, e.doc_no, e.on_date,
      abs(e.amount) - coalesce((
        select sum(a.amount) from public.party_allocations a
        where a.org_id = e.org_id and a.party_id = e.party_id and a.book_id = e.book_id
          and ((e.amount > 0 and a.debit_entry_id = e.id) or (e.amount < 0 and a.credit_entry_id = e.id))
      ), 0) as remaining
    from public.party_entries e
  )
  -- 1. المتبقّي المقداري بين صفر و|المبلغ|.
  select 'entry_remaining_range'::text, count(*) from rem where remaining < 0 or remaining > abs(amount)
  union all
  -- 2. لكل (جهة، دفتر): Σ المبالغ = Σ متبقّي الموجبة − Σ متبقّي السالبة (يلزم من 3، وينفحص بمصدره).
  select 'book_balance_identity', count(*) from (
    select org_id, party_id, book_id from rem group by org_id, party_id, book_id
    having sum(amount) <> coalesce(sum(remaining) filter (where amount > 0), 0) - coalesce(sum(remaining) filter (where amount < 0), 0)
  ) as x
  union all
  -- 3. كل توزيع بين قيد موجب وقيد سالب لنفس (الجهة، الدفتر) المكتوبين عليه، والعكس بنفس قيديه ومبلغه المعاكس.
  select 'allocation_pairs', count(*) from public.party_allocations a
  left join public.party_entries d on d.org_id = a.org_id and d.id = a.debit_entry_id
  left join public.party_entries c on c.org_id = a.org_id and c.id = a.credit_entry_id
  left join public.party_allocations o on o.org_id = a.org_id and o.id = a.reverses_allocation_id
  where d.id is null or c.id is null or d.amount <= 0 or c.amount >= 0
    or d.party_id <> a.party_id or d.book_id <> a.book_id or c.party_id <> a.party_id or c.book_id <> a.book_id
    or (a.reverses_allocation_id is not null and (o.id is null or o.debit_entry_id <> a.debit_entry_id or o.credit_entry_id <> a.credit_entry_id
      or o.amount <> -a.amount or o.reverses_allocation_id is not null))
  union all
  -- 4. كل قيد عكسي بنوع أصله وبمبلغه المعاكس، ومتوزّع بالكامل على أصله (زوج مغلق).
  select 'reversal_pairs', count(*) from public.party_entries r
  join public.party_entries o on o.org_id = r.org_id and o.id = r.reverses_entry_id
  where o.kind <> r.kind or r.amount <> -o.amount or o.reverses_entry_id is not null or o.party_id <> r.party_id or o.book_id <> r.book_id
    or coalesce((select sum(a.amount) from public.party_allocations a where a.org_id = r.org_id
      and ((a.debit_entry_id = r.id and a.credit_entry_id = o.id) or (a.debit_entry_id = o.id and a.credit_entry_id = r.id))), 0) <> abs(o.amount)
  union all
  -- 5. مبالغ الدفاتر والتوزيع والصناديق بدينار صحيح.
  select 'whole_dinar', (select count(*) from public.party_entries where amount <> round(amount, 0))
    + (select count(*) from public.party_allocations where amount <> round(amount, 0))
    + (select count(*) from public.cash_moves where amount <> round(amount, 0))
  union all
  -- 6. النوع وإشارته (FOUNDATION ٣١٣)، والعكسي بالإشارة المعاكسة.
  select 'kind_sign', count(*) from public.party_entries
  where (kind in ('invoice', 'payout', 'supplier_return') and (amount > 0) <> (reverses_entry_id is null))
    or (kind in ('purchase', 'bill', 'payment', 'return') and (amount < 0) <> (reverses_entry_id is null))
    or kind not in ('invoice', 'purchase', 'bill', 'payment', 'payout', 'return', 'supplier_return', 'forgiveness', 'opening', 'adjustment', 'offset')
  union all
  -- 7. كل قيد قبض أو دفع (أصلاً وعكساً) بحركة صندوق وحدة بالاتّجاه المعاكس.
  select 'payment_cash_moves', count(*) from public.party_entries e
  where e.kind in ('payment', 'payout')
    and (select count(*) from public.cash_moves m where m.org_id = e.org_id and m.party_entry_id = e.id and m.amount = -e.amount) <> 1
  union all
  -- 8. كل حركة صندوق مربوطة بمصدرها: القبض بقيد payment والدفع بقيد payout وبالمبلغ المعاكس؛ دفعة الاستلام ونقله والمصروف
  --    مصادرها بالحزم الجاية (WP5/WP6)، فحركة بيها بلا مصدر مخالفة لحد ما تنضاف؛ والافتتاح بلا مستند.
  select 'cash_move_sources', count(*) from public.cash_moves m
  left join public.party_entries e on e.org_id = m.org_id and e.id = m.party_entry_id
  where (m.kind = 'party_payment' and (e.id is null or e.kind <> 'payment' or m.amount <> -e.amount))
    or (m.kind = 'party_payout' and (e.id is null or e.kind <> 'payout' or e.doc_kind is not null or m.amount <> -e.amount))
    or m.kind in ('receipt_paid', 'receipt_charge', 'expense')
    or (m.kind = 'opening' and (m.doc_kind is not null or m.party_entry_id is not null))
    or (m.kind = 'transfer' and (m.doc_kind is distinct from 'cash_transfer' or m.party_entry_id is not null))
  union all
  -- 8. والعكس: كل حركة عكسية بنفس صندوق أصلها ونوعه ومستنده وبمبلغه المعاكس، مرّة وحدة؛ وحركة القيد العكسي لقيده العكسي.
  select 'cash_move_reversals', count(*) from public.cash_moves r
  join public.cash_moves o on o.org_id = r.org_id and o.id = r.reverses_move_id
  where o.account_id <> r.account_id or o.kind <> r.kind or r.amount <> -o.amount or o.reverses_move_id is not null
    or o.doc_kind is distinct from r.doc_kind or o.doc_id is distinct from r.doc_id
    or (o.party_entry_id is not null and not exists (select 1 from public.party_entries x where x.org_id = r.org_id and x.id = r.party_entry_id
      and x.reverses_entry_id = o.party_entry_id))
  union all
  -- 8. النقل: وجهان أصليان بصندوقين مختلفين ومجموعهما صفر لكل مستند.
  select 'cash_transfer_legs', count(*) from (
    select org_id, doc_id from public.cash_moves where kind = 'transfer' and reverses_move_id is null group by org_id, doc_id
    having count(*) <> 2 or sum(amount) <> 0 or count(distinct account_id) <> 2
  ) as x
  union all
  -- 8. رصيد افتتاحي فعّال واحد لكل صندوق.
  select 'cash_opening_once', count(*) from (
    select o.org_id, o.account_id from public.cash_moves o
    where o.kind = 'opening' and o.reverses_move_id is null and not exists (select 1 from public.cash_moves r where r.org_id = o.org_id and r.reverses_move_id = o.id)
    group by o.org_id, o.account_id having count(*) > 1
  ) as x
  union all
  -- رصيد افتتاحي فعّال واحد لكل (جهة، دفتر) (E20: المعكوس ما ينحسب).
  select 'party_opening_once', count(*) from (
    select o.org_id, o.party_id, o.book_id from public.party_entries o
    where o.kind = 'opening' and o.reverses_entry_id is null and not exists (select 1 from public.party_entries r where r.org_id = o.org_id and r.reverses_entry_id = o.id)
    group by o.org_id, o.party_id, o.book_id having count(*) > 1
  ) as x
  union all
  -- 10. اكتمال التوزيع (القاعدة 27): ما يجتمع بنفس (الجهة، الدفتر) متبقٍّ موجب ومتبقٍّ سالب.
  select 'allocation_completeness', count(*) from (
    select org_id, party_id, book_id from rem where remaining > 0 group by org_id, party_id, book_id
    having bool_or(amount > 0) and bool_or(amount < 0)
  ) as x
  union all
  -- 11. الترقيم: لكل (منشأة، نوع، سنة) بالعدّاد، الأصول المرقّمة (القبض RC والدفع PY المستقلّان، والتحويل TR من 0007) بأرقام
  --     1…last_no بلا فجوة ولا تكرار، وكل رقم بنوعه وسنة تاريخه، وماكو رقم بلا عدّاد. كل حزمة جاية تزيد مصدرها (SU وCT وPU وRT).
  select 'doc_numbers', (
    select count(*) from (
      select n.org_id, n.kind, n.year, count(*) as items, count(distinct n.no) as distinct_no, min(n.no) as min_no, max(n.no) as max_no
      from (
        select e.org_id, split_part(e.doc_no, '-', 1) as kind, split_part(e.doc_no, '-', 2)::int as year, split_part(e.doc_no, '-', 3)::int as no
        from public.party_entries e
        where e.reverses_entry_id is null and e.doc_kind is null and e.doc_no is not null
        union all
        -- TR (0007): التحويل المرحَّل أو الملغى بعد ترحيله برقمه.
        select t.org_id, split_part(t.doc_no, '-', 1), split_part(t.doc_no, '-', 2)::int, split_part(t.doc_no, '-', 3)::int
        from public.transfers t where t.doc_no is not null
      ) as n
      group by n.org_id, n.kind, n.year
    ) as g
    full join (select * from public.doc_counters where kind in ('RC', 'PY', 'TR')) as c on c.org_id = g.org_id and c.kind = g.kind and c.year = g.year
    where g.org_id is null or c.org_id is null or g.items <> g.distinct_no or g.min_no <> 1 or g.max_no <> c.last_no or g.distinct_no <> c.last_no
  ) + (
    select count(*) from public.party_entries e
    where e.reverses_entry_id is null and e.doc_kind is null
      and ((e.kind = 'payment' and (e.doc_no is null or e.doc_no !~ '^RC-')) or (e.kind = 'payout' and (e.doc_no is null or e.doc_no !~ '^PY-'))
        or (e.kind not in ('payment', 'payout') and e.doc_no is not null)
        or (e.doc_no is not null and split_part(e.doc_no, '-', 2) <> to_char(e.on_date, 'YYYY')))
  ) + (
    -- التحويل: المرحَّل (والملغى بعد ترحيله) برقم TR بسنة تاريخه، والمسوّدة والمطويّة بلا رقم.
    select count(*) from public.transfers t
    where (t.posted_at is null and t.doc_no is not null)
      or (t.posted_at is not null and (t.doc_no is null or t.doc_no !~ '^TR-' or split_part(t.doc_no, '-', 2) <> to_char(t.moved_on, 'YYYY')))
  )
  union all
  -- E14: وحدة بيها قيد جهة مختومة بأوّل ترحيل (first_posted_at)، فيوم تشغيلها متجمّد (mark_division_posted بكل دالّة ترحيل).
  select 'posted_division_stamped', count(*) from public.divisions d
  where d.first_posted_at is null
    and exists (select 1 from public.party_entries e join public.ledger_books b on b.org_id = e.org_id and b.id = e.book_id where b.org_id = d.org_id and b.division_id = d.id);

  -- 9. التقارير = المعادلة من الصفوف الخام، لكل منشأة بيها قيود أو حركات، بهويّة مالك حيّ منها (التقرير invoker، والدالّة صاحبة
  --    الجداول فتشوف كل صفوف المنشأة). الهويّة ترجع كما كانت بالآخر. المقارنة is distinct from: مفتاح غايب (NULL) فرق، مو صفر.
  for v_org in select x.org_id from (select org_id from public.party_entries union select org_id from public.cash_moves) as x order by 1 loop
    select m.user_id into v_user from public.members m
    where m.org_id = v_org.org_id and m.role = 'owner' and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
    order by m.created_at, m.id limit 1;
    continue when v_user is null;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    begin
      v_report := public.report_accounts_summary(date '2000-01-01', date '9999-12-31');
      v_cash := public.report_cash_balances(date '2000-01-01', date '9999-12-31');
      v_bad := v_bad + (
        select count(*) from public.divisions d
        left join lateral (
          select coalesce(sum(greatest(s.balance, 0)), 0) as receivable, coalesce(sum(greatest(-s.balance, 0)), 0) as payable
          from (
            select sum(e.amount) as balance from public.party_entries e join public.ledger_books b on b.org_id = e.org_id and b.id = e.book_id
            where e.org_id = d.org_id and b.division_id = d.id group by e.party_id, e.book_id
          ) as s
        ) as raw on true
        left join lateral (
          select x from jsonb_array_elements(v_report -> 'divisions') as x where x ->> 'division_id' = d.id::text
        ) as rep on true
        where d.org_id = v_org.org_id and d.archived_at is null
          and (rep.x is null or (rep.x ->> 'receivable')::numeric is distinct from raw.receivable or (rep.x ->> 'payable')::numeric is distinct from raw.payable)
      ) + (
        select count(*) from public.cash_accounts a
        left join lateral (select x from jsonb_array_elements(v_cash -> 'accounts') as x where x ->> 'account_id' = a.id::text) as rep on true
        where a.org_id = v_org.org_id
          and (rep.x is null or (rep.x ->> 'closing')::numeric is distinct from coalesce((select sum(m.amount) from public.cash_moves m where m.org_id = a.org_id and m.account_id = a.id), 0))
      ) + (
        case when (v_report -> 'project' ->> 'receivable')::numeric is distinct from coalesce((select sum((x ->> 'receivable')::numeric) from jsonb_array_elements(v_report -> 'divisions') as x), 0)
          or (v_report -> 'project' ->> 'payable')::numeric is distinct from coalesce((select sum((x ->> 'payable')::numeric) from jsonb_array_elements(v_report -> 'divisions') as x), 0)
        then 1 else 0 end
      );
    exception when others then
      v_bad := v_bad + 1;
    end;
  end loop;
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  return query select 'report_formulas'::text, v_bad;
end
$$;

grant execute on function public.verify_ledger() to service_role;


-- ─── قائمة السماح (نسختها بـsupabase/tests/allowlist.json) ─────────────────────────────────────────────────────
grant execute on function
  public.post_opening_stock(uuid, integer, uuid),
  public.void_opening_stock(uuid, text, uuid),
  public.preview_opening_stock(uuid),
  public.post_transfer(uuid, integer, text, uuid),
  public.void_transfer(uuid, text, uuid),
  public.preview_transfer(uuid),
  public.discard_draft(text, uuid, integer),
  public.delete_draft_line(text, uuid, integer),
  public.stock_on_hand(uuid, jsonb, integer),
  public.item_lots_qty(uuid, uuid, jsonb, integer),
  public.item_moves_qty(uuid, uuid, bigint, integer),
  public.stock_values(uuid, jsonb, integer),
  public.stock_value_totals(uuid),
  public.item_lots_value(uuid, uuid, jsonb, integer),
  public.archived_stores_with_stock()
to authenticated;

grant execute on function public.verify_stock() to service_role;
