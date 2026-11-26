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
// 0019: البذرة نفسها وفوقها قاعة بفوج مفتوح و«علف البذرة» برصيد افتتاح في مخزن الحقل (ROLLBACK_EXTRAS)، وبعد الإعادة صرف منه للفوج، فالتراجع
// يكمل. والطريق الثاني: صرف لفوج (صفّ في flock_issues وflock_issue_lines وflock_costs، وحركات تشير إليه) يوقف التراجع بصوت.
// 0020: البذرة نفسها وفوقها شراء كاز بسعره ونقل منه بالورقة وتصحيح سعره (الجسمان المشتركان: post_transfer وpost_receipt_revalue على نواتيهما)
// (ROLLBACK_EXTRAS)، وبين التراجع والإعادة نقل وتصحيح ثانيان بجسمَي 0007 و0010، وبعد الإعادة نقل بخطوة وتحويل مادّة وشراء بلا سعر يُكمَّل
// وحذف مادّة، فالتراجع يكمل. والطريق الثاني بفرعين، كلّ واحد ببذرته: تحويل مادّة، وشراء بلا سعر.
// 0021: البذرة نفسها (بلا بيع، فالتراجع يكمل). والطريق الثاني: فاتورة بيع (صفّ في الجداول الثلاثة، وحركات وقيد تشير إليها) توقف التراجع بصوت.
// 0025: البذرة نفسها وفوقها خلطة بكميات أُنتجت بـrecord_production (ROLLBACK_EXTRAS)، وبين التراجع والإعادة خلطة ثانية بـcreate_recipe القديم وإنتاجها
// و«مخزن العلف» باسمه القديم، وبعد الإعادة «رصيد العلف» وproduce_batch على الخلطتين القديمة وبالموادّ، فالتراجع يكمل. والطريق الثاني بثلاثة فروع، كلّ
// واحد ببذرته: سطر خلطة بلا كمية، ونسخة بلا أساس، ودفعة حُفظت موادّها في خلطتها.
// 0028: البذرة نفسها وفوقها قاعة بفوج مفتوح وصرف منه وجولة (ROLLBACK_EXTRAS)، وبين التراجع والإعادة جولة ثانية بجسم 0012، وبعد الإعادة تذكرة وفاتورة
// وإغلاق بإرجاع على تلك البيانات، فالتراجع يكمل. والطريق الثاني بستّة فروع، كلّ واحد ببذرته: مسوّدة تذكرة وزن، وفاتورة طيور مرحّلة، وفرق عدّ،
// ودورة مغلقة بإرجاع، ونقل مطبَّق، وأثر في سجلّ التدقيق وحده.
// 0031: البذرة نفسها وفوقها قاعة بفوج مفتوح وصرف منه وجولة (ROLLBACK_EXTRAS)، وبعد الإعادة ملاحظة يوم وhalls_history على تلك البيانات، فالتراجع يكمل.
// والطريق الثاني بفرعين، كلّ واحد ببذرته: ملاحظة يوم في تقرير القاعات، وملاحظة مُسحت (الصفّ يبقى بنسخته).
// 0032: البذرة نفسها وفوقها صرف لفوجها وجولة مركونة بعملية save_flock_day (ROLLBACK_EXTRAS، بلا زيارة بعد الهجرة فالتراجع يكمل)، وبين التراجع والإعادة
// جولتا أمس واليوم بجسم 0029، وبعد الإعادة كلّ صفّ يوم زيارة legacy بقيمه ونسخته وزيارة جديدة تنضاف إليه. والطريق الثاني بثلاثة فروع، كلّ واحد ببذرته:
// زيارة جديدة حيّة، وزيارة أُلغيت، وزيارة مركونة.
// 0033: البذرة نفسها وفوقها فاتورة record_sale_v2 بسطر وبوحدة الأساس مدفوعة كلّها من صندوق، وفاتورة بالدين كلّها، وبيع قديم نقداً (ROLLBACK_EXTRAS)، فالتراجع
// يكمل وينقل الفاتورة الجديدة للشكل القديم؛ وبين التراجع والإعادة بيع نقديّ بجسم 0021، وبعد الإعادة كلّ بيع نقديّ ساق واحدة مرآة رأسه، وفاتورة بعدّة سطور
// وخصم وسيقان وأخرى لزبون نقديّ تُكتب وتُقرأ. والطريق الثاني بسبعة فروع، كلّ واحد ببذرته: أكثر من سطر، وخصم، وأكثر من ساق، ودفع جزئيّ، ووحدة بيع،
// وملاحظة، وزبون نقديّ.
// 0036: البذرة نفسها وفوقها هلاكات أمس بـset_flock_dead وغاز اليوم بإضافتين وعلف اليوم (ROLLBACK_EXTRAS)، فالتراجع يكمل؛ وبين التراجع والإعادة جولة بنافق
// بجسم 0035 وغاز اليوم بـset_flock_gas، وبعد الإعادة الملء يعلّم زيارتي اليومين ثمّ اليومين منهما، والجولة لا تضيف إليهما والإضافة تكمل المجموع (وضابطا
// الإعادة: بلا ملء الزيارات، وبلا اشتقاق الأيّام، يفشل الثابت). والطريق الثاني بثلاثة فروع، كلّ واحد ببذرته: يوم سُجّلت هلاكاته صفراً، وهلاكات مركونة،
// وغاز مضاف مركون؛ والفرع الرابع (زيارة مركونة بسبب dead_recorded) يحرسه قيد 0012 نفسه أيضاً فلا يكمل التراجع بلا الكتلة، وفحصه في round-once.test.

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

/**
 * 0019: قاعة «قاعة البذرة» في «حقل الأمل» بفوج مفتوح قبل ثلاثة أيّام، و«علف البذرة» برصيد افتتاح 50 كغم في مخزن الحقل (المدير). بلا صرف.
 */
const flockReady = async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    const site = await value(q, "select id from public.sites where name = 'حقل الأمل'");
    const store = await value(q, "select id from public.warehouses where name = 'مخزن حقل الأمل'");
    const hall = await value(q, "insert into public.halls (site_id, name) values ($1, 'قاعة البذرة') returning id", [site]);
    await q('select public.open_flock($1, public.app_today() - 3, 1000, 0, null, $2)', [hall, REF(80)]);
    const feed = await value(q, "insert into public.items (name, kind, base_unit) values ('علف البذرة', 'feed', 'kg') returning id");
    const doc = await value(q, 'insert into public.opening_docs (warehouse_id, on_date) values ($1, public.app_today() - 3) returning id', [store]);
    await q('insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, 50, 30000)', [doc, feed]);
    await q('select public.post_opening_stock($1, (select version from public.opening_docs where id = $1), $2)', [doc, REF(81)]);
  }, { commit: true });
};

const SEED_FLOCK = "select f.id from public.flocks f join public.halls h on h.org_id = f.org_id and h.id = f.hall_id where h.name = 'قاعة البذرة'";

/** صرف 5 كغم «علف البذرة» لفوج «قاعة البذرة» من مخزن الحقل (المدير، record_flock_issue). */
const issueToSeedFlock = (refs) => async (db) => {
  await db.asUser(U.manager, async (q) => {
    const flock = await value(q, SEED_FLOCK);
    const feed = await value(q, "select id from public.items where name = 'علف البذرة'");
    await q('select public.record_flock_issue($1, $2, $3, $4, $5, 5, public.app_today(), null)', [...refs.map(REF), flock, feed]);
  }, { commit: true });
};

/**
 * 0019 (طريق الرفض): صرف لفوج. التراجع يُسقط دفتر كلفة الفوج ورؤوس الصرف وحركاتُ المخزون تشير إليها، فطريق الرفض يوقفه؛ والطفرة تشيل شرط
 * «في الجداول صفّ» فيكمل.
 */
const flockIssueSeed = async (db) => {
  await flockReady(db);
  await issueToSeedFlock([82, 83, 84])(db);
};

const FLOCK_ISSUE_CONDITION = 'v_issues + v_lines + v_costs > 0';

/**
 * 0020 (طريق الرفض): فرعان، كلّ واحد ببذرته (المدير بدوالّ 0020): (١) شراء ذرة بالمعمل بسعرها ثمّ تحويل 5 كغم منها إلى «جريش البذرة» (التراجع
 * يُسقط جدول التحويل وحركاتُ المخزون تشير إليه)؛ (٢) شراء ذرة بلا سعر (قيد 0017 يطلب سعراً لكلّ شراء). الطفرة تشيل فرع الحالة فيكمل.
 */
const storeOpsSeed = (kind) => async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    const corn = await value(q, "select id from public.items where name = 'ذرة صفراء'");
    const party = await value(q, "select id from public.parties where name = 'مورّد الحبوب'");
    if (kind === 'conversion') {
      await q("select public.record_purchase(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), $1, $2, public.app_today(), 10, 450, null, 'credit', null, null)", [corn, party]);
      const grits = await value(q, "insert into public.items (name, kind, base_unit) values ('جريش البذرة', 'raw', 'kg') returning id");
      await q('select public.record_conversion(gen_random_uuid(), gen_random_uuid(), $1, 5, $2, 5, public.app_today(), null, null)', [corn, grits]);
    } else {
      await q("select public.record_purchase(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), $1, $2, public.app_today(), 10, null, null, 'credit', null, null)", [corn, party]);
    }
  }, { commit: true });
};

/**
 * 0021 (طريق الرفض): المدير يشتري ذرة بالمعمل بسعرها ثمّ يبيع 3 كغم منها بالدين لـ«مورّد الحبوب». التراجع يُسقط فواتير البيع وكلفتها وحركاتُ
 * المخزون وقيد الجهة تشير إليها، فطريق الرفض يوقفه؛ والطفرة تشيل شرط «في الجداول صفّ» فيكمل.
 */
const saleSeed = async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    const corn = await value(q, "select id from public.items where name = 'ذرة صفراء'");
    const party = await value(q, "select id from public.parties where name = 'مورّد الحبوب'");
    await q("select public.record_purchase(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), $1, $2, public.app_today(), 10, 450, null, 'credit', null, null)", [corn, party]);
    await q("select public.record_sale(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), $1, $2, 3, 600, public.app_today(), 'credit', null, null)", [party, corn]);
  }, { commit: true });
};

const SALE_CONDITION = 'v_sales + v_lines + v_costs > 0';

/**
 * 0022 (طريق الرفض): المدير يكتب ملاحظة اليوم على «ذرة صفراء» في «الرصيد اليومي» (أمين البذرة نطاقه مخزن لا يُخزَّن فيه الحبّ: out_of_scope).
 * التراجع يُسقط جدول الملاحظات فتضيع، فطريق الرفض يوقفه؛
 * والطفرة تشيل شرط «في الجدول صفّ» فيكمل.
 */
const dayNoteSeed = async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    const corn = await value(q, "select id from public.items where name = 'ذرة صفراء'");
    await q("select public.set_day_note($1, public.app_today(), 'وصلت شحنة ذرة', null)", [corn]);
  }, { commit: true });
};

/**
 * 0026 (طريق الرفض): قاعدة 0025 لا تعرف اللقاحات ولا تسجيل الدواء، فالتراجع يرفض ما دام لقاح في القائمة (التأشيرات وأيّام الجداول لا تقوم
 * بلا لقاح)، أو جدول لقاحات (يقوم بلا أيّام)، أو تسجيل دواء؛ كلّ فرع ببذرته وحده بدوالّ 0026 (المدير): لقاح بلا جدول ولا تأشير (vaccine)، وجدول
 * اللاحم بلا أيّام ولا لقاح (program)، ودواء بلا مخزن لفوج قاعة جديدة (log)، ودواء سُجّل ثمّ حُذف فبقي في سجلّ التدقيق وحده (audit).
 */
