-- 0022_day_balance — «الرصيد اليومي» في المخزن: جدول تصنيف بيوم واحد كدفتر المالك، وملاحظة لكلّ مادّة في كلّ يوم، وترتيب موادّ التصنيف
--   (كلمة المالك 2026-11-09 مع صورة جدوله «رصيد مواد العلف — 4/11/2026»: «اريد… بجانب ترتيب البطاقات… خيار ثاني الي هو رصيد مواد العلف
--   اليومي… اكدر اسوي تصنيفات بالمخزن… يكدر يختار ادراج المواد… والتاريخ مال يوم هذا شكد اكو رصيد بالكيلو… يحرك بالايام عن طريق سهمين…
--   وهمين وياه قائمة الملاحظات»؛ وأجوبته: «اترك مال اسبوع والشهر»، والملاحظة «لكلّ يوم»؛ DECISIONS «الرصيد اليومي»).
-- المشكلة: المالك يمسك رصيد مواد العلف يوماً بيوم في إكسل ويرسله لغيره؛ والنظام يعرض بطاقة لكلّ مادّة وملفّها، بلا جدول يجمع موادّ تصنيف بيوم
--   واحد، ولا تنقّل بالأيام، ولا ملاحظة لليوم، ولا ترتيب يختاره هو للموادّ.
-- هنا:
--   • فعل stock_note.write (ملاحظة الرصيد اليومي) لمن يعمل في المخازن: الأمين ومشغّلا المعمل والمفقس، والمدير كلّها، والمالك (مرآته
--     src/domain/permissions.ts).
--   • public.stock_day_notes: ملاحظة واحدة لكلّ (مادّة، يوم) بالمنشأة كلّها، تكتبها public.set_day_note وحدها (مشروطة بالنسخة التي رآها الكاتب،
--     والإعادة بالحال نفسه نتيجتها بلا رفض، والفارغة تمسح ملاحظة ذلك اليوم). ليست حركة مخزون ولا سطر مال.
--   • public.item_categories.item_order: ترتيب موادّ التصنيف كما اختاره المدير، تكتبه public.set_category_items (stores.manage) مع category_id
--     للموادّ بمعاملة واحدة: المُدرَجة تدخل التصنيف (ولو من تصنيف آخر)، والظاهرة التي أُخرجت منه بلا تصنيف. مصفوفة بلا مفتاح أجنبيّ:
--     مادّة حُذفت أو خرجت تبقى معرّفاً لا يُرسم، فلا يحتاج الحذف أن يعرفها.
--   • public.day_balance (read): لكلّ مادّة ظاهرة في التصنيف (أو كلّ الموادّ) رصيدها آخر يوم p_on = Σ كميات حركاتها بتاريخه أو قبله في المخزن
--     المختار أو في كلّ مخازن نطاقك — الرصيد الجاري نفسه الذي يُظهره دفتر المادّة (item_moves_qty) ذلك اليوم، والعكسيات بيومها — وملاحظة
--     اليوم، ومعها اليوم وقائمة التصنيفات والمخازن وما يملكه الدور. لا مال فيه.
--   • private.item_uses: ملاحظات الأيام استعمال («لها ملاحظات يومية»)، فـ«احذف» يُخفي المادّة وتبقى ملاحظاتها.
-- انحرافات مكتوبة (قرارات بلا سؤال داخل الخطوط الحمر، والعقد scratchpad/daybal/contract-0022.md):
--   • رصيد اليوم برصيد الدفتر الجاري (لا «رصيد الجرد» count_balance_at الذي يُسقط المستند الملغى من تاريخه): الجدول يطابق دفتر المادّة الذي
--     يُفتح منه، والغلط وعكسه يظهران كلٌّ بيومه كما في الدفتر.
--   • لا يوم في المستقبل (day_in_future) للجدول وللملاحظة؛ والماضي كلّه مفتوح.
--   • مخازن «كلّ المخازن» = كلّ مخزن بنطاقك ولو مؤرشفاً (رصيد الماضي فيه رصيد)؛ وقائمة الاختيار المخازن الظاهرة وحدها.
-- تراجع: rollback_0022.sql — يرجّع private.actions وprivate.role_can وprivate.item_uses كما في 0020 حرفاً بحرف، ويُسقط الدوالّ الثلاث وجدول
--   الملاحظات وعمود الترتيب. **طريق رفض**: ملاحظة يومية واحدة مكتوبة توقف التراجع بصوت بلا أن يحذف شيئاً (إسقاط الجدول يضيعها).
-- تنعاد بأمان: create table if not exists، وadd column if not exists، وcreate or replace، وكتل do تفحص الكتالوج قبل السياسات.

