// migration-guard (FOUNDATION ٨٤٥): كل هجرة اسمها مرقّم بالتسلسل (0001_…) بلا فجوة ولا تكرار، رأسها يكول المشكلة
// وبيه سطر «تراجع:»، وأوّل أمر بيها set lock_timeout = '5s' حتى قفل طويل ما يعلّق الإنتاج. ملف rollback_NNNN لازم
// إله هجرة بنفس الرقم. وأي .sql بغير هالشكلين ينمسك: الحزمة (supabase/tests/run.mjs) تطبّق ^\d{4}_ بس، فملف بغير
// اسم يعبر بصمت بلا فحص. وكل raise exception برمز snake_case (الواجهة تترجم الرمز) ويّا using hint عربي فصيح
// (التلميح هو اللي يشوفه المستخدم، FOUNDATION ٥٢٢)، والتلميح يعبر من نفس فحص اللهجة مال i18n-guard. يقرأ الملفات
// بلا قاعدة، فيشتغل بـlint وbuild.
// المرحلة 1 (الخطّة WP0، GT-24): دالّة تقفل (for update أو for share أو pg_advisory_xact_lock) تبدي بـset local lock_timeout = '5s'
// قبل أوّل قفل، وكل جسم دالّة بين علامتي دولار ($$ أو $tag$) حتى ينقرا؛ ولا قسمة «/» بالشفرة أبداً: القسمة ببوستغريس تقرّب
// ناتجها لحالها (القاعدة 8)، فـround(a*b/c) وtrunc وceil وfloor والتحويل لعدد صحيح وقسمة بخطوتين كلها تقريب مرّتين؛ الضرب-
// القسمة-التقريب بـ_mul_div_round2/0 والقصّ بـdiv()/mod() (ولا power(x, -n) إلا للعشرة)، وماكو وسم يعفي؛ لا float ولا real
// ولا double precision ولا numeric(؛ وكل create table (حتى داخل do أو execute) ويّاه enable row level security بنفس الملف.
// ومن 0004 سطر «تراجع:» يسمّي rollback_NNNN.sql الموجود أو يكول «إضافية فقط» (الحزمة تصدّقه بالكتالوج).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { dialectWords } from './i18n-guard.mjs';
import { ARABIC, ROOT } from './lib.mjs';

export const name = 'migration-guard';

const MIGRATION = /^(\d{4})_[a-z0-9_]+\.sql$/;
const ROLLBACK = /^rollback_(\d{4})\.sql$/;
const LOCK = /^set\s+lock_timeout\s*=\s*'5s'\s*;/i;

/** التعليقات الأولى (الرأس) وأوّل أمر بعدها. */
function headerAndFirst(text) {
  const lines = text.replace(/^\u{FEFF}/u, '').split(/\r?\n/);
  const header = [];
  let index = 0;
  for (; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line === '') continue;
    if (!line.startsWith('--')) break;
    header.push(line);
  }
  return { header, first: (lines[index] ?? '').trim() };
}

const RAISE = /\braise\s+exception\b/giu;
const CODE = /^[a-z][a-z0-9_]*$/u;

/** الأمر من موضعه لحد أوّل «;» برّا النصوص: جسمه (النصوص مشالة) ونصوصه ('' بداخلها علامة)، بلا تعليقات --. */
function statementAt(text, start) {
  const strings = [];
  let body = '';
  let i = start;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'") {
      let value = '';
      let j = i + 1;
      while (j < text.length && !(text[j] === "'" && text[j + 1] !== "'")) {
        value += text[j];
        j += text[j] === "'" ? 2 : 1;
      }
      strings.push(value);
      body += "''";
      i = j + 1;
    } else if (ch === '-' && text[i + 1] === '-') {
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end;
    } else if (ch === ';') {
      break;
    } else {
      body += ch;
      i += 1;
    }
  }
  return { body, strings };
}

/** مخالفات raise exception بملف: الرمز، والتلميح، ولهجة التلميح. */
function raiseProblems(file) {
  const problems = [];
  let count = 0;
  for (const match of file.text.matchAll(RAISE)) {
    const lineStart = file.text.lastIndexOf('\n', match.index) + 1;
    if (file.text.slice(lineStart, match.index).includes('--')) continue; // بتعليق
    count += 1;
    const line = file.text.slice(0, match.index).split('\n').length;
    const { body, strings } = statementAt(file.text, match.index + match[0].length);
    const place = `${file.name}:${line}`;
    if (!/^\s*''/u.test(body)) {
      problems.push(`${place}: raise exception بلا رمز نصّي أوّلاً`);
      continue;
    }
    const [code, ...rest] = strings;
    if (!CODE.test(code)) problems.push(`${place}: الرمز «${code}» مو snake_case`);
    if (!/\busing\s+hint\s*=/iu.test(body)) problems.push(`${place}: «${code}» بلا using hint (التلميح هو اللي يشوفه المستخدم)`);
    else if (!rest.some((value) => ARABIC.test(value))) problems.push(`${place}: تلميح «${code}» مو عربي`);
    const dialect = rest.flatMap((value) => dialectWords(value));
    if (dialect.length) problems.push(`${place}: لهجة بتلميح «${code}»: «${dialect.join('، ')}» — التلميح بالفصحى`);
  }
  return { problems, count };
}

const blank = (text) => text.replace(/[^\n]/gu, ' ');

/**
 * الشفرة بلا تعليقات (-- و/* *\/ المتداخلة) وبلا محتوى النصوص ('…' و$$…$$ و$tag$…$tag$)، بفراغات بنفس الطول فالمواضع
 * والأسطر تبقى، والمعرّفات "…" تبقى كما هي. literals: محتوى كل نصّ وموضعه، حتى SQL الديناميكي (execute '…' وformat)
 * وأجسام الدولار تنفحص هي هم. المراجعة العدائية: $$ (بلا وسم) كان يبقى شفرة، فقاعدة القفل (تقرا النصوص بس) ما شافت
 * ولا جسم دالّة، والهجرات كلها بـ$$.
 */
