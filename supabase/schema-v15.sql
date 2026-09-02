-- =========================================================
-- MG Kingdom Queue — v15 schema additions
-- Run AFTER schema-v14.sql.
--
-- Replaces the earlier table-heavy digitization of the Complaint
-- Waiver Form with a clean, from-scratch design built directly from
-- a plain field list + terms + signature spec (rather than mirroring
-- the original Word document's grid layout cell-for-cell).
-- =========================================================

update form_templates
set
  body_template = E'[TABLE:0]

الشروط والأحكام

• يقوم العميل بتقديم هذا الخطاب لتقديم الخدمة المتفق عليها اعلاه
• لا يطالب العميل الشركة بأي مستحقات او تعويضات حاضرا او مستقبلا تخص هذه المطالبة

اسم العميل: {{customer_name}}
توقيع العميل: .......................................',
  fields = '[{"key": "complaint_number", "label_en": "Complaint waiver number", "label_ar": "تنازل عن شكوى رقم", "type": "text", "required": true}, {"key": "customer_name", "label_en": "Customer name", "label_ar": "اسم العميل", "type": "text", "required": true}, {"key": "id_or_residency", "label_en": "ID or residency number", "label_ar": "رقم الهوية أو الاقامة", "type": "text", "required": true}, {"key": "mobile_number", "label_en": "Mobile number", "label_ar": "رقم الجوال", "type": "text", "required": true}, {"key": "work_order_number", "label_en": "Work order number", "label_ar": "رقم امر العمل", "type": "text", "required": true}, {"key": "vin_number", "label_en": "Chassis number (VIN)", "label_ar": "رقم الهيكل", "type": "text", "required": true}, {"key": "plate_number", "label_en": "Plate number", "label_ar": "رقم اللوحة", "type": "text", "required": true}, {"key": "free_service_description", "label_en": "Free maintenance offered as goodwill", "label_ar": "الصيانة المجانية المقدمة لارضاء العميل", "type": "text", "required": true}]'::jsonb,
  tables = '[[["تنازل عن شكوى رقم", "{{complaint_number}}"], ["اسم العميل", "{{customer_name}}"], ["رقم الهوية أو الاقامة", "{{id_or_residency}}"], ["رقم الجوال", "{{mobile_number}}"], ["رقم امر العمل", "{{work_order_number}}"], ["رقم الهيكل", "{{vin_number}}"], ["رقم اللوحة", "{{plate_number}}"], ["الصيانة المجانية المقدمة لارضاء العميل", "{{free_service_description}}"]]]'::jsonb
where name_ar = 'نموذج تنازل عن الشكوى';
