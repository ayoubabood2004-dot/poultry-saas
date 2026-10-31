-- 0011_void_choices — خيارات الإلغاء (قرارات المالك 2026-10-31، DECISIONS «الإنتاج مطابق لـmain»): بطاقة المادّة بلا تصحيح السعر لغير
--   أدوار الكلفة، والإلغاء بعد جرد معتمد، والنسخة للتصحيح من مستند ملغى.
-- المشكلة: بطاقة المادّة (item_moves_qty) ترجّع صفوف تصحيح السعر (كمية صفر، «تصحيح سعر PU-…») لكل دور، فالأمين والمشاهد يعرفون إن
--   السعر تصحّح؛ وإلغاء مستند أقدم من جرد معتمد لنفس المادّة والمخزن يمرّ فيغيّر رصيداً أقرّه الجرد؛ والمستند الملغى ما إله طريق
--   للتصحيح إلا ورقة جديدة تنكتب من الصفر.
-- هنا: item_moves_qty يخفي صفوف receipt_revalue (وعكسها) لغير can_see_cost()، والترتيب المعروض (seq) والمؤشّر والعدد على الظاهر بس؛
--   وcheck_move_not_counted ينادى من apply_move لكل حركة تعكس (بنفس مكان check_draw_not_revalued من 0010): حركة بكمية غير صفر لمستند
--   غير الجرد أقرّها جرد مرحَّل (approved) لمادّتها بمخزنها، بيومها أو بعده ← count_superseded يسمّي الجرد CT والمادّة والمخزن (الاستلام
--   والمرتجع والتحويل بطرفيه والصرف والإتلاف والافتتاح؛ والجرد بقاعدته القديمة)؛ وcopy_doc_to_draft ينسخ مستنداً ملغى من الأنواع الستّة
--   إلى ورقة جديدة بمعرّف الجهاز (الرأس والسطور، والمبالغ لأدوار الكلفة بس)، بلا المدفوع عند الاستلام ولا تحميل الصندوق ولا الموافقات،
--   ويّا copy_line_unit (وحدة السطر بنفس الكمية).
-- انحرافات مكتوبة: لا جدول جديد، وعمود واحد: receipts.copied_from (المراجعة FE-2: الاستلام المنسوخ يعرف أصله، فمن يكتب مبالغه بعدين
--   يعرف إن مدفوع الأصل وتحميلات صندوقه بقيت على الأصل)؛ وباقي الأنواع بلا ربط (ماكو مال طلع من صندوق يندفع مرّة ثانية). وإعادة
--   النسخ بنفس معرّف الجهاز ومرجع جديد ترجع نفس الجواب من سجلّ المرجع الأوّل (rpc_refs) لنفس المستخدم والنوع والأصل، وغيره
--   id_reused؛ والأصل مستند حُفظ نهائياً ثم أُلغي بس (المراجعة R-DB-1: الورقة المحذوفة قبل حفظها بلا حركات، فوحدة أساس مادّتها
--   ما انجمّدت وسطرها «100 لتر» كان ينسخ «100 كيلو» بصمت؛ not_posted)؛ وskipped بيه amounts لغير أدوار الكلفة (الاستلام والمرتجع)،
--   وapproval، وunit_changed لوحدة تعبئة تغيّرت (السطر بوحدة الأساس وبنفس الكمية)، ورمزا المال (paid_now وbox_charge) داخل money
--   (المراجعة R-DB-3: private.mask يشيلهما لغير أدوار الكلفة بأوّل جواب وبالإعادة، ولو انزل دوره بينهما)؛ و«أقدم من الجرد» = الحركة
--   بيوم الجرد أو قبله ودخلت لقطته (seq ≤ snapshot_seq لسطر مادّتها، مثل void_count)، فحركة انكتبت بعد حفظ الجرد تنلغى (بالتاريخ
--   وحده صرف بنفس اليوم من دفعة زيادة الجرد كان يتقافل ويّا الجرد: counts.test)؛ والرفض يسمّي رقم الجرد ويومه ومخزنه لمن بنطاقه
--   مخزن الجرد بس (المراجعة R-DB-2: void_transfer يعكس طرف المستلِم بلا فحص نطاقه).
-- تراجع: rollback_0011.sql — يرجّع جسمي item_moves_qty كما بـ0007 وapply_move كما بـ0010 حرفاً بحرف، ويشيل copy_doc_to_draft
--   وcheck_move_not_counted وcopy_line_unit وعمود receipts.copied_from (ومفتاحه وفهرسه). ماكو بيانات تنحذف: أي استلام منسوخ (بأصله)
--   يوقف التراجع بصوت؛ وباقي الأوراق المنسوخة أوراق عادية بجداولها وتبقى.
-- تنعاد بأمان: create or replace، وadd column if not exists، والمفتاح بكتلة تفحص الكتالوج، والمنح نفسها.