/** معرّفات بذور 0026 خارج REF (مستعمل حتى 99). */
const H26 = (n) => `60000000-0000-4000-8000-0000000026${String(n).padStart(2, '0')}`;
const halls26Seed = (variant) => async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    if (variant === 'vaccine') {
      await q("select public.save_vaccine($1, 'IB', null, null)", [H26(1)]);
    } else if (variant === 'program') {
      await q("select public.save_vaccine_program('broiler', 42, '[]'::jsonb, 0)");
    } else if (variant === 'audit') {
      // تسجيل دواء حُذف: الجداول الخمسة فارغة، وسجلّ التدقيق وحده يحمل صفّيه.
      const site = await value(q, "select id from public.sites where name = 'حقل الأمل'");
      const hall = await value(q, "insert into public.halls (site_id, name) values ($1, 'قاعة الحذف') returning id", [site]);
      const flock = await value(q, "select public.open_flock($1, public.app_today() - 2, 1000, 0, null, $2) ->> 'flock_id'", [hall, H26(5)]);
      await q("select public.give_to_flocks($1, public.app_today(), jsonb_build_array(jsonb_build_object('kind', 'log', 'flock_id', $2::uuid, 'id', $3::uuid, 'name', 'فيتامين', 'dose', null)))",
        [H26(6), flock, H26(7)]);
      await q('select public.remove_flock_log($1)', [H26(7)]);
    } else {
      const site = await value(q, "select id from public.sites where name = 'حقل الأمل'");
      const hall = await value(q, "insert into public.halls (site_id, name) values ($1, 'قاعة الدواء') returning id", [site]);
      const flock = await value(q, "select public.open_flock($1, public.app_today() - 2, 1000, 0, null, $2) ->> 'flock_id'", [hall, H26(2)]);
      await q("select public.give_to_flocks($1, public.app_today(), jsonb_build_array(jsonb_build_object('kind', 'log', 'flock_id', $2::uuid, 'id', $3::uuid, 'name', 'فيتامين', 'dose', null)))",
        [H26(3), flock, H26(4)]);
    }
  }, { commit: true });
};

/**
 * 0028 (طريق الرفض): جدول لقاحات خاصّ لقاعة بيانات المالك، والتراجع يُسقط جدوليه؛ حالتان كلّ واحدة ببذرتها (المدير بدوالّ 0028 على قاعة بحقل الأمل):
 * جدول قاعة باقٍ بموعد واحد (program)، وجدول حُفظ ثمّ حُذف فبقي صفّه بنسخته بلا أيّام (dropped: الدوالّ لا تمحو الصفّ، فالنسخة لا تنزل).
 */
const H28 = (n) => `60000000-0000-4000-8000-0000000028${String(n).padStart(2, '0')}`;
const halls28Seed = (variant) => async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    const site = await value(q, "select id from public.sites where name = 'حقل الأمل'");
    const hall = await value(q, "insert into public.halls (site_id, name) values ($1, 'قاعة الجدول الخاصّ') returning id", [site]);
    await q("select public.save_vaccine($1, 'ND', null, null)", [H28(1)]);
    await q("select public.save_hall_vaccine_program($1, 35, jsonb_build_array(jsonb_build_object('vaccine_id', $2::uuid, 'age_day', 7)), 0)", [hall, H28(1)]);
    if (variant === 'dropped') await q('select public.drop_hall_vaccine_program($1, 1)', [hall]);
  }, { commit: true });
};

/**
 * 0037 (طريق الرفض): ترتيب قسم ولون مادّة وإعدادات ألوان، والتراجع يُسقط جداولها؛ ثلاث حالات كلّ واحدة ببذرتها (المدير بدوالّ 0037): ترتيب
 * «موادّ العلف» مقلوباً (order)، ولون «ذرة صفراء» (mark)، و«لوّن تلقائيّاً» (colors).
 */
const store37Seed = (variant) => async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    if (variant === 'order') {
      await q(`select public.set_store_order('feed_materials', (select array_agg(x.id order by x.n desc) from unnest(y.ids) with ordinality as x(id, n)), y.ids)
        from (select array_agg((j.e ->> 'id')::uuid order by j.n) as ids from jsonb_array_elements(public.store_section_items('feed_materials') -> 'items') with ordinality as j(e, n)) as y`);
    } else if (variant === 'mark') {
      const corn = await value(q, "select id from public.items where name = 'ذرة صفراء'");
      await q("select public.set_item_color($1, 'yellow', 0)", [corn]);
    } else {
      await q("select public.set_store_colors(true, 'yellow', 'red', 0)");
    }
  }, { commit: true });
};

/**
 * 0030 (طريق الرفض): نهاية دورة مفتوحة (null) لا تقبلها قاعدة 0029؛ حالتان كلّ واحدة ببذرتها (المدير بدوالّ 0030): جدول اللاحم بلا نهاية (type)، وجدول
 * قاعة بلا نهاية (hall).
 */
const H30 = (n) => `60000000-0000-4000-8000-0000000030${String(n).padStart(2, '0')}`;
const open30Seed = (variant) => async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    await q("select public.save_vaccine($1, 'ND', null, null)", [H30(1)]);
    if (variant === 'type') {
      await q("select public.save_vaccine_program('broiler', null, jsonb_build_array(jsonb_build_object('vaccine_id', $1::uuid, 'age_day', 60)), 0)", [H30(1)]);
    } else {
      const site = await value(q, "select id from public.sites where name = 'حقل الأمل'");
      const hall = await value(q, "insert into public.halls (site_id, name) values ($1, 'قاعة الدورة المفتوحة') returning id", [site]);
      await q("select public.save_hall_vaccine_program($1, null, jsonb_build_array(jsonb_build_object('vaccine_id', $2::uuid, 'age_day', 7)), 0)", [hall, H30(1)]);
    }
  }, { commit: true });
};

/**
 * 0025 (طريق الرفض): قاعدة 0024 لا تعرف خلطة بلا كميات، فالتراجع يرفض ما دام في القاعدة سطر خلطة بلا كمية، أو نسخة بلا أساس، أو دفعة حُفظت موادّها
 * في خلطتها؛ كلّ فرع ببذرته وحده (المدير بدوالّ 0025 على «علف الرجوع» بكميات): مسوّدة «عدّل الخلطة» كتب المدير أساسها فبقيت سطورها بلا كمية (qty)،
 * ومسوّدة كتب كمياتها بلا أساس (basis)، ودفعة من الخلطة بكميات وُسمت «حُفظت في الخلطة» بالإدارة (saved). الأخيرة حالة مصنوعة: produce_batch لا يحفظ
 * موادّ الإنتاج إلّا نسخةً بلا أساس ولا كميات، فالفرعان الآخران يوقفانها في كلّ بيانات حقيقية؛ وتُصنع هنا ليثبت أنّ فرعها يوقف التراجع وحده. وبلا
 * كتلة الرفض يكمل التراجع على كلّ بذرة (المسوّدة تُحذف سطورها بلا كمية أو تأخذ أساس 1000، والعمود يسقط).
 */
const mill25Seed = (variant) => async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    const corn = await value(q, "select id from public.items where name = 'ذرة صفراء'");
    const feed = await value(q, "insert into public.items (name, kind, base_unit) values ('علف الرجوع', 'feed', 'kg') returning id");
    await q("select public.create_recipe($1, $2, 'علف الرجوع', $3, 1000, jsonb_build_array(jsonb_build_object('item_id', $4::uuid, 'qty', 1000, 'unit', 'kg')), '[]'::jsonb, true)",
      [REF(88), REF(89), feed, corn]);
    if (variant === 'saved') {
      const raw = await value(q, "select id from public.warehouses where kind = 'raw'");
      const feedWh = await value(q, "select id from public.warehouses where kind = 'feed'");
      const opening = await value(q, 'insert into public.opening_docs (warehouse_id, on_date) values ($1, public.app_today() - 3) returning id', [raw]);
      await q('insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, 1000, 450000)', [opening, corn]);
      await q('select public.post_opening_stock($1, (select version from public.opening_docs where id = $1), $2)', [opening, REF(90)]);
      await q("select public.record_production($1, $2, 100, $3, $4, public.app_today(), '[]'::jsonb, '[]'::jsonb, null, null, null, null, $5)", [REF(91), REF(89), raw, feedWh, REF(92)]);
    } else {
      await q('select public.new_recipe_version($1, $2)', [REF(88), REF(93)]);
      if (variant === 'basis') await q('update public.recipe_lines set qty = 1000 where version_id = $1', [REF(93)]);
      else await q('update public.recipe_versions set basis_kg = 1000 where id = $1', [REF(93)]);
    }
  }, { commit: true });
  if (variant === 'saved') await db.admin('update public.production_batches set saved_to_recipe = true where id = $1', [REF(91)]);
};

/**
 * 0028 (طريق الرفض): قاعدة 0027 لا تعرف التذكرة ولا فاتورة الطيور ولا العدد ولا الإغلاق، فالتراجع يرفض ما دامت حقيقة واحدة منها؛ كلّ فرع ببذرته
 * وحده بدوالّ 0028 (المدير) على فوج «قاعة البذرة» (1,000 طير قبل ثلاثة أيّام): مسوّدة تذكرة بقاعة (ticket)، وتذكرة أُكملت وفوترت بالدين لـ«أبو علي»
 * (sale)، وفرق عدّ +5 وحده (adjust)، ودورة أُغلقت أمس ورجع فيها كيلوغرامان من «علف البذرة» إلى مخزن الحقل (close)، ودورة أُغلقت أمس ونُقل علفها ثمّ
 * سُكّن في القاعة فوج اليوم فطُبّق النقل (carry)، وتذكرة مسوّدة حُذفت يدويّاً فبقيت في سجلّ التدقيق وحده (audit؛ حالة مصنوعة: لا دالّة تحذف تذكرة،
 * وتُصنع هنا ليثبت أنّ فرع الأثر يوقف التراجع وحده).
 */
const H29 = (n) => `60000000-0000-4000-8000-0000000029${String(n).padStart(2, '0')}`;
const birds28Seed = (variant) => async (db) => {
  await flockReady(db);
  await db.asUser(U.manager, async (q) => {
    const flock = await value(q, SEED_FLOCK);
    const hall = await value(q, "select id from public.halls where name = 'قاعة البذرة'");
    const site = await value(q, "select id from public.sites where name = 'حقل الأمل'");
    if (variant === 'ticket' || variant === 'sale' || variant === 'audit') {
      const today = await value(q, 'select public.app_today()::text');
      const data = { site_id: site, on_date: today, method: 'scale', empty_kg: '7000', empty_with_crates: false, crate_kg: '6',
        stops: [{ id: H29(2), hall_id: hall, birds: 100, crates: 10, gross_kg: '7300', weighings: [] }] };
      await q('select public.save_weigh_ticket($1, null, $2::jsonb)', [H29(1), JSON.stringify(data)]);
      if (variant === 'sale') {
        await q('select public.finish_weigh_ticket($1, $2, 1)', [H29(3), H29(1)]);
        const party = await value(q, "select id from public.parties where name = 'أبو علي'");
        await q('select public.record_bird_sale($1, $2, $3, 2, $4, 2750, 0, 0, null, null)', [H29(4), H29(5), H29(1), party]);
      }
    } else if (variant === 'adjust') {
      await q("select public.record_flock_count_adjust($1, $2, $3, public.app_today(), 5, 'العدد الفعليّ أكثر', 1000)", [H29(6), H29(7), flock]);
    } else {
      const feed = await value(q, "select id from public.items where name = 'علف البذرة'");
      const store = await value(q, "select id from public.warehouses where name = 'مخزن حقل الأمل'");
      await q('select public.record_flock_issue($1, $2, $3, $4, $5, 5, public.app_today() - 2, null)', [H29(8), H29(9), H29(10), flock, feed]);
      const line = variant === 'close' ? { item_id: feed, qty: '2', action: 'return', warehouse_id: store } : { item_id: feed, qty: '2', action: 'carry' };
      await q("select public.close_flock($1, $2, $3, public.app_today() - 1, 1000, 0, $4::jsonb, 'بيعت خارج النظام', $5::jsonb, null, public.flock_close_form($3) ->> 'plan')",
        [H29(11), H29(12), flock, JSON.stringify([{ item_id: feed, qty: '5' }]), JSON.stringify([line])]);
      if (variant === 'carry') await q('select public.open_flock($1, public.app_today(), 500, 0, null, $2)', [hall, H29(13)]);
    }
  }, { commit: true });
  if (variant === 'audit') {
    await db.admin('delete from public.weigh_ticket_stops where ticket_id = $1', [H29(1)]);
    await db.admin('delete from public.weigh_tickets where id = $1', [H29(1)]);
  }
};

