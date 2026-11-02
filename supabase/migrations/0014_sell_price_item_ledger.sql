-- 0014_sell_price_item_ledger — سعر البيع والربح المتوقّع، وكلّ مواد المخزن في قائمته، ودفتر المادّة بالبيان (تجربة
--   الاستخدام، الجزء الثالث؛ كلمة المالك 2026-11-02: «اريد تسويلي سعر البيع والربح المتوقع… قبلها سوي طريقة اضافة المواد داخل
--   المخزن مثل طريقة دكتور فيت… وهو السستم يعرف بحيث كل مادة يصير الها سجلها الخاص… ترتيب دفتر الديون الي بدكتور فيت يصير مثله
--   لكن خاص بكل مادة بحيث اني اعرف شنو وضع هاي المادة الي عندي بالمخزن»؛ DECISIONS 2026-11-02؛ FOUNDATION ٢٦٨–٢٧١، ٤٤١–٤٤٧).
-- المشكلة: (١) لا سعر بيع في النظام أصلاً، فلا «قيمة البيع» ولا «الربح المتوقّع» — وهما بطاقتان في الشاشة التي أرسلها المالك؛
--   (٢) المادّة التي يضيفها الأمين لا تظهر في قائمة مخزنها حتّى يصير لها رصيد: شرط stock_on_hand يُظهر بلا رصيد مَن لها حدّ أدنى
--   فقط، فالمادّة الجديدة تختفي إلى أوّل استلام وهذا أثقل عيب في «طريقة الإضافة»؛ (٣) حركة المادّة تحمل رقم مستندها (PU-…) بلا
--   بيان يقول من أين جاءت («شراء من فلان»، «تحويل إلى مخزن القاعات»)، فبطاقة المادّة سجلّ أرقام لا دفتر.
-- هنا: جدول item_prices (سعر بيع واحد لكلّ مادّة، بالفلس لوحدة الأساس) ودالّته set_item_sell_price؛ وstock_on_hand يُظهر كلّ
--   مادّة فعّالة يستلم المخزن نوعها ولو برصيد صفر ويزيد التصنيف والباركود وmoney لكلّ صفّ وللمخزن كلّه؛ وitem_moves_qty يزيد
--   البيان (private.stock_doc_memo) وقيمة الحركة والرصيد القيمي؛ وstores_overview يزيد قيمة البيع والربح المتوقّع.
-- سعر البيع **لا يُوضع عموداً على items**: المواد يقرأها كلّ دور مباشرةً (0005)، فالعمود كان يصل أمين المخزن والمشاهد (E2).
--   فجدول مال مستقلّ: functionOnly (الكتابة من دالّته بس) وcostRestricted (سياسة قراءة مقيِّدة بـcan_see_cost())، ومشغّل تدقيق،
--   وبلا منح insert/update لـauthenticated.
-- انحرافات مكتوبة عن الخطّة: سعر واحد حالي لكلّ مادّة بلا تاريخ سريان ولا سعر لكلّ وحدة تعبئة (العرض يضرب بمعامل التعبئة)،
--   لأنّ «بيش راح ابيعه» سؤال عن اليوم؛ وصلاحية السعر stores.manage (المالك والمدير) لا accounts.view — فالمحاسب يرى السعر
--   ولا يكتبه، والأمين لا يراه؛ و«الربح المتوقّع» تقدير (قيمة البيع − قيمة المتاح) لا ربح مُثبت، ومجموعه يُحسب على المواد التي
--   لها سعر فقط ويُرجَّع معه items_unpriced حتّى لا يُقرأ ناقصاً؛ واتّجاه التحويل في البيان من المخزن المسؤول لا من إشارة
--   الكمية (العكسية تقلب الإشارة ولا تقلب الطرفين)؛ وstock_on_hand يبقى ترقيمه وقاعدة حدّه الأدنى (E22) كما هما.
-- تراجع: rollback_0014.sql — يرجّع أجسام stock_on_hand (كما في 0007) وitem_moves_qty (كما في 0011) وstores_overview (كما في
--   0013) حرفاً بحرف (md5 نفسه بالكتالوج)، ويُسقط item_prices وset_item_sell_price وprivate.stock_doc_memo.
--   **طريق رفض**: إسقاط item_prices يمسح قائمة أسعار البيع كلّها، فالتراجع يصدّرها أوّلاً
--   (select item_id, sell_price from public.item_prices) ويحفظها خارج القاعدة؛ وبلا هذا لا يُشغّل الملف.
-- تنعاد بأمان: create table if not exists وcreate or replace، وكتلة do تنشئ السياسات إن لم تكن موجودة.

