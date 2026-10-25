// صورة الكتالوج اللي تصنعه الهجرات: الجداول (ومالكها وRLS وFORCE) وأعمدتها (وصلاحيات العمود) وقيودها وفهارسها
// وسياساتها ومشغّلاتها (وتفعيلها)، والدوالّ بنصّها ومعاملاتها وافتراضاتها ونتيجتها وSTRICT وPARALLEL وLEAKPROOF ولغتها
// ومالكها وإعداداتها، والصلاحيات (الجداول والدوالّ والمخطّطات والافتراضية لمخطّطاتنا). بالأسماء والتعريفات، بلا oid.
// نفس الاستعلام بالحزمة وبالإنتاج: الحزمة تقارن مرّتي الهجرة بيه، والإنتاج ينقارن بالحزمة بعد كل هجرة (FOUNDATION
// ٨٧٠) بالملخّص (md5 لكل قسم)، فما ينقل الكتالوج كلّه: node supabase/tests/run.mjs --digest ← نفس جدول DIGEST_SQL بالإنتاج.
// ACL مرتّبة (collate "C")، لأن ترتيب عناصرها يتبع ترتيب المنح مو معناه. NULL (الافتراضي: المالك وPUBLIC) غير '{}'
// (ولا أحد)، فيبقون مختلفين.
const acl = (column) =>
  `case when ${column} is null then null else coalesce((select array_agg(item::text order by item::text collate "C") from unnest(${column}) as item), '{}'::text[])::text end`;

export const SNAPSHOT_SQL = `
with ns as (select oid, nspname from pg_namespace where nspname in ('public', 'private'))
select jsonb_build_object(
  'relations', (select jsonb_agg(jsonb_build_array(ns.nspname, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner), ${acl('c.relacl')}, c.reloptions::text))
    from pg_class c join ns on ns.oid = c.relnamespace),
  'columns', (select jsonb_agg(jsonb_build_array(c.relname, a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid), a.attgenerated::text, ${acl('a.attacl')}))
    from pg_attribute a join pg_class c on c.oid = a.attrelid join ns on ns.oid = c.relnamespace
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attnum > 0 and not a.attisdropped),
  'constraints', (select jsonb_agg(jsonb_build_array(c.conrelid::regclass::text, c.conname, pg_get_constraintdef(c.oid)))
    from pg_constraint c join ns on ns.oid = c.connamespace),
  'indexes', (select jsonb_agg(pg_get_indexdef(i.indexrelid))
    from pg_index i join pg_class c on c.oid = i.indrelid join ns on ns.oid = c.relnamespace),
  'policies', (select jsonb_agg(jsonb_build_array(tablename, policyname, permissive, roles::text, cmd, qual, with_check))
    from pg_policies where schemaname in ('public', 'private')),
  'triggers', (select jsonb_agg(jsonb_build_array(pg_get_triggerdef(g.oid), g.tgenabled::text))
    from pg_trigger g join pg_class c on c.oid = g.tgrelid join ns on ns.oid = c.relnamespace where not g.tgisinternal),
  'functions', (select jsonb_agg(jsonb_build_array(ns.nspname, p.proname, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid), md5(p.prosrc), p.prosecdef, p.provolatile, p.proisstrict, p.proparallel, p.proleakproof, l.lanname, pg_get_userbyid(p.proowner), p.proconfig::text, ${acl('p.proacl')}))
    from pg_proc p join ns on ns.oid = p.pronamespace join pg_language l on l.oid = p.prolang),
  'schemas', (select jsonb_agg(jsonb_build_array(nspname, pg_get_userbyid(nspowner), ${acl('nspacl')})) from pg_namespace where nspname in ('public', 'private')),
  'default_acl', (select jsonb_agg(jsonb_build_array(pg_get_userbyid(defaclrole), coalesce(n.nspname, ''), defaclobjtype::text, ${acl('defaclacl')}))
    from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
    where n.nspname is null or n.nspname in ('public', 'private'))
) as snapshot`;

/** ملخّص كل قسم: عدد عناصره وmd5 لـmd5 عناصره مرتّبة (ترتيب الكتالوج ما يأثّر). */
export const DIGEST_SQL = `
with snap as (${SNAPSHOT_SQL})
select s.section, count(x.h)::int as items, md5(coalesce(string_agg(x.h, ',' order by x.h collate "C"), '')) as digest
from snap cross join jsonb_each(snap.snapshot) as s(section, arr)
left join lateral (select md5(e::text) as h from jsonb_array_elements(coalesce(s.arr, '[]'::jsonb)) as e) as x on true
group by s.section order by s.section`;

/** عناصر قسم واحد ويّا md5 كل واحد: لما ملخّص قسم يختلف، نفس الاستعلام بالطرفين يبيّن العنصر. */
export const elementsSql = (section) => `
with snap as (${SNAPSHOT_SQL})
select md5(e::text) as h, e::text as element
from snap cross join jsonb_array_elements(coalesce(snap.snapshot -> '${section.replace(/[^a-z_]/g, '')}', '[]'::jsonb)) as e
order by 1`;

export async function snapshot(client) {
  return (await client.query(SNAPSHOT_SQL)).rows[0].snapshot;
}

/** الفروق بين صورتين، قسماً قسماً: كل عنصر بوحدة وما بالثانية. */
export function snapshotDiff(before, after) {
  const out = [];
  for (const section of Object.keys({ ...before, ...after })) {
    const a = new Set((before[section] ?? []).map((x) => JSON.stringify(x)));
    const b = new Set((after[section] ?? []).map((x) => JSON.stringify(x)));
    for (const x of a) if (!b.has(x)) out.push(`${section} −${x}`);
    for (const x of b) if (!a.has(x)) out.push(`${section} +${x}`);
  }
  return out;
}
