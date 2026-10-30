// فحص الخصائص (خطّة المرحلة 1، الملحق C: v1 بـWP3، ويكبر لحد v5 بـWP7). v1 للدفاتر (بذرة ثابتة مطبوعة): افتتاحات وقبض ودفع
// وتسويات وإعفاءات وإلغاءات (من الأحدث وعشوائية) بالدوالّ الحقيقية بدور authenticated، وبعد كل خطوة verify_ledger صفر، والمتبقّي
// لكل قيد ورصيد كل (جهة، دفتر) = نموذج TS مبني من src/domain (allocationPlan وrunBooks)، والمعاينة = allocationPlan بالفلس.
// v2 للمخزون (WP4، بذرة ثابتة مطبوعة): افتتاحات وتحويلات (ومنها أكثر من المتاح، ومن مرآة لمرآة، ورجوع لمخزن الأصل) وإلغاءات
// (من الأحدث وعشوائية، والمرفوض lot_consumed منها صحيح)، وبعد كل خطوة verify_stock صفر؛ وسحب كل تحويل = fifo.planDraw على دفعات
// القاعدة قبله بالفلس، والرفض بالنقص لمّا الخطّة تكول نقص بالضبط.
// v3 (WP5، بذرة ثابتة مطبوعة): يزيد الصرف (ومنه أكثر من المتاح) والجرد (نقص وزيادة، وبلا دفعة قياس بكلفة المدير) والمصاريف
// النقدية، والإلغاء لكلها؛ وبعد كل خطوة verify_stock وverify_ledger صفر ورصيد الصندوق = النموذج؛ وسحب الصرف ونقص الجرد =
// fifo.planDraw بالفلس، وقيمة كل زيادة = count.gainValue بدفعة pickGainReferenceLot على دفعات المنشأة قبلها، ومصروف المستند =
// مجموع سحبه.
import { loadSrc } from '../../scripts/tests/load-src.mjs';
import { LEDGER_ZERO, balance, call, makeOrg, remainders, shown, uid, verifyLedger } from './ledger-kit.mjs';
import { STOCK_ZERO, makeStockOrg, openingDraft, postOpening, postTransfer, transferDraft, verifyStock } from './stock-kit.mjs';

const TODAY = '2026-10-30';
const id = (n) => `d3000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477093000${String(n).padStart(2, '0')}`;

export default async function (t, db) {
  await db.setToday(TODAY, async () => {
    const ledger = await loadSrc('src/domain/ledger.ts');
    const { users: U, books: B, divisions: D } = await makeOrg(db, {
      name: 'مزرعة الخصائص',
      id,
      phone,
      roles: [
        ['owner', 'owner'],
        ['manager', 'manager'],
        ['accountant', 'accountant'],
      ],
    });
    const asM = (sql, params) => call(db, U.manager, sql, params);
    for (const [kind, day] of [['hatchery', '2026-09-24'], ['general', '2026-09-30']]) await asM('select public.set_division_go_live($1, $2)', [D[kind], day]);
    const party = async (name) => (await asM('insert into public.parties (name, is_customer) values ($1, true) returning id', [name])).value;
    const BOX = (await asM("insert into public.cash_accounts (name, kind) values ('صندوق الخصائص', 'cash') returning id")).value;
    await propertyV1(t, db, { ledger, U, B, BOX, party });
    await propertyV2(t, db);
    await propertyV3(t, db);
  });
}

/** دفعات (مادّة، مخزن) من القاعدة بشكل fifo.ts: الكمية بالآلاف والقيمة بالفلس. */
async function fifoLots(db, item, wh) {
  return (
    await db.admin(
      "select id, fifo_seq::text as fifo_seq, received_on::text as received_on, expiry_on::text as expiry_on, (qty_left * 1000)::bigint::text as q, (value_left * 100)::bigint::text as v from public.stock_lots where item_id = $1 and warehouse_id = $2",
      [item, wh],
    )
  ).rows.map((r) => ({ id: r.id, fifoSeq: BigInt(r.fifo_seq), receivedOn: r.received_on, expiryOn: r.expiry_on, qtyLeft: BigInt(r.q), valueLeft: BigInt(r.v) }));
}

