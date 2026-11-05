-- rollback_0016 — تراجع 0016_mill_v2 (سعر الكلفة، وبانية الخلطة، وتكاليف الطنّ، وسطور تكاليف الدفعة وتحميلها، والمادّة البديلة؛
-- مشغّل التراجع بالحزمة FOUNDATION ٨٢٠، ٨٧٦). يرجّع أجسام set_item_sell_price وitem_purchases (كما في 0014) وdelete_draft_line
-- وcreate_production وpreview_production وpost_production وvoid_production وrecipes_overview وrecipe_detail وproduction_detail
-- وverify_mill وactivate_recipe_version وconfirm_production_costs وprivate.recipe_lines_guard (كما في 0015) وvoid_expense
-- وreport_expenses (كما في 0008) وverify_stock (كما في 0010) حرفاً بحرف (md5 نفسه بالكتالوج)، وسياسة production_batches_read كما في
-- 0015، ثمّ يُسقط create_recipe وset_item_cost_price وadd_production_input وnew_recipe_version والمساعدات (ومنها shrink_ok) والحرّاس،
-- وسياسات نطاق الدفعة على جداول 0015 وسجلّ التدقيق (مراجعة 0016)، ومحفّز اسم فئة المصروف ودالّته (مراجعة 0016 الثانية)، والجداول
-- الثلاثة، وأعمدة production_inputs.replaced_item_id وitem_prices.cost_price وrecipe_lines.in_basis وrecipe_lines.base_unit (مراجعة 0016
-- الثالثة)، ويعيد item_prices.sell_price غير قابل للفراغ.
-- **طريق رفض (الكتلة أدناه):** إسقاط الجداول والعمودين يمسح معدّلات تكاليف كتبها المالك بيده في خلطاته، وسطور تكاليف الدفعات
-- وتحميلاتها من المصاريف (كلفة العلف المنتَج ومصدرها)، والمادّة التي حلّ محلّها كلّ بديل، وأسعار الكلفة المكتوبة؛ ولا تُستخرج من
-- مكان آخر. فالملف يرفض نفسه إن كان في القاعدة منها صفّ واحد. ونسخة خلطة غير مسوّدة لا يساوي مجموعُ كلّ سطورها أساسَها (فُعّلت بقاعدة
-- 0016 والوقود أو التعبئة خارج كتلتها) يرفضها فحص 0015 الثاني بعد التراجع، والمجمَّدة لا تُعدَّل، فتوقفه كذلك (مراجعة 0016 الثانية
-- #1). ونسخة غير مسوّدة فيها مادّة صارت باللتر بعد تفعيلها بالكيلو (سطر بلا لقطة كثافة) سليمة بقاعدة 0016 (لقطة الوحدة كيلوغرام)، ويرفضها
-- فحص 0015 الثالث بعد التراجع (يقرأ الوحدة الحيّة)، فتوقفه كذلك (مراجعة 0016 الثالثة #2). الفروع الخمسة منفصلة حتّى يُفحص كلّ واحد وحده.
-- تنعاد بأمان: drop if exists، وcreate or replace، وdrop constraint/column if exists.

set lock_timeout = '5s';

-- ٠) طريق الرفض: لا تُمسح تكاليف ولا تحميلات ولا بدائل ولا أسعار كلفة.
do $$
declare
  v_rates bigint;
  v_costs bigint;
  v_allocs bigint;
  v_replaced bigint;
  v_prices bigint;
  v_basis bigint;
  v_recipe text;
  v_units bigint;
  v_unit_recipe text;
begin
  select count(*) into v_rates from public.recipe_cost_rates;
  select count(*) into v_costs from public.production_costs;
  select count(*) into v_allocs from public.production_cost_allocations;
  select count(*) into v_replaced from public.production_inputs where replaced_item_id is not null;
  select count(*) into v_prices from public.item_prices where cost_price is not null;
  if v_rates > 0 or v_costs + v_allocs + v_replaced > 0 or v_prices > 0 then
    raise exception 'rollback_blocked'
      using hint = format('في القاعدة %s معدّل تكاليف بخلطة و%s سطر تكاليف بدفعة و%s تحميلاً من مصروف و%s مادّة بديلة و%s سعر كلفة مكتوب. التراجع يمسحها كلّها: صدّرها أوّلاً، أو احذفها بالشاشة وألغِ الدفعات.',
        v_rates, v_costs, v_allocs, v_replaced, v_prices);
  end if;
  -- نسخة غير مسوّدة لا يساوي مجموعُ كلّ سطورها أساسَها (حساب 0015 بلا استثناء الوقود والتعبئة، فحصه الثاني): فُعّلت بقاعدة 0016 والوقود
  -- أو التعبئة خارج كتلتها، فبعد التراجع يرفضها verify_mill كما في 0015 (recipe_basis_mismatch)، والنسخة المجمَّدة لا تُعدَّل.
  select count(*), (array_agg(x.name order by x.name collate "C", x.id))[1] into v_basis, v_recipe from (
    select r.id, r.name from public.recipe_versions v
    join public.recipes r on r.org_id = v.org_id and r.id = v.recipe_id
    join public.recipe_lines l on l.org_id = v.org_id and l.version_id = v.id
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where v.status <> 'draft'
    group by v.id, v.basis_kg, r.id, r.name
    having sum(private.recipe_line_kg(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l))) <> v.basis_kg
  ) as x;
  if v_basis > 0 then
    raise exception 'rollback_blocked'
      using hint = format('في القاعدة %s نسخة خلطة مفعَّلة أو مقاعدة فيها وقود أو تعبئة خارج أساسها، أوّلها في خلطة «%s». قاعدة 0015 تعدّ كلّ السطور في الأساس فيرفض فحصها هذه النسخ بعد التراجع، والنسخة المجمَّدة لا تُعدَّل: لا تراجع عن 0016 ما دامت موجودة.',
        v_basis, v_recipe);
  end if;
  -- سطر نسخة غير مسوّدة لمادّة باللتر بلا لقطة كثافة (مراجعة 0016 الثالثة #2): فُعّل والمادّة بالكيلو ثمّ صُحّحت لتراً، فلقطة وحدته في 0016
  -- كيلوغرام وverify_mill يراه سليماً؛ وفحص 0015 الثالث يقرأ الوحدة الحيّة فيرفضه بعد التراجع (recipe_frozen_bad_lines)، والمجمَّدة لا تُعدَّل.
  select count(distinct v.id), (array_agg(r.name order by r.name collate "C", r.id))[1] into v_units, v_unit_recipe
  from public.recipe_versions v
  join public.recipes r on r.org_id = v.org_id and r.id = v.recipe_id
  join public.recipe_lines l on l.org_id = v.org_id and l.version_id = v.id
  join public.items i on i.org_id = l.org_id and i.id = l.item_id
  where v.status <> 'draft' and i.base_unit = 'L' and l.density_kg_per_l is null;
  if v_units > 0 then
    raise exception 'rollback_blocked'
      using hint = format('في القاعدة %s نسخة خلطة مفعَّلة أو مقاعدة فيها مادّة صارت باللتر بعد تفعيلها بالكيلو، أوّلها في خلطة «%s». قاعدة 0015 تقرأ وحدة المادّة الآن فيرفض فحصها هذه النسخ بعد التراجع، والنسخة المجمَّدة لا تُعدَّل: لا تراجع عن 0016 ما دامت موجودة.',
        v_units, v_unit_recipe);
  end if;
end
$$;

-- ١) الأجسام المعاد بناؤها كما كانت قبل 0016 حرفاً بحرف:

