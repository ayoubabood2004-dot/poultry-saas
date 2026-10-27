// بذرة مشغّل التراجع (الخطّة WP0 ٣): بيانات حقيقية من الدوالّ الحقيقية بدور authenticated، مو إدخال مباشر، حتى ملف
// التراجع ينفحص على قاعدة بيها بيانات مثل الإنتاج. كل حزمة تزيد كياناتها هنا (مخازن، جهات، مستندات) بنفس الطريقة.
// WP2 (0005): المدير يضيف تصنيفاً ومادّة برموز ووحدة من كيس، وحقلاً بمخزنه، ويحدّد يوم تشغيل؛ والأمين بنطاق وحدة (صفّ وحدة،
// فالتراجع يكمل). والطريق الثاني (BLOCKING): الأمين بنطاق مخزن، فالتراجع لازم يرفض بصوت وما يغيّر شي.

const U = {
  owner: '60000000-0000-4000-8000-000000000001',
  manager: '60000000-0000-4000-8000-000000000002',
  storekeeper: '60000000-0000-4000-8000-000000000003',
};
const PHONE = { owner: '9647708000001', manager: '9647708000002', storekeeper: '9647708000003' };

const value = async (q, sql, params) => Object.values((await q(sql, params)).rows[0] ?? {})[0];

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
  if (await value(db.admin, "select count(*)::int from pg_class where relname = 'items' and relnamespace = 'public'::regnamespace")) {
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

/**
 * الطريق الثاني لملف تراجع (الخطّة WP2): بذور يلزم التراجع يرفضها بصوت برمزها، والكتالوج والبيانات تبقى كما هي. بالرقم،
 * وكل رقم قائمة حالات. 0005: نطاق بموقع وحده ونطاق بمخزن وحده، كل وحدة بحالتها، حتى شرط الرفض (site_id أو warehouse_id)
 * ينفحص فرعاً فرعاً: mutate يشيل فرع الحالة من الشرط، والمشغّل يثبت إن التراجع يكمل بلاه (الحالة تحتاج فرعها).
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
};