async function propertyV2(t, db) {
  const SEED = 20261031;
  const STEPS = 80;
  const GO_LIVE = '2026-10-20';
  const fifo = await loadSrc('src/domain/fifo.ts');
  const S = await makeStockOrg(db, {
    name: 'مزرعة خصائص المخزون',
    id: (n) => `d3100000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    phone: (n) => `96477093100${String(n).padStart(2, '0')}`,
    goLive: GO_LIVE,
  });
  const { users: U, W } = S;
  const random = rng(SEED);
  const pick = (list) => list[Math.floor(random() * list.length)];
  // الوقود يدخل العامّة والمواد الأوّلية والحقلين: كل الأزواج مسموحة، فالتحويل يرجع لمخزن أصله بنفس fifo_seq.
  const STORES = [W.general, W.general2, W.raw, W.farm1, W.farm2];
  const items = [];
  for (let k = 0; k < 4; k += 1) items.push(await S.one(U.owner, "insert into public.items (name, kind, base_unit) values ($1, 'fuel', 'L') returning id", [`كاز الخصائص ${k}`]));
  const posted = [];
  const failures = [];
  let done = 0;
  let shortages = 0;
  let consumed = 0;
  for (let step = 0; step < STEPS && failures.length === 0; step += 1) {
    const roll = random();
    const day = pick(['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']);
    let label;
    if (roll < 0.25 || posted.length === 0) {
      const item = pick(items);
      const wh = pick(STORES);
      const lines = Array.from({ length: 1 + Math.floor(random() * 3) }, () => ({ item, qty: (1 + Math.floor(random() * 500000)) / 1000, value: (Math.floor(random() * 90000000) / 100).toFixed(2) }));
      label = `افتتاح ${step}`;
      const doc = await openingDraft(db, U.manager, wh, GO_LIVE, lines);
      const result = await postOpening(db, U.manager, doc);
      if (result.ok) posted.push({ kind: 'opening', id: doc.id });
      else if (result.code !== 'item_has_moves') failures.push(`${label}: ${result.code}`);
    } else if (roll < 0.8) {
      const item = pick(items);
      const from = pick(STORES);
      const to = pick(STORES.filter((wh) => wh !== from));
      const qtyMilli = BigInt(1 + Math.floor(random() * 300000));
      label = `تحويل ${step}`;
      const plan = fifo.planDraw(await fifoLots(db, item, from), qtyMilli, day, { tracksExpiry: false });
      const doc = await transferDraft(db, U.manager, from, to, day, [{ item, qty: (Number(qtyMilli) / 1000).toFixed(3) }]);
      const result = await postTransfer(db, U.manager, doc);
      if (plan.shortage > 0n) {
        shortages += 1;
        if (result.ok || result.code !== 'insufficient_stock') failures.push(`${label}: الخطّة نقص والقاعدة ${shown(result)}`);
      } else if (!result.ok) failures.push(`${label}: ${result.code} ${result.hint}`);
      else {
        posted.push({ kind: 'transfer', id: doc.id });
        const got = result.value.lines[0].draws.map((d) => `${d.lot_id}:${d.qty}:${d.money.value}`).join(',');
        const want = plan.draws.map((d) => `${d.lotId}:${(Number(d.qty) / 1000).toFixed(3)}:${(Number(d.value) / 100).toFixed(2)}`).join(',');
        if (got !== want) failures.push(`${label}: السحب ${got} والخطّة ${want}`);
      }
    } else {
      const target = random() < 0.5 ? posted.at(-1) : pick(posted);
      label = `إلغاء ${target.kind} ${step}`;
      const fn = target.kind === 'opening' ? 'void_opening_stock' : 'void_transfer';
      const result = await call(db, U.manager, `select public.${fn}($1, $2, $3)`, [target.id, 'خاصية', uid()]);
      if (result.ok) posted.splice(posted.indexOf(target), 1);
      else if (result.code === 'lot_consumed') consumed += 1;
      else failures.push(`${label}: ${result.code}`);
    }
    done += 1;
    const verify = await db.asService(verifyStock);
    const bad = Object.entries(verify).filter(([, v]) => v !== 0);
    if (bad.length || Object.keys(verify).length !== Object.keys(STOCK_ZERO).length) failures.push(`بعد ${label}: verify_stock ${JSON.stringify(verify)}`);
  }
  console.log(`    · فحص الخصائص v2 (المخزون): البذرة ${SEED}، ${done} خطوة من ${STEPS}، ${shortages} نقص و${consumed} إلغاء مرفوض بـlot_consumed`);
  t.same(failures, [], `الخصائص v2 (البذرة ${SEED}): بعد كل خطوة verify_stock صفر، وسحب كل تحويل = fifo.planDraw بالفلس، والنقص بالضبط حين تقوله الخطّة`);
  t.ok(done === STEPS && shortages > 0 && consumed > 0, `الخصائص v2 نفّذت كل الخطوات ومرّت بالنقص والإلغاء المرفوض (${done}، ${shortages}، ${consumed})`);
}

/** دفعات المادّة بالمنشأة كلها بشكل count.ts (دفعة القياس، E45): الترتيب والمرآة والمعكوسة والكمية والقيمة الداخلتان. */
async function gainLots(db, item) {
  return (
    await db.admin(
      `select l.id, l.fifo_seq::text as fifo_seq, l.origin_lot_id is not null as mirror, (qty_in * 1000)::bigint::text as q, (value_in * 100)::bigint::text as v,
         exists (select 1 from public.stock_moves m join public.stock_moves r on r.reverses_move_id = m.id
           where m.lot_id = l.id and m.qty > 0 and m.reverses_move_id is null) as reversed
       from public.stock_lots l where l.item_id = $1`,
      [item],
    )
  ).rows.map((r) => ({ id: r.id, fifoSeq: BigInt(r.fifo_seq), mirror: r.mirror, reversed: r.reversed, qtyIn: BigInt(r.q), valueIn: BigInt(r.v) }));
}

const milli = (text) => BigInt(Math.round(Number(text) * 1000));
const fils = (text) => BigInt(Math.round(Number(text) * 100));
const qtyText = (q) => (Number(q) / 1000).toFixed(3);
const drawsText = (draws) => draws.map((d) => `${d.lotId}:${d.qty}:${d.value}`).join(',');

async function propertyV3(t, db) {
  const SEED = 20261102;
  const STEPS = 90;
  const GO_LIVE = '2026-10-20';
  const fifo = await loadSrc('src/domain/fifo.ts');
  const count = await loadSrc('src/domain/count.ts');
  const S = await makeStockOrg(db, {
    name: 'مزرعة خصائص الصرف والجرد',
    id: (n) => `d3200000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    phone: (n) => `96477093200${String(n).padStart(2, '0')}`,
    goLive: GO_LIVE,
  });
  const { users: U, W, divisions: D } = S;
  const random = rng(SEED);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const STORES = [W.general, W.general2, W.raw];
  const items = [];
  for (let k = 0; k < 3; k += 1) items.push(await S.one(U.owner, "insert into public.items (name, kind, base_unit) values ($1, 'fuel', 'L') returning id", [`كاز الجرد ${k}`]));
  // مادّة بلا دفعات لحد ما الجرد يزيدها: أوّل زيادة بكلفة المدير (E48).
  const bare = await S.one(U.owner, "insert into public.items (name, kind, base_unit) values ('مادّة بلا افتتاح', 'fuel', 'L') returning id");
  const upkeep = await S.one(U.accountant, "insert into public.expense_categories (name) values ('صيانة الخصائص') returning id");
  const power = await S.one(U.accountant, "insert into public.expense_categories (name) values ('كهرباء الخصائص') returning id");
  const box = await S.one(U.accountant, "insert into public.cash_accounts (name, kind) values ('صندوق الخصائص', 'cash') returning id");
  await S.one(U.manager, 'select public.record_cash_opening(gen_random_uuid(), $1, 50000000, $2, gen_random_uuid())', [box, GO_LIVE]);
  let boxModel = 50_000_000n;
  const boxBalance = async () => BigInt((await db.admin('select coalesce(sum(amount), 0)::bigint::text as v from public.cash_moves where account_id = $1', [box])).rows[0].v);
  // رصيد (مادّة، مخزن) بيوم: حركاتها بتاريخه أو قبله بلا العكسيات وأصولها (نموذج count_balance_at بالآلاف).
  const balanceAt = async (item, wh, day) => {
    const rows = (await db.admin('select id, reverses_move_id, moved_on::text as moved_on, (qty * 1000)::bigint::text as q from public.stock_moves where item_id = $1 and warehouse_id = $2', [item, wh])).rows;
    const reversed = new Set(rows.filter((r) => r.reverses_move_id).map((r) => r.reverses_move_id));
    return rows.filter((r) => !r.reverses_move_id && !reversed.has(r.id) && r.moved_on <= day).reduce((sum, r) => sum + BigInt(r.q), 0n);
  };
  const docExpense = async (kind, docId) =>
    (await db.admin("select coalesce(sum(amount) filter (where reverses_id is null), 0)::text as v from public.expenses where doc_kind = $1 and doc_id = $2", [kind, docId])).rows[0].v;
  const versionOf = async (table, docId) => (await db.admin(`select version from public.${table} where id = $1`, [docId])).rows[0].version;
  const posted = [];
  // الجرود المرحَّلة (مادّة، مخزن، يوم، ترتيب الترحيل، بحركة؟): جرد أقدم بفرق بعد أحدث مرحَّل لنفس المادّة count_superseded (المراجعة
  // الثانية لـWP5)، والمراجعة الثالثة: السطر بلا فرق يترحّل، وإلغاء جرد بحركة وبعده جرد مرحَّل يومه مثل يومه أو بعده ينرفض بنفس الرمز.
  const approvedCounts = [];
  let countOrder = 0;
  const voidBlockedBy = (target) => {
    const counted = target.kind === 'count' ? approvedCounts.find((c) => c.id === target.id) : null;
    return Boolean(counted?.moved && approvedCounts.some((c) => c.id !== counted.id && c.item === counted.item && c.wh === counted.wh && c.day >= counted.day && c.order > counted.order));
  };
  const failures = [];
  const tally = { done: 0, uses: 0, useShort: 0, counts: 0, countShort: 0, superseded: 0, gains: 0, manual: 0, shortages: 0, expenses: 0, voids: 0, consumed: 0, voidBlocked: 0 };
  for (let step = 0; step < STEPS && failures.length === 0; step += 1) {
    const roll = random();
    const day = pick(['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']);
    let label;
    if (roll < 0.15 || posted.length === 0) {
      const item = pick(items);
      const wh = pick(STORES);
      const lines = Array.from({ length: 1 + Math.floor(random() * 2) }, () => ({ item, qty: (1 + Math.floor(random() * 400000)) / 1000, value: (Math.floor(random() * 50000000) / 100).toFixed(2) }));
      label = `افتتاح ${step}`;
      const doc = await openingDraft(db, U.manager, wh, GO_LIVE, lines);
      const result = await postOpening(db, U.manager, doc);
      if (result.ok) posted.push({ kind: 'opening', fn: 'void_opening_stock', id: doc.id });
      else if (result.code !== 'item_has_moves') failures.push(`${label}: ${result.code}`);
    } else if (roll < 0.27) {
      const item = pick(items);
      const from = pick(STORES);
      const to = pick(STORES.filter((wh) => wh !== from));
      label = `تحويل ${step}`;
      const doc = await transferDraft(db, U.manager, from, to, day, [{ item, qty: qtyText(BigInt(1 + Math.floor(random() * 200000))) }]);
      const result = await postTransfer(db, U.manager, doc);
      if (result.ok) posted.push({ kind: 'transfer', fn: 'void_transfer', id: doc.id });
      else if (result.code !== 'insufficient_stock') failures.push(`${label}: ${result.code}`);
    } else if (roll < 0.47) {
      // الصرف: السحب = fifo.planDraw على دفعات المخزن قبله، والنقص بالضبط حين تقوله الخطّة، والمصروف = مجموع السحب.
      const item = pick(items);
      const wh = pick(STORES);
      const lots = await fifoLots(db, item, wh);
      const have = fifo.eligibleLots(lots, day, { tracksExpiry: false }).reduce((sum, l) => sum + l.qtyLeft, 0n);
      const qty = random() < 0.15 || have === 0n ? have + BigInt(1 + Math.floor(random() * 5000)) : BigInt(1 + Math.floor(random() * Number(have)));
      label = `صرف ${step}`;
      const plan = fifo.planDraw(lots, qty, day, { tracksExpiry: false });
      const doc = await db.asUser(
        U.manager,
        async (q) => {
          const docId = (await q('insert into public.stock_uses (warehouse_id, category_id, used_on) values ($1, $2, $3) returning id', [wh, upkeep, day])).rows[0].id;
          await q('insert into public.stock_use_lines (doc_id, item_id, qty_in_unit) values ($1, $2, $3)', [docId, item, qtyText(qty)]);
          return docId;
        },
        { commit: true },
      );
      const result = await call(db, U.manager, "select public.post_stock_use($1, $2, public.preview_stock_use($1) ->> 'plan', $3)", [doc, await versionOf('stock_uses', doc), uid()]);
      tally.uses += 1;
      if (plan.shortage > 0n) {
        tally.useShort += 1;
        if (result.ok || result.code !== 'insufficient_stock') failures.push(`${label}: الخطّة نقص والقاعدة ${shown(result)}`);
      } else if (!result.ok) failures.push(`${label}: ${result.code} ${result.hint}`);
      else {
        posted.push({ kind: 'stock_use', fn: 'void_stock_use', id: doc });
        const got = drawsText(result.value.lines[0].draws.map((d) => ({ lotId: d.lot_id, qty: milli(d.qty), value: fils(d.money.value) })));
        if (got !== drawsText(plan.draws)) failures.push(`${label}: السحب ${got} والخطّة ${drawsText(plan.draws)}`);
        const total = plan.draws.reduce((sum, d) => sum + d.value, 0n);
        if (fils(await docExpense('stock_use', doc)) !== total) failures.push(`${label}: المصروف ${await docExpense('stock_use', doc)} ومجموع السحب ${total}`);
      }
    } else if (roll < 0.72) {
      // الجرد: الرصيد بيوم الجرد (مراجعة WP5)، والنقص = planDraw على الدفعات الآن (وأكثر من المتاح الآن insufficient_stock: مستندات
      // بعد يوم الجرد سحبت منه)، والزيادة = gainValue بدفعة القياس على دفعات المنشأة قبلها (وبلاها كلفة المدير)، و«فرق جرد» = النقص.
      // ثلث الجرود على (مادّة، مخزن) جرد مرحَّل بيوم عشوائي: قبله يمرّ بـcount_superseded، وبعده يخلّي إلغاء الأقدم ينرفض.
      const anchor = approvedCounts.length > 0 && random() < 0.35 ? pick(approvedCounts) : null;
      const item = anchor ? anchor.item : random() < 0.12 ? bare : pick(items);
      const wh = anchor ? anchor.wh : pick(STORES);
      const lots = await fifoLots(db, item, wh);
      const have = await balanceAt(item, wh, day);
      // المادّة بلا افتتاح تزيد دائماً (أوّل زيادة بلا دفعة قياس، فبكلفة المدير)، وغيرها نقص أو زيادة أو مطابق.
      const delta = item === bare ? BigInt(1 + Math.floor(random() * 5000)) : random() < 0.15 ? 0n : BigInt(Math.floor((random() - 0.6) * Math.max(Number(have), 20000)));
      const counted = have + delta < 0n ? 0n : have + delta;
      const diff = counted - have;
      label = `جرد ${step} (${qtyText(have)} ← ${qtyText(counted)})`;
      const candidates = await gainLots(db, item);
      const doc = await db.asUser(
        U.manager,
        async (q) => {
          const docId = (await q('insert into public.stock_counts (warehouse_id, counted_on) values ($1, $2) returning id', [wh, day])).rows[0].id;
          const lineId = (await q('insert into public.stock_count_lines (doc_id, item_id, counted_qty) values ($1, $2, $3) returning id', [docId, item, qtyText(counted)])).rows[0].id;
          return { id: docId, lineId };
        },
        { commit: true },
      );
      const sent = await call(db, U.manager, 'select public.submit_count($1, $2, $3)', [doc.id, await versionOf('stock_counts', doc.id), uid()]);
      if (!sent.ok) {
        failures.push(`${label}: التسليم ${sent.code}`);
        continue;
      }
      if (diff !== 0n) await call(db, U.manager, "update public.stock_count_lines set reason = 'خاصية', reason_diff = diff, reason_expired_diff = expired_diff where id = $1 returning id", [doc.lineId]);
      const reference = count.pickGainReferenceLot(candidates);
      let cost = null;
      if (diff > 0n && reference === null) {
        cost = BigInt(1 + Math.floor(random() * 99999999));
        await call(db, U.manager, 'insert into public.stock_count_line_costs (line_id, gain_unit_cost) values ($1, $2) returning line_id', [doc.lineId, (Number(cost) / 10000).toFixed(4)]);
        tally.manual += 1;
      }
      const plan = diff < 0n ? fifo.planDraw(lots, -diff, day, { tracksExpiry: false }) : { draws: [], shortage: 0n };
      const result = await call(db, U.manager, "select public.post_count($1, $2, public.preview_count($1) ->> 'plan', $3)", [doc.id, await versionOf('stock_counts', doc.id), uid()]);
      tally.counts += 1;
      const later = diff !== 0n && approvedCounts.some((c) => c.item === item && c.wh === wh && c.day > day);
      if (later) {
        tally.superseded += 1;
        if (result.ok || result.code !== 'count_superseded') failures.push(`${label}: جرد أحدث مرحَّل والقاعدة ${shown(result)}`);
      } else if (plan.shortage > 0n) {
        tally.countShort += 1;
        if (result.ok || result.code !== 'insufficient_stock') failures.push(`${label}: الخطّة نقص والقاعدة ${shown(result)}`);
      } else if (!result.ok) failures.push(`${label}: ${result.code} ${result.hint}`);
      else {
        posted.push({ kind: 'count', fn: 'void_count', id: doc.id });
        approvedCounts.push({ id: doc.id, item, wh, day, order: (countOrder += 1), moved: diff !== 0n });
        const line = result.value.lines[0];
        const got = drawsText(line.draws.map((d) => ({ lotId: d.lot_id, qty: milli(d.qty), value: fils(d.money.value) })));
        if (got !== drawsText(plan.draws)) failures.push(`${label}: النقص ${got} والخطّة ${drawsText(plan.draws)}`);
        const shortTotal = plan.draws.reduce((sum, d) => sum + d.value, 0n);
        if (fils(await docExpense('count', doc.id)) !== shortTotal) failures.push(`${label}: «فرق جرد» ${await docExpense('count', doc.id)} والنقص ${shortTotal}`);
        if (diff < 0n) tally.shortages += 1;
        if (diff > 0n) {
          tally.gains += 1;
          const want = count.gainValue(diff, reference, cost);
          const gained = line.gains.map((g) => [milli(g.qty), fils(g.money.value)]);
          if (gained.length !== 1 || gained[0][0] !== diff || gained[0][1] !== want) failures.push(`${label}: الزيادة ${JSON.stringify(line.gains)} والنموذج ${want} (القياس ${reference?.id ?? 'كلفة ' + cost})`);
        }
      }
    } else if (roll < 0.85) {
      const amount = BigInt(1 + Math.floor(random() * 250000));
      label = `مصروف ${step}`;
      const expenseId = uid();
      const result = await call(db, U.accountant, 'select public.record_expense($1, $2, $3, $4, $5, $6, $7, null, null, null, null, null, null, null, $8)', [
        expenseId, power, pick([D.general, D.feed_mill, D.broiler]), amount.toString(), day, 'cash', box, uid(),
      ]);
      if (!result.ok) failures.push(`${label}: ${result.code} ${result.hint}`);
      else {
        boxModel -= amount;
        tally.expenses += 1;
        posted.push({ kind: 'expense', fn: 'void_expense', id: expenseId, amount });
      }
    } else {
      // جرد ينتظر إلغاء أحدث منه يُختار أحياناً حتى فرع الرفض ينمرّ بيه.
      const waiting = posted.filter(voidBlockedBy);
      const target = waiting.length > 0 && random() < 0.3 ? pick(waiting) : random() < 0.5 ? posted.at(-1) : pick(posted);
      label = `إلغاء ${target.kind} ${step}`;
      const result = await call(db, U.manager, `select public.${target.fn}($1, $2, $3)`, [target.id, 'خاصية', uid()]);
      if (voidBlockedBy(target)) {
        tally.voidBlocked += 1;
        if (result.ok || result.code !== 'count_superseded') failures.push(`${label}: جرد أحدث انحسب على تسويته والقاعدة ${shown(result)}`);
      } else if (result.ok) {
        posted.splice(posted.indexOf(target), 1);
        tally.voids += 1;
        if (target.kind === 'expense') boxModel += target.amount;
        if (target.kind === 'count') approvedCounts.splice(approvedCounts.findIndex((c) => c.id === target.id), 1);
      } else if (result.code === 'lot_consumed') tally.consumed += 1;
      else failures.push(`${label}: ${result.code}`);
    }
    tally.done += 1;
    const stock = await db.asService(verifyStock);
    const ledgerCheck = await db.asService(verifyLedger);
    const bad = [...Object.entries(stock), ...Object.entries(ledgerCheck)].filter(([, v]) => v !== 0);
    if (bad.length || Object.keys(stock).length !== Object.keys(STOCK_ZERO).length || Object.keys(ledgerCheck).length !== Object.keys(LEDGER_ZERO).length) {
      failures.push(`بعد ${label}: ${JSON.stringify(Object.fromEntries(bad))}`);
    }
    const inBox = await boxBalance();
    if (inBox !== boxModel) failures.push(`بعد ${label}: الصندوق ${inBox} والنموذج ${boxModel}`);
  }
  console.log(`    · فحص الخصائص v3 (الصرف والجرد والمصاريف): البذرة ${SEED}، ${JSON.stringify(tally)}`);
  t.same(failures, [], `الخصائص v3 (البذرة ${SEED}): بعد كل خطوة verify_stock وverify_ledger صفر والصندوق = النموذج، وسحب الصرف ونقص الجرد = planDraw، والزيادة = gainValue، ومصروف المستند = سحبه`);
  t.ok(
    tally.done === STEPS && tally.useShort > 0 && tally.gains > 0 && tally.manual > 0 && tally.shortages > 0 && tally.expenses > 0 && tally.voids > 0 && tally.superseded > 0 && tally.voidBlocked > 0,
    `الخصائص v3 نفّذت كل الخطوات ومرّت بنقص الصرف وزيادة الجرد (وبكلفة المدير) ونقصه والمصاريف والإلغاء والجرد الأقدم بعد أحدث (ترحيلاً وإلغاءً) (${JSON.stringify(tally)})`,
  );
}