function lex(text) {
  let code = '';
  const literals = [];
  let i = 0;
  while (i < text.length) {
    const tag = text[i] === '$' ? /^\$(?:[a-z_][a-z0-9_]*)?\$/iu.exec(text.slice(i)) : null;
    if (text[i] === '-' && text[i + 1] === '-') {
      const end = text.indexOf('\n', i);
      const stop = end < 0 ? text.length : end;
      code += blank(text.slice(i, stop));
      i = stop;
    } else if (text[i] === '/' && text[i + 1] === '*') {
      let depth = 0;
      let j = i;
      do {
        if (text[j] === '/' && text[j + 1] === '*') {
          depth += 1;
          j += 2;
        } else if (text[j] === '*' && text[j + 1] === '/') {
          depth -= 1;
          j += 2;
        } else {
          j += 1;
        }
      } while (depth > 0 && j < text.length);
      code += blank(text.slice(i, j));
      i = j;
    } else if (text[i] === '"') {
      const end = text.indexOf('"', i + 1);
      const stop = end < 0 ? text.length : end + 1;
      code += text.slice(i, stop);
      i = stop;
    } else if (text[i] === "'") {
      let j = i + 1;
      let value = '';
      while (j < text.length && !(text[j] === "'" && text[j + 1] !== "'")) {
        value += text[j];
        j += text[j] === "'" ? 2 : 1;
      }
      literals.push({ start: i, end: j + 1, value, dollar: false });
      code += `'${blank(text.slice(i + 1, j))}'`;
      i = j + 1;
    } else if (tag) {
      const close = text.indexOf(tag[0], i + tag[0].length);
      const stop = close < 0 ? text.length : close + tag[0].length;
      literals.push({ start: i, end: stop, value: text.slice(i + tag[0].length, close < 0 ? text.length : close), dollar: true });
      code += blank(text.slice(i, stop));
      i = stop;
    } else {
      code += text[i];
      i += 1;
    }
  }
  return { code, literals };
}

const lineAt = (text, index) => text.slice(0, index).split('\n').length;

/** WHERE بمستوى الأمر نفسه: مو داخل استعلام فرعي أو RETURNING أو USING، ولحد «;» أو القوس اللي يسدّ CTE. */
function hasOwnWhere(code, start) {
  let depth = 0;
  for (let i = start; i < code.length; i += 1) {
    const ch = code[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth < 0) return false;
    } else if (ch === ';' && depth === 0) return false;
    else if (depth === 0 && /^where\b/iu.test(code.slice(i, i + 6)) && !/[a-z0-9_]/iu.test(code[i - 1] ?? ' ')) return true;
  }
  return false;
}

// PostgREST يحمّل safeupdate لـauthenticator (مقيس بالإنتاج): UPDATE أو DELETE بلا WHERE بمستواه يرفض حتى داخل دالّة،
// والحزمة ما عندها هالمكتبة. «where true» إذا القصد كل الصفوف. «do update set» مال on conflict مو أمر UPDATE.
// المعرّف عادي أو "مقتبس" أو %I مال format (SQL ديناميكي).
const IDENT = String.raw`(?:[a-z_][a-z0-9_$]*|"[^"]+"|%[a-z])`;
const UPDATE = new RegExp(String.raw`(?<!\bdo\s+)\bupdate\s+(?:only\s+)?${IDENT}(?:\.${IDENT})?\s+(?:as\s+)?(?:${IDENT}\s+)?set\b`, 'giu');
const DELETE = /\bdelete\s+from\b/giu;

// تاريخ يتبع منطقة الجلسة (الإنتاج UTC، والعميل يغيّرها بـPrefer: timezone): «اليوم» من app_today() بس، أو
// «at time zone 'Asia/Baghdad'» صريح. المصدر الحسّاس: now() وأخواتها وcurrent_timestamp وعمود ‎*_at (timestamptz
// بالاصطلاح). الاستثناء بـ-- date-ok: السبب على سطره.
const SOURCE = String.raw`(?:(?:now|clock_timestamp|statement_timestamp|transaction_timestamp)\s*\(\s*\)|\bcurrent_timestamp\b|\b[a-z_][a-z0-9_]*_at\b)`;
const LOCAL_TYPE = String.raw`(?:date|time|timestamp)\b(?!\s+with\b)`;
const SESSION_DATE = [
  /\b(?:current_date|current_time|localtime|localtimestamp)\b/giu,
  new RegExp(String.raw`${SOURCE}\s*::\s*${LOCAL_TYPE}`, 'giu'),
  new RegExp(String.raw`\bcast\s*\(\s*${SOURCE}\s+as\s+${LOCAL_TYPE}`, 'giu'),
];
const DATE_FUNCTION = /\b(?:date|date_trunc|date_part|to_char|extract)\s*\(/giu;
const SOURCE_IN = new RegExp(SOURCE, 'iu');
const RELATIVE_LITERAL = /^(?:today|now|yesterday|tomorrow)$/iu;

/** نصّ القوسين من موضع «(» لحد اللي يسدّه. */
function parenthesized(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '(') depth += 1;
    else if (code[i] === ')') {
      depth -= 1;
      if (depth === 0) return code.slice(open + 1, i);
    }
  }
  return code.slice(open + 1);
}

