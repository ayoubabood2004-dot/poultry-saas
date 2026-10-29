// مسوّدات الجهاز (الخطّة WP4، GT-29، FOUNDATION ١٤٢): المسوّدة مختومة بـ(المستخدم، المنشأة المؤكَّدة)، وتنعرض لكاتبها بمنشأته بس:
// مسوّدة منشأة أ ما تبين والمنشأة المؤكَّدة ب، ولا لمستخدم ثاني بنفس الجهاز؛ والرفع يرمي إذا الخادم أكّد منشأة ثانية؛ والحفظ
// والقراءة والحذف بـIndexedDB الحقيقي (fake-indexeddb).
import 'fake-indexeddb/auto';
import { loadSrc } from './load-src.mjs';

export default async function (t) {
  const d = await loadSrc('src/lib/drafts/index.ts');
  const ali = { userId: 'u-ali', orgId: 'org-a' };
  const aliInB = { userId: 'u-ali', orgId: 'org-b' };
  const omar = { userId: 'u-omar', orgId: 'org-a' };
  const draft = (stamp, id, savedAt) => ({ ...stamp, id, kind: 'transfer', title: id, savedAt, payload: {} });
  const all = [draft(ali, 'a1', 1), draft(ali, 'a2', 3), draft(aliInB, 'b1', 2), draft(omar, 'o1', 4)];
  t.same(d.visibleDrafts(all, ali).map((x) => x.id), ['a2', 'a1'], 'مسوّدات علي بمنشأة أ، الأحدث أوّلاً');
  t.same(d.visibleDrafts(all, aliInB).map((x) => x.id), ['b1'], 'المنشأة المؤكَّدة ب: مسوّدات أ مخفية (GT-29)');
  t.same(d.visibleDrafts(all, omar).map((x) => x.id), ['o1'], 'مستخدم ثاني بنفس الجهاز ما يشوف مسوّدات علي');
  t.throws(() => d.assertSameStamp(ali, aliInB), 'الرفع بعد تأكيد منشأة ثانية يرمي', /draft_org_mismatch/);
  t.throws(() => d.assertSameStamp(ali, null), 'الرفع بلا تأكيد من الخادم يرمي', /draft_org_mismatch/);
  t.throws(() => d.assertSameStamp(ali, omar), 'مستخدم ثاني بنفس المنشأة ما يرفع مسوّدة علي', /draft_org_mismatch/);
  d.assertSameStamp(ali, { ...ali });
  t.ok(true, 'الرفع بنفس المستخدم والمنشأة يمرّ');

  const saved = await d.saveDeviceDraft(ali, { kind: 'transfer', title: 'تحويل', payload: { from: 'w1' } });
  await d.saveDeviceDraft(aliInB, { kind: 'transfer', title: 'تحويل ب', payload: { from: 'w2' } });
  await d.saveDeviceDraft(ali, { kind: 'opening', title: 'افتتاح', payload: {} });
  t.same((await d.listDeviceDrafts(ali, 'transfer')).map((x) => x.payload.from), ['w1'], 'IndexedDB: مسوّدة تحويل علي بمنشأة أ بس');
  t.same((await d.listDeviceDrafts(aliInB, 'transfer')).map((x) => x.title), ['تحويل ب'], 'IndexedDB: بالمنشأة ب مسوّدتها هي بس');
  await d.removeDeviceDraft(saved.id);
  t.same(await d.listDeviceDrafts(ali, 'transfer'), [], 'بعد الرفع تنشال من الجهاز');
}
