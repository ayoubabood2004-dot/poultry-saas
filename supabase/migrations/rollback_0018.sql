-- rollback_0018 — تراجع 0018_no_go_live (بلا يوم تشغيل؛ مشغّل التراجع بالحزمة FOUNDATION ٨٢٠، ٨٧٦). يرجّع أجسام private.check_post_date
-- وprivate.check_opening_date وpublic.record_cash_opening (كما في 0006) وprivate.date_problem (كما في 0007) وpublic.verify_stores (كما في
-- 0005) حرفاً بحرف (md5 نفسه بالكتالوج)، فيعود يوم التشغيل شرطاً لكلّ ترحيل وافتتاح.
-- **طريق رفض (الكتلة أدناه):** القواعد القديمة ترفض واقعاً كتبته 0018، فالملف يرفض نفسه بصوت بلا أن يغيّر شيئاً إن وُجد:
--   ١) وحدة رُحّل فيها (first_posted_at) بلا يوم تشغيل: verify_stores القديم يعدّها خرقاً (first_post_without_go_live)؛
--   ٢) مستند عاديّ (حركة مخزون غير افتتاح، أو قيد جهة غير افتتاح، أو مصروف) أصليّ مؤرَّخ قبل يوم تشغيل وحدته: before_go_live قديماً؛
--   ٣) رصيد افتتاحي أصليّ (مخزون أو جهة) بعد يوم تشغيل وحدته أو بوحدة بلا يوم، أو افتتاح صندوق بعد أقدم يوم تشغيل أو بلا يوم تشغيل
--      أصلاً: after_go_live وno_go_live قديماً.
-- والحلّ قبل التراجع: يحدّد المدير يوم تشغيل يناسب ما رُحّل (أو يُلغى المستند)، ثمّ يُعاد التراجع. الفروع الثلاثة منفصلة حتّى يُفحص كلّ
-- واحد وحده. الجداول تُقفل للمشاركة قبل العدّ ولحدّ نهاية المعاملة (درس WP4)، فلا يُرحَّل شيء أثناءه.
-- تنعاد بأمان: create or replace.

set lock_timeout = '5s';

lock table public.divisions, public.stock_moves, public.party_entries, public.expenses, public.cash_moves in share mode;

-- ٠) طريق الرفض.
do $$
declare
  v_unset bigint;
  v_early bigint;
  v_late bigint;
begin
  select count(*) into v_unset from public.divisions d where d.first_posted_at is not null and d.go_live_on is null;
  select (
      select count(*) from public.stock_moves m
      join public.warehouses w on w.org_id = m.org_id and w.id = m.warehouse_id
      join public.divisions d on d.org_id = w.org_id and d.id = w.division_id
      where m.doc_kind <> 'opening' and m.reverses_move_id is null and m.moved_on < d.go_live_on
    ) + (
      select count(*) from public.party_entries e
      join public.ledger_books b on b.org_id = e.org_id and b.id = e.book_id
      join public.divisions d on d.org_id = b.org_id and d.id = b.division_id
      where e.kind <> 'opening' and e.reverses_entry_id is null and e.on_date < d.go_live_on
    ) + (
      select count(*) from public.expenses x
      join public.divisions d on d.org_id = x.org_id and d.id = x.division_id
      where x.reverses_id is null and x.on_date < d.go_live_on
    ) into v_early;
  select (
      select count(*) from public.stock_moves m
      join public.warehouses w on w.org_id = m.org_id and w.id = m.warehouse_id
      join public.divisions d on d.org_id = w.org_id and d.id = w.division_id
      where m.doc_kind = 'opening' and m.reverses_move_id is null and (d.go_live_on is null or m.moved_on > d.go_live_on)
    ) + (
      select count(*) from public.party_entries e
      join public.ledger_books b on b.org_id = e.org_id and b.id = e.book_id
      join public.divisions d on d.org_id = b.org_id and d.id = b.division_id
      where e.kind = 'opening' and e.reverses_entry_id is null and (d.go_live_on is null or e.on_date > d.go_live_on)
    ) + (
      select count(*) from public.cash_moves c
      where c.kind = 'opening' and c.reverses_move_id is null
        and coalesce(c.on_date > (select min(d.go_live_on) from public.divisions d where d.org_id = c.org_id and d.archived_at is null), true)
    ) into v_late;
  if v_unset > 0 then
    raise exception 'rollback_blocked'
      using hint = format('في القاعدة %s وحدة رُحّل فيها بلا يوم تشغيل، والقواعد القديمة (verify_stores) تعدّها خرقاً. حدّد يوم تشغيلها أوّلاً ثمّ أعد التراجع.', v_unset);
  end if;
  if v_early > 0 then
    raise exception 'rollback_blocked'
      using hint = format('في القاعدة %s مستنداً عادياً مؤرَّخاً قبل يوم تشغيل وحدته، والقواعد القديمة ترفضه (before_go_live). اضبط يوم التشغيل أو ألغِ المستند ثمّ أعد التراجع.', v_early);
  end if;
  if v_late > 0 then
    raise exception 'rollback_blocked'
      using hint = format('في القاعدة %s رصيداً افتتاحياً بعد يوم تشغيل وحدته أو بلا يوم تشغيل، والقواعد القديمة ترفضه (after_go_live وno_go_live). اضبط يوم التشغيل أو ألغِ الافتتاح ثمّ أعد التراجع.', v_late);
  end if;
