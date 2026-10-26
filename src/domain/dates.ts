// «اليوم» بالخادم يوم بغداد من app_today()، وبالواجهة اليوم المحلّي للجهاز.
// لا تاخذ اليوم من تحويل ISO: يعطي يوم غرينتش، وجولات الحقل الليلية انسجّلت باليوم الغلط بـdoctorVet.

/** تاريخ يوم بصيغة YYYY-MM-DD. */
export type Day = string;

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/** اليوم المحلّي من مكوّنات الجهاز. */
export function localDay(at: Date = new Date()): Day {
  return `${pad(at.getFullYear(), 4)}-${pad(at.getMonth() + 1, 2)}-${pad(at.getDate(), 2)}`;
}

function dayToUtc(day: Day): number {
  const match = DAY_PATTERN.exec(day);
  if (!match) throw new RangeError('bad_day');
  const [, y, m, d] = match;
  const time = Date.UTC(Number(y), Number(m) - 1, Number(d)); // number-ok: سنة وشهر ويوم من نصّ YYYY-MM-DD، مو فلوس
  const check = new Date(time);
  if (check.getUTCDate() !== Number(d) || check.getUTCMonth() !== Number(m) - 1) throw new RangeError('bad_day'); // number-ok: نفس أجزاء التاريخ
  return time;
}

export function isDay(value: string): boolean {
  try {
    dayToUtc(value);
    return true;
  } catch {
    return false;
  }
}

export function addDays(day: Day, days: number): Day {
  const at = new Date(dayToUtc(day) + days * 86_400_000);
  return `${pad(at.getUTCFullYear(), 4)}-${pad(at.getUTCMonth() + 1, 2)}-${pad(at.getUTCDate(), 2)}`;
}

/** عدد الأيام من earlier إلى later (سالب إذا later أقدم). */
export function diffDays(later: Day, earlier: Day): number {
  return (dayToUtc(later) - dayToUtc(earlier)) / 86_400_000;
}
