-- =========================================================
-- MG Kingdom Queue — v6 schema additions
-- Run AFTER schema-v5.sql.
-- =========================================================

-- Once "Approval" is clicked on a line, it flips into approval mode
-- and stays there — Approve/Reject/Return replace the plain
-- "Approval" button from then on.
alter table request_payment_lines add column if not exists awaiting_approval boolean not null default false;

-- Who delegated this line to its current assignee. Set when Delegate
-- is used; read (and cleared) when "Done" is clicked, so the line
-- automatically reassigns back to whoever delegated it.
alter table request_payment_lines add column if not exists delegated_by text;
