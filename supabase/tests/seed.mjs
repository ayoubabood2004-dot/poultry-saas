// بذرة مشغّل التراجع (الخطّة WP0 ٣): بيانات حقيقية من الدوالّ الحقيقية بدور authenticated، مو إدخال مباشر، حتى ملف
// التراجع ينفحص على قاعدة بيها بيانات مثل الإنتاج. كل حزمة تزيد كياناتها هنا (مخازن، جهات، مستندات) بنفس الطريقة.
// WP2 (0005): المدير يضيف تصنيفاً ومادّة برموز ووحدة من كيس، وحقلاً بمخزنه، ويحدّد يوم تشغيل؛ والأمين بنطاق وحدة (صفّ وحدة،
// فالتراجع يكمل). والطريق الثاني (BLOCKING): الأمين بنطاق مخزن، فالتراجع لازم يرفض بصوت وما يغيّر شي.
// WP3 (0006): المدير يضيف جهة وصندوقاً، والأمين يضيف مورّداً (party.create)، بلا قيد ولا حركة (بيانات أساسية، فالتراجع يكمل).
// والطريق الثاني: قيد افتتاح للجهة، أو رصيد افتتاحي للصندوق، أو وحدة تعبئة للمورّد: كل وحدة توقف التراجع بصوت.
// WP4 (0007): البذرة نفسها (المواد والمخازن، بلا مستند مخزون، فالتراجع يكمل ويشيل مشغّلَي التجميد والأرشفة). والطريق الثاني:
// مسوّدة افتتاح (المدير) أو مسوّدة تحويل (الأمين): كل مستند مخزون، ولو مسوّدة، يوقف التراجع بصوت.
// WP5 (0008): البذرة نفسها (بلا مصروف ولا صرف ولا جرد، فالتراجع يكمل). والطريق الثاني: مصروف نقدي (المدير) أو مسوّدة صرف أو
// مسوّدة جرد (الأمين): كل وحدة توقف التراجع بصوت.
// 0012: البذرة نفسها (بلا قاعة ولا فوج، فالتراجع يكمل). والطريق الثاني: قاعة بفوج مفتوح وجولة يومه (المدير) توقف التراجع بصوت.
// 0016: البذرة نفسها وفوقها بيانات معمل يمرّ عليها التراجع (مراجعة 0016 الثالثة #3، ق٣٤: ROLLBACK_EXTRAS أدناه)، فالتراجع يكمل. والطريق
// الثاني: معدّل تكاليف بخلطة، وسطر تكاليف ومادّة بديلة بدفعة مسوّدة، وسعر كلفة مكتوب، وخلطة مفعَّلة بكاز خارج الكتلة (مراجعة 0016 الثانية
// #1)، وخلطة مفعَّلة تغيّرت وحدة مادّة فيها بعد تفعيلها (مراجعة 0016 الثالثة #2): كل وحدة توقف التراجع بصوت.
// 0017: البذرة نفسها وفوقها استلام مرحَّل بـpost_receipt (الجسم المشترك)، وبين التراجع والإعادة استلام ثانٍ بجسم 0009، وبعد الإعادة شراء
// بـrecord_purchase (ROLLBACK_EXTRAS أدناه)، فالتراجع يكمل. والطريق الثاني: شراء مسجَّل بسعره (صفّ في purchase_prices) يوقف التراجع بصوت.
// 0018: البذرة نفسها وفوقها شراء بالعامّة بعد يوم تشغيلها وافتتاح بيومه، وبعد الإعادة شراء بالمعمل بلا يوم تشغيل (ROLLBACK_EXTRAS)، فالتراجع يكمل.
// والطريق الثاني بثلاثة فروع، كلّ واحد ببذرته: ترحيل بوحدة بلا يوم تشغيل، ومستند عاديّ قبل يوم تشغيل وحدته، وافتتاح بعده.

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

/** بعد البذرة الحقيقية: مصروف نقدي من الصندوق على الوحدة العامّة (المدير)، أو مسوّدة صرف أو مسوّدة جرد بالمخزن العامّ (الأمين). */
const wp5Seed = (kind) => async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(
    kind === 'expense' ? U.manager : U.storekeeper,
    async (q) => {
      const general = await value(q, "select id from public.warehouses where kind = 'general'");
      if (kind === 'expense') {
        const category = await value(q, "insert into public.expense_categories (name) values ('كهرباء') returning id");
        const division = await value(q, "select id from public.divisions where kind = 'general'");
        const box = await value(q, "select id from public.cash_accounts where name = 'الصندوق'");
        await q("select public.record_expense($1, $2, $3, 1000, public.app_today(), 'cash', $4, null, null, null, null, null, null, null, $5)", [REF(5), category, division, box, REF(6)]);
      } else if (kind === 'use') await q('insert into public.stock_uses (warehouse_id, used_on) values ($1, public.app_today())', [general]);
      else await q('insert into public.stock_counts (warehouse_id, counted_on) values ($1, public.app_today())', [general]);
    },
    { commit: true },
  );
};

/** بعد البذرة الحقيقية: مسوّدة استلام بالمخزن العامّ من «مورّد الحبوب» (الأمين بنطاق العامّة). */
const receiptSeed = async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(
    U.storekeeper,
    async (q) => {
      const general = await value(q, "select id from public.warehouses where kind = 'general'");
      const party = await value(q, "select id from public.parties where name = 'مورّد الحبوب'");
      await q('insert into public.receipts (party_id, warehouse_id, received_on) values ($1, $2, public.app_today())', [party, general]);
    },
    { commit: true },
  );
};

const RECEIPT_CONDITION = 'v_receipts > 0';