-- public.set_item_sell_price كما في 0014_sell_price_item_ledger.sql حرفاً بحرف:
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

-- public.item_purchases كما في 0014_sell_price_item_ledger.sql حرفاً بحرف:
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

-- public.delete_draft_line كما في 0015_mill_recipes_production.sql حرفاً بحرف:
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
  else
    select status, version, warehouse_id into v_status, v_version, v_wh from public.stock_counts
    where org_id = public.auth_org() and id = v_doc for update;
  end if;
  -- سطر العليقة بلا مخزن (الخلطة للمنشأة كلّها بفعل recipe.activate)، فلا نطاق مخزن عليه.
  if v_wh is not null then
    perform private.stock_wh(v_wh, true);
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
  else
    delete from public.stock_count_line_costs where org_id = public.auth_org() and line_id = p_line_id;
    delete from public.stock_count_lines where org_id = public.auth_org() and id = p_line_id;
    update public.stock_counts set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  end if;
  return jsonb_build_object('line_id', p_line_id, 'deleted', true, 'doc_id', v_doc, 'version', v_version + 1);
end
$$;

-- public.void_expense كما في 0008_expenses_uses_counts.sql حرفاً بحرف:
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

-- public.report_expenses كما في 0008_expenses_uses_counts.sql حرفاً بحرف:
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
      exists (select 1 from public.expenses r where r.org_id = e.org_id and r.reverses_id = e.id) as reversed
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
      'reason', x.reason, 'reverses', x.reverses_id, 'reversed', x.reversed, 'amount', x.amount::text,
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

