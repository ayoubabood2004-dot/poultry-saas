-- 0017_simple_purchase — المخزن ببساطة: شراء يُحفظ فوراً بنداء واحد، وملفّ لكلّ مادّة، وبطاقات المواد (كلمة المالك 2026-11-06
--   وأجوبته الأربعة؛ DECISIONS «المخزن ببساطة»؛ FOUNDATION ٢٨٤–٢٨٦، ٣٢٨–٣٣٤، ٤٤١–٤٤٧، ٥١٧–٥٢٢، ٥٥٠).
-- المشكلة (مقيسة بالموصل 2026-11-06): في منشأة المالك ثلاث مواد وخمس أوراق استلام كلّها مسوّدة، وصفر استلام مرحَّل، وصفر دفعة
--   مخزون. الشراء مقسوم على شخصين: الأمين يكتب الكمية (receipt.draft)، والمحاسب يكتب المبلغ (receipt.amounts) ثمّ «احفظ نهائياً»،
--   فبقي كلّ شراء معلّقاً؛ ولا قراءة واحدة تقول للمادّة كم عندي منها وكم اشتريت وبأيّ متوسّط.
-- هنا: فعل purchase.record (المالك والمدير والمحاسب والأمين؛ مرآته src/domain/permissions.ts)؛ وجدول purchase_prices (سعر الوحدة
--   كما كُتب وسعر البيع لكلّ شراء، تكتبه record_purchase وحدها)؛ وpublic.record_purchase تكتب الاستلام ورأس مبالغه ومبلغ سطره
--   (الكمية × السعر مقرَّباً لأقرب دينار بـ_mul_div_round، التقريب الوحيد) وترحّله بجسم post_receipt نفسه (نُقل إلى
--   private.post_receipt_core، وpost_receipt = الفعل والمرجع والجسم، سلوكه كما كان حرفاً)، وتكتب item_prices.sell_price إن كُتب سعر
--   بيع (سعر آخر شراء له سعر، جواب المالك ٣)؛ وحارسا السطر والمبالغ يمرّران كتابة record_purchase وحدها بعلامة للمعاملة مربوطة
--   بالمستند وبالمعاملة وبسرّ الخادم (private.purchase_marker)، وكلّ فحوص القيم تبقى؛ والقارئان item_file وitems_overview؛
--   وverify_purchases.
-- انحرافات مكتوبة عن العقد (scratchpad/simple/contract.md):
--   • التحقّق من المعرّف (الإعادة بمعرّف الاستلام نفسه) قبل فحوص المدخلات لا بعدها: شراء حُفظ وضاع جوابه ثمّ أُرشفت مادّته أو
--     مضت أيّامه السبعة يرجع «حُفظ» بنتيجته لا رفضاً يوهم أنّه لم يُحفظ (درس WP5: «المطلوب = انكتب»).
--   • الأقفال بترتيب post_receipt (§2.3) قبل أوّل كتابة: الجهة ← قفل الفترة وصفّ الوحدة ← المخزن والمادّة ← الرصيد ← الصندوق؛ لأنّ
--     إدراج رأس المبالغ يقفل صفّ الصندوق بالمفتاح الأجنبي (key share) ثمّ يرقّيه الترحيل (for update)، فشراءان نقداً من صندوق واحد
--     كانا يتقافلان (40P01). ولا قفل for no key update على المادّة لسعر البيع: الترحيل يقفلها for share بموضعها، فالترقية بعده
--     تتقافل مع شراء ثانٍ للمادّة نفسها؛ وقفل المشاركة نفسه يرتّبها مع set_item_sell_price (for no key update) فيرى أحدهما الآخر.
--   • رفوض المخزن المختار بأسمائها كبقيّة القاعدة: warehouse_not_found وwarehouse_archived وout_of_scope وwrong_receiving_store؛
--     والمادّة التي تتابع الانتهاء (expiry_required) والأفراخ (born_at_required) تُرفض قبل أيّ كتابة بتلميح يقول إنّ الشراء السريع لا
--     يكتب التاريخ؛ والمخزن الذي يُكتب دين مورّده في دفتر وحدة خارج نطاق الكاتب يُرفض out_of_scope بتلميح يسمّي الدفتر (قاعدة
--     book_for_post نفسها، E49: الأمين المحصور بمخزن دون وحدته لا يكتب في دفتر الوحدة؛ قرار للمالك).
--   • item_file يزيد cash_accounts (الصناديق الفعّالة بالاسم، لمن يسجّل الشراء): الأمين لا يقرأ جدول الصناديق (accountsRestricted)،
--     وجواب المالك ١ يجعله يختار «نقداً من الصندوق».
--   • لا بيانات تُكتب بالهجرة (العقد ٢.٧).
-- تراجع: rollback_0017.sql — يرجّع جسمَي private.actions وprivate.role_can (كما في 0013) وpost_receipt وprivate.receipt_lines_guard
--   وprivate.receipt_amounts_guard (كما في 0009) حرفاً بحرف، ويُسقط record_purchase وitem_file وitems_overview وverify_purchases
--   وpost_receipt_core ومساعدات العلامة والنتيجة، وسياسة نطاق سجلّ التدقيق، وجدول purchase_prices. **طريق رفض**: أيّ صفّ في
--   purchase_prices يوقف التراجع بصوت بلا أن يحذف شيئاً (سعر الوحدة كما كُتب وسعر البيع لكلّ شراء لا يُستخرجان من مكان آخر).
-- تنعاد بأمان: create table if not exists، وcreate or replace، وcreate index if not exists، وكتل do تفحص الكتالوج قبل القيود والسياسات.

set lock_timeout = '5s';

