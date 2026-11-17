# عقد 0032 — الجولة بزيارات في اليوم (القاعدة والشاشات)

المرجع: `docs/ROUND_VISITS_PLAN.md`، وDECISIONS 2026-11-17 «الجولة بزيارات في اليوم…» (أجوبة المالك الثلاثة). هذا العقد يُبنى عليه وكيلان بالتوازي، ثمّ الدمج يمرّر **أجوبة القاعدة الحقيقية** (عيّنات من فحص القاعدة) بمحلّلات الشاشات الحقيقية.

## المبادئ (لا تُخرق)
- `flock_daily` يبقى **مجموع اليوم** وتقرؤه كلّ القرّاء كما هي (`report_days` و`halls_day` و`flock_summary` و`flock_detail` و`flock_feed` و`halls_history`… بلا تغيير). يكتبه الآن مساعد واحد يعيد بناءه من الزيارات الحيّة.
- **لا تتغيّر أرقام أيّ تقرير بالهجرة:** كلّ صفّ `flock_daily` قائم يصير زيارة «قديمة» واحدة بقيمه نفسها، فالمجموع = الصفّ حرفاً.
- الزيارة لا تُحذف: الإلغاء علامة (`voided_at`)، ونسختها لا تنزل. الصفّ المجمَّع يُحذف حين لا تبقى زيارة حيّة (وجوده = «سُجّلت جولة»).
- لا مال ولا مخزون في الزيارة. الصرف من المخزن يبقى `give_to_flocks` كما هو (بلا تغيير في القاعدة).
- كلّ كتابة دالّة RPC واحدة بمعاملة واحدة ومرجع `client_ref`، وتدخل الطابور بلا نت.

## أ. القاعدة — `supabase/migrations/0032_round_visits.sql` و`rollback_0032.sql`

### الجدول `public.flock_visits`
| العمود | النوع | ملاحظة |
|---|---|---|
| id | uuid PK | من الجهاز (`default gen_random_uuid()` للتحويل وحده) |
| org_id | uuid not null default auth_org() | |
| flock_id, hall_id, site_id, division_id | uuid not null | من الفوج كما في `flock_daily`، بالمفاتيح الأجنبية نفسها |
| on_date | date not null | يوم الزيارة (يوم الجولة) |
| recorded_at | timestamptz not null | وقت التسجيل على الجهاز (للعرض والترتيب؛ ≤ now() + 10 دقائق) |
| dead, culled | int not null default 0 | 0..10,000,000 |
| feed_kg, water_l | numeric null | كقيود `flock_daily` (≥0، ثلاث مراتب) |
| temp_min, temp_max | numeric null | كقيود `flock_daily` (للتوافق مع `save_flock_day` وحده) |
| eggs_total, eggs_cracked, eggs_broken | int null | المكسور والمشعور يحتاجان المجموع ولا يزيدان عليه في الزيارة نفسها |
| note | text null | بلا فراغ في طرفيه، ≤ 500 |
| source | text not null | `visit` (جديدة) أو `day_total` (من `save_flock_day`) أو `legacy` (التحويل) |
| version | int not null default 1 | يكبر بكلّ تعديل أو إلغاء |
| voided_at, voided_by | | الإلغاء |
| created_at/by, updated_at/by | | |

- `unique (org_id, id)`، وفهرس `(org_id, flock_id, on_date)`. RLS: قراءة بـ`org_id = auth_org() and in_scope_site(site_id)` كـ`flock_daily`؛ لا منح كتابة؛ محفّز التدقيق؛ `classes.json` (`functionOnly`)، وكلّ ما تطلبه الحزمة لجدول جديد.
- زيارة حيّة بلا أيّ رقم ولا ملاحظة مرفوضة (`empty_visit`).

