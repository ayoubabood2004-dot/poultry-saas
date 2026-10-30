-- rollback_0010 — تراجع 0010_supplier_returns_revaluations (خطّة المرحلة 1 WP7، مشغّل التراجع بالحزمة FOUNDATION ٨٢٠، ٨٧٦).
-- يرجّع أجسام void_receipt وdiscard_draft وdelete_draft_line وverify_stock وverify_ledger كما بـ0009، وstock_doc_label كما بـ0008،
-- وvoid_party_entry وreport_party_statement كما بـ0006، وcheck_lot_intact كما بـ0007، حرفاً بحرف (md5 نفسه بالكتالوج)، ويشيل اللي انضاف بـ0010: جداول المرتجع والتصحيح الأربعة وكل دوالّها ومساعداتها ومشغّلاتها، وسياسة
-- نطاقها على سجلّ التدقيق (audit_log_wp7_scope). المال والمخزون ما ينحذفان أبداً (FOUNDATION ٦٣): أي مرتجع (ولو مسوّدة) أو تصحيح
-- يوقف التراجع بصوت ويرجع كلّه (المعاملة وحدة)، والمالك يقرّر شنو يسوّي بيه. سجلّ التدقيق يبقى كما هو.

set lock_timeout = '5s';

-- الجداول تتقفل قبل العدّ ولحد نهاية المعاملة (درس WP4).
lock table public.supplier_returns, public.supplier_return_lines, public.supplier_return_line_amounts, public.receipt_revaluations
  in access exclusive mode;

do $$
declare
  v_returns bigint;
  v_revaluations bigint;
begin
  select count(*) into v_returns from public.supplier_returns;
  select count(*) into v_revaluations from public.receipt_revaluations;
  if v_returns + v_revaluations > 0 then
    raise exception 'rollback_blocked' using hint = format('توجد %s من مستندات مرتجع المورّد (مع المسوّدات) و%s من تصحيحات السعر، والتراجع لا يحذف مالاً ولا مخزوناً ولا مسوّدات. قرّر مصيرها أوّلاً ثم أعد التراجع.', v_returns, v_revaluations);
  end if;
end
$$;

drop policy if exists audit_log_wp7_scope on public.audit_log;

create or replace function public.void_receipt(p_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_receipt';
  v_cached jsonb;
  v_reason text;
  d public.receipts;
  w public.warehouses;
  l public.stock_lots;
  mv public.stock_moves;
  e public.party_entries;
  m public.cash_moves;
  v_items uuid[];
  v_parties uuid[];
  v_category uuid;
  v_back jsonb := '[]'::jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into d from public.receipts where org_id = public.auth_org() and id = p_id;
  if d.id is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(d.warehouse_id, true);
  v_parties := private.receipt_parties(d.id);
  perform private.lock_parties(v_parties);
  perform private.check_void_date();
  select * into d from public.receipts where org_id = w.org_id and id = p_id for update;
  if d.status = 'void' then
    raise exception 'already_void' using hint = 'هذا الاستلام ملغى من قبل.';
  end if;
  if d.status <> 'posted' then
    raise exception 'not_posted' using hint = 'هذا الاستلام مسوّدة لم تُرحَّل؛ تُطوى المسوّدة بدل إلغائها.';
  end if;
  -- الجهات انقرت بلا قفل (E9): مسوّدة غيّرت ناقلها ورُحّلت قبل قفل المستند تكتب قيداً لجهة ما انقفلت، فتنفحص بعده.
  if not (private.receipt_parties(d.id) <@ v_parties) then
    raise exception 'stale_draft' using hint = 'تغيّر الاستلام أثناء الإلغاء. حدّث الشاشة وأعد المحاولة.';
  end if;
  perform private.book_for_post(d.book_id);
  select array_agg(distinct x.item_id) into v_items from public.stock_lots x where x.org_id = d.org_id and x.source_kind = 'receipt' and x.source_id = d.id;
  perform private.lock_masters(array[w.id], v_items, false);
  perform private.lock_balances(v_items, array_fill(w.id, array[cardinality(v_items)]));
  for l in select * from public.stock_lots x where x.org_id = d.org_id and x.source_kind = 'receipt' and x.source_id = d.id order by x.id for no key update loop
    perform private.check_lot_intact(l.id);
  end loop;
  for mv in
    select x.* from public.stock_moves x
    where x.org_id = d.org_id and x.doc_kind = 'receipt' and x.doc_id = d.id and x.reverses_move_id is null
    order by x.item_id, x.seq
  loop
    perform private.apply_move(mv.lot_id, 'receipt', d.id, mv.doc_line_id, -mv.qty, -mv.value, public.app_today(), mv.id);
    v_back := v_back || jsonb_build_array(mv.lot_id);
  end loop;
  for e in
    select x.* from public.party_entries x
    where x.org_id = d.org_id and x.doc_kind = 'receipt' and x.doc_id = d.id and x.kind = 'purchase' and x.reverses_entry_id is null
      and not exists (select 1 from public.party_entries r where r.org_id = x.org_id and r.reverses_entry_id = x.id)
    order by x.party_id, x.seq
  loop
    perform private.void_entry(e.id, v_reason);
  end loop;
  select x.id into v_category from public.expense_categories x where x.org_id = d.org_id and x.system_code = 'voided_receipt';
  for m in
    select x.* from public.cash_moves x
    where x.org_id = d.org_id and x.doc_kind = 'receipt' and x.doc_id = d.id and x.kind = 'receipt_charge' and x.reverses_move_id is null
    order by x.account_id, x.seq
  loop
    insert into public.expenses (org_id, category_id, division_id, amount, on_date, for_month, source, doc_kind, doc_id, cash_move_id, note)
    values (d.org_id, v_category, w.division_id, -m.amount, public.app_today(), date_trunc('month', public.app_today())::date, 'adjustment',
      'receipt', d.id, m.id, m.note);
  end loop;
  update public.receipts set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
  where org_id = d.org_id and id = d.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', d.id, 'kind', 'receipt', 'status', 'void', 'doc_no', d.doc_no,
    'reversed_lots', v_back));