-- ─── أ. فعل «يسجّل الشراء» (جواب المالك ٢) ──────────────────────────────────────────────────────────────────────
-- نفس أفعال 0013 ويّاه purchase.record، وجدول الأدوار نفسه ويّا الفعل للمحاسب والأمين (والمدير بكلّ الأفعال، والمالك كلّها).
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
  return case p_role
    when 'manager' then true
    when 'accountant' then p_action in ('receipt.amounts', 'costs.load', 'production.post', 'sale.post', 'payment.post', 'sale_return.post', 'expense.post', 'accounts.view',
      'parties.manage', 'party.create', 'cash_accounts.manage', 'expense_categories.manage', 'purchase.record')
    when 'storekeeper' then p_action in ('receipt.draft', 'transfer.post', 'issue.post', 'count.enter', 'stock_use.post', 'party.create', 'purchase.record')
    when 'mill_operator' then p_action = 'production.draft' or (p_action = 'production.post' and coalesce(p_costs_confirmed, false))
    when 'hatchery_operator' then p_action = 'hatch.operate'
    when 'hall_worker' then p_action in ('flock_day.save', 'weigh_ticket.draft')
    else false
  end;
end
$$;

-- ─── ب. سعر الشراء وسعر البيع لكلّ شراء (جواب المالك ٣) ────────────────────────────────────────────────────────────
-- صفّ واحد لكلّ سطر استلام كتبته record_purchase: السعر كما كتبه المستخدم (المبلغ = الكمية × السعر مقرَّباً لأقرب دينار، فلا
-- يُستخرج السعر من المبلغ بلا فقد)، وسعر البيع إن كُتب. القراءة لأدوار الكلفة ولمن يسجّل الشراء بنطاق المخزن، والكتابة للدالّة وحدها.
create table if not exists public.purchase_prices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  doc_id uuid not null,
  line_id uuid not null,
  warehouse_id uuid not null,
  item_id uuid not null,
  unit_price numeric not null,
  sell_price numeric,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint purchase_prices_unit_price_check check (abs(unit_price) < 'Infinity' and unit_price > 0 and unit_price = round(unit_price, 2)),
  constraint purchase_prices_sell_price_check check (sell_price is null or (abs(sell_price) < 'Infinity' and sell_price > 0 and sell_price = round(sell_price, 2))),
  unique (org_id, id),
  unique (org_id, line_id),
  foreign key (org_id, doc_id, line_id) references public.receipt_lines (org_id, doc_id, id),
  foreign key (org_id, doc_id, warehouse_id) references public.receipts (org_id, id, warehouse_id),
  foreign key (org_id, item_id) references public.items (org_id, id)
);
create index if not exists purchase_prices_line on public.purchase_prices (org_id, doc_id, line_id);
create index if not exists purchase_prices_doc on public.purchase_prices (org_id, doc_id, warehouse_id);
create index if not exists purchase_prices_item on public.purchase_prices (org_id, item_id);

create or replace trigger audit_purchase_prices after insert or update or delete on public.purchase_prices
  for each row execute function private.audit_row();

alter table public.purchase_prices enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_prices' and policyname = 'purchase_prices_read') then
    create policy purchase_prices_read on public.purchase_prices for select to authenticated
      using (org_id = (select public.auth_org()) and ((select public.can_see_cost()) or (select public.can('purchase.record')))
        and (select public.in_scope_wh(warehouse_id)));
  end if;
  -- سجلّ التدقيق يحمل الصفّ كلّه (E49): صفوف أسعار الشراء بمخزنها، مثل سياسة قراءة الجدول نفسه.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'audit_log_purchase_scope') then
    create policy audit_log_purchase_scope on public.audit_log as restrictive for select to authenticated
      using (case
        when table_name = 'purchase_prices' then public.in_scope_wh((coalesce("new", "old") ->> 'warehouse_id')::uuid)
        else true
      end);
  end if;
end
$$;

revoke all on table public.purchase_prices from anon, authenticated;
grant select on table public.purchase_prices to authenticated;
revoke truncate on table public.purchase_prices from service_role;

-- ─── ج. علامة الشراء للمعاملة (العقد ٢.٢ البند ٥) ───────────────────────────────────────────────────────────────
-- حارسا سطر الاستلام ومبالغه يطلبان receipt.draft وreceipt.amounts مع رؤية الكلفة (المحاسب بلا الأوّل، والأمين بلا الثاني)؛ وكتابة
-- record_purchase تمرّ منهما بعلامة تضعها هي وحدها قبل كتاباتها وتمسحها بعدها. العلامة بصمة بسرّ الخادم (private.plan_secret) على
-- المستند والمعاملة، فلا تُزوَّر بـset_config (ولو وصلها عميل) ولا تصلح لمستند آخر ولا لمعاملة أخرى؛ والكتابة المباشرة تبقى بسياساتها
-- (RLS بفعل كلّ جدول) وحرّاسها كما هي. بلا سرّ: لا علامة (null)، والمقارنة false لا «مساوية».
create or replace function private.purchase_marker(p_doc uuid) returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_secret text;
begin
  select s.secret into v_secret from private.plan_secret s where s.id;
  if v_secret is null or p_doc is null then
    return null;
  end if;
  return md5(v_secret || ':purchase_doc:' || p_doc::text || ':' || txid_current()::text);
end
$$;

create or replace function private.purchase_pass(p_doc uuid) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_mark text := coalesce(current_setting('poultry.purchase_doc', true), '');
begin
  if v_mark = '' or p_doc is null then
    return false;
  end if;
  return coalesce(v_mark = private.purchase_marker(p_doc), false);
end
$$;

