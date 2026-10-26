-- v21: iPhone App Clip devices (Round 34).
-- One row per ticket (the customer's iPhone; latest device wins). Holds the APNs device token (lock-screen
-- alert) and the Live Activity push token (Dynamic Island updates).
-- last_position / last_status let the webhook skip pushes when nothing
-- changed for that customer. Safe to re-run.

create table if not exists ios_devices (
    id              uuid primary key default gen_random_uuid(),
    ticket_id       uuid not null unique references queue_tickets(id) on delete cascade,
    device_token    text,
    activity_token  text,
    last_position   int,
    last_status     text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

alter table ios_devices enable row level security;

-- Same demo-wide policies as push_subscriptions (schema-v19.sql): the
-- server routes use the anon key.
drop policy if exists "public read ios devices" on ios_devices;
create policy "public read ios devices" on ios_devices for select using (true);
drop policy if exists "public insert ios devices" on ios_devices;
create policy "public insert ios devices" on ios_devices for insert with check (true);
drop policy if exists "public update ios devices" on ios_devices;
create policy "public update ios devices" on ios_devices for update using (true);
drop policy if exists "public delete ios devices" on ios_devices;
create policy "public delete ios devices" on ios_devices for delete using (true);
