-- 0013_item_purchases_stores — سجلّ شراء المادّة، وبطاقات المخازن، وصلاحية «يضيف مادّة» لأمين المخزن (تجربة الاستخدام، الجزء
--   الثاني؛ كلمة المالك 2026-11-02: «المادّة اشتريها بأكثر من مرّة ومن مختلف المورّدين وبسعر مختلف كلّ مرّة… يكون عندي سجلّ لكلّ
--   مادّة أعرف منين اشتريتها في وقتها وشنو الوحدات… وبكلّ شراء تنضاف الحركة لجدول هاي المادّة» وقراره «الأمين يضيف المادّة بنفسه»؛
--   DECISIONS 2026-11-02؛ FOUNDATION ٤٤١–٤٤٧، ٥١٧–٥٢٢، ٨٥٩).
-- المشكلة: كلّ ما يحتاجه سجلّ الشراء موجود بالقاعدة (stock_lots بمصدرها وقيمتها، وreceipts بمورّدها ورقمها، وreceipt_lines بوحدتها
--   المكتوبة، وreceipt_line_amounts بمبلغ الفاتورة، وreceipt_revaluations بتصحيح السعر) ولا توجد قراءة واحدة تجمعها، فبطاقة المادّة
--   تعرض الوجبات المتبقّية والحركات ولا تعرض «من مَن ومتى وبكم»؛ ولوحة المخازن جدول مواد لمخزن واحد بلا بطاقة تقول للمخزن كلّه
--   كم مادّة وكم قيمتها وأين التنبيه. وأمين المخزن لا يضيف مادّة أصلاً (سياسة الإدراج stores.manage)، فيتوقّف عند أوّل بضاعة
--   جديدة وينتظر المدير.
-- هنا: فعل item.create بـprivate.actions() وrole_can (أمين المخزن، ومن يملك stores.manage) وسياستا الإدراج على items وitem_units
--   به؛ وقارئان definer بلا كتابة: item_purchases (وجبة جذر لكلّ سطر استلام مرحَّل، بترقيم صفحات مثل item_lots_qty، والمال داخل
--   money فـprivate.mask يشيله لغير أدوار الكلفة) وstores_overview (بطاقة لكلّ مخزن فعّال بنطاق المستدعي: عدد المواد والتنبيهات
--   الثلاثة وقيمة المتاح داخل money، ومواقع النطاق لنافذة «أضف مخزناً»).
-- انحرافات مكتوبة عن الخطّة: لا جدول ولا عمود جديد، ولا تتغيّر دالّة كتابة واحدة؛ والتعديل والأرشفة (items وitem_units) والمخازن
--   والمواقع وأحجام التعبئة والتصنيفات تبقى stores.manage كلّها (أمين يضيف ولا يعدّل على مادّة قائمة)؛ وrole_can تكتب القاعدة مرّة
--   واحدة (storekeeper أو من يملك stores.manage) فلا تتفرّق إذا تغيّر جدول الأدوار؛ وitem_purchases تقبل p_warehouse فارغاً (كلّ
--   مخازن النطاق) بخلاف قراءات الكميات التي تشترط مخزناً، لأنّ سجلّ الشراء سؤال عن المادّة لا عن المخزن؛ وstores_overview بلا ترقيم
--   صفحات (صفّ لكلّ مخزن فعّال، وعددها محدود بإعدادات المنشأة) وبلا صفوف مواد؛ وcorrected داخل money لأنّ وجود تصحيح سعر خبر مال
--   (0011: صفوف التصحيح مخفيّة عن غير أدوار الكلفة ببطاقة المادّة، فلا تُكشف من هنا).
-- تراجع: rollback_0013.sql — يرجّع جسمَي private.actions وprivate.role_can كما في 0005 حرفاً بحرف (md5 نفسه بالكتالوج)، وسياستَي
--   الإدراج items_insert وitem_units_insert بفعل stores.manage كما أنشأتهما 0005، ويُسقط القارئين. لا بيانات تُحذف ولا بيانات تعتمد
--   على الفعل الجديد (الصلاحية شفرة لا صفوف: المادّة التي أضافها الأمين تبقى مادّة عادية)، فلا طريق رفض لهذا الملف.
-- تنعاد بأمان: create or replace، وكتلة do تُسقط السياستين وتنشئهما من جديد بنفس النصّ (فالمرّة الثانية لا تغيّر الكتالوج).