/**
 * 0031 (طريق الرفض): ملاحظة المالك على يوم في تقرير القاعات (المدير بـset_halls_note)، ولو مُسح نصّها (الصفّ يبقى بنصّ فارغ ونسخة رآها كاتب، فإسقاطه ثمّ
 * إعادة الهجرة يبدأ العدّاد من 1). التراجع يُسقط الجدول، فطريق الرفض يوقفه؛ والطفرة تشيل شرط «في الجدول صفّ» فيكمل.
 */
const hallsNoteSeed = (variant) => async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    const version = await value(q, "select (public.set_halls_note(public.app_today(), 'وصل العلف للقاعات', null) -> 'note' ->> 'version')::bigint");
    if (variant === 'cleared') await q("select public.set_halls_note(public.app_today(), '', $1)", [version]);
  }, { commit: true });
};

const H32 = (n) => `60000000-0000-4000-8000-0000000032${String(n).padStart(2, '0')}`;

/**
 * 0032 (طريق الرفض): ما لا يحمله النموذج القديم، كلّ حقيقة ببذرتها على فوج البذرة (المدير بـsave_flock_visit): زيارة جديدة حيّة بوقتها وكاتبها، وزيارة
 * أُضيفت ثمّ أُلغيت (لا يبقى منها إلّا العلامة، وصفّ يومها حُذف)، وزيارة مركونة من الطابور بيوم أقدم من سبعة أيّام (صفّ في flock_day_rejects بمعرّفها
 * ولا زيارة). التراجع يُسقطها فطريق الرفض يوقفه، وطفرة كلّ فرع تعبر بذرته.
 */
const visitSeed = (variant) => async (db) => {
  await flockReady(db);
  await db.asUser(U.manager, async (q) => {
    const flock = await value(q, SEED_FLOCK);
    if (variant === 'parked') {
      await q('select public.save_flock_visit($1, $2, public.app_today() - 9, now(), 3, 0, null, null, null, null, null, null, false, $3, true)', [H32(1), flock, H32(2)]);
      return;
    }
    await q("select public.save_flock_visit($1, $2, public.app_today(), now(), 3, 0, 40, null, null, null, 'زيارة الصباح', null, false, $3, false)", [H32(1), flock, H32(2)]);
    if (variant === 'voided') {
      await q("select public.save_flock_visit($1, $2, public.app_today(), now(), 3, 0, 40, null, null, null, 'زيارة الصباح', 1, true, $3, false)", [H32(1), flock, H32(3)]);
    }
  }, { commit: true });
};

const BIRD_TABLES = "('flock_counts', 'weigh_tickets', 'weigh_ticket_stops', 'weigh_ticket_weighings', 'bird_sales', 'bird_sale_sources', 'flock_closes', 'flock_close_lines', 'flock_returns', 'flock_return_lines', 'flock_close_values')";

const H33 = (n) => `60000000-0000-4000-8000-0000000033${String(n).padStart(2, '0')}`;

/** 0033: المدير يشتري 200 كغم «ذرة صفراء» بمخزن الموادّ، ويضيف صندوقاً ثانياً؛ يرجّع ما تحتاجه الفواتير. */
const salesV2Ready = async (db) => {
  await seedThroughRpcs(db);
  return db.asUser(U.manager, async (q) => {
    const corn = await value(q, "select id from public.items where name = 'ذرة صفراء'");
    const supplier = await value(q, "select id from public.parties where name = 'مورّد الحبوب'");
    await q("select public.record_purchase(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), $1, $2, public.app_today(), 200, 450, null, 'credit', null, null)", [corn, supplier]);
    const bank = await value(q, "insert into public.cash_accounts (name, kind) values ('المصرف', 'bank') returning id");
    return {
      corn,
      customer: await value(q, "select id from public.parties where name = 'أبو علي'"),
      box: await value(q, "select id from public.cash_accounts where name = 'الصندوق'"),
      bank,
      raw: await value(q, "select id from public.warehouses where kind = 'raw'"),
      bag: await value(q, "select id from public.item_units where label = 'كيس 50 كغم'"),
    };
  }, { commit: true });
};

/** 0033: فاتورة record_sale_v2 بالمدير (سطور وخصم وسيقان وملاحظة وجهة اختيارية)، تثبت. */
const saleV2 = async (db, s, o) => db.asUser(U.manager, async (q) => {
  // حجم الوحدة كما رأته الشاشة إلزاميّ لسطر بوحدة بيع (مراجعة 0033 A2).
  const lines = o.lines.map((l, i) => ({ line_id: l.id ?? H33(40 + i + (o.seq ?? 0) * 5), item_id: s.corn, unit_id: l.unit ?? null, qty: l.qty, unit_price: l.price, discount: l.discount ?? '0',
    ...(l.unit ? { factor: l.factor } : {}) }));
  const payments = (o.payments ?? []).map((g, i) => ({ leg_id: H33(70 + i + (o.seq ?? 0) * 5), cash_account_id: g.box, amount: g.amount }));
  return value(q, 'select public.record_sale_v2($1, $2, $3, $4, public.app_today(), $5::jsonb, $6, $7::jsonb, $8)', [o.ref, o.sale, s.raw, o.party === undefined ? s.customer : o.party,
    JSON.stringify(lines), o.discount ?? 0, JSON.stringify(payments), o.note ?? null]);
}, { commit: true });

/**
 * 0033 (طريق الرفض): ما لا يحمله النموذج القديم، كلّ حقيقة ببذرتها: فاتورة بسطرين، وفاتورة بخصم سطر، وفاتورة مدفوعة من صندوقين، وفاتورة دُفع بعضها،
 * وسطر بالكيس، وفاتورة بملاحظة، وفاتورة لزبون نقديّ، وفاتورة جديدة مدفوعة كلّها من صندوق (صفّ تدقيق ساقها، مراجعة 0033 V3). التراجع يُسقط ما يحملها
 * فطريق الرفض يوقفه، وطفرة كلّ فرع تعبر بذرته.
 */
const invoiceSeed = (variant) => async (db) => {
  const s = await salesV2Ready(db);
  const one = { qty: '10', price: '600' };
  const base = { ref: H33(1), sale: H33(2) };
  const o = {
    multi: { lines: [one, { qty: '5', price: '600' }] },
    discount: { lines: [{ ...one, discount: '100' }] },
    legs: { lines: [one], payments: [{ box: s.box, amount: '4000' }, { box: s.bank, amount: '2000' }] },
    partial: { lines: [one], payments: [{ box: s.box, amount: '1000' }] },
    unit: { lines: [{ qty: '1', price: '20000', unit: s.bag, factor: '50' }] },
    note: { lines: [one], note: 'تسليم في المخزن' },
    walk_in: { party: null, lines: [one], payments: [{ box: s.box, amount: '6000' }] },
    cash: { lines: [one], payments: [{ box: s.box, amount: '6000' }] },
  }[variant];
  await saleV2(db, s, { ...base, ...o });
};

const INVOICE_DATA = "select (select count(*) from public.sales_invoices)::text || '/' || (select count(*) from public.sales_lines)::text || '/' || (select count(*) from public.party_entries where doc_kind = 'sale')::text || '/' || (select count(*) from public.items)::text as v";

const H35 = (n) => `60000000-0000-4000-8000-0000000035${String(n).padStart(2, '0')}`;

/** 0035: فوج البذرة، و«علف الورقة» برصيد افتتاح 100 كغم في «رصيد العلف» (المدير). */
const sheetReady = async (db) => {
  await flockReady(db);
  await db.asUser(U.manager, async (q) => {
    const feed = await value(q, "insert into public.items (name, kind, base_unit) values ('علف الورقة', 'feed', 'kg') returning id");
    const store = await value(q, "select id from public.warehouses where kind = 'feed'");
    const doc = await value(q, 'insert into public.opening_docs (warehouse_id, on_date) values ($1, public.app_today() - 3) returning id', [store]);
    await q('insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, 100, 60000)', [doc, feed]);
    await q('select public.post_opening_stock($1, (select version from public.opening_docs where id = $1), $2)', [doc, H35(1)]);
  }, { commit: true });
};

/**
 * 0035 (طريق الرفض): ما لا يحمله النموذج القديم، كلّ حقيقة ببذرتها على فوج البذرة (المدير): خانة غاز، وعلف أُرسل اليوم ليوم أمس (يومه في القاعة قبل خروجه)،
 * وغاز مركون من الطابور بيوم في الفترة المقفلة (البذرة تقفل حتى قبل 30 يوماً). التراجع يُسقطها فطريق الرفض يوقفه، وطفرة كلّ فرع تعبر بذرته.
 */
const sheetSeed = (variant) => async (db) => {
  await sheetReady(db);
  await db.asUser(U.manager, async (q) => {
    const flock = await value(q, SEED_FLOCK);
    const feed = await value(q, "select id from public.items where name = 'علف الورقة'");
    if (variant === 'gas') await q('select public.set_flock_gas($1, public.app_today() - 1, 2, null, $2, false)', [flock, H35(2)]);
    if (variant === 'late') await q('select public.send_flock_feed($1, $2, $3, $4, $5, 5, public.app_today() - 1)', [H35(3), H35(4), H35(5), flock, feed]);
    if (variant === 'parked') {
      const parked = await value(q, 'select public.set_flock_gas($1, public.app_today() - 31, 1, null, $2, true)', [flock, H35(6)]);
      if (parked?.status !== 'parked') throw new Error(`غاز البذرة في الفترة المقفلة لم يُركن: ${JSON.stringify(parked)}`);
    }
  }, { commit: true });
};

const H36 = (n) => `60000000-0000-4000-8000-0000000036${String(n).padStart(2, '0')}`;

/**
 * 0036 (طريق الرفض): ما لا يحمله النموذج القديم، كلّ حقيقة ببذرتها على فوج البذرة (المدير): يوم سُجّلت هلاكاته صفراً (علامته لا يعيدها الملء)، وهلاكات
 * مركونة من الطابور، وغاز مضاف مركون، كلاهما بيوم في الفترة المقفلة (البذرة تقفل حتى قبل 30 يوماً). التراجع يُسقطها فطريق الرفض يوقفه، وطفرة كلّ فرع تعبر بذرته.
 */
