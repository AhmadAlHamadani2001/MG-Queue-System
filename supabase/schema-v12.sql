-- =========================================================
-- MG Kingdom Queue — v12 schema additions
-- Run AFTER schema-v11.sql.
-- =========================================================

-- When a manager assigns a waiting customer to a specific advisor,
-- "urgent" decides how: true = jump straight to the front of that
-- advisor's next call (bypasses the ranking entirely); false = stays
-- in its normal queue position, but only that advisor may serve it
-- when its turn naturally comes up.
alter table queue_tickets add column if not exists preassign_urgent boolean not null default false;
