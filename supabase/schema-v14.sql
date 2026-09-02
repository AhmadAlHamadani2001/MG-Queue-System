-- =========================================================
-- MG Kingdom Queue — v14 schema additions: 3 more digitized forms
-- Run AFTER schema-v13.sql.
--
-- Adds table support to form_templates (many real forms are grids,
-- not just flowing paragraphs) and a "required" flag per field
-- (signature/manager fields are typically filled at physical
-- sign-off time, not by the advisor filling the form digitally).
--
-- Every "Blank" marker in the three uploaded Word documents became
-- exactly one fill-in field below — nothing else in the wording was
-- changed.
-- =========================================================

alter table form_templates add column if not exists tables jsonb not null default '[]';

insert into form_templates (name_en, name_ar, body_template, fields, tables, created_by)
values (
  'Complaint Waiver Form',
  'نموذج تنازل عن الشكوى',
  E'بيانات العميل /

[TABLE:0]

تنازل عن الشكوى رقم /

الارضاء المقدم للعميل – صيانة {{free_service_km}} كلم مجانا

يقوم العميل بتقديم هذا الخطاب لتقديم الخدمة المتفق عليها اعلاه
لا يطالب العميل الشركة بأي مستحقات او تعويضات حاضرا او مستقبلا تخص هذه المطالبة

اسم العميل وتوقيعه :
الاسم/ {{signature_name}}
التوقيع/ {{signature_mark}}',
  '[{"key": "customer_name", "label_en": "Customer name", "label_ar": "اسم العميل", "type": "text", "required": true}, {"key": "vehicle_type", "label_en": "Vehicle type", "label_ar": "نوع السيارة", "type": "text", "required": true}, {"key": "plate_number", "label_en": "Plate number", "label_ar": "رقم اللوحة", "type": "text", "required": true}, {"key": "vin_number", "label_en": "Chassis number (VIN)", "label_ar": "رقم الهيكل", "type": "text", "required": true}, {"key": "work_card_number", "label_en": "Work card number", "label_ar": "رقم كرت العمل", "type": "text", "required": true}, {"key": "residency_status", "label_en": "Nationality / residency", "label_ar": "احوال / اقامة", "type": "text", "required": false}, {"key": "mobile_number", "label_en": "Mobile number", "label_ar": "رقم الجوال", "type": "text", "required": true}, {"key": "free_service_km", "label_en": "Free service (km)", "label_ar": "كلم صيانة مجانية", "type": "text", "required": true}, {"key": "signature_name", "label_en": "Name (signature)", "label_ar": "الاسم (التوقيع)", "type": "text", "required": false}, {"key": "signature_mark", "label_en": "Signature", "label_ar": "التوقيع", "type": "text", "required": false}]'::jsonb,
  '[[["اسم العميل :", "{{customer_name}}", "نوع السيارة :", "{{vehicle_type}}"], ["رقم اللوحة :", "{{plate_number}}", "رقم الهيكل :", "{{vin_number}}"], ["رقم كرت العمل :", "{{work_card_number}}", "احوال/ اقامه :", "{{residency_status}}"], ["رقم الجوال :", "{{mobile_number}}"]]]'::jsonb,
  'system'
) on conflict do nothing;

