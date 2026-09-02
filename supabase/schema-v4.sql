-- =========================================================
-- MG Kingdom Queue — v4 schema additions
-- Run AFTER schema-v3.sql.
-- =========================================================

-- Tag audit entries to a specific PAYMENT line too, mirroring
-- type_line_id — each payment type (Cash/Warranty/Internal) now gets
-- its own separate chat/history, same pattern as Approval/Delegation.
alter table request_audit_log add column if not exists payment_line_id uuid references request_payment_lines(id) on delete cascade;
create index if not exists idx_audit_payment_line on request_audit_log(payment_line_id, created_at);

-- Payment lines now support the same Start process -> Close request
-- flow as everything else, not just a binary open/closed.
alter table request_payment_lines drop constraint if exists request_payment_lines_status_check;
alter table request_payment_lines add constraint request_payment_lines_status_check
    check (status in ('open','in_progress','closed'));
