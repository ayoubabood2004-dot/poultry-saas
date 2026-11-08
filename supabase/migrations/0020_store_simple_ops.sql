-- 0020_store_simple_ops — عمليات المخزن البسيطة: حذف المادّة، والشراء بلا سعر و«أكمل السعر»، وتحويل مادّة إلى مادّة، والنقل بخطوة واحدة
--   (كلمة المالك 2026-11-08: «لما اضيف مادة داخل المخزن بعد فترة اريد احذفهن… خلي ادخال السعر اختياري… خلي امكانية التحويل بين احجام
--   المواد… اريد ارسل مواد الى غير احد او غير كمية… ماكو زر يوديني للمبيعات»؛ وأجوبته؛ DECISIONS «حذف المادّة، والرجوع، والسعر الاختياريّ،
--   والتحويل، والبيع»؛ FOUNDATION ٩٩، ١٤١، ٤٣٧، ٤٧٤–٤٧٧، ٥٥٢، ٥٥٤).
-- المشكلة: لا حذف لمادّة أُضيفت خطأً؛ والشراء لا يُحفظ بلا سعر فيتأخّر دخول البضاعة؛ ولا طريق لتحويل مادّة إلى مادّة (الذرة إلى «مخلوط»، الأكياس
--   إلى سائب) بلا خلطة معمل؛ والنقل بين المخازن ورقة مسوّدة ومعاينة؛ وملفّ المادّة لا يقول أين هي ولا ما يُفعل بها.
-- هنا:
--   • فعل sale.record (البيع، لأدوار purchase.record نفسها: المالك والمدير والمحاسب والأمين؛ مرآته src/domain/permissions.ts)، يُستعمل من
--     0021 وتقرؤه can_sell في ملفّ المادّة من الآن.
--   • public.delete_item (stores.manage): المادّة ووحداتها وسعرها تُحذف حين لا يشير إليها شيء آخر (كلّ مفتاح أجنبيّ إلى items في الكتالوج،
--     فالجدول الجديد يدخل وحده)، وإلّا item_in_use يسمّي أوّل أنواع الاستعمال و«أخفِها بدلاً من ذلك». لا تُحذف حركة مخزون ولا صفّ مال أبداً.
--   • الشراء بلا سعر: record_purchase يقبل p_unit_price فارغاً — الكمية تدخل المخزن الآن بقيمة صفر، ولا قيد للمورّد، وسطر الشراء «بلا سعر»
--     (purchase_prices.unit_price فارغ ومبلغ السطر صفر بسببه)؛ والدفع بالدين وحده (price_required_for_cash). وpublic.price_purchase
--     (purchase.record، «أكمل السعر») يكتب السعر بنداء واحد على نواة تصحيح السعر في 0010 نفسها (revalue_plan): حصّة المتبقّي ترفع الدفعة
--     ومراياها، وحصّة ما صُرف قبل التسعير مصروف «فرق سعر شراء»، وقيد purchase للمورّد = −المبلغ بدفتر الشراء بيوم التسعير؛ وصفّ التصحيح
--     يحفظ سعر الوحدة كما كُتب (receipt_revaluations.unit_price)، وإلغاؤه (void_receipt_revalue القائمة) يُرجع الشراء «بلا سعر».
--   • تحويل مادّة إلى مادّة: stock_conversions، وpublic.record_conversion (stock_use.post) تسحب الأولى بترتيب السحب (القواعد ١٢–١٤) وتُنشئ
--     دفعة واحدة من الثانية قيمتها قيمة السحب بالضبط (الكمية قد تختلف: 20 كيساً ← 1,000 كغم)، ورقمها CV، ونوع حركتها conversion؛
--     وpublic.void_conversion تعكس (lot_consumed إن صُرف من الدفعة الجديدة).
--   • النقل بخطوة واحدة: public.record_transfer على جسم ترحيل التحويل القائم نفسه (private.post_transfer_core، وpost_transfer = الفعل
--     والمرجع والجسم بفحص بصمته كما كان)، بالجداول نفسها ودفعات المرآة نفسها، ويُلغى بـvoid_transfer القائمة.
--   • ملفّ المادّة يزيد can_delete وuses وcan_convert وcan_transfer وcan_sell وstores (أين المادّة وكم في كلّ مخزن) وpriced لكلّ شراء
--     وunpriced_count وcan_price؛ وبطاقات المواد تزيد unpriced_count؛ والمتوسّط وآخر سعر من المسعَّر وحده.
--   • الثوابت: verify_purchases (الشراء بلا سعر مبلغه صفر بسببه، والتسعير يطابق سعره، ولا مرتجع من شراء وهو بلا سعر)، وverify_stock (ترتيب سحب
--     التحويل، وقيد التسعير purchase)، وverify_store_ops (التحويل = حركاته ودفعته).
--   • مراجعة 0020 (المنسّق 2026-11-08): المرتجع من شراء بلا سعر يُرفض في الترحيل والمعاينة (unpriced_line)، والتسعير يرفض شراءً أُرجع منه وهو بلا سعر
--     (returned_before_pricing، دفاعيّ)؛ وقيد شراء الاستلام لشراء سُعِّر لاحقاً قيد تسعيره (التصحيح والمرتجع بعده يتوزّعان عليه)؛ و«أكمل السعر» في الملفّ
--     بنطاق مخازن الشراء كلّها وتلميح التسعير بكلماته؛ ومادّة حُذفت بلحظة قفل المواد item_not_found؛ وغموض مخزن المصدر في التحويل from_store_required
--     (store_required للمستلم وحده).
-- انحرافات مكتوبة (قرارات بلا سؤال داخل الخطوط الحمر، والعقد scratchpad/simple/contract-0020.md):
--   • التحويل بفعل stock_use.post (الأمين والمدير والمالك): فعل «يُخرج من المخزن» القائم لأدوار المخزن نفسها، بلا فعل جديد ولا تغيير جدول
--     الصلاحيات؛ والمخزنان بنطاق الكاتب. والمخزن الهدف إن لم يُختر: مخزن المصدر إن قبل الثانية (تغيير التعبئة في مخزنه)، وإلّا المخزن
--     الوحيد بالنطاق من أنواع استلامها، وإلّا store_required. والمعدود (بيض التفقيس والأفراخ وبيض المائدة) لا يُحوَّل (not_convertible)،
--     ولا يُحوَّل إلى مادّة تتابع تاريخ الانتهاء (conversion_expiry): الدفعة الجديدة بلا تاريخ.
--   • التسعير بلا معاينة ولا بصمة (المستخدم يكتب سعراً فقط)، ويُسمح والدفعة لم يُسحب منها شيء (التصحيح يرفضه not_drawn)؛ والتصحيح العاديّ
--     (post_receipt_revalue) يرفض سطراً بلا سعر (unpriced_line) فالتسعير من «أكمل السعر» وحده؛ وقيد التسعير بالدين، والدفع بعده من كشف المورّد.
--   • النقل بلا معاينة (المستخدم يوافق على كمية فقط)، والمخزن المرسِل إن لم يُختر هو الوحيد بالنطاق الذي فيه من المادّة متاح بالتاريخ.
--   • الإعادة بالمعرّف (التحويل والنقل) تحت قفل استشاريّ لمعرّف المستند، مثل 0019.
-- تراجع: rollback_0020.sql — يرجّع أجسام private.actions وprivate.role_can وrecord_purchase وprivate.purchase_result وitem_file
--   وitems_overview وverify_purchases (كما في 0017) وpost_receipt_revalue وpost_supplier_return وpreview_supplier_return وprivate.receipt_purchase_entry
--   (0010) وpost_transfer وprivate.lock_masters (0007) وverify_stock وstock_doc_memo
--   وstock_doc_label (0019) حرفاً بحرف، والقيود كما كانت، ويُسقط الجديد. **طريق رفض**: شراء بلا سعر (purchase_prices.unit_price فارغ، ومنه
--   كلّ شراء أُكمل سعره لاحقاً)، أو أيّ تحويل مادّة، يوقف التراجع بصوت بلا أن يحذف شيئاً.
-- تنعاد بأمان: create table if not exists، وadd column if not exists، وcreate or replace، وكتل do تفحص الكتالوج قبل القيود والسياسات.

set lock_timeout = '5s';

-- ─── أ. فعل «يبيع» (للبيع في 0021، ولـcan_sell من الآن) ───────────────────────────────────────────────────────────
create or replace function private.actions() returns text[]
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select array[
    'receipt.draft', 'transfer.post', 'issue.post', 'count.enter', 'stock_use.post',
    'receipt.amounts', 'costs.load', 'sale.post', 'payment.post', 'sale_return.post', 'expense.post', 'accounts.view',
    'production.draft', 'production.post',
    'hatch.operate',
    'flock_day.save', 'weigh_ticket.draft',
    'recipe.activate', 'count.approve', 'flock.manage', 'flock.transfer', 'hatch.zero_saleable', 'expired.destroy',
    'expired.release', 'void', 'receipt.revalue', 'party.adjust', 'opening.post', 'period.lock',
    'party.offset', 'members.manage', 'period.unlock',
    'stores.manage', 'parties.manage', 'party.create', 'cash_accounts.manage', 'expense_categories.manage',
    'item.create',
    'purchase.record',
    'sale.record',
    'read'
  ]
$$;

create or replace function private.role_can(p_role text, p_action text, p_costs_confirmed boolean default false) returns boolean
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
begin
  if p_action is null or not (p_action = any (private.actions())) then
    raise exception 'unknown_action' using hint = case
      when p_action is null then 'لم يُحدَّد الإجراء.'
      else format('الإجراء «%s» غير معروف.', p_action)
    end;
  end if;
  if p_role is null then return false; end if;
  if p_role = 'owner' then return true; end if;
  if p_action in ('party.offset', 'members.manage', 'period.unlock') then return false; end if;
  if p_action = 'read' then return true; end if;
  -- «يضيف مادّة» (قرار المالك 2026-11-02): أمين المخزن يضيف مادّة ووحدتها، ومن يملك إدارة المخازن يملكها أيضاً (المالك والمدير).
  -- القاعدة مكتوبة مرّة واحدة هنا، فلا تتفرّق إذا تغيّر جدول الأدوار؛ والتعديل والأرشفة تبقى stores.manage.
  if p_action = 'item.create' then
    return p_role = 'storekeeper' or private.role_can(p_role, 'stores.manage', p_costs_confirmed);
  end if;
  -- «يسجّل الشراء» (قرار المالك 2026-11-06): الكمية والسعر معاً ويُحفظ فوراً، للمحاسب والأمين (والمدير بكلّ الأفعال، والمالك كلّها).
  -- «يبيع» (قرار المالك 2026-11-08، 0020): لأدوار «يسجّل الشراء» نفسها.
  return case p_role
    when 'manager' then true
    when 'accountant' then p_action in ('receipt.amounts', 'costs.load', 'production.post', 'sale.post', 'payment.post', 'sale_return.post', 'expense.post', 'accounts.view',
      'parties.manage', 'party.create', 'cash_accounts.manage', 'expense_categories.manage', 'purchase.record',
      'sale.record')
    when 'storekeeper' then p_action in ('receipt.draft', 'transfer.post', 'issue.post', 'count.enter', 'stock_use.post', 'party.create', 'purchase.record', 'sale.record')
    when 'mill_operator' then p_action = 'production.draft' or (p_action = 'production.post' and coalesce(p_costs_confirmed, false))
    when 'hatchery_operator' then p_action = 'hatch.operate'
    when 'hall_worker' then p_action in ('flock_day.save', 'weigh_ticket.draft')
    else false
  end;
end
$$;

-- ─── ب. القيود: سعر الشراء اختياريّ، وسعر التسعير على صفّ التصحيح، ونوع مستند التحويل ورقمه ─────────────────────────────────
alter table public.purchase_prices alter column unit_price drop not null;
alter table public.receipt_revaluations add column if not exists unit_price numeric;
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'purchase_prices_unit_price_check' and conrelid = 'public.purchase_prices'::regclass
    and pg_get_constraintdef(oid) not like '%IS NULL%') then
    alter table public.purchase_prices drop constraint purchase_prices_unit_price_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'purchase_prices_unit_price_check' and conrelid = 'public.purchase_prices'::regclass) then
    -- فارغ = شراء بلا سعر (يُكمَّل بـprice_purchase)، وإلّا السعر كما كتبه المستخدم.
    alter table public.purchase_prices add constraint purchase_prices_unit_price_check
      check (unit_price is null or (abs(unit_price) < 'Infinity' and unit_price > 0 and unit_price = round(unit_price, 2)));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'receipt_revaluations_unit_price_check' and conrelid = 'public.receipt_revaluations'::regclass) then
    -- سعر الوحدة كما كُتب في «أكمل السعر» (تصحيح من صفر)، وفارغ لتصحيح السعر العاديّ.
    alter table public.receipt_revaluations add constraint receipt_revaluations_unit_price_check
      check (unit_price is null or (abs(unit_price) < 'Infinity' and unit_price > 0 and unit_price = round(unit_price, 2) and old_total = 0));
  end if;
  if exists (select 1 from pg_constraint where conname = 'stock_lots_source_kind_check' and conrelid = 'public.stock_lots'::regclass
    and pg_get_constraintdef(oid) not like '%conversion%') then
    alter table public.stock_lots drop constraint stock_lots_source_kind_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_lots_source_kind_check' and conrelid = 'public.stock_lots'::regclass) then
    alter table public.stock_lots add constraint stock_lots_source_kind_check
      check (source_kind in ('opening', 'receipt', 'transfer', 'count_gain', 'production', 'conversion'));
  end if;
  if exists (select 1 from pg_constraint where conname = 'stock_moves_doc_kind_check' and conrelid = 'public.stock_moves'::regclass
    and pg_get_constraintdef(oid) not like '%conversion%') then
    alter table public.stock_moves drop constraint stock_moves_doc_kind_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_moves_doc_kind_check' and conrelid = 'public.stock_moves'::regclass) then
    alter table public.stock_moves add constraint stock_moves_doc_kind_check
      check (doc_kind in ('opening', 'receipt', 'supplier_return', 'receipt_revalue', 'transfer', 'count', 'stock_use', 'production', 'flock_issue', 'conversion'));
  end if;
  if exists (select 1 from pg_constraint where conname = 'doc_counters_kind_check' and conrelid = 'public.doc_counters'::regclass
    and pg_get_constraintdef(oid) not like '%CV%') then
    alter table public.doc_counters drop constraint doc_counters_kind_check;
    alter table public.doc_counters add constraint doc_counters_kind_check
      check (kind in ('PU', 'RT', 'TR', 'CT', 'SU', 'RC', 'PY', 'OF', 'PD', 'FI', 'CV'));
  end if;
end
$$;

-- ─── ج. تحويل مادّة إلى مادّة (المستند؛ القيم على الدفعات والحركات بسياسة الكلفة) ──────────────────────────────────────────
-- مرحَّل فوراً (posted ← void): المادّة الأولى بكميتها من مخزنها، والثانية بكميتها إلى مخزنها، ولقطة وحدة الأساس لكلّ منهما.
create table if not exists public.stock_conversions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  doc_no text not null,
  from_item_id uuid not null,
  from_warehouse_id uuid not null,
  from_qty numeric not null,
  from_unit text not null,
  to_item_id uuid not null,
  to_warehouse_id uuid not null,
  to_qty numeric not null,
  to_unit text not null,
  converted_on date not null,
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
  constraint stock_conversions_doc_no_check check (doc_no ~ '^CV-[0-9]{4}-[0-9]{4,}$'),
  constraint stock_conversions_from_qty_check check (abs(from_qty) < 'Infinity' and from_qty > 0 and from_qty = round(from_qty, 3)
    and (from_unit <> 'pc' or from_qty = trunc(from_qty))),
  constraint stock_conversions_to_qty_check check (abs(to_qty) < 'Infinity' and to_qty > 0 and to_qty = round(to_qty, 3)
    and (to_unit <> 'pc' or to_qty = trunc(to_qty))),
  constraint stock_conversions_units_check check (from_unit in ('kg', 'L', 'pc') and to_unit in ('kg', 'L', 'pc')),
  constraint stock_conversions_items_check check (from_item_id <> to_item_id),
  constraint stock_conversions_status_check check (status in ('posted', 'void')),
  constraint stock_conversions_void_check check ((status = 'void') = (voided_at is not null) and (voided_at is null) = (void_reason is null)),
  constraint stock_conversions_void_reason_check check (void_reason is null or length(btrim(void_reason)) between 1 and 500),
  constraint stock_conversions_version_check check (version >= 1),
  unique (org_id, id),
  unique (org_id, doc_no),
  foreign key (org_id, from_item_id) references public.items (org_id, id),
  foreign key (org_id, to_item_id) references public.items (org_id, id),
  foreign key (org_id, from_warehouse_id) references public.warehouses (org_id, id),
  foreign key (org_id, to_warehouse_id) references public.warehouses (org_id, id)
);
create index if not exists stock_conversions_from_item on public.stock_conversions (org_id, from_item_id);
create index if not exists stock_conversions_to_item on public.stock_conversions (org_id, to_item_id);
create index if not exists stock_conversions_from_wh on public.stock_conversions (org_id, from_warehouse_id);
create index if not exists stock_conversions_to_wh on public.stock_conversions (org_id, to_warehouse_id);