/** بعد البذرة الحقيقية: استلام مرحَّل بالمخزن العامّ (كاز من «مورّد الحبوب») ومسوّدة مرتجع منه (الأمين). */
const returnSeed = async (db) => {
  await seedThroughRpcs(db);
  const { general, party } = await db.asUser(
    U.storekeeper,
    async (q) => ({
      general: await value(q, "select id from public.warehouses where kind = 'general'"),
      party: await value(q, "select id from public.parties where name = 'مورّد الحبوب'"),
    }),
    { commit: false },
  );
  const item = await db.asUser(U.manager, (q) => value(q, "insert into public.items (name, kind, base_unit) values ('كاز أبيض', 'fuel', 'L') returning id"), { commit: true });
  const receipt = await db.asUser(U.storekeeper, async (q) => {
    const id = await value(q, 'insert into public.receipts (party_id, warehouse_id, received_on) values ($1, $2, public.app_today()) returning id', [party, general]);
    await q('insert into public.receipt_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 10)', [id, item]);
    return id;
  }, { commit: true });
  await db.asUser(U.manager, async (q) => {
    await q('insert into public.receipt_line_amounts (line_id, line_total) select id, 7500 from public.receipt_lines where doc_id = $1', [receipt]);
    const version = await value(q, 'select version from public.receipts where id = $1', [receipt]);
    await q('select public.post_receipt($1, $2, $3)', [receipt, version, REF(9)]);
  }, { commit: true });
  await db.asUser(U.storekeeper, async (q) => {
    await q('insert into public.supplier_returns (receipt_id, returned_on) values ($1, public.app_today())', [receipt]);
  }, { commit: true });
};

const RETURN_CONDITION = 'v_returns + v_revaluations > 0';

/** بعد البذرة الحقيقية: استلام مرحَّل بالمخزن العامّ (كاز من «مورّد الحبوب») يلغيه المدير وينسخه للتصحيح (0011): الورقة تحمل أصلها. */
const copySeed = async (db) => {
  await seedThroughRpcs(db);
  const { general, party } = await db.asUser(
    U.storekeeper,
    async (q) => ({
      general: await value(q, "select id from public.warehouses where kind = 'general'"),
      party: await value(q, "select id from public.parties where name = 'مورّد الحبوب'"),
    }),
    { commit: false },
  );
  const item = await db.asUser(U.manager, (q) => value(q, "insert into public.items (name, kind, base_unit) values ('كاز النسخة', 'fuel', 'L') returning id"), { commit: true });
  const receipt = await db.asUser(U.storekeeper, async (q) => {
    const id = await value(q, 'insert into public.receipts (party_id, warehouse_id, received_on) values ($1, $2, public.app_today()) returning id', [party, general]);
    await q('insert into public.receipt_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 10)', [id, item]);
    return id;
  }, { commit: true });
  await db.asUser(U.manager, async (q) => {
    await q('insert into public.receipt_line_amounts (line_id, line_total) select id, 7500 from public.receipt_lines where doc_id = $1', [receipt]);
    const version = await value(q, 'select version from public.receipts where id = $1', [receipt]);
    await q('select public.post_receipt($1, $2, $3)', [receipt, version, REF(13)]);
    await q("select public.void_receipt($1, 'نسخة للتصحيح', $2)", [receipt, REF(14)]);
    await q("select public.copy_doc_to_draft('receipt', $1, $2, $3)", [receipt, REF(15), REF(16)]);
  }, { commit: true });
};

const COPY_CONDITION = 'v_copies > 0';

/** 0012: المدير يضيف قاعة بحقل الأمل (كتابة مباشرة) ويفتح فيها فوجاً ويسجّل جولة يومه: بيانات الحقول توقف التراجع بصوت. */
const flockSeed = async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    const site = await value(q, "select id from public.sites where name = 'حقل الأمل'");
    const hall = await value(q, "insert into public.halls (site_id, name, capacity) values ($1, 'قاعة 1', 12000) returning id", [site]);
    const flock = await value(q, "select public.open_flock($1, public.app_today() - 2, 10000, 1, 'روس 308', $2) ->> 'flock_id'", [hall, REF(20)]);
    await q('select public.save_flock_day($1, public.app_today(), 12, 3, 450, null, null, null, null, null, null, null, null, $2, false)', [flock, REF(21)]);
  }, { commit: true });
};

const FLOCK_CONDITION = 'v_halls + v_flocks + v_days + v_rejects + v_weights > 0';

/**
 * 0012: قاعة بلا فوج ولا جولة. كل بيانات الحقول تحتاج قاعة، ففرع v_halls هو اللي يوقف التراجع هنا وحده: طفرة تشيله (التراجع
 * يشيل جدول القاعات بصفّه) تعبر بذرة «قاعة بفوج وجولة» لأن الفوج يوقفها، وهاي البذرة تمسكها.
 */
const hallSeed = async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    const site = await value(q, "select id from public.sites where name = 'حقل الأمل'");
    await q("insert into public.halls (site_id, name) values ($1, 'قاعة بلا فوج')", [site]);
  }, { commit: true });
};

const WP5_CONDITION = 'v_expenses > 0 or v_uses > 0 or v_counts > 0';

/**
 * الطريق الثاني لملف تراجع (الخطّة WP2): بذور يلزم التراجع يرفضها بصوت برمزها، والكتالوج والبيانات تبقى كما هي. بالرقم،
 * وكل رقم قائمة حالات. 0005: نطاق بموقع وحده ونطاق بمخزن وحده، كل وحدة بحالتها، حتى شرط الرفض (site_id أو warehouse_id)
 * ينفحص فرعاً فرعاً: mutate يشيل فرع الحالة من الشرط، والمشغّل يثبت إن التراجع يكمل بلاه (الحالة تحتاج فرعها).
 * 0006: قيد جهة، وحركة صندوق، ووحدة تعبئة لمورّد، كل وحدة بحالتها وفرعها (البصمة ويّا عدد المواد، فتسرّب ضابط الرفض يبين).
 */
/**
 * 0014: سعر بيع مكتوب لمادّة. التراجع يُسقط جدول item_prices فيمسح قائمة الأسعار (بيانات كتبها المالك بيده ولا تُستخرج من
 * مكان آخر)، فطريق الرفض يوقفه إلى أن تُصدَّر. والطفرة تشيل شرط «بالجدول صفّ» فيكمل التراجع ويمسحها بصمت.
 */
const priceSeed = async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    const item = await value(q, "select id from public.items where name = 'ذرة صفراء'");
    await q('select public.set_item_sell_price($1, 1750, null)', [item]);
  }, { commit: true });
};

const PRICE_CONDITION = 'v_rows > 0 and';