end
$$;

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
  elsif p_doc_kind = 'stock_use' then
    perform private.require('stock_use.post');
    select status, version, warehouse_id into v_status, v_version, v_wh from public.stock_uses
    where org_id = public.auth_org() and id = p_id for update;
  elsif p_doc_kind = 'count' then
    select status, version, warehouse_id into v_status, v_version, v_wh from public.stock_counts
    where org_id = public.auth_org() and id = p_id for update;
    perform private.require(case when v_status = 'submitted' then 'count.approve' else 'count.enter' end);
  elsif p_doc_kind = 'receipt' then
    perform private.require('receipt.draft');
    select status, version, warehouse_id into v_status, v_version, v_wh from public.receipts
    where org_id = public.auth_org() and id = p_id for update;
  else
    raise exception 'doc_kind_unknown' using hint = 'نوع المستند غير معروف.';
  end if;
  if v_status is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  perform private.stock_wh(v_wh, true);
  if v_status <> 'draft' and not (p_doc_kind = 'count' and v_status = 'submitted') then
    raise exception 'not_draft' using hint = 'هذا المستند ليس مسوّدة: رُحّل أو أُلغي من قبل.';
  end if;
  if p_expected_version is null or v_version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّرت المسوّدة بعد فتحها. حدّث الشاشة وأعد المحاولة.';
  end if;
  if p_doc_kind = 'opening' then
    update public.opening_docs set status = 'void', voided_at = now(), voided_by = auth.uid(), version = version + 1
    where org_id = public.auth_org() and id = p_id;
  elsif p_doc_kind = 'transfer' then
    update public.transfers set status = 'void', voided_at = now(), voided_by = auth.uid(), version = version + 1
    where org_id = public.auth_org() and id = p_id;
  elsif p_doc_kind = 'stock_use' then
    update public.stock_uses set status = 'void', voided_at = now(), voided_by = auth.uid(), version = version + 1
    where org_id = public.auth_org() and id = p_id;
  elsif p_doc_kind = 'receipt' then
    update public.receipts set status = 'void', voided_at = now(), voided_by = auth.uid(), version = version + 1
    where org_id = public.auth_org() and id = p_id;
  else
    update public.stock_counts set status = 'void', voided_at = now(), voided_by = auth.uid(), version = version + 1
    where org_id = public.auth_org() and id = p_id;
  end if;
  return jsonb_build_object('id', p_id, 'kind', p_doc_kind, 'status', 'void', 'version', v_version + 1);
