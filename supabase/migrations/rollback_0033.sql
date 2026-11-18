-- rollback_0033 — تراجع «الفاتورة الاحترافيّة» (0033_sales_invoice؛ مشغّل التراجع بالحزمة FOUNDATION ٨٢٠، ٨٧٦): يرجّع record_sale وvoid_sale
--   وsale_detail وverify_sales وprivate.sale_result كما في 0021، وsales_overview وsales_report وprivate.entry_detail كما في 0029، وprivate.party_for_post
--   كما في 0006، حرفاً بحرف (md5 نفسه بالكتالوج)، ويُسقط record_sale_v2 وsale_catalog والمساعدات (json_uuid وjson_num وwalk_in_party وsale_paid وsale_more
--   وsale_v2_content وsale_v2_result وlock_sale_party وsale_void_block، وparty_entries_walk_in وparty_not_system وparties_system_guard بمحفّزاتها على
--   party_entries وreceipts وreceipt_charges وitem_units وparties) وجدول sales_payments (بسياسته ومحفّزه وفهارسه)، ويرجّع سياسة audit_log_sale_scope
--   وقيد sales_invoices_payment_check كما في 0021، ويُسقط الأعمدة الجديدة وقيودها وفهرسها من sales_invoices وsales_lines وparties.
-- **طريق رفض (الكتلة الأولى أدناه):** ما لا يحمله النموذج القديم يوقف التراجع بصوت بلا أن يغيّر شيئاً، بفرع لكلّ حقيقة مستقلّة: فاتورة بأكثر من سطر،
--   وفاتورة بخصم (سطر أو فاتورة)، وفاتورة بأكثر من ساق دفع، وفاتورة بدفع جزئيّ (المدفوع بين الصفر والصافي)، وسطر بوحدة غير الأساس، وفاتورة بملاحظة،
--   وفاتورة لزبون نقديّ أو حسابه (طرف نظاميّ يصير جهة عادية ظاهرة)، وصفّ تدقيق لساق فاتورة جديدة (سياسة 0021 لا تعرف sales_payments فيظهر بعدها
--   لكلّ دور كلفة خارج نطاق مخزنه؛ مراجعة 0033 V3، وساق المرآة بلا صفّ تدقيق). فما يبقى من فواتير record_sale_v2 سطر بوحدة الأساس بالدين كلّها؛
--   والنقل (الكتلة ١) يحمل ساق الفاتورة الجديدة المدفوعة من صندوق واحد إلى رأسها حين يُطفأ فرع التدقيق وحده (ضابط فرعه)، فيقبلها القيد القديم وثوابته.
-- تنعاد بأمان: الكتلة الأولى تخرج إن لم يبقَ الجدول، والنقل لما لم يُنقل وحده، وcreate or replace، وdrop if exists، وكتل do تفحص الكتالوج قبل القيود
--   والسياسات.

set lock_timeout = '5s';

-- ٠) طريق الرفض. الجداول تُقفل قبل العدّ ولحدّ نهاية المعاملة (درس WP4): فاتورة تُكتب بلحظة التراجع تنتظر أو تُعدّ.
do $$
declare
  v_multi bigint;
  v_discount bigint;
  v_legs bigint;
  v_partial bigint;
  v_units bigint;
  v_notes bigint;
  v_walk_in bigint;
  v_audit bigint;
begin
  if to_regclass('public.sales_payments') is null then
    return;
  end if;
  execute 'lock table public.sales_invoices, public.sales_lines, public.sales_payments, public.parties in access exclusive mode';
  execute 'select count(*) from (select l.sale_id from public.sales_lines l group by l.sale_id having count(*) > 1) as x' into v_multi;
  execute 'select count(*) from public.sales_invoices s where s.discount_total <> 0 or s.invoice_discount <> 0
    or exists (select 1 from public.sales_lines l where l.org_id = s.org_id and l.sale_id = s.id and (l.line_discount <> 0 or l.invoice_discount_share <> 0))' into v_discount;
  execute 'select count(*) from (select g.sale_id from public.sales_payments g group by g.sale_id having count(*) > 1) as x' into v_legs;
  execute 'select count(*) from public.sales_invoices s where s.paid <> 0 and s.paid <> s.total' into v_partial;
  execute 'select count(*) from public.sales_lines l where l.item_unit_id is not null or l.unit_factor <> 1' into v_units;
  execute 'select count(*) from public.sales_invoices s where s.note is not null' into v_notes;
  execute 'select (select count(*) from public.sales_invoices s where s.walk_in) + (select count(*) from public.parties p where p.system_kind is not null)' into v_walk_in;
  select count(*) into v_audit from public.audit_log where table_name = 'sales_payments';
  if v_multi > 0 then
    raise exception 'rollback_blocked' using hint = format('توجد %s فاتورة بيع بأكثر من سطر، والنموذج القديم سطر واحد لكلّ فاتورة. لا تراجع لـ0033 بعد استعمالها.', v_multi);
  end if;
  if v_discount > 0 then
    raise exception 'rollback_blocked' using hint = format('توجد %s فاتورة بيع بخصم، والنموذج القديم بلا خصم. لا تراجع لـ0033 بعد استعمالها.', v_discount);
  end if;
  if v_legs > 0 then
    raise exception 'rollback_blocked' using hint = format('توجد %s فاتورة بيع دُفعت من أكثر من صندوق، والنموذج القديم صندوق واحد. لا تراجع لـ0033 بعد استعمالها.', v_legs);
  end if;
  if v_partial > 0 then
    raise exception 'rollback_blocked' using hint = format('توجد %s فاتورة بيع دُفع جزء منها وبقي الباقي ديناً، والنموذج القديم نقد كلّه أو دين كلّه. لا تراجع لـ0033 بعد استعمالها.', v_partial);
  end if;
  if v_units > 0 then
    raise exception 'rollback_blocked' using hint = format('يوجد %s سطر بيع بوحدة بيع غير وحدة الأساس، والنموذج القديم بوحدة الأساس وحدها. لا تراجع لـ0033 بعد استعمالها.', v_units);
  end if;
  if v_notes > 0 then
    raise exception 'rollback_blocked' using hint = format('توجد %s فاتورة بيع بملاحظة، والتراجع يمسحها. لا تراجع لـ0033 بعد استعمالها.', v_notes);
  end if;
  if v_walk_in > 0 then
    raise exception 'rollback_blocked' using hint = 'توجد فاتورة لزبون نقديّ أو حسابه، والنموذج القديم لا يعرف الزبون النقديّ. لا تراجع لـ0033 بعد استعمالها.';
  end if;
  -- سجلّ التدقيق لا يُمحى، وسياسة نطاقه في 0021 لا تعرف sales_payments: صفّ ساق مدقَّق (فاتورة record_sale_v2 دُفع منها شيء) يظهر بعد التراجع
  -- بمخزنه ومبلغه لكلّ دور كلفة خارج نطاق مخزنه (مراجعة 0033 V3). وساق المرآة (البيع القديم والملء) بلا صفّ تدقيق. والفرع بعد الحقائق الأخرى
  -- (كـ0026): فاتورة بأكثر من ساق أو بدفع جزئيّ أو لزبون نقديّ تسمّي سببها، وهذا لفاتورة جديدة مدفوعة كلّها من صندوق واحد.
  if v_audit > 0 and v_multi + v_discount + v_legs + v_partial + v_units + v_notes + v_walk_in = 0 then
    raise exception 'rollback_blocked' using hint = format('في سجلّ التدقيق %s صفّاً من سيقان الدفع لفواتير البيع الجديدة، والتراجع يُسقط نطاقها فتظهر لمن هو خارج نطاق مخزنها. لا تراجع لـ0033 بعد استعمالها.', v_audit);
  end if;
