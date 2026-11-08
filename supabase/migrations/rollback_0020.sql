-- rollback_0020 — تراجع 0020_store_simple_ops (حذف المادّة، والشراء بلا سعر و«أكمل السعر»، وتحويل مادّة إلى مادّة، والنقل بخطوة واحدة؛
-- مشغّل التراجع بالحزمة FOUNDATION ٨٢٠، ٨٧٦). يُسقط delete_item وprice_purchase وrecord_conversion وvoid_conversion وrecord_transfer
-- وverify_store_ops ومساعداتها، ويرجّع أجسام private.actions وprivate.role_can وrecord_purchase وprivate.purchase_result وitem_file
-- وitems_overview وverify_purchases كما في 0017، وpost_receipt_revalue كما في 0010، وpost_transfer كما في 0007، وverify_stock
-- وprivate.stock_doc_memo وprivate.stock_doc_label كما في 0019 حرفاً بحرف (md5 نفسه بالكتالوج)، ويُسقط جدول stock_conversions وسياسة نطاق
-- سجلّ التدقيق وعمود receipt_revaluations.unit_price، ويرجّع قيود purchase_prices.unit_price (غير فارغ) وstock_lots_source_kind_check
-- وstock_moves_doc_kind_check بلا 'conversion' وdoc_counters_kind_check بلا 'CV'.
-- **طريق رفض (الكتلة الأولى أدناه):** شراء بلا سعر (purchase_prices.unit_price فارغ، ومنه كلّ شراء أُكمل سعره لاحقاً: سعره المكتوب على صفّ
-- التصحيح الذي يُسقط عموده) لا يقبله قيد 0017، وتحويل المادّة يُسقط جدوله وحركات المخزون تشير إليه. فالملف يرفض نفسه إن وُجد أيّهما.
-- تنعاد بأمان: drop if exists، وcreate or replace، وكتل do تفحص الكتالوج قبل القيود.

set lock_timeout = '5s';

-- الجداول تُقفل قبل العدّ ولحدّ نهاية المعاملة (درس WP4): شراء أو تحويل يُسجَّل بلحظة التراجع ينتظر أو يُعدّ.
lock table public.stock_conversions, public.purchase_prices, public.receipt_revaluations in access exclusive mode;

-- ٠) طريق الرفض: لا يُمسح سعر ولا تحويل.
do $$
declare
  v_conversions bigint;
  v_unpriced bigint;
begin
  select count(*) into v_conversions from public.stock_conversions;
  select count(*) into v_unpriced from public.purchase_prices where unit_price is null;
  if v_conversions > 0 then
    raise exception 'rollback_blocked' using hint = format('توجد %s عملية تحويل مادّة إلى مادّة، والتراجع يُسقط جدولها وحركات المخزون تشير إليها. لا تراجع عن 0020 ما دامت موجودة.',
      v_conversions);
  end if;
  if v_unpriced > 0 then
    raise exception 'rollback_blocked' using hint = format('يوجد %s شراء سُجّل بلا سعر (أُكمل سعره أو لا)، وقيد 0017 يطلب سعراً لكلّ شراء. لا تراجع عن 0020 ما دام موجوداً.',
      v_unpriced);
  end if;
end
$$;

-- ١) الدوالّ الجديدة:
drop function if exists public.delete_item(uuid, integer);
drop function if exists public.price_purchase(uuid, uuid, numeric, numeric);
drop function if exists public.record_conversion(uuid, uuid, uuid, numeric, uuid, numeric, date, uuid, uuid);
drop function if exists public.void_conversion(uuid, text, uuid);
drop function if exists public.record_transfer(uuid, uuid, uuid, uuid, numeric, uuid, uuid, date);
drop function if exists public.verify_store_ops();
drop function if exists private.item_uses(uuid);
drop function if exists private.price_view(jsonb);
drop function if exists private.conversion_result(uuid);
drop function if exists private.transfer_result(uuid, jsonb);