/**
 * 0015: خلطة مفعَّلة (المدير): «علف بادئ 1» ناتجها مادّة علف، ونسختها الأولى سطر واحد ذرة 1,000 كغم لأساس 1,000 كغم.
 * التراجع يُسقط جدول الخلطات فيمسح التشكيلة التي كتبها المالك بيده، فطريق الرفض يوقفه. والطفرة تُبقي فرع دفعات الإنتاج
 * وحده: هذه البذرة بلا دفعة، فالتراجع يكمل ويمسح الخلطة بصمت.
 */
const recipeSeed = async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    const corn = await value(q, "select id from public.items where name = 'ذرة صفراء'");
    const feed = await value(q, "insert into public.items (name, kind, base_unit) values ('علف بادئ', 'feed', 'kg') returning id");
    const recipe = await value(q, "insert into public.recipes (name, output_item_id) values ('علف بادئ 1', $1) returning id", [feed]);
    const version = await value(q, 'insert into public.recipe_versions (recipe_id, basis_kg) values ($1, 1000) returning id', [recipe]);
    await q("insert into public.recipe_lines (version_id, item_id, qty, unit) values ($1, $2, 1000, 'kg')", [version, corn]);
    await q('select public.activate_recipe_version($1, (select version from public.recipe_versions where id = $1))', [version]);
  }, { commit: true });
};

/**
 * 0015: دفعة إنتاج مسوّدة بلقطة العليقة (بلا ترحيل): فرع الدفعات هو الذي يوقف التراجع هنا. ولا تصلح دفعة مرحَّلة بذرةً:
 * دفعة ناتجها وحركاتها تبقى في المخزون بعد إسقاط الجداول، فالقيد المستعاد (stock_lots_source_kind_check بلا 'production')
 * يرفض الملف حتّى بلا كتلة الرفض، فلا يُفحَص الحرّاس. والحقيقة أقوى: المرحَّلة توقفه بفرعها وبقيده سواء.
 */
const draftBatchSeed = async (db) => {
  await recipeSeed(db);
  await db.asUser(U.manager, async (q) => {
    const mill = await value(q, "select id from public.divisions where kind = 'feed_mill'");
    await q('select public.set_division_go_live($1, public.app_today() - 3)', [mill]);
    const raw = await value(q, "select id from public.warehouses where kind = 'raw'");
    const feedWh = await value(q, "select id from public.warehouses where kind = 'feed'");
    const version = await value(q, "select id from public.recipe_versions where status = 'active'");
    await q('select public.create_production($1, $2, 500, $3, $4, public.app_today())', [REF(22), version, raw, feedWh]);
  }, { commit: true });
};

const MILL_CONDITION = 'v_recipes + v_versions > 0 or v_batches + v_moves + v_lots > 0';

/**
 * 0016: خلطة مفعَّلة بتكاليف لكلّ طنّ (المدير، create_recipe بنداء واحد): «علف بادئ 2» بسطر ذرة 1,000 كغم لأساس 1,000 كغم،
 * و«أيدي عاملة» 5,000 لكلّ طنّ. التراجع يُسقط جدول المعدّلات فيمسح ما كتبه المالك بيده، فطريق الرفض يوقفه؛ والطفرة تشيل فرع
 * المعدّلات وحده (البذرة بلا دفعة ولا سعر كلفة)، فيكمل التراجع ويمسحها بصمت.
 */
const rateSeed = async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    const corn = await value(q, "select id from public.items where name = 'ذرة صفراء'");
    const feed = await value(q, "insert into public.items (name, kind, base_unit) values ('علف بادئ', 'feed', 'kg') returning id");
    const labor = await value(q, "insert into public.expense_categories (name) values ('أيدي عاملة') returning id");
    await q(
      "select public.create_recipe($1, $2, 'علف بادئ 2', $3, 1000, jsonb_build_array(jsonb_build_object('item_id', $4::uuid, 'qty', 1000, 'unit', 'kg')), jsonb_build_array(jsonb_build_object('category_id', $5::uuid, 'amount_per_ton', 5000)), true)",
      [REF(30), REF(31), feed, corn, labor],
    );
  }, { commit: true });
};

/**
 * 0016: دفعة مسوّدة من خلطة 0015 (بلا معدّلات): سطر تكاليف يدوي «نقل» 25,000 يكتبه المدير، ومادّة بديلة (النخالة بدل الذرة
 * بسببها). فرع الدفعات (سطور التكاليف والتحميلات والبدائل) هو الذي يوقف التراجع هنا وحده.
 */
const batchCostSeed = async (db) => {
  await draftBatchSeed(db);
  await db.asUser(U.manager, async (q) => {
    const transport = await value(q, "insert into public.expense_categories (name) values ('نقل') returning id");
    await q('insert into public.production_costs (batch_id, category_id, amount) values ($1, $2, 25000)', [REF(22), transport]);
    const bran = await value(q, "insert into public.items (name, kind, base_unit) values ('نخالة', 'raw', 'kg') returning id");
    const cornLine = await value(q, 'select id from public.production_inputs where batch_id = $1', [REF(22)]);
    await q("select public.add_production_input($1, $2, $3, 500, $4, 'نفدت الذرة في المخزن')", [REF(22), REF(32), bran, cornLine]);
  }, { commit: true });
};

/** 0016: سعر كلفة مكتوب لمادّة بلا سعر بيع (المدير): التراجع يُسقط العمود فيمسحه، والطفرة تشيل فرع الأسعار وحده. */
const costPriceSeed = async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    const item = await value(q, "select id from public.items where name = 'ذرة صفراء'");
    await q('select public.set_item_cost_price($1, 1500, null)', [item]);
  }, { commit: true });
};

const COSTS_CONDITION = 'v_rates > 0 or v_costs + v_allocs + v_replaced > 0 or v_prices > 0';

/**
 * 0016 (مراجعة 0016 الثانية #1): خلطة مفعَّلة فيها كاز خارج الكتلة (المدير، create_recipe بنداء واحد): «علف بادئ بالكاز» ذرة 1,000 كغم
 * وكاز 20 لتراً (17 كغم بكثافة 0.85) لأساس 1,000 كغم. مجموع كلّ سطورها 1,017 ≠ الأساس، فبعد التراجع يرفضها فحص 0015 الثاني
 * (recipe_basis_mismatch) والنسخة المجمَّدة لا تُعدَّل؛ فطريق الرفض يوقفه. والطفرة تشيل فرع الأساس وحده (البذرة بلا معدّل ولا دفعة ولا سعر
 * كلفة)، فيكمل التراجع ويترك الخلطة مخالفة.
 */