-- public.create_production كما في 0015_mill_recipes_production.sql حرفاً بحرف:
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
    select l.line_no, l.qty, l.unit, l.density_kg_per_l, i.id as item_id, i.name, i.base_unit, i.density_kg_per_l as item_density, i.scale_step
    from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where l.org_id = v_org and l.version_id = v.id order by l.line_no
  loop
    if ln.base_unit not in ('kg', 'L') then
      raise exception 'bad_recipe_unit' using hint = format('«%s» وحدتها قطعة، فلا تُسحب بالكتلة. راجع الخلطة.', ln.name);
    end if;
    if ln.base_unit = 'L' and coalesce(ln.density_kg_per_l, ln.item_density) is null then
      raise exception 'density_required' using hint = format('«%s» سائل بلا كثافة. اكتب كثافته في بطاقة المادّة ثمّ أعد الإنتاج.', ln.name);
    end if;
    if not private.item_admissible(wi.kind, (select i2.kind from public.items i2 where i2.org_id = v_org and i2.id = ln.item_id)) then
      raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s»: اختر مخزن المواد الذي فيه مواد الخلطة.', ln.name, wi.name);
    end if;
    v_mass := private._mul_div_round(private.recipe_line_kg(ln.qty, ln.unit, coalesce(ln.density_kg_per_l, ln.item_density)), p_planned_kg, v.basis_kg, 3);
    if v_mass <= 0 then
      raise exception 'qty_not_positive' using hint = format('كمية «%s» المخطّطة صفر عند هذا الحجم. أنتج كمية أكبر.', ln.name);
    end if;
    v_qty := private.round_step(case when ln.base_unit = 'kg' then v_mass else private.kg_to_liters(v_mass, coalesce(ln.density_kg_per_l, ln.item_density)) end, ln.scale_step);
    if v_qty <= 0 then
      raise exception 'qty_not_positive' using hint = format('كمية «%s» المخطّطة أصغر من دقّة عدّادها. أنتج كمية أكبر.', ln.name);
    end if;
    insert into public.production_inputs (org_id, batch_id, line_no, item_id, base_unit, density_kg_per_l, planned_qty_base, planned_mass_kg)
    values (v_org, d.id, ln.line_no, ln.item_id, ln.base_unit,
      case when ln.base_unit = 'L' then round(coalesce(ln.density_kg_per_l, ln.item_density), 4) else null end, v_qty, v_mass);
    v_lines := v_lines + 1;
  end loop;
  if v_lines = 0 then
    raise exception 'doc_empty' using hint = 'الخلطة بلا مواد. راجعها قبل الإنتاج.';
  end if;
  return jsonb_build_object('id', d.id, 'kind', 'production', 'status', 'draft', 'version', d.version,
    'recipe_id', r.id, 'recipe_name', r.name, 'recipe_version_id', v.id, 'output_item_id', o.id,
    'input_warehouse_id', wi.id, 'output_warehouse_id', wo.id, 'planned_kg', p_planned_kg::text, 'produced_on', p_produced_on,
    'lines', v_lines);
end
$$;

