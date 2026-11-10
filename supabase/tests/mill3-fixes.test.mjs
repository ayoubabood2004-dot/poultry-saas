// إصلاحات مراجعة 0023 العدائية (2026-11-10؛ DECISIONS «ترتيب معمل العلف»): كلّ فحص هنا فشل على الالتزام قبل إصلاحه (c48df3d)، وأصله
// إثبات المراجِع نفسه: F1 الإعادة بعد منتصف الليل بالقيم نفسها ترجّع النتيجة نفسها (المرجع باليوم المرسَل لا المحلول)؛ F2 مدير بنطاق موقع
// المعمل وكلف تحتاج ختماً: مسوّدة تنتظر الختم لا رفض بلا دفعة؛ F3 التقرير بنطاق مخزن الموادّ (عامل القاعة لا يصله مال دفعة ناتجها في حقله)؛
// F4 إنتاجان في اللحظة نفسها يمرّان والرصيد يكفي (لا stale_preview بلا معاينة يراها)؛ F5 in_basis لكلّ مادّة في التقرير؛ F6 ترتيب سطور
// المسوّدة مع تفعيلها بلا تقافل (الخلطة ثمّ النسخة)؛ F7 ترتيب مسوّدة فيها مادّة أُرشفت بعد إدراجها؛ F8 ضغطتان بمرجعين على المعرّف نفسه
// = id_conflict؛ F9 الكمية الكبيرة qty_too_large بتلميح بلا «#»؛ L2 التلميحات تدلّ على «احفظ مسوّدة» لا على صفحة دفعة لم تُحفظ؛ L3 الهدر
// بأرقام غربية في التلميح.
import { call, makeOrg, uid } from './ledger-kit.mjs';

