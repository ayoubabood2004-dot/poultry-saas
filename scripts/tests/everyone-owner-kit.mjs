// «الكلّ مثل المالك بكلّ شيء» (كلمة المالك 2026-11-21، 0034): my_workspace يجيب كلّ عضو فعّال بـcan_see_cost وcan_see_accounts
// وcan_see_sales صحيحة، وأعلام الصفوف (can_*) كما يجيب المالك، وcan(role, x) صحيح لكلّ فعل عدا members.manage؛ فالدور يرتّب أزرار
// الرئيسية وحده. هذه أداة لفحوص الشاشات (ليست ملف فحص): كلّ ملف يرسم شاشته بعُدّته وبدائله هو، لكلّ دور بجواب الخادم نفسه، ويقارن
// ما رُسم بما رُسم للمالك حرفاً حرفاً — فطفرة تعيد بوّابة دور واحدة في أيّ شاشة تُفشله.
import { serialize } from './dom.mjs';

export const MEMBER_ROLES = ['owner', 'manager', 'storekeeper', 'mill_operator', 'hatchery_operator', 'hall_worker', 'accountant', 'viewer'];

/** أعلام جلسة العضو بعد 0034 (كلّ دور). */
export const MEMBER_FLAGS = Object.freeze({ canSeeCost: true, canSeeAccounts: true, canSeeSales: true });

/** بصمة ما رُسم: عقدة DOM (dom.mjs) أو HTML نصّاً، ومعرّفات useId بلا عدّادها (عدّاد React عامّ عبر الجذور والرسمات). */
export function printOf(nodeOrHtml) {
  const html = typeof nodeOrHtml === 'string' ? nodeOrHtml : serialize(nodeOrHtml);
  return html.replace(/:r[0-9a-z]*:/giu, ':id:').replace(/«r[0-9a-z]*»/giu, '«id»');
}

function firstDiff(a, b) {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i += 1;
  const at = Math.max(0, i - 60);
  return `عند ${i}: المالك «${a.slice(at, i + 80)}» وهنا «${b.slice(at, i + 80)}»`;
}

/**
 * يرسم الشاشة لكلّ دور بجواب الخادم نفسه ويقارن بصمتها ببصمة المالك. render(role) يرجّع البصمة (printOf)، ويتولّى الرسم والإزالة.
 * must: نصوص لا بدّ منها في بصمة المالك — ضابط أنّ الشاشة رُسمت وفيها ما يحرسه الفحص (زرّ أو عمود مال)، وإلّا فالتطابق بلا معنى.
 * ورسم المالك مرّتين ضابط أنّ البصمة ثابتة بلا فرق دور (معرّف عشوائيّ أو وقت)، فالفرق بعده فرق دور.
 */
export async function everyoneLikeOwner(t, label, render, must = []) {
  const owner = await render('owner');
  t.same(must.filter((piece) => !owner.includes(piece)), [], `${label}: ضابط: ما يحرسه الفحص مرسوم للمالك`);
  const again = await render('owner');
  t.ok(again === owner, `${label}: ضابط: رسم المالك ثابت بين رسمتين (${again === owner ? '' : firstDiff(owner, again)})`);
  const differs = [];
  for (const role of MEMBER_ROLES.slice(1)) {
    const got = await render(role);
    if (got !== owner) differs.push(`${role} ${firstDiff(owner, got)}`);
  }
  t.same(differs, [], `${label}: كلّ دور يرى ما يراه المالك بجواب الخادم نفسه (0034)`);
}