const fuelRecipeSeed = async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    const corn = await value(q, "select id from public.items where name = 'ذرة صفراء'");
    const kerosene = await value(q, "insert into public.items (name, kind, base_unit, density_kg_per_l) values ('كاز المولّدة', 'fuel', 'L', 0.85) returning id");
    const feed = await value(q, "insert into public.items (name, kind, base_unit) values ('علف بادئ', 'feed', 'kg') returning id");
    await q(
      "select public.create_recipe($1, $2, 'علف بادئ بالكاز', $3, 1000, jsonb_build_array(jsonb_build_object('item_id', $4::uuid, 'qty', 1000, 'unit', 'kg'), jsonb_build_object('item_id', $5::uuid, 'qty', 20, 'unit', 'L')), '[]'::jsonb, true)",
      [REF(33), REF(34), feed, corn, kerosene],
    );
  }, { commit: true });
};

/**
 * 0016 (مراجعة 0016 الثالثة #2): خلطة مفعَّلة فيها مادّة أوّلية بالكيلو بلا حركة («زيت مسجّل بالكيلو» 17 كغم مع ذرة 983 لأساس 1,000)، ثمّ تُصحَّح
 * المادّة لتراً بكثافة. قاعدة 0016 تقرأ لقطة الوحدة (كيلوغرام) فالثوابت صفر، وفحص 0015 الثالث يقرأ الوحدة الحيّة فيرفض النسخة بعد التراجع
 * (recipe_frozen_bad_lines)، والمجمَّدة لا تُعدَّل؛ فطريق الرفض يوقفه. والطفرة تشيل فرع الوحدة وحده (البذرة بلا معدّل ولا دفعة ولا سعر كلفة،
 * ومجموع كلّ سطورها = الأساس)، فيكمل التراجع ويترك الخلطة مخالفة.
 */
const unitChangedSeed = async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    const corn = await value(q, "select id from public.items where name = 'ذرة صفراء'");
    const oil = await value(q, "insert into public.items (name, kind, base_unit) values ('زيت مسجّل بالكيلو', 'raw', 'kg') returning id");
    const feed = await value(q, "insert into public.items (name, kind, base_unit) values ('علف بادئ', 'feed', 'kg') returning id");
    await q(
      "select public.create_recipe($1, $2, 'علف بادئ بالزيت', $3, 1000, jsonb_build_array(jsonb_build_object('item_id', $4::uuid, 'qty', 983, 'unit', 'kg'), jsonb_build_object('item_id', $5::uuid, 'qty', 17, 'unit', 'kg')), '[]'::jsonb, true)",
      [REF(35), REF(36), feed, corn, oil],
    );
    await q("update public.items set base_unit = 'L', density_kg_per_l = 0.85 where id = $1", [oil]);
  }, { commit: true });
};

/**
 * 0017: شراء مسجَّل بنداء واحد (المدير، record_purchase): كاز بالمخزن العامّ من «مورّد الحبوب» بالدين، 20 لتراً بـ750 وسعر بيع 900. التراجع
 * يُسقط purchase_prices فيمسح سعر الوحدة كما كُتب وسعر البيع لكلّ شراء، فطريق الرفض يوقفه؛ والطفرة تشيل شرط «في الجدول صفّ» فيكمل ويمسحها.
 */
const purchaseSeed = async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    const fuel = await value(q, "insert into public.items (name, kind, base_unit) values ('كاز الشراء', 'fuel', 'L') returning id");
    const party = await value(q, "select id from public.parties where name = 'مورّد الحبوب'");
    await q("select public.record_purchase($1, $2, $3, $4, $5, public.app_today(), 20, 750, 900, 'credit', null, null)", [REF(50), REF(51), REF(52), fuel, party]);
  }, { commit: true });
};

const PURCHASE_CONDITION = 'if v_rows > 0 then';

/**
 * 0018 (بلا يوم تشغيل): ثلاث بذور، كلّ واحدة تحتاج فرعها من شرط الرفض. المدير بدوالّ 0018:
 * (١) شراء ذرة بالمعمل ويوم تشغيله فارغ (first_posted_at بلا go_live_on)؛ (٢) يوم تشغيل المعمل بعد خمسة أيّام ثمّ شراء اليوم (مستند قبل يومه)؛
 * (٣) افتتاح كاز بالمخزن العامّ اليوم ويوم تشغيل العامّة قبل ثلاثة أيّام (افتتاح بعد يومه).
 */
const goLiveSeed = (kind) => async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    const corn = await value(q, "select id from public.items where name = 'ذرة صفراء'");
    const party = await value(q, "select id from public.parties where name = 'مورّد الحبوب'");
    if (kind === 'unset') {
      await q("select public.record_purchase($1, $2, $3, $4, $5, public.app_today(), 10, 450, null, 'credit', null, null)", [REF(60), REF(61), REF(62), corn, party]);
    } else if (kind === 'early') {
      const mill = await value(q, "select id from public.divisions where kind = 'feed_mill'");
      await q('select public.set_division_go_live($1, public.app_today() + 5)', [mill]);
      await q("select public.record_purchase($1, $2, $3, $4, $5, public.app_today(), 10, 450, null, 'credit', null, null)", [REF(63), REF(64), REF(65), corn, party]);
    } else {
      const general = await value(q, "select id from public.warehouses where kind = 'general'");
      const fuel = await value(q, "insert into public.items (name, kind, base_unit) values ('كاز الافتتاح', 'fuel', 'L') returning id");
      const doc = await value(q, 'insert into public.opening_docs (warehouse_id, on_date) values ($1, public.app_today()) returning id', [general]);
      await q('insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, 50, 40000)', [doc, fuel]);
      await q('select public.post_opening_stock($1, (select version from public.opening_docs where id = $1), $2)', [doc, REF(66)]);
    }
  }, { commit: true });
};

