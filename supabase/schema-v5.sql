-- =========================================================
-- MG Kingdom Queue — v5 schema additions
-- Run AFTER schema-v4.sql.
-- =========================================================

-- Allow more than one line of the same payment type on a single WIP
-- (e.g. "Cash 1", "Cash 2") — previously limited to one of each type.
alter table request_payment_lines drop constraint if exists request_payment_lines_request_id_payment_type_key;

-- Note: request_type_lines (from schema-v3.sql) is no longer used by
-- the app — Approval/Delegation are now actions logged directly inside
-- each payment line's own chat instead of separate top-level threads.
-- Left in place rather than dropped, in case any historical data or
-- future use needs it; harmless to leave unused.
