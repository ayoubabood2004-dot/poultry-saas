// migration-guard (FOUNDATION ٨٤٥): كل هجرة اسمها مرقّم بالتسلسل (0001_…) بلا فجوة ولا تكرار، رأسها يكول المشكلة
// وبيه سطر «تراجع:»، وأوّل أمر بيها set lock_timeout = '5s' حتى قفل طويل ما يعلّق الإنتاج. ملف rollback_NNNN لازم
// إله هجرة بنفس الرقم. وأي .sql بغير هالشكلين ينمسك: الحزمة (supabase/tests/run.mjs) تطبّق ^\d{4}_ بس، فملف بغير
// اسم يعبر بصمت بلا فحص. يقرأ الملفات بلا قاعدة، فيشتغل بـlint وbuild.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

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

export function check(files) {
  const problems = [];
  const numbers = [];
  const rollbacks = [];
  for (const file of files) {
    const migration = MIGRATION.exec(file.name);
    const rollback = ROLLBACK.exec(file.name);
    if (!migration && !rollback) {
      problems.push(`${file.name}: اسم مو 0001_وصف.sql ولا rollback_0001.sql — الحزمة ما تطبّقه`);
      continue;
    }
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
  return { problems, migrations: numbers.length, rollbacks: rollbacks.length };
}

export function selfTest() {
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
    summary: `فحصت ${result.migrations} هجرة و${result.rollbacks} ملف تراجع: الأسماء بالتسلسل، الرأس وسطر «تراجع:»، وlock_timeout أوّلاً`,
  };
}