const roundSeed = (variant) => async (db) => {
  await flockReady(db);
  await db.asUser(U.manager, async (q) => {
    const flock = await value(q, SEED_FLOCK);
    if (variant === 'zero') await q('select public.set_flock_dead($1, public.app_today() - 1, 0, $2, false)', [flock, H36(1)]);
    const park = async (sql, ref) => {
      const parked = await value(q, sql, [flock, ref]);
      if (parked?.status !== 'parked') throw new Error(`عملية البذرة في الفترة المقفلة لم تُركن: ${JSON.stringify(parked)}`);
    };
    if (variant === 'dead') await park('select public.set_flock_dead($1, public.app_today() - 31, 2, $2, true)', H36(2));
    if (variant === 'gas') await park('select public.add_flock_gas($1, public.app_today() - 31, 2, $2, true)', H36(3));
  }, { commit: true });
};

export const BLOCKING_SEEDS = {
  37: [
    {
      name: 'ترتيب قسم محفوظ',
      code: 'rollback_blocked',
      seed: store37Seed('order'),
      data: "select (select count(*) from public.store_orders where cardinality(item_ids) > 0)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_orders + v_marks + v_settings > 0 then', 'if v_marks + v_settings > 0 then'),
    },
    {
      name: 'لون مادّة',
      code: 'rollback_blocked',
      seed: store37Seed('mark'),
      data: "select (select count(*) from public.item_marks where color is not null)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_orders + v_marks + v_settings > 0 then', 'if v_orders + v_settings > 0 then'),
    },
    {
      name: 'إعدادات ألوان',
      code: 'rollback_blocked',
      seed: store37Seed('colors'),
      data: "select (select count(*) from public.store_color_settings where auto)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_orders + v_marks + v_settings > 0 then', 'if v_orders + v_marks > 0 then'),
    },
  ],
  36: [
    {
      name: 'يوم سُجّلت هلاكاته صفراً',
      code: 'rollback_blocked',
      seed: roundSeed('zero'),
      data: "select (select count(*) from public.flock_daily where dead_entered and dead + culled = 0)::text || '/' || (select count(*) from public.flock_visits)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_zero > 0 then', 'if false then'),
    },
    {
      name: 'هلاكات مركونة من الطابور',
      code: 'rollback_blocked',
      seed: roundSeed('dead'),
      data: "select (select count(*) from public.flock_day_rejects where payload ? 'dead' and visit_id is not null)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_dead > 0 then', 'if false then'),
    },
    {
      name: 'غاز مضاف مركون من الطابور',
      code: 'rollback_blocked',
      seed: roundSeed('gas'),
      data: "select (select count(*) from public.flock_day_rejects where payload ? 'gas_add')::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_gas > 0 then', 'if false then'),
    },
  ],
  35: [
    {
      name: 'خانة غاز',
      code: 'rollback_blocked',
      seed: sheetSeed('gas'),
      data: "select (select count(*) from public.flock_day_gas)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_gas > 0 then', 'if false then'),
    },
    {
      name: 'علف أُرسل اليوم ليوم فات',
      code: 'rollback_blocked',
      seed: sheetSeed('late'),
      data: "select (select count(*) from public.flock_issues where for_day < issued_on)::text || '/' || (select count(*) from public.stock_moves)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_late > 0 then', 'if false then'),
    },
    {
      name: 'غاز مركون من الطابور',
      code: 'rollback_blocked',
      seed: sheetSeed('parked'),
      data: "select (select count(*) from public.flock_day_rejects where payload ? 'gas')::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_parked > 0 then', 'if false then'),
    },
  ],
  33: [
    { name: 'فاتورة بأكثر من سطر', code: 'rollback_blocked', seed: invoiceSeed('multi'), data: INVOICE_DATA, mutate: (sql) => sql.replace('if v_multi > 0 then', 'if false then') },
    { name: 'فاتورة بخصم', code: 'rollback_blocked', seed: invoiceSeed('discount'), data: INVOICE_DATA, mutate: (sql) => sql.replace('if v_discount > 0 then', 'if false then') },
    { name: 'فاتورة من صندوقين', code: 'rollback_blocked', seed: invoiceSeed('legs'), data: INVOICE_DATA, mutate: (sql) => sql.replace('if v_legs > 0 then', 'if false then') },
    { name: 'فاتورة بدفع جزئيّ', code: 'rollback_blocked', seed: invoiceSeed('partial'), data: INVOICE_DATA, mutate: (sql) => sql.replace('if v_partial > 0 then', 'if false then') },
    { name: 'سطر بوحدة بيع', code: 'rollback_blocked', seed: invoiceSeed('unit'), data: INVOICE_DATA, mutate: (sql) => sql.replace('if v_units > 0 then', 'if false then') },
    { name: 'فاتورة بملاحظة', code: 'rollback_blocked', seed: invoiceSeed('note'), data: INVOICE_DATA, mutate: (sql) => sql.replace('if v_notes > 0 then', 'if false then') },
    { name: 'فاتورة لزبون نقديّ', code: 'rollback_blocked', seed: invoiceSeed('walk_in'), data: INVOICE_DATA, mutate: (sql) => sql.replace('if v_walk_in > 0 then', 'if false then') },
    // مراجعة 0033 V3: فاتورة جديدة مدفوعة كلّها من صندوق واحد (لا شيء غيرها يوقف التراجع): صفّ تدقيق ساقها يظهر بعده خارج النطاق.
    { name: 'ساق مدقَّقة لفاتورة جديدة', code: 'rollback_blocked', seed: invoiceSeed('cash'), data: INVOICE_DATA, mutate: (sql) => sql.replace('if v_audit > 0 and', 'if false and') },
  ],
  32: [
    {
      name: 'زيارة جديدة حيّة',
      code: 'rollback_blocked',
      seed: visitSeed('live'),
      data: "select (select count(*) from public.flock_visits where voided_at is null and source <> 'legacy')::text || '/' || (select count(*) from public.flock_daily)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_new > 0 then', 'if false then'),
    },
    {
      name: 'زيارة أُلغيت (لا يبقى منها إلّا العلامة)',
      code: 'rollback_blocked',
      seed: visitSeed('voided'),
      data: "select (select count(*) from public.flock_visits where voided_at is not null)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_voided > 0 then', 'if false then'),
    },
    {
      name: 'زيارة مركونة من الطابور',
      code: 'rollback_blocked',
      seed: visitSeed('parked'),
      data: "select (select count(*) from public.flock_day_rejects where visit_id is not null)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_parked > 0 then', 'if false then'),
    },
  ],
  31: [
    {
      name: 'ملاحظة يوم في تقرير القاعات',
      code: 'rollback_blocked',
      seed: hallsNoteSeed('note'),
      data: "select (select count(*) from public.halls_day_notes where note <> '')::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_notes > 0 then', 'if false then'),
    },
    {
      name: 'ملاحظة مُسحت (يبقى صفّها بنسخته)',
      code: 'rollback_blocked',
      seed: hallsNoteSeed('cleared'),
      data: "select (select count(*) from public.halls_day_notes where note = '')::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_notes > 0 then', 'if false then'),
    },
  ],
  30: [
    {
      name: 'جدول نوع بنهاية مفتوحة',
      code: 'rollback_blocked',
      seed: open30Seed('type'),
      data: "select (select count(*) from public.vaccine_programs where end_age is null)::text || '/' || (select count(*) from public.vaccine_program_days)::text || '/' || (select count(*) from public.vaccines)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_types + v_halls > 0 then', 'if false then'),
    },
    {
      name: 'جدول قاعة بنهاية مفتوحة',
      code: 'rollback_blocked',
      seed: open30Seed('hall'),
      data: "select (select count(*) from public.hall_vaccine_programs where end_age is null)::text || '/' || (select count(*) from public.hall_vaccine_program_days)::text || '/' || (select count(*) from public.halls)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_types + v_halls > 0 then', 'if false then'),
    },
  ],
  28: [
    {
      name: 'جدول لقاحات خاصّ لقاعة',
      code: 'rollback_blocked',
      seed: halls28Seed('program'),
      data: "select (select count(*) from public.hall_vaccine_programs)::text || '/' || (select count(*) from public.hall_vaccine_program_days)::text || '/' || (select count(*) from public.halls)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_programs > 0 then', 'if false then'),
    },
    {
      name: 'جدول قاعة حُذف (يبقى صفّه بنسخته)',
      code: 'rollback_blocked',
      seed: halls28Seed('dropped'),
      // الجدول المحذوف بلا أيّام أبداً، فعدّها لا يدخل (جزء صفر = «ما زرعت شي» في مشغّل التراجع).
      data: "select (select count(*) from public.hall_vaccine_programs where dropped_at is not null)::text || '/' || (select count(*) from public.halls)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_programs > 0 then', 'if false then'),
    },
  ],
  29: [
    {
      name: 'مسوّدة تذكرة وزن',
      code: 'rollback_blocked',
      seed: birds28Seed('ticket'),
      data: "select (select count(*) from public.weigh_tickets where status = 'draft')::text || '/' || (select count(*) from public.weigh_ticket_stops)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_tickets > 0 then', 'if false then'),
    },
    {
      name: 'فاتورة طيور مرحّلة',
      code: 'rollback_blocked',
      seed: birds28Seed('sale'),
      data: "select (select count(*) from public.bird_sales where status = 'posted')::text || '/' || (select count(*) from public.party_entries where doc_kind = 'bird_sale')::text || '/' || (select count(*) from public.flock_counts where kind = 'sold')::text || '/' || (select count(*) from public.doc_counters where kind in ('WT', 'BR'))::text as v",
      mutate: (sql) => sql.replace('if v_sales > 0 then', 'if false then'),
    },
    {
      name: 'فرق عدّ',
      code: 'rollback_blocked',
      seed: birds28Seed('adjust'),
      data: "select (select count(*) from public.flock_counts where doc_kind = 'count_adjust')::text || '/' || (select count(*) from public.flocks)::text as v",
      mutate: (sql) => sql.replace('if v_adjusts > 0 then', 'if false then'),
    },
    {
      name: 'دورة مغلقة بإرجاع',
      code: 'rollback_blocked',
      seed: birds28Seed('close'),
      data: "select (select count(*) from public.flock_closes where status = 'closed')::text || '/' || (select count(*) from public.flock_returns)::text || '/' || (select count(*) from public.stock_moves where doc_kind = 'flock_return')::text || '/' || (select count(*) from public.flocks where status = 'closed')::text as v",
      mutate: (sql) => sql.replace('if v_closes > 0 then', 'if false then'),
    },
    {
      name: 'نقل مطبَّق',
      code: 'rollback_blocked',
      seed: birds28Seed('carry'),
      data: "select (select count(*) from public.flock_close_lines where carry_status = 'applied')::text || '/' || (select count(*) from public.flock_costs where doc_kind = 'flock_carry')::text || '/' || (select count(*) from public.flocks)::text as v",
      mutate: (sql) => sql.replace('if v_applied > 0 then', 'if false then'),
    },
    {
      name: 'تذكرة حُذفت يدويّاً (سجلّ تدقيق وحده)',
      code: 'rollback_blocked',
      seed: birds28Seed('audit'),
      data: `select (select count(*) from public.audit_log where table_name in ${BIRD_TABLES})::text || '/' || (select count(*) from public.flocks)::text as v`,
      mutate: (sql) => sql.replace('= 0 and v_traces > 0 then', '= 0 and false then'),
    },
  ],
  26: [
    {
      name: 'لقاح في القائمة',
      code: 'rollback_blocked',
      seed: halls26Seed('vaccine'),
      data: "select (select count(*) from public.vaccines)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_vaccines > 0 then', 'if false then'),
    },
    {
      name: 'جدول لقاحات',
      code: 'rollback_blocked',
      seed: halls26Seed('program'),
      data: "select (select count(*) from public.vaccine_programs)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_programs > 0 then', 'if false then'),
    },
    {
      name: 'تسجيل دواء',
      code: 'rollback_blocked',
      seed: halls26Seed('log'),
      data: "select (select count(*) from public.flock_logs)::text || '/' || (select count(*) from public.flocks)::text as v",
      mutate: (sql) => sql.replace('if v_logs > 0 then', 'if false then'),
    },
    {
      name: 'تسجيل دواء حُذف (سجلّ تدقيق وحده)',
      code: 'rollback_blocked',
      seed: halls26Seed('audit'),
      data: "select (select count(*) from public.audit_log where table_name = 'flock_logs')::text || '/' || (select count(*) from public.flocks)::text as v",
      mutate: (sql) => sql.replace('if v_audit > 0 and v_vaccines + v_programs + v_logs = 0 then', 'if false then'),
    },
  ],
  25: [
    {
      name: 'دفعة حُفظت موادّها في خلطتها',
      code: 'rollback_blocked',
      seed: mill25Seed('saved'),
      data: "select (select count(*) from public.production_batches where saved_to_recipe)::text || '/' || (select count(*) from public.production_batches)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_saved > 0 then', 'if false then'),
    },
    {
      name: 'نسخة خلطة بلا أساس',
      code: 'rollback_blocked',
      seed: mill25Seed('basis'),
      data: "select (select count(*) from public.recipe_versions where basis_kg is null)::text || '/' || (select count(*) from public.recipe_lines)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_bases > 0 then', 'if false then'),
    },
    {
      name: 'سطر خلطة بلا كمية',
      code: 'rollback_blocked',
      seed: mill25Seed('qty'),
      data: "select (select count(*) from public.recipe_lines where qty is null)::text || '/' || (select count(*) from public.recipe_versions)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_lines > 0 then', 'if false then'),
    },
  ],
  22: [
    {
      name: 'ملاحظة يومية',
      code: 'rollback_blocked',
      seed: dayNoteSeed,
      data: "select (select count(*) from public.stock_day_notes)::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_notes > 0 then', 'if false then'),
    },
  ],
  21: [
    {
      name: 'فاتورة بيع',
      code: 'rollback_blocked',
      seed: saleSeed,
      data: "select (select count(*) from public.sales_invoices)::text || '/' || (select count(*) from public.stock_moves where doc_kind = 'sale')::text || '/' || (select count(*) from public.party_entries where doc_kind = 'sale')::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace(SALE_CONDITION, 'false'),
    },
  ],
  20: [
    {
      name: 'تحويل مادّة',
      code: 'rollback_blocked',
      seed: storeOpsSeed('conversion'),
      data: "select (select count(*) from public.stock_conversions)::text || '/' || (select count(*) from public.stock_moves where doc_kind = 'conversion')::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_conversions > 0 then', 'if false then'),
    },
    {
      name: 'شراء بلا سعر',
      code: 'rollback_blocked',
      seed: storeOpsSeed('unpriced'),
      data: "select (select count(*) from public.purchase_prices where unit_price is null)::text || '/' || (select count(*) from public.receipts where status = 'posted')::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace('if v_unpriced > 0 then', 'if false then'),
    },
  ],
  19: [
    {
      name: 'صرف لفوج',
      code: 'rollback_blocked',
      seed: flockIssueSeed,
      data: "select (select count(*) from public.flock_issues)::text || '/' || (select count(*) from public.flock_costs)::text || '/' || (select count(*) from public.stock_moves where doc_kind = 'flock_issue')::text || '/' || (select count(*) from public.items)::text as v",
      mutate: (sql) => sql.replace(FLOCK_ISSUE_CONDITION, 'false'),
    },
  ],
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
  [19, 1, 'صرف لفوج (صفّ في flock_issues وflock_issue_lines وflock_costs) يوقف التراجع'],
  [20, 2, 'تحويل مادّة، وشراء بلا سعر، كلّ واحد يوقف التراجع'],
  [21, 1, 'فاتورة بيع (صفّ في sales_invoices وsales_lines وsales_line_costs) توقف التراجع'],
  [22, 1, 'ملاحظة يومية (صفّ في stock_day_notes) توقف التراجع'],
  [25, 3, 'دفعة حُفظت موادّها في خلطتها، ونسخة خلطة بلا أساس، وسطر خلطة بلا كمية، كلّ واحد يوقف التراجع'],
  [26, 4, 'لقاح في القائمة، وجدول لقاحات، وتسجيل دواء، وسجلّ تدقيق لتسجيل حُذف، كلّ واحد يوقف التراجع'],
  [28, 2, 'جدول لقاحات خاصّ لقاعة، وجدول قاعة حُذف فبقي صفّه بنسخته، كلّ واحد يوقف التراجع'],
  [29, 6, 'مسوّدة تذكرة وزن، وفاتورة طيور مرحّلة، وفرق عدّ، ودورة مغلقة بإرجاع، ونقل مطبَّق، وأثر في سجلّ التدقيق وحده، كلّ واحد يوقف التراجع'],
  [30, 2, 'جدول نوع بنهاية مفتوحة، وجدول قاعة بنهاية مفتوحة، كلّ واحد يوقف التراجع'],
  [31, 2, 'ملاحظة يوم في تقرير القاعات، وملاحظة مُسحت فبقي صفّها بنسخته، كلّ واحدة توقف التراجع'],
  [32, 3, 'زيارة جديدة حيّة، وزيارة أُلغيت، وزيارة مركونة، كلّ واحدة توقف التراجع'],
  [33, 8, 'فاتورة بأكثر من سطر، وبخصم، ومن صندوقين، وبدفع جزئيّ، وبوحدة بيع، وبملاحظة، ولزبون نقديّ، وساق مدقَّقة لفاتورة جديدة مدفوعة كلّها، كلّ واحدة توقف التراجع'],
  [35, 3, 'خانة غاز، وعلف أُرسل ليوم فات، وغاز مركون، كلّ واحد يوقف التراجع'],
  [36, 3, 'يوم سُجّلت هلاكاته صفراً، وهلاكات مركونة، وغاز مضاف مركون، كلّ واحد يوقف التراجع'],
  [37, 3, 'ترتيب قسم محفوظ، ولون مادّة، وإعدادات ألوان، كلّ واحد يوقف التراجع'],
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

/** بعد إعادة 0019: المدير يصرف من «علف البذرة» للفوج على البيانات القائمة، و«علف القاعة» 5 كغم، وثوابت الصرف والمخزون صفر. */
const flockIssueRedone = async (db) => {
  const problems = [];
  try {
    await issueToSeedFlock([85, 86, 87])(db);
  } catch (error) {
    problems.push(`record_flock_issue بعد الإعادة رفض: ${error.message}`);
  }
  const fed = await db.asUser(U.manager, (q) => value(q, `select public.flock_feed((${SEED_FLOCK})) ->> 'issued_feed_kg'`));
  if (fed !== '5.000') problems.push(`علف القاعة بعد الإعادة ${fed} والمتوقّع 5.000`);
  const bad = await db.asService(async (q) => (await q('select check_name, violations::text as v from public.verify_flock_issues() union all select check_name, violations::text from public.verify_stock()')).rows
    .filter((r) => r.v !== '0').map((r) => `${r.check_name} = ${r.v}`));
  if (bad.length) problems.push(`الثوابت بعد الصرف: ${bad.join('، ')}`);
  return problems;
};

/**
 * 0020: حالة التراجع الكاملة على بيانات يمرّ عليها الجسمان المشتركان (المدير): شراء «كاز الرجوع» 20 لتراً بـ750 في المخزن العامّ، ونقل 5 لترات منه
 * إلى مخزن الحقل بالورقة (post_transfer على post_transfer_core)، وصرف لترين، وتصحيح سعره إلى 16,000 (post_receipt_revalue على revaluation_post).
 * بلا تحويل ولا شراء بلا سعر، فالتراجع يكمل.
 */
const storeOpsReady = async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    const fuel = await value(q, "insert into public.items (name, kind, base_unit) values ('كاز الرجوع', 'fuel', 'L') returning id");
    const party = await value(q, "select id from public.parties where name = 'مورّد الحبوب'");
    const line = await value(q, 'select gen_random_uuid()');
    await q("select public.record_purchase(gen_random_uuid(), gen_random_uuid(), $1, $2, $3, public.app_today(), 20, 750, null, 'credit', null, null)", [line, fuel, party]);
    await storeOpsTransfer(q, fuel, 5);
    // صرف لترين (stock_use) قبل التصحيح: التصحيح يرفض دفعة لم يُسحب منها شيء (not_drawn)، والنقل لا يُعدّ سحباً.
    const general = await value(q, "select id from public.warehouses where kind = 'general'");
    const category = await value(q, "insert into public.expense_categories (name) values ('تشغيل الرجوع') returning id");
    const use = await value(q, 'insert into public.stock_uses (warehouse_id, category_id, used_on) values ($1, $2, public.app_today()) returning id', [general, category]);
    await q('insert into public.stock_use_lines (doc_id, item_id, qty_in_unit) values ($1, $2, 2)', [use, fuel]);
    await q("select public.post_stock_use($1, (select version from public.stock_uses where id = $1), public.preview_stock_use($1) ->> 'plan', gen_random_uuid())", [use]);
    await q("select public.post_receipt_revalue($1, 16000, public.preview_receipt_revalue($1, 16000) ->> 'plan', 'فاتورة معدّلة', gen_random_uuid())", [line]);
  }, { commit: true });
};

