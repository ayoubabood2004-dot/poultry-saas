# Contract 0028_bird_sales_close (delivery 2: weigh tickets, BR bird invoices, bird counts, close / reopen, leftover feed)

Spec: docs/HALLS_REPORTS_PLAN.md delivery 2 (P0 1–7) and the owner's final answers of 2026-11-12. Mapped facts: scratchpad/reports/map2.json (`close`, `sales`).
Built ON TOP of 0027 (contract-0027.md): every body 0028 changes is copied from its LATEST version (0027 for the report readers, 0026, 0024, 0021,
0019, 0012) and then edited; never from an older file (CLAUDE.md lesson 2026-11-04). Rebase on the merged 0027 before writing SQL.

Conventions (as 0019/0021/0026/0027): every function `security definer set search_path = public, pg_temp`, `set local lock_timeout = '5s'`,
org = `public.auth_org()` in every predicate, scope by `public.in_scope_site(site_id)` (no hall-level scope in v1, 0012:16), action via
`private.require(...)`. Writers: `private.ref_claim` FIRST (before any lock), device-born ids taken under `pg_advisory_xact_lock(hashtextextended('<kind>:'||id, 0))`,
"same posted content by the same user = saved (return its result); else `id_conflict`; voided after → `id_conflict` «أُلغي…»" (0019/0021 pattern).
Lock order (F:518): ref → id advisory locks → party advisory (`lock_parties`) → period + division (`check_post_date` / `check_void_date`) → document
row → hall → flocks by id → masters (`lock_masters`) → balances (`lock_balances`) → lots → cash box (`lock_cash_account`) → counter
(`next_doc_no`) LAST. Every check after its lock. Refusals `raise exception '<code>' using hint = '<Fusha>'`. Quantities: kg/L/pc in base units,
3 dp; money: party/cash amounts whole dinars, costs 2 dp (fils). JSON: numerics as TEXT, integers as numbers, dates 'YYYY-MM-DD', missing input = null.
No `/` in SQL (migration-guard): `div()` / `private._mul_div_round(q, v, l, n)` / `private.alloc_lr(total, weights[], scale)`.
Hints: counts `to_char(n, 'FM999,999,999,990')`, money `private.money_text(x)`, quantities `private.qty_text(q, unit)`, dates `to_char(d, 'DD/MM/YYYY')`.

## 0. Decisions

Owner (binding, 2026-11-12):
- O1 Birds leave the hall WHEN THE BR INVOICE IS POSTED (rule 37): `record_bird_sale` writes the `sold` rows. A finished ticket does not change live.
  The cycle cannot close while a non-void ticket of the flock has no posted invoice. Voiding an invoice returns the birds; refused on a closed flock.
- O2 The manager closes with «أغلق الدورة».
- O3 Leftover, per item at each close: return to a store it came from (rule 16 pool average; new lot with the smallest fifo_seq and nearest expiry of
  the issued lots), count as consumed, or carry to the next cycle in the same hall (pending on the hall until the next flock is placed; returnable
  to a store before that).
- O4 Sold birds and net kg at close come from the posted invoices (never typed twice); live − sold left over = «فرق العدّ» with a mandatory reason,
  shown apart from mortality.
- O5 «أعد فتح الدورة» by the manager with a reason, while no new flock entered the hall and the returned feed was not used.
- O6 One price per kg per ticket × net after an optional 0–10% deduction (rule 26); golden F:664 = 24,899,875.
- O7 Payment: credit by default, «المقبوض الآن» (0..total) to a chosen cash box.
- O8 «وزن الفارغ» then «وزن الخابط» after each hall; hall net = its gross − the previous gross (− its crates × crate kg when the empty was weighed
  without crates); Σ hall nets = ticket net exactly (D:225–227, CLAUDE.md red line). Both scales (truck «قبّان» and crate scale), D:224.
- O9 Roles: ticket = hall worker in his site + manager (`weigh_ticket.draft`); invoice = accountant + manager (`sale.post`); void / close /
  reopen = manager (`void`, `flock.manage`). O10 One trader and one ticket per invoice; numbers BR (invoice), WT (ticket); no money on tickets.

Without asking (inside the red lines; record in DECISIONS):
- D1 Broilers only: tickets, BR and close refuse layer flocks (`site_not_broiler`, `close_layer_later`); SH and layer close come later.
- D2 The deduction % is a pricing term on the INVOICE (the ticket is weights only).
- D3 Invoice date = ticket date (sold rows dated the ticket day); the normal rule applies (not future, ≤ 7 days, not locked).
- D4 One append-only table `flock_counts` (`sold`, `count_adjust`); reversal rows are dated the void day, but per-day readers use LIVE ORIGINALS only
  (an original that is not a reversal and has no reversal) by their own date, so a voided invoice disappears from history like a voided FI in 0027.
- D5 A standalone «فرق العدّ» for the manager (`record_flock_count_adjust`, FOUNDATION ٥٧٥): when the real count exceeds the system's, the invoice is
  refused `birds_over_live` and the hint sends the manager there. At close the remaining live becomes a negative «فرق العدّ».
