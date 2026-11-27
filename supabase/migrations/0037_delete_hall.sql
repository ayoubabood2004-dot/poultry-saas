-- 0037_delete_hall — «احذف القاعة» كأنها لم تكن (الزبون عبر المالك 2026-11-26 بصورتين ورسالتين صوتيتين وجوابَي المالك؛ العقد
--   docs/plans/0037/contract-0037.md «الجزء D»؛ DECISIONS 2026-11-26).
-- المشكلة: في منشأة الزبون خمس قاعات تجريبية، في كلّ واحدة فوج جارٍ بأيّام جولات وإرسالات علف من «رصيد العلف»، ولا طريق لحذفها: «أرشف» للقاعة
--   بلا فوج قائم وحدها (halls_check يرفض أرشفة قاعة فيها فوج قائم). وجواب المالك: حذف قاعة فيها فوج جارٍ «كأنها لم تكن» — ما أُرسل إليها من المخزن
--   يرجع بحركة عكسية، وأيّامها (الهلاكات والغاز والأوزان) تختفي من كلّ التقارير، والقاعة تختفي من كلّ مكان، ويبقى الأثر في سجلّ التدقيق وحده.
-- هنا:
--   • الفوج الملغى: flocks.status يقبل 'void'، وأعمدة voided_at وvoided_by وvoid_reason بقيد (الملغى ⇔ له وقت إلغاء) وطول السبب (≤ 500)؛ وflocks_closed_check
--     كما هو (الملغى بلا closed_on)، وflocks_one_live (preparing/active) يستثنيه أصلاً. وسبب ركن سادس لقيد flock_day_rejects: 'flock_void'.
--   • لا يظهر الفوج الملغى في أيّ قارئ ولا يقبل أيّ كتابة: private.flock_for (0026) يرمي flock_void («حُذفت قاعة هذا الفوج، فلا يُعرض ولا يُسجَّل له
--     شيء.») قراءةً وكتابةً بعد فحص النطاق، وprivate.flock_day_check (0035) يرميه أوّلاً؛ والقرّاء الذين يعدّدون الأفواج يستثنونه، والكتّاب الذين يقرؤون
--     الفوج بأنفسهم يرفضونه، وعمليات الجولة من الطابور (p_queued) تُركن بسبب flock_void كما تُركن flock_closed. القائمة كلّها أدناه.
--   • public.delete_hall_preview(القاعة) (read): القاعة، والفوج القائم بعدّاداته وما يرجع إلى المخازن (back: سطور الصرف المرحَّل مجموعةً لكلّ مخزن ومادّة،
--     بترتيب اسم المخزن ثمّ اسم المادّة collate "C"، والكمية نصّاً بثلاث مراتب بوحدة أساسها)، والدورات المنتهية، والمنع، والبصمة. والمنع والبصمة
--     من الدالّتين الخاصّتين نفسيهما اللتين يفحص بهما delete_hall وبالترتيب نفسه (درس 2026-11-15): private.delete_hall_blocks وprivate.delete_hall_plan.
--     رموز المنع: permission (أوّلاً ووحده: حقل القاعة خارج النطاق، أو لا إدارة للقاعات، أو صرف يُلغى بلا فعل الإلغاء أو من مخزن خارج النطاق)، ثمّ sales
--     (فاتورة طيور مرحَّلة)، ثمّ tickets (تذكرة وزن غير ملغاة)، ثمّ carry (علف منقول من الدورة السابقة ما زال مطبَّقاً على الفوج، أو — بلا فوج قائم —
--     علف منقول معلَّق للدورة التالية يمنع الأرشفة)، ثمّ period_locked (قفل فترة على أيّام الفوج من تسكينه، ويوم الإلغاء اليوم داخلها حتماً)، ثمّ
--     revalued (تصحيح سعر حيّ بعد إرسال إلى الفوج، و«أكمل السعر» منه)، ثمّ counted (جرد معتمد لمادّة إرسال في مخزنه في يومه أو بعده، ولو بلا فرق).
--     والقاعة المؤرشفة hall_not_found. والبصمة md5 للقاعة ونسختها، والفوج ونسخته (أو none)، والصرف المرحَّل بمعرّفاته ونسخه مرتّباً، والتأشيرات «تمّ» مرتّبة.
--   • public.delete_hall(القاعة، النسخة، البصمة، المرجع) (flock.manage؛ وvoid حين يُلغى صرف): تنعاد بأمان بالمرجع (ref_claim وref_store) وبالحالة:
--     القاعة المؤرشفة ترجع {hall_id, name, deleted: true, already: true, back: []} بلا كتابة (جواب ضاع ثمّ مرجع جديد لا يغيّر شيئاً). ثمّ تحت الأقفال:
--     stale_hall إن تغيّرت النسخة، وstale_plan إن تغيّرت البصمة (أو صرف جديد بعد قفل الصرف)، وأوّل منع يرمي رمزه (forbidden وhall_has_sales
--     وhall_has_tickets وhall_has_carry وperiod_locked، وlot_consumed لـrevalued وcount_superseded لـcounted برمزي apply_move) وجملته تلميحاً.
--     والأثر في المعاملة الواحدة بيوم اليوم: تأشيرات «تمّ» ملغاة بالسبب (قبل صرفها:
--     حارس الصرف يمنع إلغاء صرف تحت تأشير «تمّ»)، وكلّ صرف مرحَّل يُلغى بالنواة نفسها التي يلغي بها void_flock_issue (private.flock_issue_reverse: حركات
--     عكسية على دفعاتها بيوم اليوم، وصفوف كلفة عكسية بيوم اليوم، والحالة void بالسبب «حُذفت القاعة «الاسم»»)، والفوج void (voided_at وvoided_by
--     وvoid_reason والنسخة + 1)، والقاعة مؤرشفة (archived_at والنسخة + 1). الجولات والزيارات والغاز والأوزان والأدوية والعدّ تبقى صفوفاً (سجلّ التدقيق)
--     يخفيها إلغاء الفوج، ولا يُحذف شيء. والجواب {hall_id, name, deleted: true, already: false, flock_id, voided_issues, back} بشكل back في المعاينة.
--   • public.void_flock_issue (0019) بالنواة المشتركة: الأقفال والفحوص والجواب كما هي حرفاً، والأثر (الحلقتان والتعديل) في private.flock_issue_reverse.
--   • public.verify_delete_hall (مفتاح الخادم): لا فوج ملغى بصرف مرحَّل أو تأشير «تمّ» أو في قاعة فعّالة، ودفتر كلفته صفر، وشكل إلغائه، ولا فاتورة
--     طيور مرحَّلة ولا تذكرة وزن غير ملغاة ولا علف منقول مطبَّق على فوج ملغى (منع sales وtickets وcarry).
-- ترتيب الأقفال الواحد (delete_hall): قفل الفترة للمشاركة (period_guard) ← القاعة ← صرف الفوج القائم المرحَّل (for update بترتيب المعرّف، من جملة
--   القفل نفسها) ← صفّ الفوج ← المخازن والموادّ (lock_masters) ← الأرصدة (lock_balances) ← تأشيرات «تمّ» (for update بترتيب المعرّف)؛ والفحوص كلّها
--   بعد الأقفال. وهو ترتيب كلّ من يمسّ الصفوف نفسها: void_flock_issue (الفترة ← الصرف ← الفوج ← المخزن والمادّة ← الرصيد)، وundo_vaccination للمربوط
--   (الفترة ← الصرف ← الفوج ← المخزن والمادّة ← الرصيد ← التأشير) ولغير المربوط (الفوج ← التأشير)، وrecord_flock_issue (الفترة ← الفوج ← المخزن
--   والمادّة ← الرصيد؛ صرفه جديد لا يُقفل قبل الفوج)، وgive_to_flocks (الفترة ← الأفواج ← اللقاحات وجداولها ← المخزن والمادّة ← الرصيد ← صرفه الجديد)،
--   وclose_flock (الفترة ← القاعة ← الفوج ← المخزن والمادّة ← الرصيد)، وreopen_flock وopen_flock وreturn_hall_carry (القاعة قبل الفوج). والقاعة والفوج
--   for no key update لا for update: الحذف لا يمسّ مفتاحاً (والتعديل نفسه يأخذ هذا القفل)، وfor update يحبس فحص المفتاح الأجنبيّ (key share) لكاتب
--   جولة يمسك الفوج ثمّ يضيف صفّاً يشير إلى القاعة، وهو ينتظر الفوج: تقافل. والبرهان بجلستين (delete-hall.test، pg_blocking_pids على الجلسة بعينها):
--   الحذف أمام void_flock_issue وrecord_flock_issue وundo_vaccination وclose_flock وrecord_flock_count_adjust في الاتّجاهين بلا تقافل والخاسر يرى سببه،
--   وثلاثة ضوابط بأجسام مثبَّتة ثمّ تعود حرفاً تتقافل كلّها: الفوج قبل الصرف، والأرصدة قبل الفوج، والقاعة for update أمام كاتب جولة.
-- قرّاء الأفواج وكتّابها (الكتالوج: select proname from pg_proc where prosrc ~ 'public\.flocks\M' بعد 0036 = 59 دالّة)، لكلّ واحدة سطر:
--   private.flock_count_days — سليمة: مساعد لفوج بمعرّفه، ومن ينادونها يمرّون بـflock_for أو بفحص الإلغاء أو يختارون أفواجاً غير ملغاة.
--   private.flock_counts_total — سليمة: كذلك.
--   private.flock_for — تغيّرت: flock_void للفوج الملغى قراءةً وكتابةً، بعد فحص النطاق وقبل فحوص الكتابة.
--   private.flock_item_lots — سليمة: مساعد للإغلاق والإرجاع؛ الصرف المرحَّل وحده، وصرف الملغى ملغى كلّه، ولا نقل مطبَّق إلى فوج ملغى (منع carry).
--   private.flock_item_pool — سليمة: كذلك (المرحَّل وحده، والفوج الملغى لا إغلاق له ولا نقل إليه).
--   private.flock_slots — سليمة: لقاحات فوج بمعرّفه لقرّاء وكتّاب يمرّون بـflock_for أو يختارون الأفواج القائمة.
--   private.flock_ticketed — سليمة: لقرّاء الأفواج القائمة (weigh_ticket_options وhalls_day بعد استثنائه).
--   private.halls_check — تغيّرت: لا تعود من الأرشيف قاعة فيها فوج ملغى (hall_deleted)؛ وhall_in_use (preparing/active) يترك الحذف يؤرشف بعد الإلغاء.
--   private.reopen_block — سليمة: قاعة الفوج الملغى مؤرشفة دائماً، وhall_archived يسبق hall_reused.
--   private.weigh_ticket_json — سليمة: تذكرة غير ملغاة على الفوج تمنع الحذف (tickets)، فلا يظهر الفوج الملغى إلّا في تذكرة ملغاة تبقى مستنداً،
--     وflock_status فيها 'void' (محلّل التذكرة في الشاشات يقبله: مسألة دمج في الرأس أدناه).
--   public.add_flock_gas — تغيّرت: من الطابور يُركن بسبب flock_void أوّلاً، وبنداء مباشر flock_void (flock_day_check).
--   public.bird_sale_detail — سليمة: فاتورة مرحَّلة على الفوج تمنع الحذف (sales)، فللفوج الملغى فواتير ملغاة وحدها، can_void لها false.
--   public.bird_sale_form — سليمة: التذكرة التي تذكر فوجاً ملغى ملغاة، فـwhy = void ولا فاتورة.
--   public.close_flock — تغيّرت: بعد قفل الفوج flock_void (وflock_for قبل الأقفال يرميه أيضاً)، فالخاسر أمام الحذف يرى سببه لا flock_not_placed.
--   public.delete_flock — تغيّرت: الملغى flock_void بعد النطاق، فلا يُحذف حذفاً (ولو بلا سجلّ).
--   public.edit_flock — تغيّرت: الملغى flock_void بعد النطاق.
--   public.finish_weigh_ticket — سليمة: مسوّدة على الفوج تمنع الحذف، وكلاهما يقفل صفّ الفوج، فلا مسوّدة على فوج ملغى.
--   public.flock_close_form — سليمة: flock_for(…، false) يرمي flock_void.
--   public.flock_cycle_report — سليمة: flock_for يرمي flock_void.
--   public.flock_cycles — تغيّرت: الدورات المسكَّنة عدا الملغاة.
--   public.flock_detail — تغيّرت: قراءة بنفسه، flock_void بعد النطاق.
--   public.flock_feed — تغيّرت: كذلك.
--   public.flock_issue_options — تغيّرت: كذلك.
--   public.flock_month — سليمة: flock_for يرمي flock_void.
--   public.flock_sales — سليمة: flock_for يرمي flock_void.
--   public.flocks_overview — سليمة: الفوج القائم (preparing/active) في القاعات الفعّالة وحده.
--   public.give_to_flocks — سليمة: flock_for(…، true) لكلّ فوج قبل الأقفال ولكلّ سطر بعدها يرمي flock_void.
--   public.hall_sheet — سليمة: flock_for يرمي flock_void.
--   public.halls_day — تغيّرت: فوج القاعة في اليوم ومؤشّر «اليوم السابق» بلا الملغى (والقاعة المؤرشفة لا تظهر إلّا بفوج ذلك اليوم).
--   public.halls_history — تغيّرت: الأفواج المسكَّنة عدا الملغاة (منها كلّ أقسامه: الأيّام والأشهر والمجموع والأحداث).
--   public.open_flock — سليمة: القاعة المحذوفة مؤرشفة (hall_archived)، والفوج القائم preparing/active.
--   public.record_bird_sale — سليمة: التذكرة والفاتورة على الفوج تمنعان الحذف وهي تقفل صفوف الأفواج، وغير القائم يُرفض فيها أصلاً.
--   public.record_flock_count_adjust — تغيّرت: بعد قفل الفوج flock_void (وflock_for قبله).
--   public.record_flock_issue — تغيّرت: flock_void قبل قفل الفوج وبعده.
--   public.record_flock_weight — تغيّرت: قراءة بنفسه، flock_void بعد النطاق.
--   public.remove_flock_log — سليمة: قفل الفوج ثمّ flock_for(…، true).
--   public.reopen_flock — سليمة: قاعة الملغى مؤرشفة (hall_archived) قبل hall_reused.
--   public.return_hall_carry — سليمة: العلف المعلَّق في قاعة يمنع حذفها (carry)، ويقرأ فوج الدورة المغلقة.
--   public.round_visits — تغيّرت: القائمة بلا الملغى، والفوج المطلوب بمعرّفه flock_void.
--   public.save_flock_day — تغيّرت: من الطابور يُركن بسبب flock_void أوّلاً، وبنداء مباشر flock_void.
--   public.save_flock_visit — تغيّرت: كذلك.
--   public.save_weigh_ticket — سليمة: كلّ وقفة بقاعتها الفعّالة (المحذوفة hall_archived) وفوجها القائم preparing/active (الملغى ليس قائماً: no_active_flock).
--   public.send_flock_feed — سليمة: flock_for(…، false) وflock_day_check وrecord_flock_issue ترمي flock_void.
--   public.set_flock_dead — تغيّرت: من الطابور يُركن بسبب flock_void أوّلاً، وبنداء مباشر flock_void (flock_day_check).
--   public.set_flock_gas — تغيّرت: كذلك.
--   public.undo_vaccination — سليمة: flock_for(…، true) يرمي flock_void؛ وأمام الحذف ينتظر الصرف أو الفوج ثمّ يجد التأشير ملغى فيرجع حاله بلا كتابة.
--   public.vaccine_board — سليمة: الفوج النشط في القاعات الفعّالة وحده.
--   public.vaccine_reminders — سليمة: الأفواج النشطة وحدها.
--   public.verify_bird_sales — سليمة: التذاكر المكتملة والفواتير المرحَّلة، ولا شيء منها على فوج ملغى.
--   public.verify_flock_close — سليمة: الملغى ليس مغلقاً، وكلفة صرفه = −قيمة حركاته (صفر بعد العكس).
--   public.verify_flock_issues — سليمة: الصرف الملغى بالنواة معكوس حركاتٍ وكلفةً كما يفحص.
--   public.verify_flocks — سليمة: live_flock_on_archived_hall للقائم وحده، وأيّام الملغى وعدّه متّسقة كما كانت.
--   public.verify_hall_sheet — تغيّرت: لا يقارن ورقة فوج ملغى (hall_sheet يرفضها flock_void).
--   public.verify_halls — سليمة: التأشيرات تُلغى مع صرفها.
--   public.verify_halls_history — سليمة: يقارن halls_history بنفسه، والملغى مستثنى فيه كلّه.
--   public.verify_round_visits — سليمة: زيارات الملغى وأيّامه صفوف متّسقة.
--   public.void_bird_sale — سليمة: الفاتورة المرحَّلة تمنع الحذف، فلا فاتورة مرحَّلة لفوج ملغى.
--   public.void_flock_issue — تغيّرت: الأثر في النواة المشتركة، والأقفال والفحوص والجواب كما هي؛ وflock_void بعد قفل الفوج حارساً ثانياً (صرف الملغى ملغى،
--     فـalready_void يسبقه).
--   public.weigh_ticket_options — سليمة: الفوج النشط في القاعات الفعّالة وحده.
--   وما لا يذكر public.flocks في جسمه ويمسّ الفوج: مساعدات بصفّ الفوج (flock_summary وreport_day وreport_days وreport_days_extra وhall_feed_kg
--   وflock_alive_days وflock_live وflock_live_check وflock_eggs_live_check وflock_activity_after وflock_left_in_hall وhall_left وhall_flock_json)
--   يختار من ينادونها أفواجها؛ وhalls_day_totals على جواب halls_day؛ وmoney_flock_issue للصرف المرحَّل وحده؛ وstock_doc_label وstock_doc_memo يُبقيان
--   الإرسال وعكسه في دفتر المادّة باسم القاعة (العقد: دفتر المادّة يُظهر الإرسال والعكس)؛ وitem_uses تبقى المادّة «مستعملة» (حركاتها باقية)؛
--   وdecide_flock_reject يحسم مركوناً بمعرّفه (مركون الفوج الملغى لا يُعرض بعده)؛ وrecord_expense يرفض الفوج أصلاً.
-- قرارات بلا سؤال (داخل الخطوط الحمر والعقد):
--   • القاعة والفوج for no key update لا for update (السبب في ترتيب الأقفال أعلاه).
--   • المنع permission أوّلاً ووحده، وخارج النطاق تُرجع المعاينة flock: null وended: 0 (لا يُسمّى شيء من فوج خارج النطاق)، والبصمة نفسها.
--   • مخزن الصرف المرحَّل خارج نطاق الكاتب منع permission، كقاعدة إلغاء الصرف (stock_wh)، فالنواة المشتركة لا تُنادى بما ترفضه دالّتها.
--   • القاعة بلا فوج قائم: لا منع بقفل الفترة (لا يُكتب مستند مؤرَّخ)، والعلف المنقول المعلَّق منع carry بما يُفعل (halls_check يمنع الأرشفة بلاه).
--   • العلف المنقول المطبَّق على الفوج منع carry: لا دالّة تعكس نقلاً مطبَّقاً، فالجملة تقول أغلق الدورة ثمّ احذف.
--   • ما يرفض به apply_move عكس الإرسال منعان في المعاينة (المراجعة المستقلّة لـ0037: كان الحذف يرفض بما لم تعرضه المعاينة): revalued وcounted، بشرطي
--     private.check_draw_not_revalued وprivate.check_move_not_counted حرفاً على حركات الإرسال الأصلية للصرف المرحَّل، وبترتيب reopen_block لإعادة فتح
--     الدورة (0029: بعد carry وperiod_locked، والتصحيح قبل الجرد)؛ وجملتاهما تسمّيان المادّة ومستند السعر أو رقم الجرد ومخزنه ويومه وتقولان «ألغِ التصحيح
--     أوّلاً» و«ألغِ الجرد أوّلاً». والحذف يرميهما من المنع نفسه تحت الأقفال برمزي apply_move (lot_consumed وcount_superseded) فلا يصل إليه بهما. والعقد
--     سمّى خمسة رموز، وهذان يكمّلانها بلا رمز رفض جديد.
--   • الثابت يحرس منع البيع والتذاكر والنقل المطبَّق أيضاً (void_flock_posted_sale وvoid_flock_live_ticket وvoid_flock_applied_carry)، وضابط كلّ واحد طفرة
--     حقيقية: الحذف بلا منعه (v_block := null) داخل معاملة ترجع.
--   • القاعة المؤرشفة بـ«أرشف» قبل الحذف «already» أيضاً: الحذف إخفاء، وقد اختفت.
-- مسألة دمج (للشاشات): التذكرة الملغاة التي تذكر فوجاً ملغى ترجع flock_status = 'void' في weigh_ticket_json (والعيّنة في
--   scripts/tests/fixtures/delete-hall-0037.json)، ومحلّل weighTickets.ts يقبل preparing/active/closed وحدها.
-- تراجع: rollback_0037.sql — يرجّع flock_for وvoid_flock_issue وrecord_flock_issue وflock_issue_options كما في 0019 و0026، وhalls_check وclose_flock
--   وrecord_flock_count_adjust وflock_detail وflock_feed وhalls_day وflock_cycles كما في 0029، وround_visits كما في 0032، وflock_day_check وrecord_flock_weight
--   وedit_flock وdelete_flock وset_flock_gas وverify_hall_sheet كما في 0035، وsave_flock_visit وsave_flock_day وset_flock_dead وadd_flock_gas وhalls_history
--   كما في 0036، حرفاً بحرف؛ وقيدي الحالة وأسباب الركن كما كانا؛ ويُسقط الدوالّ الجديدة وقيدي الإلغاء وأعمدته. **طريق رفض**: فوج ملغى (حُذفت قاعته)
--   يوقف التراجع بصوت (النموذج القديم لا يعرف فوجاً ملغى، وقيد حالته يرفضه).
-- تنعاد بأمان: add column if not exists، وdrop constraint if exists قبل القيد، وcreate or replace، وrevoke وgrant.

set lock_timeout = '5s';

-- ─── أ. الفوج الملغى: الحالة وأعمدة الإلغاء وقيداها، وسبب الركن السادس ──────────────────────────────────────────────────────
-- الأعمدة بلا منح كتابة (flocks جدول functionOnly)، ولا يكتبها إلّا delete_hall. والملغى بلا closed_on (flocks_closed_check كما هو).
alter table public.flocks add column if not exists voided_at timestamptz;
alter table public.flocks add column if not exists voided_by uuid;
alter table public.flocks add column if not exists void_reason text;
alter table public.flocks drop constraint if exists flocks_status_check,
  add constraint flocks_status_check check (status in ('preparing', 'active', 'closed', 'void'));
alter table public.flocks drop constraint if exists flocks_void_check,
  add constraint flocks_void_check check ((status = 'void') = (voided_at is not null));
alter table public.flocks drop constraint if exists flocks_void_reason_check,
  add constraint flocks_void_reason_check check (void_reason is null or length(btrim(void_reason)) between 1 and 500);
alter table public.flock_day_rejects drop constraint if exists flock_day_rejects_reason_check,
  add constraint flock_day_rejects_reason_check check (reason in ('flock_closed', 'out_of_scope', 'date_too_old', 'period_locked', 'dead_recorded', 'flock_void'));

-- ─── ب. لا يُعرض الفوج الملغى ولا يُكتب له: المدخل الواحد للفوج بمعرّفه، وقاعدة يوم القاعة، والقاعة المحذوفة لا تعود ───────────────────
-- الجسم الأخير من 0026، ومعه flock_void بعد النطاق.
create or replace function private.flock_for(p_flock uuid, p_write boolean) returns public.flocks
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  f public.flocks;
  v_hall text;
begin
  select * into f from public.flocks x where x.org_id = public.auth_org() and x.id = p_flock;
  if f.id is null then
    raise exception 'flock_not_found' using hint = 'هذا الفوج غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(f.site_id) then
    raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  -- 0037: فوج حُذفت قاعته (ملغى) لا يُعرض ولا يُكتب له، قراءةً أو كتابةً.
  if f.status = 'void' then
    raise exception 'flock_void' using hint = 'حُذفت قاعة هذا الفوج، فلا يُعرض ولا يُسجَّل له شيء.';
  end if;
  if p_write then
    select h.name into v_hall from public.halls h where h.org_id = f.org_id and h.id = f.hall_id;
    if f.status = 'closed' then
      raise exception 'flock_closed' using hint = format('فوج «%s» مغلق، فلا يُسجَّل له شيء.', v_hall);
    end if;
    if f.status <> 'active' then
      raise exception 'flock_not_placed' using hint = format('فوج «%s» لم يُسكَّن بعد، فلا يُسجَّل له شيء.', v_hall);
    end if;
  end if;
  return f;
end
$$;

