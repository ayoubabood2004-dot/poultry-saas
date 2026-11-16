// تداخل «بيع الطيور وإغلاق الدورة» (0029) مع «تعديل الفوج وحذفه» (0028_customer_edits، جلسة أخرى، بالإنتاج 2026-11-16): دالّتا edit_flock
// وdelete_flock كُتبتا قبل جداول 0029، فـ:
// E1 تذكرة وزن (ولو مسوّدة) يوم D كانت لا تمنع نقل التسكين إلى ما بعدها، فتصير تذكرة قبل تسكين فوجها ولا تكتمل أبداً (before_placement)؛
// E2 والفاتورة (صفّ «مباع» بيوم التذكرة) كذلك: بيعٌ قبل التسكين؛
// E3 والعدد المسكَّن كان يُقارن بالنافق والمستبعد وحدهما، فعددٌ دون المباع يجعل الحيّ سالباً (flock_live_check يرفضه الآن بيومه)؛ وفرق العدّ كذلك؛
// E4 وحذف فوج عليه تذكرة وزن أو بيع أو فرق عدّ كان يُرفض بالمفتاح الأجنبيّ بجملة عامّة «سجلّ مرتبط به»، والآن يسمّي ما عليه كبقيّة سجلّاته.
// والضوابط: نقل التسكين إلى ما قبل البيع، وزيادة العدد، يمرّان. منشأة هذا الملف وحدها: المعرّفات f2890000 والهواتف 96477028900.
import { call, makeOrg, uid } from './ledger-kit.mjs';