/** نقل بالورقة من المخزن العامّ إلى مخزن الحقل (مسوّدة ومعاينة وترحيل). */
const storeOpsTransfer = async (q, fuel, qty) => {
  const general = await value(q, "select id from public.warehouses where kind = 'general'");
  const farm = await value(q, "select id from public.warehouses where name = 'مخزن حقل الأمل'");
  const doc = await value(q, 'insert into public.transfers (from_warehouse_id, to_warehouse_id, moved_on) values ($1, $2, public.app_today()) returning id', [general, farm]);
  await q('insert into public.transfer_lines (doc_id, item_id, qty_in_unit) values ($1, $2, $3)', [doc, fuel, qty]);
  await q("select public.post_transfer($1, (select version from public.transfers where id = $1), public.preview_transfer($1) ->> 'plan', gen_random_uuid())", [doc]);
};

/** بين التراجع والإعادة (كتالوج 0019، post_transfer بجسم 0007 وpost_receipt_revalue بجسم 0010): نقل ثانٍ وتصحيح ثانٍ إلى 16,500. */
const storeOpsOn0019 = async (db) => {
  await db.asUser(U.manager, async (q) => {
    const fuel = await value(q, "select id from public.items where name = 'كاز الرجوع'");
    await storeOpsTransfer(q, fuel, 3);
    const line = await value(q, 'select id from public.receipt_lines where item_id = $1', [fuel]);
    await q("select public.post_receipt_revalue($1, 16500, public.preview_receipt_revalue($1, 16500) ->> 'plan', 'فاتورة معدّلة ثانية', gen_random_uuid())", [line]);
  }, { commit: true });
};

