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
-- ودالّة عمل واحدة لتلميحها (مراجعة 0034 L2): public.production_form بلا مخزن موادّ أوّلية فعّال كانت تقول «خارج نطاقك… اطلب من مالك المنشأة
--   تعديل نطاقك»، والسبب الآن أنّ المعمل بلا مخزن موادّ فعّال، فالتلميح يقوله ويدلّ على إعداد المخزن (الجسم كما هو).
-- يبقى للمالك وحده: members.manage (add_member وadd_member_v2 وinvite_code وarchive_member وset_member_role وset_member_scopes وset_member_scopes_v2).
-- ويبقى كما هو: جدول member_scopes وكتّابه (للمالك، ولا يحدّ شيئاً بعد اليوم)، وcheck_role، وkeep_an_owner، وأسماء الأدوار الثمانية (الدور اسم عمل يرتّب
--   أزرار الرئيسية فقط)، والسياسات كلّها، وstrip_money لنتيجة الإغلاق في flock_cycle_report، وhalls_history بلا مال (تقريران يُرسلان). وما بين المنشآت كما
--   كان: شيء منشأة أخرى خارج النطاق أو غير موجود.
-- تراجع: rollback_0034.sql — يرجّع الدوالّ العشر بأجسامها السابقة حرفاً بحرف (role_can من 0022، وcan_see_cost وcan_see_accounts وcan_see_sales وrequire
--   من 0001، وin_scope_division من 0002، وin_scope_site وin_scope_wh وscope_touches_division من 0005، وproduction_form من 0025). بلا طريق رفض: لا جدول ولا عمود ولا قيد تغيّر،
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

-- ─── د. شاشة الإنتاج: السبب الحقيقيّ حين لا مخزن موادّ ──────────────────────────────────────────────────────────────────────
-- production_form (جسم 0025 حرفاً إلّا التلميح): بلا مخزن موادّ أوّلية فعّال في المنشأة كان يقول «مخازن موادّ المعمل خارج نطاقك… اطلب من مالك المنشأة
-- تعديل نطاقك»، وبعد 0034 لا نطاق يحدّ أحداً، فالسبب الوحيد الباقي أنّ المعمل بلا مخزن موادّ فعّال (مؤرشف أو لم يُنشأ)، والعلاج إضافته (مراجعة 0034 L2).
-- الرمز forbidden كما كان (الشاشة تعرض التلميح).
create or replace function public.production_form(p_recipe uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  r public.recipes;
  cur public.recipe_versions;
  v_bare boolean;
  v_last uuid;
  v_wo uuid;
begin
  perform private.require('production.draft');
  if not exists (select 1 from public.warehouses w where w.org_id = v_org and w.kind = 'raw' and w.archived_at is null and public.in_scope_wh(w.id)) then
    raise exception 'forbidden' using hint = 'لا يوجد مخزن موادّ أوّلية فعّال في المعمل: أضفه من إعداد المخزن ثمّ أنتج.';
  end if;
  select * into r from public.recipes where org_id = v_org and id = p_recipe;
  if r.id is null then
    raise exception 'recipe_not_found' using hint = 'هذه الخلطة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  select * into cur from public.recipe_versions where org_id = v_org and recipe_id = r.id and status = 'active';
  v_bare := cur.id is not null and not exists (select 1 from public.recipe_lines l where l.org_id = v_org and l.version_id = cur.id and l.qty is not null);
  -- آخر دفعة مرحَّلة للخلطة بأيّ نسخة، ممّا يقرؤه المنتج (أحد طرفيها بنطاقه، كسياسة قراءة الدفعة)، بتعريف لوحة المعمل نفسه.
  v_last := private.last_posted_batch(r.id);
  v_wo := private.feed_balance_wh();
  return jsonb_build_object(
    'today', public.app_today(),
    'recipe', jsonb_build_object('id', r.id, 'name', r.name, 'archived', r.archived_at is not null,
      'output_item', (select jsonb_build_object('id', i.id, 'name', i.name, 'tracks_expiry', i.tracks_expiry) from public.items i where i.org_id = v_org and i.id = r.output_item_id)),
    'active', case when cur.id is null then null else jsonb_build_object('id', cur.id, 'version_no', cur.version_no, 'materials_only', v_bare) end,
    'materials', case when cur.id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
        'line_no', l.line_no, 'item_id', l.item_id, 'name', i.name, 'kind', i.kind, 'base_unit', i.base_unit,
        'density', case when i.base_unit = 'L' then round(i.density_kg_per_l, 4)::text end, 'archived', i.archived_at is not null,
        'in_basis', i.kind not in ('fuel', 'packaging'), 'scale_step', i.scale_step::text,
        'default_qty', coalesce(q.last_qty, q.recipe_qty)::text,
        'default_source', case when q.last_qty is not null then 'last' when q.recipe_qty is not null then 'recipe' end)
        order by l.line_no)
      from public.recipe_lines l
      join public.items i on i.org_id = l.org_id and i.id = l.item_id
      cross join lateral (select
        (select sum(coalesce(p.actual_qty_base, p.planned_qty_base)) from public.production_inputs p
          where p.org_id = l.org_id and p.batch_id = v_last and p.item_id = l.item_id and p.base_unit = i.base_unit) as last_qty,
        case when v_bare or l.qty is null then null
          when l.unit = i.base_unit then l.qty
          when l.unit = 'kg' and i.base_unit = 'L' and coalesce(l.density_kg_per_l, i.density_kg_per_l) > 0
            then private.kg_to_liters(l.qty, coalesce(l.density_kg_per_l, i.density_kg_per_l))
          when l.unit = 'L' and i.base_unit = 'kg' and l.density_kg_per_l > 0 then private.liters_to_kg(l.qty, l.density_kg_per_l)
        end as recipe_qty) as q
      where l.org_id = v_org and l.version_id = cur.id), '[]'::jsonb) end,
    'last', (select jsonb_build_object('id', b.id, 'doc_no', b.doc_no, 'produced_on', b.produced_on, 'output_kg', b.output_qty_kg::text,
        'input_mass_kg', b.input_mass_kg::text,
        'extra_items', coalesce((select jsonb_agg(jsonb_build_object('item_id', p.item_id, 'name', i.name) order by p.line_no)
          from public.production_inputs p join public.items i on i.org_id = p.org_id and i.id = p.item_id
          where p.org_id = b.org_id and p.batch_id = b.id and i.archived_at is null
            and not exists (select 1 from public.recipe_lines l where l.org_id = p.org_id and l.version_id = cur.id and l.item_id = p.item_id)), '[]'::jsonb))
      from public.production_batches b where b.org_id = v_org and b.id = v_last),
    'stores', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name) order by w.name collate "C", w.id)
      from public.warehouses w where w.org_id = v_org and w.kind = 'raw' and w.archived_at is null and public.in_scope_wh(w.id)), '[]'::jsonb),
    'output_store', (select jsonb_build_object('id', w.id, 'name', w.name) from public.warehouses w where w.org_id = v_org and w.id = v_wo),
    'can_edit_recipe', public.can('recipe.activate'),
    'draft_exists', exists (select 1 from public.recipe_versions x where x.org_id = v_org and x.recipe_id = r.id and x.status = 'draft'));
end
$$;