-- الجسم الأخير من 0035، ومعه flock_void أوّلاً (set_flock_dead وadd_flock_gas وset_flock_gas وrecord_flock_weight وsend_flock_feed).
create or replace function private.flock_day_check(f public.flocks, p_on date) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_today date := public.app_today();
  v_lock date;
  v_hall text;
begin
  -- 0037: الوجبة التي حُذفت قاعتها أوّلاً، قبل أيّ فحص ليومها.
  if f.status = 'void' then
    raise exception 'flock_void' using hint = 'حُذفت قاعة هذا الفوج، فلا يُعرض ولا يُسجَّل له شيء.';
  end if;
  if p_on is null or not isfinite(p_on) then
    raise exception 'date_required' using hint = 'اختر يوماً من أيّام الوجبة.';
  end if;
  if p_on > v_today then
    raise exception 'date_in_future' using hint = format('يوم %s لم يأتِ بعد؛ يُكتب لليوم %s أو لما قبله من أيّام الوجبة.', to_char(p_on, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY'));
  end if;
  select h.name into v_hall from public.halls h where h.org_id = f.org_id and h.id = f.hall_id;
  if p_on < f.placed_on then
    raise exception 'before_placement' using hint = format('يوم %s قبل تسكين الوجبة في «%s» يوم %s.', to_char(p_on, 'DD/MM/YYYY'), v_hall, to_char(f.placed_on, 'DD/MM/YYYY'));
  end if;
  if f.status = 'closed' then
    raise exception 'flock_closed' using hint = format('وجبة «%s» مغلقة، فلا يُكتب لها شيء. إن كان التسجيل صحيحاً فأعِد فتح الوجبة أوّلاً.', v_hall);
  end if;
  if f.status <> 'active' then
    raise exception 'flock_not_placed' using hint = format('وجبة «%s» لم تُسكَّن بعد، فلا يُكتب لها شيء.', v_hall);
  end if;
  select l.locked_through into v_lock from public.period_locks l where l.org_id = f.org_id;
  if v_lock is not null and p_on <= v_lock then
    raise exception 'period_locked' using hint = format('الحسابات مقفلة حتى %s (هذا اليوم وما قبله)، فلا يُكتب ليوم %s. إن كان التاريخ صحيحاً فاطلب من مالك المنشأة فتح الفترة.',
      to_char(v_lock, 'DD/MM/YYYY'), to_char(p_on, 'DD/MM/YYYY'));
  end if;
end
$$;

-- الجسم الأخير من 0029، ومعه رفض إعادة قاعة فيها فوج ملغى من الأرشيف.
create or replace function private.halls_check() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.sites;
  v_kind text;
begin
  set local lock_timeout = '5s';
  if tg_op = 'INSERT' or new.archived_at is null and old.archived_at is not null then
    select * into s from public.sites x where x.org_id = new.org_id and x.id = new.site_id for share;
  else
    select * into s from public.sites x where x.org_id = new.org_id and x.id = new.site_id;
  end if;
  select d.kind into v_kind from public.divisions d where d.org_id = s.org_id and d.id = s.division_id;
  if s.id is null or s.kind <> 'farm' or coalesce(v_kind not in ('broiler', 'layer'), true) then
    raise exception 'hall_site_kind' using hint = 'القاعة تُضاف في حقل من حقول اللحم أو حقول البيض فقط. اختر الحقل من جديد.';
  end if;
  new.division_id := s.division_id;
  if new.archived_at is null and s.archived_at is not null and (tg_op = 'INSERT' or old.archived_at is not null) then
    raise exception 'site_archived' using hint = 'الحقل مؤرشف. أعِده من الأرشيف أوّلاً، ثم أضف القاعة أو أعِدها.';
  end if;
  if new.archived_at is null and exists (
    select 1 from public.halls h
    where h.org_id = new.org_id and h.site_id = new.site_id and h.id <> new.id and h.archived_at is null and btrim(h.name) = btrim(new.name)
  ) then
    raise exception 'hall_name_taken' using hint = format('في هذا الحقل قاعة فعّالة باسم «%s». اختر اسماً آخر.', btrim(new.name));
  end if;
  if tg_op = 'UPDATE' and new.archived_at is not null and old.archived_at is null
     and exists (select 1 from public.flocks f where f.org_id = new.org_id and f.hall_id = new.id and f.status in ('preparing', 'active')) then
    raise exception 'hall_in_use' using hint = 'في هذه القاعة فوج قائم، فلا تُؤرشف قبل إغلاقه.';
  end if;
  -- 0028: ولا وفيها علف منقول معلَّق للدورة التالية (يُرجَع إلى مخزن أوّلاً).
  if tg_op = 'UPDATE' and new.archived_at is not null and old.archived_at is null
     and exists (select 1 from public.flock_close_lines l join public.flock_closes c on c.org_id = l.org_id and c.id = l.close_id
       where l.org_id = new.org_id and l.hall_id = new.id and l.carry_status = 'pending' and c.status = 'closed') then
    raise exception 'hall_has_carry' using hint = format('في القاعة «%s» علف منقول للدورة التالية، فلا تُؤرشف قبل أن يُرجَع إلى مخزن.', btrim(new.name));
  end if;
  -- 0037: القاعة المحذوفة بفوجها (الملغى) لا تعود من الأرشيف: فوجها ملغى في كلّ مكان، وقاعة فعّالة بفوج ملغى خرق للثابت.
  if tg_op = 'UPDATE' and new.archived_at is null and old.archived_at is not null
     and exists (select 1 from public.flocks f where f.org_id = new.org_id and f.hall_id = new.id and f.status = 'void') then
    raise exception 'hall_deleted' using hint = format('حُذفت القاعة «%s» بفوجها، فلا تعود من الأرشيف. أضف قاعة جديدة بالاسم نفسه.', btrim(new.name));
  end if;
  return new;
end
$$;

-- ─── ج. الكتّاب: الركن من الطابور بسبب flock_void، والرفض بنداء مباشر ─────────────────────────────────────────────────────────
-- الأجسام الأخيرة من 0036 (save_flock_visit وsave_flock_day وset_flock_dead وadd_flock_gas) و0035 (set_flock_gas)، والسبب الأوّل للركن flock_void.
create or replace function public.save_flock_visit(p_visit uuid, p_flock uuid, p_date date, p_recorded_at timestamptz,
  p_dead integer, p_culled integer, p_feed_kg numeric, p_eggs_total integer, p_eggs_cracked integer, p_eggs_broken integer,
  p_note text, p_base_version integer, p_void boolean, p_client_ref uuid, p_queued boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'save_flock_visit';
  v_cached jsonb;
  v_today date := public.app_today();
  v_lock date;
  v_park text;
  v_queued boolean := coalesce(p_queued, false);
  v_void boolean := coalesce(p_void, false);
  v_note text := private.note_text(p_note);
  v_payload jsonb;
  f public.flocks;
  v public.flock_visits;
  d public.flock_daily;
  v_mark boolean;
  v_hall text;
begin
  v_payload := jsonb_build_object('visit', p_visit, 'recorded_at', p_recorded_at, 'dead', p_dead, 'culled', p_culled, 'feed_kg', p_feed_kg::text,
    'eggs_total', p_eggs_total, 'eggs_cracked', p_eggs_cracked, 'eggs_broken', p_eggs_broken, 'note', p_note, 'base_version', p_base_version,
    'void', v_void);
  v_cached := private.ref_claim(v_fn, p_client_ref, v_payload || jsonb_build_object('flock', p_flock, 'date', p_date, 'queued', v_queued));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.require('flock_day.save');
  if p_visit is null then
    raise exception 'visit_required' using hint = 'تعذّر الحفظ دون معرّف الزيارة. حدّث الشاشة وأعد التسجيل.';
  end if;
  set local lock_timeout = '5s';
  perform private.period_guard();
  select * into f from public.flocks x where x.org_id = public.auth_org() and x.id = p_flock for update;
  if f.id is null then
    raise exception 'flock_not_found' using hint = 'هذا الفوج غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if p_date is null then
    raise exception 'date_required' using hint = 'اكتب تاريخ اليوم.';
  end if;
  if p_date > v_today then
    raise exception 'date_in_future' using hint = format('التاريخ %s بعد تاريخ اليوم %s. الزيارة تُسجَّل لليوم أو لما قبله.', to_char(p_date, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY'));
  end if;
  select l.locked_through into v_lock from public.period_locks l where l.org_id = f.org_id;
  -- الثلاثة التي تتغيّر والعملية بالطابور (0035: بلا حدّ الأيّام السبعة؛ كلّ أيّام الوجبة القائمة): بنداء مباشر ترمي، ومن الطابور (queued) تُركن وترجع parked.
  -- 0037: ورابعها فوج حُذفت قاعته: بنداء مباشر flock_void، ومن الطابور يُركن بسببه كالمغلق.
  if f.status = 'void' then
    if not v_queued then
      raise exception 'flock_void' using hint = 'حُذفت قاعة هذا الفوج، فلا يُعرض ولا يُسجَّل له شيء.';
    end if;
    v_park := 'flock_void';
  elsif f.status = 'closed' then
    if not v_queued then
      raise exception 'flock_closed' using hint = 'الفوج مغلق، فلا تُسجَّل عليه زيارة.';
    end if;
    v_park := 'flock_closed';
  elsif not public.in_scope_site(f.site_id) then
    if not v_queued then
      raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
    end if;
    v_park := 'out_of_scope';
  elsif v_lock is not null and p_date <= v_lock then
    if not v_queued then
      raise exception 'period_locked' using hint = format('الحسابات مقفلة حتى %s (هذا اليوم وما قبله)، فلا تُسجَّل زيارة بتاريخ %s. إن كان التاريخ صحيحاً فاطلب من مالك المنشأة فتح الفترة.',
        to_char(v_lock, 'DD/MM/YYYY'), to_char(p_date, 'DD/MM/YYYY'));
    end if;
    v_park := 'period_locked';
  end if;
  if v_park is not null then
    insert into public.flock_day_rejects (org_id, flock_id, hall_id, site_id, division_id, on_date, client_ref, payload, reason, created_by, visit_id)
    values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_date, p_client_ref, v_payload, v_park, auth.uid(), p_visit)
    on conflict (org_id, visit_id) where visit_id is not null do update
      set client_ref = excluded.client_ref, payload = excluded.payload, reason = excluded.reason, created_at = now(),
          version = public.flock_day_rejects.version + 1, decision = null, decided_by = null, decided_at = null;
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'parked', 'reason', v_park));
  end if;
  if f.status <> 'active' then
    raise exception 'flock_not_placed' using hint = 'الفوج لم يُسكَّن بعد، فلا تُسجَّل عليه زيارة.';
  end if;
  if p_date < f.placed_on then
    raise exception 'before_placement' using hint = format('التاريخ %s قبل تسكين الفوج في %s.', to_char(p_date, 'DD/MM/YYYY'), to_char(f.placed_on, 'DD/MM/YYYY'));
  end if;

  -- الزيارة بمعرّفها بعد قفل صفّ فوجها (كلّ كاتب لزيارات الفوج يأخذه أوّلاً).
  select * into v from public.flock_visits x where x.org_id = f.org_id and x.id = p_visit;
  if v.id is not null and (v.flock_id <> f.id or v.on_date <> p_date) then
    raise exception 'visit_moved' using hint = 'هذه الزيارة مسجّلة لقاعة أخرى أو ليوم آخر. حدّث الشاشة ثمّ أعد التسجيل.';
  end if;
  if v_void then
    -- الإلغاء: إلغاء الملغاة إعادة آمنة بلا كتابة، وغير ذلك بشرط النسخة.
    if v.id is not null and v.voided_at is not null then
      select * into d from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_date;
      return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'visit', private.flock_visit_json(v), 'day', private.flock_day_json(d)));
    end if;
    if v.id is null or v.version is distinct from p_base_version then
      return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'stale_visit', 'server', private.flock_visit_json(v)));
    end if;
  elsif p_base_version is null then
    -- الإضافة بمعرّف مسجَّل (مرجع جديد): بالمحتوى نفسه وحيّة = حُفظت، وغير ذلك stale_visit.
    if v.id is not null then
      if v.voided_at is null and (v.dead, v.culled, v.feed_kg, v.eggs_total, v.eggs_cracked, v.eggs_broken, v.note)
         is not distinct from (coalesce(p_dead, 0), coalesce(p_culled, 0), p_feed_kg, p_eggs_total, p_eggs_cracked, p_eggs_broken, v_note) then
        select * into d from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_date;
        return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'visit', private.flock_visit_json(v), 'day', private.flock_day_json(d)));
      end if;
      return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'stale_visit', 'server', private.flock_visit_json(v)));
    end if;
  elsif v.id is null or v.voided_at is not null or v.version is distinct from p_base_version then
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'stale_visit', 'server', private.flock_visit_json(v)));
  end if;

  if not v_void then
    if p_dead < 0 or p_dead > 10000000 then
      raise exception 'bad_value' using hint = 'النافق عدد صحيح من صفر إلى 10,000,000.';
    end if;
    if p_culled < 0 or p_culled > 10000000 then
      raise exception 'bad_value' using hint = 'المستبعد عدد صحيح من صفر إلى 10,000,000.';
    end if;
    if p_feed_kg is not null and not (abs(p_feed_kg) < 'Infinity' and p_feed_kg >= 0 and p_feed_kg < 1000000000 and p_feed_kg = round(p_feed_kg, 3)) then
      raise exception 'bad_value' using hint = 'العلف بالكيلوغرام من صفر فأكثر، بثلاث مراتب عشرية على الأكثر.';
    end if;
    if p_eggs_total < 0 or p_eggs_cracked < 0 or p_eggs_broken < 0
       or p_eggs_total > 10000000 or p_eggs_cracked > 10000000 or p_eggs_broken > 10000000 then
      raise exception 'bad_value' using hint = 'أعداد البيض أعداد صحيحة من صفر إلى 10,000,000.';
    end if;
    if length(v_note) > 500 then
      raise exception 'bad_note' using hint = 'الملاحظة لا تزيد على 500 حرف.';
    end if;
    if f.kind = 'broiler' and (p_eggs_total is not null or p_eggs_cracked is not null or p_eggs_broken is not null) then
      raise exception 'eggs_on_broiler' using hint = 'فوج اللحم لا بيض له؛ البيض لأفواج البيّاض فقط.';
    end if;
    if (p_eggs_cracked is not null or p_eggs_broken is not null) and p_eggs_total is null then
      raise exception 'eggs_need_total' using hint = 'اكتب بيض الزيارة كلّه قبل المكسور والمشعور.';
    end if;
    if coalesce(p_eggs_cracked, 0) + coalesce(p_eggs_broken, 0) > coalesce(p_eggs_total, 0) then
      raise exception 'eggs_over_total' using hint = format('المكسور والمشعور (%s) أكثر من بيض الزيارة كلّه (%s). راجع الأرقام.',
        to_char(coalesce(p_eggs_cracked, 0) + coalesce(p_eggs_broken, 0), 'FM999,999,999,990'), to_char(p_eggs_total, 'FM999,999,999,990'));
    end if;
    if p_base_version is null and (p_recorded_at is null or not isfinite(p_recorded_at) or p_recorded_at > now() + interval '10 minutes') then
      raise exception 'bad_time' using hint = 'وقت الزيارة غير صالح: ساعة الجهاز متقدّمة على الخادم. صحّح ساعة الهاتف ثمّ أعد التسجيل.';
    end if;
    if p_dead is null and p_culled is null and p_feed_kg is null and p_eggs_total is null and p_eggs_cracked is null and p_eggs_broken is null
       and v_note is null then
      raise exception 'empty_visit' using hint = 'اكتب رقماً واحداً على الأقلّ قبل حفظ الزيارة، أو ألغِ الزيارة.';
    end if;
  end if;

  -- 0036: علامة الزيارة: يبقى فيها نافق أو مستبعد (الصفر لا يقفل الجولة). وزيارة جديدة، أو تعديل يرفع زيارة من صفر، بهلاكات ليوم علّمته زيارة حيّة
  -- أخرى (بعد قفل صفّ الوجبة، فكاتبان لليوم يترتّبان) لا تُضاف: من الطابور تُركن كلّها dead_recorded، وبنداء مباشر ترمي. وتعديل المعلَّمة نفسها مسموح.
  v_mark := not v_void and coalesce(p_dead, 0) + coalesce(p_culled, 0) > 0;
  if v_mark and (v.id is null or v.dead + v.culled = 0)
     and exists (select 1 from public.flock_visits x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_date and x.voided_at is null
       and x.dead_entry and x.id <> p_visit) then
    if v_queued then
      insert into public.flock_day_rejects (org_id, flock_id, hall_id, site_id, division_id, on_date, client_ref, payload, reason, created_by, visit_id)
      values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_date, p_client_ref, v_payload, 'dead_recorded', auth.uid(), p_visit)
      on conflict (org_id, visit_id) where visit_id is not null do update
        set client_ref = excluded.client_ref, payload = excluded.payload, reason = excluded.reason, created_at = now(),
            version = public.flock_day_rejects.version + 1, decision = null, decided_by = null, decided_at = null;
      return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'parked', 'reason', 'dead_recorded'));
    end if;
    select * into d from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_date;
    select h.name into v_hall from public.halls h where h.org_id = f.org_id and h.id = f.hall_id;
    raise exception 'dead_recorded' using hint = format('هلاكات يوم %s في «%s» مسجّلة (%s)، فلا تُضاف إليها هلاكات زيارة أخرى. لتصحيح العدد افتح صفحة القاعة ← ✎ تعديل الجدول.',
      to_char(p_date, 'DD/MM/YYYY'), v_hall, to_char(coalesce(d.dead + d.culled, 0), 'FM999,999,990'));
  end if;

  if v_void then
    update public.flock_visits x set voided_at = now(), voided_by = auth.uid(), version = x.version + 1, updated_at = now(), updated_by = auth.uid()
    where x.org_id = v.org_id and x.id = v.id
    returning * into v;
  elsif v.id is null then
    insert into public.flock_visits (id, org_id, flock_id, hall_id, site_id, division_id, on_date, recorded_at, dead, culled, feed_kg,
      eggs_total, eggs_cracked, eggs_broken, note, source, version, dead_entry)
    values (p_visit, f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_date, p_recorded_at, coalesce(p_dead, 0), coalesce(p_culled, 0), p_feed_kg,
      p_eggs_total, p_eggs_cracked, p_eggs_broken, v_note, 'visit', 1, v_mark)
    returning * into v;
  elsif (v.dead, v.culled, v.feed_kg, v.eggs_total, v.eggs_cracked, v.eggs_broken, v.note)
        is not distinct from (coalesce(p_dead, 0), coalesce(p_culled, 0), p_feed_kg, p_eggs_total, p_eggs_cracked, p_eggs_broken, v_note) then
    -- التعديل بالمحتوى نفسه: حُفظ بلا كتابة (ولا تكبر النسخة).
    select * into d from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_date;
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'visit', private.flock_visit_json(v), 'day', private.flock_day_json(d)));
  else
    update public.flock_visits x
    set dead = coalesce(p_dead, 0), culled = coalesce(p_culled, 0), feed_kg = p_feed_kg, eggs_total = p_eggs_total, eggs_cracked = p_eggs_cracked,
        eggs_broken = p_eggs_broken, note = v_note, dead_entry = v_mark, version = x.version + 1, updated_at = now(), updated_by = auth.uid()
    where x.org_id = v.org_id and x.id = v.id
    returning * into v;
  end if;

  -- مجموع اليوم من زياراته الحيّة (0036: وعلامته منها)، ثمّ الأيّام على المجموع: البيض لا يزيد على الحيّ أوّل اليوم (هذا اليوم وما بعده)، والحيّ لا
  -- يصير سالباً في أيّ يوم.
  d := private.flock_day_rebuild(f, p_date);
  perform private.flock_eggs_live_check(f, p_date);
  perform private.flock_live_check(f);
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'visit', private.flock_visit_json(v), 'day', private.flock_day_json(d)));
end
$$;

