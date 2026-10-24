// السقوف تنزل وما تصعد إلا بقرار مكتوب سببه بجنبه (docs/DECISIONS.md): كل قياس ينكتب بسجلّه.
// --measure ينزّل السقف بحرّية؛ الصعود يرفضه إلا ويّا --raise="السبب"، والسبب ينكتب بسطر السجلّ.
// بلا هذا الرفض، استيراد ضال يفشّل البناء و--measure يرفع السقف ويخضّره بلا ما أحد يقرّر.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

const FILE = path.join(ROOT, 'scripts', 'guards', 'budgets.json');

export const RAISE_COMMAND = 'node scripts/guards/run.mjs --dist --measure --raise="السبب"';

export function readBudgets() {
  return JSON.parse(readFileSync(FILE, 'utf8'));
}

export function saveBudgets(budgets) {
  writeFileSync(FILE, `${JSON.stringify(budgets, null, 2)}\n`);
}

/**
 * قرار سقف مقيس بلا كتابة: { budgets, refused }. ينزل (أو أوّل قياس) بحرّية،
 * ويصعد بس ويّا raise (السبب) اللي ينكتب بسطر السجلّ؛ بلاه refused يحمل الأمر المطلوب.
 */
export function applyBudget(budgets, key, value, note, raise = null) {
  const previous = budgets[key] ?? null;
  const raising = previous !== null && value > previous;
  if (raising && !raise) {
    return { budgets, refused: `سقف ${key} يصعد من ${previous} إلى ${value} — الصعود قرار مكتوب: ${RAISE_COMMAND}` };
  }
  const entry = { key, from: previous, to: value, note };
  if (raising) entry.raise = raise;
  return { budgets: { ...budgets, [key]: value, history: [...budgets.history, entry] }, refused: null };
}

/**
 * السقف اللي ينحكم عليه هالتشغيل. بلا --measure: القديم. بـ--measure: الجديد إذا انقبل (نزل أو انرفع بسبب)،
 * وإلا القديم ويّا الرفض، فالقياس يتقارن بالسقف القديم قبل ما ينكتب شي. next = الملف الجديد للحفظ أو null.
 */
export function measuredCeiling(budgets, key, value, note, { measure = false, raise = null } = {}) {
  if (!measure) return { ceiling: budgets[key] ?? null, next: null, refused: null };
  const outcome = applyBudget(budgets, key, value, note, raise);
  if (outcome.refused) return { ceiling: budgets[key] ?? null, next: null, refused: outcome.refused };
  return { ceiling: value, next: outcome.budgets, refused: null };
}

/** فحص ذاتي مشترك لقرار السقف: يفشل إذا الصعود يعبر بلا سبب أو السبب ما ينكتب. */
export function budgetSelfTest() {
  const start = { a: 1000, history: [] };
  const up = measuredCeiling(start, 'a', 1500, 'n', { measure: true });
  if (!up.refused || up.next !== null || up.ceiling !== 1000) return 'سقف صعد بلا --raise';
  if (!up.refused.includes('--raise=')) return 'رفض الصعود ما يطبع الأمر المطلوب';
  const raised = measuredCeiling(start, 'a', 1500, 'n', { measure: true, raise: 'مكتبة الرسوم' });
  if (raised.refused || raised.ceiling !== 1500 || raised.next?.history.at(-1)?.raise !== 'مكتبة الرسوم') return 'الصعود بسبب ما انكتب سببه بالسجلّ';
  const down = measuredCeiling(start, 'a', 800, 'n', { measure: true });
  if (down.refused || down.ceiling !== 800 || down.next?.a !== 800 || 'raise' in down.next.history.at(-1)) return 'النزول لازم يعبر بحرّية';
  const first = measuredCeiling({ a: null, history: [] }, 'a', 900, 'n', { measure: true });
  if (first.refused || first.ceiling !== 900) return 'أوّل قياس لازم ينكتب';
  const plain = measuredCeiling(start, 'a', 1500, 'n');
  if (plain.next !== null || plain.ceiling !== 1000) return 'بلا --measure ما ينكتب شي';
  return null;
}

/** سقف مقيس: المقيس + ٢٪ حتى بصمة البناء ما تهزّه، مقرّب لأعلى ١٠٠ بايت. */
export function ceilingFor(measured) {
  return Math.ceil((measured * 1.02) / 100) * 100;
}
