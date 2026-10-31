-- rollback_0012 — تراجع 0012_flocks_daily (حقول اللحم وحقول البيض، النسخة الأولى؛ مشغّل التراجع بالحزمة FOUNDATION ٨٢٠، ٨٧٦).
-- يرجّع جسم sites_check كما بـ0005 حرفاً بحرف (md5 نفسه بالكتالوج)، ويشيل اللي انضاف بـ0012: الجداول الخمسة (halls وflocks
-- وflock_daily وflock_day_rejects وflock_weights) ودوالّها ومساعداتها ومشغّلاتها وسياساتها. ماكو بيانات تنحذف: أي قاعة (ولو بلا
-- فوج) أو فوج أو جولة أو جولة مركونة أو وزن يوقف التراجع بصوت ويرجع كلّه (المعاملة وحدة)، والمالك يقرّر شنو يسوّي بيه. سجلّ
-- التدقيق يبقى كما هو.

set lock_timeout = '5s';

-- الجداول تتقفل قبل العدّ ولحد نهاية المعاملة (درس WP4).
lock table public.halls, public.flocks, public.flock_daily, public.flock_day_rejects, public.flock_weights in access exclusive mode;

do $$
declare
  v_halls bigint;
  v_flocks bigint;
  v_days bigint;
  v_rejects bigint;
  v_weights bigint;
begin
  select count(*) into v_halls from public.halls;
  select count(*) into v_flocks from public.flocks;
  select count(*) into v_days from public.flock_daily;
  select count(*) into v_rejects from public.flock_day_rejects;
  select count(*) into v_weights from public.flock_weights;
  if v_halls + v_flocks + v_days + v_rejects + v_weights > 0 then
    raise exception 'rollback_blocked' using hint = format('توجد %s قاعة و%s فوجاً و%s جولة يومية و%s جولة مركونة و%s وزناً، والتراجع لا يحذف بيانات الحقول. قرّر مصيرها أوّلاً ثم أعد التراجع.',
      v_halls, v_flocks, v_days, v_rejects, v_weights);
  end if;
end
$$;

create or replace function private.sites_check() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_division text;
  v_expected text;
begin
  select d.kind into v_division from public.divisions d where d.org_id = new.org_id and d.id = new.division_id;
  v_expected := private.site_kind_for(v_division);
  if v_division is not null and new.kind is distinct from v_expected then
    raise exception 'site_kind_mismatch' using hint = 'نوع الموقع لا يناسب وحدته: المعمل لمعمل العلف، والمفقس للمفقس، والحقل لحقول اللحم والبيض، والمخزن لمخزن الأدوية والمخازن العامة.';
  end if;
  if tg_op = 'UPDATE' and new.archived_at is not null and old.archived_at is null
     and exists (select 1 from public.warehouses w where w.org_id = new.org_id and w.site_id = new.id and w.archived_at is null) then
    raise exception 'archived_in_use' using hint = 'في هذا الموقع مخازن فعّالة. أرشف مخازنه أوّلاً ثم أرشف الموقع.';
  end if;
  return new;
end
$$;

drop function if exists public.open_flock(uuid, date, integer, integer, text, uuid);
drop function if exists public.save_flock_day(uuid, date, integer, integer, numeric, numeric, numeric, numeric, integer, integer, integer, text, integer, uuid, boolean);
drop function if exists public.record_flock_weight(uuid, date, integer, numeric, uuid);
drop function if exists public.flocks_overview();
drop function if exists public.flock_detail(uuid);
drop function if exists public.verify_flocks();
drop function if exists private.flock_summary(public.flocks);
drop function if exists private.flock_pct(numeric, numeric);
drop function if exists private.flock_day_json(public.flock_daily);

drop table if exists public.flock_weights;
drop table if exists public.flock_day_rejects;
drop table if exists public.flock_daily;
drop table if exists public.flocks;
drop table if exists public.halls;

drop function if exists private.flocks_place();
drop function if exists private.halls_check();