end
$$;

-- ١) تاريخ المستند العاديّ كما في 0006_parties_ledger_cash.sql حرفاً بحرف:
create or replace function private.check_post_date(p_date date, p_division uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d public.divisions;
begin
  perform private.period_guard();
  perform private.check_doc_date(p_date);
  d := private.division_for_post(p_division);
  if d.go_live_on is null then
    raise exception 'no_go_live' using hint = format('لم يُحدَّد يوم تشغيل «%s» بعد، فلا يُرحَّل فيها شيء. يحدّده المدير من إعدادات المنشأة.', d.name);
  end if;
  if p_date < d.go_live_on then
    raise exception 'before_go_live' using hint = format('يوم تشغيل «%s» هو %s، والتاريخ %s قبله. ما قبل التشغيل يُسجَّل رصيداً افتتاحياً.',
      d.name, to_char(d.go_live_on, 'DD/MM/YYYY'), to_char(p_date, 'DD/MM/YYYY'));
  end if;
end
$$;

-- ٢) تاريخ الافتتاح كما في 0006_parties_ledger_cash.sql حرفاً بحرف:
create or replace function private.check_opening_date(p_date date, p_division uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d public.divisions;
  v_lock date;
begin
  perform private.period_guard();
  if p_date is null then
    raise exception 'date_required' using hint = 'اكتب التاريخ.';
  end if;
  d := private.division_for_post(p_division);
  if d.go_live_on is null then
    raise exception 'no_go_live' using hint = format('لم يُحدَّد يوم تشغيل «%s» بعد، والرصيد الافتتاحي يُسجَّل بيوم التشغيل أو قبله. يحدّده المدير من إعدادات المنشأة.', d.name);
  end if;
  if p_date > d.go_live_on then
    raise exception 'after_go_live' using hint = format('الرصيد الافتتاحي لـ«%s» يُسجَّل بيوم تشغيلها %s أو قبله، والتاريخ %s بعده. ما بعد التشغيل يُسجَّل بمستنده.',
      d.name, to_char(d.go_live_on, 'DD/MM/YYYY'), to_char(p_date, 'DD/MM/YYYY'));
  end if;
  if p_date > public.app_today() then
    raise exception 'date_in_future' using hint = format('التاريخ %s بعد تاريخ اليوم %s.', to_char(p_date, 'DD/MM/YYYY'), to_char(public.app_today(), 'DD/MM/YYYY'));
  end if;
  select l.locked_through into v_lock from public.period_locks l where l.org_id = public.auth_org();
  if v_lock is not null and p_date <= v_lock then
    raise exception 'period_locked' using hint = format('الحسابات مقفلة حتى %s، فلا يُسجَّل رصيد افتتاحي بتاريخ %s. إن كان ضرورياً فاطلب من مالك المنشأة فتح الفترة.',
      to_char(v_lock, 'DD/MM/YYYY'), to_char(p_date, 'DD/MM/YYYY'));
  end if;
end
$$;

-- ٣) افتتاح الصندوق كما في 0006_parties_ledger_cash.sql حرفاً بحرف:
create or replace function public.record_cash_opening(p_id uuid, p_account uuid, p_amount numeric, p_on_date date, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'record_cash_opening';
  v_cached jsonb;
  v_first date;
  v_lock date;
  a public.cash_accounts;
  m public.cash_moves;
begin
  set local lock_timeout = '5s';
  perform private.require('opening.post');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'account', p_account, 'amount', p_amount, 'on_date', p_on_date));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.check_new_id(p_id);
  if p_account is null then
    raise exception 'cash_account_required' using hint = 'اختر الصندوق.';
  end if;
  perform private.check_amount(p_amount, false);
  perform private.period_guard();
  if p_on_date is null then
    raise exception 'date_required' using hint = 'اكتب التاريخ.';
  end if;
  select min(d.go_live_on) into v_first from public.divisions d where d.org_id = public.auth_org() and d.archived_at is null;
  if v_first is null then
    raise exception 'no_go_live' using hint = 'لم يُحدَّد يوم تشغيل أيّ وحدة بعد، والرصيد الافتتاحي للصندوق يُسجَّل بيوم التشغيل أو قبله.';
  end if;
  if p_on_date > v_first then
    raise exception 'after_go_live' using hint = format('الرصيد الافتتاحي للصندوق يُسجَّل بيوم تشغيل أقدم وحدة %s أو قبله.', to_char(v_first, 'DD/MM/YYYY'));
  end if;
  if p_on_date > public.app_today() then
    raise exception 'date_in_future' using hint = format('التاريخ %s بعد تاريخ اليوم %s.', to_char(p_on_date, 'DD/MM/YYYY'), to_char(public.app_today(), 'DD/MM/YYYY'));
  end if;
  select l.locked_through into v_lock from public.period_locks l where l.org_id = public.auth_org();
  if v_lock is not null and p_on_date <= v_lock then
    raise exception 'period_locked' using hint = format('الحسابات مقفلة حتى %s، فلا يُسجَّل رصيد افتتاحي بتاريخ %s.', to_char(v_lock, 'DD/MM/YYYY'), to_char(p_on_date, 'DD/MM/YYYY'));
  end if;
  a := private.lock_cash_account(p_account, true);
  if exists (
    select 1 from public.cash_moves o where o.org_id = a.org_id and o.account_id = a.id and o.kind = 'opening' and o.reverses_move_id is null
      and not exists (select 1 from public.cash_moves r where r.org_id = o.org_id and r.reverses_move_id = o.id)
  ) then
    raise exception 'opening_exists' using hint = format('للصندوق «%s» رصيد افتتاحي فعّال. ألغِه أوّلاً إن كان خاطئاً، ثم سجّل الصحيح.', a.name);
  end if;
  m := private.write_cash_move(a.id, p_amount, 'opening', null, null, null, p_on_date, null, null, p_id);
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', m.id, 'kind', m.kind, 'account_id', m.account_id, 'on_date', m.on_date,
    'money', jsonb_build_object('amount', m.amount::text)));