set lock_timeout = '5s';

-- ─── أ-1. سعر البيع: جدول مال مستقلّ، سعر واحد حالي لكلّ مادّة بالفلس لوحدة الأساس ──────────────────────────────────
create table if not exists public.item_prices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  item_id uuid not null,
  sell_price numeric not null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint item_prices_sell_price_check check (abs(sell_price) < 'Infinity' and sell_price > 0 and sell_price = round(sell_price, 2)),
  constraint item_prices_version_check check (version >= 1),
  unique (org_id, id),
  -- سعر واحد لكلّ مادّة: الدالّة تكتب فوقه، فلا صفّان يتسابقان ولا تاريخ سريان في هذه النسخة.
  unique (org_id, item_id),
  foreign key (org_id, item_id) references public.items (org_id, id)
);

create or replace trigger audit_item_prices after insert or update or delete on public.item_prices
  for each row execute function private.audit_row();

alter table public.item_prices enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'item_prices' and policyname = 'item_prices_read') then
    create policy item_prices_read on public.item_prices for select to authenticated
      using (org_id = (select public.auth_org()));
  end if;
  -- مال: سياسة مقيِّدة فوق سياسة المنشأة، فالأمين وعامل القاعة والمشاهد لا يقرأون سعر البيع أبداً (§2.8، E2).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'item_prices' and policyname = 'item_prices_cost_only') then
    create policy item_prices_cost_only on public.item_prices as restrictive for select to authenticated
      using ((select public.can_see_cost()));
  end if;
end
$$;

revoke all on table public.item_prices from anon, authenticated;
grant select on table public.item_prices to authenticated;

-- ─── أ-2. كتابة سعر البيع: دالّة واحدة، مشروطة بالقيمة السابقة، تُعاد بأمان ─────────────────────────────────────────
-- القفل على صفّ المادّة بـfor no key update: يسلسل كاتبَين (for no key update يتقافل مع نفسه) ولا يتقافل مع مفاتيح
-- item_prices (key share على نفس الصفّ، درس WP4). وصفّ السعر قد لا يوجد، فلا يكفي قفله هو (درس 2026-10-27).
-- والكتابة فوق محفوظ مشروطة بقائمة قيم جائزة (درس WP5): المحفوظ = المطلوب ← انكتب (إعادة بعد جواب ضاع)، والمحفوظ ≠
-- p_expected ← price_changed. وp_price فارغ يشيل السعر (مادّة لا تُباع).
create or replace function public.set_item_sell_price(p_item uuid, p_price numeric, p_expected numeric) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  i public.items;
  v_cur numeric;
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
  select r.sell_price into v_cur from public.item_prices r where r.org_id = v_org and r.item_id = p_item;
  if v_cur is not distinct from p_price then
    return jsonb_build_object('item_id', p_item, 'sell_price', p_price::text, 'written', false);
  end if;
  if v_cur is distinct from p_expected then
    raise exception 'price_changed' using hint = 'تغيّر سعر البيع من نافذة أو جهاز آخر بعد أن بدأت تعديله. حدّث الشاشة ثمّ أعِد الكتابة.';
  end if;
  if p_price is null then
    delete from public.item_prices where org_id = v_org and item_id = p_item;
  elsif v_cur is null then
    insert into public.item_prices (org_id, item_id, sell_price) values (v_org, p_item, p_price);
  else
    update public.item_prices set sell_price = p_price, version = version + 1 where org_id = v_org and item_id = p_item;
  end if;
  return jsonb_build_object('item_id', p_item, 'sell_price', p_price::text, 'written', true);
end
$$;

-- قيمة البيع لكمّية بسعرها: مكان واحد للقاعدة، لأنّ _mul_div_round يرفض الكمية صفراً أو السعر الفارغ (mul_div_domain)،
-- ومادّة برصيد صفر ولها سعر أمر عادي (القائمة تعرض المواد بلا رصيد أصلاً). بلا سعر ← فارغ، فالمجموع على من له سعر فقط.
create or replace function private.sale_value(p_qty numeric, p_price numeric) returns numeric
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case when p_price is null or p_qty is null then null when p_qty <= 0 then 0.00 else private._mul_div_round2(p_qty, p_price, 1) end
$$;

