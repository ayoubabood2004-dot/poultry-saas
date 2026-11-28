# Contract 0037 — «الكاز» (kerosene) beside the gas in the hall sheet and the batch report

Owner's request and answers: `docs/DECISIONS.md` section «2026-11-26». Kerosene is **a number only, like the gas** (no stock, no cost), **one column in litres** (typed in litres or in barrels; a barrel = 200 litres, converted on the device; the server stores litres). **Only the hall sheet and the batch report** — not the daily round, not the daily/history/cycle reports.

Base: `main` = production (0036). Rules that bind every part: CLAUDE.md (Fusha UI text through `t()`; numbers through `format.ts`; `DataTable` only; no `window.confirm`; one RPC per write with `client_ref`; every feature/fix with a test that FAILS on the code before it; no ceiling raise).

Two parts built in parallel, integrated by the main session:
- **D** — migration `0037_kerosene` (DB only; a worktree agent).
- **S** — repo parser, offline queue op, hall sheet column and cell sheet, batch report (main session).

---

## Part D — `supabase/migrations/0037_kerosene.sql` (+ `rollback_0037.sql`, tests, real samples)

Mirror the gas of `0035_hall_sheet.sql` (§أ table, `private.flock_gas_json`, §هـ `set_flock_gas`) for kerosene, word for word where possible. Build every changed function on its **latest body** (all four below are last defined in **0035**); `rollback_0037.sql` restores those bodies **word for word** and drops everything new.

### D1. Table `public.flock_day_kerosene`
Same shape as `public.flock_day_gas`, with `liters integer` instead of `cylinders`:
- `constraint flock_day_kerosene_liters_check check (liters is null or liters between 0 and 20000)`, `flock_day_kerosene_version_check (version >= 1)`, `flock_day_kerosene_on_date_check (isfinite(on_date))`, `unique (org_id, id)`, `unique (org_id, flock_id, on_date)`, the two foreign keys as gas, index `flock_day_kerosene_hall`.
- RLS on; read policy `flock_day_kerosene_read` (org + `in_scope_site(site_id)`) exactly like gas; audit trigger `audit_flock_day_kerosene`; `revoke all … from anon, authenticated; grant select … to authenticated; revoke truncate … from service_role`.
- A row is **never deleted** while its batch lives (clearing = `liters null` with a bigger version — the ABA lesson 2026-11-16).

### D2. `private.flock_kerosene_json(p_on date, k public.flock_day_kerosene) returns jsonb`
`{"on": p_on, "liters": k.liters, "version": k.version}` (no row → liters and version null), like `flock_gas_json`.

### D3. `public.set_flock_kerosene(p_flock uuid, p_on date, p_liters integer, p_expected_version bigint, p_client_ref uuid, p_queued boolean default false) returns jsonb`
Exactly `set_flock_gas` (0035) with these differences only:
- `v_fn = 'set_flock_kerosene'`; `ref_claim` payload keys `flock, on, liters, expected_version, queued`.
- `date_in_future` hint names the kerosene: `format('يوم %s لم يأتِ بعد؛ يُكتب الكاز لليوم %s أو لما قبله من أيّام الوجبة.', …)`.
- Parked (queued + `flock_closed` / `out_of_scope` / `period_locked`): `payload = {"kerosene": p_liters}`, `visit_id = md5('kerosene:' || coalesce(auth.uid()::text, '') || ':' || f.id::text || ':' || to_char(p_on, 'YYYY-MM-DD'))::uuid`, same `on conflict … do update` (version + 1, decision cleared); returns `{"status":"parked","reason":…}`.
- `bad_value` when `p_liters < 0 or p_liters > 20000`: hint `'الكاز باللتر عدد صحيح من صفر إلى 20,000.'`.
- Same value now (or no row and `p_liters` null) → `{"status":"saved","kerosene":{on,liters,version}}` with no write and no new version. Changed since the device's version → `{"status":"stale_kerosene","server":{on,liters,version}}`. Otherwise insert (version 1) or update (`version + 1`, `updated_at/by`) and return `saved` with the row.
- Locks and order exactly as gas: `period_guard` → flock row `for update` → `flock_day_check(f, p_on)` → kerosene row `for update`. Permission `flock_day.save` (every active member, 0034).
- Grants as `set_flock_gas` (execute to authenticated only).

### D4. `public.hall_sheet(p_flock)` (latest body 0035) — additive keys only
- Each day: `'kerosene'` (litres or null) and `'kerosene_version'` (null without a row), from a `left join public.flock_day_kerosene ks` beside the gas join.
- `totals.kerosene`: `coalesce(sum(liters), 0)::bigint`; `summary.kerosene`: the same number.
- Every other key, order and meaning unchanged (the deployed UI reads it between apply and merge).