### المساعد `private.flock_day_rebuild(f public.flocks, p_on date)`
- الزيارات الحيّة لـ(الفوج، اليوم): لا زيارة ← يُحذف صفّ `flock_daily` إن وُجد؛ وإلّا upsert بالمجموع:
  - `dead`, `culled` = المجموع؛ `feed_kg`, `water_l`, `eggs_total`, `eggs_cracked`, `eggs_broken` = مجموع غير الفارغ، و**null** إن كانت كلّها فارغة (الفرق بين null و0 تعتمد عليه القرّاء: `feed_kg is not null` و`count(feed_kg)` وHDEP «—»)؛ `temp_min` = أصغر الصغرى، `temp_max` = أكبر الكبرى؛
  - `note` = ملاحظات الزيارات غير الفارغة بترتيب (`recorded_at`, `created_at`, `id`) مفصولة بـ` · `، وإن زادت على 500 حرف تُقصّ إلى 499 + `…`؛
  - `version` = السابق + 1 (أو 1 لصفّ جديد) — كلّ تغيير في زيارة يكبر نسخة اليوم، فعملية `save_flock_day` قديمة بنسخة سابقة ترجع `stale_day` كما كانت.
- يُنادى بعد كلّ كتابة زيارة، ثمّ فحوص المجموع (أدناه).

### التحويل (داخل الهجرة)
- لكلّ صفّ `flock_daily`: زيارة `legacy` بقيمه كلّها، `recorded_at = updated_at`، `created_by = coalesce(updated_by, created_by)`، `version = 1`. **لا** يُعاد بناء `flock_daily` (المجموع = الصفّ حرفاً)، والثابت يثبت ذلك بعد الهجرة.

### الكاتب `public.save_flock_visit`
```
save_flock_visit(p_visit uuid, p_flock uuid, p_date date, p_recorded_at timestamptz,
  p_dead integer, p_culled integer, p_feed_kg numeric, p_eggs_total integer, p_eggs_cracked integer, p_eggs_broken integer,
  p_note text, p_base_version integer, p_void boolean, p_client_ref uuid, p_queued boolean default false) returns jsonb
```
- `ref_claim('save_flock_visit', …)` بكلّ المعاملات (الإعادة بالمرجع نفسه = الجواب نفسه).
- `require('flock_day.save')`، `period_guard()`، قفل صفّ الفوج `for update`، ثمّ بترتيب `save_flock_day` نفسه: `flock_not_found`، `date_required`، `date_in_future`؛ والركن (بالطابور، وبنداء مباشر يرمي): `flock_closed`، `out_of_scope`، `date_too_old` (أقدم من 7 أيّام)، `period_locked` → `{status:'parked', reason}`؛ ثمّ `flock_not_placed`، `before_placement`.
- **الركن لا يكتب فوق ركن آخر:** `flock_day_rejects` يزيد عمود `visit_id uuid` (null لعمليات `save_flock_day`)، والقيد الفريد `(org_id, created_by, flock_id, on_date)` يصير فهرسين جزئيّين: الأوّل كما هو لـ`visit_id is null` (يحفظ سلوك `save_flock_day`)، والثاني `(org_id, visit_id)` لـ`visit_id is not null`. وكلّ قارئ للجدول (`flock_summary` و`verify_flocks` و`delete_flock`) يبقى صحيحاً.
- **الإضافة** (`p_base_version is null`, `p_void` false): لا زيارة بهذا المعرّف ← تُكتب `source='visit'`, `version=1`. وإن وُجدت زيارة بالمعرّف نفسه (مرجع جديد): بالمحتوى نفسه وحيّة ← `saved` بلا كتابة؛ وإلّا ← `{status:'stale_visit', server: visit_json}`.
- **التعديل** (`p_base_version` رقم، `p_void` false): الزيارة بالمعرّف يجب أن تكون للفوج واليوم نفسيهما (وإلّا `visit_moved`)، وحيّة، ونسختها = `p_base_version`، وإلّا `{status:'stale_visit', server: visit_json | null}`. المحتوى **كامل** (لا دمج): الفارغ فارغ.
- **الإلغاء** (`p_void` true، `p_base_version` رقم): الشروط نفسها؛ إلغاء ملغاة ← `saved` بلا كتابة (إعادة آمنة).
- الفحوص على الزيارة: `bad_value` (أعداد سالبة أو فوق الحدّ، علف بأكثر من ثلاث مراتب)، `eggs_on_broiler`، `eggs_need_total`، `eggs_over_total`، `bad_note` (> 500)، `bad_time` (`recorded_at` فارغ أو بعد الآن بأكثر من 10 دقائق)، `empty_visit`.
- بعد الكتابة: `flock_day_rebuild`، ثمّ فحوص **مجموع** اليوم كما في `save_flock_day` الحاليّة: `eggs_over_total`، `bad_temp` (الصغرى ≤ الكبرى)، `eggs_over_live` (البيض ≤ الحيّ أوّل اليوم لهذا اليوم وما بعده)، و`private.flock_live_check(f)` (الحيّ لا يصير سالباً في أيّ يوم). أيّ رفض يرجع المعاملة كلّها.
- الجواب: `{status:'saved', visit: visit_json, day: flock_day_json(صفّ اليوم) | null}` أو `{status:'parked', reason}` أو `{status:'stale_visit', server: visit_json | null}`.