create or replace trigger audit_stock_conversions after insert or update or delete on public.stock_conversions
  for each row execute function private.audit_row();
alter table public.stock_conversions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'stock_conversions' and policyname = 'stock_conversions_read') then
    create policy stock_conversions_read on public.stock_conversions for select to authenticated
      using (org_id = (select public.auth_org()) and ((select public.in_scope_wh(from_warehouse_id)) or (select public.in_scope_wh(to_warehouse_id))));
  end if;
  -- سجلّ التدقيق يحمل الصفّ كلّه (E49): التحويل بأيّ من مخزنيه، مثل سياسة الجدول.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'audit_log_conversion_scope') then
    create policy audit_log_conversion_scope on public.audit_log as restrictive for select to authenticated
      using (case
        when table_name = 'stock_conversions'
          then public.in_scope_wh((coalesce("new", "old") ->> 'from_warehouse_id')::uuid) or public.in_scope_wh((coalesce("new", "old") ->> 'to_warehouse_id')::uuid)
        else true
      end);
  end if;
end
$$;

revoke all on table public.stock_conversions from anon, authenticated;
grant select on table public.stock_conversions to authenticated;
revoke truncate on table public.stock_conversions from service_role;

-- بيان الحركة (0019 كما هو، ويّا التحويل: «تحويل «ذرة» إلى «مخلوط»» على الطرفين، والاتّجاه من إشارة الكمية).
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
    else p_kind
  end
$$;

-- اسم المستند (0019 كما هو، ويّا رقم التحويل).
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
    else p_kind
  end
$$;