set lock_timeout = '5s';

-- ─── أ. فعل «ملاحظة الرصيد اليومي» ─────────────────────────────────────────────────────────────────────────────────
create or replace function private.actions() returns text[]
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select array[
    'receipt.draft', 'transfer.post', 'issue.post', 'count.enter', 'stock_use.post',
    'receipt.amounts', 'costs.load', 'sale.post', 'payment.post', 'sale_return.post', 'expense.post', 'accounts.view',
    'production.draft', 'production.post',
    'hatch.operate',
    'flock_day.save', 'weigh_ticket.draft',
    'recipe.activate', 'count.approve', 'flock.manage', 'flock.transfer', 'hatch.zero_saleable', 'expired.destroy',
    'expired.release', 'void', 'receipt.revalue', 'party.adjust', 'opening.post', 'period.lock',
    'party.offset', 'members.manage', 'period.unlock',
    'stores.manage', 'parties.manage', 'party.create', 'cash_accounts.manage', 'expense_categories.manage',
    'item.create',
    'purchase.record',
    'sale.record',
    'stock_note.write',
    'read'
  ]
$$;

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
  if p_role = 'owner' then return true; end if;
  if p_action in ('party.offset', 'members.manage', 'period.unlock') then return false; end if;
  if p_action = 'read' then return true; end if;
  -- «يضيف مادّة» (قرار المالك 2026-11-02): أمين المخزن يضيف مادّة ووحدتها، ومن يملك إدارة المخازن يملكها أيضاً (المالك والمدير).
  -- القاعدة مكتوبة مرّة واحدة هنا، فلا تتفرّق إذا تغيّر جدول الأدوار؛ والتعديل والأرشفة تبقى stores.manage.
  if p_action = 'item.create' then
    return p_role = 'storekeeper' or private.role_can(p_role, 'stores.manage', p_costs_confirmed);
  end if;
  -- «يسجّل الشراء» (قرار المالك 2026-11-06): الكمية والسعر معاً ويُحفظ فوراً، للمحاسب والأمين (والمدير بكلّ الأفعال، والمالك كلّها).
  -- «يبيع» (قرار المالك 2026-11-08، 0020): لأدوار «يسجّل الشراء» نفسها.
  -- «ملاحظة الرصيد اليومي» (0022، كلمة المالك 2026-11-09): لمن يعمل في المخازن — الأمين ومشغّلا المعمل والمفقس (والمدير كلّها، والمالك).
  return case p_role
    when 'manager' then true
    when 'accountant' then p_action in ('receipt.amounts', 'costs.load', 'production.post', 'sale.post', 'payment.post', 'sale_return.post', 'expense.post', 'accounts.view',
      'parties.manage', 'party.create', 'cash_accounts.manage', 'expense_categories.manage', 'purchase.record',
      'sale.record')
    when 'storekeeper' then p_action in ('receipt.draft', 'transfer.post', 'issue.post', 'count.enter', 'stock_use.post', 'party.create', 'purchase.record', 'sale.record') or p_action = 'stock_note.write'
    when 'mill_operator' then p_action in ('production.draft', 'stock_note.write') or (p_action = 'production.post' and coalesce(p_costs_confirmed, false))
    when 'hatchery_operator' then p_action in ('hatch.operate', 'stock_note.write')
    when 'hall_worker' then p_action in ('flock_day.save', 'weigh_ticket.draft')
    else false
  end;
end
$$;