function writeAndDateProblems(file, { dates = true } = {}) {
  const problems = [];
  const { code, literals } = lex(file.text);
  const lines = file.text.split('\n');
  const where = (index) => `${file.name}:${lineAt(code, index)}`;
  let writes = 0;
  for (const pattern of [UPDATE, DELETE]) {
    for (const match of code.matchAll(pattern)) {
      writes += 1;
      if (!hasOwnWhere(code, match.index + match[0].length)) {
        problems.push(`${where(match.index)}: «${match[0].trim()}» بلا WHERE بمستواه — safeupdate بالإنتاج يرفضه (where true إذا القصد كل الصفوف)`);
      }
    }
  }
  if (dates) {
    const flag = (index, text) => {
      if (lines[lineAt(code, index) - 1]?.includes('-- date-ok:')) return;
      problems.push(`${where(index)}: «${text}» يتبع منطقة الجلسة — اليوم من public.app_today() أو at time zone 'Asia/Baghdad'`);
    };
    for (const pattern of SESSION_DATE) for (const match of code.matchAll(pattern)) flag(match.index, match[0]);
    for (const match of code.matchAll(DATE_FUNCTION)) {
      const args = parenthesized(code, match.index + match[0].length - 1);
      if (SOURCE_IN.test(args) && !/\bat\s+time\s+zone\b/iu.test(args)) flag(match.index, `${match[0]}${args.trim().slice(0, 40)})`);
    }
    for (const literal of literals) {
      const after = code.slice(literal.end).match(/^\s*::\s*(?:date|timestamp)\b/iu);
      if (!literal.dollar && RELATIVE_LITERAL.test(literal.value.trim()) && after) flag(literal.start, `'${literal.value}'${after[0]}`);
    }
  }
  // SQL داخل النصوص: execute '…' وformat('…') (UPDATE/DELETE بس)، وأجسام $tag$ (كل القواعد).
  for (const literal of literals) {
    if (!literal.dollar && !/\b(?:update|delete)\b/iu.test(literal.value)) continue;
    const inner = writeAndDateProblems({ name: `${file.name}:${lineAt(code, literal.start)} (نصّ)`, text: literal.value }, { dates: literal.dollar });
    writes += inner.writes;
    problems.push(...inner.problems);
  }
  return { problems, writes };
}

// ─── المرحلة 1 (الخطّة WP0، GT-24) ────────────────────────────────────────────────────────────────────────────
// 0001–0003 انطبقت بالإنتاج 2026-10-25 قبل هالقواعد: أجسامها تتبدّل بهجرة جديدة بس (الكتالوج ينقارن بالإنتاج بـmd5)، فقاعدة
// القفل وشكل سطر «تراجع:» تبدي من 0004. باقي القواعد الجديدة تنطبق على الكل (والقديمة سليمة منها).
const LEGACY_THROUGH = 3;

/** الشفرة بمستوياتها: المستوى الأعلى وكل جسم $tag$ (متداخل هم)، كل وحدة بسطر بدايتها بالملف. */
function codeScopes(text, firstLine = 1) {
  const { code, literals } = lex(text);
  const scopes = [{ code, text, firstLine }];
  for (const literal of literals) {
    if (literal.dollar) scopes.push(...codeScopes(literal.value, firstLine + lineAt(text, literal.start) - 1));
  }
  return scopes;
}

/** النصّ بلا تعليقات والنصوص باقية: حتى «set local lock_timeout = '5s'» ينقرا بقيمته، والمعلَّق ما ينحسب. */
function withoutComments(text) {
  const { code, literals } = lex(text);
  let out = code;
  for (const literal of literals) {
    if (!literal.dollar) out = out.slice(0, literal.start) + text.slice(literal.start, literal.end) + out.slice(literal.end);
  }
  return out;
}

const LOCKING = /\bfor\s+(?:no\s+key\s+)?update\b|\bfor\s+(?:key\s+)?share\b|\bpg_advisory_xact_lock\b/iu;
const LOCAL_TIMEOUT = /\bset\s+local\s+lock_timeout\s*=\s*'5s'/iu;
const FUNCTION_HEAD = /\bcreate\s+(?:or\s+replace\s+)?(?:function|procedure)\b/iu;

/**
 * دالّة تقفل (for update أو قفل استشاري) بلا set local lock_timeout = '5s' قبل أوّل قفل (الخطّة §2.3). وكل create function
 * جسمه بين علامتي دولار: جسم بنصّ '…' أو begin atomic ما ينقرا، فقفل بداخله يعبر بصمت.
 */
