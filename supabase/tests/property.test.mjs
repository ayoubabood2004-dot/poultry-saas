// فحص الخصائص (خطّة المرحلة 1، الملحق C: v1 بـWP3، ويكبر لحد v5 بـWP7). v1 للدفاتر (بذرة ثابتة مطبوعة): افتتاحات وقبض ودفع
// وتسويات وإعفاءات وإلغاءات (من الأحدث وعشوائية) بالدوالّ الحقيقية بدور authenticated، وبعد كل خطوة verify_ledger صفر، والمتبقّي
// لكل قيد ورصيد كل (جهة، دفتر) = نموذج TS مبني من src/domain (allocationPlan وrunBooks)، والمعاينة = allocationPlan بالفلس.
// v2 للمخزون (WP4، بذرة ثابتة مطبوعة): افتتاحات وتحويلات (ومنها أكثر من المتاح، ومن مرآة لمرآة، ورجوع لمخزن الأصل) وإلغاءات
// (من الأحدث وعشوائية، والمرفوض lot_consumed منها صحيح)، وبعد كل خطوة verify_stock صفر؛ وسحب كل تحويل = fifo.planDraw على دفعات
// القاعدة قبله بالفلس، والرفض بالنقص لمّا الخطّة تكول نقص بالضبط.
import { loadSrc } from '../../scripts/tests/load-src.mjs';
import { balance, call, makeOrg, remainders, shown, uid, verifyLedger } from './ledger-kit.mjs';
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