### D5. Guards (latest bodies 0035)
- `public.edit_flock`: the `least(...)` of first activity days also takes `(select min(x.on_date) from public.flock_day_kerosene x where x.org_id = f.org_id and x.flock_id = f.id and x.liters is not null)` (placement cannot move after a kerosene day).
- `private.flock_activity_after`: `union all select 'كاز', k.on_date, 8 from public.flock_day_kerosene k where … and k.liters is not null` (a batch is not closed before its last kerosene day).
- `public.delete_flock`: kerosene recorded (`liters is not null`) is named «الكاز» in `flock_has_records` (after «الغاز»); cleared rows (`liters is null`) are deleted with the batch (before the flock delete, like gas).

### D6. `public.verify_kerosene() returns table (check_name text, violations bigint)`
New (do not rewrite `verify_hall_sheet`): `kerosene_days` (a row's day outside `placed_on .. coalesce(closed_on, app_today())` of its batch, or the batch not placed), `kerosene_versions` (`version < 1`), `kerosene_hall` (hall/site/division differ from the batch's), `sheet_kerosene_totals` (for every placed batch, as its org's owner like `verify_hall_sheet`: `hall_sheet(f).totals.kerosene` ≠ Σ `days[].kerosene`, and `summary.kerosene` ≠ `totals.kerosene`). Every check proven by a mutation in the tests (a broken body inside a rolled-back transaction, not a hand-written row).

### D7. Rollback `rollback_0037.sql`
Restores `hall_sheet`, `edit_flock`, `flock_activity_after`, `delete_flock` to their 0035 bodies word for word; drops `set_flock_kerosene`, `flock_kerosene_json`, `verify_kerosene`, the table. **Refuses loudly** (`raise exception` with a sentence) when any `flock_day_kerosene` row exists (even cleared: a device saw its version) or any `flock_day_rejects` row whose payload has the key `kerosene`. Register the blocking cases in `supabase/tests/seed.mjs` (`BLOCKING_REQUIRED` / `BLOCKING_SEEDS`) like 0035's gas, and the rollback runner must pass (`--upto` digest equal after rollback, verify zero).

### D8. Harness registrations
`supabase/tests/allowlist.json` (the new writer and verify), `role-matrix.test.mjs` (both places gas appears: the writer per role, and another org's flock → `flock_not_found`), any constraint-sentence table the constraints test reads (`src/lib/repo/constraints-flocks.ts` — the only `src/` file Part D may touch), and whatever catalog test asks for (run the whole DB suite, not only the new file).

### D9. Tests `supabase/tests/kerosene.test.mjs`
Mirror the gas cases of `hall-sheet.test.mjs`: saved (insert/update, same value no new version, clear to null keeps the row with version + 1), stale (old version, no version with a row, after clearing), every refusal code by a direct call (`flock_not_found`, `date_required`, `date_in_future`, `before_placement`, `flock_closed`, `flock_not_placed`, `period_locked`, `out_of_scope`, `bad_value` at −1 and 20,001; 0 and 20,000 accepted), queued parking (closed/out of scope/period locked → `parked`, payload `{"kerosene": n}`, re-parking bumps the reject version and clears the decision), ref replay (same result, different args → the existing ref rule), two real sessions racing for one day without a version (second waits on the flock row then `stale_kerosene`), `hall_sheet` keys (days, totals, summary; cleared day = null liters with its version), `edit_flock` / close (`flock_activity_after`) / `delete_flock` guards naming «كاز»/«الكاز», cleared rows deleted with the batch, `verify_kerosene` zero after every file and each check caught by its mutation, role matrix, rollback.
Check every new id/phone prefix against **all** test files (grep) before use.

### D10. Real samples
With an env switch like `HALL_SHEET_SAMPLES_OUT`, write `scripts/tests/fixtures/kerosene-0037.json`: `{ hall_sheet: <a broiler batch with kerosene on two days and one cleared day>, set_flock_kerosene_saved, set_flock_kerosene_stale, set_flock_kerosene_parked }` (as returned by the database).

Deliver on a branch with: the migration, the rollback, the tests, registrations, the fixture; `node supabase/tests/run.mjs` all green (and the rollback runner), `npm run lint` green. Report the digest (`--digest`) after the migration.

---

## Part S — screens (main session)

- `src/lib/repo/hallSheet.ts`: `SheetDay.kerosene: number | null`, `keroseneVersion: number | null` (absent → null for old samples), `totals.kerosene`, `summary.kerosene` (absent → 0).
- Outbox: `set_flock_kerosene` queueable like `set_flock_gas` (one op per batch + day, merged into the newest pending one, version chained to the next op of the same day; results `saved` (`kerosene`), `stale_kerosene`, `parked`, `rejected`; review shelf names «الكاز» and both values).
- Hall sheet: column «الكاز (لتر)» after «الغاز» with its server total; editable in edit mode; the touch cell sheet has «لتر | برميل» (barrel × 200), «امسح الكاز»; the grid accepts a number in litres or a number followed by «ب» for barrels (e.g. «2ب» = 400 litres); parked kerosene reads «الكاز n لتر».
- Batch report: column «الكاز (لتر)» after «الغاز» with its total in the last row, and summary row «الكاز (لتر)».
- Real samples from D pass through the real parsers.