-- ─── أ-3. بيان الحركة: من أين جاءت، أو إلى أين ذهبت ───────────────────────────────────────────────────────────────
-- يكمّل private.stock_doc_label (رقم المستند): هذا جملة البيان مثل عمود «البيان» في الكشف. اتّجاه التحويل من المخزن
-- المسؤول لا من إشارة الكمية: حركة العكس تقلب الإشارة ولا تقلب طرفَي التحويل. وأسماء الجهات والمخازن تصل كلّ دور
-- (أسماء لا مبالغ)، والنطاق محكوم بالدالّة المستدعية (item_moves_qty يشترط in_scope_wh على مخزنه).
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
    else p_kind
  end
$$;

-- ─── أ-4. دفتر المادّة: الحركة ويّا بيانها وقيمتها ورصيدها القيمي ───────────────────────────────────────────────────
-- نسخة ثالثة (0007 ثمّ 0011): كما هي، ويّا memo (البيان) وmoney (قيمة الحركة والرصيد القيمي الجاري) داخل private.mask.
-- صفوف تصحيح السعر تبقى لأدوار الكلفة فقط (قرار المالك 2026-10-31)، والرصيد القيمي يُحسب على الظاهر لذلك الدور: المخفيّ
-- كمية صفر وقيمة غير صفر، فلو حُسب على الكلّ لغير أدوار الكلفة لظهر رصيد قيمي لا تفسّره صفوفه — وهو مُشال أصلاً بالقناع.
create or replace function public.item_moves_qty(p_item uuid, p_warehouse uuid, p_after_seq bigint, p_limit int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 200);
  v_cost boolean := public.can_see_cost();
  v_rows jsonb;
  v_total bigint;
begin
  if p_warehouse is null or not public.in_scope_wh(p_warehouse) then
    raise exception 'out_of_scope' using hint = 'هذا المخزن خارج نطاقك أو غير موجود في منشأتك.';
  end if;
  with mv as (
    select m.*, row_number() over (order by m.seq) as n,
      sum(m.qty) over (order by m.seq rows between unbounded preceding and current row) as running,
      sum(m.value) over (order by m.seq rows between unbounded preceding and current row) as running_value,
      exists (select 1 from public.stock_moves r where r.org_id = m.org_id and r.reverses_move_id = m.id) as reversed
    from public.stock_moves m
    where m.org_id = v_org and m.item_id = p_item and m.warehouse_id = p_warehouse and (v_cost or m.doc_kind <> 'receipt_revalue')
  ), paged as (
    select * from mv where mv.n > coalesce(p_after_seq, 0) order by mv.n limit v_limit + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('move_id', p.id, 'seq', p.n::text, 'moved_on', p.moved_on, 'doc_kind', p.doc_kind,
      'doc_id', p.doc_id, 'doc', private.stock_doc_label(p.doc_kind, p.doc_id),
      'memo', private.stock_doc_memo(p.doc_kind, p.doc_id, p_warehouse),
      'qty', p.qty::text, 'running', p.running::text,
      'lot_id', p.lot_id, 'reverses_move_id', p.reverses_move_id, 'reversed', p.reversed,
      'money', jsonb_build_object('value', round(p.value, 2)::text, 'running_value', round(p.running_value, 2)::text)) order by p.n), '[]'::jsonb),
    case when p_after_seq is null then (select count(*) from mv) end
  into v_rows, v_total
  from paged p;
  return private.mask(jsonb_build_object(
    'rows', (select coalesce(jsonb_agg(r order by n), '[]'::jsonb) from jsonb_array_elements(v_rows) with ordinality as x(r, n) where n <= v_limit),
    'next', case when jsonb_array_length(v_rows) > v_limit then v_rows -> (v_limit - 1) ->> 'seq' end,
    'total', v_total));
end
$$;

-- ─── أ-4ب. سجلّ الشراء يرجّع سعر بيع المادّة معه ─────────────────────────────────────
-- نسخة ثانية (0013): كما هي حرفاً بحرف، ويّا money على المادّة فيه سعر البيع الحالي: بطاقة المادّة تعرض
-- آخر شراء وسعر البيع بمكان واحد («بيش اشتريتها» و«بيش راح ابيعه»)، والقناع يشيله لغير أدوار الكلفة.
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
      'money', jsonb_build_object('sell_price', (select r.sell_price::text from public.item_prices r where r.org_id = v_org and r.item_id = i.id))),
    'warehouse', case when w.id is not null then jsonb_build_object('id', w.id, 'name', w.name, 'kind', w.kind) end,
    'today', public.app_today(),
    'rows', (select coalesce(jsonb_agg(r - 'cursor' order by n), '[]'::jsonb) from jsonb_array_elements(v_rows) with ordinality as x(r, n) where n <= v_limit),
    'next', case when jsonb_array_length(v_rows) > v_limit then v_rows -> (v_limit - 1) -> 'cursor' end,
    'total', v_total));