export const BLOCKING_SEEDS = {
  18: [
    {
      name: 'ترحيل بوحدة بلا يوم تشغيل',
      code: 'rollback_blocked',
      seed: goLiveSeed('unset'),
      data: "select (select count(*) from public.divisions where first_posted_at is not null and go_live_on is null)::text || '/' || (select count(*) from public.receipts where status = 'posted')::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_unset > 0 then', 'if false then'),
    },
    {
      name: 'مستند عاديّ قبل يوم تشغيل وحدته',
      code: 'rollback_blocked',
      seed: goLiveSeed('early'),
      data: "select (select count(*) from public.stock_moves where doc_kind = 'receipt')::text || '/' || (select count(*) from public.divisions where go_live_on > public.app_today())::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_early > 0 then', 'if false then'),
    },
    {
      name: 'افتتاح بعد يوم تشغيل وحدته',
      code: 'rollback_blocked',
      seed: goLiveSeed('late'),
      data: "select (select count(*) from public.stock_moves where doc_kind = 'opening')::text || '/' || (select count(*) from public.opening_docs)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_late > 0 then', 'if false then'),
    },
  ],
  17: [
    {
      name: 'شراء مسجَّل بسعره',
      code: 'rollback_blocked',
      seed: purchaseSeed,
      data: "select (select count(*) from public.purchase_prices)::text || '/' || (select count(*) from public.receipts where status = 'posted')::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace(PURCHASE_CONDITION, 'if false then'),
    },
  ],
  16: [
    {
      name: 'معدّل تكاليف بخلطة',
      code: 'rollback_blocked',
      seed: rateSeed,
      data: "select (select count(*) from public.recipe_cost_rates)::text || '/' || (select count(*) from public.recipes)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace(COSTS_CONDITION, 'v_costs + v_allocs + v_replaced > 0 or v_prices > 0'),
    },
    {
      name: 'سطر تكاليف ومادّة بديلة بدفعة مسوّدة',
      code: 'rollback_blocked',
      seed: batchCostSeed,
      data: "select (select count(*) from public.production_costs)::text || '/' || (select count(*) from public.production_inputs where replaced_item_id is not null)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace(COSTS_CONDITION, 'v_rates > 0 or v_prices > 0'),
    },
    {
      name: 'سعر كلفة مكتوب',
      code: 'rollback_blocked',
      seed: costPriceSeed,
      data: "select (select count(*) from public.item_prices where cost_price is not null)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace(COSTS_CONDITION, 'v_rates > 0 or v_costs + v_allocs + v_replaced > 0'),
    },
    {
      name: 'خلطة مفعَّلة بكاز خارج الكتلة',
      code: 'rollback_blocked',
      seed: fuelRecipeSeed,
      data: "select (select count(*) from public.recipe_lines)::text || '/' || (select count(*) from public.recipe_versions where status = 'active')::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_basis > 0 then', 'if false then'),
    },
    {
      name: 'خلطة مفعَّلة تغيّرت وحدة مادّة فيها بعد تفعيلها',
      code: 'rollback_blocked',
      seed: unitChangedSeed,
      data: "select (select count(*) from public.recipe_lines where base_unit = 'kg')::text || '/' || (select count(*) from public.items where base_unit = 'L')::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_units > 0 then', 'if false then'),
    },
  ],
  15: [
    {
      name: 'خلطة مفعَّلة',
      code: 'rollback_blocked',
      seed: recipeSeed,
      data: "select (select count(*) from public.recipes)::text || '/' || (select count(*) from public.recipe_versions)::text || '/' || (select count(*) from public.recipe_lines)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace(MILL_CONDITION, 'v_batches + v_moves + v_lots > 0'),
    },
    {
      name: 'دفعة إنتاج مسوّدة',
      code: 'rollback_blocked',
      seed: draftBatchSeed,
      data: "select (select count(*) from public.production_batches)::text || '/' || (select count(*) from public.production_inputs)::text || '/' || (select count(*) from public.recipes)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace(MILL_CONDITION, 'false'),
    },
  ],
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
  8: [
    {
      name: 'مصروف نقدي',
      code: 'rollback_blocked',
      seed: wp5Seed('expense'),
      data: "select (select count(*) from public.expenses)::text || '/' || (select count(*) from public.cash_moves)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace(WP5_CONDITION, 'v_uses > 0 or v_counts > 0'),
    },
    {
      name: 'مسوّدة صرف',
      code: 'rollback_blocked',
      seed: wp5Seed('use'),
      data: "select (select count(*) from public.stock_uses)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace(WP5_CONDITION, 'v_expenses > 0 or v_counts > 0'),
    },
    {
      name: 'مسوّدة جرد',
      code: 'rollback_blocked',
      seed: wp5Seed('count'),
      data: "select (select count(*) from public.stock_counts)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace(WP5_CONDITION, 'v_expenses > 0 or v_uses > 0'),
    },
  ],
  9: [
    {
      name: 'مسوّدة استلام',
      code: 'rollback_blocked',
      seed: receiptSeed,
      data: "select (select count(*) from public.receipts)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace(RECEIPT_CONDITION, 'false'),
    },
  ],
  10: [
    {
      name: 'مسوّدة مرتجع',
      code: 'rollback_blocked',
      seed: returnSeed,
      data: "select (select count(*) from public.supplier_returns)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace(RETURN_CONDITION, 'false'),
    },
  ],
  11: [
    {
      name: 'استلام منسوخ بأصله',
      code: 'rollback_blocked',
      seed: copySeed,
      data: "select (select count(*) from public.receipts where copied_from is not null)::text || '/' || (select count(*) from public.receipts)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace(COPY_CONDITION, 'false'),
    },
  ],
  14: [
    {
      name: 'سعر بيع مكتوب',
      code: 'prices_not_exported',
      seed: priceSeed,
      data: "select (select count(*) from public.item_prices)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace(PRICE_CONDITION, 'false and'),
    },
  ],
  12: [
    {
      name: 'قاعة بفوج وجولة',
      code: 'rollback_blocked',
      seed: flockSeed,
      data: "select (select count(*) from public.halls)::text || '/' || (select count(*) from public.flocks)::text || '/' || (select count(*) from public.flock_daily)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace(FLOCK_CONDITION, 'false'),
    },
    {
      name: 'قاعة بلا فوج',
      code: 'rollback_blocked',
      seed: hallSeed,
      data: "select (select count(*) from public.halls)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace(FLOCK_CONDITION, 'v_flocks + v_days + v_rejects + v_weights > 0'),
    },
  ],
};