end
$$;

-- ٤) مشكلة التاريخ للمعاينة كما في 0007_stock_core_openings_transfers.sql حرفاً بحرف:
create or replace function private.date_problem(p_date date, p_division uuid, p_opening boolean) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d public.divisions;
  v_today date := public.app_today();
  v_lock date;
begin
  select * into d from public.divisions where org_id = public.auth_org() and id = p_division;
  select l.locked_through into v_lock from public.period_locks l where l.org_id = public.auth_org();
  if p_date is null then
    return jsonb_build_object('code', 'date_required', 'hint', 'اكتب التاريخ.');
  end if;
  if p_date > v_today then
    return jsonb_build_object('code', 'date_in_future', 'hint', format('التاريخ %s بعد تاريخ اليوم %s.', to_char(p_date, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY')));
  end if;
  if not p_opening and p_date < v_today - 7 then
    return jsonb_build_object('code', 'date_too_old', 'hint', format('لا يُقبل تاريخ أقدم من 7 أيام؛ أقدم تاريخ مسموح به %s.', to_char(v_today - 7, 'DD/MM/YYYY')));
  end if;
  if v_lock is not null and p_date <= v_lock then
    return jsonb_build_object('code', 'period_locked', 'hint', format('الحسابات مقفلة حتى %s، فلا يُسجَّل مستند بتاريخ %s.', to_char(v_lock, 'DD/MM/YYYY'), to_char(p_date, 'DD/MM/YYYY')));
  end if;
  if d.go_live_on is null then
    return jsonb_build_object('code', 'no_go_live', 'hint', format('لم يُحدَّد يوم تشغيل «%s» بعد. يحدّده المدير من إعدادات المنشأة.', d.name));
  end if;
  if p_opening and p_date > d.go_live_on then
    return jsonb_build_object('code', 'after_go_live', 'hint', format('الرصيد الافتتاحي لـ«%s» يُسجَّل بيوم تشغيلها %s أو قبله.', d.name, to_char(d.go_live_on, 'DD/MM/YYYY')));
  end if;
  if not p_opening and p_date < d.go_live_on then
    return jsonb_build_object('code', 'before_go_live', 'hint', format('يوم تشغيل «%s» هو %s، والتاريخ %s قبله.', d.name, to_char(d.go_live_on, 'DD/MM/YYYY'), to_char(p_date, 'DD/MM/YYYY')));
  end if;
  return null;
end
$$;

-- ٥) ثوابت المخازن كما في 0005_scopes_stores_items.sql حرفاً بحرف:
create or replace function public.verify_stores() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select 'site_division_kind', count(*) from public.sites s
  join public.divisions d on d.org_id = s.org_id and d.id = s.division_id
  where s.kind is distinct from private.site_kind_for(d.kind)
  union all
  select 'warehouse_division_kind', count(*) from public.warehouses w
  join public.divisions d on d.org_id = w.org_id and d.id = w.division_id
  where not private.warehouse_kind_allowed(d.kind, w.kind)
  union all
  select 'active_store_on_archived_site', count(*) from public.warehouses w
  join public.sites s on s.org_id = w.org_id and s.id = w.site_id
  where w.archived_at is null and s.archived_at is not null
  union all
  select 'table_egg_per_site', count(*) from (
    select w.site_id from public.warehouses w where w.kind = 'table_egg' and w.archived_at is null group by w.org_id, w.site_id having count(*) > 1
  ) as x
  union all
  select 'item_normalized', count(*) from public.items i
  where i.name_norm is distinct from private.searchable(i.name)
    or i.barcode is distinct from nullif(private.normalize_code(i.barcode), '')
    or exists (select 1 from unnest(i.alt_codes) as c where c is distinct from private.normalize_code(c) or c = '' or c = i.barcode)
  union all
  select 'item_code_collisions', count(*) from (
    select i.org_id, c from public.items i cross join unnest(array_prepend(i.barcode, i.alt_codes)) as c
    where i.archived_at is null and c is not null group by i.org_id, c having count(*) > 1
  ) as x
  union all
  select 'item_unit_pack', count(*) from public.item_units u
  join public.items i on i.org_id = u.org_id and i.id = u.item_id
  join public.pack_types p on p.org_id = u.org_id and p.id = u.pack_type_id
  where p.factor <> u.factor_to_base or p.dimension <> case i.base_unit when 'kg' then 'mass' when 'L' then 'volume' else 'count' end
  union all
  select 'item_unit_pieces', count(*) from public.item_units u
  join public.items i on i.org_id = u.org_id and i.id = u.item_id
  where i.base_unit = 'pc' and u.factor_to_base <> trunc(u.factor_to_base)
  union all
  select 'item_unit_defaults', count(*) from (
    select u.item_id from public.item_units u where u.is_default and u.archived_at is null group by u.org_id, u.item_id having count(*) > 1
  ) as x
  union all
  select 'member_scope_targets', count(*) from public.member_scopes s where num_nonnulls(s.division_id, s.site_id, s.warehouse_id) <> 1
  union all
  select 'first_post_without_go_live', count(*) from public.divisions d where d.first_posted_at is not null and d.go_live_on is null
  union all
  select 'org_default_seeds', count(*) from public.orgs o
  where (select count(*) from public.expense_categories e where e.org_id = o.id and e.system_code in
          ('expired_destroy', 'count_diff', 'purchase_price_diff', 'supplier_return_diff', 'voided_receipt')) <> 5
    or not exists (select 1 from public.pack_types p where p.org_id = o.id)
    or exists (
      select 1 from public.divisions d
      where d.org_id = o.id and d.kind in ('feed_mill', 'hatchery', 'medicine', 'general')
        and not exists (select 1 from public.sites s where s.org_id = o.id and s.division_id = d.id)
    )
$$;
