// بذرة مشغّل التراجع (الخطّة WP0 ٣): بيانات حقيقية من الدوالّ الحقيقية بدور authenticated، مو إدخال مباشر، حتى ملف
// التراجع ينفحص على قاعدة بيها بيانات مثل الإنتاج. كل حزمة تزيد كياناتها هنا (مخازن، جهات، مستندات) بنفس الطريقة.
// WP2 (0005): المدير يضيف تصنيفاً ومادّة برموز ووحدة من كيس، وحقلاً بمخزنه، ويحدّد يوم تشغيل؛ والأمين بنطاق وحدة (صفّ وحدة،
// فالتراجع يكمل). والطريق الثاني (BLOCKING): الأمين بنطاق مخزن، فالتراجع لازم يرفض بصوت وما يغيّر شي.
// WP3 (0006): المدير يضيف جهة وصندوقاً، والأمين يضيف مورّداً (party.create)، بلا قيد ولا حركة (بيانات أساسية، فالتراجع يكمل).
// والطريق الثاني: قيد افتتاح للجهة، أو رصيد افتتاحي للصندوق، أو وحدة تعبئة للمورّد: كل وحدة توقف التراجع بصوت.
// WP4 (0007): البذرة نفسها (المواد والمخازن، بلا مستند مخزون، فالتراجع يكمل ويشيل مشغّلَي التجميد والأرشفة). والطريق الثاني:
// مسوّدة افتتاح (المدير) أو مسوّدة تحويل (الأمين): كل مستند مخزون، ولو مسوّدة، يوقف التراجع بصوت.

const U = {
  owner: '60000000-0000-4000-8000-000000000001',
  manager: '60000000-0000-4000-8000-000000000002',
  storekeeper: '60000000-0000-4000-8000-000000000003',
};
const PHONE = { owner: '9647708000001', manager: '9647708000002', storekeeper: '9647708000003' };

const value = async (q, sql, params) => Object.values((await q(sql, params)).rows[0] ?? {})[0];

const hasTable = async (db, name) => Boolean(await value(db.admin, "select count(*)::int from pg_class where relname = $1 and relnamespace = 'public'::regnamespace", [name]));

export async function seedThroughRpcs(db) {
  for (const [key, id] of Object.entries(U)) {
    await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())', [id, PHONE[key]]);
  }
  await db.asUser(U.owner, (q) => q("select public.create_my_org('مزرعة البذرة', 'المالك')"), { commit: true });
  const general = (await db.admin("select d.id from public.divisions d join public.members m on m.org_id = d.org_id where m.user_id = $1 and d.kind = 'general'", [U.owner])).rows[0].id;
  for (const [key, role, divisions] of [['manager', 'manager', []], ['storekeeper', 'storekeeper', [general]]]) {
    const member = await db.asUser(U.owner, async (q) => (await q('select public.add_member($1, $2, $3, $4::uuid[]) as id', [`0${PHONE[key].slice(3)}`, role, key, divisions])).rows[0].id, { commit: true });
    await db.acceptInvite(U.owner, U[key], member);
  }
  // 0005: البيانات الأساسية بكتابة المدير المباشرة (السياسات الحقيقية)، ويوم التشغيل بدالّته.
  if (await hasTable(db, 'items')) {
    await db.asUser(
      U.manager,
      async (q) => {
        const category = await value(q, "insert into public.item_categories (name) values ('أعلاف') returning id");
        const item = await value(q, "insert into public.items (name, category_id, kind, base_unit, barcode, alt_codes) values ('ذرة صفراء', $1, 'raw', 'kg', '6221234', array['c-1']) returning id", [category]);
        const pack = await value(q, "select id from public.pack_types where dimension = 'mass' and factor = 50");
        await q("insert into public.item_units (item_id, pack_type_id, label, factor_to_base, is_default) values ($1, $2, 'كيس 50 كغم', 50, true)", [item, pack]);
        const broiler = await value(q, "select id from public.divisions where kind = 'broiler'");
        const site = await value(q, "insert into public.sites (division_id, name, kind) values ($1, 'حقل الأمل', 'farm') returning id", [broiler]);
        await q("insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن حقل الأمل', 'farm')", [broiler, site]);
        await q('select public.set_division_go_live($1, public.app_today() - 3)', [general]);
      },
      { commit: true },
    );
  }
  // 0006: جهة وصندوق بكتابة المدير المباشرة، ومورّد يضيفه الأمين (party.create)؛ بلا قيد ولا حركة.
  if (await hasTable(db, 'parties')) {
    await db.asUser(
      U.manager,
      async (q) => {
        await q("insert into public.parties (name, phone, is_customer) values ('أبو علي', '0770 111 2233', true)");
        await q("insert into public.cash_accounts (name, kind) values ('الصندوق', 'cash')");
      },
      { commit: true },
    );
    await db.asUser(U.storekeeper, (q) => q("insert into public.parties (name, is_supplier) values ('مورّد الحبوب', true)"), { commit: true });
  }
  await db.asUser(U.manager, (q) => q('select public.set_period_lock(public.app_today() - 30)'), { commit: true });
  return U;
}