create or replace function public.save_flock_day(p_flock uuid, p_date date, p_dead integer, p_culled integer, p_feed_kg numeric, p_water_l numeric,
  p_temp_min numeric, p_temp_max numeric, p_eggs_total integer, p_eggs_cracked integer, p_eggs_broken integer, p_note text,
  p_base_version integer, p_client_ref uuid, p_queued boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'save_flock_day';
  v_cached jsonb;
  v_today date := public.app_today();
  v_lock date;
  v_park text;
  v_queued boolean := coalesce(p_queued, false);
  v_payload jsonb;
  f public.flocks;
  d public.flock_daily;
  n public.flock_daily;
  v_others bigint;
  v_live bigint;
  v_bad record;
  v_mark boolean;
begin
  v_payload := jsonb_build_object('dead', p_dead, 'culled', p_culled, 'feed_kg', p_feed_kg::text, 'water_l', p_water_l::text,
    'temp_min', p_temp_min::text, 'temp_max', p_temp_max::text, 'eggs_total', p_eggs_total, 'eggs_cracked', p_eggs_cracked,
    'eggs_broken', p_eggs_broken, 'note', p_note, 'base_version', p_base_version);
  v_cached := private.ref_claim(v_fn, p_client_ref, v_payload || jsonb_build_object('flock', p_flock, 'date', p_date, 'queued', v_queued));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.require('flock_day.save');
  set local lock_timeout = '5s';
  perform private.period_guard();
  select * into f from public.flocks x where x.org_id = public.auth_org() and x.id = p_flock for update;
  if f.id is null then
    raise exception 'flock_not_found' using hint = 'هذا الفوج غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if p_date is null then
    raise exception 'date_required' using hint = 'اكتب تاريخ اليوم.';
  end if;
  if p_date > v_today then
    raise exception 'date_in_future' using hint = format('التاريخ %s بعد تاريخ اليوم %s. الجولة تُسجَّل لليوم أو لما قبله.', to_char(p_date, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY'));
  end if;
  select l.locked_through into v_lock from public.period_locks l where l.org_id = f.org_id;
  -- الثلاثة التي تتغيّر والعملية بالطابور (0035: بلا حدّ الأيّام السبعة؛ كلّ أيّام الوجبة القائمة): بنداء مباشر ترمي، ومن الطابور (queued) تُركن وترجع parked.
  -- 0037: ورابعها فوج حُذفت قاعته: بنداء مباشر flock_void، ومن الطابور يُركن بسببه كالمغلق.
  if f.status = 'void' then
    if not v_queued then
      raise exception 'flock_void' using hint = 'حُذفت قاعة هذا الفوج، فلا يُعرض ولا يُسجَّل له شيء.';
    end if;
    v_park := 'flock_void';
  elsif f.status = 'closed' then
    if not v_queued then
      raise exception 'flock_closed' using hint = 'الفوج مغلق، فلا تُسجَّل عليه جولة.';
    end if;
    v_park := 'flock_closed';
  elsif not public.in_scope_site(f.site_id) then
    if not v_queued then
      raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
    end if;
    v_park := 'out_of_scope';
  elsif v_lock is not null and p_date <= v_lock then
    if not v_queued then
      raise exception 'period_locked' using hint = format('الحسابات مقفلة حتى %s (هذا اليوم وما قبله)، فلا تُسجَّل جولة بتاريخ %s. إن كان التاريخ صحيحاً فاطلب من مالك المنشأة فتح الفترة.',
        to_char(v_lock, 'DD/MM/YYYY'), to_char(p_date, 'DD/MM/YYYY'));
    end if;
    v_park := 'period_locked';
  end if;
  if v_park is not null then
    insert into public.flock_day_rejects (org_id, flock_id, hall_id, site_id, division_id, on_date, client_ref, payload, reason, created_by)
    values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_date, p_client_ref, v_payload, v_park, auth.uid())
    on conflict (org_id, created_by, flock_id, on_date) where visit_id is null do update
      set client_ref = excluded.client_ref, payload = excluded.payload, reason = excluded.reason, created_at = now(),
          version = public.flock_day_rejects.version + 1, decision = null, decided_by = null, decided_at = null;
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'parked', 'reason', v_park));
  end if;
  if f.status <> 'active' then
    raise exception 'flock_not_placed' using hint = 'الفوج لم يُسكَّن بعد، فلا تُسجَّل عليه جولة.';
  end if;
  if p_date < f.placed_on then
    raise exception 'before_placement' using hint = format('التاريخ %s قبل تسكين الفوج في %s.', to_char(p_date, 'DD/MM/YYYY'), to_char(f.placed_on, 'DD/MM/YYYY'));
  end if;

  select * into d from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_date;
  if (p_base_version is null and d.id is not null) or (p_base_version is not null and d.version is distinct from p_base_version) then
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'stale_day', 'server', private.flock_day_json(d)));
  end if;

  if p_dead < 0 or p_dead > 10000000 then
    raise exception 'bad_value' using hint = 'النافق عدد صحيح من صفر فأكثر.';
  end if;
  if p_culled < 0 or p_culled > 10000000 then
    raise exception 'bad_value' using hint = 'المستبعد عدد صحيح من صفر فأكثر.';
  end if;
  if p_feed_kg is not null and not (abs(p_feed_kg) < 'Infinity' and p_feed_kg >= 0 and p_feed_kg < 1000000000 and p_feed_kg = round(p_feed_kg, 3)) then
    raise exception 'bad_value' using hint = 'العلف بالكيلوغرام من صفر فأكثر، بثلاث مراتب عشرية على الأكثر.';
  end if;
  if p_water_l is not null and not (abs(p_water_l) < 'Infinity' and p_water_l >= 0 and p_water_l < 1000000000 and p_water_l = round(p_water_l, 3)) then
    raise exception 'bad_value' using hint = 'الماء باللتر من صفر فأكثر، بثلاث مراتب عشرية على الأكثر.';
  end if;
  if (p_temp_min is not null and not (abs(p_temp_min) < 'Infinity' and p_temp_min between -50 and 70 and p_temp_min = round(p_temp_min, 1)))
     or (p_temp_max is not null and not (abs(p_temp_max) < 'Infinity' and p_temp_max between -50 and 70 and p_temp_max = round(p_temp_max, 1))) then
    raise exception 'bad_temp' using hint = 'درجة الحرارة من −50 إلى 70، بمرتبة عشرية واحدة على الأكثر.';
  end if;
  -- الحدّ الأعلى للثلاثة (مو للمجموع بس): مكسور ومشعور بالمليارات كانوا يطفحون int4 بجمعهما ويرجعون «integer out of range» بلا تلميح.
  if p_eggs_total < 0 or p_eggs_cracked < 0 or p_eggs_broken < 0
     or p_eggs_total > 10000000 or p_eggs_cracked > 10000000 or p_eggs_broken > 10000000 then
    raise exception 'bad_value' using hint = 'أعداد البيض أعداد صحيحة من صفر إلى 10,000,000.';
  end if;
  if p_note is not null and length(p_note) > 500 then
    raise exception 'bad_note' using hint = 'الملاحظة لا تزيد على 500 حرف.';
  end if;
  if f.kind = 'broiler' and (p_eggs_total is not null or p_eggs_cracked is not null or p_eggs_broken is not null) then
    raise exception 'eggs_on_broiler' using hint = 'فوج اللحم لا بيض له؛ البيض لأفواج البيّاض فقط.';
  end if;
  if d.id is null and p_dead is null and p_culled is null and p_feed_kg is null and p_water_l is null and p_temp_min is null and p_temp_max is null
     and p_eggs_total is null and p_eggs_cracked is null and p_eggs_broken is null and nullif(p_note, '') is null then
    raise exception 'empty_day' using hint = 'اكتب رقماً واحداً على الأقلّ قبل الحفظ.';
  end if;

  -- القيم الجديدة: الفارغ = بلا تغيير، والملاحظة الفارغة تمسح.
  n := d;
  n.dead := coalesce(p_dead, d.dead, 0);
  n.culled := coalesce(p_culled, d.culled, 0);
  n.feed_kg := coalesce(p_feed_kg, d.feed_kg);
  n.water_l := coalesce(p_water_l, d.water_l);
  n.temp_min := coalesce(p_temp_min, d.temp_min);
  n.temp_max := coalesce(p_temp_max, d.temp_max);
  n.eggs_total := coalesce(p_eggs_total, d.eggs_total);
  n.eggs_cracked := coalesce(p_eggs_cracked, d.eggs_cracked);
  n.eggs_broken := coalesce(p_eggs_broken, d.eggs_broken);
  n.note := case when p_note is null then d.note else nullif(p_note, '') end;
  -- 0036: علامة زيارة day_total: بهلاكات في النداء تُعلَّم حين يبقى نافق أو مستبعد (فمسحها صفراً يعيد خانة الجولة مفتوحة)، وبلا هلاكات في النداء تُنقل
  -- من زيارات اليوم الحيّة التي تُلغيها (تعديل البيض أو الملاحظة لا يفتح الهلاكات). والعلامة تغيّرت = كتابة ولو بقيت القيم كما هي.
  v_mark := case when p_dead is not null or p_culled is not null then n.dead + n.culled > 0
    else exists (select 1 from public.flock_visits x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_date and x.voided_at is null
      and x.dead_entry) end;
  if d.id is not null and (n.dead, n.culled, n.feed_kg, n.water_l, n.temp_min, n.temp_max, n.eggs_total, n.eggs_cracked, n.eggs_broken, n.note, v_mark)
     is not distinct from (d.dead, d.culled, d.feed_kg, d.water_l, d.temp_min, d.temp_max, d.eggs_total, d.eggs_cracked, d.eggs_broken, d.note, d.dead_entered) then
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'version', d.version));
  end if;
  if n.temp_min > n.temp_max then
    raise exception 'bad_temp' using hint = format('الصغرى %s أكبر من العظمى %s. راجع درجتي الحرارة.', n.temp_min, n.temp_max);
  end if;
  if (n.eggs_cracked is not null or n.eggs_broken is not null) and n.eggs_total is null then
    raise exception 'eggs_need_total' using hint = 'اكتب بيض اليوم كلّه قبل المكسور والمشعور.';
  end if;
  if coalesce(n.eggs_cracked, 0) + coalesce(n.eggs_broken, 0) > coalesce(n.eggs_total, 0) then
    raise exception 'eggs_over_total' using hint = format('المكسور والمشعور (%s) أكثر من بيض اليوم كلّه (%s). راجع الأرقام.',
      to_char(coalesce(n.eggs_cracked, 0) + coalesce(n.eggs_broken, 0), 'FM999,999,999,990'), to_char(n.eggs_total, 'FM999,999,999,990'));
  end if;

  -- الحيّ = المسكّن − كل النافق − كل المستبعد + عدد الطيور (المباع وفرق العدّ، 0028) ≥ صفر (FOUNDATION ٤٣٤)، تحت قفل صفّ الفوج.
  select coalesce(sum(x.dead + x.culled), 0) into v_others from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date <> p_date;
  v_live := f.placed_count - v_others + private.flock_counts_total(f.id);
  if v_live - n.dead - n.culled < 0 then
    raise exception 'live_negative' using hint = format('النافق والمستبعد (%s) أكثر من الطيور الحيّة (%s). راجع الأرقام.',
      to_char(n.dead + n.culled, 'FM999,999,999,990'), to_char(greatest(v_live, 0), 'FM999,999,999,990'));
  end if;
  -- بيض اليوم ما يزيد على الدجاج الحيّ بدايته (القاعدة ٣٢)، لهذا اليوم ولكل يوم بعده سجّل بيضاً (النافق الجديد يقلّل حيّه).
  select x.on_date, x.eggs_total, x.live_start into v_bad from (
    select y.on_date, y.eggs_total,
      f.placed_count - coalesce(sum(y.dead + y.culled) over (order by y.on_date rows between unbounded preceding and 1 preceding), 0)
        + coalesce((select sum(k.adjust - k.sold) from private.flock_count_days(f.id) as k where k.on_date < y.on_date), 0) as live_start
    from (
      select z.on_date, z.dead, z.culled, z.eggs_total from public.flock_daily z where z.org_id = f.org_id and z.flock_id = f.id and z.on_date <> p_date
      union all
      select p_date, n.dead, n.culled, n.eggs_total
    ) as y
  ) as x
  where x.on_date >= p_date and x.eggs_total > x.live_start
  order by x.on_date limit 1;
  if v_bad.on_date is not null then
    raise exception 'eggs_over_live' using hint = format('بيض يوم %s (%s) أكثر من الدجاج الحيّ في بدايته (%s)، والنسبة فوق 100٪ خطأ إدخال. راجع الأرقام.',
      to_char(v_bad.on_date, 'DD/MM/YYYY'), to_char(v_bad.eggs_total, 'FM999,999,999,990'), to_char(v_bad.live_start, 'FM999,999,999,990'));
  end if;

  -- 0032: الكتابة بالزيارات («اجعل مجموع اليوم كذا»): تُلغى زيارات اليوم الحيّة كلّها (علامة، ونسخة كلّ واحدة تكبر)، وتُضاف زيارة day_total بالمجموع
  -- المدموج (0036: وبعلامتها)، ثمّ يُعاد بناء صفّ اليوم منها (نسخته السابقة + 1، أو مجموع نسخ زيارات يومه لصفّ جديد؛ وعلامته منها).
  update public.flock_visits x set voided_at = now(), voided_by = auth.uid(), version = x.version + 1, updated_at = now(), updated_by = auth.uid()
  where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_date and x.voided_at is null;
  insert into public.flock_visits (org_id, flock_id, hall_id, site_id, division_id, on_date, recorded_at, dead, culled, feed_kg, water_l, temp_min, temp_max,
    eggs_total, eggs_cracked, eggs_broken, note, source, version, dead_entry)
  values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_date, now(), n.dead, n.culled, n.feed_kg, n.water_l, n.temp_min, n.temp_max,
    n.eggs_total, n.eggs_cracked, n.eggs_broken, n.note, 'day_total', 1, v_mark);
  n := private.flock_day_rebuild(f, p_date);
  -- 0028: الحيّ لا يصير سالباً في أيّ يوم (المباع وفرق العدّ بتاريخهما)، والرفض لا يُبقي شيئاً.
  perform private.flock_live_check(f);
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'version', n.version));
end
$$;

create or replace function public.set_flock_dead(p_flock uuid, p_on date, p_dead integer, p_client_ref uuid, p_queued boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'set_flock_dead';
  v_cached jsonb;
  v_today date := public.app_today();
  v_queued boolean := coalesce(p_queued, false);
  v_lock date;
  v_park text;
  f public.flocks;
  d public.flock_daily;
begin
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('flock', p_flock, 'on', p_on, 'dead', p_dead, 'queued', v_queued));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.require('flock_day.save');
  set local lock_timeout = '5s';
  perform private.period_guard();
  select * into f from public.flocks x where x.org_id = public.auth_org() and x.id = p_flock for update;
  if f.id is null then
    raise exception 'flock_not_found' using hint = 'هذه الوجبة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if p_on is null or not isfinite(p_on) then
    raise exception 'date_required' using hint = 'اختر يوماً من أيّام الوجبة.';
  end if;
  if p_on > v_today then
    raise exception 'date_in_future' using hint = format('يوم %s لم يأتِ بعد؛ تُكتب الهلاكات لليوم %s أو لما قبله من أيّام الوجبة.', to_char(p_on, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY'));
  end if;
  -- الثلاثة التي تتغيّر والعملية بالطابور: بنداء مباشر ترمي، ومن الطابور تُركن وترجع parked (الأحدث للكاتب واليوم يستبدل الأقدم).
  select l.locked_through into v_lock from public.period_locks l where l.org_id = f.org_id;
  -- 0037: وفوج حُذفت قاعته يُركن من الطابور بسببه أوّلاً، وبنداء مباشر يرمي flock_void (flock_day_check).
  v_park := case when f.status = 'void' then 'flock_void' when f.status = 'closed' then 'flock_closed' when not public.in_scope_site(f.site_id) then 'out_of_scope'
    when v_lock is not null and p_on <= v_lock then 'period_locked' end;
  if v_park is not null and v_queued then
    insert into public.flock_day_rejects (org_id, flock_id, hall_id, site_id, division_id, on_date, client_ref, payload, reason, created_by, visit_id)
    values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_on, p_client_ref, jsonb_build_object('dead', p_dead), v_park, auth.uid(),
      md5('dead:' || coalesce(auth.uid()::text, '') || ':' || f.id::text || ':' || to_char(p_on, 'YYYY-MM-DD'))::uuid)
    on conflict (org_id, visit_id) where visit_id is not null do update
      set client_ref = excluded.client_ref, payload = excluded.payload, reason = excluded.reason, created_at = now(),
          version = public.flock_day_rejects.version + 1, decision = null, decided_by = null, decided_at = null;
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'parked', 'reason', v_park));
  end if;
  if v_park = 'out_of_scope' then
    raise exception 'out_of_scope' using hint = 'قاعة هذه الوجبة خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  perform private.flock_day_check(f, p_on);
  if p_dead is null or p_dead < 0 or p_dead > 10000000 then
    raise exception 'bad_value' using hint = 'اكتب الهلاكات عدداً صحيحاً من صفر إلى 10,000,000.';
  end if;

  -- اليوم الذي سُجّلت هلاكاته (علامته المشتقّة؛ ويوم فيه نافق أو مستبعد بلا علامة، احتياطاً): لا يُضاف إليه شيء.
  select * into d from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_on;
  if d.id is not null and (d.dead_entered or d.dead + d.culled > 0) then
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object(
      'status', case when d.dead + d.culled = p_dead then 'saved' else 'dead_recorded' end, 'day', private.flock_day_json(d)));
  end if;

  insert into public.flock_visits (org_id, flock_id, hall_id, site_id, division_id, on_date, recorded_at, dead, culled, source, version, dead_entry)
  values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_on, now(), p_dead, 0, 'visit', 1, true);
  d := private.flock_day_rebuild(f, p_on);
  -- البيض لا يزيد على الحيّ أوّل اليوم (هذا اليوم وما بعده)، والحيّ لا يصير سالباً في أيّ يوم؛ والرفض لا يُبقي شيئاً.
  perform private.flock_eggs_live_check(f, p_on);
  perform private.flock_live_check(f);
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'day', private.flock_day_json(d)));
end
$$;

create or replace function public.add_flock_gas(p_flock uuid, p_on date, p_add integer, p_client_ref uuid, p_queued boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'add_flock_gas';
  v_cached jsonb;
  v_today date := public.app_today();
  v_queued boolean := coalesce(p_queued, false);
  v_lock date;
  v_park text;
  v_hall text;
  f public.flocks;
  g public.flock_day_gas;
begin
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('flock', p_flock, 'on', p_on, 'add', p_add, 'queued', v_queued));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.require('flock_day.save');
  set local lock_timeout = '5s';
  perform private.period_guard();
  select * into f from public.flocks x where x.org_id = public.auth_org() and x.id = p_flock for update;
  if f.id is null then
    raise exception 'flock_not_found' using hint = 'هذه الوجبة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if p_on is null or not isfinite(p_on) then
    raise exception 'date_required' using hint = 'اختر يوماً من أيّام الوجبة.';
  end if;
  if p_on > v_today then
    raise exception 'date_in_future' using hint = format('يوم %s لم يأتِ بعد؛ يُضاف الغاز لليوم %s أو لما قبله من أيّام الوجبة.', to_char(p_on, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY'));
  end if;
  -- الثلاثة التي تتغيّر والعملية بالطابور: بنداء مباشر ترمي، ومن الطابور تُركن وترجع parked (كلّ إضافة صفّ بمرجعها).
  select l.locked_through into v_lock from public.period_locks l where l.org_id = f.org_id;
  -- 0037: وفوج حُذفت قاعته يُركن من الطابور بسببه أوّلاً، وبنداء مباشر يرمي flock_void (flock_day_check).
  v_park := case when f.status = 'void' then 'flock_void' when f.status = 'closed' then 'flock_closed' when not public.in_scope_site(f.site_id) then 'out_of_scope'
    when v_lock is not null and p_on <= v_lock then 'period_locked' end;
  if v_park is not null and v_queued then
    insert into public.flock_day_rejects (org_id, flock_id, hall_id, site_id, division_id, on_date, client_ref, payload, reason, created_by, visit_id)
    values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_on, p_client_ref, jsonb_build_object('gas_add', p_add), v_park, auth.uid(),
      md5('gasadd:' || p_client_ref::text)::uuid)
    on conflict (org_id, visit_id) where visit_id is not null do update
      set client_ref = excluded.client_ref, payload = excluded.payload, reason = excluded.reason, created_at = now(),
          version = public.flock_day_rejects.version + 1, decision = null, decided_by = null, decided_at = null;
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'parked', 'reason', v_park));
  end if;
  if v_park = 'out_of_scope' then
    raise exception 'out_of_scope' using hint = 'قاعة هذه الوجبة خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  perform private.flock_day_check(f, p_on);
  if p_add is null or p_add < 1 or p_add > 1000 then
    raise exception 'bad_value' using hint = 'اكتب عدد القناني المضافة عدداً صحيحاً من 1 إلى 1,000.';
  end if;
  select * into g from public.flock_day_gas x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_on for update;
  if coalesce(g.cylinders, 0) + p_add > 1000 then
    select h.name into v_hall from public.halls h where h.org_id = f.org_id and h.id = f.hall_id;
    -- مراجعة 0036 R3: العدد بين قوسين لا قبل المعدود («3 قنينة» ليست فصحى: الواحد والاثنان كلمة، ومن ثلاث إلى عشر جمع)، والحدّ بالكلمة.
    raise exception 'bad_value' using hint = case
      when coalesce(g.cylinders, 0) >= 1000 then format('غاز يوم %s في «%s» بلغ الحدّ (ألف قنينة لليوم)، فلا يُضاف إليه. إن كان المجموع خطأً فصحّحه من صفحة القاعة.',
        to_char(p_on, 'DD/MM/YYYY'), v_hall)
      else format('مجموع غاز يوم %s في «%s» حتى الآن (%s)، وإضافة %s تتجاوز الحدّ (ألف قنينة لليوم). أضف %s على الأكثر، أو صحّح مجموع اليوم من صفحة القاعة.',
        to_char(p_on, 'DD/MM/YYYY'), v_hall, to_char(coalesce(g.cylinders, 0), 'FM999,990'), to_char(p_add, 'FM999,990'), to_char(1000 - coalesce(g.cylinders, 0), 'FM999,990'))
    end;
  end if;
  if g.id is null then
    insert into public.flock_day_gas (org_id, flock_id, hall_id, site_id, division_id, on_date, cylinders, version)
    values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_on, p_add, 1)
    returning * into g;
  else
    update public.flock_day_gas x set cylinders = coalesce(x.cylinders, 0) + p_add, version = x.version + 1, updated_at = now(), updated_by = auth.uid()
    where x.org_id = g.org_id and x.id = g.id
    returning * into g;
  end if;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'gas', private.flock_gas_json(p_on, g)));
end
$$;

create or replace function public.set_flock_gas(p_flock uuid, p_on date, p_cylinders integer, p_expected_version bigint, p_client_ref uuid,
  p_queued boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'set_flock_gas';
  v_cached jsonb;
  v_today date := public.app_today();
  v_queued boolean := coalesce(p_queued, false);
  v_lock date;
  v_park text;
  f public.flocks;
  g public.flock_day_gas;
begin
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('flock', p_flock, 'on', p_on, 'cylinders', p_cylinders,
    'expected_version', p_expected_version, 'queued', v_queued));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.require('flock_day.save');
  set local lock_timeout = '5s';
  perform private.period_guard();
  select * into f from public.flocks x where x.org_id = public.auth_org() and x.id = p_flock for update;
  if f.id is null then
    raise exception 'flock_not_found' using hint = 'هذه الوجبة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  if p_on is null or not isfinite(p_on) then
    raise exception 'date_required' using hint = 'اختر يوماً من أيّام الوجبة.';
  end if;
  if p_on > v_today then
    raise exception 'date_in_future' using hint = format('يوم %s لم يأتِ بعد؛ يُكتب الغاز لليوم %s أو لما قبله من أيّام الوجبة.', to_char(p_on, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY'));
  end if;
  -- الثلاثة التي تتغيّر والعملية بالطابور: بنداء مباشر ترمي، ومن الطابور تُركن وترجع parked.
  select l.locked_through into v_lock from public.period_locks l where l.org_id = f.org_id;
  -- 0037: وفوج حُذفت قاعته يُركن من الطابور بسببه أوّلاً، وبنداء مباشر يرمي flock_void (flock_day_check).
  v_park := case when f.status = 'void' then 'flock_void' when f.status = 'closed' then 'flock_closed' when not public.in_scope_site(f.site_id) then 'out_of_scope'
    when v_lock is not null and p_on <= v_lock then 'period_locked' end;
  if v_park is not null and v_queued then
    insert into public.flock_day_rejects (org_id, flock_id, hall_id, site_id, division_id, on_date, client_ref, payload, reason, created_by, visit_id)
    values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_on, p_client_ref, jsonb_build_object('gas', p_cylinders), v_park, auth.uid(),
      md5('gas:' || coalesce(auth.uid()::text, '') || ':' || f.id::text || ':' || to_char(p_on, 'YYYY-MM-DD'))::uuid)
    on conflict (org_id, visit_id) where visit_id is not null do update
      set client_ref = excluded.client_ref, payload = excluded.payload, reason = excluded.reason, created_at = now(),
          version = public.flock_day_rejects.version + 1, decision = null, decided_by = null, decided_at = null;
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'parked', 'reason', v_park));
  end if;
  if v_park = 'out_of_scope' then
    raise exception 'out_of_scope' using hint = 'قاعة هذه الوجبة خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  perform private.flock_day_check(f, p_on);
  if p_cylinders < 0 or p_cylinders > 1000 then
    raise exception 'bad_value' using hint = 'عدد قناني الغاز عدد صحيح من صفر إلى 1,000.';
  end if;
  select * into g from public.flock_day_gas x where x.org_id = f.org_id and x.flock_id = f.id and x.on_date = p_on for update;
  if (g.id is null and p_cylinders is null) or (g.id is not null and g.cylinders is not distinct from p_cylinders) then
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'gas', private.flock_gas_json(p_on, g)));
  end if;
  if p_expected_version is distinct from g.version then
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'stale_gas', 'server', private.flock_gas_json(p_on, g)));
  end if;
  if g.id is null then
    insert into public.flock_day_gas (org_id, flock_id, hall_id, site_id, division_id, on_date, cylinders, version)
    values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_on, p_cylinders, 1)
    returning * into g;
  else
    update public.flock_day_gas x set cylinders = p_cylinders, version = x.version + 1, updated_at = now(), updated_by = auth.uid()
    where x.org_id = g.org_id and x.id = g.id
    returning * into g;
  end if;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'gas', private.flock_gas_json(p_on, g)));
end
$$;

-- الأجسام الأخيرة من 0035 (record_flock_weight وedit_flock وdelete_flock)، وflock_void بعد النطاق.
create or replace function public.record_flock_weight(p_flock uuid, p_date date, p_sample_count integer, p_avg_g numeric, p_client_ref uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'record_flock_weight';
  v_cached jsonb;
  f public.flocks;
  v_version int;
begin
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('flock', p_flock, 'date', p_date, 'sample', p_sample_count, 'avg_g', p_avg_g::text));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.require('flock_day.save');
  set local lock_timeout = '5s';
  perform private.period_guard();
  select * into f from public.flocks x where x.org_id = public.auth_org() and x.id = p_flock for update;
  if f.id is null then
    raise exception 'flock_not_found' using hint = 'هذا الفوج غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(f.site_id) then
    raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  if f.status = 'void' then
    raise exception 'flock_void' using hint = 'حُذفت قاعة هذا الفوج، فلا يُعرض ولا يُسجَّل له شيء.';
  end if;
  if f.status = 'closed' then
    raise exception 'flock_closed' using hint = 'الفوج مغلق، فلا يُسجَّل له وزن.';
  end if;
  if f.status <> 'active' then
    raise exception 'flock_not_placed' using hint = 'الفوج لم يُسكَّن بعد، فلا يُسجَّل له وزن.';
  end if;
  -- 0035: قاعدة اليوم الواحدة لكتابات القاعة (كلّ أيّام الوجبة القائمة، وقفل الفترة كما كان) بدل check_doc_date.
  perform private.flock_day_check(f, p_date);
  if p_date < f.placed_on then
    raise exception 'before_placement' using hint = format('التاريخ %s قبل تسكين الفوج في %s.', to_char(p_date, 'DD/MM/YYYY'), to_char(f.placed_on, 'DD/MM/YYYY'));
  end if;
  if p_sample_count is null or p_sample_count < 1 or p_sample_count > 100000 then
    raise exception 'bad_sample' using hint = 'عدد طيور العيّنة عدد صحيح من 1 إلى 100,000.';
  end if;
  -- حدّ فيزيائي أدنى (القاعدة ٢٨): الفرخ بعمر يوم بحدود 40 غراماً، و1.8 (كيلوغرام انكتب بخانة الغرامات) كان يطلّع FCR معقول الشكل وغلطاً.
  if p_avg_g is null or not (abs(p_avg_g) < 'Infinity' and p_avg_g >= 20 and p_avg_g <= 20000 and p_avg_g = round(p_avg_g, 1)) then
    raise exception 'bad_weight' using hint = 'معدّل وزن الطير بالغرام من 20 إلى 20,000، بمرتبة عشرية واحدة على الأكثر؛ اكتبه بالغرام لا بالكيلوغرام (1.8 كغم = 1,800 غم).';
  end if;
  insert into public.flock_weights (org_id, flock_id, hall_id, site_id, division_id, on_date, sample_count, avg_g, last_ref)
  values (f.org_id, f.id, f.hall_id, f.site_id, f.division_id, p_date, p_sample_count, p_avg_g, p_client_ref)
  on conflict (org_id, flock_id, on_date) do update
    set sample_count = excluded.sample_count, avg_g = excluded.avg_g, version = public.flock_weights.version + 1,
        last_ref = excluded.last_ref, updated_at = now()
  returning version into v_version;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('status', 'saved', 'version', v_version));
