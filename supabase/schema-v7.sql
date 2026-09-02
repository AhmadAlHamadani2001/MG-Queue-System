-- =========================================================
-- MG Kingdom Queue — v7 schema additions
-- Run AFTER schema-v6.sql.
-- =========================================================

-- Who clicked "Approval" and picked the approver — needed so "Return"
-- can reassign the line back to them, and so they (not just the
-- approver) are allowed to reassign/delegate the line.
alter table request_payment_lines add column if not exists approval_requested_by text;

-- Which branch a request was created from — lets "New Request" warn
-- when the same WIP number already has a record in the same branch.
alter table requests add column if not exists branch text;