/** مولّد عشوائي ثابت بالبذرة (mulberry32): نفس البذرة نفس التسلسل، فالفشل ينعاد. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * نموذج الدفتر بالواجهة (src/domain/ledger.ts allocationPlan): قيود (الفلس) وتوزيعات حيّة؛ القيد الجديد يتوزّع بالخطّة، والإلغاء
 * يفكّ توزيعات أصله ويزوّجه بعكسه ثم يعيد توزيع ما انفكّ من الأقدم (القاعدة 27). المتبقّي = |المبلغ| − توزيعاته الحيّة.
 */
function makeModel(ledger) {
  const entries = new Map();
  const allocations = [];
  let seq = 0n;
  const remaining = (entry) => {
    let used = 0n;
    for (const a of allocations) if (a.live && (a.debit === entry.id || a.credit === entry.id)) used += a.amount;
    return (entry.amount < 0n ? -entry.amount : entry.amount) - used;
  };
  const openOf = (key, except) =>
    [...entries.values()]
      .filter((e) => e.key === key && e.id !== except)
      .map((e) => ({ id: e.id, amount: e.amount, remaining: remaining(e), opening: e.kind === 'opening' && !e.reverses, onDate: e.onDate, seq: e.seq }));
  const allocate = (entry) => {
    const rest = remaining(entry);
    if (rest <= 0n) return;
    const plan = ledger.allocationPlan(openOf(entry.key, entry.id), entry.amount > 0n ? rest : -rest);
    for (const { entryId, amount } of plan.allocations) {
      allocations.push(entry.amount > 0n ? { debit: entry.id, credit: entryId, amount, live: true } : { debit: entryId, credit: entry.id, amount, live: true });
    }
  };
  return {
    entries,
    remaining,
    add(entry) {
      seq += 1n;
      const full = { ...entry, seq };
      entries.set(full.id, full);
      allocate(full);
    },
    void(originalId, reversalId, onDate) {
      const original = entries.get(originalId);
      const freed = [];
      for (const a of allocations) {
        if (!a.live || (a.debit !== originalId && a.credit !== originalId)) continue;
        a.live = false;
        freed.push(a.debit === originalId ? a.credit : a.debit);
      }
      seq += 1n;
      const reversal = { id: reversalId, key: original.key, kind: original.kind, amount: -original.amount, onDate, seq, reverses: originalId };
      entries.set(reversalId, reversal);
      allocations.push(original.amount > 0n ? { debit: originalId, credit: reversalId, amount: original.amount, live: true } : { debit: reversalId, credit: originalId, amount: -original.amount, live: true });
      const again = [...new Set(freed)].map((id) => entries.get(id)).sort((a, b) => (a.onDate !== b.onDate ? (a.onDate < b.onDate ? -1 : 1) : a.seq < b.seq ? -1 : 1));
      for (const entry of again) allocate(entry);
    },
  };
}