end
$$;

create or replace function public.edit_flock(p_flock uuid, p_expected_version int, p_placed_on date, p_placed_count integer, p_age_days integer,
  p_breed text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'edit_flock';
  v_cached jsonb;
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_lock date;
  v_breed text := nullif(btrim(p_breed), '');
  f public.flocks;
  v_hall text;
  v_first date;
  v_closed date;
  v_losses bigint;
  v_core boolean;
  v_changed boolean;
  v_result jsonb;
begin
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('flock', p_flock, 'version', p_expected_version, 'placed_on', p_placed_on,
    'count', p_placed_count, 'age', p_age_days, 'breed', p_breed));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.require('flock.manage');
  set local lock_timeout = '5s';
  perform private.period_guard();
  select * into f from public.flocks x where x.org_id = v_org and x.id = p_flock for update;
  if f.id is null then
    raise exception 'flock_not_found' using hint = 'هذا الفوج غير موجود في منشأتك (ربّما حُذف من جهاز آخر). حدّث الشاشة.';
  end if;
  if not public.in_scope_site(f.site_id) then
    raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  select h.name into v_hall from public.halls h where h.org_id = f.org_id and h.id = f.hall_id;
  if f.status = 'void' then
    raise exception 'flock_void' using hint = 'حُذفت قاعة هذا الفوج، فلا يُعرض ولا يُسجَّل له شيء.';
  end if;
  if f.status = 'closed' then
    raise exception 'flock_closed' using hint = format('فوج «%s» مغلق، فلا يُعدَّل تسكينه.', v_hall);
  end if;
  if f.status <> 'active' then
    raise exception 'flock_not_placed' using hint = format('فوج «%s» لم يُسكَّن بعد، فلا يُعدَّل تسكينه.', v_hall);
  end if;
  if p_expected_version is null or f.version <> p_expected_version then
    raise exception 'stale_flock' using hint = format('تغيّر فوج «%s» من جهاز آخر بعد فتح الشاشة. حدّث الشاشة ثمّ عدّله.', v_hall);
  end if;
  if p_placed_count is null or p_placed_count < 1 or p_placed_count > 10000000 then
    raise exception 'bad_count' using hint = 'اكتب عدد الطيور المسكَّنة: عدد صحيح أكبر من صفر، لا يزيد على 10,000,000.';
  end if;
  if coalesce(p_age_days, 0) not between 0 and 1000 then
    raise exception 'bad_age' using hint = 'عمر الطيور عند التسكين بالأيام، من 0 إلى 1,000.';
  end if;
  if v_breed is not null and length(v_breed) > 80 then
    raise exception 'bad_breed' using hint = 'اسم السلالة لا يزيد على 80 حرفاً.';
  end if;
  if p_placed_on is null then
    raise exception 'date_required' using hint = 'اكتب تاريخ التسكين.';
  end if;
  if p_placed_on > v_today then
    raise exception 'date_in_future' using hint = format('تاريخ التسكين %s بعد تاريخ اليوم %s.', to_char(p_placed_on, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY'));
  end if;
  -- التاريخ والعدد والعمر تغيّر أيّام الفوج ومؤشّراته؛ والسلالة اسم وحدها.
  v_core := p_placed_on is distinct from f.placed_on or p_placed_count is distinct from f.placed_count or coalesce(p_age_days, 0) is distinct from f.age_days_at_placement;
  v_changed := v_core or v_breed is distinct from f.breed;
  if v_core then
    select l.locked_through into v_lock from public.period_locks l where l.org_id = f.org_id;
    if v_lock is not null and least(p_placed_on, f.placed_on) <= v_lock then
      raise exception 'period_locked' using hint = format('الحسابات مقفلة حتى %s، وتسكين الفوج %s داخلها، فلا يُعدَّل. إن كان التعديل صحيحاً فاطلب من مالك المنشأة فتح الفترة.',
        to_char(v_lock, 'DD/MM/YYYY'), to_char(least(p_placed_on, f.placed_on), 'DD/MM/YYYY'));
    end if;
  end if;
  select max(x.closed_on) into v_closed from public.flocks x
  where x.org_id = f.org_id and x.hall_id = f.hall_id and x.id <> f.id and x.closed_on is not null;
  if v_closed is not null and p_placed_on <= v_closed then
    raise exception 'overlaps_previous' using hint = format('في «%s» دورة سابقة أُغلقت في %s، فالتسكين بعدها.', v_hall, to_char(v_closed, 'DD/MM/YYYY'));
  end if;
  select least(
      (select min(x.on_date) from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id),
      (select min(x.on_date) from public.flock_weights x where x.org_id = f.org_id and x.flock_id = f.id),
      -- 0035: الصرف على يومه في القاعة (لا بعد تاريخ خروجه)، والغاز المسجَّل.
      (select min(private.issue_day(x)) from public.flock_issues x where x.org_id = f.org_id and x.flock_id = f.id),
      (select min(x.on_date) from public.flock_day_gas x where x.org_id = f.org_id and x.flock_id = f.id and x.cylinders is not null),
      (select min(x.on_date) from public.flock_costs x where x.org_id = f.org_id and x.flock_id = f.id),
      (select min(x.on_date) from public.flock_logs x where x.org_id = f.org_id and x.flock_id = f.id),
      (select min(x.done_on) from public.flock_vaccinations x where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'done'),
      -- 0029: صفوف العدد (المباع بيوم تذكرته وفرق العدّ بيومه، وعكوسها بيوم الإلغاء بعدها) وتذاكر الوزن غير الملغاة (ولو مسوّدة).
      (select min(x.on_date) from public.flock_counts x where x.org_id = f.org_id and x.flock_id = f.id),
      (select min(t.on_date) from public.weigh_ticket_stops s join public.weigh_tickets t on t.org_id = s.org_id and t.id = s.ticket_id
        where s.org_id = f.org_id and s.flock_id = f.id and t.status <> 'void'))
    into v_first;
  if v_first is not null and p_placed_on > v_first then
    raise exception 'records_before_placement' using hint = format('للفوج سجلّ يوم %s (جولة أو صرف أو غاز أو وزن أو دواء أو لقاح أو تذكرة وزن أو بيع أو فرق عدّ)، فلا يصير التسكين بعده. اختر تاريخاً في %s أو قبله.',
      to_char(v_first, 'DD/MM/YYYY'), to_char(v_first, 'DD/MM/YYYY'));
  end if;
  select coalesce(sum(x.dead + x.culled), 0) into v_losses from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id;
  if p_placed_count < v_losses then
    raise exception 'count_below_losses' using hint = format('سُجّل في الفوج %s من النافق والمستبعد، فلا يقلّ عدد الطيور المسكَّنة عنه.',
      to_char(v_losses, 'FM999,999,999,990'));
  end if;
  if v_changed then
    update public.flocks x set placed_on = p_placed_on, opened_on = p_placed_on, placed_count = p_placed_count,
      age_days_at_placement = coalesce(p_age_days, 0), breed = v_breed, version = x.version + 1
    where x.org_id = f.org_id and x.id = f.id
    returning * into f;
    -- 0029: الحيّ بالمباع وفرق العدّ لا يصير سالباً في أيّ يوم بالعدد والتاريخ الجديدين (والرفض لا يُبقي شيئاً).
    perform private.flock_live_check(f);
  end if;
  v_result := jsonb_build_object('flock_id', f.id, 'version', f.version, 'placed_on', f.placed_on, 'placed_count', f.placed_count,
    'age_days_at_placement', f.age_days_at_placement, 'breed', f.breed, 'changed', v_changed);
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;

create or replace function public.delete_flock(p_flock uuid, p_expected_version int, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'delete_flock';
  v_cached jsonb;
  v_org uuid := public.auth_org();
  v_lock date;
  f public.flocks;
  v_hall text;
  v_has text[] := '{}';
  v_result jsonb;
begin
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('flock', p_flock, 'version', p_expected_version));
  if v_cached is not null then
    return v_cached;
  end if;
  perform private.require('flock.manage');
  set local lock_timeout = '5s';
  perform private.period_guard();
  select * into f from public.flocks x where x.org_id = v_org and x.id = p_flock for update;
  if f.id is null then
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('flock_id', p_flock, 'deleted', false));
  end if;
  if not public.in_scope_site(f.site_id) then
    raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  select h.name into v_hall from public.halls h where h.org_id = f.org_id and h.id = f.hall_id;
  if f.status = 'void' then
    raise exception 'flock_void' using hint = 'حُذفت قاعة هذا الفوج، فلا يُعرض ولا يُسجَّل له شيء.';
  end if;
  if f.status = 'closed' then
    raise exception 'flock_closed' using hint = format('فوج «%s» مغلق، فلا يُحذف.', v_hall);
  end if;
  if p_expected_version is null or f.version <> p_expected_version then
    raise exception 'stale_flock' using hint = format('تغيّر فوج «%s» من جهاز آخر بعد فتح الشاشة. حدّث الشاشة ثمّ احذفه.', v_hall);
  end if;
  select l.locked_through into v_lock from public.period_locks l where l.org_id = f.org_id;
  if v_lock is not null and f.placed_on <= v_lock then
    raise exception 'period_locked' using hint = format('الحسابات مقفلة حتى %s، وتسكين الفوج %s داخلها، فلا يُحذف.', to_char(v_lock, 'DD/MM/YYYY'), to_char(f.placed_on, 'DD/MM/YYYY'));
  end if;
  if exists (select 1 from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id)
      or exists (select 1 from public.flock_visits x where x.org_id = f.org_id and x.flock_id = f.id and x.voided_at is null)
      or exists (select 1 from public.flock_day_rejects x where x.org_id = f.org_id and x.flock_id = f.id) then
    v_has := v_has || 'جولات يومية'::text;
  end if;
  if exists (select 1 from public.flock_weights x where x.org_id = f.org_id and x.flock_id = f.id) then
    v_has := v_has || 'أوزان'::text;
  end if;
  -- 0035: الغاز المسجَّل (بعدد) باسمه؛ والصفّ الممسوح (عدد فارغ بنسخة) لا يمنع الحذف.
  if exists (select 1 from public.flock_day_gas x where x.org_id = f.org_id and x.flock_id = f.id and x.cylinders is not null) then
    v_has := v_has || 'الغاز'::text;
  end if;
  if exists (select 1 from public.flock_issues x where x.org_id = f.org_id and x.flock_id = f.id)
      or exists (select 1 from public.flock_costs x where x.org_id = f.org_id and x.flock_id = f.id) then
    v_has := v_has || 'صرف من المخزن'::text;
  end if;
  if exists (select 1 from public.flock_logs x where x.org_id = f.org_id and x.flock_id = f.id) then
    v_has := v_has || 'أدوية'::text;
  end if;
  if exists (select 1 from public.flock_vaccinations x where x.org_id = f.org_id and x.flock_id = f.id) then
    v_has := v_has || 'تأشيرات لقاح'::text;
  end if;
  -- 0029: تذاكر الوزن (ولو ملغاة: وقفاتها تشير إلى الفوج) والبيع وفرق العدّ والإغلاق السابق بأسمائها، لا بجملة المفتاح الأجنبيّ العامّة.
  if exists (select 1 from public.weigh_ticket_stops x where x.org_id = f.org_id and x.flock_id = f.id) then
    v_has := v_has || 'تذاكر وزن'::text;
  end if;
  if exists (select 1 from public.flock_counts x where x.org_id = f.org_id and x.flock_id = f.id and x.kind = 'sold') then
    v_has := v_has || 'بيع'::text;
  end if;
  if exists (select 1 from public.flock_counts x where x.org_id = f.org_id and x.flock_id = f.id and x.kind = 'count_adjust') then
    v_has := v_has || 'فرق عدّ'::text;
  end if;
  if exists (select 1 from public.flock_closes x where x.org_id = f.org_id and x.flock_id = f.id) then
    v_has := v_has || 'إغلاق سابق'::text;
  end if;
  if cardinality(v_has) > 0 then
    raise exception 'flock_has_records' using hint = format('لفوج «%s» سجلّ (%s)، فلا يُحذف. إن كان التاريخ أو العدد غلطاً فاضغط «عدّل الفوج» وصحّحه.',
      v_hall, array_to_string(v_has, '، '));
  end if;
  -- 0032: الزيارات الملغاة وحدها لا تمنع الحذف (الحيّة تمنعه أعلاه مع صفّ يومها)، فتُحذف مع الفوج، وسجلّ التدقيق يحفظها.
  delete from public.flock_visits x where x.org_id = f.org_id and x.flock_id = f.id and x.voided_at is not null;
  -- 0035: وصفوف الغاز الممسوحة كذلك (لا كتابة بعدها: الوجبة نفسها تُحذف، فلا ABA).
  delete from public.flock_day_gas x where x.org_id = f.org_id and x.flock_id = f.id and x.cylinders is null;
  begin
    delete from public.flocks x where x.org_id = f.org_id and x.id = f.id;
  exception when foreign_key_violation then
    raise exception 'flock_has_records' using hint = format('لفوج «%s» سجلّ مرتبط به، فلا يُحذف. إن كان التاريخ أو العدد غلطاً فاضغط «عدّل الفوج» وصحّحه.', v_hall);
  end;
  v_result := jsonb_build_object('flock_id', f.id, 'deleted', true);
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;

-- الأجسام الأخيرة من 0019 (record_flock_issue) و0029 (close_flock وrecord_flock_count_adjust)، وflock_void بعد قفل الفوج (والخاسر أمام الحذف يرى سببه).
create or replace function public.record_flock_issue(p_client_ref uuid, p_issue_id uuid, p_line_id uuid, p_flock uuid, p_item uuid, p_qty numeric,
  p_issued_on date, p_warehouse uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'record_flock_issue';
  v_org uuid := public.auth_org();
  v_cached jsonb;
  v_result jsonb;
  f public.flocks;
  h public.halls;
  i public.items;
  w public.warehouses;
  x public.flock_issues;
  s record;
  dr record;
  v_kind text;
  v_same boolean;
  v_count int;
  v_names text;
  v_expired numeric;
  v_div uuid;
  v_total numeric := 0;
  v_no text;
begin
  set local lock_timeout = '5s';
  perform private.require('issue.post');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('issue', p_issue_id, 'line', p_line_id, 'flock', p_flock, 'item', p_item,
    'qty', p_qty, 'on', p_issued_on, 'warehouse', p_warehouse));
  if v_cached is not null then
    -- صرف حُفظ ثمّ أُلغي: الإعادة لا تقول «حُفظ» بنتيجته القديمة، بل تعارض يسمّي الإلغاء (درس 0017).
    if exists (select 1 from public.flock_issues y where y.org_id = v_org and y.id = p_issue_id and y.status = 'void') then
      raise exception 'id_conflict' using hint = 'سُجّل هذا الصرف من قبل ثمّ أُلغي. افتح صفحة القاعة وسجّل صرفاً جديداً.';
    end if;
    return v_cached;
  end if;
  if p_issue_id is null or p_line_id is null or p_flock is null or p_item is null then
    raise exception 'id_required' using hint = 'تعذّر الإرسال دون معرّفات الصرف والفوج والمادّة. حدّث الشاشة وأعد المحاولة.';
  end if;

  -- الإعادة بالمعرّف (جواب ضاع): نداءان بالمعرّف نفسه يترتّبان هنا، فيرى الثاني صفّ الأوّل بعد ثباته. الصرف المرحَّل نفسه بمحتواه = حُفظ،
  -- فنتيجته؛ وغيره تعارض.
  perform pg_advisory_xact_lock(hashtextextended('flock_issue:' || p_issue_id::text, 0));
  select * into x from public.flock_issues y where y.id = p_issue_id;
  if x.id is not null then
    v_same := x.org_id = v_org and x.status = 'posted' and x.created_by is not distinct from auth.uid() and x.flock_id = p_flock
      and x.issued_on = p_issued_on and (p_warehouse is null or x.warehouse_id = p_warehouse)
      and exists (select 1 from public.flock_issue_lines y where y.org_id = x.org_id and y.issue_id = x.id and y.id = p_line_id
        and y.item_id = p_item and y.qty_base = p_qty);
    if coalesce(v_same, false) then
      v_result := private.flock_issue_result(x.id);
      return private.ref_store(v_fn, p_client_ref, v_result);
    end if;
    raise exception 'id_conflict' using hint = case
      when x.org_id = v_org and x.status = 'void' then 'سُجّل هذا الصرف من قبل ثمّ أُلغي. افتح صفحة القاعة وسجّل صرفاً جديداً.'
      else 'سُجّل بهذا المعرّف صرف غير الذي أرسلته الآن. افتح صفحة القاعة لترى ما سُجّل، ثمّ سجّل من جديد.'
    end;
  end if;
  -- معرّف السطر بقفله بعد قفل معرّف الصرف (ترتيب ثابت، فلا تقافل): صرفان بمعرّف سطر واحد بلحظة واحدة يترتّبان، فيرى الثاني سطر الأوّل
  -- بعد ثباته ويرجع id_conflict بتلميحه بدل تعارض مفتاح خام (مراجعة 0019 الأولى L1).
  perform pg_advisory_xact_lock(hashtextextended('flock_issue_line:' || p_line_id::text, 0));
  if exists (select 1 from public.flock_issue_lines y where y.id = p_line_id) then
    raise exception 'id_conflict' using hint = 'معرّف سطر الصرف مستعمل لصرف آخر. حدّث الشاشة وأعد المحاولة.';
  end if;

  -- الفوج: موجود، وحقله بنطاق الكاتب (قبل أن يُسمّى شيء منه، E49)، وقائم.
  select * into f from public.flocks y where y.org_id = v_org and y.id = p_flock;
  if f.id is null then
    raise exception 'flock_not_found' using hint = 'هذا الفوج غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(f.site_id) then
    raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك، فلا تصرف لها. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  select * into h from public.halls y where y.org_id = f.org_id and y.id = f.hall_id;
  if f.status = 'void' then
    raise exception 'flock_void' using hint = 'حُذفت قاعة هذا الفوج، فلا يُعرض ولا يُسجَّل له شيء.';
  end if;
  if f.status = 'closed' then
    raise exception 'flock_closed' using hint = format('فوج «%s» مغلق، فلا يُصرف له شيء.', h.name);
  end if;
  if f.status <> 'active' then
    raise exception 'flock_not_placed' using hint = format('فوج «%s» لم يُسكَّن بعد، فلا يُصرف له شيء.', h.name);
  end if;

  -- المادّة: موجودة وفعّالة وتُصرف للفوج، والكمية بوحدة أساسها (القطعة عدد صحيح).
  select * into i from public.items y where y.org_id = v_org and y.id = p_item;
  if i.id is null then
    raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة واختر من جديد.';
  end if;
  if i.archived_at is not null then
    raise exception 'item_archived' using hint = format('المادّة «%s» مؤرشفة، فلا تُصرف. أعِدها من الأرشيف أوّلاً.', i.name);
  end if;
  v_kind := private.flock_cost_kind(i.kind);
  if v_kind is null then
    raise exception 'not_issuable' using hint = format('«%s» لا تُصرف للفوج: الأفراخ تدخله بالتسكين، والبيض يخرج منه ولا يُصرف له.', i.name);
  end if;
  if p_qty is null or not (abs(p_qty) < 'Infinity') or p_qty <= 0 or p_qty <> round(p_qty, 3) then
    raise exception 'qty_not_positive' using hint = format('اكتب كمية «%s» أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.', i.name);
  end if;
  if i.base_unit = 'pc' and p_qty <> round(p_qty, 0) then
    raise exception 'pieces_not_whole' using hint = format('«%s» تُعدّ بالقطعة؛ اكتب عدداً صحيحاً من القطع.', i.name);
  end if;
  if p_issued_on is null then
    raise exception 'date_required' using hint = 'اكتب تاريخ الصرف.';
  end if;
  -- قاعدة التاريخ (0018) قبل اختيار المخزن، فيُقال الخطأ الصحيح أوّلاً؛ والفحص الملزم تحت قفل الفترة (check_post_date أدناه).
  perform private.check_doc_date(p_issued_on);
  if p_issued_on < f.placed_on then
    raise exception 'before_placement' using hint = format('التاريخ %s قبل تسكين الفوج في %s.', to_char(p_issued_on, 'DD/MM/YYYY'), to_char(f.placed_on, 'DD/MM/YYYY'));
  end if;

  -- المخزن: المختار يُفحص (النطاق قبل أن يُسمّى)، وبلا اختيار فالمخزن الوحيد بنطاق الكاتب الذي فيه من المادّة متاح بتاريخ الصرف.
  if p_warehouse is not null then
    select * into w from public.warehouses y where y.org_id = v_org and y.id = p_warehouse;
    if w.id is null then
      raise exception 'warehouse_not_found' using hint = 'هذا المخزن غير موجود في منشأتك. حدّث الشاشة واختر من جديد.';
    end if;
    if not public.in_scope_wh(w.id) then
      raise exception 'out_of_scope' using hint = format('المخزن «%s» خارج نطاقك، فلا تصرف منه.', w.name);
    end if;
    if w.archived_at is not null then
      raise exception 'warehouse_archived' using hint = format('المخزن «%s» مؤرشف، فلا يُصرف منه. اختر مخزناً آخر.', w.name);
    end if;
    if not private.item_admissible(w.kind, i.kind) then
      raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s»، فلا تُصرف منه. اختر مخزناً فيه هذه المادّة.', i.name, w.name);
    end if;
  else
    select (count(*) filter (where a.available > 0))::int,
      string_agg(format('«%s» (%s)', y.name, private.qty_text(a.available, i.base_unit)), '، ' order by y.name collate "C", y.id) filter (where a.available > 0),
      coalesce(sum(a.expired), 0)
    into v_count, v_names, v_expired
    from public.warehouses y
    cross join lateral private.stock_at(i.id, y.id, p_issued_on) as a
    where y.org_id = v_org and y.archived_at is null and private.item_admissible(y.kind, i.kind) and public.in_scope_wh(y.id);
    if v_count = 0 then
      raise exception 'insufficient_stock' using hint = format('لا يوجد «%s» متاح في مخازن نطاقك بتاريخ %s: طلبت %s، وعندك %s.%s',
        i.name, to_char(p_issued_on, 'DD/MM/YYYY'), private.qty_text(p_qty, i.base_unit), private.qty_text(0, i.base_unit),
        case when v_expired > 0 then format(' وفي مخازنك %s منتهية الصلاحية لا تُصرف إلا بإتلاف أو مرتجع.', private.qty_text(v_expired, i.base_unit)) else '' end);
    end if;
    if v_count > 1 then
      raise exception 'store_required' using hint = format('«%s» موجودة في أكثر من مخزن في نطاقك: %s. اختر المخزن الذي تصرف منه.', i.name, v_names);
    end if;
    select y.* into w from public.warehouses y
    cross join lateral private.stock_at(i.id, y.id, p_issued_on) as a
    where y.org_id = v_org and y.archived_at is null and private.item_admissible(y.kind, i.kind) and public.in_scope_wh(y.id) and a.available > 0;
  end if;

  -- الأقفال بترتيبها، وكلّ فحص بعد قفله: قفل الفترة وصفّا الوحدتين (التاريخ: لا مستقبل ولا أقدم من 7 أيام ولا فترة مقفولة، 0018)، ثمّ
  -- صفّ الفوج للمشاركة (إغلاقه بلحظة الصرف ينتظر أو يُرى)، ثمّ المخزن والمادّة (المؤرشف يُرفض تحت قفله)، ثمّ الرصيد.
  for v_div in select d from unnest(array[w.division_id, f.division_id]) as d group by d order by d loop
    perform private.check_post_date(p_issued_on, v_div);
  end loop;
  select * into f from public.flocks y where y.org_id = v_org and y.id = p_flock for share;
  if f.status = 'void' then
    raise exception 'flock_void' using hint = 'حُذفت قاعة هذا الفوج، فلا يُعرض ولا يُسجَّل له شيء.';
  end if;
  if f.status = 'closed' then
    raise exception 'flock_closed' using hint = format('فوج «%s» مغلق، فلا يُصرف له شيء.', h.name);
  end if;
  if f.status <> 'active' then
    raise exception 'flock_not_placed' using hint = format('فوج «%s» لم يُسكَّن بعد، فلا يُصرف له شيء.', h.name);
  end if;
  perform private.lock_masters(array[w.id], array[i.id], true);
  select * into i from public.items y where y.org_id = v_org and y.id = p_item;
  perform private.lock_balances(array[i.id], array[w.id]);
  select * into s from private.stock_at(i.id, w.id, p_issued_on);
  if s.available < p_qty then
    raise exception 'insufficient_stock' using hint = format('لا يكفي رصيد «%s» في «%s»: طلبت %s، وعندك %s بتاريخ %s.%s%s',
      i.name, w.name, private.qty_text(p_qty, i.base_unit), private.qty_text(s.available, i.base_unit), to_char(p_issued_on, 'DD/MM/YYYY'),
      case when s.expired > 0 then format(' وفي المخزن %s منتهية الصلاحية لا تُصرف إلا بإتلاف أو مرتجع.', private.qty_text(s.expired, i.base_unit)) else '' end,
      case when s.later > 0 then format(' و%s استُلمت بعد هذا التاريخ.', private.qty_text(s.later, i.base_unit)) else '' end);
  end if;

  -- السحب بترتيبه (القواعد ١٢–١٤) وحركاته، ثمّ العدّاد آخر شيء، ثمّ الرأس والسطر وسطر الكلفة بقيمة السحب بالضبط.
  for dr in select * from private.draw(i.id, w.id, p_qty, p_issued_on, null, false) loop
    perform private.apply_move(dr.lot_id, 'flock_issue', p_issue_id, p_line_id, -dr.qty, -dr.value, p_issued_on, null, coalesce(i.tracks_expiry, false));
    v_total := v_total + dr.value;
  end loop;
  v_no := private.next_doc_no('FI', p_issued_on);
  insert into public.flock_issues (id, org_id, doc_no, flock_id, hall_id, site_id, division_id, warehouse_id, issued_on, status, client_ref, posted_at, posted_by)
  values (p_issue_id, v_org, v_no, f.id, f.hall_id, f.site_id, f.division_id, w.id, p_issued_on, 'posted', p_client_ref, now(), auth.uid());
  insert into public.flock_issue_lines (id, org_id, issue_id, warehouse_id, site_id, line_no, item_id, qty_base, base_unit, density_kg_per_l,
    piece_mass_kg, cost_kind)
  values (p_line_id, v_org, p_issue_id, w.id, f.site_id, 1, i.id, p_qty, i.base_unit, case when i.base_unit = 'L' then i.density_kg_per_l end,
    case when i.base_unit = 'pc' then i.piece_mass_kg end, v_kind);
  insert into public.flock_costs (org_id, flock_id, site_id, kind, amount, doc_kind, doc_id, doc_line_id, on_date)
  values (v_org, f.id, f.site_id, v_kind, v_total, 'flock_issue', p_issue_id, p_line_id, p_issued_on);
  perform private.mark_division_posted(w.division_id);
  perform private.mark_division_posted(f.division_id);
  v_result := private.flock_issue_result(p_issue_id);
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;

create or replace function public.close_flock(p_client_ref uuid, p_close_id uuid, p_flock uuid, p_on date, p_expected_live int, p_expected_sold int,
  p_expected_pools jsonb, p_count_reason text, p_lines jsonb, p_note text, p_expected_plan text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'close_flock';
  v_org uuid := public.auth_org();
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_qty constant text := '^[0-9]{1,12}([.][0-9]{1,3})?$';
  v_cached jsonb;
  v_reason text := nullif(btrim(coalesce(p_count_reason, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_lines jsonb := coalesce(p_lines, '[]'::jsonb);
  v_pools jsonb := coalesce(p_expected_pools, '[]'::jsonb);
  a jsonb;
  v_n int;
  v_items uuid[] := '{}';
  v_rstores uuid[] := '{}';
  v_ritems uuid[] := '{}';
  v_div uuid;
  x public.flock_closes;
  f public.flocks;
  h public.halls;
  i public.items;
  w public.warehouses;
  p record;
  q record;
  v_live bigint;
  v_sold bigint;
  v_sold_kg numeric;
  v_act record;
  v_pending text;
  v_value numeric;
  v_line uuid;
  v_returned numeric := 0;
  v_carried numeric := 0;
  v_result jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('flock.manage');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('close', p_close_id, 'flock', p_flock, 'on', p_on, 'live', p_expected_live,
    'sold', p_expected_sold, 'pools', p_expected_pools, 'reason', p_count_reason, 'lines', p_lines, 'note', p_note, 'plan', p_expected_plan));
  if v_cached is not null then
    if exists (select 1 from public.flock_closes y where y.org_id = v_org and y.id = p_close_id and y.status = 'reopened') then
      raise exception 'id_conflict' using hint = 'أُغلقت هذه الدورة بهذا الطلب ثمّ أُعيد فتحها. أغلقها من جديد من صفحة الفوج.';
    end if;
    return v_cached;
  end if;
  if p_close_id is null or p_flock is null then
    raise exception 'id_required' using hint = 'تعذّر الإرسال دون معرّفي الإغلاق والفوج. حدّث الشاشة وأعد المحاولة.';
  end if;

  -- الإعادة بالمعرّف (جواب ضاع): الإغلاق القائم نفسه للفوج نفسه ويومه وسبب فرق عدّه (إن كُتب فرق) وملاحظته وسطوره ومن الكاتب نفسه = نتيجته؛
  -- وغيره تعارض (سبب آخر لا يُقال عنه «حُفظ» والمحفوظ غيره).
  perform pg_advisory_xact_lock(hashtextextended('flock_close:' || p_close_id::text, 0));
  select * into x from public.flock_closes y where y.id = p_close_id;
  if x.id is not null then
    if x.org_id = v_org and x.status = 'closed' and x.flock_id = p_flock and x.closed_on = p_on and x.closed_by is not distinct from auth.uid()
        and x.note is not distinct from v_note and x.count_reason is not distinct from (case when x.count_diff <> 0 then v_reason end)
        and (select coalesce(jsonb_agg(jsonb_build_object('item_id', l.item_id, 'qty', l.qty_base, 'action', l.action, 'warehouse_id', l.warehouse_id)
              order by l.line_no), '[]'::jsonb) from public.flock_close_lines l where l.org_id = x.org_id and l.close_id = x.id)
          = (select coalesce(jsonb_agg(jsonb_build_object('item_id', (e.x ->> 'item_id')::uuid, 'qty', round((e.x ->> 'qty')::numeric, 3),
              'action', e.x ->> 'action', 'warehouse_id', case when e.x ->> 'action' = 'return' then (e.x ->> 'warehouse_id')::uuid end) order by e.n), '[]'::jsonb)
             from jsonb_array_elements(case when jsonb_typeof(v_lines) = 'array' then v_lines else '[]'::jsonb end) with ordinality as e(x, n)) then
      v_result := private.flock_close_result(x.id);
      return private.ref_store(v_fn, p_client_ref, v_result);
    end if;
    raise exception 'id_conflict' using hint = case
      when x.org_id = v_org and x.status = 'reopened' then 'أُغلقت هذه الدورة بهذا الطلب ثمّ أُعيد فتحها. أغلقها من جديد من صفحة الفوج.'
      else 'سُجّل بهذا المعرّف إغلاق غير الذي أرسلته الآن. حدّث الشاشة لترى ما سُجّل.'
    end;
  end if;

  -- ١) المدخلات: اليوم، والسبب والملاحظة، وشكل السطور (مادّة ومصير وكمية نصّاً بثلاث مراتب، والمخزن لسطر الإرجاع وحده)، وما رأته الشاشة.
  if p_on is null then
    raise exception 'date_required' using hint = 'اكتب يوم الإغلاق.';
  end if;
  perform private.check_doc_date(p_on);
  if v_reason is not null and length(v_reason) > 500 then
    raise exception 'bad_reason' using hint = format('السبب %s حرفاً، والحدّ 500 حرف. اختصره.', length(v_reason));
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'bad_note' using hint = format('الملاحظة %s حرفاً، والحدّ 500 حرف. اختصرها.', length(v_note));
  end if;
  if jsonb_typeof(v_lines) <> 'array' or jsonb_typeof(v_pools) <> 'array' then
    raise exception 'bad_lines' using hint = 'سطور الباقي غير صالحة. حدّث الشاشة وأعد المحاولة.';
  end if;
  if jsonb_array_length(v_lines) > 100 then
    raise exception 'too_many_lines' using hint = 'الباقي حتى 100 مادّة في المرّة.';
  end if;
  for a in select e.x from jsonb_array_elements(v_pools) as e(x) loop
    if jsonb_typeof(a) <> 'object' or coalesce(a ->> 'item_id', '') !~ v_uuid or jsonb_typeof(a -> 'qty') is distinct from 'string' or (a ->> 'qty') !~ v_qty then
      raise exception 'bad_lines' using hint = 'سطور الباقي غير صالحة. حدّث الشاشة وأعد المحاولة.';
    end if;
  end loop;
  for a in select e.x from jsonb_array_elements(v_lines) as e(x) loop
    if jsonb_typeof(a) <> 'object' or coalesce(a ->> 'item_id', '') !~ v_uuid or jsonb_typeof(a -> 'qty') is distinct from 'string' or (a ->> 'qty') !~ v_qty
        or not (coalesce(jsonb_typeof(a -> 'warehouse_id'), 'null') = 'null' or (a ->> 'warehouse_id') ~ v_uuid) then
      raise exception 'bad_lines' using hint = 'سطور الباقي غير صالحة. حدّث الشاشة وأعد المحاولة.';
    end if;
    select * into i from public.items y where y.org_id = v_org and y.id = (a ->> 'item_id')::uuid;
    if i.id is null then
      raise exception 'item_not_found' using hint = 'هذه المادّة غير موجودة في منشأتك. حدّث الشاشة.';
    end if;
    if coalesce(a ->> 'action', '') not in ('return', 'consumed', 'carry') then
      raise exception 'bad_action' using hint = 'اختر لكلّ مادّة باقية: يرجع إلى مخزن، أو يُحسب مستهلَكاً، أو ينتقل للدورة التالية.';
    end if;
    if (a ->> 'qty')::numeric <= 0 then
      raise exception 'qty_not_positive' using hint = format('اكتب كمية «%s» الباقية أكبر من صفر، بثلاث مراتب عشرية كحدّ أقصى.', i.name);
    end if;
    if i.base_unit = 'pc' and (a ->> 'qty')::numeric <> trunc((a ->> 'qty')::numeric) then
      raise exception 'pieces_not_whole' using hint = format('«%s» تُعدّ بالقطعة؛ اكتب عدداً صحيحاً من القطع.', i.name);
    end if;
    if i.id = any (v_items) then
      raise exception 'duplicate_line' using hint = format('«%s» مكرّرة. لكلّ مادّة مصير واحد.', i.name);
    end if;
    v_items := v_items || i.id;
    if a ->> 'action' = 'return' then
      if coalesce(jsonb_typeof(a -> 'warehouse_id'), 'null') = 'null' then
        raise exception 'store_required' using hint = format('اختر المخزن الذي يرجع إليه «%s».', i.name);
      end if;
      w := private.stock_wh((a ->> 'warehouse_id')::uuid, true);
      if not private.item_admissible(w.kind, i.kind) then
        raise exception 'item_kind_mismatch' using hint = format('«%s» لا تُخزَّن في «%s». اختر مخزناً جاء منه.', i.name, w.name);
      end if;
      v_rstores := v_rstores || w.id;
      v_ritems := v_ritems || i.id;
    elsif coalesce(jsonb_typeof(a -> 'warehouse_id'), 'null') <> 'null' then
      raise exception 'store_not_allowed' using hint = 'المخزن لسطر الإرجاع وحده.';
    end if;
  end loop;

  -- ٢) الفوج: موجود وبنطاق الكاتب وقائم، ولحم (البيّاض لاحقاً)، واليوم لا يسبق تسكينه.
  f := private.flock_for(p_flock, true);
  select * into h from public.halls y where y.org_id = v_org and y.id = f.hall_id;
  if f.kind <> 'broiler' then
    raise exception 'close_layer_later' using hint = 'إغلاق دورة البيّاض يأتي مع بيع الدجاج المستبعد.';
  end if;
  if p_on < f.placed_on then
    raise exception 'before_placement' using hint = format('التاريخ %s قبل تسكين «%s» في %s.', to_char(p_on, 'DD/MM/YYYY'), h.name, to_char(f.placed_on, 'DD/MM/YYYY'));
  end if;

  -- ٣) الأقفال بترتيبها، وكلّ فحص بعد قفله.
  for v_div in select d from unnest(array[f.division_id] || array(select w2.division_id from public.warehouses w2 where w2.org_id = v_org and w2.id = any (v_rstores)))
      as d group by d order by d loop
    perform private.check_post_date(p_on, v_div);
  end loop;
  perform 1 from public.halls y where y.org_id = v_org and y.id = f.hall_id for share;
  select * into f from public.flocks y where y.org_id = v_org and y.id = p_flock for update;
  if f.status = 'void' then
    raise exception 'flock_void' using hint = 'حُذفت قاعة هذا الفوج، فلا يُعرض ولا يُسجَّل له شيء.';
  end if;
  if f.status = 'closed' then
    raise exception 'flock_closed' using hint = format('الدورة مغلقة من قبل يوم %s.', to_char(f.closed_on, 'DD/MM/YYYY'));
  end if;
  if f.status <> 'active' then
    raise exception 'flock_not_placed' using hint = format('فوج «%s» لم يُسكَّن بعد، فلا تُغلق دورته.', h.name);
  end if;
  perform private.lock_masters(v_rstores, v_ritems, true);
  perform private.lock_balances(v_ritems, v_rstores);

  -- ٤) تحت قفل الفوج: لا نشاط بعد يوم الإغلاق، ولا تذكرة بلا فاتورة، والحيّ والمباع وما نزل كما رأته الشاشة، وكلّ سطر من ممّا نزل.
  select * into v_act from private.flock_activity_after(f, p_on);
  if v_act.what is not null then
    raise exception 'activity_after_close' using hint = format('سُجّل على الفوج %s يوم %s، بعد يوم الإغلاق %s. اختر يوم الإغلاق في آخر يوم سُجّل فيه شيء أو بعده.',
      v_act.what, to_char(v_act.on_date, 'DD/MM/YYYY'), to_char(p_on, 'DD/MM/YYYY'));
  end if;
  select string_agg(coalesce(t.ticket_no, format('مسوّدة %s', to_char(t.on_date, 'DD/MM/YYYY'))), '، ' order by t.on_date, t.ticket_no collate "C", t.id)
  into v_pending
  from public.weigh_tickets t
  where t.org_id = v_org and t.status <> 'void'
    and exists (select 1 from public.weigh_ticket_stops s where s.org_id = t.org_id and s.ticket_id = t.id and s.flock_id = f.id)
    and not exists (select 1 from public.bird_sales b where b.org_id = t.org_id and b.ticket_id = t.id and b.status = 'posted');
  if v_pending is not null then
    raise exception 'tickets_pending' using hint = format('تذاكر وزن بلا فاتورة لهذه القاعة: %s. تُصدر فواتيرها أو تُلغى قبل إغلاق الدورة.', v_pending);
  end if;
  v_live := private.flock_live(f);
  if p_expected_live is distinct from v_live then
    raise exception 'live_changed' using hint = format('تغيّر عدد الطيور الحيّة منذ فتحت الشاشة: كان %s وصار %s. راجع الأرقام وأعد المحاولة.',
      coalesce(to_char(p_expected_live, 'FM999,999,999,990'), '—'), to_char(v_live, 'FM999,999,999,990'));
  end if;
  select coalesce(sum(d.sold), 0), coalesce(sum(d.sold_kg), 0) into v_sold, v_sold_kg from private.flock_count_days(f.id) as d;
  if p_expected_sold is distinct from v_sold then
    raise exception 'sales_changed' using hint = format('تغيّر المباع منذ فتحت الشاشة: كان %s طيراً وصار %s. راجع الفواتير وأعد الإغلاق.',
      coalesce(to_char(p_expected_sold, 'FM999,999,999,990'), '—'), to_char(v_sold, 'FM999,999,999,990'));
  end if;
  if v_live > 0 and v_reason is null then
    raise exception 'count_reason_required' using hint = format('في القاعة بحسب النظام %s طيراً لم تُبَع ولم تُسجَّل نافقة. اكتب سبب «فرق العدّ» ليُكتب مع الإغلاق.',
      to_char(v_live, 'FM999,999,999,990'));
  end if;
  -- ما نزل لكلّ مادّة كما رأته الشاشة: لا مادّة ناقصة ولا زائدة ولا كمية غيرها.
  select coalesce(n.item_id, o.item_id) as item_id, o.qty as was, n.qty as cur into q
  from private.flock_item_pool(f.id) as n
  full join (select (e.x ->> 'item_id')::uuid as item_id, round((e.x ->> 'qty')::numeric, 3) as qty from jsonb_array_elements(v_pools) as e(x)) as o
    on o.item_id = n.item_id
  where o.item_id is null or n.item_id is null or o.qty <> n.qty
  order by 1 limit 1;
  if q.item_id is not null then
    select * into i from public.items y where y.org_id = v_org and y.id = q.item_id;
    raise exception 'pool_changed' using hint = format('تغيّر ما نزل للقاعة منذ فتحت الشاشة («%s»: كان %s وصار %s). حدّث الشاشة وراجع الباقي.', coalesce(i.name, ''),
      case when q.was is null then '—' else private.qty_text(q.was, i.base_unit) end, case when q.cur is null then '—' else private.qty_text(q.cur, i.base_unit) end);
  end if;
  -- مراجعة 0028 M4: والقيمة كما رآها النموذج (البصمة): صرف أُلغي وأُعيد بكميته من مخزن آخر يغيّر قيمة الباقي والكمية كما هي. بلا بصمة لا إغلاق.
  if p_expected_plan is null or p_expected_plan is distinct from private.flock_pool_plan(f.id) then
    raise exception 'pool_changed' using hint = 'تغيّر ما نزل للقاعة أو قيمته منذ فتحت الشاشة (صرف أو إلغاء أو إرجاع). حدّث الشاشة وراجع الباقي.';
  end if;
  for a in select e.x from jsonb_array_elements(v_lines) as e(x) loop
    select * into i from public.items y where y.org_id = v_org and y.id = (a ->> 'item_id')::uuid;
    select * into p from private.flock_item_pool(f.id) as z where z.item_id = i.id;
    if p.item_id is null then
      raise exception 'not_in_pool' using hint = format('لم يُصرف «%s» لهذه القاعة في هذه الدورة.', i.name);
    end if;
    if p.units_count > 1 or p.base_unit <> i.base_unit then
      raise exception 'pool_unit_mixed' using hint = format('وحدة «%s» تغيّرت بين ما نزل للقاعة، فلا يُحسب باقيها. راجع المادّة.', i.name);
    end if;
    if (a ->> 'qty')::numeric > p.qty then
      raise exception 'over_pool' using hint = format('الباقي المكتوب من «%s» (%s) أكثر ممّا نزل للقاعة (%s).', i.name,
        private.qty_text((a ->> 'qty')::numeric, i.base_unit), private.qty_text(p.qty, i.base_unit));
    end if;
    if a ->> 'action' = 'return' and not exists (select 1 from private.flock_item_lots(f.id, i.id) as z where z.warehouse_id = (a ->> 'warehouse_id')::uuid) then
      select * into w from public.warehouses y where y.org_id = v_org and y.id = (a ->> 'warehouse_id')::uuid;
      raise exception 'not_from_store' using hint = format('«%s» لم يأتِ إلى هذه القاعة من «%s». اختر مخزناً جاء منه: %s.', i.name, w.name,
        (select string_agg(format('«%s»', y.name), '، ' order by y.name collate "C", y.id) from public.warehouses y
          where y.org_id = v_org and y.id in (select z.warehouse_id from private.flock_item_lots(f.id, i.id) as z)));
    end if;
  end loop;

  -- ٥) الكتابة: الفوج مغلق، ثمّ الإغلاق، وفرق العدّ إن بقي حيّ، والسطور بلقطاتها (D10)، والإرجاع والنقل بقيمتهما (القاعدة ١٦)، ثمّ لقطة المال.
  update public.flocks set status = 'closed', closed_on = p_on, close_note = v_note, version = version + 1 where org_id = v_org and id = f.id;
  insert into public.flock_closes (id, org_id, flock_id, hall_id, site_id, division_id, closed_on, live_before, count_diff, count_reason, sold_birds,
    sold_net_kg, note, status, client_ref, closed_at, closed_by)
  values (p_close_id, v_org, f.id, f.hall_id, f.site_id, f.division_id, p_on, v_live, -v_live, case when v_live > 0 then v_reason end, v_sold,
    v_sold_kg, v_note, 'closed', p_client_ref, now(), auth.uid());
  if v_live > 0 then
    insert into public.flock_counts (org_id, flock_id, hall_id, site_id, division_id, on_date, kind, birds, doc_kind, doc_id, reason)
    values (v_org, f.id, f.hall_id, f.site_id, f.division_id, p_on, 'count_adjust', -v_live, 'flock_close', p_close_id, v_reason);
  end if;
  for a, v_n in select e.x, e.n::int from jsonb_array_elements(v_lines) with ordinality as e(x, n) loop
    select * into i from public.items y where y.org_id = v_org and y.id = (a ->> 'item_id')::uuid;
    select * into p from private.flock_item_pool(f.id) as z where z.item_id = i.id;
    v_line := private.derived_ref(p_close_id, v_n);
    insert into public.flock_close_lines (id, org_id, close_id, flock_id, hall_id, site_id, division_id, line_no, item_id, action, qty_base, base_unit,
      density_kg_per_l, piece_mass_kg, cost_kind, warehouse_id, carry_status)
    values (v_line, v_org, p_close_id, f.id, f.hall_id, f.site_id, f.division_id, v_n, i.id, a ->> 'action', (a ->> 'qty')::numeric, p.base_unit,
      case when p.base_unit = 'L' then p.density end, case when p.base_unit = 'pc' then p.piece_mass end, private.flock_cost_kind(i.kind),
      case when a ->> 'action' = 'return' then (a ->> 'warehouse_id')::uuid end, case when a ->> 'action' = 'carry' then 'pending' end);
    if a ->> 'action' in ('return', 'carry') then
      v_value := case when (a ->> 'qty')::numeric = p.qty then p.value else private._mul_div_round2((a ->> 'qty')::numeric, p.value, p.qty) end;
      if a ->> 'action' = 'return' then
        perform private.flock_return_post(private.derived_ref(p_close_id, 100 + v_n), f, (a ->> 'warehouse_id')::uuid, i.id, (a ->> 'qty')::numeric, v_value,
          p_on, 'close', p_close_id, v_line, p.base_unit, case when p.base_unit = 'L' then p.density end, case when p.base_unit = 'pc' then p.piece_mass end,
          private.flock_cost_kind(i.kind), p_client_ref);
        v_returned := v_returned + v_value;
      else
        insert into public.flock_costs (org_id, flock_id, site_id, kind, amount, doc_kind, doc_id, doc_line_id, on_date)
        values (v_org, f.id, f.site_id, private.flock_cost_kind(i.kind), -v_value, 'flock_carry', p_close_id, v_line, p_on);
        v_carried := v_carried + v_value;
      end if;
    end if;
  end loop;
  insert into public.flock_close_values (org_id, close_id, flock_id, site_id, cost_total, returned_value, carried_value, revenue)
  values (v_org, p_close_id, f.id, f.site_id,
    (select coalesce(sum(c.amount), 0) from public.flock_costs c where c.org_id = v_org and c.flock_id = f.id), v_returned, v_carried,
    (select coalesce(sum(s.revenue), 0) from public.bird_sale_sources s join public.bird_sales b on b.org_id = s.org_id and b.id = s.sale_id
      where s.org_id = v_org and s.flock_id = f.id and b.status = 'posted'));
  for v_div in select d from unnest(array[f.division_id] || array(select w2.division_id from public.warehouses w2 where w2.org_id = v_org and w2.id = any (v_rstores)))
      as d group by d order by d loop
    perform private.mark_division_posted(v_div);
  end loop;
  perform private.flock_live_check(f);
  v_result := private.flock_close_result(p_close_id);
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;

