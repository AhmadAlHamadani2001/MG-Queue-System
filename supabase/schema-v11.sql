-- =========================================================
-- MG Kingdom Queue — v11 schema additions
-- Run AFTER schema-v10.sql.
-- =========================================================

-- ---------- 4 service types instead of 2 ----------
alter table queue_tickets drop constraint if exists queue_tickets_service_mode_check;
alter table queue_tickets add constraint queue_tickets_service_mode_check
    check (service_mode in ('appointment','walk_in','inquiry','spare_parts'));

-- ---------- manager/admin/Head Office can reserve a specific
-- customer for a specific advisor; that advisor's "Call Next
-- Customer" then serves this one first, ahead of the normal ranking ----------
alter table queue_tickets add column if not exists preassigned_advisor text;

-- ---------- new role for Parts Advisors, who run their own separate
-- Spare Parts queue that Service Advisors never see ----------
alter table app_users drop constraint if exists app_users_role_check;
alter table app_users add constraint app_users_role_check
    check (role in ('admin','manager','advisor','staff','parts_advisor'));

-- Reclassify anyone with a Parts-related title who was seeded as plain
-- "staff" (the original title→role mapping didn't have a parts case).
update app_users
set role = 'parts_advisor'
where role = 'staff' and title ilike '%parts%';

-- ---------- backfill branch routing for all 12 branches ----------
-- seed-app-users.sql originally only knew about 3 demo branches; now
-- that schema-v8.sql added the other 9, make sure everyone's login
-- routes to their real branch, not just Hiraa/North/Khaldiah staff.
update app_users u
set demo_branch_code = b.code
from branches b
where u.employee_branch = b.employee_branch
  and u.demo_branch_code is null;
