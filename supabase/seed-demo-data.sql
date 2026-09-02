-- =========================================================
-- MG Kingdom Queue — demo data seeder
-- Run AFTER schema.sql, in Supabase Studio → SQL Editor.
-- Safe to re-run any time: it clears existing tickets first
-- and generates a fresh, realistic spread across all three
-- seeded branches (JED-01, RUH-01, DMM-01) and every status
-- (waiting, called, in_service, completed, no_show, cancelled).
-- =========================================================

truncate table queue_tickets;

-- ---------- JEDDAH — TAHLIA (JED-01) ----------
with b as (select id from branches where code = 'JED-01')
insert into queue_tickets
  (branch_id, customer_name, mobile, service_mode, wip_service_type, status,
   advisor_name, queue_entry_at, served_at, closed_at)
select b.id, v.customer_name, v.mobile, v.service_mode, v.wip_service_type, v.status,
       v.advisor_name, now() + v.entry_offset, 
       case when v.served_offset is null then null else now() + v.served_offset end,
       case when v.closed_offset is null then null else now() + v.closed_offset end
from b, (values
  -- waiting
  ('Abdullah Al-Shehri',  '+966501112201', 'walk_in',     null,               'waiting',   null,                  interval '-4 minutes',  null,                    null),
  ('Sara Al-Qahtani',     '+966502223302', 'walk_in',     null,               'waiting',   null,                  interval '-9 minutes',  null,                    null),
  ('Mohammed Al-Harbi',   '+966503334403', 'appointment', 'general_repair',   'waiting',   null,                  interval '-11 minutes', null,                    null),
  ('Khalid Al-Mutairi',   '+966504445504', 'walk_in',     null,               'waiting',   null,                  interval '-17 minutes', null,                    null),
  ('Norah Al-Dosari',     '+966505556605', 'appointment', 'vehicle_delivery', 'waiting',   null,                  interval '-2 minutes',  null,                    null),
  -- called / in service
  ('Faisal Al-Otaibi',    '+966506667706', 'appointment', 'quick_service',    'called',    'Faisal Al-Otaibi',    interval '-22 minutes', interval '-1 minutes',   null),
  ('Layla Al-Ghamdi',     '+966507778807', 'walk_in',     null,               'in_service','Omar Al-Zahrani',     interval '-38 minutes', interval '-14 minutes',  null),
  -- completed today
  ('Turki Al-Anazi',      '+966508889908', 'walk_in',     null,               'completed', 'Faisal Al-Otaibi',    interval '-3 hours',    interval '-2 hours 45 minutes', interval '-2 hours 10 minutes'),
  ('Reem Al-Subaie',      '+966509990009', 'appointment', 'general_repair',   'completed', 'Omar Al-Zahrani',     interval '-4 hours',    interval '-3 hours 50 minutes', interval '-3 hours 5 minutes'),
  ('Bandar Al-Shammari',  '+966500001110', 'appointment', 'quick_service',    'completed', 'Faisal Al-Otaibi',    interval '-5 hours',    interval '-4 hours 40 minutes', interval '-4 hours 20 minutes'),
  ('Hind Al-Amri',        '+966500002220', 'walk_in',     null,               'completed', 'Omar Al-Zahrani',     interval '-6 hours',    interval '-5 hours 35 minutes', interval '-5 hours 5 minutes'),
  -- no-show / cancelled
  ('Yousef Al-Rashidi',   '+966500003330', 'appointment', 'general_repair',   'no_show',   null,                  interval '-5 hours 30 minutes', null,            null),
  ('Aisha Al-Malki',      '+966500004440', 'walk_in',     null,               'cancelled', null,                  interval '-1 hour',    null,                    null)
) as v(customer_name, mobile, service_mode, wip_service_type, status, advisor_name, entry_offset, served_offset, closed_offset);

-- ---------- RIYADH — OLAYA (RUH-01) ----------
with b as (select id from branches where code = 'RUH-01')
insert into queue_tickets
  (branch_id, customer_name, mobile, service_mode, wip_service_type, status,
   advisor_name, queue_entry_at, served_at, closed_at)
select b.id, v.customer_name, v.mobile, v.service_mode, v.wip_service_type, v.status,
       v.advisor_name, now() + v.entry_offset,
       case when v.served_offset is null then null else now() + v.served_offset end,
       case when v.closed_offset is null then null else now() + v.closed_offset end
