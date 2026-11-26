# Contract 0037 — «احذف القاعة» as if it never existed, and the keyboard everywhere

Owner's request and answers: `docs/DECISIONS.md` section «2026-11-26». Base: branch `claude/festive-sagan-fq2iw3` at `b03aec2` (= `main` = production 0036).
Rules that bind every part: CLAUDE.md (Fusha UI text through `t()`; numbers through `format.ts`; `DataTable` is the only table; no `window.confirm`;
money/stock writes are one RPC with `client_ref`; every fix or feature with a test that fails before it; no ceiling raise; the guards stay on).

The customer (through the owner, 2026-11-26, two photos and two voice notes) said:
1. «هذن القاعات أريد أحذف منهم، ما گاعد أگدر أحذف… بالبداية سوّيت تجريبيات» — in production his org has five test halls created today
   («قاعة 8 تجريبي» and «قاعه 1/4/5/6 تجريبي»), each with a running flock, 14–22 days of rounds and 7–8 feed sends from «رصيد العلف»
   (55,000 kg «علف م/1» and 6,000 kg «علف م/2» in total). Today a hall with a flock shows no delete/archive action at all.
2. «من أضيف قاعة… خلّينا أتحكّم بالكيبورد: أكتب 25000 وأدوس إنتر يحفظ» — today the hall dialog opens with no field focused and Enter does nothing.

Owner's answers (asked with options):
- Deleting a hall that has a running flock with records: **«كأنها لم تكن»** — what was sent to it from the store goes back by a reversing movement,
  its days (deaths, gas, weights) disappear from every report, the hall disappears from everywhere; only the audit trail keeps it.
- Enter: **next field; Enter in the last field saves** (Excel/accounting style); Ctrl+Enter saves from any field; Esc closes;
  on a computer the cursor starts in the first field when a window opens.

Decided without asking (said to the owner):
- One button «احذف القاعة» replaces «أرشف» for every hall the user can manage (today «أرشف» shows only for halls without a running flock).
  - Hall without a running flock → hidden (archived) as «أرشف» does today; its ended cycles stay in the reports.
  - Hall with a running flock → that flock is cancelled as if it never existed (below), then the hall is hidden.
  - Ended (closed) cycles are history and are never cancelled by this. To remove an ended test cycle the user reopens it first
    («أعد فتح الدورة», 0029) and then deletes the hall.
  - Refused, with the reason and what to do, when the running flock has: a bird sale (money), a weigh ticket, feed carried in from the
    previous cycle still applied, a period lock covering its placement day or today, or the hall is outside the user's scope.
- The cursor goes to the first field automatically only on devices with a fine pointer (computers). Phones stay as today (no keyboard
  popping over the sheet).

Three parts, built in parallel in separate worktrees, integrated by the main session:
- **D** — migration `0037_delete_hall` (DB only).
- **H** — the delete-hall screens (repo + lazy dialog + entry points).
- **K** — the keyboard everywhere (no DB).

---

## Part D — `supabase/migrations/0037_delete_hall.sql` (+ `rollback_0037.sql`, harness entry, tests, real samples)

Every function rewritten here starts from its **latest** forward body (`grep -ln "create or replace function NAME(" supabase/migrations/0*.sql | tail -1`,
never a `rollback_*` file), and `rollback_0037.sql` restores those bodies exactly (the rollback runner checks).

### D1. A cancelled flock
- `flocks.status` check gains `'void'`; new columns `voided_at timestamptz`, `voided_by uuid`, `void_reason text` with
  `check ((status = 'void') = (voided_at is not null))` and a reason length check (≤ 500). `flocks_closed_check` is unchanged (a void flock has
  `closed_on` null). `flocks_one_live` (preparing/active) already excludes it.
- A void flock never appears and never accepts a write:
  - `private.flock_for(p_flock, p_write)` (latest 0026) raises `flock_void` («حُذفت قاعة هذا الفوج، فلا يُعرض ولا يُسجَّل له شيء.») for a void
    flock, read or write.
  - Every reader that lists flocks or aggregates their days excludes `status = 'void'` (at least: `halls_history`, `halls_day` /
    `private.halls_day_totals`, `flock_cycles`, `flock_cycle_report`, `flock_month`, `hall_sheet`, `flock_detail`, `flock_feed`, `flock_sales`,
    `flock_issue_options`, `flocks_overview` / `private.flock_summary`, `vaccine_board`, `vaccine_reminders`, `round_visits`, `bird_sale_form`,
    `weigh_ticket_options`, `flock_close_form`, and any money/stock reader that lists flocks by name). Check each against the catalog query
    `select proname from pg_proc where prosrc ~ 'public\.flocks\M'` and record in the migration header why each one is safe.
  - Every writer that takes a flock refuses a void one with `flock_void` (via `flock_for(…, true)` or explicitly): `save_flock_visit`,
    `save_flock_day`, `set_flock_dead`, `add_flock_gas`, `set_flock_gas`, `send_flock_feed`, `record_flock_issue`, `give_to_flocks`,
    `record_flock_weight`, `record_flock_count_adjust`, `undo_vaccination`, `remove_flock_log`, `edit_flock`, `delete_flock`, `close_flock`,
    `save_weigh_ticket`, `record_bird_sale`, … Queued round ops (`p_queued`) for a void flock park in `flock_day_rejects` with `flock_void`,
    like `flock_closed` does today.
  - Every `verify_*` holds with void flocks present (a test builds one in each relevant state).