insert into form_templates (name_en, name_ar, body_template, fields, tables, created_by)
values (
  'Repair Request Agreement — Customer Satisfaction',
  'اتفاقية طلب للاصلاح على بند إرضاء العملاء',
  E'هذه اتفاقيه رفع طلب اصلاح علي بند ارضاء العميل بناء علي الملاحظات التاليه :

[TABLE:0]

بعد الفحص والمعاينة الفنية للمركبة الموضّحة بياناتها أعلاه، تبيّن وجود ملاحظات وأعطال لا تتوافق مع شروط وأحكام الضمان المعتمد، ولا مع تعليمات وتوصيات الاستخدام الصادرة من المصنع أو الشركة الأم، والمبيّنة في كتيّب المالك وكتيّب الضمان، وعليه تُعد المركبة خارج نطاق التغطية الضمانية.
وبناءً على ذلك، سيتم ودون أي التزام قانوني أو تعاقدي رفع مطالبة داخلية تحت بند إرضاء العميل لطلب دراسة إمكانية الإصلاح. ويقرّ العميل علمه بأن هذا الإجراء تقديري بالكامل ويخضع للسياسات الداخلية للشركة، وحيثيات الحالة الفنية للمركبة، وتكلفة الإصلاح، وأن قبول أو رفض المطالبة يعود للشركة وحدها دون أدنى مسؤولية.
وفي حال موافقة الشركة على الإصلاح ضمن بند إرضاء العميل، يقرّ العميل بإمكانية تحمّله جزءًا من تكاليف الإصلاح أو كاملها، وفق ما تقرره الشركة، ولا يتم البدء بأي أعمال إصلاح إلا بعد إبلاغ العميل بالتكاليف وأخذ موافقته الخطية الصريحة.
وفي حال رفض الشركة الإصلاح ضمن بند إرضاء العميل، يتم إشعار العميل بتكلفة الإصلاح النقدي، ولا يتم تنفيذ أي أعمال إصلاح إلا بعد موافقة خطية لاحقة من العميل. وفي حال رفض العميل الإصلاح النقدي، يلتزم بسداد رسوم الفحص والكشف والتشخيص والتحليل إن وجدت.
ويقرّ العميل بأنه اعتبارًا من تاريخ دخول المركبة إلى المركز بتاريخ 01/01/2026، وخلال فترة الفحص ورفع المطالبة ودراسة الحالة، لا يحق له المطالبة بمركبة بديلة أو تعويض مادي أو أي مطالبات ناتجة عن توقف المركبة عن الاستخدام طوال فترة تواجدها داخل المركز وحتى استلامها.
كما يقرّ العميل ويوافق على أن الشركة غير مسؤولة عن أي أضرار مباشرة أو غير مباشرة، أو خسائر مادية أو معنوية، أو تأخير في التسليم، ناتجة عن العطل القائم أو عن إجراءات الفحص أو الإصلاح أو انتظار الموافقات، أو عن أي أسباب خارجة عن إرادة الشركة، بما في ذلك توفر قطع الغيار أو موافقات الجهات المعنية.
ويحق للشركة، في حال اكتشاف أعطال إضافية أو تغيّر نطاق أو تكلفة الإصلاح أثناء الفحص أو التفكيك، إيقاف الإجراءات وإعادة تسعير الإصلاح وأخذ موافقة جديدة من العميل، دون أن يترتب عليها أي التزام بإكمال الإصلاح.
كما يقرّ العميل بأن أي موافقة محتملة على الإصلاح ضمن بند إرضاء العميل لا تُعد سابقة، ولا يترتب عليها أي التزام مستقبلي على الشركة، ولا يجوز الاستناد إليها في أي مطالبات لاحقة تخص نفس المركبة أو مركبات أخرى.
وفي حال الانتهاء من الإصلاح أو رفضه، يلتزم العميل باستلام مركبته خلال المدة التي تحددها الشركة، ويحق للشركة تحميل العميل رسوم تخزين أو أي تبعات نظامية في حال التأخير عن الاستلام، مع إخلاء مسؤوليتها عن المركبة بعد إشعار العميل.
ويُعد توقيع العميل على هذا المستند إقرارًا بالعلم والموافقة على بدء الإجراءات فقط، ولا يُعد بأي حال من الأحوال التزامًا على الشركة بإصلاح المركبة، حيث تبقى المطالبة خاضعة للقبول أو الرفض وفق تقدير الشركة وحدها.
وعلي هذا يكون العميل غير مؤهل للحصول على سيارة بديلة أو تعويض مادي من فتره دخول المركبه بتاريخ 01/01/2026 الي التاريخ الانتهاء من الاصلاح واستلام المركبة.

[TABLE:1]

اسم العميل:  {{customer_name_sig}}          اسم مدير الصيانة: {{service_manager_name}}
التاريخ:  {{date_customer_sign}}          التاريخ : {{date_manager_sign}}
توقيع العميل:  {{customer_signature}}          توقيع مدير الفرع : {{branch_manager_signature}}',
  '[{"key": "approval_status", "label_en": "Approved", "label_ar": "الموافـق", "type": "text", "required": false}, {"key": "form_date", "label_en": "Date", "label_ar": "التاريـخ", "type": "date", "required": false}, {"key": "id_number", "label_en": "ID number", "label_ar": "رقم الهوية", "type": "text", "required": true}, {"key": "customer_name_table", "label_en": "Customer name", "label_ar": "اسم العميل", "type": "text", "required": true}, {"key": "email", "label_en": "Email", "label_ar": "البريد الالكتروني", "type": "text", "required": false}, {"key": "mobile_number", "label_en": "Mobile number", "label_ar": "رقم الجوال", "type": "text", "required": true}, {"key": "manufacture_year", "label_en": "Manufacture year", "label_ar": "سنة الصنع", "type": "text", "required": false}, {"key": "vehicle_model", "label_en": "Vehicle model", "label_ar": "موديل السيارة", "type": "text", "required": true}, {"key": "vin_number", "label_en": "Chassis number (VIN)", "label_ar": "رقم الهيكل", "type": "text", "required": true}, {"key": "plate_number", "label_en": "Plate number", "label_ar": "رقم اللوحة", "type": "text", "required": true}, {"key": "service_provider_name", "label_en": "Service advisor name", "label_ar": "أسم مقدم الخدمة", "type": "text", "required": false}, {"key": "card_number", "label_en": "Card number", "label_ar": "رقم الكرت", "type": "text", "required": false}, {"key": "entry_date", "label_en": "Vehicle entry date", "label_ar": "تاريخ الدخول", "type": "date", "required": true}, {"key": "odometer_reading", "label_en": "Odometer reading", "label_ar": "قراءة عداد الكيلومتر", "type": "text", "required": false}, {"key": "company_percentage", "label_en": "Company share (%)", "label_ar": "نسبة الشركة %", "type": "number", "required": false}, {"key": "customer_percentage", "label_en": "Customer share (%)", "label_ar": "نسبة العميل %", "type": "number", "required": false}, {"key": "submission_date", "label_en": "Request submission date", "label_ar": "تاريخ رفع الطلب", "type": "date", "required": false}, {"key": "customer_name_sig", "label_en": "Customer name (signature)", "label_ar": "اسم العميل (توقيع)", "type": "text", "required": false}, {"key": "service_manager_name", "label_en": "Service manager name", "label_ar": "اسم مدير الصيانة", "type": "text", "required": false}, {"key": "date_customer_sign", "label_en": "Date (customer)", "label_ar": "التاريخ (العميل)", "type": "date", "required": false}, {"key": "date_manager_sign", "label_en": "Date (manager)", "label_ar": "التاريخ (المدير)", "type": "date", "required": false}, {"key": "customer_signature", "label_en": "Customer signature", "label_ar": "توقيع العميل", "type": "text", "required": false}, {"key": "branch_manager_signature", "label_en": "Branch manager signature", "label_ar": "توقيع مدير الفرع", "type": "text", "required": false}, {"key": "finding_1_notes", "label_en": "Finding 1 — notes", "label_ar": "ملاحظة 1", "type": "text", "required": false}, {"key": "finding_1_date", "label_en": "Finding 1 — inspection date", "label_ar": "تاريخ الكشف 1", "type": "date", "required": false}, {"key": "finding_2_notes", "label_en": "Finding 2 — notes", "label_ar": "ملاحظة 2", "type": "text", "required": false}, {"key": "finding_2_date", "label_en": "Finding 2 — inspection date", "label_ar": "تاريخ الكشف 2", "type": "date", "required": false}, {"key": "finding_3_notes", "label_en": "Finding 3 — notes", "label_ar": "ملاحظة 3", "type": "text", "required": false}, {"key": "finding_3_date", "label_en": "Finding 3 — inspection date", "label_ar": "تاريخ الكشف 3", "type": "date", "required": false}, {"key": "finding_4_notes", "label_en": "Finding 4 — notes", "label_ar": "ملاحظة 4", "type": "text", "required": false}, {"key": "finding_4_date", "label_en": "Finding 4 — inspection date", "label_ar": "تاريخ الكشف 4", "type": "date", "required": false}, {"key": "finding_5_notes", "label_en": "Finding 5 — notes", "label_ar": "ملاحظة 5", "type": "text", "required": false}, {"key": "finding_5_date", "label_en": "Finding 5 — inspection date", "label_ar": "تاريخ الكشف 5", "type": "date", "required": false}, {"key": "finding_6_notes", "label_en": "Finding 6 — notes", "label_ar": "ملاحظة 6", "type": "text", "required": false}, {"key": "finding_6_date", "label_en": "Finding 6 — inspection date", "label_ar": "تاريخ الكشف 6", "type": "date", "required": false}]'::jsonb,
  '[[["الموافـق", "{{approval_status}}", "التاريـخ", "{{form_date}}"], ["رقم الهوية", "{{id_number}}", "اسم العميل", "{{customer_name_table}}"], ["البريد الالكتروني", "{{email}}", "رقم الجوال", "{{mobile_number}}"], ["بيانات المركبة"], ["سنة الصنع", "{{manufacture_year}}", "موديل السيارة", "{{vehicle_model}}"], ["رقم الهيكل", "{{vin_number}}", "رقم اللوحة", "{{plate_number}}"], ["أسم مقدم الخدمة", "{{service_provider_name}}", "رقم الكرت", "{{card_number}}"], ["تاريخ الدخول :", "{{entry_date}}"], ["آخر قراءة لعداد الكيلومتر:", "{{odometer_reading}}"], ["نسبة الشركة :", "{{company_percentage}}", "%", "نسبة العميل :", "{{customer_percentage}}", "%", "تاريخ رفع الطلب :", "{{submission_date}}"]], [["#", "الملاحظات", "تاريخ الكشف"], ["1", "{{finding_1_notes}}", "{{finding_1_date}}"], ["2", "{{finding_2_notes}}", "{{finding_2_date}}"], ["3", "{{finding_3_notes}}", "{{finding_3_date}}"], ["4", "{{finding_4_notes}}", "{{finding_4_date}}"], ["5", "{{finding_5_notes}}", "{{finding_5_date}}"], ["6", "{{finding_6_notes}}", "{{finding_6_date}}"]]]'::jsonb,
  'system'
) on conflict do nothing;