### `visit_json` (شكل الزيارة في كلّ جواب وقارئ)
```
{ "id": uuid, "flock_id": uuid, "on": "YYYY-MM-DD", "recorded_at": timestamptz, "dead": int, "culled": int,
  "feed_kg": "12.500" | null, "eggs_total": int | null, "eggs_cracked": int | null, "eggs_broken": int | null,
  "note": text | null, "source": "visit" | "day_total" | "legacy", "version": int, "voided": bool,
  "by": "اسم الكاتب" | null }
```
- `by` = `members.display_name` لكاتب الزيارة في المنشأة (null إن لم يُعرف، كالتحويل بلا كاتب).

### التوافق `public.save_flock_day` (تُعاد بتوقيعها ونتائجها نفسها)
- كلّ ما قبل الكتابة كما هو حرفاً (الركن بالفهرس الجزئيّ الأوّل، وشرط نسخة اليوم `stale_day`، والدمج بـ`coalesce` مع المجموع، و«بلا تغيير» يرجع `saved` بنسخته).
- الكتابة: تُلغى زيارات اليوم الحيّة كلّها (علامة)، وتُضاف زيارة `day_total` بالمجموع المدموج (`recorded_at = now()`)، ثمّ `flock_day_rebuild` ثمّ الفحوص نفسها. الجواب `{status:'saved', version}` بنسخة اليوم الجديدة.
- فحوص القاعدة القائمة لـ`save_flock_day` كلّها تمرّ؛ وما يثبّت نصّ جسمها (مثل طفرة `birds.test`) يُحدَّث ليبقى يمسك القاعدة نفسها.

### القارئ `public.round_visits(p_on date, p_kind text, p_flock uuid default null)`
- `require('read')`، النطاق `in_scope_site`، `p_kind` ∈ (`broiler`, `layer`) أو `bad_kind`، و`p_on` فارغ = يوم الخادم.
- `{ "on": "YYYY-MM-DD", "today": "YYYY-MM-DD", "flocks": [ { "flock_id": uuid, "hall_id": uuid, "visits": [visit_json…] } ] }` — الأفواج التي لها زيارة حيّة في ذلك اليوم (أو الفوج المطلوب وحده)، والزيارات الحيّة وحدها بترتيب (`recorded_at`, `created_at`, `id`).

### الدوالّ القائمة التي تمسّ الجولة
- `delete_flock` (آخر تعريف 0029): يرفض كما الآن ما دامت جولة (صفّ `flock_daily` = زيارة حيّة)، والزيارات **الملغاة** وحدها لا تمنع الحذف وتُحذف معه (سجلّ التدقيق يحفظها)؛ وكلّ ما يمسّ `flock_day_rejects` يبقى صحيحاً بالعمود الجديد.
- `edit_flock` وكلّ قارئ لـ`flock_daily`: بلا تغيير (المجموع هو الصفّ).
- كلّ دالّة تُعاد تُبنى على **آخر** جسم لها (درس 2026-11-16)، والتراجع يرجعه حرفاً.

### الثابت `public.verify_round_visits()` (لمفتاح الخادم)
فحوص بالصفر: `day_equals_visits` (كلّ عمود في `flock_daily` = مجموع الزيارات الحيّة بالقاعدة أعلاه)، `day_without_visits` و`visits_without_day`، `visit_hall_mismatch` (القاعة والحقل والوحدة = الفوج)، `visit_eggs_on_broiler`، `visit_versions` (≥ 1)، `legacy_once` (زيارة `legacy` واحدة على الأكثر لكلّ يوم). ويدخل قائمة الثوابت في الحزمة.

