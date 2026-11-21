-- 0034_everyone_owner — «الكلّ مثل المالك بكلّ شيء»، المرحلة ٠ من «القاعة كالورقة» (كلمة المالك 2026-11-21 وأجوبته؛ docs/HALLS_SHEET_PLAN.md §٥،
--   والعقد docs/plans/0034/contract-0034.md الجزء أ؛ DECISIONS 2026-11-21).
-- المشكلة: الأدوار الثمانية تحدّ ما يفعله العضو وما يراه: عامل القاعة لا يصرف علفاً ولا يغلق وجبة، والأمين لا يرى الكلفة ولا يرحّل الاستلام، والمحاسب
--   لا يلغي، ومشغّل المعمل ينتظر ختم الكلف، والنطاق (member_scopes) يحصر العضو بوحدة أو حقل أو مخزن. والمالك قال: «الكلّ يقدر يضيف ويعدّل ويفعل أيّ
--   شيء»، ولمّا سُئل «لكلّ النظام أو للقاعات والمخزن؟» قال: «الكلّ مثل المالك بكلّ شيء». فكلّ عضو فعّال يفعل كلّ الأفعال ويرى الكلفة والأرباح
--   والصناديق والحسابات والمبيعات، في المنشأة كلّها بلا نطاق.
-- هنا تُعاد كتابة دوالّ الهويّة وحدها (لا سياسة ولا دالّة عمل تقارن الأدوار مباشرةً؛ كلّها تمرّ بهذه، فرفعها يرفع كلّ شيء، وأصناف catalog.test كما هي):
--   • private.role_can: كلّ فعل لكلّ عضو فعّال إلّا members.manage فللمالك وحده؛ والفعل المجهول يرمي unknown_action كما كان، وبلا دور لا فعل. التوقيع
--     وimmutable وافتراض p_costs_confirmed = false كما هي، والمعامل لم يعد يغيّر شيئاً (مشغّل المعمل يرحّل كغيره). party.offset وperiod.unlock للكلّ.
--   • public.can_see_cost وpublic.can_see_accounts (بجسم واحد حرفاً، catalog.test) وpublic.can_see_sales: لكلّ عضو فعّال.
--   • public.in_scope_division وpublic.in_scope_site وpublic.in_scope_wh وprivate.scope_touches_division: لكلّ عضو فعّال بحساب حيّ (account_live) والشيء
--     في منشأته؛ صفوف member_scopes لا تُقرأ. وin_scope_book يتبع in_scope_division بلا تغيير.
--   • private.require: تلميح forbidden لم يبقَ له إلّا سببان: من ليس عضواً فعّالاً في منشأة، وإدارة الأعضاء لغير المالك.
-- يبقى للمالك وحده: members.manage (add_member وadd_member_v2 وinvite_code وarchive_member وset_member_role وset_member_scopes وset_member_scopes_v2).
-- ويبقى كما هو: جدول member_scopes وكتّابه (للمالك، ولا يحدّ شيئاً بعد اليوم)، وcheck_role، وkeep_an_owner، وأسماء الأدوار الثمانية (الدور اسم عمل يرتّب
--   أزرار الرئيسية فقط)، والسياسات كلّها، وstrip_money لنتيجة الإغلاق في flock_cycle_report، وhalls_history بلا مال (تقريران يُرسلان). وما بين المنشآت كما
--   كان: شيء منشأة أخرى خارج النطاق أو غير موجود.
-- تراجع: rollback_0034.sql — يرجّع الدوالّ التسع بأجسامها السابقة حرفاً بحرف (role_can من 0022، وcan_see_cost وcan_see_accounts وcan_see_sales وrequire
--   من 0001، وin_scope_division من 0002، وin_scope_site وin_scope_wh وscope_touches_division من 0005). بلا طريق رفض: لا جدول ولا عمود ولا قيد تغيّر،
--   وما كتبه أيّ عضو بعد 0034 صحيح بقواعد ما قبلها (القيود والثوابت لا تعرف الأدوار)؛ يعود فقط من لا يملك فعلاً ممنوعاً منه.
-- تنعاد بأمان: create or replace وحده.

set lock_timeout = '5s';

-- ─── أ. الأفعال: كلّها لكلّ عضو فعّال، وإدارة الأعضاء للمالك ──────────────────────────────────────────────────────────
-- مرآة can() في src/domain/permissions.ts. الفعل المجهول يرمي حتى لا يصير غلط إملائيّ «ممنوعاً» بصمت.
create or replace function private.role_can(p_role text, p_action text, p_costs_confirmed boolean default false) returns boolean
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
begin
  if p_action is null or not (p_action = any (private.actions())) then
    raise exception 'unknown_action' using hint = case
      when p_action is null then 'لم يُحدَّد الإجراء.'
      else format('الإجراء «%s» غير معروف.', p_action)
    end;
  end if;
  if p_role is null then return false; end if;
  -- «الكلّ مثل المالك بكلّ شيء» (كلمة المالك 2026-11-21): إدارة الأعضاء وحدها تبقى للمالك.
  if p_action = 'members.manage' then return p_role = 'owner'; end if;
  return true;
end
$$;

-- الرفض بسبب الفعل برمز forbidden (مو 42501، اللي الطابور يعدّه رفض هويّة)، وتلميحه بأحد السببين الباقيين.
create or replace function private.require(p_action text) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.can(p_action) then
    raise exception 'forbidden' using hint = case
      when private.my_role() is null then 'لست عضواً فعّالاً في منشأة.'
      else 'إضافة الموظفين وحذفهم وتغيير أدوارهم لمالك المنشأة فقط.'
    end;
  end if;
end
$$;

-- ─── ب. المال: الكلفة والحسابات والمبيعات لكلّ عضو فعّال ─────────────────────────────────────────────────────────────
-- can_see_cost وcan_see_accounts بجسم واحد حرفاً: سجلّ التدقيق يحمل قيود الجهات والصناديق تحت سياسة الكلفة (catalog.test).
create or replace function public.can_see_cost() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(private.my_role() is not null, false)
$$;

create or replace function public.can_see_accounts() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(private.my_role() is not null, false)
$$;

create or replace function public.can_see_sales() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(private.my_role() is not null, false)
$$;

-- ─── ج. النطاق: المنشأة كلّها لكلّ عضو فعّال ─────────────────────────────────────────────────────────────────────────
-- الشيء في منشأة العضو والعضو فعّال بحساب حيّ؛ صفوف member_scopes لا تُقرأ. شيء منشأة أخرى أو غير موجود = false كما كان.
create or replace function public.in_scope_division(p_division uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.members m
    join public.divisions d on d.org_id = m.org_id and d.id = p_division
    where m.user_id = auth.uid() and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
  )
$$;

create or replace function public.in_scope_site(p_site uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.members m
    join public.sites x on x.org_id = m.org_id and x.id = p_site
    where m.user_id = auth.uid() and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
  )
$$;

create or replace function public.in_scope_wh(p_warehouse uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.members m
    join public.warehouses w on w.org_id = m.org_id and w.id = p_warehouse
    where m.user_id = auth.uid() and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
  )
$$;

-- للتنقّل (my_workspace().divisions): كلّ وحدة في منشأة العضو.
create or replace function private.scope_touches_division(p_division uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.members m
    join public.divisions d on d.org_id = m.org_id and d.id = p_division
    where m.user_id = auth.uid() and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
  )
$$;
