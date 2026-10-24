// normalize.ts: نفس الدالّة على الطرفين. بـdoctorVet مسح التشكيل قبل الأرقام محى «٧٧٠٩٩».
import { loadSrc } from './load-src.mjs';

export default async function (t) {
  const n = await loadSrc('src/domain/normalize.ts');

  t.eq(n.toWesternDigits('٧٧٠٩٩'), '77099', 'أرقام عربية شرقية');
  t.eq(n.toWesternDigits('۱۲۳'), '123', 'أرقام فارسية');
  t.eq(n.toWesternDigits('١٬٢٣٤٫٥'), '1,234.5', '«٬» و«٫»');
  // «٬» تشبه «٫» وتصير فاصلة: الحماية برفض «0,5» بـparseDecimal (money وunits)، مو هنا.
  t.eq(n.toWesternDigits('٠٬٥'), '0,5', '«٠٬٥» تصير «0,5» مو «0.5»');

  t.ok(n.searchable('فاتورة ٧٧٠٩٩').includes('77099'), 'الأرقام تبقى بعد مسح التشكيل');
  t.eq(n.searchable('أحمد'), n.searchable('احمد'), 'الهمزة');
  t.eq(n.searchable('إبراهيم'), n.searchable('ابراهيم'), 'همزة تحت');
  t.eq(n.searchable('مدرسة'), n.searchable('مدرسه'), 'التاء المربوطة');
  t.eq(n.searchable('على'), n.searchable('علي'), 'الألف المقصورة');
  t.eq(n.searchable('مُحَمَّد'), 'محمد', 'التشكيل ينمسح');
  t.eq(n.searchable('عــلـي'), 'علي', 'التطويل ينمسح');
  t.eq(n.searchable('  Abu   Ali  '), 'abu ali', 'لاتيني صغير وفراغات موحّدة');
  t.ok(n.searchable('شركة ١') !== n.searchable('شركة ٢'), 'رقمان مختلفان ما يصيرون توائم');

  t.eq(n.normalizeCode(' ab ١٢3 '), 'AB123', 'الباركود: أرقام غربية بلا فراغ وكبير');
}