-- ─── ب. ملاحظة اليوم، وترتيب موادّ التصنيف ──────────────────────────────────────────────────────────────────────────
create table if not exists public.stock_day_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  item_id uuid not null,
  on_date date not null,
  note text not null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz,
  updated_by uuid,
  constraint stock_day_notes_note_check check (length(btrim(note)) between 1 and 200),
  constraint stock_day_notes_version_check check (version >= 1),
  unique (org_id, id),
  -- ملاحظة واحدة لكلّ مادّة في كلّ يوم بالمنشأة (DECISIONS «الرصيد اليومي»).
  unique (org_id, item_id, on_date),
  foreign key (org_id, item_id) references public.items (org_id, id)
);

alter table public.stock_day_notes enable row level security;
alter table public.item_categories add column if not exists item_order uuid[] not null default '{}';

do $$
begin
  -- الملاحظة يقرؤها كلّ عضو في المنشأة (المادّة يقرؤها كلّ دور)، وتكتبها set_day_note وحدها.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'stock_day_notes' and policyname = 'stock_day_notes_read') then
    create policy stock_day_notes_read on public.stock_day_notes for select to authenticated using (org_id = (select public.auth_org()));
  end if;
  execute 'create or replace trigger audit_stock_day_notes after insert or update or delete on public.stock_day_notes for each row execute function private.audit_row()';
end
$$;

revoke all on table public.stock_day_notes from anon, authenticated;
grant select on table public.stock_day_notes to authenticated;
revoke truncate on table public.stock_day_notes from service_role;