/** بعد الإعادة: نقل بخطوة، وتحويل مادّة، وشراء بلا سعر يُكمَّل بعد نقل منه، وحذف مادّة؛ ثمّ الثوابت. */
const storeOpsRedone = async (db) => {
  const problems = [];
  try {
    await db.asUser(U.manager, async (q) => {
      const fuel = await value(q, "select id from public.items where name = 'كاز الرجوع'");
      const farm = await value(q, "select id from public.warehouses where name = 'مخزن حقل الأمل'");
      await q('select public.record_transfer(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), $1, 2, null, $2, public.app_today())', [fuel, farm]);
      const oil = await value(q, "insert into public.items (name, kind, base_unit) values ('زيت الرجوع', 'fuel', 'L') returning id");
      const general = await value(q, "select id from public.warehouses where kind = 'general'");
      await q('select public.record_conversion(gen_random_uuid(), gen_random_uuid(), $1, 1, $2, 1, public.app_today(), $3, null)', [fuel, oil, general]);
      const party = await value(q, "select id from public.parties where name = 'مورّد الحبوب'");
      const line = await value(q, 'select gen_random_uuid()');
      await q("select public.record_purchase(gen_random_uuid(), gen_random_uuid(), $1, $2, $3, public.app_today(), 10, null, null, 'credit', null, null)", [line, oil, party]);
      await q('select public.record_transfer(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), $1, 4, null, $2, public.app_today())', [oil, farm]);
      await q('select public.price_purchase(gen_random_uuid(), $1, 900, null)', [line]);
      const spare = await value(q, "insert into public.items (name, kind, base_unit) values ('مادّة الرجوع', 'raw', 'kg') returning id");
      await q('select public.delete_item($1, 1)', [spare]);
    }, { commit: true });
  } catch (error) {
    problems.push(`عمليات 0020 بعد الإعادة رفضت: ${error.message}`);
  }
  const bad = await db.asService(async (q) => (await q('select check_name, violations::text as v from public.verify_store_ops() union all select check_name, violations::text from public.verify_purchases() union all select check_name, violations::text from public.verify_stock()')).rows
    .filter((r) => r.v !== '0').map((r) => `${r.check_name} = ${r.v}`));
  if (bad.length) problems.push(`الثوابت بعد عمليات 0020: ${bad.join('، ')}`);
  return problems;
};

/** اسم مخزن العلف في وحدة المعمل (مخزن واحد في البذرة). */
const feedStoreName = (db) => value(db.admin, "select w.name from public.warehouses w join public.divisions d on d.id = w.division_id where w.kind = 'feed' and d.kind = 'feed_mill'");

/**
 * 0025: حالة التراجع الكاملة على بيانات معمل بكميات تقبلها قاعدة 0024 (المدير بدوالّ 0025): رصيد افتتاحي للذرة في مخزن المواد، وخلطة «علف الرجوع»
 * بكميات (ذرة 1,000 لأساس 1,000) وإنتاج 100 كغم منها بـrecord_production إلى «رصيد العلف». بلا خلطة بالموادّ ولا دفعة حُفظت موادّها، فالتراجع يكمل.
 */
const mill25Ready = async (db) => {
  await seedThroughRpcs(db);
  await db.asUser(U.manager, async (q) => {
    const raw = await value(q, "select id from public.warehouses where kind = 'raw'");
    const feedWh = await value(q, "select id from public.warehouses where kind = 'feed'");
    const corn = await value(q, "select id from public.items where name = 'ذرة صفراء'");
    const feed = await value(q, "insert into public.items (name, kind, base_unit) values ('علف الرجوع', 'feed', 'kg') returning id");
    const opening = await value(q, 'insert into public.opening_docs (warehouse_id, on_date) values ($1, public.app_today() - 3) returning id', [raw]);
    await q('insert into public.opening_lines (doc_id, item_id, qty_base, value) values ($1, $2, 1000, 450000)', [opening, corn]);
    await q('select public.post_opening_stock($1, (select version from public.opening_docs where id = $1), $2)', [opening, REF(90)]);
    await q("select public.create_recipe($1, $2, 'علف الرجوع', $3, 1000, jsonb_build_array(jsonb_build_object('item_id', $4::uuid, 'qty', 1000, 'unit', 'kg')), '[]'::jsonb, true)",
      [REF(88), REF(89), feed, corn]);
    await q("select public.record_production($1, $2, 100, $3, $4, public.app_today(), '[]'::jsonb, '[]'::jsonb, null, null, null, null, $5)", [REF(91), REF(89), raw, feedWh, REF(92)]);
  }, { commit: true });
};

/**
 * بين التراجع والإعادة (كتالوج 0024): «مخزن العلف» باسمه القديم، والمدير ينشئ خلطة ثانية بـcreate_recipe القديم (الأساس الفارغ يصير 1000) ويُنتج منها
 * 50 كغم بـrecord_production؛ فالمستعاد يعمل على البيانات، والإعادة تجري فوقها.
 */
const mill25On0024 = async (db) => {
  const name = await feedStoreName(db);
  if (name !== 'مخزن العلف') throw new Error(`اسم مخزن العلف بعد التراجع «${name}» والمتوقّع «مخزن العلف»`);
  await db.asUser(U.manager, async (q) => {
    const raw = await value(q, "select id from public.warehouses where kind = 'raw'");
    const feedWh = await value(q, "select id from public.warehouses where kind = 'feed'");
    const corn = await value(q, "select id from public.items where name = 'ذرة صفراء'");
    const feed = await value(q, "insert into public.items (name, kind, base_unit) values ('علف الرجوع الثاني', 'feed', 'kg') returning id");
    await q("select public.create_recipe($1, $2, 'علف الرجوع الثاني', $3, null, jsonb_build_array(jsonb_build_object('item_id', $4::uuid, 'qty', 1000, 'unit', 'kg')), '[]'::jsonb, true)",
      [REF(94), REF(95), feed, corn]);
    await q("select public.record_production($1, $2, 50, $3, $4, public.app_today(), '[]'::jsonb, '[]'::jsonb, null, null, null, null, $5)", [REF(96), REF(95), raw, feedWh, REF(97)]);
  }, { commit: true });
};

/**
 * بعد إعادة 0025: «رصيد العلف» باسمه، وproduce_batch على الخلطة بكميات (30 كغم بموادّها نفسها) وعلى خلطة بالموادّ جديدة (20 كغم)، والناتج كلّه في «رصيد
 * العلف» (أربع دفعات إنتاج فيه)، وverify_mill وverify_stock صفر.
 */
const mill25Redone = async (db) => {
  const problems = [];
  const name = await feedStoreName(db);
  if (name !== 'رصيد العلف') problems.push(`اسم مخزن العلف بعد الإعادة «${name}» والمتوقّع «رصيد العلف»`);
  try {
    await db.asUser(U.manager, async (q) => {
      const raw = await value(q, "select id from public.warehouses where kind = 'raw'");
      const corn = await value(q, "select id from public.items where name = 'ذرة صفراء'");
      const feed = await value(q, "insert into public.items (name, kind, base_unit) values ('علف بالموادّ', 'feed', 'kg') returning id");
      await q("select public.produce_batch(gen_random_uuid(), $1, $2, $3, jsonb_build_array(jsonb_build_object('item_id', $4::uuid, 'qty', '30')), null, false, public.app_today(), null, null, null, null, gen_random_uuid())",
        [REF(88), REF(89), raw, corn]);
      await q("select public.create_recipe($1, $2, 'علف بالموادّ', $3, null, jsonb_build_array(jsonb_build_object('item_id', $4::uuid)), '[]'::jsonb, true)", [REF(98), REF(99), feed, corn]);
      await q("select public.produce_batch(gen_random_uuid(), $1, $2, $3, jsonb_build_array(jsonb_build_object('item_id', $4::uuid, 'qty', '20')), null, false, public.app_today(), null, null, null, null, gen_random_uuid())",
        [REF(98), REF(99), raw, corn]);
    }, { commit: true });
  } catch (error) {
    problems.push(`produce_batch بعد الإعادة رفض: ${error.message}`);
  }
  const lots = await value(db.admin, `select count(*)::int from public.stock_lots l join public.warehouses w on w.id = l.warehouse_id join public.divisions d on d.id = w.division_id
    where l.source_kind = 'production' and w.kind = 'feed' and d.kind = 'feed_mill'`);
  if (lots !== 4) problems.push(`دفعات الإنتاج في «رصيد العلف» بعد الإعادة ${lots} والمتوقّع 4`);
  const bad = await db.asService(async (q) => (await q('select check_name, violations::text as v from public.verify_mill() union all select check_name, violations::text from public.verify_stock()')).rows
    .filter((r) => r.v !== '0').map((r) => `${r.check_name} = ${r.v}`));
  if (bad.length) problems.push(`الثوابت بعد الإنتاج: ${bad.join('، ')}`);
  return problems;
};

const FEED_RENAME = /\nupdate public\.warehouses w set name = 'رصيد العلف'\n[\s\S]*?;\n/u;

/**
 * 0028: حالة التراجع الكاملة على بيانات قاعات يمرّ عليها التراجع (المدير): فوج «قاعة البذرة» (1,000 طير قبل ثلاثة أيّام)، وصرف 5 كغم «علف البذرة» له قبل
 * يومين، وجولة أمس بنافق 10؛ بلا تذكرة ولا فاتورة ولا عدد ولا إغلاق، فالتراجع يكمل. وبين التراجع والإعادة جولة اليوم بجسم 0012 المسترجَع (نافق 5)؛
 * وبعد الإعادة تذكرة بمئة طير تُكمل وتُفوتر بالدين لـ«أبو علي» على تلك البيانات، ثمّ إغلاق الدورة اليوم بفرق العدّ وإرجاع كيلوغرامين إلى مخزن الحقل.
 */
const birds28Ready = async (db) => {
  await flockReady(db);
  await db.asUser(U.manager, async (q) => {
    const flock = await value(q, SEED_FLOCK);
    const feed = await value(q, "select id from public.items where name = 'علف البذرة'");
    await q('select public.record_flock_issue($1, $2, $3, $4, $5, 5, public.app_today() - 2, null)', [H29(20), H29(21), H29(22), flock, feed]);
    await q('select public.save_flock_day($1, public.app_today() - 1, 10, 0, 100, null, null, null, null, null, null, null, null, $2, false)', [flock, H29(23)]);
  }, { commit: true });
};

const birds28On0027 = async (db) => {
  await db.asUser(U.manager, async (q) => {
    const flock = await value(q, SEED_FLOCK);
    await q('select public.save_flock_day($1, public.app_today(), 5, 0, 120, null, null, null, null, null, null, null, null, $2, false)', [flock, H29(24)]);
  }, { commit: true });
};

const birds28Redone = async (db) => {
  const problems = [];
  try {
    await db.asUser(U.manager, async (q) => {
      const flock = await value(q, SEED_FLOCK);
      const hall = await value(q, "select id from public.halls where name = 'قاعة البذرة'");
      const site = await value(q, "select id from public.sites where name = 'حقل الأمل'");
      const feed = await value(q, "select id from public.items where name = 'علف البذرة'");
      const store = await value(q, "select id from public.warehouses where name = 'مخزن حقل الأمل'");
      const party = await value(q, "select id from public.parties where name = 'أبو علي'");
      const today = await value(q, 'select public.app_today()::text');
      const data = { site_id: site, on_date: today, method: 'scale', empty_kg: '7000', empty_with_crates: false, crate_kg: '6',
        stops: [{ id: H29(26), hall_id: hall, birds: 100, crates: 10, gross_kg: '7300', weighings: [] }] };
      await q('select public.save_weigh_ticket($1, null, $2::jsonb)', [H29(25), JSON.stringify(data)]);
      await q('select public.finish_weigh_ticket($1, $2, 1)', [H29(27), H29(25)]);
      await q('select public.record_bird_sale($1, $2, $3, 2, $4, 2750, 0, 0, null, null)', [H29(28), H29(29), H29(25), party]);
      await q("select public.close_flock($1, $2, $3, public.app_today(), 885, 100, $4::jsonb, 'بيعت خارج النظام', $5::jsonb, null, public.flock_close_form($3) ->> 'plan')",
        [H29(30), H29(31), flock, JSON.stringify([{ item_id: feed, qty: '5' }]), JSON.stringify([{ item_id: feed, qty: '2', action: 'return', warehouse_id: store }])]);
    }, { commit: true });
  } catch (error) {
    problems.push(`التذكرة والفاتورة والإغلاق بعد الإعادة رُفضت: ${error.message}`);
  }
  const closed = (await db.admin(`select f.status, (select sum(c.birds)::int from public.flock_counts c where c.flock_id = f.id) as counts,
      (select count(*)::int from public.flock_returns r where r.flock_id = f.id and r.status = 'posted') as returns
    from public.flocks f where f.id = (${SEED_FLOCK})`)).rows[0];
  if (JSON.stringify(closed) !== JSON.stringify({ status: 'closed', counts: -985, returns: 1 })) {
    problems.push(`الفوج بعد الإغلاق ${JSON.stringify(closed)} والمتوقّع مغلق بعدد −985 (مباع 100 وفرق عدّ −885) وإرجاع واحد`);
  }
  return problems;
};