-- public.preview_production كما في 0015_mill_recipes_production.sql حرفاً بحرف:
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
    end if;
    v_plan := v_plan || r.id::text || '|' || array_to_string(v_pieces, ';') || '/';
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('input_id', r.id, 'line_no', r.line_no, 'item_id', r.item_id,
      'item_name', r.name, 'base_unit', r.base_unit, 'planned_qty', r.planned_qty_base::text, 'actual_qty', r.actual_qty_base::text,
      'draw_qty', v_got::text, 'in_basis', r.in_basis, 'tracks_expiry', r.tracks_expiry,
      'money', jsonb_build_object('value', v_value::text)));
  end loop;
  v_out := coalesce(d.output_qty_kg, round(v_mass, 3));
  v_shrink := round(v_mass - v_out, 3);
  v_pct := private.shrink_pct(v_shrink, v_mass);
  if not private.shrink_in_range(v_pct) and nullif(btrim(coalesce(d.shrink_reason, '')), '') is null then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'shrink_out_of_range', 'shrink_kg', v_shrink::text, 'shrink_pct', v_pct::text));
  end if;
  if (select i.tracks_expiry from public.items i where i.org_id = v_org and i.id = d.output_item_id) and d.output_expiry_on is null then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'expiry_required'));
  end if;
  if d.status = 'draft' and d.costs_confirmed_at is null and not public.can('production.post') then
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'costs_pending'));
  end if;
  return private.mask(jsonb_build_object('id', d.id, 'kind', 'production', 'status', d.status, 'version', d.version,
    'produced_on', d.produced_on, 'planned_kg', d.planned_kg::text, 'input_mass_kg', round(v_mass, 3)::text,
    'output_qty_kg', v_out::text, 'output_expiry_on', d.output_expiry_on, 'shrink_kg', v_shrink::text, 'shrink_pct', v_pct::text,
    'shrink_reason', d.shrink_reason, 'shrink_ok', private.shrink_in_range(v_pct), 'costs_confirmed', d.costs_confirmed_at is not null,
    'input_warehouse', jsonb_build_object('id', wi.id, 'name', wi.name), 'output_warehouse', jsonb_build_object('id', wo.id, 'name', wo.name),
    'lines', v_lines, 'problems', v_problems, 'can_post', d.status = 'draft' and not v_short and v_problems = '[]'::jsonb,
    'plan_token', private.plan_token(v_plan),
    'money', jsonb_build_object('input_value', v_total::text, 'extra_value', '0', 'total_value', v_total::text,
      'cost_per_kg', private.per_unit(v_total, v_out)::text)));
end
$$;

-- public.post_production كما في 0015_mill_recipes_production.sql حرفاً بحرف:
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
  perform private.lock_masters(array[wi.id, wo.id], v_items || array[d.output_item_id], true);
  select * into o from public.items where org_id = v_org and id = d.output_item_id;
  if not private.item_admissible(wo.kind, o.kind) then
    raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s»: نوع المادّة لا يناسب نوع مخزن الناتج.', o.name, wo.name);
  end if;
  if o.tracks_expiry and d.output_expiry_on is null then
    raise exception 'expiry_required' using hint = format('«%s» تُتابَع صلاحيتها، فاكتب تاريخ انتهاء الناتج قبل الترحيل.', o.name);
  end if;
  v_whs := array_fill(wi.id, array[cardinality(v_items)]) || array[wo.id];
  perform private.lock_balances(v_items || array[d.output_item_id], v_whs);
  for r in
    select p.*, i.name, i.base_unit as item_base, i.density_kg_per_l as item_density, i.tracks_expiry
    from public.production_inputs p join public.items i on i.org_id = p.org_id and i.id = p.item_id
    where p.org_id = v_org and p.batch_id = d.id order by p.line_no
  loop
    -- لقطة الوحدة والكثافة تُقارن بعد قفل المادّة (درس WP6، E46): تغييرهما بعد المسوّدة كان يرحّل كتلة غير التي حُسبت.
    if r.item_base is distinct from r.base_unit
      or (r.base_unit = 'L' and r.item_density is distinct from r.density_kg_per_l) then
      raise exception 'item_changed' using hint = format('تغيّرت وحدة «%s» أو كثافتها بعد إنشاء الدفعة. اطوِ المسوّدة وأنشئها من جديد.', r.name);
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
  if not private.shrink_in_range(v_pct) and nullif(btrim(coalesce(d.shrink_reason, '')), '') is null then
    raise exception 'shrink_out_of_range' using hint = format('الهدر %s كغم (%s٪) خارج المدى المقبول (صفر إلى ٣٪). اكتب سبب الفرق أو راجع الوزن.',
      to_char(v_shrink, 'FM999999990.999'), to_char(coalesce(v_pct, 0), 'FM999990.99'));
  end if;
  l := private.new_lot(o.id, wo.id, d.produced_on, d.output_expiry_on, null, v_out, v_total, 'production', d.id, null);
  perform private.apply_move(l.id, 'production', d.id, null, v_out, v_total, d.produced_on, null);
  insert into public.production_values (org_id, batch_id, input_value, extra_value, total_value) values (v_org, d.id, v_total, 0.00, v_total);
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
    'money', jsonb_build_object('input_value', v_total::text, 'extra_value', '0', 'total_value', v_total::text,
      'cost_per_kg', private.per_unit(v_total, v_out)::text)));
