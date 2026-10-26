// مفاتيح البناء كما يقراها Vite: من بيئة العملية (Vercel، CI) أو من ملفات .env* (‏.env.local محلّياً). الحرّاس
// يقرونها منه حتى حكمهم يطابق البناء نفسه. «بمفاتيح» يعني الاثنين: الرابط وحده بناء «دون قاعدة بيانات».
// isProjectUrl وisPublishableKey مرآة src/lib/env.ts بالضبط (نفس الشروط وatob نفسه): الحارس ما يقبل شي يرفضه
// التطبيق، وإلا بناء إنتاج يعبر الحرّاس وينشر هيكلاً «غير مربوط».
import { loadEnv } from 'vite';
import { ROOT } from './lib.mjs';

/** { url, key, source }: source = 'process' أو 'file' أو null (بلا مفاتيح). */
export function buildKeys() {
  const file = loadEnv('production', ROOT, 'VITE_');
  const url = process.env.VITE_SUPABASE_URL || file.VITE_SUPABASE_URL || '';
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || file.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  const fromProcess = Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
  return { url, key, source: url && key ? (fromProcess ? 'process' : 'file') : null };
}

export function keysPresent(keys) {
  return Boolean(keys.url && keys.key);
}

/** حمولة JWT مفكوكة (ثلاث قطع، الحمولة والتوقيع مو فارغين، وatob مثل المتصفّح)، أو null. */
export function jwtPayload(token) {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1] || !parts[2]) return null;
  try {
    return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

/** مرآة isPublishableKey بـsrc/lib/env.ts: sb_publishable_ أو JWT دوره anon. */
export function isPublishableKey(key) {
  if (key.startsWith('sb_publishable_')) return true;
  return jwtPayload(key)?.role === 'anon';
}

/** مرآة isProjectUrl بـsrc/lib/env.ts: https بلا اسم ولا كلمة سرّ ولا مسار. */
export function isProjectUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash;
}

const SECRET_KEY = /sb_secret_[A-Za-z0-9_-]{8,}/g;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
/** رابط اتّصال بوستغريس بكلمة سرّ (لوحة Supabase ← Connect). */
const DATABASE_URI = /\bpostgres(?:ql)?:\/\/[^\s"'`/:@]+:[^\s"'`@]+@/g;
/** توكن وصول شخصي لحساب Supabase (sbp_). */
const ACCESS_TOKEN = /\bsbp_[0-9a-f]{40}\b/g;

/** الأسرار بنصّ ملف مبني: مفتاح سرّي، JWT دوره مو anon (service_role يتجاوز RLS)، رابط قاعدة بكلمة سرّ، أو توكن حساب. */
export function findSecrets(text) {
  const found = [];
  for (const match of text.matchAll(SECRET_KEY)) found.push(`مفتاح سرّي ${match[0].slice(0, 14)}…`);
  for (const match of text.matchAll(JWT)) {
    const role = jwtPayload(match[0])?.role;
    if (role !== undefined && role !== 'anon') found.push(`JWT دوره ${String(role)}`);
  }
  for (const match of text.matchAll(DATABASE_URI)) found.push(`رابط قاعدة بكلمة سرّ ${match[0].split(':')[0]}://…`);
  for (const match of text.matchAll(ACCESS_TOKEN)) found.push(`توكن حساب ${match[0].slice(0, 8)}…`);
  return found;
}