end
$$;

-- ─── أ-5. قائمة المخزن: كلّ مادّة يستلم المخزن نوعها، ولو برصيد صفر ────────────────────────────────────────────────
-- نسخة ثانية (0007). التغييرات: (١) الشرط يُظهر كلّ مادّة فعّالة يستلم المخزن نوعها (كان: من لها حدّ أدنى فقط)، فالمادّة
-- التي تُضاف اليوم تظهر في قسمها اليوم برصيد صفر؛ (٢) التصنيف (المعرّف والاسم) والباركود مع الصفّ، فالأقسام من القراءة
-- نفسها بلا نداء ثانٍ؛ (٣) money لكلّ صفّ (قيمة المتاح وسعر البيع وقيمة البيع والربح المتوقّع) وmoney للمخزن كلّه مع
-- items_unpriced، والكلّ داخل private.mask. والمؤرشفة تظهر إن كان لها رصيد فقط (كما كان). الترقيم وقاعدة الحدّ الأدنى
-- (E22) وعمر الأفراخ (E24) كما هي حرفاً بحرف.
-- المجاميع تُحسب بأوّل صفحة فقط (مثل total): سؤال عن المخزن كلّه لا عن الصفحة، وتكرارها بكلّ «المزيد» مسحٌ زائد.
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
  v_money jsonb;
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
      coalesce(sum(l.value_left) filter (where not l.expired), 0) as value_available,
      min(l.born_at) filter (where l.chick) as oldest_born,
      coalesce(sum(l.qty_left) filter (where l.chick and l.born_at is not null and l.born_at <= now() - interval '48 hours'), 0) as old_chicks
    from (
      -- المنتهي وقريب الانتهاء لمادّة تتابع الانتهاء بس (مثل item_lots_qty وhome_summary)، والعمر بالساعات للأفراخ بس (E24).
      select x.item_id, x.qty_left, x.value_left, x.expiry_on, x.born_at, i.tracks_expiry as tracks, i.kind = 'chick' as chick,
        private.lot_expired(i.tracks_expiry, x.expiry_on, v_today) as expired
      from public.stock_lots x join public.items i on i.org_id = x.org_id and i.id = x.item_id
      where x.org_id = v_org and x.warehouse_id = w.id and x.qty_left > 0
    ) as l
    group by l.item_id
  ), shown as (
    select i.id, i.name, i.name_norm, i.kind, i.base_unit, i.tracks_expiry, i.min_qty, i.archived_at, i.barcode,
      i.category_id, g.name as category_name,
      coalesce(t.available, 0) as available, coalesce(t.expired, 0) as expired, coalesce(t.near_expiry, 0) as near_expiry,
      round(coalesce(t.value_available, 0), 2) as stock_value, r.sell_price,
      private.sale_value(coalesce(t.available, 0), r.sell_price) as sale_value,
      t.oldest_born, coalesce(t.old_chicks, 0) as old_chicks,
      i.min_qty is not null and w.kind = any (private.receiving_kinds(i.kind)) and coalesce((
        select sum(x.qty_left) from public.stock_lots x join public.warehouses y on y.org_id = x.org_id and y.id = x.warehouse_id
        where x.org_id = v_org and x.item_id = i.id and x.qty_left > 0 and y.kind = any (private.receiving_kinds(i.kind))
          and not private.lot_expired(i.tracks_expiry, x.expiry_on, v_today)
      ), 0) < i.min_qty as below_min
    from public.items i
      left join lots t on t.item_id = i.id
      left join public.item_categories g on g.org_id = i.org_id and g.id = i.category_id
      left join public.item_prices r on r.org_id = i.org_id and r.item_id = i.id
    where i.org_id = v_org
      and (t.item_id is not null or (i.archived_at is null and w.kind = any (private.receiving_kinds(i.kind))))
  ), paged as (
    select s.* from shown s
    where v_after_id is null or s.name_norm collate "C" > v_after_name collate "C" or (s.name_norm = v_after_name and s.id > v_after_id)
    order by s.name_norm collate "C", s.id
    limit v_limit + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('item_id', p.id, 'name', p.name, 'kind', p.kind, 'base_unit', p.base_unit,
      'tracks_expiry', p.tracks_expiry, 'min_qty', p.min_qty::text, 'archived', p.archived_at is not null,
      'category_id', p.category_id, 'category_name', p.category_name, 'barcode', p.barcode,
      'available', p.available::text, 'expired', p.expired::text, 'near_expiry', p.near_expiry::text, 'below_min', p.below_min,
      'oldest_born_at', p.oldest_born,
      'chick_age_hours', case when p.oldest_born is not null then div(extract(epoch from (now() - p.oldest_born))::numeric, 3600)::text end, -- date-ok: عمر الفرخ ساعات بين لحظتين (E24)، مو يوماً
      'old_chicks', p.old_chicks::text,
      'money', jsonb_build_object('stock_value', p.stock_value::text,
        'sell_price', p.sell_price::text, 'sale_value', p.sale_value::text,
        'expected_profit', case when p.sale_value is not null then (p.sale_value - p.stock_value)::text end),
      'cursor', jsonb_build_object('name', p.name_norm, 'id', p.id))
      order by p.name_norm collate "C", p.id), '[]'::jsonb),
    case when v_after_id is null then (select count(*) from shown) end,
    -- رأس المال على كلّ المواد، وقيمة البيع والربح المتوقّع على المواد التي لها سعر فقط، وعددُ مَن لها رصيد بلا سعر
    -- حتّى تقول الشاشة إنّ الربح ناقص هؤلاء (لا يُطرح رأس مال بلا إيراد يقابله).
    case when v_after_id is null then (select jsonb_build_object(
      'stock_value', round(coalesce(sum(s.stock_value), 0), 2)::text,
      'sale_value', round(coalesce(sum(s.sale_value), 0), 2)::text,
      'expected_profit', round(coalesce(sum(s.sale_value - s.stock_value) filter (where s.sale_value is not null), 0), 2)::text,
      'items_unpriced', count(*) filter (where s.sell_price is null and s.available > 0)) from shown s) end
  into v_rows, v_total, v_money
  from paged p;
  return private.mask(jsonb_build_object(
    'warehouse', jsonb_build_object('id', w.id, 'name', w.name, 'kind', w.kind, 'division_id', w.division_id, 'division_kind', v_division,
      'archived', w.archived_at is not null,
      'has_balance', exists (select 1 from public.stock_balances b where b.org_id = v_org and b.warehouse_id = w.id and b.qty <> 0)),
    'as_of', now(), 'today', v_today,
    'rows', (select coalesce(jsonb_agg(r - 'cursor' order by n), '[]'::jsonb) from jsonb_array_elements(v_rows) with ordinality as x(r, n) where n <= v_limit),
    'next', case when jsonb_array_length(v_rows) > v_limit then v_rows -> (v_limit - 1) -> 'cursor' end,
    'total', v_total,
    'money', v_money));