create or replace function public.record_flock_count_adjust(p_client_ref uuid, p_id uuid, p_flock uuid, p_on date, p_birds int, p_reason text,
  p_expected_live int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'record_flock_count_adjust';
  v_org uuid := public.auth_org();
  v_cached jsonb;
  v_reason text;
  x public.flock_counts;
  f public.flocks;
  h public.halls;
  v_live bigint;
  v_result jsonb;
begin
  set local lock_timeout = '5s';
  perform private.require('flock.manage');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_id, 'flock', p_flock, 'on', p_on, 'birds', p_birds, 'reason', p_reason,
    'live', p_expected_live));
  if v_cached is not null then
    return v_cached;
  end if;
  if p_id is null or p_flock is null then
    raise exception 'id_required' using hint = 'تعذّر الإرسال دون معرّف فرق العدّ والفوج. حدّث الشاشة وأعد المحاولة.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('flock_count:' || p_id::text, 0));
  select * into x from public.flock_counts y where y.id = p_id;
  if x.id is not null then
    if x.org_id = v_org and x.kind = 'count_adjust' and x.doc_kind = 'count_adjust' and x.flock_id = p_flock and x.on_date = p_on and x.birds = p_birds
        and x.reason is not distinct from btrim(coalesce(p_reason, '')) and x.created_by is not distinct from auth.uid() then
      select * into f from public.flocks y where y.org_id = v_org and y.id = x.flock_id;
      return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', x.id, 'flock_id', x.flock_id, 'on_date', x.on_date, 'birds', x.birds,
        'live_after', private.flock_live(f)));
    end if;
    raise exception 'id_conflict' using hint = 'سُجّل بهذا المعرّف غير الذي أرسلته الآن. حدّث الشاشة لترى ما سُجّل، ثمّ سجّل من جديد.';
  end if;
  if p_birds is null or p_birds = 0 or p_birds not between -10000000 and 10000000 then
    raise exception 'bad_birds' using hint = 'فرق العدّ عدد صحيح غير الصفر، لا يزيد مقداره على 10,000,000.';
  end if;
  v_reason := private.check_reason(p_reason);
  f := private.flock_for(p_flock, true);
  select * into h from public.halls y where y.org_id = v_org and y.id = f.hall_id;
  if p_on is null then
    raise exception 'date_required' using hint = 'اكتب التاريخ.';
  end if;
  perform private.period_guard();
  perform private.check_doc_date(p_on);
  if p_on < f.placed_on then
    raise exception 'before_placement' using hint = format('التاريخ %s قبل تسكين «%s» في %s.', to_char(p_on, 'DD/MM/YYYY'), h.name, to_char(f.placed_on, 'DD/MM/YYYY'));
  end if;
  select * into f from public.flocks y where y.org_id = v_org and y.id = p_flock for update;
  if f.status = 'void' then
    raise exception 'flock_void' using hint = 'حُذفت قاعة هذا الفوج، فلا يُعرض ولا يُسجَّل له شيء.';
  end if;
  if f.status <> 'active' then
    raise exception 'flock_closed' using hint = format('فوج «%s» مغلق، فلا يُسجَّل له شيء.', h.name);
  end if;
  v_live := private.flock_live(f);
  if p_expected_live is distinct from v_live then
    raise exception 'live_changed' using hint = format('تغيّر عدد الطيور الحيّة منذ فتحت الشاشة: كان %s وصار %s. راجع الأرقام وأعد المحاولة.',
      coalesce(to_char(p_expected_live, 'FM999,999,999,990'), '—'), to_char(v_live, 'FM999,999,999,990'));
  end if;
  insert into public.flock_counts (id, org_id, flock_id, hall_id, site_id, division_id, on_date, kind, birds, doc_kind, doc_id, reason)
  values (p_id, v_org, f.id, f.hall_id, f.site_id, f.division_id, p_on, 'count_adjust', p_birds, 'count_adjust', p_id, v_reason);
  perform private.flock_live_check(f);
  v_result := jsonb_build_object('id', p_id, 'flock_id', f.id, 'on_date', p_on, 'birds', p_birds, 'live_after', private.flock_live(f));
  return private.ref_store(v_fn, p_client_ref, v_result);