- D6 Live never below zero on ANY day: every writer that lowers live calls `private.flock_live_check` (per-day) after writing.
- D7 One leftover line per item at close; each returned line is a numbered stock document FR-YYYY-NNNN (visible in the store's item ledger).
- D8 The close carries what the screen showed (live, sold birds, per-item pools) and compares it under the flock lock (CLAUDE.md:100).
- D9 The ticket page needs the network to open (HallsRoutes is excluded from the precache); typed weights are kept on the device until saved.
- D10 Close-line kg snapshot = the density / piece mass of the most recent pool line (issue or carry-in) of that item.
- D11 Money/sales readers ADD keys for birds; existing keys keep shape and meaning (old screens unaffected).
- D12 Apply and merge together (as 0025): new entry_detail types; no bird row can exist before the new screens are live.

## 1. Constraint widenings (same names; copy the latest definitions, 0021/0019)
- `stock_moves_doc_kind_check`: + 'flock_return' → ('opening','receipt','supplier_return','receipt_revalue','transfer','count','stock_use','production','flock_issue','conversion','sale','flock_return').
- `stock_lots_source_kind_check`: + 'flock_return' → ('opening','receipt','transfer','count_gain','production','conversion','flock_return').
- `doc_counters_kind_check`: + 'WT','BR','FR' → ('PU','RT','TR','CT','SU','RC','PY','OF','PD','FI','CV','FD','MD','MS','WT','BR','FR').
- `flock_costs_doc_kind_check`: ('flock_issue','flock_return','flock_carry'); `flock_costs_expense_check`: `doc_kind not in ('flock_issue','flock_return','flock_carry') or expense_id is null`
  (keep the existing sentence in constraints-flocks.ts: precached file, no byte change).
- party_entries / cash_moves doc_kind 'bird_sale' already pass their regex (0006:116); doc_no 'BR-YYYY-NNNN' passes `party_entries_doc_no_check`.

## 2. New tables (11). All: `org_id uuid not null default public.auth_org() references public.orgs (id)`, `created_at`, `created_by default auth.uid()`,
`unique (org_id, id)`, RLS on, `revoke all … from anon, authenticated; grant select … to authenticated; revoke truncate … from service_role`, no write
policy (functions only), `audit_row` trigger, a full index for every FK. Sentences go in NEW dictionaries (§11): constraints-close.ts / constraints-birdsales.ts.

### 2.1 public.flock_counts (append-only; FOUNDATION ٣٧٤)
Columns: id uuid pk default gen_random_uuid(); flock_id, hall_id, site_id, division_id (copied from the flock); on_date date not null; kind text;
birds int not null (signed); net_kg numeric (sold only); doc_kind text not null; doc_id uuid not null; doc_line_id uuid; reason text; reverses_id uuid.
- `flock_counts_kind_check` kind in ('sold','count_adjust') — «نوع حركة عدد الطيور: مباع أو فرق عدّ.»
- `flock_counts_birds_check` birds <> 0 and birds between -10000000 and 10000000 — «عدد الطيور في الحركة غير الصفر، ولا يزيد مقداره على 10,000,000.»
- `flock_counts_sign_check` kind <> 'sold' or ((birds < 0) = (reverses_id is null)) — «المباع ينقص الطيور الحيّة، وعكسه يعيدها.»
- `flock_counts_net_check` (kind = 'sold') = (net_kg is not null) and (net_kg is null or (abs(net_kg) < 'Infinity' and net_kg <> 0 and net_kg = round(net_kg, 3) and sign(net_kg) = -sign(birds)))
  — «صافي الوزن لحركة المباع وحدها، بثلاث مراتب عشرية وبإشارة تعاكس عدد الطيور.»
- `flock_counts_doc_check` (kind = 'sold' and doc_kind = 'bird_sale' and doc_line_id is not null) or (kind = 'count_adjust' and doc_kind in ('flock_close','count_adjust') and doc_line_id is null)
  — «مصدر حركة العدد: فاتورة طيور للمباع، أو إغلاق دورة أو فرق عدّ يدويّ لفرق العدّ.»
- `flock_counts_reason_check` (reason is null or length(btrim(reason)) between 1 and 500) and (kind <> 'count_adjust' or reverses_id is not null or reason is not null) — «فرق العدّ له سبب حتى 500 حرف.»
- unique (org_id, reverses_id); FK (org_id, flock_id) → flocks; (org_id, division_id, site_id, hall_id) → halls; (org_id, reverses_id) → flock_counts (org_id, id).
- Indexes: (org_id, flock_id, on_date), (org_id, doc_kind, doc_id), (org_id, division_id, site_id, hall_id). Triggers `flock_counts_append_only`
  (before update or delete, `private.reject_change`) and `flock_counts_no_truncate`. Read: org + in_scope_site(site_id).
- "Live originals" = rows with `reverses_id is null and not exists (reversal)`. Σ all rows = Σ live originals (pairs cancel).

### 2.2 public.weigh_tickets (no money; FOUNDATION ٤٠٨)
id uuid pk (device); site_id, division_id (from the site); on_date date not null; ticket_no text (WT at finish); method text not null;
empty_kg numeric; empty_with_crates boolean; crate_kg numeric; vehicle text; driver text; note text; birds int; crates int; net_kg numeric
(totals, recomputed at every save, null while incomplete); status text not null default 'draft'; version int not null default 1;
finished_at, finished_by, voided_at, voided_by, void_reason; updated_at, updated_by.
- `weigh_tickets_method_check` method in ('scale','crates') — «طريقة الوزن إمّا القبّان أو ميزان الأقفاص.»
- `weigh_tickets_method_fields_check` (method = 'scale') = (empty_with_crates is not null) and (method = 'scale' or empty_kg is null) — «وزن الفارغ وحالة الأقفاص فيه للقبّان وحده.»
- `weigh_tickets_empty_check` empty_kg is null or (abs < Inf and > 0 and <= 200000 and = round(,3)) — «وزن الفارغ بالكيلوغرام أكبر من صفر حتى 200,000، بثلاث مراتب عشرية على الأكثر.»
- `weigh_tickets_crate_kg_check` crate_kg is null or (> 0 and <= 100 and = round(,3)) — «وزن القفص الفارغ بالكيلوغرام أكبر من صفر حتى 100، بثلاث مراتب عشرية على الأكثر.»
- `weigh_tickets_totals_check` (birds null or 1..10000000) and (crates null or 0..1000000) and (net_kg null or (> 0, round 3)) — «مجاميع التذكرة: الطيور من 1 إلى 10,000,000، والأقفاص من صفر، والصافي أكبر من صفر بثلاث مراتب عشرية على الأكثر.»
- `weigh_tickets_status_check` status in ('draft','done','void') — «حالة التذكرة: مسوّدة أو مكتملة أو ملغاة.»
- `weigh_tickets_no_check` (ticket_no is null or ticket_no ~ '^WT-[0-9]{4}-[0-9]{4,}$') and (status <> 'done' or ticket_no is not null) and ((ticket_no is null) = (finished_at is null)) — «رقم التذكرة بصيغة WT-السنة-الرقم، ويُعطى عند إكمالها.»
- `weigh_tickets_done_check` status <> 'done' or (birds is not null and net_kg is not null) — «التذكرة المكتملة لها عدد طيور وصافٍ.»
- `weigh_tickets_void_check` (status = 'void') = (voided_at is not null) and (void_reason is null or length(btrim(void_reason)) between 1 and 500) — «التذكرة الملغاة لها وقت إلغاء، وسببها حتى 500 حرف.»
- `weigh_tickets_text_check` vehicle/driver null or 1..40 chars = btrim; note null or 1..500 — «رقم السيارة واسم السائق حتى 40 حرفاً، والملاحظة حتى 500 حرف.»
- `weigh_tickets_version_check` version >= 1 — «رقم نسخة التذكرة غير صالح.»
- unique (org_id, ticket_no), unique (org_id, id, site_id); FK (org_id, division_id, site_id) → sites (org_id, division_id, id). Indexes: (org_id, division_id, site_id), (org_id, on_date). Read: org + in_scope_site(site_id).

### 2.3 public.weigh_ticket_stops
id uuid pk (device); ticket_id, site_id, division_id; stop_no int; hall_id; flock_id (the hall's active flock at save); birds int; crates int;
gross_kg numeric (scale: truck gross after this hall; crates: Σ weighings, snapshot); net_kg numeric (snapshot).
- `weigh_ticket_stops_no_check` 1..20 — «ترتيب القاعة في التذكرة من 1 إلى 20.»; `…_birds_check` null or 1..10000000 — «عدد طيور القاعة من 1 إلى 10,000,000.»;
  `…_crates_check` null or 0..100000 — «عدد أقفاص القاعة من صفر إلى 100,000.»; `…_gross_check` null or (> 0, <= 200000, round 3) — «وزن الخابط بالكيلوغرام أكبر من صفر حتى 200,000، بثلاث مراتب عشرية على الأكثر.»;
  `…_net_check` null or (> 0, round 3) — «صافي القاعة أكبر من صفر، بثلاث مراتب عشرية على الأكثر.»
- unique (org_id, ticket_id, stop_no), (org_id, ticket_id, hall_id), (org_id, id, ticket_id); FK (org_id, ticket_id, site_id) → weigh_tickets (org_id, id, site_id);
  (org_id, division_id, site_id, hall_id) → halls; (org_id, flock_id) → flocks. Read: org + in_scope_site(site_id).

### 2.4 public.weigh_ticket_weighings (crate scale only)
id uuid pk (device); ticket_id, stop_id, site_id; weighing_no int; crates int not null; gross_kg numeric not null.
- `…_no_check` 1..2000 — «رقم الوزنة من 1 إلى 2,000.»; `…_crates_check` 1..1000 — «عدد أقفاص الوزنة من 1 إلى 1,000.»; `…_gross_check` > 0, <= 100000, round 3 — «وزن الوزنة بالكيلوغرام أكبر من صفر حتى 100,000، بثلاث مراتب عشرية على الأكثر.»
- unique (org_id, stop_id, weighing_no); FK (org_id, stop_id, ticket_id) → stops (org_id, id, ticket_id); (org_id, ticket_id, site_id) → weigh_tickets. Read: in_scope_site.

### 2.5 public.bird_sales (BR; sales money: salesRestricted + money)
id uuid pk (device); doc_no text not null; ticket_id, site_id, division_id; party_id; book_id; sold_on date not null (= ticket.on_date);
birds int not null; net_kg numeric not null (= ticket totals); unit_price numeric not null (per kg); deduction_pct numeric not null default 0;
billed_kg numeric not null; total numeric not null; paid_now numeric not null default 0; cash_account_id; invoice_entry_id not null;
payment_entry_id; cash_move_id; note; status default 'posted'; version; client_ref not null; posted_at/by; voided_at/by; void_reason.
- `bird_sales_doc_no_check` ~ '^BR-[0-9]{4}-[0-9]{4,}$' — «رقم فاتورة الطيور بصيغة BR-السنة-الرقم.»
- `bird_sales_birds_check` birds 1..10000000 and net_kg > 0 round 3 — «فاتورة الطيور لها عدد طيور من 1 إلى 10,000,000 وصافٍ أكبر من صفر بثلاث مراتب عشرية على الأكثر.»
- `bird_sales_price_check` > 0, <= 1000000000, round 2 — «سعر الكيلو أكبر من صفر، بمرتبتين عشريتين على الأكثر.»
- `bird_sales_deduction_check` between 0 and 10, round 2 — «نسبة التنزيل من 0 إلى 10٪، بمرتبتين عشريتين على الأكثر.»
- `bird_sales_billed_check` > 0, round 3, <= net_kg — «الوزن المحسوب أكبر من صفر ولا يزيد على الصافي، بثلاث مراتب عشرية على الأكثر.»
- `bird_sales_total_check` > 0, round 0 — «مبلغ فاتورة الطيور بالدينار الصحيح أكبر من صفر.»
- `bird_sales_paid_check` 0 <= paid_now <= total, round 0 — «المقبوض الآن بالدينار الصحيح من صفر حتى مبلغ الفاتورة.»
- `bird_sales_payment_check` (paid_now > 0) = (cash_account_id is not null) and (paid_now > 0) = (payment_entry_id is not null) and (payment_entry_id is null) = (cash_move_id is null) — «المقبوض الآن يُسجَّل بصندوقه وقيده وحركته معاً، ولا صندوق بلا مقبوض.»
- `bird_sales_status_check` ('posted','void') — «حالة فاتورة الطيور إمّا مرحَّلة أو ملغاة.»; `bird_sales_void_check` (status='void') = (voided_at is not null) and (voided_at is null) = (void_reason is null) — «الفاتورة الملغاة لها وقت إلغاء وسببه، والمرحَّلة بلا إلغاء.»;
  `bird_sales_void_reason_check` 1..500 — «سبب إلغاء الفاتورة حتى 500 حرف.»; `bird_sales_note_check` 1..500 — «ملاحظة الفاتورة حتى 500 حرف.»; `bird_sales_version_check` — «رقم نسخة الفاتورة غير صالح.»
- unique (org_id, doc_no), (org_id, id, site_id); partial unique `bird_sales_ticket_posted` (org_id, ticket_id) where status = 'posted'.
  FKs: (org_id, ticket_id, site_id) → weigh_tickets (org_id, id, site_id); (org_id, division_id, site_id) → sites; party; book; cash account;
  both entries; cash move. Indexes on each FK + (org_id, sold_on). Read: org + in_scope_site(site_id); restrictive `bird_sales_sales_only` can_see_sales().

### 2.6 public.bird_sale_sources (revenue per flock; salesRestricted + money)
id uuid pk = `private.derived_ref(sale_id, stop_no)`; sale_id, site_id, division_id, stop_id, hall_id, flock_id; birds int; net_kg numeric; revenue numeric.
- `bird_sale_sources_qty_check` birds 1..10000000 and net_kg > 0 round 3 — «سطر الفوج في الفاتورة له طيور وصافٍ أكبر من صفر.»
- `bird_sale_sources_revenue_check` >= 0, round 0 — «حصّة الفوج من الفاتورة بالدينار الصحيح من صفر فأكثر.»
- unique (org_id, sale_id, stop_id); FKs (org_id, sale_id, site_id) → bird_sales (org_id, id, site_id); stop; flock; hall composite. Read: as bird_sales (+ restrictive can_see_sales).

### 2.7 public.flock_closes
id uuid pk (device); flock_id, hall_id, site_id, division_id; closed_on date not null; live_before int not null; count_diff int not null;
count_reason text; sold_birds int not null; sold_net_kg numeric not null; note text; status default 'closed'; client_ref not null;
closed_at default now(); closed_by default auth.uid(); reopened_at; reopened_by; reopen_reason.
- `flock_closes_status_check` ('closed','reopened') — «حالة الإغلاق: مغلقة أو أُعيد فتحها.»
- `flock_closes_counts_check` live_before 0..10000000 and count_diff = -live_before and sold_birds 0..10000000 and sold_net_kg >= 0 round 3 and ((sold_birds = 0) = (sold_net_kg = 0))
  — «أرقام الإغلاق: الحيّ قبله من صفر، وفرق العدّ عكسه، والمباع وصافيه معاً من صفر.»
- `flock_closes_reason_check` (count_diff = 0) = (count_reason is null) and length 1..500 — «فرق العدّ عند الإغلاق له سبب حتى 500 حرف، ولا سبب بلا فرق.»
- `flock_closes_reopen_check` (status = 'reopened') = (reopened_at is not null) and (reopened_at is null) = (reopen_reason is null) and length 1..500 — «إعادة الفتح لها وقت وسبب حتى 500 حرف.»
- `flock_closes_note_check` 1..500 — «ملاحظة الإغلاق حتى 500 حرف.»
- partial unique `flock_closes_one_closed` (org_id, flock_id) where status = 'closed'; FKs flock, hall composite. Read: org + in_scope_site(site_id).

### 2.8 public.flock_close_lines (quantities only; carry state is mutable, written by functions)
id uuid pk = `private.derived_ref(close_id, line_no)`; close_id, flock_id, hall_id, site_id, division_id; line_no int; item_id; action text;
qty_base numeric; base_unit text; density_kg_per_l numeric; piece_mass_kg numeric; cost_kind text; warehouse_id (return only);
carry_status text (carry only); to_flock_id uuid; applied_on date.
- `…_action_check` ('return','consumed','carry') — «مصير الباقي: يرجع إلى مخزن، أو يُحسب مستهلَكاً، أو ينتقل للدورة التالية.»
- `…_qty_check` > 0 round 3 — «كمية الباقي أكبر من صفر، بثلاث مراتب عشرية على الأكثر.»; `…_unit_check` kg|L|pc, pc whole — «وحدة الباقي كيلوغرام أو لتر أو قطعة، والقطع عدد صحيح.»
- `…_density_check` / `…_piece_mass_check` exactly as flock_issue_lines — «كثافة سطر الباقي للمادّة باللتر فقط، رقم أكبر من صفر بأربع مراتب عشرية على الأكثر.» / «وزن القطعة في سطر الباقي للمادّة بالقطعة فقط، رقم أكبر من صفر بثلاث مراتب عشرية على الأكثر.»
- `…_cost_kind_check` ('feed','medicine','vaccine','fuel','other') — «نوع كلفة سطر الباقي غير معروف.»; `…_line_no_check` 1..100 — «رقم سطر الباقي من 1 إلى 100.»
- `…_shape_check` (action = 'return') = (warehouse_id is not null) and (action = 'carry') = (carry_status is not null) — «الإرجاع له مخزن، والنقل له حالة، والمستهلَك بلا مخزن ولا حالة.»
- `…_carry_check` carry_status is null or (carry_status in ('pending','applied','returned','void') and (carry_status = 'applied') = (to_flock_id is not null) and (to_flock_id is null) = (applied_on is null))
  — «النقل المطبَّق له فوج جديد ويوم تطبيق، وغيره بلاهما.»
- unique (org_id, close_id, line_no), (org_id, close_id, item_id) (one line per item, D7). FKs close, item, warehouse, to_flock, hall composite.
  Indexes on FKs + partial `flock_close_lines_pending` (org_id, hall_id) where carry_status = 'pending'. Read: org + in_scope_site(site_id).

### 2.9 public.flock_returns + public.flock_return_lines (FR stock document; no money)
flock_returns: id uuid pk (close: `private.derived_ref(close_id, 100 + line_no)`; carry return: device id); doc_no text not null; flock_id, hall_id,
site_id, division_id; warehouse_id; returned_on date not null; source text ('close'|'carry'); close_id; close_line_id; status default 'posted';
version; client_ref; posted_at/by; voided_at/by; void_reason.
- `flock_returns_doc_no_check` ~ '^FR-[0-9]{4}-[0-9]{4,}$' — «رقم الإرجاع من القاعة بصيغة FR-السنة-الرقم.»; `…_source_check` — «مصدر الإرجاع: إغلاق الدورة أو العلف المنقول.»;
  `…_status_check` ('posted','void') — «حالة الإرجاع إمّا مرحَّل أو ملغى.»; `…_void_check` (as flock_issues, reason 1..500) — «الإرجاع الملغى له وقت إلغاء وسببه حتى 500 حرف.»; `…_version_check`.
- unique (org_id, doc_no), (org_id, close_line_id), (org_id, id, warehouse_id, site_id). FKs flock, hall composite, warehouse, (org_id, close_id) → flock_closes, (org_id, close_line_id) → flock_close_lines.
flock_return_lines: id uuid pk (derived_ref(return_id, 1)); return_id, warehouse_id, site_id; line_no (= 1); item_id; qty_base; base_unit;
density_kg_per_l; piece_mass_kg; cost_kind; lot_id uuid not null (the new lot). Checks copy flock_issue_lines' (names `flock_return_lines_*`,
sentences «… الإرجاع …»). unique (org_id, return_id, line_no), (org_id, lot_id); FKs (org_id, return_id, warehouse_id, site_id) → flock_returns, item, (org_id, lot_id) → stock_lots.
Read (both): org + (in_scope_site(site_id) or in_scope_wh(warehouse_id)) — like flock_issues.

### 2.10 public.flock_close_values (costRestricted; FOUNDATION ٣٩٢)
id pk; close_id unique; flock_id; site_id; cost_total numeric (Σ flock_costs of the flock right after the close); returned_value; carried_value; revenue (Σ posted source revenue).
- `flock_close_values_amounts_check` all finite; cost_total round 2; returned/carried >= 0 round 2; revenue >= 0 round 0 — «قيم لقطة الإغلاق أرقام محدودة: الكلف بمرتبتين، والإيراد بالدينار الصحيح، والراجع والمنقول من صفر.»
- No profit column (owner: profit after chick cost). Read: org + in_scope_site(site_id); restrictive `flock_close_values_cost_only` can_see_cost().

### 2.11 Audit and classes
- Restrictive `audit_log_birds_scope`: table_name in (the 9 site tables) → in_scope_site(site_id); in ('flock_returns','flock_return_lines') → in_scope_site or in_scope_wh; else true.
- supabase/tests/classes.json: functionOnly += all 11; appendOnly += flock_counts; costRestricted += flock_close_values; salesRestricted += bird_sales,
  bird_sale_sources; money += bird_sales, bird_sale_sources; remove flock_counts and flock_close_values from `reserved`.

## 3. Helpers (private, revoke all from public/anon/authenticated)
- `flock_counts_total(p_flock uuid) returns bigint` Σ birds (all rows). `flock_live(f flocks) returns bigint` = placed − Σ(dead+culled) + counts_total.
- `flock_count_days(p_flock uuid) returns table (on_date date, sold int, sold_kg numeric, adjust int)` — live originals grouped by date (sold as a positive count, sold_kg Σ net_kg).
- `flock_live_check(f flocks) returns void` — per date: delta = −Σ(dead+culled) + Σ live-original birds, AGGREGATED PER DATE first, then running
  `placed + Σ delta` by date; first date < 0 → `live_negative` «بهذا يصير عدد الطيور الحيّة في «%s» سالباً يوم %s (%s). راجع النافق والمستبعد والمباع وفرق العدّ لذلك اليوم وما قبله.»
- `flock_item_lots(p_flock uuid, p_item uuid) returns table (lot_id, warehouse_id, issued_on, posted_at)` — original negative moves of POSTED flock_issue
  docs of this flock and item, recursively through applied carry-ins (`with recursive`: carry line to_flock = X, carry_status 'applied' → its close's
  flock; depth < 20).
- `flock_item_pool(p_flock uuid) returns table (item_id, qty, value, base_unit, units_count, density, piece_mass, kg, carry_in_qty)` per item with a positive pool:
  qty = Σ posted issue lines qty + Σ applied carry-in qty − Σ posted FR lines of source 'close' − Σ non-void carry lines of this flock (a carry
  later returned stays a carry here: its FR of source 'carry' is NOT subtracted again); before a close the last two are 0 (after a reopen they are void);
  value = Σ flock_costs.amount of this flock whose line (issue line / close line / FR line by doc_line_id) has this item (originals and reversals; voids net 0;
  a returned carry nets to −v: carry-out −v, its reversal +v, the FR −v);
  density/piece_mass from the most recent pool line (D10); kg = Σ issue_mass_kg (null if any line is unweighed); units_count = distinct base units.
- `return_lot(p_item, p_wh, p_received date, p_fifo_seq bigint, p_expiry date, p_qty, p_value, p_return uuid, p_line uuid) returns stock_lots` — inserts like
  new_lot but with the GIVEN fifo_seq and expiry, source_kind 'flock_return', origin/source lot null, born_at null, qty/value_left 0 (apply_move adds).
- `flock_return_post(...) returns uuid` — the shared core of a return (close and carry): FR header + line (FR number from `next_doc_no('FR', on)`),
  `return_lot` with min(fifo_seq) and min(expiry_on) (nulls ignored) of `flock_item_lots(flock, item)`, `apply_move(lot, 'flock_return', return, line, +q, +v, on, null)`,
  flock_costs (flock, site, kind = cost_kind, −v, 'flock_return', return, line, on). Callers hold all locks (balances locked) before calling.
- `division_main_book(p_division) returns uuid` — main book or `no_sales_book` «لا دفتر لوحدة «%s»، فلا تُصدر فيها فاتورة طيور.»
- `ticket_nets(p_ticket)` → per stop (stop_id, stop_no, prev_gross, crates_kg, net_kg, problem). scale: prev(1) = empty_kg, prev(i) = gross(i−1);
  crates_kg = 0 if empty_with_crates else crates × crate_kg; net = gross − prev − crates_kg. crates: crates := Σ weighings.crates, gross := Σ weighings.gross,
  net = gross − crates × crate_kg. Any missing input → net null + problem text.
- `weigh_ticket_json(p_ticket)`, `bird_sale_result(p_sale)`, `flock_close_result(p_close)` (§5 shapes), `flock_activity_after(f, p_on) returns text`
  (first activity dated after p_on, named for the hint: round / weight / FI no / log / vaccine / BR no / count difference).

## 4. Writers (all `grant execute to authenticated`, allowlist.json)

### 4.1 public.save_weigh_ticket(p_ticket uuid, p_expected_version int, p_data jsonb) returns jsonb — weigh_ticket.draft
No client_ref: a conditional write replayable by content. p_data: {site_id, on_date, method, empty_kg, empty_with_crates, crate_kg, vehicle, driver,
note, stops: [{id, hall_id, birds, crates, gross_kg, weighings: [{id, crates, gross_kg}]}]} (stops in loading order; numerics as text).
1. require; `id_required` «تعذّر الحفظ دون معرّف التذكرة. حدّث الشاشة وأعد المحاولة.»; `bad_ticket` «بيانات التذكرة غير صالحة. حدّث الشاشة وأعد المحاولة.»; normalize to the canonical content.
2. advisory lock 'weigh_ticket:'||id. Site: `site_not_found` «هذا الحقل غير موجود في منشأتك. حدّث الشاشة.»; `out_of_scope` «هذا الحقل خارج نطاقك، فلا تكتب تذكرة لقاعاته. اطلب من مالك المنشأة إضافته إلى نطاقك.»;
   `site_not_broiler` «تذكرة الوزن لحقول اللحم في هذه النسخة؛ بيع الدجاج المستبعد يأتي لاحقاً.»; `site_archived` «الحقل مؤرشف، فلا تُكتب فيه تذكرة.».
3. Existing row x: none and version not null → `ticket_not_found` «هذه التذكرة غير موجودة في منشأتك. حدّث الشاشة.»; other org → `id_conflict`;
   lock x for update; x.status <> 'draft' → `ticket_not_draft` «التذكرة %s اكتملت أو أُلغيت، فلا تُعدَّل. ألغِها وأنشئ غيرها إن كانت خاطئة.»;
   site differs → `site_fixed` «حقل التذكرة لا يتغيّر بعد إنشائها. أنشئ تذكرة جديدة.»; content(x) = payload → {status:'saved'} without writing;
   version null or ≠ x.version → RETURN {status:'stale', server: <ticket>} (no write, no error — like stale_day).
4. Under the lock: on_date not null / not future (`date_required`, `date_in_future`; the 7-day rule at finish); ≤ 20 stops (`too_many_stops` «التذكرة الواحدة حتى 20 قاعة.»);
   `duplicate_hall` «القاعة «%s» مكرّرة في التذكرة.»; stop/weighing ids used elsewhere → `id_conflict`; halls in the site (`hall_other_site` «القاعة «%s» ليست في حقل هذه التذكرة.»),
   not archived (`hall_archived` «القاعة «%s» مؤرشفة، فلا تُحمَّل منها طيور.»); the halls' live flocks locked FOR SHARE in id order; each hall has an active broiler flock (`no_active_flock`
   «لا فوج قائم في «%s»، فلا تُحمَّل منها طيور.») placed on or before on_date (`before_placement`); bounds (`bad_weight` «الوزن بالكيلوغرام أكبر من صفر…»,
   `bad_count` «عدد الطيور عدد صحيح من 1 إلى 10,000,000.»); method fields (`bad_method` «اختر طريقة الوزن: القبّان أو ميزان الأقفاص.»);
   where both are known: gross > prev (`gross_not_rising` «وزن الخابط بعد «%s» (%s) لا يزيد على الذي قبله (%s). راجع الوزن.») and net > 0
   (`net_not_positive` «صافي «%s» = %s كغم، وهو ليس أكبر من صفر. راجع الأوزان وعدد الأقفاص.»).
