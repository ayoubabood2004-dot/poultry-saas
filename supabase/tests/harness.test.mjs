// أدوات الحزمة نفسها تثبت إنها تقدر تفشل (FOUNDATION ٨٣٣: «الحارس يفحص نفسه على مدخلات مصنوعة»؛ الخطّة WP0):
// - setToday: اليوم الثابت يبين لكل جلسة، ويرجع app_today() لتعريف الهجرة بالضبط حتى لو fn رمت.
// - سجلّ التغطية: النداء بدور authenticated ينسجّل باسم الدالّة ودور العضو، والفجوات تنعدّ.
// - sameRefRace وdraftWriteLock على نوع مستند ضابط بمخطّط probe (مو public ولا private، فصورة الكتالوج ما تتأثّر،
//   وينشال بالآخر): النوع السليم يعبر كل البراهين، والنوع المكسور (بلا بروتوكول المرجع، وبلا حرّاس المسوّدة) يفشلها.
//   والمراجعة العدائية: نوع مسجّل بأمر غلط (جدول أو عمود بالغلط، عمود NOT NULL ناقص، معرّف فارغ) كان يعبر «يرفض» بأي خطأ؛
//   هسه الرفض برمز المسوّدة بس، وكل أمر ويّاه ضابط بنفس شكله على المسوّدة.
// - verifyAll: violations = NULL، ودالّة verify_* بلا صفوف، ما يعبرون.
import { randomUUID } from 'node:crypto';
import { createHarness } from '../../scripts/tests/harness.mjs';
import { coverageGaps, makeDb } from './db.mjs';
import { blockingShortfall, declaredRollback, heavyChanges, rollbackDeclarationProblems, verifyAll, zeroRollbacksProblem } from './rollback.mjs';
import { BLOCKING_REQUIRED, BLOCKING_SEEDS } from './seed.mjs';
import { draftWriteLock, sameRefRace } from './shared.mjs';

const U = { owner: '70000000-0000-4000-8000-000000000001' };
const PHONE = { owner: '9647707000101' };