end
$$;

-- ─── د. القرّاء: الملغى لا يُعرض بمعرّفه، ولا يدخل قائمة ولا مجموعاً ───────────────────────────────────────────────────────────
-- الأجسام الأخيرة من 0029 (flock_detail وflock_feed) و0019 (flock_issue_options) و0032 (round_visits)، وflock_void بعد النطاق.
create or replace function public.flock_detail(p_flock uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  f public.flocks;
  h public.halls;
  s public.sites;
begin
  perform private.require('read');
  select * into f from public.flocks x where x.org_id = public.auth_org() and x.id = p_flock;
  if f.id is null then
    raise exception 'flock_not_found' using hint = 'هذا الفوج غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(f.site_id) then
    raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك.';
  end if;
  -- 0037: فوج حُذفت قاعته لا يُعرض.
  if f.status = 'void' then
    raise exception 'flock_void' using hint = 'حُذفت قاعة هذا الفوج، فلا يُعرض ولا يُسجَّل له شيء.';
  end if;
  select * into h from public.halls x where x.org_id = f.org_id and x.id = f.hall_id;
  select * into s from public.sites x where x.org_id = f.org_id and x.id = f.site_id;
  return jsonb_build_object(
    'flock', private.flock_summary(f) || jsonb_build_object('hall_id', h.id, 'hall_name', h.name, 'site_id', s.id, 'site_name', s.name,
      'closed_on', f.closed_on, 'close_note', f.close_note),
    'can_manage', public.can('flock.manage'),
    'can_save', public.can('flock_day.save'),
    'days', coalesce((
      select jsonb_agg(private.flock_day_json(y.d) || jsonb_build_object(
        'live_start', y.live_start, 'live_end', y.live_start - (y.d).dead - (y.d).culled - coalesce(k.sold, 0) + coalesce(k.adjust, 0),
        'sold', coalesce(k.sold, 0), 'count_diff', coalesce(k.adjust, 0),
        'hdep', case when f.kind = 'layer' then private.flock_pct((y.d).eggs_total, y.live_start) end) order by (y.d).on_date desc)
      from (
        select x as d, f.placed_count - coalesce(sum(x.dead + x.culled) over (order by x.on_date rows between unbounded preceding and 1 preceding), 0)
          + coalesce((select sum(z.adjust - z.sold) from private.flock_count_days(f.id) as z where z.on_date < x.on_date), 0) as live_start
        from public.flock_daily x where x.org_id = f.org_id and x.flock_id = f.id
      ) as y
      left join private.flock_count_days(f.id) as k on k.on_date = (y.d).on_date
    ), '[]'::jsonb),
    'weights', coalesce((
      select jsonb_agg(jsonb_build_object('on_date', w.on_date, 'sample_count', w.sample_count, 'avg_g', round(w.avg_g, 1)::text, 'version', w.version)
        order by w.on_date desc)
      from public.flock_weights w where w.org_id = f.org_id and w.flock_id = f.id
    ), '[]'::jsonb));
end
$$;

create or replace function public.flock_feed(p_flock uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  f public.flocks;
  h public.halls;
  v_issued numeric;
  v_unweighed int;
  v_consumed numeric;
  v_value numeric;
  v_rows jsonb;
  v_count int;
  v_void boolean;
  v_any_void boolean;
  v_carry_in numeric;
  v_out numeric;
  v_left_kg numeric;
  v_left_unweighed int;
begin
  perform private.require('read');
  select * into f from public.flocks x where x.org_id = v_org and x.id = p_flock;
  if f.id is null then
    raise exception 'flock_not_found' using hint = 'هذا الفوج غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(f.site_id) then
    raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك.';
  end if;
  -- 0037: فوج حُذفت قاعته لا يُعرض.
  if f.status = 'void' then
    raise exception 'flock_void' using hint = 'حُذفت قاعة هذا الفوج، فلا يُعرض ولا يُسجَّل له شيء.';
  end if;
  select * into h from public.halls x where x.org_id = f.org_id and x.id = f.hall_id;
  v_void := public.can('void') and f.status <> 'closed';
  -- 0028 (مراجعة O2/M5): ما في القاعة فعلاً بتعريفه الواحد (private.flock_left_in_hall)، حتى يوم الإغلاق أو اليوم.
  if f.placed_on is not null then
    select z.kg, z.unweighed into v_left_kg, v_left_unweighed from private.flock_left_in_hall(f, least(public.app_today(), coalesce(f.closed_on, public.app_today()))) as z;
  end if;
  select coalesce(sum(private.issue_mass_kg(y.qty_base, y.base_unit, y.density_kg_per_l, y.piece_mass_kg)), 0),
    (count(*) filter (where private.issue_mass_kg(y.qty_base, y.base_unit, y.density_kg_per_l, y.piece_mass_kg) is null))::int
  into v_issued, v_unweighed
  from public.flock_issues x join public.flock_issue_lines y on y.org_id = x.org_id and y.issue_id = x.id
  where x.org_id = v_org and x.flock_id = f.id and x.status = 'posted' and y.cost_kind = 'feed';
  select coalesce(sum(d.feed_kg), 0) into v_consumed from public.flock_daily d where d.org_id = v_org and d.flock_id = f.id;
  -- 0028: العلف المنقول إليها من الدورة السابقة (مطبَّقاً)، والخارج منها عند إغلاقها (الراجع والمنقول)، بالكيلو.
  select coalesce(sum(private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)), 0) into v_carry_in
  from public.flock_close_lines l where l.org_id = v_org and l.to_flock_id = f.id and l.carry_status = 'applied' and l.cost_kind = 'feed';
  select coalesce(sum(private.issue_mass_kg(l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg)), 0) into v_out
  from public.flock_close_lines l join public.flock_closes c on c.org_id = l.org_id and c.id = l.close_id
  where l.org_id = v_org and l.flock_id = f.id and c.status = 'closed' and l.action in ('return', 'carry') and l.cost_kind = 'feed';
  select coalesce(sum(c.amount), 0) into v_value from public.flock_costs c where c.org_id = v_org and c.flock_id = f.id and c.doc_kind = 'flock_issue';
  with listed as (
    select x.id, x.doc_no, x.issued_on, x.status, x.posted_at, x.void_reason, x.warehouse_id, w.name as warehouse_name,
      y.item_id, i.name as item_name, y.cost_kind, y.qty_base, y.base_unit, c.amount, r.on_date as voided_on,
      v_void and x.status = 'posted' and public.in_scope_site(x.site_id) and public.in_scope_wh(x.warehouse_id) as voidable,
      row_number() over (order by x.issued_on desc, x.posted_at desc, x.id desc) as n
    from public.flock_issues x
    join public.flock_issue_lines y on y.org_id = x.org_id and y.issue_id = x.id and y.line_no = 1
    join public.items i on i.org_id = y.org_id and i.id = y.item_id
    join public.warehouses w on w.org_id = x.org_id and w.id = x.warehouse_id
    left join public.flock_costs c on c.org_id = x.org_id and c.doc_kind = 'flock_issue' and c.doc_id = x.id and c.doc_line_id = y.id
      and c.reverses_id is null
    left join public.flock_costs r on r.org_id = c.org_id and r.reverses_id = c.id
    where x.org_id = v_org and x.flock_id = f.id
  )
  select count(*)::int, coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'doc_no', o.doc_no, 'issued_on', o.issued_on, 'status', o.status,
      'item_id', o.item_id, 'item_name', o.item_name, 'cost_kind', o.cost_kind, 'qty', o.qty_base::text, 'base_unit', o.base_unit,
      'warehouse_id', o.warehouse_id, 'warehouse_name', o.warehouse_name, 'voided_on', o.voided_on, 'void_reason', o.void_reason,
      'can_void', o.voidable, 'money', jsonb_build_object('value', o.amount::text)) order by o.n) filter (where o.n <= 500), '[]'::jsonb),
    coalesce(bool_or(o.voidable), false)
  into v_count, v_rows, v_any_void
  from listed o;
  return private.mask(jsonb_build_object('flock_id', f.id, 'flock_status', f.status, 'hall_id', h.id, 'hall_name', h.name, 'today', public.app_today(),
    'issued_feed_kg', round(v_issued, 3)::text, 'consumed_feed_kg', round(v_consumed, 3)::text, 'remaining_feed_kg', round(v_issued - v_consumed, 3)::text,
    'unweighed_feed_lines', v_unweighed, 'issues', v_rows, 'more', v_count > 500,
    'carry_in_feed_kg', round(v_carry_in, 3)::text, 'out_feed_kg', round(v_out, 3)::text, 'net_feed_kg', round(v_issued + v_carry_in - v_out, 3)::text,
    'left_in_hall_kg', round(coalesce(v_left_kg, 0), 3)::text, 'left_in_hall_unweighed', coalesce(v_left_unweighed, 0),
    'can_void', v_any_void,
    'money', jsonb_build_object('issued_value', v_value::text)));
end
$$;

create or replace function public.flock_issue_options(p_flock uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_lock date;
  f public.flocks;
  h public.halls;
  s public.sites;
  v_items jsonb;
begin
  perform private.require('read');
  select * into f from public.flocks x where x.org_id = v_org and x.id = p_flock;
  if f.id is null then
    raise exception 'flock_not_found' using hint = 'هذا الفوج غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(f.site_id) then
    raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك.';
  end if;
  -- 0037: فوج حُذفت قاعته لا يُعرض.
  if f.status = 'void' then
    raise exception 'flock_void' using hint = 'حُذفت قاعة هذا الفوج، فلا يُعرض ولا يُسجَّل له شيء.';
  end if;
  select * into h from public.halls x where x.org_id = f.org_id and x.id = f.hall_id;
  select * into s from public.sites x where x.org_id = f.org_id and x.id = f.site_id;
  select l.locked_through into v_lock from public.period_locks l where l.org_id = v_org;
  with av as (
    select l.item_id, l.warehouse_id, sum(l.qty_left) as qty
    from public.stock_lots l
    join public.items i on i.org_id = l.org_id and i.id = l.item_id
    join public.warehouses w on w.org_id = l.org_id and w.id = l.warehouse_id
    where l.org_id = v_org and l.qty_left > 0 and l.received_on <= v_today and not private.lot_expired(i.tracks_expiry, l.expiry_on, v_today)
      and i.archived_at is null and private.flock_cost_kind(i.kind) is not null and w.archived_at is null and public.in_scope_wh(w.id)
    group by l.item_id, l.warehouse_id
  ), per_item as (
    select a.item_id, sum(a.qty) as qty,
      jsonb_agg(jsonb_build_object('warehouse_id', w.id, 'name', w.name, 'qty', a.qty::text) order by a.qty desc, w.name collate "C", w.id) as stores
    from av a join public.warehouses w on w.org_id = v_org and w.id = a.warehouse_id
    group by a.item_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'name', i.name, 'kind', i.kind, 'cost_kind', private.flock_cost_kind(i.kind),
      'base_unit', i.base_unit, 'density_kg_per_l', i.density_kg_per_l::text, 'on_hand_qty', p.qty::text, 'made_in_mill', k.made,
      'stores', p.stores)
    order by k.made desc, (i.kind = 'feed') desc, (private.flock_cost_kind(i.kind) = 'feed') desc, i.name_norm collate "C", i.id), '[]'::jsonb)
  into v_items
  from per_item p
  join public.items i on i.org_id = v_org and i.id = p.item_id
  cross join lateral (
    select exists (select 1 from public.stock_lots z where z.org_id = v_org and z.item_id = i.id and z.source_kind = 'production')
      or exists (select 1 from public.recipes r where r.org_id = v_org and r.output_item_id = i.id and r.archived_at is null) as made
  ) as k;
  return jsonb_build_object('flock_id', f.id, 'flock_status', f.status, 'hall_id', h.id, 'hall_name', h.name, 'site_id', s.id, 'site_name', s.name,
    'placed_on', f.placed_on, 'today', v_today, 'earliest_on', greatest(v_today - 7, f.placed_on, v_lock + 1),
    'can_issue', public.can('issue.post') and f.status = 'active', 'items', v_items);
end
$$;

create or replace function public.round_visits(p_on date, p_kind text, p_flock uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_on date := coalesce(p_on, public.app_today());
  f public.flocks;
begin
  perform private.require('read');
  if p_kind is null or p_kind not in ('broiler', 'layer') then
    raise exception 'bad_kind' using hint = 'نوع الحقول إمّا لحم أو بيّاض.';
  end if;
  if not isfinite(v_on) then
    raise exception 'date_required' using hint = 'اختر يوماً من التقويم.';
  end if;
  if p_flock is not null then
    select * into f from public.flocks x where x.org_id = v_org and x.id = p_flock;
    if f.id is null then
      raise exception 'flock_not_found' using hint = 'هذا الفوج غير موجود في منشأتك. حدّث الشاشة.';
    end if;
    if not public.in_scope_site(f.site_id) then
      raise exception 'out_of_scope' using hint = 'قاعة هذا الفوج خارج نطاقك. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
    end if;
    -- 0037: فوج حُذفت قاعته لا يُعرض، ولا يدخل القائمة أدناه.
    if f.status = 'void' then
      raise exception 'flock_void' using hint = 'حُذفت قاعة هذا الفوج، فلا يُعرض ولا يُسجَّل له شيء.';
    end if;
  end if;
  return jsonb_build_object('on', v_on, 'today', v_today, 'flocks', coalesce((
    select jsonb_agg(jsonb_build_object('flock_id', q.id, 'hall_id', q.hall_id, 'visits', q.visits)
      order by q.site_name collate "C", q.hall_name collate "C", q.hall_id)
    from (
      select fl.id, fl.hall_id, s.name as site_name, h.name as hall_name,
        coalesce((select jsonb_agg(private.flock_visit_json(v) order by v.recorded_at, v.created_at, v.id) from public.flock_visits v
          where v.org_id = fl.org_id and v.flock_id = fl.id and v.on_date = v_on and v.voided_at is null), '[]'::jsonb) as visits
      from public.flocks fl
      join public.halls h on h.org_id = fl.org_id and h.id = fl.hall_id
      join public.sites s on s.org_id = h.org_id and s.id = h.site_id
      where fl.org_id = v_org and fl.kind = p_kind and fl.status <> 'void' and public.in_scope_site(fl.site_id)
        and case when p_flock is null
          then exists (select 1 from public.flock_visits v where v.org_id = fl.org_id and v.flock_id = fl.id and v.on_date = v_on and v.voided_at is null)
          else fl.id = p_flock end
    ) as q), '[]'::jsonb));
end
$$;

-- الأجسام الأخيرة من 0029 (halls_day وflock_cycles) و0036 (halls_history)، والأفواج المختارة بلا الملغى.
create or replace function public.halls_day(p_on date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_on date := coalesce(p_on, v_today);
  v_sites jsonb;
begin
  perform private.require('read');
  if v_on > v_today then
    raise exception 'future_day' using hint = 'لا تقرير ليوم لم يأتِ بعد.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'halls', s.halls, 'totals', private.halls_day_totals(s.halls))
      order by s.name collate "C", s.id), '[]'::jsonb)
  into v_sites
  from (
    select t.id, t.name, jsonb_agg(jsonb_build_object('hall_id', h.id, 'hall_name', h.name, 'kind', d.kind,
        'flock', case when q.id is not null then private.report_day(q.f, v_on, v_today) end,
        'carry', case when q.id is null then private.hall_carry(h.id, v_on) else '[]'::jsonb end) order by h.name collate "C", h.id) as halls
    from public.halls h
    join public.sites t on t.org_id = h.org_id and t.id = h.site_id
    join public.divisions d on d.org_id = h.org_id and d.id = h.division_id
    left join lateral (
      select x.id, x as f from public.flocks x
      where x.org_id = h.org_id and x.hall_id = h.id and x.placed_on is not null and x.placed_on <= v_on
        and (x.closed_on is null or v_on <= x.closed_on) and x.status <> 'void'
      order by x.placed_on desc, x.id
      limit 1) as q on true
    where h.org_id = v_org and public.in_scope_site(h.site_id) and (h.archived_at is null or q.id is not null)
    group by t.id, t.name
  ) as s;
  return jsonb_build_object(
    'on', v_on,
    'today', v_today,
    'prev', exists (select 1 from public.flocks x where x.org_id = v_org and x.placed_on < v_on and x.status <> 'void' and public.in_scope_site(x.site_id)),
    'next', v_on < v_today,
    'sites', v_sites,
    'totals', private.halls_day_totals(coalesce((select jsonb_agg(e.h order by s.n, e.n)
      from jsonb_array_elements(v_sites) with ordinality as s(site, n)
      cross join lateral jsonb_array_elements(s.site -> 'halls') with ordinality as e(h, n)), '[]'::jsonb)));
end
$$;

