// أدوات مشتركة لفحوص الدفاتر (WP3: book.test وledger.test): منشأة بأدوارها الثمانية من الدوالّ الحقيقية، ودفاترها بأسمائها،
// ونداء يرجّع القيمة أو رمز الرفض، وأرصدة الدفاتر والمتبقّي من الصفوف الخام (بمفتاح الخادم) للمقارنة. مو ملف فحص (ما ينتهي
// بـ.test.mjs)، فالحزمة ما تشغّله لحاله.
import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const uid = () => randomUUID();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** محلّلات أجوبة الخادم بالواجهة من المصدر الحقيقي (esbuild، افحص المصدر لا نسخة منه)، حتى الجواب الحقيقي يمرّ منها بالحزمة. */
export async function loadRepoParsers() {
  const result = await build({
    stdin: {
      contents: [
        "export { parseAccountsSummary, parsePartyBalances, parseStatement } from './src/lib/repo/parties.ts';",
        "export { parseCashBalances, parseCashStatement } from './src/lib/repo/cash.ts';",
        "export { parseHomeSummary } from './src/lib/repo/home.ts';",
      ].join('\n'),
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"' },
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

export const ROLE_LIST = ['owner', 'manager', 'storekeeper', 'mill_operator', 'hatchery_operator', 'hall_worker', 'accountant', 'viewer'];

/** رمز الرفض: P0001 برمزه، والقيد باسمه، وRLS بـ'rls'، وغيره برمزه ورسالته. */
export function outcome(error) {
  if (error.code === 'P0001') return error.message;
  if (error.code === '23514') return `check:${error.constraint}`;
  if (error.code === '23505') return `unique:${error.constraint}`;
  if (error.code === '42501' && /row-level security/u.test(error.message)) return 'rls';
  return `${error.code}:${error.message}`;
}

/**
 * منشأة بأدوارها: id(n) معرّف المستخدم n، وphone(n) رقمه؛ roles قائمة [مفتاح، دور، وحدات النطاق (أنواع)]. المالك أوّل مفتاح
 * بالقائمة دوره owner. يرجّع المعرّفات والأعضاء والوحدات والدفاتر (feed_mill وbroiler وlayer وmedicine وgeneral بدفتر main،
 * وchicks وhatching_eggs للمفقس).
 */
export async function makeOrg(db, { name, id, phone, roles }) {
  const users = {};
  for (const [i, [key]] of roles.entries()) {
    users[key] = id(i + 1);
    await db.admin('insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())', [users[key], phone(i + 1)]);
  }
  const [ownerKey] = roles[0];
  await db.asUser(users[ownerKey], (q) => q('select public.create_my_org($1, $2)', [name, 'المالك']), { commit: true });
  const org = (await db.admin('select org_id from public.members where user_id = $1', [users[ownerKey]])).rows[0].org_id;
  const divisions = Object.fromEntries((await db.admin('select kind, id from public.divisions where org_id = $1', [org])).rows.map((r) => [r.kind, r.id]));
  const books = Object.fromEntries(
    (await db.admin('select d.kind, b.code, b.id from public.ledger_books b join public.divisions d on d.id = b.division_id where b.org_id = $1', [org])).rows.map((r) => [
      r.kind === 'hatchery' ? r.code : r.kind,
      r.id,
    ]),
  );
  const members = { [ownerKey]: (await db.admin('select id from public.members where user_id = $1', [users[ownerKey]])).rows[0].id };
  for (const [i, [key, role, scope = []]] of roles.entries()) {
    if (i === 0) continue;
    const local = `0${phone(i + 1).slice(3)}`;
    members[key] = (await db.asUser(users[ownerKey], (q) => q('select public.add_member($1, $2, $3, $4::uuid[]) as id', [local, role, key, scope.map((kind) => divisions[kind])]), { commit: true })).rows[0].id;
    await db.acceptInvite(users[ownerKey], users[key], members[key]);
  }
  return { org, users, members, divisions, books };
}

/** نداء بمستخدم: { ok: true, value } (أوّل عمود بأوّل صفّ) أو { ok: false, code, hint }. commit يثبّت الناجح. */
export async function call(db, user, sql, params = [], { commit = true } = {}) {
  try {
    const result = await db.asUser(user, (q) => q(sql, params), { commit });
    return { ok: true, value: Object.values(result.rows[0] ?? {})[0] };
  } catch (error) {
    return { ok: false, code: outcome(error), hint: error.hint ?? '' };
  }
}

/** JSON بمفاتيح مرتّبة: jsonb يرتّب مفاتيحه بالطول ثم بالحروف، فالمقارنة بالمعنى مو بترتيب الكتابة. */
export function canon(value) {
  const sort = (v) => (Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, sort(v[key])])) : v);
  return JSON.stringify(sort(value));
}

/** القيمة أو رمز الرفض نصّاً (للمقارنة بسطر واحد). */
export const shown = (result) => (result.ok ? 'ok' : result.code);

/** رصيد (جهة، دفتر) من الصفوف الخام (بالدينار، نصّاً). */
export async function balance(db, party, book) {
  return (await db.admin('select coalesce(sum(amount), 0)::text as v from public.party_entries where party_id = $1 and book_id = $2', [party, book])).rows[0].v;
}

/** متبقّي كل قيد لجهة بدفتر: [المعرّف، المبلغ، المتبقّي] بترتيب (on_date, seq)، من الصفوف الخام. */
export async function remainders(db, party, book) {
  return (
    await db.admin(
      `select e.id, e.kind, e.amount::text as amount, (abs(e.amount) - coalesce((select sum(a.amount) from public.party_allocations a
         where a.party_id = e.party_id and a.book_id = e.book_id and ((e.amount > 0 and a.debit_entry_id = e.id) or (e.amount < 0 and a.credit_entry_id = e.id))), 0))::text as remaining
       from public.party_entries e where e.party_id = $1 and e.book_id = $2 order by e.on_date, e.seq`,
      [party, book],
    )
  ).rows;
}

/** verify_ledger كخريطة اسم ← عدد (بمفتاح الخادم، أو بالاستعلام المعطى داخل معاملة ضابط). */
export const verifyLedger = async (q) => Object.fromEntries((await q('select check_name, violations::int as v from public.verify_ledger()')).rows.map((r) => [r.check_name, r.v]));

/** أسماء فحوص verify_ledger كلها بالصفر (فحص ينضاف أو ينشال أو يتبدّل اسمه ينمسك). */
export const LEDGER_ZERO = {
  entry_remaining_range: 0,
  book_balance_identity: 0,
  allocation_pairs: 0,
  reversal_pairs: 0,
  whole_dinar: 0,
  kind_sign: 0,
  payment_cash_moves: 0,
  cash_move_sources: 0,
  cash_move_reversals: 0,
  cash_transfer_legs: 0,
  cash_opening_once: 0,
  party_opening_once: 0,
  allocation_completeness: 0,
  doc_numbers: 0,
  posted_division_stamped: 0,
  report_formulas: 0,
};
