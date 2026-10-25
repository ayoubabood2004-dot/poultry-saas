// migration-guard (FOUNDATION ٨٤٥): كل هجرة اسمها مرقّم بالتسلسل (0001_…) بلا فجوة ولا تكرار، رأسها يكول المشكلة
// وبيه سطر «تراجع:»، وأوّل أمر بيها set lock_timeout = '5s' حتى قفل طويل ما يعلّق الإنتاج. ملف rollback_NNNN لازم
// إله هجرة بنفس الرقم. وأي .sql بغير هالشكلين ينمسك: الحزمة (supabase/tests/run.mjs) تطبّق ^\d{4}_ بس، فملف بغير
// اسم يعبر بصمت بلا فحص. وكل raise exception برمز snake_case (الواجهة تترجم الرمز) ويّا using hint عربي فصيح
// (التلميح هو اللي يشوفه المستخدم، FOUNDATION ٥٢٢)، والتلميح يعبر من نفس فحص اللهجة مال i18n-guard. يقرأ الملفات
// بلا قاعدة، فيشتغل بـlint وbuild.
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
 * الشفرة بلا تعليقات (-- و/* *\/ المتداخلة) وبلا محتوى النصوص ('…' و$tag$…$tag$)، بفراغات بنفس الطول فالمواضع
 * والأسطر تبقى. أجسام $$ تبقى شفرة، والمعرّفات "…" تبقى كما هي. literals: محتوى كل نصّ وموضعه، حتى SQL الديناميكي
 * (execute '…' وformat) وأجسام $tag$ تنفحص هي هم.
 */
function lex(text) {
  let code = '';
  const literals = [];
  let i = 0;
  while (i < text.length) {
    const tag = text[i] === '$' ? /^\$[a-z_][a-z0-9_]*\$/iu.exec(text.slice(i)) : null;
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

export function check(files) {
  const problems = [];
  const numbers = [];
  const rollbacks = [];
  let raises = 0;
  let writes = 0;
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
    if (rollback) {
      rollbacks.push({ file: file.name, number: Number(rollback[1]) });
      continue;
    }
    numbers.push({ file: file.name, number: Number(migration[1]) });
    const { header, first } = headerAndFirst(file.text);
    if (header.length < 2) problems.push(`${file.name}: رأس يكول المشكلة اللي تحلّها ناقص`);
    if (!header.some((line) => line.includes('تراجع:'))) problems.push(`${file.name}: رأسه بلا سطر «تراجع:»`);
    if (!LOCK.test(first)) problems.push(`${file.name}: أوّل أمر لازم set lock_timeout = '5s'; (طلع «${first.slice(0, 40)}»)`);
  }
  numbers.sort((a, b) => a.number - b.number);
  numbers.forEach((entry, index) => {
    if (entry.number !== index + 1) problems.push(`${entry.file}: الرقم ${entry.number} والمتوقّع ${index + 1} (فجوة أو تكرار)`);
  });
  for (const rollback of rollbacks) {
    if (!numbers.some((entry) => entry.number === rollback.number)) problems.push(`${rollback.file}: ماكو هجرة بنفس الرقم`);
  }
  return { problems, migrations: numbers.length, rollbacks: rollbacks.length, raises, writes };
}

export function selfTest() {
  const raise = (rest) => `do $$ begin\n  raise exception ${rest};\nend $$;\n`;
  const good = "-- 0001_core — المشكلة\n-- تراجع: حذف الجداول\n\nset lock_timeout = '5s';\ncreate table x (id int);\n";
  const cases = [
    [[{ name: '0001_core.sql', text: good }], 0],
    [[{ name: '0001_core.sql', text: "-- 0001 — المشكلة\n-- بلا سطر التراجع\nset lock_timeout = '5s';\n" }], 1],
    [[{ name: '0001_core.sql', text: "-- 0001 — المشكلة\n-- تراجع: حذف\ncreate table x (id int);\nset lock_timeout = '5s';\n" }], 1],
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
  ];
  for (const [files, expected] of cases) {
    const found = check(files).problems.length;
    if (found !== expected) return `توقّعت ${expected} مخالفة وطلع ${found}: ${files.map((f) => f.name).join('، ')}`;
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
    summary: `فحصت ${result.migrations} هجرة و${result.rollbacks} ملف تراجع: الأسماء بالتسلسل، الرأس وسطر «تراجع:»، lock_timeout أوّلاً، ${result.raises} raise exception برمز وتلميح فصيح، و${result.writes} UPDATE/DELETE بـWHERE وبلا تاريخ يتبع منطقة الجلسة`,
  };
}