set lock_timeout = '5s';

-- ─── بطاقة المادّة (قرار المالك 3): تصحيح السعر لأدوار الكلفة بس ─────────────────────────────────────────────────────
-- حركات مادّة بمخزن بترتيبها، بكمية موقّعة ورصيد جارٍ من أوّل حركة، والعكسية والمعكوسة بعلامتها. بلا قيم. صفوف تصحيح السعر (كمية
-- صفر) وعكسها لأدوار الكلفة بس، فالأمين والمشاهد ما يعرفون إن السعر تصحّح: seq المعروض والمؤشّر رقم الصفّ بين الظاهر (بلا فجوة تكشف
-- صفاً مخفياً)، وهو seq نفسه لأدوار الكلفة (يبدأ 1 بلا فجوة)، والعدد للظاهر، والرصيد الجاري هو هو (المخفي كميته صفر).
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
      exists (select 1 from public.stock_moves r where r.org_id = m.org_id and r.reverses_move_id = m.id) as reversed
    from public.stock_moves m
    where m.org_id = v_org and m.item_id = p_item and m.warehouse_id = p_warehouse and (v_cost or m.doc_kind <> 'receipt_revalue')
  ), paged as (
    select * from mv where mv.n > coalesce(p_after_seq, 0) order by mv.n limit v_limit + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('move_id', p.id, 'seq', p.n::text, 'moved_on', p.moved_on, 'doc_kind', p.doc_kind,
      'doc_id', p.doc_id, 'doc', private.stock_doc_label(p.doc_kind, p.doc_id), 'qty', p.qty::text, 'running', p.running::text,
      'lot_id', p.lot_id, 'reverses_move_id', p.reverses_move_id, 'reversed', p.reversed) order by p.n), '[]'::jsonb),
    case when p_after_seq is null then (select count(*) from mv) end
  into v_rows, v_total
  from paged p;
  return jsonb_build_object(
    'rows', (select coalesce(jsonb_agg(r order by n), '[]'::jsonb) from jsonb_array_elements(v_rows) with ordinality as x(r, n) where n <= v_limit),
    'next', case when jsonb_array_length(v_rows) > v_limit then v_rows -> (v_limit - 1) ->> 'seq' end,
    'total', v_total);
end
$$;