-- ─── د. حذف المادّة ──────────────────────────────────────────────────────────────────────────────────────────────
-- أنواع استعمال المادّة: كلّ مفتاح أجنبيّ إلى items من أيّ جدول (عدا وحداتها وسعرها، يُحذفان معها) فيه صفّ لها، باسم نوعه بكلمات المالك،
-- بلا تكرار وبترتيب الجدول. فارغة = لا يشير إليها شيء. الجدول الجديد (المبيعات 0021) يدخل وحده باسم عامّ إن لم يُسمَّ هنا.
create or replace function private.item_uses(p_item uuid) returns text[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  r record;
  v_found boolean;
  v_label text;
  v_uses text[] := '{}';
begin
  for r in
    select cl.relname as tbl, format('%I.%I', ns.nspname, cl.relname) as qualified,
      (select a.attname from unnest(c.conkey, c.confkey) as k(col, ref)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.col
        join pg_attribute b on b.attrelid = c.confrelid and b.attnum = k.ref where b.attname = 'id') as id_col,
      (select a.attname from unnest(c.conkey, c.confkey) as k(col, ref)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.col
        join pg_attribute b on b.attrelid = c.confrelid and b.attnum = k.ref where b.attname = 'org_id') as org_col
    from pg_constraint c join pg_class cl on cl.oid = c.conrelid join pg_namespace ns on ns.oid = cl.relnamespace
    where c.contype = 'f' and c.confrelid = 'public.items'::regclass and cl.relname not in ('item_units', 'item_prices')
    order by cl.relname, c.conname
  loop
    continue when r.id_col is null;
    execute format('select exists (select 1 from %s x where %s x.%I = $2)', r.qualified,
      case when r.org_col is null then '' else format('x.%I = $1 and', r.org_col) end, r.id_col) into v_found using v_org, p_item;
    continue when not coalesce(v_found, false);
    v_label := case r.tbl
      when 'receipt_lines' then 'لها مشتريات'
      when 'purchase_prices' then 'لها مشتريات'
      when 'stock_lots' then 'لها حركات مخزون'
      when 'stock_moves' then 'لها حركات مخزون'
      when 'stock_balances' then 'لها حركات مخزون'
      when 'opening_lines' then 'في رصيد افتتاحي'
      when 'transfer_lines' then 'في نقل بين المخازن'
      when 'stock_use_lines' then 'في صرف'
      when 'stock_count_lines' then 'في جرد'
      when 'supplier_return_lines' then 'في مرتجع إلى مورّد'
      when 'recipes' then 'ناتج خلطة'
      when 'recipe_lines' then 'في خلطة'
      when 'production_batches' then 'في دفعة إنتاج'
      when 'production_inputs' then 'في دفعة إنتاج'
      when 'flock_issue_lines' then 'في صرف لقاعة'
      when 'stock_conversions' then 'في تحويل مادّة'
      when 'sales_lines' then 'لها مبيعات'
      else 'في مستند آخر'
    end;
    if not (v_label = any (v_uses)) then
      v_uses := v_uses || v_label;
    end if;
  end loop;
  return v_uses;
end
$$;

-- الحذف (stores.manage): المادّة بنسختها، ووحداتها وسعرها معها، حين لا يشير إليها شيء؛ وإلّا item_in_use و«أخفِها». قفل صفّ المادّة
-- أوّلاً (for update): مستند يكتب سطراً لها بلحظة الحذف ينتظر (مفتاحه الأجنبيّ يقفلها للمشاركة) ثمّ يرى أنّها حُذفت، أو يراه الحذف.
create or replace function public.delete_item(p_item uuid, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  i public.items;
  v_uses text[];
begin
  set local lock_timeout = '5s';
  perform private.require('stores.manage');
  select * into i from public.items x where x.org_id = v_org and x.id = p_item for update;
  if i.id is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك، أو حُذفت من قبل. حدّث الشاشة.';
  end if;
  if p_expected_version is null or i.version <> p_expected_version then
    raise exception 'stale_item' using hint = format('تغيّرت «%s» من نافذة أو جهاز آخر بعد أن فتحتها. حدّث الشاشة ثمّ أعد المحاولة.', i.name);
  end if;
  v_uses := private.item_uses(i.id);
  if cardinality(v_uses) > 0 then
    raise exception 'item_in_use' using hint = format('«%s» %s، فلا تُحذف حتى لا يضيع سجلّها. أخفِها بدلاً من ذلك: تختفي من القوائم ويبقى سجلّها.',
      i.name, array_to_string(v_uses[1:3], '، '));
  end if;
  delete from public.item_units where org_id = v_org and item_id = i.id;
  delete from public.item_prices where org_id = v_org and item_id = i.id;
  delete from public.items where org_id = v_org and id = i.id;
  return jsonb_build_object('id', i.id, 'name', i.name, 'deleted', true);
end
$$;

-- ─── هـ. الشراء بلا سعر ───────────────────────────────────────────────────────────────────────────────────────────
-- سطر الشراء «بلا سعر»: له صفّ سعر بلا سعر وحدة، ولا تسعير مرحَّل عليه. التسعير اللاحق (أو تصحيح قديم) يجعله مسعَّراً.
create or replace function private.purchase_unpriced(p_line uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.purchase_prices pp where pp.org_id = public.auth_org() and pp.line_id = p_line and pp.unit_price is null)
    and not exists (select 1 from public.receipt_revaluations v where v.org_id = public.auth_org() and v.receipt_line_id = p_line and v.status = 'posted')
$$;

-- نتيجة الشراء من صفوفه (0017، ويّا priced وسعر الوحدة والمبلغ الحاليّين: التسعير المرحَّل إن وُجد).
create or replace function private.purchase_result(p_doc uuid, p_line uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', r.id, 'doc_no', r.doc_no, 'line_id', x.id, 'lot_id', l.id, 'item_id', x.item_id,
    'warehouse_id', r.warehouse_id, 'warehouse_name', w.name, 'received_on', r.received_on, 'qty', x.qty_in_unit::text,
    'payment', case when coalesce(a.paid_now, 0) > 0 then 'cash' else 'credit' end,
    'party_id', r.party_id, 'party_name', t.name, 'priced', not private.purchase_unpriced(x.id),
    'money', jsonb_build_object('unit_price', coalesce(pp.unit_price, rv.unit_price)::text,
      'line_total', case when pp.unit_price is not null then la.line_total else coalesce(rv.new_total, 0) end::text, 'sell_price', pp.sell_price::text,
      'paid_now', coalesce(a.paid_now, 0)::text))
  from public.receipts r
  join public.receipt_lines x on x.org_id = r.org_id and x.doc_id = r.id and x.id = p_line
  join public.purchase_prices pp on pp.org_id = x.org_id and pp.line_id = x.id
  join public.receipt_line_amounts la on la.org_id = x.org_id and la.line_id = x.id
  join public.warehouses w on w.org_id = r.org_id and w.id = r.warehouse_id
  join public.parties t on t.org_id = r.org_id and t.id = r.party_id
  left join public.receipt_amounts a on a.org_id = r.org_id and a.doc_id = r.id
  left join public.stock_lots l on l.org_id = x.org_id and l.source_kind = 'receipt' and l.source_id = r.id and l.source_line_id = x.id
    and l.origin_lot_id is null
  left join lateral (
    select v.new_total, v.unit_price from public.receipt_revaluations v
    where v.org_id = x.org_id and v.receipt_line_id = x.id and v.status = 'posted' and v.unit_price is not null order by v.rev_no desc limit 1
  ) as rv on true
  where r.org_id = public.auth_org() and r.id = p_doc
$$;

create or replace function public.record_purchase(p_client_ref uuid, p_receipt_id uuid, p_line_id uuid, p_item uuid, p_party uuid,
  p_received_on date, p_qty numeric, p_unit_price numeric, p_sell_price numeric, p_payment text, p_cash_account uuid, p_warehouse uuid,
  p_expiry_on date default null, p_born_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'record_purchase';
  v_org uuid := public.auth_org();
  v_cached jsonb;
  v_result jsonb;
  i public.items;
  w public.warehouses;
  p public.parties;
  b public.ledger_books;
  r public.receipts;
  v_kinds text[];
  v_count int;
  v_names text;
  v_total numeric;
  v_paid numeric;
  v_version int;
  v_same boolean;
  v_posted_at timestamptz;
begin
  set local lock_timeout = '5s';
  perform private.require('purchase.record');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('receipt', p_receipt_id, 'line', p_line_id, 'item', p_item,
    'party', p_party, 'on', p_received_on, 'qty', p_qty, 'price', p_unit_price, 'sell', p_sell_price, 'payment', p_payment,
    'box', p_cash_account, 'warehouse', p_warehouse, 'expiry', p_expiry_on, 'born', p_born_at));
  if v_cached is not null then
    -- شراء حُفظ ثمّ أُلغي (مراجعة 0017 الأولى L6): الإعادة لا تقول «حُفظ» بنتيجته القديمة، بل تعارض يسمّي الإلغاء.
    if exists (select 1 from public.receipts x where x.org_id = v_org and x.id = p_receipt_id and x.status = 'void') then
      raise exception 'id_conflict' using hint = 'حُفظ هذا الشراء من قبل ثمّ أُلغي. افتح ملفّ المادّة وسجّل شراءً جديداً.';
    end if;
    -- ref_claim يقنّع لمن لا يرى الكلفة، ومن يسجّل الشراء يرى سعره (جواب المالك ٢): المخزَّن نفسه بلا قناع.
    select x.result into v_cached from public.rpc_refs x where x.org_id = v_org and x.fn = v_fn and x.client_ref = p_client_ref;
    return v_cached;
  end if;
  if p_receipt_id is null or p_line_id is null or p_item is null or p_party is null then
    raise exception 'id_required' using hint = 'تعذّر الإرسال دون معرّفات الشراء والمادّة والمورّد. حدّث الشاشة وأعد المحاولة.';
  end if;

  -- الإعادة بالمعرّف (جواب ضاع): الاستلام المرحَّل نفسه بسطره وسعره ومحتواه = حُفظ، فنتيجته؛ وغيره تعارض.
  select * into r from public.receipts x where x.id = p_receipt_id;
  if r.id is not null then
    v_same := r.org_id = v_org and r.status = 'posted' and r.created_by is not distinct from auth.uid() and r.party_id = p_party
      and r.received_on = p_received_on and (p_warehouse is null or r.warehouse_id = p_warehouse)
      and exists (
        select 1 from public.receipt_lines x
        join public.purchase_prices pp on pp.org_id = x.org_id and pp.line_id = x.id
        left join public.receipt_amounts a on a.org_id = x.org_id and a.doc_id = x.doc_id
        where x.org_id = r.org_id and x.doc_id = r.id and x.id = p_line_id and x.item_id = p_item and x.qty_in_unit = p_qty
          and x.expiry_on is not distinct from p_expiry_on and x.born_at is not distinct from p_born_at
          and pp.unit_price is not distinct from p_unit_price and pp.sell_price is not distinct from p_sell_price
          and (case when coalesce(a.paid_now, 0) > 0 then 'cash' else 'credit' end) = p_payment
          and a.cash_account_id is not distinct from p_cash_account);
    if coalesce(v_same, false) then
      v_result := private.purchase_result(r.id, p_line_id);
      perform private.ref_store(v_fn, p_client_ref, v_result);
      return v_result;
    end if;
    raise exception 'id_conflict' using hint = case
      when r.org_id = v_org and r.status = 'void' then 'حُفظ هذا الشراء من قبل ثمّ أُلغي. افتح ملفّ المادّة وسجّل شراءً جديداً.'
      else 'حُفظ بهذا المعرّف شراء غير الذي أرسلته الآن. افتح ملفّ المادّة لترى ما حُفظ، ثمّ سجّل من جديد.'
    end;
  end if;
  if exists (select 1 from public.receipt_lines x where x.id = p_line_id) then
    raise exception 'id_conflict' using hint = 'معرّف سطر الشراء مستعمل لاستلام آخر. حدّث الشاشة وأعد المحاولة.';
  end if;

  -- المادّة: موجودة وفعّالة وتُشترى من مورّد.
  select * into i from public.items x where x.org_id = v_org and x.id = p_item;
  if i.id is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if i.archived_at is not null then
    raise exception 'item_archived' using hint = format('المادّة «%s» مؤرشفة، فلا يُسجَّل لها شراء جديد. أعِدها من الأرشيف أوّلاً.', i.name);
  end if;
  v_kinds := private.receiving_kinds(i.kind);
  if cardinality(v_kinds) = 0 then
    raise exception 'not_purchasable' using hint = format('«%s» لا تُشترى من مورّد: تدخل المخزن بالإنتاج أو بالتحويل.', i.name);
  end if;
  -- تاريخ الانتهاء ووقت الفقس بقواعد سطر الاستلام (private.receipt_line_problem، FOUNDATION ٥٥٠، Q5)، والتلميح يسمّي حقل النافذة.
  if i.tracks_expiry and p_expiry_on is null then
    raise exception 'expiry_required' using hint = format('«%s» تتابع تاريخ الانتهاء: اكتب «تاريخ الانتهاء» المكتوب على العبوة.', i.name);
  end if;
  if not i.tracks_expiry and p_expiry_on is not null then
    raise exception 'expiry_not_tracked' using hint = format('«%s» لا تتابع تاريخ الانتهاء؛ اترك «تاريخ الانتهاء» فارغاً.', i.name);
  end if;
  if private.lot_expired(i.tracks_expiry, p_expiry_on, p_received_on) and not public.can('expired.release') then
    raise exception 'expired_on_receipt' using hint = format('«%s» منتهية في %s قبل يوم الشراء %s؛ راجع «تاريخ الانتهاء». المنتهي لا يُشترى إلا بإذن المدير.',
      i.name, to_char(p_expiry_on, 'DD/MM/YYYY'), to_char(p_received_on, 'DD/MM/YYYY'));
  end if;
  if i.kind = 'chick' and p_born_at is null then
    raise exception 'born_at_required' using hint = format('«%s» أفراخ: اكتب «وقت الفقس» باليوم والساعة.', i.name);
  end if;
  if i.kind <> 'chick' and p_born_at is not null then
    raise exception 'born_at_not_chick' using hint = format('«%s» ليست أفراخاً؛ اترك «وقت الفقس» فارغاً.', i.name);
  end if;
  if p_born_at > now() then
    raise exception 'born_at_future' using hint = format('«وقت الفقس» لـ«%s» بعد الآن؛ اكتب وقتاً مضى.', i.name);
  end if;

  -- المخزن: المختار يُفحص، وبلا اختيار فالمخزن الوحيد بنطاق الكاتب من نوع يستلم المادّة.
  if p_warehouse is not null then
    select * into w from public.warehouses x where x.org_id = v_org and x.id = p_warehouse;
    if w.id is null then
      raise exception 'warehouse_not_found' using hint = 'هذا المخزن غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
    end if;
    if w.archived_at is not null then
      raise exception 'warehouse_archived' using hint = format('المخزن «%s» مؤرشف، فلا يُسجَّل فيه شراء جديد. اختر مخزناً آخر.', w.name);
    end if;
    if not public.in_scope_wh(w.id) then
      raise exception 'out_of_scope' using hint = format('المخزن «%s» خارج نطاقك، فلا تسجّل فيه شراءً.', w.name);
    end if;
    if not (w.kind = any (v_kinds)) then
      raise exception 'wrong_receiving_store' using hint = format('«%s» لا تُستلم في «%s»؛ تُستلم في %s.', i.name, w.name, private.store_kinds_label(v_kinds));
    end if;
  else
    select count(*)::int, string_agg(x.name, '، ' order by x.name collate "C", x.id) into v_count, v_names
    from public.warehouses x
    where x.org_id = v_org and x.archived_at is null and x.kind = any (v_kinds) and public.in_scope_wh(x.id);
    if v_count = 0 then
      raise exception 'no_receiving_store' using hint = case
        when exists (select 1 from public.warehouses x where x.org_id = v_org and x.archived_at is null and x.kind = any (v_kinds))
          then format('«%s» تُستلم في %s، ولا مخزن من هذا النوع في نطاقك. اطلب من مالك المنشأة أن يضيفه إلى نطاقك.', i.name, private.store_kinds_label(v_kinds))
        else format('لا يوجد %s يستلم «%s». أضفه من «إعداد المخزن» ثمّ سجّل الشراء.', private.store_kinds_label(v_kinds), i.name)
      end;
    end if;
    if v_count > 1 then
      raise exception 'store_required' using hint = format('«%s» تُستلم في أكثر من مخزن في نطاقك: %s. اختر المخزن.', i.name, v_names);
    end if;
    select * into w from public.warehouses x
    where x.org_id = v_org and x.archived_at is null and x.kind = any (v_kinds) and public.in_scope_wh(x.id);
  end if;
  -- دين المورّد يُكتب في دفتر وحدة المخزن (القاعدة 36)، والكتابة في دفتر تحتاج نطاق وحدته (book_for_post، E49).
  select * into b from public.ledger_books x where x.org_id = v_org and x.id = private.receipt_book(w.id);
  if not public.in_scope_book(b.id) then
    raise exception 'out_of_scope' using hint = format('شراء «%s» في «%s» يُسجَّل ديناً للمورّد في «%s»، وهو خارج نطاقك: نطاقك المخزن دون وحدته. اطلب من مالك المنشأة أن يجعل نطاقك وحدة المخزن.',
      i.name, w.name, b.name);
  end if;

  -- الكمية بوحدة أساس المادّة، والسعر لكلّ وحدة، والمبلغ بالدينار الصحيح (القاعدة 7، التقريب الوحيد نصفاً بعيداً عن الصفر). السعر
  -- اختياريّ (قرار المالك 2026-11-08): بلاه تدخل الكمية الآن بقيمة صفر، والمبلغ صفر بسببه، ويُكمَّل بـprice_purchase.
  if p_qty is null or not (abs(p_qty) < 'Infinity') or p_qty <= 0 or p_qty <> round(p_qty, 3) then
    raise exception 'qty_not_positive' using hint = format('اكتب كمية «%s» أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.', i.name);
  end if;
  if i.base_unit = 'pc' and p_qty <> round(p_qty, 0) then
    raise exception 'pieces_not_whole' using hint = format('«%s» تُعدّ بالقطعة؛ اكتب عدداً صحيحاً من القطع.', i.name);
  end if;
  if p_unit_price is not null and (not (abs(p_unit_price) < 'Infinity') or p_unit_price <= 0 or p_unit_price <> round(p_unit_price, 2)) then
    raise exception 'bad_price' using hint = 'سعر الشراء لكلّ وحدة أكبر من صفر، بمرتبتين عشريتين كحدّ أقصى، أو اتركه فارغاً وأكمله لاحقاً.';
  end if;
  v_total := case when p_unit_price is null then 0 else private._mul_div_round(p_qty, p_unit_price, 1, 0) end;
  if p_unit_price is not null and v_total = 0 then
    raise exception 'total_zero' using hint = 'مجموع الشراء يُقرَّب إلى صفر دينار. راجع الكمية والسعر.';
  end if;
  if p_sell_price is not null and not (abs(p_sell_price) < 'Infinity' and p_sell_price > 0 and p_sell_price = round(p_sell_price, 2)) then
    raise exception 'bad_price' using hint = 'سعر البيع لكلّ وحدة أكبر من صفر، بمرتبتين عشريتين كحدّ أقصى، أو اتركه فارغاً.';
  end if;

  -- الدفع: بالدين على المورّد بلا صندوق، أو نقداً من صندوق بالمبلغ كلّه.
  if p_payment is null or p_payment not in ('credit', 'cash') then
    raise exception 'bad_payment' using hint = 'اختر طريقة الدفع: نقداً من الصندوق أو بالدين على المورّد.';
  end if;
  if p_payment = 'cash' and p_unit_price is null then
    raise exception 'price_required_for_cash' using hint = 'الشراء بلا سعر يُسجَّل بالدين على المورّد؛ اكتب السعر إن دفعت الآن نقداً.';
  end if;
  if p_payment = 'cash' and p_cash_account is null then
    raise exception 'cash_account_required' using hint = 'اختر الصندوق الذي دفعت منه.';
  end if;
  if p_payment = 'credit' and p_cash_account is not null then
    raise exception 'bad_payment' using hint = 'الشراء بالدين على المورّد لا يأخذ صندوقاً؛ اختر «نقداً من الصندوق» إن دفعت الآن.';
  end if;
  v_paid := case when p_payment = 'cash' then v_total else 0 end;

  select * into p from public.parties x where x.org_id = v_org and x.id = p_party;
  if p.id is null then
    raise exception 'party_not_found' using hint = 'هذا المورّد غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if p.archived_at is not null then
    raise exception 'party_archived' using hint = format('المورّد «%s» مؤرشف، فلا يُسجَّل منه شراء جديد. أعِده من الأرشيف أوّلاً.', p.name);
  end if;

  -- الأقفال بترتيب post_receipt (§2.3) قبل أوّل كتابة: الجهة ← قفل الفترة وصفّ الوحدة (والتاريخ بعدهما) ← المخزن والمادّة ← الرصيد ←
  -- الصندوق. الترحيل بعدها يأخذها نفسها (المعاملة نفسها، فلا انتظار)، والكتابات بينهما تقفل بمفاتيحها الأجنبية صفوفاً مقفولة أقوى.
  perform private.lock_parties(array[p.id]);
  perform private.check_post_date(p_received_on, w.division_id);
  perform private.lock_masters(array[w.id], array[i.id], true);
  perform private.lock_balances(array[i.id], array[w.id]);
  if p_payment = 'cash' then
    perform private.lock_cash_account(p_cash_account, true);
  end if;

  -- الكتابات بعلامة هذا المستند (الحارسان يمرّرانها وحدها)، ثمّ تُمسح قبل الترحيل.
  perform set_config('poultry.purchase_doc', coalesce(private.purchase_marker(p_receipt_id), ''), true);
  insert into public.receipts (id, org_id, party_id, warehouse_id, received_on) values (p_receipt_id, v_org, p.id, w.id, p_received_on);
  insert into public.receipt_lines (id, org_id, doc_id, item_id, qty_in_unit, expiry_on, born_at)
  values (p_line_id, v_org, p_receipt_id, i.id, p_qty, p_expiry_on, p_born_at);
  insert into public.receipt_line_amounts (org_id, line_id, line_total, zero_reason)
  values (v_org, p_line_id, v_total, case when p_unit_price is null then 'بلا سعر: يُكمَّل لاحقاً' end);
  insert into public.receipt_amounts (org_id, doc_id, discount, paid_now, cash_account_id)
  values (v_org, p_receipt_id, 0, v_paid, case when p_payment = 'cash' then p_cash_account end);
  insert into public.purchase_prices (org_id, doc_id, line_id, warehouse_id, item_id, unit_price, sell_price)
  values (v_org, p_receipt_id, p_line_id, w.id, i.id, p_unit_price, p_sell_price);
  perform set_config('poultry.purchase_doc', '', true);

  select x.version into v_version from public.receipts x where x.org_id = v_org and x.id = p_receipt_id;
  perform private.post_receipt_core(p_receipt_id, v_version, p_client_ref);

  -- سعر البيع الحاليّ = سعر أحدث شراء كُتب له سعر (جواب المالك ٣) بتاريخ الشراء ثمّ وقت ترحيله (مراجعة 0017 الأولى L2): شراء مؤرَّخ
  -- قبل شراء مسعَّر أحدث مرحَّل لا يكتب فوقه. القفل الاستشاريّ للمادّة قبل الفحص: شراءان مسعَّران بلحظة واحدة يترتّبان، فيرى الثاني
  -- الأوّل بعد ثباته (فحص بجملة جديدة). سعر الكلفة المكتوب (0016) لا يُمسّ.
  select x.posted_at into v_posted_at from public.receipts x where x.org_id = v_org and x.id = p_receipt_id;
  if p_sell_price is not null then
    perform pg_advisory_xact_lock(hashtextextended('item_sell_price:' || i.id::text, 0));
  end if;
  if p_sell_price is not null and not exists (
    select 1 from public.purchase_prices pp
    join public.receipts y on y.org_id = pp.org_id and y.id = pp.doc_id
    where pp.org_id = v_org and pp.item_id = i.id and pp.sell_price is not null and y.status = 'posted' and y.id <> p_receipt_id
      and (y.received_on > p_received_on or (y.received_on = p_received_on and y.posted_at > v_posted_at))
  ) then
    insert into public.item_prices (org_id, item_id, sell_price) values (v_org, i.id, p_sell_price)
    on conflict (org_id, item_id) do update set sell_price = excluded.sell_price, version = public.item_prices.version + 1
    where public.item_prices.sell_price is distinct from excluded.sell_price;
  end if;

  v_result := private.purchase_result(p_receipt_id, p_line_id);
  perform private.ref_store(v_fn, p_client_ref, v_result);
  return v_result;
end
$$;

-- ─── و. نواة تصحيح السعر (0010) بجسم واحد للتصحيح وللتسعير ───────────────────────────────────────────────────────────
-- جسم post_receipt_revalue كما في 0010 بلا الفعل والمرجع، ويّا التسعير (p_pricing_price: سعر الوحدة كما كُتب في «أكمل السعر»): سطر بلا
-- سعر وحده يُسعَّر (already_priced) والسطر بلا سعر لا يُصحَّح (unpriced_line)، والفحصان بعد قفل دفعات العائلة (التصحيح والتسعير يقفلانها
-- نفسها، فيرى الثاني الأوّل)؛ وللتسعير لا بصمة معاينة ويُقبل والدفعة لم يُسحب منها شيء (not_drawn)، وقيد المورّد purchase لا adjustment.
-- الحساب نفسه (revalue_plan) والكتابة نفسها: حركات التقييم على العائلة، ومصروف «فرق سعر شراء» بالباقي، وقيد يتوزّع على قيد الاستلام أوّلاً.
create or replace function private.revaluation_post(p_line uuid, p_new_total numeric, p_expected_plan text, p_reason text, p_client_ref uuid,
  p_pricing_price numeric) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pricing boolean := p_pricing_price is not null;
  ln public.receipt_lines;
  r public.receipts;
  w public.warehouses;
  e public.party_entries;
  v_id uuid := gen_random_uuid();
  v_plan jsonb;
  v_root uuid;
  v_whs uuid[];
  v_diff numeric;
  v_share numeric;
  v_expense numeric;
  v_expense_id uuid;
  v_category uuid;
  v_rev_no int;
  v_marks jsonb;
  v_unpriced boolean;
  f record;
begin
  set local lock_timeout = '5s';
  select * into ln from public.receipt_lines where org_id = public.auth_org() and id = p_line;
  if ln.id is null then
    raise exception 'line_not_found' using hint = 'سطر الاستلام غير موجود. حدّث الشاشة.';
  end if;
  select * into r from public.receipts where org_id = ln.org_id and id = ln.doc_id;
  w := private.stock_wh(r.warehouse_id, true);
  perform private.book_for_post(r.book_id);
  perform private.lock_parties(array[r.party_id]);
  perform private.check_post_date(public.app_today(), w.division_id);
  select * into r from public.receipts where org_id = ln.org_id and id = ln.doc_id for share;
  if v_pricing and r.status = 'void' then
    raise exception 'purchase_voided' using hint = 'أُلغي هذا الشراء، فلا يُكتب سعره. سجّل شراءً جديداً إن لزم.';
  end if;
  if r.status <> 'posted' then
    raise exception 'receipt_not_posted' using hint = 'يُصحَّح سعر سطر من استلام مرحَّل فقط.';
  end if;
  select l.id into v_root from public.stock_lots l
  where l.org_id = r.org_id and l.source_kind = 'receipt' and l.source_id = r.id and l.source_line_id = ln.id and l.origin_lot_id is null;
  select array_agg(distinct l.warehouse_id) into v_whs from public.stock_lots l where l.org_id = r.org_id and (l.id = v_root or l.origin_lot_id = v_root);
  perform private.lock_masters(v_whs, array[ln.item_id], false);
  perform private.lock_balances(array_fill(ln.item_id, array[cardinality(v_whs)]), v_whs);
  perform 1 from public.stock_lots l where l.org_id = r.org_id and (l.id = v_root or l.origin_lot_id = v_root) order by l.id for no key update;
  v_unpriced := private.purchase_unpriced(ln.id);
  if v_pricing and not v_unpriced then
    raise exception 'already_priced' using hint = 'لهذا الشراء سعر مكتوب من قبل. إن كان خاطئاً فصحّحه من «تصحيح السعر».';
  end if;
  if not v_pricing and v_unpriced then
    raise exception 'unpriced_line' using hint = 'هذا الشراء بلا سعر بعد؛ اكتب سعره من ملفّ المادّة («أكمل السعر»)، ثمّ يُصحَّح إن لزم.';
  end if;
  -- مرتجع من شراء بلا سعر (مراجعة 0020 M1، دفاعيّ: الترحيل يرفضه): المورّد كان سيُحمَّل ثمن المُرجَع بالسعر الذي يُكتب الآن.
  if v_pricing and exists (select 1 from public.supplier_return_lines x join public.supplier_returns s on s.org_id = x.org_id and s.id = x.doc_id
    where x.org_id = r.org_id and x.receipt_line_id = ln.id and s.status = 'posted') then
    raise exception 'returned_before_pricing' using hint = 'أُرجع جزء من هذا الشراء إلى المورّد وهو بلا سعر، فلا يُكتب سعره الآن: ألغِ المرتجع أوّلاً، ثمّ أكمل السعر وأعد الإرجاع.';
  end if;
  select coalesce(jsonb_object_agg(top_seq.warehouse_id, top_seq.seq), '{}'::jsonb) into v_marks
  from (select sm.warehouse_id, max(sm.seq) as seq from public.stock_moves sm
    where sm.org_id = r.org_id and sm.item_id = ln.item_id and sm.warehouse_id = any (v_whs) group by sm.warehouse_id) as top_seq;
  v_plan := private.revalue_plan(ln.id, p_new_total);
  -- مخزن من مخازن الشراء خارج النطاق (مراجعة 0020 L2): تلميح التسعير بكلماته، لا «يمسّها التصحيح».
  if v_pricing and v_plan -> 'problem' ->> 'code' = 'out_of_scope' then
    raise exception 'out_of_scope' using hint = format('جزء من هذا الشراء في «%s»، وهو خارج نطاقك، فلا تكتب سعره: يكمله من نطاقه مخازن الشراء كلّها.',
      (select w2.name from public.stock_lots fl join public.warehouses w2 on w2.org_id = fl.org_id and w2.id = fl.warehouse_id
        where fl.org_id = r.org_id and (fl.id = v_root or fl.origin_lot_id = v_root) and fl.qty_left > 0 and not public.in_scope_wh(fl.warehouse_id)
        order by w2.name collate "C", w2.id limit 1));
  end if;
  if not (v_pricing and v_plan -> 'problem' ->> 'code' = 'not_drawn') then
    perform private.raise_revalue_problem(v_plan -> 'problem');
  end if;
  if not v_pricing and (p_expected_plan is null or p_expected_plan is distinct from v_plan ->> 'plan') then
    raise exception 'stale_preview' using hint = 'تغيّرت دفعات السطر أو مبلغه الحالي بعد المعاينة؛ عاين التصحيح من جديد قبل ترحيله.';
  end if;
  v_diff := (v_plan ->> 'diff')::numeric;
  v_share := (v_plan ->> 'lot_share')::numeric;
  v_expense := v_diff - v_share;
  v_rev_no := coalesce((select max(v.rev_no) from public.receipt_revaluations v where v.org_id = r.org_id and v.receipt_line_id = ln.id), 0) + 1;
  insert into public.receipt_revaluations (id, org_id, receipt_id, warehouse_id, receipt_line_id, rev_no, new_total, old_total, diff, lot_share,
    expense_amount, reason, status, client_ref, marks, unit_price)
  values (v_id, r.org_id, r.id, r.warehouse_id, ln.id, v_rev_no, p_new_total, (v_plan ->> 'current_total')::numeric, v_diff, v_share, v_expense,
    p_reason, 'posted', p_client_ref, v_marks, p_pricing_price);
  for f in select (x.value ->> 'lot_id')::uuid as lot_id, (x.value ->> 'share')::numeric as share from jsonb_array_elements(v_plan -> 'family') as x loop
    continue when f.share = 0;
    perform private.apply_move(f.lot_id, 'receipt_revalue', v_id, ln.id, 0, f.share, public.app_today(), null);
    update public.stock_lots set value_in = value_in + f.share where org_id = r.org_id and id = f.lot_id;
  end loop;
  if v_expense <> 0 then
    select x.id into v_category from public.expense_categories x where x.org_id = r.org_id and x.system_code = 'purchase_price_diff';
    insert into public.expenses (org_id, category_id, division_id, amount, on_date, for_month, source, doc_kind, doc_id)
    values (r.org_id, v_category, w.division_id, v_expense, public.app_today(), date_trunc('month', public.app_today())::date, 'adjustment',
      'receipt_revalue', v_id)
    returning id into v_expense_id;
  end if;
  e := private.write_entry(gen_random_uuid(), r.party_id, r.book_id, case when v_pricing then 'purchase' else 'adjustment' end, -v_diff,
    'receipt_revalue', v_id, r.doc_no, public.app_today(), p_reason);
  perform private.allocate_entry(e.id, private.receipt_purchase_entry(r.id));
  perform private.mark_division_posted(w.division_id);
  update public.receipt_revaluations set party_entry_id = e.id, expense_id = v_expense_id where org_id = r.org_id and id = v_id;
  return jsonb_build_object('id', v_id, 'kind', 'receipt_revalue', 'receipt_id', r.id, 'line_id', ln.id,
    'old_total', v_plan ->> 'current_total', 'new_total', p_new_total::text, 'diff', v_diff::text, 'lot_share', v_share::text,
    'expense_amount', v_expense::text);
end
$$;

-- التصحيح (receipt.revalue، المدير) كما كان: الفعل ثمّ المرجع ثمّ السبب ثمّ الجسم ببصمته.
create or replace function public.post_receipt_revalue(p_line uuid, p_new_total numeric, p_expected_plan text, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'post_receipt_revalue';
  v_cached jsonb;
  v_reason text;
begin
  set local lock_timeout = '5s';
  perform private.require('receipt.revalue');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('line', p_line, 'new_total', p_new_total, 'plan', p_expected_plan, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  return private.ref_store(v_fn, p_client_ref, private.revaluation_post(p_line, p_new_total, p_expected_plan, v_reason, p_client_ref, null));
end
$$;

-- عرض نتيجة التسعير: سعر الوحدة والمبلغ وسعر البيع لمن يسجّل الشراء (جواب المالك ٢ في 0017)، وتوزيع القيمة (valuation) لأدوار الكلفة.
create or replace function private.price_view(p jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.can_see_cost() or p -> 'valuation' is null then p
    else (p - 'valuation') || jsonb_build_object('valuation', private.strip_money(p -> 'valuation')) end
$$;

-- «أكمل السعر» (purchase.record): سعر الوحدة لشراء بلا سعر، بنداء واحد ومرجع client_ref. المبلغ = الكمية × السعر مقرَّباً لأقرب دينار
-- (التقريب الوحيد)، ويُكتب على نواة التصحيح (revaluation_post) بيوم التسعير؛ وسعر البيع إن كُتب يُحفظ لهذا الشراء ويصير الحاليّ إن كان
-- أحدث شراء مسعَّر بتاريخه (قاعدة record_purchase نفسها). الإعادة بالمرجع نفسه ترجع النتيجة المخزَّنة.
create or replace function public.price_purchase(p_client_ref uuid, p_line_id uuid, p_unit_price numeric, p_sell_price numeric default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'price_purchase';
  v_org uuid := public.auth_org();
  v_cached jsonb;
  v_result jsonb;
  v_rev jsonb;
  ln public.receipt_lines;
  r public.receipts;
  pp public.purchase_prices;
  i public.items;
  v_total numeric;
begin
  set local lock_timeout = '5s';
  perform private.require('purchase.record');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('line', p_line_id, 'price', p_unit_price, 'sell', p_sell_price));
  if v_cached is not null then
    select x.result into v_cached from public.rpc_refs x where x.org_id = v_org and x.fn = v_fn and x.client_ref = p_client_ref;
    return private.price_view(v_cached);
  end if;
  if p_line_id is null then
    raise exception 'id_required' using hint = 'تعذّر الإرسال دون معرّف سطر الشراء. حدّث الشاشة وأعد المحاولة.';
  end if;
  select * into ln from public.receipt_lines x where x.org_id = v_org and x.id = p_line_id;
  if ln.id is null then
    raise exception 'line_not_found' using hint = 'سطر الشراء غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  select * into r from public.receipts x where x.org_id = v_org and x.id = ln.doc_id;
  perform private.stock_wh(r.warehouse_id, true);
  select * into i from public.items x where x.org_id = v_org and x.id = ln.item_id;
  select * into pp from public.purchase_prices x where x.org_id = v_org and x.line_id = ln.id;
  if pp.id is null then
    raise exception 'already_priced' using hint = format('شراء «%s» مسجَّل بمبلغه من ورقة الاستلام؛ إن كان خاطئاً فصحّحه من «تصحيح السعر».', i.name);
  end if;
  if r.status = 'void' then
    raise exception 'purchase_voided' using hint = format('أُلغي شراء «%s» هذا، فلا يُكتب سعره. سجّل شراءً جديداً إن لزم.', i.name);
  end if;
  if p_unit_price is null or not (abs(p_unit_price) < 'Infinity') or p_unit_price <= 0 or p_unit_price <> round(p_unit_price, 2) then
    raise exception 'bad_price' using hint = 'سعر الشراء لكلّ وحدة أكبر من صفر، بمرتبتين عشريتين كحدّ أقصى.';
  end if;
  if p_sell_price is not null and not (abs(p_sell_price) < 'Infinity' and p_sell_price > 0 and p_sell_price = round(p_sell_price, 2)) then
    raise exception 'bad_price' using hint = 'سعر البيع لكلّ وحدة أكبر من صفر، بمرتبتين عشريتين كحدّ أقصى، أو اتركه فارغاً.';
  end if;
  v_total := private._mul_div_round(ln.qty_in_unit, p_unit_price, 1, 0);
  if v_total = 0 then
    raise exception 'total_zero' using hint = 'مجموع الشراء يُقرَّب إلى صفر دينار. راجع السعر.';
  end if;
  v_rev := private.revaluation_post(ln.id, v_total, null, format('سعر الشراء %s أُكمل لاحقاً', r.doc_no), p_client_ref, p_unit_price);
  if p_sell_price is not null then
    -- سعر البيع الحاليّ = أحدث شراء بسعر بيع بتاريخه ثمّ وقت ترحيله (قاعدة record_purchase، مراجعة 0017 L2)، تحت قفل المادّة الاستشاريّ.
    perform pg_advisory_xact_lock(hashtextextended('item_sell_price:' || i.id::text, 0));
    update public.purchase_prices set sell_price = p_sell_price where org_id = v_org and id = pp.id;
    if not exists (
      select 1 from public.purchase_prices z
      join public.receipts y on y.org_id = z.org_id and y.id = z.doc_id
      where z.org_id = v_org and z.item_id = i.id and z.sell_price is not null and y.status = 'posted' and y.id <> r.id
        and (y.received_on > r.received_on or (y.received_on = r.received_on and y.posted_at > r.posted_at))
    ) then
      insert into public.item_prices (org_id, item_id, sell_price) values (v_org, i.id, p_sell_price)
      on conflict (org_id, item_id) do update set sell_price = excluded.sell_price, version = public.item_prices.version + 1
      where public.item_prices.sell_price is distinct from excluded.sell_price;
    end if;
  end if;
  v_result := jsonb_build_object('line_id', ln.id, 'receipt_id', r.id, 'doc_no', r.doc_no, 'item_id', i.id, 'item_name', i.name,
    'qty', ln.qty_in_unit::text, 'base_unit', ln.base_unit, 'priced', true, 'revaluation_id', v_rev ->> 'id',
    'used_before_pricing', (v_rev ->> 'expense_amount')::numeric <> 0,
    'money', jsonb_build_object('unit_price', p_unit_price::text, 'line_total', v_total::text,
      'sell_price', (select z.sell_price from public.purchase_prices z where z.org_id = v_org and z.id = pp.id)::text),
    'valuation', jsonb_build_object('money', jsonb_build_object('lot_share', v_rev ->> 'lot_share', 'expense_amount', v_rev ->> 'expense_amount')));
  update public.rpc_refs set result = v_result where org_id = v_org and fn = v_fn and client_ref = p_client_ref;
  return private.price_view(v_result);
end
$$;

-- ─── و٢. مراجعة 0020: المرتجع من شراء بلا سعر، وقيد الشراء المسعَّر لاحقاً، وقفل المواد ─────────────────────────────────────────
-- قيد شراء المورّد لاستلامه (0010 كما هو)، ولشراء سُعِّر لاحقاً (بلا قيد استلام) قيد تسعيره المرحَّل (مراجعة 0020 L1، E16): التصحيح والمرتجع بعده
-- يتوزّعان عليه أوّلاً لا على أقدم قيد للمورّد.
create or replace function private.receipt_purchase_entry(p_receipt uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
  select x.id from public.party_entries x
  join public.receipts r on r.org_id = x.org_id and r.id = x.doc_id
  where x.org_id = public.auth_org() and x.doc_kind = 'receipt' and x.doc_id = p_receipt and x.kind = 'purchase' and x.party_id = r.party_id
    and x.reverses_entry_id is null
    and not exists (select 1 from public.receipt_charges c where c.org_id = x.org_id and c.party_entry_id = x.id)
  order by x.seq limit 1
  ), (
    -- شراء سُعِّر لاحقاً (0020): قيد تسعيره المرحَّل.
    select v.party_entry_id from public.receipt_revaluations v
    where v.org_id = public.auth_org() and v.receipt_id = p_receipt and v.unit_price is not null and v.status = 'posted' and v.party_entry_id is not null
    order by v.rev_no desc limit 1
  ))
$$;

-- ترحيل المرتجع (0010 كما هو، ويّا رفض سطر من شراء بلا سعر بعد قفل الدفعات، مراجعة 0020 M1): قيمة دفعته صفر، فالمورّد كان يُحمَّل ثمن المُرجَع
-- حين يُكتب السعر (والمصروف «فرق سعر شراء» بقيمة ما أُرجع).
create or replace function public.post_supplier_return(p_id uuid, p_expected_version int, p_expected_plan text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'post_supplier_return';
  v_cached jsonb;
  d public.supplier_returns;
  r public.receipts;
  w public.warehouses;
  ln public.supplier_return_lines;
  l public.stock_lots;
  e public.party_entries;
  v_date date;
  v_items uuid[];
  v_item text;
  v_credit numeric;
  v_value numeric;
  v_credit_total numeric := 0;
  v_value_total numeric := 0;
  v_no text;
  v_category uuid;
  v_lines jsonb := '[]'::jsonb;
  v_plan text := '';
begin
  set local lock_timeout = '5s';
  perform private.require('receipt.amounts');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'version', p_expected_version, 'plan', p_expected_plan));
  if v_cached is not null then
    return v_cached;
  end if;
  select * into d from public.supplier_returns where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(d.warehouse_id, true);
  perform private.book_for_post(d.book_id);
  perform private.lock_parties(array[d.party_id]);
  v_date := d.returned_on;
  perform private.check_post_date(v_date, w.division_id);
  perform private.lock_return_rows(d.id);
  select * into d from public.supplier_returns where org_id = w.org_id and id = p_id for update;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'هذا المستند ليس مسوّدة: رُحّل أو أُلغي من قبل.';
  end if;
  if p_expected_version is null or d.version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّرت المسوّدة بعد المعاينة. راجعها وعاينها من جديد قبل الترحيل.';
  end if;
  if d.returned_on is distinct from v_date then
    raise exception 'stale_draft' using hint = 'تغيّر تاريخ المرتجع أثناء الترحيل. راجعه وعاينه من جديد.';
  end if;
  select * into r from public.receipts where org_id = d.org_id and id = d.receipt_id for share;
  if r.status <> 'posted' then
    raise exception 'receipt_not_posted' using hint = 'الاستلام ليس مرحَّلاً (مسوّدة أو ملغى)، فلا يُرجَع منه شيء.';
  end if;
  if d.returned_on < r.received_on then
    raise exception 'return_before_receipt' using hint = format('تاريخ المرتجع %s قبل استلام البضاعة %s؛ اكتب يوم الإرجاع الصحيح.',
      to_char(d.returned_on, 'DD/MM/YYYY'), to_char(r.received_on, 'DD/MM/YYYY'));
  end if;
  select array_agg(distinct x.item_id) into v_items from public.supplier_return_lines x where x.org_id = d.org_id and x.doc_id = d.id;
  if v_items is null then
    raise exception 'return_empty' using hint = 'المرتجع بلا سطور. أضف سطراً واحداً على الأقلّ.';
  end if;
  perform private.lock_masters(array[w.id], v_items, false);
  perform private.lock_balances(v_items, array_fill(w.id, array[cardinality(v_items)]));
  perform 1 from public.stock_lots x
  where x.org_id = d.org_id and x.id in (select y.lot_id from public.supplier_return_lines y where y.org_id = d.org_id and y.doc_id = d.id)
  order by x.id for no key update;
  -- مرتجع من شراء بلا سعر (مراجعة 0020 M1): بعد قفل الدفعات، والتسعير يقفلها نفسها فيرى أحدهما الآخر.
  for ln in select * from public.supplier_return_lines x where x.org_id = d.org_id and x.doc_id = d.id order by x.line_no loop
    if private.purchase_unpriced(ln.receipt_line_id) then
      select i.name into v_item from public.items i where i.org_id = ln.org_id and i.id = ln.item_id;
      raise exception 'unpriced_line' using hint = format('شراء «%s» هذا بلا سعر بعد: أكمل سعر الشراء أوّلاً، ثمّ أرجِع للمورّد.', v_item);
    end if;
  end loop;
  select x.id into v_category from public.expense_categories x where x.org_id = d.org_id and x.system_code = 'supplier_return_diff';
  for ln in select * from public.supplier_return_lines x where x.org_id = d.org_id and x.doc_id = d.id order by x.line_no loop
    select a.credit_amount into v_credit from public.supplier_return_line_amounts a where a.org_id = ln.org_id and a.line_id = ln.id;
    if v_credit is null then
      select i.name into v_item from public.items i where i.org_id = ln.org_id and i.id = ln.item_id;
      raise exception 'credit_required' using hint = format('اكتب المبلغ الذي قبله المورّد لسطر «%s» (صفر إن لم يقبل شيئاً).', v_item);
    end if;
    select * into l from public.stock_lots where org_id = ln.org_id and id = ln.lot_id;
    if l.qty_left < ln.qty_base then
      raise exception 'insufficient_stock' using hint = format('لا يكفي المتبقّي من دفعة الاستلام لهذا المرتجع: %s', private.return_shortage_detail(l.id, ln.qty_base));
    end if;
    v_value := case when ln.qty_base = l.qty_left then l.value_left else private._mul_div_round2(ln.qty_base, l.value_left, l.qty_left) end;
    v_plan := v_plan || ln.id::text || '|' || private.plan_piece(l.id, l.qty_left, l.value_left) || '|' || private.plan_piece(l.id, ln.qty_base, v_value) || '/';
    perform private.apply_move(l.id, 'supplier_return', d.id, ln.id, -ln.qty_base, -v_value, d.returned_on, null, false);
    v_credit_total := v_credit_total + v_credit;
    v_value_total := v_value_total + v_value;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('line_id', ln.id, 'lot_id', l.id, 'item_id', ln.item_id, 'qty', ln.qty_base::text,
      'money', jsonb_build_object('value', v_value::text, 'credit', v_credit::text)));
  end loop;
  -- قيمة السحب = اللي شافها المحاسب بالمعاينة (FOUNDATION ٥٢٠): سحب أو تصحيح سعر على الدفعة بعد المعاينة يغيّر قيمة المُرجَع، أو
  -- يخلّي السطر ياخذ متبقّيها كلّه بلا تأكيده (E31)، بلا ما تتغيّر نسخة المسوّدة.
  if p_expected_plan is null or private.plan_token(v_plan) is distinct from p_expected_plan then
    raise exception 'stale_preview' using hint = 'تغيّر متبقّي دفعة بعد المعاينة فتغيّرت قيمة المُرجَع. عاين المرتجع من جديد ووافق عليه قبل الترحيل.';
  end if;
  v_no := private.next_doc_no('RT', d.returned_on);
  if v_credit_total > 0 then
    e := private.write_entry(gen_random_uuid(), d.party_id, d.book_id, 'supplier_return', v_credit_total, 'supplier_return', d.id, v_no, d.returned_on, null);
    perform private.allocate_entry(e.id, private.receipt_purchase_entry(r.id));
  end if;
  if v_value_total <> v_credit_total then
    insert into public.expenses (org_id, category_id, division_id, amount, on_date, for_month, source, doc_kind, doc_id)
    values (d.org_id, v_category, w.division_id, v_value_total - v_credit_total, d.returned_on, date_trunc('month', d.returned_on)::date, 'adjustment',
      'supplier_return', d.id);
  end if;
  perform private.mark_division_posted(w.division_id);
  update public.supplier_returns set status = 'posted', doc_no = v_no, posted_at = now(), posted_by = auth.uid(), client_ref = p_client_ref
  where org_id = d.org_id and id = d.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'kind', 'supplier_return', 'status', 'posted', 'doc_no', v_no,
    'version', d.version, 'lines', v_lines,
    'money', jsonb_build_object('value_total', v_value_total::text, 'credit_total', v_credit_total::text, 'diff', (v_value_total - v_credit_total)::text)));