end
$$;

-- public.void_production كما في 0015_mill_recipes_production.sql حرفاً بحرف:
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
  update public.production_batches set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
  where org_id = v_org and id = d.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'kind', 'production', 'status', 'void', 'doc_no', d.doc_no,
    'reversed_lots', v_back));
end
$$;

-- public.recipes_overview كما في 0015_mill_recipes_production.sql حرفاً بحرف:
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
          -- مواد النسخة بكتلتها بالكيلو من الأكبر: شريط التركيبة ورقاقاتها تُقرأ بلمحة قبل الأرقام.
          'pieces', coalesce((select jsonb_agg(jsonb_build_object('item_id', l.item_id, 'item_name', i.name,
              'mass_kg', private.recipe_line_kg(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l))::text)
              order by private.recipe_line_kg(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l)) desc, i.name collate "C", l.id)
            from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
            where l.org_id = v.org_id and l.version_id = v.id), '[]'::jsonb))
        from public.recipe_versions v where v.org_id = r.org_id and v.recipe_id = r.id and v.status = 'active'),
      'draft', (select jsonb_build_object('id', v.id, 'version_no', v.version_no, 'basis_kg', v.basis_kg::text, 'version', v.version,
          'lines', (select count(*) from public.recipe_lines l where l.org_id = v.org_id and l.version_id = v.id))
        from public.recipe_versions v where v.org_id = r.org_id and v.recipe_id = r.id and v.status = 'draft'),
      'batches', (select count(*) from public.production_batches b join public.recipe_versions v2 on v2.org_id = b.org_id and v2.id = b.recipe_version_id
        where v2.org_id = r.org_id and v2.recipe_id = r.id and b.status = 'posted'),
      'last_batch', (select jsonb_build_object('id', b.id, 'doc_no', b.doc_no, 'produced_on', b.produced_on, 'output_qty_kg', b.output_qty_kg::text,
          'money', jsonb_build_object('total_value', pv.total_value::text,
            'cost_per_kg', private.per_unit(pv.total_value, b.output_qty_kg)::text))
        from public.production_batches b
        join public.recipe_versions v3 on v3.org_id = b.org_id and v3.id = b.recipe_version_id
        left join public.production_values pv on pv.org_id = b.org_id and pv.batch_id = b.id
        where v3.org_id = r.org_id and v3.recipe_id = r.id and b.status = 'posted'
        order by b.produced_on desc, b.id desc limit 1)
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