const TODAY = '2026-11-10';
const id = (n) => `d2339000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477099980${String(n).padStart(2, '0')}`;
const day = (offset) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
const RP = 'select public.record_production($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13) as v';
const LINES = 'select public.set_recipe_line_order($1, $2::uuid[], $3::uuid[]) as v';
const REPORT = 'select public.mill_report($1, $2, $3) as v';
const EASTERN = /[٠-٩۰-۹]/u;

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const G = await makeOrg(db, {
    name: 'إصلاحات الترتيب',
    id,
    phone,
    roles: [
      ['owner', 'owner'],
      ['manager', 'manager'],
      ['millOperator', 'mill_operator', ['feed_mill']],
      ['hall', 'hall_worker', ['broiler']],
      ['siteManager', 'manager'],
    ],
  });
  const { users: U, org, members: M, divisions: D } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const W = Object.fromEntries((await db.admin('select kind, id from public.warehouses where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  const millSite = (await db.admin("select id from public.sites where org_id = $1 and kind = 'mill'", [org])).rows[0].id;
  const item = (name, kind, unit, density = null) =>
    one(U.owner, 'insert into public.items (name, kind, base_unit, density_kg_per_l) values ($1, $2, $3, $4) returning id', [name, kind, unit, density]);
  const I = {
    corn: await item('ذرة', 'raw', 'kg'),
    soy: await item('صويا', 'raw', 'kg'),
    maize: await item('ذرة صفراء', 'raw', 'kg'),
    ghost: await item('مادّة بلا رصيد', 'raw', 'kg'),
    diesel: await item('ديزل', 'fuel', 'L', '0.85'),
    starter: await item('علف بادئ', 'feed', 'kg'),
    grower: await item('علف نامٍ', 'feed', 'kg'),
    conc: await item('علف التزامن', 'feed', 'kg'),
    costed: await item('علف مكلف', 'feed', 'kg'),
  };
  const supplier = await one(U.owner, "insert into public.parties (name, is_supplier) values ('مورّد', true) returning id");
  const buy = (itemId, qty, price) =>
    one(U.owner, "select public.record_purchase($1, $2, $3, $4, $5, $6, $7, $8, null, 'credit', null, null) as v", [uid(), uid(), uid(), itemId, supplier, day(-2), qty, price]);
  await buy(I.corn, 9000, 450);
  await buy(I.soy, 9000, 900);
  await buy(I.maize, 1000, 450);
  await buy(I.maize, 1000, 460);
  await buy(I.diesel, 100, 1000);
  await one(U.owner, 'select public.record_transfer($1, $2, $3, $4, 50, $5, $6, $7) as v', [uid(), uid(), uid(), I.diesel, W.general, W.raw, day(-2)]);
  const labor = await one(U.owner, "insert into public.expense_categories (name) values ('أيدي عاملة') returning id");
  const CR = 'select public.create_recipe($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, true) as v';
  const recipe = async (name, output, basis, lines, rates = []) => {
    const ids = { id: uid(), version: uid() };
    await one(U.owner, CR, [ids.id, ids.version, name, output, basis, JSON.stringify(lines), JSON.stringify(rates)]);
    return ids;
  };
  const R = {
    starter: await recipe('علف بادئ', I.starter, '1000.000', [{ item_id: I.corn, qty: '600.000', unit: 'kg' }, { item_id: I.soy, qty: '400.000', unit: 'kg' }]),
    grower: await recipe('علف نامٍ', I.grower, '1000.000', [
      { item_id: I.corn, qty: '500.000', unit: 'kg' },
      { item_id: I.soy, qty: '500.000', unit: 'kg' },
      { item_id: I.diesel, qty: '5.000', unit: 'L' },
    ]),
    conc: await recipe('علف التزامن', I.conc, '1000.000', [{ item_id: I.maize, qty: '1000.000', unit: 'kg' }]),
    costed: await recipe('علف مكلف', I.costed, '1000.000', [{ item_id: I.corn, qty: '500.000', unit: 'kg' }, { item_id: I.soy, qty: '500.000', unit: 'kg' }],
      [{ category_id: labor, amount_per_ton: 5000 }]),
  };
  const rpArgs = (a) => [a.id ?? uid(), a.version, a.kg, a.in ?? W.raw, a.out ?? W.feed, a.on === undefined ? TODAY : a.on,
    JSON.stringify(a.actuals ?? []), JSON.stringify(a.extra ?? []), a.output ?? null, a.expiry ?? null, a.reason ?? null, a.note ?? null, a.ref ?? uid()];
  const rp = (user, a) => call(db, user, RP, rpArgs(a));
  const batches = async (batchId) => (await db.admin('select count(*)::int as n from public.production_batches where id = $1', [batchId])).rows[0].n;

  // F1: «اليوم» فارغ، والجواب ضاع، والإعادة بالقيم نفسها بعد منتصف الليل.
  const f1 = { id: uid(), version: R.starter.version, kg: '1000.000', on: null, ref: uid() };
  const first = await rp(U.owner, f1);
  const nextDay = await db.setToday(day(1), () => rp(U.owner, f1));
  t.same([first.ok && first.value.doc_no, nextDay.ok ? [nextDay.value.doc_no, nextDay.value.produced_on] : nextDay.code], ['PD-2026-0001', ['PD-2026-0001', TODAY]],
    'F1: الإعادة بالمرجع والقيم نفسها (يوم الإنتاج فارغ) بعد منتصف الليل ترجّع النتيجة نفسها بيومها، لا ref_reused');

  // F2: مدير بنطاق موقع المعمل (لا الوحدة) وخلطة بتكاليف لكلّ طنّ: مسوّدة تنتظر الختم كمشغّل المعمل.
  await one(U.owner, "select public.set_member_scopes_v2($1, '{}', array[$2]::uuid[], '{}') as v", [M.siteManager, millSite]);
  const smId = uid();
  const sm = await rp(U.siteManager, { id: smId, version: R.costed.version, kg: '1000.000' });
  const opId = uid();
  const op = await rp(U.millOperator, { id: opId, version: R.costed.version, kg: '1000.000' });
  t.same([sm.ok ? [sm.value.status, sm.value.awaiting] : [sm.code, sm.hint], await batches(smId), op.ok && op.value.status, await batches(opId)],
    [['draft', 'costs'], 1, 'draft', 1], 'F2: مدير لا يرى مصاريف وحدة المعمل: الدفعة تُحفظ مسوّدة تنتظر الختم (كمشغّل المعمل)، لا رفض بلا دفعة يختمها أحد');
  const blockedMix = await rp(U.siteManager, { version: R.costed.version, kg: '100000.000' });
  t.same([blockedMix.code, blockedMix.hint?.includes('لا يكفي رصيد')], ['production_blocked', true],
    'F2: ومعها مشكلة تمنع (نقص): تُرفض بتلميح المشكلة المانعة لا بانتظار الختم');

  // F3: ناتج إلى مخزن حقل (create_production يقبله): التقرير بنطاق مخزن الموادّ، فعامل القاعة لا يصله شيء.
  const farmSite = await one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل اللحم', 'farm') returning id", [D.broiler]);
  const farmWh = await one(U.owner, "insert into public.warehouses (division_id, site_id, name, kind) values ($1, $2, 'مخزن الحقل', 'farm') returning id", [D.broiler, farmSite]);
  const fp = await rp(U.owner, { version: R.starter.version, kg: '1000.000', out: farmWh });
  const hallRep = await call(db, U.hall, REPORT, [null, TODAY, TODAY]);
  const ownerRep = await one(U.owner, REPORT, [null, TODAY, TODAY]);
  t.same([fp.ok && fp.value.status, hallRep.ok ? [hallRep.value.batches.length, hallRep.value.materials.length] : hallRep.code,
    ownerRep.batches.some((b) => b.output_warehouse_name === 'مخزن الحقل')], ['posted', [0, 0], true],
  'F3: دفعة ناتجها في مخزن حقل: عامل القاعة (بنطاقه الحقل لا مخزن الموادّ) لا تصله دفعاتها ولا مالها، والمالك يراها');

  // F4: إنتاجان بنداء واحد في اللحظة نفسها على المادّة نفسها (دفعتان بسعرين): الثاني ينتظر ثمّ يُنتج.
  const A = await db.session(U.owner);
  const B = await db.session(U.manager);
  let f4;
  try {
    const a = await A.run(RP, rpArgs({ version: R.conc.version, kg: '600.000' }));
    const pending = B.run(RP, rpArgs({ version: R.conc.version, kg: '600.000' }));
    const state = await db.settle(pending, B.pid);
    await A.commit();
    const b = await pending;
    await B.commit();
    f4 = { a: a.ok ? a.rows[0].v.status : a.error, waited: state, b: b.ok ? b.rows[0].v.status : b.error };
  } finally {
    await A.rollback();
    await B.rollback();
  }
  const maizeLeft = (await db.admin('select coalesce(sum(qty), 0)::text as q from public.stock_balances where item_id = $1 and warehouse_id = $2', [I.maize, W.raw])).rows[0].q;
  t.same([f4.a, f4.b, Number(maizeLeft)], ['posted', 'posted', 800], `F4: الثاني ينتظر أقفال الأوّل ثمّ يُنتج بمعاينة جديدة (${JSON.stringify(f4)})، والباقي 800`);

  // F5: الوقود خارج الكتلة: in_basis لكلّ مادّة، ومجموع الداخل = كتلة الدفعات.
  const g = await rp(U.owner, { version: R.grower.version, kg: '1000.000' });
  const rep = await one(U.owner, REPORT, [R.grower.id, TODAY, TODAY]);
  const inBasis = rep.materials.filter((m) => m.in_basis === true);
  t.same([g.ok && g.value.status, rep.materials.map((m) => [m.name, m.in_basis]), inBasis.reduce((s, m) => s + Number(m.mass_kg), 0), Number(rep.totals.mass_kg)],
    ['posted', [['ذرة', true], ['صويا', true], ['ديزل', false]], 1000, 1000],
    'F5: موادّ التقرير بـin_basis (الديزل خارج الكتلة وبعد الداخل)، ومجموع كتل الداخل = كتلة الدفعات');

  // F6: ترتيب سطور المسوّدة والتفعيل في اللحظة نفسها: بلا تقافل، والترتيب يرى التفعيل فيُرفض not_draft.
  const draft = await one(U.owner, 'select public.new_recipe_version($1, $2) as v', [R.grower.id, uid()]);
  const shown = (await db.admin('select id from public.recipe_lines where version_id = $1 order by line_no', [draft.version_id])).rows.map((r) => r.id);
  const draftVersion = (await db.admin('select version from public.recipe_versions where id = $1', [draft.version_id])).rows[0].version;
  const S1 = await db.session(U.owner);
  const S2 = await db.session(U.manager);
  let f6;
  try {
    // S2 كما يبدأ activate_recipe_version: صفّ الخلطة أوّلاً.
    await S2.run('select id from public.recipes where id = $1 for update', [R.grower.id]);
    const ordering = S1.run(LINES, [draft.version_id, [...shown].reverse(), shown]);
    const waited = await db.settle(ordering, S1.pid);
    const act = await S2.run('select public.activate_recipe_version($1, $2) as v', [draft.version_id, draftVersion]);
    await S2.commit();
    const o = await ordering;
    f6 = { waited, activating: act.ok ? 'ok' : act.error, ordering: o.ok ? 'ok' : o.error };
  } finally {
    await S1.rollback();
    await S2.rollback();
  }
  t.same([f6.activating, f6.ordering], ['ok', 'not_draft'], `F6: التفعيل يمرّ والترتيب ينتظره ثمّ يُرفض not_draft، بلا تقافل (${JSON.stringify(f6)})`);

  // F7: مادّة بلا رصيد أُدرجت في مسوّدة ثمّ أُرشفت: ترتيب السطور يمرّ.
  const draft7 = await one(U.owner, 'select public.new_recipe_version($1, $2) as v', [R.grower.id, uid()]);
  await one(U.owner, 'insert into public.recipe_lines (version_id, item_id, qty, unit) values ($1, $2, 1, $3) returning id', [draft7.version_id, I.ghost, 'kg']);
  await one(U.owner, 'update public.items set archived_at = now() where id = $1 returning id', [I.ghost]);
  const lines7 = (await db.admin('select id from public.recipe_lines where version_id = $1 order by line_no', [draft7.version_id])).rows.map((r) => r.id);
  const before7 = (await db.admin('select version from public.recipe_versions where id = $1', [draft7.version_id])).rows[0].version;
  const f7 = await call(db, U.owner, LINES, [draft7.version_id, [...lines7].reverse(), lines7]);
  const after7 = (await db.admin('select array_agg(id order by line_no) as ids, (select version from public.recipe_versions where id = $1) as v from public.recipe_lines where version_id = $1', [draft7.version_id])).rows[0];
  t.same([f7.ok ? f7.value.count : [f7.code, f7.hint], after7.ids, after7.v > before7], [4, [...lines7].reverse(), true],
    'F7: ترتيب مسوّدة فيها مادّة أُرشفت بعد إدراجها يمرّ، ورقم النسخة يزيد');

  // F8: ضغطتان بمرجعين على معرّف الدفعة نفسه في اللحظة نفسها.
  const sameId = uid();
  const C1 = await db.session(U.owner);
  const C2 = await db.session(U.owner);
  let f8;
  try {
    const c1 = await C1.run(RP, rpArgs({ id: sameId, version: R.starter.version, kg: '100.000' }));
    const pending = C2.run(RP, rpArgs({ id: sameId, version: R.starter.version, kg: '100.000' }));
    const waited = await db.settle(pending, C2.pid);
    await C1.commit();
    const c2 = await pending;
    f8 = { c1: c1.ok ? c1.rows[0].v.status : c1.error, waited, c2: c2.ok ? c2.rows[0].v.status : c2.error };
  } finally {
    await C1.rollback();
    await C2.rollback();
  }
  t.same([f8.c1, f8.c2], ['posted', 'id_conflict'], `F8: الضغطة الثانية بمرجع آخر على المعرّف نفسه: id_conflict المسمّى (${JSON.stringify(f8)})`);

  // F9: كمية أكبر من المعقول: رفض مسمّى بتلميح بلا «#»، في الكمية والكمية الفعلية والإضافية والناتج.
  const huge = '100000000000000000.000';
  const big = [
    await rp(U.owner, { version: R.starter.version, kg: huge }),
    await rp(U.owner, { version: R.starter.version, kg: '1000.000', actuals: [{ line_no: 1, qty: '999999999999999' }] }),
    await rp(U.owner, { version: R.starter.version, kg: '1000.000', extra: [{ id: uid(), item_id: I.maize, qty: '999999999999999' }] }),
    await rp(U.owner, { version: R.starter.version, kg: '1000.000', output: huge }),
  ];
  t.same(big.map((r) => [r.code, /#/u.test(r.hint ?? '')]), [['qty_too_large', false], ['qty_too_large', false], ['qty_too_large', false], ['qty_too_large', false]],
    'F9: الكمية الكبيرة qty_too_large بتلميحها (الكمية والفعلية والإضافية ووزن الناتج)');

  // L2 وL3: تلميحات الرفض تدلّ على «احفظ مسوّدة» (لا دفعة محفوظة بعد الرفض)، والهدر بأرقام غربية.
  const zero = await rp(U.owner, { version: R.starter.version, kg: '1000.000', actuals: [{ line_no: 1, qty: '0' }] });
  const waste = await rp(U.owner, { version: R.starter.version, kg: '1000.000', output: '900.000' });
  t.same([zero.code, zero.hint.includes('«احفظ مسوّدة»'), waste.code, EASTERN.test(waste.hint), waste.hint.includes('من 0 إلى 3٪')],
    ['qty_not_positive', true, 'production_blocked', false, true], `L2/L3: التلميحات (${zero.hint} | ${waste.hint})`);
  const hint = await db.admin("select private.production_problem_hint($1::jsonb, 'مخزن') as h", [JSON.stringify({ code: 'item_archived', item_name: 'برمكس' })]);
  t.same(hint.rows[0].h.includes('«احفظ مسوّدة»'), true, 'L2: تلميح المادّة المحذوفة يدلّ على «احفظ مسوّدة»');

  for (const fn of ['verify_mill', 'verify_stock', 'verify_ledger']) {
    const rows = (await db.admin(`select check_name, violations from public.${fn}()`)).rows.filter((r) => Number(r.violations) > 0);
    t.same(rows, [], `${fn}: صفر`);
  }
}