end
$$;

-- معاينة المرتجع (0010 كما هي، ويّا مشكلة السطر نفسها؛ قيمة السحب وبصمته كما كانتا).
create or replace function public.preview_supplier_return(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d public.supplier_returns;
  r public.receipts;
  w public.warehouses;
  c record;
  v_cost boolean := public.can_see_cost();
  v_problems jsonb := '[]'::jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_money jsonb := '[]'::jsonb;
  v_date jsonb;
  v_problem jsonb;
  v_value numeric;
  v_value_total numeric := 0;
  v_credit_total numeric := 0;
  v_missing boolean := false;
  v_line_problems boolean := false;
  v_plan text := '';
begin
  perform private.require(case when public.can('receipt.draft') then 'receipt.draft' else 'receipt.amounts' end);
  select * into d from public.supplier_returns where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(d.warehouse_id, true);
  select * into r from public.receipts where org_id = d.org_id and id = d.receipt_id;
  if d.status <> 'draft' then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'not_draft', 'hint', 'هذا المستند ليس مسوّدة.'));
  end if;
  v_date := private.date_problem(d.returned_on, w.division_id, false);
  if v_date is not null then
    v_problems := v_problems || jsonb_build_array(v_date);
  end if;
  if r.status <> 'posted' then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'receipt_not_posted', 'hint', 'الاستلام ليس مرحَّلاً (مسوّدة أو ملغى)، فلا يُرجَع منه شيء.'));
  end if;
  if d.returned_on < r.received_on then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'return_before_receipt', 'hint',
      format('تاريخ المرتجع %s قبل استلام البضاعة %s؛ اكتب يوم الإرجاع الصحيح.', to_char(d.returned_on, 'DD/MM/YYYY'), to_char(r.received_on, 'DD/MM/YYYY'))));
  end if;
  for c in
    select x.id, x.line_no, x.receipt_line_id, x.item_id, x.lot_id, x.qty_base, i.name as item_name, i.base_unit, i.tracks_expiry,
      l.qty_left, l.value_left, l.expiry_on, a.credit_amount
    from public.supplier_return_lines x
    join public.items i on i.org_id = x.org_id and i.id = x.item_id
    join public.stock_lots l on l.org_id = x.org_id and l.id = x.lot_id
    left join public.supplier_return_line_amounts a on a.org_id = x.org_id and a.line_id = x.id
    where x.org_id = d.org_id and x.doc_id = d.id
    order by x.line_no
  loop
    v_problem := case when c.qty_base > c.qty_left then jsonb_build_object('code', 'insufficient_stock',
      'hint', format('لا يكفي المتبقّي من دفعة الاستلام لهذا المرتجع: %s', private.return_shortage_detail(c.lot_id, c.qty_base))) end;
    v_value := case when v_problem is not null then null when c.qty_base = c.qty_left then c.value_left
      else private._mul_div_round2(c.qty_base, c.value_left, c.qty_left) end;
    -- شراء بلا سعر (مراجعة 0020 M1): لا يُرجَع قبل «أكمل السعر» (قيمة السحب وبصمة الترحيل كما كانتا).
    if v_problem is null and private.purchase_unpriced(c.receipt_line_id) then
      v_problem := jsonb_build_object('code', 'unpriced_line', 'hint', format('شراء «%s» هذا بلا سعر بعد: أكمل سعر الشراء أوّلاً، ثمّ أرجِع للمورّد.', c.item_name));
    end if;
    v_line_problems := v_line_problems or v_problem is not null;
    -- بصمة الترحيل (stale_preview): الدفعة بمتبقّيها وقيمته، والسطر بكميته وقيمة سحبه (صفر لسطر بمشكلة: الترحيل يرفضه قبلها).
    v_plan := v_plan || c.id::text || '|' || private.plan_piece(c.lot_id, c.qty_left, c.value_left) || '|' || private.plan_piece(c.lot_id, c.qty_base, coalesce(v_value, 0)) || '/';
    v_missing := v_missing or c.credit_amount is null;
    v_value_total := v_value_total + coalesce(v_value, 0);
    v_credit_total := v_credit_total + coalesce(c.credit_amount, 0);
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('line_id', c.id, 'line_no', c.line_no, 'receipt_line_id', c.receipt_line_id,
      'item_id', c.item_id, 'item_name', c.item_name, 'base_unit', c.base_unit, 'qty', c.qty_base::text, 'lot_id', c.lot_id,
      'lot_qty_left', c.qty_left::text, 'whole_balance', c.qty_base = c.qty_left, 'problem', v_problem,
      'warning', case when private.lot_expired(c.tracks_expiry, c.expiry_on, d.returned_on) then jsonb_build_object('code', 'expired_lot',
        'hint', format('دفعة «%s» منتهية الصلاحية؛ يُرجعها المرتجع إلى المورّد.', c.item_name)) end));
    v_money := v_money || jsonb_build_array(jsonb_build_object('line_id', c.id, 'value', v_value::text, 'credit', c.credit_amount::text,
      'diff', case when v_value is not null and c.credit_amount is not null then (v_value - c.credit_amount)::text end));
  end loop;
  if jsonb_array_length(v_lines) = 0 then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'return_empty', 'hint', 'المرتجع بلا سطور. أضف سطراً واحداً على الأقلّ.'));
  end if;
  if v_cost and v_missing then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'credit_required', 'hint', 'اكتب المبلغ الذي قبله المورّد لكل سطر (صفر إن لم يقبل شيئاً).'));
  end if;
  return private.mask(jsonb_build_object('id', d.id, 'kind', 'supplier_return', 'status', d.status, 'version', d.version, 'receipt_id', r.id,
    'receipt_no', r.doc_no, 'party_id', d.party_id, 'warehouse_id', d.warehouse_id, 'book_id', d.book_id, 'returned_on', d.returned_on,
    'problems', v_problems, 'lines', v_lines, 'plan', private.plan_token(v_plan),
    'ready', v_cost and jsonb_array_length(v_problems) = 0 and jsonb_array_length(v_lines) > 0 and not v_line_problems,
    'money', jsonb_build_object('lines', v_money, 'value_total', v_value_total::text, 'credit_total', v_credit_total::text,
      'diff_total', (v_value_total - v_credit_total)::text)));
