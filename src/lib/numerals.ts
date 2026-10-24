// قانون المالك للأرقام (docs/DECISIONS.md، 2026-10-24): كل رقم معروض بأرقام غربية وفواصل آلاف دائماً.
// هنا أساس التجميع بلا أي استيراد، حتى i18n.tsx يستعمله بلا دائرة ويّا format.ts (اللي يستعمل t()).

/** فواصل الآلاف على سلسلة أرقام بلا إشارة: «1250000» ← «1,250,000». */
export function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** عدد bigint بفواصل وإشارته. */
export function groupSigned(value: bigint): string {
  return value < 0n ? `-${group((-value).toString())}` : group(value.toString());
}

/**
 * عدد صحيح فقط (عدد طيور، بيض، فواتير) بنوع number. يرمي على أي كسر حتى ما يخفي كمية.
 * bigint مرفوض بالنوع ووقت التشغيل: Milli وFils نوعهم bigint، والكمية بالآلاف تنعرض ألف ضعف («1,380,000» عن 1,380).
 */
export function fmtInt(value: number): string {
  // typeof يمسك اللي يفلت من النوع (any أو JS).
  if (typeof value !== 'number') throw new TypeError('fmtInt_not_number');
  if (!Number.isSafeInteger(value)) throw new RangeError('fmtInt_not_integer');
  return groupSigned(BigInt(value));
}