5. Upsert header (version = old + 1), stops by id (stop_no = order, flock_id snapshot), weighings by id; delete removed stops/weighings (draft only);
   snapshots: stop gross (crates) and net, header birds/crates/net (null while any stop is incomplete). Return {status:'saved', ticket: <weigh_ticket()>}.

### 4.2 public.finish_weigh_ticket(p_client_ref uuid, p_ticket uuid, p_expected_version int) returns jsonb — weigh_ticket.draft
ref_claim; cached and the ticket now void → `id_conflict` «اكتملت هذه التذكرة ثمّ أُلغيت. أنشئ تذكرة جديدة.». Locks: period_guard → ticket for update →
flocks FOR SHARE (id order) → counter. Checks: scope; status draft else `ticket_not_draft` (names its WT); `stale_ticket` «تغيّرت التذكرة منذ فتحتها. حدّث الشاشة وراجعها ثمّ أعد المحاولة.»;
`check_doc_date(on_date)`; completeness `ticket_incomplete` «أكمل التذكرة قبل إنهائها: %s.» (first missing: «وزن الفارغ»، «وزن القفص»، «عدد طيور قاعة …»،
«عدد أقفاص قاعة …»، «وزن الخابط بعد قاعة …»، «وزنات قاعة …»); nets as 4.1; average per stop 0.3..6 kg via `net >= 0.3 × birds and net <= 6 × birds`
(`avg_out_of_range` «معدّل الطير في «%s» = %s كغم (%s كغم ÷ %s طير)، وهو خارج المعقول (0.3 إلى 6 كغم). راجع العدد أو الوزن.»); flocks still active broiler in
their halls; placed_on ≤ on_date. Writes: ticket_no = `next_doc_no('WT', on_date)` LAST, status 'done', finished_at/by, version + 1. Live does NOT change (O1).
Output: weigh_ticket() incl. `warnings` (per stop: birds > live − birds on other uninvoiced tickets).

