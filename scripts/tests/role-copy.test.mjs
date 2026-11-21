// «الكلّ مثل المالك بكلّ شيء» (كلمة المالك 2026-11-21، 0034): كلّ عضو يرى ويفعل كلّ شيء في المنشأة كلّها، وإدارة الموظفين للمالك وحده.
// فلا نصّ معروض (t() أو <Trans>) يسمّي دوراً على أنّه وحده من يفعل شيئاً («يختمها المحاسب أو المدير»، «للمدير ومالك المنشأة»)، ولا يحيل
// إلى نطاق محرّر الموظفين المحذوف («خارج نطاقك»، «يحدّد مالك المنشأة نطاقك») — النصّ يصف الخطوة أو السبب الحقيقيّ. يُستثنى ما هو
// اسم دور نفسه (أسماء الأدوار وخانات التوقيع على الأوراق)، وإدارة الموظفين (/staff وعضوية الحساب: للمالك وحده فعلاً)، ونصوص القيود.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const ROLE_WORDS = /مدير|محاسب|أمين المخزن|الأمين|مالك|عامل القاعة|مشغّل|المشاهد|نطاق|دورك|أدوار الكلفة/u;
const CALL = /\bt\(\s*'([^']+)'\s*,\s*'((?:[^'\\]|\\.)*)'/gu;
const TRANS = /<Trans\s+k="([^"]+)"\s+text="([^"]*)"/gu;

/** مفاتيح مسموح فيها اسم دور: أسماء الأدوار، وخانات التوقيع، وإدارة الموظفين والعضوية، ونصوص القيود ووصف الدفاتر. */
function allowed(key) {
  if (/^(role|staff|constraint)\./u.test(key)) return true;
  if (/\.sign\.|^cashday\.(cashier|accountant)$/u.test(key)) return true;
  return new Set([
    // الخروج من المنشأة وإنشاؤها: الملكية نفسها (إدارة الأعضاء للمالك وحده).
    'account.leave.consequence',
    'welcome.create.subtitle',
    // منع بعضوية الحساب نفسها (لا بدور عمل): يسأل المالكَ لأنّ إدارة الأعضاء له وحده.
    'halls.close.why.role',
    'birds.role',
    // «قائمة دخل محاسبية» صفة لا دور.
    'monthsum.disclaimer',
  ]).has(key);
}

function sources() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/u.test(name)) out.push(full);
    }
  };
  walk(path.join(ROOT, 'src'));
  return out;
}

export default async function (t) {
  const found = [];
  let scanned = 0;
  for (const file of sources()) {
    const text = readFileSync(file, 'utf8');
    for (const re of [CALL, TRANS]) {
      for (const match of text.matchAll(re)) {
        scanned += 1;
        if (ROLE_WORDS.test(match[2]) && !allowed(match[1])) found.push(`${path.relative(ROOT, file)} ${match[1]}: ${match[2]}`);
      }
    }
  }
  t.ok(scanned > 3000, `ضابط: المسح قرأ نصوص الواجهة (${scanned})`);
  t.same(found, [], 'لا نصّ معروض يسمّي دوراً وحده لفعل أو يحيل إلى نطاق الموظفين (0034)');
  // ضابط: المسح يمسك ما يحرسه (نصّ قديم بعينه، ونصّ مسموح يعبر).
  const probe = "t('x.y', 'يختمها المحاسب أو المدير'); t('role.manager', 'المدير'); t('x.z', 'لا مخزن في نطاقك.')";
  const caught = [...probe.matchAll(CALL)].filter((match) => ROLE_WORDS.test(match[2]) && !allowed(match[1])).map((match) => match[1]);
  t.same(caught, ['x.y', 'x.z'], 'ضابط: المسح يمسك تسمية الدور والنطاق، ويعبر اسم الدور نفسه');
}
