-- v22: WhatsApp turn alerts (Round 35).
-- The customer taps "Notify me on WhatsApp" and sends the pre-filled
-- message. That opens Meta's free 24h customer-service window, so the
-- server can reply for free when the ticket is called.
-- One row per ticket. Safe to re-run.

create table if not exists whatsapp_subscriptions (
    id               uuid primary key default gen_random_uuid(),
    ticket_id        uuid not null unique references queue_tickets(id) on delete cascade,
    wa_id            text not null,          -- customer's WhatsApp number, e.g. 9665XXXXXXXX
    last_inbound_at  timestamptz not null default now(),  -- start of the free 24h window
    notified_at      timestamptz,            -- when the "your turn" message was sent
    created_at       timestamptz not null default now()
);

alter table whatsapp_subscriptions enable row level security;

-- Same demo-wide policies as push_subscriptions (schema-v19.sql): the
-- server routes use the anon key.
drop policy if exists "public read whatsapp subscriptions" on whatsapp_subscriptions;
create policy "public read whatsapp subscriptions" on whatsapp_subscriptions for select using (true);
drop policy if exists "public insert whatsapp subscriptions" on whatsapp_subscriptions;
create policy "public insert whatsapp subscriptions" on whatsapp_subscriptions for insert with check (true);
drop policy if exists "public update whatsapp subscriptions" on whatsapp_subscriptions;
create policy "public update whatsapp subscriptions" on whatsapp_subscriptions for update using (true);
drop policy if exists "public delete whatsapp subscriptions" on whatsapp_subscriptions;
create policy "public delete whatsapp subscriptions" on whatsapp_subscriptions for delete using (true);

-- Lets the tracking page flip to "WhatsApp alerts on" live.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'whatsapp_subscriptions'
  ) then
    alter publication supabase_realtime add table whatsapp_subscriptions;
  end if;
end $$;