create or replace function public.halls_history(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_this date := v_today - extract(day from v_today)::int + 1;
  v_month date;
  v_end date;
  v_kinds jsonb;
  v_prev boolean;
begin
  perform private.require('read');
  if p_month is not null and not isfinite(p_month) then
    raise exception 'date_required' using hint = 'اختر شهراً من التقويم.';
  end if;
  v_month := coalesce(p_month, v_today) - extract(day from coalesce(p_month, v_today))::int + 1;
  if v_month > v_this then
    raise exception 'future_month' using hint = format('شهر %s لم يأتِ بعد؛ التقرير حتى شهر اليوم %s.', to_char(v_month, 'MM/YYYY'), to_char(v_today, 'MM/YYYY'));
  end if;
  v_end := least((v_month + interval '1 month')::date - 1, v_today);
  with fl as materialized (
    select x.id, x.hall_id, x.placed_on, x.placed_count, x.closed_on, d.kind, h.name as hall_name, t.name as site_name, x as f,
      least(v_today, x.closed_on) as through
    from public.flocks x
    join public.halls h on h.org_id = x.org_id and h.id = x.hall_id
    join public.sites t on t.org_id = h.org_id and t.id = h.site_id
    join public.divisions d on d.org_id = h.org_id and d.id = h.division_id
    where x.org_id = v_org and x.placed_on is not null and x.placed_on <= v_today and x.status <> 'void' and public.in_scope_site(h.site_id)
  ), z as materialized (
    -- فوج كلّ (قاعة، يوم) كـhalls_day: المسكَّن فيه أو قبله ولم يُغلق قبله، الأحدث تسكيناً ثمّ المعرّف.
    select distinct on (fl.hall_id, q.on_date) fl.id, fl.hall_id, fl.kind, fl.placed_on, fl.placed_count, fl.hall_name, fl.site_name, q.*
    from fl
    cross join lateral (
      select r.on_date, r.has_round, r.live_start, r.dead, r.culled, r.live_end, r.given_kg, r.given_unweighed, r.weight_avg_g,
        r.eggs_total, r.eggs_broken, e.sold, e.sold_kg, e.adjust, e.carry_in_kg, e.carry_in_unweighed, e.out_kg, e.out_unweighed, gs.cylinders as gas
      from private.report_days(fl.f, fl.through) as r
      join private.report_days_extra(fl.f, fl.through) as e on e.on_date = r.on_date
      -- 0035: قناني الغاز في اليوم.
      left join public.flock_day_gas gs on gs.org_id = v_org and gs.flock_id = fl.id and gs.on_date = r.on_date
    ) as q
    order by fl.hall_id, q.on_date, fl.placed_on desc, fl.id
  ), ks as materialized (
    select fl.kind, min(fl.placed_on) as start, count(distinct fl.hall_id)::int as halls from fl group by fl.kind
  ), dd as materialized (
    -- يوم النوع = مجاميع halls_day لقاعاته (private.halls_day_totals): الحيّ والمباع وفرق العدّ لكلّ فوج، والنافق والمستبعد لما فيه جولة (null
    -- بلا جولة)، وصافي العلف المرسل لكلّ فوج (0036؛ null بلا سطر علف في أيّ فوج)؛ والبيض للبيّاض بحيّ أوّل اليوم للأفواج التي سجّلته. والنازل من المخزن وحده: halls_day يعدّ العلف
    -- المنقول من الدورة السابقة نازلاً للفوج الجديد يوم تسكينه (0029)، وهو في السجلّ نقلٌ داخل القاعة نُزّل يوم صُرف للدورة السابقة، فجمعه في الشهر وفي
    -- «منذ البداية» يعدّه مرّتين (مراجعة 0031 M1). فالنازل هنا = نازل halls_day − المنقول إليها (carry_in_kg)، وسطوره بلا وزن كذلك.
    select ks.kind, c.d, c.d - extract(day from c.d)::int + 1 as m,
      count(z.id)::int as flocks,
      (count(*) filter (where z.has_round))::int as rounds,
      (count(*) filter (where z.live_start > 0))::int as rounds_expected,
      coalesce(sum(z.placed_count) filter (where z.placed_on = c.d), 0)::bigint as placed,
      coalesce(sum(z.live_start), 0)::bigint as live_start,
      sum(z.dead)::bigint as dead,
      sum(z.culled)::bigint as culled,
      sum(z.gas)::bigint as gas,
      coalesce(sum(z.sold), 0)::bigint as sold,
      coalesce(sum(z.adjust), 0)::bigint as count_diff,
      coalesce(sum(z.live_end), 0)::bigint as live_end,
      -- 0036 (جواب المالك «عوف سالفة العلف الماكول»): علف اليوم صافي العلف المرسل لا المأكول، لكلّ فوج يومه في قاعته بشقّي الورقة (hall_sheet):
      -- علف اليوم (المرسل بيومه + المنقول إليها يوم تطبيقه) ناقص الراجع والمنقول منها يوم الإغلاق، كلّ شقّ بثلاث مراتب كخانتَيها؛ فمجموع أيّام الدورة
      -- صافيها، والمنقول بين دورتين يُطرح من الأولى يوم إغلاقها ويُضاف للثانية يوم تسكينها. وفارغ بلا سطر علف في أيّ فوج، وسطوره بلا كتلة تُعدّ.
      round(sum(case when z.given_kg <> 0 or z.given_unweighed > 0 or z.out_kg <> 0 or z.out_unweighed > 0
        then round(z.given_kg, 3) - round(z.out_kg, 3) end), 3) as feed_kg,
      coalesce(sum(z.given_unweighed + z.out_unweighed), 0)::bigint as feed_unweighed,
      round(coalesce(sum(z.given_kg - z.carry_in_kg), 0), 3) as given_kg,
      coalesce(sum(z.given_unweighed - z.carry_in_unweighed), 0)::bigint as given_unweighed,
      case when ks.kind = 'layer' then sum(z.eggs_total) end::bigint as eggs_total,
      case when ks.kind = 'layer' then sum(z.eggs_broken) end::bigint as eggs_broken,
      case when ks.kind = 'layer' then sum(z.live_start) filter (where z.eggs_total is not null) end::bigint as egg_live
    from ks
    cross join lateral generate_series(0, v_today - ks.start) as s(n)
    cross join lateral (select ks.start + s.n as d) as c
    left join z on z.kind = ks.kind and z.on_date = c.d
    group by ks.kind, ks.start, c.d
  ), mm as materialized (
    -- الشهر = مجموع أيّامه داخل [البداية، اليوم] (null يُعدّ صفراً)، والحيّ آخر آخر يوم منها، والأفواج المسكَّنة والمغلقة فيه.
    select dd.kind, dd.m, count(*)::int as days, sum(dd.placed)::bigint as placed, coalesce(sum(dd.dead), 0)::bigint as dead,
      coalesce(sum(dd.culled), 0)::bigint as culled, coalesce(sum(dd.gas), 0)::bigint as gas, sum(dd.sold)::bigint as sold, sum(dd.count_diff)::bigint as count_diff,
      round(coalesce(sum(dd.feed_kg), 0), 3) as feed_kg, sum(dd.feed_unweighed)::bigint as feed_unweighed, round(sum(dd.given_kg), 3) as given_kg, sum(dd.given_unweighed)::bigint as given_unweighed,
      case when dd.kind = 'layer' then coalesce(sum(dd.eggs_total), 0) end::bigint as eggs_total,
      case when dd.kind = 'layer' then coalesce(sum(dd.eggs_broken), 0) end::bigint as eggs_broken,
      case when dd.kind = 'layer' then sum(dd.egg_live) end::bigint as egg_live,
      (array_agg(dd.live_end order by dd.d desc))[1] as live_end,
      (select count(*) from fl where fl.kind = dd.kind and fl.placed_on - extract(day from fl.placed_on)::int + 1 = dd.m)::int as opened,
      (select count(*) from fl where fl.kind = dd.kind and fl.closed_on <= v_today
        and fl.closed_on - extract(day from fl.closed_on)::int + 1 = dd.m)::int as closed
    from dd
    group by dd.kind, dd.m
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'kind', ks.kind,
      'start', ks.start,
      'days', coalesce((select jsonb_agg(jsonb_build_object('on', dd.d, 'flocks', dd.flocks, 'rounds', dd.rounds, 'rounds_expected', dd.rounds_expected,
          'placed', dd.placed, 'live_start', dd.live_start, 'dead', dd.dead, 'culled', dd.culled, 'gas', dd.gas, 'sold', dd.sold, 'count_diff', dd.count_diff,
          'live_end', dd.live_end, 'feed_kg', dd.feed_kg::text, 'feed_unweighed', dd.feed_unweighed, 'given_kg', dd.given_kg::text, 'given_unweighed', dd.given_unweighed,
          'eggs_total', dd.eggs_total, 'eggs_broken', dd.eggs_broken, 'hdep', private.flock_pct(dd.eggs_total, dd.egg_live)) order by dd.d)
        from dd where dd.kind = ks.kind and dd.d between v_month and v_end), '[]'::jsonb),
      'months', (select jsonb_agg(jsonb_build_object('month', mm.m, 'days', mm.days, 'placed', mm.placed, 'dead', mm.dead, 'culled', mm.culled, 'gas', mm.gas,
          'sold', mm.sold, 'count_diff', mm.count_diff, 'feed_kg', mm.feed_kg::text, 'feed_unweighed', mm.feed_unweighed, 'given_kg', mm.given_kg::text, 'given_unweighed', mm.given_unweighed,
          'eggs_total', mm.eggs_total, 'eggs_broken', mm.eggs_broken, 'hdep', private.flock_pct(mm.eggs_total, mm.egg_live), 'live_end', mm.live_end,
          'opened', mm.opened, 'closed', mm.closed) order by mm.m)
        from mm where mm.kind = ks.kind),
      'total', (select jsonb_build_object('days', sum(mm.days)::int, 'placed', sum(mm.placed)::bigint, 'dead', sum(mm.dead)::bigint,
          'culled', sum(mm.culled)::bigint, 'gas', sum(mm.gas)::bigint, 'sold', sum(mm.sold)::bigint, 'count_diff', sum(mm.count_diff)::bigint, 'feed_kg', sum(mm.feed_kg)::text, 'feed_unweighed', sum(mm.feed_unweighed)::bigint,
          'given_kg', sum(mm.given_kg)::text, 'given_unweighed', sum(mm.given_unweighed)::bigint,
          'eggs_total', sum(mm.eggs_total)::bigint, 'eggs_broken', sum(mm.eggs_broken)::bigint, 'hdep', private.flock_pct(sum(mm.eggs_total), sum(mm.egg_live)),
          'live_now', (array_agg(mm.live_end order by mm.m desc))[1], 'opened', sum(mm.opened)::int, 'closed', sum(mm.closed)::int, 'halls', ks.halls)
        from mm where mm.kind = ks.kind),
      'events', coalesce((select jsonb_agg(ev.j order by ev.on_date, ev.pos, ev.hall_name collate "C", ev.site_name collate "C", ev.k collate "C") from (
          select fl.placed_on as on_date, 1 as pos, fl.hall_name, fl.site_name, fl.id::text as k,
            jsonb_build_object('on', fl.placed_on, 'type', 'placed', 'hall', fl.hall_name, 'site', fl.site_name, 'birds', fl.placed_count) as j
          from fl where fl.kind = ks.kind and fl.placed_on between v_month and v_end
          union all
          select z.on_date, 2, z.hall_name, z.site_name, z.id::text,
            jsonb_build_object('on', z.on_date, 'type', 'sold', 'hall', z.hall_name, 'site', z.site_name, 'birds', z.sold, 'kg', round(z.sold_kg, 3)::text)
          from z where z.kind = ks.kind and z.on_date between v_month and v_end and z.sold <> 0
          union all
          select z.on_date, 3, z.hall_name, z.site_name, z.id::text,
            jsonb_build_object('on', z.on_date, 'type', 'count_diff', 'hall', z.hall_name, 'site', z.site_name, 'birds', z.adjust)
          from z where z.kind = ks.kind and z.on_date between v_month and v_end and z.adjust <> 0
          union all
          select m.done_on, 4, fl.hall_name, fl.site_name, x.name_key || ':' || m.id::text,
            jsonb_build_object('on', m.done_on, 'type', 'vaccine', 'hall', fl.hall_name, 'site', fl.site_name, 'name', x.name)
          from public.flock_vaccinations m
          join fl on fl.id = m.flock_id
          join public.vaccines x on x.org_id = m.org_id and x.id = m.vaccine_id
          where m.org_id = v_org and m.status = 'done' and fl.kind = ks.kind and m.done_on between v_month and v_end
          union all
          select z.on_date, 5, z.hall_name, z.site_name, z.id::text,
            jsonb_build_object('on', z.on_date, 'type', 'weight', 'hall', z.hall_name, 'site', z.site_name, 'avg_g', round(z.weight_avg_g, 1)::text)
          from z where z.kind = ks.kind and z.on_date between v_month and v_end and z.weight_avg_g is not null
          union all
          select fl.closed_on, 6, fl.hall_name, fl.site_name, fl.id::text,
            jsonb_build_object('on', fl.closed_on, 'type', 'closed', 'hall', fl.hall_name, 'site', fl.site_name)
          from fl where fl.kind = ks.kind and fl.closed_on between v_month and v_end
        ) as ev), '[]'::jsonb))
      order by ks.kind = 'layer', ks.kind), '[]'::jsonb),
    exists (select 1 from fl where fl.placed_on < v_month)
  into v_kinds, v_prev
  from ks;
  return jsonb_build_object(
    'today', v_today,
    'month', v_month,
    'prev', coalesce(v_prev, false),
    'next', v_month < v_this,
    'kinds', v_kinds,
    'notes', coalesce((select jsonb_agg(jsonb_build_object('on', n.on_date, 'text', n.note, 'version', n.version) order by n.on_date)
      from public.halls_day_notes n where n.org_id = v_org and n.on_date between v_month and v_end and n.note <> ''), '[]'::jsonb));
end
$$;

create or replace function public.flock_cycles() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_count int;
  v_cycles jsonb;
begin
  perform private.require('read');
  with c as (
    select x.id, x.hall_id, h.name as hall_name, x.site_id, s.name as site_name, x.kind, x.status, x.placed_on, x.closed_on,
      coalesce(x.closed_on, v_today) as through, x.placed_count, x.age_days_at_placement as age0,
      row_number() over (order by x.status = 'active' desc, x.closed_on desc, x.placed_on desc, h.name collate "C", x.id) as n
    from public.flocks x
    join public.halls h on h.org_id = x.org_id and h.id = x.hall_id
    join public.sites s on s.org_id = x.org_id and s.id = x.site_id
    where x.org_id = v_org and x.placed_on is not null and x.status <> 'void' and public.in_scope_site(x.site_id)
    order by n
    limit 501
  )
  select count(*)::int, coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'hall_id', c.hall_id, 'hall_name', c.hall_name, 'site_id', c.site_id,
      'site_name', c.site_name, 'kind', c.kind, 'status', c.status, 'placed_on', c.placed_on, 'closed_on', c.closed_on, 'through', c.through,
      'placed_count', c.placed_count, 'age', c.through - c.placed_on + c.age0, 'days', c.through - c.placed_on + 1,
      'live', c.placed_count - b.gone - n.sold + n.adjust, 'mortality_pct', private.flock_pct(b.gone, c.placed_count),
      'sold_birds', n.sold, 'count_diff', n.adjust) order by c.n) filter (where c.n <= 500), '[]'::jsonb)
  into v_count, v_cycles
  from c
  cross join lateral (select coalesce(sum(y.dead + y.culled), 0) as gone from public.flock_daily y
    where y.org_id = v_org and y.flock_id = c.id and y.on_date <= c.through) as b
  cross join lateral (select coalesce(sum(k.sold), 0)::int as sold, coalesce(sum(k.adjust), 0)::int as adjust from private.flock_count_days(c.id) as k
    where k.on_date <= c.through) as n;
  return jsonb_build_object('today', v_today, 'more', v_count > 500, 'cycles', v_cycles);
end
$$;

-- ─── هـ. إلغاء الصرف بنواة واحدة مع حذف القاعة ──────────────────────────────────────────────────────────────────────────
-- الأثر بعد الأقفال: كلّ سحب أصليّ ينعكس على دفعته نفسها بيوم اليوم (apply_move يرفض عكس سحب قبل تصحيح سعر حيّ أو قبل جرد معتمد)، وسطر الكلفة
-- بصفّ عكسيّ بإشارة معاكسة يشير إلى أصله، والصرف void بسببه. من يناديها يأخذ أقفالها قبلها: الصرف ← الفوج ← المخزن والمادّة ← الرصيد.
create or replace function private.flock_issue_reverse(x public.flock_issues, p_reason text, out reversed_moves int, out reversed_value numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_today date := public.app_today();
  m public.stock_moves;
  c public.flock_costs;
begin
  reversed_moves := 0;
  reversed_value := 0;
  for m in
    select z.* from public.stock_moves z
    where z.org_id = x.org_id and z.doc_kind = 'flock_issue' and z.doc_id = x.id and z.reverses_move_id is null
    order by z.item_id, z.seq
  loop
    perform private.apply_move(m.lot_id, 'flock_issue', x.id, m.doc_line_id, -m.qty, -m.value, v_today, m.id);
    reversed_moves := reversed_moves + 1;
  end loop;
  for c in
    select z.* from public.flock_costs z
    where z.org_id = x.org_id and z.doc_kind = 'flock_issue' and z.doc_id = x.id and z.reverses_id is null
    order by z.doc_line_id, z.id
  loop
    insert into public.flock_costs (org_id, flock_id, site_id, kind, amount, doc_kind, doc_id, doc_line_id, on_date, expense_id, reverses_id)
    values (c.org_id, c.flock_id, c.site_id, c.kind, -c.amount, c.doc_kind, c.doc_id, c.doc_line_id, v_today, c.expense_id, c.id);
    reversed_value := reversed_value + c.amount;
  end loop;
  update public.flock_issues set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = p_reason, version = version + 1
  where org_id = x.org_id and id = x.id;
end
$$;

-- الجسم الأخير من 0019 بأقفاله وفحوصه وجوابه كما هي، والأثر بالنواة.
create or replace function public.void_flock_issue(p_issue_id uuid, p_reason text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'void_flock_issue';
  v_org uuid := public.auth_org();
  v_today date := public.app_today();
  v_cached jsonb;
  v_reason text;
  x public.flock_issues;
  f public.flocks;
  w public.warehouses;
  v_items uuid[];
  v_back int := 0;
  v_value numeric := 0;
begin
  set local lock_timeout = '5s';
  perform private.require('void');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('id', p_issue_id, 'reason', p_reason));
  if v_cached is not null then
    return v_cached;
  end if;
  v_reason := private.check_reason(p_reason);
  select * into x from public.flock_issues y where y.org_id = v_org and y.id = p_issue_id;
  if x.id is null then
    raise exception 'doc_not_found' using hint = 'هذا الصرف غير موجود في منشأتك. حدّث الشاشة.';
  end if;
  if not public.in_scope_site(x.site_id) then
    raise exception 'out_of_scope' using hint = 'قاعة هذا الصرف خارج نطاقك، فلا تلغيه. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.';
  end if;
  w := private.stock_wh(x.warehouse_id, true);
  perform private.check_void_date();
  select * into x from public.flock_issues y where y.org_id = v_org and y.id = p_issue_id for update;
  if x.status = 'void' then
    raise exception 'already_void' using hint = format('الصرف %s ملغى من قبل.', x.doc_no);
  end if;
  select * into f from public.flocks y where y.org_id = v_org and y.id = x.flock_id for share;
  -- 0037: صرف فوج حُذفت قاعته ملغى معه دائماً (الثابت verify_delete_hall)، فهذا حارس ثانٍ.
  if f.status = 'void' then
    raise exception 'flock_void' using hint = 'حُذفت قاعة هذا الفوج، فلا يُعرض ولا يُسجَّل له شيء.';
  end if;
  if f.status = 'closed' then
    raise exception 'flock_closed' using hint = format('الفوج مغلق، فلا يُلغى الصرف %s له.', x.doc_no);
  end if;
  select array_agg(distinct y.item_id) into v_items from public.flock_issue_lines y where y.org_id = x.org_id and y.issue_id = x.id;
  perform private.lock_masters(array[w.id], v_items, false);
  perform private.lock_balances(v_items, array_fill(w.id, array[cardinality(v_items)]));
  -- 0037: الأثر (الحركات العكسية وصفوف الكلفة العكسية والحالة) بالنواة المشتركة مع حذف القاعة (delete_hall)، بعد أقفالها بترتيبها.
  select r.reversed_moves, r.reversed_value into v_back, v_value from private.flock_issue_reverse(x, v_reason) as r;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('id', x.id, 'doc_no', x.doc_no, 'status', 'void', 'flock_id', x.flock_id,
    'voided_on', v_today, 'reversed_moves', v_back, 'money', jsonb_build_object('value', v_value::text)));
end
$$;

-- ─── و. احذف القاعة: ما يرجع، والبصمة، والمنع، والمعاينة، والكاتب ─────────────────────────────────────────────────────────────
-- ما يرجع إلى المخازن: سطور الصرف المرحَّل للفوج مجموعةً لكلّ (مخزن، مادّة، وحدة)، بترتيب اسم المخزن ثمّ اسم المادّة.
create or replace function private.delete_hall_back(f public.flocks) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('warehouse_id', b.warehouse_id, 'warehouse', w.name, 'item_id', b.item_id, 'item', i.name,
      'qty', round(b.qty, 3)::text, 'base_unit', b.base_unit) order by w.name collate "C", i.name collate "C", w.id, i.id, b.base_unit), '[]'::jsonb)
  from (
    select l.warehouse_id, l.item_id, l.base_unit, sum(l.qty_base) as qty
    from public.flock_issues x
    join public.flock_issue_lines l on l.org_id = x.org_id and l.issue_id = x.id
    where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted'
    group by l.warehouse_id, l.item_id, l.base_unit
  ) as b
  join public.warehouses w on w.org_id = f.org_id and w.id = b.warehouse_id
  join public.items i on i.org_id = f.org_id and i.id = b.item_id
$$;

-- بصمة ما سيُحذف: القاعة ونسختها، والفوج القائم ونسخته، والصرف المرحَّل بنسخه، والتأشيرات «تمّ».
create or replace function private.delete_hall_plan(h public.halls, f public.flocks) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select md5(concat_ws('|',
    'hall:' || h.id::text || ':' || h.version::text,
    case when f.id is null then 'flock:none' else 'flock:' || f.id::text || ':' || f.version::text end,
    'issues:' || coalesce((select string_agg(x.id::text || ':' || x.version::text, ',' order by x.id)
      from public.flock_issues x where x.org_id = h.org_id and x.flock_id = f.id and x.status = 'posted'), ''),
    'vaccinations:' || coalesce((select string_agg(m.id::text, ',' order by m.id)
      from public.flock_vaccinations m where m.org_id = h.org_id and m.flock_id = f.id and m.status = 'done'), '')))
$$;

-- المنع بترتيبه، لكلّ واحد رمزه وجملته بسببه وما يُفعل؛ تقرؤه المعاينة ويرمي الكاتب أوّله.
create or replace function private.delete_hall_blocks(h public.halls, f public.flocks) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_blocks jsonb := '[]'::jsonb;
  v_list text;
  v_n int;
  v_lock date;
  v_from date;
