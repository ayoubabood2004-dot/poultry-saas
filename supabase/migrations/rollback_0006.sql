-- rollback_0006 — تراجع 0006_parties_ledger_cash (خطّة المرحلة 1 WP3، مشغّل التراجع بالحزمة FOUNDATION ٨٢٠، ٨٧٦).
-- يشيل اللي انضاف بـ0006: الجداول الستّة (الجهات والصناديق والعدّاد والقيود والتوزيع وحركات الصناديق) وكل دوالّها، وعمود
-- item_units.party_id وقيده وفهرسه، وسياسة نطاق الدفاتر على سجلّ التدقيق (audit_log_book_scope). 0006 ما بدّلت جسم دالّة قديمة،
-- فماكو جسم يرجع.
-- المال ما ينحذف أبداً (FOUNDATION ٦٣): أي قيد جهة أو حركة صندوق، أو وحدة تعبئة مربوطة بمورّد (عمود بجدول قديم)، يوقف التراجع
-- بصوت ويرجع كلّه (المعاملة وحدة)، والمالك يقرّر شنو يسوّي بيها. الجهات والصناديق بلا حركة بيانات أساسية تنشال ويّا جداولها.
-- سجلّ التدقيق يبقى كما هو (صفوف الجداول المشالة بيه تاريخ، مو مفتاح أجنبي).

set lock_timeout = '5s';

do $$
declare
  v_entries bigint;
  v_moves bigint;
  v_units bigint;
begin
  select count(*) into v_entries from public.party_entries;
  select count(*) into v_moves from public.cash_moves;
  select count(*) into v_units from public.item_units where party_id is not null;
  if v_entries > 0 or v_moves > 0 or v_units > 0 then
    raise exception 'rollback_blocked' using hint = format('توجد %s من قيود الجهات و%s من حركات الصناديق و%s من وحدات التعبئة المربوطة بمورّد، والتراجع لا يحذف المال ولا الربط. قرّر مصيرها أوّلاً ثم أعد التراجع.', v_entries, v_moves, v_units);
  end if;
end
$$;

drop policy if exists audit_log_book_scope on public.audit_log;

drop function if exists public.verify_ledger();
drop function if exists public.find_party_twins(text, text);
drop function if exists public.home_summary();
drop function if exists public.report_cash_statement(uuid, date, date);
drop function if exists public.report_cash_balances(date, date);
drop function if exists public.report_party_statement(uuid, uuid, date, date);
drop function if exists public.report_party_balances(date, date, uuid, boolean, text, text, jsonb, integer);
drop function if exists public.report_accounts_summary(date, date);
drop function if exists public.preview_party_allocation(uuid, uuid, text, numeric);
drop function if exists public.void_cash_move(uuid, text, uuid);
drop function if exists public.transfer_cash(uuid, uuid, uuid, numeric, date, text, uuid);
drop function if exists public.record_cash_opening(uuid, uuid, numeric, date, uuid);
drop function if exists public.void_party_entry(uuid, text, uuid);
drop function if exists public.forgive_debt(uuid, uuid, uuid, numeric, date, text, uuid);
drop function if exists public.record_party_adjustment(uuid, uuid, uuid, text, numeric, date, text, uuid);
drop function if exists public.void_party_payment(uuid, text, uuid);
drop function if exists public.pay_party(uuid, uuid, uuid, numeric, uuid, date, uuid);
drop function if exists public.record_party_payment(uuid, uuid, uuid, numeric, uuid, date, uuid);
drop function if exists private.post_payment(text, text, uuid, uuid, uuid, numeric, uuid, date, uuid);
drop function if exists public.record_opening_balance(uuid, uuid, uuid, numeric, date, uuid);
drop function if exists private.entry_result(public.party_entries, jsonb, public.cash_moves);
drop function if exists private.write_cash_move(uuid, numeric, text, text, uuid, uuid, date, uuid, text, uuid);
drop function if exists private.void_entry(uuid, text);
drop function if exists private.write_entry(uuid, uuid, uuid, text, numeric, text, uuid, text, date, text);
drop function if exists private.allocate_entry(uuid, uuid);
drop function if exists private.allocation_plan(uuid, uuid, numeric, uuid, uuid);
drop function if exists private.entry_remaining(uuid);
drop function if exists private.check_new_id(uuid);
drop function if exists private.check_reason(text);
drop function if exists private.check_amount(numeric, boolean);
drop function if exists private.party_for_post(uuid);
drop function if exists private.book_for_post(uuid);
drop function if exists private.mark_division_posted(uuid);
drop function if exists private.check_void_date();
drop function if exists private.check_opening_date(date, uuid);
drop function if exists private.check_post_date(date, uuid);
drop function if exists private.division_for_post(uuid);
drop function if exists private.next_doc_no(text, date);
drop function if exists private.lock_cash_account(uuid, boolean);
drop function if exists private.lock_parties(uuid[]);
drop function if exists private.period_guard();
drop function if exists private.ref_store(text, uuid, jsonb);
drop function if exists private.ref_claim(text, uuid, jsonb);
drop function if exists private.mask(jsonb);
drop function if exists private.strip_money(jsonb);

drop index if exists public.item_units_party;
alter table public.item_units drop constraint if exists item_units_party_fkey;
alter table public.item_units drop column if exists party_id;

-- الجداول (ويّاها مشغّلاتها وسياساتها وفهارسها وتسلسلاتها)، الأبعد أوّلاً حتى المفاتيح الأجنبية تنشال قبل هدفها.
drop table if exists public.cash_moves;
drop table if exists public.party_allocations;
drop table if exists public.party_entries;
drop table if exists public.doc_counters;
drop table if exists public.cash_accounts;
drop table if exists public.parties;

drop function if exists public.in_scope_book(uuid);
drop function if exists private.cash_moves_seq();
drop function if exists private.party_entries_seq();
drop function if exists private.cash_moves_check();
drop function if exists private.party_allocations_check();
drop function if exists private.party_entries_check();
drop function if exists private.cash_accounts_check();
drop function if exists private.parties_check();
