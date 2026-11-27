# Contract 0038 — a hall split into sections (deaths per section; feed, gas, kerosene and sales for the whole hall)

Owner's request and answers: `docs/DECISIONS.md` section «2026-11-26». The customer has one hall split in two («قاعة واحدة مقسومة قسمين»): **the feed and the gas are the hall's** («دز طن فهو للقاعتين، الغاز عشرين فهو للقاعتين»), **the birds and the deaths are per section** («الهلاكات مال القاعة واحد، والهلاكات مال القاعة اثنين، العدد همين ينقسم بالنص»). The owner chose: **sections are defined on the hall** (when it is created or edited), every batch in it takes the same sections, **the count of each section is written at placement** (an even split by default), the round and the sheet take **the deaths of each section in its own box**, feed/gas/kerosene/sales stay for the whole hall, and **the batch's deaths = the sum of its sections**, so every existing report stays right.

Base: the branch that carries `0037_kerosene` (kerosene must be in production first or in the same apply). Rules that bind every part: CLAUDE.md (Fusha UI text through `t()`; numbers through `format.ts`; `DataTable` only; no `window.confirm`; one RPC per write with `client_ref`; every feature/fix with a test that FAILS on the code before it; no ceiling raise).

Decisions taken without asking (to be told to the owner):
- **1 to 4 sections** per hall (1 = not split). Sections are numbered and shown «ق1», «ق2», «ق3», «ق4» (no free names).
- The sections of a hall **change only while its open batch has no deaths recorded** (any day with dead or culled > 0): changing them later would leave days without a split. With no open batch, or an open batch without deaths, the change is free and the open batch's counts are re-split evenly.
- Sales, counting differences, feed, gas, kerosene, weights, vaccines, notes and eggs stay for the whole batch. A section's remaining birds = its count − its deaths (sales are not split; the hall's live count is as today).
- The per-section bound: a section's deaths over all days never exceed its count (`live_negative`, naming the section). The whole-batch live check is as today.

Two parts built in parallel, integrated by the main session:
- **D** — migration `0038_hall_sections` (DB only; a worktree agent).
- **S** — hall dialogs, open/edit batch dialogs, the round, the hall sheet, the batch report, the offline queue (main session).

---

## Part D — `supabase/migrations/0038_hall_sections.sql` (+ `rollback_0038.sql`, tests, real samples)

Build every changed function on its **latest body** (after 0037). `rollback_0038.sql` restores them word for word (old signatures included) and drops what is new; it **refuses loudly** while any hall has `sections > 1`, any batch has `section_counts`, or any visit/day has `dead_parts`.

### D1. Columns and helpers
- `public.halls.sections smallint not null default 1`, `check (sections between 1 and 4)`. **Grant insert on the column** (a new hall may be created split, like `name`/`capacity`); **no update grant** — changing it is `set_hall_sections` only.
- `public.flocks.section_counts integer[]` — null for a hall of one section; otherwise one count per section (`cardinality = hall.sections` at the time), every element an integer ≥ 0 and not null, and `sum = placed_count` (check constraint through an immutable helper; flocks without placement keep it null).
- `public.flock_visits.dead_parts integer[]` and `public.flock_daily.dead_parts integer[]` — null, or one integer ≥ 0 per section with `sum = dead` (the visit's / the day's `dead`; the legacy `culled` is not split and must be 0 on a split day written after 0038).
- Immutable helpers in `private` for: valid parts (no null element, ≥ 0, 2..4 elements), parts sum, element-wise sum of an array of parts. No `/` division in SQL (migration-guard).

