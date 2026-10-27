// الشاشات تستورد من هنا، أو من ملف وحدة كسول (write-guard PAGE_MODULES). ملف لكل وحدة، وكل ملف تحت ٢٬٠٠٠ سطر.
// هنا اللي تحتاجه الجلسة بس (الدخول والمنشأة)، لأن index ومستورداته مسار الجلسة الحرج: كل مستخدم يحمّلهم قبل أوّل شاشة
// (السقف المقيس، DECISIONS «السقوف المقيسة»). الموظفون والرئيسية (members وhome، المرحلة 1 WP3) ملفات كسولة بحزم شاشاتها.
export * as auth from './auth';
export * as workspace from './workspace';
export { updatedRows, withTimeout } from './core';