set lock_timeout = '5s';

-- ─── أ-1. فعل «يضيف مادّة» (قرار المالك 2026-11-02) ───────────────────────────────────────────────────────────────
-- نفس أفعال 0005 ويّاه item.create. (أيّ هجرة تزيد فعلاً تبدّل الدالّتين سوا، ومرآتهما src/domain/permissions.ts بفحص parity.)
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
  return case p_role
    when 'manager' then true
    when 'accountant' then p_action in ('receipt.amounts', 'costs.load', 'production.post', 'sale.post', 'payment.post', 'sale_return.post', 'expense.post', 'accounts.view',
      'parties.manage', 'party.create', 'cash_accounts.manage', 'expense_categories.manage')
    when 'storekeeper' then p_action in ('receipt.draft', 'transfer.post', 'issue.post', 'count.enter', 'stock_use.post', 'party.create')
    when 'mill_operator' then p_action = 'production.draft' or (p_action = 'production.post' and coalesce(p_costs_confirmed, false))
    when 'hatchery_operator' then p_action = 'hatch.operate'
    when 'hall_worker' then p_action in ('flock_day.save', 'weigh_ticket.draft')
    else false
  end;
end
$$;

-- سياستا الإدراج على المواد ووحداتها بالفعل الجديد (المواد للمنشأة كلّها، فلا نطاق بالسياسة، كما في 0005). الإسقاط ثمّ الإنشاء
-- بنفس النصّ: صورة الكتالوج تقارن الاسم والأمر والتعبير لا المعرّف، فالمرّة الثانية لا تغيّر شيئاً. سياستا التعديل كما هي.
do $$
declare
  t text;
  v_rule constant text := 'org_id = (select public.auth_org()) and (select public.can(''item.create''))';
begin
  foreach t in array array['items', 'item_units'] loop
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', t || '_insert', t, v_rule);
  end loop;
end
$$;

-- ─── أ-2. سجلّ شراء المادّة (FOUNDATION ٤٤٥): definer، والمال داخل money فـprivate.mask يشيله لغير أدوار الكلفة ─────────
-- صفّ لكلّ وجبة جذر نشأت من سطر استلام مرحَّل لهذه المادّة (source_kind = 'receipt' و origin_lot_id فارغ: مرآة التحويل ليست شراءً،
-- وهي صفّ بنفس المادّة ومخزن آخر أصلها الجذر نفسه؛ والاستلام الملغى ليس شراءً، فالشرط status = 'posted' ودفعته تبقى بالحركات).
-- الأحدث أوّلاً: received_on ثمّ fifo_seq (عدّاد المنشأة المتزايد بـnew_lot، فهو ترتيب الإنشاء) ثمّ المعرّف: ترتيب ثابت
-- لا يقفز بين الصفحات، وp_warehouse فارغ = كلّ مخازن نطاق المستدعي. والكمية بوحدة الأساس وبوحدة التعبئة كما كُتبت، ولقطة وحدة السطر معها
-- (E46: المادّة قد تتغيّر وحدتها بعد السطر، فالمعروض لقطة السطر لا المادّة الحالية). والمتبقّي صفراً يبقى معروضاً: السجلّ تاريخ.
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
      'min_qty', i.min_qty::text, 'archived', i.archived_at is not null),
    'warehouse', case when w.id is not null then jsonb_build_object('id', w.id, 'name', w.name, 'kind', w.kind) end,
    'today', public.app_today(),
    'rows', (select coalesce(jsonb_agg(r - 'cursor' order by n), '[]'::jsonb) from jsonb_array_elements(v_rows) with ordinality as x(r, n) where n <= v_limit),
    'next', case when jsonb_array_length(v_rows) > v_limit then v_rows -> (v_limit - 1) -> 'cursor' end,
    'total', v_total));
end
$$;