/** الأمين بنطاق موقع وحده أو مخزن وحده (set_member_scopes_v2 بالمالك)، بعد البذرة الحقيقية. */
const scopeKeeper = (kind) => async (db) => {
  await seedThroughRpcs(db);
  const keeper = await value(db.admin, 'select id from public.members where user_id = $1', [U.storekeeper]);
  const target = await value(db.admin, kind === 'site' ? "select site_id from public.warehouses where kind = 'general'" : "select id from public.warehouses where kind = 'general'");
  const sql = kind === 'site' ? "select public.set_member_scopes_v2($1, '{}', array[$2]::uuid[], '{}')" : "select public.set_member_scopes_v2($1, '{}', '{}', array[$2]::uuid[])";
  await db.asUser(U.owner, (q) => q(sql, [keeper, target]), { commit: true });
};

const REF = (n) => `60000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;

/** بعد البذرة الحقيقية: قيد افتتاح للجهة بالدفتر العامّ، أو رصيد افتتاحي للصندوق، أو وحدة تعبئة مربوطة بالمورّد (المدير). */
const ledgerSeed = (kind) => async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(
    U.manager,
    async (q) => {
      const party = await value(q, "select id from public.parties where name = 'أبو علي'");
      if (kind === 'entry') {
        const book = await value(q, "select b.id from public.ledger_books b join public.divisions d on d.id = b.division_id where d.kind = 'general'");
        await q('select public.record_opening_balance($1, $2, $3, 500000, public.app_today() - 3, $4)', [REF(1), party, book, REF(2)]);
      } else if (kind === 'move') {
        const box = await value(q, "select id from public.cash_accounts where name = 'الصندوق'");
        await q('select public.record_cash_opening($1, $2, 250000, public.app_today() - 3, $3)', [REF(3), box, REF(4)]);
      } else {
        const item = await value(q, "select id from public.items where name = 'ذرة صفراء'");
        await q("insert into public.item_units (item_id, party_id, label, factor_to_base) values ($1, $2, 'كيس المورّد 48 كغم', 48)", [item, party]);
      }
    },
    { commit: true },
  );
};

const CONDITION = 'v_entries > 0 or v_moves > 0 or v_units > 0';

/** بعد البذرة الحقيقية: مسوّدة افتتاح للمخزن العامّ (المدير)، أو مسوّدة تحويل منه لمخزن المواد الأوّلية (الأمين بنطاق العامّة). */
const stockSeed = (kind) => async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(
    kind === 'opening' ? U.manager : U.storekeeper,
    async (q) => {
      const general = await value(q, "select id from public.warehouses where kind = 'general'");
      if (kind === 'opening') await q('insert into public.opening_docs (warehouse_id, on_date) values ($1, public.app_today() - 3)', [general]);
      else await q('insert into public.transfers (from_warehouse_id, to_warehouse_id, moved_on) values ($1, $2, public.app_today())', [general, await value(q, "select id from public.warehouses where kind = 'raw'")]);
    },
    { commit: true },
  );
};

const STOCK_CONDITION = 'v_openings > 0 or v_transfers > 0';

/**
 * الطريق الثاني لملف تراجع (الخطّة WP2): بذور يلزم التراجع يرفضها بصوت برمزها، والكتالوج والبيانات تبقى كما هي. بالرقم،
 * وكل رقم قائمة حالات. 0005: نطاق بموقع وحده ونطاق بمخزن وحده، كل وحدة بحالتها، حتى شرط الرفض (site_id أو warehouse_id)
 * ينفحص فرعاً فرعاً: mutate يشيل فرع الحالة من الشرط، والمشغّل يثبت إن التراجع يكمل بلاه (الحالة تحتاج فرعها).
 * 0006: قيد جهة، وحركة صندوق، ووحدة تعبئة لمورّد، كل وحدة بحالتها وفرعها (البصمة ويّا عدد المواد، فتسرّب ضابط الرفض يبين).
 */
export const BLOCKING_SEEDS = {
  5: [
    {
      name: 'نطاق بموقع',
      code: 'rollback_blocked',
      seed: scopeKeeper('site'),
      /** بصمة البيانات اللي التراجع لازم ما يمسّها: صفوف النطاق بالموقع، والمواد. */
      data: "select (select count(*) from public.member_scopes where site_id is not null and archived_at is null)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('where site_id is not null or warehouse_id is not null', 'where warehouse_id is not null'),
    },
    {
      name: 'نطاق بمخزن',
      code: 'rollback_blocked',
      seed: scopeKeeper('warehouse'),
      data: "select (select count(*) from public.member_scopes where warehouse_id is not null and archived_at is null)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('where site_id is not null or warehouse_id is not null', 'where site_id is not null'),
    },
  ],
  6: [
    {
      name: 'قيد جهة',
      code: 'rollback_blocked',
      seed: ledgerSeed('entry'),
      data: "select (select count(*) from public.party_entries)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace(CONDITION, 'v_moves > 0 or v_units > 0'),
    },
    {
      name: 'حركة صندوق',
      code: 'rollback_blocked',
      seed: ledgerSeed('move'),
      data: "select (select count(*) from public.cash_moves)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace(CONDITION, 'v_entries > 0 or v_units > 0'),
    },
    {
      name: 'وحدة تعبئة لمورّد',
      code: 'rollback_blocked',
      seed: ledgerSeed('unit'),
      data: "select (select count(*) from public.item_units where party_id is not null)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace(CONDITION, 'v_entries > 0 or v_moves > 0'),
    },
  ],
  7: [
    {
      name: 'مسوّدة افتتاح',
      code: 'rollback_blocked',
      seed: stockSeed('opening'),
      data: "select (select count(*) from public.opening_docs)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace(STOCK_CONDITION, 'v_transfers > 0'),
    },
    {
      name: 'مسوّدة تحويل',
      code: 'rollback_blocked',
      seed: stockSeed('transfer'),
      data: "select (select count(*) from public.transfers)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace(STOCK_CONDITION, 'v_openings > 0'),
    },
  ],
};

/** عدد حالات الرفض اللازم لكل ملف تراجع: [الرقم، العدد، شنو]. */
export const BLOCKING_REQUIRED = [
  [5, 2, 'نطاق بموقع ونطاق بمخزن، كل وحدة توقف التراجع'],
  [6, 3, 'قيد جهة وحركة صندوق ووحدة تعبئة لمورّد، كل وحدة توقف التراجع'],
  [7, 2, 'مسوّدة افتتاح ومسوّدة تحويل، كل وحدة توقف التراجع'],
];