-- ─── الإلغاء بعد جرد معتمد (قرار المالك 2): مكان واحد بمسار العكس بـapply_move ─────────────────────────────────────────
-- حركة يعكسها إلغاء (الاستلام والمرتجع والتحويل بطرفيه والصرف والإتلاف والافتتاح) أقرّها جرد مرحَّل (approved) لمادّتها بمخزنها:
-- الجرد بيومها أو بعده (count_balance_at: حركات يومه وما قبله) ولقطة سطره بعدها (seq ≤ snapshot_seq، ولقطة الجرد المرحَّل = آخر حركة
-- لحظة حفظه، post_count)، فعكسها يغيّر رصيداً أقرّه؛ يرفض count_superseded ويسمّي الأحدث (السلسلة تنفكّ من آخرها، مثل void_count).
-- حركة انكتبت بعد حفظ الجرد (بنفس يومه أو بتاريخ قبله) ما أقرّها، فتنلغى: وإلا صرف بنفس اليوم انسحب من دفعة زيادة الجرد يتقافل ويّا
-- الجرد (الجرد lot_consumed والصرف count_superseded). بلا الكمية صفر (تصحيح السعر وعكسه)، وبلا حركات الجرد نفسه (void_count
-- بقاعدته). الجرد والإلغاء يقفلان رصيد (المادّة، المخزن) قبل هذا الفحص، فجرد يُحفظ بنفس اللحظة ينتظر أو يشوفه الفحص.
create or replace function private.check_move_not_counted(p_move uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  m public.stock_moves;
  k record;
begin
  select * into m from public.stock_moves where org_id = public.auth_org() and id = p_move;
  if m.id is null or m.qty = 0 or m.doc_kind = 'count' then
    return;
  end if;
  select c.doc_no, c.counted_on, i.name as item_name, w.name as warehouse_name, coalesce(public.in_scope_wh(c.warehouse_id), false) as visible into k
  from public.stock_counts c
  join public.stock_count_lines x on x.org_id = c.org_id and x.doc_id = c.id and x.item_id = m.item_id
  join public.items i on i.org_id = m.org_id and i.id = m.item_id
  join public.warehouses w on w.org_id = m.org_id and w.id = m.warehouse_id
  where c.org_id = m.org_id and c.warehouse_id = m.warehouse_id and c.status = 'approved' and c.counted_on >= m.moved_on
    and x.snapshot_seq >= m.seq
  order by c.counted_on desc, x.snapshot_seq desc
  limit 1;
  if not found then
    return;
  end if;
  -- رقم الجرد ويومه ومخزنه لمن بنطاقه مخزن الجرد بس (المراجعة R-DB-2): void_transfer يعكس طرف المستلِم بلا فحص نطاقه، والمحصور
  -- بالمرسِل ما يقرأ جرد مخزن برّا نطاقه ولا يلغيه (§2.8، E49، مثل items_stock_guard)؛ يعرف إن جرداً معتمداً يمنع، وبس.
  if not k.visible then
    raise exception 'count_superseded' using hint = format('جُردت «%s» في مخزن خارج نطاقك بجرد معتمد في يوم هذا المستند أو بعده؛ يلغي الجرد أوّلاً من يملك نطاق ذلك المخزن.',
      k.item_name);
  end if;
  raise exception 'count_superseded' using hint = format('جُردت «%s» في «%s» بالجرد %s بتاريخ %s، وهو في يوم هذا المستند أو بعده؛ ألغِ الجرد أوّلاً.',
    k.item_name, k.warehouse_name, k.doc_no, to_char(k.counted_on, 'DD/MM/YYYY'));
end
$$;

-- الحركة (يحلّ محلّ نسخة 0010): تنكتب، والدفعة والرصيد يتحدّثون بنفس كميتها وقيمتها الموقّعتين (الرصيد مقفول من lock_balances).
create or replace function private.apply_move(p_lot uuid, p_doc_kind text, p_doc uuid, p_line uuid, p_qty numeric, p_value numeric, p_on date,
  p_reverses uuid, p_expiry_checked boolean default null) returns public.stock_moves
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  l public.stock_lots;
  m public.stock_moves;
begin
  -- سحب قبل تصحيح سعر حيّ لعائلته ما يُعكس قبل إلغاء التصحيح (مراجعة WP8، 0010)، وحركة قبل جرد معتمد لمادّتها بمخزنها ما تُعكس قبل
  -- إلغاء الجرد (قرار المالك 2026-10-31، 0011).
  if p_reverses is not null then
    perform private.check_draw_not_revalued(p_reverses);
    perform private.check_move_not_counted(p_reverses);
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

-- ─── النسخة للتصحيح (قرار المالك 1): «ألغِ وافتح نسخة للتصحيح» ─────────────────────────────────────────────────────
-- أصل الاستلام المنسوخ (المراجعة FE-2): ورقة استلام منسوخة من استلام ملغى تحمل أصلها، يكتبه copy_doc_to_draft بس (ماكو منحة إدخال
-- ولا تعديل للواجهة، وحارس الرأس يجمّده)، فمن يفتح الورقة بعدين (المحاسب اللي يكتب المبالغ، من القائمة أو برابطها) يعرف إنها نسخة
-- ومن أيّ أصل، وأدوار الكلفة يقرون مدفوع الأصل وتحميلات صندوقه (بسياسة الكلفة نفسها) فما يدفعونها مرّة ثانية.
alter table public.receipts add column if not exists copied_from uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.receipts'::regclass and conname = 'receipts_copied_from_fkey') then
    alter table public.receipts add constraint receipts_copied_from_fkey foreign key (org_id, copied_from) references public.receipts (org_id, id);
  end if;
end
$$;
create index if not exists receipts_copied_from on public.receipts (org_id, copied_from);

-- وحدة سطر النسخة: وحدة التعبئة نفسها إذا باقية بنفس المعامل (وغير مؤرشفة، وللاستلام وحدة شراء عامّة أو لنفس المورّد، مثل حارس
-- سطر الاستلام)، وإلا السطر بوحدة الأساس وبنفس الكمية الأساسية (changed): معامل تغيّر كان يخلّي «5 كراتين» كمية ثانية بصمت. رمز
-- الوحدة العامّة (units) ثابت، ووحدة أساس المادّة ثابتة بعد أوّل حركة (items_stock_guard)، فيبقيان.
create or replace function private.copy_line_unit(p_item uuid, p_unit uuid, p_code text, p_qty_in_unit numeric, p_factor numeric, p_qty_base numeric,
  p_purchase_party uuid, out item_unit_id uuid, out unit_code text, out qty_in_unit numeric, out changed boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  u public.item_units;
begin
  item_unit_id := p_unit;
  unit_code := p_code;
  qty_in_unit := p_qty_in_unit;
  changed := false;
  if p_unit is null then
    return;
  end if;
  select * into u from public.item_units x where x.org_id = public.auth_org() and x.id = p_unit;
  if u.id is null or u.item_id <> p_item or u.archived_at is not null or u.factor_to_base <> p_factor
     or (p_purchase_party is not null and (not u.for_purchase or (u.party_id is not null and u.party_id <> p_purchase_party))) then
    item_unit_id := null;
    unit_code := null;
    qty_in_unit := p_qty_base;
    changed := true;
  end if;
end
$$;

-- النسخة (فعل إنشاء ورقة النوع ونطاق مخزنها، مثل الكتابة المباشرة §2.5): مستند حُفظ نهائياً ثم أُلغي من الأنواع الستّة ← ورقة جديدة
-- بمعرّف الجهاز (p_new_id) بنفس الرأس والسطور، والأصل يبقى ظاهراً «ملغى» (لا حذف)، والاستلام المنسوخ يحمل أصله (copied_from). المبالغ
-- (مبلغ السطر وخصم الرأس وتحميل على جهة، والمقبول بالمرتجع، وقيمة الافتتاح) لأدوار الكلفة بس، وغيرها كميات (amounts). ما يُنسخ
-- أبداً: المدفوع عند الاستلام وصندوقه (paid_now) وتحميل دُفع من صندوق (box_charge): فلوسه طلعت من الصندوق؛ وموافقة المدير (approval:
-- مراجعة الجرد بأسبابها وكلفها، وإتلاف المنتهي أو دفعة منتهية مسمّاة، واستلام منتهٍ يوم استلامه): كانت للمستند القديم. رمزا المال
-- داخل money (يشيله private.mask لغير أدوار الكلفة، بأوّل جواب وبالإعادة). الصفوف تمرّ من حرّاسها (القفل والفعل والنطاق ولقطة
-- الوحدة ورقم السطر). نفس المرجع ← نفس الجواب؛ ونفس معرّف الجهاز بمرجع جديد ← جواب النسخة الأولى (لنفس المستخدم والنوع والأصل)
-- وإلا id_reused.
create or replace function public.copy_doc_to_draft(p_doc_kind text, p_id uuid, p_new_id uuid, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'copy_doc_to_draft';
  v_cached jsonb;
  v_org uuid := public.auth_org();
  v_cost boolean := public.can_see_cost();
  v_status text;
  v_wh uuid;
  v_posted timestamptz;
  v_taken boolean;
  v_prior jsonb;
  v_version int;
  v_lines int := 0;
  v_amounts boolean := false;
  v_paid boolean := false;
  v_box boolean := false;
  v_approval boolean := false;
  v_unit_changed boolean := false;
  v_line uuid;
  v_charge uuid;
  v_map jsonb := '{}'::jsonb;
  u record;
  o public.opening_docs;
  ol public.opening_lines;
  tr public.transfers;
  tl public.transfer_lines;
  su public.stock_uses;
  ul public.stock_use_lines;
  ct public.stock_counts;
  cl public.stock_count_lines;
  rc public.receipts;
  rl public.receipt_lines;
  ra public.receipt_amounts;
  ch public.receipt_charges;
  sr public.supplier_returns;
  sl public.supplier_return_lines;
begin
  set local lock_timeout = '5s';
  if p_doc_kind is null or p_doc_kind not in ('opening', 'transfer', 'stock_use', 'count', 'receipt', 'supplier_return') then
    raise exception 'doc_kind_unknown' using hint = 'نوع المستند غير معروف.';
  end if;
  perform private.require(case p_doc_kind when 'opening' then 'opening.post' when 'transfer' then 'transfer.post'
    when 'stock_use' then 'stock_use.post' when 'count' then 'count.enter' else 'receipt.draft' end);
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('kind', p_doc_kind, 'id', p_id, 'new_id', p_new_id));
  if v_cached is not null then
    return v_cached;
  end if;
  if p_new_id is null then
    raise exception 'id_required' using hint = 'تعذّر الإرسال دون معرّف الورقة الجديدة. حدّث الشاشة وأعد المحاولة.';
  end if;
  -- الأصل بمنشأة الداخل، ومخزنه (المرسِل للتحويل) بنطاقه مثل إنشاء ورقته، وملغى بعد حفظه النهائي.
  if p_doc_kind = 'opening' then
    select x.status, x.warehouse_id, x.posted_at into v_status, v_wh, v_posted from public.opening_docs x where x.org_id = v_org and x.id = p_id;
  elsif p_doc_kind = 'transfer' then
    select x.status, x.from_warehouse_id, x.posted_at into v_status, v_wh, v_posted from public.transfers x where x.org_id = v_org and x.id = p_id;
  elsif p_doc_kind = 'stock_use' then
    select x.status, x.warehouse_id, x.posted_at into v_status, v_wh, v_posted from public.stock_uses x where x.org_id = v_org and x.id = p_id;
  elsif p_doc_kind = 'count' then
    select x.status, x.warehouse_id, x.posted_at into v_status, v_wh, v_posted from public.stock_counts x where x.org_id = v_org and x.id = p_id;
  elsif p_doc_kind = 'receipt' then
    select x.status, x.warehouse_id, x.posted_at into v_status, v_wh, v_posted from public.receipts x where x.org_id = v_org and x.id = p_id;
  else
    select x.status, x.warehouse_id, x.posted_at into v_status, v_wh, v_posted from public.supplier_returns x where x.org_id = v_org and x.id = p_id;
  end if;
  if v_status is null then
    raise exception 'doc_not_found' using hint = 'هذا المستند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  perform private.stock_wh(v_wh, true);
  if v_status <> 'void' then
    raise exception 'not_void' using hint = 'هذا المستند غير ملغى؛ تُفتح نسخة للتصحيح من مستند ملغى فقط.';
  end if;
  -- ورقة حُذفت قبل حفظها النهائي ما تنسخ (المراجعة R-DB-1): بلا حركات، فوحدة أساس مادّتها ما انجمّدت، وسطرها بكمية بوحدة ممكن تغيّرت
  -- بعده (100 لتر تصير 100 كيلو بصمت، ولقطة السطر E46 تنكسر). المحفوظ ثم الملغى حركاته تجمّد وحدة أساس كل مادّة بسطوره
  -- (items_stock_guard)، ورمز الوحدة العامّة ثابت، ووحدة التعبئة تنفحص بمعاملها (copy_line_unit).
  if v_posted is null then
    raise exception 'not_posted' using hint = 'هذه ورقة حُذفت قبل حفظها نهائياً، فلا تُفتح منها نسخة للتصحيح؛ النسخة من مستند حُفظ نهائياً ثم أُلغي.';
  end if;
  -- نسختان بنفس معرّف الجهاز بنفس اللحظة (بمرجعين) تترتّبان هنا: الثانية تنتظر الأولى ثم تشوف ورقتها وجوابها (بلاه 23505 خام).
  -- والمعرّف بجدول النوع بكل المنشآت (المفتاح عامّ).
  perform pg_advisory_xact_lock(hashtextextended('copy_doc_to_draft:' || p_new_id::text, 0));
  v_taken := case p_doc_kind
    when 'opening' then exists (select 1 from public.opening_docs x where x.id = p_new_id)
    when 'transfer' then exists (select 1 from public.transfers x where x.id = p_new_id)
    when 'stock_use' then exists (select 1 from public.stock_uses x where x.id = p_new_id)
    when 'count' then exists (select 1 from public.stock_counts x where x.id = p_new_id)
    when 'receipt' then exists (select 1 from public.receipts x where x.id = p_new_id)
    else exists (select 1 from public.supplier_returns x where x.id = p_new_id)
  end;
  -- المعرّف موجود: إعادة الجهاز بمرجع جديد بعد جواب ضاع ترجع جواب النسخة نفسها (نفس المستخدم والنوع والأصل)، وغيرها مستند ثاني.
  if v_taken then
    select x.result into v_prior from public.rpc_refs x
    where x.org_id = v_org and x.fn = v_fn and x.created_by = auth.uid() and x.result ->> 'id' = p_new_id::text
      and x.result ->> 'doc_kind' = p_doc_kind and x.result ->> 'source_id' = p_id::text
    order by x.created_at
    limit 1;
    if v_prior is null then
      raise exception 'id_reused' using hint = 'معرّف الورقة الجديدة مستعمل لمستند آخر. حدّث الشاشة وأعد المحاولة.';
    end if;
    return private.ref_store(v_fn, p_client_ref, v_prior);
  end if;

  if p_doc_kind = 'opening' then
    select * into o from public.opening_docs where org_id = v_org and id = p_id;
    insert into public.opening_docs (id, org_id, warehouse_id, on_date, note) values (p_new_id, v_org, o.warehouse_id, o.on_date, o.note);
    for ol in select * from public.opening_lines x where x.org_id = v_org and x.doc_id = o.id order by x.line_no loop
      insert into public.opening_lines (org_id, doc_id, item_id, qty_base, value, zero_reason, expiry_on, born_at)
      values (v_org, p_new_id, ol.item_id, ol.qty_base, case when v_cost then ol.value end, case when v_cost then ol.zero_reason end, ol.expiry_on, ol.born_at);
      v_lines := v_lines + 1;
    end loop;
    select x.version into v_version from public.opening_docs x where x.org_id = v_org and x.id = p_new_id;
  elsif p_doc_kind = 'transfer' then
    select * into tr from public.transfers where org_id = v_org and id = p_id;
    insert into public.transfers (id, org_id, from_warehouse_id, to_warehouse_id, moved_on, note)
    values (p_new_id, v_org, tr.from_warehouse_id, tr.to_warehouse_id, tr.moved_on, tr.note);
    for tl in select * from public.transfer_lines x where x.org_id = v_org and x.doc_id = tr.id order by x.line_no loop
      select * into u from private.copy_line_unit(tl.item_id, tl.item_unit_id, tl.unit_code, tl.qty_in_unit, tl.factor, tl.qty_base, null);
      insert into public.transfer_lines (org_id, doc_id, item_id, item_unit_id, unit_code, qty_in_unit)
      values (v_org, p_new_id, tl.item_id, u.item_unit_id, u.unit_code, u.qty_in_unit);
      v_unit_changed := v_unit_changed or u.changed;
      v_lines := v_lines + 1;
    end loop;
    select x.version into v_version from public.transfers x where x.org_id = v_org and x.id = p_new_id;
  elsif p_doc_kind = 'stock_use' then
    select * into su from public.stock_uses where org_id = v_org and id = p_id;
    insert into public.stock_uses (id, org_id, warehouse_id, category_id, used_on, note)
    values (p_new_id, v_org, su.warehouse_id, su.category_id, su.used_on, su.note);
    for ul in select * from public.stock_use_lines x where x.org_id = v_org and x.doc_id = su.id order by x.line_no loop
      select * into u from private.copy_line_unit(ul.item_id, ul.item_unit_id, ul.unit_code, ul.qty_in_unit, ul.factor, ul.qty_base, null);
      insert into public.stock_use_lines (org_id, doc_id, item_id, item_unit_id, unit_code, qty_in_unit, lot_id)
      values (v_org, p_new_id, ul.item_id, u.item_unit_id, u.unit_code, u.qty_in_unit, ul.lot_id);
      v_unit_changed := v_unit_changed or u.changed;
      v_lines := v_lines + 1;
    end loop;
    -- إتلاف المنتهي أو دفعة منتهية مسمّاة: حفظه النهائي كان بموافقة المدير (expired.destroy أو expired.release، Q5).
    v_approval := coalesce((select c.system_code = 'expired_destroy' from public.expense_categories c where c.org_id = v_org and c.id = su.category_id), false)
      or exists (select 1 from public.stock_use_lines x where x.org_id = v_org and x.doc_id = su.id and x.lot_id is not null);
    select x.version into v_version from public.stock_uses x where x.org_id = v_org and x.id = p_new_id;
  elsif p_doc_kind = 'count' then
    select * into ct from public.stock_counts where org_id = v_org and id = p_id;
    insert into public.stock_counts (id, org_id, warehouse_id, counted_on, note) values (p_new_id, v_org, ct.warehouse_id, ct.counted_on, ct.note);
    -- العدّ بس: لقطة الدفتر والفرقان تنحسب بالتسليم، وسبب المدير وكلفة الزيادة من مراجعته (approval).
    for cl in select * from public.stock_count_lines x where x.org_id = v_org and x.doc_id = ct.id order by x.line_no loop
      insert into public.stock_count_lines (org_id, doc_id, item_id, counted_qty, counted_expired_qty, gain_expiry_on, gain_expired_expiry_on, gain_born_at)
      values (v_org, p_new_id, cl.item_id, cl.counted_qty, cl.counted_expired_qty, cl.gain_expiry_on, cl.gain_expired_expiry_on, cl.gain_born_at);
      v_lines := v_lines + 1;
    end loop;
    -- الجرد المنسوخ محفوظ نهائياً دائماً (not_posted فوق)، وحفظه كان بمراجعة المدير (count.approve)؛ فالنسخة تُراجَع من جديد.
    v_approval := true;
    select x.version into v_version from public.stock_counts x where x.org_id = v_org and x.id = p_new_id;
  elsif p_doc_kind = 'receipt' then
    select * into rc from public.receipts where org_id = v_org and id = p_id;
    insert into public.receipts (id, org_id, party_id, warehouse_id, received_on, note, copied_from)
    values (p_new_id, v_org, rc.party_id, rc.warehouse_id, rc.received_on, rc.note, rc.id);
    for rl in select * from public.receipt_lines x where x.org_id = v_org and x.doc_id = rc.id order by x.line_no loop
      select * into u from private.copy_line_unit(rl.item_id, rl.item_unit_id, rl.unit_code, rl.qty_in_unit, rl.factor, rl.qty_base, rc.party_id);
      v_line := gen_random_uuid();
      insert into public.receipt_lines (id, org_id, doc_id, item_id, item_unit_id, unit_code, qty_in_unit, expiry_on, born_at, supplier_lot_no)
      values (v_line, v_org, p_new_id, rl.item_id, u.item_unit_id, u.unit_code, u.qty_in_unit, rl.expiry_on, rl.born_at, rl.supplier_lot_no);
      v_map := v_map || jsonb_build_object(rl.id::text, v_line);
      v_unit_changed := v_unit_changed or u.changed;
      v_lines := v_lines + 1;
      if v_cost then
        insert into public.receipt_line_amounts (org_id, line_id, line_total, zero_reason)
        select v_org, v_line, a.line_total, a.zero_reason from public.receipt_line_amounts a where a.org_id = v_org and a.line_id = rl.id;
      end if;
    end loop;
    if v_cost then
      select * into ra from public.receipt_amounts a where a.org_id = v_org and a.doc_id = rc.id;
      if ra.discount > 0 then
        insert into public.receipt_amounts (org_id, doc_id, discount) values (v_org, p_new_id, ra.discount);
      end if;
      v_paid := coalesce(ra.paid_now > 0, false);
      for ch in select * from public.receipt_charges c where c.org_id = v_org and c.doc_id = rc.id order by c.charge_no loop
        if ch.cash_account_id is not null then
          v_box := true;
          continue;
        end if;
        v_charge := gen_random_uuid();
        insert into public.receipt_charges (id, org_id, doc_id, label, amount, allocate_by, payee_party_id)
        values (v_charge, v_org, p_new_id, ch.label, ch.amount, ch.allocate_by, ch.payee_party_id);
        if not ch.all_lines then
          insert into public.receipt_charge_lines (org_id, doc_id, warehouse_id, charge_id, line_id)
          select v_org, p_new_id, rc.warehouse_id, v_charge, (v_map ->> s.line_id::text)::uuid
          from public.receipt_charge_lines s where s.org_id = v_org and s.charge_id = ch.id order by s.line_id;
          update public.receipt_charges set all_lines = false where org_id = v_org and id = v_charge;
        end if;
      end loop;
    else
      v_amounts := true;
    end if;
    -- منتهٍ يوم استلامه (Q5): حفظه النهائي كان بموافقة المدير (expired.release).
    v_approval := exists (
      select 1 from public.receipt_lines x join public.items i on i.org_id = x.org_id and i.id = x.item_id
      where x.org_id = v_org and x.doc_id = rc.id and private.lot_expired(i.tracks_expiry, x.expiry_on, rc.received_on));
    select x.version into v_version from public.receipts x where x.org_id = v_org and x.id = p_new_id;
  else
    -- المرتجع: مورّده ومخزنه ودفتره من الاستلام بمشغّله (والاستلام مرحَّل، وإلا receipt_not_posted)، والسطر يأخذ دفعته من حارسه.
    select * into sr from public.supplier_returns where org_id = v_org and id = p_id;
    insert into public.supplier_returns (id, org_id, receipt_id, returned_on, note) values (p_new_id, v_org, sr.receipt_id, sr.returned_on, sr.note);
    for sl in select * from public.supplier_return_lines x where x.org_id = v_org and x.doc_id = sr.id order by x.line_no loop
      v_line := gen_random_uuid();
      insert into public.supplier_return_lines (id, org_id, doc_id, receipt_line_id, qty_base) values (v_line, v_org, p_new_id, sl.receipt_line_id, sl.qty_base);
      v_lines := v_lines + 1;
      if v_cost then
        insert into public.supplier_return_line_amounts (org_id, line_id, credit_amount)
        select v_org, v_line, a.credit_amount from public.supplier_return_line_amounts a where a.org_id = v_org and a.line_id = sl.id;
      end if;
    end loop;
    v_amounts := not v_cost;
    select x.version into v_version from public.supplier_returns x where x.org_id = v_org and x.id = p_new_id;
  end if;
  -- رمزا المال (paid_now وbox_charge) داخل money (المراجعة R-DB-3): مستخدم انزل دوره بعد النسخة ما يستلمهما بالإعادة (private.mask
  -- بـref_claim وref_store)، مثل كل مبلغ؛ والباقي (amounts وapproval وunit_changed) بـskipped لكل دور.
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', p_new_id, 'doc_kind', p_doc_kind, 'source_id', p_id, 'status', 'draft',
    'version', v_version, 'lines', v_lines,
    'skipped', to_jsonb(array_remove(array[case when v_amounts then 'amounts' end, case when v_approval then 'approval' end,
      case when v_unit_changed then 'unit_changed' end], null)),
    'money', jsonb_build_object('skipped', to_jsonb(array_remove(array[case when v_paid then 'paid_now' end, case when v_box then 'box_charge' end], null)))));
end
$$;

-- ─── الصلاحيات ─────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.copy_doc_to_draft(text, uuid, uuid, uuid) from public, anon;
grant execute on function public.copy_doc_to_draft(text, uuid, uuid, uuid) to authenticated;
