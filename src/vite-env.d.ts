/// <reference types="vite/client" />

/** نسخة البناء: رقم package.json + بصمة وقت البناء. */
declare const __APP_VERSION__: string;

/** مفاتيح القاعدة العامّة (مو أسرار): عنوان المشروع والمفتاح المنشور. مفتاح service_role ما ينكتب بـVITE_ أبداً. */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}
