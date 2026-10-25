-- 0003_invite_codes — الدعوة تنقبل برمز يسلّمه المالك للموظف بيده، وزرّ «رفض وحظر» (أجوبة المالك 2026-10-25).
-- المشكلة: بلا SMS أي واحد يسجّل برقم الموظف قبله يستلم دعوته، ولو قبلها يشوف حسابات المزرعة حسب دوره. والمنشأة
--   الغريبة تعيد الدعوة بعد الرفض كل يوم باسم تكتبه هي («الدعم الفني: اتصل بهذا الرقم»).
-- هنا: (1) المالك يصدر رمزاً من 6 أرقام للدعوة (invite_code)، يبين له مرّة وحدة ويسلّمه للموظف بيده أو بالواتساب،
--   والقبول بالرمز بس (accept_invite_code): 5 محاولات غلط توقف الرمز، وينتهي بعد 7 أيام، وأرشفة الدعوة أو رفضها
--   تبطله (فإعادة الدعوة بعدها تحتاج رمزاً جديداً). accept_invite(uuid) بلا رمز ينسحب من الواجهة. (2) decline_and_block: يرفض ويحظر المنشأة،
--   فـadd_member منها لنفس الحساب يرفض. الرمز (hash بـbcrypt، مو نصّه) والحظر بمخطّط private: ما ينكشف ولا ينقرا.
-- تراجع: الجدولان جديدان وفارغان؛ التراجع create or replace لـadd_member وarchive_membership وaccept_invite بنصّها من
--   0001 ومنح accept_invite لـauthenticated، بكلمة المالك. ماكو بيانات قديمة تتغيّر.
-- تنعاد بأمان: if not exists وcreate or replace.

set lock_timeout = '5s';

-- رمز الدعوة: واحد لكل دعوة (الإصدار الجديد يستبدل القديم). used_at بعد القبول، وexpires_at = now() يبطله.
-- استثناء مسمّى من الأعمدة المشتركة والتدقيق: جدول أسرار بـprivate، مو بيانات منشأة تنعرض.
create table if not exists private.invite_codes (
  member_id uuid primary key,
  org_id uuid not null,
  code_hash text not null,
  expires_at timestamptz not null,
  failures int not null default 0 check (failures between 0 and 5),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (org_id, member_id) references public.members (org_id, id)
);
create index if not exists invite_codes_org_member on private.invite_codes (org_id, member_id);

-- حظر الدعوات: الحساب ما يندعى مرّة ثانية من هالمنشأة. ماكو فكّ حظر بعد (ينضاف لمّا يُطلب).
create table if not exists private.invite_blocks (
  user_id uuid not null references auth.users (id) on delete restrict,
  org_id uuid not null references public.orgs (id),
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);
create index if not exists invite_blocks_org on private.invite_blocks (org_id);

alter table private.invite_codes enable row level security;
alter table private.invite_blocks enable row level security;
revoke all on table private.invite_codes, private.invite_blocks from public, anon, authenticated;

-- 6 أرقام من pgcrypto (عشوائية تشفيرية). انحياز القسمة على مليون من 2^32 أقل من 0.03%.
create or replace function private.new_invite_code() returns text
language sql volatile set search_path = pg_catalog, pg_temp as $$
  with b as (select extensions.gen_random_bytes(4) as r)
  select lpad((((get_byte(r, 0)::bigint << 24) | (get_byte(r, 1)::bigint << 16) | (get_byte(r, 2)::bigint << 8) | get_byte(r, 3)) % 1000000)::text, 6, '0')
  from b
$$;