### D2. `public.delete_hall_preview(p_hall uuid) returns jsonb` — read (stable, definer, `require('read')`)
```json
{
  "hall":   {"id": "…", "name": "قاعة 8 تجريبي", "site_id": "…", "site": "حقل لحم", "version": 3},
  "flock":  null | {
    "id": "…", "version": 9, "status": "active", "placed_on": "2026-11-13", "placed_count": 25250,
    "days": 14, "visits": 14, "gas_days": 13, "weights": 0, "logs": 0, "vaccinations": 0, "issues": 7,
    "back": [{"warehouse_id": "…", "warehouse": "رصيد العلف", "item_id": "…", "item": "علف م/1", "qty": "14000.000", "base_unit": "kg"}]
  },
  "ended":  2,
  "blocks": [{"code": "sales", "text": "في الفوج بيع طيور (فاتورة BS-00012)؛ ألغِ الفاتورة أوّلاً ثمّ احذف القاعة."}],
  "plan":   "9f1c…"
}
```
- `flock`: the running flock (preparing/active) or null. Counts are live rows (`days` = `flock_daily` rows; `visits` = live visits; `issues` =
  posted issues; `vaccinations` = done vaccinations). `back` = posted issue lines summed per (store, item), ordered by store name then item name
  (`collate "C"`), `qty` as text with 3 decimals in the item's base unit.
- `ended`: closed flocks of the hall (they stay in the reports).
- `blocks` and `plan` come from the **same private functions** `delete_hall` uses, in the same order (lesson 2026-11-15: the reader's "can"
  is built from the writer's own checks). Codes: `sales`, `tickets`, `carry`, `period_locked`, `permission`. An archived hall → `hall_not_found`.
- `plan` = md5 over: hall id+version, flock id+version (or none), the sorted posted issue ids+versions, the sorted done vaccination ids.

### D3. `public.delete_hall(p_hall uuid, p_expected_version int, p_expected_plan text, p_client_ref uuid) returns jsonb` — write
- Idempotent by `client_ref` (`ref_claim`/`ref_store`) **and by state**: a hall already archived returns
  `{"hall_id", "name", "deleted": true, "already": true, "back": []}` (a lost answer retried with a new ref changes nothing).
- `require('flock.manage')`; `require('void')` when there are issues to reverse; `period_guard`; `lock_timeout 5s`; scope check.
- Locks: hall `for update`, then the running flock, issues, masters and balances in **one order shared with** `void_flock_issue`,
  `record_flock_issue`, `give_to_flocks`, `undo_vaccination` and `close_flock` (lesson 2026-11-11) — state the order in the header and prove it
  with a two-session test (`pg_blocking_pids`, no 40P01).
- `stale_hall` when the version differs; `stale_plan` («تغيّر ما في القاعة بعد فتح النافذة. راجع ما سيُحذف ثمّ احذف.») when the plan differs;
  the first block raises its code (`hall_has_sales`, `hall_has_tickets`, `hall_has_carry`, `period_locked`, `forbidden`) with its text as hint.
- Effects, all in this one transaction:
  1. every posted issue of the running flock is voided exactly as `void_flock_issue` does (stock moves reversed to their lots dated today,
     `flock_costs` reversing lines dated today, status `void`, reason «حُذفت القاعة «NAME»») — share one private core with `void_flock_issue`
     rather than copying it;
  2. its done vaccinations become `void` (same reason);
  3. the flock becomes `void` (`voided_at`, `voided_by`, `void_reason`, `version + 1`);
  4. the hall is archived (`archived_at = now()`, `version + 1`).
  Rounds, visits, gas, weights, logs and counts stay as rows (audit trail) and are hidden by the flock's status. Nothing is deleted.
- Result: `{"hall_id", "name", "deleted": true, "already": false, "flock_id": …|null, "voided_issues": 7, "back": [same shape as D2]}`.

### D4. Invariants and tests
- A `verify_*` check (new `verify_delete_hall` or inside `verify_halls`): no void flock with a posted issue, a done vaccination, or in a
  non-archived hall; no flock_costs net ≠ 0 for a void flock.
- Postgres tests (`supabase/tests/delete-hall.test.mjs`, unique id/phone prefixes checked with grep across every test file): preview shapes;
  each block; stale hall/plan; idempotent retry (same ref, new ref after success); store balances back exactly (qty and value) and the item
  ledger shows send + reversal; every reader in D1 without the flock; every writer in D1 refuses; queued round op parks `flock_void`;
  ended cycles stay in `halls_history`; concurrency with `void_flock_issue`/`record_flock_issue` on the same flock; rollback restores.
- Real samples: run preview and delete on a seeded org shaped like the customer's (running flock with days, feed sends from «رصيد العلف», an
  ended cycle in another hall) and write the outputs to `scripts/tests/fixtures/delete-hall-0037.json` for part H's parsers.