/**
 * 0031: بعد الإعادة على فوج البذرة (صرف وجولة، birds28Ready): المدير يكتب ملاحظة اليوم، وhalls_history يرى الفوج (1,000 طير منذ البداية) والملاحظة،
 * وverify_halls_history صفر.
 */
const hallsHistoryRedone = async (db) => {
  const problems = [];
  try {
    const answer = await db.asUser(U.manager, (q) => value(q, "select public.set_halls_note(public.app_today(), 'بعد الإعادة', null)"), { commit: true });
    if (answer?.note?.text !== 'بعد الإعادة') problems.push(`set_halls_note بعد الإعادة: ${JSON.stringify(answer)}`);
    const history = await db.asUser(U.manager, (q) => value(q, 'select public.halls_history(null)'));
    const broiler = history.kinds.find((k) => k.kind === 'broiler');
    if (broiler?.total?.placed !== 1000 || history.notes.map((n) => n.text).join() !== 'بعد الإعادة') {
      problems.push(`halls_history بعد الإعادة: ${JSON.stringify({ placed: broiler?.total?.placed, notes: history.notes })}`);
    }
  } catch (error) {
    problems.push(`ملاحظة اليوم أو التقرير بعد الإعادة رُفض: ${error.message}`);
  }
  const bad = await db.asService(async (q) => (await q('select check_name, violations::text as v from public.verify_halls_history()')).rows
    .filter((r) => r.v !== '0').map((r) => `${r.check_name} = ${r.v}`));
  if (bad.length) problems.push(`الثوابت بعد الملاحظة: ${bad.join('، ')}`);
  return problems;
};

/**
 * 0032: حالة التراجع الكاملة على فوج البذرة: صرف 5 كغم «علف البذرة» قبل يومين، وجولة من الطابور بعملية save_flock_day بيوم أقدم من سبعة أيّام (تُركن بلا
 * زيارة، فيرجع القيد الفريد القديم وهي في الجدول)؛ بلا زيارة بعد الهجرة، فالتراجع يكمل.
 */
const visitsReady = async (db) => {
  await flockReady(db);
  await db.asUser(U.manager, async (q) => {
    const flock = await value(q, SEED_FLOCK);
    const feed = await value(q, "select id from public.items where name = 'علف البذرة'");
    await q('select public.record_flock_issue($1, $2, $3, $4, $5, 5, public.app_today() - 2, null)', [H32(20), H32(21), H32(22), flock, feed]);
    const parked = await value(q, 'select public.save_flock_day($1, public.app_today() - 9, 1, 0, null, null, null, null, null, null, null, null, null, $2, true)', [flock, H32(23)]);
    if (parked?.status !== 'parked') throw new Error(`جولة البذرة القديمة لم تُركن: ${JSON.stringify(parked)}`);
  }, { commit: true });
};

/** 0032: بين التراجع والإعادة (جسم 0029): جولة أمس، وجولة اليوم بملاحظة ثمّ تعديلها بالمستبعد (النسخة 2). */
const visitsOn0031 = async (db) => {
  await db.asUser(U.manager, async (q) => {
    const flock = await value(q, SEED_FLOCK);
    await q('select public.save_flock_day($1, public.app_today() - 1, 10, 0, 100, null, null, null, null, null, null, null, null, $2, false)', [flock, H32(24)]);
    await q("select public.save_flock_day($1, public.app_today(), 5, 0, 120, null, null, null, null, null, null, 'جولة الصباح', null, $2, false)", [flock, H32(25)]);
    await q('select public.save_flock_day($1, public.app_today(), null, 2, null, null, null, null, null, null, null, null, 1, $2, false)', [flock, H32(26)]);
  }, { commit: true });
};

/**
 * 0032: بعد الإعادة: صفّا أمس واليوم (بجسم 0029) صار كلّ واحد زيارة legacy واحدة بقيمه ونسخته وكاتبه، وround_visits يرى زيارة اليوم، وزيارة جديدة اليوم
 * (نافق 1 وعلف 30) تنضاف إلى المجموع (6 نافق، و2 مستبعد، و150 كغم، والنسخة 3)، والثابت صفر.
 */
const visitsRedone = async (db) => {
  const problems = [];
  const legacy = (await db.admin(`select count(*)::int as n, count(*) filter (where v.source = 'legacy' and v.voided_at is null and v.version = d.version
      and (v.dead, v.culled, v.feed_kg, v.note, v.recorded_at) is not distinct from (d.dead, d.culled, d.feed_kg, d.note, d.updated_at))::int as same
    from public.flock_daily d join public.flock_visits v on v.org_id = d.org_id and v.flock_id = d.flock_id and v.on_date = d.on_date
    where d.flock_id = (${SEED_FLOCK})`)).rows[0];
  if (legacy.n !== 2 || legacy.same !== 2) problems.push(`زيارات legacy بعد الإعادة ${JSON.stringify(legacy)} والمتوقّع زيارتان بقيم صفّيهما`);
  try {
    const seen = await db.asUser(U.manager, async (q) => value(q, "select public.round_visits(null, 'broiler', null)"));
    const visits = seen.flocks.flatMap((f) => f.visits).map((v) => [v.source, v.dead, v.culled, v.feed_kg, v.note, v.version, v.by]);
    if (JSON.stringify(visits) !== JSON.stringify([['legacy', 5, 2, '120.000', 'جولة الصباح', 2, 'manager']])) problems.push(`round_visits بعد الإعادة: ${JSON.stringify(visits)}`);
    const saved = await db.asUser(U.manager, async (q) => {
      const flock = await value(q, SEED_FLOCK);
      return value(q, 'select public.save_flock_visit($1, $2, public.app_today(), now(), 1, null, 30, null, null, null, null, null, false, $3, false)', [H32(27), flock, H32(28)]);
    }, { commit: true });
    const day = [saved?.status, saved?.day?.dead, saved?.day?.culled, saved?.day?.feed_kg, saved?.day?.version, saved?.day?.note];
    if (JSON.stringify(day) !== JSON.stringify(['saved', 6, 2, '150', 3, 'جولة الصباح'])) problems.push(`زيارة بعد الإعادة: ${JSON.stringify(day)}`);
  } catch (error) {
    problems.push(`الزيارات بعد الإعادة رُفضت: ${error.message}`);
  }
  const bad = await db.asService(async (q) => (await q('select check_name, violations::text as v from public.verify_round_visits()')).rows
    .filter((r) => r.v !== '0').map((r) => `${r.check_name} = ${r.v}`));
  if (bad.length) problems.push(`الثوابت بعد الزيارة: ${bad.join('، ')}`);
  return problems;
};

/**
 * 0033: حالة التراجع الكاملة: فاتورتا record_sale_v2 بسطر وبوحدة الأساس بالدين كلّها، وبيع قديم نقداً بـrecord_sale (بساق مرآة بلا صفّ تدقيق).
 * بلا ما لا يحمله النموذج القديم، فالتراجع يكمل. (فاتورة جديدة مدفوعة من صندوق يوقفها صفّ تدقيق ساقها، مراجعة 0033 V3: بذرة «ساق مدقَّقة».)
 */
const salesFullReady = async (db) => {
  const s = await salesV2Ready(db);
  await saleV2(db, s, { ref: H33(10), sale: H33(11), lines: [{ qty: '10', price: '600' }] });
  await saleV2(db, s, { ref: H33(12), sale: H33(13), seq: 1, lines: [{ qty: '5', price: '700' }] });
  await db.asUser(U.manager, (q) => q("select public.record_sale($1, $2, $3, $4, $5, 2, 650, public.app_today(), 'cash', $6, null)", [H33(14), H33(15), H33(16), s.customer, s.corn, s.box]), { commit: true });
};

/** 0033: بين التراجع والإعادة (جسم 0021): بيع نقديّ ثانٍ 3 كغم بـ600. */
const salesOn0032 = async (db) => {
  await db.asUser(U.manager, async (q) => {
    const corn = await value(q, "select id from public.items where name = 'ذرة صفراء'");
    const customer = await value(q, "select id from public.parties where name = 'أبو علي'");
    const box = await value(q, "select id from public.cash_accounts where name = 'الصندوق'");
    await q("select public.record_sale($1, $2, $3, $4, $5, 3, 600, public.app_today(), 'cash', $6, null)", [H33(17), H33(18), H33(19), customer, corn, box]);
  }, { commit: true });
};

/**
 * 0033: بعد الإعادة: كلّ بيع نقديّ (القديمان) ساق واحدة بمعرّف مشتقّ مرآة رأسه، والصافي والمدفوع كما كانا، وبلا صفّ تدقيق لساق المرآة (الملء وrecord_sale،
 * مراجعة 0033 V3)؛ وفاتورة بسطرين وخصم وسيقان، وأخرى لزبون نقديّ، تُكتبان وتُقرآن؛ والثوابت صفر.
 */