const PROBE_SCHEMA = `
create schema probe authorization postgres;
grant usage on schema probe to authenticated;

create table probe.docs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org(),
  status text not null default 'draft' check (status in ('draft', 'posted', 'void')),
  version int not null default 1,
  doc_no text,
  client_ref uuid
);
create table probe.lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org(),
  doc_id uuid not null references probe.docs (id),
  qty numeric not null
);
create table probe.amounts (
  line_id uuid primary key references probe.lines (id),
  org_id uuid not null default public.auth_org(),
  amount numeric not null
);
create table probe.counters (org_id uuid primary key, last_no int not null);
create table probe.postings (doc_id uuid not null, doc_no text not null);
alter table probe.docs enable row level security;
alter table probe.lines enable row level security;
alter table probe.amounts enable row level security;
alter table probe.counters enable row level security;
alter table probe.postings enable row level security;

create policy docs_read on probe.docs for select to authenticated using (org_id = (select public.auth_org()));
create policy docs_insert on probe.docs for insert to authenticated with check (org_id = (select public.auth_org()) and status = 'draft');
create policy docs_update on probe.docs for update to authenticated
  using (org_id = (select public.auth_org()) and status = 'draft') with check (org_id = (select public.auth_org()) and status = 'draft');
create policy lines_read on probe.lines for select to authenticated using (org_id = (select public.auth_org()));
create policy lines_insert on probe.lines for insert to authenticated with check (org_id = (select public.auth_org()));
create policy lines_update on probe.lines for update to authenticated using (org_id = (select public.auth_org())) with check (org_id = (select public.auth_org()));
create policy amounts_read on probe.amounts for select to authenticated using (org_id = (select public.auth_org()) and (select public.can_see_cost()));
create policy amounts_insert on probe.amounts for insert to authenticated with check (org_id = (select public.auth_org()) and (select public.can_see_cost()));
create policy amounts_update on probe.amounts for update to authenticated
  using (org_id = (select public.auth_org()) and (select public.can_see_cost())) with check (org_id = (select public.auth_org()));
grant select, insert, update on probe.docs, probe.lines, probe.amounts to authenticated;

-- حارس الرأس (invoker، بدور authenticated بس): الحالة والرقم والنسخة والمرجع ما تتغيّر مباشرةً، والنسخة تزيد وحدها.
create function probe.guard_header() returns trigger language plpgsql set search_path = public, pg_temp as $fn$
begin
  if current_user <> 'authenticated' then return new; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.version <> 1 or new.doc_no is not null then
      raise exception 'not_draft' using hint = 'المستند الجديد مسوّدة دائماً.';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status or new.doc_no is distinct from old.doc_no
     or new.version is distinct from old.version or new.client_ref is distinct from old.client_ref then
    raise exception 'frozen_column' using hint = 'هذه الأعمدة يكتبها الخادم فقط.';
  end if;
  new.version := old.version + 1;
  return new;
end
$fn$;
create trigger docs_guard before insert or update on probe.docs for each row execute function probe.guard_header();

-- حارس السطر (definer): يقفل الرأس، يرفض إذا مو مسوّدة، ويزيد نسخة الرأس.
create function probe.guard_line() returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_doc uuid;
  v_status text;
begin
  if tg_table_name = 'amounts' then
    select l.doc_id into v_doc from probe.lines l where l.id = new.line_id;
  else
    v_doc := new.doc_id;
  end if;
  select d.status into v_status from probe.docs d where d.id = v_doc for update;
  if v_status is distinct from 'draft' then
    raise exception 'not_draft' using hint = 'المستند مرحَّل؛ لا تُعدَّل سطوره.';
  end if;
  update probe.docs set version = version + 1 where id = v_doc;
  return new;
end
$fn$;
create trigger lines_guard before insert or update on probe.lines for each row execute function probe.guard_line();
create trigger amounts_guard before insert or update on probe.amounts for each row execute function probe.guard_line();

-- الترحيل بالعقد (§2.2): المرجع أوّلاً قبل أي قفل، ثم الرأس for update، ثم النسخة، ثم الرقم آخر شي.
create function probe.post_doc(p_id uuid, p_expected_version int, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_org uuid := public.auth_org();
  v_hash text := md5(jsonb_build_object('id', p_id, 'version', p_expected_version)::text);
  v_ref public.rpc_refs;
  v_doc probe.docs;
  v_no int;
  v_result jsonb;
begin
  set local lock_timeout = '5s';
  insert into public.rpc_refs (org_id, fn, client_ref, args_hash, created_by)
  values (v_org, 'probe.post_doc', p_client_ref, v_hash, auth.uid())
  on conflict (org_id, fn, client_ref) do nothing;
  if not found then
    select * into v_ref from public.rpc_refs where org_id = v_org and fn = 'probe.post_doc' and client_ref = p_client_ref;
    if v_ref.args_hash <> v_hash or v_ref.created_by is distinct from auth.uid() then
      raise exception 'ref_reused' using hint = 'هذا المرجع استُعمل لطلب آخر.';
    end if;
    return v_ref.result;
  end if;
  select * into v_doc from probe.docs where org_id = v_org and id = p_id for update;
  if v_doc.status is distinct from 'draft' then
    raise exception 'not_draft' using hint = 'المستند ليس مسوّدة.';
  end if;
  if v_doc.version <> p_expected_version then
    raise exception 'stale_draft' using hint = 'تغيّرت المسوّدة بعد المعاينة.';
  end if;
  insert into probe.counters as c (org_id, last_no) values (v_org, 1)
  on conflict (org_id) do update set last_no = c.last_no + 1 returning last_no into v_no;
  update probe.docs set status = 'posted', doc_no = 'PB-' || v_no, client_ref = p_client_ref where id = p_id;
  insert into probe.postings (doc_id, doc_no) values (p_id, 'PB-' || v_no);
  v_result := jsonb_build_object('id', p_id, 'doc_no', 'PB-' || v_no, 'money', jsonb_build_object('total', '10.00'));
  update public.rpc_refs set result = v_result where org_id = v_org and fn = 'probe.post_doc' and client_ref = p_client_ref;
  return v_result;
end
$fn$;

-- المكسور عمداً: بلا بروتوكول المرجع (الجلسة الثانية تنام على صفّ الرأس وتطلع not_draft، والمرجع ما ينفحص).
create function probe.post_doc_noref(p_id uuid, p_expected_version int, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_doc probe.docs;
begin
  set local lock_timeout = '5s';
  select * into v_doc from probe.docs where org_id = public.auth_org() and id = p_id for update;
  if v_doc.status is distinct from 'draft' then
    raise exception 'not_draft' using hint = 'المستند ليس مسوّدة.';
  end if;
  update probe.docs set status = 'posted', doc_no = 'PB-X', client_ref = p_client_ref where id = p_id;
  insert into probe.postings (doc_id, doc_no) values (p_id, 'PB-X');
  return jsonb_build_object('id', p_id, 'doc_no', 'PB-X');
end
$fn$;
-- المكسور عمداً للسباق كلّه: بلا مرجع ولا قفل ولا فحص حالة، كل نداء ترحيل جديد برقم جديد (الجلسة الثانية ما تنام).
create sequence probe.loose_no;
create function probe.post_doc_loose(p_id uuid, p_expected_version int, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_no text := 'PB-L' || nextval('probe.loose_no');
begin
  insert into probe.postings (doc_id, doc_no) values (p_id, v_no);
  return jsonb_build_object('id', p_id, 'doc_no', v_no);
end
$fn$;
grant execute on function probe.post_doc(uuid, int, uuid), probe.post_doc_noref(uuid, int, uuid), probe.post_doc_loose(uuid, int, uuid) to authenticated;

-- المكسور عمداً للمسوّدة: سياسات المنشأة بس، بلا حرّاس الرأس والسطر.
create table probe.loose_docs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org(),
  status text not null default 'draft',
  version int not null default 1
);
create table probe.loose_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org(),
  doc_id uuid not null references probe.loose_docs (id),
  qty numeric not null
);
alter table probe.loose_docs enable row level security;
alter table probe.loose_lines enable row level security;
create policy loose_docs_all on probe.loose_docs for all to authenticated using (org_id = (select public.auth_org())) with check (org_id = (select public.auth_org()));
create policy loose_lines_all on probe.loose_lines for all to authenticated using (org_id = (select public.auth_org())) with check (org_id = (select public.auth_org()));
grant select, insert, update on probe.loose_docs, probe.loose_lines to authenticated;

-- رأس بعمود NOT NULL بلا افتراض وسياسة إدخال بلا status = 'draft': إدخال posted ينسى العمود يطلع 23502 (مو رفض مسوّدة).
create table probe.strict_docs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org(),
  status text not null default 'draft',
  wh uuid not null
);
alter table probe.strict_docs enable row level security;
create policy strict_docs_all on probe.strict_docs for all to authenticated using (org_id = (select public.auth_org())) with check (org_id = (select public.auth_org()));
grant select, insert, update on probe.strict_docs to authenticated;
`;

