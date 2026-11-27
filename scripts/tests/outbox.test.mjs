// outbox-test: ما يدخل الطابور إلا المأمون، والهويّة مختومة، وعاملان بجهاز واحد على نفس (فوج + يوم)
// ولا وحدة تنمسح ولا تنرفع باسم الثاني، ورفض الهويّة والاشتراك ما ينحسب محاولة ولا يروح لرفّ المراجعة،
// والسباقات بين التبويبات ما تضاعف شي، وجواب ضايع ثم تعديل لنفس (فوج + يوم) يعطي حفظتين بلا رفّ مراجعة.
// وفوكها: الهويّة تنفحص لصق الإرسال، ومسك مختوم بالمستقبل ميّت، والقاعدة ما تسدّ ترقية نسخة أحدث،
// وكل حفظ جولة يسأل persisted(). ومراجعة 0032: M1 الطابور بنسخة 2 فنافذة الحزمة القديمة لا تشاركه، وM2 تعديل زيارة أضافها الجهاز
// وقد رُفعت إضافتها بنسخة 1.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSrc } from './load-src.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const ORG = 'org-1';
const ALI = { userId: 'user-ali', orgId: ORG, displayName: 'علي' };
const HASAN = { userId: 'user-hasan', orgId: ORG, displayName: 'حسن' };

let dbCounter = 0;
const nextName = () => `outbox-test-${(dbCounter += 1)}`;

/**
 * خادم مصنوع يطبّق save_flock_day: مفتاح طبيعي (فوج + يوم)، base_version، وrpc_refs بالمرجع. وsave_flock_visit (0032) بعقده: زيارة بمعرّفها
 * ونسختها؛ الإضافة (نسخة null) لمعرّف موجود بمحتوى آخر stale_visit، والتعديل والإلغاء بشرط النسخة، والإلغاء علامة.
 */
function makeServer() {
  const rows = new Map();
  const visits = new Map();
  const refs = new Map();
  const calls = [];
  const same = (a, b) => JSON.stringify({ ...a, recordedAt: null, void: null }) === JSON.stringify({ ...b, recordedAt: null, void: null });
  return {
    rows,
    visits,
    refs,
    calls,
    apply(op) {
      calls.push(op.id);
      const known = refs.get(op.id);
      if (known) return known;
      if (op.fn === 'save_flock_visit') {
        const visit = visits.get(op.payload.visitId) ?? null;
        let result;
        if (op.baseVersion === null) {
          if (!visit) {
            visits.set(op.payload.visitId, { version: 1, voided: false, by: op.userId, payload: { ...op.payload } });
            result = { kind: 'saved', version: 1 };
          } else result = same(visit.payload, op.payload) && !visit.voided ? { kind: 'saved', version: visit.version } : { kind: 'stale_visit', server: visit };
        } else if (!visit || visit.voided || visit.version !== op.baseVersion) result = { kind: 'stale_visit', server: visit };
        else {
          visits.set(op.payload.visitId, { version: visit.version + 1, voided: op.payload.void, by: visit.by, payload: { ...op.payload } });
          result = { kind: 'saved', version: visit.version + 1 };
        }
        refs.set(op.id, result);
        return result;
      }
      const key = `${op.flockId}|${op.day}`;
      const row = rows.get(key) ?? null;
      const current = row ? row.version : null;
      let result;
      if (op.baseVersion !== current) result = { kind: 'stale_day', server: row };
      else {
        const version = (current ?? 0) + 1;
        rows.set(key, { version, by: op.userId, payload: { ...(row?.payload ?? {}), ...op.payload } });
        result = { kind: 'saved', version };
      }
      refs.set(op.id, result);
      return result;
    },
  };
}

function transport(server, userId, overrides = {}) {
  return {
    currentUserId: async () => userId,
    send: async (op) => {
      if (overrides.send) return overrides.send(op, server);
      await Promise.resolve();
      return server.apply(op);
    },
    lookup: async (op) => server.refs.get(op.id) ?? null,
  };
}

