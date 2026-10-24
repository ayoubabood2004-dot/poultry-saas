import { createStore } from './store';
import { readJson, writeJson } from './storage';

// إعدادات العرض لكل جهاز: الوضع الداكن، حجم الواجهة (خطّ الجذر 80–125٪، وكل المقاسات بـrem)،
// وضع «وضوح» للشاشات الرخيصة، والصوت. نفس المفتاح والشكل بسكربت index.html قبل أوّل رسم.
// نافذتين مفتوحات (تبويب والتطبيق المثبّت): كل وحدة تسمع تغيير الثانية (storage)، والحفظ يدمج بالمحفوظ هسه،
// مو بنسخة الذاكرة: نافذة قديمة كانت ترجّع الحجم 100 فوك 120 اختاره المستخدم بالثانية.

export type ThemeChoice = 'system' | 'light' | 'dark';

export interface DisplaySettings {
  theme: ThemeChoice;
  scale: number;
  clarity: boolean;
  sound: boolean;
}

export const SCALE_MIN = 80;
export const SCALE_MAX = 125;
export const SCALE_STEP = 5;

const STORAGE_KEY = 'poultry.display';
const THEME_COLOR = { light: '#f3f8fd', dark: '#080d17' } as const;

function sanitize(raw: unknown): DisplaySettings {
  const value = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof DisplaySettings, unknown>>;
  const theme = value.theme === 'light' || value.theme === 'dark' ? value.theme : 'system';
  const scaleRaw = typeof value.scale === 'number' ? value.scale : 100;
  const scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(scaleRaw / SCALE_STEP) * SCALE_STEP));
  return { theme, scale, clarity: value.clarity === true, sound: value.sound !== false };
}

export const displayStore = createStore<DisplaySettings>(sanitize(readJson(STORAGE_KEY)));

const darkQuery = typeof window === 'undefined' ? null : window.matchMedia('(prefers-color-scheme: dark)');

function resolveDark(theme: ThemeChoice): boolean {
  if (theme === 'system') return darkQuery?.matches ?? false;
  return theme === 'dark';
}

export function applyDisplay(): void {
  const settings = displayStore.get();
  const root = document.documentElement;
  const dark = resolveDark(settings.theme);
  root.classList.toggle('dark', dark);
  root.classList.toggle('clarity', settings.clarity);
  root.style.fontSize = settings.scale === 100 ? '' : `${settings.scale}%`;
  // لون شريط المتصفّح يتبع الاختيار، مو النظام بس.
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', dark ? THEME_COLOR.dark : THEME_COLOR.light);
  }
}

/** المحفوظ هسه كائن، أو {} إذا ماكو (أو التخزين مقفول): وقتها نسخة الذاكرة هي المرجع. */
function storedNow(): Record<string, unknown> {
  const raw = readJson(STORAGE_KEY);
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
}

export function updateDisplay(patch: Partial<DisplaySettings>): void {
  const next = sanitize({ ...displayStore.get(), ...storedNow(), ...patch });
  writeJson(STORAGE_KEY, next);
  displayStore.set(next);
  applyDisplay();
}

/** نافذة ثانية غيّرت الإعدادات (أو مسحت التخزين: key = null): نقرا المحفوظ ونطبّقه هنا هم. */
function onDisplayStorage(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  displayStore.set(sanitize(readJson(STORAGE_KEY)));
  applyDisplay();
}

export function initDisplay(): void {
  applyDisplay();
  darkQuery?.addEventListener('change', () => {
    if (displayStore.get().theme === 'system') applyDisplay();
  });
  window.addEventListener('storage', onDisplayStorage);
}