-- ─── د. الحارسان (0009 حرفاً، والفعل وحده يمرّ بالعلامة) ──────────────────────────────────────────────────────────
-- حارس سطر الاستلام كما في 0009، إلّا أنّ receipt.draft لا يُطلب لكتابة record_purchase لمستندها (المحاسب يسجّل الشراء)؛ والرأس
-- والمسوّدة والنطاق والمادّة والمخزن والوحدة والكمية ولقطاتها كلّها تُفحص كما كانت.
create or replace function private.receipt_lines_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d public.receipts;
  w public.warehouses;
  i public.items;
  u public.item_units;
  g public.units;
begin
  set local lock_timeout = '5s';
  if tg_op = 'UPDATE' and new.doc_id is distinct from old.doc_id then
    raise exception 'frozen_column' using hint = 'السطر يبقى في مستنده.';
  end if;
  select * into d from public.receipts where org_id = new.org_id and id = new.doc_id for update;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'الاستلام مرحَّل أو ملغى؛ لا تُعدَّل سطوره.';
  end if;
  -- كتابة record_purchase لمستندها (علامة المعاملة) لا تطلب receipt.draft: المحاسب يسجّل الشراء (قرار المالك 2026-11-06).
  if not private.purchase_pass(d.id) then
    perform private.require('receipt.draft');
  end if;
  if not public.in_scope_wh(d.warehouse_id) then
    raise exception 'out_of_scope' using hint = 'مخزن هذا الاستلام خارج نطاقك.';
  end if;
  new.warehouse_id := d.warehouse_id;
  if tg_op = 'INSERT' then
    new.line_no := coalesce((select max(l.line_no) from public.receipt_lines l where l.org_id = d.org_id and l.doc_id = d.id), 0) + 1;
  else
    new.line_no := old.line_no;
  end if;
  select * into i from public.items where org_id = d.org_id and id = new.item_id;
  if i.id is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  select * into w from public.warehouses where org_id = d.org_id and id = d.warehouse_id;
  if not private.item_admissible(w.kind, i.kind) then
    raise exception 'item_kind_mismatch' using hint = format('«%s» لا يُخزَّن في «%s»: نوع المادّة لا يناسب نوع المخزن.', i.name, w.name);
  end if;
  if not (w.kind = any (private.receiving_kinds(i.kind))) then
    raise exception 'wrong_receiving_store' using hint = format('«%s» لا تُستلم من المورّد في «%s»؛ تُستلم في مخزن الوحدة صاحبة نوعها ثم تُحوَّل.', i.name, w.name);
  end if;
  if new.qty_in_unit is null or not (abs(new.qty_in_unit) < 'Infinity') or new.qty_in_unit <= 0 then
    raise exception 'qty_not_positive' using hint = 'اكتب كمية أكبر من صفر.';
  end if;
  if new.item_unit_id is not null then
    select * into u from public.item_units where org_id = d.org_id and id = new.item_unit_id;
    if u.id is null or u.item_id <> new.item_id then
      raise exception 'unit_mismatch' using hint = 'وحدة التعبئة المختارة ليست لهذه المادّة. اختر وحدة من وحداتها.';
    end if;
    if not u.for_purchase or (u.party_id is not null and u.party_id <> d.party_id) then
      raise exception 'unit_mismatch' using hint = format('«%s» ليست وحدة شراء من هذا المورّد. اختر وحدة شراء عامّة أو خاصّة بمورّد الاستلام.', u.label);
    end if;
    new.unit_code := null;
    new.unit_label := u.label;
    new.factor := u.factor_to_base;
  elsif new.unit_code is not null then
    select * into g from public.units where code = new.unit_code;
    if g.code is null or g.base <> i.base_unit then
      raise exception 'unit_mismatch' using hint = 'الوحدة لا تناسب وحدة أساس المادّة.';
    end if;
    new.unit_label := g.code;
    new.factor := g.factor;
  else
    new.unit_label := i.base_unit;
    new.factor := 1;
  end if;
  new.qty_base := private.to_base(new.qty_in_unit, new.factor, i.base_unit);
  if new.qty_base <= 0 then
    raise exception 'qty_not_positive' using hint = 'الكمية بوحدة الأساس قُرِّبت إلى صفر. اكتب كمية أكبر.';
  end if;
  new.base_unit := i.base_unit;
  new.density_kg_per_l := i.density_kg_per_l;
  new.piece_mass_kg := i.piece_mass_kg;
  new.supplier_lot_no := nullif(btrim(new.supplier_lot_no), '');
  update public.receipts set version = version + 1 where org_id = d.org_id and id = d.id;
  return new;
end
$$;

-- حارس المبالغ كما في 0009، إلّا أنّ receipt.amounts ورؤية الكلفة لا يُطلبان لكتابة record_purchase لمستندها (الأمين يسجّل الشراء)؛
-- والمسوّدة والنطاق وقيم المبلغ والخصم والمدفوع كلّها تُفحص كما كانت.
create or replace function private.receipt_amounts_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d public.receipts;
  ln public.receipt_lines;
  v_doc uuid;
  v_computed constant text[] := array['discount_share', 'charge_share', 'party_entry_id', 'cash_move_id', 'all_lines'];
