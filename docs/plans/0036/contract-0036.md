# Contract 0036 — round deaths once, feed and gas in the round card, locked sheet with Excel-like edit grid, official tables and reports

Owner's request and answers: `docs/DECISIONS.md` section «2026-11-24». Base: branch `claude/festive-sagan-fq2iw3` at `d9e6f74` (= production 0035 + the keyboard number-pad fix `7e851b1..f78cf2e`, not yet merged to main).
Rules that bind every part: CLAUDE.md (Fusha UI text through `t()`; numbers through `format.ts`; `DataTable` is the only table; no `window.confirm`; money/stock writes are one RPC with `client_ref`; every fix/feature with a test that FAILS on the code before it; no ceiling raise; **no new Tailwind class in any file that lands in the boot CSS** — boot gzip headroom is ~600 bytes. New styles go in a **lazy CSS file** imported by the page's lazy chunk, with colours from `tokens.css` variables (the pattern of `src/pages/sales/doc.css` / `sell.css`, see `docs/SALES_UX_PLAN.md` «CSS كسول»).

Four parts, built in parallel in separate worktrees, integrated by the main session:
- **D** — migration `0036_round_once` (DB only).
- **R** — the daily round page + offline queue ops (screens/repo/outbox; must not edit `FlockPage.tsx`).
- **S1** — official look: `DataTable` official variant, wide pages, official reports (batch report, daily report, history), read-only sheet look.
- **S2** — hall sheet locked by default + pencil + Excel-like edit grid (new component; small edits in `FlockPage.tsx`).

---

## Part D — `supabase/migrations/0036_round_once.sql` (+ `rollback_0036.sql`, tests, real samples)

### D1. Deaths entered once a day
- `alter table public.flock_daily add column if not exists dead_entered boolean not null default false;`
- Backfill: `dead_entered = true` where `dead + culled > 0`. (Rows with 0 deaths stay false: the round lets the user enter that day's deaths.)
- `private.flock_day_json(d)` (latest body: 0012) adds `'dead_entered', d.dead_entered` (null row → null as today).
- `public.save_flock_day` and `public.save_flock_visit` (latest bodies: **0035**) set `dead_entered = true` on the day row when the call actually writes and `p_dead is not null or p_culled is not null` (not when parked, stale, refused or a no-op). Build on the 0035 bodies only; `rollback_0036` restores them word for word.

### D2. `public.set_flock_dead(p_flock uuid, p_on date, p_dead integer, p_client_ref uuid, p_queued boolean default false) returns jsonb`
- Idempotent by `client_ref` (`private.ref_claim`/`ref_store`, like the other day writers). `perform private.require('flock_day.save')`; `period_guard`; lock the flock row `for update`; `flock_not_found` for another org / missing.
- Queued (`p_queued`): `flock_closed`, `out_of_scope`, `period_locked` → park in `flock_day_rejects` exactly like `set_flock_gas` (0035) with a derived `visit_id = md5('dead:' || user || ':' || flock || ':' || day)::uuid`, payload `{dead}`; returns `{status:'parked', reason}`. Direct call: raise those codes with the usual hints.
- Date rules: `private.flock_day_check(f, p_on)` (0035: any day of the open batch, not future, not before placement, period lock).
- `p_dead` must be an integer 0..10,000,000 (`bad_value`).
- If the day row exists and `dead_entered` is true: same value → `{status:'saved', day}` with no write; different value → `{status:'dead_recorded', day}` (not an error; the day as it is). **Never adds to recorded deaths.**
- Otherwise insert one live visit (`source 'visit'`, `dead = p_dead`, every other field null, `recorded_at = now()`), rebuild the day (`private.flock_day_rebuild`), set `dead_entered = true`, run `private.flock_live_check(f)` (deaths above the live birds → `live_negative`, nothing kept). Returns `{status:'saved', day: flock_day_json}`.
- Two devices entering the same day: the second (after the first commits, flock row lock) gets `dead_recorded` (or `saved` if equal).

### D3. `public.add_flock_gas(p_flock uuid, p_on date, p_add integer, p_client_ref uuid, p_queued boolean default false) returns jsonb`
- Owner's answer: gas in the round **adds** to the day total. Idempotent by `client_ref`; same locks/park rules as `set_flock_gas` (0035) with derived `visit_id = md5('gasadd:' || client_ref)::uuid` (each add is its own op), payload `{gas_add}`.
- `p_add` 1..1000 (`bad_value`); the day total after adding must stay ≤ 1000 (`bad_value` with a hint naming the current total). Null cylinders count as 0.
- Writes `flock_day_gas` (insert version 1, or update `cylinders = coalesce(cylinders,0) + p_add, version = version + 1`). Returns `{status:'saved', gas: private.flock_gas_json(p_on, g)}`. Concurrent adds both land (row lock), total = sum.
- `set_flock_gas` stays as is (the sheet's correction sets the day total).

### D4. Readers for the round
- `private.flock_summary(f)` (latest body: **0029**) adds, for its `v_today`:
  - `gas_today` (int|null) and `gas_today_version` (int|null) from `flock_day_gas`;
  - `feed_today_kg` (text 3dp | null): sum of posted feed lines (`cost_kind = 'feed'`) whose `private.issue_day(x) = v_today`, by `private.issue_mass_kg`; null when none;
  - `feed_today` (array, possibly empty): per item `{item_id, item_name, qty (base unit, text 3dp), unit}` grouped by item for that day, ordered by first send;
  - `last_feed_item_id` (uuid|null): the item of the latest posted feed send to this flock (as `hall_sheet` computes `v_last`).
- `public.flocks_overview()` (latest body: 0012) adds top-level `feed_items`: `[{item_id, name, base_unit, on_hand, units:[{id, name, base_qty}]}]` — exactly `hall_sheet.feed_items` without `last`, for the caller's org (active feed items with `on_hand > 0` = the largest single feed store today, `private.stock_at`, ordered by name). No money anywhere.
- Every existing key keeps its meaning (old clients keep working).

### D5. Invariants, grants, tests
- `public.verify_round_once()` (service_role only): `dead_entered_flag` (rows with `dead + culled > 0 and not dead_entered`), `gas_cap` (`cylinders > 1000`), `gas_add_refs` (if you add a table for add refs: none expected).
- Grants: `set_flock_gas`-like (`authenticated` execute; revoke from public/anon).
- Tests in `supabase/tests/round-once.test.mjs` (register like the others): once semantics (direct, queued, ref replay, same value, different value), two real sessions racing for one day (second `dead_recorded`, no double count), `dead_entered` set by `save_flock_day`/`save_flock_visit` (and not by parked/stale/no-op calls), backfill, `add_flock_gas` (sum, cap, concurrency with two sessions, park, ref replay), readers' new keys for broiler and layer, role-matrix entries for the two new writers (every active member like the owner; another org's flock → `flock_not_found`), rollback runner (`rollback_0036.sql` restores the exact bodies; digest `--upto=0035` equal after rollback).
- Real samples: `HALL_SHEET_SAMPLES_OUT`-style env to write `scripts/tests/fixtures/round-once-0036.json` with: `flocks_overview` (broiler with feed today + gas today; layer), `set_flock_dead` saved / dead_recorded / parked, `add_flock_gas` saved / parked. Check id/phone prefixes against all test files (grep) before use.
- Report: digest `--digest` and `--digest --upto=0035`.

---

## Part R — the daily round (`src/pages/farm/RoundPage.tsx` and its helpers)

Must not edit `src/pages/farm/FlockPage.tsx` (S2 owns it). New/changed: `RoundPage.tsx`, `roundText.ts`, `src/domain/flocks.ts` (round text), `src/lib/repo/flocks.ts` (parse new overview keys, answers of the two new writers, transport), `src/lib/outbox/*` (two new queueable fns), and a shared feed-send hook (new file, e.g. `src/pages/farm/feedSend.ts`) — copy the semantics of `FeedSheet`'s send (`sendFlockFeed`, frozen request stored outside the component, `surelyUnsaved`, toast) without editing `FlockPage.tsx`.

1. **Remove** the «كلّ القاعات» card entirely (pick-all, per-hall checkboxes, «اصرف من المخزن للقاعات المختارة», «نفس الرقم لكلّ القاعات», «طبّق على المختارة») and «زيارات اليوم» from the round. Keep per-hall «أضف للقاعة» (medicines) and the review shelf.
2. **Per-hall card**, sections side by side on wide screens, stacked on phones:
   - **الهلاكات** — once a day. If today's deaths are entered (`today.dead_entered`, or a pending `set_flock_dead` op for today on this device): a shaded, non-editable box with the number and a lock mark, text «سُجّلت هلاكات اليوم» and «للتصحيح: صفحة القاعة ← ✎ تعديل» (link to the hall page). Otherwise a number field.
   - **العلف** — feed cards from `overview.feed_items`, each with its name and «عندك {qty} {unit}»; the hall's `last_feed_item_id` preselected; tap a card to choose; unit chips (the item's units, bag first, and the base unit) as in the sheet; a quantity field; button «أرسل {amount}» with a second line «من «{item}»» (or «أكثر ممّا عندك: …» and disabled when over `on_hand`, like the sheet). Sends immediately with `send_flock_feed` for today (needs a connection: offline → the section says so and the button is disabled). Above the cards: «أُرسل اليوم: {kg}» with the per-item list from `feed_today`. After a send the overview is re-read.
   - **الغاز (اختياري)** — «قناني أُرسلت الآن» field; line «اليوم: {n} قناني» (server `gas_today` + this device's pending adds). Saved with the round button (queue, offline OK) by `add_flock_gas`.
   - **Layers:** eggs fields stay as today (additive visits `save_flock_visit`, eggs only).
3. **One sticky button** «احفظ الجولة» (count of halls in its label as today) saves, per hall with something typed: deaths (`set_flock_dead`, only if not yet entered), gas add (`add_flock_gas`), layer eggs (`save_flock_visit` eggs only) — through the outbox and the single uploader. Feed is not part of it (its own button per card).
4. **Outbox:** queueable fns `set_flock_dead` (pending op for the same flock+day is replaced by the newer value) and `add_flock_gas` (pending adds for the same flock+day are summed into one op, or kept as separate ops — either, but never lost or double-sent; the merge rule is tested). Results: `saved`, `dead_recorded` (goes to the review shelf with «سُجّلت هلاكات هذا اليوم من جهاز آخر: {n}»), `parked`, `rejected`. Review shelf rows name the field and both values.
5. Keyboard: the number pad keyboard fix lives in `WeightPad`; the round uses plain inputs — keep `inputMode="numeric"` and make Enter in a deaths/gas field move to the next hall's same field (no submit).
6. Tests (fail before): farm-round (removed card absent; deaths locked when entered and when pending; feed cards with on-hand; send; over-limit disabled; gas adds; layer eggs), outbox (new fns, merge rules, upload mapping, `dead_recorded` to review), real samples from D through the real parsers once D's fixture exists (the main session wires that at integration if D is not done yet — leave a hand fixture with the exact contract shapes).

---

## Part S1 — official tables and reports

1. **`DataTable` official variant** (`variant?: 'plain' | 'official'`, default `'plain'` = today's look exactly). Official: a visible title band above the table (the `caption` text, or a new `title` prop) on a brand-coloured background with white/strong text; header row on a tinted brand background with strong borders; body text at base size (not `sm`), no truncation anywhere (wrap, sensible `min-width` per column), totals row bold on the tinted background; prints in colour (`print-color-adjust: exact`). Styles in a lazy CSS file (e.g. `src/components/ui/official.css`) imported **only** by the lazy chunks that use the variant (halls/farm pages), never by the boot chunk — verify with the build guards that boot size does not grow.
2. **Wide pages:** a way for a page to take more of the screen than the shell's `max-w-6xl` (e.g. a small store the page sets on mount and the shell reads; or a full-bleed wrapper) — used by the hall page, the batch report, the daily report and the history report. Phones unchanged (no horizontal page scroll; tables scroll inside their frame).
3. **Official reports («مثل تقارير المستشفيات»):** `src/pages/halls/ReportPage.tsx` (batch report), `DailyPage.tsx` (daily report), and the history report («من أوّل ما بدينا»): a formal header (org name, report title, a boxed info grid: hall/field/batch date/placed/age or the day/period, «تاريخ التقرير» and «طُبع في» time), coloured section title bars, official-variant tables, a footer with «أعدّه: {name}» and signature lines «المسؤول: ………… التوقيع: …………», page-friendly print (A4, no app chrome, repeat table headers). The existing «أرسل صورة» and «اطبع / PDF» keep working (44 px buttons).
4. **Read-only hall sheet look:** `SheetTable` in `FlockPage.tsx` passes `variant="official"` and the hall page is wide; the sheet title «هلاكات قاعة (7)» is the table's title band. Do not change the sheet's behaviour (S2 owns behaviour).
5. Tests (fail before): DataTable official renders the title band/header classes and default stays identical (snapshot of plain markup unchanged), reports render the header/info grid/signature lines, wide-page store, guards (no new class in boot CSS; sizes reported).

---

## Part S2 — hall sheet locked + pencil + Excel-like edit grid

1. **Locked by default:** on the hall page the sheet is read-only: cells are not buttons, nothing opens on tap. Above the table a toolbar with «✎ تعديل الجدول» (pencil icon + text, 44 px). The page's other actions (أرسل علفاً، بيع، التقرير، …) stay.
2. **Edit mode** (after the pencil): a banner «وضع التعديل» with a short key guide and «انتهيت» to leave. Editable cells: الهلاكات (writes the day total with `save_flock_day {dead}` and version, as `CellSheet` does now), الغاز (`set_flock_gas` = sets the day total: correction), الملاحظات (`save_flock_day {note}`), البيض (layers). **العلف cell opens the feed window for that day** (owner's answer) — never writes stock from a keystroke. Days after today and a closed batch are not editable (as now). All writes go through the existing outbox/uploader and show «بانتظار الرفع» per cell; refusals per cell.
3. **Excel-like on a computer:** one selected cell with a clear outline; arrows move visually (RTL-aware: ← moves to the next column on screen); Enter commits and moves down, Shift+Enter up; Tab/Shift+Tab next/previous editable column; typing a digit starts editing and replaces the value; F2 or double-click edits keeping the value; Esc cancels; Delete/Backspace on a selected cell clears it (gas → none, note → empty; deaths → 0 after a confirm naming the day); Home/End to the first/last column, Ctrl+Home/Ctrl+End to the first/last day, PageUp/PageDown by a screen; Ctrl+C copies the selected cell or Shift+arrow range as tab-separated text; Ctrl+V pastes a block copied from Excel into the editable columns starting at the selection, after a confirm dialog listing each day and value (invalid values named, nothing written until confirmed); Ctrl+Z undoes the last committed change of this session (writes the previous value back); the selected row/column headers highlighted; the selection stays visible while scrolling (scroll into view).
4. **Phones/touch (coarse pointer):** in edit mode a tap on a cell opens the existing bottom sheet (`CellSheet` with `WeightPad`, or the feed sheet); no hardware-keyboard assumptions.
5. Accessibility: `role="grid"`/`gridcell` with `aria-selected`, `aria-readonly` on locked cells, labels with day and field; focus stays in the grid; DataTable stays the only `<table>` (extend it minimally, or render the grid through DataTable cell renderers + a wrapper `onKeyDown`; if you extend `DataTable`, keep the plain markup identical when the new props are absent).
6. Tests (fail before): locked by default (no buttons in cells), pencil enters edit mode, keyboard navigation (arrows RTL, Enter/Tab, typing replaces, Esc), commit enqueues the right op, feed cell opens the feed window, paste confirm lists values and writes only after confirm, undo writes the previous value, phone path opens the bottom sheet. Real `hall_sheet` samples through the real parsers (existing fixtures).

---

## Integration (main session)
Merge D, R, S1, S2 into the session branch; wire D's real samples into R's tests; adversarial reviews per side; full suites (db:test, screen tests, lint, both builds) with no ceiling raise; phone (390/360) and desktop screenshots; DECISIONS/CLAUDE.md; ask the owner «طبّق وادمج».