end
$$;

-- قفل المخازن والمواد (0007 كما هو، ويّا: مادّة حُذفت بلحظة القفل تُرفض item_not_found، مراجعة 0020 L3). delete_item يقفل صفّها for update،
-- فمستند يسابقه ينتظر هنا ثمّ لا يجدها؛ وبلا الفحص يصل إلى إدراج الرصيد فيرمي 23503 خاماً. كلّ متّصل يمرّر مواد من صفوف قائمة.
create or replace function private.lock_masters(p_whs uuid[], p_items uuid[], p_original boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
  v_found int := 0;
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
    v_found := v_found + 1;
    if p_original and r.archived_at is not null then
      raise exception 'item_archived' using hint = format('المادّة «%s» مؤرشفة، فلا تُسجَّل لها حركة جديدة. أعِدها من الأرشيف أوّلاً.', r.name);
    end if;
  end loop;
  if v_found < (select count(distinct x.id) from unnest(p_items) as x(id) where x.id is not null) then
    raise exception 'item_not_found' using hint = 'حُذفت مادّة من هذا المستند من نافذة أو جهاز آخر قبل حفظه. حدّث الشاشة واختر من جديد.';
  end if;
end
$$;

-- ─── ز. تحويل مادّة إلى مادّة ──────────────────────────────────────────────────────────────────────────────────────
-- نتيجة التحويل من صفوفه: نفسها لأوّل نداء وللإعادة بالمعرّف. القيمة داخل money (يقنّعها ref_store لغير أدوار الكلفة).
create or replace function private.conversion_result(p_doc uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', c.id, 'doc_no', c.doc_no, 'status', c.status, 'converted_on', c.converted_on,
    'from', jsonb_build_object('item_id', c.from_item_id, 'item_name', a.name, 'warehouse_id', c.from_warehouse_id, 'warehouse_name', wa.name,
      'qty', c.from_qty::text, 'base_unit', c.from_unit),
    'to', jsonb_build_object('item_id', c.to_item_id, 'item_name', b.name, 'warehouse_id', c.to_warehouse_id, 'warehouse_name', wb.name,
      'qty', c.to_qty::text, 'base_unit', c.to_unit),
    'money', jsonb_build_object('value', (select l.value_in from public.stock_lots l where l.org_id = c.org_id and l.source_kind = 'conversion'
      and l.source_id = c.id)::text))
  from public.stock_conversions c
  join public.items a on a.org_id = c.org_id and a.id = c.from_item_id
  join public.items b on b.org_id = c.org_id and b.id = c.to_item_id
  join public.warehouses wa on wa.org_id = c.org_id and wa.id = c.from_warehouse_id
  join public.warehouses wb on wb.org_id = c.org_id and wb.id = c.to_warehouse_id
  where c.org_id = public.auth_org() and c.id = p_doc
$$;

-- التحويل (stock_use.post): المادّة الأولى بكميتها من مخزنها المختار أو الوحيد بالنطاق الذي فيه منها متاح بالتاريخ، إلى المادّة الثانية
-- بكميتها في مخزن يقبلها (المختار، أو مخزن المصدر إن قبلها، أو الوحيد بالنطاق من أنواع استلامها). الأقفال (§2.3): المرجع ← معرّف
-- المستند ← قفل الفترة وصفّا الوحدتين بترتيب المعرّف ← المخزنان والمادّتان ← الرصيدان ← دفعات الأولى (draw) ← عدّاد الدفعات ← عدّاد
-- المستندات؛ وكلّ فحص بعد قفله. قيمة الدفعة الجديدة = مجموع قيم السحب بالضبط (القاعدة ١٣)، فلا يتغيّر مجموع قيمة المخزون.
create or replace function public.record_conversion(p_client_ref uuid, p_doc_id uuid, p_from_item uuid, p_from_qty numeric, p_to_item uuid,
  p_to_qty numeric, p_on date, p_from_warehouse uuid default null, p_to_warehouse uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'record_conversion';
  v_org uuid := public.auth_org();
  v_cached jsonb;
  a public.items;
  b public.items;
  wf public.warehouses;
  wt public.warehouses;
  x public.stock_conversions;
  l public.stock_lots;
  s record;
  dr record;
  v_same boolean;
  v_count int;
  v_names text;
  v_expired numeric;
  v_div uuid;
  v_total numeric := 0;
  v_no text;
begin
  set local lock_timeout = '5s';
  perform private.require('stock_use.post');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('doc', p_doc_id, 'from_item', p_from_item, 'from_qty', p_from_qty,
    'to_item', p_to_item, 'to_qty', p_to_qty, 'on', p_on, 'from_wh', p_from_warehouse, 'to_wh', p_to_warehouse));
  if v_cached is not null then
    if exists (select 1 from public.stock_conversions y where y.org_id = v_org and y.id = p_doc_id and y.status = 'void') then
      raise exception 'id_conflict' using hint = 'سُجّل هذا التحويل من قبل ثمّ أُلغي. سجّل تحويلاً جديداً.';
    end if;
    return v_cached;
  end if;
  if p_doc_id is null or p_from_item is null or p_to_item is null then
    raise exception 'id_required' using hint = 'تعذّر الإرسال دون معرّف التحويل والمادّتين. حدّث الشاشة وأعد المحاولة.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stock_conversion:' || p_doc_id::text, 0));
  select * into x from public.stock_conversions y where y.id = p_doc_id;
  if x.id is not null then
    v_same := x.org_id = v_org and x.status = 'posted' and x.created_by is not distinct from auth.uid() and x.from_item_id = p_from_item
      and x.to_item_id = p_to_item and x.from_qty = p_from_qty and x.to_qty = p_to_qty and x.converted_on = p_on
      and (p_from_warehouse is null or x.from_warehouse_id = p_from_warehouse) and (p_to_warehouse is null or x.to_warehouse_id = p_to_warehouse);
    if coalesce(v_same, false) then
      return private.ref_store(v_fn, p_client_ref, private.conversion_result(x.id));
    end if;
    raise exception 'id_conflict' using hint = case
      when x.org_id = v_org and x.status = 'void' then 'سُجّل هذا التحويل من قبل ثمّ أُلغي. سجّل تحويلاً جديداً.'
      else 'سُجّل بهذا المعرّف تحويل غير الذي أرسلته الآن. حدّث الشاشة لترى ما سُجّل، ثمّ سجّل من جديد.'
    end;
  end if;

  -- المادّتان: موجودتان وفعّالتان ومختلفتان، ولا معدود، ولا انتهاء للثانية؛ والكميتان بوحدتي أساسهما.
  select * into a from public.items y where y.org_id = v_org and y.id = p_from_item;
  select * into b from public.items y where y.org_id = v_org and y.id = p_to_item;
  if a.id is null or b.id is null then
    raise exception 'item_not_found' using hint = 'إحدى المادّتين غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if a.id = b.id then
    raise exception 'same_item' using hint = format('التحويل من «%s» إليها نفسها لا معنى له؛ اختر مادّة أخرى.', a.name);
  end if;
  if a.archived_at is not null or b.archived_at is not null then
    raise exception 'item_archived' using hint = format('المادّة «%s» مؤرشفة، فلا تدخل تحويلاً. أعِدها من الأرشيف أوّلاً.',
      case when a.archived_at is not null then a.name else b.name end);
  end if;
  if a.kind in ('hatching_egg', 'chick', 'table_egg') or b.kind in ('hatching_egg', 'chick', 'table_egg') then
    raise exception 'not_convertible' using hint = 'البيض والأفراخ لا تُحوَّل إلى مادّة أخرى ولا يُحوَّل إليها.';
  end if;
  if b.tracks_expiry then
    raise exception 'conversion_expiry' using hint = format('«%s» تتابع تاريخ الانتهاء، والتحويل لا يكتب تاريخاً للدفعة الجديدة؛ سجّلها شراءً أو رصيداً افتتاحياً.', b.name);
  end if;
  if p_from_qty is null or not (abs(p_from_qty) < 'Infinity') or p_from_qty <= 0 or p_from_qty <> round(p_from_qty, 3)
     or p_to_qty is null or not (abs(p_to_qty) < 'Infinity') or p_to_qty <= 0 or p_to_qty <> round(p_to_qty, 3) then
    raise exception 'qty_not_positive' using hint = 'اكتب الكميتين أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.';
  end if;
  if (a.base_unit = 'pc' and p_from_qty <> round(p_from_qty, 0)) or (b.base_unit = 'pc' and p_to_qty <> round(p_to_qty, 0)) then
    raise exception 'pieces_not_whole' using hint = format('«%s» تُعدّ بالقطعة؛ اكتب عدداً صحيحاً من القطع.',
      case when a.base_unit = 'pc' and p_from_qty <> round(p_from_qty, 0) then a.name else b.name end);
  end if;
  if p_on is null then
    raise exception 'date_required' using hint = 'اكتب تاريخ التحويل.';
  end if;
  perform private.check_doc_date(p_on);

  -- مخزن المادّة الأولى: المختار يُفحص (النطاق قبل أن يُسمّى)، وإلّا الوحيد بالنطاق الذي فيه منها متاح بالتاريخ.
  if p_from_warehouse is not null then
    select * into wf from public.warehouses y where y.org_id = v_org and y.id = p_from_warehouse;
    if wf.id is null then
      raise exception 'warehouse_not_found' using hint = 'هذا المخزن غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
    end if;
    if not public.in_scope_wh(wf.id) then
      raise exception 'out_of_scope' using hint = format('المخزن «%s» خارج نطاقك، فلا تحوّل منه.', wf.name);
    end if;
    if wf.archived_at is not null then
      raise exception 'warehouse_archived' using hint = format('المخزن «%s» مؤرشف، فلا يُحوَّل منه. اختر مخزناً آخر.', wf.name);
    end if;
    if not private.item_admissible(wf.kind, a.kind) then
      raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s». اختر مخزناً فيه هذه المادّة.', a.name, wf.name);
    end if;
  else
    select (count(*) filter (where q.available > 0))::int,
      string_agg(format('«%s» (%s)', y.name, private.qty_text(q.available, a.base_unit)), '، ' order by y.name collate "C", y.id) filter (where q.available > 0),
      coalesce(sum(q.expired), 0)
    into v_count, v_names, v_expired
    from public.warehouses y cross join lateral private.stock_at(a.id, y.id, p_on) as q
    where y.org_id = v_org and y.archived_at is null and private.item_admissible(y.kind, a.kind) and public.in_scope_wh(y.id);
    if v_count = 0 then
      raise exception 'insufficient_stock' using hint = format('لا يوجد «%s» متاح في مخازن نطاقك بتاريخ %s: طلبت %s، وعندك %s.%s',
        a.name, to_char(p_on, 'DD/MM/YYYY'), private.qty_text(p_from_qty, a.base_unit), private.qty_text(0, a.base_unit),
        case when v_expired > 0 then format(' وفي مخازنك %s منتهية الصلاحية لا تُحوَّل.', private.qty_text(v_expired, a.base_unit)) else '' end);
    end if;
    if v_count > 1 then
      raise exception 'from_store_required' using hint = format('«%s» موجودة في أكثر من مخزن في نطاقك: %s. اختر المخزن الذي تحوّل منه.', a.name, v_names);
    end if;
    select y.* into wf from public.warehouses y cross join lateral private.stock_at(a.id, y.id, p_on) as q
    where y.org_id = v_org and y.archived_at is null and private.item_admissible(y.kind, a.kind) and public.in_scope_wh(y.id) and q.available > 0;
  end if;
  -- مخزن المادّة الثانية: المختار يُفحص، وإلّا مخزن المصدر إن قبلها، وإلّا الوحيد بالنطاق من أنواع استلامها.
  if p_to_warehouse is not null then
    select * into wt from public.warehouses y where y.org_id = v_org and y.id = p_to_warehouse;
    if wt.id is null then
      raise exception 'warehouse_not_found' using hint = 'هذا المخزن غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
    end if;
    if not public.in_scope_wh(wt.id) then
      raise exception 'out_of_scope' using hint = format('المخزن «%s» خارج نطاقك، فلا تحوّل إليه.', wt.name);
    end if;
    if wt.archived_at is not null then
      raise exception 'warehouse_archived' using hint = format('المخزن «%s» مؤرشف، فلا يُحوَّل إليه. اختر مخزناً آخر.', wt.name);
    end if;
    if not private.item_admissible(wt.kind, b.kind) then
      raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s». اختر مخزناً يقبلها.', b.name, wt.name);
    end if;
  elsif private.item_admissible(wf.kind, b.kind) then
    wt := wf;
  else
    select count(*)::int, string_agg(format('«%s»', y.name), '، ' order by y.name collate "C", y.id) into v_count, v_names
    from public.warehouses y
    where y.org_id = v_org and y.archived_at is null and y.kind = any (private.receiving_kinds(b.kind)) and public.in_scope_wh(y.id);
    if v_count = 0 then
      raise exception 'no_receiving_store' using hint = format('لا مخزن في نطاقك يقبل «%s». أضفه من «إعداد المخزن» أو اختر مادّة أخرى.', b.name);
    end if;
    if v_count > 1 then
      raise exception 'store_required' using hint = format('«%s» تدخل أكثر من مخزن في نطاقك: %s. اختر المخزن الذي تدخله.', b.name, v_names);
    end if;
    select * into wt from public.warehouses y
    where y.org_id = v_org and y.archived_at is null and y.kind = any (private.receiving_kinds(b.kind)) and public.in_scope_wh(y.id);
  end if;

  -- الأقفال بترتيبها، وكلّ فحص بعد قفله.
  for v_div in select d from unnest(array[wf.division_id, wt.division_id]) as d group by d order by d loop
    perform private.check_post_date(p_on, v_div);
  end loop;
  perform private.lock_masters(array[wf.id, wt.id], array[a.id, b.id], true);
  select * into a from public.items y where y.org_id = v_org and y.id = p_from_item;
  select * into b from public.items y where y.org_id = v_org and y.id = p_to_item;
  if b.tracks_expiry then
    raise exception 'conversion_expiry' using hint = format('«%s» تتابع تاريخ الانتهاء، والتحويل لا يكتب تاريخاً للدفعة الجديدة؛ سجّلها شراءً أو رصيداً افتتاحياً.', b.name);
  end if;
  perform private.lock_balances(array[a.id, b.id], array[wf.id, wt.id]);
  select * into s from private.stock_at(a.id, wf.id, p_on);
  if s.available < p_from_qty then
    raise exception 'insufficient_stock' using hint = format('لا يكفي رصيد «%s» في «%s»: طلبت %s، وعندك %s بتاريخ %s.%s%s',
      a.name, wf.name, private.qty_text(p_from_qty, a.base_unit), private.qty_text(s.available, a.base_unit), to_char(p_on, 'DD/MM/YYYY'),
      case when s.expired > 0 then format(' وفي المخزن %s منتهية الصلاحية لا تُحوَّل.', private.qty_text(s.expired, a.base_unit)) else '' end,
      case when s.later > 0 then format(' و%s استُلمت بعد هذا التاريخ.', private.qty_text(s.later, a.base_unit)) else '' end);
  end if;
  for dr in select * from private.draw(a.id, wf.id, p_from_qty, p_on, null, false) loop
    perform private.apply_move(dr.lot_id, 'conversion', p_doc_id, null, -dr.qty, -dr.value, p_on, null, coalesce(a.tracks_expiry, false));
    v_total := v_total + dr.value;
  end loop;
  l := private.new_lot(b.id, wt.id, p_on, null, null, p_to_qty, v_total, 'conversion', p_doc_id, null);
  perform private.apply_move(l.id, 'conversion', p_doc_id, null, p_to_qty, v_total, p_on, null);
  v_no := private.next_doc_no('CV', p_on);
  insert into public.stock_conversions (id, org_id, doc_no, from_item_id, from_warehouse_id, from_qty, from_unit, to_item_id, to_warehouse_id, to_qty, to_unit,
    converted_on, status, client_ref, posted_at, posted_by)
  values (p_doc_id, v_org, v_no, a.id, wf.id, p_from_qty, a.base_unit, b.id, wt.id, p_to_qty, b.base_unit, p_on, 'posted', p_client_ref, now(), auth.uid());
  for v_div in select d from unnest(array[wf.division_id, wt.division_id]) as d group by d order by d loop
    perform private.mark_division_posted(v_div);
  end loop;
  return private.ref_store(v_fn, p_client_ref, private.conversion_result(p_doc_id));