-- ٢) الفعل كما في 0017_simple_purchase.sql حرفاً بحرف:
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

-- ٣) البيان والاسم كما في 0019_flock_issue.sql:
create or replace function private.stock_doc_memo(p_kind text, p_doc uuid, p_warehouse uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case p_kind
    when 'receipt' then coalesce((select format('شراء من %s', t.name) from public.receipts r
      join public.parties t on t.org_id = r.org_id and t.id = r.party_id
      where r.org_id = public.auth_org() and r.id = p_doc), 'شراء')
    when 'supplier_return' then coalesce((select format('مرتجع إلى %s', t.name) from public.supplier_returns s
      join public.parties t on t.org_id = s.org_id and t.id = s.party_id
      where s.org_id = public.auth_org() and s.id = p_doc), 'مرتجع إلى المورّد')
    when 'receipt_revalue' then 'تصحيح سعر الشراء'
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
    else p_kind
  end
$$;

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
    when 'receipt_revalue' then coalesce((select format('تصحيح سعر %s', r.doc_no) from public.receipt_revaluations v
      join public.receipts r on r.org_id = v.org_id and r.id = v.receipt_id where v.org_id = public.auth_org() and v.id = p_doc), 'تصحيح سعر')
    when 'production' then coalesce((select coalesce(b.doc_no, format('دفعة إنتاج %s', r.name)) from public.production_batches b
      join public.recipe_versions v on v.org_id = b.org_id and v.id = b.recipe_version_id
      join public.recipes r on r.org_id = v.org_id and r.id = v.recipe_id
      where b.org_id = public.auth_org() and b.id = p_doc), 'دفعة إنتاج')
    when 'flock_issue' then coalesce((select x.doc_no from public.flock_issues x where x.org_id = public.auth_org() and x.id = p_doc), 'صرف لفوج')
    else p_kind
  end
$$;

-- ٤) الشراء ونتيجته وملفّ المادّة وبطاقاتها وثوابت الشراء كما في 0017:
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
  insert into public.receipt_lines (id, org_id, doc_id, item_id, qty_in_unit, expiry_on, born_at)
  values (p_line_id, v_org, p_receipt_id, i.id, p_qty, p_expiry_on, p_born_at);
  insert into public.receipt_line_amounts (org_id, line_id, line_total) values (v_org, p_line_id, v_total);
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

