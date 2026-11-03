-- rollback_0015 — تراجع 0015_mill_recipes_production (معمل العلف: الخلطات ودفعة الإنتاج؛ مشغّل التراجع بالحزمة
-- FOUNDATION ٨٢٠، ٨٧٦). يرجّع أجسام private.draft_header_guard وprivate.stock_doc_label وdiscard_draft (كما في 0007)
-- وstock_doc_label وdiscard_draft وdelete_draft_line (كما في 0010) وprivate.stock_doc_memo (كما في 0014) حرفاً بحرف (md5 نفسه بالكتالوج)، ويرجّع قيدَي stock_lots_source_kind_check
-- وstock_moves_doc_kind_check بلا 'production'، ثمّ يُسقط دوالّ المعمل وحرّاسه وجداوله السبعة.
-- **طريق رفض (الكتلة أدناه):** إسقاط الجداول يمسح الخلطات (تشكيلة كتبها المالك بيده) وكلفة كلّ دفعة إنتاج ومصدر علفها،
-- ولا تُستخرج من مكان آخر. فالملف يرفض نفسه إن كانت في القاعدة خلطة أو نسخة، أو دفعة إنتاج أو حركة مخزون نوعها
-- production أو دفعة ناتج مصدرها production — ولو مسوّدة أو ملغاة. الفرعان منفصلان حتّى يُفحص كلّ واحد وحده.
-- تنعاد بأمان: drop if exists، وcreate or replace، وكتل do تفحص الكتالوج قبل القيود.

set lock_timeout = '5s';

-- ٠) طريق الرفض: لا تُمسح خلطة ولا دفعة إنتاج.
do $$
declare
  v_recipes bigint;
  v_versions bigint;
  v_batches bigint;
  v_moves bigint;
  v_lots bigint;
begin
  select count(*) into v_recipes from public.recipes;
  select count(*) into v_versions from public.recipe_versions;
  select count(*) into v_batches from public.production_batches;
  select count(*) into v_moves from public.stock_moves where doc_kind = 'production';
  select count(*) into v_lots from public.stock_lots where source_kind = 'production';
  if v_recipes + v_versions > 0 or v_batches + v_moves + v_lots > 0 then
    raise exception 'rollback_blocked'
      using hint = format('في القاعدة %s خلطة و%s نسخة و%s دفعة إنتاج و%s حركة مخزون من الإنتاج و%s دفعة ناتج. التراجع يمسحها كلّها: صدّر الخلطات ودفعات الإنتاج أوّلاً، أو ألغِ الدفعات واحذف الخلطات بالشاشة.',
        v_recipes, v_versions, v_batches, v_moves, v_lots);
  end if;
end
$$;

-- ١) حارس رأس المسوّدة المشترك كما في 0007 حرفاً بحرف (بلا أعمدة دفعة الإنتاج):
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

-- ٢) اسم المستند للتلميح كما في 0010 حرفاً بحرف (بلا دفعة الإنتاج):
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
    else p_kind
  end
$$;

-- ٣) بيان الحركة في دفتر المادّة كما في 0014 حرفاً بحرف (بلا دفعة الإنتاج):
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

-- ٤) طيّ المسوّدة وحذف سطرها كما في 0010 حرفاً بحرف (بلا نوعَي production وrecipe_line):
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
  elsif p_doc_kind = 'supplier_return' then
    perform private.require('receipt.draft');
    select status, version, warehouse_id into v_status, v_version, v_wh from public.supplier_returns
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
  elsif p_doc_kind = 'supplier_return' then
    update public.supplier_returns set status = 'void', voided_at = now(), voided_by = auth.uid(), version = version + 1
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
  elsif p_doc_kind = 'supplier_return' then
    perform private.require('receipt.draft');
    select doc_id into v_doc from public.supplier_return_lines where org_id = public.auth_org() and id = p_line_id for update;
    -- مبلغ السطر قبل الرأس مثل حارسه (الأمين ما يشوفه، فحذفه المباشر كان يرفض 23503).
    perform 1 from public.supplier_return_line_amounts where org_id = public.auth_org() and line_id = p_line_id for update;
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
  elsif p_doc_kind = 'supplier_return' then
    delete from public.supplier_return_line_amounts where org_id = public.auth_org() and line_id = p_line_id;
    delete from public.supplier_return_lines where org_id = public.auth_org() and id = p_line_id;
    update public.supplier_returns set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  else
    delete from public.stock_count_line_costs where org_id = public.auth_org() and line_id = p_line_id;
    delete from public.stock_count_lines where org_id = public.auth_org() and id = p_line_id;
    update public.stock_counts set version = version + 1 where org_id = public.auth_org() and id = v_doc;
  end if;
  return jsonb_build_object('line_id', p_line_id, 'deleted', true, 'doc_id', v_doc, 'version', v_version + 1);