-- public.recipe_detail كما في 0015_mill_recipes_production.sql حرفاً بحرف:
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
        'kind', i.kind, 'base_unit', i.base_unit, 'category_id', i.category_id,
        'category_name', (select c.name from public.item_categories c where c.org_id = v_org and c.id = i.category_id),
        'qty', l.qty::text, 'unit', l.unit, 'mass_kg', private.recipe_line_kg(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l))::text,
        'share_pct', private._mul_div_round(private.recipe_line_kg(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l)), 100, v.basis_kg, 2)::text,
        'money', jsonb_build_object('unit_cost', (select private.per_unit(sum(s.value_left), sum(s.qty_left))::text
          from public.stock_lots s where s.org_id = v_org and s.item_id = l.item_id and s.qty_left > 0)))
      order by l.line_no)
      from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
      where l.org_id = v_org and l.version_id = v.id), '[]'::jsonb) end,
    'mass_kg', case when v.id is null then null else coalesce((select sum(private.recipe_line_kg(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l)))
      from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
      where l.org_id = v_org and l.version_id = v.id), 0)::text end,
    -- المرشَّحات لسطر جديد: مادّة فعّالة يستلمها مخزن المواد الأوّلية وتُقاس بالكيلو أو اللتر (القطعة لا تدخل العليقة).
    'pick_items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'base_unit', i.base_unit,
        'category_name', (select c.name from public.item_categories c where c.org_id = v_org and c.id = i.category_id))
        order by i.name_norm collate "C", i.id)
      from public.items i
      where i.org_id = v_org and i.archived_at is null and i.base_unit in ('kg', 'L') and private.item_admissible('raw', i.kind)), '[]'::jsonb)));
end
$$;

-- public.production_detail كما في 0015_mill_recipes_production.sql حرفاً بحرف:
create or replace function public.production_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  d public.production_batches;
  v public.recipe_versions;
  r public.recipes;
begin
  perform private.require('read');
  select * into d from public.production_batches where org_id = v_org and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذه الدفعة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_wh(d.input_warehouse_id) then
    raise exception 'out_of_scope' using hint = 'مخزن مدخلات هذه الدفعة خارج نطاقك.';
  end if;
  select * into v from public.recipe_versions where org_id = v_org and id = d.recipe_version_id;
  select * into r from public.recipes where org_id = v_org and id = v.recipe_id;
  return private.mask(jsonb_build_object(
    'id', d.id, 'doc_no', d.doc_no, 'status', d.status, 'version', d.version, 'produced_on', d.produced_on,
    'planned_kg', d.planned_kg::text, 'output_qty_kg', d.output_qty_kg::text, 'output_expiry_on', d.output_expiry_on,
    'input_mass_kg', d.input_mass_kg::text, 'shrink_kg', d.shrink_kg::text,
    'shrink_pct', private.shrink_pct(d.shrink_kg, d.input_mass_kg)::text, 'shrink_reason', d.shrink_reason,
    'note', d.note, 'void_reason', d.void_reason, 'costs_confirmed', d.costs_confirmed_at is not null,
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
        'money', jsonb_build_object('value', (select iv.value::text from public.production_input_values iv
          where iv.org_id = v_org and iv.input_id = p.id)))
      order by p.line_no)
      from public.production_inputs p join public.items i on i.org_id = p.org_id and i.id = p.item_id
      where p.org_id = v_org and p.batch_id = d.id), '[]'::jsonb),
    'money', (select jsonb_build_object('input_value', pv.input_value::text, 'extra_value', pv.extra_value::text,
        'total_value', pv.total_value::text,
        'cost_per_kg', private.per_unit(pv.total_value, d.output_qty_kg)::text)
      from public.production_values pv where pv.org_id = v_org and pv.batch_id = d.id)));
end
$$;

-- public.verify_mill كما في 0015_mill_recipes_production.sql حرفاً بحرف:
create or replace function public.verify_mill() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  -- ١) نسخة مفعَّلة واحدة لكلّ خلطة.
  select 'recipe_many_active', count(*) from (
    select v.recipe_id from public.recipe_versions v where v.status = 'active' group by v.org_id, v.recipe_id having count(*) > 1
  ) as x
  union all
  -- ٢) كلّ نسخة غير مسوّدة مجموع موادّها بالكيلو = أساسها (التفعيل يفحصه، والجمود يحفظه).
  select 'recipe_basis_mismatch', count(*) from (
    select v.id from public.recipe_versions v
    join public.recipe_lines l on l.org_id = v.org_id and l.version_id = v.id
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where v.status <> 'draft'
    group by v.id, v.basis_kg
    having sum(private.recipe_line_kg(l.qty, l.unit, coalesce(l.density_kg_per_l, i.density_kg_per_l))) <> v.basis_kg
  ) as x
  union all
  -- ٣) نسخة غير مسوّدة بلا سطور، أو سطر سائل بلا لقطة كثافة.
  select 'recipe_frozen_bad_lines', count(*) from public.recipe_versions v
  where v.status <> 'draft' and (
    not exists (select 1 from public.recipe_lines l where l.org_id = v.org_id and l.version_id = v.id)
    or exists (select 1 from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
      where l.org_id = v.org_id and l.version_id = v.id and i.base_unit = 'L' and l.density_kg_per_l is null))
  union all
  -- ٤) قيمة دفعة الناتج = كلفة الدفعة بالضبط (القاعدة ٢١: لا يضيع فلس بين الإنتاج والمخزن).
  select 'production_output_value', count(*) from public.production_batches b
  join public.stock_lots l on l.org_id = b.org_id and l.id = b.output_lot_id
  left join public.production_values pv on pv.org_id = b.org_id and pv.batch_id = b.id
  where b.status = 'posted' and (l.value_in is distinct from coalesce(pv.total_value, -1) or l.qty_in is distinct from b.output_qty_kg)
  union all
  -- ٥) كلفة الدفعة = مجموع قيم مدخلاتها + الكلف اليدوية (صفر في هذه النسخة).
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
$$;

