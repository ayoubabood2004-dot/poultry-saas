// عميل الحزمة بهويّة (من run.mjs): كل استعلام بمعاملة ترجع، بدور authenticated أو anon أو service_role ومطالبات JWT مثل
// PostgREST. وزايد بالمرحلة 1 (الخطّة WP0):
// - سجلّ التغطية (GT-27، FOUNDATION ٨٦٥): كل public.<دالّة>( ينادى بدور authenticated ينسجّل ويّا دور العضو اللي ناداه،
//   وبنهاية الحزمة كل دالّة بقائمة السماح لازم نادتها الأدوار الثمانية كلها، مو مرّة وحدة. وينسجّل بس إذا النداء وصل الدالّة:
//   نجح، أو رفضته الدالّة نفسها (P0001). دالّة مو موجودة (42883)، أو معاملة واقفة (25P02)، أو صلاحية ناقصة، أو الاسم
//   بتعليق أو نصّ، ما ينحسب (المراجعة العدائية: كان ينسجّل قبل الاستعلام من نصّه الخام).
// - setToday(يوم، fn): app_today() يرجّع يوماً ثابتاً بنطاق يثبت (جلسات ومستخدمين يشوفونه)، ويرجع لتعريف الهجرة بـfinally.
//   (درس 2026-10-26: الكائن المزيّف يرجع كما كان بـfinally، وإلا يكسر الفحوص بعده.)

export const ROLES = ['owner', 'manager', 'storekeeper', 'mill_operator', 'hatchery_operator', 'hall_worker', 'accountant', 'viewer'];

const userClaims = (userId) => ({ sub: userId, role: 'authenticated' });

// طريق الطلب مثل PostgREST: authenticator يدخل بحدوده (lock_timeout وstatement_timeout 8s)، وبعد set role تنطبق حدود
// الدور (statement_timeout: anon 3s وauthenticated 8s). من pg_db_role_setting، المنسوخ من الإنتاج بـbootstrap.sql، ويُقرأ
// قبل set role (الحدود محلّية للمعاملة، فترتيبها ويّا set role ما يأثّر).
export async function applyRequestLimits(query, role) {
  if (!['anon', 'authenticated', 'service_role'].includes(role)) return;
  const { rows } = await query(
    `select split_part(c, '=', 1) as name, split_part(c, '=', 2) as value
     from pg_db_role_setting s cross join unnest(s.setconfig) with ordinality as x(c, n)
     where s.setdatabase = 0 and s.setrole in ('authenticator'::regrole, $1::regrole)
       and split_part(c, '=', 1) in ('statement_timeout', 'lock_timeout')
     order by s.setrole = $1::regrole, x.n`,
    [role],
  );
  for (const { name, value } of rows) await query('select set_config($1, $2, true)', [name, value]);
}

