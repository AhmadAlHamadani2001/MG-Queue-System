-- =========================================================
-- MG Kingdom Queue — v13 schema additions: Forms module
-- Run AFTER schema-v12.sql.
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------- FORM TEMPLATES (admin-managed) ----------
create table if not exists form_templates (
    id            uuid primary key default gen_random_uuid(),
    name_en       text not null,
    name_ar       text not null,
    body_template text not null,
    fields        jsonb not null default '[]',
    active        boolean not null default true,
    created_by    text,
    created_at    timestamptz not null default now()
);

-- ---------- FORM SUBMISSIONS ----------
create table if not exists form_submissions (
    id           uuid primary key default gen_random_uuid(),
    template_id  uuid not null references form_templates(id),
    branch       text,
    created_by   text not null,
    data         jsonb not null default '{}',
    created_at   timestamptz not null default now()
);

create index if not exists idx_form_submissions_template on form_submissions(template_id, created_at);
create index if not exists idx_form_submissions_branch on form_submissions(branch, created_at);

-- ---------- RLS ----------
alter table form_templates enable row level security;
alter table form_submissions enable row level security;

drop policy if exists "public read form templates" on form_templates;
create policy "public read form templates" on form_templates for select using (true);
drop policy if exists "public insert form templates" on form_templates;
create policy "public insert form templates" on form_templates for insert with check (true);
drop policy if exists "public update form templates" on form_templates;
create policy "public update form templates" on form_templates for update using (true);
drop policy if exists "public delete form templates" on form_templates;
create policy "public delete form templates" on form_templates for delete using (true);

drop policy if exists "public read form submissions" on form_submissions;
create policy "public read form submissions" on form_submissions for select using (true);
drop policy if exists "public insert form submissions" on form_submissions;
create policy "public insert form submissions" on form_submissions for insert with check (true);

-- ---------- SEED: Customer Satisfaction Agreement (from the uploaded Word form) ----------
-- Wording preserved exactly — only the variable data points become
-- fill-in fields (discount %, card number, day count, date, VIN,
-- mobile, vehicle type, customer name).
insert into form_templates (name_en, name_ar, body_template, fields, created_by)
values (
  'Customer Satisfaction Agreement',
  'إستمارة ارضاء عميل',
  E'حرصًا منا على رضاكم وتقديرًا لتعاونكم معنا، سيتم تقديم خصم على قطع الغيار إرضاءً لكم وتعزيزًا لعلاقتنا المستمرة بنسبة {{discount_percent}}% على كافة القطع المضافة على رقم الكرت التالي : {{card_number}} وبهذا سيتم توفير قطع الغيار خلال {{days_count}} أيام ابتدأ من تاريخ اليوم الموافق {{agreement_date}}.\n\nرقم هيكل المركبة : {{vin_number}}\nرقم جوال العميل : {{customer_mobile}}\nنوع المركبة : {{vehicle_type}}\n\nاسم العميل: {{customer_name}}\nتوقيع العميل: -----------------------\nتوقيع مدير الفرع : .....................................',
  '[
    {"key":"discount_percent","label_en":"Discount percentage","label_ar":"نسبة الخصم","type":"number"},
    {"key":"card_number","label_en":"Card number","label_ar":"رقم الكرت","type":"text"},
    {"key":"days_count","label_en":"Number of days","label_ar":"عدد الأيام","type":"number"},
    {"key":"agreement_date","label_en":"Agreement date","label_ar":"تاريخ الاتفاقية","type":"date"},
    {"key":"vin_number","label_en":"Vehicle chassis number (VIN)","label_ar":"رقم هيكل المركبة","type":"text"},
    {"key":"customer_mobile","label_en":"Customer mobile","label_ar":"رقم جوال العميل","type":"text"},
    {"key":"vehicle_type","label_en":"Vehicle type","label_ar":"نوع المركبة","type":"text"},
    {"key":"customer_name","label_en":"Customer name","label_ar":"اسم العميل","type":"text"}
  ]'::jsonb,
  'system'
)
on conflict do nothing;
