-- =========================================================
-- MG Queue System — v18 schema additions
-- Run AFTER schema-v17.sql.
--
-- Adds a "Hold" status — distinct from No Show — for a customer who
-- was called but hasn't shown up yet. Held tickets are reactivatable
-- (by the customer via /track, or manually by an advisor) for 24
-- hours from when they were held; after that they simply stop
-- appearing as reactivatable (enforced by filtering on held_at at
-- read/action time, no background job needed).
-- =========================================================

alter table queue_tickets drop constraint if exists queue_tickets_status_check;
alter table queue_tickets add constraint queue_tickets_status_check
    check (status in ('waiting','called','in_service','completed','no_show','cancelled','held'));

alter table queue_tickets add column if not exists held_at timestamptz;

-- Set when a ticket is reactivated from hold — lets the ranking give
-- it elevated priority over the branch's normal tier order, since
-- this customer already made it partway through once.
alter table queue_tickets add column if not exists was_held boolean not null default false;