/** يقرا العمليات من القاعدة نفسها، مو من اللي رجّعه الطابور. */
function readOps(db) {
  return new Promise((resolve, reject) => {
    const request = db.transaction('ops', 'readonly').objectStore('ops').getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putOp(db, op) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('ops', 'readwrite');
    tx.objectStore('ops').put(op);
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

function rawOpen(name, version) {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(name, version);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** الانسداد ينتظر للأبد: المهلة تخلّي الفحص يفشل بدل ما يعلك. */
function within(promise, ms, timeoutValue) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(timeoutValue), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

export default async function (t) {
  const q = await loadSrc('src/lib/outbox/index.ts');
  const idb = await loadSrc('src/lib/idb.ts');
  const queue = await loadSrc('src/lib/outbox/queue.ts');
  const open = () => q.openOutbox(nextName());
  const day = (flockId, onDate, payload, baseVersion = null) => ({ fn: 'save_flock_day', flockId, day: onDate, payload, baseVersion });

  t.eq(typeof q.enqueue, 'undefined', 'enqueue مو مصدّر للشاشات: الحفظ بـsaveRound بس');

  // ١) ما يدخل الطابور إلا save_flock_day، وبهويّة مؤكّدة.
  {
    const db = await open();
    await t.rejects(q.saveRound(db, ALI, { ...day('f1', '2026-10-15', { dead: 1 }), fn: 'post_sale' }), 'post_sale ما يدخل الطابور', /not_queueable/);
    // كل دالّة ترحيل أو إلغاء بقائمة السماح (ومنها ترحيل الافتتاح والتحويل، WP4) ترفض الطابور: الترحيل يحتاج الشبكة (FOUNDATION ٢٠١).
    const allowlist = JSON.parse(readFileSync(path.join(ROOT, 'supabase', 'tests', 'allowlist.json'), 'utf8')).authenticated;
    const postings = allowlist.map((signature) => signature.slice('public.'.length, signature.indexOf('('))).filter((name) => /^(post|void)_/u.test(name));
    let refused = 0;
    for (const fn of postings) {
      try {
        await q.saveRound(db, ALI, { ...day('f1', '2026-10-15', { dead: 1 }), fn });
      } catch (error) {
        if (/not_queueable/u.test(error.message)) refused += 1;
      }
    }
    t.ok(postings.includes('post_transfer') && postings.includes('post_opening_stock') && refused === postings.length, `كل post_*/void_* بقائمة السماح يرفضه الطابور (${refused} من ${postings.length})`);
    await t.rejects(q.saveRound(db, { ...ALI, userId: '' }, day('f1', '2026-10-15', { dead: 1 })), 'بلا هويّة ما يدخل', /no_identity/);
    const op = await q.saveRound(db, ALI, day('f1', '2026-10-15', { dead: 3 }));
    t.same([op.userId, op.orgId, op.displayName, op.fn, op.state], [ALI.userId, ORG, 'علي', 'save_flock_day', 'pending'], 'العملية مختومة بالهويّة');
  }

  // ٢) عمليات نفس (المستخدم، المنشأة، الفوج، اليوم) اللي ما انبعثت تندمج، وnull = «بلا تغيير».
  {
    const db = await open();
    const first = await q.saveRound(db, ALI, day('f1', '2026-10-15', { dead: 3 }));
    await q.saveRound(db, ALI, day('f1', '2026-10-15', { culled: 1 }));
    const last = await q.saveRound(db, ALI, day('f1', '2026-10-15', { dead: 5, culled: null }));
    t.eq(last.id, first.id, 'نفس المرجع بعد الدمج');
    t.same(last.payload, { dead: 5, culled: 1 }, 'الأحدث يغلب وnull ما يمسح');
    t.eq((await q.summarize(db, ALI)).mine, 1, 'عملية وحدة بالطابور');
  }

  // ٣) عاملان بجهاز واحد على نفس (فوج + يوم): ولا وحدة تنمسح ولا تنرفع باسم الثاني.
  {
    const db = await open();
    const server = makeServer();
    await q.saveRound(db, ALI, day('f1', '2026-10-15', { dead: 2 }));
    await q.saveRound(db, HASAN, day('f1', '2026-10-15', { dead: 7 }));
    t.eq((await q.summarize(db, ALI)).mine, 1, 'جولة علي منفصلة');
    t.same((await q.summarize(db, ALI)).others.map((o) => [o.displayName, o.count]), [['حسن', 1]], 'جولة حسن تنعدّ له بلا تفاصيل');

    const report = await q.flush(db, ALI, transport(server, ALI.userId));
    t.eq(report.saved, 1, 'علي رفع جولته بس');
    t.eq(server.rows.get('f1|2026-10-15').by, ALI.userId, 'الصفّ باسم علي');
    t.eq((await q.summarize(db, HASAN)).mine, 1, 'جولة حسن باقية مختومة باسمه');

    const asHasan = await q.flush(db, HASAN, transport(server, HASAN.userId));
    t.eq(asHasan.review, 1, 'جولة حسن القديمة (base_version قديم) تروح لرفّ المراجعة');
    const shelf = await q.reviewEntries(db, HASAN);
    t.same([shelf.length, shelf[0]?.reason, shelf[0]?.op.payload.dead, shelf[0]?.server?.version], [1, 'stale_day', 7, 1], 'رفّ المراجعة بالنسختين');
    t.eq((await q.reviewEntries(db, ALI)).length, 0, 'رفّ حسن ما ينعرض لعلي');
    t.eq(server.rows.get('f1|2026-10-15').payload.dead, 2, 'ما داس على جولة علي');
  }

  // ٤) قبل كل رفع: الجلسة لازم تطابق المختوم، وإلا ما ينبعث شي.
  {
    const db = await open();
    const server = makeServer();
    await q.saveRound(db, ALI, day('f1', '2026-10-16', { dead: 1 }));
    const noSession = await q.flush(db, ALI, transport(server, null));
    const other = await q.flush(db, ALI, transport(server, HASAN.userId));
    t.same([noSession.stopped, other.stopped, server.calls.length], ['no_session', 'no_session', 0], 'بلا جلسة أو بجلسة غيره ما ينبعث شي');
  }

  // ٥) رفض الهويّة والاشتراك: تنتظر، ما تنحسب محاولة، وما تروح لرفّ المراجعة.
  for (const [kind, stopped] of [
    ['identity_rejected', 'identity'],
    ['subscription_expired', 'subscription'],
  ]) {
    const db = await open();
    const server = makeServer();
    await q.saveRound(db, ALI, day('f1', '2026-10-16', { dead: 1 }));
    const report = await q.flush(db, ALI, transport(server, ALI.userId, { send: () => ({ kind }) }));
    const summary = await q.summarize(db, ALI);
    const held = await readOps(db);
    const pending = await q.flush(db, ALI, transport(server, ALI.userId));
    t.same([report.stopped, summary.mine, summary.held], [stopped, 1, stopped], `${kind}: العملية تنتظر والرأس يعرف السبب`);
    t.same(held.map((op) => [op.state, op.attempts]), [[`held_${stopped}`, 0]], `${kind}: ما تنحسب محاولة`);
    t.eq((await q.reviewEntries(db, ALI)).length, 0, `${kind}: مو برفّ المراجعة`);
    t.eq(pending.saved, 1, `${kind}: ترتفع بعد ما ينحلّ`);
  }

  // ٦) جواب ضايع ثم تعديل لنفس (فوج + يوم): حفظتان، بلا رفّ مراجعة.
  {
    const db = await open();
    const server = makeServer();
    const first = await q.saveRound(db, ALI, day('f2', '2026-10-15', { dead: 4 }));
    const lost = await q.flush(db, ALI, transport(server, ALI.userId, {
      send: (op, srv) => {
        srv.apply(op);
        throw new Error('network');
      },
    }));
    t.eq(lost.stopped, 'network', 'الجواب ضاع بعد ما انحفظ بالخادم');
    t.same((await readOps(db)).map((op) => [op.state, op.attempts]), [['unknown', 1]], 'فشل الشبكة ينحسب محاولة والعملية صارت مجهولة');
    const edit = await q.saveRound(db, ALI, day('f2', '2026-10-15', { culled: 2 }, null));
    t.ok(edit.state === 'pending', 'التعديل عملية جديدة (السابقة مجهولة مو منتظرة)');
    const report = await q.flush(db, ALI, transport(server, ALI.userId));
    t.same([report.saved, report.review], [2, 0], 'حفظتان بلا رفّ مراجعة');
    t.same(server.rows.get('f2|2026-10-15'), { version: 2, by: ALI.userId, payload: { dead: 4, culled: 2 } }, 'التعديل اعتمد على النسخة اللي رجعت');
    t.eq(server.refs.size, 2, 'مرجعان بالخادم: ماكو تكرار');
    t.same(server.calls, [first.id, edit.id], 'الضايعة انحسمت بمرجعها بلا إعادة إرسال، والتعديل انبعث مرّة');
  }

  // ٧) سباق بين تبويبين على نفس الطابور: كل عملية تنرفع مرّة وحدة.
  {
    const db = await open();
    const server = makeServer();
    for (const onDate of ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']) await q.saveRound(db, ALI, day('f3', onDate, { dead: 1 }));
    const [a, b] = await Promise.all([q.flush(db, ALI, transport(server, ALI.userId)), q.flush(db, ALI, transport(server, ALI.userId))]);
    t.eq(a.saved + b.saved, 4, 'أربع جولات انحفظت');
    t.eq(server.calls.length, 4, 'ولا نداء مكرّر');
    t.eq((await q.summarize(db, ALI)).mine, 0, 'الطابور فرغ');
  }

  // ٨) نافذة ماتت وهي ماسكة عملية: بعد المهلة تنحسم بمرجعها أوّلاً.
  {
    const db = await open();
    const server = makeServer();
    const op = await q.saveRound(db, ALI, day('f4', '2026-10-15', { dead: 9 }));
    server.apply({ ...op }); // وصلت الخادم قبل ما تموت النافذة
    await putOp(db, { ...op, state: 'sending', claimToken: 'dead-tab', claimedAt: Date.now() });
    const early = await q.flush(db, ALI, transport(server, ALI.userId));
    t.eq(early.saved, 0, 'قبل المهلة: تبويب ثاني ماسكها، ما نمسّها');
    const later = await q.flush(db, ALI, transport(server, ALI.userId), () => Date.now() + q.STALE_CLAIM_MS + 1);
    t.eq(later.saved, 1, 'بعد المهلة: انحسمت');
    t.eq(server.calls.length, 1, 'انحسمت بالسؤال عن المرجع، بلا إعادة إرسال');
  }

  // ٩) الحساب تبدّل بنصّ السؤال عن المرجع: الهويّة تنفحص لصق الإرسال، فما ينبعث شي بجلسة غيره.
  {
    const db = await open();
    const server = makeServer();
    await q.saveRound(db, ALI, day('f5', '2026-10-15', { dead: 2 }));
    const offline = await q.flush(db, ALI, transport(server, ALI.userId, {
      send: () => {
        throw new Error('network');
      },
    }));
    t.eq(offline.stopped, 'network', 'الإرسال الأوّل فشل قبل ما يوصل، فالعملية مجهولة');
    let session = ALI.userId;
    const sentAs = [];
    const switching = {
      currentUserId: async () => session,
      lookup: async (op) => {
        session = HASAN.userId; // علي طلع وحسن دخل بنفس الجهاز والسؤال بالطريق
        return server.refs.get(op.id) ?? null;
      },
      send: async (op) => {
        sentAs.push({ opOwner: op.userId, sessionAtSend: session });
        return server.apply(op);
      },
    };
    const report = await q.flush(db, ALI, switching);
    t.same([report.stopped, report.saved, sentAs, server.calls.length], ['no_session', 0, [], 0], 'ولا إرسال بجلسة حسن');
    t.same(
      (await readOps(db)).map((op) => [op.state, op.attempts, op.claimToken, op.claimedAt]),
      [['unknown', 1, null, null]],
      'المسك يرجع لحالته قبله بلا ما ينحسب محاولة',
    );
    const back = await q.flush(db, ALI, transport(server, ALI.userId));
    t.same([back.saved, server.rows.get('f5|2026-10-15')?.by], [1, ALI.userId], 'لمّا يرجع علي ترتفع باسمه');
  }

  // ١٠) مسك مختوم بالمستقبل (ساعة الجهاز كانت قدّام ورجعت): ميّت مو حيّ، فما يسدّ العملية ولا تعديل يومها.
  {
    const db = await open();
    const server = makeServer();
    const realNow = Date.now();
    const op = await q.saveRound(db, ALI, day('f6', '2026-10-15', { dead: 3 }));
    server.apply({ ...op }); // وصلت الخادم قبل ما ينقتل التبويب
    await putOp(db, { ...op, state: 'sending', claimToken: 'dead-tab', claimedAt: realNow + 3 * 3_600_000 });
    const edit = await q.saveRound(db, ALI, day('f6', '2026-10-15', { culled: 1 }));
    t.ok(edit.id !== op.id, 'التعديل عملية جديدة (السابقة ممسوكة)');
    const report = await q.flush(db, ALI, transport(server, ALI.userId), () => realNow + 10 * 60_000);
    t.same([report.saved, report.stopped, (await q.summarize(db, ALI)).mine], [2, 'done', 0], 'المسك المستقبلي ما يسدّ: الجولتان ارتفعن');
    t.same(server.calls, [op.id, edit.id], 'المسك الميّت انحسم بمرجعه بلا إعادة إرسال');
  }

  // ١١) نسخة أحدث تفتح نفس القاعدة بنسخة 6 والطابور (نسخة 5 منذ 0037) مفتوح هنا: اتصالنا يتسكّر لحاله وما يسدّها.
  {
    const name = nextName();
    const db = await q.openOutbox(name);
    const newer = await within(
      new Promise((resolve) => {
        const request = globalThis.indexedDB.open(name, 6);
        request.onsuccess = () => {
          request.result.close();
          resolve('opened');
        };
        request.onerror = () => resolve(`error:${request.error?.name}`);
      }),
      1000,
      'blocked',
    );
    t.eq(newer, 'opened', 'النسخة الأحدث انفتحت والطابور القديم مفتوح');
    let closed = false;
    try {
      db.transaction('ops', 'readonly');
    } catch (error) {
      closed = error?.name === 'InvalidStateError';
    }
    t.ok(closed, 'اتصال الطابور انسكّر على versionchange');
  }

  // ١٢) تبويب قديم ما يسكّر لحاله يسدّ الفتح: هذا انتظار مو فشل، والفتح يكمّل أوّل ما يتسكّر.
  {
    const name = nextName();
    const holder = await rawOpen(name, 1);
    holder.onversionchange = () => setTimeout(() => holder.close(), 20);
    const outcome = await within(
      idb.openDatabase(name, 2, () => {}).then(
        (db) => {
          db.close();
          return 'opened';
        },
        (error) => `rejected:${error?.message}`,
      ),
      1000,
      'hung',
    );
    t.eq(outcome, 'opened', 'الفتح المسدود انتظر وانفتح بعد ما تسكّر التبويب القديم');
  }

  // ١٣) ترقية النسخة الجاية (6) على قاعدة هاي النسخة: ما تعيد بناء المخازن الموجودة، والعمليات تبقى.
  {
    const name = nextName();
    const v5 = await q.openOutbox(name);
    await q.saveRound(v5, ALI, day('f8', '2026-10-15', { dead: 1 }));
    v5.close();
    const upgraded = await idb.openDatabase(name, 6, queue.upgradeOutbox).then(
      async (db) => {
        const stores = Array.from(db.objectStoreNames).sort();
        const mine = (await q.summarize(db, ALI)).mine;
        db.close();
        return { stores, mine };
      },
      (error) => `rejected:${error?.name ?? error?.message}`,
    );
    t.same(upgraded, { stores: ['ops', 'review'], mine: 1 }, 'الترقية لنسخة 6 نجحت والجولة باقية');
  }

  // ١٣ب) M1 (مراجعة 0032): الطابور بنسخة 2، فنافذة بحزمة قبل 0032 (تفتحه بنسخة 1 وتعدّ كلّ عملية مجموع يوم: ترفع الزيارة بـsave_flock_day، وتدمج
  // مجموع يومها بزيارة منتظرة، وترفع نسخة إضافة جديدة) لا تشاركه: اتصالها المفتوح يصله versionchange فيتسكّر، وفتحها بعده بنسخة 1 يرفض بصوت؛ والقاعدة
  // القديمة تترقّى بعملياتها ورفّها كما هي.
  {
    const name = nextName();
    const old = await idb.openDatabase(name, 1, queue.upgradeOutbox); // الحزمة القديمة: نسخة 1، وversionchange يسكّرها (idb.ts كما كان)
    const kept = await q.saveRound(old, ALI, day('f30', '2026-11-16', { dead: 2 }));
    await putOp(old, { ...kept, id: 'old-visit-op', fn: 'save_flock_visit', payload: { visitId: 'v-old', recordedAt: '2026-11-16T09:40:00.000Z', dead: 1, culled: 0, feed_kg: null, eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null, void: false }, createdAt: kept.createdAt + 1 });
    const current = await within(q.openOutbox(name), 1000, 'blocked');
    t.eq(current === 'blocked' ? 'blocked' : current.version, 5, 'M1 الطابور ينفتح بنسخته (5) والنافذة القديمة مفتوحة (لا انسداد)');
    let oldClosed = false;
    try {
      old.transaction('ops', 'readonly');
    } catch (error) {
      oldClosed = error?.name === 'InvalidStateError';
    }
    t.ok(oldClosed, 'M1 اتصال النسخة 1 المفتوح يصله versionchange فيتسكّر');
    const reopen = await within(idb.openDatabase(name, 1, queue.upgradeOutbox).then((db) => { db.close(); return 'opened'; }, (error) => `rejected:${error?.name}`), 1000, 'hung');
    t.eq(reopen, 'rejected:VersionError', 'M1 فتح الحزمة القديمة بنسخة 1 بعد الترقية يرفض بصوت (لا ترفع ولا تدمج الزيارات)');
    if (current !== 'blocked') {
      const ops = await readOps(current);
      t.same([Array.from(current.objectStoreNames).sort(), ops.map((op) => [op.fn, op.payload.visitId ?? op.payload.dead]).sort()], [['ops', 'review'], [['save_flock_day', 2], ['save_flock_visit', 'v-old']]], 'M1 الترقية من 1 إلى 5 تُبقي المخزنين وكلّ العمليات كما هي');
      current.close();
    }
  }

  // ١٣ج) S2 (0035): الطابور بنسخة 3، فنافذة بحزمة قبل 0035 (نسخة 2: ترسل عملية الغاز بـsave_flock_day بلا خانات فتُعدّ «حُفظت» ويضيع الغاز، وتحذف
  // المركون بصمت) لا تشاركه: اتصالها يتسكّر، وفتحها بعده بنسخة 2 يرفض بصوت؛ والعمليات القديمة تبقى.
  {
    const name = nextName();
    const old = await idb.openDatabase(name, 2, queue.upgradeOutbox);
    await q.saveRound(old, ALI, day('f31', '2026-11-20', { dead: 4 }));
    const current = await within(q.openOutbox(name), 1000, 'blocked');
    t.eq(current === 'blocked' ? 'blocked' : current.version, 5, 'S2 الطابور ينفتح بنسخة 5 والنافذة بنسخة 2 مفتوحة');
    let oldClosed = false;
    try {
      old.transaction('ops', 'readonly');
    } catch (error) {
      oldClosed = error?.name === 'InvalidStateError';
    }
    t.ok(oldClosed, 'S2 اتصال النسخة 2 يصله versionchange فيتسكّر');
    const reopen = await within(idb.openDatabase(name, 2, queue.upgradeOutbox).then((db) => { db.close(); return 'opened'; }, (error) => `rejected:${error?.name}`), 1000, 'hung');
    t.eq(reopen, 'rejected:VersionError', 'S2 فتح حزمة قبل 0035 بنسخة 2 بعد الترقية يرفض بصوت (لا ترسل الغاز بغير دالّته)');
    if (current !== 'blocked') {
      t.same((await readOps(current)).map((op) => [op.fn, op.payload.dead]), [['save_flock_day', 4]], 'S2 الترقية من 2 إلى 5 تُبقي العمليات');
      current.close();
    }
  }

  // ١٤) كل حفظ جولة يسأل persisted()، وإذا false يطلب persist().
  {
    const db = await open();
    const asked = { persisted: 0, persist: 0 };
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        storage: {
          persisted: async () => {
            asked.persisted += 1;
            return false;
          },
          persist: async () => {
            asked.persist += 1;
            return false;
          },
        },
      },
    });
    try {
      await q.saveRound(db, ALI, day('f7', '2026-10-15', { dead: 1 }));
      await tick();
      t.same(asked, { persisted: 1, persist: 1 }, 'حفظ الجولة سأل persisted() وطلب persist()');
      await q.saveRound(db, ALI, day('f7', '2026-10-16', { dead: 1 }));
      await tick();
      t.eq(asked.persisted, 2, 'ينسأل بكل حفظ، مو مرّة وحدة');
    } finally {
      if (original) Object.defineProperty(globalThis, 'navigator', original);
      else delete globalThis.navigator;
    }
  }

  // ١٥) عمليتان منتظرتان لنفس اليوم (وحدة رجعت للانتظار بلا ما تنبعث): التعديل الجديد يندمج بالأحدث،
  // فالقيمة الأخيرة هي اللي تبقى بالخادم. الدمج بالأقدم كان يرفعها أوّل وتدوسها القديمة (22 من 40 مرّة).
  {
    const db = await open();
    const server = makeServer();
    // المعرّفات مثبّتة: بالفهرس العمليات المتساوية تترتّب بالمعرّف، والأقدم هنا أوّل — الحالة اللي يخرب بيها الدمج بالأقدم.
    const ids = ['00000000-0000-4000-8000-000000000001', 'ffffffff-ffff-4fff-bfff-ffffffffffff'];
    const realUuid = crypto.randomUUID;
    crypto.randomUUID = () => ids.shift() ?? realUuid.call(crypto);
    let first;
    let second;
    try {
      first = await q.saveRound(db, ALI, day('f9', '2026-10-15', { dead: 1 }));
      await putOp(db, { ...first, state: 'sending', claimToken: 'tab-a', claimedAt: Date.now() });
      second = await q.saveRound(db, ALI, day('f9', '2026-10-15', { dead: 2 }));
    } finally {
      crypto.randomUUID = realUuid;
    }
    await putOp(db, { ...first, state: 'pending', claimToken: null, claimedAt: null }); // رجعت للانتظار بلا إرسال
    const latest = await q.saveRound(db, ALI, day('f9', '2026-10-15', { dead: 3 }));
    t.eq(latest.id, second.id, 'التعديل الأخير اندمج بأحدث عملية');
    const report = await q.flush(db, ALI, transport(server, ALI.userId));
    t.same([report.saved, server.rows.get('f9|2026-10-15')?.payload.dead], [2, 3], 'آخر قيمة كتبها العامل هي اللي بالخادم');
  }

  // ─── 0032: الزيارات (save_flock_visit) ──────────────────────────────────────────────────────────────────────────────────
  const visitContent = (visitId, over = {}) => ({ visitId, recordedAt: '2026-11-17T09:40:00.000Z', dead: 0, culled: 0, feed_kg: null, eggs_total: null, eggs_cracked: null, eggs_broken: null, note: null, void: false, ...over });
  const visit = (flockId, onDate, payload, baseVersion = null) => ({ fn: 'save_flock_visit', flockId, day: onDate, payload, baseVersion });

  // ١٦) زيارتان لنفس (الفوج، اليوم) عمليتان منفصلتان (تُجمعان بالخادم)، وتعديل زيارة لم تُرفع يحلّ محلّ محتواها كاملاً، وإلغاؤها يحذف عمليتها.
  {
    const db = await open();
    t.eq(db.version, 5, 'V16 قاعدة الطابور بنسختها (5 منذ 0037)، والحقول داخل payload بلا مخزن جديد');
    const a = await q.saveRound(db, ALI, visit('f20', '2026-11-17', visitContent('va', { dead: 3, feed_kg: '50.000' })));
    const b = await q.saveRound(db, ALI, visit('f20', '2026-11-17', visitContent('vb', { dead: 2 })));
    t.same([a.fn, b.fn, a.id !== b.id, (await readOps(db)).length], ['save_flock_visit', 'save_flock_visit', true, 2], 'V16 زيارتان مختلفتان لليوم نفسه: عمليتان (لا دمج بين زيارتين)');
    const edit = await q.saveRound(db, ALI, visit('f20', '2026-11-17', visitContent('va', { dead: 4 })));
    const ops = await readOps(db);
    t.same([edit.id, ops.length, ops.find((op) => op.id === a.id)?.payload.dead, ops.find((op) => op.id === a.id)?.payload.feed_kg, ops.find((op) => op.id === a.id)?.baseVersion], [a.id, 2, 4, null, null], 'V16 تعديل زيارة لم تُرفع يحلّ محلّ محتواها كاملاً (العلف الفارغ فارغ، لا دمج بـ«بلا تغيير»)، ويبقى إضافةً');
    const dropped = await q.saveRound(db, ALI, visit('f20', '2026-11-17', visitContent('vb', { dead: 2, void: true })));
    t.same([dropped, (await readOps(db)).map((op) => op.payload.visitId)], [null, ['va']], 'V16 إلغاء زيارة جديدة لم تُرفع يحذف عمليتها (لا شيء يُرسل)');
    await t.rejects(q.saveRound(db, ALI, visit('f20', '2026-11-17', { ...visitContent(''), visitId: '' })), 'V16 زيارة بلا معرّف لا تدخل الطابور', /not_queueable/);
    const server = makeServer();
    const report = await q.flush(db, ALI, transport(server, ALI.userId));
    t.same([report.saved, server.visits.get('va')?.payload.dead, server.visits.has('vb')], [1, 4, false], 'V16 الرفع: الزيارة بمحتواها الأخير، والملغاة قبل رفعها لم تصل');
  }

  // ١٦ب) M2 (مراجعة 0032): «عدّل» أو «ألغِ» لزيارة على هذا الجهاز وقد رُفعت إضافتها والنافذة مفتوحة (عمليتها خرجت من الطابور): عملية بنسخة 1، لا
  // «أُلغيت قبل أن تُرسل» (null) والزيارة بالخادم، ولا إضافة ثانية لمعرّف موجود (stale_visit). null وحده لحذف عملية منتظرة.
  {
    const db = await open();
    const server = makeServer();
    await q.saveRound(db, ALI, visit('f24', '2026-11-17', visitContent('vg', { dead: 3 })));
    await q.saveRound(db, ALI, visit('f24', '2026-11-17', visitContent('vh', { dead: 1 })));
    t.eq((await q.flush(db, ALI, transport(server, ALI.userId))).saved, 2, 'V16ب ضابط: الإضافتان رُفعتا (نسخة 1)');
    const voided = await q.saveRound(db, ALI, { ...visit('f24', '2026-11-17', visitContent('vg', { dead: 3, void: true })), amend: true });
    const edited = await q.saveRound(db, ALI, { ...visit('f24', '2026-11-17', visitContent('vh', { dead: 2 })), amend: true });
    t.same([voided?.payload.void, voided?.baseVersion, edited?.payload.dead, edited?.baseVersion], [true, 1, 2, 1], 'V16ب الإلغاء والتعديل عمليتان بنسخة 1 (لا null ولا إضافة)');
    const report = await q.flush(db, ALI, transport(server, ALI.userId));
    t.same([report.saved, report.review, server.visits.get('vg')?.voided, server.visits.get('vh')?.payload.dead, server.visits.get('vh')?.version], [2, 0, true, 2, 2], 'V16ب الخادم: أُلغيت الأولى وعُدّلت الثانية بلا رفّ مراجعة');
    // الإلغاء تعديل دائماً (ولو بلا amend)، وزيارة لم تصل الخادم: stale_visit بـnull إلى الرفّ.
    const gone = await q.saveRound(db, ALI, visit('f24', '2026-11-17', visitContent('vz', { void: true })));
    t.same([gone?.baseVersion, gone?.payload.void], [1, true], 'V16ب إلغاء بلا عملية بالجهاز: عملية بنسخة 1');
    const missing = await q.flush(db, ALI, transport(server, ALI.userId));
    const shelf = await q.reviewEntries(db, ALI);
    t.same([missing.review, shelf[0]?.reason, shelf[0]?.server], [1, 'stale_visit', null], 'V16ب وزيارة لم تصل الخادم: stale_visit بـnull في الرفّ');
    // ضابط: تعديل والإضافة في الطريق (ممسوكة) بنسخة null، وحفظها يرفعها؛ وزيارة جديدة (بلا amend) نسختها null.
    const add = await q.saveRound(db, ALI, visit('f25', '2026-11-17', visitContent('vi', { dead: 1 })));
    await putOp(db, { ...add, state: 'sending', claimToken: 'tab-a', claimedAt: Date.now() });
    const behind = await q.saveRound(db, ALI, { ...visit('f25', '2026-11-17', visitContent('vi', { dead: 4 })), amend: true });
    const fresh = await q.saveRound(db, ALI, visit('f25', '2026-11-17', visitContent('vj', { dead: 1 })));
    t.same([behind?.id !== add.id, behind?.baseVersion, fresh?.baseVersion], [true, null, null], 'V16ب ضابط: التعديل خلف إضافة في الطريق بنسخة null، والزيارة الجديدة null');
  }

  // ١٧) لا دمج بين زيارة ومجموع اليوم: الزيارة لا تندمج بعملية save_flock_day المنتظرة، ومجموع اليوم بعد زيارة عملية جديدة (لا يندمج بالأقدم فيسبق
  // الزيارة)؛ ومجموع اليوم بعد مجموع اليوم يندمج كما كان.
  {
    const db = await open();
    const d1 = await q.saveRound(db, ALI, day('f21', '2026-11-17', { dead: 5 }));
    const v = await q.saveRound(db, ALI, visit('f21', '2026-11-17', visitContent('vc', { dead: 1 })));
    t.ok(v.id !== d1.id && v.fn === 'save_flock_visit', 'V17 الزيارة لا تندمج بمجموع اليوم المنتظر');
    const d2 = await q.saveRound(db, ALI, day('f21', '2026-11-17', { culled: 2 }));
    t.ok(d2.id !== d1.id && d2.id !== v.id, 'V17 مجموع اليوم بعد زيارة عملية جديدة (الترتيب كما كُتب)');
    const d3 = await q.saveRound(db, ALI, day('f21', '2026-11-17', { dead: 7 }));
    t.same([d3.id, d3.payload], [d2.id, { culled: 2, dead: 7 }], 'V17 ومجموع اليوم بعد مجموع اليوم يندمج بقاعدته القديمة');
    t.same((await readOps(db)).sort((x, y) => x.createdAt - y.createdAt).map((op) => op.fn), ['save_flock_day', 'save_flock_visit', 'save_flock_day'], 'V17 ثلاث عمليات بترتيبها');
  }

  // ١٨) حفظ زيارة يرفع النسخة للعمليات اللاحقة لنفس الزيارة وحدها: تعديل كُتب والإضافة في الطريق يأخذ نسختها، ولا تمسّ زيارة أخرى ولا مجموع اليوم.
  {
    const db = await open();
    const server = makeServer();
    const add = await q.saveRound(db, ALI, visit('f22', '2026-11-17', visitContent('vd', { dead: 3 })));
    await putOp(db, { ...add, state: 'sending', claimToken: 'tab-a', claimedAt: Date.now() - q.STALE_CLAIM_MS - 1 });
    const edit = await q.saveRound(db, ALI, visit('f22', '2026-11-17', visitContent('vd', { dead: 1 })));
    const other = await q.saveRound(db, ALI, visit('f22', '2026-11-17', visitContent('ve', { culled: 1 })));
    const total = await q.saveRound(db, ALI, day('f22', '2026-11-17', { feed_kg: '10.000' }));
    t.same([edit.id !== add.id, edit.baseVersion, other.baseVersion, total.baseVersion], [true, null, null, null], 'V18 ضابط: تعديل الإضافة الممسوكة عملية جديدة بنسخة null');
    const sent = [];
    const report = await q.flush(db, ALI, transport(server, ALI.userId, {
      send: async (op, srv) => {
        sent.push([op.payload.visitId ?? 'day', op.baseVersion]);
        return srv.apply(op);
      },
    }));
    t.same(sent, [['vd', null], ['vd', 1], ['ve', null], ['day', null]], 'V18 الإضافة ثمّ التعديل بنسختها (1)، والزيارة الأخرى ومجموع اليوم بنسختهما (null)');
    t.same([report.saved, report.review, server.visits.get('vd')?.payload.dead, server.visits.get('vd')?.version], [4, 0, 1, 2], 'V18 كلّها حُفظت بلا رفّ مراجعة، والزيارة بتعديلها ونسختها 2');
  }

  // ١٨ب) مراجعة 0035 (M2): زيارة حُفظت تغيّر صفّ اليوم، فنسخته بعدها (day.version من جوابها) ترتفع لعمليات مجموع اليوم بعدها لنفس اليوم؛ كانت
  // تبقى بنسختها القديمة فتُرَدّ stale_day وهي كُتبت على ما يراه صاحبها. ولا تمسّ عمليات الغاز ولا يوماً آخر، وزيارة بلا صفّ بعدها (day: null) لا ترفع شيئاً.
  {
    const db = await open();
    const visitThenDay = await q.saveRound(db, ALI, visit('f26', '2026-11-18', visitContent('vk', { dead: 2 })));
    const dayAfter = await q.saveRound(db, ALI, day('f26', '2026-11-18', { note: 'بعد الزيارة' }, 3));
    const gasAfter = await q.saveRound(db, ALI, { fn: 'set_flock_gas', flockId: 'f26', day: '2026-11-18', payload: { cylinders: 2 }, baseVersion: null });
    const otherDay = await q.saveRound(db, ALI, day('f26', '2026-11-19', { dead: 1 }, null));
    t.ok(visitThenDay.id !== dayAfter.id, 'V18ب ضابط: مجموع اليوم بعد الزيارة عملية مستقلّة');
    const sent = [];
    const report = await q.flush(db, ALI, {
      currentUserId: async () => ALI.userId,
      send: async (op) => {
        sent.push([op.fn, op.day, op.baseVersion]);
        if (op.fn === 'save_flock_visit') return { kind: 'saved', version: 1, visit: {}, day: { on_date: op.day, version: 5, dead: 2 } };
        if (op.fn === 'save_flock_day') return op.baseVersion === (op.day === '2026-11-18' ? 5 : null) ? { kind: 'saved', version: 6 } : { kind: 'stale_day', server: { version: 5 } };
        return op.baseVersion === null ? { kind: 'saved', version: 1 } : { kind: 'stale_gas', server: { on: op.day, cylinders: null, version: 1 } };
      },
      lookup: async () => null,
    });
    t.same(
      [sent.filter(([, on]) => on === '2026-11-18'), sent.filter(([, on]) => on !== '2026-11-18'), report.saved, report.review, gasAfter.baseVersion, otherDay.baseVersion],
      [[['save_flock_visit', '2026-11-18', null], ['save_flock_day', '2026-11-18', 5], ['set_flock_gas', '2026-11-18', null]], [['save_flock_day', '2026-11-19', null]], 4, 0, null, null],
      'V18ب مجموع اليوم بعد زيارة حُفظت يرتفع إلى نسخة صفّ اليوم في جوابها (5)، والغاز واليوم الآخر بنسختيهما، فلا رفّ مراجعة',
    );
    const lone = await open();
    await q.saveRound(lone, ALI, visit('f27', '2026-11-18', visitContent('vl', { dead: 1, void: true }), 2));
    await q.saveRound(lone, ALI, day('f27', '2026-11-18', { dead: 4 }, 3));
    const seen = [];
    await q.flush(lone, ALI, { currentUserId: async () => ALI.userId, send: async (op) => (seen.push(op.baseVersion), op.fn === 'save_flock_visit' ? { kind: 'saved', version: 3, visit: {}, day: null } : { kind: 'saved', version: 4 }), lookup: async () => null });
    t.same(seen, [2, 3], 'V18ب زيارة بلا صفّ يوم بعدها (day: null): مجموع اليوم بنسخته كما كُتب');
    t.same([q.visitDayVersion({ version: 7 }), q.visitDayVersion(null), q.visitDayVersion({ version: '7' }), q.visitDayVersion({ version: 0 })], [7, null, null, null], 'V18ب نسخة صفّ اليوم من جواب الزيارة بنوعها');
  }

  // ١٩) stale_visit لرفّ المراجعة بالنسختين، وما ينحذف.
  {
    const db = await open();
    const server = makeServer();
    server.visits.set('vf', { version: 3, voided: false, by: HASAN.userId, payload: visitContent('vf', { dead: 9 }) });
    await q.saveRound(db, ALI, visit('f23', '2026-11-17', visitContent('vf', { dead: 2 }), 2));
    const report = await q.flush(db, ALI, transport(server, ALI.userId));
    const shelf = await q.reviewEntries(db, ALI);
    t.same([report.review, shelf[0]?.reason, shelf[0]?.op.payload.dead, shelf[0]?.server?.payload?.dead, (await q.summarize(db, ALI)).mine], [1, 'stale_visit', 2, 9, 0], 'V19 تعديل بنسخة قديمة: رفّ المراجعة بـ«زيارتك» و«المحفوظة»');
  }

  // ─── 0035: غاز اليوم (set_flock_gas) والمركون على الجهاز ───────────────────────────────────────────────────────────────
  const gas = (flockId, onDate, cylinders, baseVersion = null) => ({ fn: 'set_flock_gas', flockId, day: onDate, payload: { cylinders }, baseVersion });
  /** خادم غاز: صفّ لكلّ (فوج، يوم) بنسخته، والنسخة المختلفة stale_gas بقيمته، والمرجع يعيد أوّل جواب. */
  const gasServer = () => {
    const rows = new Map();
    const refs = new Map();
    const sent = [];
    return {
      rows,
      sent,
      apply(op) {
        sent.push(op);
        if (refs.has(op.id)) return refs.get(op.id);
        const key = `${op.flockId}|${op.day}`;
        const row = rows.get(key) ?? null;
        let result;
        if ((row?.version ?? null) !== op.baseVersion) result = { kind: 'stale_gas', server: { on: op.day, cylinders: row?.cylinders ?? null, version: row?.version ?? 1 } };
        else {
          const version = (row?.version ?? 0) + 1;
          rows.set(key, { version, cylinders: op.payload.cylinders });
          result = { kind: 'saved', version };
        }
        refs.set(op.id, result);
        return result;
      },
    };
  };

  // G1) غازان لليوم نفسه قبل الرفع يندمجان بأحدثهما (القيمة الأحدث، والنسخة الأولى)، ولا يندمجان بمجموع اليوم ولا يقطعان دمجه.
  {
    const db = await open();
    const d1 = await q.saveRound(db, ALI, day('g1', '2026-11-20', { dead: 3 }, 2));
    const g1 = await q.saveRound(db, ALI, gas('g1', '2026-11-20', 4, 1));
    const g2 = await q.saveRound(db, ALI, gas('g1', '2026-11-20', 5, 7));
    const d2 = await q.saveRound(db, ALI, day('g1', '2026-11-20', { note: 'تهوية' }, 9));
    const ops = await readOps(db);
    t.same(
      [g2.id === g1.id, d2.id === d1.id, ops.length, ops.find((op) => op.fn === 'set_flock_gas')?.payload.cylinders, ops.find((op) => op.fn === 'set_flock_gas')?.baseVersion, ops.find((op) => op.fn === 'save_flock_day')?.payload],
      [true, true, 2, 5, 1, { dead: 3, note: 'تهوية' }],
      'G1 الغاز يندمج بأحدث غاز منتظر لليوم (5 بنسخة 1)، ومجموع اليوم يندمج بمجموعه رغم الغاز بينهما',
    );
    await q.saveRound(db, ALI, gas('g1', '2026-11-20', null, 1)).then(() => undefined);
    t.eq((await readOps(db)).find((op) => op.fn === 'set_flock_gas')?.payload.cylinders, null, 'G1 مسح الغاز (null) يحلّ محلّ القيمة');
    let refused = null;
    await q.saveRound(db, ALI, gas('g1', '2026-11-21', 1001, null)).catch((error) => {
      refused = error?.code;
    });
    t.eq(refused, 'not_queueable', 'G1 قناني أكثر من 1,000 لا تدخل الطابور');
  }

  // G2) الرفع: الغاز بدالّته ونسخته، والنسخة المحفوظة ترتفع لعملية غاز بعده لليوم نفسه (وحدها)، وstale_gas لرفّ المراجعة بقيمة الخادم.
  {
    const db = await open();
    const server = gasServer();
    const first = await q.saveRound(db, ALI, gas('g2', '2026-11-20', 3, null));
    // عملية في الطريق: الثانية لا تندمج بها فتبقى عملية بعدها بنسخة null، وحفظ الأولى يرفعها إلى 1.
    await putOp(db, { ...first, state: 'unknown' });
    const second = await q.saveRound(db, ALI, gas('g2', '2026-11-20', 4, null));
    const dayOp = await q.saveRound(db, ALI, day('g2', '2026-11-20', { dead: 1 }, null));
    t.ok(second.id !== first.id && dayOp.fn === 'save_flock_day', 'G2 ضابط: غاز ثانٍ بعد عملية في الطريق عملية مستقلّة');
    const report = await q.flush(db, ALI, { currentUserId: async () => ALI.userId, send: async (op) => (op.fn === 'set_flock_gas' ? server.apply(op) : { kind: 'saved', version: 1 }), lookup: async () => null });
    t.same([report.saved, report.review, server.sent.map((op) => [op.payload.cylinders, op.baseVersion]), server.rows.get('g2|2026-11-20')], [3, 0, [[3, null], [4, 1]], { version: 2, cylinders: 4 }], 'G2 الغاز الثاني ارتفع بنسخة الأوّل (1)، ونسخة مجموع اليوم لا تدخله');
    await q.saveRound(db, ALI, gas('g2', '2026-11-20', 9, 1));
    const stale = await q.flush(db, ALI, { currentUserId: async () => ALI.userId, send: async (op) => server.apply(op), lookup: async () => null });
    const shelf = await q.reviewEntries(db, ALI);
    t.same([stale.review, shelf[0]?.reason, shelf[0]?.op.payload.cylinders, shelf[0]?.server?.cylinders], [1, 'stale_gas', 9, 4], 'G2 نسخة قديمة: stale_gas في رفّ المراجعة بقيمتك وقيمة الخادم');
  }

  // G3) المركون يبقى على الجهاز في رفّ المراجعة بسببه (كان يُحذف بصمت)، و«احذفه» يحذفه لصاحبه وحده.
  {
    const db = await open();
    await q.saveRound(db, ALI, gas('g3', '2026-11-01', 2, null));
    await q.saveRound(db, ALI, day('g3', '2026-11-02', { dead: 6 }, null));
    const report = await q.flush(db, ALI, { currentUserId: async () => ALI.userId, send: async (op) => ({ kind: 'parked', reason: op.fn === 'set_flock_gas' ? 'period_locked' : 'flock_closed' }), lookup: async () => null });
    const shelf = (await q.reviewEntries(db, ALI)).sort((a, b) => a.op.day.localeCompare(b.op.day));
    t.same(
      [report.parked, report.review, (await q.summarize(db, ALI)).mine, shelf.map((entry) => [entry.reason, entry.hint, entry.op.fn])],
      [2, 0, 0, [['parked', 'period_locked', 'set_flock_gas'], ['parked', 'flock_closed', 'save_flock_day']]],
      'G3 المركونان خرجا من الطابور إلى الرفّ بسببيهما، ولا شيء ضاع',
    );
    t.eq(await q.removeReview(db, HASAN, shelf[0].id), false, 'G3 غير صاحبه لا يحذف من رفّه');
    t.eq(await q.removeReview(db, ALI, shelf[0].id), true, 'G3 «احذفه» لصاحبه');
    t.same((await q.reviewEntries(db, ALI)).map((entry) => entry.op.fn), ['save_flock_day'], 'G3 حُذف ما اختاره وحده');
  }

  // ─── 0036 (الجولة): هلاكات اليوم مرّة (set_flock_dead) وقناني تُضاف (add_flock_gas) ─────────────────────────────────────────────
  const dead = (flockId, onDate, n) => ({ fn: 'set_flock_dead', flockId, day: onDate, payload: { dead: n }, baseVersion: null });
  const gasAdd = (flockId, onDate, n) => ({ fn: 'add_flock_gas', flockId, day: onDate, payload: { add: n }, baseVersion: null });

  // D1) القائمة والحدود: الدالّتان تدخلان الطابور، والهلاكات عدد صحيح بحدود الخادم، والإضافة قنينة على الأقلّ وحتى 1,000، ولا نسخة لأيّهما.
  {
    const db = await open();
    t.ok(q.QUEUEABLE_FUNCTIONS.includes('set_flock_dead') && q.QUEUEABLE_FUNCTIONS.includes('add_flock_gas'), 'D1 الدالّتان في قائمة الطابور');
    const refusedOf = async (input) => q.saveRound(db, ALI, input).then(() => 'queued', (error) => error?.code ?? error?.message);
    t.same(
      [
        await refusedOf(dead('d1', '2026-11-24', -1)),
        await refusedOf(dead('d1', '2026-11-24', 1.5)),
        await refusedOf(dead('d1', '2026-11-24', '3')),
        await refusedOf(dead('d1', '2026-11-24', 10_000_001)),
        await refusedOf({ ...dead('d1', '2026-11-24', 3), baseVersion: 2 }),
        await refusedOf(gasAdd('d1', '2026-11-24', 0)),
        await refusedOf(gasAdd('d1', '2026-11-24', 1001)),
        await refusedOf({ ...gasAdd('d1', '2026-11-24', 1), baseVersion: 1 }),
        await refusedOf(dead('d1', '2026-11-24', 0)),
        await refusedOf(gasAdd('d1', '2026-11-24', 1000)),
      ],
      ['not_queueable', 'not_queueable', 'not_queueable', 'not_queueable', 'not_queueable', 'not_queueable', 'not_queueable', 'not_queueable', 'queued', 'queued'],
      'D1 الهلاكات السالبة والكسر والنصّ وفوق عشرة ملايين، والإضافة صفراً وفوق 1,000، وأيّ نسخة: لا تدخل؛ والصفر هلاكاتٍ و1,000 قنينة تدخلان',
    );
  }

  // D2) الدمج: هلاكات اليوم الأحدث تحلّ محلّ المنتظرة (لا تُجمع)؛ والإضافات المنتظرة تُجمع في عملية واحدة؛ وما في الطريق أو مجهول النتيجة لا يُمسّ (عملية
  // بجنبه)؛ والإضافة فوق 1,000 مع المنتظرة عملية بجنبها؛ ولا يندمج نوع بنوع ولا قاعة بقاعة.
  {
    const db = await open();
    const d1 = await q.saveRound(db, ALI, dead('d2', '2026-11-24', 5));
    const d2 = await q.saveRound(db, ALI, dead('d2', '2026-11-24', 7));
    const g1 = await q.saveRound(db, ALI, gasAdd('d2', '2026-11-24', 2));
    const g2 = await q.saveRound(db, ALI, gasAdd('d2', '2026-11-24', 1));
    const other = await q.saveRound(db, ALI, gasAdd('d2b', '2026-11-24', 4));
    t.same([d2.id === d1.id, d2.payload, g2.id === g1.id, g2.payload, other.id !== g1.id], [true, { dead: 7 }, true, { add: 3 }, true], 'D2 الهلاكات 7 تحلّ محلّ 5 (عملية واحدة)، والقناني 2 + 1 = 3 في عملية واحدة، وقاعة أخرى عمليتها');
    await putOp(db, { ...g2, state: 'unknown' });
    await putOp(db, { ...d2, state: 'sending', claimToken: 'tab-b', claimedAt: Date.now() });
    const g3 = await q.saveRound(db, ALI, gasAdd('d2', '2026-11-24', 2));
    const d3 = await q.saveRound(db, ALI, dead('d2', '2026-11-24', 8));
    t.same([g3.id !== g2.id, g3.payload, d3.id !== d2.id, d3.payload], [true, { add: 2 }, true, { dead: 8 }], 'D2 إضافة بعد إضافة مجهولة النتيجة، وهلاكات بعد هلاكات في الطريق: عمليتان بجنبهما (لا تُمسّ المُرسلة)');
    const g4 = await q.saveRound(db, ALI, gasAdd('d2', '2026-11-24', 999));
    t.same([g4.id !== g3.id, g4.payload], [true, { add: 999 }], 'D2 2 + 999 فوق 1,000: عملية بجنبها');
    const ops = (await readOps(db)).filter((op) => op.flockId === 'd2').sort((a, b) => a.createdAt - b.createdAt);
    t.same(ops.map((op) => [op.fn, op.payload.dead ?? op.payload.add, op.state]), [['set_flock_dead', 7, 'sending'], ['add_flock_gas', 3, 'unknown'], ['add_flock_gas', 2, 'pending'], ['set_flock_dead', 8, 'pending'], ['add_flock_gas', 999, 'pending']], 'D2 العمليات بترتيبها، ولا شيء ضاع');
  }

  // D3) هلاكات اليوم تقطع دمج مجموع اليوم (تغيّر صفّه): مجموع اليوم بعدها عملية جديدة لا تندمج بالأقدم فتسبقها؛ والإضافة لا تقطعه.
  {
    const db = await open();
    const day1 = await q.saveRound(db, ALI, day('d3', '2026-11-24', { note: 'صباحاً' }));
    await q.saveRound(db, ALI, gasAdd('d3', '2026-11-24', 1));
    const day2 = await q.saveRound(db, ALI, day('d3', '2026-11-24', { note: 'تهوية' }));
    await q.saveRound(db, ALI, dead('d3', '2026-11-24', 2));
    const day3 = await q.saveRound(db, ALI, day('d3', '2026-11-24', { dead: 4 }));
    t.same([day2.id === day1.id, day3.id !== day1.id], [true, true], 'D3 الإضافة بين مجموعَي اليوم لا تقطع دمجهما، وهلاكات اليوم تقطعه');
  }

  // D4) الرفع: كلّ دالّة بمرجعها؛ dead_recorded إلى رفّ المراجعة بصفّ اليوم كما هو؛ والنسخة بعد الحفظ ترتفع لما يرتبط بها وحده: صفّ اليوم بعد الهلاكات
  // لمجموع اليوم بعدها، وصفّ الغاز بعد الإضافة لتصحيح الغاز بعدها؛ ولا نسخة لهلاكات ولا لإضافة.
  {
    const db = await open();
    await q.saveRound(db, ALI, dead('d4', '2026-11-24', 6));
    await q.saveRound(db, ALI, gasAdd('d4', '2026-11-24', 2));
    await q.saveRound(db, ALI, day('d4', '2026-11-24', { note: 'بعد الهلاكات' }, 1));
    await q.saveRound(db, ALI, { fn: 'set_flock_gas', flockId: 'd4', day: '2026-11-24', payload: { cylinders: 1 }, baseVersion: null });
    await q.saveRound(db, ALI, dead('d4b', '2026-11-24', 9));
    const sent = [];
    const recorded = { on_date: '2026-11-24', version: 3, dead: 4, culled: 1, dead_entered: true };
    const report = await q.flush(db, ALI, {
      currentUserId: async () => ALI.userId,
      send: async (op) => {
        sent.push([op.fn, op.flockId, op.baseVersion]);
        if (op.fn === 'set_flock_dead') return op.flockId === 'd4' ? { kind: 'saved', version: 4, day: { on_date: op.day, version: 4, dead: 6, culled: 0, dead_entered: true } } : { kind: 'dead_recorded', server: recorded };
        if (op.fn === 'add_flock_gas') return { kind: 'saved', version: 7, gas: { on: op.day, cylinders: 5, version: 7 } };
        if (op.fn === 'save_flock_day') return op.baseVersion === 4 ? { kind: 'saved', version: 5 } : { kind: 'stale_day', server: { version: 4 } };
        return op.baseVersion === 7 ? { kind: 'saved', version: 8 } : { kind: 'stale_gas', server: { on: op.day, cylinders: 5, version: 7 } };
      },
      lookup: async () => null,
    });
    t.same(
      [sent.filter(([, flockId]) => flockId === 'd4'), sent.filter(([, flockId]) => flockId === 'd4b')],
      [[['set_flock_dead', 'd4', null], ['add_flock_gas', 'd4', null], ['save_flock_day', 'd4', 4], ['set_flock_gas', 'd4', 7]], [['set_flock_dead', 'd4b', null]]],
      'D4 ترتيب كلّ يوم كما كُتب: مجموع اليوم بنسخة صفّه بعد الهلاكات (4)، وتصحيح الغاز بنسخة صفّه بعد الإضافة (7)، والهلاكات والإضافة بلا نسخة',
    );
    const shelf = await q.reviewEntries(db, ALI);
    t.same([report.saved, report.review, shelf.map((entry) => [entry.reason, entry.op.fn, entry.op.payload.dead, entry.server?.dead, entry.server?.culled])], [4, 1, [['dead_recorded', 'set_flock_dead', 9, 4, 1]]], 'D4 dead_recorded إلى رفّ المراجعة بما كتبته وصفّ اليوم كما سُجّل، والباقي حُفظ');
    t.eq((await q.summarize(db, ALI)).mine, 0, 'D4 الطابور فارغ');
  }

  // D5) الإعادة بالمرجع: إضافة نتيجتها مجهولة تُحسم بمرجعها نفسه (لا تُرسل إضافة ثانية)، ومحفوظةٌ بعد الحسم.
  {
    const db = await open();
    const add = await q.saveRound(db, ALI, gasAdd('d5', '2026-11-24', 2));
    const refs = new Map();
    const totals = new Map();
    const apply = (op) => {
      if (refs.has(op.id)) return refs.get(op.id);
      const total = (totals.get(op.flockId) ?? 0) + op.payload.add;
      totals.set(op.flockId, total);
      const result = { kind: 'saved', version: 1, gas: { on: op.day, cylinders: total, version: 1 } };
      refs.set(op.id, result);
      return result;
    };
    let drop = true;
    const first = await q.flush(db, ALI, {
      currentUserId: async () => ALI.userId,
      send: async (op) => {
        apply(op);
        if (drop) throw new Error('network');
        return apply(op);
      },
      lookup: async () => null,
    });
    drop = false;
    const second = await q.flush(db, ALI, { currentUserId: async () => ALI.userId, send: async (op) => apply(op), lookup: async () => null });
    t.same([first.stopped, second.saved, totals.get('d5'), refs.size, (await q.summarize(db, ALI)).mine, add.payload.add], ['network', 1, 2, 1, 0, 2], 'D5 جواب ضاع ثمّ الإعادة بالمرجع نفسه: المجموع 2 لا 4');
  }

  // D6) مراجعة 0036 R3: «احفظ الجولة» بمعاملة واحدة (saveRounds): قواعد الدمج نفسها داخلها (ومع ما كُتب قبلها فيها)، وفشل كتابة في منتصفها لا يُبقي
  // شيئاً، وعملية لا تدخل الطابور ترفض الجولة كلّها قبل أيّ كتابة.
  {
    const db = await open();
    t.eq(typeof q.enqueueAll, 'undefined', 'D6 enqueueAll مو مصدّر للشاشات: saveRounds بس');
    const ops = await q.saveRounds(db, ALI, [gasAdd('d6', '2026-11-24', 2), dead('d6', '2026-11-24', 4), gasAdd('d6', '2026-11-24', 3), dead('d6b', '2026-11-24', 1)]);
    t.same(
      [ops.map((op) => op.id === ops[0].id), (await readOps(db)).map((op) => [op.fn, op.flockId, op.payload.add ?? op.payload.dead]).sort()],
      [[true, false, true, false], [['add_flock_gas', 'd6', 5], ['set_flock_dead', 'd6', 4], ['set_flock_dead', 'd6b', 1]]],
      'D6 الإضافتان لليوم في الجولة نفسها تُجمعان (2 + 3 = 5) بقاعدة الدمج، والهلاكات لكلّ قاعة عمليتها',
    );
    const realAdd = globalThis.IDBObjectStore.prototype.add;
    globalThis.IDBObjectStore.prototype.add = function (value, key) {
      if (value?.flockId === 'd6c') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      return key === undefined ? realAdd.call(this, value) : realAdd.call(this, value, key);
    };
    let failed = null;
    try {
      await q.saveRounds(db, ALI, [gasAdd('d6', '2026-11-24', 1), gasAdd('d6d', '2026-11-24', 2), dead('d6c', '2026-11-24', 7)]);
    } catch (error) {
      failed = error?.name ?? String(error);
    } finally {
      globalThis.IDBObjectStore.prototype.add = realAdd;
    }
    t.same([failed, (await readOps(db)).map((op) => [op.flockId, op.payload.add ?? op.payload.dead]).sort()], ['QuotaExceededError', [['d6', 5], ['d6', 4], ['d6b', 1]].sort()], 'D6 فشل كتابة في منتصف الجولة: لا شيء منها (لا دمج 5 + 1 ولا عملية d6d)');
    await t.rejects(q.saveRounds(db, ALI, [gasAdd('d6e', '2026-11-24', 1), gasAdd('d6e', '2026-11-24', 0)]), 'D6 عملية لا تدخل الطابور ترفض الجولة كلّها', /not_queueable/);
    t.eq((await readOps(db)).filter((op) => op.flockId === 'd6e').length, 0, 'D6 ولا شيء منها كُتب');
  }

  // ١٣د) S3 (0036): الطابور بنسخة 4، فنافذة بحزمة 0035 (نسخة 3: كانت ترسل set_flock_dead وadd_flock_gas بـsave_flock_day فتكتب هلاكات اليوم مجموعاً
  // وتُضيع الغاز) لا تشاركه: اتصالها يتسكّر، وفتحها بعده بنسخة 3 يرفض بصوت؛ والعمليات تبقى.
  {
    const name = nextName();
    const old = await idb.openDatabase(name, 3, queue.upgradeOutbox);
    await q.saveRound(old, ALI, day('s3', '2026-11-24', { dead: 4 }));
    const current = await within(q.openOutbox(name), 1000, 'blocked');
    t.eq(current === 'blocked' ? 'blocked' : current.version, 5, 'S3 الطابور ينفتح بنسخة 5 والنافذة بنسخة 3 مفتوحة');
    let oldClosed = false;
    try {
      old.transaction('ops', 'readonly');
    } catch (error) {
      oldClosed = error?.name === 'InvalidStateError';
    }
    t.ok(oldClosed, 'S3 اتصال النسخة 3 يصله versionchange فيتسكّر');
    const reopen = await within(idb.openDatabase(name, 3, queue.upgradeOutbox).then((db) => { db.close(); return 'opened'; }, (error) => `rejected:${error?.name}`), 1000, 'hung');
    t.eq(reopen, 'rejected:VersionError', 'S3 فتح حزمة 0035 بنسخة 3 بعد الترقية يرفض بصوت (لا ترسل الهلاكات ولا الغاز بغير دالّتيهما)');
    if (current !== 'blocked') {
      t.same((await readOps(current)).map((op) => [op.fn, op.payload.dead]), [['save_flock_day', 4]], 'S3 الترقية من 3 إلى 5 تُبقي العمليات');
      current.close();
    }
  }

  // ١٣هـ) S4 (0037): الطابور بنسخة 5، فنافذة بحزمة 0036 (نسخة 4: كانت ترسل set_flock_kerosene بـsave_flock_day بلا خانات فيضيع الكاز، وتدمجه في مجموع
  // اليوم) لا تشاركه: اتصالها يتسكّر، وفتحها بعده بنسخة 4 يرفض بصوت؛ والعمليات تبقى.
  {
    const name = nextName();
    const old = await idb.openDatabase(name, 4, queue.upgradeOutbox);
    await q.saveRound(old, ALI, day('s4', '2026-11-26', { dead: 2 }));
    const current = await within(q.openOutbox(name), 1000, 'blocked');
    t.eq(current === 'blocked' ? 'blocked' : current.version, 5, 'S4 الطابور ينفتح بنسخة 5 والنافذة بنسخة 4 مفتوحة');
    let oldClosed = false;
    try {
      old.transaction('ops', 'readonly');
    } catch (error) {
      oldClosed = error?.name === 'InvalidStateError';
    }
    t.ok(oldClosed, 'S4 اتصال النسخة 4 يصله versionchange فيتسكّر');
    const reopen = await within(idb.openDatabase(name, 4, queue.upgradeOutbox).then((db) => { db.close(); return 'opened'; }, (error) => `rejected:${error?.name}`), 1000, 'hung');
    t.eq(reopen, 'rejected:VersionError', 'S4 فتح حزمة 0036 بنسخة 4 بعد الترقية يرفض بصوت (لا ترسل الكاز بغير دالّته)');
    if (current !== 'blocked') {
      t.same((await readOps(current)).map((op) => [op.fn, op.payload.dead]), [['save_flock_day', 2]], 'S4 الترقية من 4 إلى 5 تُبقي العمليات');
      current.close();
    }
  }

  // ─── 0038: هلاكات الأقسام (parts في set_flock_dead وdead_parts في save_flock_day) ──────────────────────────────────────────────
  // P1) الأقسام صالحة (من قسمين إلى أربعة، أعداد صحيحة بحدود الخادم) ومجموعها الهلاكات المكتوبة معها، وإلّا لا تدخل الطابور؛ والأحدث يحلّ محلّ الأقدم
  // بأقسامه؛ وتصحيح الورقة يحمل أقسامه مع مجموعه ويندمج بمجموع اليوم.
  {
    const db = await open();
    const refusedOf = async (input) => q.saveRound(db, ALI, input).then(() => 'queued', (error) => error?.code ?? error?.message);
    const deadWith = (parts, n = 5) => ({ fn: 'set_flock_dead', flockId: 'p1', day: '2026-11-26', payload: { dead: n, parts }, baseVersion: null });
    t.same(
      [
        await refusedOf(deadWith([3, 3])),
        await refusedOf(deadWith([5])),
        await refusedOf(deadWith([1, 1, 1, 1, 1])),
        await refusedOf(deadWith([6, -1])),
        await refusedOf(deadWith([2.5, 2.5])),
        await refusedOf(day('p1b', '2026-11-26', { dead: 5, dead_parts: [4, 0] }, 1)),
        await refusedOf(day('p1b', '2026-11-26', { dead_parts: [4, 1] }, 1)),
      ],
      ['not_queueable', 'not_queueable', 'not_queueable', 'not_queueable', 'not_queueable', 'not_queueable', 'not_queueable'],
      'P1 أقسام لا تساوي الهلاكات، أو بقسم واحد أو خمسة، أو سالبة أو كسر، أو بلا هلاكاتها: لا تدخل الطابور',
    );
    const first = await q.saveRound(db, ALI, deadWith([3, 2]));
    const second = await q.saveRound(db, ALI, deadWith([1, 6], 7));
    const opsNow = await readOps(db);
    t.same([second.id === first.id, opsNow.filter((op) => op.flockId === 'p1').map((op) => op.payload)], [true, [{ dead: 7, parts: [1, 6] }]], 'P1 الأحدث يحلّ محلّ الأقدم بأقسامه (لم يُرسل)');
    await q.saveRound(db, ALI, day('p1c', '2026-11-26', { dead: 4, dead_parts: [3, 1] }, 2));
    await q.saveRound(db, ALI, day('p1c', '2026-11-26', { note: 'تهوية' }, 9));
    t.same((await readOps(db)).filter((op) => op.flockId === 'p1c').map((op) => op.payload), [{ dead: 4, dead_parts: [3, 1], note: 'تهوية' }], 'P1 تصحيح الورقة بأقسامه يندمج بمجموع اليوم والملاحظة بعده');
  }

  // ─── 0037: كاز اليوم (set_flock_kerosene) ────────────────────────────────────────────────────────────────────────────────
  const kerosene = (flockId, onDate, liters, baseVersion = null) => ({ fn: 'set_flock_kerosene', flockId, day: onDate, payload: { liters }, baseVersion });
  /** خادم كاز كخادم الغاز: صفّ لكلّ (فوج، يوم) بنسخته، والنسخة المختلفة stale_kerosene بقيمته، والمرجع يعيد أوّل جواب. */
  const keroseneServer = () => {
    const rows = new Map();
    const refs = new Map();
    const sent = [];
    return {
      rows,
      sent,
      apply(op) {
        sent.push(op);
        if (refs.has(op.id)) return refs.get(op.id);
        const key = `${op.flockId}|${op.day}`;
        const row = rows.get(key) ?? null;
        let result;
        if ((row?.version ?? null) !== op.baseVersion) result = { kind: 'stale_kerosene', server: { on: op.day, liters: row?.liters ?? null, version: row?.version ?? 1 } };
        else {
          const version = (row?.version ?? 0) + 1;
          rows.set(key, { version, liters: op.payload.liters });
          result = { kind: 'saved', version, kerosene: { on: op.day, liters: op.payload.liters, version } };
        }
        refs.set(op.id, result);
        return result;
      },
    };
  };

  // K1) كازان لليوم نفسه قبل الرفع يندمجان بأحدثهما (القيمة الأحدث والنسخة الأولى)، ولا يندمجان بالغاز ولا بمجموع اليوم ولا يقطعان دمجهما؛ والمسح null؛
  // وحدّ الخادم 20,000 لتر، والعدد صحيح غير سالب.
  {
    const db = await open();
    const d1 = await q.saveRound(db, ALI, day('k1', '2026-11-26', { dead: 3 }, 2));
    const g1 = await q.saveRound(db, ALI, gas('k1', '2026-11-26', 4, 1));
    const k1 = await q.saveRound(db, ALI, kerosene('k1', '2026-11-26', 200, 1));
    const g2 = await q.saveRound(db, ALI, gas('k1', '2026-11-26', 5, 7));
    const k2 = await q.saveRound(db, ALI, kerosene('k1', '2026-11-26', 400, 9));
    const d2 = await q.saveRound(db, ALI, day('k1', '2026-11-26', { note: 'تهوية' }, 9));
    const ops = await readOps(db);
    const kop = ops.find((op) => op.fn === 'set_flock_kerosene');
    t.same(
      [k2.id === k1.id, g2.id === g1.id, d2.id === d1.id, ops.length, kop?.payload, kop?.baseVersion, ops.find((op) => op.fn === 'set_flock_gas')?.payload.cylinders, ops.find((op) => op.fn === 'save_flock_day')?.payload],
      [true, true, true, 3, { liters: 400 }, 1, 5, { dead: 3, note: 'تهوية' }],
      'K1 الكاز يندمج بأحدث كاز منتظر لليوم (400 بنسخة 1)، والغاز بغازه، ومجموع اليوم بمجموعه رغم الكاز بينهما',
    );
    await q.saveRound(db, ALI, kerosene('k1', '2026-11-26', null, 1));
    t.eq((await readOps(db)).find((op) => op.fn === 'set_flock_kerosene')?.payload.liters, null, 'K1 مسح الكاز (null) يحلّ محلّ القيمة');
    const refused = [];
    for (const liters of [20001, -1, 2.5]) await q.saveRound(db, ALI, kerosene('k1', '2026-11-27', liters, null)).then(() => refused.push('queued'), (error) => refused.push(error?.code));
    await q.saveRound(db, ALI, kerosene('k1', '2026-11-27', 20000, null));
    t.same([refused, (await readOps(db)).filter((op) => op.day === '2026-11-27').map((op) => op.payload.liters)], [['not_queueable', 'not_queueable', 'not_queueable'], [20000]], 'K1 فوق 20,000 لتر أو سالب أو كسر لا يدخل الطابور، و20,000 يدخل');
  }

  // K2) الرفع: الكاز بدالّته ونسخته، ونسخته المحفوظة ترتفع لكاز بعده لليوم نفسه وحده (لا للغاز ولا لمجموع اليوم)، وstale_kerosene لرفّ المراجعة بقيمة
  // الخادم، والمركون يبقى في الرفّ بسببه.
  {
    const db = await open();
    const server = keroseneServer();
    const first = await q.saveRound(db, ALI, kerosene('k2', '2026-11-26', 200, null));
    await putOp(db, { ...first, state: 'unknown' });
    const second = await q.saveRound(db, ALI, kerosene('k2', '2026-11-26', 600, null));
    const gasOp = await q.saveRound(db, ALI, gas('k2', '2026-11-26', 3, null));
    t.ok(second.id !== first.id && gasOp.fn === 'set_flock_gas', 'K2 ضابط: كاز ثانٍ بعد عملية في الطريق عملية مستقلّة');
    const gasSent = [];
    const report = await q.flush(db, ALI, {
      currentUserId: async () => ALI.userId,
      send: async (op) => {
        if (op.fn === 'set_flock_kerosene') return server.apply(op);
        gasSent.push([op.fn, op.baseVersion]);
        return { kind: 'saved', version: 1 };
      },
      lookup: async () => null,
    });
    t.same(
      [report.saved, report.review, server.sent.map((op) => [op.payload.liters, op.baseVersion]), server.rows.get('k2|2026-11-26'), gasSent],
      [3, 0, [[200, null], [600, 1]], { version: 2, liters: 600 }, [['set_flock_gas', null]]],
      'K2 الكاز الثاني ارتفع بنسخة الأوّل (1)، والغاز بعده بنسخته هو (null) لا بنسخة الكاز',
    );
    await q.saveRound(db, ALI, kerosene('k2', '2026-11-26', 800, 1));
    const stale = await q.flush(db, ALI, { currentUserId: async () => ALI.userId, send: async (op) => server.apply(op), lookup: async () => null });
    const shelf = await q.reviewEntries(db, ALI);
    t.same([stale.review, shelf[0]?.reason, shelf[0]?.op.fn, shelf[0]?.op.payload.liters, shelf[0]?.server?.liters], [1, 'stale_kerosene', 'set_flock_kerosene', 800, 600], 'K2 نسخة قديمة: stale_kerosene في رفّ المراجعة بقيمتك وقيمة الخادم');
    await q.saveRound(db, ALI, kerosene('k2', '2026-11-01', 400, null));
    const parked = await q.flush(db, ALI, { currentUserId: async () => ALI.userId, send: async () => ({ kind: 'parked', reason: 'period_locked' }), lookup: async () => null });
    const after = (await q.reviewEntries(db, ALI)).find((entry) => entry.op.day === '2026-11-01');
    t.same([parked.parked, after?.reason, after?.hint, after?.op.payload.liters, (await q.summarize(db, ALI)).mine], [1, 'parked', 'period_locked', 400, 0], 'K2 المركون خرج من الطابور إلى الرفّ بسببه، ولا شيء ضاع');
  }
}