### التراجع `rollback_0032.sql`
- يرفض بصوت (`rollback_blocked`) إن وُجدت زيارة غير `legacy` أو زيارة ملغاة (بيانات لا يحملها النموذج القديم)؛ وإلّا يُسقط الجدول والدوالّ الجديدة ويعيد `save_flock_day` و`flock_day_rejects` كما في آخر تعريف قبلها حرفاً.

### الفحوص (`supabase/tests/round-visits.test.mjs`، بادئة معرّفات وهواتف جديدة تُفحص على كلّ الملفّات)
زيارتان تُجمعان، وجهازان يضيفان زيارتين لنفس اليوم بلا `stale`، والتعديل بنسخة قديمة، والإلغاء يطرح، وإلغاء الأخيرة يحذف صفّ اليوم، و`live_negative` على المجموع (بجلستين أيضاً)، والبيض، والركن لزيارتين لا يكتب أحدهما فوق الآخر، و`save_flock_day` القديمة بمعناها (وفحوص `flocks.test` كلّها)، والتحويل (المجموع = الصفّ والتقارير بأرقامها)، والقارئ بالنطاق، والثابت وطفراته، والتراجع. **وعيّنات حقيقية** للشاشات: `ROUND_SAMPLES_OUT=1` يكتب `scripts/tests/fixtures/round-visits-0032.json` (`round_visits` لنوعين، وأجوبة `save_flock_visit`: saved وparked وstale_visit، وجواب `save_flock_day` بعد الهجرة).

## ب. الشاشات

### الطابور (`src/lib/outbox`)
- `QUEUEABLE_FUNCTIONS = ['save_flock_day', 'save_flock_visit']`. عملية الزيارة: `fn: 'save_flock_visit'`، `flockId`، `day`، `baseVersion` (نسخة الزيارة، null لجديدة)، و`payload: FlockVisitPayload { visitId, recordedAt, dead, culled, feed_kg, eggs_total, eggs_cracked, eggs_broken, note, void }` (المحتوى كاملاً). قاعدة IndexedDB بلا ترقية نسخة (الحقول داخل `payload`).
- **الدمج:** عملية زيارة لا تندمج إلّا في أحدث عملية **معلّقة لنفس `visitId`** (تعديل زيارة لم تُرفع يحلّ محلّ محتواها؛ وإلغاء زيارة جديدة لم تُرفع يحذف عمليتها). لا دمج بين زيارتين مختلفتين، ولا بين عملية زيارة وعملية `save_flock_day`. وعمليات `save_flock_day` المخزّنة تبقى بقاعدتها القديمة.
- **الترتيب:** كما هو (مفتاح الفوج واليوم يُرفع بالترتيب). `removeSaved` يرفع `baseVersion` للعمليات اللاحقة **لنفس الزيارة** وحدها.
- **النقل:** `sendFlockDay` يوزّع بـ`op.fn` (`save_flock_visit` بمعاملاتها، و`p_queued: true`)، ومحلّل الجواب يقبل `saved` (بزيارته ويومه) و`parked` و`stale_visit` (← رفّ المراجعة بـ«زيارتك والمحفوظة»).
- الحارس `write-guard` يبقى: الحفظ من `saveRound` وحده (أو اسم واحد جديد بجانبه في `lib/outbox`، ولا استيراد مباشر لـ`enqueue`).

