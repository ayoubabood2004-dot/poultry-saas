import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

// زرّ الرجوع الواضح أعلى صفحات التفاصيل (كلمة المالك 2026-11-08: «لما ادخل لسجل مادة معينة ماكو زر رجوع واضح»): كان رابطاً نصّياً صغيراً
// في طرف العنوان، فصار زرّاً بسهم وكلمة «رجوع إلى…» قبل العنوان، في الموضع نفسه بكلّ صفحة. تستورده صفحات المخزون والمعمل وحدها (حزمتان
// خارج التثبيت المسبق)، فيبقى معهما خارجه.

/** طريق رجوع من الرابط (?back=): مسار داخليّ في المخزن أو المعمل أو الحقول وحده، وإلّا البديل. */
export function backTarget(value: string | null, fallback: string): string {
  return value !== null && /^\/(?:inventory|mill|broiler|layers)(?:[/?][\w\-/=&%.?]*)?$/u.test(value) ? value : fallback;
}

export function BackButton({ to, label, action = 'back' }: { to: string; label: string; action?: string }) {
  return (
    <Link to={to} className="inline-flex h-10 items-center gap-2 self-start rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-surface-2" data-action={action}>
      <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
      {label}
    </Link>
  );
}