async function propertyV1(t, db, { ledger, U, B, BOX, party }) {
  const SEED = 20261030;
  const STEPS = 72;
  const random = rng(SEED);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const amount = () => BigInt(1 + Math.floor(random() * 400)) * 1000n;
  const parties = [await party('جهة الخصائص أ'), await party('جهة الخصائص ب'), await party('جهة الخصائص ج')];
  const books = [[B.general, '2026-09-30'], [B.chicks, '2026-09-24']];
  const model = makeModel(ledger);
  const FILS = 100n;
  const dinar = (fils) => (fils / FILS).toString();
  let done = 0;
  let previews = 0;
  const failures = [];
  const posted = [];
  const balanceOf = (key) => [...model.entries.values()].filter((e) => e.key === key).reduce((sum, e) => sum + e.amount, 0n);
  for (let step = 0; step < STEPS && failures.length === 0; step += 1) {
    const p = pick(parties);
    const [book, goLive] = pick(books);
    const key = `${p}|${book}`;
    const roll = random();
    let result;
    let label;
    if (roll < 0.12) {
      const active = [...model.entries.values()].some((e) => e.key === key && e.kind === 'opening' && !e.reverses && ![...model.entries.values()].some((r) => r.reverses === e.id));
      const signed = random() < 0.5 ? amount() : -amount();
      const id = uid();
      label = `افتتاح ${signed}`;
      result = await call(db, U.manager, 'select public.record_opening_balance($1, $2, $3, $4, $5, $6)', [id, p, book, signed.toString(), goLive, uid()]);
      if (active) {
        if (shown(result) !== 'opening_exists') failures.push(`${label}: المتوقّع opening_exists وطلع ${shown(result)}`);
        continue;
      }
      if (result.ok) {
        model.add({ id, key, kind: 'opening', amount: signed * FILS, onDate: goLive });
        posted.push({ id, kind: 'opening' });
      }
    } else if (roll < 0.5) {
      const kind = random() < 0.6 ? 'payment' : 'payout';
      const value = amount();
      // المعاينة قبل الترحيل = allocationPlan على القيود المفتوحة اللي ترجّعها (بالفلس).
      const preview = await call(db, U.accountant, 'select public.preview_party_allocation($1, $2, $3, $4)', [p, book, kind, dinar(value * FILS)], { commit: false });
      const open = preview.value.money.open.map((e) => ({ id: e.entry_id, amount: BigInt(e.signed) * FILS, remaining: BigInt(e.remaining) * FILS, opening: e.opening, onDate: e.on_date, seq: BigInt(e.seq) }));
      const plan = ledger.allocationPlan(open, (kind === 'payment' ? -value : value) * FILS);
      const fromServer = preview.value.money.allocations.map((a) => ({ entryId: a.entry_id, amount: BigInt(a.amount) * FILS }));
      if (JSON.stringify(plan.allocations, (_, v) => (typeof v === 'bigint' ? `${v}` : v)) !== JSON.stringify(fromServer, (_, v) => (typeof v === 'bigint' ? `${v}` : v)) || plan.surplus !== BigInt(preview.value.money.surplus) * FILS) {
        failures.push(`معاينة ${kind} ${dinar(value * FILS)}: الخادم ${JSON.stringify(preview.value.money)} والواجهة ${plan.allocations.length} سطر وفائض ${plan.surplus}`);
      }
      previews += 1;
      const id = uid();
      label = `${kind} ${dinar(value * FILS)}`;
      result = await call(db, U.manager, `select public.${kind === 'payment' ? 'record_party_payment' : 'pay_party'}($1, $2, $3, $4, $5, $6, $7)`, [id, p, book, dinar(value * FILS), BOX, TODAY, uid()]);
      if (result.ok) {
        model.add({ id, key, kind, amount: (kind === 'payment' ? -value : value) * FILS, onDate: TODAY });
        posted.push({ id, kind });
      }
    } else if (roll < 0.68) {
      const direction = random() < 0.5 ? 'debit' : 'credit';
      const value = amount();
      const id = uid();
      label = `تسوية ${direction} ${dinar(value * FILS)}`;
      result = await call(db, U.manager, 'select public.record_party_adjustment($1, $2, $3, $4, $5, $6, $7, $8)', [id, p, book, direction, dinar(value * FILS), TODAY, 'خاصية', uid()]);
      if (result.ok) {
        model.add({ id, key, kind: 'adjustment', amount: (direction === 'debit' ? value : -value) * FILS, onDate: TODAY });
        posted.push({ id, kind: 'adjustment' });
      }
    } else if (roll < 0.8) {
      const current = balanceOf(key);
      if (current === 0n) continue;
      const magnitude = current < 0n ? -current : current;
      const value = (BigInt(Math.floor(random() * Number(magnitude / FILS))) + 1n) * FILS;
      const id = uid();
      label = `إعفاء ${dinar(value)}`;
      result = await call(db, U.manager, 'select public.forgive_debt($1, $2, $3, $4, $5, $6, $7)', [id, p, book, dinar(value), TODAY, 'خاصية', uid()]);
      if (result.ok) {
        model.add({ id, key, kind: 'forgiveness', amount: current > 0n ? -value : value, onDate: TODAY });
        posted.push({ id, kind: 'forgiveness' });
      }
    } else {
      // الإلغاء من الأحدث (FOUNDATION ٥٩٤) بنصّ الحالات، وبالباقي أصل عشوائي ما انلغى: إلغاء الأحدث بس ما يحرّر قيداً يلكى
      // مقابلاً مفتوحاً، فإعادة التوزيع (القاعدة 27) كانت تعبر بلا فحص (اختبار الطفرات WP3).
      const live = posted.filter((e) => ![...model.entries.values()].some((r) => r.reverses === e.id));
      const target = random() < 0.5 ? live.at(-1) : live[Math.floor(random() * live.length)];
      if (!target) continue;
      label = `إلغاء ${target.kind}`;
      const fn = ['payment', 'payout'].includes(target.kind) ? 'void_party_payment' : 'void_party_entry';
      result = await call(db, U.manager, `select public.${fn}($1, $2, $3)`, [target.id, 'خاصية', uid()]);
      if (result.ok) model.void(target.id, result.value.id, TODAY);
    }
    if (!result.ok) {
      failures.push(`${label}: رفض ${result.code}`);
      break;
    }
    done += 1;
    const verify = await db.asService(verifyLedger);
    const bad = Object.entries(verify).filter(([, v]) => v !== 0);
    if (bad.length) failures.push(`بعد ${label}: verify_ledger ${JSON.stringify(Object.fromEntries(bad))}`);
    for (const pp of parties) {
      for (const [bk] of books) {
        const k = `${pp}|${bk}`;
        const sqlRows = await remainders(db, pp, bk);
        const modelRows = [...model.entries.values()].filter((e) => e.key === k).sort((a, b) => (a.onDate !== b.onDate ? (a.onDate < b.onDate ? -1 : 1) : a.seq < b.seq ? -1 : 1));
        const left = sqlRows.map((r) => `${r.id}:${r.amount}:${r.remaining}`).join(',');
        const right = modelRows.map((e) => `${e.id}:${dinar(e.amount)}:${dinar(model.remaining(e))}`).join(',');
        if (left !== right) failures.push(`بعد ${label} (${k}): القاعدة ${left} والنموذج ${right}`);
        const ran = ledger.runBooks(modelRows.map((e) => ({ bookId: bk, date: e.onDate, doc: '', memo: e.kind, debit: e.amount > 0n ? e.amount : 0n, credit: e.amount < 0n ? -e.amount : 0n })));
        const closing = ran.get(bk)?.closing ?? 0n;
        if (BigInt(await balance(db, pp, bk)) * FILS !== closing) failures.push(`بعد ${label} (${k}): رصيد القاعدة ≠ runBooks`);
      }
    }
  }
  console.log(`    · فحص الخصائص v1: البذرة ${SEED}، ${done} خطوة من ${STEPS} و${previews} معاينة`);
  t.same(failures, [], `الخصائص v1 (البذرة ${SEED}): بعد كل خطوة verify_ledger صفر، والمتبقّي لكل قيد ورصيد كل دفتر = نموذج allocationPlan وrunBooks، والمعاينة = allocationPlan`);
  t.ok(done >= STEPS / 2 && previews > 0, `الخصائص v1 نفّذت أكثر من صفر حالة (${done} خطوة، ${previews} معاينة)`);
}