begin
  set local lock_timeout = '5s';
  if tg_op = 'UPDATE' and (to_jsonb(new) - v_computed) = (to_jsonb(old) - v_computed) and to_jsonb(new) <> to_jsonb(old) then
    return new;
  end if;
  if tg_table_name = 'receipt_line_amounts' then
    if tg_op = 'UPDATE' and new.line_id is distinct from old.line_id then
      raise exception 'frozen_column' using hint = 'المبلغ يبقى على سطره.';
    end if;
    if tg_op = 'INSERT' then
      select * into ln from public.receipt_lines where org_id = new.org_id and id = new.line_id for key share;
    else
      select * into ln from public.receipt_lines where org_id = new.org_id and id = new.line_id;
    end if;
    if ln.id is null then
      raise exception 'line_not_found' using hint = 'سطر الاستلام غير موجود. حدّث الشاشة.';
    end if;
    v_doc := ln.doc_id;
    new.doc_id := ln.doc_id;
  else
    if tg_op = 'UPDATE' and new.doc_id is distinct from old.doc_id then
      raise exception 'frozen_column' using hint = 'المبلغ يبقى على مستنده.';
    end if;
    v_doc := new.doc_id;
  end if;
  select * into d from public.receipts where org_id = new.org_id and id = v_doc for update;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'الاستلام مرحَّل أو ملغى؛ لا تُعدَّل مبالغه.';
  end if;
  -- كتابة record_purchase لمستندها (علامة المعاملة) لا تطلب receipt.amounts ولا رؤية الكلفة: الأمين يسجّل الشراء بسعره
  -- (قرار المالك 2026-11-06).
  if not private.purchase_pass(d.id) then
    perform private.require('receipt.amounts');
    if not public.can_see_cost() then
      raise exception 'forbidden' using hint = 'مبالغ الاستلام لأدوار الكلفة فقط.';
    end if;
  end if;
  if not public.in_scope_wh(d.warehouse_id) then
    raise exception 'out_of_scope' using hint = 'مخزن هذا الاستلام خارج نطاقك.';
  end if;
  new.warehouse_id := d.warehouse_id;
  if tg_table_name = 'receipt_line_amounts' then
    if new.line_total is null or not (abs(new.line_total) < 'Infinity') or new.line_total < 0 then
      raise exception 'value_required' using hint = 'اكتب مبلغ السطر كما في فاتورة المورّد؛ الصفر يُقبل مع سببه فقط.';
    end if;
    if new.line_total <> round(new.line_total, 0) then
      raise exception 'amount_not_whole_dinar' using hint = 'مبلغ سطر الاستلام بالدينار الصحيح كما يحاسبك المورّد؛ الفلس يظهر في قيمة الدفعات فقط.';
    end if;
    new.zero_reason := nullif(btrim(new.zero_reason), '');
  elsif tg_table_name = 'receipt_amounts' then
    if new.discount is null or not (abs(new.discount) < 'Infinity') or new.discount < 0
       or new.paid_now is null or not (abs(new.paid_now) < 'Infinity') or new.paid_now < 0 then
      raise exception 'amount_required' using hint = 'اكتب الخصم والمدفوع أرقاماً لا تقلّ عن صفر.';
    end if;
    if new.discount <> round(new.discount, 0) or new.paid_now <> round(new.paid_now, 0) then
      raise exception 'amount_not_whole_dinar' using hint = 'خصم الفاتورة والمدفوع عند الاستلام بالدينار الصحيح، دون كسور.';
    end if;
  else
    if tg_op = 'INSERT' then
      new.charge_no := coalesce((select max(c.charge_no) from public.receipt_charges c where c.org_id = d.org_id and c.doc_id = d.id), 0) + 1;
      new.all_lines := true;
      new.party_entry_id := null;
      new.cash_move_id := null;
    else
      new.charge_no := old.charge_no;
    end if;
    new.label := btrim(new.label);
    if new.amount is null or not (abs(new.amount) < 'Infinity') or new.amount <= 0 then
      raise exception 'amount_not_positive' using hint = 'مبلغ التحميل أكبر من صفر.';
    end if;
    if new.amount <> round(new.amount, 0) then
      raise exception 'amount_not_whole_dinar' using hint = 'مبلغ التحميل بالدينار الصحيح: يدخل دفتر الناقل أو الصندوق.';
    end if;
    if num_nonnulls(new.payee_party_id, new.cash_account_id) <> 1 then
      raise exception 'charge_payee_required' using hint = 'اختر لمن يُدفع التحميل: جهة (ناقل) يُسجَّل لها في دفترها، أو صندوق يُدفع منه الآن — واحداً منهما فقط.';
    end if;
  end if;
  update public.receipts set version = version + 1 where org_id = d.org_id and id = d.id;
  return new;
end
$$;