---

## Part H — the delete-hall screens

- Repo (next to `archiveHall` in `src/lib/repo/flocks.ts`, or a new lazy module if size needs it): `loadDeleteHallPreview(hallId)` and
  `deleteHall(hallId, version, plan, ref)`, with strict parsers (`scaled`/`fils`-style; a field that can be null is read as nullable).
- `DeleteHallDialog` in the halls chunk (lazy like `HallDialogLazy` in `flockEditLazy.tsx`; offline → the existing `DialogOffline`).
  - Loading → «جارٍ التحقّق ممّا في القاعة…»; read error → message + «أعد المحاولة».
  - Blocks → each `text` as a list, no delete button.
  - Running flock → «سيُلغى فوج القاعة كأنّه لم يكن:» then one line per effect: «يرجع إلى «STORE» QTY UNIT «ITEM»» for each `back` row;
    «تختفي أيّامه (N يوماً) من كلّ التقارير»; and, when `ended > 0`, «الدورات المنتهية في القاعة (N) تبقى في التقارير». No flock →
    «تختفي القاعة من الحقل والجولة اليومية» (+ the ended-cycles line).
  - Confirm button «احذف القاعة» (danger, `data-action="hall-delete-confirm"`), busy while sending; one `client_ref` per opened dialog kept
    across retries; `stale_plan`/`stale_hall` → re-read the preview and say so; success → toast naming what went back to the store, close,
    refresh the farm table.
- Entry points: the farm table row action «احذف» (`data-action="hall-delete"`) for every hall when `canManage` (replaces «أرشف»), and
  «احذف القاعة» in the «عدّل القاعة» dialog footer (`data-action="hall-edit-delete"`).
- Error texts for `flock_void`, `hall_has_sales`, `hall_has_tickets`, `hall_has_carry`, `stale_plan`, `stale_hall`, `period_locked` in the
  error map (the server hint is shown when present).
- Tests: DOM tests of each state with the fixture, then the real samples from part D through the same parsers (integration).

---

## Part K — the keyboard everywhere (no DB)

- One small module (boot-safe, measured) installed once by the shell: a document `keydown` listener in the **bubble** phase so component
  handlers run first.
  - Enter (no modifiers, not `isComposing`, not `defaultPrevented`) on a field — a text-like `input` (text, search, tel, email, number,
    password, url, date…) or a `select` — whose scope is the closest `form` (else the closest `[role="dialog"]`): if a later field exists in
    the scope (DOM order, enabled, visible, not readonly; textareas count as fields to move into) → focus it and select its text; if it is the
    last field → submit: the scope's default submit button (`form.elements` includes footer buttons tied with `form=`) when enabled, else
    nothing. Never submit through a disabled button (`requestSubmit()` alone ignores `disabled`).
  - Ctrl+Enter / Cmd+Enter in any field of the scope (textarea included) → submit the same way.
  - Skip: `textarea` (plain Enter), buttons/checkboxes/radios, `contenteditable`, anything inside `[data-enter="own"]` (pickers, scanner,
    the sheet grid, search boxes with their own Enter) — audit the existing `onKeyDown` handlers and mark them.
- `Dialog`: when it opens with no `[data-autofocus]`, on `matchMedia('(pointer: fine)')` focus the first field of its body and select it;
  otherwise as today.
- Every dialog with typing gets the existing `<form id>` + footer `<Button type="submit" form={id}>` pattern (today 2 hall dialogs,
  `FlockEditDialog`, the day/weight dialogs in `FlockPage`, `CloseSections`, `TicketPage`, `CalendarPage`, `FlockCard`, `Reminders`,
  `VaccinesPage`, `BatchPage`, `ProducePage`, `RecipePage`, `SaleCheckout`, `stock-shared`, `PartyStatementPage`, `AccountsPage`,
  `ReviewDialog`… — check each). Page inputs outside dialogs (round cards: feed quantity and gas, settings, sales, mill, stores, accounts)
  are audited one by one: a field with a clear save/send button next to it goes in a `form` with that button as submit.
- Tests (DOM, real react-dom): Enter moves to the next field and selects it; Enter on the last field submits once; disabled submit → nothing;
  Ctrl+Enter from the first field and from a textarea; IME composing ignored; a picker's own Enter wins; autofocus with fine pointer and not
  with coarse; the hall dialog: name ⏎ → capacity focused, 25000 ⏎ → `createHall(site, name, 25000)` once.

---

## Sizes and guards
- No ceiling raise: precache ≤ 920,700 without keys (915,179 now), boot gzip ≤ 82,400, session path ≤ 149,000.
- New Tailwind classes in boot CSS are forbidden (lesson 2026-11-16): reuse existing classes.
- `npm run lint`, `npm run build` (with and without keys) and `npm run db:test` green before handing back.