-- يبطل رمز الدعوة إذا بعده صالح (الأرشفة والرفض وإعادة الدعوة).
create or replace function private.expire_invite_code(p_member uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  update private.invite_codes set expires_at = now() where member_id = p_member and expires_at > now()
$$;

-- المالك يصدر رمز الدعوة (أو رمزاً جديداً يبطل القديم ويصفّر المحاولات)، ويرجع نصّه مرّة وحدة للشاشة.
create or replace function public.invite_code(p_member uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  m public.members;
  v_code text := private.new_invite_code();
begin
  perform private.require('members.manage');
  m := private.org_member(p_member);
  if m.accepted_at is not null then
    raise exception 'invite_already_accepted' using hint = 'هذا الموظف قبل الدعوة بالفعل، فلا يحتاج إلى رمز.';
  end if;
  insert into private.invite_codes (member_id, org_id, code_hash, expires_at)
  values (m.id, m.org_id, extensions.crypt(v_code, extensions.gen_salt('bf', 8)), now() + interval '7 days')
  on conflict (member_id) do update
    set code_hash = excluded.code_hash, expires_at = excluded.expires_at, failures = 0, used_at = null,
        created_at = now(), created_by = auth.uid();
  return v_code;
end
$$;

-- الموظف يقبل الدعوة بالرمز. الرمز الغلط جوابه نتيجة {error, hint, tries_left} مو خطأ: الخطأ يرجع المعاملة فيضيع
-- عدّاد المحاولات. الأرقام الشرقية والفراغات بالرمز تنقبل. الصحيح يرجّع my_workspace() مثل accept_invite.
create or replace function public.accept_invite_code(p_member uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_signed_in();
  v_code text := regexp_replace(translate(coalesce(p_code, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g');
  m public.members;
  c private.invite_codes;
  v_left int;
  v_current text;
begin
  perform pg_advisory_xact_lock(hashtextextended('membership:' || v_uid::text, 0));
  select * into m from public.members
  where id = p_member and user_id = v_uid and accepted_at is null and archived_at is null for update;
  if m.id is null then
    raise exception 'invite_not_found' using hint = 'هذه الدعوة غير موجودة أو انتهت. حدّث الشاشة.';
  end if;
  select * into c from private.invite_codes where member_id = m.id for update;
  if c.member_id is null or c.used_at is not null or c.expires_at <= now() then
    raise exception 'invite_code_expired' using hint = 'رمز الدعوة منتهٍ أو لم يُصدَر بعد. اطلب من صاحب المنشأة رمزاً جديداً.';
  end if;
  if c.failures >= 5 then
    raise exception 'invite_code_locked' using hint = 'أُدخل الرمز خطأً 5 مرات فأُوقف. اطلب من صاحب المنشأة رمزاً جديداً.';
  end if;
  if c.code_hash <> extensions.crypt(v_code, c.code_hash) then
    update private.invite_codes set failures = failures + 1 where member_id = c.member_id;
    v_left := 5 - c.failures - 1;
    return jsonb_build_object('error', 'invite_code_wrong', 'tries_left', v_left, 'hint', case v_left
      when 0 then 'الرمز غير صحيح، وأُوقف بعد 5 محاولات. اطلب من صاحب المنشأة رمزاً جديداً.'
      when 1 then 'الرمز غير صحيح. بقيت محاولة واحدة.'
      when 2 then 'الرمز غير صحيح. بقيت محاولتان.'
      else format('الرمز غير صحيح. بقيت %s محاولات.', v_left)
    end);
  end if;
  select o.name into v_current from public.members x join public.orgs o on o.id = x.org_id
  where x.user_id = v_uid and x.archived_at is null and x.accepted_at is not null;
  if found then
    raise exception 'already_member' using hint = format('أنت عضو في منشأة «%s». اخرج منها أولاً ثم اقبل الدعوة.', v_current);
  end if;
  update public.members set accepted_at = now() where org_id = m.org_id and id = m.id;
  update private.invite_codes set used_at = now() where member_id = c.member_id;
  return public.my_workspace();
end
$$;

-- القبول بلا رمز انسحب من الواجهة؛ لو انمنح بالغلط يرفض برمز يقول شنو الناقص.
create or replace function public.accept_invite(p_member uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'invite_code_required' using hint = 'اكتب رمز الدعوة الذي أعطاك إياه صاحب المنشأة.';
end
$$;
revoke execute on function public.accept_invite(uuid) from authenticated;

-- رفض الدعوة وحظر المنشأة من دعوة هذا الحساب مرّة ثانية.
create or replace function public.decline_and_block(p_member uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_signed_in();
  m public.members;
begin
  select * into m from public.members
  where id = p_member and user_id = v_uid and accepted_at is null and archived_at is null for update;
  if m.id is null then
    raise exception 'invite_not_found' using hint = 'هذه الدعوة غير موجودة أو انتهت. حدّث الشاشة.';
  end if;
  insert into private.invite_blocks (user_id, org_id) values (v_uid, m.org_id) on conflict do nothing;
  perform private.archive_membership(m);
end
$$;

-- الأرشفة (الخروج، الرفض، الأرشفة) تبطل رمز الدعوة ويّا النطاق.
create or replace function private.archive_membership(p_member public.members) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.member_scopes set archived_at = now()
  where org_id = p_member.org_id and member_id = p_member.id and archived_at is null;
  update public.members set archived_at = now() where org_id = p_member.org_id and id = p_member.id;
  perform private.expire_invite_code(p_member.id);
end
$$;

-- نفس add_member مال 0001، ويّا: الحساب اللي حظر المنشأة ما يندعى. إعادة الدعوة تجي بعد أرشفة بس، والأرشفة أبطلت
-- الرمز القديم (archive_membership)، فالمكان واحد.
create or replace function public.add_member(p_phone text, p_role text, p_display_name text, p_divisions uuid[] default '{}') returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_role text;
  v_display text;
  v_divisions uuid[];
  v_phone text;
  v_user uuid;
  v_member uuid;
begin
  perform private.require('members.manage');
  v_role := private.check_role(p_role);
  v_display := private.check_name(p_display_name, 80, 'اسم الموظف');
  v_divisions := private.check_divisions(p_divisions);
  v_phone := private.normalize_phone(p_phone);
  if v_phone is null then
    raise exception 'invalid_phone' using hint = 'اكتب رقم موبايل عراقياً صحيحاً، مثل 07701234567.';
  end if;
  v_user := private.user_id_for_phone(v_phone);
  if v_user is null then
    raise exception 'user_not_found' using hint = 'لا يوجد حساب بهذا الرقم. اطلب من الموظف أن يسجّل في التطبيق برقمه أولاً، ثم أضفه.';
  end if;
  if exists (select 1 from private.invite_blocks b where b.user_id = v_user and b.org_id = v_org) then
    raise exception 'invite_blocked' using hint = 'صاحب هذا الرقم رفض دعوات منشأتك وحظرها.';
  end if;
  if exists (select 1 from public.members where org_id = v_org and user_id = v_user and archived_at is null) then
    raise exception 'already_in_org' using hint = 'هذا الرقم عضو في منشأتك أو مدعوّ إليها بالفعل. عدّل دوره من قائمة الموظفين.';
  end if;
  insert into public.members (org_id, user_id, role, display_name, phone)
  values (v_org, v_user, v_role, v_display, v_phone)
  on conflict (org_id, user_id) do update
    set role = excluded.role, display_name = excluded.display_name, phone = excluded.phone, archived_at = null, accepted_at = null
  returning id into v_member;
  perform private.apply_scopes(v_member, v_divisions);
  return v_member;
end
$$;

-- قائمة السماح (نسختها بـsupabase/tests/allowlist.json).
grant execute on function public.invite_code(uuid), public.accept_invite_code(uuid, text), public.decline_and_block(uuid) to authenticated;
