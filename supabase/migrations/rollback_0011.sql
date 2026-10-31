-- rollback_0011 — تراجع 0011_void_choices (قرارات المالك 2026-10-31؛ مشغّل التراجع بالحزمة FOUNDATION ٨٢٠، ٨٧٦).
-- يرجّع جسم item_moves_qty كما بـ0007 وapply_move كما بـ0010 حرفاً بحرف (md5 نفسه بالكتالوج)، ويشيل اللي انضاف بـ0011:
-- copy_doc_to_draft وcheck_move_not_counted وcopy_line_unit، وعمود receipts.copied_from ومفتاحه وفهرسه. ماكو جدول انضاف. ربط
-- الاستلام المنسوخ بأصله بيانات ما تنحذف: أي استلام بأصله (copied_from) يوقف التراجع بصوت ويرجع كلّه (المعاملة وحدة)، والمالك
-- يقرّر مصيره. باقي الأوراق اللي نسختها copy_doc_to_draft أوراق عادية بجداولها وتبقى، وأجوبتها بـrpc_refs تبقى بسجلّ المراجع.
-- سجلّ التدقيق يبقى كما هو.

set lock_timeout = '5s';

-- الجدول يتقفل قبل العدّ ولحد نهاية المعاملة (درس WP4).
lock table public.receipts in access exclusive mode;

do $$
declare
  v_copies bigint;
begin
  select count(*) into v_copies from public.receipts where copied_from is not null;
  if v_copies > 0 then
    raise exception 'rollback_blocked' using hint = format('توجد %s من أوراق الاستلام المنسوخة من استلام ملغى (بأصلها)، والتراجع لا يحذف ربطها بأصلها. قرّر مصيرها أوّلاً ثم أعد التراجع.', v_copies);
  end if;
end
$$;

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

create or replace function private.apply_move(p_lot uuid, p_doc_kind text, p_doc uuid, p_line uuid, p_qty numeric, p_value numeric, p_on date,
  p_reverses uuid, p_expiry_checked boolean default null) returns public.stock_moves
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  l public.stock_lots;
  m public.stock_moves;
begin
  -- سحب قبل تصحيح سعر حيّ لعائلته ما يُعكس قبل إلغاء التصحيح (مراجعة WP8، 0010).
  if p_reverses is not null then
    perform private.check_draw_not_revalued(p_reverses);
  end if;
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

drop function if exists public.copy_doc_to_draft(text, uuid, uuid, uuid);
drop function if exists private.copy_line_unit(uuid, uuid, text, numeric, numeric, numeric, uuid);
drop function if exists private.check_move_not_counted(uuid);
drop index if exists public.receipts_copied_from;
alter table public.receipts drop constraint if exists receipts_copied_from_fkey;
alter table public.receipts drop column if exists copied_from;