### 4.3 public.void_weigh_ticket(p_ticket uuid, p_reason text, p_client_ref uuid) returns jsonb
ref_claim; scope. Draft: `weigh_ticket.draft`, reason optional (≤ 500). Done: `void` + `check_reason`; posted invoice → `ticket_invoiced`
«للتذكرة %s فاتورة مرحّلة %s: ألغِ الفاتورة أوّلاً.». Lock the ticket for update (re-check; `already_void` «التذكرة ملغاة من قبل.»). status 'void', version + 1. Output {id, ticket_no, status}.

### 4.4 public.record_bird_sale(p_client_ref uuid, p_sale_id uuid, p_ticket uuid, p_ticket_version int, p_party uuid, p_unit_price numeric,
p_deduction_pct numeric, p_paid_now numeric, p_cash_account uuid, p_note text) returns jsonb — sale.post (accountant, manager, owner)
1. ref_claim (all args); cached and the sale now void → `id_conflict` «سُجّلت هذه الفاتورة ثمّ أُلغيت. أصدر فاتورة جديدة للتذكرة.»
2. `id_required`; advisory lock 'bird_sale:'||id; existing posted with the same content by the same user → result (store under this ref); else `id_conflict`.
3. Inputs: `bad_price`; pct null → 0, `bad_deduction` «نسبة التنزيل من 0 إلى 10٪، بمرتبتين عشريتين على الأكثر.»; paid null → 0, `bad_paid` «المقبوض الآن مبلغ بالدينار الصحيح من صفر فأكثر.»;
   paid > 0 without box → `cash_account_required` «اختر الصندوق الذي قبضت فيه.»; box without paid → `bad_payment` «بلا مبلغ مقبوض لا يُختار صندوق.»; `bad_note`.
4. Ticket (no lock yet): `ticket_not_found`, `out_of_scope`, status done else `ticket_not_done` (draft: «التذكرة لم تكتمل بعد: أكملها ثمّ أصدر فاتورتها.»; void: «التذكرة ملغاة، فلا تُصدر لها فاتورة.»).
   Party `party_for_post` (archived refused by write_entry). Book = `book_for_post(division_main_book(ticket.division))`.
5. billed = `_mul_div_round(net, 100 − pct, 100, 3)`; total = `_mul_div_round(billed, price, 1, 0)`; `total_zero`; paid > total → `paid_over_total` «المقبوض الآن (%s) أكثر من مبلغ الفاتورة (%s).».
6. Locks: lock_parties([party]) → check_post_date(ticket.on_date, division) → ticket for update (re-check done, version `stale_ticket`, posted invoice
   → `ticket_invoiced` «صدرت للتذكرة %s فاتورة %s من قبل.») → stop flocks FOR UPDATE (id order) → lock_cash_account (if paid) → `next_doc_no('BR', sold_on)` LAST.
7. Under the flock locks, per flock: active (`flock_closed` «فوج «%s» مغلق، فلا تُصدر فاتورة لطيوره. أعد فتح الدورة أوّلاً إن كان الإغلاق خطأ.»), still in its hall,
   broiler, placed_on ≤ sold_on; flock_live(f) ≥ Σ birds of its stops else `birds_over_live` «في «%s» بحسب النظام %s طيراً حيّاً، وفي التذكرة %s. إن كان العدد الفعليّ
   أكبر فليسجّل المدير «فرق العدّ» بتاريخ %s أو قبله، ثمّ أصدر الفاتورة.».
