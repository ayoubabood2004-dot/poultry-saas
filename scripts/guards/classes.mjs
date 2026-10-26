// تصنيف الجداول من supabase/tests/classes.json (خطّة المرحلة 1 §2.10): نفس الملف اللي catalog.test يقارن بيه الكتالوج،
// فالحارس والقاعدة ما يفترقون. القائمة اليدوية بالحارس كانت ناقصة receipt_revaluations وunits وcash_accounts.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

export const CLASSES_PATH = path.join(ROOT, 'supabase', 'tests', 'classes.json');

export function loadClasses(text = readFileSync(CLASSES_PATH, 'utf8')) {
  return JSON.parse(text);
}

/** ما يكتبه إلا دالّة: الموجود (functionOnly) والمحجوز للمراحل الجاية. */
export function functionOnlyTables(classes = loadClasses()) {
  return new Set([...classes.functionOnly, ...(classes.reserved?.functionOnly ?? [])]);
}

/** جداول المال والكلف: سياستا الكلفة والحسابات المقيِّدتان، والمحجوز للمراحل الجاية. */
export function moneyTables(classes = loadClasses()) {
  return new Set([...classes.costRestricted, ...classes.accountsRestricted, ...(classes.reserved?.money ?? [])]);
}