/** عدد حالات الرفض اللازم لكل ملف تراجع: [الرقم، العدد، شنو]. */
export const BLOCKING_REQUIRED = [
  [5, 2, 'نطاق بموقع ونطاق بمخزن، كل وحدة توقف التراجع'],
  [6, 3, 'قيد جهة وحركة صندوق ووحدة تعبئة لمورّد، كل وحدة توقف التراجع'],
  [7, 2, 'مسوّدة افتتاح ومسوّدة تحويل، كل وحدة توقف التراجع'],
  [8, 3, 'مصروف نقدي ومسوّدة صرف ومسوّدة جرد، كل وحدة توقف التراجع'],
  [9, 1, 'مسوّدة استلام توقف التراجع'],
  [10, 1, 'مسوّدة مرتجع توقف التراجع'],
  [11, 1, 'استلام منسوخ بأصله يوقف التراجع'],
  [12, 2, 'قاعة بفوج وجولة يومية، وقاعة بلا فوج، كل وحدة توقف التراجع'],
  [14, 1, 'سعر بيع مكتوب يوقف التراجع (لا تُمسح قائمة الأسعار بلا تصدير)'],
  [15, 2, 'خلطة مفعَّلة، ودفعة إنتاج مسوّدة، كل وحدة توقف التراجع'],
  [16, 5, 'معدّل تكاليف بخلطة، وسطر تكاليف ومادّة بديلة بدفعة مسوّدة، وسعر كلفة مكتوب، وخلطة مفعَّلة بكاز خارج الكتلة، وخلطة مفعَّلة تغيّرت وحدة مادّة فيها بعد تفعيلها، كل وحدة توقف التراجع'],
  [17, 1, 'شراء مسجَّل بسعره (صفّ في purchase_prices) يوقف التراجع'],
  [18, 3, 'ترحيل بوحدة بلا يوم تشغيل، ومستند عاديّ قبل يوم تشغيل وحدته، وافتتاح بعده، كلّ واحد يوقف التراجع'],
];

/**
 * 0016 (مراجعة 0016 الثالثة #3، ق٣٤): حالة التراجع الكاملة على بيانات معمل يمرّ عليها التراجع، لا على صفر نسخ (كانت البذرة بفرعَي المواد والجهات
 * وحدهما، فخطوتا «الثوابت بعد التراجع» و«الإعادة» تجريان بلا نسخة خلطة ولا دفعة، وملء اللقطات في الإعادة على لا شيء). المدير بدوالّ 0016:
 * يوم تشغيل المعمل ورصيد افتتاحي للذرة والكاز في مخزن المواد، وخلطة مفعَّلة بلا وقود (ذرة 1,000 لأساس 1,000)، ودفعة 100 كغم منها أُضيف لها
 * لتران من الكاز (وقود خارج الكتلة، بلا تبديل) ورُحّلت. بلا معدّل ولا سطر تكاليف ولا بديل ولا سعر كلفة، فالتراجع يكمل.
 */
const millRollbackSeed = async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    const mill = await value(q, "select id from public.divisions where kind = 'feed_mill'");
    await q('select public.set_division_go_live($1, public.app_today() - 3)', [mill]);
    const raw = await value(q, "select id from public.warehouses where kind = 'raw'");
    const feedWh = await value(q, "select id from public.warehouses where kind = 'feed'");
    const corn = await value(q, "select id from public.items where name = 'ذرة صفراء'");
    const kerosene = await value(q, "insert into public.items (name, kind, base_unit, density_kg_per_l) values ('كاز المعمل', 'fuel', 'L', 0.85) returning id");
    const feed = await value(q, "insert into public.items (name, kind, base_unit) values ('علف نامي', 'feed', 'kg') returning id");
    const opening = await value(q, 'insert into public.opening_docs (warehouse_id, on_date) values ($1, public.app_today() - 3) returning id', [raw]);
    await q('insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, 1000, 900000)', [opening, corn]);
    await q('insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, 100, 100000)', [opening, kerosene]);
    await q('select public.post_opening_stock($1, (select version from public.opening_docs where id = $1), $2)', [opening, REF(40)]);
    await q(
      "select public.create_recipe($1, $2, 'علف نامي 1', $3, 1000, jsonb_build_array(jsonb_build_object('item_id', $4::uuid, 'qty', 1000, 'unit', 'kg')), '[]'::jsonb, true)",
      [REF(41), REF(42), feed, corn],
    );
    await q('select public.create_production($1, $2, 100, $3, $4, public.app_today())', [REF(43), REF(42), raw, feedWh]);
    await q('select public.add_production_input($1, $2, $3, 2, null, null)', [REF(43), REF(44), kerosene]);
    await q("select public.post_production($1, (select version from public.production_batches where id = $1), public.preview_production($1) ->> 'plan_token', $2)", [REF(43), REF(45)]);
  }, { commit: true });
};

/**
 * بين التراجع والإعادة (كتالوج 0015، بدوالّه وحارسه كما كانا قبل 0016: لا لقطة «داخل الكتلة» ولا لقطة وحدة): المدير ينشئ خلطة ويفعّلها كما في
 * recipeSeed — ذرة 900 كغم وزيت 100 لتر (92 كغم، لقطة كثافته 0.92 من تفعيل 0015) وملح 8 كغم لأساس 1,000 — ثمّ يُصحَّح الملح لتراً بعد التفعيل
 * (بلا حركة، فقاعدة 0015 تسمح). فإعادة 0016 تملأ لقطاتها على صفوف حقيقية: «داخل الكتلة» صحيح، ووحدة يوم التفعيل من لقطة الكثافة (الملح
 * كيلوغرام لا لتر الآن).
 */