const value = async (q, sql, params) => Object.values((await q(sql, params)).rows[0] ?? {})[0];

export default async function (t, db) {
  await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())', [U.owner, PHONE.owner]);
  await db.asUser(U.owner, (q) => q("select public.create_my_org('مزرعة أدوات الحزمة', 'المالك')"), { commit: true });

  // ── setToday ─────────────────────────────────────────────────────────────────────────────────────────
  const definition = async () => (await db.admin("select pg_get_functiondef('public.app_today()'::regprocedure) as def")).rows[0].def;
  const before = await definition();
  const inside = await db.setToday('2026-03-15', async () => {
    const asUser = await db.asUser(U.owner, (q) => value(q, 'select public.app_today()::text'));
    const session = await db.session(U.owner);
    try {
      const seen = await session.run('select public.app_today()::text as day');
      return [asUser, seen.rows?.[0]?.day];
    } finally {
      await session.rollback();
    }
  });
  t.same(inside, ['2026-03-15', '2026-03-15'], 'setToday: اليوم الثابت يبين للمستخدم ولجلسة ثانية (نطاق يثبت)');
  t.eq(await definition(), before, 'setToday: app_today() رجع لتعريف الهجرة بالضبط');
  t.eq(await db.asUser(U.owner, (q) => value(q, "select public.app_today() = (now() at time zone 'Asia/Baghdad')::date")), true, 'setToday: بعده app_today() يوم بغداد الحقيقي');
  await t.rejects(db.setToday('2026-03-16', async () => {
    throw new Error('probe_boom');
  }), 'setToday: الخطأ من fn يطلع كما هو', /probe_boom/);
  t.eq(await definition(), before, 'setToday: حتى لو fn رمت، الرجوع بـfinally');
  const nested = await db.setToday('2026-03-10', async () => {
    await db.setToday('2026-03-11', async () => {});
    return db.asUser(U.owner, (q) => value(q, 'select public.app_today()::text'));
  });
  t.eq(nested, '2026-03-10', 'setToday: المتداخل يرجع لليوم اللي قبله، مو لتعريف الهجرة');
  await t.rejects(db.setToday("2026-03-15'; select 1; --", async () => {}), 'setToday: يوم مو YYYY-MM-DD يرفض قبل أي شي', /YYYY-MM-DD/);

  // ── سجلّ التغطية ──────────────────────────────────────────────────────────────────────────────────────
  await db.asUser(U.owner, (q) => q('select public.can_see_cost(), public.app_today()'));
  t.ok(db.coverage.get('can_see_cost')?.has('owner') && db.coverage.get('app_today')?.has('owner'), 'السجلّ يحفظ كل دالّة بالنداء ويّا دور العضو');
  t.same(
    coverageGaps(['public.f(uuid)', 'public.g()'], new Map([['f', new Set(['owner', 'viewer'])]]), ['owner', 'viewer']),
    ['g × owner', 'g × viewer'],
    'ضابط: الفجوات = كل (دالّة × دور) ما انسجّل، مو «انسجّلت مرّة»',
  );
  t.same(coverageGaps(['public.f(uuid)'], new Map([['f', new Set(['owner'])]]), ['owner', 'viewer']), ['f × viewer'], 'ضابط: دور واحد ناقص ينعدّ');
  // المراجعة العدائية: النداء ينسجّل بس إذا وصل الدالّة (نجح، أو رفضته الدالّة نفسها P0001). دالّة مو موجودة (42883)، أو
  // صلاحية ناقصة، أو اسم بتعليق أو نصّ، ما ينسجّل. عميل مزيّف (بلا بوستغريس): كل جملة تنجح إلا اللي اسمها يقول غير.
  const fakeQuery = async (sql) => {
    const text = String(sql);
    const fail = (code, message) => Promise.reject(Object.assign(new Error(message), { code }));
    if (text.includes('from public.members where user_id')) return { rows: [{ role: 'viewer' }], rowCount: 1 };
    if (text.includes('pg_db_role_setting')) return { rows: [], rowCount: 0 };
    if (text.includes('pg_backend_pid')) return { rows: [{ pid: 1 }], rowCount: 1 };
    if (text.includes('probe_missing')) return fail('42883', 'function public.probe_missing(text) does not exist');
    if (text.includes('probe_denied')) return fail('42501', 'permission denied for function probe_denied');
    if (text.includes('probe_raises')) return fail('P0001', 'forbidden');
    return { rows: [], rowCount: 1 };
  };
  const fake = makeDb({ query: fakeQuery }, () => ({ connect: async () => {}, end: async () => {}, query: fakeQuery }));
  await fake.asUser('u', (q) => q('select public.probe_ok()'));
  await t.rejects(fake.asUser('u', (q) => q("select public.probe_missing('x'::text)")), 'سجلّ: دالّة مو موجودة ترمي', /does not exist/);
  await t.rejects(fake.asUser('u', (q) => q('select public.probe_denied()')), 'سجلّ: بلا صلاحية ترمي', /permission denied/);
  await t.rejects(fake.asUser('u', (q) => q('select public.probe_raises()')), 'سجلّ: رفض الدالّة نفسها يرمي', /forbidden/);
  await fake.asUser('u', (q) => q("select 1 -- public.probe_comment(\n, 'public.probe_string(', $$ public.probe_dollar( $$, /* public.probe_block( */ 2"));
  const other = await fake.session('u');
  await other.run('select public.probe_session()');
  await other.run("select public.probe_missing('y'::text)");
  await other.rollback();
  t.same(
    [...fake.coverage.entries()].map(([name, roles]) => `${name}:${[...roles].join()}`).sort(),
    ['probe_ok:viewer', 'probe_raises:viewer', 'probe_session:viewer'],
    'سجلّ: النداء اللي وصل الدالّة بس (نجح أو رفضته هي)، مو 42883 ولا صلاحية ناقصة ولا اسم بتعليق أو نصّ',
  );

  // ── verifyAll: NULL ودالّة بلا صفوف ما يعبرون (NULL <> 0 مو صحّ، فـwhere violations <> 0 كان يشيل الصفّ) ─────────────
  await db.asOwner(
    (q) =>
      q(`create function public.verify_probe_null() returns table (check_name text, violations bigint) language sql stable as $$ select 'null_count'::text, null::bigint $$;
         create function public.verify_probe_empty() returns table (check_name text, violations bigint) language sql stable as $$ select 'never'::text, 0::bigint where false $$;
         grant execute on function public.verify_probe_null(), public.verify_probe_empty() to service_role;`),
    null,
    { commit: true },
  );
  try {
    const { bad } = await verifyAll(db);
    t.ok(bad.some((line) => line.startsWith('verify_probe_null.null_count')), `verifyAll: violations = NULL مخالفة (${bad.join(' | ')})`);
    t.ok(bad.some((line) => line.startsWith('verify_probe_empty')), `verifyAll: دالّة verify_* بلا صفوف مخالفة (${bad.join(' | ')})`);
    t.same(bad.filter((line) => !line.startsWith('verify_probe_')), [], 'verifyAll: الباقي صفر (الضابط ما خرّب غيره)');
  } finally {
    await db.asOwner((q) => q('drop function public.verify_probe_null(); drop function public.verify_probe_empty();'), null, { commit: true });
  }

  // verifyAll بلا ولا دالّة verify_*: فحص على صفر دوالّ مخالفة (عميل مزيّف، فالقاعدة الحقيقية ما تتغيّر).
  const none = await verifyAll({ asService: (fn) => fn(async () => ({ rows: [] })) });
  t.same([none.fns.length, none.bad.length], [0, 1], `verifyAll: صفر دوالّ verify_* مخالفة (${none.bad.join(' | ')})`);

  // ── مشغّل التراجع بأجزائه الصافية (طفرات الاختبار): سطر «تراجع:»، وكشف «الثقيلة» بصور مصنوعة، وعتبة «صفر تراجع» ───────
  t.same(declaredRollback('0003_x.sql', '-- 0003_x — المشكلة\n-- تراجع: يدوي\n'), { kind: 'legacy' }, 'سطر التراجع: 0001–0003 معفيّة بالاسم');
  t.same(declaredRollback('0004_x.sql', '-- 0004_x — المشكلة\n-- تراجع: إضافية فقط — جدول جديد\n\nset lock_timeout = \'5s\';\n'), { kind: 'additive' }, 'سطر التراجع: «إضافية فقط»');
  t.same(
    declaredRollback('0005_x.sql', '-- 0005_x — المشكلة\n-- تراجع: rollback_0005.sql يرجّع الدوالّ\n'),
    { kind: 'file', file: 'rollback_0005.sql', number: 5 },
    'سطر التراجع: ملف باسمه ورقمه',
  );
  t.same(declaredRollback('0005_x.sql', '-- 0005_x — المشكلة\n-- تراجع: بمحرّر SQL\n'), { kind: 'missing' }, 'سطر التراجع: لا ملف ولا «إضافية فقط» ← ناقص');
  t.same(declaredRollback('0005_x.sql', "-- 0005_x — المشكلة\nset lock_timeout = '5s';\n-- تراجع: إضافية فقط\n"), { kind: 'missing' }, 'سطر التراجع بعد أوّل أمر مو من الرأس');
  t.same(
    [
      rollbackDeclarationProblems('0005_x.sql', { kind: 'missing' }, []).length,
      rollbackDeclarationProblems('0005_x.sql', { kind: 'additive' }, ['x']).length,
      rollbackDeclarationProblems('0005_x.sql', { kind: 'additive' }, []).length,
      rollbackDeclarationProblems('0005_x.sql', { kind: 'file', file: 'rollback_0005.sql', number: 5 }, ['x']).length,
    ],
    [1, 1, 0, 0],
    'مشاكل سطر التراجع: الناقص، و«إضافية فقط» وهي ثقيلة؛ والإضافية فعلاً والملف المسمّى يعبرون',
  );
  t.same(
    [zeroRollbacksProblem(4, 0), Boolean(zeroRollbacksProblem(5, 0)), zeroRollbacksProblem(5, 1), Boolean(zeroRollbacksProblem(6, 0))],
    [null, true, null, true],
    'عتبة «صفر تراجع»: من 0005 بالضبط صفر ملف جرى فشل، وقبلها لا',
  );
  // حالات طريق الرفض لكل ملف تراجع: أقل من المطلوب فشل، وبعددها يعبر، وبلا هجرته ما يُطلب؛ والمطلوب = الحالات المكتوبة بالبذور.
  const need6 = [[6, 3, 'قيد وحركة ووحدة']];
  t.same(
    [blockingShortfall(need6, [5, 6], new Map([[6, 3]])).length, blockingShortfall(need6, [5, 6], new Map([[6, 2]])).length, blockingShortfall(need6, [5], new Map()).length],
    [0, 1, 0],
    'طريق الرفض: ملف تراجع بحالات أقل من المطلوب ينمسك، وبعددها يعبر، وبلا هجرته ما يُطلب',
  );
  t.same(BLOCKING_REQUIRED.map(([number, need]) => [number, need]), Object.entries(BLOCKING_SEEDS).map(([number, cases]) => [Number(number), [].concat(cases).length]), 'المطلوب من حالات الرفض لكل ملف = حالاته بالبذور (حالة تنشال أو عتبة تنزل تنمسك)');
  // صورة مصنوعة بأقسام الكتالوج بأشكالها (relations وcolumns وconstraints وpolicies وtriggers وfunctions)، وكل تغيير لحاله.
  const pictured = {
    relations: [['public', 'orgs', 'r', true, false, 'postgres', null, null]],
    columns: [['orgs', 'id', 'uuid', true, 'gen_random_uuid()', '', null]],
    constraints: [['orgs', 'orgs_pkey', 'PRIMARY KEY (id)']],
    indexes: ['CREATE UNIQUE INDEX orgs_pkey ON public.orgs USING btree (id)'],
    policies: [['orgs', 'orgs_read', 'PERMISSIVE', '{authenticated}', 'SELECT', 'true', null]],
    triggers: [['CREATE TRIGGER audit_orgs AFTER INSERT ON public.orgs FOR EACH ROW EXECUTE FUNCTION private.audit_row()', 'O']],
    functions: [['public', 'app_today', '', 'date', 'a1'], ['public', 'verify_core', '', 'TABLE(check_name text, violations bigint)', 'v1']],
  };
  const grown = (extra) => Object.fromEntries(Object.entries(pictured).map(([section, list]) => [section, [...list, ...(extra[section] ?? [])]]));
  const swapped = (section, index, element) => ({ ...pictured, [section]: pictured[section].map((x, i) => (i === index ? element : x)) });
  for (const [label, after, expected] of [
    [
      'جدول جديد بأعمدته وقيوده وسياساته ومشغّلاته، ودالّة جديدة، وفهرس على جدول قديم: إضافة',
      grown({
        relations: [['public', 'units', 'r', true, false, 'postgres', null, null]],
        columns: [['units', 'code', 'text', true, null, '', null]],
        constraints: [['units', 'units_pkey', 'PRIMARY KEY (code)']],
        indexes: ['CREATE INDEX orgs_name ON public.orgs USING btree (name)'],
        policies: [['units', 'units_read', 'PERMISSIVE', '{authenticated}', 'SELECT', 'true', null]],
        triggers: [['CREATE TRIGGER units_append_only BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION private.reject_change()', 'O']],
        functions: [['private', 'alloc_lr', 'p_total numeric', 'numeric[]', 'x1']],
      }),
      0,
    ],
    ['عمود بجدول قديم', grown({ columns: [['orgs', 'probe_note', 'text', false, null, '', null]] }), 1],
    ['قيد بجدول قديم', grown({ constraints: [['orgs', 'orgs_probe_check', 'CHECK (true)']] }), 1],
    ['سياسة بجدول قديم', grown({ policies: [['orgs', 'orgs_probe', 'RESTRICTIVE', '{authenticated}', 'SELECT', 'true', null]] }), 1],
    ['مشغّل بجدول قديم', grown({ triggers: [['CREATE TRIGGER orgs_probe BEFORE UPDATE ON public.orgs FOR EACH ROW EXECUTE FUNCTION private.reject_change()', 'O']] }), 1],
    ['جسم دالّة قديمة', swapped('functions', 0, ['public', 'app_today', '', 'date', 'a2']), 1],
    ['إعادة كتابة verify_* للقراءة', swapped('functions', 1, ['public', 'verify_core', '', 'TABLE(check_name text, violations bigint)', 'v2']), 0],
    ['سياسة انشالت', { ...pictured, policies: [] }, 1],
  ]) {
    const reasons = heavyChanges(pictured, after);
    t.eq(reasons.length, expected, `heavyChanges: ${label} ← ${expected} (${reasons.join(' | ')})`);
  }

  // ── sameRefRace وdraftWriteLock على النوع الضابط ─────────────────────────────────────────────────────────
  await db.asOwner((q) => q(PROBE_SCHEMA), null, { commit: true });
  try {
    const draft = (table, lines) => async () =>
      db.asUser(
        U.owner,
        async (q) => {
          const id = (await q(`insert into probe.${table} default values returning id`)).rows[0].id;
          const lineId = (await q(`insert into probe.${lines} (doc_id, qty) values ($1, 1) returning id`, [id])).rows[0].id;
          if (table === 'docs') await q('insert into probe.amounts (line_id, amount) values ($1, 10)', [lineId]);
          const version = await value(q, `select version from probe.${table} where id = $1`, [id]);
          return { id, version, lineId };
        },
        { commit: true },
      );
    const postings = async (id) => (await db.admin('select count(*)::int as count, count(distinct doc_no)::int as numbers from probe.postings where doc_id = $1', [id])).rows[0];
    const sound = {
      name: 'النوع الضابط',
      user: U.owner,
      draft: draft('docs', 'lines'),
      post: (id, version, ref) => ({ sql: 'select probe.post_doc($1, $2, $3) as result', params: [id, version, ref] }),
      postings,
      posted: async () => {
        const doc = await sound.draft();
        await db.asUser(U.owner, (q) => q('select probe.post_doc($1, $2, $3)', [doc.id, doc.version, randomUUID()]), { commit: true });
        return doc;
      },
      insertHeader: (status) => ({ sql: 'insert into probe.docs (status) values ($1)', params: [status] }),
      setStatus: (doc, status) => ({ sql: 'update probe.docs set status = $2 where id = $1', params: [doc.id, status] }),
      editLine: (doc) => ({ sql: 'update probe.lines set qty = qty + 1 where id = $1', params: [doc.lineId] }),
      editAmount: (doc) => ({ sql: 'update probe.amounts set amount = amount + 1 where line_id = $1', params: [doc.lineId] }),
    };
    t.eq((await sound.draft()).version, 3, 'النوع الضابط: كل سطر ومبلغ بالمسوّدة يزيد نسخة الرأس (1 ← 3)');
    await sameRefRace(t, db, sound);
    await draftWriteLock(t, db, sound);

    // المكسوران: كل واحد يفشل براهينه، والفشل بالمكان اللي انكسر بيه.
    const noRef = createHarness();
    await sameRefRace(noRef.t, db, { ...sound, name: 'بلا مرجع', post: (id, version, ref) => ({ sql: 'select probe.post_doc_noref($1, $2, $3) as result', params: [id, version, ref] }) });
    const noRefFailures = noRef.result().failures;
    t.ok(noRefFailures.some((f) => f.includes('نفس النتيجة')) && noRefFailures.some((f) => f.includes('ref_reused')), `ضابط: ترحيل بلا بروتوكول المرجع يفشل sameRefRace (${noRefFailures.length} فشل)`);
    // طفرات الاختبار: ترحيل بلا قفل ولا مرجع ولا فحص حالة يفشل كل برهان لحاله (الثانية ما نامت، نتيجتان، ترحيلان، نفس
    // المرجع بنسخة ثانية يعبر، والمرحَّل بمرجع جديد يعبر)، فحذف أي برهان من sameRefRace يبين هنا.
    const loosePost = createHarness();
    await sameRefRace(loosePost.t, db, { ...sound, name: 'بلا قفل', post: (id, version, ref) => ({ sql: 'select probe.post_doc_loose($1, $2, $3) as result', params: [id, version, ref] }) });
    const looseFailures = loosePost.result().failures;
    const missed = ['نامت', 'نفس النتيجة', 'ترحيل واحد', 'ref_reused', 'not_draft'].filter((part) => !looseFailures.some((f) => f.includes(part)));
    t.same(missed, [], `ضابط: ترحيل بلا قفل ولا مرجع يفشل كل برهان بـsameRefRace (${looseFailures.length} فشل)`);
    const loose = createHarness();
    await draftWriteLock(loose.t, db, {
      ...sound,
      name: 'بلا حرّاس',
      draft: draft('loose_docs', 'loose_lines'),
      posted: async () => {
        const doc = await draft('loose_docs', 'loose_lines')();
        await db.admin("update probe.loose_docs set status = 'posted' where id = $1", [doc.id]);
        return doc;
      },
      insertHeader: (status) => ({ sql: 'insert into probe.loose_docs (status) values ($1)', params: [status] }),
      setStatus: (doc, status) => ({ sql: 'update probe.loose_docs set status = $2 where id = $1', params: [doc.id, status] }),
      editLine: (doc) => ({ sql: 'update probe.loose_lines set qty = qty + 1 where id = $1', params: [doc.lineId] }),
      editAmount: undefined,
    });
    const { passed, failures } = loose.result();
    t.same([failures.length, passed], [3, 3], `ضابط: مسوّدة بلا حرّاس تفشل الرفضات الثلاث، وضوابطها الثلاثة تعبر (${failures.join(' | ')})`);

    // المراجعة العدائية: نوع مسجّل بأمر غلط على المخطّط السليم نفسه يفشل بالبند الغلط، مو «يرفض (خطأ ما)».
    for (const [label, broken, where] of [
      ['جدول الرأس بالغلط', { insertHeader: (status) => ({ sql: 'insert into probe.doc (status) values ($1)', params: [status] }) }, 'إدخال رأس posted'],
      ['عمود NOT NULL ناقص وسياسة بلا status', { insertHeader: (status) => ({ sql: 'insert into probe.strict_docs (status) values ($1)', params: [status] }) }, 'إدخال رأس posted'],
      ['عمود الحالة بالغلط', { setStatus: (doc, status) => ({ sql: 'update probe.docs set stauts = $2 where id = $1', params: [doc.id, status] }) }, 'قلب مسوّدة'],
      ['معرّف الرأس فارغ', { setStatus: (doc, status) => ({ sql: 'update probe.docs set status = $2 where id = $1', params: [doc.headerId, status] }) }, 'قلب مسوّدة'],
      ['جدول المبالغ بالغلط', { editAmount: (doc) => ({ sql: 'update probe.amount set amount = amount + 1 where line_id = $1', params: [doc.lineId] }) }, 'تعديل مبلغ'],
      ['المرحَّل بلا معرّف سطر', { posted: async () => ({ ...(await sound.posted()), lineId: undefined }) }, 'مستند مرحَّل'],
      // طفرات الاختبار: معرّف من نوع غلط (22P02) يفشل بالرفض نفسه وضابطه يعبر، فالرفض لازم يكون رفض المسوّدة؛ ورأس بمنشأة
      // غريبة يرفضه حارس الرأس وضابطه (draft بنفس المنشأة الغريبة) يرفضه RLS، فالضابط لازم ينفّذ.
      ['المرحَّل بمعرّف سطر من نوع غلط', { posted: async () => ({ ...(await sound.posted()), lineId: 'PB-1' }) }, 'مستند مرحَّل'],
      ['رأس بمنشأة غريبة', { insertHeader: (status) => ({ sql: 'insert into probe.docs (status, org_id) values ($1, gen_random_uuid())', params: [status] }) }, 'إدخال رأس posted'],
    ]) {
      const run = createHarness();
      await draftWriteLock(run.t, db, { ...sound, name: label, ...broken });
      const brokenFailures = run.result().failures;
      t.ok(brokenFailures.length > 0 && brokenFailures.every((f) => f.includes(where)), `ضابط: ${label} يفشل draftWriteLock ببند «${where}» بس (${brokenFailures.join(' | ') || 'عبر كلّه'})`);
    }
  } finally {
    await db.asOwner((q) => q('drop schema probe cascade'), null, { commit: true });
  }
}