### D2. Writing the deaths with their parts
- `private.flock_day_rebuild(f, p_on)` (latest body 0036): `dead_parts` of the day = element-wise sum of the live visits' `dead_parts` (visits without parts count as zeros only when their `dead + culled = 0`). **For a split batch (`f.section_counts is not null`) a live visit with `dead + culled > 0` and no parts raises `sections_required`** with hint «هذه القاعة مقسومة أقساماً: اكتب هلاكات كلّ قسم في خانته (حدّث التطبيق إن لم تظهر الخانات).» — one rule for every writer (an old app's `save_flock_visit`/`set_flock_dead` without parts cannot write deaths into a split batch). For a batch not split, `dead_parts` stays null.
- `private.flock_parts_check(f)` (new, like `flock_live_check`): for each section i, `section_counts[i] − Σ days dead_parts[i] ≥ 0`, else `live_negative` with hint `format('هلاكات ق%s (%s) أكثر من طيوره (%s). راجع الأرقام.', i, …)`.
- `public.set_flock_dead` (latest body 0036) gains `p_parts integer[] default null` (drop the 5-argument function and create the 6-argument one with the default, so the deployed screens' named calls keep working; grants as before). A split batch: `p_parts` required (`sections_required` when null), valid and of the batch's length (`bad_value` «هلاكات كلّ قسم أعداد صحيحة، خانة لكلّ قسم.»), and `p_dead = sum(p_parts)` (`bad_value` otherwise). A batch not split: `p_parts` must be null (`bad_value`). «Once a day» as now: an entered day with the same parts → `saved` with no write; different parts (or total) → `dead_recorded`. The new live visit carries `dead_parts`; after the rebuild, `flock_live_check` and `flock_parts_check`. `ref_claim` payload includes `parts`. Parked payload (`flock_day_rejects`) keeps `{dead, parts}`.
- `public.save_flock_day` (latest body 0036) gains `p_dead_parts integer[] default null` (drop and recreate with the default). With `p_dead` given on a split batch: `p_dead_parts` required and summing to `p_dead`; on a batch not split it must be null. The `day_total` visit carries `coalesce(p_dead_parts, d.dead_parts)` (a note or eggs edit keeps the day's split); `p_dead = 0` on a split batch takes all-zero parts. After the rebuild, `flock_parts_check` as well. Parked payload includes `dead_parts`. `ref_claim` payload includes it.
- `public.save_flock_visit`: unchanged (the rebuild rule covers it).

### D3. Placement, editing the batch, the hall's sections
- `public.open_flock` (latest body 0029) gains `p_section_counts integer[] default null` (drop/recreate). Hall of one section: must be null (`bad_value`). Split hall: null → an even split of `p_placed_count` (the remainder to the first sections: 27,051 in 2 → 13,526 + 13,525); given → valid, `cardinality = hall.sections`, `sum = p_placed_count` (`bad_value` «مجموع أعداد الأقسام (%s) لا يساوي العدد الداخل (%s).»). `ref_claim` payload includes it.
- `public.edit_flock` (latest body 0037) gains `p_section_counts integer[] default null` (drop/recreate). Split batch: when the placed count changes, `p_section_counts` is required (`section_counts_required` «اكتب عدد كلّ قسم بعد تغيير العدد الداخل.»); given counts are valid, of the batch's length, sum to the new placed count, and each ≥ the section's recorded deaths (`live_negative` naming the section). Batch not split: must be null. `ref_claim` payload includes it. Every other rule unchanged.
- `public.set_hall_sections(p_hall uuid, p_sections integer, p_expected_version integer, p_client_ref uuid) returns jsonb` (new; permission `flock.manage` and the hall's site in scope, like the halls policies; `ref_claim`/`ref_store`; hall row `for update` then its open batch `for update`): `p_sections` 1..4 (`bad_value`); hall version ≠ `p_expected_version` → `{status:'stale_hall', hall:{id, version, sections}}`; same value → `saved` with no write; open batch (preparing/active) with any recorded deaths → `sections_after_deaths` («في القاعة «%s» وجبة سُجّلت هلاكاتها، فلا تتغيّر أقسامها حتى تُغلق.»); otherwise update the hall (version + 1, the `halls_master` trigger rules stay) and set the open batch's `section_counts` to the even split (null for 1). Returns `{status:'saved', hall:{id, version, sections}, section_counts}`.

### D4. Readers (additive keys only; everything else word for word)
- `private.flock_day_json(d)`: `'dead_parts'` (null or the array).
- `private.flock_summary(f)` (latest 0036): `'section_counts'` (null or the array) and `'section_dead'` (null, or each section's deaths over all days: the round shows and checks each section's remaining birds). `public.flocks_overview()` (latest 0036): each hall `'sections'`.
- `public.hall_sheet(p_flock)` (latest 0037): each day `'dead_parts'`; `totals.dead_parts` (null for a batch not split, else the element-wise sum over the days); top level `'sections'`: null for a batch not split, else `[{"no":1,"placed":13525,"dead":21,"mortality_pct":"0.16","remaining":13504}, …]` (`mortality_pct` like `summary.mortality_pct`, `remaining = placed − dead`).

### D5. `public.verify_hall_sections() returns table (check_name text, violations bigint)`
`hall_sections_range`; `flock_counts_shape` (split batch: counts valid, sum = placed_count, cardinality = its hall's sections while the batch is open); `visit_parts` (live visits of split batches: parts valid, of the batch's length, sum = dead; no deaths without parts); `day_parts` (daily parts = element-wise sum of live visits' parts; sum = dead); `unsplit_parts` (no parts on batches not split); `section_live` (per-section deaths ≤ count); `sheet_sections` (as each org's owner: `hall_sheet` totals/sections agree with the days). Each check proven by a mutation in a rolled-back transaction.

### D6. Harness
`allowlist.json` (new and changed signatures), `role-matrix.test.mjs` (the new writer; changed writers keep working positionally), constraint sentences in `src/lib/repo/constraints-flocks.ts` (the only `src/` file Part D may touch), `seed.mjs` blocking cases for the rollback, catalog/digest tests. Whole DB suite green, `npm run lint` green.

### D7. Tests `supabase/tests/hall-sections.test.mjs`
Placement (even split with remainder; given counts; wrong sum/length/negative), `set_hall_sections` (no batch; batch without deaths re-split; batch with deaths refused; stale version; same value; permissions; another org), `set_flock_dead` with parts (saved; once a day with same/different parts; parked keeps parts; a split batch without parts → `sections_required`; parts on a batch not split → `bad_value`; dead ≠ sum; section bound), `save_flock_day` with parts (correction; note-only edit keeps the split; zero; section bound), `save_flock_visit` with deaths on a split batch → `sections_required`, `edit_flock` (count change needs counts; counts below a section's deaths refused), readers' keys (`hall_sheet` days/totals/sections, `flocks_overview` hall `sections` and flock `section_counts`, `flock_day_json`), two real sessions racing `set_flock_dead` on a split day, verify zero and each check caught by its mutation, rollback runner with its refusals. Check new id/phone prefixes against all test files first.

### D8. Real samples → `scripts/tests/fixtures/hall-sections-0038.json`
`{ hall_sheet: <a split broiler batch: 2 sections, deaths on 3 days, one note-only edit>, flocks_overview: <the same org>, set_flock_dead_saved, set_flock_dead_recorded, set_hall_sections_saved, set_hall_sections_refused (code + hint) }` as returned by the database.

---

## Part S — screens (main session)

- Hall dialog: «الأقسام» 1–4 (creation: direct insert with `sections`; editing: `set_hall_sections` with the version, and its refusal sentence).
- Open batch: when the hall is split, one count per section (even split by default, the sum must equal the total, said before saving). Edit batch: the counts.
- Round: a split batch shows one deaths box per section («ق1», «ق2») and saves `set_flock_dead` with `p_parts` (dead = their sum); the locked box shows each section.
- Hall sheet: for a split batch, «هلاكات ق1 | هلاكات ق2 …» instead of «الهلاكات», each a grid field writing `save_flock_day` with `p_dead` = the day's new sum and `p_dead_parts`; totals per section; the cell sheet per section.
- Batch report: the same per-section columns and, in the summary, one row per section (count, deaths and their percentage, remaining after deaths).
- Offline queue: `parts` in `set_flock_dead` payloads and `dead_parts` in `save_flock_day` payloads (merged with `dead`, never alone), transport args, queue DB 6.
- Real samples from D pass through the real parsers.