end
$$;

-- ٥) قيدا نوع المستند ومصدر الدفعة بلا 'production':
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'stock_lots_source_kind_check' and conrelid = 'public.stock_lots'::regclass
    and pg_get_constraintdef(oid) like '%production%') then
    alter table public.stock_lots drop constraint stock_lots_source_kind_check;
    alter table public.stock_lots add constraint stock_lots_source_kind_check
      check (source_kind in ('opening', 'receipt', 'transfer', 'count_gain'));
  end if;
  if exists (select 1 from pg_constraint where conname = 'stock_moves_doc_kind_check' and conrelid = 'public.stock_moves'::regclass
    and pg_get_constraintdef(oid) like '%production%') then
    alter table public.stock_moves drop constraint stock_moves_doc_kind_check;
    alter table public.stock_moves add constraint stock_moves_doc_kind_check
      check (doc_kind in ('opening', 'receipt', 'supplier_return', 'receipt_revalue', 'transfer', 'count', 'stock_use'));
  end if;
end
$$;

-- ٥-٢) عدّاد المستندات بلا 'PD':
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'doc_counters_kind_check' and conrelid = 'public.doc_counters'::regclass
    and pg_get_constraintdef(oid) like '%PD%') then
    alter table public.doc_counters drop constraint doc_counters_kind_check;
    alter table public.doc_counters add constraint doc_counters_kind_check
      check (kind in ('PU', 'RT', 'TR', 'CT', 'SU', 'RC', 'PY', 'OF'));
  end if;
end
$$;

-- ٦) دوالّ المعمل (القرّاء ثمّ الكتّاب ثمّ الثوابت):
drop function if exists public.recipes_overview();
drop function if exists public.recipe_detail(uuid, uuid);
drop function if exists public.productions_overview(jsonb, integer);
drop function if exists public.production_detail(uuid);
drop function if exists public.preview_production(uuid);
drop function if exists public.activate_recipe_version(uuid, integer);
drop function if exists public.create_production(uuid, uuid, numeric, uuid, uuid, date);
drop function if exists public.confirm_production_costs(uuid, integer);
drop function if exists public.post_production(uuid, integer, text, uuid);
drop function if exists public.void_production(uuid, text, uuid);
drop function if exists public.verify_mill();

-- ٧) المشغّلات ثمّ حرّاسها (المشغّل يعتمد على دالّته، ودالّة mill_version ترجع نوع جدول: الترتيب مشغّل ← دالّة ← جدول):
drop trigger if exists recipes_guard on public.recipes;
drop trigger if exists recipe_versions_guard on public.recipe_versions;
drop trigger if exists recipe_lines_guard on public.recipe_lines;
drop trigger if exists production_inputs_guard on public.production_inputs;
drop trigger if exists production_batches_guard on public.production_batches;
drop trigger if exists audit_recipes on public.recipes;
drop trigger if exists audit_recipe_versions on public.recipe_versions;
drop trigger if exists audit_recipe_lines on public.recipe_lines;
drop trigger if exists audit_production_batches on public.production_batches;
drop trigger if exists audit_production_inputs on public.production_inputs;
drop function if exists private.recipes_guard();
drop function if exists private.recipe_versions_guard();
drop function if exists private.recipe_lines_guard();
drop function if exists private.production_inputs_guard();
drop function if exists private.mill_version(uuid, boolean);
drop function if exists private.recipe_line_kg(numeric, text, numeric);
drop function if exists private.round_step(numeric, numeric);
drop function if exists private.input_mass_kg(numeric, text, numeric);
drop function if exists private.shrink_pct(numeric, numeric);
drop function if exists private.per_unit(numeric, numeric);
drop function if exists private.shrink_in_range(numeric);

-- ٨) الجداول (الأبناء قبل الآباء):
drop table if exists public.production_input_values;
drop table if exists public.production_values;
drop table if exists public.production_inputs;
drop table if exists public.production_batches;
drop table if exists public.recipe_lines;
drop table if exists public.recipe_versions;
drop table if exists public.recipes;
