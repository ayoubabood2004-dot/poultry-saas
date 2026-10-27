-- 0006_parties_ledger_cash — الجهات ودفاترها والتوزيع و«قبضنا» و«دفعنا» والصناديق وصفحة الحسابات (خطّة المرحلة 1 WP3؛
--   FOUNDATION «نموذج البيانات» ٣٠٩–٣٢٣ و٤١٤–٤١٧ و٤٣٥–٤٣٧، والقاعدة 27 (٤٩٥)، و٥١٤–٥٢٤، و٥٨٦–٥٩١، و٧٨٨؛ DECISIONS
--   2026-10-26 Q1 وQ2 وQ10 وQ12).
-- المشكلة: ماكو جهات ولا دفاتر قيود ولا صناديق، وكل حزمة جاية (الاستلام ومرتجع المورّد والمصاريف بالدين) تكتب قيد جهة أو حركة
--   صندوق. وماكو بروتوكول المرجع (rpc_refs موجود من 0001 بلا دالّة)، ولا عدّاد أرقام، ولا قواعد تاريخ الترحيل ويوم التشغيل.
-- هنا: parties (الاسم المطبَّع ومفتاح الهاتف، والتوائم تنبيه ثم سماح Q2، والأرشفة بلا رصيد)، وitem_units.party_id (وحدة تعبئة
--   مورّد)، وcash_accounts، وdoc_counters، والدفاتر الثابتة party_entries وparty_allocations وcash_moves (تُضاف ولا تتعدّل،
--   والغلط بقيد عكسي)، ومحرّك التوزيع بالقاعدة 27 (الرصيد السابق أوّلاً ثم الأقدم، والإلغاء زوج مغلق ثم إعادة التوزيع)،
--   والمساعدات (المرجع والإخفاء وأقفال الجهات وتواريخ الترحيل والافتتاح والإلغاء والترقيم)، ودوالّ «قبضنا» و«دفعنا» والافتتاح
--   والتسوية والإعفاء والإلغاء والصناديق (Q10: افتتاح ونقل والسالب مسموح)، والتقارير (invoker بفحص صريح)، وhome_summary،
--   وfind_party_twins، وin_scope_book (E49)، وverify_ledger.
-- انحرافات مكتوبة عن الخطّة (WP3): report_party_balances ياخذ p_search (البحث بالخادم مو بالصفحة المحمّلة، FOUNDATION ٧٨٨)،
--   والأرقام فيه بحث بالهاتف بس لمّا النصّ رقم هاتف؛ cash_moves.party_entry_id يربط حركة القبض والدفع بقيدها (الفحص 7 و8)؛
--   الأقفال بترتيب §2.3 مكمَّلاً (الجهات ← قفل الفترة للمشاركة ← صفّ الوحدة قبل أوّل ترحيلها ← الصناديق ← العدّاد)، والصندوق حصري
--   (افتتاحه وإلغاء حركته يفحصون بعد قفله، وأرشفته بنفس اللحظة تنتظر)؛ وseq ترتيب القيد داخل (الجهة، الدفتر) والحركة داخل
--   صندوقها، مو تسلسلاً عامّاً (الفرق بين رقمين كان يكشف حجم حركة المنشآت الثانية)؛ والتقارير بلا p_to لحد app_today()؛ وسجلّ
--   التدقيق بنطاق الدفاتر لصفوف القيود والتوزيعات (E49)؛ والقيد بلا posted_at/posted_by لأن created_at/created_by نفسهم.
-- تراجع: rollback_0006.sql — يشيل الجداول الجديدة ودوالّها وعمود item_units.party_id؛ ويرفض بصوت إذا أي قيد جهة أو حركة صندوق
--   أو وحدة تعبئة لمورّد موجودة، بلا ما يحذف شي (المال ما ينحذف).
-- تنعاد بأمان: if not exists، create or replace، وكتل do تفحص الكتالوج قبل القيود والسياسات.

set lock_timeout = '5s';

-- ─── الجهات (FOUNDATION ٣٠٩): زبون أو مورّد أو الاثنين، والقراءة لمن يرى المبيعات ─────────────────────────────────────
create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  name text not null,
  name_norm text not null default '',
  phone text,
  phone_key text,
  is_customer boolean not null default false,
  is_supplier boolean not null default false,
  archived_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint parties_name_check check (length(btrim(name)) between 1 and 120),
  constraint parties_name_norm_check check (name_norm <> ''),
  constraint parties_phone_check check (phone is null or length(phone) between 1 and 40),
  unique (org_id, id)
);
create index if not exists parties_name_norm on public.parties (org_id, name_norm collate "C", id);
create index if not exists parties_phone_key on public.parties (org_id, phone_key) where phone_key is not null;

-- ─── وحدة تعبئة خاصّة بمورّد (FOUNDATION ٢٧٣): «كيس المورّد 48 كغم» ────────────────────────────────────────────────
alter table public.item_units add column if not exists party_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.item_units'::regclass and conname = 'item_units_party_fkey') then
    alter table public.item_units add constraint item_units_party_fkey foreign key (org_id, party_id) references public.parties (org_id, id);
  end if;
end
$$;
create index if not exists item_units_party on public.item_units (org_id, party_id);

-- ─── الصناديق (FOUNDATION ٤١٦): نقد أو مصرف أو محفظة، ورصيدها مجموع حركاتها (ماكو رصيد مخزون) ──────────────────────────
create table if not exists public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  name text not null,
  kind text not null,
  archived_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint cash_accounts_name_check check (length(btrim(name)) between 1 and 80),
  constraint cash_accounts_kind_check check (kind in ('cash', 'bank', 'wallet')),
  unique (org_id, id)
);

-- ─── عدّاد أرقام المستندات (FOUNDATION ٢٤٧، ٥١٨): لكل (منشأة، نوع، سنة)، والسنة سنة تاريخ المستند ─────────────────────
-- الأنواع المرقّمة بالمرحلة 1 (E12) ويّا OF المحجوز للمقاصّة؛ أنواع فواتير البيع تنضاف ويّا مرحلتها.
create table if not exists public.doc_counters (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  kind text not null,
  year int not null,
  last_no int not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint doc_counters_kind_check check (kind in ('PU', 'RT', 'TR', 'CT', 'SU', 'RC', 'PY', 'OF')),
  constraint doc_counters_year_check check (year between 2000 and 9999),
  constraint doc_counters_last_no_check check (last_no >= 1),
  unique (org_id, id),
  unique (org_id, kind, year)
);

-- ─── قيود الجهات (FOUNDATION ٣١١–٣١٨): موجب «عليه»، سالب «له»، بدينار صحيح، والترتيب (on_date, seq) ──────────────────
-- الإشارة ثابتة للأنواع ذات الإشارة، والعكسي بإشارة معاكسة؛ والعكسي بنفس الجهة والدفتر بالمفتاح المركّب ونوعه ومبلغه بمشغّل.
-- seq ترتيب القيد داخل (الجهة، الدفتر) يكتبه مشغّل (1، 2، …) تحت قفل الجهة، والفهرس الفريد يمسك أي كاتب بلا قفلها.
create table if not exists public.party_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  seq bigint not null,
  party_id uuid not null,
  book_id uuid not null,
  kind text not null,
  amount numeric not null,
  doc_kind text,
  doc_id uuid,
  doc_no text,
  on_date date not null,
  reverses_entry_id uuid,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint party_entries_amount_check check (abs(amount) < 'Infinity' and amount <> 0 and amount = round(amount, 0)),
  constraint party_entries_kind_check check (kind in ('invoice', 'purchase', 'bill', 'payment', 'payout', 'return', 'supplier_return',
    'forgiveness', 'opening', 'adjustment', 'offset')),
  constraint party_entries_sign_check check (case
    when kind in ('invoice', 'payout', 'supplier_return') then (amount > 0) = (reverses_entry_id is null)
    when kind in ('purchase', 'bill', 'payment', 'return') then (amount < 0) = (reverses_entry_id is null)
    else true end),
  constraint party_entries_doc_check check ((doc_kind is null) = (doc_id is null)),
  constraint party_entries_doc_kind_check check (doc_kind is null or doc_kind ~ '^[a-z][a-z_]{1,39}$'),
  constraint party_entries_doc_no_check check (doc_no is null or doc_no ~ '^[A-Z]{2}-[0-9]{4}-[0-9]{4,}$'),
  constraint party_entries_reason_check check (reason is null or length(btrim(reason)) between 1 and 500),
  unique (org_id, id),
  unique (org_id, party_id, book_id, id),
  unique (org_id, party_id, book_id, seq),
  unique (org_id, party_id, book_id, reverses_entry_id),
  foreign key (org_id, party_id) references public.parties (org_id, id),
  foreign key (org_id, book_id) references public.ledger_books (org_id, id),
  foreign key (org_id, party_id, book_id, reverses_entry_id) references public.party_entries (org_id, party_id, book_id, id)
);
create index if not exists party_entries_statement on public.party_entries (org_id, party_id, book_id, on_date, seq);
create index if not exists party_entries_book on public.party_entries (org_id, book_id);
create index if not exists party_entries_doc on public.party_entries (org_id, doc_kind, doc_id);

-- ─── التوزيع (FOUNDATION ٣١٩–٣٢٣): بين قيد موجب وقيد سالب بنفس الجهة والدفتر بالبنية، والعكسي سالب ────────────────────
create table if not exists public.party_allocations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  party_id uuid not null,
  book_id uuid not null,
  debit_entry_id uuid not null,
  credit_entry_id uuid not null,
  amount numeric not null,
  reverses_allocation_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint party_allocations_amount_check check (abs(amount) < 'Infinity' and amount <> 0 and amount = round(amount, 0)),
  constraint party_allocations_sign_check check ((amount > 0) = (reverses_allocation_id is null)),
  unique (org_id, id),
  unique (org_id, reverses_allocation_id),
  foreign key (org_id, party_id, book_id, debit_entry_id) references public.party_entries (org_id, party_id, book_id, id),
  foreign key (org_id, party_id, book_id, credit_entry_id) references public.party_entries (org_id, party_id, book_id, id),
  foreign key (org_id, reverses_allocation_id) references public.party_allocations (org_id, id)
);
create index if not exists party_allocations_debit on public.party_allocations (org_id, party_id, book_id, debit_entry_id);
create index if not exists party_allocations_credit on public.party_allocations (org_id, party_id, book_id, credit_entry_id);

-- ─── حركات الصناديق (FOUNDATION ٤١٧): موقّعة بدينار صحيح، ورصيد الصندوق مجموعها ─────────────────────────────────────
-- party_entry_id يربط حركة القبض والدفع (ودفعة الاستلام، WP6) بقيدها؛ النقل وجهان بنفس doc_id ومجموعهما صفر (Q10).
-- seq ترتيب الحركة داخل صندوقها يكتبه مشغّل تحت قفل الصندوق الحصري (lock_cash_account)، والفهرس الفريد يمسك أي كاتب بلاه.
create table if not exists public.cash_moves (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org() references public.orgs (id),
  seq bigint not null,
  account_id uuid not null,
  amount numeric not null,
  kind text not null,
  doc_kind text,
  doc_id uuid,
  party_entry_id uuid,
  on_date date not null,
  reverses_move_id uuid,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint cash_moves_amount_check check (abs(amount) < 'Infinity' and amount <> 0 and amount = round(amount, 0)),
  constraint cash_moves_kind_check check (kind in ('party_payment', 'party_payout', 'receipt_paid', 'receipt_charge', 'expense', 'opening', 'transfer')),
  constraint cash_moves_sign_check check (case
    when kind = 'party_payment' then (amount > 0) = (reverses_move_id is null)
    when kind in ('party_payout', 'receipt_paid', 'receipt_charge', 'expense') then (amount < 0) = (reverses_move_id is null)
    else true end),
  constraint cash_moves_doc_check check ((doc_kind is null) = (doc_id is null)),
  constraint cash_moves_doc_kind_check check (doc_kind is null or doc_kind ~ '^[a-z][a-z_]{1,39}$'),
  constraint cash_moves_entry_check check ((party_entry_id is not null) = (kind in ('party_payment', 'party_payout', 'receipt_paid'))),
  constraint cash_moves_note_check check (note is null or length(btrim(note)) between 1 and 500),
  unique (org_id, id),
  unique (org_id, account_id, seq),
  unique (org_id, reverses_move_id),
  foreign key (org_id, account_id) references public.cash_accounts (org_id, id),
  foreign key (org_id, party_entry_id) references public.party_entries (org_id, id),
  foreign key (org_id, reverses_move_id) references public.cash_moves (org_id, id)
);
create index if not exists cash_moves_account on public.cash_moves (org_id, account_id, on_date, seq);
create index if not exists cash_moves_entry on public.cash_moves (org_id, party_entry_id);
create index if not exists cash_moves_doc on public.cash_moves (org_id, doc_kind, doc_id);

