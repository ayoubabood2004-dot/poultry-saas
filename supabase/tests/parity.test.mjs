// تطابق الخادم والشاشة (FOUNDATION parity-* ٨٥٤، و«جدول الصلاحيات» ٥٢٨): جدول الصلاحيات بـSQL (private.role_can)
// يطابق can() بـsrc/domain/permissions.ts خانةً خانة، وتطبيع الهاتف (private.normalize_phone) يطابق phone.ts.
// الملفات الحقيقية تنحزم بـesbuild (مو نسخة منها)، فأي تغيير بطرف واحد يفشل هنا.
import { PHONE_CASES } from '../../scripts/tests/phone.test.mjs';
import { loadSrc } from '../../scripts/tests/load-src.mjs';

export default async function (t, db) {
  const p = await loadSrc('src/domain/permissions.ts');
  const phone = await loadSrc('src/domain/phone.ts');

  // قائمة الأفعال نفسها بالطرفين.
  const sqlActions = (await db.admin('select private.actions() as a')).rows[0].a;
  t.same([...sqlActions].sort(), [...p.ACTIONS].sort(), 'الأفعال نفسها بـSQL وpermissions.ts');

  // كل دور × فعل × (ختم الكلف أو لا).
  const cells = [];
  for (const role of p.ROLES) for (const action of p.ACTIONS) for (const confirmed of [false, true]) cells.push({ role, action, confirmed });
  const sql = (await db.admin(
    `select x.role, x.action, x.confirmed, private.role_can(x.role, x.action, x.confirmed) as allowed
     from jsonb_to_recordset($1::jsonb) as x(role text, action text, confirmed boolean)`,
    [JSON.stringify(cells)],
  )).rows;
  t.eq(sql.length, cells.length, `كل الخانات انفحصت (${cells.length})`);
  const mismatch = sql
    .filter((row) => row.allowed !== p.can(row.role, row.action, { costsConfirmed: row.confirmed }))
    .map((row) => `${row.role} × ${row.action}${row.confirmed ? ' (كلف مختومة)' : ''}: SQL ${row.allowed}`);
  t.same(mismatch, [], 'جدول الصلاحيات نفسه بالخادم والشاشة');
  await t.rejects(db.admin("select private.role_can('owner', 'typo.action')"), 'فعل مو بالقائمة يرمي حتى للمالك', /^unknown_action$/);
  t.eq((await db.admin("select private.role_can(null, 'read') as a")).rows[0].a, false, 'بلا عضوية: ولا فعل');

  // تطبيع الهاتف: نفس الحالات بالطرفين.
  const phones = (await db.admin(
    'select x.i, private.normalize_phone(x.input) as sql from jsonb_to_recordset($1::jsonb) as x(i int, input text)',
    [JSON.stringify(PHONE_CASES.map(([input], i) => ({ i, input })))],
  )).rows;
  const phoneMismatch = phones
    .filter((row) => row.sql !== phone.normalizePhone(PHONE_CASES[row.i][0]))
    .map((row) => `«${PHONE_CASES[row.i][0]}»: SQL ${row.sql}`);
  t.eq(phones.length, PHONE_CASES.length, `حالات الهاتف انفحصت (${PHONE_CASES.length})`);
  t.same(phoneMismatch, [], 'تطبيع الهاتف نفسه بالخادم والشاشة');
}
