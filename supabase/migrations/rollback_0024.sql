-- rollback_0024 — تراجع 0024_money_overview («المال بين يديك»؛ مشغّل التراجع بالحزمة FOUNDATION ٨٢٠، ٨٧٦). يُسقط القرّاء الجدد
-- (money_overview وmoney_moves وdebts_overview وparty_statement_v2 وvoucher_detail وtransfer_detail وmonth_summary) ومساعداتهم
-- وverify_money، ويرجّع home_summary كما في 0008 وprivate.parties_check وreport_cash_statement كما في 0006 حرفاً بحرف (md5 نفسه بالكتالوج).
-- بلا طريق رفض: 0024 لا يكتب شيئاً إلا ما يقبله القديم؛ والزبائن الذين أضافهم أمين المخزن جهات عاديّة تبقى (القاعدة القديمة
-- تفحص الإضافة وحدها، فلا ترفض صفّاً قائماً).
-- تنعاد بأمان: drop if exists، وcreate or replace.

set lock_timeout = '5s';

drop function if exists public.verify_money();
drop function if exists public.month_summary(date);
drop function if exists public.transfer_detail(uuid);
drop function if exists public.voucher_detail(uuid);
drop function if exists public.party_statement_v2(uuid, uuid, date, date);
drop function if exists public.debts_overview(text, uuid, uuid, text, text, numeric, boolean, jsonb, integer);
drop function if exists public.money_moves(date, date, uuid, text, uuid, jsonb, integer);
drop function if exists public.money_overview();
drop function if exists private.money_flock_issue(date, date, uuid);
drop function if exists private.money_production(date, date, uuid);
drop function if exists private.money_cash(date, date);
drop function if exists private.money_expenses(date, uuid);
drop function if exists private.money_purchases(date, date, uuid);
drop function if exists private.money_sales(date, date, uuid);
drop function if exists private.entry_detail(uuid);
drop function if exists private.member_name(uuid);
drop function if exists private.entry_allocations(uuid);
drop function if exists private.open_entries(uuid);
drop function if exists private.cash_class_rank(text);
drop function if exists private.cash_class(text, text);

-- كما في 0008:
create or replace function public.home_summary() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_out jsonb := '{}'::jsonb;
begin
  -- بلا منشأة ماكو أرقام: ملخّص فارغ (مثل find_item_twins)، مو رفض.
  if v_org is null then
    return v_out;
  end if;
  if public.can_see_accounts() then
    v_out := v_out || jsonb_build_object('accounts', (
      select jsonb_build_object('receivable', coalesce(sum(greatest(x.balance, 0)), 0)::text, 'payable', coalesce(sum(greatest(-x.balance, 0)), 0)::text,
        -- الصناديق بالسالب (Q10: السالب مسموح ويّا تنبيه ظاهر بالبطاقة).
        'negative_boxes', (select count(*) from (
          select m.account_id from public.cash_moves m where m.org_id = v_org group by m.account_id having sum(m.amount) < 0) as n),
        -- القارئ المحصور (E49): «لنا» و«علينا» من دفاتر نطاقه بس، فالبطاقة تكتب «N من المجموع» مثل صفحة الحسابات.
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


-- كما في 0006:
create or replace function private.parties_check() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_book text;
begin
  new.name_norm := private.searchable(new.name);
  new.phone := nullif(btrim(new.phone), '');
  new.phone_key := private.phone_key(new.phone);
  if tg_op = 'INSERT' and auth.uid() is not null and not public.can('parties.manage') and (new.is_customer or not new.is_supplier) then
    raise exception 'forbidden' using hint = 'يضيف أمين المخزن مورّداً فقط؛ الزبائن وتعديل الجهات للمحاسب أو المدير.';
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

-- كما في 0006:
create or replace function public.report_cash_statement(p_account uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_to date := coalesce(p_to, public.app_today());
  v_account jsonb;
  v_bf numeric;
begin
  if not (public.can('accounts.view') and public.can_see_accounts()) then
    raise exception 'forbidden' using hint = 'الحسابات للمالك والمدير والمحاسب فقط.';
  end if;
  if p_from is null or p_from > v_to then
    raise exception 'period_required' using hint = 'حدّد المدّة: من تاريخ إلى تاريخ لا يسبقه.';
  end if;
  select jsonb_build_object('id', a.id, 'name', a.name, 'kind', a.kind, 'archived', a.archived_at is not null, 'version', a.version)
  into v_account from public.cash_accounts a where a.org_id = v_org and a.id = p_account;
  if v_account is null then
    raise exception 'cash_account_not_found' using hint = 'هذا الصندوق غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  select coalesce(sum(m.amount), 0) into v_bf from public.cash_moves m where m.org_id = v_org and m.account_id = p_account and m.on_date < p_from;
  return jsonb_build_object('account', v_account, 'from', p_from, 'to', v_to, 'brought_forward', v_bf::text,
    'total_in', coalesce((select sum(m.amount) from public.cash_moves m where m.org_id = v_org and m.account_id = p_account and m.on_date between p_from and v_to and m.amount > 0), 0)::text,
    'total_out', coalesce((select -sum(m.amount) from public.cash_moves m where m.org_id = v_org and m.account_id = p_account and m.on_date between p_from and v_to and m.amount < 0), 0)::text,
    'closing', (v_bf + coalesce((select sum(m.amount) from public.cash_moves m where m.org_id = v_org and m.account_id = p_account and m.on_date between p_from and v_to), 0))::text,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object('move_id', l.id, 'on_date', l.on_date, 'seq', l.seq::text, 'kind', l.kind, 'doc_kind', l.doc_kind, 'doc_id', l.doc_id,
          'doc_no', l.doc_no, 'party', l.party_name, 'note', l.note, 'reverses', l.reverses_move_id, 'reversed', l.reversed,
          'inflow', greatest(l.amount, 0)::text, 'outflow', greatest(-l.amount, 0)::text, 'balance', l.balance::text)
        order by l.on_date, l.seq)
      from (
        select m.*, e.doc_no, p.name as party_name,
          exists (select 1 from public.cash_moves r where r.org_id = m.org_id and r.reverses_move_id = m.id) as reversed,
          v_bf + sum(m.amount) over (order by m.on_date, m.seq rows between unbounded preceding and current row) as balance
        from public.cash_moves m
        left join public.party_entries e on e.org_id = m.org_id and e.id = m.party_entry_id
        left join public.parties p on p.org_id = e.org_id and p.id = e.party_id
        where m.org_id = v_org and m.account_id = p_account and m.on_date between p_from and v_to
      ) as l
    ), '[]'::jsonb));
end
$$;