-- ─── هـ. الترحيل بجسم واحد ────────────────────────────────────────────────────────────────────────────────────
-- جسم post_receipt كما في 0009 حرفاً بلا الفعل والمرجع (العقد ٢.٢ البند ٤): يناديه post_receipt وrecord_purchase، فالدفعة والحركة
-- وقيد المورّد والدفع عند الاستلام وحركة الصندوق ورقم PU وختم الوحدة من مكان واحد. يرجّع النتيجة بلا قناع (المتّصل يقنّعها).
create or replace function private.post_receipt_core(p_id uuid, p_expected_version int, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d public.receipts;
  w public.warehouses;
  b public.ledger_books;
  p public.parties;
  ln public.receipt_lines;
  c public.receipt_charges;
  l public.stock_lots;
  e public.party_entries;
  m public.cash_moves;
  v_parties uuid[];
  v_items uuid[];
  v_boxes uuid[];
  v_box uuid;
  v_date date;
  v_val jsonb;
  v_row jsonb;
  v_value numeric;
  v_net numeric;
  v_paid numeric;
  v_no text;
  v_purchase uuid;
  v_lots jsonb := '[]'::jsonb;
begin
  set local lock_timeout = '5s';
  select * into d from public.receipts where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(d.warehouse_id, true);
  -- الجهات من المستند بلا قفل (E9)، وتنفحص بعد قفله.
  v_parties := private.receipt_parties(d.id);
  perform private.lock_parties(v_parties);
  v_date := d.received_on;
  perform private.check_post_date(v_date, w.division_id);
  perform private.lock_receipt_rows(d.id);
  select * into d from public.receipts where org_id = w.org_id and id = p_id for update;
  if d.status <> 'draft' then
    raise exception 'not_draft' using hint = 'هذا المستند ليس مسوّدة: رُحّل أو أُلغي من قبل.';
  end if;
  if p_expected_version is null or d.version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّرت المسوّدة بعد المعاينة. راجعها وعاينها من جديد قبل الترحيل.';
  end if;
  if d.received_on is distinct from v_date or not (private.receipt_parties(d.id) <@ v_parties) then
    raise exception 'stale_draft' using hint = 'تغيّر تاريخ المسوّدة أو مورّدها أو ناقل أحد تحميلاتها أثناء الترحيل. راجعها وعاينها من جديد.';
  end if;
  select array_agg(distinct x.item_id) into v_items from public.receipt_lines x where x.org_id = d.org_id and x.doc_id = d.id;
  if v_items is null then
    raise exception 'receipt_empty' using hint = 'الاستلام بلا سطور. أضف سطراً واحداً على الأقلّ.';
  end if;
  b := private.book_for_post(private.receipt_book(w.id));
  p := private.party_for_post(d.party_id);
  if p.archived_at is not null then
    raise exception 'party_archived' using hint = format('المورّد «%s» مؤرشف، فلا يُسجَّل منه استلام جديد. أعِده من الأرشيف أوّلاً.', p.name);
  end if;
  perform private.lock_masters(array[w.id], v_items, true);
  for ln in select * from public.receipt_lines x where x.org_id = d.org_id and x.doc_id = d.id order by x.line_no loop
    perform private.raise_receipt_problem(private.receipt_line_problem(w, d, ln));
  end loop;
  v_val := private.receipt_valuation(d.id);
  perform private.raise_receipt_problem(v_val -> 'problem');
  v_net := (v_val ->> 'net')::numeric;
  v_paid := (v_val ->> 'paid_now')::numeric;
  perform private.lock_balances(v_items, array_fill(w.id, array[cardinality(v_items)]));
  v_boxes := array(
    select distinct x.id from (
      select (v_val ->> 'cash_account_id')::uuid as id where v_paid > 0
      union all
      select y.cash_account_id from public.receipt_charges y where y.org_id = d.org_id and y.doc_id = d.id and y.cash_account_id is not null
    ) as x where x.id is not null order by x.id);
  foreach v_box in array v_boxes loop
    perform private.lock_cash_account(v_box, true);
  end loop;
  for v_row in select x.value from jsonb_array_elements(v_val -> 'lines') with ordinality as x(value, n) order by x.n loop
    select * into ln from public.receipt_lines where org_id = d.org_id and id = (v_row ->> 'line_id')::uuid;
    v_value := (v_row ->> 'value')::numeric;
    l := private.new_lot(ln.item_id, w.id, d.received_on, ln.expiry_on, ln.born_at, ln.qty_base, v_value, 'receipt', d.id, ln.id);
    if ln.supplier_lot_no is not null then
      update public.stock_lots set supplier_lot_no = ln.supplier_lot_no where org_id = l.org_id and id = l.id;
    end if;
    perform private.apply_move(l.id, 'receipt', d.id, ln.id, ln.qty_base, v_value, d.received_on, null);
    update public.receipt_line_amounts set discount_share = (v_row ->> 'discount_share')::numeric, charge_share = (v_row ->> 'charge_share')::numeric
    where org_id = d.org_id and line_id = ln.id;
    v_lots := v_lots || jsonb_build_array(jsonb_build_object('line_id', ln.id, 'lot_id', l.id, 'item_id', ln.item_id, 'qty', ln.qty_base::text,
      'money', jsonb_build_object('value', v_value::text)));
  end loop;
  insert into public.receipt_charge_shares (org_id, doc_id, warehouse_id, charge_id, line_id, share)
  select d.org_id, d.id, d.warehouse_id, (x.value ->> 'charge_id')::uuid, (s.value ->> 'line_id')::uuid, (s.value ->> 'share')::numeric
  from jsonb_array_elements(v_val -> 'charges') as x cross join lateral jsonb_array_elements(x.value -> 'shares') as s;
  v_no := private.next_doc_no('PU', d.received_on);
  if v_net > 0 then
    e := private.write_entry(gen_random_uuid(), d.party_id, b.id, 'purchase', -v_net, 'receipt', d.id, v_no, d.received_on, null);
    v_purchase := e.id;
  end if;
  for c in select * from public.receipt_charges x where x.org_id = d.org_id and x.doc_id = d.id order by x.charge_no loop
    if c.payee_party_id is not null then
      e := private.write_entry(gen_random_uuid(), c.payee_party_id, b.id, 'purchase', -c.amount, 'receipt', d.id, v_no, d.received_on, null);
      perform private.allocate_entry(e.id, null);
      update public.receipt_charges set party_entry_id = e.id where org_id = c.org_id and id = c.id;
    else
      m := private.write_cash_move(c.cash_account_id, -c.amount, 'receipt_charge', 'receipt', d.id, null, d.received_on, null, c.label);
      update public.receipt_charges set cash_move_id = m.id where org_id = c.org_id and id = c.id;
    end if;
  end loop;
  -- المدفوع عند الفاتورة يروح لفاتورته هي (FOUNDATION ٤٩٥)، وبعده متبقّي قيد المورّد يتوزّع من الأقدم.
  if v_paid > 0 then
    e := private.write_entry(gen_random_uuid(), d.party_id, b.id, 'payout', v_paid, 'receipt', d.id, v_no, d.received_on, null);
    perform private.allocate_entry(e.id, v_purchase);
    perform private.write_cash_move((v_val ->> 'cash_account_id')::uuid, -v_paid, 'receipt_paid', 'receipt', d.id, e.id, d.received_on, null, null);
  end if;
  if v_purchase is not null then
    perform private.allocate_entry(v_purchase, null);
  end if;
  update public.receipts set status = 'posted', doc_no = v_no, book_id = b.id, client_ref = p_client_ref, posted_at = now(), posted_by = auth.uid()
  where org_id = d.org_id and id = d.id;
  perform private.mark_division_posted(w.division_id);
  return jsonb_build_object('id', d.id, 'kind', 'receipt', 'status', 'posted', 'doc_no', v_no,
    'party_id', d.party_id, 'warehouse_id', w.id, 'book_id', b.id, 'received_on', d.received_on, 'lots', v_lots,
    'money', jsonb_build_object('lines_total', v_val ->> 'lines_total', 'discount', v_val ->> 'discount', 'net', v_val ->> 'net',
      'paid_now', v_val ->> 'paid_now', 'charges_total', v_val ->> 'charges_total'));
end
$$;

-- الترحيل (receipt.amounts) كما كان: الفعل ثمّ المرجع ثمّ الجسم، والنتيجة مخزّنة ومقنّعة بـref_store.
create or replace function public.post_receipt(p_id uuid, p_expected_version int, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'post_receipt';
  v_cached jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('receipt.amounts');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'version', p_expected_version));
  if v_cached is not null then
    return v_cached;
  end if;
  return private.ref_store(v_fn, p_client_ref, private.post_receipt_core(p_id, p_expected_version, p_client_ref));