function lockProblems(file, legacyBodies = new Set()) {
  const problems = [];
  let locking = 0;
  let functions = 0;
  let restored = 0;
  const { code, literals } = lex(file.text);
  for (const head of code.matchAll(new RegExp(FUNCTION_HEAD.source, 'giu'))) {
    const end = code.indexOf(';', head.index);
    const stop = end < 0 ? code.length : end;
    if (!literals.some((literal) => literal.dollar && literal.start > head.index && literal.start < stop)) {
      problems.push(`${file.name}:${lineAt(file.text, head.index)}: دالّة جسمها مو بين علامتي دولار ($$ أو $tag$) — الحارس ما يقرا جسمها`);
    }
  }
  for (const literal of literals) {
    if (!literal.dollar) continue;
    const head = code.slice(code.lastIndexOf(';', literal.start) + 1, literal.start);
    if (!FUNCTION_HEAD.test(head)) continue; // do $$ … $$ بالهجرة نفسها تحت lock_timeout الملف
    functions += 1;
    // ملف التراجع يرجّع جسماً انكتب بـ0001–0003 حرفاً بحرف (مشغّل التراجع يقارن md5 الجسم بالإنتاج): القديم معفى من القاعدة
    // بالإنتاج، فنسخته الحرفية معفاة هي هم. حرف واحد مختلف = جسم جديد، والقاعدة تنطبق عليه.
    if (legacyBodies.has(literal.value)) {
      restored += 1;
      continue;
    }
    const body = lex(literal.value).code;
    const first = body.search(LOCKING);
    if (first < 0) continue;
    locking += 1;
    const set = withoutComments(literal.value).search(LOCAL_TIMEOUT);
    if (set < 0 || set > first) {
      const name = /function\s+([a-z0-9_."]+)/iu.exec(head)?.[1] ?? '?';
      problems.push(`${file.name}:${lineAt(file.text, literal.start)}: ${name} تقفل بلا set local lock_timeout = '5s' قبل أوّل قفل (§2.3)`);
    }
  }
  return { problems, locking, functions, restored };
}

/** أجسام الدوالّ بالهجرات القديمة (0001–0003) كما هي: ملف التراجع يرجّعها حرفياً. */
function legacyFunctionBodies(files) {
  const bodies = new Set();
  for (const file of files) {
    const migration = MIGRATION.exec(file.name);
    if (!migration || Number(migration[1]) > LEGACY_THROUGH) continue;
    const { code, literals } = lex(file.text);
    for (const literal of literals) {
      if (literal.dollar && FUNCTION_HEAD.test(code.slice(code.lastIndexOf(';', literal.start) + 1, literal.start))) bodies.add(literal.value);
    }
  }
  return bodies;
}

/** وسائط استدعاء مفصولة بفوارز المستوى الأوّل: «10::numeric, -p_n» ← ['10::numeric', '-p_n']. */
function topLevelArgs(args) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '(') depth += 1;
    else if (args[i] === ')') depth -= 1;
    else if (args[i] === ',' && depth === 0) {
      out.push(args.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(args.slice(start).trim());
  return out;
}

/**
 * القسمة والتقريب (القاعدة 8، §2.7): كل «/» بالشفرة مخالفة، لأن numeric / numeric يقرّب ناتجه لحاله، فـround(a*b/c)
 * وtrunc(…/…) وceil وfloor و(…/…)::bigint وcast(… as int) وx := a*b/c ثم round(x) كلها تقريب مرّتين. ومقلوب العدد
 * (power(l, -1) أو l ^ -1) قسمة مخفية، إلا power(10, -n) (مضبوط). وأنواع الفاصلة العائمة وnumeric(p,s).
 */
function mathAndTypeProblems(file) {
  const problems = [];
  for (const scope of codeScopes(file.text)) {
    const at = (index) => `${file.name}:${scope.firstLine + lineAt(scope.code, index) - 1}`;
    for (const match of scope.code.matchAll(/\//gu)) {
      problems.push(`${at(match.index)}: قسمة «/» — القسمة ببوستغريس تقرّب ناتجها لحالها (القاعدة 8): الضرب-القسمة-التقريب بـprivate._mul_div_round2/0، والقصّ بـdiv() وmod() (§2.7)`);
    }
    for (const match of scope.code.matchAll(/\bpower\s*\(/giu)) {
      const [base = '', exponent = ''] = topLevelArgs(parenthesized(scope.code, match.index + match[0].length - 1));
      if (exponent.startsWith('-') && !/^10(?:\s*::\s*numeric)?$/iu.test(base)) problems.push(`${at(match.index)}: power(…, -n) مقلوب = قسمة مخفية — بـprivate._mul_div_round2/0 (§2.7)`);
    }
    for (const match of scope.code.matchAll(/\^\s*\(?\s*-/gu)) {
      problems.push(`${at(match.index)}: «^ -n» مقلوب = قسمة مخفية — بـprivate._mul_div_round2/0 (§2.7)`);
    }
    for (const match of scope.code.matchAll(/\b(?:float[48]?|real|double\s+precision)\b/giu)) {
      problems.push(`${at(match.index)}: «${match[0]}» فاصلة عائمة — المال والكمية numeric بلا دقّة ويّا check (§2.7)`);
    }
    for (const match of scope.code.matchAll(/\bnumeric\s*\(/giu)) {
      problems.push(`${at(match.index)}: numeric( بدقّة محدّدة — numeric بلا دقّة ويّا check (FOUNDATION ٨٠٨)`);
    }
  }
  return problems;
}

const qualified = (name) => (name.includes('.') ? name : `public.${name}`).replace(/"/g, '').toLowerCase();

/** الشفرة بكل مستوياتها ويّا SQL النصوص اللي بيها create أو alter (execute '…'): كل وحدة بسطر بدايتها بالملف. */
function sqlChunks(text, firstLine = 1) {
  const { code, literals } = lex(text);
  const chunks = [{ code, firstLine }];
  for (const literal of literals) {
    if (literal.dollar || /\b(?:create|alter)\b/iu.test(literal.value)) chunks.push(...sqlChunks(literal.value, firstLine + lineAt(text, literal.start) - 1));
  }
  return chunks;
}

/**
 * كل create table بالملف إله alter table … enable row level security بنفس الملف، بأي مستوى: المراجعة العدائية لقت
 * do $do$ … create table … $do$ يعبر (المستوى الأعلى بس كان ينقرا).
 */
function rlsProblems(file) {
  const problems = [];
  const chunks = sqlChunks(file.text);
  const enabled = new Set(
    chunks.flatMap(({ code }) => [...code.matchAll(/\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([a-z_"][a-z0-9_."]*)\s+enable\s+row\s+level\s+security\b/giu)].map((m) => qualified(m[1]))),
  );
  let tables = 0;
  for (const { code, firstLine } of chunks) {
    for (const match of code.matchAll(/\bcreate\s+(?:(temp|temporary)\s+)?(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?([a-z_"][a-z0-9_."]*)/giu)) {
      if (match[1]) continue;
      tables += 1;
      if (!enabled.has(qualified(match[2]))) problems.push(`${file.name}:${firstLine + lineAt(code, match.index) - 1}: ${match[2]} بلا enable row level security بنفس الملف`);
    }
  }
  return { problems, tables };
}

/** سطر «تراجع:» من 0004: يسمّي rollback_NNNN.sql برقمه وموجود، أو «إضافية فقط» وماكو ملف تراجع. */
function rollbackHeaderProblems(file, number, header, rollbackNumbers) {
  if (number <= LEGACY_THROUGH) return [];
  const line = header.find((entry) => entry.includes('تراجع:')) ?? '';
  const named = /\brollback_(\d{4})\.sql\b/u.exec(line);
  const additive = /تراجع:\s*إضافية فقط/u.test(line);
  const expected = `rollback_${String(number).padStart(4, '0')}.sql`;
  if (named && Number(named[1]) !== number) return [`${file.name}: سطر «تراجع:» يسمّي ${named[0]} والمتوقّع ${expected}`];
  if (named && !rollbackNumbers.has(number)) return [`${file.name}: سطر «تراجع:» يسمّي ${expected} وما موجود`];
  if (!named && !additive) return [`${file.name}: سطر «تراجع:» لازم يسمّي ${expected} أو يكول «إضافية فقط»`];
  if (additive && rollbackNumbers.has(number)) return [`${file.name}: «إضافية فقط» وبيها ${expected} — واحد منهم غلط`];
  return [];
}

export function check(files) {
  const problems = [];
  const numbers = [];
  const rollbacks = [];
  let raises = 0;
  let writes = 0;
  let locking = 0;
  let functions = 0;
  let restored = 0;
  let tables = 0;
  const legacyBodies = legacyFunctionBodies(files);
  const rollbackNumbers = new Set(files.map((file) => ROLLBACK.exec(file.name)).filter(Boolean).map((match) => Number(match[1])));
  for (const file of files) {
    const migration = MIGRATION.exec(file.name);
    const rollback = ROLLBACK.exec(file.name);
    if (!migration && !rollback) {
      problems.push(`${file.name}: اسم مو 0001_وصف.sql ولا rollback_0001.sql — الحزمة ما تطبّقه`);
      continue;
    }
    const raised = raiseProblems(file);
    raises += raised.count;
    problems.push(...raised.problems);
    const scanned = writeAndDateProblems(file);
    writes += scanned.writes;
    problems.push(...scanned.problems);
    const number = Number((migration ?? rollback)[1]);
    problems.push(...mathAndTypeProblems(file));
    const rls = rlsProblems(file);
    tables += rls.tables;
    problems.push(...rls.problems);
    if (number > LEGACY_THROUGH) {
      const locks = lockProblems(file, rollback ? legacyBodies : undefined);
      locking += locks.locking;
      functions += locks.functions;
      restored += locks.restored;
      problems.push(...locks.problems);
    }
    if (rollback) {
      rollbacks.push({ file: file.name, number });
      continue;
    }
    numbers.push({ file: file.name, number });
    const { header, first } = headerAndFirst(file.text);
    if (header.length < 2) problems.push(`${file.name}: رأس يكول المشكلة اللي تحلّها ناقص`);
    if (!header.some((line) => line.includes('تراجع:'))) problems.push(`${file.name}: رأسه بلا سطر «تراجع:»`);
    else problems.push(...rollbackHeaderProblems(file, number, header, rollbackNumbers));
    if (!LOCK.test(first)) problems.push(`${file.name}: أوّل أمر لازم set lock_timeout = '5s'; (طلع «${first.slice(0, 40)}»)`);
  }
  numbers.sort((a, b) => a.number - b.number);
  numbers.forEach((entry, index) => {
    if (entry.number !== index + 1) problems.push(`${entry.file}: الرقم ${entry.number} والمتوقّع ${index + 1} (فجوة أو تكرار)`);
  });
  for (const rollback of rollbacks) {
    if (!numbers.some((entry) => entry.number === rollback.number)) problems.push(`${rollback.file}: ماكو هجرة بنفس الرقم`);
  }
  return { problems, migrations: numbers.length, rollbacks: rollbacks.length, raises, writes, locking, functions, restored, tables };
}

export function selfTest() {
  const raise = (rest) => `do $$ begin\n  raise exception ${rest};\nend $$;\n`;
  const good = "-- 0001_core — المشكلة\n-- تراجع: حذف الجداول\n\nset lock_timeout = '5s';\ncreate table x (id int);\nalter table x enable row level security;\n";
  const cases = [
    [[{ name: '0001_core.sql', text: good }], 0],
    [[{ name: '0001_core.sql', text: "-- 0001 — المشكلة\n-- بلا سطر التراجع\nset lock_timeout = '5s';\n" }], 1],
    [[{ name: '0001_core.sql', text: "-- 0001 — المشكلة\n-- تراجع: حذف\ncreate table x (id int);\nset lock_timeout = '5s';\nalter table x enable row level security;\n" }], 1],
    [[{ name: '0001_core.sql', text: good }, { name: '0003_late.sql', text: good }], 1],
    [[{ name: '0001_core.sql', text: good }, { name: '0001_again.sql', text: good }], 1],
    [[{ name: '0001_core.sql', text: good }, { name: 'rollback_0002.sql', text: '' }], 1],
    [[{ name: '0001_core.sql', text: good }, { name: 'fix.sql', text: good }], 1],
    [[{ name: '0001_core.sql', text: good }, { name: 'rollback_0001.sql', text: '' }], 0],
    [[{ name: '0001_core.sql', text: good + raise("'not_signed_in' using hint = 'سجّل الدخول أولاً.'") }], 0],
    [[{ name: '0001_core.sql', text: good + raise("'date_too_old' using hint = format('لا يُقبل تاريخ قبل %s؛ راجعه.', d)") }], 0],
    [[{ name: '0001_core.sql', text: good + raise("'x_y' using hint = 'نصّ فيه ; فاصلة منقوطة و''اقتباس'''") }], 0],
    [[{ name: '0001_core.sql', text: good + "-- raise exception 'Bad' بتعليق\n" }], 0],
    [[{ name: '0001_core.sql', text: good + raise("'forbidden'") }], 1],
    [[{ name: '0001_core.sql', text: good + raise("'Forbidden!' using hint = 'ممنوع.'") }], 1],
    [[{ name: '0001_core.sql', text: good + raise("'forbidden' using hint = 'ماكو صلاحية.'") }], 1],
    [[{ name: '0001_core.sql', text: good + raise("'forbidden' using hint = 'no access'") }], 1],
    [[{ name: '0001_core.sql', text: good + raise("using message = 'x'") }], 1],
    [[{ name: 'rollback_0001.sql', text: raise("'undo_failed'") }, { name: '0001_core.sql', text: good }], 1],
    [[{ name: '0001_core.sql', text: good + "update public.members set role = 'x' where id = 1;\n" }], 0],
    [[{ name: '0001_core.sql', text: good + "update public.members set role = 'x';\n" }], 1],
    [[{ name: '0001_core.sql', text: good + "update public.members m set role = 'x';\n" }], 1],
    [[{ name: '0001_core.sql', text: good + "delete from public.x;\n" }], 1],
    [[{ name: '0001_core.sql', text: good + "delete from public.x where id = 1;\n" }], 0],
    [[{ name: '0001_core.sql', text: good + "insert into t values (1) on conflict (id) do update set v = 2;\n" }], 0],
    [[{ name: '0001_core.sql', text: good + "create trigger t before update or delete on public.a for each row execute function f();\n" }], 0],
    [[{ name: '0001_core.sql', text: good + "update public.t set note = 'where';\n" }], 1],
    [[{ name: '0001_core.sql', text: good + "select current_date;\n" }], 1],
    [[{ name: '0001_core.sql', text: good + "select now()::date;\n" }], 1],
    [[{ name: '0001_core.sql', text: good + "select localtimestamp;\n" }], 1],
    [[{ name: '0001_core.sql', text: good + "select (now() at time zone 'Asia/Baghdad')::date;\n" }], 0],
    [[{ name: '0001_core.sql', text: good + "-- current_date بتعليق\nselect 1;\n" }], 0],
    [[{ name: '0001_core.sql', text: good + "select current_date; -- date-ok: سبب مكتوب\n" }], 0],
    [[{ name: '0001_core.sql', text: good + "select 'current_date';\n" }], 0],
    // المراجعة العدائية لـ0002: WHERE بمستوى الأمر بس، وSQL داخل النصوص، والتعليقات /* */، والمعرّفات المقتبسة.
    ...[
      ['update public.x set total = (select sum(v) from public.y where y.k = x.k);', 1],
      ['with x as (update t set a = 1 returning id) select * from x where id > 0;', 1],
      ['delete from t using (select id from u where u.x) s;', 1],
      ['update t set a = 1 returning (select b from c where c.id = t.id);', 1],
      ['update t set a = (select b from c where c.id = t.id) where t.id = 1;', 0],
      ["execute format('update public.%I set archived_at = now()', tbl);", 1],
      ["execute 'delete from public.t';", 1],
      ["execute 'delete from public.t where id = 1';", 0],
      ['update "T" set a = 1;', 1],
      ['update public."t" set a = 1;', 1],
      ['update t set a = 1 /* where */;', 1],
      ['/* update t set a = 1; */ select 1;', 0],
      ["select $x$it's$x$; update t set a = 1; select 'x';", 1],
      ['create function f() returns void language sql as $fn$ update t set a = 1 $fn$;', 1],
      // التاريخ: كل مصدر يتبع منطقة الجلسة، والآمن ما ينمسك.
      ['select created_at::date from t;', 1],
      ['select clock_timestamp()::date;', 1],
      ['select cast(now() as date);', 1],
      ["select date_trunc('day', now());", 1],
      ["select to_char(now(), 'YYYY-MM-DD');", 1],
      ["select 'today'::date;", 1],
      ['select now ()::date;', 1],
      ['select date(now());', 1],
      ['select extract(dow from now());', 1],
      ['select now()::time;', 1],
      ['select current_timestamp::date;', 1],
      ['create function f() returns date language sql as $fn$ select current_date $fn$;', 1],
      ["select to_char(p_date, 'DD/MM/YYYY');", 0],
      ["select date_trunc('day', created_at at time zone 'Asia/Baghdad') from t;", 0],
      ["select '2026-01-01'::date;", 0],
      ['select created_at::timestamptz from t;', 0],
      ['select created_at::timestamp with time zone from t;', 0],
    ].map(([sql, expected]) => [[{ name: '0001_core.sql', text: `${good}${sql}\n` }], expected]),
    // المرحلة 1: التقريب والأنواع وRLS على كل هجرة (القديمة سليمة منها)، كل شكل مرّة وحدة.
    ...[
      ['select round(a / b, 2);', 1],
      ['select round(a, 2);', 0],
      ["select round(a, 2) from t where note = 'x / y';", 0],
      ['create function f() returns numeric language sql as $fn$ select round(x / 3, 2) $fn$;', 1],
      // المراجعة العدائية: الوسم ما يعفي (كان يعبّر round(a*b/3, 2) بأي سبب)، وكل شكل قسمة مرّة وحدة بالضبط.
      ['create function private._mul_div_round(q numeric) returns numeric language sql as $fn$\n  select round(div(q, 2) / 10, 2) -- round-ok: جسم المساعد نفسه\n$fn$;', 1],
      ['select round(a / b, 2); -- round-ok: سبب', 1],
      ['select floor(a * b / c);', 1],
      ['select floor(a / b);', 1],
      ['select trunc(q * v / l, 2) from t;', 1],
      ['select ceil(q * v / l) from t;', 1],
      ['select (q * v / l)::bigint from t;', 1],
      ['select cast(q * v / l as integer) from t;', 1],
      ['create function f(q numeric, v numeric, l numeric) returns numeric language plpgsql as $fn$ declare x numeric; begin x := q * v / l; return round(x, 2); end $fn$;', 1],
      ['create function f(q numeric) returns numeric language sql as $$ select round(q * 3 / 7, 2) $$;', 1],
      ['select round(q * v * power(l, -1), 2) from t;', 1],
      ['select round(q * v * l ^ -1, 2) from t;', 1],
      ['select div(a * b, c), mod(a, c) from t;', 0],
      ['select round(x * power(10::numeric, -p_n), 2) from t;', 0],
      ["select to_char(d, 'DD/MM/YYYY') /* a / b */ from t; -- c / d", 0],
      ['create table t (q float); alter table t enable row level security;', 1],
      ['create table t (q real); alter table t enable row level security;', 1],
      ['create table t (q double precision); alter table t enable row level security;', 1],
      ['create table t (q float8); alter table t enable row level security;', 1],
      ['create table t (q numeric(12,2)); alter table t enable row level security;', 1],
      ['create table t (q numeric check (q = round(q, 2))); alter table public.t enable row level security;', 0],
      ['create function f() returns void language plpgsql as $fn$ declare v float; begin null; end $fn$;', 1],
      ['create table public.t (id int);', 1],
      ['create table if not exists private.t (id int); alter table private.t enable row level security;', 0],
      ['create table t (id int); alter table private.t enable row level security;', 1],
      ['create temp table t (id int);', 0],
      ['-- create table t (id int);\nselect 1;', 0],
      // create table داخل do (بوسم أو بـ$$) أو execute '…' ينحسب، وRLS خارجه يكفيه.
      ['do $do$ begin if not exists (select 1) then create table public.t (id int); end if; end $do$;', 1],
      ['do $$ begin create table public.t (id int); end $$;', 1],
      ["do $do$ begin execute 'create table public.t (id int)'; end $do$;", 1],
      ['do $do$ begin create table public.t (id int); end $do$;\nalter table public.t enable row level security;', 0],
    ].map(([sql, expected]) => [[{ name: '0001_core.sql', text: `${good}${sql}\n` }], expected]),
    // من 0004: سطر «تراجع:» يسمّي ملفه الموجود أو يكول «إضافية فقط»، والدالّة اللي تقفل تحدّد lock_timeout قبل أوّل قفل.
    ...[
      ['-- تراجع: إضافية فقط', '', [], 0],
      ['-- تراجع: rollback_0004.sql يرجّع الدوالّ', '', ['rollback_0004.sql'], 0],
      ['-- تراجع: rollback_0004.sql', '', [], 1],
      ['-- تراجع: rollback_0005.sql', '', ['rollback_0004.sql'], 1],
      ['-- تراجع: حذف الجداول', '', [], 1],
      ['-- تراجع: إضافية فقط', '', ['rollback_0004.sql'], 1],
      ['-- تراجع: إضافية فقط', "create function f(p uuid) returns void language plpgsql as $fn$ begin perform 1 from t where id = p for update; end $fn$;", [], 1],
      ['-- تراجع: إضافية فقط', "create function f(p uuid) returns void language plpgsql as $fn$ begin set local lock_timeout = '5s'; perform pg_advisory_xact_lock(1); end $fn$;", [], 0],
      // المهلة '5s' بالضبط (§2.3): مهلة ثانية مو المهلة المتّفق عليها (طفرة الاختبار: أي '\d+s' كان يعبر).
      ['-- تراجع: إضافية فقط', "create function f(p uuid) returns void language plpgsql as $fn$ begin set local lock_timeout = '6s'; perform pg_advisory_xact_lock(1); end $fn$;", [], 1],
      ['-- تراجع: إضافية فقط', "create or replace function f() returns void language plpgsql as $fn$ begin perform pg_advisory_xact_lock(1); set local lock_timeout = '5s'; end $fn$;", [], 1],
      ['-- تراجع: إضافية فقط', "create function f() returns void language plpgsql as $fn$ begin -- set local lock_timeout = '5s';\n perform 1 from t for no key update; end $fn$;", [], 1],
      ['-- تراجع: إضافية فقط', "create function f() returns text language sql as $fn$ select 'for update' $fn$;", [], 0],
      ['-- تراجع: إضافية فقط', 'do $do$ begin perform 1 from t for update; end $do$;', [], 0],
      // المراجعة العدائية: أجسام $$ (شكل كل الهجرات) تنقرا، وجسم بنصّ '…' ما يعبر.
      ['-- تراجع: إضافية فقط', 'create function f(p uuid) returns void language plpgsql as $$ begin perform 1 from t where id = p for update; end $$;', [], 1],
      ['-- تراجع: إضافية فقط', 'create function f() returns void language plpgsql as $$ begin perform pg_advisory_xact_lock(1); end $$;', [], 1],
      ['-- تراجع: إضافية فقط', "create function f() returns void language plpgsql as $$ begin set local lock_timeout = '5s'; perform pg_advisory_xact_lock(1); end $$;", [], 0],
      ['-- تراجع: إضافية فقط', "create function f() returns void language sql as 'select 1 from t for update';", [], 1],
      ['-- تراجع: إضافية فقط', 'do $$ begin perform 1 from t for update; end $$;', [], 0],
      // قفل المشاركة (for share / for key share) قفل هو هم: ينام على صفّ مقفول للتعديل (0005: المخزن يقفل موقعه).
      ['-- تراجع: إضافية فقط', 'create function f(p uuid) returns void language plpgsql as $$ begin perform 1 from t where id = p for share; end $$;', [], 1],
      ['-- تراجع: إضافية فقط', 'create function f(p uuid) returns void language plpgsql as $$ begin perform 1 from t where id = p for key share; end $$;', [], 1],
      ['-- تراجع: إضافية فقط', "create function f(p uuid) returns void language plpgsql as $$ begin set local lock_timeout = '5s'; perform 1 from t where id = p for share of t; end $$;", [], 0],
    ].map(([line, sql, extra, expected]) => [
      [
        { name: '0001_core.sql', text: good },
        { name: '0002_more.sql', text: good },
        { name: '0003_more.sql', text: good },
        { name: '0004_phase1.sql', text: `-- 0004_phase1 — المشكلة\n${line}\n\nset lock_timeout = '5s';\n${sql}\n` },
        ...extra.map((name) => ({ name, text: 'select 1;\n' })),
      ],
      expected,
    ]),
    // القديمة (0001–0003) معفيّة من قاعدة القفل: أجسامها بالإنتاج وتتبدّل بهجرة جديدة بس.
    [[{ name: '0001_core.sql', text: `${good}create function f() returns void language plpgsql as $fn$ begin perform pg_advisory_xact_lock(1); end $fn$;\n` }], 0],
  ];
  // ملف التراجع يرجّع جسماً قديماً يقفل بلا مهلة (0001 قبل القاعدة): الحرفي يعبر ويتعدّ «مرجَّعاً»، والمختلف بحرف ينمسك،
  // ونفس الجسم بهجرة جديدة ينمسك (الإعفاء لملف التراجع بس).
  const legacyLock = 'create or replace function public.f() returns void language plpgsql as $$ begin perform pg_advisory_xact_lock(1); end $$;\n';
  const withRollback = (rollbackText, migrationExtra = '') => [
    { name: '0001_core.sql', text: good + legacyLock },
    { name: '0002_more.sql', text: good },
    { name: '0003_more.sql', text: good },
    { name: '0004_phase1.sql', text: `-- 0004_phase1 — المشكلة\n-- تراجع: rollback_0004.sql\n\nset lock_timeout = '5s';\n${migrationExtra}` },
    { name: 'rollback_0004.sql', text: `-- تراجع 0004\nset lock_timeout = '5s';\n${rollbackText}` },
  ];
  const verbatim = check(withRollback(legacyLock));
  if (verbatim.problems.length !== 0 || verbatim.restored !== 1) return `ملف تراجع يرجّع جسماً قديماً حرفياً: توقّعت 0 مخالفة و1 مرجَّع، وطلع ${verbatim.problems.length} و${verbatim.restored}: ${verbatim.problems.join(' | ')}`;
  const edited = check(withRollback(legacyLock.replace('perform', 'perform  ')));
  if (edited.problems.length !== 1 || edited.restored !== 0) return `ملف تراجع بجسم مختلف بحرف: توقّعت مخالفة وحدة، وطلع ${edited.problems.length}: ${edited.problems.join(' | ')}`;
  const copied = check(withRollback('select 1;\n', legacyLock));
  if (copied.problems.length !== 1) return `الجسم القديم حرفياً بهجرة جديدة (مو تراجع): توقّعت مخالفة وحدة، وطلع ${copied.problems.length}: ${copied.problems.join(' | ')}`;
  // الإعفاء لأجسام الدوالّ القديمة بس: كتلة do بـ0001 بنفس النصّ ما تعفي دالّة بملف التراجع (اختبار الطفرات WP2). النصّ
  // يتركّب بالجمع، مو بـreplace: «$$» بنصّ الاستبدال يصير «$» (درس String.replace).
  const fromDo = withRollback(`create or replace function public.g() returns void language plpgsql as ${legacyLock.slice(legacyLock.indexOf('$$'))}`);
  fromDo[0] = { name: '0001_core.sql', text: `${good}do ${legacyLock.slice(legacyLock.indexOf('$$'))}` };
  const doBody = check(fromDo);
  if (doBody.problems.length !== 1 || doBody.restored !== 0) return `دالّة بملف التراجع بجسم كتلة do قديمة: توقّعت مخالفة وحدة، وطلع ${doBody.problems.length}: ${doBody.problems.join(' | ')}`;
  // ضابط العدّ: دالّة 0004 بـ$$ تنحسب دالّة، والتي تقفل تنحسب تقفل (الملخّص «0 دالّة» كان يخبّي إن القاعدة ما شافت شي).
  const counted = check([
    { name: '0001_core.sql', text: good },
    { name: '0002_more.sql', text: good },
    { name: '0003_more.sql', text: good },
    { name: '0004_phase1.sql', text: "-- 0004_phase1 — المشكلة\n-- تراجع: إضافية فقط\n\nset lock_timeout = '5s';\ncreate function f() returns void language plpgsql as $$ begin set local lock_timeout = '5s'; perform pg_advisory_xact_lock(1); end $$;\ncreate function g() returns int language sql as $$ select 1 $$;\n" },
  ]);
  if (counted.functions !== 2 || counted.locking !== 1) return `عدّ الدوالّ: توقّعت 2 ومنها 1 تقفل، وطلع ${counted.functions} و${counted.locking}`;
  for (const [files, expected] of cases) {
    const { problems } = check(files);
    if (problems.length !== expected) {
      return `توقّعت ${expected} مخالفة وطلع ${problems.length}: ${files.map((f) => f.name).join('، ')} (${problems.join(' | ') || files.at(-1).text.slice(-80)})`;
    }
  }
  return null;
}

export function run() {
  const dir = path.join(ROOT, 'supabase', 'migrations');
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((entry) => entry.endsWith('.sql') || !entry.startsWith('.'))
        .map((entry) => ({ name: entry, text: readFileSync(path.join(dir, entry), 'utf8') }))
    : [];
  const result = check(files);
  return {
    scanned: result.migrations,
    problems: result.problems,
    summary: `فحصت ${result.migrations} هجرة و${result.rollbacks} ملف تراجع: الأسماء بالتسلسل، الرأس وسطر «تراجع:» (من 0004 يسمّي ملفه أو «إضافية فقط»)، lock_timeout أوّلاً، ${result.raises} raise exception برمز وتلميح فصيح، و${result.writes} UPDATE/DELETE بـWHERE وبلا تاريخ يتبع منطقة الجلسة، و${result.tables} جدولاً بـRLS بنفس الملف، و${result.functions} دالّة من 0004 جسمها بين علامتي دولار، منها ${result.locking} تقفل بـlock_timeout قبل أوّل قفل (و${result.restored} جسماً قديماً يرجّعه ملف تراجع حرفياً)، وبلا قسمة «/» ولا مقلوب ولا فاصلة عائمة ولا numeric(p,s)`,
  };
}