end
$$;

-- إلغاء التحويل (void): حركة الدفعة الجديدة تنعكس (lot_consumed إن صُرف منها)، وكلّ سحب من الأولى يرجع لدفعته، بيوم الإلغاء.
create or replace function public.void_conversion(p_doc_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_conversion';
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_cached jsonb;
  v_reason text;
  x public.stock_conversions;
  wf public.warehouses;
  wt public.warehouses;
  l public.stock_lots;
  m public.stock_moves;
  v_back int := 0;
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_doc_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into x from public.stock_conversions y where y.org_id = v_org and y.id = p_doc_id;
  if x.id is null then
    raise exception 'doc_not_found' using hint = 'هذا التحويل غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  wf := private.stock_wh(x.from_warehouse_id, true);
  wt := private.stock_wh(x.to_warehouse_id, true);
  perform private.check_void_date();
  select * into x from public.stock_conversions y where y.org_id = v_org and y.id = p_doc_id for update;
  if x.status = 'void' then
    raise exception 'already_void' using hint = format('التحويل %s ملغى من قبل.', x.doc_no);
  end if;
  perform private.lock_masters(array[wf.id, wt.id], array[x.from_item_id, x.to_item_id], false);
  perform private.lock_balances(array[x.from_item_id, x.to_item_id], array[wf.id, wt.id]);
  select * into l from public.stock_lots y where y.org_id = v_org and y.source_kind = 'conversion' and y.source_id = x.id for no key update;
  perform private.check_lot_intact(l.id);
  for m in
    select z.* from public.stock_moves z
    where z.org_id = v_org and z.doc_kind = 'conversion' and z.doc_id = x.id and z.reverses_move_id is null
    order by z.qty desc, z.seq
  loop
    perform private.apply_move(m.lot_id, 'conversion', x.id, null, -m.qty, -m.value, v_today, m.id);
    v_back := v_back + 1;
  end loop;
  update public.stock_conversions set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason, version = version + 1
  where org_id = v_org and id = x.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', x.id, 'doc_no', x.doc_no, 'status', 'void', 'voided_on', v_today,
    'reversed_moves', v_back, 'money', jsonb_build_object('value', l.value_in::text)));
end
$$;

-- ─── ح. النقل بخطوة واحدة على جسم ترحيل التحويل نفسه ───────────────────────────────────────────────────────────────
-- جسم post_transfer كما في 0007 بلا الفعل والمرجع، ويّا p_check_plan: الترحيل من الورقة يقارن بصمة المعاينة (stale_preview) كما كان،
-- والنقل بخطوة واحدة بلا معاينة (المستخدم يوافق على كمية فقط). يرجّع النتيجة بلا قناع (المتّصل يقنّعها بـref_store).
create or replace function private.post_transfer_core(p_id uuid, p_expected_version int, p_expected_plan text, p_client_ref uuid, p_check_plan boolean)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
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
  -- القطع اللي انسحبت = اللي شافها المستخدم بالمعاينة (FOUNDATION ٥٢٠ البند 5)، للترحيل من الورقة.
  if p_check_plan and (p_expected_plan is null or private.plan_token(v_plan) is distinct from p_expected_plan) then
    raise exception 'stale_preview' using hint = 'تغيّر المخزون بعد المعاينة فتغيّرت الدفعات المسحوبة أو كمياتها. عاين التحويل من جديد ووافق عليه قبل الترحيل.';
  end if;
  v_no := private.next_doc_no('TR', d.moved_on);
  update public.transfers set status = 'posted', doc_no = v_no, client_ref = p_client_ref, posted_at = now(), posted_by = auth.uid()
  where org_id = d.org_id and id = d.id;
  for v_div in select distinct x from unnest(array[wf.division_id, wt.division_id]) as x order by 1 loop
    perform private.mark_division_posted(v_div);
  end loop;
  return jsonb_build_object('id', d.id, 'kind', 'transfer', 'status', 'posted', 'doc_no', v_no,
    'from_warehouse_id', wf.id, 'to_warehouse_id', wt.id, 'moved_on', d.moved_on, 'internal_export', wf.division_id <> wt.division_id,
    'lines', v_lines, 'money', jsonb_build_object('total', v_total::text));
end
$$;

-- الترحيل من الورقة (transfer.post) كما كان: الفعل ثمّ المرجع ثمّ الجسم ببصمة المعاينة.
create or replace function public.post_transfer(p_id uuid, p_expected_version int, p_expected_plan text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'post_transfer';
  v_cached jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('transfer.post');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'version', p_expected_version));
  if v_cached is not null then
    return v_cached;
  end if;
  return private.ref_store(v_fn, p_client_ref, private.post_transfer_core(p_id, p_expected_version, p_expected_plan, p_client_ref, true));
end
$$;