const CALLED = /\bpublic\.([a-z_][a-z0-9_]*)\s*\(/giu;

/** نصّ SQL بلا تعليقات (-- و/* *\/) ولا نصوص ('…' و$$…$$ و$tag$…$tag$): اسم بداخلها مو نداء. */
export function sqlCode(text) {
  return String(text).replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'|(\$[a-z_]*\$)[\s\S]*?\1/giu, ' ');
}

/** النداء وصل الدالّة: نجح، أو رفضته هي (raise exception = P0001). غيره (42883، 25P02، 42501 صلاحية) ما شغّلها. */
const reachedFunction = (error) => !error || error.code === 'P0001';

/** الفجوات: (دالّة × دور) بقائمة السماح ما انسجّل نداؤها. allowlist تواقيع «public.f(…)»، وcoverage خريطة اسم ← أدوار. */
export function coverageGaps(allowlist, coverage, roles = ROLES) {
  const gaps = [];
  for (const signature of allowlist) {
    const name = signature.slice(signature.indexOf('.') + 1, signature.indexOf('('));
    const called = coverage.get(name) ?? new Set();
    for (const role of roles) if (!called.has(role)) gaps.push(`${name} × ${role}`);
  }
  return gaps;
}

/**
 * عميل بهويّة: كل استعلام بمعاملة تنتهي بتراجع (الفحص ما يسيب أثر)، بدور authenticated أو anon
 * ومطالبات JWT مثل PostgREST بالضبط (request.jwt.claims)، فـauth.uid() وRLS يشتغلون مثل الإنتاج.
 * connect: اتصال جديد بنفس القاعدة، لفحوص التزامن (جلستان بنفس اللحظة).
 */
export function makeDb(client, connect) {
  const coverage = new Map();
  const record = (text, role) => {
    for (const match of sqlCode(text).matchAll(CALLED)) {
      const called = coverage.get(match[1]) ?? new Set();
      called.add(role);
      coverage.set(match[1], called);
    }
  };
  // دور العضو لحظة النداء، بلا معاملة (قبل begin): استعلام يفشل هنا ما يوقف المعاملة. بلا عضوية = none.
  const memberRole = async (query, userId) => {
    try {
      const { rows } = await query('select role from public.members where user_id = $1 and archived_at is null and accepted_at is not null', [userId]);
      return rows[0]?.role ?? 'none';
    } catch {
      return 'unknown';
    }
  };

  // commit: السيناريو يكمل بمستخدم ثاني بعده (المالك يضيف العامل، والعامل يفحص). بلاه كل شي يرجع.
  async function inRole(role, claims, fn, { commit = false } = {}) {
    const caller = role === 'authenticated' ? await memberRole((text, params) => client.query(text, params), claims.sub) : null;
    await client.query('begin');
    let ok = false;
    try {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims ?? {})]);
      await applyRequestLimits((text, params) => client.query(text, params), role);
      await client.query(`set local role ${role}`);
      const result = await fn(async (text, params) => {
        try {
          const answer = await client.query(text, params);
          if (caller) record(text, caller);
          return answer;
        } catch (error) {
          if (caller && reachedFunction(error)) record(text, caller);
          throw error;
        }
      });
      ok = true;
      return result;
    } finally {
      await client.query(ok && commit ? 'commit' : 'rollback');
    }
  }

  /**
   * جلسة مستقلّة بمعاملة مفتوحة كمستخدم داخل، تبقى لحد commit أو rollback. run(sql) يرجّع وعداً ما ينتظر،
   * وsettle(وعد) يستنّى لحد ما ينتهي الاستعلام أو ينحبس على قفل (pg_stat_activity)، ويكول أيّهما.
   */
  async function session(userId) {
    const other = connect();
    await other.connect();
    const caller = await memberRole((text, params) => other.query(text, params), userId);
    const pid = (await other.query('select pg_backend_pid() as pid')).rows[0].pid;
    await other.query('begin');
    await other.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(userClaims(userId))]);
    await applyRequestLimits((text, params) => other.query(text, params), 'authenticated');
    await other.query('set local role authenticated');
    let open = true;
    // مرّة وحدة: بعد commit أو rollback الجلسة انسدّت، والنداء الثاني (finally بالفحص) ما يسوّي شي.
    const end = async (verb) => {
      if (!open) return;
      open = false;
      try {
        await other.query(verb);
      } finally {
        await other.end();
      }
    };
    return {
      pid,
      /** الاستعلام بالجلسة؛ الوعد يرجع { ok, rows } أو { ok: false, error } بدل ما يرمي. */
      run: (text, params) =>
        other.query(text, params).then(
          (result) => {
            record(text, caller);
            return { ok: true, rows: result.rows };
          },
          (error) => {
            if (reachedFunction(error)) record(text, caller);
            return { ok: false, error: error.message };
          },
        ),
      commit: () => end('commit'),
      rollback: () => end('rollback'),
    };
  }

  async function settle(promise, pid, timeoutMs = 5000) {
    let done = false;
    promise.then(() => {
      done = true;
    });
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (done) return 'finished';
      const row = (await client.query('select wait_event_type from pg_stat_activity where pid = $1', [pid])).rows[0];
      if (row?.wait_event_type === 'Lock') return 'blocked';
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`الجلسة ${pid} ما انتهت ولا انحبست على قفل خلال ${timeoutMs}ms`);
  }

  /** أمر بدور صاحب الهجرات (postgres) يثبت، أو يرجع كلّه إذا فشل. */
  async function ownerCommit(sql) {
    await client.query('begin');
    let ok = false;
    try {
      await client.query('set local role postgres');
      await client.query(sql);
      ok = true;
    } finally {
      await client.query(ok ? 'commit' : 'rollback');
    }
  }

  /**
   * app_today() = يوم ثابت لحد ما تخلص fn، بنطاق يثبت (كل جلسة ومستخدم يشوفه)، ويرجع بـfinally لتعريفه كما كان بالضبط
   * (pg_get_functiondef: الجسم والإعدادات)، فصورة الكتالوج بنهاية الحزمة تطابق الهجرة. المتداخل يرجع للي قبله.
   */
  async function setToday(day, fn) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(day))) throw new Error(`setToday: يوم مو YYYY-MM-DD («${day}»)`);
    const original = (await client.query("select pg_get_functiondef('public.app_today()'::regprocedure) as def")).rows[0].def;
    await ownerCommit(`create or replace function public.app_today() returns date language sql stable set search_path = pg_catalog, pg_temp as $$ select date '${day}' $$`);
    try {
      return await fn();
    } finally {
      await ownerCommit(original);
    }
  }

  return {
    /** استعلام بالهويّة الإدارية (supabase_admin) للتجهيز: يبقى أثره لحد نهاية الحزمة. */
    admin: (text, params) => client.query(text, params),
    /** كمستخدم داخل: sub = userId والدور authenticated. يرجع إلا ويّا { commit: true }. */
    asUser: (userId, fn, options) => inRole('authenticated', userClaims(userId), fn, options),
    /** بلا دخول: مفتاح anon. */
    asAnon: (fn) => inRole('anon', { role: 'anon' }, fn),
    /** صاحب الهجرات (postgres، مو خارق)، ويّا مطالبات مستخدم إذا انطى (لدوالّ private بهويّته). يرجع إلا ويّا { commit: true }. */
    asOwner: (fn, userId, options) => inRole('postgres', userId ? userClaims(userId) : {}, fn, options),
    /** بمفتاح الخادم (service_role): يتجاوز RLS مثل الإنتاج. */
    asService: (fn) => inRole('service_role', { role: 'service_role' }, fn),
    /** المالك يصدر رمز الدعوة والمدعوّ يقبل بيه (0003)، والاثنين يثبتون. يرجّع my_workspace() مال المدعوّ. */
    acceptInvite: async (ownerId, userId, memberId) => {
      const code = await inRole('authenticated', userClaims(ownerId), async (q) => (await q('select public.invite_code($1) as code', [memberId])).rows[0].code, { commit: true });
      return inRole('authenticated', userClaims(userId), async (q) => (await q('select public.accept_invite_code($1, $2) as w', [memberId, code])).rows[0].w, { commit: true });
    },
    session,
    settle,
    setToday,
    /** سجلّ التغطية: اسم الدالّة ← الأدوار اللي نادتها بدور authenticated. */
    coverage,
  };
}
