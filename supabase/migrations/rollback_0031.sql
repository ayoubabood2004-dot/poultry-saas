-- rollback_0031 — تراجع 0031_halls_history («من أوّل ما بدينا» في تقرير القاعات؛ مشغّل التراجع بالحزمة FOUNDATION ٨٢٠، ٨٧٦). يُسقط halls_history
-- وset_halls_note وverify_halls_history وجدول halls_day_notes (ومحفّزه وسياسته) وعدّاد نسخه، ويرجّع جسم private.actions كما في 0022 حرفاً بحرف (md5 نفسه
-- بالكتالوج)، فيسقط فعل halls_note.write معه (private.role_can لم يتغيّر: المدير يملك كلّ فعل في القائمة).
-- **طريق رفض (الكتلة الأولى أدناه):** إسقاط الجدول يمسح ملاحظات المالك على أيّام التقرير، ولا تُستخرج من مكان آخر؛ والصفّ الممسوح نصّه يحمل نسخة رآها
-- كاتب (إسقاطه ثمّ إعادة الهجرة يبدأ العدّاد من 1، فتعبر نسخة قديمة شرط الكتابة: درس ABA 2026-11-16). فالملف يرفض نفسه إن كان في الجدول صفّ.
-- تنعاد بأمان: drop if exists، وcreate or replace، وفحص وجود الجدول قبل عدّه.

set lock_timeout = '5s';

-- ٠) طريق الرفض: لا تُمسح ملاحظات التقرير. الجدول يُقفل قبل العدّ ولحدّ نهاية المعاملة (درس WP4): ملاحظة تُكتب بلحظة التراجع تنتظر أو تُعدّ.
do $$
declare
  v_notes bigint;
begin
  if to_regclass('public.halls_day_notes') is null then
    return;
  end if;
  execute 'lock table public.halls_day_notes in access exclusive mode';
  execute 'select count(*) from public.halls_day_notes' into v_notes;
  if v_notes > 0 then
    raise exception 'rollback_blocked' using hint = format('توجد %s ملاحظة على أيّام تقرير القاعات، والتراجع يمسحها. انسخها أوّلاً أو اترك الهجرة.', v_notes);
  end if;
end
$$;

-- ١) الدوالّ الجديدة، ثمّ الجدول وعدّاده:
drop function if exists public.verify_halls_history();
drop function if exists public.set_halls_note(date, text, bigint);
drop function if exists public.halls_history(date);
drop table if exists public.halls_day_notes;
drop sequence if exists private.halls_note_versions;

-- ٢) قائمة الأفعال كما في 0022:
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