-- ─── أ-3. بطاقات المخازن: صفّ لكلّ مخزن فعّال بنطاق المستدعي، بلا صفوف مواد ─────────────────────────────────────────
-- الأعداد (المواد والتنبيهات) أرقام بلا قيم فتصل كلّ دور، وقيمة المتاح داخل money. والحدّ الأدنى بحساب E22 نفسه الذي تعرضه لوحة
-- المخزن (stock_on_hand.below_min): المتاح في مخازن المنشأة التي تستلم نوع المادّة أقلّ من حدّها، ويظهر في بطاقة كلّ مخزن يستلم
-- نوعها ولو كان رصيده صفراً. وsites مواقع النطاق الفعّالة لنافذة «أضف مخزناً» (المخزن الجديد يحتاج موقعاً منها).
create or replace function public.stores_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
begin
  -- بلا منشأة لا أرقام: بطاقات فارغة (مثل home_summary)، لا رفض.
  if v_org is null then
    return jsonb_build_object('today', v_today, 'can_manage', false, 'can_create_item', false, 'rows', '[]'::jsonb, 'sites', '[]'::jsonb);
  end if;
  perform private.require('read');
  return private.mask(jsonb_build_object(
    'today', v_today,
    'can_manage', public.can('stores.manage'),
    'can_create_item', public.can('item.create'),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id, 'name', w.name, 'kind', w.kind,
        'site_id', s.id, 'site_name', s.name, 'site_kind', s.kind,
        'division_id', d.id, 'division_kind', d.kind,
        'items_count', (select count(distinct l.item_id) from public.stock_lots l
          where l.org_id = v_org and l.warehouse_id = w.id and l.qty_left > 0),
        'below_minimum', (
          select count(*) from public.items i
          where i.org_id = v_org and i.archived_at is null and i.min_qty is not null
            and w.kind = any (private.receiving_kinds(i.kind))
            and coalesce((
              select sum(x.qty_left) from public.stock_lots x join public.warehouses y on y.org_id = x.org_id and y.id = x.warehouse_id
              where x.org_id = v_org and x.item_id = i.id and x.qty_left > 0 and y.kind = any (private.receiving_kinds(i.kind))
                and not private.lot_expired(i.tracks_expiry, x.expiry_on, v_today)
            ), 0) < i.min_qty),
        'near_expiry', (
          select count(distinct l.item_id) from public.stock_lots l join public.items i on i.org_id = l.org_id and i.id = l.item_id
          where l.org_id = v_org and l.warehouse_id = w.id and l.qty_left > 0 and i.tracks_expiry
            and l.expiry_on >= v_today and l.expiry_on <= v_today + 30),
        'expired', (
          select count(distinct l.item_id) from public.stock_lots l join public.items i on i.org_id = l.org_id and i.id = l.item_id
          where l.org_id = v_org and l.warehouse_id = w.id and l.qty_left > 0
            and private.lot_expired(i.tracks_expiry, l.expiry_on, v_today)),
        'money', jsonb_build_object('stock_value', round(coalesce((
          select sum(l.value_left) from public.stock_lots l join public.items i on i.org_id = l.org_id and i.id = l.item_id
          where l.org_id = v_org and l.warehouse_id = w.id and l.qty_left > 0
            and not private.lot_expired(i.tracks_expiry, l.expiry_on, v_today)), 0), 2)::text))
        order by d.kind collate "C", w.name collate "C", w.id)
      from public.warehouses w
      join public.sites s on s.org_id = w.org_id and s.id = w.site_id
      join public.divisions d on d.org_id = w.org_id and d.id = w.division_id
      where w.org_id = v_org and w.archived_at is null and public.in_scope_wh(w.id)
    ), '[]'::jsonb),
    'sites', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind, 'division_id', d.id, 'division_kind', d.kind)
        order by d.kind collate "C", s.name collate "C", s.id)
      from public.sites s join public.divisions d on d.org_id = s.org_id and d.id = s.division_id
      where s.org_id = v_org and s.archived_at is null and d.archived_at is null and public.in_scope_site(s.id)
    ), '[]'::jsonb)));
end
$$;

-- ─── الصلاحيات ─────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.item_purchases(uuid, uuid, jsonb, integer), public.stores_overview() from public, anon;
grant execute on function public.item_purchases(uuid, uuid, jsonb, integer), public.stores_overview() to authenticated;