drop function if exists private.purchase_unpriced(uuid);

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
  v_can_buy boolean;
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
      l.qty_in, coalesce(rv.new_total, la.line_total, 0) as line_total, rv.new_total is not null as corrected,
      case when rv.new_total is not null then private._mul_div_round(1, rv.new_total, l.qty_in, 2)
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
      select v.new_total from public.receipt_revaluations v
      where v.org_id = x.org_id and v.receipt_line_id = x.id and v.status = 'posted' order by v.rev_no desc limit 1
    ) as rv on true
    where l.org_id = v_org and l.item_id = i.id and l.source_kind = 'receipt' and l.origin_lot_id is null and r.status = 'posted'
      and public.in_scope_wh(l.warehouse_id)
  ), ordered as (
    select b.*, row_number() over (order by b.received_on desc, b.posted_at desc, b.line_id desc) as n from buys b
  )
  select count(*)::int, coalesce(sum(o.qty_in), 0), coalesce(sum(o.line_total), 0), min(o.unit_price) filter (where o.n = 1),
    coalesce(jsonb_agg(jsonb_build_object('line_id', o.line_id, 'doc_id', o.doc_id, 'doc_no', o.doc_no, 'received_on', o.received_on,
      'party_id', o.party_id, 'party_name', o.party_name, 'warehouse_name', o.warehouse_name, 'qty', o.qty_in::text, 'payment', o.payment,
      'money', jsonb_build_object('unit_price', o.unit_price::text, 'line_total', o.line_total::text, 'sell_price', o.sell_price::text,
        'corrected', o.corrected))
      order by o.n) filter (where o.n <= 200), '[]'::jsonb)
  into v_count, v_qty, v_value, v_last, v_rows
  from ordered o;
  select s.sell_price into v_sell from public.item_prices s where s.org_id = v_org and s.item_id = i.id;
  v_result := jsonb_build_object('today', public.app_today(), 'can_record', v_can_buy, 'can_edit', public.can('stores.manage'),
    'item', jsonb_build_object('id', i.id, 'name', i.name, 'kind', i.kind, 'base_unit', i.base_unit,
      'density_kg_per_l', i.density_kg_per_l::text, 'archived', i.archived_at is not null, 'tracks_expiry', i.tracks_expiry),
    'on_hand_qty', v_on_hand::text, 'purchased_qty', v_qty::text, 'purchases_count', v_count,
    'money', jsonb_build_object('purchased_value', v_value::text,
      'avg_unit_price', case when v_qty > 0 then private._mul_div_round(1, v_value, v_qty, 2)::text end,
      'sell_price', v_sell::text, 'last_unit_price', v_last::text),
    'purchases', v_rows, 'more', v_count > 200,
    -- الصناديق الفعّالة لنافذة «سجّل شراء» (الأمين لا يقرأ جدولها): لمن يسجّل شراء هذه المادّة وحده.
    'cash_accounts', case when v_can_buy then (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name collate "C", c.id), '[]'::jsonb)
      from public.cash_accounts c where c.org_id = v_org and c.archived_at is null) else '[]'::jsonb end);
  if v_record then
    return v_result;
  end if;
  return private.mask(v_result);
end
$$;

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
    select l.item_id, sum(l.qty_in) as qty, sum(coalesce(rv.new_total, la.line_total, 0)) as value, max(r.received_on) as last_on
    from public.stock_lots l
    join public.receipts r on r.org_id = l.org_id and r.id = l.source_id
    left join public.receipt_line_amounts la on la.org_id = l.org_id and la.line_id = l.source_line_id
    left join lateral (
      select v.new_total from public.receipt_revaluations v
      where v.org_id = l.org_id and v.receipt_line_id = l.source_line_id and v.status = 'posted' order by v.rev_no desc limit 1
    ) as rv on true
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