insert into form_templates (name_en, name_ar, body_template, fields, tables, created_by)
values (
  'Customer Satisfaction Discount Form',
  'استمارة خصم لإرضاء العملاء',
  E'هذا تم عمل خصم ارضاء لكم عن تأخير قطع الغيار خصم {{parts_discount}} على قطع الغيار و خصم {{labor_discount}} على الاجور على الصيانة القادمة {{km_validity}} كيلو متر

[TABLE:0]

اسم العميل: {{customer_name}}

توقيع العميل: {{customer_signature}}

توقيع مدير الفرع : {{branch_manager_signature}}

تطبق الشروط والأحكام حسب سياسات الشركة الصانعة',
  '[{"key": "parts_discount", "label_en": "Parts discount (%)", "label_ar": "خصم على قطع الغيار", "type": "text", "required": true}, {"key": "labor_discount", "label_en": "Labor discount (%)", "label_ar": "خصم على الأجور", "type": "text", "required": true}, {"key": "km_validity", "label_en": "Valid for next service (km)", "label_ar": "صالح للصيانة القادمة (كم)", "type": "text", "required": true}, {"key": "approval_status", "label_en": "Approved", "label_ar": "الموافـق", "type": "text", "required": false}, {"key": "form_date", "label_en": "Date", "label_ar": "التاريـخ", "type": "date", "required": false}, {"key": "id_number", "label_en": "ID number", "label_ar": "رقم الهوية", "type": "text", "required": false}, {"key": "customer_name_table", "label_en": "Customer name", "label_ar": "اسم العميل", "type": "text", "required": true}, {"key": "email", "label_en": "Email", "label_ar": "البريد الالكتروني", "type": "text", "required": false}, {"key": "mobile_number", "label_en": "Mobile number", "label_ar": "رقم الجوال", "type": "text", "required": true}, {"key": "manufacture_year", "label_en": "Manufacture year", "label_ar": "سنة الصنع", "type": "text", "required": false}, {"key": "vehicle_model", "label_en": "Vehicle model", "label_ar": "موديل السيارة", "type": "text", "required": true}, {"key": "vin_number", "label_en": "Chassis number (VIN)", "label_ar": "رقم الهيكل", "type": "text", "required": true}, {"key": "plate_number", "label_en": "Plate number", "label_ar": "رقم اللوحة", "type": "text", "required": true}, {"key": "customer_name", "label_en": "Customer name", "label_ar": "اسم العميل", "type": "text", "required": true}, {"key": "customer_signature", "label_en": "Customer signature", "label_ar": "توقيع العميل", "type": "text", "required": false}, {"key": "branch_manager_signature", "label_en": "Branch manager signature", "label_ar": "توقيع مدير الفرع", "type": "text", "required": false}]'::jsonb,
  '[[["الموافـق", "{{approval_status}}", "التاريـخ", "{{form_date}}"], ["رقم الهوية", "{{id_number}}", "اسم العميل", "{{customer_name_table}}"], ["البريد الالكتروني", "{{email}}", "رقم الجوال", "{{mobile_number}}"], ["بيانات السيارة"], ["سنة الصنع", "{{manufacture_year}}", "موديل السيارة", "{{vehicle_model}}"], ["رقم الهيكل", "{{vin_number}}", "رقم اللوحة", "{{plate_number}}"], ["تاريخ الدخول :"], ["آخر قراءة لعداد الكيلومتر عند تسجيل الشكوى (كيلومتر)"]]]'::jsonb,
  'system'
) on conflict do nothing;