from b, (values
  ('Ahmed Al-Qarni',      '+966511112201', 'walk_in',     null,               'waiting',   null,                  interval '-3 minutes',  null,                    null),
  ('Maha Al-Harthi',      '+966512223302', 'appointment', 'quick_service',    'waiting',   null,                  interval '-7 minutes',  null,                    null),
  ('Saud Al-Dawsari',     '+966513334403', 'walk_in',     null,               'waiting',   null,                  interval '-15 minutes', null,                    null),
  ('Ghadah Al-Zahrani',   '+966514445504', 'appointment', 'general_repair',   'waiting',   null,                  interval '-19 minutes', null,                    null),
  ('Fahad Al-Otaibi',     '+966515556605', 'walk_in',     null,               'waiting',   null,                  interval '-24 minutes', null,                    null),
  ('Nawaf Al-Ruwaili',    '+966516667706', 'walk_in',     null,               'waiting',   null,                  interval '-6 minutes',  null,                    null),
  ('Dalal Al-Shehri',     '+966517778807', 'appointment', 'vehicle_delivery', 'called',    'Huda Al-Enezi',       interval '-31 minutes', interval '-2 minutes',   null),
  ('Meshari Al-Enezi',    '+966518889908', 'walk_in',     null,               'in_service','Naif Al-Qahtani',     interval '-52 minutes', interval '-20 minutes',  null),
  ('Amal Al-Ghamdi',      '+966519990009', 'appointment', 'general_repair',   'in_service','Huda Al-Enezi',       interval '-45 minutes', interval '-18 minutes',  null),
  ('Rakan Al-Mansour',    '+966510001110', 'walk_in',     null,               'completed', 'Naif Al-Qahtani',     interval '-3 hours 30 minutes', interval '-3 hours 10 minutes', interval '-2 hours 35 minutes'),
  ('Jawaher Al-Tamimi',   '+966510002220', 'appointment', 'quick_service',    'completed', 'Huda Al-Enezi',       interval '-5 hours',    interval '-4 hours 45 minutes', interval '-4 hours 15 minutes'),
  ('Salman Al-Harbi',     '+966510003330', 'walk_in',     null,               'completed', 'Naif Al-Qahtani',     interval '-6 hours 20 minutes', interval '-6 hours', interval '-5 hours 20 minutes'),
  ('Wafa Al-Balawi',      '+966510004440', 'appointment', 'general_repair',   'no_show',   null,                  interval '-7 hours',    null,                    null)
) as v(customer_name, mobile, service_mode, wip_service_type, status, advisor_name, entry_offset, served_offset, closed_offset);

-- ---------- DAMMAM — CORNICHE (DMM-01) ----------
with b as (select id from branches where code = 'DMM-01')
insert into queue_tickets
  (branch_id, customer_name, mobile, service_mode, wip_service_type, status,
   advisor_name, queue_entry_at, served_at, closed_at)
select b.id, v.customer_name, v.mobile, v.service_mode, v.wip_service_type, v.status,
       v.advisor_name, now() + v.entry_offset,
       case when v.served_offset is null then null else now() + v.served_offset end,
       case when v.closed_offset is null then null else now() + v.closed_offset end
from b, (values
  ('Talal Al-Juhani',     '+966521112201', 'walk_in',     null,               'waiting',   null,                  interval '-5 minutes',  null,                    null),
  ('Areej Al-Ahmadi',     '+966522223302', 'appointment', 'vehicle_delivery', 'waiting',   null,                  interval '-8 minutes',  null,                    null),
  ('Sultan Al-Zahrani',   '+966523334403', 'walk_in',     null,               'waiting',   null,                  interval '-13 minutes', null,                    null),
  ('Lama Al-Otaibi',      '+966524445504', 'walk_in',     null,               'called',    'Mansour Al-Dosari',   interval '-20 minutes',  interval '-3 minutes',   null),
  ('Abdulaziz Al-Qahtani','+966525556605', 'appointment', 'quick_service',    'in_service','Mansour Al-Dosari',   interval '-35 minutes',  interval '-12 minutes',  null),
  ('Hessa Al-Rashid',     '+966526667706', 'walk_in',     null,               'completed', 'Mansour Al-Dosari',   interval '-2 hours 40 minutes', interval '-2 hours 25 minutes', interval '-1 hour 55 minutes'),
  ('Majed Al-Amri',       '+966527778807', 'appointment', 'general_repair',   'completed', 'Mansour Al-Dosari',   interval '-4 hours 10 minutes', interval '-3 hours 50 minutes', interval '-3 hours 15 minutes'),
  ('Shatha Al-Mutairi',   '+966528889908', 'walk_in',     null,               'cancelled', null,                  interval '-50 minutes',  null,                    null)
) as v(customer_name, mobile, service_mode, wip_service_type, status, advisor_name, entry_offset, served_offset, closed_offset);