-- ٥) التصحيح كما في 0010 والترحيل من الورقة كما في 0007 (جسماهما كاملين بالغلاف)، ثمّ تُسقط النواتان:
create or replace function public.post_receipt_revalue(p_line uuid, p_new_total numeric, p_expected_plan text, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'post_receipt_revalue';
  v_cached jsonb;
  v_reason text;
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
  f record;
begin
  set local lock_timeout = '5s';
  perform private.require('receipt.revalue');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('line', p_line, 'new_total', p_new_total, 'plan', p_expected_plan, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
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
  if r.status <> 'posted' then
    raise exception 'receipt_not_posted' using hint = 'يُصحَّح سعر سطر من استلام مرحَّل فقط.';
  end if;
  select l.id into v_root from public.stock_lots l
  where l.org_id = r.org_id and l.source_kind = 'receipt' and l.source_id = r.id and l.source_line_id = ln.id and l.origin_lot_id is null;
  select array_agg(distinct l.warehouse_id) into v_whs from public.stock_lots l where l.org_id = r.org_id and (l.id = v_root or l.origin_lot_id = v_root);
  perform private.lock_masters(v_whs, array[ln.item_id], false);
  perform private.lock_balances(array_fill(ln.item_id, array[cardinality(v_whs)]), v_whs);
  perform 1 from public.stock_lots l where l.org_id = r.org_id and (l.id = v_root or l.origin_lot_id = v_root) order by l.id for no key update;
  select coalesce(jsonb_object_agg(top_seq.warehouse_id, top_seq.seq), '{}'::jsonb) into v_marks
  from (select sm.warehouse_id, max(sm.seq) as seq from public.stock_moves sm
    where sm.org_id = r.org_id and sm.item_id = ln.item_id and sm.warehouse_id = any (v_whs) group by sm.warehouse_id) as top_seq;
  v_plan := private.revalue_plan(ln.id, p_new_total);
  perform private.raise_revalue_problem(v_plan -> 'problem');
  if p_expected_plan is null or p_expected_plan is distinct from v_plan ->> 'plan' then
    raise exception 'stale_preview' using hint = 'تغيّرت دفعات السطر أو مبلغه الحالي بعد المعاينة؛ عاين التصحيح من جديد قبل ترحيله.';
  end if;
  v_diff := (v_plan ->> 'diff')::numeric;
  v_share := (v_plan ->> 'lot_share')::numeric;
  v_expense := v_diff - v_share;
  v_rev_no := coalesce((select max(v.rev_no) from public.receipt_revaluations v where v.org_id = r.org_id and v.receipt_line_id = ln.id), 0) + 1;
  insert into public.receipt_revaluations (id, org_id, receipt_id, warehouse_id, receipt_line_id, rev_no, new_total, old_total, diff, lot_share,
    expense_amount, reason, status, client_ref, marks)
  values (v_id, r.org_id, r.id, r.warehouse_id, ln.id, v_rev_no, p_new_total, (v_plan ->> 'current_total')::numeric, v_diff, v_share, v_expense,
    v_reason, 'posted', p_client_ref, v_marks);
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
  e := private.write_entry(gen_random_uuid(), r.party_id, r.book_id, 'adjustment', -v_diff, 'receipt_revalue', v_id, r.doc_no, public.app_today(), v_reason);
  perform private.allocate_entry(e.id, private.receipt_purchase_entry(r.id));
  perform private.mark_division_posted(w.division_id);
  update public.receipt_revaluations set party_entry_id = e.id, expense_id = v_expense_id where org_id = r.org_id and id = v_id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', v_id, 'kind', 'receipt_revalue', 'receipt_id', r.id, 'line_id', ln.id,
    'old_total', v_plan ->> 'current_total', 'new_total', p_new_total::text, 'diff', v_diff::text, 'lot_share', v_share::text,
    'expense_amount', v_expense::text));
end
$$;

drop function if exists private.revaluation_post(uuid, numeric, text, text, uuid, numeric);

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

drop function if exists private.post_transfer_core(uuid, integer, text, uuid, boolean);

-- ٦) ثوابت المخزون كما في 0019:
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
  -- 10. ترتيب السحب (القاعدة 12): وقت كل قطعة سحب أصلية بالتحويل والصرف والجرد والصرف لفوج (0019) ماكو دفعة قبلها بالترتيب (الانتهاء والفارغ أخيراً،
  --     ثم fifo_seq، ثم المعرّف) مؤهّلة بتاريخ السحب (مستلمة بيه أو قبله، وغير منتهية للسحب اللي طبّق قاعدة الانتهاء) وبيها متبقٍّ
  --     قبل القطعة. نقص الجرد المنتهي (expiry_checked = false) يشوف كل الدفعات مؤهّلة، والصالحة كلها بعد المنتهية بالترتيب، فيبقى
  --     الأقدم انتهاءً أوّلاً. السحب من دفعة مسمّاة (إذن المنتهي والإتلاف، والمرتجع WP7) برّا الفحص.
  select 'draw_order', count(*) from public.stock_moves m
  join public.stock_lots l on l.org_id = m.org_id and l.id = m.lot_id
  where m.qty < 0 and m.reverses_move_id is null and m.doc_kind in ('transfer', 'stock_use', 'count', 'flock_issue')
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