-- ─── المشغّلات ────────────────────────────────────────────────────────────────────────────────────────────────
-- الجهة: الاسم المطبَّع ومفتاح الهاتف يكتبهم الخادم (searchable وphone_key، E34)؛ الأمين يضيف مورّداً بس (Q1)؛ والأرشفة ترفض
-- إذا بأي دفتر رصيد (Q2). قفل الجهة الاستشاري قبل حساب الرصيد: قبض أو دفع بنفس اللحظة يترتّب ويّا الأرشفة (§2.3).
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

-- الصندوق ما يتؤرشف وبيه رصيد (E35). صفّ الصندوق مقفول بالتعديل نفسه، والترحيل يقفله حصرياً، فالاثنين يترتّبون.
create or replace function private.cash_accounts_check() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and new.archived_at is not null and old.archived_at is null
     and coalesce((select sum(m.amount) from public.cash_moves m where m.org_id = new.org_id and m.account_id = new.id), 0) <> 0 then
    raise exception 'archived_in_use' using hint = format('في الصندوق «%s» رصيد، فلا يُؤرشف حتى يصير رصيده صفراً.', new.name);
  end if;
  return new;
end
$$;

-- القيد العكسي بنوع أصله وبمبلغه المعاكس بالضبط، وأصله مو عكسياً (الجهة والدفتر بالمفتاح المركّب).
create or replace function private.party_entries_check() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.party_entries;
begin
  if new.reverses_entry_id is not null then
    select * into o from public.party_entries where org_id = new.org_id and id = new.reverses_entry_id;
    if o.id is null or o.kind <> new.kind or o.amount <> -new.amount or o.reverses_entry_id is not null then
      raise exception 'reversal_mismatch' using hint = 'القيد العكسي يأخذ نوع أصله ومبلغه بإشارة معاكسة، ولا يُعكس قيد عكسي.';
    end if;
  end if;
  return new;
end
$$;

-- التوزيع بين قيد موجب (عليه) وقيد سالب (له)، وعكسه بنفس القيدين وبمبلغه المعاكس.
create or replace function private.party_allocations_check() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.party_allocations;
begin
  if not exists (select 1 from public.party_entries e where e.org_id = new.org_id and e.id = new.debit_entry_id and e.amount > 0)
     or not exists (select 1 from public.party_entries e where e.org_id = new.org_id and e.id = new.credit_entry_id and e.amount < 0) then
    raise exception 'allocation_sides' using hint = 'التوزيع بين قيد «عليه» وقيد «له» بنفس الجهة والدفتر فقط.';
  end if;
  if new.reverses_allocation_id is not null then
    select * into o from public.party_allocations where org_id = new.org_id and id = new.reverses_allocation_id;
    if o.id is null or o.debit_entry_id <> new.debit_entry_id or o.credit_entry_id <> new.credit_entry_id
       or o.amount <> -new.amount or o.reverses_allocation_id is not null then
      raise exception 'reversal_mismatch' using hint = 'عكس التوزيع بنفس قيديه وبمبلغه المعاكس، ولا يُعكس عكس.';
    end if;
  end if;
  return new;
end
$$;

-- الحركة العكسية بنفس الصندوق ونوعها ومستندها وبمبلغها المعاكس، وحركة القيد العكسي لقيده العكسي.
create or replace function private.cash_moves_check() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.cash_moves;
begin
  if new.reverses_move_id is not null then
    select * into o from public.cash_moves where org_id = new.org_id and id = new.reverses_move_id;
    if o.id is null or o.account_id <> new.account_id or o.kind <> new.kind or o.amount <> -new.amount or o.reverses_move_id is not null
       or o.doc_kind is distinct from new.doc_kind or o.doc_id is distinct from new.doc_id
       or (o.party_entry_id is not null and not exists (
         select 1 from public.party_entries r where r.org_id = new.org_id and r.id = new.party_entry_id and r.reverses_entry_id = o.party_entry_id)) then
      raise exception 'reversal_mismatch' using hint = 'الحركة العكسية بنفس الصندوق ونوع أصلها ومبلغه بإشارة معاكسة، ولا تُعكس حركة عكسية.';
    end if;
  end if;
  return new;
end
$$;

-- ترتيب القيد داخل (الجهة، الدفتر) والحركة داخل صندوقها: التالي بعد آخر رقم. كاتب القيد ماسك قفل الجهة وكاتب الحركة ماسك قفل
-- الصندوق الحصري، فالرقم ما يتكرّر؛ والفهرس الفريد يرفض كاتباً بلا قفل بدل ما يكتب رقمين متساويين بصمت. مشغّلان لحالهما
-- (مو داخل فحص العكسي) حتى ضابط يطفي فحصاً ما يطفي الترقيم.
create or replace function private.party_entries_seq() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.seq := coalesce((select max(e.seq) from public.party_entries e
    where e.org_id = new.org_id and e.party_id = new.party_id and e.book_id = new.book_id), 0) + 1;
  return new;
end
$$;

create or replace function private.cash_moves_seq() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.seq := coalesce((select max(m.seq) from public.cash_moves m where m.org_id = new.org_id and m.account_id = new.account_id), 0) + 1;
  return new;
end
$$;

create or replace trigger parties_check before insert or update on public.parties
  for each row execute function private.parties_check();
create or replace trigger party_entries_seq before insert on public.party_entries
  for each row execute function private.party_entries_seq();
create or replace trigger cash_moves_seq before insert on public.cash_moves
  for each row execute function private.cash_moves_seq();
create or replace trigger cash_accounts_check before update on public.cash_accounts
  for each row execute function private.cash_accounts_check();
create or replace trigger party_entries_check before insert on public.party_entries
  for each row execute function private.party_entries_check();
create or replace trigger party_allocations_check before insert on public.party_allocations
  for each row execute function private.party_allocations_check();
create or replace trigger cash_moves_check before insert on public.cash_moves
  for each row execute function private.cash_moves_check();

do $$
declare
  t text;
begin
  -- البيانات الأساسية: النسخة والأرشفة بوقت الخادم (master_write مال 0005).
  foreach t in array array['parties', 'cash_accounts'] loop
    execute format('create or replace trigger %I before update on public.%I for each row execute function private.master_write()', t || '_master', t);
  end loop;
  -- الدفاتر الثابتة: تعديل أو حذف أو مسح يرفض لأي دور (FOUNDATION ٤٣٧).
  foreach t in array array['party_entries', 'party_allocations', 'cash_moves'] loop
    execute format('create or replace trigger %I before update or delete on public.%I for each row execute function private.reject_change()', t || '_append_only', t);
    execute format('create or replace trigger %I before truncate on public.%I for each statement execute function private.reject_change()', t || '_no_truncate', t);
  end loop;
  foreach t in array array['parties', 'cash_accounts', 'doc_counters', 'party_entries', 'party_allocations', 'cash_moves'] loop
    execute format('create or replace trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()', 'audit_' || t, t);
  end loop;
end
$$;

-- ─── RLS: القراءة بالمنشأة، والجهات لمن يرى المبيعات، والدفاتر والصناديق لمن يرى الحسابات (مقيِّدة، §2.8) ───────────────
alter table public.parties enable row level security;
alter table public.cash_accounts enable row level security;
alter table public.doc_counters enable row level security;
alter table public.party_entries enable row level security;
alter table public.party_allocations enable row level security;
alter table public.cash_moves enable row level security;

-- دفتر بنطاق المستخدم (E49): بوحدة بنطاقه (in_scope_division)؛ المالك، والمدير والمحاسب بلا صفوف نطاق، كل الدفاتر. دالّة
-- هويّة definer تناديها سياسات القيود والتوزيع ودوالّ الترحيل والتقارير.
create or replace function public.in_scope_book(p_book uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select public.in_scope_division(b.division_id) from public.ledger_books b where b.org_id = public.auth_org() and b.id = p_book
  ), false)
$$;

do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('parties', 'parties_read', 'org_id = (select public.auth_org())'),
      ('cash_accounts', 'cash_accounts_read', 'org_id = (select public.auth_org())'),
      ('doc_counters', 'doc_counters_read', 'org_id = (select public.auth_org())'),
      ('party_entries', 'party_entries_read', 'org_id = (select public.auth_org()) and (select public.in_scope_book(book_id))'),
      ('party_allocations', 'party_allocations_read', 'org_id = (select public.auth_org()) and (select public.in_scope_book(book_id))'),
      ('cash_moves', 'cash_moves_read', 'org_id = (select public.auth_org())')
    ) as x(tbl, name, cond)
  loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.name) then
      execute format('create policy %I on public.%I for select to authenticated using (%s)', p.name, p.tbl, p.cond);
    end if;
  end loop;
  for p in
    select * from (values
      ('parties', 'parties_sales_only', 'can_see_sales'),
      ('cash_accounts', 'cash_accounts_accounts_only', 'can_see_accounts'),
      ('party_entries', 'party_entries_accounts_only', 'can_see_accounts'),
      ('party_allocations', 'party_allocations_accounts_only', 'can_see_accounts'),
      ('cash_moves', 'cash_moves_accounts_only', 'can_see_accounts')
    ) as x(tbl, name, fn)
  loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.name) then
      execute format('create policy %I on public.%I as restrictive for select to authenticated using ((select public.%I()))', p.name, p.tbl, p.fn);
    end if;
  end loop;
  -- سجلّ التدقيق يحمل صفّ القيد والتوزيع كلّه (دفتره وجهته ومبلغه، audit_row بـ0001)، وقراءته لأدوار الكلفة (0001)؛ فالقارئ
  -- المحصور بوحدات (E49) يقرأ منه صفوف دفاتر نطاقه بس، مثل الجدولين نفسهما. حركات الصناديق بلا دفتر، فتبقى للمنشأة كلها.
  -- قالب للحزم الجاية: صفوف المخزون (stock_moves والدفعات والأرصدة) بنفس الشكل بـin_scope_wh (WP4).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'audit_log_book_scope') then
    create policy audit_log_book_scope on public.audit_log as restrictive for select to authenticated
      using (table_name not in ('party_entries', 'party_allocations') or public.in_scope_book((coalesce("new", "old") ->> 'book_id')::uuid));
  end if;
  -- الكتابة المباشرة (Q1): الجهة يضيفها من عنده party.create (والأمين مورّداً بس، المشغّل) ويعدّلها ويؤرشفها parties.manage؛
  -- والصندوق cash_accounts.manage.
  for p in
    select * from (values
      ('parties', 'party.create', 'parties.manage'),
      ('cash_accounts', 'cash_accounts.manage', 'cash_accounts.manage')
    ) as x(tbl, insert_action, update_action)
  loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.tbl || '_insert') then
      execute format('create policy %I on public.%I for insert to authenticated with check (org_id = (select public.auth_org()) and (select public.can(%L)))',
        p.tbl || '_insert', p.tbl, p.insert_action);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.tbl || '_update') then
      execute format('create policy %I on public.%I for update to authenticated using (org_id = (select public.auth_org()) and (select public.can(%L))) with check (org_id = (select public.auth_org()) and (select public.can(%L)))',
        p.tbl || '_update', p.tbl, p.update_action, p.update_action);
    end if;
  end loop;
end
$$;

revoke all on table public.parties, public.cash_accounts, public.doc_counters, public.party_entries, public.party_allocations, public.cash_moves
  from anon, authenticated;
grant select on table public.parties, public.cash_accounts, public.doc_counters, public.party_entries, public.party_allocations, public.cash_moves
  to authenticated;
grant insert (name, phone, is_customer, is_supplier) on public.parties to authenticated;
grant update (name, phone, is_customer, is_supplier, archived_at) on public.parties to authenticated;
grant insert (name, kind) on public.cash_accounts to authenticated;
grant update (name, archived_at) on public.cash_accounts to authenticated;
grant insert (party_id) on public.item_units to authenticated;
revoke truncate on table public.parties, public.cash_accounts, public.doc_counters, public.party_entries, public.party_allocations, public.cash_moves
  from service_role;