const millOn0015 = async (db) => {
  await db.asUser(U.manager, async (q) => {
    const corn = await value(q, "select id from public.items where name = 'ذرة صفراء'");
    const feed = await value(q, "select id from public.items where name = 'علف نامي'");
    const oil = await value(q, "insert into public.items (name, kind, base_unit, density_kg_per_l) values ('زيت الصويا', 'raw', 'L', 0.92) returning id");
    const salt = await value(q, "insert into public.items (name, kind, base_unit) values ('ملح الطعام', 'raw', 'kg') returning id");
    const recipe = await value(q, "insert into public.recipes (name, output_item_id) values ('علف نامي بقاعدة 0015', $1) returning id", [feed]);
    const version = await value(q, 'insert into public.recipe_versions (recipe_id, basis_kg) values ($1, 1000) returning id', [recipe]);
    await q("insert into public.recipe_lines (version_id, item_id, qty, unit) values ($1, $2, 900, 'kg')", [version, corn]);
    await q("insert into public.recipe_lines (version_id, item_id, qty, unit) values ($1, $2, 100, 'L')", [version, oil]);
    await q("insert into public.recipe_lines (version_id, item_id, qty, unit) values ($1, $2, 8, 'kg')", [version, salt]);
    await q('select public.activate_recipe_version($1, (select version from public.recipe_versions where id = $1))', [version]);
    await q("update public.items set base_unit = 'L', density_kg_per_l = 1.2 where id = $1", [salt]);
  }, { commit: true });
};

/** بعد إعادة 0016: لقطتا كلّ سطر نسخة غير مسوّدة (خلطة البذرة وخلطة كتالوج 0015) كما يجب أن يملأهما الملء. */
const millRedone = async (db) => {
  const got = (await db.admin(`select r.name as recipe, i.name as item, l.in_basis, l.base_unit from public.recipe_lines l
    join public.recipe_versions v on v.org_id = l.org_id and v.id = l.version_id join public.recipes r on r.org_id = v.org_id and r.id = v.recipe_id
    join public.items i on i.org_id = l.org_id and i.id = l.item_id where v.status <> 'draft' order by r.name collate "C", l.line_no`)).rows
    .map((row) => `${row.recipe}: ${row.item} ${row.in_basis} ${row.base_unit}`);
  const want = ['علف نامي 1: ذرة صفراء true kg', 'علف نامي بقاعدة 0015: ذرة صفراء true kg', 'علف نامي بقاعدة 0015: زيت الصويا true L', 'علف نامي بقاعدة 0015: ملح الطعام true kg'];
  return JSON.stringify(got) === JSON.stringify(want) ? [] : [`لقطات سطور النسخ غير المسوّدة بعد الملء ${JSON.stringify(got)} والمتوقّع ${JSON.stringify(want)}`];
};

const BACKFILL = /\nupdate public\.recipe_lines l set in_basis = true\n[\s\S]*?\nupdate public\.recipe_lines l set base_unit = [\s\S]*?;\n/u;
const UNIT_BACKFILL = /\nupdate public\.recipe_lines l set base_unit = [\s\S]*?;\n/u;
const UNIT_COLUMN_END = "    alter table public.recipe_lines add constraint recipe_lines_base_unit_check check (base_unit is null or base_unit in ('kg', 'L'));\n  end if;\nend\n$$;\n";
const DERIVED_UNIT = "set base_unit = case when l.density_kg_per_l is not null then 'L' else 'kg' end";

/**
 * إضافات حالة التراجع الكاملة بالرقم (rollbackCase في rollback.mjs): seed بدل seedThroughRpcs، وafterRollback يكتب بدوالّ الإصدار القديم بين التراجع
 * والإعادة، وafterRedo يرجّع مشاكل بعد الإعادة؛ وcontrols طفرات في نصّ الهجرة كلّ واحدة لازم تُفشل الحالة بنصّ expect (وإلّا فالبذرة لا تمرّ على ما
 * تحرسه). 0016 (ق٣٤): جملتا الملء قبل استبدال حارس السطر ← not_draft (الحارس القديم يرفض تغيير سطر نسخة غير مسوّدة)؛ وملء الوحدة من وحدة
 * المادّة الآن أو بلا ملء ← recipe_frozen_bad_lines بعد الإعادة.
 */
/**
 * 0017: حالة التراجع الكاملة على استلام رحّله الجسم المشترك (post_receipt_core): المدير يكتب مسوّدة كاز بالمخزن العامّ ومبلغها ويرحّلها
 * بـpost_receipt. بلا شراء مسجَّل بسعره، فالتراجع يكمل.
 */
const receiptPostedSeed = async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    const fuel = await value(q, "insert into public.items (name, kind, base_unit) values ('كاز الاستلام', 'fuel', 'L') returning id");
    const general = await value(q, "select id from public.warehouses where kind = 'general'");
    const party = await value(q, "select id from public.parties where name = 'مورّد الحبوب'");
    const doc = await value(q, 'insert into public.receipts (party_id, warehouse_id, received_on) values ($1, $2, public.app_today()) returning id', [party, general]);
    const line = await value(q, 'insert into public.receipt_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 10) returning id', [doc, fuel]);
    await q('insert into public.receipt_line_amounts (line_id, line_total) values ($1, 7500)', [line]);
    await q('select public.post_receipt($1, (select version from public.receipts where id = $1), $2)', [doc, REF(53)]);
  }, { commit: true });
};

/** بين التراجع والإعادة (كتالوج 0016، post_receipt بجسم 0009 وحرّاسه): المدير يرحّل استلاماً ثانياً، فالمستعاد يعمل على البيانات. */
const receiptOn0016 = async (db) => {
  await db.asUser(U.manager, async (q) => {
    const fuel = await value(q, "select id from public.items where name = 'كاز الاستلام'");
    const general = await value(q, "select id from public.warehouses where kind = 'general'");
    const party = await value(q, "select id from public.parties where name = 'مورّد الحبوب'");
    const doc = await value(q, 'insert into public.receipts (party_id, warehouse_id, received_on) values ($1, $2, public.app_today()) returning id', [party, general]);
    const line = await value(q, 'insert into public.receipt_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 4) returning id', [doc, fuel]);
    await q('insert into public.receipt_line_amounts (line_id, line_total) values ($1, 3000)', [line]);
    await q('select public.post_receipt($1, (select version from public.receipts where id = $1), $2)', [doc, REF(54)]);
  }, { commit: true });
};