end
$$;

-- ─── و. الشراء بنداء واحد ─────────────────────────────────────────────────────────────────────────────────────
-- اسم نوع المخزن المستلِم في التلميحات («مخزن مواد أوّلية أو مخزن عامّ» للتعبئة).
create or replace function private.store_kinds_label(p_kinds text[]) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select coalesce(string_agg(case x.k
    when 'raw' then 'مخزن مواد أوّلية'
    when 'feed' then 'مخزن علف'
    when 'medicine' then 'مخزن أدوية'
    when 'general' then 'مخزن عامّ'
    when 'hatching_egg' then 'مخزن بيض تفقيس'
    when 'chick' then 'مخزن أفراخ'
    else x.k
  end, ' أو ' order by x.n), '')
  from unnest(p_kinds) with ordinality as x(k, n)
$$;

-- نتيجة الشراء من صفوفه (العقد ٢.٢ البند ٦): نفسها لأوّل نداء وللإعادة بالمعرّف. المال داخل money، وrecord_purchase لا تقنّعه (من يسجّل
-- الشراء يرى سعره، جواب المالك ٢).
create or replace function private.purchase_result(p_doc uuid, p_line uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', r.id, 'doc_no', r.doc_no, 'line_id', x.id, 'lot_id', l.id, 'item_id', x.item_id,
    'warehouse_id', r.warehouse_id, 'warehouse_name', w.name, 'received_on', r.received_on, 'qty', x.qty_in_unit::text,
    'payment', case when coalesce(a.paid_now, 0) > 0 then 'cash' else 'credit' end,
    'party_id', r.party_id, 'party_name', t.name,
    'money', jsonb_build_object('unit_price', pp.unit_price::text, 'line_total', la.line_total::text, 'sell_price', pp.sell_price::text,
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
  where r.org_id = public.auth_org() and r.id = p_doc
$$;

-- الشراء (purchase.record): مادّة واحدة من مورّد بكمية وسعر وحدة، بالدين على المورّد أو نقداً من صندوق، يُحفظ ويُرحَّل بمعاملة واحدة
-- ومرجع client_ref (FOUNDATION ١٩٩، القاعدة 10). المعرّفات تولد بالجهاز مرّة لكلّ نموذج: الإعادة بالمرجع نفسه ترجع النتيجة المخزّنة،
-- والإعادة بمعرّف الاستلام نفسه بمحتواه ترجعها كذلك، وبغير محتواه id_conflict. المخزن يُختار من نوع المادّة (receiving_kinds) بنطاق
-- الكاتب: واحد ← هو، ولا واحد ← no_receiving_store، وأكثر ← store_required بأسمائها (والشاشة تعيد بالمعرّفات نفسها ومعها المخزن).
create or replace function public.record_purchase(p_client_ref uuid, p_receipt_id uuid, p_line_id uuid, p_item uuid, p_party uuid,
  p_received_on date, p_qty numeric, p_unit_price numeric, p_sell_price numeric, p_payment text, p_cash_account uuid, p_warehouse uuid) returns jsonb
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
begin
  set local lock_timeout = '5s';
  perform private.require('purchase.record');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('receipt', p_receipt_id, 'line', p_line_id, 'item', p_item,
    'party', p_party, 'on', p_received_on, 'qty', p_qty, 'price', p_unit_price, 'sell', p_sell_price, 'payment', p_payment,
    'box', p_cash_account, 'warehouse', p_warehouse));
  if v_cached is not null then
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
          and pp.unit_price = p_unit_price and pp.sell_price is not distinct from p_sell_price
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

  -- المادّة: موجودة وفعّالة وتُشترى من مورّد، والشراء السريع لا يكتب تاريخ انتهاء ولا وقت فقس.
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
  if i.kind = 'chick' then
    raise exception 'born_at_required' using hint = format('«%s» أفراخ يُكتب وقت فقسها، وتسجيل الشراء السريع لا يكتبه. سجّل شراءها من صفحة الاستلام.', i.name);
  end if;
  if i.tracks_expiry then
    raise exception 'expiry_required' using hint = format('«%s» تتابع تاريخ الانتهاء، وتسجيل الشراء السريع لا يكتب التاريخ. سجّل شراءها من صفحة الاستلام.', i.name);
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

  -- الكمية بوحدة أساس المادّة، والسعر لكلّ وحدة، والمبلغ بالدينار الصحيح (القاعدة 7، التقريب الوحيد نصفاً بعيداً عن الصفر).
  if p_qty is null or not (abs(p_qty) < 'Infinity') or p_qty <= 0 or p_qty <> round(p_qty, 3) then
    raise exception 'qty_not_positive' using hint = format('اكتب كمية «%s» أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.', i.name);
  end if;
  if i.base_unit = 'pc' and p_qty <> round(p_qty, 0) then
    raise exception 'pieces_not_whole' using hint = format('«%s» تُعدّ بالقطعة؛ اكتب عدداً صحيحاً من القطع.', i.name);
  end if;
  if p_unit_price is null or not (abs(p_unit_price) < 'Infinity') or p_unit_price <= 0 or p_unit_price <> round(p_unit_price, 2) then
    raise exception 'bad_price' using hint = 'سعر الشراء لكلّ وحدة أكبر من صفر، بمرتبتين عشريتين كحدّ أقصى.';
  end if;
  v_total := private._mul_div_round(p_qty, p_unit_price, 1, 0);
  if v_total = 0 then
    raise exception 'total_zero' using hint = 'مجموع الشراء يُقرَّب إلى صفر دينار. راجع الكمية والسعر.';
  end if;
  if p_sell_price is not null and not (abs(p_sell_price) < 'Infinity' and p_sell_price > 0 and p_sell_price = round(p_sell_price, 2)) then
    raise exception 'bad_price' using hint = 'سعر البيع لكلّ وحدة أكبر من صفر، بمرتبتين عشريتين كحدّ أقصى، أو اتركه فارغاً.';
  end if;

  -- الدفع: بالدين على المورّد بلا صندوق، أو نقداً من صندوق بالمبلغ كلّه.
  if p_payment is null or p_payment not in ('credit', 'cash') then
    raise exception 'bad_payment' using hint = 'اختر طريقة الدفع: نقداً من الصندوق أو بالدين على المورّد.';
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
  insert into public.receipt_lines (id, org_id, doc_id, item_id, qty_in_unit) values (p_line_id, v_org, p_receipt_id, i.id, p_qty);
  insert into public.receipt_line_amounts (org_id, line_id, line_total) values (v_org, p_line_id, v_total);
  insert into public.receipt_amounts (org_id, doc_id, discount, paid_now, cash_account_id)
  values (v_org, p_receipt_id, 0, v_paid, case when p_payment = 'cash' then p_cash_account end);
  insert into public.purchase_prices (org_id, doc_id, line_id, warehouse_id, item_id, unit_price, sell_price)
  values (v_org, p_receipt_id, p_line_id, w.id, i.id, p_unit_price, p_sell_price);
  perform set_config('poultry.purchase_doc', '', true);

  select x.version into v_version from public.receipts x where x.org_id = v_org and x.id = p_receipt_id;
  perform private.post_receipt_core(p_receipt_id, v_version, p_client_ref);

  -- سعر البيع الحاليّ = سعر آخر شراء كُتب له سعر (جواب المالك ٣)؛ سعر الكلفة المكتوب (0016) لا يُمسّ.
  if p_sell_price is not null then
    insert into public.item_prices (org_id, item_id, sell_price) values (v_org, i.id, p_sell_price)
    on conflict (org_id, item_id) do update set sell_price = excluded.sell_price, version = public.item_prices.version + 1
    where public.item_prices.sell_price is distinct from excluded.sell_price;
  end if;

  v_result := private.purchase_result(p_receipt_id, p_line_id);
  perform private.ref_store(v_fn, p_client_ref, v_result);
  return v_result;
end
$$;

-- ─── ز. القارئان ──────────────────────────────────────────────────────────────────────────────────────────────
-- ملفّ المادّة (read): الموجود الآن (أرصدة المادّة بمخازن نطاق القارئ)، ومجموع ما اشتُري (الوجبات الجذر من استلام مرحَّل بنطاقه:
-- مرآة التحويل ليست شراءً، والملغى ليس شراءً)، وعدد الشراءات، ومتوسّط سعر الشراء (مجموع المبالغ ÷ مجموع الكمية بمرتبتين)، وسعر البيع،
-- وآخر سعر شراء؛ وسطر لكلّ شراء الأحدث أوّلاً (200 حدّاً) بسعره كما كُتب (purchase_prices)، أو للاستلام القديم المبلغ ÷ الكمية بمرتبتين.
-- المال داخل money: لأدوار الكلفة ولمن يسجّل الشراء (جواب المالك ٢)، ولغيرهم يُشال بـprivate.mask.
create or replace function public.item_file(p_item uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  i public.items;
  v_on_hand numeric;
  v_count int;
  v_qty numeric;
  v_value numeric;
  v_last numeric;
  v_rows jsonb;
  v_sell numeric;
  v_record boolean;
  v_result jsonb;
begin
  perform private.require('read');
  select * into i from public.items x where x.org_id = v_org and x.id = p_item;
  if i.id is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  v_record := public.can('purchase.record');
  select coalesce(sum(s.qty), 0) into v_on_hand from public.stock_balances s
  where s.org_id = v_org and s.item_id = i.id and public.in_scope_wh(s.warehouse_id);
  with buys as (
    select x.id as line_id, r.id as doc_id, r.doc_no, r.received_on, r.posted_at, r.party_id, t.name as party_name, y.name as warehouse_name,
      l.qty_in, coalesce(la.line_total, 0) as line_total,
      coalesce(pp.unit_price, private._mul_div_round(1, coalesce(la.line_total, 0), l.qty_in, 2)) as unit_price,
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
    where l.org_id = v_org and l.item_id = i.id and l.source_kind = 'receipt' and l.origin_lot_id is null and r.status = 'posted'
      and public.in_scope_wh(l.warehouse_id)
  ), ordered as (
    select b.*, row_number() over (order by b.received_on desc, b.posted_at desc, b.line_id desc) as n from buys b
  )
  select count(*)::int, coalesce(sum(o.qty_in), 0), coalesce(sum(o.line_total), 0), min(o.unit_price) filter (where o.n = 1),
    coalesce(jsonb_agg(jsonb_build_object('line_id', o.line_id, 'doc_id', o.doc_id, 'doc_no', o.doc_no, 'received_on', o.received_on,
      'party_id', o.party_id, 'party_name', o.party_name, 'warehouse_name', o.warehouse_name, 'qty', o.qty_in::text, 'payment', o.payment,
      'money', jsonb_build_object('unit_price', o.unit_price::text, 'line_total', o.line_total::text, 'sell_price', o.sell_price::text))
      order by o.n) filter (where o.n <= 200), '[]'::jsonb)
  into v_count, v_qty, v_value, v_last, v_rows
  from ordered o;
  select s.sell_price into v_sell from public.item_prices s where s.org_id = v_org and s.item_id = i.id;
  v_result := jsonb_build_object('today', public.app_today(), 'can_record', v_record, 'can_edit', public.can('stores.manage'),
    'item', jsonb_build_object('id', i.id, 'name', i.name, 'kind', i.kind, 'base_unit', i.base_unit,
      'density_kg_per_l', i.density_kg_per_l::text, 'archived', i.archived_at is not null),
    'on_hand_qty', v_on_hand::text, 'purchased_qty', v_qty::text, 'purchases_count', v_count,
    'money', jsonb_build_object('purchased_value', v_value::text,
      'avg_unit_price', case when v_qty > 0 then private._mul_div_round(1, v_value, v_qty, 2)::text end,
      'sell_price', v_sell::text, 'last_unit_price', v_last::text),
    'purchases', v_rows, 'more', v_count > 200,
    -- الصناديق الفعّالة لنافذة «سجّل شراء» (الأمين لا يقرأ جدولها): لمن يسجّل الشراء وحده.
    'cash_accounts', case when v_record then (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name collate "C", c.id), '[]'::jsonb)
      from public.cash_accounts c where c.org_id = v_org and c.archived_at is null) else '[]'::jsonb end);
  if v_record then
    return v_result;
  end if;
  return private.mask(v_result);