8. Writes: invoice entry +total ('invoice', 'bird_sale', id, BR, sold_on); if paid: payment −paid, `allocate_entry(pay, inv)`, cash move 'party_payment' +paid
   (doc 'bird_sale', party_entry_id = pay); `allocate_entry(inv, null)`; bird_sales row; sources per stop (revenue = `alloc_lr(total, nets in stop order, 0)`);
   flock_counts per source (kind 'sold', birds = −stop.birds, net_kg = +stop.net, doc 'bird_sale', doc_line_id = source, on_date = sold_on);
   `mark_division_posted`; then `flock_live_check` per flock. Output: bird_sale_result (§5.5).

### 4.5 public.void_bird_sale(p_sale_id uuid, p_reason text, p_client_ref uuid) returns jsonb — void
ref_claim; check_reason; `doc_not_found`; scope; book_for_post; lock_parties; check_void_date; sale for update (`already_void`); flocks FOR UPDATE (id order),
any closed → `flock_closed` «فوج «%s» مغلق، فلا تُلغى فاتورة بيع طيوره. أعد فتح الدورة أوّلاً.». `void_entry(invoice)`; the payment entry and cash move
stay as the trader's credit (D:595); each sold count row reversed (birds +, net −, reverses_id, on_date = today). status void, version + 1; the ticket
stays 'done' (invoiceable again). Output {id, doc_no, status:'void', voided_on, party_id, payment_entry_id (if kept), money:{total, payment_kept}}.

### 4.6 public.record_flock_count_adjust(p_client_ref uuid, p_id uuid, p_flock uuid, p_on date, p_birds int, p_reason text, p_expected_live int) returns jsonb — flock.manage
ref_claim; advisory 'flock_count:'||id (same content → result); `bad_birds` «فرق العدّ عدد صحيح غير الصفر، لا يزيد مقداره على 10,000,000.»; check_reason;
`flock_for(p_flock, true)`; check_doc_date(p_on); `before_placement`. Locks: period_guard → flock for update. `live_changed` «تغيّر عدد الطيور الحيّة منذ فتحت الشاشة: كان %s وصار %s. راجع الأرقام وأعد المحاولة.».
Insert (id = doc_id = p_id, kind 'count_adjust', doc 'count_adjust'); flock_live_check. Output {id, flock_id, on_date, birds, live_after}.

### 4.7 public.close_flock(p_client_ref uuid, p_close_id uuid, p_flock uuid, p_on date, p_expected_live int, p_expected_sold int,
p_expected_pools jsonb, p_count_reason text, p_lines jsonb, p_note text) returns jsonb — flock.manage
p_expected_pools: [{item_id, qty}] (every item with a pool the screen showed); p_lines: 0..100 of {item_id, qty, action, warehouse_id?} (one per item).
1. ref_claim; cached and the close now reopened → `id_conflict` «أُغلقت هذه الدورة بهذا الطلب ثمّ أُعيد فتحها. أغلقها من جديد من صفحة الفوج.»; `id_required`;
   advisory 'flock_close:'||id; existing → same content → result, else `id_conflict`.
2. Inputs: `date_required` + `check_doc_date(p_on)`; lines shape `bad_lines` «سطور الباقي غير صالحة. حدّث الشاشة وأعد المحاولة.», `too_many_lines`, `bad_action`
   «اختر لكلّ مادّة باقية: يرجع إلى مخزن، أو يُحسب مستهلَكاً، أو ينتقل للدورة التالية.», `qty_not_positive`, `pieces_not_whole`, `duplicate_line` ««%s» مكرّرة. لكلّ مادّة مصير واحد.»,
   `store_required` «اختر المخزن الذي يرجع إليه «%s».», `store_not_allowed` «المخزن لسطر الإرجاع وحده.»; reasons/note ≤ 500 (`bad_reason`, `bad_note`).
3. `flock_for(p_flock, true)`; kind broiler else `close_layer_later` «إغلاق دورة البيّاض يأتي مع بيع الدجاج المستبعد.»; `before_placement`.
4. Locks: check_post_date(p_on, flock division) and each return store's division (id order) → hall FOR SHARE → flock FOR UPDATE (re-check active;
   `flock_closed` «الدورة مغلقة من قبل يوم %s.») → lock_masters(return stores, all line items, true) → lock_balances(return pairs) → FR counters last (line order).
5. Under the flock lock:
   - `activity_after_close` «سُجّل على الفوج %s يوم %s، بعد يوم الإغلاق %s. اختر يوم الإغلاق في آخر يوم سُجّل فيه شيء أو بعده.» (rounds, weights, posted FI,
     logs, done vaccinations, live count originals dated > p_on).
   - `tickets_pending` «تذاكر وزن بلا فاتورة لهذه القاعة: %s. تُصدر فواتيرها أو تُلغى قبل إغلاق الدورة.» (non-void tickets with a stop on this flock and no posted invoice).
   - live = flock_live(f); ≠ p_expected_live → `live_changed`; sold = Σ live sold originals; ≠ p_expected_sold → `sales_changed` «تغيّر المباع منذ فتحت الشاشة:
     كان %s طيراً وصار %s. راجع الفواتير وأعد الإغلاق.»; live > 0 and no reason → `count_reason_required` «في القاعة بحسب النظام %s طيراً لم تُبَع ولم تُسجَّل
     نافقة. اكتب سبب «فرق العدّ» ليُكتب مع الإغلاق.» (live = 0: a given reason is ignored).
   - pools = flock_item_pool(f): any difference with p_expected_pools (missing item, extra item, other qty) → `pool_changed` «تغيّر ما نزل للقاعة منذ فتحت الشاشة
     («%s»: كان %s وصار %s). حدّث الشاشة وراجع الباقي.»; per line: item in pools else `not_in_pool` «لم يُصرف «%s» لهذه القاعة في هذه الدورة.»;
     `pool_unit_mixed` «وحدة «%s» تغيّرت بين ما نزل للقاعة، فلا يُحسب باقيها. راجع المادّة.» (units_count > 1 or ≠ item.base_unit);
     qty ≤ pool qty else `over_pool` «الباقي المكتوب من «%s» (%s) أكثر ممّا نزل للقاعة (%s).».
   - return: store ∈ distinct warehouses of flock_item_lots(f, item) else `not_from_store` ««%s» لم يأتِ إلى هذه القاعة من «%s». اختر مخزناً جاء منه: %s.»;
     store in scope (`out_of_scope`), admissible (`item_kind_mismatch`); archived refused by lock_masters.
