// مفاتيح القاعدة من بيئة البناء (Vite). القراءة بدالّة مو بمستوى الملف: الفحوص تحزم المصدر بـesbuild بلا
// import.meta.env، والقراءة بمستوى الملف ترمي هناك. وبلا المفاتيح التطبيق «دون قاعدة بيانات» (هيكل بس).

export interface BackendSettings {
  url: string;
  key: string;
}

/**
 * مفتاح المتصفّح العامّ بس: sb_publishable_ أو JWT قديم دوره anon. السرّي (sb_secret_ أو JWT دوره service_role)
 * يتجاوز RLS لكل زائر، والاثنين بنفس صفحة الإعدادات باللوحة. هنا يرفض بالتشغيل (npm run dev ما يمرّ من حرّاس
 * البناء)، وenv-guard يفشّل أي بناء بيه سرّ.
 */
export function isPublishableKey(key: string): boolean {
  if (key.startsWith('sb_publishable_')) return true;
  const [, body, signature] = key.split('.');
  if (!body || !signature || key.split('.').length !== 3) return false;
  try {
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: unknown } | null;
    return payload?.role === 'anon';
  } catch {
    return false;
  }
}

/**
 * رابط المشروع: https بلا اسم ولا كلمة سرّ ولا مسار. باللوحة جنبه رابط اتّصال القاعدة (postgresql://…:كلمة_السرّ@…)،
 * ولو انلصق هنا ينحزم بالجافاسكربت لكل زائر (المراجعة الثانية)، فيرفض مثل المفتاح السرّي. مرآته بـscripts/guards/keys.mjs.
 */
export function isProjectUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash;
}

export function backendSettings(): BackendSettings | null {
  const env = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;
  const url = env?.VITE_SUPABASE_URL;
  const key = env?.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  if (!isProjectUrl(url) || !isPublishableKey(key)) {
    // رسالة للمطوّر بالطرفية، مو للمستخدم: الشاشة تعرض «غير مربوط» بنصّها.
    console.error('VITE_SUPABASE_URL must be the https project URL and VITE_SUPABASE_PUBLISHABLE_KEY the publishable key: backend disabled.');
    return null;
  }
  return { url, key };
}

export function hasBackend(): boolean {
  return backendSettings() !== null;
}