end
$$;

-- بطاقات المواد (read): كلّ مادّة فعّالة بالموجود ومجموع المشترى وآخر يوم شراء بنطاق القارئ (تعريفات item_file نفسها)، وسعر البيع
-- ومتوسّط سعر الشراء داخل money بقاعدة الرؤية نفسها. الترتيب بالاسم المطبَّع ثمّ المعرّف.
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
  ), buys as (
    select l.item_id, sum(l.qty_in) as qty, sum(coalesce(la.line_total, 0)) as value, max(r.received_on) as last_on
    from public.stock_lots l
    join public.receipts r on r.org_id = l.org_id and r.id = l.source_id
    left join public.receipt_line_amounts la on la.org_id = l.org_id and la.line_id = l.source_line_id
    where l.org_id = v_org and l.source_kind = 'receipt' and l.origin_lot_id is null and r.status = 'posted' and public.in_scope_wh(l.warehouse_id)
    group by l.item_id
  )
  select jsonb_build_object('today', public.app_today(), 'can_record', v_record, 'can_add_item', public.can('item.create'),
    'items', coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'kind', i.kind, 'base_unit', i.base_unit,
      'on_hand_qty', coalesce(h.qty, 0)::text, 'purchased_qty', coalesce(u.qty, 0)::text, 'last_purchase_on', u.last_on,
      'money', jsonb_build_object('sell_price', s.sell_price::text,
        'avg_unit_price', case when u.qty > 0 then private._mul_div_round(1, u.value, u.qty, 2)::text end))
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

