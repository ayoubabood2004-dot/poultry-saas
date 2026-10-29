// أدوات مشتركة لفحوص المخزون (WP4: stock.test وstock-concurrency.test وcost-leak.test وproperty.test v2): منشأة بأدوارها ومخازنها
// ومواد من الدوالّ والسياسات الحقيقية، ومسوّدات افتتاح وتحويل بالكتابة المباشرة (§2.5)، وترحيلها بدوالّها، وقراءة الدفعات
// والأرصدة من الصفوف الخام (بمفتاح الإدارة) للمقارنة، وverify_stock كخريطة. مو ملف فحص (ما ينتهي بـ.test.mjs).
import { call, makeOrg, uid } from './ledger-kit.mjs';

export const STOCK_ZERO = {
  balance_identity: 0,
  lot_moves: 0,
  lot_shape: 0,
  reversal_pairs: 0,
  mirror_pairs: 0,
  draw_dates: 0,
  admissible: 0,
  value_conservation: 0,
  posted_division_stamped: 0,
};

/** verify_stock كخريطة اسم ← عدد (بمفتاح الخادم، أو بالاستعلام المعطى داخل معاملة ضابط). */
export const verifyStock = async (q) => Object.fromEntries((await q('select check_name, violations::int as v from public.verify_stock()')).rows.map((r) => [r.check_name, r.v]));

/**
 * منشأة مخزون: الأدوار (المالك والمدير والمحاسب والمشاهد بلا نطاق، والأمين بنطاق المخزن العامّ، وأمين المفقس بنطاق مخزن الأفراخ،
 * ومدير ثاني بنطاق مخزن الأدوية)،
 * ويوم تشغيل كل الوحدات goLive، والمخازن المزروعة (raw وfeed وhatching_egg وchick وmedicine وgeneral) ويّا حقلي لحم بمخزنيهما
 * (farm1 وfarm2)، ومخزن عامّ ثاني (general2)، ومخزن أفراخ ثاني (chick2)، وحقل بيض بمخزن بيض مائدة (table_egg). والمواد: كاز
 * أويل (fuel L)، علف (feed kg)، ذرة (raw kg)، لقاح (vaccine pc يتابع الانتهاء)، أفراخ (chick pc)، بيض مائدة (table_egg pc)، غاز
 * (fuel pc)، وتعبئة كيس 50 لعلف.
 */
export async function makeStockOrg(db, { name, id, phone, goLive }) {
  const G = await makeOrg(db, {
    name,
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['storekeeper', 'storekeeper'],
      ['hatcheryKeeper', 'storekeeper'],
      ['accountant', 'accountant'],
      ['viewer', 'viewer'],
      ['millOperator', 'mill_operator'],
      ['hallWorker', 'hall_worker', ['broiler']],
      ['scopedManager', 'manager'],
    ],
  });
  const { users: U, divisions: D } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  for (const kind of Object.keys(D)) await one(U.owner, 'select public.set_division_go_live($1, $2)', [D[kind], goLive]);
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [G.org])).rows.map((r) => [r.kind, r.id]));
  const site = async (division, label, kind) => one(U.owner, 'insert into public.sites (division_id, name, kind) values ($1, $2, $3) returning id', [D[division], label, kind]);
  const store = async (division, siteId, label, kind) =>
    one(U.owner, 'insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, $3, $4) returning id', [D[division], siteId, label, kind]);
  const farmSite = await site('broiler', 'حقل الأمل', 'farm');
  W.farm1 = await store('broiler', farmSite, 'مخزن حقل 1', 'farm');
  W.farm2 = await store('broiler', farmSite, 'مخزن حقل 2', 'farm');
  const generalSite = (await db.admin('select site_id from public.warehouses where id = $1', [W.general])).rows[0].site_id;
  W.general2 = await store('general', generalSite, 'مخزن عامّ ثانٍ', 'general');
  const hatcherySite = (await db.admin('select site_id from public.warehouses where id = $1', [W.chick])).rows[0].site_id;
  W.chick2 = await store('hatchery', hatcherySite, 'مخزن أفراخ ثانٍ', 'chick');
  const layerSite = await site('layer', 'حقل البيض', 'farm');
  W.table_egg = await store('layer', layerSite, 'مخزن بيض المائدة', 'table_egg');
  await one(U.owner, "select public.set_member_scopes_v2($1, '{}', '{}', array[$2]::uuid[])", [G.members.storekeeper, W.general]);
  await one(U.owner, "select public.set_member_scopes_v2($1, '{}', '{}', array[$2]::uuid[])", [G.members.hatcheryKeeper, W.chick]);
  await one(U.owner, "select public.set_member_scopes_v2($1, '{}', '{}', array[$2]::uuid[])", [G.members.scopedManager, W.medicine]);
  const item = async (label, kind, unit, extra = {}) =>
    one(U.owner, 'insert into public.items (name, kind, base_unit, tracks_expiry, min_qty) values ($1, $2, $3, $4, $5) returning id', [label, kind, unit, extra.tracksExpiry ?? false, extra.minQty ?? null]);
  const I = {
    diesel: await item('كاز أويل', 'fuel', 'L'),
    feed: await item('علف بادئ', 'feed', 'kg'),
    corn: await item('ذرة صفراء', 'raw', 'kg'),
    vaccine: await item('لقاح نيوكاسل', 'vaccine', 'pc', { tracksExpiry: true }),
    chicks: await item('أفراخ لحم', 'chick', 'pc'),
    eggs: await item('بيض مائدة', 'table_egg', 'pc'),
    gas: await item('غاز', 'fuel', 'pc'),
  };
  const pack = (await db.admin("select id from public.pack_types where org_id = $1 and factor = 50", [G.org])).rows[0].id;
  const bag = await one(U.owner, "insert into public.item_units (item_id, pack_type_id, label, factor_to_base, is_default) values ($1, $2, 'كيس 50 كغم', 50, true) returning id", [I.feed, pack]);
  return { ...G, W, I, bag, one };
}