end
$$;

-- ١) فواتير record_sale_v2 الباقية إلى الشكل القديم: المدفوعة كلّها من صندوق واحد تحمل ساقها في رأسها (بعد إسقاط قيود الرأس الجديدة).
alter table public.sales_invoices drop constraint if exists sales_invoices_total_check;
alter table public.sales_invoices drop constraint if exists sales_invoices_paid_check;
alter table public.sales_invoices drop constraint if exists sales_invoices_discount_check;
alter table public.sales_invoices drop constraint if exists sales_invoices_note_check;
alter table public.sales_invoices drop constraint if exists sales_invoices_walk_in_check;
do $$
begin
  if to_regclass('public.sales_payments') is not null then
    execute 'update public.sales_invoices s set cash_account_id = g.cash_account_id, payment_entry_id = g.payment_entry_id, cash_move_id = g.cash_move_id
      from public.sales_payments g
      where g.org_id = s.org_id and g.sale_id = s.id and g.leg_no = 1 and s.payment_entry_id is null and s.payment = ''cash''';
  end if;
end
$$;

-- ٢) الأجسام القديمة كما في 0021:
create or replace function private.sale_result(p_sale uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', s.id, 'doc_no', s.doc_no, 'status', s.status, 'sold_on', s.sold_on,
    'payment', case when s.payment = 'cash' and not k.refunded then 'cash' else 'credit' end, 'payment_refunded', k.refunded,
    'party_id', s.party_id, 'party_name', p.name, 'warehouse_id', s.warehouse_id, 'warehouse_name', w.name, 'book_id', s.book_id,
    'cash_account_id', s.cash_account_id, 'line_id', l.id, 'item_id', l.item_id, 'item_name', i.name, 'qty', l.qty::text, 'base_unit', l.base_unit,
    'free', l.line_total = 0, 'voided_at', s.voided_at, 'void_reason', s.void_reason,
    'money', jsonb_build_object('unit_price', l.unit_price::text, 'line_total', l.line_total::text,
      'paid_now', case when s.payment = 'cash' and not k.refunded then l.line_total else 0 end::text),
    'cost', jsonb_build_object('money', jsonb_build_object('cost', c.cost::text, 'profit', (l.line_total - c.cost)::text)))
  from public.sales_invoices s
  join public.sales_lines l on l.org_id = s.org_id and l.sale_id = s.id and l.line_no = 1
  join public.sales_line_costs c on c.org_id = l.org_id and c.line_id = l.id
  join public.items i on i.org_id = l.org_id and i.id = l.item_id
  join public.parties p on p.org_id = s.org_id and p.id = s.party_id
  join public.warehouses w on w.org_id = s.org_id and w.id = s.warehouse_id
  cross join lateral (select s.payment_entry_id is not null and exists (select 1 from public.party_entries r where r.org_id = s.org_id
    and r.reverses_entry_id = s.payment_entry_id) as refunded) as k
  where s.org_id = public.auth_org() and s.id = p_sale
$$;

create or replace function public.record_sale(p_client_ref uuid, p_sale_id uuid, p_line_id uuid, p_party uuid, p_item uuid, p_qty numeric,
  p_unit_price numeric, p_sold_on date, p_payment text, p_cash_account uuid, p_warehouse uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'record_sale';
  v_org uuid := public.auth_org();
  v_cached jsonb;
  v_result jsonb;
  i public.items;
  w public.warehouses;
  p public.parties;
  b public.ledger_books;
  x public.sales_invoices;
  e public.party_entries;
  pay public.party_entries;
  m public.cash_moves;
  s record;
  dr record;
  v_same boolean;
  v_count int;
  v_names text;
  v_expired numeric;
  v_total numeric;
  v_cost numeric := 0;
  v_no text;
begin
  set local lock_timeout = '5s';
  perform private.require('sale.record');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('sale', p_sale_id, 'line', p_line_id, 'party', p_party, 'item', p_item,
    'qty', p_qty, 'price', p_unit_price, 'on', p_sold_on, 'payment', p_payment, 'box', p_cash_account, 'warehouse', p_warehouse));
  if v_cached is not null then
    if exists (select 1 from public.sales_invoices y where y.org_id = v_org and y.id = p_sale_id and y.status = 'void') then
      raise exception 'id_conflict' using hint = 'سُجّل هذا البيع من قبل ثمّ أُلغي. سجّل بيعاً جديداً.';
    end if;
    -- ref_claim يقنّع المال كلّه لمن لا يرى الكلفة، ومن يبيع يرى المبلغ: المخزَّن نفسه بقناع الكلفة وحدها.
    select y.result into v_cached from public.rpc_refs y where y.org_id = v_org and y.fn = v_fn and y.client_ref = p_client_ref;
    return private.sale_view(v_cached);
  end if;
  if p_sale_id is null or p_line_id is null or p_party is null or p_item is null then
    raise exception 'id_required' using hint = 'تعذّر الإرسال دون معرّفات البيع والجهة والمادّة. حدّث الشاشة وأعد المحاولة.';
  end if;

  -- الإعادة بالمعرّف (جواب ضاع): الفاتورة المرحَّلة نفسها بسطرها ومحتواها = حُفظت، فنتيجتها؛ وغيرها تعارض.
  perform pg_advisory_xact_lock(hashtextextended('sale:' || p_sale_id::text, 0));
  select * into x from public.sales_invoices y where y.id = p_sale_id;
  if x.id is not null then
    v_same := x.org_id = v_org and x.status = 'posted' and x.created_by is not distinct from auth.uid() and x.party_id = p_party and x.sold_on = p_sold_on
      and x.payment = p_payment and x.cash_account_id is not distinct from p_cash_account and (p_warehouse is null or x.warehouse_id = p_warehouse)
      and exists (select 1 from public.sales_lines y where y.org_id = x.org_id and y.sale_id = x.id and y.id = p_line_id and y.item_id = p_item
        and y.qty = p_qty and y.unit_price = p_unit_price);
    if coalesce(v_same, false) then
      v_result := private.sale_result(x.id);
      update public.rpc_refs set result = v_result where org_id = v_org and fn = v_fn and client_ref = p_client_ref;
      return private.sale_view(v_result);
    end if;
    raise exception 'id_conflict' using hint = case
      when x.org_id = v_org and x.status = 'void' then 'سُجّل هذا البيع من قبل ثمّ أُلغي. سجّل بيعاً جديداً.'
      else 'سُجّل بهذا المعرّف بيع غير الذي أرسلته الآن. حدّث الشاشة لترى ما سُجّل، ثمّ سجّل من جديد.'
    end;
  end if;
  if exists (select 1 from public.sales_lines y where y.id = p_line_id) then
    raise exception 'id_conflict' using hint = 'معرّف سطر البيع مستعمل لفاتورة أخرى. حدّث الشاشة وأعد المحاولة.';
  end if;

  -- المادّة والكمية والسعر والدفع.
  select * into i from public.items y where y.org_id = v_org and y.id = p_item;
  if i.id is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if i.archived_at is not null then
    raise exception 'item_archived' using hint = format('المادّة «%s» مؤرشفة، فلا تُباع. أعِدها من الأرشيف أوّلاً.', i.name);
  end if;
  if i.kind in ('hatching_egg', 'chick', 'table_egg') then
    raise exception 'not_sellable' using hint = format('«%s» لا تُباع من هنا في هذه النسخة: بيع البيض والأفراخ يأتي مع بيع الطيور.', i.name);
  end if;
  if p_qty is null or not (abs(p_qty) < 'Infinity') or p_qty <= 0 or p_qty <> round(p_qty, 3) then
    raise exception 'qty_not_positive' using hint = format('اكتب كمية «%s» أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.', i.name);
  end if;
  if i.base_unit = 'pc' and p_qty <> round(p_qty, 0) then
    raise exception 'pieces_not_whole' using hint = format('«%s» تُعدّ بالقطعة؛ اكتب عدداً صحيحاً من القطع.', i.name);
  end if;
  if p_unit_price is null or not (abs(p_unit_price) < 'Infinity') or p_unit_price < 0 or p_unit_price <> round(p_unit_price, 2) then
    raise exception 'bad_price' using hint = 'سعر البيع لكلّ وحدة صفر أو أكثر، بمرتبتين عشريتين كحدّ أقصى.';
  end if;
  v_total := private._mul_div_round(p_qty, p_unit_price, 1, 0);
  if p_unit_price > 0 and v_total = 0 then
    raise exception 'total_zero' using hint = 'مجموع البيع يُقرَّب إلى صفر دينار. راجع الكمية والسعر، أو اكتب السعر صفراً لتسليم بلا مقابل.';
  end if;
  if p_payment is null or p_payment not in ('credit', 'cash') then
    raise exception 'bad_payment' using hint = 'اختر طريقة الدفع: نقداً إلى الصندوق أو بالدين على الجهة.';
  end if;
  if p_payment = 'cash' and v_total = 0 then
    raise exception 'price_required_for_cash' using hint = 'التسليم بلا مقابل لا يُقبض نقداً؛ اختر «بالدين» أو اكتب السعر.';
  end if;
  if p_payment = 'cash' and p_cash_account is null then
    raise exception 'cash_account_required' using hint = 'اختر الصندوق الذي قبضت فيه.';
  end if;
  if p_payment = 'credit' and p_cash_account is not null then
    raise exception 'bad_payment' using hint = 'البيع بالدين على الجهة لا يأخذ صندوقاً؛ اختر «نقداً إلى الصندوق» إن قبضت الآن.';
  end if;
  if p_sold_on is null then
    raise exception 'date_required' using hint = 'اكتب تاريخ البيع.';
  end if;
  perform private.check_doc_date(p_sold_on);

  -- الجهة.
  select * into p from public.parties y where y.org_id = v_org and y.id = p_party;
  if p.id is null then
    raise exception 'party_not_found' using hint = 'هذه الجهة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if p.archived_at is not null then
    raise exception 'party_archived' using hint = format('الجهة «%s» مؤرشفة، فلا يُسجَّل لها بيع جديد. أعِدها من الأرشيف أوّلاً.', p.name);
  end if;

  -- المخزن: المختار يُفحص (النطاق قبل أن يُسمّى)، وإلّا الوحيد بالنطاق الذي فيه منها متاح بالتاريخ.
  if p_warehouse is not null then
    select * into w from public.warehouses y where y.org_id = v_org and y.id = p_warehouse;
    if w.id is null then
      raise exception 'warehouse_not_found' using hint = 'هذا المخزن غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
    end if;
    if not public.in_scope_wh(w.id) then
      raise exception 'out_of_scope' using hint = format('المخزن «%s» خارج نطاقك، فلا تبيع منه.', w.name);
    end if;
    if w.archived_at is not null then
      raise exception 'warehouse_archived' using hint = format('المخزن «%s» مؤرشف، فلا يُباع منه. اختر مخزناً آخر.', w.name);
    end if;
    if not private.item_admissible(w.kind, i.kind) then
      raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s». اختر مخزناً فيه هذه المادّة.', i.name, w.name);
    end if;
  else
    select (count(*) filter (where q.available > 0))::int,
      string_agg(format('«%s» (%s)', y.name, private.qty_text(q.available, i.base_unit)), '، ' order by y.name collate "C", y.id) filter (where q.available > 0),
      coalesce(sum(q.expired), 0)
    into v_count, v_names, v_expired
    from public.warehouses y cross join lateral private.stock_at(i.id, y.id, p_sold_on) as q
    where y.org_id = v_org and y.archived_at is null and private.item_admissible(y.kind, i.kind) and public.in_scope_wh(y.id);
    if v_count = 0 then
      raise exception 'insufficient_stock' using hint = format('لا يوجد «%s» متاح في مخازن نطاقك بتاريخ %s: طلبت %s، وعندك %s.%s',
        i.name, to_char(p_sold_on, 'DD/MM/YYYY'), private.qty_text(p_qty, i.base_unit), private.qty_text(0, i.base_unit),
        case when v_expired > 0 then format(' وفي مخازنك %s منتهية الصلاحية لا تُباع.', private.qty_text(v_expired, i.base_unit)) else '' end);
    end if;
    if v_count > 1 then
      raise exception 'store_required' using hint = format('«%s» موجودة في أكثر من مخزن في نطاقك: %s. اختر المخزن الذي تبيع منه.', i.name, v_names);
    end if;
    select y.* into w from public.warehouses y cross join lateral private.stock_at(i.id, y.id, p_sold_on) as q
    where y.org_id = v_org and y.archived_at is null and private.item_admissible(y.kind, i.kind) and public.in_scope_wh(y.id) and q.available > 0;
  end if;
  -- قيد الجهة في الدفتر الرئيسيّ لوحدة المخزن، والكتابة في دفتر تحتاج نطاق وحدته (book_for_post، E49).
  b := private.book_for_post(private.sale_book(w.id));

  -- الأقفال بترتيبها، وكلّ فحص بعد قفله.
  perform private.lock_parties(array[p.id]);
  perform private.check_post_date(p_sold_on, w.division_id);
  perform private.lock_masters(array[w.id], array[i.id], true);
  perform private.lock_balances(array[i.id], array[w.id]);
  if p_payment = 'cash' then
    perform private.lock_cash_account(p_cash_account, true);
  end if;
  select * into s from private.stock_at(i.id, w.id, p_sold_on);
  if s.available < p_qty then
    raise exception 'insufficient_stock' using hint = format('لا يكفي رصيد «%s» في «%s»: طلبت %s، وعندك %s بتاريخ %s.%s%s',
      i.name, w.name, private.qty_text(p_qty, i.base_unit), private.qty_text(s.available, i.base_unit), to_char(p_sold_on, 'DD/MM/YYYY'),
      case when s.expired > 0 then format(' وفي المخزن %s منتهية الصلاحية لا تُباع.', private.qty_text(s.expired, i.base_unit)) else '' end,
      case when s.later > 0 then format(' و%s استُلمت بعد هذا التاريخ.', private.qty_text(s.later, i.base_unit)) else '' end);
  end if;
  for dr in select * from private.draw(i.id, w.id, p_qty, p_sold_on, null, false) loop
    perform private.apply_move(dr.lot_id, 'sale', p_sale_id, p_line_id, -dr.qty, -dr.value, p_sold_on, null, coalesce(i.tracks_expiry, false));
    v_cost := v_cost + dr.value;
  end loop;
  v_no := private.next_doc_no(private.sale_doc_kind(w.kind), p_sold_on);
  -- القيود (FOUNDATION ٤٩٥): الفاتورة +المبلغ، والقبض النقديّ يروح لفاتورته هي أوّلاً، وبعده متبقّي الفاتورة يتوزّع من الأقدم.
  if v_total > 0 then
    e := private.write_entry(gen_random_uuid(), p.id, b.id, 'invoice', v_total, 'sale', p_sale_id, v_no, p_sold_on, null);
    if p_payment = 'cash' then
      pay := private.write_entry(gen_random_uuid(), p.id, b.id, 'payment', -v_total, 'sale', p_sale_id, v_no, p_sold_on, null);
      perform private.allocate_entry(pay.id, e.id);
      m := private.write_cash_move(p_cash_account, v_total, 'party_payment', 'sale', p_sale_id, pay.id, p_sold_on, null, null);
    end if;
    perform private.allocate_entry(e.id, null);
  end if;
  insert into public.sales_invoices (id, org_id, doc_no, party_id, warehouse_id, book_id, sold_on, payment, cash_account_id, invoice_entry_id, payment_entry_id,
    cash_move_id, status, client_ref, posted_at, posted_by)
  values (p_sale_id, v_org, v_no, p.id, w.id, b.id, p_sold_on, p_payment, case when p_payment = 'cash' then p_cash_account end, e.id, pay.id, m.id,
    'posted', p_client_ref, now(), auth.uid());
  insert into public.sales_lines (id, org_id, sale_id, warehouse_id, line_no, item_id, qty, base_unit, unit_price, line_total)
  values (p_line_id, v_org, p_sale_id, w.id, 1, i.id, p_qty, i.base_unit, p_unit_price, v_total);
  insert into public.sales_line_costs (org_id, sale_id, line_id, warehouse_id, cost) values (v_org, p_sale_id, p_line_id, w.id, v_cost);
  perform private.mark_division_posted(w.division_id);
  v_result := private.sale_result(p_sale_id);
  update public.rpc_refs set result = v_result where org_id = v_org and fn = v_fn and client_ref = p_client_ref;
  return private.sale_view(v_result);
end
$$;

create or replace function public.void_sale(p_sale_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_sale';
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_cached jsonb;
  v_reason text;
  x public.sales_invoices;
  l public.sales_lines;
  w public.warehouses;
  mv public.stock_moves;
  v_back int := 0;
  v_kept numeric := 0;
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_sale_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into x from public.sales_invoices y where y.org_id = v_org and y.id = p_sale_id;
  if x.id is null then
    raise exception 'doc_not_found' using hint = 'هذا البيع غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  w := private.stock_wh(x.warehouse_id, true);
  perform private.book_for_post(x.book_id);
  perform private.lock_parties(array[x.party_id]);
  perform private.check_void_date();
  select * into x from public.sales_invoices y where y.org_id = v_org and y.id = p_sale_id for update;
  if x.status = 'void' then
    raise exception 'already_void' using hint = format('البيع %s ملغى من قبل.', x.doc_no);
  end if;
  select * into l from public.sales_lines y where y.org_id = v_org and y.sale_id = x.id and y.line_no = 1;
  perform private.lock_masters(array[w.id], array[l.item_id], false);
  perform private.lock_balances(array[l.item_id], array[w.id]);
  for mv in
    select z.* from public.stock_moves z
    where z.org_id = v_org and z.doc_kind = 'sale' and z.doc_id = x.id and z.reverses_move_id is null
    order by z.seq
  loop
    perform private.apply_move(mv.lot_id, 'sale', x.id, mv.doc_line_id, -mv.qty, -mv.value, v_today, mv.id);
    v_back := v_back + 1;
  end loop;
  if x.invoice_entry_id is not null then
    perform private.void_entry(x.invoice_entry_id, v_reason);
  end if;
  if x.payment_entry_id is not null and not exists (select 1 from public.party_entries r where r.org_id = v_org and r.reverses_entry_id = x.payment_entry_id) then
    v_kept := l.line_total;
  end if;
  update public.sales_invoices set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason, version = version + 1
  where org_id = v_org and id = x.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', x.id, 'doc_no', x.doc_no, 'status', 'void', 'voided_on', v_today,
    'reversed_moves', v_back, 'party_id', x.party_id, 'payment_entry_id', case when v_kept > 0 then x.payment_entry_id end,
    'money', jsonb_build_object('line_total', l.line_total::text, 'payment_kept', v_kept::text)));
end
$$;

create or replace function public.sale_detail(p_sale uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  x public.sales_invoices;
  v_result jsonb;
begin
  perform private.require('read');
  if not public.can_see_sales() then
    raise exception 'forbidden' using hint = 'المبيعات لأدوار المبيعات فقط.';
  end if;
  select * into x from public.sales_invoices y where y.org_id = v_org and y.id = p_sale;
  if x.id is null then
    raise exception 'doc_not_found' using hint = 'هذا البيع غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_wh(x.warehouse_id) then
    raise exception 'out_of_scope' using hint = 'مخزن هذا البيع خارج نطاقك.';
  end if;
  v_result := private.sale_result(x.id) || jsonb_build_object(
    'can_void', public.can('void') and x.status = 'posted',
    'draws', (select coalesce(jsonb_agg(jsonb_build_object('lot_id', m.lot_id, 'received_on', lt.received_on, 'expiry_on', lt.expiry_on,
        'qty', (-m.qty)::text, 'cost', jsonb_build_object('money', jsonb_build_object('value', (-m.value)::text))) order by m.seq), '[]'::jsonb)
      from public.stock_moves m join public.stock_lots lt on lt.org_id = m.org_id and lt.id = m.lot_id
      where m.org_id = x.org_id and m.doc_kind = 'sale' and m.doc_id = x.id and m.reverses_move_id is null),
    'invoice_entry_id', x.invoice_entry_id, 'payment_entry_id', x.payment_entry_id, 'cash_move_id', x.cash_move_id,
    'payment_reversed', x.payment_entry_id is not null and exists (select 1 from public.party_entries r where r.org_id = x.org_id and r.reverses_entry_id = x.payment_entry_id));
  return private.sale_view(v_result);
end
$$;

create or replace function public.verify_sales() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  -- ١) الشكل: سطر واحد لكلّ فاتورة بمخزن رأسها، ومبلغه = الكمية × السعر مقرَّباً لأقرب دينار، ووحدته وحدة أساس مادّته، وكلفة واحدة له.
  select 'sale_shape'::text, count(*) from public.sales_invoices s
  left join lateral (select count(*) as n from public.sales_lines l where l.org_id = s.org_id and l.sale_id = s.id) as k on true
  left join public.sales_lines l on l.org_id = s.org_id and l.sale_id = s.id and l.line_no = 1
  left join public.items i on i.org_id = l.org_id and i.id = l.item_id
  where k.n <> 1 or l.id is null or l.warehouse_id <> s.warehouse_id or l.line_total <> private._mul_div_round(l.qty, l.unit_price, 1, 0)
    or l.base_unit <> i.base_unit
    or (select count(*) from public.sales_line_costs c where c.org_id = l.org_id and c.line_id = l.id and c.sale_id = s.id) <> 1
  union all
  -- ٢) الحركات والكلفة: سحب أصليّ من مادّة السطر بكميته بالضبط من مخزنه ويومه (قطعة واحدة على الأقلّ)، وΣ قيمه = كلفة السطر؛ والمرحَّل بلا
  --    عكسية، والملغى كلّ أصلية منه معكوسة.
  select 'sale_moves', count(*) from public.sales_invoices s
  join public.sales_lines l on l.org_id = s.org_id and l.sale_id = s.id
  join public.sales_line_costs c on c.org_id = l.org_id and c.line_id = l.id
  cross join lateral (
    select coalesce(sum(-m.qty), 0) as drawn, coalesce(sum(-m.value), 0) as drawn_value, count(*) as pieces,
      count(*) filter (where m.item_id <> l.item_id or m.warehouse_id <> s.warehouse_id or m.moved_on <> s.sold_on or m.qty >= 0) as foreign_pieces,
      count(*) filter (where exists (select 1 from public.stock_moves r where r.org_id = m.org_id and r.reverses_move_id = m.id)) as reversed
    from public.stock_moves m
    where m.org_id = s.org_id and m.doc_kind = 'sale' and m.doc_id = s.id and m.doc_line_id = l.id and m.reverses_move_id is null
  ) as a
  where a.drawn <> l.qty or a.pieces = 0 or a.foreign_pieces > 0 or a.drawn_value <> c.cost
    or (s.status = 'posted' and a.reversed > 0) or (s.status = 'void' and a.reversed <> a.pieces)
  union all
  -- ٣) القيود والصندوق: الفاتورة بمبلغ موجب قيد invoice للجهة بدفترها بمستند البيع ويومه = المبلغ (والصفر بلا قيد)، والنقد قيد payment = −المبلغ
  --    وحركة party_payment بالصندوق = +المبلغ على قيد القبض؛ والمرحَّل قيد فاتورته بلا عكس، والملغى معكوس. والقبض يبقى بعد الإلغاء (لا يُفحص عكسه).
  select 'sale_entries', count(*) from public.sales_invoices s
  join public.sales_lines l on l.org_id = s.org_id and l.sale_id = s.id and l.line_no = 1
  left join public.party_entries e on e.org_id = s.org_id and e.id = s.invoice_entry_id
  left join public.party_entries pe on pe.org_id = s.org_id and pe.id = s.payment_entry_id
  left join public.cash_moves m on m.org_id = s.org_id and m.id = s.cash_move_id
  where (l.line_total > 0) <> (e.id is not null)
    or (e.id is not null and (e.kind <> 'invoice' or e.amount <> l.line_total or e.party_id <> s.party_id or e.book_id <> s.book_id
      or e.doc_kind is distinct from 'sale' or e.doc_id is distinct from s.id or e.on_date <> s.sold_on or e.reverses_entry_id is not null))
    or (s.payment = 'cash' and (pe.id is null or pe.kind <> 'payment' or pe.amount <> -l.line_total or pe.party_id <> s.party_id or pe.book_id <> s.book_id
      or pe.doc_kind is distinct from 'sale' or pe.doc_id is distinct from s.id or pe.on_date <> s.sold_on or pe.reverses_entry_id is not null
      or m.id is null or m.kind <> 'party_payment' or m.amount <> l.line_total or m.account_id is distinct from s.cash_account_id
      or m.party_entry_id is distinct from pe.id or m.doc_kind is distinct from 'sale' or m.doc_id is distinct from s.id or m.reverses_move_id is not null))
    or (s.payment = 'credit' and (pe.id is not null or m.id is not null))
    or (e.id is not null and s.status = 'posted' and exists (select 1 from public.party_entries r where r.org_id = s.org_id and r.reverses_entry_id = e.id))
    or (e.id is not null and s.status = 'void' and not exists (select 1 from public.party_entries r where r.org_id = s.org_id and r.reverses_entry_id = e.id))
    or not exists (select 1 from public.ledger_books k join public.warehouses w on w.org_id = s.org_id and w.id = s.warehouse_id
      where k.org_id = s.org_id and k.id = s.book_id and k.division_id = w.division_id and k.code = 'main')
  union all
  -- ٤) لا قيد ولا حركة صندوق ولا حركة مخزون بمستند sale إلا من فاتورة تشير إليها (أصلاً، والعكسيات لأصول منها).
  select 'sale_orphans', count(*) from (
    select e.id from public.party_entries e
    where e.doc_kind = 'sale'
      and not exists (select 1 from public.sales_invoices s where s.org_id = e.org_id and s.id = e.doc_id
        and coalesce(e.reverses_entry_id, e.id) in (s.invoice_entry_id, s.payment_entry_id))
    union all
    select m.id from public.cash_moves m
    where m.doc_kind = 'sale'
      and not exists (select 1 from public.sales_invoices s where s.org_id = m.org_id and s.id = m.doc_id and coalesce(m.reverses_move_id, m.id) = s.cash_move_id)
    union all
    select m.id from public.stock_moves m
    left join public.sales_lines l on l.org_id = m.org_id and l.id = m.doc_line_id and l.sale_id = m.doc_id
    where m.doc_kind = 'sale' and (l.id is null or m.item_id <> l.item_id or m.warehouse_id <> l.warehouse_id)
  ) as v
  union all
  -- ٥) الرقم: بنوع المخزن (العلف FD، والأدوية MD، والباقي MS) وسنة تاريخ البيع، ولكلّ (منشأة، نوع، سنة) الأرقام 1…last_no بلا فجوة ولا تكرار.
  select 'sale_numbers', (
    select count(*) from public.sales_invoices s join public.warehouses w on w.org_id = s.org_id and w.id = s.warehouse_id
    where split_part(s.doc_no, '-', 1) <> private.sale_doc_kind(w.kind) or split_part(s.doc_no, '-', 2) <> to_char(s.sold_on, 'YYYY')
  ) + (
    select count(*) from (
      select s.org_id, split_part(s.doc_no, '-', 1) as kind, split_part(s.doc_no, '-', 2)::int as year, count(*) as items,
        count(distinct split_part(s.doc_no, '-', 3)::int) as distinct_no, min(split_part(s.doc_no, '-', 3)::int) as min_no, max(split_part(s.doc_no, '-', 3)::int) as max_no
      from public.sales_invoices s group by 1, 2, 3
    ) as g
    full join (select * from public.doc_counters where kind in ('FD', 'MD', 'MS')) as c on c.org_id = g.org_id and c.kind = g.kind and c.year = g.year
    where g.org_id is null or c.org_id is null or g.items <> g.distinct_no or g.min_no <> 1 or g.max_no <> c.last_no
  )
$$;

-- ٣) الأجسام القديمة كما في 0029:
create or replace function public.sales_overview(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_result jsonb;
begin
  perform private.require('read');
  if not public.can_see_sales() then
    raise exception 'forbidden' using hint = 'المبيعات لأدوار المبيعات فقط.';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'period_required' using hint = 'حدّد المدّة: من تاريخ إلى تاريخ لا يسبقه.';
  end if;
  with listed as (
    select s.id, s.doc_no, s.sold_on, s.status, case when s.payment = 'cash' and not exists (select 1 from public.party_entries r where r.org_id = s.org_id
        and r.reverses_entry_id = s.payment_entry_id) then 'cash' else 'credit' end as payment,
      s.payment = 'cash' and exists (select 1 from public.party_entries r where r.org_id = s.org_id and r.reverses_entry_id = s.payment_entry_id) as refunded,
      s.party_id, p.name as party_name, s.warehouse_id, w.name as warehouse_name,
      l.item_id, i.name as item_name, l.qty, l.base_unit, l.unit_price, l.line_total, c.cost, s.posted_at
    from public.sales_invoices s
    join public.sales_lines l on l.org_id = s.org_id and l.sale_id = s.id and l.line_no = 1
    join public.sales_line_costs c on c.org_id = l.org_id and c.line_id = l.id
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    join public.parties p on p.org_id = s.org_id and p.id = s.party_id
    join public.warehouses w on w.org_id = s.org_id and w.id = s.warehouse_id
    where s.org_id = v_org and s.sold_on between p_from and p_to and public.in_scope_wh(s.warehouse_id)
  ), ordered as (
    select r.*, row_number() over (order by r.sold_on desc, r.posted_at desc, r.id desc) as n from listed r
  )
  select jsonb_build_object('from', p_from, 'to', p_to, 'today', public.app_today(), 'can_record', public.can('sale.record'), 'can_void', public.can('void'),
    'rows', coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'doc_no', o.doc_no, 'sold_on', o.sold_on, 'status', o.status, 'payment', o.payment,
        'payment_refunded', o.refunded,
        'party_id', o.party_id, 'party_name', o.party_name, 'warehouse_id', o.warehouse_id, 'warehouse_name', o.warehouse_name,
        'item_id', o.item_id, 'item_name', o.item_name, 'qty', o.qty::text, 'base_unit', o.base_unit, 'free', o.line_total = 0,
        'money', jsonb_build_object('unit_price', o.unit_price::text, 'line_total', o.line_total::text),
        'cost', jsonb_build_object('money', jsonb_build_object('cost', o.cost::text, 'profit', (o.line_total - o.cost)::text)))
      order by o.n) filter (where o.n <= 1000), '[]'::jsonb),
    'more', count(*) > 1000,
    'totals', jsonb_build_object('count', (count(*) filter (where o.status = 'posted'))::int, 'voided', (count(*) filter (where o.status = 'void'))::int,
      'money', jsonb_build_object('revenue', coalesce(sum(o.line_total) filter (where o.status = 'posted'), 0)::text,
        'cash', coalesce(sum(o.line_total) filter (where o.status = 'posted' and o.payment = 'cash'), 0)::text,
        'credit', coalesce(sum(o.line_total) filter (where o.status = 'posted' and o.payment = 'credit'), 0)::text),
      'cost', jsonb_build_object('money', jsonb_build_object('cost', coalesce(sum(o.cost) filter (where o.status = 'posted'), 0)::text,
        'profit', coalesce(sum(o.line_total - o.cost) filter (where o.status = 'posted'), 0)::text))))
  into v_result
  from ordered o;
  -- 0028: فواتير الطيور مفتاحاً جديداً (القديمة بشكلها ومعناها، D11).
  v_result := v_result || jsonb_build_object('birds', private.bird_sales_overview(p_from, p_to));
  return private.sale_view(v_result);
end
$$;

create or replace function public.sales_report(p_from date, p_to date, p_group text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_result jsonb;
begin
  perform private.require('read');
  if not public.can_see_sales() then
    raise exception 'forbidden' using hint = 'المبيعات لأدوار المبيعات فقط.';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'period_required' using hint = 'حدّد المدّة: من تاريخ إلى تاريخ لا يسبقه.';
  end if;
  if p_group is null or p_group not in ('party', 'item', 'day') then
    raise exception 'bad_group' using hint = 'اختر التجميع: بالجهة أو بالمادّة أو باليوم.';
  end if;
  with listed as (
    select case p_group when 'party' then s.party_id::text when 'item' then l.item_id::text else s.sold_on::text end as key,
      case p_group when 'party' then p.name when 'item' then i.name else to_char(s.sold_on, 'DD/MM/YYYY') end as label,
      l.item_id, l.base_unit, l.qty, l.line_total, c.cost, s.sold_on
    from public.sales_invoices s
    join public.sales_lines l on l.org_id = s.org_id and l.sale_id = s.id
    join public.sales_line_costs c on c.org_id = l.org_id and c.line_id = l.id
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    join public.parties p on p.org_id = s.org_id and p.id = s.party_id
    where s.org_id = v_org and s.status = 'posted' and s.sold_on between p_from and p_to and public.in_scope_wh(s.warehouse_id)
  ), grouped as (
    select r.key, min(r.label) as label, count(*)::int as count, sum(r.line_total) as revenue, sum(r.cost) as cost,
      case when p_group = 'item' then sum(r.qty) end as qty, case when p_group = 'item' then min(r.base_unit) end as base_unit, max(r.sold_on) as last_on
    from listed r group by r.key
  )
  select jsonb_build_object('from', p_from, 'to', p_to, 'group', p_group,
    'rows', coalesce(jsonb_agg(jsonb_build_object('key', g.key, 'label', g.label, 'count', g.count, 'qty', g.qty::text, 'base_unit', g.base_unit,
        'money', jsonb_build_object('revenue', g.revenue::text),
        'cost', jsonb_build_object('money', jsonb_build_object('cost', g.cost::text, 'profit', (g.revenue - g.cost)::text)))
      order by case when p_group = 'day' then g.key end desc, g.revenue desc, g.label collate "C", g.key), '[]'::jsonb),
    'totals', jsonb_build_object('count', coalesce(sum(g.count), 0)::int, 'money', jsonb_build_object('revenue', coalesce(sum(g.revenue), 0)::text),
      'cost', jsonb_build_object('money', jsonb_build_object('cost', coalesce(sum(g.cost), 0)::text, 'profit', coalesce(sum(g.revenue - g.cost), 0)::text))))
  into v_result
  from grouped g;
  -- 0028: فواتير الطيور مجمَّعة بالتجميع نفسه مفتاحاً جديداً (بالمادّة: مفتاح واحد «دجاج لحم حيّ»).
  v_result := v_result || jsonb_build_object('birds', private.bird_sales_groups(p_from, p_to, p_group));
  return private.sale_view(v_result);
end
$$;

create or replace function private.entry_detail(p_entry uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  e public.party_entries;
  v_box jsonb;
  v_out jsonb;
begin
  select * into e from public.party_entries where org_id = v_org and id = p_entry;
  if e.id is null or e.reverses_entry_id is not null or e.doc_kind is null then
    return null;
  end if;
  if e.doc_kind = 'receipt' then
    -- أجرة شراء دَين لجهة (القيد قيدها هي، لا قيد المورّد).
    if exists (select 1 from public.receipt_charges c where c.org_id = v_org and c.party_entry_id = e.id) then
      select jsonb_build_object('type', 'purchase_charge', 'doc_id', d.id, 'doc_no', d.doc_no, 'label', c.label, 'amount', c.amount::text,
          'warehouse', jsonb_build_object('id', w.id, 'name', w.name))
      into v_out
      from public.receipt_charges c
      join public.receipts d on d.org_id = c.org_id and d.id = c.doc_id
      join public.warehouses w on w.org_id = d.org_id and w.id = d.warehouse_id
      where c.org_id = v_org and c.party_entry_id = e.id;
      return v_out;
    end if;
    if e.kind = 'payout' then
      select jsonb_build_object('id', a.id, 'name', a.name) into v_box
      from public.cash_moves m join public.cash_accounts a on a.org_id = m.org_id and a.id = m.account_id
      where m.org_id = v_org and m.party_entry_id = e.id
      limit 1;
      select jsonb_build_object('type', 'purchase_payment', 'doc_id', d.id, 'doc_no', d.doc_no, 'account', v_box)
      into v_out
      from public.receipts d where d.org_id = v_org and d.id = e.doc_id;
      return v_out;
    end if;
    select jsonb_build_object('type', 'purchase', 'doc_id', d.id, 'doc_no', d.doc_no, 'status', d.status, 'received_on', d.received_on,
        'warehouse', jsonb_build_object('id', w.id, 'name', w.name),
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object('line_no', l.line_no, 'item_id', l.item_id, 'item_name', i.name, 'qty', l.qty_in_unit::text,
              'unit_label', l.unit_label,
              'unit_price', case when la.line_total is not null and l.qty_in_unit > 0 then private._mul_div_round2(la.line_total, 1, l.qty_in_unit)::text end,
              'amount', la.line_total::text)
            order by l.line_no)
          from public.receipt_lines l
          join public.items i on i.org_id = l.org_id and i.id = l.item_id
          left join public.receipt_line_amounts la on la.org_id = l.org_id and la.line_id = l.id
          where l.org_id = v_org and l.doc_id = d.id), '[]'::jsonb),
        'lines_total', t.lines_total::text,
        'discount', coalesce(ra.discount, 0)::text,
        'charges', coalesce((
          select jsonb_agg(jsonb_build_object('label', c.label, 'amount', c.amount::text,
              'paid', case when c.cash_account_id is not null then 'cash' when c.payee_party_id is not null then 'party' end)
            order by c.charge_no)
          from public.receipt_charges c where c.org_id = v_org and c.doc_id = d.id), '[]'::jsonb),
        'net', (t.lines_total - coalesce(ra.discount, 0))::text,
        'paid_now', coalesce(ra.paid_now, 0)::text,
        'account', (select jsonb_build_object('id', a.id, 'name', a.name) from public.cash_accounts a where a.org_id = v_org and a.id = ra.cash_account_id))
    into v_out
    from public.receipts d
    join public.warehouses w on w.org_id = d.org_id and w.id = d.warehouse_id
    left join public.receipt_amounts ra on ra.org_id = d.org_id and ra.doc_id = d.id
    cross join lateral (
      select coalesce(sum(la.line_total), 0) as lines_total from public.receipt_line_amounts la where la.org_id = d.org_id and la.doc_id = d.id
    ) as t
    where d.org_id = v_org and d.id = e.doc_id;
    return v_out;
  elsif e.doc_kind = 'sale' then
    if e.kind = 'payment' then
      select jsonb_build_object('type', 'sale_payment', 'doc_id', s.id, 'doc_no', s.doc_no,
          'account', (select jsonb_build_object('id', a.id, 'name', a.name) from public.cash_accounts a where a.org_id = v_org and a.id = s.cash_account_id))
      into v_out
      from public.sales_invoices s where s.org_id = v_org and s.id = e.doc_id;
      return v_out;
    end if;
    select jsonb_build_object('type', 'sale', 'doc_id', s.id, 'doc_no', s.doc_no, 'status', s.status, 'sold_on', s.sold_on,
        'warehouse', jsonb_build_object('id', w.id, 'name', w.name), 'payment', s.payment,
        'account', (select jsonb_build_object('id', a.id, 'name', a.name) from public.cash_accounts a where a.org_id = v_org and a.id = s.cash_account_id),
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object('line_no', l.line_no, 'item_id', l.item_id, 'item_name', i.name, 'qty', l.qty::text,
              'base_unit', l.base_unit, 'unit_price', l.unit_price::text, 'amount', l.line_total::text)
            order by l.line_no)
          from public.sales_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
          where l.org_id = v_org and l.sale_id = s.id), '[]'::jsonb),
        'total', coalesce((select sum(l.line_total) from public.sales_lines l where l.org_id = v_org and l.sale_id = s.id), 0)::text)
    into v_out
    from public.sales_invoices s join public.warehouses w on w.org_id = s.org_id and w.id = s.warehouse_id
    where s.org_id = v_org and s.id = e.doc_id;
    return v_out;
  elsif e.doc_kind = 'bird_sale' then
    -- 0028: فاتورة الطيور BR: الحقل والتذكرة والطيور والصافي والتنزيل والمحسوب وسعر الكيلو والمبلغ والمقبوض وصندوقه؛ وقيد المقبوض بصندوقه. والمقبوض
    -- الذي رُدّ («ألغِ القبض») صفر وpayment_refunded يقول ذلك (مراجعة 0028 M3، قاعدة 0021).
    if e.kind = 'payment' then
      select jsonb_build_object('type', 'bird_sale_payment', 'doc_id', b.id, 'doc_no', b.doc_no,
          'payment_refunded', private.bird_sale_refunded(b.payment_entry_id),
          'account', (select jsonb_build_object('id', a.id, 'name', a.name) from public.cash_accounts a where a.org_id = v_org and a.id = b.cash_account_id))
      into v_out
      from public.bird_sales b where b.org_id = v_org and b.id = e.doc_id;
      return v_out;
    end if;
    select jsonb_build_object('type', 'bird_sale', 'doc_id', b.id, 'doc_no', b.doc_no, 'status', b.status, 'sold_on', b.sold_on,
        'site', jsonb_build_object('id', s.id, 'name', s.name), 'ticket_no', t.ticket_no, 'birds', b.birds, 'net_kg', b.net_kg::text,
        'deduction_pct', b.deduction_pct::text, 'billed_kg', b.billed_kg::text, 'unit_price', b.unit_price::text, 'total', b.total::text,
        'paid_now', case when private.bird_sale_refunded(b.payment_entry_id) then 0 else b.paid_now end::text,
        'payment_refunded', private.bird_sale_refunded(b.payment_entry_id),
        'account', (select jsonb_build_object('id', a.id, 'name', a.name) from public.cash_accounts a where a.org_id = v_org and a.id = b.cash_account_id))
    into v_out
    from public.bird_sales b
    join public.sites s on s.org_id = b.org_id and s.id = b.site_id
    join public.weigh_tickets t on t.org_id = b.org_id and t.id = b.ticket_id
    where b.org_id = v_org and b.id = e.doc_id;
    return v_out;
  elsif e.doc_kind = 'supplier_return' then
    select jsonb_build_object('type', 'supplier_return', 'doc_id', r.id, 'doc_no', r.doc_no, 'status', r.status, 'returned_on', r.returned_on,
        'receipt_id', r.receipt_id, 'receipt_doc_no', (select d.doc_no from public.receipts d where d.org_id = v_org and d.id = r.receipt_id),
        'warehouse', jsonb_build_object('id', w.id, 'name', w.name),
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object('line_no', l.line_no, 'item_id', l.item_id, 'item_name', i.name, 'qty', l.qty_base::text,
              'base_unit', rl.base_unit, 'amount', la.credit_amount::text)
            order by l.line_no)
          from public.supplier_return_lines l
          join public.items i on i.org_id = l.org_id and i.id = l.item_id
          join public.receipt_lines rl on rl.org_id = l.org_id and rl.id = l.receipt_line_id
          left join public.supplier_return_line_amounts la on la.org_id = l.org_id and la.line_id = l.id
          where l.org_id = v_org and l.doc_id = r.id), '[]'::jsonb),
        'total', coalesce((select sum(la.credit_amount) from public.supplier_return_line_amounts la where la.org_id = v_org and la.doc_id = r.id), 0)::text)
    into v_out
    from public.supplier_returns r join public.warehouses w on w.org_id = r.org_id and w.id = r.warehouse_id
    where r.org_id = v_org and r.id = e.doc_id;
    return v_out;
  elsif e.doc_kind = 'expense' then
    select jsonb_build_object('type', 'expense', 'expense_id', x.id, 'category', c.name, 'division_kind', d.kind, 'note', x.note, 'for_month', x.for_month)
    into v_out
    from public.expenses x
    join public.expense_categories c on c.org_id = x.org_id and c.id = x.category_id
    join public.divisions d on d.org_id = x.org_id and d.id = x.division_id
    where x.org_id = v_org and x.id = e.doc_id;
    return v_out;
  elsif e.doc_kind = 'receipt_revalue' then
    -- تسعير شراء سُجّل بلا سعر (kind purchase) أو تصحيح سعر (adjustment): سطر واحد لكلّ قيد.
    select jsonb_build_object('type', 'revaluation', 'pricing', e.kind = 'purchase', 'receipt_id', v.receipt_id, 'receipt_doc_no', d.doc_no,
        'item_name', i.name, 'qty', l.qty_in_unit::text, 'unit_label', l.unit_label, 'unit_price', v.unit_price::text,
        'old_total', v.old_total::text, 'new_total', v.new_total::text, 'diff', v.diff::text)
    into v_out
    from public.receipt_revaluations v
    join public.receipts d on d.org_id = v.org_id and d.id = v.receipt_id
    join public.receipt_lines l on l.org_id = v.org_id and l.id = v.receipt_line_id
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    where v.org_id = v_org and v.party_entry_id = e.id;
    return v_out;
  end if;
  return null;
end
$$;

-- ٤) الدوالّ الجديدة والمحفّز:
drop function if exists public.record_sale_v2(uuid, uuid, uuid, uuid, date, jsonb, numeric, jsonb, text);
drop function if exists public.sale_catalog(uuid);
drop function if exists private.sale_v2_result(uuid);
drop function if exists private.sale_v2_content(uuid);
drop function if exists private.sale_more(uuid);
drop function if exists private.sale_paid(uuid);
drop function if exists private.walk_in_party();
drop function if exists private.json_num(jsonb, text);
drop function if exists private.json_uuid(jsonb, text);
drop trigger if exists party_entries_walk_in on public.party_entries;
drop function if exists private.party_entries_walk_in();
drop function if exists private.sale_void_block(uuid);
drop function if exists private.lock_sale_party(uuid, uuid, boolean);
drop trigger if exists receipts_party_not_system on public.receipts;
drop trigger if exists receipt_charges_party_not_system on public.receipt_charges;
drop trigger if exists item_units_party_not_system on public.item_units;
drop function if exists private.party_not_system();
drop trigger if exists parties_system_guard on public.parties;
drop function if exists private.parties_system_guard();

-- party_for_post كما في 0006 (بلا رفض حساب النظام، مراجعة 0033 B4):
create or replace function private.party_for_post(p_party uuid) returns public.parties
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  p public.parties;
begin
  if p_party is null then
    raise exception 'party_required' using hint = 'اختر الجهة.';
  end if;
  select * into p from public.parties where org_id = public.auth_org() and id = p_party;
  if p.id is null then
    raise exception 'party_not_found' using hint = 'هذه الجهة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  return p;
end
$$;

-- ٥) سياسة سجلّ التدقيق كما في 0021، والسيقان (بسياستيها ومحفّزها وفهارسها):
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'audit_log_sale_scope'
    and qual like '%sales_payments%') then
    drop policy audit_log_sale_scope on public.audit_log;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'audit_log_sale_scope') then
    create policy audit_log_sale_scope on public.audit_log as restrictive for select to authenticated
      using (case
        when table_name in ('sales_invoices', 'sales_lines', 'sales_line_costs') then public.in_scope_wh((coalesce("new", "old") ->> 'warehouse_id')::uuid)
        else true
      end);
  end if;
end
$$;
drop table if exists public.sales_payments;

-- ٦) السطور كما في 0021:
alter table public.sales_lines drop constraint if exists sales_lines_unit_factor_check;
alter table public.sales_lines drop constraint if exists sales_lines_unit_label_check;
alter table public.sales_lines drop constraint if exists sales_lines_unit_qty_check;
alter table public.sales_lines drop constraint if exists sales_lines_unit_price_unit_check;
alter table public.sales_lines drop constraint if exists sales_lines_gross_total_check;
alter table public.sales_lines drop constraint if exists sales_lines_discount_check;
alter table public.sales_lines drop constraint if exists sales_lines_item_unit_fkey;
drop index if exists public.sales_lines_unit;
alter table public.sales_lines drop column if exists item_unit_id;
alter table public.sales_lines drop column if exists unit_label;
alter table public.sales_lines drop column if exists unit_factor;
alter table public.sales_lines drop column if exists unit_qty;
alter table public.sales_lines drop column if exists unit_price_unit;
alter table public.sales_lines drop column if exists gross_total;
alter table public.sales_lines drop column if exists line_discount;
alter table public.sales_lines drop column if exists invoice_discount_share;

-- ٧) الرأس كما في 0021 (القيد القديم بعد النقل):
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'sales_invoices_payment_check' and conrelid = 'public.sales_invoices'::regclass
    and pg_get_constraintdef(oid) like '%paid%') then
    alter table public.sales_invoices drop constraint sales_invoices_payment_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_invoices_payment_check' and conrelid = 'public.sales_invoices'::regclass) then
    alter table public.sales_invoices add constraint sales_invoices_payment_check check (payment in ('cash', 'credit') and (payment = 'cash') = (cash_account_id is not null)
      and (payment = 'cash') = (payment_entry_id is not null) and (payment_entry_id is null) = (cash_move_id is null));
  end if;
end
$$;
alter table public.sales_invoices drop column if exists discount_total;
alter table public.sales_invoices drop column if exists invoice_discount;
alter table public.sales_invoices drop column if exists note;
alter table public.sales_invoices drop column if exists walk_in;
alter table public.sales_invoices drop column if exists total;
alter table public.sales_invoices drop column if exists paid;

-- ٨) الجهات كما في 0024 (بلا علم الطرف النظاميّ وسياسته وفهرسه):
drop policy if exists parties_not_system on public.parties;
drop index if exists public.parties_walk_in;
alter table public.parties drop constraint if exists parties_system_kind_check;
alter table public.parties drop column if exists system_kind;