-- ─── ح. الثوابت ───────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.verify_purchases() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  -- ١) كلّ سعر شراء على سطر استلام غير مسوّدة بمادّته ومخزن رأسه، ومبلغ السطر = الكمية × السعر مقرَّباً لأقرب دينار.
  select 'purchase_price_ties', count(*) from public.purchase_prices pp
  where not exists (
    select 1 from public.receipt_lines x
    join public.receipts r on r.org_id = x.org_id and r.id = x.doc_id
    join public.receipt_line_amounts a on a.org_id = x.org_id and a.line_id = x.id
    where x.org_id = pp.org_id and x.id = pp.line_id and x.doc_id = pp.doc_id and r.status <> 'draft'
      and x.item_id = pp.item_id and r.warehouse_id = pp.warehouse_id
      and a.line_total = private._mul_div_round(x.qty_in_unit, pp.unit_price, 1, 0))
  union all
  -- ٢) لا سعر شراء على مسوّدة: record_purchase تكتبه وترحّل بمعاملتها.
  select 'purchase_price_draft', count(*) from public.purchase_prices pp
  join public.receipts r on r.org_id = pp.org_id and r.id = pp.doc_id
  where r.status = 'draft'
$$;

-- ─── ط. الصلاحيات ───────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.record_purchase(uuid, uuid, uuid, uuid, uuid, date, numeric, numeric, numeric, text, uuid, uuid),
  public.item_file(uuid), public.items_overview(), public.verify_purchases()
  from public, anon;
grant execute on function public.record_purchase(uuid, uuid, uuid, uuid, uuid, date, numeric, numeric, numeric, text, uuid, uuid),
  public.item_file(uuid), public.items_overview() to authenticated;
revoke all on function public.verify_purchases() from authenticated;
grant execute on function public.verify_purchases() to service_role;
