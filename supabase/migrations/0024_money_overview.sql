-- 0024_money_overview — «المال بين يديك» (المرحلة 1 من خطّة «المال والحسابات»، docs/plans/accounting.md §8.1)
--   (كلمة المالك 2026-11-10: «نسوي قائمة خاصة بالفلوس وحركة الفلوس… صاحب الحقول يعرف شنو كاعد يصير بفلوسه ووين كاعدة تروح وشنو
--   مطلوب وشنو يطلب… قائمة خاصة بالديون كل اسمه كدامة الرقم… ولما نضغط… تقارير كل شيء اشتريناه من عنده بالتواريخ وشنو الي
--   يطلبناا وشنو التسديدات… وتصاميم كشف الحسابات تكون احترافية»؛ وأجوبته: دينار فقط، وبلا آجال (عمر الدين من تاريخ المستند)،
--   والاستحقاق، والدفتر من أوّل يوم؛ DECISIONS «المال والحسابات»).
-- قرّاء فقط فوق الدفاتر القائمة: لا جدول جديد، ولا تغيير في أيّ دالّة ترحيل، والكتابة الوحيدة قاعدة الجهات (#58).
-- كلّ القرّاء security definer (جداول المبالغ والتفاصيل لا تُقرأ إلا بدوالّ)، فتصفّي صراحةً: المنشأة، والدفاتر بـin_scope_book، والوثائق
-- بدفترها أو مخزنها، والصناديق للمنشأة كلّها (كما في report_cash_balances). والإذن: accounts.view وcan_see_accounts؛ والكلفة لمن يراها.
--   • public.money_overview: «خلاصة المال»: النقد الآن، والذمم، واليوم بأصنافه، والشهر، وأكبر خمسة، والتنبيهات.
--   • public.money_moves: «حركة الأموال» لكلّ الصناديق أو لصندوق، بالأصناف والجهة، ومجاميع الأيام، والرصيد الجاري، ومؤشّر صفحات بالمفاتيح.
--   • public.debts_overview: «قائمة الذمم» لنا / علينا، بأعمار القيود المفتوحة (المتبقّي بعد التوزيع القائم)، ومجاميع وفئات للقائمة كلّها.
--   • public.party_statement_v2: كشف الحساب الاحترافي: لكلّ سطر مستنده وتفصيله (الموادّ والخصم والأجور) وتوزيعاته، والمفتوح والأعمار اليوم.
--   • public.voucher_detail وpublic.transfer_detail: سند القبض أو الصرف، وسند التحويل بين صندوقين.
--   • public.month_summary: «خلاصة الشهر التشغيلية» لكلّ قسم وللمشروع (لا قائمة دخل محاسبية).
--   • public.home_summary: بطاقة الحسابات تزيد النقد كلّه (cash_total).
--   • private.parties_check: أمين المخزن يضيف زبوناً أو مورّداً (جواب المالك 2026-11-08، #58).
--   • public.verify_money: ثوابت تجعل الكشف التفصيلي موثوقاً (تفصيل كلّ مستند = قيده، ولا قيد مفتوح بالجهتين).
-- تراجع: rollback_0024.sql — يُسقط الجديد ويرجّع home_summary (0008) وparties_check (0006) حرفاً بحرف.
-- تنعاد بأمان: create or replace.

set lock_timeout = '5s';

-- ─── أ. مساعدات ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- صنف حركة الصندوق (العقد §5): القبض والدفع بسنديهما، والبيع النقدي، والشراء النقدي وأجوره، والمصروف، والتحويل، والافتتاح.
create or replace function private.cash_class(p_kind text, p_doc_kind text) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case
    when p_kind = 'party_payment' and p_doc_kind is null then 'customer_receipt'
    when p_kind = 'party_payment' and p_doc_kind = 'sale' then 'cash_sale'
    when p_kind = 'party_payout' and p_doc_kind is null then 'supplier_payment'
    when p_kind = 'receipt_paid' then 'cash_purchase'
    when p_kind = 'receipt_charge' then 'purchase_charge'
    when p_kind = 'expense' then 'expense'
    when p_kind = 'transfer' then 'transfer'
    when p_kind = 'opening' then 'opening'
    else 'other'
  end
$$;

create or replace function private.cash_class_rank(p_class text) returns int
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select coalesce(array_position(array['customer_receipt', 'cash_sale', 'supplier_payment', 'cash_purchase', 'purchase_charge', 'expense',
    'transfer', 'opening', 'other']::text[], p_class), 99)
$$;

-- القيود المفتوحة (المتبقّي بعد التوزيع > 0) في دفاتر نطاق القارئ الفعّالة، لجهة أو للكلّ (null). حالة اليوم: التوزيع قائم لا تاريخ له.
create or replace function private.open_entries(p_party uuid) returns table (entry_id uuid, party_id uuid, book_id uuid, on_date date, seq bigint,
  kind text, doc_kind text, doc_id uuid, doc_no text, amount numeric, remaining numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select e.id, e.party_id, e.book_id, e.on_date, e.seq, e.kind, e.doc_kind, e.doc_id, e.doc_no, e.amount, x.remaining
  from public.party_entries e
  join public.ledger_books b on b.org_id = e.org_id and b.id = e.book_id
  cross join lateral (
    select abs(e.amount) - coalesce((
      select sum(a.amount) from public.party_allocations a
      where a.org_id = e.org_id and a.party_id = e.party_id and a.book_id = e.book_id
        and ((e.amount > 0 and a.debit_entry_id = e.id) or (e.amount < 0 and a.credit_entry_id = e.id))
    ), 0) as remaining
  ) as x
  where e.org_id = public.auth_org() and (p_party is null or e.party_id = p_party) and b.archived_at is null and public.in_scope_book(b.id)
    and e.on_date <= public.app_today() and x.remaining > 0
$$;

-- التوزيعات الحيّة لقيد (لم تُعكس ولا هي عكس)، مجمّعة بالقيد المقابل، بلا قيد إلغائه (إلغاء القيد يوزّعه على عكسه).
create or replace function private.entry_allocations(p_entry uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with x as (
    select * from public.party_entries where org_id = public.auth_org() and id = p_entry
  ), live as (
    select case when a.debit_entry_id = x.id then a.credit_entry_id else a.debit_entry_id end as other, a.amount
    from x join public.party_allocations a on a.org_id = x.org_id and a.party_id = x.party_id and a.book_id = x.book_id
      and (a.debit_entry_id = x.id or a.credit_entry_id = x.id)
    where a.reverses_allocation_id is null
      and not exists (select 1 from public.party_allocations y where y.org_id = a.org_id and y.reverses_allocation_id = a.id)
  ), g as (
    select other, sum(amount) as amount from live group by other
  )
  select coalesce(jsonb_agg(jsonb_build_object('entry_id', o.id, 'doc_kind', o.doc_kind, 'doc_id', o.doc_id, 'doc_no', o.doc_no, 'kind', o.kind,
      'on_date', o.on_date, 'amount', g.amount::text) order by o.on_date, o.seq, o.id), '[]'::jsonb)
  from g
  join public.party_entries o on o.org_id = public.auth_org() and o.id = g.other
  cross join x
  where o.reverses_entry_id is distinct from x.id and x.reverses_entry_id is distinct from o.id
$$;

create or replace function private.member_name(p_user uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select m.display_name from public.members m where m.org_id = public.auth_org() and m.user_id = p_user
$$;

-- تفصيل القيد من مستنده (العقد §4.4): موادّ الشراء والبيع والمرتجع وخصمها وأجورها، والمصروف، وتصحيح السعر. العكس بلا تفصيل
-- (الشاشة تسمّيه «إلغاء» برقمه)، وما لا مستند له بلا تفصيل.
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

-- ─── ب. أرقام الشهر (لخلاصة المال وخلاصة الشهر): المستندات المرحَّلة غير الملغاة بتاريخها، مثل sales_report ─────────────────
create or replace function private.money_sales(p_from date, p_to date, p_division uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with x as (
    select s.id, l.line_total, c.cost
    from public.sales_invoices s
    join public.ledger_books b on b.org_id = s.org_id and b.id = s.book_id
    join public.sales_lines l on l.org_id = s.org_id and l.sale_id = s.id
    left join public.sales_line_costs c on c.org_id = l.org_id and c.line_id = l.id
    where s.org_id = public.auth_org() and s.status = 'posted' and s.sold_on between p_from and p_to and public.in_scope_book(s.book_id)
      and (p_division is null or b.division_id = p_division)
  )
  select jsonb_build_object('count', count(distinct x.id)::int, 'revenue', coalesce(sum(x.line_total), 0)::text,
    'cost', case when public.can_see_cost() then coalesce(sum(x.cost), 0)::text end,
    'gross', case when public.can_see_cost() then (coalesce(sum(x.line_total), 0) - coalesce(sum(x.cost), 0))::text end)
  from x
$$;

-- المشتريات: قيمة الشراء = الموادّ − الخصم + الأجور؛ ونقداً = المدفوع عند الشراء + الأجور النقدية؛ وتسعير الشراء وتصحيح السعر
-- بتاريخ قيدهما دَيناً على المورّد.
create or replace function private.money_purchases(p_from date, p_to date, p_division uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with r as (
    select d.id,
      coalesce((select sum(la.line_total) from public.receipt_line_amounts la where la.org_id = d.org_id and la.doc_id = d.id), 0) as lines_total,
      coalesce(ra.discount, 0) as discount, coalesce(ra.paid_now, 0) as paid_now,
      coalesce((select sum(c.amount) from public.receipt_charges c where c.org_id = d.org_id and c.doc_id = d.id), 0) as charges,
      coalesce((select sum(c.amount) from public.receipt_charges c where c.org_id = d.org_id and c.doc_id = d.id and c.cash_account_id is not null), 0)
        as cash_charges
    from public.receipts d
    join public.ledger_books b on b.org_id = d.org_id and b.id = d.book_id
    left join public.receipt_amounts ra on ra.org_id = d.org_id and ra.doc_id = d.id
    where d.org_id = public.auth_org() and d.status = 'posted' and d.received_on between p_from and p_to and public.in_scope_book(d.book_id)
      and (p_division is null or b.division_id = p_division)
  ), rvs as (
    select v.receipt_id, v.diff
    from public.receipt_revaluations v
    join public.party_entries e on e.org_id = v.org_id and e.id = v.party_entry_id
    join public.ledger_books b on b.org_id = e.org_id and b.id = e.book_id
    where v.org_id = public.auth_org() and v.status = 'posted' and e.on_date between p_from and p_to and public.in_scope_book(e.book_id)
      and (p_division is null or b.division_id = p_division)
  ), rv as (
    select coalesce(sum(rvs.diff), 0) as diff from rvs
  )
  select jsonb_build_object('count', (select count(*) from (select r.id from r union select rvs.receipt_id from rvs) as n)::int,
    'total', ((select coalesce(sum(lines_total - discount + charges), 0) from r) + (select diff from rv))::text,
    'cash', (select coalesce(sum(paid_now + cash_charges), 0) from r)::text,
    'credit', ((select coalesce(sum(lines_total - discount + charges - paid_now - cash_charges), 0) from r) + (select diff from rv))::text)
$$;

create or replace function private.money_expenses(p_month date, p_division uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with x as (
    select x.category_id, sum(x.amount) as amount
    from public.expenses x
    where x.org_id = public.auth_org() and x.for_month = p_month and public.in_scope_division(x.division_id)
      and (p_division is null or x.division_id = p_division)
    group by x.category_id
  )
  select jsonb_build_object('total', coalesce(sum(x.amount), 0)::text,
    'categories', coalesce(jsonb_agg(jsonb_build_object('category_id', x.category_id, 'name', c.name, 'amount', x.amount::text)
      order by x.amount desc, c.name collate "C", x.category_id) filter (where x.amount <> 0), '[]'::jsonb))
  from x join public.expense_categories c on c.org_id = public.auth_org() and c.id = x.category_id
$$;

-- صافي النقد: كلّ حركات الصناديق بلا التحويل بينها ولا الأرصدة الافتتاحية.
create or replace function private.money_cash(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'inflow', coalesce(sum(m.amount) filter (where m.amount > 0), 0)::text,
    'outflow', coalesce(-sum(m.amount) filter (where m.amount < 0), 0)::text,
    'net', coalesce(sum(m.amount), 0)::text)
  from public.cash_moves m
  where m.org_id = public.auth_org() and m.on_date between p_from and p_to and m.kind not in ('transfer', 'opening')
$$;

create or replace function private.money_production(p_from date, p_to date, p_division uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when count(*) = 0 then null else jsonb_build_object('batches', count(*)::int, 'output_kg', coalesce(sum(b.output_qty_kg), 0)::text,
    'cost', case when public.can_see_cost() then coalesce(sum(v.total_value), 0)::text end) end
  from public.production_batches b
  join public.warehouses w on w.org_id = b.org_id and w.id = b.input_warehouse_id
  left join public.production_values v on v.org_id = b.org_id and v.batch_id = b.id
  where b.org_id = public.auth_org() and b.status = 'posted' and b.produced_on between p_from and p_to and public.in_scope_wh(b.input_warehouse_id)
    and (p_division is null or w.division_id = p_division)
$$;

create or replace function private.money_flock_issue(p_from date, p_to date, p_division uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when count(distinct f.id) = 0 then null else jsonb_build_object('issues', count(distinct f.id)::int,
    'cost', case when public.can_see_cost() then coalesce(sum(c.amount), 0)::text end) end
  from public.flock_issues f
  left join public.flock_costs c on c.org_id = f.org_id and c.doc_kind = 'flock_issue' and c.doc_id = f.id
  where f.org_id = public.auth_org() and f.status = 'posted' and f.issued_on between p_from and p_to and public.in_scope_division(f.division_id)
    and (p_division is null or f.division_id = p_division)
$$;

-- ─── ج. «خلاصة المال» ──────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.money_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_month date := date_trunc('month', public.app_today())::date;
  v_cash jsonb;
  v_debts jsonb;
  v_day jsonb;
  v_top jsonb;
begin
  if not (public.can('accounts.view') and public.can_see_accounts()) then
    raise exception 'forbidden' using hint = 'الحسابات للمالك والمدير والمحاسب فقط.';
  end if;

  with boxes as (
    select a.id, a.name, a.kind, a.archived_at, coalesce(sum(m.amount) filter (where m.on_date <= v_today), 0) as balance
    from public.cash_accounts a left join public.cash_moves m on m.org_id = a.org_id and m.account_id = a.id
    where a.org_id = v_org
    group by a.id
  )
  select jsonb_build_object(
    'cash', jsonb_build_object('total', coalesce(sum(x.balance), 0)::text,
      'boxes', coalesce(jsonb_agg(jsonb_build_object('account_id', x.id, 'name', x.name, 'kind', x.kind, 'archived', x.archived_at is not null,
          'balance', x.balance::text) order by x.archived_at is not null, x.name collate "C", x.id)
        filter (where x.archived_at is null or x.balance <> 0), '[]'::jsonb)),
    'negative_boxes', coalesce(jsonb_agg(jsonb_build_object('account_id', x.id, 'name', x.name, 'balance', x.balance::text)
      order by x.name collate "C", x.id) filter (where x.balance < 0), '[]'::jsonb))
  into v_cash
  from boxes x;

  with cells as (
    select e.party_id, e.book_id, b.division_id, sum(e.amount) as closing
    from public.party_entries e join public.ledger_books b on b.org_id = e.org_id and b.id = e.book_id
    where e.org_id = v_org and e.on_date <= v_today and b.archived_at is null and public.in_scope_book(b.id)
    group by e.party_id, e.book_id, b.division_id
  ), side as (
    select c.party_id, sum(greatest(c.closing, 0)) as receivable, sum(greatest(-c.closing, 0)) as payable from cells c group by c.party_id
  ), opn as (
    select o.party_id, o.on_date, o.amount, o.remaining from private.open_entries(null) o
  )
  select jsonb_build_object(
    'debts', jsonb_build_object(
      'receivable', coalesce((select sum(greatest(c.closing, 0)) from cells c), 0)::text,
      'payable', coalesce((select sum(greatest(-c.closing, 0)) from cells c), 0)::text,
      'net', coalesce((select sum(c.closing) from cells c), 0)::text,
      'divisions', coalesce((
        select jsonb_agg(jsonb_build_object('division_id', d.id, 'kind', d.kind,
            'receivable', coalesce((select sum(greatest(c.closing, 0)) from cells c where c.division_id = d.id), 0)::text,
            'payable', coalesce((select sum(greatest(-c.closing, 0)) from cells c where c.division_id = d.id), 0)::text)
          order by d.kind collate "C")
        from public.divisions d
        where d.org_id = v_org and d.archived_at is null
          and exists (select 1 from public.ledger_books k where k.org_id = d.org_id and k.division_id = d.id and k.archived_at is null
            and public.in_scope_book(k.id))), '[]'::jsonb),
      'books', jsonb_build_object(
        'visible', (select count(*) from public.ledger_books b where b.org_id = v_org and b.archived_at is null and public.in_scope_book(b.id)),
        'total', (select count(*) from public.ledger_books b where b.org_id = v_org and b.archived_at is null))),
    'top_receivable', coalesce((
      select jsonb_agg(t.obj order by t.rn) from (
        select jsonb_build_object('party_id', p.id, 'name', p.name, 'phone', p.phone, 'amount', s.receivable::text,
            'oldest', (select min(o.on_date) from opn o where o.party_id = p.id and o.amount > 0)) as obj,
          row_number() over (order by s.receivable desc, p.name collate "C", p.id) as rn
        from side s join public.parties p on p.org_id = v_org and p.id = s.party_id
        where s.receivable > 0) as t
      where t.rn <= 5), '[]'::jsonb),
    'top_payable', coalesce((
      select jsonb_agg(t.obj order by t.rn) from (
        select jsonb_build_object('party_id', p.id, 'name', p.name, 'phone', p.phone, 'amount', s.payable::text,
            'oldest', (select min(o.on_date) from opn o where o.party_id = p.id and o.amount < 0)) as obj,
          row_number() over (order by s.payable desc, p.name collate "C", p.id) as rn
        from side s join public.parties p on p.org_id = v_org and p.id = s.party_id
        where s.payable > 0) as t
      where t.rn <= 5), '[]'::jsonb),
    'old_receivable', (select jsonb_build_object('parties', count(distinct o.party_id)::int, 'amount', coalesce(sum(o.remaining), 0)::text)
      from opn o where o.amount > 0 and v_today - o.on_date > 90),
    'old_payable', (select jsonb_build_object('parties', count(distinct o.party_id)::int, 'amount', coalesce(sum(o.remaining), 0)::text)
      from opn o where o.amount < 0 and v_today - o.on_date > 90))
  into v_top;

  -- اليوم: المجموعان بلا التحويل بين الصناديق ولا الافتتاح (لا يدخلان المال ولا يخرجانه)، والأصناف كلّها بما فيها هما.
  with t as (
    select private.cash_class(m.kind, m.doc_kind) as class, m.amount
    from public.cash_moves m where m.org_id = v_org and m.on_date = v_today
  ), g as (
    select t.class, coalesce(sum(t.amount) filter (where t.amount > 0), 0) as inflow, coalesce(-sum(t.amount) filter (where t.amount < 0), 0) as outflow,
      count(*)::int as n
    from t group by t.class
  )
  select jsonb_build_object(
    'inflow', coalesce((select sum(g.inflow) from g where g.class not in ('transfer', 'opening')), 0)::text,
    'outflow', coalesce((select sum(g.outflow) from g where g.class not in ('transfer', 'opening')), 0)::text,
    'classes', coalesce((select jsonb_agg(jsonb_build_object('class', g.class, 'inflow', g.inflow::text, 'outflow', g.outflow::text, 'count', g.n)
      order by private.cash_class_rank(g.class)) from g), '[]'::jsonb))
  into v_day;

  return jsonb_build_object(
    'today', v_today,
    'month_from', v_month,
    'cash', v_cash -> 'cash',
    'debts', v_top -> 'debts',
    'day', v_day,
    'month', jsonb_build_object(
      'sales', private.money_sales(v_month, v_today, null),
      'purchases', private.money_purchases(v_month, v_today, null),
      'expenses', private.money_expenses(v_month, null),
      'cash', private.money_cash(v_month, v_today)),
    'top_receivable', v_top -> 'top_receivable',
    'top_payable', v_top -> 'top_payable',
    'alerts', jsonb_build_object(
      'negative_boxes', v_cash -> 'negative_boxes',
      'old_receivable', v_top -> 'old_receivable',
      'old_payable', v_top -> 'old_payable'));
end
$$;

-- ─── د. «حركة الأموال» ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- الترتيب بصندوق (on_date, seq) كما في كشف الصندوق، وبلا صندوق (on_date, created_at, account_id, seq)؛ والرصيد الجاري على المدّة
-- المصفّاة كلّها لا على الصفحة؛ والمؤشّر بالمفاتيح نفسها (لا برقم الصفّ: درس 2026-11-09).
create or replace function public.money_moves(p_from date, p_to date, p_account uuid, p_class text, p_party uuid, p_after jsonb, p_limit int)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_to date := coalesce(p_to, public.app_today());
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_running boolean := p_class is null and p_party is null;
  v_box boolean := p_account is not null;
  v_account jsonb;
  v_opening numeric;
  v_after_date date := nullif(p_after ->> 'on_date', '')::date;
  v_after_at timestamptz := nullif(p_after ->> 'created_at', '')::timestamptz;
  v_after_box uuid := nullif(p_after ->> 'account_id', '')::uuid;
  v_after_seq bigint := nullif(p_after ->> 'seq', '')::bigint;
  v_rows jsonb;
  v_next jsonb;
  v_days jsonb;
  v_totals jsonb;
begin
  if not (public.can('accounts.view') and public.can_see_accounts()) then
    raise exception 'forbidden' using hint = 'الحسابات للمالك والمدير والمحاسب فقط.';
  end if;
  if p_from is null or p_from > v_to then
    raise exception 'period_required' using hint = 'حدّد المدّة: من تاريخ إلى تاريخ لا يسبقه.';
  end if;
  if p_class is not null and p_class not in ('customer_receipt', 'cash_sale', 'supplier_payment', 'cash_purchase', 'purchase_charge', 'expense',
    'transfer', 'opening', 'other') then
    raise exception 'class_unknown' using hint = 'نوع الحركة غير معروف. حدّث الشاشة.';
  end if;
  if p_after is not null and (v_after_date is null or v_after_seq is null or (not v_box and (v_after_at is null or v_after_box is null))) then
    raise exception 'cursor_invalid' using hint = 'تعذّر إكمال القائمة. حدّث الشاشة.';
  end if;
  if v_box then
    select jsonb_build_object('id', a.id, 'name', a.name, 'kind', a.kind, 'archived', a.archived_at is not null)
    into v_account from public.cash_accounts a where a.org_id = v_org and a.id = p_account;
    if v_account is null then
      raise exception 'cash_account_not_found' using hint = 'هذا الصندوق غير موجود في منشأتك. حدّث الشاشة.';
    end if;
  end if;
  if p_party is not null and not exists (select 1 from public.parties p where p.org_id = v_org and p.id = p_party) then
    raise exception 'party_not_found' using hint = 'هذه الجهة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if v_running then
    select coalesce(sum(m.amount), 0) into v_opening
    from public.cash_moves m where m.org_id = v_org and (not v_box or m.account_id = p_account) and m.on_date < p_from;
  end if;

  with base as (
    select m.id, m.seq, m.on_date, m.created_at, m.account_id, a.name as account_name, m.amount, m.kind, m.doc_kind, m.doc_id,
      m.party_entry_id, m.reverses_move_id, m.note, private.cash_class(m.kind, m.doc_kind) as class,
      e.party_id, e.doc_no as entry_no, e.reverses_entry_id as entry_reverses,
      case when v_box then null else m.created_at end as k2,
      case when v_box then null else m.account_id end as k3
    from public.cash_moves m
    join public.cash_accounts a on a.org_id = m.org_id and a.id = m.account_id
    left join public.party_entries e on e.org_id = m.org_id and e.id = m.party_entry_id
    where m.org_id = v_org and m.on_date between p_from and v_to and (not v_box or m.account_id = p_account)
  ), f as (
    select b.*,
      case when v_running then v_opening + sum(b.amount) over (order by b.on_date, b.k2, b.k3, b.seq rows between unbounded preceding and current row) end
        as balance
    from base b
    where (p_class is null or b.class = p_class) and (p_party is null or b.party_id = p_party)
  ), page as (
    select f.*, row_number() over (order by f.on_date, f.k2, f.k3, f.seq) as rn
    from f
    where p_after is null or case when v_box then (f.on_date, f.seq) > (v_after_date, v_after_seq)
      else (f.on_date, f.k2, f.k3, f.seq) > (v_after_date, v_after_at, v_after_box, v_after_seq) end
  ), shown as (
    select * from page where rn <= v_limit
  )
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
          'move_id', s.id, 'seq', s.seq::text, 'on_date', s.on_date, 'account_id', s.account_id, 'account_name', s.account_name,
          'class', s.class, 'kind', s.kind, 'doc_kind', s.doc_kind, 'doc_id', s.doc_id,
          'doc_no', coalesce(s.entry_no, case when s.kind = 'receipt_charge' then (
            select r.doc_no from public.receipts r where r.org_id = v_org and r.id = s.doc_id) end),
          'entry_id', s.party_entry_id,
          'voucher', case when s.class in ('customer_receipt', 'supplier_payment') then 'entry' when s.class = 'transfer' then 'transfer' end,
          'voucher_id', case when s.class in ('customer_receipt', 'supplier_payment') then coalesce(s.entry_reverses, s.party_entry_id)
            when s.class = 'transfer' then s.doc_id end,
          'party_id', s.party_id,
          'party_name', (select p.name from public.parties p where p.org_id = v_org and p.id = s.party_id),
          'category', case when s.kind = 'expense' then (
            select c.name from public.expenses x join public.expense_categories c on c.org_id = x.org_id and c.id = x.category_id
            where x.org_id = v_org and x.id = s.doc_id) end,
          'counter_account', case when s.kind = 'transfer' then (
            select a2.name from public.cash_moves m2 join public.cash_accounts a2 on a2.org_id = m2.org_id and a2.id = m2.account_id
            where m2.org_id = v_org and m2.doc_kind = 'cash_transfer' and m2.doc_id = s.doc_id and m2.account_id <> s.account_id
            order by m2.seq limit 1) end,
          'note', s.note,
          'reverses', s.reverses_move_id,
          'reversed', exists (select 1 from public.cash_moves r where r.org_id = v_org and r.reverses_move_id = s.id),
          'inflow', greatest(s.amount, 0)::text, 'outflow', greatest(-s.amount, 0)::text, 'balance', s.balance::text)
        order by s.rn)
      from shown s), '[]'::jsonb),
    (select jsonb_build_object('on_date', l.on_date, 'created_at', l.created_at, 'account_id', l.account_id, 'seq', l.seq::text)
      from page l where l.rn = v_limit and exists (select 1 from page z where z.rn = v_limit + 1)),
    coalesce((
      select jsonb_agg(jsonb_build_object('on_date', d.on_date,
          'inflow', coalesce((select sum(f2.amount) from f f2 where f2.on_date = d.on_date and f2.amount > 0), 0)::text,
          'outflow', coalesce((select -sum(f2.amount) from f f2 where f2.on_date = d.on_date and f2.amount < 0), 0)::text,
          'count', (select count(*) from f f2 where f2.on_date = d.on_date)::int,
          'closing', case when v_running then (v_opening + coalesce((select sum(f2.amount) from f f2 where f2.on_date <= d.on_date), 0))::text end)
        order by d.on_date)
      from (select distinct s.on_date from shown s) as d), '[]'::jsonb),
    (select jsonb_build_object('inflow', coalesce(sum(f.amount) filter (where f.amount > 0), 0)::text,
        'outflow', coalesce(-sum(f.amount) filter (where f.amount < 0), 0)::text, 'count', count(*)::int)
      from f)
  into v_rows, v_next, v_days, v_totals;

  return jsonb_build_object('from', p_from, 'to', v_to, 'account', v_account, 'running', v_running,
    'opening', case when v_running then v_opening::text end,
    'totals', v_totals,
    'closing', case when v_running then (v_opening + (v_totals ->> 'inflow')::numeric - (v_totals ->> 'outflow')::numeric)::text end,
    'days', v_days, 'rows', v_rows, 'next', v_next);
end
$$;

-- ─── هـ. «قائمة الذمم» ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- الجهة في قائمة جهتها إن كان لها رصيد بتلك الجهة في دفتر (الدفاتر لا تُقاصّ في العرض)، والعمر من أقدم قيد مفتوح بالجهة نفسها.
create or replace function public.debts_overview(p_side text, p_division uuid, p_book uuid, p_search text, p_sort text, p_min numeric,
  p_over90 boolean, p_after jsonb, p_limit int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_sign int := case p_side when 'receivable' then 1 when 'payable' then -1 end;
  v_sort text := coalesce(nullif(p_sort, ''), 'amount');
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_text text := nullif(btrim(coalesce(p_search, '')), '');
  v_name text;
  v_digits text;
  v_after_id uuid := nullif(p_after ->> 'id', '')::uuid;
  v_books jsonb;
  v_result jsonb;
begin
  if not (public.can('accounts.view') and public.can_see_accounts()) then
    raise exception 'forbidden' using hint = 'الحسابات للمالك والمدير والمحاسب فقط.';
  end if;
  if v_sign is null then
    raise exception 'side_unknown' using hint = 'اختر: لنا عند الناس، أو علينا للناس.';
  end if;
  if v_sort not in ('amount', 'age', 'name') then
    raise exception 'sort_unknown' using hint = 'الترتيب بالمبلغ أو بالعمر أو بالاسم.';
  end if;
  if p_book is not null and not public.in_scope_book(p_book) then
    raise exception 'out_of_scope' using hint = 'هذا الدفتر خارج نطاقك.';
  end if;
  if p_after is not null and (v_after_id is null or (v_sort = 'amount' and nullif(p_after ->> 'amount', '') is null)
    or (v_sort = 'name' and p_after ->> 'name' is null)) then
    raise exception 'cursor_invalid' using hint = 'تعذّر إكمال القائمة. حدّث الشاشة.';
  end if;
  if v_text is not null then
    v_name := nullif(private.searchable(v_text), '');
    if v_text ~ '^[0-9 +()-]+$' then
      v_digits := nullif(ltrim(regexp_replace(v_text, '[^0-9]', '', 'g'), '0'), '');
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('book_id', b.id, 'division_id', b.division_id, 'division_kind', d.kind, 'code', b.code, 'name', b.name)
      order by d.kind collate "C", b.code collate "C"), '[]'::jsonb)
  into v_books
  from public.ledger_books b join public.divisions d on d.org_id = b.org_id and d.id = b.division_id
  where b.org_id = v_org and b.archived_at is null and public.in_scope_book(b.id)
    and (p_division is null or b.division_id = p_division) and (p_book is null or b.id = p_book);

  with books as (
    select b.id from public.ledger_books b
    where b.org_id = v_org and b.archived_at is null and public.in_scope_book(b.id)
      and (p_division is null or b.division_id = p_division) and (p_book is null or b.id = p_book)
  ), cells as (
    select e.party_id, e.book_id, sum(e.amount) as closing
    from public.party_entries e join books k on k.id = e.book_id
    where e.org_id = v_org and e.on_date <= v_today
    group by e.party_id, e.book_id
  ), side as (
    select c.party_id, sum(greatest(v_sign * c.closing, 0)) as amount,
      jsonb_agg(jsonb_build_object('book_id', c.book_id, 'closing', c.closing::text) order by c.book_id) filter (where c.closing <> 0) as cells
    from cells c group by c.party_id
  ), opn as (
    select o.party_id, o.on_date, o.remaining
    from private.open_entries(null) o join books k on k.id = o.book_id
    where sign(o.amount) = v_sign
  ), listed as (
    select p.id, p.name, p.name_norm, p.phone, p.archived_at, p.version, p.is_customer, p.is_supplier, s.amount, s.cells,
      (select min(o.on_date) from opn o where o.party_id = p.id) as oldest
    from side s join public.parties p on p.org_id = v_org and p.id = s.party_id
    where s.amount > 0 and (p_min is null or s.amount >= p_min)
      and (v_text is null or (v_name is not null and position(v_name in p.name_norm) > 0)
        or (v_digits is not null and position(v_digits in coalesce(p.phone_key, '')) > 0))
  ), filtered as (
    select l.* from listed l where not coalesce(p_over90, false) or v_today - l.oldest > 90
  ), paged as (
    select f.* from filtered f
    where p_after is null or case v_sort
      when 'amount' then f.amount < (p_after ->> 'amount')::numeric or (f.amount = (p_after ->> 'amount')::numeric and f.id > v_after_id)
      when 'age' then case when p_after ->> 'oldest' is null then f.oldest is null and f.id > v_after_id
        else f.oldest > (p_after ->> 'oldest')::date or (f.oldest = (p_after ->> 'oldest')::date and f.id > v_after_id) or f.oldest is null end
      else f.name_norm collate "C" > (p_after ->> 'name') collate "C" or (f.name_norm = (p_after ->> 'name') and f.id > v_after_id)
    end
    order by case when v_sort = 'amount' then f.amount end desc, case when v_sort = 'age' then f.oldest end asc nulls last,
      case when v_sort = 'name' then f.name_norm end collate "C" asc, f.id
    limit v_limit + 1
  ), numbered as (
    select g.*, row_number() over (order by case when v_sort = 'amount' then g.amount end desc, case when v_sort = 'age' then g.oldest end asc nulls last,
      case when v_sort = 'name' then g.name_norm end collate "C" asc, g.id) as rn
    from paged g
  )
  select jsonb_build_object(
    'side', p_side, 'today', v_today, 'books', v_books,
    'totals', jsonb_build_object(
      'amount', coalesce((select sum(f.amount) from filtered f), 0)::text,
      'parties', (select count(*) from filtered)::int,
      'aging', (select jsonb_build_object(
          'd0_30', coalesce(sum(o.remaining) filter (where v_today - o.on_date <= 30), 0)::text,
          'd31_60', coalesce(sum(o.remaining) filter (where v_today - o.on_date between 31 and 60), 0)::text,
          'd61_90', coalesce(sum(o.remaining) filter (where v_today - o.on_date between 61 and 90), 0)::text,
          'd91_plus', coalesce(sum(o.remaining) filter (where v_today - o.on_date > 90), 0)::text)
        from opn o where o.party_id in (select f.id from filtered f))),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('party_id', g.id, 'name', g.name, 'name_norm', g.name_norm, 'phone', g.phone,
          'archived', g.archived_at is not null, 'version', g.version, 'is_customer', g.is_customer, 'is_supplier', g.is_supplier,
          'amount', g.amount::text, 'cells', coalesce(g.cells, '[]'::jsonb), 'oldest', g.oldest, 'age_days', v_today - g.oldest,
          'aging', (select jsonb_build_object(
              'd0_30', coalesce(sum(o.remaining) filter (where v_today - o.on_date <= 30), 0)::text,
              'd31_60', coalesce(sum(o.remaining) filter (where v_today - o.on_date between 31 and 60), 0)::text,
              'd61_90', coalesce(sum(o.remaining) filter (where v_today - o.on_date between 61 and 90), 0)::text,
              'd91_plus', coalesce(sum(o.remaining) filter (where v_today - o.on_date > 90), 0)::text)
            from opn o where o.party_id = g.id),
          'last_move', (select jsonb_build_object('on_date', e.on_date, 'kind', e.kind, 'doc_no', e.doc_no)
            from public.party_entries e join books k on k.id = e.book_id
            where e.org_id = v_org and e.party_id = g.id and e.on_date <= v_today
            order by e.on_date desc, e.created_at desc, e.seq desc limit 1),
          'last_settlement', (select jsonb_build_object('on_date', e.on_date, 'amount', abs(e.amount)::text, 'doc_no', e.doc_no, 'entry_id', e.id)
            from public.party_entries e join books k on k.id = e.book_id
            where e.org_id = v_org and e.party_id = g.id and e.on_date <= v_today and e.kind = case when v_sign = 1 then 'payment' else 'payout' end
              and e.reverses_entry_id is null
              and not exists (select 1 from public.party_entries r where r.org_id = e.org_id and r.reverses_entry_id = e.id)
            order by e.on_date desc, e.created_at desc, e.seq desc limit 1))
        order by g.rn)
      from numbered g where g.rn <= v_limit), '[]'::jsonb),
    'next', (select jsonb_build_object('id', g.id, 'amount', g.amount::text, 'oldest', g.oldest, 'name', g.name_norm)
      from numbered g where g.rn = v_limit and exists (select 1 from numbered z where z.rn = v_limit + 1)))
  into v_result;
  return v_result;
end
$$;

-- ─── و. كشف الحساب الاحترافي ──────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.party_statement_v2(p_party uuid, p_book uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_to date := coalesce(p_to, public.app_today());
  v_party jsonb;
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
  return jsonb_build_object(
    'org', (select jsonb_build_object('name', o.name) from public.orgs o where o.id = v_org),
    'party', v_party, 'from', p_from, 'to', v_to, 'today', v_today,
    'books', coalesce((
      select jsonb_agg(jsonb_build_object(
          'book_id', b.id, 'code', b.code, 'name', b.name, 'division_id', b.division_id, 'division_kind', d.kind,
          'brought_forward', s.bf::text, 'total_debit', s.debit::text, 'total_credit', s.credit::text, 'closing', (s.bf + s.debit - s.credit)::text,
          'lines', s.lines, 'open_items', s.open_items, 'aging', s.aging)
        order by d.kind collate "C", b.code collate "C")
      from public.ledger_books b
      join public.divisions d on d.org_id = b.org_id and d.id = b.division_id
      cross join lateral (
        select x.bf, x.debit, x.credit,
          coalesce((
            select jsonb_agg(jsonb_build_object('entry_id', l.id, 'seq', l.seq::text, 'on_date', l.on_date, 'kind', l.kind,
                'doc_kind', l.doc_kind, 'doc_id', l.doc_id, 'doc_no', l.doc_no, 'reason', l.reason, 'reverses', l.reverses_entry_id,
                'reversed', l.reversed, 'debit', greatest(l.amount, 0)::text, 'credit', greatest(-l.amount, 0)::text, 'balance', l.balance::text,
                'account', l.account,
                'voucher_id', case when l.kind in ('payment', 'payout') and l.doc_kind is null then coalesce(l.reverses_entry_id, l.id) end,
                'detail', private.entry_detail(l.id), 'allocations', private.entry_allocations(l.id),
                'unallocated', coalesce(private.entry_remaining(l.id), 0)::text)
              order by l.on_date, l.seq)
            from (
              select e.*, exists (select 1 from public.party_entries r where r.org_id = e.org_id and r.reverses_entry_id = e.id) as reversed,
                (select jsonb_build_object('id', a.id, 'name', a.name) from public.cash_moves m
                 join public.cash_accounts a on a.org_id = m.org_id and a.id = m.account_id
                 where m.org_id = e.org_id and m.party_entry_id = e.id order by m.seq limit 1) as account,
                x.bf + sum(e.amount) over (order by e.on_date, e.seq rows between unbounded preceding and current row) as balance
              from public.party_entries e
              where e.org_id = v_org and e.party_id = p_party and e.book_id = b.id and e.on_date between p_from and v_to
            ) as l), '[]'::jsonb) as lines,
          coalesce((
            select jsonb_agg(jsonb_build_object('entry_id', o.entry_id, 'on_date', o.on_date, 'kind', o.kind, 'doc_kind', o.doc_kind, 'doc_id', o.doc_id,
                'doc_no', o.doc_no, 'amount', abs(o.amount)::text, 'settled', (abs(o.amount) - o.remaining)::text, 'remaining', o.remaining::text,
                'age_days', v_today - o.on_date, 'side', case when o.amount > 0 then 'debit' else 'credit' end)
              order by o.on_date, o.seq)
            from private.open_entries(p_party) o where o.party_id = p_party and o.book_id = b.id), '[]'::jsonb) as open_items,
          (select jsonb_build_object(
              'side', case when y.now_closing > 0 then 'debit' when y.now_closing < 0 then 'credit' end,
              'd0_30', coalesce(sum(o.remaining) filter (where v_today - o.on_date <= 30), 0)::text,
              'd31_60', coalesce(sum(o.remaining) filter (where v_today - o.on_date between 31 and 60), 0)::text,
              'd61_90', coalesce(sum(o.remaining) filter (where v_today - o.on_date between 61 and 90), 0)::text,
              'd91_plus', coalesce(sum(o.remaining) filter (where v_today - o.on_date > 90), 0)::text)
            from (select coalesce(sum(z.amount), 0) as now_closing from public.party_entries z
                  where z.org_id = v_org and z.party_id = p_party and z.book_id = b.id and z.on_date <= v_today) as y
            left join private.open_entries(p_party) o on o.party_id = p_party and o.book_id = b.id and sign(o.amount) = sign(y.now_closing)
            group by y.now_closing) as aging
        from (
          select
            coalesce((select sum(e.amount) from public.party_entries e where e.org_id = v_org and e.party_id = p_party and e.book_id = b.id
              and e.on_date < p_from), 0) as bf,
            coalesce((select sum(e.amount) from public.party_entries e where e.org_id = v_org and e.party_id = p_party and e.book_id = b.id
              and e.on_date between p_from and v_to and e.amount > 0), 0) as debit,
            coalesce((select -sum(e.amount) from public.party_entries e where e.org_id = v_org and e.party_id = p_party and e.book_id = b.id
              and e.on_date between p_from and v_to and e.amount < 0), 0) as credit
        ) as x
      ) as s
      where b.org_id = v_org and b.archived_at is null and public.in_scope_book(b.id)
        and (b.id = p_book or (p_book is null and exists (
          select 1 from public.party_entries e where e.org_id = v_org and e.party_id = p_party and e.book_id = b.id)))
    ), '[]'::jsonb));
end
$$;

-- ─── ز. السندات ────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.voucher_detail(p_entry uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  e public.party_entries;
  r public.party_entries;
begin
  if not (public.can('accounts.view') and public.can_see_accounts()) then
    raise exception 'forbidden' using hint = 'الحسابات للمالك والمدير والمحاسب فقط.';
  end if;
  select * into e from public.party_entries where org_id = v_org and id = p_entry;
  if e.id is null then
    raise exception 'entry_not_found' using hint = 'هذا السند غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if e.reverses_entry_id is not null then
    select * into e from public.party_entries where org_id = v_org and id = e.reverses_entry_id;
  end if;
  if e.kind not in ('payment', 'payout') or e.doc_kind is not null then
    raise exception 'not_a_voucher' using hint = 'هذا القيد ليس سند قبض ولا سند صرف؛ يُفتح من مستنده.';
  end if;
  if not public.in_scope_book(e.book_id) then
    raise exception 'out_of_scope' using hint = 'هذا الدفتر خارج نطاقك.';
  end if;
  select * into r from public.party_entries where org_id = v_org and reverses_entry_id = e.id;
  return jsonb_build_object(
    'org', (select jsonb_build_object('name', o.name) from public.orgs o where o.id = v_org),
    'entry_id', e.id, 'type', case e.kind when 'payment' then 'receipt' else 'payment' end, 'doc_no', e.doc_no, 'on_date', e.on_date,
    'party', (select jsonb_build_object('id', p.id, 'name', p.name, 'phone', p.phone) from public.parties p where p.org_id = v_org and p.id = e.party_id),
    'book', (select jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name, 'division_kind', d.kind)
      from public.ledger_books b join public.divisions d on d.org_id = b.org_id and d.id = b.division_id where b.org_id = v_org and b.id = e.book_id),
    'amount', abs(e.amount)::text,
    'account', (select jsonb_build_object('id', a.id, 'name', a.name, 'kind', a.kind)
      from public.cash_moves m join public.cash_accounts a on a.org_id = m.org_id and a.id = m.account_id
      where m.org_id = v_org and m.party_entry_id = e.id order by m.seq limit 1),
    'allocations', private.entry_allocations(e.id),
    'unallocated', coalesce(private.entry_remaining(e.id), 0)::text,
    'posted_by', private.member_name(e.created_by), 'posted_at', e.created_at,
    'void', case when r.id is not null then jsonb_build_object('on_date', r.on_date, 'reason', r.reason, 'by', private.member_name(r.created_by)) end);
end
$$;

create or replace function public.transfer_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  m public.cash_moves;
  t public.cash_moves;
  r public.cash_moves;
begin
  if not (public.can('accounts.view') and public.can_see_accounts()) then
    raise exception 'forbidden' using hint = 'الحسابات للمالك والمدير والمحاسب فقط.';
  end if;
  -- التحويل: ساقه الخارجة بمعرّف التحويل نفسه (transfer_cash، 0006)، والداخلة بالمستند نفسه في الصندوق الآخر.
  select * into m from public.cash_moves
  where org_id = v_org and id = p_id and kind = 'transfer' and doc_kind = 'cash_transfer' and doc_id = p_id and reverses_move_id is null;
  if m.id is null then
    raise exception 'transfer_not_found' using hint = 'هذا التحويل غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  select * into t from public.cash_moves
  where org_id = v_org and doc_kind = 'cash_transfer' and doc_id = p_id and id <> p_id and reverses_move_id is null
  order by seq limit 1;
  select * into r from public.cash_moves where org_id = v_org and reverses_move_id = m.id;
  return jsonb_build_object(
    'org', (select jsonb_build_object('name', o.name) from public.orgs o where o.id = v_org),
    'id', m.id, 'on_date', m.on_date,
    'from', (select jsonb_build_object('id', a.id, 'name', a.name, 'kind', a.kind) from public.cash_accounts a where a.org_id = v_org and a.id = m.account_id),
    'to', (select jsonb_build_object('id', a.id, 'name', a.name, 'kind', a.kind) from public.cash_accounts a where a.org_id = v_org and a.id = t.account_id),
    'amount', (-m.amount)::text, 'note', m.note,
    'posted_by', private.member_name(m.created_by), 'posted_at', m.created_at,
    'void', case when r.id is not null then jsonb_build_object('on_date', r.on_date, 'reason', r.note, 'by', private.member_name(r.created_by)) end);
end
$$;

-- ─── ح. «خلاصة الشهر التشغيلية» ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.month_summary(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_month date := date_trunc('month', p_month)::date;
  v_to date;
begin
  if not (public.can('accounts.view') and public.can_see_accounts()) then
    raise exception 'forbidden' using hint = 'الحسابات للمالك والمدير والمحاسب فقط.';
  end if;
  if p_month is null or v_month > date_trunc('month', v_today)::date then
    raise exception 'month_required' using hint = 'اختر شهراً لا يتجاوز الشهر الحالي.';
  end if;
  v_to := least((v_month + interval '1 month' - interval '1 day')::date, v_today);
  return jsonb_build_object('month', v_month, 'from', v_month, 'to', v_to,
    'project', jsonb_build_object(
      'sales', private.money_sales(v_month, v_to, null),
      'purchases', private.money_purchases(v_month, v_to, null),
      'expenses', private.money_expenses(v_month, null),
      'production', private.money_production(v_month, v_to, null),
      'feed_issue', private.money_flock_issue(v_month, v_to, null)),
    'divisions', coalesce((
      select jsonb_agg(jsonb_build_object('division_id', d.id, 'kind', d.kind,
          'sales', private.money_sales(v_month, v_to, d.id),
          'purchases', private.money_purchases(v_month, v_to, d.id),
          'expenses', private.money_expenses(v_month, d.id),
          'production', private.money_production(v_month, v_to, d.id),
          'feed_issue', private.money_flock_issue(v_month, v_to, d.id))
        order by d.kind collate "C")
      from public.divisions d
      where d.org_id = v_org and d.archived_at is null
        and (exists (select 1 from public.ledger_books k where k.org_id = d.org_id and k.division_id = d.id and k.archived_at is null
              and public.in_scope_book(k.id))
          or exists (select 1 from public.warehouses w where w.org_id = d.org_id and w.division_id = d.id and public.in_scope_wh(w.id)))), '[]'::jsonb),
    'cash', private.money_cash(v_month, v_to));
end
$$;

-- ─── ط. الرئيسية: بطاقة الحسابات تزيد النقد كلّه (cash_total) — الباقي كما في 0008 حرفاً بحرف ──────────────────────────────
create or replace function public.home_summary() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_out jsonb := '{}'::jsonb;
begin
  if v_org is null then
    return v_out;
  end if;
  if public.can_see_accounts() then
    v_out := v_out || jsonb_build_object('accounts', (
      select jsonb_build_object('receivable', coalesce(sum(greatest(x.balance, 0)), 0)::text, 'payable', coalesce(sum(greatest(-x.balance, 0)), 0)::text,
        'negative_boxes', (select count(*) from (
          select m.account_id from public.cash_moves m where m.org_id = v_org group by m.account_id having sum(m.amount) < 0) as n),
        'cash_total', (select coalesce(sum(m.amount), 0) from public.cash_moves m where m.org_id = v_org and m.on_date <= v_today)::text,
        'books', jsonb_build_object(
          'visible', (select count(*) from public.ledger_books b where b.org_id = v_org and b.archived_at is null and public.in_scope_book(b.id)),
          'total', (select count(*) from public.ledger_books b where b.org_id = v_org and b.archived_at is null)))
      from (
        select sum(e.amount) as balance from public.party_entries e
        where e.org_id = v_org and e.on_date <= v_today and public.in_scope_book(e.book_id)
        group by e.party_id, e.book_id
      ) as x));
  end if;
  v_out := v_out || jsonb_build_object('stock', coalesce((
    select jsonb_agg(jsonb_build_object('division_id', d.id, 'kind', d.kind,
        'below_min', (
          select count(*) from public.items i
          where i.org_id = v_org and i.min_qty is not null and i.archived_at is null
            and exists (select 1 from public.warehouses w where w.org_id = v_org and w.division_id = d.id and w.archived_at is null
              and w.kind = any (private.receiving_kinds(i.kind)) and public.in_scope_wh(w.id))
            and coalesce((
              select sum(x.qty_left) from public.stock_lots x join public.warehouses y on y.org_id = x.org_id and y.id = x.warehouse_id
              where x.org_id = v_org and x.item_id = i.id and x.qty_left > 0 and y.kind = any (private.receiving_kinds(i.kind))
                and not private.lot_expired(i.tracks_expiry, x.expiry_on, v_today)
            ), 0) < i.min_qty),
        'near_expiry', (
          select count(distinct x.item_id) from public.stock_lots x
          join public.warehouses w on w.org_id = x.org_id and w.id = x.warehouse_id
          join public.items i on i.org_id = x.org_id and i.id = x.item_id
          where x.org_id = v_org and w.division_id = d.id and public.in_scope_wh(w.id) and x.qty_left > 0 and i.tracks_expiry
            and x.expiry_on >= v_today and x.expiry_on <= v_today + 30),
        'old_chicks', (
          select coalesce(sum(x.qty_left), 0)::bigint from public.stock_lots x
          join public.warehouses w on w.org_id = x.org_id and w.id = x.warehouse_id
          join public.items i on i.org_id = x.org_id and i.id = x.item_id
          where x.org_id = v_org and w.division_id = d.id and public.in_scope_wh(w.id) and x.qty_left > 0 and i.kind = 'chick'
            and x.born_at is not null and x.born_at <= now() - interval '48 hours'))
      order by d.kind collate "C")
    from public.divisions d
    where d.org_id = v_org and d.archived_at is null
      and exists (select 1 from public.warehouses w where w.org_id = v_org and w.division_id = d.id and public.in_scope_wh(w.id))
  ), '[]'::jsonb));
  if public.can('count.approve') or public.can('expired.release') then
    v_out := v_out || jsonb_build_object('approvals', jsonb_build_object(
      'counts', case when public.can('count.approve') then (
        select count(*) from public.stock_counts c where c.org_id = v_org and c.status = 'submitted' and public.in_scope_wh(c.warehouse_id)) else 0 end,
      'uses', (
        select count(*) from public.stock_uses u
        left join public.expense_categories c on c.org_id = u.org_id and c.id = u.category_id
        where u.org_id = v_org and u.status = 'draft' and public.in_scope_wh(u.warehouse_id)
          and ((c.system_code = 'expired_destroy' and public.can('expired.destroy'))
            or (coalesce(c.system_code, '') <> 'expired_destroy' and public.can('expired.release')
              and exists (select 1 from public.stock_use_lines l where l.org_id = u.org_id and l.doc_id = u.id and l.lot_id is not null))))));
  end if;
  return v_out;
end
$$;

-- ─── ي. الجهات: أمين المخزن يضيف زبوناً أو مورّداً (جواب المالك 2026-11-08، #58) — الباقي كما في 0006 حرفاً بحرف ─────────────
create or replace function private.parties_check() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_book text;
begin
  new.name_norm := private.searchable(new.name);
  new.phone := nullif(btrim(new.phone), '');
  new.phone_key := private.phone_key(new.phone);
  if tg_op = 'INSERT' and auth.uid() is not null and not public.can('parties.manage') and not (new.is_customer or new.is_supplier) then
    raise exception 'forbidden' using hint = 'يضيف أمين المخزن زبوناً أو مورّداً؛ اختر أحدهما. وتعديل الجهات للمحاسب أو المدير.';
  end if;
  if tg_op = 'UPDATE' and new.archived_at is not null and old.archived_at is null then
    set local lock_timeout = '5s';
    perform pg_advisory_xact_lock(hashtextextended('party:' || new.id::text, 0));
    select b.name into v_book
    from public.party_entries e join public.ledger_books b on b.org_id = e.org_id and b.id = e.book_id
    where e.org_id = new.org_id and e.party_id = new.id
    group by b.id, b.name having sum(e.amount) <> 0
    order by b.name collate "C" limit 1;
    if v_book is not null then
      raise exception 'archived_in_use' using hint = format('للجهة «%s» رصيد في «%s»، فلا تُؤرشف حتى تُسوّى أرصدتها في كل الدفاتر.', new.name, v_book);
    end if;
  end if;
  return new;
end
$$;

-- ─── ك. الثوابت ────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- open_both_sides: لا جهة بدفتر فيها قيد مفتوح «عليه» وقيد مفتوح «له» معاً (التوزيع التلقائي يقاصّهما)، فأعمار القائمة = رصيدها.
-- *_detail_total: تفصيل كلّ مستند في الكشف = مبلغ قيده (الموادّ − الخصم للشراء، والسطور للبيع، والمرتجع، والأجرة لجهتها).
-- voucher_numbers: كلّ قبض أو دفع بسند برقم RC أو PY وحركة صندوق واحدة.
-- money_formulas (الخطّة §8.1، كما report_formulas في verify_ledger): «خلاصة المال» و«قائمة الذمم» = المعادلة من الصفوف الخام، لكلّ
--   منشأة بها قيود أو حركات، بهويّة مالك حيّ منها (لا نطاق له)؛ والهويّة ترجع كما كانت بالآخر.
create or replace function public.verify_money() returns table (check_name text, violations bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_bad bigint := 0;
  v_org record;
  v_user uuid;
  v_over jsonb;
  v_recv jsonb;
  v_pay jsonb;
begin
  return query
  with rem as (
    select e.org_id, e.party_id, e.book_id, e.amount, abs(e.amount) - coalesce((
      select sum(a.amount) from public.party_allocations a
      where a.org_id = e.org_id and a.party_id = e.party_id and a.book_id = e.book_id
        and ((e.amount > 0 and a.debit_entry_id = e.id) or (e.amount < 0 and a.credit_entry_id = e.id))
    ), 0) as remaining
    from public.party_entries e
  )
  select 'open_both_sides'::text, count(*) from (
    select r.org_id, r.party_id, r.book_id from rem r where r.remaining > 0
    group by r.org_id, r.party_id, r.book_id having bool_or(r.amount > 0) and bool_or(r.amount < 0)) as x
  union all
  select 'purchase_detail_total', count(*) from public.party_entries e
  join public.receipts d on d.org_id = e.org_id and d.id = e.doc_id
  where e.doc_kind = 'receipt' and e.kind = 'purchase' and e.reverses_entry_id is null and e.party_id = d.party_id
    and not exists (select 1 from public.receipt_charges c where c.org_id = e.org_id and c.party_entry_id = e.id)
    and -e.amount <> coalesce((select sum(la.line_total) from public.receipt_line_amounts la where la.org_id = d.org_id and la.doc_id = d.id), 0)
      - coalesce((select ra.discount from public.receipt_amounts ra where ra.org_id = d.org_id and ra.doc_id = d.id), 0)
  union all
  select 'sale_detail_total', count(*) from public.sales_invoices s
  join public.party_entries e on e.org_id = s.org_id and e.id = s.invoice_entry_id
  where e.amount <> coalesce((select sum(l.line_total) from public.sales_lines l where l.org_id = s.org_id and l.sale_id = s.id), 0)
  union all
  select 'return_detail_total', count(*) from public.party_entries e
  join public.supplier_returns r on r.org_id = e.org_id and r.id = e.doc_id
  where e.doc_kind = 'supplier_return' and e.kind = 'supplier_return' and e.reverses_entry_id is null
    and e.amount <> coalesce((select sum(la.credit_amount) from public.supplier_return_line_amounts la where la.org_id = r.org_id and la.doc_id = r.id), 0)
  union all
  select 'charge_entry_total', count(*) from public.receipt_charges c
  join public.party_entries e on e.org_id = c.org_id and e.id = c.party_entry_id
  where e.amount <> -c.amount or e.party_id is distinct from c.payee_party_id
  union all
  select 'voucher_numbers', count(*) from public.party_entries e
  where e.kind in ('payment', 'payout') and e.doc_kind is null
    and (e.doc_no is null or e.doc_no !~ case when e.kind = 'payment' then '^RC-' else '^PY-' end
      or (select count(*) from public.cash_moves m where m.org_id = e.org_id and m.party_entry_id = e.id) <> 1);

  for v_org in select x.org_id from (select org_id from public.party_entries union select org_id from public.cash_moves) as x order by 1 loop
    select m.user_id into v_user from public.members m
    where m.org_id = v_org.org_id and m.role = 'owner' and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
    order by m.created_at, m.id limit 1;
    continue when v_user is null;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    begin
      v_over := public.money_overview();
      v_recv := public.debts_overview('receivable', null, null, null, 'amount', null, false, null, 1);
      v_pay := public.debts_overview('payable', null, null, null, 'amount', null, false, null, 1);
      v_bad := v_bad + (
        case when (v_over -> 'cash' ->> 'total')::numeric is distinct from coalesce((select sum(m.amount) from public.cash_moves m
          where m.org_id = v_org.org_id and m.on_date <= public.app_today()), 0) then 1 else 0 end
      ) + (
        select count(*) from public.cash_accounts a
        cross join lateral (select coalesce(sum(m.amount), 0) as bal from public.cash_moves m
          where m.org_id = a.org_id and m.account_id = a.id and m.on_date <= public.app_today()) as raw
        left join lateral (select x from jsonb_array_elements(v_over -> 'cash' -> 'boxes') as x where x ->> 'account_id' = a.id::text) as rep on true
        where a.org_id = v_org.org_id and (a.archived_at is null or raw.bal <> 0)
          and (rep.x is null or (rep.x ->> 'balance')::numeric is distinct from raw.bal)
      ) + (
        select case when (v_over -> 'debts' ->> 'receivable')::numeric is distinct from coalesce(sum(greatest(s.balance, 0)), 0)
          or (v_over -> 'debts' ->> 'payable')::numeric is distinct from coalesce(sum(greatest(-s.balance, 0)), 0) then 1 else 0 end
        from (
          select sum(e.amount) as balance from public.party_entries e join public.ledger_books b on b.org_id = e.org_id and b.id = e.book_id
          where e.org_id = v_org.org_id and b.archived_at is null and e.on_date <= public.app_today()
          group by e.party_id, e.book_id
        ) as s
      ) + (
        case when (v_recv -> 'totals' ->> 'amount')::numeric is distinct from (v_over -> 'debts' ->> 'receivable')::numeric
          or (v_pay -> 'totals' ->> 'amount')::numeric is distinct from (v_over -> 'debts' ->> 'payable')::numeric
          or (select sum((v_recv -> 'totals' -> 'aging' ->> k)::numeric) from unnest(array['d0_30', 'd31_60', 'd61_90', 'd91_plus']) as k)
            is distinct from (v_recv -> 'totals' ->> 'amount')::numeric
          or (select sum((v_pay -> 'totals' -> 'aging' ->> k)::numeric) from unnest(array['d0_30', 'd31_60', 'd61_90', 'd91_plus']) as k)
            is distinct from (v_pay -> 'totals' ->> 'amount')::numeric
        then 1 else 0 end
      );
    exception when others then
      v_bad := v_bad + 1;
    end;
  end loop;
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  return query select 'money_formulas'::text, v_bad;
end
$$;

-- ─── ل. الصلاحيات ─────────────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.money_overview(), public.money_moves(date, date, uuid, text, uuid, jsonb, integer),
  public.debts_overview(text, uuid, uuid, text, text, numeric, boolean, jsonb, integer), public.party_statement_v2(uuid, uuid, date, date),
  public.voucher_detail(uuid), public.transfer_detail(uuid), public.month_summary(date) from public, anon;
grant execute on function public.money_overview(), public.money_moves(date, date, uuid, text, uuid, jsonb, integer),
  public.debts_overview(text, uuid, uuid, text, text, numeric, boolean, jsonb, integer), public.party_statement_v2(uuid, uuid, date, date),
  public.voucher_detail(uuid), public.transfer_detail(uuid), public.month_summary(date) to authenticated;
revoke all on function public.verify_money() from public, anon, authenticated;
grant execute on function public.verify_money() to service_role;
