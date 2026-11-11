-- rollback_0026 — تراجع «القاعات بين يديك» (0026_halls_v2): يُسقط محفّز صرف اللقاح المؤشَّر على flock_issues، والدوالّ الجديدة كلّها، وسياسة
--   نطاق سجلّ التدقيق، والجداول الخمسة (flock_vaccinations وflock_logs وvaccine_program_days وvaccine_programs وvaccines). لا جسم قديم يرجع:
--   0026 لم يغيّر دالّة قائمة.
-- **طريق رفض**: أيّ صفّ في الجداول الخمسة يوقف التراجع بصوت بلا أن يحذف شيئاً (التأشيرات تشير إلى صرف مرحَّل، والجدول والتسجيلات بيانات المالك).
-- تنعاد بأمان: drop if exists.

set lock_timeout = '5s';

lock table public.flock_vaccinations, public.flock_logs, public.vaccine_program_days, public.vaccine_programs, public.vaccines in access exclusive mode;

-- ٠) طريق الرفض، بفرع لكلّ حقيقة مستقلّة: لقاح في القائمة (التأشيرات وأيّام الجداول لا تقوم بلا لقاح: مفتاح، والمؤشَّر به لا يُمحى بل
--    يُخفى)، وجدول لقاحات (يقوم بلا أيّام)، وتسجيل دواء (لا يحتاج لقاحاً)، وسجلّ تدقيق لها بلا صفّ باقٍ (تسجيل حُذف أو لقاح مُحي).
do $$
declare
  v_vaccines bigint;
  v_marks bigint;
  v_days bigint;
  v_programs bigint;
  v_logs bigint;
  v_audit bigint;
begin
  select count(*) into v_vaccines from public.vaccines;
  select count(*) into v_marks from public.flock_vaccinations;
  select count(*) into v_days from public.vaccine_program_days;
  select count(*) into v_programs from public.vaccine_programs;
  select count(*) into v_logs from public.flock_logs;
  select count(*) into v_audit from public.audit_log
  where table_name in ('vaccines', 'vaccine_programs', 'vaccine_program_days', 'flock_logs', 'flock_vaccinations');
  if v_vaccines > 0 then
    raise exception 'rollback_blocked' using hint = format('توجد %s لقاحاً في القائمة و%s تأشير لقاح و%s يوماً في جداول اللقاحات، والتراجع يمسحها. لا تراجع لـ0026 بعد استعمالها.',
      v_vaccines, v_marks, v_days);
  end if;
  if v_programs > 0 then
    raise exception 'rollback_blocked' using hint = format('يوجد %s جدول لقاحات، والتراجع يمسحه. لا تراجع لـ0026 بعد استعمالها.', v_programs);
  end if;
  if v_logs > 0 then
    raise exception 'rollback_blocked' using hint = format('توجد %s تسجيل دواء للقاعات، والتراجع يمسحها. لا تراجع لـ0026 بعد استعمالها.', v_logs);
  end if;
  -- سجلّ التدقيق لا يُمحى، وسياسة نطاقه (audit_log_halls_scope) تسقط بالتراجع فيظهر ما فيه (اسم الدواء والجرعة والقاعة) لكلّ دور كلفة بلا نطاقه.
  if v_audit > 0 and v_vaccines + v_programs + v_logs = 0 then
    raise exception 'rollback_blocked' using hint = format('في سجلّ التدقيق %s صفّاً من جداول 0026 (تسجيلات أو لقاحات حُذفت)، والتراجع يُسقط سياسة نطاقها. لا تراجع لـ0026 بعد استعمالها.', v_audit);
  end if;
end
$$;

-- ١) المحفّز ودالّته، ثمّ الدوالّ الجديدة.
drop trigger if exists flock_issues_vaccination_guard on public.flock_issues;
drop function if exists private.flock_issue_vaccination_guard();
drop function if exists public.give_to_flocks(uuid, date, jsonb);
drop function if exists public.remove_flock_log(uuid);
drop function if exists public.undo_vaccination(uuid, text, uuid);
drop function if exists public.save_vaccine(uuid, text, uuid, int);
drop function if exists public.delete_vaccine(uuid, int);
drop function if exists public.save_vaccine_program(text, int, jsonb, int);
drop function if exists public.vaccine_board();
drop function if exists public.vaccine_reminders();
drop function if exists public.flock_month(uuid, date);
drop function if exists public.flock_cycle_report(uuid);
drop function if exists public.verify_halls();
drop function if exists private.hall_flock_json(public.flocks);
drop function if exists private.flock_slots(uuid);
drop function if exists private.flock_for(uuid, boolean);
drop function if exists private.derived_ref(uuid, int);

-- ٢) سياسة نطاق سجلّ التدقيق، ثمّ الجداول بترتيب مفاتيحها.
drop policy if exists audit_log_halls_scope on public.audit_log;
drop table if exists public.flock_vaccinations;
drop table if exists public.flock_logs;
drop table if exists public.vaccine_program_days;
drop table if exists public.vaccine_programs;
drop table if exists public.vaccines;
