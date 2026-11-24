// قناة نوافذ الجهاز لنتائج الرفع (مراجعة 0036 R8): الطابور في IndexedDB واحد للنوافذ كلّها، فرفعٌ من نافذة يحفظ عمليات غيرها ولا تدري. الرافع
// (uploader، محفوظ للفتح بلا نت) يعلن نتائجه هنا وحسب؛ والاستماع وفحص ما يصل (lib/roundWindows.ts) في حزمة القاعات الكسولة، تركّبه ورقة القاعة حين تُفتح: هي وحدها
// تبني تعديلها التالي على نسخة اليوم، وفحص الرسائل خارج التثبيت المسبق. كائن قناة واحد للإعلان والاستماع في النافذة، فلا تصلها رسائلها هي.

let channel: BroadcastChannel | null | undefined;

/** قناة النوافذ، أو null في متصفّح بلا BroadcastChannel. */
export function roundChannel(): BroadcastChannel | null {
  if (channel === undefined) channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('poultry-round-uploads');
  return channel;
}