-- ─── المرجع والإخفاء (§2.2، FOUNDATION ٥١٩، ٤٤٧) ──────────────────────────────────────────────────────────────────
-- المال بالنتيجة داخل كائنات اسمها money بس، وتنشال كلها (بأي عمق) لمن ما يرى الكلف، بأوّل جواب وبالإعادة.
create or replace function private.strip_money(p jsonb) returns jsonb
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
begin
  if jsonb_typeof(p) = 'object' then
    return coalesce((select jsonb_object_agg(e.key, private.strip_money(e.value)) from jsonb_each(p) as e where e.key <> 'money'), '{}'::jsonb);
  elsif jsonb_typeof(p) = 'array' then
    return coalesce((select jsonb_agg(private.strip_money(a.value) order by a.n) from jsonb_array_elements(p) with ordinality as a(value, n)), '[]'::jsonb);
  end if;
  return p;
end
$$;

create or replace function private.mask(p jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.can_see_cost() then p else private.strip_money(p) end
$$;

-- المرجع أوّل شي، قبل أي قفل أو كتابة: النسخة المتزامنة تنام على الفهرس الفريد لحد ما تحسم الأولى. ثبتت الأولى ← نتيجتها
-- (مخفية للمتّصل)؛ رجعت ← هذي تكمل. نفس المرجع ببصمة ثانية، أو بمستخدم ثاني (E2)، ← ref_reused.
create or replace function private.ref_claim(p_fn text, p_ref uuid, p_args jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_hash text := md5(coalesce(p_args, '{}'::jsonb)::text);
  r public.rpc_refs;
begin
  if v_org is null then
    raise exception 'not_member' using hint = 'لست عضواً في منشأة.';
  end if;
  if p_ref is null then
    raise exception 'ref_required' using hint = 'تعذّر الإرسال دون مرجع العملية. حدّث الشاشة وأعد المحاولة.';
  end if;
  insert into public.rpc_refs (org_id, fn, client_ref, args_hash) values (v_org, p_fn, p_ref, v_hash)
  on conflict (org_id, fn, client_ref) do nothing;
  if found then
    return null;
  end if;
  select * into r from public.rpc_refs where org_id = v_org and fn = p_fn and client_ref = p_ref;
  if r.args_hash <> v_hash or r.created_by is distinct from auth.uid() or r.result is null then
    raise exception 'ref_reused' using hint = 'مرجع هذه العملية استُعمل لعملية أخرى. حدّث الشاشة وأعد العملية من جديد.';
  end if;
  return private.mask(r.result);
end
$$;

create or replace function private.ref_store(p_fn text, p_ref uuid, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.rpc_refs set result = p_result where org_id = public.auth_org() and fn = p_fn and client_ref = p_ref;
  return private.mask(p_result);
end
$$;

-- ─── الأقفال (§2.3): الجهات بترتيب المعرّف ← قفل الفترة للمشاركة ← صفّ الوحدة قبل أوّل ترحيلها ← الصناديق ← العدّاد آخر شي ──
-- الجهات أوّل شي (E9): مستند لاحق يقفل جهته ثم وحدته (check_post_date) ما يتقافل ويّا قبض لنفس الجهة بوحدة ما رحّلت. وفحوص
-- التاريخ ويوم التشغيل بعد قفليهما (§2.3: كل فحص بعد قفله). قفل الفترة (set_period_lock، 0001) حصري على نفس المفتاح: ترحيل
-- بتاريخ يقفله مدير بنفس اللحظة ينتظر أو يرى القفل.
create or replace function private.period_guard() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  set local lock_timeout = '5s';
  perform pg_advisory_xact_lock_shared(hashtextextended('period_lock:' || public.auth_org()::text, 0));
end
$$;

create or replace function private.lock_parties(p_parties uuid[]) returns void
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  v uuid;
begin
  set local lock_timeout = '5s';
  for v in select distinct x from unnest(coalesce(p_parties, '{}'::uuid[])) as x where x is not null order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended('party:' || v::text, 0));
  end loop;
end
$$;

-- الصندوق حصري (§2.3، بعد الجهات وصفّ الوحدة وقبل العدّاد): كل كاتب حركة يقفل صفّه قبل أي فحص عليه، فافتتاحان بنفس اللحظة
-- أو إلغاءان لنفس الحركة يترتّبون (الثاني يشوف الأوّل: opening_exists أو already_reversed)، وأرشفته (تعديل صفّه) بنفس اللحظة
-- تنتظر فما يصير صندوق مؤرشف بحركة جديدة، وترتيب الحركة بصندوقها (seq) ما يتكرّر. القفل قبل أي صفّ يشير للصندوق (المفتاح
-- الأجنبي يقفله للمشاركة، والترقية بعدها تتقافل). الأصل يرفض المؤرشف، والعكسي يمرّ (E43): الإلغاء لازم ينجح أو يسمّي مستنداً تابعاً.
create or replace function private.lock_cash_account(p_account uuid, p_original boolean) returns public.cash_accounts
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.cash_accounts;
begin
  set local lock_timeout = '5s';
  if p_account is null then
    raise exception 'cash_account_required' using hint = 'اختر الصندوق.';
  end if;
  select * into a from public.cash_accounts where org_id = public.auth_org() and id = p_account for update;
  if a.id is null then
    raise exception 'cash_account_not_found' using hint = 'هذا الصندوق غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if p_original and a.archived_at is not null then
    raise exception 'cash_account_archived' using hint = format('الصندوق «%s» مؤرشف، فلا تُسجَّل عليه حركة جديدة. أعِده من الأرشيف أو اختر صندوقاً آخر.', a.name);
  end if;
  return a;
end
$$;

-- رقم المستند KIND-YYYY-NNNN (FOUNDATION ٥١٨): السنة سنة تاريخ المستند، والعدّاد آخر قفل، وأوّل مستند بالسنة ياخذ 1 بلا فشل.
create or replace function private.next_doc_no(p_kind text, p_date date) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_year int := extract(year from p_date)::int;
  v_no int;
begin
  set local lock_timeout = '5s';
  insert into public.doc_counters (org_id, kind, year, last_no) values (public.auth_org(), p_kind, v_year, 1)
  on conflict (org_id, kind, year) do update set last_no = public.doc_counters.last_no + 1
  returning last_no into v_no;
  return p_kind || '-' || lpad(v_year::text, 4, '0') || '-' || lpad(v_no::text, greatest(4, length(v_no::text)), '0');
end
$$;

-- ─── التواريخ (§2.4) ──────────────────────────────────────────────────────────────────────────────────────────────
-- الوحدة لترحيل: قبل أوّل ترحيل بيها صفّها ينقفل (يوم التشغيل يتجمّد بأوّل ترحيل، E14، وset_division_go_live يقفل نفس الصفّ)،
-- وبعده يوم التشغيل ثابت فما يحتاج قفلاً.
create or replace function private.division_for_post(p_division uuid) returns public.divisions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d public.divisions;
begin
  set local lock_timeout = '5s';
  select * into d from public.divisions where org_id = public.auth_org() and id = p_division;
  if d.id is null then
    raise exception 'division_not_found' using hint = 'هذه الوحدة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if d.first_posted_at is null then
    select * into d from public.divisions where org_id = public.auth_org() and id = p_division for update;
  end if;
  return d;
end
$$;

-- تاريخ مستند عادي: قاعدة 0001 (المستقبل، أقدم من 7 أيام، الفترة المقفولة)، ويوم تشغيل الوحدة محدّد والتاريخ ما قبله.
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

-- تاريخ الافتتاح (FOUNDATION ٥٢١): بيوم التشغيل أو قبله، مو بالمستقبل ولا بفترة مقفولة، ومستثنى من حدّ الأيام السبعة.
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

-- الإلغاء بيوم الإلغاء (FOUNDATION ٥٢١): الأصل يبقى بيومه، والإلغاء يرفض إذا اليوم نفسه مقفول.
create or replace function private.check_void_date() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lock date;
begin
  perform private.period_guard();
  select l.locked_through into v_lock from public.period_locks l where l.org_id = public.auth_org();
  if v_lock is not null and public.app_today() <= v_lock then
    raise exception 'period_locked' using hint = format('الحسابات مقفلة حتى %s، واليوم ضمنها، فلا يُسجَّل إلغاء. اطلب من مالك المنشأة فتح الفترة.', to_char(v_lock, 'DD/MM/YYYY'));
  end if;
end
$$;

-- أوّل ترحيل بالوحدة يجمّد يوم تشغيلها (E14). الصفّ مقفول من division_for_post إذا ما انختم بعد.
create or replace function private.mark_division_posted(p_division uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.divisions set first_posted_at = now() where org_id = public.auth_org() and id = p_division and first_posted_at is null;
end
$$;

-- ─── فحوص المعطيات ───────────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.book_for_post(p_book uuid) returns public.ledger_books
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  b public.ledger_books;
begin
  if p_book is null then
    raise exception 'book_required' using hint = 'اختر الدفتر أوّلاً؛ كل قيد يُسجَّل بدفتر وحدة، ورصيد دفتر لا يسدّد دين دفتر آخر.';
  end if;
  select * into b from public.ledger_books where org_id = public.auth_org() and id = p_book;
  if b.id is null then
    raise exception 'book_not_found' using hint = 'هذا الدفتر غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if not public.in_scope_book(b.id) then
    raise exception 'out_of_scope' using hint = format('«%s» خارج نطاقك، فلا تسجّل فيه ولا تلغي منه.', b.name);
  end if;
  return b;
end
$$;

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

-- مبلغ دفتر أو صندوق: محدود، وبدينار صحيح (FOUNDATION ٤٦٦)، وموجب لدوالّ «المبلغ ≤ صفر» أو غير الصفر للافتتاح والتسوية.
create or replace function private.check_amount(p_amount numeric, p_positive boolean) returns numeric
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
begin
  if p_amount is null or not (abs(p_amount) < 'Infinity') then
    raise exception 'amount_required' using hint = 'اكتب المبلغ رقماً.';
  end if;
  if p_positive and p_amount <= 0 then
    raise exception 'amount_not_positive' using hint = 'المبلغ أكبر من صفر.';
  end if;
  if not p_positive and p_amount = 0 then
    raise exception 'amount_zero' using hint = 'المبلغ لا يكون صفراً.';
  end if;
  if p_amount <> round(p_amount, 0) then
    raise exception 'amount_not_whole_dinar' using hint = 'المبالغ في دفاتر الجهات والصناديق بالدينار الصحيح، دون كسور.';
  end if;
  return p_amount;
end
$$;

create or replace function private.check_reason(p_reason text) returns text
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
begin
  if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'reason_required' using hint = 'اكتب السبب (حتى 500 حرف).';
  end if;
  return btrim(p_reason);
end
$$;

-- معرّف الصفّ مولود بالجهاز (FOUNDATION ٥١٩): مطلوب، وما يتكرّر لقيد أو حركة ثانية بمرجع جديد.
create or replace function private.check_new_id(p_id uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_id is null then
    raise exception 'id_required' using hint = 'تعذّر الإرسال دون معرّف العملية. حدّث الشاشة وأعد المحاولة.';
  end if;
  if exists (select 1 from public.party_entries where id = p_id) or exists (select 1 from public.cash_moves where id = p_id) then
    raise exception 'id_reused' using hint = 'معرّف هذه العملية مستعمل لعملية أخرى. حدّث الشاشة وأعد العملية من جديد.';
  end if;
end
$$;

-- ─── محرّك التوزيع (القاعدة 27، FOUNDATION ٤٩٥) ─────────────────────────────────────────────────────────────────────
-- المتبقّي المقداري للقيد = |مبلغه| − صافي توزيعاته (العكسية سالبة).
create or replace function private.entry_remaining(p_entry uuid) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select abs(e.amount) - coalesce((
    select sum(a.amount) from public.party_allocations a
    where a.org_id = e.org_id and a.party_id = e.party_id and a.book_id = e.book_id
      and ((e.amount > 0 and a.debit_entry_id = e.id) or (e.amount < 0 and a.credit_entry_id = e.id))
  ), 0)
  from public.party_entries e where e.org_id = public.auth_org() and e.id = p_entry
$$;

-- الخطّة بلا كتابة (المعاينة والترحيل من نفس المحرّك، FOUNDATION ٧٧٠): مبلغ موقّع p_amount يتوزّع على القيود المفتوحة المعاكسة
-- بنفس الجهة والدفتر: قيد المستند نفسه أوّلاً (p_first)، ثم الافتتاح الفعّال (E8)، ثم الأقدم (on_date ثم seq، مو doc_no).
-- كل سطر: القيد المقابل وحصّته الموجبة؛ والباقي فائض يبقى بنفس الدفتر.
create or replace function private.allocation_plan(p_party uuid, p_book uuid, p_amount numeric, p_self uuid, p_first uuid)
returns table (entry_id uuid, amount numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_left numeric := abs(coalesce(p_amount, 0));
  c record;
begin
  if v_left = 0 then
    return;
  end if;
  for c in
    select e.id, abs(e.amount) - coalesce((
      select sum(a.amount) from public.party_allocations a
      where a.org_id = e.org_id and a.party_id = e.party_id and a.book_id = e.book_id
        and ((e.amount > 0 and a.debit_entry_id = e.id) or (e.amount < 0 and a.credit_entry_id = e.id))
    ), 0) as remaining
    from public.party_entries e
    where e.org_id = public.auth_org() and e.party_id = p_party and e.book_id = p_book
      and sign(e.amount) = -sign(p_amount) and e.id is distinct from p_self
    order by coalesce(e.id = p_first, false) desc, (e.kind = 'opening' and e.reverses_entry_id is null) desc, e.on_date, e.seq
  loop
    exit when v_left = 0;
    continue when c.remaining <= 0;
    entry_id := c.id;
    amount := least(v_left, c.remaining);
    v_left := v_left - amount;
    return next;
  end loop;
end
$$;

-- يوزّع متبقّي قيد بالخطّة ويكتب التوزيعات. يرجّع [{entry_id, amount}] نصوصاً عشرية.
create or replace function private.allocate_entry(p_entry uuid, p_first uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e public.party_entries;
  v_left numeric;
  v_out jsonb := '[]'::jsonb;
  s record;
begin
  select * into e from public.party_entries where org_id = public.auth_org() and id = p_entry;
  v_left := private.entry_remaining(e.id);
  if v_left is null or v_left <= 0 then
    return v_out;
  end if;
  for s in select * from private.allocation_plan(e.party_id, e.book_id, sign(e.amount) * v_left, e.id, p_first) loop
    insert into public.party_allocations (org_id, party_id, book_id, debit_entry_id, credit_entry_id, amount)
    values (e.org_id, e.party_id, e.book_id,
      case when e.amount > 0 then e.id else s.entry_id end,
      case when e.amount > 0 then s.entry_id else e.id end,
      s.amount);
    v_out := v_out || jsonb_build_array(jsonb_build_object('entry_id', s.entry_id, 'amount', s.amount::text));
  end loop;
  return v_out;
end
$$;

-- قيد أصلي. الجهة المؤرشفة ترفض الدين الجديد (بيع، شراء، مصروف بالدين، افتتاح، تسوية: Q2) وتقبل القبض والدفع والإعفاء والمرتجع
-- وكل إلغاء (E43).
create or replace function private.write_entry(p_id uuid, p_party uuid, p_book uuid, p_kind text, p_amount numeric, p_doc_kind text, p_doc_id uuid,
  p_doc_no text, p_on_date date, p_reason text) returns public.party_entries
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.parties;
  e public.party_entries;
begin
  select * into p from public.parties where org_id = public.auth_org() and id = p_party;
  if p.archived_at is not null and p_kind in ('invoice', 'purchase', 'bill', 'opening', 'adjustment') then
    raise exception 'party_archived' using hint = format('الجهة «%s» مؤرشفة، فلا يُسجَّل عليها دين جديد. أعِدها من الأرشيف أوّلاً.', p.name);
  end if;
  insert into public.party_entries (id, org_id, party_id, book_id, kind, amount, doc_kind, doc_id, doc_no, on_date, reason)
  values (p_id, p.org_id, p.id, p_book, p_kind, p_amount, p_doc_kind, p_doc_id, p_doc_no, p_on_date, p_reason)
  returning * into e;
  return e;
end
$$;

-- إلغاء قيد (القاعدة 27): توزيعات الأصل تنفكّ بصفوف عكسية، والقيد العكسي بنوعه وبإشارة معاكسة بيوم الإلغاء، ويتزوّج بأصله
-- بكامل مبلغه (زوج مغلق)، وبعدين القيود اللي انفكّت تتوزّع من جديد من الأقدم. يرجّع معرّف القيد العكسي.
create or replace function private.void_entry(p_entry uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.party_entries;
  a public.party_allocations;
  v_freed uuid[] := '{}';
  v_rev uuid;
  f record;
begin
  select * into o from public.party_entries where org_id = public.auth_org() and id = p_entry;
  if exists (select 1 from public.party_entries r where r.org_id = o.org_id and r.party_id = o.party_id and r.book_id = o.book_id and r.reverses_entry_id = o.id) then
    raise exception 'already_reversed' using hint = 'هذا القيد أُلغي من قبل.';
  end if;
  for a in
    select x.* from public.party_allocations x
    where x.org_id = o.org_id and x.party_id = o.party_id and x.book_id = o.book_id
      and (x.debit_entry_id = o.id or x.credit_entry_id = o.id) and x.reverses_allocation_id is null
      and not exists (select 1 from public.party_allocations y where y.org_id = x.org_id and y.reverses_allocation_id = x.id)
    order by x.created_at, x.id
  loop
    insert into public.party_allocations (org_id, party_id, book_id, debit_entry_id, credit_entry_id, amount, reverses_allocation_id)
    values (a.org_id, a.party_id, a.book_id, a.debit_entry_id, a.credit_entry_id, -a.amount, a.id);
    v_freed := v_freed || case when a.debit_entry_id = o.id then a.credit_entry_id else a.debit_entry_id end;
  end loop;
  insert into public.party_entries (org_id, party_id, book_id, kind, amount, doc_kind, doc_id, doc_no, on_date, reverses_entry_id, reason)
  values (o.org_id, o.party_id, o.book_id, o.kind, -o.amount, o.doc_kind, o.doc_id, o.doc_no, public.app_today(), o.id, p_reason)
  returning id into v_rev;
  insert into public.party_allocations (org_id, party_id, book_id, debit_entry_id, credit_entry_id, amount)
  values (o.org_id, o.party_id, o.book_id,
    case when o.amount > 0 then o.id else v_rev end,
    case when o.amount > 0 then v_rev else o.id end,
    abs(o.amount));
  for f in select e.id from public.party_entries e where e.org_id = o.org_id and e.id = any (v_freed) order by e.on_date, e.seq loop
    perform private.allocate_entry(f.id, null);
  end loop;
  return v_rev;
end
$$;

create or replace function private.write_cash_move(p_account uuid, p_amount numeric, p_kind text, p_doc_kind text, p_doc_id uuid, p_entry uuid,
  p_on_date date, p_reverses uuid, p_note text, p_id uuid default null) returns public.cash_moves
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  m public.cash_moves;
begin
  insert into public.cash_moves (id, org_id, account_id, amount, kind, doc_kind, doc_id, party_entry_id, on_date, reverses_move_id, note)
  values (coalesce(p_id, gen_random_uuid()), public.auth_org(), p_account, p_amount, p_kind, p_doc_kind, p_doc_id, p_entry, p_on_date, p_reverses, p_note)
  returning * into m;
  return m;
end
$$;

-- نتيجة قيد (§2.2): المعرّفات والتاريخ والرقم برّا، والمبالغ داخل money (تنشال لمن ما يرى الكلف).
create or replace function private.entry_result(e public.party_entries, p_allocations jsonb, p_move public.cash_moves) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', e.id, 'kind', e.kind, 'doc_no', e.doc_no, 'party_id', e.party_id, 'book_id', e.book_id, 'on_date', e.on_date,
    'reverses', e.reverses_entry_id, 'cash_move_id', p_move.id, 'account_id', p_move.account_id,
    'money', jsonb_build_object(
      'amount', e.amount::text,
      'remaining', private.entry_remaining(e.id)::text,
      'allocations', coalesce(p_allocations, '[]'::jsonb),
      'cash', case when p_move.id is null then null else p_move.amount::text end
    )
  )
$$;

-- ─── الدوالّ: الافتتاح والقبض والدفع والتسوية والإعفاء والإلغاء (FOUNDATION ٥٤٩، ٥٨٦–٥٩١) ─────────────────────────────
-- رصيد الجهة الافتتاحي بدفتر (opening.post، Q1): موجب «عليه» وسالب «له»، بيوم التشغيل أو قبله، وواحد فعّال لكل (جهة، دفتر).
create or replace function public.record_opening_balance(p_id uuid, p_party uuid, p_book uuid, p_amount numeric, p_on_date date, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'record_opening_balance';
  v_cached jsonb;
  b public.ledger_books;
  e public.party_entries;
  v_alloc jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('opening.post');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'party', p_party, 'book', p_book, 'amount', p_amount, 'on_date', p_on_date));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.check_new_id(p_id);
  b := private.book_for_post(p_book);
  perform private.party_for_post(p_party);
  perform private.check_amount(p_amount, false);
  perform private.lock_parties(array[p_party]);
  perform private.check_opening_date(p_on_date, b.division_id);
  if exists (
    select 1 from public.party_entries o
    where o.org_id = b.org_id and o.party_id = p_party and o.book_id = b.id and o.kind = 'opening' and o.reverses_entry_id is null
      and not exists (select 1 from public.party_entries r where r.org_id = o.org_id and r.reverses_entry_id = o.id)
  ) then
    raise exception 'opening_exists' using hint = format('للجهة رصيد افتتاحي فعّال في «%s». ألغِه أوّلاً إن كان خاطئاً، ثم سجّل الصحيح.', b.name);
  end if;
  e := private.write_entry(p_id, p_party, b.id, 'opening', p_amount, null, null, null, p_on_date, null);
  v_alloc := private.allocate_entry(e.id, null);
  perform private.mark_division_posted(b.division_id);
  return private.ref_store(v_fn, p_client_ref, private.entry_result(e, v_alloc, null));
end
$$;

-- قبض أو دفع (payment.post): قيد بالدفتر المختار برقمه، وحركة صندوق بنفس التاريخ، وتوزيع داخل الدفتر بالقاعدة 27.
create or replace function private.post_payment(p_fn text, p_kind text, p_id uuid, p_party uuid, p_book uuid, p_amount numeric, p_account uuid,
  p_on_date date, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cached jsonb;
  b public.ledger_books;
  a public.cash_accounts;
  e public.party_entries;
  m public.cash_moves;
  v_alloc jsonb;
  v_no text;
begin
  set local lock_timeout = '5s';
  perform private.require('payment.post');
  v_cached := private.ref_claim(p_fn, p_client_ref, jsonb_build_object('id', p_id, 'party', p_party, 'book', p_book, 'amount', p_amount, 'account', p_account, 'on_date', p_on_date));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.check_new_id(p_id);
  b := private.book_for_post(p_book);
  perform private.party_for_post(p_party);
  perform private.check_amount(p_amount, true);
  if p_account is null then
    raise exception 'cash_account_required' using hint = 'اختر الصندوق.';
  end if;
  perform private.lock_parties(array[p_party]);
  perform private.check_post_date(p_on_date, b.division_id);
  a := private.lock_cash_account(p_account, true);
  v_no := private.next_doc_no(case p_kind when 'payment' then 'RC' else 'PY' end, p_on_date);
  e := private.write_entry(p_id, p_party, b.id, p_kind, case p_kind when 'payment' then -p_amount else p_amount end, null, null, v_no, p_on_date, null);
  v_alloc := private.allocate_entry(e.id, null);
  m := private.write_cash_move(a.id, case p_kind when 'payment' then p_amount else -p_amount end,
    case p_kind when 'payment' then 'party_payment' else 'party_payout' end, null, null, e.id, p_on_date, null, null);
  perform private.mark_division_posted(b.division_id);
  return private.ref_store(p_fn, p_client_ref, private.entry_result(e, v_alloc, m));
end
$$;

-- «قبضنا» (FOUNDATION ٥٨٦): الجهة دفعتلنا، قيد payment سالب ورقمه RC، وحركة صندوق داخلة، والفائض يبقى «له» بنفس الدفتر.
create or replace function public.record_party_payment(p_id uuid, p_party uuid, p_book uuid, p_amount numeric, p_account uuid, p_on_date date, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return private.post_payment('record_party_payment', 'payment', p_id, p_party, p_book, p_amount, p_account, p_on_date, p_client_ref);
end
$$;

-- «دفعنا» (FOUNDATION ٥٨٧): إحنا دفعنا للجهة، قيد payout موجب ورقمه PY، وحركة صندوق خارجة.
create or replace function public.pay_party(p_id uuid, p_party uuid, p_book uuid, p_amount numeric, p_account uuid, p_on_date date, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return private.post_payment('pay_party', 'payout', p_id, p_party, p_book, p_amount, p_account, p_on_date, p_client_ref);
end
$$;

-- إلغاء قبض أو دفع (FOUNDATION ٥٨٨، E44): قيد عكسي يتزوّج بأصله، وحركة صندوق عكسية، والتوزيعات تنفكّ وتتوزّع من جديد. يقبل دفعة
-- الاستلام (paid_now) هم، والاستلام يبقى مرحَّلاً.
create or replace function public.void_party_payment(p_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_party_payment';
  v_cached jsonb;
  v_reason text;
  o public.party_entries;
  m public.cash_moves;
  r public.party_entries;
  m2 public.cash_moves;
  v_rev uuid;
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into o from public.party_entries where org_id = public.auth_org() and id = p_id;
  if o.id is null then
    raise exception 'entry_not_found' using hint = 'هذا القيد غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if o.kind not in ('payment', 'payout') or o.reverses_entry_id is not null then
    raise exception 'not_a_payment' using hint = 'هذا القيد ليس قبضاً ولا دفعاً؛ يُلغى من مستنده أو من «ألغِ القيد».';
  end if;
  perform private.book_for_post(o.book_id);
  perform private.lock_parties(array[o.party_id]);
  perform private.check_void_date();
  select * into m from public.cash_moves where org_id = o.org_id and party_entry_id = o.id and reverses_move_id is null;
  if m.id is null then
    raise exception 'cash_move_missing' using hint = 'لم تُوجد حركة الصندوق لهذا القيد. راجع الدعم قبل الإلغاء.';
  end if;
  perform private.lock_cash_account(m.account_id, false);
  v_rev := private.void_entry(o.id, v_reason);
  select * into r from public.party_entries where org_id = o.org_id and id = v_rev;
  m2 := private.write_cash_move(m.account_id, -m.amount, m.kind, m.doc_kind, m.doc_id, r.id, public.app_today(), m.id, null);
  return private.ref_store(v_fn, p_client_ref, private.entry_result(r, '[]'::jsonb, m2));
end
$$;

-- تسوية (party.adjust، FOUNDATION ٥٨٩): debit يكتب +المبلغ («عليه») وcredit يكتب −المبلغ، وتتوزّع مثل التسديد.
create or replace function public.record_party_adjustment(p_id uuid, p_party uuid, p_book uuid, p_direction text, p_amount numeric, p_on_date date,
  p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'record_party_adjustment';
  v_cached jsonb;
  v_reason text;
  b public.ledger_books;
  e public.party_entries;
  v_alloc jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('party.adjust');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'party', p_party, 'book', p_book, 'direction', p_direction,
    'amount', p_amount, 'on_date', p_on_date, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.check_new_id(p_id);
  b := private.book_for_post(p_book);
  perform private.party_for_post(p_party);
  if p_direction is null or p_direction not in ('debit', 'credit') then
    raise exception 'direction_required' using hint = 'اختر الجهة: «عليه» أو «له».';
  end if;
  perform private.check_amount(p_amount, true);
  v_reason := private.check_reason(p_reason);
  perform private.lock_parties(array[p_party]);
  perform private.check_post_date(p_on_date, b.division_id);
  e := private.write_entry(p_id, p_party, b.id, 'adjustment', case p_direction when 'debit' then p_amount else -p_amount end, null, null, null, p_on_date, v_reason);
  v_alloc := private.allocate_entry(e.id, null);
  perform private.mark_division_posted(b.division_id);
  return private.ref_store(v_fn, p_client_ref, private.entry_result(e, v_alloc, null));
end
$$;

-- إعفاء (party.adjust، FOUNDATION ٥٩٠): بعكس إشارة رصيد الدفتر بعد قفل الجهة، وما يزيد على الرصيد.
create or replace function public.forgive_debt(p_id uuid, p_party uuid, p_book uuid, p_amount numeric, p_on_date date, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'forgive_debt';
  v_cached jsonb;
  v_reason text;
  b public.ledger_books;
  e public.party_entries;
  v_balance numeric;
  v_alloc jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('party.adjust');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'party', p_party, 'book', p_book, 'amount', p_amount,
    'on_date', p_on_date, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.check_new_id(p_id);
  b := private.book_for_post(p_book);
  perform private.party_for_post(p_party);
  perform private.check_amount(p_amount, true);
  v_reason := private.check_reason(p_reason);
  perform private.lock_parties(array[p_party]);
  perform private.check_post_date(p_on_date, b.division_id);
  select coalesce(sum(x.amount), 0) into v_balance from public.party_entries x where x.org_id = b.org_id and x.party_id = p_party and x.book_id = b.id;
  if v_balance = 0 then
    raise exception 'balance_zero' using hint = format('رصيد الجهة في «%s» صفر، فلا شيء يُعفى منه.', b.name);
  end if;
  if p_amount > abs(v_balance) then
    raise exception 'exceeds_balance' using hint = format('رصيد الجهة في «%s» %s فقط، والإعفاء لا يزيد عليه.', b.name, to_char(abs(v_balance), 'FM999,999,999,999,990'));
  end if;
  e := private.write_entry(p_id, p_party, b.id, 'forgiveness', -sign(v_balance) * p_amount, null, null, null, p_on_date, v_reason);
  v_alloc := private.allocate_entry(e.id, null);
  perform private.mark_division_posted(b.division_id);
  return private.ref_store(v_fn, p_client_ref, private.entry_result(e, v_alloc, null));
end
$$;

-- إلغاء قيد افتتاح أو تسوية أو إعفاء (FOUNDATION ٥٩١): قيد عكسي يتزوّج بأصله، والتوزيعات تنفكّ (القاعدة 27).
create or replace function public.void_party_entry(p_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_party_entry';
  v_cached jsonb;
  v_reason text;
  o public.party_entries;
  r public.party_entries;
  v_rev uuid;
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into o from public.party_entries where org_id = public.auth_org() and id = p_id;
  if o.id is null then
    raise exception 'entry_not_found' using hint = 'هذا القيد غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if o.kind not in ('opening', 'adjustment', 'forgiveness') or o.reverses_entry_id is not null then
    raise exception 'entry_not_voidable' using hint = 'يُلغى من هنا قيد الافتتاح والتسوية والإعفاء فقط؛ القبض والدفع من «ألغِ القبض أو الدفع»، والمستندات من مستندها.';
  end if;
  perform private.book_for_post(o.book_id);
  perform private.lock_parties(array[o.party_id]);
  perform private.check_void_date();
  v_rev := private.void_entry(o.id, v_reason);
  select * into r from public.party_entries where org_id = o.org_id and id = v_rev;
  return private.ref_store(v_fn, p_client_ref, private.entry_result(r, '[]'::jsonb, null));
end
$$;

-- ─── الصناديق (Q10): الرصيد الافتتاحي والنقل بين الصناديق وإلغاؤهما؛ والسالب مسموح بتنبيه ظاهر ─────────────────────────
-- الرصيد الافتتاحي (opening.post): بيوم تشغيل أقدم وحدة أو قبله، مستثنى من حدّ الأيام السبعة، وواحد فعّال لكل صندوق.
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

-- النقل بين صندوقين (payment.post): حركتان متعاكستان بنفس المستند (doc_id = معرّف النقل)، والصندوقان مقفولان بترتيب المعرّف.
create or replace function public.transfer_cash(p_id uuid, p_from uuid, p_to uuid, p_amount numeric, p_on_date date, p_note text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'transfer_cash';
  v_cached jsonb;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_box uuid;
  m1 public.cash_moves;
  m2 public.cash_moves;
begin
  set local lock_timeout = '5s';
  perform private.require('payment.post');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'from', p_from, 'to', p_to, 'amount', p_amount, 'on_date', p_on_date, 'note', p_note));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.check_new_id(p_id);
  if p_from is null or p_to is null then
    raise exception 'cash_account_required' using hint = 'اختر الصندوقين: المحوَّل منه والمحوَّل إليه.';
  end if;
  if p_from = p_to then
    raise exception 'same_account' using hint = 'الصندوقان واحد؛ اختر صندوقاً آخر للتحويل إليه.';
  end if;
  perform private.check_amount(p_amount, true);
  if v_note is not null and length(v_note) > 500 then
    raise exception 'note_too_long' using hint = 'الملاحظة حتى 500 حرف.';
  end if;
  perform private.period_guard();
  perform private.check_doc_date(p_on_date);
  for v_box in select x from unnest(array[p_from, p_to]) as x order by 1 loop
    perform private.lock_cash_account(v_box, true);
  end loop;
  m1 := private.write_cash_move(p_from, -p_amount, 'transfer', 'cash_transfer', p_id, null, p_on_date, null, v_note, p_id);
  m2 := private.write_cash_move(p_to, p_amount, 'transfer', 'cash_transfer', p_id, null, p_on_date, null, v_note);
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'kind', 'transfer', 'from', p_from, 'to', p_to, 'on_date', p_on_date,
    'moves', jsonb_build_array(m1.id, m2.id), 'money', jsonb_build_object('amount', p_amount::text)));
end
$$;

-- إلغاء رصيد صندوق افتتاحي أو نقل (void): حركة عكسية لكل وجه بيوم الإلغاء. حركات القبض والدفع والاستلام والمصاريف تُلغى من
-- مستندها.
create or replace function public.void_cash_move(p_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_cash_move';
  v_cached jsonb;
  v_reason text;
  m public.cash_moves;
  x public.cash_moves;
  v_back public.cash_moves;
  v_out jsonb := '[]'::jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into m from public.cash_moves where org_id = public.auth_org() and id = p_id;
  if m.id is null then
    raise exception 'cash_move_not_found' using hint = 'هذه الحركة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if m.kind not in ('opening', 'transfer') or m.reverses_move_id is not null then
    raise exception 'void_from_source' using hint = 'تُلغى هذه الحركة من مستندها: القبض أو الدفع أو الاستلام أو المصروف.';
  end if;
  perform private.check_void_date();
  for x in
    select y.* from public.cash_moves y
    where y.org_id = m.org_id and y.reverses_move_id is null
      and (y.id = m.id or (m.kind = 'transfer' and y.kind = 'transfer' and y.doc_kind = m.doc_kind and y.doc_id = m.doc_id))
    order by y.account_id
  loop
    perform private.lock_cash_account(x.account_id, false);
  end loop;
  if exists (
    select 1 from public.cash_moves y join public.cash_moves r on r.org_id = y.org_id and r.reverses_move_id = y.id
    where y.org_id = m.org_id and (y.id = m.id or (m.kind = 'transfer' and y.kind = 'transfer' and y.doc_kind = m.doc_kind and y.doc_id = m.doc_id))
  ) then
    raise exception 'already_reversed' using hint = 'هذه الحركة أُلغيت من قبل.';
  end if;
  for x in
    select y.* from public.cash_moves y
    where y.org_id = m.org_id and y.reverses_move_id is null
      and (y.id = m.id or (m.kind = 'transfer' and y.kind = 'transfer' and y.doc_kind = m.doc_kind and y.doc_id = m.doc_id))
    -- seq ترتيب داخل الصندوق بس، فوجها النقل (بصندوقين) بترتيب ثابت: الصادر أوّلاً مثل كتابة النقل.
    order by y.amount, y.account_id
  loop
    v_back := private.write_cash_move(x.account_id, -x.amount, x.kind, x.doc_kind, x.doc_id, null, public.app_today(), x.id, v_reason);
    v_out := v_out || jsonb_build_array(v_back.id);
  end loop;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', m.id, 'kind', m.kind, 'reversals', v_out));
end
$$;

-- ─── المعاينة (FOUNDATION ٧٧٠): نفس المحرّك بلا كتابة ─────────────────────────────────────────────────────────────
-- p_kind: payment («قبضنا»، −|المبلغ|) وpayout («دفعنا»، +|المبلغ|) لـpayment.post؛ وadjustment (المبلغ موقّعاً) وforgiveness
-- (بعكس الرصيد) لـparty.adjust؛ وopening (موقّعاً) لـopening.post. القيود المفتوحة المعاكسة ويّا الخطّة، والمال داخل money.
create or replace function public.preview_party_allocation(p_party uuid, p_book uuid, p_kind text, p_amount numeric) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  b public.ledger_books;
  v_balance numeric;
  v_signed numeric;
  v_plan jsonb;
  v_open jsonb;
  v_taken numeric;
begin
  if p_kind in ('payment', 'payout') then
    perform private.require('payment.post');
  elsif p_kind in ('adjustment', 'forgiveness') then
    perform private.require('party.adjust');
  elsif p_kind = 'opening' then
    perform private.require('opening.post');
  else
    raise exception 'kind_unknown' using hint = 'نوع القيد للمعاينة غير معروف.';
  end if;
  b := private.book_for_post(p_book);
  perform private.party_for_post(p_party);
  perform private.check_amount(p_amount, p_kind in ('payment', 'payout', 'forgiveness'));
  select coalesce(sum(x.amount), 0) into v_balance from public.party_entries x where x.org_id = b.org_id and x.party_id = p_party and x.book_id = b.id;
  v_signed := case p_kind
    when 'payment' then -p_amount
    when 'payout' then p_amount
    when 'forgiveness' then -sign(v_balance) * p_amount
    else p_amount end;
  if p_kind = 'forgiveness' and v_balance = 0 then
    raise exception 'balance_zero' using hint = format('رصيد الجهة في «%s» صفر، فلا شيء يُعفى منه.', b.name);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('entry_id', p.entry_id, 'kind', e.kind, 'doc_no', e.doc_no, 'on_date', e.on_date, 'amount', p.amount::text)
      order by n), '[]'::jsonb), coalesce(sum(p.amount), 0)
  into v_plan, v_taken
  from private.allocation_plan(p_party, b.id, v_signed, null, null) with ordinality as p(entry_id, amount, n)
  join public.party_entries e on e.org_id = b.org_id and e.id = p.entry_id;
  select coalesce(jsonb_agg(jsonb_build_object('entry_id', x.id, 'kind', x.kind, 'opening', x.kind = 'opening' and x.reverses_entry_id is null,
      'on_date', x.on_date, 'seq', x.seq::text, 'signed', x.amount::text, 'remaining', x.remaining::text) order by x.on_date, x.seq), '[]'::jsonb)
  into v_open
  from (
    select e.*, private.entry_remaining(e.id) as remaining from public.party_entries e
    where e.org_id = b.org_id and e.party_id = p_party and e.book_id = b.id
  ) as x where x.remaining > 0;
  return jsonb_build_object('party_id', p_party, 'book_id', b.id, 'kind', p_kind,
    'money', jsonb_build_object('amount', v_signed::text, 'balance_before', v_balance::text, 'balance_after', (v_balance + v_signed)::text,
      'allocations', v_plan, 'surplus', (abs(v_signed) - v_taken)::text, 'open', v_open));
end
$$;

-- ─── التقارير (FOUNDATION ٤٤٦، ٧٨٨): invoker (سياسات القراءة نفسها، والنطاق بالدفاتر E49) ويّا فحص صريح يرفض forbidden، حتى
-- المشاهد ما يحسب صفر صفوف «ماكو ديون». المجاميع من هنا مو من سحب الصفوف (§2.8). ما تنادي private (invoker ما يوصله).
-- الأرصدة لكل وحدة وللمشروع: «لنا» = Σ max(رصيد (جهة، دفتر)، 0) و«علينا» = Σ max(−الرصيد، 0)، بلا تصافٍ (FOUNDATION ٤٣٥)،
-- بتاريخ p_to (بلاه لحد يوم الخادم، فالصفحة المفتوحة من أمس تشوف قبض اليوم)؛ وعدد الجهات؛ والدفاتر الظاهرة من المجموع (القارئ
-- المحصور يشوف «N من المجموع»، E49)، والوحدات اللي إلها دفتر بنطاقه بس (وحدة برّاه ما تبين «0 / 0» كأن ما عليها ديون).
create or replace function public.report_accounts_summary(p_from date, p_to date) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_to date := coalesce(p_to, public.app_today());
begin
  if not (public.can('accounts.view') and public.can_see_accounts()) then
    raise exception 'forbidden' using hint = 'الحسابات للمالك والمدير والمحاسب فقط.';
  end if;
  if p_from is null or p_from > v_to then
    raise exception 'period_required' using hint = 'حدّد المدّة: من تاريخ إلى تاريخ لا يسبقه.';
  end if;
  return (
    with balances as (
      select e.party_id, e.book_id, b.division_id, sum(e.amount) as balance
      from public.party_entries e join public.ledger_books b on b.org_id = e.org_id and b.id = e.book_id
      where e.org_id = v_org and e.on_date <= v_to
      group by e.party_id, e.book_id, b.division_id
    ), per_division as (
      select d.id, d.kind,
        coalesce(sum(greatest(x.balance, 0)), 0) as receivable,
        coalesce(sum(greatest(-x.balance, 0)), 0) as payable,
        count(distinct x.party_id) filter (where x.balance <> 0) as nonzero
      from public.divisions d left join balances x on x.division_id = d.id
      where d.org_id = v_org and d.archived_at is null
        and exists (select 1 from public.ledger_books k where k.org_id = d.org_id and k.division_id = d.id and k.archived_at is null and public.in_scope_book(k.id))
      group by d.id, d.kind
    )
    select jsonb_build_object(
      'from', p_from, 'to', v_to,
      'divisions', coalesce((select jsonb_agg(jsonb_build_object('division_id', id, 'kind', kind, 'receivable', receivable::text, 'payable', payable::text,
        'parties_nonzero', nonzero) order by kind collate "C") from per_division), '[]'::jsonb),
      'project', jsonb_build_object(
        'receivable', coalesce((select sum(receivable) from per_division), 0)::text,
        'payable', coalesce((select sum(payable) from per_division), 0)::text,
        'parties_nonzero', (select count(distinct party_id) from balances where balance <> 0),
        'parties_all', (select count(*) from public.parties p where p.org_id = v_org and p.archived_at is null)),
      'books', jsonb_build_object(
        'visible', (select count(*) from public.ledger_books b where b.org_id = v_org and b.archived_at is null and public.in_scope_book(b.id)),
        'total', (select count(*) from public.ledger_books b where b.org_id = v_org and b.archived_at is null)),
      -- لكل دفتر «لنا» و«علينا» (صفّا التذييل تحت عمود كل دفتر بجدول الجهات).
      'book_totals', coalesce((
        select jsonb_agg(jsonb_build_object('book_id', x.book_id, 'receivable', x.receivable::text, 'payable', x.payable::text) order by x.book_id)
        from (select book_id, sum(greatest(balance, 0)) as receivable, sum(greatest(-balance, 0)) as payable from balances group by book_id) as x
      ), '[]'::jsonb)
    )
  );
end
$$;

-- جدول الجهات (FOUNDATION ٧٨٨): صفحة بالمعرّف (keyset) لكل جهة بخلية لكل دفتر ظاهر (المدوَّر قبل p_from، وحركة المدّة، والرصيد
-- بتاريخ p_to، وأقدم قيد مفتوح، والافتتاح الفعّال)، وترتيب بالأكبر (Σ|الرصيد| بالدفاتر) أو بأقدم دين أو بالاسم، والمؤشّر على
-- (مفتاح الترتيب، المعرّف). البحث نصّ مطبَّع بمرآة الواجهة (searchable): يحتوي الاسم المطبَّع؛ والنصّ اللي كلّه رقم هاتف (أرقام
-- وفراغات و+ و- وأقواس) أرقامه (بلا الأصفار الأولى) يحتويها مفتاح الهاتف، أمّا رقم بنصّ اسم («مزرعة 2») فبحث بالاسم بس (كان يطابق
-- كل جهة بهاتفها الرقم). p_nonzero: الجهات اللي بيها رصيد بدفتر ظاهر بس. والعدد الكلّي بأوّل صفحة. بلا p_to لحد يوم الخادم.
create or replace function public.report_party_balances(p_from date, p_to date, p_division uuid, p_nonzero boolean, p_sort text, p_search text,
  p_after jsonb, p_limit int) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_to date := coalesce(p_to, public.app_today());
  v_sort text := coalesce(nullif(p_sort, ''), 'balance');
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_name text := nullif(btrim(coalesce(p_search, '')), '');
  v_digits text;
  v_after_id uuid := nullif(p_after ->> 'id', '')::uuid;
  v_rows jsonb;
  v_total bigint;
  v_books jsonb;
begin
  if not (public.can('accounts.view') and public.can_see_accounts()) then
    raise exception 'forbidden' using hint = 'الحسابات للمالك والمدير والمحاسب فقط.';
  end if;
  if p_from is null or p_from > v_to then
    raise exception 'period_required' using hint = 'حدّد المدّة: من تاريخ إلى تاريخ لا يسبقه.';
  end if;
  if v_sort not in ('balance', 'oldest', 'name') then
    raise exception 'sort_unknown' using hint = 'الترتيب بالأكبر رصيداً أو بأقدم دين أو بالاسم.';
  end if;
  if v_name ~ '^[0-9 +()-]+$' then
    v_digits := nullif(ltrim(regexp_replace(v_name, '[^0-9]', '', 'g'), '0'), '');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('book_id', b.id, 'division_id', b.division_id, 'division_kind', d.kind, 'code', b.code, 'name', b.name)
      order by d.kind collate "C", b.code collate "C"), '[]'::jsonb)
  into v_books
  from public.ledger_books b join public.divisions d on d.org_id = b.org_id and d.id = b.division_id
  where b.org_id = v_org and b.archived_at is null and (p_division is null or b.division_id = p_division) and public.in_scope_book(b.id);

  with books as (
    select b.id from public.ledger_books b
    where b.org_id = v_org and b.archived_at is null and (p_division is null or b.division_id = p_division) and public.in_scope_book(b.id)
  ), entries as (
    select e.*, exists (select 1 from public.party_entries r where r.org_id = e.org_id and r.reverses_entry_id = e.id) as reversed,
      abs(e.amount) - coalesce((
      select sum(a.amount) from public.party_allocations a
      where a.org_id = e.org_id and a.party_id = e.party_id and a.book_id = e.book_id
        and ((e.amount > 0 and a.debit_entry_id = e.id) or (e.amount < 0 and a.credit_entry_id = e.id))
    ), 0) as remaining
    from public.party_entries e join books k on k.id = e.book_id
    where e.org_id = v_org
  ), cells as (
    select x.party_id, x.book_id,
      coalesce(sum(x.amount) filter (where x.on_date < p_from), 0) as opening,
      coalesce(sum(x.amount) filter (where x.on_date between p_from and v_to and x.amount > 0), 0) as debit,
      coalesce(-sum(x.amount) filter (where x.on_date between p_from and v_to and x.amount < 0), 0) as credit,
      coalesce(sum(x.amount) filter (where x.on_date <= v_to), 0) as closing,
      min(x.on_date) filter (where x.remaining > 0) as oldest,
      (array_agg(x.id) filter (where x.kind = 'opening' and x.reverses_entry_id is null and not x.reversed))[1] as opening_id,
      (array_agg(x.amount) filter (where x.kind = 'opening' and x.reverses_entry_id is null and not x.reversed))[1] as opening_amount
    from entries x
    group by x.party_id, x.book_id
  ), per_party as (
    select p.id, p.name, p.name_norm, p.phone, p.is_customer, p.is_supplier, p.archived_at, p.version,
      coalesce(sum(abs(c.closing)), 0) as weight,
      coalesce(sum(c.closing), 0) as total,
      coalesce(bool_or(c.closing <> 0), false) as nonzero,
      min(c.oldest) as oldest,
      coalesce(jsonb_agg(jsonb_build_object('book_id', c.book_id, 'opening', c.opening::text, 'debit', c.debit::text, 'credit', c.credit::text,
        'closing', c.closing::text, 'oldest', c.oldest, 'opening_entry_id', c.opening_id, 'opening_amount', c.opening_amount::text))
        filter (where c.book_id is not null), '[]'::jsonb) as cells
    from public.parties p left join cells c on c.party_id = p.id
    where p.org_id = v_org
      and (v_name is null or position(v_name in p.name_norm) > 0 or (v_digits is not null and position(v_digits in coalesce(p.phone_key, '')) > 0))
    group by p.id
  ), filtered as (
    select * from per_party where (not coalesce(p_nonzero, true) or nonzero)
  ), paged as (
    select f.* from filtered f
    where p_after is null or case v_sort
      when 'balance' then f.weight < (p_after ->> 'weight')::numeric or (f.weight = (p_after ->> 'weight')::numeric and f.id > v_after_id)
      when 'oldest' then case when p_after ->> 'oldest' is null then f.oldest is null and f.id > v_after_id
        else f.oldest > (p_after ->> 'oldest')::date or (f.oldest = (p_after ->> 'oldest')::date and f.id > v_after_id) or f.oldest is null end
      else f.name_norm collate "C" > (p_after ->> 'name') collate "C" or (f.name_norm = (p_after ->> 'name') and f.id > v_after_id)
    end
    order by case when v_sort = 'balance' then f.weight end desc, case when v_sort = 'oldest' then f.oldest end asc nulls last,
      case when v_sort = 'name' then f.name_norm end collate "C" asc, f.id
    limit v_limit + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('party_id', g.id, 'name', g.name, 'name_norm', g.name_norm, 'phone', g.phone, 'is_customer', g.is_customer,
      'is_supplier', g.is_supplier, 'archived', g.archived_at is not null, 'version', g.version, 'weight', g.weight::text, 'total', g.total::text,
      'oldest', g.oldest, 'cells', g.cells)
      order by case when v_sort = 'balance' then g.weight end desc, case when v_sort = 'oldest' then g.oldest end asc nulls last,
        case when v_sort = 'name' then g.name_norm end collate "C" asc, g.id), '[]'::jsonb),
    case when p_after is null then (select count(*) from filtered) end
  into v_rows, v_total
  from paged g;

  return jsonb_build_object(
    'books', v_books,
    'rows', (select coalesce(jsonb_agg(r order by n), '[]'::jsonb) from jsonb_array_elements(v_rows) with ordinality as x(r, n) where n <= v_limit),
    'next', case when jsonb_array_length(v_rows) > v_limit then (
      select jsonb_build_object('id', r ->> 'party_id', 'weight', r ->> 'weight', 'oldest', r ->> 'oldest', 'name', r ->> 'name_norm')
      from jsonb_array_elements(v_rows) with ordinality as x(r, n) where n = v_limit) end,
    'total', v_total
  );
end
$$;

-- كشف الجهة (FOUNDATION ٧٨٨، E50): لكل دفتر ظاهر بيه قيد للجهة (أو الدفتر المطلوب): المدوَّر قبل p_from، وقيود المدّة بترتيب
-- (on_date, seq) بعليه وله ورصيد جارٍ، والمجاميع والرصيد الأخير. سطر القبض والدفع باسم صندوق حركته (تأكيد إلغائه يسمّيه).
create or replace function public.report_party_statement(p_party uuid, p_book uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_party jsonb;
  v_to date := coalesce(p_to, public.app_today());
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
  return jsonb_build_object('party', v_party, 'from', p_from, 'to', v_to, 'books', coalesce((
    select jsonb_agg(jsonb_build_object(
        'book_id', b.id, 'code', b.code, 'name', b.name, 'division_id', b.division_id, 'division_kind', d.kind,
        'brought_forward', s.bf::text, 'total_debit', s.debit::text, 'total_credit', s.credit::text, 'closing', (s.bf + s.debit - s.credit)::text,
        'lines', s.lines)
      order by d.kind collate "C", b.code collate "C")
    from public.ledger_books b
    join public.divisions d on d.org_id = b.org_id and d.id = b.division_id
    cross join lateral (
      select
        coalesce((select sum(e.amount) from public.party_entries e where e.org_id = v_org and e.party_id = p_party and e.book_id = b.id and e.on_date < p_from), 0) as bf,
        coalesce((select sum(e.amount) from public.party_entries e where e.org_id = v_org and e.party_id = p_party and e.book_id = b.id
          and e.on_date between p_from and v_to and e.amount > 0), 0) as debit,
        coalesce((select -sum(e.amount) from public.party_entries e where e.org_id = v_org and e.party_id = p_party and e.book_id = b.id
          and e.on_date between p_from and v_to and e.amount < 0), 0) as credit,
        coalesce((
          select jsonb_agg(jsonb_build_object('entry_id', l.id, 'on_date', l.on_date, 'seq', l.seq::text, 'kind', l.kind, 'doc_no', l.doc_no,
              'reason', l.reason, 'reverses', l.reverses_entry_id, 'reversed', l.reversed, 'account', l.account, 'debit', greatest(l.amount, 0)::text,
              'credit', greatest(-l.amount, 0)::text, 'balance', l.balance::text)
            order by l.on_date, l.seq)
          from (
            select e.*, exists (select 1 from public.party_entries r where r.org_id = e.org_id and r.reverses_entry_id = e.id) as reversed,
              (select a.name from public.cash_moves m join public.cash_accounts a on a.org_id = m.org_id and a.id = m.account_id
               where m.org_id = e.org_id and m.party_entry_id = e.id and m.reverses_move_id is null) as account,
              coalesce((select sum(z.amount) from public.party_entries z where z.org_id = v_org and z.party_id = p_party and z.book_id = b.id and z.on_date < p_from), 0)
                + sum(e.amount) over (order by e.on_date, e.seq rows between unbounded preceding and current row) as balance
            from public.party_entries e
            where e.org_id = v_org and e.party_id = p_party and e.book_id = b.id and e.on_date between p_from and v_to
          ) as l
        ), '[]'::jsonb) as lines
    ) as s
    where b.org_id = v_org and b.archived_at is null and public.in_scope_book(b.id)
      and (b.id = p_book or (p_book is null and exists (select 1 from public.party_entries e where e.org_id = v_org and e.party_id = p_party and e.book_id = b.id)))
  ), '[]'::jsonb));
end
$$;

-- أرصدة الصناديق (Q10): لكل صندوق المدوَّر قبل p_from والوارد والصادر بالمدّة والرصيد بتاريخ p_to (بلاه لحد يوم الخادم؛ مجموع
-- الحركات بـSQL)، والمجموع.
create or replace function public.report_cash_balances(p_from date, p_to date) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_to date := coalesce(p_to, public.app_today());
begin
  if not (public.can('accounts.view') and public.can_see_accounts()) then
    raise exception 'forbidden' using hint = 'الحسابات للمالك والمدير والمحاسب فقط.';
  end if;
  if p_from is null or p_from > v_to then
    raise exception 'period_required' using hint = 'حدّد المدّة: من تاريخ إلى تاريخ لا يسبقه.';
  end if;
  return (
    with boxes as (
      select a.id, a.name, a.kind, a.archived_at, a.version,
        coalesce(sum(m.amount) filter (where m.on_date < p_from), 0) as opening,
        coalesce(sum(m.amount) filter (where m.on_date between p_from and v_to and m.amount > 0), 0) as inflow,
        coalesce(-sum(m.amount) filter (where m.on_date between p_from and v_to and m.amount < 0), 0) as outflow,
        coalesce(sum(m.amount) filter (where m.on_date <= v_to), 0) as closing,
        exists (select 1 from public.cash_moves o where o.org_id = a.org_id and o.account_id = a.id and o.kind = 'opening' and o.reverses_move_id is null
          and not exists (select 1 from public.cash_moves r where r.org_id = o.org_id and r.reverses_move_id = o.id)) as has_opening
      from public.cash_accounts a left join public.cash_moves m on m.org_id = a.org_id and m.account_id = a.id
      where a.org_id = v_org
      group by a.id
    )
    select jsonb_build_object('from', p_from, 'to', v_to,
      'accounts', coalesce((select jsonb_agg(jsonb_build_object('account_id', id, 'name', name, 'kind', kind, 'archived', archived_at is not null,
        'version', version, 'has_opening', coalesce(has_opening, false), 'opening', opening::text, 'inflow', inflow::text, 'outflow', outflow::text,
        'closing', closing::text) order by archived_at is not null, name collate "C", id) from boxes), '[]'::jsonb),
      'total', jsonb_build_object('opening', coalesce((select sum(opening) from boxes), 0)::text, 'inflow', coalesce((select sum(inflow) from boxes), 0)::text,
        'outflow', coalesce((select sum(outflow) from boxes), 0)::text, 'closing', coalesce((select sum(closing) from boxes), 0)::text))
  );
end
$$;

-- كشف الصندوق (Q12): نفس الجدول الكلاسيكي بعمودي «وارد | صادر»: المدوَّر، والحركات بترتيب (on_date, seq) برصيد جارٍ.
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

-- ─── ملخّص الرئيسية (E38): دالّة واحدة تكبر بكل حزمة؛ بطاقة الحسابات لمن يرى الحسابات بس، بتاريخ اليوم ────────────────
create or replace function public.home_summary() returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
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
        where e.org_id = v_org and e.on_date <= public.app_today()
        group by e.party_id, e.book_id
      ) as x));
  end if;
  return v_out;
end
$$;

-- ─── التوائم (Q2، FOUNDATION ٨١٣): نفس مفتاح الهاتف أو نفس الاسم المطبَّع، تنبيه ثم سماح، والمؤرشفة ويّاها، بلا أرصدة ─────
create or replace function public.find_party_twins(p_name text, p_phone text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_name text := nullif(private.searchable(coalesce(p_name, '')), '');
  v_key text := private.phone_key(p_phone);
begin
  if v_org is null then
    return '[]'::jsonb;
  end if;
  perform private.require('party.create');
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'phone', p.phone, 'archived', p.archived_at is not null,
        'is_customer', p.is_customer, 'is_supplier', p.is_supplier,
        'same_name', v_name is not null and p.name_norm = v_name, 'same_phone', v_key is not null and p.phone_key = v_key)
      order by p.archived_at is not null, p.name_norm collate "C", p.id)
    from public.parties p
    where p.org_id = v_org and ((v_name is not null and p.name_norm = v_name) or (v_key is not null and p.phone_key = v_key))
  ), '[]'::jsonb);