-- public.verify_stock كما في 0010_supplier_returns_revaluations.sql حرفاً بحرف:
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
      + coalesce((select sum(v.lot_share) from public.receipt_revaluations v where v.org_id = o.id and v.status = 'posted'), 0) as inputs,
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

-- public.activate_recipe_version كما في 0015_mill_recipes_production.sql حرفاً بحرف:
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
    select l.id, l.qty, l.unit, l.item_id, i.name, i.base_unit, i.density_kg_per_l
    from public.recipe_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where l.org_id = v_org and l.version_id = v.id order by l.line_no
  loop
    if ln.base_unit not in ('kg', 'L') then
      raise exception 'bad_recipe_unit' using hint = format('«%s» وحدتها قطعة، والعليقة تُحسب بالكتلة: احذف سطرها.', ln.name);
    end if;
    if ln.base_unit = 'L' and ln.density_kg_per_l is null then
      raise exception 'density_required' using hint = format('«%s» سائل بلا كثافة، فلا يُحسب وزنه. اكتب كثافته في بطاقة المادّة ثمّ فعّل.', ln.name);
    end if;
    if ln.qty is null or not (abs(ln.qty) < 'Infinity') or ln.qty <= 0 then
      raise exception 'qty_not_positive' using hint = format('كمية «%s» في الخلطة يجب أن تكون أكبر من صفر.', ln.name);
    end if;
    if ln.base_unit = 'L' then
      update public.recipe_lines set density_kg_per_l = round(ln.density_kg_per_l, 4) where org_id = v_org and id = ln.id;
    end if;
    v_sum := v_sum + private.recipe_line_kg(ln.qty, ln.unit, ln.density_kg_per_l);
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then
    raise exception 'doc_empty' using hint = 'الخلطة بلا مواد. أضف مادّة واحدة على الأقلّ قبل التفعيل.';
  end if;
  if v_sum <> v.basis_kg then
    raise exception 'basis_mismatch' using hint = format('مجموع مواد الخلطة %s كغم، والأساس %s كغم: الفرق %s كغم. عدّل الكميات أو الأساس حتّى يتساويا.',
      to_char(v_sum, 'FM999999990.999'), to_char(v.basis_kg, 'FM999999990.999'), to_char(v_sum - v.basis_kg, 'FM999999990.999'));
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

