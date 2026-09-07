-- =========================================================
-- MG Queue System — reset operational data before go-live
--
-- Run this ONCE in Supabase SQL Editor when you're ready to start
-- using the system for real, to clear out everything created during
-- testing.
--
-- This clears:
--   - queue_tickets            (every test/demo customer ticket)
--   - requests                  (every test request, cascades to its
--                                payment lines, type lines, and audit log)
--   - form_submissions          (every test form fill/download)
--
-- This does NOT touch:
--   - branches                  your real branch list
--   - employees                 your real staff directory
--   - app_users                 staff logins/passwords/roles
--   - form_templates             your form designs
--
-- Safe to run more than once (e.g. if you keep testing a bit longer
-- and want another clean slate before the real launch date).
-- =========================================================

truncate table queue_tickets restart identity;

truncate table request_audit_log, request_payment_lines, request_type_lines, requests
  restart identity cascade;

truncate table form_submissions restart identity;