end
$$;

-- ─── أ-6. بطاقات المخازن: ويّا قيمة البيع والربح المتوقّع ───────────────────────────────────────────────────────────
-- نسخة ثانية (0013): كما هي حرفاً بحرف، ويّا ثلاثة في money لكلّ مخزن (قيمة البيع والربح المتوقّع وعدد المواد بلا سعر).
-- وعاء الحساب نفسه الذي تحسب به stock_on_hand: المتاح غير المنتهي، وسعر البيع لوحدة الأساس.
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
        'money', (select jsonb_build_object(
          'stock_value', round(coalesce(sum(v.value_left), 0), 2)::text,
          'sale_value', round(coalesce(sum(private.sale_value(v.qty_left, v.sell_price)), 0), 2)::text,
          'expected_profit', round(coalesce(sum(private.sale_value(v.qty_left, v.sell_price) - round(v.value_left, 2)) filter (where v.sell_price is not null), 0), 2)::text,
          'items_unpriced', count(distinct v.item_id) filter (where v.sell_price is null))
          from (
            select l.item_id, sum(l.qty_left) as qty_left, sum(l.value_left) as value_left, max(r.sell_price) as sell_price
            from public.stock_lots l
              join public.items i on i.org_id = l.org_id and i.id = l.item_id
              left join public.item_prices r on r.org_id = l.org_id and r.item_id = l.item_id
            where l.org_id = v_org and l.warehouse_id = w.id and l.qty_left > 0
              and not private.lot_expired(i.tracks_expiry, l.expiry_on, v_today)
            group by l.item_id
          ) as v))
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
revoke all on function public.set_item_sell_price(uuid, numeric, numeric) from public, anon;
grant execute on function public.set_item_sell_price(uuid, numeric, numeric) to authenticated;