-- نتيجة النقل: نتيجة الجسم ويّا المادّة والكمية واسما المخزنين (للإعادة بالمعرّف تُبنى من الصفوف).
create or replace function private.transfer_result(p_doc uuid, p_core jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(p_core, jsonb_build_object('id', t.id, 'kind', 'transfer', 'status', t.status, 'doc_no', t.doc_no,
      'from_warehouse_id', t.from_warehouse_id, 'to_warehouse_id', t.to_warehouse_id, 'moved_on', t.moved_on,
      'internal_export', wf.division_id <> wt.division_id,
      'money', jsonb_build_object('total', (select coalesce(sum(-m.value), 0) from public.stock_moves m where m.org_id = t.org_id
        and m.doc_kind = 'transfer' and m.doc_id = t.id and m.warehouse_id = t.from_warehouse_id and m.reverses_move_id is null)::text)))
    || jsonb_build_object('line_id', x.id, 'item_id', x.item_id, 'item_name', i.name, 'qty', x.qty_base::text, 'base_unit', i.base_unit,
      'from_warehouse_name', wf.name, 'to_warehouse_name', wt.name)
  from public.transfers t
  join public.transfer_lines x on x.org_id = t.org_id and x.doc_id = t.id and x.line_no = 1
  join public.items i on i.org_id = x.org_id and i.id = x.item_id
  join public.warehouses wf on wf.org_id = t.org_id and wf.id = t.from_warehouse_id
  join public.warehouses wt on wt.org_id = t.org_id and wt.id = t.to_warehouse_id
  where t.org_id = public.auth_org() and t.id = p_doc
$$;

-- النقل (transfer.post): مادّة واحدة بكميتها بوحدة أساسها من مخزن إلى مخزن، بورقة التحويل وسطرها (معرّفاهما من الجهاز) يُرحَّلان فوراً بجسم
-- الترحيل نفسه، ويُلغى بـvoid_transfer. المخزن المرسِل المختار، أو الوحيد بالنطاق الذي فيه منها متاح بالتاريخ.
create or replace function public.record_transfer(p_client_ref uuid, p_doc_id uuid, p_line_id uuid, p_item uuid, p_qty numeric, p_from_warehouse uuid,
  p_to_warehouse uuid, p_on date) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'record_transfer';
  v_org uuid := public.auth_org();
  v_cached jsonb;
  i public.items;
  wf public.warehouses;
  wt public.warehouses;
  t public.transfers;
  v_same boolean;
  v_count int;
  v_names text;
  v_expired numeric;
  v_version int;
  v_core jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('transfer.post');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('doc', p_doc_id, 'line', p_line_id, 'item', p_item, 'qty', p_qty,
    'from', p_from_warehouse, 'to', p_to_warehouse, 'on', p_on));
  if v_cached is not null then
    if exists (select 1 from public.transfers y where y.org_id = v_org and y.id = p_doc_id and y.status = 'void') then
      raise exception 'id_conflict' using hint = 'سُجّل هذا النقل من قبل ثمّ أُلغي. سجّل نقلاً جديداً.';
    end if;
    return v_cached;
  end if;
  if p_doc_id is null or p_line_id is null or p_item is null then
    raise exception 'id_required' using hint = 'تعذّر الإرسال دون معرّفات النقل والمادّة. حدّث الشاشة وأعد المحاولة.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('transfer_doc:' || p_doc_id::text, 0));
  select * into t from public.transfers y where y.id = p_doc_id;
  if t.id is not null then
    v_same := t.org_id = v_org and t.status = 'posted' and t.created_by is not distinct from auth.uid() and t.moved_on = p_on
      and t.to_warehouse_id = p_to_warehouse and (p_from_warehouse is null or t.from_warehouse_id = p_from_warehouse)
      and exists (select 1 from public.transfer_lines y where y.org_id = t.org_id and y.doc_id = t.id and y.id = p_line_id and y.item_id = p_item
        and y.qty_base = p_qty)
      and (select count(*) from public.transfer_lines y where y.org_id = t.org_id and y.doc_id = t.id) = 1;
    if coalesce(v_same, false) then
      return private.ref_store(v_fn, p_client_ref, private.transfer_result(t.id, null));
    end if;
    raise exception 'id_conflict' using hint = case
      when t.org_id = v_org and t.status = 'void' then 'سُجّل هذا النقل من قبل ثمّ أُلغي. سجّل نقلاً جديداً.'
      else 'سُجّل بهذا المعرّف نقل أو ورقة غير الذي أرسلته الآن. حدّث الشاشة لترى ما سُجّل، ثمّ سجّل من جديد.'
    end;
  end if;
  if exists (select 1 from public.transfer_lines y where y.id = p_line_id) then
    raise exception 'id_conflict' using hint = 'معرّف سطر النقل مستعمل لورقة أخرى. حدّث الشاشة وأعد المحاولة.';
  end if;
  select * into i from public.items y where y.org_id = v_org and y.id = p_item;
  if i.id is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if i.archived_at is not null then
    raise exception 'item_archived' using hint = format('المادّة «%s» مؤرشفة، فلا تُنقل. أعِدها من الأرشيف أوّلاً.', i.name);
  end if;
  if p_qty is null or not (abs(p_qty) < 'Infinity') or p_qty <= 0 or p_qty <> round(p_qty, 3) then
    raise exception 'qty_not_positive' using hint = format('اكتب كمية «%s» أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.', i.name);
  end if;
  if i.base_unit = 'pc' and p_qty <> round(p_qty, 0) then
    raise exception 'pieces_not_whole' using hint = format('«%s» تُعدّ بالقطعة؛ اكتب عدداً صحيحاً من القطع.', i.name);
  end if;
  if p_on is null then
    raise exception 'date_required' using hint = 'اكتب تاريخ النقل.';
  end if;
  perform private.check_doc_date(p_on);
  if p_to_warehouse is null then
    raise exception 'to_store_required' using hint = 'اختر المخزن الذي تنقل إليه.';
  end if;
  select * into wt from public.warehouses y where y.org_id = v_org and y.id = p_to_warehouse;
  if wt.id is null then
    raise exception 'warehouse_not_found' using hint = 'هذا المخزن غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if wt.archived_at is not null then
    raise exception 'warehouse_archived' using hint = format('المخزن «%s» مؤرشف، فلا يُنقل إليه. اختر مخزناً آخر.', wt.name);
  end if;
  if not private.item_admissible(wt.kind, i.kind) then
    raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s». اختر مخزناً يقبلها.', i.name, wt.name);
  end if;
  if p_from_warehouse is not null then
    select * into wf from public.warehouses y where y.org_id = v_org and y.id = p_from_warehouse;
    if wf.id is null then
      raise exception 'warehouse_not_found' using hint = 'هذا المخزن غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
    end if;
    if not public.in_scope_wh(wf.id) then
      raise exception 'out_of_scope' using hint = format('المخزن «%s» خارج نطاقك، فلا تنقل منه.', wf.name);
    end if;
  else
    select (count(*) filter (where q.available > 0))::int,
      string_agg(format('«%s» (%s)', y.name, private.qty_text(q.available, i.base_unit)), '، ' order by y.name collate "C", y.id) filter (where q.available > 0),
      coalesce(sum(q.expired), 0)
    into v_count, v_names, v_expired
    from public.warehouses y cross join lateral private.stock_at(i.id, y.id, p_on) as q
    where y.org_id = v_org and y.archived_at is null and y.id <> wt.id and private.item_admissible(y.kind, i.kind) and public.in_scope_wh(y.id);
    if v_count = 0 then
      raise exception 'insufficient_stock' using hint = format('لا يوجد «%s» متاح في مخازن نطاقك (غير «%s») بتاريخ %s: طلبت %s، وعندك %s.%s',
        i.name, wt.name, to_char(p_on, 'DD/MM/YYYY'), private.qty_text(p_qty, i.base_unit), private.qty_text(0, i.base_unit),
        case when v_expired > 0 then format(' وفي مخازنك %s منتهية الصلاحية لا تُنقل.', private.qty_text(v_expired, i.base_unit)) else '' end);
    end if;
    if v_count > 1 then
      raise exception 'store_required' using hint = format('«%s» موجودة في أكثر من مخزن في نطاقك: %s. اختر المخزن الذي تنقل منه.', i.name, v_names);
    end if;
    select y.* into wf from public.warehouses y cross join lateral private.stock_at(i.id, y.id, p_on) as q
    where y.org_id = v_org and y.archived_at is null and y.id <> wt.id and private.item_admissible(y.kind, i.kind) and public.in_scope_wh(y.id)
      and q.available > 0;
  end if;
  if wf.id = wt.id then
    raise exception 'same_warehouse' using hint = 'المخزن المرسِل والمستلم واحد؛ اختر مخزناً آخر للاستلام.';
  end if;
  insert into public.transfers (id, org_id, from_warehouse_id, to_warehouse_id, moved_on) values (p_doc_id, v_org, wf.id, wt.id, p_on);
  insert into public.transfer_lines (id, org_id, doc_id, item_id, qty_in_unit) values (p_line_id, v_org, p_doc_id, i.id, p_qty);
  select y.version into v_version from public.transfers y where y.org_id = v_org and y.id = p_doc_id;
  v_core := private.post_transfer_core(p_doc_id, v_version, null, p_client_ref, false);
  return private.ref_store(v_fn, p_client_ref, private.transfer_result(p_doc_id, v_core));
end
$$;

-- ─── ط. ملفّ المادّة وبطاقات المواد ─────────────────────────────────────────────────────────────────────────────
-- ملفّ المادّة (0017، ويّا 0020): كلّ شراء بـpriced وcan_price (بلا سعر: سعر الوحدة فارغ والمبلغ صفر)، والمتوسّط وآخر سعر من المسعَّر وحده،
-- وunpriced_count وcan_price؛ وأفعال الملفّ: can_delete (stores.manage ولا يشير إليها شيء) وuses (أنواع استعمالها بكلمات المالك)،
-- وcan_convert (stock_use.post) وcan_transfer (transfer.post) وcan_sell (sale.record، للبيع في 0021) بشرط مادّة فعّالة فيها رصيد بنطاقك؛
-- وstores (أين هي: كلّ مخزن بنطاقك فيه منها رصيد، بالكمية والمتاح اليوم)، وtransfer_targets (المخازن الفعّالة التي تقبل نوعها).
create or replace function public.item_file(p_item uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  i public.items;
  v_on_hand numeric;
  v_count int;
  v_qty numeric;
  v_priced_qty numeric;
  v_value numeric;
  v_last numeric;
  v_unpriced int;
  v_can_price boolean;
  v_rows jsonb;
  v_sell numeric;
  v_record boolean;
  v_can_buy boolean;
  v_live boolean;
  v_can_sell boolean;
  v_uses text[];
  v_stores jsonb;
  v_result jsonb;
begin
  perform private.require('read');
  select * into i from public.items x where x.org_id = v_org and x.id = p_item;
  if i.id is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  v_record := public.can('purchase.record');
  -- الدفتر بـCASE بعد نوع المخزن: receipt_book يرفض مخزناً لا يستلم، وترتيب شروط WHERE غير مضمون.
  v_can_buy := v_record and i.archived_at is null and exists (
    select 1 from public.warehouses x
    where x.org_id = v_org and x.archived_at is null and x.kind = any (private.receiving_kinds(i.kind)) and public.in_scope_wh(x.id)
      and public.in_scope_book(case when x.kind = any (private.receiving_kinds(i.kind)) then private.receipt_book(x.id) end));
  select coalesce(sum(s.qty), 0) into v_on_hand from public.stock_balances s
  where s.org_id = v_org and s.item_id = i.id and public.in_scope_wh(s.warehouse_id);
  with buys as (
    select x.id as line_id, r.id as doc_id, r.doc_no, r.received_on, r.posted_at, r.party_id, t.name as party_name, y.name as warehouse_name,
      r.book_id, l.id as lot_id, l.qty_in,
      (pp.id is not null and pp.unit_price is null and rv.new_total is null) as unpriced,
      coalesce(rv.new_total, la.line_total, 0) as line_total, rv.new_total is not null and rv.unit_price is null as corrected,
      case when pp.id is not null and pp.unit_price is null and rv.new_total is null then null
        when rv.unit_price is not null then rv.unit_price
        when rv.new_total is not null then private._mul_div_round(1, rv.new_total, l.qty_in, 2)
        else coalesce(pp.unit_price, private._mul_div_round(1, coalesce(la.line_total, 0), l.qty_in, 2)) end as unit_price,
      pp.sell_price,
      case when coalesce(a.paid_now, 0) > 0 and coalesce(a.paid_now, 0) >= coalesce(la.line_total, 0) then 'cash' else 'credit' end as payment
    from public.stock_lots l
    join public.receipts r on r.org_id = l.org_id and r.id = l.source_id
    join public.receipt_lines x on x.org_id = l.org_id and x.id = l.source_line_id
    join public.parties t on t.org_id = r.org_id and t.id = r.party_id
    join public.warehouses y on y.org_id = l.org_id and y.id = l.warehouse_id
    left join public.receipt_line_amounts la on la.org_id = x.org_id and la.line_id = x.id
    left join public.receipt_amounts a on a.org_id = r.org_id and a.doc_id = r.id
    left join public.purchase_prices pp on pp.org_id = x.org_id and pp.line_id = x.id
    left join lateral (
      select v.new_total, v.unit_price from public.receipt_revaluations v
      where v.org_id = x.org_id and v.receipt_line_id = x.id and v.status = 'posted' order by v.rev_no desc limit 1
    ) as rv on true
    where l.org_id = v_org and l.item_id = i.id and l.source_kind = 'receipt' and l.origin_lot_id is null and r.status = 'posted'
      and public.in_scope_wh(l.warehouse_id)
  ), ordered as (
    select b.*, row_number() over (order by b.received_on desc, b.posted_at desc, b.line_id desc) as n,
      -- «أكمل السعر» بالقاعدة التي يفرضها التسعير (revalue_plan): الدفتر بنطاقه، وكلّ مخزن فيه من الشراء متبقٍّ بنطاقه (مراجعة 0020 L2).
      v_record and b.unpriced and public.in_scope_book(b.book_id) and not exists (
        select 1 from public.stock_lots f where f.org_id = v_org and (f.id = b.lot_id or f.origin_lot_id = b.lot_id) and f.qty_left > 0
          and not public.in_scope_wh(f.warehouse_id)) as can_price from buys b
  )
  select count(*)::int, coalesce(sum(o.qty_in), 0), coalesce(sum(o.qty_in) filter (where not o.unpriced), 0), coalesce(sum(o.line_total), 0),
    (array_agg(o.unit_price order by o.n) filter (where not o.unpriced))[1], (count(*) filter (where o.unpriced))::int, coalesce(bool_or(o.can_price), false),
    coalesce(jsonb_agg(jsonb_build_object('line_id', o.line_id, 'doc_id', o.doc_id, 'doc_no', o.doc_no, 'received_on', o.received_on,
      'party_id', o.party_id, 'party_name', o.party_name, 'warehouse_name', o.warehouse_name, 'qty', o.qty_in::text, 'payment', o.payment,
      'priced', not o.unpriced, 'can_price', o.can_price,
      'money', jsonb_build_object('unit_price', o.unit_price::text, 'line_total', o.line_total::text, 'sell_price', o.sell_price::text,
        'corrected', o.corrected))
      order by o.n) filter (where o.n <= 200), '[]'::jsonb)
  into v_count, v_qty, v_priced_qty, v_value, v_last, v_unpriced, v_can_price, v_rows
  from ordered o;
  select s.sell_price into v_sell from public.item_prices s where s.org_id = v_org and s.item_id = i.id;
  v_live := i.archived_at is null and v_on_hand > 0;
  v_uses := private.item_uses(i.id);
  -- يبيع: مادّة فعّالة في مخزن بنطاقه فيه منها رصيد، ودفتر وحدة ذلك المخزن بنطاقه (قيد الجهة يُكتب فيه، book_for_post).
  v_can_sell := public.can('sale.record') and i.archived_at is null and i.kind not in ('hatching_egg', 'chick', 'table_egg') and exists (
    select 1 from public.stock_balances b join public.warehouses w on w.org_id = b.org_id and w.id = b.warehouse_id
    join public.ledger_books k on k.org_id = w.org_id and k.division_id = w.division_id and k.code = 'main'
    where b.org_id = v_org and b.item_id = i.id and b.qty > 0 and w.archived_at is null and public.in_scope_wh(w.id) and public.in_scope_book(k.id));
  select coalesce(jsonb_agg(jsonb_build_object('warehouse_id', w.id, 'name', w.name, 'kind', w.kind, 'qty', b.qty::text,
      'available', q.available::text, 'expired', q.expired::text)
    order by w.name collate "C", w.id), '[]'::jsonb)
  into v_stores
  from public.stock_balances b
  join public.warehouses w on w.org_id = b.org_id and w.id = b.warehouse_id
  cross join lateral private.stock_at(i.id, w.id, v_today) as q
  where b.org_id = v_org and b.item_id = i.id and b.qty <> 0 and public.in_scope_wh(w.id);
  v_result := jsonb_build_object('today', v_today, 'can_record', v_can_buy, 'can_edit', public.can('stores.manage'),
    'can_delete', public.can('stores.manage') and cardinality(v_uses) = 0, 'uses', to_jsonb(v_uses),
    'can_convert', public.can('stock_use.post') and v_live and i.kind not in ('hatching_egg', 'chick', 'table_egg'),
    'can_transfer', public.can('transfer.post') and v_live and (select count(*) from public.warehouses w
      where w.org_id = v_org and w.archived_at is null and private.item_admissible(w.kind, i.kind)) > 1,
    'can_sell', v_can_sell,
    'can_price', v_can_price, 'unpriced_count', v_unpriced,
    'item', jsonb_build_object('id', i.id, 'name', i.name, 'kind', i.kind, 'base_unit', i.base_unit, 'version', i.version,
      'density_kg_per_l', i.density_kg_per_l::text, 'archived', i.archived_at is not null, 'tracks_expiry', i.tracks_expiry),
    'on_hand_qty', v_on_hand::text, 'purchased_qty', v_qty::text, 'purchases_count', v_count, 'stores', v_stores,
    'transfer_targets', (select coalesce(jsonb_agg(jsonb_build_object('warehouse_id', w.id, 'name', w.name, 'kind', w.kind)
        order by w.name collate "C", w.id), '[]'::jsonb)
      from public.warehouses w where w.org_id = v_org and w.archived_at is null and private.item_admissible(w.kind, i.kind)),
    'money', jsonb_build_object('purchased_value', v_value::text,
      'avg_unit_price', case when v_priced_qty > 0 then private._mul_div_round(1, v_value, v_priced_qty, 2)::text end,
      'sell_price', v_sell::text, 'last_unit_price', v_last::text),
    'purchases', v_rows, 'more', v_count > 200,
    -- الصناديق الفعّالة لنافذتي «سجّل شراء» و«بِع» (الأمين لا يقرأ جدولها): لمن يسجّل شراء هذه المادّة أو بيعها وحده.
    'cash_accounts', case when v_can_buy or v_can_sell then (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name collate "C", c.id), '[]'::jsonb)
      from public.cash_accounts c where c.org_id = v_org and c.archived_at is null) else '[]'::jsonb end);
  if v_record then
    return v_result;
  end if;
  return private.mask(v_result);