-- ─── ج. أنواع استعمال المادّة: ملاحظات الأيام ─────────────────────────────────────────────────────────────────────────
create or replace function private.item_uses(p_item uuid) returns text[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  r record;
  v_found boolean;
  v_label text;
  v_uses text[] := '{}';
begin
  for r in
    select cl.relname as tbl, format('%I.%I', ns.nspname, cl.relname) as qualified,
      (select a.attname from unnest(c.conkey, c.confkey) as k(col, ref)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.col
        join pg_attribute b on b.attrelid = c.confrelid and b.attnum = k.ref where b.attname = 'id') as id_col,
      (select a.attname from unnest(c.conkey, c.confkey) as k(col, ref)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.col
        join pg_attribute b on b.attrelid = c.confrelid and b.attnum = k.ref where b.attname = 'org_id') as org_col
    from pg_constraint c join pg_class cl on cl.oid = c.conrelid join pg_namespace ns on ns.oid = cl.relnamespace
    where c.contype = 'f' and c.confrelid = 'public.items'::regclass and cl.relname not in ('item_units', 'item_prices')
    order by cl.relname, c.conname
  loop
    continue when r.id_col is null;
    execute format('select exists (select 1 from %s x where %s x.%I = $2)', r.qualified,
      case when r.org_col is null then '' else format('x.%I = $1 and', r.org_col) end, r.id_col) into v_found using v_org, p_item;
    continue when not coalesce(v_found, false);
    v_label := case r.tbl
      when 'receipt_lines' then 'لها مشتريات'
      when 'purchase_prices' then 'لها مشتريات'
      when 'stock_lots' then 'لها حركات مخزون'
      when 'stock_moves' then 'لها حركات مخزون'
      when 'stock_balances' then 'لها حركات مخزون'
      when 'opening_lines' then 'في رصيد افتتاحي'
      when 'transfer_lines' then 'في نقل بين المخازن'
      when 'stock_use_lines' then 'في صرف'
      when 'stock_count_lines' then 'في جرد'
      when 'supplier_return_lines' then 'في مرتجع إلى مورّد'
      when 'recipes' then 'ناتج خلطة'
      when 'recipe_lines' then 'في خلطة'
      when 'production_batches' then 'في دفعة إنتاج'
      when 'production_inputs' then 'في دفعة إنتاج'
      when 'flock_issue_lines' then 'في صرف لقاعة'
      when 'stock_conversions' then 'في تحويل مادّة'
      when 'sales_lines' then 'لها مبيعات'
      when 'stock_day_notes' then 'لها ملاحظات يومية'
      else 'في مستند آخر'
    end;
    if not (v_label = any (v_uses)) then
      v_uses := v_uses || v_label;
    end if;
  end loop;
  return v_uses;
end
$$;

-- ─── د. الرصيد اليومي ───────────────────────────────────────────────────────────────────────────────────────────────
-- جدول التصنيف بيوم p_on (أو اليوم): لكلّ مادّة ظاهرة فيه (أو كلّ الموادّ إن لم يُختر تصنيف) رصيدها آخر ذلك اليوم = Σ كميات حركاتها بتاريخه
-- أو قبله في المخزن المختار أو في كلّ مخازن نطاقك، وملاحظة ذلك اليوم. الترتيب: ترتيب التصنيف الذي اختاره المدير، ثمّ الاسم.
create or replace function public.day_balance(p_category uuid, p_on date, p_warehouse uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_on date := coalesce(p_on, public.app_today());
  c public.item_categories;
  w public.warehouses;
  v_rows jsonb;
begin
  perform private.require('read');
  if v_on > v_today then
    raise exception 'day_in_future' using hint = format('يوم %s لم يأتِ بعد؛ الرصيد يُعرض حتى اليوم %s.',
      to_char(v_on, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY'));
  end if;
  if p_warehouse is not null then
    select * into w from public.warehouses x where x.org_id = v_org and x.id = p_warehouse;
    if w.id is null or not public.in_scope_wh(w.id) then
      raise exception 'out_of_scope' using hint = 'هذا المخزن خارج نطاقك أو غير موجود في منشأتك.';
    end if;
  end if;
  if p_category is not null then
    select * into c from public.item_categories x where x.org_id = v_org and x.id = p_category;
    if c.id is null then
      raise exception 'category_not_found' using hint = 'هذا التصنيف غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
    end if;
    if c.archived_at is not null then
      raise exception 'category_archived' using hint = format('التصنيف «%s» مؤرشف. أعِده من «إعداد المخزن» أو اختر تصنيفاً آخر.', c.name);
    end if;
  end if;
  with picked as (
    select i.id, i.name, i.name_norm, i.kind, i.base_unit, array_position(c.item_order, i.id) as pos
    from public.items i
    where i.org_id = v_org and i.archived_at is null and (p_category is null or i.category_id = p_category)
  ), stores as (
    select y.id from public.warehouses y
    where y.org_id = v_org and (case when p_warehouse is null then public.in_scope_wh(y.id) else y.id = p_warehouse end)
  ), bal as (
    select m.item_id, sum(m.qty) as qty from public.stock_moves m
    where m.org_id = v_org and m.moved_on <= v_on and m.item_id in (select p.id from picked p) and m.warehouse_id in (select s.id from stores s)
    group by m.item_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('item_id', p.id, 'name', p.name, 'kind', p.kind, 'base_unit', p.base_unit,
      'qty', round(coalesce(b.qty, 0), 3)::text,
      'note', case when n.id is null then null else jsonb_build_object('text', n.note, 'version', n.version) end)
    order by p.pos nulls last, p.name_norm collate "C", p.id), '[]'::jsonb)
  into v_rows
  from picked p
  left join bal b on b.item_id = p.id
  left join public.stock_day_notes n on n.org_id = v_org and n.item_id = p.id and n.on_date = v_on;
  return jsonb_build_object(
    'today', v_today,
    'on', v_on,
    'category', case when c.id is null then null else jsonb_build_object('id', c.id, 'name', c.name) end,
    'warehouse', case when w.id is null then null else jsonb_build_object('id', w.id, 'name', w.name) end,
    'stores', coalesce((select jsonb_agg(jsonb_build_object('id', y.id, 'name', y.name, 'kind', y.kind) order by y.name collate "C", y.id)
      from public.warehouses y where y.org_id = v_org and y.archived_at is null and public.in_scope_wh(y.id)), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name,
        'items', (select count(*) from public.items i where i.org_id = k.org_id and i.category_id = k.id and i.archived_at is null))
        order by k.name collate "C", k.id)
      from public.item_categories k where k.org_id = v_org and k.archived_at is null), '[]'::jsonb),
    'can_note', public.can('stock_note.write'),
    'can_manage', public.can('stores.manage'),
    'rows', v_rows);