end
$$;

-- ─── الثوابت (FOUNDATION ٤٣٥، الخطّة WP3): صفر مخالفة بالحزمة وبالإنتاج. definer لأنه يقرأ كل المنشآت ويستعير هويّة مالك كل
-- منشأة ليقارن تقاريرها (invoker) بالمعادلة من الصفوف الخام؛ لـservice_role بس ─────────────────────────────────────────
create or replace function public.verify_ledger() returns table (check_name text, violations bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_bad bigint := 0;
  v_org record;
  v_user uuid;
  v_report jsonb;
  v_cash jsonb;
begin
  return query
  with rem as (
    select e.org_id, e.id, e.party_id, e.book_id, e.kind, e.amount, e.reverses_entry_id, e.doc_kind, e.doc_no, e.on_date,
      abs(e.amount) - coalesce((
        select sum(a.amount) from public.party_allocations a
        where a.org_id = e.org_id and a.party_id = e.party_id and a.book_id = e.book_id
          and ((e.amount > 0 and a.debit_entry_id = e.id) or (e.amount < 0 and a.credit_entry_id = e.id))
      ), 0) as remaining
    from public.party_entries e
  )
  -- 1. المتبقّي المقداري بين صفر و|المبلغ|.
  select 'entry_remaining_range'::text, count(*) from rem where remaining < 0 or remaining > abs(amount)
  union all
  -- 2. لكل (جهة، دفتر): Σ المبالغ = Σ متبقّي الموجبة − Σ متبقّي السالبة (يلزم من 3، وينفحص بمصدره).
  select 'book_balance_identity', count(*) from (
    select org_id, party_id, book_id from rem group by org_id, party_id, book_id
    having sum(amount) <> coalesce(sum(remaining) filter (where amount > 0), 0) - coalesce(sum(remaining) filter (where amount < 0), 0)
  ) as x
  union all
  -- 3. كل توزيع بين قيد موجب وقيد سالب لنفس (الجهة، الدفتر) المكتوبين عليه، والعكس بنفس قيديه ومبلغه المعاكس.
  select 'allocation_pairs', count(*) from public.party_allocations a
  left join public.party_entries d on d.org_id = a.org_id and d.id = a.debit_entry_id
  left join public.party_entries c on c.org_id = a.org_id and c.id = a.credit_entry_id
  left join public.party_allocations o on o.org_id = a.org_id and o.id = a.reverses_allocation_id
  where d.id is null or c.id is null or d.amount <= 0 or c.amount >= 0
    or d.party_id <> a.party_id or d.book_id <> a.book_id or c.party_id <> a.party_id or c.book_id <> a.book_id
    or (a.reverses_allocation_id is not null and (o.id is null or o.debit_entry_id <> a.debit_entry_id or o.credit_entry_id <> a.credit_entry_id
      or o.amount <> -a.amount or o.reverses_allocation_id is not null))
  union all
  -- 4. كل قيد عكسي بنوع أصله وبمبلغه المعاكس، ومتوزّع بالكامل على أصله (زوج مغلق).
  select 'reversal_pairs', count(*) from public.party_entries r
  join public.party_entries o on o.org_id = r.org_id and o.id = r.reverses_entry_id
  where o.kind <> r.kind or r.amount <> -o.amount or o.reverses_entry_id is not null or o.party_id <> r.party_id or o.book_id <> r.book_id
    or coalesce((select sum(a.amount) from public.party_allocations a where a.org_id = r.org_id
      and ((a.debit_entry_id = r.id and a.credit_entry_id = o.id) or (a.debit_entry_id = o.id and a.credit_entry_id = r.id))), 0) <> abs(o.amount)
  union all
  -- 5. مبالغ الدفاتر والتوزيع والصناديق بدينار صحيح.
  select 'whole_dinar', (select count(*) from public.party_entries where amount <> round(amount, 0))
    + (select count(*) from public.party_allocations where amount <> round(amount, 0))
    + (select count(*) from public.cash_moves where amount <> round(amount, 0))
  union all
  -- 6. النوع وإشارته (FOUNDATION ٣١٣)، والعكسي بالإشارة المعاكسة.
  select 'kind_sign', count(*) from public.party_entries
  where (kind in ('invoice', 'payout', 'supplier_return') and (amount > 0) <> (reverses_entry_id is null))
    or (kind in ('purchase', 'bill', 'payment', 'return') and (amount < 0) <> (reverses_entry_id is null))
    or kind not in ('invoice', 'purchase', 'bill', 'payment', 'payout', 'return', 'supplier_return', 'forgiveness', 'opening', 'adjustment', 'offset')
  union all
  -- 7. كل قيد قبض أو دفع (أصلاً وعكساً) بحركة صندوق وحدة بالاتّجاه المعاكس.
  select 'payment_cash_moves', count(*) from public.party_entries e
  where e.kind in ('payment', 'payout')
    and (select count(*) from public.cash_moves m where m.org_id = e.org_id and m.party_entry_id = e.id and m.amount = -e.amount) <> 1
  union all
  -- 8. كل حركة صندوق مربوطة بمصدرها: القبض بقيد payment والدفع بقيد payout وبالمبلغ المعاكس؛ دفعة الاستلام ونقله والمصروف
  --    مصادرها بالحزم الجاية (WP5/WP6)، فحركة بيها بلا مصدر مخالفة لحد ما تنضاف؛ والافتتاح بلا مستند.
  select 'cash_move_sources', count(*) from public.cash_moves m
  left join public.party_entries e on e.org_id = m.org_id and e.id = m.party_entry_id
  where (m.kind = 'party_payment' and (e.id is null or e.kind <> 'payment' or m.amount <> -e.amount))
    or (m.kind = 'party_payout' and (e.id is null or e.kind <> 'payout' or e.doc_kind is not null or m.amount <> -e.amount))
    or m.kind in ('receipt_paid', 'receipt_charge', 'expense')
    or (m.kind = 'opening' and (m.doc_kind is not null or m.party_entry_id is not null))
    or (m.kind = 'transfer' and (m.doc_kind is distinct from 'cash_transfer' or m.party_entry_id is not null))
  union all
  -- 8. والعكس: كل حركة عكسية بنفس صندوق أصلها ونوعه ومستنده وبمبلغه المعاكس، مرّة وحدة؛ وحركة القيد العكسي لقيده العكسي.
  select 'cash_move_reversals', count(*) from public.cash_moves r
  join public.cash_moves o on o.org_id = r.org_id and o.id = r.reverses_move_id
  where o.account_id <> r.account_id or o.kind <> r.kind or r.amount <> -o.amount or o.reverses_move_id is not null
    or o.doc_kind is distinct from r.doc_kind or o.doc_id is distinct from r.doc_id
    or (o.party_entry_id is not null and not exists (select 1 from public.party_entries x where x.org_id = r.org_id and x.id = r.party_entry_id
      and x.reverses_entry_id = o.party_entry_id))
  union all
  -- 8. النقل: وجهان أصليان بصندوقين مختلفين ومجموعهما صفر لكل مستند.
  select 'cash_transfer_legs', count(*) from (
    select org_id, doc_id from public.cash_moves where kind = 'transfer' and reverses_move_id is null group by org_id, doc_id
    having count(*) <> 2 or sum(amount) <> 0 or count(distinct account_id) <> 2
  ) as x
  union all
  -- 8. رصيد افتتاحي فعّال واحد لكل صندوق.
  select 'cash_opening_once', count(*) from (
    select o.org_id, o.account_id from public.cash_moves o
    where o.kind = 'opening' and o.reverses_move_id is null and not exists (select 1 from public.cash_moves r where r.org_id = o.org_id and r.reverses_move_id = o.id)
    group by o.org_id, o.account_id having count(*) > 1
  ) as x
  union all
  -- رصيد افتتاحي فعّال واحد لكل (جهة، دفتر) (E20: المعكوس ما ينحسب).
  select 'party_opening_once', count(*) from (
    select o.org_id, o.party_id, o.book_id from public.party_entries o
    where o.kind = 'opening' and o.reverses_entry_id is null and not exists (select 1 from public.party_entries r where r.org_id = o.org_id and r.reverses_entry_id = o.id)
    group by o.org_id, o.party_id, o.book_id having count(*) > 1
  ) as x
  union all
  -- 10. اكتمال التوزيع (القاعدة 27): ما يجتمع بنفس (الجهة، الدفتر) متبقٍّ موجب ومتبقٍّ سالب.
  select 'allocation_completeness', count(*) from (
    select org_id, party_id, book_id from rem where remaining > 0 group by org_id, party_id, book_id
    having bool_or(amount > 0) and bool_or(amount < 0)
  ) as x
  union all
  -- 11. الترقيم: لكل (منشأة، نوع، سنة) بالعدّاد، الأصول المرقّمة (القبض RC والدفع PY المستقلّان) بأرقام 1…last_no بلا فجوة ولا
  --     تكرار، وكل رقم بنوعه وسنة تاريخه، وماكو رقم بلا عدّاد. كل حزمة جاية تزيد مصدرها (TR وSU وCT وPU وRT).
  select 'doc_numbers', (
    select count(*) from (
      select n.org_id, n.kind, n.year, count(*) as items, count(distinct n.no) as distinct_no, min(n.no) as min_no, max(n.no) as max_no
      from (
        select e.org_id, split_part(e.doc_no, '-', 1) as kind, split_part(e.doc_no, '-', 2)::int as year, split_part(e.doc_no, '-', 3)::int as no
        from public.party_entries e
        where e.reverses_entry_id is null and e.doc_kind is null and e.doc_no is not null
      ) as n
      group by n.org_id, n.kind, n.year
    ) as g
    full join (select * from public.doc_counters where kind in ('RC', 'PY')) as c on c.org_id = g.org_id and c.kind = g.kind and c.year = g.year
    where g.org_id is null or c.org_id is null or g.items <> g.distinct_no or g.min_no <> 1 or g.max_no <> c.last_no or g.distinct_no <> c.last_no
  ) + (
    select count(*) from public.party_entries e
    where e.reverses_entry_id is null and e.doc_kind is null
      and ((e.kind = 'payment' and (e.doc_no is null or e.doc_no !~ '^RC-')) or (e.kind = 'payout' and (e.doc_no is null or e.doc_no !~ '^PY-'))
        or (e.kind not in ('payment', 'payout') and e.doc_no is not null)
        or (e.doc_no is not null and split_part(e.doc_no, '-', 2) <> to_char(e.on_date, 'YYYY')))
  )
  union all
  -- E14: وحدة بيها قيد جهة مختومة بأوّل ترحيل (first_posted_at)، فيوم تشغيلها متجمّد (mark_division_posted بكل دالّة ترحيل).
  select 'posted_division_stamped', count(*) from public.divisions d
  where d.first_posted_at is null
    and exists (select 1 from public.party_entries e join public.ledger_books b on b.org_id = e.org_id and b.id = e.book_id where b.org_id = d.org_id and b.division_id = d.id);

  -- 9. التقارير = المعادلة من الصفوف الخام، لكل منشأة بيها قيود أو حركات، بهويّة مالك حيّ منها (التقرير invoker، والدالّة صاحبة
  --    الجداول فتشوف كل صفوف المنشأة). الهويّة ترجع كما كانت بالآخر. المقارنة is distinct from: مفتاح غايب (NULL) فرق، مو صفر.
  for v_org in select x.org_id from (select org_id from public.party_entries union select org_id from public.cash_moves) as x order by 1 loop
    select m.user_id into v_user from public.members m
    where m.org_id = v_org.org_id and m.role = 'owner' and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
    order by m.created_at, m.id limit 1;
    continue when v_user is null;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    begin
      v_report := public.report_accounts_summary(date '2000-01-01', date '9999-12-31');
      v_cash := public.report_cash_balances(date '2000-01-01', date '9999-12-31');
      v_bad := v_bad + (
        select count(*) from public.divisions d
        left join lateral (
          select coalesce(sum(greatest(s.balance, 0)), 0) as receivable, coalesce(sum(greatest(-s.balance, 0)), 0) as payable
          from (
            select sum(e.amount) as balance from public.party_entries e join public.ledger_books b on b.org_id = e.org_id and b.id = e.book_id
            where e.org_id = d.org_id and b.division_id = d.id group by e.party_id, e.book_id
          ) as s
        ) as raw on true
        left join lateral (
          select x from jsonb_array_elements(v_report -> 'divisions') as x where x ->> 'division_id' = d.id::text
        ) as rep on true
        where d.org_id = v_org.org_id and d.archived_at is null
          and (rep.x is null or (rep.x ->> 'receivable')::numeric is distinct from raw.receivable or (rep.x ->> 'payable')::numeric is distinct from raw.payable)
      ) + (
        select count(*) from public.cash_accounts a
        left join lateral (select x from jsonb_array_elements(v_cash -> 'accounts') as x where x ->> 'account_id' = a.id::text) as rep on true
        where a.org_id = v_org.org_id
          and (rep.x is null or (rep.x ->> 'closing')::numeric is distinct from coalesce((select sum(m.amount) from public.cash_moves m where m.org_id = a.org_id and m.account_id = a.id), 0))
      ) + (
        case when (v_report -> 'project' ->> 'receivable')::numeric is distinct from coalesce((select sum((x ->> 'receivable')::numeric) from jsonb_array_elements(v_report -> 'divisions') as x), 0)
          or (v_report -> 'project' ->> 'payable')::numeric is distinct from coalesce((select sum((x ->> 'payable')::numeric) from jsonb_array_elements(v_report -> 'divisions') as x), 0)
        then 1 else 0 end
      );
    exception when others then
      v_bad := v_bad + 1;
    end;
  end loop;
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  return query select 'report_formulas'::text, v_bad;
end
$$;

-- ─── قائمة السماح (نسختها بـsupabase/tests/allowlist.json) ─────────────────────────────────────────────────────
grant execute on function
  public.in_scope_book(uuid),
  public.record_opening_balance(uuid, uuid, uuid, numeric, date, uuid),
  public.record_party_payment(uuid, uuid, uuid, numeric, uuid, date, uuid),
  public.pay_party(uuid, uuid, uuid, numeric, uuid, date, uuid),
  public.void_party_payment(uuid, text, uuid),
  public.record_party_adjustment(uuid, uuid, uuid, text, numeric, date, text, uuid),
  public.forgive_debt(uuid, uuid, uuid, numeric, date, text, uuid),
  public.void_party_entry(uuid, text, uuid),
  public.record_cash_opening(uuid, uuid, numeric, date, uuid),
  public.transfer_cash(uuid, uuid, uuid, numeric, date, text, uuid),
  public.void_cash_move(uuid, text, uuid),
  public.preview_party_allocation(uuid, uuid, text, numeric),
  public.report_accounts_summary(date, date),
  public.report_party_balances(date, date, uuid, boolean, text, text, jsonb, integer),
  public.report_party_statement(uuid, uuid, date, date),
  public.report_cash_balances(date, date),
  public.report_cash_statement(uuid, date, date),
  public.home_summary(),
  public.find_party_twins(text, text)
to authenticated;

grant execute on function public.verify_ledger() to service_role;
