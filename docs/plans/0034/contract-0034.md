# Contract 0034/0035 — «الكلّ مثل المالك»، «القاعة كالورقة»، «المخزن بقسمين»

Spec: `docs/HALLS_SHEET_PLAN.md` (phases 0–3) and the owner's answers (DECISIONS 2026-11-21). Two migrations so the work runs in parallel:

- **`0034_everyone_owner`** — phase 0 only (roles and scope lifted). Agent **R**.
- **`0035_hall_sheet`** — phases 1–3 on the database side (store sections reader, gas, feed sent from the feed store with its day, any day of an
  open batch, sheet reader, reports). Agent **D**. 0035 must not depend on 0034 (its tests run as the owner).
- Screens: agent **S1** (store), agent **S2** (halls sheet + reports). Integration (real samples through real parsers) is done by the main session.

Conventions (as 0019–0033): `security definer set search_path = public, pg_temp`, `set local lock_timeout = '5s'` in writers, org =
`public.auth_org()` in every predicate, action via `private.require(...)`, writers call `private.ref_claim` FIRST. Every body that 0034/0035
changes is copied from its **latest** definition (highest migration that defines it) and then edited. No `/` in SQL (migration-guard). Money bigint
fils, quantities numeric with 3 decimals as text in JSON. Arabic hints in فصحى. Rollback file for each migration, tested by the harness.

## Part A — 0034_everyone_owner (agent R)

Owner's word: «الكل مثل المالك بكل شيء». Every active member does and sees everything, in the whole org. **Only `members.manage` stays owner-only**
(add_member, add_member_v2, invite_code, archive_member, set_member_role, set_member_scopes, set_member_scopes_v2). `party.offset` and
`period.unlock` become available to every member.

SQL (redefine helpers only; do not touch policies, so `catalog.test` classes stay as they are):

| Helper | New rule |
|---|---|
| `private.role_can(p_role, p_action, p_costs_confirmed)` | unknown action still raises `unknown_action`; null role → false; `members.manage` → `p_role = 'owner'`; anything else → true. Signature and `immutable` unchanged. |
| `public.can_see_cost()` / `public.can_see_accounts()` | `select private.my_role() is not null` (coalesce false). **Identical bodies** (catalog.test:318). |
| `public.can_see_sales()` | same rule. |
| `public.in_scope_division/site/wh` | true when the caller is an active member and the target exists in the caller's org (keep the org check and `account_live`); scope rows ignored. `in_scope_book` follows `in_scope_division`. |
| `private.scope_touches_division` | true for any division of the caller's org. |
| `private.require` | hint for `forbidden` now only speaks of member management (and «لست عضواً فعّالاً في منشأة» for no role). |

Keep: `member_scopes` table and its writers (owner-only, harmless), `check_role`, `keep_an_owner`, the 8 role names (a role is now a job title that
orders the home buttons). `flock_cycle_report`'s `strip_money` of the close result and `halls_history` without money stay (reports meant to be sent).