end
$$;

-- ─── هـ. ملاحظة اليوم ───────────────────────────────────────────────────────────────────────────────────────────────
-- ملاحظة (مادّة، يوم): p_expected_version نسخة الملاحظة التي رآها الكاتب (فارغ = رأى بلا ملاحظة). إن كان الحال الآن هو المطلوب (النصّ نفسه،
-- أو بلا ملاحظة والمطلوب مسحها) فنتيجته بلا رفض — إعادة بعد جواب ضاع أو جهازان كتبا الشيء نفسه؛ وإلّا إن تغيّر عمّا رآه فـnote_changed.
-- النصّ الفارغ يمسح ملاحظة ذلك اليوم (ليست سطر مال ولا حركة مخزون). الأقفال: المادّة للمشاركة (الحذف يرى الملاحظة أو تراه الملاحظة)،
-- ثمّ قفل استشاريّ لـ(المادّة، اليوم) يرتّب أوّل كتابتين، ثمّ صفّ الملاحظة؛ وكلّ فحص بعد قفله.
create or replace function public.set_day_note(p_item uuid, p_on date, p_note text, p_expected_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_text text := nullif(btrim(coalesce(p_note, ''), E' \t\r\n'), '');
  i public.items;
  n public.stock_day_notes;
begin
  set local lock_timeout = '5s';
  perform private.require('stock_note.write');
  if p_on is null then
    raise exception 'date_required' using hint = 'اختر يوم الملاحظة.';
  end if;
  if p_on > v_today then
    raise exception 'day_in_future' using hint = format('يوم %s لم يأتِ بعد؛ اكتب ملاحظة ليوم مضى أو لليوم.', to_char(p_on, 'DD/MM/YYYY'));
  end if;
  if v_text is not null and length(v_text) > 200 then
    raise exception 'bad_note' using hint = format('الملاحظة %s حرفاً، والحدّ 200 حرف. اختصرها.', length(v_text));
  end if;
  select * into i from public.items x where x.org_id = v_org and x.id = p_item for share;
  if i.id is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك، أو حُذفت. حدّث الشاشة.';
  end if;
  if i.archived_at is not null then
    raise exception 'item_archived' using hint = format('«%s» محذوفة من القوائم، فلا تُكتب لها ملاحظة. أظهِرها من ملفّها أوّلاً.', i.name);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('day_note:' || i.id::text || ':' || p_on::text, 0));
  select * into n from public.stock_day_notes x where x.org_id = v_org and x.item_id = i.id and x.on_date = p_on for update;
  if (n.id is null and v_text is null) or (n.id is not null and n.note = v_text) then
    return jsonb_build_object('item_id', i.id, 'on', p_on,
      'note', case when n.id is null then null else jsonb_build_object('text', n.note, 'version', n.version) end);
  end if;
  if (p_expected_version is null and n.id is not null) or (p_expected_version is not null and (n.id is null or n.version <> p_expected_version)) then
    raise exception 'note_changed' using hint = format('تغيّرت ملاحظة «%s» ليوم %s من نافذة أو جهاز آخر بعد أن فتحتها. حدّث الشاشة لترى ما كُتب، ثمّ اكتب من جديد.',
      i.name, to_char(p_on, 'DD/MM/YYYY'));
  end if;
  if v_text is null then
    delete from public.stock_day_notes where org_id = v_org and id = n.id;
    return jsonb_build_object('item_id', i.id, 'on', p_on, 'note', null);
  end if;
  if n.id is null then
    insert into public.stock_day_notes (org_id, item_id, on_date, note) values (v_org, i.id, p_on, v_text) returning * into n;
  else
    update public.stock_day_notes set note = v_text, version = version + 1, updated_at = now(), updated_by = auth.uid()
    where org_id = v_org and id = n.id returning * into n;
  end if;
  return jsonb_build_object('item_id', i.id, 'on', p_on, 'note', jsonb_build_object('text', n.note, 'version', n.version));
end
$$;