const TODAY = '2026-11-12';
const DAY_MS = 86400000;
const day = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const id = (n) => `f2890000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n) => `96477028900${String(n).padStart(2, '0')}`;

const OPEN = 'select public.open_flock($1, $2, $3, 0, null, $4)';
const SAVE = 'select public.save_weigh_ticket($1, $2, $3::jsonb)';
const FINISH = 'select public.finish_weigh_ticket($1, $2, $3)';
const SELL = 'select public.record_bird_sale($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)';
const ADJUST = 'select public.record_flock_count_adjust($1, $2, $3, $4, $5, $6, $7)';
const EDIT = 'select public.edit_flock($1, $2, $3, $4, $5, $6, $7)';
const DEL = 'select public.delete_flock($1, $2, $3)';

export default async function (t, db) {
  await db.setToday(TODAY, () => scenario(t, db));
}

async function scenario(t, db) {
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (error) {
      t.ok(false, `${name}: رمى ${error.stack ?? error.message}`);
    }
  };
  const G = await makeOrg(db, {
    name: 'مزرعة تعديل الأفواج بعد البيع',
    id,
    phone,
    roles: [['owner', 'owner'], ['manager', 'manager'], ['accountant', 'accountant'], ['worker', 'hall_worker', ['broiler']]],
  });
  const { users: U, divisions: D } = G;
  const one = async (user, sql, params) => {
    const result = await call(db, user, sql, params);
    if (!result.ok) throw new Error(`${sql}: ${result.code} ${result.hint}`);
    return result.value;
  };
  const admin = async (sql, params) => (await db.admin(sql, params)).rows;
  const site = await one(U.owner, "insert into public.sites (division_id, name, kind) values ($1, 'حقل التعديل', 'farm') returning id", [D.broiler]);
  const hall = (name) => one(U.owner, 'insert into public.halls (site_id, name) values ($1, $2) returning id', [site, name]);
  const trader = await one(U.owner, "insert into public.parties (name, is_customer) values ('تاجر التعديل', true) returning id");
  const place = async (hallId, on, count) => (await one(U.manager, OPEN, [hallId, on, count, uid()])).flock_id;
  const version = async (flock) => (await admin('select version from public.flocks where id = $1', [flock]))[0].version;
  const live = async (flock) => Number((await admin('select private.flock_live(f) as v from public.flocks f where f.id = $1', [flock]))[0].v);
  /** تذكرة قبّان بقاعة واحدة: مسوّدة، أو مكتملة، أو مكتملة بفاتورة. */
  const ticket = async (hallId, on, birds, upto) => {
    const ticketId = uid();
    await one(U.worker, SAVE, [ticketId, null, JSON.stringify({ site_id: site, on_date: on, method: 'scale', empty_kg: '7000', empty_with_crates: true,
      crate_kg: null, stops: [{ id: uid(), hall_id: hallId, birds, crates: 10, gross_kg: String(7000 + birds * 2), weighings: [] }] })]);
    if (upto === 'draft') return ticketId;
    const done = await one(U.worker, FINISH, [uid(), ticketId, 1]);
    if (upto === 'sale') await one(U.accountant, SELL, [uid(), uid(), ticketId, done.version, trader, '2000.00', '0', '0', null, null]);
    return ticketId;
  };
  const edit = async (flock, on, count) => call(db, U.manager, EDIT, [flock, await version(flock), on, count, 0, null, uid()]);
  const del = async (flock) => call(db, U.manager, DEL, [flock, await version(flock), uid()]);

  const H = { a: await hall('قاعة 1'), b: await hall('قاعة 2'), c: await hall('قاعة 3'), d: await hall('قاعة 4') };
  const F = {};
  await db.setToday(day(-10), async () => {
    for (const k of Object.keys(H)) F[k] = await place(H[k], day(-10), 1000);
  });

  await section('E1 مسوّدة تذكرة وزن تمنع نقل التسكين إلى ما بعدها', async () => {
    await db.setToday(day(-6), () => ticket(H.a, day(-6), 100, 'draft'));
    const r = await edit(F.a, day(-5), 1000);
    t.same([r.ok ? 'ok' : r.code, r.ok ? false : r.hint.includes('تذكرة وزن') && r.hint.includes('06/11/2026')], ['records_before_placement', true],
      'E1 تذكرة يوم 06/11 (مسوّدة): لا تسكين يوم 07/11، والجملة تسمّي التذكرة ويومها');
  });

  await section('E2 البيع يمنع نقل التسكين إلى ما بعده، ويسمح بما قبله', async () => {
    await db.setToday(day(-6), () => ticket(H.b, day(-6), 100, 'sale'));
    const r = await edit(F.b, day(-5), 1000);
    t.same([r.ok ? 'ok' : r.code, r.ok ? false : r.hint.includes('بيع')], ['records_before_placement', true], 'E2 فاتورة بتذكرة يوم 06/11: لا تسكين يوم 07/11');
    const earlier = await edit(F.b, day(-12), 1000);
    t.same([earlier.ok, await live(F.b)], [true, 900], 'E2 ضابط: نقل التسكين إلى ما قبل البيع يمرّ والحيّ 900');
  });

  await section('E3 العدد المسكَّن لا يقلّ عن المباع وفرق العدّ (الحيّ لا يصير سالباً)', async () => {
    const r = await edit(F.b, day(-12), 50);
    t.same([r.ok ? 'ok' : r.code, await live(F.b)], ['live_negative', 900], 'E3 بيع 100 من 1,000: عدد 50 يُرفض بالحيّ السالب ولا يُكتب');
    const up = await edit(F.b, day(-12), 1100);
    t.same([up.ok, await live(F.b)], [true, 1000], 'E3 ضابط: زيادة العدد إلى 1,100 تمرّ والحيّ 1,000');
    await one(U.manager, ADJUST, [uid(), uid(), F.c, day(-3), -900, 'عُدّت القاعة', 1000]);
    const c = await edit(F.c, day(-10), 800);
    t.same([c.ok ? 'ok' : c.code, await live(F.c)], ['live_negative', 100], 'E3 فرق عدّ −900: عدد 800 يُرفض والحيّ 100 كما هو');
  });

  await section('E4 حذف فوج عليه تذكرة وزن أو بيع أو فرق عدّ يسمّي ما عليه', async () => {
    const a = await del(F.a);
    t.same([a.ok ? 'ok' : a.code, a.ok ? false : a.hint.includes('تذاكر وزن')], ['flock_has_records', true], 'E4 مسوّدة تذكرة: «تذاكر وزن» في الجملة');
    const b = await del(F.b);
    t.same([b.ok ? 'ok' : b.code, b.ok ? false : b.hint.includes('بيع')], ['flock_has_records', true], 'E4 فاتورة: «بيع» في الجملة');
    const c = await del(F.c);
    t.same([c.ok ? 'ok' : c.code, c.ok ? false : c.hint.includes('فرق عدّ')], ['flock_has_records', true], 'E4 فرق عدّ وحده: «فرق عدّ» في الجملة');
    const d = await del(F.d);
    t.same([d.ok, (await admin('select count(*)::int as n from public.flocks where id = $1', [F.d]))[0].n], [true, 0], 'E4 ضابط: فوج بلا سجلّ يُحذف');
  });
}
