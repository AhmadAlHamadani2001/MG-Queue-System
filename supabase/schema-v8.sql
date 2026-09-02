-- =========================================================
-- MG Kingdom Queue — v8 schema additions
-- Run AFTER schema-v7.sql.
-- Adds the remaining real branch locations from Employees.xlsx
-- (previously only JED-01/Hiraa, RUH-01/North, DMM-01/Khaldiah
-- existed). Each gets its own /branch/<code> customer link and its
-- own /advisor/<code> dashboard — queue_tickets.branch_id already
-- scopes customers to their own branch's queue only, so simply
-- existing as a row here is what makes that true for these too.
-- =========================================================

insert into branches (code, name_en, name_ar, status, employee_branch)
values
  ('JED-NAKHEEL',     'Jeddah — Nakheel',        'جدة – النخيل',             'open', 'Nakheel'),
  ('JED-MADINAHRD',   'Jeddah — Madinah Road',   'جدة – طريق المدينة',       'open', 'Madinah Road'),
  ('JED-HQ',          'Jeddah — Head Office',    'جدة – المكتب الرئيسي',     'open', 'Head Office'),
  ('RUH-ALSALIH',     'Riyadh — Alsalih',        'الرياض – الصالح',          'open', 'Alsalih'),
  ('RUH-KHURAIS',     'Riyadh — Khurais',        'الرياض – الخريص',          'open', 'Khurais'),
  ('ABHA-KINGFAHAD',  'Abha — King Fahad',       'أبها – الملك فهد',         'open', 'King Fahad'),
  ('MED-AIRPORTRD',   'Madinah — Airport Road',  'المدينة المنورة – طريق المطار', 'open', 'Airport Road'),
  ('QASSIM-BURAIDAH', 'Qassim — Buraidah',       'القصيم – بريدة',           'open', 'Buraidah'),
  ('JIZAN-ALSAFA',    'Jizan — Alsafa',          'جازان – الصفا',            'open', 'Alsafa')
on conflict (code) do nothing;

-- Note: Arabic branch labels are best-effort machine transliterations,
-- not verified translations — worth a native-speaker review before
-- these go in front of real customers.
