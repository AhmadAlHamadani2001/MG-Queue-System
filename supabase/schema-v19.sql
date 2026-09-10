-- =========================================================
-- MG Queue System — v19 schema additions
-- Run AFTER schema-v18.sql.
--
-- Stores browser push subscriptions so a server-side function can
-- send a real system notification when a ticket is called — this
-- works even if the customer's tab is fully closed or backgrounded,
-- unlike everything built so far which only worked while the tab's
-- JavaScript was actually still running.
-- =========================================================

create table if not exists push_subscriptions (
    id          uuid primary key default gen_random_uuid(),
    ticket_id   uuid not null references queue_tickets(id) on delete cascade,
    mobile      text not null,
    endpoint    text not null unique,
    p256dh      text not null,
    auth        text not null,
    created_at  timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_ticket on push_subscriptions(ticket_id);

alter table push_subscriptions enable row level security;

drop policy if exists "public read push subscriptions" on push_subscriptions;
create policy "public read push subscriptions" on push_subscriptions for select using (true);
drop policy if exists "public insert push subscriptions" on push_subscriptions;
create policy "public insert push subscriptions" on push_subscriptions for insert with check (true);
drop policy if exists "public update push subscriptions" on push_subscriptions;
create policy "public update push subscriptions" on push_subscriptions for update using (true);
drop policy if exists "public delete push subscriptions" on push_subscriptions;
create policy "public delete push subscriptions" on push_subscriptions for delete using (true);