/** بعد إعادة 0017: الأمين (بنطاق الوحدة العامّة) يسجّل شراءً بنداء واحد على البيانات القائمة، ومجموع ما اشتُري من الكاز = الاستلامات الثلاثة. */
const purchaseRedone = async (db) => {
  const problems = [];
  try {
    await db.asUser(U.storekeeper, async (q) => {
      const fuel = await value(q, "select id from public.items where name = 'كاز الاستلام'");
      const party = await value(q, "select id from public.parties where name = 'مورّد الحبوب'");
      await q("select public.record_purchase($1, $2, $3, $4, $5, public.app_today(), 6, 800, null, 'credit', null, null)", [REF(55), REF(56), REF(57), fuel, party]);
    }, { commit: true });
  } catch (error) {
    problems.push(`record_purchase بعد الإعادة رفض: ${error.message}`);
  }
  const file = await db.asUser(U.manager, (q) => value(q, "select public.item_file((select id from public.items where name = 'كاز الاستلام'))"));
  const got = [Number(file?.purchased_qty), file?.purchases_count, Number(file?.money?.purchased_value)].join('/');
  if (got !== '20/3/15300') problems.push(`ملفّ الكاز بعد الإعادة ${got} والمتوقّع 20/3/15300`);
  return problems;
};

/**
 * 0018: حالة التراجع الكاملة على مستندات تقبلها القواعد القديمة: شراء كاز بالعامّة اليوم (يوم تشغيلها قبل ثلاثة أيّام) وافتتاح كاز ثانٍ بيوم
 * تشغيلها نفسه. فالتراجع يكمل، وبين التراجع والإعادة شراء ثانٍ بالعامّة بقاعدة 0006 المستعادة، وبعد الإعادة شراء ذرة بالمعمل بلا يوم تشغيل.
 */
const goLiveRollbackSeed = async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    const general = await value(q, "select id from public.warehouses where kind = 'general'");
    const party = await value(q, "select id from public.parties where name = 'مورّد الحبوب'");
    const fuel = await value(q, "insert into public.items (name, kind, base_unit) values ('كاز العامّة', 'fuel', 'L') returning id");
    const stocked = await value(q, "insert into public.items (name, kind, base_unit) values ('كاز الرصيد', 'fuel', 'L') returning id");
    await q("select public.record_purchase($1, $2, $3, $4, $5, public.app_today(), 20, 750, null, 'credit', null, null)", [REF(67), REF(68), REF(69), fuel, party]);
    const doc = await value(q, 'insert into public.opening_docs (warehouse_id, on_date) values ($1, public.app_today() - 3) returning id', [general]);
    await q('insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, 30, 21000)', [doc, stocked]);
    await q('select public.post_opening_stock($1, (select version from public.opening_docs where id = $1), $2)', [doc, REF(70)]);
  }, { commit: true });
};

/** بين التراجع والإعادة (قواعد 0006 المستعادة): شراء ثانٍ بالعامّة بعد يوم تشغيلها يمرّ. */
const goLiveOn0017 = async (db) => {
  await db.asUser(U.manager, async (q) => {
    const fuel = await value(q, "select id from public.items where name = 'كاز العامّة'");
    const party = await value(q, "select id from public.parties where name = 'مورّد الحبوب'");
    await q("select public.record_purchase($1, $2, $3, $4, $5, public.app_today(), 5, 760, null, 'credit', null, null)", [REF(71), REF(72), REF(73), fuel, party]);
  }, { commit: true });
};

/** بعد إعادة 0018: شراء ذرة بالمعمل ويومه فارغ يمرّ، والوحدة رُحّل فيها بلا يوم تشغيل. */
const goLiveRedone = async (db) => {
  const problems = [];
  try {
    await db.asUser(U.manager, async (q) => {
      const corn = await value(q, "select id from public.items where name = 'ذرة صفراء'");
      const party = await value(q, "select id from public.parties where name = 'مورّد الحبوب'");
      await q("select public.record_purchase($1, $2, $3, $4, $5, public.app_today(), 10, 450, null, 'credit', null, null)", [REF(74), REF(75), REF(76), corn, party]);
    }, { commit: true });
  } catch (error) {
    problems.push(`شراء بالمعمل بلا يوم تشغيل بعد الإعادة رُفض: ${error.message}`);
  }
  const mill = (await db.admin("select first_posted_at is not null as posted, go_live_on from public.divisions where kind = 'feed_mill'")).rows;
  if (!mill.every((row) => row.posted && row.go_live_on === null)) problems.push(`وحدة المعمل بعد الإعادة ${JSON.stringify(mill)} والمتوقّع مرحَّلة بلا يوم تشغيل`);
  return problems;
};

export const ROLLBACK_EXTRAS = {
  18: {
    seed: goLiveRollbackSeed,
    afterRollback: goLiveOn0017,
    afterRedo: goLiveRedone,
  },
  17: {
    seed: receiptPostedSeed,
    afterRollback: receiptOn0016,
    afterRedo: purchaseRedone,
  },
  16: {
    seed: millRollbackSeed,
    afterRollback: millOn0015,
    afterRedo: millRedone,
    controls: [
      {
        name: 'جملتا الملء قبل استبدال حارس السطر',
        expect: 'not_draft',
        mutate: (sql) => {
          const block = BACKFILL.exec(sql)?.[0];
          if (!block || sql.split(UNIT_COLUMN_END).length !== 2) return sql;
          return sql.split(block).join('\n').split(UNIT_COLUMN_END).join(UNIT_COLUMN_END + block.slice(1));
        },
      },
      {
        name: 'ملء الوحدة من وحدة المادّة الآن',
        expect: 'recipe_frozen_bad_lines',
        mutate: (sql) => sql.split(DERIVED_UNIT).join('set base_unit = (select i.base_unit from public.items i where i.org_id = l.org_id and i.id = l.item_id)'),
      },
      {
        name: 'بلا ملء الوحدة',
        expect: 'recipe_frozen_bad_lines',
        mutate: (sql) => {
          const statement = UNIT_BACKFILL.exec(sql)?.[0];
          return statement ? sql.split(statement).join('\n') : sql;
        },
      },
    ],
  },
};
