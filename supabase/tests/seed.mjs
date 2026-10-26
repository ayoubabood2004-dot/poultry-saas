// بذرة مشغّل التراجع (الخطّة WP0 ٣): بيانات حقيقية من الدوالّ الحقيقية بدور authenticated، مو إدخال مباشر، حتى ملف
// التراجع ينفحص على قاعدة بيها بيانات مثل الإنتاج. كل حزمة تزيد كياناتها هنا (مخازن، جهات، مستندات) بنفس الطريقة.

const U = {
  owner: '60000000-0000-4000-8000-000000000001',
  manager: '60000000-0000-4000-8000-000000000002',
  storekeeper: '60000000-0000-4000-8000-000000000003',
};
const PHONE = { owner: '9647708000001', manager: '9647708000002', storekeeper: '9647708000003' };

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
  await db.asUser(U.manager, (q) => q('select public.set_period_lock(public.app_today() - 30)'), { commit: true });
  return U;
}