end
$$;

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
  else
    select status, version, warehouse_id into v_status, v_version, v_wh from public.stock_counts
    where org_id = public.auth_org() and id = v_doc for update;
  end if;
  perform private.stock_wh(v_wh, true);
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
  else
    delete from public.stock_count_line_costs where org_id = public.auth_org() and line_id = p_line_id;
    delete from public.stock_count_lines where org_id = public.auth_org() and id = p_line_id;
    update public.stock_counts set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  end if;
  return jsonb_build_object('line_id', p_line_id, 'deleted', true, 'doc_id', v_doc, 'version', v_version + 1);
end
$$;

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
        join public.receipts r on r.org_id = a.org_id and r.id = a.doc_id where a.org_id = o.id and r.status = 'posted'), 0) as inputs,
      coalesce((select sum(l.value_left) from public.stock_lots l where l.org_id = o.id), 0)
      + coalesce((select sum(e.amount) from public.expenses e where e.org_id = o.id and e.source = 'stock'), 0) as outputs
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
  -- 16. قيمة الدفعة (الخطّة 12): لكل سطر مرحَّل قيمة دفعته الداخلة = مبلغه − حصّة الخصم + حصّة التحميلات (التقييم يجي بـWP7).
  select 'receipt_lot_values', count(*) from public.receipt_line_amounts a
  join public.receipts r on r.org_id = a.org_id and r.id = a.doc_id
  join public.stock_lots l on l.org_id = a.org_id and l.source_kind = 'receipt' and l.source_id = r.id and l.source_line_id = a.line_id
  where r.posted_at is not null and l.value_in is distinct from a.line_total - a.discount_share + a.charge_share
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
$$;

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
  -- 8. كل حركة صندوق مربوطة بمصدرها: القبض بقيد payment والدفع بقيد payout وبالمبلغ المعاكس، والمصروف (WP5) بمصروف واحد يشير إلها
  --    وبمستند expense؛ ودفعة الاستلام (WP6) بقيد payout مستنده الاستلام وبمبلغه المعاكس، وتحميله بتحميل واحد يشير إلها وبمبلغه؛ والافتتاح بلا مستند.
  select 'cash_move_sources', count(*) from public.cash_moves m
  left join public.party_entries e on e.org_id = m.org_id and e.id = m.party_entry_id
  where (m.kind = 'party_payment' and (e.id is null or e.kind <> 'payment' or m.amount <> -e.amount))
    or (m.kind = 'party_payout' and (e.id is null or e.kind <> 'payout' or e.doc_kind is not null or m.amount <> -e.amount))
    or (m.kind = 'receipt_paid' and (e.id is null or e.kind <> 'payout' or e.doc_kind is distinct from 'receipt' or m.doc_kind is distinct from 'receipt'
      or m.doc_id is distinct from e.doc_id or m.amount <> -e.amount))
    or (m.kind = 'receipt_charge' and (m.doc_kind is distinct from 'receipt' or m.party_entry_id is not null
      or (m.reverses_move_id is null and (select count(*) from public.receipt_charges c where c.org_id = m.org_id and c.cash_move_id = m.id
        and c.amount = -m.amount and c.doc_id = m.doc_id) <> 1)))
    or (m.kind = 'expense' and (m.doc_kind is distinct from 'expense' or m.party_entry_id is not null
      or (select count(*) from public.expenses x where x.org_id = m.org_id and x.cash_move_id = m.id) <> 1))
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
        union all
        -- SU وCT (0008): الصرف المرحَّل والجرد الموافَق عليه (والملغى بعد ترحيله) برقمه.
        select u.org_id, split_part(u.doc_no, '-', 1), split_part(u.doc_no, '-', 2)::int, split_part(u.doc_no, '-', 3)::int
        from public.stock_uses u where u.doc_no is not null
        union all
        select k.org_id, split_part(k.doc_no, '-', 1), split_part(k.doc_no, '-', 2)::int, split_part(k.doc_no, '-', 3)::int
        from public.stock_counts k where k.doc_no is not null
        union all
        -- PU (0009): الاستلام المرحَّل (والملغى بعد ترحيله) برقمه.
        select r.org_id, split_part(r.doc_no, '-', 1), split_part(r.doc_no, '-', 2)::int, split_part(r.doc_no, '-', 3)::int
        from public.receipts r where r.doc_no is not null
      ) as n
      group by n.org_id, n.kind, n.year
    ) as g
    full join (select * from public.doc_counters where kind in ('RC', 'PY', 'TR', 'SU', 'CT', 'PU')) as c on c.org_id = g.org_id and c.kind = g.kind and c.year = g.year
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
  ) + (
    -- الصرف برقم SU بسنة تاريخه، والجرد الموافَق عليه برقم CT بسنة تاريخه، وغير المرحَّل بلا رقم.
    select count(*) from public.stock_uses u
    where (u.posted_at is null and u.doc_no is not null)
      or (u.posted_at is not null and (u.doc_no is null or u.doc_no !~ '^SU-' or split_part(u.doc_no, '-', 2) <> to_char(u.used_on, 'YYYY')))
  ) + (
    select count(*) from public.stock_counts k
    where (k.posted_at is null and k.doc_no is not null)
      or (k.posted_at is not null and (k.doc_no is null or k.doc_no !~ '^CT-' or split_part(k.doc_no, '-', 2) <> to_char(k.counted_on, 'YYYY')))
  ) + (
    -- الاستلام برقم PU بسنة تاريخه، والمسوّدة والمطويّة بلا رقم (والملغى بعد ترحيله يبقى برقمه).
    select count(*) from public.receipts r
    where (r.posted_at is null and r.doc_no is not null)
      or (r.posted_at is not null and (r.doc_no is null or r.doc_no !~ '^PU-' or split_part(r.doc_no, '-', 2) <> to_char(r.received_on, 'YYYY')))
  )
  union all
  -- 14. المصاريف (WP5، E10): كل مصروف نقدي بحركة صندوق expense بمستنده وصندوقه وتاريخه وبمبلغه المعاكس، وبالدين بقيد bill بجهته
  --     ودفتر وحدته وتاريخه وبمبلغه المعاكس؛ والعكسي بعكس حركة أصله أو قيده؛ والنقدي وبالدين بدينار صحيح؛ وكل قيد bill بمستند
  --     expense بمصروفه، والمصروف بمصدره الصحيح (stock للصرف والجرد بس).
  select 'expense_sources', (
    select count(*) from public.expenses e
    left join public.cash_moves m on m.org_id = e.org_id and m.id = e.cash_move_id
    left join public.party_entries p on p.org_id = e.org_id and p.id = e.party_entry_id
    left join public.expenses o on o.org_id = e.org_id and o.id = e.reverses_id
    where (e.source = 'cash' and (m.id is null or m.kind <> 'expense' or m.amount <> -e.amount or m.account_id is distinct from e.account_id
        or m.doc_kind is distinct from 'expense' or m.doc_id is distinct from coalesce(e.reverses_id, e.id) or m.on_date <> e.on_date
        or (m.reverses_move_id is null) <> (e.reverses_id is null) or (e.reverses_id is not null and m.reverses_move_id is distinct from o.cash_move_id)))
      or (e.source = 'credit' and (p.id is null or p.kind <> 'bill' or p.amount <> -e.amount or p.party_id is distinct from e.party_id
        or p.book_id is distinct from e.book_id or p.doc_kind is distinct from 'expense' or p.doc_id is distinct from coalesce(e.reverses_id, e.id)
        or p.on_date <> e.on_date or (p.reverses_entry_id is null) <> (e.reverses_id is null)
        or (e.reverses_id is not null and p.reverses_entry_id is distinct from o.party_entry_id)
        or not exists (select 1 from public.ledger_books b where b.org_id = e.org_id and b.id = e.book_id and b.division_id = e.division_id)))
      or (e.source in ('cash', 'credit') and e.amount <> round(e.amount, 0))
      or (e.source = 'stock' and e.doc_kind not in ('stock_use', 'count'))
  ) + (
    select count(*) from public.party_entries p
    where p.doc_kind = 'expense' and (p.kind <> 'bill'
      or (select count(*) from public.expenses x where x.org_id = p.org_id and x.party_entry_id = p.id) <> 1)
  )
  union all
  -- E14: وحدة بيها قيد جهة أو مصروف مختومة بأوّل ترحيل (first_posted_at)، فيوم تشغيلها متجمّد (mark_division_posted بكل دالّة ترحيل).
  select 'posted_division_stamped', count(*) from public.divisions d
  where d.first_posted_at is null
    and (exists (select 1 from public.party_entries e join public.ledger_books b on b.org_id = e.org_id and b.id = e.book_id where b.org_id = d.org_id and b.division_id = d.id)
      or exists (select 1 from public.expenses x where x.org_id = d.org_id and x.division_id = d.id));

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