-- public.confirm_production_costs كما في 0015_mill_recipes_production.sql حرفاً بحرف:
create or replace function public.confirm_production_costs(p_id uuid, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  d public.production_batches;
begin
  set local lock_timeout = '5s';
  perform private.require('costs.load');
  select * into d from public.production_batches where org_id = v_org and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذه الدفعة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  perform private.stock_wh(d.input_warehouse_id, false);
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
  update public.production_batches set costs_confirmed_at = now(), costs_confirmed_by = auth.uid(), version = version + 1
  where org_id = v_org and id = d.id;
  return jsonb_build_object('id', d.id, 'costs_confirmed', true, 'written', true, 'version', d.version + 1);
end
$$;

-- private.recipe_lines_guard كما في 0015_mill_recipes_production.sql حرفاً بحرف (مراجعة 0016 الثانية زادته لقطة «داخل الكتلة»):
create or replace function private.recipe_lines_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.recipe_versions;
  i public.items;
begin
  set local lock_timeout = '5s';
  -- لقطة الكثافة عمود غير ممنوح لأحد، فتغيّرها لا يكون إلا من دالّة التفعيل (حدّها المنح لا current_user).
  if tg_op = 'UPDATE' and new.density_kg_per_l is distinct from old.density_kg_per_l then
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
    new.line_no := coalesce((select max(l.line_no) from public.recipe_lines l where l.org_id = v.org_id and l.version_id = v.id), 0) + 1;
  else
    new.line_no := old.line_no;
  end if;
  update public.recipe_versions set version = version + 1 where org_id = v.org_id and id = v.id;
  return new;
end
$$;

-- ٢) الدوالّ الجديدة والمساعدات:
drop function if exists public.create_recipe(uuid, uuid, text, uuid, numeric, jsonb, jsonb, boolean);
drop function if exists public.new_recipe_version(uuid, uuid);
drop function if exists private.shrink_ok(numeric, numeric);
drop function if exists public.set_item_cost_price(uuid, numeric, numeric);
drop function if exists public.add_production_input(uuid, uuid, uuid, numeric, uuid, text);
drop function if exists private.recipe_expected(uuid);
drop function if exists private.item_last_price(uuid);
drop function if exists private.mill_expense_free(uuid, uuid);
drop function if exists private.money_text(numeric);

-- ٢-ب) سياسات نطاق الدفعة على جداول 0015 وسجلّ التدقيق (مراجعة 0016؛ سياستا جدولَي التكاليف والتحميلات تسقطان بإسقاطهما في ٣):
drop policy if exists production_inputs_batch_scope on public.production_inputs;
drop policy if exists production_values_batch_scope on public.production_values;
drop policy if exists production_input_values_batch_scope on public.production_input_values;
drop policy if exists audit_log_mill_scope on public.audit_log;
-- سياسة قراءة الدفعة بنطاق مخزن المدخلات وحده كما في 0015 (مراجعة 0016 الثانية وسّعتها لطرفيها).
drop policy if exists production_batches_read on public.production_batches;
create policy production_batches_read on public.production_batches for select to authenticated
  using (org_id = (select public.auth_org()) and (select public.in_scope_wh(input_warehouse_id)));

-- ٢-ج) اسم فئة المصروف (مراجعة 0016 الثانية): المحفّز ثمّ دالّته.
drop trigger if exists expense_categories_name_guard on public.expense_categories;
drop function if exists private.expense_categories_name_guard();

-- ٣) الجداول (الأبناء قبل الآباء؛ إسقاط الجدول يُسقط مشغّلاته وسياساته)، ثمّ حرّاسها:
drop table if exists public.production_cost_allocations;
drop table if exists public.production_costs;
drop table if exists public.recipe_cost_rates;
drop function if exists private.production_costs_guard();
drop function if exists private.recipe_cost_rates_guard();

-- ٤) المادّة البديلة بلا «ما حلّت محلّه»:
drop index if exists public.production_inputs_replaced_item;
alter table public.production_inputs drop constraint if exists production_inputs_replaced_item_fkey;
alter table public.production_inputs drop column if exists replaced_item_id;

-- ٤-ب) لقطتا «داخل الكتلة» ووحدة الأساس على سطر الخلطة (مراجعتا 0016 الثانية والثالثة): حارس السطر رجع لجسم 0015 فوق، والعمودان يُسقطان
-- (وقيد الوحدة معه).
alter table public.recipe_lines drop column if exists in_basis;
alter table public.recipe_lines drop column if exists base_unit;

-- ٥) جدول الأسعار بسعر البيع وحده كما في 0014 (صفّ بلا سعر بيع لا يكون إلّا لسعر كلفة، وطريق الرفض أوقف التراجع قبله):
delete from public.item_prices where sell_price is null;
alter table public.item_prices drop constraint if exists item_prices_some_price_check;
alter table public.item_prices drop constraint if exists item_prices_cost_price_check;
alter table public.item_prices drop column if exists cost_price;
alter table public.item_prices alter column sell_price set not null;
