-- 0018_no_go_live — بلا يوم تشغيل: يوم تشغيل الوحدة لا يحكم تاريخ أيّ مستند (كلمة المالك 2026-11-06: «ما النا علاقة بيوم التشغيل
--   خليها من دون يوم التشغيل»؛ DECISIONS «بلا يوم تشغيل»).
-- المشكلة: أوّل شراء حقيقي للمالك (ذرة، 0017 بالإنتاج) رُفض no_go_live لأنّ «معمل العلف» بلا يوم تشغيل؛ وحقول اللحم يومها 2026-11-30
--   فكلّ مستند فيها قبله يُرفض before_go_live؛ والرصيد الافتتاحي لا يُكتب بعد يوم التشغيل ولا بلاه (after_go_live وno_go_live)،
--   وافتتاح الصندوق مشروط بيوم تشغيل أقدم وحدة. مفهوم لا يعرفه المالك يوقف عمله اليوميّ.
-- هنا (أجسام الدوالّ الخمس من الهجرة الوحيدة التي عرّفتها، بحذف فروع يوم التشغيل وحدها):
--   • private.check_post_date: قفل الفترة للمشاركة، وقاعدة 0001 (لا مستقبل، ولا أقدم من 7 أيام، ولا فترة مقفولة)، وصفّ الوحدة قبل أوّل
--     ترحيلها (division_for_post: يُختم first_posted_at بأوّل ترحيل، وset_division_go_live يقفل الصفّ نفسه) — بلا no_go_live ولا before_go_live.
--   • private.check_opening_date: التاريخ مطلوب، ولا مستقبل، ولا فترة مقفولة، ومستثنى من حدّ الأيام السبعة، وصفّ الوحدة — بلا no_go_live
--     ولا after_go_live.
--   • public.record_cash_opening: القاعدة نفسها (مطلوب، لا مستقبل، لا فترة مقفولة) بلا شرط «يوم تشغيل أقدم وحدة».
--   • private.date_problem (المعاينات): القواعد الباقية نفسها بلا مشاكل يوم التشغيل.
--   • public.verify_stores: بلا first_post_without_go_live (الترحيل بلا يوم تشغيل صار جائزاً)، والفحوص الباقية حرفاً.
-- باقٍ كما هو: set_division_go_live (لا تناديه الشاشات بعد الآن، ولا يضرّ)، وعمود go_live_on وقيمه في الإنتاج (لا تُقرأ)، والرموز الثلاثة
--   في private.raise_problem (لا تُنتَج). لا خطوة بيانات.
-- تراجع: rollback_0018.sql — يرجّع الأجسام الخمسة كما في 0005 و0006 و0007 حرفاً بحرف. **طريق رفض**: وحدة رُحّل فيها بلا يوم تشغيل، أو
--   مستند عاديّ مؤرَّخ قبل يوم تشغيل وحدته، أو رصيد افتتاحي بعده (أو بلا يوم تشغيل، أو صندوق بعد أقدم يوم تشغيل): كلّ واحد يوقف التراجع
--   بصوت بلا أن يغيّر شيئاً، لأنّ القواعد القديمة ترفض هذا الواقع (والأوّل يُفشل verify_stores القديم).
-- تنعاد بأمان: create or replace.

set lock_timeout = '5s';

-- ─── أ. تاريخ المستند العاديّ ─────────────────────────────────────────────────────────────────────────────────────
create or replace function private.check_post_date(p_date date, p_division uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.period_guard();
  perform private.check_doc_date(p_date);
  perform private.division_for_post(p_division);
end
$$;

-- ─── ب. تاريخ الرصيد الافتتاحي (FOUNDATION ٥٢١: مستثنى من حدّ الأيام السبعة) ───────────────────────────────────────────
create or replace function private.check_opening_date(p_date date, p_division uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lock date;
begin
  perform private.period_guard();
  if p_date is null then
    raise exception 'date_required' using hint = 'اكتب التاريخ.';
  end if;
  perform private.division_for_post(p_division);
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

-- ─── ج. الرصيد الافتتاحي للصندوق (Q10): واحد فعّال لكلّ صندوق، بتاريخ ماضٍ خارج الفترة المقفلة ─────────────────────────
create or replace function public.record_cash_opening(p_id uuid, p_account uuid, p_amount numeric, p_on_date date, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'record_cash_opening';
  v_cached jsonb;
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

-- ─── د. مشكلة التاريخ للمعاينة: قواعد check_post_date وcheck_opening_date أعلاه نفسها، أوّل مشكلة أو null ───────────────────
create or replace function private.date_problem(p_date date, p_division uuid, p_opening boolean) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_today date := public.app_today();
  v_lock date;
begin
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
  return null;
end
$$;

-- ─── هـ. ثوابت المخازن بلا فحص يوم التشغيل ─────────────────────────────────────────────────────────────────────────
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
