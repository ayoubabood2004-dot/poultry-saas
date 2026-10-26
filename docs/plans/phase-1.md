# Phase 1 plan: «المخازن والشراء والجهات»

Lead-engineer plan built from the six analyst studies (data model, operations, calculation, screens, guards and tests, ledger and parties). It was checked against `docs/FOUNDATION.md`, `docs/DECISIONS.md`, `CLAUDE.md` and the code as it stands on branch `phase-1/stores` (clean, head `f43c1c3`; `main` was advanced by the owner's word, DECISIONS:69).

Precedence: the owner's word, then DECISIONS, then FOUNDATION (FOUNDATION:20, CLAUDE.md). Anything that touches money or stock and is not written down goes to the owner as a question with options (FOUNDATION:21). §4 holds those questions, and §4.0 maps each one to the package it blocks. §2.11 lists the engineering choices this plan makes on its own; the owner can overturn any of them with one word, before real data exists.

How to execute.
- Build the packages in order. Each package is one additive migration plus its domain, repo, screens and tests, and it is testable on its own.
- A package does not start until every question that §4.0 maps to it is answered and recorded in DECISIONS (FOUNDATION:21, 122).
- A package is done only when `npm run lint`, `npm run build` and `npm run db:test` are green and every `verify_*` returns zero (FOUNDATION:75, 870).
- Release order per package, each step on the owner's word (FOUNDATION:58, 77, 919; DECISIONS:69):
  1. apply the package's migration to production;
  2. check the digest and `verify_*` there (WP8 step list);
  3. only then merge the package to `main`, because `main` builds production (DECISIONS:68), and screens merged before their migration is live would break it;
  4. "deployed" only when Vercel shows Ready on that commit (FOUNDATION:821).
- Live checks. Preview builds use the production database (DECISIONS:68), and production is read-only (FOUNDATION:59) with no accounts until the sign-in session (DECISIONS:77). So no Phase-1 flow can be checked live anywhere until owner action A2 exists. Until then the evidence is the Postgres harness plus `renderToStaticMarkup` screen tests fed by real report output (WP6 golden). A2 is therefore a precondition for the "check on preview before merge" step of DECISIONS:68, not only for Playwright.

---

## 1. Scope and done criteria

### 1.1 Phase 1 deliverables (FOUNDATION:897), mapped to packages

| Deliverable (FOUNDATION:897) | Package |
| --- | --- |
| المواد والوحدات (materials and units) | WP1 (units, math), WP2 (items, packs) |
| مخازن كل وحدة (stores for every division, incl. field and table-egg stores) | WP2 |
| الجهات وقيود افتتاحها بكل دفتر (parties and their per-book openings) | WP3 |
| رصيد افتتاح المخازن (opening stock) | WP4 |
| الاستلام بدفعاته وتوزيع مصاريفه ودفتره (receipts, charges, book) | WP6 |
| الدفتر والأرصدة (stock ledger and balances) | WP4 |
| التحويل والصادر الداخلي (transfers and internal export) | WP4 |
| الجرد (stock count) | WP5 |
| الصرف لمصروف عام (issue to general expense, destruction) | WP5 |
| مرتجع المورّد وتصحيح السعر (supplier return, price correction) | WP7 |
| «قبضنا» و«دفعنا» والتوزيع داخل الدفتر (payments and allocation) | WP3 |
| الصناديق (cash boxes) | WP3 |
| المصاريف وتصنيفاتها (نقداً وبالدين، والتحميل على فوج) (expenses, categories, flock charging) | WP2 (categories), WP5 (expenses). Flock charging depends on Q13: Phase 1 cannot close with this item open unless the owner's written word moves it (§1.3) |
| لوحة المخزون وبطاقة المادّة (stock dashboard, item card) | WP4 |
| صفحة الحسابات بجدول الجهات وكشفها (accounts page, parties table, statement) | WP3; final numbers in WP6, rendered from real report output |

**Scope closure.** Phase 1 closes only when every row above is built, or is moved to a later phase by the owner's written word recorded in DECISIONS (Q13). The barcode scanner is decided in E54: keyboard-wedge scanning only.

### 1.2 Done criteria (FOUNDATION:897), with numbers and the package that proves each

| # | Criterion | Exact numbers | Proven in |
| --- | --- | --- | --- |
| D1 | Receipts of the worked example match to the fils | Σ = 14,790,000.00 (13 lots C1…KZ1, FOUNDATION:604-618). C2 = 2,404,166.67, S2 = 910,833.33 | WP6 golden |
| D2 | Transport shares | 54,166.67 (corn) and 10,833.33 (soy) = 65,000.00 exactly. In fils: 5,416,667 and 1,083,333; the leftover fils goes to corn (FOUNDATION:620) | WP1 parity (SQL helper), WP6 golden |
| D3 | T0 mirror | all of DS1, 1,000 L at 800,000.00, from general to mill raw store. Mirror qty 1,000 L, value 800,000.00, same `fifo_seq` (FOUNDATION:622) | WP4 (mechanism on an opening lot), WP6 (real chain) |
| D4 | Mill book and accounts page | grain supplier «له 3,250,000», carrier «له 65,000» in the mill book, on the statement and on the accounts page (FOUNDATION:691, 696-697). On the page: those two cells in the mill column, and the footer rows «علينا للناس» 3,315,000 and «لنا عند الناس» 500,000 | WP6 golden: SQL reports, then the real repo parsers and the real accounts-page components rendered with `renderToStaticMarkup` from that same report output (no Playwright needed) |
| D5 | `verify_stock()` = 0 after property tests | zero rows; the property test must show it has run more than zero cases; the conservation check uses document-side sources, so it can fail on a valuation bug (WP4 check 8) | WP4 framework, WP8 final run |
| D6 | Concurrency never takes more than exists, and the same `client_ref` twice gives one posting (FOUNDATION:873, 886) | two sessions draw the same lot: one posts, the other gets `insufficient_stock` (or a retryable 40P01/55P03), and the lot never goes negative. Two sessions post the same document with the same ref: one posting, one number, identical masked results; the same ref with a different `expected_version` gives `ref_reused` | WP4 (transfer vs transfer, same-ref transfer), WP5 (stock use vs transfer, same-ref stock use), WP6 (same-ref receipt) |

Checkpoint numbers derived for the end of Phase 1 (FOUNDATION:600-622; they are not printed in FOUNDATION, so the tests mark them "derived"):
- Mill «لنا عند الناس» = 500,000 (Abu Ali's opening, FOUNDATION:662). Mill «علينا للناس» = 3,315,000 (3,250,000 + 65,000; it appears unchanged at FOUNDATION:700). Every other division is 0 / 0. Project totals: 500,000 / 3,315,000.
- Σ `value_left` after T0 = 14,790,000.00. With HE1 and V1 included it is 24,390,000.00 (FOUNDATION:672-673).
- Cash paid out by the example's Phase-1 cash receipts = 21,075,000: HE1+V1 9,600,000 on 2026-09-24; C1…DS1 10,400,000 on 2026-10-01; GZ1+KZ1 1,075,000 on 2026-10-15.

### 1.3 Explicitly not in Phase 1
- Offsets between books (`party_offsets`, OF numbering). They are owner-only (DECISIONS:104, 206) and listed in Phase 6 (FOUNDATION:902). The `offset` entry kind and the OF counter kind are reserved now.
- Credit limits and due terms (DECISIONS:133). `party_book_terms` is not created (§2.11 E32).
- Debt-ageing buckets (FOUNDATION:902). Phase 1 sorts by largest balance and by oldest open entry only (E26).
- Sales, production, flocks, hatchery batches and egg lots. Their effect on Phase-1 items is Q13.
- Camera barcode scanning (E54).

Conditional, not yet out: «التحميل على فوج» (charging an expense to a flock) is listed in FOUNDATION:897 but needs flocks (Phase 3, FOUNDATION:899). It stays a Phase-1 deliverable until the owner's written answer to Q13 moves it.

---

## 2. Cross-cutting contracts (every package applies these; packages only list deltas)

### 2.1 Function contract (FOUNDATION:514-524)
- Every public write RPC is `security definer set search_path = public, pg_temp`, writes `org_id = (select auth_org())` in every predicate, and opens with `perform private.require('<action>')` (0001_core.sql:254). A scope check follows: `private.require_wh(wh, action)` raises `out_of_scope` with a hint that names the store.
- Helpers live in `private`, never take `org_id`, and are not granted to `authenticated` (FOUNDATION:516).
- Every new public function goes into `supabase/tests/allowlist.json` and is granted in the same migration. `verify_*` functions are `service_role_only` (FOUNDATION:517, 859).
- One signature per name. A changed signature gets a new name, `_v2`, and the old one stays (FOUNDATION:230, 810).
- Intended rejections use `raise exception '<snake_code>' using hint = '<Fusha sentence>'` (FOUNDATION:522, DECISIONS:15-16; migration-guard already enforces the shape).
- Hints never contain a value, cost or price when the caller cannot see cost (R6).

### 2.2 Idempotency, results and wire format (FOUNDATION:519, 523, 447)
- **Ref first, before any lock or write.** `private.ref_claim(fn, client_ref, args jsonb)` runs `insert into rpc_refs … on conflict do nothing`, so a concurrent duplicate sleeps on the unique index.
  - First call committed: return its stored result, re-masked for the caller.
  - First call rolled back: proceed.
  - Same `(fn, ref)` with a different `md5` of canonical args: raise `ref_reused`. The args include `expected_version`.
  - Same ref replayed by a different `created_by`: also `ref_reused` (E2).
- `private.ref_store(fn, ref, result)` closes the transaction's work.
- **Masking.** Every result keeps quantities at top level and puts all money inside nested objects named `money`. `private.mask(result)` removes every `money` key recursively unless `can_see_cost()`, on first answer and on replay alike. This makes the cost-leak test structural (E2).
- **Wire format.** Money and quantities travel as decimal **strings** in both directions. Postgres parses them as `numeric`. The repo parses them with `parseDecimal`/`toScale` (decimal.ts:18, 32) into bigint fils and milli units. No JS `number` touches money (E3, R2).
- Payments, openings, adjustments, cash moves and expenses take a device-born `p_id` as the primary key of the row they create (FOUNDATION:519).
- The repo keeps the same `client_ref` until the outcome is known. After `UnknownOutcomeError` it asks again with the old ref (FOUNDATION:519, src/lib/errors.ts).

### 2.3 Lock order (FOUNDATION:518)
`set local lock_timeout = '5s'` first, then in this order:
1. **Parties.** Advisory locks `pg_advisory_xact_lock(hashtextextended('party:'||id,0))` for every party the document touches, sorted by id ascending (E9). The parties are read from the document without a lock and re-checked after the document lock.
2. **Documents.** The document row `for update`, then the original document (for a return or void), then the expense row, then party entries by id for allocation.
3. (Phase 3+) Flock and batch rows.
4. **Balances.** All `stock_balances` rows the call touches, created if missing (`insert … on conflict do nothing`) and locked up front in `(item_id, warehouse_id)` order.
5. **Lots.** Locked `for update` in withdrawal order.
6. **Counter.** `doc_counters` last, via upsert `… returning last_no`.

Every business check runs after its lock is held. Errors 40P01 and 55P03 are shown as «لم يُرحَّل، أعد المحاولة».

### 2.4 Dates (FOUNDATION:134, 521, 497; DECISIONS:91)
- `private.check_post_date(d, division)` = `check_doc_date(d)` (0001_core.sql:277: future, more than 7 days back, locked period), plus `no_go_live` when the division has no `go_live_on` (E14), plus `before_go_live` when `d < go_live_on`.
- `private.check_opening_date(d, division)`: `no_go_live`; `after_go_live` when `d > go_live_on`; not in the future; not locked; exempt from the 7-day limit.
- `private.check_void_date()`: the void is dated `app_today()`, and is rejected (`period_locked`) only if today is locked. The original keeps its date.
- A document dated D draws only lots with `received_on ≤ D`. A shortfall gives `insufficient_stock` with the hint «بهذا التاريخ لم يكن موجوداً إلا N». It names the item and the requested and available quantities (FOUNDATION:521). Quantities only, no values.
- Doc-number year = the Baghdad year of the document date (FOUNDATION:518).
- Writing the first move or party entry in a division stamps `divisions.first_posted_at`. From then on `go_live_on` is frozen (FOUNDATION:257, E14).

### 2.5 Drafts and direct writes (FOUNDATION:512, 520, 526, 438, 817)
- **Lifecycle columns on every document header:** `doc_no?`, `status`, `version int default 1`, `client_ref?` (the ref of the successful post), `note`, `posted_at/by`, `voided_at/by`, `void_reason`. FOUNDATION:437 puts the void state and its reason on the document. Status is `draft | posted | void`; counts use `draft | submitted | approved | void` (E53).
- **Header policies.** Insert and update are allowed only when `status = 'draft'`, the org matches `(select auth_org())`, the scope identity function on the row's own warehouse column passes, and `(select can('<draft action>'))` holds. There is no delete policy on headers and no subquery on the same table (no 42P17, FOUNDATION:800).
- **Header guard trigger.** Invoker, active when `current_user = 'authenticated'`. It rejects changes to `status`, `doc_no`, `version`, `posted_*`, `voided_*`, `book_id` and totals, and bumps `version` itself.
- **Line guard trigger.** Definer. It locks the header `for update`, rejects when the header is not a draft, copies the header's warehouse id(s) onto the line (E6), checks scope and action, and bumps the header `version`. It runs on insert and update of the line. The one exception is the count review (E53): while a count is `submitted`, a `count.approve` holder may write `stock_count_lines.reason` (no other column) and `stock_count_line_costs.gain_unit_cost`; each write still bumps the header `version`.
- **Amount side tables** (`receipt_amounts`, `receipt_line_amounts.line_total`, `receipt_charges`, `receipt_charge_lines`, `supplier_return_line_amounts`, `stock_count_line_costs.gain_unit_cost`) are writable only by `can_see_cost()` roles, through the same line trigger. The posting function alone writes the computed columns: `discount_share`, `charge_share`, `receipt_charge_shares` (WP6), `stock_count_line_costs.gain_value` and `shortage_value` (WP5), and the revaluation shares (WP7). These document-side snapshots are what `verify_*` compares the lots and ledgers against (E55).
- **No DELETE privilege anywhere** (E52). A draft line, and the side rows that reference it, are removed only by `delete_draft_line(p_doc_kind, p_line_id, p_expected_version)`. A receipt charge is removed by `delete_receipt_charge(p_charge_id, p_expected_version)`, and a charge's line selection is replaced by `set_charge_lines(p_charge_id, p_line_ids, p_expected_version)`. All three are definer functions: they lock the header, require the draft action of that kind (or `receipt.amounts` for charges), check scope, and bump `version`. The reason: the side tables reference the lines, foreign keys never cascade (`catalog.test.mjs:171`), and a storekeeper cannot see a priced line's cost rows under RLS, so a direct delete would fail with 23503. These functions move no money or stock and take no `client_ref`; a retry for a line that is already gone returns `deleted: false`.
- **Posting.** `post_*(p_id, p_expected_version, p_client_ref)` rejects `stale_draft` when the version differs. It recomputes every total from the lines, and a void reverses what `stock_moves` and the ledgers actually recorded (FOUNDATION:526).
- **Discarding a draft.** `discard_draft(p_doc_kind, p_id, p_expected_version)` sets `void` with no number and no moves. It is open to the roles holding the draft action; a `submitted` count is discarded by a `count.approve` holder. Headers are never deleted (E13).
- **Master data** is direct-write by policy with no DELETE privilege. Archive with `archived_at` and restore under the same id (FOUNDATION:64). Writes send only the changed fields, conditioned on the row's `version` (FOUNDATION:817). Every front-end direct write goes through `updatedRows()` (src/lib/repo/core.ts:17, FOUNDATION:799).

### 2.6 Append-only ledgers (FOUNDATION:63, 437, 823)
- `stock_moves`, `party_entries`, `party_allocations`, `cash_moves` and `expenses` carry `private.reject_change` row triggers (before update or delete) and a statement trigger (before truncate), like `audit_log` (0001_core.sql:381-407).
- They have no write policy, and INSERT/UPDATE/DELETE are revoked from `authenticated`.
- A correction is a reversing row with a unique `reverses_*` self-FK, dated the void day, carrying the same lot or party and book with exactly the opposite qty, value or amount.
- A void that has a live dependent fails and names that dependent (`lot_consumed`, `has_revaluation`, `has_supplier_returns`). Chains therefore unwind newest first (FOUNDATION:594).
- **Reversals ignore archive guards** (E43). Archive guards on parties, cash boxes, warehouses and items reject only new originals. A void, and every reversing row it writes, passes even when the box, store, item or party was archived after the original (E35 lets a zero-balance record be archived). A void must succeed or name a dependent document (FOUNDATION:594); an archived record is not a dependent. An archived record left with a non-zero balance by a void is flagged «مؤرشف وعليه رصيد» on its list, so it can be restored (FOUNDATION:64) or cleared.

### 2.7 Precision and rounding (FOUNDATION:133, 237, 465-468; DECISIONS:90)
- `numeric` without precision, plus `check (abs(x) < 'Infinity' and x = round(x, n))` per column: quantities 3, values and costs 2, party and cash amounts 0, density 4, pack factors 6, `piece_mass_kg` 3. `NaN` and `±Infinity` are valid `numeric` values (the wire sends decimal strings, E3) and pass `x > 0` and `x = round(x, n)`; the `abs` term rejects them, and `catalog.test` requires both terms on every public `numeric` column. Every helper rejects non-finite arguments the same way.
- Every multiply-divide-round goes through `private._mul_div_round2` or `private._mul_div_round0`. Every proportional split goes through `private.alloc_lr` (largest remainder, ties by line order). No `round(a*b/c)`; migration-guard bans it (WP0).
- Pieces are whole. The front end uses bigint fils (1/100 dinar) and milli units, and its only rounding is `roundHalfAway` (money.ts:17).

### 2.8 Cost and accounts hiding (FOUNDATION:441-449, 861)

| Policy (restrictive, plus org and scope permissive) | Phase-1 tables |
| --- | --- |
| `(select can_see_cost())` | `stock_lots`, `stock_moves`, `stock_balances`, `opening_lines`, `stock_count_line_costs`, `receipt_amounts`, `receipt_line_amounts`, `receipt_charges`, `receipt_charge_lines`, `receipt_charge_shares`, `receipt_revaluations`, `supplier_return_line_amounts`, `expenses`, `audit_log` (already restricted) |
| `(select can_see_accounts())` | `party_entries`, `party_allocations`, `cash_accounts`, `cash_moves` |
| `(select can_see_sales())` | `parties` |

- Non-cost roles read quantities only through definer functions with no value columns: `stock_on_hand`, `item_lots_qty`, `item_moves_qty`. Their first line checks `in_scope_wh` (FOUNDATION:445).
- Cost roles read values only through invoker functions with an explicit `can_see_cost()` check: `stock_values`, `stock_value_totals`, `item_lots_value` (WP4). No screen or repo call reads `stock_balances`, `stock_lots` or `stock_moves` directly, so reports-guard needs no `unbounded` exception for them.
- **Totals come from SQL functions, never from summing loaded rows** (FOUNDATION:788, 811; the 1,000-row cap, FOUNDATION:198). This covers the stock dashboard's value total (`stock_value_totals`), the accounts page header and its two footer rows, and every «N من المجموع» count (`report_accounts_summary`), and the expenses total (`report_expenses`). Lists are keyset-paged; a total shown under a filtered or paged list is the function's total, never the page's.
- Reports are `security invoker` (FOUNDATION:446). As a belt, they also begin with an explicit `can_see_accounts()`/`can_see_cost()` check that raises `forbidden`, so a viewer never mistakes zero rows for "no debts" (FOUNDATION:798).
- `audit_log` will hold `party_entries` and `cash_moves` rows under the cost policy. This is safe only while `can_see_cost` and `can_see_accounts` cover the same roles (0001_core.sql:172-181). A catalog assertion pins the equality, so separating them later forces a decision.

### 2.9 Client rules (CLAUDE.md, FOUNDATION:194-205)
- Screens call `src/lib/repo` only. Lists a decision depends on throw, and empty states show only after a full read (FOUNDATION:767, 798).
- Every displayed number comes from `format.ts`. Every table is `DataTable`; statements are `LedgerTable`.
- Arabic text is Fusha through `t()`. Document numbers, phones and lot labels sit in `<bdi dir="ltr">`.
- Confirmations use `ConfirmDialog`, naming the thing and its consequence. Dialogs are dirty-guarded and locked while posting.
- Decisive buttons carry `data-*` hooks (FOUNDATION:775).
- Postings never enter the outbox; only `save_flock_day` does (FOUNDATION:142, 201; src/lib/outbox/types.ts:4).

### 2.10 Classification file (one source of truth)
`supabase/tests/classes.json` holds `appendOnly`, `functionOnly`, `directWrite` (with allowed privileges and the policy action), `costRestricted`, `accountsRestricted`, `salesRestricted` and `global` (units).
- `catalog.test.mjs` asserts the catalog against it exactly.
- `scripts/guards/write-guard.mjs` derives `FUNCTION_ONLY_TABLES` from it (today a hand list at write-guard.mjs:13-21, missing `receipt_revaluations` and `units`).
- `scripts/guards/reports-guard.mjs` derives `MONEY_TABLES` from it (today missing `cash_accounts`, `receipt_charge_lines` and the new `receipt_charge_shares`, reports-guard.mjs:9-16). `party_book_terms` is not created in Phase 1 (E32), so it is neither in `classes.json` nor added to the guard now; the phase that creates it adds it. The later-phase money tables already named in the guard (production, hatchery, flock and sales tables) stay as a `reserved` list in `classes.json`, so deriving the set loses none of them.
- Every package adds its tables here first.

### 2.11 Engineering decisions taken by this plan (any of them changes on the owner's word)

| # | Decision | Reason / source |
| --- | --- | --- |
| E1 | One classification file (§2.10) | stops drift between DB, catalog test and guards |
| E2 | Money in nested `money` objects, masked recursively. Replay by another user gives `ref_reused` | FOUNDATION:447, 523 made structural |
| E3 | Money and quantities as decimal strings on the wire | PostgREST and JSON numbers are doubles; FOUNDATION:805 |
| E4 | `fifo_seq` comes from one global sequence at lot creation. Transfer mirrors copy it; count gains take a new one | FOUNDATION:134, 477 |
| E5 | `origin_lot_id` points to the **root** lot (a mirror of a mirror copies the root). For revaluation, "drawn" means quantity that left the lot family other than by transfer | FOUNDATION:477, 552 |
| E6 | Lines carry `line_no` (tie-break «بترتيب السطر») and a copy of the header warehouse id(s) for policies | FOUNDATION:473, 544 |
| E7 | Line unit snapshot: `item_unit_id?` or `unit_code?`, `unit_label`, `factor`, `qty_in_unit`, `qty_base` | FOUNDATION:457-459 |
| E8 | Active opening entries are allocated first («الرصيد السابق أوّلاً»). A late-recorded opening allocates like a new entry | FOUNDATION:495, 662 |
| E9 | Multi-party documents lock all parties in ascending id before anything else | FOUNDATION:518 says «الجهة» in the singular |
| E10 | `expenses.source` adds `adjustment` (signed, 2 dp, `doc_kind` and `doc_id` mandatory, no box and no party) for «فرق سعر شراء», «فرق مرتجع» and «استلام ملغى». «استلام ملغى» links to the original cash move and writes no new one | FOUNDATION:421 lists only cash, stock and credit; these rows are none of them. This is the written reason for the deviation (FOUNDATION:235) |
| E11 | A count shortage writes «فرق جرد» (source `stock`). A gain writes no expense row; its value is the new lot | FOUNDATION:479 literal |
| E12 | Numbers only for PU RT TR CT SU RC PY. Openings, expenses, adjustments, forgiveness, revaluations and cash openings or transfers are unnumbered and shown by kind label | FOUNDATION:247-249 closed list |
| E13 | Drafts are discarded with `discard_draft` (status void, no number, no moves). Headers are never deleted | FOUNDATION:43, 512 |
| E14 | `divisions.first_posted_at` freezes `go_live_on`. A normal document in a division with no `go_live_on` gets `no_go_live` | FOUNDATION:257, 521 |
| E15 | A supplier return draws only the receipt's own lots in the receipt's warehouse; transferred stock must be transferred back first | FOUNDATION:553 «من دفعات نفس الاستلام» |
| E16 | A revaluation's `adjustment` entry is allocated to its own receipt's purchase entry first, then by rule 27 | same as supplier return, FOUNDATION:553 |
| E17 | Exactly one of payee party or cash box per receipt charge | FOUNDATION:550 «… أو حركة صندوق» |
| E18 | Every receipt names a party. A cash purchase writes `purchase −` plus `payout +`, netting to 0 | FOUNDATION:328 (no «?»), 550 |
| E19 | A fully discounted receipt (net 0) writes no supplier entry; discount ≤ Σ lines | `party_entries.amount ≠ 0` (FOUNDATION:311) |
| E20 | An opening may be re-posted after a full void: a fully reversed opening pair does not count as "has moves" | FOUNDATION:548 |
| E21 | Purchased chick lines require `born_at`, prefilled with the receipt date | FOUNDATION:137, 293 |
| E22 | `min_qty` per item (display only). It is compared with the item's available total across the org's stores whose kind receives that item kind from suppliers (FOUNDATION:284-286). That is one store kind for every item kind except packaging, which sums raw and general stores. Fuel sitting in raw or farm stores does not count, because those stores get fuel by transfer, not by purchase. The alert shows on those receiving stores' dashboards and their divisions' home cards. «قريب الانتهاء» = 30 days, org-wide | FOUNDATION:268, 779-780; "owning division" was undefined for packaging and fuel, which several store kinds admit (FOUNDATION:281-286) |
| E23 | The stock dashboard is grouped by base unit (kg, L, pc), with the unit in the column header | CLAUDE.md `fmtQtyCell` rule |
| E24 | Age of a lot. Chick lots: now − `born_at`, in hours, carried by transfers. The 48-hour warning (not a block) shows on chick stores, the item card and the hatchery home card. Every other lot: days since its root lot's `received_on` | FOUNDATION:293, 477, 505 «عمر الفرخ = الآن − born_at»; DECISIONS:94, 106. Chick lots exist in Phase 1 through receipts, openings, transfers and count gains |
| E25 | The count entry screen does not show system quantities («عدّ أعمى» in the UI only; a storekeeper can still read `stock_on_hand` elsewhere, so this is not a security boundary). `submit_count` snapshots `system_qty`; `post_count` compares (`count_stale`), and the review flow is E53 | FOUNDATION:302, 555 |
| E26 | The statement period defaults to the current calendar year, with a server-computed brought-forward per book. Phase 1 sorts by largest balance and oldest open entry; ageing buckets come in Phase 6 | FOUNDATION:788, 851, 902 |
| E27 | The parties table shows parties with a non-zero balance by default, with a «كل الجهات» toggle | matches FOUNDATION:693-700 |
| E28 | `rpc_refs` is never purged in Phase 1 | FOUNDATION:519 |
| E29 | Property-test case count is measured first; a CI timeout raise needs a written reason | FOUNDATION:875; ci.yml `timeout-minutes: 15` |
| E30 | No payment-voucher print in Phase 1; print only the party statement | FOUNDATION:114, 788 |
| E31 | "Large quantity" confirmation = a line that consumes the whole available balance. It applies on every screen that draws stock: transfer, stock use and destruction («صرف», named in FOUNDATION:814), and supplier return. A balance that reaches zero is announced with a sound on the same screens | FOUNDATION:773, 814 |
| E32 | `party_book_terms` is not created | DECISIONS:133, FOUNDATION:46 |
| E33 | `item_categories(name)` without `kind` (no rule depends on it) | FOUNDATION:267 |
| E34 | `phone_key` = `private.normalize_phone()` for an Iraqi mobile, otherwise Western digits only. One helper `private.phone_key` with a TS mirror `phoneKey()` and a parity test (WP1) | 0001_core.sql:304; FOUNDATION:804 |
| E35 | A warehouse, item or cash box with a non-zero balance cannot be archived | FOUNDATION:64 |
| E36 | Seeds: standard sites and stores per non-farm division, bag pack types 25/40/50 kg, system expense categories. Done in `create_my_org` plus an idempotent backfill | FOUNDATION:83-90, DECISIONS:136 |
| E37 | Audit triggers on every new tenant table, `stock_balances` included. The only exception is `units` (no `org_id`). Audit volume is measured in the property test | FOUNDATION:844 |
| E38 | One `home_summary()` that grows per package | FOUNDATION:779, src/lib/repo/home.ts:27 |
| E39 | Repo files `inventory.ts`, `purchasing.ts`, `parties.ts`, `cash.ts` (each under 2,000 lines) | FOUNDATION:195 versus the list at :175-176 |
| E40 | `set_member_scopes_v2` under a new name. `in_scope_division` keeps its meaning; navigation uses a "touches division" check | FOUNDATION:230 |
| E41 | Counting expired stock. For items with `tracks_expiry`, a count line has two counted quantities, `counted_qty` (not expired on `counted_on`) and `counted_expired_qty`. `submit_count` snapshots `system_qty` and `system_expired_qty`. The available diff posts as usual. An expired shortage draws only expired lots (earliest expiry first) as «فرق جرد». An expired surplus is a gain lot with its past `gain_expiry_on`, valued by rule 17; it then shows in «منتهي» and leaves by destruction or supplier return. Items without expiry tracking keep one quantity | One counted quantity against available stock only would post expired stock on the shelf as a gain at the last cost while the expired lot stayed (FOUNDATION:476, 479) |
| E42 | Count gains of chick items require `gain_born_at` (prefilled with `counted_on`), carried to the gain lot | FOUNDATION:293, 548 (openings carry `born_at`) |
| E43 | Reversals ignore archive guards (§2.6) | FOUNDATION:63, 594 |
| E44 | `void_party_payment` accepts every `payment` or `payout` entry that has a cash move, including the payout born from a receipt's `paid_now`. It reverses the payout, its cash move and its allocations; the receipt stays posted, and the correct amount is then paid with `pay_party`. `not_a_payment` is only for other kinds | FOUNDATION:588 is written for payments in general; without this, a wrong `paid_now` on a correct receipt has no reversal except voiding the receipt, which `lot_consumed` blocks once the stock is used (FOUNDATION:551) |
| E45 | The count-gain reference lot (rule 17) is the lot with the largest `fifo_seq` among lots whose original move was never reversed, whatever their source. Its `value_in`/`qty_in` are read as they stand, including revaluations | A voided document's lot keeps `qty_in`/`value_in` (FOUNDATION:429), so a voided mispriced receipt would otherwise set the gain value. A void means the posting did not stand (FOUNDATION:512) |
| E46 | Receipt lines snapshot `density_kg_per_l` and `piece_mass_kg` from the item when the line is written (line trigger); the charge mass weights use the snapshot | FOUNDATION:458, 460 (factor and density are snapshots); an item edit after the preview must not change the split without `stale_draft` (FOUNDATION:520) |
| E47 | Supplier return roles: the storekeeper drafts quantities under `receipt.draft`; the accountant or manager writes the accepted credit and posts under `receipt.amounts` | FOUNDATION:444 names the supplier return as a mixed document written by a non-cost role, with its amounts in a side table (also :336-337); amounts and posting follow the receipt (FOUNDATION:533; DECISIONS:96, 202). Formerly Q3 |
| E48 | Count gain with no earlier lot: the manager enters `gain_unit_cost` with up to 4 decimals and a reason. The value is computed once at posting, `_mul_div_round2(q, gain_unit_cost, 1)`, and stored as `gain_value` and on the lot | FOUNDATION:304, 479 (manager writes «كلفة الوحدة» with a reason); rule 9 (FOUNDATION:468) is about the displayed lot cost, and 4 dp is its precision. Formerly Q6 |
| E49 | Division scopes apply to the books. `party_entries`, `party_allocations` and the report functions are limited to books of in-scope divisions for reading and posting, through a definer `in_scope_book(book)`. Accountants and managers with no scope rows see everything. A scoped reader's totals are labelled «N من المجموع» | FOUNDATION:544 (scope enters the read and write policies themselves), :245 (no rows = whole org for owner, manager, accountant); :116 restricts the page to accounts roles but does not exempt them from scope. Formerly Q11 |
| E50 | The party statement is one `LedgerTable` per book, with exactly the six columns «التاريخ \| المستند \| البيان \| عليه \| له \| الرصيد». Each table is captioned with its book and has its own running balance and a totals row whose last line equals the book balance. «الكل» stacks the books | DECISIONS:21 (the owner's statement model) overrides the «الدفتر» column of FOUNDATION:114, 788. The per-book running balance of FOUNDATION:114 is kept. Formerly Q12 (only the cash-box labels remain, Q12) |
| E51 | A price correction does not re-split the receipt's header discount. `diff = new_total − current` is the line's gross change, and it is also the change in the supplier's net, because the discount is fixed. The supplier adjustment is −diff exactly, and only the corrected line's lot family moves. A discount change is not a price correction: void and re-post, or use a party adjustment | Follows from FOUNDATION:552 (adjustment = the diff; only «متبقّي الدفعة ومراياها» move) and :493 (supplier entry = Σ lines − discount) |
| E52 | No DELETE privilege on any table; draft rows are removed through `delete_draft_line`, `delete_receipt_charge` and `set_charge_lines` (§2.5) | foreign keys never cascade (`catalog.test.mjs:171`), and side rows are invisible to the storekeeper under RLS |
| E53 | Count lifecycle: draft → `submit_count` → submitted. While submitted: `count.approve` writes reasons and gain costs (§2.5), `refresh_count` re-snapshots and shows the recomputed diffs, `return_count` sends the count back to draft for a recount, and `discard_draft` discards it. Then `post_count` → approved | FOUNDATION:555 «تغيّر الرصيد بعد العدّ (ينعاد حساب الفرق وينعرض)»; a raised `count_stale` rolls back, so the recompute needs its own committed call |
| E54 | Barcode in Phase 1: keyboard-wedge scanners in the code and item-picker fields of the receipt, count, transfer and stock-use screens. A burst is judged by `event.timeStamp`, an unknown code is shown as it arrived, and filtering uses `useDeferredValue`. Camera scanning is not in Phase 1 | FOUNDATION:812-813; FOUNDATION:897 does not list a scanner. Items carry `barcode` and `alt_codes` (FOUNDATION:269) |
| E55 | Posting functions snapshot every computed value on the document side: receipt discount and charge shares (`receipt_charge_shares` per charge and line), count `gain_value` and `shortage_value`, and revaluation `old_total`, `diff`, `lot_share` and `expense_amount`. `verify_*` compares lots and ledgers against these snapshots, not against `stock_moves` themselves | FOUNDATION:430 only means something with independent sources; FOUNDATION:235 allows added columns |

### 2.12 Role matrix per function (FOUNDATION:528-544, 865; DECISIONS:194-209)

Every Phase-1 function is called by each of the eight roles, as `authenticated`, in role-matrix.test. Allowed roles must succeed, with a positive control per cell. Every other role must get `forbidden` (or 0 rows for a direct read). A scoped role outside its scope gets `out_of_scope`. The manager succeeds on every operational cell, and the accountant fails on them (FOUNDATION:544, 865). The WP0 coverage registry checks that every (function, role) pair below was called. Rows marked "Q1" follow Q1's recommended option and change with the answer.

| Functions or direct writes | Action | Allowed (others forbidden) |
| --- | --- | --- |
| master data: sites, warehouses, items, item units, pack types, item categories (Q1) | `stores.manage` | owner, manager |
| parties: create / edit and archive (Q1) | `party.create` / `parties.manage` | create: owner, manager, accountant, storekeeper; edit and archive: owner, manager, accountant |
| cash accounts, expense categories (Q1) | `cash_accounts.manage`, `expense_categories.manage` | owner, manager, accountant |
| `set_member_scopes_v2` | `members.manage` | owner |
| `set_division_go_live`, `record_opening_balance`, `post_opening_stock`, `preview_opening_stock`, `record_cash_opening` (Q10) | `opening.post` | owner, manager |
| `record_party_payment`, `pay_party`, `preview_party_allocation` (payment mode), `transfer_cash` (Q10) | `payment.post` | owner, manager, accountant |
| `record_party_adjustment`, `forgive_debt` | `party.adjust` | owner, manager |
| every `void_*` (payment, entry, cash move, opening, transfer, stock use, count, expense, receipt, supplier return, revaluation) | `void` | owner, manager |
| `report_*`, `stock_values`, `stock_value_totals`, `item_lots_value` | `accounts.view` plus the `can_see_cost()` or `can_see_accounts()` check | owner, manager, accountant |
| `stock_on_hand`, `item_lots_qty`, `item_moves_qty` | `read` plus `in_scope_wh` | every role with the store in scope (owner, manager and accountant with no scope rows see every store) |
| `home_summary` | `read` | every role; money parts only for cost roles |
| transfer drafts, `post_transfer`, `preview_transfer` | `transfer.post` (Q4 for the destination) | owner, manager, storekeeper (source in scope); accountant forbidden |
| stock-use drafts, `post_stock_use`, `preview_stock_use` | `stock_use.post`; destruction lines `expired.destroy`; a named expired lot `expired.release` (Q5) | owner, manager, storekeeper; destruction and release lines: owner, manager; accountant forbidden |
| count drafts, `submit_count` | `count.enter` | owner, manager, storekeeper; accountant forbidden |
| `refresh_count`, `return_count`, `preview_count`, `post_count`, count review writes | `count.approve` | owner, manager |
| `record_expense` | `expense.post` | owner, manager, accountant |
| receipt and supplier-return drafts (quantities) | `receipt.draft` | owner, manager, storekeeper; accountant forbidden |
| receipt and supplier-return amount tables, `delete_receipt_charge`, `set_charge_lines`, `post_receipt`, `post_supplier_return` | `receipt.amounts` | owner, manager, accountant |
| `preview_receipt`, `preview_supplier_return` | `receipt.draft` or `receipt.amounts` | owner, manager, accountant, storekeeper (quantities only for the storekeeper) |
| `post_receipt_revalue`, `preview_receipt_revalue` | `receipt.revalue` | owner, manager |
| `delete_draft_line`, `discard_draft` | the draft action of that document kind | as the draft row above |
| `find_item_twins` / `find_party_twins` | `read` / `party.create` or `parties.manage` | every role / as the party row above |
| `in_scope_site`, `in_scope_wh`, `in_scope_book` (identity functions called by policies) | none | every role; the result follows the scope rules (WP2) |

---

## 3. Work packages

Order: WP0 → WP1 → WP2 → WP3 → WP4 → WP5 → WP6 → WP7 → WP8. WP3 (ledger) is independent of stock and comes first so the money engine is proven before stock posting uses it. Each package waits for the owner questions mapped to it in §4.0.

### WP0: Harness, guards and error plumbing (no migration)

**Goal:** the harness and guards can carry Phase-1 tables, so later packages only add entries.

**Harness (`supabase/tests/run.mjs`):**
1. Discover every `public.verify_%` from `pg_proc` and run it as service_role at three points: after the double migration, after **every** test file, and at suite end. Fail on any non-zero row. Today `verify_core` runs only inside core.test and concurrency.test (GT-03).
2. Take a suite-end catalog snapshot and require it to equal the post-migration snapshot (GT-25). Add PROBES (run.mjs:243): disable an append-only trigger; drop a restrictive policy; change a `round(x,2)` check; change a function's `lock_timeout`.
3. Rollback runner (FOUNDATION:820, 876):
   - Every migration's header line «تراجع:» (FOUNDATION:845) names either `rollback_NNNN.sql` or «إضافية فقط».
   - A migration is heavy, and must have a rollback file, when it alters a table that already exists in production or replaces the body of a function there that the app calls or that writes data. Read-only `verify_*` replacements do not count.
   - In Phase 1, 0005 is heavy: it alters `member_scopes` and `divisions`, replaces `create_my_org`, `my_workspace`, `private.actions` and `private.role_can`, and backfills seeds.
   - Each later migration is heavy too, for at least one reason: 0006 alters `item_units`; 0007 replaces `home_summary`; 0008 alters `ledger_books`; 0009 and 0010 replace `delete_draft_line`, and 0010 also `void_receipt`.
   - Each rollback file restores the previous function bodies and drops only what its migration added.
   - For each named file: apply all migrations, seed through the real RPCs, run the rollback, re-apply, then run every `verify_*` and the catalog snapshot comparison.
   - The runner fails when a named file is missing, and it prints how many rollbacks it ran. From WP2 on, zero rollbacks run is a failure: a check over zero cases is not a pass (FOUNDATION:836).
   - The migration filter stays `^\d{4}_` (run.mjs:33-39).
4. RPC coverage registry: record every `(public.<fn>, role)` pair called as authenticated. At the end, every allowlisted function must have been called by **every** role listed in §2.12, not only once (GT-27; FOUNDATION:865).
5. `db.setToday(date)` overrides `app_today()` in a committed scope and restores it in `finally` (CLAUDE.md lesson 2026-10-26; core.test pattern). At suite end, assert the function body equals the migration's.
6. Shared test helpers, so every later package gets the same proofs by registering its document kind:
   - `sameRefRace(kind)` (FOUNDATION:873, 886): two sessions call the post function with the same `p_id` and ref at the same moment, giving one posting, one number and identical masked results. Then the same ref with a different `expected_version` gives `ref_reused`, and a posted document replayed under a new ref gives `not_draft`.
   - `draftWriteLock(kind)` (FOUNDATION:526): as `authenticated`, insert a `posted` header, flip a draft to `posted`, and edit a line (and, where the kind has them, an amount side row) of a posted document; all three are rejected. A rejection counts only when it is the draft lock itself: an RLS violation (42501 `row-level security`), a guard code (`not_draft`, `frozen_column`, `append_only`), or zero rows for a row the table owner can reach. Any other error (a misspelled table or column, a missing NOT NULL column) fails the helper. Each statement has a positive control in the same shape on the draft: the kind gives `insertHeader(status)` and `setStatus(doc, status)`, so inserting a `draft` header, setting the draft's status to `draft`, and editing the draft's line and amount row must all succeed.

**Catalog (`supabase/tests/catalog.test.mjs`):**
- Replace :30 (all policies SELECT) and :119-120 (authenticated never writes) with exact checks against `classes.json`. Write policies exist only on `directWrite` tables. INSERT and UPDATE privileges equal the file, column-level grants included (`columns` names them). DELETE, TRUNCATE, REFERENCES and TRIGGER are never granted, on the table or on a column (E52). Every write policy carries `org_id = (select auth_org())` and `can('<action>')` in each clause that gates its command, with no OR, plus `status = 'draft'` and the scope call when the entry names `draft` and `scope` (§2.5).
- New: no policy expression references its own table (FOUNDATION:800). Every `appendOnly` table has `reject_change` as a row trigger (before update or delete) and a statement trigger (before truncate). `can_see_cost` and `can_see_accounts` are body-equal (§2.8).
- `global` tables are excluded from common columns (:155) and from `NO_AUDIT`.
- Today `classes.json` lists no direct-write tables, so behaviour is unchanged. A rollback probe that adds a write policy must make it fail.

**Guards:**
- **migration-guard (GT-24):**
  - a function body with `for update` or `pg_advisory_xact_lock` must contain `set local lock_timeout = '5s'`;
  - ban every `/` operator in SQL code (rule 8: `numeric / numeric` rounds by itself, so `round(a*b/c)`, `trunc`, `ceil`, `floor`, integer casts and two-step division all double-round), and `power(x, -n)` except base 10; division goes through `_mul_div_round2/0`, `div()` and `mod()`, with no marker;
  - every function body is dollar-quoted (`$$` or `$tag$`), so the lock rule can read it;
  - ban `float`, `real`, `double precision` and `numeric(`;
  - every `create table` needs `enable row level security` in the same file.
- **write-guard (GT-21):**
  - derive `FUNCTION_ONLY_TABLES` from `classes.json`;
  - repo calls to `post_*`, `void_*`, `record_*`, `pay_party`, `forgive_debt`, `submit_*`, `refresh_count`, `return_count` and `transfer_cash` must pass `p_client_ref`, and `post_*`, `submit_*`, `refresh_count`, `return_count`, `discard_draft`, `delete_draft_line`, `delete_receipt_charge` and `set_charge_lines` must pass `p_expected_version`;
  - no direct `.delete(` in `src/lib/repo` (E52);
  - direct-write payloads must not contain `status`, `doc_no`, `version`, `posted_*`, `voided_*`, `book_id`, `discount_share`, `charge_share`, `gain_value`, `shortage_value`, `system_qty`, `system_expired_qty`, `diff` or `org_id`. Literal keys are read even next to a spread, and a dynamic payload (the `Partial<…>` patch of §2.5) is read through its TypeScript type; an open type (`any`, `Record<string, …>`) fails, with no marker;
  - in `src/lib/repo`, a write or `.delete(` on a builder not traced to `.from(` in the same chain fails (Map/Set deletes excepted), and an RPC name that cannot be read fails (except inside `call` in core.ts).
- **reports-guard (GT-22):** derive `MONEY_TABLES` from `classes.json`. Accept keyset paging (`order` + `limit` + a `gt`/`lt` cursor) as bounded.
- **money-guard (GT-23):** ban `Number(`, `parseInt(`, `parseFloat(` and `* 100`/`* 1000` arithmetic on parsed values in `src/domain` and `src/lib/repo`. Parsing goes through `parseDecimal`/`toScale`. The guard is not silenced for non-money code: a legitimate use carries a reason marker on its line, `// number-ok: السبب`, in the style of FOUNDATION:835. The two existing hits are calendar parts, not money, and get the marker in this package: `src/domain/dates.ts:22` and `:24` (year, month and day of a `YYYY-MM-DD` string). The selfTest proves that an unmarked `Number(` in `src/domain` and a marked one are each judged correctly, once.
- Each new rule gets a selfTest case that is caught exactly once (FOUNDATION:833, CLAUDE.md lessons).

**Errors:**
- `classifyPostgrest` (src/lib/repo/core.ts:59): 40P01 and 55P03 become a retryable error with the text «لم يُرحَّل، أعد المحاولة». 23514 names the constraint through the i18n key `constraint.<name>` (FOUNDATION:808).
- A harness test lists every check constraint in the catalog and fails when the Arabic dictionary lacks its key (GT-20).

**Tests:** guard selfTests; a harness self-probe (a committed violation in a scratch org fails the post-file verify step); `repo.test` for the new classifications.

**Proves:** infrastructure for D1–D6.

### WP1: `0004_math_units.sql` (units, rounding, allocation, normalisation)

**Tables:**
- `public.units(code text primary key, dimension text check in (mass, volume, count), base text check in (kg, L, pc), factor numeric check (abs(factor) < 'Infinity' and factor > 0 and factor = round(factor, 3)))`.
- Seeded `kg 1, g 0.001, t 1000, L 1, mL 0.001, pc 1` (FOUNDATION:266).
- Global, with no `org_id` (named exception, FOUNDATION:237). RLS on, with policy `units_read for select to authenticated using (true)`. No write grant; `reject_change` row and truncate triggers. In `classes.json` it is `global` and `functionOnly`.

**Private helpers** (immutable, no `org_id`):
- `_mul_div_round(q, v, l, n) = sign(v) × round(div(2·q·|v|·10ⁿ + l, 2·l) / 10ⁿ, n)`. It raises `mul_div_domain` when q ≤ 0 or l ≤ 0. Also `_mul_div_round2(q,v,l)` and `_mul_div_round0(q,v,l)` (FOUNDATION:467).
- `alloc_lr(p_total numeric, p_weights numeric[], p_scale int) returns numeric[]`. Uses `div`/`mod` on `|total|·10^scale`; leftovers go one unit at a time to the largest remainders, ties by array index, and the sign is reapplied. Raises `zero_weights` and `negative_weight`. Mirrors allocation.ts:5.
- `to_base(qty_in_unit, factor, base)`: `round(q×f,3)`, raising `pieces_not_whole` for pc. Mirrors units.ts:37.
- `liters_to_kg(L, density)` and `kg_to_liters(kg, density)`: round3 (units.ts:54, 60, FOUNDATION:460).
- `searchable(text)` and `normalize_code(text)`: mirrors of normalize.ts:26, 40. Explicit character lists, never `[[:space:]]` (DECISIONS:43). Eastern digits are translated before tashkeel removal (FOUNDATION:758).
- `phone_key(text)` (E34): `private.normalize_phone(x)` (0001_core.sql:304) when it returns a value, otherwise the input with Eastern digits translated and every non-digit removed (null when no digit is left). Its mirror is a new `phoneKey()` in `src/domain/phone.ts`, built on `normalizePhone` and `toWesternDigits`, so both sides come from the same function (FOUNDATION:804).

**RPCs:** none (allowlist unchanged).

**Domain and format:**
- `money.ts`: `unitCost4(value: Fils, qty: Milli)`, display only (FOUNDATION:468).
- `format.ts`: `fmtUnitCost` (4 dp) and `fmtPercent` (2 dp). Today `fmtMoney` supports only 0 or 2 decimals (format.ts:42).

**Postgres tests (extend `supabase/tests/parity.test.mjs`):**
1. The four rule-8 edge cases. SQL = TS (`mulDivRound2/0`, money.ts:33, 40) = literal: `_mul_div_round2(99,999.999, 400,000,000.01, 200,000)` = 199,999,998.00; `_mul_div_round0(99,999.999, 400,000,001, 200,000)` = 199,999,998; `(1, −0.03, 2)` = −0.02; `(500, −120,000.00, 3,000)` = −20,000.00.
2. 10,000 seeded random triples, including ties and negatives, with zero tolerance.
3. Negative control: `round(q*v/l, 2)` differs on the first edge case.
4. `alloc_lr` against `allocateLargestRemainder` on generated weights, with ties, negative totals and zero weights. Includes 6,500,000 fils over weights 5,000,000/1,000,000 giving 5,416,667 and 1,083,333 (FOUNDATION:620; D2).
5. `to_base` against `toBase`, including half-gram ties and fractional pieces.
6. Density both ways (250 L × 0.92 = 230.000 kg).
7. `searchable` and `normalize_code`: full BMP sweep plus the «٧٧٠٩٩» case (FOUNDATION:804).
7a. `phone_key` against `phoneKey`: the existing `PHONE_CASES` (phone.test.mjs, used by parity.test.mjs:4) plus landlines, foreign numbers, mixed Eastern and Western digits, and inputs with no digit; then a full BMP sweep of single characters around a fixed number.
8. `units` rows equal `UNITS` (units.ts:13; factor in milli).

**Unit tests:** `format.test` for `fmtUnitCost` (480.8333, 910.8333, 397.8723) and `fmtPercent` (13.18); `phone.test` cases for `phoneKey`.

**Proves:** rule-8 parity, the base of D1–D3.

### WP2: `0005_scopes_stores_items.sql` (scopes, sites, warehouses, items, packs, categories, go-live)

**Tables and constraints** (common columns and composite FKs everywhere, FOUNDATION:237):
- **`member_scopes`.** Add `site_id`, `warehouse_id` and composite FKs, plus `check (num_nonnulls(division_id, site_id, warehouse_id) = 1)`. Add it `not valid`, then validate after counting the existing rows. Each target gets a partial unique index and an index; `hall_id` comes in Phase 3 (FOUNDATION:244).
- **`divisions`.** Add `first_posted_at timestamptz` (function-only, E14).
- **`sites(division_id, name, kind ∈ {farm, mill, hatchery, store}, archived_at, version)`.** `unique (org_id, division_id, id)`. Trigger `private.check_site_kind`: feed_mill→mill, hatchery→hatchery, broiler/layer→farm, medicine/general→store (FOUNDATION:263).
- **`warehouses(division_id, site_id, name, kind, archived_at, version)`.**
  - FK `(org_id, division_id, site_id) → sites(org_id, division_id, id)`.
  - Trigger `private.check_warehouse_kind`: raw/feed→feed_mill; hatching_egg/chick→hatchery; medicine→medicine; general→general; farm→broiler|layer; table_egg→layer.
  - `unique (org_id, site_id) where kind='table_egg' and archived_at is null` (FOUNDATION:276-279).
  - `unique (org_id, division_id, id)`.
- **`pack_types(label, dimension, factor > 0 ≤ 6 dp, archived_at, version)`.** Bag and carton sizes defined in settings (DECISIONS:111, 136).
- **`item_categories(name, archived_at, version)`** (E33).
- **`items(name, name_norm, category_id?, kind, base_unit, density_kg_per_l?, piece_mass_kg?, tracks_expiry, scale_step default 0.1, min_qty?, barcode?, alt_codes text[] default '{}', archived_at, version)`.**
  - `kind` enum per FOUNDATION:270-271.
  - `base_unit ∈ {kg, L, pc}`; `hatching_egg`, `chick` and `table_egg` must be `pc`.
  - Density only for L, > 0, 4 dp. `piece_mass_kg` only for pc, > 0, 3 dp. `scale_step` > 0, 3 dp. `min_qty` ≥ 0, 3 dp.
  - Trigger: `name_norm = private.searchable(name)`; barcode and alt codes go through `private.normalize_code`.
  - Twin rules per Q2. The recommended set keeps the written rule (FOUNDATION:813): a twin by `name_norm` is warned before save and allowed after confirmation (`find_item_twins(p_name, p_codes)` returns them). Codes are unique among active rows (`unique (org_id, barcode)`, alt codes by trigger), because a scanned code must resolve to one item (FOUNDATION:812).
- **`item_units(item_id, pack_type_id?, label, factor_to_base > 0 ≤ 6 dp, is_default, for_purchase, for_sale, for_recipe, archived_at, version)`.** `unique (org_id, item_id) where is_default and archived_at is null`. `party_id` is added in WP3 (FOUNDATION:273-274).
- **`expense_categories(name, system_code?, archived_at, version)`.**
  - `unique (org_id, system_code) where system_code is not null`. A trigger stops system rows changing code or being archived.
  - System codes: `expired_destroy` «إتلاف منتهي», `count_diff` «فرق جرد», `purchase_price_diff` «فرق سعر شراء», `supplier_return_diff` «فرق مرتجع», `voided_receipt` «استلام ملغى» (FOUNDATION:476, 479, 551-553). «فاقد تفقيس» comes in Phase 5.

**Seeds (E36):**
- `private.seed_org_defaults(p_org)` is called from `create_my_org`. It is `create or replace` with the same signature (0001_core.sql:620) and seeds idempotently by unique keys. A backfill runs `select private.seed_org_defaults(id) from orgs`.
- It seeds:
  - mill site «المعمل» with «مخزن المواد الأوّلية» (raw) and «مخزن العلف» (feed);
  - hatchery site «المفقس» with «مخزن بيض التفقيس» and «مخزن الأفراخ»;
  - a medicine store «مخزن الأدوية»;
  - a general store «المخزن العام»;
  - bag pack types 25, 40 and 50 kg;
  - the system expense categories.
- Farm sites and stores are created by the user (halls come in Phase 3).

**Functions:**
- `public.in_scope_site(p_site uuid) returns boolean` and `public.in_scope_wh(p_warehouse uuid) returns boolean`. Definer identity functions, allowlisted. They mirror `inScope()` (permissions.ts:179-183):
  - the owner always passes;
  - with no scope rows, managers and accountants see everything and other roles see nothing;
  - a division row covers its sites and warehouses, a site row covers its warehouses, and a warehouse row covers itself.
- `private.scope_touches_division(div)` is used only by `my_workspace().divisions` (E40).
- `public.set_member_scopes_v2(p_member uuid, p_divisions uuid[], p_sites uuid[], p_warehouses uuid[]) returns void`. Requires `members.manage`; the owner only (DECISIONS:207). The old `set_member_scopes(uuid, uuid[])` stays.
- `my_workspace()` adds `site_id` and `warehouse_id` to each `scopes` element (additive keys; 0001_core.sql:600).
- `public.set_division_go_live(p_division uuid, p_go_live_on date) returns date`. The action depends on Q1 (recommended `opening.post`, manager). Raises `go_live_frozen` when `first_posted_at` is set, and `period_locked` for a locked date.
- `public.find_item_twins(p_name text, p_codes text[]) returns jsonb` (any member with `read`): items whose `name_norm` or codes match after normalisation on both sides (FOUNDATION:813). STABLE, no values.

**Rollback:** `rollback_0005.sql` (heavy migration, WP0 runner). It restores the bodies of `create_my_org`, `my_workspace`, `private.actions` and `private.role_can` as last defined by 0001–0003, checked by `md5(prosrc)` against the pre-0005 snapshot. It drops the new tables, the seeds with them, and the new `divisions` column. It drops the new `member_scopes` columns and check, failing loudly if any row uses a site or warehouse target, never deleting it. The runner tests both paths. Without such rows, the rollback completes, 0005 re-applies, and the backfill gives the same seeds with `verify_*` = 0. With one such row, the rollback raises and changes nothing.

**Permissions:** new actions per Q1. The recommended set:
- `stores.manage` (manager): sites, warehouses, items, item units, pack types, item categories.
- `expense_categories.manage` (manager, accountant).

`private.actions()` and `private.role_can()` are `create or replace` (0002_account_checks.sql:74-98); `permissions.ts` `ACTIONS`/`GRANTS` mirror them, and the cell-by-cell parity test (parity.test.mjs) covers them.

**Policies:**
- Master tables are readable org-wide (they carry no cost, FOUNDATION:443).
- Insert and update require `org_id = (select auth_org()) and (select can('<action>'))`. There is no DELETE privilege.
- `classes.json`: `directWrite` (insert, update).

**Domain:** `permissions.ts` (new actions); `workspace.ts` parses the new scope keys (workspace.ts:139). A scope target passed to `inScope` always carries the full chain warehouse→site→division.

**Repo:**
- `src/lib/repo/inventory.ts`: `listWarehouses`, `listItems` (keyset), `saveItem`, `saveItemUnit`, `saveWarehouse`, `saveSite`, `savePackType`, `archive*`, `restore*`. Writes send changed fields only, use `updatedRows()`, and are conditioned on `version`.
- `workspace.ts`: `setDivisionGoLive`.
- `members.ts`: `setMemberScopesV2`.

**Screens:**
- **«إعدادات المنشأة»** (`/settings/org`, manager or owner):
  - divisions with their go-live date (frozen after the first posting, with the reason shown);
  - sites and stores per division (create, rename, archive or restore through a `ConfirmDialog` that names the record and the effect);
  - bag types, item categories and expense categories (system rows read-only).
- **Items** (`/inventory/items`): a `DataTable` with search by `searchable` and `normalizeCode`, keyset paging and «N من المجموع».
  - The form: kind, base unit, density, piece mass, expiry tracking, step, minimum quantity, and the barcode and alternative codes. Codes are added and removed only here; there is no "link code to item" dialog (FOUNDATION:813).
  - Pack units come from pack types or are custom, with one default.
  - A twin warning appears before save.
- **Staff page:** the scope picker gains sites and warehouses (owner only) and calls `set_member_scopes_v2`. Row actions stay in the first column (DECISIONS:73).

**Postgres tests (`stores.test.mjs`):**
- **division-check (FOUNDATION:864):** each site kind against each division; each warehouse kind against each division; a second active table_egg store per site; a warehouse whose site is in another division (rejected by the composite FK).
- **tenant-fk:** an `item_unit` pointing to another org's item is rejected.
- **role-matrix:** master writes for each role, with a positive control for every allowed cell.
- **Scope parity:** `in_scope_wh`/`in_scope_site` against `inScope` over generated scope sets with real members (parity.test pattern).
- **Go-live:** a non-manager gets `forbidden`; a frozen division gets `go_live_frozen`.
- **Twins:** hamza, ta marbuta and Eastern-digit spellings are found by `find_item_twins`; a confirmed twin name saves; a code collision is rejected.
- **Seeds:** idempotent (`create_my_org` replayed, backfill run twice).
- **Rollback:** `rollback_0005.sql` runs, 0005 re-applies, seeds and `verify_*` match.
- **Role matrix:** the §2.12 rows for this package (`set_member_scopes_v2` owner only; `set_division_go_live`; master writes per Q1).
- The catalog test runs automatically on all new tables.

**Unit tests:** `permissions.test` (new actions), `workspace.test` (scope keys), screen renders (items form, settings, staff scope picker).

**Proves:** the prerequisites for division-check, role-matrix and cost-leak tests; the store matrix needed by D1 and D3.

### WP3: `0006_parties_ledger_cash.sql` (parties, party ledger, allocation, payments, cash boxes, accounts page)

**Rollback:** `rollback_0006.sql` (WP0 rule: it alters `item_units`).

**Tables:**
- **`parties(name, name_norm, phone, phone_key, is_customer, is_supplier, archived_at, version)`.** A trigger maintains `name_norm` and `phone_key` (E34, WP1 helper). Twin and archive rules per Q2 (recommended: warn on the same `phone_key` or `name_norm` and allow after confirmation, through `find_party_twins(p_name, p_phone)`, FOUNDATION:813). Restrictive `can_see_sales` policy (FOUNDATION:309, 443). Direct write per Q1.
- **`item_units`:** add `party_id?` with a composite FK to parties (supplier-specific packs, FOUNDATION:273).
- **`cash_accounts(name, kind ∈ {cash, bank, wallet}, archived_at, version)`.** Restrictive `can_see_accounts`. Direct write per Q1 (FOUNDATION:416).
- **`doc_counters(kind, year, last_no)`.** `unique (org_id, kind, year)`, function-only, readable within the org (FOUNDATION:247).
- **`party_entries(seq bigserial, party_id, book_id, kind, amount, doc_kind?, doc_id?, doc_no?, on_date, reverses_entry_id? unique, reason?, posted_at, posted_by)`.**
  - `amount <> 0 and amount = round(amount, 0)`.
  - Kind enum: `invoice purchase bill payment payout return supplier_return forgiveness opening adjustment offset`.
  - A CHECK fixes the sign for originals with a fixed sign: `invoice`/`payout`/`supplier_return` are +, and `purchase`/`bill`/`payment`/`return` are −. A reversal takes the opposite sign.
  - A trigger checks that a reversal has the same party, book and kind and exactly −amount.
  - `unique (org_id, party_id, book_id, id)`.
  - Indexes `(org_id, party_id, book_id, on_date, seq)`, `(org_id, book_id)` and `(org_id, doc_kind, doc_id)`.
  - Append-only; restrictive `can_see_accounts` (FOUNDATION:311-318).
- **`party_allocations(party_id, book_id, debit_entry_id, credit_entry_id, amount <> 0 whole dinar, reverses_allocation_id? unique)`.**
  - Composite FKs `(org_id, party_id, book_id, debit_entry_id)` and `(… credit_entry_id) → party_entries(org_id, party_id, book_id, id)`, so cross-book and cross-party allocation is impossible.
  - A trigger requires the debit entry to be > 0 and the credit entry < 0.
  - Append-only; `can_see_accounts` (FOUNDATION:319-323).
- **`cash_moves(account_id, amount <> 0 whole dinar, kind, doc_kind?, doc_id?, on_date, reverses_move_id? unique, posted_at, posted_by)`.**
  - Kinds: `party_payment`, `party_payout`, `receipt_paid`, `receipt_charge`, `expense`, plus `opening` and `transfer` if Q10 allows them.
  - Append-only; `can_see_accounts` (FOUNDATION:417).

**Private helpers:**
- `ref_claim`, `ref_store` and `mask` (§2.2).
- `lock_parties(uuid[])` (§2.3).
- `next_doc_no(kind, date)`, which formats `KIND-YYYY-NNNN`.
- `check_post_date`, `check_opening_date` and `check_void_date` (§2.4), and `mark_division_posted(division)`.
- `write_entry(p_id, party, book, kind, amount, doc_kind, doc_id, doc_no, on_date, reason, reverses)`. It rejects an archived party for new purchases, bills and adjustments per Q2; a reversing entry (`reverses` set) is never rejected for archive (E43).
- **`allocate_new(entry, first_target?)`, rule 27 (FOUNDATION:495).** It is called for **every** new original entry, whatever its kind, so a new purchase, bill or opening also settles any opposite open balance in the same book, oldest first («وقيد جديد … يتوزّع من أي رصيد مقابل قائم»):
  1. allocate to `first_target` (the document's own entry);
  2. then to active opening entries (E8);
  3. then to open opposite entries by `(on_date, seq)`, never by `doc_no` text;
  4. any surplus stays in the same book.

  Remaining = |amount| − Σ allocations, kept within [0, |amount|].
- **`void_entry(entry, reason)`:**
  1. unwind the original's allocations with negative rows;
  2. write the reversal with the same kind and opposite sign, dated today;
  3. allocate it fully to its original (a closed pair);
  4. re-flow the freed counter entries oldest first.
- `write_cash_move(p_id, account, amount, kind, doc_kind, doc_id, on_date, reverses)`. It rejects an archived box for an original move, never for a reversing one (E43). The negative-balance rule follows Q10.
- `public.in_scope_book(p_book uuid) returns boolean`: definer identity function, allowlisted because policies call it (FOUNDATION:517), true when `in_scope_division(book's division)` (E49).
- `book_division(book)`.

**RPCs** (every one: definer, `p_client_ref` last; returns jsonb):

| Function | Action | Notes and errors |
| --- | --- | --- |
| `record_opening_balance(p_id uuid, p_party uuid, p_book uuid, p_amount numeric, p_on_date date, p_client_ref uuid)` | `opening.post` | `opening` entry; positive = «عليه», negative = «له». `book_required`, `amount_zero`, `amount_not_whole_dinar`, `opening_exists` (an active one; a reversed one does not block), `no_go_live`, `after_go_live`, `period_locked`, `ref_reused` (FOUNDATION:549) |
| `record_party_payment(p_id, p_party, p_book, p_amount, p_account, p_on_date, p_client_ref)` | `payment.post` | «قبضنا»: `payment −amount`, `RC-YYYY-NNNN`, cash move +, rule-27 allocation; the surplus stays «له» in the same book. `amount_not_positive`, `book_required`, `cash_account_required`, date errors (FOUNDATION:586) |
| `pay_party(p_id, p_party, p_book, p_amount, p_account, p_on_date, p_client_ref)` | `payment.post` | «دفعنا»: `payout +amount`, `PY-…`, cash move − (FOUNDATION:587) |
| `void_party_payment(p_id uuid, p_reason text, p_client_ref uuid)` | `void` | reversing entry paired with its original, reversing cash move, reversing allocations, with freed entries re-flowing. It also accepts the payout born from a receipt's `paid_now` (E44); the receipt stays posted. `already_reversed`, `reason_required`, `not_a_payment` for any kind other than `payment`/`payout` (FOUNDATION:588) |
| `record_party_adjustment(p_id, p_party, p_book, p_direction text, p_amount, p_on_date, p_reason, p_client_ref)` | `party.adjust` | `debit` +, `credit` −; allocated like a payment (FOUNDATION:589) |
| `forgive_debt(p_id, p_party, p_book, p_amount, p_on_date, p_reason, p_client_ref)` | `party.adjust` | sign opposite to the balance, computed after the lock; `balance_zero`, `exceeds_balance` (FOUNDATION:590) |
| `void_party_entry(p_id uuid, p_reason text, p_client_ref uuid)` | `void` | for opening, adjustment and forgiveness entries (FOUNDATION:591) |
| `record_cash_opening(p_id, p_account, p_amount, p_on_date, p_client_ref)` / `transfer_cash(p_id, p_from, p_to, p_amount, p_on_date, p_note, p_client_ref)` / `void_cash_move(p_id, p_reason, p_client_ref)` | per Q10 (recommended `opening.post` / `payment.post` / `void`) | only if Q10 answers yes |
| `preview_party_allocation(p_party uuid, p_book uuid, p_kind text, p_amount numeric) returns jsonb` | `payment.post` or `party.adjust` | STABLE; the same engine without writes (FOUNDATION:770) |
| `report_party_balances(p_from date, p_to date, p_division uuid, p_nonzero boolean, p_sort text, p_after jsonb, p_limit int)` | invoker + explicit `accounts.view` check | keyset page of parties, one row per party with a cell per book: brought-forward, movements, closing, oldest open `on_date`. Sort by largest balance or oldest open entry, with the cursor on (sort key, party id) |
| `report_accounts_summary(p_from date, p_to date)` | same | per division and for the project: «لنا» = Σ max(balance, 0) and «علينا» = Σ max(−balance, 0) over (party, book), no netting (FOUNDATION:435); plus the party counts (all, non-zero) for «N من المجموع». The page's header **and** its two footer rows come only from here (FOUNDATION:788) |
| `report_party_statement(p_party uuid, p_book uuid, p_from date, p_to date)` | same | per book: a brought-forward row, then `(on_date, seq)` rows with debit, credit and running balance; `p_book` null = every book |
| `report_cash_balances(p_from, p_to)` / `report_cash_statement(p_account, p_from, p_to)` | `accounts.view` | box balance = Σ moves, computed in SQL |
| `home_summary() returns jsonb` | any member | accounts card (receivable and payable) only when `can_see_accounts()`; grows in WP4/WP5 (E38) |
| `find_party_twins(p_name text, p_phone text) returns jsonb` | `party.create` or `parties.manage` | parties whose `phone_key` or `name_norm` match after normalisation on both sides (FOUNDATION:813; Q2). STABLE, no balances |
| `verify_ledger()` | service_role | see below |

**`verify_ledger()` checks** (FOUNDATION:435, GT-02); each has a BREAK probe:
1. Every entry's remaining is within [0, |amount|].
2. Per (party, book): Σ amount = Σ positive remainders − Σ negative remainders.
3. Every allocation pairs a + entry with a − entry of the same (party, book).
4. Every reversal is fully allocated to its original, with the opposite sign.
5. Party and cash amounts are whole dinar.
6. Kind and sign follow the table.
7. Every `payment`/`payout` entry has a matching cash move with the opposite direction.
8. Every cash move ties to its source, and every source has exactly one live move:
   - `party_payment` = +|payment entry|, `party_payout` = −payout entry;
   - `receipt_paid` = −`paid_now` and `receipt_charge` = −charge amount of the posted receipt (WP6);
   - `expense` = −expense amount (WP5);
   - `opening` = the recorded amount, and the two `transfer` legs sum to 0 (Q10);
   - each reversal is equal and opposite to its original, once;
   - a source whose payout or payment was voided (including a receipt-born payout, E44) has its move reversed, once.

   (The former "box balance = Σ moves" had no stored balance to compare with, so no probe could flip it.)
9. `report_accounts_summary` and `report_cash_balances` equal the formulas recomputed from raw rows.
10. **Allocation completeness (rule 27, FOUNDATION:495).** Per (party, book), an open positive remainder and an open negative remainder never coexist, because every new entry and every freed entry is allocated against the opposite open balance. An allocation bug passes checks 1–4 but fails this one.
11. **Numbering** (moved here from `verify_stock` so RC and PY are covered from WP3). For every `(org, kind, year)` in `doc_counters`, the numbered originals carry unique numbers `1…last_no` with no gap, and only on posted or void documents. RC and PY come from the standalone payment and payout originals in `party_entries`. Each later package adds its own source (TR, SU, CT, PU, RT) by replacing `verify_ledger` with the same signature.

**Permissions:**
- Parties and cash accounts are direct-write per Q1. Recommended: `parties.manage` (manager, accountant), `party.create` (also the storekeeper, insert only), `cash_accounts.manage` (manager, accountant).
- Division scope on the books (E49, formerly Q11): `in_scope_book(book)` inside the read policies of `party_entries` and `party_allocations`, in every posting function that writes an entry, and in the report functions.
- Role matrix: the §2.12 rows for this package.

**Domain:**
- `src/domain/ledger.ts`:
  - `runBooks(entries)`: one running balance per book (it reuses `runLedger`, ledger.ts:39).
  - `allocationPlan(openEntries, amount, mode)`: mirror of `private.allocate_new`, used by the preview. A parity test compares it against `preview_party_allocation`.
  - `accountsTotals(rows)`: used in tests only, against SQL.

**Repo:**
- `src/lib/repo/parties.ts`: parties CRUD, `loadAccountsSummary`, `loadPartyBalances` (keyset), `loadStatement`, `recordPayment`, `payParty`, `voidPayment`, `recordOpeningBalance`, `adjust`, `forgive`, `voidEntry`.
- `src/lib/repo/cash.ts`: cash accounts and statement, plus opening and transfer if Q10 allows them.
- Every money call carries `p_client_ref` and a device-born `p_id`.

**Screens:**
- **Accounts page.** Replaces the placeholder in src/pages/accounts/AccountsPage.tsx.
  - Header: «لنا عند الناس» and «علينا للناس» per division and for the project.
  - Filter: «الكل · المعمل · اللحم · البيض · المفقس (أفراخ / بيض تفقيس) · الأدوية · المخازن العامة».
  - Parties `DataTable`: name, phone (`bdi`), one column per book with the word «عليه» or «له» always present («—» for zero), and a display-only «المجموع» column. Rows come from `report_party_balances` by keyset. It sorts by largest balance or oldest open entry and searches with `searchable` and `phone_key`. Two footer rows, «لنا عند الناس» and «علينا للناس», need multi-footer support in `DataTable`; their numbers and the «N من المجموع» count come from `report_accounts_summary`, never from the loaded rows (§2.8). Row actions sit in the first column; the name column is sticky (FOUNDATION:113, 788; DECISIONS:21-22, 73).
- **Party statement** (`/accounts/parties/:id`): one `LedgerTable` per book with the six columns, captioned by the book (E50), a period filter with server brought-forward (E26), and a print stylesheet that shows every row (X-06).
- **«قبضنا» / «دفعنا» dialogs.**
  - The book comes first, with **nothing preselected** (FOUNDATION:788).
  - Then amount (a whole-dinar `MoneyInput`), cash box and date (`localDay`, back to 7 days).
  - An allocation preview names each settled entry and any remaining surplus.
  - A `ConfirmDialog` names the party, the book and the amount.
  - Submit stays disabled while any list it depends on has failed (FOUNDATION:807).
- **Parties management:** create, edit and archive, with the Q2 twin warning. Archived parties with a non-zero balance (left by a void, E43) are flagged «مؤرشف وعليه رصيد».
- **Opening balances grid** (manager): party rows × book columns, with a side toggle «عليه / له» instead of a signed number and one `client_ref` per cell.
- **Cash boxes:** a list with balances and a statement per box, with labels per Q12.
- **Home accounts card:** HomePage.tsx:159-167 and src/lib/repo/home.ts:27.

**UI blocks:** `MoneyInput` (Eastern digits normalised; whole-dinar mode), `SideToggle`, `PartyPicker`, `BookPicker`, `CashAccountPicker` (each throws on failure), `DataTable` multi-footer, `LedgerTable` with configurable side labels, print CSS.

**Postgres tests** (`ledger.test.mjs`, `book.test.mjs`, and extensions of the cost-leak, role-matrix and concurrency suites):
- **GOLD-07:**
  - Abu Ali's opening of +500,000 in the mill book on 2026-09-30, the mill's go-live, is accepted.
  - The same on 2026-10-01 gets `after_go_live`.
  - Thirty days back is accepted (exempt from the 7-day rule).
- **Phase-1 allocation analog (derived):** a 2,000,000 «قبضنا» in the mill book goes 500,000 to the opening, and the surplus stays as «له 1,500,000» in the mill book. The chicks book does not move.
- **Separation case**, in a separate org (FOUNDATION:705):
  - +1,000,000 in the mill book and −600,000 in the chicks book give mill «لنا» 1,000,000, hatchery «علينا» 600,000 and net «عليه 400,000». The project shows 1,000,000 / 600,000, not 400,000 / 0.
  - The same between the two hatchery books.
  - A wrong-book probe shows each book changing while the total stays the same (FOUNDATION:703).
- **book-check:** each function writes its kind with the documented sign, and the reversal the opposite. A second active opening is rejected and is accepted after `void_party_entry`. 0.5 dinar is rejected. A payment with no book gets `book_required`.
- **ref protocol (C2–C4):** the same ref from two sessions gives one entry and identical results; the same ref with another amount gives `ref_reused`; when the first rolls back, the second proceeds; a replay by another user gives `ref_reused`.
- **Numbering (C5):** two concurrent RC postings get consecutive numbers. RC and PY are independent sequences.
- **Concurrency:** two payments to the same party and book never over-allocate (C6); payments in two books each allocate inside their own book (C7); `void_party_payment` and `pay_party` at the same moment finish without 40P01 and leave a correct balance (C8) (FOUNDATION:818, 880).
- **cost-leak:** for storekeeper, viewer, mill_operator, hatchery_operator and hall_worker, `party_entries`, `party_allocations`, `cash_accounts` and `cash_moves` return 0 rows and `report_*` raises `forbidden`. `parties` returns 0 rows for hall, hatchery and mill operators and more than 0 for storekeeper and viewer (FOUNDATION:861).
- **write-lock:** no INSERT, UPDATE or DELETE privilege on the four ledger tables; `append_only` fires even as service_role.
- **Archive and voids (E43):** box B takes in 100,000 by «قبضنا» and pays out 100,000 by «دفعنا», so it is at zero. B is archived, then the «قبضنا» is voided: the void succeeds, B shows −100,000, and B is flagged. In the same way, a party with an opening of 100,000 settled by a payment is archived at zero, then the payment is voided: it succeeds, and the party is flagged «عليه 100,000». A new payment into the archived box is still rejected.
- **Scope on books (E49):** an accountant scoped to the mill sees and posts only in the mill book; `report_accounts_summary` labels the partial total; an unscoped accountant sees all books.
- **Role matrix:** the §2.12 rows for this package, per role.
- `verify_ledger` returns 0, and every BREAK probe flips only its own check (including the new checks 8, 10 and 11).
- **Property test v1** (fixed seed, printed): random openings, payments, payouts, adjustments, forgiveness and voids in reverse. After each step `verify_ledger` = 0 and the balance per (party, book) equals a TS model built from `src/domain`.

**Unit tests:**
- `runBooks` reproduces the FOUNDATION:702 sequences (mill 500,000 → 4,460,000 → 3,460,000 → 1,460,000; chicks 9,750,000 → 8,750,000).
- `allocationPlan` parity.
- `accounts-screens.test.mjs`: the side word is always present; two footer rows whose numbers come from the summary, not the rows (a fixture whose loaded page omits a party still shows the summary totals); the dialogs ask for the book first; submit is disabled on a failed list; print renders every row.

**Guards:** `classes.json` entries; reports-guard bounded reads; write-guard ref rule.

**Proves:** «قبضنا»/«دفعنا», allocation inside a book, the cash-box mechanics and the accounts-page mechanics. The D4 numbers are proven in WP6.

### WP4: `0007_stock_core_openings_transfers.sql` (stock ledger, openings, transfers, dashboard, item card)

**Rollback:** `rollback_0007.sql` (WP0 rule: it replaces `home_summary`).

**Tables:**
- **`stock_lots(item_id, warehouse_id, origin_lot_id?, fifo_seq bigint, received_on, expiry_on?, born_at?, qty_in, value_in, qty_left, value_left, source_kind ∈ {opening, receipt, transfer, count_gain}, source_id, source_line_id?, supplier_lot_no?)`.**
  - Checks: all four amounts ≥ 0; qty 3 dp and value 2 dp; `qty_left ≤ qty_in`; `qty_left = 0 ⇒ value_left = 0`; `qty_in > 0`.
  - `origin_lot_id` is a composite self-FK (E5).
  - Withdrawal index `(org_id, item_id, warehouse_id, expiry_on, fifo_seq, id) where qty_left > 0`.
  - `source_flock_id` arrives in Phase 4 (FOUNDATION:287-293).
- **`stock_moves(seq bigserial, doc_kind, doc_id, doc_line_id, item_id, warehouse_id, lot_id, qty, value, moved_on, posted_at, posted_by, reverses_move_id? unique)`.**
  - `doc_kind` enum (Phase 1): `opening, receipt, supplier_return, receipt_revalue, transfer, count, stock_use`.
  - `qty <> 0` except `receipt_revalue` (qty 0, value ≠ 0).
  - The lot's item and warehouse must equal the move's (trigger).
  - Indexes `(org_id, item_id, warehouse_id, seq)`, `(org_id, lot_id)` and `(org_id, doc_kind, doc_id)`. Append-only (FOUNDATION:294-296).
- **`stock_balances(item_id, warehouse_id, qty ≥ 0, value ≥ 0, qty = 0 ⇒ value = 0)`.** `unique (org_id, item_id, warehouse_id)` (FOUNDATION:297, DECISIONS:84).
- **`opening_docs(warehouse_id, on_date, status, version, client_ref, note, posted/void cols)` and `opening_lines(line_no, item_id, qty_base, value, expiry_on?, born_at?, warehouse_id copy)`.** `opening_lines` is cost-only as a whole (FOUNDATION:298-299).
- **`transfers(doc_no?, from_warehouse_id, to_warehouse_id, moved_on, …lifecycle) check (from <> to)` and `transfer_lines(line_no, item_id, item_unit_id?, unit_code?, unit_label, qty_in_unit, factor, qty_base, from/to copies)`.** Lines carry no values, so storekeepers can read them (FOUNDATION:300-301).

**Triggers:**
- Freeze `items.kind`/`base_unit` and `warehouses.division_id`/`kind` once any move exists. Invoker, guards `authenticated`, Arabic hint (FOUNDATION:272, 278, 438, 800).
- Item-kind admissibility on every move and lot insert, using the matrix at FOUNDATION:280-283: raw ← raw, additive, packaging, fuel; feed ← feed; medicine ← medicine, vaccine; general ← fuel, packaging, equipment, other; hatching_egg ← hatching_egg; chick ← chick; table_egg ← table_egg, packaging; farm ← feed, medicine, vaccine, fuel, packaging, equipment, other.
- Archive guards (E35).
- Draft header and line guards (§2.5).

**Private helpers:**
- `lock_balances(pairs)`.
- **`draw(item, wh, qty, doc_date, p_lot default null, p_allow_expired default false) returns table(lot_id, qty, value)`:**
  - eligibility: `qty_left > 0`, `received_on ≤ D`, and for `tracks_expiry` items `expiry_on is null or ≥ D`;
  - order: `expiry_on asc nulls last, fifo_seq, id`, locked `for update` in that order;
  - value: `value_left` exactly for a whole-lot draw, otherwise `_mul_div_round2(q, value_left, qty_left)`;
  - a shortfall raises `insufficient_stock` with a hint naming the item and the requested and available quantities at D, listing expired quantity separately («في المخزن 6 قنانٍ لكنها كلها منتهية») (FOUNDATION:474-476).
- `apply_move(...)` writes the move, updates the lot and the balance, and stamps the division.
- `new_lot(...)` takes a new `fifo_seq` (E4).
- `mirror_lot(src_lot, dest_wh, qty, value, date)`: same `fifo_seq`, `expiry_on` and `born_at`; `origin_lot_id = coalesce(src.origin_lot_id, src.id)`; `received_on` = transfer date (FOUNDATION:477).

**RPCs:**

| Function | Action | Behaviour and errors |
| --- | --- | --- |
| `post_opening_stock(p_id uuid, p_expected_version int, p_client_ref uuid)` | `opening.post` | One lot per line with exactly the manager's qty and value; `opening` move; no party entry; no number (E12). Errors: `no_go_live`, `after_go_live`, `period_locked`, `item_has_moves` (except fully reversed openings, E20), `value_required` (zero per Q9), `expiry_required`, `born_at_required`, `pieces_not_whole`, `item_kind_mismatch`, `egg_flock_required` (table_egg rejected until Phase 4, Q13), `stale_draft`, `ref_reused` (FOUNDATION:548) |
| `void_opening_stock(p_id, p_reason, p_client_ref)` | `void` | Reverses onto the same lots, dated today; `lot_consumed` names the dependent document |
| `preview_opening_stock(p_id uuid)` | `opening.post` | Lots to be created (money masked) |
| `post_transfer(p_id, p_expected_version, p_client_ref)` | `transfer.post` plus scope per Q4 | Each draw piece: − at source and a mirror + at destination with the same value; `TR-…`; no party entry («صادر داخلي» when divisions differ, FOUNDATION:92, 554). A transfer never draws an expired lot: expired stock leaves only by destruction, supplier return, or a manager-released sale or use (FOUNDATION:476; DECISIONS:83, 122). Errors: `same_warehouse`, `item_kind_mismatch` (destination), `insufficient_stock` (expired quantity named separately), `before_go_live` (both divisions), `stale_draft` |
| `void_transfer(p_id, p_reason, p_client_ref)` | `void` | Reverses every mirror and its source piece; `lot_consumed` if a mirror was drawn |
| `preview_transfer(p_id uuid)` | `transfer.post` | Draws per lot (qty for everyone, value inside `money`) |
| `discard_draft(p_doc_kind text, p_id uuid, p_expected_version int)` | the draft action of that kind | E13 |
| `delete_draft_line(p_doc_kind text, p_line_id uuid, p_expected_version int)` | the draft action of that kind | §2.5, E52: removes the line and every side row that references it, under the header lock; opening and transfer kinds here, the rest added by later packages (same signature, body replaced) |
| `stock_on_hand(p_warehouse uuid, p_after_item uuid, p_limit int)` | definer; `in_scope_wh` first line | Keyset per item: available, expired, near-expiry (E22), `min_qty` alert, and for chick items the oldest `born_at` with the 48-hour warning (E24). No value columns |
| `item_lots_qty(p_item uuid, p_warehouse uuid, p_after jsonb, p_limit int)` | same | Remaining lots by keyset in draw order: qty, age (E24: hours since `born_at` for chicks, days since the root `received_on` otherwise), expiry, source document number, `supplier_lot_no`. No values |
| `item_moves_qty(p_item uuid, p_warehouse uuid, p_after_seq bigint, p_limit int)` | same | Keyset moves with signed qty and running qty. No values |
| `stock_values(p_warehouse uuid, p_after_item uuid, p_limit int)` | invoker + explicit `can_see_cost()` check (`forbidden`) | Keyset per item: value of available and expired stock |
| `stock_value_totals(p_warehouse uuid)` | same | Σ qty per base unit and Σ value for the store (null = every store in the caller's scope), computed in SQL (§2.8) |
| `item_lots_value(p_item uuid, p_warehouse uuid, p_after jsonb, p_limit int)` | same | Keyset lots with `value_left` and the displayed unit cost (4 dp) |
| `home_summary()` (replaced) | | Adds per-division counts below minimum, near expiry, and chicks older than 48 hours |
| `verify_stock()` | service_role | see below |

No client reads `stock_balances`, `stock_lots` or `stock_moves` directly (§2.8).

**`verify_stock()` checks** (GT-01; FOUNDATION:429-430); each has a BREAK probe:
1. Per (item, warehouse): balance = Σ moves = Σ lot remainders, in qty and in value.
2. Per lot: `qty_left`/`value_left` = Σ signed moves, and `qty_in`/`value_in` = original move + `receipt_revalue` moves.
3. Lot shape.
4. Every reversal is equal and opposite on the same lot.
5. Every mirror equals its source draw and shares `fifo_seq` and `expiry_on`.
6. No draw from a lot with `received_on > moved_on`. No draw from a lot expired at `moved_on` except four kinds: a named lot released per Q5, a destruction, a supplier return, or an expired count shortage (E41).
7. Admissibility matrix.
8. **Phase-1 value conservation (FOUNDATION:430), with each term from its own document-side source.** Only posted documents count; a voided one is 0 on both sides.
   - Inputs:
     - openings = Σ `opening_lines.value`;
     - receipts = Σ `receipt_line_amounts.line_total` − Σ `receipt_amounts.discount` + Σ `receipt_charges.amount` (WP6);
     - count gains = Σ `stock_count_line_costs.gain_value` (WP5, E55);
     - revaluation lot shares = Σ `receipt_revaluations.lot_share` (WP7, E55).
   - Outputs:
     - Σ `stock_lots.value_left`;
     - supplier returns at lot value = Σ net `supplier_return` entries + Σ net «فرق مرتجع» expenses (WP7);
     - count shortages = Σ net «فرق جرد» expenses (WP5);
     - stock uses and destruction = Σ net `stock`-source expenses of `stock_use` documents (WP5).
   - Transfers have no term (check 5 covers them).
   - No term is a sum of `stock_moves`, so a valuation bug, where a lot or move value differs from its document, makes the two sides differ. Check 1 cannot catch that, because it compares moves with lots. Each package adds its terms with a BREAK probe that changes one document value.
9. (Moved to `verify_ledger` check 11, numbering, so RC and PY are covered from WP3.)

**Domain: `src/domain/fifo.ts`** (named in FOUNDATION:172, absent today):
- `eligibleLots(lots, docDate, tracksExpiry)`.
- `compareDrawOrder`: expiry ascending with nulls last, then `fifo_seq`, then `id` by uuid byte order.
- `planDraw(lots, qty, docDate, opts)` returns `{draws: [{lotId, qty, value}], shortage}`, including the whole-lot branch.
- `planTransfer`.
- Day strings only (CLAUDE.md lesson 2026-10-26 on TZ variants).

**Repo (`inventory.ts`):** `loadStockOnHand`, `loadItemLots`, `loadItemMoves` (keyset); for cost roles `loadStockValues`, `loadStockValueTotals`, `loadItemLotValues`; opening and transfer drafts (direct writes with `updatedRows`), `deleteDraftLine`, `preview*`, `post*`, `void*` and `discardDraft`.

**Device-local drafts** (FOUNDATION:142; X-05):
- New `src/lib/drafts/` (IndexedDB). A draft typed offline is stamped with (user, confirmed org) and shown only to its author.
- It is uploaded as a server draft only by an explicit action, after `my_workspace()` confirms the same org.
- Posting needs the network; the post button is disabled offline with the reason shown.

**Screens:**
- **Stock dashboard** (`/inventory`; per-division views at `/inventory/medicine`, `/inventory/general`, plus mill and hatchery stores from their division pages):
  - grouped by base unit (E23), quantities with `fmtQtyCell` and the unit in the header;
  - the value column and value total are **absent from the markup** for non-cost roles; for cost roles the values come from `stock_values` and the total from `stock_value_totals`, never summed in the browser (§2.8);
  - a «منتهي» column, minimum and near-expiry alerts, the 48-hour chick warning on chick stores (E24), and the time of the last fresh read;
  - `LoadFailed` on error; keyset paging with «N من المجموع» (FOUNDATION:780).
- **Item card** (`/inventory/items/:id?wh=`):
  - lots in draw order: age (hours from `born_at` for chicks, E24), expiry, source, `supplier_lot_no`, and for cost roles the remaining value and unit cost via `fmtUnitCost` from `item_lots_value` (C2 shows 480.8333);
  - moves by keyset with a running quantity; reversals shown and linked; pack units, density and minimum quantity.
- **Opening stock document** (manager): lines with `QtyInput` and a 2-dp value field, plus a `PostPreview` creation variant (lots to be created).
- **Transfer** (storekeeper):
  - the destination list is filtered by admissibility, and the screen says «صادر داخلي إلى …» naming the receiving division;
  - `PostPreview` draws, with a shortage keeping the draft and offering «سجّل الاستلام» / «جرد»;
  - moving the whole balance needs a confirmation that names the item and quantity, and a zero balance is announced with a sound (E31; the same shared block is used on the stock-use and supplier-return screens);
  - void through `ConfirmDialog` («ألغِ التحويل TR-2026-0003 — ستعود 1,000 لتر إلى المخزن العام»).

**UI blocks:** a `PostPreview` creation variant (PostPreview.tsx is draw-based today); the device draft shelf; a shared whole-balance confirmation and zero-balance sound (E31), used by every screen that draws stock.

**Postgres tests** (`stock.test.mjs`, `division.test.mjs`, `stock-concurrency.test.mjs`, `cost-leak.test.mjs`, `write-lock.test.mjs`, `property.test.mjs`):
- **Opening:**
  - `forbidden` for non-managers; date ≤ go-live; `no_go_live`; `item_has_moves`; `born_at_required` for chicks; table_egg rejected;
  - void after any draw gives `lot_consumed` naming the transfer;
  - re-post after a full void is accepted (E20);
  - storekeeper `select` on `opening_lines` returns 0 rows;
  - a priced opening line is removed by `delete_draft_line`; a direct DELETE has no privilege.
- **Chick age (E24):** an opening chick lot with `born_at` 50 hours before now shows age 50 h and the 48-hour warning in `stock_on_hand`. After a transfer the mirror keeps `born_at` and the same age.
- **T0 mechanism (D3):**
  - An opening lot of 1,000 L at 800,000.00 in the general store, transferred whole to the mill raw store, gives a mirror of 1,000 L and 800,000.00 with the same `fifo_seq` and expiry and `origin_lot_id` = the source. The source ends at 0/0.
  - Zero `party_entries` rows are written.
  - A partial 40 L transfer from the mirror draws 32,000.00 (FOUNDATION:622).
- **GOLD-06 (FOUNDATION:651-652), on an opening lot of 9,950 kg at 6,911,066.67:**
  - transfer 5,000 kg → 3,472,897.82; the source keeps 4,950 kg at 3,438,168.85;
  - transfer 3,000 kg from the mirror → 2,083,738.69; the mirror keeps 2,000 kg at 1,389,159.13;
  - void in reverse restores 9,950 kg at 6,911,066.67.
- **division-check:** feed into the medicine store rejected; fuel into the raw store accepted; chicks into the raw store rejected; same warehouse rejected; frozen kind after the first move.
- **Dates:**
  - A transfer dated D−1 cannot draw a lot received on D («بهذا التاريخ …»).
  - Back-dating: day −7 accepted, day −8 gives `date_too_old`.
  - Zone sweep: UTC, Etc/GMT+12, Pacific/Kiritimati, Asia/Baghdad (core.test pattern).
- **Expiry:** an expired lot is skipped and named in the rejection; a lot whose expiry equals D is still eligible; a transfer whose only stock is expired gets `insufficient_stock` naming the expired quantity.
- **FIFO parity:** SQL order and draw values against `fifo.ts`, over generated lot sets including equal `fifo_seq` (a mirror returning to its origin warehouse) and null or equal expiries.
- **Concurrency:**
  - C1 (D6): a lot of 100, two transfers of 60 at the same moment → one `ok`, the other `insufficient_stock`; the lot ends at 40.
  - C9: a line edited from a second session after the preview gives `stale_draft`.
  - C10: two first postings on the same (item, warehouse) create no duplicate balance row.
  - C13: transfers A→B of items X,Y and B→A of Y,X at the same moment do not deadlock.
  - C5: TR numbering stays consecutive.
  - C14 (D6, FOUNDATION:873, 886): `sameRefRace('transfer')` and `sameRefRace('opening')`: one posting and one TR number; the same ref with another `expected_version` gives `ref_reused`.
- **cost-leak:**
  - Non-cost roles: `stock_lots`, `stock_moves`, `stock_balances` and `opening_lines` return 0 rows.
  - `stock_on_hand`, `item_lots_qty` and `item_moves_qty` contain no `money` key for any role.
  - `stock_values`, `stock_value_totals` and `item_lots_value` raise `forbidden` for every non-cost role.
  - A storekeeper's preview, post and same-ref replay contain no `money` key.
  - Hints contain no value.
- **write-lock:** `draftWriteLock('opening')` and `draftWriteLock('transfer')` (FOUNDATION:526), each with its positive control; the freeze triggers.
- **Role matrix:** the §2.12 rows for this package, per role. The accountant gets `forbidden` on `post_transfer` and on transfer drafts; the manager succeeds on every one.
- **Archive and voids (E43):** after transferring a whole balance out of store G and archiving G, `void_transfer` succeeds and G is flagged «مؤرشف وعليه رصيد».
- `verify_stock` returns 0, with one BREAK probe per check. For check 8, the probe changes an `opening_lines.value` after posting (with the triggers disabled), and only check 8 flips.
- **Property test v2:** openings, transfers and voids, random, with `verify_stock` after every step.
- **Performance:** a transfer drawing across 500 lots finishes under the 8 s request limit (GT-30).

**Unit tests:**
- `fifo.test.mjs`: order, whole-lot branch, shortage with expired lots; run under `TZ=:UTC` and Asia/Baghdad.
- `inventory-screens.test.mjs`: no value cell or money string for a storekeeper; 480.8333 for a cost role; `LoadFailed` instead of an empty table.
- Device draft shelf: a draft from org A is hidden while the confirmed org is B (GT-29).
- `outbox.test` still refuses every `post_*`.

**Proves:** the D3 mechanism; D6 (transfer form and same ref); the `verify_stock` framework for D5, with a conservation check that can fail.

### WP5: `0008_expenses_uses_counts.sql` (expenses, issue to general expense, destruction, stock count)

**Rollback:** `rollback_0008.sql` (WP0 rule: it alters `ledger_books` and replaces `home_summary` and `delete_draft_line`).

**Tables:**
- **`ledger_books`:** add `unique (org_id, division_id, id)` (additive) so expenses can prove that a book belongs to the division.
- **`expenses(category_id, division_id, amount, on_date, for_month?, source ∈ {cash, credit, stock, adjustment}, account_id?, party_id?, book_id?, site_id?, doc_kind?, doc_id?, cash_move_id?, party_entry_id?, reverses_id? unique, note, posted_at, posted_by)`.** `for_month` (first day of a month) exists only if Q14 = A.
  - A CHECK per source:
    - `cash`: account required, no party, whole dinar;
    - `credit`: party and book required, whole dinar;
    - `stock`: no account or party, 2 dp, doc required;
    - `adjustment`: E10.
  - `(org_id, division_id, book_id)` composite FK to `ledger_books(org_id, division_id, id)`.
  - Append-only; restrictive `can_see_cost` (FOUNDATION:419-424, 443).
  - `flock_id` and `hatch_batch_id` columns are added in Phases 3 and 5 (Q13).
- **`stock_uses(doc_no?, warehouse_id, category_id, used_on, …lifecycle)` and `stock_use_lines(line_no, item_id, item_unit_id?, unit_code?, unit_label, qty_in_unit, factor, qty_base, lot_id?, warehouse_id copy)`** (FOUNDATION:305-306).
- **`stock_counts(doc_no?, warehouse_id, counted_on, status ∈ {draft, submitted, approved, void}, version, submitted_at?, submitted_by?, approved_by?, …)`** (FOUNDATION:302; lifecycle E53).
- **`stock_count_lines(line_no, item_id, counted_qty, counted_expired_qty?, system_qty?, system_expired_qty?, diff?, expired_diff?, gain_expiry_on?, gain_born_at?, reason?, warehouse_id copy)`** (FOUNDATION:303).
  - `counted_expired_qty` is only for `tracks_expiry` items (E41).
  - `gain_born_at` is required on a chick gain (E42).
  - `system_*` and the diffs are written only by `submit_count`/`refresh_count`.
  - `reason` is written by the manager in review (§2.5).
- **`stock_count_line_costs(line_id, gain_unit_cost?, gain_value?, shortage_value?)`** (FOUNDATION:304). Restrictive cost. The manager writes `gain_unit_cost` (4 dp, E48) while the count is submitted; `post_count` writes `gain_value` and `shortage_value` (both ≥ 0; a line with expired stock can have both, E41), the values of the line's adjustments (E55).
- `gain_flock_id` comes in Phase 4.

**RPCs:**

| Function | Action | Behaviour and errors |
| --- | --- | --- |
| `record_expense(p_id uuid, p_category uuid, p_division uuid, p_amount numeric, p_on_date date, p_source text, p_account uuid, p_party uuid, p_book uuid, p_site uuid, p_flock uuid, p_hatch_batch uuid, p_note text, p_client_ref uuid)` | `expense.post` | `cash`: expense plus a cash move (−). `credit`: expense plus a `bill −amount` entry in the division's main book. In the hatchery the user names `chicks` or `hatching_eggs`: `book_required` / `book_mismatch`. The bill is allocated by rule 27. `p_flock` and `p_hatch_batch` raise `flock_not_available` until Phases 3 and 5 (Q13), so the signature stays stable. The month a late bill belongs to follows Q14. If Q14 = A, the signature gains `p_for_month date` before `p_client_ref`; it is fixed before the function first ships, so there is no `_v2`. `on_date` keeps the 7-day rule. Other errors: `amount_not_positive`, `amount_not_whole_dinar`, `division_required`, `category_required`, `cash_account_required`, `party_required`, `party_archived`, date errors (FOUNDATION:557; DECISIONS:131-132) |
| `void_expense(p_id uuid, p_reason text, p_client_ref uuid)` | `void` | Reverses the expense, its cash move or bill entry (paired), dated today. `system_expense` for rows written by documents, which are voided through their document; `has_active_charges` from Phase 2 on (FOUNDATION:557, 485) |
| `post_stock_use(p_id, p_expected_version, p_client_ref)` / `void_stock_use(p_id, p_reason, p_client_ref)` / `preview_stock_use(p_id)` | `stock_use.post`; destruction `expired.destroy`; a named expired lot for ordinary use `expired.release` (Q5) | Draws (`stock_use` moves) plus one expense with source `stock` equal to Σ draw value, in the warehouse's division, numbered `SU-…`. Destruction uses system category `expired_destroy` and a named lot per line. Errors: `category_required`, `lot_not_expired` (destruction of a valid lot), `expired_needs_release`, `insufficient_stock`, `stale_draft` (FOUNDATION:556; DECISIONS:83, 122) |
| `submit_count(p_id, p_expected_version, p_client_ref)` | `count.enter` | Snapshots `system_qty` (available) and, for `tracks_expiry` items, `system_expired_qty` (E41), with both diffs; stamps `submitted_at/by`; draft → submitted (E25, E53). Errors: `not_draft`, `stale_draft`, `expiry_required` (gain without `gain_expiry_on`), `born_at_required` (chick gain without `gain_born_at`, E42) |
| `refresh_count(p_id, p_expected_version, p_client_ref)` | `count.approve` | Submitted only (`not_submitted`). Re-snapshots the system quantities and diffs, bumps `version`, and returns, per line, the old and new diff plus the documents posted on that item and store since `submitted_at` (quantities only). This is the committed form of «ينعاد حساب الفرق وينعرض» (FOUNDATION:555, E53) |
| `return_count(p_id, p_expected_version, p_reason, p_client_ref)` | `count.approve` | Submitted → draft for a recount; clears the snapshots, keeps the review rows; `reason_required`, `not_submitted` (E53) |
| `post_count(p_id, p_expected_version, p_client_ref)` / `void_count(p_id, p_reason, p_client_ref)` / `preview_count(p_id)` | `count.approve` / `void` | Submitted only. **Shortage:** a FEFO draw from available lots plus a «فرق جرد» expense (`stock`); an expired shortage draws only expired lots (E41). **Gain:** a new lot valued `_mul_div_round2(q, value_in, qty_in)` from the org's lot of the item with the largest `fifo_seq` among lots whose original move was never reversed (tie: the lot without `origin_lot_id` first, then id), whatever its source (FOUNDATION:479, E45). With no such lot, the manager's `gain_unit_cost` with a reason (E48). Chick gains carry `gain_born_at` (E42). Writes `gain_value`/`shortage_value` (E55). `CT-…`. Errors: `not_submitted`, `count_stale` (a balance changed since the snapshot; the hint names the items and quantities, and the screen then calls `refresh_count`), `gain_cost_required`, `expiry_required`, `born_at_required`, `reason_required`, `lot_consumed` on void (FOUNDATION:555) |
| `report_expenses(p_from date, p_to date, p_division uuid, p_after jsonb, p_limit int)` | invoker, `accounts.view` plus an explicit `can_see_cost()` check (`forbidden`) | Keyset expenses list; totals per category and source computed in SQL (§2.8) |

`delete_draft_line` gains the stock-use and count kinds (same signature, body replaced).

**`verify_stock`** gains its conservation terms for stock uses, destruction, count shortages and gains (check 8, document-side sources), plus three ties:
- every stock-use expense = Σ its moves' value;
- every count line's `shortage_value` = Σ its shortage moves' value, and per count, Σ `shortage_value` = its «فرق جرد» expense;
- every gain lot's `value_in` = its line's `gain_value`.

**`verify_ledger`** gains the expense rules: the CHECK per source, and every cash or credit expense has its cash move or bill entry (check 8). Its numbering check gains SU and CT.

**Domain:** `src/domain/count.ts` with `pickGainReferenceLot(lots)` (tie rule, reversed lots excluded, E45) and `gainValue(q, lot)`. Shortages reuse `planDraw`. Parity with `preview_count`.

**Repo:** `cash.ts` (`recordExpense`, `voidExpense`, `listExpenses`); `inventory.ts` (stock uses and counts).

**Screens:**
- **Expenses** (`/accounts/expenses`, accountant or manager):
  - fields: division, category, date, whole-dinar amount, the month it belongs to (if Q14 = A), and the source (cash with a box, or credit with party and book);
  - the list and its totals come from `report_expenses` (§2.8);
  - for the hatchery, an explicit book choice between «دفتر الأفراخ» and «دفتر بيض التفقيس»;
  - no flock field until Phase 3;
  - void through `ConfirmDialog` (manager).
- **Stock use / destruction** (`/inventory/uses`):
  - category required; destruction names the lot;
  - a named expired lot posts only for a manager (the Q5 «بانتظار موافقة المدير» list);
  - the whole-balance confirmation and zero-balance sound (E31, FOUNDATION:814 «صرف»);
  - the expense value is hidden from the storekeeper.
- **Mobile count** (`/inventory/counts/:id`):
  - blind entry (E25), one hand, 44 px or larger targets, `QtyInput` with packs;
  - for expiry-tracked items, two fields, «صالح» and «منتهي» (E41); for chick items, the gain's hatch time (E42);
  - keyboard-wedge barcode via `normalizeCode` (E54);
  - the save keeps the draft when the network drops.
- **Manager count review** (submitted counts):
  - a `DataTable` of system, counted and difference (available and expired);
  - the gain unit cost (4 dp, E48) and a reason on each adjustment;
  - «أعد الحساب» (`refresh_count`) shows old and new diffs side by side, with the documents posted since the submission;
  - «أعِد للعدّ» (`return_count`) and «أغلِق دون ترحيل» (`discard_draft`), each through a `ConfirmDialog`;
  - approve = post.

**Postgres tests** (`expenses.test.mjs`, `counts.test.mjs`, plus book, cost-leak and concurrency):
- **book-check:**
  - a hatchery credit expense without a book gets `book_required`; with the mill book, `book_mismatch`;
  - a broiler credit expense writes `bill −amount` in the broiler main book («له»);
  - a cash expense moves the box by exactly the amount, and its void restores it;
  - voiding a «فرق جرد» row directly gets `system_expense`.
- **Seeding.** Receipts do not exist until WP6, so every lot these tests use is seeded through `post_opening_stock` with the same quantity and value as the worked-example lot it stands for: kerosene 500 L at 375,000.00 (KZ1), corn 4,000 kg at 1,800,000.00 (C1), and corn 5,000 kg at 2,404,166.67 (C2) as the later opening line, so it has the larger `fifo_seq`. The numbers are therefore "derived", not golden.
- **Stock use (derived):** 10 L from the seeded kerosene lot gives an expense of 7,500.00 with source `stock`. A storekeeper's destruction is rejected and a manager's passes. An expired lot without release is rejected. Consuming the whole balance is accepted by the server; the confirmation is a screen test.
- **Count (derived):**
  - a 100 kg shortage from the seeded 4,000 kg corn lot → «فرق جرد» 45,000.00;
  - a 10 kg gain valued from the seeded 5,000 kg lot at 2,404,166.67 (largest `fifo_seq`) → 4,808.33;
  - with a later lot whose opening was voided (largest `fifo_seq`, fully reversed), the gain is still valued from the 2,404,166.67 lot (E45);
  - a gain whose reference lot is a transfer mirror uses that mirror's `value_in`/`qty_in`;
  - a gain with no lot and no cost gets `gain_cost_required`; with a 4-dp unit cost and a reason it posts `_mul_div_round2(q, cost, 1)` (E48);
  - a chick gain without `gain_born_at` gets `born_at_required`; with it, the lot carries it (E42);
  - expired stock (E41): a vaccine with 6 expired and 10 valid on the shelf, counted 10 «صالح» and 6 «منتهي», gives no adjustment; counted 10 and 4, it gives a 2-unit expired shortage drawn from the expired lot only, and the valid lots are untouched;
  - review flow (E53): after `submit_count`, the storekeeper cannot edit any line (`not_draft`); the manager writes a reason and a gain cost; a transfer posted after the submission makes `post_count` raise `count_stale` (C11); `refresh_count` then commits the new diffs and returns the TR number; `post_count` succeeds; `return_count` sends another count back to draft for a recount; `discard_draft` closes a submitted count with no moves;
  - post then void restores everything to the fils;
  - storekeeper `select` on `stock_count_line_costs` returns 0 rows; a priced count line is removed by `delete_draft_line`.
- **D6, consumption form:** the seeded 4,000 kg corn lot and two simultaneous issues of 3,000 kg (stock use against transfer) → exactly one posts; the lot is left at 1,000 kg and 450,000.00.
- **Same ref:** `sameRefRace('stock_use')` and `sameRefRace('count')` (FOUNDATION:873, 886).
- **write-lock:** `draftWriteLock('stock_use')` and `draftWriteLock('count')`, the latter also for a submitted count edited by the storekeeper.
- **Role matrix:** the §2.12 rows for this package; the accountant gets `forbidden` on `post_stock_use`, `submit_count` and their drafts; the manager succeeds.
- **Expenses and archive (E43):** a cash expense from a box later archived at zero balance is voided successfully.
- **Late bill (Q14):** the chosen option's rule, for example under A an October bill recorded on 10 November with `for_month` October is accepted while October is unlocked, and is rejected once it is locked.
- **cost-leak:** `expenses` returns 0 rows for non-cost roles; `report_expenses` raises `forbidden`.
- `verify_stock` and `verify_ledger` return 0, with a BREAK probe for each new term and tie.
- **Property test v3:** adds stock uses, counts and expenses.

**Unit tests:** `count.test` (tie rule, reversed lots excluded, gain value); screen renders (no expense value for the storekeeper; hatchery book choice not preselected; the whole-balance confirmation on the stock-use screen names the item and quantity; the count entry screen shows no system quantity).

**Proves:** D6 (consumption form and same ref); the expense ledger; the stock-use and count parts of D5.

### WP6: `0009_receipts.sql` (receipts, charges, book routing, golden)

**Rollback:** `rollback_0009.sql` (WP0 rule: it replaces `delete_draft_line`).

**Tables:**
- **`receipts(doc_no?, party_id, warehouse_id, book_id, received_on, …lifecycle, note)`.** `book_id` is set by trigger from the warehouse kind (rule 36) and re-checked at posting: raw/feed → mill main; medicine → medicine main; general → general main; hatching_egg → `hatching_eggs`; chick → `chicks`. Farm and table_egg stores cannot receive (FOUNDATION:328-329, 507).
- **`receipt_amounts(receipt_id unique, discount, paid_now, cash_account_id?)`.** Restrictive cost. Precision per Q7 (recommended: whole dinar).
- **`receipt_lines(line_no, item_id, item_unit_id?, unit_code?, unit_label, qty_in_unit, factor, qty_base, expiry_on?, born_at? (chick items, E21), supplier_lot_no?, density_kg_per_l?, piece_mass_kg?, warehouse_id copy)`.**
  - A trigger checks the receiving store (FOUNDATION:284-286): raw, additive → raw; feed → feed; medicine, vaccine → medicine; hatching_egg; chick; fuel, equipment, other → general; packaging → raw or general.
  - The line trigger snapshots the item's density and piece mass when the line is written (E46). Editing the item later does not change the line; re-saving the line refreshes the snapshot and bumps `version`.
- **`receipt_line_amounts(line_id unique, line_total, discount_share?, charge_share?)`.** Restrictive cost. Cost roles write only `line_total`; `charge_share` is the line's total over all charges.
- **`receipt_charges(receipt_id, label, amount, allocate_by ∈ {mass, value}, payee_party_id?, cash_account_id?)`** with `num_nonnulls(payee_party_id, cash_account_id) = 1` (E17). Restrictive cost. Whole dinar, because it enters a party book or a box (FOUNDATION:466).
- **`receipt_charge_lines(charge_id, line_id)`**: the line selection (no rows = all lines; FOUNDATION:473 «أو اختر السطور»), replaced only through `set_charge_lines` (§2.5). Restrictive cost.
- **`receipt_charge_shares(charge_id, line_id, share)`**: function-only, restrictive cost. The posting function writes one row per charge and line it allocated to (E55), so `verify_stock` can prove that each charge's shares sum to its amount.

**RPCs:**

| Function | Action | Behaviour |
| --- | --- | --- |
| `post_receipt(p_id uuid, p_expected_version int, p_client_ref uuid)` | `receipt.amounts` plus `in_scope_wh` | See steps below |
| `void_receipt(p_id uuid, p_reason text, p_client_ref uuid)` | `void` | Reversing moves on the same lots (each ends 0/0); a reversing `purchase` for the supplier and each carrier, paired after unwinding allocations, with freed entries re-flowing. `paid_now` stays a `payout`, so the supplier becomes «عليه». A charge paid from a box with no party becomes an «استلام ملغى» `adjustment` expense linked to the original cash move (E10). A wrong `paid_now` on a correct receipt is corrected with `void_party_payment` on its payout instead (E44). Errors in this package: `lot_consumed` (names TR/SU/CT), `reason_required`, `not_posted` (FOUNDATION:551). `has_revaluation` and `has_supplier_returns` are added in WP7, when their tables exist (same signature, body replaced) |
| `preview_receipt(p_id uuid)` | `receipt.draft` or `receipt.amounts` | The same computation; quantities for the storekeeper and money for cost roles |
| `delete_receipt_charge(p_charge_id uuid, p_expected_version int)` / `set_charge_lines(p_charge_id uuid, p_line_ids uuid[], p_expected_version int)` | `receipt.amounts` | §2.5, E52; `delete_draft_line` gains the receipt kind (its amount row, its charge-line rows) |

**`post_receipt` steps:**
1. Party locks (supplier plus payees, ascending), then the receipt row, then the balances, then the counter.
2. Dates: `check_post_date(received_on, wh division)`.
3. Validation:
   - the receipt has lines; `qty_base > 0`; pieces are whole; `expiry_required`; `born_at_required`;
   - item admissible in the warehouse and receivable there (`wrong_receiving_store`);
   - `discount ≤ Σ line_total`; each charge has a payee or a box;
   - `paid_now ≤ net`, and `paid_now > 0` requires a box;
   - archived party rejected (Q2);
   - a line already expired on `received_on` follows Q5 (recommended: `expired_on_receipt` unless a manager posts it).
4. `discount_share` = `alloc_lr(discount, line_totals, 2)`, in fils (FOUNDATION:473, 493).
5. Charge shares, per charge: `alloc_lr(amount, weights over its selected lines, 2)`.
   - Mass weights use the line's snapshots (E46): kg as is; L via `liters_to_kg(L, line.density_kg_per_l)`; pc via `round3(pc × line.piece_mass_kg)`.
   - A line with unknown mass gives `no_mass` with the hint «قنينة الغاز ليس لها وزن — وزّع بالقيمة أو اختر السطور». A zero weight sum gives `zero_weights`.
   - Value weight per Q8.
   - One `receipt_charge_shares` row per charge and line (E55).
6. Lot `value_in` = `line_total − discount_share + Σ charge_share`; `qty_in` = `qty_base`; `received_on`; a new `fifo_seq`; `source_line_id` = the line (FOUNDATION:472).
7. `receipt` moves and balances.
8. Supplier `purchase −(Σ line_total − discount)` in the derived book (E19 when net = 0), with `PU-YYYY-NNNN`. Its allocation runs after step 10, so that `paid_now` is matched to it first («المدفوع عند الفاتورة يروح لفاتورته هي», FOUNDATION:495). Then `allocate_new` matches its remainder against any opposite open balance the supplier already has in that book, oldest first.
9. Each charge: either `purchase −amount` on the payee in the same book, allocated by `allocate_new`, or a box move (`receipt_charge`).
10. `paid_now`: `payout +paid_now` plus a box move, allocated to this receipt's purchase first (FOUNDATION:550).
11. Status `posted`; write `discount_share`, `charge_share`, the charge shares, `book_id`, `doc_no` and `posted_*`; return the full document (masked).

**`verify_stock` document ties** (new in this package; each with a BREAK probe that changes one stored value):
10. Per posted receipt, Σ `discount_share` = `discount`.
11. Per charge, Σ `receipt_charge_shares.share` = `amount`; per line, Σ of its charge shares = `charge_share`.
12. Per receipt line, the lot's original `value_in` = `line_total − discount_share + charge_share` (before any revaluation move).
13. Per posted receipt: the supplier's live `purchase` entry = −(Σ `line_total` − `discount`), or none when net = 0 (E19); each payee charge has a live `purchase` entry of −amount in the same book, and each box charge has its cash move (`verify_ledger` check 8); `paid_now > 0` has its payout, unless it was voided under E44.

The conservation check (WP4 check 8) gains the receipts term, and `verify_ledger` numbering gains PU.

**Domain:** `src/domain/receipt.ts` with `massOf(line)` (from the line's snapshots, E46) and `receiptValuation(lines, discount, charges)`. It returns the discount shares, per-charge shares, lot values and supplier net using `allocateLargestRemainder`, `litersToKg` and `roundHalfAway`. Parity with `preview_receipt` and `post_receipt` (DV-805), including a discount chosen so that fils shares and the dinar entry differ.

**Repo:** `src/lib/repo/purchasing.ts`:
- storekeeper draft writes (header and lines);
- cost-role writes (amounts, line totals, charges), `setChargeLines`, `deleteReceiptCharge`, `deleteDraftLine`;
- `previewReceipt`, `postReceipt`, `voidReceipt`, `listReceipts` (keyset, status filter).

**Screens** (`/inventory/receipts`, `/inventory/receipts/:id`):
- **Draft** (storekeeper): supplier (picker; creation per Q1), warehouse in scope, date and note. The book is shown read-only as derived. Lines: an item picker filtered by receivable kinds (keyboard-wedge codes, E54), `QtyInput` with a live conversion in Fusha with correct counted-noun forms from `t()` («47 كيساً = 2,350 كغم»; DECISIONS:15-16; FOUNDATION:768 shows the Iraqi form), expiry, `born_at` for chicks, supplier lot. No money field is ever in the markup. The dialog is dirty-guarded.
- **Drafts list** for accountant and manager: «بانتظار المبالغ».
- **Amounts** (cost roles): line totals as written on the invoice, discount, charges (label, amount, «بالوزن» / «بالقيمة», carrier or box, line selection through `set_charge_lines`, the by-value weight per Q8), and `paid_now` with a box. A live split comes from `receiptValuation`.
- **Preview and post:** a `PostPreview` creation variant listing lots to be created, supplier and carrier entries with their book, and cash moves. Approval per line id.
- **Void:** `ConfirmDialog` «ألغِ الاستلام PU-2026-0042 — ستُعاد 7 مواد من المخزن، ويبقى المدفوع للمورّد دفعةً عليه».

**Postgres tests** (`golden.test.mjs` per Appendix B; `receipts.test.mjs`; book, division, cost-leak and concurrency suites):
- **Golden (D1–D4)**, through real `post_receipt` calls by real members, with the two scoped storekeepers drafting (each in his own stores, Appendix B) and the accountant pricing and posting:
  - all 13 lots to the fils, Σ 14,790,000.00, transport shares 54,166.67 and 10,833.33;
  - HE1 9,000,000.00 in the `hatching_eggs` book and V1 600,000.00 (expiry 2027-06-30) in the medicine book, both cash;
  - every cash supplier at 0;
  - grain supplier −3,250,000 and carrier −65,000 in the mill book, through `report_party_balances`, `report_party_statement` (last line) and `report_accounts_summary` (mill «علينا» 3,315,000, «لنا» 500,000);
  - **D4 on the page.** The JSON those report calls returned is passed through the real repo parsers (`loadPartyBalances`, `loadAccountsSummary`, `loadStatement`, bundled from `src/` by esbuild as the `scripts/tests` screen tests do). It is then rendered with the real accounts-page table and statement components through `renderToStaticMarkup` and the real dictionaries. The markup must show:
    - «له 3,250,000» in the mill-book cell of «مورّد الحبوب» and «له 65,000» in the mill-book cell of «الناقل»;
    - «عليه 500,000» for «أبو علي»;
    - footer rows «علينا للناس» 3,315,000 and «لنا عند الناس» 500,000 in the mill column and the project total;
    - the statement's last line in the mill book, «له 3,250,000».

    A negative control that feeds the page a summary with one altered number must fail. Nothing here needs a live backend, so D4 does not wait for A2;
  - T0 on the real DS1 gives a mirror of 800,000.00 (D3);
  - three witnesses per value: FOUNDATION literal, TS `src/domain` via `loadSrc`, and SQL;
  - the test asserts the number of values compared;
  - a negative control alters one literal and must fail (FOUNDATION:836).
- **book-check:** one receipt into each receivable warehouse kind lands in the rule-36 book.
- **division-check:** kerosene received into the mill raw store from a supplier is rejected (FOUNDATION:864); equipment into the raw store is rejected.
- **Charges:** a mass charge over gas bottles with no piece mass gives `no_mass`; a negative control by value gives 47,000.00 / 18,000.00; a charge with neither or both payee and box is rejected; two charges (one by mass, one by value) sum exactly; a charge limited by `set_charge_lines` to the feed lines splits over those lines only.
- **Snapshots (E46):** after the preview, an edit of the oil item's density changes nothing at posting (the line keeps 0.92) and does not raise `stale_draft`; re-saving the line refreshes the snapshot and does raise it.
- **Amounts:** `paid_now > net` gets `paid_exceeds_total`; a fractional dinar is rejected per Q7.
- **Allocation (rule 27):** a supplier with an open «عليه 200,000» payout advance in the mill book receives a credit receipt of 3,250,000 with `paid_now` 1,000,000. The paid amount matches the receipt first, the advance then matches the remainder, and the supplier ends «له 2,050,000» with no + and − remainders open together (`verify_ledger` check 10).
- **Wrong `paid_now` (E44):** a receipt posted with `paid_now` 1,000,000 instead of 100,000 is corrected by `void_party_payment` on its payout and a new `pay_party` of 100,000. The receipt stays posted, and the box and the supplier book end as if the right amount had been paid.
- **cost-leak:** for the storekeeper, `receipt_amounts.paid_now`, `receipt_line_amounts`, `receipt_charges` and `receipt_charge_shares` return 0 rows, and `preview_receipt`, a draft-time read and a ref replay contain no `money` key.
- **Drafts:** an amount edited after the preview gives `stale_draft`; `draftWriteLock('receipt')` covers the header, a line and an amount row of a posted receipt; a storekeeper deletes a priced line through `delete_draft_line` (its amount and charge-line rows go with it); the accountant removes a charge through `delete_receipt_charge`.
- **Void:**
  - post then void restores stock, books and box to the fils;
  - with `paid_now`, the supplier is «عليه paid_now» afterwards;
  - a cash charge gives exactly one «استلام ملغى» row of the charge amount;
  - a void after T0 gets `lot_consumed` naming the TR;
  - a void after the supplier was archived at zero balance succeeds (E43).
- **Concurrency:** `void_receipt` and `pay_party` for the same supplier at the same moment (C8); two receipts creating the first balance row of the same pair (C10); `sameRefRace('receipt')` (D6 same-ref form).
- **Role matrix:** the §2.12 rows for this package; the accountant gets `forbidden` on receipt drafts, the storekeeper on amounts and `post_receipt`, and the manager succeeds on both.
- `verify_stock` checks 10–13 return 0, each with its BREAK probe.
- **Zone sweep** for `post_receipt` (GT-18).
- **Live identity:** a banned or deleted account's valid token cannot post or pay (accounts.test pattern; DECISIONS:53).
- **Performance:** a 200-line receipt finishes under 8 s.
- **Property test v4:** adds receipts with random discounts, charges by mass or value, liquids, pieces and expiry items.

**Unit tests:** `receipt.test.mjs` (C2/S2 shares; the gas no-mass case; discount allocation); screen renders (storekeeper markup has no money; the book is read-only; confirmation text contains the PU number and item count; the live conversion reads «47 كيساً = 2,350 كغم», «كيس واحد», «كيسان», «3 أكياس»).

**Proves:** D1, D2, D3 (real chain), D4 (reports and the rendered page), and the same-ref form of D6.

### WP7: `0010_supplier_returns_revaluations.sql`

**Rollback:** `rollback_0010.sql` (WP0 rule: it replaces `void_receipt` and `delete_draft_line`).

**Tables:**
- **`supplier_returns(doc_no?, party_id, receipt_id, warehouse_id, returned_on, …lifecycle)`.** A trigger copies `party_id` and `warehouse_id` from the receipt.
- **`supplier_return_lines(line_no, receipt_line_id, qty_base, warehouse_id copy)`.**
- **`supplier_return_line_amounts(line_id unique, credit_amount ≥ 0, whole dinar)`.** Restrictive cost (FOUNDATION:335-337).
- **`receipt_revaluations(receipt_line_id, new_total, old_total, diff, lot_share, expense_amount, reason, status, client_ref, posted/void cols)`.** Function-only; restrictive cost. `old_total`, `diff`, `lot_share` and `expense_amount` are the posting's snapshots (E55). Added to `classes.json` `functionOnly` (it is missing from write-guard.mjs:13-21) (FOUNDATION:334).

**RPCs:**

| Function | Action (E47) | Behaviour and errors |
| --- | --- | --- |
| `post_supplier_return(p_id, p_expected_version, p_client_ref)` | `receipt.amounts`; draft (quantities) by `receipt.draft` | Draws only from the receipt line's own lots in the receipt's warehouse (E15), by the draw-value rule (expired lots allowed; FOUNDATION:476). A `supplier_return +Σ credit` entry in the receipt's book, allocated to the receipt's purchase entry first. «فرق مرتجع» = draw value − credit as an `adjustment` expense (signed). `RT-…`. Errors: `receipt_not_posted`, `insufficient_stock` naming the documents that consumed the lots, `credit_not_whole_dinar`, `stale_draft` (FOUNDATION:553) |
| `void_supplier_return(p_id, p_reason, p_client_ref)` | `void` | Goods back to the same lots; the entry reversed and paired; the expense reversed. Rejected when a returned lot was drawn after the return (FOUNDATION:553 literal) |
| `preview_supplier_return(p_id)` | as post | Per-lot draw value against credit and the difference (money masked) |
| `post_receipt_revalue(p_line uuid, p_new_total numeric, p_reason text, p_client_ref uuid)` | `receipt.revalue` | See below |
| `void_receipt_revalue(p_id uuid, p_reason text, p_client_ref uuid)` | `void` | Reverses the valuation moves, the expense and the entry. `lot_consumed` when any lot of the family was drawn after the correction; `newer_revaluation` |
| `preview_receipt_revalue(p_line uuid, p_new_total numeric)` | `receipt.revalue` | The split |
| `void_receipt` (body replaced, same signature) | `void` | Now also raises `has_revaluation` and `has_supplier_returns`, naming the dependent documents (FOUNDATION:551) |

**`post_receipt_revalue`** (FOUNDATION:141, 552; DECISIONS:98):
- `current` = the latest non-void `new_total`, else `line_total`; `diff = new_total − current`. The header discount is not re-split (E51): `diff` is the gross change of the line and also the change of the supplier's net, and no other line moves.
- The family = the line's lot plus all mirrors with `origin_lot_id` = that lot (E5), with `qty_left > 0`.
- `remaining_share = _mul_div_round2(Σ qty_left(family), diff, qty_in)`, split with `alloc_lr` weighted by `qty_left`. Each lot gets a `receipt_revalue` move with qty 0 and value ±share, updating `value_in` and `value_left`.
- The rest (`diff − remaining_share`) becomes a «فرق سعر شراء» `adjustment` expense in the receipt's division; it is negative when the price falls.
- Supplier `adjustment`: −|diff| when the price is higher, +|diff| when lower, allocated to its own receipt's entry first (E16).
- Errors: `receipt_not_posted`, `not_drawn` (void and re-post instead), `same_total`, `negative_total`, `negative_value`, `reason_required`.
- Writes the snapshots `old_total`, `diff`, `lot_share` (= `remaining_share`) and `expense_amount` on the revaluation row (E55).

`delete_draft_line` gains the supplier-return kind (with its amount row).

**`verify_stock` document ties** (new in this package; each with a BREAK probe):
14. Per posted supplier return: the live `supplier_return` entry + the live «فرق مرتجع» expense = Σ value of its draw moves, and the entry = Σ `credit_amount` of its lines.
15. Per posted revaluation: Σ its `receipt_revalue` move values = `lot_share`; `lot_share` + `expense_amount` = `diff`; and its supplier `adjustment` entry = −`diff`.

The conservation check (WP4 check 8) gains the supplier-return and revaluation terms, and `verify_ledger` numbering gains RT.

**Domain:** `src/domain/revalue.ts` with `revaluationSplit(family, qtyIn, diff)`. Parity with preview and post.

**Repo:** `purchasing.ts` (returns and revaluations).

**Screens:**
- **Supplier return:** opened from a posted receipt. The storekeeper drafts lines by picking receipt lines with remaining qty (E47); the cost role enters the accepted credit and posts. Returning the whole remaining balance of a line asks for the whole-balance confirmation, and a zero balance plays the sound (E31). The preview shows the lot value, the credit and «فرق مرتجع». Void through `ConfirmDialog`.
- **Price correction** (manager only, hidden for every other role): new total plus a required reason. The preview shows the lot and mirror shares, the expense and the supplier entry. `ConfirmDialog` names the receipt number and the line.

**Postgres tests** (`returns.test.mjs`):
- **Supplier return (derived):** 1,000 kg from an untouched C2 is valued 480,833.33. With 470,000 accepted, the entry is +470,000, the grain supplier is «له 2,780,000» and «فرق مرتجع» = 10,833.33. Returning more than remains is rejected and names the consuming document. `void_receipt` is rejected while the return is posted. Post then void restores everything to the fils.
- **Revaluation (derived):**
  - C2 after drawing 2,120 kg (1,019,366.67, FOUNDATION:643) leaves 2,880 kg at 1,384,800.00;
  - a new total of 2,400,000 (diff +50,000) gives a lot share of 28,800.00, a «فرق سعر شراء» of 21,200.00 and a supplier adjustment of −50,000;
  - C2 ends at `value_left` 1,413,600.00 and `value_in` 2,432,966.67;
  - with 1,000 of the 2,880 kg in a mirror, the shares are 18,800.00 / 10,000.00;
  - a negative diff takes the price-fall path;
  - a revaluation before any draw gets `not_drawn`; the same total gets `same_total`; a share that would make `value_left` negative is rejected;
  - a void after a later draw is rejected;
  - post then void restores the lots, the expense and the supplier book to the fils;
  - on a receipt with a header discount, a correction moves only the corrected line's family; the other lines' lots and every `discount_share` are unchanged, and the supplier adjustment is exactly −diff (E51).
- **Concurrency (C12):** a revaluation racing a draw on the same lot never leaves `value_left` negative. `sameRefRace('supplier_return')`, and the same ref for `post_receipt_revalue` from two sessions gives one correction.
- **write-lock:** `draftWriteLock('supplier_return')`, including its amount row.
- **Role matrix:** the §2.12 rows for this package. The storekeeper drafts a return but gets `forbidden` on its amounts and on `post_supplier_return`; the accountant posts it and gets `forbidden` on `post_receipt_revalue`; the manager succeeds on all.
- `verify_stock` checks 14–15 return 0, each with its BREAK probe.
- **Property test v5:** all Phase-1 operations; voids in reverse restore every balance to the fils (FOUNDATION:594).

**Unit tests:** `revalue.test`; screen renders (the correction action is absent for non-managers).

**Proves:** completes the Phase-1 scope; the full property run feeds D5.

### WP8: Phase gate and release (no migration)

**Evidence** (FOUNDATION:894, 897):
1. `golden.test` green for D1–D4, including the rendered accounts page.
2. The full property suite, seeds printed and the case count measured (E29), ends with every `verify_*` = 0 (D5).
3. Concurrency suite C1–C14 green, including every `sameRefRace` (D6).
4. Role-matrix coverage: every (function, role) pair of §2.12 called (WP0 registry).
5. Rollback runner: every declared rollback file ran (at least `rollback_0005.sql`).
6. Lint and build green; precache and bundle budgets measured. A raise needs the owner's written approval (DECISIONS:182-188).
7. Scope closure (§1.1): every deliverable built, or moved by the owner's written word (Q13).

**Playwright** (FOUNDATION:837, 890; GT-31):
- One journey: storekeeper receipt draft → accountant amounts and post → transfer → accounts page → party statement → «قبضنا» in a named book.
- It also covers the pending double-click zoom regression (CLAUDE.md lesson 2026-10-24).
- New devDependency `@playwright/test`, justified in the commit and in the DECISIONS dependency table.
- It needs the demo/e2e Supabase project from decision 20 (owner action A2). Production is read-only (FOUNDATION:59). The done criteria do not depend on it (D4 is proven by the WP6 render test).

**Adversarial audit** (FOUNDATION:915): angles money, loss, identity and isolation, concurrency, UI. Each finding gets a second reviewer who tries to refute it, and each fix comes with a test that fails on the old code. Lessons go into CLAUDE.md (FOUNDATION:921).

**Release, per package and on the owner's word each time** (FOUNDATION:58, 77, 919; DECISIONS:68-69). The database goes first, because `main` builds production:
1. Apply the package's migration (0004…0010, in order) to production. The Supabase tool holds `drop`/`delete from` statements (FOUNDATION:920); none is expected outside the rollback files, which are never applied to production unless the owner asks.
2. After the migration:
   - `node supabase/tests/run.mjs --digest` equals the production DIGEST_SQL, 9 of 9;
   - `--elements=functions` gives a `md5(prosrc)` comparison on mismatch;
   - every `public.verify_%` function, read-only, returns 0;
   - advisors baseline updated: 0029 = allowlist minus `app_today`; 0008 unchanged, because `units` has a policy (DECISIONS:49).
3. Then, with A2 in place, check the package's flows on the preview build pointed at the demo project (DECISIONS:68). Without A2 this step cannot run, and the owner decides whether to merge on harness evidence alone.
4. Then merge to `main`; "deployed" only when Vercel shows Ready on the same commit (FOUNDATION:821).

**Phase gate before Phase 2** (FOUNDATION:894, 904): Phase 2 does not start until both of these hold:
- the owner has approved a real working day on the Phase-1 screens;
- the owner has supplied a real working day from every unit (receipt, issue, mix, flock day, hatch, sale, payment) with its numbers (owner action A5). Its Phase-1 parts (receipts, transfers, stock uses, counts, payments) are encoded as `golden2.test.mjs` and green, and its other parts are kept as pending fixtures for their phases («قِس قبل ما تبني الباقي»).

Only a written word from the owner waives either step.

---

## 4. Owner questions

Questions were merged across the six studies. Only those that FOUNDATION and DECISIONS leave open, and that change what is built, are kept. Everything else is an engineering decision in §2.11. Each option states its cost, and the recommendation comes first. Q3, Q6 and Q11 were answered by FOUNDATION or DECISIONS and became E47, E48 and E49. Q2 is a request to deviate from FOUNDATION. Q5, Q7, Q8 and Q12 were narrowed to the part that is really open. Q14 is new.

### 4.0 Which package each question blocks (FOUNDATION:21: answered before building)

| Question | Blocks | Why there |
| --- | --- | --- |
| Q1 master-data permissions and go-live setter | WP2 | the policies and actions of every master table are created there |
| Q2 twins, merge, archive | WP2 (items), WP3 (parties) | twin checks and archive rules are built with those tables |
| Q10 cash openings, transfers, negative balance | WP3 | `cash_moves` kinds and the box functions |
| Q12 cash-box statement labels | WP3 | the cash-box statement screen |
| Q4 transfer scope | WP4 | `post_transfer` scope check |
| Q5 expired receipts and the release mechanism | WP4 (release in stock documents); its receipt part before WP6 | the release path is built with the first draw documents |
| Q9 zero-value non-egg stock | WP4 (openings); also WP5 (count gains) and WP6 (receipt lines) | `value_required` and the reason columns |
| Q13 flock-dependent items | WP5, and the Phase-1 close (§1.1) | the `record_expense` signature and the table-egg rejection |
| Q14 the month of a late bill | WP5 | `expenses` columns and the `record_expense` signature |
| Q7 fils in line totals and discount | WP6 | `receipt_amounts` / `receipt_line_amounts` checks |
| Q8 the "by value" weight | WP6 | the charge split |

The practical course is to put all of them to the owner at once now, and to hold each package until its rows are answered.

**Q1. Who may create and edit master data, and who sets a division's go-live date?**
Why open: the permission table (DECISIONS:194-209; FOUNDATION:528-544) has no row for items, stores, parties, cash boxes or categories. They are direct-write (FOUNDATION:438), and they decide valuation (factors, density), book routing (warehouse kind) and who may name a supplier. `go_live_on` has no setter (0001_core.sql:83).
- **A (recommended):**
  - the manager (and owner) handles stores, sites, items, pack units and categories (new action `stores.manage`);
  - the accountant and manager handle parties, cash boxes and expense categories (`parties.manage`, `cash_accounts.manage`, `expense_categories.manage`);
  - the storekeeper may **create** a supplier party (name and phone, after the twin check) from a receipt draft, but not edit or archive it (`party.create`);
  - the go-live date is set by the manager under `opening.post`.

  Cost: five new actions (`stores.manage`, `parties.manage`, `party.create`, `cash_accounts.manage`, `expense_categories.manage`) and their parity cells, all added in 0005 so later migrations need not replace `role_can` again; well-controlled.
- **B:** owner and manager only, for everything. Cost: the storekeeper must wait for the manager for every new supplier; drafts stall.
- **C:** every non-viewer role within its scope. Cost: storekeepers can change factors and kinds that drive valuation; risky.

**Q2. Request to deviate from FOUNDATION:813: defer the twin merge function. Also, the archive rules for parties.**
What is written: the input checks for twins by normalising both sides and **warns, then allows** («قبل ما يسمح بتوأم»), and twins are folded by a **reversible merge function** («تنطوي بدالّة دمج تنفكّ», FOUNDATION:813).
Why a deviation is asked: the ledgers are append-only, and allocation is bound to one party by the composite key (FOUNDATION:319-323, 437). A merge cannot re-point history. It needs an alias whose reports and rule-27 allocation work over the merged group, so that a payment recorded on the survivor can settle the twin's invoice. That is a design of its own.
What is not written: whether a party with a balance may be archived (only `post_sale` rejects archived parties, FOUNDATION:581).
- **A (recommended, deviation on the merge only):**
  - twins handled as written: warn on the same `phone_key` or normalised name (parties) and the same normalised name (items), and allow after confirmation;
  - item codes stay unique, because a scanned code must resolve to one item (FOUNDATION:812);
  - **no merge function in Phase 1**: a duplicate is archived once its balances are zero, and the merge comes as its own decision in a later phase;
  - archiving a party with any non-zero book balance is rejected;
  - archived parties reject new purchases, credit expenses and adjustments, but accept payments, payouts and every void (E43).

  Cost: low. Duplicates entered by mistake stay as two cards until both are cleared and one archived.
- **B (the written rule in full):** A plus a reversible alias merge built in Phase 1: `parties.merged_into`, reports grouped by the survivor, rule-27 allocation over the group, and an unmerge that restores the separation. Cost: significant extra design, build and tests in Phase 1, touching allocation, the most sensitive engine.
- **C (stricter deviation):** block the same `phone_key` and make normalised item names unique. Cost: blocks real namesakes and shared phones; users invent spelling variants. It departs from "warn, then allow" as well.

**Q3. Resolved, now E47.** FOUNDATION:444 names the supplier return as a mixed document written by a role without cost, with its amounts in a side table (also :336-337). Amounts and posting follow the receipt (FOUNDATION:533; DECISIONS:96, 202).

**Q4. Which end of a transfer must be in the storekeeper's scope?**
Why open: FOUNDATION:532 says «بمخازن نطاقه». An internal export crosses divisions by design (T0 goes general → mill) and there is no receiving step.
- **A (recommended):** the source must be in scope; the destination may be any active org store that admits the item. Cost: none.
- **B:** both in scope. Cost: T0-like moves need a manager or a wider scope.
- **C:** two-step send and receive confirmed by the destination storekeeper. Cost: a new in-transit state and document type.

**Q5. Expired goods on a receipt, and how the manager's release is given.**
Already decided and built as written:
- DECISIONS:83, 122, 204: selling or using («بيعه أو صرفه») an expired lot is a warning that passes with the manager's approval (`expired.release`).
- FOUNDATION:476: expired lots are never drawn automatically and are not in «الموجود الآن». Otherwise they leave only by destruction or supplier return, so a transfer never moves an expired lot.
- Counting expired stock is E41.

Still open: (1) a receipt line whose goods are already expired on the receipt date, which no rule covers; and (2) the mechanism of the release.
- **A (recommended):**
  - a stock-use line may **name** an expired lot, and posting it needs `expired.release`: the storekeeper's draft waits in «بانتظار موافقة المدير» and the manager posts it;
  - a receipt line already expired on `received_on` is rejected (`expired_on_receipt`) unless a manager posts the receipt, with the warning shown in the preview.

  Cost: one list screen; no new table.
- **B:** A, but expired goods can never be received (the supplier must replace them). Cost: free or discounted near-dated goods cannot be recorded.
- **C:** the manager stamps an approval on the line, and the storekeeper then posts. Cost: an approval column and function, and one more state.

**Q6. Resolved, now E48.** FOUNDATION:304 and :479 specify a manager-entered unit cost with a reason. Rule 9 (FOUNDATION:468) concerns the displayed lot cost, so there is no contradiction. The value is rounded once (rule 8), and 4 dp matches the displayed unit cost.

**Q7. May individual receipt line totals and the header discount carry fils?**
Already fixed: charges, `paid_now`, the supplier-return credit and the revaluation diff are whole dinars, because each enters a party book or a box (FOUNDATION:466, rule 7). The supplier entry = Σ lines − discount, a whole dinar «كما بفاتورته» (FOUNDATION:493).
Still open: whether a single `line_total` or the discount may carry fils when the net is whole.
- **A (recommended):** `line_total` and the discount are whole dinars too (check `round(x,0)`); fils appear only in lot values through the shares. Cost: none; an invoice with fils per line is entered with its dinar amounts as the supplier bills them.
- **B:** line totals and the discount may carry fils if Σ lines − discount is whole; the revaluation `new_total` then keeps the line's fils so that the diff stays whole. Cost: a rejection at posting when the net is not whole, which is confusing to the user.

**Q8. The weight of a receipt charge split «بالقيمة».**
Already fixed: the line selection is assumed by the rule-11 hint «… أو اختر السطور» (FOUNDATION:473), so `receipt_charge_lines` is built (no rows = all lines).
Still open: whether "by value" weighs the gross or the net line amount.
- **A (recommended):** the weight is `line_total` as written on the invoice, the same basis as the discount. Cost: none.
- **B:** the weight is the net, `line_total − discount_share`. Cost: the weight depends on already rounded fils shares, and the preview must split the discount first.

**Q9. Zero-value non-egg stock: bonus goods, empty gas cylinders, zero openings.**
Why open: DECISIONS:137 keeps empty cylinders counted «بلا قيمة» but gives no mechanism. FOUNDATION:548 rejects «قيمة فارغة» on openings, and FOUNDATION:479 forbids «صفر بالسرّ». Free goods on a receipt are not covered.
- **A (recommended):**
  - an explicit 0 is allowed only with a reason: a receipt `line_total` of 0 (the lot is worth its charge share only), an opening value of 0, a count gain at 0 by a manager;
  - empty cylinders are a separate item «قنينة غاز فارغة» (pc) brought in by opening or count at 0 and taken out by stock use or supplier return at 0;
  - null is always rejected.

  Cost: a reason column on those lines.
- **B:** zero is forbidden for every non-egg item; bonus goods enter by count gain at the last cost; empties are not tracked as stock. Cost: the DECISIONS:137 empties are not in stock.

**Q10. Cash boxes: opening balance, moves between boxes, negative balance.**
Why open: openings are defined for stores and parties only (FOUNDATION:140); there is no inter-box function; nothing says whether a box may go negative. The worked example pays 21,075,000 cash in Phase 1 with no cash opening (§1.2).
- **A (recommended):**
  - `record_cash_opening` (manager, `opening.post`, dated on or before the earliest go-live, exempt from the 7-day limit);
  - `transfer_cash` (accountant or manager, `payment.post`, two opposite moves, voidable);
  - negative balances allowed with a visible warning on the box, preview and home card.

  Cost: three functions; no new lock.
- **B:** A, but negative balances rejected for cash and wallet (`insufficient_cash`; bank overdraft allowed). Cost: a cash-account lock in the global lock order, and the golden example must seed a cash opening.
- **C:** no opening and no transfer in Phase 1; boxes start at 0. Cost: wrong box balances from day one; users fake moves through parties.

**Q11. Resolved, now E49.** FOUNDATION:544 puts scope inside the read and write policies themselves, and :245 makes no scope rows mean the whole org for owner, manager and accountant. FOUNDATION:116 restricts the page to accounts roles but does not exempt them from scope.

**Q12. The side labels of the cash-box statement.**
Already fixed: the party statement is one six-column `LedgerTable` per book (E50). The owner's statement model in DECISIONS:21 overrides the «الدفتر» column of FOUNDATION:114.
Still open: the owner's model names its money columns «عليه | له», which are words about a party. For a cash box:
- **A (recommended):** the same six-column table with the side labels «وارد | صادر» in place of «عليه | له». Cost: none; the money words fit a box.
- **B:** «عليه | له» literally, as in the owner's model. Cost: the words read oddly for a box («عليه» for cash received).

**Q13. Flock-dependent items listed in Phase 1 before flocks exist.**
Why open: FOUNDATION:897 puts «التحميل على فوج» in Phase 1. Flocks, halls and `flock_costs` are Phase 3 (FOUNDATION:899). Table-egg lots require `source_flock_id` (FOUNDATION:292), and gas delivered straight to a field is a receipt plus a flock issue (DECISIONS:138).
- **A (recommended):**
  - `record_expense` carries `p_flock` and `p_hatch_batch` from day one but rejects them (`flock_not_available`) until Phases 3 and 5, when the body is replaced with the same signature (no `_v2`, FOUNDATION:230);
  - table-egg opening and count lines are rejected until Phase 4;
  - the gas-to-field document comes with Phase 3.

  Cost: the Phase-1 deliverable «التحميل على فوج» moves to Phase 3 by the owner's word, recorded in DECISIONS. Phase 1 cannot close without that word (§1.1).
- **B:** create minimal halls, flocks and `flock_costs` tables now. Cost: designing Phase-3 tables early, before their screens and rules.
- **C:** move flock charging to Phase 3 with a later `record_expense_v2`. Cost: two live signatures to maintain.

**Q14. A bill that arrives after its month: which month does it belong to?**
Why open: DECISIONS:131 makes a late bill «مصروف الوحدة بشهرها». But `record_expense` follows the 7-day back-dating limit (DECISIONS:91; FOUNDATION:521). An October electricity bill that arrives on 10 November cannot be dated in October.
- **A (recommended):** `on_date` keeps the 7-day rule, so the cash move and the book entry are dated on the real day. A separate `for_month` names the month the expense belongs to. It may be the current month or an earlier one that is not locked; a locked month is rejected (`period_locked`), so a closed month's figures never change. Expense reports group by `for_month`. Cost: one column, one parameter and a report choice.
- **B:** `record_expense` may be back-dated to any unlocked day, exempt from the 7-day limit like the opening functions. Cost: the cash box and the party book get entries dated weeks back, which changes running balances on statements already printed. It weakens DECISIONS:91 for money.
- **C:** no special handling: the bill belongs to the month it is recorded in. Cost: contradicts the literal «بشهرها».

**Owner actions** (decisions already taken, not questions):
- **A1:** the word, per package, to push that package's migration to production and **then** merge it to `main`. The database always goes first, because `main` builds production (FOUNDATION:58, 77, 919; DECISIONS:68-69; WP8 release steps).
- **A2:** create or approve the separate demo/e2e Supabase project already chosen in decision 20 (DECISIONS:102; FOUNDATION:145), apply the migrations there, and point Vercel's **Preview** variables at it (today both environments hold the production values, DECISIONS:68; after the change, redeploy, as DECISIONS:68 notes). This is a precondition for any live check of a Phase-1 flow, including the preview check before each merge, not only for Playwright: until then preview builds talk to production, which is read-only (FOUNDATION:59) and has no accounts (DECISIONS:77). The empty Singapore project stays untouched (DECISIONS:28).
- **A3:** the pending sign-in settings session (DECISIONS:52, 77) before any live journey on production.
- **A4:** approval of any measured budget raise (DECISIONS:182-188).
- **A5:** the phase gate (WP8): approve a real working day on Phase 1 (FOUNDATION:894), and supply a real working day per unit, encoded as the second golden template before Phase 2 starts (FOUNDATION:904).

---

## 5. Risks and how each is tested

| # | Risk | Test or control |
| --- | --- | --- |
| R1 | Double rounding, or preview ≠ post by one fils (FOUNDATION:467, 805) | WP1 parity with zero tolerance plus a negative control; preview = post for every golden document (GT-08); receipt parity with a discount that splits fils |
| R2 | JSON numbers lose precision on the way to bigint | E3 string wire format; money-guard bans `Number()` (non-money uses carry a `number-ok` reason marker); a repo round-trip of 240,416,667 fils and of a value with 16+ significant digits |
| R3 | FIFO tie order differs between client (uuid compare) and server | `fifo.ts` parity on equal `fifo_seq` (a mirror returning to its origin warehouse) |
| R4 | Deadlocks: multi-party documents, payment vs void, opposite-order transfers | single lock order (§2.3, E9); C8 and C13 races |
| R5 | Over-withdrawal under concurrency (D6) | balances locked first, then lots `for update`; C1 races in WP4 and WP5 |
| R6 | Cost leaks through previews, replays, `audit_log`, reports, `home_summary` or error hints | structural `money` masking (E2); cost-leak suite per role over every allowlisted function; hint text scanned for known lot values; catalog asserts `can_see_cost` equals `can_see_accounts` |
| R7 | RLS recursion 42P17, or write policies that silently affect zero rows | catalog "no policy reads its own table"; a positive write control per direct-write table; `updatedRows()` throws on zero rows (DV-799) |
| R8 | Posting a draft that changed after the preview | `expected_version` plus `stale_draft`; C9 |
| R9 | Locale or time-zone differences (ICU vs C, UTC vs Baghdad, Vercel `TZ=:UTC`) | explicit character lists; BMP sweeps; `app_today` zone sweep; domain date tests under two TZ values |
| R10 | Append-only bypass by an owner function or service_role | `reject_change` row and truncate triggers; tests as service_role; catalog trigger-type assertion |
| R11 | Harness drifts from production | digest 9/9 and `md5(prosrc)` after every push; production `verify_*` read-only (GT-26) |
| R12 | Large postings exceed the 8 s request limit | GT-30: 200-line receipt and a 500-lot draw under `applyRequestLimits` |
| R13 | Allocation drift after voids (a payment left on a voided entry) | `verify_ledger` plus property tests with reverse voids |
| R14 | Wrong book used while the total still matches | per-book comparisons only (FOUNDATION:703); wrong-book probe |
| R15 | Go-live set wrongly or changed after use | `go_live_frozen` after `first_posted_at`; `no_go_live`, `before_go_live` and `after_go_live` tests |
| R16 | Scoped storekeeper sees nothing (no scope rows) or too much | role-matrix plus scope parity; the staff screen shows "no store assigned" |
| R17 | Rewriting the catalog test weakens it | exact `classes.json` comparison plus snapshot PROBES that must fail |
| R18 | Seed or backfill differs on production orgs | idempotent seeds tested twice; production digest; production org count read before the push |
| R19 | Arabic text or escape traps in code and SQL (CLAUDE.md traps) | i18n-guard decoded scan, hidden-character check, `\u{…}` with the `u` flag |
| R20 | Offline drafts surface under another user or org | the device draft shelf stamp test (GT-29); outbox test rejects every `post_*` |
| R21 | Value conservation incomplete as later phases add terms | `verify_stock` names the Phase-1 terms explicitly; each later phase adds its own terms with a BREAK probe |
| R22 | Fractional pieces through conversions | `to_base` `pieces_not_whole`; verify check 3 (lot shape) |
| R23 | An unknown-outcome retry with a new ref double-posts | the repo keeps the ref; double-click test (LS-53); C2 |
| R24 | Precache or bundle budget exceeded by new pages | lazy `page()` for every screen; budgets measured each package; a raise goes to the owner |
| R25 | No backend for Playwright or for any live check (preview builds use production, DECISIONS:68) | owner action A2 is a precondition for live checks; until then `renderToStaticMarkup` fed by real report output (D4) plus harness journeys |
| R26 | Audit-log volume from `stock_balances` and ledger inserts | measured in the property run; a named exception is proposed to the owner only with numbers |
| R27 | A valuation bug invisible to `verify_*`, because a check compares moves with moves | conservation from document-side sources (WP4 check 8, E55) and per-document ties (WP6 checks 10–13, WP7 checks 14–15), each with a BREAK probe |
| R28 | An allocation bug that leaves «عليه» and «له» open together in one book | `verify_ledger` check 10; the rule-27 allocation test in WP6 |
| R29 | Screens merged to `main` before their migration is live break production | release order per package: database, verify, then merge (A1, WP8) |
| R30 | A role reaches a function it should not, or a manager cannot reach an operational one | the §2.12 matrix run per role, with registry coverage per (function, role) |

---

## Appendix A: error codes introduced in Phase 1 (each with a Fusha hint and an i18n key)

- **Common:** `forbidden`, `out_of_scope`, `stale_draft`, `ref_reused`, `not_draft`, `not_posted`, `already_void`, `already_reversed`, `reason_required`.
- **Dates:** `date_required`, `date_in_future`, `date_too_old`, `period_locked`, `before_go_live`, `after_go_live`, `no_go_live`, `go_live_frozen`.
- **Stock:** `insufficient_stock`, `item_kind_mismatch`, `wrong_receiving_store`, `same_warehouse`, `pieces_not_whole`, `qty_not_positive`, `expiry_required`, `born_at_required`, `expired_needs_release`, `expired_on_receipt` (Q5), `lot_not_expired`, `item_has_moves`, `value_required`, `egg_flock_required`, `lot_consumed`, `count_stale`, `not_submitted`, `gain_cost_required`.
- **Receipts and returns:** `receipt_empty`, `discount_exceeds_total`, `paid_exceeds_total`, `cash_account_required`, `charge_payee_required`, `no_mass`, `zero_weights`, `has_revaluation`, `has_supplier_returns`, `receipt_not_posted`, `credit_not_whole_dinar`, `not_drawn`, `same_total`, `negative_total`, `negative_value`, `newer_revaluation`.
- **Ledger:** `book_required`, `book_mismatch`, `amount_zero`, `amount_not_positive`, `amount_not_whole_dinar`, `opening_exists`, `party_archived`, `balance_zero`, `exceeds_balance`, `direction_required`, `not_a_payment`.
- **Expenses:** `division_required`, `category_required`, `party_required`, `system_expense`, `flock_not_available`.
- **Helpers and master data:** `mul_div_domain`, `zero_weights`, `negative_weight`, `twin_exists`, `archived_in_use`.

---

## Appendix B: Phase-1 golden seed (`supabase/tests/golden.test.mjs`)

**Org and actors:** owner, manager, accountant, two storekeepers and a viewer. Users are real `auth.users` rows; every write goes through the real RPCs as `authenticated`.
- «أمين المعمل» is scoped to the mill raw store and the general store. He drafts R1–R4 and T0.
- «أمين المفقس والأدوية» is scoped to the hatching-egg store and the medicine store. He drafts the HE1 and V1 receipts.
- The viewer is scoped to the mill division.

A storekeeper with no scope rows sees nothing (FOUNDATION:245), so every receipt needs a drafter whose scope covers its store. A negative control: «أمين المعمل» drafting into the medicine store gets `out_of_scope`.

**Go-live dates** (FOUNDATION:600): broiler 2026-09-08; hatchery and medicine 2026-09-24; mill and general 2026-09-30; layer 2026-10-15.

**Items:**

| Item | Kind | Unit | Notes |
| --- | --- | --- | --- |
| corn «ذرة صفراء» | raw | kg | |
| soybean meal 46% | raw | kg | |
| vegetable oil | raw | L | density 0.92 |
| limestone | additive | kg | |
| DCP | additive | kg | |
| premix | additive | kg | `tracks_expiry`, pack «كيس 25 كغم» |
| salt | additive | kg | |
| empty bags 50 kg | packaging | pc | |
| diesel «كاز أويل» | fuel | L | |
| gas | fuel | pc | no piece mass |
| kerosene «كاز أبيض» | fuel | L | |
| hatching eggs | hatching_egg | pc | |
| vaccine | vaccine | pc | `tracks_expiry` |

**Parties:** «أبو علي», «مورّد الحبوب», «الناقل», one cash supplier per cash receipt, a hatching-egg supplier and a vaccine supplier. **Cash box:** «الصندوق».

**Sequence** (`setToday` before each date):

| Date | Document | Expected |
| --- | --- | --- |
| 2026-09-24 | RH: HE1 30,000 eggs × 300 (cash, hatching-egg store) → PU-2026-0001 | lot 9,000,000.00; `hatching_eggs` book: purchase −9,000,000 and payout +9,000,000 → 0 |
| 2026-09-24 | RV: V1 30 vials × 20,000, expiry 2027-06-30 (cash, medicine) → PU-2026-0002 | lot 600,000.00; medicine book 0 |
| 2026-09-30 | `record_opening_balance(Abu Ali, mill book, +500,000)` | mill «عليه 500,000»; same date on 2026-10-01 → `after_go_live` |
| 2026-09-29 | negative control: a receipt in the mill division | `before_go_live` |
| 2026-10-01 | R1 (cash, mill raw store): C1 4,000 kg 1,800,000; S1 4,000 kg 3,600,000; O1 1,000 L 2,300,000; L1 1,000 kg 100,000; D1 500 kg 600,000; M1 8 bags × 25 = 200 kg 600,000, expiry 2027-03-01; SL1 500 kg 100,000; BG1 1,000 pc 500,000 → PU-2026-0003 | lots as in FOUNDATION:606-613; supplier 0 |
| 2026-10-01 | T0 attempted before R2 | `insufficient_stock` (GOLD-08) |
| 2026-10-01 | R2 (cash, general): DS1 1,000 L 800,000 → PU-2026-0004 | |
| 2026-10-01 | T0: all of DS1 general → mill raw → TR-2026-0001 | mirror 1,000 L, 800,000.00, same `fifo_seq` (D3); Σ `value_left` = 10,400,000.00 (excluding HE1 and V1) |
| 2026-10-15 | R3 (credit): grain supplier C2 5,000 kg line 2,350,000 + S2 1,000 kg line 900,000; charge 65,000 by mass with payee «الناقل» → PU-2026-0005 | shares 54,166.67 / 10,833.33; C2 2,404,166.67; S2 910,833.33; entries −3,250,000 and −65,000 in the mill book (D2, D4) |
| 2026-10-15 | R4 (cash, general): GZ1 100 bottles 700,000; KZ1 500 L 375,000 → PU-2026-0006 | |

**Final assertions:**
- Σ of the 13 lots C1…KZ1 = 14,790,000.00 (D1); Σ `value_left` = 14,790,000.00, or 24,390,000.00 with HE1 and V1.
- Mill raw store 13,715,000.00 (including the T0 mirror); general store 1,075,000.00.
- `report_accounts_summary`: mill «لنا» 500,000 and «علينا» 3,315,000; every other division 0 / 0; project 500,000 / 3,315,000.
- Statement last lines: grain supplier «له 3,250,000», carrier «له 65,000».
- The rendered accounts page (WP6, D4): «له 3,250,000» and «له 65,000» in the mill column, «عليه 500,000» for «أبو علي», and the footer rows «علينا للناس» 3,315,000 and «لنا عند الناس» 500,000.
- Cash box movement −21,075,000 (plus an opening if Q10 = A).
- Every `verify_*` = 0, including the receipt ties (checks 10–13) and the allocation-completeness check.
- The test reports how many values it compared, and one altered literal must fail it.

## Appendix C: test file map

**Postgres (`supabase/tests`):**
- `parity.test.mjs`: extended in WP1 and WP2.
- `stores.test.mjs`: WP2.
- `ledger.test.mjs` and `book.test.mjs`: WP3.
- `stock.test.mjs`, `division.test.mjs`, `stock-concurrency.test.mjs`, `write-lock.test.mjs` and `cost-leak.test.mjs`: WP4, grown by each later package.
- `expenses.test.mjs` and `counts.test.mjs`: WP5.
- `receipts.test.mjs` and `golden.test.mjs` (with the rendered accounts page, D4): WP6.
- `returns.test.mjs`: WP7.
- `property.test.mjs`: v1 in WP3 through v5 in WP7.
- `role-matrix.test.mjs`: from WP2, one row per §2.12 cell, grown by every package.
- `rollback` runner cases: from WP2 (`rollback_0005.sql`).
- `golden2.test.mjs`: the owner's real working day, at the phase gate (WP8).
- Shared helpers `sameRefRace` and `draftWriteLock` (WP0), registered by every document kind.

**Unit (`scripts/tests`):**
- `fifo.test.mjs`, `receipt.test.mjs`, `count.test.mjs` and `revalue.test.mjs`.
- `accounts-screens.test.mjs` and `inventory-screens.test.mjs`.
- Extensions to `format.test`, `permissions.test`, `workspace.test`, `repo.test`, `outbox.test`, `numbers.test` (ledger) and `phone.test` (`phoneKey`).

**e2e:** `e2e/phase1.spec` (WP8).

---

## Critic notes

The critic's review was checked against FOUNDATION, DECISIONS and the code. Every finding was accepted except the one below.

**Rejected:**
- **B5, second half** (give the storekeeper a `preview_count`). The storekeeper never posts a count. Posting is `count.approve`, the manager's (FOUNDATION:540; DECISIONS:204), and `PostPreview` is required before a posting (FOUNDATION:770). A diff preview on the entry side would show the system quantities that E25 keeps off the count screen. The first half of B5 is accepted: `report_expenses` is under `accounts.view` plus the cost check.

**Accepted, with a different fix than suggested:**
- **Q6 (D):** dropped to engineering decision E48 rather than narrowed. The input precision (4 dp) follows the displayed unit cost of rule 9 (FOUNDATION:468), and the owner can overturn it.
- **Q2 (D):** reframed as a request to deviate. The recommended option now keeps the written "warn, then allow" twin rule and deviates only by deferring the merge function.
- **C11:** a `// number-ok: السبب` line marker (FOUNDATION:835 style) on `src/domain/dates.ts:22, 24`, not a file-scoped exemption.
- **B3:** reversals ignore archive guards (E43), rather than voids being rejected for an archived record.
- **E1 to E4:** E1 touches money and is not written, so it became owner question Q14. E2, E3 and E4 follow from written rules (FOUNDATION:512, 552, 458/460) and became E45, E51 and E46.

**Found while fixing (not in the critic's list):** the plan never allocated a receipt's `purchase` entry, or a carrier's, against an opposite balance the party already had in the book. Rule 27 requires it («وقيد جديد … يتوزّع من أي رصيد مقابل قائم»), and the new `verify_ledger` check 10 would have failed on it. Fixed in WP3 (`allocate_new` for every new original) and in WP6 steps 8–9, with `paid_now` matched first, plus a test.
