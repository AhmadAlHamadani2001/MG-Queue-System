-- =========================================================
-- MG Queue System — v17 schema additions
-- Run AFTER schema-v16.sql.
--
-- Lets a manager/admin tune the "Call Next Customer" ranking per
-- branch instead of it being one hardcoded rule for everyone:
--   - which of Inquiry / Receive Vehicle gets priority first
--   - whether Quick Service is fairly distributed across advisors at all
--   - how many minutes a customer can wait before fairness is
--     overridden and served by whoever calls next
-- =========================================================

create table if not exists branch_queue_settings (
    branch_id               uuid primary key references branches(id) on delete cascade,
    priority_order          jsonb not null default '["inquiry","vehicle_delivery"]',
    fairness_enabled        boolean not null default true,
    fairness_override_minutes integer not null default 15,
    updated_by              text,
    updated_at              timestamptz not null default now()
);

alter table branch_queue_settings enable row level security;

drop policy if exists "public read queue settings" on branch_queue_settings;
create policy "public read queue settings" on branch_queue_settings for select using (true);
drop policy if exists "public insert queue settings" on branch_queue_settings;
create policy "public insert queue settings" on branch_queue_settings for insert with check (true);
drop policy if exists "public update queue settings" on branch_queue_settings;
create policy "public update queue settings" on branch_queue_settings for update using (true);