-- ─── و. موادّ التصنيف وترتيبها ─────────────────────────────────────────────────────────────────────────────────────
-- القائمة كلّها بترتيبها (stores.manage): المُدرَجة تصير في التصنيف (ولو كانت في غيره)، والظاهرة التي كانت فيه ولم تُدرَج تصير بلا تصنيف،
-- والمخفيّة تبقى كما هي. الأقفال: صفّ التصنيف (تعديلان للتصنيف نفسه يترتّبان) ثمّ صفوف الموادّ بترتيب المعرّف؛ وكلّ فحص بعد قفله. القفلان
-- for no key update لا for update: تعديل مادّة يكتب category_id يأخذ key share على صفّ التصنيف لمفتاحه الأجنبيّ وهو ماسك صفّ المادّة، وfor update يمنعه
-- فيتعاكسان (40P01، درس WP4 في الدفعات).
create or replace function public.set_category_items(p_category uuid, p_items uuid[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_items uuid[] := coalesce(p_items, '{}');
  c public.item_categories;
  v_name text;
  v_moved int;
  v_removed int;
begin
  set local lock_timeout = '5s';
  perform private.require('stores.manage');
  if array_position(v_items, null) is not null then
    raise exception 'item_not_found' using hint = 'في القائمة مادّة بلا معرّف. حدّث الشاشة واختر من جديد.';
  end if;
  if cardinality(v_items) > 500 then
    raise exception 'too_many_items' using hint = format('اخترت %s مادّة، والحدّ 500 مادّة في التصنيف الواحد.', cardinality(v_items));
  end if;
  if (select count(distinct x.id) from unnest(v_items) as x(id)) <> cardinality(v_items) then
    raise exception 'duplicate_item' using hint = 'اختيرت مادّة مرّتين في القائمة. حدّث الشاشة واختر من جديد.';
  end if;
  select * into c from public.item_categories x where x.org_id = v_org and x.id = p_category for no key update;
  if c.id is null then
    raise exception 'category_not_found' using hint = 'هذا التصنيف غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if c.archived_at is not null then
    raise exception 'category_archived' using hint = format('التصنيف «%s» مؤرشف. أعِده من «إعداد المخزن» أوّلاً.', c.name);
  end if;
  perform 1 from public.items i where i.org_id = v_org and (i.id = any (v_items) or i.category_id = c.id) order by i.id for no key update;
  if (select count(*) from public.items i where i.org_id = v_org and i.id = any (v_items)) <> cardinality(v_items) then
    raise exception 'item_not_found' using hint = 'مادّة من القائمة غير موجودة في منشأتك، أو حُذفت. حدّث الشاشة واختر من جديد.';
  end if;
  select i.name into v_name from public.items i
  where i.org_id = v_org and i.id = any (v_items) and i.archived_at is not null order by i.name_norm collate "C", i.id limit 1;
  if v_name is not null then
    raise exception 'item_archived' using hint = format('«%s» محذوفة من القوائم، فلا تُدرج في تصنيف. أظهِرها من ملفّها أوّلاً.', v_name);
  end if;
  select count(*) into v_moved from public.items i
  where i.org_id = v_org and i.id = any (v_items) and i.category_id is not null and i.category_id <> c.id;
  update public.items set category_id = null
  where org_id = v_org and category_id = c.id and archived_at is null and not (id = any (v_items));
  get diagnostics v_removed = row_count;
  update public.items set category_id = c.id
  where org_id = v_org and id = any (v_items) and category_id is distinct from c.id;
  update public.item_categories set item_order = v_items where org_id = v_org and id = c.id;
  return jsonb_build_object('category_id', c.id, 'count', cardinality(v_items), 'moved', v_moved, 'removed', v_removed);
end
$$;

-- ─── ز. الصلاحيات ───────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.day_balance(uuid, date, uuid), public.set_day_note(uuid, date, text, integer),
  public.set_category_items(uuid, uuid[]) from public, anon;
grant execute on function public.day_balance(uuid, date, uuid), public.set_day_note(uuid, date, text, integer),
  public.set_category_items(uuid, uuid[]) to authenticated;