begin
  -- ١) الصلاحية أوّلاً ووحدها (E49: لا يُسمّى شيء من قاعة خارج النطاق ولا من فوجها): حقل القاعة بنطاق الكاتب، وإدارة القاعات، ولما يُلغى من
  --    صرف فعل الإلغاء ومخازنه بنطاقه، كإلغاء الصرف (void_flock_issue: الحركة العكسية تُكتب في مخزن الصرف).
  if not public.in_scope_site(h.site_id) then
    return jsonb_build_array(jsonb_build_object('code', 'permission', 'text',
      format('القاعة «%s» خارج نطاقك، فلا تحذفها. اطلب من مالك المنشأة إضافة حقلها إلى نطاقك.', h.name)));
  end if;
  if not public.can('flock.manage') then
    return jsonb_build_array(jsonb_build_object('code', 'permission', 'text', 'حذف القاعة لمن يدير القاعات، ودورك لا يديرها.'));
  end if;
  if f.id is not null and exists (select 1 from public.flock_issues x where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted') then
    if not public.can('void') then
      return jsonb_build_array(jsonb_build_object('code', 'permission', 'text',
        'في فوج القاعة صرف من المخزن يُلغى بحذفها، وإلغاء المستندات ليس من صلاحية دورك.'));
    end if;
    select string_agg(format('«%s»', w.name), '، ' order by w.name collate "C", w.id) into v_list
    from public.warehouses w
    where w.org_id = f.org_id and not public.in_scope_wh(w.id)
      and w.id in (select x.warehouse_id from public.flock_issues x where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted');
    if v_list is not null then
      return jsonb_build_array(jsonb_build_object('code', 'permission', 'text',
        format('صُرف لفوج القاعة من مخزن خارج نطاقك (%s)، فلا يرجع إليه شيء منك. اطلب الحذف من مالك المنشأة.', v_list)));
    end if;
  end if;
  if f.id is not null then
    -- ٢) بيع الطيور (مال): فواتير مرحَّلة من الفوج.
    select string_agg(b.doc_no, '، ' order by b.doc_no collate "C", b.id), count(*)::int into v_list, v_n
    from public.bird_sales b
    where b.org_id = f.org_id and b.status = 'posted'
      and exists (select 1 from public.bird_sale_sources s where s.org_id = b.org_id and s.sale_id = b.id and s.flock_id = f.id);
    if v_n > 0 then
      v_blocks := v_blocks || jsonb_build_object('code', 'sales', 'text', format('في الفوج بيع طيور (%s %s)؛ ألغِ %s أوّلاً ثمّ احذف القاعة.',
        case when v_n = 1 then 'فاتورة' else 'الفواتير' end, v_list, case when v_n = 1 then 'الفاتورة' else 'الفواتير' end));
    end if;
    -- ٣) تذاكر الوزن غير الملغاة (المسوّدة والمكتملة، ولو بفاتورة).
    select string_agg(coalesce(t.ticket_no, format('مسوّدة %s', to_char(t.on_date, 'DD/MM/YYYY'))), '، ' order by t.on_date, t.ticket_no collate "C", t.id),
      count(*)::int
    into v_list, v_n
    from public.weigh_tickets t
    where t.org_id = f.org_id and t.status <> 'void'
      and exists (select 1 from public.weigh_ticket_stops s where s.org_id = t.org_id and s.ticket_id = t.id and s.flock_id = f.id);
    if v_n > 0 then
      v_blocks := v_blocks || jsonb_build_object('code', 'tickets', 'text', format('في الفوج %s (%s)؛ ألغِ %s أوّلاً ثمّ احذف القاعة.',
        case when v_n = 1 then 'تذكرة وزن' else 'تذاكر وزن' end, v_list, case when v_n = 1 then 'التذكرة' else 'التذاكر' end));
    end if;
    -- ٤) علف منقول إلى الفوج من الدورة السابقة وما زال مطبَّقاً: النقل لا يُلغى.
    select string_agg(z.name, '، ' order by z.name collate "C") into v_list
    from (select distinct format('«%s»', i.name) as name
      from public.flock_close_lines l join public.items i on i.org_id = l.org_id and i.id = l.item_id
      where l.org_id = f.org_id and l.to_flock_id = f.id and l.carry_status = 'applied') as z;
    if v_list is not null then
      v_blocks := v_blocks || jsonb_build_object('code', 'carry', 'text', format('في الفوج علف منقول من الدورة السابقة (%s)، والنقل المطبَّق لا يُلغى، فلا تُحذف القاعة وفوجها قائم. أغلق الدورة أوّلاً ثمّ احذف القاعة.', v_list));
    end if;
    -- ٥) قفل الفترة على أيّام الفوج (من تسكينه إلى اليوم، ويوم الإلغاء اليوم).
    select l.locked_through into v_lock from public.period_locks l where l.org_id = f.org_id;
    v_from := coalesce(f.placed_on, f.opened_on);
    if v_lock is not null and v_lock >= v_from then
      v_blocks := v_blocks || jsonb_build_object('code', 'period_locked', 'text', format('الحسابات مقفلة حتى %s، وأيّام الفوج من %s داخلها؛ اطلب من مالك المنشأة فتح الفترة ثمّ احذف القاعة.',
        to_char(v_lock, 'DD/MM/YYYY'), to_char(v_from, 'DD/MM/YYYY')));
    end if;
    -- ٦) و٧) ما يرفض به apply_move عكس حركات الإرسال الأصلية للصرف المرحَّل (مرآة reopen_block لإعادة فتح الدورة في 0029، بترتيبه): تصحيح سعر حيّ
    --    لعائلة الدفعة بعد السحب (شرط private.check_draw_not_revalued: lot_consumed)، ثمّ جرد معتمد لمادّة الحركة بمخزنها في يومها أو بعده ولو بلا فرق
    --    (شرط private.check_move_not_counted: count_superseded). مخزن الجرد مخزن الصرف نفسه، وهو بنطاق الكاتب (أعلاه).
    select string_agg(z.entry, '، ' order by z.item collate "C", z.doc collate "C", z.rev_no, z.id), count(distinct z.id)::int into v_list, v_n
    from (select distinct i.name as item, r.doc_no as doc, v.rev_no, v.id,
        format('«%s» (%s)', i.name, private.stock_doc_label('receipt_revalue', v.id)) as entry
      from public.flock_issues x
      join public.stock_moves m on m.org_id = x.org_id and m.doc_kind = 'flock_issue' and m.doc_id = x.id and m.reverses_move_id is null and m.qty < 0
      join public.stock_lots l on l.org_id = m.org_id and l.id = m.lot_id
      join public.stock_lots o on o.org_id = l.org_id and o.id = coalesce(l.origin_lot_id, l.id) and o.source_kind = 'receipt'
      join public.receipt_revaluations v on v.org_id = m.org_id and v.receipt_line_id = o.source_line_id and v.status = 'posted'
        and (v.marks ->> m.warehouse_id::text)::bigint >= m.seq
      join public.receipts r on r.org_id = v.org_id and r.id = v.receipt_id
      join public.items i on i.org_id = m.org_id and i.id = m.item_id
      where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted') as z;
    if v_n > 0 then
      v_blocks := v_blocks || jsonb_build_object('code', 'revalued', 'text', format('أُرسل إلى الفوج قبل تصحيح سعره: %s؛ ألغِ %s أوّلاً ثمّ احذف القاعة.',
        v_list, case when v_n = 1 then 'التصحيح' else 'التصحيحات' end));
    end if;
    select string_agg(z.entry, '، ' order by z.item collate "C", z.counted_on, z.doc collate "C", z.id), count(distinct z.id)::int into v_list, v_n
    from (select distinct i.name as item, c.counted_on, c.doc_no as doc, c.id,
        format('«%s» (الجرد %s في «%s» بتاريخ %s)', i.name, c.doc_no, w.name, to_char(c.counted_on, 'DD/MM/YYYY')) as entry
      from public.flock_issues x
      join public.stock_moves m on m.org_id = x.org_id and m.doc_kind = 'flock_issue' and m.doc_id = x.id and m.reverses_move_id is null and m.qty <> 0
      join public.stock_counts c on c.org_id = m.org_id and c.warehouse_id = m.warehouse_id and c.status = 'approved' and c.counted_on >= m.moved_on
      join public.stock_count_lines n on n.org_id = c.org_id and n.doc_id = c.id and n.item_id = m.item_id and n.snapshot_seq >= m.seq
      join public.items i on i.org_id = m.org_id and i.id = m.item_id
      join public.warehouses w on w.org_id = c.org_id and w.id = c.warehouse_id
      where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted') as z;
    if v_n > 0 then
      v_blocks := v_blocks || jsonb_build_object('code', 'counted', 'text', format('أُرسل إلى الفوج قبل جرد مخزنه: %s؛ ألغِ %s أوّلاً ثمّ احذف القاعة.',
        v_list, case when v_n = 1 then 'الجرد' else 'الجرود' end));
    end if;
  else
    -- القاعة بلا فوج قائم: العلف المنقول المعلَّق من دورتها المنتهية يمنع أرشفتها (halls_check)، فيُقال هنا بسببه وما يُفعل.
    select string_agg(z.name, '، ' order by z.name collate "C") into v_list
    from (select distinct format('«%s»', i.name) as name
      from public.flock_close_lines l
      join public.flock_closes c on c.org_id = l.org_id and c.id = l.close_id
      join public.items i on i.org_id = l.org_id and i.id = l.item_id
      where l.org_id = h.org_id and l.hall_id = h.id and l.carry_status = 'pending' and c.status = 'closed') as z;
    if v_list is not null then
      v_blocks := v_blocks || jsonb_build_object('code', 'carry', 'text', format('في القاعة «%s» علف منقول للدورة التالية (%s)؛ أرجِعه إلى مخزن أوّلاً ثمّ احذف القاعة.', h.name, v_list));
    end if;
  end if;
  return v_blocks;
end
$$;

-- المعاينة (read).
create or replace function public.delete_hall_preview(p_hall uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  h public.halls;
  f public.flocks;
  v_scope boolean;
begin
  perform private.require('read');
  select * into h from public.halls x where x.org_id = public.auth_org() and x.id = p_hall;
  if h.id is null or h.archived_at is not null then
    raise exception 'hall_not_found' using hint = 'هذه القاعة غير موجودة في منشأتك (ربّما حُذفت من جهاز آخر). حدّث الشاشة.';
  end if;
  select * into f from public.flocks x where x.org_id = h.org_id and x.hall_id = h.id and x.status in ('preparing', 'active');
  -- ما في القاعة لمن حقلها بنطاقه وحده (سياسة قراءة الأفواج بنطاق الحقل)؛ وخارج النطاق القاعة باسمها وبسبب المنع، والبصمة نفسها.
  v_scope := public.in_scope_site(h.site_id);
  return jsonb_build_object(
    'hall', jsonb_build_object('id', h.id, 'name', h.name, 'site_id', h.site_id,
      'site', (select s.name from public.sites s where s.org_id = h.org_id and s.id = h.site_id), 'version', h.version),
    'flock', case when f.id is not null and v_scope then jsonb_build_object(
      'id', f.id, 'version', f.version, 'status', f.status, 'placed_on', f.placed_on, 'placed_count', f.placed_count,
      'days', (select count(*)::int from public.flock_daily d where d.org_id = f.org_id and d.flock_id = f.id),
      'visits', (select count(*)::int from public.flock_visits v where v.org_id = f.org_id and v.flock_id = f.id and v.voided_at is null),
      'gas_days', (select count(*)::int from public.flock_day_gas g where g.org_id = f.org_id and g.flock_id = f.id and g.cylinders is not null),
      'weights', (select count(*)::int from public.flock_weights w where w.org_id = f.org_id and w.flock_id = f.id),
      'logs', (select count(*)::int from public.flock_logs o where o.org_id = f.org_id and o.flock_id = f.id),
      'vaccinations', (select count(*)::int from public.flock_vaccinations m where m.org_id = f.org_id and m.flock_id = f.id and m.status = 'done'),
      'issues', (select count(*)::int from public.flock_issues x where x.org_id = f.org_id and x.flock_id = f.id and x.status = 'posted'),
      'back', private.delete_hall_back(f)) end,
    'ended', case when v_scope then (select count(*)::int from public.flocks x where x.org_id = h.org_id and x.hall_id = h.id and x.status = 'closed') else 0 end,
    'blocks', private.delete_hall_blocks(h, f),
    'plan', private.delete_hall_plan(h, f));
end
$$;

-- الحذف (flock.manage؛ وvoid حين يُلغى صرف)، بمرجع client_ref وبالحالة.
create or replace function public.delete_hall(p_hall uuid, p_expected_version int, p_expected_plan text, p_client_ref uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fn constant text := 'delete_hall';
  v_org uuid := public.auth_org();
  v_cached jsonb;
  h public.halls;
  f public.flocks;
  x public.flock_issues;
  v_flock uuid;
  v_locked uuid[] := '{}';
  v_now uuid[] := '{}';
  v_items uuid[];
  v_whs uuid[];
  v_block jsonb;
  v_reason text;
  v_back jsonb;
  v_voided int := 0;
begin
  set local lock_timeout = '5s';
  perform private.require('flock.manage');
  v_cached := private.ref_claim(v_fn, p_client_ref, jsonb_build_object('hall', p_hall, 'version', p_expected_version, 'plan', p_expected_plan));
  if v_cached is not null then
    return v_cached;
  end if;

  -- ١) الأقفال بترتيبها الواحد (رأس الهجرة): قفل الفترة للمشاركة، ثمّ القاعة، ثمّ صرف الفوج القائم المرحَّل بترتيب معرّفاته (قبل صفّ الفوج، كإلغاء
  --    الصرف وإلغاء التأشير المربوط)، ثمّ صفّ الفوج، ثمّ المخازن والموادّ، ثمّ الأرصدة، ثمّ تأشيرات «تمّ». القاعة والفوج for no key update: لا يمسّ
  --    الحذف مفتاحاً، والأقوى (for update) يحبس فحص المفتاح الأجنبيّ (key share) لكاتب يمسك الفوج ويضيف صفّاً للقاعة، فيتقافلان.
  perform private.period_guard();
  select * into h from public.halls y where y.org_id = v_org and y.id = p_hall for no key update;
  if h.id is null then
    raise exception 'hall_not_found' using hint = 'هذه القاعة غير موجودة في منشأتك. حدّث الشاشة.';
  end if;
  -- محذوفة من قبل (أو مؤرشفة): الجواب نفسه بلا كتابة، فإعادة بعد جواب ضاع، ولو بمرجع جديد، لا تغيّر شيئاً.
  if h.archived_at is not null then
    return private.ref_store(v_fn, p_client_ref, jsonb_build_object('hall_id', h.id, 'name', h.name, 'deleted', true, 'already', true, 'back', '[]'::jsonb));
  end if;
  -- الفوج القائم في القاعة لا يتبدّل تحت قفلها (التسكين وإعادة الفتح والإغلاق تأخذه)؛ قد يُحذف بلا سجلّ (delete_flock) فيُرى أدناه.
  select y.id into v_flock from public.flocks y where y.org_id = v_org and y.hall_id = h.id and y.status in ('preparing', 'active');
  if v_flock is not null then
    -- المقفول من جملة القفل نفسها (READ COMMITTED: قراءة ثانية لقطة أخرى، درس 2026-11-05).
    select coalesce(array_agg(z.id order by z.id), '{}') into v_locked from (
      select y.id from public.flock_issues y where y.org_id = v_org and y.flock_id = v_flock and y.status = 'posted' order by y.id for update) as z;
    select * into f from public.flocks y where y.org_id = v_org and y.id = v_flock and y.status in ('preparing', 'active') for no key update;
  end if;
  if cardinality(v_locked) > 0 then
    select array_agg(l.item_id order by l.issue_id, l.line_no), array_agg(l.warehouse_id order by l.issue_id, l.line_no) into v_items, v_whs
    from public.flock_issue_lines l where l.org_id = v_org and l.issue_id = any (v_locked);
    perform private.lock_masters(v_whs, v_items, false);
    perform private.lock_balances(v_items, v_whs);
  end if;
  if f.id is not null then
    perform 1 from public.flock_vaccinations m where m.org_id = v_org and m.flock_id = f.id and m.status = 'done' order by m.id for update;
    select coalesce(array_agg(y.id order by y.id), '{}') into v_now from public.flock_issues y where y.org_id = v_org and y.flock_id = f.id and y.status = 'posted';
  end if;

  -- ٢) تحت الأقفال: النسخة، ثمّ البصمة (وصرف جديد بعد قفل الصرف يغيّرها)، ثمّ أوّل منع بسببه وما يُفعل (المنع نفسه الذي يعرضه delete_hall_preview).
  if p_expected_version is null or h.version <> p_expected_version then
    raise exception 'stale_hall' using hint = format('تغيّرت القاعة «%s» من جهاز آخر بعد فتح النافذة. حدّث الشاشة ثمّ احذفها.', h.name);
  end if;
  if p_expected_plan is null or p_expected_plan is distinct from private.delete_hall_plan(h, f) or v_now is distinct from v_locked then
    raise exception 'stale_plan' using hint = 'تغيّر ما في القاعة بعد فتح النافذة. راجع ما سيُحذف ثمّ احذف.';
  end if;
  v_block := private.delete_hall_blocks(h, f) -> 0;
  if v_block ->> 'code' = 'permission' then
    raise exception 'forbidden' using hint = coalesce(v_block ->> 'text', 'لا تملك حذف هذه القاعة.');
  elsif v_block ->> 'code' = 'sales' then
    raise exception 'hall_has_sales' using hint = coalesce(v_block ->> 'text', 'في الفوج بيع طيور؛ ألغِ الفاتورة أوّلاً ثمّ احذف القاعة.');
  elsif v_block ->> 'code' = 'tickets' then
    raise exception 'hall_has_tickets' using hint = coalesce(v_block ->> 'text', 'في الفوج تذكرة وزن؛ ألغِ التذكرة أوّلاً ثمّ احذف القاعة.');
  elsif v_block ->> 'code' = 'carry' then
    raise exception 'hall_has_carry' using hint = coalesce(v_block ->> 'text', 'في القاعة علف منقول بين دورتين؛ عالجه أوّلاً ثمّ احذف القاعة.');
  elsif v_block ->> 'code' = 'period_locked' then
    raise exception 'period_locked' using hint = coalesce(v_block ->> 'text', 'الحسابات مقفلة على أيّام الفوج؛ اطلب من مالك المنشأة فتح الفترة ثمّ احذف القاعة.');
  elsif v_block ->> 'code' = 'revalued' then
    raise exception 'lot_consumed' using hint = coalesce(v_block ->> 'text', 'أُرسل إلى الفوج قبل تصحيح سعره؛ ألغِ التصحيح أوّلاً ثمّ احذف القاعة.');
  elsif v_block ->> 'code' = 'counted' then
    raise exception 'count_superseded' using hint = coalesce(v_block ->> 'text', 'أُرسل إلى الفوج قبل جرد مخزنه؛ ألغِ الجرد أوّلاً ثمّ احذف القاعة.');
  elsif v_block is not null then
    raise exception 'forbidden' using hint = 'تعذّر حذف القاعة. حدّث الشاشة وراجع ما يمنع الحذف.';
  end if;
  if cardinality(v_locked) > 0 then
    perform private.require('void');
  end if;

  -- ٣) الكتابة بيوم اليوم، وما يرجع إلى المخازن قبلها: التأشيرات أوّلاً (حارس الصرف يمنع إلغاء صرف تحت تأشير «تمّ»)، ثمّ الصرف بالنواة المشتركة مع
  --    void_flock_issue، ثمّ الفوج ملغى، ثمّ القاعة مؤرشفة. الجولات والزيارات والغاز والأوزان والأدوية والعدّ تبقى صفوفاً يخفيها إلغاء الفوج.
  v_back := private.delete_hall_back(f);
  v_reason := format('حُذفت القاعة «%s»', btrim(h.name));
  if f.id is not null then
    update public.flock_vaccinations m set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
    where m.org_id = v_org and m.flock_id = f.id and m.status = 'done';
    for x in select y.* from public.flock_issues y where y.org_id = v_org and y.id = any (v_locked) order by y.issued_on, y.doc_no collate "C", y.id loop
      perform private.flock_issue_reverse(x, v_reason);
      v_voided := v_voided + 1;
    end loop;
    update public.flocks y set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason, version = y.version + 1
    where y.org_id = v_org and y.id = f.id;
  end if;
  update public.halls y set archived_at = now(), version = y.version + 1 where y.org_id = v_org and y.id = h.id;
  return private.ref_store(v_fn, p_client_ref, jsonb_build_object('hall_id', h.id, 'name', h.name, 'deleted', true, 'already', false,
    'flock_id', f.id, 'voided_issues', v_voided, 'back', v_back));
end
$$;

-- ─── ز. الثوابت (مفتاح الخادم) ───────────────────────────────────────────────────────────────────────────────────────
-- الجسم الأخير من 0035، والوجبة الملغاة خارج المقارنة.
create or replace function public.verify_hall_sheet() returns table (check_name text, violations bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_totals bigint := 0;
  v_days bigint := 0;
  v_fcr bigint := 0;
  v_org record;
  v_user uuid;
  v_flock record;
  v_s jsonb;
begin
  return query
  select 'for_day_range'::text, count(*) from public.flock_issues x
  join public.flocks f on f.org_id = x.org_id and f.id = x.flock_id
  where x.for_day is not null and (f.placed_on is null or x.for_day < f.placed_on or x.for_day > x.issued_on)
  union all
  select 'gas_days', count(*) from public.flock_day_gas g
  join public.flocks f on f.org_id = g.org_id and f.id = g.flock_id
  where g.cylinders is not null and (f.placed_on is null or g.on_date < f.placed_on or (f.closed_on is not null and g.on_date > f.closed_on))
  union all
  select 'gas_versions', count(*) from public.flock_day_gas g where g.version < 1
  union all
  select 'gas_hall', count(*) from public.flock_day_gas g
  join public.flocks f on f.org_id = g.org_id and f.id = g.flock_id
  where (g.hall_id, g.site_id, g.division_id) is distinct from (f.hall_id, f.site_id, f.division_id);

  for v_org in select distinct x.org_id from public.flocks x where x.placed_on is not null order by 1 loop
    select m.user_id into v_user from public.members m
    where m.org_id = v_org.org_id and m.role = 'owner' and m.archived_at is null and m.accepted_at is not null and private.account_live(m.user_id)
    order by m.created_at, m.id limit 1;
    continue when v_user is null;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    -- 0037: الوجبة الملغاة (حُذفت قاعتها) لا ورقة لها (hall_sheet يرفضها flock_void)، فلا تُقارن.
    for v_flock in select x.id, x.kind, x.status from public.flocks x where x.org_id = v_org.org_id and x.placed_on is not null and x.status <> 'void' order by x.id loop
      v_s := null;
      begin
        v_s := public.hall_sheet(v_flock.id);
        v_totals := v_totals + (
          select count(*) from (
            select coalesce(sum((d.j ->> 'dead')::bigint), 0) as dead, coalesce(sum((d.j ->> 'gas')::bigint), 0) as gas,
              coalesce(sum((d.j ->> 'feed_kg')::numeric), 0) as feed_kg, coalesce(sum((d.j ->> 'feed_back_kg')::numeric), 0) as back_kg,
              coalesce(sum((d.j ->> 'sold_birds')::bigint), 0) as sold, coalesce(sum((d.j ->> 'sold_net_kg')::numeric), 0) as sold_kg,
              coalesce(sum((d.j ->> 'eggs_total')::bigint), 0) as eggs
            from jsonb_array_elements(v_s -> 'days') as d(j)
          ) as s
          where (v_s -> 'totals' ->> 'dead')::bigint <> s.dead or (v_s -> 'totals' ->> 'gas')::bigint <> s.gas
            or (v_s -> 'totals' ->> 'feed_kg')::numeric <> s.feed_kg or (v_s -> 'totals' ->> 'feed_back_kg')::numeric <> s.back_kg
            or (v_s -> 'summary' ->> 'feed_net_kg')::numeric <> s.feed_kg - s.back_kg
            or (v_s -> 'totals' ->> 'sold_birds')::bigint <> s.sold
            or (v_s -> 'totals' ->> 'sold_net_kg')::numeric <> s.sold_kg
            or (v_s -> 'totals' ->> 'eggs_total')::bigint is distinct from (case when v_flock.kind = 'layer' then s.eggs end));
        v_days := v_days + (
          select count(*) from (
            select (d.j ->> 'on')::date as on_date, (d.j ->> 'feed_kg')::numeric as kg, (d.j ->> 'feed_back_kg')::numeric as back
            from jsonb_array_elements(v_s -> 'days') as d(j)
          ) as s
          full join (
            select u.on_date, sum(u.kg) filter (where u.side = 'in') as kg, sum(u.kg) filter (where u.side = 'back') as back
            from (
              select o.side, o.on_date, case
                  when o.base_unit = 'kg' then round(o.qty_base, 3)
                  when o.base_unit = 'L' and o.density_kg_per_l > 0 then round(o.qty_base * o.density_kg_per_l, 3)
                  when o.base_unit = 'pc' and o.piece_mass_kg > 0 then round(o.qty_base * o.piece_mass_kg, 3) end as kg
              from (
                select 'in' as side, coalesce(x.for_day, x.issued_on) as on_date, l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg
                from public.flock_issues x join public.flock_issue_lines l on l.org_id = x.org_id and l.issue_id = x.id
                where x.org_id = v_org.org_id and x.flock_id = v_flock.id and x.status = 'posted' and l.cost_kind = 'feed'
                union all
                select 'in', l.applied_on, l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg
                from public.flock_close_lines l
                where l.org_id = v_org.org_id and l.to_flock_id = v_flock.id and l.carry_status = 'applied' and l.cost_kind = 'feed'
                union all
                select 'back', c.closed_on, l.qty_base, l.base_unit, l.density_kg_per_l, l.piece_mass_kg
                from public.flock_closes c join public.flock_close_lines l on l.org_id = c.org_id and l.close_id = c.id
                where c.org_id = v_org.org_id and c.flock_id = v_flock.id and c.status = 'closed' and l.cost_kind = 'feed' and l.action in ('return', 'carry')
              ) as o
            ) as u
            group by u.on_date
          ) as t on t.on_date = s.on_date
          where s.on_date is null or (t.on_date is null and (s.kg is not null or s.back is not null))
            or (t.on_date is not null and (s.kg is distinct from t.kg or s.back is distinct from t.back)));
      exception when others then
        v_totals := v_totals + 1;
      end;
      -- الوجبة المغلقة: معامل التحويل في الورقة = fcr_final في تقرير الدورة (الصافي نفسه وصافي المباع نفسه). الورقة نفسها المقروءة أعلاه (v_s)
      -- لا قراءة ثانية لها، وورقة رمت = خرق كما كانت. ووجبة مغلقة بلا مبيع (لا يوم في flock_count_days بصافٍ موجب، وهو مصدر v_sold_kg في
      -- التقرير وشرط fcr_final فيه) معاملها في التقرير null بتعريفه، فتُقارن الورقة بـnull بلا قراءة التقرير: مئات الدورات المغلقة بلا بيع
      -- كانت تتجاوز مهلة الطلب (8 ثوانٍ).
      if v_flock.status = 'closed' then
        begin
          if v_s is null then
            v_fcr := v_fcr + 1;
          elsif not exists (select 1 from private.flock_count_days(v_flock.id) as k where k.sold_kg > 0) then
            v_fcr := v_fcr + (case when (v_s -> 'summary' ->> 'fcr') is not null then 1 else 0 end);
          else
            v_fcr := v_fcr + (case when (v_s -> 'summary' ->> 'fcr')::numeric
              is distinct from (public.flock_cycle_report(v_flock.id) -> 'kpis' ->> 'fcr_final')::numeric then 1 else 0 end);
          end if;
        exception when others then
          v_fcr := v_fcr + 1;
        end;
      end if;
    end loop;
  end loop;
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  return query select 'sheet_totals'::text, v_totals
    union all select 'sheet_feed_by_day'::text, v_days
    union all select 'sheet_fcr_final'::text, v_fcr;
end
$$;

create or replace function public.verify_delete_hall() returns table (check_name text, violations bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  -- ١) الفوج الملغى (حُذفت قاعته) بلا صرف مرحَّل ولا تأشير «تمّ»: كلّ ما صُرف له رجع، وكلّ تأشير له أُلغي.
  select 'void_flock_posted_issue'::text, count(*) from public.flock_issues x
  join public.flocks f on f.org_id = x.org_id and f.id = x.flock_id
  where f.status = 'void' and x.status = 'posted'
  union all
  select 'void_flock_done_vaccination', count(*) from public.flock_vaccinations m
  join public.flocks f on f.org_id = m.org_id and f.id = m.flock_id
  where f.status = 'void' and m.status = 'done'
  -- ٢) ولا في قاعة فعّالة: القاعة تُحذف (تُؤرشف) مع إلغاء فوجها، ولا تعود من الأرشيف (halls_check).
  union all
  select 'void_flock_live_hall', count(*) from public.flocks f
  join public.halls h on h.org_id = f.org_id and h.id = f.hall_id
  where f.status = 'void' and h.archived_at is null
  -- ٣) ودفتر كلفته صفر: كلّ صفّ كلفة له معكوس بصفّ عكسيّ.
  union all
  select 'void_flock_costs', count(*) from (
    select f.id from public.flocks f
    join public.flock_costs c on c.org_id = f.org_id and c.flock_id = f.id
    where f.status = 'void'
    group by f.id
    having sum(c.amount) <> 0) as z
  -- ٤) وشكل الإلغاء: وقته ومن ألغاه وسببه مع الحالة وحدها، والملغى غير مغلق.
  union all
  select 'void_flock_shape', count(*) from public.flocks f
  where (f.status = 'void') <> (f.voided_at is not null and f.void_reason is not null) or (f.status = 'void' and f.closed_on is not null)
  -- ٥) وما يمنع الحذف لا يبقى على فوج ملغى: فاتورة طيور مرحَّلة (sales)، وتذكرة وزن غير ملغاة (tickets)، وعلف منقول إليه ما زال مطبَّقاً (carry).
  union all
  select 'void_flock_posted_sale', count(*) from public.bird_sales b
  where b.status = 'posted' and exists (select 1 from public.bird_sale_sources s join public.flocks f on f.org_id = s.org_id and f.id = s.flock_id
    where s.org_id = b.org_id and s.sale_id = b.id and f.status = 'void')
  union all
  select 'void_flock_live_ticket', count(*) from public.weigh_tickets t
  where t.status <> 'void' and exists (select 1 from public.weigh_ticket_stops s join public.flocks f on f.org_id = s.org_id and f.id = s.flock_id
    where s.org_id = t.org_id and s.ticket_id = t.id and f.status = 'void')
  union all
  select 'void_flock_applied_carry', count(*) from public.flock_close_lines l
  join public.flocks f on f.org_id = l.org_id and f.id = l.to_flock_id
  where f.status = 'void' and l.carry_status = 'applied'
$$;

-- ─── ح. الصلاحيات ──────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function private.flock_issue_reverse(public.flock_issues, text), private.delete_hall_back(public.flocks),
  private.delete_hall_plan(public.halls, public.flocks), private.delete_hall_blocks(public.halls, public.flocks) from public, anon, authenticated;
revoke all on function public.delete_hall_preview(uuid), public.delete_hall(uuid, int, text, uuid) from public, anon;
grant execute on function public.delete_hall_preview(uuid), public.delete_hall(uuid, int, text, uuid) to authenticated;
revoke all on function public.verify_delete_hall() from public, anon, authenticated;
grant execute on function public.verify_delete_hall() to service_role;