### الجولة (`src/pages/farm/RoundPage.tsx`، في التثبيت المسبق)
- بطاقة لكلّ قاعة فيها فوج قائم (كما الآن) **بمربّع اختيار مُعلَّم افتراضاً**، وفوقها «كلّ القاعات» (تعليم الكلّ أو إزالته) وعدد المختار.
- خانات الزيارة فارغة (النافق، المستبعد، العلف المأكول، وللبيّاض البيض والمكسور)، وتحت كلّ خانة **«اليوم حتى الآن: N»** (المحفوظ في نسخة الجهاز + زيارات هذا الجهاز المنتظرة).
- صفّ «نفس الرقم لكلّ القاعات» لكلّ خانة: رقم وزرّ «طبّق على المختارة» يكتبه في خانة كلّ قاعة مختارة (ويبقى تعديل قاعة وحدها ممكناً).
- زرّ حفظ واحد يسمّي النتيجة («احفظ الزيارة لـ3 قاعات»): زيارة جديدة (`visitId` جديد، `recordedAt` الآن) لكلّ قاعة مختارة فيها رقم واحد على الأقلّ، ثمّ رفع؛ والقاعات المختارة الفارغة تُذكر («بلا أرقام: قاعة 3»)؛ وتفرغ الخانات بعد الحفظ. فحص الحيّ والبيض قبل الحفظ على **المجموع بعد الزيارة** (`readRound` أو بديله).
- لكلّ بطاقة: رابط «زيارات اليوم» (عددها إن عُرف) يفتح مكوّن «زيارات اليوم» من حزمة القاعات (كسول، `quietly`؛ بلا نت: «يحتاج اتصالاً»)، ورابط القاعة كما هو.
- زرّ «اصرف من المخزن للقاعات المختارة» (لمن له `issue.post` أو `flock_day.save` كما الآن) إلى `/halls/give/:أوّلFlockId?also=id2,id3&back=…`؛ وبلا نت «يحتاج اتصالاً».
- **ما يحتاج الخادم في حزمة القاعات خارج التثبيت المسبق**، ولا صنف Tailwind جديد (الإقلاع على بعد ~300 بايت gzip من سقفه)، ولا رفع سقف.

### «زيارات اليوم» (حزمة القاعات، `src/pages/halls/`)
- قارئ `round_visits` لفوج ويوم: كلّ زيارة بوقتها (`recorded_at` بساعة الجهاز المحلّية بالمنسّق) وأرقامها وكاتبها ومصدرها («قديمة» للتحويل، «مجموع اليوم» لـ`day_total`)، و«عدّل» (نافذة بالمحتوى كاملاً، بلقطة الزيارة ونسختها لحظة الفتح) و«ألغِ» (`ConfirmDialog`: «تُلغى زيارة 09:40 ويُطرح من مجموع اليوم 3 نافق و50 كغم علف»). الحفظ عملية بالطابور (`save_flock_visit` بنسختها، أو `p_void`).
- وزيارات هذا الجهاز المنتظرة تظهر بعلامة «على هذا الجهاز».

### صفحة القاعة (`FlockPage.tsx`، حزمة القاعات)
- «سجّل جولة اليوم» ونافذة اليوم تصيران **«سجّل زيارة»** (زيارة جديدة لذلك اليوم، خانات فارغة و«اليوم حتى الآن»)، وتحتها «زيارات هذا اليوم» بالمكوّن نفسه. الأيّام السبعة كما هي.

### صفحة الإضافة (`GivePage.tsx`)
- `?also=` قائمة أفواج تُختار مسبقاً في «كرّر في القاعات الأخرى» (ما ليس قائماً أو خارج النطاق يُهمل بصمت مع ذكر عدده). لا تغيير في `give_to_flocks`.

### الفحوص
- `outbox.test` (قواعد الدمج الجديدة: لا دمج بين زيارتين، تعديل يحلّ محلّ، إلغاء جديدة يحذفها، عمليات `save_flock_day` القديمة كما هي، رفع النسخة لنفس الزيارة وحدها)، `farm-round.test` (المختار افتراضاً، الاستثناء، «نفس الرقم»، «اليوم حتى الآن» بالمنتظر، عملية لكلّ قاعة فيها رقم، الحفظ يفرغ، وفحص الحيّ على المجموع)، `hall-page` (نافذة الزيارة)، وملفّ جديد `round-visits-screens.test` (المكوّن والتعديل والإلغاء والرفّ و`?also=`)، و**دمج** يمرّر عيّنات `round-visits-0032.json` الحقيقية بالمحلّلات الحقيقية.

## ج. ما يقرّره الدمج لا الوكيلان
- أسماء الحقول بين الطرفين تُطابَق بالعيّنات الحقيقية (لا بجواب مكتوب باليد).
- السقوف بالبناءين (بمفاتيح وبلاها).
