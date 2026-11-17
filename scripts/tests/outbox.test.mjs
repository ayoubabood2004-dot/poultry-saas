// outbox-test: ما يدخل الطابور إلا المأمون، والهويّة مختومة، وعاملان بجهاز واحد على نفس (فوج + يوم)
// ولا وحدة تنمسح ولا تنرفع باسم الثاني، ورفض الهويّة والاشتراك ما ينحسب محاولة ولا يروح لرفّ المراجعة،
// والسباقات بين التبويبات ما تضاعف شي، وجواب ضايع ثم تعديل لنفس (فوج + يوم) يعطي حفظتين بلا رفّ مراجعة.
// وفوكها: الهويّة تنفحص لصق الإرسال، ومسك مختوم بالمستقبل ميّت، والقاعدة ما تسدّ ترقية نسخة أحدث،
// وكل حفظ جولة يسأل persisted().
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

  // ١١) نسخة أحدث تفتح نفس القاعدة بنسخة 2 والطابور مفتوح هنا: اتصالنا يتسكّر لحاله وما يسدّها.
  {
    const name = nextName();
    const db = await q.openOutbox(name);
    const newer = await within(
      new Promise((resolve) => {
        const request = globalThis.indexedDB.open(name, 2);
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

  // ١٣) ترقية النسخة الجاية على قاعدة هاي النسخة: ما تعيد بناء المخازن الموجودة، والعمليات تبقى.
  {
    const name = nextName();
    const v1 = await q.openOutbox(name);
    await q.saveRound(v1, ALI, day('f8', '2026-10-15', { dead: 1 }));
    v1.close();
    const upgraded = await idb.openDatabase(name, 2, queue.upgradeOutbox).then(
      async (db) => {
        const stores = Array.from(db.objectStoreNames).sort();
        const mine = (await q.summarize(db, ALI)).mine;
        db.close();
        return { stores, mine };
      },
      (error) => `rejected:${error?.name ?? error?.message}`,
    );
    t.same(upgraded, { stores: ['ops', 'review'], mine: 1 }, 'الترقية لنسخة 2 نجحت والجولة باقية');
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
    t.eq(db.version, 1, 'V16 قاعدة الطابور بنسختها نفسها (1): لا ترقية، والحقول داخل payload');
    const a = await q.saveRound(db, ALI, visit('f20', '2026-11-17', visitContent('va', { dead: 3, feed_kg: '50.000' })));
    const b = await q.saveRound(db, ALI, visit('f20', '2026-11-17', visitContent('vb', { dead: 2 })));
    t.same([a.fn, b.fn, a.id !== b.id, (await readOps(db)).length], ['save_flock_visit', 'save_flock_visit', true, 2], 'V16 زيارتان مختلفتان لليوم نفسه: عمليتان (لا دمج بين زيارتين)');
    const edit = await q.saveRound(db, ALI, visit('f20', '2026-11-17', visitContent('va', { dead: 4 })));
    const ops = await readOps(db);
    t.same([edit.id, ops.length, ops.find((op) => op.id === a.id)?.payload.dead, ops.find((op) => op.id === a.id)?.payload.feed_kg, ops.find((op) => op.id === a.id)?.baseVersion], [a.id, 2, 4, null, null], 'V16 تعديل زيارة لم تُرفع يحلّ محلّ محتواها كاملاً (العلف الفارغ فارغ، لا دمج بـ«بلا تغيير»)، ويبقى إضافةً');
    const dropped = await q.saveRound(db, ALI, visit('f20', '2026-11-17', visitContent('vb', { dead: 2, void: true })));
    t.same([dropped, (await readOps(db)).map((op) => op.payload.visitId)], [null, ['va']], 'V16 إلغاء زيارة جديدة لم تُرفع يحذف عمليتها (لا شيء يُرسل)');
    const nothing = await q.saveRound(db, ALI, visit('f20', '2026-11-17', visitContent('vz', { void: true })));
    t.same([nothing, (await readOps(db)).length], [null, 1], 'V16 إلغاء زيارة لا هي بالخادم ولا بالجهاز: لا عملية');
    await t.rejects(q.saveRound(db, ALI, visit('f20', '2026-11-17', { ...visitContent(''), visitId: '' })), 'V16 زيارة بلا معرّف لا تدخل الطابور', /not_queueable/);
    const server = makeServer();
    const report = await q.flush(db, ALI, transport(server, ALI.userId));
    t.same([report.saved, server.visits.get('va')?.payload.dead, server.visits.has('vb')], [1, 4, false], 'V16 الرفع: الزيارة بمحتواها الأخير، والملغاة قبل رفعها لم تصل');
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
}