end
$$;

-- بطاقات المواد (0017، ويّا 0020): unpriced_count لكلّ مادّة (مشترياتها بلا سعر بعد)، والمتوسّط من المسعَّر وحده.
create or replace function public.items_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_record boolean;
  v_result jsonb;
begin
  perform private.require('read');
  v_record := public.can('purchase.record');
  with hand as (
    select s.item_id, sum(s.qty) as qty from public.stock_balances s
    where s.org_id = v_org and public.in_scope_wh(s.warehouse_id)
    group by s.item_id
  ), lines as (
    select l.item_id, l.qty_in, r.received_on, coalesce(rv.new_total, la.line_total, 0) as value,
      (pp.id is not null and pp.unit_price is null and rv.new_total is null) as unpriced
    from public.stock_lots l
    join public.receipts r on r.org_id = l.org_id and r.id = l.source_id
    left join public.receipt_line_amounts la on la.org_id = l.org_id and la.line_id = l.source_line_id
    left join public.purchase_prices pp on pp.org_id = l.org_id and pp.line_id = l.source_line_id
    left join lateral (
      select v.new_total from public.receipt_revaluations v
      where v.org_id = l.org_id and v.receipt_line_id = l.source_line_id and v.status = 'posted' order by v.rev_no desc limit 1
    ) as rv on true
    where l.org_id = v_org and l.source_kind = 'receipt' and l.origin_lot_id is null and r.status = 'posted' and public.in_scope_wh(l.warehouse_id)
  ), buys as (
    select x.item_id, sum(x.qty_in) as qty, coalesce(sum(x.qty_in) filter (where not x.unpriced), 0) as priced_qty, sum(x.value) as value,
      max(x.received_on) as last_on, (count(*) filter (where x.unpriced))::int as unpriced
    from lines x group by x.item_id
  )
  select jsonb_build_object('today', public.app_today(), 'can_record', v_record, 'can_add_item', public.can('item.create'),
    'items', coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'kind', i.kind, 'base_unit', i.base_unit,
      'on_hand_qty', coalesce(h.qty, 0)::text, 'purchased_qty', coalesce(u.qty, 0)::text, 'last_purchase_on', u.last_on,
      'unpriced_count', coalesce(u.unpriced, 0),
      'money', jsonb_build_object('sell_price', s.sell_price::text,
        'avg_unit_price', case when u.priced_qty > 0 then private._mul_div_round(1, u.value, u.priced_qty, 2)::text end))
      order by i.name_norm collate "C", i.id), '[]'::jsonb))
  into v_result
  from public.items i
  left join hand h on h.item_id = i.id
  left join buys u on u.item_id = i.id
  left join public.item_prices s on s.org_id = i.org_id and s.item_id = i.id
  where i.org_id = v_org and i.archived_at is null;
  if v_record then
    return v_result;
  end if;
  return private.mask(v_result);
end
$$;

-- ─── ي. الثوابت ─────────────────────────────────────────────────────────────────────────────────────────────────
-- ترتيب السحب يحكم سحب التحويل، وقيد التسعير purchase وقيد التصحيح adjustment (0019 كما هو ويّا الموضعين).
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
  --    flock_issue)، والملغى صفر (حركاته معكوسة وكلفته بصفّ عكسي).
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
      + coalesce((select sum(c.amount) from public.flock_costs c where c.org_id = o.id and c.doc_kind = 'flock_issue'), 0) as outputs
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
  -- 10. ترتيب السحب (القاعدة 12): وقت كل قطعة سحب أصلية بالتحويل والصرف والجرد والصرف لفوج (0019) وتحويل المادّة (0020) ماكو دفعة قبلها بالترتيب (الانتهاء والفارغ أخيراً،
  --     ثم fifo_seq، ثم المعرّف) مؤهّلة بتاريخ السحب (مستلمة بيه أو قبله، وغير منتهية للسحب اللي طبّق قاعدة الانتهاء) وبيها متبقٍّ
  --     قبل القطعة. نقص الجرد المنتهي (expiry_checked = false) يشوف كل الدفعات مؤهّلة، والصالحة كلها بعد المنتهية بالترتيب، فيبقى
  --     الأقدم انتهاءً أوّلاً. السحب من دفعة مسمّاة (إذن المنتهي والإتلاف، والمرتجع WP7) برّا الفحص.
  select 'draw_order', count(*) from public.stock_moves m
  join public.stock_lots l on l.org_id = m.org_id and l.id = m.lot_id
  where m.qty < 0 and m.reverses_move_id is null and m.doc_kind in ('transfer', 'stock_use', 'count', 'flock_issue', 'conversion')
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

create or replace function public.verify_purchases() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  -- ١) كلّ سعر شراء على سطر استلام غير مسوّدة بمادّته ومخزن رأسه، ومبلغ السطر = الكمية × السعر مقرَّباً لأقرب دينار؛ والشراء بلا سعر
  --    (0020) مبلغه صفر بسببه.
  select 'purchase_price_ties', count(*) from public.purchase_prices pp
  where not exists (
    select 1 from public.receipt_lines x
    join public.receipts r on r.org_id = x.org_id and r.id = x.doc_id
    join public.receipt_line_amounts a on a.org_id = x.org_id and a.line_id = x.id
    where x.org_id = pp.org_id and x.id = pp.line_id and x.doc_id = pp.doc_id and r.status <> 'draft'
      and x.item_id = pp.item_id and r.warehouse_id = pp.warehouse_id
      and case when pp.unit_price is null then a.line_total = 0 and a.zero_reason is not null
        else a.line_total = private._mul_div_round(x.qty_in_unit, pp.unit_price, 1, 0) end)
  union all
  -- ٢) لا سعر شراء على مسوّدة: record_purchase تكتبه وترحّل بمعاملتها.
  select 'purchase_price_draft', count(*) from public.purchase_prices pp
  join public.receipts r on r.org_id = pp.org_id and r.id = pp.doc_id
  where r.status = 'draft'
  union all
  -- ٣) التسعير (0020): صفّ تصحيح بسعر وحدة على شراء بلا سعر وحده، من صفر إلى الكمية × السعر مقرَّباً لأقرب دينار؛ وتسعير مرحَّل واحد
  --    لكلّ سطر؛ وتصحيح عاديّ على شراء بلا سعر بعد تسعير مرحَّل قبله فقط.
  select 'purchase_pricing_ties', count(*) from public.receipt_revaluations v
  join public.receipt_lines x on x.org_id = v.org_id and x.id = v.receipt_line_id
  left join public.purchase_prices pp on pp.org_id = v.org_id and pp.line_id = v.receipt_line_id
  where (v.unit_price is not null and (pp.id is null or pp.unit_price is not null or v.old_total <> 0
      or v.new_total <> private._mul_div_round(x.qty_in_unit, v.unit_price, 1, 0)
      or (v.status = 'posted' and exists (select 1 from public.receipt_revaluations z where z.org_id = v.org_id
        and z.receipt_line_id = v.receipt_line_id and z.unit_price is not null and z.status = 'posted' and z.id <> v.id))))
    or (v.unit_price is null and v.status = 'posted' and pp.id is not null and pp.unit_price is null
      and not exists (select 1 from public.receipt_revaluations z where z.org_id = v.org_id and z.receipt_line_id = v.receipt_line_id
        and z.unit_price is not null and z.status = 'posted' and z.rev_no < v.rev_no))
  union all
  -- ٤) لا مرتجع مرحَّل من شراء وهو بلا سعر (مراجعة 0020 M1): كلّ سحب مرتجع من سطر سعره فارغ بعد تسعير مرحَّل له (seq السحب أكبر من علامة
  --    التسعير لمخزنه، والعلامة تحت قفل الرصيد نفسه)، وإلّا فالمورّد حُمِّل ثمن المُرجَع.
  select 'unpriced_returns', count(*) from public.stock_moves m
  join public.supplier_return_lines rl on rl.org_id = m.org_id and rl.id = m.doc_line_id and rl.doc_id = m.doc_id
  join public.purchase_prices pp on pp.org_id = rl.org_id and pp.line_id = rl.receipt_line_id
  where m.doc_kind = 'supplier_return' and m.reverses_move_id is null and pp.unit_price is null
    and not exists (select 1 from public.stock_moves r where r.org_id = m.org_id and r.reverses_move_id = m.id)
    and not exists (select 1 from public.receipt_revaluations v where v.org_id = rl.org_id and v.receipt_line_id = rl.receipt_line_id
      and v.unit_price is not null and v.status = 'posted' and m.seq > coalesce((v.marks ->> m.warehouse_id::text)::bigint, 0))
$$;

create or replace function public.verify_store_ops() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  -- ١) التحويل = حركاته ودفعته: سحب أصليّ من المادّة الأولى بكميتها بالضبط من مخزنها ويومه (سالب كلّه، وقطعة واحدة على الأقلّ)، ودفعة
  --    واحدة من الثانية بمخزنها وكميتها ويومها وقيمتها = −Σ قيم السحب، حركتها الأصلية واحدة بكميتها وقيمتها؛ والمرحَّل بلا عكسية، والملغى
  --    كلّ أصلية منه معكوسة.
  select 'conversion_moves'::text, count(*) from public.stock_conversions c
  cross join lateral (
    select coalesce(sum(-m.qty), 0) as drawn, coalesce(sum(-m.value), 0) as drawn_value, count(*) as pieces,
      count(*) filter (where m.item_id <> c.from_item_id or m.warehouse_id <> c.from_warehouse_id or m.moved_on <> c.converted_on) as foreign_pieces,
      count(*) filter (where exists (select 1 from public.stock_moves r where r.org_id = m.org_id and r.reverses_move_id = m.id)) as reversed
    from public.stock_moves m
    where m.org_id = c.org_id and m.doc_kind = 'conversion' and m.doc_id = c.id and m.reverses_move_id is null and m.qty < 0
  ) as a
  cross join lateral (
    select count(*) as lots,
      count(*) filter (where l.item_id = c.to_item_id and l.warehouse_id = c.to_warehouse_id and l.qty_in = c.to_qty and l.received_on = c.converted_on
        and l.value_in = a.drawn_value and l.origin_lot_id is null and l.expiry_on is null) as good,
      count(*) filter (where (select count(*) from public.stock_moves m where m.org_id = l.org_id and m.lot_id = l.id and m.doc_kind = 'conversion'
        and m.doc_id = c.id and m.reverses_move_id is null and m.qty = c.to_qty and m.value = l.value_in and m.moved_on = c.converted_on) <> 1) as bad_in,
      count(*) filter (where exists (select 1 from public.stock_moves m join public.stock_moves r on r.org_id = m.org_id and r.reverses_move_id = m.id
        where m.org_id = l.org_id and m.lot_id = l.id and m.doc_kind = 'conversion' and m.doc_id = c.id and m.qty > 0)) as in_reversed
    from public.stock_lots l where l.org_id = c.org_id and l.source_kind = 'conversion' and l.source_id = c.id
  ) as b
  where a.drawn <> c.from_qty or a.pieces = 0 or a.foreign_pieces > 0 or b.lots <> 1 or b.good <> 1 or b.bad_in > 0
    or (c.status = 'posted' and (a.reversed > 0 or b.in_reversed > 0)) or (c.status = 'void' and (a.reversed <> a.pieces or b.in_reversed <> 1))
  union all
  -- ٢) كلّ حركة ودفعة conversion من تحويل موجود: السالبة الأصلية بمادّته الأولى ومخزنها، والموجبة الأصلية على دفعته؛ والعكسية لتحويل ملغى.
  select 'conversion_orphans', count(*) from (
    select m.id from public.stock_moves m
    left join public.stock_conversions c on c.org_id = m.org_id and c.id = m.doc_id
    left join public.stock_lots l on l.org_id = m.org_id and l.id = m.lot_id
    where m.doc_kind = 'conversion'
      and (c.id is null or m.doc_line_id is not null
        or (m.reverses_move_id is null and m.qty < 0 and (m.item_id <> c.from_item_id or m.warehouse_id <> c.from_warehouse_id))
        or (m.reverses_move_id is null and m.qty > 0 and (l.source_kind <> 'conversion' or l.source_id <> c.id))
        or (m.reverses_move_id is not null and c.status <> 'void'))
    union all
    select l.id from public.stock_lots l
    left join public.stock_conversions c on c.org_id = l.org_id and c.id = l.source_id
    where l.source_kind = 'conversion' and c.id is null
  ) as v
$$;

-- ─── ك. الصلاحيات ───────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.delete_item(uuid, integer), public.price_purchase(uuid, uuid, numeric, numeric),
  public.record_conversion(uuid, uuid, uuid, numeric, uuid, numeric, date, uuid, uuid), public.void_conversion(uuid, text, uuid),
  public.record_transfer(uuid, uuid, uuid, uuid, numeric, uuid, uuid, date), public.verify_store_ops()
  from public, anon;
grant execute on function public.delete_item(uuid, integer), public.price_purchase(uuid, uuid, numeric, numeric),
  public.record_conversion(uuid, uuid, uuid, numeric, uuid, numeric, date, uuid, uuid), public.void_conversion(uuid, text, uuid),
  public.record_transfer(uuid, uuid, uuid, uuid, numeric, uuid, uuid, date) to authenticated;
revoke all on function public.verify_store_ops() from authenticated;
grant execute on function public.verify_store_ops() to service_role;