Tests: rewrite `role-matrix` to the new rule (every role allowed for every action except `members.manage`), `cost-leak` to "every member sees
money", `parity` (server = client cell by cell), and every same-org `forbidden`/`out_of_scope`/`no_cost_access`/`note_scope` assertion in the other
DB test files to the new truth. **Cross-org assertions stay** (another org's object is still `out_of_scope`/not found). Add one test that a
non-owner member still gets `forbidden` on each members.manage function. Mutation proof: the old helper bodies must fail the new tests.

Client (R): `src/domain/permissions.ts` (`can` = role non-null and (action ≠ members.manage or owner); `canSeeCost/Accounts/Sales` = role
non-null; `canManageMembers` owner only), `src/domain/scope.ts` (`inScope` = true for a member), `src/lib/nav.ts` `STORE_ROLES` (all roles),
`StaffPage` (hide the scope editor and scope label; keep invite/remove/role for the owner), `roles.ts` `roleDescription` («يرى ويفعل كلّ شيء في
المنشأة؛ الدور يرتّب أزرار الرئيسية فقط»), texts that describe old limits (`BirdSaleNew.tsx:424`, `ClosePage.tsx:51`). Home `PRIORITY` stays.
Client tests: `permissions.test`, `home-today`, `ui` nav, and every screen test that asserts hiding by role, updated to the new truth.
**Do not touch** `src/pages/halls/DailyPage.tsx` (S2 owns it; its `:871` note-scope check is S2's).

## Part B — 0035_hall_sheet (agent D)

### B1. Any day of an open batch
- New `private.flock_day_check(f public.flocks, p_on date)`: `date_required` (null/infinite), `date_in_future` (> `app_today()`),
  `before_placement` (< placed_on), `flock_closed` (status ≠ 'active'), `period_locked` (period lock). **No 7-day limit.**
- Redefine `save_flock_visit` and `save_flock_day` (latest: 0032) with the 7-day branch removed (park reasons left: flock_closed, out_of_scope,
  period_locked). Behaviour otherwise identical (signatures unchanged; the deployed client keeps working between apply and merge).
- `record_flock_weight` (latest 0012 or later): `check_doc_date` → `flock_day_check`.
- `flock_issue_options.earliest_on`, `weigh_ticket_options`, `flock_sales`, `flock_close_form`, `ticket_invoice_on`, `give_to_flocks`: **unchanged**
  (stock and money dates keep their rules).

### B2. Gas (cylinder count per day)
- Table `public.flock_day_gas (org_id, id uuid pk default gen_random_uuid(), flock_id, on_date, cylinders int null check 0..1000, version bigint ≥ 1,
  updated_by, updated_at, unique (org_id, flock_id, on_date))`. Never deleted (clearing writes `cylinders = null` with version + 1; ABA lesson
  2026-11-16). RLS read: same scope as `flock_daily`. Writes only through the function. functionOnly in `classes.json`.
- `public.set_flock_gas(p_flock uuid, p_on date, p_cylinders int, p_expected_version bigint, p_client_ref uuid, p_queued boolean default false)
  returns jsonb` — `require('flock_day.save')`, ref_claim, lock flock, `flock_day_check` (parks like save_flock_day when `p_queued`, with the same
  reasons, into `flock_day_rejects` with `payload = {"gas": n}`), `p_expected_version` = the version the device saw (null when no row).
  Returns `{status:'saved', gas:{on, cylinders, version}}` | `{status:'stale_gas', server:{on, cylinders, version}}` | `{status:'parked', reason}`.
  Retry with the same ref returns the first result. Same value as current = saved without a new version.

### B3. Feed sent from «رصيد العلف», dated at recording, shown on its day
- Column `public.flock_issues.for_day date null` (the day it belongs to; null = issued_on). Check `for_day is null or for_day <= issued_on`.
  `private.issue_day(i)` = `coalesce(i.for_day, i.issued_on)`; **every hall reader attributes feed issues by `issue_day`**; stock readers keep `moved_on`.
- `public.send_flock_feed(p_client_ref uuid, p_issue_id uuid, p_line_id uuid, p_flock uuid, p_item uuid, p_qty numeric, p_for_day date)
  returns jsonb` — `require('issue.post')`; item must be kind `feed` (`not_feed` «هذه المادّة ليست علفاً…»); for_day via `flock_day_check`
  (not future, ≥ placed_on, flock active); the issue itself is `record_flock_issue` (through `private.derived_ref`, like `give_to_flocks`) with
  `p_issued_on = app_today()` and warehouse = the feed-kind warehouse that holds enough of the item today, preferring `private.feed_balance_wh()`;
  none → `insufficient_stock` with a hint naming what «رصيد العلف» holds; no feed warehouse → `no_feed_store`. Then `for_day` is set.
  Idempotent by `p_client_ref` (a retry returns the first result; same ids with other content → `id_conflict`).
  Returns `{status:'saved', issue:{id, doc_no, item_id, item_name, qty, unit, issued_on, for_day}, day:{on, feed_kg}}`.
- Correction = `void_flock_issue` (unchanged; reverse dated today). The sheet shows only live issues.

### B4. Sheet reader `public.hall_sheet(p_flock uuid) returns jsonb` (`require('read')`, flock in org/scope)
```
{ today,
  flock: {id, hall_id, hall_name, site_name, kind:'broiler'|'layer', status, placed_on, age0, placed_count, closed_on, end_on, end_age},
  can_write: status = 'active',
  through: date,     -- closed_on if closed; else greatest(today, end_on) if end_on; else broiler placed_on + (45 - age0), layer today
  days: [{ on, age, day_no,
           dead,                 -- int: dead + culled (old culls shown inside deaths)
           culled,               -- int: legacy part of `dead`, for the edit to zero it
           day_version,          -- flock_daily.version or null
           note,                 -- text or null
           gas, gas_version,     -- int or null; bigint or null
           feed_kg,              -- text 3dp or null: Σ live feed-kind issues with issue_day = on (kg), plus feed carried in on that day
           carry_in_kg,          -- text 3dp or null (review): feed carried in from the previous cycle, on its applied day (placement)
           feed_back_kg,         -- text 3dp or null (review): returned to store + carried out, on the close day
           feed: [{issue_id, doc_no, item_id, item_name, qty, unit, issued_on, can_void}],
           eggs_total, eggs_cracked, eggs_broken,   -- layers; null for broiler
           sold_birds, sold_net_kg,                  -- int; text or null (flock_count_days)
           live_end }],          -- birds alive at the end of the day
  totals:  {dead, gas, feed_kg, feed_back_kg, sold_birds, sold_net_kg, eggs_total},
  summary: {placed, dead, mortality_pct, live, feed_kg, feed_back_kg, feed_net_kg, feed_bags, gas, sold_birds, sold_net_kg, avg_weight_kg, fcr},
           -- mortality_pct text 2dp; avg_weight_kg = sold_net_kg ÷ sold_birds (3dp) or null; feed_net_kg = feed_kg − feed_back_kg;
           -- fcr = feed_net_kg ÷ sold_net_kg (3dp) or null (null when any line has no mass) = flock_cycle_report.kpis.fcr_final for a closed batch;
           -- feed_bags = feed_kg ÷ the bag size when every send (and carried-in line) used one bag unit size, else null
  feed_items: [{item_id, name, base_unit, on_hand, units:[{id, name, base_qty}], last}],
           -- active kind 'feed' items with on_hand > 0 in feed warehouses today, or `last`; last = item of this flock's latest live send;
           -- on_hand (review) = the largest quantity in ONE feed warehouse today (what one send can take), not the sum
  rejects: [{id, on, reason, created_at, payload, version, client_ref}] }   -- flock_day_rejects of this flock with decision null;
           -- version (review) grows with every re-park of the same row; client_ref = the parked op's ref as stored
```
Rows run from placed_on to `through`, one per day, including days with nothing.
- `public.decide_flock_reject(p_id uuid, p_decision text, p_seen_version int)` (`handled`|`refused`; review: the 2-arg form is gone),
  `require('flock_day.save')`. Version ≠ the row's → `{status:'stale_reject', reject:{…same shape as rejects[]…}}`, nothing written;
  same version: writes decision/by/at once (the same decision again = `{status:'saved', id, decision, decided_at}`; another = `already_decided`).

### B5. Store sections reader `public.day_balance_sections(p_on date) returns jsonb` (`require('read')`)
```
{ today, on, can_note,
  sections: [ {key:'feed_materials', rows:[…]},   -- items kind raw, additive
              {key:'feed',           rows:[…]},   -- items kind feed (mill output lands here)
              {key:'other',          rows:[…]} ], -- every other active item that any org warehouse admits
  row: {item_id, name, kind, base_unit, qty, note:{text, version}|null, category:{id, name}|null} }
```
qty = Σ stock moves with `moved_on <= on` in the org's warehouses (text 3dp). Order: items with a category by category name then its
`item_order`, then the rest by name. Same date rules as `day_balance` (`date_required`, `day_in_future`). Notes are `stock_day_notes` (writer unchanged).

### B6. Reports
- `private.report_days` (and what reads it: `report_day`, `halls_day_totals`, `halls_day`, `flock_cycle_report`, `halls_history`, `flock_month`):
  feed given by `issue_day`; add `gas` per day and in totals. Keys added, none removed (the deployed screens keep parsing).
- `verify_hall_sheet()`: zero rows when sound — `for_day` within [placed_on, issued_on]; gas rows within the flock's days, version ≥ 1;
  `hall_sheet` totals = Σ its days (and feed_net_kg = feed_kg − feed_back_kg); feed_kg per day = Σ live issue lines by issue_day + carry-in by
  applied_on, feed_back_kg = return/carry close lines on closed_on; `sheet_fcr_final`: a closed batch's sheet fcr = fcr_final. Add to the verify list the harness runs.
- Real samples: `HALL_SHEET_SAMPLES_OUT=1` writes `scripts/tests/fixtures/hall-sheet-0035.json` with `hall_sheet` (broiler with gas, feed on a
  late day, a void, a legacy cull, a sale; and a layer), `day_balance_sections`, `halls_day` (with gas), `set_flock_gas` and `send_flock_feed` answers.

## Part C — screens

Rules for both: numbers only through `format.ts`, tables only `DataTable`, Arabic via `t()` in فصحى, `ConfirmDialog` for voids, no new Tailwind
classes (reuse existing ones; boot CSS), no ceiling raise, repo access only in `src/lib/repo`. Phone first (390 and 360), buttons ≥ 44 px, no menu
inside a menu. Start from a hand-written fixture that follows Part B exactly; the main session swaps in real samples at integration.

### S1 — store (StockRoutes chunk)
- Store page (`ItemsBoardPage`/`StoresCardsPage`, from `items_overview`): three titled sections «مواد العلف» (raw, additive), «العلف» (feed),
  «أخرى» (the rest, only if not empty), each with its count; «أضف مادّة» inside a section presets the kind.
- «الرصيد اليومي» (`DayBalanceView`): one page with two tables «رصيد مواد العلف» and «رصيد العلف» (and «أخرى» if not empty) from
  `day_balance_sections`; date arrows and date picker as today; notes per row (existing `set_day_note`); print/PDF/share renders both tables in
  one document. The category picker leaves this page (categories still order rows; managed in setup). Repo: `src/lib/repo/dayBalance.ts`.

### S2 — halls (HallsRoutes chunk; RoundPage stays precached)
- **Hall page = the sheet** (`/broiler|/layers/hall/:id`, `FlockPage.tsx` rewritten around `hall_sheet`): title «هلاكات قاعة (N)», under it
  «وجبة dd/mm/yyyy»; one row of big actions: «أرسل علفاً», «بيع» (existing ticket path), «التقرير», «عدّل الوجبة», «أغلق الوجبة»/«أعِد فتحها»;
  then the sheet `DataTable`: العمر | التاريخ | الهلاكات | الغاز | العلف | الملاحظات (+ البيض for layers), today's row marked and scrolled into
  view on open, a totals row. Prev/next hall as today.
- Tap deaths/gas/note/eggs cell → bottom sheet with the app keypad and «تم»: deaths = `save_flock_day` through the outbox (`p_dead` = value,
  `p_culled` = 0 when the day had culls, other fields null), gas = `set_flock_gas` through the outbox (new queueable function), note = save_flock_day.
  Works offline; the cell shows «بانتظار الرفع» until saved. Any day of an open batch.
- Tap feed cell (or «أرسل علفاً» = today) → feed sheet: that day's sends with «ألغِ» (ConfirmDialog naming item, qty and day → `void_flock_issue`),
  and the form: feed chips (last preselected, on hand shown), quantity on the keypad with a unit toggle (bag unit / kg), «أرسل» →
  `send_flock_feed`. Needs connection: offline says so plainly. Target ≤ 5 taps.
- Rejects banner on the sheet: each pending reject in words (day, what, why) with «أُدخلت» / «تجاهل» (`decide_flock_reject`).
- Culls leave every entry screen (round, visit dialog, HallVisits edit); old culls show inside deaths. Consumed-feed input leaves the round and
  visit dialog (feed is sent from the sheet). The 7-day window leaves the client (`ROUND_WINDOW`, `CalendarPage`, weight dialog date).
- Outbox: `set_flock_gas` queueable (merge by flock+day like day ops; result kinds saved / stale_gas / parked); **parked ops are kept and shown**
  (review shelf with the reason and «احذفه»), never silently removed.
- Reports: «تقرير الوجبة» (`ReportPage`) = the sheet with running totals + the summary block (الداخل، الهلاكات ونسبتها، الباقي، العلف المرسل كغم
  وأكياس، الغاز، المباع وصافي وزنه ومعدّل الوزن، معامل التحويل) from `hall_sheet`, without daily weight charts or consumed feed; the daily report
  (`DailyPage`) as one table القاعة | العمر | الهلاكات | الغاز | العلف | الملاحظات with totals (from `halls_day`, gas key); PDF and WhatsApp
  image for both (existing `reportImage`). `DailyPage.tsx:871` note-scope check → everyone may write the note.
- Repo: new `src/lib/repo/hallSheet.ts` (parser + `loadHallSheet`, `sendFlockFeed`, `decideFlockReject`), gas transport in `repo/flocks.ts`.