-- ٧) سياسة نطاق سجلّ التدقيق وجدول التحويل وعمود سعر التسعير:
drop policy if exists audit_log_conversion_scope on public.audit_log;
drop table if exists public.stock_conversions;
alter table public.receipt_revaluations drop column if exists unit_price;

-- ٨) القيود كما في 0019 (0017 لسعر الشراء، و0015 لنوع الدفعة). حركة conversion أو دفعتها أو عدّاد CV أو سعر فارغ لا يبقى هنا: طريق الرفض أعلاه
--    يوقف التراجع ما دام تحويل أو شراء بلا سعر موجوداً. فإن شيل طريق الرفض (ضابط الحزمة) تُضاف القيود القديمة بلا فحص الصفوف القائمة
--    (not valid)، ويبقى سعر الشراء يقبل الفارغ ما دام فيه فارغ، والملف يكمل ذرّياً، ولا يُحذف صفّ.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'purchase_prices_unit_price_check' and conrelid = 'public.purchase_prices'::regclass
    and pg_get_constraintdef(oid) like '%IS NULL%') then
    alter table public.purchase_prices drop constraint purchase_prices_unit_price_check;
    alter table public.purchase_prices add constraint purchase_prices_unit_price_check
      check (abs(unit_price) < 'Infinity' and unit_price > 0 and unit_price = round(unit_price, 2));
  end if;
  if not exists (select 1 from public.purchase_prices p where p.unit_price is null) then
    alter table public.purchase_prices alter column unit_price set not null;
  end if;
  if exists (select 1 from pg_constraint where conname = 'stock_lots_source_kind_check' and conrelid = 'public.stock_lots'::regclass
    and pg_get_constraintdef(oid) like '%conversion%') then
    alter table public.stock_lots drop constraint stock_lots_source_kind_check;
    if exists (select 1 from public.stock_lots l where l.source_kind = 'conversion') then
      alter table public.stock_lots add constraint stock_lots_source_kind_check
        check (source_kind in ('opening', 'receipt', 'transfer', 'count_gain', 'production')) not valid;
    else
      alter table public.stock_lots add constraint stock_lots_source_kind_check
        check (source_kind in ('opening', 'receipt', 'transfer', 'count_gain', 'production'));
    end if;
  end if;
  if exists (select 1 from pg_constraint where conname = 'stock_moves_doc_kind_check' and conrelid = 'public.stock_moves'::regclass
    and pg_get_constraintdef(oid) like '%conversion%') then
    alter table public.stock_moves drop constraint stock_moves_doc_kind_check;
    if exists (select 1 from public.stock_moves m where m.doc_kind = 'conversion') then
      alter table public.stock_moves add constraint stock_moves_doc_kind_check
        check (doc_kind in ('opening', 'receipt', 'supplier_return', 'receipt_revalue', 'transfer', 'count', 'stock_use', 'production', 'flock_issue')) not valid;
    else
      alter table public.stock_moves add constraint stock_moves_doc_kind_check
        check (doc_kind in ('opening', 'receipt', 'supplier_return', 'receipt_revalue', 'transfer', 'count', 'stock_use', 'production', 'flock_issue'));
    end if;
  end if;
  if exists (select 1 from pg_constraint where conname = 'doc_counters_kind_check' and conrelid = 'public.doc_counters'::regclass
    and pg_get_constraintdef(oid) like '%CV%') then
    alter table public.doc_counters drop constraint doc_counters_kind_check;
    if exists (select 1 from public.doc_counters c where c.kind = 'CV') then
      alter table public.doc_counters add constraint doc_counters_kind_check
        check (kind in ('PU', 'RT', 'TR', 'CT', 'SU', 'RC', 'PY', 'OF', 'PD', 'FI')) not valid;
    else
      alter table public.doc_counters add constraint doc_counters_kind_check
        check (kind in ('PU', 'RT', 'TR', 'CT', 'SU', 'RC', 'PY', 'OF', 'PD', 'FI'));
    end if;
  end if;
end
$$;