create or replace function private.stock_doc_label(p_kind text, p_doc uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case p_kind
    when 'transfer' then coalesce((select t.doc_no from public.transfers t where t.org_id = public.auth_org() and t.id = p_doc), 'تحويل')
    when 'opening' then coalesce((select format('رصيد افتتاح بتاريخ %s', to_char(o.on_date, 'DD/MM/YYYY')) from public.opening_docs o
      where o.org_id = public.auth_org() and o.id = p_doc), 'رصيد افتتاح')
    when 'stock_use' then coalesce((select u.doc_no from public.stock_uses u where u.org_id = public.auth_org() and u.id = p_doc), 'صرف')
    when 'count' then coalesce((select c.doc_no from public.stock_counts c where c.org_id = public.auth_org() and c.id = p_doc), 'جرد')
    when 'count_gain' then coalesce((select c.doc_no from public.stock_counts c where c.org_id = public.auth_org() and c.id = p_doc), 'جرد')
    else p_kind
  end
$$;

create or replace function public.void_party_entry(p_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_party_entry';
  v_cached jsonb;
  v_reason text;
  o public.party_entries;
  r public.party_entries;
  v_rev uuid;
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into o from public.party_entries where org_id = public.auth_org() and id = p_id;
  if o.id is null then
    raise exception 'entry_not_found' using hint = 'هذا القيد غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if o.kind not in ('opening', 'adjustment', 'forgiveness') or o.reverses_entry_id is not null then
    raise exception 'entry_not_voidable' using hint = 'يُلغى من هنا قيد الافتتاح والتسوية والإعفاء فقط؛ القبض والدفع من «ألغِ القبض أو الدفع»، والمستندات من مستندها.';
  end if;
  perform private.book_for_post(o.book_id);
  perform private.lock_parties(array[o.party_id]);
  perform private.check_void_date();
  v_rev := private.void_entry(o.id, v_reason);
  select * into r from public.party_entries where org_id = o.org_id and id = v_rev;
  return private.ref_store(v_fn, p_client_ref, private.entry_result(r, '[]'::jsonb, null));
end
$$;

create or replace function public.report_party_statement(p_party uuid, p_book uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_party jsonb;
  v_to date := coalesce(p_to, public.app_today());
begin
  if not (public.can('accounts.view') and public.can_see_accounts()) then
    raise exception 'forbidden' using hint = 'الحسابات للمالك والمدير والمحاسب فقط.';
  end if;
  if p_from is null or p_from > v_to then
    raise exception 'period_required' using hint = 'حدّد المدّة: من تاريخ إلى تاريخ لا يسبقه.';
  end if;
  select jsonb_build_object('id', p.id, 'name', p.name, 'phone', p.phone, 'archived', p.archived_at is not null, 'version', p.version,
      'is_customer', p.is_customer, 'is_supplier', p.is_supplier)
  into v_party from public.parties p where p.org_id = v_org and p.id = p_party;
  if v_party is null then
    raise exception 'party_not_found' using hint = 'هذه الجهة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if p_book is not null and not public.in_scope_book(p_book) then
    raise exception 'out_of_scope' using hint = 'هذا الدفتر خارج نطاقك.';
  end if;
  return jsonb_build_object('party', v_party, 'from', p_from, 'to', v_to, 'books', coalesce((
    select jsonb_agg(jsonb_build_object(
        'book_id', b.id, 'code', b.code, 'name', b.name, 'division_id', b.division_id, 'division_kind', d.kind,
        'brought_forward', s.bf::text, 'total_debit', s.debit::text, 'total_credit', s.credit::text, 'closing', (s.bf + s.debit - s.credit)::text,
        'lines', s.lines)
      order by d.kind collate "C", b.code collate "C")
    from public.ledger_books b
    join public.divisions d on d.org_id = b.org_id and d.id = b.division_id
    cross join lateral (
      select
        coalesce((select sum(e.amount) from public.party_entries e where e.org_id = v_org and e.party_id = p_party and e.book_id = b.id and e.on_date < p_from), 0) as bf,
        coalesce((select sum(e.amount) from public.party_entries e where e.org_id = v_org and e.party_id = p_party and e.book_id = b.id
          and e.on_date between p_from and v_to and e.amount > 0), 0) as debit,
        coalesce((select -sum(e.amount) from public.party_entries e where e.org_id = v_org and e.party_id = p_party and e.book_id = b.id
          and e.on_date between p_from and v_to and e.amount < 0), 0) as credit,
        coalesce((
          select jsonb_agg(jsonb_build_object('entry_id', l.id, 'on_date', l.on_date, 'seq', l.seq::text, 'kind', l.kind, 'doc_no', l.doc_no,
              'reason', l.reason, 'reverses', l.reverses_entry_id, 'reversed', l.reversed, 'account', l.account, 'debit', greatest(l.amount, 0)::text,
              'credit', greatest(-l.amount, 0)::text, 'balance', l.balance::text)
            order by l.on_date, l.seq)
          from (
            select e.*, exists (select 1 from public.party_entries r where r.org_id = e.org_id and r.reverses_entry_id = e.id) as reversed,
              (select a.name from public.cash_moves m join public.cash_accounts a on a.org_id = m.org_id and a.id = m.account_id
               where m.org_id = e.org_id and m.party_entry_id = e.id and m.reverses_move_id is null) as account,
              coalesce((select sum(z.amount) from public.party_entries z where z.org_id = v_org and z.party_id = p_party and z.book_id = b.id and z.on_date < p_from), 0)
                + sum(e.amount) over (order by e.on_date, e.seq rows between unbounded preceding and current row) as balance
            from public.party_entries e
            where e.org_id = v_org and e.party_id = p_party and e.book_id = b.id and e.on_date between p_from and v_to
          ) as l
        ), '[]'::jsonb) as lines
    ) as s
    where b.org_id = v_org and b.archived_at is null and public.in_scope_book(b.id)
      and (b.id = p_book or (p_book is null and exists (select 1 from public.party_entries e where e.org_id = v_org and e.party_id = p_party and e.book_id = b.id)))
  ), '[]'::jsonb));
end
$$;

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

drop function if exists public.supplier_return_options(uuid);
drop function if exists public.post_supplier_return(uuid, int, text, uuid);
drop function if exists public.void_supplier_return(uuid, text, uuid);
drop function if exists public.preview_supplier_return(uuid);
drop function if exists public.post_receipt_revalue(uuid, numeric, text, text, uuid);
drop function if exists public.void_receipt_revalue(uuid, text, uuid);
drop function if exists public.preview_receipt_revalue(uuid, numeric);
drop function if exists private.raise_revalue_problem(jsonb);
drop function if exists private.revalue_plan(uuid, numeric);
drop function if exists private.receipt_purchase_entry(uuid);
drop function if exists private.check_lot_untouched_after(uuid, bigint);
drop function if exists private.return_shortage_detail(uuid, numeric);
drop function if exists private.lock_return_rows(uuid);

-- الجداول (ويّاها مشغّلاتها وسياساتها وفهارسها)، الأبعد أوّلاً حتى المفاتيح الأجنبية تنشال قبل هدفها.
drop table if exists public.receipt_revaluations;
drop table if exists public.supplier_return_line_amounts;
drop table if exists public.supplier_return_lines;
drop table if exists public.supplier_returns;

drop function if exists private.supplier_returns_copy();
drop function if exists private.supplier_return_header_guard();
drop function if exists private.supplier_return_lines_guard();
drop function if exists private.supplier_return_amounts_guard();