6. Values (rule 16, 0007:904-923 style): per item, running pool (Q, V) = pool; the item's return or carry line: v = V when q = Q, else `_mul_div_round2(q, V, Q)`.
   Consumed lines move no value (they stay in the flock's cost). So "everything leaves" leaves at exactly V.
7. Writes, in order: flocks.status 'closed', closed_on = p_on, close_note = p_note, version + 1; flock_closes; if live > 0 a count row (count_adjust, birds = −live,
   doc 'flock_close', on_date = p_on, reason); close lines (derived ids; snapshots D10; carry_status 'pending' for carry); per return line
   `flock_return_post(...source 'close', on = p_on)`; per carry line flock_costs (−v, kind = cost_kind, 'flock_carry', doc = close, doc_line = line, on = p_on);
   flock_close_values (cost_total after these rows, returned/carried values, revenue = Σ posted source revenue of this flock); mark_division_posted(store divisions);
   flock_live_check (live is 0 now). Output: flock_close_result (§5.6, values inside 'money').

### 4.8 public.reopen_flock(p_close_id uuid, p_reason text, p_client_ref uuid) returns jsonb — flock.manage AND void
ref_claim; check_reason; `close_not_found` «هذا الإغلاق غير موجود في منشأتك. حدّث الشاشة.»; scope. Locks: check_void_date → hall FOR UPDATE → flock FOR UPDATE →
close row for update (`already_reopened` «أُعيد فتح هذه الدورة من قبل.») → masters (false) → balances of its FR lines → FR lots for no key update.
Refusals: a later flock in the hall (any flock of the hall ≠ this with placed_on ≥ closed_on, or any preparing/active) → `hall_reused` «سُكّن في «%s» فوج
جديد يوم %s بعد هذه الدورة، فلا يُعاد فتحها.»; any carry line not 'pending' → `carry_used` «العلف المنقول «%s» %s، فلا يُعاد فتح الدورة.» («نُقل إلى الفوج الجديد يوم …»
or «أُرجع إلى «…» بالمستند FR-…»); each FR lot `check_lot_intact` (`lot_consumed` names the drawing document); reversals pass apply_move's guards (`count_superseded`).
Writes (dated today): reverse each FR move on its lot, FR status 'void' (void_reason = reason), reverse each 'flock_return' and 'flock_carry' cost row of the
close, carry lines → 'void', reverse the close's count row; close status 'reopened'; flock active, closed_on null, close_note null, version + 1.
Invoices stay posted. Output {close_id, flock_id, status:'reopened', reversed_returns, reversed_count, money:{returned_value, carried_value}}.

### 4.9 public.return_hall_carry(p_client_ref uuid, p_return_id uuid, p_line uuid, p_warehouse uuid) returns jsonb — flock.manage
ref_claim; advisory 'flock_return:'||p_return_id (same content → result). Line: action 'carry' of a 'closed' close else `carry_not_found`
«هذا العلف المنقول غير موجود. حدّث الشاشة.»; hall scope; store `stock_wh(p_warehouse, true)`; `store_required`. Locks: check_post_date(today, store division)
→ hall FOR UPDATE (serialises with open_flock) → line for update (`carry_not_pending` «العلف المنقول «%s» %s.») → masters → balances → FR counter.
Store ∈ warehouses of flock_item_lots(closed flock, item) else `not_from_store`; admissible. v = −(its carry-out row). Writes: flock_costs on the CLOSED flock:
reversal of the carry-out (+v, reverses_id) and, through `flock_return_post(source 'carry', on = today)`, the −v return row, lot and move (smallest
fifo_seq / nearest expiry of the closed flock's lots of that item); line → 'returned'. The closed flock's total cost is unchanged. Output {return_id, doc_no, line_id, money:{value}}.

### 4.10 Changed writers (latest bodies + these deltas)
- `public.open_flock` (0012:379; signature unchanged): under its hall lock, after `hall_busy`: `before_last_close` «آخر دورة في «%s» أُغلقت يوم %s، فلا يُسكَّن فوج في
  يومها أو قبله.» when p_placed_on <= max(closed_on) of the hall's closed flocks (0027 review N3: halls_day shows ONE flock per hall per day, so a close and a
  placement must never share a day — otherwise the closing flock's last round drops out of that day's report and totals); after inserting the flock, each pending carry line of the hall (close 'closed', line_no order):
  flock_costs (new flock, +v = −carry-out, kind = cost_kind, 'flock_carry', doc = close, doc_line = line, on = p_placed_on), line → 'applied', to_flock_id, applied_on = p_placed_on.
  Result adds `carried_in: [{line_id, item_id, name, qty, base_unit}]` (new key).
- `public.save_flock_day` (0012:448): live guard (0012:592-597) = placed − others + flock_counts_total; eggs window (0012:599-613) live_start adds live
  count originals before each date; after the insert/update `flock_live_check(f)` (raises, so nothing is kept).
- `public.remove_flock_log` (0026:584) and the unlinked path of `public.undo_vaccination` (0026:605): `perform 1 from flocks … for share` before `flock_for(…, true)`
  (closes the race with close_flock, map2 close §2).
- `private.halls_check` (0012:180): archiving a hall with a pending carry → `hall_has_carry` «في القاعة «%s» علف منقول للدورة التالية، فلا تُؤرشف قبل أن يُرجَع إلى مخزن.»
- P1 (only if time allows): `public.decide_flock_day_reject(p_id, p_decision, p_reason, p_client_ref)` (F:580) — closes make `flock_closed` parks routine.

## 5. New readers (stable, `require('read')`, scope by site; no money unless stated)
5.1 `weigh_ticket(p_ticket)`: { id, ticket_no, status, version, site_id, site_name, division_id, on_date, method, empty_kg, empty_with_crates, crate_kg, vehicle,
driver, note, birds, crates, gross_kg (scale: last stop gross), net_kg, avg_kg, stops: [{id, stop_no, hall_id, hall_name, flock_id, flock_status, birds, crates,
gross_kg, prev_gross_kg, crates_kg, net_kg, avg_kg, live (now), other_ticketed, weighings:[{id, weighing_no, crates, gross_kg}]}], invoiced (bool), sale: null|{id, doc_no,
status} (can_see_sales only), created_by_name, finished_at, voided_at, void_reason, can:{edit, finish, void, invoice}, warnings:[{stop_id, hall_name, birds, live, other_ticketed}] }.
avg_kg = `_mul_div_round(net, 1, birds, 3)`.
5.2 `weigh_ticket_options(p_site)`: p_site null → {sites:[{site_id, name, halls_with_flock}]}; else {site, today, earliest_on (greatest(today−7, lock+1)),
last_crate_kg (latest done ticket of the org with crate_kg), halls:[{hall_id, name, flock: null|{id, placed_on, age, live, ticketed}}], can_create}.
5.3 `weigh_tickets(p_from, p_to, p_status)`: p_status in ('all','draft','done','awaiting','void') else `bad_status`; both dates null = no date filter, one null or
from > to → `period_required`. rows (on_date desc, cap 500, more): {id, ticket_no, status, on_date, site_id, site_name, birds, net_kg, halls:[names], invoiced,
sale (sales roles)}; totals {count, birds, net_kg} (non-void); can_create. 'awaiting' = done without a posted invoice.
5.4 `bird_sale_form(p_ticket)` (forbidden unless can_see_sales): {ticket (5.1 without can), invoiceable, why ('draft'|'void'|'invoiced'|'flock_closed'|'no_book'|null),
book {id, name}, flocks [{stop_id, hall_name, flock_id, live, birds, over_live}], suggested_price (last posted BR price, text|null), sale (posted one, if any), today, can_post}.
5.5 `bird_sale_detail(p_sale)` (forbidden unless can_see_sales) = bird_sale_result + {ticket:{ticket_no, vehicle, driver, method}, party_phone, remaining (invoice
entry remaining), payment_kept (void), can_void (void and posted and no flock closed)}. bird_sale_result: {id, doc_no, status, sold_on, ticket_id, ticket_no,
site_id, site_name, party_id, party_name, book_id, birds, net_kg, billed_kg, deduction_pct, avg_kg, cash_account_id, account_name, note, voided_at, void_reason,
sources:[{stop_id, flock_id, hall_id, hall_name, birds, net_kg, avg_kg, money:{revenue}}], money:{unit_price, total, paid_now}}. Amounts visible to sales roles (not masked: no cost inside).
5.6 `flock_close_form(p_flock)`: {flock (hall_flock_json + live, dead, culled, count_diff so far, age), today, earliest_on (greatest(today−7, lock+1, placed_on,
last_activity_on)), default_on (greatest(last sold_on, last_activity_on) ≤ today), sales:{birds, net_kg, avg_kg, invoices:[{sold_on, birds, net_kg, ticket_no, doc_no (sales roles)}]},
pending_tickets:[{ticket_id, ticket_no|null, status, on_date, birds}], feed:{given_kg, eaten_kg, estimate_left_kg, feed_days, feed_span, unweighed},
items:[{item_id, name, kind, cost_kind, base_unit, pool_qty, pool_kg|null, carry_in_qty, stores:[{warehouse_id, name, usable, why ('archived'|'out_of_scope'|null),
last_on}], default_store, money:{pool_value}}], carry_in:[…], can_close, why_not}. flock_close_result: {id, flock_id, hall_id, hall_name, status, closed_on, live_before,
count_diff, count_reason, sold_birds, sold_net_kg, note, lines:[{line_id, line_no, item_id, item_name, action, qty, base_unit, kg, warehouse_id, warehouse_name, return_id,
return_doc_no, carry_status, to_flock_id, applied_on, money:{value}}], money:{cost_total, returned_value, carried_value, revenue}} (private.mask).
5.7 `flock_sales(p_flock)` (FlockCard): {flock_id, status, kind, live, sold_birds, sold_net_kg, count_diff, ticketed, tickets:[{id, ticket_no, status, on_date, birds, invoiced}]
(20 newest non-void), close: null|{id, closed_on, status}, can:{ticket, adjust, close, reopen}}.

## 6. Changed readers (bodies from the latest version; existing keys keep shape; new keys only)
Live-count sites (map2 sales §2 + 0027): (1) flock_summary v_live 0012:350 and (2) v_live_start 0012:351; (3) save_flock_day guard 0012:593; (4) its eggs window
0012:601; (5) flock_detail days 0012:740; (6) verify_flocks.live_negative 0012:756; (7) verify_flocks.eggs_over_live 0012:797; (8) flock_cycle_report birds
(0026:1027 → 0027:310); plus 0027's (9) private.report_days and (10) public.flock_cycles. Rule: live = placed − Σ(dead + culled) + Σ counts; a DAY's
live_start(D) adds live count originals with on_date < D, live_end(D) = live_start − dead − culled − sold(D) + adjust(D).
FCR (flock_summary and report_days, same rule): den_g = (live_end > 0 ? live_end × last_avg_g : 0) + sold_cum_kg × 1000; fcr = `_mul_div_round(feed_cum, 1000, den_g, 3)`
when feed_days > 0 and = feed_span and feed_cum > 0 and den_g > 0 and (live_end = 0 or a weight exists); identical to 0012/0027 while nothing is sold.
- `private.flock_summary`: + keys sold_birds, sold_net_kg, count_diff, ticketed_birds, closed_on. (flocks_overview body unchanged.)
- `public.flock_detail`: days live with counts; per round row + sold, count_diff (counts of that date).
- `private.report_days` (0027): new output columns ⇒ `drop function private.report_days(public.flocks, date)` and re-create (SQL bodies hold no dependency;
  re-create report_day and flock_cycle_report after it). Adds per day: sold, sold_kg, sold_cum, sold_cum_kg, adjust, adjust_cum, carry_in_kg (feed lines applied that
  day), out_kg / out_unweighed (feed return + carry lines of the closed close on closed_on); given_kg(D) = issues + carry-in; feed_left = given_cum − out_cum − eaten_cum. Keep 0027's unweighed counts (review N1, «تُعدّ ولا تختفي»):
  given_unweighed(D) counts issue AND carry-in lines without mass, given_cum_unweighed is its running sum, and out_unweighed / out_cum_unweighed likewise.
- `public.halls_day` keeps 0027's p_on null = the server's current day (review round 4; the screen sends null while following «اليوم»).
- `private.report_day` / `public.halls_day` / `private.halls_day_totals` (0027): flock + sold, sold_net_kg, count_diff, ticketed (birds on uninvoiced non-void tickets dated D),
  feed_carry_in_kg, feed_out_kg, feed_out_unweighed, feed_out_cum_unweighed (0027's feed_given_unweighed / feed_given_cum_unweighed keep their meaning, carry-in included); hall + `carry` (halls with no flock on D: lines of a 'closed' close with closed_on ≤ D < coalesce(applied_on, its FR returned_on, ∞):
  [{line_id, item_id, name, qty, base_unit, kg, closed_on, from_flock_id}]); totals + sold, count_diff, ticketed.
- `public.flock_cycle_report` (0027 body): birds.live with counts; birds + sold, sold_net_kg, count_diff, count_reason; days + the report_days keys; kpis + sold_birds,
  sold_net_kg, sold_avg_kg, sale_age (`_mul_div_round(Σ birds×age at sold_on, 1, Σ birds, 1)`), count_diff, feed_carry_in_kg, feed_out_kg, feed_net_kg (null if any line
  unweighed), fcr_final (closed only: `_mul_div_round(feed_net_kg, 1, sold_net_kg, 3)`), epef_final (`_mul_div_round(livability × sold_avg_g, 1, 10 × sale_age × fcr_final, 0)`,
  all inputs > 0); new keys sales {tickets:[{ticket_id, ticket_no, status, on_date, birds, net_kg, avg_kg, invoiced, doc_no (sales roles)}], birds, net_kg, avg_kg, pending_birds},
  close (flock_close_result without money; pending carry lines carry `stores`), carry_in [...]; money + revenue, returned, carried_in, carried_out. Existing money keys now net of returns/carries (same meaning: the flock's cost).
- `public.flock_cycles` (0027): live with counts; + sold_birds, count_diff.
- `public.flock_month` (0026:905): `can.undo_issue = v_active and can('void')`; day + sold, count_diff, out [{kind, doc_no, name, qty, base_unit, kg}] on closed_on, carry_in on placed_on.
- `public.flock_feed` (0019:651): + carry_in_feed_kg, out_feed_kg, net_feed_kg.
- `private.stock_doc_memo` / `stock_doc_label` (0021 bodies): 'flock_return' → memo «إرجاع من %s (%s) عند إغلاق الدورة» (source close) / «إرجاع علف منقول من %s (%s)» (carry); label = FR doc_no.
- `private.cash_class` (0024:25): `party_payment` with doc_kind in ('sale','bird_sale') → 'cash_sale'.
- `private.entry_detail` (0024:93): doc_kind 'bird_sale': invoice → {type:'bird_sale', doc_id, doc_no, status, sold_on, site:{id,name}, ticket_no, birds, net_kg, deduction_pct,
  billed_kg, unit_price, total, paid_now, account}; payment → {type:'bird_sale_payment', doc_id, doc_no, account}.
- `private.money_sales` (0024:224): + birds {count, revenue} (book scope, division filter); revenue/cost/gross stay items only.
- `public.sales_overview` / `public.sales_report` (0021): + `birds` = {rows [{id, doc_no, sold_on, status, party_id, party_name, site_id, site_name, ticket_id, ticket_no, birds,
  net_kg, billed_kg, deduction_pct, paid ('credit'|'partial'|'cash'), money:{unit_price, total, paid_now}}], more, totals {count, voided, birds, net_kg, money:{revenue, paid_now, credit}},
  awaiting [{ticket_id, ticket_no, on_date, site_name, birds, net_kg}] (cap 100, no period), can_record}; report: birds groups by p_group (item → one key 'birds' «دجاج لحم حيّ»). Scope in_scope_site.

## 7. Invariants (service_role only; zero violations)
`verify_bird_sales()`: ticket_shape (stops of done tickets complete; each stop net = ticket_nets formula; header birds/crates/net = Σ; scale Σ nets = last gross − empty −
(with crates ? 0 : Σ crates × crate_kg); stop hall in the ticket site, stop flock in its hall); ticket_numbers (WT per org/year 1..last_no, done ⇔ number); sale_shape
(billed/total by rule 26, birds/net = ticket, sold_on = ticket date, book = main book of the ticket division, posted invoice ⇒ ticket done, ≤ 1 posted per ticket);
sale_sources (one per stop, birds/net = stop, Σ revenue = total, revenue = alloc_lr); sale_counts (each source exactly one original sold row: −birds, +net, flock,
sold_on; posted ⇒ not reversed, void ⇒ reversed once; no orphan 'bird_sale' count row); sale_entries (as verify_sales check 3: invoice +total, payment −paid with
its cash move, posted/void ⇔ reversed); sale_numbers (BR gapless); sale_orphans (party entries / cash moves with doc_kind 'bird_sale' belong to a sale).
`verify_flock_close()`: close_shape (closed flock ⇔ exactly one 'closed' close, same date); closed_live_zero; activity_after_close; close_counts (count_diff ≠ 0 ⇔ one
original 'flock_close' count row = count_diff on closed_on; reopened ⇒ reversed); return_moves (each FR line: one original positive move of its qty on its own lot, source
'flock_return', received_on = returned_on, same store; fifo_seq = min and expiry = min of flock_item_lots; posted ⇒ not reversed, void ⇒ reversed); return_costs (one
original −v 'flock_return' row = the move value); carry_costs (pending/applied/returned/void shapes, carry-in = −carry-out on the next flock of the same hall dated
applied_on); return_values (running-pool rule 16 recomputed = each line value; full pool leaves at exactly V); closed_cost_frozen (Σ flock_costs = cost_total);
flock_stock_costs (F:431: per flock Σ 'flock_issue'+'flock_return' cost rows = −Σ values of its FI and FR moves).
Changed: `verify_flocks` (live_negative and eggs_over_live with counts; NEW live_negative_day); `verify_stock` check 8 adds `doc_kind in ('flock_issue','flock_return')`
(carry rows stay out: no stock move); `verify_money` + bird_sale_detail_total (invoice entry = total, payment = −paid_now, cash = paid_now).

## 8. Migration header and rollback_0028.sql
Header like 0019/0021/0026 (المشكلة / هنا / انحرافات مكتوبة = D1–D12 / تراجع: rollback_0028.sql — … / تنعاد بأمان), `set lock_timeout = '5s'`, `create table if not exists`,
`create or replace`, `create index if not exists`, do-blocks that check the catalog before constraints and policies (re-runnable).
rollback_0028.sql refuses LOUDLY, changing nothing, if any: flock_counts row; weigh_tickets / stops / weighings row; bird_sales / sources row, or party_entries / cash_moves with doc_kind
'bird_sale'; flock_closes / lines / values / flock_returns / lines row, or a flocks row with status 'closed'; flock_costs with doc_kind 'flock_return'/'flock_carry';
stock_moves / stock_lots 'flock_return'; doc_counters 'WT'/'BR'/'FR'; audit_log rows of the 11 tables. Otherwise: drop the new functions, the audit policy and the
tables; restore the five constraint lists; restore WORD FOR WORD: 0012 flock_summary, open_flock, save_flock_day, flock_detail, verify_flocks, halls_check; 0019
flock_feed; 0021 stock_doc_memo, stock_doc_label, verify_stock, sales_overview, sales_report; 0024 cash_class, entry_detail, money_sales, verify_money; 0026 flock_month,
remove_flock_log, undo_vaccination; 0027 report_days (drop + re-create the old signature), report_day, halls_day_totals, halls_day, flock_cycle_report, flock_cycles.
seed.mjs BLOCKING_REQUIRED: `[28, 5, 'مسوّدة تذكرة وزن، وفاتورة طيور مرحّلة، وفرق عدّ، ودورة مغلقة بإرجاع، ونقل مطبَّق، كلّ واحد يوقف التراجع']`.

## 9. Tests (supabase/tests; new id prefix and phone — grep every test file first; full suite before saving)
Files: `birds.test.mjs` (tickets, invoices, counts, money readers), `close.test.mjs` (close, reopen, carry, reports). Registration: allowlist.json, role-matrix
(F:865: hall worker of site A cannot add a hall of site B or save a ticket in B; storekeeper cannot post BR; accountant cannot close or void; manager all),
core.test (read-only args and rejections of the 7 readers), classes.json, cost-leak (hall worker/storekeeper read nothing of flock_close_values; hall worker reads no
bird_sales; tickets readable by all scope roles).
Golden (exact, no tolerance):
- G1 F:664: scale, empty 7,000.000 without crates, crate 6.000, one hall 4,000 birds / 400 crates / gross 18,500.000 → net 9,100.000, avg 2.275; pct 0.50 → billed
  9,054.500; price 2,750.00 → total 24,899,875; paid fully to a box → trader balance 0, cash +24,899,875; live 10,000 → 6,000 on the ticket date.
- G2 D:227 with crates: empty 8,000, gross 11,000 / 14,500 → 3,000 / 3,500 (Σ 6,500). G3 without crates: empty 7,000, 200 crates each, crate 6, gross 10,000 / 13,500
  → 1,800 / 2,300 (Σ 4,100 = 13,500 − 7,000 − 2,400).
- G4 split: G3 with pct 0.50 → billed 4,079.500; price 2,749.00 → total round0(11,214,545.5) = 11,214,546; revenue 4,923,459 / 6,291,087 (largest remainder).
- G5 rule 16 (FOUNDATION §4): FI 3,000 kg valued 2,083,738.69; close return 500 → 347,289.78, flock feed cost 1,736,448.91; return 1,000 + carry 2,000 → 694,579.56 and
  1,389,159.13; return all → 2,083,738.69 and feed cost 0.00; the FR lot takes the FI lot's fifo_seq and expiry; the next FI from that store draws it first.
- G6 final KPIs: placed 10,000, dead 300, sold 9,700 at age 35, net 23,280.000, feed net 38,412.000 → avg 2.400, fcr_final 1.650, livability 97.00, EPEF 403.
  G7 same with dead 270 and live 30 at close → count_diff −30 (reason), mortality 2.70 (not 3.00), EPEF 404.
- G8 positive adjust dated after the sale it enables → invoice `live_negative` (day named); dated on the sale day → posts.
- G9 carry: close carries 200 kg; daily report shows it on the empty hall; open_flock applies it (+v, given on day 1, FCR pool); a second carry returned before
  placement → FR lot at the carried value, closed flock cost unchanged.
Races (two real sessions, settle on `pg_blocking_pids` of the named session): R1 F:882 queued round dead 60 + invoice 60 on live 100 → one fails, live ≥ 0; R2 F:885
issue vs close → `flock_closed` or `pool_changed`; R3 close vs invoice; R4 void invoice vs close; R5 open_flock vs return_hall_carry on one carry; R6 reopen vs
open_flock; R7 two invoices for one ticket → `ticket_invoiced`; R8 two saves of one ticket version → one 'stale'; R9 same client_ref in two sessions → one result;
R10 ticket save for a hall vs that flock's close.
Mutations (each caught; ≥ 15): nets from the empty for every hall (no telescoping); crates subtracted with crates in the empty; billed round2/trunc; amount truncated
(11,214,545); revenue split by birds; sold row dated the posting day; save_flock_day ignoring counts; close ignoring pending tickets; return valued at the latest FI unit
cost; return lot with a fresh fifo_seq; carry applied to another hall; reopen after an applied carry; void on a closed flock; fcr_final from rounds; EPEF with the age at
close instead of sale age (the test closes two days after the sale); report_days live ignoring counts; missing per-day check; pool qty subtracting a returned carry twice.
Real samples: `BIRDS_SAMPLES_OUT=1` writes scripts/tests/fixtures/birds-0028.json: weigh_ticket (draft, done, void), weigh_ticket_options, weigh_tickets, bird_sale_form,
record/void results, bird_sale_detail, sales_overview, sales_report ×3, party_statement_v2 with a BR, money_overview, flock_close_form, close/reopen/carry/adjust results,
open_flock with carried_in, flock_sales, flock_cycle_report (closed; with and without money), halls_day (close day; empty hall with carry), flock_cycles, flock_detail.

## 10. Screens (agents on this contract; the screens never touch a real DB: the integration check runs the real answers through the real parsers)
Agent A — halls (HallsRoutes, excluded from the precache), plus the FlockPage slot:
- `src/domain/weighTicket.ts`: bigint mirror of ticket_nets, avg, billed (round3), amount (round0: `lineAmount(billedMilli, priceFils)`), revenue split (allocateLargestRemainder at dinar scale);
  scripts/tests/weigh-ticket.test.mjs (G1–G4 and parity with the SQL samples).
- `src/lib/repo/weighTickets.ts` and `src/lib/repo/flockClose.ts` (+ `constraints-close.ts`), page-only modules in write-guard, not re-exported from repo/index.
- Routes: `ticket/new?site=&hall=`, `ticket/:id`, `tickets?status=&from=&to=`, `close/:flockId`; HallsRoutes exports `FlockCard`.
- TicketPage: method Segmented «قبّان» | «ميزان أقفاص»; «وزن الفارغ» (WeightPad) + «وُزن مع الأقفاص» (default on; off → «وزن القفص», prefilled last_crate_kg);
  «أضف قاعة» card per hall (live, age; «عدد الطيور»، «عدد الأقفاص»، «وزن الخابط بعد هذه القاعة» or weighings for the crate scale); live net and average per hall and
  totals from the domain mirror; save after each committed weighing (stale → show both, keep the typed copy); typed-but-unsaved copy kept in device storage keyed by
  user/org/ticket (try/catch) until saved; «أكمل التذكرة» ConfirmDialog «تأخذ التذكرة رقماً ولا تُعدَّل بعده. لا تنقص الطيور من القاعة حتى تُصدر الفاتورة.»;
  done: A5 TicketPaper (WT, date, site, method, vehicle/driver in `<bdi dir="ltr">`, DataTable «القاعة | الطيور | الأقفاص | وزن الخابط (كغم) | الصافي (كغم) | معدّل الطير (كغم)»,
  totals, «وزن الفارغ», signatures «عامل القاعة»، «السائق»، «المستلم», VoidStamp; NO price, NO trader); «أصدر الفاتورة» for sale.post; «احذف المسوّدة» (weigh_ticket.draft) /
  «ألغِ التذكرة» (done, manager, not invoiced).
- ClosePage: summary (live, dead, culled, sold from invoices, pending tickets as a blocking Notice with links), «فرق العدّ» = −live with a required reason, DayField
  (default_on, earliest_on..today), feed estimate, per item DataTable «المادّة | نزل للقاعة | الباقي | المصير | المخزن» with one fate per item (Segmented) and the store
  select (default_store), sends expected live/sold/pools; ConfirmDialog naming the result («تُغلق دورة «قاعة 1» يوم … ويُكتب فرق العدّ −30، ويرجع 300 كغم «علف بادئ» إلى
  «رصيد العلف»، ويُنقل 200 كغم «علف نامي» للدورة التالية في القاعة. لا يُسجَّل على الفوج شيء بعد الإغلاق.»); unknown outcome kept outside the component
  (sessionStorage keyed by user/org/flock, memory fallback), the page frozen until re-sent with the same ref (lesson 2026-11-10).
- ReportPage (+ halls.ts parseCycleReport): sales, close and final KPI sections; «أعد فتح الدورة» (manager; ConfirmDialog names the FR numbers and «تُلغى مستندات الإرجاع
  ويعود العلف من المخزن إلى حساب القاعة، ويُلغى فرق العدّ، ويعود الفوج قائماً.»); «أرجعه إلى مخزن» per pending carry (store select from close.lines[].stores).
- FlockCard (slot on FlockPage): flock_sales; buttons «تذكرة وزن» / «سجّل فرق العدّ» (dialog: زيادة|نقص, date, reason, live before/after) / «أغلق الدورة» / «أعد فتح الدورة» by `can`.
- DailyPage (+ hallReports.ts): sold / ticketed / count_diff per hall; the carry list on empty halls; «تذكرة وزن» link. Reminders: «شغل اليوم» row «تذاكر وزن بانتظار
  الفاتورة: N» for sale.post (weigh_tickets 'awaiting'). Reports hub: «تذاكر الوزن» → /halls/tickets.
- Tests: halls-tickets.test.mjs, halls-close.test.mjs (DOM, real parsers on birds-0028.json, each fix by a failing-before test), halls-reports/halls-cycle updated.
Agent B — sales and money (StockRoutes and AccountsRoutes, excluded):
- `src/lib/repo/birdSales.ts` (+ `constraints-birdsales.ts`): form, record (ids + ref kept outside the component), void, detail; the `birds` sections of sales_overview/report.
- SalesRoutes: `birds/new?ticket=`, `birds/:id` (static segments outrank `:id`). BirdSaleNew: ticket summary table, trader (SupplierPicker customer, «أضف زبوناً»
  for party.create), «سعر الكيلو» (MoneyInput), «التنزيل ٪» (optional), live preview from the domain mirror (billed, amount, per hall), «المقبوض الآن» (default 0) +
  BoxPicker when > 0, «الباقي على الحساب»; ConfirmDialog «تُسجَّل الفاتورة BR بمبلغ … على حساب «…»، وتخرج … طير من «قاعة 1»…»; result → /sales/birds/:id.
  BirdSalePage: A5 «فاتورة بيع دجاج لحم حيّ» (DataTable by hall «القاعة | الطيور | الصافي (كغم) | معدّل الطير (كغم)», «التنزيل»، «الوزن المحسوب»، «سعر الكيلو»، «المبلغ»
  + amountInWords, «المقبوض الآن» and box, «الباقي على الحساب», signatures «المحاسب»، «المستلم», VoidStamp); «ألغِ الفاتورة» (manager) ConfirmDialog «تُلغى الفاتورة … وتعود …
  طير إلى «…» حيّةً؛ والمقبوض (…) يبقى رصيداً للتاجر يُخصم من فاتورة لاحقة أو يُردّ من كشفه.»; the server hint shown when a flock is closed.
- SalesPage: «فواتير الطيور» DataTable + totals, «تذاكر بانتظار الفاتورة» with «أصدر الفاتورة», report bird groups. Accounts: statement.ts DETAIL_TYPES + 'bird_sale',
  'bird_sale_payment' (memo «بيع %s طير (%s كغم) بسعر %s — %s»), allocation label «قُبض عند البيع», links and money/shared.tsx docHref 'bird_sale' → /sales/birds/:id;
  money screens show sales = items + birds and gross for items only with «ربح الطيور في تقرير الفوج».
- Tests: bird-sales.test.mjs (preview = mirror = server on samples, post/void flows, unknown outcome freeze, print text), statement/money tests updated.

## 11. Precache and chunks (no ceiling raise; budgets.json: precache 901,500 B, boot 82,400 gzip)
- Margin before 0027 was 28 B; the 0027 screens excluded ReportsPage (worktree measure: precache 900,347, boot 81,981 gzip, no keys). Re-measure after 0027 merges.
- Every new page lives in HallsRoutes / StockRoutes / AccountsRoutes. Precached edits are ONLY the FlockPage slot (farm/shared.tsx lazy pick of `FlockCard` from
  loadHalls with `quietly`, like HallReminders): target ≤ +250 B precache, 0 boot; App.tsx, nav, Shell, RoundPage, flocks.ts and constraints-flocks.ts unchanged.
- Shared modules between excluded chunks must be named into an excluded pattern (vite.config.ts chunkFileNames): add `domain/weighTicket` to the stores-admin regex and
  `domain/amountWords` to the accounts-office regex (papers.tsx is shared by Halls, Stock and Accounts; amountWords by Stock and Accounts → different chunk sets).
  New constraint dictionaries are imported only by their own excluded repo modules.
- Gate: `npm run build` with and without keys, `node scripts/guards/run.mjs --dist --measure` without `--raise`, dist/assets diff showing no new precached file.

## 12. Owner decisions still needed
None blocking. D1–D12 are recorded as decisions without asking; each is reversible later without touching the money rules.
