-- =========================================================
-- Migration: add wip_number to queue_tickets
-- Run this once in Supabase SQL Editor if you already ran
-- schema.sql before this column existed.
-- Safe to run multiple times (IF NOT EXISTS).
-- =========================================================

alter table queue_tickets add column if not exists wip_number text;