const salesRedone = async (db) => {
  const problems = [];
  const legs = (await db.admin(`select s.id::text as sale, s.total::text as total, s.paid::text as paid, g.id = md5(s.id::text || ':1')::uuid as derived,
      g.cash_account_id = s.cash_account_id and g.payment_entry_id = s.payment_entry_id and g.cash_move_id = s.cash_move_id as mirror
    from public.sales_invoices s left join public.sales_payments g on g.sale_id = s.id where s.payment = 'cash' order by s.doc_no`)).rows;
  const expected = [[H33(15), '1300', '1300'], [H33(18), '1800', '1800']].sort((a, b) => a[0].localeCompare(b[0]));
  const seen = legs.map((r) => [r.sale, r.total, r.paid]).sort((a, b) => a[0].localeCompare(b[0]));
  if (JSON.stringify(seen) !== JSON.stringify(expected) || legs.some((r) => !r.derived || !r.mirror)) problems.push(`سيقان البيع النقديّ بعد الإعادة: ${JSON.stringify(legs)}`);
  const mirrorAudit = (await db.admin("select count(*)::int as n from public.audit_log where table_name = 'sales_payments'")).rows[0].n;
  if (mirrorAudit !== 0) problems.push(`ساق المرآة بعد الإعادة بصفّ تدقيق (${mirrorAudit})، فيظهر بعد تراجع ثانٍ خارج النطاق`);
  try {
    const s = await db.asUser(U.manager, async (q) => ({
      corn: await value(q, "select id from public.items where name = 'ذرة صفراء'"),
      customer: await value(q, "select id from public.parties where name = 'أبو علي'"),
      box: await value(q, "select id from public.cash_accounts where name = 'الصندوق'"),
      bank: await value(q, "select id from public.cash_accounts where name = 'المصرف'"),
      raw: await value(q, "select id from public.warehouses where kind = 'raw'"),
    }));
    const multi = await saleV2(db, s, { ref: H33(20), sale: H33(21), seq: 2, lines: [{ qty: '4', price: '600', discount: '100' }, { qty: '2', price: '650' }], discount: 50,
      payments: [{ box: s.box, amount: '1000' }, { box: s.bank, amount: '500' }], note: 'بعد الإعادة' });
    const walk = await saleV2(db, s, { ref: H33(22), sale: H33(23), seq: 3, party: null, lines: [{ qty: '1', price: '600' }], payments: [{ box: s.box, amount: '600' }] });
    const detail = await db.asUser(U.manager, async (q) => value(q, 'select public.sale_detail($1)', [H33(21)]));
    const got = [multi?.total, multi?.paid, multi?.debt, walk?.walk_in, detail?.lines?.length, detail?.payments?.length, detail?.note];
    if (JSON.stringify(got) !== JSON.stringify(['3550', '1500', '2050', true, 2, 2, 'بعد الإعادة'])) problems.push(`الفاتورة بعد الإعادة: ${JSON.stringify(got)}`);
  } catch (error) {
    problems.push(`الفاتورة بعد الإعادة رُفضت: ${error.message}`);
  }
  const bad = await db.asService(async (q) => (await q('select check_name, violations::text as v from public.verify_sales()')).rows
    .filter((r) => r.v !== '0').map((r) => `${r.check_name} = ${r.v}`));
  if (bad.length) problems.push(`الثوابت بعد الفاتورة: ${bad.join('، ')}`);
  return problems;
};

/**
 * 0035: حالة التراجع الكاملة على فوج البذرة: 10 كغم «علف الورقة» أُرسلت اليوم ليومها (لا يوم قاعة قبل خروجه)، فالتراجع يكمل؛ وبين التراجع والإعادة صرف 5 كغم
 * منه اليوم بجسم 0019؛ وبعد الإعادة غاز أمس (2) و5 كغم أُرسلت اليوم لقبل يومين، والورقة تعدّها كلّها على أيّامها (20 كغم، منها 15 اليوم)، والثابت صفر.
 */
const sheetFullReady = async (db) => {
  await sheetReady(db);
  await db.asUser(U.manager, async (q) => {
    const flock = await value(q, SEED_FLOCK);
    const feed = await value(q, "select id from public.items where name = 'علف الورقة'");
    await q('select public.send_flock_feed($1, $2, $3, $4, $5, 10, public.app_today())', [H35(10), H35(11), H35(12), flock, feed]);
  }, { commit: true });
};

const sheetOn0034 = async (db) => {
  await db.asUser(U.manager, async (q) => {
    const flock = await value(q, SEED_FLOCK);
    const feed = await value(q, "select id from public.items where name = 'علف الورقة'");
    await q('select public.record_flock_issue($1, $2, $3, $4, $5, 5, public.app_today(), null)', [H35(13), H35(14), H35(15), flock, feed]);
  }, { commit: true });
};

const sheetRedone = async (db) => {
  const problems = [];
  try {
    const sheet = await db.asUser(U.manager, async (q) => {
      const flock = await value(q, SEED_FLOCK);
      const feed = await value(q, "select id from public.items where name = 'علف الورقة'");
      await q('select public.set_flock_gas($1, public.app_today() - 1, 2, null, $2, false)', [flock, H35(16)]);
      await q('select public.send_flock_feed($1, $2, $3, $4, $5, 5, public.app_today() - 2)', [H35(17), H35(18), H35(19), flock, feed]);
      return value(q, 'select public.hall_sheet($1)', [flock]);
    }, { commit: true });
    const today = sheet.today;
    const byDay = Object.fromEntries(sheet.days.filter((d) => d.feed_kg !== null || d.gas !== null).map((d) => [d.on, [d.feed_kg, d.gas]]));
    const want = { [sheet.days[1].on]: ['5.000', null], [sheet.days[2].on]: [null, 2], [today]: ['15.000', null] };
    if (JSON.stringify([byDay, sheet.totals.feed_kg, sheet.totals.gas]) !== JSON.stringify([want, '20.000', 2])) {
      problems.push(`الورقة بعد الإعادة: ${JSON.stringify([byDay, sheet.totals.feed_kg, sheet.totals.gas])}`);
    }
  } catch (error) {
    problems.push(`الغاز والعلف بعد الإعادة رُفضا: ${error.message}`);
  }
  const bad = await db.asService(async (q) => (await q('select check_name, violations::text as v from public.verify_hall_sheet()')).rows
    .filter((r) => r.v !== '0').map((r) => `${r.check_name} = ${r.v}`));
  if (bad.length) problems.push(`الثوابت بعد الورقة: ${bad.join('، ')}`);
  return problems;
};

/**
 * 0036: حالة التراجع الكاملة على فوج البذرة بلا ما يوقفه: هلاكات أمس 4 بـset_flock_dead (موجبة: زيارة وصفّ يحملهما القديم، والملء يعيد علامتها)، وغاز اليوم
 * 2 + 1 بـadd_flock_gas (مجموع في flock_day_gas)، و10 كغم «علف الورقة» أُرسلت اليوم، فالتراجع يكمل؛ وبين التراجع والإعادة جولة قبل يومين بنافق 3 بجسم 0035
 * (بلا علامة) وغاز اليوم 5 بـset_flock_gas بنسخته؛ وبعد الإعادة الملء يعلّم اليومين، فالجولة بالقيمة نفسها saved وبغيرها dead_recorded، والإضافة تكمل غاز
 * اليوم إلى 6 بالنسخة 4، والملخّص بغاز اليوم وعلفه، والثابت صفر. وضابطا الإعادة (controls): الهجرة بلا ملء الزيارات تُفشل الحالة بالثابت
 * dead_entry_visits (والأيّام بلا علامة)، وبلا اشتقاق الأيّام بالثابت dead_entered_derived.
 */
const ROUND_VISITS_BACKFILL = 'update public.flock_visits x set dead_entry = true where x.voided_at is null and x.dead + x.culled > 0 and not x.dead_entry;\n';
const ROUND_DAYS_BACKFILL = 'update public.flock_daily x set dead_entered = exists (select 1 from public.flock_visits v\n'
  + '    where v.org_id = x.org_id and v.flock_id = x.flock_id and v.on_date = x.on_date and v.voided_at is null and v.dead_entry)\n'
  + 'where x.dead_entered is distinct from exists (select 1 from public.flock_visits v\n'
  + '    where v.org_id = x.org_id and v.flock_id = x.flock_id and v.on_date = x.on_date and v.voided_at is null and v.dead_entry);\n';

const roundFullReady = async (db) => {
  await sheetReady(db);
  await db.asUser(U.manager, async (q) => {
    const flock = await value(q, SEED_FLOCK);
    const feed = await value(q, "select id from public.items where name = 'علف الورقة'");
    await q('select public.set_flock_dead($1, public.app_today() - 1, 4, $2, false)', [flock, H36(10)]);
    await q('select public.add_flock_gas($1, public.app_today(), 2, $2, false)', [flock, H36(11)]);
    await q('select public.add_flock_gas($1, public.app_today(), 1, $2, false)', [flock, H36(12)]);
    await q('select public.send_flock_feed($1, $2, $3, $4, $5, 10, public.app_today())', [H36(13), H36(14), H36(15), flock, feed]);
  }, { commit: true });
};

const roundOn0035 = async (db) => {
  await db.asUser(U.manager, async (q) => {
    const flock = await value(q, SEED_FLOCK);
    await q('select public.save_flock_day($1, public.app_today() - 2, 3, null, null, null, null, null, null, null, null, null, null, $2, false)', [flock, H36(16)]);
    await q('select public.set_flock_gas($1, public.app_today(), 5, 2, $2, false)', [flock, H36(17)]);
  }, { commit: true });
};

const roundRedone = async (db) => {
  const problems = [];
  try {
    const got = await db.asUser(U.manager, async (q) => {
      const flock = await value(q, SEED_FLOCK);
      const flags = (await q('select on_date - public.app_today() as d, dead, dead_entered from public.flock_daily where flock_id = $1 order by on_date', [flock])).rows;
      const same = await value(q, "select public.set_flock_dead($1, public.app_today() - 2, 3, $2, false) ->> 'status'", [flock, H36(18)]);
      const other = await value(q, "select public.set_flock_dead($1, public.app_today() - 1, 9, $2, false) ->> 'status'", [flock, H36(19)]);
      const gas = await value(q, "select public.add_flock_gas($1, public.app_today(), 1, $2, false) -> 'gas'", [flock, H36(20)]);
      const summary = await value(q, "select public.flock_detail($1) -> 'flock'", [flock]);
      return { flags, same, other, gas: [gas?.cylinders, gas?.version], summary: [summary.gas_today, summary.gas_today_version, summary.feed_today_kg, summary.last_feed_item_id !== null] };
    }, { commit: true });
    const want = { flags: [{ d: -2, dead: 3, dead_entered: true }, { d: -1, dead: 4, dead_entered: true }], same: 'saved', other: 'dead_recorded', gas: [6, 4], summary: [6, 4, '10.000', true] };
    if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`الجولة بعد الإعادة: ${JSON.stringify(got)}`);
  } catch (error) {
    problems.push(`الهلاكات والغاز بعد الإعادة رُفضا: ${error.message}`);
  }
  const bad = await db.asService(async (q) => (await q('select check_name, violations::text as v from public.verify_round_once()')).rows
    .filter((r) => r.v !== '0').map((r) => `${r.check_name} = ${r.v}`));
  if (bad.length) problems.push(`الثوابت بعد الجولة: ${bad.join('، ')}`);
  return problems;
};

export const ROLLBACK_EXTRAS = {
  36: {
    seed: roundFullReady,
    afterRollback: roundOn0035,
    afterRedo: roundRedone,
    controls: [
      {
        name: 'بلا ملء الزيارات',
        expect: 'dead_entry_visits',
        mutate: (sql) => sql.split(ROUND_VISITS_BACKFILL).join(''),
      },
      {
        name: 'بلا اشتقاق الأيّام',
        expect: 'dead_entered_derived',
        mutate: (sql) => sql.split(ROUND_DAYS_BACKFILL).join(''),
      },
    ],
  },
  35: {
    seed: sheetFullReady,
    afterRollback: sheetOn0034,
    afterRedo: sheetRedone,
  },
  33: {
    seed: salesFullReady,
    afterRollback: salesOn0032,
    afterRedo: salesRedone,
  },
  32: {
    seed: visitsReady,
    afterRollback: visitsOn0031,
    afterRedo: visitsRedone,
  },
  31: {
    seed: birds28Ready,
    afterRedo: hallsHistoryRedone,
  },
  29: {
    seed: birds28Ready,
    afterRollback: birds28On0027,
    afterRedo: birds28Redone,
  },
  25: {
    seed: mill25Ready,
    afterRollback: mill25On0024,
    afterRedo: mill25Redone,
    controls: [
      {
        name: 'بلا تسمية «رصيد العلف» في الهجرة',
        expect: 'اسم مخزن العلف بعد الإعادة',
        mutate: (sql) => sql.replace(FEED_RENAME, '\n'),
      },
    ],
  },
  20: {
    seed: storeOpsReady,
    afterRollback: storeOpsOn0019,
    afterRedo: storeOpsRedone,
  },
  19: {
    seed: flockReady,
    afterRedo: flockIssueRedone,
  },
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