/** مسوّدة افتتاح بسطورها (المستخدم بكتابة مباشرة): lines = [{ item, qty, value, zeroReason?, expiry?, bornAt? }]. يرجّع { id, version, lines }. */
export async function openingDraft(db, user, wh, onDate, lines) {
  return db.asUser(
    user,
    async (q) => {
      const docId = (await q('insert into public.opening_docs (warehouse_id, on_date) values ($1, $2) returning id', [wh, onDate])).rows[0].id;
      const ids = [];
      for (const line of lines) {
        ids.push(
          (await q('insert into public.opening_lines (doc_id, item_id, qty_base, value, zero_reason, expiry_on, born_at) values ($1, $2, $3, $4, $5, $6, $7) returning id', [
            docId, line.item, line.qty, line.value ?? null, line.zeroReason ?? null, line.expiry ?? null, line.bornAt ?? null,
          ])).rows[0].id,
        );
      }
      const version = (await q('select version from public.opening_docs where id = $1', [docId])).rows[0].version;
      return { id: docId, version, lines: ids };
    },
    { commit: true },
  );
}

/** مسوّدة تحويل بسطورها: lines = [{ item, qty, unit?, code? }]. يرجّع { id, version, lines }. */
export async function transferDraft(db, user, from, to, movedOn, lines) {
  return db.asUser(
    user,
    async (q) => {
      const docId = (await q('insert into public.transfers (from_warehouse_id, to_warehouse_id, moved_on) values ($1, $2, $3) returning id', [from, to, movedOn])).rows[0].id;
      const ids = [];
      for (const line of lines) {
        ids.push((await q('insert into public.transfer_lines (doc_id, item_id, qty_in_unit, item_unit_id, unit_code) values ($1, $2, $3, $4, $5) returning id', [docId, line.item, line.qty, line.unit ?? null, line.code ?? null])).rows[0].id);
      }
      const version = (await q('select version from public.transfers where id = $1', [docId])).rows[0].version;
      return { id: docId, version, lines: ids };
    },
    { commit: true },
  );
}

export const postOpening = (db, user, doc, ref = uid()) => call(db, user, 'select public.post_opening_stock($1, $2, $3)', [doc.id, doc.version, ref]);
export const postTransfer = (db, user, doc, ref = uid()) => call(db, user, 'select public.post_transfer($1, $2, $3)', [doc.id, doc.version, ref]);
export const voidOpening = (db, user, docId, reason = 'افتتاح خاطئ') => call(db, user, 'select public.void_opening_stock($1, $2, $3)', [docId, reason, uid()]);
export const voidTransfer = (db, user, docId, reason = 'تحويل خاطئ') => call(db, user, 'select public.void_transfer($1, $2, $3)', [docId, reason, uid()]);

/** افتتاح مرحَّل بخطوة وحدة (يرمي إذا ما انرحّل). */
export async function postedOpening(db, user, wh, onDate, lines) {
  const doc = await openingDraft(db, user, wh, onDate, lines);
  const result = await postOpening(db, user, doc);
  if (!result.ok) throw new Error(`افتتاح ما انرحّل: ${result.code} ${result.hint}`);
  return { ...doc, result: result.value };
}

/** تحويل مرحَّل بخطوة وحدة. */
export async function postedTransfer(db, user, from, to, movedOn, lines) {
  const doc = await transferDraft(db, user, from, to, movedOn, lines);
  const result = await postTransfer(db, user, doc);
  if (!result.ok) throw new Error(`تحويل ما انرحّل: ${result.code} ${result.hint}`);
  return { ...doc, result: result.value };
}

/** دفعات (مادّة، مخزن) من الصفوف الخام بترتيب الإنشاء: الكميات والقيم نصوصاً. */
export async function lotsOf(db, item, wh) {
  return (
    await db.admin(
      `select id, origin_lot_id, source_lot_id, fifo_seq::text as fifo_seq, received_on::text as received_on, expiry_on::text as expiry_on, born_at,
         trim_scale(qty_in)::text as qty_in, trim_scale(value_in)::text as value_in, trim_scale(qty_left)::text as qty_left, trim_scale(value_left)::text as value_left, source_kind
       from public.stock_lots where item_id = $1 and warehouse_id = $2 order by created_at, fifo_seq, id`,
      [item, wh],
    )
  ).rows;
}

/** رصيد (مادّة، مخزن) من الصفوف الخام: { qty, value } نصوصاً بلا أصفار زائدة (trim_scale) للمقارنة. */
export async function balanceOf(db, item, wh) {
  const row = (await db.admin('select trim_scale(qty)::text as qty, trim_scale(value)::text as value from public.stock_balances where item_id = $1 and warehouse_id = $2', [item, wh])).rows[0];
  return row ?? null;
}
